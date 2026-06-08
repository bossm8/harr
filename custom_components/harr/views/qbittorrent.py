"""qBittorrent proxy view with API token authentication (≥ v5.2.0)."""
from __future__ import annotations

import logging

import aiohttp
from aiohttp import web

from homeassistant.components.http import HomeAssistantView, KEY_HASS_USER

from ..const import (
    CONF_ADMIN_ONLY,
    CONF_QBT_API_KEY,
    CONF_QBT_URL,
    CONF_QBT_VERIFY_SSL,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)


class QBittorrentProxyView(HomeAssistantView):
    """Proxy /api/harr/qbittorrent/{path} → configured qBittorrent instance.

    Uses stateless API token authentication via Authorization: Bearer header.
    """

    url = "/api/harr/qbittorrent/{path:.*}"
    name = "api:harr:qbittorrent"
    requires_auth = True

    async def _proxy(
        self,
        request: web.Request,
        path: str,
        method: str,
        body: bytes | None = None,
    ) -> web.Response:
        """Proxy the request to qBittorrent with Bearer token auth."""
        hass = request.app["hass"]
        config: dict = hass.data.get(DOMAIN, {})

        if config.get(CONF_ADMIN_ONLY):
            user = request.get(KEY_HASS_USER)
            if not user or not user.is_admin:
                return web.Response(
                    status=403,
                    content_type="application/json",
                    text='{"error": "Admin access required"}',
                )

        base_url = config.get(CONF_QBT_URL, "").rstrip("/")
        if not base_url:
            return web.Response(
                status=503,
                content_type="application/json",
                text='{"error": "qBittorrent not configured"}',
            )

        verify_ssl = config.get(CONF_QBT_VERIFY_SSL, True)
        api_key = config.get(CONF_QBT_API_KEY, "")

        target_url = f"{base_url}/{path.lstrip('/')}" if path else base_url
        params = dict(request.rel_url.query)

        headers = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        ct = request.headers.get("Content-Type")
        if ct:
            headers["Content-Type"] = ct

        try:
            async with aiohttp.ClientSession(
                connector=aiohttp.TCPConnector(ssl=None if verify_ssl else False),
            ) as session:
                async with session.request(
                    method,
                    target_url,
                    params=params,
                    data=body,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as upstream:
                    content_type = upstream.content_type or "application/json"
                    response_body = await upstream.read()
                    return web.Response(
                        status=upstream.status,
                        body=response_body,
                        content_type=content_type,
                    )
        except aiohttp.ClientConnectorError as err:
            _LOGGER.error("Cannot connect to qBittorrent: %s", err)
            return web.Response(
                status=502,
                content_type="application/json",
                text=f'{{"error": "Cannot connect to qBittorrent: {err}"}}',
            )
        except aiohttp.ClientError as err:
            _LOGGER.error("qBittorrent proxy error: %s", err)
            return web.Response(
                status=502,
                content_type="application/json",
                text=f'{{"error": "Proxy error: {err}"}}',
            )

    async def get(self, request: web.Request, path: str = "") -> web.Response:
        return await self._proxy(request, path, "GET")

    async def post(self, request: web.Request, path: str = "") -> web.Response:
        body = await request.read()
        return await self._proxy(request, path, "POST", body)

    async def delete(self, request: web.Request, path: str = "") -> web.Response:
        return await self._proxy(request, path, "DELETE")

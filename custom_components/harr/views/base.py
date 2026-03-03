"""Generic proxy view base class for Harr."""
from __future__ import annotations

import logging
from typing import Any

import aiohttp
from aiohttp import web
from aiohttp.web_exceptions import HTTPBadGateway, HTTPServiceUnavailable

from homeassistant.components.http import HomeAssistantView, KEY_HASS_USER
from homeassistant.helpers.aiohttp_client import async_create_clientsession

from ..const import CONF_ADMIN_ONLY, DOMAIN

_LOGGER = logging.getLogger(__name__)


class GenericProxyView(HomeAssistantView):
    """Proxy HTTP requests to a configured upstream service.

    Subclasses must set:
      - url            — aiohttp route pattern, e.g. "/api/harr/radarr/{path:.*}"
      - name           — unique name, e.g. "api:harr:radarr"
      - base_url_key   — key in hass.data[DOMAIN] for the service base URL
      - verify_ssl_key — key in hass.data[DOMAIN] for the boolean verify_ssl flag

    Subclasses may override:
      - _build_headers(config)  — return dict of extra headers to add to upstream request
      - _build_params(config, params) — return dict of extra query params to add
    """

    requires_auth = True

    base_url_key: str = ""
    verify_ssl_key: str = ""

    def _build_headers(self, config: dict) -> dict[str, str]:
        """Return extra headers to inject into the upstream request."""
        return {}

    def _build_params(self, config: dict, params: dict) -> dict:
        """Return extra query params to inject into the upstream request."""
        return {}

    async def _proxy(
        self,
        request: web.Request,
        path: str,
        method: str,
        body: bytes | None = None,
    ) -> web.Response:
        """Proxy the request to the upstream service."""
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

        base_url = config.get(self.base_url_key, "").rstrip("/")
        if not base_url:
            return web.Response(
                status=503,
                content_type="application/json",
                text='{"error": "Service not configured"}',
            )

        verify_ssl: bool = config.get(self.verify_ssl_key, True)
        target_url = f"{base_url}/{path.lstrip('/')}" if path else base_url

        # Merge query params from the original request with any extra service params
        params = dict(request.rel_url.query)
        params.update(self._build_params(config, params))

        # Build upstream headers: forward Content-Type, add service auth
        headers = {}
        if request.content_type and request.content_type != "application/x-www-form-urlencoded":
            headers["Content-Type"] = request.content_type
        headers.update(self._build_headers(config))

        session = async_create_clientsession(hass, verify_ssl=verify_ssl)
        try:
            async with session.request(
                method,
                target_url,
                headers=headers,
                params=params,
                data=body,
                timeout=aiohttp.ClientTimeout(total=30),
                allow_redirects=True,
            ) as upstream:
                content_type = upstream.content_type or "application/json"
                response_body = await upstream.read()
                return web.Response(
                    status=upstream.status,
                    body=response_body,
                    content_type=content_type,
                )
        except aiohttp.ClientConnectorError as err:
            _LOGGER.error("Cannot connect to %s: %s", target_url, err)
            return web.Response(
                status=502,
                content_type="application/json",
                text=f'{{"error": "Cannot connect to upstream service: {err}"}}',
            )
        except aiohttp.ClientError as err:
            _LOGGER.error("Proxy error for %s: %s", target_url, err)
            return web.Response(
                status=502,
                content_type="application/json",
                text=f'{{"error": "Proxy error: {err}"}}',
            )
        finally:
            await session.close()

    async def get(self, request: web.Request, path: str = "") -> web.Response:
        return await self._proxy(request, path, "GET")

    async def post(self, request: web.Request, path: str = "") -> web.Response:
        body = await request.read()
        return await self._proxy(request, path, "POST", body)

    async def put(self, request: web.Request, path: str = "") -> web.Response:
        body = await request.read()
        return await self._proxy(request, path, "PUT", body)

    async def delete(self, request: web.Request, path: str = "") -> web.Response:
        return await self._proxy(request, path, "DELETE")

    async def patch(self, request: web.Request, path: str = "") -> web.Response:
        body = await request.read()
        return await self._proxy(request, path, "PATCH", body)

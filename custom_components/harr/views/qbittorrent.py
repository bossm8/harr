"""qBittorrent proxy view with cookie-based session management."""
from __future__ import annotations

import logging

import aiohttp
from aiohttp import web

from homeassistant.components.http import HomeAssistantView, KEY_HASS_USER
from homeassistant.helpers.aiohttp_client import async_create_clientsession

from ..const import (
    CONF_ADMIN_ONLY,
    CONF_QBT_PASSWORD,
    CONF_QBT_URL,
    CONF_QBT_USERNAME,
    CONF_QBT_VERIFY_SSL,
    DATA_QBT_COOKIE,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)


class QBittorrentProxyView(HomeAssistantView):
    """Proxy /api/harr/qbittorrent/{path} → configured qBittorrent instance.

    qBittorrent uses cookie-based session authentication. On the first request
    (or when a 403 is received), we POST to /api/v2/auth/login to obtain a
    SID cookie, then cache it in hass.data[DOMAIN][DATA_QBT_COOKIE].
    """

    url = "/api/harr/qbittorrent/{path:.*}"
    name = "api:harr:qbittorrent"
    requires_auth = True

    async def _get_cookie(self, hass, config: dict) -> str | None:
        """Authenticate and return the SID cookie value."""
        base_url = config.get(CONF_QBT_URL, "").rstrip("/")
        verify_ssl = config.get(CONF_QBT_VERIFY_SSL, True)
        login_url = f"{base_url}/api/v2/auth/login"

        session = async_create_clientsession(hass, verify_ssl=verify_ssl)
        try:
            async with session.post(
                login_url,
                data={
                    "username": config.get(CONF_QBT_USERNAME, ""),
                    "password": config.get(CONF_QBT_PASSWORD, ""),
                },
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                body = await resp.text()
                if body.strip() == "Ok.":
                    sid = resp.cookies.get("SID")
                    if sid:
                        return sid.value
                _LOGGER.error("qBittorrent login failed: %s", body)
                return None
        except aiohttp.ClientError as err:
            _LOGGER.error("qBittorrent login error: %s", err)
            return None
        finally:
            await session.close()

    async def _proxy(
        self,
        request: web.Request,
        path: str,
        method: str,
        body: bytes | None = None,
        retry: bool = True,
    ) -> web.Response:
        """Proxy the request, re-authenticating on 403."""
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

        # Retrieve or fetch session cookie
        sid = config.get(DATA_QBT_COOKIE)
        if not sid:
            sid = await self._get_cookie(hass, config)
            if sid:
                hass.data[DOMAIN][DATA_QBT_COOKIE] = sid
            else:
                return web.Response(
                    status=401,
                    content_type="application/json",
                    text='{"error": "qBittorrent authentication failed"}',
                )

        target_url = f"{base_url}/{path.lstrip('/')}" if path else base_url
        params = dict(request.rel_url.query)

        session = async_create_clientsession(hass, verify_ssl=verify_ssl)
        try:
            cookie_jar = aiohttp.CookieJar(unsafe=True)
            cookie_jar.update_cookies({"SID": sid})
            async with aiohttp.ClientSession(
                cookie_jar=cookie_jar,
                connector=aiohttp.TCPConnector(ssl=None if verify_ssl else False),
            ) as auth_session:
                headers = {}
                ct = request.headers.get("Content-Type")
                if ct:
                    headers["Content-Type"] = ct

                async with auth_session.request(
                    method,
                    target_url,
                    params=params,
                    data=body,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as upstream:
                    if upstream.status == 403 and retry:
                        # Session expired — re-authenticate once
                        hass.data[DOMAIN].pop(DATA_QBT_COOKIE, None)
                        return await self._proxy(request, path, method, body, retry=False)

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
        finally:
            await session.close()

    async def get(self, request: web.Request, path: str = "") -> web.Response:
        return await self._proxy(request, path, "GET")

    async def post(self, request: web.Request, path: str = "") -> web.Response:
        body = await request.read()
        return await self._proxy(request, path, "POST", body)

    async def delete(self, request: web.Request, path: str = "") -> web.Response:
        return await self._proxy(request, path, "DELETE")

"""Tests for views/qbittorrent.py."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import aiohttp
import pytest

from custom_components.harr.const import (
    CONF_ADMIN_ONLY,
    CONF_QBT_PASSWORD,
    CONF_QBT_URL,
    CONF_QBT_USERNAME,
    CONF_QBT_VERIFY_SSL,
    DATA_QBT_COOKIE,
    DOMAIN,
)
from custom_components.harr.views.qbittorrent import QBittorrentProxyView


def _make_hass(config):
    hass = MagicMock()
    hass.data = {DOMAIN: dict(config)}
    return hass


def _make_request(hass, query=None, content_type="application/json", user=None):
    request = MagicMock()
    request.app = {"hass": hass}
    request.rel_url.query = query or {}
    request.content_type = content_type
    request.headers = MagicMock()
    request.headers.get = MagicMock(return_value=None)
    from homeassistant.components.http import KEY_HASS_USER
    request.get = MagicMock(return_value=user)
    return request


def _qbt_config(sid=None):
    cfg = {
        CONF_QBT_URL: "http://qbt",
        CONF_QBT_USERNAME: "admin",
        CONF_QBT_PASSWORD: "password",
        CONF_QBT_VERIFY_SSL: True,
        CONF_ADMIN_ONLY: False,
    }
    if sid:
        cfg[DATA_QBT_COOKIE] = sid
    return cfg


def _login_response(body="Ok.", sid="SID123", ok=True):
    """Create mock login POST response."""
    mock_sid = MagicMock()
    mock_sid.value = sid

    resp = AsyncMock()
    resp.ok = ok
    resp.text = AsyncMock(return_value=body)
    resp.cookies = {
        "SID": mock_sid,
    } if sid else {}

    cm = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=resp)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


def _proxy_response(status=200, body=b'{"result":[]}', content_type="application/json"):
    resp = AsyncMock()
    resp.status = status
    resp.content_type = content_type
    resp.read = AsyncMock(return_value=body)
    cm = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=resp)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


class TestQBittorrentGetCookie:
    @pytest.mark.asyncio
    async def test_successful_login_returns_sid(self):
        config = _qbt_config()
        hass = _make_hass(config)

        mock_session = MagicMock()
        mock_session.post = MagicMock(return_value=_login_response("Ok.", "NEWSID"))

        view = QBittorrentProxyView()
        with patch(
            "custom_components.harr.views.qbittorrent.async_get_clientsession",
            return_value=mock_session,
        ):
            sid = await view._get_cookie(hass, config)

        assert sid == "NEWSID"

    @pytest.mark.asyncio
    async def test_failed_login_returns_none(self):
        config = _qbt_config()
        hass = _make_hass(config)

        mock_session = MagicMock()
        mock_session.post = MagicMock(return_value=_login_response("Fails.", sid=None))

        view = QBittorrentProxyView()
        with patch(
            "custom_components.harr.views.qbittorrent.async_get_clientsession",
            return_value=mock_session,
        ):
            sid = await view._get_cookie(hass, config)

        assert sid is None

    @pytest.mark.asyncio
    async def test_client_error_returns_none(self):
        config = _qbt_config()
        hass = _make_hass(config)

        mock_session = MagicMock()
        mock_session.post = MagicMock(side_effect=aiohttp.ClientError("refused"))

        view = QBittorrentProxyView()
        with patch(
            "custom_components.harr.views.qbittorrent.async_get_clientsession",
            return_value=mock_session,
        ):
            sid = await view._get_cookie(hass, config)

        assert sid is None


class TestQBittorrentProxy:
    @pytest.mark.asyncio
    async def test_not_configured_returns_503(self):
        hass = _make_hass({CONF_QBT_URL: "", CONF_ADMIN_ONLY: False})
        request = _make_request(hass)

        view = QBittorrentProxyView()
        response = await view._proxy(request, "api/v2/torrents/info", "GET")
        assert response.status == 503

    @pytest.mark.asyncio
    async def test_cached_sid_used_for_request(self):
        hass = _make_hass(_qbt_config(sid="CACHED_SID"))
        request = _make_request(hass)

        proxy_cm = _proxy_response(200)

        mock_session_instance = MagicMock()
        mock_session_instance.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session_instance.__aexit__ = AsyncMock(return_value=False)
        mock_session_instance.request = MagicMock(return_value=proxy_cm)

        view = QBittorrentProxyView()
        with patch("aiohttp.ClientSession", return_value=mock_session_instance):
            with patch("aiohttp.CookieJar") as mock_jar_cls:
                mock_jar = MagicMock()
                mock_jar_cls.return_value = mock_jar
                response = await view._proxy(request, "api/v2/torrents/info", "GET")

        assert response.status == 200
        mock_jar.update_cookies.assert_called_with({"SID": "CACHED_SID"})

    @pytest.mark.asyncio
    async def test_no_sid_fetches_new_cookie(self):
        hass = _make_hass(_qbt_config())  # no cached SID
        request = _make_request(hass)

        proxy_cm = _proxy_response(200)
        mock_session_instance = MagicMock()
        mock_session_instance.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session_instance.__aexit__ = AsyncMock(return_value=False)
        mock_session_instance.request = MagicMock(return_value=proxy_cm)

        view = QBittorrentProxyView()
        with patch.object(view, "_get_cookie", return_value="NEW_SID") as mock_get:
            with patch("aiohttp.ClientSession", return_value=mock_session_instance):
                with patch("aiohttp.CookieJar"):
                    response = await view._proxy(request, "test", "GET")

        mock_get.assert_called_once()
        assert hass.data[DOMAIN][DATA_QBT_COOKIE] == "NEW_SID"
        assert response.status == 200

    @pytest.mark.asyncio
    async def test_auth_failure_returns_401(self):
        hass = _make_hass(_qbt_config())
        request = _make_request(hass)

        view = QBittorrentProxyView()
        with patch.object(view, "_get_cookie", return_value=None):
            response = await view._proxy(request, "test", "GET")

        assert response.status == 401

    @pytest.mark.asyncio
    async def test_403_triggers_reauth_and_retry(self):
        hass = _make_hass(_qbt_config(sid="OLD_SID"))
        request = _make_request(hass)

        # First call returns 403, second call returns 200
        call_count = 0
        responses = [_proxy_response(403), _proxy_response(200)]

        async def proxy_side_effect(req, path, method, body=None, retry=True):
            nonlocal call_count
            result = responses[call_count]
            call_count += 1
            if call_count == 1 and retry:
                # Simulate the real re-auth behavior
                hass.data[DOMAIN].pop(DATA_QBT_COOKIE, None)
                return await proxy_side_effect(req, path, method, body, retry=False)
            return MagicMock(status=200)

        view = QBittorrentProxyView()
        with patch.object(view, "_get_cookie", return_value="NEW_SID") as mock_get_cookie:
            proxy_cm_403 = _proxy_response(403)

            mock_session_instance = MagicMock()
            mock_session_instance.__aenter__ = AsyncMock(return_value=mock_session_instance)
            mock_session_instance.__aexit__ = AsyncMock(return_value=False)
            # Both the initial and retry requests go through the same mock session
            mock_session_instance.request = MagicMock(return_value=proxy_cm_403)

            with patch("aiohttp.ClientSession", return_value=mock_session_instance):
                with patch("aiohttp.CookieJar"):
                    await view._proxy(request, "test", "GET", retry=True)

        # Re-authentication was triggered: _get_cookie was called to get a new SID
        mock_get_cookie.assert_called_once()
        # The new SID was stored after re-auth
        assert hass.data[DOMAIN][DATA_QBT_COOKIE] == "NEW_SID"

    @pytest.mark.asyncio
    async def test_connector_error_returns_502(self):
        hass = _make_hass(_qbt_config(sid="SID"))
        request = _make_request(hass)

        mock_session_instance = MagicMock()
        mock_session_instance.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session_instance.__aexit__ = AsyncMock(return_value=False)
        mock_session_instance.request = MagicMock(
            side_effect=aiohttp.ClientConnectorError(MagicMock(), MagicMock())
        )

        view = QBittorrentProxyView()
        with patch("aiohttp.ClientSession", return_value=mock_session_instance):
            with patch("aiohttp.CookieJar"):
                response = await view._proxy(request, "test", "GET")

        assert response.status == 502

    @pytest.mark.asyncio
    async def test_admin_only_non_admin_returns_403(self):
        config = {**_qbt_config(), CONF_ADMIN_ONLY: True}
        hass = _make_hass(config)
        non_admin = MagicMock()
        non_admin.is_admin = False
        request = _make_request(hass, user=non_admin)

        view = QBittorrentProxyView()
        response = await view._proxy(request, "test", "GET")
        assert response.status == 403

"""Tests for views/qbittorrent.py."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import aiohttp
import pytest

from custom_components.harr.const import (
    CONF_ADMIN_ONLY,
    CONF_QBT_API_KEY,
    CONF_QBT_URL,
    CONF_QBT_VERIFY_SSL,
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


def _qbt_config(token="qbt_testtoken123456789012345678"):
    return {
        CONF_QBT_URL: "http://qbt",
        CONF_QBT_API_KEY: token,
        CONF_QBT_VERIFY_SSL: True,
        CONF_ADMIN_ONLY: False,
    }


def _proxy_response(status=200, body=b'{"result":[]}', content_type="application/json"):
    resp = AsyncMock()
    resp.status = status
    resp.content_type = content_type
    resp.read = AsyncMock(return_value=body)
    cm = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=resp)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm


class TestQBittorrentProxy:
    @pytest.mark.asyncio
    async def test_not_configured_returns_503(self):
        hass = _make_hass({CONF_QBT_URL: "", CONF_ADMIN_ONLY: False})
        request = _make_request(hass)

        view = QBittorrentProxyView()
        response = await view._proxy(request, "api/v2/torrents/info", "GET")
        assert response.status == 503

    @pytest.mark.asyncio
    async def test_token_injected_in_request(self):
        hass = _make_hass(_qbt_config(token="qbt_mytoken"))
        request = _make_request(hass)

        proxy_cm = _proxy_response(200)
        mock_session_instance = MagicMock()
        mock_session_instance.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session_instance.__aexit__ = AsyncMock(return_value=False)
        mock_session_instance.request = MagicMock(return_value=proxy_cm)

        view = QBittorrentProxyView()
        with patch("aiohttp.ClientSession", return_value=mock_session_instance):
            response = await view._proxy(request, "api/v2/torrents/info", "GET")

        assert response.status == 200
        call_kwargs = mock_session_instance.request.call_args
        headers = call_kwargs[1]["headers"]
        assert headers.get("Authorization") == "Bearer qbt_mytoken"

    @pytest.mark.asyncio
    async def test_no_token_proxies_without_auth_header(self):
        hass = _make_hass(_qbt_config(token=""))
        request = _make_request(hass)

        proxy_cm = _proxy_response(401)
        mock_session_instance = MagicMock()
        mock_session_instance.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session_instance.__aexit__ = AsyncMock(return_value=False)
        mock_session_instance.request = MagicMock(return_value=proxy_cm)

        view = QBittorrentProxyView()
        with patch("aiohttp.ClientSession", return_value=mock_session_instance):
            response = await view._proxy(request, "api/v2/torrents/info", "GET")

        call_kwargs = mock_session_instance.request.call_args
        headers = call_kwargs[1]["headers"]
        assert "Authorization" not in headers
        # qBittorrent upstream responds with 401 — proxy passes it through
        assert response.status == 401

    @pytest.mark.asyncio
    async def test_connector_error_returns_502(self):
        hass = _make_hass(_qbt_config())
        request = _make_request(hass)

        mock_session_instance = MagicMock()
        mock_session_instance.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session_instance.__aexit__ = AsyncMock(return_value=False)
        mock_session_instance.request = MagicMock(
            side_effect=aiohttp.ClientConnectorError(MagicMock(), MagicMock())
        )

        view = QBittorrentProxyView()
        with patch("aiohttp.ClientSession", return_value=mock_session_instance):
            response = await view._proxy(request, "test", "GET")

        assert response.status == 502

    @pytest.mark.asyncio
    async def test_client_error_returns_502(self):
        hass = _make_hass(_qbt_config())
        request = _make_request(hass)

        mock_session_instance = MagicMock()
        mock_session_instance.__aenter__ = AsyncMock(return_value=mock_session_instance)
        mock_session_instance.__aexit__ = AsyncMock(return_value=False)
        mock_session_instance.request = MagicMock(
            side_effect=aiohttp.ClientError("generic error")
        )

        view = QBittorrentProxyView()
        with patch("aiohttp.ClientSession", return_value=mock_session_instance):
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

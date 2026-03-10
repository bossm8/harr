"""Tests for views/base.py GenericProxyView."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock

import aiohttp
import pytest

from custom_components.harr.const import (
    CONF_ADMIN_ONLY,
    CONF_RADARR_API_KEY,
    CONF_RADARR_URL,
    CONF_RADARR_VERIFY_SSL,
    DOMAIN,
)
from custom_components.harr.views.base import GenericProxyView
from custom_components.harr.views.radarr import RadarrProxyView


def _make_request(hass, path="/api/harr/radarr/test", content_type="application/json", query=None, user=None):
    """Create a mock aiohttp request."""
    request = MagicMock()
    request.app = {"hass": hass}
    request.rel_url.query = query or {}
    request.content_type = content_type
    request.headers = {}
    request.path = path
    # Simulate the HA user attached to the request
    from homeassistant.components.http import KEY_HASS_USER
    request.get = MagicMock(return_value=user)
    return request


def _make_hass(config=None):
    """Create a minimal mock hass with optional domain config."""
    hass = MagicMock()
    hass.data = {DOMAIN: config or {}}
    return hass


def _make_upstream_response(status=200, body=b'{"ok":true}', content_type="application/json"):
    """Create a mock upstream aiohttp response context manager."""
    resp = AsyncMock()
    resp.status = status
    resp.content_type = content_type
    resp.read = AsyncMock(return_value=body)
    cm = AsyncMock()
    cm.__aenter__ = AsyncMock(return_value=resp)
    cm.__aexit__ = AsyncMock(return_value=False)
    return cm, resp


class TestGenericProxyViewHeaders:
    def test_radarr_build_headers_injects_api_key(self):
        view = RadarrProxyView()
        config = {CONF_RADARR_API_KEY: "secret"}
        headers = view._build_headers(config)
        assert headers.get("X-Api-Key") == "secret"

    def test_base_build_headers_returns_empty(self):
        view = GenericProxyView()
        assert view._build_headers({}) == {}

    def test_base_build_params_returns_empty(self):
        view = GenericProxyView()
        assert view._build_params({}, {}) == {}


class TestGenericProxyViewServiceNotConfigured:
    @pytest.mark.asyncio
    async def test_returns_503_when_no_url(self):
        hass = _make_hass({CONF_RADARR_URL: "", CONF_ADMIN_ONLY: False})
        request = _make_request(hass)

        view = RadarrProxyView()
        response = await view._proxy(request, "api/v3/movie", "GET")
        assert response.status == 503

    @pytest.mark.asyncio
    async def test_returns_503_when_url_missing_from_config(self):
        hass = _make_hass({})
        request = _make_request(hass)

        view = RadarrProxyView()
        response = await view._proxy(request, "api/v3/movie", "GET")
        assert response.status == 503


class TestGenericProxyViewAdminOnly:
    @pytest.mark.asyncio
    async def test_non_admin_user_gets_403(self):
        hass = _make_hass({
            CONF_RADARR_URL: "http://radarr",
            CONF_RADARR_API_KEY: "key",
            CONF_RADARR_VERIFY_SSL: True,
            CONF_ADMIN_ONLY: True,
        })
        non_admin_user = MagicMock()
        non_admin_user.is_admin = False
        request = _make_request(hass, user=non_admin_user)

        view = RadarrProxyView()
        response = await view._proxy(request, "test", "GET")
        assert response.status == 403

    @pytest.mark.asyncio
    async def test_admin_user_passes_through(self):
        hass = _make_hass({
            CONF_RADARR_URL: "http://radarr",
            CONF_RADARR_API_KEY: "key",
            CONF_RADARR_VERIFY_SSL: True,
            CONF_ADMIN_ONLY: True,
        })
        admin_user = MagicMock()
        admin_user.is_admin = True
        request = _make_request(hass, user=admin_user)

        cm, _ = _make_upstream_response(200)
        mock_session = MagicMock()
        mock_session.request = MagicMock(return_value=cm)

        view = RadarrProxyView()
        with patch("custom_components.harr.views.base.async_get_clientsession", return_value=mock_session):
            response = await view._proxy(request, "test", "GET")

        assert response.status == 200

    @pytest.mark.asyncio
    async def test_no_admin_restriction_allows_anyone(self):
        hass = _make_hass({
            CONF_RADARR_URL: "http://radarr",
            CONF_RADARR_API_KEY: "key",
            CONF_RADARR_VERIFY_SSL: True,
            CONF_ADMIN_ONLY: False,
        })
        request = _make_request(hass, user=None)

        cm, _ = _make_upstream_response(200)
        mock_session = MagicMock()
        mock_session.request = MagicMock(return_value=cm)

        view = RadarrProxyView()
        with patch("custom_components.harr.views.base.async_get_clientsession", return_value=mock_session):
            response = await view._proxy(request, "test", "GET")

        assert response.status == 200


class TestGenericProxyViewForwarding:
    @pytest.mark.asyncio
    async def test_get_proxies_and_returns_upstream_body(self):
        hass = _make_hass({
            CONF_RADARR_URL: "http://radarr",
            CONF_RADARR_API_KEY: "key",
            CONF_RADARR_VERIFY_SSL: True,
            CONF_ADMIN_ONLY: False,
        })
        request = _make_request(hass)
        cm, _ = _make_upstream_response(200, b'[{"id":1}]', "application/json")
        mock_session = MagicMock()
        mock_session.request = MagicMock(return_value=cm)

        view = RadarrProxyView()
        with patch("custom_components.harr.views.base.async_get_clientsession", return_value=mock_session):
            response = await view.get(request, "api/v3/movie")

        assert response.status == 200
        assert response.body == b'[{"id":1}]'

    @pytest.mark.asyncio
    async def test_upstream_headers_injected(self):
        hass = _make_hass({
            CONF_RADARR_URL: "http://radarr",
            CONF_RADARR_API_KEY: "secret-key",
            CONF_RADARR_VERIFY_SSL: True,
            CONF_ADMIN_ONLY: False,
        })
        request = _make_request(hass)
        cm, _ = _make_upstream_response()
        mock_session = MagicMock()
        mock_session.request = MagicMock(return_value=cm)

        view = RadarrProxyView()
        with patch("custom_components.harr.views.base.async_get_clientsession", return_value=mock_session):
            await view.get(request, "test")

        call_kwargs = mock_session.request.call_args
        headers = call_kwargs.kwargs.get("headers") or call_kwargs[1].get("headers") or {}
        assert headers.get("X-Api-Key") == "secret-key"

    @pytest.mark.asyncio
    async def test_post_forwards_body(self):
        hass = _make_hass({
            CONF_RADARR_URL: "http://radarr",
            CONF_RADARR_API_KEY: "key",
            CONF_RADARR_VERIFY_SSL: True,
            CONF_ADMIN_ONLY: False,
        })
        request = _make_request(hass)
        request.read = AsyncMock(return_value=b'{"title":"test"}')
        cm, _ = _make_upstream_response(201)
        mock_session = MagicMock()
        mock_session.request = MagicMock(return_value=cm)

        view = RadarrProxyView()
        with patch("custom_components.harr.views.base.async_get_clientsession", return_value=mock_session):
            response = await view.post(request, "api/v3/movie")

        assert response.status == 201
        call_kwargs = mock_session.request.call_args
        data = call_kwargs.kwargs.get("data") or call_kwargs[1].get("data")
        assert data == b'{"title":"test"}'


class TestGenericProxyViewErrors:
    @pytest.mark.asyncio
    async def test_connector_error_returns_502(self):
        hass = _make_hass({
            CONF_RADARR_URL: "http://radarr",
            CONF_RADARR_API_KEY: "key",
            CONF_RADARR_VERIFY_SSL: True,
            CONF_ADMIN_ONLY: False,
        })
        request = _make_request(hass)
        mock_session = MagicMock()
        mock_session.request = MagicMock(side_effect=aiohttp.ClientConnectorError(
            MagicMock(), MagicMock()
        ))

        view = RadarrProxyView()
        with patch("custom_components.harr.views.base.async_get_clientsession", return_value=mock_session):
            response = await view.get(request, "test")

        assert response.status == 502

    @pytest.mark.asyncio
    async def test_client_error_returns_502(self):
        hass = _make_hass({
            CONF_RADARR_URL: "http://radarr",
            CONF_RADARR_API_KEY: "key",
            CONF_RADARR_VERIFY_SSL: True,
            CONF_ADMIN_ONLY: False,
        })
        request = _make_request(hass)
        mock_session = MagicMock()
        mock_session.request = MagicMock(side_effect=aiohttp.ClientError("generic error"))

        view = RadarrProxyView()
        with patch("custom_components.harr.views.base.async_get_clientsession", return_value=mock_session):
            response = await view.get(request, "test")

        assert response.status == 502

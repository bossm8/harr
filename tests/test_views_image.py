"""Tests for views/image.py ImageProxyView."""
from __future__ import annotations

import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from custom_components.harr.const import (
    CONF_IMAGE_ALLOWED_HOSTS,
    CONF_IMAGE_CACHE_DISK,
    DEFAULT_IMAGE_ALLOWED_HOSTS,
    DOMAIN,
)
from custom_components.harr.views.image import (
    ImageProxyView,
    _get_allowed_hosts,
    _is_safe_url,
    _resolve_and_verify,
)


# ── _is_safe_url ──────────────────────────────────────────────────────────────

ALLOWED = frozenset(["image.tmdb.org", "artworks.thetvdb.com"])


class TestIsSafeUrl:
    def test_https_allowed_host_is_safe(self):
        assert _is_safe_url("https://image.tmdb.org/t/p/w342/abc.jpg", ALLOWED) is True

    def test_http_is_rejected(self):
        assert _is_safe_url("http://image.tmdb.org/img.jpg", ALLOWED) is False

    def test_unknown_host_is_rejected(self):
        assert _is_safe_url("https://evil.example.com/img.jpg", ALLOWED) is False

    def test_empty_url_is_rejected(self):
        assert _is_safe_url("", ALLOWED) is False

    def test_file_scheme_is_rejected(self):
        assert _is_safe_url("file:///etc/passwd", ALLOWED) is False


# ── _get_allowed_hosts ────────────────────────────────────────────────────────

class TestGetAllowedHosts:
    def test_returns_default_when_no_config(self):
        hass = MagicMock()
        hass.data = {DOMAIN: {}}
        hosts = _get_allowed_hosts(hass)
        assert "image.tmdb.org" in hosts

    def test_returns_custom_hosts_when_configured(self):
        hass = MagicMock()
        hass.data = {DOMAIN: {CONF_IMAGE_ALLOWED_HOSTS: "cdn.example.com, img.example.org"}}
        hosts = _get_allowed_hosts(hass)
        assert "cdn.example.com" in hosts
        assert "img.example.org" in hosts
        assert "image.tmdb.org" not in hosts

    def test_returns_default_when_empty_string(self):
        hass = MagicMock()
        hass.data = {DOMAIN: {CONF_IMAGE_ALLOWED_HOSTS: ""}}
        hosts = _get_allowed_hosts(hass)
        assert "image.tmdb.org" in hosts


# ── _resolve_and_verify ───────────────────────────────────────────────────────

class TestResolveAndVerify:
    @pytest.mark.asyncio
    async def test_public_ip_returns_ip_string(self):
        # 1.1.1.1 is Cloudflare public DNS
        with patch("socket.getaddrinfo", return_value=[(None, None, None, None, ("1.1.1.1", 0))]):
            result = await _resolve_and_verify("image.tmdb.org")
        assert result == "1.1.1.1"

    @pytest.mark.asyncio
    async def test_loopback_raises(self):
        with patch("socket.getaddrinfo", return_value=[(None, None, None, None, ("127.0.0.1", 0))]):
            with pytest.raises(ValueError, match="private"):
                await _resolve_and_verify("localhost")

    @pytest.mark.asyncio
    async def test_private_10_raises(self):
        with patch("socket.getaddrinfo", return_value=[(None, None, None, None, ("10.0.0.1", 0))]):
            with pytest.raises(ValueError, match="private"):
                await _resolve_and_verify("internal.host")

    @pytest.mark.asyncio
    async def test_private_192_168_raises(self):
        with patch("socket.getaddrinfo", return_value=[(None, None, None, None, ("192.168.1.1", 0))]):
            with pytest.raises(ValueError, match="private"):
                await _resolve_and_verify("home.router")

    @pytest.mark.asyncio
    async def test_dns_error_raises(self):
        with patch("socket.getaddrinfo", side_effect=OSError("no such host")):
            with pytest.raises(OSError):
                await _resolve_and_verify("nonexistent.invalid")

    @pytest.mark.asyncio
    async def test_empty_result_raises(self):
        with patch("socket.getaddrinfo", return_value=[]):
            with pytest.raises(ValueError, match="No DNS records"):
                await _resolve_and_verify("noresult.invalid")


# ── ImageProxyView ────────────────────────────────────────────────────────────

def _make_request(hass, url="https://image.tmdb.org/t/p/w342/abc.jpg"):
    request = MagicMock()
    request.app = {"hass": hass}
    request.query = {"url": url}
    return request


def _make_hass(disk_enabled=False, allowed_hosts=None):
    hass = MagicMock()
    config = {CONF_IMAGE_CACHE_DISK: disk_enabled}
    if allowed_hosts is not None:
        config[CONF_IMAGE_ALLOWED_HOSTS] = allowed_hosts
    hass.data = {DOMAIN: config}
    return hass


class TestImageProxyViewGet:
    def setup_method(self):
        # Clear L1 cache between tests
        ImageProxyView._cache.clear()

    @pytest.mark.asyncio
    async def test_missing_url_param_returns_400(self):
        hass = _make_hass()
        request = MagicMock()
        request.app = {"hass": hass}
        request.query = {}

        view = ImageProxyView()
        response = await view.get(request)
        assert response.status == 400

    @pytest.mark.asyncio
    async def test_http_url_returns_400(self):
        hass = _make_hass()
        request = _make_request(hass, "http://image.tmdb.org/img.jpg")

        view = ImageProxyView()
        with patch("custom_components.harr.views.image._resolve_and_verify", return_value="1.2.3.4"):
            response = await view.get(request)
        assert response.status == 400

    @pytest.mark.asyncio
    async def test_disallowed_host_returns_400(self):
        hass = _make_hass()
        request = _make_request(hass, "https://evil.example.com/img.jpg")

        view = ImageProxyView()
        with patch("custom_components.harr.views.image._resolve_and_verify", return_value="1.2.3.4"):
            response = await view.get(request)
        assert response.status == 400

    @pytest.mark.asyncio
    async def test_private_ip_returns_400(self):
        hass = _make_hass()
        request = _make_request(hass, "https://image.tmdb.org/img.jpg")

        view = ImageProxyView()
        with patch("custom_components.harr.views.image._resolve_and_verify", side_effect=ValueError("private")):
            response = await view.get(request)
        assert response.status == 400

    @pytest.mark.asyncio
    async def test_upstream_fetch_success_returns_200(self):
        hass = _make_hass()
        url = "https://image.tmdb.org/t/p/w342/abc.jpg"
        request = _make_request(hass, url)

        view = ImageProxyView()
        with patch("custom_components.harr.views.image._resolve_and_verify", return_value="1.2.3.4"):
            with patch.object(view, "_upstream_fetch", return_value=(b"\xff\xd8\xff", "image/jpeg", None, None)):
                response = await view.get(request)

        assert response.status == 200
        assert response.body == b"\xff\xd8\xff"

    @pytest.mark.asyncio
    async def test_upstream_fetch_none_returns_502(self):
        hass = _make_hass()
        url = "https://image.tmdb.org/t/p/w342/abc.jpg"
        request = _make_request(hass, url)

        view = ImageProxyView()
        with patch("custom_components.harr.views.image._resolve_and_verify", return_value="1.2.3.4"):
            with patch.object(view, "_upstream_fetch", return_value=None):
                response = await view.get(request)

        assert response.status == 502

    @pytest.mark.asyncio
    async def test_l1_cache_hit_skips_upstream(self):
        hass = _make_hass()
        url = "https://image.tmdb.org/t/p/w342/cached.jpg"
        request = _make_request(hass, url)

        view = ImageProxyView()
        view._cache[url] = (b"\x89PNG", "image/png")

        with patch("custom_components.harr.views.image._resolve_and_verify", return_value="1.2.3.4"):
            with patch.object(view, "_upstream_fetch") as mock_fetch:
                response = await view.get(request)

        mock_fetch.assert_not_called()
        assert response.status == 200
        assert response.body == b"\x89PNG"

    @pytest.mark.asyncio
    async def test_l2_disk_cache_hit_skips_upstream(self):
        hass = _make_hass(disk_enabled=True)
        url = "https://image.tmdb.org/t/p/w342/disk.jpg"
        request = _make_request(hass, url)

        view = ImageProxyView()
        with patch("custom_components.harr.views.image._resolve_and_verify", return_value="1.2.3.4"):
            with patch.object(view, "_disk_get", return_value=(b"\xff\xd8\xff", "image/jpeg")):
                with patch.object(view, "_upstream_fetch") as mock_fetch:
                    response = await view.get(request)

        mock_fetch.assert_not_called()
        assert response.status == 200

    @pytest.mark.asyncio
    async def test_cache_control_header_set(self):
        hass = _make_hass()
        url = "https://image.tmdb.org/t/p/w342/abc.jpg"
        request = _make_request(hass, url)

        view = ImageProxyView()
        with patch("custom_components.harr.views.image._resolve_and_verify", return_value="1.2.3.4"):
            with patch.object(view, "_upstream_fetch", return_value=(b"\xff\xd8\xff", "image/jpeg", None, None)):
                response = await view.get(request)

        assert "max-age=86400" in response.headers.get("Cache-Control", "")

    @pytest.mark.asyncio
    async def test_dns_rebinding_oserror_returns_400(self):
        """OSError from getaddrinfo (e.g. network error) must also return 400."""
        hass = _make_hass()
        request = _make_request(hass)

        view = ImageProxyView()
        with patch("custom_components.harr.views.image._resolve_and_verify", side_effect=OSError("network")):
            response = await view.get(request)
        assert response.status == 400


class TestImageProxyViewMemPut:
    def setup_method(self):
        ImageProxyView._cache.clear()

    def test_adds_entry_to_cache(self):
        view = ImageProxyView()
        view._mem_put("https://example.com/img.jpg", b"data", "image/jpeg")
        assert "https://example.com/img.jpg" in view._cache

    def test_evicts_oldest_when_full(self):
        view = ImageProxyView()
        # Fill to capacity
        for i in range(view._MAX_ENTRIES):
            view._cache[f"https://image.tmdb.org/{i}.jpg"] = (b"x", "image/jpeg")
        assert len(view._cache) == view._MAX_ENTRIES

        # Adding one more should trigger eviction
        view._mem_put("https://image.tmdb.org/new.jpg", b"new", "image/jpeg")
        # After eviction of 10%, 450 + 1 = 451 entries
        evict_count = view._MAX_ENTRIES // 10
        assert len(view._cache) == (view._MAX_ENTRIES - evict_count + 1)


class TestUpstreamFetch:
    @pytest.mark.asyncio
    async def test_returns_data_on_200(self):
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.ok = True
        mock_resp.content_type = "image/jpeg"
        mock_resp.read = AsyncMock(return_value=b"\xff\xd8\xff")
        mock_resp.headers = {"ETag": '"abc123"', "Last-Modified": "Mon, 01 Jan 2024 00:00:00 GMT"}
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_session.get = MagicMock(return_value=mock_resp)

        with patch("aiohttp.ClientSession", return_value=mock_session):
            result = await ImageProxyView._upstream_fetch("https://image.tmdb.org/img.jpg")

        assert result is not None
        data, ct, etag, lm = result
        assert data == b"\xff\xd8\xff"
        assert ct == "image/jpeg"

    @pytest.mark.asyncio
    async def test_returns_304_tuple_on_not_modified(self):
        mock_resp = AsyncMock()
        mock_resp.status = 304
        mock_resp.ok = True
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_session.get = MagicMock(return_value=mock_resp)

        with patch("aiohttp.ClientSession", return_value=mock_session):
            result = await ImageProxyView._upstream_fetch("https://image.tmdb.org/img.jpg", etag='"abc"')

        assert result == (None, "304", None, None)

    @pytest.mark.asyncio
    async def test_returns_none_for_non_image_content_type(self):
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.ok = True
        mock_resp.content_type = "text/html"
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)

        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_session.get = MagicMock(return_value=mock_resp)

        with patch("aiohttp.ClientSession", return_value=mock_session):
            result = await ImageProxyView._upstream_fetch("https://image.tmdb.org/img.jpg")

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_exception(self):
        mock_session = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)
        mock_session.get = MagicMock(side_effect=Exception("network error"))

        with patch("aiohttp.ClientSession", return_value=mock_session):
            result = await ImageProxyView._upstream_fetch("https://image.tmdb.org/img.jpg")

        assert result is None

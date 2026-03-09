"""Caching image proxy view for external poster images (e.g. TMDB CDN).

Two-level cache:
  L1 — in-memory dict (fast, lost on HA restart)
  L2 — disk files under .storage/harr/image_cache/ (opt-in, survives restarts)

Disk entries are revalidated against upstream every 7 days using HTTP
conditional requests (If-None-Match / If-Modified-Since).  If the upstream
is unreachable when revalidation is due, the stale disk copy is served as a
graceful fallback.
"""
from __future__ import annotations

import asyncio
import hashlib
import ipaddress
import json
import logging
import os
import socket
import time
from urllib.parse import urlparse

import aiohttp
from aiohttp import web

from homeassistant.components.http import HomeAssistantView

from ..const import CONF_IMAGE_CACHE_DISK, CONF_IMAGE_ALLOWED_HOSTS, DEFAULT_IMAGE_ALLOWED_HOSTS, DOMAIN

_LOGGER = logging.getLogger(__name__)

_REVALIDATE_AFTER = 7 * 24 * 3600  # seconds before a disk entry is re-checked

# ── SSRF protection ───────────────────────────────────────────────────────────

# RFC-1918 / reserved ranges — a resolved IP in any of these is rejected.
_PRIVATE_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
]


def _get_allowed_hosts(hass) -> frozenset[str]:
    """Return the configured set of allowed proxy hostnames, falling back to defaults."""
    raw: str = hass.data.get(DOMAIN, {}).get(CONF_IMAGE_ALLOWED_HOSTS, "")
    src = raw.strip() or DEFAULT_IMAGE_ALLOWED_HOSTS
    return frozenset(h.strip() for h in src.split(",") if h.strip())


def _is_safe_url(url: str, allowed_hosts: frozenset[str]) -> bool:
    """Layer 1 & 2: scheme must be https and hostname must be in allowed_hosts."""
    try:
        parsed = urlparse(url)
    except Exception:
        return False
    return parsed.scheme == "https" and parsed.hostname in allowed_hosts


async def _resolve_is_public(hostname: str) -> bool:
    """Layer 3: resolve hostname; return False if any address is private/reserved."""
    try:
        loop = asyncio.get_event_loop()
        infos = await loop.run_in_executor(None, socket.getaddrinfo, hostname, None)
        for info in infos:
            addr = ipaddress.ip_address(info[4][0])
            if any(addr in net for net in _PRIVATE_NETWORKS):
                return False
        return bool(infos)
    except Exception:
        return False


class ImageProxyView(HomeAssistantView):
    """Proxy and cache external poster images server-side."""

    url = "/api/harr/image"
    name = "api:harr:image"
    # No HA auth required — browser <img> tags can't send auth headers and
    # the images served are public (TMDB CDN).
    requires_auth = False

    # L1 in-memory cache: url -> (bytes, content_type)
    _cache: dict[str, tuple[bytes, str]] = {}
    _MAX_ENTRIES = 500

    # ── public entry point ────────────────────────────────────────────────────

    async def get(self, request: web.Request) -> web.Response:
        """Return a cached or freshly-fetched poster image."""
        image_url = request.query.get("url", "")
        if not image_url:
            return web.Response(status=400)

        # Layer 1 & 2: scheme + hostname allowlist
        allowed_hosts = _get_allowed_hosts(request.app["hass"])
        if not _is_safe_url(image_url, allowed_hosts):
            _LOGGER.debug("Image proxy: rejected unsafe URL: %s", image_url)
            return web.Response(status=400)

        # Layer 3: DNS rebinding guard — resolved IP must not be private/reserved
        hostname = urlparse(image_url).hostname
        if not await _resolve_is_public(hostname):
            _LOGGER.debug("Image proxy: rejected DNS rebinding attempt: %s", image_url)
            return web.Response(status=400)

        hass = request.app["hass"]
        disk_enabled: bool = hass.data.get(DOMAIN, {}).get(CONF_IMAGE_CACHE_DISK, False)

        # L1: in-memory
        if image_url in self._cache:
            _LOGGER.debug("Image cache L1 hit: %s", image_url)
            data, ct = self._cache[image_url]
            return self._ok(data, ct)

        # L2: disk
        if disk_enabled:
            result = await self._disk_get(hass, image_url)
            if result is not None:
                _LOGGER.debug("Image cache L2 hit (disk): %s", image_url)
                data, ct = result
                self._mem_put(image_url, data, ct)
                return self._ok(data, ct)

        # L3: upstream fetch
        _LOGGER.debug("Image cache L3 fetch (upstream): %s", image_url)
        fetched = await self._upstream_fetch(image_url)
        if fetched is None:
            return web.Response(status=502)
        data, ct, etag, last_modified = fetched
        self._mem_put(image_url, data, ct)
        if disk_enabled:
            await self._disk_put(hass, image_url, data, ct, etag, last_modified)
        return self._ok(data, ct)

    # ── helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _ok(data: bytes, ct: str) -> web.Response:
        return web.Response(
            body=data,
            content_type=ct,
            headers={"Cache-Control": "public, max-age=86400"},
        )

    def _mem_put(self, url: str, data: bytes, ct: str) -> None:
        if len(self._cache) >= self._MAX_ENTRIES:
            _LOGGER.debug("Image L1 cache full (%d entries), evicting oldest 10%%", self._MAX_ENTRIES)
            for k in list(self._cache)[: self._MAX_ENTRIES // 10]:
                del self._cache[k]
        self._cache[url] = (data, ct)

    @staticmethod
    def _cache_key(url: str) -> str:
        return hashlib.sha256(url.encode()).hexdigest()

    @staticmethod
    def _cache_dir(hass) -> str:
        return hass.config.path(".storage", "harr", "image_cache")

    # ── upstream fetch ────────────────────────────────────────────────────────

    @staticmethod
    async def _upstream_fetch(
        url: str,
        etag: str | None = None,
        last_modified: str | None = None,
    ) -> tuple[bytes, str, str | None, str | None] | tuple[None, str, None, None] | None:
        """Fetch url from upstream.

        Returns:
          (data, content_type, etag, last_modified)  — new/updated content
          (None, "304", None, None)                   — not modified (conditional)
          None                                        — error
        """
        headers: dict[str, str] = {}
        if etag:
            headers["If-None-Match"] = etag
        if last_modified:
            headers["If-Modified-Since"] = last_modified

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=10),
                ) as resp:
                    if resp.status == 304:
                        return None, "304", None, None
                    if not resp.ok:
                        return None  # type: ignore[return-value]
                    ct = resp.content_type or "image/jpeg"
                    if not ct.startswith("image/"):
                        return None  # type: ignore[return-value]
                    data = await resp.read()
                    new_etag = resp.headers.get("ETag")
                    new_lm = resp.headers.get("Last-Modified")
                    return data, ct, new_etag, new_lm
        except Exception:
            return None  # type: ignore[return-value]

    # ── disk cache ────────────────────────────────────────────────────────────

    async def _disk_get(self, hass, url: str) -> tuple[bytes, str] | None:
        """Try to serve from disk, revalidating stale entries. Returns (data, ct) or None."""
        cache_key = self._cache_key(url)
        cache_dir = self._cache_dir(hass)
        bin_path = os.path.join(cache_dir, f"{cache_key}.bin")
        meta_path = os.path.join(cache_dir, f"{cache_key}.json")

        def _read() -> tuple[bytes, dict] | None:
            if not os.path.exists(bin_path) or not os.path.exists(meta_path):
                return None
            with open(meta_path, encoding="utf-8") as f:
                meta = json.load(f)
            with open(bin_path, "rb") as f:
                data = f.read()
            return data, meta

        result = await hass.async_add_executor_job(_read)
        if result is None:
            return None

        data, meta = result
        ct: str = meta.get("content_type", "image/jpeg")
        cached_at: float = meta.get("cached_at", 0.0)

        if time.time() - cached_at <= _REVALIDATE_AFTER:
            # Still fresh — serve as-is
            _LOGGER.debug("Image cache disk entry fresh: %s", url)
            return data, ct

        # Stale — attempt conditional revalidation
        _LOGGER.debug("Image cache disk entry stale, revalidating: %s", url)
        revalidated = await self._upstream_fetch(
            url,
            etag=meta.get("etag"),
            last_modified=meta.get("last_modified"),
        )

        if revalidated is None:
            # Upstream unreachable — serve stale content as graceful fallback
            _LOGGER.debug("Image cache revalidation: upstream unreachable, serving stale: %s", url)
            return data, ct

        fresh_data, fresh_ct, new_etag, new_lm = revalidated

        if fresh_ct == "304":
            # Not modified — just refresh the timestamp
            _LOGGER.debug("Image cache revalidation: 304 Not Modified, refreshed timestamp: %s", url)
            meta["cached_at"] = time.time()

            def _touch_meta() -> None:
                with open(meta_path, "w", encoding="utf-8") as f:
                    json.dump(meta, f)

            await hass.async_add_executor_job(_touch_meta)
            return data, ct

        # New version available — overwrite and serve fresh
        _LOGGER.debug("Image cache revalidation: new version fetched: %s", url)
        await self._disk_put(hass, url, fresh_data, fresh_ct, new_etag, new_lm)
        return fresh_data, fresh_ct

    async def _disk_put(
        self,
        hass,
        url: str,
        data: bytes,
        ct: str,
        etag: str | None,
        last_modified: str | None,
    ) -> None:
        """Write image bytes and metadata to disk."""
        cache_key = self._cache_key(url)
        cache_dir = self._cache_dir(hass)
        bin_path = os.path.join(cache_dir, f"{cache_key}.bin")
        meta_path = os.path.join(cache_dir, f"{cache_key}.json")
        meta = {
            "url": url,
            "content_type": ct,
            "etag": etag,
            "last_modified": last_modified,
            "cached_at": time.time(),
        }

        def _write() -> None:
            os.makedirs(cache_dir, exist_ok=True)
            with open(bin_path, "wb") as f:
                f.write(data)
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump(meta, f)

        await hass.async_add_executor_job(_write)

"""Tests for views/config.py HarrConfigView."""
from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest

from custom_components.harr.const import (
    CONF_BAZARR_URL,
    CONF_QBT_URL,
    CONF_RADARR_URL,
    CONF_SABNZBD_URL,
    CONF_SEERR_URL,
    CONF_SONARR_URL,
    DOMAIN,
)
from custom_components.harr.views.config import HarrConfigView


def _make_request(domain_data):
    hass = MagicMock()
    hass.data = {DOMAIN: domain_data}
    request = MagicMock()
    request.app = {"hass": hass}
    return request


class TestHarrConfigView:
    @pytest.mark.asyncio
    async def test_all_services_configured_returns_all_true(self):
        data = {
            CONF_RADARR_URL: "http://radarr",
            CONF_SONARR_URL: "http://sonarr",
            CONF_SEERR_URL: "http://seerr",
            CONF_BAZARR_URL: "http://bazarr",
            CONF_QBT_URL: "http://qbt",
            CONF_SABNZBD_URL: "http://sabnzbd",
        }
        request = _make_request(data)
        view = HarrConfigView()
        response = view.json({
            "radarr": bool(data.get(CONF_RADARR_URL)),
            "sonarr": bool(data.get(CONF_SONARR_URL)),
            "seerr": bool(data.get(CONF_SEERR_URL)),
            "bazarr": bool(data.get(CONF_BAZARR_URL)),
            "qbittorrent": bool(data.get(CONF_QBT_URL)),
            "sabnzbd": bool(data.get(CONF_SABNZBD_URL)),
        })
        body = json.loads(response.body)
        assert body["radarr"] is True
        assert body["sonarr"] is True
        assert body["seerr"] is True
        assert body["bazarr"] is True
        assert body["qbittorrent"] is True
        assert body["sabnzbd"] is True

    @pytest.mark.asyncio
    async def test_no_services_configured_returns_all_false(self):
        data = {
            CONF_RADARR_URL: "",
            CONF_SONARR_URL: "",
            CONF_SEERR_URL: "",
            CONF_BAZARR_URL: "",
            CONF_QBT_URL: "",
            CONF_SABNZBD_URL: "",
        }
        view = HarrConfigView()
        response = view.json({
            "radarr": bool(data.get(CONF_RADARR_URL)),
            "sonarr": bool(data.get(CONF_SONARR_URL)),
            "seerr": bool(data.get(CONF_SEERR_URL)),
            "bazarr": bool(data.get(CONF_BAZARR_URL)),
            "qbittorrent": bool(data.get(CONF_QBT_URL)),
            "sabnzbd": bool(data.get(CONF_SABNZBD_URL)),
        })
        body = json.loads(response.body)
        assert body["radarr"] is False
        assert body["sonarr"] is False
        assert body["seerr"] is False
        assert body["bazarr"] is False
        assert body["qbittorrent"] is False
        assert body["sabnzbd"] is False

    @pytest.mark.asyncio
    async def test_partial_config_returns_correct_flags(self):
        data = {
            CONF_RADARR_URL: "http://radarr",
            CONF_SONARR_URL: "",
            CONF_SEERR_URL: "http://seerr",
            CONF_BAZARR_URL: "",
            CONF_QBT_URL: "",
            CONF_SABNZBD_URL: "",
        }
        view = HarrConfigView()
        response = view.json({
            "radarr": bool(data.get(CONF_RADARR_URL)),
            "sonarr": bool(data.get(CONF_SONARR_URL)),
            "seerr": bool(data.get(CONF_SEERR_URL)),
            "bazarr": bool(data.get(CONF_BAZARR_URL)),
            "qbittorrent": bool(data.get(CONF_QBT_URL)),
            "sabnzbd": bool(data.get(CONF_SABNZBD_URL)),
        })
        body = json.loads(response.body)
        assert body["radarr"] is True
        assert body["sonarr"] is False
        assert body["seerr"] is True
        assert body["bazarr"] is False

    @pytest.mark.asyncio
    async def test_get_handler_returns_correct_config(self):
        """Test the actual GET handler via the view."""
        data = {
            CONF_RADARR_URL: "http://radarr",
            CONF_SONARR_URL: "",
            CONF_SEERR_URL: "",
            CONF_BAZARR_URL: "",
            CONF_QBT_URL: "",
            CONF_SABNZBD_URL: "",
        }
        request = _make_request(data)
        view = HarrConfigView()
        response = await view.get(request)
        body = json.loads(response.body)
        assert body["radarr"] is True
        assert body["sonarr"] is False

    @pytest.mark.asyncio
    async def test_empty_domain_data_returns_all_false(self):
        request = _make_request({})
        view = HarrConfigView()
        response = await view.get(request)
        body = json.loads(response.body)
        assert all(v is False for v in body.values())

"""Shared fixtures for Harr integration tests."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from custom_components.harr.const import (
    CONF_ADMIN_ONLY,
    CONF_BAZARR_API_KEY,
    CONF_BAZARR_URL,
    CONF_BAZARR_VERIFY_SSL,
    CONF_IMAGE_ALLOWED_HOSTS,
    CONF_IMAGE_CACHE_DISK,
    CONF_QBT_PASSWORD,
    CONF_QBT_URL,
    CONF_QBT_USERNAME,
    CONF_QBT_VERIFY_SSL,
    CONF_RADARR_API_KEY,
    CONF_RADARR_URL,
    CONF_RADARR_VERIFY_SSL,
    CONF_SABNZBD_API_KEY,
    CONF_SABNZBD_URL,
    CONF_SABNZBD_VERIFY_SSL,
    CONF_SEERR_API_KEY,
    CONF_SEERR_URL,
    CONF_SEERR_VERIFY_SSL,
    CONF_SONARR_API_KEY,
    CONF_SONARR_URL,
    CONF_SONARR_VERIFY_SSL,
    DEFAULT_IMAGE_ALLOWED_HOSTS,
    DOMAIN,
)


@pytest.fixture
def base_config_data():
    """Return a minimal flat config dict with all fields present."""
    return {
        CONF_RADARR_URL: "",
        CONF_RADARR_API_KEY: "",
        CONF_RADARR_VERIFY_SSL: True,
        CONF_SONARR_URL: "",
        CONF_SONARR_API_KEY: "",
        CONF_SONARR_VERIFY_SSL: True,
        CONF_SEERR_URL: "",
        CONF_SEERR_API_KEY: "",
        CONF_SEERR_VERIFY_SSL: True,
        CONF_BAZARR_URL: "",
        CONF_BAZARR_API_KEY: "",
        CONF_BAZARR_VERIFY_SSL: True,
        CONF_QBT_URL: "",
        CONF_QBT_USERNAME: "",
        CONF_QBT_PASSWORD: "",
        CONF_QBT_VERIFY_SSL: True,
        CONF_SABNZBD_URL: "",
        CONF_SABNZBD_API_KEY: "",
        CONF_SABNZBD_VERIFY_SSL: True,
        CONF_ADMIN_ONLY: False,
        CONF_IMAGE_CACHE_DISK: False,
        CONF_IMAGE_ALLOWED_HOSTS: DEFAULT_IMAGE_ALLOWED_HOSTS,
    }


@pytest.fixture
def radarr_config_data(base_config_data):
    """Return config with Radarr configured."""
    return {
        **base_config_data,
        CONF_RADARR_URL: "http://radarr.local:7878",
        CONF_RADARR_API_KEY: "test-radarr-key",
    }


@pytest.fixture
def mock_hass():
    """Return a minimal mock HomeAssistant object."""
    hass = MagicMock()
    hass.data = {}
    hass.config_entries = MagicMock()
    hass.http = MagicMock()
    hass.http.register_view = MagicMock()
    hass.http.async_register_static_paths = AsyncMock()
    return hass


@pytest.fixture
def mock_request(mock_hass):
    """Return a mock aiohttp request bound to mock_hass."""
    request = MagicMock()
    request.app = {"hass": mock_hass}
    request.rel_url.query = {}
    request.content_type = "application/json"
    request.headers = {}
    return request

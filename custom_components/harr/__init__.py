"""The Harr integration — a media management panel for Home Assistant."""
from __future__ import annotations

import logging
import os

import voluptuous as vol

from homeassistant.components import panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry, SOURCE_IMPORT
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv

from .const import (
    CONF_ADMIN_ONLY,
    CONF_RADARR_URL, CONF_RADARR_API_KEY, CONF_RADARR_VERIFY_SSL,
    CONF_SONARR_URL, CONF_SONARR_API_KEY, CONF_SONARR_VERIFY_SSL,
    CONF_SEERR_URL, CONF_SEERR_API_KEY, CONF_SEERR_VERIFY_SSL,
    CONF_BAZARR_URL, CONF_BAZARR_API_KEY, CONF_BAZARR_VERIFY_SSL,
    CONF_QBT_URL, CONF_QBT_USERNAME, CONF_QBT_PASSWORD, CONF_QBT_VERIFY_SSL,
    CONF_SABNZBD_URL, CONF_SABNZBD_API_KEY, CONF_SABNZBD_VERIFY_SSL,
    DOMAIN,
)
from .views.radarr import RadarrProxyView
from .views.sonarr import SonarrProxyView
from .views.seerr import SeerrProxyView
from .views.bazarr import BazarrProxyView
from .views.qbittorrent import QBittorrentProxyView
from .views.sabnzbd import SABnzbdProxyView
from .views.config import HarrConfigView

_LOGGER = logging.getLogger(__name__)

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "frontend")
FRONTEND_URL = "/harr-frontend"
PANEL_URL = "/harr-frontend/harr-panel.js"

# Key used to track whether HTTP assets (static path + panel) have already been
# registered for this HA process lifetime. These registrations survive config
# entry reloads and must only happen once.
_HTTP_REGISTERED_KEY = f"{DOMAIN}_http_registered"

# ── YAML configuration schema ────────────────────────────────────────────────

_SERVICE_SCHEMA_API_KEY = vol.Schema(
    {
        vol.Optional("url", default=""): str,
        vol.Optional("api_key", default=""): str,
        vol.Optional("verify_ssl", default=True): cv.boolean,
    },
    extra=vol.ALLOW_EXTRA,
)

_SERVICE_SCHEMA_QBT = vol.Schema(
    {
        vol.Optional("url", default=""): str,
        vol.Optional("username", default=""): str,
        vol.Optional("password", default=""): str,
        vol.Optional("verify_ssl", default=True): cv.boolean,
    },
    extra=vol.ALLOW_EXTRA,
)

CONFIG_SCHEMA = vol.Schema(
    {
        DOMAIN: vol.Schema(
            {
                vol.Optional("radarr"):      _SERVICE_SCHEMA_API_KEY,
                vol.Optional("sonarr"):      _SERVICE_SCHEMA_API_KEY,
                vol.Optional("seerr"):       _SERVICE_SCHEMA_API_KEY,
                vol.Optional("bazarr"):      _SERVICE_SCHEMA_API_KEY,
                vol.Optional("qbittorrent"): _SERVICE_SCHEMA_QBT,
                vol.Optional("sabnzbd"):     _SERVICE_SCHEMA_API_KEY,
                vol.Optional("admin_only", default=False): cv.boolean,
            },
            extra=vol.ALLOW_EXTRA,
        )
    },
    extra=vol.ALLOW_EXTRA,
)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Import YAML configuration into a config entry."""
    if DOMAIN not in config:
        return True

    yaml = config[DOMAIN]

    def _svc(key: str) -> dict:
        return yaml.get(key) or {}

    flat = {
        CONF_RADARR_URL:         _svc("radarr").get("url", ""),
        CONF_RADARR_API_KEY:     _svc("radarr").get("api_key", ""),
        CONF_RADARR_VERIFY_SSL:  _svc("radarr").get("verify_ssl", True),
        CONF_SONARR_URL:         _svc("sonarr").get("url", ""),
        CONF_SONARR_API_KEY:     _svc("sonarr").get("api_key", ""),
        CONF_SONARR_VERIFY_SSL:  _svc("sonarr").get("verify_ssl", True),
        CONF_SEERR_URL:          _svc("seerr").get("url", ""),
        CONF_SEERR_API_KEY:      _svc("seerr").get("api_key", ""),
        CONF_SEERR_VERIFY_SSL:   _svc("seerr").get("verify_ssl", True),
        CONF_BAZARR_URL:         _svc("bazarr").get("url", ""),
        CONF_BAZARR_API_KEY:     _svc("bazarr").get("api_key", ""),
        CONF_BAZARR_VERIFY_SSL:  _svc("bazarr").get("verify_ssl", True),
        CONF_QBT_URL:            _svc("qbittorrent").get("url", ""),
        CONF_QBT_USERNAME:       _svc("qbittorrent").get("username", ""),
        CONF_QBT_PASSWORD:       _svc("qbittorrent").get("password", ""),
        CONF_QBT_VERIFY_SSL:     _svc("qbittorrent").get("verify_ssl", True),
        CONF_SABNZBD_URL:        _svc("sabnzbd").get("url", ""),
        CONF_SABNZBD_API_KEY:    _svc("sabnzbd").get("api_key", ""),
        CONF_SABNZBD_VERIFY_SSL: _svc("sabnzbd").get("verify_ssl", True),
        CONF_ADMIN_ONLY:         yaml.get("admin_only", False),
    }

    existing = hass.config_entries.async_entries(DOMAIN)
    if existing:
        hass.config_entries.async_update_entry(existing[0], data=flat)
        _LOGGER.debug("harr: updated config entry from YAML")
        return True

    hass.async_create_task(
        hass.config_entries.flow.async_init(
            DOMAIN,
            context={"source": SOURCE_IMPORT},
            data=flat,
        )
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Harr from a config entry."""
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN] = dict(entry.data)

    # Static path and panel registration must only happen once per process
    # lifetime — reloading the config entry (e.g. after editing credentials)
    # must not attempt to re-register them.
    if not hass.data.get(_HTTP_REGISTERED_KEY):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(FRONTEND_URL, FRONTEND_DIR, cache_headers=False)]
        )

        # Register all proxy views (HA deduplicates by name, but guard anyway)
        for view_class in [
            RadarrProxyView,
            SonarrProxyView,
            SeerrProxyView,
            BazarrProxyView,
            QBittorrentProxyView,
            SABnzbdProxyView,
            HarrConfigView,
        ]:
            hass.http.register_view(view_class)

        await panel_custom.async_register_panel(
            hass,
            webcomponent_name="ha-harr",
            sidebar_title="Harr",
            sidebar_icon="mdi:movie-open",
            frontend_url_path="harr",
            module_url=PANEL_URL,
            require_admin=bool(entry.data.get(CONF_ADMIN_ONLY, False)),
            config={},
        )

        hass.data[_HTTP_REGISTERED_KEY] = True

    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Handle options update — reload the entry."""
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    # Panel and views registered on hass.http persist for the process lifetime
    # but we clean up our data store
    hass.data.pop(DOMAIN, None)
    return True

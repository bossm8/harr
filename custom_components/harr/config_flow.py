"""Config flow for the Harr integration."""
from __future__ import annotations

import logging
from typing import Any

import aiohttp
import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback
from homeassistant.data_entry_flow import section

from .const import (
    CONF_ADMIN_ONLY,
    CONF_IMAGE_CACHE_DISK,
    CONF_IMAGE_ALLOWED_HOSTS,
    DEFAULT_IMAGE_ALLOWED_HOSTS,
    CONF_BAZARR_API_KEY,
    CONF_BAZARR_URL,
    CONF_BAZARR_VERIFY_SSL,
    CONF_SEERR_API_KEY,
    CONF_SEERR_URL,
    CONF_SEERR_VERIFY_SSL,
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
    CONF_SONARR_API_KEY,
    CONF_SONARR_URL,
    CONF_SONARR_VERIFY_SSL,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)


# All string config keys — used to ensure cleared fields are saved as "" rather
# than being absent from user_input (HA section forms omit empty text fields).
_ALL_STRING_KEYS = (
    CONF_RADARR_URL, CONF_RADARR_API_KEY,
    CONF_SONARR_URL, CONF_SONARR_API_KEY,
    CONF_SEERR_URL, CONF_SEERR_API_KEY,
    CONF_BAZARR_URL, CONF_BAZARR_API_KEY,
    CONF_QBT_URL, CONF_QBT_USERNAME, CONF_QBT_PASSWORD,
    CONF_SABNZBD_URL, CONF_SABNZBD_API_KEY,
    CONF_IMAGE_ALLOWED_HOSTS,
)


def _flatten_sections(data: dict) -> dict:
    """Flatten section-nested form submission into a flat dict for storage."""
    flat = {}
    for key, val in data.items():
        if isinstance(val, dict):
            flat.update(val)
        else:
            flat[key] = val
    # Ensure any string field the user may have cleared is explicitly "" rather
    # than absent (HA section forms don't submit empty text fields).
    for key in _ALL_STRING_KEYS:
        flat.setdefault(key, "")
    return flat


STEP_USER_DATA_SCHEMA = vol.Schema(
    {
        vol.Required("radarr"): section(
            vol.Schema({
                vol.Optional(CONF_RADARR_URL, default=""): str,
                vol.Optional(CONF_RADARR_API_KEY, default=""): str,
                vol.Optional(CONF_RADARR_VERIFY_SSL, default=True): bool,
            }),
            {"collapsed": False},
        ),
        vol.Required("sonarr"): section(
            vol.Schema({
                vol.Optional(CONF_SONARR_URL, default=""): str,
                vol.Optional(CONF_SONARR_API_KEY, default=""): str,
                vol.Optional(CONF_SONARR_VERIFY_SSL, default=True): bool,
            }),
            {"collapsed": False},
        ),
        vol.Required("seerr"): section(
            vol.Schema({
                vol.Optional(CONF_SEERR_URL, default=""): str,
                vol.Optional(CONF_SEERR_API_KEY, default=""): str,
                vol.Optional(CONF_SEERR_VERIFY_SSL, default=True): bool,
            }),
            {"collapsed": False},
        ),
        vol.Required("bazarr"): section(
            vol.Schema({
                vol.Optional(CONF_BAZARR_URL, default=""): str,
                vol.Optional(CONF_BAZARR_API_KEY, default=""): str,
                vol.Optional(CONF_BAZARR_VERIFY_SSL, default=True): bool,
            }),
            {"collapsed": False},
        ),
        vol.Required("qbittorrent"): section(
            vol.Schema({
                vol.Optional(CONF_QBT_URL, default=""): str,
                vol.Optional(CONF_QBT_USERNAME, default=""): str,
                vol.Optional(CONF_QBT_PASSWORD, default=""): str,
                vol.Optional(CONF_QBT_VERIFY_SSL, default=True): bool,
            }),
            {"collapsed": False},
        ),
        vol.Required("sabnzbd"): section(
            vol.Schema({
                vol.Optional(CONF_SABNZBD_URL, default=""): str,
                vol.Optional(CONF_SABNZBD_API_KEY, default=""): str,
                vol.Optional(CONF_SABNZBD_VERIFY_SSL, default=True): bool,
            }),
            {"collapsed": False},
        ),
        vol.Required("access_control"): section(
            vol.Schema({
                vol.Optional(CONF_ADMIN_ONLY, default=False): bool,
            }),
            {"collapsed": False},
        ),
        vol.Required("performance"): section(
            vol.Schema({
                vol.Optional(CONF_IMAGE_CACHE_DISK, default=False): bool,
                vol.Optional(CONF_IMAGE_ALLOWED_HOSTS, default=DEFAULT_IMAGE_ALLOWED_HOSTS): str,
            }),
            {"collapsed": False},
        ),
    }
)


async def _test_api_key_service(
    session: aiohttp.ClientSession,
    base_url: str,
    api_key: str,
    test_path: str,
    header_name: str = "X-Api-Key",
) -> str | None:
    """Test connection to an API-key-based service. Returns error key or None."""
    url = f"{base_url.rstrip('/')}/{test_path.lstrip('/')}"
    try:
        async with session.get(url, headers={header_name: api_key}, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status == 401:
                return "invalid_auth"
            if not resp.ok:
                return "cannot_connect"
    except aiohttp.ClientError:
        return "cannot_connect"
    return None


async def _test_qbt(
    session: aiohttp.ClientSession,
    base_url: str,
    username: str,
    password: str,
) -> str | None:
    """Test qBittorrent connection. Returns error key or None."""
    url = f"{base_url.rstrip('/')}/api/v2/auth/login"
    try:
        async with session.post(
            url,
            data={"username": username, "password": password},
            timeout=aiohttp.ClientTimeout(total=10),
        ) as resp:
            body = await resp.text()
            if body.strip() == "Fails.":
                return "invalid_auth"
            if not resp.ok:
                return "cannot_connect"
    except aiohttp.ClientError:
        return "cannot_connect"
    return None


def _make_session(verify_ssl: bool) -> aiohttp.ClientSession:
    """Create a standalone aiohttp session for connection testing.

    Deliberately not using async_get_clientsession / async_create_clientsession
    so the session is fully owned here and safe to close after each test.
    """
    connector = aiohttp.TCPConnector(ssl=None if verify_ssl else False)
    return aiohttp.ClientSession(connector=connector)


async def _validate_input(data: dict) -> dict:
    """Validate each configured service. Returns dict of field -> error."""
    errors: dict[str, str] = {}

    if data.get(CONF_RADARR_URL):
        _LOGGER.debug("Testing Radarr connection: %s", data[CONF_RADARR_URL])
        async with _make_session(data.get(CONF_RADARR_VERIFY_SSL, True)) as session:
            err = await _test_api_key_service(session, data[CONF_RADARR_URL], data.get(CONF_RADARR_API_KEY, ""), "api/v3/system/status")
            if err:
                _LOGGER.debug("Radarr connection test failed: %s", err)
                errors["radarr"] = err
            else:
                _LOGGER.debug("Radarr connection test passed")

    if data.get(CONF_SONARR_URL):
        _LOGGER.debug("Testing Sonarr connection: %s", data[CONF_SONARR_URL])
        async with _make_session(data.get(CONF_SONARR_VERIFY_SSL, True)) as session:
            err = await _test_api_key_service(session, data[CONF_SONARR_URL], data.get(CONF_SONARR_API_KEY, ""), "api/v3/system/status")
            if err:
                _LOGGER.debug("Sonarr connection test failed: %s", err)
                errors["sonarr"] = err
            else:
                _LOGGER.debug("Sonarr connection test passed")

    if data.get(CONF_SEERR_URL):
        _LOGGER.debug("Testing Seerr connection: %s", data[CONF_SEERR_URL])
        async with _make_session(data.get(CONF_SEERR_VERIFY_SSL, True)) as session:
            err = await _test_api_key_service(session, data[CONF_SEERR_URL], data.get(CONF_SEERR_API_KEY, ""), "api/v1/status")
            if err:
                _LOGGER.debug("Seerr connection test failed: %s", err)
                errors["seerr"] = err
            else:
                _LOGGER.debug("Seerr connection test passed")

    if data.get(CONF_BAZARR_URL):
        _LOGGER.debug("Testing Bazarr connection: %s", data[CONF_BAZARR_URL])
        async with _make_session(data.get(CONF_BAZARR_VERIFY_SSL, True)) as session:
            err = await _test_api_key_service(session, data[CONF_BAZARR_URL], data.get(CONF_BAZARR_API_KEY, ""), "api/system/status")
            if err:
                _LOGGER.debug("Bazarr connection test failed: %s", err)
                errors["bazarr"] = err
            else:
                _LOGGER.debug("Bazarr connection test passed")

    if data.get(CONF_QBT_URL):
        _LOGGER.debug("Testing qBittorrent connection: %s", data[CONF_QBT_URL])
        async with _make_session(data.get(CONF_QBT_VERIFY_SSL, True)) as session:
            err = await _test_qbt(session, data[CONF_QBT_URL], data.get(CONF_QBT_USERNAME, ""), data.get(CONF_QBT_PASSWORD, ""))
            if err:
                _LOGGER.debug("qBittorrent connection test failed: %s", err)
                errors["qbittorrent"] = err
            else:
                _LOGGER.debug("qBittorrent connection test passed")

    if data.get(CONF_SABNZBD_URL):
        _LOGGER.debug("Testing SABnzbd connection: %s", data[CONF_SABNZBD_URL])
        async with _make_session(data.get(CONF_SABNZBD_VERIFY_SSL, True)) as session:
            err = await _test_api_key_service(
                session,
                data[CONF_SABNZBD_URL],
                data.get(CONF_SABNZBD_API_KEY, ""),
                f"api?mode=version&output=json&apikey={data.get(CONF_SABNZBD_API_KEY, '')}",
                header_name="X-Api-Key-Unused",  # SABnzbd uses query param, not header
            )
            if err:
                _LOGGER.debug("SABnzbd connection test failed: %s", err)
                errors["sabnzbd"] = err
            else:
                _LOGGER.debug("SABnzbd connection test passed")

    return errors


class HarrConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Harr."""

    VERSION = 1

    async def async_step_import(
        self, user_input: dict[str, Any]
    ) -> config_entries.FlowResult:
        """Create a config entry from YAML. Skip live validation (trusted source)."""
        if self._async_current_entries():
            return self.async_abort(reason="already_configured")
        return self.async_create_entry(title="Harr", data=user_input)

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        """Handle the initial step."""
        if self._async_current_entries():
            return self.async_abort(reason="already_configured")

        errors: dict[str, str] = {}

        if user_input is not None:
            flat = _flatten_sections(user_input)
            errors = await _validate_input(flat)
            if not errors:
                return self.async_create_entry(title="Harr", data=flat)

        return self.async_show_form(
            step_id="user",
            data_schema=STEP_USER_DATA_SCHEMA,
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> HarrOptionsFlow:
        """Return the options flow."""
        return HarrOptionsFlow()


class HarrOptionsFlow(config_entries.OptionsFlow):
    """Handle options flow for Harr."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> config_entries.FlowResult:
        """Manage the options."""
        errors: dict[str, str] = {}
        current = {**self.config_entry.data}

        if user_input is not None:
            flat = _flatten_sections(user_input)
            errors = await _validate_input(flat)
            if not errors:
                self.hass.config_entries.async_update_entry(
                    self.config_entry, data=flat
                )
                return self.async_create_entry(title="", data={})

        # Use description={"suggested_value": ...} instead of default= for all
        # string fields.  HA's frontend pre-fills "suggested_value" for display
        # but — unlike "default" — does NOT restore it when the user clears the
        # field and submits.  This allows clearing any text field to save "".
        def _sv(val: str) -> dict:
            return {"suggested_value": val}

        schema = vol.Schema(
            {
                vol.Required("radarr"): section(
                    vol.Schema({
                        vol.Optional(CONF_RADARR_URL, description=_sv(current.get(CONF_RADARR_URL, ""))): str,
                        vol.Optional(CONF_RADARR_API_KEY, description=_sv(current.get(CONF_RADARR_API_KEY, ""))): str,
                        vol.Optional(CONF_RADARR_VERIFY_SSL, default=current.get(CONF_RADARR_VERIFY_SSL, True)): bool,
                    }),
                    {"collapsed": False},
                ),
                vol.Required("sonarr"): section(
                    vol.Schema({
                        vol.Optional(CONF_SONARR_URL, description=_sv(current.get(CONF_SONARR_URL, ""))): str,
                        vol.Optional(CONF_SONARR_API_KEY, description=_sv(current.get(CONF_SONARR_API_KEY, ""))): str,
                        vol.Optional(CONF_SONARR_VERIFY_SSL, default=current.get(CONF_SONARR_VERIFY_SSL, True)): bool,
                    }),
                    {"collapsed": False},
                ),
                vol.Required("seerr"): section(
                    vol.Schema({
                        vol.Optional(CONF_SEERR_URL, description=_sv(current.get(CONF_SEERR_URL, ""))): str,
                        vol.Optional(CONF_SEERR_API_KEY, description=_sv(current.get(CONF_SEERR_API_KEY, ""))): str,
                        vol.Optional(CONF_SEERR_VERIFY_SSL, default=current.get(CONF_SEERR_VERIFY_SSL, True)): bool,
                    }),
                    {"collapsed": False},
                ),
                vol.Required("bazarr"): section(
                    vol.Schema({
                        vol.Optional(CONF_BAZARR_URL, description=_sv(current.get(CONF_BAZARR_URL, ""))): str,
                        vol.Optional(CONF_BAZARR_API_KEY, description=_sv(current.get(CONF_BAZARR_API_KEY, ""))): str,
                        vol.Optional(CONF_BAZARR_VERIFY_SSL, default=current.get(CONF_BAZARR_VERIFY_SSL, True)): bool,
                    }),
                    {"collapsed": False},
                ),
                vol.Required("qbittorrent"): section(
                    vol.Schema({
                        vol.Optional(CONF_QBT_URL, description=_sv(current.get(CONF_QBT_URL, ""))): str,
                        vol.Optional(CONF_QBT_USERNAME, description=_sv(current.get(CONF_QBT_USERNAME, ""))): str,
                        vol.Optional(CONF_QBT_PASSWORD, description=_sv(current.get(CONF_QBT_PASSWORD, ""))): str,
                        vol.Optional(CONF_QBT_VERIFY_SSL, default=current.get(CONF_QBT_VERIFY_SSL, True)): bool,
                    }),
                    {"collapsed": False},
                ),
                vol.Required("sabnzbd"): section(
                    vol.Schema({
                        vol.Optional(CONF_SABNZBD_URL, description=_sv(current.get(CONF_SABNZBD_URL, ""))): str,
                        vol.Optional(CONF_SABNZBD_API_KEY, description=_sv(current.get(CONF_SABNZBD_API_KEY, ""))): str,
                        vol.Optional(CONF_SABNZBD_VERIFY_SSL, default=current.get(CONF_SABNZBD_VERIFY_SSL, True)): bool,
                    }),
                    {"collapsed": False},
                ),
                vol.Required("access_control"): section(
                    vol.Schema({
                        vol.Optional(CONF_ADMIN_ONLY, default=current.get(CONF_ADMIN_ONLY, False)): bool,
                    }),
                    {"collapsed": False},
                ),
                vol.Required("performance"): section(
                    vol.Schema({
                        vol.Optional(CONF_IMAGE_CACHE_DISK, default=current.get(CONF_IMAGE_CACHE_DISK, False)): bool,
                        vol.Optional(CONF_IMAGE_ALLOWED_HOSTS, description=_sv(current.get(CONF_IMAGE_ALLOWED_HOSTS) or DEFAULT_IMAGE_ALLOWED_HOSTS)): str,
                    }),
                    {"collapsed": False},
                ),
            }
        )

        return self.async_show_form(
            step_id="init",
            data_schema=schema,
            errors=errors,
        )
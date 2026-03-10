"""Tests for config_flow.py."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import aiohttp
import pytest

from custom_components.harr.config_flow import (
    HarrConfigFlow,
    HarrOptionsFlow,
    _flatten_sections,
    _test_api_key_service,
    _test_qbt,
    _validate_input,
)
from custom_components.harr.const import (
    CONF_ADMIN_ONLY,
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
    DEFAULT_IMAGE_ALLOWED_HOSTS,
    DOMAIN,
)


# ── _flatten_sections ─────────────────────────────────────────────────────────

class TestFlattenSections:
    def test_nested_sections_flattened(self):
        data = {
            "radarr": {CONF_RADARR_URL: "http://radarr", CONF_RADARR_API_KEY: "key"},
            "access_control": {CONF_ADMIN_ONLY: True},
        }
        result = _flatten_sections(data)
        assert result[CONF_RADARR_URL] == "http://radarr"
        assert result[CONF_RADARR_API_KEY] == "key"
        assert result[CONF_ADMIN_ONLY] is True

    def test_missing_string_keys_default_to_empty_string(self):
        result = _flatten_sections({})
        # All string keys should default to "" if absent
        assert result[CONF_RADARR_URL] == ""
        assert result[CONF_QBT_PASSWORD] == ""
        assert result[CONF_IMAGE_ALLOWED_HOSTS] == ""

    def test_top_level_non_dict_preserved(self):
        data = {CONF_ADMIN_ONLY: True, "radarr": {CONF_RADARR_URL: "http://r"}}
        result = _flatten_sections(data)
        assert result[CONF_ADMIN_ONLY] is True
        assert result[CONF_RADARR_URL] == "http://r"

    def test_cleared_field_saves_as_empty_string(self):
        # HA omits empty text fields in section forms; _flatten_sections must fill them in
        data = {"radarr": {CONF_RADARR_API_KEY: "key"}}  # URL missing
        result = _flatten_sections(data)
        assert result[CONF_RADARR_URL] == ""


# ── _test_api_key_service ─────────────────────────────────────────────────────

class TestTestApiKeyService:
    @pytest.mark.asyncio
    async def test_success_returns_none(self):
        mock_resp = AsyncMock()
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)
        mock_resp.status = 200
        mock_resp.ok = True

        session = MagicMock()
        session.get = MagicMock(return_value=mock_resp)

        result = await _test_api_key_service(session, "http://radarr", "mykey", "api/v3/system/status")
        assert result is None

    @pytest.mark.asyncio
    async def test_401_returns_invalid_auth(self):
        mock_resp = AsyncMock()
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)
        mock_resp.status = 401
        mock_resp.ok = False

        session = MagicMock()
        session.get = MagicMock(return_value=mock_resp)

        result = await _test_api_key_service(session, "http://radarr", "badkey", "api/v3/system/status")
        assert result == "invalid_auth"

    @pytest.mark.asyncio
    async def test_non_ok_returns_cannot_connect(self):
        mock_resp = AsyncMock()
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)
        mock_resp.status = 500
        mock_resp.ok = False

        session = MagicMock()
        session.get = MagicMock(return_value=mock_resp)

        result = await _test_api_key_service(session, "http://radarr", "key", "api/v3/system/status")
        assert result == "cannot_connect"

    @pytest.mark.asyncio
    async def test_client_error_returns_cannot_connect(self):
        session = MagicMock()
        session.get = MagicMock(side_effect=aiohttp.ClientError("connection refused"))

        result = await _test_api_key_service(session, "http://radarr", "key", "api/v3/system/status")
        assert result == "cannot_connect"


# ── _test_qbt ─────────────────────────────────────────────────────────────────

class TestTestQbt:
    @pytest.mark.asyncio
    async def test_success_returns_none(self):
        mock_resp = AsyncMock()
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)
        mock_resp.ok = True
        mock_resp.text = AsyncMock(return_value="Ok.")

        session = MagicMock()
        session.post = MagicMock(return_value=mock_resp)

        result = await _test_qbt(session, "http://qbt", "admin", "password")
        assert result is None

    @pytest.mark.asyncio
    async def test_fails_returns_invalid_auth(self):
        mock_resp = AsyncMock()
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)
        mock_resp.ok = True
        mock_resp.text = AsyncMock(return_value="Fails.")

        session = MagicMock()
        session.post = MagicMock(return_value=mock_resp)

        result = await _test_qbt(session, "http://qbt", "admin", "wrongpass")
        assert result == "invalid_auth"

    @pytest.mark.asyncio
    async def test_non_ok_returns_cannot_connect(self):
        mock_resp = AsyncMock()
        mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_resp.__aexit__ = AsyncMock(return_value=False)
        mock_resp.ok = False
        mock_resp.text = AsyncMock(return_value="")

        session = MagicMock()
        session.post = MagicMock(return_value=mock_resp)

        result = await _test_qbt(session, "http://qbt", "admin", "pass")
        assert result == "cannot_connect"

    @pytest.mark.asyncio
    async def test_client_error_returns_cannot_connect(self):
        session = MagicMock()
        session.post = MagicMock(side_effect=aiohttp.ClientError("refused"))

        result = await _test_qbt(session, "http://qbt", "admin", "pass")
        assert result == "cannot_connect"


# ── _validate_input ───────────────────────────────────────────────────────────

class TestValidateInput:
    @pytest.mark.asyncio
    async def test_no_services_configured_returns_no_errors(self, base_config_data):
        errors = await _validate_input(base_config_data)
        assert errors == {}

    @pytest.mark.asyncio
    async def test_radarr_success(self, base_config_data):
        data = {**base_config_data, CONF_RADARR_URL: "http://radarr", CONF_RADARR_API_KEY: "key"}

        with patch("custom_components.harr.config_flow._make_session") as mock_make:
            mock_session = AsyncMock()
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)
            mock_make.return_value = mock_session

            with patch("custom_components.harr.config_flow._test_api_key_service", return_value=None) as mock_test:
                errors = await _validate_input(data)

        assert "radarr" not in errors

    @pytest.mark.asyncio
    async def test_radarr_invalid_auth(self, base_config_data):
        data = {**base_config_data, CONF_RADARR_URL: "http://radarr", CONF_RADARR_API_KEY: "badkey"}

        with patch("custom_components.harr.config_flow._make_session") as mock_make:
            mock_session = AsyncMock()
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)
            mock_make.return_value = mock_session

            with patch("custom_components.harr.config_flow._test_api_key_service", return_value="invalid_auth"):
                errors = await _validate_input(data)

        assert errors.get("radarr") == "invalid_auth"

    @pytest.mark.asyncio
    async def test_qbittorrent_success(self, base_config_data):
        data = {
            **base_config_data,
            CONF_QBT_URL: "http://qbt",
            CONF_QBT_USERNAME: "admin",
            CONF_QBT_PASSWORD: "pass",
        }

        with patch("custom_components.harr.config_flow._make_session") as mock_make:
            mock_session = AsyncMock()
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)
            mock_make.return_value = mock_session

            with patch("custom_components.harr.config_flow._test_qbt", return_value=None):
                errors = await _validate_input(data)

        assert "qbittorrent" not in errors

    @pytest.mark.asyncio
    async def test_sabnzbd_success(self, base_config_data):
        data = {**base_config_data, CONF_SABNZBD_URL: "http://sab", CONF_SABNZBD_API_KEY: "sabkey"}

        with patch("custom_components.harr.config_flow._make_session") as mock_make:
            mock_session = AsyncMock()
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)
            mock_make.return_value = mock_session

            with patch("custom_components.harr.config_flow._test_api_key_service", return_value=None):
                errors = await _validate_input(data)

        assert "sabnzbd" not in errors


# ── HarrConfigFlow ────────────────────────────────────────────────────────────

@pytest.fixture
def mock_config_flow(hass):
    """Create a HarrConfigFlow instance attached to hass."""
    flow = HarrConfigFlow()
    flow.hass = hass
    return flow


@pytest.mark.usefixtures("hass")
class TestHarrConfigFlow:
    @pytest.mark.asyncio
    async def test_step_import_creates_entry(self, hass, base_config_data):
        flow = HarrConfigFlow()
        flow.hass = hass
        # Prevent "already_configured" abort
        with patch.object(flow, "_async_current_entries", return_value=[]):
            result = await flow.async_step_import(base_config_data)
        assert result["type"] == "create_entry"
        assert result["title"] == "Harr"

    @pytest.mark.asyncio
    async def test_step_user_no_input_shows_form(self, hass):
        flow = HarrConfigFlow()
        flow.hass = hass
        with patch.object(flow, "_async_current_entries", return_value=[]):
            result = await flow.async_step_user(None)
        assert result["type"] == "form"
        assert result["step_id"] == "user"

    @pytest.mark.asyncio
    async def test_step_user_valid_input_creates_entry(self, hass, base_config_data):
        flow = HarrConfigFlow()
        flow.hass = hass
        # Wrap each section as the HA form would submit it
        user_input = {
            "radarr": {},
            "sonarr": {},
            "seerr": {},
            "bazarr": {},
            "qbittorrent": {},
            "sabnzbd": {},
            "access_control": {CONF_ADMIN_ONLY: False},
            "performance": {CONF_IMAGE_CACHE_DISK: False},
        }
        with patch.object(flow, "_async_current_entries", return_value=[]):
            with patch("custom_components.harr.config_flow._validate_input", return_value={}):
                result = await flow.async_step_user(user_input)
        assert result["type"] == "create_entry"

    @pytest.mark.asyncio
    async def test_step_user_validation_error_shows_form(self, hass):
        flow = HarrConfigFlow()
        flow.hass = hass
        user_input = {
            "radarr": {CONF_RADARR_URL: "http://bad"},
            "sonarr": {},
            "seerr": {},
            "bazarr": {},
            "qbittorrent": {},
            "sabnzbd": {},
            "access_control": {},
            "performance": {},
        }
        with patch.object(flow, "_async_current_entries", return_value=[]):
            with patch("custom_components.harr.config_flow._validate_input", return_value={"radarr": "invalid_auth"}):
                result = await flow.async_step_user(user_input)
        assert result["type"] == "form"
        assert result["errors"].get("radarr") == "invalid_auth"

    @pytest.mark.asyncio
    async def test_step_user_already_configured_aborts(self, hass, base_config_data):
        flow = HarrConfigFlow()
        flow.hass = hass
        with patch.object(flow, "_async_current_entries", return_value=[MagicMock()]):
            result = await flow.async_step_user(None)
        assert result["type"] == "abort"
        assert result["reason"] == "already_configured"

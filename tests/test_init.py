"""Tests for __init__.py integration setup."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch, call

import pytest

from custom_components.harr.const import (
    CONF_ADMIN_ONLY,
    CONF_RADARR_URL,
    CONF_SONARR_URL,
    DOMAIN,
)
from custom_components.harr import (
    _HTTP_REGISTERED_KEY,
    async_setup_entry,
    async_unload_entry,
)


def _make_config_entry(data):
    entry = MagicMock()
    entry.data = data
    entry.entry_id = "test_entry_id"
    entry.async_on_unload = MagicMock()
    entry.add_update_listener = MagicMock(return_value=MagicMock())
    return entry


def _make_hass(registered=False):
    hass = MagicMock()
    hass.data = {}
    if registered:
        hass.data[_HTTP_REGISTERED_KEY] = True
    hass.http = MagicMock()
    hass.http.register_view = MagicMock()
    hass.http.async_register_static_paths = AsyncMock()
    hass.config_entries = MagicMock()
    return hass


class TestAsyncSetupEntry:
    @pytest.mark.asyncio
    async def test_stores_entry_data_in_hass(self):
        data = {CONF_RADARR_URL: "http://radarr", CONF_ADMIN_ONLY: False}
        hass = _make_hass()
        entry = _make_config_entry(data)

        with patch("custom_components.harr.async_remove_panel"):
            with patch("custom_components.harr.panel_custom.async_register_panel", new_callable=AsyncMock):
                await async_setup_entry(hass, entry)

        assert hass.data[DOMAIN][CONF_RADARR_URL] == "http://radarr"

    @pytest.mark.asyncio
    async def test_registers_static_paths_and_views_once(self):
        hass = _make_hass()
        entry = _make_config_entry({CONF_ADMIN_ONLY: False})

        with patch("custom_components.harr.async_remove_panel"):
            with patch("custom_components.harr.panel_custom.async_register_panel", new_callable=AsyncMock):
                await async_setup_entry(hass, entry)

        hass.http.async_register_static_paths.assert_called_once()
        assert hass.http.register_view.call_count == 8  # 8 view classes

    @pytest.mark.asyncio
    async def test_does_not_re_register_views_on_second_setup(self):
        hass = _make_hass(registered=True)  # Already registered
        entry = _make_config_entry({CONF_ADMIN_ONLY: False})

        with patch("custom_components.harr.async_remove_panel"):
            with patch("custom_components.harr.panel_custom.async_register_panel", new_callable=AsyncMock):
                await async_setup_entry(hass, entry)

        hass.http.async_register_static_paths.assert_not_called()
        hass.http.register_view.assert_not_called()

    @pytest.mark.asyncio
    async def test_admin_only_true_registers_panel_with_require_admin(self):
        hass = _make_hass()
        entry = _make_config_entry({CONF_ADMIN_ONLY: True})

        with patch("custom_components.harr.async_remove_panel"):
            with patch("custom_components.harr.panel_custom.async_register_panel", new_callable=AsyncMock) as mock_panel:
                await async_setup_entry(hass, entry)

        call_kwargs = mock_panel.call_args.kwargs
        assert call_kwargs.get("require_admin") is True

    @pytest.mark.asyncio
    async def test_admin_only_false_registers_panel_without_require_admin(self):
        hass = _make_hass()
        entry = _make_config_entry({CONF_ADMIN_ONLY: False})

        with patch("custom_components.harr.async_remove_panel"):
            with patch("custom_components.harr.panel_custom.async_register_panel", new_callable=AsyncMock) as mock_panel:
                await async_setup_entry(hass, entry)

        call_kwargs = mock_panel.call_args.kwargs
        assert call_kwargs.get("require_admin") is False

    @pytest.mark.asyncio
    async def test_panel_removed_then_re_registered(self):
        hass = _make_hass()
        entry = _make_config_entry({CONF_ADMIN_ONLY: False})

        with patch("custom_components.harr.async_remove_panel") as mock_remove:
            with patch("custom_components.harr.panel_custom.async_register_panel", new_callable=AsyncMock) as mock_register:
                await async_setup_entry(hass, entry)

        mock_remove.assert_called_once()
        mock_register.assert_called_once()

    @pytest.mark.asyncio
    async def test_sets_http_registered_key(self):
        hass = _make_hass()
        entry = _make_config_entry({CONF_ADMIN_ONLY: False})

        with patch("custom_components.harr.async_remove_panel"):
            with patch("custom_components.harr.panel_custom.async_register_panel", new_callable=AsyncMock):
                await async_setup_entry(hass, entry)

        assert hass.data[_HTTP_REGISTERED_KEY] is True


class TestAsyncUnloadEntry:
    @pytest.mark.asyncio
    async def test_removes_panel_and_clears_domain_data(self):
        hass = _make_hass()
        hass.data[DOMAIN] = {"some": "data"}
        entry = _make_config_entry({})

        with patch("custom_components.harr.async_remove_panel") as mock_remove:
            result = await async_unload_entry(hass, entry)

        assert result is True
        mock_remove.assert_called_once_with(hass, "harr", warn_if_unknown=False)
        assert DOMAIN not in hass.data

    @pytest.mark.asyncio
    async def test_returns_true(self):
        hass = _make_hass()
        entry = _make_config_entry({})

        with patch("custom_components.harr.async_remove_panel"):
            result = await async_unload_entry(hass, entry)

        assert result is True

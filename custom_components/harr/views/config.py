"""Harr config endpoint — tells the frontend which services are configured."""
from __future__ import annotations

from homeassistant.components.http import HomeAssistantView

from ..const import (
    DOMAIN,
    CONF_RADARR_URL,
    CONF_SONARR_URL,
    CONF_SEERR_URL,
    CONF_BAZARR_URL,
    CONF_QBT_URL,
    CONF_SABNZBD_URL,
)


class HarrConfigView(HomeAssistantView):
    """Return a JSON object indicating which services are configured."""

    url = "/api/harr/config"
    name = "api:harr:config"
    requires_auth = True

    async def get(self, request):
        hass = request.app["hass"]
        data = hass.data.get(DOMAIN, {})
        return self.json({
            "radarr":      bool(data.get(CONF_RADARR_URL)),
            "sonarr":      bool(data.get(CONF_SONARR_URL)),
            "seerr":       bool(data.get(CONF_SEERR_URL)),
            "bazarr":      bool(data.get(CONF_BAZARR_URL)),
            "qbittorrent": bool(data.get(CONF_QBT_URL)),
            "sabnzbd":     bool(data.get(CONF_SABNZBD_URL)),
        })

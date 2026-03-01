"""Radarr proxy view."""
from ..const import CONF_RADARR_API_KEY, CONF_RADARR_URL, CONF_RADARR_VERIFY_SSL
from .base import GenericProxyView


class RadarrProxyView(GenericProxyView):
    """Proxy /api/harr/radarr/{path} → configured Radarr instance."""

    url = "/api/harr/radarr/{path:.*}"
    name = "api:harr:radarr"
    base_url_key = CONF_RADARR_URL
    verify_ssl_key = CONF_RADARR_VERIFY_SSL

    def _build_headers(self, config: dict) -> dict[str, str]:
        return {"X-Api-Key": config.get(CONF_RADARR_API_KEY, "")}

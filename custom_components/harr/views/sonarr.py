"""Sonarr proxy view."""
from ..const import CONF_SONARR_API_KEY, CONF_SONARR_URL, CONF_SONARR_VERIFY_SSL
from .base import GenericProxyView


class SonarrProxyView(GenericProxyView):
    """Proxy /api/harr/sonarr/{path} → configured Sonarr instance."""

    url = "/api/harr/sonarr/{path:.*}"
    name = "api:harr:sonarr"
    base_url_key = CONF_SONARR_URL
    verify_ssl_key = CONF_SONARR_VERIFY_SSL

    def _build_headers(self, config: dict) -> dict[str, str]:
        return {"X-Api-Key": config.get(CONF_SONARR_API_KEY, "")}

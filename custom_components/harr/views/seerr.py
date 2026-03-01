"""Seerr proxy view."""
from ..const import (
    CONF_SEERR_API_KEY,
    CONF_SEERR_URL,
    CONF_SEERR_VERIFY_SSL,
)
from .base import GenericProxyView


class SeerrProxyView(GenericProxyView):
    """Proxy /api/harr/seerr/{path} → configured Seerr instance."""

    url = "/api/harr/seerr/{path:.*}"
    name = "api:harr:seerr"
    base_url_key = CONF_SEERR_URL
    verify_ssl_key = CONF_SEERR_VERIFY_SSL

    def _build_headers(self, config: dict) -> dict[str, str]:
        return {"X-Api-Key": config.get(CONF_SEERR_API_KEY, "")}

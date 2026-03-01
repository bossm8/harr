"""Bazarr proxy view."""
from ..const import CONF_BAZARR_API_KEY, CONF_BAZARR_URL, CONF_BAZARR_VERIFY_SSL
from .base import GenericProxyView


class BazarrProxyView(GenericProxyView):
    """Proxy /api/harr/bazarr/{path} → configured Bazarr instance."""

    url = "/api/harr/bazarr/{path:.*}"
    name = "api:harr:bazarr"
    base_url_key = CONF_BAZARR_URL
    verify_ssl_key = CONF_BAZARR_VERIFY_SSL

    def _build_headers(self, config: dict) -> dict[str, str]:
        return {"X-Api-Key": config.get(CONF_BAZARR_API_KEY, "")}

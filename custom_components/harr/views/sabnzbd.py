"""SABnzbd proxy view."""
from ..const import CONF_SABNZBD_API_KEY, CONF_SABNZBD_URL, CONF_SABNZBD_VERIFY_SSL
from .base import GenericProxyView


class SABnzbdProxyView(GenericProxyView):
    """Proxy /api/harr/sabnzbd/{path} → configured SABnzbd instance.

    SABnzbd uses an 'apikey' query parameter for authentication rather than a
    request header, so we inject it via _build_params.
    """

    url = "/api/harr/sabnzbd/{path:.*}"
    name = "api:harr:sabnzbd"
    base_url_key = CONF_SABNZBD_URL
    verify_ssl_key = CONF_SABNZBD_VERIFY_SSL

    def _build_params(self, config: dict, params: dict) -> dict:
        return {"apikey": config.get(CONF_SABNZBD_API_KEY, "")}

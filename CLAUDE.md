# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Harr** is a Home Assistant custom integration that provides an nzb360-style media management sidebar panel. It supports Radarr, Sonarr, Seerr, Bazarr, qBittorrent, and SABnzbd — all services are optional.

## Development Environment

The devcontainer (`/.devcontainer/`) provides a full development environment:
- **`agent-devcontainer`** — Python 3.14 + Claude CLI, workspace at `/workspace`
- **`home-assistant`** — HA instance at `http://localhost:8123`, mounts `custom_components/harr/` read-only
- **`proxy`** — Squid MITM proxy on `127.0.0.1:3128` (required for Claude CLI in this environment)

To test changes: restart the `home-assistant` container (HA must reload to pick up Python changes; JS is served statically and reloads on browser refresh).

There are no build steps, no test suite, and no linter configuration. The integration installs directly from `custom_components/harr/`.

## Architecture

### Security / Proxy Pattern

All frontend API calls go through HA's HTTP server at `/api/harr/{service}/{path}`. The backend injects credentials server-side — they never reach the browser. The frontend authenticates to HA with a Bearer token; HA proxies to each upstream service.

### Backend (Python — `custom_components/harr/`)

- **`__init__.py`** — Entry point: registers config entry, mounts proxy views, serves the JS panel at `/harr-frontend/harr-panel.js`, and exposes the config endpoint.
- **`config_flow.py`** — UI wizard + YAML import for configuring service URLs/credentials.
- **`const.py`** — Domain constants and config keys.
- **`views/base.py`** (`GenericProxyView`) — Base aiohttp view that handles all HTTP methods, forwards requests to upstream, and injects credentials. Subclass this for each service.
- **`views/{service}.py`** — Service-specific proxy views; each overrides credential injection:
  - Radarr/Sonarr/Seerr/Bazarr: `X-Api-Key` header
  - qBittorrent: cookie-based session with auto-reauth on 403
  - SABnzbd: API key as query parameter
- **`views/config.py`** — `GET /api/harr/config` returns which services are configured (used by frontend to show/hide tabs).

### Frontend (Vanilla JS — `custom_components/harr/frontend/`)

No build tooling. Plain ES modules loaded directly by the browser.

- **`harr-panel.js`** — Root `<ha-harr>` custom element. Manages tab state and which tabs are visible based on configured services.
- **`sections/_base-section.js`** (`BaseSection`) — Abstract base for all tabs. Provides `harrFetch()` (wraps fetch with HA Bearer token), `getHarrConfig()`, and shared grid/modal/loading/error UI patterns.
- **`sections/{tab}.js`** — One file per tab: `discover`, `movies`, `shows`, `calendar`, `requests`, `downloads`.
- **`components/`** — Reusable elements: `media-card.js`, `download-item.js`, `request-item.js`, `icons.js`.

Make sure to follow UI and UX best practices seen in streaming apps like Netflix, Disney+ etc. For reactive apps functioning in browser and on mobile.

### Adding a New Service

1. Add constants to `const.py`.
2. Add config steps to `config_flow.py`.
3. Create `views/{service}.py` subclassing `GenericProxyView`.
4. Register the view in `__init__.py`.
5. Expose it via `views/config.py` so the frontend knows it's configured.
6. Add frontend section in `sections/` and register the tab in `harr-panel.js`.

### Adding a Config Option

When adding any new config field (service setting, feature toggle, etc.):

1. Add the constant to `const.py`.
2. Add `vol.Optional(CONF_..., default=...)` to **both** `STEP_USER_DATA_SCHEMA` in `config_flow.py` and the dynamic schema in `HarrOptionsFlow.async_step_init`.
3. **Update `strings.json`** — add the field under `data` (human-readable label), optionally under `data_description` (helper text shown below the field), and assign it to an appropriate `section` in both `config.step.user` and `options.step.init`. Add a new section entry if the field doesn't belong to an existing one.
4. **Mirror every change in `translations/<lang>.json` for the respective lang** — these files are the translation copy and must stay in sync with `strings.json`.
5. Wire the value in `__init__.py` (YAML flat mapping + use in `async_setup_entry`) and wherever the backend reads config from `hass.data[DOMAIN]`.
6. If the option affects behaviour at startup (e.g. panel registration flags), note in code comments that a HA restart is required for that part to take effect.

/**
 * Shared utilities and base class for Harr section components.
 */

export const SECTION_STYLES = `
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    min-height: 0;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: var(--harr-card-bg, #1c1c1c);
    border-bottom: 1px solid var(--harr-border, rgba(255,255,255,0.08));
    flex-shrink: 0;
  }

  .search-input {
    flex: 1;
    background: rgba(255,255,255,0.06);
    border: 1px solid var(--harr-border, rgba(255,255,255,0.12));
    border-radius: 8px;
    padding: 8px 14px;
    color: var(--primary-text-color, #e1e1e1);
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
  }

  .search-input:focus { border-color: var(--harr-accent, #e5a00d); }
  .search-input::placeholder { color: var(--harr-text-secondary, #9e9e9e); }

  .btn-primary {
    background: var(--harr-accent, #e5a00d);
    color: #000;
    border: none;
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    transition: opacity 0.15s;
  }

  .btn-primary:hover { opacity: 0.85; }

  .sub-tabs {
    display: flex;
    gap: 0;
    padding: 0 16px;
    background: var(--harr-card-bg, #1c1c1c);
    border-bottom: 1px solid var(--harr-border, rgba(255,255,255,0.08));
    flex-shrink: 0;
  }

  .sub-tab {
    padding: 10px 16px;
    font-size: 13px;
    cursor: pointer;
    color: var(--harr-text-secondary, #9e9e9e);
    border-bottom: 2px solid transparent;
    transition: color 0.15s, border-color 0.15s;
    user-select: none;
  }

  .sub-tab.active {
    color: var(--harr-accent, #e5a00d);
    border-bottom-color: var(--harr-accent, #e5a00d);
  }

  .content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain;
    padding-bottom: max(16px, env(safe-area-inset-bottom, 16px));
  }

  .poster-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, var(--harr-poster-width, 150px));
    gap: 16px;
    justify-content: center;
  }

  .list {
    display: flex;
    flex-direction: column;
    background: var(--harr-card-bg, #1c1c1c);
    border-radius: var(--harr-radius, 8px);
    overflow: hidden;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--harr-text-secondary, #9e9e9e);
    font-size: 14px;
    gap: 8px;
  }

  .empty .icon { font-size: 48px; opacity: 0.4; }

  .loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--harr-text-secondary, #9e9e9e);
    font-size: 14px;
    gap: 10px;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid rgba(255,255,255,0.1);
    border-top-color: var(--harr-accent, #e5a00d);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .error-msg {
    background: rgba(244,67,54,0.1);
    border: 1px solid rgba(244,67,54,0.3);
    color: #f44336;
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: var(--harr-card-bg, #2a2a2a);
    border: 1px solid var(--harr-border, rgba(255,255,255,0.15));
    border-radius: 10px;
    padding: 12px 20px;
    font-size: 13px;
    color: var(--primary-text-color, #e1e1e1);
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    z-index: 9999;
    animation: fadeInUp 0.25s ease;
  }

  .toast.success { border-color: #4caf50; color: #4caf50; }
  .toast.error   { border-color: #f44336; color: #f44336; }

  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Modal overlay */
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
  }

  .modal {
    background: var(--harr-card-bg, #1c1c1c);
    border-radius: 12px;
    padding: 24px;
    min-width: min(360px, calc(100vw - 32px));
    max-width: 520px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
  }

  .modal h2 {
    margin: 0 0 16px;
    font-size: 18px;
    font-weight: 700;
    color: var(--primary-text-color, #e1e1e1);
  }

  .modal .field {
    margin-bottom: 14px;
  }

  .modal label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--harr-text-secondary, #9e9e9e);
    margin-bottom: 5px;
  }

  .modal select,
  .modal input {
    width: 100%;
    box-sizing: border-box;
    background: rgba(255,255,255,0.06);
    border: 1px solid var(--harr-border, rgba(255,255,255,0.15));
    border-radius: 6px;
    padding: 9px 12px;
    color: var(--primary-text-color, #e1e1e1);
    font-size: 14px;
    outline: none;
  }

  .modal select option { background: #1c1c1c; }

  .modal .modal-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 20px;
  }

  .btn-secondary {
    background: rgba(255,255,255,0.08);
    border: 1px solid var(--harr-border, rgba(255,255,255,0.15));
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    color: var(--primary-text-color, #e1e1e1);
    transition: background 0.15s;
  }

  .btn-secondary:hover { background: rgba(255,255,255,0.12); }

  .section-header {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--harr-text-secondary, #9e9e9e);
    padding: 12px 0 6px;
  }

  /* ── Mobile ── */
  @media (max-width: 480px) {
    .content { padding: 8px; padding-bottom: max(8px, env(safe-area-inset-bottom, 8px)); }
    .toolbar  { padding: 8px 10px; gap: 8px; }
    .sub-tab  { padding: 8px 12px; font-size: 12px; }

    /* Full-screen modal — auto-height for short content, capped at full screen for tall */
    .modal-overlay { align-items: flex-end; justify-content: stretch; }
    .modal {
      width: 100%;
      max-width: 100%;
      height: auto;
      max-height: 100dvh;
      border-radius: 0;
      overflow-y: auto;
      overflow-x: hidden;
      padding: max(16px, env(safe-area-inset-top, 16px)) 16px 0;
    }
    .modal-actions {
      position: sticky;
      bottom: 0;
      background: var(--harr-card-bg, #1c1c1c);
      margin: 16px -16px 0;
      padding: 12px 16px max(20px, env(safe-area-inset-bottom, 20px));
      border-top: 1px solid var(--harr-border, rgba(255,255,255,0.08));
      flex-wrap: nowrap;
      justify-content: stretch;
      gap: 8px;
    }
    .modal-actions .btn-primary,
    .modal-actions .btn-secondary,
    .modal-actions .btn-danger { flex: 1; padding: 8px 8px; font-size: 12px; }
  }
`;

export const EXTRA_STYLES = `
  .result-list {
    max-height: 260px;
    overflow-y: auto;
    border: 1px solid var(--harr-border, rgba(255,255,255,0.12));
    border-radius: 8px;
    margin-bottom: 14px;
  }

  .result-item {
    display: flex;
    gap: 10px;
    padding: 8px 10px;
    cursor: pointer;
    border-bottom: 1px solid var(--harr-border, rgba(255,255,255,0.08));
    align-items: flex-start;
    transition: background 0.1s;
  }
  .result-item:last-child { border-bottom: none; }
  .result-item:hover { background: rgba(255,255,255,0.04); }
  .result-item.selected { background: rgba(229,160,13,0.12); }
  .result-item.selected:hover { background: rgba(229,160,13,0.16); }

  .result-poster {
    width: 42px;
    height: 63px;
    border-radius: 4px;
    object-fit: cover;
    flex-shrink: 0;
    background: #2a2a2a;
  }
  .result-poster-ph {
    width: 42px;
    height: 63px;
    border-radius: 4px;
    background: #2a2a2a;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
  }
  .result-text { flex: 1; min-width: 0; }
  .r-title { font-size: 13px; font-weight: 600; color: var(--primary-text-color, #e1e1e1); }
  .r-meta {
    font-size: 11px;
    color: var(--harr-text-secondary, #9e9e9e);
    margin-top: 2px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .modal-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 0;
    gap: 12px;
    color: var(--harr-text-secondary, #9e9e9e);
    font-size: 14px;
  }
`;

/**
 * Authenticated fetch to a harr proxy endpoint.
 * @param {object} hass  - Home Assistant object
 * @param {string} path  - URL path starting with /api/harr/...
 * @param {object} options - fetch options
 */
export async function harrFetch(hass, path, options = {}) {
  const token = hass?.auth?.data?.access_token;
  const res = await fetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  // Some endpoints return empty body (204 No Content)
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

/**
 * Base class for a Harr section element.
 * Subclasses should call super.connectedCallback() and super.set hass().
 */
export class BaseSection extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._loading = false;
    this._error = null;
  }

  set hass(value) {
    const wasSet = !!this._hass;
    this._hass = value;
    if (!wasSet) this._init();
  }

  get hass() { return this._hass; }

  connectedCallback() {
    // Sub-classes call super.connectedCallback() to ensure styles are added.
  }

  _init() {
    // Override in subclass to trigger initial data load.
  }

  /** Render a loading spinner into the given container element. */
  _renderLoading(container) {
    container.innerHTML = `<div class="loading"><div class="spinner"></div> Loading…</div>`;
  }

  /** Render an error message into the given container element. */
  _renderError(container, msg) {
    container.innerHTML = `<div class="error-msg">⚠️ ${_esc(msg)}</div>`;
  }

  /** Show a toast notification in the shadow root. */
  _toast(msg, type = "info", duration = 3000) {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    this.shadowRoot.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }
}

function _esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Module-level cache — all components share one fetch result
let _harrConfigCache = null;
let _harrConfigInflight = null;

/**
 * Fetch /api/harr/config once and cache result for the ES module lifetime.
 * Returns { radarr: bool, sonarr: bool, seerr: bool, bazarr: bool,
 *           qbittorrent: bool, sabnzbd: bool }
 */
/**
 * Route a poster image URL through the HA image cache proxy at /api/harr/image.
 * The proxy caches responses server-side so subsequent loads skip the CDN entirely.
 * Requires an absolute URL (e.g. TMDB CDN remoteUrl — not a Radarr/Sonarr relative path).
 */
export function proxyImageUrl(rawUrl) {
  if (!rawUrl) return null;
  return `/api/harr/image?url=${encodeURIComponent(rawUrl)}`;
}

export async function getHarrConfig(hass) {
  if (_harrConfigCache) return _harrConfigCache;
  if (!_harrConfigInflight) {
    _harrConfigInflight = harrFetch(hass, "/api/harr/config")
      .then(cfg => { _harrConfigCache = cfg; return cfg; })
      .catch(() => { _harrConfigInflight = null; return {}; });
  }
  return _harrConfigInflight;
}

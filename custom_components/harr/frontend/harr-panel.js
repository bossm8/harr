/**
 * Harr — Home Assistant media management panel
 * Main panel web component: <ha-harr>
 */

import "./sections/discover.js";
import "./sections/movies.js";
import "./sections/shows.js";
import "./sections/calendar.js";
import "./sections/requests.js";
import "./sections/downloads.js";
import { getHarrConfig } from "./sections/_base-section.js";
import { SONARR, RADARR, SEERR } from "./components/icons.js";

const TABS = [
  { id: "discover",  label: "Discover",   icon: "🔥" },
  { id: "movies",    label: "Movies",     icon: RADARR },
  { id: "shows",     label: "Shows",      icon: SONARR },
  { id: "calendar",  label: "Calendar",   icon: "📅" },
  { id: "requests",  label: "Requests",   icon: SEERR },
  { id: "downloads", label: "Downloads",  icon: "⬇️" },
];

// Maps each tab to the services it requires (tab shown if ANY is configured)
const TAB_SERVICES = {
  discover:  ["seerr"],
  movies:    ["radarr"],
  shows:     ["sonarr"],
  calendar:  ["radarr", "sonarr"],
  requests:  ["seerr"],
  downloads: ["qbittorrent", "sabnzbd"],
};

const STYLES = `
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--primary-background-color, #111);
    color: var(--primary-text-color, #e1e1e1);
    font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
    --harr-card-bg: var(--card-background-color, #1c1c1c);
    --harr-accent: var(--primary-color, #e5a00d);
    --harr-text-secondary: var(--secondary-text-color, #9e9e9e);
    --harr-border: rgba(255,255,255,0.08);
    --harr-radius: 8px;
    --harr-poster-width: 150px;
    --harr-poster-ratio: 1.5;
  }

  .tab-bar {
    display: flex;
    background: var(--harr-card-bg);
    border-bottom: 1px solid var(--harr-border);
    overflow-x: auto;
    scrollbar-width: none;
    flex-shrink: 0;
  }

  .tab-bar::-webkit-scrollbar { display: none; }

  .tab {
    --tab-text-size: clamp(13px, 1.2vw, 15px);
    --tab-icon-size: clamp(16px, 1.6vw, 22px);
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 14px 20px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    white-space: nowrap;
    color: var(--harr-text-secondary);
    border-bottom: 3px solid transparent;
    transition: color 0.15s, border-color 0.15s;
    user-select: none;
  }

  .tab:hover { color: var(--primary-text-color); }

  .tab.active {
    color: var(--harr-accent);
    border-bottom-color: var(--harr-accent);
  }

  .tab-icon {
    width: 1em;
    height: 1em;
    font-size: var(--tab-icon-size);
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
  }

  .tab-icon--svg svg {
    width: 1em !important;
    height: 1em !important;
    display: block;
  }

  .tab-icon--emoji {
    font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
  }

  .section-container {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* ── HA-style top header ── */
  .ha-header {
    display: flex;
    align-items: center;
    height: 56px;
    padding: 0 8px 0 4px;
    background: var(--app-header-background-color, var(--harr-card-bg, #1c1c1c));
    color: var(--app-header-text-color, var(--primary-text-color, #e1e1e1));
    border-bottom: 1px solid var(--harr-border);
    flex-shrink: 0;
    box-sizing: border-box;
  }

  .ha-header-menu {
    width: 48px;
    height: 48px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    color: inherit;
    border-radius: 50%;
    transition: background 0.15s;
  }
  .ha-header-menu:hover { background: rgba(255,255,255,0.08); }
  .ha-header-menu svg { width: 24px; height: 24px; display: block; }

  .ha-header-title {
    flex: 1;
    font-size: 20px;
    font-weight: 400;
    letter-spacing: 0.25px;
    color: inherit;
    padding-left: 4px;
  }

  /* ── Mobile ── */
  @media (max-width: 480px) {
    :host {
      /* 3 poster columns: (viewport - 2x8px content-padding - 2x16px gaps) / 3 */
      --harr-poster-width: calc((100vw - 48px) / 3);
    }

    /* Move tab bar below content for thumb-friendly bottom navigation */
    .tab-bar {
      order: 2;
      border-top: 1px solid var(--harr-border);
      border-bottom: none;
      justify-content: space-around;
      overflow-x: hidden;
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }
    .section-container { order: 1; }

    /* Icon + label stacked, generous tap target */
    .tab {
      flex-direction: column;
      flex: 1;
      padding: 8px 4px;
      gap: 3px;
      font-size: 10px;
      min-height: 48px;
      justify-content: center;
      border-bottom: none;
      border-top: 3px solid transparent;
    }
    .tab.active { border-top-color: var(--harr-accent); border-bottom-color: transparent; }
    .tab-icon { font-size: 22px; }
  }

  @media (min-width: 871px) {
    .ha-header-menu { display: none; }
  }
`;

class HaHarr extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._activeTab = "discover";
  }

  set hass(hass) {
    this._hass = hass;
    this._propagateHass();
    if (!this._configFetched) {
      this._configFetched = true;
      getHarrConfig(hass).then(cfg => this._applyConfig(cfg));
    }
  }

  set panel(panel) {
    this._panel = panel;
  }

  connectedCallback() {
    this._render();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  _render() {
    const shadow = this.shadowRoot;
    shadow.innerHTML = "";

    const style = document.createElement("style");
    style.textContent = STYLES;
    shadow.appendChild(style);

    const header = document.createElement("div");
    header.className = "ha-header";
    header.innerHTML = `
      <button class="ha-header-menu" id="menu-btn" aria-label="Open navigation menu">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 18v-2h18v2H3zm0-5v-2h18v2H3zm0-5V6h18v2H3z"/>
        </svg>
      </button>
      <span class="ha-header-title">Harr</span>
    `;
    shadow.appendChild(header);

    shadow.getElementById("menu-btn").addEventListener("click", () => {
      this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
    });

    const tabBar = document.createElement("div");
    tabBar.className = "tab-bar";
    for (const tab of TABS) {
      const btn = document.createElement("div");
      btn.className = `tab${tab.id === this._activeTab ? " active" : ""}`;
      btn.dataset.tab = tab.id;
      const isSvg = /^\s*<svg[\s>]/i.test(tab.icon);
      btn.innerHTML = `<span class="tab-icon ${isSvg ? "tab-icon--svg" : "tab-icon--emoji"}">${tab.icon}</span><span>${tab.label}</span>`;
      btn.addEventListener("click", () => this._switchTab(tab.id));
      tabBar.appendChild(btn);
    }
    shadow.appendChild(tabBar);

    const container = document.createElement("div");
    container.className = "section-container";
    shadow.appendChild(container);

    this._container = container;
    this._renderSection();

    shadow.addEventListener("harr-navigate", (e) => {
      const { tab, tmdbId } = e.detail;
      this._switchTab(tab);
      if (tmdbId && this._activeSection) {
        this._activeSection.pendingTmdbId = tmdbId;
      }
    });
  }

  _switchTab(tabId) {
    if (tabId === this._activeTab) return;
    this._activeTab = tabId;

    // Update active class on tabs
    this.shadowRoot.querySelectorAll(".tab").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    });

    this._renderSection();
  }

  _renderSection() {
    if (!this._container) return;
    this._container.innerHTML = "";

    const tagName = `harr-${this._activeTab}`;
    let section = document.createElement(tagName);
    if (this._hass) section.hass = this._hass;
    this._container.appendChild(section);
    this._activeSection = section;
  }

  _propagateHass() {
    if (this._activeSection) {
      this._activeSection.hass = this._hass;
    }
  }

  _applyConfig(cfg) {
    const tabBar = this.shadowRoot.querySelector(".tab-bar");
    if (!tabBar) return;

    tabBar.querySelectorAll(".tab").forEach(btn => {
      const required = TAB_SERVICES[btn.dataset.tab] || [];
      const visible = required.length === 0 || required.some(svc => cfg[svc]);
      btn.style.display = visible ? "" : "none";
    });

    // If the active tab became hidden, switch to first visible tab
    const activeBtn = tabBar.querySelector(`.tab[data-tab="${this._activeTab}"]`);
    if (activeBtn && activeBtn.style.display === "none") {
      const firstVisible = tabBar.querySelector(".tab:not([style*='display: none'])");
      if (firstVisible) this._switchTab(firstVisible.dataset.tab);
    }
  }
}

customElements.get("ha-harr") || customElements.define("ha-harr", HaHarr);

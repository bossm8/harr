/**
 * <harr-home> — Releasing Soon home page.
 * Shows monitored movies (Radarr) and shows (Sonarr) releasing in the next 30 days
 * as horizontal scrollable poster rows, Netflix-style.
 */

import { BaseSection, harrFetch, getHarrConfig, proxyImageUrl } from "./_base-section.js";

const STYLES = `
  :host {
    display: block;
    overflow-y: auto;
    padding: 20px 16px;
    box-sizing: border-box;
  }

  .home-section-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--primary-text-color, #e1e1e1);
    margin-bottom: 20px;
  }

  .home-row {
    margin-bottom: 32px;
  }

  .home-row-header {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--harr-text-secondary, #9e9e9e);
    margin-bottom: 14px;
  }

  .home-row-container {
    position: relative;
  }

  .home-row-container::before,
  .home-row-container::after {
    content: "";
    position: absolute;
    top: 0; bottom: 0;
    width: 64px;
    pointer-events: none;
    z-index: 1;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .home-row-container::before {
    left: 0;
    background: linear-gradient(to right, var(--primary-background-color, #111), transparent);
  }
  .home-row-container::after {
    right: 0;
    background: linear-gradient(to left, var(--primary-background-color, #111), transparent);
  }
  .home-row-container.shadow-left::before  { opacity: 1; }
  .home-row-container.shadow-right::after  { opacity: 1; }

  .home-scroll {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    scrollbar-width: none;
    padding: 4px 4px 14px;
  }
  .home-scroll::-webkit-scrollbar { display: none; }

  .home-card {
    flex-shrink: 0;
    width: var(--harr-poster-width, 130px);
    cursor: pointer;
    border-radius: var(--harr-radius, 8px);
    overflow: visible;
    transition: transform 0.18s, box-shadow 0.18s;
  }
  .home-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 28px rgba(0,0,0,0.55);
  }

  .home-poster {
    width: 100%;
    aspect-ratio: 2 / 3;
    object-fit: cover;
    display: block;
    background: rgba(255,255,255,0.06);
    border-radius: var(--harr-radius, 8px);
  }
  .home-poster-ph {
    width: 100%;
    aspect-ratio: 2 / 3;
    background: rgba(255,255,255,0.06);
    border-radius: var(--harr-radius, 8px);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 36px;
  }

  .home-card-footer {
    padding: 7px 2px 0;
  }
  .home-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--primary-text-color, #e1e1e1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 2px;
  }
  .home-ep {
    font-size: 10px;
    font-weight: 600;
    color: var(--harr-text-secondary, #9e9e9e);
    margin-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .home-days {
    font-size: 11px;
    font-weight: 700;
    color: var(--harr-accent, #e5a00d);
  }
  .home-row.sonarr .home-days {
    color: #2196f3;
  }

  .home-empty {
    font-size: 13px;
    color: var(--harr-text-secondary, #9e9e9e);
    padding: 10px 0;
  }

  .home-no-services {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 60px 24px;
    text-align: center;
    color: var(--harr-text-secondary, #9e9e9e);
    font-size: 14px;
  }
  .home-no-services .icon { font-size: 48px; }

  .home-spinner-wrap {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 20px 0;
    color: var(--harr-text-secondary, #9e9e9e);
    font-size: 13px;
  }
  .spinner {
    width: 20px; height: 20px;
    border: 2px solid rgba(255,255,255,0.12);
    border-top-color: var(--harr-accent, #e5a00d);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

class HarrHome extends BaseSection {
  connectedCallback() {
    this._render();
    if (this._hass) this._load();
  }

  _init() {
    if (this.shadowRoot.children.length > 0) this._load();
  }

  _render() {
    this.shadowRoot.innerHTML = `<style>${STYLES}</style><div id="home-content"></div>`;
  }

  async _load() {
    const root = this.shadowRoot.getElementById("home-content");
    root.innerHTML = `<div class="home-spinner-wrap"><div class="spinner"></div> Loading…</div>`;

    const today = new Date();
    const later = new Date(today);
    later.setDate(later.getDate() + 30);
    const start = _isoDate(today);
    const end   = _isoDate(later);

    const cfg = await getHarrConfig(this._hass);

    if (!cfg.radarr && !cfg.sonarr) {
      root.innerHTML = `
        <div class="home-no-services">
          <div class="icon">📡</div>
          <span>Configure Radarr or Sonarr to see upcoming releases here.</span>
        </div>`;
      return;
    }

    const [moviesResult, showsResult] = await Promise.allSettled([
      cfg.radarr
        ? harrFetch(this._hass, `/api/harr/radarr/api/v3/calendar?start=${start}&end=${end}&unmonitored=false`)
        : Promise.resolve([]),
      cfg.sonarr
        ? harrFetch(this._hass, `/api/harr/sonarr/api/v3/calendar?start=${start}&end=${end}&includeSeries=true&unmonitored=false`)
        : Promise.resolve([]),
    ]);

    let movies = [];
    if (moviesResult.status === "fulfilled") {
      movies = (moviesResult.value || [])
        .filter(m => m.digitalRelease && m.digitalRelease.slice(0, 10) >= start && m.digitalRelease.slice(0, 10) <= end)
        .sort((a, b) => a.digitalRelease.localeCompare(b.digitalRelease));
    }

    let shows = [];
    if (showsResult.status === "fulfilled") {
      const seriesMap = new Map();
      for (const ep of (showsResult.value || [])) {
        if (!ep.airDateUtc) continue;
        const key = ep.series?.tvdbId ?? ep.series?.title;
        if (!key) continue;
        const existing = seriesMap.get(key);
        if (!existing) {
          seriesMap.set(key, { ep, count: 1 });
        } else {
          existing.count++;
          if (ep.airDateUtc < existing.ep.airDateUtc) existing.ep = ep;
        }
      }
      shows = [...seriesMap.values()].sort((a, b) => a.ep.airDateUtc.localeCompare(b.ep.airDateUtc));
    }

    root.innerHTML = "";

    const title = document.createElement("h2");
    title.className = "home-section-title";
    title.textContent = "Downloading Soon";
    root.appendChild(title);

    if (cfg.radarr) {
      root.appendChild(this._buildRow("Movies", "radarr", movies, m => {
        const poster = m.images?.find(i => i.coverType === "poster");
        const url = proxyImageUrl(poster?.remoteUrl || poster?.url || null);
        const days = _daysUntil(m.digitalRelease);
        return this._makeCard(url, m.title || "Unknown", days, "movies", m.tmdbId, "🎬");
      }));
    }

    if (cfg.sonarr) {
      root.appendChild(this._buildRow("Shows", "sonarr", shows, ({ ep, count }) => {
        const poster = ep.series?.images?.find(i => i.coverType === "poster");
        const url = proxyImageUrl(poster?.remoteUrl || poster?.url || null);
        const days = _daysUntil(ep.airDateUtc);
        const epLabel = count === 1
          ? `S${String(ep.seasonNumber).padStart(2, "0")}E${String(ep.episodeNumber).padStart(2, "0")}`
          : `${count} episodes`;
        return this._makeCard(url, ep.series?.title || "Unknown", days, "shows", ep.series?.tmdbId, "📺", epLabel);
      }));
    }
  }

  _buildRow(heading, serviceClass, items, buildCard) {
    const row = document.createElement("div");
    row.className = `home-row ${serviceClass}`;

    const header = document.createElement("div");
    header.className = "home-row-header";
    header.textContent = heading;
    row.appendChild(header);

    const container = document.createElement("div");
    container.className = "home-row-container";

    const scroll = document.createElement("div");
    scroll.className = "home-scroll";

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "home-empty";
      empty.textContent = "No upcoming releases in the next 30 days";
      scroll.appendChild(empty);
    } else {
      items.forEach(item => scroll.appendChild(buildCard(item)));
    }

    container.appendChild(scroll);
    row.appendChild(container);

    // Wire up dynamic left/right scroll shadows
    const updateShadows = () => {
      const atStart = scroll.scrollLeft <= 1;
      const atEnd   = scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 1;
      container.classList.toggle("shadow-left",  !atStart);
      container.classList.toggle("shadow-right", !atEnd);
    };
    scroll.addEventListener("scroll", updateShadows, { passive: true });
    requestAnimationFrame(() => requestAnimationFrame(updateShadows));

    return row;
  }

  _makeCard(posterUrl, title, days, tab, tmdbId, placeholder, epLabel = null) {
    const card = document.createElement("div");
    card.className = "home-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");

    const imgEl = posterUrl
      ? Object.assign(document.createElement("img"), {
          className: "home-poster", src: posterUrl, loading: "lazy", alt: "",
        })
      : Object.assign(document.createElement("div"), {
          className: "home-poster-ph", textContent: placeholder,
        });
    card.appendChild(imgEl);

    const footer = document.createElement("div");
    footer.className = "home-card-footer";
    footer.innerHTML = `
      <div class="home-title">${_esc(title)}</div>
      ${epLabel ? `<div class="home-ep">${_esc(epLabel)}</div>` : ""}
      <div class="home-days">${_esc(_daysLabel(days))}</div>
    `;
    card.appendChild(footer);

    const navigate = () => {
      if (!tmdbId) return;
      this.dispatchEvent(new CustomEvent("harr-navigate", {
        detail: { tab, tmdbId },
        bubbles: true, composed: true,
      }));
    };
    card.addEventListener("click", navigate);
    card.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") navigate(); });

    return card;
  }
}

function _isoDate(d) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function _daysUntil(isoStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(isoStr); target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function _daysLabel(days) {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

function _esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

customElements.get("harr-home") || customElements.define("harr-home", HarrHome);

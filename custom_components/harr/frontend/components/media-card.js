/**
 * <harr-media-card> — poster card for a movie or TV show.
 *
 * Properties:
 *   item    — { title, year, posterUrl, status, overview, _raw }
 *   badge   — optional status badge text override
 *   hass    — Home Assistant object (enables management modal on click)
 *   service — "radarr" | "sonarr" (required alongside hass for management)
 *
 * Events:
 *   harr-card-click  — fired on click when service is NOT set; detail = { item }
 *   harr-manage-done — fired (bubbling) after a successful save or delete
 */

import { harrFetch, getHarrConfig } from "../sections/_base-section.js";

const SERVICE_CONFIG = {
  radarr: {
    base: "/api/harr/radarr",
    itemPath: "movie",
    icon: "🎬",
    command: (id) => ({ name: "MoviesSearch", movieIds: [id] }),
    bazarrInfo: (id) => `/api/harr/bazarr/api/movies?radarrid[]=${id}`,
    bazarrSearch: (id) => `/api/harr/bazarr/api/movies?radarrid=${id}&action=search-missing`,
  },
  sonarr: {
    base: "/api/harr/sonarr",
    itemPath: "series",
    icon: "📺",
    command: (id) => ({ name: "SeriesSearch", seriesId: id }),
    bazarrInfo: (id) => `/api/harr/bazarr/api/series?seriesid[]=${id}`,
    bazarrSearch: (id) => `/api/harr/bazarr/api/series?seriesid=${id}&action=search-missing`,
  },
};

const STATUS_COLORS = {
  available:          "#4caf50",
  downloaded:         "#4caf50",
  monitored:          "#e5a00d",
  unmonitored:        "#9e9e9e",
  missing:            "#f44336",
  partial:            "#ff9800",
  pending:            "#2196f3",
  processing:         "#ff9800",
  partiallyavailable: "#ff9800",
};

const CARD_STYLES = `
  :host {
    display: block;
    --card-width: var(--harr-poster-width, 150px);
  }

  .card {
    width: var(--card-width);
    border-radius: var(--harr-radius, 8px);
    overflow: hidden;
    background: var(--harr-card-bg, #1c1c1c);
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
    position: relative;
  }

  .card:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  }

  .poster-wrap {
    position: relative;
    width: 100%;
    padding-top: 150%;
    background: #2a2a2a;
    overflow: hidden;
  }

  .poster {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .poster-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 48px;
    color: #444;
  }

  .badge {
    position: absolute;
    top: 6px;
    right: 6px;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: rgba(0,0,0,0.7);
    backdrop-filter: blur(4px);
    color: #fff;
  }

  .info {
    padding: 8px 10px 10px;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 4px;
    overflow: hidden;
    margin-bottom: 2px;
  }

  .title {
    font-size: 13px;
    font-weight: 600;
    color: var(--primary-text-color, #e1e1e1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    min-width: 0;
  }

  .vote {
    flex-shrink: 0;
    font-size: 11px;
    color: #e5a00d;
    font-weight: 700;
    white-space: nowrap;
  }

  .year {
    font-size: 11px;
    color: var(--harr-text-secondary, #9e9e9e);
  }

  /* ── Modal ── */

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
    font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
    color: var(--primary-text-color, #e1e1e1);
  }

  .modal h2 {
    margin: 0 0 12px;
    font-size: 18px;
    font-weight: 700;
  }

  .manage-header {
    display: flex;
    gap: 14px;
    margin-bottom: 16px;
  }

  .manage-poster {
    width: 70px;
    height: 105px;
    border-radius: 6px;
    object-fit: cover;
    flex-shrink: 0;
    background: #2a2a2a;
  }

  .manage-poster-ph {
    width: 70px;
    height: 105px;
    border-radius: 6px;
    background: #2a2a2a;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
  }

  .manage-overview {
    font-size: 12px;
    color: var(--harr-text-secondary, #9e9e9e);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 5;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin: 0;
  }

  .field { margin-bottom: 14px; }

  .field label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--harr-text-secondary, #9e9e9e);
    margin-bottom: 5px;
  }

  .field select {
    width: 100%;
    box-sizing: border-box;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 6px;
    padding: 9px 12px;
    color: var(--primary-text-color, #e1e1e1);
    font-size: 14px;
    outline: none;
  }

  .field select option { background: #1c1c1c; }

  .modal-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    margin-top: 20px;
    flex-wrap: wrap;
  }

  .btn-primary {
    background: var(--harr-accent, #e5a00d);
    color: #000;
    border: none;
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  .btn-primary:hover { opacity: 0.85; }
  .btn-primary:disabled { opacity: 0.5; cursor: default; }

  .btn-secondary {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    color: var(--primary-text-color, #e1e1e1);
    transition: background 0.15s;
  }
  .btn-secondary:hover { background: rgba(255,255,255,0.12); }
  .btn-secondary:disabled { opacity: 0.5; cursor: default; }

  .btn-danger {
    background: rgba(244,67,54,0.15);
    border: 1px solid rgba(244,67,54,0.4);
    color: #f44336;
    border-radius: 8px;
    padding: 8px 16px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-danger:hover { background: rgba(244,67,54,0.28); }

  .modal-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 0;
    gap: 12px;
    color: var(--harr-text-secondary, #9e9e9e);
    font-size: 14px;
  }

  .spinner {
    width: 22px;
    height: 22px;
    border: 3px solid rgba(255,255,255,0.1);
    border-top-color: var(--harr-accent, #e5a00d);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .error-msg {
    background: rgba(244,67,54,0.1);
    border: 1px solid rgba(244,67,54,0.3);
    color: #f44336;
    border-radius: 8px;
    padding: 12px 16px;
    font-size: 13px;
  }

  .delete-confirm {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: rgba(244,67,54,0.08);
    border: 1px solid rgba(244,67,54,0.25);
    border-radius: 8px;
    margin-top: 12px;
  }
  .delete-confirm p { margin: 0; font-size: 13px; color: #f44336; }
  .delete-confirm .dc-btns { display: flex; gap: 8px; }

  .section-divider {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--harr-text-secondary, #9e9e9e);
    padding: 14px 0 6px;
    border-top: 1px solid rgba(255,255,255,0.08);
    margin-top: 6px;
  }

  .release-date-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    padding: 4px 0;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    color: var(--primary-text-color, #e1e1e1);
  }
  .release-date-label { color: var(--harr-text-secondary, #9e9e9e); }
  .release-dates-block { margin-bottom: 16px; }
  .sub-langs { display: flex; flex-wrap: wrap; gap: 5px; padding: 6px 0 10px; }
  .sub-lang {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
  }
  .sub-lang.have {
    background: rgba(76,175,80,0.15);
    color: #4caf50;
    border: 1px solid rgba(76,175,80,0.3);
  }
  .sub-lang.missing {
    background: rgba(229,160,13,0.12);
    color: var(--harr-accent, #e5a00d);
    border: 1px solid rgba(229,160,13,0.3);
  }
  .genre-pills { display: flex; flex-wrap: wrap; gap: 5px; padding: 6px 0 12px; }
  .genre-pill {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
    background: rgba(255,255,255,0.06);
    color: var(--harr-text-secondary, #9e9e9e);
    border: 1px solid rgba(255,255,255,0.12);
  }
  .sub-episode-summary { font-size: 13px; color: var(--harr-text-secondary, #9e9e9e); padding: 6px 0 10px; }
  .sub-episode-summary .count-missing { color: var(--harr-accent, #e5a00d); font-weight: 600; }
  .btn-subtitle {
    background: none;
    border: 1px solid var(--harr-accent, #e5a00d);
    color: var(--harr-accent, #e5a00d);
    border-radius: 6px;
    padding: 4px 12px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
  }
  .btn-subtitle:hover { background: rgba(229,160,13,0.1); }
  .btn-subtitle:disabled { opacity: 0.5; cursor: default; }
  .bazarr-na { font-size: 12px; color: var(--harr-text-secondary, #9e9e9e); padding: 4px 0; }

  /* ── Episode accordion ── */

  .ep-season {
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    margin-bottom: 8px;
    overflow: hidden;
  }

  .ep-season summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    list-style: none;
    background: rgba(255,255,255,0.03);
    user-select: none;
  }

  .ep-season summary::-webkit-details-marker { display: none; }
  .ep-season summary::before { content: "▶"; font-size: 10px; transition: transform 0.15s; flex-shrink: 0; }
  .ep-season[open] summary::before { transform: rotate(90deg); }

  .ep-season-count {
    font-size: 12px;
    font-weight: 400;
    color: var(--harr-text-secondary, #9e9e9e);
    flex: 1;
  }

  .ep-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-top: 1px solid rgba(255,255,255,0.05);
    font-size: 12px;
  }

  .ep-num {
    flex-shrink: 0;
    color: var(--harr-text-secondary, #9e9e9e);
    font-size: 11px;
    width: 32px;
  }

  .ep-title {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ep-file-ok { color: #4caf50; flex-shrink: 0; }
  .ep-file-na { color: #9e9e9e; flex-shrink: 0; }

  .ep-sub-chips { display: flex; gap: 4px; flex-wrap: wrap; flex-shrink: 0; }
  .ep-sub-chip {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 10px;
    font-weight: 600;
  }
  .ep-sub-chip.have    { background: rgba(76,175,80,0.15);   color: #4caf50; border: 1px solid rgba(76,175,80,0.3); }
  .ep-sub-chip.missing { background: rgba(229,160,13,0.12);  color: #e5a00d; border: 1px solid rgba(229,160,13,0.3); }

  /* ── Mobile ── */
  @media (max-width: 480px) {
    .modal          { padding: 16px; }
    .manage-header  { flex-direction: column; }
    .manage-poster,
    .manage-poster-ph { width: 100%; height: auto; aspect-ratio: 2 / 3; }
  }

  /* ── Episode card (multi-line layout) ── */

  .ep-card {
    padding: 7px 12px;
    border-top: 1px solid rgba(255,255,255,0.05);
  }

  .ep-card-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .ep-card-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-left: 38px;
    margin-top: 3px;
  }

  .ep-card-subs {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    padding-left: 38px;
    margin-top: 3px;
    margin-bottom: 2px;
  }

  .ep-card-filename {
    padding-left: 38px;
    margin-top: 3px;
    font-size: 11px;
    color: var(--harr-text-secondary, #9e9e9e);
    word-break: break-all;
    line-height: 1.3;
  }
`;

class HarrMediaCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._item = null;
    this._hass = null;
    this._service = null;
  }

  set item(value) {
    this._item = value;
    this._render();
  }

  set hass(value) {
    this._hass = value;
  }

  set service(value) {
    this._service = value;
  }

  connectedCallback() {
    this._render();
  }

  _render() {
    const item = this._item;
    if (!item) return;

    const shadow = this.shadowRoot;
    shadow.innerHTML = "";

    const style = document.createElement("style");
    style.textContent = CARD_STYLES;
    shadow.appendChild(style);

    const card = document.createElement("div");
    card.className = "card";

    // Poster
    const posterWrap = document.createElement("div");
    posterWrap.className = "poster-wrap";

    const icon = SERVICE_CONFIG[this._service]?.icon ?? "🎬";

    if (item.posterUrl) {
      const img = document.createElement("img");
      img.className = "poster";
      img.src = item.posterUrl;
      img.alt = item.title;
      img.loading = "lazy";
      img.onerror = () => {
        img.remove();
        posterWrap.insertAdjacentHTML("beforeend", `<div class="poster-placeholder">${icon}</div>`);
      };
      posterWrap.appendChild(img);
    } else {
      posterWrap.innerHTML = `<div class="poster-placeholder">${icon}</div>`;
    }

    // Status badge
    const statusKey = (item.status || "").toLowerCase().replace(/\s/g, "");
    const dotColor  = STATUS_COLORS[statusKey] || "#9e9e9e";
    const badgeText = this.getAttribute("badge") || item.statusMonitor || item.status || "";
    if (badgeText) {
      const badge = document.createElement("div");
      badge.className = "badge";
      badge.innerHTML = `${_esc(badgeText)}<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dotColor};margin-left:6px;vertical-align:middle;flex-shrink:0"></span>`;
      posterWrap.appendChild(badge);
    }

    card.appendChild(posterWrap);

    // Info
    const info = document.createElement("div");
    info.className = "info";
    info.innerHTML = `
      <div class="title-row">
        <div class="title" title="${_esc(item.title)}">${_esc(item.title)}</div>
        ${item.voteAverage ? `<div class="vote">★ ${Number(item.voteAverage).toFixed(1)}</div>` : ""}
      </div>
      <div class="year">${item.year || ""}</div>
    `;
    card.appendChild(info);

    // Click: manage modal if service is set, otherwise fire event
    card.addEventListener("click", () => {
      if (this._service && this._hass && item._raw) {
        this._openManageModal(item._raw);
      } else {
        this.dispatchEvent(new CustomEvent("harr-card-click", {
          detail: { item },
          bubbles: true,
          composed: true,
        }));
      }
    });

    shadow.appendChild(card);
  }

  // ── Management modal ───────────────────────────────────────────────────────

  async _openManageModal(raw) {
    const shadow = this.shadowRoot;
    shadow.querySelector(".modal-overlay")?.remove();

    const cfg = SERVICE_CONFIG[this._service];
    if (!cfg) return;

    const poster = raw.images?.find((i) => i.coverType === "poster");
    const posterUrl = poster?.remoteUrl || poster?.url || null;
    const posterHtml = posterUrl
      ? `<img class="manage-poster" src="${_esc(posterUrl)}" alt="${_esc(raw.title)}" loading="lazy">`
      : `<div class="manage-poster-ph">${cfg.icon}</div>`;

    const genres = (raw.genres || []).map((g) => (typeof g === "string" ? g : g.name)).filter(Boolean);
    const genreHtml = genres.length
      ? `<div class="genre-pills">${genres.map((g) => `<span class="genre-pill">${_esc(g)}</span>`).join("")}</div>`
      : "";

    const _fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    const datePairs = this._service === "radarr"
      ? [
          { label: "Cinema",   val: raw.inCinemas      },
          { label: "Digital",  val: raw.digitalRelease  },
          { label: "Physical", val: raw.physicalRelease },
        ].filter(d => d.val)
      : [
          { label: "First Aired", val: raw.firstAired  },
          { label: "Last Aired",  val: raw.lastAired   },
          { label: "Next Airing", val: raw.nextAiring  },
        ].filter(d => d.val);
    const releaseDatesHtml = datePairs.length
      ? `<div class="section-divider">${this._service === "radarr" ? "Release Dates" : "Air Dates"}</div>
         <div class="release-dates-block">${datePairs.map(({ label, val }) =>
           `<div class="release-date-row"><span class="release-date-label">${label}</span><span>${_fmtDate(val)}</span></div>`
         ).join("")}</div>`
      : "";

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <h2>${_esc(raw.title)} <span style="font-weight:400;color:var(--harr-text-secondary,#9e9e9e)">(${raw.year || ""})</span></h2>
        <div class="manage-header">
          ${posterHtml}
          <p class="manage-overview">${_esc(raw.overview || "")}</p>
        </div>
        ${genreHtml}
        ${releaseDatesHtml}
        <div id="manage-body">
          <div class="modal-loading"><div class="spinner"></div> Loading profiles…</div>
        </div>
      </div>
    `;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    shadow.appendChild(overlay);

    let profiles = [];
    try {
      profiles = await harrFetch(this._hass, `${cfg.base}/api/v3/qualityprofile`);
    } catch (err) {
      overlay.querySelector("#manage-body").innerHTML =
        `<div class="error-msg">⚠️ ${_esc(err.message)}</div>`;
      return;
    }

    const profileOptions = profiles.map(
      (p) => `<option value="${p.id}"${p.id === raw.qualityProfileId ? " selected" : ""}>${_esc(p.name)}</option>`
    ).join("");

    const isShow = this._service === "sonarr";

    const body = overlay.querySelector("#manage-body");
    body.innerHTML = `
      <div class="field">
        <label>Quality Profile</label>
        <select id="qp-select">${profileOptions}</select>
      </div>
      <div class="field">
        <label>Monitor</label>
        <select id="mon-select">
          <option value="true"${raw.monitored ? " selected" : ""}>Yes</option>
          <option value="false"${!raw.monitored ? " selected" : ""}>No</option>
        </select>
      </div>
      ${!isShow ? `<div id="file-section"></div>` : ""}
      ${isShow ? `<div id="episodes-section">
        <div class="section-divider">Episodes</div>
        <div class="modal-loading" style="padding:8px 0"><div class="spinner"></div> Loading…</div>
      </div>` : ""}
      <div id="subtitle-section">
        <div class="section-divider">Subtitles</div>
        <div class="modal-loading" style="padding:8px 0"><div class="spinner"></div> Checking…</div>
      </div>
      <div id="delete-section"></div>
      <div class="modal-actions">
        <button class="btn-secondary" id="close-btn">Close</button>
        <button class="btn-secondary" id="search-btn">Search Now</button>
        <button class="btn-danger" id="delete-btn">Delete</button>
        <button class="btn-primary" id="save-btn">Save</button>
      </div>
    `;

    if (!isShow) this._renderMovieFile(body.querySelector("#file-section"), raw);
    if (isShow)  this._loadEpisodesSection(body.querySelector("#episodes-section"), cfg, raw);
    // Populate subtitle section asynchronously (don't block modal render)
    this._loadSubtitleSection(body.querySelector("#subtitle-section"), cfg, raw.id);

    body.querySelector("#close-btn").addEventListener("click", () => overlay.remove());

    body.querySelector("#search-btn").addEventListener("click", async () => {
      const btn = body.querySelector("#search-btn");
      btn.disabled = true;
      btn.textContent = "Searching…";
      try {
        await harrFetch(this._hass, `${cfg.base}/api/v3/command`, {
          method: "POST",
          body: JSON.stringify(cfg.command(raw.id)),
        });
        this._modalToast(overlay, "Search triggered!");
      } catch (err) {
        this._modalToast(overlay, `Failed: ${err.message}`, true);
      }
      btn.disabled = false;
      btn.textContent = "Search Now";
    });

    body.querySelector("#save-btn").addEventListener("click", async () => {
      const btn = body.querySelector("#save-btn");
      btn.disabled = true;
      btn.textContent = "Saving…";
      try {
        const qualityProfileId = parseInt(body.querySelector("#qp-select").value, 10);
        const monitored = body.querySelector("#mon-select").value === "true";
        await harrFetch(this._hass, `${cfg.base}/api/v3/${cfg.itemPath}/${raw.id}`, {
          method: "PUT",
          body: JSON.stringify({ ...raw, qualityProfileId, monitored }),
        });
        overlay.remove();
        this.dispatchEvent(new CustomEvent("harr-manage-done", { bubbles: true, composed: true }));
      } catch (err) {
        this._modalToast(overlay, `Save failed: ${err.message}`, true);
        btn.disabled = false;
        btn.textContent = "Save";
      }
    });

    body.querySelector("#delete-btn").addEventListener("click", () => {
      const section = body.querySelector("#delete-section");
      section.innerHTML = `
        <div class="delete-confirm">
          <p>Also delete files from disk?</p>
          <div class="dc-btns">
            <button class="btn-secondary" id="del-keep">No, keep files</button>
            <button class="btn-danger" id="del-files">Yes, delete files</button>
          </div>
        </div>
      `;
      const doDelete = async (deleteFiles) => {
        try {
          await harrFetch(this._hass, `${cfg.base}/api/v3/${cfg.itemPath}/${raw.id}?deleteFiles=${deleteFiles}`, {
            method: "DELETE",
          });
          overlay.remove();
          this.dispatchEvent(new CustomEvent("harr-manage-done", { bubbles: true, composed: true }));
        } catch (err) {
          this._modalToast(overlay, `Delete failed: ${err.message}`, true);
        }
      };
      section.querySelector("#del-keep").addEventListener("click", () => doDelete(false));
      section.querySelector("#del-files").addEventListener("click", () => doDelete(true));
    });
  }

  _renderMovieFile(container, raw) {
    if (!raw.hasFile || !raw.movieFile) {
      container.innerHTML = `
        <div class="section-divider">File</div>
        <div class="bazarr-na">No file downloaded</div>`;
      return;
    }
    const f = raw.movieFile;
    const quality = f.quality?.quality?.name || "";
    const size    = _formatSize(f.size);
    container.innerHTML = `
      <div class="section-divider">Downloaded File</div>
      <div style="font-size:12px;color:var(--harr-text-secondary,#9e9e9e);word-break:break-all;margin-bottom:4px">${_esc(f.relativePath || "")}</div>
      <div style="display:flex;gap:10px;font-size:12px;margin-bottom:8px">
        ${quality ? `<span style="color:#4caf50;font-weight:600">${_esc(quality)}</span>` : ""}
        ${size    ? `<span style="color:var(--harr-text-secondary,#9e9e9e)">${_esc(size)}</span>` : ""}
      </div>`;
  }

  async _loadEpisodesSection(container, cfg, raw) {
    try {
      const harrConfig = await getHarrConfig(this._hass);
      const [episodes, episodeFiles] = await Promise.all([
        harrFetch(this._hass, `${cfg.base}/api/v3/episode?seriesId=${raw.id}`),
        harrFetch(this._hass, `${cfg.base}/api/v3/episodefile?seriesId=${raw.id}`),
      ]);

      const fileMap = {};
      for (const f of episodeFiles) fileMap[f.id] = f;

      const bazarrMap = {};
      if (harrConfig.bazarr) {
        try {
          const bd = await harrFetch(this._hass, `/api/harr/bazarr/api/episodes?seriesid[]=${raw.id}`);
          for (const ep of bd?.data || []) bazarrMap[ep.sonarrEpisodeId] = ep;
        } catch { /* bazarr unavailable */ }
      }

      this._renderEpisodesSection(container, cfg, raw, episodes, fileMap, bazarrMap);
    } catch (err) {
      container.innerHTML = `
        <div class="section-divider">Episodes</div>
        <div class="bazarr-na">Could not load: ${_esc(err.message)}</div>`;
    }
  }

  _renderEpisodesSection(container, cfg, raw, episodes, fileMap, bazarrMap) {
    // Group by season
    const seasonMap = new Map();
    for (const ep of episodes) {
      if (!seasonMap.has(ep.seasonNumber)) seasonMap.set(ep.seasonNumber, []);
      seasonMap.get(ep.seasonNumber).push(ep);
    }

    // Regular seasons first, specials (0) last
    const seasons = [...seasonMap.keys()].sort((a, b) =>
      a === 0 ? 1 : b === 0 ? -1 : a - b
    );

    const hasBazarr = Object.keys(bazarrMap).length > 0;

    let html = `<div class="section-divider">Episodes</div>`;
    for (const [si, seasonNum] of seasons.entries()) {
      const eps = seasonMap.get(seasonNum).sort((a, b) => a.episodeNumber - b.episodeNumber);
      const downloaded = eps.filter(e => e.hasFile).length;
      const label = seasonNum === 0 ? "Specials" : `Season ${seasonNum}`;
      const openAttr = "";

      // Season monitor state from the series object
      const rawSeason = raw.seasons?.find(s => s.seasonNumber === seasonNum);
      const isMonitored = rawSeason?.monitored ?? true;
      const monColor = isMonitored ? "#4caf50" : "#9e9e9e";
      const monLabel = isMonitored ? "● Mon" : "○ Mon";

      let epCards = "";
      for (const ep of eps) {
        const num = String(ep.episodeNumber).padStart(2, "0");
        const ef = ep.hasFile ? (fileMap[ep.episodeFileId] || null) : null;

        const fileIcon = ef
          ? `<span class="ep-file-ok" title="${_esc(ef.relativePath || "")}"></span>`
          : `<span class="ep-file-na" title="No file downloaded"></span>`;

        // Filename + quality + size on indented lines below the title row
        let metaHtml = "";
        if (ef) {
          const efQ = ef.quality?.quality?.name || "";
          const efS = _formatSize(ef.size);
          const filenameHtml = ef.relativePath
            ? `<div class="ep-card-filename">${_esc(ef.relativePath)}</div>`
            : "";
          const qualSizeHtml = (efQ || efS)
            ? `<div class="ep-card-meta">
                ${efQ ? `<span style="color:#4caf50;font-size:11px;font-weight:600">${_esc(efQ)}</span>` : ""}
                ${efS ? `<span style="color:var(--harr-text-secondary,#9e9e9e);font-size:11px">${_esc(efS)}</span>` : ""}
               </div>`
            : "";
          metaHtml = filenameHtml + qualSizeHtml;
        }

        // Subtitle chips limited to 3, with overflow indicator
        let subsHtml = "";
        if (hasBazarr) {
          const bep = bazarrMap[ep.id];
          if (bep) {
            const allChips = [
              ...(bep.subtitles || []).map(s => `<span class="ep-sub-chip have">${_esc(s.code2 || s.name || "?")}</span>`),
              ...(bep.missing_subtitles || []).map(s => `<span class="ep-sub-chip missing">${_esc(s.code2 || s.name || "?")}</span>`),
            ];
            if (allChips.length > 0) {
              const visible = allChips.slice(0, 3).join("");
              const extra = allChips.length - 3;
              const overflow = extra > 0
                ? `<span class="ep-sub-chip" style="color:var(--harr-text-secondary,#9e9e9e);border:1px solid rgba(255,255,255,0.15)">+${extra}</span>`
                : "";
              subsHtml = `<div class="ep-card-subs">${visible}${overflow}</div>`;
            }
          }
        }

        const airDateHtml = ep.airDateUtc
          ? `<div class="ep-card-meta" style="color:var(--harr-text-secondary,#9e9e9e);font-size:11px">${new Date(ep.airDateUtc).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</div>`
          : "";

        epCards += `
          <div class="ep-card">
            <div class="ep-card-header">
              <span class="ep-num">E${num}</span>
              <span class="ep-title" title="${_esc(ep.title || "")}">${_esc(ep.title || "No title")}</span>
              ${fileIcon}
              <button class="btn-subtitle" data-epid="${ep.id}" style="padding:2px 8px;font-size:11px">Search</button>
            </div>
            ${airDateHtml}
            ${metaHtml}
            ${subsHtml}
          </div>`;
      }

      html += `
        <details class="ep-season"${openAttr}>
          <summary>
            ${_esc(label)}
            <span class="ep-season-count">${downloaded} / ${eps.length}</span>
            <button class="btn-subtitle" data-monitor-season="${seasonNum}" data-monitored="${isMonitored}" style="padding:2px 8px;font-size:11px;color:${monColor}">${monLabel}</button>
            <button class="btn-subtitle" data-season="${seasonNum}" style="padding:2px 8px;font-size:11px">Search</button>
          </summary>
          ${epCards}
        </details>`;
    }

    container.innerHTML = html;

    // Season monitor toggle
    container.querySelectorAll("[data-monitor-season]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sNum = parseInt(btn.dataset.monitorSeason, 10);
        const curMon = btn.dataset.monitored === "true";
        const newMon = !curMon;
        btn.disabled = true;
        try {
          const updatedSeries = {
            ...raw,
            seasons: raw.seasons.map(s =>
              s.seasonNumber === sNum ? { ...s, monitored: newMon } : s
            ),
          };
          await harrFetch(this._hass, `${cfg.base}/api/v3/series/${raw.id}`, {
            method: "PUT",
            body: JSON.stringify(updatedSeries),
          });
          // Update raw.seasons in place so subsequent toggles reflect correct state
          const rs = raw.seasons.find(s => s.seasonNumber === sNum);
          if (rs) rs.monitored = newMon;
          btn.dataset.monitored = String(newMon);
          btn.style.color = newMon ? "#4caf50" : "#9e9e9e";
          btn.textContent = `${newMon ? "●" : "○"} Mon`;
        } catch (err) {
          this._modalToast(
            container.closest(".modal-overlay"),
            `Monitor update failed: ${err.message}`, true);
        }
        btn.disabled = false;
      });
    });

    // Season search
    container.querySelectorAll("[data-season]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const seasonNumber = parseInt(btn.dataset.season, 10);
        btn.disabled = true;
        btn.textContent = "Searching…";
        try {
          await harrFetch(this._hass, `${cfg.base}/api/v3/command`, {
            method: "POST",
            body: JSON.stringify({ name: "SeasonSearch", seriesId: raw.id, seasonNumber }),
          });
          btn.textContent = "Started ✓";
        } catch {
          btn.disabled = false;
          btn.textContent = "Search";
        }
      });
    });

    // Episode search
    container.querySelectorAll("[data-epid]").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        const episodeIds = [parseInt(btn.dataset.epid, 10)];
        btn.disabled = true;
        btn.textContent = "…";
        try {
          await harrFetch(this._hass, `${cfg.base}/api/v3/command`, {
            method: "POST",
            body: JSON.stringify({ name: "EpisodeSearch", episodeIds }),
          });
          btn.textContent = "✓";
        } catch {
          btn.disabled = false;
          btn.textContent = "Search";
        }
      });
    });
  }

  async _loadSubtitleSection(container, cfg, itemId) {
    const harrConfig = await getHarrConfig(this._hass);
    if (!harrConfig.bazarr) {
      container.innerHTML = "";
      return;
    }

    try {
      const data = await harrFetch(this._hass, cfg.bazarrInfo(itemId));
      const entry = data?.data?.[0];
      if (!entry) throw new Error("empty");
      this._renderSubtitles(container, cfg, entry, itemId);
    } catch {
      container.innerHTML = `
        <div class="section-divider">Subtitles</div>
        <div class="bazarr-na">Bazarr not available</div>`;
    }
  }

  _renderSubtitles(container, cfg, entry, itemId) {
    const have    = Array.isArray(entry.subtitles)         ? entry.subtitles         : [];
    const missing = Array.isArray(entry.missing_subtitles) ? entry.missing_subtitles : [];

    let infoHtml;
    if (have.length > 0 || missing.length > 0) {
      const haveChips    = have.map(s =>
        `<span class="sub-lang have">✓ ${_esc(s.name || s.code2 || "?")}</span>`).join("");
      const missingChips = missing.map(s =>
        `<span class="sub-lang missing">✗ ${_esc(s.name || s.code2 || "?")}</span>`).join("");
      infoHtml = `<div class="sub-langs">${haveChips}${missingChips}</div>`;
    } else if (entry.episodeFileCount !== undefined) {
      const total   = (entry.episodeFileCount || 0) + (entry.episodeMissingCount || 0);
      const absent  = entry.episodeMissingCount || 0;
      const present = entry.episodeFileCount    || 0;
      infoHtml = `
        <div class="sub-episode-summary">
          ${total} episode${total !== 1 ? "s" : ""} &mdash;
          ${present} with subtitles${absent > 0
            ? `, <span class="count-missing">${absent} missing</span>`
            : " ✓"}
        </div>`;
    } else {
      infoHtml = `<div class="bazarr-na">No subtitle data available</div>`;
    }

    container.innerHTML = `
      <div class="section-divider">Subtitles</div>
      ${infoHtml}
      <button class="btn-subtitle" id="sub-search-btn">Search Missing</button>`;

    container.querySelector("#sub-search-btn").addEventListener("click", async () => {
      const btn = container.querySelector("#sub-search-btn");
      btn.disabled = true;
      btn.textContent = "Searching…";
      try {
        await harrFetch(this._hass, cfg.bazarrSearch(itemId), { method: "PATCH" });
        btn.textContent = "Started ✓";
      } catch (err) {
        btn.disabled = false;
        btn.textContent = "Search Missing";
        this._modalToast(
          container.closest(".modal-overlay"),
          `Subtitle search failed: ${err.message}`, true);
      }
    });
  }

  _modalToast(overlay, msg, isError = false) {
    const t = document.createElement("div");
    t.style.cssText = `
      margin-top: 12px; padding: 8px 14px; border-radius: 8px; font-size: 13px;
      background: ${isError ? "rgba(244,67,54,0.15)" : "rgba(76,175,80,0.15)"};
      border: 1px solid ${isError ? "rgba(244,67,54,0.4)" : "rgba(76,175,80,0.4)"};
      color: ${isError ? "#f44336" : "#4caf50"};
    `;
    t.textContent = msg;
    overlay.querySelector(".modal").appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }
}

function _esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function _formatSize(bytes) {
  if (!bytes) return "";
  const gb = bytes / 1_073_741_824;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / 1_048_576).toFixed(0)} MB`;
}

customElements.get("harr-media-card") || customElements.define("harr-media-card", HarrMediaCard);

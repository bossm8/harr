/**
 * <harr-shows> — Sonarr TV shows section.
 * Mirrors the movies section: library grid + add show modal with profiles.
 */

import { BaseSection, SECTION_STYLES, EXTRA_STYLES, harrFetch, proxyImageUrl } from "./_base-section.js";
import "../components/media-card.js";

const BASE = "/api/harr/sonarr";

class HarrShows extends BaseSection {
  constructor() {
    super();
    this._series = [];
    this._searchTerm = "";
    this._debounceTimer = null;
    this._profiles = [];
    this._rootFolders = [];
    this._languageProfiles = [];
    this._selectedResult = null;
  }

  connectedCallback() {
    this._render();
    if (this._hass) this._load();
  }

  _init() {
    if (this.shadowRoot.children.length > 0) this._load();
  }

  _render() {
    this.shadowRoot.innerHTML = `
      <style>
        ${SECTION_STYLES}
        ${EXTRA_STYLES}
      </style>
      <div class="toolbar">
        <input class="search-input" type="search" placeholder="Search library or add show…">
        <button class="btn-primary">+ Add</button>
      </div>
      <div class="content">
        <div class="poster-grid" id="grid"></div>
      </div>
    `;

    this.shadowRoot.querySelector(".search-input").addEventListener("input", (e) => {
      clearTimeout(this._debounceTimer);
      this._searchTerm = e.target.value.trim();
      this._debounceTimer = setTimeout(() => this._onSearch(), 300);
    });

    this.shadowRoot.querySelector(".btn-primary").addEventListener("click", () => {
      const term = this.shadowRoot.querySelector(".search-input").value.trim();
      if (term) this._openSearchModal(term);
    });
  }

  async _load() {
    const grid = this.shadowRoot.getElementById("grid");
    this._renderLoading(grid);
    try {
      this._series = await harrFetch(this._hass, `${BASE}/api/v3/series`);
      this._renderGrid(this._series);
    } catch (err) {
      this._renderError(grid, err.message);
    }
  }

  _renderGrid(series) {
    const grid = this.shadowRoot.getElementById("grid");
    if (!grid) return;
    grid.innerHTML = "";

    if (!series || series.length === 0) {
      grid.innerHTML = `<div class="empty"><div class="icon">📺</div><span>No shows in library</span></div>`;
      return;
    }

    for (const show of series) {
      const poster = show.images?.find((i) => i.coverType === "poster");
      const posterUrl = proxyImageUrl(poster?.remoteUrl || poster?.url || null);
      const fileCount  = show.statistics?.episodeFileCount  || 0;
      const totalCount = show.statistics?.totalEpisodeCount || 0;
      const downloadStatus = fileCount === 0
        ? (show.monitored ? "Missing" : "Unmonitored")
        : fileCount < totalCount ? "Partial" : "Downloaded";

      const card = document.createElement("harr-media-card");
      card.item = {
        title: show.title,
        year: show.year,
        posterUrl,
        status:        downloadStatus,
        statusMonitor: show.monitored ? "Monitored" : "Unmonitored",
        overview: show.overview,
        _raw: show,
      };
      card.dataset.tmdbid = show.tmdbId;
      card.hass = this._hass;
      card.service = "sonarr";
      card.addEventListener("harr-manage-done", () => this._load());
      grid.appendChild(card);
    }

    // Auto-open manage modal if navigated here from another section
    if (this._pendingTmdbId) {
      const tmdbId = this._pendingTmdbId;
      this._pendingTmdbId = null;
      const target = this._series.find((s) => s.tmdbId === tmdbId);
      if (target) {
        const card = this.shadowRoot.querySelector(`[data-tmdbid="${tmdbId}"]`);
        if (card) card._openManageModal(target);
      }
    }
  }

  set pendingTmdbId(id) {
    this._pendingTmdbId = id;
    if (this._series?.length) {
      const target = this._series.find((s) => s.tmdbId === id);
      if (target) {
        const card = this.shadowRoot.querySelector(`[data-tmdbid="${id}"]`);
        if (card) { this._pendingTmdbId = null; card._openManageModal(target); }
      }
    }
  }

  _onSearch() {
    const term = this._searchTerm.toLowerCase();
    if (!term) {
      this._renderGrid(this._series);
      return;
    }
    const filtered = this._series.filter(
      (s) => s.title.toLowerCase().includes(term) || String(s.year).includes(term)
    );
    this._renderGrid(filtered);
  }

  // ── Add show search modal ──────────────────────────────────────────────────

  async _openSearchModal(term) {
    if (!this._hass) return;
    const shadow = this.shadowRoot;
    shadow.querySelector(".modal-overlay")?.remove();
    this._selectedResult = null;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <h2>Add Show</h2>
        <div id="search-body">
          <div class="modal-loading"><div class="spinner"></div> Searching…</div>
        </div>
      </div>
    `;
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    shadow.appendChild(overlay);

    try {
      if (!this._profiles.length) {
        [this._profiles, this._rootFolders] = await Promise.all([
          harrFetch(this._hass, `${BASE}/api/v3/qualityprofile`),
          harrFetch(this._hass, `${BASE}/api/v3/rootfolder`),
        ]);
        this._languageProfiles = await harrFetch(this._hass, `${BASE}/api/v3/languageprofile`).catch(() => []);
      }
      const results = await harrFetch(this._hass, `${BASE}/api/v3/series/lookup?term=${encodeURIComponent(term)}`);
      this._populateSearchModal(overlay, results || []);
    } catch (err) {
      overlay.remove();
      this._toast(`Search failed: ${err.message}`, "error");
    }
  }

  _populateSearchModal(overlay, results) {
    const profileOptions = this._profiles.map((p) => `<option value="${p.id}">${_esc(p.name)}</option>`).join("");
    const rootOptions = this._rootFolders.map((r) => `<option value="${_esc(r.path)}">${_esc(r.path)}</option>`).join("");
    const body = overlay.querySelector("#search-body");

    if (!results.length) {
      body.innerHTML = `
        <div class="empty" style="height:100px">No results found</div>
        <div class="modal-actions">
          <button class="btn-secondary" id="cancel-btn">Close</button>
        </div>
      `;
      body.querySelector("#cancel-btn").addEventListener("click", () => overlay.remove());
      return;
    }

    this._selectedResult = results[0];

    const resultItemsHtml = results.map((s, i) => {
      const poster = s.images?.find((img) => img.coverType === "poster");
      const posterUrl = proxyImageUrl(poster?.remoteUrl || poster?.url || null);
      const posterHtml = posterUrl
        ? `<img class="result-poster" src="${_esc(posterUrl)}" alt="${_esc(s.title)}" loading="lazy">`
        : `<div class="result-poster-ph">📺</div>`;
      return `
        <div class="result-item${i === 0 ? " selected" : ""}" data-idx="${i}">
          ${posterHtml}
          <div class="result-text">
            <div class="r-title">${_esc(s.title)} <span style="font-weight:400;color:var(--harr-text-secondary)">(${s.year || "?"})</span></div>
            <div class="r-meta">${_esc((s.overview || "").slice(0, 160))}</div>
          </div>
        </div>
      `;
    }).join("");

    body.innerHTML = `
      <div class="field">
        <label>Search Result</label>
        <div class="result-list">${resultItemsHtml}</div>
      </div>
      <div class="field">
        <label>Quality Profile</label>
        <select id="profile-select">${profileOptions}</select>
      </div>
      <div class="field">
        <label>Root Folder</label>
        <select id="root-select">${rootOptions}</select>
      </div>
      <div class="field">
        <label>Monitor</label>
        <select id="monitor-select">
          <option value="all">All Episodes</option>
          <option value="future">Future Episodes</option>
          <option value="none">None</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" id="cancel-btn">Cancel</button>
        <button class="btn-primary" id="add-btn">Add Show</button>
      </div>
    `;

    body.querySelectorAll(".result-item").forEach((el) => {
      el.addEventListener("click", () => {
        body.querySelectorAll(".result-item").forEach((r) => r.classList.remove("selected"));
        el.classList.add("selected");
        this._selectedResult = results[parseInt(el.dataset.idx, 10)];
      });
    });

    body.querySelector("#cancel-btn").addEventListener("click", () => overlay.remove());

    body.querySelector("#add-btn").addEventListener("click", async () => {
      const show = this._selectedResult;
      if (!show) return;
      const btn = body.querySelector("#add-btn");
      btn.disabled = true;
      btn.textContent = "Adding…";
      try {
        const monitorValue = body.querySelector("#monitor-select").value;
        await harrFetch(this._hass, `${BASE}/api/v3/series`, {
          method: "POST",
          body: JSON.stringify({
            ...show,
            qualityProfileId: parseInt(body.querySelector("#profile-select").value, 10),
            rootFolderPath: body.querySelector("#root-select").value,
            monitored: monitorValue !== "none",
            addOptions: { monitor: monitorValue, searchForMissingEpisodes: true },
          }),
        });
        overlay.remove();
        this._toast(`"${show.title}" added to Sonarr!`, "success");
        await this._load();
      } catch (err) {
        this._toast(`Failed to add: ${err.message}`, "error");
        btn.disabled = false;
        btn.textContent = "Add Show";
      }
    });
  }
}

function _esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

customElements.get("harr-shows") || customElements.define("harr-shows", HarrShows);

/**
 * <harr-movies> — Radarr movies section.
 * Shows the Radarr library with a poster grid and allows adding new movies.
 */

import { BaseSection, SECTION_STYLES, EXTRA_STYLES, harrFetch } from "./_base-section.js";
import "../components/media-card.js";

const BASE = "/api/harr/radarr";

class HarrMovies extends BaseSection {
  constructor() {
    super();
    this._movies = [];
    this._searchTerm = "";
    this._debounceTimer = null;
    this._profiles = [];
    this._rootFolders = [];
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
    const shadow = this.shadowRoot;
    shadow.innerHTML = `
      <style>
        ${SECTION_STYLES}
        ${EXTRA_STYLES}
      </style>
      <div class="toolbar">
        <input class="search-input" type="search" placeholder="Search library or add movie…">
        <button class="btn-primary">+ Add</button>
      </div>
      <div class="content">
        <div class="poster-grid" id="grid"></div>
      </div>
    `;

    shadow.querySelector(".search-input").addEventListener("input", (e) => {
      clearTimeout(this._debounceTimer);
      this._searchTerm = e.target.value.trim();
      this._debounceTimer = setTimeout(() => this._onSearch(), 300);
    });

    shadow.querySelector(".btn-primary").addEventListener("click", () => {
      const term = shadow.querySelector(".search-input").value.trim();
      if (term) this._openSearchModal(term);
    });
  }

  async _load() {
    const grid = this.shadowRoot.getElementById("grid");
    this._renderLoading(grid);
    try {
      this._movies = await harrFetch(this._hass, `${BASE}/api/v3/movie`);
      this._renderGrid(this._movies);
    } catch (err) {
      this._renderError(grid, err.message);
    }
  }

  _renderGrid(movies) {
    const grid = this.shadowRoot.getElementById("grid");
    if (!grid) return;
    grid.innerHTML = "";

    if (!movies || movies.length === 0) {
      grid.innerHTML = `<div class="empty"><div class="icon">🎬</div><span>No movies in library</span></div>`;
      return;
    }

    for (const movie of movies) {
      const poster = movie.images?.find((i) => i.coverType === "poster");
      const posterUrl = poster?.remoteUrl || poster?.url || null;
      const downloadStatus = movie.hasFile
        ? "Downloaded"
        : (movie.monitored ? "Missing" : "Unmonitored");

      const card = document.createElement("harr-media-card");
      card.item = {
        title: movie.title,
        year: movie.year,
        posterUrl,
        status:        downloadStatus,
        statusMonitor: movie.monitored ? "Monitored" : "Unmonitored",
        overview: movie.overview,
        _raw: movie,
      };
      card.dataset.tmdbid = movie.tmdbId;
      card.hass = this._hass;
      card.service = "radarr";
      card.addEventListener("harr-manage-done", () => this._load());
      grid.appendChild(card);
    }

    // Auto-open manage modal if navigated here from another section
    if (this._pendingTmdbId) {
      const tmdbId = this._pendingTmdbId;
      this._pendingTmdbId = null;
      const target = this._movies.find((m) => m.tmdbId === tmdbId);
      if (target) {
        const card = this.shadowRoot.querySelector(`[data-tmdbid="${tmdbId}"]`);
        if (card) card._openManageModal(target);
      }
    }
  }

  set pendingTmdbId(id) {
    this._pendingTmdbId = id;
    if (this._movies?.length) {
      const target = this._movies.find((m) => m.tmdbId === id);
      if (target) {
        const card = this.shadowRoot.querySelector(`[data-tmdbid="${id}"]`);
        if (card) { this._pendingTmdbId = null; card._openManageModal(target); }
      }
    }
  }

  _onSearch() {
    const term = this._searchTerm.toLowerCase();
    if (!term) {
      this._renderGrid(this._movies);
      return;
    }
    const filtered = this._movies.filter(
      (m) => m.title.toLowerCase().includes(term) || String(m.year).includes(term)
    );
    this._renderGrid(filtered);
  }

  // ── Add movie search modal ─────────────────────────────────────────────────

  async _openSearchModal(term) {
    if (!this._hass) return;
    const shadow = this.shadowRoot;
    shadow.querySelector(".modal-overlay")?.remove();
    this._selectedResult = null;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <h2>Add Movie</h2>
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
      }
      const results = await harrFetch(this._hass, `${BASE}/api/v3/movie/lookup?term=${encodeURIComponent(term)}`);
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

    const resultItemsHtml = results.map((m, i) => {
      const poster = m.images?.find((img) => img.coverType === "poster");
      const posterUrl = poster?.remoteUrl || poster?.url || null;
      const posterHtml = posterUrl
        ? `<img class="result-poster" src="${_esc(posterUrl)}" alt="${_esc(m.title)}" loading="lazy">`
        : `<div class="result-poster-ph">🎬</div>`;
      return `
        <div class="result-item${i === 0 ? " selected" : ""}" data-idx="${i}">
          ${posterHtml}
          <div class="result-text">
            <div class="r-title">${_esc(m.title)} <span style="font-weight:400;color:var(--harr-text-secondary)">(${m.year || "?"})</span></div>
            <div class="r-meta">${_esc((m.overview || "").slice(0, 160))}</div>
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
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" id="cancel-btn">Cancel</button>
        <button class="btn-primary" id="add-btn">Add Movie</button>
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
      const movie = this._selectedResult;
      if (!movie) return;
      const btn = body.querySelector("#add-btn");
      btn.disabled = true;
      btn.textContent = "Adding…";
      try {
        await harrFetch(this._hass, `${BASE}/api/v3/movie`, {
          method: "POST",
          body: JSON.stringify({
            title: movie.title,
            tmdbId: movie.tmdbId,
            qualityProfileId: parseInt(body.querySelector("#profile-select").value, 10),
            rootFolderPath: body.querySelector("#root-select").value,
            monitored: body.querySelector("#monitor-select").value === "true",
            addOptions: { searchForMovie: true },
          }),
        });
        overlay.remove();
        this._toast(`"${movie.title}" added to Radarr!`, "success");
        await this._load();
      } catch (err) {
        this._toast(`Failed to add: ${err.message}`, "error");
        btn.disabled = false;
        btn.textContent = "Add Movie";
      }
    });
  }
}

function _esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

customElements.get("harr-movies") || customElements.define("harr-movies", HarrMovies);

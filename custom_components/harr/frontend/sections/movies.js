/**
 * <harr-movies> — Radarr movies section.
 * Shows the Radarr library with a poster grid and allows adding new movies.
 */

import { BaseSection, SECTION_STYLES, EXTRA_STYLES, harrFetch, getHarrConfig, proxyImageUrl } from "./_base-section.js";
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
      const posterUrl = proxyImageUrl(poster?.remoteUrl || poster?.url || null);
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
      const posterUrl = proxyImageUrl(poster?.remoteUrl || poster?.url || null);
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

    const attachClicks = () => {
      body.querySelectorAll(".result-item").forEach((el) => {
        el.addEventListener("click", () => {
          const idx = parseInt(el.dataset.idx, 10);
          this._selectedResult = results[idx];
          showDetail(idx);
        });
      });
    };

    const showDetail = (idx) => {
      const m = results[idx];
      const poster = (m.images || []).find(i => i.coverType === "poster");
      const imgSrc = proxyImageUrl(poster?.remoteUrl || poster?.url || null);
      const posterHtml = imgSrc
        ? `<img class="result-detail-poster" src="${_esc(imgSrc)}" alt="" loading="lazy">`
        : `<div class="result-detail-poster-ph">🎬</div>`;
      const genres = (m.genres || []).join(", ");

      const _fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
      const datePairs = [
        m.inCinemas       ? { label: "Cinema",   val: m.inCinemas       } : null,
        m.digitalRelease  ? { label: "Digital",  val: m.digitalRelease  } : null,
        m.physicalRelease ? { label: "Physical", val: m.physicalRelease } : null,
      ].filter(Boolean);
      const datesHtml = datePairs.length
        ? `<div class="cast-container"><div class="date-scroll">${datePairs.map(({ label, val }) =>
            `<div class="date-chip"><span class="date-chip-label">${label}</span><span class="date-chip-value">${_fmtDate(val)}</span></div>`
          ).join("")}</div></div>`
        : "";

      const field = body.querySelector(".result-list").closest(".field");
      field.innerHTML = `
        <button class="btn-back">← Results</button>
        <div class="result-detail-header">
          ${posterHtml}
          <div>
            <div class="result-detail-title">${_esc(m.title)} <span style="font-weight:400;color:var(--harr-text-secondary,#9e9e9e)">(${m.year || "?"})</span></div>
            ${genres ? `<div class="result-detail-genres">${_esc(genres)}</div>` : ""}
          </div>
        </div>
        <p class="result-detail-overview">${_esc(m.overview || "")}</p>
        ${datesHtml}
        <div id="detail-cast-section"></div>
      `;

      // Async cast via Jellyseerr
      if (m.tmdbId) {
        (async () => {
          const castSection = field.querySelector("#detail-cast-section");
          if (!castSection) return;
          try {
            const cfg = await getHarrConfig(this._hass);
            if (!cfg.seerr) return;
            const detail = await harrFetch(this._hass, `/api/harr/seerr/api/v1/movie/${m.tmdbId}`);
            const cast = (detail?.credits?.cast || []).slice(0, 10);
            if (!cast.length) return;
            castSection.innerHTML = `
              <div class="section-header">Cast</div>
              <div class="cast-container"><div class="cast-scroll">
                ${cast.map(p => {
                  const imgUrl = p.profilePath ? proxyImageUrl(`https://image.tmdb.org/t/p/w185${p.profilePath}`) : null;
                  const initials = (p.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
                  return `<div class="cast-member">
                    <div class="cast-avatar">${imgUrl ? `<img src="${imgUrl}" alt="" loading="lazy" data-initials="${_esc(initials)}">` : _esc(initials)}</div>
                    <div class="cast-name">${_esc(p.name || "")}</div>
                    ${p.character ? `<div class="cast-char">${_esc(p.character)}</div>` : ""}
                  </div>`;
                }).join("")}
              </div></div>`;
            castSection.querySelectorAll("img[data-initials]").forEach(img => {
              img.addEventListener("error", () => { img.parentNode.textContent = img.dataset.initials; });
            });
          } catch { /* silently omit */ }
        })();
      }

      field.querySelector(".btn-back").addEventListener("click", () => {
        field.innerHTML = `<label>Search Result</label><div class="result-list">${resultItemsHtml}</div>`;
        attachClicks();
      });
    };

    attachClicks();

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

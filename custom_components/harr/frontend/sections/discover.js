/**
 * <harr-discover> — seerr discover section.
 * Shows trending / upcoming / popular content via seerr's discover API.
 * Includes a "Request" button that sends a media request to seerr.
 */

import { BaseSection, SECTION_STYLES, harrFetch, getHarrConfig, proxyImageUrl } from "./_base-section.js";
import "../components/media-card.js";

const BASE = "/api/harr/seerr";

const SUB_TABS = [
  { id: "trending",    label: "Trending Movies", path: "/api/v1/discover/movies",          type: "movie" },
  { id: "trending-tv", label: "Trending Shows",  path: "/api/v1/discover/tv",              type: "tv"    },
  { id: "upcoming",    label: "Upcoming Movies", path: "/api/v1/discover/movies/upcoming", type: "movie" },
  { id: "upcoming-tv", label: "Upcoming Shows",  path: "/api/v1/discover/tv/upcoming",     type: "tv"    },
];

const AVAILABILITY = {
  0: { label: "Not Added",   color: "#9e9e9e" },
  1: { label: "Unknown",     color: "#9e9e9e" },
  2: { label: "Pending",     color: "#ff9800" },
  3: { label: "Processing",  color: "#9c27b0" },
  4: { label: "Partial",     color: "#2196f3" },
  5: { label: "Available",   color: "#4caf50" },
};

class HarrDiscover extends BaseSection {
  constructor() {
    super();
    this._activeTab = "trending";
    this._items = [];
  }

  connectedCallback() {
    this._render();
    if (this._hass) this._load();
  }

  _init() {
    if (this.shadowRoot.children.length > 0) this._load();
  }

  _render() {
    const activeLabel = SUB_TABS.find(t => t.id === this._activeTab)?.label || "";
    this.shadowRoot.innerHTML = `
      <style>
        ${SECTION_STYLES}
        .sub-tabs { overflow-x: auto; scrollbar-width: none; }
        .sub-tabs::-webkit-scrollbar { display: none; }
        .sub-tab-mobile {
          display: none; position: relative;
          align-items: center; justify-content: space-between;
          padding: 8px 12px; flex-shrink: 0;
          background: var(--harr-card-bg, #1c1c1c);
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .sub-tab-current { font-size: 13px; font-weight: 600; color: var(--harr-accent, #e5a00d); }
        .sub-tab-toggle {
          background: none; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px;
          color: var(--primary-text-color, #e1e1e1); font-size: 16px; cursor: pointer;
          padding: 3px 8px; line-height: 1;
        }
        .sub-tab-dropdown {
          display: none; position: absolute; top: 100%; left: 0; right: 0; z-index: 50;
          background: var(--harr-card-bg, #1c1c1c);
          border: 1px solid rgba(255,255,255,0.12); border-radius: 0 0 8px 8px;
          box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        }
        .sub-tab-dropdown.open { display: block; }
        .sub-tab-option {
          padding: 12px 16px; font-size: 14px; cursor: pointer;
          color: var(--primary-text-color, #e1e1e1);
          border-bottom: 1px solid rgba(255,255,255,0.06);
        }
        .sub-tab-option:last-child { border-bottom: none; }
        .sub-tab-option.active { color: var(--harr-accent, #e5a00d); font-weight: 600; }
        @media (max-width: 480px) {
          .sub-tabs { display: none; }
          .sub-tab-mobile { display: flex; }
        }
      </style>
      <div class="sub-tabs">
        ${SUB_TABS.map((t) => `<div class="sub-tab${t.id === this._activeTab ? " active" : ""}" data-tab="${t.id}">${t.label}</div>`).join("")}
      </div>
      <div class="sub-tab-mobile" id="stm">
        <span class="sub-tab-current" id="stm-label">${activeLabel}</span>
        <button class="sub-tab-toggle" id="stm-toggle">&#9776;</button>
        <div class="sub-tab-dropdown" id="stm-dropdown">
          ${SUB_TABS.map(t => `<div class="sub-tab-option${t.id === this._activeTab ? " active" : ""}" data-tab="${t.id}">${t.label}</div>`).join("")}
        </div>
      </div>
      <div class="content">
        <div class="poster-grid" id="grid"></div>
      </div>
    `;

    const shadow = this.shadowRoot;

    shadow.querySelectorAll(".sub-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.tab === this._activeTab) return;
        this._activeTab = btn.dataset.tab;
        shadow.querySelectorAll(".sub-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === this._activeTab));
        this._load();
      });
    });

    shadow.getElementById("stm-toggle").addEventListener("click", (e) => {
      e.stopPropagation();
      shadow.getElementById("stm-dropdown").classList.toggle("open");
    });

    shadow.addEventListener("click", () =>
      shadow.getElementById("stm-dropdown")?.classList.remove("open"));

    shadow.querySelectorAll(".sub-tab-option").forEach(opt => {
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        const tab = opt.dataset.tab;
        if (tab === this._activeTab) { shadow.getElementById("stm-dropdown").classList.remove("open"); return; }
        this._activeTab = tab;
        const label = SUB_TABS.find(t => t.id === tab)?.label || tab;
        shadow.getElementById("stm-label").textContent = label;
        shadow.querySelectorAll(".sub-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
        shadow.querySelectorAll(".sub-tab-option").forEach(o => o.classList.toggle("active", o.dataset.tab === tab));
        shadow.getElementById("stm-dropdown").classList.remove("open");
        this._load();
      });
    });
  }

  async _load() {
    const grid = this.shadowRoot.getElementById("grid");
    this._renderLoading(grid);

    const tabInfo = SUB_TABS.find((t) => t.id === this._activeTab);
    if (!tabInfo) return;

    try {
      const data = await harrFetch(this._hass, `${BASE}${tabInfo.path}?page=1`);
      this._items = data.results || [];
      this._renderGrid(tabInfo.type);
    } catch (err) {
      this._renderError(grid, err.message);
    }
  }

  _renderGrid(mediaType) {
    const grid = this.shadowRoot.getElementById("grid");
    if (!grid) return;
    grid.innerHTML = "";

    if (!this._items.length) {
      grid.innerHTML = `<div class="empty"><div class="icon">🔥</div><span>Nothing to show</span></div>`;
      return;
    }

    for (const item of this._items) {
      const posterPath = item.posterPath;
      const posterUrl = posterPath ? proxyImageUrl(`https://image.tmdb.org/t/p/w300${posterPath}`) : null;
      const avail = AVAILABILITY[item.mediaInfo?.status] || AVAILABILITY[0];

      const card = document.createElement("harr-media-card");
      card.item = {
        title: item.title || item.name || "Unknown",
        year: (item.releaseDate || item.firstAirDate || "").slice(0, 4),
        posterUrl,
        status: avail.label,
        overview: item.overview,
        voteAverage: item.voteAverage || null,
        _raw: item,
        _mediaType: mediaType,
      };

      card.addEventListener("harr-card-click", (e) => {
        this._openRequestModal(e.detail.item, mediaType);
      });

      grid.appendChild(card);
    }
  }

  _openRequestModal(cardItem, mediaType) {
    const shadow = this.shadowRoot;
    shadow.querySelector(".modal-overlay")?.remove();

    const raw = cardItem._raw;
    const title = cardItem.title;
    const year = cardItem.year;
    const alreadyAvailable = raw.mediaInfo?.status === 5;
    const alreadyPartial   = raw.mediaInfo?.status === 4;
    const alreadyRequested = raw.mediaInfo?.status === 2 || raw.mediaInfo?.status === 3;

    const avail = AVAILABILITY[raw.mediaInfo?.status ?? 0];
    const rating = raw.voteAverage ? `⭐ ${Number(raw.voteAverage).toFixed(1)}/10` : "";
    const genres = (raw.genres || []).map((g) => g.name).join(", ");

    const _fmtDate = (d) => new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    const datePairs = [
      raw.releaseDate  ? { label: "Release",   val: raw.releaseDate  } : null,
      raw.firstAirDate ? { label: "First Air Date", val: raw.firstAirDate } : null,
      raw.lastAirDate  ? { label: "Last Air Date",  val: raw.lastAirDate  } : null,
    ].filter(Boolean);
    const datesHtml = datePairs.length
      ? `<div style="font-size:12px;margin-bottom:10px">${datePairs.map(({ label, val }) =>
          `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
             <span style="color:var(--harr-text-secondary,#9e9e9e)">${label}</span>
             <span>${_fmtDate(val)}</span>
           </div>`
        ).join("")}</div>`
      : "";
    const rawMediaUrl = raw.mediaInfo?.mediaUrl || "";
    const mediaUrl = rawMediaUrl.startsWith("https://") ? rawMediaUrl : "";
    const reqInfo = (() => {
      const r = raw.mediaInfo?.requests?.[0];
      if (!r) return "";
      const by = r.requestedBy?.displayName || "someone";
      const when = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "";
      return `Requested by <strong>${_esc(by)}</strong>${when ? ` on ${when}` : ""}`;
    })();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const posterHtml = cardItem.posterUrl
      ? `<img src="${cardItem.posterUrl}" style="width:80px;height:120px;border-radius:6px;object-fit:cover;float:left;margin:0 16px 0 0">`
      : "";

    const navTab   = mediaType === "tv" ? "shows" : "movies";
    const navLabel = mediaType === "tv" ? "View in Shows" : "View in Movies";

    overlay.innerHTML = `
      <div class="modal" style="min-width:320px">
        <h2 style="margin-bottom:12px">${_esc(title)} <span style="font-weight:400;color:var(--harr-text-secondary)">(${year})</span></h2>
        <div style="overflow:hidden;margin-bottom:12px">
          ${posterHtml}
          <p style="margin:0;font-size:13px;color:var(--harr-text-secondary);line-height:1.5">${_esc(raw.overview || "")}</p>
          <div style="clear:both"></div>
        </div>
        ${(rating || genres) ? `<div style="display:flex;gap:16px;font-size:13px;margin-bottom:10px;flex-wrap:wrap;align-items:center">
          ${rating ? `<span style="color:#e5a00d">${_esc(rating)}</span>` : ""}
          ${genres  ? `<span style="color:var(--harr-text-secondary)">${_esc(genres)}</span>` : ""}
        </div>` : ""}
        ${datesHtml}
        ${reqInfo ? `<div style="font-size:12px;color:var(--harr-text-secondary);margin-bottom:10px">${reqInfo}</div>` : ""}
        ${alreadyAvailable ? `<div style="color:#4caf50;font-size:13px;margin-bottom:12px">Available</div>` : ""}
        ${alreadyPartial   ? `<div style="color:#2196f3;font-size:13px;margin-bottom:12px">Partially Available</div>` : ""}
        ${alreadyRequested ? `<div style="color:#ff9800;font-size:13px;margin-bottom:12px">Requested / Processing</div>` : ""}
        <div id="request-options" style="display:none"></div>
        <div class="modal-actions">
          <button class="btn-secondary" id="cancel-btn">Close</button>
          ${mediaUrl ? `<a href="${_esc(mediaUrl)}" target="_blank" style="
            display:inline-flex;align-items:center;gap:6px;
            padding:8px 16px;border-radius:8px;
            background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);
            color:var(--primary-text-color,#e1e1e1);font-size:13px;font-weight:600;
            text-decoration:none">▶ Watch in Jellyfin</a>` : ""}
          ${(alreadyAvailable || alreadyPartial) ? `<button class="btn-secondary" id="nav-btn">${_esc(navLabel)}</button>` : ""}
          ${!alreadyAvailable && !alreadyPartial && !alreadyRequested ? `<button class="btn-primary" id="request-btn">Request</button>` : ""}
        </div>
      </div>
    `;

    overlay.querySelector("#cancel-btn").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector("#nav-btn")?.addEventListener("click", () => {
      overlay.remove();
      this.dispatchEvent(new CustomEvent("harr-navigate", {
        detail: { tab: navTab, tmdbId: raw.id },
        bubbles: true,
        composed: true,
      }));
    });

    const requestBtn = overlay.querySelector("#request-btn");
    if (requestBtn) {
      requestBtn.addEventListener("click", async () => {
        requestBtn.disabled = true;
        requestBtn.textContent = "Loading options…";

        const service = mediaType === "tv" ? "sonarr" : "radarr";
        const apiBase = `/api/harr/${service}`;
        const optArea = overlay.querySelector("#request-options");
        optArea.style.display = "";
        optArea.innerHTML = `<div class="modal-loading" style="padding:8px 0"><div class="spinner"></div> Loading…</div>`;

        let profiles = [], folders = [];
        try {
          const harrCfg = await getHarrConfig(this._hass);
          if (harrCfg[service]) {
            [profiles, folders] = await Promise.all([
              harrFetch(this._hass, `${apiBase}/api/v3/qualityprofile`),
              harrFetch(this._hass, `${apiBase}/api/v3/rootfolder`),
            ]);
          }
        } catch { /* fall through */ }

        if (profiles.length) {
          const profileOpts = profiles.map(p => `<option value="${p.id}">${_esc(p.name)}</option>`).join("");
          const folderOpts  = folders.map(f => `<option value="${_esc(f.path)}">${_esc(f.path)}</option>`).join("");
          optArea.innerHTML = `
            <div class="field"><label>Quality Profile</label>
              <select id="profile-sel">${profileOpts}</select></div>
            ${folderOpts ? `<div class="field"><label>Root Folder</label>
              <select id="folder-sel">${folderOpts}</select></div>` : ""}`;
        } else {
          optArea.innerHTML = "";
        }

        // Swap to confirm button (clone strips the old listener)
        const confirmBtn = requestBtn.cloneNode(true);
        requestBtn.replaceWith(confirmBtn);
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Confirm Request";

        confirmBtn.addEventListener("click", async () => {
          confirmBtn.disabled = true;
          confirmBtn.textContent = "Requesting…";
          const profSel = overlay.querySelector("#profile-sel");
          const foldSel = overlay.querySelector("#folder-sel");
          try {
            await harrFetch(this._hass, `${BASE}/api/v1/request`, {
              method: "POST",
              body: JSON.stringify({
                mediaType,
                mediaId: raw.id,
                ...(mediaType === "tv" ? { seasons: "all" } : {}),
                ...(profSel ? { profileId: parseInt(profSel.value, 10) } : {}),
                ...(foldSel ? { rootFolder: foldSel.value } : {}),
              }),
            });
            overlay.remove();
            this._toast(`"${title}" requested!`, "success");
            await this._load();
          } catch (err) {
            this._toast(`Request failed: ${err.message}`, "error");
            confirmBtn.disabled = false;
            confirmBtn.textContent = "Confirm Request";
          }
        });
      });
    }

    shadow.appendChild(overlay);
  }
}

function _esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

customElements.get("harr-discover") || customElements.define("harr-discover", HarrDiscover);

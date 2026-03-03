/**
 * <harr-requests> — seerr media requests section.
 * Shows pending/recent requests with approve/decline actions.
 */

import { BaseSection, SECTION_STYLES, harrFetch, getHarrConfig } from "./_base-section.js";
import "../components/request-item.js";

const BASE = "/api/harr/seerr";
const PAGE_SIZE = 20;

const SUB_TABS = [
  { id: "pending",  label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "all",      label: "All" },
];

class HarrRequests extends BaseSection {
  constructor() {
    super();
    this._requests = [];
    this._activeTab = "pending";
    this._offset = 0;
    this._totalCount = 0;
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
      <div class="content" id="content">
        <div class="list" id="list"></div>
      </div>
    `;

    const shadow = this.shadowRoot;

    shadow.querySelectorAll(".sub-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.tab === this._activeTab) return;
        this._activeTab = btn.dataset.tab;
        shadow.querySelectorAll(".sub-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === this._activeTab));
        this._offset = 0;
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
        shadow.getElementById("stm-label").textContent = SUB_TABS.find(t => t.id === tab)?.label || tab;
        shadow.querySelectorAll(".sub-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
        shadow.querySelectorAll(".sub-tab-option").forEach(o => o.classList.toggle("active", o.dataset.tab === tab));
        shadow.getElementById("stm-dropdown").classList.remove("open");
        this._offset = 0;
        this._load();
      });
    });
  }

  async _load() {
    const list = this.shadowRoot.getElementById("list");
    this._renderLoading(list);

    const filterParam = this._activeTab === "pending" ? "&filter=pending"
      : this._activeTab === "approved" ? "&filter=approved" : "";

    try {
      const data = await harrFetch(
        this._hass,
        `${BASE}/api/v1/request?take=${PAGE_SIZE}&skip=${this._offset}&sort=added${filterParam}`
      );
      this._requests = data.results || [];
      this._totalCount = data.pageInfo?.totalCount || 0;

      // Fetch media details (title, poster, dates) for each unique tmdbId in parallel
      const seen = new Map();
      for (const req of this._requests) {
        const mt  = req.media?.mediaType;
        const tid = req.media?.tmdbId;
        if (mt && tid) {
          const key = `${mt}:${tid}`;
          if (!seen.has(key)) {
            seen.set(key, harrFetch(
              this._hass,
              `${BASE}/api/v1/${mt === "tv" ? "tv" : "movie"}/${tid}`
            ).catch(() => null));
          }
        }
      }
      const resolved = new Map();
      await Promise.all([...seen.entries()].map(async ([key, p]) => {
        const d = await p;
        if (d) resolved.set(key, d);
      }));
      for (const req of this._requests) {
        const key = `${req.media?.mediaType}:${req.media?.tmdbId}`;
        req._detail = resolved.get(key) || null;
      }

      this._renderList();
    } catch (err) {
      this._renderError(list, err.message);
    }
  }

  _renderList() {
    const list = this.shadowRoot.getElementById("list");
    if (!list) return;
    list.innerHTML = "";

    if (!this._requests.length) {
      list.innerHTML = `<div class="empty"><div class="icon">📋</div><span>No requests found</span></div>`;
      return;
    }

    for (const req of this._requests) {
      const item = document.createElement("harr-request-item");
      item.hass = this._hass;
      item.item = req;

      item.addEventListener("harr-request-approve", (e) => {
        this._openApproveModal(e.detail.item);
      });

      item.addEventListener("harr-request-decline", async (e) => {
        await this._action(e.detail.item.id, "decline");
      });

      list.appendChild(item);
    }
  }

  async _action(id, action) {
    try {
      await harrFetch(this._hass, `${BASE}/api/v1/request/${id}/${action}`, { method: "POST" });
      this._toast(action === "approve" ? "Request approved!" : "Request declined.", action === "approve" ? "success" : "info");
      await this._load();
    } catch (err) {
      this._toast(`Failed: ${err.message}`, "error");
    }
  }

  async _openApproveModal(req) {
    this.shadowRoot.querySelector(".modal-overlay")?.remove();

    const detail = req._detail || {};
    const media  = req.media  || {};
    const title  = detail.title || detail.name || "Unknown";
    const year   = (detail.releaseDate || detail.firstAirDate || "").slice(0, 4);
    const type   = media.mediaType === "tv" ? "TV Show" : "Movie";
    const who    = req.requestedBy?.displayName || req.requestedBy?.username || "someone";
    const poster = detail.posterPath ? `https://image.tmdb.org/t/p/w92${detail.posterPath}` : null;
    const posterHtml = poster
      ? `<img src="${_esc(poster)}" style="width:50px;height:75px;border-radius:4px;object-fit:cover;flex-shrink:0">`
      : `<div style="width:50px;height:75px;border-radius:4px;background:#2a2a2a;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">${media.mediaType === "tv" ? "📺" : "🎬"}</div>`;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <h2>Approve Request</h2>
        <div style="display:flex;gap:12px;margin-bottom:16px;align-items:flex-start">
          ${posterHtml}
          <div>
            <div style="font-weight:600;font-size:14px">${_esc(title)}${year ? ` <span style="font-weight:400;color:var(--harr-text-secondary)">(${year})</span>` : ""}</div>
            <div style="font-size:12px;color:var(--harr-text-secondary);margin-top:2px">${_esc(type)} · Requested by ${_esc(who)}</div>
          </div>
        </div>
        <div id="options-area">
          <div class="loading" style="height:60px"><div class="spinner"></div> Loading options…</div>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="cancel-btn">Cancel</button>
          <button class="btn-primary" id="approve-btn" disabled>Approve</button>
        </div>
      </div>`;

    overlay.querySelector("#cancel-btn").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });
    this.shadowRoot.appendChild(overlay);

    const service    = media.mediaType === "tv" ? "sonarr" : "radarr";
    const apiBase    = `/api/harr/${service}`;
    const optArea    = overlay.querySelector("#options-area");
    const approveBtn = overlay.querySelector("#approve-btn");

    let profiles = [], folders = [];
    try {
      const harrCfg = await getHarrConfig(this._hass);
      if (harrCfg[service]) {
        [profiles, folders] = await Promise.all([
          harrFetch(this._hass, `${apiBase}/api/v3/qualityprofile`),
          harrFetch(this._hass, `${apiBase}/api/v3/rootfolder`),
        ]);
      }
    } catch { /* fall through — show modal without selects */ }

    if (profiles.length) {
      const profileOpts = profiles.map((p) => `<option value="${p.id}">${_esc(p.name)}</option>`).join("");
      const folderOpts  = folders.map((f) => `<option value="${_esc(f.path)}">${_esc(f.path)}</option>`).join("");
      optArea.innerHTML = `
        <div class="field"><label>Quality Profile</label>
          <select id="profile-sel">${profileOpts}</select></div>
        ${folderOpts ? `<div class="field"><label>Root Folder</label>
          <select id="folder-sel">${folderOpts}</select></div>` : ""}`;
    } else {
      optArea.innerHTML = `<p style="font-size:13px;color:var(--harr-text-secondary);margin:0 0 4px">Approve this request?</p>`;
    }
    approveBtn.disabled = false;

    approveBtn.addEventListener("click", async () => {
      approveBtn.disabled = true;
      approveBtn.textContent = "Approving…";
      const body = {};
      const profSel = overlay.querySelector("#profile-sel");
      const foldSel = overlay.querySelector("#folder-sel");
      if (profSel) body.profileId  = parseInt(profSel.value, 10);
      if (foldSel) body.rootFolder = foldSel.value;
      try {
        await harrFetch(this._hass, `${BASE}/api/v1/request/${req.id}/approve`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        overlay.remove();
        this._toast("Request approved!", "success");
        await this._load();
      } catch (err) {
        this._toast(`Failed: ${err.message}`, "error");
        approveBtn.disabled = false;
        approveBtn.textContent = "Approve";
      }
    });
  }
}

function _esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

customElements.get("harr-requests") || customElements.define("harr-requests", HarrRequests);

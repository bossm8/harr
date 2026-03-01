/**
 * <harr-downloads> — combined qBittorrent + SABnzbd downloads section.
 * Auto-refreshes every 5 seconds. Supports pause/resume/delete actions.
 */

import { BaseSection, SECTION_STYLES, harrFetch } from "./_base-section.js";
import "../components/download-item.js";
import { QBITTORRENT, SABNZBD } from "../components/icons.js";

const QBT_BASE = "/api/harr/qbittorrent";
const SAB_BASE = "/api/harr/sabnzbd";
const REFRESH_INTERVAL = 5000;

const SUB_TABS = [
  { id: "qbt", label: "qBittorrent", icon: QBITTORRENT },
  { id: "sab", label: "SABnzbd",     icon: SABNZBD     },
];

const MODAL_STYLES = `
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
    min-width: min(340px, calc(100vw - 32px));
    max-width: 540px;
    width: 90%;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
    font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
    color: var(--primary-text-color, #e1e1e1);
  }
  .modal h2 { margin: 0 0 6px; font-size: 16px; font-weight: 700; line-height: 1.3; }
  .modal-meta { font-size: 12px; color: var(--harr-text-secondary, #9e9e9e); margin-bottom: 14px; }
  .section-divider {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--harr-text-secondary, #9e9e9e);
    padding: 10px 0 6px;
    border-top: 1px solid rgba(255,255,255,0.08);
    margin-top: 4px;
  }
  .modal-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
    margin-top: 20px;
    flex-wrap: wrap;
  }
  .btn-secondary {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    color: var(--primary-text-color, #e1e1e1);
    transition: background 0.15s;
  }
  .btn-secondary:hover { background: rgba(255,255,255,0.14); }
  .btn-danger {
    background: rgba(244,67,54,0.15);
    border: 1px solid rgba(244,67,54,0.4);
    color: #f44336;
    border-radius: 8px;
    padding: 8px 14px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-danger:hover { background: rgba(244,67,54,0.28); }
  .btn-danger:disabled, .btn-secondary:disabled { opacity: 0.5; cursor: default; }
  .modal-loading {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 0;
    color: var(--harr-text-secondary, #9e9e9e);
    font-size: 13px;
  }
  .spinner {
    width: 18px;
    height: 18px;
    border: 2px solid rgba(255,255,255,0.1);
    border-top-color: var(--harr-accent, #e5a00d);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 480px) {
    .modal { padding: 16px; }
  }
  .file-row {
    padding: 6px 0;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    font-size: 12px;
  }
  .file-row:last-child { border-bottom: none; }
  .file-name { color: var(--primary-text-color, #e1e1e1); word-break: break-all; line-height: 1.4; }
  .file-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 3px;
    color: var(--harr-text-secondary, #9e9e9e);
    font-size: 11px;
  }
  .file-progress {
    flex: 1;
    height: 3px;
    border-radius: 2px;
    accent-color: var(--harr-accent, #e5a00d);
  }
`;

class HarrDownloads extends BaseSection {
  constructor() {
    super();
    this._activeTab = "qbt";
    this._items = [];
    this._speedInfo = null;
    this._refreshTimer = null;
  }

  connectedCallback() {
    this._render();
    if (this._hass) this._startRefresh();
  }

  disconnectedCallback() {
    this._stopRefresh();
  }

  _init() {
    if (this.shadowRoot.children.length > 0) this._startRefresh();
  }

  _render() {
    const activeLabel = SUB_TABS.find(t => t.id === this._activeTab)?.label || "";
    this.shadowRoot.innerHTML = `
      <style>
        ${SECTION_STYLES}
        ${MODAL_STYLES}
        .speed-bar {
          padding: 8px 16px;
          font-size: 12px;
          color: var(--harr-text-secondary, #9e9e9e);
          background: var(--harr-card-bg, #1c1c1c);
          border-bottom: 1px solid var(--harr-border, rgba(255,255,255,0.08));
          display: flex;
          gap: 16px;
          flex-shrink: 0;
        }
        .speed-val { color: var(--harr-accent, #e5a00d); font-weight: 600; }
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
        /* icon alignment in sub-tabs */
        .sub-tab { display: flex; align-items: center; gap: 6px; }
        .sub-tab-option { display: flex; align-items: center; gap: 10px; }
        .sub-tab-icon, .sub-tab-option-icon {
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .sub-tab-icon { width: 1.2em; height: 1.2em; }
        .sub-tab-option-icon { width: 20px; height: 20px; }
        .sub-tab-icon svg, .sub-tab-option-icon svg { width: 100%; height: 100%; display: block; }
        @media (max-width: 480px) {
          .sub-tabs { display: none; }
          .sub-tab-mobile { display: flex; }
        }
      </style>
      <div class="sub-tabs">
        ${SUB_TABS.map((t) => `<div class="sub-tab${t.id === this._activeTab ? " active" : ""}" data-tab="${t.id}"><span class="sub-tab-icon">${t.icon}</span>${t.label}</div>`).join("")}
      </div>
      <div class="sub-tab-mobile" id="stm">
        <span class="sub-tab-current" id="stm-label"><span class="sub-tab-icon">${SUB_TABS.find(t => t.id === this._activeTab)?.icon ?? ""}</span>${activeLabel}</span>
        <button class="sub-tab-toggle" id="stm-toggle">&#9776;</button>
        <div class="sub-tab-dropdown" id="stm-dropdown">
          ${SUB_TABS.map(t => `<div class="sub-tab-option${t.id === this._activeTab ? " active" : ""}" data-tab="${t.id}"><span class="sub-tab-option-icon">${t.icon}</span>${t.label}</div>`).join("")}
        </div>
      </div>
      <div class="speed-bar" id="speed-bar">Connecting…</div>
      <div class="content" style="padding: 0">
        <div class="list" id="list"></div>
      </div>
    `;

    const shadow = this.shadowRoot;

    shadow.querySelectorAll(".sub-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.dataset.tab === this._activeTab) return;
        this._activeTab = btn.dataset.tab;
        shadow.querySelectorAll(".sub-tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === this._activeTab));
        this._refresh();
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
        const activeT = SUB_TABS.find(t => t.id === tab);
        shadow.getElementById("stm-label").innerHTML = `<span class="sub-tab-icon">${activeT?.icon ?? ""}</span>${activeT?.label ?? tab}`;
        shadow.querySelectorAll(".sub-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
        shadow.querySelectorAll(".sub-tab-option").forEach(o => o.classList.toggle("active", o.dataset.tab === tab));
        shadow.getElementById("stm-dropdown").classList.remove("open");
        this._refresh();
      });
    });
  }

  _startRefresh() {
    this._refresh();
    this._refreshTimer = setInterval(() => this._refresh(), REFRESH_INTERVAL);
  }

  _stopRefresh() {
    clearInterval(this._refreshTimer);
    this._refreshTimer = null;
  }

  async _refresh() {
    if (this._activeTab === "qbt") {
      await this._loadQbt();
    } else {
      await this._loadSab();
    }
  }

  async _loadQbt() {
    try {
      const [torrents, transfer] = await Promise.all([
        harrFetch(this._hass, `${QBT_BASE}/api/v2/torrents/info`),
        harrFetch(this._hass, `${QBT_BASE}/api/v2/transfer/info`).catch(() => null),
      ]);

      this._items = (torrents || []).map((t) => ({
        name: t.name,
        size: t.size,
        progress: (t.progress || 0) * 100,
        speed: t.dlspeed,
        eta: t.eta > 0 && t.eta < 8640000 ? _fmtEta(t.eta) : null,
        status: _qbtState(t.state),
        paused: t.state?.includes("paused") || t.state === "stoppedDL",
        hash: t.hash,
        client: "qbt",
      }));

      const speedBar = this.shadowRoot.getElementById("speed-bar");
      if (speedBar && transfer) {
        speedBar.innerHTML = `
          ⬇️ <span class="speed-val">${_fmtBytes(transfer.dl_info_speed)}/s</span> &nbsp;
          ⬆️ <span class="speed-val">${_fmtBytes(transfer.up_info_speed)}/s</span> &nbsp;
          Session: ⬇️ ${_fmtBytes(transfer.dl_info_data)} &nbsp; ⬆️ ${_fmtBytes(transfer.up_info_data)}
        `;
      }

      this._renderList();
    } catch (err) {
      const list = this.shadowRoot.getElementById("list");
      if (list) this._renderError(list, err.message);
    }
  }

  async _loadSab() {
    try {
      const data = await harrFetch(this._hass, `${SAB_BASE}/api?mode=queue&output=json`);
      const queue = data?.queue || {};
      const slots = queue.slots || [];

      this._items = slots.map((s) => ({
        name: s.filename,
        size: _parseSabSize(s.mb),
        progress: parseFloat(s.percentage || 0),
        speed: _parseSabSize(queue.kbpersec ? queue.kbpersec * 1024 : null),
        eta: s.timeleft || null,
        status: s.status,
        paused: s.status === "Paused",
        nzoId: s.nzo_id,
        client: "sab",
      }));

      const speedBar = this.shadowRoot.getElementById("speed-bar");
      if (speedBar) {
        const speed = queue.kbpersec ? `${parseFloat(queue.kbpersec / 1024).toFixed(1)} MB/s` : "0 B/s";
        speedBar.innerHTML = `
          ⬇️ <span class="speed-val">${speed}</span> &nbsp;
          Queue: ${_fmtBytes(_parseSabSize(queue.mbleft))} remaining
        `;
      }

      this._renderList();
    } catch (err) {
      const list = this.shadowRoot.getElementById("list");
      if (list) this._renderError(list, err.message);
    }
  }

  _renderList() {
    const list = this.shadowRoot.getElementById("list");
    if (!list) return;
    list.innerHTML = "";

    if (!this._items.length) {
      list.innerHTML = `<div class="empty"><div class="icon">⬇️</div><span>No active downloads</span></div>`;
      return;
    }

    for (const item of this._items) {
      const el = document.createElement("harr-download-item");
      el.item = item;

      el.addEventListener("harr-dl-pause", (e) => this._pauseResume(e.detail.item));
      el.addEventListener("harr-dl-detail", (e) => this._openDetailModal(e.detail.item));

      list.appendChild(el);
    }
  }

  async _pauseResume(item) {
    try {
      if (item.client === "qbt") {
        const action = item.paused ? "resume" : "pause";
        await harrFetch(this._hass, `${QBT_BASE}/api/v2/torrents/${action}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `hashes=${item.hash}`,
        });
      } else {
        const sabAction = item.paused ? "resume" : "pause";
        await harrFetch(this._hass, `${SAB_BASE}/api?mode=queue&name=${sabAction}&value=${item.nzoId}&output=json`);
      }
      setTimeout(() => this._refresh(), 500);
    } catch (err) {
      this._toast(`Action failed: ${err.message}`, "error");
    }
  }

  async _delete(item, deleteFiles, overlay) {
    try {
      if (item.client === "qbt") {
        const df = deleteFiles ? "true" : "false";
        await harrFetch(this._hass, `${QBT_BASE}/api/v2/torrents/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `hashes=${item.hash}&deleteFiles=${df}`,
        });
      } else {
        await harrFetch(this._hass, `${SAB_BASE}/api?mode=delete&id=${item.nzoId}&del_files=${deleteFiles ? 1 : 0}&output=json`);
      }
      overlay?.remove();
      setTimeout(() => this._refresh(), 500);
    } catch (err) {
      this._toast(`Delete failed: ${err.message}`, "error");
    }
  }

  _openDetailModal(item) {
    this.shadowRoot.querySelector(".modal-overlay")?.remove();

    const sizeStr = item.size ? _fmtBytes(item.size) : "";
    const meta = [sizeStr, item.status, item.eta ? `ETA ${item.eta}` : ""].filter(Boolean).join("  ·  ");

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <h2>${_esc(item.name)}</h2>
        <div class="modal-meta">${_esc(meta)}</div>
        ${item.client === "qbt" ? `
          <div class="section-divider">Files</div>
          <div id="file-list"><div class="modal-loading"><div class="spinner"></div> Loading files…</div></div>
        ` : ""}
        <div class="modal-actions">
          <button class="btn-secondary" id="close-btn">Close</button>
          <button class="btn-secondary" id="del-btn">Delete Torrent</button>
          <button class="btn-danger" id="del-files-btn">Delete + Files</button>
        </div>
      </div>
    `;

    overlay.querySelector("#close-btn").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector("#del-btn").addEventListener("click", async () => {
      overlay.querySelector("#del-btn").disabled = true;
      overlay.querySelector("#del-files-btn").disabled = true;
      await this._delete(item, false, overlay);
    });

    overlay.querySelector("#del-files-btn").addEventListener("click", async () => {
      overlay.querySelector("#del-btn").disabled = true;
      overlay.querySelector("#del-files-btn").disabled = true;
      await this._delete(item, true, overlay);
    });

    this.shadowRoot.appendChild(overlay);

    if (item.client === "qbt") {
      this._loadTorrentFiles(item, overlay);
    }
  }

  async _loadTorrentFiles(item, overlay) {
    const fileList = overlay.querySelector("#file-list");
    if (!fileList) return;
    try {
      const files = await harrFetch(this._hass, `${QBT_BASE}/api/v2/torrents/files?hash=${item.hash}`);
      if (!files?.length) {
        fileList.innerHTML = `<div style="font-size:12px;color:var(--harr-text-secondary,#9e9e9e);padding:8px 0">No files found.</div>`;
        return;
      }
      fileList.innerHTML = "";
      for (const f of files) {
        const pct = Math.round((f.progress || 0) * 100);
        const row = document.createElement("div");
        row.className = "file-row";
        row.innerHTML = `
          <div class="file-name">${_esc(f.name)}</div>
          <div class="file-meta">
            <span>${_fmtBytes(f.size)}</span>
            <progress class="file-progress" max="100" value="${pct}"></progress>
            <span>${pct}%</span>
          </div>
        `;
        fileList.appendChild(row);
      }
    } catch (err) {
      fileList.innerHTML = `<div style="font-size:12px;color:#f44336;padding:8px 0">Failed to load files: ${_esc(err.message)}</div>`;
    }
  }
}

function _qbtState(state) {
  const map = {
    downloading: "Downloading", uploading: "Seeding", stalledDL: "Stalled",
    stalledUP: "Seeding", pausedDL: "Paused", pausedUP: "Paused",
    stoppedDL: "Paused", stoppedUP: "Paused", checkingDL: "Checking",
    checkingUP: "Checking", error: "Error", missingFiles: "Missing Files",
    queuedDL: "Queued", queuedUP: "Queued",
  };
  return map[state] || state || "Unknown";
}

function _fmtBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = Number(bytes);
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

function _fmtEta(seconds) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function _parseSabSize(mb) {
  return mb ? parseFloat(mb) * 1024 * 1024 : 0;
}

function _esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

customElements.get("harr-downloads") || customElements.define("harr-downloads", HarrDownloads);

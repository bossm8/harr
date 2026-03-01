/**
 * <harr-download-item> — a single download queue row.
 *
 * Properties:
 *   item — { name, size, progress (0-100), speed, eta, status, hash|nzoId, client }
 *
 * Events:
 *   harr-dl-pause   — pause/resume clicked
 *   harr-dl-detail  — row clicked (open detail/delete modal)
 */

const DL_STYLES = `
  :host { display: block; }

  .item {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-rows: auto auto auto;
    gap: 4px 12px;
    padding: 12px 16px;
    border-bottom: 1px solid var(--harr-border, rgba(255,255,255,0.08));
    align-items: center;
    cursor: pointer;
    transition: background 0.15s;
  }

  .item:hover { background: rgba(255,255,255,0.03); }
  .item:last-child { border-bottom: none; }

  .name {
    font-size: 13px;
    font-weight: 500;
    color: var(--primary-text-color, #e1e1e1);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    grid-column: 1;
  }

  .meta {
    font-size: 11px;
    color: var(--harr-text-secondary, #9e9e9e);
    grid-column: 1;
  }

  .actions {
    grid-column: 2;
    grid-row: 1 / 3;
    display: flex;
    gap: 6px;
    align-items: center;
    align-self: center;
  }

  .progress-wrap {
    grid-column: 1 / 3;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  progress {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    accent-color: var(--harr-accent, #e5a00d);
  }

  progress::-webkit-progress-bar { background: rgba(255,255,255,0.1); border-radius: 2px; }
  progress::-webkit-progress-value { background: var(--harr-accent, #e5a00d); border-radius: 2px; }

  .pct {
    font-size: 11px;
    color: var(--harr-text-secondary, #9e9e9e);
    min-width: 36px;
    text-align: right;
  }

  .btn {
    background: none;
    border: 1px solid var(--harr-border, rgba(255,255,255,0.15));
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
    font-size: 12px;
    color: var(--primary-text-color, #e1e1e1);
    transition: background 0.15s;
  }

  .btn:hover { background: rgba(255,255,255,0.08); }

  .status-badge {
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 10px;
    font-weight: 600;
    text-transform: uppercase;
    background: rgba(255,255,255,0.08);
    color: var(--harr-text-secondary, #9e9e9e);
  }

  .status-badge.downloading { color: #4caf50; }
  .status-badge.paused      { color: #ff9800; }
  .status-badge.error       { color: #f44336; }
`;

class HarrDownloadItem extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._item = null;
  }

  set item(value) {
    this._item = value;
    this._render();
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
    style.textContent = DL_STYLES;
    shadow.appendChild(style);

    const el = document.createElement("div");
    el.className = "item";

    const statusClass = (item.status || "").toLowerCase().includes("pause") ? "paused"
      : (item.status || "").toLowerCase().includes("error") ? "error"
      : "downloading";

    const sizeStr = item.size ? _fmtBytes(item.size) : "";
    const speedStr = item.speed ? `${_fmtBytes(item.speed)}/s` : "";
    const etaStr = item.eta ? `ETA ${item.eta}` : "";
    const meta = [sizeStr, speedStr, etaStr].filter(Boolean).join("  ·  ");

    el.innerHTML = `
      <div class="name" title="${_esc(item.name)}">${_esc(item.name)}</div>
      <div class="meta">${meta || "&nbsp;"}</div>
      <div class="actions">
        <span class="status-badge ${statusClass}">${_esc(item.status || "")}</span>
        <button class="btn pause-btn">${item.paused ? "▶" : "⏸"}</button>
      </div>
      <div class="progress-wrap">
        <progress max="100" value="${item.progress || 0}"></progress>
        <span class="pct">${Math.round(item.progress || 0)}%</span>
      </div>
    `;

    el.querySelector(".pause-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      this.dispatchEvent(new CustomEvent("harr-dl-pause", { detail: { item }, bubbles: true, composed: true }));
    });

    el.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("harr-dl-detail", { detail: { item }, bubbles: true, composed: true }));
    });

    shadow.appendChild(el);
  }
}

function _fmtBytes(bytes) {
  if (!bytes) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = Number(bytes);
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

function _esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

customElements.get("harr-download-item") || customElements.define("harr-download-item", HarrDownloadItem);

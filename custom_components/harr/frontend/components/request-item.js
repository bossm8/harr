/**
 * <harr-request-item> — a seerr request row card.
 *
 * Properties:
 *   item  — seerr request object (media, requestedBy, status, _detail, etc.)
 *   hass  — Home Assistant object (for auth)
 *
 * Events:
 *   harr-request-approve — approve clicked
 *   harr-request-decline — decline clicked
 */

import { proxyImageUrl } from "../sections/_base-section.js";

// Media availability status (item.media.status) — matches discover.js AVAILABILITY
const MEDIA_STATUS_MAP = {
  1: { label: "Unknown",             color: "#9e9e9e" },
  2: { label: "Pending",             color: "#ff9800" },
  3: { label: "Processing",          color: "#9c27b0" },
  4: { label: "Partially Available", color: "#2196f3" },
  5: { label: "Available",           color: "#4caf50" },
};

// Request approval status (item.status) — 1=Pending, 2=Approved, 3=Declined
const REQUEST_STATUS_MAP = {
  1: { label: "Pending",  color: "#ff9800" },
  2: { label: "Approved", color: "#4caf50" },
  3: { label: "Declined", color: "#f44336" },
};

const REQ_STYLES = `
  :host { display: block; }

  .req {
    display: flex;
    gap: 12px;
    padding: 12px;
    border: 1px solid rgba(255,255,255,0.10);
    border-radius: 10px;
    background: rgba(255,255,255,0.02);
    margin-bottom: 10px;
    align-items: flex-start;
  }

  .poster {
    width: 90px;
    height: 135px;
    border-radius: 6px;
    object-fit: cover;
    background: #2a2a2a;
    flex-shrink: 0;
  }

  .poster-ph {
    width: 90px;
    height: 135px;
    border-radius: 6px;
    background: #2a2a2a;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    flex-shrink: 0;
  }

  .body {
    flex: 1;
    min-width: 0;
  }

  .title {
    font-size: 14px;
    font-weight: 600;
    color: var(--primary-text-color, #e1e1e1);
    margin-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .meta {
    font-size: 12px;
    color: var(--harr-text-secondary, #9e9e9e);
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .avatar {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
  }

  .status-badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    margin-bottom: 8px;
    background: rgba(255,255,255,0.08);
  }

  .actions {
    display: flex;
    gap: 6px;
  }

  .btn {
    padding: 5px 14px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    transition: opacity 0.15s;
  }

  .btn:hover { opacity: 0.85; }

  .btn-approve {
    background: #4caf50;
    color: #fff;
  }

  .btn-decline {
    background: rgba(244,67,54,0.15);
    color: #f44336;
    border: 1px solid rgba(244,67,54,0.3);
  }

  .btn-nav {
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    color: var(--primary-text-color, #e1e1e1);
  }
`;

class HarrRequestItem extends HTMLElement {
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
    style.textContent = REQ_STYLES;
    shadow.appendChild(style);

    const detail    = item._detail || {};
    const media     = item.media   || {};
    const title     = detail.title || detail.name || "Unknown";
    const year      = (detail.releaseDate || detail.firstAirDate || "").slice(0, 4);
    const type      = media.mediaType === "tv" ? "TV Show" : "Movie";
    const requester = item.requestedBy?.displayName || item.requestedBy?.username || "Unknown";
    const mediaStatus = item.media?.status;
    const statusInfo = item.status === 3
      ? { label: "Declined", color: "#f44336" }
      : (mediaStatus && mediaStatus >= 2
          ? MEDIA_STATUS_MAP[mediaStatus] || { label: String(mediaStatus), color: "#9e9e9e" }
          : REQUEST_STATUS_MAP[item.status] || { label: String(item.status), color: "#9e9e9e" });

    const posterPath = detail.posterPath;
    const posterUrl  = posterPath ? proxyImageUrl(`https://image.tmdb.org/t/p/w92${posterPath}`) : null;

    const requesterAvatar = item.requestedBy?.avatar;
    const showReqAvatar   = requesterAvatar?.startsWith("http");

    const approver         = item.modifiedBy?.displayName || item.modifiedBy?.username || null;
    const approverAvatar   = item.modifiedBy?.avatar;
    const showAprvAvatar   = approverAvatar?.startsWith("http");
    const approverVerb     = item.status === 3 ? "Declined" : "Approved";

    const isPending = item.status === 1;

    const el = document.createElement("div");
    el.className = "req";

    // Poster
    if (posterUrl) {
      const img = document.createElement("img");
      img.className = "poster";
      img.src = posterUrl;
      img.alt = title;
      img.loading = "lazy";
      el.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "poster-ph";
      ph.textContent = media.mediaType === "tv" ? "📺" : "🎬";
      el.appendChild(ph);
    }

    // Body
    const body = document.createElement("div");
    body.className = "body";

    // Title
    const titleDiv = document.createElement("div");
    titleDiv.className = "title";
    titleDiv.title = title;
    titleDiv.innerHTML = `${_esc(title)}${year ? ` <span style="font-weight:400;color:var(--harr-text-secondary)">(${year})</span>` : ""}`;
    body.appendChild(titleDiv);

    // Requester meta
    const reqMeta = document.createElement("div");
    reqMeta.className = "meta";
    reqMeta.innerHTML = `
      ${showReqAvatar ? `<img class="avatar" src="${_esc(requesterAvatar)}" alt="">` : ""}
      <span>${_esc(requester)} · ${_esc(type)} · ${_relTime(item.createdAt)}</span>`;
    body.appendChild(reqMeta);

    // Approver meta (only if there is a modifier and request is not pending)
    if (approver && !isPending) {
      const aprvMeta = document.createElement("div");
      aprvMeta.className = "meta";
      aprvMeta.innerHTML = `
        ${showAprvAvatar ? `<img class="avatar" src="${_esc(approverAvatar)}" alt="">` : ""}
        <span>${_esc(approverVerb)} by ${_esc(approver)} · ${_relTime(item.updatedAt)}</span>`;
      body.appendChild(aprvMeta);
    }

    // Status badge
    const badge = document.createElement("span");
    badge.className = "status-badge";
    badge.style.color = statusInfo.color;
    badge.textContent = statusInfo.label;
    body.appendChild(badge);

    if (isPending) {
      const actions = document.createElement("div");
      actions.className = "actions";

      const approve = document.createElement("button");
      approve.className = "btn btn-approve";
      approve.textContent = "Approve";
      approve.addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent("harr-request-approve", { detail: { item }, bubbles: true, composed: true }));
      });

      const decline = document.createElement("button");
      decline.className = "btn btn-decline";
      decline.textContent = "Decline";
      decline.addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent("harr-request-decline", { detail: { item }, bubbles: true, composed: true }));
      });

      actions.appendChild(approve);
      actions.appendChild(decline);
      body.appendChild(actions);
    }

    // "View in Movies/Shows" for approved/available/processing requests
    const tmdbId = item.media?.tmdbId;
    const mediaAvailStatus = item.media?.status || 0;
    if (tmdbId && mediaAvailStatus >= 3) {
      const navTab   = media.mediaType === "tv" ? "shows" : "movies";
      const navLabel = media.mediaType === "tv" ? "View in Shows" : "View in Movies";

      const navActions = document.createElement("div");
      navActions.className = "actions";

      const navBtn = document.createElement("button");
      navBtn.className = "btn btn-nav";
      navBtn.textContent = navLabel;
      navBtn.addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent("harr-navigate", {
          detail: { tab: navTab, tmdbId },
          bubbles: true,
          composed: true,
        }));
      });

      navActions.appendChild(navBtn);
      body.appendChild(navActions);
    }

    el.appendChild(body);
    shadow.appendChild(el);
  }
}

function _esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function _relTime(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

customElements.get("harr-request-item") || customElements.define("harr-request-item", HarrRequestItem);

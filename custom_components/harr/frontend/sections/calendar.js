/**
 * <harr-calendar> — monthly release calendar combining Radarr movies and Sonarr episodes.
 *
 * Filterable by Radarr release type (Cinema / Digital / Physical / All).
 * Sonarr episodes always appear regardless of filter.
 * Responsive: full pill on larger screens, coloured dot with letter on ≤500px.
 */

import { BaseSection, SECTION_STYLES, harrFetch, getHarrConfig, proxyImageUrl } from "./_base-section.js";

const RADARR_DATES = [
  { field: "inCinemas",       label: "Cinema",   letter: "C", key: "cinema"   },
  { field: "digitalRelease",  label: "Digital",  letter: "D", key: "digital"  },
  { field: "physicalRelease", label: "Physical", letter: "P", key: "physical" },
];

const FILTERS = [
  { key: "digital",  label: "Digital"  },
  { key: "cinema",   label: "Cinema"   },
  { key: "physical", label: "Physical" },
  { key: "all",      label: "All"      },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const CAL_STYLES = `
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* ── Toolbar ── */
  .cal-toolbar {
    display: flex;
    align-items: center;
    padding: 8px 12px;
    background: var(--harr-card-bg, #1c1c1c);
    border-bottom: 1px solid var(--harr-border, rgba(255,255,255,0.08));
    flex-shrink: 0;
    position: relative;
  }

  .cal-tb-left, .cal-tb-right {
    flex: 1;
    display: flex;
    align-items: center;
  }

  .cal-tb-right {
    justify-content: flex-end;
    gap: 4px;
  }

  .cal-tb-center {
    display: flex;
    justify-content: center;
    padding: 0 8px;
  }

  .nav-btn {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 6px;
    color: var(--primary-text-color, #e1e1e1);
    cursor: pointer;
    font-size: 14px;
    padding: 5px 10px;
    line-height: 1;
    transition: background 0.15s;
  }
  .nav-btn:hover { background: rgba(255,255,255,0.12); }

  .month-label {
    font-size: 15px;
    font-weight: 700;
    white-space: nowrap;
    text-align: center;
    color: var(--primary-text-color, #e1e1e1);
  }

  .filter-btn {
    padding: 5px 10px;
    line-height: 1;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(255,255,255,0.06);
    color: var(--primary-text-color, #e1e1e1);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
    flex-shrink: 0;
  }
  .filter-btn:hover { background: rgba(255,255,255,0.12); }
  .filter-btn.active {
    background: rgba(229,160,13,0.15);
    border-color: var(--harr-accent, #e5a00d);
    color: var(--harr-accent, #e5a00d);
  }

  /* ── Filter dropdown ── */
  .cal-filter-dropdown {
    display: none;
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 100;
    min-width: 180px;
    background: var(--harr-card-bg, #1c1c1c);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 10px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    padding: 6px 0;
    margin-top: 4px;
  }
  .cal-filter-dropdown.open { display: block; }

  .cal-filter-section-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--harr-text-secondary, #9e9e9e);
    padding: 8px 14px 4px;
  }

  .cal-filter-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 9px 14px;
    font-size: 13px;
    cursor: pointer;
    color: var(--primary-text-color, #e1e1e1);
    transition: background 0.12s;
    gap: 8px;
  }
  .cal-filter-option:hover { background: rgba(255,255,255,0.06); }
  .cal-filter-option.active { color: var(--harr-accent, #e5a00d); }

  .cal-filter-check {
    font-size: 14px;
    opacity: 0;
    flex-shrink: 0;
  }
  .cal-filter-option.active .cal-filter-check { opacity: 1; }

  .cal-filter-divider {
    height: 1px;
    background: rgba(255,255,255,0.08);
    margin: 4px 0;
  }

  /* ── Calendar grid ── */
  .cal-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px 16px;
    overscroll-behavior-y: contain;
  }

  .cal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
    min-width: 0;
  }

  .cal-header-cell {
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--harr-text-secondary, #9e9e9e);
    padding: 6px 2px;
  }

  .cal-day {
    min-height: 80px;
    border-radius: 6px;
    padding: 4px;
    border: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.01);
    display: flex;
    flex-direction: column;
    gap: 2px;
    cursor: default;
    transition: background 0.15s;
    overflow: hidden;
  }

  .cal-day.has-events { cursor: pointer; }
  .cal-day.has-events:hover { background: rgba(255,255,255,0.05); }

  .cal-day.today {
    border-color: var(--harr-accent, #e5a00d);
    background: rgba(229,160,13,0.04);
  }

  .cal-day.empty {
    background: transparent;
    border-color: transparent;
    cursor: default;
  }

  .day-num {
    font-size: 12px;
    font-weight: 600;
    color: var(--harr-text-secondary, #9e9e9e);
    line-height: 1;
    padding: 2px;
    flex-shrink: 0;
  }

  .cal-day.today .day-num {
    color: var(--harr-accent, #e5a00d);
  }

  .day-events {
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow: hidden;
    flex: 1;
  }

  /* ── Event pill (large screens) ── */
  .event-pill {
    display: flex;
    flex-direction: column;
    border-radius: 3px;
    padding: 2px 4px;
    cursor: pointer;
    overflow: hidden;
    flex-shrink: 0;
  }

  .pill-title {
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
  }

  .pill-type {
    font-size: 9px;
    opacity: 0.75;
    line-height: 1.2;
  }

  .event-pill.radarr {
    background: rgba(229,160,13,0.18);
    border-left: 2px solid #e5a00d;
    color: #e5a00d;
  }

  .event-pill.sonarr {
    background: rgba(33,150,243,0.18);
    border-left: 2px solid #2196f3;
    color: #2196f3;
  }

  .event-overflow {
    font-size: 9px;
    color: var(--harr-text-secondary, #9e9e9e);
    padding: 1px 4px;
  }

  /* ── Dot mode (small screens ≤ 500px) ── */
  @media (max-width: 500px) {
    .cal-day { min-height: 52px; padding: 3px; }
    .day-num  { font-size: 11px; }
    .day-events { flex-direction: row; flex-wrap: wrap; gap: 2px; align-content: flex-start; }

    .event-pill {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      align-items: center;
      justify-content: center;
      border-left: none;
      flex-shrink: 0;
      padding: 0;
    }

    .pill-title, .pill-type { display: none; }

    .event-pill::after {
      content: attr(data-letter);
      font-size: 8px;
      font-weight: 700;
      color: #fff;
      line-height: 1;
    }

    .event-pill.radarr { background: #e5a00d; }
    .event-pill.sonarr { background: #2196f3; }

    .event-overflow { display: none; }
  }

  /* ── Loading / error ── */
  .cal-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 200px;
    gap: 12px;
    color: var(--harr-text-secondary, #9e9e9e);
    font-size: 14px;
  }

  .spinner {
    width: 24px;
    height: 24px;
    border: 3px solid rgba(255,255,255,0.1);
    border-top-color: var(--harr-accent, #e5a00d);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

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
    min-width: 320px;
    max-width: 500px;
    width: 90%;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
    font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
    color: var(--primary-text-color, #e1e1e1);
  }

  .modal h2 {
    margin: 0 0 16px;
    font-size: 17px;
    font-weight: 700;
  }

  .modal-event {
    display: flex;
    gap: 12px;
    padding: 10px 0;
    border-top: 1px solid rgba(255,255,255,0.07);
    align-items: flex-start;
  }

  .modal-event:first-child { border-top: none; }

  .modal-poster {
    width: 50px;
    height: 75px;
    border-radius: 4px;
    object-fit: cover;
    background: #2a2a2a;
    flex-shrink: 0;
  }

  .modal-poster-ph {
    width: 50px;
    height: 75px;
    border-radius: 4px;
    background: #2a2a2a;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
  }

  .modal-event-body { flex: 1; min-width: 0; }

  .modal-event-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .modal-event-subtitle {
    font-size: 11px;
    margin-bottom: 4px;
  }

  .modal-event-subtitle.radarr { color: #e5a00d; }
  .modal-event-subtitle.sonarr { color: #2196f3; }

  .modal-event-overview {
    font-size: 11px;
    color: var(--harr-text-secondary, #9e9e9e);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.4;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }
  .modal-actions > *:first-child { margin-right: auto; }

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

  @media (max-width: 480px) {
    .modal-overlay { align-items: flex-end; justify-content: stretch; }
    .modal {
      width: 100%; max-width: 100%;
      height: auto; max-height: 100dvh; border-radius: 0;
      overflow-y: auto; overflow-x: hidden;
      padding: max(16px, env(safe-area-inset-top, 16px)) 16px 0;
    }
    .modal-actions {
      position: sticky; bottom: 0;
      background: var(--harr-card-bg, #1c1c1c);
      margin: 16px -16px 0;
      padding: 12px 16px max(20px, env(safe-area-inset-bottom, 20px));
      border-top: 1px solid var(--harr-border, rgba(255,255,255,0.08));
      flex-wrap: nowrap; justify-content: stretch; gap: 8px;
    }
    .modal-actions .btn-secondary { flex: 1; padding: 8px 8px; font-size: 12px; }
  }

  .btn-nav {
    margin-top: 6px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 6px;
    padding: 4px 12px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    color: var(--primary-text-color, #e1e1e1);
    transition: background 0.15s;
    white-space: nowrap;
    display: inline-block;
  }
  .btn-nav:hover { background: rgba(255,255,255,0.14); }

  /* ── Toast ── */
  .toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: var(--harr-card-bg, #2a2a2a);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 10px;
    padding: 12px 20px;
    font-size: 13px;
    color: var(--primary-text-color, #e1e1e1);
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    z-index: 9999;
    animation: fadeInUp 0.25s ease;
  }
  .toast.error { border-color: #f44336; color: #f44336; }
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
`;

class HarrCalendar extends BaseSection {
  constructor() {
    super();
    const now = new Date();
    this._year   = now.getFullYear();
    this._month  = now.getMonth();    // 0-indexed
    this._filter      = "digital";
    this._mediaFilter = "all";        // "all" | "movies" | "shows"
    this._events = new Map();         // "YYYY-MM-DD" → [event, ...]
    this._harrCfg = null;
    this._loading = false;
  }

  connectedCallback() {
    this._renderShell();
    if (this._hass) this._load();
  }

  _init() {
    if (this.shadowRoot.children.length > 0) this._load();
  }

  // ── Shell (toolbar + grid container) ──────────────────────────────────────

  _renderShell() {
    const shadow = this.shadowRoot;
    shadow.innerHTML = "";

    const style = document.createElement("style");
    style.textContent = CAL_STYLES;
    shadow.appendChild(style);

    // Toolbar (position: relative anchors the filter dropdown)
    const toolbar = document.createElement("div");
    toolbar.className = "cal-toolbar";

    // Left column — prev button
    const tbLeft = document.createElement("div");
    tbLeft.className = "cal-tb-left";
    const prevBtn = document.createElement("button");
    prevBtn.className = "nav-btn";
    prevBtn.textContent = "‹";
    prevBtn.addEventListener("click", () => this._navigate(-1));
    tbLeft.appendChild(prevBtn);
    toolbar.appendChild(tbLeft);

    // Centre column — month label (always centred regardless of side content width)
    const tbCenter = document.createElement("div");
    tbCenter.className = "cal-tb-center";
    const monthLabel = document.createElement("div");
    monthLabel.className = "month-label";
    monthLabel.id = "month-label";
    monthLabel.textContent = this._monthLabel();
    tbCenter.appendChild(monthLabel);
    toolbar.appendChild(tbCenter);

    // Right column — next button + filter button
    const tbRight = document.createElement("div");
    tbRight.className = "cal-tb-right";

    const nextBtn = document.createElement("button");
    nextBtn.className = "nav-btn";
    nextBtn.textContent = "›";
    nextBtn.addEventListener("click", () => this._navigate(1));
    tbRight.appendChild(nextBtn);

    const filterBtn = document.createElement("button");
    filterBtn.className = "filter-btn";
    filterBtn.id = "filter-btn";
    filterBtn.title = "Filter";
    filterBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M4.25 5.61C6.27 8.2 10 13 10 13v6c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-6s3.72-4.8 5.74-7.39A.998.998 0 0 0 18.95 4H5.04a1 1 0 0 0-.79 1.61z"/></svg>`;
    filterBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      shadow.getElementById("filter-dropdown").classList.toggle("open");
    });
    tbRight.appendChild(filterBtn);
    toolbar.appendChild(tbRight);

    // Filter dropdown — inside toolbar so position: relative anchoring works
    const dropdown = document.createElement("div");
    dropdown.className = "cal-filter-dropdown";
    dropdown.id = "filter-dropdown";

    // Release Type section
    const relTitle = document.createElement("div");
    relTitle.className = "cal-filter-section-title";
    relTitle.textContent = "Release Type";
    dropdown.appendChild(relTitle);

    for (const f of FILTERS) {
      const opt = document.createElement("div");
      opt.className = `cal-filter-option${f.key === this._filter ? " active" : ""}`;
      opt.dataset.filter = f.key;
      const lbl = document.createElement("span");
      lbl.textContent = f.label;
      const chk = document.createElement("span");
      chk.className = "cal-filter-check";
      chk.textContent = "✓";
      opt.appendChild(lbl);
      opt.appendChild(chk);
      opt.addEventListener("click", () => {
        this._setFilter(f.key);
        dropdown.classList.remove("open");
      });
      dropdown.appendChild(opt);
    }

    const divider = document.createElement("div");
    divider.className = "cal-filter-divider";
    dropdown.appendChild(divider);

    // Media Type section
    const mediaTitle = document.createElement("div");
    mediaTitle.className = "cal-filter-section-title";
    mediaTitle.textContent = "Media Type";
    dropdown.appendChild(mediaTitle);

    for (const { key, label } of [
      { key: "all",    label: "Both"   },
      { key: "movies", label: "Movies" },
      { key: "shows",  label: "Shows"  },
    ]) {
      const opt = document.createElement("div");
      opt.className = `cal-filter-option${key === this._mediaFilter ? " active" : ""}`;
      opt.dataset.mediaFilter = key;
      const lbl = document.createElement("span");
      lbl.textContent = label;
      const chk = document.createElement("span");
      chk.className = "cal-filter-check";
      chk.textContent = "✓";
      opt.appendChild(lbl);
      opt.appendChild(chk);
      opt.addEventListener("click", () => {
        this._setMediaFilter(key);
        dropdown.classList.remove("open");
      });
      dropdown.appendChild(opt);
    }

    toolbar.appendChild(dropdown);
    shadow.appendChild(toolbar);

    // Close dropdown on any click that reaches the shadow root
    shadow.addEventListener("click", () => {
      shadow.getElementById("filter-dropdown")?.classList.remove("open");
    });

    // Scrollable calendar area
    const scroll = document.createElement("div");
    scroll.className = "cal-scroll";
    scroll.id = "cal-scroll";
    shadow.appendChild(scroll);
  }

  // ── Data loading ───────────────────────────────────────────────────────────

  async _load() {
    if (this._loading) return;
    this._loading = true;

    const scroll = this.shadowRoot.getElementById("cal-scroll");
    if (scroll) scroll.innerHTML = `<div class="cal-loading"><div class="spinner"></div> Loading…</div>`;

    const start   = `${this._year}-${_pad(this._month + 1)}-01`;
    const lastDay = new Date(this._year, this._month + 1, 0).getDate();
    const end     = `${this._year}-${_pad(this._month + 1)}-${_pad(lastDay)}`;

    this._events = new Map();

    try {
      const cfg = await getHarrConfig(this._hass);
      this._harrCfg = cfg;

      const fetches = [];

      if (cfg.radarr) {
        fetches.push(
          harrFetch(this._hass,
            `/api/harr/radarr/api/v3/calendar?start=${start}&end=${end}&unmonitored=false`)
          .then(items => this._processRadarr(items || []))
          .catch(() => {})
        );
      }

      if (cfg.sonarr) {
        fetches.push(
          harrFetch(this._hass,
            `/api/harr/sonarr/api/v3/calendar?start=${start}&end=${end}&includeSeries=true&unmonitored=false`)
          .then(items => this._processSonarr(items || []))
          .catch(() => {})
        );
      }

      await Promise.all(fetches);
    } catch (err) {
      const s = this.shadowRoot.getElementById("cal-scroll");
      if (s) s.innerHTML = `<div class="cal-loading" style="color:#f44336">⚠️ ${_esc(err.message)}</div>`;
      this._loading = false;
      return;
    }

    this._loading = false;
    this._renderCalendar();
  }

  _processRadarr(items) {
    if (this._mediaFilter === "shows") return;
    for (const item of items) {
      const poster = item.images?.find(i => i.coverType === "poster");
      for (const { field, label, letter, key } of RADARR_DATES) {
        if (!item[field]) continue;
        if (this._filter !== "all" && this._filter !== key) continue;
        const dateStr = item[field].slice(0, 10);
        this._addEvent(dateStr, {
          type:        "movie",
          title:       item.title || "Unknown",
          subtitle:    label + " Release",
          releaseType: letter,
          service:     "radarr",
          posterUrl:   proxyImageUrl(poster?.remoteUrl || poster?.url || null),
          overview:    item.overview || "",
          year:        item.year || "",
          tmdbId:      item.tmdbId || null,
        });
      }
    }
  }

  _processSonarr(items) {
    // Episodes map to air dates — only meaningful in "digital" and "all" release modes
    if (this._filter !== "digital" && this._filter !== "all") return;
    if (this._mediaFilter === "movies") return;
    for (const item of items) {
      if (!item.airDateUtc) continue;
      const dateStr = item.airDateUtc.slice(0, 10);
      const poster  = item.series?.images?.find(i => i.coverType === "poster");
      this._addEvent(dateStr, {
        type:        "episode",
        title:       `${item.series?.title || "Unknown"} S${_pad(item.seasonNumber)}E${_pad(item.episodeNumber)}`,
        subtitle:    item.title || "Episode",
        releaseType: "E",
        service:     "sonarr",
        posterUrl:   proxyImageUrl(poster?.remoteUrl || poster?.url || null),
        overview:    "",
        tmdbId:      item.series?.tmdbId || null,
      });
    }
  }

  _addEvent(dateStr, event) {
    if (!this._events.has(dateStr)) this._events.set(dateStr, []);
    this._events.get(dateStr).push(event);
  }

  // ── Calendar rendering ─────────────────────────────────────────────────────

  _renderCalendar() {
    const scroll = this.shadowRoot.getElementById("cal-scroll");
    if (!scroll) return;
    scroll.innerHTML = "";

    const grid = document.createElement("div");
    grid.className = "cal-grid";

    // Day-of-week headers (Mon–Sun)
    for (const wd of WEEKDAYS) {
      const hdr = document.createElement("div");
      hdr.className = "cal-header-cell";
      hdr.textContent = wd;
      grid.appendChild(hdr);
    }

    // First day of month (0=Sun … 6=Sat), shift so Mon=0
    const firstDow = (new Date(this._year, this._month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(this._year, this._month + 1, 0).getDate();
    const todayStr = _todayStr();

    // Empty padding cells
    for (let i = 0; i < firstDow; i++) {
      const empty = document.createElement("div");
      empty.className = "cal-day empty";
      grid.appendChild(empty);
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${this._year}-${_pad(this._month + 1)}-${_pad(d)}`;
      const events  = this._events.get(dateStr) || [];
      const isToday = dateStr === todayStr;

      const cell = document.createElement("div");
      cell.className = `cal-day${isToday ? " today" : ""}${events.length ? " has-events" : ""}`;

      const num = document.createElement("div");
      num.className = "day-num";
      num.textContent = d;
      cell.appendChild(num);

      if (events.length) {
        const eventsDiv = document.createElement("div");
        eventsDiv.className = "day-events";

        // Sort: movies first, then episodes; then alphabetically
        const sorted = [...events].sort((a, b) => {
          if (a.type !== b.type) return a.type === "movie" ? -1 : 1;
          return a.title.localeCompare(b.title);
        });

        const maxVisible = 3;
        const visible = sorted.slice(0, maxVisible);
        const overflow = sorted.length - maxVisible;

        for (const ev of visible) {
          const pill = document.createElement("div");
          pill.className = `event-pill ${ev.service}`;
          pill.dataset.letter = ev.releaseType;
          pill.title = `${ev.title} — ${ev.subtitle}`;

          const t = document.createElement("div");
          t.className = "pill-title";
          t.textContent = ev.title;

          const s = document.createElement("div");
          s.className = "pill-type";
          s.textContent = ev.subtitle;

          pill.appendChild(t);
          pill.appendChild(s);
          eventsDiv.appendChild(pill);
        }

        if (overflow > 0) {
          const more = document.createElement("div");
          more.className = "event-overflow";
          more.textContent = `+${overflow} more`;
          eventsDiv.appendChild(more);
        }

        cell.appendChild(eventsDiv);

        cell.addEventListener("click", () => this._openDayModal(dateStr, sorted));
      }

      grid.appendChild(cell);
    }

    scroll.appendChild(grid);
  }

  // ── Day detail modal ───────────────────────────────────────────────────────

  _openDayModal(dateStr, events) {
    this.shadowRoot.querySelector(".modal-overlay")?.remove();

    const date = new Date(dateStr + "T12:00:00");
    const heading = date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    const modal = document.createElement("div");
    modal.className = "modal";

    const h2 = document.createElement("h2");
    h2.textContent = heading;
    modal.appendChild(h2);

    for (const ev of events) {
      const row = document.createElement("div");
      row.className = "modal-event";

      if (ev.posterUrl) {
        const img = document.createElement("img");
        img.className = "modal-poster";
        img.src = ev.posterUrl;
        img.alt = ev.title;
        img.loading = "lazy";
        row.appendChild(img);
      } else {
        const ph = document.createElement("div");
        ph.className = "modal-poster-ph";
        ph.textContent = ev.service === "radarr" ? "🎬" : "📺";
        row.appendChild(ph);
      }

      const body = document.createElement("div");
      body.className = "modal-event-body";

      const title = document.createElement("div");
      title.className = "modal-event-title";
      title.textContent = ev.title;
      body.appendChild(title);

      const sub = document.createElement("div");
      sub.className = `modal-event-subtitle ${ev.service}`;
      sub.textContent = ev.subtitle;
      body.appendChild(sub);

      if (ev.overview) {
        const ov = document.createElement("div");
        ov.className = "modal-event-overview";
        ov.textContent = ev.overview;
        body.appendChild(ov);
      }

      if (ev.tmdbId) {
        const navBtn = document.createElement("button");
        navBtn.className = "btn-nav";
        navBtn.textContent = ev.service === "radarr" ? "View in Movies" : "View in Shows";
        navBtn.addEventListener("click", () => {
          overlay.remove();
          this.dispatchEvent(new CustomEvent("harr-navigate", {
            detail: { tab: ev.service === "radarr" ? "movies" : "shows", tmdbId: ev.tmdbId },
            bubbles: true,
            composed: true,
          }));
        });
        body.appendChild(navBtn);
      }

      row.appendChild(body);
      modal.appendChild(row);
    }

    const actions = document.createElement("div");
    actions.className = "modal-actions";

    const closeBtn = document.createElement("button");
    closeBtn.className = "btn-secondary";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", () => overlay.remove());
    actions.appendChild(closeBtn);

    modal.appendChild(actions);
    overlay.appendChild(modal);
    this.shadowRoot.appendChild(overlay);
  }

  // ── Navigation and filters ─────────────────────────────────────────────────

  _navigate(delta) {
    this._month += delta;
    if (this._month > 11) { this._month = 0;  this._year++; }
    if (this._month < 0)  { this._month = 11; this._year--; }

    const label = this.shadowRoot.getElementById("month-label");
    if (label) label.textContent = this._monthLabel();

    this._load();
  }

  _setFilter(key) {
    if (key === this._filter) return;
    this._filter = key;

    this.shadowRoot.querySelectorAll("[data-filter]").forEach(opt => {
      opt.classList.toggle("active", opt.dataset.filter === key);
    });

    this._syncFilterBtn();
    this._load();
  }

  _setMediaFilter(key) {
    if (key === this._mediaFilter) return;
    this._mediaFilter = key;

    this.shadowRoot.querySelectorAll("[data-media-filter]").forEach(opt => {
      opt.classList.toggle("active", opt.dataset.mediaFilter === key);
    });

    this._syncFilterBtn();
    this._load();
  }

  _syncFilterBtn() {
    const btn = this.shadowRoot.getElementById("filter-btn");
    if (!btn) return;
    btn.classList.toggle("active", this._filter !== "digital" || this._mediaFilter !== "all");
  }

  _monthLabel() {
    return new Date(this._year, this._month, 1)
      .toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
}

function _pad(n) {
  return String(n).padStart(2, "0");
}

function _todayStr() {
  const t = new Date();
  return `${t.getFullYear()}-${_pad(t.getMonth() + 1)}-${_pad(t.getDate())}`;
}

function _esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

customElements.get("harr-calendar") || customElements.define("harr-calendar", HarrCalendar);

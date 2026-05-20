// ZenSearch Content Script
(function () {
  "use strict";
  if (document.getElementById("__zs-host")) return;

  let isOpen = false;
  let selectedIndex = 0;
  let results = [];
  let mode = "all";
  let searchTimer = null;
  let host, shadow, inputEl, resultsEl, modeBadge, countEl, toastEl;

  // ── Inline SVG icons ───────────────────────────────────────────────────────
  const I = {
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15" style="color:rgba(255,255,255,0.35);flex-shrink:0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    volume: `<svg viewBox="0 0 24 24" fill="none" stroke="#7ECAB4" stroke-width="2.5" width="13" height="13"><polygon points="11,5 6,9 2,9 2,15 6,15 11,19"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
    pin: (on) => `<svg viewBox="0 0 24 24" fill="${on?"#F5C542":"none"}" stroke="${on?"#F5C542":"currentColor"}" stroke-width="2" width="12" height="12"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>`,
    sleep: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/></svg>`,
    x: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="11" height="11"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>`,
    win: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="8" x2="22" y2="8"/></svg>`,
    bm: `<svg viewBox="0 0 24 24" fill="none" stroke="rgba(255,200,100,0.8)" stroke-width="2" width="12" height="12"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`,
    group: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><rect x="2" y="7" width="9" height="9" rx="1"/><rect x="13" y="7" width="9" height="9" rx="1"/><rect x="7" y="2" width="10" height="4" rx="1"/></svg>`,
    restore: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-4.55"/></svg>`,
  };

  // ── Fuzzy scorer ──────────────────────────────────────────────────────────
  function fuzzyScore(q, title, url) {
    if (!q) return 1;
    q = q.toLowerCase().trim();
    const tl = (title || "").toLowerCase();
    const ul = (url || "").toLowerCase();
    const combined = tl + " " + ul;
    if (tl === q || ul === q) return 1.0;
    if (tl.startsWith(q)) return 0.93;
    if (ul.includes(q)) return 0.87;
    if (tl.includes(q)) return 0.82;
    const tokens = q.split(/\s+/).filter(Boolean);
    const hits = tokens.filter((t) => combined.includes(t)).length;
    const ts = tokens.length > 0 ? (hits / tokens.length) * 0.65 : 0;
    let qi = 0;
    for (let i = 0; i < combined.length && qi < q.length; i++) {
      if (combined[i] === q[qi]) qi++;
    }
    const ss = qi === q.length ? 0.38 * (q.length / Math.max(combined.length, 1)) : 0;
    return Math.max(ts, ss);
  }

  function bg(type, data = {}) {
    return browser.runtime.sendMessage({ type, ...data });
  }

  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  function setMode(m) {
    mode = m;
    if (modeBadge) modeBadge.textContent = m;
    shadow.querySelectorAll(".cmd").forEach((b) =>
      b.classList.toggle("active", b.dataset.cmd === m)
    );
  }

  // ── Search ─────────────────────────────────────────────────────────────────
  async function runSearch(query) {
    if (!resultsEl) return;
    resultsEl.innerHTML = `<div class="empty-state">Loading…</div>`;
    try {
      if (mode === "all" || mode === "tabs") {
        const tabs = await bg("GET_TABS");
        let items = tabs.map((t) => ({ ...t, _type: "tab", _score: fuzzyScore(query, t.title, t.url) }));
        if (query) items = items.filter((i) => i._score > 0.09);
        items.sort((a, b) => b._score - a._score);
        renderResults(items, query);

      } else if (mode === "active") {
        const tabs = await bg("GET_ACTIVE");
        let items = tabs.map((t) => ({ ...t, _type: "tab", _score: fuzzyScore(query, t.title, t.url) }));
        if (query) items = items.filter((i) => i._score > 0.09);
        items.sort((a, b) => b._score - a._score);
        renderResults(items, query);

      } else if (mode === "bookmarks") {
        const bms = await bg("GET_BOOKMARKS");
        let items = bms.map((b) => ({ ...b, _type: "bookmark", _score: fuzzyScore(query, b.title, b.url) }));
        if (query) items = items.filter((i) => i._score > 0.09);
        else items = items.slice(0, 30);
        items.sort((a, b) => b._score - a._score);
        renderResults(items, query);

      } else if (mode === "history") {
        const hist = await bg("GET_HISTORY", { query });
        let items = hist.map((h) => ({ ...h, _type: "history", _score: fuzzyScore(query, h.title, h.url) }));
        if (query) items = items.filter((i) => i._score > 0.09);
        items.sort((a, b) => b._score - a._score);
        renderResults(items, query);

      } else if (mode === "windows") {
        const wins = await bg("GET_WINDOWS");
        renderWindows(wins);
      }
    } catch (err) {
      if (resultsEl) resultsEl.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`;
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function renderResults(items, query) {
    results = items;
    selectedIndex = 0;
    if (!resultsEl) return;
    resultsEl.innerHTML = "";

    if (!items.length) {
      resultsEl.innerHTML = `<div class="empty-state">No results${query ? ' for "' + query + '"' : ""}</div>`;
      setCount(0);
      return;
    }

    const exact = items.filter((i) => i._score >= 0.9);
    const close = items.filter((i) => i._score >= 0.5 && i._score < 0.9);
    const fuzzy = items.filter((i) => i._score < 0.5);
    const frag = document.createDocumentFragment();
    let idx = 0;

    if (exact.length && (close.length || fuzzy.length) && query) frag.appendChild(mkLabel("Best match"));
    exact.forEach((item) => frag.appendChild(mkRow(item, idx++, query)));
    if (close.length) {
      if (exact.length && query) frag.appendChild(mkLabel("Close matches"));
      close.forEach((item) => frag.appendChild(mkRow(item, idx++, query)));
    }
    if (fuzzy.length && query) {
      frag.appendChild(mkLabel("Partial matches"));
      fuzzy.forEach((item) => frag.appendChild(mkRow(item, idx++, query)));
    }

    resultsEl.appendChild(frag);
    highlight();
    setCount(items.length);
  }

  function mkLabel(text) {
    const el = document.createElement("div");
    el.className = "section-label";
    el.textContent = text;
    return el;
  }

  function mkRow(item, idx, query) {
    const row = document.createElement("div");
    row.className = "result-row";
    row.dataset.idx = String(idx);

    // Favicon
    const fav = document.createElement("div");
    fav.className = "favicon";
    if (item.favIconUrl) {
      const img = document.createElement("img");
      img.width = 14; img.height = 14; img.src = item.favIconUrl;
      img.onerror = () => { img.remove(); fav.textContent = letter(item); };
      fav.appendChild(img);
    } else if (item._type === "bookmark") {
      fav.innerHTML = I.bm;
    } else if (item._type === "history") {
      fav.innerHTML = I.clock;
    } else {
      fav.textContent = letter(item);
    }
    row.appendChild(fav);

    // Info
    const info = document.createElement("div");
    info.className = "result-info";

    const tr = document.createElement("div");
    tr.className = "result-title-row";

    const titleEl = document.createElement("span");
    titleEl.className = "result-title" + (item._score < 0.3 && query ? " muted" : "");
    titleEl.textContent = item.title || item.url || "(no title)";
    tr.appendChild(titleEl);

    if (item.pinned) tr.appendChild(mkBadge("📌", "badge-pin"));
    if (item.discarded) tr.appendChild(mkBadge("unloaded", "badge-dim"));
    if (query && item._score >= 0.9) tr.appendChild(mkBadge("exact", "badge-exact"));
    else if (query) tr.appendChild(mkBadge(Math.round(item._score * 100) + "%", "badge-score"));
    if (item._type === "bookmark") tr.appendChild(mkBadge("bookmark", "badge-bm"));
    if (item._type === "history") tr.appendChild(mkBadge("history", "badge-dim"));
    if (item.audible) { const a = document.createElement("span"); a.className = "audio-icon"; a.innerHTML = I.volume; a.title = "Audio playing"; tr.appendChild(a); }

    info.appendChild(tr);

    const urlEl = document.createElement("div");
    urlEl.className = "result-url";
    urlEl.textContent = trunc(item.url || "", 58);
    info.appendChild(urlEl);

    // Meta: window / group / folder / time
    const meta = document.createElement("div");
    meta.className = "result-meta";

    if (item._type === "tab") {
      // Window
      const winSpan = document.createElement("span");
      winSpan.className = "meta-text";
      winSpan.innerHTML = I.win + " Window " + item.windowId;
      meta.appendChild(winSpan);

      // Tab group — only if present
      if (item.groupTitle) {
        const dot = document.createElement("span");
        dot.className = "meta-dot";
        dot.textContent = "·";
        meta.appendChild(dot);

        const grpSpan = document.createElement("span");
        grpSpan.className = "meta-text";
        // Apply group colour if available (Zen/Chrome tabGroups colour names)
        const colourMap = { grey:"#888", blue:"#4a9eff", red:"#e05", yellow:"#c90", green:"#2a8", pink:"#d6a", purple:"#96d", cyan:"#0bc", orange:"#e70" };
        const col = colourMap[item.groupColor] || "#7ECAB4";
        grpSpan.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="${col}" stroke-width="2.5" width="12" height="12"><rect x="2" y="7" width="9" height="9" rx="1"/><rect x="13" y="7" width="9" height="9" rx="1"/><rect x="7" y="2" width="10" height="4" rx="1"/></svg> <span style="color:${col}">${item.groupTitle}</span>`;
        meta.appendChild(grpSpan);
      }
    }

    if (item._type === "bookmark" && item.folder) {
      const s = document.createElement("span");
      s.className = "meta-text";
      s.innerHTML = I.folder + " " + item.folder;
      meta.appendChild(s);
    }

    if (item._type === "history" && item.lastVisitTime) {
      const ago = Math.round((Date.now() - item.lastVisitTime) / 60000);
      const s = document.createElement("span");
      s.className = "meta-text";
      s.innerHTML = I.clock + " " + (ago < 60 ? ago + "m ago" : Math.round(ago / 60) + "h ago");
      meta.appendChild(s);
    }

    if (meta.childElementCount) info.appendChild(meta);
    row.appendChild(info);

    // Action buttons
    const actions = document.createElement("div");
    actions.className = "row-actions";

    if (item._type === "tab") {
      const pinBtn = mkActionBtn(I.pin(item.pinned), item.pinned ? "Unpin tab" : "Pin tab", item.pinned ? "pin-on" : "");
      pinBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try { await bg("PIN_TAB", { tabId: item.id, pinned: !item.pinned }); toast(item.pinned ? "Unpinned" : "Pinned"); runSearch(rawQuery()); }
        catch (err) { toast("Error: " + err.message); }
      });
      actions.appendChild(pinBtn);

      if (!item.discarded) {
        const ulBtn = mkActionBtn(I.sleep, "Unload tab (free memory)", "");
        ulBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          try { await bg("DISCARD_TAB", { tabId: item.id }); toast("Tab unloaded"); runSearch(rawQuery()); }
          catch (err) { toast("Error: " + err.message); }
        });
        actions.appendChild(ulBtn);
      }

      const closeBtn = mkActionBtn(I.x, "Close tab", "danger");
      closeBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        try { await bg("CLOSE_TAB", { tabId: item.id }); toast("Tab closed"); runSearch(rawQuery()); }
        catch (err) { toast("Error: " + err.message); }
      });
      actions.appendChild(closeBtn);
    }

    if (actions.childElementCount) row.appendChild(actions);
    row.addEventListener("click", () => activateItem(idx));
    return row;
  }

  function mkActionBtn(html, title, cls) {
    const btn = document.createElement("button");
    btn.className = "action-btn" + (cls ? " " + cls : "");
    btn.title = title;
    btn.innerHTML = html;
    return btn;
  }

  function mkBadge(text, cls) {
    const b = document.createElement("span");
    b.className = "badge " + cls;
    b.textContent = text;
    return b;
  }

  function renderWindows(wins) {
    results = wins.map((w) => ({ ...w, _type: "window", _score: 1 }));
    selectedIndex = 0;
    if (!resultsEl) return;
    resultsEl.innerHTML = "";
    if (!wins.length) { resultsEl.innerHTML = `<div class="empty-state">No windows found</div>`; return; }
    const frag = document.createDocumentFragment();
    frag.appendChild(mkLabel("Open windows"));
    wins.forEach((w, i) => {
      const row = document.createElement("div");
      row.className = "result-row" + (w.focused ? " selected" : "");
      row.dataset.idx = String(i);
      const fav = document.createElement("div"); fav.className = "favicon";
      if (w.favIconUrl) { const img = document.createElement("img"); img.width=14; img.height=14; img.src=w.favIconUrl; img.onerror=()=>{img.remove(); fav.innerHTML=I.win;}; fav.appendChild(img); }
      else fav.innerHTML = I.win;
      row.appendChild(fav);
      const info = document.createElement("div"); info.className = "result-info";
      const tr = document.createElement("div"); tr.className = "result-title-row";
      const t = document.createElement("span"); t.className = "result-title"; t.textContent = w.activeTabTitle; tr.appendChild(t);
      if (w.focused) tr.appendChild(mkBadge("current", "badge-exact"));
      info.appendChild(tr);
      const u = document.createElement("div"); u.className = "result-url"; u.textContent = w.tabCount + " tab" + (w.tabCount !== 1 ? "s" : ""); info.appendChild(u);
      row.appendChild(info);
      row.addEventListener("click", () => { bg("FOCUS_WINDOW", { windowId: w.id }); close(); });
      frag.appendChild(row);
    });
    resultsEl.appendChild(frag);
    setCount(wins.length);
  }

  // ── Activate item ──────────────────────────────────────────────────────────
  async function activateItem(idx) {
    const item = results[idx];
    if (!item) return;
    try {
      if (item._type === "tab") { await bg("SWITCH_TAB", { tabId: item.id, windowId: item.windowId }); close(); }
      else if (item._type === "bookmark" || item._type === "history") { window.open(item.url, "_blank"); close(); }
      else if (item._type === "window") { await bg("FOCUS_WINDOW", { windowId: item.id }); close(); }
    } catch (err) { toast("Error: " + err.message); }
  }

  async function unloadAll() {
    try {
      const res = await bg("UNLOAD_ALL");
      toast("Unloaded " + res.count + " tab" + (res.count !== 1 ? "s" : ""));
      setTimeout(() => runSearch(rawQuery()), 350);
    } catch (err) { toast("Error: " + err.message); }
  }

  // ── Keyboard nav (inside shadow — stops propagation to page) ──────────────
  function handleKeydown(e) {
    // Always stop key events from escaping to the page while overlay is open
    e.stopPropagation();

    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); selectedIndex = Math.min(selectedIndex + 1, results.length - 1); highlight(); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0); highlight(); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      if ((e.metaKey || e.ctrlKey) && results[selectedIndex]?.url) window.open(results[selectedIndex].url, "_blank");
      else activateItem(selectedIndex);
      return;
    }
    if (e.key === "Delete" && !e.metaKey && !e.ctrlKey) {
      const item = results[selectedIndex];
      if (item?._type === "tab") { bg("CLOSE_TAB", { tabId: item.id }); toast("Tab closed"); setTimeout(() => runSearch(rawQuery()), 200); }
    }
  }

  // ── Input handler ──────────────────────────────────────────────────────────
  function handleInput() {
    const val = inputEl.value;
    const cmdMatch = val.match(/^\/([a-z-]+)(?:\s+(.*))?$/);
    if (cmdMatch) {
      const [, cmd, rest = ""] = cmdMatch;
      const valid = ["all", "tabs", "active", "bookmarks", "history", "windows", "unload-all"];
      if (valid.includes(cmd)) {
        if (cmd === "unload-all") { unloadAll(); inputEl.value = ""; return; }
        setMode(cmd);
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => runSearch(rest), 130);
        return;
      }
    }
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(val), 130);
  }

  function rawQuery() {
    if (!inputEl) return "";
    const val = inputEl.value;
    const m = val.match(/^\/[a-z-]+\s+(.*)/);
    return m ? m[1] : val;
  }

  function highlight() {
    shadow.querySelectorAll(".result-row").forEach((r) =>
      r.classList.toggle("selected", parseInt(r.dataset.idx) === selectedIndex)
    );
    shadow.querySelector(`.result-row[data-idx="${selectedIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function setCount(n) {
    if (countEl) countEl.textContent = n + " result" + (n !== 1 ? "s" : "");
  }

  function letter(item) {
    return ((item.title || item.url || "?")[0] || "?").toUpperCase();
  }

  function trunc(s, max) { return s.length > max ? s.slice(0, max) + "…" : s; }

  // ── Open / close ───────────────────────────────────────────────────────────
  function open() {
    if (!shadow) buildUI();
    isOpen = true;
    host.style.display = "block";
    if (inputEl) {
      inputEl.value = "";
      setMode("all");
      runSearch("");
      // Reliable focus: try immediately, then after paint, then after short delay
      inputEl.focus({ preventScroll: true });
      requestAnimationFrame(() => inputEl.focus({ preventScroll: true }));
      setTimeout(() => inputEl.focus({ preventScroll: true }), 50);
    }
  }

  function close() {
    isOpen = false;
    if (host) host.style.display = "none";
  }

  function toggle() { isOpen ? close() : open(); }

  // ── Build UI ───────────────────────────────────────────────────────────────
  function buildUI() {
    host = document.createElement("div");
    host.id = "__zs-host";
    host.tabIndex = -1;
    host.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483647;display:none;";
    document.documentElement.appendChild(host);

    shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
<style>
*{box-sizing:border-box;margin:0;padding:0;}
:host{font-family:system-ui,-apple-system,sans-serif;}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,0.48);display:flex;align-items:flex-start;justify-content:center;padding-top:72px;}
.panel{width:580px;max-height:540px;background:rgba(15,15,19,0.94);border:0.5px solid rgba(255,255,255,0.1);border-radius:14px;display:flex;flex-direction:column;overflow:hidden;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);}
.search-bar{padding:13px 13px 9px;border-bottom:0.5px solid rgba(255,255,255,0.07);flex-shrink:0;}
.input-wrap{display:flex;align-items:center;gap:9px;background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.11);border-radius:10px;padding:8px 11px;}
.input-wrap input{flex:1;background:none;border:none;outline:none;color:rgba(255,255,255,0.9);font-size:14px;font-family:inherit;caret-color:#7ECAB4;}
.input-wrap input::placeholder{color:rgba(255,255,255,0.28);}
.mode-badge{font-size:11px;color:rgba(255,255,255,0.3);background:rgba(255,255,255,0.07);border-radius:5px;padding:2px 7px;white-space:nowrap;}
.cmds{display:flex;gap:5px;margin-top:9px;flex-wrap:wrap;align-items:center;}
.cmd{font-size:11px;color:rgba(255,255,255,0.42);background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.1);border-radius:6px;padding:3px 9px;cursor:pointer;}
.cmd:hover{background:rgba(255,255,255,0.11);}
.cmd.active{color:#7ECAB4;background:rgba(126,202,180,0.11);border-color:rgba(126,202,180,0.25);}
.cmd.danger{color:rgba(255,110,110,0.8);background:rgba(255,80,80,0.07);border-color:rgba(255,80,80,0.15);}
.cmd.danger:hover{background:rgba(255,80,80,0.14);}
.kbd-hint{margin-left:auto;font-size:10px;color:rgba(255,255,255,0.18);display:flex;align-items:center;gap:3px;}
.kbd-hint span{background:rgba(255,255,255,0.07);border-radius:4px;padding:1px 6px;}
.results{overflow-y:auto;flex:1;padding:5px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,0.1) transparent;}
.section-label{font-size:10px;color:rgba(255,255,255,0.26);text-transform:uppercase;letter-spacing:.08em;padding:7px 8px 4px;}
.result-row{display:flex;align-items:center;gap:10px;padding:8px 9px;border-radius:9px;cursor:pointer;border:0.5px solid transparent;}
.result-row:hover{background:rgba(255,255,255,0.045);border-color:rgba(255,255,255,0.07);}
.result-row.selected{background:rgba(126,202,180,0.07);border-color:rgba(126,202,180,0.14);}
.favicon{width:18px;height:18px;border-radius:4px;background:rgba(255,255,255,0.07);display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;font-size:10px;color:rgba(255,255,255,0.4);font-weight:500;}
.favicon img{width:14px;height:14px;object-fit:contain;}
.result-info{flex:1;min-width:0;}
.result-title-row{display:flex;align-items:center;gap:5px;}
.result-title{font-size:13px;color:rgba(255,255,255,0.87);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:1;min-width:0;}
.result-title.muted{color:rgba(255,255,255,0.4);}
.badge{font-size:10px;border-radius:4px;padding:1px 6px;flex-shrink:0;white-space:nowrap;}
.badge-exact{background:rgba(126,202,180,0.18);color:#7ECAB4;}
.badge-score{background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.32);}
.badge-bm{background:rgba(200,160,70,0.12);color:rgba(255,200,100,0.78);}
.badge-dim{background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.28);}
.badge-pin{background:rgba(245,197,66,0.11);color:rgba(245,197,66,0.85);font-size:9px;}
.audio-icon{flex-shrink:0;display:flex;align-items:center;margin-left:auto;}
.result-url{font-size:11px;color:rgba(255,255,255,0.26);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;}
.result-meta{display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap;}
.meta-text{font-size:11px;color:rgba(255,255,255,0.24);display:flex;align-items:center;gap:3px;}
.meta-text svg{color:rgba(255,255,255,0.2);}
.meta-dot{font-size:10px;color:rgba(255,255,255,0.15);}
.row-actions{display:flex;gap:3px;align-items:center;opacity:0;flex-shrink:0;transition:opacity .1s;}
.result-row:hover .row-actions,.result-row.selected .row-actions{opacity:1;}
.action-btn{width:24px;height:24px;border-radius:6px;background:rgba(255,255,255,0.07);border:0.5px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;cursor:pointer;color:rgba(255,255,255,0.5);}
.action-btn:hover{background:rgba(255,255,255,0.14);color:rgba(255,255,255,0.9);}
.action-btn.pin-on{color:#F5C542;background:rgba(245,197,66,0.12);border-color:rgba(245,197,66,0.25);}
.action-btn.danger:hover{background:rgba(255,70,70,0.14);color:rgba(255,120,120,0.9);border-color:rgba(255,70,70,0.28);}
.footer{padding:7px 13px;border-top:0.5px solid rgba(255,255,255,0.07);display:flex;gap:11px;align-items:center;flex-shrink:0;}
.fhint{font-size:10px;color:rgba(255,255,255,0.18);display:flex;align-items:center;gap:3px;}
.fhint span{background:rgba(255,255,255,0.07);border-radius:4px;padding:1px 5px;font-size:10px;}
.count{margin-left:auto;font-size:10px;color:rgba(255,255,255,0.15);}
.empty-state{padding:32px;text-align:center;color:rgba(255,255,255,0.22);font-size:13px;}
.toast{position:absolute;bottom:16px;left:50%;transform:translateX(-50%);background:rgba(28,28,34,0.97);border:0.5px solid rgba(255,255,255,0.12);border-radius:8px;padding:7px 15px;font-size:12px;color:rgba(255,255,255,0.7);pointer-events:none;white-space:nowrap;opacity:0;transition:opacity .18s;}
.toast.show{opacity:1;}
</style>
<div class="overlay" id="zs-overlay">
  <div class="panel" role="dialog" aria-modal="true">
    <div class="search-bar">
      <div class="input-wrap">${I.search}<input id="zs-input" type="text" placeholder="Search tabs, bookmarks, history…" autocomplete="off" spellcheck="false"/><span class="mode-badge" id="zs-mode-badge">all</span></div>
      <div class="cmds" id="zs-cmds">
        <button class="cmd active" data-cmd="all">/all</button>
        <button class="cmd" data-cmd="tabs">/tabs</button>
        <button class="cmd" data-cmd="active">/active</button>
        <button class="cmd" data-cmd="bookmarks">/bookmarks</button>
        <button class="cmd" data-cmd="history">/history</button>
        <button class="cmd" data-cmd="windows">/windows</button>
        <button class="cmd danger" data-cmd="unload-all">/unload-all</button>
        <div class="kbd-hint"><span>⌃⇧Space</span></div>
      </div>
    </div>
    <div class="results" id="zs-results"></div>
    <div class="footer">
      <div class="fhint"><span>↑↓</span>nav</div>
      <div class="fhint"><span>↵</span>switch</div>
      <div class="fhint"><span>⌘↵</span>new tab</div>
      <div class="fhint"><span>Del</span>close</div>
      <div class="fhint"><span>Esc</span>dismiss</div>
      <span class="count" id="zs-count"></span>
    </div>
  </div>
  <div class="toast" id="zs-toast"></div>
</div>`;

    resultsEl = shadow.getElementById("zs-results");
    inputEl = shadow.getElementById("zs-input");
    modeBadge = shadow.getElementById("zs-mode-badge");
    countEl = shadow.getElementById("zs-count");
    toastEl = shadow.getElementById("zs-toast");

    // Backdrop click → close
    shadow.getElementById("zs-overlay").addEventListener("mousedown", (e) => {
      if (e.target === shadow.getElementById("zs-overlay")) close();
    });

    // Prevent panel clicks from losing input focus
    shadow.querySelector(".panel").addEventListener("mousedown", (e) => {
      if (e.target !== inputEl) e.preventDefault();
    });

    inputEl.addEventListener("input", handleInput);

    // All keydown inside shadow: stop propagation so page never sees typing
    shadow.addEventListener("keydown", handleKeydown, true);

    // Command pills
    shadow.getElementById("zs-cmds").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-cmd]");
      if (!btn) return;
      const cmd = btn.dataset.cmd;
      if (cmd === "unload-all") { unloadAll(); return; }
      setMode(cmd);
      inputEl.value = "";
      inputEl.focus({ preventScroll: true });
      runSearch("");
    });
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  browser.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TOGGLE_SEARCH") toggle();
  });

  // Ctrl+Shift+Space shortcut — captured before page handlers
  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.shiftKey && e.code === "Space") {
      e.preventDefault();
      e.stopImmediatePropagation();
      toggle();
      return;
    }
    // While open, eat all keydown events at document level so page shortcuts don't fire
    if (isOpen) {
      e.stopImmediatePropagation();
      if (e.key === "Escape") { e.preventDefault(); close(); }
    }
  }, true);
})();

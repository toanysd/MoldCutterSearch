/**
 * search-history.js (v5.0 FINAL)
 * - FIX [object Object]: ép String() mọi nơi
 * - Luôn hiển thị lịch sử mặc định khi load
 * - Chọn chip = THAY THẾ toàn bộ input (không chèn)
 */
(function () {
  'use strict';

  const CONFIG = {
    storageKey: 'moldcutter_search_history_v777',
    maxItems: 120,
    maxRows: 3,
    chipMinW: 96,
    gap: 6,
    displayFallback: 12
  };

  const SEL = {
    host: ['#history-container', "[data-role='search-history']"],
    input: ['#search-input', '.search-input input', '.search-input']
  };

  const state = { items: [], lastRenderSig: '' };

  const API = { init, add, remove, clear, get, getTopPrefixes };
  window.SearchHistory = API;

  init();

  function init() {
    load();
    render(); // Hiển thị ngay khi load
    bindGlobal();
  }

  function bindGlobal() {
    const input = pick(SEL.input);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const q = String(input.value || '').trim();
          if (q) add(q);
        }
      });
    }
    document.addEventListener('search:submitted', (e) => {
      const q = String(e?.detail?.query || '').trim();
      if (q) add(q);
    });
    window.addEventListener('resize', throttle(render, 100));
  }

  function sortItems(arr) {
    return arr.slice().sort((a, b) => {
      if ((b.count || 0) !== (a.count || 0)) return (b.count || 0) - (a.count || 0);
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
  }

  function add(q) {
    q = String(q || '').trim();
    if (!q) return;
    const key = q.toLowerCase();
    const exist = state.items.find(x => String(x.query || '').toLowerCase() === key);
    if (exist) {
      exist.count = (exist.count || 0) + 1;
      exist.timestamp = Date.now();
    } else {
      state.items.unshift({ query: q, timestamp: Date.now(), count: 1 });
    }
    if (state.items.length > CONFIG.maxItems) state.items.length = CONFIG.maxItems;
    save();
    render();
    emitUpdated();
  }

  function remove(q) {
    const key = String(q || '').trim().toLowerCase();
    const before = state.items.length;
    state.items = state.items.filter(x => String(x.query || '').toLowerCase() !== key);
    if (state.items.length !== before) {
      save();
      render();
      emitUpdated();
    }
  }

  function clear() {
    if (!state.items.length) return;
    state.items = [];
    save();
    render();
    emitUpdated();
  }

  function get() { return state.items.slice(); }

  function getTopPrefixes(n = 24) {
    const freq = new Map();
    for (const it of state.items) {
      const s = String(it.query || '').trim();
      const p = s.slice(0, Math.min(4, s.length));
      if (p.length >= 2) freq.set(p, (freq.get(p) || 0) + 1);
    }
    return Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  }

  function load() {
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      const arr = raw ? JSON.parse(raw) : [];
      state.items = sanitize(arr);
    } catch { state.items = []; }
  }

  function save() {
    try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(state.items)); } catch {}
  }

  function sanitize(arr) {
    const map = new Map();
    (Array.isArray(arr) ? arr : []).forEach(x => {
      const q = String(x?.query || '').trim();
      if (!q || q === '[object Object]') return; // Bỏ qua corrupt data
      const key = q.toLowerCase();
      const item = { query: q, timestamp: Number(x?.timestamp || Date.now()), count: Number(x?.count || 1) };
      if (!map.has(key)) map.set(key, item);
      else {
        const old = map.get(key);
        old.count += item.count;
        old.timestamp = Math.max(old.timestamp, item.timestamp);
      }
    });
    return Array.from(map.values());
  }

  function render() {
    const host = pick(SEL.host);
    if (!host) return;
    
    host.innerHTML = `
      <div class="hist-head">
        <div class="title">履歴 / Lịch sử</div>
        <button class="clear-btn" data-act="clear" title="クリア / Xóa">クリア</button>
      </div>
      <div class="chip-wrap" role="list"></div>
    `;

    const list = calcDisplayList();
    const sig = list.map(x => `${String(x.query)}|${x.count}`).join('~');
    if (sig === state.lastRenderSig) return;
    state.lastRenderSig = sig;

    const wrap = host.querySelector('.chip-wrap');
    if (!list.length) {
      wrap.innerHTML = `<div class="muted">[履歴なし] / Chưa có lịch sử</div>`;
    } else {
      list.forEach(it => {
        const queryStr = String(it.query || '');
        if (!queryStr || queryStr === '[object Object]') return;
        
        const btn = document.createElement('button');
        btn.className = 'chip';
        btn.setAttribute('role', 'listitem');
        btn.title = queryStr;
        btn.innerHTML = `
          <span class="t">${escapeHtml(queryStr)}</span>
          <span class="c">${it.count}</span>
          <span class="x" title="削除 / Xóa">×</span>
        `;
        btn.addEventListener('click', (e) => {
          if (e.target.classList?.contains('x')) return;
          replaceInput(queryStr); // THAY THẾ toàn bộ input
        });
        btn.querySelector('.x').addEventListener('click', (e) => {
          e.stopPropagation();
          remove(queryStr);
        });
        wrap.appendChild(btn);
      });
    }

    host.querySelector('[data-act="clear"]')?.addEventListener('click', clear);
    ensureStyle();
  }

  function calcDisplayList() {
    const host = pick(SEL.host);
    const containerWidth = Math.max(1, (host?.clientWidth || 280));
    const cols = Math.max(1, Math.floor((containerWidth + CONFIG.gap) / (CONFIG.chipMinW + CONFIG.gap)));
    const maxChips = Math.max(cols * CONFIG.maxRows, CONFIG.displayFallback);
    return sortItems(state.items).slice(0, maxChips);
  }

  // THAY THẾ toàn bộ input, không chèn
  function replaceInput(v) {
    const input = pick(SEL.input);
    if (!input) return;
    input.value = v; // Thay thế toàn bộ
    focusInput(input, v.length);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.dispatchEvent(new CustomEvent('search:updated', { detail: { origin: 'history-chip' } }));
  }

  function emitUpdated() {
    document.dispatchEvent(new CustomEvent('history:updated', { detail: { items: get() } }));
  }

  function pick(sels) { for (const s of sels) { const el = document.querySelector(s); if (el) return el; } return null; }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function focusInput(el, pos) { try { el.focus({ preventScroll:true }); el.setSelectionRange(pos, pos); } catch {} }
  function throttle(fn, ms) { let t = 0; return (...a) => { const now = Date.now(); if (now - t > ms) { t = now; fn(...a); } }; }
  
  function ensureStyle() {
    if (document.getElementById('hist-style')) return;
    const st = document.createElement('style');
    st.id = 'hist-style';
    st.textContent = `
      #history-container { height: 100%; display: flex; flex-direction: column; padding: 4px; }
      #history-container .hist-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 4px 10px; margin-bottom: 4px;
        background: linear-gradient(135deg, #e0f2fe 0%, #dbeafe 100%);
        border-radius: 8px; border: 1px solid #bae6fd;
      }
      #history-container .title { font-weight: 600; font-size: 13px; color: #0c4a6e; }
      #history-container .clear-btn { 
        background:#fff; border:1px solid #38bdf8; border-radius:6px;
        padding:4px 10px; font-size:11px; color:#0369a1; font-weight:600;
        cursor:pointer; transition:.2s;
      }
      #history-container .clear-btn:hover { background:#e0f2fe; }
      #history-container .chip-wrap { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-wrap: wrap; gap: ${CONFIG.gap}px; }
      #history-container .muted { color: #9ca3af; font-size: 11px; padding: 4px; }
      #history-container .chip { 
        display: inline-flex; align-items: center; gap: 3px; 
        background: #fff; border: 1px solid #e5e7eb; color: #111827; 
        border-radius: 12px; padding: 4px 8px; font-size: 13px; line-height: 1; cursor:pointer;
      }
      #history-container .chip .t { max-width: 18ch; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      #history-container .chip .c { background: #eef2ff; color: #4338ca; border-radius: 8px; padding: 1px 4px; font-size: 10px; }
      #history-container .chip .x { color: #9aa4b2; margin-left: 2px; }
      #history-container .chip:hover { border-color:#38bdf8; background: #e7f7fa;}
    `;
    document.head.appendChild(st);
  }
})();

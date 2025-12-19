/**
 * quick-input.js (v1.0)
 * - Trích xuất ký tự đầu từ tên khuôn/dao cắt
 * - Hiển thị chip nhập nhanh, thay thế input khi click
 * - Đồng bộ khi search:updated, history:updated
 */
(function () {
  'use strict';

  const CONFIG = {
    maxPhrases: 24,
    chipMinW: 64,
    gap: 6,
    rows: 4
  };

  const SEL = {
    host: ['#abbr-wrap', '.quick-phrases'],
    input: ['#search-input', '.search-input input', '.search-input']
  };

  const state = {
    phrases: [],
    lastSig: ''
  };

  init();

  function init() {
    render();
    bindEvents();
    extractFromHistory();
  }

  function bindEvents() {
    document.addEventListener('search:updated', extractFromResults);
    document.addEventListener('history:updated', extractFromHistory);
    window.addEventListener('resize', throttle(render, 100));
  }

  // Trích xuất từ kết quả tìm kiếm hiện tại
  function extractFromResults() {
    const results = window.SearchModule?.getResults?.() || [];
    const codes = results.map(it => String(it.displayCode || it.MoldCode || it.CutterNo || '').trim()).filter(Boolean);
    const names = results.map(it => String(it.displayName || it.MoldName || it.CutterName || '').trim()).filter(Boolean);
    
    const fromCodes = extractAbbr([...codes, ...names]);
    state.phrases = uniq([...fromCodes, ...state.phrases]).slice(0, CONFIG.maxPhrases);
    render();
  }

  // Trích xuất từ lịch sử
  function extractFromHistory() {
    const hist = window.SearchHistory?.get?.() || [];
    const queries = hist.map(x => String(x.query || '')).filter(Boolean);
    const fromHist = extractAbbr(queries);
    state.phrases = uniq([...fromHist, ...state.phrases]).slice(0, CONFIG.maxPhrases);
    render();
  }

  // Trích ký tự đầu từ chuỗi
  function extractAbbr(strings) {
    const result = new Set();
    strings.forEach(s => {
      const clean = String(s).trim();
      if (!clean || clean.length < 2) return;
      
      // Lấy 2-4 ký tự đầu (chữ cái/số)
      const match = clean.match(/^[A-Za-z0-9]+/);
      if (match) {
        const abbr = match[0].toUpperCase();
        if (abbr.length >= 2 && abbr.length <= 4) result.add(abbr);
      }
      
      // Lấy các từ viết hoa liên tiếp
      const caps = clean.match(/[A-Z]{2,4}/g);
      if (caps) caps.forEach(c => result.add(c));
    });
    return Array.from(result);
  }

  function render() {
    const host = pick(SEL.host);
    if (!host) return;

    const sig = state.phrases.join('|');
    if (sig === state.lastSig) return;
    state.lastSig = sig;

    host.innerHTML = `
      <div class="qi-head">
        <div class="title">クイック入力 / Nhập nhanh</div>
      </div>
      <div class="qi-wrap"></div>
    `;

    const wrap = host.querySelector('.qi-wrap');
    if (!state.phrases.length) {
      wrap.innerHTML = `<div class="muted">[候補なし] / Chưa có cụm</div>`;
    } else {
      const width = Math.max(1, host.clientWidth || 200);
      const cols = Math.max(1, Math.floor((width + CONFIG.gap) / (CONFIG.chipMinW + CONFIG.gap)));
      const maxChips = Math.max(cols * CONFIG.rows, 12);
      const slice = state.phrases.slice(0, maxChips);

      slice.forEach(phrase => {
        const btn = document.createElement('button');
        btn.className = 'qi-chip';
        btn.textContent = phrase;
        btn.title = phrase;
        btn.addEventListener('click', () => applyPhrase(phrase));
        wrap.appendChild(btn);
      });
    }

    ensureStyle();
  }

  function applyPhrase(phrase) {
    const input = pick(SEL.input);
    if (!input) return;
    input.value = phrase; // Thay thế toàn bộ
    input.focus({ preventScroll: true });
    try { input.setSelectionRange(phrase.length, phrase.length); } catch {}
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.dispatchEvent(new CustomEvent('search:updated', { detail: { origin: 'quick-input' } }));
  }

  function uniq(arr) { return Array.from(new Set(arr.map(v => String(v).trim()))).filter(Boolean); }
  function pick(sels) { for (const s of sels) { const el = document.querySelector(s); if (el) return el; } return null; }
  function throttle(fn, ms) { let t = 0; return (...a) => { const now = Date.now(); if (now - t > ms) { t = now; fn(...a); } }; }

  function ensureStyle() {
    if (document.getElementById('qi-style')) return;
    const st = document.createElement('style');
    st.id = 'qi-style';
    st.textContent = `
      #abbr-wrap, .quick-phrases { 
        height: 100%; display: flex; flex-direction: column; padding: 8px; 
      }
      .qi-head {
        padding: 6px 10px; margin-bottom: 8px;
        background: linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%);
        border-radius: 8px; border: 1px solid #c084fc;
      }
      .qi-head .title { font-weight: 600; font-size: 13px; color: #6b21a8; }
      .qi-wrap { 
        flex: 1; min-height: 0; overflow: hidden; 
        display: flex; flex-wrap: wrap; gap: ${CONFIG.gap}px; align-content: flex-start;
      }
      .qi-wrap .muted { color: #9ca3af; font-size: 11px; padding: 4px; }
      .qi-chip {
        background: #fff; border: 1px solid #e5e7eb; color: #111827;
        border-radius: 10px; padding: 4px 10px; font-size: 12px; 
        font-weight: 600; cursor: pointer; transition: .2s;
      }
      .qi-chip:hover { border-color: #c084fc; background: #faf5ff; }
    `;
    document.head.appendChild(st);
  }
})();

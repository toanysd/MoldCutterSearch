/**
 * search-suggestions.js (v5.0 FINAL)
 * - FIX [object Object]: ép String()
 * - Luôn hiển thị gợi ý mặc định (top lịch sử)
 * - Chọn = THAY THẾ toàn bộ input
 */
(function () {
  'use strict';
  const CFG = { minLen: 2, maxPopover: 8, rows: 2, chipMinW: 96, gap: 6, debounce: 140 };
  const SEL = {
    input: ['#search-input', '.search-input input', '.search-input'],
    pop: '#suggest-popover',
    lower: '#keyboard-suggest',
    kbTab: ".lower-tab[data-tab='keyboard']"
  };

  let input, pop, lower, t, hideTimer = null;

  init();

  function init() {
    input = pick(SEL.input);
    ensurePopover();
    ensureStyle();
    lower = document.querySelector(SEL.lower);
    if (!input) return;

    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(onChange, CFG.debounce); });
    document.querySelector(SEL.kbTab)?.addEventListener('click', () =>
      setTimeout(() => renderLower(compute(query()).lower), 40)
    );
    document.addEventListener('history:updated', () => renderLower(compute(query()).lower));
    document.addEventListener('search:updated', () => renderLower(compute(query()).lower));
    window.addEventListener('resize', () => renderLower(compute(query()).lower));
    
    // Render mặc định ngay khi load
    setTimeout(() => {
      const res = compute(query());
      renderLower(res.lower);
    }, 100);
  }

  function query() { return (input?.value || '').trim(); }

  function onChange() {
    const q = query();
    const results = compute(q);
    renderPopover(results.popover);
    renderLower(results.lower);
  }

  function compute(q) {
    const min = q.length >= CFG.minLen;
    const histObjs = window.SearchHistory?.get?.() || [];
    
    // FIX: ép String() để tránh [object Object]
    const fromHist = histObjs
      .map(x => String(x?.query || ''))
      .filter(s => s && s !== '[object Object]')
      .filter(s => !min || s.toLowerCase().includes(q.toLowerCase()));

    const cur = window.SearchModule?.getResults?.() || [];
    const fromCur = min
      ? uniq(cur.flatMap(it => [it.displayCode, it.displayName])
              .filter(Boolean)
              .map(v => String(v))
              .filter(v => v && v !== '[object Object]')
              .filter(v => v.toLowerCase().includes(q.toLowerCase())))
      : [];

    const all = window.DataManager?.getAllItems?.() || [];
    const fromData = min
      ? uniq(all.flatMap(it => [
                it.MoldCode, it.CutterNo, it.MoldName, it.CutterName,
                it.displayCode, it.displayName, it?.designInfo?.DrawingNumber
              ])
              .filter(Boolean)
              .map(v => String(v))
              .filter(v => v && v !== '[object Object]')
              .filter(v => v.toLowerCase().includes(q.toLowerCase())))
      : [];

    const merged = uniq([...fromHist, ...fromCur, ...fromData]);

    // Luôn hiển thị top lịch sử nếu không có gợi ý khác
    if (!merged.length && fromHist.length) {
      return { popover: fromHist.slice(0, CFG.maxPopover), lower: fromHist };
    }
    
    return { popover: merged.slice(0, CFG.maxPopover), lower: merged.length ? merged : fromHist };
  }

  function ensurePopover() {
    pop = document.querySelector(SEL.pop);
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'suggest-popover';
      document.body.appendChild(pop);
    }
  }

  function renderPopover(list) {
    if (!input || !pop || !list.length) return hidePop();

    const host = input.closest('.left-col, .search-filter, .panel') || input.parentElement;
    const rIn = input.getBoundingClientRect();
    const rCol = host ? host.getBoundingClientRect() : rIn;

    Object.assign(pop.style, {
      position: 'fixed',
      left: `${rCol.left}px`,
      top: `${rIn.bottom + 4}px`,
      width: `${Math.max(rCol.width, rIn.width)}px`,
      maxWidth: `${rCol.width}px`,
      background: '#fff',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      boxShadow: '0 8px 24px rgba(0,0,0,.12)',
      zIndex: 9999,
      display: 'block'
    });

    pop.innerHTML = `
      <div class="suggest-list">
        ${list.map(v => `<div class="suggest-item" data-val="${esc(String(v))}">${esc(String(v))}</div>`).join('')}
      </div>
    `;

    pop.querySelectorAll('.suggest-item').forEach(it =>
      it.addEventListener('click', () => replaceInput(it.dataset.val))
    );

    const off = (e) => { if (!pop.contains(e.target) && e.target !== input) hidePop(); };
    const key = (e) => { if (e.key === 'Escape') hidePop(); };
    document.addEventListener('mousedown', off, { once: true });
    document.addEventListener('keydown', key, { once: true });
    window.addEventListener('resize', hidePop, { once: true });
    window.addEventListener('scroll', hidePop, { once: true, capture: true });

    clearTimeout(hideTimer);
    hideTimer = setTimeout(hidePop, 6000);
  }

  function hidePop() {
    if (pop) pop.style.display = 'none';
    clearTimeout(hideTimer);
  }

  function renderLower(list) {
    if (!lower) lower = document.querySelector(SEL.lower);
    if (!lower) return;

    lower.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'sg-head';
    head.innerHTML = `<span>提案 / Gợi ý</span>`;
    lower.appendChild(head);

    if (!Array.isArray(list) || !list.length) {
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = '[提案なし] / Chưa có gợi ý';
      lower.appendChild(empty);
      return;
    }

    const width = Math.max(1, lower.clientWidth || 300);
    const cols = Math.max(1, Math.floor((width + CFG.gap) / (CFG.chipMinW + CFG.gap)));
    const maxItems = Math.max(cols * CFG.rows, cols);
    const slice = list.slice(0, maxItems);

    const histSet = new Set((window.SearchHistory?.get?.() || []).map(x => String(x.query)));

    const row = document.createElement('div');
    row.className = 'chip-row';
    lower.appendChild(row);

    slice.forEach(val => {
      const valStr = String(val);
      if (!valStr || valStr === '[object Object]') return;
      
      const isHist = histSet.has(valStr);
      const btn = document.createElement('button');
      btn.className = 'quick-btn';
      btn.textContent = valStr;
      btn.title = valStr;
      btn.addEventListener('click', () => replaceInput(valStr)); // THAY THẾ
      if (isHist) {
        const del = document.createElement('span');
        del.className = 'chip-remove';
        del.textContent = '×';
        del.title = 'remove';
        del.addEventListener('click', (e) => {
          e.stopPropagation();
          window.SearchHistory?.remove?.(valStr);
        });
        btn.appendChild(del);
      }
      row.appendChild(btn);
    });
  }

  // THAY THẾ toàn bộ input
  function replaceInput(v) {
    if (!input) return;
    input.value = v; // Thay thế hoàn toàn
    input.focus({ preventScroll: true });
    try { input.setSelectionRange(v.length, v.length); } catch {}
    hidePop();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.dispatchEvent(new CustomEvent('search:updated', { detail: { origin: 'suggestion' } }));
  }

  function ensureStyle() {
    if (document.getElementById('suggest-style')) return;
    const st = document.createElement('style');
    st.id = 'suggest-style';
    st.textContent = `
      #keyboard-suggest { padding: 8px; overflow: hidden; }
      #keyboard-suggest .sg-head { 
        font-weight: 600; font-size: 13px; color: #0c4a6e; 
        padding: 4px 10px; margin-bottom: 4px;
        background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
        border-radius: 8px; border: 1px solid #fbbf24;
      }
      #keyboard-suggest .muted { color: #9ca3af; font-size: 11px; padding: 2px 4px; }
      #keyboard-suggest .chip-row { display: flex; flex-wrap: wrap; gap: ${CFG.gap}px; }
      #keyboard-suggest .quick-btn {
        background: #fff; border: 1px solid #e2e8f0; border-radius: 10px;
        padding: 4px 8px; font-size: 13px; line-height: 1; user-select: none; cursor:pointer;
      }
      #keyboard-suggest .quick-btn .chip-remove { margin-left: 6px; color: #9aa4b2; }

      #suggest-popover .suggest-list { max-height: 50vh; overflow: auto; }
      #suggest-popover .suggest-item { padding: 8px 10px; cursor: pointer; }
      #suggest-popover .suggest-item:hover { background: #f3f4f6; }
    `;
    document.head.appendChild(st);
  }

  function uniq(arr) { return Array.from(new Set(arr.map(v => String(v).trim()))).filter(v => v && v !== '[object Object]'); }
  function pick(sels) { for (const s of sels) { const el = document.querySelector(s); if (el) return el; } return null; }
  function esc(s) { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
})();

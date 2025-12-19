/**
 * virtual-keyboard.js (v4.6.1 - Fixed Functions & Colors)
 * ✅ FIXES:
 * - Debounce 150ms (was 45ms) - ngăn nhập trùng
 * - Prevent duplicate touch + mouse events
 * - Fixed RESET button (filter reset)
 * - Fixed SEARCH button (full reset + category "Tất cả" + focus)
 * - Auto-clear input on page load
 * - Updated function key colors (Blue/Orange/Red/Green)
 * - 2-line bilingual labels (JP left, VN right italic)
 */
(function () {
  'use strict';

  const SEL = {
    mount: '#virtual-keyboard',
    input: ['#search-input', '.search-input input', '.search-input'],
    filterResetBtn: ['[data-action="filter-reset"]', '#btnFilterReset', '.filter-reset'],
    categorySelect: '#category-select, select[name="category"], [data-role="category-select"]'
  };

  let pressing = false;
  let lastType = null;
  let lastPressTime = 0;
  // 🧩 Lưu input hiện tại đang focus
  let activeInput = null;

  // Khi người dùng bấm vào ô trong popup hoặc bất kỳ input nào
  document.addEventListener("focusin", (e) => {
      if (e.target.matches("input, textarea, select")) {
          activeInput = e.target;
          console.log("[VK] Focus changed →", activeInput.id || activeInput.className);
      }
  });

  // Khi module popup gửi keyboardattach (ví dụ từ checkin-checkout)
  document.addEventListener("keyboardattach", (e) => {
      const el = e.detail?.element;
      if (el) {
          activeInput = el;
          console.log("[VK] Keyboard attached to", el.id || el.className);
      }
  });



  init();

  function init() {
    ensureStyle();
    
    // ✅ AUTO-CLEAR INPUT ON PAGE LOAD
    clearInputOnLoad();
    
    mountWhenReady();

    document.addEventListener('click', (e) => {
      if (e.target.closest('.lower-tab[data-tab="keyboard"]')) {
        setTimeout(mount, 40);
      }
    });

    window.addEventListener('resize', adjustSpaceWidth);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        doClear();
        e.preventDefault();
      }
    });
  }

  // ✅ XÓA INPUT KHI MỞ TRANG
  function clearInputOnLoad() {
    const inp = getFirst(SEL.input);
    if (inp) {
      inp.value = '';
      console.log('[VK] ✅ Auto-cleared input on page load');
    }
  }

  function mountWhenReady() {
    if (document.readyState !== 'loading') mount();
    else document.addEventListener('DOMContentLoaded', mount);
  }

  function mount() {
    const host = document.querySelector(SEL.mount);
    if (!host) return;

    host.className = 'vk-root';
    host.innerHTML = `
      <div class="vk" role="application" aria-label="Virtual Keyboard">
        <!-- Row 1: Numbers + Backspace -->
        <div class="vk-row vk-num">
          ${row(['1','2','3','4','5','6','7','8','9','0'])}
          <button class="vk-key vk-func vk-back" data-k="BACK" aria-label="Backspace">&#x232b;</button>
        </div>

        <!-- Row 2: QWERTY + CLEAR -->
        <div class="vk-row vk-row2">
          ${row(['Q','W','E','R','T','Y','U','I','O','P'])}
          <button class="vk-key vk-func vk-clear" data-k="CLEAR" aria-label="Clear">
            <span class="vk-label-jp">クリア</span>
            <span class="vk-label-vn">Xóa</span>
          </button>
        </div>

        <!-- Row 3: ASDFGH -->
        <div class="vk-row vk-row3">
          ${row(['A','S','D','F','G','H','J','K','L'])}
          <button class="vk-key vk-func" data-k="-" aria-label="Dash">-</button>
        </div>

        <!-- Row 4: ZXCVBN + Special -->
        <div class="vk-row vk-row4">
          ${row(['Z','X','C','V','B','N','M'])}
          <button class="vk-key vk-func" data-k="." aria-label="Period">.</button>
          <button class="vk-key vk-func" data-k="/" aria-label="Slash">/</button>
        </div>

        <!-- Row 5: Actions -->
        <div class="vk-row vk-row5">
          <button class="vk-key vk-func vk-reset" data-k="RESET" aria-label="Reset">
            <span class="vk-label-jp">リセット</span>
            <span class="vk-label-vn">Xóa lọc</span>
          </button>
          <button class="vk-key vk-func vk-space" data-k="SPACE" aria-label="Space">Space</button>
          <button class="vk-key vk-func vk-search" data-k="SEARCH" aria-label="Search">
            <span class="vk-label-jp">新検索</span>
            <span class="vk-label-vn">Tìm mới</span>
          </button>
        </div>
      </div>
    `;

    bind(host);
    adjustSpaceWidth();
  }

  function row(keys) {
    return keys.map(k => `<button class="vk-key" data-k="${k}">${k}</button>`).join('');
  }

  function bind(host) {
    const keys = host.querySelectorAll('.vk-key');
    keys.forEach(btn => {
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handlePress(btn);
      }, { passive: false });

      btn.addEventListener('click', (e) => {
        if (e.pointerType === 'mouse' || e.detail > 0) {
          handlePress(btn);
        }
      });
    });
  }

  function handlePress(btn) {
    const code = btn.dataset.k;
    const type = btn.classList.contains('vk-func') ? 'func' : 'char';
    
    // Debounce 150ms
    const now = Date.now();
    if (now - lastPressTime < 150) {
      console.log('[VK] Debounced:', code);
      return;
    }
    lastPressTime = now;

    pressOnce(code, type);
  }

  function pressOnce(code, type) {
    if (pressing && type !== lastType) return;
    
    pressing = true;
    lastType = type;

    // Visual feedback
    const btn = document.querySelector(`.vk-key[data-k="${CSS.escape(code)}"]`);
    if (btn) {
      btn.classList.add('vk-pressed');
      setTimeout(() => btn.classList.remove('vk-pressed'), 180);
    }

    // Execute action
    if (code === 'BACK') doBack();
    else if (code === 'CLEAR') doClear();
    else if (code === 'RESET') doReset();
    else if (code === 'SEARCH') doSearch();
    else if (code === 'SPACE') doChar(' ');
    else doChar(code);

    setTimeout(() => {
      pressing = false;
      lastType = null;
    }, 180);
  }

  function doChar(ch) {
    const inp = getActiveInput();
    if (!inp) return;

    const start = inp.selectionStart || 0;
    const end = inp.selectionEnd || 0;
    const val = inp.value || '';

    inp.value = val.slice(0, start) + ch + val.slice(end);
    inp.selectionStart = inp.selectionEnd = start + ch.length;

    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.focus();
  }

  function doBack() {
    const inp = getActiveInput();
    if (!inp) return;

    const start = inp.selectionStart || 0;
    const end = inp.selectionEnd || 0;
    const val = inp.value || '';

    if (start !== end) {
      inp.value = val.slice(0, start) + val.slice(end);
      inp.selectionStart = inp.selectionEnd = start;
    } else if (start > 0) {
      inp.value = val.slice(0, start - 1) + val.slice(start);
      inp.selectionStart = inp.selectionEnd = start - 1;
    }

    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.focus();
  }

  function doClear() {
    const inp = getActiveInput();
    if (!inp) return;
    
    inp.value = '';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.focus();
    
    console.log('[VK] Cleared input');
  }

  // ✅ FIXED: RESET = Xóa lọc (Filter Reset)
  function doReset() {
    console.log('[VK] 🗑️ RESET: Filter reset triggered');
    
    // METHOD 1: Click filter reset button
    for (const sel of SEL.filterResetBtn) {
      const btn = document.querySelector(sel);
      if (btn) {
        console.log('[VK] ✅ Found filter reset button:', sel);
        btn.click();
        return;
      }
    }

    // METHOD 2: Call FilterModule.reset()
    if (window.FilterModule && typeof window.FilterModule.reset === 'function') {
      console.log('[VK] ✅ Calling FilterModule.reset()');
      window.FilterModule.reset();
      return;
    }

    // METHOD 3: Dispatch event
    console.log('[VK] ⚠️ No reset button or FilterModule, dispatching event');
    document.dispatchEvent(new CustomEvent('filter:reset'));
  }

  // ✅ FIXED: SEARCH = Tìm mới (Full Reset: filter + input + category + focus + search)
  function doSearch() {
    console.log('[VK] 🆕 SEARCH: New search triggered (full reset)');
    
    // STEP 1: Reset filter
    doReset();
    
    // STEP 2: Clear search input
    const searchBox = getFirst(SEL.input);
    if (searchBox) {
      searchBox.value = '';
      searchBox.dispatchEvent(new Event('input', { bubbles: true }));
      console.log('[VK] ✅ Cleared search input');
    }
    
    // STEP 3: Reset category to "Tất cả" (value='')
    const catSelect = document.querySelector(SEL.categorySelect);
    if (catSelect) {
      catSelect.value = '';
      catSelect.dispatchEvent(new Event('change', { bubbles: true }));
      console.log('[VK] ✅ Reset category to "Tất cả"');
    }
    
    // STEP 4: Focus search input
    if (searchBox) {
      setTimeout(() => {
        searchBox.focus();
        console.log('[VK] ✅ Focused search input');
      }, 100);
    }
    
    // STEP 5: Trigger new search
    setTimeout(() => {
      if (window.SearchModule?.performSearch) {
        window.SearchModule.performSearch();
      } else {
        document.dispatchEvent(new Event('search:trigger'));
      }
      console.log('[VK] ✅ Triggered new search');
    }, 150);
  }

  function getActiveInput() {
      // Ưu tiên input được bàn phím hoặc popup gắn thủ công
      if (activeInput && document.body.contains(activeInput)) {
          return activeInput;
      }

      // Nếu người dùng đang bật con trỏ ở một input khác
      if (document.activeElement && document.activeElement.matches("input,textarea,select")) {
          activeInput = document.activeElement;
          return activeInput;
      }

      // Cuối cùng, fallback là searchbox
      return getFirst(SEL.input);
  }



  function getFirst(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function adjustSpaceWidth() {
    const space = document.querySelector('.vk-space');
    if (!space) return;
    
    const vk = space.closest('.vk');
    if (!vk) return;

    const w = vk.offsetWidth;
    const reset = vk.querySelector('.vk-reset');
    const search = vk.querySelector('.vk-search');
    
    const gap = 10;
    const resetW = reset ? reset.offsetWidth : 120;
    const searchW = search ? search.offsetWidth : 120;
    const spaceW = w - resetW - searchW - (gap * 4);
    
    space.style.width = Math.max(spaceW, 80) + 'px';
  }

  function ensureStyle() {
    if (document.getElementById('vk-style-v461')) return;
    
    const st = document.createElement('style');
    st.id = 'vk-style-v461';
    st.textContent = `
      /* Virtual Keyboard v4.6.1 - Fixed Functions & Colors */
      .vk-root { 
        padding: 12px; 
        background: #f5f5f5; 
        border-radius: 8px; 
      }
      
      .vk { 
        display: flex; 
        flex-direction: column; 
        gap: 8px; 
        max-width: 100%; 
      }
      
      .vk-row { 
        display: flex; 
        gap: 6px; 
        justify-content: center; 
      }
      
      .vk-key { 
        min-width: 56px; 
        height: 52px; 
        padding: 8px 12px;
        background: white;
        border: 2px solid #e0e0e0;
        border-radius: 6px;
        font-size: 18px;
        font-weight: 600;
        color: #212121;
        cursor: pointer;
        user-select: none;
        transition: all 0.15s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 2px;
      }
      
      .vk-key:hover { 
        background: #fafafa; 
        border-color: #2196F3;
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      
      .vk-key:active,
      .vk-key.vk-pressed { 
        background: #e3f2fd; 
        border-color: #1976D2;
        transform: translateY(0);
        box-shadow: inset 0 2px 4px rgba(0,0,0,0.1);
      }
      
      /* ✅ UPDATED: Function keys - Blue theme */
      .vk-func { 
        background: white;
        border: 2px solid #e0e0e0 !important;
        color: #212121;
        font-size: 14px;
      }
      
      .vk-func:hover {
        background: #2563eb;
        border-color: #1d4ed8 !important;
      }
      
      .vk-func:active,
      .vk-func.vk-pressed {
        background: #1d4ed8;
        border-color: #1e40af !important;
      }
      
      /* ✅ UPDATED: Backspace - Blue */
      .vk-back { 
        min-width: 72px; 
        font-size: 22px;
        background: #3b82f6;
        border-color: #2563eb !important;
      }

      .vk-back:hover {
        background: #2563eb;
      }

      .vk-back:active,
      .vk-back.vk-pressed {
        background: #1d4ed8;
      }

      /* ✅ UPDATED: CLEAR - Red theme */
      .vk-clear {
        min-width: 72px;
        background: #ef4444 !important;
        border-color: #dc2626 !important;
      }

      .vk-clear:hover {
        background: #dc2626 !important;
      }

      .vk-clear:active,
      .vk-clear.vk-pressed {
        background: #b91c1c !important;
      }

      /* ✅ UPDATED: RESET - Orange theme */
      .vk-reset {
        min-width: 100px;
        max-width: 140px;
        flex: 0 0 auto;
        background: #f59e0b !important;
        border-color: #d97706 !important;
      }

      .vk-reset:hover {
        background: #d97706 !important;
      }

      .vk-reset:active,
      .vk-reset.vk-pressed {
        background: #b45309 !important;
      }

      /* ✅ UPDATED: SEARCH - Green theme */
      .vk-search { 
        min-width: 100px; 
        max-width: 140px;
        flex: 0 0 auto;
        background: #10b981 !important;
        border-color: #059669 !important;
      }

      .vk-search:hover {
        background: #059669 !important;
      }

      .vk-search:active,
      .vk-search.vk-pressed {
        background: #047857 !important;
      }

      /* Space - Gray */
      .vk-space { 
        flex: 1; 
        min-width: 80px;
        background: #e5e7eb !important;
        border-color: #d1d5db !important;
        color: #374151 !important;
      }

      .vk-space:hover {
        background: #d1d5db !important;
      }

      .vk-space:active,
      .vk-space.vk-pressed {
        background: #9ca3af !important;
      }
      
      /* 2-line bilingual labels */
      .vk-label-jp {
        font-size: 13px;
        font-weight: 700;
        color: #fff;
        white-space: nowrap;
      }
      
      .vk-label-vn {
        font-size: 10px;
        font-weight: 600;
        font-style: italic;
        color: rgba(255,255,255,0.85);
        white-space: nowrap;
      }
      
      /* Responsive */
      @media (max-width: 1024px) {
        .vk-key { 
          min-width: 48px; 
          height: 48px; 
          font-size: 16px; 
        }
        .vk-label-jp { font-size: 12px; }
        .vk-label-vn { font-size: 9px; }
      }
      
      @media (max-width: 768px) {
        .vk-key { 
          min-width: 42px; 
          height: 44px; 
          font-size: 15px; 
        }
        .vk-label-jp { font-size: 11px; }
        .vk-label-vn { font-size: 8px; }
      }
    `;
    document.head.appendChild(st);
  }

  console.log('[VirtualKeyboard v4.6.1] ✅ Fixed functions + colors');
})();

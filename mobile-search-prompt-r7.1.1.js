/**
 * mobile-search-prompt-r7.1.2.js
 * Pull-down -> show thumb-friendly transparent prompt (JP+VI).
 * Tap prompt -> focus/click search input to open keyboard (iPhone-safe user gesture).
 * Auto close after 1.5s; dismiss by swipe-down on prompt.
 * Also inject a Search button into bottom nav (left side) in the same style.
 *
 * Designed for MoldCutterSearch mobile UI (JP+VI, JP prioritized).
 */

(function () {
  'use strict';

  // -----------------------------
  // Config
  // -----------------------------
  const CFG = {
    enabledMaxWidth: 767,          // only for phones
    pullThresholdPx: 105,          // pull distance to trigger prompt
    dismissAfterMs: 2500,          // auto close
    promptMinVisibleMs: 250,       // prevent instant close flicker
    promptSwipeDismissPx: 40,      // swipe down on prompt to close
    promptId: 'mcs-search-prompt',
    promptBackdropId: 'mcs-search-prompt-backdrop',
    navSearchBtnId: 'nav-search-btn',
    navBarId: 'bottom-nav-bar',
    navHasSearchClass: 'has-search'
  };

  // -----------------------------
  // Helpers
  // -----------------------------
  function isPhone() {
    return window.innerWidth <= CFG.enabledMaxWidth;
  }

  function q(sel, root) {
    return (root || document).querySelector(sel);
  }

  function closest(el, sel) {
    if (!el) return null;
    return el.closest ? el.closest(sel) : null;
  }

  function getPullContainer() {
    // Match UI-R7.1.1 candidates in spirit but keep independent
    return (
      q('#quick-results-list') ||
      q('#quick-results-grid') ||
      q('.quick-results-grid') ||
      q('#quick-results') ||
      q('[data-role="quick-results"]')
    );
  }

  function getPrimarySearchInput() {
    // iPhone uses the mobile header search input
    // fallback to desktop input if needed
    return (
      q('#mobile-search-input') ||
      q('#search-input') ||
      q('#global-search-input') ||
      q('input[type="search"]') ||
      q('input.search-input')
    );
  }

  function clearSearchInput(input) {
    if (!input) return;
    input.value = '';
    try {
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (e) {
      // older browsers fallback
      const ev = document.createEvent('Event');
      ev.initEvent('input', true, true);
      input.dispatchEvent(ev);
    }
  }

  function focusSearchInput(input) {
    if (!input) return false;
    try {
      // Ensure it's visible on screen
      input.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    } catch (e) {}

    // iOS keyboard usually requires a direct user gesture (tap),
    // which is satisfied when this function is called from a click/touch handler.
    try { input.focus({ preventScroll: true }); } catch (e) { try { input.focus(); } catch (e2) {} }
    try { input.click(); } catch (e) {}
    return true;
  }

  function now() {
    return Date.now();
  }

  // -----------------------------
  // Prompt UI
  // -----------------------------
  let promptOpenAt = 0;
  let dismissTimer = null;

  function ensurePromptDom() {
    let backdrop = document.getElementById(CFG.promptBackdropId);
    let prompt = document.getElementById(CFG.promptId);

    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = CFG.promptBackdropId;
      backdrop.style.position = 'fixed';
      backdrop.style.left = '0';
      backdrop.style.top = '0';
      backdrop.style.right = '0';
      backdrop.style.bottom = '0';
      backdrop.style.zIndex = '20000';
      backdrop.style.display = 'none';
      backdrop.style.pointerEvents = 'none'; // prompt handles interaction
      document.body.appendChild(backdrop);
    }

    if (!prompt) {
      prompt = document.createElement('div');
      prompt.id = CFG.promptId;

      // Default inline styles (CSS file can override if desired)
      prompt.style.position = 'fixed';
      prompt.style.left = '50%';
      // Thumb-friendly zone: slightly below center
      prompt.style.top = 'calc(46% + 3cm)';
      prompt.style.transform = 'translate(-50%, -50%)';
      prompt.style.zIndex = '20001';
      prompt.style.display = 'none';
      prompt.style.minWidth = '240px';
      prompt.style.maxWidth = '320px';
      prompt.style.padding = '14px 16px';
      prompt.style.borderRadius = '14px';
      prompt.style.background = 'rgba(30, 41, 59, 0.55)'; // slate-ish transparent
      prompt.style.backdropFilter = 'blur(6px)';
      prompt.style.webkitBackdropFilter = 'blur(6px)';
      prompt.style.border = '1px solid rgba(255, 255, 255, 0.25)';
      prompt.style.boxShadow = '0 10px 25px rgba(0,0,0,0.20)';
      prompt.style.color = '#fff';
      prompt.style.fontSize = '13px';
      prompt.style.lineHeight = '1.25';
      prompt.style.textAlign = 'center';
      prompt.style.pointerEvents = 'auto';
      prompt.style.userSelect = 'none';
      prompt.style.touchAction = 'pan-y'; // allow swipe-down

      prompt.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:6px; align-items:center; justify-content:center;">
          <div style="font-weight:700; letter-spacing:0.2px;">
            ここをタップして新しい検索
          </div>
          <div style="font-size:12px; opacity:0.92;">
            Hãy chạm vào đây để tìm kiếm mới
          </div>
          <div style="width:46px; height:4px; border-radius:999px; background:rgba(255,255,255,0.35); margin-top:6px;"></div>
          <div style="font-size:11px; opacity:0.80;">
            下にスワイプして閉じる / Vuốt xuống để đóng
          </div>
        </div>
      `;

      document.body.appendChild(prompt);

      // Tap prompt -> focus search
      prompt.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const input = getPrimarySearchInput();
        if (input) {
          focusSearchInput(input);
        }
        hidePrompt(true);
      }, { passive: false });

      // Swipe-down to close
      let startY = 0;
      let tracking = false;

      prompt.addEventListener('touchstart', function (e) {
        if (!e.touches || !e.touches[0]) return;
        tracking = true;
        startY = e.touches[0].clientY;
      }, { passive: true });

      prompt.addEventListener('touchmove', function (e) {
        if (!tracking || !e.touches || !e.touches[0]) return;
        const dy = e.touches[0].clientY - startY;
        if (dy > CFG.promptSwipeDismissPx) {
          tracking = false;
          hidePrompt(true);
        }
      }, { passive: true });

      prompt.addEventListener('touchend', function () {
        tracking = false;
      }, { passive: true });
    }

    return { backdrop, prompt };
  }

  function showPrompt() {
    const { backdrop, prompt } = ensurePromptDom();

    // restart timer
    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }

    promptOpenAt = now();
    backdrop.style.display = 'block';
    prompt.style.display = 'block';

    // Auto dismiss
    dismissTimer = setTimeout(function () {
      hidePrompt(false);
    }, CFG.dismissAfterMs);
  }

  function hidePrompt(force) {
    const backdrop = document.getElementById(CFG.promptBackdropId);
    const prompt = document.getElementById(CFG.promptId);

    if (!backdrop || !prompt) return;

    const visibleMs = now() - promptOpenAt;
    if (!force && visibleMs < CFG.promptMinVisibleMs) {
      // keep it visible briefly
      if (dismissTimer) clearTimeout(dismissTimer);
      dismissTimer = setTimeout(function () {
        hidePrompt(true);
      }, CFG.promptMinVisibleMs - visibleMs);
      return;
    }

    if (dismissTimer) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }

    backdrop.style.display = 'none';
    prompt.style.display = 'none';
  }

  // -----------------------------
  // Pull-down detection
  // (independent from existing UIRenderer handler)
  // -----------------------------
  function setupPullDownPrompt() {
    const wrap = getPullContainer();
    if (!wrap) return;

    // Prevent double setup
    if (wrap.dataset.mcsPullPromptSetup === 'true') return;
    wrap.dataset.mcsPullPromptSetup = 'true';

    let startY = 0;
    let currentY = 0;
    let pulling = false;

    wrap.addEventListener('touchstart', function (e) {
      if (!isPhone()) return;
      if (!e.touches || !e.touches[0]) return;
      // Only when scrolled to top
      if (wrap.scrollTop !== 0) return;

      pulling = true;
      startY = e.touches[0].clientY;
      currentY = startY;
    }, { passive: true });

    wrap.addEventListener('touchmove', function (e) {
      if (!pulling) return;
      if (!e.touches || !e.touches[0]) return;
      currentY = e.touches[0].clientY;
    }, { passive: true });

    wrap.addEventListener('touchend', function () {
      if (!pulling) return;
      const dist = currentY - startY;

      // Reset state
      pulling = false;
      startY = 0;
      currentY = 0;

      // Trigger
      if (dist >= CFG.pullThresholdPx) {
        const input = getPrimarySearchInput();

        // reset search (both desktop/mobile)
        if (input) clearSearchInput(input);

        // show prompt to get a user tap
        showPrompt();
      }
    }, { passive: true });
  }

  // -----------------------------
  // Bottom nav Search button
  // -----------------------------
  function injectNavSearchButton() {
    const nav = document.getElementById(CFG.navBarId);
    if (!nav) return;

    // already exists
    if (document.getElementById(CFG.navSearchBtnId)) {
      nav.classList.add(CFG.navHasSearchClass);
      return;
    }

    const btn = document.createElement('button');
    btn.id = CFG.navSearchBtnId;
    btn.className = 'bottom-nav-item';
    btn.setAttribute('data-tab', 'search');
    btn.title = '検索 / Tìm kiếm';

    btn.innerHTML = `
      <i class="fas fa-search bottom-nav-icon"></i>
      <span class="bottom-nav-label"><br><small>Search</small></span>
    `;

    // Insert at far-left (before Teflon)
    nav.insertBefore(btn, nav.firstChild);

    // Mark nav for 6 columns via CSS
    nav.classList.add(CFG.navHasSearchClass);

    // Click -> focus search
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();

      const input = getPrimarySearchInput();
      if (input) {
        // show prompt briefly if focus fails is unknown; but focus is from click so should work
        focusSearchInput(input);
      } else {
        showPrompt();
      }
    }, { passive: false });
  }

  // -----------------------------
  // Boot
  // -----------------------------
  function boot() {
    if (!isPhone()) return;

    setupPullDownPrompt();
    injectNavSearchButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  // Expose minimal debug hooks (optional)
  window.MCSearchPrompt = {
    show: showPrompt,
    hide: hidePrompt,
    focusSearch: function () {
      const input = getPrimarySearchInput();
      return focusSearchInput(input);
    }
  };
})();

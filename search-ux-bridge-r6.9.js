/**
 * search-ux-bridge.js
 * 検索UXブリッジ（列1）
 * - クリア: 入力値を消去し、検索欄へ即フォーカス（ラグなし）
 * - フィルタ初期化: セレクトを初期値に戻し、filter:reset を通知
 * - リセット（全体）: タブ=All、キーワードとフィルタをクリアし再検索
 * - 高速化: inputイベント経由で既存のデバウンスを利用、pointerdown採用、rAF/queueMicrotaskでバッチング、必要時アニメ無効化
 *
 * 要件:
 * - window.SearchModule が読み込み済み（V7.7.7）
 * - window.FilterModule は任意（あればreset()を呼ぶ）
 * - 本スクリプトは search-module.js の直後に読み込む
 */
(function () {
  'use strict';

  // セレクタ（index-V7.7.x に合わせて多態対応）
  const SEL = {
    searchInput:    '#search-input, input[name="search"], .search-input',
    searchClearBtn: '#search-clear-btn, .search-clear-btn, [data-action="search-clear"]',
    mobileClearBtn: '#mobile-search-clear, .mobile-search-clear, [data-role="mobile-clear"]',

    // 種別タブ
    tabAll:    '#tab-all, .tab-all',
    tabMold:   '#tab-mold, .tab-mold',
    tabCutter: '#tab-cutter, .tab-cutter',

    // フィルタ
    filterField:  '#filter-field, select[name="filter-field"], .filter-field',
    filterValue:  '#filter-value, select[name="filter-value"], .filter-value',
    filterReset:  '#filter-reset-btn, .filter-reset-btn, [data-action="filter-reset"]',

    // 全リセット
    resetAll:     '#reset-all-btn, .reset-all-btn, [data-action="reset-all"]',
  };

  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // 速度最適化: 一時的に全アニメ/トランジションを停止するスタイルを注入
  (function ensureNoAnimCSS(){
    if (document.getElementById('no-anim-style')) return;
    const st = document.createElement('style');
    st.id = 'no-anim-style';
    st.textContent = `
      .no-anim, .no-anim * { transition: none !important; animation: none !important; }
    `;
    document.head.appendChild(st);
  })();

  function withNoAnim(fn){
    document.body.classList.add('no-anim');
    try { fn(); } finally { setTimeout(() => document.body.classList.remove('no-anim'), 120); }
  }

  // SearchModule（存在しなくてもフォールバック）
  const SM = window.SearchModule;

  // 入力欄にイベントinputをディスパッチして、既存のデバウンス経由で検索実行
  function requestSearchThroughInput(query) {
    const input = $(SEL.searchInput);
    if (input) {
      input.value = query || '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (SM) {
      // フォールバック: 1フレーム譲ってから実行
      queueMicrotask(() => {
        SM.setQuery(query || '');
        requestAnimationFrame(() => SM.performSearch());
      });
    }
  }

  // 軽量フォーカス（select()は避けIME発火と余計なイベントを抑制）
  function focusSearch() {
    const el = $(SEL.searchInput);
    if (el) queueMicrotask(() => el.focus());
  }

  // タブの種別を切替
  function setCategory(cat) {
    if (!SM) return;
    SM.setCategory(cat);
  }

  // フィルタ初期化と通知
  function resetFiltersToDefault() {
    const fieldEl = $(SEL.filterField);
    const valueEl = $(SEL.filterValue);
    if (fieldEl) fieldEl.selectedIndex = 0;
    if (valueEl) valueEl.selectedIndex = 0;

    document.dispatchEvent(new CustomEvent('filter:reset', { detail: { reason: 'user' } }));
    if (window.FilterModule && typeof window.FilterModule.reset === 'function') {
      window.FilterModule.reset();
    }
  }

  // 高速入力: pointerdown 優先 + 二重発火ロック
  function bindFast(el, handler) {
    if (!el) return;
    let locked = false;
    const run = (e) => {
      if (locked) return;
      locked = true;
      e.preventDefault();
      handler(e);
      setTimeout(() => (locked = false), 120);
    };
    el.addEventListener('pointerdown', run, { passive: false });
    el.addEventListener('click', run, { passive: false });
  }

  // クリア: input経由で検索、即フォーカス（performSearch直呼びはしない）
  function bindClear() {
    [...$$(SEL.searchClearBtn), ...$$(SEL.mobileClearBtn)].forEach(btn => {
      bindFast(btn, () => {
        requestSearchThroughInput('');
        focusSearch();
      });
    });
  }

  // タブ: 種別切替 → input経由で再検索
  function bindTabs() {
    const map = [
      { el: $(SEL.tabAll),    cat: 'all' },
      { el: $(SEL.tabMold),   cat: 'mold' },
      { el: $(SEL.tabCutter), cat: 'cutter' },
    ];
    map.forEach(({ el, cat }) => {
      if (!el) return;
      bindFast(el, () => {
        setCategory(cat);
        requestSearchThroughInput($(SEL.searchInput)?.value || '');
        focusSearch();
      });
    });
  }

  // フィルタ初期化 → 1フレーム後にinput経由で再検索
  function bindFilterReset() {
    const btn = $(SEL.filterReset);
    if (!btn) return;
    bindFast(btn, () => {
      resetFiltersToDefault();
      requestAnimationFrame(() => requestSearchThroughInput($(SEL.searchInput)?.value || ''));
      focusSearch();
    });
  }

  // 全リセット: タブAll + キーワード/フィルタ初期化 → input経由で再検索
  function bindResetAll() {
    const btn = $(SEL.resetAll);
    if (!btn) return;
    bindFast(btn, () => {
      withNoAnim(() => {
        setCategory('all');
        resetFiltersToDefault();
        requestAnimationFrame(() => requestSearchThroughInput(''));
        focusSearch();
      });
    });
  }

  function init() {
    bindClear();
    bindTabs();
    bindFilterReset();
    bindResetAll();
    // 起動時に自動フォーカスさせたい場合は下行を有効化
    // focusSearch();
    console.log('[search-ux-bridge] ready (fast handlers active)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

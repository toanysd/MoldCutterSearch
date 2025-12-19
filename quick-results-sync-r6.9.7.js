/**
 * quick-results-sync.js (V7.7.7 – FILTER-SYNC, backward-compatible)
 * ✅ Lắng nghe search:updated (bao gồm origin='filter') để đồng bộ lưới nhanh
 * ✅ Lưu state.currentResults, gán data-index ổn định cho mỗi card
 * ✅ Click card: lấy item theo state.currentResults (đã lọc), không dùng tập cũ
 * ✅ Phát quick:select + detail:open như cũ (tương thích ngược 100%)
 * ✅ Nghe detail:changed để đồng bộ highlight giữa nửa trên – nửa dưới
 * ✅ Phát quick:refresh sau khi render để các module khác theo dõi
 */
(function () {
  'use strict';

  const SELECTORS = {
    quickListCandidates: [
      '#quick-results-list',
      '.quick-results-grid',
      '#quick-results',
      '[data-role="quick-results"]'
    ]
  };

  const state = {
    currentResults: []
  };

  init();

  function init() {
    bindQuickResultsClick();
    bindSearchUpdated();
    bindDetailChanged();

    // Đảm bảo data-index được gán ngay khi DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', ensureIndexMapping, { once: true });
    } else {
      ensureIndexMapping();
    }

    console.log('[QuickResultsSync] V7.7.7 FILTER-SYNC Ready');
  }

  function getQuickEl() {
    for (const sel of SELECTORS.quickListCandidates) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function bindQuickResultsClick() {
    const quick = getQuickEl();
    if (!quick) return;
    
    quick.addEventListener('click', (ev) => {
      // ✅ R7.0.7: Handle card selection icon (inv-bulk-checkbox)
      const target = ev.target;
      if (target && target.classList && target.classList.contains('inv-bulk-checkbox')) {
          ev.preventDefault();
          ev.stopPropagation();
          ev.stopImmediatePropagation();

          // Lấy card bao ngoài
          const card = target.closest('.result-card');
          if (!card) {
              console.warn('[QuickResultsSync] ⚠️ Card not found for bulk checkbox');
              return false;
          }

          // Lấy id/type từ data-* trên card (chuẩn mới của ui-renderer)
          const itemId = card.dataset.id;
          const itemType = (card.dataset.type || '').toLowerCase();
          if (!itemId || !itemType) {
              console.warn('[QuickResultsSync] ⚠️ Missing id/type on card for selection');
              return false;
          }

          // Lấy item data từ state.currentResults
          const idxAttr = card.getAttribute('data-index');
          let itemData = null;
          if (idxAttr != null) {
              const idx = Number(idxAttr);
              if (!Number.isNaN(idx) && state.currentResults[idx]) {
                  itemData = state.currentResults[idx];
              }
          }
          if (!itemData && state.currentResults.length) {
              // Fallback: tìm theo id
              const keys = itemType === 'mold' ? ['MoldID', 'MoldCode'] : ['CutterID', 'CutterNo'];
              itemData = state.currentResults.find(r =>
                  keys.some(k => String(r?.[k] || '') === String(itemId))
              );
          }
          if (!itemData) {
              console.warn('[QuickResultsSync] ⚠️ Item data not found for selection');
              return false;
          }

          // Toggle selection bằng SelectionManager (ưu tiên)
          if (window.SelectionManager) {
              window.SelectionManager.toggleItem(itemId, itemType, itemData);
          } else {
              window.InventoryManager?.toggleItemSelection(itemId, itemType, itemData);
          }

          // Highlight sẽ do SelectionManager.updateDomHighlights() đảm nhiệm
          // (đã chạy bên trong add/remove/toggleItem)
          console.log('[QuickResultsSync] ✅ Card selection icon toggled:', itemType, itemId);
          return false;
      }

        
        // Existing card click handler
        const card = ev.target.closest('.result-card');
        if (!card || !quick.contains(card)) return;

        // Lấy id/type từ thuộc tính card (đã được ui-renderer.js gán đầy đủ)
        const id = card.dataset.id;
        const type = (card.dataset.type || '').toLowerCase();

        if (!id || !type) {
            console.warn('[QuickResultsSync] Card missing id/type:', card);
            return;
        }

        // ✅ Lấy item theo tập đã lọc (state.currentResults)
        const idxAttr = card.getAttribute('data-index');
        let item = null;

        if (idxAttr != null) {
            const idx = Number(idxAttr);
            if (!Number.isNaN(idx) && state.currentResults[idx]) {
                item = state.currentResults[idx];
            }
        }

        // Fallback: tìm theo id nếu data-index bị thiếu
        if (!item && state.currentResults.length) {
            const keys = type === 'mold' ? ['MoldID', 'MoldCode'] : ['CutterID', 'CutterNo'];
            item = state.currentResults.find(r =>
                keys.some(k => String(r?.[k] || '') === String(id))
            );
        }

        // ✅ Nếu đang ở chế độ chọn (selection mode) → chỉ toggle chọn, KHÔNG mở chi tiết
        if (window.SelectionState?.active && window.SelectionManager) {
            ev.preventDefault();
            ev.stopPropagation();

            window.SelectionManager.toggleItem(id, type, item || null);
            return;
        }

        // ====== Hành vi cũ (selection mode OFF) ======
        console.log('[QuickResultsSync] 📌 Card clicked:', type, id, 'item:', item);

        // ✅ Phát các sự kiện như cũ để tương thích ngược
        document.dispatchEvent(new CustomEvent('quick:select', {
            detail: { id, type, source: 'quick-results' }
        }));
        document.dispatchEvent(new CustomEvent('detail:open', {
            // Truyền thêm item (nếu có) cho các module mới; module cũ có thể bỏ qua
            detail: { id, type, preview: true, source: 'quick-results', item }
        }));
    });
  }

  function bindSearchUpdated() {
    // ✅ Lắng nghe search:updated (bao gồm từ SearchModule và FilterModule)
    document.addEventListener('search:updated', (e) => {
      const results = Array.isArray(e?.detail?.results)
        ? e.detail.results
        : (window.SearchModule?.getResults?.() || []);

      state.currentResults = results;

      // ✅ Nếu có UIRenderer hỗ trợ vẽ quick cards, tận dụng để đồng nhất giao diện
      // (UIRenderer.renderQuickCards đã được gọi trong UIRenderer.init, nhưng gọi lại để chắc chắn)
      if (window.UIRenderer && typeof window.UIRenderer.renderQuickCards === 'function') {
        window.UIRenderer.renderQuickCards(results);
      }

      // ✅ Đảm bảo mỗi card có data-index để click map đúng item đã lọc
      ensureIndexMapping();

      // ✅ Reset highlight cũ sau khi danh sách thay đổi
      clearQuickHighlight();

      // ✅ Thông báo làm tươi cho các module khác (nếu cần)
      document.dispatchEvent(new CustomEvent('quick:refresh', { 
        detail: { count: results.length } 
      }));

      console.log('[QuickResultsSync] 🔄 search:updated received, rendered', results.length, 'items');
    }, { passive: true });
  }

  function bindDetailChanged() {
    // ✅ Khi chi tiết thay đổi (do click ở bảng lớn hoặc điều hướng), đồng bộ highlight ở lưới nhanh
    document.addEventListener('detail:changed', (e) => {
      const item = e?.detail?.item;
      if (!item) return;

      const isMold = (item.itemType || '').toLowerCase() === 'mold';
      const id = isMold 
        ? String(item.MoldID ?? item.MoldCode ?? '') 
        : String(item.CutterID ?? item.CutterNo ?? '');
      const type = isMold ? 'mold' : 'cutter';

      if (!id) return;

      // ✅ Đồng bộ highlight card tương ứng
      document.dispatchEvent(new CustomEvent('quick:select', {
        detail: { id, type, source: 'detail-panel' }
      }));

      console.log('[QuickResultsSync] 📡 detail:changed received, sync highlight for:', type, id);
    }, { passive: true });
  }

  function ensureIndexMapping() {
    const quick = getQuickEl();
    if (!quick) return;

    const cards = quick.querySelectorAll('.result-card');
    cards.forEach((card, i) => {
      // ✅ Chỉ gán nếu thiếu, tránh đè logic khác
      if (!card.hasAttribute('data-index')) {
        card.setAttribute('data-index', String(i));
      }
    });
  }

  function clearQuickHighlight() {
    const quick = getQuickEl();
    if (!quick) return;

    // ✅ Xóa tất cả class highlight cũ
    quick.querySelectorAll('.qr-selected, .active, .inactive, .selected')
      .forEach(n => n.classList.remove('qr-selected', 'active', 'inactive', 'selected'));
  }
})();

/**
 * search-history-bridge.js - V7.7.7
 * 検索履歴ブリッジ / Cầu nối lịch sử tìm kiếm
 *
 * Mục tiêu:
 * - Ghi lại mọi lần chọn item (từ cột 2 hoặc cột 4) vào lịch sử thống nhất.
 * - Đồng bộ highlight ở cột 2 theo item vừa chọn.
 * - Cho phép chọn lại từ lịch sử và khôi phục chi tiết + highlight.
 *
 * Phụ thuộc mềm (optional):
 * - window.SearchHistory (nếu có: .add(entry), .get(), .onSelect(cb))
 * - window.AppController.selectResult(id, type) nếu có, để render tiêu chuẩn.
 * - window.UIRenderer để cập nhật chi tiết khi thiếu AppController.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'mcs.history.v1';
  const MAX_ITEMS = 50;

  // Tiện ích lưu lịch sử fallback vào localStorage khi không có SearchHistory module
  const FallbackHistory = {
    add(entry) {
      const arr = this.get();
      // remove trùng id+type
      const filtered = arr.filter(x => !(x.id === entry.id && x.type === entry.type));
      filtered.unshift(entry);
      while (filtered.length > MAX_ITEMS) filtered.pop();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    },
    get() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
      catch { return []; }
    },
    onSelect(cb) {
      // Tạo menu tạm thời nếu cần sau này; hiện không render UI.
      window.addEventListener('mcs:history-select', e => cb(e.detail));
    },
    emitSelect(entry) {
      window.dispatchEvent(new CustomEvent('mcs:history-select', { detail: entry }));
    }
  };

  const API = {
    add(entry) {
      if (window.SearchHistory && typeof window.SearchHistory.add === 'function') {
        window.SearchHistory.add(entry);
      } else {
        FallbackHistory.add(entry);
      }
    },
    onSelect(cb) {
      if (window.SearchHistory && typeof window.SearchHistory.onSelect === 'function') {
        window.SearchHistory.onSelect(cb);
      } else {
        FallbackHistory.onSelect(cb);
      }
    }
  };

  // Lấy từ khóa đang hiển thị trong ô tìm kiếm (nếu có)
  function getCurrentKeyword() {
    const el = document.querySelector('input[type="search"], #search-input, .search-input, [data-role="search-input"]');
    return el ? String(el.value || '').trim() : '';
  }

  // Chuẩn hóa entry lịch sử
  function buildEntry({ id, type, code, name }) {
    return {
      id: String(id || ''),
      type: String(type || '').toLowerCase(), // 'mold' | 'cutter'
      code: String(code || ''),
      name: String(name || ''),
      keyword: getCurrentKeyword(),
      ts: Date.now()
    };
  }

  // Ghi lịch sử từ sự kiện chọn
  function recordSelection(payload) {
    if (!payload) return;
    const { id, type, item } = payload;
    const entry = buildEntry({
      id: id || (item?.MoldID ?? item?.CutterID ?? ''),
      type: type || (item?.MoldID != null ? 'mold' : 'cutter'),
      code: (item?.MoldCode ?? item?.CutterNo ?? item?.CutterCode ?? ''),
      name: (item?.MoldCode ?? item?.CutterName ?? item?.Name ?? '')
    });
    if (!entry.id || !entry.type) return;
    API.add(entry);
    highlightColumn2(entry.id, entry.type, entry.code);
  }

  // Highlight cột 2 theo id/type; nếu không có thẻ khớp → tất cả inactive
  function highlightColumn2(selectedId, selectedType, selectedCode) {
    const grid = document.querySelector('#quick-results-grid, #quick-results, .quick-results-grid');
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll('.result-card, .quick-result-card'));
    if (!cards.length) return;

    let matched = false;
    const idStr = String(selectedId);
    const codeStr = String(selectedCode || '');

    for (const card of cards) {
      const cid   = String(card.dataset.id   || card.getAttribute('data-id')   || '').trim();
      const ctype = String(card.dataset.type || card.getAttribute('data-type') || '').trim().toLowerCase();
      const ccode = String(card.dataset.code || card.getAttribute('data-code') || '').trim();
      const text  = (card.textContent || '').toUpperCase();

      const typeOk = !ctype || ctype === String(selectedType);
      const idOk   = cid && (cid === idStr || cid === codeStr);
      const codeOk = ccode && (ccode === idStr || ccode === codeStr);
      const textOk = codeStr && text.includes(codeStr.toUpperCase());

      const isMatch = typeOk && (idOk || codeOk || textOk);

      if (isMatch) {
        card.classList.add('active');
        card.classList.remove('inactive');
        matched = true;
      } else {
        card.classList.remove('active');
      }
    }
    for (const card of cards) {
      if (!matched || !card.classList.contains('active')) card.classList.add('inactive');
    }
  }

  // Khôi phục khi chọn lại từ lịch sử
  API.onSelect(entry => {
    if (!entry) return;
    const id = entry.id;
    const type = entry.type;

    // Ưu tiên AppController để render thống nhất
    if (window.AppController && typeof window.AppController.selectResult === 'function') {
      window.AppController.selectResult(id, type);
    } else {
      // Fallback: tìm item và render detail
      const data = window.DataManager?.data || window.moldAllData || {};
      let item = null;
      if (type === 'mold') {
        item = (data.molds || []).find(m => String(m.MoldID ?? m.mold_id) === String(id) || String(m.MoldCode ?? m.Code) === String(id));
      } else {
        item = (data.cutters || []).find(c => String(c.CutterID ?? c.cutter_id) === String(id) || String(c.CutterNo ?? c.CutterCode) === String(id));
      }
      if (item && window.UIRenderer) {
        if (typeof window.UIRenderer.renderDetailInfo === 'function') window.UIRenderer.renderDetailInfo(item, type);
        else if (typeof window.UIRenderer.renderDetail === 'function') window.UIRenderer.renderDetail(item, type);
        if (window.UIRenderer.state) window.UIRenderer.state.currentDetailItem = item;
      }
    }
    // Luôn đồng bộ highlight sau khi chọn lại
    highlightColumn2(entry.id, entry.type, entry.code);
  });

  // Lắng nghe sự kiện chọn từ các nơi
  document.addEventListener('app:select-result', e => recordSelection(e.detail));
  document.addEventListener('detail:changed',     e => recordSelection(e.detail));

  // Đồng bộ khi danh sách tìm kiếm thay đổi (khôi phục highlight theo item đang xem)
  document.addEventListener('search:updated', () => {
    const item = window.UIRenderer?.state?.currentDetailItem;
    if (!item) return;
    const type = item.MoldID != null ? 'mold' : 'cutter';
    const id   = String(type === 'mold' ? (item.MoldID ?? item.MoldCode) : (item.CutterID ?? item.CutterNo));
    const code = String(type === 'mold' ? (item.MoldCode ?? '') : (item.CutterNo ?? item.CutterCode ?? ''));
    highlightColumn2(id, type, code);
  });

  // Xuất API đơn giản để module khác có thể đẩy vào lịch sử trực tiếp
  window.SearchHistoryBridge = {
    add: (e) => API.add(buildEntry(e)),
    get: () => (window.SearchHistory?.get?.() || FallbackHistory.get()),
    select: (e) => FallbackHistory.emitSelect(buildEntry(e))
  };
})();

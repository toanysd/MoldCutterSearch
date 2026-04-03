/* ============================================================================

FILTER UI v8.1.0-7 - Drawer + Sidebar + Mobile Modal (UI Layer)

- Kế thừa UI Mercari-like từ filter-module-v8.1.0-6-4
- Tách logic sang FilterCore (filter-core-v8.1.0-7.js)
- Tương thích với index-v8.1.0-9.html:
  + Nút 絞込: #filterNavBtn (mobile navbar)
  + Badge: #filterNavBadge
  + Nút chi tiết trong ô search: #filterDetailBtn
  + Sidebar: #sidebar, Filter section: #filterSection
  + Legacy controls: #filterCategorySelect, #filterField, #filterValue, #sortField, #sortDirection,
    #filterValueSearch, #filterClearBtn
  + Mobile modal ids: #filterFullscreenModal, #modalCategorySelect, #modalFilterField, #modalFilterValue,
    #modalSortField, #modalSortDirection

Created: 2026-01-31
Version:  v8.1.0-7

============================================================================ */

(function () {
  'use strict';

  if (!window.FilterCore) {
    console.error('FilterUI v8.1.0-7: FilterCore not found. Load filter-core-v8.1.0-7.js first.');
    return;
  }

  // -------------------------------------------------------------------------
  // CONFIG
  // -------------------------------------------------------------------------
  var STORAGE_KEY = (window.FilterCoreDefaults && window.FilterCoreDefaults.STORAGE_KEY) || 'moldcutter_filter_v8_1';
  var DEFAULT_SORT = (window.FilterCoreDefaults && window.FilterCoreDefaults.DEFAULT_SORT) || { field: 'productionDate', direction: 'desc' };
  var EMPTY_LABEL = (window.FilterCoreDefaults && window.FilterCoreDefaults.EMPTY_LABEL) || 'N/A';
  var FILTER_FIELDS = (window.FilterCoreDefaults && window.FilterCoreDefaults.FILTER_FIELDS) || [];

  var SELECTORS = {
    desktopFilterSection: '#filterSection',
    desktopFilterHeader: '.filter-section-header',
    desktopCategorySelect: '#filterCategorySelect',
    desktopFilterField: '#filterField',
    desktopFilterValue: '#filterValue',
    desktopSortField: '#sortField',
    desktopSortDirection: '#sortDirection',
    desktopBtnClear: '#filterClearBtn',
    desktopFilterValueSearch: '#filterValueSearch',

    detailBtn: '#filterDetailBtn',

    mobileNavFilterBtn: '#filterNavBtn',
    mobileNavMenuBtn: '#menuNavBtn',
    mobileNavBadge: '#filterNavBadge',

    modal: '#filterFullscreenModal',
    modalCategorySelect: '#modalCategorySelect',
    modalFilterField: '#modalFilterField',
    modalFilterValue: '#modalFilterValue',
    modalSortField: '#modalSortField',
    modalSortDirection: '#modalSortDirection',

    sidebar: '#sidebar'
  };

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------
  function normalizeText(val) {
    if (val === null || val === undefined) return '';
    var s = '';
    try { s = String(val); } catch (e) { return ''; }
    return s.replace(/\s+/g, ' ').trim();
  }

  function displayText(val) {
    var t = normalizeText(val);
    return t ? t : EMPTY_LABEL;
  }

  function naturalCompare(a, b) {
    var ax = [], bx = [];
    String(a).replace(/(\d+)|(\D+)/g, function (_, $1, $2) {
      ax.push([$1 ? parseInt($1, 10) : Infinity, $2 || '']);
    });
    String(b).replace(/(\d+)|(\D+)/g, function (_, $1, $2) {
      bx.push([$1 ? parseInt($1, 10) : Infinity, $2 || '']);
    });

    while (ax.length && bx.length) {
      var an = ax.shift();
      var bn = bx.shift();
      var diff = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);
      if (diff) return diff;
    }
    return ax.length - bx.length;
  }

  function compareDimensions(a, b) {
    // Nhẹ: ưu tiên naturalCompare trước, đủ dùng cho list options
    return naturalCompare(a, b);
  }

  function uniqSortedKeys(obj, comparator) {
    var keys = Object.keys(obj || {});
    keys.sort(comparator || function (a, b) { return naturalCompare(a, b); });
    return keys;
  }

  function safeParseFloat(val) {
    var s = normalizeText(val);
    if (!s) return null;
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  function getAllItems() {
    if (!window.DataManager) return [];
    try {
      if (typeof window.DataManager.getAllItems === 'function') {
        var list = window.DataManager.getAllItems();
        return Array.isArray(list) ? list : [];
      }
      var molds = (window.DataManager.data && window.DataManager.data.molds) ? window.DataManager.data.molds : [];
      var cutters = (window.DataManager.data && window.DataManager.data.cutters) ? window.DataManager.data.cutters : [];
      return ([]).concat(molds, cutters);
    } catch (e) {
      return [];
    }
  }

  function getItemProductionDate(it) {
    return (it && (it.ProductionDate || it.displayDate || it.productionDate)) || '';
  }

  function getItemCustomer(it) {
    return (it && it.customerInfo && (it.customerInfo.CustomerShortName || it.customerInfo.CustomerName))
      || (it && it.displayCustomer)
      || '';
  }

  function getItemStorageCompany(it) {
    return (it && it.storageCompanyInfo && (it.storageCompanyInfo.CompanyShortName || it.storageCompanyInfo.CompanyName))
      || (it && it.displayStorageCompany)
      || (it && it.storageCompany)
      || '';
  }

  function getItemRackLayerDisplay(it) {
    if (!it) return '';
    var id = it.RackLayerID || (it.rackLayerInfo && it.rackLayerInfo.RackLayerID) || it.location || it.rackNo || '';
    var loc = (it.rackInfo && it.rackInfo.RackLocation) || it.displayRackLocation || it.rackLocation || '';
    id = normalizeText(id);
    loc = normalizeText(loc);
    if (!id && !loc) return '';
    if (id && loc) return id + ' - ' + loc;
    return id || loc;
  }

  function getItemDimensions(it) {
    if (!it) return '';
    return it.displayDimensions || it.dimensions || it.displaySize || it.Size || it.Dimensions || '';
  }

  function getItemSetupType(it) {
    var d = (it && it.designInfo) ? it.designInfo : {};
    return d.MoldSetupType || it.MoldSetupType || it.setupType || '';
  }

  function getItemOrientation(it) {
    var d = (it && it.designInfo) ? it.designInfo : {};
    return d.MoldOrientation || it.MoldOrientation || it.orientation || '';
  }

  function getItemUnderAngle(it) {
    var d = (it && it.designInfo) ? it.designInfo : {};
    return d.UnderAngle || it.UnderAngle || it.underAngle || '';
  }

  function getItemCutlineSize(it) {
    var d = (it && it.designInfo) ? it.designInfo : {};
    var x = safeParseFloat(d.CutlineX || it.CutlineX);
    var y = safeParseFloat(d.CutlineY || it.CutlineY);
    if (x === null || y === null) {
      return d.CutlineSize || it.CutlineSize || '';
    }
    var sx = (Math.floor(x) === x) ? String(Math.floor(x)) : String(x);
    var sy = (Math.floor(y) === y) ? String(Math.floor(y)) : String(y);
    return sx + 'x' + sy;
  }

  function getItemStatus(it) {
    return (it && it.latestStatusLog && it.latestStatusLog.Status) || (it && it.lastStatus) || '';
  }

  function getItemTeflon(it) {
    return (it && (it.teflonStatus
      || (it.latestTeflonLog && (it.latestTeflonLog.TeflonStatus || it.latestTeflonLog.Status))
      || it.TeflonCoating)) || '';
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // -------------------------------------------------------------------------
  // DOM refs
  // -------------------------------------------------------------------------
  var refs = {
    desktopFilterSection: null,
    desktopFilterHeader: null,
    desktopCategorySelect: null,
    desktopFilterField: null,
    desktopFilterValue: null,
    desktopSortField: null,
    desktopSortDirection: null,
    desktopBtnClear: null,
    desktopFilterValueSearch: null,

    detailBtn: null,

    mobileNavFilterBtn: null,
    mobileNavMenuBtn: null,
    mobileNavBadge: null,

    modal: null,
    modalCategorySelect: null,
    modalFilterField: null,
    modalFilterValue: null,
    modalSortField: null,
    modalSortDirection: null,

    sidebar: null
  };

  // Drawer refs (bind late)
  var drawerRefs = {
    root: null,
    backdrop: null,
    closeBtn: null,
    clearBtn: null,
    applyBtn: null,
    footerCloseBtn: null
  };

  // -------------------------------------------------------------------------
  // Module
  // -------------------------------------------------------------------------
  var FilterModule = {
    core: null,
    _applyTimer: null,

    scheduleApply: function () {
      var self = this;
      if (self._applyTimer) clearTimeout(self._applyTimer);
      self._applyTimer = setTimeout(function () {
        self.applyFilter();
        self.updateDrawerIndicators();
        self.updateModalIndicators();
      }, 150);
    },

    _suppressEvents: false,

    init: function () {
      console.log('🔧 FilterModule v8.1.0-7 (UI+Core): Initializing...');

      this.core = new window.FilterCore({ storageKey: STORAGE_KEY });

      this.createDrawer();
      this.createMobileModal();
      this.bindElements();
      this.setupEventListeners();

      // Restore UI from saved state
      this.updateUI();
      this.updateBadge();
      this.updateDetailButton();

      this.refreshWhenDataReady();

      console.log('✅ FilterModule v8.1.0-7: Ready!');
    },

    // ---------------------------------------------------------------------
    // Drawer UI (Mercari style)
    // ---------------------------------------------------------------------
    createDrawer: function () {
      if (document.getElementById('filterDrawer')) return;

      try {
        var wrapper = document.createElement('div');
        wrapper.innerHTML = [
          '<div id="filterDrawer" class="filter-drawer hidden">',
          '  <div class="filter-drawer-backdrop"></div>',
          '  <div class="filter-drawer-panel">',
          '    <div class="filter-drawer-header">',
          '      <button type="button" class="filter-drawer-close" aria-label="Close">',
          '        <i class="fas fa-times"></i>',
          '      </button>',
          '      <div class="filter-drawer-title">',
          '        <span class="ja">絞り込み</span>',
          '        <span class="vi">Bộ lọc</span>',
          '      </div>',
          '      <button type="button" class="filter-drawer-clear">',
          '        <span class="ja">クリア＆折りたたむ</span>',
          '        <span class="vi">Xóa hết</span>',
          '      </button>',
          '    </div>',
          '    <div class="filter-drawer-body">',

          '      <section class="filter-accordion" data-filter="itemType">',
          '        <button type="button" class="filter-accordion-header">',
          '          <div class="filter-accordion-label"><span class="ja">種別</span><span class="vi">Loại</span></div>',
          '          <div class="filter-accordion-summary" data-summary></div>',
          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',
          '        </button>',
          '        <div class="filter-accordion-content">',
          '          <select id="fditemType" class="filter-drawer-select">',
          '            <option value="">指定なし</option>',
          '            <option value="all">全て / Tất cả</option>',
          '            <option value="mold">金型 / Khuôn</option>',
          '            <option value="cutter">抜型 / Dao cắt</option>',
          '          </select>',
          '        </div>',
          '      </section>',

          '      <section class="filter-accordion" data-filter="customer">',
          '        <button type="button" class="filter-accordion-header">',
          '          <div class="filter-accordion-label"><span class="ja">顧客名</span><span class="vi">Khách hàng</span></div>',
          '          <div class="filter-accordion-summary" data-summary></div>',
          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',
          '        </button>',
          '        <div class="filter-accordion-content">',
          '          <input id="fdcustomerinput" type="text" class="filter-drawer-input" placeholder="検索 / Gõ lọc">',
          '          <select id="fdcustomer" class="filter-drawer-select"></select>',
          '        </div>',
          '      </section>',

          '      <section class="filter-accordion" data-filter="storageCompany">',
          '        <button type="button" class="filter-accordion-header">',
          '          <div class="filter-accordion-label"><span class="ja">保管会社</span><span class="vi">Công ty lưu trữ</span></div>',
          '          <div class="filter-accordion-summary" data-summary></div>',
          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',
          '        </button>',
          '        <div class="filter-accordion-content">',
          '          <input id="fdstorageCompanyinput" type="text" class="filter-drawer-input" placeholder="検索 / Gõ lọc">',
          '          <select id="fdstorageCompany" class="filter-drawer-select"></select>',
          '        </div>',
          '      </section>',

          '      <section class="filter-accordion" data-filter="rackLayer">',
          '        <button type="button" class="filter-accordion-header">',
          '          <div class="filter-accordion-label"><span class="ja">棚位置</span><span class="vi">Giá / Tầng</span></div>',
          '          <div class="filter-accordion-summary" data-summary></div>',
          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',
          '        </button>',
          '        <div class="filter-accordion-content">',
          '          <input id="fdrackLayerinput" type="text" class="filter-drawer-input" placeholder="R01-03 ...">',
          '          <select id="fdrackLayer" class="filter-drawer-select"></select>',
          '        </div>',
          '      </section>',

          '      <section class="filter-accordion" data-filter="dimension">',
          '        <button type="button" class="filter-accordion-header">',
          '          <div class="filter-accordion-label"><span class="ja">寸法</span><span class="vi">Kích thước</span></div>',
          '          <div class="filter-accordion-summary" data-summary></div>',
          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',
          '        </button>',
          '        <div class="filter-accordion-content">',
          '          <label class="filter-group-caption"><span class="ja">クイック選択</span><span class="vi">Chọn nhanh</span></label>',
          '          <input id="fddimquickinput" type="text" class="filter-drawer-input" placeholder="469x299 ...">',
          '          <select id="fddimquick" class="filter-drawer-select"></select>',
          '          <div class="filter-dim-range">',
          '            <label class="filter-group-caption"><span class="ja">L</span><span class="vi">Dài (L)</span></label>',
          '            <div class="filter-range-row">',
          '              <input id="fddimLmin" type="number" class="filter-drawer-input" placeholder="Min">',
          '              <span class="range-separator">~</span>',
          '              <input id="fddimLmax" type="number" class="filter-drawer-input" placeholder="Max">',
          '            </div>',
          '            <label class="filter-group-caption"><span class="ja">W</span><span class="vi">Rộng (W)</span></label>',
          '            <div class="filter-range-row">',
          '              <input id="fddimWmin" type="number" class="filter-drawer-input" placeholder="Min">',
          '              <span class="range-separator">~</span>',
          '              <input id="fddimWmax" type="number" class="filter-drawer-input" placeholder="Max">',
          '            </div>',
          '          </div>',
          '        </div>',
          '      </section>',

          '      <section class="filter-accordion" data-filter="productionDate">',
          '        <button type="button" class="filter-accordion-header">',
          '          <div class="filter-accordion-label"><span class="ja">製造日</span><span class="vi">Ngày sản xuất</span></div>',
          '          <div class="filter-accordion-summary" data-summary></div>',
          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',
          '        </button>',
          '        <div class="filter-accordion-content">',
          '          <div class="filter-date-row"><label><span class="ja">から</span><span class="vi">Từ ngày</span></label><input id="fddatefrom" type="date" class="filter-drawer-input"></div>',
          '          <div class="filter-date-row"><label><span class="ja">まで</span><span class="vi">Đến ngày</span></label><input id="fddateto" type="date" class="filter-drawer-input"></div>',
          '        </div>',
          '      </section>',

          '      <section class="filter-accordion" data-filter="plastic">',
          '        <button type="button" class="filter-accordion-header">',
          '          <div class="filter-accordion-label"><span class="ja">樹脂</span><span class="vi">Loại nhựa</span></div>',
          '          <div class="filter-accordion-summary" data-summary></div>',
          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',
          '        </button>',
          '        <div class="filter-accordion-content">',
          '          <input id="fdplastic" type="text" class="filter-drawer-input" placeholder="PP, ABS ...">',
          '        </div>',
          '      </section>',

          '      <section class="filter-accordion" data-filter="textContent">',
          '        <button type="button" class="filter-accordion-header">',
          '          <div class="filter-accordion-label"><span class="ja">彫刻</span><span class="vi">Chữ khắc</span></div>',
          '          <div class="filter-accordion-summary" data-summary></div>',
          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',
          '        </button>',
          '        <div class="filter-accordion-content">',
          '          <input id="fdtextContent" type="text" class="filter-drawer-input" placeholder="刻印内容...">',
          '        </div>',
          '      </section>',

          '      <section class="filter-accordion" data-filter="trayInfo">',
          '        <button type="button" class="filter-accordion-header">',
          '          <div class="filter-accordion-label"><span class="ja">トレイ情報</span><span class="vi">Tray info</span></div>',
          '          <div class="filter-accordion-summary" data-summary></div>',
          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',
          '        </button>',
          '        <div class="filter-accordion-content">',
          '          <input id="fdtrayInfo" type="text" class="filter-drawer-input" placeholder="Tray info...">',
          '        </div>',
          '      </section>',

          '      <section class="filter-accordion" data-filter="setupType">',
          '        <button type="button" class="filter-accordion-header">',
          '          <div class="filter-accordion-label"><span class="ja">MoldSetupType</span><span class="vi">SetupType</span></div>',
          '          <div class="filter-accordion-summary" data-summary></div>',
          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',
          '        </button>',
          '        <div class="filter-accordion-content">',
          '          <div id="fdsetupTypelist" class="filter-checkbox-list"></div>',
          '        </div>',
          '      </section>',

          '      <section class="filter-accordion" data-filter="orientation">',
          '        <button type="button" class="filter-accordion-header">',
          '          <div class="filter-accordion-label"><span class="ja">MoldOrientation</span><span class="vi">Orientation</span></div>',
          '          <div class="filter-accordion-summary" data-summary></div>',
          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',
          '        </button>',
          '        <div class="filter-accordion-content">',
          '          <div id="fdorientationlist" class="filter-checkbox-list"></div>',
          '        </div>',
          '      </section>',

          '      <section class="filter-accordion" data-filter="draftAngle">',
          '        <button type="button" class="filter-accordion-header">',
          '          <div class="filter-accordion-label"><span class="ja">DraftAngle</span><span class="vi">Góc nghiêng</span></div>',
          '          <div class="filter-accordion-summary" data-summary></div>',
          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',
          '        </button>',
          '        <div class="filter-accordion-content">',
          '          <div class="filter-range-row">',
          '            <input id="fddraftmin" type="number" class="filter-drawer-input" placeholder="Min">',
          '            <span class="range-separator">~</span>',
          '            <input id="fddraftmax" type="number" class="filter-drawer-input" placeholder="Max">',
          '          </div>',
          '        </div>',
          '      </section>',

          '      <section class="filter-accordion" data-filter="underAngle">',
          '        <button type="button" class="filter-accordion-header">',
          '          <div class="filter-accordion-label"><span class="ja">UnderAngle</span><span class="vi">Undercut</span></div>',
          '          <div class="filter-accordion-summary" data-summary></div>',
          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',
          '        </button>',
          '        <div class="filter-accordion-content">',
          '          <input id="fdunderAngleinput" type="text" class="filter-drawer-input" placeholder="検索 / Gõ lọc">',
          '          <select id="fdunderAngle" class="filter-drawer-select"></select>',
          '        </div>',
          '      </section>',

          '      <section class="filter-accordion" data-filter="cutlineSize">',
          '        <button type="button" class="filter-accordion-header">',
          '          <div class="filter-accordion-label"><span class="ja">刃型寸法</span><span class="vi">Cutline</span></div>',
          '          <div class="filter-accordion-summary" data-summary></div>',
          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',
          '        </button>',
          '        <div class="filter-accordion-content">',
          '          <input id="fdcutlineinput" type="text" class="filter-drawer-input" placeholder="200x300 ...">',
          '          <select id="fdcutline" class="filter-drawer-select"></select>',
          '        </div>',
          '      </section>',

          '      <section class="filter-accordion" data-filter="statusFlags">',
          '        <button type="button" class="filter-accordion-header">',
          '          <div class="filter-accordion-label"><span class="ja">状態</span><span class="vi">Trạng thái</span></div>',
          '          <div class="filter-accordion-summary" data-summary></div>',
          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',
          '        </button>',
          '        <div class="filter-accordion-content">',
          '          <div class="filter-group-caption"><span class="ja">棚卸</span><span class="vi">Kiểm kê</span></div>',
          '          <div id="fdinventoryStatuslist" class="filter-checkbox-list"></div>',
          '          <div class="filter-group-caption"><span class="ja">Teflon</span><span class="vi">Teflon</span></div>',
          '          <div id="fdteflonlist" class="filter-checkbox-list"></div>',
          '          <div class="filter-group-caption"><span class="ja">返却/廃棄</span><span class="vi">Returning/Disposing</span></div>',
          '          <div id="fdreturningdisposinglist" class="filter-checkbox-list">',
          '            <label><input type="checkbox" id="fdreturning"> Returning</label>',
          '            <label><input type="checkbox" id="fddisposing"> Disposing</label>',
          '          </div>',
          '        </div>',
          '      </section>',

          '      <section class="filter-accordion" data-filter="legacyQuick">',
          '        <button type="button" class="filter-accordion-header">',
          '          <div class="filter-accordion-label"><span class="ja">簡易フィルター</span><span class="vi">Lọc nhanh</span></div>',
          '          <div class="filter-accordion-summary" data-summary></div>',
          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',
          '        </button>',
          '        <div class="filter-accordion-content">',
          '          <div class="legacy-controls">',
          '            <div class="filter-group-caption"><span class="ja">種別</span><span class="vi">Loại</span></div>',
          '            <select id="fdLegacyCategorySelect" class="filter-drawer-select"></select>',
          '            <div class="filter-group-caption"><span class="ja">項目</span><span class="vi">Trường</span></div>',
          '            <select id="fdLegacyField" class="filter-drawer-select"></select>',
          '            <div class="filter-group-caption"><span class="ja">検索</span><span class="vi">Tìm</span></div>',
          '            <input id="fdLegacyValueSearch" type="text" class="filter-drawer-input" placeholder="Gõ để lọc...">',
          '            <div class="filter-group-caption"><span class="ja">値</span><span class="vi">Giá trị</span></div>',
          '            <select id="fdLegacyValue" class="filter-drawer-select"><option value="">-- Chọn --</option></select>',
          '            <div class="filter-group-caption"><span class="ja">ソート</span><span class="vi">Sort</span></div>',
          '            <select id="fdLegacySortField" class="filter-drawer-select"></select>',
          '            <div class="filter-group-caption"><span class="ja">順序</span><span class="vi">Thứ tự</span></div>',
          '            <select id="fdLegacySortDirection" class="filter-drawer-select">',
          '              <option value="desc">降順 / Giảm dần</option>',
          '              <option value="asc">昇順 / Tăng dần</option>',
          '            </select>',
          '          </div>',
          '          <p class="legacy-note">この部分は旧フィルター互換です。</p>',
          '        </div>',
          '      </section>',

          '    </div>',
          '    <div class="filter-drawer-footer">',
          '      <button type="button" class="filter-drawer-btn apply"><span class="ja">リセット</span><span class="vi">Reset</span></button>',
          '      <button type="button" class="filter-drawer-btn close"><span class="ja">閉じる</span><span class="vi">Đóng</span></button>',
          '    </div>',
          '  </div>',
          '</div>'
        ].join('');

        document.body.appendChild(wrapper);

        // accordion open/close
        var headers = Array.prototype.slice.call(document.querySelectorAll('#filterDrawer .filter-accordion-header'));
        headers.forEach(function (btn) {
          btn.addEventListener('click', function () {
            var sec = btn.closest('.filter-accordion');
            if (!sec) return;
            sec.classList.toggle('open');
          });
        });

        this.injectDrawerPerFieldReset();

      } catch (e) {
        console.error('FilterModule v8.1.0-7: Failed to create drawer', e);
      }
    },

    bindDrawerElements: function () {
      try {
        drawerRefs.root = document.getElementById('filterDrawer');
        drawerRefs.backdrop = drawerRefs.root ? drawerRefs.root.querySelector('.filter-drawer-backdrop') : null;
        drawerRefs.closeBtn = drawerRefs.root ? drawerRefs.root.querySelector('.filter-drawer-close') : null;
        drawerRefs.clearBtn = drawerRefs.root ? drawerRefs.root.querySelector('.filter-drawer-clear') : null;
        drawerRefs.applyBtn = drawerRefs.root ? drawerRefs.root.querySelector('.filter-drawer-btn.apply') : null;
        drawerRefs.footerCloseBtn = drawerRefs.root ? drawerRefs.root.querySelector('.filter-drawer-btn.close') : null;
      } catch (e) {
        drawerRefs.root = null;
        drawerRefs.backdrop = null;
        drawerRefs.closeBtn = null;
        drawerRefs.clearBtn = null;
        drawerRefs.applyBtn = null;
        drawerRefs.footerCloseBtn = null;
      }
    },

    openDrawer: function () {
      this.bindDrawerElements();
      if (!drawerRefs.root) return;
      drawerRefs.root.classList.remove('hidden');
      setTimeout(function () {
        drawerRefs.root.classList.add('show');
      }, 10);
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    },

    closeDrawer: function () {
      this.bindDrawerElements();
      if (!drawerRefs.root) return;
      drawerRefs.root.classList.remove('show');
      setTimeout(function () {
        if (!drawerRefs.root) return;
        drawerRefs.root.classList.add('hidden');
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
      }, 220);
    },

    toggleDrawer: function () {
      this.bindDrawerElements();
      if (!drawerRefs.root) return;
      var isOpen = drawerRefs.root.classList.contains('show') && !drawerRefs.root.classList.contains('hidden');
      if (isOpen) this.closeDrawer();
      else this.openDrawer();
    },

    // ---------------------------------------------------------------------
    // Mobile modal (legacy quick)
    // ---------------------------------------------------------------------
    createMobileModal: function () {
      if (document.getElementById('filterFullscreenModal')) return;

      try {
        var modal = document.createElement('div');
        modal.id = 'filterFullscreenModal';
        modal.className = 'filter-fullscreen-modal hidden';
        modal.innerHTML = [
          '<div class="filter-modal-backdrop"></div>',
          '<div class="filter-modal-container">',
          '  <div class="filter-modal-header">',
          '    <div class="filter-modal-title">',
          '      <span class="title-ja">絞り込み</span>',
          '      <span class="title-vi">Bộ lọc</span>',
          '    </div>',
          '    <button class="filter-modal-close-btn" aria-label="Close"><i class="fas fa-times"></i></button>',
          '  </div>',
          '  <div class="filter-modal-body">',
          '    <div class="filter-modal-section">',
          '      <div class="filter-modal-section-header">',
          '        <div class="filter-modal-section-title"><span class="title-ja">種別</span><span class="title-vi">Loại</span></div>',
          '      </div>',
          '      <div class="filter-modal-section-body">',
          '        <select id="modalCategorySelect" class="filter-modal-select">',
          '          <option value="all">全て / Tất cả</option>',
          '          <option value="mold">金型 / Khuôn</option>',
          '          <option value="cutter">抜型 / Dao cắt</option>',
          '        </select>',
          '      </div>',
          '    </div>',
          '    <div class="filter-modal-section">',
          '      <div class="filter-modal-section-header">',
          '        <div class="filter-modal-section-title"><span class="title-ja">簡易フィルター</span><span class="title-vi">Lọc nhanh</span></div>',
          '        <button id="modalBtnResetFilter" class="filter-modal-section-reset"><i class="fas fa-undo"></i> Reset</button>',
          '      </div>',
          '      <div class="filter-modal-section-body">',
          '        <div class="filter-modal-group">',
          '          <div class="filter-modal-group-label"><span class="label-ja">項目</span><span class="label-vi">Trường</span></div>',
          '          <select id="modalFilterField" class="filter-modal-select"></select>',
          '        </div>',
          '        <div class="filter-modal-group">',
          '          <div class="filter-modal-group-label"><span class="label-ja">値</span><span class="label-vi">Giá trị</span></div>',
          '          <select id="modalFilterValue" class="filter-modal-select"><option value="">-- Chọn --</option></select>',
          '        </div>',
          '      </div>',
          '    </div>',
          '    <div class="filter-modal-section">',
          '      <div class="filter-modal-section-header">',
          '        <div class="filter-modal-section-title"><span class="title-ja">ソート</span><span class="title-vi">Sắp xếp</span></div>',
          '        <button id="modalBtnResetSort" class="filter-modal-section-reset"><i class="fas fa-undo"></i> Reset</button>',
          '      </div>',
          '      <div class="filter-modal-section-body">',
          '        <div class="filter-modal-group">',
          '          <div class="filter-modal-group-label"><span class="label-ja">項目</span><span class="label-vi">Field</span></div>',
          '          <select id="modalSortField" class="filter-modal-select"></select>',
          '        </div>',
          '        <div class="filter-modal-group">',
          '          <div class="filter-modal-group-label"><span class="label-ja">順序</span><span class="label-vi">Thứ tự</span></div>',
          '          <select id="modalSortDirection" class="filter-modal-select">',
          '            <option value="desc">降順 / Giảm dần</option>',
          '            <option value="asc">昇順 / Tăng dần</option>',
          '          </select>',
          '        </div>',
          '      </div>',
          '    </div>',
          '  </div>',
          '  <div class="filter-modal-footer">',
          '    <button id="modalBtnResetAll" class="filter-modal-footer-btn btn-reset"><i class="fas fa-redo btn-icon"></i> Reset</button>',
          '    <button id="modalBtnClose" class="filter-modal-footer-btn btn-close"><i class="fas fa-times btn-icon"></i> Close</button>',
          '  </div>',
          '</div>'
        ].join('');

        document.body.appendChild(modal);
      } catch (e) {
        console.error('FilterModule v8.1.0-7: Failed to create mobile modal', e);
      }
    },

    // ---------------------------------------------------------------------
    // Bind desktop/mobile elements
    // ---------------------------------------------------------------------
    bindElements: function () {
      refs.desktopFilterSection = document.querySelector(SELECTORS.desktopFilterSection);
      refs.desktopFilterHeader = document.querySelector(SELECTORS.desktopFilterHeader);
      refs.desktopCategorySelect = document.querySelector(SELECTORS.desktopCategorySelect);
      refs.desktopFilterField = document.querySelector(SELECTORS.desktopFilterField);
      refs.desktopFilterValue = document.querySelector(SELECTORS.desktopFilterValue);
      refs.desktopSortField = document.querySelector(SELECTORS.desktopSortField);
      refs.desktopSortDirection = document.querySelector(SELECTORS.desktopSortDirection);
      refs.desktopBtnClear = document.querySelector(SELECTORS.desktopBtnClear);
      refs.desktopFilterValueSearch = document.querySelector(SELECTORS.desktopFilterValueSearch);

      refs.detailBtn = document.querySelector(SELECTORS.detailBtn);

      refs.mobileNavFilterBtn = document.querySelector(SELECTORS.mobileNavFilterBtn);
      refs.mobileNavMenuBtn = document.querySelector(SELECTORS.mobileNavMenuBtn);
      refs.mobileNavBadge = document.querySelector(SELECTORS.mobileNavBadge);

      refs.sidebar = document.querySelector(SELECTORS.sidebar);

      refs.modal = document.querySelector(SELECTORS.modal);
      if (refs.modal) {
        refs.modalCategorySelect = refs.modal.querySelector(SELECTORS.modalCategorySelect);
        refs.modalFilterField = refs.modal.querySelector(SELECTORS.modalFilterField);
        refs.modalFilterValue = refs.modal.querySelector(SELECTORS.modalFilterValue);
        refs.modalSortField = refs.modal.querySelector(SELECTORS.modalSortField);
        refs.modalSortDirection = refs.modal.querySelector(SELECTORS.modalSortDirection);

        // Populate modal selects
        if (refs.modalFilterField) this.populateFilterFields(refs.modalFilterField);
        if (refs.modalSortField) this.populateSortFields(refs.modalSortField);
      }

      // Populate desktop selects
      if (refs.desktopFilterField) this.populateFilterFields(refs.desktopFilterField);
      if (refs.desktopSortField) this.populateSortFields(refs.desktopSortField);

      // Populate drawer legacy controls
      this.populateDrawerLegacyControls();
    },

    populateFilterFields: function (selectEl) {
      var html = '<option value="">-- 全て --</option>';
      FILTER_FIELDS.forEach(function (field) {
        html += '<option value="' + escapeHtml(field.id) + '">' + escapeHtml(field.label) + '</option>';
      });
      selectEl.innerHTML = html;
    },

    populateSortFields: function (selectEl) {
      var sortFields = [
        { id: 'productionDate', label: '製造日 / Ngày SX' },
        { id: 'id', label: 'ID / Mã ID' },
        { id: 'code', label: 'コード / Mã' },
        { id: 'size', label: '寸法 / Kích thước' },
        { id: 'location', label: '棚番 / Vị trí' }
      ];

      var html = '';
      sortFields.forEach(function (f) {
        var selected = (f.id === DEFAULT_SORT.field) ? ' selected' : '';
        html += '<option value="' + escapeHtml(f.id) + '"' + selected + '>' + escapeHtml(f.label) + '</option>';
      });
      selectEl.innerHTML = html;
    },

    populateCategorySelectSimple: function (selectEl) {
      selectEl.innerHTML = [
        '<option value="all">All / 全て</option>',
        '<option value="mold">Mold / 金型</option>',
        '<option value="cutter">Cutter / 抜型</option>'
      ].join('');
    },

    populateDrawerLegacyControls: function () {
      var drawer = document.getElementById('filterDrawer');
      if (!drawer) return;

      var cat = drawer.querySelector('#fdLegacyCategorySelect');
      var fld = drawer.querySelector('#fdLegacyField');
      var srt = drawer.querySelector('#fdLegacySortField');

      if (cat) this.populateCategorySelectSimple(cat);
      if (fld) this.populateFilterFields(fld);
      if (srt) this.populateSortFields(srt);

      // direction select already has options
    },

    // ---------------------------------------------------------------------
    // Event listeners
    // ---------------------------------------------------------------------
    setupEventListeners: function () {
      var self = this;

      // Desktop: collapse filter section
      if (refs.desktopFilterHeader && refs.desktopFilterSection) {
        refs.desktopFilterHeader.addEventListener('click', function (e) {
          if (e.target && e.target.closest && e.target.closest('.filter-clear-btn')) return;
          refs.desktopFilterSection.classList.toggle('collapsed');
        });
      }

      // Desktop legacy: category
      if (refs.desktopCategorySelect) {
        refs.desktopCategorySelect.addEventListener('change', function (e) {
          if (self._suppressEvents) return;
          self.core.setCategory(e.target.value);
          self.applyFilter();
        });
      }

      // Desktop legacy: field
      if (refs.desktopFilterField) {
        refs.desktopFilterField.addEventListener('change', function (e) {
          if (self._suppressEvents) return;
          var fieldId = e.target.value;
          self.core.setLegacyFilter(fieldId, '');
          self.populateFilterValues(fieldId);
          self.updateBadge();
          self.updateDetailButton();
          self.applyFilter();
        });
      }

      // Desktop legacy: value
      if (refs.desktopFilterValue) {
        refs.desktopFilterValue.addEventListener('change', function (e) {
          if (self._suppressEvents) return;
          self.core.setLegacyFilter(self.core.state.legacy.fieldId, e.target.value);
          self.updateBadge();
          self.updateDetailButton();
          self.applyFilter();
        });
      }

      // Desktop legacy: search keyword for value options
      if (refs.desktopFilterValueSearch) {
        refs.desktopFilterValueSearch.addEventListener('input', function (e) {
          if (self._suppressEvents) return;
          self.filterValueOptionsByKeyword(e.target.value);
        });
      }

      // Desktop legacy: sort
      if (refs.desktopSortField) {
        refs.desktopSortField.addEventListener('change', function (e) {
          if (self._suppressEvents) return;
          self.core.setSort(e.target.value, self.core.state.sort.direction);
          self.updateBadge();
          self.updateDetailButton();
          self.applyFilter();
        });
      }

      if (refs.desktopSortDirection) {
        refs.desktopSortDirection.addEventListener('change', function (e) {
          if (self._suppressEvents) return;
          self.core.setSort(self.core.state.sort.field, e.target.value);
          self.updateBadge();
          self.updateDetailButton();
          self.applyFilter();
        });
      }

      // Desktop clear
      if (refs.desktopBtnClear) {
        refs.desktopBtnClear.addEventListener('click', function () {
          if (self._suppressEvents) return;
          self.resetAll();
        });
      }

      // Search bar detail button -> open drawer
      if (refs.detailBtn) {
        refs.detailBtn.addEventListener('click', function (e) {
          try { e.preventDefault(); } catch (err) {}
          try { e.stopPropagation(); } catch (err2) {}
          self.toggleDrawer();
        });
      }

      // Mobile bottom navbar: 絞込
      if (refs.mobileNavFilterBtn) {
        refs.mobileNavFilterBtn.addEventListener('click', function (e) {
          try { e.preventDefault(); } catch (err) {}
          self.toggleDrawer();
        });
      }

      // Mobile menu - REMOVED double listener to prevent interference with mobile-navbar-v8.4.1.js

      // Mobile modal close
      if (refs.modal) {
        var closeBtn = refs.modal.querySelector('.filter-modal-close-btn');
        var backdrop = refs.modal.querySelector('.filter-modal-backdrop');
        if (closeBtn) closeBtn.addEventListener('click', function () { self.closeModal(); });
        //if (backdrop) backdrop.addEventListener('click', function () { self.closeModal(); });

        var modalBtnClose = document.getElementById('modalBtnClose');
        if (modalBtnClose) modalBtnClose.addEventListener('click', function () { self.closeModal(); });

        var modalBtnResetAll = document.getElementById('modalBtnResetAll');
        if (modalBtnResetAll) modalBtnResetAll.addEventListener('click', function () { self.resetAll(); });

        var modalBtnResetFilter = document.getElementById('modalBtnResetFilter');
        if (modalBtnResetFilter) modalBtnResetFilter.addEventListener('click', function () { self.resetFilter(); });

        var modalBtnResetSort = document.getElementById('modalBtnResetSort');
        if (modalBtnResetSort) modalBtnResetSort.addEventListener('click', function () { self.resetSort(); });

        if (refs.modalCategorySelect) {
          refs.modalCategorySelect.addEventListener('change', function (e) {
            if (self._suppressEvents) return;
            self.core.setCategory(e.target.value);
            self.applyFilter();
          });
        }

        if (refs.modalFilterField) {
          refs.modalFilterField.addEventListener('change', function (e) {
            if (self._suppressEvents) return;
            var fieldId = e.target.value;
            self.core.setLegacyFilter(fieldId, '');
            self.populateFilterValues(fieldId);
            self.applyFilter();
          });
        }

        if (refs.modalFilterValue) {
          refs.modalFilterValue.addEventListener('change', function (e) {
            if (self._suppressEvents) return;
            self.core.setLegacyFilter(self.core.state.legacy.fieldId, e.target.value);
            self.applyFilter();
          });
        }

        if (refs.modalSortField) {
          refs.modalSortField.addEventListener('change', function (e) {
            if (self._suppressEvents) return;
            self.core.setSort(e.target.value, self.core.state.sort.direction);
            self.applyFilter();
          });
        }

        if (refs.modalSortDirection) {
          refs.modalSortDirection.addEventListener('change', function (e) {
            if (self._suppressEvents) return;
            self.core.setSort(self.core.state.sort.field, e.target.value);
            self.applyFilter();
          });
        }
      }

      // Drawer wiring
      this.bindDrawerElements();
      //if (drawerRefs.backdrop) drawerRefs.backdrop.addEventListener('click', function () { self.closeDrawer(); });
      if (drawerRefs.closeBtn) drawerRefs.closeBtn.addEventListener('click', function () { self.closeDrawer(); });
      if (drawerRefs.footerCloseBtn) drawerRefs.footerCloseBtn.addEventListener('click', function () { self.closeDrawer(); });
      if (drawerRefs.applyBtn) drawerRefs.applyBtn.addEventListener('click', function () { self.resetAll(); });

      if (drawerRefs.clearBtn) drawerRefs.clearBtn.addEventListener('click', function () { self.resetAll(); self.collapseAllDrawerFields(); });

      // Drawer controls
      this.setupDrawerControlEvents();

      // ESC close
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          self.closeModal();
          self.closeDrawer();
        }
      });
    },

    // ---------------------------------------------------------------------
    // Drawer control events -> update core.state.advanced
    // ---------------------------------------------------------------------
    setupDrawerControlEvents: function () {
      var self = this;
      var drawer = document.getElementById('filterDrawer');
      if (!drawer) return;

      function onChange(id, handler) {
        var el = drawer.querySelector('#' + id);
        if (!el) return;
        el.addEventListener('change', function () {
          if (self._suppressEvents) return;
          handler(el);
          self.updateBadge();
          self.updateDetailButton();
          self.scheduleApply();
        });
      }

      function onInput(id, handler) {
        var el = drawer.querySelector('#' + id);
        if (!el) return;
        el.addEventListener('input', function () {
          if (self._suppressEvents) return;
          handler(el);
          self.updateBadge();
          self.updateDetailButton();
          self.scheduleApply();
        });
      }

      // 1 itemType
      onChange('fditemType', function (el) {
        self.core.setAdvanced('itemType', el.value);
        // Đồng bộ category
        if (el.value && el.value !== 'all') self.core.setCategory(el.value);
        if (el.value === 'all') self.core.setCategory('all');
      });

      // 2 customer
      onChange('fdcustomer', function (el) {
        var adv = self.core.state.advanced || {};
        adv.customer = adv.customer || { select: '', text: '' };
        adv.customer.select = el.value;
        self.core.setAdvanced('customer', adv.customer);
      });
      onInput('fdcustomerinput', function (el) {
        var adv = self.core.state.advanced || {};
        adv.customer = adv.customer || { select: '', text: '' };
        adv.customer.text = el.value;
        self.core.setAdvanced('customer', adv.customer);
        self.filterDrawerSelectOptions('fdcustomer', el.value);
      });

      // 3 storage
      onChange('fdstorageCompany', function (el) {
        var adv = self.core.state.advanced || {};
        adv.storageCompany = adv.storageCompany || { select: '', text: '' };
        adv.storageCompany.select = el.value;
        self.core.setAdvanced('storageCompany', adv.storageCompany);
      });
      onInput('fdstorageCompanyinput', function (el) {
        var adv = self.core.state.advanced || {};
        adv.storageCompany = adv.storageCompany || { select: '', text: '' };
        adv.storageCompany.text = el.value;
        self.core.setAdvanced('storageCompany', adv.storageCompany);
        self.filterDrawerSelectOptions('fdstorageCompany', el.value);
      });

      // 4 rackLayer
      onChange('fdrackLayer', function (el) {
        var adv = self.core.state.advanced || {};
        adv.rackLayer = adv.rackLayer || { select: '', text: '' };
        adv.rackLayer.select = el.value;
        self.core.setAdvanced('rackLayer', adv.rackLayer);
      });
      onInput('fdrackLayerinput', function (el) {
        var adv = self.core.state.advanced || {};
        adv.rackLayer = adv.rackLayer || { select: '', text: '' };
        adv.rackLayer.text = el.value;
        self.core.setAdvanced('rackLayer', adv.rackLayer);
        self.filterDrawerSelectOptions('fdrackLayer', el.value);
      });

      // 5 dim quick + range
      function updateDim() {
        var adv = self.core.state.advanced || {};
        adv.dimension = adv.dimension || { quickSelect: '', quickText: '', L: { min: null, max: null }, W: { min: null, max: null } };
        var qs = drawer.querySelector('#fddimquick');
        var qt = drawer.querySelector('#fddimquickinput');
        var Lmin = drawer.querySelector('#fddimLmin');
        var Lmax = drawer.querySelector('#fddimLmax');
        var Wmin = drawer.querySelector('#fddimWmin');
        var Wmax = drawer.querySelector('#fddimWmax');
        adv.dimension.quickSelect = qs ? qs.value : '';
        adv.dimension.quickText = qt ? qt.value : '';
        adv.dimension.L.min = (Lmin && Lmin.value !== '') ? Lmin.value : null;
        adv.dimension.L.max = (Lmax && Lmax.value !== '') ? Lmax.value : null;
        adv.dimension.W.min = (Wmin && Wmin.value !== '') ? Wmin.value : null;
        adv.dimension.W.max = (Wmax && Wmax.value !== '') ? Wmax.value : null;
        self.core.setAdvanced('dimension', adv.dimension);
        if (qt) self.filterDrawerSelectOptions('fddimquick', qt.value);
      }
      var dimIds = ['fddimquick', 'fddimquickinput', 'fddimLmin', 'fddimLmax', 'fddimWmin', 'fddimWmax'];
      dimIds.forEach(function (id) {
        var el = drawer.querySelector('#' + id);
        if (!el) return;
        el.addEventListener((id === 'fddimquick') ? 'change' : 'input', function () {
          if (self._suppressEvents) return;
          updateDim();
          self.updateBadge();
          self.updateDetailButton();
          self.scheduleApply();
        });
      });

      // 6 date
      function updateDate() {
        var adv = self.core.state.advanced || {};
        adv.productionDate = adv.productionDate || { from: '', to: '' };
        var from = drawer.querySelector('#fddatefrom');
        var to = drawer.querySelector('#fddateto');
        adv.productionDate.from = from ? from.value : '';
        adv.productionDate.to = to ? to.value : '';
        self.core.setAdvanced('productionDate', adv.productionDate);
      }
      ['fddatefrom', 'fddateto'].forEach(function (id) {
        var el = drawer.querySelector('#' + id);
        if (!el) return;
        el.addEventListener('change', function () {
          if (self._suppressEvents) return;
          updateDate();
          self.updateBadge();
          self.updateDetailButton();
          self.scheduleApply();
        });
      });

      // 7 plastic
      onInput('fdplastic', function (el) {
        var adv = self.core.state.advanced || {};
        adv.plastic = adv.plastic || { text: '' };
        adv.plastic.text = el.value;
        self.core.setAdvanced('plastic', adv.plastic);
      });

      // 8 textContent
      onInput('fdtextContent', function (el) {
        var adv = self.core.state.advanced || {};
        adv.textContent = adv.textContent || { text: '' };
        adv.textContent.text = el.value;
        self.core.setAdvanced('textContent', adv.textContent);
      });

      // 9 trayInfo
      onInput('fdtrayInfo', function (el) {
        var adv = self.core.state.advanced || {};
        adv.trayInfo = adv.trayInfo || { text: '' };
        adv.trayInfo.text = el.value;
        self.core.setAdvanced('trayInfo', adv.trayInfo);
      });

      // 10 setupType list
      var setupList = drawer.querySelector('#fdsetupTypelist');
      if (setupList) {
        setupList.addEventListener('change', function () {
          if (self._suppressEvents) return;
          var adv = self.core.state.advanced || {};
          adv.setupType = adv.setupType || { selected: [] };
          var selected = [];
          var boxes = setupList.querySelectorAll('input[type="checkbox"]');
          Array.prototype.forEach.call(boxes, function (cb) { if (cb.checked) selected.push(cb.value); });
          adv.setupType.selected = selected;
          self.core.setAdvanced('setupType', adv.setupType);
          self.updateBadge();
          self.updateDetailButton();
          self.scheduleApply();
        });
      }

      // 11 orientation list
      var oriList = drawer.querySelector('#fdorientationlist');
      if (oriList) {
        oriList.addEventListener('change', function () {
          if (self._suppressEvents) return;
          var adv = self.core.state.advanced || {};
          adv.orientation = adv.orientation || { selected: [] };
          var selected = [];
          var boxes = oriList.querySelectorAll('input[type="checkbox"]');
          Array.prototype.forEach.call(boxes, function (cb) { if (cb.checked) selected.push(cb.value); });
          adv.orientation.selected = selected;
          self.core.setAdvanced('orientation', adv.orientation);
          self.updateBadge();
          self.updateDetailButton();
          self.scheduleApply();
        });
      }

      // 12 draft range
      function updateDraft() {
        var adv = self.core.state.advanced || {};
        adv.draftAngle = adv.draftAngle || { min: null, max: null };
        var mn = drawer.querySelector('#fddraftmin');
        var mx = drawer.querySelector('#fddraftmax');
        adv.draftAngle.min = (mn && mn.value !== '') ? mn.value : null;
        adv.draftAngle.max = (mx && mx.value !== '') ? mx.value : null;
        self.core.setAdvanced('draftAngle', adv.draftAngle);
      }
      ['fddraftmin', 'fddraftmax'].forEach(function (id) {
        var el = drawer.querySelector('#' + id);
        if (!el) return;
        el.addEventListener('input', function () {
          if (self._suppressEvents) return;
          updateDraft();
          self.updateBadge();
          self.updateDetailButton();
          self.scheduleApply();
        });
      });

      // 13 underAngle
      onChange('fdunderAngle', function (el) {
        var adv = self.core.state.advanced || {};
        adv.underAngle = adv.underAngle || { select: '', text: '' };
        adv.underAngle.select = el.value;
        self.core.setAdvanced('underAngle', adv.underAngle);
        self.scheduleApply();
      });
      onInput('fdunderAngleinput', function (el) {
        var adv = self.core.state.advanced || {};
        adv.underAngle = adv.underAngle || { select: '', text: '' };
        adv.underAngle.text = el.value;
        self.core.setAdvanced('underAngle', adv.underAngle);
        self.filterDrawerSelectOptions('fdunderAngle', el.value);
        self.scheduleApply();
      });

      // 14 cutline
      onChange('fdcutline', function (el) {
        var adv = self.core.state.advanced || {};
        adv.cutline = adv.cutline || { select: '', text: '' };
        adv.cutline.select = el.value;
        self.core.setAdvanced('cutline', adv.cutline);
        self.scheduleApply();
      });
      onInput('fdcutlineinput', function (el) {
        var adv = self.core.state.advanced || {};
        adv.cutline = adv.cutline || { select: '', text: '' };
        adv.cutline.text = el.value;
        self.core.setAdvanced('cutline', adv.cutline);
        self.filterDrawerSelectOptions('fdcutline', el.value);
        self.scheduleApply();
      });

      // 15 status flags lists
      var invList = drawer.querySelector('#fdinventoryStatuslist');
      var tfList = drawer.querySelector('#fdteflonlist');
      var cbReturning = drawer.querySelector('#fdreturning');
      var cbDisposing = drawer.querySelector('#fddisposing');

      function ensureStatusFlags() {
        var adv = self.core.state.advanced || {};
        adv.statusFlags = adv.statusFlags || { inventoryStatus: [], teflon: [], returning: null, disposing: null };
        return adv.statusFlags;
      }

      if (invList) {
        invList.addEventListener('change', function () {
          if (self._suppressEvents) return;
          var flags = ensureStatusFlags();
          var selected = [];
          var boxes = invList.querySelectorAll('input[type="checkbox"]');
          Array.prototype.forEach.call(boxes, function (cb) { if (cb.checked) selected.push(cb.value); });
          flags.inventoryStatus = selected;
          self.core.setAdvanced('statusFlags', flags);
          self.updateBadge();
          self.updateDetailButton();
          self.scheduleApply();
        });
      }

      if (tfList) {
        tfList.addEventListener('change', function () {
          if (self._suppressEvents) return;
          var flags = ensureStatusFlags();
          var selected = [];
          var boxes = tfList.querySelectorAll('input[type="checkbox"]');
          Array.prototype.forEach.call(boxes, function (cb) { if (cb.checked) selected.push(cb.value); });
          flags.teflon = selected;
          self.core.setAdvanced('statusFlags', flags);
          self.updateBadge();
          self.updateDetailButton();
          self.scheduleApply();
        });
      }

      if (cbReturning) {
        cbReturning.addEventListener('change', function () {
          if (self._suppressEvents) return;
          var flags = ensureStatusFlags();
          flags.returning = cbReturning.checked ? true : null;
          self.core.setAdvanced('statusFlags', flags);
          self.updateBadge();
          self.updateDetailButton();
          self.scheduleApply();
        });
      }

      if (cbDisposing) {
        cbDisposing.addEventListener('change', function () {
          if (self._suppressEvents) return;
          var flags = ensureStatusFlags();
          flags.disposing = cbDisposing.checked ? true : null;
          self.core.setAdvanced('statusFlags', flags);
          self.updateBadge();
          self.updateDetailButton();
          self.scheduleApply();
        });
      }

      // 16 legacy quick inside drawer (no duplicate ids)
      var legacyCat = drawer.querySelector('#fdLegacyCategorySelect');
      var legacyField = drawer.querySelector('#fdLegacyField');
      var legacyValue = drawer.querySelector('#fdLegacyValue');
      var legacySearch = drawer.querySelector('#fdLegacyValueSearch');
      var legacySortField = drawer.querySelector('#fdLegacySortField');
      var legacySortDir = drawer.querySelector('#fdLegacySortDirection');

      if (legacyCat) {
        legacyCat.addEventListener('change', function () {
          if (self._suppressEvents) return;
          self.core.setCategory(legacyCat.value);
          self.syncDrawerLegacyToDesktop();
          self.applyFilter();
          self.scheduleApply();
        });
      }

      if (legacyField) {
        legacyField.addEventListener('change', function () {
          if (self._suppressEvents) return;
          self.core.setLegacyFilter(legacyField.value, '');
          self.populateDrawerLegacyValues();
          self.syncDrawerLegacyToDesktop();
          self.applyFilter();
          self.scheduleApply();
        });
      }

      if (legacyValue) {
        legacyValue.addEventListener('change', function () {
          if (self._suppressEvents) return;
          self.core.setLegacyFilter(self.core.state.legacy.fieldId, legacyValue.value);
          self.syncDrawerLegacyToDesktop();
          self.applyFilter();
          self.scheduleApply();
        });
      }

      if (legacySearch) {
        legacySearch.addEventListener('input', function () {
          if (self._suppressEvents) return;
          self.filterDrawerLegacyValueOptionsByKeyword(legacySearch.value);
          self.scheduleApply();
        });
      }

      if (legacySortField) {
        legacySortField.addEventListener('change', function () {
          if (self._suppressEvents) return;
          self.core.setSort(legacySortField.value, self.core.state.sort.direction);
          self.syncDrawerLegacyToDesktop();
          self.applyFilter();
          self.scheduleApply();
        });
      }

      if (legacySortDir) {
        legacySortDir.addEventListener('change', function () {
          if (self._suppressEvents) return;
          self.core.setSort(self.core.state.sort.field, legacySortDir.value);
          self.syncDrawerLegacyToDesktop();
          self.applyFilter();
          self.scheduleApply();
        });
      }
    },

    filterDrawerSelectOptions: function (selectId, keyword) {
      var drawer = document.getElementById('filterDrawer');
      if (!drawer) return;
      var sel = drawer.querySelector('#' + selectId);
      if (!sel) return;
      var kw = normalizeText(keyword).toLowerCase();
      var opts = Array.prototype.slice.call(sel.options);
      opts.forEach(function (opt, idx) {
        if (idx === 0) return;
        var text = (opt.textContent || '').toLowerCase();
        var ok = !kw || text.indexOf(kw) !== -1;
        opt.style.display = ok ? '' : 'none';
        opt.hidden = !ok;
      });
    },

    // ---------------------------------------------------------------------
    // Desktop legacy value options
    // ---------------------------------------------------------------------
    populateFilterValues: function (fieldId) {
      var field = null;
      for (var i = 0; i < FILTER_FIELDS.length; i++) {
        if (FILTER_FIELDS[i].id === fieldId) { field = FILTER_FIELDS[i]; break; }
      }

      if (!field || typeof field.get !== 'function') {
        if (refs.desktopFilterValue) refs.desktopFilterValue.innerHTML = '<option value="">-- Chọn --</option>';
        if (refs.modalFilterValue) refs.modalFilterValue.innerHTML = '<option value="">-- Chọn --</option>';
        return;
      }

      var items = getAllItems();
      var set = {};
      items.forEach(function (it) {
        var v = displayText(field.get(it));
        set[v] = true;
      });

      var values = uniqSortedKeys(set, function (a, b) {
        if (a === EMPTY_LABEL && b === EMPTY_LABEL) return 0;
        if (a === EMPTY_LABEL) return 1;
        if (b === EMPTY_LABEL) return -1;
        return naturalCompare(a, b);
      });

      var html = '<option value="">-- Chọn --</option>';
      values.forEach(function (v) {
        html += '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + '</option>';
      });

      if (refs.desktopFilterValue) refs.desktopFilterValue.innerHTML = html;
      if (refs.modalFilterValue) refs.modalFilterValue.innerHTML = html;

    },

    filterValueOptionsByKeyword: function (keyword) {
      var select = refs.desktopFilterValue;
      if (!select) return;
      var kw = normalizeText(keyword).toLowerCase();
      var options = Array.prototype.slice.call(select.options);
      var firstMatchIndex = -1;
      options.forEach(function (opt, idx) {
        if (idx === 0) return;
        var text = (opt.textContent || '').toLowerCase();
        var match = !kw || text.indexOf(kw) !== -1;
        opt.hidden = !match;
        opt.style.display = match ? '' : 'none';
        if (match && firstMatchIndex === -1) firstMatchIndex = idx;
      });
      if (firstMatchIndex > 0) {
        select.selectedIndex = firstMatchIndex;
        var val = select.options[firstMatchIndex].value;
        if (val && val !== this.core.state.legacy.value) {
          this.core.setLegacyFilter(this.core.state.legacy.fieldId, val);
          this.applyFilter();
        }
      }
    },

    // ---------------------------------------------------------------------
    // Drawer legacy values
    // ---------------------------------------------------------------------
    populateDrawerLegacyValues: function () {
      var drawer = document.getElementById('filterDrawer');
      if (!drawer) return;
      var legacyValue = drawer.querySelector('#fdLegacyValue');
      if (!legacyValue) return;

      var fieldId = this.core.state.legacy.fieldId;
      if (!fieldId) {
        legacyValue.innerHTML = '<option value="">-- Chọn --</option>';
        return;
      }

      var field = null;
      for (var i = 0; i < FILTER_FIELDS.length; i++) {
        if (FILTER_FIELDS[i].id === fieldId) { field = FILTER_FIELDS[i]; break; }
      }
      if (!field || typeof field.get !== 'function') {
        legacyValue.innerHTML = '<option value="">-- Chọn --</option>';
        return;
      }

      var items = getAllItems();
      var set = {};
      items.forEach(function (it) {
        var v = displayText(field.get(it));
        set[v] = true;
      });

      var values = uniqSortedKeys(set, function (a, b) {
        if (a === EMPTY_LABEL && b === EMPTY_LABEL) return 0;
        if (a === EMPTY_LABEL) return 1;
        if (b === EMPTY_LABEL) return -1;
        return naturalCompare(a, b);
      });

      var html = '<option value="">-- Chọn --</option>';
      values.forEach(function (v) {
        html += '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + '</option>';
      });

      legacyValue.innerHTML = html;
      if (this.core.state.legacy.value) legacyValue.value = this.core.state.legacy.value;
    },

    filterDrawerLegacyValueOptionsByKeyword: function (keyword) {
      var drawer = document.getElementById('filterDrawer');
      if (!drawer) return;
      var select = drawer.querySelector('#fdLegacyValue');
      if (!select) return;
      var kw = normalizeText(keyword).toLowerCase();
      var options = Array.prototype.slice.call(select.options);
      options.forEach(function (opt, idx) {
        if (idx === 0) return;
        var text = (opt.textContent || '').toLowerCase();
        var ok = !kw || text.indexOf(kw) !== -1;
        opt.style.display = ok ? '' : 'none';
        opt.hidden = !ok;
      });
    },

    syncDrawerLegacyToDesktop: function () {
      // Không bắt buộc, nhưng giúp UI desktop hiển thị đúng theo thao tác trong drawer
      this._suppressEvents = true;
      try {
        var st = this.core.getState();
        if (refs.desktopCategorySelect) refs.desktopCategorySelect.value = st.category || 'all';
        if (refs.desktopFilterField) refs.desktopFilterField.value = st.legacy.fieldId || '';
        if (refs.desktopSortField) refs.desktopSortField.value = st.sort.field || DEFAULT_SORT.field;
        if (refs.desktopSortDirection) refs.desktopSortDirection.value = st.sort.direction || DEFAULT_SORT.direction;

        // refresh values + set
        if (st.legacy.fieldId) {
          this.populateFilterValues(st.legacy.fieldId);
          if (refs.desktopFilterValue) refs.desktopFilterValue.value = st.legacy.value || '';
        } else {
          if (refs.desktopFilterValue) refs.desktopFilterValue.innerHTML = '<option value="">-- Chọn --</option>';
        }
      } finally {
        this._suppressEvents = false;
      }
    },

    // ---------------------------------------------------------------------
    // Populate drawer data (options + checkbox lists)
    // ---------------------------------------------------------------------
    populateDrawerData: function () {
      var drawer = document.getElementById('filterDrawer');
      if (!drawer) return;

      var items = getAllItems();
      if (!items || !items.length) return;

      var setCustomer = {};
      var setStorage = {};
      var setRackLayer = {};
      var setDim = {};
      var setSetup = {};
      var setOri = {};
      var setUnder = {};
      var setCutline = {};
      var setInvStatus = {};
      var setTeflon = {};

      items.forEach(function (it) {
        var c = normalizeText(getItemCustomer(it));
        if (c) setCustomer[c] = true;

        var s = normalizeText(getItemStorageCompany(it));
        if (s) setStorage[s] = true;

        var r = normalizeText(getItemRackLayerDisplay(it));
        if (r) setRackLayer[r] = true;

        var d = normalizeText(getItemDimensions(it));
        if (d) setDim[d] = true;

        var st = normalizeText(getItemSetupType(it));
        if (st) setSetup[st] = true;

        var o = normalizeText(getItemOrientation(it));
        if (o) setOri[o] = true;

        var ua = normalizeText(getItemUnderAngle(it));
        if (ua) setUnder[ua] = true;

        var cl = normalizeText(getItemCutlineSize(it));
        if (cl) setCutline[cl] = true;

        var inv = normalizeText(getItemStatus(it));
        if (inv) setInvStatus[inv] = true;

        var tf = normalizeText(getItemTeflon(it));
        if (tf) setTeflon[tf] = true;
      });

      function fillSelect(selectId, setObj, comparator) {
        var sel = drawer.querySelector('#' + selectId);
        if (!sel) return;
        var keys = uniqSortedKeys(setObj, comparator);
        var html = '<option value="">指定なし</option>';
        keys.forEach(function (k) {
          html += '<option value="' + escapeHtml(k) + '">' + escapeHtml(k) + '</option>';
        });
        sel.innerHTML = html;
      }

      function fillSelectDim(selectId, setObj) {
        var sel = drawer.querySelector('#' + selectId);
        if (!sel) return;
        var keys = uniqSortedKeys(setObj, function (a, b) {
          if (a === EMPTY_LABEL && b === EMPTY_LABEL) return 0;
          if (a === EMPTY_LABEL) return 1;
          if (b === EMPTY_LABEL) return -1;
          return compareDimensions(a, b);
        });
        var html = '<option value="">指定なし</option>';
        keys.forEach(function (k) {
          html += '<option value="' + escapeHtml(k) + '">' + escapeHtml(k) + '</option>';
        });
        sel.innerHTML = html;
      }

      function fillCheckboxList(listId, setObj) {
        var box = drawer.querySelector('#' + listId);
        if (!box) return;
        var keys = uniqSortedKeys(setObj);
        var html = '';
        keys.forEach(function (k) {
          var id = listId + '_' + k.replace(/[^a-zA-Z0-9_\-]/g, '_');
          html += '<label><input type="checkbox" id="' + escapeHtml(id) + '" value="' + escapeHtml(k) + '"> ' + escapeHtml(k) + '</label>';
        });
        box.innerHTML = html;
      }

      fillSelect('fdcustomer', setCustomer);
      fillSelect('fdstorageCompany', setStorage);
      fillSelect('fdrackLayer', setRackLayer);
      fillSelectDim('fddimquick', setDim);
      fillSelect('fdunderAngle', setUnder);
      fillSelect('fdcutline', setCutline);

      fillCheckboxList('fdsetupTypelist', setSetup);
      fillCheckboxList('fdorientationlist', setOri);
      fillCheckboxList('fdinventoryStatuslist', setInvStatus);
      fillCheckboxList('fdteflonlist', setTeflon);

      // Restore selections for select fields (advanced)
      this.restoreDrawerSelectionsFromState();

      // Drawer legacy value list
      this.populateDrawerLegacyValues();
    },

    restoreDrawerSelectionsFromState: function () {
      var drawer = document.getElementById('filterDrawer');
      if (!drawer) return;
      var st = this.core.getState();
      var adv = st.advanced || {};

      this._suppressEvents = true;
      try {
        var elItemType = drawer.querySelector('#fditemType');
        if (elItemType) elItemType.value = adv.itemType || '';

        var selCustomer = drawer.querySelector('#fdcustomer');
        var inCustomer = drawer.querySelector('#fdcustomerinput');
        if (selCustomer && adv.customer) selCustomer.value = adv.customer.select || '';
        if (inCustomer && adv.customer) inCustomer.value = adv.customer.text || '';

        var selStorage = drawer.querySelector('#fdstorageCompany');
        var inStorage = drawer.querySelector('#fdstorageCompanyinput');
        if (selStorage && adv.storageCompany) selStorage.value = adv.storageCompany.select || '';
        if (inStorage && adv.storageCompany) inStorage.value = adv.storageCompany.text || '';

        var selRack = drawer.querySelector('#fdrackLayer');
        var inRack = drawer.querySelector('#fdrackLayerinput');
        if (selRack && adv.rackLayer) selRack.value = adv.rackLayer.select || '';
        if (inRack && adv.rackLayer) inRack.value = adv.rackLayer.text || '';

        if (adv.dimension) {
          var selDim = drawer.querySelector('#fddimquick');
          var inDim = drawer.querySelector('#fddimquickinput');
          var Lmin = drawer.querySelector('#fddimLmin');
          var Lmax = drawer.querySelector('#fddimLmax');
          var Wmin = drawer.querySelector('#fddimWmin');
          var Wmax = drawer.querySelector('#fddimWmax');
          if (selDim) selDim.value = adv.dimension.quickSelect || '';
          if (inDim) inDim.value = adv.dimension.quickText || '';
          if (Lmin) Lmin.value = (adv.dimension.L && adv.dimension.L.min != null) ? adv.dimension.L.min : '';
          if (Lmax) Lmax.value = (adv.dimension.L && adv.dimension.L.max != null) ? adv.dimension.L.max : '';
          if (Wmin) Wmin.value = (adv.dimension.W && adv.dimension.W.min != null) ? adv.dimension.W.min : '';
          if (Wmax) Wmax.value = (adv.dimension.W && adv.dimension.W.max != null) ? adv.dimension.W.max : '';
        }

        if (adv.productionDate) {
          var df = drawer.querySelector('#fddatefrom');
          var dt = drawer.querySelector('#fddateto');
          if (df) df.value = adv.productionDate.from || '';
          if (dt) dt.value = adv.productionDate.to || '';
        }

        if (adv.plastic) {
          var pl = drawer.querySelector('#fdplastic');
          if (pl) pl.value = adv.plastic.text || '';
        }

        if (adv.textContent) {
          var tc = drawer.querySelector('#fdtextContent');
          if (tc) tc.value = adv.textContent.text || '';
        }

        if (adv.trayInfo) {
          var ti = drawer.querySelector('#fdtrayInfo');
          if (ti) ti.value = adv.trayInfo.text || '';
        }

        if (adv.draftAngle) {
          var dm = drawer.querySelector('#fddraftmin');
          var dx = drawer.querySelector('#fddraftmax');
          if (dm) dm.value = adv.draftAngle.min != null ? adv.draftAngle.min : '';
          if (dx) dx.value = adv.draftAngle.max != null ? adv.draftAngle.max : '';
        }

        if (adv.underAngle) {
          var uai = drawer.querySelector('#fdunderAngleinput');
          var uas = drawer.querySelector('#fdunderAngle');
          if (uai) uai.value = adv.underAngle.text || '';
          if (uas) uas.value = adv.underAngle.select || '';
        }

        if (adv.cutline) {
          var cli = drawer.querySelector('#fdcutlineinput');
          var cls = drawer.querySelector('#fdcutline');
          if (cli) cli.value = adv.cutline.text || '';
          if (cls) cls.value = adv.cutline.select || '';
        }

        // checkbox lists
        function setChecked(listId, selected) {
          var box = drawer.querySelector('#' + listId);
          if (!box) return;
          var arr = Array.isArray(selected) ? selected : [];
          var map = {};
          arr.forEach(function (v) { map[String(v)] = true; });
          var cbs = box.querySelectorAll('input[type="checkbox"]');
          Array.prototype.forEach.call(cbs, function (cb) {
            cb.checked = !!map[String(cb.value)];
          });
        }
        if (adv.setupType) setChecked('fdsetupTypelist', adv.setupType.selected);
        if (adv.orientation) setChecked('fdorientationlist', adv.orientation.selected);
        if (adv.statusFlags) {
          setChecked('fdinventoryStatuslist', adv.statusFlags.inventoryStatus);
          setChecked('fdteflonlist', adv.statusFlags.teflon);
          var r = drawer.querySelector('#fdreturning');
          var d = drawer.querySelector('#fddisposing');
          if (r) r.checked = adv.statusFlags.returning === true;
          if (d) d.checked = adv.statusFlags.disposing === true;
        }

        // drawer legacy
        var legacyCat = drawer.querySelector('#fdLegacyCategorySelect');
        var legacyField = drawer.querySelector('#fdLegacyField');
        var legacyValue = drawer.querySelector('#fdLegacyValue');
        var legacySortField = drawer.querySelector('#fdLegacySortField');
        var legacySortDir = drawer.querySelector('#fdLegacySortDirection');
        if (legacyCat) legacyCat.value = st.category || 'all';
        if (legacyField) legacyField.value = st.legacy.fieldId || '';
        this.populateDrawerLegacyValues();
        if (legacyValue) legacyValue.value = st.legacy.value || '';
        if (legacySortField) legacySortField.value = st.sort.field || DEFAULT_SORT.field;
        if (legacySortDir) legacySortDir.value = st.sort.direction || DEFAULT_SORT.direction;

      } finally {
        this._suppressEvents = false;
      }
    },

    // ---------------------------------------------------------------------
    // Apply filter
    // ---------------------------------------------------------------------
    applyFilter: function () {
      var results = this.core.apply(getAllItems(), { dispatch: true });
      // results already dispatched; keep for debugging
      console.log('Filter applied:', results.length);
    },

    // ---------------------------------------------------------------------
    // Badge / Detail button
    // ---------------------------------------------------------------------
    updateBadge: function () {
      var st = this.core.getState();
      var adv = st.advanced || {};

      var isOn = false;

      if (st.category && st.category !== 'all') isOn = true;
      if (st.legacy && st.legacy.fieldId && st.legacy.value) isOn = true;
      if (st.sort && (st.sort.field !== DEFAULT_SORT.field || st.sort.direction !== DEFAULT_SORT.direction)) isOn = true;

      // advanced check
      function hasAdv() {
        if (adv.itemType && adv.itemType !== '' && adv.itemType !== 'all') return true;
        if (adv.customer && (adv.customer.select || adv.customer.text)) return true;
        if (adv.storageCompany && (adv.storageCompany.select || adv.storageCompany.text)) return true;
        if (adv.rackLayer && (adv.rackLayer.select || adv.rackLayer.text)) return true;
        if (adv.dimension && (adv.dimension.quickSelect || adv.dimension.quickText || (adv.dimension.L && (adv.dimension.L.min || adv.dimension.L.max)) || (adv.dimension.W && (adv.dimension.W.min || adv.dimension.W.max)))) return true;
        if (adv.productionDate && (adv.productionDate.from || adv.productionDate.to)) return true;
        if (adv.plastic && adv.plastic.text) return true;
        if (adv.textContent && adv.textContent.text) return true;
        if (adv.trayInfo && adv.trayInfo.text) return true;
        if (adv.setupType && adv.setupType.selected && adv.setupType.selected.length) return true;
        if (adv.orientation && adv.orientation.selected && adv.orientation.selected.length) return true;
        if (adv.draftAngle && (adv.draftAngle.min || adv.draftAngle.max)) return true;
        if (adv.underAngle && (adv.underAngle.select || adv.underAngle.text)) return true;
        if (adv.cutline && (adv.cutline.select || adv.cutline.text)) return true;
        if (adv.statusFlags && ((adv.statusFlags.inventoryStatus && adv.statusFlags.inventoryStatus.length) || (adv.statusFlags.teflon && adv.statusFlags.teflon.length) || adv.statusFlags.returning || adv.statusFlags.disposing)) return true;
        return false;
      }

      if (hasAdv()) isOn = true;

      // Desktop badge
      var desktopBadge = document.querySelector('#filterSection .filter-badge');
      if (desktopBadge) {
        if (isOn) {
          desktopBadge.textContent = 'ON';
          desktopBadge.classList.remove('hidden');
        } else {
          desktopBadge.classList.add('hidden');
        }
      }

      // Mobile badge
      if (refs.mobileNavBadge) {
        if (isOn) {
          refs.mobileNavBadge.textContent = 'ON';
          refs.mobileNavBadge.style.display = 'flex';
        } else {
          refs.mobileNavBadge.textContent = '';
          refs.mobileNavBadge.style.display = 'none';
        }
      }
    },

    updateDetailButton: function () {
      if (!refs.detailBtn) return;
      var desktopBadge = document.querySelector('#filterSection .filter-badge');
      var isOn = false;
      if (desktopBadge && !desktopBadge.classList.contains('hidden')) isOn = true;
      if (isOn) refs.detailBtn.classList.add('active');
      else refs.detailBtn.classList.remove('active');
    },

        updateDrawerIndicators: function () {
      var drawer = document.getElementById('filterDrawer');
      if (!drawer) return;

      var st = this.core.getState();
      var adv = st.advanced || {};

      function setSection(key, active, text) {
        var sec = drawer.querySelector('.filter-accordion[data-filter="' + key + '"]');
        if (!sec) return;
        if (active) sec.classList.add('has-value');
        else sec.classList.remove('has-value');

        var sum = sec.querySelector('[data-summary]');
        if (sum) sum.textContent = text || '';
      }

      // itemType
      setSection('itemType', !!(adv.itemType && adv.itemType !== 'all'), adv.itemType ? adv.itemType : '');

      // customer
      setSection('customer', !!(adv.customer && (adv.customer.select || adv.customer.text)),
        (adv.customer && (adv.customer.select || adv.customer.text)) ? (adv.customer.select || adv.customer.text) : '');

      // storageCompany
      setSection('storageCompany', !!(adv.storageCompany && (adv.storageCompany.select || adv.storageCompany.text)),
        (adv.storageCompany && (adv.storageCompany.select || adv.storageCompany.text)) ? (adv.storageCompany.select || adv.storageCompany.text) : '');

      // rackLayer
      setSection('rackLayer', !!(adv.rackLayer && (adv.rackLayer.select || adv.rackLayer.text)),
        (adv.rackLayer && (adv.rackLayer.select || adv.rackLayer.text)) ? (adv.rackLayer.select || adv.rackLayer.text) : '');

      // dimension
      var dimOn = !!(adv.dimension && (adv.dimension.quickSelect || adv.dimension.quickText ||
        (adv.dimension.L && (adv.dimension.L.min || adv.dimension.L.max)) ||
        (adv.dimension.W && (adv.dimension.W.min || adv.dimension.W.max))));
      var dimText = '';
      if (adv.dimension) {
        if (adv.dimension.quickSelect) dimText = adv.dimension.quickSelect;
        else if (adv.dimension.quickText) dimText = adv.dimension.quickText;
        else {
          var parts = [];
          if (adv.dimension.L && (adv.dimension.L.min || adv.dimension.L.max)) parts.push('L:' + (adv.dimension.L.min || '') + '~' + (adv.dimension.L.max || ''));
          if (adv.dimension.W && (adv.dimension.W.min || adv.dimension.W.max)) parts.push('W:' + (adv.dimension.W.min || '') + '~' + (adv.dimension.W.max || ''));
          dimText = parts.join(' ');
        }
      }
      setSection('dimension', dimOn, dimText);

      // productionDate
      var dateOn = !!(adv.productionDate && (adv.productionDate.from || adv.productionDate.to));
      var dateText = dateOn ? ((adv.productionDate.from || '') + ' ~ ' + (adv.productionDate.to || '')) : '';
      setSection('productionDate', dateOn, dateText);

      // plastic / textContent / trayInfo
      setSection('plastic', !!(adv.plastic && adv.plastic.text), adv.plastic ? adv.plastic.text : '');
      setSection('textContent', !!(adv.textContent && adv.textContent.text), adv.textContent ? adv.textContent.text : '');
      setSection('trayInfo', !!(adv.trayInfo && adv.trayInfo.text), adv.trayInfo ? adv.trayInfo.text : '');

      // setupType / orientation
      setSection('setupType', !!(adv.setupType && adv.setupType.selected && adv.setupType.selected.length),
        (adv.setupType && adv.setupType.selected && adv.setupType.selected.length) ? (adv.setupType.selected.length + ' selected') : '');
      setSection('orientation', !!(adv.orientation && adv.orientation.selected && adv.orientation.selected.length),
        (adv.orientation && adv.orientation.selected && adv.orientation.selected.length) ? (adv.orientation.selected.length + ' selected') : '');

      // draftAngle
      var draftOn = !!(adv.draftAngle && (adv.draftAngle.min || adv.draftAngle.max));
      setSection('draftAngle', draftOn, draftOn ? ((adv.draftAngle.min || '') + ' ~ ' + (adv.draftAngle.max || '')) : '');

      // underAngle / cutline
      setSection('underAngle', !!(adv.underAngle && (adv.underAngle.select || adv.underAngle.text)),
        adv.underAngle ? (adv.underAngle.select || adv.underAngle.text) : '');
      setSection('cutlineSize', !!(adv.cutline && (adv.cutline.select || adv.cutline.text)),
        adv.cutline ? (adv.cutline.select || adv.cutline.text) : '');

      // statusFlags
      var sf = adv.statusFlags || {};
      var sfOn = !!((sf.inventoryStatus && sf.inventoryStatus.length) || (sf.teflon && sf.teflon.length) || sf.returning || sf.disposing);
      var sfText = [];
      if (sf.inventoryStatus && sf.inventoryStatus.length) sfText.push('INV:' + sf.inventoryStatus.length);
      if (sf.teflon && sf.teflon.length) sfText.push('TF:' + sf.teflon.length);
      if (sf.returning) sfText.push('Returning');
      if (sf.disposing) sfText.push('Disposing');
      setSection('statusFlags', sfOn, sfText.join(' '));

      // legacyQuick (hiển thị nếu legacy đang dùng)
      var legacyOn = !!(st.legacy && st.legacy.fieldId && st.legacy.value);
      setSection('legacyQuick', legacyOn, legacyOn ? (st.legacy.fieldId + ':' + st.legacy.value) : '');
    },

    updateModalIndicators: function () {
      // tối thiểu: nếu bạn chưa cần thì để trống cũng được
    },

    // ---------------------------------------------------------------------
    // Sidebar / Modal
    // ---------------------------------------------------------------------
    toggleSidebar: function () {
      if (!refs.sidebar) return;
      refs.sidebar.classList.toggle('open');
    },

    openModal: function () {
      if (!refs.modal) return;
      refs.modal.classList.remove('hidden');
      setTimeout(function () { refs.modal.classList.add('show'); }, 10);
      document.body.style.overflow = 'hidden';
    },

    closeModal: function () {
      if (!refs.modal) return;
      refs.modal.classList.remove('show');
      setTimeout(function () {
        if (!refs.modal) return;
        refs.modal.classList.add('hidden');
        document.body.style.overflow = '';
      }, 220);
    },

    // ---------------------------------------------------------------------
    // Reset
    // ---------------------------------------------------------------------
    resetFilter: function () {
      this.core.resetLegacy();
      this.updateUI();
      this.updateBadge();
      this.updateDetailButton();
      this.applyFilter();
    },

    resetSort: function () {
      this.core.resetSort();
      this.updateUI();
      this.updateBadge();
      this.updateDetailButton();
      this.applyFilter();
    },

    resetAll: function () {
      this.core.resetAll();
      this.updateUI();
      this.updateBadge();
      this.updateDetailButton();
      this.applyFilter();
    },

        collapseAllDrawerFields: function () {
      var drawer = document.getElementById('filterDrawer');
      if (!drawer) return;
      var sections = drawer.querySelectorAll('.filter-accordion.open');
      Array.prototype.forEach.call(sections, function (sec) {
        sec.classList.remove('open');
      });
    },

    // ---------------------------------------------------------------------
    // UI update
    // ---------------------------------------------------------------------
    updateUI: function () {
      var st = this.core.getState();

      this._suppressEvents = true;
      try {
        // Desktop
        if (refs.desktopCategorySelect) refs.desktopCategorySelect.value = st.category || 'all';
        if (refs.desktopFilterField) refs.desktopFilterField.value = (st.legacy && st.legacy.fieldId) ? st.legacy.fieldId : '';
        if (refs.desktopSortField) refs.desktopSortField.value = (st.sort && st.sort.field) ? st.sort.field : DEFAULT_SORT.field;
        if (refs.desktopSortDirection) refs.desktopSortDirection.value = (st.sort && st.sort.direction) ? st.sort.direction : DEFAULT_SORT.direction;

        if (st.legacy && st.legacy.fieldId) {
          this.populateFilterValues(st.legacy.fieldId);
          if (refs.desktopFilterValue) refs.desktopFilterValue.value = st.legacy.value || '';
        } else {
          if (refs.desktopFilterValue) refs.desktopFilterValue.innerHTML = '<option value="">-- Chọn --</option>';
        }

        // Modal
        if (refs.modalCategorySelect) refs.modalCategorySelect.value = st.category || 'all';
        if (refs.modalFilterField) refs.modalFilterField.value = (st.legacy && st.legacy.fieldId) ? st.legacy.fieldId : '';
        if (refs.modalSortField) refs.modalSortField.value = (st.sort && st.sort.field) ? st.sort.field : DEFAULT_SORT.field;
        if (refs.modalSortDirection) refs.modalSortDirection.value = (st.sort && st.sort.direction) ? st.sort.direction : DEFAULT_SORT.direction;

        if (st.legacy && st.legacy.fieldId) {
          this.populateFilterValues(st.legacy.fieldId);
          if (refs.modalFilterValue) refs.modalFilterValue.value = st.legacy.value || '';
        } else {
          if (refs.modalFilterValue) refs.modalFilterValue.innerHTML = '<option value="">-- Chọn --</option>';
        }

      } finally {
        this._suppressEvents = false;
      }

      // Drawer UI sync will be done after populateDrawerData()
      this.restoreDrawerSelectionsFromState();

      this.updateDrawerIndicators();

    },

        injectDrawerPerFieldReset: function () {
      var self = this;
      var drawer = document.getElementById('filterDrawer');
      if (!drawer) return;

      var sections = drawer.querySelectorAll('.filter-accordion');
      Array.prototype.forEach.call(sections, function (sec) {
        var key = sec.getAttribute('data-filter');
        var headerBtn = sec.querySelector('.filter-accordion-header');
        var icon = sec.querySelector('.filter-accordion-icon');
        if (!key || !headerBtn || !icon) return;

        if (sec.querySelector('.filter-accordion-reset')) return;

        var reset = document.createElement('span');
        reset.className = 'filter-accordion-reset';
        reset.setAttribute('role', 'button');
        reset.setAttribute('tabindex', '0');
        reset.setAttribute('title', 'Reset');
        reset.innerHTML = '<i class="fas fa-undo"></i>';

        headerBtn.insertBefore(reset, icon);

        function doReset(ev) {
          try { ev.preventDefault(); } catch (e) {}
          try { ev.stopPropagation(); } catch (e2) {}
          self.resetDrawerField(key);
        }

        reset.addEventListener('click', doReset);
        reset.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') doReset(e);
        });
      });
    },

    resetDrawerField: function (key) {
      // reset từng trường, không đóng popup
      if (key === 'itemType') {
        this.core.setAdvanced('itemType', '');
        this.core.setCategory('all');
      } else if (key === 'customer') {
        this.core.setAdvanced('customer', { select: '', text: '' });
      } else if (key === 'storageCompany') {
        this.core.setAdvanced('storageCompany', { select: '', text: '' });
      } else if (key === 'rackLayer') {
        this.core.setAdvanced('rackLayer', { select: '', text: '' });
      } else if (key === 'dimension') {
        this.core.setAdvanced('dimension', { quickSelect: '', quickText: '', L: { min: null, max: null }, W: { min: null, max: null } });
      } else if (key === 'productionDate') {
        this.core.setAdvanced('productionDate', { from: '', to: '' });
      } else if (key === 'plastic') {
        this.core.setAdvanced('plastic', { text: '' });
      } else if (key === 'textContent') {
        this.core.setAdvanced('textContent', { text: '' });
      } else if (key === 'trayInfo') {
        this.core.setAdvanced('trayInfo', { text: '' });
      } else if (key === 'setupType') {
        this.core.setAdvanced('setupType', { selected: [] });
      } else if (key === 'orientation') {
        this.core.setAdvanced('orientation', { selected: [] });
      } else if (key === 'draftAngle') {
        this.core.setAdvanced('draftAngle', { min: null, max: null });
      } else if (key === 'underAngle') {
        this.core.setAdvanced('underAngle', { select: '', text: '' });
      } else if (key === 'cutlineSize') {
        this.core.setAdvanced('cutline', { select: '', text: '' });
      } else if (key === 'statusFlags') {
        this.core.setAdvanced('statusFlags', { inventoryStatus: [], teflon: [], returning: null, disposing: null });
      } else if (key === 'legacyQuick') {
        this.core.resetLegacy({ silent: true });
        this.core.resetSort({ silent: true });
        this.core.saveState();
      }

      this.updateUI();
      this.updateBadge();
      this.updateDetailButton();
      this.scheduleApply();
    },

    // ---------------------------------------------------------------------
    // Data ready refresh
    // ---------------------------------------------------------------------
    refreshWhenDataReady: function () {
      var self = this;

      function run() {
        // Khi có dữ liệu: nạp lại option list, sync UI, rồi bắn filterapplied 1 lần
        self._suppressEvents = true;
        try {
          // Rebuild legacy value options to match new data
          var st = self.core.getState();
          if (st.legacy && st.legacy.fieldId) {
            self.populateFilterValues(st.legacy.fieldId);
            if (refs.desktopFilterValue) refs.desktopFilterValue.value = st.legacy.value || '';
            if (refs.modalFilterValue) refs.modalFilterValue.value = st.legacy.value || '';
          }

          // Drawer data
          self.populateDrawerData();

          // Sync UI (desktop + modal)
          self.updateUI();
          self.updateBadge();
          self.updateDetailButton();

        } catch (e) {
          console.error('FilterModule refreshWhenDataReady error:', e);
        } finally {
          self._suppressEvents = false;
        }

        self.applyFilter();
      }

      if (window.DataManager && window.DataManager.isReady) {
        run();
        return;
      }

      document.addEventListener('data-manager:ready', function () {
        run();
      }, { once: true });

      // Nếu hệ thống có event update dữ liệu
      document.addEventListener('data-manager:updated', function () {
        run();
      });
    },

    // ---------------------------------------------------------------------
    // Compatibility API for App
    // ---------------------------------------------------------------------
    getState: function () {
      var st = this.core.getState();
      return {
        category: st.category,
        filter: { fieldId: (st.legacy && st.legacy.fieldId) ? st.legacy.fieldId : '', value: (st.legacy && st.legacy.value) ? st.legacy.value : '' },
        sort: { field: (st.sort && st.sort.field) ? st.sort.field : DEFAULT_SORT.field, direction: (st.sort && st.sort.direction) ? st.sort.direction : DEFAULT_SORT.direction }
      };
    },

    setState: function (newState) {
      // Tương thích với App: newState.silent, newState.filter, newState.sort
      var silent = !!(newState && newState.silent);
      var patch = newState || {};

      // remove silent (để tránh lưu vào state)
      if (patch && Object.prototype.hasOwnProperty.call(patch, 'silent')) {
        try { delete patch.silent; } catch (e) {}
      }

      this._suppressEvents = true;
      try {
        if (patch.category !== undefined) {
          this.core.setCategory(patch.category, { silent: true });
        }

        if (patch.filter) {
          var fid = (patch.filter.fieldId !== undefined) ? patch.filter.fieldId : this.core.state.legacy.fieldId;
          var val = (patch.filter.value !== undefined) ? patch.filter.value : this.core.state.legacy.value;
          this.core.setLegacyFilter(fid, val, { silent: true });
        }

        if (patch.sort) {
          var sf = (patch.sort.field !== undefined) ? patch.sort.field : this.core.state.sort.field;
          var sd = (patch.sort.direction !== undefined) ? patch.sort.direction : this.core.state.sort.direction;
          this.core.setSort(sf, sd, { silent: true });
        }

        // Save (core uses same STORAGE_KEY)
        this.core.saveState();

        // Update UI reflect
        this.updateUI();
        this.updateBadge();
        this.updateDetailButton();

      } finally {
        this._suppressEvents = false;
      }

      if (!silent) {
        this.applyFilter();
      }
    }
  };

  // -------------------------------------------------------------------------
  // Initialize
  // -------------------------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      FilterModule.init();
      window.FilterModule = FilterModule;
    });
  } else {
    FilterModule.init();
    window.FilterModule = FilterModule;
  }

})();

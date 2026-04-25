// v9.0.3
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



  function getItemDraftAngle(it) {

    var d = (it && it.designInfo) ? it.designInfo : {};

    return d.DraftAngle || it.DraftAngle || it.draftAngle || '';

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

        self.updateBadge();

        self.updateDetailButton();

      }, 150);

    },



    _suppressEvents: false,



    init: function () {

      console.log('🔧 FilterModule v8.1.0-7 (UI+Core): Initializing...');



      this.core = new window.FilterCore({ storageKey: STORAGE_KEY });



      this.createDrawer();

      var css = document.createElement('style');
      css.innerHTML = `
        /* Responsive tweaks for horizontal scroll */
        .filter-accordion-header {
            display: flex;
            align-items: center;
            width: 100%;
            box-sizing: border-box;
            overflow: hidden;
        }
        .filter-drawer-body {
            overflow-x: hidden;
        }
        .filter-drawer-panel {
            max-width: 100vw;
            box-sizing: border-box;
        }
        /* Top right clear button */
        .filter-drawer-clear {
            color: #ea580c !important;
            font-weight: bold !important;
            flex-shrink: 0;
        }
        /* Summary Text Badge */
        .filter-accordion.has-value .filter-accordion-summary {
            color: #1d4ed8 !important;
            font-weight: 700 !important;
            background-color: #dbeafe !important;
            padding: 2px 8px !important;
            border-radius: 12px !important;
            margin-right: 8px;
            max-width: 80px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            flex-shrink: 0;
        }
        /* Reset Icon */
        .filter-accordion-header .fa-undo, .filter-accordion-reset {
            color: #9ca3af !important; /* Gray out heavily */
            font-size: 1.1em;
            margin-right: 8px;
            transition: color 0.2s;
            opacity: 0.5 !important;
            flex-shrink: 0;
        }
        .filter-accordion.has-value .filter-accordion-header .fa-undo, 
        .filter-accordion.has-value .filter-accordion-reset {
            color: #ea580c !important; /* Orange when active */
            font-size: 1.3em !important;
            font-weight: bold;
            opacity: 1 !important;
        }
        /* Hover effect */
        .filter-accordion.has-value .filter-accordion-header .fa-undo:hover, 
        .filter-accordion.has-value .filter-accordion-reset:hover {
            color: #b91c1c !important;
        }
        /* Bottom Footer Button Swapping */
        .filter-drawer-footer {
            display: flex !important;
            flex-direction: row-reverse !important;
            gap: 10px;
            width: 100%;
            box-sizing: border-box;
        }
        .filter-drawer-btn.apply {
            background-color: #ef4444 !important;
            color: white !important;
            flex: 1;
        }
        .filter-drawer-btn.close {
            flex: 1;
        }
        /* Previous Highlights for Field Areas */
        .adv-section-header.has-filter {
            background-color: #eff6ff !important;
            color: #1d4ed8 !important;
            border-left: 4px solid #2563eb !important;
        }
      `;
document.head.appendChild(css);


      this.createMobileModal();

      this.bindElements();
      var mainClearBtn = document.querySelector('.search-wrap .clear-btn');
      if (mainClearBtn) {
        mainClearBtn.addEventListener('click', function() {
          if (window.FilterModule) window.FilterModule.clearFilter();
        });
      }

      this.setupEventListeners();



      // Restore UI from saved state

      this.updateUI();

      this.updateBadge();

      this.updateDetailButton();



      this.initSearchableDropdowns();



      this.refreshWhenDataReady();



      console.log('✅ FilterModule v8.1.0-7: Ready!');

    },



    // ---------------------------------------------------------------------

    // Searchable Dropdown

    // ---------------------------------------------------------------------

    initSearchableDropdowns: function () {

      if (typeof getAllItems !== 'function') return;

      var self = this;



      // 1) fdrackLayerinput

      this.setupSearchableDropdown('fdrackLayerinput', function (item) {

        return getItemRackLayerDisplay(item);

      });



      // 2) fdstorageCompanyinput

      this.setupSearchableDropdown('fdstorageCompanyinput', function (item) {

        return getItemStorageCompany(item);

      });

      this.setupSearchableDropdown('fdcustomerinput', function(item) { return getItemCustomer(item); });




      // 3) fdplastic

      this.setupSearchableDropdown('fdplastic', function (item) {

        var d = (item && item.designInfo) ? item.designInfo : {};

        return (item && item.plasticType) || d.DesignForPlasticType || d.PlasticType || '';

      });



      // 4) fdtrayInfo

      this.setupSearchableDropdown('fdtrayInfo', function (item) {

        var d = (item && item.designInfo) ? item.designInfo : {};

        return d.TrayInfoForMoldDesign || d.TrayInfo || (item && item.TrayInfoForMoldDesign) || (item && item.trayInfo) || (item && item.TrayInfo) || '';

      });



      // 5) fdtextContent

      this.setupSearchableDropdown('fdtextContent', function (item) {

        var d = (item && item.designInfo) ? item.designInfo : {};

        return d.TextContent || d.EngravingText || d.Engraving || d.Text || (item && item.TextContent) || (item && item.EngravingText) || (item && item.Engraving) || '';

      });

    },



    setupSearchableDropdown: function (inputId, getterFn) {

      var input = document.getElementById(inputId);

      if (!input) return;



      // Wrap input

      var wrapper = document.createElement('div');

      wrapper.className = 'searchable-dropdown-wrapper';

      input.parentNode.insertBefore(wrapper, input);

      wrapper.appendChild(input);



      // Create list container

      var listDiv = document.createElement('div');

      listDiv.className = 'searchable-dropdown-list';

      wrapper.appendChild(listDiv);



      function renderList(filterText) {

        var rawItems = getAllItems();

        var uniqueSet = {};

        for (var i = 0; i < rawItems.length; i++) {

          var val = getterFn(rawItems[i]);

          var txt = normalizeText(val);

          if (txt) uniqueSet[txt] = true;

        }

        var keys = Object.keys(uniqueSet);

        keys.sort(function (a, b) { return naturalCompare(a, b); });



        listDiv.innerHTML = '';

        var fText = normalizeText(filterText).toLowerCase();



        var count = 0;

        for (var j = 0; j < keys.length; j++) {

          var text = keys[j];

          var tLower = text.toLowerCase();

          if (fText && tLower.indexOf(fText) === -1) continue;



          var itemDiv = document.createElement('div');

          itemDiv.className = 'searchable-dropdown-item';



          if (fText) {

            var idx = tLower.indexOf(fText);

            var before = text.substring(0, idx);

            var match = text.substring(idx, idx + fText.length);

            var after = text.substring(idx + fText.length);

            itemDiv.innerHTML = escapeHtml(before) + '<span class="highlight">' + escapeHtml(match) + '</span>' + escapeHtml(after);

          } else {

            itemDiv.textContent = text;

          }



          itemDiv.dataset.value = text;

          listDiv.appendChild(itemDiv);

          count++;

          if (count > 100) break; // limit to prevent UI thread blocking

        }



        if (count === 0) {

          var empty = document.createElement('div');

          empty.className = 'searchable-dropdown-item';

          empty.style.color = '#9e9e9e';

          empty.textContent = 'Trống / (N/A)';

          listDiv.appendChild(empty);

        }

      }



      var hideTimeout = null;



      input.addEventListener('focus', function () {

        if (hideTimeout) clearTimeout(hideTimeout);

        renderList(input.value);

        listDiv.classList.add('show');

      });



      input.addEventListener('input', function () {

        renderList(input.value);

        listDiv.classList.add('show');

      });



      // Handle item click

      listDiv.addEventListener('mousedown', function (e) {

        // use mousedown to prevent blur from closing the list before click fires

        var itemEl = e.target.closest('.searchable-dropdown-item');

        if (!itemEl || !itemEl.dataset.value) return;



        input.value = itemEl.dataset.value;

        listDiv.classList.remove('show');



        // Trigger manual change/input event so the rest of the app catches it

        var ev = document.createEvent('Event');

        ev.initEvent('input', true, true);

        input.dispatchEvent(ev);



        // Prevent input from immediately losing focus

        e.preventDefault();

      });



      input.addEventListener('blur', function () {

        // slight delay to allow mousedown to fire smoothly

        hideTimeout = setTimeout(function () {

          listDiv.classList.remove('show');

        }, 150);

      });

    },



    // ---------------------------------------------------------------------



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

          '        <span class="ja">条件クリア＆縮小</span>',

          '        <span class="vi">Xóa điều kiện lọc và thu gọn</span>',

          '      </button>',

          '    </div>',

          '    <div class="filter-drawer-body">',

          '      <section class="filter-section filter-inline-section">',

          '        <div class="filter-section-title"><span class="ja">検索</span><span class="vi">Tìm kiếm</span></div>',

          '        <div style="position: relative;">',

          '          <i class="fas fa-search" style="position: absolute; left: 10px; top: 12px; color: #a1a1aa"></i>',

          '          <input id="fdrawKeyword" type="text" class="filter-drawer-input" placeholder="Gõ từ khóa..." style="padding-left: 32px;">',

          '        </div>',

          '      </section>',



          '      <section class="filter-section filter-inline-section">',

          '        <div class="filter-section-title"><span class="ja">種別</span><span class="vi">Loại thiết bị</span></div>',

          '        <div class="filter-btn-group" id="fdCategoryGroup">',

          '          <button type="button" class="filter-box-btn active" data-val="all">全て 🗃️</button>',

          '          <button type="button" class="filter-box-btn" data-val="mold">金型 🛠️</button>',

          '          <button type="button" class="filter-box-btn" data-val="cutter">抜型 ✂️</button>',

          '        </div>',

          '      </section>',



          '      <section class="filter-accordion" data-filter="sortPanel">',

          '        <button type="button" class="filter-accordion-header">',

          '          <div class="filter-accordion-label"><span class="ja">ソート</span><span class="vi">Sắp xếp</span></div>',

          '          <div class="filter-accordion-summary" data-summary></div>',

          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',

          '        </button>',

          '        <div class="filter-accordion-content">',

          '          <div class="filter-btn-group" id="fdSortGroup">',

          '            <button type="button" class="filter-box-btn sort-btn" data-field="productionDate" data-dir="desc"><div class="fb-icon">🕒</div><div class="fb-text"><span class="ja">新着</span><span class="vi">Mới</span></div><div class="sort-arr"></div></button>',

          '            <button type="button" class="filter-box-btn sort-btn" data-field="dim" data-dir="desc"><div class="fb-icon">📏</div><div class="fb-text"><span class="ja">寸法</span><span class="vi">Kích cỡ</span></div><div class="sort-arr"></div></button>',

          '            <button type="button" class="filter-box-btn sort-btn" data-field="code" data-dir="asc"><div class="fb-icon">🔤</div><div class="fb-text"><span class="ja">コード</span><span class="vi">Mã</span></div><div class="sort-arr"></div></button>',

          '          </div>',

          '        </div>',

          '      </section>',



          '      <section class="filter-accordion" data-filter="datePanel">',

          '        <button type="button" class="filter-accordion-header">',

          '          <div class="filter-accordion-label"><span class="ja">製造日</span><span class="vi">TG SX/Sửa đổi</span></div>',

          '          <div class="filter-accordion-summary" data-summary></div>',

          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',

          '        </button>',

          '        <div class="filter-accordion-content">',

          '          <div class="filter-pill-group" id="fdDatePillGroup" style="margin-bottom: 8px;">',

          '            <button type="button" class="filter-pill-btn active" data-days="all">全て</button>',

          '            <button type="button" class="filter-pill-btn" data-days="3">3日以内</button>',

          '            <button type="button" class="filter-pill-btn" data-days="7">7日以内</button>',

          '            <button type="button" class="filter-pill-btn" data-days="30">30日以内</button>',

          '            <button type="button" class="filter-pill-btn" data-days="custom">カスタム 📅</button>',

          '          </div>',

          '          <div id="fdDateCustomWrap" class="hidden" style="margin-top: 10px;">',

          '            <div class="filter-date-row"><label><span class="vi">Từ</span></label><input id="fddatefrom" type="date" class="filter-drawer-input"></div>',

          '            <div class="filter-date-row"><label><span class="vi">Đến</span></label><input id="fddateto" type="date" class="filter-drawer-input"></div>',

          '          </div>',

          '        </div>',

          '      </section>',



          '      <section class="filter-section filter-inline-section">',

          '        <div class="filter-section-title"><span class="ja">金型サイズ</span><span class="vi">Kích thước khuôn (L x W)</span></div>',

          '        <div class="filter-range-row" style="display: flex; gap: 8px;">',

          '          <input id="fddimL" type="text" class="filter-drawer-input" placeholder="L (例: >=200)">',

          '          <span style="align-self: center; color: #a1a1aa">x</span>',

          '          <input id="fddimW" type="text" class="filter-drawer-input" placeholder="W (例: <100)">',

          '        </div>',

          '      </section>',



          '      <section class="filter-section filter-inline-section">',

          '        <div class="filter-section-title"><span class="ja">製品/抜き型サイズ</span><span class="vi">Kích thước Dao/SP (L x W)</span></div>',

          '        <div class="filter-range-row" style="display: flex; gap: 8px;">',

          '          <input id="fdcutlineL" type="text" class="filter-drawer-input" placeholder="L (例: >=200)">',

          '          <span style="align-self: center; color: #a1a1aa">x</span>',

          '          <input id="fdcutlineW" type="text" class="filter-drawer-input" placeholder="W (例: <100)">',

          '        </div>',

          '      </section>',



          '      <section class="filter-accordion open" data-filter="plastic">',

          '        <button type="button" class="filter-accordion-header">',

          '          <div class="filter-accordion-label"><span class="ja">樹脂</span><span class="vi">Loại nhựa</span></div>',

          '          <div class="filter-accordion-summary" data-summary></div>',

          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',

          '        </button>',

          '        <div class="filter-accordion-content">',

          '          <input id="fdplastic" type="text" class="filter-drawer-input" autocomplete="off" placeholder="PP, PS, PET...">',

          '        </div>',

          '      </section>',



          '      <section class="filter-accordion open" data-filter="rackLayer">',

          '        <button type="button" class="filter-accordion-header">',

          '          <div class="filter-accordion-label"><span class="ja">棚位置</span><span class="vi">Giá / Tầng (RackID, Loc)</span></div>',

          '          <div class="filter-accordion-summary" data-summary></div>',

          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',

          '        </button>',

          '        <div class="filter-accordion-content">',

          '          <input id="fdrackLayerinput" type="text" class="filter-drawer-input" autocomplete="off" placeholder="21, 事務所前...">',

          '        </div>',

          '      </section>',



          '      <div class="filter-section-divider"></div>',



          '      <section class="filter-accordion" data-filter="customer">',

          '        <button type="button" class="filter-accordion-header">',

          '          <div class="filter-accordion-label"><span class="ja">顧客名</span><span class="vi">Khách hàng</span></div>',

          '          <div class="filter-accordion-summary" data-summary></div>',

          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',

          '        </button>',

          '        <div class="filter-accordion-content">',

          '          <input id="fdcustomerinput" type="text" class="filter-drawer-input" placeholder="JAE, KDS...">',

          '        </div>',

          '      </section>',



          '      <section class="filter-accordion" data-filter="storageCompany">',

          '        <button type="button" class="filter-accordion-header">',

          '          <div class="filter-accordion-label"><span class="ja">保管会社</span><span class="vi">Công ty lưu trữ</span></div>',

          '          <div class="filter-accordion-summary" data-summary></div>',

          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',

          '        </button>',

          '        <div class="filter-accordion-content">',

          '          <input id="fdstorageCompanyinput" type="text" class="filter-drawer-input" autocomplete="off" placeholder="YSD...">',

          '        </div>',

          '      </section>',



          '      <section class="filter-accordion" data-filter="textContent">',

          '        <button type="button" class="filter-accordion-header">',

          '          <div class="filter-accordion-label"><span class="ja">彫刻</span><span class="vi">Chữ khắc</span></div>',

          '          <div class="filter-accordion-summary" data-summary></div>',

          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',

          '        </button>',

          '        <div class="filter-accordion-content">',

          '          <input id="fdtextContent" type="text" class="filter-drawer-input" autocomplete="off" placeholder="彫刻内容">',

          '        </div>',

          '      </section>',



          '      <section class="filter-accordion" data-filter="trayInfo">',

          '        <button type="button" class="filter-accordion-header">',

          '          <div class="filter-accordion-label"><span class="ja">トレイ情報</span><span class="vi">Tray info</span></div>',

          '          <div class="filter-accordion-summary" data-summary></div>',

          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',

          '        </button>',

          '        <div class="filter-accordion-content">',

          '          <input id="fdtrayInfo" type="text" class="filter-drawer-input" autocomplete="off" placeholder="Thông tin Tray...">',

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

          '          <div id="fddraftanglelist" class="filter-checkbox-list"></div>',

          '        </div>',

          '      </section>',



          '      <section class="filter-accordion" data-filter="underAngle">',

          '        <button type="button" class="filter-accordion-header">',

          '          <div class="filter-accordion-label"><span class="ja">UnderAngle</span><span class="vi">Thoát phương ngang</span></div>',

          '          <div class="filter-accordion-summary" data-summary></div>',

          '          <i class="fas fa-chevron-down filter-accordion-icon"></i>',

          '        </button>',

          '        <div class="filter-accordion-content">',

          '          <div id="fdunderanglelist" class="filter-checkbox-list"></div>',

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

          '          <div class="filter-group-caption"><span class="ja">デバイス状態</span><span class="vi">Device Status</span></div>',

          '          <div id="fddevicestatuslist" class="filter-checkbox-list">',

          '            <label><input type="checkbox" value="disposed"> Đã hủy (Disposed)</label>',

          '            <label><input type="checkbox" value="returned"> Đã trả (Returned)</label>',

          '            <label><input type="checkbox" value="dataonly"> Dữ liệu thiết kế (Dataonly)</label>',

          '            <label><input type="checkbox" value="prototype"> Hàng mẫu (Prototype)</label>',

          '          </div>',

          '          <div class="filter-group-caption"><span class="ja">保管場所</span><span class="vi">Nơi bảo quản</span></div>',

          '          <div id="fdkeepertype" class="filter-checkbox-list">',

          '            <label><input type="radio" name="keepertype" value="" checked> Tất cả</label>',

          '            <label><input type="radio" name="keepertype" value="internal"> Tại xưởng (Internal)</label>',

          '            <label><input type="radio" name="keepertype" value="external"> Ở Đối tác (External)</label>',

          '          </div>',

          '        </div>',

          '      </section>',



          '    </div>',

          '    <div class="filter-drawer-footer">',

          '      <button type="button" class="filter-drawer-btn apply"><span class="ja">リセットして閉じる</span><span class="vi">Xóa bộ lọc (reset) và đóng</span></button>',

          '      <button type="button" class="filter-drawer-btn close"><span class="ja">適用</span><span class="vi">Áp dụng</span></button>',

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



    updateSortUI: function (sortGroup) {

      if (!sortGroup) return;

      var currentField = this.core.state.sort.field;

      var currentDir = this.core.state.sort.direction;

      var btns = sortGroup.querySelectorAll('.filter-box-btn.sort-btn');

      btns.forEach(function (b) {

        var arr = b.querySelector('.sort-arr');

        if (!arr) return;

        if (b.classList.contains('active')) {

          arr.innerHTML = currentDir === 'asc' ? '▲' : '▼';

          arr.style.color = currentDir === 'asc' ? '#10b981' : '#f43f5e';

          arr.style.fontWeight = 'bold';

        } else {

          arr.innerHTML = '';

          arr.style.color = '';

        }

      });

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

          try { e.preventDefault(); } catch (err) { }

          try { e.stopPropagation(); } catch (err2) { }

          self.toggleDrawer();

        });

      }



      // Mobile bottom navbar: 絞込

      if (refs.mobileNavFilterBtn) {

        refs.mobileNavFilterBtn.addEventListener('click', function (e) {

          try { e.preventDefault(); } catch (err) { }

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

      if (drawerRefs.backdrop) drawerRefs.backdrop.addEventListener('click', function () { self.closeDrawer(); });

      if (drawerRefs.closeBtn) drawerRefs.closeBtn.addEventListener('click', function () { self.closeDrawer(); });

      if (drawerRefs.footerCloseBtn) drawerRefs.footerCloseBtn.addEventListener('click', function () { self.closeDrawer(); });

      if (drawerRefs.applyBtn) {

        drawerRefs.applyBtn.addEventListener('click', function () {

          self.resetAll();

          self.collapseAllDrawerFields();

          self.closeDrawer();

        });

      }



      if (drawerRefs.clearBtn) {

        drawerRefs.clearBtn.addEventListener('click', function () {

          self.resetAll();

          self.collapseAllDrawerFields();

        });

      }



      // Drawer Swipe-to-Close Gesture (Tối ưu mượt mà và chống giật)

      if (drawerRefs.root) {

        var fdTouchStartX = 0;

        var fdTouchStartY = 0;

        var fdCurrentX = 0;

        var fdIsSwiping = false;



        drawerRefs.root.addEventListener('touchstart', function (e) {

          if (e.touches.length === 1) {

            fdTouchStartX = e.touches[0].clientX;

            fdTouchStartY = e.touches[0].clientY;

            fdCurrentX = fdTouchStartX;



            var isScrollable = e.target.closest('.filter-checkbox-list, input, select');



            // Xử lý vuốt: FilterDrawer thường nằm chèn bên phải, vuốt từ trái sang phải để đóng

            if (!isScrollable) {

              fdIsSwiping = true;

              var panelEl = drawerRefs.root.querySelector('.filter-drawer-panel');

              if (panelEl) panelEl.style.transition = 'none';

            }

          }

        }, { passive: true });



        drawerRefs.root.addEventListener('touchmove', function (e) {

          if (!fdIsSwiping || e.touches.length !== 1) return;



          fdCurrentX = e.touches[0].clientX;

          var currentY = e.touches[0].clientY;

          var dx = fdCurrentX - fdTouchStartX;

          var dy = currentY - fdTouchStartY;

          var panelEl = drawerRefs.root.querySelector('.filter-drawer-panel');



          // Hủy thao tác vuốt đóng nếu vuốt chéo/dọc

          if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 15) {

            fdIsSwiping = false;

            if (panelEl) {

              panelEl.style.transform = '';

              panelEl.style.transition = '';

            }

            return;

          }



          // Vuốt sang phải (dx > 0)

          if (dx > 0) {

            window._panelClosingSwipe = true; // Báo khóa không mở sidebar

            if (panelEl) {

              panelEl.style.transform = 'translateX(' + dx + 'px)';

            }

          }

        }, { passive: true });



        drawerRefs.root.addEventListener('touchend', function (e) {

          if (!fdIsSwiping) return;

          fdIsSwiping = false;



          setTimeout(function () { window._panelClosingSwipe = false; }, 100);



          var panelEl = drawerRefs.root.querySelector('.filter-drawer-panel');

          if (panelEl) {

            panelEl.style.transition = '';

            panelEl.style.transform = '';

          }



          var dx = fdCurrentX - fdTouchStartX;

          if (dx > 80) {

            self.closeDrawer();

          }

          fdTouchStartX = 0;

        }, { passive: true });

      }







      // Drawer controls

      this.setupDrawerControlEvents();

      var drawer = document.getElementById('filterDrawer');

      if (drawer) this.updateSortUI(drawer.querySelector('#fdSortGroup'));



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



      // Keyword Search (sync with global input)

      onInput('fdrawKeyword', function (el) {

        var globSearch = document.getElementById('searchInput');

        if (globSearch) {

          globSearch.value = el.value;

          // Trigger input event on global search

          globSearch.dispatchEvent(new Event('input', { bubbles: true }));

        }

      });



      // Categories

      var catGroup = drawer.querySelector('#fdCategoryGroup');

      if (catGroup) {

        var cbtns = catGroup.querySelectorAll('.filter-box-btn');

        Array.prototype.forEach.call(cbtns, function (b) {

          b.addEventListener('click', function () {

            if (self._suppressEvents) return;

            cbtns.forEach(function (bb) { bb.classList.remove('active'); });

            b.classList.add('active');

            var val = b.getAttribute('data-val');

            self.core.setCategory(val);

            self.core.setAdvanced('itemType', val);

            self.updateBadge();

            self.updateDetailButton();

            self.applyFilter();

            self.scheduleApply();

          });

        });

      }



      // Sorting

      var sortGroup = drawer.querySelector('#fdSortGroup');

      if (sortGroup) {

        var sbtns = sortGroup.querySelectorAll('.filter-box-btn.sort-btn');

        Array.prototype.forEach.call(sbtns, function (b) {

          b.addEventListener('click', function () {

            if (self._suppressEvents) return;

            var field = b.getAttribute('data-field');

            var dir = b.getAttribute('data-dir');

            if (b.classList.contains('active')) {

              dir = (dir === 'desc') ? 'asc' : 'desc';

              b.setAttribute('data-dir', dir);

            } else {

              sbtns.forEach(function (bb) { bb.classList.remove('active'); });

              b.classList.add('active');

            }

            self.core.setSort(field, dir);

            self.updateSortUI(sortGroup);

            self.updateBadge();

            self.updateDetailButton();

            self.applyFilter();

            self.scheduleApply();

          });

        });

      }



      // Date Pills

      var dateGroup = drawer.querySelector('#fdDatePillGroup');

      var customWrap = drawer.querySelector('#fdDateCustomWrap');

      if (dateGroup) {

        var dpills = dateGroup.querySelectorAll('.filter-pill-btn');

        Array.prototype.forEach.call(dpills, function (b) {

          b.addEventListener('click', function () {

            if (self._suppressEvents) return;

            dpills.forEach(function (bb) { bb.classList.remove('active'); });

            b.classList.add('active');

            var days = b.getAttribute('data-days');



            var adv = self.core.state.advanced || {};

            adv.productionDate = adv.productionDate || { from: '', to: '' };

            adv.productionDate.from = '';

            adv.productionDate.to = '';



            var isCustomActive = null;

            if (days === 'custom') {

              if (customWrap) {

                // If already active, toggle it OFF (user clicks again to close custom wrap)

                if (b.classList.contains('active') && !customWrap.classList.contains('hidden')) {

                  customWrap.classList.add('hidden');

                  b.classList.remove('active');

                  isCustomActive = false;

                  // Clear date state

                  adv.productionDate.from = '';

                  adv.productionDate.to = '';

                } else {

                  customWrap.classList.remove('hidden');

                  isCustomActive = true;

                }

              }

            } else {

              if (customWrap) customWrap.classList.add('hidden');

              if (days !== 'all') {

                var d = new Date();

                d.setDate(d.getDate() - parseInt(days));

                var m = ('0' + (d.getMonth() + 1)).slice(-2);

                var dy = ('0' + d.getDate()).slice(-2);

                adv.productionDate.from = String(d.getFullYear()) + '-' + m + '-' + dy; // Wait python in js? No I used python slicing format inside js string... fix below!

              }

            }

            // If it's a fixed days OR we just toggled OFF custom, we apply immediately

            if (days !== 'custom' || isCustomActive === false) {

              self.core.setAdvanced('productionDate', adv.productionDate);

              self.updateBadge();

              self.updateDetailButton();

              self.applyFilter();

              self.scheduleApply();

            }

          });

        });

      }



      function updateCustomDate() {

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

          updateCustomDate();

          self.updateBadge();

          self.updateDetailButton();

          self.scheduleApply();

        });

      });



      // Mold Dimensions (L x W)

      function updateDim() {

        var adv = self.core.state.advanced || {};

        adv.dimension = adv.dimension || {};

        var dimL = drawer.querySelector('#fddimL');

        var dimW = drawer.querySelector('#fddimW');

        adv.dimension.length = (dimL && dimL.value !== '') ? dimL.value : null;

        adv.dimension.width = (dimW && dimW.value !== '') ? dimW.value : null;

        self.core.setAdvanced('dimension', adv.dimension);

      }

      var fddimL = drawer.querySelector('#fddimL');

      var fddimW = drawer.querySelector('#fddimW');

      if (fddimL) {

        fddimL.addEventListener('input', function () {

          if (self._suppressEvents) return;

          updateDim(); self.updateBadge(); self.updateDetailButton(); self.scheduleApply();

        });

        fddimL.addEventListener('keydown', function (e) {

          if (e.key === 'Enter' && !window.matchMedia('(max-width: 768px)').matches) {

            e.preventDefault();

            if (fddimW) fddimW.focus();

          }

        });

      }

      if (fddimW) {

        fddimW.addEventListener('input', function () {

          if (self._suppressEvents) return;

          updateDim(); self.updateBadge(); self.updateDetailButton(); self.scheduleApply();

        });

        fddimW.addEventListener('keydown', function (e) {

          if (e.key === 'Enter') {

            e.preventDefault();

            fddimW.blur();

          }

        });

      }



      // Cutter Dimensions (Cutline L x W)

      function updateCutline() {

        var adv = self.core.state.advanced || {};

        adv.cutline = adv.cutline || {};

        var cL = drawer.querySelector('#fdcutlineL');

        var cW = drawer.querySelector('#fdcutlineW');

        adv.cutline.length = (cL && cL.value !== '') ? cL.value : null;

        adv.cutline.width = (cW && cW.value !== '') ? cW.value : null;

        self.core.setAdvanced('cutline', adv.cutline);

      }

      var fdcutlineL = drawer.querySelector('#fdcutlineL');

      var fdcutlineW = drawer.querySelector('#fdcutlineW');

      if (fdcutlineL) {

        fdcutlineL.addEventListener('input', function () {

          if (self._suppressEvents) return;

          updateCutline(); self.updateBadge(); self.updateDetailButton(); self.scheduleApply();

        });

        fdcutlineL.addEventListener('keydown', function (e) {

          if (e.key === 'Enter' && !window.matchMedia('(max-width: 768px)').matches) {

            e.preventDefault();

            if (fdcutlineW) fdcutlineW.focus();

          }

        });

      }

      if (fdcutlineW) {

        fdcutlineW.addEventListener('input', function () {

          if (self._suppressEvents) return;

          updateCutline(); self.updateBadge(); self.updateDetailButton(); self.scheduleApply();

        });

        fdcutlineW.addEventListener('keydown', function (e) {

          if (e.key === 'Enter') {

            e.preventDefault();

            fdcutlineW.blur();

          }

        });

      }



      // Accordions

      onInput('fdcustomerinput', function (el) {

        var adv = self.core.state.advanced || {};

        adv.customer = adv.customer || { select: '', text: '' };

        adv.customer.text = el.value;

        self.core.setAdvanced('customer', adv.customer);

      });



      onInput('fdstorageCompanyinput', function (el) {

        var adv = self.core.state.advanced || {};

        adv.storageCompany = adv.storageCompany || { select: '', text: '' };

        adv.storageCompany.text = el.value;

        self.core.setAdvanced('storageCompany', adv.storageCompany);

      });



      onInput('fdrackLayerinput', function (el) {

        var adv = self.core.state.advanced || {};

        adv.rackLayer = adv.rackLayer || { select: '', text: '' };

        adv.rackLayer.text = el.value;

        self.core.setAdvanced('rackLayer', adv.rackLayer);

      });



      onInput('fdplastic', function (el) {

        var adv = self.core.state.advanced || {};

        adv.plastic = adv.plastic || { text: '' };

        adv.plastic.text = el.value;

        self.core.setAdvanced('plastic', adv.plastic);

      });



      onInput('fdtextContent', function (el) {

        var adv = self.core.state.advanced || {};

        adv.textContent = adv.textContent || { text: '' };

        adv.textContent.text = el.value;

        self.core.setAdvanced('textContent', adv.textContent);

      });



      onInput('fdtrayInfo', function (el) {

        var adv = self.core.state.advanced || {};

        adv.trayInfo = adv.trayInfo || { text: '' };

        adv.trayInfo.text = el.value;

        self.core.setAdvanced('trayInfo', adv.trayInfo);

      });



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



      var draftList = drawer.querySelector('#fddraftanglelist');

      if (draftList) {

        draftList.addEventListener('change', function () {

          if (self._suppressEvents) return;

          var adv = self.core.state.advanced || {};

          adv.draftAngle = adv.draftAngle || { selected: [] };

          var selected = [];

          var boxes = draftList.querySelectorAll('input[type="checkbox"]');

          Array.prototype.forEach.call(boxes, function (cb) { if (cb.checked) selected.push(cb.value); });

          adv.draftAngle.selected = selected;

          self.core.setAdvanced('draftAngle', adv.draftAngle);

          self.updateBadge();

          self.updateDetailButton();

          self.scheduleApply();

        });

      }



      var underList = drawer.querySelector('#fdunderanglelist');

      if (underList) {

        underList.addEventListener('change', function () {

          if (self._suppressEvents) return;

          var adv = self.core.state.advanced || {};

          adv.underAngle = adv.underAngle || { selected: [] };

          var selected = [];

          var boxes = underList.querySelectorAll('input[type="checkbox"]');

          Array.prototype.forEach.call(boxes, function (cb) { if (cb.checked) selected.push(cb.value); });

          adv.underAngle.selected = selected;

          self.core.setAdvanced('underAngle', adv.underAngle);

          self.updateBadge();

          self.updateDetailButton();

          self.scheduleApply();

        });

      }







      onInput('fdcutlineinput', function (el) {

        var adv = self.core.state.advanced || {};

        adv.cutline = adv.cutline || { select: '', text: '' };

        adv.cutline.text = el.value;

        self.core.setAdvanced('cutline', adv.cutline);

      });



      function ensureStatusFlags() {

        var adv = self.core.state.advanced || {};

        adv.statusFlags = adv.statusFlags || { inventoryStatus: [], teflon: [], deviceStatus: [], keeperType: '' };

        return adv.statusFlags;

      }



      var invList = drawer.querySelector('#fdinventoryStatuslist');

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



      var tfList = drawer.querySelector('#fdteflonlist');

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



      var dsList = drawer.querySelector('#fddevicestatuslist');

      if (dsList) {

        dsList.addEventListener('change', function () {

          if (self._suppressEvents) return;

          var flags = ensureStatusFlags();

          var selected = [];

          var boxes = dsList.querySelectorAll('input[type="checkbox"]');

          Array.prototype.forEach.call(boxes, function (cb) { if (cb.checked) selected.push(cb.value); });

          flags.deviceStatus = selected;

          self.core.setAdvanced('statusFlags', flags);

          self.updateBadge();

          self.updateDetailButton();

          self.scheduleApply();

        });

      }



      var ktList = drawer.querySelector('#fdkeepertype');

      if (ktList) {

        ktList.addEventListener('change', function () {

          if (self._suppressEvents) return;

          var flags = ensureStatusFlags();

          var val = '';

          var radios = ktList.querySelectorAll('input[type="radio"]');

          Array.prototype.forEach.call(radios, function (r) { if (r.checked) val = r.value; });

          flags.keeperType = val;

          self.core.setAdvanced('statusFlags', flags);

          self.updateBadge();

          self.updateDetailButton();

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

      var setDraft = {};



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



        var da = normalizeText(getItemDraftAngle(it));

        if (da) setDraft[da] = true;



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



      fillSelect('fdcutline', setCutline);



      fillCheckboxList('fdsetupTypelist', setSetup);

      fillCheckboxList('fdorientationlist', setOri);

      fillCheckboxList('fdinventoryStatuslist', setInvStatus);

      fillCheckboxList('fdteflonlist', setTeflon);

      fillCheckboxList('fddraftanglelist', setDraft);

      fillCheckboxList('fdunderanglelist', setUnder);



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

        var globSearch = document.getElementById('keywordSearch_v8');

        var kwin = drawer.querySelector('#fdrawKeyword');

        if (kwin && globSearch) {

          kwin.value = globSearch.value || '';

        }



        var catGroup = drawer.querySelector('#fdCategoryGroup');

        if (catGroup) {

          var cBtns = catGroup.querySelectorAll('.filter-box-btn');

          var matchedCat = false;

          cBtns.forEach(function (b) {

            b.classList.remove('active');

            if (b.getAttribute('data-val') === (st.category || 'all')) {

              b.classList.add('active');

              matchedCat = true;

            }

          });

          if (!matchedCat && cBtns.length) cBtns[0].classList.add('active');

        }



        var sortGroup = drawer.querySelector('#fdSortGroup');

        if (sortGroup) {

          var sBtns = sortGroup.querySelectorAll('.filter-box-btn.sort-btn');

          sBtns.forEach(function (b) {

            b.classList.remove('active');

            var dirAttr = b.getAttribute('data-dir');

            if (b.getAttribute('data-field') === (st.sort.field || '')) {

              b.classList.add('active');

              b.setAttribute('data-dir', st.sort.direction || 'desc');

            }

          });

        }



        if (adv.dimension) {

          var inDimL = drawer.querySelector('#fddimL');

          var inDimW = drawer.querySelector('#fddimW');

          if (inDimL) inDimL.value = adv.dimension.length || '';

          if (inDimW) inDimW.value = adv.dimension.width || '';

        }



        if (adv.productionDate) {

          var df = drawer.querySelector('#fddatefrom');

          var dt = drawer.querySelector('#fddateto');

          if (df) df.value = adv.productionDate.from || '';

          if (dt) dt.value = adv.productionDate.to || '';



          var dateGroup = drawer.querySelector('#fdDatePillGroup');

          if (dateGroup) {

            var dateBtns = dateGroup.querySelectorAll('.filter-pill-btn');

            dateBtns.forEach(function (b) { b.classList.remove('active'); });

            if (adv.productionDate.from) {

              var cBtn = dateGroup.querySelector('[data-days="custom"]');

              if (cBtn) cBtn.classList.add('active');

            } else {

              var cBtn = dateGroup.querySelector('[data-days="all"]');

              if (cBtn) cBtn.classList.add('active');

            }

          }

        }



        var inCustomer = drawer.querySelector('#fdcustomerinput');

        if (inCustomer && adv.customer) inCustomer.value = adv.customer.text || '';



        var inStorage = drawer.querySelector('#fdstorageCompanyinput');

        if (inStorage && adv.storageCompany) inStorage.value = adv.storageCompany.text || '';



        var inRack = drawer.querySelector('#fdrackLayerinput');

        if (inRack && adv.rackLayer) inRack.value = adv.rackLayer.text || '';



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

          var dm = drawer.querySelector('#fddraftangle');

          if (dm) dm.value = adv.draftAngle.min != null ? adv.draftAngle.min : '';

        }



        if (adv.underAngle) {

          var uai = drawer.querySelector('#fdunderangleinput');

          if (uai) uai.value = adv.underAngle.text || '';

        }



        if (adv.cutline) {

          var cli = drawer.querySelector('#fdcutlineinput');

          if (cli) cli.value = adv.cutline.text || '';

          var inCutL = drawer.querySelector('#fdcutlineL');

          var inCutW = drawer.querySelector('#fdcutlineW');

          if (inCutL) inCutL.value = adv.cutline.length || '';

          if (inCutW) inCutW.value = adv.cutline.width || '';

        }



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

          setChecked('fddevicestatuslist', adv.statusFlags.deviceStatus);

          var ktRads = drawer.querySelectorAll('#fdkeepertype input[type="radio"]');

          var ktVal = adv.statusFlags.keeperType || '';

          Array.prototype.forEach.call(ktRads, function (r) {

            r.checked = (r.value === ktVal);

          });

        }



      } finally {

        this._suppressEvents = false;

      }

    },



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



      var isFilter = false;

      var isSort = false;



      if (st.category && st.category !== 'all') isFilter = true;

      if (st.legacy && st.legacy.fieldId && st.legacy.value) isFilter = true;

      if (st.sort && (st.sort.field !== DEFAULT_SORT.field || st.sort.direction !== DEFAULT_SORT.direction)) isSort = true;



      // advanced check

      function hasAdv() {

        if (adv.itemType && adv.itemType !== '' && adv.itemType !== 'all') return true;

        if (adv.customer && (adv.customer.select || adv.customer.text)) return true;

        if (adv.storageCompany && (adv.storageCompany.select || adv.storageCompany.text)) return true;

        if (adv.rackLayer && (adv.rackLayer.select || adv.rackLayer.text)) return true;

        if (adv.dimension && (adv.dimension.quickSelect || adv.dimension.quickText || adv.dimension.length || adv.dimension.width)) return true;

        if (adv.productionDate && (adv.productionDate.from || adv.productionDate.to)) return true;

        if (adv.plastic && adv.plastic.text) return true;

        if (adv.textContent && adv.textContent.text) return true;

        if (adv.trayInfo && adv.trayInfo.text) return true;

        if (adv.setupType && adv.setupType.selected && adv.setupType.selected.length) return true;

        if (adv.orientation && adv.orientation.selected && adv.orientation.selected.length) return true;

        if (adv.draftAngle && adv.draftAngle.selected && adv.draftAngle.selected.length) return true;

        if (adv.underAngle && adv.underAngle.selected && adv.underAngle.selected.length) return true;

        if (adv.cutline && (adv.cutline.select || adv.cutline.text || adv.cutline.length || adv.cutline.width)) return true;

        if (adv.statusFlags && ((adv.statusFlags.inventoryStatus && adv.statusFlags.inventoryStatus.length) || (adv.statusFlags.teflon && adv.statusFlags.teflon.length) || (adv.statusFlags.deviceStatus && adv.statusFlags.deviceStatus.length) || adv.statusFlags.keeperType || adv.statusFlags.returning || adv.statusFlags.disposing)) return true;

        return false;

      }



      if (hasAdv()) isFilter = true;

      var isOn = isFilter || isSort;



      // Desktop badge

      var desktopBadge = document.querySelector('#filterSection .filter-badge');

      if (desktopBadge) {

        if (isOn) {

          desktopBadge.textContent = 'ON';

          desktopBadge.style.backgroundColor = isFilter ? '#f43f5e' : '#f97316';

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

          refs.mobileNavBadge.style.backgroundColor = isFilter ? '#f43f5e' : '#f97316';

        } else {

          refs.mobileNavBadge.textContent = '';

          refs.mobileNavBadge.style.display = 'none';

        }

      }

      // Desktop NavBtn Badge Color

      var desktopBtnI = document.querySelector('#filterNavBtn i');

      if (desktopBtnI) {

        if (isOn) {

          desktopBtnI.style.color = isFilter ? '#f43f5e' : '#f97316';

        } else {

          desktopBtnI.style.color = '';

        }

      }

    },



    updateDetailButton: function () {

      if (!refs.detailBtn) return;

      var st = this.core.getState();

      var adv = st.advanced || {};

      var isFilter = false;

      var isSort = false;



      if (st.category && st.category !== 'all') isFilter = true;

      if (st.legacy && st.legacy.fieldId && st.legacy.value) isFilter = true;

      if (st.sort && (st.sort.field !== DEFAULT_SORT.field || st.sort.direction !== DEFAULT_SORT.direction)) isSort = true;



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

        if (adv.draftAngle && adv.draftAngle.selected && adv.draftAngle.selected.length) return true;

        if (adv.underAngle && adv.underAngle.selected && adv.underAngle.selected.length) return true;

        if (adv.cutline && (adv.cutline.select || adv.cutline.text)) return true;

        if (adv.statusFlags && ((adv.statusFlags.inventoryStatus && adv.statusFlags.inventoryStatus.length) || (adv.statusFlags.teflon && adv.statusFlags.teflon.length) || (adv.statusFlags.deviceStatus && adv.statusFlags.deviceStatus.length) || adv.statusFlags.keeperType)) return true;

        return false;

      }

      if (hasAdv()) isFilter = true;



      var isOn = isFilter || isSort;

      if (isOn) {

        refs.detailBtn.classList.add('active');

        refs.detailBtn.style.color = isFilter ? '#f43f5e' : '#f97316';

        refs.detailBtn.style.borderColor = isFilter ? '#f43f5e' : '#f97316';

      } else {

        refs.detailBtn.classList.remove('active');

        refs.detailBtn.style.color = '';

        refs.detailBtn.style.borderColor = '';

      }

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

      var dimOn = !!(adv.dimension && (adv.dimension.quickSelect || adv.dimension.quickText || adv.dimension.length || adv.dimension.width));

      var dimText = '';

      if (adv.dimension) {

        if (adv.dimension.quickSelect) dimText = adv.dimension.quickSelect;

        else if (adv.dimension.quickText) dimText = adv.dimension.quickText;

        else {

          var parts = [];

          if (adv.dimension.length) parts.push('L:' + adv.dimension.length);

          if (adv.dimension.width) parts.push('W:' + adv.dimension.width);

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



      // draftAngle (Array matching)

      setSection('draftAngle', !!(adv.draftAngle && adv.draftAngle.selected && adv.draftAngle.selected.length),

        (adv.draftAngle && adv.draftAngle.selected && adv.draftAngle.selected.length) ? (adv.draftAngle.selected.length + ' selected') : '');



      // underAngle (Array matching)

      setSection('underAngle', !!(adv.underAngle && adv.underAngle.selected && adv.underAngle.selected.length),

        (adv.underAngle && adv.underAngle.selected && adv.underAngle.selected.length) ? (adv.underAngle.selected.length + ' selected') : '');

      var cutOn = !!(adv.cutline && (adv.cutline.select || adv.cutline.text || adv.cutline.length || adv.cutline.width));

      var cutText = '';

      if (adv.cutline) {

        if (adv.cutline.select || adv.cutline.text) {

          cutText = adv.cutline.select || adv.cutline.text;

        } else {

          var cParts = [];

          if (adv.cutline.length) cParts.push('L:' + adv.cutline.length);

          if (adv.cutline.width) cParts.push('W:' + adv.cutline.width);

          cutText = cParts.join(' ');

        }

      }

      setSection('cutlineSize', cutOn, cutText);



      // statusFlags

      var sf = adv.statusFlags || {};

      var sfOn = !!((sf.inventoryStatus && sf.inventoryStatus.length) || (sf.teflon && sf.teflon.length) || (sf.deviceStatus && sf.deviceStatus.length));

      var sfText = [];

      if (sf.inventoryStatus && sf.inventoryStatus.length) sfText.push('INV:' + sf.inventoryStatus.length);

      if (sf.teflon && sf.teflon.length) sfText.push('TF:' + sf.teflon.length);

      if (sf.deviceStatus && sf.deviceStatus.length) sfText.push('DEV:' + sf.deviceStatus.length);

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



      // Also clear Global Search Input

      var globSearch = document.getElementById('searchInput');

      var drawerSearch = document.getElementById('fdrawKeyword');

      var wasSearching = false;

      if (globSearch && globSearch.value.trim() !== '') {

        globSearch.value = '';

        wasSearching = true;

      }

      if (drawerSearch && drawerSearch.value.trim() !== '') {

        drawerSearch.value = '';

      }



      this.updateUI();

      this.updateBadge();

      this.updateDetailButton();

      this.applyFilter();



      // Dispatch input event to clear SearchModule cache AFTER filter is applied

      if (wasSearching) {

        setTimeout(function () {

          if (globSearch) globSearch.dispatchEvent(new Event('input', { bubbles: true }));

        }, 50);

      }

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

          try { ev.preventDefault(); } catch (e) { }

          try { ev.stopPropagation(); } catch (e2) { }

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

        try { delete patch.silent; } catch (e) { }

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


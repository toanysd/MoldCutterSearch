/* ============================================================================

FILTER CORE v8.1.0-7 - Filter Logic Engine (No UI)

Mold/Cutter Search System - Filter popup (Mercari-like)

- Tách riêng Core Logic khỏi UI để giảm file quá nặng
- Core chỉ xử lý: state, lọc dữ liệu, sắp xếp, save/restore localStorage, bắn event
- UI (file filter-ui-v8.1.0-7.js) sẽ: tạo drawer/modal, bắt sự kiện click/change, rồi gọi Core

Created: 2026-01-31
Version:  v8.1.0-7

Compatibility goals:
- Giữ logic legacy đã hoạt động: category + (fieldId, value) + sort
- Mở rộng: advanced filters (16 sections) có thể chạy song song (AND)
- Event output tương thích để App đang nghe: 'filterapplied'

============================================================================ */

(function () {
  'use strict';

  // -------------------------------------------------------------------------
  // Constants (keep same conventions as v8.1.0-6-4)
  // -------------------------------------------------------------------------
  var EMPTY_LABEL = 'N/A';

  var DEFAULT_SORT = { field: 'productionDate', direction: 'desc' };

  // Giữ nguyên key để không mất state của người dùng khi nâng version
  var DEFAULT_STORAGE_KEY = 'moldcutter_filter_v8_1';

  // Các field legacy (giữ giống file v8.1.0-6-4)
  var FILTER_FIELDS = [
    { id: 'itemType', label: '種別 / Loại', get: function (it) { return it.itemType || it.type; } },
    { id: 'storageCompany', label: '保管会社 / Công ty giữ', get: function (it) {
      return (it.storageCompanyInfo && (it.storageCompanyInfo.CompanyShortName || it.storageCompanyInfo.CompanyName))
        || it.displayStorageCompany
        || it.storageCompany
        || '';
    } },
    { id: 'rackLocation', label: '棚位置 / Vị trí kệ', get: function (it) {
      return (it.rackInfo && it.rackInfo.RackLocation)
        || it.displayRackLocation
        || it.rackLocation
        || '';
    } },
    { id: 'rackId', label: '棚番号 / Mã kệ', get: function (it) {
      return (it.rackLayerInfo && it.rackLayerInfo.RackID)
        || (it.rackInfo && it.rackInfo.RackID)
        || it.rackId
        || '';
    } },
    { id: 'rackLayerId', label: '棚位置ID / Giá-Tầng (ID)', get: function (it) {
      return it.RackLayerID
        || (it.rackLayerInfo && it.rackLayerInfo.RackLayerID)
        || it.location
        || it.rackNo
        || '';
    } },
    { id: 'layerNum', label: '棚の段 / Tầng', get: function (it) {
      return (it.rackLayerInfo && (it.rackLayerInfo.RackLayerNumber || it.rackLayerInfo.RackLayerNo || it.rackLayerInfo.LayerNumber))
        || '';
    } },
    { id: 'drawing', label: '図番 / Mã bản vẽ', get: function (it) {
      var d = it.designInfo || {};
      return d.CustomerDrawingNo || d.DrawingNumber || d.drawingNumber || d.DrawingNo
        || it.CustomerDrawingNo || it.DrawingNumber || it.drawingNumber
        || '';
    } },
    { id: 'equip', label: '設備コード / Thiết bị', get: function (it) {
      var d = it.designInfo || {};
      return d.CustomerEquipmentNo || d.EquipmentCode || d.equipmentCode
        || it.CustomerEquipmentNo || it.EquipmentCode || it.equipmentCode
        || '';
    } },
    { id: 'plastic', label: '樹脂 / Loại nhựa', get: function (it) {
      var d = it.designInfo || {};
      return it.plasticType || d.DesignForPlasticType || d.PlasticType || '';
    } },
    { id: 'dim', label: '寸法 / Kích thước', get: function (it) {
      return it.displayDimensions || it.dimensions || it.displaySize || it.Size || it.Dimensions || '';
    } },
    { id: 'customer', label: '顧客名 / Khách hàng', get: function (it) {
      return (it.customerInfo && (it.customerInfo.CustomerShortName || it.customerInfo.CustomerName))
        || it.displayCustomer
        || '';
    } },
    { id: 'status', label: '状態 / Trạng thái', get: function (it) {
      return (it.latestStatusLog && it.latestStatusLog.Status)
        || it.lastStatus
        || null;
    } },
    { id: 'teflon', label: 'Teflon', get: function (it) {
      return it.teflonStatus
        || (it.latestTeflonLog && (it.latestTeflonLog.TeflonStatus || it.latestTeflonLog.Status))
        || it.TeflonCoating
        || null;
    } },
    { id: 'returning', label: '返却 / Returning', get: function (it) { return it.MoldReturning || ''; } },
    { id: 'disposing', label: '廃棄 / Disposing', get: function (it) { return it.MoldDisposing || ''; } }
  ];

  // -------------------------------------------------------------------------
  // Utilities (no DOM)
  // -------------------------------------------------------------------------
  function isObject(x) {
    return x && typeof x === 'object' && !Array.isArray(x);
  }

  function deepClone(obj) {
    try {
      return JSON.parse(JSON.stringify(obj));
    } catch (e) {
      // Fallback: shallow
      var out = {};
      for (var k in obj) out[k] = obj[k];
      return out;
    }
  }

  function normalizeText(val) {
    if (val === null || val === undefined) return '';
    var s = '';
    try { s = String(val); } catch (e) { return ''; }
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  function displayText(val) {
    var t = normalizeText(val);
    return t ? t : EMPTY_LABEL;
  }

  function toLowerSafe(val) {
    return normalizeText(val).toLowerCase();
  }

  function containsText(hay, needle) {
    var h = toLowerSafe(hay);
    var n = toLowerSafe(needle);
    if (!n) return true;
    return h.indexOf(n) !== -1;
  }

  function isTruthy(val) {
    if (val === true) return true;
    if (val === false) return false;
    var t = toLowerSafe(val);
    if (!t) return false;
    return (t === '1' || t === 'y' || t === 'yes' || t === 'true' || t === 'on' || t === 'ok'
      || t === '○' || t === 'はい' || t === '有' || t === 'あり');
  }

  // Natural compare: có số trong chuỗi (VD: A2 < A10)
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

  function parseDimensionNumbers(val) {
    var s = normalizeText(val);
    if (!s || s === EMPTY_LABEL) return null;

    // Chuẩn hoá ký tự phân cách
    var t = s.replace(/×/g, 'x').replace(/[X＊*]/g, 'x');

    // Lấy các số theo thứ tự xuất hiện (ưu tiên: L, W, H)
    var matches = t.match(/\d+(?:\.\d+)?/g) || [];
    var nums = [];
    for (var i = 0; i < matches.length; i++) {
      var n = parseFloat(matches[i]);
      if (!isNaN(n)) nums.push(n);
    }
    if (!nums.length) return null;
    return nums.slice(0, 3);
  }

  function compareDimensionsWithEmptyLast(a, b, multiplier) {
    var da = parseDimensionNumbers(a);
    var db = parseDimensionNumbers(b);

    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;

    for (var i = 0; i < 3; i++) {
      var av = (da[i] === undefined) ? null : da[i];
      var bv = (db[i] === undefined) ? null : db[i];
      if (av === null && bv === null) continue;
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av !== bv) return multiplier * (av - bv);
    }
    return 0;
  }

  function safeParseFloat(val) {
    if (val === null || val === undefined) return null;
    var s = normalizeText(val);
    if (!s) return null;
    var n = parseFloat(s);
    return isNaN(n) ? null : n;
  }

  function parseDateToTime(val) {
    // Hỗ trợ: yyyy-mm-dd, yyyy/mm/dd, hoặc string Date bình thường
    var s = normalizeText(val);
    if (!s) return null;

    // Nếu đã là Date
    if (val instanceof Date && !isNaN(val.getTime())) return val.getTime();

    // Chuẩn hoá separator
    s = s.replace(/\//g, '-');

    var t = Date.parse(s);
    if (!isNaN(t)) return t;

    // Fallback: thử cắt yyyy-mm-dd
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) {
      var yy = parseInt(m[1], 10);
      var mm = parseInt(m[2], 10) - 1;
      var dd = parseInt(m[3], 10);
      var d = new Date(yy, mm, dd);
      var tt = d.getTime();
      return isNaN(tt) ? null : tt;
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Item helpers (robust getters)
  // -------------------------------------------------------------------------
  function getItemId(item) {
    if (!item) return '';
    if (item.type === 'mold') return item.MoldID || item.displayCode || item.MoldCode || '';
    return item.CutterID || item.displayCode || item.CutterNo || '';
  }

  function getItemCode(item) {
    if (!item) return '';
    return item.type === 'mold' ? (item.MoldCode || '') : (item.CutterNo || '');
  }

  function getItemLocation(item) {
    if (!item) return '';
    return item.displayRackLocation || item.location || item.rackNo || item.rackLocation || '';
  }

  function getItemProductionDate(item) {
    if (!item) return '';
    // App hiện đang dùng: ProductionDate hoặc displayDate
    return item.ProductionDate || item.displayDate || item.productionDate || '';
  }

  function getItemDimensionText(item) {
    if (!item) return '';
    return item.displayDimensions || item.dimensions || item.displaySize || item.Size || item.Dimensions || '';
  }

  function getItemCustomerText(item) {
    if (!item) return '';
    return (item.customerInfo && (item.customerInfo.CustomerShortName || item.customerInfo.CustomerName))
      || item.displayCustomer
      || item.customer
      || '';
  }

  function getItemStorageCompanyText(item) {
    if (!item) return '';
    return (item.storageCompanyInfo && (item.storageCompanyInfo.CompanyShortName || item.storageCompanyInfo.CompanyName))
      || item.displayStorageCompany
      || item.storageCompany
      || '';
  }

  function getItemRackLayerId(item) {
    if (!item) return '';
    return item.RackLayerID
      || (item.rackLayerInfo && item.rackLayerInfo.RackLayerID)
      || item.location
      || item.rackNo
      || '';
  }

  function getItemRackLocation(item) {
    if (!item) return '';
    return (item.rackInfo && item.rackInfo.RackLocation)
      || item.displayRackLocation
      || item.rackLocation
      || '';
  }

  function getItemPlasticText(item) {
    var d = (item && item.designInfo) ? item.designInfo : {};
    return (item && item.plasticType) || d.DesignForPlasticType || d.PlasticType || '';
  }

  function getItemTrayInfoText(item) {
    var d = (item && item.designInfo) ? item.designInfo : {};
    return d.TrayInfoForMoldDesign || d.TrayInfo || item.TrayInfoForMoldDesign || item.trayInfo || '';
  }

  function getItemEngravingText(item) {
    var d = (item && item.designInfo) ? item.designInfo : {};
    // Rất nhiều hệ thống đặt tên khác nhau, ưu tiên các key phổ biến
    return d.TextContent || d.EngravingText || d.Engraving || d.Text
      || item.TextContent || item.EngravingText || item.Engraving
      || '';
  }

  function getItemSetupType(item) {
    var d = (item && item.designInfo) ? item.designInfo : {};
    return d.MoldSetupType || item.MoldSetupType || item.setupType || '';
  }

  function getItemOrientation(item) {
    var d = (item && item.designInfo) ? item.designInfo : {};
    return d.MoldOrientation || item.MoldOrientation || item.orientation || '';
  }

  function getItemDraftAngle(item) {
    var d = (item && item.designInfo) ? item.designInfo : {};
    return d.DraftAngle || item.DraftAngle || item.draftAngle || null;
  }

  function getItemUnderAngle(item) {
    var d = (item && item.designInfo) ? item.designInfo : {};
    return d.UnderAngle || item.UnderAngle || item.underAngle || '';
  }

  function getItemCutlineSizeText(item) {
    var d = (item && item.designInfo) ? item.designInfo : {};
    var x = d.CutlineX || item.CutlineX || null;
    var y = d.CutlineY || item.CutlineY || null;
    var xx = safeParseFloat(x);
    var yy = safeParseFloat(y);
    if (xx === null || yy === null) {
      // Nếu có sẵn string
      return d.CutlineSize || item.CutlineSize || '';
    }
    // Loại bỏ .0 cho gọn
    var sx = (Math.floor(xx) === xx) ? String(Math.floor(xx)) : String(xx);
    var sy = (Math.floor(yy) === yy) ? String(Math.floor(yy)) : String(yy);
    return sx + 'x' + sy;
  }

  function getItemStatus(item) {
    if (!item) return '';
    return (item.latestStatusLog && item.latestStatusLog.Status) || item.lastStatus || '';
  }

  function getItemTeflon(item) {
    if (!item) return '';
    return item.teflonStatus
      || (item.latestTeflonLog && (item.latestTeflonLog.TeflonStatus || item.latestTeflonLog.Status))
      || item.TeflonCoating
      || '';
  }

  // -------------------------------------------------------------------------
  // FilterCore
  // -------------------------------------------------------------------------
  function FilterCore(options) {
    options = options || {};

    this.storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
    this.defaultSort = options.defaultSort || deepClone(DEFAULT_SORT);

    this.filterFields = options.filterFields || FILTER_FIELDS.slice();

    this.state = this._createDefaultState();
    this.restoreState();
  }

  FilterCore.prototype._createDefaultState = function () {
    return {
      category: 'all',

      // Legacy quick filter (đã hoạt động)
      legacy: {
        fieldId: '',
        value: ''
      },

      sort: {
        field: this.defaultSort.field,
        direction: this.defaultSort.direction
      },

      // Advanced drawer filters (16 sections)
      advanced: {
        // 1) itemType (để thao tác nhanh trong drawer). Nếu set thì override category.
        itemType: '',

        // 2) customer
        customer: { select: '', text: '' },

        // 3) storageCompany
        storageCompany: { select: '', text: '' },

        // 4) rackLayer
        rackLayer: { select: '', text: '' },

        // 5) dimension
        dimension: {
          quickSelect: '',
          quickText: '',
          L: { min: null, max: null },
          W: { min: null, max: null }
        },

        // 6) productionDate
        productionDate: { from: '', to: '' },

        // 7) plastic
        plastic: { text: '' },

        // 8) engraving/textContent
        textContent: { text: '' },

        // 9) trayInfo
        trayInfo: { text: '' },

        // 10) setupType
        setupType: { selected: [] },

        // 11) orientation
        orientation: { selected: [] },

        // 12) draftAngle
        draftAngle: { min: null, max: null },

        // 13) underAngle
        underAngle: { select: '', text: '' },

        // 14) cutlineSize
        cutline: { select: '', text: '' },

        // 15) statusFlags
        statusFlags: {
          inventoryStatus: [],
          teflon: [],
          returning: null,   // null = ignore, true = require true
          disposing: null
        }
      }
    };
  };

  FilterCore.prototype.getState = function () {
    return deepClone(this.state);
  };

  FilterCore.prototype.setState = function (partial, opts) {
    opts = opts || {};
    if (!partial) return;

    // Merge nhẹ nhàng (không làm code rối)
    this._mergeInto(this.state, partial);

    if (!opts.silent) {
      this.saveState();
    }
  };

  FilterCore.prototype._mergeInto = function (target, source) {
    if (!isObject(target) || !isObject(source)) return;
    for (var k in source) {
      if (!Object.prototype.hasOwnProperty.call(source, k)) continue;
      var sv = source[k];
      if (isObject(sv)) {
        if (!isObject(target[k])) target[k] = {};
        this._mergeInto(target[k], sv);
      } else {
        target[k] = sv;
      }
    }
  };

  FilterCore.prototype.resetAll = function (opts) {
    opts = opts || {};
    this.state = this._createDefaultState();
    if (!opts.silent) this.saveState();
  };

  FilterCore.prototype.resetAdvanced = function (opts) {
    opts = opts || {};
    var def = this._createDefaultState();
    this.state.advanced = def.advanced;
    if (!opts.silent) this.saveState();
  };

  FilterCore.prototype.resetLegacy = function (opts) {
    opts = opts || {};
    var def = this._createDefaultState();
    this.state.legacy = def.legacy;
    if (!opts.silent) this.saveState();
  };

  FilterCore.prototype.resetSort = function (opts) {
    opts = opts || {};
    this.state.sort = { field: this.defaultSort.field, direction: this.defaultSort.direction };
    if (!opts.silent) this.saveState();
  };

  FilterCore.prototype.saveState = function () {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (e) {
      // ignore
    }
  };

  FilterCore.prototype.restoreState = function () {
    try {
      var raw = localStorage.getItem(this.storageKey);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed) return;

      // Merge vào default để tránh thiếu key khi nâng version
      var def = this._createDefaultState();
      this._mergeInto(def, parsed);
      this.state = def;
    } catch (e) {
      // ignore
    }
  };

  // -------------------------------------------------------------------------
  // Public apply
  // -------------------------------------------------------------------------
  FilterCore.prototype.apply = function (items, opts) {
    opts = opts || {};

    var list = Array.isArray(items) ? items.slice() : [];

    // 0) category (ưu tiên advanced.itemType nếu có)
    var cat = this.state.category || 'all';
    if (this.state.advanced && this.state.advanced.itemType) {
      var itv = normalizeText(this.state.advanced.itemType);
      if (itv && itv !== 'all') cat = itv;
      if (itv === 'all') cat = 'all';
    }

    if (cat !== 'all') {
      list = list.filter(function (it) {
        return (it && it.type) ? (it.type === cat) : false;
      });
    }

    // 1) legacy quick filter
    list = this._applyLegacyFilter(list);

    // 2) advanced drawer filters
    list = this._applyAdvancedFilters(list);

    // 3) sort
    list = this._sort(list);

    // 4) event
    if (opts.dispatch !== false) {
      this.dispatchApplied(list);
    }

    return list;
  };

  FilterCore.prototype.dispatchApplied = function (results) {
    try {
      var detail = {
        category: this.state.category || 'all',
        sort: {
          field: (this.state.sort && this.state.sort.field) ? this.state.sort.field : this.defaultSort.field,
          direction: (this.state.sort && this.state.sort.direction) ? this.state.sort.direction : this.defaultSort.direction
        },
        // App đang dùng: detail.results
        results: Array.isArray(results) ? results : [],
        // để UI/Debug dùng
        state: this.getState()
      };

      document.dispatchEvent(new CustomEvent('filterapplied', { detail: detail }));
    } catch (e) {
      // ignore
    }
  };

  // -------------------------------------------------------------------------
  // Legacy filter
  // -------------------------------------------------------------------------
  FilterCore.prototype._applyLegacyFilter = function (items) {
    var legacy = this.state.legacy || {};
    var fieldId = normalizeText(legacy.fieldId);
    var value = legacy.value;

    if (!fieldId) return items;

    var field = null;
    for (var i = 0; i < this.filterFields.length; i++) {
      if (this.filterFields[i].id === fieldId) { field = this.filterFields[i]; break; }
    }
    if (!field || typeof field.get !== 'function') return items;

    var valText = displayText(value);
    // Nếu người dùng chưa chọn giá trị
    if (!valText || valText === '-- Chọn --' || valText === '--' || valText === '—') return items;

    return items.filter(function (it) {
      var got = displayText(field.get(it));
      return got === valText;
    });
  };

  // -------------------------------------------------------------------------
  // Advanced filters
  // -------------------------------------------------------------------------
  FilterCore.prototype._applyAdvancedFilters = function (items) {
    var adv = this.state.advanced || {};
    var out = items;

    // 2) customer
    if (adv.customer) {
      var cusSel = normalizeText(adv.customer.select);
      var cusTxt = normalizeText(adv.customer.text);
      if (cusSel) {
        out = out.filter(function (it) {
          return displayText(getItemCustomerText(it)) === displayText(cusSel);
        });
      }
      if (cusTxt) {
        out = out.filter(function (it) {
          return containsText(getItemCustomerText(it), cusTxt);
        });
      }
    }

    // 3) storageCompany
    if (adv.storageCompany) {
      var stSel = normalizeText(adv.storageCompany.select);
      var stTxt = normalizeText(adv.storageCompany.text);
      if (stSel) {
        out = out.filter(function (it) {
          return displayText(getItemStorageCompanyText(it)) === displayText(stSel);
        });
      }
      if (stTxt) {
        out = out.filter(function (it) {
          return containsText(getItemStorageCompanyText(it), stTxt);
        });
      }
    }

    // 4) rackLayer
    if (adv.rackLayer) {
      var rlSel = normalizeText(adv.rackLayer.select);
      var rlTxt = normalizeText(adv.rackLayer.text);

      if (rlSel) {
        out = out.filter(function (it) {
          // Cho phép UI truyền: "RackLayerID" hoặc "RackLayerID <space> RackLocation"
          var id = normalizeText(getItemRackLayerId(it));
          var loc = normalizeText(getItemRackLocation(it));

          // tách id nếu string có phần location
          var expectId = rlSel;
          var m = rlSel.match(/^([^\s\-]+)\s*[-\s].+$/);
          if (m && m[1]) expectId = m[1].trim();

          // Ưu tiên match ID
          if (expectId && id && id === expectId) return true;

          // Nếu không match ID, thử match nguyên chuỗi vào location
          if (loc && (loc === rlSel || loc.indexOf(rlSel) !== -1)) return true;

          // Cuối cùng: match vào id (contains)
          if (id && id.indexOf(rlSel) !== -1) return true;

          return false;
        });
      }

      if (rlTxt) {
        out = out.filter(function (it) {
          return containsText(getItemRackLayerId(it) + ' ' + getItemRackLocation(it), rlTxt);
        });
      }
    }

    // 5) dimension
    if (adv.dimension) {
      var dqSel = normalizeText(adv.dimension.quickSelect);
      var dqTxt = normalizeText(adv.dimension.quickText);
      var Lmin = (adv.dimension.L && adv.dimension.L.min !== null && adv.dimension.L.min !== '') ? safeParseFloat(adv.dimension.L.min) : null;
      var Lmax = (adv.dimension.L && adv.dimension.L.max !== null && adv.dimension.L.max !== '') ? safeParseFloat(adv.dimension.L.max) : null;
      var Wmin = (adv.dimension.W && adv.dimension.W.min !== null && adv.dimension.W.min !== '') ? safeParseFloat(adv.dimension.W.min) : null;
      var Wmax = (adv.dimension.W && adv.dimension.W.max !== null && adv.dimension.W.max !== '') ? safeParseFloat(adv.dimension.W.max) : null;

      if (dqSel) {
        out = out.filter(function (it) {
          return displayText(getItemDimensionText(it)) === displayText(dqSel);
        });
      }

      if (dqTxt) {
        out = out.filter(function (it) {
          return containsText(getItemDimensionText(it), dqTxt);
        });
      }

      if (Lmin !== null || Lmax !== null || Wmin !== null || Wmax !== null) {
        out = out.filter(function (it) {
          var dim = getItemDimensionText(it);
          var nums = parseDimensionNumbers(dim);
          if (!nums) return false;
          var L = (nums[0] === undefined) ? null : nums[0];
          var W = (nums[1] === undefined) ? null : nums[1];

          if (Lmin !== null && (L === null || L < Lmin)) return false;
          if (Lmax !== null && (L === null || L > Lmax)) return false;
          if (Wmin !== null && (W === null || W < Wmin)) return false;
          if (Wmax !== null && (W === null || W > Wmax)) return false;
          return true;
        });
      }
    }

    // 6) productionDate range
    if (adv.productionDate) {
      var from = normalizeText(adv.productionDate.from);
      var to = normalizeText(adv.productionDate.to);
      var fromTime = from ? parseDateToTime(from) : null;
      var toTime = to ? parseDateToTime(to) : null;

      if (fromTime !== null || toTime !== null) {
        out = out.filter(function (it) {
          var t = parseDateToTime(getItemProductionDate(it));
          if (t === null) return false;
          if (fromTime !== null && t < fromTime) return false;
          if (toTime !== null) {
            // Inclusive đến cuối ngày
            var end = toTime + (24 * 60 * 60 * 1000) - 1;
            if (t > end) return false;
          }
          return true;
        });
      }
    }

    // 7) plastic contains
    if (adv.plastic && normalizeText(adv.plastic.text)) {
      var ptxt = normalizeText(adv.plastic.text);
      out = out.filter(function (it) {
        return containsText(getItemPlasticText(it), ptxt);
      });
    }

    // 8) textContent (engraving) contains
    if (adv.textContent && normalizeText(adv.textContent.text)) {
      var etxt = normalizeText(adv.textContent.text);
      out = out.filter(function (it) {
        return containsText(getItemEngravingText(it), etxt);
      });
    }

    // 9) trayInfo contains
    if (adv.trayInfo && normalizeText(adv.trayInfo.text)) {
      var ttxt = normalizeText(adv.trayInfo.text);
      out = out.filter(function (it) {
        return containsText(getItemTrayInfoText(it), ttxt);
      });
    }

    // 10) setupType checkboxes (OR within selected, AND with others)
    if (adv.setupType && Array.isArray(adv.setupType.selected) && adv.setupType.selected.length) {
      var setupSet = {};
      adv.setupType.selected.forEach(function (v) { setupSet[displayText(v)] = true; });
      out = out.filter(function (it) {
        var v = displayText(getItemSetupType(it));
        return !!setupSet[v];
      });
    }

    // 11) orientation checkboxes
    if (adv.orientation && Array.isArray(adv.orientation.selected) && adv.orientation.selected.length) {
      var oriSet = {};
      adv.orientation.selected.forEach(function (v) { oriSet[displayText(v)] = true; });
      out = out.filter(function (it) {
        var v = displayText(getItemOrientation(it));
        return !!oriSet[v];
      });
    }

    // 12) draftAngle range
    if (adv.draftAngle) {
      var dmin = (adv.draftAngle.min !== null && adv.draftAngle.min !== '') ? safeParseFloat(adv.draftAngle.min) : null;
      var dmax = (adv.draftAngle.max !== null && adv.draftAngle.max !== '') ? safeParseFloat(adv.draftAngle.max) : null;
      if (dmin !== null || dmax !== null) {
        out = out.filter(function (it) {
          var v = safeParseFloat(getItemDraftAngle(it));
          if (v === null) return false;
          if (dmin !== null && v < dmin) return false;
          if (dmax !== null && v > dmax) return false;
          return true;
        });
      }
    }

    // 13) underAngle (select exact + text contains)
    if (adv.underAngle) {
      var uaSel = normalizeText(adv.underAngle.select);
      var uaTxt = normalizeText(adv.underAngle.text);
      if (uaSel) {
        out = out.filter(function (it) {
          return displayText(getItemUnderAngle(it)) === displayText(uaSel);
        });
      }
      if (uaTxt) {
        out = out.filter(function (it) {
          return containsText(getItemUnderAngle(it), uaTxt);
        });
      }
    }

    // 14) cutline size
    if (adv.cutline) {
      var clSel = normalizeText(adv.cutline.select);
      var clTxt = normalizeText(adv.cutline.text);
      if (clSel) {
        out = out.filter(function (it) {
          return displayText(getItemCutlineSizeText(it)) === displayText(clSel);
        });
      }
      if (clTxt) {
        out = out.filter(function (it) {
          return containsText(getItemCutlineSizeText(it), clTxt);
        });
      }
    }

    // 15) status flags
    if (adv.statusFlags) {
      // inventory status (statuslogs)
      if (Array.isArray(adv.statusFlags.inventoryStatus) && adv.statusFlags.inventoryStatus.length) {
        var stSet = {};
        adv.statusFlags.inventoryStatus.forEach(function (v) { stSet[displayText(v)] = true; });
        out = out.filter(function (it) {
          var st = displayText(getItemStatus(it));
          return !!stSet[st];
        });
      }

      // teflon
      if (Array.isArray(adv.statusFlags.teflon) && adv.statusFlags.teflon.length) {
        var tfSet = {};
        adv.statusFlags.teflon.forEach(function (v) { tfSet[displayText(v)] = true; });
        out = out.filter(function (it) {
          var tf = displayText(getItemTeflon(it));
          return !!tfSet[tf];
        });
      }

      // returning / disposing
      if (adv.statusFlags.returning === true) {
        out = out.filter(function (it) { return isTruthy(it && it.MoldReturning); });
      }
      if (adv.statusFlags.disposing === true) {
        out = out.filter(function (it) { return isTruthy(it && it.MoldDisposing); });
      }
    }

    return out;
  };

  // -------------------------------------------------------------------------
  // Sorting
  // -------------------------------------------------------------------------
  FilterCore.prototype._sort = function (items) {
    var sort = this.state.sort || {};
    var field = normalizeText(sort.field) || this.defaultSort.field;
    var dir = (normalizeText(sort.direction) || this.defaultSort.direction).toLowerCase();
    var mul = (dir === 'asc') ? 1 : -1;

    var arr = Array.isArray(items) ? items.slice() : [];

    arr.sort(function (a, b) {
      if (field === 'productionDate') {
        var ta = parseDateToTime(getItemProductionDate(a));
        var tb = parseDateToTime(getItemProductionDate(b));
        // đẩy rỗng xuống cuối
        if (ta === null && tb === null) return 0;
        if (ta === null) return 1;
        if (tb === null) return -1;
        return mul * (ta - tb);
      }

      if (field === 'id') {
        return mul * naturalCompare(getItemId(a), getItemId(b));
      }

      if (field === 'code') {
        return mul * naturalCompare(getItemCode(a), getItemCode(b));
      }

      if (field === 'location') {
        return mul * naturalCompare(getItemLocation(a), getItemLocation(b));
      }

      if (field === 'size') {
        return compareDimensionsWithEmptyLast(getItemDimensionText(a), getItemDimensionText(b), mul);
      }

      // fallback: không đổi
      return 0;
    });

    return arr;
  };

  // -------------------------------------------------------------------------
  // Small helper API for UI
  // -------------------------------------------------------------------------
  FilterCore.prototype.setLegacyFilter = function (fieldId, value, opts) {
    opts = opts || {};
    this.state.legacy.fieldId = normalizeText(fieldId);
    this.state.legacy.value = value;
    if (!opts.silent) this.saveState();
  };

  FilterCore.prototype.setCategory = function (category, opts) {
    opts = opts || {};
    this.state.category = normalizeText(category) || 'all';
    if (!opts.silent) this.saveState();
  };

  FilterCore.prototype.setSort = function (field, direction, opts) {
    opts = opts || {};
    this.state.sort.field = normalizeText(field) || this.defaultSort.field;
    this.state.sort.direction = normalizeText(direction) || this.defaultSort.direction;
    if (!opts.silent) this.saveState();
  };

  FilterCore.prototype.setAdvanced = function (key, value, opts) {
    opts = opts || {};
    if (!this.state.advanced) this.state.advanced = {};
    this.state.advanced[key] = value;
    if (!opts.silent) this.saveState();
  };

  // -------------------------------------------------------------------------
  // Export
  // -------------------------------------------------------------------------
  window.FilterCore = FilterCore;
  window.FilterCoreDefaults = {
    EMPTY_LABEL: EMPTY_LABEL,
    DEFAULT_SORT: deepClone(DEFAULT_SORT),
    STORAGE_KEY: DEFAULT_STORAGE_KEY,
    FILTER_FIELDS: FILTER_FIELDS.slice()
  };

})();

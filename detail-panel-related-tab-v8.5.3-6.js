/**
 * detail-panel-related-tab-v8.4.5.js
 * Detail Panel Related Tab Module - Windows-style Detail default + bilingual headers + built-in photo viewer
 * MoldCutterSearch
 *
 * Update v8.4.5:
 * - Mặc định hiển thị dạng Chi tiết (detail).
 * - Header bảng dạng song ngữ: Nhật (trên) / Việt (dưới).
 * - Kích thước thumbnail trong bảng chi tiết theo Tab Ảnh (44x44).
 * - Click vào thumbnail: mở ảnh lớn ngay trong giao diện (popup viewer, fit khung).
 * - Click vào ảnh trong viewer: toggle zoom kích thước thật (scroll như Photo Viewer Windows).
 * - Fix lỗi lặp tiêu đề (toolbar chỉ render 1 lần).
 *
 * Host (DetailPanel) cung cấp:
 * - dp.currentItem, dp.currentItemType
 * - dp.getRelatedCuttersForMold(mold), dp.getSharedMoldsForCutter(cutter)
 * - dp.openPreview(item, itemType) (có sẵn trong detail-panel-v8.4.2.js)
 *
 * Depends (optional):
 * - window.DevicePhotoStore.getThumbnailForDevice(deviceType, deviceId)
 * - window.DevicePhotoStore.getLatestActivePhotoForDevice(deviceType, deviceId)
 * - window.DataManager.data (statuslogs, racklayers, racks)
 */

(function (global) {
  'use strict';

  var VERSION = 'v8.4.5';

  // -------------------- basic helpers --------------------
  function safeStr(v) {
    return (v === null || v === undefined) ? '' : String(v);
  }

  function trimStr(v) {
    return safeStr(v).trim();
  }

  function escHtml(str) {
    return safeStr(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toLower(v) {
    return safeStr(v).toLowerCase();
  }

  function fmtDateYMD(val) {
    try {
      if (!val) return '-';
      var d = new Date(val);
      if (isNaN(d.getTime())) return safeStr(val);
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var dd = String(d.getDate()).padStart(2, '0');
      return y + '.' + m + '.' + dd;
    } catch (e) {
      return safeStr(val) || '-';
    }
  }

  function getCurrentItemType(dp) {
    try {
      return dp && dp.currentItemType ? String(dp.currentItemType).toLowerCase() : 'mold';
    } catch (e) {
      return 'mold';
    }
  }

  function getCurrentItem(dp) {
    try {
      return dp && dp.currentItem ? dp.currentItem : null;
    } catch (e) {
      return null;
    }
  }

  // -------------------- per-record view state --------------------
  function recordKey(dp) {
    try {
      var t = getCurrentItemType(dp);
      var it = getCurrentItem(dp);
      if (!it) return t + ':none';
      var id = (t === 'cutter')
        ? trimStr(it.CutterID || it.ID || it.CutterNo || it.CutterCode)
        : trimStr(it.MoldID || it.ID || it.MoldCode || it.MoldNo);
      return t + ':' + safeStr(id);
    } catch (e) {
      return 'mold:none';
    }
  }

  function ensureStateForRecord(dp) {
    if (!dp) return;
    var key = recordKey(dp);
    if (dp.dprLastRecordKey !== key) {
      dp.dprLastRecordKey = key;
      dp.dprViewKey = key;
      // yêu cầu: mặc định dạng chi tiết
      dp.dprView = 'detail';
      dp.dprCache = null;
    }
  }

  function getView(dp) {
    if (!dp) return 'detail';
    if (dp.dprViewKey !== recordKey(dp)) return 'detail';
    return (dp.dprView === 'grid') ? 'grid' : 'detail';
  }

  function setView(dp, v) {
    if (!dp) return;
    dp.dprViewKey = recordKey(dp);
    dp.dprView = (v === 'grid') ? 'grid' : 'detail';
  }

  // -------------------- data mapping helpers --------------------
  function getList(dp, item, itemType) {
    try {
      if (!dp || !item) return [];
      var t = String(itemType || '').toLowerCase();
      if (t === 'mold') {
        if (typeof dp.getRelatedCuttersForMold === 'function') return dp.getRelatedCuttersForMold(item) || [];
        if (Array.isArray(item.relatedCutters)) return item.relatedCutters;
        return [];
      }
      // cutter => shared molds
      if (typeof dp.getSharedMoldsForCutter === 'function') return dp.getSharedMoldsForCutter(item) || [];
      if (Array.isArray(item.relatedMolds)) return item.relatedMolds;
      return [];
    } catch (e) {
      return [];
    }
  }

  function getRowItemType(itemType) {
    return (String(itemType).toLowerCase() === 'mold') ? 'cutter' : 'mold';
  }

  function getTitle(itemType) {
    return (String(itemType).toLowerCase() === 'mold') ? 'Dao cắt liên quan' : 'Khuôn liên quan';
  }

  function getRowId(row, rowType) {
    try {
      var t = String(rowType).toLowerCase();
      if (t === 'cutter') return trimStr(row && (row.CutterID || row.ID || row.CutterNo || row.CutterCode));
      return trimStr(row && (row.MoldID || row.ID || row.MoldCode || row.MoldNo));
    } catch (e) {
      return '';
    }
  }

  function getRowCode(row, rowType) {
    try {
      var t = String(rowType).toLowerCase();
      if (t === 'cutter') return trimStr(row && (row.CutterNo || row.CutterCode || row.code || row.Code || row.CutterID || row.ID));
      return trimStr(row && (row.MoldCode || row.MoldNo || row.code || row.Code || row.MoldID || row.ID));
    } catch (e) {
      return '';
    }
  }

  function getRowName(row, rowType) {
    try {
      var t = String(rowType).toLowerCase();
      if (t === 'cutter') return trimStr(row && (row.CutterName || row.CutterDesignName || row.Name || row.DisplayName || row.ProductName));
      return trimStr(row && (row.MoldName || row.MoldDesignName || row.Name || row.DisplayName || row.ProductName));
    } catch (e) {
      return '';
    }
  }

  function getRowDimensions(row) {
    try {
      if (!row) return '-';
      var s = trimStr(row.dimensions || row.displaySize || row.Size || row.Dimensions);
      if (s) return s;

      var l = trimStr(row.DimensionsLength || row.DimLength || row.Length || row.L || row.dimension_l || row.dimensionL);
      var w = trimStr(row.DimensionsWidth || row.DimWidth || row.Width || row.W || row.dimension_w || row.dimensionW);
      var h = trimStr(row.DimensionsDepth || row.DimDepth || row.Height || row.H || row.Depth || row.D || row.dimension_h || row.dimensionH);

      var parts = [l, w, h].filter(function (x) { return !!trimStr(x); });
      if (parts.length >= 2) return parts.join('x');

      s = trimStr(row.Dim || row.Dimension || row.DimText || row.MoldSize || row.CutterSize);
      return s || '-';
    } catch (e) {
      return '-';
    }
  }

  // Chuyển số Giá thành ký tự tròn kiểu ㊿
  function toCircledNumber(n) {
    var num = Number(n);
    if (!Number.isFinite(num)) return null;
    var i = Math.floor(num);

    // Unicode ⓵ (0x245F + 1) đến ⓶⓪ (0x245F + 20)
    if (i >= 1 && i <= 20) {
      return String.fromCharCode(0x245F + i);
    }
    // Ngoài khoảng 1–20 thì trả về số thường
    return String(i);
  }

  function getRackLocation(row) {
    try {
      if (!global.DataManager || !global.DataManager.data) {
        return { display: '-', rackId: null, layerNum: null, rackLayerId: null, rackLayerText: '-' };
      }

      var rackLayerId = row ? row.RackLayerID : null;
      if (!rackLayerId) {
        return { display: '-', rackId: null, layerNum: null, rackLayerId: null, rackLayerText: '-' };
      }

      var rl = global.DataManager.data.racklayers && global.DataManager.data.racklayers.find(function (x) {
        return String(x.RackLayerID).trim() === String(rackLayerId).trim();
      });
      if (!rl) {
        return { display: '-', rackId: null, layerNum: null, rackLayerId: rackLayerId, rackLayerText: '-' };
      }

      var rackId = rl.RackID;
      var layerNum = rl.RackLayerNumber;

      var rack = global.DataManager.data.racks && global.DataManager.data.racks.find(function (r) {
        return String(r.RackID).trim() === String(rackId).trim();
      });

      // Giá (số kệ) dùng cho badge ㊿-1
      var rackNum = rack && (rack.RackNumber || rack.RackSymbol || rack.RackID || rackId);

      // Vị trí giá: ưu tiên RackLocation, sau đó RackName / RackCode
      var rackName =
        rack && (rack.RackLocation || rack.RackName || rack.RackCode || rackNum);

      var rackLocationText =
        (rackName ? String(rackName) : String(rackId)) + '-' + String(layerNum);

      // Giá - tầng hiển thị dạng ㊿-1
      var circle = toCircledNumber(rackNum);
      var rackLayerText =
        (circle || String(rackNum || '-')) +
        (layerNum != null ? '-' + String(layerNum) : '');

      return {
        display: rackLocationText,
        rackId: rackId,
        layerNum: layerNum,
        rackLayerId: rackLayerId,
        rackLayerText: rackLayerText
      };
    } catch (e) {
      return { display: '-', rackId: null, layerNum: null, rackLayerId: null, rackLayerText: '-' };
    }
  }

  function getLatestStatus(row, rowType) {
    try {
      if (!global.DataManager || !global.DataManager.data || !Array.isArray(global.DataManager.data.statuslogs)) {
        return { status: null, date: null };
      }
      var id = getRowId(row, rowType);
      if (!id) return { status: null, date: null };

      var idField = (String(rowType).toLowerCase() === 'mold') ? 'MoldID' : 'CutterID';

      var logs = global.DataManager.data.statuslogs.filter(function (log) {
        try {
          return String(log[idField]).trim() === String(id).trim();
        } catch (e) {
          return false;
        }
      });
      if (!logs.length) return { status: null, date: null };

      logs.sort(function (a, b) {
        var ta = Date.parse(a.Timestamp || a.Date || 0) || 0;
        var tb = Date.parse(b.Timestamp || b.Date || 0) || 0;
        return tb - ta;
      });

      var latest = logs[0];
      return { status: latest ? (latest.Status || latest.Action || null) : null, date: latest ? (latest.Timestamp || latest.Date || null) : null };
    } catch (e) {
      return { status: null, date: null };
    }
  }

  function getStatusLabel(status) {
    if (!status) return '-';
    var s = String(status).toUpperCase();
    var labels = {
      'IN': 'IN',
      'OUT': 'OUT',
      'AUDIT': 'AUDIT',
      'DISPOSED': 'DISPOSED',
      'RETURNED': 'RETURNED'
    };
    return labels[s] || String(status);
  }

  function getStatusClass(status) {
    var s = toLower(status);
    if (!s) return 'dpr-status-unknown';
    if (s.indexOf('in') === 0) return 'dpr-status-in';
    if (s.indexOf('out') === 0) return 'dpr-status-out';
    if (s.indexOf('audit') === 0) return 'dpr-status-audit';
    if (s.indexOf('dispose') === 0) return 'dpr-status-danger';
    if (s.indexOf('return') === 0) return 'dpr-status-return';
    return 'dpr-status-unknown';
  }

  // -------------------- thumbnail hydrate (DevicePhotoStore) --------------------
  var thumbUrlCache = new Map();
  var thumbPromiseCache = new Map();
  var hydrateTimer = null;

  function scheduleHydrate(scopeEl) {
    if (!scopeEl) return;
    if (hydrateTimer) clearTimeout(hydrateTimer);
    hydrateTimer = setTimeout(function () {
      hydrateTimer = null;
      hydrateThumbnails(scopeEl);
    }, 80);
  }

  async function hydrateThumbnails(scopeEl) {
    try {
      if (!scopeEl || !scopeEl.isConnected) return;
      if (!global.DevicePhotoStore || typeof global.DevicePhotoStore.getThumbnailForDevice !== 'function') return;

      var imgs = scopeEl.querySelectorAll('img.dpr-thumb-img[data-devicetype][data-deviceid]');
      for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        if (!img || !img.isConnected) continue;
        if (img.dataset.dprHydrated === '1') continue;

        var dt = trimStr(img.dataset.devicetype);
        var did = trimStr(img.dataset.deviceid);
        if (!dt || !did) continue;

        var key = dt + ':' + did;

        if (thumbUrlCache.has(key)) {
          applyThumb(img, thumbUrlCache.get(key));
          continue;
        }

        if (thumbPromiseCache.has(key)) {
          try {
            var u0 = await thumbPromiseCache.get(key);
            applyThumb(img, u0);
          } catch (e0) {
            applyThumb(img, '');
          }
          continue;
        }

        var p = (async function () {
          try {
            var row = await global.DevicePhotoStore.getThumbnailForDevice(dt, did);
            var url = row ? String(row.thumbnailurl || row.thumbnailUrl || row.thumbnailpublicurl || row.thumbpublicurl || row.publicurl || row.publicUrl || '').trim() : '';
            thumbUrlCache.set(key, url);
            return url;
          } catch (e) {
            thumbUrlCache.set(key, '');
            return '';
          } finally {
            thumbPromiseCache.delete(key);
          }
        })();

        thumbPromiseCache.set(key, p);
        var u = await p;
        applyThumb(img, u);
      }
    } catch (e) {
      // silent
    }
  }

  function applyThumb(img, url) {
    try {
      if (!img || !img.isConnected) return;
      var wrap = img.closest('.dpr-thumb-wrap');
      var ph = wrap ? wrap.querySelector('.dpr-thumb-ph') : null;

      img.dataset.dprHydrated = '1';

      if (!url) {
        img.style.display = 'none';
        try { img.removeAttribute('src'); } catch (e0) {}
        if (ph) ph.style.display = 'flex';
        return;
      }

      img.onerror = function () {
        try { img.style.display = 'none'; } catch (e1) {}
        if (ph) ph.style.display = 'flex';
      };

      img.onload = function () {
        try { img.style.display = 'block'; } catch (e2) {}
        if (ph) ph.style.display = 'none';
      };

      if (img.getAttribute('src') !== url) img.src = url;
    } catch (e) {
      // silent
    }
  }

  // -------------------- built-in photo viewer --------------------
  var viewer = {
    mounted: false,
    open: false,
    zoom: false,
    lastFocus: null
  };

  function viewerEnsure() {
    try {
      if (viewer.mounted) return;

      var div = document.createElement('div');
      div.innerHTML = (
        '<div class="dpr-viewer dpr-hidden" id="dprViewer" role="dialog" aria-modal="true">' +
          '<div class="dpr-vw-backdrop" data-dpr-vw-action="close"></div>' +
          '<div class="dpr-vw-panel" role="document">' +
            '<div class="dpr-vw-header">' +
              '<div class="dpr-vw-title">' +
                '<div class="dpr-vw-name" id="dprVwName">Ảnh</div>' +
                '<div class="dpr-vw-meta" id="dprVwMeta">Click ảnh để zoom kích thước thật</div>' +
              '</div>' +
              '<div class="dpr-vw-actions">' +
                '<button type="button" class="dpr-vw-btn" id="dprVwZoomBtn" data-dpr-vw-action="toggle-zoom" title="Zoom"><i class="fas fa-search-plus"></i></button>' +
                '<button type="button" class="dpr-vw-btn dpr-vw-close" data-dpr-vw-action="close" title="Đóng"><i class="fas fa-times"></i></button>' +
              '</div>' +
            '</div>' +
            '<div class="dpr-vw-body" id="dprVwBody">' +
              '<div class="dpr-vw-stage" id="dprVwStage">' +
                '<img class="dpr-vw-img" id="dprVwImg" alt="image" />' +
                '<div class="dpr-vw-loading dpr-hidden" id="dprVwLoading"><i class="fas fa-spinner fa-spin"></i><span>Đang tải...</span></div>' +
                '<div class="dpr-vw-error dpr-hidden" id="dprVwError"><i class="fas fa-exclamation-circle"></i><span>Không tải được ảnh</span></div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>'
      );

      while (div.firstChild) document.body.appendChild(div.firstChild);

      var root = document.getElementById('dprViewer');
      var img = document.getElementById('dprVwImg');
      var zoomBtn = document.getElementById('dprVwZoomBtn');

      function close() {
        viewerClose();
      }

      root.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest ? e.target.closest('[data-dpr-vw-action]') : null;
        if (!btn) return;
        var act = btn.getAttribute('data-dpr-vw-action');
        if (act === 'close') {
          e.preventDefault();
          e.stopPropagation();
          close();
          return;
        }
        if (act === 'toggle-zoom') {
          e.preventDefault();
          e.stopPropagation();
          viewerToggleZoom();
          return;
        }
      });

      // click on image => toggle zoom
      img.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        viewerToggleZoom();
      });

      document.addEventListener('keydown', function (e) {
        try {
          if (!viewer.open) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            viewerClose();
            return;
          }
          if (e.key === 'Enter') {
            // Enter => toggle zoom (như double action)
            viewerToggleZoom();
            return;
          }
        } catch (err) {}
      });

      // prevent background scroll when open
      viewer.mounted = true;

      // ensure button reflect state
      function syncZoomBtn() {
        var icon = zoomBtn ? zoomBtn.querySelector('i') : null;
        if (!icon) return;
        icon.className = viewer.zoom ? 'fas fa-search-minus' : 'fas fa-search-plus';
      }
      viewer._syncZoomBtn = syncZoomBtn;

    } catch (e) {
      // silent
    }
  }

  function viewerSetLoading(isLoading, isError) {
    try {
      var ld = document.getElementById('dprVwLoading');
      var er = document.getElementById('dprVwError');
      if (ld) ld.classList.toggle('dpr-hidden', !isLoading);
      if (er) er.classList.toggle('dpr-hidden', !isError);
    } catch (e) {}
  }

  function viewerSetText(name, meta) {
    try {
      var n = document.getElementById('dprVwName');
      var m = document.getElementById('dprVwMeta');
      if (n) n.textContent = name || 'Ảnh';
      if (m) m.textContent = meta || 'Click ảnh để zoom kích thước thật';
    } catch (e) {}
  }

  function viewerSetZoom(zoomOn) {
    try {
      viewer.zoom = !!zoomOn;
      var root = document.getElementById('dprViewer');
      if (root) root.classList.toggle('dpr-vw-zoom', viewer.zoom);
      if (viewer._syncZoomBtn) viewer._syncZoomBtn();

      // hint text
      viewerSetText(
        document.getElementById('dprVwName') ? document.getElementById('dprVwName').textContent : 'Ảnh',
        viewer.zoom ? 'Đang zoom 1:1 (kéo/scroll để xem) - Click ảnh để thu nhỏ' : 'Fit khung - Click ảnh để zoom kích thước thật'
      );
    } catch (e) {}
  }

  function viewerToggleZoom() {
    viewerSetZoom(!viewer.zoom);
  }

  function viewerOpen(opts) {
    try {
      viewerEnsure();

      var root = document.getElementById('dprViewer');
      var img = document.getElementById('dprVwImg');
      if (!root || !img) return;

      viewer.lastFocus = document.activeElement;

      viewer.open = true;
      viewerSetZoom(false);

      root.classList.remove('dpr-hidden');
      requestAnimationFrame(function () {
        try { root.classList.add('dpr-show'); } catch (e0) {}
      });

      // text
      viewerSetText(opts && opts.title ? opts.title : 'Ảnh', 'Fit khung - Click ảnh để zoom kích thước thật');

      // load
      viewerSetLoading(true, false);
      img.style.opacity = '0';

      img.onload = function () {
        try { img.style.opacity = '1'; } catch (e1) {}
        viewerSetLoading(false, false);
      };
      img.onerror = function () {
        viewerSetLoading(false, true);
      };

      var url = opts && opts.url ? String(opts.url).trim() : '';
      if (!url) {
        viewerSetLoading(false, true);
        try { img.removeAttribute('src'); } catch (e2) {}
      } else {
        img.src = url;
      }

      // lock background scroll
      try { document.body.classList.add('dpr-vw-lock'); } catch (e3) {}

    } catch (e) {
      // silent
    }
  }

  function viewerClose() {
    try {
      var root = document.getElementById('dprViewer');
      if (!root) return;
      viewer.open = false;
      viewerSetZoom(false);
      root.classList.remove('dpr-show');
      setTimeout(function () {
        try { root.classList.add('dpr-hidden'); } catch (e0) {}
      }, 160);
      try { document.body.classList.remove('dpr-vw-lock'); } catch (e1) {}
      try {
        if (viewer.lastFocus && typeof viewer.lastFocus.focus === 'function') viewer.lastFocus.focus();
      } catch (e2) {}
    } catch (e) {}
  }

  async function getFullImageUrlForDevice(deviceType, deviceId) {
    try {
      if (!global.DevicePhotoStore) return '';
      var dt = String(deviceType || '').toLowerCase();
      var did = String(deviceId || '').trim();
      if (!dt || !did) return '';

      // try thumbnail API first (nhiều hệ thống trả kèm row có public url)
      if (typeof global.DevicePhotoStore.getThumbnailForDevice === 'function') {
        try {
          var row = await global.DevicePhotoStore.getThumbnailForDevice(dt, did);
          var full = row ? String(row.publicurl || row.publicUrl || '').trim() : '';
          if (full) return full;
        } catch (e0) {}
      }

      // fallback: latest active
      if (typeof global.DevicePhotoStore.getLatestActivePhotoForDevice === 'function') {
        try {
          var row2 = await global.DevicePhotoStore.getLatestActivePhotoForDevice(dt, did);
          var full2 = row2 ? String(row2.publicurl || row2.publicUrl || '').trim() : '';
          if (full2) return full2;
        } catch (e1) {}
      }

      return '';
    } catch (e) {
      return '';
    }
  }

  // -------------------- UI styles --------------------
  function injectStyles() {
    try {
      var styleId = 'dpr-styles-v845';
      if (document.getElementById(styleId)) return;
      var st = document.createElement('style');
      st.id = styleId;
      st.type = 'text/css';
      st.textContent = [
        '/* Related tab v8.4.5 */',
        '.dpr-section{padding:0 !important;border:none !important;}',
        '.dpr-toolbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:8px 10px;background:var(--bg-sidebar,#f8fafc);border-radius:10px 10px 0 0;border-bottom:1px solid var(--border-color,#e5e9f2);}',
        '.dpr-toolbar-title{display:flex;align-items:center;gap:7px;font-weight:800;font-size:13px;color:var(--text-primary,#0b1220);}',
        '.dpr-count{background:rgba(15,118,110,0.10);border:1px solid rgba(15,118,110,0.20);color:rgba(15,118,110,0.95);border-radius:999px;padding:2px 10px;font-size:11px;font-weight:900;}',
        '.dpr-toolbar-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}',
        '.dpr-view-switcher{display:flex;gap:2px;border-left:1px solid var(--border-color,#e5e9f2);padding-left:6px;}',
        '.dpr-view-btn{width:28px;height:28px;border:1px solid var(--border-color,#e5e9f2);background:transparent;color:var(--text-secondary,#1f2937);border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;transition:background .15s,color .15s,border-color .15s;}',
        '.dpr-view-btn:hover,.dpr-view-btn.dpr-view-active{background:var(--ui-accent,#0F766E);border-color:var(--ui-accent,#0F766E);color:#fff;}',
        '[data-dp-related-host]{transition:opacity .12s ease;}',
        '.dpr-host-fading{opacity:.25;}',
        '@media (prefers-reduced-motion: reduce){[data-dp-related-host]{transition:none;}}',
        '',
        '/* Bilingual header (JA above / VI below) */',
        '.dpr-th-label{display:flex;flex-direction:column;gap:2px;min-width:0;}',
        '.dpr-ja{font-size:10px;font-weight:750;line-height:1.05;color:rgba(17,24,39,0.92);}',
        '.dpr-vi{font-size:9px;font-weight:600;line-height:1.05;color:rgba(71,85,105,0.82);}',
        '',
        '/* GRID */',
        '.dpr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(175px,1fr));gap:10px;padding:10px;}',
        '.dpr-card{border:1px solid var(--border-color,#e5e9f2);border-radius:12px;overflow:hidden;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.05);cursor:pointer;transition:box-shadow .15s, transform .15s, border-color .15s;user-select:none;}',
        '.dpr-card:hover{border-color:rgba(15,118,110,0.35);box-shadow:0 6px 18px rgba(0,0,0,.10);transform:translateY(-1px);}',
        '.dpr-thumb-wrap{background:var(--bg-sidebar,#f8fafc);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;}',
        '.dpr-thumb-wrap-card{height:124px;}',
        '.dpr-thumb-img{width:100%;height:100%;object-fit:contain;display:none;background:transparent;cursor:pointer;}',
        '.dpr-thumb-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:28px;}',
        '.dpr-card-body{padding:8px 10px 10px;}',
        '.dpr-code{font-size:12px;font-weight:900;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:2px;}',
        '.dpr-name{font-size:11px;font-weight:700;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:6px;}',
        '.dpr-meta{display:flex;flex-direction:column;gap:4px;font-size:10.5px;color:#475569;}',
        '.dpr-meta-row{display:flex;align-items:center;gap:6px;min-width:0;}',
        '.dpr-meta-row i{width:14px;text-align:center;color:#64748b;flex:0 0 auto;}',
        '.dpr-meta-row span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.dpr-status-badge{display:inline-flex;align-items:center;gap:6px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:900;border:1px solid rgba(2,6,23,0.10);background:rgba(2,6,23,0.04);color:#334155;}',
        '.dpr-status-in{background:rgba(16,185,129,0.10);border-color:rgba(16,185,129,0.22);color:#047857;}',
        '.dpr-status-out{background:rgba(239,68,68,0.10);border-color:rgba(239,68,68,0.22);color:#b91c1c;}',
        '.dpr-status-audit{background:rgba(59,130,246,0.10);border-color:rgba(59,130,246,0.22);color:#1d4ed8;}',
        '.dpr-status-return{background:rgba(245,158,11,0.12);border-color:rgba(245,158,11,0.22);color:#b45309;}',
        '.dpr-status-danger{background:rgba(220,38,38,0.12);border-color:rgba(220,38,38,0.24);color:#991b1b;}',
        '.dpr-status-unknown{background:rgba(100,116,139,0.10);border-color:rgba(100,116,139,0.22);color:#475569;}',
        '',
        '/* DETAIL (Windows Explorer list) */',
        '.dpr-detail{padding:8px 10px 10px;}',
        '.dpr-detail-table{width:100%;border-collapse:collapse;font-size:12px;}',
        '.dpr-detail-table thead th{position:sticky;top:0;background:var(--bg-sidebar,#f8fafc);border-bottom:2px solid var(--border-color,#e5e9f2);padding:7px 10px;text-align:left;font-weight:900;color:#334155;white-space:nowrap;z-index:2;}',
        '.dpr-detail-table tbody tr{border-bottom:1px solid var(--border-color,#e5e9f2);cursor:pointer;transition:background .15s;}',
        '.dpr-detail-table tbody tr:hover{background:rgba(15,118,110,0.05);}',
        '.dpr-detail-table td{padding:6px 10px;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:320px;}',
        '.dpr-td-thumb{width:52px;padding:4px 6px !important;}',
        '/* thumb size học theo Tab Ảnh: 44x44 */',
        '.dpr-td-thumb .dpr-thumb-wrap{width:44px;height:44px;border:1px solid var(--border-color,#e5e9f2);border-radius:8px;}',
        '.dpr-td-thumb .dpr-thumb-ph{font-size:18px;}',
        '.dpr-td-thumb .dpr-thumb-img{object-fit:contain;}',
        '.dpr-td-code{font-weight:900;}',
        '.dpr-td-name{font-weight:700;color:#334155;max-width:420px;}',
        '.dpr-td-dim{color:#0f766e;font-weight:800;}',
        '.dpr-td-loc{color:#2563eb;font-weight:800;}',
        '',
        '/* Mobile: ưu tiên cột quan trọng */',
        '@media (max-width: 768px){',
        '  .dpr-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr));}',
        '  .dpr-detail-table thead th.dpr-col-dim, .dpr-detail-table td.dpr-col-dim{display:none;}',
        '  .dpr-detail-table thead th.dpr-col-name, .dpr-detail-table td.dpr-col-name{display:none;}',
        '  .dpr-detail-table td{max-width:180px;}',
        '}',
        '',
        '/* Viewer */',
        '.dpr-vw-lock{overflow:hidden !important;}',
        '.dpr-viewer{position:fixed;inset:0;z-index:10450;display:flex;align-items:center;justify-content:center;opacity:0;visibility:hidden;transition:opacity .18s ease, visibility .18s ease;}',
        '.dpr-viewer.dpr-show{opacity:1;visibility:visible;}',
        '.dpr-hidden{display:none !important;}',
        '.dpr-vw-backdrop{position:absolute;inset:0;background:rgba(0,0,0,0.70);backdrop-filter:blur(2px);}',
        '.dpr-vw-panel{position:relative;width:min(1100px, calc(100vw - 36px));height:min(760px, calc(100vh - 36px));background:rgba(255,255,255,0.98);border-radius:16px;overflow:hidden;box-shadow:0 22px 60px rgba(0,0,0,0.35);display:flex;flex-direction:column;border:1px solid rgba(2,6,23,0.12);}',
        '.dpr-vw-header{display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(248,250,252,0.95);border-bottom:1px solid rgba(2,6,23,0.10);flex:0 0 auto;}',
        '.dpr-vw-title{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;}',
        '.dpr-vw-name{font-size:13px;font-weight:950;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.dpr-vw-meta{font-size:11px;font-weight:700;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.dpr-vw-actions{display:flex;align-items:center;gap:6px;}',
        '.dpr-vw-btn{width:36px;height:36px;border-radius:10px;border:1px solid rgba(2,6,23,0.12);background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#0f766e;transition:transform .15s, box-shadow .15s, background .15s;}',
        '.dpr-vw-btn:hover{transform:translateY(-1px);box-shadow:0 12px 20px rgba(2,6,23,0.14);background:rgba(15,118,110,0.06);}',
        '.dpr-vw-btn.dpr-vw-close{color:#b91c1c;border-color:rgba(185,28,28,0.18);}',
        '.dpr-vw-btn.dpr-vw-close:hover{background:rgba(220,38,38,0.08);}',
        '.dpr-vw-body{flex:1;position:relative;}',
        '.dpr-vw-stage{position:absolute;inset:0;overflow:hidden;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg, rgba(15,23,42,0.06), rgba(15,23,42,0.02));}',
        '.dpr-vw-img{max-width:92%;max-height:92%;object-fit:contain;border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,0.18);cursor:zoom-in;transition:opacity .15s;}',
        '.dpr-vw-loading,.dpr-vw-error{position:absolute;inset:auto 14px 14px 14px;display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:12px;font-size:12px;font-weight:800;}',
        '.dpr-vw-loading{background:rgba(2,6,23,0.62);color:#fff;}',
        '.dpr-vw-error{background:rgba(220,38,38,0.12);border:1px solid rgba(220,38,38,0.28);color:#991b1b;}',
        '/* Zoom 1:1: ảnh đúng kích thước thật trong vùng scroll */',
        '.dpr-viewer.dpr-vw-zoom .dpr-vw-stage{overflow:auto;align-items:flex-start;justify-content:flex-start;padding:12px;}',
        '.dpr-viewer.dpr-vw-zoom .dpr-vw-img{max-width:none;max-height:none;object-fit:unset;border-radius:10px;cursor:zoom-out;}',
      ].join('\n');
      // Bổ sung style cho cột Tên (link), Giá - tầng và theme theo loại thiết bị
      st.textContent += '\n/* Name column as hyperlink-style to open preview */\n' +
        '.dpr-detail-table .dpr-td-name {' +
          'color: var(--ui-link, #2563eb);' +
          'text-decoration: underline;' +
          'cursor: pointer;' +
          'font-weight: 800;' +
        '}\n' +
        '.dpr-detail-table .dpr-td-name:hover {' +
          'color: var(--ui-link-hover, #1d4ed8);' +
        '}\n' +

        '/* Giá - tầng badge: ㊿-1 */\n' +
        '.dpr-detail-table .dpr-td-rack {' +
          'font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace;' +
          'font-weight: 900;' +
          'color: #1d4ed8;' +
        '}\n' +
        '.dpr-rack-badge {' +
          'display: inline-flex;' +
          'align-items: center;' +
          'justify-content: center;' +
          'min-width: 44px;' +
          'height: 22px;' +
          'padding: 0 10px;' +
          'border-radius: 999px;' +
          'border: 1px solid rgba(37, 99, 235, 0.35);'+
          'background: rgba(59, 130, 246, 0.10);' +
          'font-size: 11px;' +
          'font-weight: 900;' +
          'color: #1d4ed8;' +
          'box-sizing: border-box;' +
        '}\n' +

        '/* Đổi màu header theo loại thiết bị liên quan */\n' +
        '[data-dpr-rowtype=\"mold\"] .dpr-toolbar {' +
          'background: linear-gradient(135deg, rgba(8,145,178,0.12), rgba(8,145,178,0.02));' +
          'border-bottom-color: rgba(8,145,178,0.35);' +
        '}\n' +
        '/* --- Lifecycle Node Tree CSS (Phương án A) --- */\n' +
        '.dpr-lifecycle-tree { padding: 12px 6px; display: flex; flex-direction: column; gap: 0; }\n' +
        '.dpr-tree-node { display: flex; position: relative; padding-bottom: 20px; min-height: 48px; }\n' +
        '.dpr-tree-node:last-child { padding-bottom: 0; }\n' +
        '.dpr-node-line { position: absolute; top: 36px; bottom: -8px; width: 2px; background: rgba(148,163,184,0.4); z-index: 1; border-radius: 2px; }\n' +
        '.dpr-tree-node:last-child .dpr-node-line { display: none; }\n' +
        '.dpr-node-icon { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #fff; border: 2px solid #cbd5e1; z-index: 2; margin-right: 12px; font-size: 15px; color: #64748b; flex-shrink: 0; transition: all 0.2s ease; }\n' +
        '.dpr-node-content { flex: 1; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.04); cursor: pointer; transition: all 0.2s ease; }\n' +
        '.dpr-node-content:hover { border-color: #94a3b8; box-shadow: 0 4px 12px rgba(0,0,0,0.08); transform: translateY(-1px); }\n' +
        '.dpr-node-title { font-size: 13px; font-weight: 800; color: #1e293b; margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between; }\n' +
        '.dpr-node-badge { font-size: 9px; padding: 2px 6px; border-radius: 4px; background: #f1f5f9; color: #475569; font-weight: 700; }\n' +
        '.dpr-node-meta { font-size: 11px; color: #64748b; line-height: 1.4; }\n' +
        '.dpr-node-active .dpr-node-icon { background: #0ea5e9; color: #fff; border-color: #0ea5e9; box-shadow: 0 0 0 4px rgba(14,165,233,0.15); }\n' +
        '.dpr-node-active .dpr-node-content { border-color: #0ea5e9; box-shadow: 0 4px 14px rgba(14,165,233,0.12); }\n' +
        '.dpr-node-active .dpr-node-title { color: #0284c7; }\n' +
        '/* Indentation Levels */\n' +
        '.dpr-node-lvl-0 .dpr-node-line { left: 17px; }\n' +
        '.dpr-node-lvl-1 { padding-left: 20px; }\n' +
        '.dpr-node-lvl-1 .dpr-node-line { left: 37px; }\n' +
        '.dpr-node-lvl-2 { padding-left: 40px; }\n' +
        '.dpr-node-lvl-2 .dpr-node-line { left: 57px; }\n' +
        '.dpr-node-lvl-3 { padding-left: 60px; }\n' +
        '.dpr-node-lvl-3 .dpr-node-line { left: 77px; }\n' +
        '.dpr-node-lvl-0 .dpr-node-icon { border-color: #8b5cf6; color: #8b5cf6; }\n' +
        '.dpr-node-lvl-1 .dpr-node-icon { border-color: #10b981; color: #10b981; }\n' +
        '.dpr-node-lvl-3 .dpr-node-icon { border-color: #f59e0b; color: #f59e0b; }\n' +
        '[data-dpr-rowtype=\"mold\"] .dpr-toolbar-title i {' +
          'color: #0e7490;' +
        '}\n' +
        '[data-dpr-rowtype=\"cutter\"] .dpr-toolbar {' +
          'background: linear-gradient(135deg, rgba(234,88,12,0.10), rgba(234,88,12,0.02));' +
          'border-bottom-color: rgba(234,88,12,0.35);' +
        '}\n' +
        '[data-dpr-rowtype=\"cutter\"] .dpr-toolbar-title i {' +
          'color: #c2410c;' +
        '}\n';

      document.head.appendChild(st);
    } catch (e) {
      // silent
    }
  }

  // -------------------- render (outer shell only) --------------------
  function emptyHtml() {
    return (
      '<div style="padding:14px;color:var(--text-muted,#64748b);">' +
        '<i class="fas fa-link" style="opacity:0.7;margin-right:6px"></i>' +
        'Không có thiết bị liên quan.' +
      '</div>'
    );
  }

  function renderToolbar(itemType) {
    var title = 'ライフサイクル & 系統図 (Vòng đời & Phả hệ)';
    return (
      '<div class="dpr-toolbar">' +
        '<div class="dpr-toolbar-title">' +
          '<i class="fas fa-project-diagram"></i>' +
          '<span>' + escHtml(title) + '</span>' +
        '</div>' +
      '</div>'
    );
  }

  function render(dp) {
    injectStyles();
    ensureStateForRecord(dp);

    var item = getCurrentItem(dp);
    if (!item) {
      return '<p class="no-data" style="padding:14px">Chưa chọn thiết bị.</p>';
    }

    var itemType = getCurrentItemType(dp);
    var list = getList(dp, item, itemType);

    dp.dprCache = { key: recordKey(dp), list: Array.isArray(list) ? list : [], itemType: itemType };

    var toolbar = renderToolbar(itemType, Array.isArray(list) ? list.length : 0, getView(dp));
    // IMPORTANT: chỉ render toolbar 1 lần, host chỉ render body => tránh lặp tiêu đề
    return (
      '<div class="modal-section dpr-section">' +
        toolbar +
        '<div data-dp-related-host>' +
          (Array.isArray(list) && list.length ? '<div style="padding:14px;color:var(--text-muted,#64748b)"><i class="fas fa-spinner fa-spin" style="opacity:.6"></i> Đang tải...</div>' : emptyHtml()) +
        '</div>' +
      '</div>'
    );
  }

  function setCount(container, total) {
    // Không dùng count trên toolbar
  }

  // ==================== JOB DETAIL POPUP ====================
  function openJobDetailPopup(jobId) {
    if(!window.DataManager) return;
    var allData = window.DataManager.data || {};
    var jobsTable = allData.jobs || [];
    var jb = null;
    for(var i=0; i<jobsTable.length; i++) {
      if(String(jobsTable[i].JobID) === String(jobId)) { jb = jobsTable[i]; break; }
    }
    if(!jb) { alert('Job ID: ' + jobId + ' kh\u00f4ng t\u00ecm th\u1ea5y'); return; }
    
    // Tra c\u1ee9u b\u1ea3ng ph\u1ee5
    var dlTable = allData.processingdeadline || [];
    var pStatusTable = allData.processingstatus || [];
    var itemTypeTable = allData.itemtype || [];
    var machCustTable = allData.machiningcustomer || [];
    var designTable = allData.molddesign || [];
    
    // Map MachiningCustomer
    var machCust = null;
    for(var m=0; m<machCustTable.length; m++) {
      if(machCustTable[m].MachiningCustomerID == jb.MachiningCustomerID) { machCust = machCustTable[m]; break; }
    }
    // Map Design
    var jbDesign = null;
    for(var d=0; d<designTable.length; d++) {
      if(designTable[d].MoldDesignID == jb.MoldDesignID) { jbDesign = designTable[d]; break; }
    }
    // Deadlines c\u1ee7a Job n\u00e0y
    var jbDeadlines = [];
    for(var k=0; k<dlTable.length; k++) {
      if(String(dlTable[k].JobID) === String(jobId)) jbDeadlines.push(dlTable[k]);
    }
    
    function fmtDate(v) {
      if(!v) return 'N/A';
      return String(v).length > 10 ? String(v).substring(0,10) : String(v);
    }
    function row(ja, vi, val) {
      if(!val || String(val).trim() === '') return '';
      return '<tr><td style="padding:5px 8px; color:#6b7280; font-size:12px; white-space:nowrap; vertical-align:top;"><b>' + ja + '</b><br><span style="font-size:11px;">' + vi + '</span></td><td style="padding:5px 8px; font-size:13px; vertical-align:top;">' + escHtml(String(val)) + '</td></tr>';
    }
    
    var approved = (jb.Approved && String(jb.Approved).trim() !== '' && jb.Approved != '0');
    var approvedBadge = approved
      ? '<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;"&gt;\u627f\u8a8d\u6e08 \u2713</span>'
      : '<span style="background:#fef9c3;color:#a16207;padding:2px 8px;border-radius:12px;font-size:12px;">\u672a\u627f\u8a8d</span>';
    
    var dlHtml = '';
    if(jbDeadlines.length > 0) {
      dlHtml = '<div style="margin-top:16px; border-top:1px solid #e5e7eb; padding-top:12px;">' +
               '<div style="font-weight:700; margin-bottom:8px; color:#374151;">\u5de5\u7a0b\u5225\u671f\u9650 (C\u00f4ng \u0111o\u1ea1n Deadline):</div>';
      for(var di=0; di<jbDeadlines.length; di++) {
        var dl = jbDeadlines[di];
        var pSt = pStatusTable.find ? pStatusTable.find(function(s){ return s.ProcessingStatusID == dl.ProcessingStatusID; }) : null;
        if(!pSt) for(var xi=0; xi<pStatusTable.length; xi++) { if(pStatusTable[xi].ProcessingStatusID == dl.ProcessingStatusID){ pSt = pStatusTable[xi]; break; } }
        var pStText = pSt ? (pSt.TinhTrangGiaCong || pSt.ProcessingStatus || dl.ProcessingStatusID || 'N/A') : (dl.ProcessingStatusID || 'N/A');
        var itType = null;
        for(var yi=0; yi<itemTypeTable.length; yi++) { if(itemTypeTable[yi].ItemTypeID == dl.ItemTypeID){ itType = itemTypeTable[yi]; break; } }
        var itTypeText = itType ? (itType.Category || itType.ItemType || itType.ItemTypeName || dl.ItemTypeID) : (dl.ItemTypeID || '\u5de5\u7a0b');
        var dlDate = fmtDate(dl.ProcessingDeadlineDate || dl.ProcessingDeadline);
        var stColor = (String(pStText).indexOf('\u5b8c') > -1 || String(pStText).indexOf('\u6e08') > -1) ? '#059669' : '#d97706';
        dlHtml += '<div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:6px; padding:8px 10px; margin-bottom:6px; font-size:13px;">' +
                  '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                    '<span style="font-weight:600;"><i class="fas fa-tasks" style="color:#9ca3af;margin-right:4px;"></i>' + escHtml(itTypeText) + '</span>' +
                    '<span style="color:' + stColor + ';font-weight:600;">' + escHtml(pStText) + '</span>' +
                  '</div>' +
                  '<div style="margin-top:4px; display:flex; gap:12px; color:#6b7280; font-size:12px;">' +
                    '<span>\u671f\u9650: <b style="color:#111827">' + escHtml(dlDate) + '</b></span>' +
                    (dl.ProcessingNotes ? '<span>\u30e1\u30e2: ' + escHtml(dl.ProcessingNotes) + '</span>' : '') +
                  '</div>' +
                '</div>';
      }
      dlHtml += '</div>';
    }
    
    var popupHtml = 
      '<div id="job-detail-popup-overlay" style="' +
        'position:fixed; inset:0; z-index:999999; background:rgba(0,0,0,0.5);' +
        'display:flex; align-items:center; justify-content:center; padding:20px;' +
      '">' +
        '<div style="' +
          'background:#fff; border-radius:12px; width:100%; max-width:600px; max-height:90vh; overflow-y:auto;' +
          'box-shadow:0 20px 40px rgba(0,0,0,0.25); display:flex; flex-direction:column;' +
        '">' +
          '<div style="' +
            'display:flex; justify-content:space-between; align-items:center;' +
            'padding:16px 20px; border-bottom:1px solid #e5e7eb; background:#f0f9ff;' +
            'border-radius:12px 12px 0 0; flex-shrink:0;' +
          '">' +
            '<div>' +
              '<div style="font-size:18px; font-weight:700; color:#0369a1;">' +
                '<i class="fas fa-clipboard-list" style="margin-right:8px;"></i>' +
                escHtml(jb.JobName || jb.JobCode || 'Job #' + jb.JobID) +
              '</div>' +
              '<div style="font-size:12px; color:#6b7280; margin-top:2px;">Job ID: ' + escHtml(String(jb.JobID)) + ' | ' + approvedBadge + '</div>' +
            '</div>' +
            '<button id="job-popup-close-btn" style="' +
              'border:none; background:#e5e7eb; border-radius:50%; width:32px; height:32px;' +
              'cursor:pointer; font-size:16px; display:flex;align-items:center;justify-content:center;' +
            '">\u00d7</button>' +
          '</div>' +
          '<div style="padding:16px 20px; flex:1;">' +
            '<table style="width:100%; border-collapse:collapse;">' +
              row('\u91d1\u578b\u8a2d\u8a08 (Thi\u1ebft k\u1ebf)', 'MoldDesignID', jbDesign ? (jbDesign.MoldDesignName || jbDesign.MoldDesignCode) : jb.MoldDesignID) +
              row('\u52a0\u5de5\u5de5\u7a0b (N\u1ed9i GC)', 'ProcessingItemID', jb.NoiGCkhuon) +
              row('\u52a0\u5de5\u696d\u8005 (Gia c\u00f4ng)', 'MachiningCustomerID', machCust ? machCust.MachiningCustomer : jb.MachiningCustomerID) +
              row('\u6570\u91cf (S\u1ed1 l\u01b0\u1ee3ng)', 'JobQuantity', jb.JobQuantity) +
              row('\u958b\u59cb\u65e5 (Ng\u00e0y b\u1eaft đ\u1ea7u)', 'JobStartDate', fmtDate(jb.JobStartDate)) +
              row('\u7d0d\u671f (H\u1ea1n giao)', 'DeliveryDeadline', fmtDate(jb.DeliveryDeadline)) +
              row('\u767a\u884c\u671f (Release)', 'ReleasePeriod', jb.ReleasePeriod) +
              row('\u767b\u9332\u65e5 (Date Entry)', 'DateEntry', fmtDate(jb.DateEntry)) +
              row('形成場所 (中心地 GC)', 'FormingLocation', jb.FormingLocation) +
              row('\u5099\u8003 (Ghi ch\u00fa Job)', 'JobNote', jb.JobNote) +
              row('\u30d5\u30a3\u30fc\u30c9\u30d0\u30c3\u30af (Ph\u1ea3n h\u1ed3i SX)', 'PostProductionFeedback', jb.PostProductionFeedback) +
            '</table>' +
            dlHtml +
          '</div>' +
        '</div>' +
      '</div>';
      
    var old = document.getElementById('job-detail-popup-overlay');
    if(old) old.parentNode.removeChild(old);
    
    var div = document.createElement('div');
    div.innerHTML = popupHtml;
    var overlay = div.firstChild;
    document.body.appendChild(overlay);
    
    // Close events
    document.getElementById('job-popup-close-btn').onclick = function() {
      var el = document.getElementById('job-detail-popup-overlay');
      if(el) el.parentNode.removeChild(el);
    };
    overlay.addEventListener('click', function(e) {
      if(e.target === overlay) {
        var el = document.getElementById('job-detail-popup-overlay');
        if(el) el.parentNode.removeChild(el);
      }
    });
    document.addEventListener('keydown', function closeOnEsc(e) {
      if(e.key === 'Escape') {
        var el = document.getElementById('job-detail-popup-overlay');
        if(el) el.parentNode.removeChild(el);
        document.removeEventListener('keydown', closeOnEsc);
      }
    });
  }
  // ==================== END JOB DETAIL POPUP ====================

  function renderLifecycleTreeBody(item, itemType) {
    if(!window.DataManager) return '<div style="padding:15px;color:red">Window.DataManager không khả dụng</div>';
    
    // Fix lỗi TypeError: getAllData không tồn tại. API của v8.4.8 là .data
    var allData = window.DataManager.data || {};
    var isCutter = (String(itemType).toLowerCase() === 'cutter');
    var idField = isCutter ? 'CutterID' : 'MoldID';
    var currId = item[idField];
    var currDesignId = item.MoldDesignID;
    
    // 1. Phân tích Dữ liệu Thiết Kế (Design gốc)
    var designs = allData.molddesign || [];
    var currDesign = null;
    if(currDesignId) {
       for(var i=0; i<designs.length; i++) {
         if(designs[i].MoldDesignID == currDesignId) {
            currDesign = designs[i]; break;
         }
       }
    }
    
    // 1b. Giao thức dùng chung DAO (moldcutter)
    var sharedDesigns = [];
    if (isCutter) {
        var mcTable = allData.moldcutter || [];
        for(var i=0; i<mcTable.length; i++) {
           if(mcTable[i].CutterID == currId && mcTable[i].MoldDesignID != currDesignId) {
               // Tìm Design Name
               var dInfo = null;
               for(var j=0; j<designs.length; j++) {
                  if(designs[j].MoldDesignID == mcTable[i].MoldDesignID) { dInfo = designs[j]; break; }
               }
               if(dInfo) sharedDesigns.push(dInfo);
           }
        }
    }

    // 2. Tìm danh sách Jobs liên quan
    var jobsTable = allData.jobs || [];
    var relatedJobs = [];
    for(var j=0; j<jobsTable.length; j++) {
       if(jobsTable[j][idField] == currId) {
           relatedJobs.push(jobsTable[j]);
       }
    }
    // Sort jobs descending by JobID or DateEntry
    relatedJobs.sort(function(a,b) { return b.JobID - a.JobID; });
    
    // 3. Tra soát Đơn Hàng (OrderLine -> OrderHead -> Customer)
    var currOrderLines = [];
    var currOrderHeads = [];
    if(currDesignId) {
       var oLines = allData.orderline || [];
       var oHeads = allData.orderhead || [];
       var customers = allData.customers || [];
       
       for(var li=0; li<oLines.length; li++) {
          if(oLines[li].MoldDesignID == currDesignId) {
             currOrderLines.push(oLines[li]);
             // Tìm OrderHead tương ứng
             for(var hi=0; hi<oHeads.length; hi++) {
                if(oHeads[hi].OrderHeadID == oLines[li].OrderHeadID) {
                   var headCopy = Object.assign({}, oHeads[hi]);
                   // Map Customer Name
                   for(var ci=0; ci<customers.length; ci++) {
                      if(customers[ci].CustomerID == headCopy.CustomerID) {
                         headCopy._CustomerName = customers[ci].CustomerName; break;
                      }
                   }
                   // Tránh push trùng OrderHead nếu có nhiều Line cùng 1 Design trong 1 Order
                   var isDup = false;
                   for(var ch=0; ch<currOrderHeads.length; ch++) {
                      if(currOrderHeads[ch].OrderHeadID == headCopy.OrderHeadID) { isDup=true; break; }
                   }
                   if(!isDup) currOrderHeads.push(headCopy);
                   break;
                }
             }
          }
       }
    }

    // BẮT ĐẦU RENDER HTML
    var html = '<div class="dpr-lifecycle-tree" style="padding-bottom:30px;">';
    
    // --- KHỐI ĐƠN HÀNG GỐC ---
    if(currOrderHeads.length > 0) {
        html += '<div class="dpr-tree-node dpr-node-lvl-0">' +
                  '<div class="dpr-node-line"></div>' +
                  '<div class="dpr-node-icon" style="background:#0ea5e9"><i class="fas fa-file-invoice-dollar"></i></div>' +
                  '<div class="dpr-node-content">' +
                    '<div class="dpr-node-title"><span style="color:#0284c7">注文情報 (Thông tin Đặt hàng) - ' + currOrderHeads.length + ' 件</span><span class="dpr-node-badge" style="background:#0ea5e9;color:#fff">開始 (Khởi đầu)</span></div>' +
                    '<div class="dpr-node-meta" style="margin-top:6px; display:flex; flex-direction:column; gap:4px;">';
        
        for(var oh=0; oh<currOrderHeads.length; oh++) {
            var headInfo = currOrderHeads[oh];
            var orderDateDisplay = headInfo.OrderDate || '';
            if(orderDateDisplay.length > 10) orderDateDisplay = orderDateDisplay.substring(0,10);
            html += '<div style="background:#f0f9ff; border:1px solid #bae6fd; padding:6px; border-radius:4px; font-size:12px;">' +
                        '<div style="font-weight:600; color:#0369a1;"><i class="fas fa-hashtag" style="font-size:10px;margin-right:4px;"></i>PO: ' + escHtml(headInfo.OrderNo || headInfo.CustomerPO || 'N/A') + '</div>' +
                        '<div style="display:flex; justify-content:space-between; margin-top:2px;">' +
                           '<span>顧客 (KH): <b>' + escHtml(headInfo._CustomerName || headInfo.CustomerID || '不明 (Chưa rõ)') + '</b></span>' +
                           '<span>日付 (Ngày): <b>' + escHtml(orderDateDisplay || 'N/A') + '</b></span>' +
                        '</div>' +
                    '</div>';
        }
        html +=     '</div>' +
                  '</div>' +
                '</div>';
    } else {
        html += '<div class="dpr-tree-node dpr-node-lvl-0">' +
                  '<div class="dpr-node-line"></div>' +
                  '<div class="dpr-node-icon" style="background:#9ca3af"><i class="fas fa-box"></i></div>' +
                  '<div class="dpr-node-content">' +
                    '<div class="dpr-node-title"><span style="color:#6b7280">注文履歴なし (Chưa có Đơn hàng)</span><span class="dpr-node-badge">N/A</span></div>' +
                    '<div class="dpr-node-meta">この設計からの注文履歴は見つかりません。(Không tra cứu được Lịch sử Đặt hàng từ Thiết kế này.)</div>' +
                  '</div>' +
                '</div>';
    }

    // --- KHỐI THIẾT KẾ GỐC ---
    var designNameDisplay = currDesign ? (currDesign.MoldDesignName || currDesign.MoldDesignCode || 'ID: ' + currDesignId) : '設計なし (Chưa có Thiết kế)';
    var designVer = currDesign ? (currDesign.VersionNote || '') : '';
    html += '<div class="dpr-tree-node dpr-node-lvl-1">' +
              '<div class="dpr-node-line"></div>' +
              '<div class="dpr-node-icon" style="background:#8b5cf6"><i class="fas fa-compass"></i></div>' +
              '<div class="dpr-node-content">' +
                '<div class="dpr-node-title"><span>元設計 (Thiết kế Gốc): ' + escHtml(designNameDisplay) + '</span><span class="dpr-node-badge" style="background:#8b5cf6;color:#fff">図面 (Bản vẽ)</span></div>' +
                '<div class="dpr-node-meta">ID: ' + escHtml(currDesignId || 'N/A') + (designVer ? ' | Ver: ' + escHtml(designVer) : '') + '</div>' +
              '</div>' +
            '</div>';

    // --- KHỐI DAO DÙNG CHUNG (Nếu là Cutter & Có Data bảng moldcutter.csv) ---
    if(sharedDesigns.length > 0) {
        var sharedNames = [];
        for(var s=0; s<sharedDesigns.length; s++) {
           sharedNames.push(sharedDesigns[s].MoldDesignName || sharedDesigns[s].MoldDesignCode || sharedDesigns[s].MoldDesignID);
        }
        html += '<div class="dpr-tree-node dpr-node-lvl-1">' +
                  '<div class="dpr-node-line" style="border-left-style:dashed;"></div>' +
                  '<div class="dpr-node-icon" style="background:#f59e0b"><i class="fas fa-share-alt"></i></div>' +
                  '<div class="dpr-node-content">' +
                    '<div class="dpr-node-title"><span>共有設計 (Thiết kế Dùng Chung)</span><span class="dpr-node-badge" style="background:#f59e0b;color:#fff">' + sharedDesigns.length + ' 件 (Thiết kế)</span></div>' +
                    '<div class="dpr-node-meta">この刃物は以下の設計で共有されています (Dao cắt này dùng chung trên): ' + escHtml(sharedNames.join(', ')) + '</div>' +
                  '</div>' +
                '</div>';
    }

    // --- KHỐI THIẾT BỊ (NODE TRUNG TÂM) ---
    var code = item.MoldCode || item.CutterCode || item.MoldNo || item.CutterNo || item.ID || '-';
    var name = item.MoldName || item.CutterName || item.Name || '-';
    var icon = isCutter ? 'fa-cut' : 'fa-layer-group';
    var deviceTypeLabel = isCutter ? '刃物 (Dao cắt)' : '金型 (Khuôn)';
    var verInfo = item.VersionNo ? (' | Ver: ' + item.VersionNo) : '';
    html += '<div class="dpr-tree-node dpr-node-lvl-2 dpr-node-active">' +
              '<div class="dpr-node-line"></div>' +
              '<div class="dpr-node-icon"><i class="fas ' + icon + '"></i></div>' +
              '<div class="dpr-node-content" style="border: 2px solid #0284c7; box-shadow: 0 4px 6px rgba(2,132,199,0.15)">' +
                '<div class="dpr-node-title"><span style="font-weight:700; color:#0369a1">' + escHtml(code) + ' - ' + escHtml(name) + '</span><span class="dpr-node-badge" style="background:#0284c7;color:#fff">' + deviceTypeLabel + '</span></div>' +
                '<div class="dpr-node-meta">状態 (Trạng thái): ' + escHtml(item.MoldUsageStatus || item.Status || '---') + escHtml(verInfo) + '</div>' +
              '</div>' +
            '</div>';

    // --- KHỐI LỊCH SỬ CHỈ THỊ (JOB & CHI TIẾT CÔNG ĐOẠN DEADLINE) ---
    html += '<div class="dpr-tree-node dpr-node-lvl-3">' +
              '<div class="dpr-node-line"></div>' +
              '<div class="dpr-node-icon" style="background:#10b981"><i class="fas fa-cogs"></i></div>' +
              '<div class="dpr-node-content">' +
                '<div class="dpr-node-title"><span>Job 履歴 (Lịch sử Job) - ' + relatedJobs.length + ' 件</span><span class="dpr-node-badge" style="background:#10b981;color:#fff">製造 (Sản xuất)</span></div>' +
                '<div class="dpr-node-meta">Jobを介した製造・修復イベント (Sự kiện Job Sản xuất/Sửa chữa).</div>';
                
    if(relatedJobs.length === 0) {
       html += '<div style="margin-top:10px; font-size:13px; color:#6b7280; font-style:italic; padding:6px; background:#f3f4f6; border-radius:4px;"><i class="fas fa-info-circle"></i> 加工Job履歴なし (Chưa ghi nhận Job gia công nào).</div>';
    } else {
       var dlTable = allData.processingdeadline || [];
       var pStatusTable = allData.processingstatus || [];
       var itemTypeTable = allData.itemtype || [];
       
       html += '<div style="margin-top: 12px; display:flex; flex-direction:column; gap:8px;">';
       for(var k=0; k<relatedJobs.length; k++) {
           var jb = relatedJobs[k];
           var jDate = jb.DateEntry || jb.UpdatedAt || '';
           if (jDate.length > 10) jDate = jDate.substring(0, 10);
           
           // Tra soát các công đoạn (Deadline con) cho Job này
           var dlItems = [];
           for(var d=0; d<dlTable.length; d++) {
               if(dlTable[d].JobID == jb.JobID) dlItems.push(dlTable[d]);
           }
           
           var strStatus = '';
           if(jb.Approved && String(jb.Approved).trim() !== '' && jb.Approved != '0') {
               strStatus = '<span style="color:#059669;font-weight:600;"><i class="fas fa-check-circle"></i> 承認済</span>';
           } else {
               strStatus = '<span style="color:#f59e0b;"><i class="fas fa-hourglass-half"></i> 未承認</span>';
           }

           html += '<div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:6px; padding:10px; font-size:13px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">' +
                      '<div style="display:flex; justify-content:space-between; margin-bottom:6px; align-items:flex-start;">' +
                          '<div style="flex:1;">' +
                             '<div style="color:#111827; font-weight:600; font-size:14px; margin-bottom:2px; cursor:pointer;" title="Click để xem chi tiết" onclick="(function(){if(window.RelatedTabJobPopup){window.RelatedTabJobPopup(' + escHtml(jb.JobID) + ');}})()">' +
                               '<i class="fas fa-clipboard-list" style="color:#4f46e5; margin-right:4px;"></i>' + escHtml(jb.JobName || jb.JobCode || 'Job ID: ' + jb.JobID) + 
                               '<span style="font-size:11px; color:#9ca3af; margin-left:6px;">[クリックで詳細表示]</span>' +
                             '</div>';
                             
           // Tra tên thiết kế từ bảng molddesign
           var jbDesignObj = null;
           for(var dd=0; dd<designs.length; dd++) {
             if(designs[dd].MoldDesignID == jb.MoldDesignID) { jbDesignObj = designs[dd]; break; }
           }
           var jobDesignDisplay = jbDesignObj
             ? (jbDesignObj.MoldDesignName || jbDesignObj.MoldDesignCode || jb.MoldDesignID)
             : (jb.MoldDesignID ? ('ID: ' + jb.MoldDesignID) : '設計未割当 (Chưa gắn Thiết kế)');
           var isOldDesign = currDesignId && jb.MoldDesignID && currDesignId !== jb.MoldDesignID;
           var designBadge = isOldDesign ? '<span style="background:#fef2f2; color:#ef4444; border:1px solid #f87171; font-size:10px; padding:1px 4px; border-radius:3px; margin-left:6px;" title="Mold này từng chạy cho bản thiết kế cũ (R1..)">古い設計履歴 (Thiết kế cũ)</span>' : '';
           
           html +=           '<div style="color:#6b7280; font-size:12px;"><i class="fas fa-drafting-compass" style="margin-right:4px;"></i>金型設計 (Thiết kế Khuôn): <b style="color:#374151">' + escHtml(jobDesignDisplay) + '</b>' + designBadge + '</div>';
           
           // Chi tiết Job mở rộng: Khách hàng gia công, Số lượng, Ghi chú
           var extInfo = [];
           if (jb.MachiningCustomerID) extInfo.push('加工業者 (Gia công): <b>' + escHtml(jb.MachiningCustomerID) + '</b>');
           if (jb.RequiredQty) extInfo.push('数 (SL): <b>' + escHtml(jb.RequiredQty) + '</b>');
           if (jb.JobNotes) extInfo.push('注 (Notes): <b>' + escHtml(jb.JobNotes) + '</b>');
           if (extInfo.length > 0) {
              html += '<div style="color:#6b7280; font-size:11px; margin-top:3px;">' + extInfo.join(' | ') + '</div>';
           }
           
           html +=        '</div>' +
                          '<div style="text-align:right;">' +
                             '<div style="color:#4f46e5; font-weight:600; font-size:12px;">' + escHtml(jDate) + '</div>' +
                             '<div style="font-size:11px; margin-top:2px;">' + strStatus + '</div>' + 
                          '</div>' +
                      '</div>';
           
           // In các dòng Deadline
           if(dlItems.length > 0) {
              html += '<div style="border-top:1px dashed #d1d5db; margin-top:6px; padding-top:6px;">';
              for(var idx=0; idx<dlItems.length; idx++) {
                 var dl = dlItems[idx];
                 var dlDate = dl.ProcessingDeadlineDate || dl.ProcessingDeadline || '';
                 if(dlDate.length > 10) dlDate = dlDate.substring(0, 10);
                 
                 // Map Trạng thái (ProcessingStatusID -> Tên Trạng Thái)
                 var pStatusObj = pStatusTable.find(function(s) { return s.ProcessingStatusID == dl.ProcessingStatusID; });
                 var pStatusText = pStatusObj ? (pStatusObj.TìnhTrạngGiaCông || pStatusObj.ProcessingStatus || dl.ProcessingStatusID) : (dl.ProcessingStatusID || 'N/A');
                 var statusColor = (pStatusText.toLowerCase().indexOf('hoàn thành') > -1 || pStatusText.toLowerCase().indexOf('完了') > -1) ? '#059669' : '#d97706';
                 
                 // Map Công đoạn (ItemTypeID -> Tên Công Đoạn)
                 var iTypeObj = itemTypeTable.find(function(i) { return i.ItemTypeID == dl.ItemTypeID; });
                 var iTypeText = iTypeObj ? (iTypeObj.Category || iTypeObj.ItemType || dl.ItemTypeID) : (dl.ItemTypeID || '工程 (Công đoạn)');
                 
                 var dlNotes = dl.ProcessingNotes ? ('<div style="font-size:11px; color:#6b7280; margin-top:2px; margin-left:16px;"><i>' + escHtml(dl.ProcessingNotes) + '</i></div>') : '';
                 
                 html += '<div style="margin-bottom:4px;">' +
                           '<div style="display:flex; justify-content:space-between; font-size:12px; color:#4b5563;">' +
                              '<span><i class="fas fa-tasks" style="color:#9ca3af;margin-right:4px;"></i>' + escHtml(iTypeText) + '</span>' +
                              '<span><span style="color:' + statusColor + '; font-weight:600; font-size:11px; margin-right:8px;">[' + escHtml(pStatusText) + ']</span> 期限 (Hạn): <b style="color:#111827">' + escHtml(dlDate || 'N/A') + '</b></span>' +
                           '</div>' +
                           dlNotes +
                         '</div>';
              }
              html += '</div>';
           }

           html += '</div>';
       }
       html += '</div>';
    }

    html += '</div></div>'; // end Node Lịch sử Jobs
    html += '</div>'; // end Tree
    return html;
  }

  function renderGridBody(list, rowItemType) {
    var html = '<div class="dpr-grid">';

    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      var id = getRowId(row, rowItemType);
      var code = getRowCode(row, rowItemType) || id || '-';
      var name = getRowName(row, rowItemType) || '-';
      var dims = getRowDimensions(row);
      var loc = getRackLocation(row).display;
      var st = getLatestStatus(row, rowItemType);
      var stLabel = getStatusLabel(st.status);
      var stCls = getStatusClass(st.status);
      var updated = fmtDateYMD(st.date);

      html += (
        '<div class="dpr-card" data-dpr-open="1" data-dpr-idx="' + i + '">' +
          '<div class="dpr-thumb-wrap dpr-thumb-wrap-card" title="Click để xem ảnh lớn">' +
            '<img class="dpr-thumb-img" data-devicetype="' + escHtml(String(rowItemType).toLowerCase()) + '" data-deviceid="' + escHtml(id) + '" alt="thumb" />' +
            '<div class="dpr-thumb-ph"><i class="fas fa-image"></i></div>' +
          '</div>' +
          '<div class="dpr-card-body">' +
            '<div class="dpr-code" title="' + escHtml(code) + '">' + escHtml(code) + '</div>' +
            '<div class="dpr-name" title="' + escHtml(name) + '">' + escHtml(name) + '</div>' +
            '<div class="dpr-meta">' +
              '<div class="dpr-meta-row" title="ID"><i class="fas fa-hashtag"></i><span>ID: ' + escHtml(id || '-') + '</span></div>' +
              '<div class="dpr-meta-row" title="Kích thước"><i class="fas fa-ruler-combined"></i><span>' + escHtml(dims) + '</span></div>' +
              '<div class="dpr-meta-row" title="Vị trí"><i class="fas fa-map-marker-alt"></i><span>' + escHtml(loc) + '</span></div>' +
              '<div class="dpr-meta-row" title="Trạng thái">' +
                '<i class="fas fa-clipboard-check"></i>' +
                '<span class="dpr-status-badge ' + escHtml(stCls) + '">' + escHtml(stLabel) + '</span>' +
                '<span title="Ngày cập nhật" style="margin-left:auto;opacity:.85;">' + escHtml(updated) + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }

    html += '</div>';
    return html;
  }

  function thLabel(ja, vi) {
    return (
      '<span class="dpr-th-label">' +
        '<span class="dpr-ja">' + escHtml(ja) + '</span>' +
        '<span class="dpr-vi">' + escHtml(vi) + '</span>' +
      '</span>'
    );
  }

  function renderDetailBody(list, rowItemType) {
    var html = '';
    html += '<div class="dpr-detail">';
    html += '<table class="dpr-detail-table">';
    html += '<thead><tr>';
    html += '<th style="width:52px">' + thLabel('サムネ', 'Ảnh') + '</th>';
    html += '<th style="width:72px">' + thLabel('ID', 'ID') + '</th>';
    html += '<th style="width:160px">' + thLabel('コード', 'Mã') + '</th>';
    html += '<th class="dpr-col-name" style="min-width:220px">' + thLabel('名前', 'Tên') + '</th>';
    html += '<th class="dpr-col-dim" style="width:170px">' + thLabel('サイズ', 'Kích thước') + '</th>';
    html += '<th style="width:120px">' + thLabel('棚-段', 'Giá - tầng') + '</th>';
    html += '<th style="width:150px">' + thLabel('位置', 'Vị trí giá') + '</th>';
    html += '<th style="width:150px">' + thLabel('状態', 'Trạng thái') + '</th>';
    html += '<th style="width:120px">' + thLabel('更新日', 'Ngày cập nhật') + '</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    for (var i = 0; i < list.length; i++) {
      var row = list[i];
      var id = getRowId(row, rowItemType);
      var code = getRowCode(row, rowItemType) || id || '-';
      var name = getRowName(row, rowItemType) || '-';
      var dims = getRowDimensions(row);

      var rackInfo = getRackLocation(row);
      var loc = rackInfo.display;
      var rackLayerText = rackInfo.rackLayerText || '-';

      var st = getLatestStatus(row, rowItemType);
      var stLabel = getStatusLabel(st.status);
      var stCls = getStatusClass(st.status);
      var updated = fmtDateYMD(st.date);

      html += (
        '<tr data-dpr-open="1" data-dpr-idx="' + i + '">' +
          '<td class="dpr-td-thumb">' +
            '<div class="dpr-thumb-wrap" title="Click để xem ảnh lớn">' +
              '<img class="dpr-thumb-img" data-devicetype="' + escHtml(String(rowItemType).toLowerCase()) + '" data-deviceid="' + escHtml(id) + '" alt="thumb" />' +
              '<div class="dpr-thumb-ph"><i class="fas fa-image"></i></div>' +
            '</div>' +
          '</td>' +
          '<td title="' + escHtml(id || '-') + '">' + escHtml(id || '-') + '</td>' +
          '<td class="dpr-td-code" title="Mở chi tiết">' + escHtml(code) + '</td>' +
          '<td class="dpr-td-name dpr-col-name" title="' + escHtml(name) + '">' + escHtml(name) + '</td>' +
          '<td class="dpr-td-dim dpr-col-dim" title="' + escHtml(dims) + '">' + escHtml(dims) + '</td>' +
          '<td class="dpr-td-rack" title="' + escHtml(rackLayerText) + '"><span class="dpr-rack-badge">' + escHtml(rackLayerText) + '</span></td>' +
          '<td class="dpr-td-loc" title="' + escHtml(loc) + '">' + escHtml(loc) + '</td>' +
          '<td><span class="dpr-status-badge ' + escHtml(stCls) + '">' + escHtml(stLabel) + '</span></td>' +
          '<td title="' + escHtml(updated) + '">' + escHtml(updated) + '</td>' +
        '</tr>'
      );
    }

    html += '</tbody></table></div>';
    return html;
  }

  function renderBody(dp, host, list, itemType, smooth) {
    function doRender() {
      var item = getCurrentItem(dp);
      if (!item) {
        host.innerHTML = emptyHtml();
        return;
      }
      host.innerHTML = renderLifecycleTreeBody(item, itemType);
    }

    if (!smooth) {
      doRender();
      return;
    }

    try { host.classList.add('dpr-host-fading'); } catch (e) {}
    requestAnimationFrame(function () {
      doRender();
      requestAnimationFrame(function () {
        try { host.classList.remove('dpr-host-fading'); } catch (e2) {}
      });
    });
  }

  // -------------------- bind --------------------
  function bind(dp, container) {
    try {
      if (!dp || !container) return;
      ensureStateForRecord(dp);

      function getHostNow() {
        return container.querySelector('[data-dp-related-host]');
      }

      function syncViewButtons() {
        var v = getView(dp);
        var btns = container.querySelectorAll('.dpr-view-btn[data-dpr-view]');
        for (var i = 0; i < btns.length; i++) {
          var b = btns[i];
          if (!b) continue;
          b.classList.toggle('dpr-view-active', b.getAttribute('data-dpr-view') === v);
        }
      }

      function openPreviewByIndex(idx) {
        try {
          ensureStateForRecord(dp);
          var cache = dp.dprCache;
          if (!cache || cache.key !== recordKey(dp) || !Array.isArray(cache.list)) return;
          var row = cache.list[idx];
          if (!row) return;
          var rowItemType = getRowItemType(cache.itemType);

          if (typeof dp.openPreview === 'function') {
            dp.openPreview(row, rowItemType);
            return;
          }

          try {
            document.dispatchEvent(new CustomEvent('openDetailPanel', { detail: { item: row, type: rowItemType } }));
          } catch (e2) {}
        } catch (e) {}
      }

      async function openViewerByIndex(idx) {
        try {
          ensureStateForRecord(dp);
          var cache = dp.dprCache;
          if (!cache || cache.key !== recordKey(dp) || !Array.isArray(cache.list)) return;
          var row = cache.list[idx];
          if (!row) return;
          var rowItemType = getRowItemType(cache.itemType);

          var id = getRowId(row, rowItemType);
          var code = getRowCode(row, rowItemType) || id || '-';
          var name = getRowName(row, rowItemType) || '';
          var title = code + (name ? ' - ' + name : '');

          var url = await getFullImageUrlForDevice(rowItemType, id);
          viewerOpen({ title: title, url: url });
        } catch (e) {
          viewerOpen({ title: 'Ảnh', url: '' });
        }
      }

      // Delegation bind 1 lần
      if (!container.dataset.dprBound) {
        container.dataset.dprBound = '1';

        container.addEventListener('click', function (e) {
          try {
            ensureStateForRecord(dp);
            var host = getHostNow();
            if (!host) return;

            // 1) Chuyển view
            var viewBtn = e.target && e.target.closest ? e.target.closest('.dpr-view-btn[data-dpr-view]') : null;
            if (viewBtn) {
              e.preventDefault();
              e.stopPropagation();
              var v = viewBtn.getAttribute('data-dpr-view');
              setView(dp, v);
              syncViewButtons();
              var cache = dp.dprCache;
              if (cache && cache.key === recordKey(dp) && Array.isArray(cache.list)) {
                renderBody(dp, host, cache.list, cache.itemType, true);
              }
              return;
            }

            // 2) Click thumbnail => mở viewer (ưu tiên)
            var thumbWrap = e.target && e.target.closest ? e.target.closest('.dpr-thumb-wrap') : null;
            if (thumbWrap && host.contains(thumbWrap)) {
              var holder = thumbWrap.closest('[data-dpr-idx]');
              if (holder) {
                var idxV = Number(holder.getAttribute('data-dpr-idx'));
                if (!isNaN(idxV)) {
                  e.preventDefault();
                  e.stopPropagation();
                  openViewerByIndex(idxV);
                  return;
                }
              }
            }

            // 3) Click dòng/card => mở preview chi tiết
            var cardOrRow = e.target && e.target.closest ? e.target.closest('[data-dpr-open="1"]') : null;
            if (cardOrRow && host.contains(cardOrRow)) {
              var idx = Number(cardOrRow.getAttribute('data-dpr-idx'));
              if (!isNaN(idx)) {
                e.preventDefault();
                e.stopPropagation();
                openPreviewByIndex(idx);
                return;
              }
            }

          } catch (err) {
            // silent
          }
        });
      }

      // mỗi lần bind: render body theo record hiện tại
      var hostNow = getHostNow();
      if (!hostNow) return;

      var item = getCurrentItem(dp);
      if (!item) {
        hostNow.innerHTML = '<p class="no-data" style="padding:14px">Chưa chọn thiết bị.</p>';
        return;
      }

      var itemType = getCurrentItemType(dp);
      // Gắn loại thiết bị liên quan để đổi màu header (mold: xanh, cutter: cam)
      try {
        var rowItemType = getRowItemType(itemType);
        container.setAttribute(
          'data-dpr-rowtype',
          String(rowItemType || '').toLowerCase()
        );
      } catch (e) {
        // bỏ qua nếu có lỗi nhỏ, không ảnh hưởng chức năng chính
      }

      var list;
      if (dp.dprCache && dp.dprCache.key === recordKey(dp) && Array.isArray(dp.dprCache.list)) {
        list = dp.dprCache.list;
      } else {
        list = getList(dp, item, itemType);
        dp.dprCache = { key: recordKey(dp), list: Array.isArray(list) ? list : [], itemType: itemType };
      }

      setCount(container, dp.dprCache.list.length);
      syncViewButtons();
      renderBody(dp, hostNow, dp.dprCache.list, itemType, true);

    } catch (e) {
      // silent
    }
  }

  // Expose popup function ra window cho onclick handler trong Cay Vong Doi
  try { global.RelatedTabJobPopup = openJobDetailPopup; } catch(e2) {}

  // -------------------- export / register --------------------
  var RelatedTabModule = {
    version: VERSION,
    render: function (dp) { return render(dp); },
    bind: function (dp, container) { return bind(dp, container); }
  };

  try {
    if (!global.DetailPanelTabModules || typeof global.DetailPanelTabModules !== 'object') {
      global.DetailPanelTabModules = {};
    }
    global.DetailPanelTabModules.related = RelatedTabModule;
  } catch (e) {}

  // compat alias
  try { global.DetailPanelRelatedTabModule = RelatedTabModule; } catch (e2) {}

  // ready event
  try {
    document.dispatchEvent(new CustomEvent('detail-panel-related-tab-module-ready', { detail: { version: VERSION } }));
  } catch (e3) {}

  try { console.log('DetailPanel RelatedTabModule', VERSION, 'loaded'); } catch (e4) {}

})(window);

/* detail-panel-photos-tab-v8.4.3-1.js
   Detail Panel – Photos Tab Module (MoldCutterSearch)

   Mục tiêu bản -1:
   - Chuyển đổi Lưới/List luôn ổn định ngay cả khi chuyển sang record khác.
   - Mặc định luôn là Lưới (thumb) khi sang record mới (không nhớ view cũ giữa các record).
   - Chuyển view mượt (fade nhẹ), không giật màn hình.

   Yêu cầu:
   - detail-panel-v8.4.x (Tab Module Registry)
   - window.DevicePhotoStore (device-photo-store-v8.4.3.x.js)
   - window.PhotoUpload (photo-upload-v8.4.3.js)
   - window.PhotoManager (photo-manager-v8.4.4+)
*/

(function (global) {
  'use strict';

  var VERSION = 'v8.4.3-1';

  /* ════════════════════════════════════════
     HELPERS
  ════════════════════════════════════════ */
  function safeStr(v) { return (v == null) ? '' : String(v); }
  function trimStr(v) { return safeStr(v).trim(); }
  function escHtml(str) {
    return safeStr(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(val) {
    try {
      var d = new Date(val);
      if (isNaN(d.getTime())) return safeStr(val);
      var y  = d.getFullYear();
      var mo = String(d.getMonth() + 1).padStart(2, '0');
      var dd = String(d.getDate()).padStart(2, '0');
      var hh = String(d.getHours()).padStart(2, '0');
      var mm = String(d.getMinutes()).padStart(2, '0');
      return y + '-' + mo + '-' + dd + ' ' + hh + ':' + mm;
    } catch (e) {
      return safeStr(val);
    }
  }

  function fmtBytes(n) {
    var num = Number(n) || 0;
    if (num < 1024) return num + ' B';
    if (num < 1024 * 1024) return (num / 1024).toFixed(1) + ' KB';
    return (num / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /* ════════════════════════════════════════
     DEVICE INFO (đọc từ dp.currentItem)
  ════════════════════════════════════════ */
  function getDeviceType(dp) {
    return dp && dp.currentItemType ? String(dp.currentItemType).toLowerCase() : 'mold';
  }

  function getDeviceId(dp) {
    try {
      var it = dp && dp.currentItem ? dp.currentItem : null;
      if (!it) return '';
      var tp = getDeviceType(dp);
      if (tp === 'cutter') {
        return trimStr(it.CutterID || it.ID || it.CutterNo || it.CutterCode || it.code || it.Code);
      }
      return trimStr(it.MoldID || it.ID || it.MoldCode || it.MoldNo || it.code || it.Code);
    } catch (e) {
      return '';
    }
  }

  function getDeviceCode(dp) {
    try {
      var it = dp && dp.currentItem ? dp.currentItem : null;
      if (!it) return '';
      var tp = getDeviceType(dp);
      if (tp === 'cutter') {
        return trimStr(it.CutterNo || it.CutterCode || it.code || it.Code || it.CutterID);
      }
      return trimStr(it.MoldCode || it.code || it.Code || it.MoldNo || it.MoldID);
    } catch (e) {
      return '';
    }
  }

  function getDeviceDims(dp) {
    try {
      var it = dp && dp.currentItem ? dp.currentItem : null;
      if (!it) return '';
      var l = trimStr(it.DimensionsLength || it.DimLength || it.Length || it.L || '');
      var w = trimStr(it.DimensionsWidth  || it.DimWidth  || it.Width  || it.W || '');
      var h = trimStr(it.DimensionsDepth  || it.DimDepth  || it.Height || it.H || it.Depth || '');
      var dims = [l, w, h].filter(Boolean).join('x');
      if (!dims) dims = trimStr(it.displaySize || it.Size || it.Dimensions || '');
      return dims;
    } catch (e) {
      return '';
    }
  }

  /* ════════════════════════════════════════
     NOTIFY
  ════════════════════════════════════════ */
  function dpNotify(dp, message, type) {
    var msg = safeStr(message);
    var t = type || 'info';
    try {
      if (dp && typeof dp.notify === 'function') { dp.notify(msg, t); return; }
    } catch (e) {}

    try {
      if (global.NotificationModule && typeof global.NotificationModule.show === 'function') {
        global.NotificationModule.show(msg, t);
        return;
      }
    } catch (e2) {}

    try {
      if (global.notify && typeof global.notify[t] === 'function') {
        global.notify[t](msg);
        return;
      }
    } catch (e3) {}

    alert(msg);
  }

  /* ════════════════════════════════════════
     VIEW MODE
     - Không lưu view chung cho mọi record.
     - Mỗi record (deviceType + deviceId) luôn mặc định 'thumb'.
  ════════════════════════════════════════ */
  function _ptKey(dp) {
    return getDeviceType(dp) + '|' + getDeviceId(dp);
  }

  function getView(dp) {
    var key = _ptKey(dp);
    if (!dp) return 'thumb';
    if (!dp._ptViewKey || dp._ptViewKey !== key) return 'thumb';
    return dp._ptView || 'thumb';
  }

  function setView(dp, v) {
    if (!dp) return;
    dp._ptViewKey = _ptKey(dp);
    dp._ptView = (v === 'detail') ? 'detail' : 'thumb';
  }

  /* ════════════════════════════════════════
     CACHE / RENDER
  ════════════════════════════════════════ */
  function _renderByView(dp, host, list, smooth) {
    var v = getView(dp);

    function doRender() {
      if (v === 'detail') _renderDetail(dp, host, list);
      else _renderThumb(dp, host, list);
    }

    if (!smooth) { doRender(); return; }

    host.classList.add('pt-host-fading');
    requestAnimationFrame(function () {
      doRender();
      requestAnimationFrame(function () {
        host.classList.remove('pt-host-fading');
      });
    });
  }

  function _cacheKey(dp) {
    return _ptKey(dp);
  }

  function _ensureStateForRecord(dp) {
    if (!dp) return;
    var key = _ptKey(dp);
    if (dp._ptLastRecordKey !== key) {
      // Sang record mới: reset view về thumb + xóa cache/loading để tránh lẫn dữ liệu.
      dp._ptLastRecordKey = key;
      dp._ptViewKey = key;
      dp._ptView = 'thumb';
      dp._ptPhotoCache = null;
      dp._ptPhotoLoading = null;
    }
  }

  /* ════════════════════════════════════════
     CSS – nhúng một lần
  ════════════════════════════════════════ */
  function injectStyles() {
    if (document.getElementById('pt-styles-v8431')) return;
    var st = document.createElement('style');
    st.id = 'pt-styles-v8431';
    st.textContent = [
      /* Toolbar */
      '.pt-section { padding:0 !important; border:none !important; }',
      '.pt-toolbar { display:flex; align-items:center; justify-content:space-between;',
      '  flex-wrap:wrap; gap:6px; padding:8px 10px;',
      '  background:var(--bg-sidebar,#f8fafc);',
      '  border-radius:10px 10px 0 0;',
      '  border-bottom:1px solid var(--border-color,#e5e9f2); }',
      '.pt-toolbar-title { display:flex; align-items:center; gap:6px;',
      '  font-weight:700; font-size:13px; color:var(--text-primary,#0b1220); }',
      '.pt-toolbar-title .pt-ja { font-size:11px; opacity:0.7; display:inline; }',
      '.pt-toolbar-title .pt-ja::after { content:" / "; opacity:0.5; }',
      '.pt-toolbar-title .pt-vi { font-size:12px; display:inline; }',
      '.pt-device-badge { background:var(--color-ai-blue,#0068c9); color:#fff;',
      '  border-radius:999px; padding:2px 10px; font-size:11px; font-weight:700;',
      '  max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }',
      '.pt-toolbar-actions { display:flex; align-items:center; gap:4px; flex-wrap:wrap; }',

      /* View switcher */
      '.pt-view-switcher { display:flex; gap:2px; margin-left:4px;',
      '  border-left:1px solid var(--border-color,#e5e9f2); padding-left:6px; }',
      '.pt-view-btn { width:28px; height:28px; border:1px solid var(--border-color,#e5e9f2);',
      '  background:transparent; color:var(--text-secondary,#1f2937); border-radius:6px;',
      '  cursor:pointer; display:flex; align-items:center; justify-content:center;',
      '  font-size:13px; transition:background 0.15s,color 0.15s; }',
      '.pt-view-btn:hover, .pt-view-btn.pt-view-active {',
      '  background:var(--color-ai-blue,#0068c9); color:#fff; border-color:var(--color-ai-blue,#0068c9); }',

      /* Upload button */
      '.pt-btn-upload { background:rgba(0,104,201,0.08) !important;',
      '  border-color:rgba(0,104,201,0.3) !important;',
      '  color:var(--color-ai-blue,#0068c9) !important; font-weight:700 !important; }',
      '.pt-btn-upload:hover { background:var(--color-ai-blue,#0068c9) !important; color:#fff !important; }',

      /* Danger button */
      '.pt-btn-danger { background:rgba(239,68,68,0.08) !important;',
      '  color:#dc2626 !important; border-color:rgba(239,68,68,0.25) !important; }',
      '.pt-btn-danger:hover { background:#ef4444 !important; color:#fff !important; }',
      '.pt-row-btn { padding:3px 7px !important; font-size:11px !important; }',

      /* Smooth switching */
      '[data-dp-photo-host] { transition: opacity .12s ease; }',
      '.pt-host-fading { opacity: .25; }',
      '@media (prefers-reduced-motion: reduce) { [data-dp-photo-host] { transition:none; } }',

      /* Grid */
      '.pt-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(155px,1fr)); gap:10px; padding:10px; }',
      '.pt-card { border:1px solid var(--border-color,#e5e9f2); border-radius:10px; overflow:hidden;',
      '  background:#fff; box-shadow:0 1px 4px rgba(0,0,0,.05); transition:box-shadow 0.15s,transform 0.15s; }',
      '.pt-card:hover { box-shadow:0 4px 14px rgba(0,0,0,.10); transform:translateY(-1px); }',
      '.pt-card-trash { opacity:0.6; }',
      '.pt-card-img { height:115px; background:var(--bg-sidebar,#f8fafc); display:flex; align-items:center; justify-content:center;',
      '  position:relative; overflow:hidden; }',
      '.pt-card-no-img { color:#94a3b8; font-size:24px; }',
      '.pt-card-badge { position:absolute; top:6px; left:6px; padding:2px 7px; border-radius:999px; color:#fff;',
      '  font-weight:700; font-size:10px; display:flex; align-items:center; gap:3px; }',
      '.pt-badge-thumb { background:rgba(16,185,129,0.92); }',
      '.pt-badge-trash { background:rgba(239,68,68,0.92); left:auto; right:6px; }',
      '.pt-card-body { padding:7px 8px 9px; }',
      '.pt-card-name { font-size:11px; font-weight:700; color:#111827; white-space:nowrap; overflow:hidden;',
      '  text-overflow:ellipsis; margin-bottom:3px; }',
      '.pt-card-meta { font-size:10px; color:#6b7280; margin-bottom:5px; }',
      '.pt-card-actions { display:flex; gap:3px; flex-wrap:wrap; justify-content:flex-end; }',

      /* Detail table */
      '.pt-detail-wrap { overflow-x:auto; padding:8px 10px 10px; }',
      '.pt-detail-table { width:100%; border-collapse:collapse; font-size:12px; }',
      '.pt-detail-table thead th { padding:6px 8px; background:var(--bg-sidebar,#f8fafc); font-weight:700;',
      '  text-align:left; border-bottom:2px solid var(--border-color,#e5e9f2); white-space:nowrap; }',
      '.pt-detail-table thead th .pt-ja { font-size:9px; opacity:0.65; display:block; }',
      '.pt-detail-table thead th .pt-vi { font-size:11px; display:block; }',
      '.pt-detail-row td { padding:6px 8px; border-bottom:1px solid var(--border-color,#e5e9f2); vertical-align:middle; }',
      '.pt-detail-row:hover td { background:var(--bg-hover,rgba(15,118,110,0.05)); }',
      '.pt-row-trash td { opacity:0.6; }',
      '.pt-td-name { max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }',

      /* Bilingual */
      '.pt-ja { font-size:10px; opacity:0.72; display:block; line-height:1.2; }',
      '.pt-vi { font-size:11px; display:block; line-height:1.3; }'
    ].join('\n');

    document.head.appendChild(st);
  }

  /* ════════════════════════════════════════
     RENDER
  ════════════════════════════════════════ */
  function render(dp) {
    if (!dp || !dp.currentItem) {
      return (
        '<p class="no-data" style="padding:14px">' +
          '<span class="pt-ja">アイテムが選択されていません</span> ' +
          '<span class="pt-vi">Chưa chọn thiết bị.</span>' +
        '</p>'
      );
    }

    _ensureStateForRecord(dp);

    var tp = getDeviceType(dp);
    var deviceCode = escHtml(getDeviceCode(dp));
    var view = getView(dp);

    var titleJa = (tp === 'cutter') ? 'カッター写真' : '金型写真';
    var titleVi = (tp === 'cutter') ? 'Ảnh dao cắt' : 'Ảnh khuôn';

    return (
      '<div class="modal-section pt-section">' +

        '<div class="pt-toolbar">' +
          '<div class="pt-toolbar-title">' +
            '<i class="fas fa-camera"></i>' +
            '<span class="pt-ja">' + escHtml(titleJa) + '</span>' +
            '<span class="pt-vi">' + escHtml(titleVi) + '</span>' +
            (deviceCode
              ? '<span class="pt-device-badge" title="' + deviceCode + '">' + deviceCode + '</span>'
              : ''
            ) +
          '</div>' +

          '<div class="pt-toolbar-actions">' +
            '<button class="btn-action pt-btn-upload" type="button" data-dp-pt-action="upload" title="アップロード / Tải ảnh">' +
              '<i class="fas fa-cloud-upload-alt"></i>' +
              '<span class="pt-ja" style="display:inline;font-size:10px;margin-left:3px">アップロード</span>' +
              '<span class="pt-vi" style="display:inline;font-size:11px;margin-left:2px">Tải ảnh</span>' +
            '</button>' +

            '<button class="btn-action" type="button" data-dp-pt-action="open-manager" title="管理 / QL">' +
              '<i class="fas fa-th-large"></i>' +
              '<span class="pt-ja" style="display:inline;font-size:10px;margin-left:3px">管理</span>' +
              '<span class="pt-vi" style="display:inline;font-size:11px;margin-left:2px">QL</span>' +
            '</button>' +

            '<button class="btn-action" type="button" data-dp-pt-action="refresh" title="更新 / Làm mới">' +
              '<i class="fas fa-sync"></i>' +
            '</button>' +

            '<div class="pt-view-switcher">' +
              '<button class="pt-view-btn' + (view === 'thumb' ? ' pt-view-active' : '') + '" data-dp-pt-view="thumb" title="グリッド / Lưới thumbnail">' +
                '<i class="fas fa-th"></i>' +
              '</button>' +
              '<button class="pt-view-btn' + (view === 'detail' ? ' pt-view-active' : '') + '" data-dp-pt-view="detail" title="詳細 / Chi tiết">' +
                '<i class="fas fa-list"></i>' +
              '</button>' +
            '</div>' +

          '</div>' +
        '</div>' +

        '<div data-dp-photo-host style="margin-top:0">' +
          _loadingHtml() +
        '</div>' +

      '</div>'
    );
  }

  function _loadingHtml() {
    return (
      '<div style="padding:20px;text-align:center;color:var(--text-muted,#64748b)">' +
        '<i class="fas fa-spinner fa-spin" style="font-size:20px;opacity:0.6"></i>' +
        '<p style="margin:8px 0 0;font-weight:700">' +
          '<span class="pt-ja">読み込み中...</span> ' +
          '<span class="pt-vi">Đang tải...</span>' +
        '</p>' +
      '</div>'
    );
  }

  /* ════════════════════════════════════════
     BIND
  ════════════════════════════════════════ */
  function bind(dp, container) {
    if (!dp || !container) return;

    _ensureStateForRecord(dp);

    function getHostNow() {
      return container.querySelector('[data-dp-photo-host]');
    }

    function syncViewButtons() {
      var v = getView(dp);
      container.querySelectorAll('.pt-view-btn').forEach(function (b) {
        b.classList.toggle('pt-view-active', b.getAttribute('data-dp-pt-view') === v);
      });
    }

    // Delegation chỉ bind 1 lần trên container hiện tại
    if (!container.dataset.ptBound) {
      container.dataset.ptBound = '1';

      container.addEventListener('click', function (e) {
        // Mỗi click đều đảm bảo state theo record hiện tại (tránh khi đổi record mà container vẫn reuse)
        _ensureStateForRecord(dp);

        var host = getHostNow();
        if (!host) return;

        /* Nút Upload */
        var btnUp = e.target.closest ? e.target.closest('[data-dp-pt-action="upload"]') : null;
        if (btnUp) { _openUpload(dp, host); return; }

        /* Nút Photo Manager */
        var btnMgr = e.target.closest ? e.target.closest('[data-dp-pt-action="open-manager"]') : null;
        if (btnMgr) { _openManager(dp); return; }

        /* Nút Refresh */
        var btnRef = e.target.closest ? e.target.closest('[data-dp-pt-action="refresh"]') : null;
        if (btnRef) { loadIntoHost(dp, host, { force: true, smooth: true }); return; }

        /* Nút chuyển chế độ xem */
        var btnView = e.target.closest ? e.target.closest('[data-dp-pt-view]') : null;
        if (btnView) {
          var v = btnView.getAttribute('data-dp-pt-view');
          setView(dp, v);
          syncViewButtons();

          // đổi view: render lại từ cache nếu đúng record
          var key = _cacheKey(dp);
          if (dp._ptPhotoCache && dp._ptPhotoCache.key === key && Array.isArray(dp._ptPhotoCache.list)) {
            _renderByView(dp, host, dp._ptPhotoCache.list, true);
          } else {
            loadIntoHost(dp, host, { force: true, smooth: true });
          }
          return;
        }
      });
    }

    // Luôn đồng bộ trạng thái nút view (phòng trường hợp container reuse giữa record)
    syncViewButtons();

    // Lắng nghe sự kiện global cập nhật ảnh – bind 1 lần trên dp
    if (!dp._ptStoreBound) {
      dp._ptStoreBound = true;

      function _tryRefresh() {
        try {
          if (!dp.panel || !dp.panel.classList.contains('open')) return;
          if (String(dp.currentTab).toLowerCase() !== 'photos') return;
          var h = dp.panel.querySelector('[data-tab-content="photos"] [data-dp-photo-host]');
          if (h) loadIntoHost(dp, h, { force: true, smooth: true });
        } catch (e) { /* ignore */ }
      }

      document.addEventListener('device-photos-changed', _tryRefresh);
      document.addEventListener('photo-upload-done', _tryRefresh);
    }

    // Load lần đầu (hoặc khi sang record mới: _ensureStateForRecord đã xóa cache)
    var host = getHostNow();
    if (host) loadIntoHost(dp, host, { force: false, smooth: true });
  }

  /* ════════════════════════════════════════
     OPEN UPLOAD
  ════════════════════════════════════════ */
  function _openUpload(dp, host) {
    try {
      if (!global.PhotoUpload || typeof global.PhotoUpload.open !== 'function') {
        dpNotify(dp, 'Chưa có PhotoUpload. Cần load photo-upload-v8.4.3.js.', 'error');
        return;
      }

      var tp       = getDeviceType(dp);
      var deviceId = getDeviceId(dp);
      var deviceCode = getDeviceCode(dp);
      var deviceDims = getDeviceDims(dp);

      global.PhotoUpload.open({
        mode: 'device',
        deviceType: tp,
        deviceId: deviceId,
        deviceCode: deviceCode,
        deviceDims: deviceDims,
        onDone: function () {
          // Sau upload: luôn reload thật
          loadIntoHost(dp, host, { force: true, smooth: true });
        }
      });
    } catch (e) {
      dpNotify(dp, (e && e.message) ? e.message : 'Không mở được tool upload ảnh.', 'error');
    }
  }

  /* ════════════════════════════════════════
     OPEN PHOTO MANAGER
  ════════════════════════════════════════ */
  function _openManager(dp) {
    try {
      if (global.PhotoManager && typeof global.PhotoManager.open === 'function') {
        global.PhotoManager.open({
          deviceType: getDeviceType(dp),
          deviceId: getDeviceId(dp),
          deviceCode: getDeviceCode(dp)
        });
        return;
      }
      dpNotify(dp, 'Chưa có PhotoManager. Cần load photo-manager-v8.4.4.js.', 'warning');
    } catch (e) {
      dpNotify(dp, (e && e.message) ? e.message : 'Không mở được Photo Manager.', 'error');
    }
  }

  /* ════════════════════════════════════════
     LOAD INTO HOST (single-flight + cache theo record)
  ════════════════════════════════════════ */
  async function loadIntoHost(dp, host, opts) {
    if (!dp || !host) return;
    opts = opts || {};

    _ensureStateForRecord(dp);

    // Nếu host bị render lại (node cũ không còn gắn vào UI), tự tìm host mới
    try {
      if (host && host.isConnected === false && dp && dp.panel) {
        var h2 = dp.panel.querySelector('[data-tab-content="photos"] [data-dp-photo-host]');
        if (h2) host = h2;
      }
    } catch (eH) { /* ignore */ }

    var tp       = getDeviceType(dp);
    var deviceId = getDeviceId(dp);
    var key      = _cacheKey(dp);
    var force    = !!opts.force;
    var smooth   = (opts.smooth !== false);

    // Nếu đã có cache đúng record và không force: render ngay
    if (!force && dp._ptPhotoCache && dp._ptPhotoCache.key === key && Array.isArray(dp._ptPhotoCache.list)) {
      _renderByView(dp, host, dp._ptPhotoCache.list, smooth);
      return;
    }

    // Nếu đang tải đúng record: chờ xong rồi render
    if (dp._ptPhotoLoading && dp._ptPhotoLoading.key === key && dp._ptPhotoLoading.promise) {
      try { await dp._ptPhotoLoading.promise; } catch (eWait) {}
      if (dp._ptPhotoCache && dp._ptPhotoCache.key === key && Array.isArray(dp._ptPhotoCache.list)) {
        _renderByView(dp, host, dp._ptPhotoCache.list, smooth);
      }
      return;
    }

    // Nếu force: xóa cache record hiện tại để chắc chắn lấy dữ liệu mới
    if (force) {
      dp._ptPhotoCache = null;
    }

    var hasCache = dp._ptPhotoCache && dp._ptPhotoCache.key === key && Array.isArray(dp._ptPhotoCache.list);
    if (!hasCache) host.innerHTML = _loadingHtml();
    else host.classList.add('pt-host-fading');

    var p = (async function () {
      // Kiểm tra DevicePhotoStore
      if (!global.DevicePhotoStore || typeof global.DevicePhotoStore.listForDevice !== 'function') {
        host.innerHTML =
          '<p class="no-data" style="padding:14px">' +
            '<i class="fas fa-exclamation-triangle" style="color:#f59e0b;margin-right:6px"></i>' +
            '<span class="pt-ja">DevicePhotoStore が見つかりません</span>' +
            '<span class="pt-vi">Thiếu DevicePhotoStore (device-photo-store-v8.4.3.js).</span>' +
          '</p>';
        return [];
      }

      // ensureReady nếu có
      try {
        if (typeof global.DevicePhotoStore.ensureReady === 'function') {
          await global.DevicePhotoStore.ensureReady();
        }
      } catch (e0) { /* ignore */ }

      var rows = await global.DevicePhotoStore.listForDevice(
        tp, safeStr(deviceId),
        { pageSize: 120, orderBy: 'createdat', ascending: false }
      );

      var list = Array.isArray(rows) ? rows : [];
      dp._ptPhotoCache = { key: key, list: list, ts: Date.now() };
      return list;
    })();

    dp._ptPhotoLoading = { key: key, promise: p };

    try {
      var list = await p;

      if (!list || !list.length) {
        host.innerHTML =
          '<div style="padding:14px;color:#64748b">' +
            '<i class="fas fa-images" style="opacity:0.7;margin-right:6px"></i>' +
            '<span class="pt-ja">写真がありません</span>' +
            '<span class="pt-vi">Chưa có ảnh cho thiết bị này.</span>' +
          '</div>';
        return;
      }

      _renderByView(dp, host, list, smooth);

    } catch (e) {
      host.innerHTML =
        '<div style="padding:14px;border:1px solid rgba(239,68,68,0.35);' +
               'background:rgba(239,68,68,0.06);border-radius:12px;color:#991b1b">' +
          '<i class="fas fa-exclamation-circle" style="margin-right:6px"></i>' +
          '<span class="pt-ja">写真の読み込みに失敗しました</span>' +
          '<span class="pt-vi"> Không tải được ảnh.</span>' +
          '<br><small style="opacity:0.8">' + escHtml(e && e.message ? e.message : String(e)) + '</small>' +
        '</div>';
    } finally {
      if (dp._ptPhotoLoading && dp._ptPhotoLoading.key === key) dp._ptPhotoLoading = null;
      host.classList.remove('pt-host-fading');
    }
  }

  /* ════════════════════════════════════════
     RENDER THUMBNAIL GRID
  ════════════════════════════════════════ */
  function _renderThumb(dp, host, list) {
    var html = '<div class="pt-grid">';

    list.forEach(function (r) {
      var id      = safeStr(r.id);
      var url = (
        r.thumb_public_url ||
        r.thumbnail_public_url ||
        r.thumbnail_url ||
        r.thumbnailurl ||
        r.thumbnailUrl ||
        r.thumbpublicurl ||
        r.thumbnailpublicurl ||
        ''
      );

      var file    = r.originalfilename || r.originalFileName || r.filename ||
                    r.storagepath     || r.storagePath       || 'no name';
      var created = r.createdat || r.createdAt || '';
      var isThumb = !!(r.isthumbnail || r.isThumbnail);
      var isTrash = !!(r.istrash     || r.isTrash || r.trash || r.deleted || r.isdeleted);
      var size    = fmtBytes(r.filesize || r.fileSize || 0);
      var dateStr = created ? fmtDate(created) : '';

      html +=
        '<div class="pt-card' + (isTrash ? ' pt-card-trash' : '') + '" data-pt-id="' + escHtml(id) + '">' +
          '<div class="pt-card-img">' +
            (url
              ? '<img src="' + escHtml(url) + '" alt="' + escHtml(file) + '" loading="lazy" style="width:100%;height:100%;object-fit:cover">'
              : '<div class="pt-card-no-img"><i class="fas fa-image"></i></div>'
            ) +
            (isThumb
              ? '<div class="pt-card-badge pt-badge-thumb">' +
                  '<i class="fas fa-star"></i>' +
                  '<span class="pt-ja" style="display:inline">サム</span>' +
                  '<span class="pt-vi" style="display:inline"> Thumb</span>' +
                '</div>'
              : '') +
            (isTrash
              ? '<div class="pt-card-badge pt-badge-trash">' +
                  '<i class="fas fa-trash"></i>' +
                  '<span class="pt-vi" style="display:inline"> Rác</span>' +
                '</div>'
              : '') +
          '</div>' +

          '<div class="pt-card-body">' +
            '<div class="pt-card-name" title="' + escHtml(file) + '">' + escHtml(file) + '</div>' +
            '<div class="pt-card-meta">' +
              escHtml(size) + (dateStr ? ' · ' + escHtml(dateStr) : '') +
            '</div>' +
            '<div class="pt-card-actions">' +
              _rowBtns(id) +
            '</div>' +
          '</div>' +
        '</div>';
    });

    html += '</div>';
    host.innerHTML = html;
    _bindRowActions(dp, host, list);
  }

  /* ════════════════════════════════════════
     RENDER DETAIL TABLE
  ════════════════════════════════════════ */
  function _renderDetail(dp, host, list) {
    var html =
      '<div class="pt-detail-wrap">' +
        '<table class="pt-detail-table">' +
          '<thead><tr>' +
            '<th style="width:52px"></th>' +
            '<th><span class="pt-ja">ファイル名</span><span class="pt-vi">Tên file</span></th>' +
            '<th><span class="pt-ja">サイズ</span><span class="pt-vi">Dung lượng</span></th>' +
            '<th><span class="pt-ja">作成日</span><span class="pt-vi">Ngày tạo</span></th>' +
            '<th><span class="pt-ja">状態</span><span class="pt-vi">Trạng thái</span></th>' +
            '<th style="width:148px"><span class="pt-ja">操作</span><span class="pt-vi">Thao tác</span></th>' +
          '</tr></thead>' +
          '<tbody>';

    list.forEach(function (r) {
      var id      = safeStr(r.id);
      var url = (r.publicurl || r.publicUrl || '');
      var thumb = (
        r.thumb_public_url ||
        r.thumbnail_public_url ||
        r.thumbnail_url ||
        r.thumbnailurl ||
        r.thumbnailUrl ||
        r.thumbpublicurl ||
        r.thumbnailpublicurl ||
        ''
      );

      var file    = r.originalfilename || r.originalFileName || r.filename ||
                    r.storagepath     || r.storagePath       || 'no name';
      var created = r.createdat || r.createdAt || '';
      var isThumb = !!(r.isthumbnail || r.isThumbnail);
      var isTrash = !!(r.istrash     || r.isTrash || r.trash || r.deleted || r.isdeleted);
      var isInbox = (r.state === 'inbox');
      var size    = fmtBytes(r.filesize || r.fileSize || 0);
      var dateStr = created ? fmtDate(created) : '';

      var stateHtml = isTrash
        ? '<span style="color:#dc2626"><i class="fas fa-trash"></i> ' +
            '<span class="pt-ja" style="display:inline">ゴミ箱</span> ' +
            '<span class="pt-vi" style="display:inline">Thùng rác</span>' +
          '</span>'
        : isInbox
          ? '<span style="color:#d97706"><i class="fas fa-inbox"></i> ' +
              '<span class="pt-ja" style="display:inline">受信</span> ' +
              '<span class="pt-vi" style="display:inline">Hộp thư</span>' +
            '</span>'
          : '<span style="color:#059669"><i class="fas fa-check-circle"></i> ' +
              '<span class="pt-ja" style="display:inline">有効</span> ' +
              '<span class="pt-vi" style="display:inline">Hoạt động</span>' +
            '</span>';

      html +=
        '<tr class="pt-detail-row' + (isTrash ? ' pt-row-trash' : '') + '" data-pt-id="' + escHtml(id) + '">' +
          '<td>' +
            (thumb
              ? '<img src="' + escHtml(thumb) + '" style="width:44px;height:44px;object-fit:cover;border-radius:6px" loading="lazy">'
              : '<div style="width:44px;height:44px;background:var(--border-color,#e5e9f2);border-radius:6px;display:flex;align-items:center;justify-content:center;color:#94a3b8"><i class="fas fa-image"></i></div>'
            ) +
          '</td>' +
          '<td class="pt-td-name">' +
            (isThumb ? '<i class="fas fa-star" style="color:#10b981;margin-right:4px" title="Thumbnail"></i>' : '') +
            '<span title="' + escHtml(file) + '">' + escHtml(file) + '</span>' +
          '</td>' +
          '<td style="white-space:nowrap">' + escHtml(size) + '</td>' +
          '<td style="white-space:nowrap">' + escHtml(dateStr) + '</td>' +
          '<td>' + stateHtml + '</td>' +
          '<td><div class="pt-card-actions">' + _rowBtns(id) + '</div></td>' +
        '</tr>';
    });

    html +=
          '</tbody>' +
        '</table>' +
      '</div>';

    host.innerHTML = html;
    _bindRowActions(dp, host, list);
  }

  /* ════════════════════════════════════════
     ROW BUTTONS
  ════════════════════════════════════════ */
  function _rowBtns(id) {
    var eid = escHtml(id);
    return `
      <button class="btn-action pt-row-btn" type="button"
        data-pt-row-action="download" data-pt-id="${eid}" title="Download">
        <i class="fas fa-download"></i>
      </button>
      <button class="btn-action pt-row-btn" type="button" data-pt-row-action="copy" data-pt-id="${eid}" title="Copy link">
        <i class="fas fa-link"></i>
      </button>
      <button class="btn-action pt-row-btn" type="button" data-pt-row-action="thumb" data-pt-id="${eid}" title="Đặt thumbnail">
        <i class="fas fa-star"></i>
      </button>
      <button class="btn-action pt-row-btn pt-btn-danger" type="button" data-pt-row-action="trash" data-pt-id="${eid}" title="Thùng rác">
        <i class="fas fa-trash"></i>
      </button>
    `;

  }

  /* ════════════════════════════════════════
     BIND ROW ACTIONS
  ════════════════════════════════════════ */
  function _bindRowActions(dp, host, list) {
    host.querySelectorAll('[data-pt-row-action]').forEach(function (btn) {
      if (btn.dataset.ptBound) return;
      btn.dataset.ptBound = '1';

      btn.addEventListener('click', async function (e) {
        e.stopPropagation();
        var action = btn.getAttribute('data-pt-row-action');
        var id     = btn.getAttribute('data-pt-id');

        var row = null;
        try {
          row = list.find(function (x) { return safeStr(x.id) === safeStr(id); }) || null;
        } catch (eFind) {}

        var url = row ? (row.publicurl || row.publicUrl || '') : '';

        try {
          // Download ảnh thật
          if (action === 'download') {
            if (!row) { dpNotify(dp, 'Không tìm thấy ảnh.', 'warning'); return; }

            const fullUrl = safeStr(row.publicurl || row.publicUrl || row.public_url || row.fullurl || row.fullUrl).trim();
            if (!fullUrl) { dpNotify(dp, 'Ảnh này chưa có public URL để tải.', 'warning'); return; }

            const baseName = safeStr(row.originalfilename || row.originalFileName || row.filename || row.storagepath || 'photo');
            const safeName = baseName.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 120);

            // Download: ưu tiên fetch->blob, fallback <a href>
            try {
              const resp = await fetch(fullUrl, { mode: 'cors', credentials: 'omit' });
              if (!resp.ok) throw new Error('HTTP ' + resp.status);
              const blob = await resp.blob();
              const objUrl = URL.createObjectURL(blob);

              const a = document.createElement('a');
              a.href = objUrl;
              a.download = safeName;
              document.body.appendChild(a);
              a.click();
              a.remove();

              setTimeout(() => { try { URL.revokeObjectURL(objUrl); } catch (e2) {} }, 800);
              return;
            } catch (eFetch) {
              const a2 = document.createElement('a');
              a2.href = fullUrl;
              a2.download = safeName;
              a2.target = '_blank';
              a2.rel = 'noopener';
              document.body.appendChild(a2);
              a2.click();
              a2.remove();
              return;
            }
          }

          // Copy link
          if (action === 'copy') {
            if (!url) { dpNotify(dp, 'Ảnh này chưa có public URL để copy.', 'warning'); return; }
            try {
              if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                await navigator.clipboard.writeText(url);
              } else {
                var ta = document.createElement('textarea');
                ta.value = url;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
              }
              dpNotify(dp, 'Đã copy link ảnh.', 'success');
            } catch (eCopy) {
              dpNotify(dp, 'Copy thất bại. URL: ' + url, 'warning');
            }
            return;
          }

          // Đặt thumbnail
          if (action === 'thumb') {
            if (!global.DevicePhotoStore || typeof global.DevicePhotoStore.setThumbnail !== 'function') {
              dpNotify(dp, 'DevicePhotoStore không có setThumbnail.', 'error');
              return;
            }
            if (!confirm('Đặt ảnh này làm thumbnail cho thiết bị?')) return;
            await global.DevicePhotoStore.setThumbnail(Number(id));
            dpNotify(dp, 'Đã đặt làm thumbnail.', 'success');
            loadIntoHost(dp, host, { force: true, smooth: true });
            return;
          }

          // Thùng rác
          if (action === 'trash') {
            if (!global.DevicePhotoStore || typeof global.DevicePhotoStore.moveToTrash !== 'function') {
              dpNotify(dp, 'DevicePhotoStore không có moveToTrash.', 'error');
              return;
            }
            if (!confirm('Chuyển ảnh vào thùng rác?')) return;
            await global.DevicePhotoStore.moveToTrash(Number(id), { moveFile: true });
            dpNotify(dp, 'Đã chuyển vào thùng rác.', 'success');
            loadIntoHost(dp, host, { force: true, smooth: true });
            return;
          }

        } catch (e) {
          dpNotify(dp, (e && e.message) ? e.message : 'Thao tác ảnh bị lỗi.', 'error');
        }
      });
    });

    // Click trực tiếp vào thumbnail -> mở ảnh thật trong viewer in-page (MCSQuickPhotoViewer)
    if (!host.dataset.ptImgClickBound) {
      host.dataset.ptImgClickBound = '1';
      host.addEventListener('click', function (e) {
        try {
          // Nếu click vào nút action thì bỏ qua
          if (e.target && e.target.closest && e.target.closest('[data-pt-row-action]')) return;

          const img = (e.target && e.target.tagName === 'IMG')
            ? e.target
            : (e.target && e.target.closest ? e.target.closest('.pt-card-img img, .pt-detail-row td img') : null);
          if (!img) return;

          const wrap = img.closest('[data-pt-id]');
          const id = wrap ? safeStr(wrap.getAttribute('data-pt-id')).trim() : '';
          if (!id) return;

          let row = null;
          try { row = list.find(x => safeStr(x.id) === safeStr(id)); } catch (eFind) {}
          if (!row) { dpNotify(dp, 'Không tìm thấy ảnh.', 'warning'); return; }

          const fullUrl = safeStr(row.publicurl || row.publicUrl || row.public_url || row.fullurl || row.fullUrl).trim();
          if (!fullUrl) { dpNotify(dp, 'Ảnh này chưa có public URL để xem.', 'warning'); return; }

          const file = safeStr(row.originalfilename || row.originalFileName || row.filename || row.storagepath || 'photo');
          const dev = safeStr(getDeviceCode(dp));
          const title = (dev ? (dev + ' - ') : '') + file;

          if (global.MCSQuickPhotoViewer && typeof global.MCSQuickPhotoViewer.open === 'function') {
            global.MCSQuickPhotoViewer.open({ title: title, url: fullUrl });
          } else {
            // fallback cuối cùng (tránh nhưng vẫn xem được)
            window.open(fullUrl, '_blank', 'noopener');
          }
        } catch (err) {}
      }, true);
    }

  }

  /* ════════════════════════════════════════
     INIT / EXPORT
  ════════════════════════════════════════ */
  injectStyles();

  var PhotosTabModule = {
    version: VERSION,
    render: function (dp) { return render(dp); },
    bind: function (dp, container) { return bind(dp, container); },
    loadIntoHost: async function (dp, host) { return await loadIntoHost(dp, host, { force: true, smooth: true }); }
  };

  // Đăng ký vào Tab Module Registry của DetailPanel
  try {
    if (!global.DetailPanelTabModules || typeof global.DetailPanelTabModules !== 'object') {
      global.DetailPanelTabModules = {};
    }
    global.DetailPanelTabModules.photos = PhotosTabModule;
  } catch (e) { /* ignore */ }

  // Compat alias
  try { global.DetailPanelPhotosTabModule = PhotosTabModule; } catch (e2) { /* ignore */ }

  // Dispatch event báo load xong
  try {
    document.dispatchEvent(new CustomEvent('detail-panel-photos-tab-module-ready', { detail: { version: VERSION } }));
  } catch (e3) {}

  try { console.log('DetailPanel PhotosTabModule ' + VERSION + ' loaded'); } catch (e4) {}

})(window);

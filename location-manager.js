// v9.0.2
/* =========================================================
   LOCATION MANAGER v8.5.8
   Quản lý Vị Trí / Giá Kệ (Racks & RackLayers)
========================================================= */

(function (global) {
  'use strict';

  // Helper cho API URL giống như quick-update
  function resolveApiUrl(path) {
    var p = String(path || '').trim();
    if (!p) return '';
    if (/^https?:\/\//i.test(p)) return p;
    var normalized = p.charAt(0) === '/' ? p : ('/' + p);
    var base = global && global.MCS_API_BASE_URL;
    if (base && String(base).trim() && String(base).trim() !== 'undefined' && String(base).trim() !== 'null') {
      return String(base).replace(/\/+$/, '') + normalized;
    }
    return 'https://ysd-moldcutter-backend.onrender.com' + normalized;
  }

  var API_UPSERT = resolveApiUrl('/api/csv/upsert');

  var LocationManager = {
    isOpen: false,
    selectedRackId: null,

    // Dữ liệu nội bộ
    racks: [],
    layers: [],
    searchQuery: '',
    viewMode: 'mold', // 'mold' hoặc 'tray'

    open: function () {
      this.initDOM();
      this.refreshData();

      // Auto-set UI logic toggle
      this.setViewMode(this.viewMode || 'mold');

      this.isOpen = true;

      // Ensure other views hide
      document.querySelectorAll('.main-content > .content-area').forEach(el => el.style.display = 'none');
      var container = document.getElementById('mcs-view-location');
      if (container) container.style.display = 'block';

      // Un-highlight all navs, highlight location nav
      document.querySelectorAll('.sidebar .nav-link').forEach(el => el.classList.remove('active'));
      var btn = document.getElementById('sidebarLocationManagerBtn');
      if (btn) btn.classList.add('active');

      this.updateStats();
      this.renderSidebar();
      this.selectRack(null); // Show empty state
    },

    setViewMode: function (mode) {
      this.viewMode = mode;

      var btnMold = document.getElementById('locm-btn-mode-mold');
      var btnTray = document.getElementById('locm-btn-mode-tray');
      if (btnMold && btnTray) {
        if (mode === 'mold') {
          btnMold.style.background = '#0f172a'; btnMold.style.color = '#fff';
          btnTray.style.background = '#f8fafc'; btnTray.style.color = '#64748b';
        } else {
          btnTray.style.background = '#0f172a'; btnTray.style.color = '#fff';
          btnMold.style.background = '#f8fafc'; btnMold.style.color = '#64748b';
        }
      }

      // Reload the grid if currently open
      var rightPane = document.getElementById('locm-layer-grid');
      var gridControls = document.getElementById('locm-layer-grid-controls');
      if (rightPane && gridControls && gridControls.style.display !== 'none') {
        var countLabel = document.getElementById('locm-selected-layer-count');
        if (countLabel) {
          var currentText = countLabel.innerText;
          var isViewingRack = currentText.includes('Tầng'); // if looking at rack logic
          var activeLayerBtn = document.querySelector('.locm-layer-item.active');
          if (activeLayerBtn) {
            this.drilldownLayer(activeLayerBtn.dataset.id);
          }
        }
      } else {
        var kpiLayers = document.getElementById('locm-kpi-layers');
        if (kpiLayers && kpiLayers.classList.contains('history-stat-active')) {
          this.renderAllLayersGrid();
        }
      }
    },

    updateStats: function () {
      if (!this.racks || !this.layers) return;
      var totalLocs = this.layers.length;
      var idTotal = document.getElementById('locmStatTotal'); if (idTotal) idTotal.innerText = this.racks.length;
      var idLayer = document.getElementById('locmStatLayers'); if (idLayer) idLayer.innerText = totalLocs;
    },

    close: function () {
      this.isOpen = false;
      var rsHtml = document.getElementById('locm-rack-global-search');
      if (rsHtml) rsHtml.parentNode.removeChild(rsHtml);
      var globalSearchWrap = document.getElementById('globalSearchWrap');
      if (globalSearchWrap) globalSearchWrap.style.display = '';
      var filterBtn = document.getElementById('filterDetailBtn');
      if (filterBtn && filterBtn.getAttribute('data-locm-hidden') === 'true') {
        filterBtn.removeAttribute('data-locm-hidden');
        filterBtn.style.display = '';
      }
    },

    fetchActivePhoto: async function (deviceType, deviceId) {
      if (!window.DevicePhotoStore) return null;
      var store = window.DevicePhotoStore;
      try {
        if (typeof store.ensureReady === 'function') await store.ensureReady();
        var thumb = await store.getThumbnailUrl(deviceType, String(deviceId));
        if (thumb) return thumb;
        if (typeof store.listForDevice === 'function') {
          var list = await store.listForDevice(deviceType, String(deviceId));
          var active = list.find(function (p) { return String(p.status) === '1' || p.status === true || String(p.status) === 'active' || p.state === 'active'; });
          if (!active && list.length > 0) active = list[0];
          if (active) {
            return active.thumb_public_url || active.thumbpublicurl || active.thumbPublicUrl ||
              active.public_url || active.publicurl || active.publicUrl || null;
          }
        }
      } catch (e) { }
      return null;
    },

    loadGridThumbs: function () {
      var thumbs = document.querySelectorAll('.locm-rack-grid-thumb');
      if (!thumbs || thumbs.length === 0) return;
      thumbs.forEach(async function (div) {
        var rId = div.getAttribute('data-rackid');
        if (rId) {
          var imgUrl = await LocationManager.fetchActivePhoto('rack', rId);
          if (imgUrl) {
            div.innerHTML = '<img src="' + escapeHtml(imgUrl) + '" style="width:100%; height:100%; object-fit:cover; border-radius:4px; cursor:zoom-in;">';
            div.style.border = 'none';

            // Click thumb image → open preview popup (stop propagation to avoid selectRack)
            var imgEl = div.querySelector('img');
            if (imgEl) {
              imgEl.addEventListener('click', function (e) {
                e.stopPropagation();
                LocationManager.openPhotoPreviewPopup('ラック ' + rId, imgUrl, imgUrl);
              });
            }
          }
        }
      });
    },

    initDOM: function () {
      var container = document.getElementById('mcs-view-location');
      if (!container || container.querySelector('.locm-v2-container')) return;

      var styleEl = document.getElementById('locm-v2-density-css');
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'locm-v2-density-css';
        styleEl.innerHTML = '#locm-layer-grid table td, #locm-layer-grid table th { padding: 4px 8px !important; } #locm-picker-list .locm-picker-item { padding: 8px 16px !important; }';
        document.head.appendChild(styleEl);
      }

      var globalSearchWrap = document.getElementById('globalSearchWrap');
      if (globalSearchWrap && !document.getElementById('locm-rack-global-search')) {
        var rsHtml = document.createElement('div');
        rsHtml.id = 'locm-rack-global-search';
        rsHtml.style.display = 'flex';
        rsHtml.style.flex = '1';
        rsHtml.style.gap = '8px';
        rsHtml.innerHTML = `
           <div style="position:relative; flex:1;">
              <i class="fas fa-search" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:#cbd5e1; z-index:2;"></i>
              <input type="text" id="locm-rack-search-input" class="search-input" style="width:100%; border-radius:20px; margin:0; padding-left:36px; padding-right: 32px; font-size:14px; position:relative; z-index:1; background:#fff; border:1px solid #cbd5e1;" placeholder="ラックを検索... / Tìm Giá, Tầng (VD: ASH020)..." autocomplete="off">
              <!-- DROPDOWN -->
              <div id="locm-rack-dropdown" style="display:none; position:absolute; top:calc(100% + 4px); left:0; width:100%; max-height:350px; overflow-y:auto; background:#fff; border:1px solid #cbd5e1; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1); border-radius:6px; z-index:9999;">
                 <div id="locm-rack-list" style="padding:4px 0;"></div>
              </div>
           </div>
           <button class="topbar-btn" id="locm-picker-trigger-btn" title="リストから選択 / Chọn từ danh sách" style="white-space:nowrap; padding: 0 16px; font-size:14px; border:1px solid #cbd5e1; background:#f8fafc; border-radius:6px; font-weight:600; color:#475569;" onclick="LocationManager.openRackPicker()"><i class="fas fa-list-ul"></i> <span style="font-weight:400; font-size:13px; margin-left:6px;" class="vi">Chọn danh sách</span><span style="font-weight:400; font-size:13px; margin-left:6px;" class="ja">リストから選択</span></button>
         `;
        globalSearchWrap.parentNode.insertBefore(rsHtml, globalSearchWrap);
        globalSearchWrap.style.display = 'none';

        var filterBtn = document.getElementById('filterDetailBtn');
        if (filterBtn) {
          filterBtn.setAttribute('data-locm-hidden', 'true');
          filterBtn.style.display = 'none';
        }
      }

      var html = `
        <div class="locm-v2-container" style="display:flex; flex-direction:column; height: 100%; height: calc(100vh - 60px);">
          <!-- Hidden inputs for backward JS compatibility -->
          <input type="hidden" id="locm-search-input" class="history-search-input">

          <div class="locm-dashboard-header" style="padding: 10px 20px; border-bottom: 1px solid #e2e8f0; display:flex; justify-content:space-between; align-items: center; background: #fff; z-index:100; min-height:48px;">
             <!-- KPIs -->
             <div class="history-stats" style="margin:0; padding:0; background:transparent; border:none; gap:12px; flex-wrap:nowrap;">
                 <div class="history-stat-card history-stat-active" id="locm-kpi-racks" style="min-width:140px; padding:6px 12px; margin:0; cursor:pointer; align-items:center;" onclick="LocationManager.selectRack(null)">
                    <div class="history-stat-icon" style="background:#0f172a;color:#fff;width:28px;height:28px;font-size:13px; flex-shrink:0;"><i class="fas fa-layer-group"></i></div>
                    <div style="flex:1;"><div class="history-stat-label" style="font-size:13px; font-weight:700; color:#1e293b; margin-bottom:2px;"><span class="ja">ラック一覧</span></div><div class="history-stat-value" style="font-size:11px; color:#64748b; font-weight:normal;">DS Giá: <span id="locmStatTotal" style="font-weight:700; color:#0ea5e9;">0</span></div></div>
                 </div>
                 <div class="history-stat-card" id="locm-kpi-layers" style="min-width:140px; padding:6px 12px; margin:0; cursor:pointer; align-items:center;" onclick="LocationManager.renderAllLayersGrid()">
                    <div class="history-stat-icon" style="background:#16a34a;color:#fff;width:28px;height:28px;font-size:13px; flex-shrink:0;"><i class="fas fa-box"></i></div>
                    <div style="flex:1;"><div class="history-stat-label" style="font-size:13px; font-weight:700; color:#1e293b; margin-bottom:2px;"><span class="ja">棚一覧</span></div><div class="history-stat-value" style="font-size:11px; color:#64748b; font-weight:normal;">DS Tầng: <span id="locmStatLayers" style="font-weight:700; color:#10b981;">0</span></div></div>
                 </div>
             </div>
             
             <!-- NEW RACK BTN -->
             <div style="display:flex; align-items:center;">
                <!-- NEW: Toggle View Mode -->
                <div class="locm-view-mode-toggle" style="display:flex; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden; margin-right: 16px;">
                   <button onclick="LocationManager.setViewMode('mold')" id="locm-btn-mode-mold" style="border:none; padding:6px 12px; cursor:pointer; font-weight:600; background:#0f172a; color:#fff;" title="Xem Khuôn">
                      <i class="fas fa-cubes"></i> Khuôn
                   </button>
                   <button onclick="LocationManager.setViewMode('tray')" id="locm-btn-mode-tray" style="border:none; padding:6px 12px; cursor:pointer; font-weight:600; background:#f8fafc; color:#64748b;" title="Xem Khay">
                      <i class="fas fa-box"></i> Khay
                   </button>
                </div>
                <button class="history-btn locm-btn-outline" id="locm-add-rack-btn" style="border-color:#0ea5e9; color:#0ea5e9; padding:6px 16px; font-size:13px; font-weight:600;"><i class="fas fa-plus"></i> Thêm Giá Kệ / ラック追加</button>
             </div>
          </div>
          
          <div class="locm-dashboard-body" style="display: flex; flex: 1; min-height: 0; background: #f1f5f9; z-index:1; position: relative;">
             <!-- MASTER: MAIN GRID -->
             <div id="locm-right-pane" style="flex: 1; display: flex; flex-direction: column; overflow: hidden; background:#fff; z-index: 1;">
                
                <!-- DataGrid Header Options -->
                <div id="locm-layer-grid-controls" style="padding: 10px 20px; border-bottom: 1px solid #e2e8f0; display:none; justify-content:space-between; align-items:center; background:#fff;">
                   <div id="locm-selected-layer-title" style="font-weight:700; font-size:16px; color:#1e293b;">
                       <i class="fas fa-stream" style="color:#64748b; margin-right:6px;"></i>Tầng --
                   </div>
                   <div style="display: flex; gap: 12px; align-items:center;">
                       <span style="font-size:13px; font-weight:600; color:#0ea5e9; border-right:1px solid #e2e8f0; padding-right:12px;" id="locm-selected-layer-count">0 Khuôn</span>
                       <div class="locm-view-toggles" style="display:flex; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden;">
                          <button id="locm-view-btn-card" style="border:none; background:#0ea5e9; color:#fff; padding:6px 12px; cursor:pointer;" title="Chế độ Thẻ"><i class="fas fa-th-large"></i></button>
                          <button id="locm-view-btn-table" style="border:none; background:#fff; color:#64748b; padding:6px 12px; cursor:pointer;" title="Chế độ Danh sách"><i class="fas fa-list"></i></button>
                       </div>
                       <button class="locm-btn locm-btn-primary" id="locm-bulk-transfer-btn" style="padding: 6px 12px; font-weight:600; background:#4f46e5; border-color:#4f46e5;"><i class="fas fa-exchange-alt"></i> Chuyển vị trí (Transfer)</button>
                   </div>
                </div>

                <!-- Grid Data Dump -->
                <div id="locm-layer-grid" style="flex: 1; overflow-y: auto; padding: 20px; background: #f8fafc;">
                   <div style="padding:60px 20px; text-align:center; color:#cbd5e1;">
                       <i class="fas fa-boxes" style="font-size:64px; margin-bottom:16px;"></i>
                       <h3 style="margin:0; font-size:18px; color:#64748b;">Chưa chọn Tầng</h3>
                       <p style="font-size:14px; margin-top:8px;">Bấm chọn một Tầng / Layer ở thanh Menu nhỏ bên trên để xem toàn bộ danh sách Khuôn nằm trong tầng đó.</p>
                   </div>
                </div>
             </div>
             
             <!-- DRAWER OVERLAY -->
             <div id="locm-drawer-overlay" style="display:none; position:absolute; inset:0; background:rgba(15,23,42,0.4); z-index:40; opacity:0; transition:opacity 0.3s ease; backdrop-filter:blur(2px);" onclick="LocationManager.selectRack(null)"></div>
             
             <!-- DETAIL: RIGHT DRAWER -->
             <div id="locm-left-pane" class="locm-drawer" style="position: absolute; right: -420px; top: 0; bottom: 0; width: 400px; max-width: 100vw; border-left: 1px solid #e2e8f0; background: #fff; z-index: 50; box-shadow: -4px 0 25px rgba(0,0,0,0.1); transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1); display: flex; flex-direction: column;">
                <div id="locm-drawer-header" style="padding: 12px 16px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;">
                    <div style="font-weight:700; color:#1e293b; font-size:15px;"><i class="fas fa-boxes" style="margin-right:8px; color:#0ea5e9;"></i><span class="ja">ラック詳細</span><span class="vi" style="color:#64748b; font-weight:400; margin-left:4px;">/ Chi tiết Giá</span></div>
                    <button onclick="LocationManager.selectRack(null)" style="background:transparent; border:none; font-size:24px; color:#64748b; cursor:pointer; line-height:1; display:flex; padding:0 4px;" title="Đóng / 閉じる"><i class="fas fa-times"></i></button>
                </div>
                <div id="locm-main-content" style="flex:1; overflow-y:auto; padding: 16px; background: #f8fafc;">
                    <!-- Rack Detail Form goes here (populated by openRackForm) -->
                </div>
             </div>
          </div>
        </div>
      `;
      container.innerHTML = html.trim();

      var searchInput = document.getElementById('locm-rack-search-input');
      var dropDown = document.getElementById('locm-rack-dropdown');

      if (searchInput) {
        searchInput.addEventListener('input', function (e) {
          LocationManager.searchQuery = e.target.value.toLowerCase().replace(/[-\s]/g, '');
          if (LocationManager.searchQuery) {
            dropDown.style.display = 'block';
            LocationManager.renderSidebar();
          } else {
            dropDown.style.display = 'none';
          }
        });
        searchInput.addEventListener('focus', function () {
          searchInput.select();
          if (LocationManager.searchQuery) {
            dropDown.style.display = 'block';
            LocationManager.renderSidebar();
          }
        });
        searchInput.addEventListener('click', function () {
          searchInput.select();
          if (LocationManager.searchQuery) {
            dropDown.style.display = 'block';
            LocationManager.renderSidebar();
          }
        });
        // Bấm ra ngoài đóng Dropdown
        document.addEventListener('click', function (e) {
          if (!searchInput.contains(e.target) && !dropDown.contains(e.target)) {
            dropDown.style.display = 'none';
          }
        });
      }

      document.getElementById('locm-add-rack-btn').addEventListener('click', function () {
        LocationManager.openRackForm(null);
      });

      // View Mode Routing - NOW DEFAULTS TO TABLE
      LocationManager.currentViewMode = 'table';
      var btnCard = document.getElementById('locm-view-btn-card');
      var btnTable = document.getElementById('locm-view-btn-table');

      var initButtonsState = function () {
        if (LocationManager.currentViewMode === 'table') {
          if (btnTable) { btnTable.style.background = '#0ea5e9'; btnTable.style.color = '#fff'; }
          if (btnCard) { btnCard.style.background = '#fff'; btnCard.style.color = '#64748b'; }
        } else {
          if (btnCard) { btnCard.style.background = '#0ea5e9'; btnCard.style.color = '#fff'; }
          if (btnTable) { btnTable.style.background = '#fff'; btnTable.style.color = '#64748b'; }
        }
      };
      // run immediately
      initButtonsState();

      if (btnCard) btnCard.addEventListener('click', function () {
        LocationManager.currentViewMode = 'card';
        initButtonsState();
        if (LocationManager.selectedLayerId) LocationManager.renderGrid(LocationManager.selectedLayerId);
      });
      if (btnTable) btnTable.addEventListener('click', function () {
        LocationManager.currentViewMode = 'table';
        initButtonsState();
        if (LocationManager.selectedLayerId) LocationManager.renderGrid(LocationManager.selectedLayerId);
      });

      var bulkBtn = document.getElementById('locm-bulk-transfer-btn');
      if (bulkBtn) bulkBtn.addEventListener('click', function () {
        if (LocationManager.selectedLayerId) LocationManager.triggerBulkTransfer(LocationManager.selectedLayerId);
      });
    },

    openRackPicker: function () {
      var modal = document.createElement('div');
      modal.id = 'locm-picker-modal';
      modal.style.position = 'fixed';
      modal.style.inset = '0';
      modal.style.zIndex = '200100';
      modal.style.background = 'rgba(0,0,0,0.6)';
      modal.style.backdropFilter = 'blur(4px)';
      modal.style.display = 'flex';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';

      var html = `
        <div style="background:#fff; width:600px; max-width:90%; height:70vh; max-height:800px; border-radius:12px; display:flex; flex-direction:column; box-shadow:0 10px 25px rgba(0,0,0,0.2); overflow:hidden;">
           <div style="padding:16px 20px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
              <h3 style="margin:0; font-size:16px; color:#1e293b;"><i class="fas fa-list-ul" style="color:#0ea5e9; margin-right:8px;"></i>Chọn Giá (ラック選択)</h3>
              <button onclick="document.body.removeChild(this.parentNode.parentNode.parentNode)" style="background:transparent; border:none; font-size:20px; cursor:pointer; color:#94a3b8;">&times;</button>
           </div>
           <div style="padding:16px 20px; border-bottom:1px solid #e2e8f0; background:#fff;">
              <input type="text" id="locm-picker-search" class="locm-input" style="width:100%; border-radius:20px; padding-left:36px; height:40px; border:1px solid #cbd5e1;" placeholder="Nhập tên Hoặc mã Giá để lọc nhanh..." autocomplete="off">
              <i class="fas fa-search" style="position:relative; top:-28px; left:12px; color:#94a3b8; pointer-events:none; display:block; height:0;"></i>
           </div>
           <div id="locm-picker-list" style="flex:1; overflow-y:auto; padding:0; background:#f1f5f9;">
              <!-- render logic goes here -->
           </div>
        </div>
      `;
      modal.innerHTML = html;
      document.body.appendChild(modal);

      var listEl = document.getElementById('locm-picker-list');
      var searchEl = document.getElementById('locm-picker-search');

      var renderPickerList = function (query) {
        var q = (query || '').toLowerCase().replace(/[-\s]/g, '');
        var filtered = LocationManager.racks || [];
        var layerMatch = null;
        if (q) {
          filtered = LocationManager.racks.filter(function (r) {
            var text = String((r.RackID || '') + ' ' + (r.RackName || '') + ' ' + (r.RackLocation || '') + ' ' + (r.RackNotes || '')).toLowerCase();
            var cleanText = text.replace(/[-\s]/g, '');
            return text.indexOf(q) !== -1 || cleanText.indexOf(q) !== -1;
          });
          var matchedLayers = (LocationManager.layers || []).filter(function (l) {
            var lid = String(l.RackLayerID || '').toLowerCase();
            return lid.indexOf(q) !== -1 || lid === q;
          });
          if (matchedLayers.length > 0) layerMatch = matchedLayers[0];
        }
        var listHtml = '';
        if (layerMatch && q) {
          var rId = String(layerMatch.RackID || '');
          var lId = String(layerMatch.RackLayerID || '');
          var rName = '';
          var matchedRack = LocationManager.racks.find(function (x) { return x.RackID === rId; });
          if (matchedRack) rName = String(matchedRack.RackName || matchedRack.RackLocation || '');

          listHtml += `
              <div class="locm-picker-item" data-id="${escapeHtml(rId)}" data-layerid="${escapeHtml(lId)}" style="display:flex; justify-content:space-between; align-items:center; padding:12px 20px; border-bottom:1px solid #e2e8f0; background:#f0fdf4; cursor:pointer;" onmouseover="this.style.background='#d1fae5'" onmouseout="this.style.background='#f0fdf4'">
                 <div>
                    <div style="font-weight:700; color:#047857; font-size:15px;"><i class="fas fa-location-arrow"></i> Đi tới <span class="ja">棚</span><span class="vi">Tầng</span> ${escapeHtml(rId)}-${escapeHtml(layerMatch.RackLayerNumber)}</div>
                    <div style="font-size:13px; color:#10b981; margin-top:2px;">Kệ/Giá (Rack): ${escapeHtml(rId)} ${rName ? '(' + escapeHtml(rName) + ')' : ''}</div>
                 </div>
              </div>
           `;
        }

        if (filtered.length === 0 && !layerMatch) {
          listHtml += '<div style="padding:30px; text-align:center; color:#94a3b8;">Không tìm thấy Giá này.</div>';
        } else {
          listHtml = filtered.map(function (r) {
            var id = String(r.RackID || '');
            var sub = String(r.RackLocation || r.RackName || '---');
            var mCount = (LocationManager.layers || []).filter(function (l) { return l.RackID === id; }).length;
            return `
                <div class="locm-picker-item" data-id="${escapeHtml(id)}" style="display:flex; justify-content:space-between; align-items:center; padding:12px 20px; border-bottom:1px solid #e2e8f0; background:#fff; cursor:pointer;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">
                   <div>
                      <div style="font-weight:700; color:#1e293b; font-size:15px;">${escapeHtml(id)}</div>
                      <div style="font-size:13px; color:#64748b; margin-top:2px;">${escapeHtml(sub)}</div>
                   </div>
                   <div style="font-size:12px; background:#e0f2fe; color:#0369a1; padding:4px 8px; border-radius:12px; font-weight:600;">
                      ${mCount} tầng
                   </div>
                </div>
             `;
          }).join('');
        }
        listEl.innerHTML = listHtml;
        var items = listEl.querySelectorAll('.locm-picker-item');
        for (var i = 0; i < items.length; i++) {
          items[i].addEventListener('click', function () {
            var rrid = this.getAttribute('data-id');
            var llid = this.getAttribute('data-layerid');
            document.getElementById('locm-rack-search-input').value = rrid;
            LocationManager.searchQuery = rrid.toLowerCase();
            LocationManager.selectRack(rrid);
            document.body.removeChild(modal);
            if (llid) {
              setTimeout(function () { LocationManager.drilldownLayer(llid); }, 200);
            }
          });
        }
      };

      searchEl.addEventListener('input', function (e) {
        renderPickerList(e.target.value);
      });
      renderPickerList('');
      setTimeout(function () { searchEl.focus(); }, 100);
    },

    refreshData: function () {
      var dmData = (global.DataManager && global.DataManager.data) ? global.DataManager.data : null;
      var rawRacks = dmData && dmData.racks ? dmData.racks : [];
      var rawLayers = dmData && dmData.racklayers ? dmData.racklayers : [];

      this.racks = rawRacks.slice().sort(function (a, b) {
        var aid = String(a.RackID || a.RackName || '').toLowerCase();
        var bid = String(b.RackID || b.RackName || '').toLowerCase();
        return aid.localeCompare(bid, undefined, { numeric: true });
      });

      this.layers = rawLayers.slice().sort(function (a, b) {
        return String(a.RackLayerNumber || '').localeCompare(String(b.RackLayerNumber || ''), undefined, { numeric: true });
      });
    },

    exportRackMolds: function () {
      if (!this.selectedRackId) {
        this.notify('Vui lòng chọn một Giá/Kệ (Rack) để xuất danh sách.', 'error');
        return;
      }
      var rackId = this.selectedRackId;
      var molds = (window.DataManager && window.DataManager.data.molds) ? window.DataManager.data.molds : [];

      var rackLayers = this.layers.filter(function (l) { return String(l.RackID) === String(rackId); });
      var rackLayerIds = rackLayers.map(function (l) { return String(l.RackLayerID); });

      var rackMolds = molds.filter(function (m) {
        return rackLayerIds.indexOf(String(m.RackLayerID)) > -1 || String(m.Location) === String(rackId);
      });
      if (rackMolds.length === 0) {
        this.notify('Không có Khuôn nào trong Giá/Kệ này.', 'info');
        return;
      }

      rackMolds.sort(function (a, b) {
        var codeA = String(a.MoldID || a.MoldCode || '').toUpperCase();
        var codeB = String(b.MoldID || b.MoldCode || '').toUpperCase();
        return codeA.localeCompare(codeB);
      });

      var csvContent = "\uFEFF"; // BOM
      csvContent += "Nhóm,Mã Khuôn (MoldID),Tên Sản Phẩm (ProductName),Vị trí (Location),Ghi chú\n";

      rackMolds.forEach(function (m) {
        var code = String(m.MoldID || m.MoldCode || '');
        var firstChar = code.charAt(0).toUpperCase();
        if (!firstChar.match(/[A-Z0-9]/)) firstChar = '#';
        var name = String(m.ProductName || '').replace(/"/g, '""');
        var loc = String(m.RackLayerID || m.Location || '');
        var note = String(m.Notes || '').replace(/"/g, '""');
        csvContent += `"${firstChar}","${code}","${name}","${loc}","${note}"\n`;
      });

      var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      var link = document.createElement("a");
      if (link.download !== undefined) {
        var url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "Rack_" + rackId + "_Molds_Export_" + new Date().getTime() + ".csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      this.notify('Đã tải xuống danh sách Molds ' + rackId + ' thành công!', 'info');
    },

    renderSidebar: function () {
      var listEl = document.getElementById('locm-rack-list');
      var dropDown = document.getElementById('locm-rack-dropdown');
      if (!listEl) return;

      var filtered = this.racks;
      var layerMatch = null;
      if (this.searchQuery) {
        var q = this.searchQuery;
        filtered = this.racks.filter(function (r) {
          var text = String((r.RackID || '') + ' ' + (r.RackName || '') + ' ' + (r.RackLocation || '') + ' ' + (r.RackNotes || '')).toLowerCase();
          var cleanText = text.replace(/[-\s]/g, '');
          return text.indexOf(q) !== -1 || cleanText.indexOf(q) !== -1;
        });
        var matchedLayers = (LocationManager.layers || []).filter(function (l) {
          var lid = String(l.RackLayerID || '').toLowerCase();
          return lid.indexOf(q) !== -1 || lid === q;
        });
        if (matchedLayers.length > 0) layerMatch = matchedLayers[0];
      }

      var html = '';

      if (layerMatch && this.searchQuery) {
        var rId = String(layerMatch.RackID || '');
        var lId = String(layerMatch.RackLayerID || '');
        var rName = '';
        var matchedRack = LocationManager.racks.find(function (x) { return x.RackID === rId; });
        if (matchedRack) rName = String(matchedRack.RackName || matchedRack.RackLocation || '');

        html += `
            <div class="locm-item" data-id="${escapeHtml(rId)}" data-layerid="${escapeHtml(lId)}" style="padding:10px 15px; border-bottom:1px solid #e2e8f0; background:#f0fdf4; cursor:pointer;" onmouseover="this.style.background='#d1fae5'" onmouseout="this.style.background='#f0fdf4'">
               <div style="font-weight:700; font-size:14px; color:#047857;"><i class="fas fa-location-arrow"></i> Đi tới <span class="ja">棚</span><span class="vi">Tầng</span> ${escapeHtml(rId)}-${escapeHtml(layerMatch.RackLayerNumber)}</div>
               <div style="font-size:12px; color:#10b981; margin-top:2px;">Kệ/Giá: ${escapeHtml(rId)} ${rName ? '(' + escapeHtml(rName) + ')' : ''}</div>
            </div>
         `;
      }

      if (filtered.length === 0 && !layerMatch) {
        html += '<div style="padding:15px; text-align:center; color:#94a3b8; font-size:13px;">Không tìm thấy Giá (Rack) nào.</div>';
      } else {
        html += filtered.map(function (r) {
          var id = String(r.RackID || '');
          var active = (id === LocationManager.selectedRackId) ? 'background:#e0f2fe;' : '';
          var title = String(r.RackID || 'No ID');
          var sub = String(r.RackLocation || r.RackName || '---');

          return '<div class="locm-item" data-id="' + id + '" style="padding:10px 15px; border-bottom:1px solid #f8fafc; cursor:pointer; ' + active + '" onmouseover="this.style.background=\'#f1f5f9\'" onmouseout="this.style.background=\'' + (active ? '#e0f2fe' : '') + '\'">' +
            '<div style="font-weight:600; font-size:14px; color:#1e293b;">' + title + ' <span style="font-weight:400; color:#64748b; font-size:12px; margin-left:6px;">' + sub + '</span></div>' +
            '</div>';
        }).join('');
      }
      listEl.innerHTML = html;

      var items = listEl.querySelectorAll('.locm-item');
      for (var i = 0; i < items.length; i++) {
        items[i].addEventListener('click', function () {
          var rid = this.getAttribute('data-id');
          var lid = this.getAttribute('data-layerid');
          if (dropDown) dropDown.style.display = 'none';
          var sInput = document.getElementById('locm-rack-search-input');
          if (sInput) sInput.value = rid;
          LocationManager.searchQuery = rid.toLowerCase();
          LocationManager.selectRack(rid);
          if (lid) {
            setTimeout(function () { LocationManager.drilldownLayer(lid); }, 200);
          }
        });
      }
    },

    selectRack: function (rackId) {
      this.selectedRackId = rackId;
      this.renderSidebar(); // refresh active state

      var container = document.querySelector('.locm-v2-container');
      var drawer = document.getElementById('locm-left-pane');
      var overlay = document.getElementById('locm-drawer-overlay');

      if (!rackId) {
        // CLOSE DRAWER
        if (container) container.classList.remove('drawer-open');
        if (drawer) drawer.style.right = '-420px';
        if (overlay) {
          overlay.style.opacity = '0';
          setTimeout(function () { if (overlay) overlay.style.display = 'none'; }, 300);
        }
        this.renderEmptyState();
        if (window.SwipeHistoryTrap) window.SwipeHistoryTrap.remove('locmRightDrawer');
      } else {
        // OPEN DRAWER
        if (container) container.classList.add('drawer-open');

        // Show overlay to allow click-outside-to-close
        if (overlay) {
          overlay.style.display = 'block';
          void overlay.offsetWidth; // trigger reflow
          overlay.style.opacity = '1';
          overlay.onclick = function () {
            LocationManager.selectRack(null);
          };
        }

        if (drawer) drawer.style.right = '0';

        var rack = this.racks.find(function (r) { return r.RackID === rackId; });
        if (rack) {
          this.openRackForm(rack);
        } else {
          this.renderEmptyState();
        }

        // Handle Escape or Swipe to close
        if (window.SwipeHistoryTrap) {
          window.SwipeHistoryTrap.push('locmRightDrawer', function () {
            LocationManager.selectRack(null);
          });
          if (drawer) {
            window.SwipeHistoryTrap.bindSwipe(drawer, function () {
              LocationManager.selectRack(null);
            });
          }
        }
      }
    },

    closeDrawerOnly: function () {
      // Used to hide the drawer to see the grid underneath, without dropping the rack selection
      var container = document.querySelector('.locm-v2-container');
      var drawer = document.getElementById('locm-left-pane');
      var overlay = document.getElementById('locm-drawer-overlay');
      if (container) container.classList.remove('drawer-open');
      if (drawer) drawer.style.right = '-420px';
      if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(function () { if (overlay) overlay.style.display = 'none'; }, 300);
      }
    },

    drilldownLayer: function (lid) {
      var gridControls = document.getElementById('locm-layer-grid-controls');
      var gridEl = document.getElementById('locm-layer-grid');
      var bulkBtn = document.getElementById('locm-bulk-transfer-btn');

      if (!gridControls || !gridEl) return;
      gridControls.style.display = 'flex';

      var molds = (window.DataManager && window.DataManager.data.molds) ? window.DataManager.data.molds : [];
      var layerMolds = molds.filter(function (m) {
        return String(m.RackLayerID || '').trim() === String(lid).trim();
      });

      if (bulkBtn) {
        bulkBtn.style.display = layerMolds.length > 0 ? 'inline-block' : 'none';
      }
      this.renderGrid(lid);
    },

    renderGrid: function (lid) {
      var gridId = 'locm-layer-grid';
      var container = document.getElementById(gridId);
      if (!container) return;

      var targetData = [];
      var typeMode = this.viewMode || 'mold';
      var unitJa = typeMode === 'mold' ? '金型' : 'トレイ';
      var unitVi = typeMode === 'mold' ? 'Khuôn' : 'Khay';

      if (typeMode === 'tray') {
        targetData = (window.DataManager && window.DataManager.data.trays) ? window.DataManager.data.trays : [];
      } else {
        targetData = (window.DataManager && window.DataManager.data.molds) ? window.DataManager.data.molds : [];
      }

      var layerItems = targetData.filter(function (m) {
        return String(m.RackLayerID || '').trim() === String(lid).trim();
      }).map(function (m) {
        m.type = typeMode; // 'mold' or 'tray'
        return m;
      });

      if (layerItems.length === 0) {
        container.innerHTML = '<div style="padding:60px 20px; text-align:center; color:#cbd5e1;"><i class="fas fa-box-open" style="font-size:64px; margin-bottom:16px;"></i><h3 style="margin:0; font-size:18px; color:#64748b;">Khay trống</h3><p style="font-size:14px; margin-top:8px;">Không có ' + unitVi + ' (' + unitJa + ') nào nằm trong tầng này.</p></div>';
        return;
      }

      var mode = this.currentViewMode || 'card';
      container.innerHTML = '';

      if (mode === 'card') {
        container.classList.add('results-grid');
        if (typeof window.ResultsCardRenderer !== 'undefined') {
          var r = new window.ResultsCardRenderer(gridId);
          r.itemsPerPage = 1000;
          r.render(layerItems, 1);
          r.onItemClick = function (item) { if (window.app && window.app.handleItemClick) window.app.handleItemClick(item); };
        }
      } else {
        container.classList.remove('results-grid');
        if (typeof window.ResultsTableRenderer !== 'undefined') {
          var r = new window.ResultsTableRenderer(gridId);
          r.itemsPerPage = 1000;
          r.render(layerItems, 1);
          r.onItemClick = function (item) { if (window.app && window.app.handleItemClick) window.app.handleItemClick(item); };
        }
      }
    },

    triggerBulkTransfer: function (lid) {
      if (!window.DataManager) return;
      var molds = window.DataManager.data.molds || [];
      var layerMolds = molds.filter(function (m) {
        return String(m.RackLayerID || '').trim() === String(lid).trim();
      });
      if (layerMolds.length === 0) return;

      var eSel = '<select id="locm-bulk-emp" style="width:100%; border:1px solid #cbd5e1; border-radius:6px; padding:10px;"><option value="">Chọn Nhân Viên...</option>';
      if (window.DataManager.data.employees) {
        window.DataManager.data.employees.forEach(function (e) {
          eSel += '<option value="' + (e.EmployeeID || e.ID) + '">' + escapeHtml(e.EmployeeName || e.name || e.EmployeeID || e.ID) + '</option>';
        });
      }
      eSel += '</select>';

      var rSel = '<select id="locm-bulk-target" style="width:100%; border:1px solid #cbd5e1; border-radius:6px; padding:10px;"><option value="">Chọn Vị trí Đích...</option>';
      this.racks.forEach(function (r) {
        var rackName = r.RackName || r.RackID;
        rSel += '<optgroup label="Giá: ' + escapeHtml(rackName) + '">';
        var rLayers = window.LocationManager.layers.filter(function (l) { return l.RackID === r.RackID; });
        rLayers.forEach(function (l) {
          if (l.RackLayerID !== lid) {
            rSel += '<option value="' + escapeHtml(l.RackLayerID) + '">Ngăn ' + escapeHtml(l.RackLayerNumber) + '</option>';
          }
        });
        rSel += '</optgroup>';
      });
      rSel += '</select>';

      var html = `
          <div id="locm-bulk-modal" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:99999; display:flex; align-items:center; justify-content:center;">
             <div style="background:#fff; width: 450px; max-width:90%; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); overflow:hidden;">
                <div style="padding:16px 20px; background:#f8fafc; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                   <h3 style="margin:0; font-size:16px; color:#1e293b;"><i class="fas fa-exchange-alt" style="color:#0ea5e9; margin-right:8px;"></i>Chuyển Vị Trí Hàng Loạt</h3>
                   <button onclick="document.getElementById('locm-bulk-modal').remove()" style="background:transparent; border:none; font-size:20px; cursor:pointer; color:#94a3b8;">&times;</button>
                </div>
                <div style="padding: 20px;">
                    <div style="margin-bottom:16px; padding:12px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:6px; color:#1e40af; font-size:14px;">
                       Đang di dời toàn bộ <b>${layerMolds.length} khuôn</b> từ ngăn <b>${lid}</b> sang vị trí mới.
                    </div>
                    <div style="margin-bottom:16px;">
                       <label style="display:block; font-size:13px; font-weight:600; color:#475569; margin-bottom:6px;">Chuyên viên thao tác</label>
                       ${eSel}
                    </div>
                    <div style="margin-bottom:16px;">
                       <label style="display:block; font-size:13px; font-weight:600; color:#475569; margin-bottom:6px;">Vị trí Giá chứa đích</label>
                       ${rSel}
                    </div>
                    <div style="margin-bottom:16px;">
                       <label style="display:block; font-size:13px; font-weight:600; color:#475569; margin-bottom:6px;">Ghi chú (Tùy chọn)</label>
                       <input type="text" id="locm-bulk-note" style="width:100%; border:1px solid #cbd5e1; border-radius:6px; padding:10px;" placeholder="Ghi chú di chuyển..." />
                    </div>
                </div>
                <div style="padding:16px 20px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:flex-end; gap:8px;">
                   <button class="locm-btn locm-btn-ghost" onclick="document.getElementById('locm-bulk-modal').remove()">Hủy</button>
                   <button class="locm-btn locm-btn-primary" id="locm-bulk-confirm" onclick="LocationManager.executeBulkTransfer('${lid}')">Xác nhận chuyển</button>
                </div>
             </div>
          </div>
        `;
      var div = document.createElement('div');
      div.innerHTML = html;
      document.body.appendChild(div.firstElementChild);
    },

    executeBulkTransfer: function (fromLid) {
      var targetLid = document.getElementById('locm-bulk-target').value;
      var empId = document.getElementById('locm-bulk-emp').value;
      var note = document.getElementById('locm-bulk-note').value;

      if (!targetLid) { alert("Vui lòng chọn Vị trí Đích!"); return; }
      if (!empId) { alert("Vui lòng chọn Nhân viên thao tác!"); return; }

      var molds = window.DataManager.data.molds || [];
      var layerMolds = molds.filter(function (m) {
        return String(m.RackLayerID || '').trim() === String(fromLid).trim();
      });

      if (!confirm("Thay đổi vị trí của " + layerMolds.length + " khuôn sang " + targetLid + " và ghi lịch sử hàng loạt?")) {
        return;
      }

      var btn = document.getElementById('locm-bulk-confirm');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> System Moving...';

      var apiUrlLoc = 'https://ysd-moldcutter-backend.onrender.com/api/locationlog';
      var apiUrlUpsert = 'https://ysd-moldcutter-backend.onrender.com/api/csv/upsert';
      var promises = [];
      var ts = new Date().toISOString();

      layerMolds.forEach(function (m) {
        var moldIdVal = m.MoldID || m.MoldCode;
        var payloadLoc = {
          Timestamp: ts,
          MoldID: moldIdVal,
          CutterID: '',
          EmployeeID: empId,
          RackLayerID: targetLid,
          Notes: note
        };
        promises.push(fetch(apiUrlLoc, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadLoc)
        }));

        var payloadCsv = {
          filename: 'molds.csv',
          idField: 'MoldID',
          idValue: moldIdVal,
          mode: 'upsert',
          updates: { RackLayerID: targetLid, Location: targetLid }
        };
        promises.push(fetch(apiUrlUpsert, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadCsv)
        }));
      });

      Promise.allSettled(promises).then(function () {
        alert("Hoàn tất chuyển " + layerMolds.length + " khuôn thành công!");
        var modal = document.getElementById('locm-bulk-modal');
        if (modal) modal.remove();

        layerMolds.forEach(function (m) {
          m.Location = targetLid;
          m.RackLayerID = targetLid;
        });

        if (window.app && typeof window.app.applyFilters === 'function') {
          window.app.applyFilters();
        } else {
          document.dispatchEvent(new CustomEvent('data-manager:ready'));
        }

        setTimeout(function () {
          LocationManager.openRackForm({ RackID: LocationManager.selectedRackId });
          var layerBtn = document.querySelector('.locm-tier-badge[data-layerid="' + targetLid + '"]');
          if (layerBtn) layerBtn.click();
        }, 200);
      });
    },

    renderAllLayersGrid: function () {
      LocationManager.selectedRackId = null;
      var rightPaneEl = document.getElementById('locm-layer-grid');
      var leftPaneEl = document.getElementById('locm-main-content');
      var badgesEl = document.getElementById('locm-layer-badges-container');

      document.getElementById('locm-kpi-racks').classList.remove('history-stat-active');
      document.getElementById('locm-kpi-layers').classList.add('history-stat-active');
      this.renderSidebar();

      if (leftPaneEl) leftPaneEl.innerHTML = `
           <div class="locm-empty-state" style="padding:40px 20px; text-align:center; color:#94a3b8;">
             <i class="fas fa-boxes" style="font-size:48px; margin-bottom:16px;"></i>
             <div style="font-size:14px;"><span class="ja">層の概要システム</span><br/><span class="vi">Chế độ xem Tổng quan Các Tầng (Layers)</span></div>
           </div>
      `;
      if (badgesEl) badgesEl.innerHTML = '<div style="color:#94a3b8; font-size:13px; font-weight:600;"><i class="fas fa-layer-group" style="margin-right:6px;"></i><span class="ja">全ての層</span><span class="vi"> Tất cả các Tầng</span></div>';

      if (rightPaneEl) {
        var gridControls = document.getElementById('locm-layer-grid-controls');
        if (gridControls) gridControls.style.display = 'none';

        var viewMode = LocationManager.layerViewMode || 'list';
        var html = `
          <div style="padding:12px 20px; display:flex; justify-content:space-between; align-items:center; background:#fff; border-bottom:1px solid #e2e8f0; position:sticky; top:0; z-index:10;">
             <div style="font-size:15px; font-weight:700; color:#1e293b;"><i class="fas fa-layer-group" style="color:#10b981; margin-right:8px;"></i><span class="ja">棚一覧 </span><span class="vi" style="color:#64748b; font-weight:400; margin-left:4px;">(Danh sách Tầng)</span></div>
             <div class="locm-view-toggles" style="display:flex; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden; background:#fff;">
                <button onclick="LocationManager.layerViewMode='card'; LocationManager.renderAllLayersGrid()" style="border:none; padding:6px 12px; cursor:pointer; background:${viewMode === 'card' ? '#0ea5e9' : 'transparent'}; color:${viewMode === 'card' ? '#fff' : '#64748b'};" title="Dạng Thẻ"><i class="fas fa-th-large"></i></button>
                <button onclick="LocationManager.layerViewMode='list'; LocationManager.renderAllLayersGrid()" style="border:none; padding:6px 12px; cursor:pointer; background:${viewMode === 'list' ? '#0ea5e9' : 'transparent'}; color:${viewMode === 'list' ? '#fff' : '#64748b'};" title="Dạng Danh sách"><i class="fas fa-list"></i></button>
             </div>
          </div>
        `;

        var typeMode = LocationManager.viewMode || 'mold';
        var unitJa = typeMode === 'mold' ? '金型' : 'トレイ';
        var unitVi = typeMode === 'mold' ? 'Khuôn' : 'Khay';
        var targetData = [];
        if (typeMode === 'tray') {
          targetData = (window.DataManager && window.DataManager.data.trays) ? window.DataManager.data.trays : [];
        } else {
          targetData = (window.DataManager && window.DataManager.data.molds) ? window.DataManager.data.molds : [];
        }

        if (viewMode === 'card') {
          html += '<div style="padding:20px; display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:16px;">';
          this.layers.forEach(function (l) {
            var id = String(l.RackLayerID || '');
            var rId = String(l.RackID || '');
            var lNum = String(l.RackLayerNumber || '');
            var mCount = targetData.filter(function (x) { return String(x.RackLayerID) === id; }).length;
            html += `
                 <div onclick="LocationManager.selectRack('${escapeHtml(rId)}'); setTimeout(function(){ LocationManager.drilldownLayer('${escapeHtml(id)}'); LocationManager.closeDrawerOnly(); }, 200);" style="background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:16px; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.05); transition:all 0.2s; display:flex; flex-direction:column; gap:12px;" onmouseover="this.style.borderColor='#10b981'; this.style.boxShadow='0 4px 6px rgba(16,185,129,0.1)'" onmouseout="this.style.borderColor='#e2e8f0'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.05)'">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                       <div style="width:36px; height:36px; border-radius:6px; background:#f0fdf4; color:#16a34a; display:flex; align-items:center; justify-content:center; font-size:18px;">
                          <i class="fas fa-layer-group"></i>
                       </div>
                       <div style="font-size:13px; font-weight:700; color:#10b981;">
                          ${mCount} <span class="ja">${unitJa}</span><span class="vi" style="color:#94a3b8; font-weight:400; margin-left:4px;">${unitVi}</span>
                       </div>
                    </div>
                    <div>
                       <div style="font-weight:700; font-size:18px; color:#0f172a; line-height:1;"><span class="ja">棚 </span>${escapeHtml(rId)}-${escapeHtml(lNum)}</div>
                       <div style="font-size:11px; color:#94a3b8; margin-top:4px;">ID Hệ thống: ${escapeHtml(id)}</div>
                    </div>
                 </div>
               `;
          });
          html += '</div>';
        } else {
          html += '<div style="padding:0; overflow-x:auto;">';
          html += '<table style="width:100%; border-collapse:collapse; background:#fff; text-align:left;">';
          html += '<thead style="background:#f8fafc; border-bottom:1px solid #e2e8f0;"><tr><th style="padding:12px 20px; color:#475569; font-weight:700; font-size:13px;">Khu vực Thuộc Giá (Rack)</th><th style="padding:12px 20px; color:#475569; font-weight:700; font-size:13px;">Mã Tầng Độc Lập</th><th style="padding:12px 20px; color:#475569; font-weight:700; font-size:13px; text-align:center;">Số Tầng</th><th style="padding:12px 20px; color:#475569; font-weight:700; font-size:13px; text-align:center;">Số Lượng ' + unitVi + '</th><th style="padding:12px 20px; color:#475569; font-weight:700; font-size:13px; text-align:right;">Thao tác</th></tr></thead>';
          html += '<tbody>';
          this.layers.forEach(function (l) {
            var id = String(l.RackLayerID || '');
            var rId = String(l.RackID || '');
            var lNum = String(l.RackLayerNumber || '');
            var mCount = targetData.filter(function (x) { return String(x.RackLayerID) === id; }).length;
            html += `
                 <tr style="border-bottom:1px solid #f1f5f9; cursor:pointer;" onmouseover="this.style.background='#f0fdf4'" onmouseout="this.style.background='transparent'" onclick="LocationManager.selectRack('${escapeHtml(rId)}'); setTimeout(function(){ LocationManager.drilldownLayer('${escapeHtml(id)}'); LocationManager.closeDrawerOnly(); }, 200);">
                    <td style="padding:12px 20px; font-weight:700; color:#0f172a; font-size:13px;">${escapeHtml(rId)}</td>
                    <td style="padding:12px 20px; color:#334155; font-size:13px; font-weight:600;"><span class="ja">棚 </span>${escapeHtml(rId)}-${escapeHtml(lNum)} <span style="font-weight:400; color:#94a3b8; font-size:11px; margin-left:4px;">(${escapeHtml(id)})</span></td>
                    <td style="padding:12px 20px; text-align:center;"><span style="background:#f1f5f9; color:#475569; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:700;">Tầng ${escapeHtml(lNum)}</span></td>
                    <td style="padding:12px 20px; text-align:center;"><span style="background:#d1fae5; color:#047857; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:700;">${mCount} ${unitVi}</span></td>
                    <td style="padding:12px 20px; text-align:right;">
                       <button class="locm-btn locm-btn-outline" style="padding:4px 10px; font-size:12px; border-color:#10b981; color:#10b981;"><i class="fas fa-arrow-right" style="margin-right:4px;"></i>Truy cập</button>
                    </td>
                 </tr>
             `;
          });
          html += '</tbody></table></div>';
        }

        rightPaneEl.innerHTML = html;
      }
    },

    renderEmptyState: function () {
      var rightPaneEl = document.getElementById('locm-layer-grid');
      var leftPaneEl = document.getElementById('locm-main-content');
      var badgesEl = document.getElementById('locm-layer-badges-container');

      var layerKpi = document.getElementById('locm-kpi-layers');
      if (layerKpi) layerKpi.classList.remove('history-stat-active');
      var rackKpi = document.getElementById('locm-kpi-racks');
      if (rackKpi) rackKpi.classList.add('history-stat-active');

      if (leftPaneEl) {
        leftPaneEl.innerHTML = `
           <div class="locm-empty-state" style="padding:40px 20px; text-align:center; color:#94a3b8;">
             <i class="fas fa-boxes" style="font-size:48px; margin-bottom:16px;"></i>
             <div style="font-size:14px;"><span class="ja">ラックを選択するか、追加します</span><br/><span class="vi">Bấm chọn một Giá/Kệ bất kỳ để xem chi tiết hoặc cấu hình thêm.</span></div>
           </div>
         `;
      }

      if (badgesEl) {
        badgesEl.innerHTML = '<div style="color:#94a3b8; font-size:13px; font-weight:600;"><i class="fas fa-th-large" style="margin-right:6px;"></i><span class="ja">ラック概要システム</span><span class="vi"> Tổng quan Hệ thống Giá Kệ</span></div>';
      }

      if (rightPaneEl) {
        var gridControls = document.getElementById('locm-layer-grid-controls');
        if (gridControls) gridControls.style.display = 'none';

        var viewMode = LocationManager.rackViewMode || 'list'; // Default list
        var html = `
          <div style="padding:12px 20px; display:flex; justify-content:space-between; align-items:center; background:#fff; border-bottom:1px solid #e2e8f0; position:sticky; top:0; z-index:10;">
             <div style="font-size:15px; font-weight:700; color:#1e293b;"><i class="fas fa-boxes" style="color:#0ea5e9; margin-right:8px;"></i><span class="ja">ラック一覧 </span><span class="vi" style="color:#64748b; font-weight:400; margin-left:4px;">(Danh sách Giá)</span></div>
             <div style="display:flex; align-items:center;">
                <button onclick="LocationManager.printSelectedRacks()" class="locm-btn" style="background:#0f172a; color:#fff; border:none; padding:6px 12px; margin-right:12px; font-size:13px; border-radius:6px; cursor:pointer;" title="In Danh Sách Giá đã chọn (Print)"><i class="fas fa-print" style="margin-right:6px;"></i>In Các Giá đã chọn</button>
                <div class="locm-view-toggles" style="display:flex; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden; background:#fff;">
                   <button onclick="LocationManager.rackViewMode='card'; LocationManager.renderEmptyState()" style="border:none; padding:6px 12px; cursor:pointer; background:${viewMode === 'card' ? '#0ea5e9' : 'transparent'}; color:${viewMode === 'card' ? '#fff' : '#64748b'};" title="Dạng Thẻ"><i class="fas fa-th-large"></i></button>
                   <button onclick="LocationManager.rackViewMode='list'; LocationManager.renderEmptyState()" style="border:none; padding:6px 12px; cursor:pointer; background:${viewMode === 'list' ? '#0ea5e9' : 'transparent'}; color:${viewMode === 'list' ? '#fff' : '#64748b'};" title="Dạng Danh sách"><i class="fas fa-list"></i></button>
                </div>
             </div>
          </div>
        `;

        if (viewMode === 'card') {
          html += '<div style="padding:20px; display:grid; grid-template-columns:repeat(auto-fill, minmax(240px, 1fr)); gap:16px;">';
          this.racks.forEach(function (r) {
            var id = String(r.RackID || '');
            var name = String(r.RackName || r.RackLocation || 'Vị trí chưa xác định');
            var lCount = LocationManager.layers.filter(function (x) { return x.RackID === id; }).length;
            html += `
                 <div onclick="LocationManager.selectRack('${escapeHtml(id)}')" style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:12px; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.05); transition:all 0.2s; display:flex; gap:16px; align-items:center;" onmouseover="this.style.borderColor='#0ea5e9'; this.style.boxShadow='0 4px 6px rgba(14,165,233,0.1)'; this.querySelector('.locm-rack-circle').style.background='#0ea5e9'; this.querySelector('.locm-rack-circle').style.color='#fff';" onmouseout="this.style.borderColor='#e2e8f0'; this.style.boxShadow='0 1px 3px rgba(0,0,0,0.05)'; this.querySelector('.locm-rack-circle').style.background='#f1f5f9'; this.querySelector('.locm-rack-circle').style.color='#0f172a';">
                    <div class="locm-rack-grid-thumb" data-rackid="${escapeHtml(id)}" style="width:80px; height:80px; border-radius:6px; background:#f8fafc; border:1px solid #e2e8f0; display:flex; flex-direction:column; justify-content:center; align-items:center; color:#94a3b8; font-size:11px; flex-shrink:0;">
                       <i class="fas fa-camera" style="font-size:24px; margin-bottom:4px; opacity:0.5;"></i> NO IMAGE
                    </div>
                    <div style="flex:1; min-width:0;">
                       <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
                          <div class="locm-rack-circle" style="width:38px; height:38px; border-radius:50%; background:#f1f5f9; color:#0f172a; display:flex; justify-content:center; align-items:center; font-weight:800; font-size:16px; transition:all 0.2s;">
                             ${escapeHtml(id)}
                          </div>
                          <div style="font-size:14px; font-weight:700; color:#10b981;">
                             ${lCount} <span class="ja">層</span>
                          </div>
                       </div>
                       <div style="font-size:14px; color:#1e293b; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(name)}</div>
                       ${r.RackLocation ? `<div style="font-size:12px; color:#64748b; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><i class="fas fa-map-marker-alt" style="margin-right:4px; opacity:0.5;"></i>${escapeHtml(r.RackLocation)}</div>` : ''}
                    </div>
                 </div>
               `;
          });
          html += '</div>';
        } else {
          html += '<div style="padding:0; overflow-x:auto;">';
          html += '<table style="width:100%; border-collapse:collapse; background:#fff; text-align:left;">';
          html += '<thead style="background:#f8fafc; border-bottom:1px solid #e2e8f0;"><tr><th style="padding:12px 20px; width:40px;"><input type="checkbox" onchange="LocationManager.toggleAllRacks(this.checked)" title="Chọn tất cả"></th><th style="padding:12px 20px; color:#475569; font-weight:700; font-size:13px; width:80px;">Ảnh</th><th style="padding:12px 20px; color:#475569; font-weight:700; font-size:13px;">Mã Giá (ID)</th><th style="padding:12px 20px; color:#475569; font-weight:700; font-size:13px;">Tên Giá</th><th style="padding:12px 20px; color:#475569; font-weight:700; font-size:13px;">Vị trí</th><th style="padding:12px 20px; color:#475569; font-weight:700; font-size:13px; text-align:center;">Số Tầng</th><th style="padding:12px 20px; color:#475569; font-weight:700; font-size:13px; text-align:right;">Thao tác</th></tr></thead>';
          html += '<tbody>';
          this.racks.forEach(function (r) {
            var id = String(r.RackID || '');
            var name = String(r.RackName || '-');
            var loc = String(r.RackLocation || '-');
            var lCount = LocationManager.layers.filter(function (x) { return x.RackID === id; }).length;
            html += `
                 <tr style="border-bottom:1px solid #f1f5f9; cursor:pointer;" onmouseover="this.style.background='#f0f9ff'" onmouseout="this.style.background='transparent'" onclick="var cb=this.querySelector('.locm-rack-print-cb'); if(cb) cb.checked=!cb.checked;">
                    <td style="padding:12px 20px;" onclick="event.stopPropagation()"><input type="checkbox" class="locm-rack-print-cb" value="${escapeHtml(id)}"></td>
                    <td style="padding:8px 20px;" onclick="LocationManager.selectRack('${escapeHtml(id)}')">
                       <div class="locm-rack-grid-thumb" data-rackid="${escapeHtml(id)}" style="width:40px; height:40px; border-radius:4px; background:#f1f5f9; border:1px solid #e2e8f0; display:flex; justify-content:center; align-items:center; color:#94a3b8; font-size:10px;">
                          <i class="fas fa-camera"></i>
                       </div>
                    </td>
                    <td style="padding:12px 20px; font-weight:700; color:#0f172a; font-size:14px;" onclick="LocationManager.selectRack('${escapeHtml(id)}')">${escapeHtml(id)}</td>
                    <td style="padding:12px 20px; color:#334155; font-size:13px; font-weight:500;" onclick="LocationManager.selectRack('${escapeHtml(id)}')">${escapeHtml(name)}</td>
                    <td style="padding:12px 20px; color:#64748b; font-size:13px;" onclick="LocationManager.selectRack('${escapeHtml(id)}')"><i class="fas fa-map-marker-alt" style="margin-right:6px; opacity:0.6;"></i>${escapeHtml(loc)}</td>
                    <td style="padding:12px 20px; text-align:center;" onclick="LocationManager.selectRack('${escapeHtml(id)}')">
                       <span style="background:#dcfce7; color:#166534; padding:2px 8px; border-radius:12px; font-size:12px; font-weight:600;">${lCount} tầng</span>
                    </td>
                    <td style="padding:12px 20px; text-align:right;" onclick="LocationManager.selectRack('${escapeHtml(id)}')">
                       <button class="locm-btn locm-btn-outline" style="padding:4px 10px; font-size:12px;"><i class="fas fa-edit" style="margin-right:4px;"></i>Sửa</button>
                    </td>
                 </tr>
             `;
          });
          html += '</tbody></table></div>';
        }
        rightPaneEl.innerHTML = html;
        setTimeout(LocationManager.loadGridThumbs, 50);
      }
    },

    toggleAllRacks: function (checked) {
      var checkboxes = document.querySelectorAll('.locm-rack-print-cb');
      for (var i = 0; i < checkboxes.length; i++) {
        checkboxes[i].checked = checked;
      }
    },

    printSelectedRacks: function () {
      var checkboxes = document.querySelectorAll('.locm-rack-print-cb:checked');
      if (checkboxes.length === 0) {
        LocationManager.notify('Vui lòng chọn ít nhất 1 Giá (Rack) để in.', 'error');
        return;
      }
      var selectedRackIds = [];
      for (var i = 0; i < checkboxes.length; i++) {
        selectedRackIds.push(checkboxes[i].value);
      }

      // Generate Print HTML
      var printHTML = LocationManager.generatePrintHTML(selectedRackIds);
      var printWindow = window.open('', '_blank');
      printWindow.document.write(printHTML);
      printWindow.document.close();

      // Wait for resources to load, then print
      printWindow.onload = function () {
        printWindow.focus();
        setTimeout(function () {
          printWindow.print();
        }, 500); // give it a short moment to render
      };
    },

    generatePrintHTML: function (selectedRackIds) {
      if (!window.DataManager || !window.DataManager.data || !window.DataManager.data.molds) {
        return "<html><body>Lỗi dữ liệu hệ thống DataManager.data.molds...</body></html>";
      }
      var allMolds = window.DataManager.data.molds;
      var todayStr = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

      var html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>金型リスト印刷</title>
          <style>
            @page { size: A4 portrait; margin: 0 10mm; }
            body { font-family: 'Inter', 'Segoe UI', 'MS PGoThic', sans-serif; margin: 0; padding: 0; color: #000; -webkit-print-color-adjust: exact; color-adjust: exact; }
            * { box-sizing: border-box; }
            .page { width: 100%; padding-top: 15mm; padding-bottom: 15mm; page-break-after: always; display: flex; flex-direction: column; position: relative; box-sizing: border-box; }
            .page:last-child { page-break-after: auto; }
            .header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 12px; }
            .header-left { display: flex; align-items: center; gap: 10px; }
            .rack-lbl { font-size: 14px; font-weight: bold; }
            .rack-box { border: 2px solid #000; padding: 4px 20px; font-size: 18px; font-weight: bold; text-align: center; border-radius: 4px; min-width: 60px; line-height: 1; }
            .dept-title { font-size: 14px; font-weight: bold; }
            
            .content { display: flex; flex: 1; gap: 12px; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
            .print-col { flex: 1; min-width: 0; }
            .print-table { width: 100%; border-collapse: collapse; text-align: center; table-layout: fixed; }
            .print-table th { border: 1px solid #475569; background: #e2e8f0; font-size: 9px; padding: 2px; border-bottom: 2px solid #0f172a; line-height: 1.1; }
            .print-table td { border: 1px solid #94a3b8; padding: 1px 2px; font-size: 10px; height: 16px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; vertical-align: middle; }
            
            .group-header { background: #0f172a; color: #fff; font-weight: bold; font-size: 11px; text-align: center; padding: 0; border: 1px solid #0f172a; }
            
            .footer { margin-top: auto; display: flex; justify-content: space-between; font-size: 10px; border-top: 1px solid #cbd5e1; padding-top: 4px; }
          </style>
        </head>
        <body>
      `;

      var MAX_ROWS_PER_COL = 52; // Very safe margin to prevent footer pushed to Page 2

      selectedRackIds.forEach(function (rId) {
        var rackLayerIds = LocationManager.layers.filter(function (l) { return String(l.RackID) === String(rId); }).map(function (l) { return String(l.RackLayerID); });

        var rackMolds = allMolds.filter(function (m) {
          var mLoc = String(m.Location || '').trim();
          var mrId = String(m.RackLayerID || '').trim();
          return mLoc === String(rId) || mrId === String(rId) || rackLayerIds.indexOf(mrId) !== -1;
        });

        var groups = {};
        rackMolds.forEach(function (m) {
          // Ưu tiên MoldName/CutterName theo yêu cầu, fallback xuống các Code
          var mcode = String(m.MoldName || m.MoldCode || m.CutterName || m.CutterCode || m.ProductName || '').trim();
          if (!mcode) mcode = String(m.MoldID || '').trim();
          var first = mcode.charAt(0).toUpperCase();
          if (!first || !first.match(/[A-Z0-9]/)) first = '#';
          if (!groups[first]) groups[first] = [];
          groups[first].push({ ...m, _displayCode: mcode });
        });

        var keys = Object.keys(groups).sort();
        var flatItems = [];

        keys.forEach(function (k) {
          flatItems.push({ isHeader: true, text: k });
          groups[k].sort(function (a, b) {
            var codeA = String(a._displayCode || '').toUpperCase();
            var codeB = String(b._displayCode || '').toUpperCase();
            return codeA.localeCompare(codeB);
          });
          groups[k].forEach(function (m, i) {
            flatItems.push({ isHeader: false, mold: m, index: i + 1 });
          });
        });

        var pages = [];
        var ITEM_CAPACITY = MAX_ROWS_PER_COL * 3;
        var totalPages = Math.max(1, Math.ceil(flatItems.length / ITEM_CAPACITY));

        for (var p = 0; p < totalPages; p++) {
          var pageItems = flatItems.slice(p * ITEM_CAPACITY, (p + 1) * ITEM_CAPACITY);
          while (pageItems.length < ITEM_CAPACITY) {
            pageItems.push({ isEmpty: true }); // Padding for blanks
          }

          var pageCols = [[], [], []];
          for (var i = 0; i < ITEM_CAPACITY; i++) {
            if (i < MAX_ROWS_PER_COL) pageCols[0].push(pageItems[i]);
            else if (i < MAX_ROWS_PER_COL * 2) pageCols[1].push(pageItems[i]);
            else pageCols[2].push(pageItems[i]);
          }
          pages.push(pageCols);
        }

        pages.forEach(function (pCols, pIndex) {
          html += '<div class="page">';
          html += `
              <div class="header">
                 <div class="header-left">
                    <span class="rack-lbl">棚番号</span>
                    <div class="rack-box">${escapeHtml(rId)}</div>
                    <span class="dept-title" style="margin-left: 16px;">金型部門・ミガキ部署</span>
                 </div>
              </div>
            `;

          html += '<div class="content">';

          pCols.forEach(function (colItems) {
            html += '<div class="print-col">';
            html += '<table class="print-table">';
            html += '<thead><tr><th style="width:10%">No.<br>Stt</th><th style="width:40%">型番<br>Mã Khuôn</th><th style="width:20%">更新<br>Ngày CN</th><th style="width:15%">棚段<br>Tầng</th><th style="width:15%">備考<br>Note</th></tr></thead>';
            html += '<tbody>';

            colItems.forEach(function (item) {
              if (item.isEmpty) {
                // Khung trống cho người dùng tự ghi
                html += '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>';
              } else if (item.isHeader) {
                // Dải banner chữ đen phân nhóm
                html += `<tr><td colspan="5" class="group-header">${escapeHtml(item.text)}</td></tr>`;
              } else {
                var m = item.mold;
                var mId = String(m._displayCode || '');

                var lObj = LocationManager.layers.find(function (l) { return String(l.RackLayerID) === String(m.RackLayerID); });
                var lNum = lObj ? String(lObj.RackLayerNumber || '') : '';
                if (!lNum) lNum = String(m.RackLayerNumber || m.RackLayerID || '').split('-').pop() || '';
                var layerDisplay = rId + '-' + lNum;
                if (layerDisplay === '-') layerDisplay = '';

                var note = String(m.Notes || '');
                var dt = String(m.StatusUpdatedAt || m.UpdatedAt || m.CreatedAt || '');
                // Format Date short e.g. 24-04-19
                var dtStr = '';
                if (dt && dt.indexOf('T') !== -1) {
                  var dObj = new Date(dt);
                  var yy = String(dObj.getFullYear()).slice(-2);
                  var mm = String(dObj.getMonth() + 1).padStart(2, '0');
                  var dd = String(dObj.getDate()).padStart(2, '0');
                  dtStr = yy + '-' + mm + '-' + dd;
                }

                html += `<tr>
                        <td style="color:#64748b; font-size:8px;">${item.index}</td>
                        <td style="text-align:left; padding-left:4px; font-weight:600;">${escapeHtml(mId)}</td>
                        <td style="font-size:9px;">${escapeHtml(dtStr)}</td>
                        <td>${escapeHtml(layerDisplay)}</td>
                        <td style="font-size:9px;">${escapeHtml(note)}</td>
                     </tr>`;
              }
            });

            html += '</tbody></table></div>';
          });

          html += '</div>';
          html += `
              <div class="footer">
                 <div>${todayStr}</div>
                 <div>棚番号 <span style="border:1px solid #000; padding:0 4px; font-weight:bold;">${escapeHtml(rId)}</span> &nbsp; 金型部門・ミガキ部署</div>
                 <div>Page ${pIndex + 1} / ${pages.length}</div>
              </div>
            `;
          html += '</div>';
        });
      });

      html += `</body></html>`;
      return html;
    },

    printSingleRack: function (rackId) {
      if (!rackId) return;
      var printHTML = LocationManager.generatePrintHTML([rackId]);
      var printWindow = window.open('', '_blank');
      printWindow.document.write(printHTML);
      printWindow.document.close();

      printWindow.onload = function () {
        printWindow.focus();
        setTimeout(function () {
          printWindow.print();
        }, 500);
      };
    },

    openRackForm: function (rackData) {
      var leftPaneEl = document.getElementById('locm-main-content');
      var badgesEl = document.getElementById('locm-layer-badges-container');
      if (!leftPaneEl) return;

      var isNew = !rackData;
      var rackId = isNew ? '' : (rackData.RackID || '');
      this.selectedRackId = rackId;
      this.selectedLayerId = null;

      if (isNew) this.renderSidebar(); // refresh active highlight

      var rNum = isNew ? '' : (rackData.RackNumber || '');
      var rLoc = isNew ? '' : (rackData.RackLocation || '');
      var rName = isNew ? '' : (rackData.RackName || '');
      var rNote = isNew ? '' : (rackData.RackNotes || '');

      var rackLayers = [];
      if (!isNew && rackId) {
        rackLayers = this.layers.filter(function (l) { return l.RackID === rackId; });
      }

      var actionBtnsHtml = '';
      if (!isNew) {
        actionBtnsHtml += `<button class="locm-btn locm-btn-photo" type="button" onclick="LocationManager.handleRackThumbClick('` + escapeHtml(rackId) + `')"><i class="fas fa-camera"></i> Hình</button> `;
        actionBtnsHtml += `<button class="locm-btn" type="button" style="background:#0f172a; color:#fff;" onclick="LocationManager.printSingleRack('` + escapeHtml(rackId) + `')"><i class="fas fa-print"></i> In</button> `;
      }
      actionBtnsHtml += `<button class="locm-btn locm-btn-primary" style="flex:1" type="button" id="locm-save-rack-btn"><i class="fas fa-save"></i> Lưu</button> `;

      leftPaneEl.innerHTML = `
        <div class="locm-section" style="border:none; padding:0; margin:0; background:transparent;">
          <div class="locm-section-header" style="flex-direction:column; align-items:stretch; gap:8px; margin-bottom:10px; border-bottom:1px solid #e2e8f0; padding-bottom:10px;">
             <div class="locm-section-title" style="font-size:16px;"><i class="fas fa-box" style="color:#0ea5e9;"></i> ${isNew ? '新規追加 / Thêm Giá Mới' : '詳細 / Thông tin Giá'}</div>
             <div class="locm-section-actions" style="display:flex; width:100%; gap:8px;">
                ${actionBtnsHtml}
             </div>
          </div>
          
          <div class="locm-form-layout" style="display:flex; flex-direction:column; gap:12px;">
             <div class="locm-form-thumb-col" style="width:100%;">
                <div class="locm-main-rack-thumb" id="locm-main-rack-thumb" style="width:100%; height:160px; border-radius:8px; border:1px solid #cbd5e1; display:flex; justify-content:center; align-items:center; cursor:pointer; overflow:hidden; position:relative; background:#f8fafc;" onclick="LocationManager.handleRackThumbClick('${escapeHtml(rackId)}')">
                   <i class="fas fa-image" style="font-size:32px; color:#cbd5e1;"></i>
                   <div class="locm-thumb-overlay" style="position:absolute; bottom:0; left:0; width:100%; background:rgba(0,0,0,0.6); color:#fff; text-align:center; padding:4px 0; font-size:12px; opacity:0; transition:opacity 0.2s;">Click to change / 追加</div>
                </div>
             </div>
             
             <div class="locm-form-grid" style="grid-template-columns: 1fr; display:flex; flex-direction:column; gap:8px;">
                <div class="locm-form-group">
                    <label class="locm-label" style="margin-bottom:4px;"><span class="ja">ラック識別コード</span> <span class="vi">/ Mã định danh *</span></label>
                    <input type="text" class="locm-input" id="locm-frm-rackid" value="${escapeHtml(rackId)}" ${isNew ? '' : 'disabled'} style="background:#f0f9ff; border:1px solid #bae6fd; height:34px; font-size:14px; font-weight:700; color:#0369a1;">
                </div>
                <div class="locm-form-group">
                    <label class="locm-label" style="margin-bottom:4px;"><span class="ja">設置場所</span> <span class="vi">/ Vị trí</span></label>
                    <input type="text" class="locm-input" id="locm-frm-location" value="${escapeHtml(rLoc)}" style="height:34px; font-size:13px; color:#334155;">
                </div>
                <div class="locm-form-group">
                    <label class="locm-label" style="margin-bottom:4px;"><span class="ja">名称</span> <span class="vi">/ Tên Rack</span></label>
                    <input type="text" class="locm-input" id="locm-frm-name" value="${escapeHtml(rName)}" style="height:34px; font-size:13px; color:#334155;">
                </div>
                <div class="locm-form-group">
                    <label class="locm-label" style="margin-bottom:4px;"><span class="ja">番号</span> <span class="vi">/ Số thứ tự</span></label>
                    <input type="text" class="locm-input" id="locm-frm-number" value="${escapeHtml(rNum)}" style="height:34px; font-size:13px; color:#334155;">
                </div>
                <div class="locm-form-group">
                    <label class="locm-label" style="margin-bottom:4px;"><span class="ja">備考</span> <span class="vi">/ Ghi chú</span></label>
                    <textarea class="locm-textarea" id="locm-frm-note" rows="2" style="font-size:13px; color:#334155;">${escapeHtml(rNote)}</textarea>
                </div>
             </div>
          </div>
          
          <div style="margin-top:24px; padding-top:16px; border-top:1px solid #e2e8f0;">
             <div style="font-size:14px; font-weight:700; color:#1e293b; margin-bottom:12px;"><i class="fas fa-layer-group" style="color:#10b981; margin-right:6px;"></i>Các Tầng (Layers)</div>
             <div id="locm-layer-badges-container" style="display:flex; flex-direction:column; gap:8px;"></div>
          </div>
        </div>
      `;

      var badgesEl = document.getElementById('locm-layer-badges-container');
      if (badgesEl) {
        if (isNew || !rackId) {
          badgesEl.innerHTML = '<div style="color:#94a3b8; font-size:13px; font-style:italic;">Vui lòng Lưu (Save) Giá kệ mới trước khi cấu hình Tầng.</div>';
        } else {
          var molds = (window.DataManager && window.DataManager.data.molds) ? window.DataManager.data.molds : [];
          var pillsHtml = rackLayers.map(function (l) {
            var lid = String(l.RackLayerID || '');
            var lnum = String(l.RackLayerNumber || '');
            var count = molds.filter(function (m) { return String(m.RackLayerID || '').trim() === lid.trim(); }).length;
            return `
                 <button class="locm-tier-badge" data-layerid="${escapeHtml(lid)}" data-layername="${escapeHtml(lnum)}" data-layerfull="${escapeHtml(l.RackID)}-${escapeHtml(lnum)}" data-count="${count}" style="display:flex; align-items:center; gap:12px; padding:10px 16px; background:#fff; border:1px solid #e2e8f0; border-radius:8px; cursor:pointer; width:100%; box-shadow:0 1px 2px rgba(0,0,0,0.05); transition:all 0.2s;">
                    <div style="width:36px; height:36px; border-radius:6px; background:#f8fafc; color:#64748b; display:flex; align-items:center; justify-content:center; font-size:18px; pointer-events:none; transition:all 0.2s; flex-shrink:0;" class="locm-tier-icon">
                       <i class="fas fa-layer-group"></i>
                    </div>
                    <div style="text-align:left; pointer-events:none; flex:1;">
                       <div style="font-weight:700; font-size:15px; color:#0f172a; line-height:1;"><span class="ja">棚 </span>${escapeHtml(lnum)}</div>
                       <div style="font-size:11px; margin-top:4px;" class="locm-tier-count">
                          <span style="color:#0ea5e9; font-weight:600;">${count}</span><span class="ja" style="color:#64748b; margin-left:4px;">金型</span><span class="vi" style="color:#cbd5e1;"> / Khuôn</span>
                       </div>
                    </div>
                    <div style="color:#cbd5e1; pointer-events:none;"><i class="fas fa-chevron-right"></i></div>
                 </button>
               `;
          }).join('');

          pillsHtml += `<button class="locm-btn locm-btn-outline" style="width:100%; border-style:dashed; padding:12px;" onclick="LocationManager.editLayer('')"><i class="fas fa-plus"></i> 層を追加 / Thêm tầng</button>`;
          badgesEl.innerHTML = pillsHtml;

          // Gắn sự kiện click
          var pills = badgesEl.querySelectorAll('.locm-tier-badge');
          for (var i = 0; i < pills.length; i++) {
            pills[i].addEventListener('click', function () {
              var layerIdToSelect = this.getAttribute('data-layerid');
              var layerNumExt = this.getAttribute('data-layerfull');
              var lCountExt = this.getAttribute('data-count');

              pills.forEach(p => {
                p.style.backgroundColor = '#fff';
                p.style.borderColor = '#e2e8f0';
                p.style.boxShadow = '0 1px 2px rgba(0,0,0,0.05)';
                var iEl = p.querySelector('.locm-tier-icon');
                if (iEl) { iEl.style.backgroundColor = '#f8fafc'; iEl.style.color = '#64748b'; }
              });
              this.style.backgroundColor = '#f0f9ff';
              this.style.borderColor = '#0ea5e9';
              this.style.boxShadow = '0 4px 6px rgba(14,165,233,0.15)';
              var tIel = this.querySelector('.locm-tier-icon');
              if (tIel) { tIel.style.backgroundColor = '#e0f2fe'; tIel.style.color = '#0ea5e9'; }

              var headTit = document.getElementById('locm-selected-layer-title');
              if (headTit) {
                headTit.innerHTML = `
                    <button onclick="LocationManager.selectRack(LocationManager.selectedRackId)" class="locm-btn locm-btn-outline" style="padding:4px 8px; font-size:12px; margin-right:12px; border-radius:4px;"><i class="fas fa-chevron-left" style="margin-right:4px;"></i>Giá</button>
                    <i class="fas fa-stream" style="color:#64748b; margin-right:6px;"></i><span class="ja">棚</span><span class="vi">Tầng</span> ${layerNumExt} <span style="font-size:12px; color:#94a3b8; font-weight:400; margin-left:4px;">(ID: ${layerIdToSelect})</span>
                 `;
              }

              var countCol = document.getElementById('locm-selected-layer-count');
              if (countCol) countCol.innerText = lCountExt + ' Khuôn';

              LocationManager.selectedLayerId = layerIdToSelect;
              LocationManager.drilldownLayer(layerIdToSelect);
              LocationManager.closeDrawerOnly();
            });
          }
        }
      }

      // Remove DataGrid clear logic so underlying grid context remains visible


      // Assign save event
      var saveBtn = document.getElementById('locm-save-rack-btn');
      if (saveBtn) {
        saveBtn.addEventListener('click', function () {
          var rIdInput = document.getElementById('locm-frm-rackid').value.trim();
          var params = {
            RackID: rIdInput || ('RACK_' + Date.now()),
            RackLocation: document.getElementById('locm-frm-location').value.trim(),
            RackName: document.getElementById('locm-frm-name').value.trim(),
            RackNumber: document.getElementById('locm-frm-number').value.trim(),
            RackNotes: document.getElementById('locm-frm-note').value.trim()
          };
          LocationManager.saveRack(params, isNew);
        });
      }

      // Load thumb images
      setTimeout(async function () {
        if (window.DevicePhotoStore) {
          // Load main Rack thumb
          if (!isNew && rackId) {
            var rThumbDiv = document.getElementById('locm-main-rack-thumb');
            if (rThumbDiv) {
              try {
                var rImg = await LocationManager.fetchActivePhoto('rack', rackId);
                if (rImg) rThumbDiv.innerHTML = '<img src="' + escapeHtml(rImg) + '" style="max-width:100%; max-height:100%; object-fit:contain;">';
              } catch (e) { }
            }
          }

          // Load layers thumb
          if (!isNew && rackLayers.length > 0) {
            rackLayers.forEach(async function (l) {
              try {
                var tImg = await LocationManager.fetchActivePhoto('rack', l.RackLayerID);
                if (tImg) {
                  var cards = leftPaneEl.querySelectorAll('.locm-layer-card');
                  for (var i = 0; i < cards.length; i++) {
                    var thm = cards[i].querySelector('.locm-layer-thumb');
                    if (thm && thm.getAttribute('onclick').indexOf(l.RackLayerID) > -1) {
                      thm.innerHTML = '<img src="' + escapeHtml(tImg) + '">';
                    }
                  }
                }
              } catch (e) { }
            });
          }
        }
      }, 300);
    },

    handleRackThumbClick: async function (rackId) {
      if (!rackId) return;
      var tDiv = document.getElementById('locm-main-rack-thumb');
      if (tDiv) {
        var img = tDiv.querySelector('img');
        if (img && img.src && img.src.indexOf('base64') === -1 && !img.src.endsWith('placeholder')) {
          // Has photo → open preview popup (Card Renderer style)
          var thumbSrc = img.src;
          var hdUrl = thumbSrc;

          // Try to fetch HD URL
          if (window.DevicePhotoStore) {
            try {
              tDiv.style.opacity = '0.5';
              var store = window.DevicePhotoStore;
              var resp = await store.getPhotos('rack', rackId);
              if (resp && resp.data && resp.data.length > 0) {
                var p = resp.data.find(function (x) { return x.is_active; }) || resp.data[0];
                hdUrl = p.url_original || p.public_url || p.thumb_public_url || thumbSrc;
              }
              tDiv.style.opacity = '1';
            } catch (e) {
              console.warn('Error fetching HD photo:', e);
              tDiv.style.opacity = '1';
            }
          }

          LocationManager.openPhotoPreviewPopup('ラック ' + rackId, thumbSrc, hdUrl);
        } else {
          LocationManager.openPhotoUpload(rackId, rackId);
        }
      }
    },

    /**
     * Open a white-card photo preview popup (consistent with Card Renderer / Detail Panel style)
     * @param {string} title - Display title (e.g. "ラック ASH020")
     * @param {string} thumbSrc - Thumbnail URL for blurred background placeholder
     * @param {string} fullSrc - Full resolution URL
     */
    openPhotoPreviewPopup: function (title, thumbSrc, fullSrc) {
      var popup = document.createElement('div');
      popup.className = 'locm-photo-popup';

      var uniqueId = 'locm_photo_' + Date.now();

      popup.innerHTML =
        '<div class="locm-photo-popup-card">' +
        '<div style="width:100%; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding:0 8px; flex-shrink:0;">' +
        '<span style="font-weight:bold; color:#334155; font-size:16px;">' + escapeHtml(title) + '</span>' +
        '<button class="locm-photo-close-btn" title="閉じる / Đóng" style="border:none; background:transparent; font-size:24px; cursor:pointer; color:#64748b; line-height:1; padding:0; transition: color 0.2s;" onmouseover="this.style.color=\'#f43f5e\'" onmouseout="this.style.color=\'#64748b\'">&times;</button>' +
        '</div>' +
        '<div style="flex:1; width:100%; position:relative; display:flex; align-items:center; justify-content:center; background:#f8fafc; border-radius:8px; overflow:hidden;">' +
        (thumbSrc ? '<img src="' + escapeHtml(thumbSrc) + '" style="position:absolute; width:100%; height:100%; object-fit:contain; filter:blur(10px); opacity:0.6; transform: scale(1.05);" />' : '') +
        '<i class="fas fa-spinner fa-spin" id="' + uniqueId + '_spinner" style="font-size:2rem; color:#94a3b8; position:absolute; z-index:2;"></i>' +
        '<img src="' + escapeHtml(fullSrc) + '" class="locm-photo-preview-img" onload="' +
        'var sp = document.getElementById(\'' + uniqueId + '_spinner\');' +
        'if(sp) sp.style.display=\'none\';' +
        'this.style.opacity=\'1\';' +
        '" style="width:100%; height:100%; object-fit:contain; position:relative; z-index:3; opacity:0; transition: opacity 0.4s ease; cursor: zoom-in;" onerror="this.style.display=\'none\';" />' +
        '</div>' +
        '</div>';

      var closeAction = function () {
        popup.classList.remove('locm-photo-popup--active');
        var card = popup.querySelector('.locm-photo-popup-card');
        if (card) {
          card.style.opacity = '0';
          card.style.transform = 'scale(0.95)';
        }
        setTimeout(function () { if (popup.parentNode) popup.parentNode.removeChild(popup); }, 300);
        if (window.SwipeHistoryTrap) window.SwipeHistoryTrap.remove('locmPhotoPopup');
      };

      // Click backdrop or close button
      popup.addEventListener('click', function (ev) {
        if (ev.target === popup || ev.target.closest('.locm-photo-close-btn')) {
          closeAction();
        }
      });

      // Click preview image → open HD zoom
      popup.addEventListener('click', function (ev) {
        var previewImg = ev.target.closest('.locm-photo-preview-img');
        if (previewImg && window.openGlobalPhotoZoom) {
          ev.stopPropagation();
          window.openGlobalPhotoZoom(previewImg.src);
        }
      });

      // Swipe & history trap
      if (window.SwipeHistoryTrap) {
        window.SwipeHistoryTrap.push('locmPhotoPopup', closeAction);
        window.SwipeHistoryTrap.bindSwipe(popup, closeAction);
      }

      document.body.appendChild(popup);

      // Trigger enter animation
      requestAnimationFrame(function () {
        popup.classList.add('locm-photo-popup--active');
      });
    },

    openPhotoUpload: function (rackOrLayerId, displayCode) {
      if (window.PhotoUpload && window.PhotoUpload.open) {
        window.PhotoUpload.open({
          mode: 'device',
          deviceType: 'rack',
          deviceId: rackOrLayerId,
          deviceCode: displayCode || rackOrLayerId
        });
      } else {
        this.notify('PhotoUpload module chưa sẵn sàng', 'error');
      }
    },

    saveRack: async function (params, isNew) {
      if (!params.RackID) {
        this.notify('Vui lòng nhập Rack ID', 'error');
        return;
      }
      if (isNew) {
        var exists = this.racks.find(function (r) { return r.RackID === params.RackID; });
        if (exists) {
          this.notify('Rack ID này đã tồn tại, vui lòng chọn mã khác.', 'error');
          return;
        }
      }

      this.notify('Đang lưu thông tin Rack...', 'info');

      try {
        var resWeb = await fetch(API_UPSERT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'racks.csv',
            idField: 'RackID',
            idValue: params.RackID,
            updates: params,
            mode: 'upsert'
          })
        });
        if (!resWeb.ok) {
          throw new Error('Lỗi cập nhật racks.csv: ' + resWeb.status);
        }

        // Cập nhật datachangehistory cho mỗi field được sửa (Mô phỏng theo quick_update)
        var changedAt = new Date().toISOString();
        var historyRow = {
          DataChangeID: 'DCH' + Date.now() + Math.random().toString(36).substr(2, 5),
          TableName: 'racks',
          RecordID: params.RackID,
          RecordIDField: 'RackID',
          FieldName: 'ALL',
          OldValue: '',
          NewValue: 'UPSERT_RACK',
          ChangedAt: changedAt,
          ChangedBy: (window.app && window.app._lastSelectedUserId) ? window.app._lastSelectedUserId : 'SYSTEM',
          ChangeSource: 'location_manager_v8.5.8',
          ChangeNote: 'Manager Upsert Rack',
          IsConflict: 'FALSE'
        };
        var resHistory = await fetch(API_UPSERT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'datachangehistory.csv',
            idField: 'DataChangeID',
            idValue: historyRow.DataChangeID,
            updates: historyRow,
            mode: 'insert'
          })
        });

        this.notify('Đã lưu Rack thành công', 'success');

        // Trigger tải lại DataManager
        if (global.DataManager && typeof global.DataManager.loadAllData === 'function') {
          await global.DataManager.loadAllData();
          this.refreshData();
          this.selectRack(params.RackID);
        }

      } catch (err) {
        console.error(err);
        this.notify('Lỗi: ' + err.message, 'error');
      }
    },

    editLayer: function (layerId) {
      // Tạo dialog popup nhỏ trên Rack Form để điền Info Layer
      var rackId = this.selectedRackId;
      if (!rackId) {
        this.notify('Vui lòng chọn hoặc lưu Rack trước', 'error');
        return;
      }

      var lObj = null;
      if (layerId) lObj = this.layers.find(function (l) { return l.RackLayerID === layerId; });
      var isNew = !lObj;

      var lNum = lObj ? (lObj.RackLayerNumber || '') : '';
      var lNote = lObj ? (lObj.RackLayerNotes || '') : '';

      var newLayerId = isNew ? (rackId + '-') : layerId;

      var promptHtml = `
         <div style="font-size: 14px; font-weight: 700; margin-bottom: 12px; color: #1e293b;">
            ${isNew ? '層を追加 / Thêm tầng' : '層を編集 / Chỉnh sửa Tầng'}
         </div>
         <div class="locm-form-group" style="margin-bottom: 12px">
            <label class="locm-label">層コード / Mã Tầng (VD: 2A-1)</label>
            <input type="text" class="locm-input" id="locm-frm-l-id" value="${escapeHtml(newLayerId)}" ${isNew ? '' : 'disabled'}>
         </div>
         <div class="locm-form-group" style="margin-bottom: 12px">
            <label class="locm-label">層番号 / Số Tầng</label>
            <input type="text" class="locm-input" id="locm-frm-l-num" value="${escapeHtml(lNum)}">
         </div>
         <div class="locm-form-group">
            <label class="locm-label">備考 / Ghi chú</label>
            <input type="text" class="locm-input" id="locm-frm-l-note" value="${escapeHtml(lNote)}">
         </div>
         <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
             <button class="locm-btn locm-btn-outline" onclick="document.body.removeChild(this.parentNode.parentNode.parentNode)">キャンセル / Hủy</button>
             <button class="locm-btn locm-btn-primary" id="locm-btn-l-save">保存 / Lưu lại</button>
         </div>
      `;

      var modal = document.createElement('div');
      modal.style.position = 'fixed';
      modal.style.inset = '0';
      modal.style.zIndex = '200100';
      modal.style.background = 'rgba(0,0,0,0.5)';
      modal.style.display = 'flex';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';

      var card = document.createElement('div');
      card.style.background = 'white';
      card.style.padding = '24px';
      card.style.borderRadius = '16px';
      card.style.width = '400px';
      card.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
      card.innerHTML = promptHtml;

      modal.appendChild(card);
      document.body.appendChild(modal);

      document.getElementById('locm-btn-l-save').onclick = function () {
        var idIn = document.getElementById('locm-frm-l-id').value.trim();
        var numIn = document.getElementById('locm-frm-l-num').value.trim();
        var noteIn = document.getElementById('locm-frm-l-note').value.trim();

        if (!idIn) { LocationManager.notify('Cần nhập Mã Tầng', 'error'); return; }

        document.body.removeChild(modal);
        LocationManager.saveLayer({
          RackLayerID: idIn,
          RackID: rackId,
          RackLayerNumber: numIn,
          RackLayerNotes: noteIn,
          RackCompanyNote: ''
        }, isNew);
      };
    },

    saveLayer: async function (params, isNew) {
      this.notify('Đang lưu thông tin Tầng...', 'info');

      try {
        var resWeb = await fetch(API_UPSERT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'racklayers.csv',
            idField: 'RackLayerID',
            idValue: params.RackLayerID,
            updates: params,
            mode: 'upsert'
          })
        });
        if (!resWeb.ok) { throw new Error('Lỗi cập nhật racklayers.csv: ' + resWeb.status); }

        var historyRow = {
          DataChangeID: 'DCH' + Date.now() + Math.random().toString(36).substr(2, 5),
          TableName: 'racklayers',
          RecordID: params.RackLayerID,
          RecordIDField: 'RackLayerID',
          FieldName: 'ALL',
          OldValue: '',
          NewValue: 'UPSERT_LAYER',
          ChangedAt: new Date().toISOString(),
          ChangedBy: (window.app && window.app._lastSelectedUserId) ? window.app._lastSelectedUserId : 'SYSTEM',
          ChangeSource: 'location_manager_v8.5.8',
          ChangeNote: 'Manager Upsert Layer',
          IsConflict: 'FALSE'
        };
        var resHistory = await fetch(API_UPSERT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'datachangehistory.csv',
            idField: 'DataChangeID',
            idValue: historyRow.DataChangeID,
            updates: historyRow,
            mode: 'insert'
          })
        });

        this.notify('Đã lưu Tầng thành công', 'success');

        if (global.DataManager && typeof global.DataManager.loadAllData === 'function') {
          await global.DataManager.loadAllData();
          this.refreshData();
          this.selectRack(this.selectedRackId);
        }
      } catch (err) {
        console.error(err);
        this.notify('Lỗi: ' + err.message, 'error');
      }
    },

    notify: function (msg, type) {
      if (global.NotificationModule) global.NotificationModule.show(msg, type);
      else alert(msg);
    }
  };

  // Utility to escape HTML and prevent injection
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  global.LocationManager = LocationManager;

})(window);

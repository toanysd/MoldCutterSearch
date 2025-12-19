/**
 * =====================================================
 * LOCATION MANAGER R7.0.9 - SEARCHABLE DROPDOWN
 * =====================================================
 * Created: 2025.12.05
 * Version: 7.0.9 (Added Searchable Dropdown Support)
 * Framework: Hybrid Architecture (V7.7.7 r6.4)
 *
 * ✅ NEW Features:
 * - Searchable dropdown cho Giá, Tầng, Nhân viên (giống Shipping/Check-in)
 * - Hỗ trợ tìm kiếm theo tên, ký hiệu
 * - Keyboard navigation (Arrow Up/Down, Enter, Tab, Escape)
 * - Auto-highlight matched items
 * - Cascade logic: Chọn Giá → Tự động load Tầng
 *
 * Dependencies:
 * - data-manager-r6.4.js (DataManager)
 * - location-manager-mobile-r7.0.8.css
 * - server-r6.4.js (API /api/locationlog)
 * - window.createSearchableSelect() (from checkin-checkout-r7.0.8.js)
 * =====================================================
 */

'use strict';

const GITHUB_API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/locationlog';
let currentItem = null;
let currentOldRackLayerID = null;
let sortColumn = 'DateEntry';
let sortOrder = 'desc';
let isClosingAfterSave = false;

// ✅ NEW: Store searchable select instances for access
let rackSelectInstance = null;
let layerSelectInstance = null;
let employeeSelectInstance = null;

// Helper: vuốt xuống từ header để đóng modal (mobile only)
function attachSwipeToClose(headerEl, modalEl, hideCallback) {
  if (!headerEl || !modalEl || !('ontouchstart' in window)) return;
  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  const resetDrag = () => {
    isDragging = false;
    modalEl.classList.remove('dragging');
    modalEl.style.transform = '';
    modalEl.style.opacity = '';
  };

  const onTouchStart = (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    startY = e.touches[0].clientY;
    currentY = startY;
    isDragging = true;
    modalEl.classList.add('dragging');
  };

  const onTouchMove = (e) => {
    if (!isDragging) return;
    const touchY = e.touches[0].clientY;
    const deltaY = touchY - startY;
    if (deltaY < 0) return;
    currentY = touchY;
    const translateY = Math.min(deltaY, 120);
    const opacity = 1 - Math.min(deltaY / 200, 0.5);
    modalEl.style.transform = `translateY(${translateY}px)`;
    modalEl.style.opacity = opacity;
  };

  const onTouchEnd = () => {
    if (!isDragging) return;
    const deltaY = currentY - startY;
    if (deltaY > 80) {
      resetDrag();
      if (typeof hideCallback === 'function') hideCallback();
    } else {
      resetDrag();
    }
  };

  headerEl.addEventListener('touchstart', onTouchStart, { passive: true });
  headerEl.addEventListener('touchmove', onTouchMove, { passive: true });
  headerEl.addEventListener('touchend', onTouchEnd);
  headerEl.addEventListener('touchcancel', resetDrag);
}

// =====================================================
// LOCATION CACHE - Tương tự PendingCache
// =====================================================
const LocationCache = {
  add: function(logData) {
    const pending = {
      ...logData,
      pending: true,
      localId: 'temp-' + Date.now() + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
    };

    if (!window.DataManager?.data?.locationlog) {
      window.DataManager.data.locationlog = [];
    }
    window.DataManager.data.locationlog.unshift(pending);
    this.persist();
    console.log('LocationCache Added:', pending.localId);
    return pending;
  },

  remove: function(localId) {
    if (!window.DataManager?.data?.locationlog) return;
    const beforeLen = window.DataManager.data.locationlog.length;
    window.DataManager.data.locationlog = window.DataManager.data.locationlog.filter(
      log => log.localId !== localId
    );
    const afterLen = window.DataManager.data.locationlog.length;
    if (beforeLen !== afterLen) {
      this.persist();
      console.log('LocationCache Removed:', localId);
    }
  },

  markError: function(localId, errorMsg) {
    const log = window.DataManager?.data?.locationlog?.find(l => l.localId === localId);
    if (log) {
      log.syncError = errorMsg;
      log.syncErrorAt = new Date().toISOString();
      this.persist();
      console.warn('LocationCache Marked error:', localId, errorMsg);
    }
  },

  persist: function() {
    try {
      const pending = window.DataManager?.data?.locationlog?.filter(log => log.pending);
      localStorage.setItem('pendingLocationLogs', JSON.stringify(pending));
      console.log('LocationCache Persisted:', pending?.length, 'logs');
    } catch (e) {
      console.warn('Failed to persist pending location logs:', e);
    }
  },

  restore: function() {
    try {
      const saved = localStorage.getItem('pendingLocationLogs');
      if (saved) {
        const pending = JSON.parse(saved);
        console.log('[LocationCache] 🔄 Restoring:', pending?.length, 'pending logs');
        
        if (!window.DataManager?.data?.locationlog) {
          window.DataManager.data.locationlog = [];
        }

        pending.forEach(p => {
          const existsByLocalId = window.DataManager.data.locationlog.some(log => 
            log.localId === p.localId
          );
          const existsByData = window.DataManager.data.locationlog.some(log =>
            log.MoldID === p.MoldID &&
            log.DateEntry === p.DateEntry &&
            log.NewRackLayer === p.NewRackLayer
          );

          if (!existsByLocalId && !existsByData) {
            window.DataManager.data.locationlog.unshift(p);
            console.log('[LocationCache] ✅ Restored pending log:', p.localId);
          } else {
            console.log('[LocationCache] ⚠️ Skipped duplicate log:', p.localId);
          }
        });

        console.log('[LocationCache] ✅ Restore complete:', pending?.length, 'logs');
      }
    } catch (e) {
      console.warn('Failed to restore pending location logs:', e);
    }
  },

  cleanup: function(maxAge = 3600000) {
    if (!window.DataManager?.data?.locationlog) return;
    const now = Date.now();
    const beforeLen = window.DataManager.data.locationlog.length;
    
    window.DataManager.data.locationlog = window.DataManager.data.locationlog.filter(log => {
      if (!log.pending) return true;
      const age = now - new Date(log.createdAt).getTime();
      return age <= maxAge;
    });

    const afterLen = window.DataManager.data.locationlog.length;
    if (beforeLen !== afterLen) {
      this.persist();
      console.log('LocationCache Cleaned up:', beforeLen - afterLen, 'old logs');
    }
  }
};

// =====================================================
// LOCATION MANAGER MAIN
// =====================================================
const LocationManager = {
  INIT: function() {
    console.log('LocationManager R7.0.9 Module ready (Searchable Dropdown)');
    LocationCache.restore();

    document.addEventListener('detail:changed', (e) => {
      if (e.detail?.item) {
        currentItem = e.detail.item;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        const panel = document.getElementById('loc-panel');
        if (panel) this.close();
      }
    });
  },

  // ===================================================
  // OPEN MODAL - Hiển thị popup cập nhật vị trí
  // ===================================================
  openModal: function(mode = 'location', item = currentItem) {
    // ✅ FIX: Hỗ trợ cả 2 cách gọi:
    // 1. openModal(item) - item là object
    // 2. openModal('location', item) - mode là string, item là object
    
    let actualMode = 'location';
    let actualItem = item;
    
    // Nếu tham số đầu tiên là object (không phải string), đó là item
    if (typeof mode === 'object' && mode !== null) {
      actualItem = mode;
      actualMode = 'location';
      console.log('[LocationManager] 🔄 Detected new calling style: openModal(item)');
    } else if (typeof mode === 'string') {
      actualMode = mode;
      actualItem = item || currentItem;
      console.log('[LocationManager] 🔄 Detected old calling style: openModal(mode, item)');
    }

    // ✅ VALIDATION: Kiểm tra item có hợp lệ không
    if (!actualItem) {
      alert('Vui lòng chọn khuôn trước.');
      console.error('[LocationManager] ❌ Item is null/undefined');
      return;
    }

    // ✅ VALIDATION: Kiểm tra item có MoldID hoặc CutterID
    if (!actualItem.MoldID && !actualItem.CutterID) {
      alert('❌ Lỗi: Không tìm thấy ID của thiết bị.\n❌ エラー：デバイスIDが見つかりません。');
      console.error('[LocationManager] ❌ Item has no MoldID or CutterID:', actualItem);
      return;
    }

    // ✅ DEBUG LOG: Hiển thị thông tin item
    console.log('[LocationManager] 🔍 Opening modal for item:', {
      MoldID: actualItem.MoldID,
      CutterID: actualItem.CutterID,
      MoldName: actualItem.MoldName,
      MoldCode: actualItem.MoldCode,
      currentRackLayer: actualItem.currentRackLayer,
      RackLayerID: actualItem.RackLayerID,
      fullItem: actualItem
    });

    // Gán vào biến global
    currentItem = actualItem;
    currentOldRackLayerID = actualItem.currentRackLayer || actualItem.RackLayerID;

    console.log('[LocationManager] ✅ Validated - currentOldRackLayerID:', currentOldRackLayerID);


    const existingPanel = document.getElementById('loc-panel');
    if (existingPanel) {
      existingPanel.remove();
      console.log('[LocationManager] Removed existing panel');
    }

    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      document.body.classList.add('modal-open');
      console.log('[LocationManager] ✅ Added modal-open class to body (iPhone mode)');
    }

    const upper = document.querySelector('.upper-section');
    if (!upper) {
      console.error('LocationManager: Upper section not found');
      return;
    }

    // Load data từ DataManager
    const racksList = window.DataManager?.data?.racks || [];
    const rackLayersList = window.DataManager?.data?.racklayers || [];
    const locationLogs = window.DataManager?.data?.locationlog || [];
    const employeesList = window.DataManager?.data?.employees || [];

    console.log('LocationManager Loaded:', {
      racks: racksList.length,
      racklayers: rackLayersList.length,
      employees: employeesList.length,
      currentRackLayerID: currentOldRackLayerID
    });

    // Auto-reload nền
    setTimeout(async () => {
      console.log('[LocationManager] 📡 Background reload starting...');
      try {
        await window.DataManager.loadAllData();
        console.log('[LocationManager] ✅ Background reload completed');
        
        const historyBody = document.querySelector('#loc-his tbody');
        if (historyBody && currentItem) {
          await this.refreshHistoryInPlace(currentItem);
          console.log('[LocationManager] ✅ History table auto-refreshed');
        }
      } catch (err) {
        console.warn('[LocationManager] Background reload failed:', err);
      }
    }, 500);

    // Lọc lịch sử
    // ✅ FIX: Lọc lịch sử với debug log
    console.log('[LocationManager] 🔍 Filtering history:', {
      totalLogs: locationLogs.length,
      itemMoldID: actualItem.MoldID,
      itemCutterID: actualItem.CutterID,
      sampleLog: locationLogs[0]
    });

    const historyLogs = locationLogs.filter(l => {
      // Support both MoldID and CutterID
      const moldMatch = actualItem.MoldID && String(l.MoldID).trim() === String(actualItem.MoldID).trim();
      const cutterMatch = actualItem.CutterID && String(l.CutterID).trim() === String(actualItem.CutterID).trim();
      
      const match = moldMatch || cutterMatch;
      
      // Debug first 3 non-matching logs
      if (!match && locationLogs.indexOf(l) < 3) {
        console.log('[LocationManager] ⚠️ Not matched:', {
          logMoldID: l.MoldID,
          itemMoldID: actualItem.MoldID,
          equal: l.MoldID === actualItem.MoldID
        });
      }
      
      return match;
    });

    console.log('[LocationManager] ✅ Filtered history logs:', historyLogs.length);

    // ✅ Sort theo sortColumn / sortOrder (time / emp / note giống CheckInOut)
    historyLogs.sort((a, b) => {
      let valA;
      let valB;

      switch (sortColumn) {
        case 'time':
        case 'DateEntry':
          valA = a.DateEntry ? new Date(a.DateEntry) : new Date(0);
          valB = b.DateEntry ? new Date(b.DateEntry) : new Date(0);
          break;
        case 'emp':
          valA = String(
            a.EmployeeName || a.EmployeeID || a.Employee || ''
          ).toLowerCase();
          valB = String(
            b.EmployeeName || b.EmployeeID || b.Employee || ''
          ).toLowerCase();
          break;
        case 'note':
          valA = String(a.LocationNotes || a.notes || '').toLowerCase();
          valB = String(b.LocationNotes || b.notes || '').toLowerCase();
          break;
        default:
          valA = a.DateEntry ? new Date(a.DateEntry) : new Date(0);
          valB = b.DateEntry ? new Date(b.DateEntry) : new Date(0);
          break;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });


    // ✅ FIX: Lấy thông tin với actualItem
    const moldID = actualItem.MoldID || actualItem.CutterID;
    const moldName = actualItem.MoldName || actualItem.MoldCode || actualItem.CutterName || actualItem.CutterCode || `ID-${moldID}`;

    console.log('[LocationManager] 🔍 Looking up current location:', {
      currentOldRackLayerID: currentOldRackLayerID,
      rackLayersCount: rackLayersList.length,
      racksCount: racksList.length
    });

    const currentRackLayer = rackLayersList.find(
      r => String(r.RackLayerID) === String(currentOldRackLayerID)
    );

    console.log('[LocationManager] Found RackLayer:', currentRackLayer);

    const currentRack = racksList.find(
      r => String(r.RackID) === String(currentRackLayer?.RackID)
    );

    console.log('[LocationManager] Found Rack:', currentRack);

    const rackDisplay = currentRack?.RackSymbol || currentRack?.RackNumber || `Giá ${currentRackLayer?.RackID || '?'}`;
    const layerDisplay = currentRackLayer?.RackLayerNumber || '?';
    const rackLocation = currentRack?.RackLocation || '-';

    console.log('[LocationManager] ✅ Display values:', {
      rackDisplay,
      layerDisplay,
      rackLocation
    });


    // ✅ BUILD HTML MODAL với containers cho searchable selects
    const html = `
<div class="location-panel" id="loc-panel">
  <!-- HEADER -->
  <div class="location-header">
    <div class="location-title">
      <i class="fas fa-map-marker-alt"></i>
      <div>
        <div class="location-title-main">位置変更 / Cập nhật vị trí</div>
        <div class="location-title-sub">金型 / Khuôn: ${this.escapeHtml(moldName)}</div>
      </div>
    </div>
    <button class="btn-close-location" id="btn-close-location" title="閉じる / Đóng">
      <i class="fas fa-times"></i>
    </button>
  </div>

  <!-- BODY -->
  <div class="location-body">
    <!-- 1. TRẠNG THÁI -->
    <section class="loc-status">
      <h4>📍 情報 / Thông tin hiện tại</h4>
      <div class="loc-inline-status">
        <div class="loc-inline-row">
          <span class="loc-inline-label">ID / Mã:</span>
          <span class="loc-inline-value">${this.escapeHtml(moldID)}</span>
          <span class="loc-inline-sep">•</span>
          <span class="loc-inline-label">名前 / Tên:</span>
          <span class="loc-inline-value">${this.escapeHtml(moldName)}</span>
        </div>
        <div class="loc-inline-row">
          <span class="loc-inline-label">現在の棚 / Giá hiện tại:</span>
          <span class="loc-inline-value">${this.escapeHtml(rackDisplay)}</span>
          <span class="loc-inline-sep">•</span>
          <span class="loc-inline-label">段 / Tầng:</span>
          <span class="loc-inline-value">${this.escapeHtml(layerDisplay)}</span>
        </div>
        <div class="loc-inline-row">
          <span class="loc-inline-label">場所 / Vị trí:</span>
          <span class="loc-inline-value">${this.escapeHtml(rackLocation)}</span>
        </div>
      </div>
    </section>

    <!-- 2. NHẬP LIỆU với searchable selects -->
    <section class="loc-inputs">
      <h4>✏️ 新位置 / Vị trí mới</h4>
      
      <!-- Giá / Rack -->
      <div class="location-form-group">
        <label class="location-form-label">
          <span class="label-ja">棚</span>
          <span class="label-vi">/ Giá</span>
        </label>
        <div id="rack-select-container"></div>
      </div>

      <!-- Tầng / Layer -->
      <div class="location-form-group">
        <label class="location-form-label">
          <span class="label-ja">段</span>
          <span class="label-vi">/ Tầng</span>
        </label>
        <div id="layer-select-container"></div>
      </div>

      <!-- Nhân viên / Employee -->
      <div class="location-form-group">
        <label class="location-form-label">
          <span class="label-ja">担当者</span>
          <span class="label-vi">/ Nhân viên</span>
        </label>
        <div id="employee-select-container"></div>
      </div>

      <!-- Ghi chú / Note -->
      <div class="location-form-group">
        <label class="location-form-label">
          <span class="label-ja">メモ</span>
          <span class="label-vi">/ Ghi chú</span>
        </label>
        <textarea 
          id="loc-note" 
          class="location-form-control" 
          rows="2" 
          placeholder="メモを入力... / Nhập ghi chú..."></textarea>
      </div>
    </section>

    <!-- 3. LỊCH SỬ -->
    <section class="loc-history">
      <h4>📋 履歴 / Lịch sử</h4>
      <div class="location-filter-row">
        <input 
          type="text" 
          id="loc-search" 
          class="location-form-control" 
          placeholder="🔍 検索... / Tìm kiếm..." />
      </div>
      <div class="location-history-wrap">
        ${this.renderHistory(historyLogs, racksList, rackLayersList, employeesList)}
      </div>
    </section>
  </div>

  <!-- NÚT DƯỚI CÙNG -->
  <div class="location-btn-row">
    <button class="btn-cancel-location" id="btn-cancel-location">
      <i class="fas fa-times"></i> キャンセル / Hủy
    </button>
    <button class="btn-confirm-location" id="btn-confirm-location">
      <i class="fas fa-check"></i> 更新 / Cập nhật
    </button>
  </div>
</div>
    `;

    upper.insertAdjacentHTML('beforeend', html);

    // ✅ KHỞI TẠO SEARCHABLE SELECTS
    this.initSearchableSelects(racksList, rackLayersList, employeesList, currentRackLayer?.RackID);
    // Gán sự kiện - luôn dùng actualItem đã validate
    this.bindModalEvents(actualItem, racksList, rackLayersList, employeesList);

    // Bật sort + filter cho bảng lịch sử
    this.enableSort();
    this.enableFilter();

    // Swipe to close (mobile)
    const panelEl = document.getElementById('loc-panel');

    // Focus input đầu tiên
    setTimeout(() => {
      const firstInput = document.querySelector('#loc-panel input, #loc-panel textarea');
      if (firstInput) {
        firstInput.focus();
        document.dispatchEvent(new CustomEvent('keyboard:attach', { detail: { element: firstInput } }));
      }
    }, 300);
  },

  // ===================================================
  // ✅ NEW: KHỞI TẠO SEARCHABLE SELECTS
  // ===================================================
  initSearchableSelects: function(racksList, rackLayersList, employeesList, defaultRackId) {
    console.log('[LocationManager] Initializing searchable selects...');

    // Check if createSearchableSelect exists
    if (typeof window.createSearchableSelect !== 'function') {
      console.error('[LocationManager] window.createSearchableSelect() not found!');
      alert('Lỗi: Không tìm thấy hàm tạo dropdown tìm kiếm. Vui lòng kiểm tra file checkin-checkout-r7.0.8.js');
      return;
    }

    // ========== 1. RACK SELECT ==========
    const rackContainer = document.getElementById('rack-select-container');
    if (rackContainer) {
      const rackOptions = racksList.map(r => ({
        id: String(r.RackID),
        name: `${r.RackSymbol || r.RackNumber || 'Giá ' + r.RackID} - ${r.RackLocation || ''}`
      }));

      rackSelectInstance = window.createSearchableSelect(
        'loc-rack',
        rackOptions,
        (selectedRackId) => {
          console.log('[LocationManager] Rack selected:', selectedRackId);
          // ✅ CASCADE: Khi chọn Giá → Reload danh sách Tầng
          this.updateLayerOptions(selectedRackId, rackLayersList);
        }
      );

      rackContainer.appendChild(rackSelectInstance);

      // Set default value nếu có
      if (defaultRackId && typeof rackSelectInstance.setValue === 'function') {
        rackSelectInstance.setValue(String(defaultRackId));
        console.log('[LocationManager] Set default rack:', defaultRackId);
      }
    }

    // ========== 2. LAYER SELECT (ban đầu trống) ==========
    const layerContainer = document.getElementById('layer-select-container');
    if (layerContainer) {
      layerSelectInstance = window.createSearchableSelect(
        'loc-layer',
        [], // Ban đầu trống, sẽ load sau khi chọn Rack
        (selectedLayerId) => {
          console.log('[LocationManager] Layer selected:', selectedLayerId);
        }
      );

      layerContainer.appendChild(layerSelectInstance);

      // Load layers cho rack hiện tại nếu có
      if (defaultRackId) {
        this.updateLayerOptions(defaultRackId, rackLayersList);
      }
    }

    // ========== 3. EMPLOYEE SELECT ==========
    const employeeContainer = document.getElementById('employee-select-container');
    if (employeeContainer) {
      const employeeOptions = employeesList.map(e => ({
        id: String(e.EmployeeID),
        name: e.EmployeeName || e.name || `EMP-${e.EmployeeID}`
      }));

      employeeSelectInstance = window.createSearchableSelect(
        'loc-employee',
        employeeOptions,
        (selectedEmpId) => {
          console.log('[LocationManager] Employee selected:', selectedEmpId);
        }
      );

      employeeContainer.appendChild(employeeSelectInstance);

      // Auto-select first employee
      if (employeesList.length > 0 && typeof employeeSelectInstance.setValue === 'function') {
        employeeSelectInstance.setValue(String(employeesList[0].EmployeeID));
      }
    }

    console.log('[LocationManager] ✅ Searchable selects initialized');
  },

  // ===================================================
  // ✅ NEW: CẬP NHẬT DANH SÁCH TẦNG KHI CHỌN GIÁ
  // ===================================================
  updateLayerOptions: function(rackId, rackLayersList) {
    console.log('[LocationManager] Updating layer options for rack:', rackId);

    if (!layerSelectInstance) {
      console.warn('[LocationManager] layerSelectInstance not found');
      return;
    }

    // Lọc các tầng thuộc rack được chọn
    const filteredLayers = rackLayersList.filter(layer =>
      String(layer.RackID) === String(rackId)
    );

    console.log('[LocationManager] Filtered layers:', filteredLayers.length);

    // Tạo options mới
    const layerOptions = filteredLayers.map(layer => ({
      id: String(layer.RackLayerID),
      name: layer.RackLayerNumber || `Tầng ${layer.RackLayerID}`
    }));

    // ✅ Cập nhật options trong dropdown
    // Cách 1: Tạo lại dropdown mới (đơn giản hơn)
    const layerContainer = document.getElementById('layer-select-container');
    if (layerContainer) {
      // Xóa instance cũ
      layerContainer.innerHTML = '';

      // Tạo instance mới với options mới
      layerSelectInstance = window.createSearchableSelect(
        'loc-layer',
        layerOptions,
        (selectedLayerId) => {
          console.log('[LocationManager] Layer selected:', selectedLayerId);
        }
      );

      layerContainer.appendChild(layerSelectInstance);

      // Auto-select first layer nếu có
      if (layerOptions.length > 0 && typeof layerSelectInstance.setValue === 'function') {
        layerSelectInstance.setValue(layerOptions[0].id);
      }
    }

    console.log('[LocationManager] ✅ Layer options updated:', layerOptions.length);
  },

  // ===================================================
  // RENDER HISTORY TABLE
  // ===================================================
  renderHistory: function(logs, racksList, rackLayersList, employeesList) {
    if (!logs || logs.length === 0) {
      return `<div class="no-history">📭 履歴がありません / Chưa có lịch sử</div>`;
    }

    const rows = logs.map(log => {
      const time = this.fmtDateTime(log.DateEntry);
      
      // Old Rack-Layer
      const oldRackLayer = rackLayersList.find(rl => 
        String(rl.RackLayerID) === String(log.OldRackLayer)
      );
      const oldRack = racksList.find(r => 
        String(r.RackID) === String(oldRackLayer?.RackID)
      );
      const oldDisplay = oldRack?.RackSymbol || oldRack?.RackNumber || log.OldRackLayer || '-';
      const oldLayerNum = oldRackLayer?.RackLayerNumber || '';

      // New Rack-Layer
      const newRackLayer = rackLayersList.find(rl =>
        String(rl.RackLayerID) === String(log.NewRackLayer)
      );
      const newRack = racksList.find(r =>
        String(r.RackID) === String(newRackLayer?.RackID)
      );
      const newDisplay = newRack?.RackSymbol || newRack?.RackNumber || log.NewRackLayer || '-';
      const newLayerNum = newRackLayer?.RackLayerNumber || '';

      // Employee
      const emp = employeesList.find(e => String(e.EmployeeID) === String(log.EmployeeID));
      const empName = emp?.EmployeeName || emp?.name || log.EmployeeID || '-';

      // Note
      const note = log.LocationNotes || '-';

      // Sync status
      const isPending = log.pending === true;
      const hasError = log.syncError;
      let syncClass, syncTitle, syncIcon;

      if (hasError) {
        syncClass = 'sync-dot error';
        syncTitle = `エラー / Lỗi: ${log.syncError}`;
        syncIcon = '❌';
      } else if (isPending) {
        syncClass = 'sync-dot pending';
        syncTitle = '同期待ち... / Đang đồng bộ...';
        syncIcon = '🔄';
      } else {
        syncClass = 'sync-dot synced';
        syncTitle = '同期済み / Đã đồng bộ';
        syncIcon = '✅';
      }

      return `
        <tr data-log-id="${log.LogID || log.localId}" class="${isPending ? 'row-pending' : ''}">
          <td data-time="${this.escapeHtml(log.DateEntry)}">${this.escapeHtml(time)}</td>
          <td>
            <div class="rack-transition">
              <span class="rack-old">${this.escapeHtml(oldDisplay)}${oldLayerNum ? '-' + oldLayerNum : ''}</span>
              <i class="fas fa-arrow-right"></i>
              <span class="rack-new">${this.escapeHtml(newDisplay)}${newLayerNum ? '-' + newLayerNum : ''}</span>
            </div>
          </td>
          <td>${this.escapeHtml(empName)}</td>
          <td class="note-cell">${this.escapeHtml(note)}</td>
          <td class="sync-cell">
            <span class="${syncClass}" title="${syncTitle}">${syncIcon}</span>
          </td>
        </tr>
      `;
    }).join('');

    return `
<table class="location-history-table" id="loc-his">
  <thead>
    <tr>
      <th data-sort="time">日時 / Thời gian</th>
      <th>旧→新</th>
      <th data-sort="emp">担当者 / NV</th>
      <th data-sort="note">メモ / Ghi chú</th>
      <th style="width:60px">Sync</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>
    `;
  },

  // ===================================================
  // REFRESH HISTORY IN-PLACE
  // ===================================================
  async refreshHistoryInPlace(item) {
    const tbody = document.querySelector('#loc-his tbody');
    if (!tbody) {
      console.warn('[LocationManager] History table not found');
      return;
    }

    console.log('[LocationManager] Refreshing history for MoldID:', item.MoldID);

    const allLogs = window.DataManager?.data?.locationlog || [];
    const racksList = window.DataManager?.data?.racks || [];
    const rackLayersList = window.DataManager?.data?.racklayers || [];
    const employeesList = window.DataManager?.data?.employees || [];

    // Hỗ trợ cả MoldID và CutterID (giống logic trong openModal)
    const moldLogs = allLogs.filter(l => {
      const moldMatch =
        item.MoldID &&
        String(l.MoldID).trim() === String(item.MoldID).trim();
      const cutterMatch =
        item.CutterID &&
        String(l.CutterID).trim() === String(item.CutterID).trim();
      return moldMatch || cutterMatch;
    });

    // ✅ Sort theo sortColumn / sortOrder (đồng bộ với openModal & header click)
    moldLogs.sort((a, b) => {
      let valA;
      let valB;

      switch (sortColumn) {
        case 'time':
        case 'DateEntry':
          valA = a.DateEntry ? new Date(a.DateEntry) : new Date(0);
          valB = b.DateEntry ? new Date(b.DateEntry) : new Date(0);
          break;
        case 'emp':
          valA = String(
            a.EmployeeName || a.EmployeeID || a.Employee || ''
          ).toLowerCase();
          valB = String(
            b.EmployeeName || b.EmployeeID || b.Employee || ''
          ).toLowerCase();
          break;
        case 'note':
          valA = String(a.LocationNotes || a.notes || '').toLowerCase();
          valB = String(b.LocationNotes || b.notes || '').toLowerCase();
          break;
        default:
          valA = a.DateEntry ? new Date(a.DateEntry) : new Date(0);
          valB = b.DateEntry ? new Date(b.DateEntry) : new Date(0);
          break;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // Re-render tbody
    const html = this.renderHistory(moldLogs, racksList, rackLayersList, employeesList);
    const wrap = document.querySelector('.location-history-wrap');
    if (wrap) {
      wrap.innerHTML = html;
      // Sau khi vẽ lại bảng phải bật lại sort + filter
      this.enableSort();
      this.enableFilter();
    }

    console.log('[LocationManager] ✅ History refreshed:', moldLogs.length, 'logs');

  },

  // ... (tiếp tục phần 2)
  // ===================================================
  // BIND MODAL EVENTS
  // ===================================================
  bindModalEvents: function(item, racksList, rackLayersList, employeesList) {
    // Nút đóng
    const closeBtn = document.getElementById('btn-close-location');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // Nút hủy
    const cancelBtn = document.getElementById('btn-cancel-location');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.close());
    }

    // Nút xác nhận
    const confirmBtn = document.getElementById('btn-confirm-location');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        this.saveRecord(item, racksList, rackLayersList, employeesList);
      });
    }

    // ESC key để đóng
    const escHandler = (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        const panel = document.getElementById('loc-panel');
        if (panel) {
          e.preventDefault();
          this.close();
          document.removeEventListener('keydown', escHandler);
        }
      }
    };
    document.addEventListener('keydown', escHandler);

    console.log('[LocationManager] ✅ Modal events bound');
  },

  // ===================================================
  // SAVE RECORD - GHI DỮ LIỆU
  // ===================================================
  async saveRecord(item, racksList, rackLayersList, employeesList) {
    console.log('[LocationManager] Saving record...');

    // ✅ LẤY GIÁ TRỊ TỪ SEARCHABLE SELECTS
    const rackInput = document.getElementById('loc-rack');
    const layerInput = document.getElementById('loc-layer');
    const employeeInput = document.getElementById('loc-employee');
    const noteInput = document.getElementById('loc-note');

    const selectedRackId = rackInput?.dataset?.selectedId || rackInput?.value || '';
    const selectedLayerId = layerInput?.dataset?.selectedId || layerInput?.value || '';
    const selectedEmployeeId = employeeInput?.dataset?.selectedId || employeeInput?.value || '';
    const noteValue = noteInput?.value?.trim() || '';

    console.log('[LocationManager] Form values:', {
      rackId: selectedRackId,
      layerId: selectedLayerId,
      employeeId: selectedEmployeeId,
      note: noteValue
    });

    // ===== VALIDATION =====
    if (!selectedRackId) {
      alert('❌ Vui lòng chọn Giá / 棚を選択してください');
      if (rackInput) rackInput.focus();
      return;
    }

    if (!selectedLayerId) {
      alert('❌ Vui lòng chọn Tầng / 段を選択してください');
      if (layerInput) layerInput.focus();
      return;
    }

    if (!selectedEmployeeId) {
      alert('❌ Vui lòng chọn Nhân viên / 担当者を選択してください');
      if (employeeInput) employeeInput.focus();
      return;
    }

    // Kiểm tra có thay đổi vị trí không
    const newRackLayerId = selectedLayerId;
    if (String(newRackLayerId) === String(currentOldRackLayerID)) {
      const confirmChange = confirm(
        '⚠️ Vị trí mới giống vị trí cũ. Bạn có chắc chắn muốn tiếp tục?\n' +
        '⚠️ 新しい位置は古い位置と同じです。続行しますか？'
      );
      if (!confirmChange) return;
    }

    // ===== CHUẨN BỊ DỮ LIỆU =====
    // Fallback: nếu item truyền vào không chuẩn thì dùng currentItem
    let targetItem = item || currentItem;

    if (!targetItem || (!targetItem.MoldID && !targetItem.CutterID)) {
      alert('❌ Lỗi: Không tìm thấy ID của thiết bị.\n❌ エラー：デバイスIDが見つかりません。');
      console.error('[LocationManager] ❌ saveRecord: item invalid', targetItem);
      return;
    }

    // Với mold thì dùng MoldID, với cutter thì tạm dùng CutterID làm ID gửi lên server
    const moldId = targetItem.MoldID || targetItem.CutterID;
    const nowIso = new Date().toISOString();

    // Tìm tên Rack-Layer để hiển thị (giữ nguyên như hiện tại)
    const oldRackLayer = rackLayersList.find(rl =>
      String(rl.RackLayerID) === String(currentOldRackLayerID)
    );
    const oldRack = racksList.find(r =>
      String(r.RackID) === String(oldRackLayer?.RackID)
    );
    const oldDisplay = oldRack?.RackSymbol || oldRack?.RackNumber || currentOldRackLayerID;
    const newRackLayer = rackLayersList.find(rl =>
      String(rl.RackLayerID) === String(newRackLayerId)
    );
    const newRack = racksList.find(r =>
      String(r.RackID) === String(newRackLayer?.RackID)
    );
    const newDisplay = newRack?.RackSymbol || newRack?.RackNumber || newRackLayerId;

    // ✅ ALIGN VỚI r7.0.4 nhưng vẫn giữ field mới
    const locationEntry = {
      MoldID: moldId,
      OldRackLayer: currentOldRackLayerID,
      NewRackLayer: newRackLayerId,

      // Tên trường cũ (server r7.0.4 đang dùng)
      Employee: selectedEmployeeId,
      notes: noteValue,

      // Tên trường mới (UI r7.0.9 đang dùng)
      EmployeeID: selectedEmployeeId,
      LocationNotes: noteValue,

      DateEntry: nowIso,
    };
    console.log('[LocationManager] Location entry:', locationEntry);


    // ===== BƯỚC 1: OPTIMISTIC UPDATE =====
    this.showBilingualToast('processing');

    const pendingLog = LocationCache.add(locationEntry);
    console.log('[LocationManager] Added to cache:', pendingLog.localId);

    // ===== BƯỚC 2: ĐÓNG MODAL NGAY =====
    isClosingAfterSave = true;
    this.close();

    // Event 1: Cập nhật chi tiết & đóng MobileDetailModal
    // モバイル詳細モーダル向けのイベント（R7.0.8で listen 中）
    document.dispatchEvent(new CustomEvent('location-updated', {
      detail: {
        item: targetItem,
        success: true,
        oldRackLayer: currentOldRackLayerID,
        newRackLayer: newRackLayerId,
        timestamp: nowIso
      }
    }));

    // Event 2: Giữ lại cho các module khác (tương thích ngược)
    // 互換性維持のため既存イベントも発火
    document.dispatchEvent(new CustomEvent('location-completed', {
      detail: {
        item: targetItem,
        success: true,
        oldRackLayer: currentOldRackLayerID,
        newRackLayer: newRackLayerId,
        timestamp: nowIso
      }
    }));

    // Dispatch event để cập nhật badge (giữ nguyên)
    document.dispatchEvent(new CustomEvent('detail:changed', {
      detail: {
        item: { ...targetItem, currentRackLayer: newRackLayerId },
        itemType: targetItem.itemType || (targetItem.CutterID ? 'cutter' : 'mold'),
        itemId: moldId,
        source: 'location-pending'
      }
    }));

    console.log('[LocationManager] Dispatched location-updated & location-completed events');

    // Reset flag
    setTimeout(() => {
      isClosingAfterSave = false;
    }, 100);


    // ===== BƯỚC 3: BACKGROUND SYNC =====
    setTimeout(async () => {
      try {
        await this.syncToGitHub(locationEntry, pendingLog.localId, moldId, newRackLayerId);
      } catch (err) {
        console.error('[LocationManager] Sync error:', err);
      }
    }, 100);
  },

  // ===================================================
  // SYNC TO GITHUB - BACKGROUND
  // ===================================================
  async syncToGitHub(data, localId, moldId, newRackLayerId) {
    console.log('[LocationManager] Starting background sync...', localId);

    try {
      // BƯỚC 1: POST TO GITHUB VIA SERVER
      // Sau: Gửi payload kiểu r7.0.4
      const payload = {
        MoldID: data.MoldID,
        OldRackLayer: data.OldRackLayer,
        NewRackLayer: data.NewRackLayer,
        notes: data.notes || data.LocationNotes || '',
        Employee: data.Employee || data.EmployeeID,
        DateEntry: data.DateEntry,
      };
      const res = await fetch(GITHUB_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const rj = await res.json();

      if (!rj.success) {
        throw new Error(rj.message || 'Server error');
      }

      console.log('[LocationManager] GitHub sync SUCCESS');

      // BƯỚC 2: XÓA PENDING LOG KHỎI CACHE
      LocationCache.remove(localId);
      console.log('[LocationManager] Removed pending log from cache:', localId);

      // BƯỚC 3: THÊM REAL LOG VÀO LOCATIONLOG ARRAY
      const realLog = {
      LogID: rj.logId || Date.now(),

      MoldID: data.MoldID,
      OldRackLayer: data.OldRackLayer,
      NewRackLayer: data.NewRackLayer,

      // Field kiểu cũ (để DataManager + các module cũ đọc được nếu dùng chung)
      Employee: data.Employee || data.EmployeeID,
      notes: data.notes || data.LocationNotes || '',

      // Field kiểu mới (đang được renderHistory r7.0.9 sử dụng)
      EmployeeID: data.EmployeeID || data.Employee,
      LocationNotes: data.LocationNotes || data.notes || '',

      DateEntry: data.DateEntry,
      synced: true,
    };


      // Kiểm tra trùng trước khi thêm
      const exists = window.DataManager?.data?.locationlog?.some(log =>
        log.DateEntry === realLog.DateEntry &&
        String(log.MoldID).trim() === String(realLog.MoldID).trim()
      );

      if (!exists) {
        window.DataManager.data.locationlog.unshift(realLog);
        console.log('[LocationManager] Added real log to locationlog array');
      } else {
        console.log('[LocationManager] Log already exists, skipping');
      }

      // BƯỚC 4: CẬP NHẬT CURRENTRACKLAYER TRONG MOLDS
      const mold = window.DataManager?.data?.molds?.find(m =>
        String(m.MoldID).trim() === String(moldId).trim()
      );

      if (mold) {
        mold.currentRackLayer = newRackLayerId;
        mold.RackLayerID = newRackLayerId; // Backup field
        console.log('[LocationManager] Updated mold currentRackLayer:', newRackLayerId);
      }

      // BƯỚC 5: REFRESH HISTORY TABLE NẾU VẪN MỞ
      const historyBody = document.querySelector('#loc-his tbody');
      if (historyBody && currentItem) {
        console.log('[LocationManager] Refreshing history table...');
        await this.refreshHistoryInPlace(currentItem);
        console.log('[LocationManager] History table refreshed');
      }

      // BƯỚC 6: DISPATCH EVENT UPDATE BADGE
      if (currentItem && String(currentItem.MoldID) === String(moldId)) {
        document.dispatchEvent(new CustomEvent('detail:changed', {
          detail: {
            item: { ...currentItem, currentRackLayer: newRackLayerId },
            itemType: 'mold',
            itemId: moldId,
            source: 'location-synced'
          }
        }));

        console.log('[LocationManager] Dispatched detail:changed event');
      }

      // BƯỚC 7: TOAST SUCCESS
      this.showBilingualToast('success');
      console.log('[LocationManager] Sync completed successfully');

    } catch (err) {
      console.error('[LocationManager] Sync error:', err);

      // Mark error trong PendingCache
      LocationCache.markError(localId, err.message);

      // Refresh UI để hiển thị error state
      const historyBody = document.querySelector('#loc-his tbody');
      if (historyBody && currentItem) {
        await this.refreshHistoryInPlace(currentItem);
      }

      // Toast lỗi
      this.showBilingualToast('error');

      // Retry after 30s
      console.log('[LocationManager] Will retry sync after 30s...');
      setTimeout(() => {
        const pendingLogs = window.DataManager?.data?.locationlog || [];
        const log = pendingLogs.find(l => l.localId === localId);

        if (log && log.syncError) {
          console.log('[LocationManager] Retrying sync for:', localId);
          this.syncToGitHub(log, localId, log.MoldID, log.NewRackLayer);
        } else {
          console.log('[LocationManager] Retry skipped: pending log not found or already synced');
        }
      }, 30000);
    }
  },

  // ===================================================
  // ENABLE SORT - SẮP XẾP LỊCH SỬ (giống CheckInOut)
  // ===================================================
  enableSort: function() {
    const table = document.getElementById('loc-his');
    if (!table) return;

    const headers = table.querySelectorAll('thead th[data-sort]');
    if (!headers || headers.length === 0) return;

    const self = this;

    headers.forEach(th => {
      th.style.cursor = 'pointer';

      th.addEventListener('click', function() {
        const column = this.dataset.sort;
        if (!column) return;

        // Nếu click lại cùng cột → đảo chiều, khác cột → sort asc
        if (sortColumn === column) {
          sortOrder = (sortOrder === 'asc') ? 'desc' : 'asc';
        } else {
          sortColumn = column;
          sortOrder = 'asc';
        }

        // Cập nhật class hiển thị trạng thái sort (optional)
        headers.forEach(h => h.classList.remove('sorted-asc', 'sorted-desc'));
        this.classList.add(sortOrder === 'asc' ? 'sorted-asc' : 'sorted-desc');

        // Render lại bảng lịch sử với sort mới
        if (currentItem) {
          self.refreshHistoryInPlace(currentItem);
        }
      });
    });

    console.log('[LocationManager] Sort enabled for history table');
  },


  // ===================================================
  // ENABLE FILTER - TÌM KIẾM LỊCH SỬ
  // ===================================================
  enableFilter: function() {
    const input = document.getElementById('loc-search');
    const table = document.getElementById('loc-his');

    if (!input || !table) return;

    input.addEventListener('input', () => {
      const term = input.value.toLowerCase();
      const rows = table.querySelectorAll('tbody tr');

      rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
      });
    });

    console.log('[LocationManager] Filter enabled');
  },

  // ===================================================
  // CLOSE MODAL
  // ===================================================
  close: function() {
    const panel = document.getElementById('loc-panel');
    if (panel) {
      panel.remove();
      console.log('[LocationManager] Panel closed');
    }

    // Chỉ dispatch cancel event nếu KHÔNG phải từ saveRecord
    if (!isClosingAfterSave) {
      document.dispatchEvent(new CustomEvent('module-cancelled', {
        detail: {
          module: 'location',
          item: currentItem,
          timestamp: new Date().toISOString()
        }
      }));
      console.log('[LocationManager] Dispatched module-cancelled event');
    } else {
      console.log('[LocationManager] Skipped module-cancelled: closing after save');
    }

    // Remove modal-open class from body
    if (document.body.classList.contains('modal-open')) {
      // Chỉ xóa nếu không còn panel nào khác
      const existingPanel = document.getElementById('loc-panel') || 
                           document.getElementById('cio-panel') ||
                           document.getElementById('ship-panel');
      
      if (!existingPanel) {
        document.body.classList.remove('modal-open');
        console.log('[LocationManager] Removed modal-open class from body');
      }
    }

    // Trả bàn phím về searchbox chính
    const searchBox = document.querySelector('.search-input');
    if (searchBox) {
      searchBox.focus();
      document.dispatchEvent(new CustomEvent('keyboard:attach', {
        detail: { element: searchBox }
      }));
      console.log('[LocationManager] Keyboard reattached to searchbox');
    }

    // Reset instances
    rackSelectInstance = null;
    layerSelectInstance = null;
    employeeSelectInstance = null;
  },

  // ===================================================
  // HELPER: FORMAT DATE TIME
  // ===================================================
  fmtDateTime: function(dateStr) {
    if (!dateStr) return '-';
    
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');

    return `${year}/${month}/${day} ${hour}:${min}`;
  },

  // ===================================================
  // HELPER: ESCAPE HTML
  // ===================================================
  escapeHtml: function(str) {
    if (str === null || str === undefined) return '';
    
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  // ===================================================
  // MULTILINGUAL TOAST
  // ===================================================
  showBilingualToast: function(type, extraMessage) {
    let message = '';

    if (type === 'success') {
      message = '✅ 更新成功 / Cập nhật thành công!';
    } else if (type === 'error') {
      message = '❌ エラー / Lỗi ghi dữ liệu';
      if (extraMessage) {
        message += `: ${extraMessage}`;
      }
    } else if (type === 'processing') {
      message = '⏳ 処理中... / Đang xử lý...';
    } else {
      message = '📝 処理中... / Đang xử lý...';
    }

    this.showToast(message, type === 'error' ? 'error' : type === 'success' ? 'success' : 'info');
  },

  // ===================================================
  // TOAST NOTIFICATION
  // ===================================================
  showToast: function(message, type = 'info') {
    // Xóa toast cũ nếu có
    const existing = document.getElementById('loc-toast');
    if (existing) existing.remove();

    // Tạo toast mới
    const toast = document.createElement('div');
    toast.id = 'loc-toast';
    toast.className = `loc-toast loc-toast-${type}`;
    toast.textContent = message;

    // Style
    Object.assign(toast.style, {
      position: 'fixed',
      left: '50%',
      bottom: '80px',
      transform: 'translateX(-50%)',
      background: type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#4b5563',
      color: '#fff',
      padding: '10px 16px',
      borderRadius: '999px',
      fontSize: '13px',
      fontWeight: '600',
      zIndex: '10050',
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      maxWidth: '90%',
      textAlign: 'center',
      pointerEvents: 'none',
      opacity: '0',
      transition: 'opacity 0.3s ease'
    });

    document.body.appendChild(toast);

    // Fade in
    setTimeout(() => {
      toast.style.opacity = '1';
    }, 10);

    // Fade out after 2s
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 2000);
  }
};

// =====================================================
// XUẤT RA GLOBAL SCOPE
// =====================================================
window.LocationManager = {
  openModal: LocationManager.openModal.bind(LocationManager),
  close: LocationManager.close.bind(LocationManager),
  init: LocationManager.INIT.bind(LocationManager),
  refreshHistoryInPlace: LocationManager.refreshHistoryInPlace.bind(LocationManager)
};

// =====================================================
// AUTO-INIT
// =====================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => LocationManager.INIT());
} else {
  LocationManager.INIT();
}

console.log('✅ LocationManager R7.0.9 Module loaded (Searchable Dropdown)');

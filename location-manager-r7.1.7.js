/**
 * =====================================================
 * LOCATION MANAGER - JAVASCRIPT MODULE
 * =====================================================
 * Version: r7.1.6
 * Created: 2025-12-26 13:51 JST
 * 
 * CHANGELOG r7.1.6:
 * ✅ Footer buttons (Update/Cancel at bottom like history-view)
 * ✅ Compact current info (ID・Name, Rack-Layer format)
 * ✅ Rearranged input fields: Direct, Employee, Rack, Layer, Note
 * ✅ Enhanced search: supports date formats (20251226, 202512, 1226, 12/26, etc.)
 * ✅ Default: Lock mode (table locked by default)
 * ✅ Colorful UI matching history-view
 * 
 * Dependencies:
 * - window.DataManager (data-manager-r6.4.js)
 * - location-manager-desktop-r7.1.6.css
 * - location-manager-mobile-r7.1.5.css
 * - Backend API: /api/locationlog, /api/deletelocationlog
 * ===================================================== */

'use strict';

const LOCATION_API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/locationlog';
const DELETE_LOCATIONLOG_API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/deletelocationlog';

let currentItem = null;
let currentOldRackLayerID = null;

let sortColumn = 'DateEntry';
let sortOrder = 'desc';

let isClosingAfterSave = false;

const STORAGE_KEY_HISTORY_UNLOCK = 'loc:history-unlocked';

function isHistoryUnlocked() {
  return localStorage.getItem(STORAGE_KEY_HISTORY_UNLOCK) === '1';
}

function setHistoryUnlocked(v) {
  localStorage.setItem(STORAGE_KEY_HISTORY_UNLOCK, v ? '1' : '0');
}

/* =====================================================
   HELPER: Swipe to close (mobile only)
   ===================================================== */
function attachSwipeToClose(headerEl, modalEl, hideCallback) {
  if (!headerEl || !modalEl || !('ontouchstart' in window)) return;

  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  const reset = () => {
    isDragging = false;
    modalEl.classList.remove('dragging');
    modalEl.style.transform = '';
    modalEl.style.opacity = '';
  };

  const onStart = (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    startY = e.touches[0].clientY;
    currentY = startY;
    isDragging = true;
    modalEl.classList.add('dragging');
  };

  const onMove = (e) => {
    if (!isDragging) return;
    const y = e.touches[0].clientY;
    const dy = y - startY;
    if (dy < 0) return;
    currentY = y;
    const translateY = Math.min(dy, 120);
    const opacity = 1 - Math.min(dy / 200, 0.5);
    modalEl.style.transform = `translateY(${translateY}px)`;
    modalEl.style.opacity = opacity;
  };

  const onEnd = () => {
    if (!isDragging) return;
    const dy = currentY - startY;
    reset();
    if (dy > 80 && typeof hideCallback === 'function') hideCallback();
  };

  headerEl.addEventListener('touchstart', onStart, { passive: true });
  headerEl.addEventListener('touchmove', onMove, { passive: true });
  headerEl.addEventListener('touchend', onEnd);
  headerEl.addEventListener('touchcancel', reset);
}

/* =====================================================
   Pending cache - Offline / pending logs
   ===================================================== */
const LocationCache = {
  add(logData) {
    const pending = {
      ...logData,
      pending: true,
      localId: 'temp-' + Date.now() + Math.random().toString(36).slice(2),
      createdAt: new Date().toISOString(),
    };
    if (!window.DataManager?.data?.locationlog) window.DataManager.data.locationlog = [];
    window.DataManager.data.locationlog.unshift(pending);
    this.persist();
    return pending;
  },

  remove(localId) {
    if (!window.DataManager?.data?.locationlog) return;
    const before = window.DataManager.data.locationlog.length;
    window.DataManager.data.locationlog = window.DataManager.data.locationlog.filter((l) => l.localId !== localId);
    const after = window.DataManager.data.locationlog.length;
    if (before !== after) this.persist();
  },

  markError(localId, errorMsg) {
    const log = window.DataManager?.data?.locationlog?.find((l) => l.localId === localId);
    if (!log) return;
    log.syncError = String(errorMsg || 'Unknown error');
    log.syncErrorAt = new Date().toISOString();
    this.persist();
  },

  persist() {
    try {
      const pending = window.DataManager?.data?.locationlog?.filter((l) => l.pending) || [];
      localStorage.setItem('pendingLocationLogs', JSON.stringify(pending));
    } catch (e) {}
  },

  restore() {
    try {
      const saved = localStorage.getItem('pendingLocationLogs');
      if (!saved) return;
      const pending = JSON.parse(saved) || [];
      if (!window.DataManager?.data?.locationlog) window.DataManager.data.locationlog = [];

      pending.forEach((p) => {
        const existsByLocalId = window.DataManager.data.locationlog.some((l) => l.localId === p.localId);
        const existsByData = window.DataManager.data.locationlog.some((l) => {
          const sameItem =
            (p.MoldID && String(l.MoldID || '').trim() === String(p.MoldID).trim()) ||
            (p.CutterID && String(l.CutterID || '').trim() === String(p.CutterID).trim());
          return sameItem && String(l.DateEntry) === String(p.DateEntry) && String(l.NewRackLayer) === String(p.NewRackLayer);
        });

        if (!existsByLocalId && !existsByData) window.DataManager.data.locationlog.unshift(p);
      });
    } catch (e) {}
  },
};

/* =====================================================
   UTIL
   ===================================================== */
function escapeHtml(v) {
  const s = String(v ?? '');
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtDateTime(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr);
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    const HH = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${MM}/${DD} ${HH}:${mm}`;
  } catch {
    return String(isoStr);
  }
}

function getEmployeeName(empId, employeesList) {
  if (!empId) return '-';
  const found = employeesList?.find((e) => String(e.EmployeeID) === String(empId));
  return found?.EmployeeName || found?.name || String(empId);
}

function showToast(type) {
  const map = {
    processing: '処理中... / Đang xử lý...',
    success: '成功 / Cập nhật thành công',
    error: 'エラー / Lỗi',
    refreshed: '更新しました / Đã làm mới',
    deleting: '削除中... / Đang xóa...',
    deleted: '削除しました / Đã xóa',
  };
  const msg = map[type] || String(type);

  if (typeof window.showToast === 'function') {
    window.showToast(msg);
    return;
  }

  let el = document.getElementById('loc-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loc-toast';
    el.style.cssText =
      'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:#111;color:#fff;padding:10px 14px;border-radius:10px;z-index:99999;opacity:0;transition:opacity .18s ease;max-width:80vw;text-align:center;font-size:13px;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.style.opacity = '0'), 1600);
}

/* =====================================================
   Select helpers (native select)
   ===================================================== */
function setSelectOptions(selectEl, options, placeholder) {
  if (!selectEl) return;
  selectEl.innerHTML = '';

  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = placeholder;
  selectEl.appendChild(ph);

  (options || []).forEach((o) => {
    const opt = document.createElement('option');
    opt.value = String(o.value);
    opt.textContent = String(o.label);
    selectEl.appendChild(opt);
  });
}

function trySelectValue(selectEl, value) {
  if (!selectEl) return false;
  const v = String(value ?? '');
  const has = Array.from(selectEl.options).some((o) => String(o.value) === v);
  if (has) {
    selectEl.value = v;
    return true;
  }
  return false;
}

function updateLayerSelectOptions(rackId, rackLayersList) {
  const layerSel = document.getElementById('loc-layer');
  const filtered = (rackLayersList || [])
    .filter((l) => String(l.RackID) === String(rackId))
    .map((l) => ({
      value: String(l.RackLayerID),
      label: `${l.RackLayerNumber} - ${l.RackLayerID}`,
    }));

  setSelectOptions(layerSel, filtered, '選択 / Chọn tầng');
}

function resolveRackLayerIdFromDirectInput(inputValue, racksList, rackLayersList) {
  const value = String(inputValue || '')
    .trim()
    .replace(/[^\d]/g, '');
  if (!value) return null;

  // Exact RackLayerID
  const exact = (rackLayersList || []).find((l) => String(l.RackLayerID) === value);
  if (exact) return String(exact.RackLayerID);

  // Shorthand: last digit = layer, rest = rack number/symbol
  if (value.length < 2) return null;
  const layerNum = value.slice(-1);
  const rackNum = value.slice(0, -1);

  const matchingRack = (racksList || []).find((r) => {
    const rackNumber = String(r.RackNumber ?? '').trim();
    const rackSymbol = String(r.RackSymbol ?? '').trim();
    return String(r.RackID) === rackNum || rackNumber === rackNum || rackSymbol === rackNum;
  });
  if (!matchingRack) return null;

  const matchingLayer = (rackLayersList || []).find(
    (l) => String(l.RackID) === String(matchingRack.RackID) && String(l.RackLayerNumber) === String(layerNum)
  );
  return matchingLayer ? String(matchingLayer.RackLayerID) : null;
}

function applyDirectInputToSelects(value, racksList, rackLayersList) {
  const rackSel = document.getElementById('loc-rack');
  const layerSel = document.getElementById('loc-layer');

  const resolved = resolveRackLayerIdFromDirectInput(value, racksList, rackLayersList);
  if (!resolved) return;

  const layerObj = (rackLayersList || []).find((l) => String(l.RackLayerID) === String(resolved));
  if (!layerObj) return;

  trySelectValue(rackSel, layerObj.RackID);
  updateLayerSelectOptions(String(layerObj.RackID), rackLayersList);
  trySelectValue(layerSel, layerObj.RackLayerID);
}

/* =====================================================
   Enhanced search - Date format support
   ===================================================== */
function normalizeSearchDate(dateStr) {
  if (!dateStr) return '';
  
  // Convert ISO date to searchable formats
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  
  // Return multiple formats: 20251226, 202512, 1226, 12/26, 2025/12, 2025/12/26
  return [
    `${year}${month}${day}`,
    `${year}${month}`,
    `${month}${day}`,
    `${month}/${day}`,
    `${year}/${month}`,
    `${year}/${month}/${day}`,
  ].join(' ');
}

/* =====================================================
   History rendering
   ===================================================== */
function renderHistoryRow(log, racksList, rackLayersList, employeesList, showActions) {
  const rowId = log.LocationLogID || log.LogID || log.localId || '';
  const time = fmtDateTime(log.DateEntry);
  const dateSearchable = normalizeSearchDate(log.DateEntry);

  const oldRackLayer = (rackLayersList || []).find((rl) => String(rl.RackLayerID) === String(log.OldRackLayer));
  const newRackLayer = (rackLayersList || []).find((rl) => String(rl.RackLayerID) === String(log.NewRackLayer));

  const oldRack = (racksList || []).find((r) => String(r.RackID) === String(oldRackLayer?.RackID));
  const newRack = (racksList || []).find((r) => String(r.RackID) === String(newRackLayer?.RackID));

  const oldDisplay =
    (oldRack?.RackSymbol || oldRack?.RackNumber || log.OldRackLayer || '-') +
    (oldRackLayer?.RackLayerNumber ? `-${oldRackLayer.RackLayerNumber}` : '');

  const newDisplay =
    (newRack?.RackSymbol || newRack?.RackNumber || log.NewRackLayer || '-') +
    (newRackLayer?.RackLayerNumber ? `-${newRackLayer.RackLayerNumber}` : '');

  const empName = getEmployeeName(log.EmployeeID, employeesList);
  const notes = log.notes ? String(log.notes) : '-';

  const isPending = log.pending === true;
  const hasError = !!log.syncError;
  const rowClass = isPending ? 'row-pending' : '';

  let syncTd = '';
  let deleteTd = '';

  if (showActions) {
    let syncClass = 'sync-dot synced';
    let syncTitle = 'Synced';
    let syncIcon = '●';

    if (hasError) {
      syncClass = 'sync-dot error';
      syncTitle = String(log.syncError || 'Sync error');
      syncIcon = '✖';
    } else if (isPending) {
      syncClass = 'sync-dot pending';
      syncTitle = '同期中... / Đang đồng bộ...';
      syncIcon = '●';
    }

    syncTd = `<td class="col-sync"><span class="${syncClass}" title="${escapeHtml(syncTitle)}">${syncIcon}</span></td>`;

    if (!isPending && !hasError) {
      deleteTd = `
        <td class="col-delete action-cell">
          <button class="btn-delete-history" data-log-id="${escapeHtml(rowId)}"
            data-time="${encodeURIComponent(String(log.DateEntry || ''))}" title="削除 / Xóa">🗑</button>
        </td>`;
    } else {
      deleteTd = `<td class="col-delete action-cell"></td>`;
    }
  }

  return `
    <tr data-log-id="${escapeHtml(rowId)}" data-time="${escapeHtml(String(log.DateEntry || ''))}" 
        data-search="${escapeHtml(dateSearchable)}" class="${rowClass}">
      <td>${escapeHtml(time)}</td>
      <td><span class="location-badge old-location">${escapeHtml(oldDisplay)}</span></td>
      <td><span class="location-badge new-location">${escapeHtml(newDisplay)}</span></td>
      <td>${escapeHtml(empName)}</td>
      <td class="note-cell">${escapeHtml(notes)}</td>
      ${syncTd}
      ${deleteTd}
    </tr>
  `;
}

function renderHistoryTable(logs, racksList, rackLayersList, employeesList, showActions) {
  if (!logs || logs.length === 0) {
    return `<div class="no-history">履歴なし / Chưa có lịch sử</div>`;
  }

  const lockClass = showActions ? 'history-unlocked' : 'history-locked';
  const rows = logs.map((log) => renderHistoryRow(log, racksList, rackLayersList, employeesList, showActions)).join('');

  return `
  <table class="location-history-table ${lockClass}" id="loc-his">
    <thead>
      <tr>
        <th data-sort="DateEntry">時間 / Thời gian</th>
        <th data-sort="old">古い / Cũ</th>
        <th data-sort="new">新しい / Mới</th>
        <th data-sort="emp">担当者 / NV</th>
        <th data-sort="note">メモ / Ghi chú</th>
        ${showActions ? '<th class="col-sync">Sync</th>' : ''}
        ${showActions ? '<th class="col-delete">削除 / Xóa</th>' : ''}
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  `;
}

/* =====================================================
   Sort & filter
   ===================================================== */
function sortLogsInPlace(logs, racksList, rackLayersList, employeesList) {
  logs.sort((a, b) => {
    let va, vb;

    switch (sortColumn) {
      case 'DateEntry':
        va = a.DateEntry ? new Date(a.DateEntry).getTime() : 0;
        vb = b.DateEntry ? new Date(b.DateEntry).getTime() : 0;
        break;
      case 'old':
        va = parseInt(String(a.OldRackLayer ?? '').replace(/\D/g, ''), 10) || 0;
        vb = parseInt(String(b.OldRackLayer ?? '').replace(/\D/g, ''), 10) || 0;
        break;
      case 'new':
        va = parseInt(String(a.NewRackLayer ?? '').replace(/\D/g, ''), 10) || 0;
        vb = parseInt(String(b.NewRackLayer ?? '').replace(/\D/g, ''), 10) || 0;
        break;
      case 'emp': {
        const na = getEmployeeName(a.EmployeeID, employeesList).toLowerCase();
        const nb = getEmployeeName(b.EmployeeID, employeesList).toLowerCase();
        va = na;
        vb = nb;
        break;
      }
      case 'note':
        va = String(a.notes || '').toLowerCase();
        vb = String(b.notes || '').toLowerCase();
        break;
      default:
        va = a.DateEntry ? new Date(a.DateEntry).getTime() : 0;
        vb = b.DateEntry ? new Date(b.DateEntry).getTime() : 0;
        break;
    }

    if (va < vb) return sortOrder === 'asc' ? -1 : 1;
    if (va > vb) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });
}

function enableFilter() {
  const input = document.getElementById('loc-search');
  if (!input) return;

  input.addEventListener('input', () => {
    const q = String(input.value || '')
      .toLowerCase()
      .trim();
    const rows = document.querySelectorAll('#loc-his tbody tr');
    rows.forEach((tr) => {
      const text = String(tr.textContent || '').toLowerCase();
      const dateSearch = String(tr.getAttribute('data-search') || '').toLowerCase();
      const combined = text + ' ' + dateSearch;
      tr.style.display = q === '' || combined.includes(q) ? '' : 'none';
    });
  });
}

function enableSortAndRepaint(item) {
  const headers = document.querySelectorAll('#loc-his thead th[data-sort]');
  headers.forEach((th) => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort');
      if (!col) return;
      if (sortColumn === col) sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
      else {
        sortColumn = col;
        sortOrder = 'desc';
      }
      LocationManager.refreshHistoryInPlace(item);
    });
  });
}

/* =====================================================
   Lock toggle
   ===================================================== */
function bindLockToggle(item) {
  const btn = document.getElementById('loc-lock-toggle');
  if (!btn) return;

  const apply = (unlocked) => {
    const table = document.getElementById('loc-his');
    const wrap = document.querySelector('.location-history-wrap');

    if (table) {
      table.classList.toggle('history-unlocked', !!unlocked);
      table.classList.toggle('history-locked', !unlocked);
    }

    if (wrap) {
      wrap.classList.toggle('scroll-unlocked', !!unlocked);
    }

    btn.innerHTML = `<span class="lock-text">${unlocked ? 'Unlock' : 'Lock'}</span>`;
  };

  // Default: Lock mode
  const unlocked = isHistoryUnlocked();
  apply(unlocked);

  btn.addEventListener('click', () => {
    const next = !isHistoryUnlocked();
    setHistoryUnlocked(next);
    apply(next);
    if (item) LocationManager.refreshHistoryInPlace(item);
  });
}

/* =====================================================
   Modal HTML builder - WITH FOOTER BUTTONS
   ===================================================== */
function buildModalHtml({ isMold, itemName, itemId, rackLayerDisplay, rackLocation, historyHtml }) {
  return `
  <div class="location-panel" id="loc-panel">
    <div class="location-header">
      <div class="location-title">
        <i class="fas fa-map-marker-alt"></i>
        <div>
          <div class="location-title-main">位置変更 / Cập nhật vị trí</div>
          <div class="location-title-sub">${isMold ? '金型 / Khuôn' : '刃物 / Dao cắt'}: ${escapeHtml(itemName)}</div>
        </div>
      </div>
      <div class="header-actions">
        <button class="btn-refresh" id="loc-refresh" title="更新 / Refresh"><i class="fas fa-sync"></i></button>
        <button class="btn-close-location" id="btn-close-location" title="閉じる / Đóng"><i class="fas fa-times"></i></button>
      </div>
    </div>

    <div class="location-body">
      <!-- HISTORY -->
      <section class="loc-history">
        <h4><i class="fas fa-history"></i> 履歴 / Lịch sử</h4>
        <div class="history-controls">
          <input type="text" id="loc-search" class="location-form-control" placeholder="検索 (日付: 20251226, 1226, 12/26...) / Tìm kiếm...">
          <button id="loc-lock-toggle" type="button" class="lock-toggle" title="Lock / Unlock">
            <span class="lock-text">Lock</span>
          </button>
        </div>
        <div class="location-history-wrap">${historyHtml}</div>
      </section>

      <!-- CURRENT INFO - 2-COLUMN GRID -->
      <section class="loc-status">
        <h4><i class="fas fa-info-circle"></i> 情報 / Thông tin</h4>
        <div class="loc-info-grid">
          <div class="loc-info-label">ID・名前<br>ID・Tên</div>
          <div class="loc-info-value highlight">${escapeHtml(itemId)} ・ ${escapeHtml(itemName)}</div>
          
          <div class="loc-info-label">棚・段<br>Giá-Tầng</div>
          <div class="loc-info-value">${escapeHtml(rackLayerDisplay)}</div>
          
          <div class="loc-info-label">場所<br>Vị trí</div>
          <div class="loc-info-value">${escapeHtml(rackLocation)}</div>
        </div>
      </section>


      <!-- NEW LOCATION INPUTS - REARRANGED ORDER -->
      <section class="loc-inputs">
        <h4><i class="fas fa-edit"></i> 新位置 / Vị trí mới</h4>

        <div class="loc-inputs-scroll">
          <div class="loc-form-grid">
            <!-- 1. Direct input -->
            <div class="loc-field-row">
              <div class="loc-field-label">
                <span class="ja">直接入力</span>
                <span class="vi">Nhập trực tiếp</span>
              </div>
              <input type="text" id="loc-direct-id" class="location-form-control"
                     placeholder="700 / 181 (18-1)"
                     maxlength="6" pattern="[0-9]*" inputmode="numeric">
            </div>

            <!-- 2. Employee -->
            <div class="loc-field-row">
              <div class="loc-field-label">
                <span class="ja">担当者</span>
                <span class="vi">Nhân viên</span>
              </div>
              <select id="loc-employee" class="location-form-control"></select>
            </div>

            <!-- 3. Rack -->
            <div class="loc-field-row">
              <div class="loc-field-label">
                <span class="ja">棚</span>
                <span class="vi">Giá</span>
              </div>
              <select id="loc-rack" class="location-form-control"></select>
            </div>

            <!-- 4. Layer -->
            <div class="loc-field-row">
              <div class="loc-field-label">
                <span class="ja">段</span>
                <span class="vi">Tầng</span>
              </div>
              <select id="loc-layer" class="location-form-control"></select>
            </div>

            <!-- 5. Note -->
            <div class="loc-field-row">
              <div class="loc-field-label">
                <span class="ja">メモ</span>
                <span class="vi">Ghi chú</span>
              </div>
              <textarea id="loc-note" class="location-form-control" rows="3"
                placeholder="メモを入力... / Nhập ghi chú..."></textarea>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- FOOTER BUTTONS (3 buttons only) -->
    <div class="location-footer">
      <button class="loc-btn loc-btn-secondary" id="btn-cancel-loc-footer">
        <i class="fas fa-times"></i> <span>キャンセル<br>Hủy</span>
      </button>
      <button class="loc-btn loc-btn-primary" id="btn-refresh-loc-footer">
        <i class="fas fa-sync"></i> <span>更新<br>Refresh</span>
      </button>
      <button class="loc-btn loc-btn-success" id="btn-confirm-loc-footer">
        <i class="fas fa-check"></i> <span>更新<br>Cập nhật</span>
      </button>
    </div>

  </div>
  `;
}

/* =====================================================
   LocationManager main
   ===================================================== */
const LocationManager = {
  INIT() {
    LocationCache.restore();

    document.addEventListener('detail:changed', (e) => {
      if (e.detail?.item) currentItem = e.detail.item;
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        const panel = document.getElementById('loc-panel');
        if (panel) this.close();
      }
    });
  },

  openModal(mode = 'location', item = currentItem) {
    let actualItem = item;
    if (typeof mode === 'object' && mode !== null) actualItem = mode;

    if (!actualItem) {
      alert('金型または刃物を選択してください。\nVui lòng chọn khuôn hoặc dao cắt trước.');
      return;
    }
    if (!actualItem.MoldID && !actualItem.CutterID) {
      alert('❌ エラー：デバイスIDが見つかりません。\n❌ Lỗi: Không tìm thấy ID của thiết bị.');
      return;
    }

    currentItem = actualItem;
    currentOldRackLayerID = actualItem.currentRackLayer || actualItem.RackLayerID || null;

    const existing = document.getElementById('loc-panel');
    if (existing) existing.remove();

    const isMobile = window.innerWidth <= 768;
    if (isMobile) document.body.classList.add('modal-open');

    let backdrop = document.querySelector('.location-modal-backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'location-modal-backdrop';
      backdrop.addEventListener('click', this.close.bind(this));
      document.body.appendChild(backdrop);
    }

    const mount = document.querySelector('.upper-section') || document.body;

    const racksList = window.DataManager?.data?.racks || [];
    const rackLayersList = window.DataManager?.data?.racklayers || [];
    const locationLogs = window.DataManager?.data?.locationlog || [];
    const employeesList = window.DataManager?.data?.employees || [];

    const historyLogs = locationLogs.filter((l) => {
      const moldMatch = actualItem.MoldID && String(l.MoldID || '').trim() === String(actualItem.MoldID).trim();
      const cutterMatch = actualItem.CutterID && String(l.CutterID || '').trim() === String(actualItem.CutterID).trim();
      return moldMatch || cutterMatch;
    });

    sortLogsInPlace(historyLogs, racksList, rackLayersList, employeesList);

    const itemId = actualItem.MoldID || actualItem.CutterID;
    const isMold = !!actualItem.MoldID;
    const itemName = actualItem.MoldName || actualItem.MoldCode || actualItem.CutterName || actualItem.CutterCode || `ID-${itemId}`;

    const currentRackLayer = rackLayersList.find((r) => String(r.RackLayerID) === String(currentOldRackLayerID));
    const currentRack = racksList.find((r) => String(r.RackID) === String(currentRackLayer?.RackID));

    const rackSymbol = currentRack?.RackSymbol || currentRack?.RackNumber || currentRack?.RackID || '?';
    const layerNumber = currentRackLayer?.RackLayerNumber || '?';
    const rackLayerDisplay = `${rackSymbol} - ${layerNumber}`;
    const rackLocation = currentRack?.RackLocation || '-';

    // Default: Lock mode
    const showActions = isHistoryUnlocked();
    const historyHtml = renderHistoryTable(historyLogs, racksList, rackLayersList, employeesList, showActions);

    const html = buildModalHtml({ isMold, itemName, itemId, rackLayerDisplay, rackLocation, historyHtml });
    mount.insertAdjacentHTML('beforeend', html);

    const wrap = document.querySelector('.location-history-wrap');
    if (wrap) wrap.classList.toggle('scroll-unlocked', !!showActions);

    const panelEl = document.getElementById('loc-panel');
    const headerEl = document.querySelector('.location-header');
    attachSwipeToClose(headerEl, panelEl, this.close.bind(this));

    bindLockToggle(actualItem);
    enableFilter();
    enableSortAndRepaint(actualItem);

    this.bindModalEvents(actualItem, racksList, rackLayersList, employeesList);
    this.initNativeSelects(racksList, rackLayersList, employeesList, currentRackLayer?.RackID);

    const directInput = document.getElementById('loc-direct-id');
    if (directInput) {
      directInput.addEventListener('input', () => {
        applyDirectInputToSelects(directInput.value, racksList, rackLayersList);
      });
      setTimeout(() => {
        directInput.focus();
        directInput.select();
        document.dispatchEvent(new CustomEvent('keyboard:attach', { detail: { element: directInput } }));
      }, 200);
    }

    setTimeout(async () => {
      try {
        await window.DataManager.loadAllData();
        if (currentItem) await this.refreshHistoryInPlace(currentItem);
      } catch (e) {}
    }, 500);
  },

  initNativeSelects(racksList, rackLayersList, employeesList, defaultRackId) {
    const rackSel = document.getElementById('loc-rack');
    const layerSel = document.getElementById('loc-layer');
    const empSel = document.getElementById('loc-employee');

    const rackOptions = (racksList || []).map((r) => ({
      value: String(r.RackID),
      label: `${r.RackSymbol || r.RackNumber || r.RackID} - ${r.RackLocation || ''}`.trim(),
    }));
    setSelectOptions(rackSel, rackOptions, '選択 / Chọn giá');

    if (defaultRackId) trySelectValue(rackSel, defaultRackId);

    if (rackSel && rackSel.value) updateLayerSelectOptions(rackSel.value, rackLayersList);
    else setSelectOptions(layerSel, [], '選択 / Chọn tầng');

    if (rackSel) {
      rackSel.addEventListener('change', () => {
        updateLayerSelectOptions(rackSel.value, rackLayersList);
      });
    }

    const empOptions = (employeesList || []).map((e) => ({
      value: String(e.EmployeeID),
      label: `${e.EmployeeName || e.name || e.EmployeeID}`,
    }));
    setSelectOptions(empSel, empOptions, '選択 / Chọn nhân viên');

    if (empSel && empOptions.length > 0) empSel.value = empOptions[0].value;
  },

  bindModalEvents(item, racksList, rackLayersList, employeesList) {
    const closeBtn = document.getElementById('btn-close-location');
    if (closeBtn) closeBtn.addEventListener('click', this.close.bind(this));

    const cancelBtnFooter = document.getElementById('btn-cancel-loc-footer');
    if (cancelBtnFooter) cancelBtnFooter.addEventListener('click', this.close.bind(this));

    const refreshBtn = document.getElementById('loc-refresh');
    const refreshBtnFooter = document.getElementById('btn-refresh-loc-footer');
    
    const doRefresh = async () => {
      const btns = [refreshBtn, refreshBtnFooter].filter(b => b);
      btns.forEach(b => {
        b.disabled = true;
        b.classList.add('spinning');
      });
      try {
        await window.DataManager.loadAllData();
        await this.refreshHistoryInPlace(item);
        showToast('refreshed');
      } catch (e) {
        showToast('error');
      } finally {
        btns.forEach(b => {
          b.disabled = false;
          b.classList.remove('spinning');
        });
      }
    };

    if (refreshBtn) refreshBtn.addEventListener('click', doRefresh);
    if (refreshBtnFooter) refreshBtnFooter.addEventListener('click', doRefresh);


    const confirmBtnFooter = document.getElementById('btn-confirm-loc-footer');
    if (confirmBtnFooter) {
      confirmBtnFooter.addEventListener('click', async () => {
        await this.saveRecord(item, racksList, rackLayersList, employeesList);
      });
    }
  },

  async refreshHistoryInPlace(item) {
    const tbody = document.querySelector('#loc-his tbody');
    if (!tbody) return;

    const allLogs = window.DataManager?.data?.locationlog || [];
    const racksList = window.DataManager?.data?.racks || [];
    const rackLayersList = window.DataManager?.data?.racklayers || [];
    const employeesList = window.DataManager?.data?.employees || [];

    const historyLogs = allLogs.filter((l) => {
      const moldMatch = item.MoldID && String(l.MoldID || '').trim() === String(item.MoldID).trim();
      const cutterMatch = item.CutterID && String(l.CutterID || '').trim() === String(item.CutterID).trim();
      return moldMatch || cutterMatch;
    });

    sortLogsInPlace(historyLogs, racksList, rackLayersList, employeesList);

    const showActions = isHistoryUnlocked();
    const wrap = document.querySelector('.location-history-wrap');
    if (wrap) wrap.classList.toggle('scroll-unlocked', !!showActions);

    if (historyLogs.length === 0) {
      const col = showActions ? 7 : 5;
      tbody.innerHTML = `<tr><td colspan="${col}" style="text-align:center;padding:1rem;color:#888;">履歴なし / Chưa có lịch sử</td></tr>`;
      return;
    }

    const rows = historyLogs.map((log) => renderHistoryRow(log, racksList, rackLayersList, employeesList, showActions)).join('');
    tbody.innerHTML = rows;

    if (showActions) this.bindDeleteHistoryEvents(item);
  },

  bindDeleteHistoryEvents(item) {
    const btns = document.querySelectorAll('.btn-delete-history');
    btns.forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const timestamp = btn.getAttribute('data-time');
        if (!timestamp) return;

        if (!confirm('削除しますか？ / Bạn chắc chắn muốn xóa?')) return;

        const row = btn.closest('tr');
        if (row) row.classList.add('deleting');

        showToast('deleting');

        try {
          const itemId = item.MoldID || item.CutterID;
          const itemTypeKey = item.MoldID ? 'MoldID' : 'CutterID';

          const res = await fetch(DELETE_LOCATIONLOG_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              itemType: itemTypeKey,
              itemId: itemId,
              Timestamp: decodeURIComponent(timestamp),
            }),
          });

          const rj = await res.json();
          if (!rj || !rj.success) throw new Error(rj?.message || 'Delete failed');

          const ts = decodeURIComponent(timestamp);
          if (window.DataManager?.data?.locationlog) {
            window.DataManager.data.locationlog = window.DataManager.data.locationlog.filter((l) => String(l.DateEntry) !== String(ts));
          }

          if (row) row.remove();
          showToast('deleted');

          setTimeout(async () => {
            if (currentItem) await this.refreshHistoryInPlace(currentItem);
          }, 250);
        } catch (err) {
          if (row) row.classList.remove('deleting');
          showToast('error');
        }
      });
    });
  },

  async saveRecord(item, racksList, rackLayersList, employeesList) {
    showToast('processing');

    let newRackLayerId = null;

    const directInput = document.getElementById('loc-direct-id');
    if (directInput && String(directInput.value || '').trim()) {
      newRackLayerId = resolveRackLayerIdFromDirectInput(String(directInput.value || '').trim(), racksList, rackLayersList);
    }

    if (!newRackLayerId) {
      const layerSel = document.getElementById('loc-layer');
      if (layerSel && layerSel.value) newRackLayerId = String(layerSel.value);
    }

    if (!newRackLayerId) {
      alert('新しい位置を選択してください。\nVui lòng chọn vị trí mới.');
      showToast('error');
      return;
    }

    const empSel = document.getElementById('loc-employee');
    const selectedEmployeeId = empSel?.value ? String(empSel.value).trim() : '';
    if (!selectedEmployeeId) {
      alert('担当者を選択してください。\nVui lòng chọn nhân viên.');
      showToast('error');
      return;
    }

    const noteValue = String(document.getElementById('loc-note')?.value || '').trim();

    if (String(newRackLayerId) === String(currentOldRackLayerID)) {
      const ok = confirm('新位置が現在位置と同じです。続行しますか？\nVị trí mới giống vị trí hiện tại. Vẫn tiếp tục?');
      if (!ok) return;
    }

    const targetItem = item || currentItem;
    const itemId = targetItem.MoldID || targetItem.CutterID;
    const itemType = targetItem.MoldID ? 'mold' : 'cutter';

    const nowIso = new Date().toISOString();

    const locationEntry = {
      MoldID: targetItem.MoldID || null,
      CutterID: targetItem.CutterID || null,
      OldRackLayer: currentOldRackLayerID,
      NewRackLayer: newRackLayerId,
      notes: noteValue,
      EmployeeID: selectedEmployeeId,
      DateEntry: nowIso,
    };

    const pendingLog = LocationCache.add(locationEntry);

    isClosingAfterSave = true;
    this.close();

    document.dispatchEvent(
      new CustomEvent('location-updated', {
        detail: { item: targetItem, success: true, oldRackLayer: currentOldRackLayerID, newRackLayer: newRackLayerId, timestamp: nowIso },
      })
    );
    document.dispatchEvent(
      new CustomEvent('location-completed', {
        detail: { item: targetItem, success: true, oldRackLayer: currentOldRackLayerID, newRackLayer: newRackLayerId, timestamp: nowIso },
      })
    );
    document.dispatchEvent(
      new CustomEvent('detail:changed', {
        detail: { item: { ...targetItem, currentRackLayer: newRackLayerId, RackLayerID: newRackLayerId }, itemType, itemId, source: 'location-pending' },
      })
    );

    setTimeout(() => (isClosingAfterSave = false), 120);

    setTimeout(async () => {
      try {
        await this.syncToServer(locationEntry, pendingLog.localId, itemId, newRackLayerId, itemType);
      } catch (e) {}
    }, 120);
  },

  async syncToServer(data, localId, itemId, newRackLayerId, itemType) {
    try {
      const payload = {
        MoldID: data.MoldID || null,
        CutterID: data.CutterID || null,
        OldRackLayer: data.OldRackLayer,
        NewRackLayer: data.NewRackLayer,
        notes: data.notes,
        EmployeeID: data.EmployeeID,
        DateEntry: data.DateEntry,
      };

      const res = await fetch(LOCATION_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const rj = await res.json();
      if (!rj || !rj.success) throw new Error(rj?.message || 'Server error');

      LocationCache.remove(localId);

      const realLog = {
        LocationLogID: rj.logId || rj.LocationLogID || Date.now(),
        MoldID: data.MoldID || null,
        CutterID: data.CutterID || null,
        OldRackLayer: data.OldRackLayer,
        NewRackLayer: data.NewRackLayer,
        notes: data.notes,
        EmployeeID: data.EmployeeID,
        DateEntry: data.DateEntry,
        synced: true,
      };

      const exists = window.DataManager?.data?.locationlog?.some((l) => {
        const sameItem =
          (realLog.MoldID && String(l.MoldID || '').trim() === String(realLog.MoldID).trim()) ||
          (realLog.CutterID && String(l.CutterID || '').trim() === String(realLog.CutterID).trim());
        return sameItem && String(l.DateEntry) === String(realLog.DateEntry);
      });

      if (!exists) window.DataManager.data.locationlog.unshift(realLog);

      if (itemType === 'mold') {
        const mold = window.DataManager?.data?.molds?.find((m) => String(m.MoldID).trim() === String(itemId).trim());
        if (mold) {
          mold.currentRackLayer = newRackLayerId;
          mold.RackLayerID = newRackLayerId;
        }
      } else {
        const cutter = window.DataManager?.data?.cutters?.find((c) => String(c.CutterID).trim() === String(itemId).trim());
        if (cutter) {
          cutter.currentRackLayer = newRackLayerId;
          cutter.RackLayerID = newRackLayerId;
        }
      }

      const historyBody = document.querySelector('#loc-his tbody');
      if (historyBody && currentItem) await this.refreshHistoryInPlace(currentItem);

      document.dispatchEvent(
        new CustomEvent('detail:changed', {
          detail: {
            item: { ...(currentItem || {}), currentRackLayer: newRackLayerId, RackLayerID: newRackLayerId },
            itemType,
            itemId,
            source: 'location-synced',
          },
        })
      );

      showToast('success');
    } catch (err) {
      LocationCache.markError(localId, err?.message || 'Sync error');
      const historyBody = document.querySelector('#loc-his tbody');
      if (historyBody && currentItem) await this.refreshHistoryInPlace(currentItem);
      showToast('error');

      setTimeout(() => {
        const still = window.DataManager?.data?.locationlog?.some((l) => l.pending && l.localId === localId);
        if (still) this.syncToServer(data, localId, itemId, newRackLayerId, itemType);
      }, 30000);
    }
  },

  close() {
    const panel = document.getElementById('loc-panel');
    if (panel) panel.remove();

    const backdrop = document.querySelector('.location-modal-backdrop');
    if (backdrop) backdrop.remove();

    document.body.classList.remove('modal-open');

    if (isClosingAfterSave) return;
  },
};

window.LocationManager = LocationManager;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => LocationManager.INIT());
} else {
  LocationManager.INIT();
}

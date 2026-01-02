// ========================================
// CHECK-IN / CHECK-OUT MODULE -- r7.1.4
// UI: 日本語優先 (JP) + Tiếng Việt (VN)
// NEW r7.1.4:
// - Add "位置変更 / Đổi vị trí" button next to Confirm -> close this modal, open LocationManager
// - Support BOTH Mold and Cutter history/status filtering (MoldID/CutterID)
// - Mount popup to document.body (avoid upper-section height limitation)
// - Keep r7.0.9 EmployeeID fix + lock/unlock history + optimistic pending log + background sync
// ========================================

(function() {
'use strict';

const API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/checklog';
const DELETE_API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/deletelog';

let currentItem = null;
let currentMode = 'check-in';
let isClosingAfterSave = false;

const SESSION_KEY_LAST_ACTION = 'checkin_last_action_timestamp';
const STORAGE_KEY_DEFAULT_EMP = 'cio:default-employee-id';
const STORAGE_KEY_HIS_UNLOCK = 'cio:history-unlocked';

function getDefaultEmpId() {
  return localStorage.getItem(STORAGE_KEY_DEFAULT_EMP) || '';
}
function setDefaultEmpId(id) {
  if (id) localStorage.setItem(STORAGE_KEY_DEFAULT_EMP, String(id));
}
function clearDefaultEmpId() {
  localStorage.removeItem(STORAGE_KEY_DEFAULT_EMP);
}
function isHistoryUnlocked() {
  return localStorage.getItem(STORAGE_KEY_HIS_UNLOCK) === '1';
}
function setHistoryUnlocked(v) {
  localStorage.setItem(STORAGE_KEY_HIS_UNLOCK, v ? '1' : '0');
}

function setLastActionTime() {
  sessionStorage.setItem(SESSION_KEY_LAST_ACTION, Date.now().toString());
}

function shouldSkipBackgroundReload(itemId) {
  const pendingLogs = window.DataManager?.PendingCache?.logs || [];
  const hasPending = pendingLogs.some(p => (
    (p.MoldID && String(p.MoldID) === String(itemId) && p._pending === true) ||
    (p.CutterID && String(p.CutterID) === String(itemId) && p._pending === true)
  ));
  if (hasPending) return true;

  const lastActionTime = parseInt(sessionStorage.getItem(SESSION_KEY_LAST_ACTION) || '0', 10);
  const timeSinceAction = Date.now() - lastActionTime;
  if (timeSinceAction < 3000) return true;

  return false;
}

/* =====================================================
   Swipe to close (mobile)
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
   Helpers (schema-safe)
===================================================== */
function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function getField(obj, keys, fallback = '') {
  if (!obj) return fallback;
  for (const k of keys) {
    if (obj[k] != null && obj[k] !== '') return obj[k];
  }
  return fallback;
}

function normalizeId(v) {
  return String(v == null ? '' : v).trim();
}

function getItemKey(item) {
  if (item && item.MoldID) {
    return { itemType: 'mold', id: normalizeId(item.MoldID), idField: 'MoldID' };
  }
  if (item && item.CutterID) {
    return { itemType: 'cutter', id: normalizeId(item.CutterID), idField: 'CutterID' };
  }
  return { itemType: 'unknown', id: '', idField: '' };
}

function getDestinationName(destId, destList) {
  if (!destId) return '―';
  const found = (destList || []).find(d => normalizeId(d.DestinationID) === normalizeId(destId));
  return found ? (found.DestinationName || destId) : destId;
}

function getEmployeeName(empId, empList) {
  if (!empId) return '-';
  const found = (empList || []).find(e => normalizeId(e.EmployeeID) === normalizeId(empId));
  return found ? (eOr(found, ['EmployeeName', 'name'], empId)) : empId;
}
function eOr(obj, keys, fb) {
  return getField(obj, keys, fb);
}

function fmt(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${da} ${hh}:${mm}`;
}

function parseSelectedIdFromSearchableInput(inputEl) {
  if (!inputEl) return '';
  if (inputEl.dataset && inputEl.dataset.selectedId) return String(inputEl.dataset.selectedId).trim();

  const raw = String(inputEl.value || '').trim();
  if (!raw) return '';
  // Pattern: "Name (ID)"
  const m = raw.match(/\(([^\)]+)\)$/);
  if (m) return String(m[1]).trim();
  if (/^\d+$/.test(raw)) return raw;
  // last fallback: keep raw (may be wrong but better than empty)
  return raw;
}

/* =====================================================
   Main module
===================================================== */
const CheckInOut = {
  init() {
    document.addEventListener('detail:changed', (e) => {
      if (e.detail?.item) currentItem = e.detail.item;
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'Esc') {
        const panel = document.getElementById('cio-panel');
        if (panel) this.close();
      }
    });

    // Optional integration: when location manager finishes, refresh (if needed)
    document.addEventListener('location-completed', (e) => {
      try {
        const item = e.detail?.item;
        if (!item) return;
        const { id } = getItemKey(item);
        if (!id) return;

        // If current item is same, refresh history in place (no background reload spam)
        if (currentItem) {
          const cur = getItemKey(currentItem);
          if (cur.id && cur.id === id) {
            this.refreshHistoryInPlace(currentItem);
            document.dispatchEvent(new CustomEvent('detail:changed', {
              detail: { item: currentItem, itemType: cur.itemType, itemId: cur.id, source: 'location-completed' }
            }));
          }
        }
      } catch (err) {}
    });
  },

  /* =========================
     Status logs helpers
  ========================== */
  getCurrentStatus(itemId, itemType = 'mold') {
    const logs = window.DataManager?.data?.statuslogs || [];
    const id = normalizeId(itemId);

    const itemLogs = logs.filter(log => {
      if (itemType === 'mold') return normalizeId(log.MoldID) === id;
      return normalizeId(log.CutterID) === id;
    });

    if (itemLogs.length === 0) return null;

    itemLogs.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
    const latest = itemLogs[0];
    return latest.Status || null;
  },

  getHistoryLogsForItem(item) {
    const { itemType, id } = getItemKey(item);
    const allLogs = window.DataManager?.data?.statuslogs || [];
    const pendingLogs = window.DataManager?.PendingCache?.logs || [];

    const isMatch = (l) => {
      if (itemType === 'mold') return normalizeId(l.MoldID) === id;
      if (itemType === 'cutter') return normalizeId(l.CutterID) === id;
      return false;
    };

    const pending = pendingLogs.filter(p => p && p._pending === true && isMatch(p));
    const real = allLogs.filter(l => l && isMatch(l));

    const merged = [...pending, ...real].sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
    return merged;
  },

  buildHistoryRows(logs, destList, empList, showActions = false) {
    return (logs || []).map(l => {
      let badgeClass = 'badge-unknown';
      let badgeText = escapeHtml(l.Status || '?');

      const statusRaw = String(l.Status || '');
      const statusUpper = statusRaw.toUpperCase();

      if (l.Status === 'AUDIT' || l.AuditType) {
        badgeClass = 'badge-audit';
        badgeText = (l.AuditType === 'AUDIT-WITH-RELOCATION') ? '検数移' : '検数';
      } else if (statusUpper === 'IN' || statusUpper === 'CHECKIN' || statusRaw === 'check-in') {
        badgeClass = 'badge-in';
        badgeText = 'IN';
      } else if (statusUpper === 'OUT' || statusUpper === 'CHECKOUT' || statusRaw === 'check-out') {
        badgeClass = 'badge-out';
        badgeText = 'OUT';
      }

      const isPending = l._pending === true;
      const hasError = !!l._syncError;

      let syncClass = 'sync-dot synced';
      let syncTitle = '同期済み / Đã đồng bộ';
      let syncIcon = '✅';

      if (hasError) {
        syncClass = 'sync-dot error';
        syncTitle = `エラー: ${l._syncError}`;
        syncIcon = '⚠️';
      } else if (isPending) {
        syncClass = 'sync-dot pending';
        syncTitle = '同期中 / Đang đồng bộ...';
        syncIcon = '🔄';
      }

      const syncTd = showActions
        ? `<td class="col-sync"><span class="${syncClass}" title="${escapeHtml(syncTitle)}">${syncIcon}</span></td>`
        : '';

      const deleteTd = (showActions && !isPending && !hasError)
        ? `<td class="col-delete action-cell"><button class="btn-delete-history" data-time="${encodeURIComponent(String(l.Timestamp || ''))}" title="削除 / Xóa">❌</button></td>`
        : (showActions ? `<td class="col-delete action-cell"></td>` : '');

      const empId = getField(l, ['EmployeeID', 'employeeId'], '');
      const notes = getField(l, ['Notes', 'notes'], '-');

      return `
        <tr data-time="${escapeHtml(String(l.Timestamp || ''))}" class="${isPending ? 'row-pending' : ''}">
          <td data-time="${escapeHtml(String(l.Timestamp || ''))}">${escapeHtml(fmt(l.Timestamp))}</td>
          <td><span class="status-badge ${badgeClass}">${escapeHtml(badgeText)}</span></td>
          <td>${escapeHtml(getEmployeeName(empId, empList))}</td>
          <td class="note-cell">${escapeHtml(notes || '-')}</td>
          ${syncTd}${deleteTd}
        </tr>
      `;
    }).join('');
  },

  renderHistory(logs, destList, empList, showActions = false) {
    if (!logs || logs.length === 0) {
      return `<div class="no-history">入出庫履歴がありません<br>Chưa có lịch sử xuất/nhập</div>`;
    }
    const lockClass = showActions ? 'history-unlocked' : 'history-locked';
    const actionHead = showActions
      ? `<th class="col-sync" style="width:60px">🔄 Sync</th><th class="col-delete" style="width:40px"></th>`
      : '';

    return `
      <table class="history-table ${lockClass}" id="cio-his">
        <thead>
          <tr>
            <th data-sort="time">🕐 時間 / Thời gian</th>
            <th data-sort="status">📊 種類 / Loại</th>
            <th data-sort="emp">👤 従業員 / NV</th>
            <th data-sort="note">📝 備考 / Ghi chú</th>
            ${actionHead}
          </tr>
        </thead>
        <tbody>
          ${this.buildHistoryRows(logs, destList, empList, showActions)}
        </tbody>
      </table>
    `;
  },

  refreshHistoryInPlace(item) {
    const tbody = document.querySelector('#cio-his tbody');
    if (!tbody || !item) return;

    const destList = window.DataManager?.data?.destinations || [];
    const empList = window.DataManager?.data?.employees || [];
    const logs = this.getHistoryLogsForItem(item);

    if (!logs || logs.length === 0) {
      const cols = isHistoryUnlocked() ? 6 : 4;
      tbody.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;padding:1rem;color:#888;">入出庫履歴がありません<br>Chưa có lịch sử xuất/nhập</td></tr>`;
      return;
    }

    const showActions = isHistoryUnlocked();
    tbody.innerHTML = this.buildHistoryRows(logs, destList, empList, showActions);

    if (showActions) this.bindDeleteHistoryEvents(item);
  },

  bindDeleteHistoryEvents(item) {
    const buttons = document.querySelectorAll('.btn-delete-history');
    buttons.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();

        const tsEnc = btn.getAttribute('data-time') || '';
        const timestamp = decodeURIComponent(tsEnc);
        if (!timestamp) return;

        const ok = confirm('削除しますか？ / Bạn chắc chắn muốn xóa?');
        if (!ok) return;

        const row = btn.closest('tr');
        if (row) row.classList.add('deleting');

        this.showBilingualToast('deleting');

        try {
          const payload = {
            MoldID: item?.MoldID || '',
            CutterID: item?.CutterID || '',
            Timestamp: timestamp,
            ItemType: item?.MoldID ? 'mold' : 'cutter'
          };

          const res = await fetch(DELETE_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          const rj = await res.json();
          if (!rj || !rj.success) throw new Error(rj?.message || 'Delete failed');

          // Remove from local cache
          if (window.DataManager?.data?.statuslogs) {
            window.DataManager.data.statuslogs = window.DataManager.data.statuslogs.filter(l => String(l.Timestamp) !== String(timestamp));
          }
          if (row) row.remove();

          this.showBilingualToast('deleted');
          setLastActionTime();

          setTimeout(() => {
            try {
              this.refreshHistoryInPlace(item);
              const k = getItemKey(item);
              document.dispatchEvent(new CustomEvent('detail:changed', {
                detail: { item, itemType: k.itemType, itemId: k.id, source: 'checkin-delete' }
              }));
            } catch (err) {}
          }, 300);

        } catch (err) {
          if (row) row.classList.remove('deleting');
          this.showBilingualToast('error');
        }
      });
    });
  },

  /* =========================
     Modal open/close
  ========================== */
  close() {
    const panel = document.getElementById('cio-panel');
    if (panel) panel.remove();
    const backdrop = document.getElementById('cio-backdrop');
    if (backdrop) backdrop.remove();

    document.body.classList.remove('modal-open');
    if (isClosingAfterSave) return;
  },

  openModal(mode = 'check-in', item = currentItem) {
    if (!item) {
      alert('金型/刃型を選択してください / Vui lòng chọn khuôn/dao cắt trước.');
      return;
    }
    if (!item.MoldID && !item.CutterID) {
      alert('IDが見つかりません / Không tìm thấy MoldID hoặc CutterID');
      return;
    }

    currentMode = mode;
    currentItem = item;

    this.close();

    const isMobile = window.innerWidth <= 768;
    if (isMobile) document.body.classList.add('modal-open');

    const { itemType, id } = getItemKey(item);

    const destList = window.DataManager?.data?.destinations || [];
    const empList = window.DataManager?.data?.employees || [];
    const racksList = window.DataManager?.data?.racks || [];
    const historyLogs = this.getHistoryLogsForItem(item);
    const latestLog = historyLogs[0];

    // Status badge
    let currentStatusText = '履歴なし / Chưa có lịch sử';
    let statusClass = 'badge-gray';
    if (latestLog) {
      const s = String(latestLog.Status || '').toLowerCase();
      if (s === 'check-in' || s === 'in' || s === 'checkin') {
        const destName = getDestinationName(latestLog.DestinationID || 'AREA-MOLDROOM', destList);
        currentStatusText = `在庫 / Trong kho - ${destName}`;
        statusClass = 'badge-green';
      } else if (s === 'check-out' || s === 'out' || s === 'checkout') {
        const destName = getDestinationName(latestLog.DestinationID, destList);
        currentStatusText = `出庫中 / Đã xuất - ${destName}`;
        statusClass = 'badge-red';
      } else if (String(latestLog.Status || '') === 'AUDIT' || latestLog.AuditType) {
        currentStatusText = '検数 / Kiểm kê';
        statusClass = 'badge-blue';
      }
    }

    // Item labels
    const itemIdLabel = (itemType === 'mold') ? '金型ID / MoldID' : '刃型ID / CutterID';
    const itemNameLabel = (itemType === 'mold') ? '金型名 / Tên khuôn' : '刃型名 / Tên dao';

    const itemName =
      (itemType === 'mold')
        ? (item.MoldName || item.MoldCode || '')
        : (item.CutterName || item.CutterCode || item.CutterType || '');

    // Rack info (best-effort display; updated by location-manager later)
    const rackNum = item?.rackInfo?.RackNumber || item.RackID || '-';
    const layerNum = item?.rackLayerInfo?.RackLayerNumber || item.RackLayerID || '-';
    const rackInfo = racksList.find(r => normalizeId(r.RackID) === normalizeId(item.RackID));
    const rackLocation = rackInfo?.RackLocation || '-';

    // Build DOM (mount to body, not upper-section)
    const showActions = isHistoryUnlocked();
    const html = `
      <div class="cio-root" id="cio-panel">
        <div class="checkio-header checkio-header-${escapeHtml(mode)}">
          <div class="checkio-title">
            ${mode === 'check-in' ? '✓ 入庫 / Check-in' : '✗ 出庫 / Check-out'}
          </div>
          <div class="header-actions">
            <button class="btn-refresh" id="cio-refresh" title="更新 / Refresh">🔄</button>
            <button class="btn-close-compact" id="cio-close" title="閉じる / Đóng (ESC)">✕</button>
          </div>
        </div>

        <div class="checkio-body">
          <section class="cio-history">
            <h4>履歴 / Lịch sử</h4>
            <div class="filter-row history-controls">
              <input type="text" id="cio-search" placeholder="検索... / Tìm kiếm...">
              <button id="cio-lock-toggle" type="button" class="lock-toggle" title="ロック/アンロック | Khóa/Mở khóa">
                <span class="lock-text">🔒 Lock</span>
              </button>
            </div>
            <div class="history-wrap">
              ${this.renderHistory(historyLogs, destList, empList, showActions)}
            </div>
          </section>

          <section class="cio-status">
            <h4>現在の状態 / Trạng thái</h4>
            <div class="status-badges">
              <div class="badge-row">
                <span class="badge-label">${escapeHtml(itemIdLabel)}:</span>
                <div class="badge badge-mold">${escapeHtml(id)}</div>
              </div>
              <div class="badge-row">
                <span class="badge-label">${escapeHtml(itemNameLabel)}:</span>
                <div class="badge badge-mold-name">${escapeHtml(itemName || '-')}</div>
              </div>
              <div class="badge-row">
                <span class="badge-label">状態 / Tình trạng:</span>
                <div class="badge ${escapeHtml(statusClass)}">${escapeHtml(currentStatusText)}</div>
              </div>
              <div class="badge-row">
                <span class="badge-label">位置 / Vị trí:</span>
                <div class="badge-group">
                  <div class="badge badge-rack">${escapeHtml(rackNum)}</div>
                  <span class="badge-sep">-</span>
                  <div class="badge badge-layer">${escapeHtml(layerNum)}</div>
                </div>
              </div>
              <div class="rack-location">
                <span class="loc-label">保管場所 / Nơi lưu:</span>
                <span class="loc-value">${escapeHtml(rackLocation)}</span>
              </div>
            </div>
          </section>

          <section class="cio-inputs">
            <div class="cio-mode-buttons">
              <button id="btn-in" class="mode-btn ${mode === 'check-in' ? 'active' : ''}" data-mode="check-in">✓ 入庫</button>
              <button id="btn-out" class="mode-btn ${mode === 'check-out' ? 'active' : ''}" data-mode="check-out">✗ 出庫</button>
            </div>

            <h4>📝 データ入力 / Nhập liệu</h4>

            <div class="form-group dest-group ${mode === 'check-out' ? '' : 'hidden'}">
              <label class="form-label">目的地 / Địa điểm *</label>
              <div id="destination-select-container"></div>
            </div>

            <div class="form-group form-group-employee">
              <label class="form-label">従業員 / Nhân viên *</label>
              <div class="employee-row">
                <div id="employee-select-container"></div>
                <button id="btn-face" class="btn-face" type="button">Face ID</button>
              </div>
              <small id="cio-face-status" class="face-status">直接入力 / Nhập trực tiếp</small>
              <div class="emp-default">
                <label style="display:flex;gap:6px;align-items:center;">
                  <input type="checkbox" id="cio-emp-default">
                  <span>既定 / Mặc định</span>
                </label>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">備考 / Ghi chú</label>
              <textarea id="cio-note" class="form-control" rows="2" placeholder="メモ / Ghi chú..."></textarea>
            </div>


          </section>
          
        </div>
        <div class="cio-right-actionbar" role="toolbar" aria-label="操作 / Thao tác">
  <button class="btn-cancel cio-action-btn" id="btn-cancel" type="button">
    <span class="btn-jp">× 戻る</span>
    <span class="btn-vn">Hủy</span>
  </button>

  <button class="btn-relocate cio-action-btn" id="btn-relocate" type="button">
    <span class="btn-jp">📍 位置変更</span>
    <span class="btn-vn">Đổi vị trí</span>
  </button>

  <button class="btn-confirm cio-action-btn" id="btn-save" type="button">
    <span class="btn-jp">✓ 確認</span>
    <span class="btn-vn">Xác nhận</span>
  </button>
</div>

      </div>
    `;

    // Backdrop + mount to body
    const backdrop = document.createElement('div');
    backdrop.id = 'cio-backdrop';
    backdrop.className = 'cio-backdrop';
    backdrop.addEventListener('click', () => this.close());
    document.body.appendChild(backdrop);

    document.body.insertAdjacentHTML('beforeend', html);

    // Init searchable selects
    this.initSearchableSelects(mode, destList, empList);

    // Autofill
    this.applyAutoFillLogic(item, mode, historyLogs, empList);

    // Bind events
    this.bindModalEvents(item, destList, empList);

    // Filter & sort
    this.enableFilter();
    this.enableSort();

    // Lock toggle
    this.bindLockUI(item);

    // Swipe to close (mobile)
    const panelEl = document.getElementById('cio-panel');
    const headerEl = panelEl ? panelEl.querySelector('.checkio-header') : null;
    attachSwipeToClose(headerEl, panelEl, () => this.close());

    // Focus first input
    setTimeout(() => {
      const firstInput = document.querySelector('#cio-panel input, #cio-panel textarea, #cio-panel select');
      if (firstInput) {
        firstInput.focus();
        document.dispatchEvent(new CustomEvent('keyboardattach', { detail: { element: firstInput } }));
      }
    }, 250);

    // Optional: background reload if pending exists
    if (!shouldSkipBackgroundReload(id)) {
      const hasPending = (window.DataManager?.PendingCache?.logs || []).some(p => (
        p && p._pending === true &&
        ((item.MoldID && normalizeId(p.MoldID) === normalizeId(item.MoldID)) ||
         (item.CutterID && normalizeId(p.CutterID) === normalizeId(item.CutterID)))
      ));
      if (hasPending && window.DataManager?.loadFromGitHub) {
        setTimeout(async () => {
          try {
            await window.DataManager.loadFromGitHub();
            this.refreshHistoryInPlace(item);
          } catch (err) {}
        }, 500);
      }
    }
  },

  initSearchableSelects(mode, destList, empList) {
    // Employee select (always)
    const empContainer = document.getElementById('employee-select-container');
    if (empContainer) {
      const empOptions = (empList || []).map(e => ({
        id: String(e.EmployeeID),
        name: e.EmployeeName || e.name || String(e.EmployeeID)
      }));

      if (typeof window.createSearchableSelect === 'function') {
        const empSelect = window.createSearchableSelect('cio-emp', empOptions, (id) => {
          const faceStat = document.getElementById('cio-face-status');
          if (faceStat) {
            faceStat.textContent = '直接入力 / Nhập trực tiếp';
            faceStat.classList.remove('confirmed');
          }
          const defChk = document.getElementById('cio-emp-default');
          if (defChk) defChk.checked = (id && String(id) === String(getDefaultEmpId()));
        });
        empContainer.appendChild(empSelect);

        const defEmpId = getDefaultEmpId();
        if (defEmpId) {
          setTimeout(() => {
            try { empSelect.setValue(String(defEmpId)); } catch (e) {}
          }, 0);
        }

        const defChk = document.getElementById('cio-emp-default');
        if (defChk) defChk.checked = !!defEmpId;

      } else {
        // Fallback: native select
        const sel = document.createElement('select');
        sel.id = 'cio-emp';
        sel.className = 'form-control';
        const ph = document.createElement('option');
        ph.value = '';
        ph.textContent = '選択 / Chọn nhân viên';
        sel.appendChild(ph);
        empOptions.forEach(o => {
          const opt = document.createElement('option');
          opt.value = o.id;
          opt.textContent = o.name;
          sel.appendChild(opt);
        });
        empContainer.appendChild(sel);

        const defEmpId = getDefaultEmpId();
        if (defEmpId) sel.value = String(defEmpId);
      }
    }

    // Destination select (only for check-out)
    const destContainer = document.getElementById('destination-select-container');
    if (destContainer) {
      if (mode === 'check-out') {
        const destOptions = (destList || []).map(d => ({
          id: String(d.DestinationID),
          name: d.DestinationName || String(d.DestinationID)
        }));

        if (typeof window.createSearchableSelect === 'function') {
          const destSelect = window.createSearchableSelect('cio-dest', destOptions, () => {});
          destContainer.appendChild(destSelect);
        } else {
          const sel = document.createElement('select');
          sel.id = 'cio-dest';
          sel.className = 'form-control';
          const ph = document.createElement('option');
          ph.value = '';
          ph.textContent = '選択 / Chọn địa điểm';
          sel.appendChild(ph);
          destOptions.forEach(o => {
            const opt = document.createElement('option');
            opt.value = o.id;
            opt.textContent = o.name;
            sel.appendChild(opt);
          });
          destContainer.appendChild(sel);
        }
      } else {
        destContainer.innerHTML = '';
      }
    }
  },

  applyAutoFillLogic(item, mode, historyLogs, empList) {
    const { itemType, id } = getItemKey(item);
    const currentStatus = this.getCurrentStatus(id, itemType);
    const lastLog = (historyLogs || [])[0];

    const empInput = document.getElementById('cio-emp');
    if (empInput) {
      const defEmpId = getDefaultEmpId();
      if (defEmpId) {
        empInput.value = defEmpId;
        empInput.dataset.selectedId = defEmpId;
      } else if (lastLog) {
        const lastEmp = getField(lastLog, ['EmployeeID'], '');
        if (lastEmp) {
          empInput.value = lastEmp;
          empInput.dataset.selectedId = lastEmp;
        }
      }
    }

    const destGroup = document.querySelector('.dest-group');
    if (destGroup) {
      if (mode === 'check-out') destGroup.classList.remove('hidden');
      else destGroup.classList.add('hidden');
    }

    const destInput = document.getElementById('cio-dest');
    if (destInput && lastLog && mode === 'check-out') {
      const lastDest = getField(lastLog, ['DestinationID'], '');
      if (lastDest) {
        destInput.value = lastDest;
        destInput.dataset.selectedId = lastDest;
      }
    }

    const noteInput = document.getElementById('cio-note');
    if (noteInput && currentStatus) {
      if (mode === 'check-in') {
        // same as r7.0.9 behavior
        noteInput.value = '在庫確認 / Kiểm kê';
      } else if (String(currentStatus).toLowerCase().includes('out')) {
        noteInput.value = '返却 / Trả về';
      }
    }
  },

  bindLockUI(item) {
    const lockBtn = document.getElementById('cio-lock-toggle');
    const lockText = lockBtn?.querySelector('.lock-text');

    const apply = () => {
      const tbl = document.getElementById('cio-his');
      if (!tbl) return;
      if (isHistoryUnlocked()) {
        tbl.classList.remove('history-locked');
        tbl.classList.add('history-unlocked');
        if (lockText) lockText.textContent = '🔓 Unlock';
      } else {
        tbl.classList.remove('history-unlocked');
        tbl.classList.add('history-locked');
        if (lockText) lockText.textContent = '🔒 Lock';
      }
    };

    if (lockBtn) {
      lockBtn.addEventListener('click', () => {
        setHistoryUnlocked(!isHistoryUnlocked());

        const destList = window.DataManager?.data?.destinations || [];
        const empList = window.DataManager?.data?.employees || [];
        const logs = this.getHistoryLogsForItem(item);

        const wrap = document.querySelector('.history-wrap');
        if (wrap) {
          wrap.innerHTML = this.renderHistory(logs, destList, empList, isHistoryUnlocked());
        }

        apply();

        if (isHistoryUnlocked()) {
          this.bindDeleteHistoryEvents(item);
        }

        this.enableSort();
        this.enableFilter();
      });
    }

    apply();

    if (isHistoryUnlocked()) {
      this.bindDeleteHistoryEvents(item);
    }
  },

  bindModalEvents(item, destList, empList) {
    const closeBtn = document.getElementById('cio-close');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    const cancelBtn = document.getElementById('btn-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.close());

    // Refresh (reload all data then refresh history)
    const refreshBtn = document.getElementById('cio-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        const oldText = refreshBtn.textContent;
        refreshBtn.textContent = '⏳';

        try {
          if (window.DataManager?.loadFromGitHub) {
            await window.DataManager.loadFromGitHub();
          } else if (window.DataManager?.loadAllData) {
            // Some builds use loadAllData
            await window.DataManager.loadAllData();
          }

          this.refreshHistoryInPlace(item);

          const k = getItemKey(item);
          document.dispatchEvent(new CustomEvent('detail:changed', {
            detail: { item, itemType: k.itemType, itemId: k.id, source: 'checkin-refresh' }
          }));

          this.showBilingualToast('refreshed');
          refreshBtn.textContent = '✅';
          setTimeout(() => {
            refreshBtn.textContent = oldText || '🔄';
            refreshBtn.disabled = false;
          }, 800);

        } catch (err) {
          this.showBilingualToast('error');
          refreshBtn.textContent = '⚠️';
          setTimeout(() => {
            refreshBtn.textContent = oldText || '🔄';
            refreshBtn.disabled = false;
          }, 1400);
        }
      });
    }

    // Face ID (mock)
    const faceBtn = document.getElementById('btn-face');
    if (faceBtn) faceBtn.addEventListener('click', () => this.mockFaceID(empList));

    // Save
    const saveBtn = document.getElementById('btn-save');
    if (saveBtn) saveBtn.addEventListener('click', () => this.saveRecord(item));

    // Mode switch
    const inBtn = document.getElementById('btn-in');
    const outBtn = document.getElementById('btn-out');

    if (inBtn) {
      inBtn.addEventListener('click', () => {
        if (currentMode !== 'check-in') this.switchMode('check-in');
      });
    }

    if (outBtn) {
      outBtn.addEventListener('click', () => {
        if (currentMode !== 'check-out') this.switchMode('check-out');
      });
    }

    // NEW: Relocate -> close this modal then open LocationManager
    const relocateBtn = document.getElementById('btn-relocate');
    if (relocateBtn) {
      relocateBtn.addEventListener('click', () => {
        try {
          // Close current popup first (avoid stacking)
          this.close();

          // Open location manager with same item (mold/cutter)
          if (window.LocationManager && typeof window.LocationManager.openModal === 'function') {
            window.LocationManager.openModal(item);
          } else {
            alert('Location Manager が見つかりません / Không tìm thấy Location Manager');
          }
        } catch (err) {
          alert('エラー / Lỗi: ' + (err?.message || err));
        }
      });
    }
  },

  switchMode(newMode) {
    if (currentMode === newMode) return;
    currentMode = newMode;

    const inBtn = document.getElementById('btn-in');
    const outBtn = document.getElementById('btn-out');
    if (inBtn && outBtn) {
      inBtn.classList.toggle('active', newMode === 'check-in');
      outBtn.classList.toggle('active', newMode === 'check-out');
    }

    const headerEl = document.querySelector('#cio-panel .checkio-header');
    const titleEl = headerEl ? headerEl.querySelector('.checkio-title') : null;

    if (headerEl) {
      headerEl.classList.remove('checkio-header-check-in', 'checkio-header-check-out');
      headerEl.classList.add(newMode === 'check-in' ? 'checkio-header-check-in' : 'checkio-header-check-out');
    }
    if (titleEl) {
      titleEl.textContent = (newMode === 'check-in')
        ? '✓ 入庫 / Check-in'
        : '✗ 出庫 / Check-out';
    }

    const destGroup = document.querySelector('.dest-group');
    if (destGroup) {
      if (newMode === 'check-out') {
        destGroup.classList.remove('hidden');

        // Ensure destination select exists
        const destContainer = document.getElementById('destination-select-container');
        if (destContainer && destContainer.children.length === 0) {
          const destList = window.DataManager?.data?.destinations || [];
          const destOptions = (destList || []).map(d => ({ id: String(d.DestinationID), name: d.DestinationName || String(d.DestinationID) }));

          if (typeof window.createSearchableSelect === 'function') {
            const destSelect = window.createSearchableSelect('cio-dest', destOptions, () => {});
            destContainer.appendChild(destSelect);
          } else {
            const sel = document.createElement('select');
            sel.id = 'cio-dest';
            sel.className = 'form-control';
            const ph = document.createElement('option');
            ph.value = '';
            ph.textContent = '選択 / Chọn địa điểm';
            sel.appendChild(ph);
            destOptions.forEach(o => {
              const opt = document.createElement('option');
              opt.value = o.id;
              opt.textContent = o.name;
              sel.appendChild(opt);
            });
            destContainer.appendChild(sel);
          }
        }
      } else {
        destGroup.classList.add('hidden');
      }
    }
  },

  mockFaceID(empList) {
    const empSel = document.getElementById('cio-emp');
    const faceStat = document.getElementById('cio-face-status');

    if (!empSel || !empList || empList.length === 0) {
      alert('従業員リストが空です / Danh sách nhân viên trống');
      return;
    }

    const rndIdx = Math.floor(Math.random() * empList.length);
    const emp = empList[rndIdx];
    const empId = String(emp.EmployeeID || '').trim();
    if (!empId) return;

    empSel.value = empId;
    empSel.dataset.selectedId = empId;

    if (faceStat) {
      faceStat.textContent = 'Face ID認証済み / Đã xác nhận Face ID';
      faceStat.classList.add('confirmed');
    }

    const defChk = document.getElementById('cio-emp-default');
    if (defChk) defChk.checked = (empId && empId === String(getDefaultEmpId()));
  },

  async saveRecord(item) {
    const empInput = document.getElementById('cio-emp');
    const destInput = document.getElementById('cio-dest');
    const noteInput = document.getElementById('cio-note');

    const empValue = parseSelectedIdFromSearchableInput(empInput);
    const destValue = parseSelectedIdFromSearchableInput(destInput);
    const noteValue = String(noteInput?.value || '').trim();

    if (!empValue) {
      alert('従業員を選択してください / Vui lòng chọn nhân viên');
      empInput?.focus();
      return;
    }

    if (currentMode === 'check-out' && !destValue) {
      alert('送り先を選択してください / Vui lòng chọn địa điểm đến');
      destInput?.focus();
      return;
    }

    if (!item || (!item.MoldID && !item.CutterID)) {
      alert('IDが見つかりません / Không tìm thấy MoldID hoặc CutterID');
      this.showBilingualToast('error');
      return;
    }

    // Default employee store (same behavior as r7.0.9)
    const defChk = document.getElementById('cio-emp-default');
    if (defChk) {
      if (defChk.checked) setDefaultEmpId(empValue);
      else {
        const currentDef = getDefaultEmpId();
        if (String(currentDef) === String(empValue)) clearDefaultEmpId();
      }
    }

    // Determine status (IN/OUT/AUDIT)
    let status = currentMode;
    let auditType;
    let auditDate;

    const k = getItemKey(item);
    const currentStatus = this.getCurrentStatus(k.id, k.itemType);

    if (currentMode === 'check-in') {
      if (
        currentStatus &&
        (
          String(currentStatus).toLowerCase() === 'check-in' ||
          String(currentStatus).toUpperCase() === 'IN' ||
          String(currentStatus).toUpperCase() === 'CHECKIN' ||
          String(currentStatus).toLowerCase().includes('in')
        )
      ) {
        status = 'AUDIT';
        auditType = 'AUDIT-ONLY';
        auditDate = new Date().toISOString().split('T')[0];
        if (!noteValue) noteInput.value = '検数 / Kiểm kê';
      } else {
        status = 'IN';
      }
    } else if (currentMode === 'check-out') {
      status = 'OUT';
    }

    const data = {
      MoldID: item.MoldID || '',
      CutterID: item.CutterID || '',
      ItemType: item.MoldID ? 'mold' : 'cutter',
      Status: status,
      EmployeeID: String(empValue),
      DestinationID: (currentMode === 'check-in') ? 'AREA-MOLDROOM' : String(destValue),
      Notes: String(noteInput?.value || noteValue || '').trim(),
      Timestamp: new Date().toISOString(),
      AuditDate: auditDate,
      AuditType: auditType
    };

    // Optimistic pending
    const pendingLog = window.DataManager?.PendingCache?.add(data);
    if (!pendingLog) {
      this.showBilingualToast('error');
      return;
    }

    this.showBilingualToast('sending');
    setLastActionTime();

    document.dispatchEvent(new CustomEvent('detail:changed', {
      detail: { item, itemType: k.itemType, itemId: k.id, source: 'checkin-pending' }
    }));

    // Close quickly
    setTimeout(() => {
      isClosingAfterSave = true;
      this.close();
      document.dispatchEvent(new CustomEvent('checkin-completed', {
        detail: { item, success: true, mode: currentMode, timestamp: new Date().toISOString() }
      }));
      setTimeout(() => { isClosingAfterSave = false; }, 120);
    }, 100);

    // Background sync
    setTimeout(async () => {
      try {
        await this.syncToGitHub(data, pendingLog._localId, k.id);
      } catch (err) {}
    }, 120);
  },

  async syncToGitHub(data, localId, itemId) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      const rj = await res.json();
      if (!rj || !rj.success) throw new Error(rj?.message || 'Server error');

      // Remove pending
      window.DataManager?.PendingCache?.remove(localId);

      // Add real log
      const realLog = {
        LogID: rj.logId,
        MoldID: data.MoldID || '',
        CutterID: data.CutterID || '',
        Status: data.Status,
        EmployeeID: data.EmployeeID,
        DestinationID: data.DestinationID,
        Notes: data.Notes,
        Timestamp: data.Timestamp,
        _synced: true
      };

      const exists = window.DataManager?.data?.statuslogs?.some(l =>
        String(l.Timestamp) === String(realLog.Timestamp) &&
        (
          (realLog.MoldID && normalizeId(l.MoldID) === normalizeId(realLog.MoldID)) ||
          (realLog.CutterID && normalizeId(l.CutterID) === normalizeId(realLog.CutterID))
        )
      );

      if (!exists && window.DataManager?.data?.statuslogs) {
        window.DataManager.data.statuslogs.unshift(realLog);
      }

      // Refresh in place if modal still open for same item
      const tbody = document.querySelector('#cio-his tbody');
      if (tbody && currentItem) {
        const cur = getItemKey(currentItem);
        if (cur.id && normalizeId(cur.id) === normalizeId(itemId)) {
          this.refreshHistoryInPlace(currentItem);
        }
      }

      if (currentItem) {
        const cur = getItemKey(currentItem);
        if (cur.id && normalizeId(cur.id) === normalizeId(itemId)) {
          document.dispatchEvent(new CustomEvent('detail:changed', {
            detail: { item: currentItem, itemType: cur.itemType, itemId: cur.id, source: 'checkin-synced' }
          }));
        }
      }

      this.showBilingualToast('success', currentMode);

    } catch (err) {
      window.DataManager?.PendingCache?.markError(localId, err?.message || 'Sync error');
      if (currentItem) this.refreshHistoryInPlace(currentItem);
      this.showBilingualToast('error');
    }
  },

  showBilingualToast(type, mode) {
    const messages = {
      success: {
        'check-in': '✅ 入庫しました / Nhập kho thành công',
        'check-out': '✅ 出庫しました / Xuất kho thành công'
      },
      error: '⚠️ 保存失敗 / Lỗi ghi dữ liệu',
      sending: '📤 送信中... / Đang gửi...',
      processing: '処理中... / Đang xử lý...',
      deleting: '削除中... / Đang xóa...',
      deleted: '✅ 削除しました / Đã xóa',
      refreshed: '✅ 更新しました / Đã cập nhật'
    };

    let message = '';
    if (type === 'success' && mode) message = messages.success[mode] || '✅ OK';
    else message = messages[type] || '...';

    this.showToast(message, type);
  },

  showToast(message, type = 'info') {
    const existing = document.getElementById('cio-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'cio-toast';
    toast.className = `cio-toast cio-toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  },

  enableFilter() {
    const input = document.getElementById('cio-search');
    const table = document.getElementById('cio-his');
    if (!input || !table) return;

    input.addEventListener('input', () => {
      const term = String(input.value || '').toLowerCase();
      const rows = table.querySelectorAll('tbody tr');
      rows.forEach(row => {
        const text = String(row.innerText || '').toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
      });
    });
  },

  enableSort() {
    const headers = document.querySelectorAll('#cio-his thead th[data-sort]');
    if (!headers || headers.length === 0) return;

    headers.forEach(th => {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => {
        const table = th.closest('table');
        const tbody = table?.querySelector('tbody');
        if (!tbody) return;

        const rows = Array.from(tbody.querySelectorAll('tr'));
        const idx = Array.from(th.parentNode.children).indexOf(th);
        const isAsc = !th.classList.contains('asc');

        headers.forEach(h => h.classList.remove('asc', 'desc'));
        th.classList.add(isAsc ? 'asc' : 'desc');

        rows.sort((a, b) => {
          const aText = a.cells[idx]?.getAttribute('data-time') || a.cells[idx]?.innerText || '';
          const bText = b.cells[idx]?.getAttribute('data-time') || b.cells[idx]?.innerText || '';
          return isAsc ? String(aText).localeCompare(String(bText)) : String(bText).localeCompare(String(aText));
        });

        rows.forEach(r => tbody.appendChild(r));
      });
    });
  }
};

// expose
window.CheckInOut = CheckInOut;

// auto init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => CheckInOut.init());
} else {
  CheckInOut.init();
}

})();

// ========================================
// CHECK-IN / CHECK-OUT MODULE -- r7.0.9 (FIX EmployeeID)
// - Lock/Unlock history table (4 cols <-> 6 cols)
// - Default employee storage (既定従業員)
// - ✅ FIX: Lưu EmployeeID dạng số, không lưu tên
// ========================================

(function() {
  'use strict';

  const API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/checklog';
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

  function setLastActionTime() {
    sessionStorage.setItem(SESSION_KEY_LAST_ACTION, Date.now().toString());
    console.log('[CheckInOut] 📝 Last action time updated');
  }

  function shouldSkipBackgroundReload(moldId) {
    const pendingLogs = window.DataManager?.PendingCache?.logs || [];
    const hasPending = pendingLogs.some(p =>
      String(p.MoldID) === String(moldId) && p._pending === true
    );
    if (hasPending) {
      console.log('[CheckInOut] ⏭️ Skip reload: pending logs exist');
      return true;
    }
    const lastActionTime = parseInt(sessionStorage.getItem(SESSION_KEY_LAST_ACTION) || '0');
    const timeSinceAction = Date.now() - lastActionTime;
    if (timeSinceAction < 3000) {
      console.log('[CheckInOut] ⏭️ Skip reload: recent action', timeSinceAction, 'ms ago');
      return true;
    }
    return false;
  }

  const CheckInOut = {
    init() {
      console.log('[CheckInOut r7.0.9] Module ready');
      
      document.addEventListener('detail:changed', (e) => {
        if (e.detail?.item) {
          currentItem = e.detail.item;
        }
      });
      
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
          const panel = document.getElementById('cio-panel');
          if (panel) {
            this.close();
          }
        }
      });
    },

    getCurrentStatus(itemId, itemType = 'mold') {
      const logs = window.DataManager?.data?.statuslogs || [];
      const itemLogs = logs.filter(log => {
        if (itemType === 'mold') {
          return String(log.MoldID).trim() === String(itemId).trim();
        } else {
          return String(log.CutterID).trim() === String(itemId).trim();
        }
      });
      if (itemLogs.length === 0) return null;
      
      const sortedLogs = itemLogs.sort((a, b) =>
        new Date(b.Timestamp) - new Date(a.Timestamp)
      );
      const latestLog = sortedLogs[0];
      console.log('[CheckInOut] Current status:', latestLog.Status, 'for', itemId);
      return latestLog.Status || null;
    },

    refreshHistory(moldId) {
      const historyContainer = document.querySelector('.history-wrap');
      if (!historyContainer) return;
      console.log(`[CheckInOut V6] 🔄 Refreshing history for MoldID: ${moldId}`);
      
      const allLogs = window.DataManager?.data?.statuslogs || [];
      const destList = window.DataManager?.data?.destinations || [];
      const empList = window.DataManager?.data?.employees || [];
      const pendingLogs = window.DataManager?.PendingCache?.logs || [];
      
      const moldPendingLogs = pendingLogs.filter(p =>
        String(p.MoldID).trim() === String(moldId).trim() && p._pending === true
      );
      const moldRealLogs = allLogs.filter(l =>
        String(l.MoldID).trim() === String(moldId).trim()
      );
      
      const historyLogs = [
        ...moldPendingLogs,
        ...moldRealLogs
      ].sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
      
      if (historyLogs.length === 0) {
        historyContainer.innerHTML = '<p style="text-align:center;padding:1rem;color:#888;">入出庫履歴がありません<br>Chưa có lịch sử xuất/nhập</p>';
        return;
      }
      
      const showActions = isHistoryUnlocked();
      historyContainer.innerHTML = this.renderHistory(historyLogs, destList, empList, showActions);
      
      if (showActions) {
        this.bindDeleteHistoryEvents(moldId);
      }
    },

    refreshHistoryInPlace(moldId) {
      const tbody = document.querySelector('#cio-his tbody');
      if (!tbody) {
        console.warn('[CheckInOut] History table not found, skipping refresh');
        return;
      }
      console.log(`[CheckInOut V6] 🔄 Refreshing history IN-PLACE for MoldID: ${moldId}`);
      
      const allLogs = window.DataManager?.data?.statuslogs || [];
      const destList = window.DataManager?.data?.destinations || [];
      const empList = window.DataManager?.data?.employees || [];
      const pendingLogs = window.DataManager?.PendingCache?.logs || [];
      
      const moldPendingLogs = pendingLogs.filter(p =>
        String(p.MoldID).trim() === String(moldId).trim() && p._pending === true
      );
      const moldRealLogs = allLogs.filter(l =>
        String(l.MoldID).trim() === String(moldId).trim()
      );
      
      const historyLogs = [
        ...moldPendingLogs,
        ...moldRealLogs
      ].sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
      
      console.log('[CheckInOut] 📊 Overlay counts:', {
        pending: moldPendingLogs.length,
        real: moldRealLogs.length,
        total: historyLogs.length
      });
      
      if (historyLogs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:1rem;color:#888;">入出庫履歴がありません<br>Chưa có lịch sử xuất/nhập</td></tr>';
        return;
      }
      
      const showActions = isHistoryUnlocked();
      tbody.innerHTML = this.buildHistoryRows(historyLogs, destList, empList, showActions);
      
      if (showActions) {
        this.bindDeleteHistoryEvents(moldId);
      }
      console.log('[CheckInOut] 📊 Refreshed', historyLogs.length, 'history rows in place');
    },

    buildHistoryRows(logs, destList, empList, showActions = false) {
      return logs.map(l => {
        let badgeClass, badgeText;
        const statusUpper = (l.Status || '').toUpperCase();
        
        if (l.Status === 'AUDIT' || l.AuditType) {
          badgeClass = 'badge-audit';
          badgeText = (l.AuditType === 'AUDIT-WITH-RELOCATION') ? '検数移' : '検数';
        } else if (statusUpper === 'IN' || statusUpper === 'CHECKIN' || l.Status === 'check-in') {
          badgeClass = 'badge-in';
          badgeText = 'IN';
        } else if (statusUpper === 'OUT' || statusUpper === 'CHECKOUT' || l.Status === 'check-out') {
          badgeClass = 'badge-out';
          badgeText = 'OUT';
        } else {
          badgeClass = 'badge-unknown';
          badgeText = l.Status || '?';
        }
        
        const isPending = l._pending === true;
        const hasError = !!l._syncError;
        let syncClass = 'sync-dot synced', syncTitle = '同期済み / Đã đồng bộ', syncIcon = '✅';
        
        if (hasError) {
          syncClass = 'sync-dot error';
          syncTitle = `エラー: ${l._syncError}`;
          syncIcon = '⚠️';
        } else if (isPending) {
          syncClass = 'sync-dot pending';
          syncTitle = '同期中 / Đang đồng bộ...';
          syncIcon = '🔄';
        }
        
        const syncTd = showActions ? `<td class="col-sync"><span class="${syncClass}" title="${syncTitle}">${syncIcon}</span></td>` : '';
        const deleteTd = showActions && !isPending && !hasError
          ? `<td class="col-delete action-cell"><button class="btn-delete-history" data-log-id="${l.LogID || ''}" data-time="${encodeURIComponent(l.Timestamp || '')}" title="削除 / Xóa">❌</button></td>`
          : (showActions ? '<td class="col-delete action-cell"></td>' : '');
        
        return `
          <tr data-log-id="${l.LogID || l._localId}" class="${isPending ? 'row-pending' : ''}">
            <td data-time="${l.Timestamp}">${this.fmt(l.Timestamp)}</td>
            <td><span class="status-badge ${badgeClass}">${badgeText}</span></td>
            <td>${this.getEmployeeName(l.EmployeeID, empList)}</td>
            <td class="note-cell">${l.Notes || '-'}</td>
            ${syncTd}${deleteTd}
          </tr>
        `;
      }).join('');
    },

    bindDeleteHistoryEvents(moldId) {
      const buttons = document.querySelectorAll('.btn-delete-history');
      const self = this;
      
      buttons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          const logId = btn.getAttribute('data-log-id');
          const timestamp = btn.getAttribute('data-time');
          
          if (!confirm('Bạn chắc chắn muốn xóa? / 削除しますか？')) return;
          
          const row = btn.closest('tr');
          if (row) row.classList.add('deleting');
          
          self.showBilingualToast('deleting');
          
          try {
            const res = await fetch('https://ysd-moldcutter-backend.onrender.com/api/deletelog', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                MoldID: moldId,
                Timestamp: decodeURIComponent(timestamp || '')
              })
            });
            
            const rj = await res.json();
            if (rj.success) {
              console.log('[CheckInOut] ✅ Deleted from server:', logId);
              
              if (window.DataManager?.data?.statuslogs) {
                const beforeLen = window.DataManager.data.statuslogs.length;
                const timestampToDelete = decodeURIComponent(timestamp || '');
                window.DataManager.data.statuslogs = window.DataManager.data.statuslogs.filter(
                  l => l.Timestamp !== timestampToDelete
                );
                const afterLen = window.DataManager.data.statuslogs.length;
                console.log('[CheckInOut] 🗑 Removed from local:', beforeLen - afterLen, 'rows');
                
                if (beforeLen === afterLen) {
                  console.warn('[CheckInOut] ⚠️ Failed to remove from local! Timestamp:', timestampToDelete);
                }
              }
              
              if (row) {
                row.remove();
                console.log('[CheckInOut] 🔄 History row removed from UI');
              }
              
              self.showBilingualToast('deleted');
              setLastActionTime();
              
              setTimeout(async () => {
                try {
                  const historyBody = document.querySelector('#cio-his tbody');
                  if (historyBody && currentItem) {
                    await self.refreshHistoryInPlace(currentItem.MoldID);
                    console.log('[CheckInOut] ✅ History table refreshed (no GitHub reload)');
                  }
                  
                  if (currentItem) {
                    document.dispatchEvent(new CustomEvent('detail:changed', {
                      detail: {
                        item: currentItem,
                        itemType: 'mold',
                        itemId: moldId,
                        source: 'checkin-delete'
                      }
                    }));
                  }
                } catch (err) {
                  console.warn('[CheckInOut] Refresh failed:', err);
                }
              }, 500);
            } else {
              self.showBilingualToast('error');
              if (row) row.classList.remove('deleting');
            }
          } catch (err) {
            console.error('Delete error', err);
            self.showBilingualToast('error');
            if (row) row.classList.remove('deleting');
          }
        });
      });
    },

    applyAutoFillLogic(item, mode, historyLogs, empList) {
      const currentStatus = this.getCurrentStatus(item.MoldID || item.CutterID, item.MoldID ? 'mold' : 'cutter');
      console.log('[AutoFill] Current status:', currentStatus, 'Requested Mode:', mode);
      
      const lastLog = historyLogs[0];
      
      const empInput = document.getElementById('cio-emp');
      if (empInput) {
        const defEmpId = getDefaultEmpId();
        if (defEmpId) {
          empInput.value = defEmpId;
        } else if (lastLog) {
          empInput.value = lastLog.EmployeeID || '';
        }
      }
      
      const destInput = document.getElementById('cio-dest');
      if (destInput && lastLog && mode === 'check-out') {
        destInput.value = lastLog.DestinationID || '';
      }
      
      const destGroup = document.querySelector('.dest-group');
      if (destGroup) {
        if (mode === 'check-out') {
          destGroup.classList.remove('hidden');
          console.log('[AutoFill] ✅ Destination group SHOWN for check-out mode');
        } else {
          destGroup.classList.add('hidden');
          console.log('[AutoFill] ✅ Destination group HIDDEN for check-in mode');
        }
      }
      
      const noteInput = document.getElementById('cio-note');
      if (noteInput && currentStatus) {
        if (mode === 'check-in') {
          noteInput.value = '在庫確認 / Kiểm kê';
        } else if (currentStatus === 'check-out') {
          noteInput.value = '返却 / Trả về';
        }
        console.log('[AutoFill] ✅ Applied note for status:', currentStatus);
      }
    },

    openModal(mode = 'check-in', item = currentItem) {
      if (!item) {
        alert('金型を選択してください / Vui lòng chọn khuôn trước.');
        return;
      }
      if (!item.MoldID && !item.CutterID) {
        console.error('[CheckInOut] ❌ Item missing ID:', item);
        alert('Lỗi: Không tìm thấy MoldID hoặc CutterID');
        return;
      }
      
      currentMode = mode;
      currentItem = item;
      console.log('[CheckInOut r7.0.9] ✅ Opening modal with item:', {
        MoldID: item.MoldID,
        CutterID: item.CutterID,
        MoldCode: item.MoldCode,
        mode: mode,
        currentMode: currentMode
      });
      
      this.close();
      
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        document.body.classList.add('modal-open');
        console.log('[CheckInOut] ✅ Added modal-open class to body (iPhone mode)');
      }
      
      const upper = document.querySelector('.upper-section');
      if (!upper) {
        console.error('[CheckInOut V6] Upper section not found');
        return;
      }
      
      setTimeout(() => {
        const firstInput = document.querySelector('#cio-panel input, #cio-panel textarea, #cio-panel select');
        if (firstInput) {
          firstInput.focus();
          document.dispatchEvent(new CustomEvent("keyboardattach", { detail: { element: firstInput } }));
          console.log("[CheckInOut V6] 🧩 Keyboard attached to popup input");
        }
      }, 300);
      
      const destList = window.DataManager?.data?.destinations || [];
      const empList = window.DataManager?.data?.employees || [];
      const allLogs = window.DataManager?.data?.statuslogs || [];
      const racksList = window.DataManager?.data?.racks || [];
      console.log('[CheckInOut V6] Loaded', destList.length, 'destinations,', empList.length, 'employees,', racksList.length, 'racks');
      
      console.log('[CheckInOut] 📊 Displaying data from cache (no background reload)');
      
      const historyLogs = allLogs.filter(l => l.MoldID === item.MoldID);
      historyLogs.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
      
      const latestLog = historyLogs[0];
      let currentStatus = '履歴なし / Chưa có lịch sử';
      let statusClass = '';
      
      if (latestLog) {
        if (latestLog.Status === 'check-in') {
          const destName = this.getDestinationName(latestLog.DestinationID || 'AREA-MOLDROOM', destList);
          currentStatus = `在庫 / Trong kho - ${destName}`;
          statusClass = 'badge-green';
        } else if (latestLog.Status === 'check-out') {
          const destName = this.getDestinationName(latestLog.DestinationID, destList);
          currentStatus = `出庫中 / Đã xuất - ${destName}`;
          statusClass = 'badge-red';
        }
      }
      
      const moldID = item.MoldID || '';
      const moldName = item.MoldName || '';
      const rackNum = item.rackInfo?.RackNumber || item.RackID || '-';
      const layerNum = item.rackLayerInfo?.RackLayerNumber || item.RackLayerID || '-';
      
      const rackInfo = racksList.find(r => r.RackID === item.RackID);
      const rackLocation = rackInfo?.RackLocation || '-';
      
      // ✅ Auto-reload nếu có pending logs cũ
const hasPendingLogs = window.DataManager?.PendingCache?.logs?.some(
  p => String(p.MoldID) === String(item.MoldID) && p._pending === true
);

if (hasPendingLogs) {
  console.log('[CheckInOut] ⚠️ Detected pending logs, triggering background reload...');
  setTimeout(async () => {
    try {
      if (window.DataManager?.loadFromGitHub) {
        await window.DataManager.loadFromGitHub();
        await this.refreshHistoryInPlace(item.MoldID);
        console.log('[CheckInOut] ✅ Background reload completed');
      }
    } catch (err) {
      console.warn('[CheckInOut] Background reload failed:', err);
    }
  }, 500);
}

      const html = `
        <div class="checkio-panel" id="cio-panel">
            <div class="checkio-header checkio-header-${mode}">
            <div class="checkio-title">
                ${mode === 'check-in' ? '✓ Check-in / 入庫' : '✗ Check-out / 出庫'}
            </div>
            <div class="header-actions">
                <button class="btn-refresh" id="cio-refresh" title="更新 / Refresh">🔄</button>
                <button class="btn-close-compact" id="cio-close" title="Close (ESC)">✕</button>
            </div>
            </div>
          
          <div class="checkio-body">
            <!-- CỘT 1: LỊCH SỬ (45% width tablet) -->
            <section class="cio-history">
                <h4>履歴 / Lịch sử</h4>
                <div class="filter-row history-controls">
                <input type="text" id="cio-search" placeholder="検索… / Tìm kiếm…">
                <button id="cio-lock-toggle" type="button" class="lock-toggle" title="ロック/アンロック | Khóa/Mở khóa">
                    <span class="lock-text">🔒 Lock</span>
                </button>
                </div>
                <div class="history-wrap">${this.renderHistory(historyLogs, destList, empList, isHistoryUnlocked())}</div>
            </section>
            
            <!-- CỘT 2: TRẠNG THÁI (30% width tablet) -->
            <section class="cio-status">
              <h4>現在の状態 / Trạng thái</h4>
              <div class="status-badges">
                <div class="badge-row">
                  <span class="badge-label">金型ID / Mã khuôn:</span>
                  <div class="badge badge-mold">${moldID}</div>
                </div>
                <div class="badge-row">
                  <span class="badge-label">金型名 / Tên:</span>
                  <div class="badge badge-mold-name">${moldName}</div>
                </div>
                <div class="badge-row">
                  <span class="badge-label">状態 / Tình trạng:</span>
                  <div class="badge ${statusClass}">${currentStatus}</div>
                </div>
                <div class="badge-row">
                  <span class="badge-label">位置 / Vị trí:</span>
                  <div class="badge-group">
                    <div class="badge badge-rack">${rackNum}</div>
                    <span class="badge-sep">-</span>
                    <div class="badge badge-layer">${layerNum}</div>
                  </div>
                </div>
                <div class="rack-location">
                  <span class="loc-label">保管場所 / Nơi lưu:</span>
                  <span class="loc-value">${rackLocation}</span>
                </div>
              </div>
            </section>
            
            <!-- CỘT 3: NHẬP LIỆU (25% width tablet) -->
            <section class="cio-inputs">
                <!-- ✅ DI CHUYỂN MODE BUTTONS VÀO ĐÂY -->
                <div class="cio-mode-buttons">
                <button id="btn-in" class="mode-btn ${mode === 'check-in' ? 'active' : ''}" data-mode="check-in">✓ Check-in</button>
                <button id="btn-out" class="mode-btn ${mode === 'check-out' ? 'active' : ''}" data-mode="check-out">✗ Check-out</button>
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
              
              <div class="btn-row">
                <button class="btn-cancel" id="btn-cancel">✕ 戻る / Hủy</button>
                <button class="btn-confirm" id="btn-save">✓ 確認 / Xác nhận</button>
              </div>
            </section>
          </div>
        </div>`;
      
      upper.insertAdjacentHTML('beforeend', html);

    // ✅ Initialize searchable selects - LUÔN LUÔN tạo, không phụ thuộc màn hình
    const empContainer = document.getElementById('employee-select-container');
    if (empContainer) {
    const empOptions = empList.map(e => ({ 
        id: String(e.EmployeeID), 
        name: e.EmployeeName 
    }));
    
    const empSelect = window.createSearchableSelect('cio-emp', empOptions, id => {
        console.log('[CheckInOut] Employee selected', id);
        const faceStat = document.getElementById('cio-face-status');
        if (faceStat) {
        faceStat.textContent = '直接入力 / Nhập trực tiếp';
        faceStat.classList.remove('confirmed');
        }
        const defChk = document.getElementById('cio-emp-default');
        if (defChk) {
        defChk.checked = (id && String(id) === String(getDefaultEmpId()));
        }
    });
    
    empContainer.appendChild(empSelect);
    
    // ✅ Set default value
    const defEmpId = getDefaultEmpId();
    if (defEmpId) {
        setTimeout(() => {
        try {
            empSelect.setValue(String(defEmpId));
            console.log('[CheckInOut] ✅ Set default employee:', defEmpId);
        } catch(e) {
            console.warn('[CheckInOut] ⚠️ Failed to set default employee:', e);
        }
        }, 0);
    }
    
    // ✅ Set checkbox state
    const defChk = document.getElementById('cio-emp-default');
    if (defChk) {
        defChk.checked = !!defEmpId;
    }
    }

    // ✅ Destination select - Luôn tạo khi ở chế độ check-out
    if (mode === 'check-out') {
    const destContainer = document.getElementById('destination-select-container');
    if (destContainer) {
        const destOptions = destList.map(d => ({
        id: d.DestinationID,
        name: d.DestinationName
        }));
        const destSelect = window.createSearchableSelect('cio-dest', destOptions, (id) => {
        console.log('[CheckInOut] Destination selected:', id);
        });
        destContainer.appendChild(destSelect);
    }
    }

      
      this.applyAutoFillLogic(item, mode, historyLogs, empList);
      
      this.bindModalEvents(item, destList, empList);
      
      this.enableFilter();
      this.enableSort();
      
      const lockBtn = document.getElementById('cio-lock-toggle');
      const lockText = lockBtn?.querySelector('.lock-text');
      
      const applyLockUI = () => {
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
          
          const allLogs = window.DataManager?.data?.statuslogs || [];
          const historyLogs = allLogs.filter(l => String(l.MoldID).trim() === String(item.MoldID).trim())
                                     .sort((a,b) => new Date(b.Timestamp) - new Date(a.Timestamp));
          const destList = window.DataManager?.data?.destinations || [];
          const empList = window.DataManager?.data?.employees || [];
          
          document.querySelector('.history-wrap').innerHTML =
            CheckInOut.renderHistory(historyLogs, destList, empList, isHistoryUnlocked());
          
          applyLockUI();
          
          if (isHistoryUnlocked()) {
            CheckInOut.bindDeleteHistoryEvents(item.MoldID);
          }
          CheckInOut.enableSort();
          CheckInOut.enableFilter();
        });
      }
      
      applyLockUI();
      
      if (isHistoryUnlocked()) {
        this.bindDeleteHistoryEvents(item.MoldID);
      }
      console.log('[CheckInOut r7.0.9] ✅ Modal opened successfully');
    },

    renderHistory(logs, destList, empList, showActions = false) {
      if (!logs.length) {
        return `<div class="no-history">Chưa có lịch sử</div>`;
      }
      
      const lockClass = showActions ? 'history-unlocked' : 'history-locked';
      
      return `
        <table class="history-table ${lockClass}" id="cio-his">
          <thead>
            <tr>
              <th data-sort="time">🕐 時間 / Thời gian</th>
              <th data-sort="status">📊 種類 / Loại</th>
              <th data-sort="emp">👤 従業員 / NV</th>
              <th data-sort="note">📝 備考 / Ghi chú</th>
              ${showActions ? '<th class="col-sync" style="width:60px">🔄 Sync</th><th class="col-delete" style="width:40px"></th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${this.buildHistoryRows(logs, destList, empList, showActions)}
          </tbody>
        </table>
      `;
    },

    getEmployeeName(empId, empList) {
      if (!empId) return '-';
      if (!empList || empList.length === 0) return empId;
      const emp = empList.find(e => e.EmployeeID === empId);
      return emp ? (emp.EmployeeName || empId) : empId;
    },

    bindModalEvents(item, destList, empList) {
      const closeBtn = document.getElementById('cio-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.close());
      }

      // ✅ Nút Refresh
        const refreshBtn = document.getElementById('cio-refresh');
        if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            console.log('[CheckInOut] 🔄 Manual refresh requested');
            refreshBtn.disabled = true;
            refreshBtn.textContent = '⏳';
            
            try {
            // Reload từ GitHub
            if (window.DataManager?.loadFromGitHub) {
                await window.DataManager.loadFromGitHub();
                console.log('[CheckInOut] ✅ Data reloaded from GitHub');
            }
            
            // Refresh history table
            await this.refreshHistoryInPlace(item.MoldID);
            
            // Update badge
            document.dispatchEvent(new CustomEvent('detail:changed', {
                detail: {
                item: item,
                itemType: 'mold',
                itemId: item.MoldID,
                source: 'checkin-refresh'
                }
            }));
            
            this.showBilingualToast('refreshed'); // Thêm message này vào showBilingualToast
            refreshBtn.textContent = '✅';
            setTimeout(() => {
                refreshBtn.textContent = '🔄';
                refreshBtn.disabled = false;
            }, 1000);
            
            } catch (err) {
            console.error('[CheckInOut] ❌ Refresh failed:', err);
            this.showBilingualToast('error');
            refreshBtn.textContent = '⚠️';
            setTimeout(() => {
                refreshBtn.textContent = '🔄';
                refreshBtn.disabled = false;
            }, 2000);
            }
        });
        }
      
      const cancelBtn = document.getElementById('btn-cancel');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => this.close());
      }
      
      const faceBtn = document.getElementById('btn-face');
      if (faceBtn) {
        faceBtn.addEventListener('click', () => this.mockFaceID(empList));
      }
      
      const saveBtn = document.getElementById('btn-save');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => this.saveRecord(item));
      }
      
      const panelEl = document.getElementById('cio-panel');
      const headerEl = panelEl ? panelEl.querySelector('.checkio-header') : null;
      attachSwipeToClose(headerEl, panelEl, () => {
        CheckInOut.close();
      });
      
      const inBtn = document.getElementById('btn-in');
      const outBtn = document.getElementById('btn-out');
      if (inBtn) {
        inBtn.addEventListener('click', () => {
          if (currentMode !== 'check-in') {
            this.switchMode('check-in');
          }
        });
      }
      if (outBtn) {
        outBtn.addEventListener('click', () => {
          if (currentMode !== 'check-out') {
            this.switchMode('check-out');
          }
        });
      }
    },

    switchMode(newMode) {
      if (currentMode === newMode) {
        console.log('[CheckInOut] Mode already set to', newMode);
        return;
      }
      
      currentMode = newMode;
      console.log('[CheckInOut] Switching mode to:', newMode);
      
      const inBtn = document.getElementById('btn-in');
      const outBtn = document.getElementById('btn-out');
      const destGroup = document.querySelector('.dest-group');
      
      if (inBtn && outBtn) {
        inBtn.classList.remove('active');
        outBtn.classList.remove('active');
        if (newMode === 'check-in') {
          inBtn.classList.add('active');
        } else {
          outBtn.classList.add('active');
        }
      }
      
      const headerEl = document.querySelector('#cio-panel .checkio-header');
      const titleEl = headerEl ? headerEl.querySelector('.checkio-title') : null;
      if (headerEl) {
        headerEl.classList.remove('checkio-header-check-in', 'checkio-header-check-out');
        headerEl.classList.add(newMode === 'check-in' ? 'checkio-header-check-in' : 'checkio-header-check-out');
      }
      if (titleEl) {
        titleEl.textContent = newMode === 'check-in'
          ? '✓ Check-in / 入庫'
          : '✗ Check-out / 出庫';
      }
      
      if (destGroup) {
        if (newMode === 'check-out') {
          destGroup.classList.remove('hidden');
          
          const destContainer = document.getElementById('destination-select-container');
          if (destContainer && destContainer.children.length === 0) {
            const destList = window.DataManager?.data?.destinations || [];
            const destOptions = destList.map(d => ({
              id: d.DestinationID,
              name: d.DestinationName
            }));
            const destSelect = window.createSearchableSelect('cio-dest', destOptions, (id) => {
              console.log('[CheckInOut] Destination selected:', id);
            });
            destContainer.appendChild(destSelect);
            console.log('[CheckInOut] ✅ Destination select re-initialized');
          }
        } else {
          destGroup.classList.add('hidden');
        }
      }
      
      console.log('[CheckInOut] ✅ Mode switched to', newMode);
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
      
      empSel.value = emp.EmployeeID;
      
      if (faceStat) {
        faceStat.textContent = 'Face ID認証済み / Đã xác nhận Face ID';
        faceStat.classList.add('confirmed');
      }
      
      const defChk = document.getElementById('cio-emp-default');
      if (defChk) {
        defChk.checked = (emp.EmployeeID && emp.EmployeeID === getDefaultEmpId());
      }
      
      console.log('[CheckInOut V6] Face ID selected:', emp.EmployeeID);
    },

    /**
     * ✅ SAVE RECORD - r7.0.9 FIX: Lưu EmployeeID dạng số, không lưu tên
     */
    async saveRecord(item) {
      const empInput = document.getElementById('cio-emp');
      const destInput = document.getElementById('cio-dest');
      const noteInput = document.getElementById('cio-note');
      
      // ✅ FIX r7.0.9: Đảm bảo lấy EmployeeID (số), không lấy tên
      let empValue = '';
      if (empInput?.dataset?.selectedId) {
        // Ưu tiên dataset.selectedId từ searchable select
        empValue = String(empInput.dataset.selectedId).trim();
      } else if (empInput?.value) {
        // Fallback: Parse từ input.value dạng "Name (ID)" hoặc "ID"
        const raw = empInput.value.trim();
        const match = raw.match(/\(([^)]+)\)$/); // Extract ID từ "(ID)"
        if (match) {
          empValue = match[1].trim(); // Lấy ID từ pattern "Name (ID)"
        } else if (/^\d+$/.test(raw)) {
          empValue = raw; // Nếu chỉ là số thuần → dùng luôn
        } else {
          console.warn('[CheckInOut] ⚠️ Cannot parse EmployeeID from:', raw);
          empValue = raw; // Fallback cuối cùng (có thể sai)
        }
      }
      
      // ✅ Destination tương tự
      let destValue = '';
      if (destInput?.dataset?.selectedId) {
        destValue = String(destInput.dataset.selectedId).trim();
      } else if (destInput?.value) {
        const raw = destInput.value.trim();
        const match = raw.match(/\(([^)]+)\)$/);
        if (match) {
          destValue = match[1].trim();
        } else {
          destValue = raw;
        }
      }
      
      const noteValue = noteInput?.value.trim();
      
      // Validation
      if (!empValue) {
        alert('Vui lòng chọn nhân viên / 従業員を選択してください');
        empInput?.focus();
        return;
      }
      
      if (currentMode === 'check-out' && !destValue) {
        alert('Vui lòng chọn địa điểm đến / 送り先を選択してください');
        destInput?.focus();
        return;
      }
      
      // VALIDATE ITEM DATA
      if (!item || (!item.MoldID && !item.CutterID)) {
        console.error('[CheckInOut] ❌ Missing item data:', item);
        alert('Lỗi: Không tìm thấy MoldID hoặc CutterID');
        this.showBilingualToast('error');
        return;
      }
      
      console.log('[CheckInOut] ✅ Item validated:', {
        MoldID: item.MoldID,
        CutterID: item.CutterID,
        MoldCode: item.MoldCode,
        EmployeeID: empValue, // ← Log để kiểm tra
        DestinationID: destValue
      });
      
      // ✅ NEW r7.0.9: Lưu/xóa nhân viên mặc định theo checkbox
      const defChk = document.getElementById('cio-emp-default');
      if (defChk) {
        if (defChk.checked) {
          setDefaultEmpId(empValue);
        } else {
          const currentDef = getDefaultEmpId();
          if (currentDef === empValue) {
            clearDefaultEmpId();
          }
        }
      }
      
      // R7.0.4: Convert mode to correct status format
      let status;
      let auditType;
      let auditDate;
      
      if (currentMode === 'check-in') {
        const currentStatus = this.getCurrentStatus(
          item.MoldID || item.CutterID,
          item.MoldID ? 'mold' : 'cutter'
        );
        
        if (currentStatus === 'check-in' || currentStatus === 'CHECKIN' ||
            currentStatus === 'IN' || currentStatus?.toLowerCase().includes('in')) {
          console.log('[CheckInOut] Converting to AUDIT (already checked-in)');
          status = 'AUDIT';
          auditType = 'AUDIT-ONLY';
          auditDate = new Date().toISOString().split('T')[0];
          
          if (!noteValue.trim()) {
            noteInput.value = '検数 / Kiểm kê';
          }
        } else {
          status = 'IN';
        }
      } else if (currentMode === 'check-out') {
        status = 'OUT';
      } else {
        console.warn('[CheckInOut] Unknown mode:', currentMode);
        status = currentMode;
      }
      
      console.log('[CheckInOut] Final status to save:', status, 'from mode:', currentMode);
      
      const data = {
        MoldID: item.MoldID,
        CutterID: item.CutterID || '',
        ItemType: item.MoldID ? 'mold' : 'cutter',
        Status: status,
        EmployeeID: empValue, // ← Đã fix: chỉ là số ID
        DestinationID: currentMode === 'check-in' ? 'AREA-MOLDROOM' : destValue,
        Notes: noteInput?.value.trim() || noteValue,
        Timestamp: new Date().toISOString(),
        AuditDate: auditDate,
        AuditType: auditType
      };
      
      console.log('[CheckInOut R6.2] Submitting', data);
      
      // BƯỚC 1: OPTIMISTIC UPDATE
      const pendingLog = window.DataManager?.PendingCache?.add(data);
      if (!pendingLog) {
        console.error('[CheckInOut R6.2] PendingCache not available');
        return;
      }
      
      // ✅ BƯỚC 2: Thông báo ngay "Đang gửi..."
        this.showBilingualToast('sending'); // ← Thay đổi
        setLastActionTime();

        // 3. Dispatch event để badge update NGAY
        document.dispatchEvent(new CustomEvent('detail:changed', {
        detail: {
            item: item,
            itemType: 'mold',
            itemId: item.MoldID,
            source: 'checkin-pending'
        }
        }));

        // ✅ Đóng modal NGAY (không delay 300ms)
        setTimeout(() => {
        isClosingAfterSave = true;
        CheckInOut.close();
        
        document.dispatchEvent(new CustomEvent('checkin-completed', {
            detail: {
            item: item,
            success: true,
            mode: currentMode,
            timestamp: new Date().toISOString()
            }
        }));
        console.log('[CheckInOut] ✅ Dispatched checkin-completed event');
        
        setTimeout(() => { isClosingAfterSave = false; }, 100);
        }, 100); // ← Giảm xuống 100ms để đóng nhanh hơn

      
      // BƯỚC 3: Background GitHub sync
      setTimeout(async () => {
        try {
          await CheckInOut.syncToGitHub(data, pendingLog._localId, item.MoldID);
        } catch (err) {
          console.error('[CheckInOut] Sync error:', err);
        }
      }, 100);
    },

    /**
     * ✅ R6.5: Background sync to GitHub
     */
    async syncToGitHub(data, localId, moldId) {
      console.log('[CheckInOut] 🔄 Starting background sync...', { localId, moldId, data });
      
      try {
        if (!data.MoldID && !data.CutterID) {
          throw new Error('MoldID or CutterID required');
        }
        console.log('[CheckInOut] ✅ Data validated, sending to API...');
        
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        
        const rj = await res.json();
        if (!rj.success) {
          throw new Error(rj.message || 'Server error');
        }
        console.log('[CheckInOut] ✅ GitHub sync SUCCESS:', rj.logId);
        
        window.DataManager.PendingCache.remove(localId);
        console.log('[CheckInOut] ✅ Removed pending log from cache:', localId);
        
        const realLog = {
          LogID: rj.logId,
          MoldID: data.MoldID,
          Status: data.Status,
          EmployeeID: data.EmployeeID,
          DestinationID: data.DestinationID,
          Notes: data.Notes,
          Timestamp: data.Timestamp,
          _synced: true
        };
        
        const exists = window.DataManager?.data?.statuslogs?.some(log =>
          log.Timestamp === realLog.Timestamp &&
          String(log.MoldID).trim() === String(realLog.MoldID).trim()
        );
        
        if (!exists) {
          window.DataManager.data.statuslogs.unshift(realLog);
          console.log('[CheckInOut] ✅ Added real log to statuslogs array');
        } else {
          console.log('[CheckInOut] ⚠️ Log already exists, skipping');
        }
        
        const historyBody = document.querySelector('#cio-his tbody');
        if (historyBody) {
          console.log('[CheckInOut] 🔄 Refreshing history table...');
          await this.refreshHistoryInPlace(moldId);
          console.log('[CheckInOut] ✅ History table refreshed');
        }
        
        if (currentItem && String(currentItem.MoldID) === String(moldId)) {
          document.dispatchEvent(new CustomEvent('detail:changed', {
            detail: {
              item: currentItem,
              itemType: 'mold',
              itemId: moldId,
              source: 'checkin-synced'
            }
          }));
          console.log('[CheckInOut] 📡 Dispatched detail:changed event');
        }
        
        this.showBilingualToast('success', currentMode);
        console.log('[CheckInOut] ✅ Sync completed successfully');
        
      } catch (err) {
        console.error('[CheckInOut] ❌ Sync error:', err);
        
        window.DataManager.PendingCache.markError(localId, err.message);
        
        const historyBody = document.querySelector('#cio-his tbody');
        if (historyBody) {
          await this.refreshHistoryInPlace(moldId);
        }
        
        this.showBilingualToast('error');
      }
    },

    showBilingualToast(type, mode) {
    const messages = {
        success: {
        'check-in': '✅ Nhập kho thành công / チェックインしました',
        'check-out': '✅ Xuất kho thành công / チェックアウトしました'
        },
        error: '⚠️ Lỗi ghi dữ liệu / データの保存に失敗しました',
        sending: '📤 Đang gửi... / 送信中...', // ← THÊM MỚI
        processing: 'Đang xử lý... / 処理中...',
        deleting: 'Đang xóa... / 削除中...',
        deleted: '✅ Đã xóa thành công / 削除しました',
        refreshed: '✅ Đã cập nhật / 更新しました'
    };

      
      let message;
      if (type === 'success' && mode) {
        message = messages.success[mode];
      } else {
        message = messages[type] || 'Unknown';
      }
      
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
      }, 3000);
    },

    enableFilter() {
      const input = document.getElementById('cio-search');
      const table = document.getElementById('cio-his');
      if (!input || !table) return;
      
      input.addEventListener('input', () => {
        const term = input.value.toLowerCase();
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(row => {
          const text = row.innerText.toLowerCase();
          row.style.display = text.includes(term) ? '' : 'none';
        });
      });
    },

    enableSort() {
      const headers = document.querySelectorAll('#cio-his thead th');
      headers.forEach(th => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
          const table = th.closest('table');
          const tbody = table.querySelector('tbody');
          const rows = Array.from(tbody.querySelectorAll('tr'));
          const idx = Array.from(th.parentNode.children).indexOf(th);
          const isAsc = !th.classList.contains('asc');
          
          headers.forEach(h => {
            h.classList.remove('asc', 'desc');
          });
          th.classList.add(isAsc ? 'asc' : 'desc');
          
          rows.sort((a, b) => {
            const aText = a.cells[idx].getAttribute('data-time') || a.cells[idx].innerText;
            const bText = b.cells[idx].getAttribute('data-time') || b.cells[idx].innerText;
            return isAsc ? aText.localeCompare(bText) : bText.localeCompare(aText);
          });
          
          rows.forEach(row => tbody.appendChild(row));
        });
      });
    },

    fmt(dateStr) {
      if (!dateStr) return '-';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '-';
      
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hour = String(d.getHours()).padStart(2, '0');
      const min = String(d.getMinutes()).padStart(2, '0');
      
      return `${year}/${month}/${day} ${hour}:${min}`;
    },

    getDestinationName(destId, destList) {
      if (!destId) return 'N/A';
      if (!destList || destList.length === 0) return destId;
      const dest = destList.find(d => d.DestinationID === destId);
      return dest ? dest.DestinationName : destId;
    },

    close() {
      const panel = document.getElementById('cio-panel');
      if (panel) {
        panel.remove();
        console.log('[CheckInOut] V6 Closed panel');
      }
      
      if (!isClosingAfterSave) {
        document.dispatchEvent(new CustomEvent('module-cancelled', {
          detail: {
            module: 'checkin',
            item: currentItem,
            timestamp: new Date().toISOString()
          }
        }));
        console.log('[CheckInOut] ✅ Dispatched module-cancelled event');
      } else {
        console.log('[CheckInOut] ℹ️ Skipped module-cancelled (closing after save)');
      }
      
      if (document.body.classList.contains('modal-open')) {
        const existingPanel = document.getElementById('checkio-panel');
        if (existingPanel) existingPanel.remove();
      }
      
      document.body.classList.remove('modal-open');
      console.log('[CheckInOut] ✅ Removed modal-open class from body');
      
      const searchBox = document.querySelector('search-input');
      if (searchBox) {
        searchBox.focus();
        document.dispatchEvent(new CustomEvent('keyboard:attach', {
          detail: { element: searchBox }
        }));
        console.log('[CheckInOut] V6 Keyboard reattached to searchbox');
      }
    }
  };

  // ========================================
  // R7.0.13: DROPDOWN-ONLY AUTOCOMPLETE
  // ========================================
  function createSearchableSelect(inputId, options, onSelect) {
    
    const wrapper = document.createElement('div');
    wrapper.className = 'searchable-select-wrapper';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'search-input';
    input.id = inputId;
    input.placeholder = '検索... / Tìm kiếm...';
    input.autocomplete = 'off';
    
    let selectedId = '';
    let selectedName = '';
    let currentHighlighted = null;
    let highlightedIndex = -1;
    let isFirstFocus = true;
    
    const icon = document.createElement('span');
    icon.className = 'dropdown-icon';
    icon.textContent = '▼';
    
    const optionsList = document.createElement('div');
    optionsList.className = 'options-list';
    
    wrapper.appendChild(input);
    wrapper.appendChild(icon);
    wrapper.appendChild(optionsList);
    
    function renderOptions(filterText = '') {
      const lowerFilter = filterText.toLowerCase().trim();
      if (options.length === 0) {
        optionsList.innerHTML = '<div class="no-results">結果なし / Không có kết quả</div>';
        currentHighlighted = null;
        highlightedIndex = -1;
        return;
      }
      
      const renderedOptions = options.map((opt, index) => {
        const displayText = `${opt.name} (${opt.id})`;
        let isMatched = false;
        if (lowerFilter && lowerFilter.length > 0) {
          isMatched = displayText.toLowerCase().includes(lowerFilter);
        }
        
        const isSelected = opt.id === selectedId ? 'selected' : '';
        const matchedClass = isMatched ? 'matched' : '';
        
        if (isMatched && highlightedIndex === -1) {
          highlightedIndex = index;
          currentHighlighted = opt;
        }
        
        const highlightedClass = (index === highlightedIndex) ? 'highlighted' : '';
        
        return `
          <div class="option-item ${isSelected} ${matchedClass} ${highlightedClass}"
               data-id="${opt.id}"
               data-name="${opt.name}"
               data-index="${index}">
            ${displayText}
          </div>
        `;
      });
      
      optionsList.innerHTML = renderedOptions.join('');
      
      optionsList.querySelectorAll('.option-item').forEach(item => {
        item.addEventListener('click', () => {
          selectOption(item.getAttribute('data-id'), item.getAttribute('data-name'));
        });
      });
      
      if (highlightedIndex >= 0) {
        const highlightedEl = optionsList.querySelector('.option-item.highlighted');
        if (highlightedEl) {
          highlightedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
      
      console.log('[Dropdown] Rendered. Filter:', filterText, 'Highlighted index:', highlightedIndex);
    }
    
    function selectOption(id, name) {
      selectedId = id;
      selectedName = name;
      const displayText = `${name} (${id})`;
      input.value = displayText;
      input.dataset.selectedId = id; // ✅ SET dataset.selectedId
      currentHighlighted = null;
      highlightedIndex = -1;
      isFirstFocus = false;
      optionsList.classList.remove('show');
      wrapper.classList.remove('open');
      if (onSelect) onSelect(id, name);
      console.log('[Selected]:', displayText, '→ ID:', id);
    }
    
    input.addEventListener('focus', () => {
  // ✅ Tăng z-index cho form-group
  const formGroup = wrapper.closest('.form-group');
  if (formGroup) {
    formGroup.classList.add('dropdown-open');
    console.log('[Dropdown] Added dropdown-open class');
  }
  
  if (isFirstFocus && input.value && input.value.length > 0) {
    setTimeout(() => {
      input.select();
      isFirstFocus = false;
    }, 0);
  }
  highlightedIndex = -1;
  renderOptions(input.value);
  optionsList.classList.add('show');
  wrapper.classList.add('open');
});

    
    input.addEventListener('blur', () => {
      setTimeout(() => {
        isFirstFocus = true;
      }, 200);
    });
    
    input.addEventListener('input', () => {
      isFirstFocus = false;
      highlightedIndex = -1;
      const userInput = input.value;
      console.log('[Input] User typed:', userInput);
      renderOptions(userInput);
      if (!optionsList.classList.contains('show')) {
        optionsList.classList.add('show');
        wrapper.classList.add('open');
      }
    });
    
    input.addEventListener('keydown', (e) => {
      const visibleItems = optionsList.querySelectorAll('.option-item.matched, .option-item:not(.matched)');
      const matchedItems = optionsList.querySelectorAll('.option-item.matched');
      const itemsToUse = matchedItems.length > 0 ? matchedItems : visibleItems;
      
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        highlightedIndex = Math.min(highlightedIndex + 1, itemsToUse.length - 1);
        const targetItem = itemsToUse[highlightedIndex];
        if (targetItem) {
          currentHighlighted = {
            id: targetItem.getAttribute('data-id'),
            name: targetItem.getAttribute('data-name')
          };
          renderOptions(input.value);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        highlightedIndex = Math.max(highlightedIndex - 1, 0);
        const targetItem = itemsToUse[highlightedIndex];
        if (targetItem) {
          currentHighlighted = {
            id: targetItem.getAttribute('data-id'),
            name: targetItem.getAttribute('data-name')
          };
          renderOptions(input.value);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (currentHighlighted) {
          selectOption(currentHighlighted.id, currentHighlighted.name);
        } else if (matchedItems.length === 1) {
          const singleMatch = matchedItems[0];
          selectOption(singleMatch.getAttribute('data-id'), singleMatch.getAttribute('data-name'));
        }
      } else if (e.key === 'Tab') {
        if (currentHighlighted) {
          e.preventDefault();
          selectOption(currentHighlighted.id, currentHighlighted.name);
        }
      } else if (e.key === 'Escape') {
        optionsList.classList.remove('show');
        wrapper.classList.remove('open');
        currentHighlighted = null;
        highlightedIndex = -1;
      }
    });
    
    document.addEventListener('click', (e) => {
  if (!wrapper.contains(e.target)) {
    optionsList.classList.remove('show');
    wrapper.classList.remove('open');
    currentHighlighted = null;
    
    // ✅ Xóa class dropdown-open
    const formGroup = wrapper.closest('.form-group');
    if (formGroup) {
      formGroup.classList.remove('dropdown-open');
      console.log('[Dropdown] Removed dropdown-open class');
    }
    
    if (selectedName && input.value !== `${selectedName} (${selectedId})`) {
      input.value = selectedName ? `${selectedName} (${selectedId})` : '';
    }
  }
});

    
    wrapper.setValue = (id) => {
        const option = options.find(o => String(o.id) === String(id)); // ✅ So sánh theo string
        if (option) {
            selectedId = String(option.id);
            selectedName = option.name;
            input.value = `${option.name} (${option.id})`; // ✅ Hiển thị ngay
            input.dataset.selectedId = String(option.id);
            console.log('[SearchableSelect] setValue:', option.name, '(', option.id, ')');
        } else {
            console.warn('[SearchableSelect] ⚠️ Option not found for ID:', id);
        }
    };

    
    wrapper.getValue = () => selectedId;
    
    return wrapper;
  }

  window.createSearchableSelect = createSearchableSelect;

  window.CheckInOut = {
    openModal: (mode, item) => CheckInOut.openModal(mode, item)
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => CheckInOut.init());
  } else {
    CheckInOut.init();
  }

  console.log('[CheckInOut r7.0.9] Module loaded - FIX EmployeeID + DEFAULT EMPLOYEE + LOCK/UNLOCK HISTORY');

})();

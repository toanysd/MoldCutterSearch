/**
 * teflon-process-manager-r7.1.2.js
 * Module nghiệp vụ mạ Teflon nâng cao - r7.1.2
 * 
 * CHANGELOG r7.1.2 - 2025-12-26
 * ------------------------------------------------
 * NEW - Thêm trạng thái "未処理 / Chưa mạ" (unprocessed)
 * NEW - Bảng lịch sử lock/unlock theo pattern teflon-manager
 * NEW - Xóa hoàn toàn log (teflonlog + shiplog + statuslogs) qua API delete-log
 * FIX - Đúng tên cột storage_company (có gạch nối) trong molds.csv
 * FIX - Gửi đi mạ: cập nhật shiplog (FromCompanyID → ToCompanyID=7), storage_company=7, statuslogs Status=OUT
 * FIX - Mạ xong: phục hồi storage_company từ shiplog, Status=IN, hỏi cập nhật vị trí
 * FIX - UI gọn hơn: Header nhỏ + Thân 2 vùng (Trái: Info+History, Phải: Form)
 * FIX - Không dùng inline-style, chỉ gắn class CSS
 * 
 * Dependencies:
 * - window.DataManager (molds, teflonlog, employees, companies, shiplog, statuslogs)
 * - window.LocationManager (optional)
 * - API: /api/add-log, /api/update-item, /api/delete-log
 */

(function() {
  'use strict';

  // ========== CONFIG ==========
  const APIBASE = 'https://ysd-moldcutter-backend.onrender.com';
  const API_ADD_LOG = `${APIBASE}/api/add-log`;
  const API_UPDATE_ITEM = `${APIBASE}/api/update-item`;
  const API_DELETE_LOG = `${APIBASE}/api/delete-log`; // NEW r7.1.2

  const DEFAULT_SUPPLIER_ID = '7'; // ID công ty mạ Teflon
  const DEFAULT_EMPLOYEE_ID = '1'; // Nhân viên mặc định

  let currentItem = null;
  let isSaving = false;
  let isHistoryLocked = true; // Lock table mặc định

  // ========== STATUS MAPPING ==========
  // Thống nhất với teflon-manager: unprocessed / pending / approved / processing / completed
  const TEFLON_STATUS_KEYS = {
    unprocessed: 'unprocessed', // 未処理 / Chưa mạ
    pending: 'pending',         // 承認待ち / Chờ phê duyệt
    approved: 'approved',       // 承認済(発送待ち) / Đã duyệt (chờ gửi)
    processing: 'processing',   // テフロン加工中 / Đang mạ
    completed: 'completed'      // テフロン加工完了 / Mạ xong
  };

  const TEFLON_COATING_LABELS = {
    unprocessed: '', // Để trống trong molds.csv
    pending: '承認待ち / Chờ phê duyệt',
    approved: '承認済(発送待ち) / Đã duyệt (chờ gửi)',
    processing: 'テフロン加工中 / Đang mạ',
    completed: 'テフロン加工完了 / Mạ xong'
  };

  // TeflonStatus trong teflonlog.csv (English keyword)
  const TEFLON_LOG_STATUS = {
    unprocessed: '', // Không ghi log cho chưa mạ
    pending: 'Pending',
    approved: 'Approved',
    processing: 'Sent', // Tương thích lịch sử cũ
    completed: 'Completed'
  };

  // ========== HELPER FUNCTIONS ==========
  function normalizeText(v) {
    return String(v || '').trim();
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  }

  function getTodayISO() {
    return new Date().toISOString().split('T')[0];
  }

  function addBusinessDaysISO(startDateStr, businessDays) {
    if (!startDateStr) return '';
    const date = new Date(startDateStr);
    if (isNaN(date.getTime())) return '';
    let added = 0;
    while (added < businessDays) {
      date.setDate(date.getDate() + 1);
      const day = date.getDay();
      if (day !== 0 && day !== 6) added++;
    }
    return date.toISOString().split('T')[0];
  }

  function toNumber(str) {
    const n = parseFloat(String(str || '').replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }

  function showToast(message, type = 'info') {
    const existing = document.getElementById('tefproc-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'tefproc-toast';
    toast.className = `tefproc-toast tefproc-toast-${type}`;
    toast.textContent = message;

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
      opacity: '1',
      transition: 'opacity 0.3s'
    });

    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; }, 2000);
    setTimeout(() => { toast.remove(); }, 2600);
  }

  function getCompanyName(companyId, companies) {
    if (!companyId) return '';
    const list = companies || [];
    const c = list.find(x => String(x.CompanyID).trim() === String(companyId).trim());
    if (!c) return String(companyId);
    const shortName = c.CompanyShortName;
    const fullName = c.CompanyName || c.Name;
    return shortName || fullName || String(companyId);
  }

  function getEmployeeName(empId, employees) {
    if (!empId) return '';
    const list = employees || [];
    const e = list.find(x => String(x.EmployeeID).trim() === String(empId).trim());
    if (!e) return String(empId);
    return e.EmployeeNameShort || e.EmployeeName || e.name || String(empId);
  }

  // ========== STATUS MAPPING FUNCTIONS ==========
  function mapCoatingToStatusKey(coating) {
    const v = normalizeText(coating);
    if (!v) return TEFLON_STATUS_KEYS.unprocessed;
    // Exact match
    for (let key in TEFLON_COATING_LABELS) {
      if (v === TEFLON_COATING_LABELS[key]) return key;
    }
    // Fuzzy match
    const lower = v.toLowerCase();
    if (lower.includes('pending') || lower.includes('待ち')) return TEFLON_STATUS_KEYS.pending;
    if (lower.includes('approved') || lower.includes('承認済')) return TEFLON_STATUS_KEYS.approved;
    if (lower.includes('processing') || lower.includes('加工中')) return TEFLON_STATUS_KEYS.processing;
    if (lower.includes('completed') || lower.includes('完了')) return TEFLON_STATUS_KEYS.completed;
    return TEFLON_STATUS_KEYS.unprocessed;
  }

  function statusKeyToCoatingLabel(key) {
    return TEFLON_COATING_LABELS[key] || '';
  }

  function statusKeyToLogStatus(key) {
    return TEFLON_LOG_STATUS[key] || '';
  }

  function logStatusToStatusKey(logStatus) {
    const v = String(logStatus || '').toLowerCase();
    if (v === 'pending') return TEFLON_STATUS_KEYS.pending;
    if (v === 'approved') return TEFLON_STATUS_KEYS.approved;
    if (v === 'sent') return TEFLON_STATUS_KEYS.processing;
    if (v === 'completed') return TEFLON_STATUS_KEYS.completed;
    return TEFLON_STATUS_KEYS.unprocessed;
  }

  function formatStatusDisplay(statusKey) {
    const labels = {
      unprocessed: '未処理 / Chưa mạ',
      pending: '承認待ち / Chờ phê duyệt',
      approved: '承認済(発送待ち) / Đã duyệt (chờ gửi)',
      processing: 'テフロン加工中 / Đang mạ',
      completed: 'テフロン加工完了 / Mạ xong'
    };
    return labels[statusKey] || String(statusKey);
  }

  // ========== TEFLON HISTORY ==========
  function buildTeflonHistory(allLogs, mold) {
    if (!Array.isArray(allLogs) || !mold || !mold.MoldID) return [];
    const moldId = String(mold.MoldID).trim();
    const logs = allLogs.filter(row => String(row.MoldID).trim() === moldId);
    // Sort by date desc
    logs.sort((a, b) => {
      const da = new Date(a.SentDate || a.RequestedDate || a.CreatedDate).getTime();
      const db = new Date(b.SentDate || b.RequestedDate || b.CreatedDate).getTime();
      return db - da;
    });
    return logs;
  }

  function renderHistoryTable(logs, companies, employees) {
    if (!logs || logs.length === 0) {
      return `<div class="no-history"><br/>Chưa có lịch sử mạ Teflon.</div>`;
    }

    const rows = logs.map(l => {
      const statusKey = logStatusToStatusKey(l.TeflonStatus);
      const statusDisp = formatStatusDisplay(statusKey);
      const reqDate = fmtDate(l.RequestedDate);
      const sentDate = fmtDate(l.SentDate);
      const recvDate = fmtDate(l.ReceivedDate);
      const supplier = getCompanyName(l.SupplierID, companies);
      const reqBy = getEmployeeName(l.RequestedBy, employees);
      const sentBy = getEmployeeName(l.SentBy, employees);
      const quality = l.Quality || '';
      const notes = l.TeflonNotes || '';
      const logId = l.TeflonLogID || '';

      return `<tr data-log-id="${escapeHtml(logId)}">
        <td class="col-actions">
          <button type="button" class="btn-delete-log" data-log-id="${escapeHtml(logId)}" title="削除 / Xóa">🗑️</button>
        </td>
        <td>${escapeHtml(statusDisp)}</td>
        <td>${escapeHtml(reqDate)}</td>
        <td>${escapeHtml(sentDate)}</td>
        <td>${escapeHtml(recvDate)}</td>
        <td>${escapeHtml(supplier)}</td>
        <td>${escapeHtml(reqBy)}</td>
        <td>${escapeHtml(sentBy)}</td>
        <td>${escapeHtml(quality)}</td>
        <td class="note-cell">${escapeHtml(notes)}</td>
      </tr>`;
    }).join('');

    return `<table class="history-table tefproc-history-table">
      <thead><tr>
        <th>操作<br/>Xóa</th>
        <th>状態<br/>Status</th>
        <th>依頼日<br/>Ngày yêu cầu</th>
        <th>発送日<br/>Ngày gửi</th>
        <th>受領日<br/>Ngày nhận</th>
        <th>供給会社<br/>Nhà cung cấp</th>
        <th>依頼者<br/>Người yêu cầu</th>
        <th>発送者<br/>Người gửi</th>
        <th>品質<br/>Chất lượng</th>
        <th>備考<br/>Ghi chú</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  // ========== NEXT TEFLON LOG ID ==========
  function getNextTeflonLogID(dmData) {
    const list = dmData && Array.isArray(dmData.teflonlog) ? dmData.teflonlog : [];
    if (!list.length) return '1';
    const maxId = list
      .map(r => parseInt(r.TeflonLogID, 10))
      .filter(n => !isNaN(n))
      .reduce((max, n) => (n > max ? n : max), 0);
    return String(maxId + 1);
  }

  // ========== NEXT SHIP ID ==========
  function getNextShipID(dmData) {
    const list = dmData && Array.isArray(dmData.shiplog) ? dmData.shiplog : [];
    if (!list.length) return '1';
    const maxId = list
      .map(r => parseInt(r.ShipID, 10))
      .filter(n => !isNaN(n))
      .reduce((max, n) => (n > max ? n : max), 0);
    return String(maxId + 1);
  }

  // ========== DETERMINE NEXT STATUS ==========
  function determineNextStatus(currentStatusKey) {
    // Workflow: unprocessed -> pending -> approved -> processing -> completed
    if (!currentStatusKey || currentStatusKey === TEFLON_STATUS_KEYS.unprocessed) {
      return TEFLON_STATUS_KEYS.pending;
    }
    if (currentStatusKey === TEFLON_STATUS_KEYS.pending) {
      return TEFLON_STATUS_KEYS.approved;
    }
    if (currentStatusKey === TEFLON_STATUS_KEYS.approved) {
      return TEFLON_STATUS_KEYS.processing;
    }
    if (currentStatusKey === TEFLON_STATUS_KEYS.processing) {
      return TEFLON_STATUS_KEYS.completed;
    }
    return TEFLON_STATUS_KEYS.completed;
  }

  function getWorkflowHint(currentStatusKey) {
    if (!currentStatusKey || currentStatusKey === TEFLON_STATUS_KEYS.unprocessed) {
      return '💡 次のステップ：承認待ちへ登録 / Tạo yêu cầu mạ';
    }
    if (currentStatusKey === TEFLON_STATUS_KEYS.pending) {
      return '💡 次のステップ：承認して発送待ち / Xác nhận duyệt (chờ gửi)';
    }
    if (currentStatusKey === TEFLON_STATUS_KEYS.approved) {
      return '💡 次のステップ：発送確認 / Xác nhận gửi đi';
    }
    if (currentStatusKey === TEFLON_STATUS_KEYS.processing) {
      return '💡 次のステップ：受領確認 / Xác nhận nhận về';
    }
    return '✅ 完了 / Hoàn tất';
  }

  // ========== SWIPE TO CLOSE (MOBILE) ==========
  function attachSwipeToClose(headerEl, modalEl, hideCallback) {
    if (!headerEl || !modalEl || !('ontouchstart' in window)) return;
    let startY = 0, currentY = 0, isDragging = false;

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
      if (deltaY < 0) return; // Only swipe down
      currentY = touchY;
      const translateY = Math.min(deltaY, 120);
      const opacity = 1 - Math.min(deltaY / 200, 0.5);
      modalEl.style.transform = `translateY(${translateY}px)`;
      modalEl.style.opacity = String(opacity);
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

  // ========== BUILD OPTIONS ==========
  function buildCompanyOptions(companies, defaultId) {
    const list = companies || [];
    let opts = `<option value="">-- 選択 / Chọn --</option>`;
    list.forEach(c => {
      const id = String(c.CompanyID || '').trim();
      if (!id) return;
      const shortName = c.CompanyShortName;
      const fullName = c.CompanyName || c.Name;
      const text = shortName ? shortName : `${fullName} (ID:${id})`;
      const selected = (defaultId && id === String(defaultId).trim()) ? 'selected' : '';
      opts += `<option value="${escapeHtml(id)}" ${selected}>${escapeHtml(text)}</option>`;
    });
    return opts;
  }

  function buildEmployeeOptions(employees, defaultId) {
    const list = employees || [];
    let opts = `<option value="">-- 選択 / Chọn --</option>`;
    list.forEach(e => {
      const id = String(e.EmployeeID || '').trim();
      if (!id) return;
      const name = e.EmployeeNameShort || e.EmployeeName || e.name || id;
      const selected = (defaultId && id === String(defaultId).trim()) ? 'selected' : '';
      opts += `<option value="${escapeHtml(id)}" ${selected}>${escapeHtml(name)}</option>`;
    });
    return opts;
  }

  // ========== BUILD CURRENT STATUS DISPLAY ==========
  function buildCurrentStatusDisplay(currentStatusKey, historyLogs) {
    if (!currentStatusKey || currentStatusKey === TEFLON_STATUS_KEYS.unprocessed) {
      return `<section class="tefproc-current-status status-unprocessed">
        <h4>現在の状態 / Trạng thái hiện tại</h4>
        <div class="status-badge badge-unprocessed">未処理 / Chưa mạ</div>
        <p>このモールドはまだテフロン加工のプロセスに入っていません。<br/>Khuôn này chưa vào quy trình mạ Teflon.</p>
      </section>`;
    }

    const lastLog = historyLogs[0] || null;
    let badgeClass = 'badge-unprocessed';
    let statusLabel = '';
    let statusDescription = '';
    let dateInfo = '';

    if (currentStatusKey === TEFLON_STATUS_KEYS.pending) {
      badgeClass = 'badge-pending';
      statusLabel = '承認待ち / Chờ phê duyệt';
      statusDescription = 'モールドは承認待ちです。<br/>Khuôn đang chờ phê duyệt.';
      if (lastLog && lastLog.RequestedDate) {
        dateInfo = `依頼日 / Ngày yêu cầu: <strong>${fmtDate(lastLog.RequestedDate)}</strong>`;
      }
    } else if (currentStatusKey === TEFLON_STATUS_KEYS.approved) {
      badgeClass = 'badge-approved';
      statusLabel = '承認済(発送待ち) / Đã duyệt (chờ gửi)';
      statusDescription = '承認済み。発送待ちです。<br/>Đã duyệt và đang chờ gửi đi.';
      if (lastLog && lastLog.RequestedDate) {
        dateInfo = `承認日 / Ngày duyệt: <strong>${fmtDate(lastLog.RequestedDate)}</strong>`;
      }
    } else if (currentStatusKey === TEFLON_STATUS_KEYS.processing) {
      badgeClass = 'badge-processing';
      statusLabel = 'テフロン加工中 / Đang mạ Teflon';
      statusDescription = 'モールドは供給先で加工中です。<br/>Khuôn đang được mạ tại nhà cung cấp.';
      if (lastLog) {
        const sentDate = lastLog.SentDate ? fmtDate(lastLog.SentDate) : '-';
        const expDate = lastLog.ExpectedDate ? fmtDate(lastLog.ExpectedDate) : '-';
        dateInfo = `発送日 / Ngày gửi: <strong>${sentDate}</strong><br/>予定日 / Ngày dự kiến: <strong>${expDate}</strong>`;
      }
    } else if (currentStatusKey === TEFLON_STATUS_KEYS.completed) {
      badgeClass = 'badge-completed';
      statusLabel = 'テフロン加工完了 / Mạ xong';
      statusDescription = 'テフロン加工が完了しました。<br/>Khuôn mạ hoàn tất.';
      if (lastLog) {
        const recvDate = lastLog.ReceivedDate ? fmtDate(lastLog.ReceivedDate) : '-';
        const quality = lastLog.Quality ? escapeHtml(lastLog.Quality) : '-';
        dateInfo = `受領日 / Ngày nhận: <strong>${recvDate}</strong><br/>品質 / Chất lượng: <strong>${quality}</strong>`;
      }
    }

    return `<section class="tefproc-current-status status-${currentStatusKey}">
      <h4>現在の状態 / Trạng thái hiện tại</h4>
      <div class="status-badge ${badgeClass}">${statusLabel}</div>
      <p>${statusDescription}</p>
      ${dateInfo ? `<div class="date-info">${dateInfo}</div>` : ''}
    </section>`;
  }

  // ========== BUILD QUICK ACTIONS ==========
  function buildQuickActions(currentStatusKey) {
    if (!currentStatusKey || currentStatusKey === TEFLON_STATUS_KEYS.unprocessed) {
      return `<section class="tefproc-quick-actions">
        <h4>クイックアクション / Quick Actions</h4>
        <button type="button" id="tefproc-quick-pending" class="btn-quick btn-quick-pending">
          承認待ちへ登録 / Tạo yêu cầu mạ
        </button>
      </section>`;
    }
    if (currentStatusKey === TEFLON_STATUS_KEYS.pending) {
      return `<section class="tefproc-quick-actions">
        <h4>クイックアクション / Quick Actions</h4>
        <button type="button" id="tefproc-quick-approve" class="btn-quick btn-quick-approved">
          承認して発送待ちへ / Duyệt (chờ gửi)
        </button>
      </section>`;
    }
    if (currentStatusKey === TEFLON_STATUS_KEYS.approved) {
      return `<section class="tefproc-quick-actions">
        <h4>クイックアクション / Quick Actions</h4>
        <button type="button" id="tefproc-quick-send" class="btn-quick btn-quick-processing">
          今日発送確認 / Xác nhận gửi hôm nay
        </button>
      </section>`;
    }
    if (currentStatusKey === TEFLON_STATUS_KEYS.processing) {
      return `<section class="tefproc-quick-actions">
        <h4>クイックアクション / Quick Actions</h4>
        <button type="button" id="tefproc-quick-complete" class="btn-quick btn-quick-completed">
          今日受領確認 / Xác nhận nhận hôm nay
        </button>
      </section>`;
    }
    return ''; // Completed: no quick actions
  }

  // ========== TeflonProcessManager OBJECT ==========
  const TeflonProcessManager = {
    INIT: () => {
      console.log('[TeflonProcessManager r7.1.2] loaded');
    },

    open: function(arg) {
      // Support: open(5686) or open({moldId:5686}) or open({item:{...}})
      let item = null;
      let moldId = null;
      if (arg && typeof arg === 'object') {
        item = arg.item || null;
        moldId = arg.moldId || (arg.teflonRow ? arg.teflonRow.MoldID : null) || (item ? item.MoldID : null);
      } else {
        moldId = arg;
      }
      if (!item && moldId != null) {
        const dm = window.DataManager || (window.DataManager && window.DataManager.data ? window.DataManager.data : null);
        if (dm && Array.isArray(dm.molds)) {
          item = dm.molds.find(m => String(m.MoldID).trim() === String(moldId).trim()) || null;
        }
      }
      if (!item && moldId != null) {
        item = { MoldID: String(moldId) };
      }
      return this.openPanel(item);
    },

    openPanel: async function(item) {
      if (!item) {
        alert('モールドを選択してください。 / Vui lòng chọn khuôn trước.');
        return;
      }
      currentItem = item;

      const dm = window.DataManager;
      const data = dm ? dm.data : {};
      const companies = data.companies || [];
      const employees = data.employees || [];
      const teflonlog = data.teflonlog || [];

      if (!item.MoldID) {
        alert('このモジュールはモールドのみをサポートします。 / Module này chỉ hỗ trợ khuôn Mold.');
        return;
      }

      // Close existing
      const existing = document.getElementById('tefproc-panel');
      if (existing) existing.remove();

      const upper = document.querySelector('.upper-section');
      if (!upper) {
        console.error('[TeflonProcessManager] .upper-section not found');
        return;
      }

      const isMobile = window.innerWidth < 767;
      if (isMobile) document.body.classList.add('modal-open');

      const moldId = String(item.MoldID);
      const moldName = item.MoldName || '';
      const moldCode = item.MoldCode || '';
      const rackLayer = item.RackLayerName || item.RackLayerID || '';
      const storageCompanyId = item.storage_company || ''; // Đúng tên cột
      const storageCompanyName = getCompanyName(storageCompanyId, companies);

      const historyLogs = buildTeflonHistory(teflonlog, item);
      const today = getTodayISO();

      // Determine current status
      let currentStatusKey = TEFLON_STATUS_KEYS.unprocessed;
      if (historyLogs.length > 0) {
        currentStatusKey = logStatusToStatusKey(historyLogs[0].TeflonStatus);
      }
      if (!currentStatusKey || currentStatusKey === TEFLON_STATUS_KEYS.unprocessed) {
        currentStatusKey = mapCoatingToStatusKey(item.TeflonCoating);
      }

      const nextStatusKey = determineNextStatus(currentStatusKey);
      const workflowHint = getWorkflowHint(currentStatusKey);

      const currentStatusHTML = this.buildCurrentStatusDisplay(currentStatusKey, historyLogs);
      const quickActionsHTML = this.buildQuickActions(currentStatusKey);
      const historyTableHTML = renderHistoryTable(historyLogs, companies, employees);

      const lockBtnClass = isHistoryLocked ? 'locked' : 'unlocked';
      const lockBtnText = isHistoryLocked ? '🔓 解除<br/>Unlock' : '🔒 ロック<br/>Lock';

      const html = `<div class="tefproc-panel" id="tefproc-panel">
        <!-- Header -->
        <div class="tefproc-header" id="tefproc-header">
          <div class="tefproc-title">
            <div class="ja">テフロン加工登録</div>
            <div class="vi">Đăng ký trạng thái mạ</div>
          </div>
          <button class="btn-close-compact" id="tefproc-close" title="閉じる / Đóng">✕</button>
        </div>

        <!-- Mold Info Bar -->
        <div class="tefproc-mold-info">
          <span class="mold-id">ID: <strong>${escapeHtml(moldId)}</strong></span>
          <span class="mold-name">${escapeHtml(moldName)}</span>
          <span class="mold-code">${escapeHtml(moldCode)}</span>
        </div>

        <!-- Body: 2 columns -->
        <div class="tefproc-body">
          <!-- LEFT: Info + History -->
          <div class="tefproc-left">
            ${currentStatusHTML}
            ${quickActionsHTML}

            <!-- Thông tin khuôn -->
            <section class="tefproc-mold-detail">
              <h4>モールド情報 / Thông tin khuôn</h4>
              <div class="detail-row"><span class="label">会社 / Công ty:</span> <span class="value">${escapeHtml(storageCompanyName)}</span></div>
              <div class="detail-row"><span class="label">位置 / Vị trí:</span> <span class="value">${escapeHtml(rackLayer)}</span></div>
            </section>

            <!-- Lịch sử mạ -->
            <section class="tefproc-history">
              <div class="history-header">
                <h4>テフロン加工履歴 / Lịch sử mạ Teflon</h4>
                <button type="button" id="tefproc-lock-btn" class="btn-lock ${lockBtnClass}" title="Lock/Unlock table">
                  ${lockBtnText}
                </button>
              </div>
              <div class="history-wrap ${isHistoryLocked ? 'table-locked' : 'scroll-unlocked'}" id="tefproc-history-wrap">
                ${historyTableHTML}
              </div>
            </section>
          </div>

          <!-- RIGHT: Form -->
          <div class="tefproc-right">
            <section class="tefproc-form">
              <h4>状態登録 / Đăng ký trạng thái mạ</h4>
              <div class="workflow-hint">${escapeHtml(workflowHint)}</div>

              <div class="form-group">
                <label class="form-label">状態 / Trạng thái</label>
                <select id="tefproc-status" class="form-control">
                  <option value="${TEFLON_STATUS_KEYS.pending}">承認待ち / Chờ phê duyệt</option>
                  <option value="${TEFLON_STATUS_KEYS.approved}">承認済(発送待ち) / Đã duyệt (chờ gửi)</option>
                  <option value="${TEFLON_STATUS_KEYS.processing}">テフロン加工中 / Đang mạ</option>
                  <option value="${TEFLON_STATUS_KEYS.completed}">テフロン加工完了 / Mạ xong</option>
                </select>
                <div id="tefproc-status-pill" class="tefproc-status-pill"></div>
              </div>

              <div class="form-group">
                <label class="form-label">供給会社 / Nhà cung cấp</label>
                <select id="tefproc-supplier" class="form-control">
                  ${this.buildCompanyOptions(companies, DEFAULT_SUPPLIER_ID)}
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">依頼日 / Ngày yêu cầu</label>
                <input type="date" id="tefproc-request-date" class="form-control" value="${today}" />
              </div>

              <div class="form-group">
                <label class="form-label">発送日 / Ngày gửi</label>
                <input type="date" id="tefproc-sent-date" class="form-control" value="" />
              </div>

              <div class="form-group">
                <label class="form-label">予定日 / Ngày dự kiến nhận</label>
                <input type="date" id="tefproc-expected-date" class="form-control" />
              </div>

              <div class="form-group">
                <label class="form-label">受領日 / Ngày nhận</label>
                <input type="date" id="tefproc-received-date" class="form-control" value="" />
              </div>

              <div class="form-group">
                <label class="form-label">依頼者 / Người yêu cầu</label>
                <select id="tefproc-request-emp" class="form-control">
                  ${this.buildEmployeeOptions(employees)}
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">発送者 / Người gửi</label>
                <select id="tefproc-sent-emp" class="form-control">
                  ${this.buildEmployeeOptions(employees, DEFAULT_EMPLOYEE_ID)}
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">受領者 / Người nhận</label>
                <select id="tefproc-received-emp" class="form-control">
                  ${this.buildEmployeeOptions(employees)}
                </select>
              </div>

              <div class="form-group">
                <label class="form-label">加工タイプ / Loại mạ</label>
                <input type="text" id="tefproc-coating-type" class="form-control" placeholder="Full Teflon, Partial..." />
              </div>

              <div class="form-group">
                <label class="form-label">理由 / Lý do</label>
                <input type="text" id="tefproc-reason" class="form-control" placeholder="再加工、顧客要求..." />
              </div>

              <div class="form-group">
                <label class="form-label">費用 (JPY) / Chi phí</label>
                <input type="number" id="tefproc-cost" class="form-control" min="0" step="1" />
              </div>

              <div class="form-group">
                <label class="form-label">品質 / Chất lượng</label>
                <input type="text" id="tefproc-quality" class="form-control" placeholder="OK, NG, ..." />
              </div>

              <div class="form-group">
                <label class="form-label">備考 / Ghi chú</label>
                <textarea id="tefproc-notes" class="form-control" rows="2" placeholder="追加のメモ..."></textarea>
              </div>

              <div class="btn-row">
                <button type="button" class="btn-cancel" id="tefproc-cancel">キャンセル<br/>Hủy</button>
                <button type="button" class="btn-confirm" id="tefproc-save">登録<br/>Lưu</button>
              </div>
            </section>
          </div>
        </div>

        <!-- Footer -->
        <div class="tefproc-footer">
          <button type="button" id="tefproc-bottom-close" class="btn-cancel">閉じる<br/>Đóng</button>
        </div>
      </div>`;

      upper.insertAdjacentHTML('beforeend', html);

      this.applySmartAutoFill(currentStatusKey, nextStatusKey, historyLogs);
      this.bindEvents(item, companies, employees, teflonlog, currentStatusKey, nextStatusKey);
    },

    buildCompanyOptions,
    buildEmployeeOptions,
    buildCurrentStatusDisplay,
    buildQuickActions,

    applySmartAutoFill: function(currentStatusKey, nextStatusKey, historyLogs) {
      const statusSelect = document.getElementById('tefproc-status');
      const statusPill = document.getElementById('tefproc-status-pill');
      const sentDateEl = document.getElementById('tefproc-sent-date');
      const expDateEl = document.getElementById('tefproc-expected-date');
      const sentEmpEl = document.getElementById('tefproc-sent-emp');
      const today = getTodayISO();

      // Auto-fill based on current status
      if (!currentStatusKey || currentStatusKey === TEFLON_STATUS_KEYS.unprocessed) {
        if (statusSelect) statusSelect.value = TEFLON_STATUS_KEYS.pending;
      } else if (currentStatusKey === TEFLON_STATUS_KEYS.pending) {
        if (statusSelect) statusSelect.value = TEFLON_STATUS_KEYS.approved;
      } else if (currentStatusKey === TEFLON_STATUS_KEYS.approved) {
        if (statusSelect) statusSelect.value = TEFLON_STATUS_KEYS.processing;
        if (sentDateEl) sentDateEl.value = today;
        if (expDateEl) expDateEl.value = addBusinessDaysISO(today, 5);
        if (sentEmpEl) sentEmpEl.value = DEFAULT_EMPLOYEE_ID;
      } else if (currentStatusKey === TEFLON_STATUS_KEYS.processing) {
        if (statusSelect) statusSelect.value = TEFLON_STATUS_KEYS.completed;
      }

      // Update status pill
      if (statusSelect && statusPill) {
        const updateStatusPill = () => {
          const key = statusSelect.value;
          const label = formatStatusDisplay(key);
          statusPill.textContent = label;
          statusPill.setAttribute('data-status', key);
        };
        statusSelect.addEventListener('change', updateStatusPill);
        updateStatusPill();
      }

      // Auto ExpectedDate when SentDate changes
      if (sentDateEl && expDateEl) {
        sentDateEl.addEventListener('change', () => {
          if (!sentDateEl.value) return;
          if (expDateEl.value) return; // Don't override if user already set
          const auto = addBusinessDaysISO(sentDateEl.value, 5);
          if (auto) expDateEl.value = auto;
        });
      }
    },

    // Tiếp tục ở Phần 2...
    bindEvents: function(item, companies, employees, teflonlog, currentStatusKey, nextStatusKey) {
      const panel = document.getElementById('tefproc-panel');
      if (!panel) return;

      const header = panel.querySelector('.tefproc-header');
      attachSwipeToClose(header, panel, this.close.bind(this));

      const closeBtn = document.getElementById('tefproc-close');
      const bottomClose = document.getElementById('tefproc-bottom-close');
      const cancelBtn = document.getElementById('tefproc-cancel');

      if (closeBtn) closeBtn.addEventListener('click', this.close.bind(this));
      if (bottomClose) bottomClose.addEventListener('click', this.close.bind(this));
      if (cancelBtn) cancelBtn.addEventListener('click', this.close.bind(this));

      // Lock/Unlock history table
      const lockBtn = document.getElementById('tefproc-lock-btn');
      if (lockBtn) {
        lockBtn.addEventListener('click', () => {
          isHistoryLocked = !isHistoryLocked;
          const historyWrap = document.getElementById('tefproc-history-wrap');
          if (historyWrap) {
            if (isHistoryLocked) {
              historyWrap.classList.add('table-locked');
              historyWrap.classList.remove('scroll-unlocked');
              lockBtn.classList.remove('unlocked');
              lockBtn.classList.add('locked');
              lockBtn.innerHTML = '🔓 解除<br/>Unlock';
            } else {
              historyWrap.classList.remove('table-locked');
              historyWrap.classList.add('scroll-unlocked');
              lockBtn.classList.add('unlocked');
              lockBtn.classList.remove('locked');
              lockBtn.innerHTML = '🔒 ロック<br/>Lock';
            }
          }
        });
      }

      // Delete log buttons
      const deleteLogBtns = panel.querySelectorAll('.btn-delete-log');
      deleteLogBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const logId = btn.getAttribute('data-log-id');
          this.handleDeleteLog(logId, item, companies, employees);
        });
      });

      // Quick Actions handlers
      const quickPendingBtn = document.getElementById('tefproc-quick-pending');
      const quickApproveBtn = document.getElementById('tefproc-quick-approve');
      const quickSendBtn = document.getElementById('tefproc-quick-send');
      const quickCompleteBtn = document.getElementById('tefproc-quick-complete');

      if (quickPendingBtn) {
        quickPendingBtn.addEventListener('click', 
          this.handleQuickPending.bind(this, item, companies, employees)
        );
      }
      if (quickApproveBtn) {
        quickApproveBtn.addEventListener('click', 
          this.handleQuickApprove.bind(this, item, companies, employees)
        );
      }
      if (quickSendBtn) {
        quickSendBtn.addEventListener('click', 
          this.handleQuickSend.bind(this, item, companies, employees)
        );
      }
      if (quickCompleteBtn) {
        quickCompleteBtn.addEventListener('click', 
          this.handleQuickComplete.bind(this, item, companies, employees)
        );
      }

      // Full form save
      const saveBtn = document.getElementById('tefproc-save');
      if (saveBtn) {
        saveBtn.addEventListener('click', 
          this.handleFormSubmit.bind(this, item, companies, employees)
        );
      }
    },

    close: function() {
      const panel = document.getElementById('tefproc-panel');
      if (panel) panel.remove();
      if (document.body.classList.contains('modal-open')) {
        const anyPanel = document.getElementById('ship-panel') || 
                        document.getElementById('cio-panel') || 
                        document.getElementById('loc-panel');
        if (!anyPanel) document.body.classList.remove('modal-open');
      }
    },

    // ========== DELETE LOG (r7.1.2 NEW) ==========
    handleDeleteLog: async function(logId, item, companies, employees) {
      if (!logId) return;
      if (isSaving) return;

      const msg = `このログを完全に削除しますか？\nこの操作は元に戻せません。\n\nログID: ${logId}\n\n削除すると以下のデータも削除されます:\n- teflonlog.csv のエントリ\n- 関連する shiplog.csv のエントリ\n- 関連する statuslogs.csv のエントリ\n\n本当に削除しますか？`;
      if (!window.confirm(msg)) return;

      const dm = window.DataManager;
      const data = dm ? dm.data : {};
      const teflonlog = data.teflonlog || [];
      const shiplog = data.shiplog || [];
      const statuslogs = data.statuslogs || [];

      // Find log to delete
      const logToDelete = teflonlog.find(l => String(l.TeflonLogID).trim() === String(logId).trim());
      if (!logToDelete) {
        alert('ログが見つかりません。 / Log không tìm thấy.');
        return;
      }

      const moldId = String(logToDelete.MoldID).trim();
      const sentDate = logToDelete.SentDate;
      const recvDate = logToDelete.ReceivedDate;

      this.close();
      showToast('削除中... / Đang xóa...', 'info');
      isSaving = true;

      try {
        // 1) Delete teflonlog.csv entry
        const deleteTeflonRes = await fetch(API_DELETE_LOG, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'teflonlog.csv',
            logId: logId
          })
        });
        const deleteTeflonJson = await deleteTeflonRes.json();
        if (!deleteTeflonRes.ok || !deleteTeflonJson.success) {
          throw new Error(deleteTeflonJson.message || 'teflonlog削除失敗 / Xóa teflonlog thất bại');
        }

        // 2) Delete related shiplog.csv entries (if any)
        // Find shiplog entries related to this mold + teflon (ToCompanyID=7 or FromCompanyID=7)
        const relatedShipLogs = shiplog.filter(s => {
          const sMoldId = String(s.MoldID || '').trim();
          if (sMoldId !== moldId) return false;
          const toCompany = String(s.ToCompanyID || '').trim();
          const fromCompany = String(s.FromCompanyID || '').trim();
          const notes = String(s.ShipNotes || '').toLowerCase();
          // Check if it's teflon-related
          if (notes.includes('テフロン') || notes.includes('teflon')) {
            return true;
          }
          // Or if sent to/from supplier ID 7
          if (toCompany === '7' || fromCompany === '7') {
            return true;
          }
          return false;
        });

        for (const shipEntry of relatedShipLogs) {
          try {
            const deleteShipRes = await fetch(API_DELETE_LOG, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filename: 'shiplog.csv',
                logId: shipEntry.ShipID
              })
            });
            const deleteShipJson = await deleteShipRes.json();
            if (!deleteShipRes.ok || !deleteShipJson.success) {
              console.warn('[TeflonProcessManager] shiplog削除警告:', deleteShipJson);
            }
          } catch (e) {
            console.warn('[TeflonProcessManager] shiplog削除エラー:', e);
          }
        }

        // 3) Delete related statuslogs.csv entries (Status=OUT or IN, Notes contains "テフロン")
        const relatedStatusLogs = statuslogs.filter(s => {
          const sMoldId = String(s.MoldID || '').trim();
          if (sMoldId !== moldId) return false;
          const notes = String(s.Notes || '').toLowerCase();
          if (notes.includes('テフロン') || notes.includes('teflon')) {
            return true;
          }
          return false;
        });

        for (const statusEntry of relatedStatusLogs) {
          try {
            const deleteStatusRes = await fetch(API_DELETE_LOG, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filename: 'statuslogs.csv',
                logId: statusEntry.StatusLogID
              })
            });
            const deleteStatusJson = await deleteStatusRes.json();
            if (!deleteStatusRes.ok || !deleteStatusJson.success) {
              console.warn('[TeflonProcessManager] statuslogs削除警告:', deleteStatusJson);
            }
          } catch (e) {
            console.warn('[TeflonProcessManager] statuslogs削除エラー:', e);
          }
        }

        // 4) Update in-memory data
        if (data) {
          if (Array.isArray(data.teflonlog)) {
            data.teflonlog = data.teflonlog.filter(l => String(l.TeflonLogID).trim() !== String(logId).trim());
          }
          if (Array.isArray(data.shiplog)) {
            const shipIds = relatedShipLogs.map(s => String(s.ShipID).trim());
            data.shiplog = data.shiplog.filter(s => !shipIds.includes(String(s.ShipID).trim()));
          }
          if (Array.isArray(data.statuslogs)) {
            const statusIds = relatedStatusLogs.map(s => String(s.StatusLogID).trim());
            data.statuslogs = data.statuslogs.filter(s => !statusIds.includes(String(s.StatusLogID).trim()));
          }
        }

        // 5) Recompute
        if (dm && typeof dm.recompute === 'function') {
          try {
            dm.recompute();
          } catch (e) {
            console.warn('[TeflonProcessManager] recompute error:', e);
          }
        }

        showToast('削除完了 / Xóa hoàn tất', 'success');

        // Notify teflon-manager to refresh
        try {
          window.dispatchEvent(new CustomEvent('teflon-data-changed', {
            detail: { source: 'teflon-process-manager', action: 'delete' }
          }));
        } catch (e) {
          console.warn('[TeflonProcessManager] dispatch event error:', e);
        }

      } catch (err) {
        console.error('[TeflonProcessManager] Delete error:', err);
        showToast('削除失敗 / Xóa thất bại', 'error');
        alert(`エラー / Lỗi: ${err.message}`);
      } finally {
        isSaving = false;
      }
    },

    // ========== QUICK ACTIONS ==========
    // Quick Pending (未処理 → 承認待ち)
    handleQuickPending: async function(item, companies, employees) {
      if (isSaving) return;
      const msg = '承認待ちへ登録しますか？\nTạo yêu cầu mạ?';
      if (!window.confirm(msg)) return;

      const dm = window.DataManager;
      const data = dm ? dm.data : {};
      const moldId = String(item.MoldID).trim();
      const today = getTodayISO();
      const newLogId = getNextTeflonLogID(data);

      const tefEntry = {
        TeflonLogID: newLogId,
        MoldID: moldId,
        TeflonStatus: statusKeyToLogStatus(TEFLON_STATUS_KEYS.pending),
        RequestedBy: DEFAULT_EMPLOYEE_ID,
        RequestedDate: today,
        SentBy: '',
        SentDate: '',
        ExpectedDate: '',
        ReceivedDate: '',
        SupplierID: DEFAULT_SUPPLIER_ID,
        CoatingType: '',
        Reason: 'クイック登録 / Quick register',
        TeflonCost: '',
        Quality: '',
        TeflonNotes: '承認待ちへ登録',
        CreatedDate: today,
        UpdatedBy: DEFAULT_EMPLOYEE_ID,
        UpdatedDate: today
      };

      this.close();
      showToast('登録中... / Đang ghi nhận...', 'info');
      isSaving = true;

      try {
        const addRes = await fetch(API_ADD_LOG, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'teflonlog.csv',
            entry: tefEntry
          })
        });
        const addJson = await addRes.json();
        if (!addRes.ok || !addJson.success) {
          throw new Error(addJson.message || 'teflonlog書き込み失敗 / Không ghi được teflonlog.csv');
        }

        // Update in-memory
        if (data && Array.isArray(data.teflonlog)) {
          data.teflonlog.unshift(tefEntry);
        }

        if (dm && typeof dm.recompute === 'function') {
          try { dm.recompute(); } catch (e) { console.warn(e); }
        }

        showToast('承認待ちへ登録完了 / Đã chuyển sang Chờ phê duyệt', 'success');

        // Notify teflon-manager
        try {
          window.dispatchEvent(new CustomEvent('teflon-data-changed', {
            detail: { source: 'teflon-process-manager', action: 'save' }
          }));
        } catch (e) { console.warn(e); }

      } catch (err) {
        console.error('[TeflonProcessManager] QuickPending error:', err);
        showToast('登録失敗 / Thất bại', 'error');
        alert(`エラー / Lỗi: ${err.message}`);
      } finally {
        isSaving = false;
      }
    },

    // Quick Approve (承認待ち → 承認済)
    handleQuickApprove: async function(item, companies, employees) {
      if (isSaving) return;
      const msg = '承認して発送待ちへ移行しますか？\nDuyệt nhanh?';
      if (!window.confirm(msg)) return;

      const dm = window.DataManager;
      const data = dm ? dm.data : {};
      const moldId = String(item.MoldID).trim();
      const today = getTodayISO();
      const newLogId = getNextTeflonLogID(data);

      const tefEntry = {
        TeflonLogID: newLogId,
        MoldID: moldId,
        TeflonStatus: statusKeyToLogStatus(TEFLON_STATUS_KEYS.approved),
        RequestedBy: DEFAULT_EMPLOYEE_ID,
        RequestedDate: today,
        SentBy: '',
        SentDate: '',
        ExpectedDate: '',
        ReceivedDate: '',
        SupplierID: DEFAULT_SUPPLIER_ID,
        CoatingType: '',
        Reason: 'クイック承認 / Quick approve',
        TeflonCost: '',
        Quality: '',
        TeflonNotes: '承認済(発送待ち)',
        CreatedDate: today,
        UpdatedBy: DEFAULT_EMPLOYEE_ID,
        UpdatedDate: today
      };

      this.close();
      showToast('承認中... / Đang duyệt...', 'info');
      isSaving = true;

      try {
        const addRes = await fetch(API_ADD_LOG, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'teflonlog.csv',
            entry: tefEntry
          })
        });
        const addJson = await addRes.json();
        if (!addRes.ok || !addJson.success) {
          throw new Error(addJson.message || 'teflonlog書き込み失敗');
        }

        if (data && Array.isArray(data.teflonlog)) {
          data.teflonlog.unshift(tefEntry);
        }

        if (dm && typeof dm.recompute === 'function') {
          try { dm.recompute(); } catch (e) { console.warn(e); }
        }

        showToast('承認完了 / Đã duyệt', 'success');

        try {
          window.dispatchEvent(new CustomEvent('teflon-data-changed', {
            detail: { source: 'teflon-process-manager', action: 'save' }
          }));
        } catch (e) { console.warn(e); }

      } catch (err) {
        console.error('[TeflonProcessManager] QuickApprove error:', err);
        showToast('承認失敗 / Thất bại', 'error');
        alert(`エラー / Lỗi: ${err.message}`);
      } finally {
        isSaving = false;
      }
    },

    // Quick Send (承認済 → テフロン加工中)
    handleQuickSend: async function(item, companies, employees) {
      if (isSaving) return;
      const msg = '今日発送しますか？\n(供給会社ID:7へ発送)\nXác nhận gửi hôm nay?';
      if (!window.confirm(msg)) return;

      const dm = window.DataManager;
      const data = dm ? dm.data : {};
      const teflonlog = data.teflonlog || [];
      const moldId = String(item.MoldID).trim();
      const today = getTodayISO();
      const expectedDate = addBusinessDaysISO(today, 5);
      const newLogId = getNextTeflonLogID(data);
      const newShipId = getNextShipID(data);
      const nowIso = new Date().toISOString();

      // Get last log
      const historyForMold = buildTeflonHistory(teflonlog, item);
      const lastLog = historyForMold[0] || null;

      // Get current storage_company (FromCompanyID)
      const fromCompanyId = item.storage_company || '';

      const tefEntry = {
        TeflonLogID: newLogId,
        MoldID: moldId,
        TeflonStatus: statusKeyToLogStatus(TEFLON_STATUS_KEYS.processing),
        RequestedBy: lastLog ? lastLog.RequestedBy : DEFAULT_EMPLOYEE_ID,
        RequestedDate: lastLog ? lastLog.RequestedDate : today,
        SentBy: DEFAULT_EMPLOYEE_ID,
        SentDate: today,
        ExpectedDate: expectedDate,
        ReceivedDate: '',
        SupplierID: DEFAULT_SUPPLIER_ID,
        CoatingType: lastLog ? lastLog.CoatingType : '',
        Reason: lastLog ? lastLog.Reason : 'クイック発送',
        TeflonCost: lastLog ? lastLog.TeflonCost : '',
        Quality: '',
        TeflonNotes: 'クイック発送 / Quick send',
        CreatedDate: today,
        UpdatedBy: DEFAULT_EMPLOYEE_ID,
        UpdatedDate: today
      };

      // Shiplog entry
      const shipEntry = {
        ShipID: newShipId,
        MoldID: moldId,
        CutterID: '',
        FromCompanyID: fromCompanyId,
        ToCompanyID: DEFAULT_SUPPLIER_ID, // 7
        FromCompany: '',
        ToCompany: '',
        ShipDate: today,
        EmployeeID: DEFAULT_EMPLOYEE_ID,
        ShipNotes: 'テフロン加工へ発送',
        DateEntry: nowIso,
        CustomerID: '',
        ItemTypeID: '',
        ShipItemName: '',
        ShipItemType: '',
        ShipStatus: '',
        FrameID: '',
        OtherEquipID: '',
        WaterBaseID: '',
        handler: ''
      };

      // Statuslogs entry
      const statusEntry = {
        StatusLogID: '',
        MoldID: moldId,
        CutterID: '',
        ItemType: 'mold',
        Status: 'OUT',
        Timestamp: nowIso,
        EmployeeID: DEFAULT_EMPLOYEE_ID,
        DestinationID: DEFAULT_SUPPLIER_ID,
        Notes: 'テフロン加工へ発送',
        AuditDate: today,
        AuditType: 'TEFLON-SEND'
      };

      // Update molds.csv
      const updatePayload = {
        filename: 'molds.csv',
        itemIdField: 'MoldID',
        itemIdValue: moldId,
        updates: {
          storage_company: DEFAULT_SUPPLIER_ID,
          TeflonCoating: statusKeyToCoatingLabel(TEFLON_STATUS_KEYS.processing),
          TeflonSentDate: today,
          TeflonExpectedDate: expectedDate
        }
      };

      this.close();
      showToast('発送処理中... / Đang xử lý...', 'info');
      isSaving = true;

      try {
        // 1) teflonlog.csv
        const addRes = await fetch(API_ADD_LOG, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'teflonlog.csv',
            entry: tefEntry
          })
        });
        const addJson = await addRes.json();
        if (!addRes.ok || !addJson.success) {
          throw new Error(addJson.message || 'teflonlog書き込み失敗');
        }

        // 2) shiplog.csv
        try {
          const shipRes = await fetch(API_ADD_LOG, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: 'shiplog.csv',
              entry: shipEntry
            })
          });
          const shipJson = await shipRes.json();
          if (!shipRes.ok || !shipJson.success) {
            console.warn('[TeflonProcessManager] shiplog warning:', shipJson);
          }
        } catch (e) {
          console.warn('[TeflonProcessManager] shiplog error:', e);
        }

        // 3) statuslogs.csv
        try {
          const stRes = await fetch(API_ADD_LOG, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: 'statuslogs.csv',
              entry: statusEntry
            })
          });
          const stJson = await stRes.json();
          if (!stRes.ok || !stJson.success) {
            console.warn('[TeflonProcessManager] statuslogs warning:', stJson);
          }
        } catch (e) {
          console.warn('[TeflonProcessManager] statuslogs error:', e);
        }

        // 4) molds.csv
        try {
          const updRes = await fetch(API_UPDATE_ITEM, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
          });
          const updJson = await updRes.json();
          if (!updRes.ok || !updJson.success) {
            console.warn('[TeflonProcessManager] molds.csv warning:', updJson);
          }
        } catch (e) {
          console.warn('[TeflonProcessManager] molds.csv error:', e);
        }

        // 5) Update in-memory
        if (data) {
          if (Array.isArray(data.teflonlog)) data.teflonlog.unshift(tefEntry);
          if (Array.isArray(data.shiplog)) data.shiplog.unshift(shipEntry);
          if (Array.isArray(data.statuslogs)) data.statuslogs.unshift(statusEntry);
          if (Array.isArray(data.molds)) {
            const mold = data.molds.find(m => String(m.MoldID).trim() === moldId);
            if (mold) {
              mold.storage_company = updatePayload.updates.storage_company;
              mold.TeflonCoating = updatePayload.updates.TeflonCoating;
              mold.TeflonSentDate = updatePayload.updates.TeflonSentDate;
              mold.TeflonExpectedDate = updatePayload.updates.TeflonExpectedDate;
            }
          }
        }

        if (dm && typeof dm.recompute === 'function') {
          try { dm.recompute(); } catch (e) { console.warn(e); }
        }

        showToast('発送完了 / Đã gửi đi', 'success');

        try {
          window.dispatchEvent(new CustomEvent('teflon-data-changed', {
            detail: { source: 'teflon-process-manager', action: 'save' }
          }));
        } catch (e) { console.warn(e); }

      } catch (err) {
        console.error('[TeflonProcessManager] QuickSend error:', err);
        showToast('発送失敗 / Thất bại', 'error');
        alert(`エラー / Lỗi: ${err.message}`);
      } finally {
        isSaving = false;
      }
    },

    // Quick Complete (テフロン加工中 → 完了)
    handleQuickComplete: async function(item, companies, employees) {
      if (isSaving) return;
      const msg = '今日受領しますか？\nXác nhận nhận hôm nay?';
      if (!window.confirm(msg)) return;

      const dm = window.DataManager;
      const data = dm ? dm.data : {};
      const teflonlog = data.teflonlog || [];
      const shiplog = data.shiplog || [];
      const moldId = String(item.MoldID).trim();
      const today = getTodayISO();
      const nowIso = new Date().toISOString();

      const historyForMold = buildTeflonHistory(teflonlog, item);
      const lastLog = historyForMold[0] || null;
      const supplierId = lastLog ? lastLog.SupplierID : DEFAULT_SUPPLIER_ID;

      // Find original company from shiplog (FromCompanyID when ToCompanyID=7)
      let originalCompanyId = item.storage_company || '';
      const shipToTeflon = shiplog
        .filter(s => String(s.MoldID).trim() === moldId && String(s.ToCompanyID).trim() === DEFAULT_SUPPLIER_ID)
        .sort((a, b) => new Date(b.ShipDate || b.DateEntry).getTime() - new Date(a.ShipDate || a.DateEntry).getTime());
      if (shipToTeflon.length > 0) {
        originalCompanyId = shipToTeflon[0].FromCompanyID || originalCompanyId;
      }

      const newLogId = getNextTeflonLogID(data);
      const newShipId = getNextShipID(data);

      const tefEntry = {
        TeflonLogID: newLogId,
        MoldID: moldId,
        TeflonStatus: statusKeyToLogStatus(TEFLON_STATUS_KEYS.completed),
        RequestedBy: lastLog ? lastLog.RequestedBy : '',
        RequestedDate: lastLog ? lastLog.RequestedDate : '',
        SentBy: lastLog ? lastLog.SentBy : '',
        SentDate: lastLog ? lastLog.SentDate : '',
        ExpectedDate: lastLog ? lastLog.ExpectedDate : '',
        ReceivedDate: today,
        SupplierID: supplierId,
        CoatingType: lastLog ? lastLog.CoatingType : '',
        Reason: lastLog ? lastLog.Reason : '',
        TeflonCost: lastLog ? lastLog.TeflonCost : '',
        Quality: 'OK',
        TeflonNotes: 'クイック受領 / Quick receive',
        CreatedDate: today,
        UpdatedBy: '',
        UpdatedDate: today
      };

      // Shiplog entry (return)
      const shipEntry = {
        ShipID: newShipId,
        MoldID: moldId,
        CutterID: '',
        FromCompanyID: DEFAULT_SUPPLIER_ID,
        ToCompanyID: originalCompanyId,
        FromCompany: '',
        ToCompany: '',
        ShipDate: today,
        EmployeeID: '',
        ShipNotes: 'テフロン加工完了・返却',
        DateEntry: nowIso,
        CustomerID: '',
        ItemTypeID: '',
        ShipItemName: '',
        ShipItemType: '',
        ShipStatus: '',
        FrameID: '',
        OtherEquipID: '',
        WaterBaseID: '',
        handler: ''
      };

      // Statuslogs entry
      const statusEntry = {
        StatusLogID: '',
        MoldID: moldId,
        CutterID: '',
        ItemType: 'mold',
        Status: 'IN',
        Timestamp: nowIso,
        EmployeeID: '',
        DestinationID: originalCompanyId,
        Notes: 'テフロン加工完了・返却',
        AuditDate: today,
        AuditType: 'TEFLON-RETURN'
      };

      // Update molds.csv
      const updatePayload = {
        filename: 'molds.csv',
        itemIdField: 'MoldID',
        itemIdValue: moldId,
        updates: {
          storage_company: originalCompanyId,
          TeflonCoating: statusKeyToCoatingLabel(TEFLON_STATUS_KEYS.completed),
          TeflonReceivedDate: today,
          TeflonSentDate: lastLog ? lastLog.SentDate : '',
          TeflonExpectedDate: lastLog ? lastLog.ExpectedDate : ''
        }
      };

      this.close();
      showToast('受領処理中... / Đang xử lý...', 'info');
      isSaving = true;

      try {
        // 1) teflonlog.csv
        const addRes = await fetch(API_ADD_LOG, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'teflonlog.csv',
            entry: tefEntry
          })
        });
        const addJson = await addRes.json();
        if (!addRes.ok || !addJson.success) {
          throw new Error(addJson.message || 'teflonlog書き込み失敗');
        }

        // 2) shiplog.csv
        try {
          const shipRes = await fetch(API_ADD_LOG, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: 'shiplog.csv',
              entry: shipEntry
            })
          });
          const shipJson = await shipRes.json();
          if (!shipRes.ok || !shipJson.success) {
            console.warn('[TeflonProcessManager] shiplog warning:', shipJson);
          }
        } catch (e) {
          console.warn('[TeflonProcessManager] shiplog error:', e);
        }

        // 3) statuslogs.csv
        try {
          const stRes = await fetch(API_ADD_LOG, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: 'statuslogs.csv',
              entry: statusEntry
            })
          });
          const stJson = await stRes.json();
          if (!stRes.ok || !stJson.success) {
            console.warn('[TeflonProcessManager] statuslogs warning:', stJson);
          }
        } catch (e) {
          console.warn('[TeflonProcessManager] statuslogs error:', e);
        }

        // 4) molds.csv
        try {
          const updRes = await fetch(API_UPDATE_ITEM, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
          });
          const updJson = await updRes.json();
          if (!updRes.ok || !updJson.success) {
            console.warn('[TeflonProcessManager] molds.csv warning:', updJson);
          }
        } catch (e) {
          console.warn('[TeflonProcessManager] molds.csv error:', e);
        }

        // 5) Update in-memory
        if (data) {
          if (Array.isArray(data.teflonlog)) data.teflonlog.unshift(tefEntry);
          if (Array.isArray(data.shiplog)) data.shiplog.unshift(shipEntry);
          if (Array.isArray(data.statuslogs)) data.statuslogs.unshift(statusEntry);
          if (Array.isArray(data.molds)) {
            const mold = data.molds.find(m => String(m.MoldID).trim() === moldId);
            if (mold) {
              mold.storage_company = updatePayload.updates.storage_company;
              mold.TeflonCoating = updatePayload.updates.TeflonCoating;
              mold.TeflonReceivedDate = updatePayload.updates.TeflonReceivedDate;
              mold.TeflonSentDate = updatePayload.updates.TeflonSentDate;
              mold.TeflonExpectedDate = updatePayload.updates.TeflonExpectedDate;
            }
          }
        }

        if (dm && typeof dm.recompute === 'function') {
          try { dm.recompute(); } catch (e) { console.warn(e); }
        }

        // Dispatch event
        try {
          let updatedItem = item;
          if (Array.isArray(data.molds)) {
            const mold = data.molds.find(m => String(m.MoldID).trim() === moldId);
            if (mold) updatedItem = mold;
          }
          const detailEvt = new CustomEvent('detail-changed', {
            detail: { item: updatedItem, itemType: 'mold', itemId: moldId, source: 'teflon-quick' }
          });
          document.dispatchEvent(detailEvt);
        } catch (e) {
          console.warn('[TeflonProcessManager] dispatch error:', e);
        }

        showToast('受領完了 / Đã nhận về', 'success');

        try {
          window.dispatchEvent(new CustomEvent('teflon-data-changed', {
            detail: { source: 'teflon-process-manager', action: 'save' }
          }));
        } catch (e) { console.warn(e); }

        // Ask if user wants to update location
        const wantUpdateLocation = window.confirm('位置を更新しますか？ / Có muốn cập nhật vị trí mới không?');
        if (wantUpdateLocation) {
          if (window.LocationManager && typeof window.LocationManager.openModal === 'function') {
            let updatedItem = item;
            if (Array.isArray(data.molds)) {
              const mold = data.molds.find(m => String(m.MoldID).trim() === moldId);
              if (mold) updatedItem = mold;
            }
            window.LocationManager.openModal(updatedItem);
          } else {
            alert('Location module が利用できません。 / Location module chưa sẵn sàng.');
          }
        }

      } catch (err) {
        console.error('[TeflonProcessManager] QuickComplete error:', err);
        showToast('受領失敗 / Thất bại', 'error');
        alert(`エラー / Lỗi: ${err.message}`);
      } finally {
        isSaving = false;
      }
    },

    // ========== FULL FORM SUBMIT ==========
    handleFormSubmit: async function(item, companies, employees) {
      if (isSaving) return;

      const dm = window.DataManager;
      const data = dm ? dm.data : {};
      const teflonlog = data.teflonlog || [];
      const moldId = String(item.MoldID).trim();

      const statusEl = document.getElementById('tefproc-status');
      const supplierEl = document.getElementById('tefproc-supplier');
      const reqDateEl = document.getElementById('tefproc-request-date');
      const sentDateEl = document.getElementById('tefproc-sent-date');
      const expDateEl = document.getElementById('tefproc-expected-date');
      const recvDateEl = document.getElementById('tefproc-received-date');
      const reqEmpEl = document.getElementById('tefproc-request-emp');
      const sentEmpEl = document.getElementById('tefproc-sent-emp');
      const recvEmpEl = document.getElementById('tefproc-received-emp');
      const typeEl = document.getElementById('tefproc-coating-type');
      const reasonEl = document.getElementById('tefproc-reason');
      const costEl = document.getElementById('tefproc-cost');
      const qualityEl = document.getElementById('tefproc-quality');
      const notesEl = document.getElementById('tefproc-notes');

      const statusKey = statusEl ? statusEl.value : TEFLON_STATUS_KEYS.pending;
      const teflonStatus = statusKeyToLogStatus(statusKey);
      const supplierId = supplierEl ? supplierEl.value.trim() : DEFAULT_SUPPLIER_ID;
      const reqDate = reqDateEl ? reqDateEl.value : '';
      const sentDate = sentDateEl ? sentDateEl.value : '';
      const expDate = expDateEl ? expDateEl.value : '';
      const recvDate = recvDateEl ? recvDateEl.value : '';
      const reqEmpId = reqEmpEl ? reqEmpEl.value.trim() : '';
      const sentEmpId = sentEmpEl ? sentEmpEl.value.trim() : '';
      const recvEmpId = recvEmpEl ? recvEmpEl.value.trim() : '';
      const coatingType = typeEl ? typeEl.value.trim() : '';
      const reason = reasonEl ? reasonEl.value.trim() : '';
      const costNum = toNumber(costEl ? costEl.value : '');
      const quality = qualityEl ? qualityEl.value.trim() : '';
      const notes = notesEl ? notesEl.value.trim() : '';

      if (!supplierId) {
        alert('供給会社を選択してください。 / Vui lòng chọn nhà cung cấp.');
        if (supplierEl) supplierEl.focus();
        return;
      }

      // Validate based on status
      if (statusKey === TEFLON_STATUS_KEYS.processing && !sentDate) {
        alert('発送日を選択してください。 / Vui lòng chọn ngày gửi.');
        if (sentDateEl) sentDateEl.focus();
        return;
      }
      if (statusKey === TEFLON_STATUS_KEYS.completed && !recvDate) {
        alert('受領日を選択してください。 / Vui lòng chọn ngày nhận.');
        if (recvDateEl) recvDateEl.focus();
        return;
      }

      const newLogId = getNextTeflonLogID(data);
      const today = getTodayISO();

      const tefEntry = {
        TeflonLogID: newLogId,
        MoldID: moldId,
        TeflonStatus: teflonStatus,
        RequestedBy: reqEmpId,
        RequestedDate: reqDate || sentDate || today,
        SentBy: sentEmpId,
        SentDate: sentDate,
        ExpectedDate: expDate,
        ReceivedDate: recvDate,
        SupplierID: supplierId,
        CoatingType: coatingType,
        Reason: reason,
        TeflonCost: costNum !== null ? String(costNum) : '',
        Quality: quality,
        TeflonNotes: notes || 'フォーム登録 / Form register',
        CreatedDate: today,
        UpdatedBy: reqEmpId || sentEmpId,
        UpdatedDate: today
      };

      // Determine if need shiplog/statuslogs
      let needShip = false;
      let needStatus = false;
      if (statusKey === TEFLON_STATUS_KEYS.processing && sentDate) {
        needShip = true;
        needStatus = true;
      } else if (statusKey === TEFLON_STATUS_KEYS.completed && recvDate) {
        needShip = true;
        needStatus = true;
      }

      let shipEntry = null;
      let statusEntry = null;
      const nowIso = new Date().toISOString();

      if (needShip && statusKey === TEFLON_STATUS_KEYS.processing) {
        const fromCompanyId = item.storage_company || '';
        const newShipId = getNextShipID(data);
        shipEntry = {
          ShipID: newShipId,
          MoldID: moldId,
          CutterID: '',
          FromCompanyID: fromCompanyId,
          ToCompanyID: supplierId,
          FromCompany: '',
          ToCompany: '',
          ShipDate: sentDate,
          EmployeeID: sentEmpId,
          ShipNotes: 'テフロン加工へ発送',
          DateEntry: nowIso,
          CustomerID: '',
          ItemTypeID: '',
          ShipItemName: '',
          ShipItemType: '',
          ShipStatus: '',
          FrameID: '',
          OtherEquipID: '',
          WaterBaseID: '',
          handler: ''
        };
        statusEntry = {
          StatusLogID: '',
          MoldID: moldId,
          CutterID: '',
          ItemType: 'mold',
          Status: 'OUT',
          Timestamp: nowIso,
          EmployeeID: sentEmpId,
          DestinationID: supplierId,
          Notes: 'テフロン加工へ発送',
          AuditDate: sentDate || today,
          AuditType: 'TEFLON-SEND'
        };
      } else if (needShip && statusKey === TEFLON_STATUS_KEYS.completed) {
        const shiplog = data.shiplog || [];
        let originalCompanyId = item.storage_company || '';
        const shipToTeflon = shiplog
          .filter(s => String(s.MoldID).trim() === moldId && String(s.ToCompanyID).trim() === supplierId)
          .sort((a, b) => new Date(b.ShipDate || b.DateEntry).getTime() - new Date(a.ShipDate || a.DateEntry).getTime());
        if (shipToTeflon.length > 0) {
          originalCompanyId = shipToTeflon[0].FromCompanyID || originalCompanyId;
        }
        const newShipId = getNextShipID(data);
        shipEntry = {
          ShipID: newShipId,
          MoldID: moldId,
          CutterID: '',
          FromCompanyID: supplierId,
          ToCompanyID: originalCompanyId,
          FromCompany: '',
          ToCompany: '',
          ShipDate: recvDate,
          EmployeeID: recvEmpId,
          ShipNotes: 'テフロン加工完了・返却',
          DateEntry: nowIso,
          CustomerID: '',
          ItemTypeID: '',
          ShipItemName: '',
          ShipItemType: '',
          ShipStatus: '',
          FrameID: '',
          OtherEquipID: '',
          WaterBaseID: '',
          handler: ''
        };
        statusEntry = {
          StatusLogID: '',
          MoldID: moldId,
          CutterID: '',
          ItemType: 'mold',
          Status: 'IN',
          Timestamp: nowIso,
          EmployeeID: recvEmpId,
          DestinationID: originalCompanyId,
          Notes: 'テフロン加工完了・返却',
          AuditDate: recvDate || today,
          AuditType: 'TEFLON-RETURN'
        };
      }

      // Update molds.csv
      const updatePayload = {
        filename: 'molds.csv',
        itemIdField: 'MoldID',
        itemIdValue: moldId,
        updates: {
          TeflonCoating: statusKeyToCoatingLabel(statusKey)
        }
      };
      if (statusKey === TEFLON_STATUS_KEYS.processing && sentDate) {
        updatePayload.updates.storage_company = supplierId;
        updatePayload.updates.TeflonSentDate = sentDate;
        updatePayload.updates.TeflonExpectedDate = expDate;
      } else if (statusKey === TEFLON_STATUS_KEYS.completed && recvDate) {
        // Restore storage_company
        if (shipEntry && shipEntry.ToCompanyID) {
          updatePayload.updates.storage_company = shipEntry.ToCompanyID;
        }
        updatePayload.updates.TeflonReceivedDate = recvDate;
        updatePayload.updates.TeflonSentDate = sentDate;
        updatePayload.updates.TeflonExpectedDate = expDate;
      }

      const wantUpdateLocation = (statusKey === TEFLON_STATUS_KEYS.completed) ? 
        window.confirm('完了。位置を更新しますか？ / Mạ xong. Có muốn cập nhật vị trí mới không?') : false;

      this.close();
      showToast('登録中... / Đang lưu...', 'info');
      isSaving = true;

      try {
        // 1) teflonlog.csv
        const addRes = await fetch(API_ADD_LOG, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'teflonlog.csv',
            entry: tefEntry
          })
        });
        const addJson = await addRes.json();
        if (!addRes.ok || !addJson.success) {
          throw new Error(addJson.message || 'teflonlog書き込み失敗');
        }

        // 2) shiplog.csv (if needed)
        if (shipEntry) {
          try {
            const shipRes = await fetch(API_ADD_LOG, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filename: 'shiplog.csv',
                entry: shipEntry
              })
            });
            const shipJson = await shipRes.json();
            if (!shipRes.ok || !shipJson.success) {
              console.warn('[TeflonProcessManager] shiplog warning:', shipJson);
            }
          } catch (e) {
            console.warn('[TeflonProcessManager] shiplog error:', e);
          }
        }

        // 3) statuslogs.csv (if needed)
        if (statusEntry) {
          try {
            const stRes = await fetch(API_ADD_LOG, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filename: 'statuslogs.csv',
                entry: statusEntry
              })
            });
            const stJson = await stRes.json();
            if (!stRes.ok || !stJson.success) {
              console.warn('[TeflonProcessManager] statuslogs warning:', stJson);
            }
          } catch (e) {
            console.warn('[TeflonProcessManager] statuslogs error:', e);
          }
        }

        // 4) molds.csv
        try {
          const updRes = await fetch(API_UPDATE_ITEM, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
          });
          const updJson = await updRes.json();
          if (!updRes.ok || !updJson.success) {
            console.warn('[TeflonProcessManager] molds.csv warning:', updJson);
          }
        } catch (e) {
          console.warn('[TeflonProcessManager] molds.csv error:', e);
        }

        // 5) Update in-memory
        if (data) {
          if (Array.isArray(data.teflonlog)) data.teflonlog.unshift(tefEntry);
          if (shipEntry && Array.isArray(data.shiplog)) data.shiplog.unshift(shipEntry);
          if (statusEntry && Array.isArray(data.statuslogs)) data.statuslogs.unshift(statusEntry);
          if (Array.isArray(data.molds)) {
            const mold = data.molds.find(m => String(m.MoldID).trim() === moldId);
            if (mold) {
              Object.keys(updatePayload.updates).forEach(key => {
                mold[key] = updatePayload.updates[key];
              });
            }
          }
        }

        if (dm && typeof dm.recompute === 'function') {
          try { dm.recompute(); } catch (e) { console.warn(e); }
        }

        // Dispatch event
        try {
          let updatedItem = item;
          if (Array.isArray(data.molds)) {
            const mold = data.molds.find(m => String(m.MoldID).trim() === moldId);
            if (mold) updatedItem = mold;
          }
          const detailEvt = new CustomEvent('detail-changed', {
            detail: { item: updatedItem, itemType: 'mold', itemId: moldId, source: 'teflon-process' }
          });
          document.dispatchEvent(detailEvt);
        } catch (e) {
          console.warn('[TeflonProcessManager] dispatch error:', e);
        }

        showToast('登録完了 / Đã lưu thành công', 'success');

        try {
          window.dispatchEvent(new CustomEvent('teflon-data-changed', {
            detail: { source: 'teflon-process-manager', action: 'save' }
          }));
        } catch (e) { console.warn(e); }

        // Location update if needed
        if (wantUpdateLocation) {
          if (window.LocationManager && typeof window.LocationManager.openModal === 'function') {
            let updatedItem = item;
            if (Array.isArray(data.molds)) {
              const mold = data.molds.find(m => String(m.MoldID).trim() === moldId);
              if (mold) updatedItem = mold;
            }
            window.LocationManager.openModal(updatedItem);
          } else {
            alert('Location module が利用できません。 / Không mở được module vị trí.');
          }
        }

      } catch (err) {
        console.error('[TeflonProcessManager] FormSubmit error:', err);
        showToast('登録失敗 / Lưu thất bại', 'error');
        alert(`エラー / Lỗi: ${err.message}`);
      } finally {
        isSaving = false;
      }
    }
  };

  // ========== EXPORT ==========
  window.TeflonProcessManager = {
    version: 'r7.1.2',
    INIT: TeflonProcessManager.INIT.bind(TeflonProcessManager),
    open: TeflonProcessManager.open.bind(TeflonProcessManager),
    openPanel: TeflonProcessManager.openPanel.bind(TeflonProcessManager),
    close: TeflonProcessManager.close.bind(TeflonProcessManager)
  };

  // ========== AUTO INIT ==========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      window.TeflonProcessManager.INIT();
    });
  } else {
    window.TeflonProcessManager.INIT();
  }

  // ========== BRIDGE EVENTS ==========
  function bindTeflonOpenBridge() {
    if (window.tefProcOpenBridgeBound) return;
    window.tefProcOpenBridgeBound = true;

    window.addEventListener('teflon-open-process-manager', function(e) {
      try {
        const detail = e && e.detail ? e.detail : {};
        const moldId = detail.moldId || (detail.teflonRow ? detail.teflonRow.MoldID : null) || (detail.item ? detail.item.MoldID : null);
        if (!moldId && !detail.item) return;
        if (window.TeflonProcessManager && typeof window.TeflonProcessManager.open === 'function') {
          window.TeflonProcessManager.open({ 
            moldId: moldId, 
            item: detail.item || null, 
            teflonRow: detail.teflonRow || null, 
            source: detail.source || 'event' 
          });
        }
      } catch (err) {
        console.error('[TeflonProcessManager] open bridge error:', err);
      }
    });

    // Bridge listen 'triggerTeflon'
    document.addEventListener('triggerTeflon', function(e) {
      try {
        const detail = e.detail || {};
        const item = detail.item || detail;
        if (!item || !item.MoldID) {
          console.warn('[TeflonProcess] triggerTeflon without valid Mold item:', detail);
          return;
        }
        if (!window.TeflonProcessManager || typeof window.TeflonProcessManager.openPanel !== 'function') {
          console.warn('[TeflonProcess] TeflonProcessManager.openPanel not ready');
          return;
        }
        window.TeflonProcessManager.openPanel(item);
      } catch (err) {
        console.error('[TeflonProcess] Error handling triggerTeflon event:', err);
      }
    });
  }

  bindTeflonOpenBridge();

  console.log('[TeflonProcessManager r7.1.2] Module loaded - DELETE SUPPORT + SHIPLOG + LOCK/UNLOCK HISTORY');

})();

// END OF FILE - teflon-process-manager-r7.1.2.js

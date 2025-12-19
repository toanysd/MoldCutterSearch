/**
 * teflon-process-manager-r7.1.1.js
 * ==========================================================
 * Module nghiệp vụ mạ Teflon nâng cao - inspired by VBA workflow
 * テフロン加工依頼・完了処理モジュール（改良版）
 *
 * NEW in r7.1.1 (2025-12-14):
 * ✅ Added new status: 承認済(発送待ち) / Đã duyệt (chờ gửi)
 * ✅ Workflow updated: Pending(承認待ち) → Approved(発送待ち) → Sent(加工中) → Completed(加工済)
 * ✅ UI + Quick Actions + Validation updated accordingly
 *
 * Backend:
 * - POST {API_BASE}/api/add-log (teflonlog.csv, statuslogs.csv)
 * - POST {API_BASE}/api/update-item (molds.csv)
 * ==========================================================
 */

(function () {
  'use strict';

  const API_BASE = 'https://ysd-moldcutter-backend.onrender.com';
  const API_ADD_LOG = API_BASE + '/api/add-log';
  const API_UPDATE_ITEM = API_BASE + '/api/update-item';

  // Config
  const DEFAULT_SUPPLIER_ID = '7'; // ID=7: Nhà cung cấp Teflon mặc định
  const DEFAULT_EMPLOYEE_ID = '1'; // ID=1: Toàn (người gửi mặc định)

  let currentItem = null;
  let isSaving = false;

  // ============================
  // Teflon status mapping
  // ============================
  // UI label stored in molds.TeflonCoating (legacy) is Japanese label.
  const TEFLON_COATING_LABELS = {
    pending: 'テフロン加工承認待ち', // Chờ phê duyệt
    approved: '承認済(発送待ち)', // Đã duyệt (chờ gửi)
    sent: 'テフロン加工中', // Đang mạ
    completed: 'テフロン加工済' // Đã mạ xong
  };

  // Status stored in teflonlog.csv (TeflonStatus) is English keyword.
  const TEFLON_LOG_STATUS = {
    pending: 'Pending',
    approved: 'Approved',
    sent: 'Sent',
    completed: 'Completed'
  };

  function mapCoatingToStatusKey(coating) {
    const v = String(coating || '').trim();
    if (!v) return '';

    if (v === TEFLON_COATING_LABELS.pending) return 'pending';
    if (v === TEFLON_COATING_LABELS.approved) return 'approved';
    if (v === TEFLON_COATING_LABELS.sent) return 'sent';
    if (v === TEFLON_COATING_LABELS.completed) return 'completed';

    const lower = v.toLowerCase();
    if (lower === 'pending') return 'pending';
    if (lower === 'approved') return 'approved';
    if (lower === 'sent') return 'sent';
    if (lower === 'completed' || lower === 'coated') return 'completed';

    return '';
  }

  function statusKeyToCoatingLabel(key) {
    return TEFLON_COATING_LABELS[key] || '';
  }

  function statusKeyToLogStatus(key) {
    return TEFLON_LOG_STATUS[key] || '';
  }

  function logStatusToStatusKey(logStatus) {
    const v = String(logStatus || '').toLowerCase();
    if (v === 'pending') return 'pending';
    if (v === 'approved') return 'approved';
    if (v === 'sent') return 'sent';
    if (v === 'completed') return 'completed';
    return '';
  }

  function formatTeflonStatusDisplay(logStatusOrKey) {
    // Accept either log status (Pending/Sent/...) or key (pending/sent/...)
    const key = (function () {
      const k1 = String(logStatusOrKey || '').trim();
      if (!k1) return '';
      // if already a key
      if (TEFLON_COATING_LABELS[k1]) return k1;
      // else treat as log status
      return logStatusToStatusKey(k1);
    })();

    if (!key) return String(logStatusOrKey || '');

    if (key === 'pending') return 'テフロン加工承認待ち / Chờ phê duyệt';
    if (key === 'approved') return '承認済(発送待ち) / Đã duyệt (chờ gửi)';
    if (key === 'sent') return 'テフロン加工中 / Đang mạ';
    if (key === 'completed') return 'テフロン加工済 / Đã mạ xong';
    return String(logStatusOrKey || '');
  }

  // ============================
  // Helper: Cộng ngày làm việc (bỏ thứ 7, chủ nhật)
  // ============================
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

  // ============================
  // Helper: Vuốt để đóng panel (mobile)
  // ============================
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
      modalEl.style.transform = 'translateY(' + translateY + 'px)';
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

  // ============================
  // Helpers chung
  // ============================
  function fmtDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }

  function getTodayISO() {
    return new Date().toISOString().split('T')[0];
  }

  function toNumber(str) {
    const n = parseFloat(String(str || '').replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(message, type) {
    const existing = document.getElementById('tefproc-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'tefproc-toast';
    toast.className = 'tefproc-toast tefproc-toast-' + (type || 'info');
    toast.textContent = message;

    Object.assign(toast.style, {
      position: 'fixed',
      left: '50%',
      bottom: '80px',
      transform: 'translateX(-50%)',
      background:
        type === 'error'
          ? '#dc2626'
          : type === 'success'
            ? '#16a34a'
            : '#4b5563',
      color: '#fff',
      padding: '10px 16px',
      borderRadius: '999px',
      fontSize: '13px',
      fontWeight: '600',
      zIndex: 10050,
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      maxWidth: '90%',
      textAlign: 'center',
      pointerEvents: 'none',
      opacity: '1',
      transition: 'opacity 0.3s'
    });

    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
    }, 2000);

    setTimeout(() => {
      toast.remove();
    }, 2600);
  }

  function getCompanyName(companyId, companies) {
    if (!companyId) return '';
    const list = companies || [];
    const c = list.find((x) => String(x.CompanyID).trim() === String(companyId).trim());
    if (!c) return String(companyId);

    const shortName = c.CompanyShortName || '';
    const fullName = c.CompanyName || c.Name || '';
    return shortName || fullName || String(companyId);
  }

  function getEmployeeName(empId, employees) {
    if (!empId) return '';
    const list = employees || [];
    const e = list.find((x) => String(x.EmployeeID).trim() === String(empId).trim());
    if (!e) return String(empId);
    return e.EmployeeNameShort || e.EmployeeName || e.name || String(empId);
  }

  function buildTeflonHistory(allLogs, mold) {
    if (!Array.isArray(allLogs) || !mold || !mold.MoldID) return [];
    const moldId = String(mold.MoldID).trim();

    const logs = allLogs.filter((row) => String(row.MoldID).trim() === moldId);
    logs.sort((a, b) => {
      const da = new Date(a.SentDate || a.RequestedDate || a.CreatedDate || '').getTime();
      const db = new Date(b.SentDate || b.RequestedDate || b.CreatedDate || '').getTime();
      return db - da;
    });
    return logs;
  }

  function renderHistoryTable(logs, companies, employees) {
    if (!logs || logs.length === 0) {
      return '<div class="no-history">まだテフロン加工履歴がありません。<br>Chưa có lịch sử mạ Teflon.</div>';
    }

    const rows = logs
      .map((l) => {
        const statusDisp = formatTeflonStatusDisplay(l.TeflonStatus || '');
        const reqDate = fmtDate(l.RequestedDate);
        const sentDate = fmtDate(l.SentDate);
        const recvDate = fmtDate(l.ReceivedDate);
        const supplier = getCompanyName(l.SupplierID, companies);
        const reqBy = getEmployeeName(l.RequestedBy, employees);
        const sentBy = getEmployeeName(l.SentBy, employees);
        const quality = l.Quality || '';
        const notes = l.TeflonNotes || l.Reason || '';

        return (
          '<tr>' +
          '<td>' + escapeHtml(statusDisp) + '</td>' +
          '<td>' + escapeHtml(reqDate) + '</td>' +
          '<td>' + escapeHtml(sentDate) + '</td>' +
          '<td>' + escapeHtml(recvDate) + '</td>' +
          '<td>' + escapeHtml(supplier) + '</td>' +
          '<td>' + escapeHtml(reqBy) + '</td>' +
          '<td>' + escapeHtml(sentBy) + '</td>' +
          '<td>' + escapeHtml(quality) + '</td>' +
          '<td class="note-cell">' + escapeHtml(notes) + '</td>' +
          '</tr>'
        );
      })
      .join('');

    return (
      '<table class="history-table tefproc-his">' +
      '<thead><tr>' +
      '<th>ステータス<br>Status</th>' +
      '<th>依頼日<br>Ngày yêu cầu</th>' +
      '<th>出荷日<br>Ngày gửi</th>' +
      '<th>受入日<br>Ngày nhận</th>' +
      '<th>業者<br>Nhà cung cấp</th>' +
      '<th>依頼者<br>Người yêu cầu</th>' +
      '<th>出荷担当<br>Người gửi</th>' +
      '<th>品質<br>Chất lượng</th>' +
      '<th>メモ<br>Ghi chú</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody></table>'
    );
  }

  function getNextTeflonLogId(dmData) {
    const list = (dmData && Array.isArray(dmData.teflonlog) && dmData.teflonlog) || [];
    if (!list.length) return '1';

    const maxId = list
      .map((r) => parseInt(r.TeflonLogID, 10))
      .filter((n) => !isNaN(n))
      .reduce((max, n) => (n > max ? n : max), 0);

    return String(maxId + 1);
  }

  // ============================
  // Migration Helper
  // ============================
  function checkMigrationNeeded(item, teflonlog) {
    if (!item || !item.MoldID) return null;

    const moldId = String(item.MoldID).trim();
    const coating = item.TeflonCoating || '';
    if (!coating) return null;

    const existingLogs = buildTeflonHistory(teflonlog || [], item);
    if (existingLogs.length > 0) return null;

    const statusKey = mapCoatingToStatusKey(coating);
    return {
      moldId: moldId,
      coating: coating,
      statusKey: statusKey,
      sentDate: item.TeflonSentDate || '',
      receivedDate: item.TeflonReceivedDate || '',
      expectedDate: item.TeflonExpectedDate || ''
    };
  }

  async function promptMigration(migrationData, item) {
    const msg =
      '【データ移行確認 / Xác nhận chuyển dữ liệu】\n\n' +
      'このコンテンツには旧形式のテフロン情報が検出されました。\n' +
      'Phát hiện dữ liệu mạ Teflon cũ trong bảng molds.\n\n' +
      '現在の状態: ' + migrationData.coating + '\n' +
      '送信日: ' + (migrationData.sentDate || '-') + '\n' +
      '受入日: ' + (migrationData.receivedDate || '-') + '\n\n' +
      '旧データからテフロン依頼フォームに値をコピーしますか？\n' +
      'Có muốn chuyển sang bảng lịch sử mới (teflonlog) không?';

    const confirmed = window.confirm(msg);
    if (!confirmed) return false;

    const dm = window.DataManager;
    const data = (dm && dm.data) || {};
    const today = getTodayISO();
    const newLogId = getNextTeflonLogId(data);

    const tefEntry = {
      TeflonLogID: newLogId,
      MoldID: migrationData.moldId,
      TeflonStatus: statusKeyToLogStatus(migrationData.statusKey) || 'Completed',
      RequestedBy: '',
      RequestedDate: migrationData.sentDate || today,
      SentBy: '',
      SentDate: migrationData.sentDate || '',
      ExpectedDate: migrationData.expectedDate || '',
      ReceivedDate: migrationData.receivedDate || '',
      SupplierID: DEFAULT_SUPPLIER_ID,
      CoatingType: '',
      Reason: 'データ移行 / Migration from old format',
      TeflonCost: '',
      Quality: '',
      TeflonNotes: 'Auto-migrated from molds.TeflonCoating',
      CreatedDate: today,
      UpdatedBy: '',
      UpdatedDate: today
    };

    try {
      const addRes = await fetch(API_ADD_LOG, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: 'teflonlog.csv', entry: tefEntry })
      });
      const addJson = await addRes.json();
      if (!addRes.ok || !addJson.success) {
        throw new Error(addJson.message || 'Migration failed');
      }

      if (data && !Array.isArray(data.teflonlog)) data.teflonlog = [];
      if (data) data.teflonlog.unshift(tefEntry);

      showToast('データ移行完了 / Migration thành công', 'success');
      return true;
    } catch (err) {
      console.error('[Migration] Error:', err);
      showToast('Migration lỗi / 移行エラー', 'error');
      return false;
    }
  }

  // ============================
  // Smart Auto-fill Logic
  // ============================
  function determineNextStatus(currentStatusKey) {
    // Workflow: empty -> pending -> approved -> sent -> completed
    if (!currentStatusKey || currentStatusKey === '') return 'pending';
    if (currentStatusKey === 'pending') return 'approved';
    if (currentStatusKey === 'approved') return 'sent';
    if (currentStatusKey === 'sent') return 'completed';
    return 'completed';
  }

  function getWorkflowHint(currentStatusKey) {
    if (!currentStatusKey) {
      return '次のステップ: 加工依頼を作成 / Tạo yêu cầu mạ';
    }
    if (currentStatusKey === 'pending') {
      return '次のステップ: 承認登録（発送待ち） / Xác nhận đã duyệt (chờ gửi)';
    }
    if (currentStatusKey === 'approved') {
      return '次のステップ: 出荷確認 / Xác nhận gửi đi';
    }
    if (currentStatusKey === 'sent') {
      return '次のステップ: 受入確認 / Xác nhận đã nhận';
    }
    return '完了済み / Đã hoàn tất';
  }

  // ============================
  // TeflonProcessManager
  // ============================
  const TeflonProcessManager = {
    INIT() {
      console.log('TeflonProcessManager r7.1.1 loaded (VBA-inspired workflow + Approved state)');
    },

    open: function (arg) {
      // Support:
      // - open("5686")
      // - open({ moldId: "5686" })
      // - open({ item: { MoldID: "5686", ... } })
      // - open({ teflonRow: { MoldID: "5686", ... } })
      let item = null;
      let moldId = null;

      if (arg && typeof arg === 'object') {
        item = arg.item || null;
        moldId =
          arg.moldId ||
          (arg.teflonRow && arg.teflonRow.MoldID) ||
          (item && item.MoldID) ||
          null;
      } else {
        moldId = arg;
      }

      if (!item && moldId != null) {
        const dm = (window.DataManager && window.DataManager.data) ? window.DataManager.data : null;
        if (dm && Array.isArray(dm.molds)) {
          item = dm.molds.find(m => String(m.MoldID).trim() === String(moldId).trim()) || null;
        }
      }

      if (!item && moldId != null) item = { MoldID: String(moldId) };

      return this.openPanel(item);
    },


    async openPanel(item) {
      if (!item) {
        alert('Vui lòng chọn khuôn trước.\n金型を先に選択してください。');
        return;
      }

      currentItem = item;

      const dm = window.DataManager;
      const data = (dm && dm.data) || {};
      const companies = data.companies || [];
      const employees = data.employees || [];
      const teflonlog = data.teflonlog || [];

      if (!item.MoldID) {
        alert('Module này chỉ hỗ trợ khuôn (Mold).\nこのモジュールは金型のみ対応しています。');
        return;
      }

      // Migration check
      const migrationData = checkMigrationNeeded(item, teflonlog);
      if (migrationData) {
        const migrated = await promptMigration(migrationData, item);
        if (migrated) {
          if (dm && typeof dm.recompute === 'function') {
            dm.recompute();
          }
        }
      }

      const existing = document.getElementById('tefproc-panel');
      if (existing) existing.remove();

      const upper = document.querySelector('.upper-section');
      if (!upper) {
        console.error('[TeflonProcessManager] upper-section not found');
        return;
      }

      const isMobile = window.innerWidth <= 767;
      if (isMobile) document.body.classList.add('modal-open');

      const moldId = String(item.MoldID);
      const moldName = item.MoldName || '';
      const moldCode = item.MoldCode || '';
      const rackLayer = item.RackLayerName || item.RackLayerID || '';
      const storageCompanyId =
        item.storageCompanyId || item.storage_company || item.storage_companyId || '';
      const storageCompanyName = getCompanyName(storageCompanyId, companies);

      const historyLogs = buildTeflonHistory(teflonlog, item);
      const today = getTodayISO();

      // Determine current status
      let currentStatusKey = '';
      if (historyLogs.length > 0) {
        currentStatusKey = logStatusToStatusKey(historyLogs[0].TeflonStatus);
      }
      if (!currentStatusKey) {
        currentStatusKey = mapCoatingToStatusKey(item.TeflonCoating);
      }

      const nextStatusKey = determineNextStatus(currentStatusKey);
      const workflowHint = getWorkflowHint(currentStatusKey);

      const currentStatusHTML = this._buildCurrentStatusDisplay(currentStatusKey, historyLogs);
      const quickActionsHTML = this._buildQuickActions(currentStatusKey, nextStatusKey);

      const html =
        '<div class="checkio-panel tefproc-panel" id="tefproc-panel">' +
        ' <div class="checkio-header">' +
        '  <div class="checkio-mode">' +
        '   <button type="button" class="mode-btn active" data-mode="send" style="cursor:default;">' +
        '    テフロン加工依頼<br>Gửi/Đăng ký' +
        '   </button>' +
        '   <button type="button" class="mode-btn" data-mode="complete">' +
        '    加工完了の確認<br>Xác nhận hoàn tất' +
        '   </button>' +
        '  </div>' +
        '  <button class="btn-close-compact" id="tefproc-close" title="閉じる / Đóng">✕</button>' +
        ' </div>' +
        ' <div class="checkio-body tefproc-body">' +

        currentStatusHTML +
        quickActionsHTML +

        '  <section class="cio-inputs tefproc-inputs" data-mode="send">' +
        '   <h4>テフロン加工依頼 / Đăng ký trạng thái mạ</h4>' +
        '   <div class="workflow-hint" style="background:#eff6ff;border-left:3px solid #3b82f6;padding:8px 12px;margin-bottom:12px;font-size:13px;color:#1e40af;">' +
        '    💡 ' + escapeHtml(workflowHint) +
        '   </div>' +

        '   <div class="form-group">' +
        '    <label class="form-label">テフロン加工状態 / Trạng thái</label>' +
        '    <select id="tefproc-status" class="form-control">' +
        '     <option value="pending">テフロン加工承認待ち / Chờ phê duyệt</option>' +
        '     <option value="approved">承認済(発送待ち) / Đã duyệt (chờ gửi)</option>' +
        '     <option value="sent">テフロン加工中 / Đã gửi (đang mạ)</option>' +
        '    </select>' +
        '    <div id="tefproc-status-pill" class="tefproc-status-pill" style="margin-top:4px; font-size:12px;"></div>' +
        '   </div>' +

        '   <div class="form-group">' +
        '    <label class="form-label">業者 / Nhà cung cấp</label>' +
        '    <select id="tefproc-supplier" class="form-control">' +
        this._buildCompanyOptions(companies, DEFAULT_SUPPLIER_ID) +
        '    </select>' +
        '   </div>' +

        '   <div class="form-group">' +
        '    <label class="form-label">依頼日 / Ngày yêu cầu</label>' +
        '    <input type="date" id="tefproc-request-date" class="form-control" value="' + today + '">' +
        '   </div>' +

        '   <div class="form-group">' +
        '    <label class="form-label">出荷日 / Ngày gửi</label>' +
        '    <input type="date" id="tefproc-sent-date" class="form-control" value="">' +
        '   </div>' +

        '   <div class="form-group">' +
        '    <label class="form-label">受入予定日 / Ngày dự kiến nhận</label>' +
        '    <input type="date" id="tefproc-expected-date" class="form-control">' +
        '   </div>' +

        '   <div class="form-group">' +
        '    <label class="form-label">依頼者 / Người yêu cầu</label>' +
        '    <select id="tefproc-request-emp" class="form-control">' +
        this._buildEmployeeOptions(employees) +
        '    </select>' +
        '   </div>' +

        '   <div class="form-group">' +
        '    <label class="form-label">出荷担当 / Người gửi</label>' +
        '    <select id="tefproc-sent-emp" class="form-control">' +
        this._buildEmployeeOptions(employees, DEFAULT_EMPLOYEE_ID) +
        '    </select>' +
        '   </div>' +

        '   <div class="form-group">' +
        '    <label class="form-label">加工種別 / Loại mạ</label>' +
        '    <input type="text" id="tefproc-coating-type" class="form-control" placeholder="Ví dụ: Full Teflon, Partial...">' +
        '   </div>' +

        '   <div class="form-group">' +
        '    <label class="form-label">理由 / Lý do</label>' +
        '    <input type="text" id="tefproc-reason" class="form-control" placeholder="Lý do mạ lại, yêu cầu khách hàng...">' +
        '   </div>' +

        '   <div class="form-group">' +
        '    <label class="form-label">費用 / Chi phí (JPY)</label>' +
        '    <input type="number" id="tefproc-cost" class="form-control" min="0" step="1">' +
        '   </div>' +

        '   <div class="form-group">' +
        '    <label class="form-label">メモ / Ghi chú</label>' +
        '    <textarea id="tefproc-notes" class="form-control" rows="2" placeholder="Ghi chú thêm về lần mạ này..."></textarea>' +
        '   </div>' +

        '   <div class="btn-row">' +
        '    <button type="button" class="btn-cancel" id="tefproc-cancel-send">キャンセル / Hủy</button>' +
        '    <button type="button" class="btn-confirm" id="tefproc-save-send">確認・保存 / Lưu</button>' +
        '   </div>' +
        '  </section>' +

        '  <section class="cio-inputs tefproc-inputs" data-mode="complete" style="display:none;">' +
        '   <h4>加工完了の登録 / Xác nhận đã mạ xong</h4>' +
        '   <div class="form-group">' +
        '    <label class="form-label">受入日 / Ngày nhận khuôn</label>' +
        '    <input type="date" id="tefproc-received-date" class="form-control" value="' + today + '">' +
        '   </div>' +
        '   <div class="form-group">' +
        '    <label class="form-label">確認者 / Người xác nhận</label>' +
        '    <select id="tefproc-received-emp" class="form-control">' +
        this._buildEmployeeOptions(employees) +
        '    </select>' +
        '   </div>' +
        '   <div class="form-group">' +
        '    <label class="form-label">品質 / Chất lượng</label>' +
        '    <input type="text" id="tefproc-quality" class="form-control" placeholder="OK / NG / Ghi chú chất lượng...">' +
        '   </div>' +
        '   <div class="form-group">' +
        '    <label class="form-label">メモ / Ghi chú</label>' +
        '    <textarea id="tefproc-complete-notes" class="form-control" rows="2" placeholder="Ghi chú sau mạ (nếu có)..."></textarea>' +
        '   </div>' +
        '   <div class="btn-row">' +
        '    <button type="button" class="btn-secondary" id="tefproc-update-location">位置更新 / Cập nhật vị trí</button>' +
        '    <button type="button" class="btn-confirm" id="tefproc-confirm-complete">加工完了を登録 / Xác nhận</button>' +
        '   </div>' +
        '   <p class="note-small">' +
        '    ※ 完了登録後、statuslogs.csv に CHECKIN を記録し、molds.csv のテフロン状態を更新します。<br>' +
        '    Sau khi xác nhận, hệ thống sẽ ghi CHECKIN (IN) vào statuslogs.csv và cập nhật trạng thái Teflon trong molds.csv.' +
        '   </p>' +
        '  </section>' +

        '  <section class="cio-status tefproc-status">' +
        '   <h4>金型情報 / Thông tin khuôn</h4>' +
        '   <div class="status-badges">' +
        '    <div class="badge-row"><span class="badge-label">ID</span><div class="badge badge-mold">' + escapeHtml(moldId) + '</div></div>' +
        '    <div class="badge-row"><span class="badge-label">コード / Mã</span><div class="badge badge-mold-code">' + escapeHtml(moldCode) + '</div></div>' +
        '    <div class="badge-row"><span class="badge-label">名称 / Tên</span><div class="badge badge-mold-name">' + escapeHtml(moldName) + '</div></div>' +
        '    <div class="badge-row"><span class="badge-label">現在の保管先 / Công ty</span><div class="badge badge-company">' + escapeHtml(storageCompanyName || '-') + '</div></div>' +
        '    <div class="badge-row"><span class="badge-label">ラック位置 / Vị trí</span><div class="badge badge-rack">' + escapeHtml(rackLayer || '-') + '</div></div>' +
        '   </div>' +
        '  </section>' +

        '  <section class="cio-history tefproc-history">' +
        '   <h4>テフロン加工履歴 / Lịch sử mạ Teflon</h4>' +
        '   <div class="history-wrap" id="tefproc-history-wrap">' +
        renderHistoryTable(historyLogs, companies, employees) +
        '   </div>' +
        '  </section>' +

        ' </div>' +
        ' <div class="tefproc-bottom-bar">' +
        '  <button type="button" id="tefproc-bottom-close" class="btn-cancel">閉じる / Đóng</button>' +
        ' </div>' +
        '</div>';

      upper.insertAdjacentHTML('beforeend', html);

      this._applySmartAutoFill(currentStatusKey, nextStatusKey, historyLogs);
      this._bindEvents(item, companies, employees, teflonlog, currentStatusKey, nextStatusKey);
    },

    _buildCurrentStatusDisplay(currentStatusKey, historyLogs) {
      if (!currentStatusKey || currentStatusKey === '') {
        return (
          '<section class="tefproc-current-status" style="background:#f3f4f6;border:2px solid #d1d5db;border-radius:8px;padding:16px;margin-bottom:16px;">' +
          ' <h4 style="margin:0 0 8px 0;font-size:14px;color:#6b7280;">📋 現在の状態 / Trạng thái hiện tại</h4>' +
          ' <div class="status-badge status-empty" style="display:inline-block;padding:8px 16px;border-radius:6px;font-weight:600;background:#f3f4f6;color:#6b7280;border:1px dashed #9ca3af;">' +
          '  未処理 / Chưa xử lý' +
          ' </div>' +
          ' <p style="margin:8px 0 0 0;font-size:12px;color:#6b7280;">この金型はまだテフロン工程に入っていません。<br>Khuôn này chưa vào quy trình mạ Teflon.</p>' +
          '</section>'
        );
      }

      const lastLog = historyLogs[0] || null;

      let statusBgColor = '#f3f4f6';
      let statusTextColor = '#6b7280';
      let statusBorderColor = '#d1d5db';
      let statusIcon = '📋';
      let statusLabel = '';
      let statusDescription = '';
      let dateInfo = '';

      if (currentStatusKey === 'pending') {
        statusBgColor = '#fef3c7';
        statusTextColor = '#92400e';
        statusBorderColor = '#fbbf24';
        statusIcon = '⏳';
        statusLabel = 'テフロン加工承認待ち / Chờ phê duyệt';
        statusDescription = '承認待ちの状態です。<br>Khuôn đang chờ phê duyệt.';
        if (lastLog && lastLog.RequestedDate) {
          dateInfo = '依頼日 / Ngày yêu cầu: <strong>' + fmtDate(lastLog.RequestedDate) + '</strong>';
        }
      } else if (currentStatusKey === 'approved') {
        statusBgColor = '#ffedd5';
        statusTextColor = '#9a3412';
        statusBorderColor = '#fb923c';
        statusIcon = '🟠';
        statusLabel = '承認済(発送待ち) / Đã duyệt (chờ gửi)';
        statusDescription = '承認済みで、出荷待ちです。<br>Đã duyệt và đang chờ gửi đi.';
        if (lastLog && lastLog.RequestedDate) {
          dateInfo = '承認日(依頼日) / Ngày duyệt (ngày ghi nhận): <strong>' + fmtDate(lastLog.RequestedDate) + '</strong>';
        }
      } else if (currentStatusKey === 'sent') {
        statusBgColor = '#dbeafe';
        statusTextColor = '#1e40af';
        statusBorderColor = '#3b82f6';
        statusIcon = '🚚';
        statusLabel = 'テフロン加工中 / Đang mạ Teflon';
        statusDescription = '業者で加工中です。<br>Khuôn đang được mạ tại nhà cung cấp.';
        if (lastLog) {
          const sentDate = lastLog.SentDate ? fmtDate(lastLog.SentDate) : '-';
          const expDate = lastLog.ExpectedDate ? fmtDate(lastLog.ExpectedDate) : '-';
          dateInfo =
            '出荷日 / Ngày gửi: <strong>' + sentDate + '</strong><br>' +
            '受入予定日 / Ngày dự kiến: <strong>' + expDate + '</strong>';
        }
      } else if (currentStatusKey === 'completed') {
        statusBgColor = '#d1fae5';
        statusTextColor = '#065f46';
        statusBorderColor = '#10b981';
        statusIcon = '✅';
        statusLabel = 'テフロン加工済 / Đã mạ xong';
        statusDescription = '加工完了です。<br>Khuôn đã mạ hoàn tất.';
        if (lastLog) {
          const recvDate = lastLog.ReceivedDate ? fmtDate(lastLog.ReceivedDate) : '-';
          const quality = lastLog.Quality ? escapeHtml(lastLog.Quality) : '-';
          dateInfo =
            '受入日 / Ngày nhận: <strong>' + recvDate + '</strong><br>' +
            '品質 / Chất lượng: <strong>' + quality + '</strong>';
        }
      }

      return (
        '<section class="tefproc-current-status" style="background:' + statusBgColor + ';border:2px solid ' + statusBorderColor + ';border-radius:8px;padding:16px;margin-bottom:16px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">' +
        ' <h4 style="margin:0 0 8px 0;font-size:14px;color:' + statusTextColor + ';">📋 現在の状態 / Trạng thái hiện tại</h4>' +
        ' <div class="status-badge" style="display:inline-block;padding:10px 20px;border-radius:6px;font-weight:700;font-size:15px;background:#fff;color:' + statusTextColor + ';border:2px solid ' + statusBorderColor + ';margin-bottom:8px;">' +
        '  ' + statusIcon + ' ' + statusLabel +
        ' </div>' +
        ' <p style="margin:8px 0 0 0;font-size:12px;color:' + statusTextColor + ';line-height:1.5;">' + statusDescription + '</p>' +
        (dateInfo
          ? '<div style="margin-top:8px;padding:8px;background:rgba(255,255,255,0.6);border-radius:4px;font-size:12px;color:' + statusTextColor + ';">' + dateInfo + '</div>'
          : ''
        ) +
        '</section>'
      );
    },

    _buildQuickActions(currentStatusKey) {
      if (!currentStatusKey || currentStatusKey === '') return '';
      if (currentStatusKey === 'completed') return '';

      let html =
        '<section class="tefproc-quick-actions" style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;margin-bottom:16px;">' +
        '<h4 style="margin:0 0 8px 0;font-size:14px;color:#166534;">⚡ クイックアクション / Quick Actions</h4>';

      if (currentStatusKey === 'pending') {
        html +=
          '<button type="button" id="tefproc-quick-approve" class="btn-quick" ' +
          'style="width:100%;background:#fb923c;color:#fff;border:none;padding:10px;border-radius:6px;font-weight:600;cursor:pointer;">' +
          '🟠 承認済(発送待ち)にする / Chuyển sang “Đã duyệt (chờ gửi)”' +
          '</button>';
      } else if (currentStatusKey === 'approved') {
        html +=
          '<button type="button" id="tefproc-quick-send" class="btn-quick" ' +
          'style="width:100%;background:#10b981;color:#fff;border:none;padding:10px;border-radius:6px;font-weight:600;cursor:pointer;">' +
          '📦 今日出荷確認 / Xác nhận gửi đi hôm nay' +
          '</button>';
      } else if (currentStatusKey === 'sent') {
        html +=
          '<button type="button" id="tefproc-quick-complete" class="btn-quick" ' +
          'style="width:100%;background:#3b82f6;color:#fff;border:none;padding:10px;border-radius:6px;font-weight:600;cursor:pointer;">' +
          '✅ 受入完了確認 / Xác nhận đã nhận hôm nay' +
          '</button>';
      }

      html += '</section>';
      return html;
    },

    _applySmartAutoFill(currentStatusKey, nextStatusKey, historyLogs) {
      const statusSelect = document.getElementById('tefproc-status');
      const statusPill = document.getElementById('tefproc-status-pill');
      const sentDateEl = document.getElementById('tefproc-sent-date');
      const expDateEl = document.getElementById('tefproc-expected-date');
      const sentEmpEl = document.getElementById('tefproc-sent-emp');

      const today = getTodayISO();

      if (!currentStatusKey || currentStatusKey === '') {
        if (statusSelect) statusSelect.value = 'pending';
      } else if (currentStatusKey === 'pending') {
        // Pending -> default to Approved (waiting ship)
        if (statusSelect) statusSelect.value = 'approved';
        // Do not autofill shipping dates here
      } else if (currentStatusKey === 'approved') {
        // Approved -> default to Sent (shipping today)
        if (statusSelect) statusSelect.value = 'sent';
        if (sentDateEl) sentDateEl.value = today;
        if (expDateEl) expDateEl.value = addBusinessDaysISO(today, 5);
        if (sentEmpEl) sentEmpEl.value = DEFAULT_EMPLOYEE_ID;
      } else if (currentStatusKey === 'sent') {
        // user will go to complete tab manually
      }

      if (statusSelect && statusPill) {
        const key = statusSelect.value;
        const label = statusKeyToCoatingLabel(key) || '';
        statusPill.textContent = label;
        statusPill.setAttribute('data-status', key);
      }
    },

    close() {
      const panel = document.getElementById('tefproc-panel');
      if (panel) panel.remove();

      if (document.body.classList.contains('modal-open')) {
        const anyPanel =
          document.getElementById('ship-panel') ||
          document.getElementById('cio-panel') ||
          document.getElementById('loc-panel');

        if (!anyPanel) document.body.classList.remove('modal-open');
      }
    },

    _buildCompanyOptions(companies, defaultId) {
      const list = companies || [];
      let opts = '<option value="">-- Chọn / 選択 --</option>';

      list.forEach((c) => {
        const id = String(c.CompanyID || '').trim();
        if (!id) return;
        const shortName = c.CompanyShortName || '';
        const fullName = c.CompanyName || c.Name || '';
        const text = (shortName ? shortName + ' / ' : '') + fullName + ' (ID:' + id + ')';
        const selected = defaultId && id === String(defaultId).trim() ? ' selected' : '';
        opts += '<option value="' + escapeHtml(id) + '"' + selected + '>' + escapeHtml(text) + '</option>';
      });

      return opts;
    },

    _buildEmployeeOptions(employees, defaultId) {
      const list = employees || [];
      let opts = '<option value="">-- Chọn / 選択 --</option>';

      list.forEach((e) => {
        const id = String(e.EmployeeID || '').trim();
        if (!id) return;
        const name = e.EmployeeNameShort || e.EmployeeName || e.name || id;
        const selected = defaultId && id === String(defaultId).trim() ? ' selected' : '';
        opts += '<option value="' + escapeHtml(id) + '"' + selected + '>' + escapeHtml(name) + '</option>';
      });

      return opts;
    },

    _bindEvents(item, companies, employees, teflonlog, currentStatusKey, nextStatusKey) {
      const panel = document.getElementById('tefproc-panel');
      if (!panel) return;

      const header = panel.querySelector('.checkio-header');
      attachSwipeToClose(header, panel, this.close.bind(this));

      const closeBtn = document.getElementById('tefproc-close');
      const bottomClose = document.getElementById('tefproc-bottom-close');
      const cancelSend = document.getElementById('tefproc-cancel-send');

      const statusSelect = document.getElementById('tefproc-status');
      const statusPill = document.getElementById('tefproc-status-pill');

      const sentDateEl = document.getElementById('tefproc-sent-date');
      const expDateEl = document.getElementById('tefproc-expected-date');

      if (statusSelect && statusPill) {
        const updateStatusPill = () => {
          const key = statusSelect.value;
          const label = statusKeyToCoatingLabel(key) || '';
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
          if (expDateEl.value) return;
          const auto = addBusinessDaysISO(sentDateEl.value, 5);
          if (auto) expDateEl.value = auto;
        });
      }

      if (closeBtn) closeBtn.addEventListener('click', this.close.bind(this));
      if (bottomClose) bottomClose.addEventListener('click', this.close.bind(this));
      if (cancelSend) cancelSend.addEventListener('click', this.close.bind(this));

      // Switch mode
      const modeButtons = panel.querySelectorAll('.mode-btn');
      modeButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const mode = btn.getAttribute('data-mode');
          modeButtons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');

          const sections = panel.querySelectorAll('.tefproc-inputs');
          sections.forEach((sec) => {
            sec.style.display = sec.getAttribute('data-mode') === mode ? '' : 'none';
          });
        });
      });

      // Quick Actions handlers
      const quickApproveBtn = document.getElementById('tefproc-quick-approve');
      const quickSendBtn = document.getElementById('tefproc-quick-send');
      const quickCompleteBtn = document.getElementById('tefproc-quick-complete');

      if (quickApproveBtn) {
        quickApproveBtn.addEventListener(
          'click',
          this._handleQuickApprove.bind(this, item, companies, employees)
        );
      }
      if (quickSendBtn) {
        quickSendBtn.addEventListener(
          'click',
          this._handleQuickSend.bind(this, item, companies, employees)
        );
      }
      if (quickCompleteBtn) {
        quickCompleteBtn.addEventListener(
          'click',
          this._handleQuickComplete.bind(this, item, companies, employees)
        );
      }

      // Full form: send/register status
      const saveSendBtn = document.getElementById('tefproc-save-send');
      if (saveSendBtn) {
        saveSendBtn.addEventListener(
          'click',
          this._handleSendSubmit.bind(this, item, companies, employees)
        );
      }

      // Full form: complete
      const confirmBtn = document.getElementById('tefproc-confirm-complete');
      if (confirmBtn) {
        confirmBtn.addEventListener(
          'click',
          this._handleCompleteSubmit.bind(this, item, companies, employees)
        );
      }

      // Update location
      const updateLocBtn = document.getElementById('tefproc-update-location');
      if (updateLocBtn) {
        updateLocBtn.addEventListener('click', () => {
          if (window.LocationManager && typeof window.LocationManager.openModal === 'function') {
            window.LocationManager.openModal(item);
          } else {
            alert('Location module chưa sẵn sàng.\n位置管理モジュールが利用できません。');
          }
        });
      }
    },

    // ============================
    // Quick Action Handlers
    // ============================
    async _handleQuickApprove(item, companies, employees) {
      if (isSaving) return;

      const msg =
        '【クイック承認 / Duyệt nhanh】\n\n' +
        'この金型を「承認済(発送待ち)」にしますか？\n' +
        'Chuyển khuôn sang trạng thái “Đã duyệt (chờ gửi)”?\n\n' +
        '自動設定:\n' +
        '・状態: 承認済(発送待ち)\n' +
        '・日付: 今日';

      if (!window.confirm(msg)) return;

      const dm = window.DataManager;
      const data = (dm && dm.data) || {};
      const moldId = String(item.MoldID).trim();
      const today = getTodayISO();
      const newLogId = getNextTeflonLogId(data);

      const tefEntry = {
        TeflonLogID: newLogId,
        MoldID: moldId,
        TeflonStatus: 'Approved',
        RequestedBy: DEFAULT_EMPLOYEE_ID,
        RequestedDate: today,
        SentBy: '',
        SentDate: '',
        ExpectedDate: '',
        ReceivedDate: '',
        SupplierID: DEFAULT_SUPPLIER_ID,
        CoatingType: '',
        Reason: 'Quick approve / クイック承認',
        TeflonCost: '',
        Quality: '',
        TeflonNotes: '承認済(発送待ち) / Đã duyệt (chờ gửi)',
        CreatedDate: today,
        UpdatedBy: DEFAULT_EMPLOYEE_ID,
        UpdatedDate: today
      };

      this.close();
      showToast('承認登録中... / Đang ghi nhận duyệt...', 'info');
      isSaving = true;

      try {
        const addRes = await fetch(API_ADD_LOG, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: 'teflonlog.csv', entry: tefEntry })
        });
        const addJson = await addRes.json();
        if (!addRes.ok || !addJson.success) {
          throw new Error(addJson.message || 'Không ghi được teflonlog.csv');
        }

        if (data) {
          if (!Array.isArray(data.teflonlog)) data.teflonlog = [];
          data.teflonlog.unshift(tefEntry);
        }

        if (dm && typeof dm.recompute === 'function') {
          try { dm.recompute(); } catch (e) { console.warn('[QuickApprove] recompute error', e); }
        }

        showToast('✅ 承認済(発送待ち)に更新 / Đã chuyển sang “Đã duyệt (chờ gửi)”', 'success');
        // Notify teflon-manager to refresh (rebuild rows + badge)
        try {
          window.dispatchEvent(new CustomEvent('teflon:data-changed', {
            detail: { source: 'teflon-process-manager', action: 'save' }
          }));
        } catch (e) {
          console.warn('[TeflonProcessManager] dispatch teflon:data-changed error', e);
        }

      } catch (err) {
        console.error('[QuickApprove] error', err);
        showToast('❌ 承認エラー / Lỗi duyệt', 'error');
        alert('Lỗi: ' + (err.message || ''));
      } finally {
        isSaving = false;
      }
    },

    async _handleQuickSend(item, companies, employees) {
      if (isSaving) return;

      const msg =
        '【クイック出荷確認 / Xác nhận gửi nhanh】\n\n' +
        '今日この金型をテフロン加工業者へ出荷しますか？\n' +
        'Xác nhận gửi khuôn này đi mạ Teflon hôm nay?\n\n' +
        '自動設定:\n' +
        '・状態: テフロン加工中\n' +
        '・出荷日: 今日\n' +
        '・受入予定日: +5営業日\n' +
        '・出荷担当: トアン (ID=1)';

      if (!window.confirm(msg)) return;

      const dm = window.DataManager;
      const data = (dm && dm.data) || {};
      const teflonlog = data.teflonlog || [];

      const moldId = String(item.MoldID).trim();
      const today = getTodayISO();
      const expectedDate = addBusinessDaysISO(today, 5);
      const newLogId = getNextTeflonLogId(data);
      const nowIso = new Date().toISOString();

      // inherit last log info if exists
      const historyForMold = buildTeflonHistory(teflonlog, item);
      const lastLog = historyForMold[0] || null;

      const tefEntry = {
        TeflonLogID: newLogId,
        MoldID: moldId,
        TeflonStatus: 'Sent',
        RequestedBy: (lastLog && lastLog.RequestedBy) || DEFAULT_EMPLOYEE_ID,
        RequestedDate: (lastLog && lastLog.RequestedDate) || today,
        SentBy: DEFAULT_EMPLOYEE_ID,
        SentDate: today,
        ExpectedDate: expectedDate,
        ReceivedDate: '',
        SupplierID: (lastLog && lastLog.SupplierID) || DEFAULT_SUPPLIER_ID,
        CoatingType: (lastLog && lastLog.CoatingType) || '',
        Reason: (lastLog && lastLog.Reason) || 'Quick send via Quick Action',
        TeflonCost: (lastLog && lastLog.TeflonCost) || '',
        Quality: '',
        TeflonNotes: 'クイック出荷 / Quick send',
        CreatedDate: today,
        UpdatedBy: DEFAULT_EMPLOYEE_ID,
        UpdatedDate: today
      };

      const statusEntry = {
        StatusLogID: '',
        MoldID: moldId,
        CutterID: '',
        ItemType: 'mold',
        Status: 'CHECKOUT',
        Timestamp: nowIso,
        EmployeeID: DEFAULT_EMPLOYEE_ID,
        DestinationID: '',
        Notes: 'Quick send Teflon | クイック出荷',
        AuditDate: today,
        AuditType: 'TEFLON-SEND'
      };

      this.close();
      showToast('クイック出荷処理中... / Đang xử lý...', 'info');
      isSaving = true;

      try {
        // 1) teflonlog.csv
        const addRes = await fetch(API_ADD_LOG, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: 'teflonlog.csv', entry: tefEntry })
        });
        const addJson = await addRes.json();
        if (!addRes.ok || !addJson.success) {
          throw new Error(addJson.message || 'Không ghi được teflonlog.csv');
        }

        // 2) statuslogs.csv
        try {
          const stRes = await fetch(API_ADD_LOG, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: 'statuslogs.csv', entry: statusEntry })
          });
          const stJson = await stRes.json();
          if (!stRes.ok || !stJson.success) console.warn('[QuickSend] statuslogs warning', stJson);
        } catch (e) {
          console.warn('[QuickSend] statuslogs error', e);
        }

        // 3) in-memory
        if (data) {
          if (!Array.isArray(data.teflonlog)) data.teflonlog = [];
          data.teflonlog.unshift(tefEntry);

          if (!Array.isArray(data.statuslogs)) data.statuslogs = [];
          data.statuslogs.unshift(statusEntry);
        }

        if (dm && typeof dm.recompute === 'function') {
          try { dm.recompute(); } catch (e) { console.warn('[QuickSend] recompute error', e); }
        }

        showToast('✅ クイック出荷完了 / Quick send thành công', 'success');

        // Notify teflon-manager to refresh (rebuild rows + badge)
        try {
          window.dispatchEvent(new CustomEvent('teflon:data-changed', {
            detail: { source: 'teflon-process-manager', action: 'save' }
          }));
        } catch (e) {
          console.warn('[TeflonProcessManager] dispatch teflon:data-changed error', e);
        }

      } catch (err) {
        console.error('[QuickSend] error', err);
        showToast('❌ クイック出荷エラー / Quick send lỗi', 'error');
        alert('Lỗi: ' + (err.message || ''));
      } finally {
        isSaving = false;
      }
    },

    async _handleQuickComplete(item, companies, employees) {
      if (isSaving) return;

      const msg =
        '【クイック受入確認 / Xác nhận nhận nhanh】\n\n' +
        'この金型のテフロン加工が完了し、今日受け入れましたか？\n' +
        'Xác nhận khuôn đã mạ xong và nhận về hôm nay?\n\n' +
        '自動設定:\n' +
        '・状態: テフロン加工済\n' +
        '・受入日: 今日';

      if (!window.confirm(msg)) return;

      const dm = window.DataManager;
      const data = (dm && dm.data) || {};
      const teflonlog = data.teflonlog || [];

      const moldId = String(item.MoldID).trim();
      const today = getTodayISO();
      const historyForMold = buildTeflonHistory(teflonlog, item);
      const lastLog = historyForMold[0] || null;
      const supplierId = (lastLog && lastLog.SupplierID) || DEFAULT_SUPPLIER_ID;

      const newLogId = getNextTeflonLogId(data);
      const nowIso = new Date().toISOString();

      const tefEntry = {
        TeflonLogID: newLogId,
        MoldID: moldId,
        TeflonStatus: 'Completed',
        RequestedBy: (lastLog && lastLog.RequestedBy) || '',
        RequestedDate: (lastLog && lastLog.RequestedDate) || '',
        SentBy: (lastLog && lastLog.SentBy) || '',
        SentDate: (lastLog && lastLog.SentDate) || '',
        ExpectedDate: (lastLog && lastLog.ExpectedDate) || '',
        ReceivedDate: today,
        SupplierID: supplierId,
        CoatingType: (lastLog && lastLog.CoatingType) || '',
        Reason: (lastLog && lastLog.Reason) || '',
        TeflonCost: (lastLog && lastLog.TeflonCost) || '',
        Quality: 'OK',
        TeflonNotes: 'クイック受入 / Quick receive',
        CreatedDate: today,
        UpdatedBy: '',
        UpdatedDate: today
      };

      const statusEntry = {
        StatusLogID: '',
        MoldID: moldId,
        CutterID: '',
        ItemType: 'mold',
        Status: 'CHECKIN',
        Timestamp: nowIso,
        EmployeeID: '',
        DestinationID: '',
        Notes: 'Quick receive Teflon | クイック受入',
        AuditDate: today,
        AuditType: 'TEFLON-RETURN'
      };

      const updatePayload = {
        filename: 'molds.csv',
        itemIdField: 'MoldID',
        itemIdValue: moldId,
        updates: {
          TeflonCoating: statusKeyToCoatingLabel('completed'),
          TeflonReceivedDate: today,
          TeflonSentDate: lastLog ? (lastLog.SentDate || '') : '',
          TeflonExpectedDate: lastLog ? (lastLog.ExpectedDate || '') : ''
        }
      };

      this.close();
      showToast('クイック受入処理中... / Đang xử lý...', 'info');
      isSaving = true;

      try {
        // 1) teflonlog.csv
        const addRes = await fetch(API_ADD_LOG, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: 'teflonlog.csv', entry: tefEntry })
        });
        const addJson = await addRes.json();
        if (!addRes.ok || !addJson.success) {
          throw new Error(addJson.message || 'Không ghi được teflonlog.csv');
        }

        // 2) statuslogs.csv
        try {
          const stRes = await fetch(API_ADD_LOG, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: 'statuslogs.csv', entry: statusEntry })
          });
          const stJson = await stRes.json();
          if (!stRes.ok || !stJson.success) console.warn('[QuickComplete] statuslogs warning', stJson);
        } catch (e) {
          console.warn('[QuickComplete] statuslogs error', e);
        }

        // 3) molds.csv update
        try {
          const updRes = await fetch(API_UPDATE_ITEM, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
          });
          const updJson = await updRes.json();
          if (!updRes.ok || !updJson.success) console.warn('[QuickComplete] molds.csv warning', updJson);
        } catch (e) {
          console.warn('[QuickComplete] molds.csv error', e);
        }

        // 4) in-memory
        if (data) {
          if (!Array.isArray(data.teflonlog)) data.teflonlog = [];
          data.teflonlog.unshift(tefEntry);

          if (!Array.isArray(data.statuslogs)) data.statuslogs = [];
          data.statuslogs.unshift(statusEntry);

          if (Array.isArray(data.molds)) {
            const mold = data.molds.find((m) => String(m.MoldID).trim() === moldId);
            if (mold) {
              mold.TeflonCoating = updatePayload.updates.TeflonCoating;
              mold.TeflonReceivedDate = updatePayload.updates.TeflonReceivedDate;
              mold.TeflonSentDate = updatePayload.updates.TeflonSentDate;
              mold.TeflonExpectedDate = updatePayload.updates.TeflonExpectedDate;
            }
          }
        }

        if (dm && typeof dm.recompute === 'function') {
          try { dm.recompute(); } catch (e) { console.warn('[QuickComplete] recompute error', e); }
        }

        // Dispatch event
        try {
          let updatedItem = item;
          if (Array.isArray(data.molds)) {
            const mold = data.molds.find((m) => String(m.MoldID).trim() === moldId);
            if (mold) updatedItem = mold;
          }
          const detailEvt = new CustomEvent('detail:changed', {
            detail: { item: updatedItem, itemType: 'mold', itemId: moldId, source: 'teflon-quick' }
          });
          document.dispatchEvent(detailEvt);
        } catch (e) {
          console.warn('[QuickComplete] dispatch error', e);
        }

        showToast('✅ クイック受入完了 / Quick receive thành công', 'success');

        // Notify teflon-manager to refresh (rebuild rows + badge)
        try {
          window.dispatchEvent(new CustomEvent('teflon:data-changed', {
            detail: { source: 'teflon-process-manager', action: 'save' }
          }));
        } catch (e) {
          console.warn('[TeflonProcessManager] dispatch teflon:data-changed error', e);
        }

        const wantUpdateLocation = window.confirm('位置を更新しますか？\nCó muốn cập nhật vị trí khuôn không?');
        if (wantUpdateLocation) {
          if (window.LocationManager && typeof window.LocationManager.openModal === 'function') {
            let updatedItem = item;
            if (Array.isArray(data.molds)) {
              const mold = data.molds.find((m) => String(m.MoldID).trim() === moldId);
              if (mold) updatedItem = mold;
            }
            window.LocationManager.openModal(updatedItem);
          } else {
            alert('Location module chưa sẵn sàng.\n位置管理モジュールが利用できません。');
          }
        }
      } catch (err) {
        console.error('[QuickComplete] error', err);
        showToast('❌ クイック受入エラー / Quick receive lỗi', 'error');
        alert('Lỗi: ' + (err.message || ''));
      } finally {
        isSaving = false;
      }
    },

    // ============================
    // Full Form Handlers
    // ============================
    async _handleSendSubmit(item, companies, employees) {
      if (isSaving) return;

      const dm = window.DataManager;
      const data = (dm && dm.data) || {};
      const moldId = String(item.MoldID).trim();

      const supplierEl = document.getElementById('tefproc-supplier');
      const reqDateEl = document.getElementById('tefproc-request-date');
      const sentDateEl = document.getElementById('tefproc-sent-date');
      const expDateEl = document.getElementById('tefproc-expected-date');
      const reqEmpEl = document.getElementById('tefproc-request-emp');
      const sentEmpEl = document.getElementById('tefproc-sent-emp');
      const typeEl = document.getElementById('tefproc-coating-type');
      const reasonEl = document.getElementById('tefproc-reason');
      const costEl = document.getElementById('tefproc-cost');
      const notesEl = document.getElementById('tefproc-notes');
      const statusEl = document.getElementById('tefproc-status');

      const statusKey = statusEl ? statusEl.value : 'sent';
      const teflonStatus = statusKeyToLogStatus(statusKey) || 'Sent';

      const supplierId = supplierEl ? supplierEl.value.trim() : '';
      const reqDate = reqDateEl ? reqDateEl.value : '';
      const sentDate = sentDateEl ? sentDateEl.value : '';
      const expDate = expDateEl ? expDateEl.value : '';
      const reqEmpId = reqEmpEl ? reqEmpEl.value.trim() : '';
      const sentEmpId = sentEmpEl ? sentEmpEl.value.trim() : '';
      const coatingType = typeEl ? typeEl.value.trim() : '';
      const reason = reasonEl ? reasonEl.value.trim() : '';
      const costNum = toNumber(costEl ? costEl.value : '');
      const notes = notesEl ? notesEl.value.trim() : '';

      if (!supplierId) {
        alert('Vui lòng chọn nhà cung cấp.\n業者を選択してください。');
        if (supplierEl) supplierEl.focus();
        return;
      }

      // r7.1.1 fix: require SentDate ONLY when statusKey === 'sent'
      if (statusKey === 'sent' && !sentDate) {
        alert('Vui lòng chọn ngày gửi.\n出荷日を入力してください。');
        if (sentDateEl) sentDateEl.focus();
        return;
      }

      const newLogId = getNextTeflonLogId(data);
      const nowIso = new Date().toISOString();
      const today = getTodayISO();

      const tefEntry = {
        TeflonLogID: newLogId,
        MoldID: moldId,
        TeflonStatus: teflonStatus,
        RequestedBy: reqEmpId || '',
        RequestedDate: reqDate || sentDate || today,
        SentBy: (statusKey === 'sent') ? (sentEmpId || reqEmpId || '') : '',
        SentDate: (statusKey === 'sent') ? sentDate : '',
        ExpectedDate: (statusKey === 'sent') ? (expDate || '') : '',
        ReceivedDate: '',
        SupplierID: supplierId,
        CoatingType: coatingType,
        Reason: reason,
        TeflonCost: costNum != null ? String(costNum) : '',
        Quality: '',
        TeflonNotes: notes || 'テフロン工程登録 / Ghi nhận Teflon',
        CreatedDate: today,
        UpdatedBy: reqEmpId || sentEmpId || '',
        UpdatedDate: today
      };

      let statusEntry = null;
      if (statusKey === 'sent') {
        statusEntry = {
          StatusLogID: '',
          MoldID: moldId,
          CutterID: '',
          ItemType: 'mold',
          Status: 'CHECKOUT',
          Timestamp: nowIso,
          EmployeeID: sentEmpId || reqEmpId || '',
          DestinationID: '',
          Notes: 'テフロン加工出荷 | Đi mạ khuôn',
          AuditDate: sentDate || today,
          AuditType: 'TEFLON-SEND'
        };
      }

      this.close();
      showToast('処理中... / Đang xử lý...', 'info');
      isSaving = true;

      try {
        // 1) teflonlog.csv
        const addRes = await fetch(API_ADD_LOG, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: 'teflonlog.csv', entry: tefEntry })
        });
        const addJson = await addRes.json();
        if (!addRes.ok || !addJson.success) {
          throw new Error(addJson.message || 'Không ghi được teflonlog.csv');
        }

        // 2) statuslogs.csv (only for Sent)
        if (statusEntry) {
          try {
            const stRes = await fetch(API_ADD_LOG, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filename: 'statuslogs.csv', entry: statusEntry })
            });
            const stJson = await stRes.json();
            if (!stRes.ok || !stJson.success) console.warn('[Send] statuslogs warning', stJson);
          } catch (e) {
            console.warn('[Send] statuslogs error', e);
          }
        }

        // 3) in-memory
        if (data) {
          if (!Array.isArray(data.teflonlog)) data.teflonlog = [];
          data.teflonlog.unshift(tefEntry);

          if (statusEntry) {
            if (!Array.isArray(data.statuslogs)) data.statuslogs = [];
            data.statuslogs.unshift(statusEntry);
          }
        }

        if (dm && typeof dm.recompute === 'function') {
          try { dm.recompute(); } catch (e) { console.warn('[Send] recompute error', e); }
        }

        showToast('✅ 保存完了 / Lưu thành công', 'success');

        // Notify teflon-manager to refresh (rebuild rows + badge)
        try {
          window.dispatchEvent(new CustomEvent('teflon:data-changed', {
            detail: { source: 'teflon-process-manager', action: 'save' }
          }));
        } catch (e) {
          console.warn('[TeflonProcessManager] dispatch teflon:data-changed error', e);
        }

      } catch (err) {
        console.error('[Send] error', err);
        showToast('❌ 保存エラー / Lỗi khi lưu', 'error');
        alert('Lỗi: ' + (err.message || ''));
      } finally {
        isSaving = false;
      }
    },

    async _handleCompleteSubmit(item, companies, employees) {
      if (isSaving) return;

      const dm = window.DataManager;
      const data = (dm && dm.data) || {};
      const teflonlog = data.teflonlog || [];

      const moldId = String(item.MoldID).trim();

      const recvDateEl = document.getElementById('tefproc-received-date');
      const recvEmpEl = document.getElementById('tefproc-received-emp');
      const qualityEl = document.getElementById('tefproc-quality');
      const notesEl = document.getElementById('tefproc-complete-notes');

      const recvDate = recvDateEl ? recvDateEl.value : '';
      const recvEmpId = recvEmpEl ? recvEmpEl.value.trim() : '';
      const quality = qualityEl ? qualityEl.value.trim() : '';
      const notes = notesEl ? notesEl.value.trim() : '';

      if (!recvDate) {
        alert('Vui lòng chọn ngày nhận khuôn.\n受入日を入力してください。');
        if (recvDateEl) recvDateEl.focus();
        return;
      }

      const historyForMold = buildTeflonHistory(teflonlog, item);
      const lastLog = historyForMold[0] || null;
      const supplierId = (lastLog && lastLog.SupplierID) || DEFAULT_SUPPLIER_ID;

      const newLogId = getNextTeflonLogId(data);
      const today = getTodayISO();
      const nowIso = new Date().toISOString();

      const tefEntry = {
        TeflonLogID: newLogId,
        MoldID: moldId,
        TeflonStatus: 'Completed',
        RequestedBy: (lastLog && lastLog.RequestedBy) || '',
        RequestedDate: (lastLog && lastLog.RequestedDate) || '',
        SentBy: (lastLog && lastLog.SentBy) || '',
        SentDate: (lastLog && lastLog.SentDate) || '',
        ExpectedDate: (lastLog && lastLog.ExpectedDate) || '',
        ReceivedDate: recvDate,
        SupplierID: supplierId,
        CoatingType: (lastLog && lastLog.CoatingType) || '',
        Reason: (lastLog && lastLog.Reason) || '',
        TeflonCost: (lastLog && lastLog.TeflonCost) || '',
        Quality: quality || '',
        TeflonNotes: notes || 'テフロン加工完了 / Hoàn tất mạ',
        CreatedDate: today,
        UpdatedBy: recvEmpId || '',
        UpdatedDate: today
      };

      const statusEntry = {
        StatusLogID: '',
        MoldID: moldId,
        CutterID: '',
        ItemType: 'mold',
        Status: 'CHECKIN',
        Timestamp: nowIso,
        EmployeeID: recvEmpId || '',
        DestinationID: '',
        Notes: 'テフロン加工済み金型入庫 | Khuôn mạ Teflon đã về kho',
        AuditDate: recvDate,
        AuditType: 'TEFLON-RETURN'
      };

      const updatePayload = {
        filename: 'molds.csv',
        itemIdField: 'MoldID',
        itemIdValue: moldId,
        updates: {
          TeflonCoating: statusKeyToCoatingLabel('completed'),
          TeflonReceivedDate: recvDate,
          TeflonSentDate: lastLog ? (lastLog.SentDate || '') : '',
          TeflonExpectedDate: lastLog ? (lastLog.ExpectedDate || '') : ''
        }
      };

      const wantUpdateLocation = window.confirm(
        'テフロン加工完了後、新しい保管位置を更新しますか？\nĐã mạ xong. Có muốn cập nhật vị trí mới cho khuôn này không?'
      );

      this.close();
      showToast('完了登録中... / Đang ghi nhận hoàn tất...', 'info');
      isSaving = true;

      try {
        // 1) teflonlog.csv
        const addRes = await fetch(API_ADD_LOG, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: 'teflonlog.csv', entry: tefEntry })
        });
        const addJson = await addRes.json();
        if (!addRes.ok || !addJson.success) {
          throw new Error(addJson.message || 'Không ghi được teflonlog.csv');
        }

        // 2) statuslogs.csv
        try {
          const stRes = await fetch(API_ADD_LOG, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename: 'statuslogs.csv', entry: statusEntry })
          });
          const stJson = await stRes.json();
          if (!stRes.ok || !stJson.success) console.warn('[Complete] statuslogs warning', stJson);
        } catch (e) {
          console.warn('[Complete] statuslogs error', e);
        }

        // 3) molds.csv
        try {
          const updRes = await fetch(API_UPDATE_ITEM, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
          });
          const updJson = await updRes.json();
          if (!updRes.ok || !updJson.success) console.warn('[Complete] molds.csv warning', updJson);
        } catch (e) {
          console.warn('[Complete] molds.csv error', e);
        }

        // 4) in-memory
        if (data) {
          if (!Array.isArray(data.teflonlog)) data.teflonlog = [];
          data.teflonlog.unshift(tefEntry);

          if (!Array.isArray(data.statuslogs)) data.statuslogs = [];
          data.statuslogs.unshift(statusEntry);

          if (Array.isArray(data.molds)) {
            const mold = data.molds.find((m) => String(m.MoldID).trim() === moldId);
            if (mold) {
              mold.TeflonCoating = updatePayload.updates.TeflonCoating;
              mold.TeflonReceivedDate = updatePayload.updates.TeflonReceivedDate;
              mold.TeflonSentDate = updatePayload.updates.TeflonSentDate;
              mold.TeflonExpectedDate = updatePayload.updates.TeflonExpectedDate;
            }
          }
        }

        let updatedItem = item;
        if (Array.isArray(data.molds)) {
          const mold = data.molds.find((m) => String(m.MoldID).trim() === moldId);
          if (mold) updatedItem = mold;
        }

        if (dm && typeof dm.recompute === 'function') {
          try { dm.recompute(); } catch (e) { console.warn('[Complete] recompute error', e); }
        }

        try {
          const detailEvt = new CustomEvent('detail:changed', {
            detail: { item: updatedItem, itemType: 'mold', itemId: moldId, source: 'teflon-process' }
          });
          document.dispatchEvent(detailEvt);
        } catch (e) {
          console.warn('[Complete] dispatch error', e);
        }

        showToast('✅ 完了登録済み / Đã ghi nhận hoàn tất', 'success');

        // Notify teflon-manager to refresh (rebuild rows + badge)
        try {
          window.dispatchEvent(new CustomEvent('teflon:data-changed', {
            detail: { source: 'teflon-process-manager', action: 'save' }
          }));
        } catch (e) {
          console.warn('[TeflonProcessManager] dispatch teflon:data-changed error', e);
        }

        if (wantUpdateLocation) {
          if (window.LocationManager && typeof window.LocationManager.openModal === 'function') {
            window.LocationManager.openModal(updatedItem);
          } else {
            alert('Không mở được module vị trí.\n位置管理モジュールを開けませんでした。');
          }
        }
      } catch (err) {
        console.error('[Complete] error', err);
        showToast('❌ 完了登録エラー / Lỗi khi hoàn tất', 'error');
        alert('Lỗi: ' + (err.message || ''));
      } finally {
        isSaving = false;
      }
    }
  };

  // Export window.TeflonProcessManager
  window.TeflonProcessManager = {
    version: 'r7.1.1',
    INIT: TeflonProcessManager.INIT.bind(TeflonProcessManager),
    open: TeflonProcessManager.open.bind(TeflonProcessManager),
    openPanel: TeflonProcessManager.openPanel.bind(TeflonProcessManager),
    close: TeflonProcessManager.close.bind(TeflonProcessManager)
  };


  // Auto INIT
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.TeflonProcessManager.INIT();
    });
  } else {
    window.TeflonProcessManager.INIT();
  }

  // Bridge: allow other modules to open by event
  // - detail: { moldId, teflonRow, item, source }
  (function bindTeflonOpenBridge() {
    if (window.__tefProcOpenBridgeBound) return;
    window.__tefProcOpenBridgeBound = true;

    window.addEventListener('teflon:open-process-manager', function (e) {
      try {
        const detail = (e && e.detail) ? e.detail : {};
        const moldId = detail.moldId || (detail.teflonRow && detail.teflonRow.MoldID) || (detail.item && detail.item.MoldID);
        if (!moldId && !detail.item) return;

        if (window.TeflonProcessManager && typeof window.TeflonProcessManager.open === 'function') {
          window.TeflonProcessManager.open({ moldId: moldId, item: detail.item || null, teflonRow: detail.teflonRow || null, source: detail.source || 'event' });
        }
      } catch (err) {
        console.error('[TeflonProcessManager] open bridge error', err);
      }
    });
  })();

  // Bridge: listen triggerTeflon
  document.addEventListener('triggerTeflon', function (e) {
    try {
      const detail = e && e.detail;
      const item = detail && detail.item;

      if (!item || !item.MoldID) {
        console.warn('[TeflonProcess] triggerTeflon without valid Mold item', detail);
        return;
      }
      if (!window.TeflonProcessManager || typeof window.TeflonProcessManager.openPanel !== 'function') {
        console.warn('[TeflonProcess] TeflonProcessManager.openPanel not ready');
        return;
      }

      window.TeflonProcessManager.openPanel(item);
    } catch (err) {
      console.error('[TeflonProcess] Error handling triggerTeflon event', err);
    }
  });
})();

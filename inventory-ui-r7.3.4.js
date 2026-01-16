/**
 * inventory-ui-r7.3.3.js
 * Inventory UI Module r7.3.3 (FIXED session naming + event sync)
 *
 * Key fixes (2026-01-07):
 * - Remove UI-side seq generation → use InventoryManager.generateSessionName() as single source of truth
 * - Listen to BOTH legacy and colon-namespaced events for compatibility
 * - Auto-update badge/history when session/mode changes
 * - Bilingual UI (JP priority, then VN)
 * - Integrated with InventoryManager r7.3.3 core
 *
 * UI flow:
 * 1) Initial modal: Instant Audit / Session Setup / Exit
 * 2) Session setup modal: Mode A (RackLayerID based) / Mode B (List based)
 * 3) Session history table: lock/unlock columns, link to view-history
 *
 * Dependencies:
 * - inventory-manager-r7.3.3.js (must load first)
 * - DataManager (employees, racks, racklayers)
 * - UIRenderer (for re-render after audit)
 *
 * Created: 2026-01-07
 */

(function () {
  'use strict';

  const VERSION = 'r7.3.3';

  // ============================================================================
  // Utilities
  // ============================================================================
  function escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function safeString(v) {
    if (v == null) return '';
    return String(v);
  }

  function isFn(fn) {
    return typeof fn === 'function';
  }

  function dispatch(name, detail) {
    try {
      document.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (e) {
      // ignore
    }
  }

  function formatDateTime(isoString) {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    } catch (e) {
      return isoString;
    }
  }

  // ============================================================================
  // Initial Selection Modal (3 actions: Instant / Session / Exit)
  // ============================================================================
  const InitialModal = {
    modal: null,

    show() {
      if (this.modal) {
        this.modal.style.display = 'flex';
        return;
      }

      const html = this.renderHTML();
      document.body.insertAdjacentHTML('beforeend', html);
      this.modal = document.getElementById('inv-initial-modal-overlay');
      this.bindEvents();
      this.populateData();
    },

    hide() {
      if (this.modal) {
        this.modal.remove();
        this.modal = null;
      }
    },

    renderHTML() {
      return `
<div id="inv-initial-modal-overlay" class="inv-overlay" style="display:flex;">
  <div class="inv-modal inv-modal-small">
    <!-- Header -->
    <div class="inv-modal-header">
      <h3>
        <i class="fas fa-clipboard-check"></i>
        <span class="label-ja">棚卸設定</span>
        <span class="label-vi">Kiểm kê</span>
      </h3>
      <button class="inv-close-btn" id="inv-initial-close">
        <i class="fas fa-times"></i>
      </button>
    </div>

    <!-- Body -->
    <div class="inv-modal-body">
      <!-- Operator Selection -->
      <div class="inv-form-group">
        <label>
          <i class="fas fa-user"></i>
          <span class="label-ja">担当者</span>
          <span class="label-vi">Nhân viên</span>
          <span class="required">*</span>
        </label>
        <select class="inv-select" id="inv-initial-operator" required>
          <option value="">-- 選択 / Chọn --</option>
        </select>
      </div>

      <!-- Remember Operator -->
      <div class="inv-form-group">
        <label class="inv-checkbox-label">
          <input type="checkbox" id="inv-initial-remember" checked>
          <span>
            <i class="fas fa-save"></i>
            <span class="label-ja">担当者を記憶</span>
            <span class="label-vi">Nhớ nhân viên</span>
          </span>
        </label>
      </div>

      <!-- Help Text -->
      <div class="inv-form-group">
        <small class="inv-help-text">
          <span class="label-ja">担当者を選択して、棚卸方法を選んでください。</span>
          <span class="label-vi">Chọn nhân viên và phương thức kiểm kê.</span>
        </small>
      </div>
    </div>

    <!-- Footer - 3 Actions -->
    <div class="inv-modal-footer inv-modal-footer-triple">
      <button class="inv-btn inv-btn-secondary" id="inv-initial-exit">
        <i class="fas fa-times-circle"></i>
        <span class="label-ja">キャンセル</span>
        <span class="label-vi">Thoát</span>
      </button>
      <button class="inv-btn inv-btn-info" id="inv-initial-session">
        <i class="fas fa-list-check"></i>
        <span class="label-ja">セッション棚卸</span>
        <span class="label-vi">Kiểm kê theo phiên</span>
      </button>
      <button class="inv-btn inv-btn-primary" id="inv-initial-instant">
        <i class="fas fa-play-circle"></i>
        <span class="label-ja">即時棚卸</span>
        <span class="label-vi">Kiểm kê ngay</span>
      </button>
    </div>
  </div>
</div>
      `;
    },

    bindEvents() {
      const closeBtn = document.getElementById('inv-initial-close');
      const exitBtn = document.getElementById('inv-initial-exit');
      [closeBtn, exitBtn].forEach((btn) => {
        if (btn) btn.addEventListener('click', () => this.hide());
      });

      // Click outside
      const overlay = document.getElementById('inv-initial-modal-overlay');
      if (overlay) {
        overlay.addEventListener('click', (e) => {
          if (e.target.id === 'inv-initial-modal-overlay') this.hide();
        });
      }

      // Instant Audit
      const instantBtn = document.getElementById('inv-initial-instant');
      if (instantBtn) instantBtn.addEventListener('click', () => this.handleInstantAudit());

      // Session Audit
      const sessionBtn = document.getElementById('inv-initial-session');
      if (sessionBtn) sessionBtn.addEventListener('click', () => this.handleSessionAudit());
    },

    populateData() {
      const employees = window.DataManager?.data?.employees;
      const select = document.getElementById('inv-initial-operator');
      if (select && employees) {
        employees.forEach((emp) => {
          const option = document.createElement('option');
          option.value = emp.EmployeeID;
          option.textContent = `${emp.EmployeeName} (${emp.EmployeeID})`;
          select.appendChild(option);
        });
      }

      // Set default from config
      const state = window.InventoryManager?.getState?.();
      if (state?.config?.lastOperatorId) {
        if (select) select.value = state.config.lastOperatorId;
      }
    },

    handleInstantAudit() {
      const operatorSelect = document.getElementById('inv-initial-operator');
      const operatorId = operatorSelect?.value;
      const operatorName = operatorSelect?.selectedOptions?.[0]?.text;
      const remember = document.getElementById('inv-initial-remember')?.checked;

      if (!operatorId) {
        alert('担当者を選択してください。 / Vui lòng chọn nhân viên.');
        return;
      }

      if (!operatorName || operatorName === '-- 選択 / Chọn --') {
        alert('担当者が不正です。 / Nhân viên không hợp lệ.');
        return;
      }

      // Start instant session
      if (window.InventoryManager?.startInstantSession) {
        const success = window.InventoryManager.startInstantSession(operatorId, operatorName, { remember });
        if (success) this.hide();
      }
    },

    handleSessionAudit() {
      const operatorSelect = document.getElementById('inv-initial-operator');
      const operatorId = operatorSelect?.value;
      const operatorName = operatorSelect?.selectedOptions?.[0]?.text;
      const remember = document.getElementById('inv-initial-remember')?.checked;

      if (!operatorId) {
        alert('担当者を選択してください。 / Vui lòng chọn nhân viên.');
        return;
      }

      if (!operatorName || operatorName === '-- 選択 / Chọn --') {
        alert('担当者が不正です。 / Nhân viên không hợp lệ.');
        return;
      }

      // Close initial modal and open session setup
      this.hide();

      setTimeout(() => {
        if (window.InventoryUI?.showSessionSetupModal) {
          window.InventoryUI.showSessionSetupModal({ operatorId, operatorName, remember });
        }
      }, 100);
    },
  };

  // ============================================================================
  // Session Setup Modal (Mode A/B + History)
  // ============================================================================
  const SessionSetup = {
    modal: null,
    prefilledOperator: null,
    historyLocked: true, // Lock columns by default

    show(prefill) {
      this.prefilledOperator = prefill || null;

      if (this.modal) {
        this.modal.style.display = 'flex';
        this.populateData();
        this.renderHistory();
        return;
      }

      const html = this.renderHTML();
      document.body.insertAdjacentHTML('beforeend', html);
      this.modal = document.getElementById('inv-session-setup-overlay');
      this.bindEvents();
      this.populateData();
      this.renderHistory();
    },

    hide() {
      if (this.modal) {
        this.modal.remove();
        this.modal = null;
      }
    },

    renderHTML() {
      return `
<div id="inv-session-setup-overlay" class="inv-overlay" style="display:flex;">
  <div class="inv-modal inv-modal-large">
    <!-- Header -->
    <div class="inv-modal-header">
      <h3>
        <i class="fas fa-list-check"></i>
        <span class="label-ja">セッション棚卸設定</span>
        <span class="label-vi">Thiết lập phiên kiểm kê</span>
      </h3>
      <button class="inv-close-btn" id="inv-session-close">
        <i class="fas fa-times"></i>
      </button>
    </div>

    <!-- Body -->
    <div class="inv-modal-body">
      <!-- Section: Session Configuration -->
      <div class="inv-section">
        <h4 class="inv-section-title">
          <i class="fas fa-cog"></i>
          <span class="label-ja">セッション設定</span>
          <span class="label-vi">Cấu hình phiên</span>
        </h4>

        <!-- Operator -->
        <div class="inv-form-group">
          <label>
            <i class="fas fa-user"></i>
            <span class="label-ja">担当者</span>
            <span class="label-vi">Nhân viên</span>
            <span class="required">*</span>
          </label>
          <select class="inv-select" id="inv-session-operator" required>
            <option value="">-- 選択 / Chọn --</option>
          </select>
        </div>

        <!-- Mode -->
        <div class="inv-form-group">
          <label>
            <i class="fas fa-sliders-h"></i>
            <span class="label-ja">モード</span>
            <span class="label-vi">Chế độ</span>
          </label>
          <select class="inv-select" id="inv-session-mode">
            <option value="A">Mode A - 棚位置別棚卸 / Kiểm kê theo vị trí (RackLayerID)</option>
            <option value="B" selected>Mode B - リスト棚卸 / Kiểm kê theo danh sách</option>
          </select>
        </div>

        <!-- Session Name (auto-generated, editable) -->
        <div class="inv-form-group">
          <label>
            <i class="fas fa-tag"></i>
            <span class="label-ja">セッション名</span>
            <span class="label-vi">Tên phiên</span>
          </label>
          <input type="text" class="inv-input" id="inv-session-name" placeholder="自動生成可（編集可） / Tự động tạo (có thể sửa)">
          <small class="inv-help-text">
            <span class="label-ja">例：A-20260107-OP01-1</span>
            <span class="label-vi">Để trống sẽ tự động tạo. VD: A-20260107-OP01-1</span>
          </small>
        </div>

        <!-- RackLayerID Input with Compare Toggle -->
        <div class="inv-form-group">
          <label>
            <input type="checkbox" id="inv-session-compare-toggle" class="inv-tool-checkbox">
            <i class="fas fa-warehouse"></i>
            <span class="label-ja">棚位置を比較</span>
            <span class="label-vi">Bật so sánh vị trí</span>
          </label>
          <input
            type="text"
            id="inv-session-racklayer-input"
            class="inv-input"
            placeholder="例：1-3 / VD: 1-3 (Giá 1-Tầng 3), 12-1 (Giá 12-Tầng 1)"
            disabled
          >
          <small class="inv-help-text">
            <span class="label-ja">RackLayerID（例：1-3＝棚1段3）</span>
            <span class="label-vi">Nhập RackLayerID mục tiêu để phát hiện vị trí không khớp khi kiểm kê.</span>
          </small>
        </div>

        <!-- Note -->
        <div class="inv-form-group">
          <label>
            <i class="fas fa-comment"></i>
            <span class="label-ja">メモ</span>
            <span class="label-vi">Ghi chú</span>
          </label>
          <textarea class="inv-textarea" id="inv-session-note" rows="2" placeholder="例：年末棚卸 / VD: Kiểm kê cuối năm"></textarea>
        </div>

        <!-- Remember Operator -->
        <div class="inv-form-group">
          <label class="inv-checkbox-label">
            <input type="checkbox" id="inv-session-remember" checked>
            <span>
              <i class="fas fa-save"></i>
              <span class="label-ja">担当者を記憶</span>
              <span class="label-vi">Nhớ nhân viên</span>
            </span>
          </label>
        </div>
      </div>

      <!-- Section: Session History -->
      <div class="inv-section">
        <div class="inv-section-header">
          <h4 class="inv-section-title">
            <i class="fas fa-history"></i>
            <span class="label-ja">棚卸履歴</span>
            <span class="label-vi">Lịch sử phiên</span>
          </h4>
          <div class="inv-section-actions">
            <button class="inv-btn-icon" id="inv-history-lock-toggle" title="列ロック切替 / Khóa/mở cột">
              <i class="fas fa-lock"></i>
            </button>
            <a href="view-history" class="inv-btn-icon" id="inv-view-history-link" title="全履歴表示 / Xem toàn bộ lịch sử">
              <i class="fas fa-external-link-alt"></i>
            </a>
          </div>
        </div>
        <div class="inv-history-container" id="inv-history-container">
          <div class="inv-history-loading">
            <i class="fas fa-spinner fa-spin"></i>
            <span class="label-ja">読込中…</span>
            <span class="label-vi">Đang tải...</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="inv-modal-footer">
      <button class="inv-btn inv-btn-secondary" id="inv-session-cancel">
        <i class="fas fa-times"></i>
        <span class="label-ja">キャンセル</span>
        <span class="label-vi">Hủy</span>
      </button>
      <button class="inv-btn inv-btn-primary" id="inv-session-start">
        <i class="fas fa-play-circle"></i>
        <span class="label-ja">棚卸開始</span>
        <span class="label-vi">Bắt đầu phiên</span>
      </button>
    </div>
  </div>
</div>
      `;
    },

    bindEvents() {
      const closeBtn = document.getElementById('inv-session-close');
      const cancelBtn = document.getElementById('inv-session-cancel');
      [closeBtn, cancelBtn].forEach((btn) => {
        if (btn) btn.addEventListener('click', () => this.hide());
      });

      const overlay = document.getElementById('inv-session-setup-overlay');
      if (overlay) {
        overlay.addEventListener('click', (e) => {
          if (e.target.id === 'inv-session-setup-overlay') this.hide();
        });
      }

      // Start button
      const startBtn = document.getElementById('inv-session-start');
      if (startBtn) startBtn.addEventListener('click', () => this.handleStart());

      // Compare toggle
      const compareToggle = document.getElementById('inv-session-compare-toggle');
      const rackLayerInput = document.getElementById('inv-session-racklayer-input');
      if (compareToggle && rackLayerInput) {
        compareToggle.addEventListener('change', (e) => {
          rackLayerInput.disabled = !e.target.checked;
        });
      }

      // History lock toggle
      const lockToggle = document.getElementById('inv-history-lock-toggle');
      if (lockToggle) lockToggle.addEventListener('click', () => this.toggleHistoryLock());

      // View history link
      const viewLink = document.getElementById('inv-view-history-link');
      if (viewLink) {
        viewLink.addEventListener('click', (e) => {
          e.preventDefault();
          this.openFullHistory();
        });
      }
    },

    populateData() {
      // Employees
      const employees = window.DataManager?.data?.employees;
      const operatorSelect = document.getElementById('inv-session-operator');
      if (operatorSelect && employees) {
        // Clear existing options except first
        while (operatorSelect.options.length > 1) {
          operatorSelect.remove(1);
        }

        employees.forEach((emp) => {
          const option = document.createElement('option');
          option.value = emp.EmployeeID;
          option.textContent = `${emp.EmployeeName} (${emp.EmployeeID})`;
          operatorSelect.appendChild(option);
        });

        // Prefill operator if passed
        if (this.prefilledOperator?.operatorId) {
          operatorSelect.value = this.prefilledOperator.operatorId;
        } else {
          const state = window.InventoryManager?.getState?.();
          if (state?.config?.lastOperatorId) {
            operatorSelect.value = state.config.lastOperatorId;
          }
        }
      }
    },

    renderHistory() {
      const container = document.getElementById('inv-history-container');
      if (!container) return;

      const history = window.InventoryManager?.getHistory?.() || [];

      if (history.length === 0) {
        container.innerHTML = `
<div class="inv-history-empty">
  <i class="fas fa-inbox"></i>
  <p>
    <span class="label-ja">履歴なし</span>
    <span class="label-vi">Chưa có lịch sử</span>
  </p>
</div>
        `;
        return;
      }

      // Filter today's history by default
      const today = new Date().toISOString().split('T')[0];
      const todayHistory = history.filter((h) => {
        if (!h.startedAt) return false;
        const date = h.startedAt.split('T')[0];
        return date === today;
      });

      const displayHistory = todayHistory.length > 0 ? todayHistory : history.slice(0, 5);
      const tableHTML = this.renderHistoryTable(displayHistory);
      container.innerHTML = tableHTML;
    },

    renderHistoryTable(history) {
      const locked = this.historyLocked;
      const basicColumns = ['name', 'mode', 'operatorName', 'startedAt'];
      const allColumns = ['name', 'mode', 'operatorName', 'startedAt', 'endedAt', 'audited', 'relocated', 'failed', 'note'];
      const columns = locked ? basicColumns : allColumns;

      const labels = {
        name: { ja: 'セッション名', vi: 'Tên phiên' },
        mode: { ja: 'モード', vi: 'Chế độ' },
        operatorName: { ja: '担当者', vi: 'Nhân viên' },
        startedAt: { ja: '開始', vi: 'Bắt đầu' },
        endedAt: { ja: '終了', vi: 'Kết thúc' },
        audited: { ja: '棚卸', vi: 'Đã kiểm kê' },
        relocated: { ja: '移動', vi: 'Đổi vị trí' },
        failed: { ja: '失敗', vi: 'Thất bại' },
        note: { ja: 'メモ', vi: 'Ghi chú' },
      };

      const headerHTML = columns
        .map((col) => {
          const label = labels[col] || { ja: col, vi: col };
          return `<th><span class="label-ja">${escHtml(label.ja)}</span><span class="label-vi">${escHtml(label.vi)}</span></th>`;
        })
        .join('');

      const rowsHTML = history
        .map((h) => {
          const cells = columns
            .map((col) => {
              let value;
              switch (col) {
                case 'name':
                  value = h.name || h.id || '-';
                  break;
                case 'mode':
                  value = h.mode || '-';
                  break;
                case 'operatorName':
                  value = h.operatorName || h.operatorId || '-';
                  break;
                case 'startedAt':
                  value = formatDateTime(h.startedAt);
                  break;
                case 'endedAt':
                  value = h.endedAt ? formatDateTime(h.endedAt) : '-';
                  break;
                case 'audited':
                  value = h.counts?.audited || 0;
                  break;
                case 'relocated':
                  value = h.counts?.relocated || 0;
                  break;
                case 'failed':
                  value = h.counts?.failed || 0;
                  break;
                case 'note':
                  value = h.note || '-';
                  break;
                default:
                  value = '-';
              }
              return `<td>${escHtml(value)}</td>`;
            })
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');

      return `
<div class="inv-history-table-wrapper ${locked ? 'locked' : 'unlocked'}">
  <table class="inv-history-table">
    <thead>
      <tr>${headerHTML}</tr>
    </thead>
    <tbody>
      ${rowsHTML}
    </tbody>
  </table>
</div>
      `;
    },

    toggleHistoryLock() {
      this.historyLocked = !this.historyLocked;
      const lockIcon = document.querySelector('#inv-history-lock-toggle i');
      if (lockIcon) {
        lockIcon.className = this.historyLocked ? 'fas fa-lock' : 'fas fa-unlock';
      }
      this.renderHistory();
    },

    openFullHistory() {
      // Dispatch event for view-history module
      dispatch('inventoryopenFullHistory', {});
      dispatch('inventory:openFullHistory', {});
      // Or navigate to view-history page
      // window.location.href = 'view-history';
      alert('機能「全履歴表示」は別モジュールで実装予定です。 / Chức năng xem toàn bộ lịch sử sẽ được triển khai ở module khác.');
    },

    handleStart() {
      const operatorId = document.getElementById('inv-session-operator')?.value;
      const operatorName = document.getElementById('inv-session-operator')?.selectedOptions?.[0]?.text;
      let sessionName = document.getElementById('inv-session-name')?.value?.trim() || '';
      const mode = document.getElementById('inv-session-mode')?.value || 'B';
      const compareEnabled = document.getElementById('inv-session-compare-toggle')?.checked || false;
      const targetRackLayerId = document.getElementById('inv-session-racklayer-input')?.value?.trim() || '';
      const note = document.getElementById('inv-session-note')?.value?.trim() || '';
      const remember = document.getElementById('inv-session-remember')?.checked || false;

      if (!operatorId) {
        alert('担当者を選択してください。 / Vui lòng chọn nhân viên.');
        return;
      }

      if (!operatorName || operatorName === '-- 選択 / Chọn --') {
        alert('担当者が不正です。 / Nhân viên không hợp lệ.');
        return;
      }

      // ✅ FIX: Let InventoryManager generate session name (single source of truth)
      // If user didn't provide custom name, leave empty → InventoryManager will auto-generate
      // sessionName is already trimmed above, so just pass it as is

      const config = {
        operatorId,
        operatorName,
        sessionName, // can be empty, InventoryManager will auto-generate
        mode,
        compareEnabled,
        targetRackLayerId: compareEnabled ? targetRackLayerId : null,
        note,
        remember,
      };

      if (window.InventoryManager?.startSession) {
        const ok = window.InventoryManager.startSession(config);
        if (ok) this.hide();
      }
    },
  };

  // ============================================================================
  // Badge Manager (Desktop & Mobile)
  // ============================================================================
  const BadgeManager = {
    updateBadge(active) {
      console.log('[BadgeManager] Updating badge:', active ? 'ON' : 'OFF');
      this.updateDesktopBadge(active);
      this.updateMobileBadge(active);
    },

    updateDesktopBadge(active) {
      const actionBtn = document.getElementById('btn-inventory-settings');
      if (!actionBtn) return;

      const existingBadges = actionBtn.querySelectorAll('.inventory-badge');
      existingBadges.forEach((b) => b.remove());

      if (active) {
        const badge = document.createElement('span');
        badge.className = 'inventory-badge';
        badge.textContent = 'ON';
        badge.style.cssText =
          'position:absolute!important;top:4px!important;right:4px!important;background:#00c853!important;color:white!important;font-size:9px!important;font-weight:700!important;padding:2px 6px!important;border-radius:4px!important;line-height:1!important;box-shadow:0 1px 3px rgba(0,0,0,0.3)!important;z-index:10!important;pointer-events:none!important;';
        actionBtn.appendChild(badge);
        console.log('[BadgeManager] Desktop badge ON added');
      } else {
        console.log('[BadgeManager] Desktop badge removed');
      }
    },

    updateMobileBadge(active) {
      const navBtn = document.getElementById('nav-inventory-btn');
      const navIcon = document.getElementById('nav-inventory-icon');
      const navLabel = document.getElementById('nav-inventory-label');
      if (!navBtn || !navIcon || !navLabel) return;

      const existingBadges = navBtn.querySelectorAll('.inventory-badge');
      existingBadges.forEach((b) => b.remove());

      const jpSpan = navLabel.querySelector('.btn-label-ja');
      const viSpan = navLabel.querySelector('.btn-label-vi');

      if (active) {
        navIcon.className = 'fas fa-map-marker-alt bottom-nav-icon';
        if (jpSpan) jpSpan.textContent = '棚卸中';
        if (viSpan) viSpan.textContent = 'Đang kiểm kê';

        const badge = document.createElement('span');
        badge.className = 'inventory-badge';
        badge.textContent = 'ON';
        badge.style.cssText =
          'position:absolute;top:4px;right:4px;background:#00c853;color:white;font-size:9px;font-weight:700;padding:2px 5px;border-radius:3px;z-index:10;';
        navBtn.appendChild(badge);
        console.log('[BadgeManager] Mobile badge ON added');
      } else {
        navIcon.className = 'fas fa-clipboard-check bottom-nav-icon';
        if (jpSpan) jpSpan.textContent = '棚卸設定';
        if (viSpan) viSpan.textContent = 'Thiết lập kiểm kê';
        console.log('[BadgeManager] Mobile badge removed');
      }
    },
  };

  // ============================================================================
  // Event Handlers
  // ============================================================================
  const EventHandlers = {
    handleActionButtonClick() {
      const state = window.InventoryManager?.getState?.();
      if (state?.inventoryOn) {
        // Already ON - confirm turn OFF
        if (confirm('棚卸を終了しますか？ / Tắt chế độ kiểm kê?')) {
          if (window.InventoryManager?.turnOff) window.InventoryManager.turnOff();
        }
      } else {
        // Turn ON - show initial modal
        InitialModal.show();
      }
    },

    handleModeChanged(e) {
      // Listen to BOTH legacy (boolean) and new (object) event payloads
      let inventoryOn = false;

      // Case 1: legacy boolean payload
      if (typeof e.detail === 'boolean') {
        inventoryOn = e.detail;
      }
      // Case 2: new object payload { inventoryOn: true/false }
      else if (e.detail && typeof e.detail.inventoryOn === 'boolean') {
        inventoryOn = e.detail.inventoryOn;
      }
      // Case 3: from MobileDetailModal { active: true/false }
      else if (e.detail && typeof e.detail.active === 'boolean') {
        inventoryOn = e.detail.active;
      }

      BadgeManager.updateBadge(inventoryOn);

    },

    handleNotification(e) {
      const { message, type, text } = e.detail || {};
      // UI module can render toast or use existing notification system
      // For now, just log
      console.log('[InventoryUI] Notification:', type, text || message);
    },

    handleSessionChanged(e) {
      const session = e.detail?.session;
      if (session) {
        console.log('[InventoryUI] Session started/changed:', session);
      } else {
        console.log('[InventoryUI] Session ended');
      }

      // Update history display if session modal is open
      if (SessionSetup.modal) {
        SessionSetup.renderHistory();
      }
    },

    handleHistoryChanged(e) {
      console.log('[InventoryUI] History changed');
      // Update history display if session modal is open
      if (SessionSetup.modal) {
        SessionSetup.renderHistory();
      }
    },
  };

  // ============================================================================
  // Main InventoryUI API
  // ============================================================================
  const InventoryUI = {
    version: VERSION,

    init() {
      console.log('[InventoryUI] Initializing', VERSION);

      // Ensure dependencies loaded
      if (!window.InventoryManager) {
        console.error('[InventoryUI] InventoryManager not found! Load inventory-manager-r7.3.3.js first.');
        return;
      }

      // Bind events
      this.bindEvents();

      // Bind action buttons
      this.bindActionButton();

      console.log('[InventoryUI]', VERSION, 'Initialized ✅');
    },

    bindEvents() {
      // Listen to mode changes (BOTH legacy and new events)
      document.addEventListener('inventorymodeChanged', EventHandlers.handleModeChanged.bind(EventHandlers));
      document.addEventListener('inventory:modeChanged', EventHandlers.handleModeChanged.bind(EventHandlers));
      document.addEventListener('inventoryModeChanged', EventHandlers.handleModeChanged.bind(EventHandlers)); // also legacy boolean event

      // Listen to notifications
      document.addEventListener('inventorynotification', EventHandlers.handleNotification.bind(EventHandlers));
      document.addEventListener('inventory:notification', EventHandlers.handleNotification.bind(EventHandlers));

      // Listen to session changes
      document.addEventListener('inventorysessionChanged', EventHandlers.handleSessionChanged.bind(EventHandlers));
      document.addEventListener('inventory:sessionChanged', EventHandlers.handleSessionChanged.bind(EventHandlers));

      // Listen to history changes
      document.addEventListener('inventoryhistoryChanged', EventHandlers.handleHistoryChanged.bind(EventHandlers));
      document.addEventListener('inventory:historyChanged', EventHandlers.handleHistoryChanged.bind(EventHandlers));

      // Legacy event: inventorytoggle from mobile-detail-modal
      document.addEventListener('inventorytoggle', (e) => {
        const forceOpen = e.detail?.open;
        if (forceOpen) {
          InitialModal.show();
        } else {
          if (window.InventoryManager?.turnOff) window.InventoryManager.turnOff();
        }
      });
      document.addEventListener('inventory:toggle', (e) => {
        const forceOpen = e.detail?.open;
        if (forceOpen) {
          InitialModal.show();
        } else {
          if (window.InventoryManager?.turnOff) window.InventoryManager.turnOff();
        }
      });
    },

    bindActionButton() {
      // Desktop/iPad action button
      const actionBtn = document.getElementById('btn-inventory-settings');
      if (actionBtn) {
        actionBtn.addEventListener('click', EventHandlers.handleActionButtonClick.bind(EventHandlers));
        console.log('[InventoryUI] Desktop action button bound ✅');
      }

      // Mobile navbar button
      const navBtn = document.getElementById('nav-inventory-btn');
      if (navBtn) {
        navBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          EventHandlers.handleActionButtonClick.call(EventHandlers);
        });
        console.log('[InventoryUI] Mobile navbar button bound ✅');
      }
    },

    // ========================================================================
    // Public APIs for external calls
    // ========================================================================
    openSettings() {
      InitialModal.show();
    },

    showSessionSetupModal(prefill) {
      SessionSetup.show(prefill);
    },

    showInitialModal() {
      InitialModal.show();
    },

    // Toast notification (can be used by other modules)
    showToast(message, type = 'info', duration = 3000) {
      // Simple implementation - can be enhanced
      const existingToast = document.getElementById('inv-ui-toast');
      if (existingToast) existingToast.remove();

      const icons = {
        success: '✓',
        error: '✗',
        warning: '⚠',
        info: 'ℹ',
      };

      const icon = icons[type] || icons.info;

      const toast = document.createElement('div');
      toast.id = 'inv-ui-toast';
      toast.className = `inv-ui-toast inv-ui-toast-${type}`;
      toast.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 10001;
        background: white;
        padding: 16px 24px;
        border-radius: 12px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.12);
        display: flex;
        align-items: center;
        gap: 12px;
        opacity: 0;
        transition: opacity 0.3s ease;
        border-left: 4px solid ${
          type === 'success' ? '#51cf66' : type === 'error' ? '#ff6b6b' : type === 'warning' ? '#ffd43b' : '#339af0'
        };
      `;

      toast.innerHTML = `
        <span style="font-size: 24px;">${icon}</span>
        <span style="font-size: 15px; font-weight: 500; white-space: pre-line;">${escHtml(message)}</span>
      `;

      document.body.appendChild(toast);

      // Fade in
      setTimeout(() => {
        toast.style.opacity = '1';
      }, 10);

      // Auto hide
      if (duration > 0) {
        setTimeout(() => {
          toast.style.opacity = '0';
          setTimeout(() => {
            if (toast.parentNode) toast.remove();
          }, 300);
        }, duration);
      }
    },
  };

  // ============================================================================
  // Export to global
  // ============================================================================
  window.InventoryUI = InventoryUI;

  // ============================================================================
  // Auto init
  // ============================================================================
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        InventoryUI.init();
      },
      { once: true }
    );
  } else {
    InventoryUI.init();
  }
})();

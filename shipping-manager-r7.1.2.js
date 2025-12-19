/**
 * shipping-manager-r7.0.9.js
 * Vận chuyển / 出荷・移動 モジュール
 * 
 * CHANGELOG r7.0.9 (2025-12-15):
 * ✅ FIX: Chuẩn hóa Status trong statuslogs
 *    - Ship Out (xuất kho): Status = "OUT" (thay vì "CHECKOUT")
 *    - Ship In (nhận về): Status = "IN" (NEW)
 * ✅ NEW: Thêm AuditType phân biệt:
 *    - "SHIP-TO-COMPANY" cho xuất kho
 *    - "SHIP-FROM-COMPANY" cho nhận về từ công ty khác (NEW)
 * ✅ IMPROVE: Logic phân loại rõ ràng hơn:
 *    - FromCompanyID có, ToCompanyID trống → Ship Out (OUT)
 *    - FromCompanyID trống, ToCompanyID có → Ship In (IN)
 *    - Cả 2 đều có → Ship Move (không ghi statuslogs)
 * 
 * - Ghi log vận chuyển vào shiplog.csv (GitHub) qua /api/add-log
 * - Cập nhật storage_company trong molds.csv / cutters.csv qua /api/update-item
 * - Bố cục 3 cột giống Check-in: Nhập liệu / Trạng thái / Lịch sử
 * - Tương thích iPhone: dùng .checkio-panel + mobile CSS hiện tại
 * - Desktop/iPad: hiển thị trong upper-section như các module khác
 * 
 * Backend:
 * - POST https://ysd-moldcutter-backend.onrender.com/api/add-log
 * - POST https://ysd-moldcutter-backend.onrender.com/api/update-item
 * 
 * DataManager:
 * - Đọc/ghi shiplog, molds, cutters, companies, employees
 * - Gọi DataManager.recompute() sau khi cập nhật storage_company
 */
(function () {
  'use strict';

  const API_BASE = 'https://ysd-moldcutter-backend.onrender.com';
  const API_ADD_LOG = API_BASE + '/api/add-log';
  const API_UPDATE_ITEM = API_BASE + '/api/update-item';

  let currentItem = null;
  let isSaving = false;

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
      if (deltaY < 0) return; // chỉ xử lý kéo xuống

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

  const ShippingManager = {
    INIT() {
      console.log('[ShippingManager] r7.0.9 loaded');
      // Có thể mở rộng sau nếu cần lắng nghe event chung
    },

    openModal(item) {
      if (!item) {
        alert('Vui lòng chọn khuôn/dao trước.\n金型・抜型を先に選択してください。');
        return;
      }

      currentItem = item;

      // Xoá panel cũ nếu còn
      const existing = document.getElementById('ship-panel');
      if (existing) {
        existing.remove();
      }

      const upper = document.querySelector('.upper-section');
      if (!upper) {
        console.error('[ShippingManager] upper-section not found');
        return;
      }

      const isMobile = window.innerWidth <= 767;
      if (isMobile) {
        document.body.classList.add('modal-open');
      }

      const dm = window.DataManager;
      const data = dm && dm.data ? dm.data : {};
      const companies = data.companies || [];
      const employees = data.employees || [];
      const shiplog = data.shiplog || [];

      const isMold = !!item.MoldID;
      const itemId = isMold ? item.MoldID : item.CutterID;
      const itemName = item.MoldName || item.CutterName || item.MoldCode || item.CutterNo || '';

      // Lấy công ty đang lưu hiện tại (từ DataManager đã xử lý)
      const currentStorageId = item.storageCompanyId || item.storage_company || item.storage_companyId || '';
      const currentStorageName = this.getCompanyName(currentStorageId, companies);

      const historyLogs = this.buildHistoryLogs(shiplog, item);

      // Ngày mặc định = hôm nay (YYYY-MM-DD)
      const todayISO = new Date().toISOString().split('T')[0];

      const html = `
<div class="checkio-panel ship-panel" id="ship-panel">
  <!-- HEADER -->
  <div class="checkio-header">
    <div class="checkio-mode">
      <button type="button" class="mode-btn active" data-mode="shipping" style="cursor:default">
        出荷<br/>Vận chuyển
      </button>
    </div>
    <button class="btn-close-compact" id="ship-close" title="閉じる">✕</button>
  </div>

  <!-- BODY: 3 khu vực -->
  <div class="checkio-body">
    <!-- 1. INPUTS -->
    <section class="cio-inputs">
      <h4>入力欄<br/>Nhập liệu</h4>

      <!-- Nơi nhận (đặt trước) -->
      <div class="form-group">
        <label class="form-label">出荷先<br/>Nơi nhận</label>
        <div id="ship-to-select-container"></div>
      </div>

      <!-- Nơi gửi (ở phía dưới) -->
      <div class="form-group">
        <label class="form-label">出荷元<br/>Nơi gửi</label>
        <div id="ship-from-select-container"></div>
      </div>

      <!-- Các cột còn lại giữ nguyên -->
      <div class="form-group">
        <label class="form-label">担当者<br/>Nhân viên</label>
        <div id="ship-employee-select-container"></div>
      </div>

      <div class="form-group">
        <label class="form-label">出荷日<br/>Ngày gửi</label>
        <input type="date" id="ship-date" class="form-control" value="${todayISO}">
      </div>

      <div class="form-group">
        <label class="form-label">メモ<br/>Ghi chú</label>
        <textarea id="ship-note" class="form-control" rows="2" placeholder="備考を入力…\nGhi chú..."></textarea>
      </div>

      <div class="btn-row">
        <button class="btn-cancel" id="ship-cancel">キャンセル<br/>Hủy</button>
        <button class="btn-confirm" id="ship-save">確定<br/>Xác nhận</button>
      </div>
    </section>

    <!-- 2. STATUS -->
    <section class="cio-status">
      <h4>現在の状態<br/>Trạng thái hiện tại</h4>
      <div class="status-badges">
        <div class="badge-row">
          <span class="badge-label">ID</span>
          <div class="badge badge-mold">${itemId || '-'}</div>
        </div>
        <div class="badge-row">
          <span class="badge-label">名称<br/>Tên</span>
          <div class="badge badge-mold-name">${this.escapeHtml(itemName) || '-'}</div>
        </div>
        <div class="badge-row">
          <span class="badge-label">保管場所<br/>Nơi lưu hiện tại</span>
          <div class="badge badge-company">${currentStorageName || '-'}</div>
        </div>
      </div>
    </section>

    <!-- 3. HISTORY -->
    <section class="cio-history">
      <h4>履歴<br/>Lịch sử vận chuyển</h4>
      <div class="filter-row">
        <input type="text" id="ship-search" placeholder="🔍 検索… / Tìm kiếm..." />
      </div>
      <div class="history-wrap">
        ${this.renderHistory(historyLogs, companies, employees)}
      </div>
    </section>
  </div>
</div>
      `;

      upper.insertAdjacentHTML('beforeend', html);

      // Khởi tạo searchable selects
      this.initSearchableSelects(
        companies,
        employees,
        { defaultFromId: currentStorageId }
      );

      // Gán sự kiện
      this.bindModalEvents(item, companies, employees);

      // Gán bàn phím ảo focus input đầu
      setTimeout(() => {
        const firstInput = document.querySelector('#ship-panel input, #ship-panel textarea');
        if (firstInput) {
          firstInput.focus();
          document.dispatchEvent(
            new CustomEvent('keyboardattach', { detail: { element: firstInput } })
          );
        }
      }, 300);
    },

    close() {
      const panel = document.getElementById('ship-panel');
      if (panel) {
        panel.remove();
      }

      // Gỡ modal-open cho iPhone nếu không còn panel khác
      if (document.body.classList.contains('modal-open')) {
        const anyPanel =
          document.getElementById('cio-panel') || document.getElementById('loc-panel');
        if (!anyPanel) {
          document.body.classList.remove('modal-open');
        }
      }

      // Khôi phục focus cho tìm kiếm chính
      const searchBox = document.querySelector('input.search-input');
      if (searchBox) {
        searchBox.focus();
        document.dispatchEvent(
          new CustomEvent('keyboardattach', { detail: { element: searchBox } })
        );
      }
    },

    buildHistoryLogs(allLogs, item) {
      if (!Array.isArray(allLogs)) return [];
      const moldId = (item.MoldID || '').toString().trim();
      const cutterId = (item.CutterID || '').toString().trim();

      const logs = allLogs.filter((l) => {
        const lm = (l.MoldID || '').toString().trim();
        const lc = (l.CutterID || '').toString().trim();
        if (moldId) return lm === moldId;
        if (cutterId) return lc === cutterId;
        return false;
      });

      logs.sort((a, b) => {
        const ta = Date.parse(a.DateEntry || a.ShipDate) || 0;
        const tb = Date.parse(b.DateEntry || b.ShipDate) || 0;
        return tb - ta;
      });

      return logs;
    },

    renderHistory(logs, companies, employees) {
      if (!logs || logs.length === 0) {
        return '<div class="no-history">履歴なし<br/>Chưa có lịch sử</div>';
      }

      const rows = logs
        .map((l) => {
          const time = this.fmtDateTime(l.DateEntry || l.ShipDate);
          const fromName = this.getCompanyName(l.FromCompanyID, companies);
          const toName = this.getCompanyName(l.ToCompanyID, companies);
          const empName = this.getEmployeeName(l.EmployeeID, employees);
          const note = l.ShipNotes || '';

          return `
            <tr>
              <td data-time="${this.escapeHtml(l.DateEntry || l.ShipDate)}">${this.escapeHtml(time)}</td>
              <td>${this.escapeHtml(fromName || '-')}</td>
              <td>${this.escapeHtml(toName || '-')}</td>
              <td>${this.escapeHtml(empName || '-')}</td>
              <td class="note-cell">${this.escapeHtml(note)}</td>
            </tr>
          `;
        })
        .join('');

      return `
        <table class="history-table" id="ship-his">
          <thead>
            <tr>
              <th data-sort="time">時間 / Thời gian</th>
              <th>出荷元 / Nơi gửi</th>
              <th>出荷先 / Nơi nhận</th>
              <th>担当 / NV</th>
              <th>メモ / Ghi chú</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    },

    refreshHistoryInPlace(item) {
      const dm = window.DataManager;
      const data = dm && dm.data ? dm.data : {};
      const shiplog = data.shiplog || [];
      const companies = data.companies || [];
      const employees = data.employees || [];

      const logs = this.buildHistoryLogs(shiplog, item);
      const wrap = document.querySelector('#ship-panel .history-wrap');
      if (!wrap) return;

      wrap.innerHTML = this.renderHistory(logs, companies, employees);
      this.enableFilter();
    },

    initSearchableSelects(companies, employees, { defaultFromId } = {}) {
      const companyOptions = companies.map((c) => ({
        id: c.CompanyID,
        name: c.CompanyShortName || c.CompanyName || `(ID:${c.CompanyID})`
      }));

      const employeeOptions = employees.map((e) => ({
        id: e.EmployeeID,
        name: e.EmployeeName || e.name || e.EmployeeID
      }));

      const hasSearchable = typeof window.createSearchableSelect === 'function';

      // FROM company
      const fromContainer = document.getElementById('ship-from-select-container');
      if (fromContainer && hasSearchable) {
        const fromSelect = window.createSearchableSelect(
          'ship-from-company',
          companyOptions,
          function onSelect() {}
        );
        fromContainer.appendChild(fromSelect);

        if (defaultFromId) {
          if (typeof fromSelect.setValue === 'function') {
            fromSelect.setValue(defaultFromId);
          } else {
            const input = document.getElementById('ship-from-company');
            if (input) input.dataset.selectedId = defaultFromId;
          }
        }
      }

      // TO company
      const toContainer = document.getElementById('ship-to-select-container');
      if (toContainer && hasSearchable) {
        const toSelect = window.createSearchableSelect(
          'ship-to-company',
          companyOptions,
          function onSelect() {}
        );
        toContainer.appendChild(toSelect);
      }

      // Employee
      const empContainer = document.getElementById('ship-employee-select-container');
      if (empContainer && hasSearchable) {
        const empSelect = window.createSearchableSelect(
          'ship-employee',
          employeeOptions,
          function onSelect() {}
        );
        empContainer.appendChild(empSelect);

        if (employees && employees.length > 0) {
          const firstId = employees[0].EmployeeID;
          if (typeof empSelect.setValue === 'function') {
            empSelect.setValue(firstId);
          } else {
            const input = document.getElementById('ship-employee');
            if (input) input.dataset.selectedId = firstId;
          }
        }
      }

      this.enableFilter();
    },

    bindModalEvents(item, companies, employees) {
      const closeBtn = document.getElementById('ship-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.close());
      }

      const cancelBtn = document.getElementById('ship-cancel');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => this.close());
      }

      const saveBtn = document.getElementById('ship-save');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => this.saveRecord(item, companies, employees));
      }

      // Swipe xuống từ header để đóng modal Shipping (mobile)
      const panelEl = document.getElementById('ship-panel');
      const headerEl = panelEl ? panelEl.querySelector('.checkio-header') : null;
      attachSwipeToClose(headerEl, panelEl, () => ShippingManager.close());

      // ESC đóng
      document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape' || e.key === 'Esc') {
          const panel = document.getElementById('ship-panel');
          if (panel) {
            e.preventDefault();
            ShippingManager.close();
            document.removeEventListener('keydown', escHandler);
          }
        }
      });
    },

    async saveRecord(item, companies, employees) {
      if (isSaving) return;
      isSaving = true;

      try {
        const fromInput = document.getElementById('ship-from-company');
        const toInput = document.getElementById('ship-to-company');
        const empInput = document.getElementById('ship-employee');
        const dateInput = document.getElementById('ship-date');
        const noteInput = document.getElementById('ship-note');

        const fromCompanyId = (fromInput ? fromInput.dataset.selectedId || fromInput.value : '').trim();
        const toCompanyId = (toInput ? toInput.dataset.selectedId || toInput.value : '').trim();
        const empId = (empInput ? empInput.dataset.selectedId || empInput.value : '').trim();
        const shipDate = dateInput ? dateInput.value : '';
        const shipNotes = noteInput ? noteInput.value : '';

        // VALIDATION
        if (!toCompanyId) {
          alert('Vui lòng chọn nơi nhận.\n出荷先を選択してください。');
          (toInput || toInput).focus();
          return;
        }

        if (!empId) {
          alert('Vui lòng chọn nhân viên.\n担当者を選択してください。');
          (empInput || empInput).focus();
          return;
        }

        if (!shipDate) {
          alert('Vui lòng chọn ngày gửi.\n出荷日を選択してください。');
          (dateInput || dateInput).focus();
          return;
        }

        const isMold = !!item.MoldID;
        const moldId = item.MoldID || '';
        const cutterId = item.CutterID || '';

        const fromName = this.getCompanyName(fromCompanyId, companies);
        const toName = this.getCompanyName(toCompanyId, companies);

        const nowIso = new Date().toISOString();

        // ShipID mới
        const dmData = window.DataManager && window.DataManager.data ? window.DataManager.data : null;
        let newShipId = '1';
        if (dmData && Array.isArray(dmData.shiplog) && dmData.shiplog.length > 0) {
          const maxId = dmData.shiplog
            .map((l) => parseInt(l.ShipID, 10))
            .filter((n) => !isNaN(n))
            .reduce((max, n) => (n > max ? n : max), 0);
          newShipId = String(maxId + 1);
        }

        const shipEntry = {
          ShipID: newShipId,
          MoldID: moldId,
          CutterID: cutterId,
          FromCompanyID: fromCompanyId,
          ToCompanyID: toCompanyId,
          FromCompany: fromName || '',
          ToCompany: toName || '',
          ShipDate: shipDate,
          EmployeeID: empId,
          ShipNotes: shipNotes || '',
          DateEntry: nowIso
        };

        // ========================================
        // ✅ R7.0.9 FIX: XÁC ĐỊNH STATUS VÀ AUDITTYPE
        // ========================================
        let statusEntry = null;

        // Ship Out: FromCompanyID có, ToCompanyID trống
        const isShipOut = fromCompanyId && !toCompanyId;
        
        // Ship In: FromCompanyID trống, ToCompanyID có
        const isShipIn = !fromCompanyId && toCompanyId;

        // Ship Move: Cả 2 đều có → không ghi statuslogs
        const isShipMove = fromCompanyId && toCompanyId;

        if (isShipOut) {
          // ✅ SHIP OUT: Status = "OUT", AuditType = "SHIP-TO-COMPANY"
          statusEntry = {
            StatusLogID: '', // trống, backend sẽ gán nếu cần
            MoldID: moldId,
            CutterID: cutterId,
            ItemType: isMold ? 'mold' : 'cutter',
            Status: 'OUT', // ✅ FIX: "OUT" thay vì "CHECKOUT"
            Timestamp: nowIso,
            EmployeeID: empId,
            DestinationID: '', // chưa map sang destinations
            Notes: `出荷 (${fromName || 'YSD'} → ${toName})`, // Ghi chú nếu rõ là xuất kho do vận chuyển sang công ty khác
            AuditDate: shipDate || nowIso.split('T')[0], // dùng ngày ship (yyyy-mm-dd) giống các dòng AUDIT trong file
            AuditType: 'SHIP-TO-COMPANY' // ✅ Phong cách UPPERCASE giống AUDIT_ONLY, AUDIT-WITH-RELOCATION
          };
          console.log('[ShippingManager] Ship Out detected → Status: OUT, AuditType: SHIP-TO-COMPANY');

        } else if (isShipIn) {
          // ✅ NEW: SHIP IN: Status = "IN", AuditType = "SHIP-FROM-COMPANY"
          statusEntry = {
            StatusLogID: '',
            MoldID: moldId,
            CutterID: cutterId,
            ItemType: isMold ? 'mold' : 'cutter',
            Status: 'IN', // ✅ NEW: "IN" cho nhận về
            Timestamp: nowIso,
            EmployeeID: empId,
            DestinationID: toCompanyId, // Nơi nhận (YSD hoặc công ty khác)
            Notes: `入荷 (${fromName || '外部'} → ${toName})`, // Nhận từ công ty khác
            AuditDate: shipDate || nowIso.split('T')[0],
            AuditType: 'SHIP-FROM-COMPANY' // ✅ NEW: Phân biệt với ship out
          };
          console.log('[ShippingManager] Ship In detected → Status: IN, AuditType: SHIP-FROM-COMPANY');

        } else if (isShipMove) {
          // Ship Move: Không ghi statuslogs (chỉ ghi shiplog)
          console.log('[ShippingManager] Ship Move detected → No statuslogs entry');
        }
        // ========================================

        // ĐÓNG UI NGAY LẬP TỨC
        this.close();

        // Đóng panel "Vận chuyển"
        document.dispatchEvent(
          new CustomEvent('shipping-immediate-close', {
            detail: { item, fromCompanyId, toCompanyId, employeeId: empId, shipDate }
          })
        );

        this.showBilingualToast('processing');

        // 1. Ghi shiplog.csv
        const addRes = await fetch(API_ADD_LOG, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: 'shiplog.csv',
            entry: shipEntry
          })
        });

        const addJson = await addRes.json().catch(() => ({}));
        if (!addRes.ok || !addJson.success) {
          throw new Error(addJson.message || 'Không ghi được shiplog.');
        }

        // 2. Ghi statuslogs.csv (chỉ khi có statusEntry - CHECKOUT do ship ra ngoài công ty)
        if (statusEntry) {
          try {
            const statusRes = await fetch(API_ADD_LOG, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filename: 'statuslogs.csv',
                entry: statusEntry
              })
            });

            const statusJson = await statusRes.json().catch(() => ({}));
            if (!statusRes.ok || !statusJson.success) {
              console.warn(
                '[ShippingManager] Không ghi được statuslogs.csv:',
                statusJson.message || statusRes.status
              );
            }
          } catch (e) {
            console.warn(
              '[ShippingManager] Lỗi khi ghi statuslogs (bỏ qua, vẫn tiếp tục cập nhật storage_company):',
              e
            );
          }
        }

        // 3. Cập nhật storage_company trong molds/cutters
        const updatePayload = {
          filename: isMold ? 'molds.csv' : 'cutters.csv',
          itemIdField: isMold ? 'MoldID' : 'CutterID',
          itemIdValue: isMold ? moldId : cutterId,
          updates: {
            storage_company: toCompanyId
          }
        };

        const updRes = await fetch(API_UPDATE_ITEM, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload)
        });

        const updJson = await updRes.json().catch(() => ({}));
        if (!updRes.ok || !updJson.success) {
          throw new Error(updJson.message || 'Không cập nhật được nơi lưu trữ.');
        }

        // 4. Cập nhật DataManager in-memory
        const dm = window.DataManager;
        const data = dm && dm.data ? dm.data : null;

        if (data) {
          if (!Array.isArray(data.shiplog)) data.shiplog = [];
          data.shiplog.unshift({ ...shipEntry });

          if (statusEntry) {
            if (!Array.isArray(data.statuslogs)) data.statuslogs = [];
            data.statuslogs.unshift({ ...statusEntry });
          }

          if (isMold) {
            const mold = data.molds.find((m) => String(m.MoldID).trim() === String(moldId).trim());
            if (mold) {
              mold.storage_company = toCompanyId;
            }
          } else {
            const cutter = data.cutters.find((c) => String(c.CutterID).trim() === String(cutterId).trim());
            if (cutter) {
              cutter.storage_company = toCompanyId;
            }
          }

          if (typeof dm.recompute === 'function') {
            dm.recompute();
          }

          // Lấy lại item cập nhật
          let updatedItem = null;
          if (isMold) {
            updatedItem = data.molds.find((m) => String(m.MoldID).trim() === String(moldId).trim());
          } else {
            updatedItem = data.cutters.find((c) => String(c.CutterID).trim() === String(cutterId).trim());
          }

          if (updatedItem) {
            currentItem = updatedItem;
          }

          // Refresh lịch sử trong panel nếu còn mở trên iPad/desktop
          this.refreshHistoryInPlace(updatedItem);

          // Cập nhật detail panel + badge INOUT + UIRenderer + MobileDetailModal
          document.dispatchEvent(
            new CustomEvent('detailchanged', {
              detail: {
                item: updatedItem,
                itemType: isMold ? 'mold' : 'cutter',
                itemId: isMold ? updatedItem.MoldID : updatedItem.CutterID,
                source: 'shipping-sync'
              }
            })
          );

          document.dispatchEvent(
            new CustomEvent('shipping-completed', {
              detail: {
                item: updatedItem,
                success: true,
                fromCompanyId,
                toCompanyId,
                timestamp: nowIso
              }
            })
          );
        }

        this.showBilingualToast('success');
      } catch (err) {
        console.error('[ShippingManager] saveRecord error:', err);
        this.showBilingualToast('error', err && err.message ? String(err.message) : '');
        alert('Lỗi khi ghi dữ liệu vận chuyển.\n出荷データの登録に失敗しました。' + (err && err.message ? `\n${String(err.message)}` : ''));
      } finally {
        isSaving = false;
      }
    },

    enableFilter() {
      const input = document.getElementById('ship-search');
      const table = document.getElementById('ship-his');
      if (!input || !table) return;

      input.addEventListener('input', () => {
        const term = input.value.toLowerCase();
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach((row) => {
          const text = row.innerText.toLowerCase();
          row.style.display = text.includes(term) ? '' : 'none';
        });
      });
    },

    getCompanyName(companyId, companies) {
      if (!companyId) return '';
      const list = companies || [];
      const c = list.find((x) => String(x.CompanyID).trim() === String(companyId).trim());
      if (!c) return companyId;
      return c.CompanyShortName || c.CompanyName || `(ID:${c.CompanyID})` || companyId;
    },

    getEmployeeName(empId, employees) {
      if (!empId) return '';
      const list = employees || [];
      const e = list.find((x) => String(x.EmployeeID).trim() === String(empId).trim());
      if (!e) return empId;
      return e.EmployeeName || e.name || e.EmployeeID || empId;
    },

    fmtDateTime(dateStr) {
      if (!dateStr) return '-';
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${y}/${m}/${day} ${hh}:${mm}`;
    },

    escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    showBilingualToast(type, extraMessage) {
      let message;
      if (type === 'success') {
        message = 'Ghi nhận vận chuyển thành công.\n出荷データを登録しました。';
      } else if (type === 'error') {
        message = 'Lỗi ghi dữ liệu vận chuyển.\n出荷データの登録に失敗しました。';
        if (extraMessage) message += `\n${String(extraMessage)}`;
      } else {
        message = '処理中…\nĐang xử lý...';
      }
      this.showToast(message, type === 'error' ? 'error' : type === 'success' ? 'success' : 'info');
    },

    showToast(message, type) {
      const existing = document.getElementById('ship-toast');
      if (existing) {
        existing.remove();
      }

      const toast = document.createElement('div');
      toast.id = 'ship-toast';
      toast.className = `ship-toast ship-toast-${type || 'info'}`;
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
        pointerEvents: 'none'
      });

      document.body.appendChild(toast);

      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
      }, 2000);

      setTimeout(() => {
        toast.remove();
      }, 2600);
    }
  };

  // Xuất ra global cho action-buttons + modules khác
  window.ShippingManager = {
    openModal: ShippingManager.openModal.bind(ShippingManager),
    close: ShippingManager.close.bind(ShippingManager),
    init: ShippingManager.INIT.bind(ShippingManager)
  };

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ShippingManager.INIT);
  } else {
    ShippingManager.INIT();
  }
})();

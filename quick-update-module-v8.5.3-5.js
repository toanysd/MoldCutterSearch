/* ============================================================================
   quick-update-module-v8.5.3-4.js
   Module cập nhật nhanh (Wizard Flow) - Version 4
   - Hỗ trợ: Các bước (Steps), Shiplog, Background save.
   - Fix: Sửa lỗi 404 API bằng resolveApiUrl.
   - UI: Bổ sung nút Hủy bỏ vào tất cả các bước.
   ============================================================================ */

(function(global) {
    'use strict';

    var VERSION = 'v8.5.3-4';
    var DCH_FILE = 'datachangehistory.csv';

    function resolveApiUrl(path) {
        var p = String(path || '').trim();
        if (!p) return '';
        if (/^https?:\/\//i.test(p)) return p;
        var normalized = p.charAt(0) === '/' ? p : ('/' + p);
        
        // MCS_API_BASE_URL là biến toàn cục thường dùng trong hệ thống
        var base = global && global.MCS_API_BASE_URL;
        if (base && String(base).trim() && String(base).trim() !== 'undefined' && String(base).trim() !== 'null') {
            return String(base).replace(/\/+$/, '') + normalized;
        }

        // Fallback mặc định
        return 'https://ysd-moldcutter-backend.onrender.com' + normalized;
    }

    var API_UPSERT = resolveApiUrl('/api/csv/upsert');
    var API_ADD_LOG = resolveApiUrl('/api/add-log');

    var MODES = {
        WEIGHT: {
            jp: '重量更新', vi: 'Cập nhật Khối lượng', icon: 'fas fa-weight-hanging', color: '#f59e0b',
            fields: [
                { key: 'MoldWeightModified', labelJp: '金型重量', labelVi: 'Khối lượng khuôn', type: 'text', table: 'molds' },
                { key: 'TrayWeight', labelJp: 'トレイ重量', labelVi: 'Khối lượng khay', type: 'text', table: 'trays' }
            ]
        },
        DESIGN_INFO: {
            jp: '設計情報更新', vi: 'Cập nhật Thiết kế', icon: 'fas fa-ruler-combined', color: '#3b82f6',
            fields: [
                { key: 'CustomerTrayName', labelJp: 'トレイ名称', labelVi: 'Tên Sản phẩm KH', type: 'text', table: 'trays' },
                { key: 'CustomerDrawingNo', labelJp: '図面番号', labelVi: 'Mã Bản vẽ KH', type: 'text', table: 'trays' },
                { key: 'CustomerEquipmentNo', labelJp: '設備番号', labelVi: 'Mã Thiết bị KH', type: 'text', table: 'trays' }
            ]
        },
        LIFECYCLE: {
            jp: '運用状況 cập nhật', vi: 'Vận hành & Hủy trả', icon: 'fas fa-truck-loading', color: '#10b981',
            fields: [
                { 
                    key: 'MoldReturning', labelJp: '返却状況', labelVi: 'Trạng thái Trả khuôn', 
                    type: 'select', table: 'molds', 
                    options: [
                        { val: '', label: '-- Chọn / 選択 --' },
                        { val: '返却予定', label: '返却予定 (Scheduled)' },
                        { val: '返却済', label: '返却済 (Returned)' }
                    ] 
                },
                { key: 'MoldReturnedDate', labelJp: '返却日', labelVi: 'Ngày trả khuôn', type: 'date', table: 'molds' },
                { 
                    key: 'MoldDisposing', labelJp: '廃棄状況', labelVi: 'Trạng thái Hủy khuôn', 
                    type: 'select', table: 'molds',
                    options: [
                        { val: '', label: '-- Chọn / 選択 --' },
                        { val: '廃棄予定', label: '廃棄予定 (Scheduled for disposal)' },
                        { val: '廃棄済', label: '廃棄済 (Disposed)' }
                    ]
                },
                { key: 'MoldDisposedDate', labelJp: '廃棄日', labelVi: 'Ngày Hủy khuôn', type: 'date', table: 'molds' }
            ],
            hasShipping: true 
        }
    };

    var QuickUpdateModule = {
        isOpen: false,
        currentItem: null,
        currentMode: null,
        currentStep: 1,
        maxSteps: 3,
        
        wizardState: {
            employeeId: '',
            fields: {},
            originalFields: {},
            shipping: {
                enabled: false,
                from: 'YSD',
                to: '',
                notes: ''
            }
        },

        initDOM: function() {
            if (document.getElementById('qu-backdrop')) return;
            var backdrop = document.createElement('div');
            backdrop.id = 'qu-backdrop';
            backdrop.className = 'qu-backdrop';
            var modal = document.createElement('div');
            modal.id = 'qu-modal';
            modal.className = 'qu-modal';
            document.body.appendChild(backdrop);
            document.body.appendChild(modal);
            backdrop.addEventListener('click', this.close.bind(this));
        },

        openModal: function(modeKey, item) {
            if (!MODES[modeKey]) return;
            this.initDOM();
            this.currentItem = item;
            this.currentMode = modeKey;
            this.currentStep = 1;
            this.maxSteps = MODES[modeKey].hasShipping ? 4 : 3;

            this.wizardState = {
                employeeId: '',
                fields: {},
                originalFields: {},
                shipping: {
                    enabled: false,
                    from: 'YSD',
                    to: '',
                    notes: ''
                }
            };

            var m = MODES[modeKey];
            for (var i = 0; i < m.fields.length; i++) {
                var f = m.fields[i];
                var tInfo = this.resolveRecordKey(f.table, item);
                var val = '';
                if (tInfo && tInfo.idValue) {
                    var rowData = this.getTableData(tInfo.actualTable, tInfo.idField, tInfo.idValue);
                    if (rowData && rowData[f.key] !== undefined) val = String(rowData[f.key]);
                }
                this.wizardState.originalFields[f.key] = val;
                this.wizardState.fields[f.key] = val;

                if (f.type === 'date' && !val) {
                    this.wizardState.fields[f.key] = new Date().toISOString().split('T')[0];
                }
            }

            this.render();
            document.getElementById('qu-backdrop').classList.add('is-visible');
            document.getElementById('qu-modal').classList.add('is-visible');
            this.isOpen = true;
        },

        close: function() {
            var bd = document.getElementById('qu-backdrop');
            var md = document.getElementById('qu-modal');
            if (bd) bd.classList.remove('is-visible');
            if (md) md.classList.remove('is-visible');
            this.isOpen = false;
        },

        render: function() {
            var m = MODES[this.currentMode];
            var md = document.getElementById('qu-modal');
            var step = this.currentStep;

            var stepsHtml = '';
            for(var s=1; s<=this.maxSteps; s++) {
                var cls = s === step ? 'is-active' : (s < step ? 'is-done' : '');
                var icon = s < step ? '<i class="fas fa-check"></i>' : s;
                stepsHtml += `<div class="qu-progress-step ${cls}">${icon}</div>`;
            }

            md.innerHTML = `
                <div class="qu-progress-container">
                    <div class="qu-progress-bar">${stepsHtml}</div>
                </div>
                <div class="qu-header">
                    <div class="qu-header-title">
                        <span class="qu-title-jp">${m.jp} (${step}/${this.maxSteps})</span>
                        <span class="qu-title-vi">${m.vi}</span>
                    </div>
                    <button class="qu-close-btn" onclick="QuickUpdateModule.close()"><i class="fas fa-times"></i></button>
                </div>
                <div class="qu-body">
                    <div id="qu-step-content"></div>
                </div>
                <div class="qu-footer" id="qu-footer-content"></div>
            `;

            this.renderStepContent();
            this.renderFooter();
        },

        renderStepContent: function() {
            var container = document.getElementById('qu-step-content');
            var step = this.currentStep;

            if (step === 1) { 
                var emps = (global.DataManager && global.DataManager.data ? global.DataManager.data.employees : []) || [];
                var gridHtml = emps.slice(0, 12).map(e => {
                    var sel = this.wizardState.employeeId === e.EmployeeID ? 'is-selected' : '';
                    return `<div class="qu-selection-item ${sel}" data-emp-id="${e.EmployeeID}">
                        <span class="qu-sel-name">${e.EmployeeName || e.Name}</span>
                        <span class="qu-sel-sub">${e.EmployeeID}</span>
                    </div>`;
                }).join('');

                container.innerHTML = `
                    <div class="qu-label"><span class="qu-label-jp">担当者を選択してください</span><span class="qu-label-vi">Chọn nhân viên thực hiện</span></div>
                    <div class="qu-selection-grid">${gridHtml}</div>
                `;

                container.querySelectorAll('.qu-selection-item').forEach(el => {
                    el.onclick = () => {
                        this.wizardState.employeeId = el.dataset.empId;
                        this.nextStep();
                    };
                });
            } 
            else if (step === 2) { 
                var m = MODES[this.currentMode];
                var fieldsHtml = m.fields.map(f => {
                    var val = this.wizardState.fields[f.key] || '';
                    var input = '';
                    if (f.type === 'select') {
                        var opts = f.options.map(o => `<option value="${o.val}" ${val === o.val ? 'selected' : ''}>${o.label}</option>`).join('');
                        input = `<select class="qu-select" data-key="${f.key}">${opts}</select>`;
                    } else if (f.type === 'date') {
                        input = `<input type="date" class="qu-input" data-key="${f.key}" value="${val}">`;
                    } else {
                        input = `<input type="text" class="qu-input" data-key="${f.key}" value="${val}" placeholder="Nhập giá trị...">`;
                    }

                    return `<div class="qu-field">
                        <div class="qu-label"><span class="qu-label-jp">${f.labelJp}</span><span class="qu-label-vi">${f.labelVi}</span></div>
                        ${input}
                    </div>`;
                }).join('');

                container.innerHTML = fieldsHtml;
                container.querySelectorAll('input, select').forEach(el => {
                    el.onchange = () => { this.wizardState.fields[el.dataset.key] = el.value; };
                });
            }
            else if (step === 3 && this.maxSteps === 4) { 
                container.innerHTML = `
                    <div class="qu-field">
                        <label style="display:flex; align-items:center; gap:10px; font-weight:bold; cursor:pointer">
                            <input type="checkbox" id="qu-ship-toggle" ${this.wizardState.shipping.enabled ? 'checked' : ''}>
                            Tạo phiếu vận chuyển (Shiplog)?
                        </label>
                    </div>
                    <div id="qu-shipping-fields" style="display: ${this.wizardState.shipping.enabled ? 'block' : 'none'}">
                        <div class="qu-field">
                            <div class="qu-label"><span class="qu-label-jp">出荷元</span><span class="qu-label-vi">Nơi gửi</span></div>
                            <input type="text" class="qu-input" id="qu-ship-from" value="${this.wizardState.shipping.from}">
                        </div>
                        <div class="qu-field">
                            <div class="qu-label"><span class="qu-label-jp">出荷先</span><span class="qu-label-vi">Nơi nhận</span></div>
                            <input type="text" class="qu-input" id="qu-ship-to" value="${this.wizardState.shipping.to}" placeholder="...">
                        </div>
                        <div class="qu-field">
                            <div class="qu-label"><span class="qu-label-jp">備考</span><span class="qu-label-vi">Ghi chú vận chuyển</span></div>
                            <input type="text" class="qu-input" id="qu-ship-notes" value="${this.wizardState.shipping.notes}">
                        </div>
                    </div>
                `;
                var toggle = document.getElementById('qu-ship-toggle');
                toggle.onchange = () => {
                    this.wizardState.shipping.enabled = toggle.checked;
                    document.getElementById('qu-shipping-fields').style.display = toggle.checked ? 'block' : 'none';
                };
                ['from', 'to', 'notes'].forEach(k => {
                    var el = document.getElementById('qu-ship-' + k);
                    if (el) el.onchange = () => { this.wizardState.shipping[k] = el.value; };
                });
            }
            else { 
                var m = MODES[this.currentMode];
                var summary = m.fields.map(f => {
                    var val = this.wizardState.fields[f.key];
                    var old = this.wizardState.originalFields[f.key];
                    if (val === old) return '';
                    return `<div class="qu-summary-item">
                        <div class="qu-sum-label">
                            <div style="font-size:12px; font-weight:bold">${f.labelJp}</div>
                            <div style="font-size:10px; color:#666">${f.labelVi}</div>
                        </div>
                        <div class="qu-sum-val">${val || '(Rỗng)'}</div>
                    </div>`;
                }).join('');

                container.innerHTML = `
                    <div class="qu-hero-info">
                        <div class="qu-hero-icon" style="background-color: ${m.color}"><i class="${m.icon}"></i></div>
                        <div class="qu-hero-text">
                            <div class="qu-hero-code">${this.currentItem.MoldCode || this.currentItem.CutterNo}</div>
                            <div class="qu-hero-name">Thực hiện: ${this.getEmployeeName(this.wizardState.employeeId)}</div>
                        </div>
                    </div>
                    <div class="qu-summary-list">${summary || '<div style="padding:20px; text-align:center; color:#999">Không có thay đổi nào.</div>'}</div>
                `;
            }
        },

        renderFooter: function() {
            var footer = document.getElementById('qu-footer-content');
            var step = this.currentStep;

            var cancelBtn = `<button class="qu-btn qu-btn-cancel-text" onclick="QuickUpdateModule.close()"><i class="fas fa-times"></i> Hủy</button>`;

            if (step === 1) {
                footer.innerHTML = `
                    <div style="flex:1"></div>
                    <button class="qu-btn qu-btn-back" onclick="QuickUpdateModule.close()"><i class="fas fa-times"></i> Đóng / 閉じる</button>
                `;
            } else {
                var nextBtn = step === this.maxSteps 
                    ? `<button class="qu-btn qu-btn-save" id="qu-final-save"><i class="fas fa-cloud-upload-alt"></i> Cập nhật / 保存</button>`
                    : `<button class="qu-btn qu-btn-next" onclick="QuickUpdateModule.nextStep()">Tiếp theo / 次へ <i class="fas fa-arrow-right"></i></button>`;
                
                footer.innerHTML = `
                    ${cancelBtn}
                    <button class="qu-btn qu-btn-back" onclick="QuickUpdateModule.prevStep()"><i class="fas fa-arrow-left"></i> Quay lại</button>
                    ${nextBtn}
                `;
                
                if (document.getElementById('qu-final-save')) {
                    document.getElementById('qu-final-save').onclick = this.handleFinalSave.bind(this);
                }
            }
        },

        nextStep: function() { if (this.currentStep < this.maxSteps) { this.currentStep++; this.render(); } },
        prevStep: function() { if (this.currentStep > 1) { this.currentStep--; this.render(); } },

        handleFinalSave: async function() {
            var btn = document.getElementById('qu-final-save');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';

            this.close();
            this.notify('Đang gửi cập nhật và ghi Audit Log...', 'info');

            try {
                var m = MODES[this.currentMode];
                var changedAt = new Date().toISOString();

                for (var key in this.wizardState.fields) {
                    var newVal = this.wizardState.fields[key];
                    var oldVal = this.wizardState.originalFields[key];

                    if (newVal !== oldVal) {
                        var f = m.fields.find(field => field.key === key);
                        var tInfo = this.resolveRecordKey(f.table, this.currentItem);
                        if (!tInfo) continue;

                        // 1. Ghi web*.csv
                        var resWeb = await fetch(API_UPSERT, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                filename: tInfo.filename,
                                idField: tInfo.idField,
                                idValue: tInfo.idValue,
                                updates: { [key]: newVal },
                                mode: 'upsert'
                            })
                        });
                        if (!resWeb.ok) {
                            var errData = await resWeb.json().catch(function(){return {};});
                            throw new Error('Lỗi cập nhật ' + tInfo.filename + ': ' + (errData.message || resWeb.status));
                        }

                        // 2. Ghi datachangehistory.csv
                        var historyRow = {
                            DataChangeID: 'DCH' + Date.now() + Math.random().toString(36).substr(2, 5),
                            TableName: tInfo.actualTable,
                            RecordID: tInfo.idValue,
                            RecordIDField: tInfo.idField,
                            FieldName: key,
                            OldValue: oldVal,
                            NewValue: newVal,
                            ChangedAt: changedAt,
                            ChangedBy: this.wizardState.employeeId,
                            ChangeSource: 'quick_update_v4',
                            ChangeNote: 'Wizard Update v4',
                            IsConflict: 'FALSE'
                        };

                        var resHistory = await fetch(API_UPSERT, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                filename: DCH_FILE,
                                idField: 'DataChangeID',
                                idValue: historyRow.DataChangeID,
                                updates: historyRow,
                                mode: 'insert'
                            })
                        });
                        if (!resHistory.ok) {
                            var errLog = await resHistory.json().catch(function(){return {};});
                            throw new Error('Lỗi ghi Log ' + DCH_FILE + ': ' + (errLog.message || resHistory.status));
                        }
                    }
                }

                if (this.wizardState.shipping.enabled) {
                    var s = this.wizardState.shipping;
                    await fetch(API_ADD_LOG, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            filename: 'shiplog.csv',
                            entry: {
                                ShipID: 'SHIP' + Date.now(),
                                MoldID: this.currentItem.MoldID || '',
                                CutterID: this.currentItem.CutterID || '',
                                FromCompany: s.from,
                                ToCompany: s.to,
                                ShipDate: changedAt.split('T')[0],
                                EmployeeID: this.wizardState.employeeId,
                                ShipNotes: s.notes,
                                DateEntry: changedAt
                            }
                        })
                    });
                }

                this.notify('Đã lưu thành công!', 'success');
                
                if (global.DataManager && typeof global.DataManager.loadAllData === 'function') {
                    await global.DataManager.loadAllData();
                }

                if (global.DetailPanel && typeof global.DetailPanel.open === 'function') {
                    var type = this.currentItemType || (this.currentItem && (this.currentItem.type || this.currentItem.itemType)) || 'mold';
                    var idField = type === 'cutter' ? 'CutterID' : 'MoldID';
                    var idValue = this.currentItem && this.currentItem[idField];
                    var table = type === 'cutter' ? 'cutters' : 'molds';
                    var refreshedItem = this.currentItem;
                    
                    if (idValue && global.DataManager && global.DataManager.data && global.DataManager.data[table]) {
                        var list = global.DataManager.data[table];
                        for (var i = 0; i < list.length; i++) {
                            if (String(list[i][idField]) === String(idValue)) {
                                refreshedItem = list[i];
                                break;
                            }
                        }
                    }
                    this.currentItem = refreshedItem;
                    global.DetailPanel.open(refreshedItem, type, { skipHistory: true, restoreTab: global.DetailPanel.currentTab });
                }

            } catch (err) {
                console.error(err);
                this.notify('Lỗi: ' + err.message, 'error');
            }
        },

        resolveRecordKey: function(table, item) {
            if (table === 'molds') return { idValue: item.MoldID || item.CutterID, idField: item.MoldID ? 'MoldID' : 'CutterID', actualTable: item.MoldID ? 'molds' : 'cutters', filename: item.MoldID ? 'webmolds.csv' : 'webcutters.csv' };
            if (table === 'molddesign') return { idValue: item.MoldDesignID, idField: 'MoldDesignID', actualTable: 'molddesign', filename: 'webmolddesign.csv' };
            if (table === 'trays') return { idValue: item.TrayID || (item.designInfo && item.designInfo.TrayID), idField: 'TrayID', actualTable: 'trays', filename: 'webtray.csv' };
            return null;
        },
        getTableData: function(actualTable, idField, idValue) {
            var dm = global.DataManager && global.DataManager.data ? global.DataManager.data : {};
            var rows = dm[actualTable] || [];
            return rows.find(r => String(r[idField]).trim() === String(idValue).trim());
        },
        getEmployeeName: function(id) {
            var emps = (global.DataManager && global.DataManager.data ? global.DataManager.data.employees : []) || [];
            var e = emps.find(x => x.EmployeeID === id);
            return e ? (e.EmployeeName || e.Name) : id;
        },
        notify: function(msg, type) {
            if (global.NotificationModule) global.NotificationModule.show(msg, type); else alert(msg);
        }
    };

    global.QuickUpdateModule = QuickUpdateModule;
})(window);

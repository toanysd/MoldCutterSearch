// v10.0.0-PubSub
/* ============================================================================
   quick-update-module-v8.5.3-5.js
   Module cập nhật nhanh (Wizard Flow) - Version 5
   - Hỗ trợ: Các bước (Steps), Shiplog, Background save.
   - Fix: Sửa lỗi 404 API bằng resolveApiUrl.
   - UI: Bổ sung nút Hủy bỏ vào tất cả các bước.
   - Sec: Inject JWT logic into API fetch (auth guard).
   ============================================================================ */

(function (global) {
    'use strict';

    var VERSION = 'v8.5.3-5';
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
                { key: 'MoldWeight', labelJp: '金型重量', labelVi: 'Khối lượng khuôn', type: 'text', table: 'molds' },
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


        numpadPress: function (key) {
            var targetKey = this.wizardState.weightTarget;
            if (!targetKey) return;
            var val = String(this.wizardState.fields[targetKey] || '');
            if (key === 'C') {
                val = '';
            } else if (key === 'DEL') {
                val = val.slice(0, -1);
            } else if (key === '.') {
                if (!val.includes('.')) val += (val === '' ? '0.' : '.');
            } else {
                if (val === '0') val = key;
                else val += key;
            }
            this.wizardState.fields[targetKey] = val;
            var screen = document.getElementById('qu-numpad-screen');
            if (screen) screen.innerText = val || '0';
        },

        initDOM: function () {
            if (document.getElementById('qu-backdrop')) return;
            var backdrop = document.createElement('div');
            backdrop.id = 'qu-backdrop';
            backdrop.className = 'qu-backdrop';
            backdrop.style.zIndex = '10500';
            var modal = document.createElement('div');
            modal.id = 'qu-modal';
            modal.className = 'qu-modal';
            document.body.appendChild(backdrop);
            document.body.appendChild(modal);
            backdrop.addEventListener('click', this.close.bind(this));
        },

        openModal: function (modeKey, item, options) {
            if (!MODES[modeKey]) return;
            this.initDOM();

            this.currentItem = item;
            this.currentMode = modeKey;
            this.currentStep = 1;
            this.maxSteps = modeKey === 'WEIGHT' ? 4 : (MODES[modeKey].hasShipping ? 4 : 3);

            this.wizardState = {
                employeeId: '',
                fields: {},
                originalFields: {},
                shipping: {
                    enabled: false,
                    from: 'YSD',
                    to: '',
                    notes: ''
                },
                options: options || {}
            };

            if (modeKey === 'WEIGHT') {
                if (item && item.TrayID && !item.MoldID && !item.CutterID) {
                    this.wizardState.weightTarget = 'TrayWeight';
                }
            }

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

        close: function () {
            var bd = document.getElementById('qu-backdrop');
            var md = document.getElementById('qu-modal');
            if (bd) bd.classList.remove('is-visible');
            if (md) md.classList.remove('is-visible');
            this.isOpen = false;
            /* ── Gọi callback onClose nếu có (để khôi phục Photo Upload overlay) ── */
            if (this.wizardState && this.wizardState.options && typeof this.wizardState.options.onClose === 'function') {
                this.wizardState.options.onClose();
            }
        },

        render: function () {
            var m = MODES[this.currentMode];
            var md = document.getElementById('qu-modal');
            var step = this.currentStep;

            var stepsHtml = '';
            for (var s = 1; s <= this.maxSteps; s++) {
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

        renderStepContent: function () {
            var container = document.getElementById('qu-step-content');
            var step = this.currentStep;

            if (step === 1 && this.currentMode === 'WEIGHT') {
                container.innerHTML = `
                    <div class="qu-label"><span class="qu-label-jp">対象を選択してください</span><span class="qu-label-vi">Chọn đối tượng thiết bị cập nhật Khối lượng</span></div>
                    <div class="qu-selection-grid" style="grid-template-columns: 1fr; gap:16px;">
                        <div class="qu-selection-item" style="padding:24px; text-align:center" onclick="QuickUpdateModule.wizardState.weightTarget = 'MoldWeight'; QuickUpdateModule.nextStep()">
                            <i class="fas fa-cube" style="font-size:32px; color:#f59e0b; margin-bottom:12px; display:block"></i>
                            <span class="qu-title-jp" style="font-size:15px; font-weight:700">金型重量</span><br/>
                            <span class="qu-sel-name" style="font-size:16px; color:#475569">Khối lượng Khuôn</span>
                        </div>
                        <div class="qu-selection-item" style="padding:24px; text-align:center" onclick="QuickUpdateModule.wizardState.weightTarget = 'TrayWeight'; QuickUpdateModule.nextStep()">
                            <i class="fas fa-box" style="font-size:32px; color:#10b981; margin-bottom:12px; display:block"></i>
                            <span class="qu-title-jp" style="font-size:15px; font-weight:700">トレイ重量</span><br/>
                            <span class="qu-sel-name" style="font-size:16px; color:#475569">Khối lượng Khay</span>
                        </div>
                    </div>
                `;
            }
            else if ((step === 1 && this.currentMode !== 'WEIGHT') || (step === 2 && this.currentMode === 'WEIGHT')) {
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
            else if (step === 3 && this.currentMode === 'WEIGHT') {
                var targetKey = this.wizardState.weightTarget;
                var val = this.wizardState.fields[targetKey] || '';

                if (!val && targetKey === 'MoldWeight' && this.currentItem && this.currentItem.designInfo && this.currentItem.designInfo.MoldDesignWeight) {
                    // Xóa fallback DesignWeight ở đây
                }

                var targetName = targetKey === 'MoldWeight' ? '金型重量 / Khối lượng Khuôn' : 'トレイ重量 / Khối lượng Khay';

                if (!document.getElementById('qu-numpad-style')) {
                    var s = document.createElement('style');
                    s.id = 'qu-numpad-style';
                    s.innerHTML = `
                        .qu-numpad-display { font-size:36px; font-weight:bold; background:#f8fafc; padding:16px 20px; border-radius:12px; text-align:right; margin-bottom:20px; border: 2px solid #cbd5e1; height: 80px; display:flex; align-items:center; justify-content:flex-end; letter-spacing: 1px; color:#0f172a; box-shadow: inset 0 2px 4px rgba(0,0,0,0.05); }
                        .qu-numpad-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:12px; margin-bottom:12px; }
                        .qu-numpad-btn { background:#fff; border:1px solid #e2e8f0; border-radius:12px; height:68px; font-size:28px; font-weight:600; color:#334155; box-shadow:0 4px 6px rgba(0,0,0,0.05); cursor:pointer; user-select:none; display:flex; align-items:center; justify-content:center; transition: all 0.1s; }
                        .qu-numpad-btn:active { background:#e2e8f0; transform:translateY(2px); box-shadow:none; }
                        .qu-numpad-btn.btn-clear { color:#ef4444; background:#fee2e2; border-color:#fecaca; }
                        .qu-numpad-btn.btn-del { color:#64748b; background:#f1f5f9; border-color:#e2e8f0; }
                    `;
                    document.head.appendChild(s);
                }

                container.innerHTML = `
                    <div class="qu-label" style="text-align:center; font-size:16px; margin-bottom:12px; color:#475569">対象 / Đang cập nhật: <b style="color:#0f172a">${targetName}</b></div>
                    <div id="qu-numpad-screen" class="qu-numpad-display">${val || '0'}</div>
                    <div class="qu-numpad-grid">
                        <button class="qu-numpad-btn" onclick="QuickUpdateModule.numpadPress('7')">7</button>
                        <button class="qu-numpad-btn" onclick="QuickUpdateModule.numpadPress('8')">8</button>
                        <button class="qu-numpad-btn" onclick="QuickUpdateModule.numpadPress('9')">9</button>
                        <button class="qu-numpad-btn" onclick="QuickUpdateModule.numpadPress('4')">4</button>
                        <button class="qu-numpad-btn" onclick="QuickUpdateModule.numpadPress('5')">5</button>
                        <button class="qu-numpad-btn" onclick="QuickUpdateModule.numpadPress('6')">6</button>
                        <button class="qu-numpad-btn" onclick="QuickUpdateModule.numpadPress('1')">1</button>
                        <button class="qu-numpad-btn" onclick="QuickUpdateModule.numpadPress('2')">2</button>
                        <button class="qu-numpad-btn" onclick="QuickUpdateModule.numpadPress('3')">3</button>
                        <button class="qu-numpad-btn btn-clear" onclick="QuickUpdateModule.numpadPress('C')">C</button>
                        <button class="qu-numpad-btn" onclick="QuickUpdateModule.numpadPress('0')">0</button>
                        <button class="qu-numpad-btn" onclick="QuickUpdateModule.numpadPress('.')">.</button>
                    </div>
                    <div>
                        <button class="qu-numpad-btn btn-del" style="width:100%" onclick="QuickUpdateModule.numpadPress('DEL')"><i class="fas fa-backspace" style="margin-right:8px"></i> Xóa lùi</button>
                    </div>
                `;
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
            else if (step === 3 && MODES[this.currentMode].hasShipping) {
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

        renderFooter: function () {
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

        nextStep: function () {
            if (this.currentStep === 1 && this.currentMode === 'WEIGHT' && this.currentItem && this.currentItem.TrayID && !this.currentItem.MoldID && !this.currentItem.CutterID) {
                this.currentStep = 3;
            } else if (this.currentStep < this.maxSteps) {
                this.currentStep++;
            }
            this.render();
        },
        prevStep: function () {
            if (this.currentStep === 3 && this.currentMode === 'WEIGHT' && this.currentItem && this.currentItem.TrayID && !this.currentItem.MoldID && !this.currentItem.CutterID) {
                this.currentStep = 1;
            } else if (this.currentStep > 1) {
                this.currentStep--;
            }
            this.render();
        },

        handleFinalSave: async function () {
            var btn = document.getElementById('qu-final-save');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';

            this.close();
            this.notify('Đang gửi cập nhật và ghi Audit Log...', 'info');

            try {
                var m = MODES[this.currentMode];
                var changedAt = new Date().toISOString();

                var fetchHeaders = { 'Content-Type': 'application/json' };
                if (global.__MCS_JWT__) {
                    fetchHeaders['Authorization'] = 'Bearer ' + global.__MCS_JWT__;
                }

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
                            headers: fetchHeaders,
                            body: JSON.stringify({
                                filename: tInfo.filename,
                                idField: tInfo.idField,
                                idValue: tInfo.idValue,
                                updates: { [key]: newVal },
                                mode: 'upsert'
                            })
                        });
                        if (!resWeb.ok) {
                            var errData = await resWeb.json().catch(function () { return {}; });
                            throw new Error('Lỗi cập nhật ' + tInfo.filename + ': ' + (errData.error || errData.message || resWeb.status));
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
                            headers: fetchHeaders,
                            body: JSON.stringify({
                                filename: DCH_FILE,
                                idField: 'DataChangeID',
                                idValue: historyRow.DataChangeID,
                                updates: historyRow,
                                mode: 'insert'
                            })
                        });
                        if (!resHistory.ok) {
                            var errLog = await resHistory.json().catch(function () { return {}; });
                            throw new Error('Lỗi ghi Log ' + DCH_FILE + ': ' + (errLog.error || errLog.message || resHistory.status));
                        }
                    }
                }

                if (this.wizardState.shipping.enabled) {
                    var s = this.wizardState.shipping;
                    await fetch(API_ADD_LOG, {
                        method: 'POST',
                        headers: fetchHeaders,
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

                // Tối ưu hóa băng thông (In-Memory Mutation PubSub V10)
                if (global.DataManager && typeof global.DataManager.syncRecordLocally === 'function') {
                    for (var fieldKey in this.wizardState.fields) {
                        var newVal = this.wizardState.fields[fieldKey];
                        if (newVal !== this.wizardState.originalFields[fieldKey]) {
                            var f = m.fields.find(field => field.key === fieldKey);
                            var tInfo = this.resolveRecordKey(f.table, this.currentItem);
                            if (tInfo) {
                                let payload = {};
                                payload[fieldKey] = newVal;
                                global.DataManager.syncRecordLocally(tInfo.actualTable, tInfo.idField, tInfo.idValue, payload);
                            }
                        }
                    }
                }

                if (typeof this.wizardState.options.onSuccess === 'function') {
                    this.wizardState.options.onSuccess(this.wizardState.fields);
                }

            } catch (err) {
                console.error(err);
                this.notify('Lỗi: ' + err.message, 'error');
            }
        },

        resolveRecordKey: function (table, item) {
            if (table === 'molds') return { idValue: item.MoldID || item.CutterID, idField: item.MoldID ? 'MoldID' : 'CutterID', actualTable: item.MoldID ? 'molds' : 'cutters', filename: item.MoldID ? 'molds.csv' : 'cutters.csv' };
            if (table === 'molddesign') return { idValue: item.MoldDesignID, idField: 'MoldDesignID', actualTable: 'molddesign', filename: 'molddesign.csv' };
            if (table === 'trays') return { idValue: item.TrayID || (item.designInfo && item.designInfo.TrayID), idField: 'TrayID', actualTable: 'trays', filename: 'trays.csv' };
            return null;
        },
        getTableData: function (actualTable, idField, idValue) {
            var dm = global.DataManager && global.DataManager.data ? global.DataManager.data : {};
            var rows = dm[actualTable] || [];
            return rows.find(r => String(r[idField]).trim() === String(idValue).trim());
        },
        getEmployeeName: function (id) {
            var emps = (global.DataManager && global.DataManager.data ? global.DataManager.data.employees : []) || [];
            var e = emps.find(x => x.EmployeeID === id);
            return e ? (e.EmployeeName || e.Name) : id;
        },
        notify: function (msg, type) {
            if (global.NotificationModule) global.NotificationModule.show(msg, type); else alert(msg);
        }
    };

    global.QuickUpdateModule = QuickUpdateModule;
})(window);

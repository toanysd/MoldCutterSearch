// v9.0.2
/* ============================================================================
   relocate-wizard-module.js
   Module: Thay đổi vị trí (Nội bộ) bằng UI 4 Bước
   Hỗ trợ Bàn phím ảo cho việc chọn Vị trí (Rack/Layer).
============================================================================ */

(function (global) {
    "use strict";

    function resolveApiUrl(path) {
        var p = String(path || '').trim();
        var normalized = p.charAt(0) === '/' ? p : ('/' + p);
        if (global.MCS_API_BASE_URL) return global.MCS_API_BASE_URL.replace(/\/+$/, '') + normalized;
        return 'https://ysd-moldcutter-backend.onrender.com' + normalized;
    }

    var API_LOCATION = resolveApiUrl('/api/locationlog');
    var API_CHECKLOG = resolveApiUrl('/api/checklog');

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        var div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function JV(ja, vi) {
        return '<div style="font-weight:700; color:#1e293b; font-size:16px;">' + escapeHtml(ja) + '</div><div style="font-size:12px; font-weight:600; color:#64748b;">' + escapeHtml(vi) + '</div>';
    }

    function getTodayString() {
        var d = new Date();
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var dd = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + dd;
    }

    // Attempt to match typed quick code "233" or "23-3" against global DataManager racks/layers
    // Emulates CheckInOut resolve logic
    function resolveQuickCode(codeStr) {
        if (!codeStr || !global.DataManager || !global.DataManager.data) return null;
        var q = codeStr.trim().toLowerCase();
        q = q.replace(/[^0-9a-z]/g, '');

        var layers = global.DataManager.data.racklayers || [];
        var racks = global.DataManager.data.racks || [];

        for (var i = 0; i < layers.length; i++) {
            var lr = layers[i];

            // So khớp trực tiếp RackLayerID (quy ước thiết kế: 233 = Giá 23 - Tầng 3)
            var testA = String(lr.RackLayerID || '').toLowerCase().replace(/[^0-9a-z]/g, '');
            if (testA === q && q.length > 0) return lr;

            // Fallback: So khớp RackCode + LayerCode nếu có
            var rObj = racks.find(function (r) { return String(r.RackID) === String(lr.RackID); });
            if (rObj) {
                var cR = String(rObj.RackCode || rObj.RackName || '').toLowerCase().replace(/[^0-9a-z]/g, '');
                var cL = String(lr.LayerCode || lr.RackLayerNumber || '').toLowerCase().replace(/[^0-9a-z]/g, '');
                var merged = cR + cL;
                if (merged === q && q.length > 0) return lr;
            }
        }

        return null;
    }

    var RelocateWizardModule = {
        isOpen: false,
        currentItem: null,
        step: 1,
        maxSteps: 4,

        state: {
            employeeId: '',
            dateStr: getTodayString(),
            rackId: '',
            layerId: '',
            quickCode: '',
            notes: ''
        },

        openModal: function (item) {
            this.currentItem = item;
            this.step = 1;
            this.state = {
                employeeId: '',
                dateStr: getTodayString(),
                rackId: '',
                layerId: '',
                quickCode: '',
                notes: ''
            };

            var bd = document.getElementById('rw-backdrop');
            if (!bd) {
                this.initDOM();
                bd = document.getElementById('rw-backdrop');
            }

            this.render();
            bd.classList.remove('hidden');
            document.getElementById('rw-drawer').classList.remove('hidden');
            this.isOpen = true;
        },

        close: function () {
            var bd = document.getElementById('rw-backdrop');
            var dr = document.getElementById('rw-drawer');
            if (bd) bd.classList.add('hidden');
            if (dr) dr.classList.add('hidden');
            this.isOpen = false;
        },

        initDOM: function () {
            var bd = document.createElement('div');
            bd.id = 'rw-backdrop';
            bd.className = 'cio-backdrop hidden';
            bd.style.zIndex = '600005';
            bd.addEventListener('click', this.close.bind(this));

            var dr = document.createElement('div');
            dr.id = 'rw-drawer';
            dr.className = 'cio-panel hidden';
            dr.style.zIndex = '600006';

            document.body.appendChild(bd);
            document.body.appendChild(dr);
        },

        getEmployees: function () {
            if (global.DataManager && global.DataManager.data && global.DataManager.data.employees) return global.DataManager.data.employees;
            return [];
        },
        resolveEmployeeName: function (id) {
            var emps = this.getEmployees();
            for (var i = 0; i < emps.length; i++) {
                if (String(emps[i].EmployeeID) === String(id)) return emps[i].EmployeeName || id;
            }
            return id;
        },
        getRackInfo: function (layerId) {
            if (!layerId || !global.DataManager || !global.DataManager.data) return layerId;
            var layers = global.DataManager.data.racklayers || [];
            var racks = global.DataManager.data.racks || [];
            var lr = layers.find(function (l) { return String(l.RackLayerID) === String(layerId); });
            if (!lr) return layerId;
            var r = racks.find(function (x) { return String(x.RackID) === String(lr.RackID); });
            if (!r) return layerId;
            return escapeHtml(r.RackName) + ' - ' + escapeHtml(lr.LayerName || lr.RackLayerID);
        },

        render: function () {
            var dr = document.getElementById('rw-drawer');
            if (!dr) return;

            var code = (this.currentItem && (this.currentItem.MoldCode || this.currentItem.CutterNo || this.currentItem.TrayCode)) || '';
            var name = (this.currentItem && (this.currentItem.MoldName || this.currentItem.CutterName || this.currentItem.TrayName || this.currentItem.MoldTrayName)) || '';

            var html = '<div class="cio-topbar" style="background:#475569;">' +
                '<div class="cio-top-title">' +
                '<div class="ja" style="color:#fff;">' + escapeHtml(code) + '</div><div class="vi" style="color:#cbd5e1;">Thay đổi vị trí (Rack)</div>' +
                '</div>' +
                '<div class="cio-top-actions"><button type="button" class="cio-top-btn" id="rw-close" style="color:#fff;"><span class="ja">閉じる</span><span class="vi">Đóng</span></button></div>' +
                '</div>';

            html += '<div class="cio-body" style="background:#f1f5f9;">';
            html += '<div class="cio-desktop">';

            // --- RIGHT COLUMN: CONTROLS (STEPS) - PUT FIRST IN DOM FOR MOBILE! ---
            html += '<div class="cio-col cio-col-controls">';
            html += '<div class="cio-card" style="padding:16px;">';
            html += '<div class="cio-hero" style="margin-bottom:12px;">';
            html += '<div class="cio-hero-code">' + escapeHtml(code) + '</div>';
            html += '<div class="cio-hero-name">' + escapeHtml(name) + '</div>';
            html += '</div>';

            html += '<div style="display:flex; gap:4px; margin-bottom:16px; justify-content:center;">';
            for (var i = 1; i <= this.maxSteps; i++) {
                var bg = i === this.step ? '#3b82f6' : (i < this.step ? '#10b981' : '#e2e8f0');
                html += '<div style="flex:1; height:4px; border-radius:2px; background:' + bg + ';"></div>';
            }
            html += '</div>';

            html += '<div id="rw-step-content" style="min-height: 250px;">';
            html += this.renderStepContent();
            html += '</div>';

            html += '</div>'; // close card
            html += '</div>'; // close controls

            // --- LEFT COLUMN: HISTORY ---
            html += '<div class="cio-col cio-col-history">';
            html += '<div class="cio-card" style="padding:16px; flex:1;">';
            html += '<div style="margin-bottom:8px; display:flex; align-items:center; justify-content:space-between;">';
            html += '  <div style="display:flex; align-items:center; gap:8px;">' + JV('位置変更履歴', 'Lịch sử Vị trí') + '</div>';
            html += '</div>';
            html += '<div id="rw-history-tbl"></div>';
            html += '</div>'; // close card
            html += '</div>'; // close col history

            html += '</div>'; // close desktop
            html += '</div>'; // close body

            dr.innerHTML = html;

            var self = this;
            document.getElementById('rw-close').addEventListener('click', function () { self.close(); });
            this.bindStepEvents();
            this.renderHistory();
        },

        renderStepContent: function () {
            var html = '';
            var primaryBtnStyle = 'display:flex; flex-direction:column; align-items:center; justify-content:center; background:#3b82f6; color:#fff; border:none; padding:8px 20px; border-radius:8px; font-weight:bold; cursor:pointer; min-width:120px;';
            var secondaryBtnStyle = 'display:flex; flex-direction:column; align-items:center; justify-content:center; background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; padding:8px 20px; border-radius:8px; font-weight:bold; cursor:pointer; min-width:120px;';

            if (this.step === 1) {
                html += '<div style="margin-bottom:16px;"><i class="fas fa-calendar-day"></i> ' + JV('担当者と日付', 'Bước 1: Ngày & Nhân viên') + '</div>';

                html += '<div style="margin-bottom:12px;">';
                html += '<label style="font-size:12px; font-weight:bold; color:#64748b;">変更日 / Ngày thực hiện:</label>';
                html += '<input id="rw-date-input" type="date" class="cio-control" value="' + escapeHtml(this.state.dateStr) + '" style="margin-top:4px;" />';
                html += '</div>';

                html += '<div style="margin-bottom:16px; position:relative;">';
                html += '<input id="rw-emp-input" class="cio-control" type="text" placeholder="入力... / Nhập mã hoặc tên nhân viên..." value="' + escapeHtml(this.state.employeeId) + '" autocomplete="off" />';
                html += '<div id="rw-emp-sugg" style="position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #cbd5e1; border-top:none; border-radius:0 0 8px 8px; max-height:160px; overflow-y:auto; display:none; z-index:10; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);"></div>';
                html += '</div>';

                html += '<div style="font-size:12px; font-weight:bold; color:#64748b; margin-bottom:8px;">よく使う担当者 / Truy cập nhanh:</div>';
                html += '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;" id="rw-emp-list">';
                var emps = this.getEmployees().slice(0, 12);
                for (var i = 0; i < emps.length; i++) {
                    var isS = String(this.state.employeeId) === String(emps[i].EmployeeID);
                    var bg = isS ? '#dbeafe' : '#f8fafc';
                    var bd = isS ? '#3b82f6' : '#e2e8f0';
                    var c = isS ? '#1d4ed8' : '#334155';
                    html += '<button type="button" class="rw-emp-pick" data-val="' + escapeHtml(emps[i].EmployeeID) + '" style="cursor:pointer; background:' + bg + '; border:2px solid ' + bd + '; color:' + c + '; border-radius:8px; padding:12px 4px; text-align:center; font-weight:700; font-size:13px; line-height:1.2;">';
                    html += escapeHtml(emps[i].EmployeeName || emps[i].EmployeeID);
                    html += '</button>';
                }
                html += '</div>';

                html += '<div style="margin-top:24px; display:flex; justify-content:flex-end;">';
                html += '<button id="rw-next" style="' + primaryBtnStyle + '"><div>次へ</div><div style="font-size:11px;font-weight:normal;">Tiếp theo <i class="fas fa-arrow-right"></i></div></button>';
                html += '</div>';
            }
            else if (this.step === 2) {
                html += '<div style="margin-bottom:16px;"><i class="fas fa-map-pin"></i> ' + JV('場所の入力', 'Bước 2: Mã Vị trí (Rack)') + '</div>';

                html += '<div style="margin-bottom:12px; display:flex; gap:12px;">';
                html += '<div style="flex:1;">';
                html += '<p style="font-size:12px; color:#64748b; margin:0 0 4px 0; font-weight:bold;">Nhập nhanh (Ví dụ: 233):</p>';
                html += '<div style="display:flex; gap:8px;">';
                html += '<input id="rw-code-input" class="cio-control" type="text" placeholder="233" value="' + escapeHtml(this.state.quickCode) + '" style="font-size:20px; font-weight:bold; letter-spacing:1px; text-align:center;" />';
                html += '<button id="rw-code-verify" style="background:#10b981; color:#fff; border:none; padding:0 16px; border-radius:6px; cursor:pointer;"><i class="fas fa-search"></i> Kiểm tra</button>';
                html += '</div>';
                html += '<div id="rw-code-result" style="margin-top:8px; min-height:20px; font-size:13px; font-weight:bold; color:#2563eb;"></div>';
                html += '</div>';
                html += '</div>';

                // Virtual Numpad
                html += '<div style="background:#f1f5f9; border-radius:12px; padding:12px; margin-bottom:16px;">';
                html += '<div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">';
                var keypad = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '-', '0', 'DEL'];
                for (var j = 0; j < keypad.length; j++) {
                    var k = keypad[j];
                    if (k === 'DEL') {
                        html += '<button type="button" class="rw-pad-btn" data-key="DEL" style="padding:16px 0; font-size:16px; font-weight:bold; border-radius:8px; border:none; background:#ef4444; color:#fff; cursor:pointer;"><i class="fas fa-backspace"></i> Xóa</button>';
                    } else {
                        html += '<button type="button" class="rw-pad-btn" data-key="' + k + '" style="padding:16px 0; font-size:20px; font-weight:bold; border-radius:8px; border:1px solid #cbd5e1; background:#fff; color:#334155; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.05);">' + k + '</button>';
                    }
                }
                html += '</div>';
                html += '</div>';

                html += '<div style="text-align:center; color:#94a3b8; font-size:11px; margin-bottom:8px;">--- HOẶC CHỌN THỦ CÔNG ---</div>';
                html += '<div style="display:flex; gap:8px;">';
                html += '<div style="flex:1;">';
                html += '<select id="rw-sel-rack" class="cio-control" style="font-size:14px;"><option value="">-- Chọn Giá (Rack) --</option></select>';
                html += '</div>';
                html += '<div style="flex:1;">';
                html += '<select id="rw-sel-layer" class="cio-control" style="font-size:14px;"><option value="">-- Chọn Tầng (Layer) --</option></select>';
                html += '</div>';
                html += '</div>';

                html += '<div style="margin-top:24px; display:flex; justify-content:space-between;">';
                html += '<button id="rw-prev" style="' + secondaryBtnStyle + '"><div>戻る</div><div style="font-size:11px;font-weight:normal;"><i class="fas fa-arrow-left"></i> Quay lại</div></button>';
                html += '<button id="rw-next" style="' + primaryBtnStyle + '"><div>次へ</div><div style="font-size:11px;font-weight:normal;">Tiếp theo <i class="fas fa-arrow-right"></i></div></button>';
                html += '</div>';
            }
            else if (this.step === 3) {
                html += '<div style="margin-bottom:16px;"><i class="fas fa-pen"></i> ' + JV('備考（任意）', 'Bước 3: Ghi chú') + '</div>';
                html += '<input id="rw-note-input" class="cio-control" type="text" placeholder="Nhập ghi chú đổi vị trí..." value="' + escapeHtml(this.state.notes) + '" style="margin-bottom:12px; height: 50px; font-size:16px;" autocomplete="off" />';

                html += '<div style="margin-top:24px; display:flex; justify-content:space-between;">';
                html += '<button id="rw-prev" style="' + secondaryBtnStyle + '"><div>戻る</div><div style="font-size:11px;font-weight:normal;"><i class="fas fa-arrow-left"></i> Quay lại</div></button>';
                html += '<button id="rw-next" style="' + primaryBtnStyle + '"><div>次へ</div><div style="font-size:11px;font-weight:normal;">Tiếp theo <i class="fas fa-arrow-right"></i></div></button>';
                html += '</div>';
            }
            else if (this.step === 4) {
                var empName = this.resolveEmployeeName(this.state.employeeId);
                var locDisplay = this.getRackInfo(this.state.layerId);

                html += '<div style="margin-bottom:16px;"><i class="fas fa-check-circle"></i> ' + JV('確認と送信', 'Bước 4: Hoàn tất') + '</div>';

                html += '<div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:12px; margin-bottom:16px; line-height:1.6; font-size:14px;">';
                html += '<div><span style="color:#64748b;font-weight:bold;">変更日 (Ngày đổi):</span> <span style="font-weight:bold;color:#0f172a;">' + escapeHtml(this.state.dateStr) + '</span></div>';
                html += '<div><span style="color:#64748b;font-weight:bold;">担当者 (Nhân viên):</span> <span style="font-weight:bold;color:#1d4ed8;">' + escapeHtml(empName) + '</span></div>';
                html += '<div><span style="color:#64748b;font-weight:bold;">新しい位置 (Vị trí mới):</span> <span style="font-weight:bold;color:#10b981;">' + escapeHtml(locDisplay) + '</span></div>';
                html += '<div><span style="color:#64748b;font-weight:bold;">備考 (Ghi chú):</span> ' + escapeHtml(this.state.notes || '---') + '</div>';
                html += '</div>';

                html += '<button id="rw-submit" style="width:100%; background:#3b82f6; color:#fff; border:none; padding:12px 0; border-radius:8px; cursor:pointer;"><i class="fas fa-save" style="margin-bottom:4px;"></i>' + JV('位置変更と同時にチェックイン', 'ĐỔI VỊ TRÍ & CHECK-IN') + '</button>';

                html += '<div style="margin-top:24px; text-align:left;">';
                html += '<button id="rw-prev" style="' + secondaryBtnStyle + ' width:100%;"><div>修正する</div><div style="font-size:11px;font-weight:normal;"><i class="fas fa-arrow-left"></i> Quay lại sửa</div></button>';
                html += '</div>';
            }
            return html;
        },

        bindStepEvents: function () {
            var self = this;

            var advanceStep = function () {
                if (self.step === 1) {
                    var dtInput = document.getElementById('rw-date-input');
                    if (dtInput) self.state.dateStr = dtInput.value;
                    if (!String(self.state.employeeId).trim()) { alert('社員を選択してください / Vui lòng chọn Nhân viên!'); return; }
                    if (!String(self.state.dateStr).trim()) { alert('Ngày không được bỏ trống!'); return; }
                }
                if (self.step === 2) {
                    var quickIn = document.getElementById('rw-code-input');
                    if (quickIn) self.state.quickCode = quickIn.value;
                    if (!String(self.state.layerId).trim()) { alert('新しい位置が選択されていません / Vui lòng điền đúng mã vị trí!'); return; }
                }
                if (self.step === 3) {
                    var ni = document.getElementById('rw-note-input');
                    if (ni) self.state.notes = ni.value;
                }
                self.step++;
                self.render();
            };

            var nxt = document.getElementById('rw-next');
            if (nxt) nxt.addEventListener('click', advanceStep);

            var prv = document.getElementById('rw-prev');
            if (prv) prv.addEventListener('click', function () {
                self.step--;
                self.render();
            });

            // Employee interact logic
            if (this.step === 1) {
                var inpEmp = document.getElementById('rw-emp-input');
                var suggEmp = document.getElementById('rw-emp-sugg');
                if (inpEmp && suggEmp) {
                    var srcE = self.getEmployees();
                    inpEmp.addEventListener('input', function () {
                        var str = (inpEmp.value || '').trim();
                        self.state.employeeId = str;
                        if (!str) { suggEmp.style.display = 'none'; return; }
                        var sLow = str.toLowerCase();
                        var matched = srcE.filter(function (x) {
                            return String(x.EmployeeID || '').toLowerCase().includes(sLow) || String(x.EmployeeName || '').toLowerCase().includes(sLow);
                        });
                        if (matched.length === 0) { suggEmp.style.display = 'none'; return; }
                        var h = '';
                        for (var m = 0; m < matched.length; m++) {
                            h += '<div class="sugg-row" data-val="' + escapeHtml(matched[m].EmployeeID) + '" style="padding:12px; border-bottom:1px solid #f1f5f9; cursor:pointer;">' + escapeHtml(matched[m].EmployeeName || matched[m].EmployeeID) + '</div>';
                        }
                        suggEmp.innerHTML = h;
                        suggEmp.style.display = 'block';
                        suggEmp.querySelectorAll('.sugg-row').forEach(function (row) {
                            row.addEventListener('click', function () {
                                self.state.employeeId = this.getAttribute('data-val');
                                inpEmp.value = self.state.employeeId;
                                suggEmp.style.display = 'none';
                                advanceStep();
                            });
                        });
                    });
                    inpEmp.addEventListener('blur', function () { setTimeout(function () { suggEmp.style.display = 'none'; }, 200); });
                }

                var ePicks = document.querySelectorAll('.rw-emp-pick');
                ePicks.forEach(function (e) {
                    e.addEventListener('click', function () {
                        self.state.employeeId = this.getAttribute('data-val');
                        var dtInput = document.getElementById('rw-date-input');
                        if (dtInput) self.state.dateStr = dtInput.value;
                        advanceStep();
                    });
                });
            }

            // Location Step
            if (this.step === 2) {
                var btnVerify = document.getElementById('rw-code-verify');
                var resEl = document.getElementById('rw-code-result');
                var inpCode = document.getElementById('rw-code-input');
                var selRack = document.getElementById('rw-sel-rack');
                var selLayer = document.getElementById('rw-sel-layer');

                var data = global.DataManager && global.DataManager.data ? global.DataManager.data : null;
                var racks = data ? data.racks || [] : [];
                var layers = data ? data.racklayers || [] : [];

                // Fill Rack dropdown
                if (selRack && selLayer) {
                    var rOpts = '<option value="">-- Chọn Giá --</option>';
                    for (var r = 0; r < racks.length; r++) { rOpts += '<option value="' + escapeHtml(racks[r].RackID) + '">' + escapeHtml(racks[r].RackName) + '</option>'; }
                    selRack.innerHTML = rOpts;

                    var updateLayers = function () {
                        var rid = selRack.value;
                        var lOpts = '<option value="">-- Chọn Tầng --</option>';
                        if (rid) {
                            var fs = layers.filter(function (x) { return String(x.RackID) === String(rid); });
                            for (var lf = 0; lf < fs.length; lf++) { lOpts += '<option value="' + escapeHtml(fs[lf].RackLayerID) + '">' + escapeHtml(fs[lf].LayerName) + '</option>'; }
                        }
                        selLayer.innerHTML = lOpts;
                    };

                    selRack.addEventListener('change', function () {
                        self.state.rackId = selRack.value;
                        self.state.layerId = '';
                        updateLayers();
                    });
                    selLayer.addEventListener('change', function () {
                        self.state.layerId = selLayer.value;
                        if (self.state.layerId) {
                            resEl.innerHTML = '<span style="color:#10b981;"><i class="fas fa-check"></i> Đã chọn qua dropdown: ' + escapeHtml(self.getRackInfo(self.state.layerId)) + '</span>';
                            self.state.quickCode = '';
                            if (inpCode) inpCode.value = '';
                        }
                    });

                    if (self.state.rackId) {
                        selRack.value = self.state.rackId;
                        updateLayers();
                        if (self.state.layerId) selLayer.value = self.state.layerId;
                    }
                }

                var checkCode = function () {
                    var val = inpCode.value;
                    self.state.quickCode = val;
                    var found = resolveQuickCode(val);
                    if (found) {
                        self.state.layerId = found.RackLayerID;
                        self.state.rackId = found.RackID;
                        resEl.innerHTML = '<span style="color:#10b981;"><i class="fas fa-check"></i> Tự động nhận diện: ' + escapeHtml(self.getRackInfo(found.RackLayerID)) + '</span>';
                        if (selRack) {
                            selRack.value = found.RackID;
                            updateLayers();
                            if (selLayer) selLayer.value = found.RackLayerID;
                        }
                    } else {
                        self.state.layerId = '';
                        resEl.innerHTML = '<span style="color:#ef4444;"><i class="fas fa-times"></i> Không tìm thấy mã vị trí (' + escapeHtml(val) + ')</span>';
                    }
                };

                if (btnVerify) btnVerify.addEventListener('click', checkCode);

                // Auto-evaluate when typing
                if (inpCode) {
                    inpCode.addEventListener('input', function () {
                        var v = this.value;
                        self.state.quickCode = v;
                        if (v.length >= 2) checkCode();
                    });
                }

                // Virtual Numpad
                var pads = document.querySelectorAll('.rw-pad-btn');
                pads.forEach(function (pad) {
                    pad.addEventListener('click', function () {
                        var k = this.getAttribute('data-key');
                        if (!inpCode) return;
                        if (k === 'DEL') {
                            inpCode.value = inpCode.value.slice(0, -1);
                        } else {
                            inpCode.value = inpCode.value + k;
                        }
                        inpCode.dispatchEvent(new Event('input')); // trigger auto check
                    });
                });
            }

            var btnSubmit = document.getElementById('rw-submit');
            if (btnSubmit) btnSubmit.addEventListener('click', function () { self.submitRelocate(); });
        },

        renderHistory: function () {
            var el = document.getElementById('rw-history-tbl');
            if (!el) return;
            var isMold = Boolean(this.currentItem && this.currentItem.MoldID);
            var isCutter = Boolean(this.currentItem && this.currentItem.CutterID && !this.currentItem.MoldID);
            var isTray = Boolean(this.currentItem && this.currentItem.TrayID && !this.currentItem.MoldID && !this.currentItem.CutterID);
            var idToFind = isTray ? this.currentItem.TrayID : (isMold ? this.currentItem.MoldID : this.currentItem.CutterID);

            var allSt = [];
            if (global.DataManager && global.DataManager.data && global.DataManager.data.statuslogs) {
                allSt = global.DataManager.data.statuslogs;
            }

            var records = allSt.filter(x => {
                if (x.UpdateType !== 'Location') return false;
                if (isMold && x.MoldID == idToFind) return true;
                if (isCutter && x.CutterID == idToFind) return true;
                if (isTray && x.TrayID == idToFind) return true;
                return false;
            });
            records.sort((a, b) => new Date(b.Timestamp).getTime() - new Date(a.Timestamp).getTime());

            if (!records.length) { el.innerHTML = '<i style="color:#94a3b8;font-size:12px;">履歴なし / Chưa có bản ghi lưu vị trí nào</i>'; return; }

            var stbl = '<div style="max-height:220px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px;">';
            stbl += '<table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">';
            stbl += '<thead style="background:#f8fafc; position:sticky; top:0; z-index:1;"><tr>';
            stbl += '<th style="padding:8px 4px; border-bottom:1px solid #cbd5e1; color:#64748b;">日時 / Ngày</th>';
            stbl += '<th style="padding:8px 4px; border-bottom:1px solid #cbd5e1; color:#64748b;">担当 / NV</th>';
            stbl += '<th style="padding:8px 4px; border-bottom:1px solid #cbd5e1; color:#64748b;">行先 / Nơi đến</th>';
            stbl += '</tr></thead><tbody>';

            for (var z = 0; z < records.length; z++) {
                var sr = records[z];
                var sd = new Date(sr.Timestamp);
                var tStr = isNaN(sd.getTime()) ? escapeHtml(sr.Timestamp) : (sd.getFullYear() + '-' + String(sd.getMonth() + 1).padStart(2, '0') + '-' + String(sd.getDate()).padStart(2, '0'));

                var safeEmp = escapeHtml(this.resolveEmployeeName(sr.EmployeeID));
                var safeDest = escapeHtml(this.getRackInfo(sr.DestinationID));

                stbl += '<tr style="border-bottom:1px solid #f1f5f9;">';
                stbl += '<td style="padding:8px 4px; color:#334155;">' + tStr + '</td>';
                stbl += '<td style="padding:8px 4px;">' + safeEmp + '</td>';
                stbl += '<td style="padding:8px 4px;font-weight:bold;color:#10b981;">&rarr; ' + safeDest + '</td>';
                stbl += '</tr>';
            }
            stbl += '</tbody></table></div>';
            el.innerHTML = stbl;
        },

        submitRelocate: function () {
            var dtStr = this.state.dateStr;
            var payload = {
                filename: 'statuslogs.csv',
                Timestamp: dtStr + 'T' + new Date().toISOString().split('T')[1],
                Status: 'IN', // default to IN when relocating
                DestinationID: this.state.layerId,
                EmployeeID: this.state.employeeId,
                Notes: this.state.notes
            };
            var isMold = Boolean(this.currentItem.MoldID);
            var isCutter = Boolean(this.currentItem.CutterID && !this.currentItem.MoldID);
            var isTray = Boolean(this.currentItem.TrayID && !this.currentItem.MoldID && !this.currentItem.CutterID);

            if (isMold) payload.MoldID = this.currentItem.MoldID;
            else if (isCutter) payload.CutterID = this.currentItem.CutterID;
            else if (isTray) payload.TrayID = this.currentItem.TrayID;

            var self = this;
            fetch(API_CHECKLOG, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                .then(res => res.json())
                .then(res => {
                    if (window.notify) window.notify.success('Cập nhật Đổi Vị Trí nội bộ thành công!');

                    try {
                        payload.StatusLogID = res.StatusLogID || res.logId || ('T_' + Date.now());
                        if (global.DataManager && global.DataManager.data) {
                            global.DataManager.data.statuslogs.unshift(payload);
                        }
                    } catch (e) { }

                    var locPayload = {
                        DateEntry: payload.Timestamp,
                        EmployeeID: this.state.employeeId,
                        NewRackLayer: this.state.layerId,
                        notes: this.state.notes
                    };
                    if (isMold) locPayload.MoldID = payload.MoldID;
                    if (isCutter) locPayload.CutterID = payload.CutterID;
                    if (isTray) locPayload.TrayID = payload.TrayID;

                    fetch(API_LOCATION, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(locPayload) });

                    // ★ Persist RackLayerID change into molds.csv (or cutters.csv or trays.csv)
                    var csvFile = isTray ? 'trays.csv' : (isMold ? 'molds.csv' : 'cutters.csv');
                    var idField = isTray ? 'TrayID' : (isMold ? 'MoldID' : 'CutterID');
                    var idValue = isTray ? self.currentItem.TrayID : (isMold ? self.currentItem.MoldID : self.currentItem.CutterID);
                    var upsertPayload = {
                        filename: csvFile,
                        idField: idField,
                        idValue: idValue,
                        mode: 'upsert',
                        updates: { RackLayerID: self.state.layerId }
                    };
                    fetch(resolveApiUrl('/api/csv/upsert'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(upsertPayload)
                    }).catch(function (e) { console.warn('Upsert RackLayerID failed', e); });

                    // Update local item immediately
                    if (self.currentItem) self.currentItem.RackLayerID = self.state.layerId;

                    self.close();
                }).catch(e => {
                    alert('Lỗi: ' + e.message);
                });
        }
    };

    global.RelocateWizardModule = RelocateWizardModule;

})(window);

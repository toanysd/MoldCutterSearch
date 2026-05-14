// v9.0.2
/* ============================================================================
   transfer-location-module.js
   Module Vận chuyển
============================================================================ */

(function (global) {
    "use strict";

    function resolveApiUrl(path) {
        var p = String(path || '').trim();
        var normalized = p.charAt(0) === '/' ? p : ('/' + p);
        if (global.MCS_API_BASE_URL) return global.MCS_API_BASE_URL.replace(/\/+$/, '') + normalized;
        return 'https://ysd-moldcutter-backend.onrender.com' + normalized;
    }

    var API_SHIPLOG = resolveApiUrl('/api/add-shiplog');

    var MODES = {
        TRANSFER: { titleJa: '移動・出荷', titleVi: 'Vận chuyển Khuôn', icon: 'fas fa-truck' }
    };

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

    var TransferLocModule = {
        isOpen: false,
        currentItem: null,
        currentMode: 'TRANSFER',
        step: 1,
        maxSteps: 4,
        historyLocked: true,

        state: {
            employeeId: '',
            companyId: '',
            notes: '',
            shipDate: getTodayString()
        },

        openModal: function (mode, item) {
            this.currentItem = item;
            this.currentMode = 'TRANSFER'; // force transfer mode only
            this.step = 1;
            this.historyLocked = true;
            this.state = { employeeId: '', companyId: '', notes: '', shipDate: getTodayString() };

            var bd = document.getElementById('tl-backdrop');
            if (!bd) {
                this.initDOM();
                bd = document.getElementById('tl-backdrop');
            }

            this.render();
            bd.classList.remove('hidden');
            document.getElementById('tl-drawer').classList.remove('hidden');
            this.isOpen = true;
        },

        close: function () {
            var bd = document.getElementById('tl-backdrop');
            var dr = document.getElementById('tl-drawer');
            if (bd) bd.classList.add('hidden');
            if (dr) dr.classList.add('hidden');
            this.isOpen = false;
        },

        initDOM: function () {
            var bd = document.createElement('div');
            bd.id = 'tl-backdrop';
            bd.className = 'cio-backdrop hidden';
            bd.style.zIndex = '99998';
            bd.addEventListener('click', this.close.bind(this));

            var dr = document.createElement('div');
            dr.id = 'tl-drawer';
            dr.className = 'cio-panel hidden';
            dr.style.zIndex = '99999';

            document.body.appendChild(bd);
            document.body.appendChild(dr);
        },

        getEmployees: function () {
            if (global.DataManager && global.DataManager.data && global.DataManager.data.employees) return global.DataManager.data.employees;
            return [];
        },
        getCompanies: function () {
            if (global.DataManager && global.DataManager.data && global.DataManager.data.companies) return global.DataManager.data.companies;
            return [];
        },
        getShiplogs: function () {
            if (global.DataManager && global.DataManager.data && global.DataManager.data.shiplog) return global.DataManager.data.shiplog;
            return [];
        },
        resolveEmployeeName: function (id) {
            var emps = this.getEmployees();
            for (var i = 0; i < emps.length; i++) {
                if (String(emps[i].EmployeeID) === String(id)) return emps[i].EmployeeName || id;
            }
            return id;
        },
        resolveCompanyName: function (id) {
            var comps = this.getCompanies();
            for (var i = 0; i < comps.length; i++) {
                if (String(comps[i].CompanyID) === String(id)) return comps[i].CompanyName || id;
            }
            return id;
        },

        render: function () {
            var dr = document.getElementById('tl-drawer');
            if (!dr) return;

            var code = (this.currentItem && (this.currentItem.MoldCode || this.currentItem.CutterNo)) || '';
            var name = (this.currentItem && (this.currentItem.MoldName || this.currentItem.CutterName)) || '';
            var mObj = MODES.TRANSFER;

            var html = '<div class="cio-topbar">' +
                '<div class="cio-top-title">' +
                '<div class="ja">' + escapeHtml(code) + '</div><div class="vi">' + escapeHtml(mObj.titleVi) + '</div>' +
                '</div>' +
                '<div class="cio-top-actions"><button type="button" class="cio-top-btn" id="tl-close"><span class="ja">閉じる</span><span class="vi">Đóng</span></button></div>' +
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

            html += '<div id="tl-step-content" style="min-height: 250px;">';
            html += this.renderStepContent();
            html += '</div>';

            html += '</div>'; // close card
            html += '</div>'; // close col controls

            // --- LEFT COLUMN: HISTORY ---
            html += '<div class="cio-col cio-col-history">';
            html += '<div class="cio-card" style="padding:16px; flex:1;">';
            var lockIcon = this.historyLocked ? '<i class="fas fa-lock" style="color:#64748b;"></i>' : '<i class="fas fa-unlock" style="color:#ef4444;"></i>';
            html += '<div style="margin-bottom:8px; display:flex; align-items:center; justify-content:space-between;">';
            html += '  <div style="display:flex; align-items:center; gap:8px;">' + JV('出荷履歴', 'Lịch sử Vận chuyển') + '</div>';
            html += '  <button id="tl-hist-lock" style="background:none; border:none; padding:4px 8px; cursor:pointer; font-size:16px;">' + lockIcon + '</button>';
            html += '</div>';
            html += '<div id="tl-history-tbl"></div>';
            html += '</div>'; // close card
            html += '</div>'; // close col history

            html += '</div>'; // close desktop
            html += '</div>'; // close body

            dr.innerHTML = html;

            var self = this;
            document.getElementById('tl-close').addEventListener('click', function () { self.close(); });

            var histLock = document.getElementById('tl-hist-lock');
            if (histLock) {
                histLock.addEventListener('click', function () {
                    self.historyLocked = !self.historyLocked;
                    self.render(); // re-render to toggle delete buttons
                });
            }

            this.bindStepEvents();
            this.renderHistory();
        },

        renderStepContent: function () {
            var html = '';
            var primaryBtnStyle = 'display:flex; flex-direction:column; align-items:center; justify-content:center; background:#3b82f6; color:#fff; border:none; padding:8px 20px; border-radius:8px; font-weight:bold; cursor:pointer; min-width:120px;';
            var secondaryBtnStyle = 'display:flex; flex-direction:column; align-items:center; justify-content:center; background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; padding:8px 20px; border-radius:8px; font-weight:bold; cursor:pointer; min-width:120px;';

            if (this.step === 1) {
                html += '<div style="margin-bottom:16px;"><i class="fas fa-user-circle"></i> ' + JV('担当者を選択', 'Bước 1: Chọn Nhân viên & Ngày') + '</div>';

                html += '<div style="margin-bottom:12px;">';
                html += '<label style="font-size:12px; font-weight:bold; color:#64748b;">出荷日 / Ngày gửi đi:</label>';
                html += '<input id="tl-date-input" type="date" class="cio-control" value="' + escapeHtml(this.state.shipDate) + '" style="margin-top:4px;" />';
                html += '</div>';

                html += '<div style="margin-bottom:16px; position:relative;">';
                html += '<input id="tl-emp-input" class="cio-control" type="text" placeholder="入力... / Nhập mã hoặc tên nhân viên..." value="' + escapeHtml(this.state.employeeId) + '" autocomplete="off" />';
                html += '<div id="tl-emp-sugg" style="position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #cbd5e1; border-top:none; border-radius:0 0 8px 8px; max-height:160px; overflow-y:auto; display:none; z-index:10; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);"></div>';
                html += '</div>';

                html += '<div style="font-size:12px; font-weight:bold; color:#64748b; margin-bottom:8px;">よく使う担当者 / Truy cập nhanh:</div>';
                html += '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;" id="tl-emp-list">';
                var emps = this.getEmployees().slice(0, 12);
                for (var i = 0; i < emps.length; i++) {
                    var isS = String(this.state.employeeId) === String(emps[i].EmployeeID);
                    var bg = isS ? '#dbeafe' : '#f8fafc';
                    var bd = isS ? '#3b82f6' : '#e2e8f0';
                    var c = isS ? '#1d4ed8' : '#334155';
                    html += '<button type="button" class="tl-emp-pick" data-val="' + escapeHtml(emps[i].EmployeeID) + '" style="cursor:pointer; background:' + bg + '; border:2px solid ' + bd + '; color:' + c + '; border-radius:8px; padding:12px 4px; text-align:center; font-weight:700; font-size:13px; line-height:1.2;">';
                    html += escapeHtml(emps[i].EmployeeName || emps[i].EmployeeID);
                    html += '</button>';
                }
                html += '</div>';

                html += '<div style="margin-top:24px; display:flex; justify-content:flex-end;">';
                html += '<button id="tl-next" style="' + primaryBtnStyle + '"><div>次へ</div><div style="font-size:11px;font-weight:normal;">Tiếp theo <i class="fas fa-arrow-right"></i></div></button>';
                html += '</div>';
            }
            else if (this.step === 2) {
                var titleJa = '出荷先 / 会社を選択';
                var titleVi = 'Bước 2: Chọn Công ty nhận (To Company)';
                html += '<div style="margin-bottom:16px;"><i class="fas fa-building"></i> ' + JV(titleJa, titleVi) + '</div>';

                // ★ Quick Return Button - Nút tắt Trả khuôn
                html += '<button type="button" id="tl-quick-return" style="width:100%; padding:14px; margin-bottom:16px; background:linear-gradient(135deg,#f97316,#ea580c); color:#fff; border:none; border-radius:10px; font-weight:bold; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:10px; box-shadow:0 3px 12px rgba(234,88,12,0.35); transition:transform 0.1s;">';
                html += '<i class="fas fa-undo-alt" style="font-size:18px;"></i> 金型返却 (Trả khuôn)';
                html += '</button>';

                var selId = this.state.companyId;

                html += '<div style="margin-bottom:16px; position:relative;">';
                html += '<input id="tl-dest-input" class="cio-control" type="text" placeholder="入力... / Nhập tìm nhanh công ty..." value="' + escapeHtml(selId) + '" autocomplete="off" />';
                html += '<div id="tl-dest-sugg" style="position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #cbd5e1; border-top:none; border-radius:0 0 8px 8px; max-height:160px; overflow-y:auto; display:none; z-index:10; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);"></div>';
                html += '</div>';

                html += '<div style="font-size:12px; font-weight:bold; color:#64748b; margin-bottom:8px;">よく使う行き先 / Lựa chọn nhanh:</div>';
                html += '<div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;" id="tl-dest-list">';

                var allComps = this.getCompanies();
                var dests = allComps.slice(0, 12);
                var mtmComp = allComps.find(function (c) { return String(c.CompanyID) === '1540'; });
                if (mtmComp) {
                    var idx11 = dests.findIndex(function (c) { return String(c.CompanyID) === '11'; });
                    if (idx11 !== -1) {
                        dests[idx11] = mtmComp;
                    } else if (dests.findIndex(function (c) { return String(c.CompanyID) === '1540'; }) === -1) {
                        dests[11] = mtmComp; // Fallback if 11 not found
                    }
                }
                for (var j = 0; j < dests.length; j++) {
                    var dVal = dests[j].CompanyID;
                    var dName = dests[j].CompanyName || dests[j].CompanyID;
                    var isS2 = String(selId) === String(dVal);
                    var bg2 = isS2 ? '#dbeafe' : '#f8fafc';
                    var bd2 = isS2 ? '#3b82f6' : '#e2e8f0';
                    var c2 = isS2 ? '#1d4ed8' : '#334155';

                    html += '<button type="button" class="tl-dest-pick" data-val="' + escapeHtml(dVal) + '" style="cursor:pointer; background:' + bg2 + '; border:2px solid ' + bd2 + '; color:' + c2 + '; border-radius:8px; padding:12px 4px; text-align:center; font-weight:700; font-size:13px; line-height:1.2;">';
                    html += escapeHtml(dName);
                    html += '</button>';
                }
                html += '</div>';

                html += '<div style="margin-top:24px; display:flex; justify-content:space-between;">';
                html += '<button id="tl-prev" style="' + secondaryBtnStyle + '"><div>戻る</div><div style="font-size:11px;font-weight:normal;"><i class="fas fa-arrow-left"></i> Quay lại</div></button>';
                html += '<button id="tl-next" style="' + primaryBtnStyle + '"><div>次へ</div><div style="font-size:11px;font-weight:normal;">Tiếp theo <i class="fas fa-arrow-right"></i></div></button>';
                html += '</div>';
            }
            else if (this.step === 3) {
                html += '<div style="margin-bottom:16px;"><i class="fas fa-pen"></i> ' + JV('備考（任意）', 'Bước 3: Ghi chú') + '</div>';
                html += '<input id="tl-note-input" class="cio-control" type="text" placeholder="入力... / Nhập ghi chú nếu có..." value="' + escapeHtml(this.state.notes) + '" style="margin-bottom:12px; height: 50px; font-size:16px;" autocomplete="off" />';

                html += '<div style="margin-top:24px; display:flex; justify-content:space-between;">';
                html += '<button id="tl-prev" style="' + secondaryBtnStyle + '"><div>戻る</div><div style="font-size:11px;font-weight:normal;"><i class="fas fa-arrow-left"></i> Quay lại</div></button>';
                html += '<button id="tl-next" style="' + primaryBtnStyle + '"><div>次へ</div><div style="font-size:11px;font-weight:normal;">Tiếp theo <i class="fas fa-arrow-right"></i></div></button>';
                html += '</div>';
            }
            else if (this.step === 4) {
                var empName = this.resolveEmployeeName(this.state.employeeId);
                var compName = this.resolveCompanyName(this.state.companyId);

                html += '<div style="margin-bottom:16px;"><i class="fas fa-check-circle"></i> ' + JV('確認と送信', 'Bước 4: Hoàn tất & Submit') + '</div>';

                html += '<div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:12px; margin-bottom:16px; line-height:1.6; font-size:14px;">';
                html += '<div><span style="color:#64748b;font-weight:bold;">出荷日 (Ngày gửi):</span> <span style="font-weight:bold;color:#0f172a;">' + escapeHtml(this.state.shipDate) + '</span></div>';
                html += '<div><span style="color:#64748b;font-weight:bold;">担当者 (Nhân viên):</span> <span style="font-weight:bold;color:#1d4ed8;">' + escapeHtml(empName) + '</span></div>';
                html += '<div><span style="color:#64748b;font-weight:bold;">行き先 (Đến công ty):</span> <span style="font-weight:bold;color:#10b981;">' + escapeHtml(compName) + '</span></div>';
                html += '<div><span style="color:#64748b;font-weight:bold;">備考 (Ghi chú):</span> ' + escapeHtml(this.state.notes || '---') + '</div>';
                html += '</div>';

                html += '<button id="tl-submit-ship" style="width:100%; background:#10b981; color:#fff; border:none; padding:12px 0; border-radius:8px; cursor:pointer;"><i class="fas fa-truck" style="margin-bottom:4px;"></i>' + JV('出荷を確定する', 'TIẾN HÀNH VẬN CHUYỂN') + '</button>';

                html += '<div style="margin-top:24px; text-align:left;">';
                html += '<button id="tl-prev" style="' + secondaryBtnStyle + ' width:100%;"><div>修正する</div><div style="font-size:11px;font-weight:normal;"><i class="fas fa-arrow-left"></i> Quay lại sửa</div></button>';
                html += '</div>';
            }
            return html;
        },

        bindStepEvents: function () {
            var self = this;

            var advanceStep = function () {
                if (self.step === 1) {
                    var dtInput = document.getElementById('tl-date-input');
                    if (dtInput) self.state.shipDate = dtInput.value;
                    if (!String(self.state.employeeId).trim()) { alert('社員を選択してください / Vui lòng chọn Nhân viên!'); return; }
                    if (!String(self.state.shipDate).trim()) { alert('Ngày gửi không được bỏ trống!'); return; }
                }
                if (self.step === 2) {
                    if (!String(self.state.companyId).trim()) { alert('行き先を選択してください / Vui lòng điền Đích đến (Công ty)!'); return; }
                }
                if (self.step === 3) {
                    var ni = document.getElementById('tl-note-input');
                    if (ni) self.state.notes = ni.value;
                }
                self.step++;
                self.render();
            };

            var nxt = document.getElementById('tl-next');
            if (nxt) nxt.addEventListener('click', advanceStep);

            var prv = document.getElementById('tl-prev');
            if (prv) prv.addEventListener('click', function () {
                self.step--;
                self.render();
            });

            var bindAutocomplete = function (inputId, suggId, sourceData, keyField, labelField, stateField) {
                var inp = document.getElementById(inputId);
                var sugg = document.getElementById(suggId);
                if (!inp || !sugg) return;

                inp.addEventListener('input', function () {
                    var str = (inp.value || '').trim();
                    self.state[stateField] = str;

                    if (!str) { sugg.style.display = 'none'; return; }
                    var sLow = str.toLowerCase();

                    var matched = sourceData.filter(function (x) {
                        var val = String(x[keyField] || '').toLowerCase();
                        var lbl = String(x[labelField] || '').toLowerCase();
                        return val.includes(sLow) || lbl.includes(sLow);
                    });

                    if (matched.length === 0) { sugg.style.display = 'none'; return; }

                    var h = '';
                    for (var m = 0; m < matched.length; m++) {
                        var rawV = matched[m][keyField];
                        var rawL = matched[m][labelField] || rawV;
                        h += '<div class="sugg-row" data-val="' + escapeHtml(rawV) + '" style="padding:12px; border-bottom:1px solid #f1f5f9; cursor:pointer; font-weight:bold; font-size:14px;">' + escapeHtml(rawL) + ' <span style="color:#94a3b8;font-size:11px;font-weight:normal;">(' + escapeHtml(rawV) + ')</span></div>';
                    }
                    sugg.innerHTML = h;
                    sugg.style.display = 'block';

                    sugg.querySelectorAll('.sugg-row').forEach(function (row) {
                        row.addEventListener('click', function () {
                            var pickVal = this.getAttribute('data-val');
                            self.state[stateField] = pickVal;
                            inp.value = pickVal;
                            sugg.style.display = 'none';
                            advanceStep();
                        });
                    });
                });

                inp.addEventListener('blur', function () {
                    setTimeout(function () { if (sugg) sugg.style.display = 'none'; }, 200);
                });
                inp.addEventListener('focus', function () {
                    if (inp.value.trim() && sugg.innerHTML) sugg.style.display = 'block';
                });
            };

            // Employee interact
            if (this.step === 1) {
                bindAutocomplete('tl-emp-input', 'tl-emp-sugg', this.getEmployees(), 'EmployeeID', 'EmployeeName', 'employeeId');
                var ePicks = document.querySelectorAll('.tl-emp-pick');
                ePicks.forEach(function (e) {
                    e.addEventListener('click', function () {
                        self.state.employeeId = this.getAttribute('data-val');
                        var dtInput = document.getElementById('tl-date-input');
                        if (dtInput) self.state.shipDate = dtInput.value;
                        advanceStep();
                    });
                });
            }

            // Dest / Company interact
            if (this.step === 2) {
                bindAutocomplete('tl-dest-input', 'tl-dest-sugg', this.getCompanies(), 'CompanyID', 'CompanyName', 'companyId');
                var dPicks = document.querySelectorAll('.tl-dest-pick');
                dPicks.forEach(function (d) {
                    d.addEventListener('click', function () {
                        self.state.companyId = this.getAttribute('data-val');
                        advanceStep();
                    });
                });

                // ★ Quick Return button: auto-select CompanyID=6 (金型返却) and advance
                var qrBtn = document.getElementById('tl-quick-return');
                if (qrBtn) {
                    qrBtn.addEventListener('click', function () {
                        self.state.companyId = '6'; // CompanyID 6 = 金型返却
                        advanceStep();
                    });
                }
            }

            var btnShip = document.getElementById('tl-submit-ship');
            if (btnShip) btnShip.addEventListener('click', function () { self.submitShip(); });
        },

        renderHistory: function () {
            var el = document.getElementById('tl-history-tbl');
            if (!el) return;
            var isMold = Boolean(this.currentItem.MoldID);
            var idToFind = isMold ? this.currentItem.MoldID : this.currentItem.CutterID;

            var allSh = this.getShiplogs() || [];
            var records = allSh.filter(x => (isMold && x.MoldID == idToFind) || (!isMold && x.CutterID == idToFind));
            records.sort((a, b) => new Date(b.ShipDate).getTime() - new Date(a.ShipDate).getTime());

            if (!records.length) { el.innerHTML = '<i style="color:#94a3b8;font-size:12px;">履歴なし / Chưa có bản ghi vận chuyển nào</i>'; return; }

            var stbl = '<div style="max-height:220px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px;">';
            stbl += '<table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">';
            stbl += '<thead style="background:#f8fafc; position:sticky; top:0; z-index:1;"><tr>';
            stbl += '<th style="padding:8px 4px; border-bottom:1px solid #cbd5e1; color:#64748b;">日時 / Ngày</th>';
            stbl += '<th style="padding:8px 4px; border-bottom:1px solid #cbd5e1; color:#64748b;">担当 / NV</th>';
            stbl += '<th style="padding:8px 4px; border-bottom:1px solid #cbd5e1; color:#64748b;">行先 / Nơi đến</th>';
            if (!this.historyLocked) stbl += '<th style="padding:8px 4px; border-bottom:1px solid #cbd5e1; text-align:center;">Action</th>';
            stbl += '</tr></thead><tbody>';

            for (var z = 0; z < records.length; z++) {
                var sr = records[z];
                var sd = new Date(sr.ShipDate);
                var tStr = isNaN(sd.getTime()) ? escapeHtml(sr.ShipDate) : (sd.getFullYear() + '-' + String(sd.getMonth() + 1).padStart(2, '0') + '-' + String(sd.getDate()).padStart(2, '0'));

                var safeEmp = escapeHtml(this.resolveEmployeeName(sr.EmployeeID));
                var safeDest = escapeHtml(this.resolveCompanyName(sr.ToCompanyID));

                stbl += '<tr style="border-bottom:1px solid #f1f5f9;">';
                stbl += '<td style="padding:8px 4px; color:#334155;">' + tStr + '</td>';
                stbl += '<td style="padding:8px 4px;">' + safeEmp + '</td>';
                stbl += '<td style="padding:8px 4px;font-weight:bold;color:#10b981;">&rarr; ' + safeDest + '</td>';

                if (!this.historyLocked) {
                    stbl += '<td style="padding:8px 4px; text-align:center;">';
                    // We render a bin icon to simulate delete. 
                    stbl += '<button type="button" class="tl-del-btn" data-id="' + escapeHtml(sr.ShipID) + '" style="background:none; border:none; color:#ef4444; cursor:pointer;" title="Xóa"><i class="fas fa-trash-alt"></i></button>';
                    stbl += '</td>';
                }

                stbl += '</tr>';
            }
            stbl += '</tbody></table></div>';
            el.innerHTML = stbl;

            var self = this;
            var delBtns = el.querySelectorAll('.tl-del-btn');
            delBtns.forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var sId = this.getAttribute('data-id');
                    if (confirm('Bạn có chắc chắn muốn xóa Record vận chuyển [' + sId + '] này không?')) {
                        self.deleteShipRecord(sId);
                    }
                });
            });
        },

        deleteShipRecord: function (shipId) {
            if (!shipId) return;
            var self = this;
            if (window.notify) window.notify.info('Đang xóa bản ghi qua API...', 'Trạng thái');

            var endpoint = resolveApiUrl('/api/csv/upsert');
            var employee = '9';
            try {
                if (window.app && window.app.currentUser) employee = window.app.currentUser.EmployeeID || '9';
            } catch (e) { }

            var deleteReq = fetch(endpoint, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: 'shiplog.csv', idField: 'ShipID', idValue: shipId, updates: {}, mode: 'delete' })
            });

            var dchLog = {
                DataChangeID: 'DCH' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
                TableName: 'shiplog.csv', RecordID: shipId, RecordIDField: 'ShipID', FieldName: 'ShipStatus',
                OldValue: 'ACTIVE', NewValue: 'DELETED', ChangedAt: new Date().toISOString(), ChangedBy: employee, ChangeSource: 'transfer_module_delete', ChangeNote: 'User trigger deletion', IsConflict: 'FALSE'
            };

            var dchReq = fetch(endpoint, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: 'datachangehistory.csv', idField: 'DataChangeID', idValue: dchLog.DataChangeID, updates: dchLog, mode: 'insert' })
            });

            Promise.all([deleteReq, dchReq])
                .then(function (responses) {
                    var allOk = responses.every(function (r) { return r.ok; });
                    if (!allOk) throw new Error('API Http error');
                    return Promise.all(responses.map(function (r) { return r.json(); }));
                })
                .then(function (results) {
                    results.forEach(function (res) {
                        if (res && res.success === false) throw new Error(res.message);
                    });

                    // Xóa bộ nhớ đệm an toàn
                    if (global.DataManager && global.DataManager.data && global.DataManager.data.shiplog) {
                        var logs = global.DataManager.data.shiplog;
                        for (var i = 0; i < logs.length; i++) {
                            if (String(logs[i].ShipID) === String(shipId)) {
                                logs.splice(i, 1);
                                break;
                            }
                        }
                    }
                    if (window.notify) window.notify.success('Đã xóa log [' + shipId + '] thành công trên hệ thống!');
                    self.renderHistory();
                })
                .catch(function (err) {
                    console.error('Delete ShipLog Error:', err);
                    if (window.notify) window.notify.error('Lỗi khi xóa: ' + err.message);
                    else alert('Xóa thất bại: ' + err.message);
                });
        },

        submitShip: function () {
            var payload = {
                ToCompanyID: this.state.companyId,
                EmployeeID: this.state.employeeId,
                ShipNotes: this.state.notes,
                ShipDate: this.state.shipDate
            };
            var isMold = Boolean(this.currentItem && this.currentItem.MoldID);
            if (isMold) payload.MoldID = this.currentItem.MoldID;
            else payload.CutterID = this.currentItem.CutterID;

            var self = this;

            self.close();
            if (window.notify) window.notify.info('Đang xử lý vận chuyển tải nền...');

            fetch(API_SHIPLOG, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                .then(res => res.json())
                .then(res => {
                    if (res.success === false) throw new Error(res.message);
                    if (window.notify) window.notify.success('Vận chuyển thành công và cập nhật Đích đến!');

                    try {
                        var memPayload = {
                            ShipID: res.ShipID || ('SH_' + Date.now()),
                            CustomerID: self.currentItem ? (self.currentItem.CustomerID || '') : '',
                            ItemTypeID: self.currentItem ? (self.currentItem.ItemTypeID || '') : '',
                            ShipItemName: self.currentItem ? (isMold ? self.currentItem.MoldName : self.currentItem.CutterName) || '' : '',
                            MoldID: isMold ? (self.currentItem.MoldID || '') : '',
                            CutterID: !isMold ? (self.currentItem.CutterID || '') : '',
                            ShipDate: payload.ShipDate || new Date().toISOString(),
                            ToCompanyID: payload.ToCompanyID,
                            FromCompanyID: res.FromCompanyID || '',
                            ShipItemType: isMold ? 'Mold' : 'Cutter',
                            ShipStatus: 'Vận chuyển',
                            FromCompany: '',
                            ToCompany: '',
                            MoldID: payload.MoldID || '',
                            CutterID: payload.CutterID || '',
                            FrameID: '',
                            OtherEquipID: '',
                            WaterBaseID: '',
                            ShipNotes: payload.ShipNotes,
                            DateEntry: payload.ShipDate || new Date().toISOString(),
                            handler: '',
                            EmployeeID: payload.EmployeeID
                        };
                        if (global.DataManager && global.DataManager.data) {
                            global.DataManager.data.shiplog.unshift(memPayload);
                            var oldKeeper = isMold ? (self.currentItem.KeeperCompany || '') : (self.currentItem.KeeperCompany || '');
                            if (isMold) {
                                var moldArr = global.DataManager.data.molds;
                                for (var w = 0; w < moldArr.length; w++) {
                                    if (moldArr[w].MoldID == payload.MoldID) {
                                        moldArr[w].KeeperCompany = payload.ToCompanyID; break;
                                    }
                                }
                            } else {
                                var cutterArr = global.DataManager.data.cutters;
                                for (var w = 0; w < cutterArr.length; w++) {
                                    if (cutterArr[w].CutterID == payload.CutterID) {
                                        cutterArr[w].KeeperCompany = payload.ToCompanyID; break;
                                    }
                                }
                            }

                            // ADD LOCAL STATUSLOG UPDATE
                            var ysdId = '2'; // hardcode YSD
                            var generatedStatus = '';
                            var destId = String(payload.ToCompanyID).trim();
                            if (destId === '6') generatedStatus = 'RETURNED';
                            else if (String(oldKeeper) === ysdId && destId !== ysdId) generatedStatus = 'OUT';
                            else if (String(oldKeeper) !== ysdId && destId === ysdId) generatedStatus = 'IN';

                            if (generatedStatus && global.DataManager.data.statuslogs) {
                                global.DataManager.data.statuslogs.unshift({
                                    StatusLogID: 'WEB_SL_TEMP_' + Date.now(),
                                    MoldID: isMold ? (payload.MoldID || '') : '',
                                    CutterID: !isMold ? (payload.CutterID || '') : '',
                                    ItemType: isMold ? 'mold' : 'cutter',
                                    Status: generatedStatus,
                                    Timestamp: payload.ShipDate || new Date().toISOString(),
                                    EmployeeID: payload.EmployeeID,
                                    DestinationID: payload.ToCompanyID,
                                    Notes: payload.ShipNotes || 'Auto-generated from Shipment'
                                });
                            }
                        }
                    } catch (e) { }
                }).catch(e => {
                    alert('Lỗi ShipLog: ' + e.message + '\n(Bạn hãy kiểm tra server.js)');
                    console.error(e);
                });
        }
    };

    global.TransferLocModule = TransferLocModule;

})(window);

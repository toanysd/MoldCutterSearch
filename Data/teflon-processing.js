/**
 * teflon-processing.js - V2
 * State Machine Workflow for Teflon Coating (4-Phase: Request -> Approve -> Send -> Receive)
 * Built with Ecosystem Sync (Molds, StatusLog, ShipLog, DataChangeHistory) and Full Bilingual Support.
 * Fixed payload columns for CSV export. Implements Background Sync Rule.
 */

(function (global) {
    'use strict';

    var TeflonProcessing = function () {
        this.containerId = 'tefprocRoot';
        this.dataCache = null;
        this.currentMold = null;
        this.currentLog = null;
        this.currentState = 'NONE'; // NONE, REQUESTED, APPROVED, SENT
        this.isEditMode = false;
        this.editLogId = null;
    };

    TeflonProcessing.prototype.init = function () {
        console.log('✅ TeflonProcessing Smart Wizard V2 Initialized');
    };

    TeflonProcessing.prototype.getTodayISO = function () {
        return new Date().toISOString().split('T')[0];
    };

    TeflonProcessing.prototype.resolveApiUrl = function (path) {
        var p = String(path || '').trim();
        if (!p) return '';
        if (/^https?:\/\//i.test(p)) return p;
        var normalized = p.charAt(0) === '/' ? p : ('/' + p);
        var base = window.MCS_API_BASE_URL;
        if (base && String(base).trim() && String(base).trim() !== 'undefined') {
            return String(base).replace(/\/+$/, '') + normalized;
        }
        return 'https://ysd-moldcutter-backend.onrender.com' + normalized;
    };

    TeflonProcessing.prototype.escapeHtml = function (text) {
        if (!text) return '';
        return String(text).replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    };

    TeflonProcessing.prototype.fetchLatestData = function () {
        var dm = window.DataManager;
        if (!dm || !dm.data) return null;
        this.dataCache = dm.data;
        return dm.data;
    };

    TeflonProcessing.prototype.getLogsForMold = function (moldId) {
        if (!this.dataCache) return [];
        var teflonlog = this.dataCache.teflonlog || [];

        var combined = [];
        var map = new Map();

        teflonlog.forEach(function (r) {
            if (String(r.MoldID) === String(moldId) && String(r.TeflonStatus).toLowerCase() !== 'deleted') map.set(String(r.TeflonLogID), r);
        });

        map.forEach(function (val) { combined.push(val); });

        combined.sort(function (a, b) {
            var da = new Date(a.CreatedDate || a.RequestedDate || '1970').getTime();
            var db = new Date(b.CreatedDate || b.RequestedDate || '1970').getTime();
            if (da !== db) return db - da; // Descending
            return String(b.TeflonLogID).localeCompare(String(a.TeflonLogID));
        });

        return combined;
    };

    TeflonProcessing.prototype.getRecentSupplier = function (logs) {
        for (var i = 0; i < logs.length; i++) {
            if (logs[i].SupplierID && String(logs[i].SupplierID).trim() !== '') {
                return logs[i].SupplierID;
            }
        }
        return '7'; // Default Teflon
    };

    TeflonProcessing.prototype.calculateWorkingDays = function (startDateStr, days) {
        var date = new Date(startDateStr);
        if (isNaN(date.getTime())) date = new Date();
        var added = 0;
        while (added < days) {
            date.setDate(date.getDate() + 1);
            if (date.getDay() !== 0 && date.getDay() !== 6) added++;
        }
        return date.toISOString().split('T')[0];
    };

    TeflonProcessing.prototype.determineState = function (logs) {
        if (!logs || logs.length === 0) return { state: 'NONE', log: null };
        var latest = logs[0];
        var s = String(latest.TeflonStatus || '').trim().toLowerCase();

        if (s === 'requested' || s === 'pending') return { state: 'REQUESTED', log: latest };
        if (s === 'approved') return { state: 'APPROVED', log: latest };
        if (s === 'sent') return { state: 'SENT', log: latest };
        if (s === 'completed' || s === 'received') return { state: 'NONE', log: null }; // Finished cycle

        return { state: 'NONE', log: null };
    };

    TeflonProcessing.prototype.getCompanyName = function (id) {
        if (!this.dataCache || !this.dataCache.companies) return id;
        var c = this.dataCache.companies.find(function (x) { return String(x.CompanyID) === String(id); });
        return c ? (c.CompanyName || c.CompanyShortName) : id;
    };

    TeflonProcessing.prototype.openModal = function (moldRow) {
        if (!moldRow || !moldRow.MoldID) {
            if (window.notify) window.notify.error("Invalid Mold ID.");
            return;
        }
        this.currentMold = moldRow;
        this.isEditMode = false;
        this.editLogId = null;
        this.fetchLatestData();

        var logs = this.getLogsForMold(moldRow.MoldID);
        var st = this.determineState(logs);

        this.currentState = st.state;
        this.currentLog = st.log;

        this.renderDom(logs);
    };

    TeflonProcessing.prototype.editSpecificLog = function (logId) {
        var logs = this.getLogsForMold(this.currentMold.MoldID);
        var targetLog = logs.find(function (l) { return String(l.TeflonLogID) === String(logId); });
        if (!targetLog) return;

        this.isEditMode = true;
        this.editLogId = logId;
        this.currentLog = targetLog;

        var s = String(targetLog.TeflonStatus || '').trim().toLowerCase();
        this.currentState = 'NONE';
        if (s === 'requested' || s === 'pending') this.currentState = 'REQUESTED';
        if (s === 'approved') this.currentState = 'APPROVED';
        if (s === 'sent') this.currentState = 'SENT';
        if (s === 'completed' || s === 'received') this.currentState = 'COMPLETED';

        // Render in edit mode
        this.renderDom(logs, true);
    };

    TeflonProcessing.prototype.deleteSpecificLog = async function (logId) {
        if (!confirm('このレコードを完全に削除してよろしいですか？\n(Bạn có chắc chắn muốn xóa bản ghi này trên hệ thống?)')) return;

        var self = this;
        var endpoint = this.resolveApiUrl('/api/csv/upsert');
        var employee = '1';

        var batch = [];
        // Xóa khỏi log chính
        batch.push({ filename: 'teflonlog.csv', idField: 'TeflonLogID', idValue: logId, updates: {}, mode: 'delete' });

        // Ghi lại sự phản hệ vào DCH
        var dchLog = {
            DataChangeID: 'DCH' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
            TableName: 'teflonlog',
            RecordID: logId, RecordIDField: 'TeflonLogID', FieldName: 'TeflonStatus',
            OldValue: 'ACTIVE', NewValue: 'DELETED',
            ChangedAt: new Date().toISOString(), ChangedBy: employee, ChangeSource: 'teflon_wizard_delete', ChangeNote: 'User trigger deletion', IsConflict: 'FALSE'
        };
        batch.push({ filename: 'datachangehistory.csv', idField: 'DataChangeID', idValue: dchLog.DataChangeID, updates: dchLog, mode: 'insert' });

        this.closeModal();
        if (window.notify) window.notify.info("削除中 (Đang tiến hành xóa qua API)...", "Background Delete");

        try {
            for (var i = 0; i < batch.length; i++) {
                var call = batch[i];
                var res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(call) });
                var jRes = await res.json().catch(function () { });

                if (!res.ok || (jRes && jRes.success === false)) {
                    console.warn('Batch chunk failed', call, jRes);
                    throw new Error(jRes ? jRes.message : 'API Http ' + res.status);
                }
            }
            if (window.notify) window.notify.success("完了 (Đã xóa bản ghi thành công)!", "Success");

            var dm = window.DataManager || window.dataManager || (window.App && window.App.dataManager);
            if (dm && dm.loadAllData) {
                dm.loadAllData().then(function () {
                    console.log('Background reload completed after delete.');
                    var dp = window.detailPanel || window.DetailPanel || (window.App && window.App.detailPanel);
                    if (dp && typeof dp.refreshCurrentTab === 'function') {
                        dp.refreshCurrentTab();
                    }
                });
            }
        } catch (err) {
            console.error('Delete flow error', err);
            if (window.notify) window.notify.error("エラー (Xóa thất bại): " + err.message, "Lỗi Hệ Thống");
        }
    };

    TeflonProcessing.prototype.closeModal = function () {
        var bd = document.getElementById('tefpBackdrop');
        var pn = document.getElementById('tefpPanelWindow');
        if (bd) bd.style.opacity = '0';
        if (pn) pn.classList.remove('tefp-active');

        setTimeout(function () {
            var ex = document.getElementById('tefpRootOverlay');
            if (ex) ex.remove();
            if (window.SwipeHistoryTrap) window.SwipeHistoryTrap.remove('teflonPanel');
        }, 300);
    };

    TeflonProcessing.prototype.renderDom = function (logs, forceShowEdit) {
        var ex = document.getElementById('tefpRootOverlay');
        if (ex) ex.remove();

        var today = this.getTodayISO();
        var companies = (this.dataCache && this.dataCache.companies) || [];
        var employees = (this.dataCache && this.dataCache.employees) || [];
        var self = this;

        // Employees Option HTML
        var empOpts = '<option value="1">システム (System)</option>';
        employees.forEach(function (e) { empOpts += '<option value="' + String(e.EmployeeID).trim() + '">' + (e.EmployeeName || e.Name) + '</option>'; });

        // Build Timeline History
        var histHtm = '<div class="tefp-timeline">';
        if (logs.length === 0) {
            histHtm = '<div class="tefp-empty"><i class="fas fa-inbox fa-2x" style="color:#cbd5e1;margin-bottom:8px;"></i><br>履歴なし <span style="font-size:11px"><br>(Chưa có lịch sử)</span></div>';
        } else {
            logs.forEach(function (l) {
                var st = String(l.TeflonStatus || '').toLowerCase();
                var colorCls = 'st-req'; var dotCls = 'dot-req'; var txt = '処理依頼 <span style="font-size:11px;font-weight:normal">(Yêu cầu)</span>';
                var dateStr = l.RequestedDate || '-';

                if (st === 'approved') {
                    colorCls = 'st-appr'; dotCls = 'dot-appr'; txt = '承認済 <span style="font-size:11px;font-weight:normal">(Đã duyệt)</span>';
                    dateStr = l.UpdatedDate || l.RequestedDate || '-';
                }
                if (st === 'sent') {
                    colorCls = 'st-sent'; dotCls = 'dot-sent'; txt = '加工中 <span style="font-size:11px;font-weight:normal">(Đang mạ)</span>';
                    dateStr = l.SentDate || l.RequestedDate || '-';
                }
                if (st === 'completed' || st === 'received') {
                    colorCls = 'st-done'; dotCls = 'dot-done'; txt = '完了 <span style="font-size:11px;font-weight:normal">(Hoàn tất)</span>';
                    dateStr = l.ReceivedDate || l.SentDate || '-';
                }

                var supplierName = l.SupplierID ? self.getCompanyName(l.SupplierID) : '-';
                var cost = l.TeflonCost ? Number(l.TeflonCost).toLocaleString('en-US') + ' ¥' : '-';
                var notes = l.TeflonNotes ? '<div class="tefp-tl-row"><span class="tefp-tl-lbl">備考 (Ghi chú):</span><span class="tefp-tl-val">' + self.escapeHtml(l.TeflonNotes) + '</span></div>' : '';

                var isEditingHighlight = (self.isEditMode && String(self.editLogId) === String(l.TeflonLogID)) ? 'border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,0.15)' : '';

                // Build detailed sub-steps history tracking
                var s1 = !!(l.RequestedDate || l.CreatedDate);
                var isAppr = (st === 'approved' || st === 'sent' || st === 'completed' || st === 'received');
                var s3 = !!l.SentDate;
                var s4 = !!(l.ReceivedDate || st === 'completed' || st === 'received');

                var stepsHtm = '';
                if (s1) {
                    var d1 = l.RequestedDate || l.CreatedDate || '?';
                    stepsHtm += '<div style="margin-bottom:4px;"><i class="fas fa-check-circle" style="color:#3b82f6; width:14px;"></i> <b>依頼 (Yêu cầu)</b> : ' + d1 + '</div>';
                }
                if (isAppr) {
                    var d2 = l.ApprovedDate || ((st === 'approved') ? (l.UpdatedDate || '-') : (s3 ? '<i style="color:#94a3b8;">✓ (Pass)</i>' : '?'));
                    stepsHtm += '<div style="margin-bottom:4px;"><i class="fas fa-stamp" style="color:#0ea5e9; width:14px;"></i> <b>承認 (Phê duyệt)</b> : ' + d2 + '</div>';
                }
                if (s3) {
                    stepsHtm += '<div style="margin-bottom:4px;"><i class="fas fa-truck" style="color:#d97706; width:14px;"></i> <b>発送 (Gửi đi)</b> : ' + l.SentDate + '</div>';
                    if (l.ExpectedDate) {
                        stepsHtm += '<div style="margin-bottom:4px; margin-left:18px; color:#64748b; font-size:10px;"><i class="fas fa-angle-right" style="width:14px;"></i> 受取予定 (Dự kiến nhận) : ' + l.ExpectedDate + '</div>';
                    }
                }
                if (s4) {
                    var d4 = l.ReceivedDate || l.UpdatedDate || '?';
                    stepsHtm += '<div style="margin-bottom:0;"><i class="fas fa-box-open" style="color:#10b981; width:14px;"></i> <b>受取 (Nhận kho)</b> : ' + d4 + '</div>';
                }

                histHtm += `
                    <div class="tefp-tl-item">
                        <div class="tefp-tl-dot ${dotCls}"></div>
                        <div class="tefp-tl-content" style="${isEditingHighlight}">
                            <div class="tefp-tl-header">
                                <span class="tefp-tl-status ${colorCls}">${txt}</span>
                                <div class="tefp-tl-actions">
                                    <button class="tefp-tl-btn btn-edit-log" data-id="${l.TeflonLogID}" title="編集 (Chỉnh sửa)"><i class="fas fa-edit"></i></button>
                                    <button class="tefp-tl-btn btn-delete-log" data-id="${l.TeflonLogID}" style="color:#ef4444" title="削除 (Xóa)"><i class="fas fa-trash-alt"></i></button>
                                </div>
                            </div>
                            <div class="tefp-tl-row"><span class="tefp-tl-lbl">業者 (Supplier):</span><strong class="tefp-tl-val">${self.escapeHtml(supplierName)}</strong></div>
                            ${st === 'completed' ? `<div class="tefp-tl-row"><span class="tefp-tl-lbl">費用 (Cost):</span><span class="tefp-tl-val">${cost}</span></div>` : ''}
                            ${notes}
                            <div class="tefp-substeps" style="margin-top: 10px; padding: 10px; background: #f8fafc; border-radius: 6px; font-size: 11px; color: #475569; border-left: 2px solid ${colorCls === 'st-req' ? '#3b82f6' : (colorCls === 'st-appr' ? '#0ea5e9' : (colorCls === 'st-sent' ? '#d97706' : '#10b981'))};">
                                ${stepsHtm}
                            </div>
                        </div>
                    </div>
                `;
            });
            histHtm += '</div>';
        }

        // Stepper Status (4 phases)
        var sPhase = 0; // NONE
        if (this.currentState === 'REQUESTED') sPhase = 1;
        if (this.currentState === 'APPROVED') sPhase = 2;
        if (this.currentState === 'SENT') sPhase = 3;

        var prgWidth = (sPhase / 3) * 100;

        var stepperHtm = `
            <div class="tefp-stepper">
                <div class="tefp-stepper-progress" style="width: ${prgWidth}%"></div>
                <div class="tefp-step ${sPhase >= 0 ? (sPhase > 0 ? 'is-completed' : 'is-active') : ''}">
                    <div class="tefp-step-circle">${sPhase > 0 ? '<i class="fas fa-check"></i>' : '1'}</div>
                    <div class="tefp-step-label">処理依頼<br><span class="tefp-step-label-sub">Yêu cầu mạ</span></div>
                </div>
                <div class="tefp-step ${sPhase >= 1 ? (sPhase > 1 ? 'is-completed' : 'is-active') : ''}">
                    <div class="tefp-step-circle">${sPhase > 1 ? '<i class="fas fa-check"></i>' : '2'}</div>
                    <div class="tefp-step-label">承認済<br><span class="tefp-step-label-sub">Phê duyệt</span></div>
                </div>
                <div class="tefp-step ${sPhase >= 2 ? (sPhase > 2 ? 'is-completed' : 'is-active') : ''}">
                    <div class="tefp-step-circle">${sPhase > 2 ? '<i class="fas fa-check"></i>' : '3'}</div>
                    <div class="tefp-step-label">加工中<br><span class="tefp-step-label-sub">Đang mạ</span></div>
                </div>
                <div class="tefp-step ${sPhase >= 3 ? (sPhase > 3 ? 'is-completed' : 'is-active') : ''}">
                    <div class="tefp-step-circle">${sPhase > 3 ? '<i class="fas fa-check"></i>' : '4'}</div>
                    <div class="tefp-step-label">完了<br><span class="tefp-step-label-sub">Hoàn tất</span></div>
                </div>
            </div>
        `;

        var ctrlHtm = '';
        var tLog = this.currentLog || {};

        if (this.currentState === 'NONE' || (this.isEditMode && this.currentState === 'REQUESTED')) {
            var recentSupp = this.getRecentSupplier(logs);
            if (this.isEditMode) recentSupp = tLog.SupplierID;

            var supOpts = '<option value="">-- 選択 (Chọn) --</option>';
            companies.forEach(function (c) {
                var sel = String(c.CompanyID) === String(recentSupp) ? 'selected' : '';
                supOpts += '<option value="' + c.CompanyID + '" ' + sel + '>' + (c.CompanyShortName || c.CompanyName || c.CompanyID) + '</option>';
            });

            var headTxt = this.isEditMode ? "編集: 処理依頼 (Sửa: Yêu cầu)" : "登録: 処理依頼 (Tạo Yêu Cầu)";

            ctrlHtm = `
                <div class="tefp-wizard-state">
                    ${this.isEditMode ? '<div style="position:absolute;top:20px;right:20px;color:#d97706;font-size:24px"><i class="fas fa-edit"></i></div>' : ''}
                    <div class="tefp-state-title" style="color:#2563eb"><i class="fas fa-file-signature"></i> ${headTxt}</div>
                    <div class="tefp-state-desc">テフロン加工の新しい依頼を作成します。<br>Khởi tạo lệnh mạ Teflon mới cho khuôn.</div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">金型 <span class="tefp-label-sub">(Khuôn)</span></label>
                        <input type="text" class="tefp-input" value="${this.escapeHtml(this.currentMold.MoldID)}" disabled>
                    </div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">担当者 <span class="tefp-label-sub">(Nhân viên)</span><span style="color:red">*</span></label>
                        <select id="tefp_emp" class="tefp-select">${empOpts}</select>
                    </div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">希望日 <span class="tefp-label-sub">(Ngày Y/C)</span><span style="color:red">*</span></label>
                        <input type="date" id="tefp_reqDate" class="tefp-input" value="${tLog.RequestedDate || today}">
                    </div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">テフロン業者 <span class="tefp-label-sub">(Nhà cung cấp mạ)</span><span style="color:red">*</span></label>
                        <select id="tefp_suppId" class="tefp-select">${supOpts}</select>
                    </div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">理由・備考 <span class="tefp-label-sub">(Lý do/Ghi chú)</span></label>
                        <textarea id="tefp_notes" class="tefp-input tefp-textarea" placeholder="詳細を入力...">${tLog.Reason || tLog.TeflonNotes || ''}</textarea>
                    </div>
                    <button type="button" id="tefpBtnSubmit" class="tefp-btn-submit"><i class="fas fa-paper-plane"></i> ${this.isEditMode ? '更新 (Cập nhật)' : '作成 (Thêm Yêu Cầu)'}</button>
                </div>
            `;
        }
        else if (this.currentState === 'REQUESTED' || (this.isEditMode && this.currentState === 'APPROVED')) {
            ctrlHtm = `
                <div class="tefp-wizard-state">
                    ${this.isEditMode ? '<div style="position:absolute;top:20px;right:20px;color:#d97706;font-size:24px"><i class="fas fa-edit"></i></div>' : ''}
                    <div class="tefp-state-title" style="color:#0ea5e9"><i class="fas fa-stamp"></i> 承認 (Phê Duyệt)</div>
                    <div class="tefp-state-desc">依頼を確認し、承認します。まだ発送ではありません。<br>Duyệt yêu cầu để chuẩn bị kế hoạch gửi đi (Có thể gửi thực tế sau).</div>
                    
                    <div class="tefp-form-group">
                        <label class="tefp-label">承認者 <span class="tefp-label-sub">(Người duyệt)</span><span style="color:red">*</span></label>
                        <select id="tefp_emp" class="tefp-select">${empOpts}</select>
                    </div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">承認日 <span class="tefp-label-sub">(Ngày duyệt)</span><span style="color:red">*</span></label>
                        <input type="date" id="tefp_apprDate" class="tefp-input" value="${today}">
                    </div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">備考 <span class="tefp-label-sub">(Ghi chú)</span></label>
                        <textarea id="tefp_notes" class="tefp-input tefp-textarea" placeholder="追加の指示..."></textarea>
                    </div>
                    <button type="button" id="tefpBtnSubmit" class="tefp-btn-submit btn-approve"><i class="fas fa-check-circle"></i> 承認する (Duyệt Lệnh)</button>
                </div>
            `;
        }
        else if (this.currentState === 'APPROVED' || (this.isEditMode && this.currentState === 'SENT')) {
            var expISO = this.calculateWorkingDays(today, 5); // 5 working days default

            ctrlHtm = `
                <div class="tefp-wizard-state">
                    ${this.isEditMode ? '<div style="position:absolute;top:20px;right:20px;color:#d97706;font-size:24px"><i class="fas fa-edit"></i></div>' : ''}
                    <div class="tefp-state-title" style="color:#d97706"><i class="fas fa-truck"></i> 発送 (Giao Đi Mạ)</div>
                    <div class="tefp-state-desc">金型を業者へ発送しました。<br>Xác nhận khuôn đã rời xưởng. Sẽ Cập nhật <strong>Vị trí kho</strong> và <strong>Log vận chuyển</strong>.</div>
                    
                    <div class="tefp-form-group">
                        <label class="tefp-label">担当者 <span class="tefp-label-sub">(Nhân viên xuất)</span><span style="color:red">*</span></label>
                        <select id="tefp_emp" class="tefp-select">${empOpts}</select>
                    </div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">発送日 <span class="tefp-label-sub">(Ngày Gửi Đi)</span><span style="color:red">*</span></label>
                        <input type="date" id="tefp_sentDate" class="tefp-input" value="${tLog.SentDate || today}">
                    </div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">受取予定日 <span class="tefp-label-sub">(Dự Kiến Nhận)</span><span style="color:red">*</span></label>
                        <input type="date" id="tefp_expDate" class="tefp-input" value="${tLog.ExpectedDate || expISO}">
                    </div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">費用 JPY <span class="tefp-label-sub">(Báo Giá)</span></label>
                        <input type="number" id="tefp_cost" class="tefp-input" placeholder="0" value="${tLog.TeflonCost || ''}">
                    </div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">備考 <span class="tefp-label-sub">(Ghi chút vận chuyển)</span></label>
                        <textarea id="tefp_notes" class="tefp-input tefp-textarea" placeholder="..."></textarea>
                    </div>
                    <button type="button" id="tefpBtnSubmit" class="tefp-btn-submit btn-sent"><i class="fas fa-truck-loading"></i> 発送済として記録 (Chốt Đã Giao Đi)</button>
                </div>
            `;
        }
        else if (this.currentState === 'SENT' || (this.isEditMode && this.currentState === 'COMPLETED')) {
            ctrlHtm = `
                <div class="tefp-wizard-state">
                    ${this.isEditMode ? '<div style="position:absolute;top:20px;right:20px;color:#d97706;font-size:24px"><i class="fas fa-edit"></i></div>' : ''}
                    <div class="tefp-state-title" style="color:#059669"><i class="fas fa-box-open"></i> 受取 (Nhận Hoàn Tất)</div>
                    <div class="tefp-state-desc">施工ラインから戻りました。<br>Khuôn đã về xưởng sau quá trình xử lý lớp phủ Teflon.</div>
                    
                    <div class="tefp-form-group">
                        <label class="tefp-label">担当者 <span class="tefp-label-sub">(Người nhận)</span><span style="color:red">*</span></label>
                        <select id="tefp_emp" class="tefp-select">${empOpts}</select>
                    </div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">受取日 <span class="tefp-label-sub">(Ngày Nhận Tế)</span><span style="color:red">*</span></label>
                        <input type="date" id="tefp_recvDate" class="tefp-input" value="${tLog.ReceivedDate || today}">
                    </div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">最終費用 JPY <span class="tefp-label-sub">(Chi phí chốt)</span></label>
                        <input type="number" id="tefp_cost" class="tefp-input" value="${tLog.TeflonCost || ''}" placeholder="0">
                    </div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">備考 <span class="tefp-label-sub">(Ghi Chú Nghiệm Thu)</span></label>
                        <textarea id="tefp_notes" class="tefp-input tefp-textarea" placeholder="品質状態など..."></textarea>
                    </div>
                    <button type="button" id="tefpBtnSubmit" class="tefp-btn-submit btn-recv"><i class="fas fa-clipboard-check"></i> 完了 (Xác Nhận Đã Nhận Kho)</button>
                </div>
            `;
        }

        var dom = document.createElement('div');
        dom.id = 'tefpRootOverlay';
        dom.innerHTML = `
            <div id="tefpBackdrop" class="tefp-backdrop"></div>
            <div id="tefpPanelWindow" class="tefp-panel">
                <div class="tefp-header">
                    <div class="tefp-title">
                        テフロン管理 <span class="tefp-badge">${this.escapeHtml(this.currentMold.MoldID)}</span>
                    </div>
                    <button class="tefp-close-btn" id="tefpBtnClose"><i class="fas fa-times"></i></button>
                </div>
                <div class="tefp-stepper-wrap" style="padding: 24px 24px 0 24px;">
                    ${stepperHtm}
                </div>
                <div class="tefp-body-split">
                    <div class="tefp-col-controls">
                        ${ctrlHtm}
                    </div>
                    <div class="tefp-col-history">
                        <div class="tefp-history-title">
                            <span><i class="fas fa-history"></i> 履歴 (Lịch sử)</span>
                            <div class="tefp-history-title-right">
                                ${this.isEditMode ? '<button id="tefpBtnCancelEdit" class="tefp-btn-new-log"><i class="fas fa-arrow-left"></i> 戻る (Hủy sửa)</button>' : ''}
                                ${(!this.isEditMode && this.currentState !== 'NONE') ? '<button id="tefpBtnNewLog" class="tefp-btn-new-log"><i class="fas fa-plus"></i> 新規 (Tạo lệnh mới)</button>' : ''}
                            </div>
                        </div>
                        ${histHtm}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(dom);

        // Bind events
        var closeFunc = function () { self.closeModal(); };
        document.getElementById('tefpBtnClose').addEventListener('click', closeFunc);
        document.getElementById('tefpBackdrop').addEventListener('click', closeFunc);

        var submitBtn = document.getElementById('tefpBtnSubmit');
        if (submitBtn) { submitBtn.addEventListener('click', function () { self.handleSubmit(); }); }

        var newLogBtn = document.getElementById('tefpBtnNewLog');
        if (newLogBtn) {
            newLogBtn.addEventListener('click', function () {
                self.isEditMode = false; self.editLogId = null; self.currentState = 'NONE';
                self.renderDom(logs);
            });
        }
        var cancelEditBtn = document.getElementById('tefpBtnCancelEdit');
        if (cancelEditBtn) {
            cancelEditBtn.addEventListener('click', function () {
                self.openModal(self.currentMold); // Reset to base state
            });
        }

        var editBtns = document.querySelectorAll('.btn-edit-log');
        for (var i = 0; i < editBtns.length; i++) {
            editBtns[i].addEventListener('click', function (e) {
                var btn = e.target.closest('.btn-edit-log');
                if (btn) self.editSpecificLog(btn.getAttribute('data-id'));
            });
        }
        var delBtns = document.querySelectorAll('.btn-delete-log');
        for (var i = 0; i < delBtns.length; i++) {
            delBtns[i].addEventListener('click', function (e) {
                var btn = e.target.closest('.btn-delete-log');
                if (btn) self.deleteSpecificLog(btn.getAttribute('data-id'));
            });
        }

        if (window.SwipeHistoryTrap) {
            window.SwipeHistoryTrap.push('teflonPanel', closeFunc);
            var pnl = document.getElementById('tefpPanelWindow');
            window.SwipeHistoryTrap.bindSwipe(pnl, closeFunc);
        }

        setTimeout(function () {
            var bd = document.getElementById('tefpBackdrop');
            if (bd) bd.style.opacity = '1';
            var pw = document.getElementById('tefpPanelWindow');
            if (pw) pw.classList.add('tefp-active');
        }, 10);
    };

    TeflonProcessing.prototype.handleSubmit = async function () {
        var self = this;
        var today = this.getTodayISO();
        var employee = document.getElementById('tefp_emp') ? document.getElementById('tefp_emp').value : '1';

        var entry = {};
        var mode = 'update';

        if (this.currentState === 'NONE' || (this.isEditMode && this.currentState === 'REQUESTED')) {
            var newId = this.isEditMode ? this.currentLog.TeflonLogID : ('TL' + Date.now().toString().slice(-6));
            entry = this.isEditMode ? Object.assign({}, this.currentLog) : { TeflonLogID: newId, MoldID: this.currentMold.MoldID, CreatedDate: today };

            entry.TeflonStatus = 'Requested';
            entry.RequestedDate = document.getElementById('tefp_reqDate') ? document.getElementById('tefp_reqDate').value : today;
            entry.RequestedBy = employee;
            entry.SupplierID = document.getElementById('tefp_suppId') ? document.getElementById('tefp_suppId').value : '';
            entry.Reason = document.getElementById('tefp_notes') ? document.getElementById('tefp_notes').value : '';

            mode = this.isEditMode ? 'update' : 'insert';
        }
        else if (this.currentState === 'REQUESTED' || (this.isEditMode && this.currentState === 'APPROVED')) {
            entry = Object.assign({}, this.currentLog);
            entry.TeflonStatus = 'Approved';

            var aDate = document.getElementById('tefp_apprDate');
            if (aDate) entry.UpdatedDate = aDate.value || today;

            var notes = document.getElementById('tefp_notes') ? document.getElementById('tefp_notes').value : '';
            if (notes) entry.TeflonNotes = (entry.TeflonNotes ? entry.TeflonNotes + ' | ' : '') + '[Approved] ' + notes;
            mode = 'update';
        }
        else if (this.currentState === 'APPROVED' || (this.isEditMode && this.currentState === 'SENT')) {
            entry = Object.assign({}, this.currentLog);
            entry.TeflonStatus = 'Sent';
            var sDate = document.getElementById('tefp_sentDate');
            if (sDate) entry.SentDate = sDate.value || today;
            var eDate = document.getElementById('tefp_expDate');
            if (eDate) entry.ExpectedDate = eDate.value || '';
            var cost = document.getElementById('tefp_cost');
            if (cost && cost.value) entry.TeflonCost = cost.value;

            var notes2 = document.getElementById('tefp_notes') ? document.getElementById('tefp_notes').value : '';
            if (notes2) entry.TeflonNotes = (entry.TeflonNotes ? entry.TeflonNotes + ' | ' : '') + '[Sent] ' + notes2;
            entry.UpdatedDate = today;
            mode = 'update';
        }
        else if (this.currentState === 'SENT' || (this.isEditMode && this.currentState === 'COMPLETED')) {
            entry = Object.assign({}, this.currentLog);
            entry.TeflonStatus = 'Completed';
            var rDate = document.getElementById('tefp_recvDate');
            if (rDate) entry.ReceivedDate = rDate.value || today;
            var rCost = document.getElementById('tefp_cost');
            if (rCost && rCost.value) entry.TeflonCost = rCost.value;

            var notes3 = document.getElementById('tefp_notes') ? document.getElementById('tefp_notes').value : '';
            if (notes3) entry.TeflonNotes = (entry.TeflonNotes ? entry.TeflonNotes + ' | ' : '') + '[Recv] ' + notes3;
            entry.UpdatedDate = today;
            mode = 'update';
        } else {
            return;
        }

        // --- UX SYNC IMPLEMENTATION ---
        var btn = document.getElementById('tefpBtnSubmit');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 処理中... (Đang xử lý...)';
        }

        // Start ecosystem batch process
        var batch = [];

        // 1. Core Teflon Log
        batch.push({ filename: 'teflonlog.csv', idField: 'TeflonLogID', idValue: entry.TeflonLogID, updates: entry, mode: mode });

        // 2. DataChangeHistory base
        var dchLog = {
            DataChangeID: 'DCH' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
            TableName: 'teflonlog',
            RecordID: entry.TeflonLogID, RecordIDField: 'TeflonLogID', FieldName: 'TeflonStatus',
            OldValue: (this.currentLog && this.currentLog.TeflonStatus) || '', NewValue: entry.TeflonStatus,
            ChangedAt: new Date().toISOString(), ChangedBy: String(employee), ChangeSource: 'teflon_wizard', ChangeNote: 'Wizard Update', IsConflict: 'FALSE'
        };
        batch.push({ filename: 'datachangehistory.csv', idField: 'DataChangeID', idValue: dchLog.DataChangeID, updates: dchLog, mode: 'insert' });

        // 3. Ecosystem Cascading: WebMolds (Strict field enforcement: only storage_company exists in target CSV!)
        if (entry.TeflonStatus === 'Sent' || entry.TeflonStatus === 'Completed') {
            var mEntry = {};
            var supplierTargetStr = String(entry.SupplierID || '7');

            if (entry.TeflonStatus === 'Sent' && !this.isEditMode) {
                mEntry.storage_company = supplierTargetStr; // Out to Plater

                // StatusLogs (Actual columns: StatusLogID, MoldID, Status, Timestamp, EmployeeID, Notes)
                var outId = 'ST' + Date.now().toString().slice(-6);
                batch.push({
                    filename: 'statuslogs.csv', idField: 'StatusLogID', idValue: outId, mode: 'insert', updates: {
                        StatusLogID: outId, MoldID: self.currentMold.MoldID, Status: 'OUT', Timestamp: new Date().toISOString(), EmployeeID: String(employee), Notes: 'Teflon'
                    }
                });

                // ShipLog (Actual columns: ShipID, MoldID, FromCompanyID, ToCompanyID, ShipDate, EmployeeID, ShipNotes)
                var shipIdOut = 'SHIP' + Date.now().toString().slice(-6);
                batch.push({
                    filename: 'shiplog.csv', idField: 'ShipID', idValue: shipIdOut, mode: 'insert', updates: {
                        ShipID: shipIdOut, MoldID: self.currentMold.MoldID, FromCompanyID: '2', ToCompanyID: supplierTargetStr, ShipDate: today, EmployeeID: String(employee), ShipNotes: 'Teflon'
                    }
                });
            }
            else if (entry.TeflonStatus === 'Completed' && !this.isEditMode) {
                mEntry.storage_company = '2'; // In to YSD
                var origSupStr = this.currentLog ? String(this.currentLog.SupplierID || '7') : '7';

                var inId = 'ST' + Date.now().toString().slice(-6);
                batch.push({
                    filename: 'statuslogs.csv', idField: 'StatusLogID', idValue: inId, mode: 'insert', updates: {
                        StatusLogID: inId, MoldID: self.currentMold.MoldID, Status: 'IN', Timestamp: new Date().toISOString(), EmployeeID: String(employee), Notes: 'Teflon'
                    }
                });

                var shipIdIn = 'SHIP' + Date.now().toString().slice(-6);
                batch.push({
                    filename: 'shiplog.csv', idField: 'ShipID', idValue: shipIdIn, mode: 'insert', updates: {
                        ShipID: shipIdIn, MoldID: self.currentMold.MoldID, FromCompanyID: origSupStr, ToCompanyID: '2', ShipDate: today, EmployeeID: String(employee), ShipNotes: 'Teflon'
                    }
                });
            }

            // Only append webmolds update if we actually change storage configuration
            if (Object.keys(mEntry).length > 0) {
                batch.push({ filename: 'molds.csv', idField: 'MoldID', idValue: self.currentMold.MoldID, updates: mEntry, mode: 'update' });
            }
        }

        try {
            var endpoint = this.resolveApiUrl('/api/csv/upsert');

            // Execute batch sequentially
            for (var i = 0; i < batch.length; i++) {
                var call = batch[i];
                var res = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(call)
                });
                var jRes = await res.json().catch(function () { });
                if (!res.ok || (jRes && jRes.success === false)) {
                    console.warn('Batch chunk failed', call, jRes);
                    throw new Error(jRes ? jRes.message : 'API Http ' + res.status);
                }
            }

            if (window.notify) window.notify.success("完了 (Ghi nhận Lệnh Mạ thành công)!", "Success");

            // Optimistic UI Update - Refresh array and update state visually
            var dataObj = window.DataManager ? window.DataManager.data : (window.ALL_DATA || {});
            if (!dataObj.teflonlog) dataObj.teflonlog = [];
            var existIdx = dataObj.teflonlog.findIndex(function(x) { return String(x.TeflonLogID) === String(entry.TeflonLogID); });
            if (existIdx >= 0) dataObj.teflonlog[existIdx] = entry;
            else dataObj.teflonlog.push(entry);

            // Update local DetailPanel data specifically for history view to reflect fast changes
            var dp = window.detailPanel || window.DetailPanel || (window.App && window.App.detailPanel);
            if (dp && dp.data) dp.data.teflonlog = dataObj.teflonlog;

            self.isEditMode = false;
            self.currentLog = entry;
            var upStatus = String(entry.TeflonStatus).toUpperCase();
            if (upStatus === 'REQUESTED') self.currentState = 'REQUESTED';
            else if (upStatus === 'APPROVED') self.currentState = 'APPROVED';
            else if (upStatus === 'SENT') self.currentState = 'SENT';
            else if (upStatus === 'COMPLETED') {
                 self.currentState = 'NONE'; // Về trạng thái chờ / mới tinh
                 self.currentLog = null;
                 self.closeModal(); // Giai đoạn hoàn tất có thể auto close luôn
            }

            // Immediately re-paint wizard UI for smooth transition
            if (self.currentState !== 'NONE') {
                self.renderDom(self.getLogsForMold(self.currentMold.MoldID));
            }

            // Ecosystem background sync trigger
            setTimeout(function () {
                var dm = window.DataManager || window.dataManager || (window.App && window.App.dataManager);
                if (dm && typeof dm.loadAllData === 'function') {
                    dm.loadAllData().then(function () {
                        if (dp && typeof dp.refreshCurrentTab === 'function') dp.refreshCurrentTab();
                    });
                }
            }, 100);

        } catch (err) {
            console.error(err);
            if (window.notify) window.notify.error("同期失敗 (Xảy ra lỗi, hãy thử lại!): " + err.message, "API Error");
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '再試行 (Thử lại)';
            }
        }
    };

    global.TeflonProcessing = new TeflonProcessing();

})(typeof window !== 'undefined' ? window : this);

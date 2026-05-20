// v10.0.0-PubSub
/**

 * teflon-processing.js - V2

 * State Machine Workflow for Teflon Coating (4-Phase: Request -> Approve -> Send -> Receive)

 * Built with Ecosystem Sync (Molds, StatusLog, ShipLog, DataChangeHistory) and Full Bilingual Support.

 * Fixed payload columns for CSV export. Implements Background Sync Rule.

 */



(function (global) {

    'use strict';





    // --- Background Queue Sync Module ---
    window.TeflonSyncQueue = window.TeflonSyncQueue || [];
    window.TeflonSyncIsProcessing = window.TeflonSyncIsProcessing || false;

    window.processTeflonQueue = async function () {
        if (window.TeflonSyncIsProcessing || window.TeflonSyncQueue.length === 0) return;
        window.TeflonSyncIsProcessing = true;

        while (window.TeflonSyncQueue.length > 0) {
            var item = window.TeflonSyncQueue[0];
            try {
                var endpoint = global.TeflonProcessing.resolveApiUrl('/api/csv/upsert');
                for (var i = 0; i < item.batch.length; i++) {
                    var call = item.batch[i];
                    var res = await fetch(endpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(call)
                    });
                    var jRes = await res.json().catch(function () { });
                    if (!res.ok || (jRes && jRes.success === false)) {
                        var extra = (jRes && jRes.unknownFields) ? (' (' + JSON.stringify(jRes.unknownFields) + ')') : '';
                        throw new Error(jRes ? (jRes.message + extra) : 'API Http ' + res.status);
                    }
                }
                if (global.notify && !item.hideSuccessInfo) {
                    global.notify.success(item.successMessage || "完了 (Giao dịch hoàn tất)!", "Success");
                }
                if (item.callback) item.callback();
                window.TeflonSyncQueue.shift();
            } catch (err) {
                console.error('Queue Sync Error:', err);
                if (global.notify) global.notify.error("同期失敗 (Lỗi đồng bộ ngầm): " + err.message, "API Error", { timeOut: 0, extendedTimeOut: 0 });
                if (item.errCallback) item.errCallback(err);
                window.TeflonSyncQueue.shift();
            }
        }
        window.TeflonSyncIsProcessing = false;
    };

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

        if (s.includes('承認待') || s.includes('requested') || s === 'pending') return { state: 'REQUESTED', log: latest };
        if (s.includes('承認済') || s.includes('approved')) return { state: 'APPROVED', log: latest };
        if (s.includes('加工中') || s.includes('sent') || s === 'processing') return { state: 'SENT', log: latest };
        if (s.includes('加工済') || s.includes('completed') || s === 'received') return { state: 'NONE', log: null }; // Finished cycle

        // Fallback for single characters or truncated MS Access strings
        if (s.includes('待')) return { state: 'REQUESTED', log: latest };
        if (s.includes('承')) return { state: 'APPROVED', log: latest };
        if (s.includes('進') || s.includes('発送')) return { state: 'SENT', log: latest };
        if (s.includes('完') || (s.includes('済') && !s.includes('承認'))) return { state: 'NONE', log: null };

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

        if (s.includes('承認待') || s.includes('requested') || s === 'pending') this.currentState = 'REQUESTED';

        if ((s.includes('承認済') || s.includes('approved')) && !s.includes('承認待')) this.currentState = 'APPROVED';

        if (s.includes('加工中') || s.includes('sent') || s === 'processing') this.currentState = 'SENT';

        if (s.includes('加工済') || s.includes('completed') || s === 'received') this.currentState = 'COMPLETED';

        if (this.currentState === 'NONE') {
            if (s.includes('待')) this.currentState = 'REQUESTED';
            else if (s.includes('承')) this.currentState = 'APPROVED';
            else if (s.includes('進') || s.includes('発送')) this.currentState = 'SENT';
            else if (s.includes('完') || (s.includes('済') && !s.includes('承認'))) this.currentState = 'COMPLETED';
        }



        // Render in edit mode

        this.renderDom(logs, true);

    };



    TeflonProcessing.prototype.deleteSpecificLog = async function (logId) {

        if (!confirm('このレコードを完全に削除してよろしいですか？\n(Bạn có chắc chắn muốn xóa bản ghi này trên hệ thống?)')) return;



        var self = this;

        var endpoint = this.resolveApiUrl('/api/csv/upsert');

        var defEmp = '';
        try { defEmp = localStorage.getItem('cio_default_employee_id'); } catch(e){}
        var employee = defEmp || '9';



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




    TeflonProcessing.prototype.renderFlatEditor = function (logs) {
        var self = this;
        var ex = document.getElementById('tefpRootOverlay');
        if (ex) ex.remove();

        var tLog = this.currentLog;
        if (!tLog) return;

        var companies = (this.dataCache && this.dataCache.companies) || [];
        var employees = ((this.dataCache && this.dataCache.employees) || []).slice().sort(function(a, b) {
            var sA = ['1', '2', '3'].indexOf(String(a.EmployeeID || '').trim()) >= 0 ? 1 : 0;
            var sB = ['1', '2', '3'].indexOf(String(b.EmployeeID || '').trim()) >= 0 ? 1 : 0;
            return sA - sB;
        });

        var empOpts = '<option value="">-- Chọn --</option><option value="1">システム (System)</option>';
        employees.forEach(function (e) { empOpts += '<option value="' + self.escapeHtml(e.EmployeeID) + '">' + self.escapeHtml(e.EmployeeName || e.Name) + '</option>'; });

        var supOpts = '<option value="">-- 選択 (Chọn) --</option>';
        companies.forEach(function (c) { supOpts += '<option value="' + self.escapeHtml(c.CompanyID) + '">' + self.escapeHtml(c.CompanyShortName || c.CompanyName || c.CompanyID) + '</option>'; });

        var stOpts = '';
        ['Requested', 'Approved', 'Sent', 'Completed'].forEach(function (s) {
            var sel = (String(tLog.TeflonStatus).toLowerCase() === s.toLowerCase()) ? 'selected' : '';
            stOpts += '<option value="' + s + '" ' + sel + '>' + s + '</option>';
        });

        var toIsoDate = function (dStr) {
            if (!dStr || String(dStr).trim() === '') return '';
            var d = new Date(dStr);
            if (isNaN(d.getTime())) return '';
            var m = d.getMonth() + 1;
            var day = d.getDate();
            return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
        };

        var rSupplier = String(tLog.SupplierID || '').trim();
        var rReqBy = String(tLog.RequestedBy || '').trim();
        var rSentBy = String(tLog.SentBy || '').trim();

        var html = `
            <div id="tefpBackdrop" class="tefp-backdrop"></div>
            <div id="tefpPanelWindow" class="tefp-panel tefp-flat-edit-panel" style="max-width:800px; width:95vw;">
                <div class="tefp-header">
                    <div class="tefp-title">
                        直接編集 (Sửa trực tiếp Bản ghi gốc) <span class="tefp-badge">${this.escapeHtml(tLog.TeflonLogID)}</span>
                    </div>
                    <button class="tefp-close-btn" id="tefpBtnCloseFlat"><i class="fas fa-times"></i></button>
                </div>
                <div class="tefp-body-split" style="display:block; padding:20px; overflow-y:auto; max-height:80vh;">
                    <div class="tefp-info-callout" style="background:#fffbeb; color:#b45309; padding:12px; border-radius:6px; margin-bottom:20px; font-size:13px; border-left:4px solid #f59e0b;">
                        <i class="fas fa-exclamation-triangle"></i> <strong>Lưu ý quan trọng:</strong> Trạng thái chỉnh sửa trực tiếp (Flat Edit) chỉ thay đổi dữ liệu bên trong tệp <code>teflonlog.csv</code>. Nếu bạn thay đổi chi phí hoặc các thông số, hãy chắc chắn. Thao tác này <b>KHÔNG</b> tự động gửi log Hành trình vị trí (Kho).
                    </div>
                    <!-- Phase 1: Request -->
                    <div style="margin-bottom: 20px; background:#f8fafc; padding:15px; border-radius:8px; border:1px solid #e2e8f0; border-left:4px solid #3b82f6;">
                        <h4 style="color: #1e40af; font-size: 14px; margin-top:0; margin-bottom: 12px; display:flex; align-items:center; gap:6px;"><i class="fas fa-file-signature"></i> 1. Trạng thái & Yêu cầu mạ (Request/Approve)</h4>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">TeflonStatus</label><select id="fe_TeflonStatus" class="tefp-select">${stOpts}</select></div>
                            <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">Nhà cung cấp (Supplier)</label><select id="fe_SupplierID" class="tefp-select">${supOpts.replace('value="' + self.escapeHtml(rSupplier) + '"', 'value="' + self.escapeHtml(rSupplier) + '" selected')}</select></div>
                            <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">Người yêu cầu / Duyệt</label><select id="fe_RequestedBy" class="tefp-select">${empOpts.replace('value="' + self.escapeHtml(rReqBy) + '"', 'value="' + self.escapeHtml(rReqBy) + '" selected')}</select></div>
                            <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">Ngày Yêu cầu (RequestedDate)</label><input type="date" id="fe_RequestedDate" class="tefp-input" value="${toIsoDate(tLog.RequestedDate)}"></div>
                            <div class="tefp-form-group" style="grid-column:span 2; margin-bottom:0;"><label class="tefp-label">Loại mạ (CoatingType)</label><input type="text" id="fe_CoatingType" class="tefp-input" value="${this.escapeHtml(tLog.CoatingType || '')}" placeholder="..."></div>
                            <div class="tefp-form-group" style="grid-column:span 2; margin-bottom:0;"><label class="tefp-label">Lý do mạ (Reason)</label><textarea id="fe_Reason" class="tefp-input tefp-textarea" style="min-height:50px">${this.escapeHtml(tLog.Reason || '')}</textarea></div>
                        </div>
                    </div>

                    <!-- Phase 3: Sent -->
                    <div style="margin-bottom: 20px; background:#fffbeb; padding:15px; border-radius:8px; border:1px solid #fef3c7; border-left:4px solid #d97706;">
                        <h4 style="color: #92400e; font-size: 14px; margin-top:0; margin-bottom: 12px; display:flex; align-items:center; gap:6px;"><i class="fas fa-truck"></i> 2. Giao đi mạ (Sent Phase)</h4>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="tefp-form-group" style="grid-column:span 2; margin-bottom:0;"><label class="tefp-label">Người xuất giao (SentBy)</label><select id="fe_SentBy" class="tefp-select">${empOpts.replace('value="' + self.escapeHtml(rSentBy) + '"', 'value="' + self.escapeHtml(rSentBy) + '" selected')}</select></div>
                            <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">Ngày giao đi (SentDate)</label><input type="date" id="fe_SentDate" class="tefp-input" value="${toIsoDate(tLog.SentDate)}"></div>
                            <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">Dự kiến nhận (ExpectedDate)</label><input type="date" id="fe_ExpectedDate" class="tefp-input" value="${toIsoDate(tLog.ExpectedDate)}"></div>
                        </div>
                    </div>

                    <!-- Phase 4: Received -->
                    <div style="margin-bottom: 20px; background:#ecfdf5; padding:15px; border-radius:8px; border:1px solid #d1fae5; border-left:4px solid #10b981;">
                        <h4 style="color: #065f46; font-size: 14px; margin-top:0; margin-bottom: 12px; display:flex; align-items:center; gap:6px;"><i class="fas fa-box-open"></i> 3. Nghiệm thu hoàn tất (Received Phase)</h4>
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                            <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">Ngày nhận về (ReceivedDate)</label><input type="date" id="fe_ReceivedDate" class="tefp-input" value="${toIsoDate(tLog.ReceivedDate)}"></div>
                            <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">Chi phí chốt (TeflonCost JPY)</label><input type="number" id="fe_TeflonCost" class="tefp-input" value="${this.escapeHtml(tLog.TeflonCost || '')}"></div>
                            <div class="tefp-form-group" style="grid-column: span 2; margin-bottom:0;"><label class="tefp-label">Đánh giá Chất lượng (Quality)</label><input type="text" id="fe_Quality" class="tefp-input" value="${this.escapeHtml(tLog.Quality || '')}"></div>
                        </div>
                    </div>

                    <!-- Notes -->
                    <div style="background:#f1f5f9; padding:15px; border-radius:8px; border:1px solid #e2e8f0; border-left:4px solid #64748b;">
                        <h4 style="color: #334155; font-size: 14px; margin-top:0; margin-bottom: 12px; display:flex; align-items:center; gap:6px;"><i class="fas fa-clipboard"></i> 4. Ghi chú chung (Notes)</h4>
                        <div class="tefp-form-group" style="margin-bottom:0;"><textarea id="fe_TeflonNotes" class="tefp-input tefp-textarea" style="min-height:60px">${this.escapeHtml(tLog.TeflonNotes || '')}</textarea></div>
                    </div>
                </div>
                <div class="tefp-header" style="border-top:1px solid #e2e8f0; border-bottom:none; display:flex; justify-content:flex-end; gap:10px; padding:15px 24px;">
                    <button type="button" class="tefp-btn-submit" id="tefpBtnCancelFlat" style="background:#cbd5e1; color:#333; width:auto; padding:8px 24px; display:flex; flex-direction:column; align-items:center; line-height:1.2;">
                       <span><i class="fas fa-times"></i> キャンセル</span>
                       <span style="font-size:11px; font-weight:normal; margin-top:2px;">(Hủy bỏ)</span>
                   </button>
                   <button type="button" class="tefp-btn-submit" id="tefpBtnSaveFlat" style="width:auto; padding:8px 32px; display:flex; flex-direction:column; align-items:center; line-height:1.2;">
                       <span><i class="fas fa-save"></i> CSV更新</span>
                       <span style="font-size:11px; font-weight:normal; margin-top:2px;">(Cập nhật CSV)</span>
                   </button>
                </div>
            </div>
        `;

        var dom = document.createElement('div');
        dom.id = 'tefpRootOverlay';
        dom.innerHTML = html;
        document.body.appendChild(dom);

        document.getElementById('tefpBtnCloseFlat').addEventListener('click', function () { self.closeModal(); });
        document.getElementById('tefpBtnCancelFlat').addEventListener('click', function () { self.openModal(self.currentMold); });

        document.getElementById('tefpBtnSaveFlat').addEventListener('click', async function () {
            var btn = this;
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Xử lý ngầm...';

            var entry = Object.assign({}, tLog);
            entry.TeflonStatus = document.getElementById('fe_TeflonStatus').value;
            entry.SupplierID = document.getElementById('fe_SupplierID').value;
            entry.RequestedBy = document.getElementById('fe_RequestedBy').value;
            entry.RequestedDate = document.getElementById('fe_RequestedDate').value;
            entry.SentBy = document.getElementById('fe_SentBy').value;
            entry.SentDate = document.getElementById('fe_SentDate').value;
            entry.ExpectedDate = document.getElementById('fe_ExpectedDate').value;
            entry.ReceivedDate = document.getElementById('fe_ReceivedDate').value;
            entry.TeflonCost = document.getElementById('fe_TeflonCost').value;
            entry.CoatingType = document.getElementById('fe_CoatingType').value;
            entry.Reason = document.getElementById('fe_Reason').value;
            entry.Quality = document.getElementById('fe_Quality').value;
            entry.TeflonNotes = document.getElementById('fe_TeflonNotes').value;
            entry.UpdatedAt = self.getTodayISO();

            var allowed = ['TeflonLogID', 'MoldID', 'TeflonStatus', 'RequestedBy', 'RequestedDate', 'ApprovedBy', 'ApprovedDate', 'SentBy', 'SentDate', 'ExpectedDate', 'ReceivedDate', 'ReceivedBy', 'SupplierID', 'CoatingType', 'Reason', 'TeflonCost', 'Quality', 'TeflonNotes', 'CreatedDate', 'UpdatedBy', 'UpdatedAt'];
            var cleanEntry = {};
            for (var i = 0; i < allowed.length; i++) {
                if (entry[allowed[i]] !== undefined) cleanEntry[allowed[i]] = entry[allowed[i]];
            }
            entry = cleanEntry;

            var batch = [{ filename: 'teflonlog.csv', idField: 'TeflonLogID', idValue: entry.TeflonLogID, updates: entry, mode: 'update' }];
            var dchLog = {
                DataChangeID: 'DCH' + Date.now().toString() + Math.random().toString(36).substr(2, 5),
                TableName: 'teflonlog',
                RecordID: entry.TeflonLogID, RecordIDField: 'TeflonLogID', FieldName: 'DirectEdit',
                OldValue: tLog.TeflonStatus, NewValue: entry.TeflonStatus,
                ChangedAt: new Date().toISOString(), ChangedBy: '1', ChangeSource: 'teflon_flat_edit', ChangeNote: 'Direct Flat Grid Edit', IsConflict: 'FALSE'
            };
            batch.push({ filename: 'datachangehistory.csv', idField: 'DataChangeID', idValue: dchLog.DataChangeID, updates: dchLog, mode: 'insert' });

            window.TeflonSyncQueue.push({
                batch: batch,
                hideSuccessInfo: false,
                successMessage: "Đã cập nhật phẳng bảng TeflonLog CSV thành công!",
                callback: function () {
                    var dataObj = window.DataManager ? window.DataManager.data : (window.ALL_DATA || {});
                    batch.forEach(function (b) {
                        var tn = b.filename.replace('.csv', '');
                        if (!dataObj[tn]) dataObj[tn] = [];
                        if (b.mode === 'update') {
                            var exId = dataObj[tn].findIndex(function (x) { return String(x[b.idField]) === String(b.idValue); });
                            if (exId >= 0) dataObj[tn][exId] = b.updates;
                            else dataObj[tn].push(b.updates);
                        } else {
                            dataObj[tn].push(b.updates);
                        }
                    });

                    if (window.DataManager && typeof window.DataManager.recompute === 'function') window.DataManager.recompute();
                    if (self.currentMold) {
                        let cid = self.currentMold.MoldID || self.currentMold.CutterID;
                        document.dispatchEvent(new CustomEvent('mcs-data-sync', { detail: { idValue: cid, payload: {} } }));
                    }

                    self.closeModal();
                    setTimeout(function () { self.openModal(self.currentMold); }, 300);

                    // Tránh cứng DetailPanel refresh đè nếu PubSub đã kích hoạt ở ngoài
                    // var dp = window.detailPanel || window.DetailPanel || (window.App && window.App.detailPanel);
                    // if (dp && dp.refreshCurrentTab) dp.refreshCurrentTab();
                },
                errCallback: function () {
                    btn.disabled = false;
                    btn.innerHTML = '<span><i class="fas fa-save"></i> CSV更新</span><span style="font-size:11px; font-weight:normal; margin-top:2px;">(Thử lại)</span>';
                }
            });
            if (typeof window.processTeflonQueue === 'function') window.processTeflonQueue();
        });

        setTimeout(function () {
            var bd = document.getElementById('tefpBackdrop');
            if (bd) bd.style.opacity = '1';
            var pw = document.getElementById('tefpPanelWindow');
            if (pw) pw.classList.add('tefp-active');
        }, 10);
    };

    TeflonProcessing.prototype.renderDom = function (logs, forceShowEdit) {
        if (this.isEditMode) {
            return this.renderFlatEditor(logs);
        }

        var ex = document.getElementById('tefpRootOverlay');

        if (ex) ex.remove();



        var today = this.getTodayISO();

        var companies = (this.dataCache && this.dataCache.companies) || [];

        var employees = ((this.dataCache && this.dataCache.employees) || []).slice().sort(function(a, b) {
            var sA = ['1', '2', '3'].indexOf(String(a.EmployeeID || '').trim()) >= 0 ? 1 : 0;
            var sB = ['1', '2', '3'].indexOf(String(b.EmployeeID || '').trim()) >= 0 ? 1 : 0;
            return sA - sB;
        });

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

                // [Heuristic Auto-Heal] Tương tự để hiển thị Timeline chính xác màu sắc
                if (!st || st === 'active' || st === 'null' || st === 'undefined') {
                    if (l.ReceivedDate) st = 'completed';
                    else if (l.SentDate) st = 'sent';
                    else if (l.ApprovedDate) st = 'approved';
                    else st = 'requested';
                }

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

                var hasNotes = !!(l.TeflonNotes || l.Reason || l.Quality || l.CoatingType || l.TeflonCost);
                var extraHtmlBlock = '';
                if (hasNotes) {
                    var cTypeHtm = (l.CoatingType) ? `<div class="tefp-tl-row" style="display:flex; padding:2px 0;"><span class="tefp-tl-lbl" style="width:140px; flex-shrink:0;">種類 <span style="font-size:10px; font-weight:normal">(Loại mạ)</span>:</span><div class="tefp-tl-val" style="flex:1;">${self.escapeHtml(l.CoatingType)}</div></div>` : '';
                    var reasonHtm = (l.Reason) ? `<div class="tefp-tl-row" style="display:flex; padding:2px 0;"><span class="tefp-tl-lbl" style="width:140px; flex-shrink:0;">理由 <span style="font-size:10px; font-weight:normal">(Lý do)</span>:</span><div class="tefp-tl-val" style="flex:1;">${self.escapeHtml(l.Reason)}</div></div>` : '';
                    var qualHtm = (l.Quality) ? `<div class="tefp-tl-row" style="display:flex; padding:2px 0;"><span class="tefp-tl-lbl" style="width:140px; flex-shrink:0;">品質 <span style="font-size:10px; font-weight:normal">(Chất lượng)</span>:</span><div class="tefp-tl-val" style="flex:1;">${self.escapeHtml(l.Quality)}</div></div>` : '';
                    var costHtm = (l.TeflonCost) ? `<div class="tefp-tl-row" style="display:flex; padding:2px 0;"><span class="tefp-tl-lbl" style="width:140px; flex-shrink:0;">費用 <span style="font-size:10px; font-weight:normal">(Chi phí)</span>:</span><div class="tefp-tl-val" style="flex:1; color:#059669; font-weight:600;">${Number(l.TeflonCost).toLocaleString('en-US')} JPY</div></div>` : '';
                    var noteHtm = (l.TeflonNotes) ? `<div class="tefp-tl-row" style="display:flex; padding:2px 0; align-items:flex-start;"><span class="tefp-tl-lbl" style="width:140px; flex-shrink:0; padding-top:2px;">備考 <span style="font-size:10px; font-weight:normal">(Ghi chú)</span>:</span><div class="tefp-tl-val" style="flex:1; white-space:pre-wrap; border-left:2px solid #cbd5e1; padding-left:8px;">${self.escapeHtml(l.TeflonNotes)}</div></div>` : '';

                    extraHtmlBlock = `
                    <div style="background:#f8fafc; border:1px solid #e2e8f0; font-size:12px; line-height:1.4; color:#334155; padding:10px 12px; margin-top:8px; border-radius:6px; box-shadow:0 1px 2px rgba(0,0,0,0.03);">
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            ${cTypeHtm}
                            ${reasonHtm}
                            ${qualHtm}
                            ${costHtm}
                            ${noteHtm}
                        </div>
                    </div>`;
                }

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

                            ${extraHtmlBlock}

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

                <div class="tefp-wizard-state" style="padding-top:10px;">
                    ${this.isEditMode ? '<div style="position:absolute;top:10px;right:20px;color:#d97706;font-size:20px"><i class="fas fa-edit"></i></div>' : ''}
                    <div class="tefp-state-title" style="color:#2563eb; font-size:16px; margin-bottom:5px;"><i class="fas fa-file-signature"></i> ${headTxt}</div>
                    <div class="tefp-state-desc" style="font-size:11px; margin-bottom:12px;">テフロン加工の新しい依頼を作成します。 (Khởi tạo lệnh mạ Teflon mới cho khuôn.)</div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px;">
                        <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">金型 <span class="tefp-label-sub">(Khuôn)</span></label><input type="text" class="tefp-input" value="${this.escapeHtml(this.currentMold.MoldID)}" disabled style="padding:6px 12px; height:auto;"></div>
                        <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">担当者 <span class="tefp-label-sub">(Nhân viên)</span><span style="color:red">*</span></label><select id="tefp_emp" class="tefp-select" style="padding:6px 12px; height:auto;">${empOpts}</select></div>
                        <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">希望日 <span class="tefp-label-sub">(Ngày Y/C)</span><span style="color:red">*</span></label><input type="date" id="tefp_reqDate" class="tefp-input" value="${tLog.RequestedDate || today}" style="padding:6px 12px; height:auto;"></div>
                        <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">テフロン業者 <span class="tefp-label-sub">(Nhà c.cấp)</span><span style="color:red">*</span></label><select id="tefp_suppId" class="tefp-select" style="padding:6px 12px; height:auto;">${supOpts}</select></div>
                        <div class="tefp-form-group" style="grid-column: span 2; margin-bottom:0;"><label class="tefp-label">理由・備考 <span class="tefp-label-sub">(Lý do/Ghi chú)</span></label><textarea id="tefp_notes" class="tefp-input tefp-textarea" placeholder="詳細を入力..." style="min-height:50px;">${tLog.Reason || tLog.TeflonNotes || ''}</textarea></div>
                    </div>

                    <div class="tefp-submit-group" style="display:flex; gap:10px;">
                        <button type="button" class="tefp-btn-submit tefpBtnSubmitClose" style="background:#64748b; flex:1; display:flex; flex-direction:column; align-items:center; line-height:1.2; padding:8px;">
                            <span><i class="fas fa-save"></i> 閉じて保存</span>
                            <span style="font-size:11px; font-weight:normal; margin-top:2px;">(Lưu và Đóng)</span>
                        </button>
                        <button type="button" class="tefp-btn-submit tefpBtnSubmitNext" style="flex:2; display:flex; flex-direction:column; align-items:center; line-height:1.2; padding:8px;">
                            <span><i class="fas fa-arrow-right"></i> 保存して次へ</span>
                            <span style="font-size:11px; font-weight:normal; margin-top:2px;">(Lưu và tiếp tục)</span>
                        </button>
                    </div>
                </div>

            `;

        }

        else if (this.currentState === 'REQUESTED' || (this.isEditMode && this.currentState === 'APPROVED')) {

            ctrlHtm = `

                <div class="tefp-wizard-state" style="padding-top:10px;">
                    ${this.isEditMode ? '<div style="position:absolute;top:10px;right:20px;color:#d97706;font-size:20px"><i class="fas fa-edit"></i></div>' : ''}
                    <div class="tefp-state-title" style="color:#0ea5e9; font-size:16px; margin-bottom:5px;"><i class="fas fa-stamp"></i> 承認 (Phê Duyệt)</div>
                    <div class="tefp-state-desc" style="font-size:11px; margin-bottom:12px;">依頼を確認し、承認します。(Duyệt yêu cầu để chuẩn bị kế hoạch gửi đi)</div>
                    
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px;">
                        <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">承認者 <span class="tefp-label-sub">(Người duyệt)</span><span style="color:red">*</span></label><select id="tefp_emp" class="tefp-select" style="padding:6px 12px; height:auto;">${empOpts}</select></div>
                        <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">承認日 <span class="tefp-label-sub">(Ngày duyệt)</span><span style="color:red">*</span></label><input type="date" id="tefp_apprDate" class="tefp-input" value="${today}" style="padding:6px 12px; height:auto;"></div>
                        <div class="tefp-form-group" style="grid-column: span 2; margin-bottom:0;"><label class="tefp-label">備考 <span class="tefp-label-sub">(Ghi chú)</span></label><textarea id="tefp_notes" class="tefp-input tefp-textarea" placeholder="追加の指示..." style="min-height:50px;"></textarea></div>
                    </div>

                    <div class="tefp-submit-group" style="display:flex; gap:10px;">
                        <button type="button" class="tefp-btn-submit tefpBtnSubmitClose btn-approve" style="background:#64748b; flex:1; display:flex; flex-direction:column; align-items:center; line-height:1.2; padding:8px;">
                            <span><i class="fas fa-save"></i> 閉じて保存</span>
                            <span style="font-size:11px; font-weight:normal; margin-top:2px;">(Lưu và Đóng)</span>
                        </button>
                        <button type="button" class="tefp-btn-submit tefpBtnSubmitNext btn-approve" style="flex:2; display:flex; flex-direction:column; align-items:center; line-height:1.2; padding:8px;">
                            <span><i class="fas fa-arrow-right"></i> 保存して次へ</span>
                            <span style="font-size:11px; font-weight:normal; margin-top:2px;">(Lưu và tiếp tục)</span>
                        </button>
                    </div>
                </div>

            `;

        }

        else if (this.currentState === 'APPROVED' || (this.isEditMode && this.currentState === 'SENT')) {

            var expISO = this.calculateWorkingDays(today, 5); // 5 working days default



            ctrlHtm = `

                <div class="tefp-wizard-state" style="padding-top:10px;">
                    ${this.isEditMode ? '<div style="position:absolute;top:10px;right:20px;color:#d97706;font-size:20px"><i class="fas fa-edit"></i></div>' : ''}
                    <div class="tefp-state-title" style="color:#d97706; font-size:16px; margin-bottom:5px;"><i class="fas fa-truck"></i> 発送 (Giao Đi Mạ)</div>
                    <div class="tefp-state-desc" style="font-size:11px; margin-bottom:12px;">金型を業者へ発送しました。(Xác nhận khuôn đã rời xưởng)</div>
                    
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px;">
                        <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">担当者 <span class="tefp-label-sub">(Nhân viên xuất)</span><span style="color:red">*</span></label><select id="tefp_emp" class="tefp-select" style="padding:6px 12px; height:auto;">${empOpts}</select></div>
                        <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">発送日 <span class="tefp-label-sub">(Ngày Gửi Đi)</span><span style="color:red">*</span></label><input type="date" id="tefp_sentDate" class="tefp-input" value="${tLog.SentDate || today}" style="padding:6px 12px; height:auto;"></div>
                        <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">受取予定日 <span class="tefp-label-sub">(Dự Kiến Nhận)</span><span style="color:red">*</span></label><input type="date" id="tefp_expDate" class="tefp-input" value="${tLog.ExpectedDate || expISO}" style="padding:6px 12px; height:auto;"></div>
                        <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">費用 JPY <span class="tefp-label-sub">(Báo Giá)</span></label><input type="number" id="tefp_cost" class="tefp-input" placeholder="0" value="${tLog.TeflonCost || ''}" style="padding:6px 12px; height:auto;"></div>
                        <div class="tefp-form-group" style="grid-column: span 2; margin-bottom:0;"><label class="tefp-label">備考 <span class="tefp-label-sub">(Ghi chút vận chuyển)</span></label><textarea id="tefp_notes" class="tefp-input tefp-textarea" placeholder="..." style="min-height:50px;"></textarea></div>
                    </div>

                    <div class="tefp-submit-group" style="display:flex; gap:10px;">
                        <button type="button" class="tefp-btn-submit tefpBtnSubmitClose btn-sent" style="background:#64748b; flex:1; display:flex; flex-direction:column; align-items:center; line-height:1.2; padding:8px;">
                            <span><i class="fas fa-save"></i> 閉じて保存</span>
                            <span style="font-size:11px; font-weight:normal; margin-top:2px;">(Lưu và Đóng)</span>
                        </button>
                        <button type="button" class="tefp-btn-submit tefpBtnSubmitNext btn-sent" style="flex:1; display:flex; flex-direction:column; align-items:center; line-height:1.2; padding:8px;">
                            <span><i class="fas fa-arrow-right"></i> 保存して次へ</span>
                            <span style="font-size:11px; font-weight:normal; margin-top:2px;">(Lưu và tiếp tục)</span>
                        </button>
                    </div>
                </div>

            `;

        }

        else if (this.currentState === 'SENT' || (this.isEditMode && this.currentState === 'COMPLETED')) {

            ctrlHtm = `

                <div class="tefp-wizard-state" style="padding-top:10px;">
                    ${this.isEditMode ? '<div style="position:absolute;top:10px;right:20px;color:#d97706;font-size:20px"><i class="fas fa-edit"></i></div>' : ''}
                    <div class="tefp-state-title" style="color:#059669; font-size:16px; margin-bottom:5px;"><i class="fas fa-box-open"></i> 受取 (Nhận Hoàn Tất)</div>
                    <div class="tefp-state-desc" style="font-size:11px; margin-bottom:12px;">施工ラインから戻りました。(Khuôn đã về xưởng sau định kỳ)</div>
                    
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px;">
                        <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">担当者 <span class="tefp-label-sub">(Người nhận)</span><span style="color:red">*</span></label><select id="tefp_emp" class="tefp-select" style="padding:6px 12px; height:auto;">${empOpts}</select></div>
                        <div class="tefp-form-group" style="margin-bottom:0;"><label class="tefp-label">受取日 <span class="tefp-label-sub">(Ngày Nhận Tế)</span><span style="color:red">*</span></label><input type="date" id="tefp_recvDate" class="tefp-input" value="${tLog.ReceivedDate || today}" style="padding:6px 12px; height:auto;"></div>
                        <div class="tefp-form-group" style="grid-column: span 2; margin-bottom:0;"><label class="tefp-label">最終費用 JPY <span class="tefp-label-sub">(Chi phí chốt)</span></label><input type="number" id="tefp_cost" class="tefp-input" value="${tLog.TeflonCost || ''}" placeholder="0" style="padding:6px 12px; height:auto;"></div>
                        <div class="tefp-form-group" style="grid-column: span 2; margin-bottom:0;"><label class="tefp-label">備考 <span class="tefp-label-sub">(Ghi Chú Nghiệm Thu)</span></label><textarea id="tefp_notes" class="tefp-input tefp-textarea" placeholder="品質状態など..." style="min-height:50px;"></textarea></div>
                    </div>

                    <div class="tefp-submit-group" style="display:flex; gap:10px;">
                        <button type="button" class="tefp-btn-submit tefpBtnSubmitClose btn-recv" style="width:100%; display:flex; flex-direction:column; align-items:center; line-height:1.2; padding:8px;">
                            <span><i class="fas fa-clipboard-check"></i> 完了して閉じる</span>
                            <span style="font-size:11px; font-weight:normal; margin-top:2px;">(Hoàn tất và Đóng popup)</span>
                        </button>
                    </div>
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



        // Bind Group Buttons for Queue Execution
        var closes = document.querySelectorAll('.tefpBtnSubmitClose');
        for (var i = 0; i < closes.length; i++) {
            closes[i].addEventListener('click', function () { self.handleSubmit(true); });
        }
        var nexts = document.querySelectorAll('.tefpBtnSubmitNext');
        for (var i = 0; i < nexts.length; i++) {
            nexts[i].addEventListener('click', function () { self.handleSubmit(false); });
        }



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



    TeflonProcessing.prototype.handleSubmit = async function (isSaveAndClose) {

        var self = this;

        var today = this.getTodayISO();

        var defEmp = '';
        try { defEmp = localStorage.getItem('cio_default_employee_id'); } catch(e){}
        var employee = document.getElementById('tefp_emp') ? document.getElementById('tefp_emp').value : (defEmp || '9');



        var entry = {};

        var mode = 'update';



        if (this.currentState === 'NONE' || (this.isEditMode && this.currentState === 'REQUESTED')) {

            var newId = this.isEditMode ? this.currentLog.TeflonLogID : ('TL' + Date.now().toString().slice(-6));

            entry = this.isEditMode ? Object.assign({}, this.currentLog) : { TeflonLogID: newId, MoldID: this.currentMold.MoldID, CreatedDate: today };



            entry.TeflonStatus = 'Requested';

            entry.RequestedDate = document.getElementById('tefp_reqDate') ? document.getElementById('tefp_reqDate').value : today;

            entry.RequestedBy = employee;

            entry.SupplierID = document.getElementById('tefp_suppId') ? document.getElementById('tefp_suppId').value : '';

            var reasonNote = document.getElementById('tefp_notes') ? document.getElementById('tefp_notes').value : '';
            if (reasonNote) entry.TeflonNotes = reasonNote;



            mode = this.isEditMode ? 'update' : 'insert';

        }

        else if (this.currentState === 'REQUESTED' || (this.isEditMode && this.currentState === 'APPROVED')) {

            entry = Object.assign({}, this.currentLog);

            entry.TeflonStatus = 'Approved';



            var aDate = document.getElementById('tefp_apprDate');

            if (aDate) entry.ApprovedDate = aDate.value || today;
            entry.ApprovedBy = employee;
            entry.UpdatedAt = today;



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

            entry.UpdatedAt = today;

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

            entry.UpdatedAt = today;

            mode = 'update';

        } else {

            return;

        }



        // BỘ LỌC WHITELIST KHẮT KHE: NGĂN CHẶN 'UNKNOWN FIELDS'
        var allowed = ['TeflonLogID', 'MoldID', 'TeflonStatus', 'RequestedBy', 'RequestedDate', 'ApprovedBy', 'ApprovedDate', 'SentBy', 'SentDate', 'ExpectedDate', 'ReceivedDate', 'ReceivedBy', 'SupplierID', 'CoatingType', 'Reason', 'TeflonCost', 'Quality', 'TeflonNotes', 'CreatedDate', 'UpdatedBy', 'UpdatedAt'];
        var cleanEntry = {};
        for (var i = 0; i < allowed.length; i++) {
            if (entry[allowed[i]] !== undefined) cleanEntry[allowed[i]] = entry[allowed[i]];
        }
        entry = cleanEntry;

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



        // 3. Ecosystem Cascading: Delegated to /api/add-shiplog
        var shipPayload = null;
        var supplierTargetStr = String(entry.SupplierID || '7');
        var hasStatusChanged = (this.currentLog && entry.TeflonStatus !== this.currentLog.TeflonStatus) || !this.currentLog;
        var isSaveAndClose = false;
        var today = new Date().toISOString().split('T')[0];

        if (entry.TeflonStatus === 'Sent' && (!this.isEditMode || hasStatusChanged)) {
            shipPayload = {
                MoldID: self.currentMold.MoldID,
                ToCompanyID: supplierTargetStr,
                EmployeeID: String(employee),
                ShipNotes: 'テフロン加工へ発送',
                ShipDate: today
            };
        } else if (entry.TeflonStatus === 'Completed' && (!this.isEditMode || hasStatusChanged)) {
            shipPayload = {
                MoldID: self.currentMold.MoldID,
                ToCompanyID: '2',
                EmployeeID: String(employee),
                ShipNotes: 'テフロン加工後受取',
                ShipDate: today
            };
        }

        var upStatus = String(entry.TeflonStatus).toUpperCase();
        var shouldPromptLocation = false;
        var finalNextState = upStatus;

        if (upStatus === 'REQUESTED') finalNextState = 'REQUESTED';
        else if (upStatus === 'APPROVED') finalNextState = 'APPROVED';
        else if (upStatus === 'SENT') finalNextState = 'SENT';
        else if (upStatus === 'COMPLETED') {
            finalNextState = 'NONE';
            isSaveAndClose = true;
            shouldPromptLocation = true;
        }

        var processMainBatch = function () {
            window.TeflonSyncQueue.push({
                batch: batch,
                hideSuccessInfo: false,
                callback: function () {
                    var dataObj = window.DataManager ? window.DataManager.data : (window.ALL_DATA || {});
                    batch.forEach(function (b) {
                        var tn = b.filename.replace('.csv', '');
                        if (!dataObj[tn]) dataObj[tn] = [];
                        if (b.mode === 'update') {
                            var exId = dataObj[tn].findIndex(function (x) { return String(x[b.idField]) === String(b.idValue); });
                            if (exId >= 0) dataObj[tn][exId] = b.updates;
                            else dataObj[tn].push(b.updates);
                        } else {
                            dataObj[tn].push(b.updates);
                        }
                    });

                    var dp = window.detailPanel || window.DetailPanel || (window.App && window.App.detailPanel);
                    if (dp && dp.refreshCurrentTab) dp.refreshCurrentTab();

                    if (shouldPromptLocation && window.RackRelocation && typeof window.RackRelocation.open === 'function') {
                        setTimeout(function () { window.RackRelocation.open(self.currentMold); }, 400);
                    }
                }
            });
            if (typeof window.processTeflonQueue === 'function') window.processTeflonQueue();
        };

        if (shipPayload) {
            if (window.notify) window.notify.info('Đang đồng bộ luân chuyển vận chuyển...');
            fetch(API_BASE_URL + '/api/add-shiplog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(shipPayload)
            })
            .then(function(res) { return res.json(); })
            .then(function(resData) {
                if (resData.success === false) throw new Error(resData.message);
                
                // Cập nhật local DataManager memory manually to reflect the changes
                if (global.DataManager && global.DataManager.data) {
                    var mIdx = global.DataManager.data.molds.findIndex(function(m) { return String(m.MoldID) === String(self.currentMold.MoldID); });
                    if (mIdx >= 0) {
                        global.DataManager.data.molds[mIdx].KeeperCompany = shipPayload.ToCompanyID;
                        self.currentMold.KeeperCompany = shipPayload.ToCompanyID;
                    }
                    
                    if (!global.DataManager.data.shiplog) global.DataManager.data.shiplog = [];
                    global.DataManager.data.shiplog.unshift({
                        ShipID: resData.ShipID || ('SHIP' + Date.now()),
                        MoldID: shipPayload.MoldID,
                        CutterID: '',
                        ShipDate: shipPayload.ShipDate,
                        ToCompanyID: shipPayload.ToCompanyID,
                        FromCompanyID: resData.FromCompanyID || '',
                        ShipNotes: shipPayload.ShipNotes,
                        EmployeeID: shipPayload.EmployeeID
                    });

                    if (!global.DataManager.data.statuslogs) global.DataManager.data.statuslogs = [];
                    var st = shipPayload.ToCompanyID === '2' ? 'IN' : 'OUT';
                    global.DataManager.data.statuslogs.unshift({
                        StatusLogID: 'ST' + Date.now(),
                        MoldID: shipPayload.MoldID,
                        CutterID: '',
                        ItemType: 'mold',
                        Status: st,
                        Timestamp: new Date().toISOString(),
                        DestinationID: shipPayload.ToCompanyID,
                        EmployeeID: shipPayload.EmployeeID
                    });
                }
                
                processMainBatch();
            })
            .catch(function(err) {
                console.error('ShipLog API Error:', err);
                if (window.notify) window.notify.error('Lỗi khi vận chuyển luân chuyển: ' + err.message);
                else alert('Lỗi vận chuyển luân chuyển: ' + err.message);
                // Tiến hành ghi log Teflon mặc dù lỗi vận chuyển
                processMainBatch();
            });
        } else {
            processMainBatch();
        }

        var dataObj = window.DataManager ? window.DataManager.data : (window.ALL_DATA || {});
        if (!dataObj.teflonlog) dataObj.teflonlog = [];
        var existIdx = dataObj.teflonlog.findIndex(function (x) { return String(x.TeflonLogID) === String(entry.TeflonLogID); });
        if (existIdx >= 0) dataObj.teflonlog[existIdx] = entry;
        else dataObj.teflonlog.push(entry);

        self.isEditMode = false;
        self.currentLog = entry;
        self.currentState = finalNextState;

        if (isSaveAndClose) {
            self.closeModal();
        } else {
            self.renderDom(self.getLogsForMold(self.currentMold.MoldID));
        }

    };



    global.TeflonProcessing = new TeflonProcessing();



})(typeof window !== 'undefined' ? window : this);


/**
 * teflon-processing-v8.5.12-1.js
 * State Machine Workflow for Teflon Coating (Request -> Send -> Receive)
 */

(function(global) {
    'use strict';

    var TeflonProcessing = function() {
        this.containerId = 'tefprocRoot';
        this.dataCache = null;
        this.currentMold = null;
        this.currentLog = null;
        this.currentState = 'NONE'; // NONE, REQUESTED, SENT
    };

    TeflonProcessing.prototype.init = function() {
        console.log('✅ TeflonProcessing v8.5.12-1 Initialized (State Machine)');
    };

    TeflonProcessing.prototype.getTodayISO = function() {
        return new Date().toISOString().split('T')[0];
    };

    TeflonProcessing.prototype.resolveApiUrl = function(path) {
        var base = window.location.origin;
        if (base.indexOf('file://') === 0 || base.indexOf('localhost') > -0 || base.indexOf('127.0.0.1') > -0) {
            base = 'https://ysd-moldcutter-backend.onrender.com';
        }
        return base + path;
    };

    TeflonProcessing.prototype.escapeHtml = function(text) {
        if (!text) return '';
        return String(text).replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
        });
    };

    TeflonProcessing.prototype.fetchLatestData = function() {
        var dm = window.DataManager;
        if (!dm || !dm.data) return null;
        this.dataCache = dm.data;
        return dm.data;
    };

    TeflonProcessing.prototype.getLogsForMold = function(moldId) {
        if (!this.dataCache) return [];
        var teflonlog = this.dataCache.teflonlog || [];
        var webteflonlog = this.dataCache.webteflonlog || [];
        
        var combined = [];
        var map = new Map();
        
        // Merge web data over access data based on TeflonLogID
        teflonlog.forEach(function(r) {
            if (String(r.MoldID) === String(moldId)) map.set(String(r.TeflonLogID), r);
        });
        webteflonlog.forEach(function(r) {
            if (String(r.MoldID) === String(moldId)) map.set(String(r.TeflonLogID), r);
        });
        
        map.forEach(function(val) { combined.push(val); });
        
        // Sort DESC by CreatedDate/RequestedDate or LogID
        combined.sort(function(a, b) {
            var da = new Date(a.CreatedDate || a.RequestedDate || '1970').getTime();
            var db = new Date(b.CreatedDate || b.RequestedDate || '1970').getTime();
            if (da !== db) return db - da; // Newest first
            return String(b.TeflonLogID).localeCompare(String(a.TeflonLogID));
        });
        
        return combined;
    };

    TeflonProcessing.prototype.determineState = function(logs) {
        if (!logs || logs.length === 0) return { state: 'NONE', log: null };
        var latest = logs[0];
        var s = String(latest.TeflonStatus || '').trim().toLowerCase();
        
        if (s === 'requested' || s === 'pending') return { state: 'REQUESTED', log: latest };
        if (s === 'sent') return { state: 'SENT', log: latest };
        if (s === 'completed' || s === 'received') return { state: 'NONE', log: null }; // Done, ready for new cycle
        
        return { state: 'NONE', log: null };
    };

    TeflonProcessing.prototype.openModal = function(moldRow) {
        if (!moldRow || !moldRow.MoldID) {
            if (window.notify) window.notify.error("Không tìm thấy mã khuôn hợp lệ.");
            return;
        }
        this.currentMold = moldRow;
        this.fetchLatestData();
        
        var logs = this.getLogsForMold(moldRow.MoldID);
        var st = this.determineState(logs);
        
        this.currentState = st.state;
        this.currentLog = st.log;
        
        this.renderDom(logs);
    };

    TeflonProcessing.prototype.closeModal = function() {
        var bd = document.getElementById('tefpBackdrop');
        var pn = document.getElementById('tefpPanelWindow');
        if (bd) bd.style.opacity = '0';
        if (pn) pn.classList.remove('tefp-active');
        setTimeout(function() {
            var ex = document.getElementById('tefpRootOverlay');
            if (ex) ex.remove();
        }, 300);
    };

    TeflonProcessing.prototype.renderDom = function(logs) {
        var ex = document.getElementById('tefpRootOverlay');
        if (ex) ex.remove();

        var today = this.getTodayISO();
        var companies = (this.dataCache && this.dataCache.companies) || [];
        var employees = (this.dataCache && this.dataCache.employees) || [];
        var self = this;

        // Build History HTML
        var histHtm = '<div class="tefp-h-wrap"><table class="tefp-h-table"><thead><tr><th>状態 <br><small>(Trạng thái)</small></th><th>依頼日 <br><small>(Ngày YC)</small></th><th>発送日 <br><small>(Ngày Gửi)</small></th><th>受取日 <br><small>(Ngày Nhận)</small></th></tr></thead><tbody>';
        if (logs.length === 0) {
            histHtm += '<tr><td colspan="4" class="tefp-empty">この金型はテフロン加工履歴がありません。<br><small>(Khuôn này chưa từng mạ Teflon.)</small></td></tr>';
        } else {
            logs.forEach(function(l) {
                var st = String(l.TeflonStatus||'');
                var cls = 'pill-req'; var txt = '依頼済 (Đã YC)';
                if (st.toLowerCase()==='sent') { cls='pill-sent'; txt='加工中 (Đang Mạ)'; }
                if (st.toLowerCase()==='completed') { cls='pill-recv'; txt='完了 (Hoàn Tất)'; }
                
                histHtm += '<tr>';
                histHtm += '<td><span class="tefp-pill '+cls+'">'+txt+'</span></td>';
                histHtm += '<td>'+(l.RequestedDate||'-')+'</td>';
                histHtm += '<td>'+(l.SentDate||'-')+'</td>';
                histHtm += '<td>'+(l.ReceivedDate||'-')+'</td>';
                histHtm += '</tr>';
            });
        }
        histHtm += '</tbody></table></div>';

        // Build Controls HTML based on State
        var ctrlHtm = '';
        if (this.currentState === 'NONE') {
            // PHASE 1: Create Request
            var supOpts = '<option value="">-- 選択 (Chọn) --</option>';
            companies.forEach(function(c) { supOpts += '<option value="'+c.CompanyID+'">'+(c.CompanyShortName||c.CompanyName||c.CompanyID)+'</option>'; });
            var empOpts = '<option value="1">Toàn</option>'; // Default fallback
            employees.forEach(function(e) { empOpts += '<option value="'+e.EmployeeID+'">'+(e.EmployeeNameShort||e.name||e.EmployeeID)+'</option>'; });
            
            ctrlHtm = `
                <div class="tefp-wizard-state">
                    <div class="tefp-state-title"><i class="fas fa-file-signature"></i> テフロン加工依頼 <small>(Yêu cầu Mạ) L1/3</small></div>
                    <div class="tefp-state-desc">この金型の新規テフロン加工依頼を作成します。<br>Tạo mới một yêu cầu mạ Teflon cho khuôn này.</div>
                    
                    <div class="tefp-form-group">
                        <label class="tefp-label">希望日 (Ngày Yêu Cầu)</label>
                        <input type="date" id="tefp_reqDate" class="tefp-input" value="${today}">
                    </div>
                    <div class="tefp-form-group" style="display:none;">
                        <label class="tefp-label">依頼者 (Người Yêu Cầu)</label>
                        <select id="tefp_reqBy" class="tefp-select">${empOpts}</select>
                    </div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">業者 (Nhà Cung Cấp)</label>
                        <select id="tefp_suppId" class="tefp-select">${supOpts}</select>
                    </div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">理由 (Lý do mạ)</label>
                        <textarea id="tefp_reason" class="tefp-input tefp-textarea" placeholder="Nhập lý do gửi mạ..."></textarea>
                    </div>
                    <button type="button" id="tefpBtnSubmit" class="tefp-btn-submit"><i class="fas fa-paper-plane"></i> 依頼を作成 (Tạo Yêu Cầu Mạ)</button>
                </div>
            `;
        } else if (this.currentState === 'REQUESTED') {
            // PHASE 2: Send
            ctrlHtm = `
                <div class="tefp-wizard-state">
                    <div class="tefp-state-title" style="color: #d97706;"><i class="fas fa-truck"></i> 加工発送 <small>(Xác nhận Gửi đi) L2/3</small></div>
                    <div class="tefp-state-desc">工場からの発送を記録します。<br>Ghi nhận khuôn đã rời khỏi nhà máy để đi mạ.</div>
                    
                    <div class="tefp-form-group">
                        <label class="tefp-label">発送日 (Ngày Gửi Đi)</label>
                        <input type="date" id="tefp_sentDate" class="tefp-input" value="${today}">
                    </div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">受取予定日 (Ngày Dự Kiến Nhận)</label>
                        <input type="date" id="tefp_expDate" class="tefp-input">
                    </div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">費用 JPY (Chi phí mạ)</label>
                        <input type="number" id="tefp_cost" class="tefp-input" placeholder="0">
                    </div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">備考 (Ghi chú gửi)</label>
                        <textarea id="tefp_notes" class="tefp-input tefp-textarea" placeholder="Nhập ghi chú (tùy chọn)..."></textarea>
                    </div>
                    <button type="button" id="tefpBtnSubmit" class="tefp-btn-submit btn-sent"><i class="fas fa-check"></i> 発送確認 (Xác nhận Đã Gửi Mạ)</button>
                </div>
            `;
        } else if (this.currentState === 'SENT') {
            // PHASE 3: Receive
            ctrlHtm = `
                <div class="tefp-wizard-state">
                    <div class="tefp-state-title" style="color: #059669;"><i class="fas fa-box-open"></i> 加工受取 <small>(Nhận lại Khuôn) L3/3</small></div>
                    <div class="tefp-state-desc">金型の受け取りを記録します。<br>Khuôn đã mạ xong và trả về xưởng. Chốt lịch sử mạ.</div>
                    
                    <div class="tefp-form-group">
                        <label class="tefp-label">受取日 (Ngày Nhận)</label>
                        <input type="date" id="tefp_recvDate" class="tefp-input" value="${today}">
                    </div>
                    <div class="tefp-form-group">
                        <label class="tefp-label">追加備考 (Ghi chú bổ sung)</label>
                        <textarea id="tefp_notes" class="tefp-input tefp-textarea" placeholder="Nhập ghi chú sau khi mạ xong..."></textarea>
                    </div>
                    <button type="button" id="tefpBtnSubmit" class="tefp-btn-submit btn-recv"><i class="fas fa-clipboard-check"></i> 受取完了 (Chốt Nhận Lại Khuôn)</button>
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
                        テフロン加工フロー (Quy trình Mạ Teflon)
                        <span class="tefp-badge">${this.escapeHtml(this.currentMold.MoldID)}</span>
                    </div>
                    <button class="tefp-close-btn" id="tefpBtnClose"><i class="fas fa-times"></i></button>
                </div>
                <div class="tefp-body-split">
                    <div class="tefp-col-controls">
                        ${ctrlHtm}
                    </div>
                    <div class="tefp-col-history">
                        <h4 style="margin:0 0 12px 0; font-size:14px; color:#1e293b;">📋 履歴 (Lịch Sử)</h4>
                        ${histHtm}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(dom);

        // Bind events
        document.getElementById('tefpBtnClose').addEventListener('click', function() { self.closeModal(); });
        document.getElementById('tefpBackdrop').addEventListener('click', function() { self.closeModal(); });
        
        var submitBtn = document.getElementById('tefpBtnSubmit');
        if (submitBtn) {
            submitBtn.addEventListener('click', function() { self.handleSubmit(); });
        }

        // Trigger animations
        setTimeout(function() {
            document.getElementById('tefpBackdrop').style.opacity = '1';
            document.getElementById('tefpPanelWindow').classList.add('tefp-active');
        }, 10);
    };

    TeflonProcessing.prototype.handleSubmit = async function() {
        var self = this;
        var today = this.getTodayISO();
        var entry = {};
        
        if (this.currentState === 'NONE') {
            // Tạo mới Request
            // TeflonLogID sinh tự động 6 ký tự
            var newId = 'TL' + Date.now().toString().slice(-6);
            entry = {
                TeflonLogID: newId,
                MoldID: this.currentMold.MoldID,
                TeflonStatus: 'Requested',
                RequestedDate: document.getElementById('tefp_reqDate') ? document.getElementById('tefp_reqDate').value || today : today,
                RequestedBy: document.getElementById('tefp_reqBy') ? document.getElementById('tefp_reqBy').value || '1' : '1',
                SupplierID: document.getElementById('tefp_suppId') ? document.getElementById('tefp_suppId').value : '',
                Reason: document.getElementById('tefp_reason') ? document.getElementById('tefp_reason').value : '',
                CreatedDate: today
            };
        } else if (this.currentState === 'REQUESTED' && this.currentLog) {
            // Gửi đi
            entry = Object.assign({}, this.currentLog);
            entry.TeflonStatus = 'Sent';
            if (document.getElementById('tefp_sentDate')) entry.SentDate = document.getElementById('tefp_sentDate').value || today;
            if (document.getElementById('tefp_expDate')) entry.ExpectedDate = document.getElementById('tefp_expDate').value || '';
            if (document.getElementById('tefp_cost')) entry.TeflonCost = document.getElementById('tefp_cost').value || '';
            
            var notes = document.getElementById('tefp_notes') ? document.getElementById('tefp_notes').value : '';
            if (notes) entry.TeflonNotes = (entry.TeflonNotes ? entry.TeflonNotes + ' | ' : '') + notes;
            entry.UpdatedDate = today;
        } else if (this.currentState === 'SENT' && this.currentLog) {
            // Nhận lại
            entry = Object.assign({}, this.currentLog);
            entry.TeflonStatus = 'Completed';
            if (document.getElementById('tefp_recvDate')) entry.ReceivedDate = document.getElementById('tefp_recvDate').value || today;
            
            var notes2 = document.getElementById('tefp_notes') ? document.getElementById('tefp_notes').value : '';
            if (notes2) entry.TeflonNotes = (entry.TeflonNotes ? entry.TeflonNotes + ' | ' : '') + notes2;
            entry.UpdatedDate = today;
        } else {
            return; // Error state
        }
        
        // Optimistic UI + Close
        if (window.notify) window.notify.success("Chờ xử lý (処理中)...");
        var backupBtn = document.getElementById('tefpBtnSubmit');
        if (backupBtn) { backupBtn.disabled = true; backupBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Loading...'; }
        
        try {
            var endpoint = this.resolveApiUrl('/api/csv/upsert');
            var res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    filename: 'webteflonlog.csv', 
                    idField: 'TeflonLogID',
                    idValue: entry.TeflonLogID,
                    updates: entry 
                })
            });
            var json = await res.json();
            if (json.success) {
                // Update fallback in webmolds
                var mcFn = 'webmolds.csv';
                var mEntry = {
                    MoldID: self.currentMold.MoldID,
                    TeflonCoating: entry.TeflonStatus // Use as fallback
                };
                if (entry.SentDate) mEntry.TeflonSentDate = entry.SentDate;
                if (entry.ReceivedDate) mEntry.TeflonReceivedDate = entry.ReceivedDate;
                if (entry.ExpectedDate) mEntry.TeflonExpectedDate = entry.ExpectedDate;
                
                // Logic storage_company
                if (this.currentState === 'REQUESTED') {
                    // Send out to supplier
                    mEntry.storage_company = entry.SupplierID || '7'; // Default 7 (Teflon supplier)
                } else if (this.currentState === 'SENT') {
                    // Receive back to YSD
                    mEntry.storage_company = '2'; // YSD Storage
                }
                
                // Fire & forget molds upsert
                fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        filename: mcFn, 
                        idField: 'MoldID',
                        idValue: self.currentMold.MoldID,
                        updates: mEntry 
                    })
                }).catch(function(e){ console.warn("Molds fallback sync err:", e); });
                
                if (window.notify) window.notify.success("Đồng bộ thành công (同期完了)");
                self.closeModal();
                
                // Dòng này báo DataManager nạp lại file từ server. 
                // Có thể làm trang tự reload Grid nếu cần.
                setTimeout(function(){
                    if (window.DataManager && typeof window.DataManager.recompute === 'function') {
                        window.DataManager.recompute();
                    } else if (window.filterModule && typeof window.filterModule.triggerSearch === 'function') {
                        window.filterModule.triggerSearch();
                    }
                }, 500);

            } else {
                throw new Error(json.message || "Lỗi API");
            }
        } catch (err) {
            console.error(err);
            if (window.notify) window.notify.error("Lỗi đồng bộ: " + err.message);
            if (backupBtn) { backupBtn.disabled = false; backupBtn.innerHTML = 'Thử lại'; }
        }
    };

    // Instantiate Main Object
    global.TeflonProcessing = new TeflonProcessing();

})(typeof window !== 'undefined' ? window : this);

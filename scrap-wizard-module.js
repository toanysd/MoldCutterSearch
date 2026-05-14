// v9.0.2
/* ============================================================================
   scrap-wizard-module.js
   Module: Hủy Khuôn (Scrap) bằng UI Phân Rẽ Hành Động (Smart Grid Action-Based)
   V2: 2-step division like Transfer Module
============================================================================ */

(function(global) {
    "use strict";

    function resolveApiUrl(path) {
        var p = String(path || '').trim();
        var normalized = p.charAt(0) === '/' ? p : ('/' + p);
        if (global.MCS_API_BASE_URL) return global.MCS_API_BASE_URL.replace(/\/+$/, '') + normalized;
        return 'https://ysd-moldcutter-backend.onrender.com' + normalized;
    }

    var API_SCRAP = resolveApiUrl('/api/process-scrap');

    function escapeHtml(text) {
        if (text === null || text === undefined) return '';
        var div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    function JV(ja, vi) {
        return '<div style="font-weight:700; font-size:15px;">'+ja+'</div><div style="font-size:11px; font-weight:600; opacity:0.85; margin-top:2px;">'+vi+'</div>';
    }

    var ScrapWizardModule = {
        isOpen: false,
        currentItem: null,
        historyRecords: [],
        historyRecord: null,
        
        uiScreen: 'MENU',
        step: 1, /* For PLAN/SCRAP multi-step */

        state: {
            employeeId: '9',
            dateStr: '',
            notes: '',
            scrapMethod: '自社で廃棄',
            scrapCompany: '10',
            scheduledDate: '',
            cost: '',
            scrappedDate: '',
            scrapId: ''
        },

        openModal: function(item) {
            this.currentItem = item;
            var today = new Date();
            var dyStr = today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');
            
            this.state = {
                employeeId: localStorage.getItem('lastCheckinEmp') || '9',
                dateStr: dyStr,
                notes: '',
                scrapMethod: '自社で廃棄',
                scrapCompany: '10',
                scheduledDate: '',
                cost: '',
                scrappedDate: dyStr,
                scrapId: ''
            };

            this.uiScreen = 'MENU';
            this.step = 1;
            this.loadHistoryRecord();
            this.render();
            this.isOpen = true;
        },

        getEmployees: function() {
            if (global.DataManager && global.DataManager.data && global.DataManager.data.employees) return global.DataManager.data.employees;
            return [];
        },

        getCompanies: function() {
            if (global.DataManager && global.DataManager.data && global.DataManager.data.companies) return global.DataManager.data.companies;
            return [];
        },
        
        resolveEmployeeName: function(id) {
            var all = this.getEmployees();
            var found = all.find(c => String(c.EmployeeID) === String(id));
            if (found) return found.EmployeeName || id;
            return id;
        },

        getCompanyName: function(id) {
            var all = this.getCompanies();
            var found = all.find(c => String(c.CompanyID) === String(id));
            if (found) return found.CompanyShortName || found.CompanyName || found.CompanyID;
            return id;
        },

        loadHistoryRecord: function() {
            var isMold = Boolean(this.currentItem && this.currentItem.MoldID);
            var idToFind = isMold ? this.currentItem.MoldID : this.currentItem.CutterID;
            
            this.historyRecords = [];
            this.historyRecord = null;
            if(global.DataManager && global.DataManager.data && global.DataManager.data.scraplogs) {
                var records = global.DataManager.data.scraplogs.filter(function(x) {
                    if (isMold && x.MoldID == idToFind) return true;
                    if (!isMold && x.CutterID == idToFind) return true;
                    return false;
                });
                if (records.length > 0) {
                    records.sort(function(a,b) { 
                        return new Date(b.RequestedDate||0).getTime() - new Date(a.RequestedDate||0).getTime();
                    });
                    this.historyRecords = records;
                    this.historyRecord = records[0];
                    this.state.scrapId = this.historyRecord.ScrapLogID;
                    this.state.employeeId = this.historyRecord.EmployeeID || this.state.employeeId;
                    this.state.notes = this.historyRecord.Notes || '';
                    var exMeth = this.historyRecord.ScrapMethod || '';
                    if (exMeth === 'A' || exMeth.includes('自社')) this.state.scrapMethod = '自社で廃棄';
                    else if (exMeth === 'B' || exMeth.includes('外部')) this.state.scrapMethod = '外部業者へ委託';
                    else this.state.scrapMethod = exMeth || '自社で廃棄';
                    
                    this.state.scrapCompany = this.historyRecord.CompanyID || '10';
                    this.state.scheduledDate = this.historyRecord.ScheduledDate || '';
                    this.state.cost = this.historyRecord.Cost || '';
                    this.state.scrappedDate = this.historyRecord.ScrappedDate || this.state.scrappedDate;
                }
            }
        },

        close: function() {
            var bd = document.getElementById('sw-backdrop');
            if(bd) bd.parentNode.removeChild(bd);
            var dr = document.getElementById('sw-drawer');
            if(dr) dr.parentNode.removeChild(dr);
            this.isOpen = false;
            this.currentItem = null;
        },

        render: function() {
            var bd = document.getElementById('sw-backdrop');
            if(bd) bd.parentNode.removeChild(bd);
            bd = document.createElement('div');
            bd.id = 'sw-backdrop';
            bd.className = 'cio-backdrop';
            bd.style.zIndex = '600005';
            document.body.appendChild(bd);

            var dr = document.getElementById('sw-drawer');
            if(dr) dr.parentNode.removeChild(dr);
            dr = document.createElement('div');
            dr.id = 'sw-drawer';
            dr.className = 'cio-panel';
            dr.style.zIndex = '600006';
            document.body.appendChild(dr);

            var isMold = Boolean(this.currentItem && this.currentItem.MoldID);
            var code = isMold ? this.currentItem.MoldID : this.currentItem.CutterID;
            var name = isMold ? this.currentItem.DesID : this.currentItem.CodeName;
            
            var html = '';
            
            html += '<div class="cio-topbar" style="background:#ef4444; color:#fff; border-bottom:1px solid #b91c1c;">';
            html += '<div class="cio-top-title">';
            html += '<div class="ja" style="color:#fff;"><i class="fas fa-trash-alt"></i> 廃棄処理</div>';
            html += '<div class="vi" style="color:#fca5a5;">'+(isMold? 'Hủy bỏ khuôn' : 'Hủy bỏ dao')+'</div>';
            html += '</div>';
            html += '<div class="cio-top-actions"><button type="button" class="cio-top-btn" id="sw-close" style="color:#fff;"><i class="fas fa-times"></i></button></div>';
            html += '</div>';

            html += '<div class="cio-body" style="background:#f1f5f9;">';
            html += '<div class="cio-desktop">';

            // --- RIGHT COLUMN: ACTIONS & STATES ---
            html += '<div class="cio-col cio-col-controls">';
            html += '<div class="cio-card" style="padding:16px;">';
            html += '<div class="cio-hero" style="margin-bottom:16px;">';
            html += '<div class="cio-hero-code">' + escapeHtml(code) + '</div>';
            html += '<div class="cio-hero-name">' + escapeHtml(name) + '</div>';
            html += '</div>';

            html += '<div id="sw-step-content" style="min-height: 250px;">';
            html += this.renderScreenContent();
            html += '</div>';
            
            html += '</div>';
            html += '</div>';
            
            // --- LEFT COLUMN: PHOTO GALLERY & HISTORY ---
            html += '<div class="cio-col cio-col-history" style="flex:1;">';
            
            // Photo card
            html += '<div class="cio-card" style="padding:16px; margin-bottom:16px;">';
            html += '<div style="margin-bottom:8px; display:flex; align-items:center;">' + JV('廃棄証拠写真', 'Ảnh Minh Chứng Tái Chế') + '</div>';
            html += '<div id="sw-photo-gallery" style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:16px; min-height:180px; text-align:center;">';
            html += '  <p style="color:#b91c1c; font-size:13px; font-weight:bold; margin-bottom:4px;">ご注意：金型を金型室に準備してください</p>';
            html += '  <p style="color:#64748b; font-size:13px; margin-bottom:12px;">(* Chú ý: Hãy chuẩn bị sẵn khuôn đến phòng khuôn)</p>';
            html += '  <button id="sw-btn-uploadPhoto" class="cio-btn"><i class="fas fa-camera"></i> Mở Chọn Tệp & Chụp (Tự động liên kết mốc Mẫu)</button>';
            html += '</div>';
            html += '</div>';

            // History card (Reduced size)
            html += '<div class="cio-card" style="padding:16px; flex:1;">';
            html += '<div style="margin-bottom:8px; display:flex; align-items:center;">' + JV('廃棄処理の履歴', 'Lịch sử Yêu cầu Hủy') + '</div>';
            html += '<div id="sw-history-tbl" style="max-height:120px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:8px; background:#fff;">';
            if (this.historyRecords.length === 0) {
                 html += '<div style="padding:20px; text-align:center; color:#94a3b8; font-style:italic;">Chưa có bản ghi nào</div>';
            } else {
                 html += '<table style="width:100%; border-collapse:collapse; font-size:12px;">';
                 html += '<thead><tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0;">';
                 html += '<th style="padding:8px; text-align:left; color:#475569;">Trạng Thái</th>';
                 html += '<th style="padding:8px; text-align:left; color:#475569;">Ngày Báo</th>';
                 html += '<th style="padding:8px; text-align:left; color:#475569;">Ngày Hủy Thật</th>';
                 html += '<th style="padding:8px; text-align:left; color:#475569;">Nhân viên</th>';
                 html += '</tr></thead><tbody>';
                 for(var h=0; h<this.historyRecords.length; h++) {
                     var hr = this.historyRecords[h];
                     var st = hr.Status === 'DISPOSED' ? '<span style="color:#16a34a; font-weight:bold;"><i class="fas fa-check"></i> Đã Hủy</span>' : '<span style="color:#d97706; font-weight:bold;"><i class="fas fa-clock"></i> Kế hoạch</span>';
                     var eName = this.resolveEmployeeName(hr.EmployeeID);
                     html += '<tr style="border-bottom:1px solid #f1f5f9;">';
                     html += '<td style="padding:8px;">'+st+'</td>';
                     html += '<td style="padding:8px; color:#64748b;">'+escapeHtml(hr.RequestedDate)+'</td>';
                     html += '<td style="padding:8px; font-weight:bold;">'+escapeHtml(hr.ScrappedDate)+'</td>';
                     html += '<td style="padding:8px; max-width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">'+escapeHtml(eName)+'</td>';
                     html += '</tr>';
                 }
                 html += '</tbody></table>';
            }
            html += '</div>';
            html += '</div>';

            html += '</div>'; // close history col
            html += '</div>'; // desktop
            html += '</div>'; // body

            dr.innerHTML = html;
            
            var self = this;
            document.getElementById('sw-close').addEventListener('click', function() { self.close(); });
            
            var btnUpload = document.getElementById('sw-btn-uploadPhoto');
            if (btnUpload) btnUpload.addEventListener('click', function() { 
                if (global.PhotoUpload && typeof global.PhotoUpload.open === 'function') {
                    // Fix: Set correct object parameters for PhotoUpload Module
                    global.PhotoUpload.open({
                        mode: 'device',
                        deviceId: isMold ? self.currentItem.MoldID : self.currentItem.CutterID,
                        deviceType: isMold ? 'mold' : 'cutter',
                        deviceCode: code,
                        deviceDims: ''
                    });
                } else {
                    alert('Module tải ảnh chưa được khởi tạo!');
                }
            });

            this.bindScreenEvents();
        },
        
        renderGridEmployees: function() {
            var emps = this.getEmployees();
            var curr = String(this.state.employeeId);
            var cName = this.resolveEmployeeName(curr);

            var html = '';
            // Giao diện ô Input kèm Auto Suggestion
            html += '<div style="margin-bottom:8px; position:relative;">';
            html += '<input id="sw-emp-input" class="cio-control" type="text" placeholder="Gõ tên nhân viên để tìm..." value="'+escapeHtml(cName)+'" autocomplete="off" style="font-weight:bold; color:#0f172a;" />';
            html += '<div id="sw-emp-sugg" style="position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #cbd5e1; border-top:none; border-radius:0 0 8px 8px; max-height:160px; overflow-y:auto; display:none; z-index:10; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);"></div>';
            html += '</div>';

            // Giao diện Grid nút gõ nhanh
            var h = '<div class="sw-grid-emp" id="sw-emp-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(110px, 1fr)); gap:6px; margin-bottom:12px;">';
            for(var i=0; i<Math.min(emps.length, 12); i++) {
                var sel = (String(emps[i].EmployeeID) === curr) ? 'border:2px solid #3b82f6; background:#eff6ff;' : 'border:1px solid #cbd5e1; background:#fff;';
                var color = (String(emps[i].EmployeeID) === curr) ? '#1d4ed8' : '#334155';
                h += '<button type="button" class="sw-epick" data-id="'+escapeHtml(emps[i].EmployeeID)+'" data-name="'+escapeHtml(emps[i].EmployeeName)+'" style="'+sel+' cursor:pointer; border-radius:6px; padding:10px 4px;text-align:center; font-weight:bold; font-size:12px; color:'+color+'; box-shadow:0 1px 2px rgba(0,0,0,0.05);">';
                h += escapeHtml(emps[i].EmployeeName);
                if (String(emps[i].EmployeeID) === curr) h+= '<i class="fas fa-check-circle" style="display:block; margin-top:4px; font-size:14px;"></i>';
                h += '</button>';
            }
            h += '</div>';
            
            return html + h;
        },

        renderGridCompanies: function() {
            var curr = String(this.state.scrapCompany);
            var cName = this.getCompanyName(curr);

            var html = '';
            // Giao diện ô Input kèm Auto Suggestion
            html += '<div style="margin-bottom:8px; position:relative;">';
            html += '<input id="sw-dest-input" class="cio-control" type="text" placeholder="Tìm tên đối tác / nhập tay..." value="'+escapeHtml(cName)+'" autocomplete="off" style="font-weight:bold; color:#0f172a;" />';
            html += '<div id="sw-dest-sugg" style="position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid #cbd5e1; border-top:none; border-radius:0 0 8px 8px; max-height:160px; overflow-y:auto; display:none; z-index:10; box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);"></div>';
            html += '</div>';

            // Giao diện Grid
            var allComps = this.getCompanies();
            var pickList = allComps.filter(function(c) { return "10,2502".indexOf(c.CompanyID) !== -1; });
            // Add a few custom top hits if needed manually
            if (pickList.length === 0 && allComps.length > 0) pickList = allComps.slice(0, 3);

            var h = '<div class="sw-grid-dest" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:6px; margin-bottom:12px;">';
            for(var i=0; i<pickList.length; i++) {
                var sel = (String(pickList[i].CompanyID) === curr) ? 'border:2px solid #3b82f6; background:#eff6ff;' : 'border:1px solid #cbd5e1; background:#fff;';
                var color = (String(pickList[i].CompanyID) === curr) ? '#1d4ed8' : '#334155';
                h += '<button type="button" class="sw-dpick" data-id="'+escapeHtml(pickList[i].CompanyID)+'" data-name="'+escapeHtml(pickList[i].CompanyShortName || pickList[i].CompanyName)+'" style="'+sel+' cursor:pointer; border-radius:6px; padding:10px 4px;text-align:center; font-weight:bold; font-size:12px; color:'+color+'; box-shadow:0 1px 2px rgba(0,0,0,0.05);">';
                h += escapeHtml(pickList[i].CompanyShortName || pickList[i].CompanyName);
                if (String(pickList[i].CompanyID) === curr) h+= '<i class="fas fa-check-circle" style="display:block; margin-top:4px; font-size:14px;"></i>';
                h += '</button>';
            }
            h += '</div>';
            return html + h;
        },
        
        renderGridMethods: function() {
            var curr = String(this.state.scrapMethod);
            var mMeths = [
                { id: '自社で廃棄', jp: '自社で廃棄', vi: 'Tự xử lý nội bộ' },
                { id: '外部業者へ委託', jp: '外部業者へ委託', vi: 'Thuê nhà thầu ngoài' }
            ];
            var h = '<div class="sw-grid-meth" style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px;">';
            for(var i=0; i<mMeths.length; i++) {
                var sel = (mMeths[i].id === curr) ? 'border:2px solid #3b82f6; background:#eff6ff;' : 'border:1px solid #cbd5e1; background:#fff;';
                var color = (mMeths[i].id === curr) ? '#2563eb' : '#475569';
                h += '<button type="button" class="sw-mpick" data-id="'+escapeHtml(mMeths[i].id)+'" style="'+sel+' cursor:pointer; border-radius:6px; padding:10px;text-align:center; box-shadow:0 1px 2px rgba(0,0,0,0.05);">';
                h += '<div style="font-weight:bold; font-size:14px; color:'+color+';">'+escapeHtml(mMeths[i].jp)+'</div>';
                h += '<div style="font-size:11px; font-weight:600; opacity:0.8; margin-top:4px; color:'+color+';">'+escapeHtml(mMeths[i].vi)+'</div>';
                if (mMeths[i].id === curr) h+= '<i class="fas fa-check-circle" style="display:block; margin-top:4px; color:'+color+'; font-size:16px;"></i>';
                h += '</button>';
            }
            h += '</div>';
            return h;
        },

        renderScreenContent: function() {
            var html = '';
            var isMold = Boolean(this.currentItem && this.currentItem.MoldID);
            
            // Derive Database Status Status
            var currStatus = '';
            if (isMold && this.currentItem.MoldDisposing) currStatus = this.currentItem.MoldDisposing; 
            else if (!isMold && this.currentItem.UsageStatus) currStatus = this.currentItem.UsageStatus === 'DISPOSED' ? '廃棄済' : '';

            var primaryBtnStyle = 'display:flex; flex-direction:column; align-items:center; justify-content:center; background:#3b82f6; color:#fff; border:none; padding:12px 20px; border-radius:8px; font-weight:bold; cursor:pointer; width:100%; transition:all 0.2s; border-bottom:4px solid #2563eb; line-height:1.4;';
            var dangerBtnStyle = 'display:flex; flex-direction:column; align-items:center; justify-content:center; background:#ef4444; color:#fff; border:none; padding:12px 20px; border-radius:8px; font-weight:bold; cursor:pointer; width:100%; transition:all 0.2s; border-bottom:4px solid #dc2626; line-height:1.4;';
            var secondaryBtnStyle = 'display:flex; align-items:center; justify-content:center; background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; padding:10px 16px; border-radius:8px; font-weight:bold; cursor:pointer; width:100%; box-shadow:0 1px 2px rgba(0,0,0,0.05);';

            if (this.uiScreen === 'MENU') {
                html += '<div style="margin-bottom:20px; font-weight:bold; color:#1e293b; font-size:16px;">' + JV('<i class="fas fa-sitemap"></i> 実行メニュー', 'Bảng Điều Khiển Tác Vụ Scrap') + '</div>';

                if (currStatus === '廃棄済') {
                     html += '<div style="padding:16px; background:#dcfce7; border:1px solid #86efac; border-radius:8px; display:flex; align-items:center; gap:12px; margin-bottom:16px;">';
                     html += '<i class="fas fa-check-circle" style="color:#16a34a; font-size:24px;"></i>';
                     html += '<div>';
                     html += '<div style="font-weight:bold; color:#166534; font-size:14px; margin-bottom:2px;">廃棄済 / Đã Xử Lý Hủy</div>';
                     html += '<div style="font-size:12px; color:#15803d;">Mọi dữ liệu hủy bỏ đã ghi sâu vào hệ thống.</div>';
                     html += '</div></div>';

                     html += '<div style="display:flex; flex-direction:column; gap:12px;">';
                     html += '<button id="btn-scrpt-edit" style="'+secondaryBtnStyle+'">' + JV('<i class="fas fa-edit"></i> 廃棄情報の修正', 'Sửa lại thông tin hủy') + '</button>';
                     html += '</div>';
                }
                else if (currStatus === '廃棄予定') {
                     html += '<div style="padding:16px; background:#fef3c7; border:1px solid #fde68a; border-radius:8px; display:flex; align-items:center; gap:12px; margin-bottom:20px;">';
                     html += '<i class="fas fa-clock" style="color:#d97706; font-size:24px;"></i>';
                     html += '<div>';
                     html += '<div style="font-weight:bold; color:#92400e; font-size:14px; margin-bottom:2px;">廃棄予定 / Lịch Đang Mở</div>';
                     html += '<div style="font-size:12px; color:#b45309;">Khuôn này đang được nằm trong trạng thái Chờ Hủy.</div>';
                     html += '</div></div>';

                     html += '<div style="display:flex; flex-direction:column; gap:16px;">';
                     html += '<button id="btn-menu-scrap" style="'+dangerBtnStyle+'">' + JV('<i class="fas fa-hammer"></i> 廃棄処理を実行する', 'Thực Thi Hủy Ngay Theo Lịch Này') + '</button>';
                     html += '<button id="btn-menu-plan" style="'+secondaryBtnStyle+'">' + JV('<i class="fas fa-calendar-alt"></i> 予定内容の修正', 'Cập nhật lại lịch chờ bỏ') + '</button>';
                     html += '<button id="sw-btn-delete" style="display:flex; align-items:center; justify-content:center; gap:8px; background:#fff; color:#ef4444; border:none; text-decoration:underline; cursor:pointer; font-weight:600;"><i class="fas fa-times"></i> 予定を取り消す (Hủy bỏ kế hoạch Scrap)</button>';
                     html += '</div>';
                }
                else {
                     html += '<div style="margin-bottom:16px;">'+JV('金型の廃棄処理を開始します。希望のアクションを選択してください。', 'Bắt đầu quá trình loại bỏ thiết bị. Mục tiêu của bạn lúc này là gì?')+'</div>';
                     
                     html += '<div style="display:flex; flex-direction:column; gap:16px;">';
                     html += '<button id="btn-menu-plan" style="'+primaryBtnStyle+'">' + JV('<i class="fas fa-calendar-check"></i> 廃棄予定を組む', 'Tạo Kế Hoạch (Chờ xử lý sau)') + '</button>';
                     html += '<div style="text-align:center; color:#94a3b8; font-size:12px; font-weight:bold; position:relative;">';
                     html += '<hr style="position:absolute; width:100%; top:50%; margin:0; border:none; border-top:1px dashed #cbd5e1;"><span style="background:#f1f5f9; padding:0 8px; position:relative; z-index:2;">HOẶC (または)</span>';
                     html += '</div>';
                     html += '<button id="btn-menu-scrap" style="'+dangerBtnStyle+'">' + JV('<i class="fas fa-dumpster-fire"></i> 今すぐ廃棄処理する', 'Hủy Luôn Bây Giờ') + '</button>';
                     html += '</div>';
                }
            }
            else if (this.uiScreen === 'PLAN') {
                html += '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; color:#2563eb; border-bottom:2px solid #bfdbfe; padding-bottom:8px;">';
                html += '<div style="display:flex; align-items:center; gap:8px;">';
                if (this.step === 1) html += '<button id="btn-back" style="background:none; border:none; color:#3b82f6; font-size:18px; cursor:pointer; padding:0 4px;"><i class="fas fa-arrow-left"></i></button>';
                else html += '<button id="btn-step-back" style="background:none; border:none; color:#3b82f6; font-size:18px; cursor:pointer; padding:0 4px;"><i class="fas fa-arrow-left"></i></button>';
                html += '<div>' + JV('廃棄予定の設定', 'Form: Lên Lịch Kế Hoạch Hủy') + '</div>';
                html += '</div></div>';

                // Progress line
                html += '<div style="display:flex; gap:4px; margin-bottom:16px; justify-content:center;">';
                html += '<div style="flex:1; height:4px; border-radius:2px; background:'+(this.step >= 1 ? '#3b82f6' : '#e2e8f0')+';"></div>';
                html += '<div style="flex:1; height:4px; border-radius:2px; background:'+(this.step >= 2 ? '#3b82f6' : '#e2e8f0')+';"></div>';
                html += '</div>';

                if (this.step === 1) {
                    html += '<div style="margin-bottom:12px;">';
                    html += '<label style="font-size:14px; font-weight:800; color:#1e293b; display:block;">担当者 <span style="font-size:12px; font-weight:bold; color:#64748b;">(Bước 1. Chọn Người Mở Kế Hoạch)</span></label>';
                    html += '<div style="margin-top:8px;">' + this.renderGridEmployees() + '</div>';
                    html += '</div>';
                    html += '<div style="display:flex; justify-content:flex-end; margin-top:20px;">';
                    html += '<button id="btn-next-step" style="'+primaryBtnStyle+'"><div>次へ</div><div style="font-size:11px;font-weight:normal;">Tiếp theo <i class="fas fa-arrow-right"></i></div></button>';
                    html += '</div>';
                }
                else {
                    html += '<div style="margin-bottom:12px;">';
                    html += '<label style="font-size:12px; font-weight:bold; color:#64748b; margin-bottom:6px; display:block;">予定日 <span style="font-size:10px; font-weight:normal;">/ Ngày xử lý dự kiến</span></label>';
                    html += '<input id="sw-sched-date" type="date" class="cio-control" value="'+escapeHtml(this.state.scheduledDate || this.state.dateStr)+'" />';
                    html += '</div>';

                    html += '<div style="margin-bottom:12px;">';
                    html += '<label style="font-size:12px; font-weight:bold; color:#64748b; margin-bottom:6px; display:block;">廃棄方法 <span style="font-size:10px; font-weight:normal;">/ Phương pháp loại bỏ</span></label>';
                    html += this.renderGridMethods();
                    html += '</div>';

                    html += '<div style="margin-bottom:12px;">';
                    html += '<label style="font-size:12px; font-weight:bold; color:#64748b; margin-bottom:6px; display:block;">委託会社 <span style="font-size:10px; font-weight:normal;">/ Chọn Cty (thông thường ID 10)</span></label>';
                    html += this.renderGridCompanies();
                    html += '</div>';

                    html += '<div style="margin-bottom:16px;">';
                    html += '<label style="font-size:12px; font-weight:bold; color:#64748b; margin-bottom:6px; display:block;">メモ <span style="font-size:10px; font-weight:normal;">/ Ghi chú kế hoạch (Nếu có)</span></label>';
                    html += '<textarea id="sw-req-note" class="cio-control" rows="2" placeholder="...">'+escapeHtml(this.state.notes)+'</textarea>';
                    html += '</div>';

                    html += '<button id="btn-save-plan" style="'+primaryBtnStyle+'">' + JV('<i class="fas fa-save"></i> 予定を保存して閉じる', 'Lưu Kế Hoạch & Đóng') + '</button>';
                }
            }
            else if (this.uiScreen === 'SCRAP') {
                html += '<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; color:#dc2626; border-bottom:2px solid #fecaca; padding-bottom:8px;">';
                html += '<div style="display:flex; align-items:center; gap:8px;">';
                if (this.step === 1) html += '<button id="btn-back" style="background:none; border:none; color:#ef4444; font-size:18px; cursor:pointer; padding:0 4px;"><i class="fas fa-arrow-left"></i></button>';
                else html += '<button id="btn-step-back" style="background:none; border:none; color:#ef4444; font-size:18px; cursor:pointer; padding:0 4px;"><i class="fas fa-arrow-left"></i></button>';
                html += '<div>' + JV('廃棄処理の実行', 'Form: Chốt Bỏ Thiết Bị / Sửa Lịch Sử') + '</div>';
                html += '</div></div>';

                // Progress line
                html += '<div style="display:flex; gap:4px; margin-bottom:16px; justify-content:center;">';
                html += '<div style="flex:1; height:4px; border-radius:2px; background:'+(this.step >= 1 ? '#ef4444' : '#e2e8f0')+';"></div>';
                html += '<div style="flex:1; height:4px; border-radius:2px; background:'+(this.step >= 2 ? '#ef4444' : '#e2e8f0')+';"></div>';
                html += '</div>';

                if (this.step === 1) {
                    html += '<div style="margin-bottom:12px;">';
                    html += '<label style="font-size:14px; font-weight:800; color:#1e293b; display:block;">完了担当者 <span style="font-size:12px; font-weight:bold; color:#64748b;">(Bước 1. Chọn Người Thực Hiện / Check ID 1)</span></label>';
                    html += '<div style="margin-top:8px;">' + this.renderGridEmployees() + '</div>';
                    html += '</div>';
                    html += '<div style="display:flex; justify-content:flex-end; margin-top:20px;">';
                    html += '<button id="btn-next-step" style="'+dangerBtnStyle+'"><div>次へ</div><div style="font-size:11px;font-weight:normal;">Tiếp theo <i class="fas fa-arrow-right"></i></div></button>';
                    html += '</div>';
                }
                else {
                    html += '<div style="margin-bottom:12px;">';
                    html += '<label style="font-size:12px; font-weight:bold; color:#64748b; margin-bottom:6px; display:block;">廃棄日 <span style="font-size:10px; font-weight:normal;">/ Ngày hoàn tất thanh lý thực tế</span></label>';
                    html += '<input id="sw-scrapped-date" type="date" class="cio-control" value="'+escapeHtml(this.state.scrappedDate || this.state.dateStr)+'" />';
                    html += '</div>';
                    
                    html += '<div style="margin-bottom:12px;">';
                    html += '<label style="font-size:12px; font-weight:bold; color:#64748b; margin-bottom:6px; display:block;">廃棄方法 <span style="font-size:10px; font-weight:normal;">/ Cách Thức Scrap</span></label>';
                    html += this.renderGridMethods();
                    html += '</div>';

                    html += '<div style="margin-bottom:12px;">';
                    html += '<label style="font-size:12px; font-weight:bold; color:#64748b; margin-bottom:6px; display:block;">委託会社 <span style="font-size:10px; font-weight:normal;">/ Đối tác thanh lý</span></label>';
                    html += this.renderGridCompanies();
                    html += '</div>';

                    html += '<div style="margin-bottom:12px;">';
                    html += '<label style="font-size:12px; font-weight:bold; color:#64748b; margin-bottom:6px; display:block;">費用 <span style="font-size:10px; font-weight:normal;">/ Chi phí (JPY) hoặc Số tiền thu hồi (Truyền số âm)</span></label>';
                    html += '<input id="sw-cost" type="number" class="cio-control" placeholder="0" value="'+escapeHtml(this.state.cost)+'" />';
                    html += '</div>';

                    html += '<div style="margin-bottom:16px;">';
                    html += '<label style="font-size:12px; font-weight:bold; color:#64748b; margin-bottom:6px; display:block;">メモ <span style="font-size:10px; font-weight:normal;">/ Ghi chú (Nếu có)</span></label>';
                    html += '<textarea id="sw-req-note" class="cio-control" rows="2" placeholder="...">'+escapeHtml(this.state.notes)+'</textarea>';
                    html += '</div>';

                    var txtBtnScrap = '廃棄済として記録';
                    var txtBtnScrapVi = 'Ghi nhận Thực Tế Bị Hủy';
                    if (currStatus === '廃棄済') { txtBtnScrap = '情報を更新する'; txtBtnScrapVi = 'Cập nhật Lịch Sử / Ghi Đè'; }

                    html += '<button id="btn-save-scrap" style="'+dangerBtnStyle+'">' + JV('<i class="fas fa-dumpster"></i> '+txtBtnScrap, txtBtnScrapVi) + '</button>';
                }
            }

            return html;
        },

        uiSyncValues: function() {
            var elDate = document.getElementById('sw-sched-date');
            if (elDate) this.state.scheduledDate = elDate.value;
            
            var eScDate = document.getElementById('sw-scrapped-date');
            if (eScDate) this.state.scrappedDate = eScDate.value;

            var eCost = document.getElementById('sw-cost');
            if (eCost) this.state.cost = eCost.value;

            var eNote = document.getElementById('sw-req-note');
            if (eNote) this.state.notes = eNote.value;
        },

        bindScreenEvents: function() {
            var self = this;
            var c = document.getElementById('sw-step-content');
            if(!c) return;

            // MENU SCREEN EVENTS
            if (this.uiScreen === 'MENU') {
                var bp = document.getElementById('btn-menu-plan');
                if (bp) bp.addEventListener('click', function() { self.uiScreen = 'PLAN'; self.step = 1; self.updateUI(); });

                var bs = document.getElementById('btn-menu-scrap');
                if (bs) bs.addEventListener('click', function() { self.uiScreen = 'SCRAP'; self.step = 1; self.updateUI(); });
                
                var be = document.getElementById('btn-scrpt-edit');
                if (be) be.addEventListener('click', function() { self.uiScreen = 'SCRAP'; self.step = 1; self.updateUI(); });

                var bd = document.getElementById('sw-btn-delete');
                if (bd) bd.addEventListener('click', function() {
                    if(!confirm('あなたは本当に削除を取り消して、アイテムを再開したいですか？\n(Bạn có chắc chắn muốn HỦY BỎ/THU HỒI trạng thái Scrap hiện tại và đưa thiết bị về bình thường?)')) return;
                    
                    var oldText = bd.innerHTML;
                    bd.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
                    bd.disabled = true;

                    self.submitState('DELETED', function(res) {
                        if (window.notify) window.notify.success('Hệ thống đã Reverse trạng thái thành công!');
                        self.triggerPostSave(res, true);
                    }, true);
                });
            }
            else {
                var bk = document.getElementById('btn-back');
                if (bk) bk.addEventListener('click', function() { self.uiScreen = 'MENU'; self.updateUI(); });

                var btnStepBack = document.getElementById('btn-step-back');
                if (btnStepBack) btnStepBack.addEventListener('click', function() { self.step = 1; self.updateUI(); });
                
                var btnNextStep = document.getElementById('btn-next-step');
                if (btnNextStep) btnNextStep.addEventListener('click', function() { 
                    self.uiSyncValues();
                    if (!self.state.employeeId) { alert('Vui lòng chọn nhân viên trước khi tiếp tục!'); return; }
                    self.step = 2; 
                    self.updateUI(); 
                });
            }

            // GRID BINDINGS (Step 1 or 2)
            var eg = document.querySelectorAll('.sw-epick');
            eg.forEach(function(el) {
                el.addEventListener('click', function() {
                    self.state.employeeId = this.getAttribute('data-id');
                    localStorage.setItem('lastCheckinEmp', self.state.employeeId);
                    self.updateUI();
                });
            });
            var mg = document.querySelectorAll('.sw-mpick');
            mg.forEach(function(el) {
                el.addEventListener('click', function() {
                    self.state.scrapMethod = this.getAttribute('data-id');
                    self.updateUI();
                });
            });
            var dg = document.querySelectorAll('.sw-dpick');
            dg.forEach(function(el) {
                el.addEventListener('click', function() {
                    self.state.scrapCompany = this.getAttribute('data-id');
                    self.updateUI();
                });
            });

            // COMBOBOX BINDINGS (Step 1 or 2)
            this.bindAutocomplete('sw-emp-input', 'sw-emp-sugg', this.getEmployees(), 'EmployeeID', 'EmployeeName', 'employeeId');
            this.bindAutocomplete('sw-dest-input', 'sw-dest-sugg', this.getCompanies(), 'CompanyID', 'CompanyShortName', 'scrapCompany');

            // SAVE BINDINGS (Step 2)
            var btnPlan = document.getElementById('btn-save-plan');
            if (btnPlan) btnPlan.addEventListener('click', function() {
                self.uiSyncValues();
                btnPlan.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang Đẩy Lên CSDL...';
                btnPlan.disabled = true;
                self.submitState('SCHEDULED', function(res) {
                    if (window.notify) window.notify.success('Đã lưu Kế Hoạch (廃棄予定)!');
                    self.triggerPostSave(res, false, '廃棄予定');
                });
            });

            var btnScrap = document.getElementById('btn-save-scrap');
            if (btnScrap) btnScrap.addEventListener('click', function() {
                self.uiSyncValues();
                btnScrap.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Locking into GitHub...';
                btnScrap.disabled = true;
                self.submitState('DISPOSED', function(res) {
                    if (window.notify) window.notify.success('Lệnh 廃棄済 đã chốt thành công vào Database!');
                    self.triggerPostSave(res, false, '廃棄済');
                });
            });
        },

        bindAutocomplete: function(inputId, suggId, sourceData, keyField, labelField, stateField) {
            var self = this;
            var inp = document.getElementById(inputId);
            var sugg = document.getElementById(suggId);
            if (!inp || !sugg) return;

            inp.addEventListener('input', function() {
                var str = (inp.value || '').trim();
                
                if (!str) { sugg.style.display = 'none'; return; }
                var sLow = str.toLowerCase();
                var matched = sourceData.filter(function(x) {
                    var val = String(x[keyField] || '').toLowerCase();
                    var lbl = String(x[labelField] || '').toLowerCase();
                    var jp = String(x.CompanyName||'').toLowerCase(); // For companies
                    return val.includes(sLow) || lbl.includes(sLow) || jp.includes(sLow);
                });
                if(matched.length === 0) { sugg.style.display = 'none'; return; }

                var h = '';
                for(var m=0; m<Math.min(matched.length, 10); m++) {
                    var rawV = matched[m][keyField];
                    var rawL = matched[m][labelField] || rawV;
                    h += '<div class="sugg-row" data-val="'+escapeHtml(rawV)+'" data-lbl="'+escapeHtml(rawL)+'" style="padding:12px; border-bottom:1px solid #f1f5f9; cursor:pointer; font-weight:bold; font-size:14px; color:#1e293b;">'+escapeHtml(rawL)+' <span style="color:#94a3b8;font-size:11px;font-weight:normal;">('+escapeHtml(rawV)+')</span></div>';
                }
                sugg.innerHTML = h;
                sugg.style.display = 'block';

                sugg.querySelectorAll('.sugg-row').forEach(function(row) {
                    row.addEventListener('click', function() {
                        var pickVal = this.getAttribute('data-val');
                        var pickLbl = this.getAttribute('data-lbl');
                        self.state[stateField] = pickVal;
                        if(stateField === 'employeeId') localStorage.setItem('lastCheckinEmp', pickVal);
                        inp.value = pickLbl;
                        sugg.style.display = 'none';
                        self.updateUI();
                    });
                });
            });

            inp.addEventListener('blur', function() { 
                setTimeout(function() { 
                    if(sugg) sugg.style.display = 'none';
                    if (stateField === 'scrapCompany' && inp.value.trim() !== '') {
                        self.state[stateField] = inp.value.trim();
                    }
                }, 200); 
            });
            inp.addEventListener('focus', function() { if (inp.value.trim() && sugg.innerHTML) sugg.style.display = 'block'; });
        },

        updateUI: function() {
            var c = document.getElementById('sw-step-content');
            if(c) {
                // Must resync text inputs locally so they don't erase on sub-step refreshes
                this.uiSyncValues();
                var cName = document.getElementById('sw-dest-input') ? document.getElementById('sw-dest-input').value : null;
                var eName = document.getElementById('sw-emp-input') ? document.getElementById('sw-emp-input').value : null;

                c.innerHTML = this.renderScreenContent();
                
                if(cName && document.getElementById('sw-dest-input')) document.getElementById('sw-dest-input').value = cName;
                if(eName && document.getElementById('sw-emp-input')) document.getElementById('sw-emp-input').value = eName;

                this.bindScreenEvents();
            }
        },

        triggerPostSave: function(res, isDeleted, txtDisposing) {
            var self = this;
            try {
                if (self.currentItem) {
                    if (isDeleted) {
                        if(self.currentItem.MoldID) { self.currentItem.MoldDisposing = ''; self.currentItem.MoldUsageStatus = ''; self.currentItem.MoldDisposedDate = ''; }
                        if(self.currentItem.CutterID) { self.currentItem.UsageStatus = ''; }
                    } else {
                        var pStatus = self.state.Status || 'SCHEDULED';
                        if(self.currentItem.MoldID) {
                             if (pStatus === 'DISPOSED') {
                                 self.currentItem.MoldDisposing = '廃棄済';
                                 self.currentItem.MoldUsageStatus = 'DISPOSED';
                                 self.currentItem.MoldDisposedDate = self.state.scrappedDate;
                             } else {
                                 self.currentItem.MoldDisposing = '廃棄予定';
                             }
                        }
                        if(self.currentItem.CutterID && pStatus === 'DISPOSED') {
                             self.currentItem.UsageStatus = 'DISPOSED';
                        }
                    }
                    if(global.DetailPanel) global.DetailPanel.fillDataRaw(self.currentItem);
                }
            } catch(e){}

            if(global.DataManager && typeof global.DataManager.loadAllData === 'function') {
                global.DataManager.loadAllData().then(function(){
                    if(global.DetailPanel && typeof global.DetailPanel.refreshCurrentTab === 'function') global.DetailPanel.refreshCurrentTab();
                });
            }

            this.close();
        },

        submitState: function(newStatus, callback, isDelete) {
            this.state.Status = newStatus;
            
            var payload = {
                ScrapLogID: this.state.scrapId || ('SCRAP_'+Date.now().toString().slice(-6)),
                Status: newStatus,
                action: isDelete ? 'delete' : 'upsert',
                RequestedDate: this.state.dateStr,
                ScrapMethod: this.state.scrapMethod,
                CompanyID: this.state.scrapCompany,
                ScheduledDate: this.state.scheduledDate,
                Cost: this.state.cost,
                ScrappedDate: this.state.scrappedDate,
                EmployeeID: this.state.employeeId,
                Notes: this.state.notes
            };
            
            var isMold = Boolean(this.currentItem && this.currentItem.MoldID);
            if (isMold) payload.MoldID = this.currentItem.MoldID;
            else payload.CutterID = this.currentItem.CutterID;

            this.state.scrapId = payload.ScrapLogID;

            fetch(API_SCRAP, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) })
            .then(res => res.json())
            .then(res => {
                if (!res.success) {
                    alert('Lỗi Server: ' + res.message);
                    this.restoreButtons();
                    return;
                }
                
                try {
                    if(global.DataManager && global.DataManager.data && global.DataManager.data.scraplogs) {
                        var ex = global.DataManager.data.scraplogs.findIndex(r => String(r.ScrapLogID||'').trim() === String(payload.ScrapLogID||'').trim());
                        if (isDelete) {
                            if (ex >= 0) global.DataManager.data.scraplogs.splice(ex, 1);
                        } else {
                            if (ex >= 0) global.DataManager.data.scraplogs[ex] = Object.assign({}, global.DataManager.data.scraplogs[ex], payload);
                            else global.DataManager.data.scraplogs.unshift(payload);
                        }
                    }
                } catch(e){}
                
                if(callback) callback(res);
            }).catch(e => {
                alert('Connection API Error: ' + e.message + '\n\nPlease ensure you run git push to deploy node api first.');
                this.restoreButtons();
            });
        },
        
        restoreButtons: function() {
            var bd = document.getElementById('sw-btn-delete'); if(bd) { bd.innerHTML = '再試行 (Thử lại)'; bd.disabled = false; }
            var bs = document.getElementById('btn-save-scrap'); if(bs) { bs.innerHTML = '再試行 (Thử lại)'; bs.disabled = false; }
            var bp = document.getElementById('btn-save-plan'); if(bp) { bp.innerHTML = '再試行 (Thử lại)'; bp.disabled = false; }
        }
    };

    global.ScrapWizardModule = ScrapWizardModule;

})(typeof window !== 'undefined' ? window : this);

// v10.0.0
/**
 * Tray Manager V2 (Premium High-Density 3-Column Architecture)
 * Module quản lý Thông tin Khay (Kinh doanh & Sản xuất) tích hợp với Kiến trúc View-Switcher
 */

(function (global) {
    'use strict';

    var TrayManager = function () {
        this.containerId = 'trayManagerRoot';
        this.trays = [];
        this.filteredTrays = [];
        this.selectedTrayId = null;
        this.activeTab = 'overview';
        this.searchQuery = '';
        this.sortBy = 'id_asc';
        this.debounceTimer = null;

        // Định nghĩa 8 tab chuẩn
        this.tabs = [
            { id: 'overview', name: 'Tổng quan', nameJp: '概要', icon: 'fas fa-info-circle' },
            { id: 'business', name: 'Kinh doanh', nameJp: '営業情報', icon: 'fas fa-briefcase' },
            { id: 'technical', name: 'Kỹ thuật', nameJp: '技術情報', icon: 'fas fa-cogs' },
            { id: 'dimensions', name: 'Mẫu & Kích thước', nameJp: '重量・サンプル', icon: 'fas fa-ruler-combined' },
            { id: 'storage', name: 'Lưu trữ', nameJp: '保管', icon: 'fas fa-warehouse' },
            { id: 'photos', name: 'Hình ảnh', nameJp: '写真', icon: 'fas fa-images' },
            { id: 'related', name: 'Liên kết', nameJp: '関連リンク', icon: 'fas fa-link' },
            { id: 'history', name: 'Lịch sử', nameJp: '履歴', icon: 'fas fa-history' },
            { id: 'extended', name: 'Mở rộng', nameJp: '詳細編集', icon: 'fas fa-edit' }
        ];

        this.init();
    };

    TrayManager.prototype.init = function () {
        var self = this;
        document.addEventListener('data-manager:ready', function () {
            self.loadData();
            self.render();
        });

        document.addEventListener('mcsViewChanged', function (e) {
            if (e.detail && e.detail.view === 'tray') {
                self.loadData();
                self.render();
            }
        });

        document.addEventListener('device-photos-updated', function (e) {
            if (e.detail && e.detail.deviceType === 'tray') {
                self.render();
            } else if (!e.detail) {
                self.render();
            }
        });
        document.addEventListener('device-photos:thumbnail-updated', function () {
            self.render();
        });

        var globalSearch = document.getElementById('searchInput');
        if (globalSearch) {
            globalSearch.addEventListener('input', function (e) {
                if (window.ViewManager && window.ViewManager.currentView === 'tray') {
                    self.searchQuery = e.target.value;
                    if (self.debounceTimer) clearTimeout(self.debounceTimer);
                    self.debounceTimer = setTimeout(function () {
                        self.applyFilter();
                        self.render(); // This is safe now because global search input doesn't lose focus
                    }, 300);
                }
            });
        }
    };

    TrayManager.prototype.loadData = function () {
        if (global.DataManager && typeof global.DataManager.getAllTrays === 'function') {
            this.trays = global.DataManager.getAllTrays();
        } else if (global.ALL_DATA && global.ALL_DATA.trays) {
            this.trays = global.ALL_DATA.trays.slice();
        } else {
            this.trays = [];
        }
        this.applyFilter();
    };

    TrayManager.prototype.applyFilter = function () {
        var q = this.searchQuery.toLowerCase();
        this.filteredTrays = this.trays.filter(function (t) {
            if (!q) return true;
            var searchStr = ((t.TrayID || '') + ' ' + (t.TrayCode || '') + ' ' + (t.MoldTrayName || t.TrayName || '') + ' ' + (t.CustomerID || '')).toLowerCase();
            return searchStr.indexOf(q) !== -1;
        });

        this.filteredTrays.sort(function (a, b) {
            var aid = String(a.TrayID || '').toLowerCase();
            var bid = String(b.TrayID || '').toLowerCase();
            var aname = String(a.MoldTrayName || a.TrayName || '').toLowerCase();
            var bname = String(b.MoldTrayName || b.TrayName || '').toLowerCase();

            if (this.sortBy === 'id_asc') return aid.localeCompare(bid);
            if (this.sortBy === 'id_desc') return bid.localeCompare(aid);
            if (this.sortBy === 'name_asc') return aname.localeCompare(bname);
            if (this.sortBy === 'name_desc') return bname.localeCompare(aname);
            return 0;
        }.bind(this));
    };

    // Derived references from global state
    TrayManager.prototype.getTrayContext = function (tray) {
        var mold = null, design = null, job = null;
        var moldsArray = (global.DataManager && global.DataManager.data && global.DataManager.data.molds) ||
            (global.ALL_DATA && global.ALL_DATA.molds) || [];
        mold = moldsArray.find(function (m) {
            return (m.TrayID && String(m.TrayID) === String(tray.TrayID)) ||
                (m.trayInfo && String(m.trayInfo.TrayID) === String(tray.TrayID));
        });
        if (mold && global.DetailPanel) {
            if (global.DetailPanel.getMoldDesignInfoSafe) design = global.DetailPanel.getMoldDesignInfoSafe(mold, 'mold');
            if (global.DetailPanel.getJobInfoSafe) job = global.DetailPanel.getJobInfoSafe(mold, 'mold');
        }
        return { mold: mold, design: design, job: job };
    };

    TrayManager.prototype.safeDisplay = function (val, suffix) {
        if (val === null || val === undefined || String(val).trim() === '') return '-';
        return suffix ? String(val) + suffix : String(val);
    };

    // Bi-lingual HTML text helper
    TrayManager.prototype.biLabel = function (vi, jp) {
        return '<div class="tm-bilabel"><div class="vi">' + vi + '</div><div class="jp">' + jp + '</div></div>';
    };

    TrayManager.prototype.render = function () {
        var root = document.getElementById(this.containerId);
        if (!root) return;

        var html = '<div class="tm-layout">';
        html += '<div class="tm-sidebar-backdrop" id="tmSidebarBackdrop"></div>';

        // COLUMN 1: SIDEBAR (Danh sách khay)
        html += '<div class="tm-sidebar" id="tmSidebarDrawer">';
        html += '  <div class="tm-sort-box" style="padding:16px 16px 12px 16px; border-bottom: 1px solid #e2e8f0; display:flex; gap:8px;">';
        html += '    <select id="tmSortSelect" style="flex:1; padding:6px; border:1px solid #cbd5e1; border-radius:6px; font-size:13px; outline:none;">';
        html += '      <option value="id_asc" ' + (this.sortBy === 'id_asc' ? 'selected' : '') + '>ID (昇順/Tăng)</option>';
        html += '      <option value="id_desc" ' + (this.sortBy === 'id_desc' ? 'selected' : '') + '>ID (降順/Giảm)</option>';
        html += '      <option value="name_asc" ' + (this.sortBy === 'name_asc' ? 'selected' : '') + '>名前 (A-Z/Tên)</option>';
        html += '    </select>';
        html += '  </div>';

        html += '  <div class="tm-list" id="tmList">';
        if (this.filteredTrays.length === 0) {
            html += '<div class="tm-empty">トレイが見つかりません。<br><span style="font-size:12px">Không tìm thấy khay nào.</span></div>';
        } else {
            var displayTrays = this.filteredTrays.slice(0, 100);
            this.renderedTrays = displayTrays;
            html += displayTrays.map(function (t) {
                var isActive = (this.selectedTrayId === String(t.TrayID)) ? 'active' : '';
                var tStatus = String(t.TrayStatus || '');
                var statusCls = 'tm-status-info';
                if (tStatus.indexOf('TỐT') > -1 || tStatus.indexOf('Sử dụng') > -1 || tStatus.indexOf('利用中') > -1 || tStatus.indexOf('Active') > -1) statusCls = 'tm-status-success';
                else if (tStatus.indexOf('Lỗi') > -1 || tStatus.indexOf('Error') > -1) statusCls = 'tm-status-danger';
                else if (tStatus.indexOf('Chờ') > -1 || tStatus.indexOf('Pending') > -1 || tStatus.indexOf('Chưa') > -1 || tStatus.indexOf('未定') > -1) statusCls = 'tm-status-warning';

                var thumbId = 'tmThumb_' + t.TrayID;
                var thumbHtml = '<img class="tm-item-thumb" id="' + thumbId + '" style="display:none;" /><div class="tm-item-thumb-placeholder"><i class="fas fa-box"></i></div>';

                return '<div class="tm-list-item ' + isActive + '" data-id="' + t.TrayID + '">' +
                    '  ' + thumbHtml +
                    '  <div class="tm-item-content">' +
                    '    <div class="tm-item-row1">' +
                    '       <div class="tm-item-id">#' + (t.TrayID || '?') + '</div>' +
                    '       <div class="tm-item-status ' + statusCls + '">' + (t.TrayStatus || '---') + '</div>' +
                    '    </div>' +
                    '    <div class="tm-item-name">' + (t.MoldTrayName || t.TrayName || '未設定 / Chưa thiết lập tên') + '</div>' +
                    '    <div class="tm-item-loc"><i class="fas fa-layer-group"></i> ' + (t.RackLayerID || 'Chưa vị trí') + '</div>' +
                    '  </div>' +
                    '</div>';
            }, this).join('');

            if (this.filteredTrays.length > 100) {
                html += '<div style="padding: 16px; text-align: center; color: var(--text-muted); font-size: 11px;">+ 他 ' + (this.filteredTrays.length - 100) + ' 件<br/>(Dùng tìm kiếm để lọc)</div>';
            }
        }
        html += '  </div>';
        html += '  <div class="tm-sidebar-footer"><button id="tmBtnCreate" class="tm-btn-primary"><i class="fas fa-plus" style="margin-right:6px"></i> 新規作成 / Tạo Khay Mới</button></div>';
        html += '</div>'; // end col 1


        html += '<div class="tm-main-wrapper tm-detail-view dp-preview-modal" style="flex:1; display:flex; flex-direction:column; min-width:0; background:var(--bg-main); overflow-y:auto; overflow-x:hidden; position:relative!important; z-index:auto!important; inset:auto!important; box-shadow:none!important; border:none!important; border-radius:0!important; transform:none!important; max-height:none!important;">';
        if (!this.selectedTrayId || this.selectedTrayId === 'NEW') {
            html += '<div class="detail-panel-body" style="display:flex; justify-content:center; align-items:center; height: 100%;"><div class="tm-empty-main" style="border:none; text-align:center;"><i class="fas fa-box-open" style="font-size: 64px; color: var(--ui-border); margin-bottom: 16px;"></i><h3 style="margin-bottom:8px; color: var(--text-primary);">トレイを選択してください</h3><p style="color:var(--text-muted); font-size:14px; margin-bottom:16px;">Bấm danh sách bên trái để xem chi tiết Khay</p><button id="tmBtnOpenDrawerEmpty" style="padding: 10px 24px; background: var(--ui-accent); color: #fff; font-weight: 600; border-radius: 6px; border: none; cursor: pointer; font-size: 14px; transition: all 0.2s;"><i class="fas fa-search" style="margin-right: 8px;"></i> Chọn khay / 選択</button></div></div>';
        } else {
            var selectedTray = this.trays.find(function (t) { return String(t.TrayID) === this.selectedTrayId; }.bind(this));
            if (!selectedTray) {
                html += '<div class="detail-panel-body tm-empty-main">エラー: IDが見つかりません / Lỗi: Không tìm thấy ID khay.</div>';
            } else {
                var ctx = this.getTrayContext(selectedTray);
                html += '    <div class="detail-panel-header" style="position:relative; z-index: 10;">';
                html += '      <div class="detail-panel-title">';
                html += '        <span class="item-type-badge" data-item-type="tray" style="background:#3b82f6;">トレイ</span>';
                html += '        <span class="item-code-text">' + this.safeDisplay(selectedTray.MoldTrayName || selectedTray.TrayName || ('Khay ' + selectedTray.TrayID)) + '</span>';
                html += '      </div>';
                html += '      <button id="tmBtnOpenDrawer" style="margin-left:auto; padding: 4px 12px; border: 1px solid rgba(255,255,255,0.25); background: rgba(255,255,255,0.12); color: #fff; font-size: 12px; font-weight: 600; border-radius: 6px; cursor: pointer; transition: all 0.2s;"><i class="fas fa-bars" style="margin-right: 6px;"></i> Danh sách</button>';
                html += '    </div>';
                html += '    <div class="detail-tabs">';
                this.tabs.forEach(function (tab) {
                    var act = (this.activeTab === tab.id) ? 'active' : '';
                    html += '<button class="detail-tab ' + act + '" data-tab="' + tab.id + '" type="button" title="' + tab.name + '">';
                    html += '  <i class="' + tab.icon + '"></i>';
                    html += '  <span class="tab-label-ja">' + tab.nameJp + '</span>';
                    html += '  <span class="tab-label-vi">' + tab.name + '</span>';
                    html += '</button>';
                }, this);
                html += '    </div>';
                html += '    <div class="detail-panel-body" style="padding:16px;">';
                html += '      <div class="dp-dash2-layout">';
                html += '        <div class="dp-dash2-masonry">';
                var locDisplay = selectedTray.RackLayerID || '未定 / Chưa có vị trí';
                html += '          <div class="dp-d2-col">';
                html += '             <div class="dp-d2-card pt-0" style="margin-bottom: 24px;">';
                html += '               <div class="dp-d2-card-body" style="padding-top: 12px;">';
                html += '                 <div style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">';
                html += '                   <div style="font-size:12px; font-weight:700; color:var(--text-primary);"><i class="fas fa-camera" style="color:var(--ui-accent); margin-right:6px;"></i>サンプル写真</div>';
                html += '                   <div class="tm-photo-toolbar" style="display:flex; gap:6px;">';
                html += '                     <button class="dp-action-btn" id="tmBtnManagePhotos" title="Mở quản lý ảnh" style="padding:4px 8px; min-height:0;"><i class="fas fa-images"></i></button>';
                html += '                     <button class="dp-action-btn" id="tmBtnUploadPhoto" title="Tải lên ảnh" style="padding:4px 8px; min-height:0;"><i class="fas fa-upload"></i></button>';
                html += '                     <button class="dp-action-btn" id="tmBtnRefreshPhoto" title="Làm mới" style="padding:4px 8px; min-height:0;"><i class="fas fa-sync-alt"></i></button>';
                html += '                   </div>';
                html += '                 </div>';
                html += '                 <img src="" id="tmRightPhotoImg" style="display:none; width:100%; object-fit:contain; border-radius:6px; cursor:pointer; max-height:220px; aspect-ratio:4/3; background:var(--bg-main); border:1px solid var(--border-color);"/>';
                html += '                 <div id="tmRightPhotoEmpty" onclick="document.getElementById(\'tmBtnUploadPhoto\').click()" class="tm-no-photo-box" style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:180px; background:var(--bg-main); border:2px dashed var(--border-color); border-radius:6px; color:var(--text-muted); cursor:pointer;"><i class="fas fa-image" style="font-size:24px; margin-bottom:8px;"></i><span style="font-size:11px; text-align:center;">写真なし<br>Chưa có ảnh (Bấm để tải ảnh)</span></div>';
                html += '               </div>';
                html += '             </div>';
                html += '             <div class="dp-d2-card dp-card-storage-mold">';
                html += '               <div class="dp-d2-card-head color-teal"><i class="fas fa-map-marker-alt"></i> 保管・ステータス (Lưu trữ)</div>';
                html += '               <div class="dp-d2-card-body">';
                html += '                 <div class="dp-storage-line" style="display:flex; justify-content:space-between; align-items:center; padding:8px 0; border-bottom:1px solid var(--border-color);">';
                html += '                   <div class="dp-storage-line-label" style="font-size:12px; color:var(--text-muted);">Vị trí</div>';
                html += '                   <div class="dp-storage-line-value"><strong>' + locDisplay + '</strong></div>';
                html += '                 </div>';
                html += '               </div>';
                html += '             </div>';
                html += '             <div class="dp-d2-card dp-d2-card-actions" style="margin-top:16px;">';
                html += '               <div class="dp-d2-card-head color-amber"><i class="fas fa-bolt"></i> 操作・リンク (Thao tác)</div>';
                html += '               <div class="dp-d2-card-body dp-d2-card-body--pad">';
                html += '                 <div class="dp-actions-grid">';
                html += '                   <button class="dp-action-btn" id="tmBtnQuickLocation" data-action="inout" type="button" title="入出庫・位置変更 / Vị trí">';
                html += '                     <i class="fas fa-map-marker-alt"></i>';
                html += '                     <div style="display:flex;flex-direction:column;align-items:center;line-height:1.2;">';
                html += '                       <span style="font-weight:700;font-size:11px;">入出庫</span>';
                html += '                       <span style="font-size:9px;color:#64748b;">Vị trí</span>';
                html += '                     </div>';
                html += '                   </button>';
                html += '                   <button class="dp-action-btn" id="tmActionBtnWeight" data-action="weight" type="button" title="重量 / Khối lượng">';
                html += '                     <i class="fas fa-weight"></i>';
                html += '                     <div style="display:flex;flex-direction:column;align-items:center;line-height:1.2;">';
                html += '                       <span style="font-weight:700;font-size:11px;">重量</span>';
                html += '                       <span style="font-size:9px;color:#64748b;">Khối lượng</span>';
                html += '                     </div>';
                html += '                   </button>';
                html += '                   <button class="dp-action-btn" id="tmActionBtnExtended" data-action="extended" type="button" title="詳細編集 / Mở rộng">';
                html += '                     <i class="fas fa-expand-arrows-alt"></i>';
                html += '                     <div style="display:flex;flex-direction:column;align-items:center;line-height:1.2;">';
                html += '                       <span style="font-weight:700;font-size:11px;">詳細</span>';
                html += '                       <span style="font-size:9px;color:#64748b;">Mở rộng</span>';
                html += '                     </div>';
                html += '                   </button>';
                html += '                 </div>';
                html += '               </div>';
                html += '             </div>';
                html += '          </div>';
                html += '          <div class="dp-d2-col dp-d2-col-main" style="flex: 2.5; min-width: 450px;">';
                html += this.renderTabContent(this.activeTab, selectedTray, ctx);
                html += '          </div>';
                html += '        </div>';
                html += '      </div>';
                html += '    </div>';
                html += '</div>';
            }
        }
        root.innerHTML = html;
        this.bindEvents();
    };

    // Form field renderer helper (Japanese Primary)
    TrayManager.prototype.renderInfoItem = function (labelVi, labelJp, val, full) {
        var rawValue = (val === null || val === undefined || val === '') ? '-' : val;
        var cls = full ? "info-item full-width" : "info-item";
        var valHtml = '<div class="info-value">' + rawValue + '</div>';
        if (typeof rawValue === 'string' && rawValue.indexOf('<div class="info-value') === 0) valHtml = rawValue;
        else if (typeof rawValue === 'string' && rawValue.indexOf('<div class="tm-readonly-val') === 0) valHtml = rawValue;
        else if (typeof rawValue === 'string' && rawValue.indexOf('<div class="') === 0) valHtml = rawValue;
        return '<div class="dp-item-stacked ' + cls + '">' +
            '  <div class="info-label">' +
            '    <span class="dp-label-ja">' + labelJp + '</span>' +
            '    <span class="dp-label-vi">' + labelVi + '</span>' +
            '  </div>' +
            valHtml +
            '</div>';
    };

    TrayManager.prototype.renderField = function (labelVi, labelJp, valHTML, isRef, icon) {
        return this.renderInfoItem(labelVi, labelJp, valHTML, false);
    };

    TrayManager.prototype.renderInput = function (id, val, width) {
        var v = this.safeDisplay(val, '');
        if (!v) return '<div class="info-value" style="color:var(--text-muted);font-style:italic;">--</div>';
        return '<div class="info-value">' + v + '</div>';
    };

    TrayManager.prototype.renderNumber = function (id, val, width) {
        var v = (val !== null && val !== undefined) ? Number(val) : '';
        if (v === '') return '<div class="info-value" style="color:var(--text-muted);font-style:italic;">--</div>';
        return '<div class="info-value">' + v + '</div>';
    };

    // RENDER 8 TABS EXACTLY AS MAPPED
    TrayManager.prototype.renderTabContent = function (tabId, tray, ctx) {
        var html = '<div class="tm-tab-pane active" id="tab_' + tabId + '">';
        var m = ctx.mold, d = ctx.design, j = ctx.job;
        var safe = this.safeDisplay.bind(this);
        var createSection = function (icon, jpTitle, viTitle, colorClass, cols) {
            var colClass = cols ? "cols-" + cols : "cols-4";
            return '<div class="dp-d2-card dp-d2-card-wide" style="margin-bottom:16px;">' +
                '<div class="dp-d2-card-head">' +
                '  <i class="' + icon + '"></i>' +
                '  <span>' + jpTitle + '</span>' +
                '  <span style="font-size:10px;font-weight:500;color:#94a3b8;margin-left:4px;">' + viTitle + '</span>' +
                '</div>' +
                '<div class="dp-d2-card-body">' +
                '<div class="dp-info-grid-modern ' + colClass + ' dp-kv-maininfo">';
        };
        var wrapGridEnd = '</div></div></div>';

        if (tabId === 'overview') {
            html += createSection('fas fa-info-circle', '基本情報', 'Thông tin cơ bản', 'hue-blue', 4);
            html += this.renderField('Mã nội bộ', 'システムID', this.renderInput('tm_TrayID', tray.TrayID, '160px'), false, 'fas fa-hashtag');
            html += this.renderField('Mã khay', 'トレイコード', this.renderInput('tm_TrayCode', tray.TrayCode), false, 'fas fa-barcode');
            html += this.renderField('Tên khay nội bộ', '社内トレイ名', this.renderInput('tm_TrayName', tray.TrayName || tray.MoldTrayName), false, 'fas fa-box');
            html += this.renderField('Khách hàng ID', '顧客ID', this.renderInput('tm_CustomerID', tray.CustomerID), false, 'fas fa-building');
            html += this.renderField('Mã KH (Ref)', '顧客コード', safe(m?.CustomerCode), true, 'fas fa-link');
            html += this.renderField('Tên KH (Ref)', '顧客名', safe(m?.CustomerName), true, 'fas fa-link');
            html += this.renderField('Trạng thái', 'ステータス', this.renderInput('tm_TrayStatus', tray.TrayStatus), false);
            html += this.renderField('Sức chứa khay', '収容数', this.renderNumber('tm_TrayCapacity', tray.TrayCapacity), false, 'fas fa-cubes');
            html += wrapGridEnd;
            html += createSection('fas fa-sticky-note', '備考', 'Ghi chú', 'hue-slate', 1);
            html += this.renderField('Ghi chú (Notes)', '一般備考', '<div class="info-value">' + safe(tray.Notes || tray.TrayNotes, '--') + '</div>', false, 'fas fa-sticky-note');
            html += wrapGridEnd;
        }
        else if (tabId === 'business') {
            html += createSection('fas fa-briefcase', '営業情報', 'Thông tin Kinh doanh', 'hue-emerald', 4);
            html += this.renderField('Tên KH gọi (K.Doanh)', '顧客側トレイ名', this.renderInput('tm_CustomerTrayName', tray.CustomerTrayName || d?.TrayName || d?.ProductName), false);
            html += this.renderField('Thông tin chỉ thị', '指示情報', this.renderInput('tm_TrayInfo', tray.TrayInfo || j?.TrayInfo || j?.InstructionTray), false);
            html += this.renderField('Số bản vẽ (Ref)', '図面番号', safe(tray.CustomerDrawingNo || d?.DrawingNo || m?.DrawingNo), true);
            html += this.renderField('Mã thiết bị (Ref)', '機械コード', safe(tray.DeviceCode || d?.MoldMachine || m?.MoldMachine), true);
            html += this.renderField('Vật liệu thực tế', '材質(実測)', this.renderInput('tm_Material', tray.Material || d?.PlasticType || j?.PlasticType), false);
            html += this.renderField('Đơn giá (Ref)', '単価', safe(tray.UnitPrice || d?.Price || m?.Price), true);
            html += this.renderField('Số BG / Quote (Ref)', '見積番号', safe(tray.Quote || d?.Quote || m?.Quote), true);
            html += this.renderField('Loại thùng (Ref)', '箱/梱包', safe(tray.BoxType || d?.BoxType || m?.BoxType), true);
            html += this.renderField('Bọc túi / Bag (Ref)', '袋', safe(tray.Bag || d?.Bagging || j?.Bagging), true);
            html += this.renderField('Hạn giao đầu (Ref)', '初回納期', safe(tray.FirstDeliveryDeadline || j?.DeliveryDeadline), true);
            html += wrapGridEnd;
        }
        else if (tabId === 'technical') {
            html += '<div class="tm-alert-info"><i class="fas fa-info-circle"></i> Đây là dữ liệu gốc lấy từ Module Thiết kế Khuôn liên kết (MoldDesign & Molds). Không chỉnh sửa trực tiếp ở đây để tránh đè dữ liệu thiết kế.</div>';
            html += createSection('fas fa-cogs', '設計情報', 'Thông tin Thiết kế', 'hue-amber', 4);
            html += this.renderField('Thiết kế ID', '設計ID', safe(d?.MoldDesignID), true);
            html += this.renderField('Mã TK (DesignCode)', '設計コード', safe(d?.MoldDesignCode || d?.DesignCode), true);
            html += this.renderField('Kích thước X', 'カットX', safe(d?.CutlineX), true);
            html += this.renderField('Kích thước Y', 'カットY', safe(d?.CutlineY), true);
            html += this.renderField('Chiều sâu (Depth)', '深さ', safe(d?.Depth || d?.MoldDesignDepth), true);
            html += this.renderField('Góc bo (R)', 'コーナーR', safe(d?.R || d?.CornerR), true);
            html += this.renderField('Góc vát (C)', '面取りC', safe(d?.C || d?.ChamferC), true);
            html += this.renderField('Số Pocket', 'ポケット数', safe(d?.Pockets || d?.PocketCount), true);
            html += this.renderField('Góc thoát khuôn', '抜き勾配', safe(d?.DraftAngle || d?.TaperAngle), true);
            html += this.renderField('Dung sai X', '公差X', safe(d?.ToleranceX), true);
            html += this.renderField('Dung sai Y', '公差Y', safe(d?.ToleranceY), true);
            html += this.renderField('Chữ khắc', '刻印', safe(d?.Engraving || d?.EngravingText || d?.TextContent), true);
            html += wrapGridEnd;
        }
        else if (tabId === 'dimensions') {
            html += createSection('fas fa-ruler-combined', '製品寸法', 'Kích thước Sản phẩm', 'hue-indigo', 4);
            html += this.renderField('Kích thước SP (Ref)', '製品寸法(設計)', safe(d?.CutlineX) + ' x ' + safe(d?.CutlineY) + ' x ' + safe(d?.Depth), true);
            html += this.renderField('Nhựa KH yêu cầu (Ref)', '顧客要求樹脂', safe(d?.PlasticType || j?.PlasticType), true);
            html += wrapGridEnd;
            html += '<div class="tm-divider">Thông tin thực tế Mẫu (Thực đo)</div>';
            html += createSection('fas fa-ruler', 'サンプル寸法', 'Kích thước Mẫu Thực tế', 'hue-blue', 4);
            html += this.renderField('Độ dài mẫu (mm)', 'サンプル長さ', this.renderNumber('tm_SampleLength', tray.TraySampleLength), false);
            html += this.renderField('Độ rộng mẫu (mm)', 'サンプル幅', this.renderNumber('tm_SampleWidth', tray.TraySampleWidth), false);
            html += this.renderField('Chiều cao mẫu (mm)', 'サンプル高さ', this.renderNumber('tm_SampleHeight', tray.TraySampleHeight), false);
            html += wrapGridEnd;
            html += createSection('fas fa-balance-scale', '重量情報', 'Thông tin Trong lượng', 'hue-cyan', 2);
            html += this.renderField('Khối lượng K.doanh (g)', '登録重量(設定)', this.renderNumber('tm_Weight', tray.Weight || tray.TrayWeight || d?.TrayWeight), false, 'fas fa-balance-scale');
            html += this.renderField('Khối lượng đo thực (g)', '実測測定重量', this.renderNumber('tm_SampleWeightReal', tray.SampleWeightReal || tray.TraySampleWeightMeasured), false, 'fas fa-weight');
            html += wrapGridEnd;
            html += createSection('fas fa-sticky-note', 'サンプル備考', 'Ghi chú Mẫu', 'hue-slate', 1);
            html += this.renderField('Ghi chú thuộc tính Mẫu', 'サンプル備考', '<div class="info-value">' + safe(tray.SampleNotes, '--') + '</div>', false);
            html += wrapGridEnd;
        }
        else if (tabId === 'storage') {
            html += '<div class="tm-alert-info"><i class="fas fa-info-circle"></i> Vị trí khay được lưu độc lập so với khuôn tại <strong>RackLayerID</strong>.</div>';
            html += createSection('fas fa-map-marker-alt', '保管情報', 'Thông tin Lưu trữ', 'hue-rose', 3);
            html += this.renderField('Vị trí Tầng (LayerID)', '保管レイヤー', this.renderInput('tm_RackLayerID', tray.RackLayerID), false, 'fas fa-bookmark');
            html += this.renderField('Ngày XN (LastConfirmed)', '最終確認日', safe(tray.LastConfirmedDate), true);
            html += this.renderField('C.Ty Lưu trữ (Ref)', '保管会社', safe(m?.StorageCompany), true);
            html += wrapGridEnd;
            html += createSection('fas fa-sticky-note', '場所備考', 'Ghi chú vị trí', 'hue-slate', 1);
            html += this.renderField('Ghi chú Vị trí Khay', '場所備考', '<div class="info-value">' + safe(tray.TrayLocationNote, '--') + '</div>', false);
            html += wrapGridEnd;
            html += '<div class="tm-alert-info" style="margin-top:16px; background:#f0fdf4; border-color:#bbf7d0; color:#15803d;"><i class="fas fa-layer-group"></i> Sử dụng Tác vụ nhanh ở cột phải để bật Popup chuyển Rack thông minh.</div>';
        }
        else if (tabId === 'photos') {
            html += '<div class="tm-alert-info"><i class="fas fa-images"></i> Chức năng hiển thị Thumbnail tự động và Gallery xem chi tiết các ảnh của khay. Cơ sở dữ liệu: <code>device_photos (type=tray)</code>.</div>';
            html += '<div style="display:flex; justify-content:center; align-items:center; height:120px; background:#f8fafc; border:2px dashed #cbd5e1; border-radius:12px; margin-top:24px; color:#64748b; font-weight:600; cursor:pointer;" onclick="var bt=document.getElementById(\'tmBtnManagePhotos\'); if(bt) bt.click();"><i class="fas fa-photo-video" style="font-size:32px; margin-right:12px;"></i> Mở toàn màn hình Quản Lý Ảnh Khay</div>';
        }
        else if (tabId === 'related') {
            html += createSection('fas fa-link', '関連情報', 'Thông tin Liên kết', 'hue-blue', 4);
            html += this.renderField('Khuôn ID (MoldID)', '関連金型ID', safe(m?.MoldID), true);
            html += this.renderField('Mã Khuôn (MoldCode)', '金型コード', safe(m?.MoldCode), true);
            html += this.renderField('Tên Khuôn (MoldName)', '金型名', safe(m?.MoldName), true);
            html += this.renderField('Job ID (Ref)', 'ジョブID', safe(j?.JobID), true);
            html += this.renderField('Job Code (Ref)', 'ジョブコード', safe(j?.JobCode), true);
            html += wrapGridEnd;
        }
        else if (tabId === 'history') {
            html += '<div class="tm-alert-info"><i class="fas fa-history"></i> Bảng Lịch sử di chuyển Vị trí khay (TrayLocationLog) và Comments đang được chuẩn bị hiển thị tại đây.</div>';
            html += createSection('fas fa-history', '更新履歴', 'Lịch sử Cập nhật', 'hue-slate', 2);
            html += this.renderField('Lần cập nhật cuối', '最終更新日', safe(tray.UpdatedAt), true);
            html += this.renderField('Cập nhật bởi', '更新者', safe(tray.UpdatedBy), true);
            html += wrapGridEnd;
        }
        else if (tabId === 'extended') {
            html += '<div id="tmExtendedTabBody" style="padding: 0; min-height: 400px; border-radius: 8px; overflow: hidden; border: 1px solid var(--ui-border);">Đang tải trình chỉnh sửa mở rộng...</div>';
        }

        html += '</div>';
        return html;
    };

    TrayManager.prototype.bindEvents = function () {
        var self = this;

        var btnOpen = document.getElementById('tmBtnOpenDrawer');
        var drawer = document.getElementById('tmSidebarDrawer');
        var backdrop = document.getElementById('tmSidebarBackdrop');

        var openDrawer = function () {
            if (drawer) drawer.classList.add('open');
            if (backdrop) backdrop.classList.add('show');
        };
        var closeDrawer = function () {
            if (drawer) drawer.classList.remove('open');
            if (backdrop) backdrop.classList.remove('show');
        };

        var btnOpenEmpty = document.getElementById('tmBtnOpenDrawerEmpty');
        if (btnOpen) btnOpen.addEventListener('click', openDrawer);
        if (btnOpenEmpty) btnOpenEmpty.addEventListener('click', openDrawer);
        if (backdrop) backdrop.addEventListener('click', closeDrawer);

        // Search handled by global header in index.html

        // Sort Select
        var sortSel = document.getElementById('tmSortSelect');
        if (sortSel) {
            sortSel.addEventListener('change', function (e) {
                self.sortBy = e.target.value;
                self.applyFilter();
                self.render();
            });
        }

        // List Selection
        var listItems = document.querySelectorAll('.tm-list-item');
        listItems.forEach(function (item) {
            item.addEventListener('click', function () {
                self.selectedTrayId = this.dataset.id;
                self.render();
            });
        });

        // New Button
        var btnCreate = document.getElementById('tmBtnCreate');
        if (btnCreate) {
            btnCreate.addEventListener('click', function () {
                self.selectedTrayId = 'NEW';
                self.render();
            });
        }

        // Tab Switch
        var trayRoot = document.getElementById('trayManagerRoot');
        var tabBtns = trayRoot ? trayRoot.querySelectorAll('.detail-tab') : document.querySelectorAll('.detail-tab');
        tabBtns.forEach(function (btn) {
            btn.addEventListener('click', function (e) {
                self.activeTab = e.currentTarget.getAttribute('data-tab');
                self.render();
            });
        });

        // Photo Thumbnail Hydration (Async resolution fix)
        if (this.selectedTrayId && this.selectedTrayId !== 'NEW' && global.DevicePhotoStore) {
            global.DevicePhotoStore.getThumbnailUrl('tray', this.selectedTrayId).then(function (url) {
                var img = document.getElementById('tmRightPhotoImg');
                var empty = document.getElementById('tmRightPhotoEmpty');
                if (url) {
                    if (img) { img.src = url; img.style.display = 'block'; }
                    if (empty) { empty.style.display = 'none'; }
                } else {
                    if (img) { img.style.display = 'none'; }
                    if (empty) { empty.style.display = 'flex'; }
                }
            });
        }

        // List Thumbnails Hydration
        if (this.renderedTrays && global.DevicePhotoStore) {
            this.renderedTrays.forEach(function (t) {
                global.DevicePhotoStore.getThumbnailUrl('tray', t.TrayID).then(function (url) {
                    var img = document.getElementById('tmThumb_' + t.TrayID);
                    if (img && url) {
                        img.src = url;
                        img.onload = function () { img.style.display = 'block'; var p = img.nextSibling; if (p) p.style.display = 'none'; };
                    }
                });
            });
        }

        var btnRefreshPhoto = document.getElementById('tmBtnRefreshPhoto');
        if (btnRefreshPhoto) btnRefreshPhoto.addEventListener('click', function () {
            if (global.DevicePhotoStore) global.DevicePhotoStore.forceRefresh('tray');
            self.render();
        });

        // Edit Actions
        var tray = self.trays.find(function (t) { return String(t.TrayID) === self.selectedTrayId; });

        // Bind directly into extended tab if active
        if (self.activeTab === 'extended' && global.DPExtendedEditor && tray) {
            var extBody = document.getElementById('tmExtendedTabBody');
            if (extBody) {
                extBody.innerHTML = global.DPExtendedEditor.render();
                global.DPExtendedEditor.bind({ currentItem: tray, currentItemType: 'tray' }, extBody);
            }
        }

        var btnActionExtended = document.getElementById('tmActionBtnExtended');
        if (btnActionExtended) {
            btnActionExtended.addEventListener('click', function () {
                self.activeTab = 'extended';
                self.render();
            });
        }

        var btnQuickLocation = document.getElementById('tmBtnQuickLocation');
        if (btnQuickLocation) {
            btnQuickLocation.addEventListener('click', function () {
                if (global.RelocateWizardModule) {
                    global.RelocateWizardModule.openModal(tray);
                } else if (global.TransferLocModule) {
                    global.TransferLocModule.openModal('TRANSFER', tray);
                } else {
                    alert("Modules cho thay đổi vị trí chưa được khởi tạo!");
                }
            });
        }

        var btnActionWeight = document.getElementById('tmActionBtnWeight');
        if (btnActionWeight && global.QuickUpdateModule) {
            btnActionWeight.addEventListener('click', function () {
                global.QuickUpdateModule.openModal('WEIGHT', tray);
            });
        }

        var openUploadFn = function () {
            if (self.selectedTrayId === 'NEW') return;
            var tray = self.trays.find(function (t) { return String(t.TrayID) === self.selectedTrayId; });
            if (tray && global.PhotoUpload) {
                global.PhotoUpload.open({
                    deviceType: 'tray',
                    deviceId: tray.TrayID,
                    deviceTitle: tray.MoldTrayName || tray.TrayName || ('Khay ' + tray.TrayID)
                });
            }
        };

        var viewPhotoFn = function () {
            if (self.selectedTrayId === 'NEW') return;
            if (global.PhotoManager && global.PhotoManager.openManager) {
                global.PhotoManager.openManager('tray', self.selectedTrayId);
            } else if (global.PhotoManager && global.PhotoManager.open) {
                global.PhotoManager.open('tray', self.selectedTrayId);
            }
        };

        var btnManagePhotos = document.getElementById('tmBtnManagePhotos');
        var btnUploadPhoto = document.getElementById('tmBtnUploadPhoto');
        if (btnManagePhotos) btnManagePhotos.addEventListener('click', viewPhotoFn);
        if (btnUploadPhoto) btnUploadPhoto.addEventListener('click', openUploadFn);

        var imgPhoto = document.getElementById('tmRightPhotoImg');
        if (imgPhoto) imgPhoto.addEventListener('click', viewPhotoFn);
    };

    // Instantiate Singleton
    document.addEventListener('DOMContentLoaded', function () {
        global.TrayManager = new TrayManager();
    });

})(window);

/**
 * Tray Manager v8.5.9
 * Module quản lý Thông tin Khay (Kinh doanh & Sản xuất) tích hợp với Kiến trúc View-Switcher
 */

(function(global) {
    'use strict';

    var TrayManager = function() {
        this.containerId = 'trayManagerRoot';
        this.trays = [];
        this.filteredTrays = [];
        this.selectedTrayId = null;
        this.activeTab = 'info'; // 'info', 'order', 'related', 'photos'
        this.searchQuery = '';
        this.sortBy = 'id_asc'; // id_asc, id_desc, name_asc, name_desc
        this.debounceTimer = null;

        // Form Fields (Kinh doanh & Sản xuất)
        this.formFields = [
            // Thông tin cơ sở
            { id: 'tm_TrayID', label: 'Tray ID', type: 'text', jplabel: 'トレイID', readonly: true, width: '100px', placeholder: '自動付与 / Tự động cấp' },
            { id: 'tm_MoldTrayName', label: 'Tên Khay', type: 'text', jplabel: 'トレイ名', width: '100%' },
            { id: 'tm_CustomerID', label: 'Khách hàng', type: 'select', dataSrc: 'customers', valKey: 'CustomerID', txtKey: 'CustomerName', jplabel: '顧客', width: '200px' },
            { id: 'tm_ItemTypeID', label: 'Loại vật tư', type: 'select', dataSrc: 'itemtype', valKey: 'ItemTypeID', txtKey: 'ItemTypeName', jplabel: 'アイテム種類', width: '160px' },
            
            // Thông tin bổ sung
            { id: 'tm_TrayOrderNotes', label: 'Ghi chú Đơn hàng', type: 'textarea', jplabel: '注文備考', width: '100%' },
            
            // Thông tin Sản xuất
            { id: 'tm_Weight', label: 'Khối lượng (g)', type: 'number', jplabel: '重量(g)', width: '120px' },
            { id: 'tm_RackLayerID', label: 'Vị trí lưu mẫu (Tầng)', type: 'select', dataSrc: 'racklayers', valKey: 'RackLayerID', txtKey: 'RackLayerID', jplabel: 'サンプル保管場所', width: '200px' }
        ];

        this.init();
    };

    TrayManager.prototype.init = function() {
        var self = this;
        document.addEventListener('data-manager:ready', function() {
            self.loadData();
            self.render();
        });
        
        // Lắng nghe View Switcher để render lại nếu cần
        document.addEventListener('mcsViewChanged', function(e) {
            if (e.detail && e.detail.view === 'tray') {
                self.loadData();
                self.render();
            }
        });

        // Lắng nghe thay đổi trên thanh tìm kiếm Global để lọc khay (nếu sếp muốn)
        // Hiện tại: Gõ ô Search -> Nhảy về Molds. Nên ô search riêng cho Khay sẽ nằm bên trong TrayManager.
    };

    TrayManager.prototype.loadData = function() {
        if (global.DataManager && typeof global.DataManager.getAllTrays === 'function') {
            this.trays = global.DataManager.getAllTrays();
        } else {
            this.trays = [];
        }
        this.applyFilter();
    };

    TrayManager.prototype.applyFilter = function() {
        var q = (this.searchQuery || '').toLowerCase().trim();
        var temp = this.trays;

        if (q) {
            temp = temp.filter(function(t) {
                var name = String(t.MoldTrayName || '').toLowerCase();
                var tid = String(t.TrayID || '').toLowerCase();
                var notes = String(t.TrayOrderNotes || '').toLowerCase();
                return name.includes(q) || tid.includes(q) || notes.includes(q);
            });
        }

        // Sắp xếp
        if (this.sortBy === 'id_asc') {
            temp.sort(function(a, b) { return String(a.TrayID).localeCompare(String(b.TrayID), undefined, {numeric: true, sensitivity: 'base'}); });
        } else if (this.sortBy === 'id_desc') {
            temp.sort(function(a, b) { return String(b.TrayID).localeCompare(String(a.TrayID), undefined, {numeric: true, sensitivity: 'base'}); });
        } else if (this.sortBy === 'name_asc') {
            temp.sort(function(a, b) { return String(a.MoldTrayName || '').localeCompare(String(b.MoldTrayName || '')); });
        } else if (this.sortBy === 'name_desc') {
            temp.sort(function(a, b) { return String(b.MoldTrayName || '').localeCompare(String(a.MoldTrayName || '')); });
        }

        this.filteredTrays = temp;
    };

    TrayManager.prototype.render = function() {
        var root = document.getElementById(this.containerId);
        if (!root) return;

        // Skeleton UI
        var html = '<div class="tm-layout">';
        
        // Cột trái: Danh sách Khay
        html += '<div class="tm-sidebar">';
        html += '  <div class="tm-search-box" style="margin-bottom: 8px;">';
        html += '    <i class="fas fa-search"></i>';
        html += '    <input type="text" id="tmSearchInput" placeholder="検索... / Tìm kiếm...">';
        html += '  </div>';
        
        html += '  <div class="tm-sort-box" style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">';
        html += '    <i class="fas fa-sort" style="color:#64748b;"></i>';
        html += '    <select id="tmSortSelect" style="flex: 1; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 13px; color: var(--text-color);">';
        html += '      <option value="id_asc" ' + (this.sortBy === 'id_asc' ? 'selected' : '') + '>Sắp xếp theo ID (Tăng dần)</option>';
        html += '      <option value="id_desc" ' + (this.sortBy === 'id_desc' ? 'selected' : '') + '>Sắp xếp theo ID (Giảm dần)</option>';
        html += '      <option value="name_asc" ' + (this.sortBy === 'name_asc' ? 'selected' : '') + '>Sắp xếp theo Tên (A-Z)</option>';
        html += '      <option value="name_desc" ' + (this.sortBy === 'name_desc' ? 'selected' : '') + '>Sắp xếp theo Tên (Z-A)</option>';
        html += '    </select>';
        html += '  </div>';

        // --- NEW: Sidebar Photo cho Khay đang chọn ---
        var selTray = this.selectedTrayId !== 'NEW' ? this.trays.find(function(t) { return String(t.TrayID) === this.selectedTrayId; }.bind(this)) : null;
        if (selTray) {
            var photoUrl = this.getTrayThumbnail(selTray);
            html += '  <div class="tm-sidebar-photo-container">';
            if (photoUrl) {
                html += '    <img src="' + photoUrl + '" class="tm-sidebar-photo" id="tmSidebarPhotoImg" title="Xem ảnh lớn" />';
            } else {
                html += '    <div class="tm-no-photo-sidebar" id="tmSidebarPhotoEmpty" title="Bấm để tải ảnh lên"><i class="fas fa-camera" style="font-size:20px;margin-bottom:4px;"></i><span style="font-size:12px;">Chưa có ảnh</span></div>';
            }
            html += '    <div style="display:flex; gap:8px;">';
            html += '      <button id="tmBtnPhoto" class="tm-btn-outline" style="flex:1; padding:6px 0; font-size:12px; justify-content:center;"><i class="fas fa-camera"></i> <span class="ja">追加</span><span class="vi" style="margin-left:4px;">Thêm</span></button>';
            html += '      <button id="tmBtnManagePhotos" class="tm-btn-outline" style="flex:1; padding:6px 0; font-size:12px; justify-content:center;"><i class="fas fa-images"></i> <span class="ja">管理</span><span class="vi" style="margin-left:4px;">Quản lý</span></button>';
            html += '    </div>';
            html += '  </div>';
        }
        
        html += '  <div class="tm-list" id="tmList">';
        if (this.filteredTrays.length === 0) {
            html += '<div class="tm-empty"><span class="ja">トレイが見つかりません</span><br><span class="vi">Không tìm thấy khay nào.</span></div>';
        } else {
            html += this.filteredTrays.map(function(t) {
                var isActive = (this.selectedTrayId === String(t.TrayID)) ? 'active' : '';
                return '<div class="tm-list-item ' + isActive + '" data-id="' + t.TrayID + '">' +
                       '  <div class="tm-item-id">#' + (t.TrayID || '?') + '</div>' + 
                       '  <div class="tm-item-name">' + (t.MoldTrayName || 'Chưa thiết lập tên') + '</div>' +
                       '</div>';
            }, this).join('');
        }
        html += '  </div>';
        html += '  <div class="tm-sidebar-footer"><button id="tmBtnCreate" class="tm-btn-primary"><i class="fas fa-plus"></i> <span class="ja">新規作成</span><span class="vi" style="margin-left:6px;">Tạo Khay Mới</span></button></div>';
        html += '</div>';

        // Cột phải: Chi tiết Khay (Form & Ảnh)
        html += '<div class="tm-main" id="tmMain">';
        if (!this.selectedTrayId) {
            html += '<div class="tm-empty-main"><i class="fas fa-box" style="font-size: 48px; color: var(--border-color); margin-bottom: 16px;"></i><br><span class="ja">左側のリストから手トレイを選択してください</span><br><span class="vi">Chọn Khay ở danh sách bên trái để xem chi tiết</span></div>';
        } else if (this.selectedTrayId === 'NEW') {
            html += this.renderMultiTabLayout({}); // Form rỗng
        } else {
            var selectedTray = this.trays.find(function(t) { return String(t.TrayID) === this.selectedTrayId; }.bind(this));
            if (!selectedTray) {
                html += '<div class="tm-empty"><span class="ja">エラー：トレイIDが見つかりません</span><br><span class="vi">Lỗi: Không tìm thấy ID khay.</span></div>';
            } else {
                html += this.renderMultiTabLayout(selectedTray);
            }
        }
        html += '</div>';

        html += '</div>';

        // Khôi phục trạng thái mobile popup nếu đang có selectedTray
        var layoutClass = this.selectedTrayId ? 'tm-layout tm-mobile-detail-open' : 'tm-layout';
        html = html.replace('<div class="tm-layout">', '<div class="' + layoutClass + '">');

        root.innerHTML = html;
        this.bindEvents();
    };

    TrayManager.prototype.renderMultiTabLayout = function(tray) {
        var isNew = (this.selectedTrayId === 'NEW');
        var html = '<div class="tm-form-header">';
        html += '  <h3><i class="fas fa-box"></i> ' + (isNew ? '<span class="ja">新規作成</span><span class="vi" style="margin-left:6px;">Tạo Khay Mới</span>' : '<span class="ja">手トレイ情報</span><span class="vi" style="margin-left:6px;">Thông tin Khay</span>') + '</h3>';
        html += '  <div class="tm-form-actions">';
        html += '    <button id="tmBtnBack" class="tm-btn-back"><i class="fas fa-arrow-left"></i> <span class="ja">戻る</span><span class="vi" style="margin-left:4px;">Trở lại</span></button>';
        
        if (!isNew) {
            html += '    <button id="tmBtnQuickWeight" class="tm-btn-outline" title="Đổi Khối lượng"><i class="fas fa-balance-scale"></i> <span class="vi">Khối lượng</span></button>';
            html += '    <button id="tmBtnQuickLocation" class="tm-btn-outline" title="Đổi Vị trí"><i class="fas fa-map-marker-alt"></i> <span class="vi">Vị trí</span></button>';
        }
        
        html += '    <button id="tmBtnSave" class="tm-btn-success"><i class="fas fa-save"></i> <span class="ja">保存</span><span class="vi" style="margin-left:4px;">Lưu</span></button>';
        html += '  </div>';
        html += '</div>';

        // TABS NAVIGATION
        html += '<div class="tm-tabs-nav">';
        html += '  <button class="tm-tab-btn ' + (this.activeTab === 'info' ? 'active' : '') + '" data-tab="info"><i class="fas fa-info-circle"></i> <span class="ja">基本情報</span>/Tổng quan</button>';
        if (!isNew) {
            html += '  <button class="tm-tab-btn ' + (this.activeTab === 'order' ? 'active' : '') + '" data-tab="order"><i class="fas fa-clipboard-list"></i> <span class="ja">生産履歴</span>/Sản xuất</button>';
            html += '  <button class="tm-tab-btn ' + (this.activeTab === 'related' ? 'active' : '') + '" data-tab="related"><i class="fas fa-project-diagram"></i> <span class="ja">関連型</span>/Thiết kế & Khuôn</button>';
            html += '  <button class="tm-tab-btn ' + (this.activeTab === 'photos' ? 'active' : '') + '" data-tab="photos"><i class="fas fa-images"></i> <span class="ja">写真</span>/Hình ảnh</button>';
        }
        html += '</div>';

        // TABS CONTENT
        html += '<div class="tm-form-body">';
        
        if (this.activeTab === 'info' || isNew) {
            html += '<div class="tm-tab-content active">' + this.renderTabInfo(tray, isNew) + '</div>';
        }
        if (this.activeTab === 'order' && !isNew) {
            html += '<div class="tm-tab-content active">' + this.renderTabOrder(tray) + '</div>';
        }
        if (this.activeTab === 'related' && !isNew) {
            html += '<div class="tm-tab-content active">' + this.renderTabRelated(tray) + '</div>';
        }
        if (this.activeTab === 'photos' && !isNew) {
            html += '<div class="tm-tab-content active" id="tmTabPhotosContainer"><div style="text-align:center; padding: 40px; color: #64748b;"><i class="fas fa-spinner fa-spin fa-2x"></i><br>Đang tải ảnh...</div></div>';
            setTimeout(this.loadPhotosIntoTab.bind(this, tray.TrayID), 50);
        }

        html += '</div>'; // end tm-form-body
        return html;
    };

    TrayManager.prototype.renderTabInfo = function(tray, isNew) {
        var html = '';
        
        // MOBILE ONLY PHOTO (Desktop Sidebar Hides on Mobile)
        var photoUrl = this.getTrayThumbnail(tray);
        html += '<div class="tm-mobile-only-photo">';
        if (photoUrl) {
            html += '  <img src="' + photoUrl + '" alt="Tray Photo" class="tm-main-photo" id="tmMobilePhotoImg" style="cursor:pointer;" title="Xem ảnh lớn" />';
        } else {
            html += '  <div class="tm-no-photo" id="tmMobilePhotoEmpty" style="cursor:pointer;" title="Bấm để tải ảnh lên"><i class="fas fa-camera" style="font-size:24px;"></i><br><span class="ja">写真なし</span><br><span class="vi">Chưa có ảnh</span></div>';
        }
        if (!isNew) {
            html += '  <div style="display:flex; gap:8px;">';
            html += '    <button id="tmBtnMobilePhoto" class="tm-btn-outline" style="flex:1; justify-content:center;"><i class="fas fa-camera"></i> <span class="ja">写真追加</span><span class="vi" style="margin-left:4px;">Thêm Ảnh</span></button>';
            html += '    <button id="tmBtnMobileManagePhotos" class="tm-btn-sub" style="flex:1; justify-content:center;"><i class="fas fa-images"></i> <span class="ja">写真管理</span><span class="vi" style="margin-left:4px;">Quản lý</span></button>';
            html += '  </div>';
        }
        html += '</div>';

        // DASHBOARD OVERVIEW BOXES (If not new)
        if (!isNew) {
            html += '<div class="tm-overview-boxes">';
            html += '  <div class="tm-overview-box highlight">';
            html += '    <span class="label">Vị trí lưu mẫu (保管場所)</span>';
            html += '    <span class="value">' + (tray.RackLayerID || 'Chưa xác định') + '</span>';
            html += '  </div>';
            html += '  <div class="tm-overview-box">';
            html += '    <span class="label">Khối lượng (重量)</span>';
            html += '    <span class="value">' + (tray.Weight ? tray.Weight + ' g' : '--') + '</span>';
            html += '  </div>';
            html += '  <div class="tm-overview-box">';
            html += '    <span class="label">Loại Vật Tư (材料)</span>';
            html += '    <span class="value">' + (tray.ItemTypeID || 'Unknown') + '</span>';
            html += '  </div>';
            html += '</div>';
        }

        // --- TOP ROW ---
        var topFields = ['tm_TrayID', 'tm_MoldTrayName', 'tm_CustomerID'];
        html += '<div class="tm-form-fields-grid tm-grid-top">';
        this.formFields.forEach(function(f) {
            if (topFields.includes(f.id)) html += this.renderFieldHTML(f, tray);
        }, this);
        html += '</div>';
        
        // --- BOTTOM ROW ---
        var bottomFields = ['tm_ItemTypeID', 'tm_TrayOrderNotes', 'tm_Weight', 'tm_RackLayerID'];
        html += '<div class="tm-form-fields-grid tm-grid-bottom" style="margin-top: 16px;">';
        this.formFields.forEach(function(f) {
            if (bottomFields.includes(f.id)) html += this.renderFieldHTML(f, tray);
        }, this);
        html += '</div>';

        return html;
    };

    TrayManager.prototype.renderTabOrder = function(tray) {
        var html = '<h4 style="margin:0 0 12px 0; color:#0f172a;">Lịch sử Đơn hàng & Sản xuất</h4>';
        
        var orders = [];
        if (global.DataManager && global.DataManager.data && global.DataManager.data.orderline) {
            orders = global.DataManager.data.orderline.filter(function(o) {
                return String(o.TrayID) === String(tray.TrayID);
            });
        }

        if (orders.length === 0) {
            html += '<div style="padding:24px; background:#f8fafc; border-radius:12px; border:1px dashed #cbd5e1; color:#64748b; text-align:center;">';
            html += '<i class="fas fa-clipboard-list fa-2x" style="margin-bottom:12px; color:#94a3b8;"></i><br>';
            html += 'Chưa có lịch sử sản xuất nào liên kết với Khay này.<br>';
            html += '</div>';
        } else {
            html += '<div style="overflow-x:auto; background:#fff; border-radius:8px; border:1px solid #e2e8f0;">';
            html += '  <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">';
            html += '    <thead style="background:#f1f5f9; color:#475569; border-bottom:1px solid #e2e8f0;">';
            html += '      <tr>';
            html += '        <th style="padding:10px 12px; font-weight:600;">Record ID</th>';
            html += '        <th style="padding:10px 12px; font-weight:600;">Due Date</th>';
            html += '        <th style="padding:10px 12px; font-weight:600;">Quantity</th>';
            html += '        <th style="padding:10px 12px; font-weight:600;">Status</th>';
            html += '      </tr>';
            html += '    </thead>';
            html += '    <tbody>';
            orders.forEach(function(o) {
                html += '      <tr style="border-bottom:1px solid #f1f5f9;">';
                html += '        <td style="padding:10px 12px;">' + this.escapeHtml(o.OrderLineID || o.LegacyOrderLineID) + '</td>';
                html += '        <td style="padding:10px 12px;">' + this.escapeHtml(o.DueDate) + '</td>';
                html += '        <td style="padding:10px 12px; font-weight:600;">' + this.escapeHtml(o.Quantity) + '</td>';
                html += '        <td style="padding:10px 12px;">' + this.escapeHtml(o.LineStatus) + '</td>';
                html += '      </tr>';
            }, this);
            html += '    </tbody>';
            html += '  </table>';
            html += '</div>';
        }
        return html;
    };

    TrayManager.prototype.renderTabRelated = function(tray) {
        var html = '<h4 style="margin:0 0 12px 0; color:#0f172a;">Khuôn & Thiết kế liên kết</h4>';
        
        var molds = [], designs = [];
        if (global.DataManager && global.DataManager.data) {
            if (global.DataManager.data.molds) {
                molds = global.DataManager.data.molds.filter(function(m) { return String(m.TrayID) === String(tray.TrayID); });
            }
            if (global.DataManager.data.molddesign) {
                designs = global.DataManager.data.molddesign.filter(function(d) { return String(d.TrayID) === String(tray.TrayID); });
            }
        }

        // --- Render Khuôn ---
        html += '<h5 style="margin:0 0 8px 0; color:#3b82f6;"><i class="fas fa-cubes"></i> Danh sách Khuôn đang dùng Khay này (' + molds.length + ')</h5>';
        if (molds.length === 0) {
            html += '<div style="padding:16px; background:#f8fafc; border-radius:8px; border:1px dashed #cbd5e1; color:#64748b; margin-bottom:16px;">Vẫn chưa có Khuôn nào được gán cho Khay này.</div>';
        } else {
            html += '<div style="overflow-x:auto; background:#fff; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:16px;">';
            html += '  <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">';
            html += '    <thead style="background:#f1f5f9; color:#475569; border-bottom:1px solid #e2e8f0;">';
            html += '      <tr>';
            html += '        <th style="padding:8px 12px; font-weight:600;">Mold ID</th>';
            html += '        <th style="padding:8px 12px; font-weight:600;">Tên Khuôn</th>';
            html += '        <th style="padding:8px 12px; font-weight:600;">Trạng thái</th>';
            html += '      </tr>';
            html += '    </thead>';
            html += '    <tbody>';
            molds.forEach(function(m) {
                html += '      <tr style="border-bottom:1px solid #f1f5f9;">';
                html += '        <td style="padding:8px 12px; font-weight:600;">' + this.escapeHtml(m.MoldID || m.LegacyMoldID) + '</td>';
                html += '        <td style="padding:8px 12px; color:#3b82f6;">' + this.escapeHtml(m.MoldName) + '</td>';
                html += '        <td style="padding:8px 12px;">' + this.escapeHtml(m.MoldUsageStatus) + '</td>';
                html += '      </tr>';
            }, this);
            html += '    </tbody>';
            html += '  </table>';
            html += '</div>';
        }

        // --- Render Thiết kế ---
        html += '<h5 style="margin:0 0 8px 0; color:#10b981;"><i class="fas fa-drafting-compass"></i> Thiết kế liên quan (' + designs.length + ')</h5>';
        if (designs.length === 0) {
            html += '<div style="padding:16px; background:#f8fafc; border-radius:8px; border:1px dashed #cbd5e1; color:#64748b;">Chưa có dữ liệu thiết kế.</div>';
        } else {
            html += '<div style="overflow-x:auto; background:#fff; border-radius:8px; border:1px solid #e2e8f0;">';
            html += '  <table style="width:100%; border-collapse:collapse; font-size:13px; text-align:left;">';
            html += '    <thead style="background:#f1f5f9; color:#475569; border-bottom:1px solid #e2e8f0;">';
            html += '      <tr>';
            html += '        <th style="padding:8px 12px; font-weight:600;">Design ID</th>';
            html += '        <th style="padding:8px 12px; font-weight:600;">Mô tả Khay</th>';
            html += '      </tr>';
            html += '    </thead>';
            html += '    <tbody>';
            designs.forEach(function(d) {
                html += '      <tr style="border-bottom:1px solid #f1f5f9;">';
                html += '        <td style="padding:8px 12px; font-weight:600;">' + this.escapeHtml(d.MoldDesignID || d.LegacyMoldDesignID) + '</td>';
                html += '        <td style="padding:8px 12px;">' + this.escapeHtml(d.CustomerTrayName || d.TrayInfoForMoldDesign) + '</td>';
                html += '      </tr>';
            }, this);
            html += '    </tbody>';
            html += '  </table>';
            html += '</div>';
        }

        return html;
    };

    TrayManager.prototype.getPhotoCount = function(trayId) {
        if (global.DevicePhotoStore) {
            var pts = global.DevicePhotoStore.getPhotosForDevice('tray', trayId);
            return pts ? pts.length : 0;
        }
        return 0;
    };

    TrayManager.prototype.loadPhotosIntoTab = function(trayId) {
        var container = document.getElementById('tmTabPhotosContainer');
        if (!container) return;
        
        container.innerHTML = '<div style="padding:24px; background:#f8fafc; border-radius:12px; border:1px dashed #cbd5e1; color:#64748b; text-align:center;">';
        container.innerHTML += '<i class="fas fa-images fa-2x" style="margin-bottom:12px; color:#94a3b8;"></i><br>';
        container.innerHTML += 'Tính năng hiển thị Lưới ảnh hàng loạt đang được ghép nối với <strong>DevicePhotoStore</strong>.<br>';
        container.innerHTML += '<button id="tmBtnTabManagePhotos" class="tm-btn-primary" style="display:inline-flex; width:auto; padding:8px 24px; margin-top:16px; align-items:center; gap:8px;"><i class="fas fa-images"></i> Mở Trình Quản lý Ảnh hiện tại</button>';
        container.innerHTML += '</div>';
        
        var btn = document.getElementById('tmBtnTabManagePhotos');
        if (btn) {
            btn.addEventListener('click', function() {
                if (global.PhotoManager && global.PhotoManager.openManager) {
                    global.PhotoManager.openManager('tray', trayId);
                } else if (global.PhotoManager && global.PhotoManager.open) {
                    global.PhotoManager.open('tray', trayId);
                }
            });
        }
    };

    TrayManager.prototype.renderFieldHTML = function(f, tray) {
        var html = '';
        var val = tray[f.id] !== undefined ? tray[f.id] : tray[f.id.replace('tm_', '')] || '';
        var readonlyAttr = f.readonly ? 'readonly style="background:#f1f5f9;cursor:not-allowed;"' : '';
        var placeholder = f.placeholder ? 'placeholder="' + f.placeholder + '"' : '';
        html += '<div class="tm-field-group" style="flex-basis: ' + (f.width || '100%') + '; max-width: ' + (f.width || '100%') + '">';
        html += '  <label for="' + f.id + '"><span class="ja">' + (f.jplabel || f.label) + '</span><span class="vi">' + f.label + '</span></label>';
        
        if (f.type === 'textarea') {
            html += '  <textarea id="' + f.id + '" class="tm-input" ' + readonlyAttr + ' rows="3" ' + placeholder + '>' + this.escapeHtml(val) + '</textarea>';
        } else if (f.type === 'select') {
            html += '  <select id="' + f.id + '" class="tm-input" ' + readonlyAttr + '>';
            html += '    <option value="">-- <span class="ja">選択</span> / <span class="vi">Chọn</span> --</option>';
            if (global.DataManager && global.DataManager.data && global.DataManager.data[f.dataSrc]) {
                var ds = global.DataManager.data[f.dataSrc] || [];
                ds.forEach(function(item) {
                    var optVal = item[f.valKey] || '';
                    var optTxt = item[f.txtKey] || optVal;
                    if (f.dataSrc === 'customers') optTxt = (item.CustomerShortName || item.CustomerName || '') + ' (' + optVal + ')';
                    var isSel = (String(optVal) === String(val)) ? 'selected' : '';
                    if (optVal) {
                        html += '    <option value="' + this.escapeHtml(optVal) + '" ' + isSel + '>' + this.escapeHtml(optTxt) + '</option>';
                    }
                }.bind(this));
            }
            html += '  </select>';
        } else {
            html += '  <input type="' + f.type + '" id="' + f.id + '" class="tm-input" value="' + this.escapeHtml(val) + '" ' + readonlyAttr + ' ' + placeholder + ' />';
        }
        html += '</div>';
        return html;
    };

    TrayManager.prototype.getTrayThumbnail = function(tray) {
        // Fallback or read from global PhotoStore if possible
        if (global.DevicePhotoStore) {
            var p = global.DevicePhotoStore.getThumbnailUrl('tray', tray.TrayID);
            if (p) return p;
        }
        return null;
    };

    TrayManager.prototype.escapeHtml = function(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };

    TrayManager.prototype.bindEvents = function() {
        var self = this;

        // Search Input
        var sInp = document.getElementById('tmSearchInput');
        if (sInp) {
            sInp.value = this.searchQuery;
            sInp.focus();
            sInp.addEventListener('input', function(e) {
                self.searchQuery = e.target.value;
                if (self.debounceTimer) clearTimeout(self.debounceTimer);
                self.debounceTimer = setTimeout(function() {
                    self.applyFilter();
                    self.render();
                }, 300);
            });
        }

        // Sort Select
        var sortSel = document.getElementById('tmSortSelect');
        if (sortSel) {
            sortSel.addEventListener('change', function(e) {
                self.sortBy = e.target.value;
                self.applyFilter();
                self.render();
            });
        }

        // List Clicks
        var listItems = document.querySelectorAll('.tm-list-item');
        listItems.forEach(function(item) {
            item.addEventListener('click', function() {
                self.selectedTrayId = this.dataset.id;
                self.render();
            });
        });

        // Save Button
        var btnSave = document.getElementById('tmBtnSave');
        if (btnSave) {
            btnSave.addEventListener('click', function() {
                self.saveTray();
            });
        }

        // Back Button (Mobile)
        var btnBack = document.getElementById('tmBtnBack');
        if (btnBack) {
            btnBack.addEventListener('click', function() {
                self.selectedTrayId = null;
                self.render();
            });
        }

        // Add Photo Buttons (Sidebar & Mobile)
        var btnPhoto = document.getElementById('tmBtnPhoto');
        var btnEmptyPhoto = document.getElementById('tmSidebarPhotoEmpty');
        var btnMobilePhoto = document.getElementById('tmBtnMobilePhoto');
        var btnMobileEmpty = document.getElementById('tmMobilePhotoEmpty');
        
        var openUploadFn = function() {
            var tray = self.trays.find(function(t) { return String(t.TrayID) === self.selectedTrayId; });
            if (tray && global.PhotoUpload) {
                global.PhotoUpload.open({
                    deviceType: 'tray',
                    deviceId: tray.TrayID,
                    deviceTitle: tray.MoldTrayName || ('Khay ' + tray.TrayID)
                });
            }
        };
        if (btnPhoto) btnPhoto.addEventListener('click', openUploadFn);
        if (btnEmptyPhoto) btnEmptyPhoto.addEventListener('click', openUploadFn);
        if (btnMobilePhoto) btnMobilePhoto.addEventListener('click', openUploadFn);
        if (btnMobileEmpty) btnMobileEmpty.addEventListener('click', openUploadFn);

        // Thumbnail Click (View Photo) - Sidebar & Mobile
        var imgPhoto = document.getElementById('tmSidebarPhotoImg');
        var imgMobilePhoto = document.getElementById('tmMobilePhotoImg');
        var viewPhotoFn = function() {
            if (global.PhotoManager && global.PhotoManager.openManager) {
                global.PhotoManager.openManager('tray', self.selectedTrayId);
            } else if (global.PhotoManager && global.PhotoManager.open) {
                global.PhotoManager.open('tray', self.selectedTrayId);
            }
        };
        if (imgPhoto) imgPhoto.addEventListener('click', viewPhotoFn);
        if (imgMobilePhoto) imgMobilePhoto.addEventListener('click', viewPhotoFn);

        // Manage Photos Buttons
        var btnManagePhotos = document.getElementById('tmBtnManagePhotos');
        var btnMobileManage = document.getElementById('tmBtnMobileManagePhotos');
        if (btnManagePhotos) btnManagePhotos.addEventListener('click', viewPhotoFn);
        if (btnMobileManage) btnMobileManage.addEventListener('click', viewPhotoFn);

        // Tabs Navigation
        var tabBtns = document.querySelectorAll('.tm-tab-btn');
        tabBtns.forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                self.activeTab = e.currentTarget.getAttribute('data-tab');
                self.render(); // Re-render to update tab UI
            });
        });

        // Quick Action Buttons
        var btnQuickWeight = document.getElementById('tmBtnQuickWeight');
        if (btnQuickWeight && global.ExtendedEditor) {
            btnQuickWeight.addEventListener('click', function() {
                var tray = self.trays.find(function(t) { return String(t.TrayID) === self.selectedTrayId; });
                global.ExtendedEditor.openEditor('tray', tray, 'weight', function() {
                    // Update tray property
                    if (global.DataManager && global.DataManager.loadAllData) {
                        global.DataManager.loadAllData().then(function() {
                            self.loadData();
                            self.render();
                        });
                    }
                });
            });
        }
        
        var btnQuickLocation = document.getElementById('tmBtnQuickLocation');
        if (btnQuickLocation && global.ExtendedEditor) {
            btnQuickLocation.addEventListener('click', function() {
                var tray = self.trays.find(function(t) { return String(t.TrayID) === self.selectedTrayId; });
                global.ExtendedEditor.openEditor('tray', tray, 'location', function() {
                    if (global.DataManager && global.DataManager.loadAllData) {
                        global.DataManager.loadAllData().then(function() {
                            self.loadData();
                            self.render();
                        });
                    }
                });
            });
        }

        // Create New Tray
        var btnCreate = document.getElementById('tmBtnCreate');
        if (btnCreate) {
            btnCreate.addEventListener('click', function() {
                self.selectedTrayId = 'NEW';
                self.render();
            });
        }
    };

    TrayManager.prototype.saveTray = function() {
        if (!this.selectedTrayId) return;
        var self = this;
        var btnSave = document.getElementById('tmBtnSave');
        var origText = btnSave.innerHTML;
        btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
        btnSave.disabled = true;

        var updates = {};
        this.formFields.forEach(function(f) {
            var el = document.getElementById(f.id);
            if (el && !f.readonly) {
                // Tên cột trong DB/CSV là tên sau tm_, ví dụ tm_Weight -> Weight
                var fieldName = f.id.replace('tm_', '');
                updates[fieldName] = el.value.trim();
            }
        });
        
        // Xử lý NEW Tray
        var isNew = (this.selectedTrayId === 'NEW');
        if (isNew && !updates.MoldTrayName) {
            alert('Vui lòng nhập Tên Khay / トレイ名を入力してください');
            btnSave.innerHTML = origText;
            btnSave.disabled = false;
            return;
        }

        if (isNew) {
            // Tự sinh ID
            this.selectedTrayId = 'TR' + Date.now().toString().slice(-6);
        }

        var payload = {
            table: 'webtray', // Tên CSV trên server
            keyField: 'TrayID',
            keyValue: this.selectedTrayId,
            updates: updates
        };

        if (isNew) {
            updates.TrayID = this.selectedTrayId;
            updates.TrayDateEntry = new Date().toISOString().slice(0, 10);
        }

        fetch('/api/csv/upsert', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        })
        .then(function(res) {
            if (!res.ok) throw new Error('Cập nhật thất bại (Lỗi HTTP ' + res.status + ')');
            return res.json();
        })
        .then(function(data) {
            if (global.NotificationModule) {
                global.NotificationModule.showToast('Lưu thông tin khay thành công', 'success');
            }
            if (isNew) {
                self.trays.push(Object.assign({ TrayID: self.selectedTrayId }, updates));
            } else {
                var tIndex = self.trays.findIndex(function(t) { return String(t.TrayID) === self.selectedTrayId; });
                if (tIndex >= 0) {
                    Object.assign(self.trays[tIndex], updates);
                }
            }
            if (global.DataManager && typeof global.DataManager.loadAllData === 'function') {
                 global.DataManager.loadAllData().then(function() {
                    self.loadData();
                    self.render();
                 });
            } else {
                 self.loadData();
                 self.render();
            }
        })
        .catch(function(err) {
            alert('Lỗi khi lưu khay: ' + err.message);
            btnSave.innerHTML = origText;
            btnSave.disabled = false;
            // Rollback Id
            if (isNew) self.selectedTrayId = 'NEW';
        });
    };

    // Singleton Export
    document.addEventListener('DOMContentLoaded', function() {
        global.TrayManager = new TrayManager();
    });

})(window);

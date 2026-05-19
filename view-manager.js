// v9.0.2
/**
 * View Manager v8.5.9
 * Quản lý chuyển đổi các View (Tráo đổi màn hình chính) trong kiến trúc SPA.
 */

(function (global) {
    var ViewManager = function () {
        this.currentView = 'mold'; // 'mold' | 'tray' | 'plastic'
        this.views = {
            mold: document.getElementById('mcs-view-mold'),
            tray: document.getElementById('mcs-view-tray'),
            plastic: document.getElementById('plastic-app-root'),
            teflon: document.getElementById('mcs-view-teflon'),
            history: document.getElementById('mcs-view-history'),
            location: document.getElementById('mcs-view-location')
        };
        this.navs = {
            mold: document.getElementById('sidebarNavMolds'),
            tray: document.getElementById('sidebarNavTrays'),
            plastic: document.getElementById('sidebarPlasticManagerBtn'),
            teflon: document.getElementById('sidebarTeflonModuleBtn'),
            history: document.getElementById('sidebarHistoryModuleBtn'),
            location: document.getElementById('sidebarLocationManagerBtn')
        };
        this.categoryDropdown = document.getElementById('categoryDropdown');

        this.init();
    };

    ViewManager.prototype.init = function () {
        var self = this;

        if (this.navs.mold) {
            this.navs.mold.addEventListener('click', function (e) {
                e.preventDefault();
                self.switchView('mold');
            });
        }

        if (this.navs.tray) {
            this.navs.tray.addEventListener('click', function (e) {
                e.preventDefault();
                self.switchView('tray');
            });
        }

        // Tích hợp Global Searchbox: 
        // Khi gõ vào ô search, nếu đang ềEview Tray, ta tự động gán categoryDropdown thành 'tray'
        // Tuy nhiên sếp yêu cầu: "Phần global search giữ nguyên đềEkhi cần chềEcần gõ tìm kiếm là vềEngay trang search thiết bềE"
        // Nghĩa là: nếu đang ềEtab Khay mà User gõ vào Global Search -> Tự động nhảy vềEMold View.
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            // [EDIT]: Removed automatic switch to mold view on focus for Tray Manager
            // searchInput.addEventListener('focus', function () {
            //     if (self.currentView === 'tray') {
            //         if (self.categoryDropdown) self.categoryDropdown.value = 'all';
            //         self.switchView('mold');
            //     }
            // });
        }

        // Cấu hình ban đầu
        this.switchView('mold');
    };

    ViewManager.prototype.switchView = function (viewName) {
        if (!this.views[viewName]) return;
        this.currentView = viewName;
        window.CurrentSearchContext = viewName; // Update Global Search Context

        // Trigger Scope Pill Update & Searchbar Styling
        var scopePill = document.getElementById('search-scope-pill');
        var searchInput = document.getElementById('searchInput');
        var moduleIcon = document.querySelector('.topbar-module-icon');
        var moduleLabelJa = document.querySelector('.topbar-module-label .ja');
        var moduleLabelVi = document.querySelector('.topbar-module-label .vi');
        var categoryDropdown = document.getElementById('categoryDropdown');
        var searchDivider = document.querySelector('.search-divider');

        if (viewName === 'plastic') {
            if (scopePill) { scopePill.innerHTML = '<i class="fas fa-box-open"></i> WMS専用'; scopePill.classList.remove('mcs-hidden'); }
            if (searchInput) searchInput.placeholder = 'ロール番号、種類、場所などを検索... / Tìm cuộn, mã nhựa, nsx...';
            if (moduleIcon) moduleIcon.innerHTML = '<i class="fas fa-box-open"></i>';
            if (moduleLabelJa) moduleLabelJa.textContent = 'プラ材料倉庫管理(WMS)';
            if (moduleLabelVi) moduleLabelVi.textContent = 'Quản lý Nhựa / Plastic WMS';
            if (categoryDropdown) categoryDropdown.classList.add('mcs-hidden');
            if (searchDivider) searchDivider.classList.add('mcs-hidden');
        } else if (viewName === 'tray') {
            if (scopePill) scopePill.classList.add('mcs-hidden');
            if (searchInput) searchInput.placeholder = 'トレイ、パラメータ... / Khay, thông số...';
            if (moduleIcon) moduleIcon.innerHTML = '<i class="fas fa-box"></i>';
            if (moduleLabelJa) moduleLabelJa.textContent = 'トレイ管理';
            if (moduleLabelVi) moduleLabelVi.textContent = 'Quản lý Khay';
            if (categoryDropdown) categoryDropdown.classList.remove('mcs-hidden');
            if (searchDivider) searchDivider.classList.remove('mcs-hidden');
        } else if (viewName === 'teflon') {
            if (scopePill) { scopePill.innerHTML = '<i class="fas fa-layer-group"></i> TEF'; scopePill.classList.remove('mcs-hidden'); }
            if (searchInput) searchInput.placeholder = '型番、備考などを検索… / Tìm mã khuôn, ghi chú...';
            if (moduleIcon) moduleIcon.innerHTML = '<i class="fas fa-layer-group"></i>';
            if (moduleLabelJa) moduleLabelJa.textContent = 'テフロン管理';
            if (moduleLabelVi) moduleLabelVi.textContent = 'Quản lý Teflon';
            if (categoryDropdown) categoryDropdown.classList.add('mcs-hidden');
            if (searchDivider) searchDivider.classList.add('mcs-hidden');
        } else if (viewName === 'location') {
            if (scopePill) { scopePill.innerHTML = '<i class="fas fa-layer-group"></i> LOC'; scopePill.classList.remove('mcs-hidden'); }
            if (searchInput) searchInput.placeholder = 'ラベルを検索... / Tìm mã giá, kệ...';
            if (moduleIcon) moduleIcon.innerHTML = '<i class="fas fa-layer-group"></i>';
            if (moduleLabelJa) moduleLabelJa.textContent = '保管ラベル管理';
            if (moduleLabelVi) moduleLabelVi.textContent = 'Quản lý Giá kệ';
            if (categoryDropdown) categoryDropdown.classList.add('mcs-hidden');
            if (searchDivider) searchDivider.classList.add('mcs-hidden');
        } else if (viewName === 'history') {
            if (scopePill) { scopePill.innerHTML = '<i class="fas fa-history"></i> HIS'; scopePill.classList.remove('mcs-hidden'); }
            if (searchInput) searchInput.placeholder = '履歴を検索... / Tìm thiết bị, hành động...';
            if (moduleIcon) moduleIcon.innerHTML = '<i class="fas fa-history"></i>';
            if (moduleLabelJa) moduleLabelJa.innerHTML = 'システム履歴';
            if (moduleLabelVi) moduleLabelVi.textContent = 'Lịch sử hệ thống';
            if (categoryDropdown) categoryDropdown.classList.add('mcs-hidden');
            if (searchDivider) searchDivider.classList.add('mcs-hidden');
        } else if (viewName === 'sact') {
            if (scopePill) { scopePill.classList.add('mcs-hidden'); }
            if (searchInput) searchInput.placeholder = 'SACT / キャンペーンコード... / SACT / Mã chiến dịch...';
            if (moduleIcon) moduleIcon.innerHTML = '<i class="fas fa-clipboard-check"></i>';
            if (moduleLabelJa) moduleLabelJa.innerHTML = 'SACT モニター';
            if (moduleLabelVi) moduleLabelVi.textContent = 'Điểm danh khuôn SACT';
            if (categoryDropdown) categoryDropdown.classList.add('mcs-hidden');
            if (searchDivider) searchDivider.classList.add('mcs-hidden');
        } else {
            // mold
            if (scopePill) scopePill.classList.add('mcs-hidden');
            if (searchInput) searchInput.placeholder = 'コード・名称検索... / Mã, tên, vị trí, công ty...';
            if (moduleIcon) moduleIcon.innerHTML = '<i class="fas fa-search"></i>';
            if (moduleLabelJa) moduleLabelJa.innerHTML = '金型・抜型 検索';
            if (moduleLabelVi) moduleLabelVi.textContent = 'Tìm kiếm Khuôn / Dao cắt';
            if (categoryDropdown) categoryDropdown.classList.remove('mcs-hidden');
            if (searchDivider) searchDivider.classList.remove('mcs-hidden');
        }

        // Ẩn tất cả views (kể cả lịch sử), hiện view được chọn
        var self = this;
        document.querySelectorAll('.main-content > .content-area').forEach(function (el) {
            el.style.display = 'none';
        });

        if (this.views[viewName]) {
            this.views[viewName].style.display = 'flex';
        } else {
            // Đối với các view tạo động như SACT, tìm element bằng DOM id
            var dynamicView = null;
            if (viewName === 'sact') dynamicView = document.getElementById('sact-module-root');
            
            if (dynamicView) {
                dynamicView.style.display = 'flex';
            }
        }

        // Tự động đóng Detail Panel của Khuôn nếu mềE
        var dp = document.getElementById('detailPanel');
        if (dp && dp.classList.contains('open')) {
            dp.classList.remove('open', 'active');
            var bd = document.getElementById('backdrop');
            if (bd) bd.classList.remove('show');
        }

        // Cập nhật trạng thái Nav sidebar
        Object.keys(this.navs).forEach(function (key) {
            if (self.navs[key]) {
                if (key === viewName) {
                    self.navs[key].classList.add('active');
                } else {
                    self.navs[key].classList.remove('active');
                }
            }
        });

        // Dispatch event đềEcác module khác biết (e.g. TrayManager có thềEre-render)
        document.dispatchEvent(new CustomEvent('mcsViewChanged', { detail: { view: viewName } }));

        // Nếu chuyển sang module khác, đóng sidebar trên mobile (nếu đang bật)
        if (window.innerWidth <= 768) {
            var sidebar = document.getElementById('sidebar');
            if (sidebar) {
                sidebar.classList.remove('open');
            }
        }

        // Cập nhật thẻ Module Switcher (Demo)
        document.querySelectorAll('.module-switcher .ms-btn').forEach(function (btn) {
            if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(viewName)) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    };

    // Singleton
    document.addEventListener('DOMContentLoaded', function () {
        global.ViewManager = new ViewManager();
    });

})(window);

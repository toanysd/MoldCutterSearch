/**
 * View Manager v8.5.9
 * Quản lý chuyển đổi các View (Tráo đổi màn hình chính) trong kiến trúc SPA.
 */

(function(global) {
    var ViewManager = function() {
        this.currentView = 'mold'; // 'mold' | 'tray'
        this.views = {
            mold: document.getElementById('mcs-view-mold'),
            tray: document.getElementById('mcs-view-tray')
        };
        this.navs = {
            mold: document.getElementById('sidebarNavMolds'),
            tray: document.getElementById('sidebarNavTrays')
        };
        this.categoryDropdown = document.getElementById('categoryDropdown');
        
        this.init();
    };

    ViewManager.prototype.init = function() {
        var self = this;
        
        if (this.navs.mold) {
            this.navs.mold.addEventListener('click', function(e) {
                e.preventDefault();
                self.switchView('mold');
            });
        }
        
        if (this.navs.tray) {
            this.navs.tray.addEventListener('click', function(e) {
                e.preventDefault();
                self.switchView('tray');
            });
        }

        // Tích hợp Global Searchbox: 
        // Khi gõ vào ô search, nếu đang ở view Tray, ta tự động gán categoryDropdown thành 'tray'
        // Tuy nhiên sếp yêu cầu: "Phần global search giữ nguyên để khi cần chỉ cần gõ tìm kiếm là về ngay trang search thiết bị."
        // Nghĩa là: nếu đang ở tab Khay mà User gõ vào Global Search -> Tự động nhảy về Mold View.
        var searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('focus', function() {
                // Sếp nói: "chỉ cần gõ tìm kiếm là về ngay trang search thiết bị"
                if (self.currentView !== 'mold') {
                    if (self.categoryDropdown) self.categoryDropdown.value = 'all'; // Reset category về tất cả thiết bị
                    self.switchView('mold');
                }
            });
        }
        
        // Cấu hình ban đầu
        this.switchView('mold');
    };

    ViewManager.prototype.switchView = function(viewName) {
        if (!this.views[viewName]) return;
        this.currentView = viewName;
        
        // Ẩn tất cả views, hiện view được chọn
        var self = this;
        Object.keys(this.views).forEach(function(key) {
            if (self.views[key]) {
                if (key === viewName) {
                    self.views[key].style.display = 'flex';
                } else {
                    self.views[key].style.display = 'none';
                }
            }
        });

        // Cập nhật trạng thái Nav sidebar
        Object.keys(this.navs).forEach(function(key) {
            if (self.navs[key]) {
                if (key === viewName) {
                    self.navs[key].classList.add('active');
                } else {
                    self.navs[key].classList.remove('active');
                }
            }
        });
        
        // Dispatch event để các module khác biết (e.g. TrayManager có thể re-render)
        document.dispatchEvent(new CustomEvent('mcsViewChanged', { detail: { view: viewName } }));
        
        // Nếu chuyển sang module khác, đóng sidebar trên mobile (nếu đang bật)
        if (window.innerWidth <= 768) {
            var sidebar = document.getElementById('sidebar');
            if (sidebar) {
                // Sửa lỗi: Trên Mobile, Sidebar ẩn hoàn toàn bằng cách xóa class 'open'.
                // TUYỆT ĐỐI không dùng class 'collapsed' cho Mobile vì nó sẽ biến thành dạng icon-only giống Desktop.
                sidebar.classList.remove('open');
            }
        }
    };

    // Singleton
    document.addEventListener('DOMContentLoaded', function() {
        global.ViewManager = new ViewManager();
    });

})(window);

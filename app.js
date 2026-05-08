// v9.0.5
/* ============================================================================

   APP v8.3.1 - Main Application Controller (SearchModule Integrated)

   Coordinates all modules and handles app logic

   Created: 2026-01-23

   Updated: 2026-01-29 (v8.1.0-1 - Integrated SearchModule)



   Compatible with:

   - data-manager-v8.0.3.js

   - search-module-v8.1.0.js (NEW!)

   - results-card-renderer-v8.0.4-4.js

   - results-table-renderer-v8.0.4-4.js

   - detail-panel-v8.0.3-1.js

   - mobile-navbar-v8.0.3-1.js



   Changes in v8.1.0-3:

   - Integrated SearchModule for multi-keyword, multi-field search

   - Listen to 'searchPerformed' event

   - Use searchModule.searchItems() instead of simple includes()

   - Support comma-separated keywords (e.g., "jae, ps")

============================================================================ */

const SIDEBAR_STATE_KEY = 'moldcutter_sidebar_v81';



/* ============================================================================

   GLOBAL SWIPE & HISTORY TRAP UTILITY (v8.5.6+)

   Handles preventing Android system back gestures by trapping window history

   and providing swipe-to-close features for all Modals/Panels.

============================================================================ */

window.SwipeHistoryTrap = (function () {

  var states = [];

  var isHandlingPop = false;



  window.addEventListener('popstate', function (e) {

    if (isHandlingPop) return;

    if (states.length > 0) {

      isHandlingPop = true;

      var trap = states.pop();

      if (typeof trap.closeCallback === 'function') {

        trap.closeCallback();

      }

      setTimeout(function () { isHandlingPop = false; }, 100);

    }

  });



  return {

    push: function (id, closeCallback) {

      window.history.pushState({ trapId: id }, '', window.location.href);

      states.push({ id: id, closeCallback: closeCallback });

    },

    remove: function (id, skipBack = false) {
      if (isHandlingPop) return;
      var idx = states.findIndex(function (s) { return s.id === id; });
      if (idx !== -1) {
        if (idx === states.length - 1) {
          states.pop();
          if (!skipBack) {
            isHandlingPop = true;
            window.history.back();
            setTimeout(function () { isHandlingPop = false; }, 100);
          }
        } else {

          states.splice(idx, 1);

        }

      }

    },

    bindSwipe: function (element, closeCallback, options) {
      if (!element) return;
      options = options || {};
      var followFinger = options.followFinger || false;
      var startX = 0, startY = 0;
      var currentX = 0;
      var isSwiping = false;

      element.addEventListener('touchstart', function (e) {
        if (e.touches.length > 0) {
          startX = e.touches[0].clientX;
          startY = e.touches[0].clientY;
          currentX = startX;

          if (followFinger) {
            // Chỉ bắt đầu swipe nếu chạm vào lề trái (nhỏ hơn 50px) để mở drawer, và không đụng vào bảng
            var isTable = e.target.closest('table, .table-scroll-container, .table-wrapper, .dp-tab-bar, .dp-actions-grid, .scroll-x');
            if (!isTable && startX < 50) {
              isSwiping = true;
              element.style.transition = 'none';
            }
          }
        }
      }, { passive: true });

      if (followFinger) {
        element.addEventListener('touchmove', function (e) {
          if (!isSwiping || e.touches.length !== 1) return;
          if (window._modalClosingSwipe || window._isGlobalModalSwipe) {
            isSwiping = false;
            return;
          }
          currentX = e.touches[0].clientX;
          var dy = e.touches[0].clientY - startY;
          var dx = currentX - startX;

          // Hủy vuốt nếu vuốt dọc nhiều hơn ngang
          if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 15) {
            isSwiping = false;
            element.style.transform = '';
            element.style.transition = '';
            return;
          }

          if (dx > 0) {
            window._panelClosingSwipe = true;
            element.style.transform = 'translateX(' + dx + 'px)';
          }
        }, { passive: true });
      }

      element.addEventListener('touchend', function (e) {
        if (e.changedTouches.length === 0) return;
        var endX = e.changedTouches[0].clientX;
        var endY = e.changedTouches[0].clientY;
        var deltaX = endX - startX;
        var deltaY = Math.abs(endY - startY);

        if (followFinger && isSwiping) {
          isSwiping = false;
          setTimeout(function () { window._panelClosingSwipe = false; }, 100);
          if (deltaX > 80) {
            element.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out';
            element.style.transform = 'translateX(100vw)';
            element.style.opacity = '0';
            setTimeout(function () {
              if (typeof closeCallback === 'function') closeCallback();
              setTimeout(function () {
                if (element) {
                  element.style.transition = '';
                  element.style.transform = '';
                  element.style.opacity = '';
                }
              }, 400);
            }, 250);
          } else {
            // Kéo chưa đủ xa, snap về vị trí cũ
            element.style.transition = 'transform 0.25s ease-out';
            element.style.transform = '';
            setTimeout(function () {
              if (element) element.style.transition = '';
            }, 250);
          }
        } else if (!followFinger) {
          // Logic vuốt cơ bản cũ (không bắt touchmove)
          var oldStartX = e.changedTouches[0].screenX - deltaX; // Khôi phục screenX nếu cần
          if (oldStartX < 35 && startX < 35) return; // System Back Dead zone
          if (deltaX > 60 && deltaY < 60) {
            var isTable = e.target.closest('.table-scroll-container, table, .scroll-x, .zoomed-image-wrapper');
            if (isTable) return;
            e.stopPropagation();
            window._panelClosingSwipe = true;
            setTimeout(function () { window._panelClosingSwipe = false; }, 100);

            element.style.transition = 'transform 0.25s ease-out, opacity 0.25s ease-out';
            element.style.transform = 'translateX(100vw)';
            element.style.opacity = '0';
            setTimeout(function () {
              if (typeof closeCallback === 'function') closeCallback();
              setTimeout(function () {
                if (element) {
                  element.style.transition = '';
                  element.style.transform = '';
                  element.style.opacity = '';
                }
              }, 400);
            }, 250);
          }
        }
      }, { passive: true });
    }
  };

})();



/* ============================================================================

   GLOBAL PHOTO ZOOMER (v8.5.7)

   Allows true native scrolling (panning) over magnified photos

============================================================================ */

window.openGlobalPhotoZoom = function (src) {

  var w = document.createElement('div');

  w.className = 'zoomed-image-wrapper';

  // Đóng gói dưới dạng block thông thường, dùng flex mặc định để căn giữa ảnh nhỏ

  w.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);z-index:9999999;overflow:auto;touch-action:pan-x pan-y;padding:4vh 4vw;display:flex;align-items:center;justify-content:center;';



  var c = document.createElement('img');

  c.src = src;

  c.style.cssText = 'display:block;max-width:100%;max-height:100%;object-fit:contain;cursor:zoom-in;box-shadow:0 10px 40px rgba(0,0,0,0.8);border-radius:8px;transition:all 0.25s ease;';



  var dlBtn = document.createElement('button');

  dlBtn.className = 'zoom-btn-dl';

  dlBtn.innerHTML = '<i class="fas fa-download"></i> 画像ダウンロード';

  dlBtn.style.cssText = 'position:fixed;bottom:30px;right:30px;z-index:99999999;background:rgba(255,255,255,0.2);color:#fff;border:1px solid rgba(255,255,255,0.4);padding:10px 20px;border-radius:30px;cursor:pointer;font-weight:600;font-size:14px;display:flex;align-items:center;gap:8px;backdrop-filter:blur(8px);transition:all 0.2s;box-shadow:0 4px 15px rgba(0,0,0,0.3);';

  dlBtn.onmouseover = function () { this.style.background = 'rgba(255,255,255,0.4)'; };

  dlBtn.onmouseout = function () { this.style.background = 'rgba(255,255,255,0.2)'; };

  dlBtn.onclick = function (e) {

    e.preventDefault();

    e.stopPropagation();

    var originalBtnText = dlBtn.innerHTML;

    dlBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tải...';

    fetch(c.src)

      .then(function (res) { return res.blob(); })

      .then(function (blob) {

        var url = window.URL.createObjectURL(blob);

        var a = document.createElement('a');

        a.href = url;

        a.download = 'mold_photo_' + Date.now() + '.jpg';

        document.body.appendChild(a);

        a.click();

        window.URL.revokeObjectURL(url);

        a.remove();

        dlBtn.innerHTML = '<i class="fas fa-check"></i> Đã lưu';

        setTimeout(function () { dlBtn.innerHTML = originalBtnText; }, 2000);

      })

      .catch(function (err) {

        console.error('Download error:', err);

        var a = document.createElement('a');

        a.href = c.src;

        a.download = 'mold_photo_' + Date.now() + '.jpg';

        a.target = '_blank';

        a.click();

        dlBtn.innerHTML = originalBtnText;

      });

  };



  w.appendChild(c);

  w.appendChild(dlBtn);



  // Implement Drag-to-Pan (Grab and move)

  var isDragging = false;

  var hasDragged = false;

  var startX, startY, scrollStartX, scrollStartY;

  var isZoomed = false;



  w.addEventListener('mousedown', function (e) {

    if (e.button !== 0) return; // Only process left click

    if (e.target.closest('.zoom-btn-dl')) return; // Ignore download button

    e.preventDefault(); // Prevent native image dragging

    // Only allow grab if zoomed

    if (isZoomed) {

      isDragging = true;

      hasDragged = false;

      startX = e.pageX;

      startY = e.pageY;

      scrollStartX = w.scrollLeft;

      scrollStartY = w.scrollTop;

      c.style.cursor = 'grabbing';

    }

  });



  w.addEventListener('mousemove', function (e) {

    if (!isDragging) return;

    var dx = e.pageX - startX;

    var dy = e.pageY - startY;



    if (!hasDragged && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {

      hasDragged = true;

    }



    if (hasDragged) {

      w.scrollLeft = scrollStartX - dx;

      w.scrollTop = scrollStartY - dy;

    }

  });



  var stopDrag = function () {

    if (!isDragging) return;

    isDragging = false;

    if (isZoomed) c.style.cursor = 'zoom-out';

  };



  w.addEventListener('mouseup', stopDrag);

  w.addEventListener('mouseleave', stopDrag);



  w.onclick = function (e) {

    if (e.target.closest('.zoom-btn-dl')) return; // Handled by button



    // Prevent zoom close if the action was a drag

    if (hasDragged) {

      hasDragged = false; // Reset

      return;

    }



    if (!isZoomed && e.target === c) {

      isZoomed = true;



      // Calculate click ratio

      var rect = c.getBoundingClientRect();

      var ratioX = (e.clientX - rect.left) / rect.width;

      var ratioY = (e.clientY - rect.top) / rect.height;



      // Apply zoomed styles
      w.style.display = 'block'; // Switch to block so overflow behaves properly

      var targetWidth = c.naturalWidth && c.naturalWidth > window.innerWidth
        ? c.naturalWidth
        : window.innerWidth * 1.5;

      c.style.width = targetWidth + 'px';
      c.style.minWidth = '100vw';
      c.style.maxWidth = 'none';
      c.style.maxHeight = 'none';
      c.style.margin = '0 auto';
      c.style.cursor = 'zoom-out';



      // Scroll to clicked point

      setTimeout(function () {

        var newRect = c.getBoundingClientRect();

        w.scrollLeft = (window.innerWidth * 0.04 + newRect.width * ratioX) - (window.innerWidth / 2);

        w.scrollTop = (window.innerHeight * 0.04 + newRect.height * ratioY) - (window.innerHeight / 2);

      }, 10);

      return;

    }



    w.style.opacity = '0';

    setTimeout(function () { w.remove(); }, 250);

    if (window.SwipeHistoryTrap) window.SwipeHistoryTrap.remove('globalPhotoZoom');

  };



  w.style.transition = 'opacity 0.25s ease';

  w.style.opacity = '0';

  document.body.appendChild(w);

  requestAnimationFrame(function () {

    w.style.opacity = '1';

  });



  if (window.SwipeHistoryTrap) {

    // Override back button behavior

    window.SwipeHistoryTrap.push('globalPhotoZoom', function () {

      if (w.parentNode) w.onclick({ target: w });

    });

  }

};



class App {

  constructor() {

    this.allItems = [];

    this.filteredItems = [];

    this.currentView = 'card';

    this.currentPage = 1;

    this.itemsPerPage = 24;

    this.selectedCategory = 'all';

    this.searchQuery = '';

    this.selectedIds = new Set();

    this.isSyncingSelection = false;



    this._sidebarRestoredOnce = false;

    this._lastIsMobile = null;



    // Internal sync flags

    this._ignoreNextFilterApplied = false;



    // Modules

    this.searchModule = null; // NEW: SearchModule

    this.cardRenderer = null;

    this.tableRenderer = null;

    this.detailPanel = null;

    this.mobileNavbar = null;



    this.init();

  }



  async init() {
    console.log('🚀 Initializing MoldCutterSearch v8.1.0-3...');

    // ===== CRITICAL: Lưu tham số ?q= TRƯỚC KHI bất kỳ module nào xóa nó =====
    // DetailPanel.close() gọi replaceState xóa ?q= trong khi app.js đang chờ DataManager
    const _savedQParam = new URLSearchParams(window.location.search).get('q');
    if (_savedQParam) console.log('[SPA Routing] Đã chụp lại tham số q=', _savedQParam);

    // V10: Khởi tạo UI Shell (Sidebar, Topbar, Events) MẶC KỆ mạng hay Auth Guard!
    this.initComponents();
    this.attachEventListeners();

    // Check QR Scan parameter from URL immediately
    if (window.QRScanSearch && typeof window.QRScanSearch.checkUrlQR === 'function') {
      window.QRScanSearch.checkUrlQR();
    }

    // Chỉ gọi forceSidebarForViewport, nó sẽ tự restore 1 lần khi ở desktop
    this.forceSidebarForViewport(true);
    window.addEventListener("resize", () => this.forceSidebarForViewport(false));

    // DỪNG LẠI CHỜ DỮ LIỆU ĐẾN. Nếu Auth Guard chưa tải CSV, luồng sẽ bị treo chờ ở đây (điều này có chủ ý)
    await this.waitForDataManager();

    // Load data khi có tín hiệu Tải xong
    await this.loadData();

    this.switchView(this.currentView);
    this.updateResultCount();

    // ===== URL STATE SYNC (Short URL QR Routing) =====
    const qParam = _savedQParam;
    if (qParam) {
      const tryOpenDetail = () => {
        if (window.DetailPanel && typeof window.DetailPanel.open === 'function') {
          const typeCode = qParam.charAt(0).toUpperCase();
          const idCode = qParam.substring(1).trim().toUpperCase();
          let targetItem = null;
          let targetKind = '';
          
          if (typeCode === 'M') {
            targetKind = 'mold';
            targetItem = this.allItems.find(i => {
              const mId = String(i.MoldID || '').trim().toUpperCase();
              const mCode = String(i.MoldCode || '').trim().toUpperCase();
              return mId === idCode || mCode === idCode;
            });
          } else if (typeCode === 'C') {
            targetKind = 'cutter';
            targetItem = this.allItems.find(i => {
              const cId = String(i.CutterID || '').trim().toUpperCase();
              const cCode = String(i.CutterCode || '').trim().toUpperCase();
              const cNo = String(i.CutterNo || '').trim().toUpperCase();
              return cId === idCode || cCode === idCode || cNo === idCode;
            });
          }
          
          if (targetItem) {
            window.DetailPanel.open(targetItem, targetKind);
            // Chùi sạch URL sau khi mở (SPA behavior)
            try {
              const cleanUrl = new URL(window.location.href);
              cleanUrl.searchParams.delete('q');
              window.history.replaceState({}, document.title, cleanUrl.toString());
            } catch (e) {
              console.warn('[SPA Routing] Không thể dọn dẹp URL trên môi trường hiện tại:', e);
            }
          } else {
            console.warn('[SPA Routing] Không tìm thấy thiết bị từ tham số q=', qParam);
          }
        } else {
          // Retry if DetailPanel is not yet parsed
          setTimeout(tryOpenDetail, 50);
        }
      };
      tryOpenDetail();
    }

    // Re-render pagination when viewport changes (3 pages <-> 7 pages)

    this._lastPaginationMode = null;



    const onViewportChanged = () => {

      // Bạn đang dùng breakpoint nào thì dùng đúng breakpoint đó:

      // - Nếu chỉ mobile: 768

      // - Nếu narrow: 1024

      const isNarrow = window.matchMedia('(max-width: 1024px)').matches;



      // Chỉ render lại khi mode đổi để tránh gọi quá nhiều

      if (this._lastPaginationMode === isNarrow) return;

      this._lastPaginationMode = isNarrow;



      this.updatePagination(); // updatePagination() sẽ gọi renderPagination() đúng currentPage/totalPages

    };



    window.addEventListener('resize', onViewportChanged);

    onViewportChanged();





    console.log('✅ App initialized successfully');

    console.log(`📊 Total items: ${this.allItems.length}`);

  }



  /**

   * Wait for DataManager to be ready

   */

  waitForDataManager() {

    return new Promise((resolve) => {

      if (window.DataManager && window.DataManager.isReady) {

        resolve();

      } else {

        document.addEventListener('data-manager:ready', () => {

          resolve();

        });

      }

    });

  }



  /**

   * Load data from DataManager

   */

  async loadData() {

    try {

      console.log('📊 Loading data...');

      if (window.DataManager) {

        this.allItems = window.DataManager.getAllItems();

        this.filteredItems = this.sortForCardView([...this.allItems]);

        console.log(`✅ Loaded ${this.allItems.length} items`);



        // Log data structure for debugging

        if (this.allItems.length > 0) {

          console.log('Sample item:', this.allItems[0]);

        }



        // Fix: Auto re-apply filters & search so it doesn't reset to empty view

        if (this.searchQuery || this.selectedCategory !== 'all') {

          this.applyFilters();

        }

      } else {

        console.warn('⚠️ DataManager not available, using empty data');

        this.allItems = [];

        this.filteredItems = [];

      }

    } catch (error) {

      console.error('❌ Error loading data:', error);

      this.allItems = [];

      this.filteredItems = [];

    }

  }



  /**

   * Initialize UI components

   */

  initComponents() {

    // NEW: Initialize SearchModule

    if (window.SearchModule) {

      this.searchModule = new SearchModule({

        historyMaxSize: 20,

        suggestionMaxSize: 10,

        searchDelay: 300

      });

      this.searchModule.init();

      console.log('✅ SearchModule initialized');

    } else {

      console.warn('⚠️ SearchModule not available, using basic search');

    }



    // Card Renderer (v8.0.4)

    this.cardRenderer = new ResultsCardRenderer('cardView');

    this.cardRenderer.onItemClick = (item) => this.handleItemClick(item);

    this.cardRenderer.onSelectionChange = (selected) => this.handleSelectionChange(selected);



    // Table Renderer (v8.0.4-4)

    this.tableRenderer = new ResultsTableRenderer('tableView');

    this.tableRenderer.onItemClick = (item) => this.handleItemClick(item);

    this.tableRenderer.onSelectionChange = (selected) => this.handleSelectionChange(selected);



    // Detail Panel (v8.0.3-1)

    //this.detailPanel = new DetailPanel('detailPanel');



    // Mobile Navbar (v8.0.3-1)

    this.mobileNavbar = new MobileNavbar('mobileNavbar');



    // Restore search session

    try {

      const searchInput = document.getElementById('searchInput');

      const savedQuery = sessionStorage.getItem('moldSearchQuery_v8');



      // Lấy keyword: Ưu tiên giá trị mà browser tự rollback trên UI (nếu có), nếu không có thì lấy từ session.

      let finalQuery = '';

      if (searchInput && searchInput.value.trim()) {

        finalQuery = searchInput.value.trim();

      } else if (savedQuery) {

        finalQuery = savedQuery;

      }



      if (finalQuery) {

        this.searchQuery = finalQuery;

        if (searchInput) {

          searchInput.value = finalQuery;

          const clearBtn = document.querySelector('.clear-btn');

          if (clearBtn) clearBtn.style.display = 'flex';

        }

        if (this.searchModule) {

          this.searchModule.currentQuery = finalQuery;

        }

      }



      const savedCat = sessionStorage.getItem('moldSearchCategory_v8');

      if (savedCat) {

        this.selectedCategory = savedCat;

        const categoryDropdown = document.getElementById('categoryDropdown');

        if (categoryDropdown) categoryDropdown.value = savedCat;

      }



      if (finalQuery || savedCat) {

        // Debounce small delay in case child modules are still waking up

        setTimeout(() => this.applyFilters(), 100);

      }

    } catch (e) { }



    // Update initial counts

    this.updateCategoryDropdown();



    this.installPhotoMenus();



  }



  /**

   * Attach event listeners

   */

  attachEventListeners() {

    // NEW: Listen to SearchModule events

    document.addEventListener('searchPerformed', (e) => {

      this.searchQuery = e.detail.query || '';

      this.applyFilters();

    });

    // Nhận kết quả đã lọc/sắp xếp từ bảng (TableRenderer)

    const _handleTableFiltered = (e) => {

      const detail = (e && e.detail) ? e.detail : {};



      // 1) Cập nhật mảng filteredItems để khi chuyển sang view thẻ dùng lại (kể cả 0 kết quả)

      if (Array.isArray(detail.results)) {

        this.filteredItems = detail.results;

      }



      // 2) Update số lượng kết quả ngay (table đã tự render, App chỉ cập nhật count)

      this.updateResultCount();



      // 3) Đồng bộ sort sang FilterModule (chỉ để UI sidebar hiển thị đúng)

      //    Lưu ý: FilterModule.setState() sẽ bắn event 'filterapplied', nên App phải bỏ qua 1 lần

      if (window.FilterModule && typeof window.FilterModule.setState === 'function') {

        const map = {

          productionDate: 'productionDate',

          date: 'productionDate',

          id: 'id',

          code: 'code',

          dimensions: 'size',

          location: 'location',

          company: 'company'

        };



        const sortCol = detail.sortColumn == null ? 'productionDate' : detail.sortColumn;

        const field = map[sortCol];

        if (field) {

          this._ignoreNextFilterApplied = true;

          window.FilterModule.setState({

            sort: {

              field,

              direction: detail.sortDirection || 'desc'

            },

            silent: true

          });



        }

      }

    };



    // Renderer v8.0.4-9 đang bắn event 'tablefiltered'

    document.addEventListener('tablefiltered', _handleTableFiltered);



    // Nhận tín hiệu Data mới gián tiếp ở Nền (Auto-Sync)
    document.addEventListener('data-manager:updated', () => {
      console.log('🔄 App: Phát hiện Background Sync lấy Data mới, tự động render lại...');
      this.loadData().then(() => {
        // Render đè không giật trang
        if (!this.searchQuery && this.selectedCategory === 'all') {
          this.switchView(this.currentView);
        } else {
          this.applyFilters();
        }
      });
    });

    // Giữ tương thích nếu có code cũ bắn 'table:filtered'

    document.addEventListener('table:filtered', _handleTableFiltered);



    // Nhận kết quả lọc/sắp xếp từ Sidebar (FilterModule)

    document.addEventListener('filterapplied', (e) => {



      const detail = (e && e.detail) ? e.detail : {};



      // 1) Cập nhật danh sách base (FilterModule đã lọc từ Sidebar)

      if (Array.isArray(detail.results)) {

        this._lastFilterResults = detail.results;

      } else {

        this._lastFilterResults = [...this.allItems];

      }



      // 2) Đồng bộ category (dropdown phía trên)

      this.selectedCategory = detail.category || 'all';

      const categoryDropdown = document.getElementById('categoryDropdown');

      if (categoryDropdown) categoryDropdown.value = this.selectedCategory;



      // 3) Đồng bộ table state để bảng hiển thị cùng kiểu sort

      if (this.tableRenderer && detail.sort) {

        const field = detail.sort.field;

        const dir = detail.sort.direction || 'desc';



        // Reset filter cột của bảng để tránh bảng lọc thêm 1 lớp làm lệch với thẻ

        this.tableRenderer.columnFilters = {};



        // productionDate là sort mặc định của bảng (sortColumn = null)

        if (field === 'productionDate') {

          this.tableRenderer.sortColumn = null;

          this.tableRenderer.sortDirection = dir;

        } else if (field === 'id') {

          this.tableRenderer.sortColumn = 'id';

          this.tableRenderer.sortDirection = dir;

        } else if (field === 'code') {

          this.tableRenderer.sortColumn = 'code';

          this.tableRenderer.sortDirection = dir;

        } else if (field === 'size') {

          this.tableRenderer.sortColumn = 'dimensions';

          this.tableRenderer.sortDirection = dir;

        } else if (field === 'location') {

          this.tableRenderer.sortColumn = 'location';

          this.tableRenderer.sortDirection = dir;

        } else {

          // field khác thì giữ nguyên sortColumn hiện tại của bảng

          this.tableRenderer.sortDirection = dir;

        }

      }



      // 4) Tái áp dụng Search trên nền kết quả của Sidebar

      this.currentPage = 1;

      this.applyFilters();

    });



    // Search input (fallback if SearchModule not available)

    const searchInput = document.getElementById('searchInput');

    if (searchInput && !this.searchModule) {

      searchInput.addEventListener('input', (e) => {

        this.searchQuery = e.target.value;

        this.applyFilters();

      });

    }



    // Clear search button

    const clearBtn = document.querySelector('.clear-btn');

    if (clearBtn) {

      clearBtn.addEventListener('click', () => {

        this.clearSearch();

      });

    }



    // Refresh Data button (Hard Reload for Phase 39)

    const refreshBtn = document.getElementById('refreshDataBtn');

    if (refreshBtn) {

      refreshBtn.addEventListener('click', () => {

        window.location.reload(true);

      });

    }



    // Category dropdown

    const categoryDropdown = document.getElementById('categoryDropdown');

    if (categoryDropdown) {

      categoryDropdown.addEventListener('change', (e) => {

        this.selectedCategory = e.target.value;

        this.applyFilters();

      });

    }



    // View toggle buttons

    const viewBtns = document.querySelectorAll('.view-toggle-btn');

    viewBtns.forEach(btn => {

      btn.addEventListener('click', () => {

        const view = btn.dataset.view || 'card';

        this.switchView(view);

      });

    });



    // Sidebar toggle

    const sidebarToggle = document.querySelector('.sidebar-toggle');

    if (sidebarToggle) {

      sidebarToggle.addEventListener('click', () => {

        this.toggleSidebar();

      });

    }



    // Tự động thu gọn sidebar khi click bên ngoài

    document.addEventListener('click', (e) => {

      const sidebar = document.getElementById('sidebar');

      const toggleBtn = document.querySelector('.sidebar-toggle');

      if (!sidebar) return;



      const isMobile = window.innerWidth <= 768;

      const clickedInsideSidebar = sidebar.contains(e.target);

      const clickedToggleBtn = toggleBtn && toggleBtn.contains(e.target);

      const mobileNavbar = document.getElementById('mobileNavbar');

      const clickedMobileNavbar = mobileNavbar && mobileNavbar.contains(e.target);



      if (!clickedInsideSidebar && !clickedToggleBtn && !clickedMobileNavbar) {

        if (isMobile && sidebar.classList.contains('open')) {

          sidebar.classList.remove('open');

          this.updateSidebarIcon();

        } else if (!isMobile && !sidebar.classList.contains('collapsed')) {

          sidebar.classList.add('collapsed');

          this.updateSidebarIcon();

          try { localStorage.setItem(SIDEBAR_STATE_KEY, "1"); } catch (e) { }

        }

      }

    });



    // Swipe down to open virtual keyboard

    let resultSwipeStartY = -1;

    let resultSwipeStartX = 0;

    let resultSwipeStartTime = 0;

    document.addEventListener('touchstart', (e) => {

      const resultContainer = e.target.closest('.table-scroll-container, .mold-grid');

      // Chỉ hoạt động trên mobile/tablet landscape

      if (resultContainer && window.innerWidth <= 1024) {

        // Trigger chỉ khi scroll đang ở top

        if (resultContainer.scrollTop <= 0) {

          resultSwipeStartY = e.touches[0].clientY;

          resultSwipeStartX = e.touches[0].clientX;

          resultSwipeStartTime = Date.now();

        } else {

          resultSwipeStartY = -1;

        }

      } else {

        resultSwipeStartY = -1;

      }

    }, { passive: true });



    document.addEventListener('touchend', (e) => {

      if (resultSwipeStartY === -1) return;



      const resultContainer = e.target.closest('.table-scroll-container, .mold-grid');

      if (resultContainer) {

        const dy = e.changedTouches[0].clientY - resultSwipeStartY;

        const dx = Math.abs(e.changedTouches[0].clientX - resultSwipeStartX);

        const dt = Date.now() - resultSwipeStartTime;



        // Kéo xuống nhanh: thời gian ngắn, dy xuống sâu, dx ngang ít

        if (dy > 60 && dx < 50 && dt < 500) {

          if (window.VirtualKeyboardModule && typeof window.VirtualKeyboardModule.open === 'function') {

            const searchInput = document.getElementById('searchInput');

            window.VirtualKeyboardModule.open(searchInput);

          }

        }

      }

    }, { passive: true });



    // Thêm tính năng vuốt Sidebar tương tác bám theo ngón tay trên mobile

    let touchStartX = 0;

    let touchStartY = 0;

    let currentX = 0;

    let isSwipingSidebar = false;

    let sidebarOpenAtStart = false;



    document.addEventListener('touchstart', (e) => {

      // Chỉ hoạt động trên mobile

      if (window.innerWidth > 768) return;

      if (e.touches.length !== 1) return;



      // Nếu chạm vào thanh resize (nếu có ở giao diện mở rộng)

      if (e.target.closest('.resize-handle')) return;



      // Kiểm tra xem sự kiện vuốt có đang xảy ra bên trong popup, panel, gallery không

      const isInsidePanel = e.target.closest('#detailPanel, #filterDrawer, .filter-fullscreen-modal, .modal, .photo-detail-modal, .app-modal, .lightgallery');

      if (isInsidePanel) return;



      const sidebarEl = document.getElementById('sidebar');

      if (!sidebarEl) return;



      touchStartX = e.touches[0].clientX;

      touchStartY = e.touches[0].clientY;

      currentX = touchStartX;

      sidebarOpenAtStart = sidebarEl.classList.contains('open');



      // Tránh cản trở cuộn ngang của bảng table

      const isTargetScrollable = e.target.closest('.table-scroll-container') || e.target.closest('table');

      const maxEdge = isTargetScrollable ? 25 : 60; // Gần sát cạnh trái



      // Quy tắc Mở: bắt đầu từ mép trái màn hình

      if (!sidebarOpenAtStart && touchStartX > maxEdge) {

        return;

      }



      // Quy tắc Đóng: Vuốt từ trong vùng của Sidebar

      if (sidebarOpenAtStart && touchStartX > 260) {

        return;

      }



      isSwipingSidebar = true;

      // Tắt transition CSS để kéo theo ngón tay mượt mà không bị delay

      sidebarEl.style.transition = 'none';

    }, { passive: true });



    document.addEventListener('touchmove', (e) => {

      if (!isSwipingSidebar) return;



      // Nhường quyền vuốt cho Panel nếu nó đang xin (VD: vuốt đóng DetailPanel)

      if (window._panelClosingSwipe) {

        isSwipingSidebar = false;

        const sidebarEl = document.getElementById('sidebar');

        if (sidebarEl) sidebarEl.style.transition = '';

        return;

      }



      currentX = e.touches[0].clientX;

      const currentY = e.touches[0].clientY;

      const dx = currentX - touchStartX;

      const dy = currentY - touchStartY;



      // Nếu vuốt chéo/dọc thiên về Y -> Hủy thao tác vuốt ngang sidebar

      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 15) {

        isSwipingSidebar = false;

        const sidebarEl = document.getElementById('sidebar');

        if (sidebarEl) {

          sidebarEl.style.transform = '';

          sidebarEl.style.transition = '';

        }

        return;

      }



      const sidebarEl = document.getElementById('sidebar');

      if (!sidebarEl) return;



      let tx = 0;

      const sw = sidebarEl.offsetWidth || 240;



      if (!sidebarOpenAtStart) {

        // Đang đóng: Kéo từ trái sang phải

        tx = Math.max(-sw, Math.min(0, dx - sw));

      } else {

        // Đang mở: Kéo từ phải sang trái

        tx = Math.min(0, Math.max(-sw, dx));

      }



      sidebarEl.style.transform = `translateX(${tx}px)`;



      if (Math.abs(dx) > 10) {

        window._sidebarSwiping = true;

      }

    }, { passive: true });



    document.addEventListener('touchend', (e) => {

      if (!isSwipingSidebar) return;

      isSwipingSidebar = false;



      setTimeout(() => { window._sidebarSwiping = false; }, 50);



      const sidebarEl = document.getElementById('sidebar');

      if (!sidebarEl) return;



      sidebarEl.style.transition = ''; // Bật lại hệ thống transition Animation CSS

      sidebarEl.style.transform = ''; // Nhường lại kiểm soát transform cho class



      const dx = currentX - touchStartX;



      if (!sidebarOpenAtStart) {

        // Chốt Mở nếu kéo đủ sâu vào > 70px

        if (dx > 70) {

          sidebarEl.classList.add('open');

          this.updateSidebarIcon();

        }

      } else {

        // Chốt Đóng nếu kéo ngược trái > 50px

        if (dx < -50) {

          sidebarEl.classList.remove('open');

          this.updateSidebarIcon();

        }

      }

    }, { passive: true });



    // ==========================================

    // GLOBAL MODAL SWIPE-TO-CLOSE INTERCEPTOR

    // ==========================================

    let gmTouchStartX = 0;

    let gmTouchStartY = 0;

    let gmCurrentX = 0;

    let gmTargetModal = null;

    let gmIsSwiping = false;



    document.addEventListener('touchstart', (e) => {

      if (e.touches.length !== 1) return;



      const modalTrigger = e.target.closest('.app-modal, .modal, .mcs-qv-backdrop');

      if (!modalTrigger) return;



      // Không can thiệp nếu là sidebar, filterDrawer

      if (e.target.closest('#sidebar') || e.target.closest('#filterDrawer')) return;



      const isScrollable = e.target.closest('table, .table-scroll-container, .table-wrapper, select, input, textarea, .scrollable-y');



      gmTouchStartX = e.touches[0].clientX;

      gmTouchStartY = e.touches[0].clientY;

      gmCurrentX = gmTouchStartX;



      // Nếu là QuickPhotoViewer và đang Zoom -> không can thiệp vuốt đóng

      const qvBody = modalTrigger.querySelector('.mcs-qv-body');

      const isZoomed = qvBody && qvBody.classList.contains('zoomed');



      if (!isScrollable && !isZoomed && gmTouchStartX < (window.innerWidth / 2)) {

        gmIsSwiping = true;

        // Nếu modalTrigger có chứa container con thiết kế riêng biệt (như .mcs-qv) thì mượn cái block con trượt

        // Còn không thì trượt luôn toàn bộ khối Modal

        gmTargetModal = modalTrigger.querySelector('.mcs-qv, .modal-content, .app-modal-content') || modalTrigger;

        gmTargetModal.style.transition = 'none';

        window._isGlobalModalSwipe = true;

      }

    }, { passive: true });



    document.addEventListener('touchmove', (e) => {

      if (!gmIsSwiping || !gmTargetModal || e.touches.length !== 1) return;



      gmCurrentX = e.touches[0].clientX;

      const dy = e.touches[0].clientY - gmTouchStartY;

      const dx = gmCurrentX - gmTouchStartX;



      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 15) {

        gmIsSwiping = false;

        gmTargetModal.style.transform = '';

        gmTargetModal.style.transition = '';

        return;

      }



      if (dx > 0) {

        window._modalClosingSwipe = true;

        gmTargetModal.style.transform = `translateX(${dx}px)`;

      }

    }, { passive: true });



    document.addEventListener('touchend', (e) => {

      if (!gmIsSwiping || !gmTargetModal) return;

      gmIsSwiping = false;



      setTimeout(() => {

        window._modalClosingSwipe = false;

        window._isGlobalModalSwipe = false;

      }, 100);



      gmTargetModal.style.transition = '';

      gmTargetModal.style.transform = '';



      const dx = gmCurrentX - gmTouchStartX;

      if (dx > 80) {

        // Tìm close button chuẩn để giả lập click

        let closeBtn = gmTargetModal.querySelector('.btn-close, .app-modal-close, [data-mcs-qv-close], .close-btn, .modal-close');



        // Nếu targetModal không tự chứa closeBtn, tìm ngược lên parent

        if (!closeBtn && gmTargetModal.parentElement) {

          closeBtn = gmTargetModal.parentElement.querySelector('.btn-close, .app-modal-close, [data-mcs-qv-close], .close-btn, .modal-close');

        }



        if (closeBtn) {

          closeBtn.click();

        } else {

          // Fallback nếu không thiết kế class nút close chuẩn thì clear cả cội

          const rootModal = e.target.closest('.app-modal, .modal, .mcs-qv-backdrop');

          if (rootModal) rootModal.style.display = 'none';

        }

      }

      gmTargetModal = null;

    }, { passive: true });



    // Filter toggle

    const filterToggle = document.querySelector('.filter-toggle');

    if (filterToggle) {

      filterToggle.addEventListener('click', () => {

        this.toggleFilter();

      });

    }



    // Action buttons

    const printBtn = document.querySelector('.btn-print');

    if (printBtn) {

      printBtn.addEventListener('click', () => {

        if (window.PrintExportModule && typeof window.PrintExportModule.openDialog === 'function') {

          window.PrintExportModule.openDialog(Array.from(this.selectedIds), this.filteredItems);

        } else {

          alert('Chức năng In chưa được cấu hình đầy đủ!');

        }

      });

    }



    const inventoryBtn = document.querySelector('.btn-inventory');

    if (inventoryBtn) {

      inventoryBtn.addEventListener('click', () => this.handleInventory());

    }



    const resetAllBtn = document.querySelector('.btn-reset-all');

    if (resetAllBtn) {

      resetAllBtn.addEventListener('click', () => this.resetAll());

    }



    // Toggle dropdown Action Buttons trên Mobile

    const mobileActionsBtn = document.getElementById('mobileActionsBtn');

    const actionButtonsList = document.getElementById('actionButtonsList');

    if (mobileActionsBtn && actionButtonsList) {

      mobileActionsBtn.addEventListener('click', (e) => {

        e.preventDefault();

        e.stopPropagation();

        const isShowing = actionButtonsList.classList.contains('show');

        if (isShowing) {

          actionButtonsList.classList.remove('show');

        } else {

          actionButtonsList.classList.add('show');

        }

      });



      // Tự động đóng popup actions khi click ra ngoài

      document.addEventListener('click', (e) => {

        if (!actionButtonsList.contains(e.target) && !mobileActionsBtn.contains(e.target)) {

          actionButtonsList.classList.remove('show');

        }

      });

    }



    // Single Toggle Select button

    const btnToggleSelect = document.getElementById('btnToggleSelect');

    if (btnToggleSelect) {

      btnToggleSelect.addEventListener('click', () => {

        const hasSelected = window.selectedCodes && window.selectedCodes.length > 0;

        if (hasSelected) {

          this.deselectAll();

        } else {

          this.selectAll();

        }

      });

    }



    // QR Scanner button (for both desktop search bar and mobile bottom nav)

    const qrBtns = document.querySelectorAll('.qr-btn, .qr-nav-btn, .mcs-qr-trigger');

    qrBtns.forEach(btn => {

      btn.addEventListener('click', (e) => {

        e.preventDefault();

        this.openQRScanner();

      });

    });



    // Listen to quick action events (from cards)

    document.addEventListener('quick-action', (e) => {

      this.handleQuickAction(e.detail.action, e.detail.item);

    });

  }







  // ========================================================================

  // Sorting helpers (Card view needs default sort like Table)

  // ========================================================================



  naturalCompare(a, b) {

    const ax = [];

    const bx = [];

    String(a).replace(/(\d+)|(\D+)/g, (_, $1, $2) => {

      ax.push([$1 ? parseInt($1, 10) : Infinity, $2 || '']);

    });

    String(b).replace(/(\d+)|(\D+)/g, (_, $1, $2) => {

      bx.push([$1 ? parseInt($1, 10) : Infinity, $2 || '']);

    });

    while (ax.length && bx.length) {

      const an = ax.shift();

      const bn = bx.shift();

      const diff = (an[0] - bn[0]) || an[1].localeCompare(bn[1]);

      if (diff) return diff;

    }

    return ax.length - bx.length;

  }



  getItemId(item) {

    return item.type === 'mold'

      ? (item.MoldID || item.displayCode || item.MoldCode || '')

      : (item.CutterID || item.displayCode || item.CutterNo || '');

  }



  getItemCode(item) {

    return item.type === 'mold' ? (item.MoldCode || '') : (item.CutterNo || '');

  }



  getItemLocation(item) {

    return item.displayRackLocation || item.location || item.rackNo || '';

  }



  getItemCompany(item) {

    return item.displayStorageCompany || item.company || '';

  }



  getItemSize(item) {

    return item.displaySize || item.Size || item.Dimensions || item.dimensions || '';

  }



  getItemProductionDate(item) {

    return item.ProductionDate || item.displayDate || '';

  }



  getSidebarSortPref() {

    // Default giống bảng: Ngày chế tạo giảm dần

    const fallback = { field: 'productionDate', direction: 'desc' };



    try {

      if (window.FilterModule && typeof window.FilterModule.getState === 'function') {

        const st = window.FilterModule.getState() || {};

        if (st.sort && st.sort.field) {

          return { field: st.sort.field, direction: st.sort.direction || 'desc' };

        }

      }

    } catch (e) {

      // Ignore

    }



    return fallback;

  }



  sortForCardView(items) {

    const pref = this.getSidebarSortPref();

    const field = pref.field;

    const dir = (pref.direction || 'desc').toLowerCase();

    const mul = dir === 'asc' ? 1 : -1;



    const arr = Array.isArray(items) ? items.slice() : [];



    return arr.sort((a, b) => {

      if (field === 'productionDate') {

        const aVal = this.getItemProductionDate(a);

        const bVal = this.getItemProductionDate(b);

        const aTime = aVal ? new Date(aVal).getTime() : new Date('1900-01-01').getTime();

        const bTime = bVal ? new Date(bVal).getTime() : new Date('1900-01-01').getTime();

        return mul * (aTime - bTime);

      }



      if (field === 'id') {

        return mul * this.naturalCompare(this.getItemId(a), this.getItemId(b));

      }



      if (field === 'code') {

        return mul * this.naturalCompare(this.getItemCode(a), this.getItemCode(b));

      }



      if (field === 'location') {

        return mul * this.naturalCompare(this.getItemLocation(a), this.getItemLocation(b));

      }



      if (field === 'company') {

        return mul * String(this.getItemCompany(a)).localeCompare(String(this.getItemCompany(b)), 'ja');

      }



      if (field === 'size') {

        const parseDim = (item) => {

          let l = 0, w = 0;

          if (item.designInfo) {

            const dl = parseFloat(item.designInfo.MoldDesignLength || item.designInfo.Length);

            const dw = parseFloat(item.designInfo.MoldDesignWidth || item.designInfo.Width);

            if (!isNaN(dl)) l = dl;

            if (!isNaN(dw)) w = dw;

          }

          if (!l && !w) {

            const s = String(this.getItemSize(item));

            const parts = s.split(/[xX\-\~*]/);

            if (parts.length > 0) l = parseFloat(parts[0]) || 0;

            if (parts.length > 1) w = parseFloat(parts[1]) || 0;

          }

          return { l, w };

        };

        const dA = parseDim(a);

        const dB = parseDim(b);

        if (dA.l !== dB.l) return mul * (dA.l - dB.l);

        return mul * (dA.w - dB.w);

      }



      // Unknown field -> không đổi

      return 0;

    });

  }



  /**

     * Apply filters (search + category)

     * NEW: Use SearchModule.searchItems() for advanced search

     */

  applyFilters() {

    // Kế thừa kết quả từ bộ lọc Sidebar nếu có, không thì duyệt toàn bộ list

    let filtered = this._lastFilterResults ? [...this._lastFilterResults] : [...this.allItems];



    // Category filter

    if (this.selectedCategory !== 'all') {

      filtered = filtered.filter(item => item.type === this.selectedCategory);

    }



    // Search filter - NEW: Use SearchModule

    if (this.searchQuery.trim()) {

      if (this.searchModule) {

        // Use advanced multi-keyword search

        filtered = this.searchModule.searchItems(filtered, this.searchQuery, this.selectedCategory);



        // Update history with result count

        const query = this.searchQuery.trim();

        if (query) {

          this.searchModule.addToHistory(query, filtered.length);

        }

      } else {

        // Fallback to basic search

        const query = this.searchQuery.toLowerCase().trim();

        filtered = filtered.filter(item => {

          const code = (item.type === 'mold' ?

            (item.MoldCode || '') :

            (item.CutterNo || '')).toLowerCase();



          let name = '';

          if (item.designInfo && item.designInfo.TrayInfoForMoldDesign) {

            name = item.designInfo.TrayInfoForMoldDesign.toLowerCase();

          } else {

            name = (item.type === 'mold' ?

              (item.MoldName || '') :

              (item.CutterName || item.CutterDesignName || '')).toLowerCase();

          }



          const location = (item.location || item.rackNo || '').toLowerCase();

          const company = (item.company || '').toLowerCase();



          return code.includes(query) ||

            name.includes(query) ||

            location.includes(query) ||

            company.includes(query);

        });

      }

    }



    filtered = this.sortForCardView(filtered);

    this.filteredItems = filtered;

    this.currentPage = 1;



    // Save to session

    try {

      sessionStorage.setItem('moldSearchQuery_v8', this.searchQuery || '');

      sessionStorage.setItem('moldSearchCategory_v8', this.selectedCategory || 'all');

    } catch (e) { }



    this.updateUI();

  }



  /**

   * Clear search

   */

  clearSearch() {

    this.searchQuery = '';

    const searchInput = document.getElementById('searchInput');

    if (searchInput) {

      searchInput.value = '';

    }



    // Clear SearchModule if available

    if (this.searchModule) {

      this.searchModule.clearSearch();

    }



    try {

      sessionStorage.removeItem('moldSearchQuery_v8');

    } catch (e) { }



    this.applyFilters();

  }



  /**

   * Switch view (card/table)

   */

  switchView(view) {

    // Sync page before switching

    if (view === 'table' && this.cardRenderer) {

      this.currentPage = this.cardRenderer.currentPage || 1;

    } else if (view === 'card' && this.tableRenderer) {

      this.currentPage = this.tableRenderer.currentPage || 1;

    }



    this.currentView = view;



    // Update view toggle buttons

    const viewBtns = document.querySelectorAll('.view-toggle-btn');

    viewBtns.forEach(btn => {

      const btnView = btn.dataset.view || 'card';

      btn.classList.toggle('active', btnView === view);

    });



    // Show/hide views & pagination

    const cardView = document.getElementById('cardView');

    const tableView = document.getElementById('tableView');

    const cardPagination = document.querySelector('.pagination-card');

    const tablePagination = document.querySelector('.pagination-table');

    const rc = document.querySelector('.results-container');

    const resultCountBox = document.querySelector('.result-count');





    if (view === 'card') {

      if (cardView) cardView.style.display = 'grid';

      if (tableView) tableView.style.display = 'none';

      if (cardPagination) cardPagination.classList.add('active');

      if (tablePagination) tablePagination.classList.remove('active');

      // Card view: trả layout về như cũ (không ảnh hưởng card grid)

      if (rc) {

        rc.style.display = '';

        rc.style.flexDirection = '';

        rc.style.minHeight = '';

        rc.style.overflow = '';

      }

      if (tableView) {

        tableView.style.flex = '';

        tableView.style.minHeight = '';

        tableView.classList.remove('active');

      }



      // Hiện bộ đếm phía trên (nếu bạn vẫn muốn thấy ở card)

      if (resultCountBox) resultCountBox.style.display = '';



    } else {

      if (cardView) cardView.style.display = 'none';

      if (tableView) {

        tableView.style.display = 'flex';

        tableView.classList.add('active');

      }

      // Table view: ép khung chứa thành flex-column và khóa scroll ở ngoài,

      // để bảng tự cuộn trong .table-scroll-container => sticky header + scrollbar ngang "đúng chỗ"

      // Table view: cho cuộn dọc ở results-container giống card

      if (rc) {

        rc.style.display = "flex";

        rc.style.flexDirection = "column";

        rc.style.minHeight = 0;



        // QUAN TRỌNG: không khóa cuộn dọc nữa

        rc.style.overflowY = "auto";

        rc.style.overflowX = "hidden";

      }



      if (tableView) {

        // Không ép tableView phải chiếm full-height nữa (tránh tạo “khung” gây kẹt cuộn)

        tableView.style.flex = "0 0 auto";

        tableView.style.minHeight = "";

      }





      // Ẩn bộ đếm phía trên vì bảng đã có bộ đếm trong pagination

      if (resultCountBox) resultCountBox.style.display = 'none';



      if (cardPagination) cardPagination.classList.remove('active');

      if (tablePagination) tablePagination.classList.add('active');

    }



    // Re-render with synced page

    this.renderResults();

  }



  /**

   * Toggle sidebar

   */

  toggleSidebar() {

    const sidebar = document.getElementById('sidebar');

    if (!sidebar) return;



    const isMobile = window.innerWidth <= 768;



    if (isMobile) {

      sidebar.classList.toggle('open');

      sidebar.classList.remove('collapsed');

      this.updateSidebarIcon();

      return;

    }



    sidebar.classList.remove("open");



    const isCollapsed = sidebar.classList.toggle("collapsed");



    try {

      localStorage.setItem(SIDEBAR_STATE_KEY, isCollapsed ? "1" : "0");

    } catch (e) { }



    this.updateSidebarIcon();

  }



  updateSidebarIcon() {

    const sidebar = document.getElementById('sidebar');

    const icon = document.querySelector('.sidebar-toggle i');

    if (!sidebar || !icon) return;



    const isMobile = window.innerWidth <= 768;

    const isOpen = isMobile ? sidebar.classList.contains('open') : !sidebar.classList.contains('collapsed');



    icon.className = isOpen ? 'fas fa-chevron-left' : 'fas fa-chevron-right';

  }



  forceSidebarForViewport(isInitCall) {

    const sidebar = document.getElementById("sidebar");

    if (!sidebar) return;



    const isMobile = window.innerWidth < 768;



    // Chỉ xử lý khi mode thay đổi (mobile <-> desktop) hoặc lần init

    if (!isInitCall && this._lastIsMobile === isMobile) return;

    this._lastIsMobile = isMobile;



    if (isMobile) {

      // Mobile: luôn bỏ collapsed, dùng open / mobile-closed

      sidebar.classList.remove("collapsed");

      sidebar.classList.add("mobile-closed");

      sidebar.classList.remove("open");

      return;

    }



    // Desktop/Tablet: bỏ trạng thái mobile

    sidebar.classList.remove("mobile-closed");

    sidebar.classList.remove("open");



    // Restore đúng 1 lần sau khi vào desktop

    if (!this._sidebarRestoredOnce) {

      this._sidebarRestoredOnce = true;

      this.restoreSidebarState();

    }

    this.updateSidebarIcon();

  }



  restoreSidebarState() {

    const sidebar = document.getElementById('sidebar');

    if (!sidebar) return;



    // Mặc định: thu gọn nếu chưa có gì trong localStorage

    let collapsed = true;

    try {

      const saved = localStorage.getItem(SIDEBAR_STATE_KEY);

      if (saved === '0') {

        collapsed = false;

      }

    } catch (e) {

      console.warn('⚠️ Failed to restore sidebar state:', e);

    }



    if (collapsed) {

      sidebar.classList.add('collapsed');

    } else {

      sidebar.classList.remove('collapsed');

    }

    setTimeout(() => this.updateSidebarIcon(), 100);

  }



  /**

   * Toggle filter section

   */

  toggleFilter() {

    const filterToggle = document.querySelector('.filter-toggle');

    const filterContent = document.getElementById('filterContent');



    if (filterToggle && filterContent) {

      const isExpanded = filterContent.classList.toggle('expanded');

      filterToggle.classList.toggle('expanded', isExpanded);

    }

  }



  /**

   * Render pagination

   */

  renderPagination(currentPage, totalPages, onPageClick) {

    const selector = this.currentView === 'card' ? '.pagination-card' : '.pagination-table';

    const paginationDiv = document.querySelector(selector);

    if (!paginationDiv) return;



    this.currentPage = currentPage;



    if (totalPages <= 1) {

      paginationDiv.style.display = 'none';

      return;

    }



    paginationDiv.style.display = 'flex';

    let html = '';



    // First button

    html += '<button class="pagination-btn btn-first" ' + (currentPage === 1 ? 'disabled' : '') + '>«</button>';



    // Previous button

    html += '<button class="pagination-btn btn-prev" ' + (currentPage === 1 ? 'disabled' : '') + '>‹</button>';



    // Page numbers

    const isNarrow = window.innerWidth <= 1024;

    if (!isNarrow) {

      const maxPages = 7;

      let startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));

      let endPage = Math.min(totalPages, startPage + maxPages - 1);

      if (endPage - startPage < maxPages - 1) {

        startPage = Math.max(1, endPage - maxPages + 1);

      }

      for (let i = startPage; i <= endPage; i++) {

        html += '<button class="pagination-btn btn-page ' + (i === currentPage ? 'active' : '') + '" data-page="' + i + '">' + i + '</button>';

      }

    } else {

      const startPage = Math.max(1, currentPage - 1);

      const endPage = Math.min(totalPages, currentPage + 1);

      for (let i = startPage; i <= endPage; i++) {

        html += '<button class="pagination-btn btn-page ' + (i === currentPage ? 'active' : '') + '" data-page="' + i + '">' + i + '</button>';

      }

    }



    // Next button

    html += '<button class="pagination-btn btn-next" ' + (currentPage === totalPages ? 'disabled' : '') + '>›</button>';



    // Last button

    html += '<button class="pagination-btn btn-last" ' + (currentPage === totalPages ? 'disabled' : '') + '>»</button>';



    // Page info

    html += '<span class="pagination-info">' + currentPage + '/' + totalPages + '</span>';

    const total = (this.filteredItems || []).length;

    html += `<span class="pagination-result-count">${total} 件</span>`;





    // Jump to page

    html += '<input type="number" class="page-input" min="1" max="' + totalPages + '" value="' + currentPage + '">';

    html += '<button class="pagination-btn btn-go">→</button>';



    paginationDiv.innerHTML = html;



    // Attach events

    this.attachPaginationEvents(paginationDiv, (page) => {

      this.currentPage = page;

      onPageClick(page);

      const total = this.currentView === 'card'

        ? (this.cardRenderer?.totalPages || 1)

        : (this.tableRenderer?.totalPages || 1);

      this.renderPagination(this.currentPage, total, onPageClick);

    });

  }



  /**

   * Attach pagination events

   */

  attachPaginationEvents(container, onPageClick) {

    container.querySelector('.btn-first')?.addEventListener('click', () => {

      onPageClick(1);

    });



    container.querySelector('.btn-prev')?.addEventListener('click', () => {

      const prevPage = this.currentPage - 1;

      if (prevPage >= 1) onPageClick(prevPage);

    });



    container.querySelector('.btn-next')?.addEventListener('click', () => {

      const nextPage = this.currentPage + 1;

      const maxPage = this.currentView === 'card'

        ? this.cardRenderer?.totalPages || 1

        : this.tableRenderer?.totalPages || 1;

      if (nextPage <= maxPage) onPageClick(nextPage);

    });



    container.querySelector('.btn-last')?.addEventListener('click', () => {

      const lastPage = this.currentView === 'card'

        ? this.cardRenderer?.totalPages || 1

        : this.tableRenderer?.totalPages || 1;

      onPageClick(lastPage);

    });



    container.querySelectorAll('.btn-page').forEach(btn => {

      btn.addEventListener('click', () => {

        const page = parseInt(btn.dataset.page);

        if (page && page !== this.currentPage) {

          onPageClick(page);

        }

      });

    });



    container.querySelector('.btn-go')?.addEventListener('click', () => {

      const input = container.querySelector('.page-input');

      const page = parseInt(input.value);

      const maxPage = this.currentView === 'card'

        ? this.cardRenderer?.totalPages || 1

        : this.tableRenderer?.totalPages || 1;

      if (page >= 1 && page <= maxPage && page !== this.currentPage) {

        onPageClick(page);

      }

    });

  }



  /**

   * Update UI

   */

  updateUI() {

    this.renderResults();

    this.updateResultCount();

  }



  /**

   * Render results

   */

  renderResults() {

    if (this.currentView === 'card') {

      this.cardRenderer.render(this.filteredItems, this.currentPage);

      this.currentPage = this.cardRenderer.currentPage;

    } else {

      this.tableRenderer.currentPage = this.currentPage;

      this.tableRenderer.render(this.filteredItems);

      this.currentPage = this.tableRenderer.currentPage;

    }

    this.updatePagination();

    this.handleSelectionChange(window.selectedCodes || []);

  }



  /**

   * Update result count

   */

  updateResultCount() {

    const resultCount = document.querySelector('.result-count .count');

    if (resultCount) {

      resultCount.textContent = this.filteredItems.length;

    }

  }



  /**

   * Update category dropdown

   */

  updateCategoryDropdown() {

    const categoryDropdown = document.getElementById('categoryDropdown');

    if (!categoryDropdown) return;



    // Remove numbers and update options

    categoryDropdown.innerHTML = `

      <option value="all">全て</option>

      <option value="mold">金型</option>

      <option value="cutter">抜型</option>

    `;



    // Apply color class dynamically

    const updateDropdownClass = () => {

      categoryDropdown.classList.remove('mold-active', 'cutter-active');

      if (categoryDropdown.value === 'mold') categoryDropdown.classList.add('mold-active');

      if (categoryDropdown.value === 'cutter') categoryDropdown.classList.add('cutter-active');

    };

    categoryDropdown.addEventListener('change', updateDropdownClass);

    updateDropdownClass(); // init

  }



  /**

   * Update pagination

   */

  updatePagination() {

    if (this.currentView === 'card' && this.cardRenderer) {

      const currentPage = this.cardRenderer.currentPage || 1;

      const totalPages = this.cardRenderer.totalPages || 1;

      this.renderPagination(currentPage, totalPages, (page) => {

        this.currentPage = page;

        this.cardRenderer.currentPage = page;

        this.cardRenderer.render(this.filteredItems, page);

      });

    } else if (this.currentView === 'table' && this.tableRenderer) {

      const currentPage = this.tableRenderer.currentPage || 1;

      const totalPages = this.tableRenderer.totalPages || 1;

      this.renderPagination(currentPage, totalPages, (page) => {

        this.currentPage = page;

        this.tableRenderer.goToPage(page);

      });

    }

  }



  /**

   * Handle item click

   */

  handleItemClick(item) {

    console.log('Item clicked:', item.code || item.MoldCode || item.CutterNo);



    // Xác định itemType

    const itemType = item.type || item.itemType || 'mold';



    // Mở DetailPanel (v8.2.3)

    if (window.DetailPanel) {

      window.DetailPanel.open(item, itemType);

    } else {

      console.warn('[App] DetailPanel chưa sẵn sàng');

    }

  }





  /**

   * Handle selection change

   */

  handleSelectionChange(selectedCodes) {

    console.log('Selection changed:', selectedCodes.length);



    if (this.isSyncingSelection) return;

    this.isSyncingSelection = true;



    const ids = (selectedCodes || []).map(n => String(n).trim()).filter(n => n.length > 0);

    this.selectedIds = new Set(ids);

    window.selectedCodes = ids; // IMPORTANT: Sync global variable for toggle button



    // Sync to Card

    if (this.cardRenderer) {

      this.cardRenderer.selectedItems = new Set(ids);

      if (this.currentView === 'card' && typeof this.cardRenderer.updateCheckboxes === 'function') {

        this.cardRenderer.updateCheckboxes();

      }

    }



    // Sync to Table

    if (this.tableRenderer) {

      this.tableRenderer.selectedItems = new Set(ids);

      if (this.currentView === 'table') {

        if (typeof this.tableRenderer.renderRows === 'function') this.tableRenderer.renderRows();

        if (typeof this.tableRenderer.updateSelectAllState === 'function') this.tableRenderer.updateSelectAllState();

      }

    }



    this.isSyncingSelection = false;



    // Update selection info

    const selectionInfo = document.querySelector('.selection-info');

    if (selectionInfo) {

      if (selectedCodes.length > 0) {

        selectionInfo.style.display = 'flex';

        selectionInfo.innerHTML = selectedCodes.length + ' 件選択';

      } else {

        selectionInfo.style.display = 'none';

      }

    }



    // Update button states

    const hasSelected = selectedCodes.length > 0;

    const hasResults = this.filteredItems && this.filteredItems.length > 0;



    const btnToggleSelect = document.getElementById('btnToggleSelect');

    if (btnToggleSelect) {

      if (hasSelected) {

        // Mode: Deselect All

        btnToggleSelect.innerHTML = '<i class="far fa-square"></i> <span class="btn-text desktop-only">選択解除</span>';

        btnToggleSelect.disabled = false;

        btnToggleSelect.style.display = 'inline-flex';

        btnToggleSelect.style.borderColor = '#9ca3af';

        btnToggleSelect.style.backgroundColor = '#f3f4f6';

      } else {

        // Mode: Select All

        btnToggleSelect.innerHTML = '<i class="fas fa-check-square"></i> <span class="btn-text desktop-only">全選択</span>';

        btnToggleSelect.disabled = !hasResults;

        btnToggleSelect.style.display = hasResults ? 'inline-flex' : 'none';

        btnToggleSelect.style.borderColor = '#d1d5db';

        btnToggleSelect.style.backgroundColor = '#fff';

      }

    }



    const printBtn = document.querySelector('.btn-print');

    if (printBtn) printBtn.disabled = !hasSelected;



    const inventoryBtn = document.querySelector('.btn-inventory');

    if (inventoryBtn) inventoryBtn.disabled = !hasSelected;



    const resetBtn = document.querySelector('.btn-reset-all');

    if (resetBtn) {

      let needsReset = false;

      if (this.selectedCategory !== 'all') {

        needsReset = true;

      }

      if (this.currentView === 'table' &&

        this.tableRenderer &&

        typeof this.tableRenderer.needsReset === 'function' &&

        this.tableRenderer.needsReset()) {

        needsReset = true;

      }

      if (needsReset || (this.filteredItems && this.filteredItems.length > 0)) {

        resetBtn.disabled = false;

      } else {

        resetBtn.disabled = true;

      }

    }



    const lockBtn = document.getElementById('lockBtn');

    if (lockBtn) lockBtn.disabled = false;

  }



  installPhotoMenus() {

    try {

      this.ensureSidebarPhotoMenu();

      this.ensureMobilePhotoMenu();

    } catch (e) {

      console.warn('installPhotoMenus failed', e);

    }

  }



  openPhotoManager(initialState) {

    if (window.PhotoManagerUI && typeof window.PhotoManagerUI.open === 'function') {

      window.PhotoManagerUI.open(initialState || {});

      return;

    }

    alert('Chưa có PhotoManagerUI (photo-manager-ui-*.js). Nếu bạn muốn mình tạo file này, hãy xác nhận.');

  }



  openPhotoUploadQuick() {

    // 1) Module mới: window.PhotoUpload (photo-upload-v8.4.x.js)

    if (window.PhotoUpload && typeof window.PhotoUpload.open === "function") {

      try {

        window.PhotoUpload.open({ mode: "standalone" });

        return;

      } catch (e) {

        console.warn("PhotoUpload.open error", e);

      }

    }



    // 2) Tương thích tool cũ: PhotoUploadTool

    if (window.PhotoUploadTool) {

      try {

        if (typeof window.PhotoUploadTool.openQuick === "function") {

          window.PhotoUploadTool.openQuick();

          return;

        }

        if (typeof window.PhotoUploadTool.open === "function") {

          window.PhotoUploadTool.open({ autoOpenFile: true });

          return;

        }

      } catch (e) {

        console.warn("PhotoUploadTool error", e);

      }

    }



    // 3) Fallback cuối: PhotoAuditTool (nếu hệ thống cũ vẫn dùng)

    if (window.PhotoAuditTool) {

      try {

        if (typeof window.PhotoAuditTool.openQuick === "function") {

          window.PhotoAuditTool.openQuick();

          return;

        }

        if (typeof window.PhotoAuditTool.open === "function") {

          window.PhotoAuditTool.open();

          return;

        }

      } catch (e) {

        console.warn("PhotoAuditTool error", e);

      }

    }



    alert("Chưa nạp module Upload ảnh (photo-upload-v8.4.x.js).");

  }



  openPhotoUploadForItem(item) {

    try {

      const t = String(item?.type || item?.itemType || "mold").toLowerCase();

      const deviceType = (t === "cutter") ? "cutter" : "mold";



      const deviceId =

        deviceType === "mold"

          ? (item?.MoldID ?? item?.MoldCode ?? item?.displayCode ?? item?.code)

          : (item?.CutterID ?? item?.CutterNo ?? item?.ID ?? item?.displayCode ?? item?.code);



      const deviceCode =

        deviceType === "mold"

          ? (item?.MoldCode ?? item?.MoldID ?? "")

          : (item?.CutterNo ?? item?.CutterID ?? item?.ID ?? "");



      const deviceDims =

        item?.displayDimensions ??

        item?.displaySize ??

        item?.Dimensions ??

        item?.Size ??

        item?.dimensions ??

        "";



      // Ưu tiên module mới: window.PhotoUpload (photo-upload-v8.4.x.js)

      if (window.PhotoUpload && typeof window.PhotoUpload.open === "function" && deviceId) {

        window.PhotoUpload.open({

          mode: "device",

          deviceType,

          deviceId: String(deviceId).trim(),

          deviceCode: String(deviceCode || "").trim(),

          deviceDims: String(deviceDims || "").trim()

        });

        return;

      }

    } catch (e) {

      console.warn("openPhotoUploadForItem failed, fallback to quick", e);

    }



    // Fallback: mở chế độ nhanh (standalone)

    this.openPhotoUploadQuick();

  }



  openPhotoActionSheet() {

    const overlay = document.createElement('div');

    overlay.className = 'mcs-photo-sheet-overlay';

    overlay.setAttribute('data-mcs-photo-sheet', '1');



    overlay.innerHTML = `

      <div class="mcs-photo-sheet" role="dialog" aria-modal="true" aria-label="写真 / Ảnh">

        <div class="mcs-photo-sheet-header">

          <div class="mcs-photo-sheet-title">

            <span class="mcs-icon-circle"><i class="fas fa-images"></i></span>

            <span class="mcs-bilingual">

              <span class="mcs-ja">写真</span>

              <span class="mcs-vi">Ảnh</span>

            </span>

          </div>

          <button type="button" class="mcs-photo-sheet-close" data-pa="close-x" aria-label="Close">

            <i class="fas fa-times"></i>

          </button>

        </div>



        <div class="mcs-photo-sheet-body">

          <div class="mcs-photo-sheet-actions">

            <button type="button" class="mcs-photo-sheet-btn manager" data-pa="manager">

              <i class="fas fa-th-large"></i>

              <span class="mcs-bilingual">

                <span class="mcs-ja">写真管理</span>

                <span class="mcs-vi">Quản lý ảnh</span>

              </span>

            </button>



            <button type="button" class="mcs-photo-sheet-btn upload" data-pa="upload">

              <i class="fas fa-camera"></i>

              <span class="mcs-bilingual">

                <span class="mcs-ja">アップロード</span>

                <span class="mcs-vi">Upload ảnh</span>

              </span>

            </button>



            <button type="button" class="mcs-photo-sheet-btn close" data-pa="close">

              <i class="fas fa-chevron-down"></i>

              <span class="mcs-bilingual">

                <span class="mcs-ja">閉じる</span>

                <span class="mcs-vi">Đóng</span>

              </span>

            </button>

          </div>

        </div>

      </div>

    `;



    document.body.appendChild(overlay);



    const close = () => { try { overlay.remove(); } catch (e) { } };



    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });



    overlay.querySelector('[data-pa="close"]')?.addEventListener('click', close);

    overlay.querySelector('[data-pa="close-x"]')?.addEventListener('click', close);



    overlay.querySelector('[data-pa="manager"]')?.addEventListener('click', () => {

      close();

      this.openPhotoManager();

    });



    overlay.querySelector('[data-pa="upload"]')?.addEventListener('click', () => {

      close();

      this.openPhotoUploadQuick();

    });

  }



  ensureSidebarPhotoMenu() {

    return; // Tắt menu Ảnh ở đáy sidebar (đã có Quản lý ảnh trong Tools)

    const sidebar = document.getElementById('sidebar');

    if (!sidebar) return;



    if (document.getElementById('sidebar-photo-menu')) return;



    const box = document.createElement('div');

    box.id = 'sidebar-photo-menu';



    box.innerHTML = `

      <div class="mcs-photo-menu-title">

        <i class="fas fa-images"></i>

        <span class="mcs-bilingual">

          <span class="mcs-ja">写真</span>

          <span class="mcs-vi">Ảnh</span>

        </span>

      </div>



      <div class="mcs-photo-menu-actions">

        <button type="button" class="mcs-photo-menu-btn primary" data-sp="manager">

          <span class="mcs-bilingual">

            <span class="mcs-ja">管理</span>

            <span class="mcs-vi">Quản lý</span>

          </span>

        </button>



        <button type="button" class="mcs-photo-menu-btn secondary" data-sp="upload">

          <span class="mcs-bilingual">

            <span class="mcs-ja">アップロード</span>

            <span class="mcs-vi">Upload</span>

          </span>

        </button>

      </div>

    `;



    sidebar.appendChild(box);



    box.querySelector('[data-sp="manager"]')?.addEventListener('click', () => this.openPhotoManager());

    box.querySelector('[data-sp="upload"]')?.addEventListener('click', () => this.openPhotoUploadQuick());

  }





  ensureMobilePhotoMenu() {

    // Đã cấu hình cứng trong index.html với layout 5 nút cân đối 

    return;

  }



  /**

 * Open Photo Audit Tool (safe)

 * - Không làm hỏng app nếu PhotoAuditTool chưa được load

 * - Nếu tool hỗ trợ preselect thì truyền item vào, nếu không thì vẫn mở tool để tự chọn thiết bị

 */

  openPhotoAuditForItem(item) {

    const code = item && (item.type === 'mold' ? (item.MoldCode || '') : (item.CutterNo || '')) || '';



    // --- TRIỆT ĐỂ: chấp nhận cả PhotoUploadTool, không hardcode v8.3.5 ---

    if (!window.PhotoAuditTool && window.PhotoUploadTool) {

      window.PhotoAuditTool = window.PhotoUploadTool

    }



    if (!window.PhotoAuditTool) {

      alert(

        'Chưa nạp công cụ Upload ảnh.\n' +

        'Bạn cần nhúng 1 trong các file sau trong index.html (đúng tên + đúng thứ tự):\n' +

        '- photo-upload-tool-v8.3.8-1.js (khuyến nghị)\n' +

        '- photo-audit-tool-v8.3.7.js'

      )

      return

    }





    // Thử init (nếu tool có init). Nếu tool không cần init hoặc init thiếu config thì vẫn không làm sập app.

    try {

      if (typeof window.PhotoAuditTool.init === 'function') {

        // Nếu bạn có config, bạn có thể gán vào window.PHOTO_AUDIT_CONFIG ở nơi khác (không bắt buộc).

        window.PhotoAuditTool.init(window.PHOTO_AUDIT_CONFIG || {});

      }

    } catch (e) {

      // bỏ qua để không ảnh hưởng app

      console.warn('[App] PhotoAuditTool.init error (ignored):', e);

    }



    // Mở tool: ưu tiên truyền item, nếu tool không nhận object thì fallback mở không đối số

    try {

      if (typeof window.PhotoAuditTool.open === 'function') {

        try {

          window.PhotoAuditTool.open({ item: item || null });

        } catch (e1) {

          window.PhotoAuditTool.open();

        }

        return;

      }

    } catch (e2) {

      console.warn('[App] PhotoAuditTool.open error:', e2);

    }



    alert('PhotoAuditTool đã được load nhưng chưa có hàm open() đúng chuẩn.');

    if (code) console.warn('[App] openPhotoAuditForItem failed for:', code);

  }



  // Đảm bảo module CheckInOut đã được nạp (chỉ dùng 1 tên: window.CheckInOut)

  // Chỉ đợi module CheckInOut sẵn sàng (KHÔNG tự nhúng script, KHÔNG hardcode tên file)

  waitForCheckInOutReady(timeoutMs = 1500) {

    return new Promise((resolve, reject) => {

      const t0 = Date.now();



      const tick = () => {

        try {

          if (window.CheckInOut && typeof window.CheckInOut.openModal === 'function') {

            return resolve(window.CheckInOut);

          }

        } catch (e) { }



        if (Date.now() - t0 >= timeoutMs) {

          return reject(new Error('CheckInOut chưa sẵn sàng'));

        }



        setTimeout(tick, 30);

      };



      tick();

    });

  }





  /**

   * Handle quick action

   */

  handleQuickAction(action, item) {

    console.log('Quick action: ' + action + ' for ' + (item.code || item.MoldCode || item.CutterNo));

    const code = item.type === 'mold' ? (item.MoldCode || '') : (item.CutterNo || '');



    if (typeof action === 'string' && action.startsWith('qu-')) {

      try {

        if (window.QuickUpdateModule && typeof window.QuickUpdateModule.openModal === 'function') {

          const mode = action.replace('qu-', '').toUpperCase();

          const mapKeys = { 'WEIGHT': 'WEIGHT', 'DESIGN': 'DESIGN_INFO', 'LIFECYCLE': 'LIFECYCLE' }; window.QuickUpdateModule.openModal(mapKeys[mode] || mode, item, {
            onSuccess: () => {
              if (window.App && typeof window.App.filterAndRender === 'function') {
                window.App.filterAndRender();
              }
            }
          });

          return;

        }

      } catch (e) { console.error("QuickUpdateModule failed", e); }

    }



    if (String(action).toLowerCase().trim() === 'teflon') {

      try {

        if (window.TeflonProcessing && typeof window.TeflonProcessing.openModal === 'function') {

          window.TeflonProcessing.openModal(item);

          return;

        } else {

          alert('Module TeflonProcessing chưa sẵn sàng.');

          return;

        }

      } catch (e) { }

    }



    switch (action) {

      case 'inout':

        if (window.CheckInOut && typeof window.CheckInOut.openSmart === 'function') {

          window.CheckInOut.openSmart(item);

        } else if (window.CheckInOut && typeof window.CheckInOut.openModal === 'function') {

          // Fallback nếu chưa có openSmart (tránh hỏng hệ thống)

          window.CheckInOut.openModal('check-in', item);

        } else {

          alert('Chưa nạp module CheckInOut (checkin-checkout-*.js)');

        }

        break;



      case 'checkin':

        this.waitForCheckInOutReady()

          .then((cio) => { cio.openModal('check-in', item); })

          .catch(() => {

            alert(

              'Chưa dùng được CheckInOut.\n' +

              'Bạn hãy kiểm tra:\n' +

              '- Module CheckInOut đã được nhúng trong HTML.\n' +

              '- Thẻ script của CheckInOut nằm TRƯỚC app-v8.4.3.js.\n' +

              '- Mở Console xem có dòng "checkin-checkout v8.4.5-2 loaded" không.'

            );

          });

        break;



      case 'checkout':

        this.waitForCheckInOutReady()

          .then((cio) => { cio.openModal('check-out', item); })

          .catch(() => {

            alert(

              'Chưa dùng được CheckInOut.\n' +

              'Bạn hãy kiểm tra:\n' +

              '- Module CheckInOut đã được nhúng trong HTML.\n' +

              '- Thẻ script của CheckInOut nằm TRƯỚC app-v8.4.3.js.\n' +

              '- Mở Console xem có dòng "checkin-checkout v8.4.5-2 loaded" không.'

            );

          });

        break;



      case 'move':

        if (window.LocationMove && typeof window.LocationMove.open === 'function') {

          window.LocationMove.open(item);

        } else {

          alert('Chưa nạp module LocationMove (location-move-v8.5.2-1.js)');

        }

        break;

      case 'inventory':

        if (window.InventoryModule && typeof window.InventoryModule.openForDevice === 'function') {

          window.InventoryModule.openForDevice(item);

        } else {

          alert('Chưa nạp module Inventory');

        }

        break;

      case 'print':

        if (window.PrintExportModule && typeof window.PrintExportModule.openDialog === 'function') {

          window.PrintExportModule.openDialog([item.MoldID || item.CutterID], [item]);

        } else {

          alert('Chưa nạp module Print');

        }

        break;

      case 'qr':

        if (window.ExportQR && typeof window.ExportQR.generate === 'function') {

          window.ExportQR.generate(item);

        } else {

          alert('Chưa nạp module ExportQR');

        }

        break;

      case 'photo':

        this.openPhotoUploadForItem(item);

        break;



    }

  }



  /**

   * Handle print

   */

  handlePrint() {

    const selected = this.getSelectedItems();

    if (selected.length === 0) {

      alert('印刷するアイテムを選択してください');

      return;

    }



    if (window.PrintExportModule && typeof window.PrintExportModule.openDialog === 'function') {

      const ids = selected.map(item => item.MoldID || item.CutterID);

      window.PrintExportModule.openDialog(ids, selected);

    } else {

      alert('Chưa nạp module Print');

    }

  }



  /**

   * Handle inventory

   */

  handleInventory() {

    const selected = this.getSelectedItems();

    if (selected.length === 0) {

      alert('棚卸するアイテムを選択してください');

      return;

    }



    if (window.InventoryModule && typeof window.InventoryModule.openMultiple === 'function') {

      window.InventoryModule.openMultiple(selected);

    } else {

      alert('Chưa nạp module Inventory');

    }

  }



  /**

   * Print single item

   */

  printItem(item) {

    if (window.PrintExportModule && typeof window.PrintExportModule.openDialog === 'function') {

      window.PrintExportModule.openDialog([item.MoldID || item.CutterID], [item]);

    } else {

      alert('Chưa nạp module Print');

    }

  }



  /**

   * Reset all

   */

  resetAll() {

    this.selectedCategory = 'all';

    this.searchQuery = '';

    this.currentPage = 1;



    const categoryDropdown = document.getElementById('categoryDropdown');

    if (categoryDropdown) categoryDropdown.value = 'all';



    // 1. Reset Keyword Search (UI & State)

    const searchInput = document.getElementById('searchInput');

    if (searchInput) searchInput.value = '';

    const clearBtn = document.querySelector('.clear-btn');

    if (clearBtn) clearBtn.style.display = 'none';



    if (this.searchModule) {

      if (typeof this.searchModule.clearSearch === 'function') {

        this.searchModule.clearSearch();

      }

      this.searchModule.currentQuery = '';

    }



    // 2. Reset Table Sort & Selection

    if (this.cardRenderer) {

      this.cardRenderer.deselectAll();

    }

    if (this.tableRenderer) {

      this.tableRenderer.deselectAll();

      this.tableRenderer.sortColumn = null;

      this.tableRenderer.sortDirection = 'desc';

    }



    // 3. Reset Global Filter

    if (window.FilterModule && typeof window.FilterModule.resetAll === 'function') {

      window.FilterModule.resetAll();

      // FilterModule.resetAll() sẽ tự động bắn event filterapplied, gọi lại app.applyFilters()

    } else {

      // Fallback

      if (this.tableRenderer) {

        this.tableRenderer.applyFiltersAndSort();

        this.tableRenderer.calculatePagination();

        this.tableRenderer.currentPage = 1;

        this.tableRenderer.renderRows();

      }

      this.applyFilters();

    }

  }



  /**

   * Open QR Scanner

   */

  openQRScanner() {

    if (window.QRScanSearch && typeof window.QRScanSearch.openModal === 'function') {

      window.QRScanSearch.openModal();

    } else {

      alert('Module Máy quét QR chưa được tải xong hoặc bị lỗi.');

    }

  }



  /**

   * Get selected items

   */

  getSelectedItems() {

    if (this.currentView === 'card') {

      return this.cardRenderer.getSelectedItems();

    } else {

      return this.tableRenderer.getSelectedItems();

    }

  }



  /**

   * Select all

   */

  selectAll() {

    if (this.currentView === 'card') {

      if (this.cardRenderer?.selectAllResults) this.cardRenderer.selectAllResults();

      else this.cardRenderer.selectAll();

    } else {

      if (this.tableRenderer?.selectAllResults) this.tableRenderer.selectAllResults();

      else this.tableRenderer.selectAll();

    }

  }



  /**

   * Deselect all

   */

  deselectAll() {

    if (this.currentView === 'card') {

      this.cardRenderer.deselectAll();

    } else {

      this.tableRenderer.deselectAll();

    }

  }

}



// Global Sync Status Helper

window.setGlobalSyncStatus = function (status) {

  const icon = document.getElementById('globalSyncIcon');

  if (!icon) return;

  // classes: syncing, success, error

  icon.className = 'global-sync-icon ' + status;

  if (status === 'syncing') {

    icon.innerHTML = '<i class="fas fa-sync-alt"></i>';

    icon.title = 'Đang đồng bộ...';

  } else if (status === 'success') {

    icon.innerHTML = '<i class="fas fa-cloud"></i>';

    icon.title = 'Đã đồng bộ máy chủ';

  } else {

    icon.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';

    icon.title = 'Lỗi đồng bộ';

  }

};



// Allow other modules to open PhotoAuditTool via event

document.addEventListener('open-photo-audit', (e) => {

  try {

    const detail = (e && e.detail) ? e.detail : null;

    const item = detail && (detail.item || detail.data || detail) ? (detail.item || detail.data || detail) : null;

    if (window.app && typeof window.app.openPhotoAuditForItem === 'function') {

      window.app.openPhotoAuditForItem(item);

    }

  } catch (err) {

    console.warn('[App] open-photo-audit handler error:', err);

  }

});



// Initialize app

let app;

if (document.readyState === 'loading') {

  document.addEventListener('DOMContentLoaded', () => {

    app = new App();

    window.app = app;

  });

} else {

  app = new App();

  window.app = app;

}


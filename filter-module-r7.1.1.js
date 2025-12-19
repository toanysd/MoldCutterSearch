/**
 * ============================================================================
 * FILTER-MODULE-R7.1.0.JS
 * V7.7.7 Advanced Filter + Sort Module — Desktop + Mobile + Full-screen Modal
 * ============================================================================
 *
 * Purpose:
 * - Lọc nâng cao với combo Field + Value (desktop + mobile)
 * - Modal full-screen cho mobile (mở từ nút Filter ở bottom nav)
 * - Chọn tiêu chí sắp xếp (code / name / size / location / company / ngày SX)
 *   và thứ tự tăng / giảm, áp dụng chung cho card + table
 * - Nút:
 *     + Reset bộ lọc  (filter only)
 *     + Reset sắp xếp (sort only → về mặc định)
 *     + Reset toàn bộ (lọc + sort + category + search)
 * - Đồng bộ:
 *     + Lọc: phát lại search:updated (origin = 'filter') sau khi apply filter
 *     + Sort: phát results:sortChanged { field, direction }
 * - Public API: reset(), resetSort(), resetAll(), getState(), setState()
 *
 * Created:  2025-12-10
 * Updated:  2025-12-10 20:05 JST (r7.1.0 - Full-screen filter + sort)
 * Author :  System Architect
 * ============================================================================
 */

(function () {
    'use strict';

    // ========================================================================
    // iOS/iPhone viewport fix helpers (address bar / dynamic toolbar)
    // - Set CSS var --vh theo visualViewport.height (nếu có)
    // - Dùng để modal full-screen không bị "mất" do 100vh sai trên iOS
    // ========================================================================
    function getViewportHeightPx() {
    const vv = window.visualViewport;
    const h = (vv && typeof vv.height === 'number') ? vv.height : window.innerHeight;
    return Math.max(320, Math.floor(h || 0));
    }

    function applyVhCssVar() {
    const vhPx = getViewportHeightPx();
    document.documentElement.style.setProperty('--vh', vhPx + 'px');
    return vhPx;
    }

    function applyModalHeightIfOpen() {
    const vhPx = applyVhCssVar();
    if (!state || !state.modalEl) return;

    // Chỉ ép height khi modal đang mở
    if (state.modalEl.classList.contains('show')) {
        state.modalEl.style.height = vhPx + 'px';
        const container = state.modalEl.querySelector('.filter-modal-container');
        if (container) container.style.height = vhPx + 'px';
    }
    }


    // ========================================================================
    // SELECTORS - Desktop + Mobile legacy controls
    // ========================================================================

    const SELECTORS = {
        // Desktop (iPad) filter selectors
        desktopFieldSelect: [
            '#filter-field',
            '#filter-field-select',
            '.filter-field',
            '[data-role="filter-field"]',
            '#filter-key'
        ],
        desktopValueSelect: [
            '#filter-value',
            '#filter-value-select',
            '.filter-value',
            '[data-role="filter-value"]',
            '#filter-val'
        ],
        desktopResetBtn: [
            '#btn-filter-reset',
            '.btn-filter-reset',
            '#filter-reset',
            '#filter-reset-btn',
            '.filter-reset-btn'
        ],

        // Mobile (old inline) filter selectors (giữ để tương thích)
        mobileFieldSelect: [
            '#mobile-filter-field',
            '.mobile-filter-field',
            '[data-role="mobile-filter-field"]'
        ],
        mobileValueSelect: [
            '#mobile-filter-value',
            '.mobile-filter-value',
            '[data-role="mobile-filter-value"]'
        ],
        mobileResetBtn: [
            '#mobile-filter-reset-btn',
            '#mobile-reset-filter-btn',
            '#mobile-filter-reset',
            '.mobile-reset-filter-btn',
            '.mobile-filter-reset-btn'
        ],

        // Reset ALL (đã tồn tại trên desktop & mobile panel)
        resetAllBtn: [
            '#reset-all-btn'
        ]
    };

    // ========================================================================
    // FILTER FIELDS CONFIGURATION
    // ========================================================================

    const FILTER_FIELDS = [
        { id: 'itemType', label: '種別 / Loại', get: it => it.itemType },
        {
            id: 'storageCompany',
            label: '保管会社 / Cty giữ',
            get: it =>
                (it.storageCompanyInfo?.CompanyShortName ||
                    it.storageCompanyInfo?.CompanyName ||
                    it.storageCompany ||
                    '')
        },
        {
            id: 'rackLayerId',
            label: '棚位置ID / Giá-Tầng (ID)',
            get: it => it.rackLayerInfo?.RackLayerID || ''
        },
        {
            id: 'rackLocation',
            label: '棚-段位置 / Vị trí kệ',
            get: it => it.rackInfo?.RackLocation || ''
        },
        {
            id: 'rackId',
            label: '棚番号 / Mã kệ',
            get: it => it.rackLayerInfo?.RackID || ''
        },
        {
            id: 'layerNum',
            label: '棚の段 / Tầng',
            get: it => it.rackLayerInfo?.RackLayerNumber || ''
        },
        {
            id: 'customer',
            label: '顧客名 / Khách hàng',
            get: it =>
                (it.customerInfo?.CustomerShortName ||
                    it.customerInfo?.CustomerName ||
                    '')
        },
        {
            id: 'company',
            label: '会社名 / Công ty',
            get: it =>
                (it.companyInfo?.CompanyShortName ||
                    it.companyInfo?.CompanyName ||
                    '')
        },
        {
            id: 'status',
            label: '状態 / Trạng thái',
            get: it => (it.currentStatus?.text || '')
        },
        { id: 'teflon', label: 'テフロン / Teflon', get: it => it.TeflonCoating || '' },
        {
            id: 'returning',
            label: '返却 / MoldReturning',
            get: it => (it.MoldReturning || '')
        },
        {
            id: 'disposing',
            label: '廃棄 / MoldDisposing',
            get: it => (it.MoldDisposing || '')
        },
        {
            id: 'drawing',
            label: '図番 / Mã bản vẽ',
            get: it => it.designInfo?.DrawingNumber || ''
        },
        {
            id: 'equip',
            label: '設備コード / Thiết bị',
            get: it => it.designInfo?.EquipmentCode || ''
        },
        {
            id: 'plastic',
            label: '樹脂 / Loại nhựa',
            get: it => it.designInfo?.DesignForPlasticType || ''
        },
        {
            id: 'dim',
            label: '寸法 / Kích thước',
            get: it => (it.displayDimensions || it.cutlineSize || '')
        }
    ];

    // ========================================================================
    // SORT FIELDS CONFIGURATION (dùng chung với UIRenderer & MobileTableView)
    // ========================================================================

    const SORT_FIELDS = [
        {
            id: 'productionDate',
            label: '製造日 / Ngày SX (mới nhất)',
            // dùng jobInfo.DeliveryDeadline / ProductionDate / displayDate
            default: true
        },
        { id: 'code', label: 'コード / Mã' },
        { id: 'name', label: '名称 / Tên' },
        { id: 'size', label: '寸法 / Kích thước' },
        { id: 'location', label: '棚番 / Vị trí kệ' },
        { id: 'company', label: '保管 / Công ty' }
    ];

    const DEFAULT_SORT = {
        field: 'productionDate',
        direction: 'desc'
    };

    // STATE MANAGEMENT
    const state = {
        fieldId: '',
        value: '',
        category: 'all', // 表示カテゴリ (all / mold / cutter)
        _categoryTabsBound: false, // chặn bind click nhiều lần
        reEmitting: false, // ...

        // Sort: filter module giữ state chuẩn, phát ra cho modules khác
        sortField: DEFAULT_SORT.field,
        sortDirection: DEFAULT_SORT.direction,
     
        // DOM refs
        desktopFieldEl: null,
        desktopValueEl: null,
        mobileFieldEl: null,
        mobileValueEl: null,

        // Full-screen modal
        modalEl: null,
        modalBodyEl: null,
        modalFieldEl: null,
        modalValueEl: null,
        modalSortFieldEl: null,
        modalSortDirEl: null,
        modalCategoryTabs: null,

        // Drag-to-close
        drag: {
            startY: 0,
            currentY: 0,
            isDragging: false
        }
    };

    // ========================================================================
    // FILTER MODULE
    // ========================================================================

    const FilterModule = {
        /**
         * Initialize filter module for both Desktop and Mobile + Full-screen modal
         */
        initializeFilters() {
            console.log('🔧 FilterModule r7.1.0: Initializing...');

            // 1. Legacy Desktop + Mobile inline controls
            this.initDesktopFilters();
            // ✅ Clear category states từ các modules khác
            this.clearExternalCategoryStates();

            this.initMobileFilters();

            // 2. Full-screen modal for mobile
            this.initFullScreenModal();

            this.bindCategoryTabClicks();   // <-- ADD

            // 3. Global listeners (search:updated, filter:reset, ...)
            this.setupGlobalListeners();

            // 4. Restore saved state (filter + sort)
            this.restoreState();

            // 5. Sync sort mặc định cho UIRenderer + MobileTableView lúc khởi động
            this.applySortConfig(state.sortField, state.sortDirection);

            console.log('✅ FilterModule r7.1.0: Ready!');
        },

        // --------------------------------------------------------------------
        // Desktop (iPad) filter UI
        // --------------------------------------------------------------------
        initDesktopFilters() {
            const fieldEl = resolveSelect(SELECTORS.desktopFieldSelect);
            const valueEl = resolveSelect(SELECTORS.desktopValueSelect);
            const resetBtn = resolveFirst(SELECTORS.desktopResetBtn);

            if (!fieldEl) {
                console.warn('⚠️ Desktop filter field select not found');
                return;
            }

            state.desktopFieldEl = fieldEl;
            state.desktopValueEl = valueEl;

            // Populate field options
            this.populateFieldOptions(fieldEl);

            // Field change event
            fieldEl.addEventListener('change', () => {
                const fieldId = fieldEl.value || '';
                console.log('🖥️ [Desktop] Filter field changed:', fieldId);

                state.fieldId = fieldId;
                this.buildValueOptions(valueEl, fieldId);

                if (valueEl) valueEl.value = '';
                state.value = '';

                // Sync tới mobile + modal
                this.syncFieldToMobile(fieldId);
                this.syncFieldToModal(fieldId);

                this.triggerFilter();
                this.persistState();
            });

            // Value change event
            if (valueEl) {
                valueEl.addEventListener('change', () => {
                    const value = valueEl.value || '';
                    console.log('🖥️ [Desktop] Filter value changed:', value);

                    state.value = value;

                    // Sync tới mobile + modal
                    this.syncValueToMobile(value);
                    this.syncValueToModal(value);

                    this.triggerFilter();
                    this.persistState();
                });
            }

            // Reset button (filter only)
            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    console.log('🖥️ [Desktop] Reset filter clicked');
                    this.reset();
                });
            }

            // Reset ALL button (filter + search + sort + category)
            const resetAllBtns = queryAll(SELECTORS.resetAllBtn);
            resetAllBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    console.log('🖥️ [Desktop] Reset ALL clicked');
                    this.resetAll();
                });
            });

            // Initialize value options
            this.buildValueOptions(valueEl, '');
            console.log('✅ Desktop filters initialized');
        },

        // --------------------------------------------------------------------
        // Mobile (old inline) filter UI - vẫn giữ để tương thích
        // --------------------------------------------------------------------
        initMobileFilters() {
            const fieldEl = resolveSelect(SELECTORS.mobileFieldSelect);
            const valueEl = resolveSelect(SELECTORS.mobileValueSelect);
            const resetBtn = resolveFirst(SELECTORS.mobileResetBtn);

            if (!fieldEl) {
                console.warn('⚠️ Mobile inline filter field select not found');
                return;
            }

            state.mobileFieldEl = fieldEl;
            state.mobileValueEl = valueEl;

            this.populateFieldOptions(fieldEl);

            fieldEl.addEventListener('change', () => {
                const fieldId = fieldEl.value || '';
                console.log('📱 [Mobile-inline] Filter field changed:', fieldId);

                state.fieldId = fieldId;
                this.buildValueOptions(valueEl, fieldId);

                if (valueEl) valueEl.value = '';
                state.value = '';

                // Sync tới desktop + modal
                this.syncFieldToDesktop(fieldId);
                this.syncFieldToModal(fieldId);

                this.triggerFilter();
                this.persistState();
            });

            if (valueEl) {
                valueEl.addEventListener('change', () => {
                    const value = valueEl.value || '';
                    console.log('📱 [Mobile-inline] Filter value changed:', value);

                    state.value = value;

                    // Sync tới desktop + modal
                    this.syncValueToDesktop(value);
                    this.syncValueToModal(value);

                    this.triggerFilter();
                    this.persistState();
                });
            }

            if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                    console.log('📱 [Mobile-inline] Reset filter clicked');
                    this.reset();
                });
            }

            // Mobile inline share chung reset-all với desktop
            const mobileResetAllBtns = queryAll(SELECTORS.resetAllBtn);
            mobileResetAllBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    console.log('📱 [Mobile-inline] Reset ALL clicked');
                    this.resetAll();
                });
            });

            this.buildValueOptions(valueEl, '');
            console.log('✅ Mobile inline filters initialized');
        },

        // --------------------------------------------------------------------
        // Full-screen Filter & Sort Modal for Mobile
        // --------------------------------------------------------------------
        initFullScreenModal() {
            // Chỉ tạo 1 lần
            if (state.modalEl) return;

            const html = `
                <div id="filter-fullscreen-modal" class="filter-fullscreen-modal hidden">
                    <div class="filter-modal-backdrop"></div>
                    <div class="filter-modal-container">
                        <div class="filter-modal-header">
                            <div class="filter-modal-title">
                                <span class="title-ja">フィルター ＆ ソート</span>
                                <span class="title-vi">Bộ lọc & Sắp xếp</span>
                            </div>
                            <button class="filter-modal-close-btn" aria-label="Close">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>

                        <div class="filter-modal-body">
                            <!-- CATEGORY GROUP -->
                            <div class="filter-section category-section">
                                <div class="section-label">
                                    <span class="section-title-ja">カテゴリ</span>
                                    <span class="section-title-vi">Nhóm hiển thị</span>
                                </div>
                                <div class="section-body">
                                    <div class="filter-category-tabs category-tabs" data-role="filter-category-tabs">
                                        <button class="category-tab active" data-category="all">
                                            <span class="ja">すべて</span>
                                            <span class="vi">Tất cả</span>
                                        </button>
                                        <button class="category-tab" data-category="mold">
                                            <span class="ja">金型</span>
                                            <span class="vi">Khuôn</span>
                                        </button>
                                        <button class="category-tab" data-category="cutter">
                                            <span class="ja">抜型</span>
                                            <span class="vi">Dao cắt</span>
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <!-- FILTER GROUP -->
                            <div class="filter-section filter-main-section">
                                <div class="section-label">
                                    <span class="section-title-ja">フィルター</span>
                                    <span class="section-title-vi">Bộ lọc</span>
                                </div>
                                <div class="section-body">
                                    <div class="filter-row">
                                        <div class="filter-row-label">
                                            <span class="label-ja">フィールド選択</span>
                                            <span class="label-vi">Chọn trường lọc</span>
                                        </div>
                                        <div class="filter-row-control">
                                            <select id="modal-filter-field" class="filter-select"></select>
                                        </div>
                                    </div>
                                    <div class="filter-row">
                                        <div class="filter-row-label">
                                            <span class="label-ja">値選択</span>
                                            <span class="label-vi">Chọn giá trị</span>
                                        </div>
                                        <div class="filter-row-control">
                                            <select id="modal-filter-value" class="filter-select"></select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- SORT GROUP -->
                            <div class="filter-section sort-section">
                                <div class="section-label">
                                    <span class="section-title-ja">ソート</span>
                                    <span class="section-title-vi">Sắp xếp kết quả</span>
                                </div>
                                <div class="section-body">
                                    <div class="filter-row">
                                        <div class="filter-row-label">
                                            <span class="label-ja">項目</span>
                                            <span class="label-vi">Trường sắp xếp</span>
                                        </div>
                                        <div class="filter-row-control">
                                            <select id="modal-sort-field" class="filter-select"></select>
                                        </div>
                                    </div>
                                    <div class="filter-row">
                                        <div class="filter-row-label">
                                            <span class="label-ja">順序</span>
                                            <span class="label-vi">Thứ tự</span>
                                        </div>
                                        <div class="filter-row-control">
                                            <select id="modal-sort-direction" class="filter-select">
                                                <option value="desc">降順 ｜ Giảm dần (Mới → Cũ)</option>
                                                <option value="asc">昇順 ｜ Tăng dần (Cũ → Mới)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- FOOTER BUTTONS -->
                        <div class="filter-modal-footer">
                            <div class="filter-modal-actions">
                                <button class="modal-action-btn action-close" data-role="btn-close-modal">
                                    <div class="btn-icon">
                                        <i class="fas fa-chevron-down"></i>
                                    </div>
                                        <div class="btn-text">
                                        <span class="text-ja">閉じる</span>
                                        <span class="text-vi">Đóng</span>
                                    </div>
                                </button>

                                <button class="modal-action-btn action-reset-filter" data-role="btn-reset-filter">
                                    <div class="btn-icon">
                                        <i class="fas fa-undo"></i>
                                    </div>
                                    <div class="btn-text">
                                        <span class="text-ja">フィルター解除</span>
                                        <span class="text-vi">Reset bộ lọc</span>
                                    </div>
                                </button>

                                <button class="modal-action-btn action-reset-sort" data-role="btn-reset-sort">
                                    <div class="btn-icon">
                                        <i class="fas fa-sort-amount-down-alt"></i>
                                    </div>
                                    <div class="btn-text">
                                        <span class="text-ja">ソート初期化</span>
                                        <span class="text-vi">Reset sắp xếp</span>
                                    </div>
                                </button>

                                <button class="modal-action-btn action-reset-all" data-role="btn-reset-all">
                                    <div class="btn-icon">
                                        <i class="fas fa-fast-backward"></i>
                                    </div>
                                    <div class="btn-text">
                                        <span class="text-ja">全てリセット</span>
                                        <span class="text-vi">Reset toàn bộ</span>
                                    </div>
                                </button>

                                
                            </div>
                        </div>
                    </div>
                </div>
            `;


            document.body.insertAdjacentHTML('beforeend', html);

            state.modalEl = document.getElementById('filter-fullscreen-modal');
            state.modalBodyEl = state.modalEl.querySelector('.filter-modal-body');
            state.modalFieldEl = state.modalEl.querySelector('#modal-filter-field');
            state.modalValueEl = state.modalEl.querySelector('#modal-filter-value');
            state.modalSortFieldEl = state.modalEl.querySelector('#modal-sort-field');
            state.modalSortDirEl = state.modalEl.querySelector('#modal-sort-direction');
            state.modalCategoryTabs = state.modalEl.querySelectorAll('.filter-category-tabs .category-tab');

            // Populate filter + sort options
            this.populateFieldOptions(state.modalFieldEl);
            this.buildValueOptions(state.modalValueEl, '');
            this.populateSortOptions(state.modalSortFieldEl);

            // Bind header close
            const closeBtn = state.modalEl.querySelector('.filter-modal-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.hideModal());
            }

            // Bind bottom close
            const bottomCloseBtn = state.modalEl.querySelector('[data-role="btn-close-modal"]');
            if (bottomCloseBtn) {
                bottomCloseBtn.addEventListener('click', () => this.hideModal());
            }

            // Backdrop click to close
            const backdrop = state.modalEl.querySelector('.filter-modal-backdrop');
            if (backdrop) {
                backdrop.addEventListener('click', () => this.hideModal());
            }

            // Filter field/value change trong modal
            if (state.modalFieldEl) {
                state.modalFieldEl.addEventListener('change', () => {
                    const fieldId = state.modalFieldEl.value || '';
                    console.log('📱 [Modal] Filter field changed:', fieldId);

                    state.fieldId = fieldId;
                    this.buildValueOptions(state.modalValueEl, fieldId);
                    if (state.modalValueEl) state.modalValueEl.value = '';
                    state.value = '';

                    // Sync tới desktop + mobile inline
                    this.syncFieldToDesktop(fieldId);
                    this.syncFieldToMobile(fieldId);

                    this.triggerFilter();
                    this.persistState();
                });
            }

            if (state.modalValueEl) {
                state.modalValueEl.addEventListener('change', () => {
                    const value = state.modalValueEl.value || '';
                    console.log('📱 [Modal] Filter value changed:', value);

                    state.value = value;

                    this.syncValueToDesktop(value);
                    this.syncValueToMobile(value);

                    this.triggerFilter();
                    this.persistState();
                });
            }

            // Sort field/direction change trong modal
            if (state.modalSortFieldEl) {
                state.modalSortFieldEl.addEventListener('change', () => {
                    const sortField = state.modalSortFieldEl.value || DEFAULT_SORT.field;
                    state.sortField = sortField;
                    this.applySortConfig(state.sortField, state.sortDirection);
                    this.persistState();
                });
            }
            if (state.modalSortDirEl) {
                state.modalSortDirEl.addEventListener('change', () => {
                    const dir = state.modalSortDirEl.value === 'asc' ? 'asc' : 'desc';
                    state.sortDirection = dir;
                    this.applySortConfig(state.sortField, state.sortDirection);
                    this.persistState();
                });
            }

            // Footer buttons
            const btnResetFilter = state.modalEl.querySelector('[data-role="btn-reset-filter"]');
            const btnResetSort = state.modalEl.querySelector('[data-role="btn-reset-sort"]');
            const btnResetAll = state.modalEl.querySelector('[data-role="btn-reset-all"]');

            if (btnResetFilter) {
                btnResetFilter.addEventListener('click', () => {
                    console.log('📱 [Modal] Reset filter clicked');
                    this.reset();
                });
            }
            if (btnResetSort) {
                btnResetSort.addEventListener('click', () => {
                    console.log('📱 [Modal] Reset SORT clicked');
                    this.resetSort();
                });
            }
            if (btnResetAll) {
                btnResetAll.addEventListener('click', () => {
                    console.log('📱 [Modal] Reset ALL clicked');
                    this.resetAll();
                });
            }

            // Open from bottom nav Filter button (mobile bottom nav)
                const self = this;

                // iPhone: 1 tap thường phát sinh cả touchend + click → phải chặn mở 2 lần
                let __lastNavTapTs = 0;

                const handleNavTap = function (e) {
                const now = Date.now();
                if (now - __lastNavTapTs < 450) return; // chặn double-fire
                __lastNavTapTs = now;

                // Đảm bảo không bị các handler khác nuốt mất sự kiện trên iPhone
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                self.showModal();
            };


            // Gắn trực tiếp nếu nút đã có sẵn trong DOM
            let navFilterBtn = document.getElementById('filter-nav-btn');
            if (navFilterBtn) {
            navFilterBtn.addEventListener('click', handleNavTap, { passive: false });
            navFilterBtn.addEventListener('touchend', handleNavTap, { passive: false });
            navFilterBtn.addEventListener('pointerup', handleNavTap, { passive: false });

            } else {
            // Fallback: delegation – phòng trường hợp nav tạo động sau khi module init
            document.addEventListener(
                'click',
                function (e) {
                const btn = e.target && e.target.closest && e.target.closest('#filter-nav-btn');
                if (btn) {
                    navFilterBtn = btn;
                    handleNavTap(e);
                }
                },
                { passive: false }
            );

            document.addEventListener(
                'touchend',
                function (e) {
                const btn = e.target && e.target.closest && e.target.closest('#filter-nav-btn');
                if (btn) {
                    navFilterBtn = btn;
                    handleNavTap(e);
                }
                },
                { passive: false }
            );

            document.addEventListener(
                'pointerup',
                function (e) {
                    const btn = e.target && e.target.closest && e.target.closest('#filter-nav-btn');
                    if (btn) {
                    navFilterBtn = btn;
                    handleNavTap(e);
                    }
                },
                { passive: false }
            );

            }

            // Swipe-down to close (giản lược, giống behavior MobileDetailModal)
            this.bindSwipeToClose();
            // iOS viewport fix: cập nhật --vh và ép height khi toolbar iOS co giãn
            try {
                const onVhChange = () => applyModalHeightIfOpen();

                window.addEventListener('resize', onVhChange, { passive: true });
                window.addEventListener('orientationchange', onVhChange, { passive: true });

                if (window.visualViewport) {
                    window.visualViewport.addEventListener('resize', onVhChange, { passive: true });
                    // Một số iOS thay đổi height khi scroll toolbar -> dùng thêm scroll
                    window.visualViewport.addEventListener('scroll', onVhChange, { passive: true });
                }

                // Set lần đầu
                applyVhCssVar();
                } catch (err) {
                    console.warn('[FilterModule] viewport fix init failed:', err);
            }


            console.log('✅ Full-screen Filter & Sort modal initialized');
        },

        showModal() {
            if (!state.modalEl) return;
            state.modalEl.classList.remove('hidden');
            state.modalEl.classList.add('show');

            // iOS: khóa scroll chắc hơn (body + html)
            document.body.style.overflow = 'hidden';
            document.documentElement.style.overflow = 'hidden';
            document.body.classList.add('modal-open');

            // Ép height theo viewport thực tế (tránh 100vh sai trên iPhone)
            try {
            // Nếu CSS dùng --vh thì cũng đã có, nhưng ở đây ép thêm inline để chắc chắn
            applyModalHeightIfOpen();
            state.modalEl.style.display = 'flex';
            } catch (err) {
            console.warn('[FilterModule] showModal viewport apply failed:', err);
            }

            // Đồng bộ UI với state hiện tại
            if (state.modalFieldEl) state.modalFieldEl.value = state.fieldId || '';
            if (state.modalValueEl) state.modalValueEl.value = state.value || '';
            if (state.modalSortFieldEl) state.modalSortFieldEl.value = state.sortField || DEFAULT_SORT.field;
            if (state.modalSortDirEl) state.modalSortDirEl.value = state.sortDirection || DEFAULT_SORT.direction;
            // ✅ R7.1.1-FIX: Đồng bộ UI tabs với state hiện tại (KHÔNG force)
            if (state.modalCategoryTabs && state.modalCategoryTabs.length) {
            state.modalCategoryTabs.forEach(btn => {
                const c = (btn.getAttribute('data-category') || 'all').toLowerCase();
                btn.classList.toggle('active', c === state.category);
            });
            }
            console.log('[FilterModule] showModal: category tabs synced to:', state.category);



        },

        hideModal() {
            if (!state.modalEl) return;
            state.modalEl.classList.remove('show');
            state.modalEl.classList.add('hidden');
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
            document.body.classList.remove('modal-open');

            // Dọn inline style để CSS tự quản lý khi mở lại
            try {
            if (state.modalEl) {
                state.modalEl.style.height = '';
                state.modalEl.style.display = '';
                const container = state.modalEl.querySelector('.filter-modal-container');
                if (container) container.style.height = '';
            }
            } catch (err) {
            // ignore
            }

        },

        bindSwipeToClose() {
            if (!state.modalEl || !state.modalBodyEl) return;

            const header = state.modalEl.querySelector('.filter-modal-header');
            const body = state.modalBodyEl;

            const DRAG_THRESHOLD = 20;   // px để bắt đầu coi là swipe
            const CLOSE_THRESHOLD = 80;  // px để đóng
            const MAX_TRANSLATE = 120;

            const resetDrag = () => {
                state.drag.isDragging = false;
                state.modalEl.style.transform = '';
                state.modalEl.style.opacity = '';
            };

            const handleStart = (e) => {
                if (!e.touches || e.touches.length !== 1) return;
                const target = e.target;

                if (!header.contains(target) && !body.contains(target)) return;

                state.drag.startY = e.touches[0].clientY;
                state.drag.currentY = state.drag.startY;
                state.drag.isDragging = false;
            };

            const handleMove = (e) => {
                if (!e.touches || e.touches.length !== 1) return;
                const y = e.touches[0].clientY;
                const delta = y - state.drag.startY;

                // Chỉ quan tâm khi vuốt xuống
                if (delta <= 0) return;

                // Ngăn kéo khi body đang scroll ở giữa
                if (body.scrollTop > 0) return;

                if (!state.drag.isDragging && delta > DRAG_THRESHOLD) {
                    state.drag.isDragging = true;
                }
                if (!state.drag.isDragging) return;

                e.preventDefault();

                state.drag.currentY = y;
                const translate = Math.min(delta, MAX_TRANSLATE);
                const opacity = 1 - Math.min(delta / 200, 0.5);

                state.modalEl.style.transform = `translateY(${translate}px)`;
                state.modalEl.style.opacity = opacity;
            };

            const handleEnd = () => {
                if (!state.drag.isDragging) return;
                const delta = state.drag.currentY - state.drag.startY;
                if (delta > CLOSE_THRESHOLD) {
                    resetDrag();
                    this.hideModal();
                } else {
                    resetDrag();
                }
            };

            [header, body].forEach(el => {
                if (!el) return;
                el.addEventListener('touchstart', handleStart, { passive: true });
                el.addEventListener('touchmove', handleMove, { passive: false });
                el.addEventListener('touchend', handleEnd);
                el.addEventListener('touchcancel', handleEnd);
            });
        },

        bindCategoryTabClicks() {
            if (state._categoryTabsBound) return;
            state._categoryTabsBound = true;

            document.addEventListener('click', (e) => {
                const btn = e.target && e.target.closest ? e.target.closest('.category-tab[data-category]') : null;
                if (!btn) return;

                // Chỉ bắt click đúng khu vực category tabs
                const inCategoryTabs = btn.closest('.category-tabs, .category-tabs-mobile, .filter-category-tabs');
                if (!inCategoryTabs) return;

                e.preventDefault();
                e.stopPropagation();

                const cat = (btn.getAttribute('data-category') || 'all').toLowerCase();
                this.setCategory(cat, { source: 'user' });
            }, true);
        },

        clearExternalCategoryStates() {
            // Xóa tất cả localStorage keys liên quan đến category từ modules khác
            const keysToRemove = [
                'mold-category',
                'cutter-category',
                'category',
                'itemType',
                'selectedCategory',
                'currentCategory',
                'filterCategory',
                'displayCategory',
                'v777-category',
                'mold-cutter-category'
            ];
            
            keysToRemove.forEach(key => {
                try {
                    if (localStorage.getItem(key)) {
                        localStorage.removeItem(key);
                        console.log(`✅ Cleared localStorage key: ${key}`);
                    }
                } catch (err) {
                    // ignore
                }
            });
            
            // Phát event để các module khác biết phải reset
            document.dispatchEvent(new CustomEvent('category:force-reset', { 
                detail: { category: 'all' } 
            }));
            
            console.log('✅ External category states cleared');
        },


        // --------------------------------------------------------------------
        // Global listeners
        // --------------------------------------------------------------------
        setupGlobalListeners() {
            // Listen to search results → apply filter → re-emit
            document.addEventListener('search:updated', (e) => {
                const origin = e.detail?.origin || '';
                if (origin === 'filter') return; // Avoid infinite loop

                const base = e.detail?.results || [];
                const filtered = this.applyFilter(base, state.fieldId, state.value);

                console.log(`🔍 Filter applied: ${base.length} → ${filtered.length} results`);

                state._reEmitting = true;
                document.dispatchEvent(new CustomEvent('search:updated', {
                    detail: {
                        ...e.detail,
                        results: filtered,
                        total: filtered.length,
                        origin: 'filter'
                    }
                }));
                state._reEmitting = false;
            });

            // Global filter reset event (filter only)
            document.addEventListener('filter:reset', () => {
                console.log('📢 Global filter:reset event received');
                this.reset();
            });
        },

        // --------------------------------------------------------------------
        // Options builders
        // --------------------------------------------------------------------
        populateFieldOptions(selectEl) {
            if (!selectEl) return;
            selectEl.innerHTML = '';

            this.appendOption(selectEl, '', 'まずフィールドを選択 | Chọn trường');
            FILTER_FIELDS.forEach(f => {
                this.appendOption(selectEl, f.id, f.label);
            });
        },

        buildValueOptions(selectEl, fieldId) {
            const sel = ensureSelect(selectEl);
            if (!sel) return;

            sel.innerHTML = '';
            this.appendOption(sel, '', 'すべて | Tất cả');

            if (!fieldId) return;

            const getter = FILTER_FIELDS.find(f => f.id === fieldId)?.get;
            if (!getter) return;

            const items = window.DataManager?.getAllItems?.() || [];
            const valueSet = new Set();

            for (const it of items) {
                const v = (getter(it) || '').toString().trim();
                if (v) valueSet.add(v);
            }

            Array.from(valueSet)
                .sort((a, b) => a.localeCompare(b, 'ja'))
                .forEach(v => this.appendOption(sel, v, v));

            console.log(`📋 Built ${valueSet.size} value options for field: ${fieldId}`);
        },

        populateSortOptions(selectEl) {
            const sel = ensureSelect(selectEl);
            if (!sel) return;

            sel.innerHTML = '';
            SORT_FIELDS.forEach(f => {
                this.appendOption(sel, f.id, f.label);
            });

            // Default select productionDate
            sel.value = DEFAULT_SORT.field;
        },

        // --------------------------------------------------------------------
        // Core filter / sort logic
        // --------------------------------------------------------------------
        applyFilter(list, fieldId, value) {
            if (!fieldId || !value) return list;

            const getter = FILTER_FIELDS.find(f => f.id === fieldId)?.get;
            if (!getter) return list;

            const val = value.toString().toLowerCase();

            return list.filter(it => {
                const itemValue = (getter(it) || '').toString().toLowerCase();
                return itemValue.includes(val);
            });
        },

        /**
         * Gửi yêu cầu sort tới UIRenderer + MobileTableView
         * R7.1.1-FIX: KHÔNG reset category khi sort thay đổi
         */
        applySortConfig(field, direction) {
        const sortField = field || DEFAULT_SORT.field;
        const dir = direction === 'asc' ? 'asc' : 'desc';
        
        console.log('[FilterModule] 🔄 applySortConfig:', sortField, dir);
        
        // ✅ R7.1.1-FIX: CHỈ phát event sort, KHÔNG đụng vào category
        document.dispatchEvent(new CustomEvent('results:sortChanged', {
            detail: {
            field: sortField,
            direction: dir
            }
        }));
        
        this.updateBadge();
        
        console.log('[FilterModule] ✅ Sort applied without touching category');
        },

        // Cập nhật badge ON trên nút Filter bottom-nav
        updateBadge() {
            const navFilterBtn = document.getElementById('filter-nav-btn');
            if (!navFilterBtn) return;

            // 1) 判定ロジック（r7.1.0 の考え方を踏襲）
            const hasFilter = !!state.fieldId && !!state.value;

            // Sort: chỉ coi là ON nếu khác DEFAULT_SORT
            const isSortModified =
                String(state.sortField || '') !== String(DEFAULT_SORT.field) ||
                String(state.sortDirection || '') !== String(DEFAULT_SORT.direction);
            const hasSort = !!isSortModified;

            // Category: khác 'all' thì ON
            const hasCategory = !!state.category && state.category !== 'all';

            const active = hasFilter || hasSort || hasCategory;

            // 2) Class dùng cho CSS (r7.1.0方式)
            navFilterBtn.classList.toggle('has-active-filter', active);

            // 3) IMPORTANT: HTML có inline style display:none nên phải set bằng JS
            const badgeSpan = navFilterBtn.querySelector('.filter-active-badge');
            if (badgeSpan) {
                badgeSpan.style.display = active ? 'inline-flex' : 'none';
                // Nếu muốn text hiển thị rõ (trường hợp span trống)
                if (!badgeSpan.textContent || !badgeSpan.textContent.trim()) {
                badgeSpan.textContent = 'ON';
                }
            }

            // 4) (Tuỳ chọn) debug gọn
            // console.log('[FilterModule] updateBadge:', { hasFilter, hasSort, hasCategory, active });
        },

        triggerFilter() {
            console.log('Triggering filter', state.fieldId, state.value);
            window.SearchModule?.performSearch?.();
            this.updateBadge();   // NEW: cập nhật badge sau khi lọc
        },


        // --------------------------------------------------------------------
        // Sync helpers
        // --------------------------------------------------------------------
        syncFieldToMobile(fieldId) {
            if (state.mobileFieldEl && state.mobileFieldEl !== document.activeElement) {
                state.mobileFieldEl.value = fieldId;
                this.buildValueOptions(state.mobileValueEl, fieldId);
                console.log(`🔄 Synced field to mobile-inline: ${fieldId}`);
            }
        },

        syncFieldToDesktop(fieldId) {
            if (state.desktopFieldEl && state.desktopFieldEl !== document.activeElement) {
                state.desktopFieldEl.value = fieldId;
                this.buildValueOptions(state.desktopValueEl, fieldId);
                console.log(`🔄 Synced field to desktop: ${fieldId}`);
            }
        },

        syncFieldToModal(fieldId) {
            if (state.modalFieldEl && state.modalFieldEl !== document.activeElement) {
                state.modalFieldEl.value = fieldId;
                this.buildValueOptions(state.modalValueEl, fieldId);
                console.log(`🔄 Synced field to modal: ${fieldId}`);
            }
        },

        syncValueToMobile(value) {
            if (state.mobileValueEl && state.mobileValueEl !== document.activeElement) {
                state.mobileValueEl.value = value;
                console.log(`🔄 Synced value to mobile-inline: ${value}`);
            }
        },

        syncValueToDesktop(value) {
            if (state.desktopValueEl && state.desktopValueEl !== document.activeElement) {
                state.desktopValueEl.value = value;
                console.log(`🔄 Synced value to desktop: ${value}`);
            }
        },

        syncValueToModal(value) {
            if (state.modalValueEl && state.modalValueEl !== document.activeElement) {
                state.modalValueEl.value = value;
                console.log(`🔄 Synced value to modal: ${value}`);
            }
        },

        /**
         * Set category và phát event
         * R7.1.1-FIX: Cho phép thay đổi từ user/reset/restore
         */
        setCategory(category, opts = {}) {
        const cat = (category || 'all').toLowerCase();
        
        // allow-list
        if (!['all', 'mold', 'cutter'].includes(cat)) return;
        
        // ✅ Chỉ cho đổi nhóm khi có nguồn rõ ràng
        // - user: click tab
        // - reset: resetAll()
        // - restore: restoreState()
        const source = opts.source || 'external';
        const allowed = (source === 'user' || source === 'reset' || source === 'restore');
        
        if (!allowed) {
            console.warn('[FilterModule] ⛔ Ignored external category change:', cat);
            return;
        }
        
        // ✅ CHỈ cập nhật nếu khác giá trị hiện tại
        const isChanged = (state.category !== cat);
        state.category = cat;
        
        // Update active tabs everywhere
        const allTabs = document.querySelectorAll(
            '.category-tabs .category-tab,' +
            '.category-tabs-mobile .category-tab,' +
            '.filter-category-tabs .category-tab'
        );
        if (allTabs && allTabs.length) {
            allTabs.forEach(btn => {
            const c = (btn.getAttribute('data-category') || 'all').toLowerCase();
            btn.classList.toggle('active', c === cat);
            });
        }
        
        // ✅ CHỈ phát event nếu giá trị thực sự thay đổi và không silent
        if (isChanged && !opts.silent) {
            document.dispatchEvent(new CustomEvent('category:changed', { 
            detail: { category: cat } 
            }));
            console.log('📢 [FilterModule] Category changed event emitted:', cat);
        }
        
        console.log('FilterModule Category set to', cat, '(source:', source + ')');
        
        // Persist (trừ khi skipPersist)
        if (!opts.skipPersist) this.persistState();
        
        this.updateBadge();
        },



        // --------------------------------------------------------------------
        // Reset functions
        // --------------------------------------------------------------------
        reset() {
            console.log('↩️ Resetting filter module (filter only)...');

            // Reset desktop UI
            if (state.desktopFieldEl) state.desktopFieldEl.selectedIndex = 0;
            if (state.desktopValueEl) state.desktopValueEl.selectedIndex = 0;

            // Reset mobile inline UI
            if (state.mobileFieldEl) state.mobileFieldEl.selectedIndex = 0;
            if (state.mobileValueEl) state.mobileValueEl.selectedIndex = 0;

            // Reset modal UI
            if (state.modalFieldEl) state.modalFieldEl.selectedIndex = 0;
            if (state.modalValueEl) state.modalValueEl.selectedIndex = 0;

            // Reset state
            state.fieldId = '';
            state.value = '';

            // Rebuild value options
            this.buildValueOptions(state.desktopValueEl, '');
            this.buildValueOptions(state.mobileValueEl, '');
            this.buildValueOptions(state.modalValueEl, '');

            // Clear only filter part in storage
            this.persistState(); // giữ sort, chỉ ghi fieldId/value rỗng

            // Re-apply current search query WITHOUT filter
            const currentQuery =
                document.getElementById('search-input')?.value?.trim() ||
                document.getElementById('mobile-search-input')?.value?.trim() ||
                '';

            let results = window.DataManager?.getAllItems?.() || [];
            if (currentQuery && window.DataManager?.search) {
                results = window.DataManager.search(currentQuery);
            }

            document.dispatchEvent(new CustomEvent('search:updated', {
                detail: {
                    results,
                    source: 'filter-reset',
                    query: currentQuery
                }
            }));

            console.log(`✅ Filter reset - ${results.length} items (query: "${currentQuery}")`);
            this.updateBadge();    // NEW
        },

        /**
         * Reset sort về mặc định và áp dụng ngay cho kết quả hiện tại
         */
        resetSort() {
            console.log('↩️ Resetting SORT to default (productionDate DESC)...');

            state.sortField = DEFAULT_SORT.field;
            state.sortDirection = DEFAULT_SORT.direction;

            // Update UI
            if (state.modalSortFieldEl) state.modalSortFieldEl.value = DEFAULT_SORT.field;
            if (state.modalSortDirEl) state.modalSortDirEl.value = DEFAULT_SORT.direction;

            // Persist + apply
            this.persistState();
            this.applySortConfig(state.sortField, state.sortDirection);
            this.updateBadge();    // NEW
        },

        /**
         * Reset ALL:
         * - Xóa search input
         * - Reset lọc
         * - Reset category về "all"
         * - Reset sort về mặc định
         * - Phát search:updated với toàn bộ items
         */
        resetAll() {
            console.log('🔄 Resetting ALL (filter + search + category + sort)...');

            // 1. Clear search inputs
            const searchInputs = [
                document.getElementById('search-input'),
                document.getElementById('mobile-search-input'),
                document.querySelector('.search-input input'),
                document.querySelector('[data-role="search-input"]')
            ].filter(el => el);

            searchInputs.forEach(input => {
                input.value = '';
                console.log('🗑️ Cleared search input:', input.id || input.className);
            });

            // 2. Reset filter state
            if (state.desktopFieldEl) state.desktopFieldEl.selectedIndex = 0;
            if (state.desktopValueEl) state.desktopValueEl.selectedIndex = 0;
            if (state.mobileFieldEl) state.mobileFieldEl.selectedIndex = 0;
            if (state.mobileValueEl) state.mobileValueEl.selectedIndex = 0;
            if (state.modalFieldEl) state.modalFieldEl.selectedIndex = 0;
            if (state.modalValueEl) state.modalValueEl.selectedIndex = 0;

            state.fieldId = '';
            state.value = '';

            this.buildValueOptions(state.desktopValueEl, '');
            this.buildValueOptions(state.mobileValueEl, '');
            this.buildValueOptions(state.modalValueEl, '');

            // 3. Reset category về ALL
            this.setCategory('all', { source: 'reset', skipPersist: true });
            if (state.modalCategoryTabs && state.modalCategoryTabs.length) {
                state.modalCategoryTabs.forEach(btn => {
                    const cat = btn.getAttribute('data-category') || 'all';
                    btn.classList.toggle('active', cat === 'all');
                });
            }

            // 4. Reset sort
            this.resetSort();

            // 5. Get ALL items and emit search:updated
            const allItems = window.DataManager?.getAllItems?.() || [];
            document.dispatchEvent(new CustomEvent('search:updated', {
                detail: {
                    results: allItems,
                    source: 'reset-all',
                    query: ''
                }
            }));

            // 6. Persist state (filter rỗng + sort default)
            this.persistState();

            console.log(`✅ Reset ALL complete - ${allItems.length} total items`);
            this.updateBadge();    // NEW
        },

        // --------------------------------------------------------------------
        // Public state helpers
        // --------------------------------------------------------------------
        getState() {
            return {
                fieldId: state.fieldId,
                value: state.value,
                sortField: state.sortField,
                sortDirection: state.sortDirection
            };
        },

        setState(fieldId, value, sortField, sortDirection) {
            state.fieldId = fieldId || '';
            state.value = value || '';

            if (sortField) state.sortField = sortField;
            if (sortDirection) state.sortDirection = sortDirection;

            // Update desktop UI
            if (state.desktopFieldEl) state.desktopFieldEl.value = state.fieldId;
            if (state.desktopValueEl) state.desktopValueEl.value = state.value;

            // Update mobile inline UI
            if (state.mobileFieldEl) state.mobileFieldEl.value = state.fieldId;
            if (state.mobileValueEl) state.mobileValueEl.value = state.value;

            // Update modal UI
            if (state.modalFieldEl) state.modalFieldEl.value = state.fieldId;
            if (state.modalValueEl) state.modalValueEl.value = state.value;
            if (state.modalSortFieldEl) state.modalSortFieldEl.value = state.sortField || DEFAULT_SORT.field;
            if (state.modalSortDirEl) state.modalSortDirEl.value = state.sortDirection || DEFAULT_SORT.direction;

            // Rebuild value options
            this.buildValueOptions(state.desktopValueEl, state.fieldId);
            this.buildValueOptions(state.mobileValueEl, state.fieldId);
            this.buildValueOptions(state.modalValueEl, state.fieldId);

            this.triggerFilter();
            this.applySortConfig(state.sortField, state.sortDirection);
            this.persistState();
        },

        /**
         * R7.1.1-FIX: Persist filter + sort, KHÔNG persist category (luôn reset về 'all')
         */
        persistState() {
        try {
            const payload = {
            fieldId: state.fieldId,
            value: state.value,
            sortField: state.sortField,
            sortDirection: state.sortDirection
            // ✅ KHÔNG lưu category - luôn reset về 'all' khi tải lại trang
            };
            localStorage.setItem('v777_filter_state', JSON.stringify(payload));
            console.log('💾 Filter state saved:', payload);
        } catch (err) {
            console.warn('⚠️ Failed to persist filter state:', err);
        }
        },


        /**
         * R7.1.1-FIX: Restore state và LUÔN force category = 'all'
         */
        restoreState() {
        try {
            const raw = localStorage.getItem('v777_filter_state'); // ✅ FIX: typo
            
            // ✅ Dù có hay không có state lưu, LUÔN force category = 'all'
            state.category = 'all';
            
            if (!raw) {
            console.log('[FilterModule] No saved state - category set to "all"');
            this.setCategory('all', { source: 'restore', skipPersist: true, silent: true });
            return;
            }
            
            const saved = JSON.parse(raw);
            console.log('Restoring filter state:', saved);
            
            state.fieldId = saved.fieldId || '';
            state.value = saved.value || '';
            state.sortField = saved.sortField || DEFAULT_SORT.field;
            state.sortDirection = saved.sortDirection || DEFAULT_SORT.direction;
            
            // Update UI
            if (state.desktopFieldEl) state.desktopFieldEl.value = state.fieldId;
            if (state.desktopValueEl) state.desktopValueEl.value = state.value;
            if (state.mobileFieldEl) state.mobileFieldEl.value = state.fieldId;
            if (state.mobileValueEl) state.mobileValueEl.value = state.value;
            if (state.modalFieldEl) state.modalFieldEl.value = state.fieldId;
            if (state.modalValueEl) state.modalValueEl.value = state.value;
            if (state.modalSortFieldEl) state.modalSortFieldEl.value = state.sortField;
            if (state.modalSortDirEl) state.modalSortDirEl.value = state.sortDirection;
            
            // Rebuild value options
            this.buildValueOptions(state.desktopValueEl, state.fieldId);
            this.buildValueOptions(state.mobileValueEl, state.fieldId);
            this.buildValueOptions(state.modalValueEl, state.fieldId);
            
            // ✅ Force set category to 'all' và update tabs UI
            const allTabs = document.querySelectorAll(
            '.category-tabs .category-tab,' +
            '.category-tabs-mobile .category-tab,' +
            '.filter-category-tabs .category-tab'
            );
            if (allTabs && allTabs.length) {
            allTabs.forEach(btn => {
                const c = (btn.getAttribute('data-category') || 'all').toLowerCase();
                btn.classList.toggle('active', c === 'all');
            });
            }
            
            console.log('✅ Filter state restored (category forced to "all")');
        } catch (err) {
            console.warn('Failed to restore filter state:', err);
            state.category = 'all';
        }
        },



        clearState() {
            try {
                localStorage.removeItem('v777_filter_state');
                console.log('🗑️ Filter state cleared');
            } catch (err) {
                console.warn('⚠️ Failed to clear filter state:', err);
            }
        },

        // --------------------------------------------------------------------
        // DOM helpers
        // --------------------------------------------------------------------
        appendOption(sel, val, label) {
            const o = document.createElement('option');
            o.value = val;
            o.textContent = label;
            sel.appendChild(o);
        }
    };

    // ========================================================================
    // HELPER FUNCTIONS
    // ========================================================================

    function resolveSelect(candidates) {
        const el = resolveFirst(candidates);
        return ensureSelect(el);
    }

    function ensureSelect(el) {
        if (!el) return null;
        if (el.tagName && el.tagName.toLowerCase() === 'select') return el;
        const inner = el.querySelector?.('select');
        return inner || null;
    }

    function resolveFirst(candidates) {
        if (!candidates) return null;
        for (const sel of candidates) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        return null;
    }

    function queryAll(candidates) {
        if (!candidates) return [];
        const list = [];
        candidates.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => list.push(el));
        });
        return list;
    }

    // ======================================================================== // EXPORT & AUTO-INIT
    // ========================================================================

    // Export ra global
    window.FilterModule = FilterModule;

    // Hàm init an toàn
    function initFilterModule() {
        if (!window.FilterModule) return;
        window.FilterModule.initializeFilters();
    }

    // Đảm bảo chỉ init sau khi DOM sẵn sàng
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFilterModule);
    } else {
        initFilterModule();
    }

    console.log('✅ filter-module-r7.1.0.js loaded');

    // Khởi tạo trạng thái badge nếu hàm tồn tại
    if (window.FilterModule && typeof window.FilterModule.updateBadge === 'function') {
        window.FilterModule.updateBadge();
    }

})();


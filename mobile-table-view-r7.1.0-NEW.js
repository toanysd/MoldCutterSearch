/**
 * mobile-table-view-r7.1.0.js
 *
 * Quản lý hiển thị dạng bảng (table view) RIÊNG cho mobile
 * - Tách biệt hoàn toàn với results-table-r6.9.js
 * - Sort logic riêng, đồng bộ với UIRenderer (DeliveryDeadline mặc định)
 * - Event delegation không conflict
 */

(function() {
    'use strict';

    const MobileTableView = {
        // State management
        state: {
            currentView: 'card',
            allResults: [],
            currentPage: 1,
            pageSize: 50,
            selectedItems: new Set(),
            currentCategory: 'all',

            // Sort state cho header (th để điều khiển icon ↑↓)
            sortColumn: null,
            sortDirection: 'asc',

            // R7.1.0: Cấu hình sort dùng chung (mặc định: ngày sản xuất mới nhất trên cùng)
            // field: 'productionDate' | 'code' | 'name' | 'size' | 'location' | 'company'
            // direction: 'asc' | 'desc'
            sortConfig: {
                field: 'productionDate',
                direction: 'desc'
            },

            // Column filters (table header)
            filters: {
                code: '',
                name: '',
                size: '',
                location: '',
                company: '',
                date: ''
            }
        },

        // DOM elements cache
        elements: {},

        /**
         * Initialize module
         */
        init() {
            console.log('[MobileTableView] r7.1.0 Initializing...');
            
            // QUAN TRỌNG: Chỉ chạy trên iPhone (< 768px)
            // KHÔNG chạy trên iPad (768px+) và Desktop
            const screenWidth = window.innerWidth;
            
            if (screenWidth >= 768) {
                console.log(`[MobileTableView] Screen width: ${screenWidth}px - Tablet/Desktop detected, skipping init`);
                return;
            }
            
            console.log(`[MobileTableView] Screen width: ${screenWidth}px - iPhone detected, initializing...`);
            
            // Cache DOM elements
            this.cacheElements();
            
            // Bind events
            this.bindToggleButtons();
            this.bindTableEvents();
            this.bindPagination();
            this.bindSortHeaders();
            this.bindColumnFilters();
            this.bindFilterToggle();

            
            this.listenToSearchResults();

            this.listenToCategoryChanges(); // ✅ R7.1.1-FIX: Lắng nghe category từ FilterModule

            this.listenToSelectionMode();
            this.listenToSortChanges(); // R7.1.0: Đồng bộ sort với Filter modal

            // Listen selection events from quick result cards
            this.listenToCardSelection();

            
            console.log('[MobileTableView] ✅ Initialized (mobile only)');
        },

        /**
         * Cache DOM elements
         */
        cacheElements() {
            this.elements = {
                toggleButtons: document.querySelectorAll('#mobile-view-toggle .toggle-btn'),
                cardContainer: document.getElementById('quick-results-grid'),
                tableContainer: document.getElementById('mobile-table-container'),
                tableBody: document.getElementById('mobile-table-body'),
                table: document.getElementById('mobile-results-table'),
                pagination: document.getElementById('mobile-pagination'),
                selectAllCheckbox: document.getElementById('select-all-mobile'),
                
                // Toolbar in header
                toolbarInline: document.getElementById('table-toolbar-inline'),
                selectedCountInline: document.getElementById('selected-count-inline'),
                printBtnInline: document.getElementById('mobile-print-btn-inline'),
                clearSelectionBtnInline: document.getElementById('mobile-clear-selection-inline'),
                // Column filter toggle buttons (header + inside filter modal)
                filterToggleBtns: document.querySelectorAll('#toggle-column-filters, [data-role="toggle-column-filters"]'),

                // Column filter inputs & row
                filterInputs: {
                    code: document.getElementById('filter-code'),
                    name: document.getElementById('filter-name'),
                    size: document.getElementById('filter-size'),
                    location: document.getElementById('filter-location'),
                    company: document.getElementById('filter-company'),
                    date: document.getElementById('filter-date')
                },
                filterRow: document.querySelector('#mobile-results-table .column-filters'),
                
                currentPageSpan: document.getElementById('current-page'),
                totalPagesSpan: document.getElementById('total-pages'),
                prevPageBtn: document.getElementById('prev-page-btn'),
                nextPageBtn: document.getElementById('next-page-btn')
            };

            if (!this.elements.table) {
                console.error('[MobileTableView] ❌ mobile-results-table not found!');
            }
        },


        /**
         * Bind toggle buttons
         */
        bindToggleButtons() {
            if (!this.elements.toggleButtons || this.elements.toggleButtons.length === 0) {
                return;
            }

            this.elements.toggleButtons.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const view = btn.getAttribute('data-view');
                    this.switchView(view);
                });
            });

            console.log('[MobileTableView] ✅ Toggle buttons bound');
        },

        /**
         * Bind sort headers
         */
        bindSortHeaders() {
            if (!this.elements.table) return;
            
            // QUAN TRỌNG: Chỉ bind cho mobile table, không dùng querySelector global
            const sortableHeaders = this.elements.table.querySelectorAll('th.sortable');
            
            sortableHeaders.forEach(th => {
                th.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const sortKey = th.getAttribute('data-sort');
                    this.sortTable(sortKey);
                });
            });

            console.log('[MobileTableView] ✅ Sort headers bound:', sortableHeaders.length);
        },

        /**
         * Bind column filter inputs
         */
        bindColumnFilters() {
            if (!this.elements.filterInputs) return;

            const inputs = this.elements.filterInputs;

            const attach = (key) => {
                const input = inputs[key];
                if (!input) return;

                input.addEventListener('input', () => {
                    this.state.filters[key] = input.value.trim().toLowerCase();
                    this.state.currentPage = 1;
                    if (this.state.currentView === 'table') {
                        this.renderTable();
                    }
                });
            };

            attach('code');
            attach('name');
            attach('size');
            attach('location');
            attach('company');
            attach('date');

            console.log('[MobileTableView] ✅ Column filters bound');
        },

        /** * Bind filter row toggle buttons (header + filter modal) */
        bindFilterToggle() {
            const buttons = this.elements.filterToggleBtns;
            const table = this.elements.table;

            if (!buttons || buttons.length === 0 || !table) {
                return;
            }

            const handleToggle = (e) => {
                if (e) {
                e.preventDefault();
                e.stopPropagation();
                }

                const isVisible = table.classList.toggle('filters-visible');

                // Cập nhật trạng thái active cho TẤT CẢ nút toggle (header + modal)
                buttons.forEach((btn) => {
                if (!btn) return;
                btn.classList.toggle('active', isVisible);
                });

                console.log('[MobileTableView] Filter row visible:', isVisible);
            };

            buttons.forEach((btn) => {
                if (!btn) return;
                btn.addEventListener('click', handleToggle);
            });

            console.log('[MobileTableView] ✅ Filter row toggle buttons bound:', buttons.length);
        },



        /**
         * Bind table events
         */
        bindTableEvents() {
            // Select all checkbox
            if (this.elements.selectAllCheckbox) {
                this.elements.selectAllCheckbox.addEventListener('change', (e) => {
                    this.toggleSelectAll(e.target.checked);
                });
            }

            // Clear selection button in header
            if (this.elements.clearSelectionBtnInline) {
                this.elements.clearSelectionBtnInline.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    // Gọi clearSelection với ngữ cảnh MobileTableView
                    this.clearSelection();
                });
            }


            // Print button inline
            if (this.elements.printBtnInline) {
                this.elements.printBtnInline.addEventListener('click', () => {
                    this.handlePrint();
                });
            }


            // Table body checkbox delegation - QUAN TRỌNG: Chỉ trong mobile table
            if (this.elements.tableBody) {
                this.elements.tableBody.addEventListener('change', (e) => {
                    if (e.target.type === 'checkbox' && e.target.classList.contains('row-checkbox')) {
                        const itemId = e.target.getAttribute('data-id');
                        const itemType = e.target.getAttribute('data-type');
                        this.toggleItemSelection(itemId, itemType, e.target.checked);
                    }
                });
                
                // Backup: click event
                this.elements.tableBody.addEventListener('click', (e) => {
                    if (e.target.type === 'checkbox' && e.target.classList.contains('row-checkbox')) {
                        const itemId = e.target.getAttribute('data-id');
                        const itemType = e.target.getAttribute('data-type');
                        setTimeout(() => {
                            this.toggleItemSelection(itemId, itemType, e.target.checked);
                        }, 0);
                    }
                });
            }

            // R7.0.8: Strictly control which cells can open modal
            if (this.elements.tableBody) {
                this.elements.tableBody.addEventListener('click', (e) => {
                    // Vị trí click
                    const isCheckboxCell = e.target.closest('td.col-select');
                    const isCheckbox = e.target.type === 'checkbox';
                    const isNameCell = e.target.closest('td.col-name');

                    // 1) Nếu là vùng checkbox → chỉ xử lý chọn, KHÔNG cho modal nào khác bắt sự kiện
                    if (isCheckboxCell || isCheckbox) {
                        e.stopPropagation();
                        console.log('[MobileTableView] 🚫 Checkbox area clicked - modal prevented');
                        return;
                    }

                    // 2) Nếu KHÔNG phải ô 名称 → chặn nổi bọt để handler toàn cục không mở modal
                    if (!isNameCell) {
                        e.stopPropagation();
                        console.log('[MobileTableView] 🚫 Non-name cell clicked - modal prevented');
                    }
                    // 3) Trường hợp còn lại (isNameCell) → cho phép bubble tới tdName.addEventListener
                }, true); // capture phase
            }




            console.log('[MobileTableView] ✅ Table events bound');
        },

        /**
         * Bind pagination
         */
        bindPagination() {
            if (this.elements.prevPageBtn) {
                this.elements.prevPageBtn.addEventListener('click', () => {
                    this.goToPreviousPage();
                });
            }

            if (this.elements.nextPageBtn) {
                this.elements.nextPageBtn.addEventListener('click', () => {
                    this.goToNextPage();
                });
            }

            console.log('[MobileTableView] ✅ Pagination bound');
        },

        /**
         * Listen to search results
         */
        listenToSearchResults() {
            document.addEventListener('search:updated', (e) => {
                const { results } = e.detail || {};
                if (results && Array.isArray(results)) {
                    console.log('[MobileTableView] Search results updated:', results.length);
                    this.updateResults(results);
                }
            });
        },

        /**
         * Listen to global sort changes (from Filter modal)
         * イベント: results:sortChanged でカードとテーブルの順番を同期
         */
          listenToSortChanges() {
            document.addEventListener('results:sortChanged', (e) => {
            const cfg = e.detail || {};
            const field = cfg.field || 'productionDate';
            const direction = cfg.direction === 'asc' ? 'asc' : 'desc';
            
            console.log('[MobileTableView] results:sortChanged:', { field, direction });

            if (!Array.isArray(this.state.allResults) || this.state.allResults.length === 0) {
                console.warn('[MobileTableView] ⚠️ No results to sort (mobile table)');
                return;
            }

            // ✅ CHỈ cập nhật sort config, KHÔNG đụng vào category
            this.state.sortConfig = { field, direction };
            this.state.allResults = this.applySortConfig(this.state.allResults, this.state.sortConfig);

            // Khi sort đổi từ Filter, reset về trang 1 và re-render nếu đang ở view table
            if (this.state.currentView === 'table') {
                this.state.currentPage = 1;
                this.renderTable();
            }
            
            console.log('[MobileTableView] ✅ Sorted without changing category');
            });
        },


          /**
         * Listen to category changes from FilterModule
         * R7.1.1-FIX: Đồng bộ category từ FilterModule để lọc đúng khi sort
         */
        listenToCategoryChanges() {
            document.addEventListener('category:changed', (e) => {
            const category = e.detail?.category || 'all';
            console.log('[MobileTableView] 📂 Category changed to:', category);
            
            // ✅ Cập nhật state category
            this.state.currentCategory = category;
            
            // Re-render table nếu đang ở view table
            if (this.state.currentView === 'table') {
                this.state.currentPage = 1;
                this.renderTable();
            }
            });
            
            console.log('[MobileTableView] ✅ Category listener bound');
        },

        /** Listen to selection mode changes (print selection ON/OFF) */
        // Listen selection mode changes + print / selection ON/OFF
        listenToSelectionMode() {
            // Bật/tắt toolbar theo SelectionState, KHÔNG tự clear danh sách chọn
            document.addEventListener('selection:modeChanged', (e) => {
                const enabled = e.detail?.enabled || false;
                console.log('[MobileTableView] Selection mode changed:', enabled);

                // Toolbar dùng chung cho cả card + table, nằm ở header
                if (this.elements.toolbarInline) {
                    this.elements.toolbarInline.style.display = enabled ? 'flex' : 'none';
                }

                // Cập nhật lại số lượng, trạng thái nút In / Xóa
                this.updateSelectionUI();
            });

            // Khi danh sách chọn thay đổi, cập nhật lại số lượng + trạng thái checkbox
            document.addEventListener('selection:changed', () => {
                this.updateSelectionUI();
            });
        },




        /**
         * Listen to selection changes coming from quick result cards (card view)
         * イベント: mobileCardSelectionChanged から選択状態を同期する
         */
        listenToCardSelection() {
            // Card view đã gọi trực tiếp SelectionManager,
            // MobileTableView chỉ cần lắng nghe selection:changed (đã làm ở listenToSelectionMode)
            // nên hiện tại không cần xử lý gì thêm ở đây.
        },



        /**
         * Switch view
         */
        switchView(view) {
            if (view === this.state.currentView) return;

            console.log('[MobileTableView] Switching to', view);
            this.state.currentView = view;

            // Update toggle buttons
            this.elements.toggleButtons.forEach(btn => {
                if (btn.getAttribute('data-view') === view) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });

            // Show/hide
            if (view === 'table') {
                this.elements.cardContainer.style.display = 'none';
                this.elements.tableContainer.style.display = 'flex';
                this.renderTable();
            } else {
                this.elements.cardContainer.style.display = 'grid';
                this.elements.tableContainer.style.display = 'none';
            }

            // Sau khi đổi view, quyết định hiển thị toolbar dựa vào SelectionState (dùng chung cho card + table)
            if (this.elements.toolbarInline) {
                const selectionOn = !!window.SelectionState?.active;
                this.elements.toolbarInline.style.display = selectionOn ? 'flex' : 'none';
            }



            document.dispatchEvent(new CustomEvent('mobile:viewModeChanged', {
                detail: { view }
            }));

            console.log('[MobileTableView] ✅ Switched to', view);
        },

        /** * Update results */
        updateResults(results) {
            const raw = Array.isArray(results) ? results : [];

            // R7.1.0: Áp dụng cấu hình sort hiện tại (mặc định: ngày sản xuất mới nhất)
            this.state.allResults = this.applySortConfig(raw, this.state.sortConfig);

            // 🔄 QUAN TRỌNG: Reset category về 'All' khi tải dữ liệu mới
            this.state.currentCategory = 'all';
            console.log('[MobileTableView] ✅ updateResults: Category reset to "all"');

            this.state.currentPage = 1;
            this.state.selectedItems.clear();

            if (this.state.currentView === 'table') {
                this.renderTable();
            }

            this.updateSelectionUI();
        },



          /**
         * Get filtered items based on column filters AND category
         * R7.1.1-FIX: Thêm lọc theo category
         */
        getFilteredItems() {
            const filters = this.state.filters || {};
            const hasColumnFilter = Object.values(filters).some(v => v && v.length > 0);
            
            // ✅ R7.1.1-FIX: Lọc theo category TRƯỚC
            const category = this.state.currentCategory || 'all';
            let items = this.state.allResults;
            
            if (category !== 'all') {
            items = items.filter(it => it.itemType === category);
            console.log(`[MobileTableView] 📂 Filtered by category "${category}":`, items.length);
            }

            // Nếu không có column filter thì trả về danh sách đã lọc category
            if (!hasColumnFilter) {
            return items;
            }

            // ✅ Áp dụng column filters trên danh sách đã lọc category
            const toLower = (v) => (v || '').toString().toLowerCase();
            return items.filter(item => {
            // Code
            const codeField = item.itemType === 'mold'
                ? (item.MoldID || item.MoldCode || '')
                : (item.CutterNo || item.CutterID || '');
            const matchesCode = !filters.code || toLower(codeField).includes(filters.code);

            // Name
            const nameField = item.displayName || item.MoldName || '';
            const matchesName = !filters.name || toLower(nameField).includes(filters.name);

            // Size
            const sizeField = item.displayDimensions || item.cutlineSize || '';
            const matchesSize = !filters.size || toLower(sizeField).includes(filters.size);

            // Location
            const locField =
                item.displayLocation ||
                item.rackInfo?.RackNumber ||
                item.rackLayerInfo?.RackLayerNumber ||
                '';
            const matchesLocation = !filters.location || toLower(locField).includes(filters.location);

            // Company
            const companyField =
                item.storageCompanyInfo?.CompanyShortName ||
                item.storageCompanyInfo?.CompanyName ||
                '';
            const matchesCompany = !filters.company || toLower(companyField).includes(filters.company);

            // Date (match raw text)
            const dateField =
                item.jobInfo?.DeliveryDeadline ||
                item.MoldDate ||
                item.DateEntry ||
                '';
            const matchesDate = !filters.date || dateField.includes(filters.date);

            return matchesCode &&
                matchesName &&
                matchesSize &&
                matchesLocation &&
                matchesCompany &&
                matchesDate;
            });
        },



        /**
         * Render table
         */
        renderTable() {
            if (!this.elements.tableBody) {
                console.error('[MobileTableView] Table body not found');
                return;
            }

            // Apply column filters
            const workingItems = this.getFilteredItems();
            const totalItems = workingItems.length;
            const totalPages = Math.max(1, Math.ceil(totalItems / this.state.pageSize));

            // Giữ currentPage trong khoảng hợp lệ
            if (this.state.currentPage > totalPages) {
                this.state.currentPage = totalPages;
            }
            if (this.state.currentPage < 1) {
                this.state.currentPage = 1;
            }

            const startIdx = (this.state.currentPage - 1) * this.state.pageSize;
            const endIdx = Math.min(startIdx + this.state.pageSize, totalItems);
            const pageItems = workingItems.slice(startIdx, endIdx);


            console.log('[MobileTableView] Rendering:', pageItems.length, 'items');

            // Clear
            this.elements.tableBody.innerHTML = '';

            // Render rows
            if (pageItems.length === 0) {
                this.elements.tableBody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align: center; padding: 40px; color: #999;">
                            検索結果なし
                        </td>
                    </tr>
                `;
            } else {
                pageItems.forEach(item => {
                    const row = this.createTableRow(item);
                    this.elements.tableBody.appendChild(row);
                });
            }

            // Update pagination
            this.updatePaginationUI(totalPages);

            console.log('[MobileTableView] ✅ Table rendered');

            // Sau khi render xong bảng, đồng bộ lại trạng thái checkbox theo SelectionState
            if (window.SelectionManager && typeof SelectionManager.updateDomHighlights === 'function') {
                SelectionManager.updateDomHighlights();
            }
            
        },

        /**
         * Create table row - MOBILE VERSION
         * - Chỉ cột 名称 (tdName) là clickable để mở detail modal
         * - data-id luôn là MoldID / CutterID (ưu tiên ID số)
         */
        createTableRow(item) {
            const tr = document.createElement('tr');
            const isMold = item.itemType === 'mold';

            // ID dùng cho selection & modal
            const rawId = isMold
                ? (item.MoldID || item.MoldCode)
                : (item.CutterID || item.CutterNo);

            const itemId = rawId; // giữ dạng string cho Set; parseInt khi gọi modal
            const isSelected = this.state.selectedItems.has(itemId);

            // Gán attribute để các handler khác (nếu có) vẫn dùng được
            tr.setAttribute('data-id', itemId);
            tr.setAttribute('data-type', isMold ? 'mold' : 'cutter');

            // === COL 1: Checkbox ===
            const tdCheckbox = document.createElement('td');
            tdCheckbox.className = 'col-select';
            tdCheckbox.innerHTML = `
                <input type="checkbox" 
                    class="row-checkbox" 
                    data-id="${this.escapeHtml(itemId)}"
                    data-type="${item.itemType}"
                    ${isSelected ? 'checked' : ''}>
            `;

            // === COL 2: Code (MoldID / CutterNo) ===
            const tdCode = document.createElement('td');
            tdCode.className = 'col-code';
            if (isMold) {
                tdCode.textContent = item.MoldID || '-';
                tdCode.style.cssText = 'color: #1976D2 !important; font-weight: 600 !important;';
            } else {
                tdCode.textContent = item.CutterNo || item.displayCode || '-';
                tdCode.style.cssText = 'color: #E65100 !important; font-weight: 600 !important;';
            }

            // === COL 3: Name (clickable → mở modal) ===
            const tdName = document.createElement('td');
            tdName.className = 'col-name';
            tdName.textContent = item.displayName || item.MoldName || '-';

            if (isMold) {
                tdName.style.cssText = 'color: #1976D2 !important; font-weight: 500; cursor: pointer; text-decoration: underline;';
            } else {
                tdName.style.cssText = 'color: #E65100 !important; font-weight: 500; cursor: pointer; text-decoration: underline;';
            }

            // CHỈ click vào Name mới mở modal
            tdName.addEventListener('click', (e) => {
                e.stopPropagation();

                const type = isMold ? 'mold' : 'cutter';

                // TRỌNG TÂM: MobileDetailModal.show(itemObject, type)
                if (window.MobileDetailModal && window.MobileDetailModal.show) {
                    window.MobileDetailModal.show(item, type);
                }
            });


            // === COL 4: Size ===
            const tdSize = document.createElement('td');
            tdSize.className = 'col-size';
            tdSize.textContent = item.displayDimensions || item.cutlineSize || 'N/A';
            tdSize.style.color = '#666';

            // === COL 5: Location (Rack-Layer) ===
            const tdLocation = document.createElement('td');
            tdLocation.className = 'col-location';
            const rackId = item.rackInfo?.RackID || '-';
            const layerNum = item.rackLayerInfo?.RackLayerNumber || '-';
            tdLocation.textContent = `${rackId}-${layerNum}`;
            tdLocation.style.cssText = 'font-family: "Courier New", monospace; font-weight: 600; text-align: center;';
            if (rackId !== '-') {
                const rackNum = parseInt(rackId);
                if (rackNum >= 70) {
                    tdLocation.style.cssText += ' color: #D32F2F !important; background: #FFEBEE !important;';
                } else {
                    tdLocation.style.cssText += ' color: #1976D2 !important; background: #E3F2FD !important;';
                }
            }

            // === COL 6: Company ===
            const tdCompany = document.createElement('td');
            tdCompany.className = 'col-company';
            const companyName =
                item.storageCompanyInfo?.CompanyShortName ||
                item.storageCompanyInfo?.CompanyName ||
                'N/A';
            tdCompany.textContent = companyName;

            if (companyName === 'YSD' || item.storage_company === '2') {
                tdCompany.style.cssText = 'color: #1976D2 !important; font-weight: 600 !important; background: #E3F2FD !important;';
            } else if (companyName !== 'N/A') {
                tdCompany.style.cssText = 'color: #E65100 !important; font-weight: 600 !important; background: #FFF3E0 !important;';
            }

            // === COL 7: Date (DeliveryDeadline) ===
            const tdDate = document.createElement('td');
            tdDate.className = 'col-date';
            const deliveryDate =
                item.jobInfo?.DeliveryDeadline ||
                item.MoldDate ||
                item.DateEntry ||
                '-';
            tdDate.textContent = this.formatDate(deliveryDate);
            tdDate.style.color = '#757575';

            // Selected state
            if (isSelected) {
                tr.classList.add('selected');
            }

            // Append all columns IN ORDER
            tr.appendChild(tdCheckbox);
            tr.appendChild(tdCode);
            tr.appendChild(tdName);
            tr.appendChild(tdSize);
            tr.appendChild(tdLocation);
            tr.appendChild(tdCompany);
            tr.appendChild(tdDate);

            return tr;
        },


        /**
         * Format date
         */
        formatDate(dateStr) {
            if (!dateStr || dateStr === '-') return '-';
            
            try {
                const date = new Date(dateStr);
                if (isNaN(date.getTime())) return dateStr;
                
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                
                return `${year}/${month}/${day}`;
            } catch (e) {
                return dateStr;
            }
        },

        /**
         * Escape HTML
         */
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },

        /**
         * Update pagination UI
         */
        updatePaginationUI(totalPages) {
            if (this.elements.currentPageSpan) {
                this.elements.currentPageSpan.textContent = this.state.currentPage;
            }

            if (this.elements.totalPagesSpan) {
                this.elements.totalPagesSpan.textContent = totalPages || 1;
            }

            if (this.elements.prevPageBtn) {
                this.elements.prevPageBtn.disabled = this.state.currentPage <= 1;
            }

            if (this.elements.nextPageBtn) {
                this.elements.nextPageBtn.disabled = this.state.currentPage >= totalPages;
            }
        },

        /**
         * Go to previous page
         */
        goToPreviousPage() {
            if (this.state.currentPage > 1) {
                this.state.currentPage--;
                this.renderTable();
            }
        },

        /**
         * Go to next page
         */
        goToNextPage() {
            const totalPages = Math.max(1, Math.ceil(this.getFilteredItems().length / this.state.pageSize));
            if (this.state.currentPage < totalPages) {
                this.state.currentPage++;
                this.renderTable();
            }
        },

        /**
         * Toggle select all
         */
        // Chọn / bỏ chọn toàn bộ các dòng đang hiển thị trong bảng (trang hiện tại)
        toggleSelectAll(checked) {
            if (!this.elements.tableBody || !window.SelectionManager) return;

            const rows = this.elements.tableBody.querySelectorAll('tr[data-id][data-type]');
            const batch = [];

            rows.forEach(row => {
                const id = row.getAttribute('data-id');
                const type = (row.getAttribute('data-type') || 'mold').toLowerCase();
                const checkbox = row.querySelector('input.row-checkbox[type="checkbox"]');

                if (checked) {
                    batch.push([id, type, null]);
                    if (checkbox) checkbox.checked = true;
                    row.classList.add('selected');
                } else {
                    batch.push([id, type]);
                    if (checkbox) checkbox.checked = false;
                    row.classList.remove('selected');
                }
            });

            if (checked) {
                SelectionManager.addMultiple(batch);
            } else {
                SelectionManager.removeMultiple(batch);
            }

            this.updateSelectionUI();
        },


        /**
         * Toggle item selection
         */
        toggleItemSelection(itemId, itemType, checked) {
            const type = itemType || 'mold';
            if (!window.SelectionManager) return;

            if (checked) {
                SelectionManager.addItem(itemId, type);
            } else {
                SelectionManager.removeItem(itemId, type);
            }

            // SelectionManager sẽ phát selection:changed, nhưng vẫn gọi để chắc chắn sync toolbar
            this.updateSelectionUI();
        },


        /**
         * Update selection UI
         */
        // Cập nhật toolbar + nút In + nút 全解除 + checkbox "select all"
        updateSelectionUI() {
            // Lấy danh sách từ SelectionManager (nguồn chuẩn)
            const items = (window.SelectionManager && SelectionManager.getSelectedItems)
                ? SelectionManager.getSelectedItems()
                : (window.SelectionState && Array.isArray(window.SelectionState.items)
                    ? window.SelectionState.items
                    : []);

            const count = items.length;

            console.log('[MobileTableView] updateSelectionUI → count =', count);

            // Hiển thị số lượng đã chọn
            if (this.elements.selectedCountInline) {
                this.elements.selectedCountInline.textContent = count;
            }

            // Bật/tắt nút In và nút 全解除
            const hasSelection = count > 0;
            if (this.elements.printBtnInline) {
                this.elements.printBtnInline.disabled = !hasSelection;
                this.elements.printBtnInline.classList.toggle('disabled', !hasSelection);
            }
            if (this.elements.clearSelectionBtnInline) {
                this.elements.clearSelectionBtnInline.disabled = !hasSelection;
                this.elements.clearSelectionBtnInline.classList.toggle('disabled', !hasSelection);
            }

            // Cập nhật checkbox "chọn tất cả" cho trang hiện tại
            if (this.elements.selectAllCheckbox && this.elements.tableBody) {
                const rows = this.elements.tableBody.querySelectorAll('tr[data-id][data-type]');
                let allChecked = true;
                let anyRow = false;

                rows.forEach(row => {
                    const id = row.getAttribute('data-id');
                    const type = (row.getAttribute('data-type') || 'mold').toLowerCase();
                    const isChecked = items.some(sel => String(sel.id) === String(id) && sel.type === type);
                    anyRow = true;
                    if (!isChecked) {
                        allChecked = false;
                    }
                });

                this.elements.selectAllCheckbox.indeterminate = !allChecked && hasSelection && anyRow;
                this.elements.selectAllCheckbox.checked = allChecked && anyRow;
            }
        },

        // Xóa toàn bộ lựa chọn (card + table, mọi view)
        clearSelection() {
            if (!window.SelectionManager) return;
            SelectionManager.clear();
            if (this.elements.selectAllCheckbox) {
                this.elements.selectAllCheckbox.checked = false;
                this.elements.selectAllCheckbox.indeterminate = false;
            }
            this.updateSelectionUI();
        },

        // Handle print - mở trang in A4 song ngữ JP-VI
        handlePrint() {
            if (!window.SelectionManager || !window.SelectionState) {
                alert('[translate:SelectionManager が見つかりません] | SelectionManager không tồn tại.');
                return;
            }

            const selectedItems = SelectionManager.getSelectedItems(); // [{id, type}, ...]

            if (!selectedItems.length) {
                alert('[translate:印刷する結果が選択されていません。]\nChưa chọn kết quả nào để in.');
                return;
            }

            // Lấy dữ liệu chi tiết từ UIRenderer.state.allResults
            const allResults = (window.UIRenderer && UIRenderer.state && Array.isArray(UIRenderer.state.allResults))
                ? UIRenderer.state.allResults
                : (this.state.allResults || []);

            if (!allResults.length) {
                alert('[translate:印刷用のデータが読み込まれていません。]\nKhông có dữ liệu kết quả để in.');
                return;
            }

            const records = [];
            selectedItems.forEach(sel => {
                const id = String(sel.id);
                const type = (sel.type || 'mold').toLowerCase();
                
                const item = allResults.find(it => {
                if (type === 'mold') {
                    return String(it.MoldID || it.MoldCode || '') === id;
                }
                return String(it.CutterID || it.CutterNo || '') === id;
                });
                
                if (item) records.push({ sel, item });
            });

            if (!records.length) {
                alert('[translate:選択された結果の詳細を取得できませんでした。]\nKhông tìm thấy chi tiết cho các kết quả đã chọn.');
                return;
            }

            // Tạo cửa sổ in
            const win = window.open('', '_blank');
            if (!win) {
                alert('[translate:ポップアップがブロックされています。]\nCửa sổ in bị chặn (popup blocked).');
                return;
            }

            const rowsHtml = records.map(({ sel, item }, idx) => {
                const isMold = (sel.type === 'mold');
                const code = isMold
                ? (item.MoldID || item.MoldCode || '')
                : (item.CutterNo || item.CutterID || '');
                const name = item.displayName || item.MoldName || '';
                const size = item.displayDimensions || item.cutlineSize || '';
                const loc = item.displayLocation
                || item.rackInfo?.RackLocation
                || item.rackLayerInfo?.RackLayerNumber
                || '';
                const company = item.storageCompanyInfo?.CompanyShortName
                || item.storageCompanyInfo?.CompanyName
                || '';
                const date = item.jobInfo?.DeliveryDeadline || item.MoldDate || item.DateEntry || '';

                return `
                <tr>
                    <td style="padding:4px 8px; border:1px solid #ccc;">${idx + 1}</td>
                    <td style="padding:4px 8px; border:1px solid #ccc;">${isMold ? '[translate:金型]' : '[translate:抜型]'}</td>
                    <td style="padding:4px 8px; border:1px solid #ccc;">${code}</td>
                    <td style="padding:4px 8px; border:1px solid #ccc;">${name}</td>
                    <td style="padding:4px 8px; border:1px solid #ccc;">${size}</td>
                    <td style="padding:4px 8px; border:1px solid #ccc;">${loc}</td>
                    <td style="padding:4px 8px; border:1px solid #ccc;">${company}</td>
                    <td style="padding:4px 8px; border:1px solid #ccc;">${date}</td>
                </tr>
                `;
            }).join('');

            const html = `
                <!DOCTYPE html>
                <html lang="ja">
                <head>
                <meta charset="UTF-8" />
                <title>[translate:選択結果の印刷] | In danh sách đã chọn</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 12px; }
                    h1 { font-size: 16px; margin-bottom: 8px; }
                    table { border-collapse: collapse; width: 100%; }
                    th { background: #f0f0f0; }
                    @media print {
                    body { margin: 10mm; }
                    }
                </style>
                </head>
                <body>
                <h1>[translate:選択結果一覧] | Danh sách kết quả đã chọn</h1>
                <table>
                    <thead>
                    <tr>
                        <th style="padding:4px 8px; border:1px solid #ccc;">No.</th>
                        <th style="padding:4px 8px; border:1px solid #ccc;">[translate:種別] | Loại</th>
                        <th style="padding:4px 8px; border:1px solid #ccc;">[translate:コード] | Mã</th>
                        <th style="padding:4px 8px; border:1px solid #ccc;">[translate:名称] | Tên</th>
                        <th style="padding:4px 8px; border:1px solid #ccc;">[translate:寸法] | Kích thước</th>
                        <th style="padding:4px 8px; border:1px solid #ccc;">[translate:棚番] | Vị trí</th>
                        <th style="padding:4px 8px; border:1px solid #ccc;">[translate:保管] | Công ty</th>
                        <th style="padding:4px 8px; border:1px solid #ccc;">[translate:日付] | Ngày</th>
                    </tr>
                    </thead>
                    <tbody>
                    ${rowsHtml}
                    </tbody>
                </table>
                <script>
                    window.onload = function() {
                    setTimeout(function() { window.print(); }, 300);
                    };
                </script>
                </body>
                </html>
            `;

            win.document.open();
            win.document.write(html);
            win.document.close();
            win.focus();

            console.log('[MobileTableView] Print window opened for', records.length, 'items');
        },


        /**
         * Open detail modal
         */
        openDetailModal(item, itemId) {
            console.log('[MobileTableView] Opening detail modal for:', itemId);
            
            // R7.0.8: Determine correct itemType
            const itemType = item.itemType || (item.MoldID ? 'mold' : 'cutter');
            
            document.dispatchEvent(new CustomEvent('quick:select', {
                detail: {
                    itemType: itemType,
                    itemId: itemId,
                    fullData: item
                }
            }));
            
            if (window.MobileDetailModal && window.MobileDetailModal.show) {
                window.MobileDetailModal.show(itemType, itemId);
            }
        },

        // ======================================================================
        // R7.1.0: Sort helpers
        // ======================================================================

        /**
         * Map key trên header / Filter → field sort chung
         */
        mapSortKeyToField(sortKey) {
            switch (sortKey) {
                case 'code': return 'code';
                case 'name': return 'name';
                case 'size': return 'size';
                case 'location': return 'location';
                case 'company': return 'company';
                case 'date': return 'productionDate';
                default: return 'productionDate';
            }
        },

        /**
         * Áp dụng cấu hình sort cho danh sách.
         * Dùng cùng logic với UIRenderer để card/table luôn cùng thứ tự.
         */
        applySortConfig(items, sortConfig) {
            const field = sortConfig?.field || 'productionDate';
            const direction = sortConfig?.direction === 'asc' ? 'asc' : 'desc';

            const list = Array.isArray(items) ? items.slice(0) : [];

            const compare = (a, b) => {
                switch (field) {
                    case 'code': {
                        const aCode = String(a.displayCode || a.MoldCode || a.CutterNo || '').trim();
                        const bCode = String(b.displayCode || b.MoldCode || b.CutterNo || '').trim();
                        return aCode.localeCompare(bCode, 'ja');
                    }
                    case 'name': {
                        const aName = String(a.displayName || a.MoldName || a.CutterName || '').trim();
                        const bName = String(b.displayName || b.MoldName || b.CutterName || '').trim();
                        return aName.localeCompare(bName, 'ja');
                    }
                    case 'size': {
                        const aSize = String(a.displayDimensions || a.cutlineSize || '').trim();
                        const bSize = String(b.displayDimensions || b.cutlineSize || '').trim();
                        return aSize.localeCompare(bSize, 'ja');
                    }
                    case 'location': {
                        const rackA = parseInt(a.rackInfo?.RackID ?? a.rackLayerInfo?.RackID ?? 999, 10);
                        const rackB = parseInt(b.rackInfo?.RackID ?? b.rackLayerInfo?.RackID ?? 999, 10);
                        if (rackA !== rackB) return rackA - rackB;

                        const layerA = parseInt(a.rackLayerInfo?.RackLayerNumber ?? 999, 10);
                        const layerB = parseInt(b.rackLayerInfo?.RackLayerNumber ?? 999, 10);
                        return layerA - layerB;
                    }
                    case 'company': {
                        const aCompany = String(
                            a.storageCompanyInfo?.CompanyShortName ||
                            a.storageCompanyInfo?.CompanyName ||
                            'ZZZ'
                        );
                        const bCompany = String(
                            b.storageCompanyInfo?.CompanyShortName ||
                            b.storageCompanyInfo?.CompanyName ||
                            'ZZZ'
                        );
                        return aCompany.localeCompare(bCompany, 'ja');
                    }
                    case 'productionDate':
                    default: {
                        // Ưu tiên DeliveryDeadline (jobs), sau đó ProductionDate / displayDate
                        const aDateRaw = a.jobInfo?.DeliveryDeadline ||
                            a.ProductionDate || a.displayDate || a.MoldDate || a.DateEntry;
                        const bDateRaw = b.jobInfo?.DeliveryDeadline ||
                            b.ProductionDate || b.displayDate || b.MoldDate || b.DateEntry;

                        const baseOld = new Date('1900-01-01').getTime();
                        const numA = aDateRaw ? new Date(aDateRaw).getTime() - baseOld : 0;
                        const numB = bDateRaw ? new Date(bDateRaw).getTime() - baseOld : 0;

                        return numA - numB;
                    }
                }
            };

            list.sort(compare);

            if (direction === 'desc') {
                list.reverse();
            }

            return list;
        },


        /**
         * Sort table
         */
        sortTable(sortKey) {
            console.log('[MobileTableView] Sorting by', sortKey);

            // Cập nhật trạng thái sort cho header (icon ↑↓)
            if (this.state.sortColumn === sortKey) {
                this.state.sortDirection = this.state.sortDirection === 'asc' ? 'desc' : 'asc';
            } else {
                this.state.sortColumn = sortKey;
                this.state.sortDirection = 'asc';
            }

            const field = this.mapSortKeyToField(sortKey);

            // Đồng bộ với sortConfig chung (dùng chung với Filter modal)
            this.state.sortConfig = {
                field,
                direction: this.state.sortDirection
            };

            this.state.allResults = this.applySortConfig(this.state.allResults, this.state.sortConfig);

            // Update UI (class sort-asc / sort-desc trên header)
            this.updateSortIndicators();

            // Reset về trang 1 và vẽ lại bảng
            this.state.currentPage = 1;
            this.renderTable();

            console.log('[MobileTableView] Sorted', sortKey, this.state.sortDirection, '=> field', field);
        },


        /**
         * Update sort indicators
         */
        updateSortIndicators() {
            if (!this.elements.table) return;
            
            // Remove all sort classes
            const allHeaders = this.elements.table.querySelectorAll('th.sortable');
            allHeaders.forEach(th => {
                th.classList.remove('sort-asc', 'sort-desc');
            });
            
            // Add to current column
            if (this.state.sortColumn) {
                const activeHeader = this.elements.table.querySelector(
                    `th.sortable[data-sort="${this.state.sortColumn}"]`
                );
                if (activeHeader) {
                    activeHeader.classList.add(`sort-${this.state.sortDirection}`);
                }
            }
        },

        /**
         * Get selected items
         */
        getSelectedItems() {
            return Array.from(this.state.selectedItems);
        },

        /**
         * Clear selection
         */
        clearSelection() {
            this.state.selectedItems.clear();
            
            if (this.elements.selectAllCheckbox) {
                this.elements.selectAllCheckbox.checked = false;
            }

            const checkboxes = this.elements.tableBody.querySelectorAll('.row-checkbox');
            checkboxes.forEach(cb => {
                cb.checked = false;
            });

            const rows = this.elements.tableBody.querySelectorAll('tr');
            rows.forEach(row => {
                row.classList.remove('selected');
            });

            this.updateSelectionUI();

            console.log('[MobileTableView] ✅ Selection cleared');
        }
    };

    // Expose to global
    window.MobileTableView = MobileTableView;

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            MobileTableView.init();
        });
    } else {
        MobileTableView.init();
    }

})();

/* ========================================================================
   INVENTORY MANAGER R6.9.8
   ========================================================================
   Quản lý toàn diện chức năng kiểm kê (棚卸 | Inventory Management)
   
   Features:
   - Toggle ON/OFF linh hoạt (iPad: direct toggle, iPhone: via settings)
   - Settings popup với filters nâng cao (Giá/Tầng, Loại, Sắp xếp)
   - Badge "ON" trên nút khi đang bật chế độ kiểm kê
   - Badge kiểm kê trên result cards (ngày + màu xanh nếu kiểm kê hôm nay)
   - Công cụ kiểm kê hàng loạt (Floating icon + Checkbox selection)
   - Tích hợp với CheckInOut và LocationUpdate modules
   
   Created: 2025-11-11
   Last Updated: 2025-11-11
   ======================================================================== */

(function() {
    'use strict';

    // Helper: vuốt xuống từ header để đóng modal (mobile only)
    function attachSwipeToClose(headerEl, modalEl, hideCallback) {
        if (!headerEl || !modalEl || !('ontouchstart' in window)) return;

        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        const resetDrag = () => {
            isDragging = false;
            modalEl.classList.remove('dragging');
            modalEl.style.transform = '';
            modalEl.style.opacity = '';
        };

        const onTouchStart = (e) => {
            if (!e.touches || e.touches.length !== 1) return;
            startY = e.touches[0].clientY;
            currentY = startY;
            isDragging = true;
            modalEl.classList.add('dragging');
        };

        const onTouchMove = (e) => {
            if (!isDragging) return;
            const touchY = e.touches[0].clientY;
            const deltaY = touchY - startY;
            if (deltaY < 0) return; // chỉ xử lý kéo xuống

            currentY = touchY;
            const translateY = Math.min(deltaY, 120);
            const opacity = 1 - Math.min(deltaY / 200, 0.5);

            modalEl.style.transform = `translateY(${translateY}px)`;
            modalEl.style.opacity = opacity;
        };

        const onTouchEnd = () => {
            if (!isDragging) return;
            const deltaY = currentY - startY;

            if (deltaY > 80) {
                resetDrag();
                if (typeof hideCallback === 'function') hideCallback();
            } else {
                resetDrag();
            }
        };

        headerEl.addEventListener('touchstart', onTouchStart, { passive: true });
        headerEl.addEventListener('touchmove', onTouchMove, { passive: true });
        headerEl.addEventListener('touchend', onTouchEnd);
        headerEl.addEventListener('touchcancel', resetDrag);
    }


    // ========================================
    // GLOBAL SELECTION (独立モジュール)
    // ========================================
    window.SelectionState = window.SelectionState || {
        active: false,   // 選択モード đang bật
        items: []        // [{ id, type }]
    };

    window.SelectionManager = window.SelectionManager || {
        setMode(enabled) {
        SelectionState.active = !!enabled;
        if (!enabled) {
            SelectionState.items = [];
            sessionStorage.removeItem('selection.items');
        }
        sessionStorage.setItem('selection.mode', SelectionState.active ? '1' : '0');

        // Cập nhật giao diện + thông báo cho các module khác
        this.updateDomHighlights();
        document.dispatchEvent(new CustomEvent('selection:modeChanged', {
            detail: { enabled: SelectionState.active }
        }));
        document.dispatchEvent(new CustomEvent('selection:changed', {
            detail: { items: [...SelectionState.items] }
        }));
        },

        toggleItem(id, type) {
        id = String(id);
        type = type || 'mold';

        const idx = SelectionState.items.findIndex(
            it => it.id === id && it.type === type
        );
        const selected = (idx === -1);

        if (selected) {
            SelectionState.items.push({ id, type });
        } else {
            SelectionState.items.splice(idx, 1);
        }
        sessionStorage.setItem('selection.items', JSON.stringify(SelectionState.items));

        this.updateDomHighlights();
        document.dispatchEvent(new CustomEvent('selection:changed', {
            detail: { items: [...SelectionState.items], last: { id, type, selected } }
        }));
        },

        isSelected(id, type) {
        id = String(id);
        type = type || 'mold';
        return SelectionState.items.some(it => it.id === id && it.type === type);
        },

        clear() {
        SelectionState.items = [];
        sessionStorage.removeItem('selection.items');
        this.updateDomHighlights();
        document.dispatchEvent(new CustomEvent('selection:changed', {
            detail: { items: [] }
        }));
        },

        restoreFromSession() {
        try {
            const m = sessionStorage.getItem('selection.mode');
            if (m === '1') SelectionState.active = true;

            const raw = sessionStorage.getItem('selection.items');
            if (raw) {
            const arr = JSON.parse(raw);
            if (Array.isArray(arr)) SelectionState.items = arr;
            }
        } catch (e) {
            console.warn('[SelectionManager] restore error', e);
        }

        this.updateDomHighlights();
        document.dispatchEvent(new CustomEvent('selection:modeChanged', {
            detail: { enabled: SelectionState.active }
        }));
        document.dispatchEvent(new CustomEvent('selection:changed', {
            detail: { items: [...SelectionState.items] }
        }));
        },

        updateDomHighlights() {
        // Card view: dùng lại style inv-bulk-selected / inv-bulk-checkbox
        document.querySelectorAll('.result-card').forEach(card => {
            const id = card.getAttribute('data-id');
            const type = card.getAttribute('data-type') || 'mold';
            const checked = SelectionState.active && this.isSelected(id, type);

            card.classList.toggle('inv-bulk-selected', checked);
            card.classList.toggle('inv-selected', checked); // thêm dòng này để đồng bộ

            const icon = card.querySelector('.inv-bulk-checkbox');
            if (icon) icon.classList.toggle('checked', checked);

        });

        // Mobile table view
        document.querySelectorAll('#mobile-table-body .row-checkbox').forEach(cb => {
            const id = cb.getAttribute('data-id');
            const type = cb.getAttribute('data-type') || 'mold';
            const checked = SelectionState.active && this.isSelected(id, type);

            cb.checked = checked;
            const tr = cb.closest('tr');
            if (tr) tr.classList.toggle('selected-row', checked);
        });

        // Cờ global để CSS hiển thị icon checkbox khi đang chọn
        document.body.classList.toggle('selection-active', SelectionState.active);
        }
    };

    // Khôi phục trạng thái chọn sau khi DOM sẵn sàng
    document.addEventListener('DOMContentLoaded', () => {
        if (window.SelectionManager && SelectionManager.restoreFromSession) {
        SelectionManager.restoreFromSession();
        }
    });

    // ========================================
    // GLOBAL STATE
    // ========================================
    window.InventoryState = {
        active: false,              // Kiểm kê đang bật
        operator: null,             // Nhân viên thực hiện (EmployeeID)
        operatorName: null,         // Tên nhân viên
        autoClose: true,            // Tự đóng popup sau khi kiểm kê
        sortBy: 'code',             // 'code' | 'rack'
        sortEnabled: false,          // Enable/Disable sorting
        filterRack: null,           // RackID được chọn
        filterLayer: null,          // LayerNum được chọn
        filterType: 'all',          // 'mold' | 'cutter' | 'all'
        bulkMode: false,            // Chế độ kiểm kê hàng loạt
        selectedItems: [],          // Danh sách items được chọn (bulk mode)
        auditHistory: {},           // Cache lịch sử kiểm kê {itemId: lastDate}
        // Lưu/khôi phục cấu hình
        persistKey: 'inventory.settings.v1',
        auditEnabled: false,      // true khi là “kiểm kê nhanh”
        selectionMode: false, // Chọn kết quả để in (độc lập inventory)
    };

    // ========================================
    // INVENTORY MANAGER CLASS
    // ========================================
    window.InventoryManager = {
        
        /**
         * Khởi tạo
         */
        init() {
            console.log('[InventoryManager] 🚀 Initializing...');
            
            // R7.0.5: CRITICAL - Detect page load/refresh and clear inventory state
            const isPageLoad = !sessionStorage.getItem('app_initialized');
            
            if (isPageLoad) {
                console.log('[InventoryManager] 🔄 Page load detected - clearing all inventory state...');
                
                // FORCE RESET ALL STATE
                window.InventoryState.active = false;
                window.InventoryState.bulkMode = false;
                window.InventoryState.selectedItems = [];
                window.InventoryState.operator = null;
                
                // Clear ALL storage
                sessionStorage.removeItem('inventoryactive');
                sessionStorage.removeItem('inventorybulk');
                sessionStorage.removeItem('inventoryselection');
                sessionStorage.removeItem('inventoryoperator');
                
                // Mark as initialized
                sessionStorage.setItem('app_initialized', 'true');
                
                // Dispatch reset event
                document.dispatchEvent(new CustomEvent('inventoryreset'));
                console.log('[InventoryManager] ✅ State cleared on page load');
            }
            
            // R7.0.5: Load audit history from BOTH localStorage AND statuslogs.csv
            this.loadAuditHistory();
            this.loadAuditHistoryFromStatusLogs(); // NEW METHOD

            // R7.1.3 - Setup auto-refresh
            this.setupAutoRefreshCache();
            
            // Bind events
            this.bindEvents();
            
            // Set default operator (グエン　ダン　トアン)
            this.setDefaultOperator();

            this.loadSettingsFromStorage();
            this.renderMenubarToggle();

            // ✅ R7.0.7: Luôn thử khôi phục selection mode + danh sách chọn từ session
            this.restoreSelectionFromSession();

            // Đồng bộ trạng thái toggle chọn kết quả trên header mobile
            this.syncMobileSelectionToggle();


            console.log('[InventoryManager] ✅ Initialized');

            // ✅ Add notification CSS animations (once)
            if (!document.getElementById('inv-notification-styles')) {
                const style = document.createElement('style');
                style.id = 'inv-notification-styles';
                style.textContent = `
                    @keyframes slideInRight {
                        from { transform: translateX(400px); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                    @keyframes slideOutRight {
                        from { transform: translateX(0); opacity: 1; }
                        to { transform: translateX(400px); opacity: 0; }
                    }
                `;
                document.head.appendChild(style);
            }


        },

        /**
         * Set nhân viên mặc định: グエン　ダン　トアン
         */
        setDefaultOperator() {
            const employees = window.DataManager?.data?.employees || [];
            const def = employees.find(e => String(e.EmployeeID) === '1') || employees[0];
            if (def) {
                window.InventoryState.operator = def.EmployeeID;
                window.InventoryState.operatorName = def.EmployeeName || String(def.EmployeeID);
                console.log('[Inventory] Default operator by ID:', def.EmployeeID, def.EmployeeName);
            }
        },

        loadSettingsFromStorage() {
            try {
                const raw = localStorage.getItem(window.InventoryState.persistKey);
                if (!raw) return;
                const s = JSON.parse(raw);
                const st = window.InventoryState;
                st.operator = s.operator ?? st.operator;
                st.operatorName = s.operatorName ?? st.operatorName;
                st.autoClose = !!s.autoClose;
                st.sortBy = s.sortBy || 'code';
                st.sortEnabled = !!s.sortEnabled;
                st.filterRack = s.filterRack ?? null;
                st.filterLayer = s.filterLayer ?? null;
                st.filterType = s.filterType || 'all';
                st.bulkMode = !!s.bulkMode;
                st.active = !!s.active; // Khôi phục trạng thái ON/OFF
            } catch (e) {
                console.warn('[Inventory] loadSettings error', e);
            }
        },

        saveSettingsToStorage() {
            try {
                const st = window.InventoryState;
                const data = {
                operator: st.operator,
                operatorName: st.operatorName,
                autoClose: st.autoClose,
                sortBy: st.sortBy,
                sortEnabled: st.sortEnabled,
                filterRack: st.filterRack,
                filterLayer: st.filterLayer,
                filterType: st.filterType,
                bulkMode: st.bulkMode,
                active: st.active
                };
                localStorage.setItem(st.persistKey, JSON.stringify(data));
            } catch (e) {
                console.warn('[Inventory] saveSettings error', e);
            }
        },




        /**
         * Bind global events
         */
        bindEvents() {
        // Lắng nghe toggle từ action buttons (iPad/desktop)
        document.addEventListener('inventory:toggle', (e) => {
            const forceOpen = e.detail?.open;
            if (forceOpen || !window.InventoryState.active) {
            // Mở settings
            this.openSettings();
            } else {
            // Toggle OFF
            this.toggleOff();
            }
        });

        // Lắng nghe inventory:completed (sau khi kiểm kê xong)
        document.addEventListener('inventory:completed', (e) => {
            const { itemId, itemType, date } = (e.detail || {});
            this.recordAudit(itemId, itemType, date);
        });

        // Mobile selection mode toggle (header) → điều khiển SelectionManager độc lập
        const mobileSelectionToggle = document.getElementById('selection-mode-toggle');
            if (mobileSelectionToggle) {
            mobileSelectionToggle.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                if (window.SelectionManager) {
                SelectionManager.setMode(enabled);
                }
            });
        }



        console.log('[InventoryManager] ✅ Events bound');
        },



        /**
         * Mở popup settings
         */
        openSettings() {
            console.log('[InventoryManager] 📋 Opening settings...');
            
            // Remove existing modal
            this.closeSettings();
            
            const html = this.renderSettingsModal();
            document.body.insertAdjacentHTML('beforeend', html);
            
            // Load data vào selects
            this.populateSettingsData();
            
            // Bind settings events
            this.bindSettingsEvents();
        },

        
        /**
         * Render settings modal HTML
         * ✅ R6.9.7: Fixed structure - Header top, Footer bottom, no duplicate body
         */
        renderSettingsModal() {
            const state = window.InventoryState;
            
            return `
                <div id="inventory-settings-overlay" class="inv-overlay">
                    <div id="inventory-settings-modal" class="inv-modal">
                        
                        <!-- ✅ HEADER - TOP -->
                        <div class="inv-modal-header">
                            <h3><i class="fas fa-cog"></i> 棚卸設定 | Cài đặt kiểm kê</h3>
                        </div>
                        
                        <!-- ✅ BODY - MIDDLE -->
                        <div class="inv-modal-body">
                            
                            <!-- ✅ R6.9.7: TOGGLE ENABLE/DISABLE (Primary) -->
                            <div class="inv-form-group inv-form-group-toggle">
                                <label class="inv-toggle-switch-label">
                                    <span class="inv-toggle-text">
                                        <i class="fas fa-power-off"></i>
                                        <strong>棚卸機能 | Tính năng kiểm kê</strong>
                                    </span>
                                    <label class="inv-toggle-switch">
                                        <input type="checkbox" id="inv-enable-toggle" ${state.active ? 'checked' : ''}>
                                        <span class="inv-toggle-slider"></span>
                                    </label>
                                </label>
                                <small class="inv-help-text">
                                    有効/無効を切り替え | Bật/Tắt chức năng kiểm kê
                                </small>
                            </div>
                            
                            <!-- ✅ R6.9.7: TOGGLE CÔNG CỤ KIỂM KÊ (Secondary - NGAY SAU) -->
                            <div class="inv-form-group inv-form-group-toggle-secondary" id="inv-bulk-group" style="display: ${state.active ? 'block' : 'none'};">
                                <label class="inv-toggle-switch-label">
                                    <span class="inv-toggle-text">
                                        <i class="fas fa-list-check"></i>
                                        <span class="label-ja">一括棚卸</span>
                                        <span class="label-vi">Kiểm kê hàng loạt</span>
                                    </span>
                                    <label class="inv-toggle-switch inv-toggle-switch-sm">
                                        <input type="checkbox" id="inv-bulk-enable" ${state.bulkMode ? 'checked' : ''}>
                                        <span class="inv-toggle-slider"></span>
                                    </label>
                                </label>
                                <small class="inv-help-text">
                                    複数選択して一括で棚卸を実行<br>
                                    Chọn nhiều khuôn và kiểm kê hàng loạt
                                </small>
                            </div>
                            
                            <!-- Nhân viên -->
                            <div class="inv-form-group">
                                <label>
                                    <i class="fas fa-user"></i>
                                    担当者 | Người thực hiện <span class="required">*</span>
                                </label>
                                <select id="inv-operator" class="inv-select">
                                    <option value="">選択してください | Chọn nhân viên</option>
                                </select>
                            </div>
                            
                            <!-- Bộ lọc Giá -->
                            <div class="inv-form-group">
                                <label>
                                    <i class="fas fa-warehouse"></i>
                                    棚番号 | Giá
                                </label>
                                <select id="inv-rack" class="inv-select">
                                    <option value="">すべて | Tất cả</option>
                                </select>
                            </div>
                            
                            <!-- Bộ lọc Tầng -->
                            <div class="inv-form-group">
                                <label>
                                    <i class="fas fa-layer-group"></i>
                                    棚の段 | Tầng
                                </label>
                                <select id="inv-layer" class="inv-select" disabled>
                                    <option value="">すべて | Tất cả</option>
                                </select>
                            </div>
                            
                            <!-- Bộ lọc Loại -->
                            <div class="inv-form-group">
                                <label>
                                    <i class="fas fa-filter"></i>
                                    タイプ | Loại
                                </label>
                                <select id="inv-type" class="inv-select">
                                    <option value="all" ${state.filterType === 'all' ? 'selected' : ''}>すべて | Tất cả</option>
                                    <option value="mold" ${state.filterType === 'mold' ? 'selected' : ''}>金型のみ | Chỉ khuôn</option>
                                    <option value="cutter" ${state.filterType === 'cutter' ? 'selected' : ''}>抜型のみ | Chỉ dao cắt</option>
                                </select>
                            </div>
                            
                            <!-- Sắp xếp -->
                            <div class="inv-form-group">
                                <label class="inv-checkbox-label">
                                    <input type="checkbox" id="inv-sort-enabled" ${state.sortEnabled ? 'checked' : ''}>
                                    <span>並び替え有効 | Bật sắp xếp</span>
                                </label>
                            </div>
                            
                            <div class="inv-form-group" id="inv-sort-group" ${!state.sortEnabled ? 'style="display:none"' : ''}>
                                <label>
                                    <i class="fas fa-sort"></i>
                                    並び順 | Sắp xếp theo
                                </label>
                                <select id="inv-sort-by" class="inv-select" ${!state.sortEnabled ? 'disabled' : ''}>
                                    <option value="code" ${state.sortBy === 'code' ? 'selected' : ''}>コード順 | Theo mã</option>
                                    <option value="rack" ${state.sortBy === 'rack' ? 'selected' : ''}>棚位置順 | Theo vị trí giá</option>
                                </select>
                            </div>
                            
                            <!-- Tự động đóng -->
                            <div class="inv-form-group">
                                <label class="inv-checkbox-label">
                                    <input type="checkbox" id="inv-auto-close" ${state.autoClose ? 'checked' : ''}>
                                    <span>自動閉じる | Tự động đóng popup</span>
                                </label>
                            </div>
                            
                            <!-- Lưu cấu hình -->
                            <div class="inv-form-group inv-form-group-save">
                                <label class="inv-checkbox-label">
                                    <input type="checkbox" id="inv-persist-settings" checked>
                                    <span>
                                        <i class="fas fa-save"></i>
                                        保存設定 | Lưu cấu hình cho lần sau
                                    </span>
                                </label>
                                <small class="inv-help-text">
                                    次回も同じ設定を使用します<br>
                                    Tự động áp dụng lại cấu hình khi mở lại
                                </small>
                            </div>
                            
                        </div>

    
                        
                        <!-- ✅ FOOTER - BOTTOM -->
                        <div class="inv-modal-footer">

                            <!-- ✅ History Button (Left side) -->
                            <button id="inv-history-btn" class="inv-btn inv-btn-history" type="button">
                                <span class="inv-btn-icon">📊</span>
                                <span class="inv-btn-text">履歴 | Lịch sử</span>
                            </button>

                            <!-- Thêm nút Clear Cache -->
                            <button id="inv-clear-cache-btn" class="inv-btn inv-btn-warning" type="button" style="background: #ff9800; margin-left: 8px;">
                                <i class="fas fa-trash"></i> Xóa cache
                            </button>

                            <button class="inv-btn inv-btn-primary" id="inv-save-btn">
                                <i class="fas fa-save"></i>
                                保存 | Lưu
                            </button>

                            <button class="inv-btn inv-btn-secondary" id="inv-cancel-btn">
                                <i class="fas fa-times"></i>
                                キャンセル | Hủy
                            </button>
                            
                            
                        </div>
                        
                    </div>
                </div>
            `;
        },


        /**
         * Populate data vào settings form
         */
        populateSettingsData() {
            const data = window.DataManager?.data || {};
            
            // Employees
            const operatorSelect = document.getElementById('inv-operator');
            if (operatorSelect) {
                (data.employees || []).forEach(emp => {
                    const option = document.createElement('option');
                    option.value = emp.EmployeeID;
                    option.textContent = emp.EmployeeName || emp.EmployeeID;
                    option.selected = emp.EmployeeID === window.InventoryState.operator;
                    operatorSelect.appendChild(option);
                });
            }

            // Racks
            const rackSelect = document.getElementById('inv-rack');
            if (rackSelect) {
                // ✅ Sắp xếp theo số (numerical sort)
                const racks = [...new Set((data.racklayers || []).map(r => r.RackID))]
                    .filter(Boolean)
                    .sort((a, b) => {
                        const numA = parseInt(a);
                        const numB = parseInt(b);
                        return numA - numB;
                    });
                
                racks.forEach(rackId => {

                    const option = document.createElement('option');
                    option.value = rackId;
                    option.textContent = `棚 ${rackId} | Giá ${rackId}`;
                    option.selected = rackId === window.InventoryState.filterRack;
                    rackSelect.appendChild(option);
                });
            }

            // Layers (populate khi chọn Rack)
            this.updateLayerOptions();
        },

        /**
         * Cập nhật options cho Layer select (cascade với Rack)
         */
        updateLayerOptions() {
            const rackId = document.getElementById('inv-rack')?.value;
            const layerSelect = document.getElementById('inv-layer');
            
            console.log('[Inventory] updateLayerOptions called, rackId:', rackId); // ✅ LOG
            
            if (!layerSelect) return;
            
            // Clear existing options
            layerSelect.innerHTML = '<option value="">すべて | Tất cả</option>';
            
            if (!rackId) {
                layerSelect.disabled = true;
                return;
            }
            
            layerSelect.disabled = false;
            
            // Get layers for selected rack
            const data = window.DataManager?.data;
            
            // ✅ FIX 1: So sánh loose và convert to String
            // ✅ FIX 2: Dùng RackLayerNumber thay vì LayerNum
            const layers = [...new Set(
                data.racklayers
                .filter(r => String(r.RackID) === String(rackId))
                .map(r => r.RackLayerNumber)  // ✅ ĐÚNG CỘT
            )].filter(Boolean).sort((a, b) => a - b);
            
            console.log('[Inventory] Found layers for rack', rackId, ':', layers); // ✅ LOG
            
            layers.forEach(layerNum => {
                const option = document.createElement('option');
                option.value = layerNum;
                option.textContent = `${layerNum} (層 | Tầng ${layerNum})`; // ✅ Song ngữ
                option.selected = (layerNum == window.InventoryState.filterLayer);
                layerSelect.appendChild(option);
            });
        },

        /** Đồng bộ trạng thái toggle chọn kết quả trên header mobile */
        syncMobileSelectionToggle() {
        let enabled = !!window.SelectionState?.active;
            try {
                const persisted = sessionStorage.getItem('selection.mode');
                if (persisted != null) {
                enabled = (persisted === '1');
                if (window.SelectionState) window.SelectionState.active = enabled;
                }
            } catch (e) {
                console.warn('[InventoryManager] syncMobileSelectionToggle session read error', e);
            }
            const checkbox = document.getElementById('selection-mode-toggle');
            if (checkbox) checkbox.checked = enabled;
        },



        /**
         * Bind events cho settings form
         */
        bindSettingsEvents() {
            // Close buttons
            ['inv-close-settings', 'inv-cancel-btn'].forEach(id => {
                document.getElementById(id)?.addEventListener('click', () => {
                    this.closeSettings();
                });
            });

                // ✅ THÊM: History button
            document.getElementById('inv-history-btn')?.addEventListener('click', () => {
                console.log('[InventoryManager] Opening history viewer...');
                this.openHistoryViewer();
            });

            // Clear Cache button - THÊM ĐOẠN NÀY
            document.getElementById('inv-clear-cache-btn')?.addEventListener('click', () => {
                this.clearAuditCache();
            });


            // Overlay click
            document.getElementById('inventory-settings-overlay')?.addEventListener('click', (e) => {
                if (e.target.id === 'inventory-settings-overlay') {
                    this.closeSettings();
                }
            });

            // Rack change → update Layer options
            document.getElementById('inv-rack')?.addEventListener('change', () => {
                this.updateLayerOptions();
            });

            // ✅ R6.9.7: Enable/Disable toggle + show/hide bulk group
            document.getElementById('inv-enable-toggle')?.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                
                // ✅ Show/hide bulk group
                const bulkGroup = document.getElementById('inv-bulk-group');
                if (bulkGroup) {
                    bulkGroup.style.display = enabled ? 'block' : 'none';
                }
                
                // Disable/Enable tất cả các input khác (trừ toggle primary và secondary)
                const formGroups = document.querySelectorAll('#inventory-settings-modal .inv-form-group:not(.inv-form-group-toggle):not(.inv-form-group-toggle-secondary)');

                formGroups.forEach(group => {
                    group.style.opacity = enabled ? '1' : '0.5';
                    group.style.pointerEvents = enabled ? 'auto' : 'none';
                });
                
                // Update start button text
                const startBtn = document.getElementById('inv-start-btn');
                if (startBtn) {
                    if (enabled) {
                        startBtn.innerHTML = '<i class="fas fa-play"></i> 開始 | Bắt đầu';
                    } else {
                        startBtn.innerHTML = '<i class="fas fa-power-off"></i> 無効にする | Tắt';
                    }
                }
            });
    
            
            // Trigger initial state
            const toggleInput = document.getElementById('inv-enable-toggle');
            if (toggleInput) {
                toggleInput.dispatchEvent(new Event('change'));
            }

            // ✅ R6.9.7: Bulk toggle listener
            document.getElementById('inv-bulk-enable')?.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                console.log('[InventoryManager] Bulk mode toggle:', enabled);
                // State sẽ được lưu khi click "Lưu"
            });



            // Sort enabled checkbox
            document.getElementById('inv-sort-enabled')?.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                const sortGroup = document.getElementById('inv-sort-group');
                const sortSelect = document.getElementById('inv-sort-by');
                
                if (sortGroup) sortGroup.style.display = enabled ? 'block' : 'none';
                if (sortSelect) sortSelect.disabled = !enabled;
            });

            // Save button
            document.getElementById('inv-save-btn')?.addEventListener('click', () => {
                this.saveInventorySettings();
            });
        },

        /**
         * Lưu cài đặt kiểm kê (không có alert, tự đóng popup)
         */
        saveInventorySettings() {
        // Check enable toggle
        const enableToggle = document.getElementById('inv-enable-toggle')?.checked ?? true;
        
        if (!enableToggle) {
            // Tắt chế độ kiểm kê
            this.toggleOff();
            this.closeSettings();
            return;
        }
        
        // Validate operator
        const operator = document.getElementById('inv-operator')?.value;
        if (!operator) {
            alert('⚠️ Vui lòng chọn nhân viên');
            return;
        }
        
        // Get values
        const operatorName = document.getElementById('inv-operator')?.selectedOptions[0]?.text;
        const filterRack = document.getElementById('inv-rack')?.value || null;
        const filterLayer = document.getElementById('inv-layer')?.value || null;
        const filterType = document.getElementById('inv-type')?.value || 'all';
        const sortEnabled = document.getElementById('inv-sort-enabled')?.checked || false;
        const sortBy = document.getElementById('inv-sort-by')?.value || 'code';
        const autoClose = document.getElementById('inv-auto-close')?.checked || false;
        const bulkMode = document.getElementById('inv-bulk-enable')?.checked || false;  // ✅ FIX: đổi từ inv-bulk-mode → inv-bulk-enable

        
        // Update state
        window.InventoryState.active = true;
        window.InventoryState.operator = operator;
        window.InventoryState.operatorName = operatorName;
        window.InventoryState.filterRack = filterRack;
        window.InventoryState.filterLayer = filterLayer;
        window.InventoryState.filterType = filterType;
        window.InventoryState.sortEnabled = sortEnabled;
        window.InventoryState.sortBy = sortBy;
        window.InventoryState.autoClose = autoClose;
        window.InventoryState.bulkMode = bulkMode;
        window.InventoryState.selectedItems = [];

        
        console.log('[InventoryManager] Settings saved:', window.InventoryState);
        
        // ✅ Đóng popup ngay lập tức
        this.closeSettings();
        
        // Update badge ON
        this.updateBadge(true);
        
        // Dispatch events
        document.dispatchEvent(new CustomEvent('inventory:modeChanged', { 
            detail: { ...window.InventoryState } 
        }));
        
        // Apply filters
        this.applyFilters();
        
        // Apply sorting nếu enabled
        if (sortEnabled) {
            document.dispatchEvent(new CustomEvent('inventory:sort', { 
            detail: { by: sortBy } 
            }));
        }
        
        // Show/hide bulk tools
        if (bulkMode) {
            this.showBulkTools();
        } else {
            this.hideBulkTools();
        }
        
        // Lưu cấu hình
        this.saveSettingsToStorage();
        
        // Cập nhật menubar toggle
        this.renderMenubarToggle();
        },


        /**
         * Bắt đầu kiểm kê
         */
        startInventory() {
            // ✅ Check enable toggle
            const enableToggle = document.getElementById('inv-enable-toggle')?.checked ?? true;
            
            if (!enableToggle) {
                // Tắt chế độ kiểm kê
                this.toggleOff();
                this.closeSettings();
                return;
            }
            
            // Validate operator
            const operator = document.getElementById('inv-operator')?.value;
            if (!operator) {
                alert('担当者を選択してください\nVui lòng chọn nhân viên');
                return;
            }


            // Get values
            const operatorName = document.getElementById('inv-operator')?.selectedOptions[0]?.text;
            const filterRack = document.getElementById('inv-rack')?.value || null;
            const filterLayer = document.getElementById('inv-layer')?.value || null;
            const filterType = document.getElementById('inv-type')?.value || 'all';
            const sortEnabled = document.getElementById('inv-sort-enabled')?.checked || false;
            const sortBy = document.getElementById('inv-sort-by')?.value || 'code';
            const autoClose = document.getElementById('inv-auto-close')?.checked || false;
            const bulkMode = document.getElementById('inv-bulk-mode')?.checked || false;

            // Update state
            window.InventoryState.active = true;
            window.InventoryState.operator = operator;
            window.InventoryState.operatorName = operatorName;
            window.InventoryState.filterRack = filterRack;
            window.InventoryState.filterLayer = filterLayer;
            window.InventoryState.filterType = filterType;
            window.InventoryState.sortEnabled = sortEnabled;
            window.InventoryState.sortBy = sortBy;
            window.InventoryState.autoClose = autoClose;
            window.InventoryState.bulkMode = bulkMode;
            window.InventoryState.selectedItems = [];

            // NEW: Nếu bulkMode ON trong kiểm kê → tự bật luôn chế độ lựa chọn (để in/kiểm kê)
            this.setSelectionMode(bulkMode, window.InventoryState.auditEnabled || false);


            console.log('[InventoryManager] ✅ Inventory started:', window.InventoryState);

            // Close settings
            this.closeSettings();

            // Update badge ON
            this.updateBadge(true);

            // Dispatch events
            document.dispatchEvent(new CustomEvent('inventory:modeChanged', {
                detail: { ...window.InventoryState }
            }));

            // Apply filters
            this.applyFilters();

            // Apply sorting (nếu enabled)
            if (sortEnabled) {
                document.dispatchEvent(new CustomEvent('inventory:sort', {
                    detail: { by: sortBy }
                }));
            }

            // Show/hide bulk tools
            if (bulkMode) {
                this.showBulkTools();
            } else {
                this.hideBulkTools();
            }

            // Alert success
            //alert(`棚卸モード開始 | Bắt đầu kiểm kê\n担当者: ${operatorName}`);

            // Lưu cấu hình nếu checkbox được chọn
            const persistSettings = document.getElementById('inv-persist-settings')?.checked ?? true;
            if (persistSettings) {
                this.saveSettingsToStorage();
            }
            
            // Cập nhật menubar toggle
            this.renderMenubarToggle();
        },


        /**
         * Tắt chế độ kiểm kê
         */
        toggleOff() {
            //if (!confirm('棚卸モードを終了しますか？\nKết thúc chế độ kiểm kê?')) {
            //    return;
           // }

            console.log('[InventoryManager] 🛑 Toggling OFF...');

            // ✅ FIX: Reset ALL states including bulkMode
            window.InventoryState.active = false;
            window.InventoryState.bulkMode = false; // ✅ THÊM DÒNG NÀY
            window.InventoryState.selectedItems = [];

            // Update badge
            this.updateBadge(false);

            // ✅ FIX: Hide bulk tools and remove visual highlights
            this.hideBulkTools();

            
            // ✅ THÊM: Xóa class highlight khỏi tất cả thẻ
            document.querySelectorAll('.inv-bulk-selected').forEach(el => {
                el.classList.remove('inv-bulk-selected');
            });
            document.querySelectorAll('.inv-bulk-checkbox.checked').forEach(el => {
                el.classList.remove('checked');
            });

            // Dispatch event
            document.dispatchEvent(new CustomEvent('inventory:modeChanged', {
                detail: { ...window.InventoryState }
            }));

            // Re-render results (remove filters/badges)
            document.dispatchEvent(new CustomEvent('inventory:cleared'));

            // Lưu cấu hình và cập nhật menubar
            this.saveSettingsToStorage();
            this.renderMenubarToggle();

            console.log('[InventoryManager] ✅ Inventory mode OFF, bulkMode reset');
        },

        /**
         * Close settings modal
         */
        closeSettings() {
            document.getElementById('inventory-settings-overlay')?.remove();
        },

        /**
         * Update badge "ON" trên nút
         */
        updateBadge(active) {
            console.log('[InventoryManager] 🎯 Updating badge:', active ? 'ON' : 'OFF');
            
            // 1. UPDATE DESKTOP/IPAD BUTTON
            const actionBtn = document.getElementById('btn-inventory-settings');
            if (actionBtn) {
                actionBtn.style.position = 'relative';
                actionBtn.style.overflow = 'visible';
                
                // CRITICAL: Remove ALL existing badges (prevent duplicates)
                const existingBadges = actionBtn.querySelectorAll('.inventory-badge');
                existingBadges.forEach(b => b.remove());
                
                if (active) {
                    const badge = document.createElement('span');
                    badge.className = 'inventory-badge';
                    badge.textContent = 'ON';
                    badge.style.cssText = `
                        position: absolute !important;
                        top: 4px !important;
                        right: 4px !important;
                        background: #00c853 !important;
                        color: white !important;
                        font-size: 9px !important;
                        font-weight: 700 !important;
                        padding: 2px 6px !important;
                        border-radius: 4px !important;
                        line-height: 1 !important;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.3) !important;
                        z-index: 10 !important;
                        pointer-events: none !important;
                    `;
                    actionBtn.appendChild(badge);
                    console.log('[InventoryManager] ✅ Badge ON added to desktop button');
                } else {
                    console.log('[InventoryManager] ✅ Badge removed from desktop button');
                }
            }
            
            // 2. UPDATE MOBILE BOTTOM NAV
            const navBtn = document.getElementById('nav-inventory-btn');
            const navIcon = document.getElementById('nav-inventory-icon');
            const navLabel = document.getElementById('nav-inventory-label');
            
            if (navBtn && navIcon && navLabel) {
                // Remove ALL existing badges
                const existingBadges = navBtn.querySelectorAll('.inventory-badge');
                existingBadges.forEach(b => b.remove());
                
                const jpSpan = navLabel.querySelector('.btn-label-ja');
                const viSpan = navLabel.querySelector('.btn-label-vi');
                
                if (active) {
                    // MODE ON
                    navIcon.className = 'fas fa-map-marker-alt bottom-nav-icon';
                    if (jpSpan) jpSpan.textContent = '棚卸';
                    if (viSpan) viSpan.textContent = 'Đang kiểm kê';
                    
                    // Add badge
                    const badge = document.createElement('span');
                    badge.className = 'inventory-badge';
                    badge.textContent = 'ON';
                    badge.style.cssText = `
                        position: absolute;
                        top: 4px;
                        right: 4px;
                        background: #00c853;
                        color: white;
                        font-size: 9px;
                        font-weight: 700;
                        padding: 2px 5px;
                        border-radius: 3px;
                        z-index: 10;
                    `;
                    navBtn.appendChild(badge);
                    console.log('[InventoryManager] ✅ Badge ON added to mobile nav');
                } else {
                    // MODE OFF
                    navIcon.className = 'fas fa-clipboard-check bottom-nav-icon';
                    if (jpSpan) jpSpan.textContent = '棚卸';
                    if (viSpan) viSpan.textContent = 'Thiết lập kiểm kê';
                    console.log('[InventoryManager] ✅ Badge removed from mobile nav');
                }
            }
            
            // Dispatch event
            document.dispatchEvent(new CustomEvent('inventoryModeChanged', { 
                detail: { active } 
            }));
        },




        /**
         * Apply inventory filters (Rack, Layer, Type)
         * ✅ FIX: Filter by RackLayerID instead of separate fields
         */
        applyFilters() {
        const { filterRack, filterLayer, filterType } = window.InventoryState;
        
        console.log('[InventoryManager] Applying filters:', { filterRack, filterLayer, filterType });
        
        // ✅ Get all items
        let filtered = window.DataManager?.getAllItems?.() || [];
        
        // ✅ Filter by RackLayerID (combination of Rack + Layer)
        if (filterRack && filterLayer) {
            // Lọc theo RackLayerID kết hợp
            const targetRackLayerID = `${filterRack}${filterLayer}`;
            
            filtered = filtered.filter(item => {
            const itemRackLayerID = item.rackLayerInfo?.RackLayerID || '';
            return String(itemRackLayerID) === targetRackLayerID;
            });
            
            console.log(`[Inventory] Filtered by RackLayerID=${targetRackLayerID}: ${filtered.length} items`);
        } else if (filterRack) {
            // Chỉ lọc theo Giá
            filtered = filtered.filter(item => {
            const rackId = item.rackInfo?.RackID || item.rackLayerInfo?.RackID;
            return String(rackId) === String(filterRack);
            });
            
            console.log(`[Inventory] Filtered by RackID=${filterRack}: ${filtered.length} items`);
        } else if (filterLayer) {
            // Chỉ lọc theo Tầng (ít dùng)
            filtered = filtered.filter(item => {
            const layerNum = item.rackLayerInfo?.RackLayerNumber;
            return String(layerNum) === String(filterLayer);
            });
            
            console.log(`[Inventory] Filtered by LayerNum=${filterLayer}: ${filtered.length} items`);
        }
        
        // ✅ Filter by Type
        if (filterType && filterType !== 'all') {
            filtered = filtered.filter(item => item.itemType === filterType);
            console.log(`[Inventory] Filtered by Type=${filterType}: ${filtered.length} items`);
        }
        
        // ✅ Emit event với kết quả đã lọc
        document.dispatchEvent(new CustomEvent('search:updated', { 
            detail: { 
            results: filtered,
            source: 'inventory-filter',
            origin: 'inventory'
            } 
        }));
        
        console.log(`[Inventory] Final filtered results: ${filtered.length} items`);
        },


        /**
         * Show bulk tools: floating button + checkboxes
         */
        showBulkTools() {
            console.log('[InventoryManager] Showing bulk tools...');
            
            // Add floating action button nếu chưa có
            if (!document.getElementById('inv-bulk-float')) {
                const floatHTML = `
                    <div id="inv-bulk-float" class="inv-bulk-float-btn" style="display: none;">
                        <div class="bulk-counter">
                            <i class="fas fa-check-circle"></i>
                            <span class="counter-text">0</span>
                        </div>
                        <button class="bulk-confirm-btn" id="inv-bulk-confirm">
                            <i class="fas fa-clipboard-check"></i>
                            <span>確認 | Xác nhận kiểm kê</span>
                        </button>
                    </div>
                `;
                
                document.body.insertAdjacentHTML('beforeend', floatHTML);
                
                // Bind event confirm
                document.getElementById('inv-bulk-confirm')?.addEventListener('click', () => {
                    this.processBulkAudit();
                });
                
                console.log('[InventoryManager] ✅ Floating button created');
            }
            
            // CRITICAL FIX: Sửa tên event từ selection:changed → selectionchanged
            // Listen to selection changes để update counter
            const updateCounter = (e) => {
                const count = e.detail?.items?.length || 0;
                const counterText = document.querySelector('#inv-bulk-float .counter-text');
                if (counterText) {
                    counterText.textContent = count;
                }
                
                // Show/hide button based on count
                const floatBtn = document.getElementById('inv-bulk-float');
                if (floatBtn) {
                    floatBtn.style.display = count > 0 ? 'flex' : 'none';
                }
                
                console.log('[InventoryManager] Counter updated:', count);
            };
            
            // Remove old listener if exists
            document.removeEventListener('selectionchanged', updateCounter);
            // Add new listener
            document.addEventListener('selectionchanged', updateCounter);
            
            // Emit event để UI renderer hiển thị checkboxes
            document.dispatchEvent(new CustomEvent('inventory:bulkMode', {
                detail: { enabled: true }
            }));
            
            console.log('[InventoryManager] ✅ Bulk tools shown');
        },

        /**
         * Hide bulk tools và đồng bộ tắt toggle button
         */
        hideBulkTools() {
            console.log('[InventoryManager] Hiding bulk tools...');
            
            // Remove floating button
            document.getElementById('inv-bulk-float')?.remove();
            
            // CRITICAL: Tắt SelectionManager
            if (window.SelectionManager) {
                window.SelectionManager.setMode(false);
            }
            
            // CRITICAL: Đồng bộ toggle button về OFF
            const selectionToggle = document.getElementById('selection-mode-toggle');
            if (selectionToggle) {
                selectionToggle.checked = false;
                console.log('[InventoryManager] ✅ Selection toggle synced to OFF');
            }
            
            // Dispatch event
            document.dispatchEvent(new CustomEvent('inventory:bulkMode', {
                detail: { enabled: false }
            }));
            
            console.log('[InventoryManager] ✅ Bulk tools hidden');
        },

        /**
         * Open bulk popup
         */
        openBulkPopup() {
            const selectedCount = window.InventoryState.selectedItems.length;
            
            if (selectedCount === 0) {
                alert('項目を選択してください\nVui lòng chọn mục');
                return;
            }

            console.log('[InventoryManager] 📦 Opening bulk popup for', selectedCount, 'items');

            const html = `
                <div id="inv-bulk-popup-overlay" class="inv-overlay">
                    <div id="inv-bulk-popup" class="inv-modal inv-modal-small">
                        <div class="inv-modal-header">
                            <h3>一括棚卸 | Kiểm kê hàng loạt</h3>
                            <span class="inv-badge">${selectedCount} 項目 | mục</span>
                        </div>
                        
                        <div class="inv-modal-body">
                            <div class="inv-bulk-actions">
                                <button class="inv-btn inv-btn-success inv-btn-block" id="inv-bulk-audit">
                                    <i class="fas fa-clipboard-check"></i>
                                    棚卸 | Kiểm kê
                                </button>
                                
                                <button class="inv-btn inv-btn-primary inv-btn-block" id="inv-bulk-relocate">
                                    <i class="fas fa-map-marked-alt"></i>
                                    位置変更＋棚卸 | Đổi vị trí + Kiểm kê
                                </button>
                            </div>
                        </div>
                        
                        <div class="inv-modal-footer">
                            <button class="inv-btn inv-btn-secondary" id="inv-bulk-cancel">
                                キャンセル | Hủy
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.insertAdjacentHTML('beforeend', html);

            // Bind events
            document.getElementById('inv-bulk-cancel')?.addEventListener('click', () => {
                document.getElementById('inv-bulk-popup-overlay')?.remove();
            });

            document.getElementById('inv-bulk-audit')?.addEventListener('click', () => {
                this.processBulkAudit();
            });

            document.getElementById('inv-bulk-relocate')?.addEventListener('click', () => {
                this.processBulkRelocate();
            });
        },

    
    
        /**
         * ✅ R6.9.9: Process bulk audit với progress tracking
         */
        async processBulkAudit() {
            const items = window.InventoryState.selectedItems;
            const operator = window.InventoryState.operator;
            
            // Get JST date (UTC+9)
            const jstDate = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];
            const auditDate = jstDate;

            if (items.length === 0) {
                this.showNotification('⚠️ 項目がありません | Không có mục nào', 'warning');
                return;
            }

            console.log('[InventoryManager] 📋 Processing bulk audit for', items.length, 'items');

            // ✅ Show loading overlay
            const overlay = this.createLoadingOverlay(items.length);
            document.body.appendChild(overlay);

            // Prepare statusLogs với đúng cấu trúc ID
            const statusLogs = items.map(item => {
                // SelectionManager lưu { id, type, ...fullData }
                const itemId = item.id; // ID đã được convert sang string
                const itemType = item.type || 'mold';
                
                return {
                    MoldID: (itemType === 'mold' ? itemId : ''),
                    CutterID: (itemType === 'cutter' ? itemId : ''),
                    Status: 'AUDIT',
                    Timestamp: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString(), // JST
                    EmployeeID: operator || '',
                    DestinationID: '',
                    Notes: '一括棚卸 | Kiểm kê hàng loạt',
                    AuditDate: auditDate
                };
            });


            // ✅ Split into chunks
            const CHUNK_SIZE = 50;
            const chunks = [];
            for (let i = 0; i < statusLogs.length; i += CHUNK_SIZE) {
                chunks.push(statusLogs.slice(i, i + CHUNK_SIZE));
            }

            console.log(`[InventoryManager] Split into ${chunks.length} chunks`);

            let successCount = 0;
            let failureCount = 0;
            let allAuditedItems = []; // ✅ Track all audited items

            // ✅ Process chunks
                // Process chunks
            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                
                this.updateLoadingProgress(overlay, i + 1, chunks.length, successCount);

                try {
                    const result = await this.sendBulkAuditToServer(chunk);
                    
                    // Check result (accept both API success and fallback)
                    if (result.success || result.fallback) {
                        successCount += chunk.length;
                        
                        // Log status
                        if (result.fallback) {
                            console.warn(`[InventoryManager] ⚠️ Chunk ${i + 1} saved to cache (server unavailable)`);
                        } else {
                            console.log(`[InventoryManager] ✅ Chunk ${i + 1} saved to server`);
                        }
                        
                        // ✅ Batch record to cache
                        const auditedItems = [];
                        chunk.forEach(log => {
                            const itemId = log.MoldID || log.CutterID;
                            const itemType = log.MoldID ? 'mold' : 'cutter';
                            
                            // Record to cache (silent mode - không dispatch event)
                            this.recordAuditToCacheSilent(itemId, itemType, auditDate);
                            
                            // Collect để dispatch sau
                            auditedItems.push({ itemId, itemType, date: auditDate });
                        });
                        
                        // ✅ Collect to global array
                        allAuditedItems = allAuditedItems.concat(auditedItems);
                    } else {
                        failureCount += chunk.length;
                        console.warn('[InventoryManager] Chunk failed, saving to localStorage');
                    }
                } catch (error) {
                    console.error(`[InventoryManager] Chunk ${i + 1} error:`, error);
                    failureCount += chunk.length;
                }

                if (i < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 200)); // Delay between chunks
                }
            }

            // ✅ Remove loading overlay
            if (overlay) overlay.remove();

            // ✅ Double-check: Ensure overlay is removed (in case of multiple instances)
            const overlayCheck = document.getElementById('inv-bulk-loading-overlay');
            if (overlayCheck) overlayCheck.remove();

            // ✅ Show result notification
            if (failureCount === 0) {
                this.showNotification(
                    `✅ 棚卸完了 | Đã kiểm kê thành công: ${successCount} mục`,
                    'success',
                    3000
                );
            } else if (successCount > 0) {
                this.showNotification(
                    `⚠️ 完了: ${successCount} 項目 | 保留: ${failureCount} 項目\nThành công: ${successCount}, Lưu cục bộ: ${failureCount}`,
                    'warning',
                    5000
                );
            } else {
                this.showNotification(
                    `❌ 失敗 | Lỗi: Không thể xử lý. Vui lòng thử lại.`,
                    'error',
                    5000
                );
            }

            // ✅ Cleanup
            window.InventoryState.selectedItems = [];
            window.InventoryState.bulkMode = false;
            sessionStorage.setItem('inventory_bulk', 'false');
            
            this.updateBulkCount(0);
            document.getElementById('inv-bulk-popup-overlay')?.remove();

            // ✅ Dispatch events
            document.dispatchEvent(new CustomEvent('inventory:bulkMode', {
                detail: { enabled: false }
            }));

            // ✅ R6.9.9: Dispatch bulk update event (1 lần duy nhất)
            document.dispatchEvent(new CustomEvent('inventory:bulkAuditCompleted', {
                detail: {
                    items: allAuditedItems, // Array of all audited items
                    date: auditDate,
                    count: successCount
                }
            }));

            console.log(`[InventoryManager] 📡 Dispatched bulk update for ${successCount} items`);

            // ✅ Re-render cards
            if (window.UIRenderer && window.UIRenderer.state.allResults) {
                window.UIRenderer.renderResults(window.UIRenderer.state.allResults);
            }

            console.log('[InventoryManager] ✅ Bulk audit completed:', { successCount, failureCount });
        },

        // Bọc cho tương thích ngược – KHÔNG thêm logic kiểm kê ở đây
        setSelectionMode(enabled, audit) {
            if (window.SelectionManager) {
                SelectionManager.setMode(enabled);
            }
        },


    
        /**
         * ✅ R6.9.9: Send bulk audit to server với timeout protection
         */
        async sendBulkAuditToServer(statusLogs) {
            const API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/audit-batch';
            const TIMEOUT_MS = 15000; // 15 seconds timeout
            
            try {
                console.log(`[InventoryManager] 📤 Sending ${statusLogs.length} items to server...`);
                
                // ✅ Create fetch promise with timeout
                const fetchPromise = fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ statusLogs })
                });
                
                // ✅ Create timeout promise
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Request timeout after 15s')), TIMEOUT_MS);
                });
                
                // ✅ Race between fetch and timeout
                const response = await Promise.race([fetchPromise, timeoutPromise]);
                
                console.log('[InventoryManager] 📡 Server response status:', response.status);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const result = await response.json();
                console.log('[InventoryManager] ✅ Server response:', result);
                
                return result;
                
            } catch (error) {
                console.error('[InventoryManager] ❌ API error:', error.message);
                
                // ✅ Return fallback success (data đã save vào cache)
                return { 
                    success: false, 
                    error: error.message,
                    fallback: true 
                };
            }
        },


        /**
         * ✅ R6.9.9: Create loading overlay
         */
        createLoadingOverlay(totalItems) {
            const div = document.createElement('div');
            div.id = 'inv-bulk-loading-overlay';
            div.className = 'inv-overlay';
            div.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
            `;
            
            div.innerHTML = `
                <div style="
                    background: white;
                    padding: 32px;
                    border-radius: 12px;
                    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                    min-width: 320px;
                    text-align: center;
                ">
                    <div style="
                        width: 48px;
                        height: 48px;
                        border: 4px solid #4CAF50;
                        border-top-color: transparent;
                        border-radius: 50%;
                        margin: 0 auto 16px;
                        animation: spin 1s linear infinite;
                    "></div>
                    <h3 style="margin: 0 0 16px; color: #333;">
                        棚卸中... | Đang kiểm kê...
                    </h3>
                    <div style="
                        background: #f5f5f5;
                        border-radius: 8px;
                        height: 24px;
                        overflow: hidden;
                        margin-bottom: 8px;
                    ">
                        <div id="inv-progress-fill" style="
                            background: linear-gradient(90deg, #4CAF50, #66BB6A);
                            height: 100%;
                            width: 0%;
                            transition: width 0.3s ease;
                        "></div>
                    </div>
                    <p id="inv-progress-text" style="
                        margin: 0;
                        font-size: 14px;
                        color: #666;
                    ">処理中... (0 / ${totalItems})</p>
                </div>
                <style>
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                </style>
            `;
            
            return div;
        },

        /**
         * ✅ R6.9.9: Update loading progress
         */
        updateLoadingProgress(overlay, currentChunk, totalChunks, itemsProcessed) {
            const fill = overlay.querySelector('#inv-progress-fill');
            const text = overlay.querySelector('#inv-progress-text');
            
            if (!fill || !text) return;
            
            const percentage = (currentChunk / totalChunks) * 100;
            fill.style.width = `${percentage}%`;
            
            text.textContent = `処理中... (${itemsProcessed} / ${window.InventoryState.selectedItems.length})`;
        },

        /**
         * ✅ R6.9.9: Send bulk audit request với retry logic
         */
        async sendBulkAuditRequest(statusLogs, retries = 3) {
            const API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/audit-batch';
            
            for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                    console.log(`[InventoryManager] Attempt ${attempt}/${retries}: Sending ${statusLogs.length} items...`);
                    
                    const response = await fetch(API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ statusLogs }),
                        timeout: 30000 // 30 second timeout
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    const result = await response.json();
                    
                    if (result.success) {
                        console.log(`[InventoryManager] ✅ Batch saved: ${result.saved} items`);
                        return result;
                    } else {
                        throw new Error(result.message || 'Batch audit failed');
                    }
                    
                } catch (error) {
                    console.error(`[InventoryManager] Attempt ${attempt} failed:`, error);
                    
                    if (attempt < retries) {
                        // Wait before retry (exponential backoff)
                        const waitTime = Math.pow(2, attempt) * 500; // 1s, 2s, 4s
                        console.log(`[InventoryManager] Retrying in ${waitTime}ms...`);
                        await this.delay(waitTime);
                    } else {
                        // All retries failed
                        return { success: false, error: error.message };
                    }
                }
            }
        },

        /**
         * ✅ R6.9.9: Delay utility
         */
        delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        },

        /**
         * ✅ R6.9.9: Show loading overlay for bulk operations
         */
        showBulkLoadingOverlay(message, totalItems) {
            // Remove existing overlay
            this.hideBulkLoadingOverlay();
            
            const html = `
                <div id="inv-bulk-loading-overlay" class="inv-overlay">
                    <div class="inv-bulk-loading-box">
                        <div class="inv-loading-spinner"></div>
                        <h3 class="inv-loading-title">${message}</h3>
                        <div class="inv-loading-progress">
                            <div class="inv-progress-bar">
                                <div class="inv-progress-fill" id="inv-progress-fill" style="width: 0%"></div>
                            </div>
                            <p class="inv-progress-text" id="inv-progress-text">
                                処理中... | Đang xử lý... (0 / ${totalItems})
                            </p>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.insertAdjacentHTML('beforeend', html);
        },

        /**
         * ✅ R6.9.9: Update progress bar
         */
        updateBulkProgress(currentChunk, totalChunks, itemsProcessed) {
            const progressFill = document.getElementById('inv-progress-fill');
            const progressText = document.getElementById('inv-progress-text');
            
            if (!progressFill || !progressText) return;
            
            const percentage = (currentChunk / totalChunks) * 100;
            progressFill.style.width = `${percentage}%`;
            
            progressText.innerHTML = `
                処理中... | Đang xử lý...<br>
                <small>チャンク ${currentChunk} / ${totalChunks} | Batch ${currentChunk} / ${totalChunks}</small><br>
                <small>完了: ${itemsProcessed} 項目 | Đã xử lý: ${itemsProcessed} mục</small>
            `;
        },

        /**
         * ✅ R6.9.9: Hide loading overlay
         */
        hideBulkLoadingOverlay() {
            document.getElementById('inv-bulk-loading-overlay')?.remove();
        },


        /**
         * Process bulk relocate (thay đổi vị trí + kiểm kê hàng loạt)
         */
        processBulkRelocate() {
            const items = window.InventoryState.selectedItems;
            const rackLayer = prompt(
                '棚段ID (例: 112) を入力\nNhập RackLayerID (vd: 112)'
            );

            if (!rackLayer) return;

            const operator = window.InventoryState.operator;

            console.log('[InventoryManager] 📍 Processing bulk relocate for', items.length, 'items');

            items.forEach(item => {
                // Dispatch location update
                document.dispatchEvent(new CustomEvent('updateLocation', {
                    detail: {
                        item: item.data,
                        type: item.type,
                        rackLayerId: rackLayer,
                        reason: 'inventory',
                        operator,
                        source: 'inventoryBulk'
                    }
                }));

                // Dispatch checkin
                setTimeout(() => {
                    document.dispatchEvent(new CustomEvent('triggerCheckin', {
                        detail: {
                            item: item.data,
                            type: item.type,
                            mode: 'inventory',
                            operator,
                            source: 'inventoryBulk'
                        }
                    }));
                }, 200);

                // Record audit
                this.recordAudit(item.id, item.type, new Date().toISOString());
            });

            // Clear selection
            window.InventoryState.selectedItems = [];
            this.updateBulkCount(0);

            // Close popup
            document.getElementById('inv-bulk-popup-overlay')?.remove();

            // Update badges
            document.dispatchEvent(new CustomEvent('inventory:refreshBadges'));

            //alert(`✅ ${items.length} 項目の位置を変更して棚卸しました\nĐã đổi vị trí và kiểm kê ${items.length} mục`);
        },

        /**
         * ✅ R6.9.9: Toggle item selection với debounce
         */
        toggleItemSelection(itemId, itemType, itemData) {
            const selectedItems = window.InventoryState.selectedItems;
            const index = selectedItems.findIndex(
                item => item.id === itemId && item.type === itemType
            );

            if (index > -1) {
                // ✅ Deselect
                selectedItems.splice(index, 1);
                console.log(`[InventoryManager] Deselected: ${itemType}:${itemId}`);
            } else {
                // ✅ Check max selection limit (optional safety)
                const MAX_SELECTION = 500;
                if (selectedItems.length >= MAX_SELECTION) {
                    this.showNotification(
                        `⚠️ 最大 ${MAX_SELECTION} 項目まで選択可能 | Tối đa ${MAX_SELECTION} mục`,
                        'warning'
                    );
                    return;
                }
                
                // ✅ Select
                selectedItems.push({
                    id: itemId,
                    type: itemType,
                    data: itemData
                });
                console.log(`[InventoryManager] Selected: ${itemType}:${itemId}`);
            }

            // ✅ Update count badge
            this.updateBulkCount(selectedItems.length);
            
            // ✅ Save selection to sessionStorage (persist across page refresh)
            this.saveSelectionToSession();
        },

        /**
         * ✅ R6.9.9: Save selection to sessionStorage
         */
        saveSelectionToSession() {
            try {
                const selection = window.InventoryState.selectedItems.map(item => ({
                    id: item.id,
                    type: item.type
                    // Don't save full data object to reduce size
                }));
                
                sessionStorage.setItem('inventory_selection', JSON.stringify(selection));
            } catch (e) {
                console.warn('[InventoryManager] Failed to save selection:', e);
            }
        },

        /**
         * ✅ R6.9.9: Restore selection from sessionStorage
         */
        restoreSelectionFromSession() {
            try {
                // 1) Khôi phục trạng thái selectionMode (dùng cho nút Lựa chọn + table toolbar)
                const modeRaw = sessionStorage.getItem('inventoryselectionmode');
                if (modeRaw != null) {
                window.InventoryState.selectionMode = (modeRaw === 'true');
                }

                // 2) Khôi phục danh sách item đã chọn (dùng chung cho in ấn + kiểm kê hàng loạt)
                const raw = sessionStorage.getItem('inventoryselection');
                if (!raw) {
                this.updateBulkCount(0);
                return;
                }

                const selection = JSON.parse(raw);
                window.InventoryState.selectedItems = selection
                .map(sel => ({
                    id: sel.id,
                    type: sel.type,
                    data: this.getItemData(sel.id, sel.type)
                }))
                .filter(item => item.data);

                this.updateBulkCount(window.InventoryState.selectedItems.length);
                console.log('[InventoryManager] Restored selection:', window.InventoryState.selectedItems.length);

                // 3) Phát event để UIRenderer + MobileTableView cập nhật checkbox/card/table
                if (window.InventoryState.selectionMode) {
                document.dispatchEvent(new CustomEvent('selection:modeChanged', {
                    detail: { enabled: true }
                }));
                }
            } catch (e) {
                console.warn('[InventoryManager] Failed to restore selection', e);
            }
        },


        /**
         * ✅ R6.9.9: Get item data by ID
         */
        getItemData(itemId, itemType) {
            const data = window.DataManager?.data;
            if (!data) return null;
            
            if (itemType === 'mold') {
                return data.molds.find(m => m.MoldID === itemId || m.MoldCode === itemId);
            } else if (itemType === 'cutter') {
                return data.cutters.find(c => c.CutterID === itemId || c.CutterNo === itemId);
            }
            
            return null;
        },



        /**
         * Update bulk count badge
         */
        updateBulkCount(count) {
            const badge = document.querySelector('.inv-bulk-count');
            if (badge) {
                badge.textContent = count;
                badge.style.display = count > 0 ? 'flex' : 'none';
            }
        },

        /**
         * Record audit history (đơn lẻ)
         * ✅ R6.9.8: Gọi endpoint /api/checklog với AuditDate và AuditType
         */
        async recordAudit(itemId, itemType, date) {
            const key = `${itemType}:${itemId}`;
            window.InventoryState.auditHistory[key] = date;

            // Save to statuslogs.csv via server
            await this.saveToStatusLogs(itemId, itemType, date, window.InventoryState.operator);

            // Save to localStorage (fallback)
            this.saveAuditHistory();

            console.log('[InventoryManager] Audit recorded:', key, date);

            // ✅ Dispatch event để UI refresh ngay lập tức
            document.dispatchEvent(new CustomEvent('inventory:auditRecorded', {
                detail: { itemId, itemType, date }
            }));
            console.log('[InventoryManager] 📡 Event dispatched: inventory:auditRecorded');
        },




     
        /**
         * Save audit record to statuslogs.csv via server API
         * ✅ R6.9.8: Sử dụng endpoint /api/checklog (đã có AuditDate, AuditType)
         */
        async saveToStatusLogs(itemId, itemType, date, operator) {
            const API_URL = 'https://ysd-moldcutter-backend.onrender.com/api/checklog'; // ✅ FIXED ENDPOINT
            
            const auditDate = typeof date === 'string' ? date.split('T')[0] : new Date().toISOString().split('T')[0];
            
            const record = {
                MoldID: itemType === 'mold' ? itemId : '',
                CutterID: itemType === 'cutter' ? itemId : '',
                ItemType: itemType,
                Status: 'AUDIT',
                Timestamp: new Date().toISOString(),
                EmployeeID: operator || window.InventoryState.operator || '',
                DestinationID: '',
                Notes: '棚卸 | Kiểm kê',
                AuditDate: auditDate,        // ✅ NEW
                AuditType: 'AUDIT_ONLY'      // ✅ NEW
            };

        
        try {
            const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(record)
            });
            
            const result = await response.json();
            
            if (result.success) {
            console.log('[InventoryManager] ✅ Audit saved to server:', result);
            } else {
            console.error('[InventoryManager] ❌ Server error:', result.error);
            // Fallback: Save to localStorage
            this.saveToLocalStorage(itemId, itemType, date);
            }
            
        } catch (error) {
            console.error('[InventoryManager] ❌ Network error:', error);
            // Fallback: Save to localStorage
            this.saveToLocalStorage(itemId, itemType, date);
        }
        },

        /**
         * Fallback: Save to localStorage if server fails
         */
        saveToLocalStorage(itemId, itemType, date) {
        const key = `${itemType}:${itemId}`;
        window.InventoryState.auditHistory[key] = date;
        this.saveAuditHistory();
        console.log('[InventoryManager] Saved to localStorage (fallback):', key);
        },


        /**
         * Get last audit date
         */
        getLastAuditDate(itemId, itemType) {
            const key = `${itemType}:${itemId}`;
            return window.InventoryState.auditHistory[key] || null;
        },

        /**
         * Check if audited today
         */
        isAuditedToday(itemId, itemType) {
            const lastDate = this.getLastAuditDate(itemId, itemType);
            if (!lastDate) return false;

            const today = new Date().toISOString().split('T')[0];
            const auditDate = lastDate.split('T')[0];

            return today === auditDate;
        },

        /**
         * Save audit history to localStorage
         */
        saveAuditHistory() {
            try {
                localStorage.setItem(
                    'inventory_audit_history',
                    JSON.stringify(window.InventoryState.auditHistory)
                );
            } catch (e) {
                console.warn('[InventoryManager] Failed to save audit history:', e);
            }
        },

        /**
         * Load audit history from localStorage
         */
        loadAuditHistory() {
            try {
                const data = localStorage.getItem('inventory_audit_history');
                if (data) {
                    window.InventoryState.auditHistory = JSON.parse(data);
                    console.log('[InventoryManager] ✅ Audit history loaded');
                }
            } catch (e) {
                console.warn('[InventoryManager] Failed to load audit history:', e);
            }
        },

        /**
         * R7.0.5: Load audit history from statuslogs.csv (GitHub)
         * - Reads AUDIT records from statuslogs
         * - Populates auditHistory cache
         * - Enables badge display across devices
         */
        loadAuditHistoryFromStatusLogs() {
            const statusLogs = window.DataManager?.data?.statuslogs;
            
            if (!statusLogs || !Array.isArray(statusLogs)) {
                console.warn('[InventoryManager] statuslogs not loaded yet');
                return;
            }
            
            // ✅ THÊM: Clear cache cũ trước khi load mới
            window.InventoryState.auditHistory = {};
            
            // Filter AUDIT records
            const auditRecords = statusLogs.filter(log => {
                const status = log.Status?.toUpperCase();
                return status === 'AUDIT' || status?.includes('AUDIT');
            });
            
            console.log(`[InventoryManager] Loading ${auditRecords.length} audit records from statuslogs.csv`);
            
            // Populate cache
            auditRecords.forEach(log => {
                const moldId = log.MoldID;
                const cutterId = log.CutterID;
                const auditDate = log.AuditDate || log.Timestamp?.split('T')[0];
                
                if (moldId && auditDate) {
                const key = `mold${moldId}`;
                window.InventoryState.auditHistory[key] = auditDate;
                }
                if (cutterId && auditDate) {
                const key = `cutter${cutterId}`;
                window.InventoryState.auditHistory[key] = auditDate;
                }
            });
            
            // ✅ THÊM: Save to localStorage as backup
            try {
                localStorage.setItem('inventoryaudithistory', JSON.stringify(window.InventoryState.auditHistory));
            } catch (e) {
                console.warn('[InventoryManager] Failed to save audit history to localStorage:', e);
            }
            
            console.log(`[InventoryManager] Audit cache loaded: ${Object.keys(window.InventoryState.auditHistory).length} items`);
            
            // Refresh UI
            document.dispatchEvent(new CustomEvent('inventoryrefreshBadges'));
            },

        /**
         * R7.1.3 - AUTO REFRESH CACHE MỖI 30 PHÚT
         * Tự động load lại dữ liệu từ GitHub để đảm bảo đồng bộ
         */
        setupAutoRefreshCache() {
        const REFRESH_INTERVAL = 30 * 60 * 1000; // 30 phút
        
        console.log('[InventoryManager] Setup auto-refresh cache every 30 minutes');
        
        setInterval(() => {
            console.log('[InventoryManager] Auto-refreshing audit cache from GitHub...');
            
            // Clear localStorage cache cũ
            try {
            localStorage.removeItem('inventoryaudithistory');
            window.InventoryState.auditHistory = {};
            } catch (e) {
            console.warn('[InventoryManager] Failed to clear cache:', e);
            }
            
            // Load lại từ statuslogs.csv
            this.loadAuditHistoryFromStatusLogs();
            
            // Refresh UI
            document.dispatchEvent(new CustomEvent('inventoryrefreshBadges'));
            
            console.log('[InventoryManager] Auto-refresh completed');
        }, REFRESH_INTERVAL);
        },

        /**
         * Open modal (alias for action-buttons compatibility)
         */
        openModal(item) {
            // iPad: Toggle directly
            // iPhone: Open settings
            if (!window.InventoryState.active) {
                this.openSettings();
            } else {
                this.toggleOff();
            }
        },

        // Tìm phần tử menubar "Location" để gắn huy hiệu ON/OFF
        getMenubarTargets() {
        const sels = ['#menu-location', '#tab-location', '[data-menu="location"]', '.bottom-nav .menu-location'];
        for (const s of sels) {
            const el = document.querySelector(s);
            if (el) return el;
        }
        return null;
        },

        renderMenubarToggle() {
        const parent = this.getMenubarTargets();
        const st = window.InventoryState;
        if (!parent) return;

        // tạo badge ON/OFF nếu chưa có
        let badge = parent.querySelector('.inv-mode-dot');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'inv-mode-dot';
            parent.style.position = parent.style.position || 'relative';
            parent.appendChild(badge);

            // Click badge → toggle nhanh
            badge.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleInventoryMode(); // ON/OFF nhanh
            });
        }
        badge.classList.toggle('on', !!st.active);
        badge.title = st.active ? '棚卸 ON' : '棚卸 OFF';

        // phát sự kiện để các nơi khác (button label) cập nhật
        document.dispatchEvent(new CustomEvent('inventory:modeChanged', { detail: { active: st.active } }));
        },

            /**
     * Record audit to cache only (không gọi API)
     * Dùng khi đã gọi batch API
     */
    /**
     * ✅ R6.9.9: Record audit to cache
     */
    recordAuditToCache(itemId, itemType, date) {
        const cacheKey = `audit_${itemType}_${itemId}`;
        const cacheData = {
            date: date,
            timestamp: new Date().toISOString()
        };
        
        try {
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            console.log(`[InventoryManager] Cached audit: ${cacheKey}`);
        } catch (e) {
            console.warn('[InventoryManager] Cache failed:', e);
        }
    },

    /**
     * ✅ R6.9.9: Record audit to cache WITHOUT dispatching event
     * Used for bulk operations to avoid re-rendering for each item
     */
    recordAuditToCacheSilent(itemId, itemType, date) {
        const cacheKey = `audit_${itemType}_${itemId}`;
        const cacheData = {
            date: date,
            timestamp: new Date().toISOString(),
            cached: true
        };
        
        try {
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            // ✅ NO EVENT DISPATCH - Silent mode
        } catch (e) {
            console.warn('[InventoryManager] Cache failed:', e);
        }
    },

    /**
     * ✅ R6.9.9: Show notification toast
     */
    showNotification(message, type = 'info', duration = 3000) {
        // Remove existing notification
        const existing = document.getElementById('inv-notification-toast');
        if (existing) existing.remove();
        
        // Create toast
        const toast = document.createElement('div');
        toast.id = 'inv-notification-toast';
        toast.className = `inv-notification inv-notification-${type}`;
        toast.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#ff9800'};
            color: white;
            padding: 16px 24px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10001;
            font-size: 14px;
            max-width: 400px;
            animation: slideInRight 0.3s ease-out;
            white-space: pre-line;
        `;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        // Auto remove
        setTimeout(() => {
            toast.style.animation = 'slideOutRight 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

        /**
     * ✅ R6.9.8: Open audit history viewer
     * Opens in new tab/window
     */
    openHistoryViewer() {
        const url = 'audit-history-viewer.html';
        
        // Check if file exists
        if (typeof window.AuditHistoryViewer === 'undefined') {
            // Open in new tab
            window.open(url, '_blank', 'noopener,noreferrer');
        } else {
            // If loaded in same page (future modal implementation)
            console.log('[InventoryManager] History viewer already loaded');
        }
        
        console.log('[InventoryManager] 📊 History viewer opened:', url);
    },

    /**
     * R7.0.7 - Clear all audit cache from localStorage
     * Xóa toàn bộ cache audit và reload data từ server
     */
    clearAuditCache() {
        if (!confirm('⚠️ Xóa toàn bộ dữ liệu audit cache?\n\nDữ liệu sẽ được tải lại từ server.')) {
            return;
        }
        
        console.log('[InventoryManager] Clearing audit cache...');
        let removedCount = 0;
        
        // Remove all audit-related localStorage keys
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('audit') || key === 'inventoryaudithistory') {
                localStorage.removeItem(key);
                removedCount++;
                console.log('[InventoryManager] Removed:', key);
            }
        });
        
        // Clear auditHistory state
        window.InventoryState.auditHistory = {};
        
        // Reload audit data from statuslogs.csv
        this.loadAuditHistoryFromStatusLogs();
        
        // Refresh UI
        document.dispatchEvent(new CustomEvent('inventoryrefreshBadges'));
        
        this.showNotification(`✅ Đã xóa ${removedCount} cache records`, 'success', 3000);
        console.log(`[InventoryManager] Cleared ${removedCount} cache records`);
    }

    };

    

    // ========================================
    // AUTO-INIT
    // ========================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.InventoryManager.init();
        });
    } else {
        window.InventoryManager.init();
    }

})();

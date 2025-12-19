/**
 * bulk-inventory-fab-r7.1.2-FIXED.js
 * 
 * Floating Action Button (FAB) cho chế độ kiểm kê hàng loạt
 * 
 * FIXED:
 * 1. ✅ Lấy đúng itemId từ SelectionManager (item.id thay vì item.itemId)
 * 2. ✅ Toast notification thay loading dialog (không chặn UI)
 * 3. ✅ Gọi lại InventoryManager.recordAudit (tránh trùng lặp code)
 * 4. ✅ Tắt hoàn toàn inventory mode khi exit (không chỉ tắt FAB)
 * 5. ✅ Delay 50ms giữa mỗi audit item (tránh quá tải)
 * 
 * Version: r7.1.2-FIXED
 * Date: 2025.12.15
 */

(function() {
    'use strict';

    const BulkInventoryFAB = {
        state: {
            isVisible: false,
            isDragging: false,
            isPopupOpen: false,
            selectedCount: 0,
            position: { x: window.innerWidth - 80, y: window.innerHeight - 150 }
        },

        init() {
            console.log('[BulkInventoryFAB] 🚀 Initializing...');
            this.createFAB();
            this.bindEvents();
            console.log('[BulkInventoryFAB] ✅ Initialized');
        },

        createFAB() {
            if (document.getElementById('bulk-inventory-fab')) {
                console.warn('[BulkInventoryFAB] FAB already exists');
                return;
            }

            const fabHTML = `
                <!-- Floating Action Button -->
                <div id="bulk-inventory-fab" class="bulk-fab hidden" style="left: ${this.state.position.x}px; top: ${this.state.position.y}px;">
                    <div class="bulk-fab-button">
                        <span class="bulk-fab-icon">📋</span>
                        <span class="bulk-fab-badge">0</span>
                    </div>
                </div>

                <!-- Popup Menu -->
                <div id="bulk-inventory-popup" class="bulk-popup hidden">
                    <div class="bulk-popup-header">
                        <h3>一括棚卸し / Kiểm kê hàng loạt</h3>
                        <button class="bulk-popup-close" aria-label="閉じる / Đóng">×</button>
                    </div>
                    
                    <div class="bulk-popup-body">
                        <!-- Số lượng đã chọn -->
                        <div class="bulk-selection-count">
                            <span class="count-label">選択済み / Đã chọn:</span>
                            <span class="count-value" id="bulk-selection-count-value">0</span>
                            <span class="count-unit">件 / mục</span>
                        </div>

                        <!-- Actions -->
                        <div class="bulk-popup-actions">
                            <button class="bulk-action-btn btn-select-all" id="bulk-select-all-btn">
                                <span class="btn-icon">☑️</span>
                                <span class="btn-text">すべて選択 / Chọn tất cả</span>
                                <span class="btn-hint">(表示中の100件)</span>
                            </button>

                            <button class="bulk-action-btn btn-clear" id="bulk-clear-all-btn">
                                <span class="btn-icon">❌</span>
                                <span class="btn-text">選択解除 / Hủy chọn</span>
                            </button>

                            <button class="bulk-action-btn btn-confirm" id="bulk-confirm-btn">
                                <span class="btn-icon">✅</span>
                                <span class="btn-text">確認実行 / Xác nhận kiểm kê</span>
                            </button>

                            <button class="bulk-action-btn btn-exit" id="bulk-exit-btn">
                                <span class="btn-icon">🚪</span>
                                <span class="btn-text">モード終了 / Thoát hoàn toàn</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Overlay (backdrop) -->
                <div id="bulk-popup-overlay" class="bulk-popup-overlay hidden"></div>
                
                <!-- Toast Container -->
                <div id="bulk-toast-container" class="bulk-toast-container"></div>
            `;

            document.body.insertAdjacentHTML('beforeend', fabHTML);
            console.log('[BulkInventoryFAB] ✅ HTML structure created');
        },

        bindEvents() {
            const fab = document.getElementById('bulk-inventory-fab');
            const popup = document.getElementById('bulk-inventory-popup');
            const overlay = document.getElementById('bulk-popup-overlay');

            if (!fab || !popup || !overlay) {
                console.error('[BulkInventoryFAB] Required elements not found');
                return;
            }

            // FAB Click
            fab.addEventListener('click', (e) => {
                if (this.state.isDragging) return;
                this.openPopup();
            });

            // Drag & Drop
            this.setupDragAndDrop(fab);

            // Close popup
            const closeBtn = document.querySelector('.bulk-popup-close');
            if (closeBtn) closeBtn.addEventListener('click', () => this.closePopup());
            overlay.addEventListener('click', () => this.closePopup());

            // Action buttons
            document.getElementById('bulk-select-all-btn')?.addEventListener('click', () => this.selectAllRendered());
            document.getElementById('bulk-clear-all-btn')?.addEventListener('click', () => this.clearAllSelection());
            document.getElementById('bulk-confirm-btn')?.addEventListener('click', () => this.confirmAudit());
            document.getElementById('bulk-exit-btn')?.addEventListener('click', () => this.exitBulkMode());

            // Selection changes
            document.addEventListener('selection:changed', (e) => {
                const count = e.detail?.count || 0;
                this.updateBadge(count);
            });

            // Bulk mode toggle
            document.addEventListener('selection:modeChanged', (e) => {
                const enabled = e.detail?.enabled !== false;
                if (enabled) {
                    this.show();
                } else {
                    this.hide();
                    this.closePopup();
                }
            });

            console.log('[BulkInventoryFAB] ✅ Events bound');
        },

        setupDragAndDrop(fab) {
            let startX, startY, initialX, initialY;

            const onTouchStart = (e) => {
                const touch = e.touches[0];
                startX = touch.clientX;
                startY = touch.clientY;
                initialX = this.state.position.x;
                initialY = this.state.position.y;
                fab.style.transition = 'none';
            };

            const onTouchMove = (e) => {
                e.preventDefault();
                const touch = e.touches[0];
                const deltaX = touch.clientX - startX;
                const deltaY = touch.clientY - startY;

                if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
                    this.state.isDragging = true;
                }

                let newX = initialX + deltaX;
                let newY = initialY + deltaY;

                const maxX = window.innerWidth - 70;
                const maxY = window.innerHeight - 70;
                newX = Math.max(10, Math.min(newX, maxX));
                newY = Math.max(10, Math.min(newY, maxY));

                fab.style.left = newX + 'px';
                fab.style.top = newY + 'px';
            };

            const onTouchEnd = () => {
                fab.style.transition = 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                this.state.position.x = parseInt(fab.style.left, 10);
                this.state.position.y = parseInt(fab.style.top, 10);
                setTimeout(() => { this.state.isDragging = false; }, 100);
            };

            fab.addEventListener('touchstart', onTouchStart, { passive: false });
            fab.addEventListener('touchmove', onTouchMove, { passive: false });
            fab.addEventListener('touchend', onTouchEnd);

            // Desktop support
            fab.addEventListener('mousedown', (e) => {
                startX = e.clientX;
                startY = e.clientY;
                initialX = this.state.position.x;
                initialY = this.state.position.y;
                fab.style.transition = 'none';

                const onMouseMove = (e) => {
                    const deltaX = e.clientX - startX;
                    const deltaY = e.clientY - startY;

                    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
                        this.state.isDragging = true;
                    }

                    let newX = initialX + deltaX;
                    let newY = initialY + deltaY;

                    const maxX = window.innerWidth - 70;
                    const maxY = window.innerHeight - 70;
                    newX = Math.max(10, Math.min(newX, maxX));
                    newY = Math.max(10, Math.min(newY, maxY));

                    fab.style.left = newX + 'px';
                    fab.style.top = newY + 'px';
                };

                const onMouseUp = () => {
                    fab.style.transition = 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                    this.state.position.x = parseInt(fab.style.left, 10);
                    this.state.position.y = parseInt(fab.style.top, 10);
                    setTimeout(() => { this.state.isDragging = false; }, 100);
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                };

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        },

        show() {
            const fab = document.getElementById('bulk-inventory-fab');
            if (fab) {
                fab.classList.remove('hidden');
                this.state.isVisible = true;
                console.log('[BulkInventoryFAB] ✅ Shown');
            }
        },

        hide() {
            const fab = document.getElementById('bulk-inventory-fab');
            if (fab) {
                fab.classList.add('hidden');
                this.state.isVisible = false;
                console.log('[BulkInventoryFAB] ✅ Hidden');
            }
        },

        updateBadge(count) {
            const badge = document.querySelector('.bulk-fab-badge');
            const popupCount = document.getElementById('bulk-selection-count-value');
            
            if (badge) {
                badge.textContent = String(count);
                badge.classList.toggle('hidden', count === 0);
            }
            
            if (popupCount) {
                popupCount.textContent = String(count);
            }
            
            this.state.selectedCount = count;
        },

        openPopup() {
            const popup = document.getElementById('bulk-inventory-popup');
            const overlay = document.getElementById('bulk-popup-overlay');
            
            if (popup && overlay) {
                popup.classList.remove('hidden');
                overlay.classList.remove('hidden');
                this.state.isPopupOpen = true;
                
                // ✅ FIX: Lấy count từ SelectionManager
                if (window.SelectionManager && typeof SelectionManager.getSelectedItems === 'function') {
                    const count = SelectionManager.getSelectedItems().length;
                    this.updateBadge(count);
                }
                
                console.log('[BulkInventoryFAB] ✅ Popup opened');
            }
        },

        closePopup() {
            const popup = document.getElementById('bulk-inventory-popup');
            const overlay = document.getElementById('bulk-popup-overlay');
            
            if (popup && overlay) {
                popup.classList.add('hidden');
                overlay.classList.add('hidden');
                this.state.isPopupOpen = false;
                console.log('[BulkInventoryFAB] ✅ Popup closed');
            }
        },

        selectAllRendered() {
            console.log('[BulkInventoryFAB] Selecting all rendered items...');
            
            const cards = document.querySelectorAll('.result-card[data-id][data-type]');
            console.log(`[BulkInventoryFAB] Found ${cards.length} rendered cards`);
            
            if (cards.length === 0) {
                this.showToast('⚠️ 表示中のアイテムがありません / Không có mục nào', 'warning');
                return;
            }

            if (window.SelectionManager && typeof SelectionManager.toggleItem === 'function') {
                cards.forEach(card => {
                    const itemId = card.getAttribute('data-id');
                    const itemType = card.getAttribute('data-type');
                    const index = parseInt(card.getAttribute('data-index'), 10);
                    
                    let itemData = null;
                    if (!isNaN(index) && window.UIRenderer?.state?.allResults?.[index]) {
                        itemData = window.UIRenderer.state.allResults[index];
                    }
                    
                    if (!SelectionManager.isSelected(itemId, itemType)) {
                        SelectionManager.toggleItem(itemId, itemType, itemData);
                    }
                });
                
                console.log('[BulkInventoryFAB] ✅ Selected all rendered items');
                this.showToast(`✅ ${cards.length}件選択しました / Đã chọn ${cards.length} mục`, 'success');
            } else {
                console.error('[BulkInventoryFAB] SelectionManager not available');
                this.showToast('❌ システムエラー / Lỗi hệ thống', 'error');
            }
        },

        clearAllSelection() {
            console.log('[BulkInventoryFAB] Clearing all selections...');
            
            if (window.SelectionManager && typeof SelectionManager.clear === 'function') {
                SelectionManager.clear();
                console.log('[BulkInventoryFAB] ✅ All selections cleared');
                this.showToast('✅ 選択を解除しました / Đã hủy chọn', 'success');
            } else {
                console.error('[BulkInventoryFAB] SelectionManager not available');
            }
        },
        
        // ====================================================================
        // ✅ FINAL FIX: confirmAudit - CHẠY TUẦN TỰ ĐỂ BACKEND KỊP COMMIT
        // ====================================================================
        confirmAudit() {
            console.log('[BulkInventoryFAB] Confirming audit...');
            
            if (!window.SelectionManager || typeof SelectionManager.getSelectedItems !== 'function') {
                this.showToast('❌ システムエラー / Lỗi hệ thống: SelectionManager not available', 'error');
                return;
            }

            const selectedItems = SelectionManager.getSelectedItems();
            const count = selectedItems.length;

            if (count === 0) {
                this.showToast('⚠️ アイテムが選択されていません / Chưa chọn mục nào', 'warning');
                return;
            }

            // Confirm dialog
            const confirmMsg = `${count}件のアイテムを棚卸ししますか？\n\nXác nhận kiểm kê ${count} mục?`;
            if (!confirm(confirmMsg)) {
                return;
            }

            // Đóng popup
            this.closePopup();

            // Hiển thị toast với progress
            const toastId = 'bulk-active-toast';
            this.showToast(`🔄 処理中... 0/${count} / Đang xử lý 0/${count}`, 'info', 0);

            // Kiểm tra InventoryManager
            if (!window.InventoryManager || typeof InventoryManager.recordAudit !== 'function') {
                console.error('[BulkInventoryFAB] InventoryManager.recordAudit not available');
                this.hideToast();
                this.showToast('❌ システムエラー / Lỗi hệ thống', 'error');
                return;
            }

            // ✅ QUAN TRỌNG: Chạy TUẦN TỰ để backend kịp commit lên GitHub
            const processSequential = async () => {
                const results = [];
                
                for (let idx = 0; idx < selectedItems.length; idx++) {
                    const item = selectedItems[idx];
                    
                    try {
                        // Lấy itemId từ SelectionManager
                        const itemId = item.id || item.itemId || item.MoldID || item.CutterID;
                        const itemType = item.type || item.itemType || 'mold';
                        
                        if (!itemId) {
                            console.warn('[BulkInventoryFAB] Item missing ID:', item);
                            results.push({ success: false, item, reason: 'missing_id' });
                            continue;
                        }

                        console.log(`[BulkInventoryFAB] 🔄 Recording audit ${idx+1}/${count}: ${itemType} ${itemId}`);

                        // Cập nhật progress trong toast
                        const toast = document.getElementById(toastId);
                        if (toast) {
                            const msg = toast.querySelector('.toast-message');
                            if (msg) {
                                msg.textContent = `🔄 処理中... ${idx+1}/${count} / Đang xử lý ${idx+1}/${count}`;
                            }
                        }

                        // ✅ Gọi recordAudit và ĐỢI hoàn thành
                        try {
                            await InventoryManager.recordAudit(itemId, itemType);
                            console.log(`[BulkInventoryFAB] ✅ Audit success: ${itemType} ${itemId}`);
                            results.push({ success: true, item, itemId, itemType });
                            
                            // ✅ Delay 800ms để backend kịp commit lên GitHub
                            await new Promise(resolve => setTimeout(resolve, 800));
                            
                        } catch (err) {
                            console.error(`[BulkInventoryFAB] ❌ Audit failed: ${itemType} ${itemId}`, err);
                            results.push({ success: false, item, itemId, itemType, error: err });
                            
                            // Delay ngắn hơn nếu lỗi
                            await new Promise(resolve => setTimeout(resolve, 300));
                        }
                        
                    } catch (err) {
                        console.error('[BulkInventoryFAB] Exception during audit:', err);
                        results.push({ success: false, item, error: err });
                    }
                }
                
                return results;
            };

            // Chạy tuần tự
            processSequential()
                .then(results => {
                    // Ẩn toast loading
                    this.hideToast();

                    // Đếm kết quả
                    const successCount = results.filter(r => r.success).length;
                    const failCount = count - successCount;

                    console.log(`[BulkInventoryFAB] 📊 Audit complete: ${successCount}/${count} success, ${failCount} failed`);

                    // Log các item thất bại
                    if (failCount > 0) {
                        const failedItems = results.filter(r => !r.success);
                        console.error('[BulkInventoryFAB] ❌ Failed items:', failedItems);
                        
                        failedItems.forEach((item, idx) => {
                            console.error(`  ${idx+1}. ItemID: ${item.itemId || 'unknown'}, Error:`, item.error || item.reason);
                        });
                    }

                    // Dispatch bulk event
                    const successItems = results
                        .filter(r => r.success)
                        .map(r => ({ itemId: r.itemId, itemType: r.itemType }));

                    document.dispatchEvent(new CustomEvent('inventory:bulkAuditCompleted', {
                        detail: { 
                            items: successItems,
                            date: new Date().toISOString(),
                            count: successCount,
                            failedCount: failCount
                        }
                    }));

                    // Clear selection
                    if (typeof SelectionManager.clear === 'function') {
                        SelectionManager.clear();
                    }

                    // Hiển thị kết quả
                    if (failCount === 0) {
                        this.showToast(`✅ ${successCount}件完了 / Đã kiểm kê ${successCount} mục`, 'success', 3000);
                    } else {
                        const failedItemIds = results
                            .filter(r => !r.success)
                            .map(r => r.itemId || 'unknown')
                            .join(', ');
                            
                        this.showToast(
                            `⚠️ 成功:${successCount} 失敗:${failCount}\n` +
                            `Thành công: ${successCount}, Thất bại: ${failCount}\n` +
                            `Items lỗi: ${failedItemIds}`,
                            'warning',
                            8000
                        );
                    }

                    // Re-render UI
                    setTimeout(() => {
                        if (window.UIRenderer && typeof UIRenderer.renderResults === 'function') {
                            const allResults = window.UIRenderer.state?.allResults || [];
                            UIRenderer.renderResults(allResults);
                        }
                    }, 500);
                })
                .catch(err => {
                    console.error('[BulkInventoryFAB] ❌ Bulk audit error:', err);
                    this.hideToast();
                    this.showToast('❌ 棚卸しに失敗しました / Kiểm kê thất bại', 'error');
                });
        },



        // ====================================================================
        // ✅ FIX: exitBulkMode - TẮT HOÀN TOÀN INVENTORY MODE
        // ====================================================================
        exitBulkMode() {
            console.log('[BulkInventoryFAB] 🚪 Exiting bulk mode...');
            
            const confirmMsg = '棚卸しモードを完全に終了しますか？\n選択中のアイテムはクリアされます。\n\nThoát hoàn toàn chế độ kiểm kê?\nCác mục đã chọn sẽ bị xóa.';
            if (!confirm(confirmMsg)) {
                return;
            }

            // 1. Tắt selection mode
            if (window.SelectionManager) {
                if (typeof SelectionManager.setMode === 'function') {
                    SelectionManager.setMode(false);
                }
                if (typeof SelectionManager.clear === 'function') {
                    SelectionManager.clear();
                }
            }

            // 2. Đồng bộ checkbox toggle về OFF
            const toggle = document.getElementById('selection-mode-toggle');
            if (toggle) {
                toggle.checked = false;
            }

            // 3. ✅ FIX: TẮT HẲN INVENTORY MODE (QUAN TRỌNG)
            if (window.InventoryState) {
                window.InventoryState.bulkMode = false;
                window.InventoryState.inventoryMode = false; // ← TẮT CHẾ ĐỘ KIỂM KÊ
                window.InventoryState.selectedItems = [];
            }

            // 4. Dispatch event tắt inventory mode
            document.dispatchEvent(new CustomEvent('inventoryModeChanged', {
                detail: { enabled: false }
            }));

            // 5. Dispatch event tắt selection mode
            document.dispatchEvent(new CustomEvent('selection:modeChanged', {
                detail: { enabled: false }
            }));

            // 6. Ẩn FAB và đóng popup
            this.hide();
            this.closePopup();

            // 7. Cập nhật badge trên nút kiểm kê (desktop + mobile)
            if (window.InventoryManager && typeof InventoryManager.updateInventoryBadge === 'function') {
                InventoryManager.updateInventoryBadge(false);
            }

            // 8. Re-render UI về chế độ bình thường (không có checkbox)
            if (window.UIRenderer && typeof UIRenderer.renderResults === 'function') {
                const allResults = window.UIRenderer.state?.allResults || [];
                UIRenderer.renderResults(allResults);
            }

            console.log('[BulkInventoryFAB] ✅ Exited bulk mode completely (inventory mode OFF)');
            this.showToast('✅ 棚卸しモードを終了しました / Đã thoát chế độ kiểm kê', 'success', 2000);
        },

        // ====================================================================
        // ✅ NEW: TOAST NOTIFICATION METHODS (THAY LOADING DIALOG)
        // ====================================================================
        
        /**
         * Hiển thị toast notification
         * @param {string} message - Nội dung thông báo
         * @param {string} type - Loại: 'success', 'error', 'warning', 'info'
         * @param {number} duration - Thời gian hiển thị (ms), 0 = không tự đóng
         */
        showToast(message, type = 'info', duration = 3000) {
            const container = document.getElementById('bulk-toast-container');
            if (!container) {
                console.warn('[BulkInventoryFAB] Toast container not found');
                return;
            }

            // Xóa toast cũ (nếu có)
            this.hideToast();

            // Icon theo type
            const icons = {
                success: '✅',
                error: '❌',
                warning: '⚠️',
                info: '🔄'
            };

            const icon = icons[type] || '📋';

            // Tạo toast element
            const toast = document.createElement('div');
            toast.id = 'bulk-active-toast';
            toast.className = `bulk-toast bulk-toast-${type}`;
            toast.innerHTML = `
                <span class="toast-icon">${icon}</span>
                <span class="toast-message">${message}</span>
            `;

            container.appendChild(toast);

            // Animation fade in
            setTimeout(() => toast.classList.add('show'), 10);

            // Tự động ẩn (nếu duration > 0)
            if (duration > 0) {
                setTimeout(() => {
                    toast.classList.remove('show');
                    setTimeout(() => {
                        if (toast.parentNode) {
                            toast.remove();
                        }
                    }, 300);
                }, duration);
            }
        },

        /**
         * Ẩn toast hiện tại
         */
        hideToast() {
            const toast = document.getElementById('bulk-active-toast');
            if (toast) {
                toast.classList.remove('show');
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.remove();
                    }
                }, 300);
            }
        }
    };

    // ========================================================================
    // EXPORT & AUTO-INIT
    // ========================================================================
    
    window.BulkInventoryFAB = BulkInventoryFAB;

    // Auto-init khi DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            BulkInventoryFAB.init();
        }, { once: true });
    } else {
        BulkInventoryFAB.init();
    }

})();

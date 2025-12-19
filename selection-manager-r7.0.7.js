/**
 * selection-manager-r7.0.7.js
 *
 * 選択状態管理モジュール / Selection State Manager
 * - Thao tác danh sách chọn cho chế độ in / xử lý hàng loạt
 * - Thêm / xóa / toggle item trong danh sách chọn
 * - Phát event selection:changed để các module khác đồng bộ UI
 * - Cập nhật highlight trên DOM (card + mobile table)
 *
 * Backward compatible:
 * - Đồng bộ song song sang window.InventoryState.selectedItems
 * - Đồng bộ window.InventoryState.bulkMode với SelectionState.active
 */
(function () {
    'use strict';

    // ================================================
    // Global State: SelectionState + SelectionManager
    // ================================================
    if (!window.SelectionState) {
        window.SelectionState = {
            active: false,   // Chế độ chọn (選択モード) đang bật hay tắt
            items: []        // [{ id, type, item }]
        };
    }

    const SelectionManager = {
        // ------------------------------------------------
        // Bật / tắt chế độ chọn (dùng cho toolbar / header)
        // ------------------------------------------------
        setMode(enabled) {
            if (!window.SelectionState) {
                window.SelectionState = { active: false, items: [] };
            }

            window.SelectionState.active = !!enabled;

            // Nếu tắt mode → xóa toàn bộ lựa chọn + cache
            if (!enabled) {
                window.SelectionState.items = [];
                try {
                    sessionStorage.removeItem('selection.items');
                } catch (e) {
                    console.warn('[SelectionManager] session clear error', e);
                }
            }

            // Lưu trạng thái mode vào sessionStorage (khôi phục sau reload)
            try {
                sessionStorage.setItem(
                    'selection.mode',
                    window.SelectionState.active ? '1' : '0'
                );
            } catch (e) {
                console.warn('[SelectionManager] session save error', e);
            }

            // Đồng bộ với InventoryState (giữ tương thích các module cũ)
            if (!window.InventoryState) {
                window.InventoryState = {};
            }
            window.InventoryState.bulkMode = window.SelectionState.active;
            this.syncInventoryState();

            // Cập nhật highlight trên card + bảng
            this.updateDomHighlights();

            // Thông báo cho các module khác (InventoryManager, MobileTableView...)
            document.dispatchEvent(
                new CustomEvent('selection:modeChanged', {
                    detail: { enabled: window.SelectionState.active }
                })
            );
            document.dispatchEvent(
                new CustomEvent('selection:changed', {
                    detail: { items: [...window.SelectionState.items] }
                })
            );

            console.log(
                '[SelectionManager] setMode:',
                window.SelectionState.active,
                'items:',
                window.SelectionState.items.length
            );
        },

        // ------------------------------------------------
        // Đồng bộ SelectionState.items → InventoryState.selectedItems
        // (cho các script in / bulk cũ đang đọc InventoryState)
        // ------------------------------------------------
        syncInventoryState() {
            if (!window.InventoryState) {
                window.InventoryState = {};
            }

            const src = Array.isArray(window.SelectionState.items)
                ? window.SelectionState.items
                : [];

            window.InventoryState.selectedItems = src.map(sel => ({
                id: String(sel.id),
                type: sel.type,
                item: sel.item || null
            }));
        },

        /**
         * Kiểm tra xem item đã được chọn chưa
         */
        isSelected(id, type) {
            if (!window.SelectionState || !Array.isArray(window.SelectionState.items)) {
                return false;
            }
            return window.SelectionState.items.some(
                sel => String(sel.id) === String(id) && sel.type === type
            );
        },

        /**
         * Thêm item vào danh sách chọn
         */
        addItem(id, type, itemData = null) {
            if (!window.SelectionState) {
                window.SelectionState = { active: false, items: [] };
            }

            const alreadySelected = this.isSelected(id, type);
            if (alreadySelected) {
                //console.log('[SelectionManager] Item already selected:', id, type);
                return;
            }

            window.SelectionState.items.push({
                id: String(id),
                type: type,
                item: itemData
            });

            // Đồng bộ mirror cho các module cũ
            this.syncInventoryState();

            // Cập nhật highlight trên DOM
            this.updateDomHighlights();

            // Phát event để UI cập nhật (toolbar, số lượng, nút In/Hủy chọn)
            document.dispatchEvent(
                new CustomEvent('selection:changed', {
                    detail: {
                        action: 'add',
                        id,
                        type,
                        total: window.SelectionState.items.length
                    }
                })
            );
        },

        /**
         * Xóa item khỏi danh sách chọn
         */
        removeItem(id, type) {
            if (!window.SelectionState || !Array.isArray(window.SelectionState.items)) {
                return;
            }

            const initialLength = window.SelectionState.items.length;
            window.SelectionState.items = window.SelectionState.items.filter(
                sel => !(String(sel.id) === String(id) && sel.type === type)
            );

            if (window.SelectionState.items.length < initialLength) {
                // Đồng bộ mirror
                this.syncInventoryState();

                // Cập nhật highlight trên DOM
                this.updateDomHighlights();

                // Phát event
                document.dispatchEvent(
                    new CustomEvent('selection:changed', {
                        detail: {
                            action: 'remove',
                            id,
                            type,
                            total: window.SelectionState.items.length
                        }
                    })
                );
            }
        },

        /**
         * Toggle: nếu đã chọn thì xóa, chưa chọn thì thêm
         */
        toggleItem(id, type, itemData = null) {
            if (this.isSelected(id, type)) {
                this.removeItem(id, type);
            } else {
                this.addItem(id, type, itemData);
            }
        },

        /**
         * Thêm nhiều item cùng lúc (cho "chọn tất cả")
         * items: Array<[id, type, itemData]>
         */
        addMultiple(items) {
            if (!Array.isArray(items) || items.length === 0) return;
            if (!window.SelectionState) {
                window.SelectionState = { active: false, items: [] };
            }

            items.forEach(([id, type, itemData]) => {
                if (!this.isSelected(id, type)) {
                    window.SelectionState.items.push({
                        id: String(id),
                        type: type,
                        item: itemData
                    });
                }
            });

            // Đồng bộ mirror
            this.syncInventoryState();

            // Cập nhật highlight
            this.updateDomHighlights();

            document.dispatchEvent(
                new CustomEvent('selection:changed', {
                    detail: {
                        action: 'addMultiple',
                        count: items.length,
                        total: window.SelectionState.items.length
                    }
                })
            );
        },

        /**
         * Xóa nhiều item cùng lúc
         * items: Array<[id, type]>
         */
        removeMultiple(items) {
            if (!Array.isArray(items) || items.length === 0) return;
            if (!window.SelectionState || !Array.isArray(window.SelectionState.items)) {
                return;
            }

            items.forEach(([id, type]) => {
                window.SelectionState.items = window.SelectionState.items.filter(
                    sel => !(String(sel.id) === String(id) && sel.type === type)
                );
            });

            // Đồng bộ mirror
            this.syncInventoryState();

            // Cập nhật highlight
            this.updateDomHighlights();

            document.dispatchEvent(
                new CustomEvent('selection:changed', {
                    detail: {
                        action: 'removeMultiple',
                        count: items.length,
                        total: window.SelectionState.items.length
                    }
                })
            );
        },

        /**
         * Xóa toàn bộ lựa chọn
         */
        clear() {
            if (!window.SelectionState) return;

            const count = window.SelectionState.items.length;
            window.SelectionState.items = [];

            // Đồng bộ mirror
            this.syncInventoryState();

            // Cập nhật highlight
            this.updateDomHighlights();

            document.dispatchEvent(
                new CustomEvent('selection:changed', {
                    detail: {
                        action: 'clear',
                        total: 0
                    }
                })
            );

            //console.log('[SelectionManager] 🗑️ Cleared all selections:', count);
        },

        /**
         * Lấy danh sách item đã chọn
         */
        getSelectedItems() {
            if (!window.SelectionState || !Array.isArray(window.SelectionState.items)) {
                return [];
            }
            return window.SelectionState.items;
        },

        /**
         * Cập nhật highlight trên DOM (card + table row)
         * - Card: thêm/xóa class 'inv-bulk-selected', 'inv-selected'
         * - Card checkbox icon: thêm/xóa class 'checked'
         * - Table row: thêm/xóa class 'selected'
         * - Table checkbox: đánh dấu checked
         */
        updateDomHighlights() {
            if (!window.SelectionState || !Array.isArray(window.SelectionState.items)) {
                return;
            }

            const selectedIds = new Set(
                window.SelectionState.items.map(sel => `${sel.type}:${sel.id}`)
            );

            // ===== CẬP NHẬT CARD VIEW =====
            const cards = document.querySelectorAll('.result-card[data-id][data-type]');
            cards.forEach(card => {
                const id = card.getAttribute('data-id');
                const type = (card.getAttribute('data-type') || '').toLowerCase();
                const key = `${type}:${id}`;

                const checkbox = card.querySelector('.inv-bulk-checkbox');

                if (selectedIds.has(key)) {
                    // Đã chọn → thêm class highlight
                    card.classList.add('inv-bulk-selected', 'inv-selected');
                    if (checkbox) checkbox.classList.add('checked');
                } else {
                    // Chưa chọn → xóa class highlight
                    card.classList.remove('inv-bulk-selected', 'inv-selected');
                    if (checkbox) checkbox.classList.remove('checked');
                }
            });

            // ===== CẬP NHẬT TABLE VIEW (MOBILE) =====
            const tableRows = document.querySelectorAll(
                '#mobile-table-body tr[data-id][data-type]'
            );
            tableRows.forEach(row => {
                const id = row.getAttribute('data-id');
                const type = (row.getAttribute('data-type') || '').toLowerCase();
                const key = `${type}:${id}`;

                const checkbox = row.querySelector('input.row-checkbox[type="checkbox"]');

                if (selectedIds.has(key)) {
                    // Đã chọn
                    row.classList.add('selected');
                    if (checkbox) checkbox.checked = true;
                } else {
                    // Chưa chọn
                    row.classList.remove('selected');
                    if (checkbox) checkbox.checked = false;
                }
            });

                // ===== CẬP NHẬT TOOLBAR HEADER (card + table chung) =====
            try {
                const count = Array.isArray(window.SelectionState.items)
                    ? window.SelectionState.items.length
                    : 0;

                const toolbar = document.getElementById('table-toolbar-inline');
                const countSpan = document.getElementById('selected-count-inline');
                const printBtn = document.getElementById('mobile-print-btn-inline');
                const clearBtn = document.getElementById('mobile-clear-selection-inline');

                // Cập nhật số lượng
                if (countSpan) {
                    countSpan.textContent = String(count);
                }

                const hasSelection = count > 0;

                // Hiển thị/ẩn toolbar theo chế độ chọn
                if (toolbar) {
                    const selectionOn = !!window.SelectionState.active;
                    toolbar.style.display = selectionOn ? 'flex' : 'none';
                }

                // Bật/tắt nút In
                if (printBtn) {
                    printBtn.disabled = !hasSelection;
                    printBtn.classList.toggle('disabled', !hasSelection);
                }

                // Bật/tắt nút Xóa chọn
                if (clearBtn) {
                    clearBtn.disabled = !hasSelection;
                    clearBtn.classList.toggle('disabled', !hasSelection);
                }
            } catch (e) {
                console.warn('[SelectionManager] toolbar update error', e);
            }

            //console.log('[SelectionManager] 🎨 DOM highlights updated:', selectedIds.size, 'items');

            }
    };

        // ================================================
    // GLOBAL EVENT BINDING cho toolbar header (iPad/Desktop)
    // MobileTableView chỉ init trên iPhone < 768px
    // Nên cần bind ở đây để hoạt động trên mọi thiết bị
    // ================================================
    function bindToolbarEvents() {
        // Nút 全解除 (Clear selection) trong header
        const clearBtn = document.getElementById('mobile-clear-selection-inline');
        if (clearBtn && !clearBtn.dataset.smBound) {
            clearBtn.dataset.smBound = '1'; // Đánh dấu đã bind, tránh bind trùng
            clearBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('[SelectionManager] 全解除 clicked');
                SelectionManager.clear();
            });
            console.log('[SelectionManager] ✅ Clear button bound');
        }
    }

    // Bind khi DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindToolbarEvents);
    } else {
        bindToolbarEvents();
    }


    // Expose globally
    window.SelectionManager = SelectionManager;

    console.log('[SelectionManager] r7.0.7 ✅ Loaded');
})();

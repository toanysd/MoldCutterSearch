/**
 * ui-renderer-r7.1.2.js
 * 
 * KẾ THỪA TOÀN BỘ ui-renderer-r6.9.9.js + CẬP NHẬT MỚI TRONG R7.0.2 + R7.1.2
 * - Click event cho MobileDetailModal (iPhone/iPad)
 * - Sync với inventory mode toggle
 * - Hỗ trợ popup detail full-screen
 * - R7.1.2: Infinite scroll + Pull-to-refresh
 * - R7.1.2-FIXED: Selection mode capture-phase (ưu tiên chọn)
 * 
 * Version: r7.1.2-FIXED
 * Date: 2025.12.15
 * Base: ui-renderer-r6.9.9.js (WORKING VERSION)
 */

(function() {
    'use strict';

    // ============================================================================
    // SELECTORS
    // ============================================================================
    const SELECTORS = {
        quickListCandidates: ['#quick-results-list', '.quick-results-grid', '#quick-results', '[data-role="quick-results"]'],
        tableBodyCandidates: ['#results-table-body', '#all-results-body', '.results-table-body', '[data-role="results-body"]'],
        
        detailCompany: '#detail-company',
        detailRackId: '#detail-rack-id',
        detailLayerNum: '#detail-layer-num',
        detailRackLocation: '#detail-rack-location',
        detailLayerNotes: '#detail-layer-notes',
        
        detailCodeName: '#detail-code-name',
        detailName: '#detail-name',
        detailDimensions: '#detail-dimensions',
        detailCutline: '#detail-cutline',
        detailDate: '#detail-date',
        detailTeflon: '#detail-teflon',
        detailTray: '#detail-tray',
        detailPlastic: '#detail-plastic',
        detailNotes: '#detail-notes',
        detailProcessing: '#detail-processing',
        detailCompanyStorage: '#detail-company-storage',
        detailCheckinStatus: '#detail-checkin-status',
    };

    // ============================================================================
    // PERFORMANCE MONITORING
    // ============================================================================
    const PERF_CONFIG = {
        enabled: true, // đặt false khi production
        logThreshold: 50 // Log nếu operation > 50ms
    };

    function measurePerf(label, fn) {
        if (!PERF_CONFIG.enabled) return fn();
        const start = performance.now();
        const result = fn();
        const duration = performance.now() - start;
        if (duration > PERF_CONFIG.logThreshold) {
            console.warn(`⏱️ [PERF] ${label}: ${duration.toFixed(2)}ms`);
        }
        return result;
    }

    // ============================================================================
    // UTILITY: DEBOUNCE & THROTTLE
    // ============================================================================
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    function throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // ============================================================================
    // R7.0.2 DEVICE DETECTION HELPERS
    // ============================================================================
    function isMobileDevice() {
        return window.innerWidth <= 768;
    }

    function isIPadDevice() {
        return window.innerWidth > 768 && window.innerWidth <= 1024;
    }

    function shouldUseMobileDetail() {
        return isMobileDevice() || isIPadDevice();
    }

    // ============================================================================
    // Helper: kích thước hiển thị cho DAO CẮT trên card
    // Ưu tiên: CutlineLength/CutlineWidth từ cutters, CutlineX/CutlineY từ molddesign
    // ============================================================================
    function getCutterCardSize(item) {
        if (!item) return '';
        
        const cutLen = item.CutlineLength || item.CutlineX;
        const cutWid = item.CutlineWidth || item.CutlineY;
        const corner = item.CutterCorner || item.CornerR;
        const chamfer = item.CutterChamfer || item.ChamferC;
        
        if (!cutLen || !cutWid) return '';
        
        let text = `${cutLen}×${cutWid}`;
        if (corner) text += ` R${corner}`;
        if (chamfer) text += ` C${chamfer}`;
        return text;
    }

    /**
     * Format date từ ISO/SQL format thành YYYY.MM.DD
     * VD: "2025-12-15T03:35:27.051Z" → "2025.12.15"
     *     "20251215" → "2025.12.15"
     */
    function formatDateDots(dateStr) {
        if (!dateStr) return '-';
        
        try {
            // Nếu là format ISO (có dấu -)
            if (dateStr.includes('-')) {
                const datePart = dateStr.split('T')[0]; // "2025-12-15"
                return datePart.replace(/-/g, '.'); // "2025.12.15"
            }
            
            // Nếu là format compact "20251215"
            if (/^\d{8}$/.test(dateStr)) {
                return `${dateStr.substring(0,4)}.${dateStr.substring(4,6)}.${dateStr.substring(6,8)}`;
            }
            
            // Fallback: parse bằng Date object
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}.${month}.${day}`;
        } catch (e) {
            return dateStr;
        }
    }

    // ============================================================================
    // UI RENDERER MODULE
    // ============================================================================
    const UIRenderer = {
        state: {
            currentDetailItem: null,
            selectedItemId: null,
            isDetailPanelOpen: false,
            allResults: [], // R6.9.5: Lưu kết quả đã sắp xếp
            
            // R7.1.0: Cấu hình sắp xếp dùng chung (mặc định: ngày sản xuất mới nhất trước)
            sortConfig: {
                field: 'productionDate', // DeliveryDeadline || ProductionDate
                direction: 'desc' // 'asc' | 'desc'
            },
            
            // R7.1.2: Infinite scroll state
            renderedCount: 0,        // Số items đã render
            renderBatchSize: 50,     // Mỗi lần render thêm 50 items
            isLoadingMore: false     // Đang load thêm?
        },

        init() {
            // Load statuslogs.csv nếu chưa có
            if (!window.statusLogs) {
                window.statusLogs = {};
                fetch('https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/statuslogs.csv')
                    .then(res => res.text())
                    .then(text => {
                        const lines = text.trim().split('\n');
                        const header = lines[0].split(',').map(h => h.trim().toLowerCase());
                        const moldIdIndex = header.indexOf('moldid');
                        const statusIndex = header.indexOf('status');
                        
                        if (moldIdIndex === -1 || statusIndex === -1) {
                            console.error('[UIRenderer] CSV missing required columns: MoldID/Status');
                            return;
                        }
                        
                        for (let i = 1; i < lines.length; i++) {
                            const parts = lines[i].split(',');
                            const moldId = parts[moldIdIndex]?.trim();
                            const status = parts[statusIndex]?.trim()?.toLowerCase();
                            
                            if (moldId && status) {
                                window.statusLogs[moldId] = status.includes('in') ? 'in' : 'out';
                            }
                        }
                        console.log('[UIRenderer] ✅ Loaded statuslogs.csv, total:', Object.keys(window.statusLogs).length, 'records');
                    })
                    .catch(err => console.error('[UIRenderer] Load statuslogs.csv failed:', err));
            }

            // ========================================================================
            // Lắng nghe "search:updated"
            // ========================================================================
            document.addEventListener('search:updated', (e) => {
                const { results, origin } = e.detail;
                console.log('[UIRenderer] 🔔 search:updated received:', {
                    resultsCount: results?.length || 0,
                    origin: origin || 'unknown'
                });

                const rawItems = Array.isArray(results) ? results : [];
                
                // R7.1.1-FIX: Lưu RAW results (chưa lọc category), chỉ áp dụng sort
                this.state.allResults = this.applySortConfig(rawItems, this.state.sortConfig);
                
                // Render với toàn bộ kết quả (category filter sẽ do FilterModule xử lý qua event)
                this.renderResults(this.state.allResults);
                
                if (this.state.allResults.length) {
                    this.renderDetailInfo(this.state.allResults[0]);
                } else {
                    this.clearDetail();
                }
            });

            // ========================================================================
            // Lắng nghe "detail:changed" (GIỐNG R6.3 - KHÔNG THAY ĐỔI)
            // ========================================================================
            document.addEventListener('detail:changed', (e) => {
                const { item, itemType, itemId, source } = e.detail;
                if (item) {
                    this.updateDetailPanel(item);
                }

                // ✅ SỬA: LUÔN gọi updateLocationBadge cho mọi item (không check source)
                if (item && (item.MoldID || item.CutterID)) {
                    this.updateLocationBadge(item);
                    console.log('[UIRenderer] ✅ updateLocationBadge called for:', item.MoldID || item.CutterID, 'from source:', source);
                }

                // ✅ SỬA: LUÔN gọi updateCheckInBadge cho mọi item
                if (item && (item.MoldID || item.CutterID)) {
                    this.updateCheckInBadge(item);
                    console.log('[UIRenderer] ✅ updateCheckInBadge called for:', item.MoldID || item.CutterID, 'from source:', source);
                }
            });

            // ========================================================================
            // R6.9.5: Lắng nghe "inventory:sort"
            // ========================================================================
            document.addEventListener('inventory:sort', (e) => {
                const by = e.detail?.by || 'code';
                console.log('[UIRenderer] Sorting results by', by);
                
                // Lấy danh sách kết quả hiện tại từ state
                const currentResults = this.state.allResults;
                if (currentResults.length === 0) {
                    console.warn('[UIRenderer] No results to sort');
                    return;
                }
                
                // Tạo bản sao (không ảnh hưởng dữ liệu gốc)
                const sortedResults = currentResults.slice(0);
                
                if (by === 'rack') {
                    // Sắp xếp theo RackLayerID/displayLocation
                    sortedResults.sort((a, b) => {
                        const aRack = String(a.displayLocation || a.RackLayerID || '').trim();
                        const bRack = String(b.displayLocation || b.RackLayerID || '').trim();
                        return aRack.localeCompare(bRack, undefined, { numeric: true });
                    });
                    console.log('[UIRenderer] Sorted by RackLayerID');
                } else {
                    // Sắp xếp theo code (MoldCode/CutterNo)
                    sortedResults.sort((a, b) => {
                        const aCode = String(a.displayCode || a.MoldCode || a.CutterNo || '').trim();
                        const bCode = String(b.displayCode || b.MoldCode || b.CutterNo || '').trim();
                        return aCode.localeCompare(bCode);
                    });
                    console.log('[UIRenderer] Sorted by Code');
                }
                
                // Cập nhật state và re-render
                this.state.allResults = sortedResults;
                this.renderResults(sortedResults);
                console.log('[UIRenderer] Re-rendered', sortedResults.length, 'items after sort');
            });

            // ========================================================================
            // R7.1.0: Lắng nghe sort nâng cao từ Filter modal
            // R7.1.1-FIX: CHỈ sort, KHÔNG động vào category
            // ========================================================================
            document.addEventListener('results:sortChanged', (e) => {
                const cfg = e.detail;
                const field = cfg.field || 'productionDate';
                const direction = cfg.direction === 'asc' ? 'asc' : 'desc';
                
                console.log('[UIRenderer] 🔄 results:sortChanged:', field, direction);
                
                if (!Array.isArray(this.state.allResults) || this.state.allResults.length === 0) {
                    console.warn('[UIRenderer] ⚠️ No results to sort for results:sortChanged');
                    return;
                }
                
                // R7.1.1-FIX: CHỈ cập nhật sort config, KHÔNG động category
                this.state.sortConfig = { field, direction };
                this.state.allResults = this.applySortConfig(this.state.allResults, this.state.sortConfig);
                
                // Re-render toàn bộ (category filter do FilterModule xử lý riêng)
                this.renderResults(this.state.allResults);
                
                // Giữ chi tiết đang mở
                if (this.state.selectedItemId) {
                    const current = this.state.allResults.find(it => {
                        const id = it.MoldID || it.CutterID || it.MoldCode || it.CutterNo;
                        return String(id) === String(this.state.selectedItemId);
                    });
                    if (current) this.renderDetailInfo(current);
                }
                
                console.log('[UIRenderer] ✅ Sorted without touching category');
            });

            // ========================================================================
            // R7.1.1-FIX: Lắng nghe category changes từ FilterModule
            // ========================================================================
            document.addEventListener('category:changed', (e) => {
                const category = e.detail?.category || 'all';
                console.log('[UIRenderer] 🔄 category:changed received:', category);
                
                // Lọc allResults theo category, giữ nguyên sort
                const currentResults = this.state.allResults;
                let filtered = currentResults;
                
                if (category !== 'all') {
                    filtered = currentResults.filter(it => it.itemType === category);
                    console.log(`[UIRenderer] Filtered by category "${category}": ${filtered.length}/${currentResults.length}`);
                }
                
                // Re-render với danh sách lọc (GIỮ NGUYÊN SORT)
                this.renderResults(filtered);
                
                // Cập nhật detail panel nếu có item
                if (filtered.length > 0) {
                    this.renderDetailInfo(filtered[0]);
                } else {
                    this.clearDetail();
                }
            });

            // ========================================================================
            // R6.9.5: Lắng nghe "inventory:filter"
            // ========================================================================
            document.addEventListener('inventory:filter', (e) => {
                const { filterRack, filterLayer, filterType } = e.detail;
                console.log('[UIRenderer] Applying inventory filters:', { filterRack, filterLayer, filterType });
                
                let filtered = this.state.allResults.slice(0);
                
                // Filter by Rack
                if (filterRack) {
                    filtered = filtered.filter(item => {
                        const rackId = item.displayRackId || item.RackID || item.rackInfo?.RackID;
                        return String(rackId) === String(filterRack);
                    });
                }
                
                // Filter by Layer
                if (filterLayer) {
                    filtered = filtered.filter(item => {
                        const layerNum = item.displayLayerNum || item.LayerNum || item.rackInfo?.LayerNum;
                        return String(layerNum) === String(filterLayer);
                    });
                }
                
                // Filter by Type
                if (filterType && filterType !== 'all') {
                    filtered = filtered.filter(item => item.itemType === filterType);
                }
                
                this.renderResults(filtered);
                console.log(`[UIRenderer] Filtered ${this.state.allResults.length} → ${filtered.length} items`);
            });

            // ========================================================================
            // R6.9.7: Lắng nghe "inventory:bulkMode" → toggle class container
            // ========================================================================
            document.addEventListener('inventory:bulkMode', (e) => {
                const enabled = e.detail?.enabled || false;
                console.log('[UIRenderer] Bulk mode:', enabled ? 'ON' : 'OFF');
                
                // Toggle class trên container → kích hoạt CSS
                const quickList = document.querySelector('#quick-results-list');
                if (quickList) {
                    if (enabled) {
                        quickList.classList.add('inv-bulk-active');
                        console.log('[UIRenderer] ✅ Container class added: inv-bulk-active');
                    } else {
                        quickList.classList.remove('inv-bulk-active');
                        console.log('[UIRenderer] ✅ Container class removed: inv-bulk-active');
                    }
                }
                
                // Re-render → hiển thị checkboxes
                this.renderResults(this.state.allResults);
            });

            // ========================================================================
            // R6.9.5: Lắng nghe "inventory:refreshBadges"
            // ========================================================================
            document.addEventListener('inventory:refreshBadges', () => {
                console.log('[UIRenderer] Refreshing audit badges...');
                this.renderResults(this.state.allResults);
            });

            // ========================================================================
            // R6.9.7 - Lắng nghe "inventory:auditRecorded" → refresh badge ngay
            // ========================================================================
            document.addEventListener('inventory:auditRecorded', (e) => {
                const { itemId, itemType, date } = e.detail;
                console.log('[UIRenderer] Audit recorded event received:', { itemId, itemType, date });
                
                // ✅ Kiểm tra có phải hôm nay không
                const today = new Date().toISOString().split('T')[0];
                const auditDate = date ? date.split('T')[0] : null;
                const isToday = auditDate === today;
                
                const cardSelector = `[data-type="${itemType}"][data-id="${itemId}"]`;
                const card = document.querySelector(cardSelector);
                if (card) {
                    // ✅ XÓA badge cũ và tạo lại với format đúng
                    const line2 = card.querySelector('.card-line-2');
                    if (line2) {
                        // Xóa badge cũ
                        const oldBadge = line2.querySelector('.checkin-status-badge, .inv-audit-badge-inline');
                        if (oldBadge) oldBadge.remove();
                        
                        // Tạo badge mới với class đầy đủ
                        const newBadge = document.createElement('span');
                        newBadge.className = isToday 
                            ? 'checkin-status-badge checkin-audit checkin-audit-today'  // ✅ Xanh nếu hôm nay
                            : 'checkin-status-badge checkin-audit';  // Màu mặc định
                        
                        newBadge.innerHTML = `
                            <span class="badge-text">確認済</span>
                            <span class="sync-icon synced" title="同期済">✓</span>
                        `;
                        line2.appendChild(newBadge);
                        
                        console.log('[UIRenderer] ✅ Badge updated for card:', itemId, isToday ? '(TODAY - GREEN)' : '(normal)');
                    }
                    
                    // Cập nhật ngày kiểm kê
                    const dateSpan = card.querySelector('.card-date');
                    if (dateSpan && date) {
                        const formatted = date.replace(/-/g, '/');
                        dateSpan.textContent = formatted;
                        console.log('[UIRenderer] ✅ Date updated:', formatted);
                    }
                    
                    // ✅ Animation highlight NHẸ (không đổi nền lâu dài)
                    card.style.transition = 'box-shadow 0.3s ease';
                    card.style.boxShadow = '0 4px 12px rgba(76, 175, 80, 0.4)';
                    setTimeout(() => {
                        card.style.boxShadow = '';
                    }, 1000);
                } else {
                    console.warn('[UIRenderer] Card not found for update:', cardSelector);
                    this.renderResults(this.state.allResults);
                }
            });


            // R6.9.9 - Lắng nghe "inventory:bulkAuditCompleted" → batch update badges
            document.addEventListener('inventory:bulkAuditCompleted', (e) => {
                const { items, date, count } = e.detail;
                console.log('[UIRenderer] Bulk audit completed:', count, 'items');
                
                // Kiểm tra có phải hôm nay không
                const today = new Date().toISOString().split('T')[0]; // "2025-12-15"
                const auditDate = date ? date.split('T')[0] : null;
                const isToday = auditDate === today;
                
                // Batch update badges cho tất cả items
                items.forEach(({ itemId, itemType }) => {
                    const cardSelector = `[data-type="${itemType}"][data-id="${itemId}"]`;
                    const card = document.querySelector(cardSelector);
                    if (card) {
                        // ✅ XÓA badge cũ và tạo lại TOÀN BỘ với format đúng
                        const line2 = card.querySelector('.card-line-2');
                        if (line2) {
                            // Xóa badge cũ
                            const oldBadge = line2.querySelector('.checkin-status-badge, .inv-audit-badge-inline');
                            if (oldBadge) oldBadge.remove();
                            
                            // Tạo badge mới
                            const newBadge = document.createElement('span');
                            newBadge.className = isToday 
                                ? 'checkin-status-badge checkin-audit checkin-audit-today'  // ✅ Thêm class today
                                : 'checkin-status-badge checkin-audit';
                            
                            newBadge.innerHTML = `
                                <span class="badge-text">確認済</span>
                                <span class="sync-icon synced" title="同期済">✓</span>
                            `;
                            line2.appendChild(newBadge);
                            
                            console.log('[UIRenderer] ✅ Badge created:', itemId, isToday ? '(TODAY - GREEN)' : '(normal)');
                        }
                        
                        // Cập nhật ngày
                        const dateSpan = card.querySelector('.card-date');
                        if (dateSpan && date) {
                            const formatted = date.replace(/-/g, '/');
                            dateSpan.textContent = formatted;
                        }
                        
                        // ❌ KHÔNG THÊM CLASS VÀO CARD (giữ nguyên nền trắng)
                    }
                });
                
                // RE-RENDER MỘT LẦN DUY NHẤT
                if (UIRenderer.state && UIRenderer.state.allResults) {
                    UIRenderer.renderResults(UIRenderer.state.allResults);
                }
                console.log('[UIRenderer] ✅ Bulk badges updated:', count, 'items');
            });


            // ========================================================================
            // R7.0.6 - CRITICAL FIX: Lắng nghe "checkin-completed" → refresh cards
            // ========================================================================
            document.addEventListener('checkin-completed', (e) => {
                const { item, success, mode } = e.detail;
                if (!success || !item) return;
                
                console.log(`[UIRenderer] Check-in completed (${mode}), refreshing badges for:`, item.MoldID || item.CutterID);
                
                // Re-render toàn bộ cards → cập nhật status badge
                this.renderResults(this.state.allResults);
            });

            // ========================================================================
            // R7.0.8 - Lắng nghe "shipping-completed" → refresh IN/OUT + nơi lưu
            // ========================================================================
            document.addEventListener('shipping-completed', (e) => {
                const { item, success, toCompanyId } = e.detail;
                if (!success || !item) return;
                
                const id = item.MoldID || item.CutterID;
                console.log('[UIRenderer] Shipping completed, refreshing cards for:', id, '→', toCompanyId);
                
                // Cập nhật cache statusLogs đơn giản (in/out) nếu đang dùng
                if (window.statusLogs && id) {
                    window.statusLogs[String(id)] = 'out'; // Vận chuyển ra ngoài → coi như OUT
                }
                
                // Re-render toàn bộ cards
                // - badge IN/OUT lấy trạng thái mới nhất từ DataManager.data.statuslogs
                // - text "Công ty lưu trữ" (badge ngoài/bên nội bộ) dùng storagecompany mới
                this.renderResults(this.state.allResults);
            });

            // ========================================================================
            // R7.0.6 - CRITICAL FIX: Lắng nghe "location-completed" → refresh cards
            // ========================================================================
            document.addEventListener('location-completed', (e) => {
                const { item, success } = e.detail;
                if (!success || !item) return;
                
                console.log('[UIRenderer] Location changed, refreshing badges for:', item.MoldID || item.CutterID);
                
                // Re-render toàn bộ cards → cập nhật location badge
                this.renderResults(this.state.allResults);
            });

            // ========================================================================
            // R7.0.7: Mobile selection mode toggle (header checkbox)
            // - HTML: <input type="checkbox" id="selection-mode-toggle">
            // - Dùng làm công tắc chính cho chế độ chọn/in trên cả Card & Table
            // ========================================================================
            const selectionModeToggle = document.getElementById('selection-mode-toggle');
            if (selectionModeToggle) {
                // Đảm bảo SelectionState tồn tại (nhưng không ghi đè trạng thái cũ)
                if (!window.SelectionState) {
                    window.SelectionState = { active: false, items: [] };
                    // SelectionManager sẽ quản lý thực tế
                }
                
                // Đồng bộ UI ban đầu từ state (nếu module khác đã set active)
                selectionModeToggle.checked = !!window.SelectionState.active;
                
                // Khi user bật/tắt checkbox "Chọn"
                selectionModeToggle.addEventListener('change', function() {
                    const enabled = !!selectionModeToggle.checked;
                    
                    if (!window.SelectionState) {
                        window.SelectionState = { active: false, items: [] };
                    }
                    window.SelectionState.active = enabled;
                    
                    // Khi tắt chế độ chọn → xoá toàn bộ lựa chọn (tránh nhầm lẫn)
                    if (!enabled) {
                        if (window.SelectionManager && typeof window.SelectionManager.clear === 'function') {
                            window.SelectionManager.clear();
                        }
                    }
                    
                    // Thông báo cho MobileTableView, card view, v.v.
                    document.dispatchEvent(new CustomEvent('selection:modeChanged', { detail: { enabled } }));
                    console.log('[UIRenderer] Selection mode toggled:', enabled ? 'ON' : 'OFF');
                });
            }
            
            // Nếu có module khác thay đổi mode, đồng bộ lại trạng thái checkbox + bật/tắt class cho container card + re-render để hiển thị icon
            document.addEventListener('selection:modeChanged', function(e) {
                const enabled = e.detail?.enabled !== false;  // ✅ Sửa logic: chỉ false khi enabled = false rõ ràng
                
                // Đồng bộ trạng thái toggle
                if (selectionModeToggle && selectionModeToggle.checked !== enabled) {
                    selectionModeToggle.checked = enabled;
                }

                
                // Bật/tắt class "inv-bulk-active" → CSS cho phép hiển thị checkbox
                const quickList = document.querySelector('#quick-results-list');
                if (quickList) {
                    quickList.classList.toggle('inv-bulk-active', enabled);
                }
                
                // Re-render card → checkboxIcon ".inv-bulk-checkbox" xuất hiện/ẩn đi
                if (window.UIRenderer && Array.isArray(UIRenderer.state?.allResults)) {
                    UIRenderer.renderQuickCards(UIRenderer.state.allResults);
                }
            });

            // ========================================================================
            // R7.1.2: Setup infinite scroll
            // ========================================================================
            this.setupInfiniteScroll();
            
            // ========================================================================
            // R7.1.2: Setup pull-to-refresh (chỉ mobile)
            // ========================================================================
            if (window.innerWidth <= 768) {
                this.setupPullToRefresh();
            }
            
            // R7.1.2-FIX: Clear selection state on page load to prevent pre-selected cards
            if (window.SelectionState) {
                window.SelectionState.active = false;
                window.SelectionState.items = [];
            }
            if (window.SelectionManager && typeof window.SelectionManager.clear === 'function') {
                window.SelectionManager.clear();
            }
            console.log('[UIRenderer] ✅ Selection state cleared on init');

            console.log('[UIRenderer] v7.1.2 loaded (Infinite Scroll + Pull-to-Refresh)');
        },

        // ========================================================================
        // renderResults: Main entry point
        // ========================================================================
        renderResults(items) {
            console.log('[UIRenderer] 📊 renderResults called with', items.length, 'items');
            
            // Lưu vào state
            this.state.allResults = items;
            
            // Reset rendered count khi có kết quả mới
            this.state.renderedCount = 0;
            
            // Render batch đầu tiên (50 items)
            this.renderQuickCards(items, false);
            
            // Render table (giữ nguyên)
            this.renderTable(items);
        },

        // ========================================================================
        // renderQuickCards: Render cards (batch infinite scroll)
        // ========================================================================
        renderQuickCards(items, append = false) {
            const wrap = getFirst(SELECTORS.quickListCandidates);
            if (!wrap) {
                console.error('[UIRenderer] Quick results container NOT FOUND');
                return;
            }
            
            // R7.1.2: Nếu không append → clear và reset count
            if (!append) {
                // Xoá flag delegation để setup lại sự kiện
                if (wrap.dataset.delegationSetup === 'true') {
                    delete wrap.dataset.delegationSetup;
                }
                wrap.textContent = '';
                this.state.renderedCount = 0;
            }
            
            // Tính toán items cần render
            const startIndex = append ? this.state.renderedCount : 0;
            const endIndex = startIndex + this.state.renderBatchSize;
            const itemsToRender = items.slice(startIndex, endIndex);
            
            console.log(`[UIRenderer] 📊 Rendering ${itemsToRender.length} cards (${startIndex}-${endIndex}/${items.length})`);
            
            if (itemsToRender.length === 0) {
                console.log('[UIRenderer] ✅ All items rendered');
                this.state.isLoadingMore = false;
                return;
            }
            
            const fragment = document.createDocumentFragment();
            
            itemsToRender.forEach((item, localIdx) => {
                const idx = startIndex + localIdx; // Index trong allResults
                const isMold = item.itemType === 'mold';
                
                let code, name, dim;
                if (isMold) {
                    code = esc(item.displayCode || item.MoldCode || '-');
                    name = esc(item.displayName || item.MoldName || '-');
                    dim = esc(item.displayDimensions || item.cutlineSize || 'N/A');
                } else {
                    code = esc(item.displayCode || item.CutterNo || item.CutterDesignCode || '-');
                    name = esc(item.displayName || item.CutterName || '-');
                    dim = esc(item.displayDimensions || item.cutlineSize || getCutterCardSize(item) || 'N/A');
                }
                
                const itemId = isMold ? String(item.MoldID || item.MoldCode) : String(item.CutterID || item.CutterNo);
                
                const el = document.createElement('div');
                el.className = 'result-card';
                el.classList.add(isMold ? 'card-mold' : 'card-cutter');
                el.setAttribute('data-index', String(idx));
                el.setAttribute('data-type', isMold ? 'mold' : 'cutter');
                el.setAttribute('data-id', itemId);
                
                if (isMold && item.MoldCode) {
                    el.setAttribute('data-mold-code', String(item.MoldCode));
                }
                
                // ====================================================================
                // Status badges (giữ nguyên logic cũ)
                // ====================================================================
                const lastAuditDate = window.InventoryManager?.getLastAuditDate(itemId, item.itemType);
                //const isAuditedToday = window.InventoryManager?.isAuditedToday(itemId, item.itemType) || false;

                // R7.1.2-FIX: Verify actual date to prevent false "audited-today" (e.g. KOS027 issue)
                //let isReallyToday = false;
                //if (isAuditedToday && lastAuditDate) {
                //    try {
                //        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
                //        const auditDateStr = new Date(lastAuditDate).toISOString().split('T')[0];
                //        isReallyToday = (auditDateStr === today);
                //    } catch (e) {
                //        isReallyToday = false;
                //    }
                //}

                const statusLogs = window.DataManager?.data?.statuslogs || [];
                const itemLogs = statusLogs.filter(log => String(log.MoldID).trim() === String(itemId).trim());
                
                // Lấy ngày hôm nay
                const today = new Date().toISOString().split('T')[0]; // "2025-12-15"

                let statusBadgeClass = 'no-history';
                let statusBadgeText = '-';

                if (itemLogs.length > 0) {
                    itemLogs.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
                    const latestLog = itemLogs[0];
                    const status = (latestLog.Status || '').toUpperCase();
                    
                    // ✅ LẤY NGÀY TỪ LOG (QUAN TRỌNG!)
                    const logDate = latestLog.Timestamp ? latestLog.Timestamp.split('T')[0] : null;
                    const isToday = logDate === today;
                    
                    // ✅ DEBUG LOG (TẠM THỜI)
                    if (status === 'AUDIT' || status.includes('AUDIT')) {
                        console.log(`[DEBUG] MoldID ${itemId}: 
                        - Timestamp: "${latestLog.Timestamp}"
                        - logDate: "${logDate}"
                        - today: "${today}"
                        - isToday: ${isToday}
                        `);
                    }
                    
                    if (status === 'IN' || status === 'CHECKIN' || status.includes('IN')) {
                        statusBadgeClass = isToday ? 'checkin-in checkin-audit-today' : 'checkin-in';
                        statusBadgeText = 'IN';
                    } else if (status === 'OUT' || status === 'CHECKOUT' || status.includes('OUT')) {
                        statusBadgeClass = 'checkin-out';
                        statusBadgeText = 'OUT';
                    } else if (status === 'AUDIT' || status.includes('AUDIT')) {
                        // ✅ ĐẶT CLASS ĐÚNG
                        statusBadgeClass = isToday 
                            ? 'checkin-audit checkin-audit-today'  // XANH nếu hôm nay
                            : 'checkin-audit';  // CAM nếu không phải hôm nay
                        statusBadgeText = '確認済';
                        
                        // ✅ DEBUG LOG KẾT QUẢ
                        console.log(`[DEBUG] MoldID ${itemId}: statusBadgeClass="${statusBadgeClass}"`);
                    }
                }


                
                // R7.1.2-FIX: Only add "audited-today" if date matches today
                //if (isReallyToday) {
                //    el.classList.add('audited-today');
                //}
                
                // ====================================================================
                // Selection mode
                // ====================================================================
                const isBulkMode = !!window.InventoryState?.bulkMode;
                const isSelectionMode = !!window.SelectionState?.active;
                const isSelected = window.SelectionManager?.isSelected
                    ? SelectionManager.isSelected(itemId, item.itemType)
                    : (window.InventoryState?.selectedItems?.some(sel => sel.id === itemId && sel.type === item.itemType) || false);
                
                const showCheckbox = isBulkMode || isSelectionMode;
                let checkboxIcon = '';
                if (showCheckbox) {
                    const checkedClass = isSelected ? 'checked' : '';
                    checkboxIcon = `<span class="inv-bulk-checkbox ${checkedClass}"></span>`;
                }
                if (showCheckbox && isSelected) {
                    el.classList.add('inv-bulk-selected', 'inv-selected');
                }
                
                // ====================================================================
                // Rack-Layer badges
                // ====================================================================
                const rackId = item.rackInfo?.RackID || item.rackLayerInfo?.RackID || '-';
                const layerNum = item.rackLayerInfo?.RackLayerNumber || '-';
                const rackDisplay = `${rackId}-${layerNum}`;
                
                // Date display
                let displayDate = null;
                if (itemLogs.length > 0) displayDate = itemLogs[0].Timestamp;
                if (!displayDate) displayDate = lastAuditDate;
                if (!displayDate) displayDate = item.CheckInDate || item.LastCheckin;
                const formattedDate = displayDate ? formatDateDots(displayDate) : '-';
                
                const auditBadge = `<span class="checkin-status-badge ${statusBadgeClass}"><span class="badge-text">${statusBadgeText}</span> <span class="sync-icon synced" title="Đã đồng bộ">✓</span></span>`;
                
                // Render 3 lines
                el.innerHTML = `
                    <div class="card-line-1">
                        <span class="card-id">${item.MoldID || item.CutterID || '-'}</span>
                        <span class="card-code">${code}</span>
                        ${checkboxIcon}
                    </div>
                    <div class="card-line-2">
                        <span class="card-dim">${dim}</span>
                        ${auditBadge}
                    </div>
                    <div class="card-line-3">
                        <span class="card-location">${rackDisplay}</span>
                        <span class="card-date">${formattedDate}</span>
                    </div>
                `;
                
                fragment.appendChild(el);
            });
            
            wrap.appendChild(fragment);
            
            // Cập nhật rendered count
            this.state.renderedCount = endIndex;
            this.state.isLoadingMore = false;
            
            // R7.1.2-FIX: Sync highlights with strict (type, id) matching
            if (window.SelectionManager && typeof window.SelectionManager.updateDomHighlights === 'function') {
                // Override updateDomHighlights to use strict selector
                const originalUpdate = window.SelectionManager.updateDomHighlights.bind(window.SelectionManager);
                window.SelectionManager.updateDomHighlights = function() {
                    if (!window.SelectionState || !window.SelectionState.items) return;
                    
                    // Remove all highlights first
                    document.querySelectorAll('.result-card').forEach(card => {
                        card.classList.remove('inv-bulk-selected', 'inv-selected');
                        const checkbox = card.querySelector('.inv-bulk-checkbox');
                        if (checkbox) checkbox.classList.remove('checked');
                    });
                    
                    // Add highlights only to exact matches (type + id)
                    window.SelectionState.items.forEach(({ id, type }) => {
                        const selector = `.result-card[data-type="${type}"][data-id="${id}"]`;
                        const card = document.querySelector(selector);
                        if (card) {
                            card.classList.add('inv-bulk-selected', 'inv-selected');
                            const checkbox = card.querySelector('.inv-bulk-checkbox');
                            if (checkbox) checkbox.classList.add('checked');
                        }
                    });
                    
                    console.log('[UIRenderer] ✅ DOM highlights updated (strict matching)');
                };
                
                window.SelectionManager.updateDomHighlights();
            }

            
            // Setup event delegation chỉ 1 lần
            if (!append) {
                this.setupCardEvents(wrap);
            }
            
            // Update badge count
            const badge = document.querySelector('#quick-count');
            if (badge) badge.textContent = String(items.length);
            
            console.log(`[UIRenderer] ✅ Rendered ${this.state.renderedCount}/${items.length} cards`);
        },


        // ========================================================================
        // R7.1.2: Setup infinite scroll
        // Tự động load thêm 50 items khi scroll đến cuối
        // ========================================================================
        setupInfiniteScroll() {
            const wrap = getFirst(SELECTORS.quickListCandidates);
            if (!wrap) return;
            
            // Nếu đã setup rồi thì skip
            if (wrap.dataset.infiniteScrollSetup === 'true') return;
            
            const scrollHandler = throttle(() => {
                // Kiểm tra nếu đang load hoặc hết items
                if (this.state.isLoadingMore) return;
                if (this.state.renderedCount >= this.state.allResults.length) return;
                
                // Tính khoảng cách từ scroll position đến cuối container
                const scrollTop = wrap.scrollTop;
                const scrollHeight = wrap.scrollHeight;
                const clientHeight = wrap.clientHeight;
                const distanceToBottom = scrollHeight - scrollTop - clientHeight;
                
                // Nếu còn < 200px nữa là đến cuối → load thêm
                if (distanceToBottom < 200) {
                    console.log('[UIRenderer] Loading more items...');
                    this.state.isLoadingMore = true;
                    
                    // Render thêm 50 items tiếp theo (append = true)
                    this.renderQuickCards(this.state.allResults, true);
                }
            }, 200); // Throttle 200ms
            
            wrap.addEventListener('scroll', scrollHandler);
            wrap.dataset.infiniteScrollSetup = 'true';
            console.log('[UIRenderer] ✅ Infinite scroll setup complete');
        },

        // ========================================================================
        // R7.1.2: Setup pull-to-refresh gesture
        // Vuốt xuống ở đầu danh sách → focus + clear search box
        // ========================================================================
        setupPullToRefresh() {
            const wrap = getFirst(SELECTORS.quickListCandidates);
            const searchInput = document.querySelector('#search-input, #global-search-input, input[type="search"]');
            
            if (!wrap || !searchInput) {
                console.warn('[UIRenderer] Pull-to-refresh: missing container or search input');
                return;
            }
            
            let startY = 0;
            let currentY = 0;
            let isPulling = false;
            
            wrap.addEventListener('touchstart', (e) => {
                // Chỉ kích hoạt khi scroll ở đầu danh sách
                if (wrap.scrollTop === 0) {
                    startY = e.touches[0].clientY;
                    isPulling = true;
                }
            }, { passive: true });
            
            wrap.addEventListener('touchmove', (e) => {
                if (!isPulling) return;
                
                currentY = e.touches[0].clientY;
                const pullDistance = currentY - startY;
                
                // Nếu kéo xuống > 80px → hiện indicator
                if (pullDistance > 80) {
                    wrap.style.transform = `translateY(${Math.min(pullDistance - 80, 50)}px)`;
                    wrap.style.opacity = '0.7';
                }
            }, { passive: true });
            
            wrap.addEventListener('touchend', () => {
                if (!isPulling) return;
                
                const pullDistance = currentY - startY;
                
                // Reset visual
                wrap.style.transform = '';
                wrap.style.opacity = '';
                
                // Nếu kéo xa đủ thì trigger refresh
                if (pullDistance > 100) {
                    console.log('[UIRenderer] Pull-to-refresh triggered');
                    
                    // Đưa danh sách về top
                    try {
                        wrap.scrollTop = 0;
                    } catch (e) {
                        // Ignore
                    }
                    
                    // Clear search → bắn lại event → chạy search rỗng
                    searchInput.value = '';
                    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    // Thêm hiệu ứng highlight ở ô nhập (đảm user biết đã thực hiện thành công)
                    // Không gọi focus() ở đây để tránh iOS mở bàn phím.
                    searchInput.classList.add('pull-refresh-highlight');
                    setTimeout(() => {
                        searchInput.classList.remove('pull-refresh-highlight');
                    }, 600);
                }
                
                isPulling = false;
                startY = 0;
                currentY = 0;
            });
            
            console.log('[UIRenderer] ✅ Pull-to-refresh setup complete');
        },

        // ========================================================================
        // R7.1.2-FIXED: Setup card click events (delegation)
        // Gộp tất cả logic click vào 1 handler duy nhất
        // ========================================================================
        setupCardEvents(wrap) {
            if (!wrap) return;
            if (wrap.dataset.eventsSetup === 'true') return;
            
            // **CAPTURE-PHASE** để chặn các handler khác khi đang chọn (選択モード)
            wrap.addEventListener('click', (e) => {
                const isSelectionMode = !!window.SelectionState?.active;
                
                // Nếu đang ở選択モード: ưu tiên toggle selection và chặn các handler mở detail
                if (isSelectionMode) {
                    const card = e.target.closest('.result-card[data-id][data-type]');
                    if (!card) return;
                    
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const itemId = card.getAttribute('data-id');
                    const itemType = (card.getAttribute('data-type') || 'mold').toLowerCase();

                    // R7.1.2-FIX: Debug log to verify correct itemId/type
                    console.log('[UIRenderer] Toggle selection:', { itemId, itemType, cardElement: card });

                    // Toggle SelectionManager (single source of truth)
                    if (window.SelectionManager && typeof window.SelectionManager.toggleItem === 'function') {

                        // Lấy itemData nếu cần (không bắt buộc)
                        const index = parseInt(card.getAttribute('data-index'), 10);
                        const itemData = (!isNaN(index) && this.state?.allResults?.[index]) ? this.state.allResults[index] : null;
                        
                        window.SelectionManager.toggleItem(itemId, itemType, itemData);
                    }
                    return;
                }
                
                // Không phải選択モード: vẫn giữ logic cũ (mở modal/detail)
                const card = e.target.closest('.result-card[data-id][data-type]');
                if (!card) return;
                
                // Mobile: mở MobileDetailModal
                if (window.innerWidth <= 1024 && window.MobileDetailModal) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    const itemType = (card.getAttribute('data-type') || 'mold').toLowerCase();
                    const index = parseInt(card.getAttribute('data-index'), 10);
                    const item = (!isNaN(index) && this.state?.allResults?.[index]) ? this.state.allResults[index] : null;
                    if (item && typeof window.MobileDetailModal.show === 'function') {
                        window.MobileDetailModal.show(item, itemType);
                    }
                    return;
                }
                
                // Desktop: dispatch detailchanged như cũ
                const itemType = (card.getAttribute('data-type') || 'mold').toLowerCase();
                const itemId = card.getAttribute('data-id');
                const index = parseInt(card.getAttribute('data-index'), 10);
                const item = (!isNaN(index) && this.state?.allResults?.[index]) ? this.state.allResults[index] : null;
                
                if (item) {
                    document.dispatchEvent(new CustomEvent('detail:changed', {
                        detail: { item, itemType, itemId, source: 'card-click' }
                    }));
                }
            }, true); // <-- capture = true (quan trọng)
            
            wrap.dataset.eventsSetup = 'true';
            console.log('[UIRenderer] ✅ Card events setup complete (capture-phase)');
        },
        // ========================================================================
        // renderTable: Render table view
        // ========================================================================
        renderTable(items) {
            return measurePerf('renderTable', () => {
                const tbody = getFirst(SELECTORS.tableBodyCandidates);
                if (!tbody) {
                    console.warn('[UIRenderer] ⚠ Table body not found');
                    return;
                }
                
                tbody.innerHTML = '';
                
                // Giới hạn render 200 rows cho 1 màn hình scroll
                const RENDER_LIMIT = 200;
                const itemsToRender = items.slice(0, RENDER_LIMIT);
                
                // Batch render với DocumentFragment
                const fragment = document.createDocumentFragment();
                
                itemsToRender.forEach((item, idx) => {
                    const isMold = item.itemType === 'mold';
                    const tr = document.createElement('tr');
                    tr.setAttribute('data-index', String(idx));
                    
                    tr.innerHTML = `
                        <td>${esc(isMold ? item.MoldID : item.CutterID)}</td>
                        <td>${esc(item.displayCode || '-')}</td>
                        <td>${esc(item.displayName || '-')}</td>
                        <td>${esc(item.displayDimensions || '-')}</td>
                        <td>${esc(item.displayLocation || '-')}</td>
                        <td>${esc(item.currentStatus?.text || '-')}</td>
                        <td><button class="btn-view">View</button></td>
                    `;
                    
                    fragment.appendChild(tr);
                });
                
                tbody.appendChild(fragment);
                
                // Hiển thị thông báo nếu bị cắt
                if (items.length > RENDER_LIMIT) {
                    console.warn(`[UIRenderer] Table limited to ${RENDER_LIMIT}/${items.length} items for performance`);
                }
            });
        },

        // ========================================================================
        // renderDetailInfo: Hiển thị chi tiết item
        // ========================================================================
        renderDetailInfo(item) {
            if (!item) return;
            
            this.state.currentDetailItem = item;
            const isMold = item.itemType === 'mold';
            this.state.selectedItemId = isMold ? String(item.MoldID || item.MoldCode) : String(item.CutterID || item.CutterNo);
            
            this.updateDetailPanel(item);
            this.updateCheckInOutStatus(item);
            
            document.dispatchEvent(
                new CustomEvent('detail:changed', {
                    detail: {
                        item,
                        itemType: isMold ? 'mold' : 'cutter',
                        itemId: this.state.selectedItemId,
                        source: 'ui-renderer'
                    }
                })
            );
            
            console.log('[UIRenderer] renderDetailInfo for', item.displayCode || 'unknown');
        },

        // ========================================================================
        // GIỐNG R6.3 - KHÔNG THAY ĐỔI
        // ========================================================================
        updateDetailPanel(item) {
            if (!item) return;
            
            const isMold = item.itemType === 'mold';
            
            // ====================================================================
            // Company badge
            // ====================================================================
            const compEl = document.querySelector('#detail-company-storage');
            if (compEl) {
                let comp = '-';
                if (isMold) {
                    comp = item.storageCompanyInfo?.CompanyShortName || item.CompanyShortName || item.CompanyName || '-';
                } else {
                    comp = item.CompanyShortName || item.CompanyName || '-';
                }
                compEl.textContent = comp;
                
                if (comp !== '-') {
                    const isYSD = comp.toUpperCase().includes('YSD');
                    compEl.classList.remove('company-ysd', 'company-other');
                    compEl.className = 'detail-company-badge ' + (isYSD ? 'company-ysd' : 'company-other');
                    console.log('[UIRenderer] Company badge:', comp, '-', isYSD ? 'YSD (blue)' : 'Other (orange)');
                } else {
                    compEl.classList.remove('company-ysd', 'company-other');
                    compEl.className = 'detail-company-badge company-neutral';
                    console.warn('[UIRenderer] No company data for item:', item.MoldCode || item.CutterNo);
                }
            }
            
            // ====================================================================
            // FIX: Hiển thị đúng RackID và RackLayerNumber
            // ====================================================================
            const rackLayerInfo = item.rackLayerInfo;
            const rackInfo = item.rackInfo;
            
            // Badge "Giá" - Lấy từ rackInfo trước, fallback rackLayerInfo
            const rackId = rackInfo?.RackID || rackLayerInfo?.RackID || '-';
            const rackEl = document.getElementById('detail-rack-id');
            if (rackEl) rackEl.textContent = rackId;
            
            // Badge "Tầng" - Lấy từ rackLayerInfo
            const layerNum = rackLayerInfo?.RackLayerNumber || '-';
            const layerEl = document.getElementById('detail-layer-num');
            if (layerEl) layerEl.textContent = layerNum;
            
            // Rack Location
            setText(SELECTORS.detailRackLocation, item.displayRackLocation || rackInfo?.RackLocation || '-');
            
            console.log('[UIRenderer] Rack-Layer display:', rackInfo?.RackID || '-', '/', rackLayerInfo?.RackLayerNumber || '-', 'RackLayerID:', rackLayerInfo?.RackLayerID);
            
            // ====================================================================
            // Common fields
            // ====================================================================
            setText(SELECTORS.detailCodeName, item.displayCode || '-');
            setText(SELECTORS.detailName, item.displayName || '-');
            setText(SELECTORS.detailDimensions, item.displayDimensions || '-');
            
            // Cutter specific
            setText(SELECTORS.detailCutline, item.cutlineSize || '-');
            setText(SELECTORS.detailPlastic, item.plasticType || '-');
            setText(SELECTORS.detailDate, item.displayDate || '-');
            
            // Notes & Processing
            setText(SELECTORS.detailNotes, item.MoldNotes || item.CutterNotes || '-');
            const processingStatus = item.MoldReturning || item.MoldDisposing || item.CutterReturning || item.CutterDisposing || '-';
            setText(SELECTORS.detailProcessing, processingStatus);
            setText(SELECTORS.detailTray, item.designInfo?.TrayInfoForMoldDesign || '-');
            
            // Teflon badge
            const teflonEl = document.querySelector(SELECTORS.detailTeflon);
            if (teflonEl) {
                const tf = item.TeflonCoating || '-';
                teflonEl.textContent = tf;
                teflonEl.className = 'detail-teflon ' + (tf !== '-' ? 'has-teflon' : 'no-teflon');
            }
            
            this.updateCheckInOutStatus(item);
            console.log('[UIRenderer] Updated detail panel for', item.displayCode || item.MoldCode || item.CutterNo);
        },

        // ========================================================================
        // updateCheckInOutStatus: Cập nhật badge IN/OUT/AUDIT
        // ========================================================================
        updateCheckInOutStatus(item) {
            if (!item) return;
            
            const statusLogs = window.DataManager?.data?.statuslogs;
            if (!statusLogs || statusLogs.length === 0) {
                // ⚠️ statusLogs chưa load xong
                console.warn('[UIRenderer] statuslogs not loaded yet, retrying...');
                setTimeout(() => this.updateCheckInOutStatus(item), 200);
                return;
            }
            
            try {
                const itemId = item.MoldID || item.MoldCode || item.CutterID || item.CutterNo || null;
                if (!itemId) return;
                
                // Filter logs cho item này
                const itemLogs = statusLogs.filter(log => {
                    const logMoldId = String(log.MoldID || '').trim();
                    const compareId = String(itemId).trim();
                    return logMoldId === compareId;
                });
                
                const statusBadge = document.querySelector('#detail-checkin-status');
                if (!statusBadge) {
                    console.warn('#detail-checkin-status not found');
                    return;
                }
                
                if (itemLogs.length === 0) {
                    console.log('[UIRenderer] No status logs for:', itemId);
                    statusBadge.classList.remove('status-in', 'status-out', 'badge-pending');
                    statusBadge.classList.add('no-history');
                    statusBadge.innerHTML = `<div class="badge-text-main">-</div>`;
                    statusBadge.title = 'Chưa có lịch sử nhập xuất';
                    console.log('[UIRenderer] Badge set to no-history state with JP/VN text');
                    return;
                }
                
                // Sắp xếp logs theo thời gian mới nhất lên đầu
                itemLogs.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
                const latestLog = itemLogs[0];
                const status = (latestLog.Status || '').toLowerCase();
                const isPending = latestLog.pending === true;
                
                console.log('[UIRenderer] Latest log:', status, isPending, 'timestamp:', latestLog.Timestamp);
                
                statusBadge.classList.remove('status-in', 'status-out', 'badge-pending', 'no-history');
                
                let badgeHTML = '<span class="badge-text">';
                let syncIcon = '';
                
                if (status.includes('in')) {
                    badgeHTML += 'IN';
                    statusBadge.classList.add('status-in');
                } else if (status.includes('out')) {
                    badgeHTML += 'OUT';
                    statusBadge.classList.add('status-out');
                } else {
                    badgeHTML += '-';
                }
                badgeHTML += '</span>';
                
                if (isPending) {
                    syncIcon = '<span class="sync-icon pending" title="Đang đồng bộ...">⟳</span>';
                    statusBadge.classList.add('badge-pending');
                } else {
                    syncIcon = '<span class="sync-icon synced" title="Đã đồng bộ">✓</span>';
                }
                
                statusBadge.innerHTML = badgeHTML + syncIcon;
                console.log('[UIRenderer] Badge updated:', status, isPending ? 'pending' : 'synced');
            } catch (err) {
                console.error('[UIRenderer] Error updating status:', err);
            }
        },

        // ========================================================================
        // HÀM MỚI #1: UPDATE LOCATION BADGE
        // ========================================================================
        updateLocationBadge(item) {
            console.log('[UIRenderer] updateLocationBadge called');
            const rackIdEl = document.getElementById('detail-rack-id');
            const layerNumEl = document.getElementById('detail-layer-num');
            
            if (!rackIdEl || !layerNumEl) {
                console.warn('[UIRenderer] Rack/Layer elements not found');
                return;
            }
            
            // Lấy locationlog → check trạng thái sync
            const locationLogs = window.DataManager?.data?.locationlog || [];
            
            // Tìm log mới nhất cho item này
            const latestLog = locationLogs.find(l => {
                if (item.MoldID) {
                    return String(l.MoldID) === String(item.MoldID);
                } else if (item.CutterID) {
                    return String(l.CutterID) === String(item.CutterID);
                }
                return false;
            });
            
            // Xác định trạng thái sync
            const isPending = latestLog?.pending === true;
            const hasError = latestLog?.syncError;
            
            let syncClass = 'sync-icon synced';
            let syncIcon = '✓';
            let syncTitle = 'Đã đồng bộ';
            
            if (hasError) {
                syncClass = 'sync-icon error';
                syncIcon = '!';
                syncTitle = 'Lỗi: ' + latestLog.syncError;
            } else if (isPending) {
                syncClass = 'sync-icon pending';
                syncIcon = '⟳';
                syncTitle = 'Đang chờ đồng bộ...';
            }
            
            // Lấy thông tin Giá-Tầng từ item
            const rackLayerID = item.currentRackLayer || item.RackLayerID;
            const rackLayer = window.DataManager?.data?.racklayers?.find(r => String(r.RackLayerID) === String(rackLayerID));
            const rack = window.DataManager?.data?.racks?.find(r => String(r.RackID) === String(rackLayer?.RackID));
            
            const rackDisplay = rack?.RackID || rack?.RackNumber || 'Giá ?';
            const layerDisplay = rackLayer?.RackLayerNumber || '?';
            
            // UPDATE HTML: Thêm sync icon vào các badge hiện tại
            rackIdEl.innerHTML = rackDisplay;
            layerNumEl.innerHTML = `${layerDisplay} <span class="${syncClass}" title="${syncTitle}" style="font-size: 10px; margin-left: 4px;">${syncIcon}</span>`;
            
            console.log('[UIRenderer] Location badge updated:', rackLayerID, 'display:', rackDisplay, '-', layerDisplay, 'syncStatus:', isPending ? 'pending' : hasError ? 'error' : 'synced');
        },

        // ========================================================================
        // R6.9.10: UPDATE CHECK-IN/OUT/AUDIT STATUS BADGE
        // Xử lý 3 trạng thái: check-in (xanh), check-out (đỏ), AUDIT (xanh)
        // Fix: Dùng đúng class CSS: checkin-in / checkin-out / checkin-audit
        // ========================================================================
        updateCheckInBadge(item) {
            if (!item) {
                console.warn('[UIRenderer] updateCheckInBadge: item is null');
                return;
            }
            
            const statusLogs = window.DataManager?.data?.statuslogs;
            if (!statusLogs || statusLogs.length === 0) {
                console.warn('[UIRenderer] statuslogs not loaded yet, retrying...');
                setTimeout(() => this.updateCheckInBadge(item), 200);
                return;
            }
            
            try {
                const itemId = item.MoldID || item.MoldCode || item.CutterID || item.CutterNo || null;
                if (!itemId) {
                    console.warn('[UIRenderer] Item has no valid ID');
                    return;
                }
                
                // Filter logs cho item này
                const itemLogs = statusLogs.filter(log => {
                    const logMoldId = String(log.MoldID || '').trim();
                    const compareId = String(itemId).trim();
                    return logMoldId === compareId;
                });
                
                const statusBadge = document.querySelector('#detail-checkin-status');
                if (!statusBadge) {
                    console.warn('[UIRenderer] #detail-checkin-status not found');
                    return;
                }
                
                // CRITICAL: Remove ALL old classes first
                statusBadge.classList.remove(
                    'checkin-in',
                    'checkin-out',
                    'checkin-audit',
                    'badge-pending',
                    'no-history'
                );
                
                // Trường hợp 1: Không có lịch sử
                if (itemLogs.length === 0) {
                    console.log('[UIRenderer] No status logs for:', itemId);
                    statusBadge.classList.add('no-history');
                    statusBadge.textContent = '-';
                    statusBadge.title = 'Chưa có lịch sử nhập xuất';
                    return;
                }
                
                // Sắp xếp logs theo thời gian mới nhất lên đầu
                itemLogs.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
                const latestLog = itemLogs[0];
                const status = (latestLog.Status || '').trim().toLowerCase();
                const isPending = latestLog.pending === true;
                
                console.log('[UIRenderer] Latest log:', status, isPending, 'timestamp:', latestLog.Timestamp);
                
                let badgeHTML = '<span class="badge-text">';
                let syncIcon = '';
                
                // R6.9.10: Xử lý 3 trạng thái
                if (status === 'check-in' || status.includes('in')) {
                    badgeHTML += 'IN';
                    statusBadge.classList.add('checkin-in'); // XANH LÁ
                } else if (status === 'check-out' || status.includes('out')) {
                    badgeHTML += 'OUT';
                    statusBadge.classList.add('checkin-out'); // ĐỎ
                } else if (status === 'audit' || status.toUpperCase() === 'AUDIT') {
                    badgeHTML += '確認済';
                    statusBadge.classList.add('checkin-audit'); // XANH LÁ GIỐNG IN
                    // ✅ THÊM MỚI: Check hôm nay
                    const logDate = latestLog.Timestamp ? latestLog.Timestamp.split('T')[0] : null;
                    const today = new Date().toISOString().split('T')[0];
                    if (logDate === today) {
                        statusBadge.classList.add('checkin-audit-today');
                        console.log('[UIRenderer] ✅ Badge TODAY added for detail panel');
                    }
                } else {
                    badgeHTML += '-';
                    statusBadge.classList.add('no-history');
                }
                badgeHTML += '</span>';
                
                // Sync icon (pending / synced)
                if (isPending) {
                    syncIcon = '<span class="sync-icon pending" title="Đang đồng bộ...">⟳</span>';
                    statusBadge.classList.add('badge-pending');
                } else {
                    syncIcon = '<span class="sync-icon synced" title="Đã đồng bộ">✓</span>';
                }
                
                statusBadge.innerHTML = badgeHTML + syncIcon;
                console.log('[UIRenderer] Badge updated:', status, isPending ? 'pending' : 'synced');
            } catch (err) {
                console.error('[UIRenderer] Error updating status:', err);
            }
        },

        // ========================================================================
        // clearDetail
        // ========================================================================
        clearDetail() {
            this.state.currentDetailItem = null;
            this.state.selectedItemId = null;
            
            Object.keys(SELECTORS).forEach(key => {
                const sel = SELECTORS[key];
                if (typeof sel === 'string' && sel.startsWith('#detail-')) {
                    const el = document.querySelector(sel);
                    if (el) el.textContent = '-';
                }
            });
            
            console.log('[UIRenderer] Cleared detail panel');
        }
    };

    // ============================================================================
    // Helper functions
    // ============================================================================
    function getFirst(list) {
        for (const sel of list) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        return null;
    }

    function setText(sel, val) {
        const el = document.querySelector(sel);
        if (el) el.textContent = val || '-';
    }

    function esc(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Hàm cập nhật Header Detail Panel
    function updateDetailPanelHeader(itemData) {
        // MoldID cũ
        const moldIdSpan = document.getElementById('detail-item-code-span');
        if (moldIdSpan && itemData.id) {
            moldIdSpan.textContent = itemData.id;
        }
        
        // MoldCode MỚI
        const moldCodeSpan = document.getElementById('detail-moldcode-span');
        if (moldCodeSpan && itemData.code) {
            moldCodeSpan.textContent = itemData.code;
        }
        
        // Title
        const titleSpan = document.querySelector('.detail-title');
        if (titleSpan && itemData.title) {
            titleSpan.textContent = itemData.title;
        }
    }

    // ============================================================================
    // R7.1.0: Sort helpers dùng chung cho card & table
    // ============================================================================
    /**
     * Áp dụng cấu hình sort cho danh sách kết quả.
     * @param {Array} items 
     * @param {{field: string, direction: 'asc'|'desc'}} sortConfig 
     */
    UIRenderer.applySortConfig = function(items, sortConfig) {
        const field = sortConfig?.field || 'productionDate';
        const direction = sortConfig?.direction === 'asc' ? 'asc' : 'desc';
        
        const list = Array.isArray(items) ? items.slice(0) : [];
        
        const compare = (a, b) => {
            switch (field) {
                case 'code':
                    const aCode = String(a.displayCode || a.MoldCode || a.CutterNo || '').trim();
                    const bCode = String(b.displayCode || b.MoldCode || b.CutterNo || '').trim();
                    return aCode.localeCompare(bCode, 'ja');
                    
                case 'name':
                    const aName = String(a.displayName || a.MoldName || a.CutterName || '').trim();
                    const bName = String(b.displayName || b.MoldName || b.CutterName || '').trim();
                    return aName.localeCompare(bName, 'ja');
                    
                case 'size':
                    const aSize = String(a.displayDimensions || a.cutlineSize || '').trim();
                    const bSize = String(b.displayDimensions || b.cutlineSize || '').trim();
                    return aSize.localeCompare(bSize, 'ja');
                    
                case 'location':
                    const rackA = parseInt(a.rackInfo?.RackID ?? a.rackLayerInfo?.RackID ?? 999, 10);
                    const rackB = parseInt(b.rackInfo?.RackID ?? b.rackLayerInfo?.RackID ?? 999, 10);
                    if (rackA !== rackB) return rackA - rackB;
                    
                    const layerA = parseInt(a.rackLayerInfo?.RackLayerNumber ?? 999, 10);
                    const layerB = parseInt(b.rackLayerInfo?.RackLayerNumber ?? 999, 10);
                    return layerA - layerB;
                    
                case 'company':
                    const aCompany = String(a.storageCompanyInfo?.CompanyShortName || a.storageCompanyInfo?.CompanyName || 'ZZZ');
                    const bCompany = String(b.storageCompanyInfo?.CompanyShortName || b.storageCompanyInfo?.CompanyName || 'ZZZ');
                    return aCompany.localeCompare(bCompany, 'ja');
                    
                case 'productionDate':
                case 'deliveryDate':
                default:
                    // Ưu tiên: DeliveryDeadline (jobs), sau đó ProductionDate, sau đó displayDate
                    const aDateRaw = a.jobInfo?.DeliveryDeadline || a.ProductionDate || a.displayDate || a.MoldDate || a.DateEntry;
                    const bDateRaw = b.jobInfo?.DeliveryDeadline || b.ProductionDate || b.displayDate || b.MoldDate || b.DateEntry;
                    
                    const baseOld = new Date('1900-01-01').getTime();
                    const numA = aDateRaw ? new Date(aDateRaw).getTime() - baseOld : 0;
                    const numB = bDateRaw ? new Date(bDateRaw).getTime() - baseOld : 0;
                    return numA - numB;
            }
        };
        
        list.sort(compare);
        if (direction === 'desc') list.reverse();
        return list;
    };

    // Gọi khi load detail
    updateDetailPanelHeader({
        id: 'TIH-014',
        code: 'TOK-004',
        title: 'Mold Title'
    });

    // ============================================================================
    // Export to global
    // ============================================================================
    window.UIRenderer = UIRenderer;

    // ============================================================================
    // Auto-init
    // ============================================================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => UIRenderer.init(), { once: true });
    } else {
        UIRenderer.init();
    }

    // ============================================================================
    // GIỐNG R6.3 - Tự cập nhật lại badge khi có sự kiện "status:updated"
    // ============================================================================
    document.addEventListener('status:updated', (e) => {
        const { id, status } = e.detail;
        const el = document.querySelector('#detail-status-badge');
        if (el) {
            el.textContent = status?.toUpperCase?.() || '-';
            el.className = 'status-badge ' + (status === 'in' ? 'status-in' : status === 'out' ? 'status-out' : 'status-unknown');
        }
    });

    // ============================================================================
    // Date formatter helper
    // ============================================================================
    window.formatDateShort = function(dateStr) {
        if (!dateStr) return '-';
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return '-';
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}${m}${day}`;
        } catch {
            return '-';
        }
    };

})();


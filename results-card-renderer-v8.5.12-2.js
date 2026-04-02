/* ============================================================================
   RESULTS CARD RENDERER v8.0.4-3
   Exact Copy from Mockup r8.1.0 Design

   Created: 2026-01-27

   Changes from v8.0.4-2:
   - Match exact mockup r8.1.0 card design
   - Dual button footer: 詳細/Xem chi tiết + 編作/Thao tác
   - Gradient background from type color to white
   - Improved data mapping and layout

============================================================================ */
console.log('✅ results-card-renderer-v8.5.4-1 LOADED');


class ResultsCardRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.items = [];
        this.selectedItems = new Set();
        this.itemsPerPage = 24;
        this.currentPage = 1;

        // Cache thumbnail theo thiết bị để không gọi Supabase quá nhiều
        this._thumbUrlCache = new Map();      // key: "mold|123" -> url (string hoặc "")
        this._thumbPromiseCache = new Map();  // key -> Promise đang chạy
        this._thumbHydrateTimer = null;

        // Callbacks
        this.onItemClick = null;
        this.onSelectionChange = null;

        this.init();
    }

    init() {
        // Card detail button - mở detail panel



        // Card action button - mở action menu/modal
        document.addEventListener('click', (e) => {
            const actionBtn = e.target.closest('.card-action-btn');
            if (actionBtn) {
                e.preventDefault();

                const itemId = (actionBtn.dataset.id || '').trim();
                const item = this.items.find(it => {
                const id = (it.type === 'mold') ? it.MoldID : it.CutterID;
                return String(id).trim() === String(itemId);
                });

                if (!item) return;

                this.openCardActionMenu(actionBtn, item, e);
            }
        }, true);

        // Chuột phải (contextmenu) vào thẻ -> Bật Action Menu giống nút Action
        document.addEventListener('contextmenu', (e) => {
            const card = e.target.closest('.result-card');
            if (card) {
                e.preventDefault(); // Chặn menu mặc định của trình duyệt

                const itemId = String(card.dataset.id || '').trim();
                const item = this.items.find(it => {
                    const id = (it.type === 'mold') ? it.MoldID : it.CutterID;
                    return String(id).trim() === itemId;
                });

                if (!item) return;

                // Mở popup menu tại vị trí trỏ chuột thay vì cố định neo ở card
                this.openCardActionMenu(card, item, e);
            }
        });


        // Zoom button handler (mở ảnh dạng popup trong trang, giống PhotoManager)
        document.addEventListener('click', async (e) => {
            const zoomBtn = e.target.closest('.image-zoom-btn') || e.target.closest('.card-thumbnail');
            if (!zoomBtn) return;

            e.preventDefault();
            e.stopPropagation();

            const itemId = String(zoomBtn.dataset.id || '').trim();
            if (!itemId) return;

            const item = this.items.find(it => {
                const id = it.type === 'mold' ? it.MoldID : it.CutterID;
                return String(id || '').trim() === itemId;
            });
            if (!item) return;

            const deviceType = item.type === 'mold' ? 'mold' : 'cutter';

            // Dùng đúng ID đang gắn trên card (khớp device_id khi hydrate thumb)
            const deviceId = itemId;

            const title = deviceType === 'mold'
                ? (item.MoldCode || item.MoldID || itemId)
                : (item.CutterNo || item.CutterID || itemId);

            console.log('[CardZoom] click', { deviceType, deviceId, title });

            try {
                if (!window.DevicePhotoStore) throw new Error('DevicePhotoStore chưa sẵn sàng');

                // Lấy ảnh để phóng to: ưu tiên thumbnail, fallback ảnh mới nhất
                let row = null;

                // Bước 1: thử lấy thumbnail (đúng với ảnh nhỏ đang hiển thị trên card)
                if (typeof window.DevicePhotoStore.getThumbnailForDevice === 'function') {
                    row = await window.DevicePhotoStore.getThumbnailForDevice(deviceType, String(deviceId));
                }

                // Bước 2: nếu không có thumbnail thì lấy ảnh active mới nhất
                if (!row || !String(row.public_url || row.publicurl || row.publicUrl || '').trim()) {
                    row = null;
                    if (typeof window.DevicePhotoStore.listForDevice === 'function') {
                        const rows = await window.DevicePhotoStore.listForDevice(deviceType, String(deviceId), {
                            state: 'active',
                            limit: 1
                        });
                        row = Array.isArray(rows) ? (rows[0] || null) : null;
                    } else if (typeof window.DevicePhotoStore.getPhotos === 'function') {
                        const r = await window.DevicePhotoStore.getPhotos({
                            deviceType: deviceType,
                            deviceId: String(deviceId),
                            includeTrash: false,
                            orderBy: 'created_at',
                            orderDir: 'desc',
                            limit: 1
                        });
                        const rows = r && Array.isArray(r.data) ? r.data : (Array.isArray(r) ? r : []);
                        row = rows[0] || null;
                    }
                }


                const fullUrl = row ? String(row.public_url || row.publicurl || row.publicUrl || '') : '';
                if (!fullUrl) {
                    alert('Thiết bị này chưa có ảnh (active) để phóng to');
                    return;
                }

                console.log('[CardZoom] open url:', fullUrl);

                // Dùng lightbox của PhotoManager (_openLightbox với gạch dưới)
                if (window.PhotoManager && typeof window.PhotoManager._openLightbox === 'function') {
                    // Đảm bảo DOM lightbox đã được tạo (mount nếu chưa có)
                    if (typeof window.PhotoManager._mount === 'function') {
                        window.PhotoManager._mount();
                    }

                    // Dựng 1 record giả để _renderLightboxSlide hiển thị đúng
                    const fakeRecord = Object.assign({}, row || {}, {
                        public_url:       fullUrl,
                        publicurl:        fullUrl,
                        originalfilename: title,
                        devicetype:       deviceType,
                        deviceid:         String(deviceId)
                    });

                    // Lưu lại danh sách _filtered hiện tại rồi ghi đè tạm 1 record
                    const savedFiltered = window.PhotoManager._filtered;
                    const savedLbIndex  = window.PhotoManager._lbIndex;
                    window.PhotoManager._filtered = [fakeRecord];
                    window.PhotoManager._lbIndex  = 0;
                    // Xóa ảnh cũ trước khi mở để tránh flash ảnh cũ
                    const lbImgEl = document.getElementById('pmLbImg');
                    if (lbImgEl) { lbImgEl.removeAttribute('src'); lbImgEl.style.opacity = '0'; }

                    // Mở lightbox
                    window.PhotoManager._openLightbox(0);

                    // Sau khi đóng lightbox thì trả lại _filtered/_lbIndex cũ
                    const lb = document.getElementById('pmLightbox');
                    if (lbImgEl) { lbImgEl.onload = () => { lbImgEl.style.opacity = '1'; }; lbImgEl.onerror = () => { lbImgEl.style.opacity = '1'; }; }
                    if (lb) {
                        const restore = () => {
                            window.PhotoManager._filtered = savedFiltered;
                            window.PhotoManager._lbIndex  = savedLbIndex;
                            window.PhotoManager._savedFilteredForZoom = undefined;
                            window.PhotoManager._savedLbIndexForZoom  = undefined;

                            lb.removeEventListener('click', onLbClick);
                            document.removeEventListener('keydown', onEsc);
                        };
                        const pmCloseBtn = document.getElementById('pmLbClose');
                        if (pmCloseBtn) pmCloseBtn.addEventListener('click', restore, { once: true });
                        const onLbClick = (ev) => {
                            const body = lb.querySelector('.pm-lb-body');
                            if (body && !body.contains(ev.target)) restore();
                        };
                        const onEsc = (ev) => { if (ev.key === 'Escape') restore(); };
                        lb.addEventListener('click', onLbClick);
                        document.addEventListener('keydown', onEsc);
                    }
                    return;
                }

                // Fallback tuyệt đối nếu không có PhotoManager
                window.open(fullUrl, '_blank', 'noopener');

            } catch (err) {
                console.warn('[CardZoom] error:', err);
                alert('Không mở được ảnh. Vui lòng thử lại');
            }
        }, true);



        // Location link handler
        document.addEventListener('click', async (e) => {
            const locationLink = e.target.closest('.location-link');
            if (locationLink) {
                e.preventDefault();
                e.stopPropagation();
                
                const rackId = locationLink.dataset.rackId;
                const layerId = locationLink.dataset.layerId;
                
                // Get data
                const rack = window.DataManager?.data?.rack?.find(r => String(r.RackID) === String(rackId)) || {};
                const layer = window.DataManager?.data?.racklayers?.find(l => String(l.LayerID) === String(layerId)) || {};
                
                const rackNotes = rack.Notes || 'Không có ghi chú';
                const layerNotes = layer.Notes || 'Không có ghi chú';
                const rackName = rack.RackName || rackId;

                // Build Popup
                const popup = document.createElement('div');
                popup.style.position = 'fixed';
                popup.style.inset = '0';
                popup.style.background = 'rgba(0,0,0,0.6)';
                popup.style.zIndex = '99999';
                popup.style.display = 'flex';
                popup.style.alignItems = 'center';
                popup.style.justifyContent = 'center';
                popup.style.padding = '16px';
                popup.style.backdropFilter = 'blur(4px)';
                
                // Photo
                let imgHtml = `<div style="padding:40px; background:#f1f5f9; text-align:center; color:#94a3b8;"><i class="fas fa-image fa-3x"></i><p>Không có ảnh</p></div>`;
                if (window.DevicePhotoStore && typeof window.DevicePhotoStore.getThumbnailUrl === 'function') {
                    const url = await window.DevicePhotoStore.getThumbnailUrl('racklayer', layerId) || await window.DevicePhotoStore.getThumbnailUrl('rack', rackId);
                    if (url) {
                        imgHtml = `<img src="${url}" style="width:100%; max-height:40vh; object-fit:contain; border-radius:8px; border:1px solid #e2e8f0;"/>`;
                    }
                }

                popup.innerHTML = `
                    <div style="background:#fff; border-radius:12px; width:100%; max-width:400px; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.2); position:relative;">
                        <button class="close-popup-btn" style="position:absolute; top:8px; right:8px; width:32px; height:32px; border-radius:50%; border:none; background:rgba(0,0,0,0.5); color:#fff; cursor:pointer; font-size:16px;">&times;</button>
                        <div style="padding:16px; background:#0ea5e9; color:#fff;">
                            <h3 style="margin:0; font-size:18px;"><i class="fas fa-map-marker-alt"></i> Giá ${rackName} - Tầng ${layer.LayerNumber || layerId || '?'}</h3>
                        </div>
                        <div style="padding:16px;">
                            ${imgHtml}
                            <div style="margin-top:16px;">
                                <div style="font-size:14px; font-weight:bold; color:#475569; margin-bottom:4px;">Ghi chú Giá (Rack):</div>
                                <div style="font-size:14px; color:#334155; padding:8px; background:#f8fafc; border-radius:6px; margin-bottom:12px;">${rackNotes}</div>
                                <div style="font-size:14px; font-weight:bold; color:#475569; margin-bottom:4px;">Ghi chú Tầng (Layer):</div>
                                <div style="font-size:14px; color:#334155; padding:8px; background:#f8fafc; border-radius:6px;">${layerNotes}</div>
                            </div>
                        </div>
                    </div>
                `;

                popup.addEventListener('click', (ev) => {
                    if (ev.target === popup || ev.target.closest('.close-popup-btn')) {
                        popup.remove();
                    }
                });

                document.body.appendChild(popup);
            }
        });

        // Checkbox handler
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('card-checkbox')) {
                const itemId = parseInt(e.target.dataset.id);
                if (e.target.checked) {
                    this.selectedItems.add(itemId);
                } else {
                    this.selectedItems.delete(itemId);
                }

                // Update card visual state
                const card = e.target.closest('.result-card');
                if (card) {
                    card.classList.toggle('selected', e.target.checked);
                }

                // Notify parent
                if (this.onSelectionChange) {
                    this.onSelectionChange(Array.from(this.selectedItems));
                }
            }
        });

        // Card click -> mở chi tiết (trừ các nút/điểm bấm đặc biệt)
        document.addEventListener('click', (e) => {
        const card = e.target.closest('.result-card');
        if (!card) return;

        // Không mở chi tiết khi bấm vào các phần tương tác
        if (
            e.target.closest('.card-checkbox') ||
            e.target.closest('.image-zoom-btn') ||
            e.target.closest('.card-thumbnail') ||
            e.target.closest('.location-link') ||
            e.target.closest('.card-action-btn') ||
            e.target.closest('.card-action-menu-v8')
        ) {
            return;
        }

        e.preventDefault();

        const itemId = String(card.dataset.id || '').trim();
        if (!itemId) return;

        if (this.onItemClick) {
            const item = this.items.find(it => {
            const id = (it.type === 'mold') ? it.MoldID : it.CutterID;
            return String(id).trim() === itemId;
            });
            if (item) this.onItemClick(item);
        }
        }, true);

        // Store ready / thumbnail changed -> nạp lại ảnh đại diện cho card
        document.addEventListener('device-photosready', this.scheduleHydrateThumbnails.bind(this))
        document.addEventListener('device-photoschanged', this.scheduleHydrateThumbnails.bind(this))
        
        // Zero-Bandwidth DOM Sync cho thao tác đổi/upload ảnh mới
        document.addEventListener('device-photos:thumbnail-updated', this.onThumbnailUpdated.bind(this))

        // Thêm theo dõi thanh cuộn
        const scrollTarget = document.querySelector('.results-container') || window;
        scrollTarget.addEventListener('scroll', () => {
            if (!this.items || this.items.length === 0) return;
            if (this.currentPage >= this.totalPages) return;
            
            const { scrollTop, scrollHeight, clientHeight } = scrollTarget === window 
                ? document.documentElement 
                : scrollTarget;
            
            if (scrollTop + clientHeight >= scrollHeight - 300) {
                this.loadNextPage();
            }
        });
    }

    loadNextPage() {
        if (this._isLoadingNextPage) return;
        this._isLoadingNextPage = true;
        
        this.currentPage++;
        const startIdx = (this.currentPage - 1) * this.itemsPerPage;
        const endIdx = startIdx + this.itemsPerPage;
        const pageItems = this.items.slice(startIdx, endIdx);
        
        pageItems.forEach(item => {
            const card = this.createCard(item);
            if(this.container) this.container.appendChild(card);
        });
        
        this.scheduleHydrateThumbnails();
        if(typeof this.updateCheckboxes === 'function') this.updateCheckboxes();
        
        setTimeout(() => {
            this._isLoadingNextPage = false;
        }, 150);
    }

    openCardActionMenu(buttonEl, item, mouseEvent = null) {
        this.closeCardActionMenu();

        const menu = document.createElement('div');
        menu.className = 'card-action-menu-v8';
        menu.style.position = 'fixed';
        menu.style.zIndex = '40000';
        
        // Fluent UI adjustments 
        menu.style.background = 'rgba(255, 255, 255, 0.9)';
        menu.style.backdropFilter = 'blur(16px)';
        menu.style.WebkitBackdropFilter = 'blur(16px)';
        menu.style.border = '1px solid rgba(0, 0, 0, 0.08)';
        menu.style.borderRadius = '12px';
        menu.style.boxShadow = '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.04)';
        menu.style.padding = '8px';
        menu.style.width = '200px';

        // Calculate positioning
        let left = 0;
        let top = 0;
        const menuWidth = 200;
        const estimatedHeight = 350; // Chiều cao ước tính của Menu

        if (mouseEvent) {
            left = mouseEvent.clientX;
            top = mouseEvent.clientY;
        } else {
            const rect = buttonEl.getBoundingClientRect();
            left = rect.left;
            top = rect.bottom + 8;
        }

        // Boundary checks chống lách màn hình
        if (left + menuWidth > window.innerWidth) {
            left = window.innerWidth - menuWidth - 16;
        }
        if (top + estimatedHeight > window.innerHeight) {
            top = top - estimatedHeight - 16;
            // Nếu bấm bằng nút 3 chấm thì hất thẳng lên phía trên nút
            if (!mouseEvent && buttonEl) {
                 top = buttonEl.getBoundingClientRect().top - estimatedHeight - 8;
            }
        }
        // Đảm bảo không bị lố màn hình trên cùng / trái cùng
        if (top < 10) top = 10;
        if (left < 10) left = 10;

        menu.style.left = left + 'px';
        menu.style.top = top + 'px';

        const code = item.code || item.MoldCode || item.CutterNo || item.displayCode || '';
        const itemType = item.type || 'mold';

        // Styling chung của button con
        const btnStyle = "width:100%;padding:10px 12px;border-radius:8px;border:none;background:transparent;text-align:left;cursor:pointer;font-size:14px;font-weight:600;color:#334155;transition:all 0.2s;display:flex;align-items:center;gap:10px;";
        const hrStyle = "margin:6px 0;border:none;border-top:1px solid rgba(0,0,0,0.06);";

        // Generate HTML UI Fluent
        menu.innerHTML = `
        <style>
            .cam-act:hover { background: rgba(0,0,0,0.05) !important; color: #0EA5E9 !important; padding-left: 16px !important; }
            .cam-act-danger:hover { background: #fee2e2 !important; color: #ef4444 !important; }
            .cam-act-primary { background: var(--ui-accent, #0ea5a0) !important; color: #fff !important; }
            .cam-act-primary:hover { filter: brightness(0.95); padding-left: 12px !important; }
        </style>
        <div style="font-weight:700;margin:6px 8px 10px 8px;font-size:13px;color:#64748b;letter-spacing:0.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${String(code)}
        </div>

        <button class="cam-act cam-act-primary" data-act="detail" style="${btnStyle}">
            <i class="fas fa-file-alt" style="width:18px;text-align:center;"></i> 詳細 / Chi tiết
        </button>
        
        <hr style="${hrStyle}">
        
        <button class="cam-act" data-act="checkin" style="${btnStyle}">
            <i class="fas fa-sign-in-alt" style="width:18px;text-align:center;"></i> 入庫 / Nhập kho
        </button>
        <button class="cam-act" data-act="checkout" style="${btnStyle}">
            <i class="fas fa-sign-out-alt" style="width:18px;text-align:center;"></i> 出庫 / Xuất kho
        </button>
        <button class="cam-act" data-act="inventory" style="${btnStyle}">
            <i class="fas fa-clipboard-check" style="width:18px;text-align:center;"></i> 棚卸 / Kiểm kê
        </button>
        
        <hr style="${hrStyle}">
        
        <button class="cam-act" data-act="qr" style="${btnStyle}">
            <i class="fas fa-qrcode" style="width:18px;text-align:center;"></i> QRコード / Mã QR
        </button>
        <button class="cam-act" data-act="move" style="${btnStyle}">
            <i class="fas fa-map-marker-alt" style="width:18px;text-align:center;"></i> 位置 / Vị trí
        </button>
        <button class="cam-act" data-act="open-storage-module" style="${btnStyle}">
            <i class="fas fa-box-open" style="width:18px;text-align:center;"></i> モジュール / Module
        </button>
        <button class="cam-act" data-act="teflon" style="${btnStyle}">
            <i class="fas fa-paint-roller" style="width:18px;text-align:center;"></i> テフロン / Mạ Teflon
        </button>
        
        <hr style="${hrStyle}">
        
        <button class="cam-act cam-act-danger" data-act="close" style="${btnStyle}">
            <i class="fas fa-times" style="width:18px;text-align:center;"></i> 閉じる / Đóng
        </button>
        `;


        menu.querySelectorAll('.cam-act').forEach(btn => {
        btn.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();

            const act = btn.dataset.act;
            this.closeCardActionMenu();

            if (act === 'close') return;

            if (act === 'detail') {
            if (this.onItemClick) this.onItemClick(item);
            return;
            }

            // 1) Các action chuẩn: phát event quick-action (để sau này nối module r7.2.4)
            if (['checkin','checkout','inventory','move','print'].includes(act)) {
                document.dispatchEvent(new CustomEvent('quick-action', {
                    detail: { action: act, item, itemType }
                }));
                return;
            }

            // Gọi Module xuất QR trực tiếp thay vì đẩy Event
            if (act === 'qr') {
                if (window.ExportQR && typeof window.ExportQR.generate === 'function') {
                    window.ExportQR.generate(item);
                } else {
                    alert('Module Tạo ảnh QR chưa tải xong.');
                }
                return;
            }

            // 2) Mở module tương lai: phát event module:open giống DetailPanel
            if (act === 'open-storage-module') {
            const moldId = item.MoldID || item.MoldCode || item.CutterID || item.CutterNo || '';
            document.dispatchEvent(new CustomEvent('module:open', {
                detail: { module: 'storage', moldId, mold: item, from: 'CardActionMenu' }
            }));
            return;
            }

            // 3) Gọi trực tiếp module Teflon Processing
            if (act === 'teflon') {
                if (window.TeflonProcessing && window.TeflonProcessing.openModal) {
                    const moldId = item.MoldID || item.CutterID;
                    window.TeflonProcessing.openModal({ MoldID: String(moldId), MoldName: item.MoldName || item.CutterName || '' });
                } else {
                    alert('Module TeflonProcessing chưa được tải.');
                }
                return;
            }
        });
        });


        // Click ra ngoài thì đóng
        const onOutside = (ev) => {
            if (!menu.contains(ev.target) && ev.target !== buttonEl) {
            this.closeCardActionMenu();
            document.removeEventListener('click', onOutside, true);
            }
        };
        document.addEventListener('click', onOutside, true);

        document.body.appendChild(menu);
        this._cardActionMenuEl = menu;
        }

        closeCardActionMenu() {
        if (this._cardActionMenuEl) {
            this._cardActionMenuEl.remove();
            this._cardActionMenuEl = null;
        }
    }

    /**
     * Render cards from items array
     */
    render(items, page = 1) {
        this.items = items;
        this.currentPage = page;
        // Tính tổng số trang
        this.totalPages = Math.ceil(items.length / this.itemsPerPage);

        if (!this.container) {
            console.error('Card container not found');
            return;
        }
        
        // Ẩn thanh phân trang cũ nếu đang bật chế độ thẻ (để chạy cuộn vô tận)
        const paginator = document.querySelector('.pagination-card');
        if (paginator) paginator.style.display = 'none';

        // Clear container
        this.container.innerHTML = '';

        // Empty state
        if (!items || items.length === 0) {
            this.renderEmptyState();
            return;
        }

        // Calculate pagination
        const startIdx = (page - 1) * this.itemsPerPage;
        const endIdx = startIdx + this.itemsPerPage;
        const pageItems = items.slice(startIdx, endIdx);

        // Render cards
        pageItems.forEach(item => {
        const card = this.createCard(item);
        this.container.appendChild(card);
        });

        this.scheduleHydrateThumbnails();

        // Đồng bộ checkbox với selectedItems
        this.updateCheckboxes();

        // Pagination được xử lý bởi app.js
    }


    /**
     * Create card element - Exact mockup r8.1.0 design
     */
    createCard(item) {
        const card = document.createElement('div');
        card.className = 'result-card';

        const itemId = item.type === 'mold' ? item.MoldID : item.CutterID;
        card.dataset.id = itemId;
        card.dataset.type = item.type;

        // Check if selected
        if (this.selectedItems.has(itemId)) {
            card.classList.add('selected');
        }

        // Get data with correct mapping
        const code = item.type === 'mold' ? (item.MoldCode || '') : (item.CutterNo || '');

        // Product name: Priority TrayInfoForMoldDesign > MoldName/CutterName
        let productName = '';
        if (item.designInfo && item.designInfo.TrayInfoForMoldDesign) {
            productName = item.designInfo.TrayInfoForMoldDesign;
        } else {
            productName = item.type === 'mold' 
                ? (item.MoldName || '') 
                : (item.CutterName || item.CutterDesignName || '');
        }

        const dimensions = item.dimensions || 'N/A';
        
        // Lấy vị trí theo format RackID-LayerNumber
        const rackLocation = this.getRackLocation(item);
        const location = rackLocation.display;
        
        // Lấy trạng thái từ statuslogs
        const statusInfo = this.getLatestStatus(item);
        const statusClass = statusInfo.status ? statusInfo.status.toLowerCase() : '';
        const statusLabel = this.getStatusLabel(statusInfo.status);
        const statusDate = statusInfo.date ? this.formatDate(statusInfo.date) : '';
        
        const company = item.company || '-';


        // Type info
        const itemType = item.type === 'mold' ? 'mold' : 'cutter';
        const typeBadge = item.type === 'mold' ? '金型' : '抜型';
        const typeIcon = item.type === 'mold' ? 'cube' : 'cut';

                // Card HTML - Exact mockup structure r8.1.0
        card.innerHTML = `
            <!-- Checkbox - Top Left -->
            <input type="checkbox" 
                   class="card-checkbox" 
                   data-id="${itemId}" 
                   ${this.selectedItems.has(itemId) ? 'checked' : ''}>
            
            <!-- Type Badge - Top Right -->
            <div class="item-type-badge ${itemType}">${typeBadge}</div>
            
            <!-- Thumbnail Area -->
            <div class="card-thumbnail" data-id="${itemId}" style="cursor: pointer;" title="Bấm để phóng to">
                <img class="card-thumb-img"
                    data-devicetype="${itemType}"
                    data-deviceid="${itemId}"
                    alt=""
                    style="width:100%;height:100%;object-fit:cover;display:none;" />
                <div class="placeholder-icon" data-thumb-placeholder="1">
                    <i class="fas fa-${typeIcon}"></i>
                </div>
            </div>
            
            <!-- Card Body -->
            <div class="card-body">
                <!-- ID Label -->
                <div class="item-id">ID: ${itemId}</div>
                
                <!-- Code - Bold -->
                <div class="item-code">${code}</div>
                
                <!-- Product Name -->
                <div class="item-name">${productName}</div>
                
                <!-- Dimensions - Green -->
                <div class="item-dimensions">
                    <i class="fas fa-ruler-combined"></i>
                    ${dimensions}
                </div>
                
                <!-- Meta Info Group: Location + Status + Date -->
                <div class="item-meta-group" style="gap:6px; flex-wrap:wrap;">
                    <!-- Location - Blue (clickable) -->
                    <div class="meta-item location" style="font-size: 12px; font-weight: bold; padding: 4px 8px; background: #e0f2fe; border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); white-space:nowrap;">
                        <i class="fas fa-map-marker-alt"></i>
                        <a href="#" class="location-link" 
                           data-rack-id="${rackLocation.rackId || ''}" 
                           data-layer-id="${rackLocation.rackLayerId || ''}"
                           onclick="event.stopPropagation(); event.preventDefault();" style="color: #0369a1; text-decoration: none;">
                            ${location}
                        </a>
                    </div>
                    
                    ${statusInfo.status ? `
                    <!-- Status Badge -->
                    <div class="meta-item status ${statusClass}" style="font-size: 12px; font-weight: bold; padding: 4px 8px; border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); white-space:nowrap;">
                        ${statusLabel}
                    </div>
                    ` : '<div class="meta-item status" style="font-size: 12px; font-weight: bold; padding: 4px 8px;">-</div>'}
                    
                    <!-- Update Date - Right aligned -->
                    <div class="meta-item date" style="font-size: 12px; font-weight: bold; white-space:nowrap; margin-left:auto;">
                    <i class="fas fa-calendar-alt"></i>
                    <span class="meta-date-text">${statusDate || '-'}</span>

                    <button class="card-action-btn"
                            data-id="${itemId}"
                            data-type="${itemType}"
                            aria-label="actions"
                            onclick="event.stopPropagation();"
                            style="margin-left:4px;width:26px;height:26px;border-radius:8px;border:1px solid rgba(2,6,23,0.12);background:rgba(255,255,255,0.96);color:var(--ui-accent-hover,#0A5C56);display:inline-flex;align-items:center;justify-content:center;padding:0;cursor:pointer;">
                        <i class="fas fa-ellipsis-v" style="font-size:12px;"></i>
                    </button>
                    </div>

                </div>
            </div>
            
            <!-- Card Footer - Dual Buttons -->
            
        `;

        return card;
    }

    /**
     * Đồng bộ trực tiếp DOM img.src thay vì list lại (Real-time, zero-bandwidth)
     */
    onThumbnailUpdated(e) {
        if (!e || !e.detail || !e.detail.photo) return;
        const photo = e.detail.photo;
        const deviceType = photo.device_type;
        const deviceId = photo.device_id;
        
        // Fallback multiple field names
        let thumbUrl = photo.thumb_public_url || photo.thumbpublicurl || photo.thumbPublicUrl || 
                         photo.public_url || photo.publicurl || photo.publicUrl || '';
        if (!deviceType || !deviceId) return;

        // Cập nhật lại cache trong RAM (kể cả card không có trong DOM, để trang sau xài luôn)
        const key = deviceType + '|' + String(deviceId);
        if (thumbUrl) {
            this._thumbUrlCache.set(key, thumbUrl);
            this._thumbPromiseCache.delete(key);
        }

        // Chỉ update đúng thẻ card đang hiển thị trên trang (tìm DOM)
        if (!this.container) return;
        const qs = `img.card-thumb-img[data-devicetype="${deviceType}"][data-deviceid="${String(deviceId)}"]`;
        const img = this.container.querySelector(qs);
        
        if (!img) return; // Nếu thẻ card nằm ở trang khác thì thôi

        // Force reload img src (vượt qua cờ data-loaded của hydrateThumbnails)
        if (thumbUrl) {
            this._applyThumbToImg(img, thumbUrl);
        } else {
            // Không có ảnh -> ẩn thumb, hiện placeholder
            img.style.display = 'none';
            try { img.removeAttribute('src'); } catch(err) {}
            const wrap = img.closest('.card-thumbnail');
            if (wrap) {
                const ph = wrap.querySelector('.placeholder-icon');
                if (ph) ph.style.display = '';
            }
        }
    }

    scheduleHydrateThumbnails() {
        if (this._thumbHydrateTimer) clearTimeout(this._thumbHydrateTimer);
        this._thumbHydrateTimer = setTimeout(() => this.hydrateThumbnails(), 80);
    }

    async hydrateThumbnails() {
        if (!window.DevicePhotoStore) return;
        if (typeof window.DevicePhotoStore.getThumbnailUrl !== 'function' &&
            typeof window.DevicePhotoStore.getThumbnailForDevice !== 'function') return;

        // Bỏ Intersection Observer, gọi trực tiếp tải toàn bộ y hệt v8.4.3
        const imgs = this.container.querySelectorAll('img.card-thumb-img[data-devicetype][data-deviceid]:not([data-loaded="true"])');
        imgs.forEach(img => {
            this.loadSingleThumbnail(img);
        });
    }

    async loadSingleThumbnail(img) {
        if (!img || !img.isConnected) return;
        
        // Đánh dấu để Observer không gọi lại lần 2
        img.dataset.loaded = "true";

        const dt = (img.dataset.devicetype || '').trim();
        const did = (img.dataset.deviceid || '').trim();
        if (!dt || !did) return;

        const key = dt + '|' + did;

        // Cache 1: Đã có sẵn trong RAM -> Móc ra xài không chớp nhoáng
        if (this._thumbUrlCache.has(key)) {
            const url = this._thumbUrlCache.get(key) || '';
            this._applyThumbToImg(img, url);
            return;
        }

        // Cache 2: Mạng lắc, API Đang bận ở thẻ bên cạnh -> Ngồi chung hàng chờ Promise
        if (this._thumbPromiseCache.has(key)) {
            try {
                const url = await this._thumbPromiseCache.get(key);
                this._applyThumbToImg(img, url || '');
            } catch (e) {}
            return;
        }

        // Chính thức: Phát tín hiệu lấy link cho 1 thẻ duy nhất
        const p = (async () => {
            try {
                let url = '';

                // Ưu tiên API v8
                if (typeof window.DevicePhotoStore.getThumbnailUrl === 'function') {
                    url = await window.DevicePhotoStore.getThumbnailUrl(dt, did);
                } else {
                    // Fallback tương thích ngược
                    const row = await window.DevicePhotoStore.getThumbnailForDevice(dt, did);
                    url = row ? String(
                        row.thumbpublicurl || row.thumbPublicUrl || row.thumb_public_url ||
                        row.thumbnailpublicurl || row.thumbnail_public_url ||
                        row.thumbnailurl || row.thumbnail_url || row.thumb_url || ''
                    ).trim() : '';
                }

                url = String(url || '').trim();
                this._thumbUrlCache.set(key, url);
                return url;
            } catch (e) {
                this._thumbUrlCache.set(key, '');
                return '';
            } finally {
                this._thumbPromiseCache.delete(key);
            }
        })();

        this._thumbPromiseCache.set(key, p);

        const url = await p;
        this._applyThumbToImg(img, url || '');
    }

    _applyThumbToImg(img, url) {
    if (!img || !img.isConnected) return;

    const wrap = img.closest('.card-thumbnail');
    const placeholder = wrap ? wrap.querySelector('.placeholder-icon') : null;

    if (!url) {
        img.style.display = 'none';
        try { img.removeAttribute('src'); } catch (e) {}
        if (placeholder) placeholder.style.display = '';
        return;
    }

    img.onerror = () => {
        img.style.display = 'none';
        if (placeholder) placeholder.style.display = '';
    };

    img.onload = () => {
        img.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
    };

    if (img.getAttribute('src') !== url) img.src = url;
    }

    /**
     * Render empty state
     */
    renderEmptyState() {
        this.container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <div class="empty-state-text">
                    検索結果がありません / Không có kết quả
                </div>
                <div class="empty-state-subtext">
                    検索条件を変更してください<br>
                    Vui lòng thay đổi điều kiện tìm kiếm
                </div>
            </div>
        `;
    }

    /**
     * Get total pages
     */
    getTotalPages() {
        return Math.ceil(this.items.length / this.itemsPerPage);
    }

    /**
     * Get selected items
     */
    getSelectedItems() {
        return this.items.filter(item => {
            const id = item.type === 'mold' ? item.MoldID : item.CutterID;
            return this.selectedItems.has(id);
        });
    }

    /**
     * Select all items on current page
     */
    selectAll() {
        const pageItems = this.getCurrentPageItems();
        pageItems.forEach(item => {
        const itemId = item.type === 'mold' ? item.MoldID : item.CutterID;
        this.selectedItems.add(itemId);
        });
        this.updateCheckboxes();
        if (this.onSelectionChange) {
        this.onSelectionChange(Array.from(this.selectedItems));
        }
    }

    /**
     * Select ALL results (across all pages)
     */
    selectAllResults() {
        // Chọn TẤT CẢ items trong this.items (không chỉ trang hiện tại)
        this.items.forEach(item => {
        const itemId = item.type === 'mold' ? item.MoldID : item.CutterID;
        this.selectedItems.add(itemId);
        });
        this.updateCheckboxes();
        if (this.onSelectionChange) {
        this.onSelectionChange(Array.from(this.selectedItems));
        }
        console.log(`✅ Đã chọn TẤT CẢ ${this.selectedItems.size} kết quả`);
    }


    selectAllResults() {
        // Chọn toàn bộ items của kết quả tìm kiếm (mọi trang)
        this.selectedItems.clear();

        (this.items || []).forEach(item => {
            const id = item.type === 'mold' ? item.MoldID : item.CutterID;
            const n = parseInt(id);
            if (!isNaN(n)) this.selectedItems.add(n);
        });

        // Cập nhật giao diện trang hiện tại
        const cards = this.container?.querySelectorAll('.result-card') || [];
        cards.forEach(card => {
            const id = parseInt(card.dataset.id);
            const checked = this.selectedItems.has(id);
            card.classList.toggle('selected', checked);

            const cb = card.querySelector('.card-checkbox');
            if (cb) cb.checked = checked;
        });

        if (this.onSelectionChange) {
            this.onSelectionChange(Array.from(this.selectedItems));
        }
    }

    /**
     * Deselect all items
     */
    deselectAll() {
        this.selectedItems.clear();
        this.updateCheckboxes();
        if (this.onSelectionChange) {
        this.onSelectionChange([]);
        }
    }

    /**
     * Update checkboxes to match selectedItems state
     */
    updateCheckboxes() {
        const checkboxes = this.container.querySelectorAll('.card-checkbox');
        checkboxes.forEach(checkbox => {
        const itemId = parseInt(checkbox.dataset.id);
        const isSelected = this.selectedItems.has(itemId);
        checkbox.checked = isSelected;
        
        // Update card visual state
        const card = checkbox.closest('.result-card');
        if (card) {
            card.classList.toggle('selected', isSelected);
        }
        });
    }


        /**
     * Lấy trạng thái mới nhất từ statuslogs.csv
     */
    getLatestStatus(item) {
        if (!window.DataManager || !window.DataManager.data || !window.DataManager.data.statuslogs) {
            return { status: null, date: null };
        }

        const itemId = item.type === 'mold' ? item.MoldID : item.CutterID;
        const idField = item.type === 'mold' ? 'MoldID' : 'CutterID';

        // Lọc các log của item này
        const logs = window.DataManager.data.statuslogs.filter(log => {
            return String(log[idField] || '').trim() === String(itemId).trim();
        });

        if (!logs || logs.length === 0) {
            return { status: null, date: null };
        }

        // Sắp xếp theo Timestamp (mới nhất trước)
        logs.sort((a, b) => {
            const dateA = new Date(a.Timestamp || 0);
            const dateB = new Date(b.Timestamp || 0);
            return dateB - dateA;
        });

        const latest = logs[0];
        return {
            status: latest.Status || null,
            date: latest.Timestamp || null,
            notes: latest.Notes || ''
        };
    }

    /**
     * Lấy thông tin vị trí dạng RackID-RackLayerNumber
     */
    getRackLocation(item) {
        if (!window.DataManager || !window.DataManager.data) {
            return { display: '-', rackId: null, layerNum: null };
        }

        const rackLayerId = item.RackLayerID;
        if (!rackLayerId) {
            return { display: '-', rackId: null, layerNum: null };
        }

        // Tìm trong racklayers
        const rackLayer = window.DataManager.data.racklayers?.find(rl => 
            String(rl.RackLayerID).trim() === String(rackLayerId).trim()
        );

        if (!rackLayer) {
            return { display: '-', rackId: null, layerNum: null };
        }

        const rackId = rackLayer.RackID;
        const layerNum = rackLayer.RackLayerNumber;

        // Tìm tên giá trong racks
        const rack = window.DataManager.data.racks?.find(r => 
            String(r.RackID).trim() === String(rackId).trim()
        );

        const rackName = rack?.RackName || rackId;
        
        return {
            display: `${rackName}-${layerNum}`,
            rackId: rackId,
            layerNum: layerNum,
            rackLayerId: rackLayerId
        };
    }

        /**
     * Chuyển status code thành label hiển thị
     */
    getStatusLabel(status) {
        if (!status) return '-';
        
        const labels = {
            'IN': '入庫 IN',
            'OUT': '出庫 OUT',
            'AUDIT': '棚卸 AUDIT',
            'DISPOSED': '廃棄',
            'RETURNED': '返却'
        };
        
        return labels[status.toUpperCase()] || status;
    }

    /**
     * Format ngày tháng
     */
    formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            if (isNaN(date)) return dateStr;
            
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}.${month}.${day}`;
        } catch (e) {
            return dateStr;
        }
    }

}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResultsCardRenderer;
}

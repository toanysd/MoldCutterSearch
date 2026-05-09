// v10.0.0-PubSub
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

                // Lấy ảnh để phóng to: chỉ lấy ảnh Gốc/HD, KHÔNG được dùng bản thumbnail
                let row = null;

                // Chọn lấy ảnh active mới nhất (độ phân giải cao)
                if (true) {
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
                    return;
                }

                console.log('[CardZoom] open url:', fullUrl);

                let thumbSrc = '';
                const thumbImg = zoomBtn.querySelector ? zoomBtn.querySelector('img.card-thumb-img') : null;
                if (thumbImg && thumbImg.src && thumbImg.style.display !== 'none') {
                    thumbSrc = thumbImg.src;
                }

                // Dùng custom popup để hiển thị ảnh với hiệu ứng mượt mà (smooth transition)
                const popup = document.createElement('div');
                popup.style.position = 'fixed';
                popup.style.inset = '0';
                popup.style.background = 'rgba(0,0,0,0)';
                popup.style.zIndex = '999999';
                popup.style.display = 'flex';
                popup.style.alignItems = 'center';
                popup.style.justifyContent = 'center';
                popup.style.padding = '16px';
                popup.style.backdropFilter = 'blur(0px)';
                popup.style.transition = 'background 0.3s ease, backdrop-filter 0.3s ease';

                popup.innerHTML = `
                    <div style="background:#fff; border-radius:12px; padding:12px; position:relative; width:80vw; max-width:800px; height:80vh; max-height:800px; display:flex; flex-direction:column; align-items:center; box-shadow:0 10px 25px rgba(0,0,0,0.2); opacity: 0; transform: scale(0.95); transition: opacity 0.3s ease, transform 0.3s ease;">
                        <div style="width:100%; display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding:0 8px; flex-shrink:0;">
                            <span style="font-weight:bold; color:#334155; font-size:16px;">${title}</span>
                            <button class="close-zoom-btn" title="Đóng" style="border:none; background:transparent; font-size:24px; cursor:pointer; color:#64748b; line-height:1; padding:0; transition: color 0.2s;" onmouseover="this.style.color='#f43f5e'" onmouseout="this.style.color='#64748b'">&times;</button>
                        </div>
                        <div style="flex:1; width:100%; position:relative; display:flex; align-items:center; justify-content:center; background:#f8fafc; border-radius:8px; overflow:hidden;">
                            ${thumbSrc ? `<img src="${thumbSrc}" style="position:absolute; width:100%; height:100%; object-fit:contain; filter:blur(10px); opacity:0.6; transform: scale(1.05);" />` : ''}
                            <i class="fas fa-spinner fa-spin" id="zoomSpinner_${deviceId}" style="font-size:2rem; color:#94a3b8; position:absolute; z-index:2;"></i>
                            <img src="${fullUrl}" class="card-zoom-target-img" onload="
                                const spinner = document.getElementById('zoomSpinner_${deviceId}');
                                if(spinner) spinner.style.display='none';
                                this.style.opacity='1';
                            " style="width:100%; height:100%; object-fit:contain; position:relative; z-index:3; opacity:0; transition: transform 0.3s ease, opacity 0.4s ease; cursor: zoom-in;" onerror="this.style.display='none';" 
                            onclick="
                                if (window.openGlobalPhotoZoom) {
                                    window.openGlobalPhotoZoom(this.src);
                                }
                                event.stopPropagation();
                            " />
                        </div>
                    </div>
                `;

                const closeAction = () => {
                    popup.style.background = 'rgba(0,0,0,0)';
                    popup.style.backdropFilter = 'blur(0px)';
                    popup.children[0].style.opacity = '0';
                    popup.children[0].style.transform = 'scale(0.95)';
                    setTimeout(() => popup.remove(), 300);
                    if (window.SwipeHistoryTrap) window.SwipeHistoryTrap.remove('cardThumbPopup');
                };

                popup.addEventListener('click', (ev) => {
                    if (ev.target === popup || ev.target.closest('.close-zoom-btn')) {
                        closeAction();
                    }
                });

                if (window.SwipeHistoryTrap) {
                    window.SwipeHistoryTrap.push('cardThumbPopup', closeAction);
                    window.SwipeHistoryTrap.bindSwipe(popup, closeAction);
                }

                document.body.appendChild(popup);

                // Kích hoạt animation hiện ra
                requestAnimationFrame(() => {
                    popup.style.background = 'rgba(0,0,0,0.6)';
                    popup.style.backdropFilter = 'blur(4px)';
                    popup.children[0].style.opacity = '1';
                    popup.children[0].style.transform = 'scale(1)';
                });
                return;


                // Fallback tuyệt đối nếu không có PhotoManager
                window.open(fullUrl, '_blank', 'noopener');

            } catch (err) {
                console.warn('[CardZoom] error:', err);
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

                let popupLayerId = layerId ? String(layerId) : '';
                let popupRackId = rackId ? String(rackId) : '';
                let calculatedLayerNumber = '?';

                // Quy tắc: số cuối trong RackLayerID là số tầng, các số còn lại là số giá
                if (popupLayerId.length > 0) {
                    calculatedLayerNumber = popupLayerId.slice(-1);
                    if (!popupRackId) {
                        popupRackId = popupLayerId.slice(0, -1);
                    }
                }

                // Get data
                const rack = window.DataManager?.data?.racks?.find(r => String(r.RackID) === String(popupRackId)) || {};
                const layer = window.DataManager?.data?.racklayers?.find(l => String(l.RackLayerID) === String(popupLayerId)) || {};

                const emptyNoteHtml = '<span style="color:#94a3b8; font-style:italic;">メモなし / Không có ghi chú</span>';

                let rackNotes = rack.RackNotes || rack.Notes ? String(rack.RackNotes || rack.Notes).trim() : '';
                if (!rackNotes || rackNotes.toLowerCase() === 'không có ghi chú') rackNotes = emptyNoteHtml;

                let layerNotes = layer.RackLayerNotes || layer.Notes ? String(layer.RackLayerNotes || layer.Notes).trim() : '';
                if (!layerNotes || layerNotes.toLowerCase() === 'không có ghi chú') layerNotes = emptyNoteHtml;

                let rackLocationText = rack.RackLocation || '';
                if (!rackLocationText || rackLocationText.toLowerCase() === 'không có ghi chú') rackLocationText = emptyNoteHtml;

                const finalLayerNumber = layer.RackLayerNumber || calculatedLayerNumber;
                const displayRackName = rack.RackName || popupRackId || '?';

                const isExternal = locationLink.innerHTML.includes('fa-building');

                let displayLayerText = '';
                if (String(finalLayerNumber) !== '0' && finalLayerNumber !== '?') {
                    displayLayerText = ` - 棚段${finalLayerNumber}番 / Ngăn ${finalLayerNumber}`;
                }

                let displayRackText = `ラック${displayRackName}番 / Giá ${displayRackName}`;
                if (isExternal) {
                    displayRackText = `社外保管 / Lưu trữ bên ngoài`;
                    displayLayerText = '';
                } else if (displayRackName === '?' || displayRackName === '0' || displayRackName === '') {
                    displayRackText = `位置未定 / Chưa quyết định vị trí`;
                    displayLayerText = '';
                }


                // Build Popup FIRST
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

                let imgHtml = `
                    <style>
                        .rack-popup-img { width:100%; height:100%; object-fit:contain; border-radius:8px; cursor:zoom-in; transition:opacity 0.3s ease; display:block; opacity: 0; position:absolute; inset:0; }
                    </style>
                    <div id="rackPopupImgContainer" style="position:relative; width:100%; height: 35vh; min-height: 200px; max-height: 400px; display:flex; align-items:center; justify-content:center; background:#f1f5f9; border-radius:8px; border:1px solid #e2e8f0; overflow:hidden;">
                        <i id="rackPopupSpinner" class="fas fa-spinner fa-spin" style="font-size:2rem; color:#94a3b8; position:absolute; z-index:2;"></i>
                    </div>`;

                popup.innerHTML = `
                    <div style="background:#fff; border-radius:12px; width:100%; max-width:420px; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.2); position:relative;">
                        <button class="close-popup-btn" style="position:absolute; top:10px; right:12px; width:28px; height:28px; border-radius:50%; border:none; background:rgba(0,0,0,0.2); color:#fff; cursor:pointer; font-size:16px; display:flex; align-items:center; justify-content:center; transition: background 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.5)'" onmouseout="this.style.background='rgba(0,0,0,0.2)'">&times;</button>
                        <div style="padding:12px 48px 12px 16px; background:#0ea5e9; color:#fff; display:flex; align-items:center;">
                            <h3 style="margin:0; font-size:16px; font-weight:600;"><i class="fas fa-map-marker-alt" style="margin-right:6px;"></i> ${displayRackText}${displayLayerText}</h3>
                        </div>
                        <div style="padding:16px;">
                            ${imgHtml}
                            <div style="margin-top:16px; display:flex; flex-direction:column; gap:12px;">
                                
                                <div class="info-group">
                                    <div style="font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 4px; display:flex; align-items:baseline; gap:6px;">
                                        <span>ラックの場所</span>
                                        <span style="font-size:10px; font-weight:400; color:#94a3b8;">(Vị trí Giá)</span>
                                    </div>
                                    <div style="font-size: 14px; color: #334155; padding: 10px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; min-height: 20px;">
                                        ${rackLocationText}
                                    </div>
                                </div>

                                <div class="info-group">
                                    <div style="font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 4px; display:flex; align-items:baseline; gap:6px;">
                                        <span>ラックメモ</span>
                                        <span style="font-size:10px; font-weight:400; color:#94a3b8;">(Ghi chú Giá)</span>
                                    </div>
                                    <div style="font-size: 14px; color: #334155; padding: 10px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; min-height: 20px;">
                                        ${rackNotes}
                                    </div>
                                </div>

                                <div class="info-group">
                                    <div style="font-size: 12px; color: #64748b; font-weight: 600; margin-bottom: 4px; display:flex; align-items:baseline; gap:6px;">
                                        <span>棚段メモ</span>
                                        <span style="font-size:10px; font-weight:400; color:#94a3b8;">(Ghi chú Ngăn)</span>
                                    </div>
                                    <div style="font-size: 14px; color: #334155; padding: 10px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; min-height: 20px;">
                                        ${layerNotes}
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                `;

                const closeRackPopup = () => {
                    popup.remove();
                    if (window.SwipeHistoryTrap) window.SwipeHistoryTrap.remove('locationPopup');
                };

                popup.addEventListener('click', (ev) => {
                    if (ev.target === popup || ev.target.closest('.close-popup-btn')) {
                        closeRackPopup();
                    }
                });

                if (window.SwipeHistoryTrap) {
                    window.SwipeHistoryTrap.push('locationPopup', closeRackPopup);
                    window.SwipeHistoryTrap.bindSwipe(popup, closeRackPopup);
                }

                document.body.appendChild(popup);

                // Asynchronously fetch photo after DOM logic finishes
                setTimeout(async () => {
                    let fullUrl = '';
                    const container = document.getElementById('rackPopupImgContainer');
                    if (!container || !document.body.contains(popup)) return; // Check if still in DOM

                    if (window.DevicePhotoStore) {
                        const fetchOrgPhoto = async (type, id) => {
                            const strId = String(id || '').trim();
                            if (!strId || strId === '0' || strId === '0-0' || strId === '?') return '';
                            let row = null;
                            if (typeof window.DevicePhotoStore.listForDevice === 'function') {
                                const rows = await window.DevicePhotoStore.listForDevice(type, strId, { state: 'active', limit: 1 });
                                row = Array.isArray(rows) ? (rows[0] || null) : null;
                            } else if (typeof window.DevicePhotoStore.getPhotos === 'function') {
                                const r = await window.DevicePhotoStore.getPhotos({ deviceType: type, deviceId: strId, limit: 1 });
                                const data = r && Array.isArray(r.data) ? r.data : (Array.isArray(r) ? r : []);
                                row = data[0] || null;
                            }
                            return row ? String(row.public_url || row.publicurl || row.publicUrl || '') : '';
                        };

                        fullUrl = await fetchOrgPhoto('racklayer', popupLayerId);
                        if (!fullUrl) fullUrl = await fetchOrgPhoto('rack', popupRackId);
                    }

                    if (!document.body.contains(popup)) return;

                    if (fullUrl) {
                        const img = document.createElement('img');
                        img.className = 'rack-popup-img';
                        img.style.position = 'relative';
                        img.style.zIndex = '3';
                        img.onload = () => {
                            const spinner = document.getElementById('rackPopupSpinner');
                            if (spinner) spinner.style.display = 'none';
                            img.style.opacity = '1';
                        };
                        img.onerror = () => {
                            container.innerHTML = `<div style="padding:40px; text-align:center; color:#94a3b8;"><i class="fas fa-image fa-3x" style="margin-bottom:8px;"></i><p style="margin:0; font-size:12px; font-weight:600;">画像なし <span style="font-weight:400;">/ Không có ảnh</span></p></div>`;
                        };
                        img.onclick = () => { if (window.openGlobalPhotoZoom) window.openGlobalPhotoZoom(img.src); };
                        img.src = fullUrl;
                        container.appendChild(img);
                    } else {
                        container.innerHTML = `<div style="padding:40px; text-align:center; color:#94a3b8;"><i class="fas fa-image fa-3x" style="margin-bottom:8px;"></i><p style="margin:0; font-size:12px; font-weight:600;">画像なし <span style="font-weight:400;">/ Không có ảnh</span></p></div>`;
                    }
                }, 10);
            }
        });

        // Click vào Status -> Gọi module checkin/checkout nhanh
        document.addEventListener('click', (e) => {
            const statusBadge = e.target.closest('.meta-item.status');
            if (statusBadge) {
                e.preventDefault();
                e.stopPropagation();

                const card = statusBadge.closest('.result-card');
                if (!card) return;

                const itemId = String(card.dataset.id || '').trim();
                const item = this.items.find(it => {
                    const id = (it.type === 'mold') ? it.MoldID : it.CutterID;
                    return String(id).trim() === itemId;
                });

                if (!item) return;

                const itemType = item.type || 'mold';

                // Xác định trạng thái hiện tại
                const statusInfo = this.getLatestStatus(item);
                const currentStatus = statusInfo.status ? statusInfo.status.toUpperCase() : '';

                // Tự động phân luồng (đang trong kho -> form xuất, ngược lại -> form nhập)
                const action = (currentStatus === 'OK' || currentStatus === 'IN') ? 'checkout' : 'checkin';

                document.dispatchEvent(new CustomEvent('quick-action', {
                    detail: { action: action, item, itemType }
                }));
            }
        });

        // Checkbox handler
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('card-checkbox')) {
                const uid = e.target.dataset.uid;
                if (e.target.checked) {
                    this.selectedItems.add(uid);
                } else {
                    this.selectedItems.delete(uid);
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

            // Phân tách riêng click trên ô Checkbox để bắt Shift
            const isCheckboxClick = e.target.closest('.card-checkbox');
            const uid = String(card.dataset.uid || '').trim();
            if (!uid) return;

            if (isCheckboxClick) {
                if (e.shiftKey && this._lastCheckedUid) {
                    e.preventDefault(); // Ngăn ô checkbox tự đổi để hệ thống tính range
                    const isChecking = !this.selectedItems.has(uid);
                    this.toggleRangeSelection(this._lastCheckedUid, uid, isChecking);
                } else {
                    this._lastCheckedUid = uid;
                    // Để "change" event tự bổ sung/xoá như cũ
                }
                return;
            }

            // Không mở chi tiết khi bấm vào các phần tương tác
            if (
                e.target.closest('.image-zoom-btn') ||
                e.target.closest('.card-thumbnail') ||
                e.target.closest('.location-link') ||
                e.target.closest('.meta-item.status') ||
                e.target.closest('.card-action-btn') ||
                e.target.closest('.card-action-menu-v8')
            ) {
                return;
            }

            e.preventDefault();

            // 🌟 KIỂM TRA SELECTION MODE: Nếu đang có phần tử chọn -> Tự động toggle thay vì mở Panel
            if (this.selectedItems.size > 0) {
                const isChecking = !this.selectedItems.has(uid);

                if (e.shiftKey && this._lastCheckedUid) {
                    this.toggleRangeSelection(this._lastCheckedUid, uid, isChecking);
                } else {
                    if (isChecking) this.selectedItems.add(uid);
                    else this.selectedItems.delete(uid);

                    this._lastCheckedUid = uid;
                    this.updateCheckboxes();
                    if (this.onSelectionChange) this.onSelectionChange(Array.from(this.selectedItems));
                }
                return;
            }

            if (this.onItemClick) {
                const item = this.items.find(it => {
                    const tempUid = (it.type === 'mold' ? 'M_' : 'C_') + (it.type === 'mold' ? it.MoldID : it.CutterID);
                    return tempUid === uid;
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
            if (this.container) this.container.appendChild(card);
        });

        this.scheduleHydrateThumbnails();
        if (typeof this.updateCheckboxes === 'function') this.updateCheckboxes();

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

        const code = item.code || item.MoldTrayName || item.MoldCode || item.CutterNo || item.displayCode || '';
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
                if (['checkin', 'checkout', 'inventory', 'move', 'print'].includes(act)) {
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

        const itemId = item.type === 'tray' ? item.TrayID : (item.type === 'mold' ? item.MoldID : item.CutterID);
        const uid = (item.type === 'tray' ? 'T_' : (item.type === 'mold' ? 'M_' : 'C_')) + itemId;
        card.dataset.id = itemId;
        card.dataset.type = item.type;
        card.dataset.uid = uid; // Đánh dấu UID V8.5

        // Check if selected
        if (this.selectedItems.has(uid)) {
            card.classList.add('selected');
        }

        // Get data with correct mapping
        const code = item.type === 'tray' ? ('Khay ' + item.TrayID) : (item.type === 'mold' ? (item.MoldCode || '') : (item.CutterNo || ''));

        // Product name: Priority TrayInfoForMoldDesign > MoldName/CutterName
        let productName = '';
        if (item.designInfo && item.designInfo.TrayInfoForMoldDesign) {
            productName = item.designInfo.TrayInfoForMoldDesign;
        } else {
            productName = item.type === 'tray'
                ? (item.MoldTrayName || '')
                : (item.type === 'mold' ? (item.MoldName || '') : (item.CutterName || item.CutterDesignName || ''));
        }

        const dimensions = item.dimensions || 'N/A';

        // Lấy vị trí theo format RackID-LayerNumber
        const rackLocation = this.getRackLocation(item);
        const location = rackLocation.display;

        // Lấy trạng thái từ statuslogs
        const statusInfo = this.getLatestStatus(item);
        const statusClassRaw = statusInfo.status ? statusInfo.status.toLowerCase() : '';
        const statusLabel = this.getStatusLabel(statusInfo.status);
        const statusDate = statusInfo.date ? this.formatDate(statusInfo.date) : '';

        // Đánh giá Trạng thái Hủy / Trả
        let isDisposed = false;
        let isReturned = false;
        let stampText = '';
        let stampColor = '#ef4444'; // Red

        if (statusClassRaw === 'disposed' || statusClassRaw === '廃棄済' || item.DeviceStatus === '廃棄済' || item.DeviceStatus === 'disposed' || item.MoldDisposing === 'TRUE' || item.MoldDisposing === true) {
            isDisposed = true;
            stampText = '廃棄済';
        } else if (statusClassRaw === 'returned' || statusClassRaw === '出荷・返却済' || statusClassRaw === 'trả lại' || item.DeviceStatus === '出荷・返却済' || item.DeviceStatus === 'Trả lại' || item.DeviceStatus === 'returned' || item.MoldReturning === 'TRUE' || item.MoldReturning === true) {
            isReturned = true;
            stampText = '返却済';
            stampColor = '#f97316'; // Orange
        }

        // Gạch chéo tên nếu đã hủy
        if (isDisposed || isReturned) {
            productName = `<span style="text-decoration: line-through; opacity: 0.7;">${productName}</span>`;
        }

        // Map về chuẩn MCS Status Badge
        let badgeClass = 'neutral';
        if (statusClassRaw === 'in' || statusClassRaw === 'ok') badgeClass = 'active';
        else if (statusClassRaw === 'out' || statusClassRaw === 'ng') badgeClass = 'error';
        else if (statusClassRaw === 'returned' || statusClassRaw === 'warning') badgeClass = 'warning';
        else if (statusClassRaw === 'audit') badgeClass = 'info';
        else if (statusClassRaw === 'disposed') badgeClass = 'neutral';

        const company = item.company || '-';

        // Type info
        const itemType = item.type === 'tray' ? 'tray' : (item.type === 'mold' ? 'mold' : 'cutter');
        const typeBadge = item.type === 'tray' ? 'トレイ' : (item.type === 'mold' ? '金型' : '抜型');
        const typeIcon = item.type === 'tray' ? 'box' : (item.type === 'mold' ? 'cube' : 'cut');

        // Card HTML - Exact mockup structure r8.1.0
        card.innerHTML = `
            <!-- Checkbox - Top Left -->
            <input type="checkbox" 
                   class="card-checkbox" 
                   data-id="${itemId}" 
                   data-uid="${uid}" 
                   ${this.selectedItems.has(uid) ? 'checked' : ''}>
            
            <!-- Type Badge - Top Right -->
            <div class="item-type-badge ${itemType}">${typeBadge}</div>
            
            <!-- Thumbnail Area -->
            <div class="card-thumbnail" data-id="${itemId}" style="cursor: pointer; position:relative;" title="Bấm để phóng to">
                ${(isDisposed || isReturned) ? `
                <div style="position:absolute; inset:0; background:rgba(255,255,255,0.7); z-index:5; display:flex; align-items:center; justify-content:center; pointer-events:none; border-radius:inherit;">
                    <span style="color:${stampColor}; font-weight:900; font-size:20px; text-align:center; text-transform:uppercase; transform:rotate(-15deg); border: 3px solid ${stampColor}; padding: 4px 12px; border-radius: 8px;">${stampText}</span>
                </div>
                ` : ''}
                <img class="card-thumb-img"
                    data-devicetype="${itemType}"
                    data-deviceid="${itemId}"
                    alt=""
                    style="width:100%;height:100%;object-fit:cover;display:none;" />
                <div class="placeholder-icon" data-thumb-placeholder="1">
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
                
                <!-- Dimensions + Weight -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
                    <div class="item-dimensions" style="margin-bottom:0;">
                        <i class="fas fa-ruler-combined"></i>
                        ${dimensions}
                    </div>
                    ${item.MoldWeight ? `<div style="font-size:12px; font-weight:700; color:#1e3a8a;"><i class="fas fa-weight-hanging" style="margin-right:2px;"></i> ${item.MoldWeight}kg</div>` : (item.designInfo && item.designInfo.MoldDesignWeight ? `<div style="font-size:12px; font-weight:700; color:#64748b;" title="Khối lượng Thiết kế"><i class="fas fa-weight-hanging" style="margin-right:2px;"></i> ~${item.designInfo.MoldDesignWeight}kg</div>` : '')}
                </div>
                
                <!-- Meta Info Group: 2 Rows Layout -->
                <div class="item-meta-group" style="display:flex; flex-direction:column; gap:8px; width:100%; box-sizing: border-box;">
                    
                    <!-- Row 1: Location & Status -->
                    <div style="display:flex; justify-content:space-between; align-items:stretch; gap: 8px; width:100%;">
                        <!-- Location - Dynamic Multi-layer (clickable) -->
                        ${(() => {
                const isOutLocal = statusClassRaw === 'out' || statusClassRaw === 'ng';
                const isExternalLocal = rackLocation.isExternal;

                const pureRackText = (rackLocation.rackId || rackLocation.layerNum)
                    ? `${rackLocation.rackId}-${rackLocation.layerNum}`
                    : (rackLocation.display === '-' ? '未定' : rackLocation.display);

                const locStr = rackLocation.rackLocationStr && rackLocation.rackLocationStr !== '-' ? rackLocation.rackLocationStr : '保管エリア';

                // 1. External (Stored at another company)
                // - Triggers when isExternalLocal is TRUE, REGARDLESS OF IN / OUT status.
                // - Top layer: Company Name
                // - Bottom layer: Return location at YSD (if null -> 未定)
                if (isExternalLocal) {
                    const companyName = rackLocation.externalName || item.displayStorageCompany || '社外';
                    let textReturn = pureRackText;
                    if (!rackLocation.rackId || rackLocation.rackLayerId === '0' || rackLocation.rackId === '0') textReturn = '未定';

                    return `
                                <div class="meta-item location location-link loc-out-outside"
                                     data-rack-id="${rackLocation.rackId || ''}" 
                                     data-layer-id="${rackLocation.rackLayerId || ''}">
                                    <div style="font-size:13px; font-weight:900; color:#ea580c; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">
                                        <i class="fas fa-building"></i> 現在：${companyName}
                                    </div>
                                    <div style="font-size:9px; color:#c2410c; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; display:flex; align-items:center; gap:4px;">
                                        <i class="fas fa-undo"></i> 返却先：${textReturn}
                                    </div>
                                </div>`;
                }

                // 2. Normal (IN YSD)
                if (!isOutLocal) {
                    if (rackLocation.display === '-' || !rackLocation.rackId) {
                        return `
                                <div class="meta-item location location-link loc-normal"
                                     data-rack-id="${rackLocation.rackId || ''}" 
                                     data-layer-id="${rackLocation.rackLayerId || ''}">
                                    <i class="placeholder-icon fas fa-map-marker-alt" style="margin-right:4px;"></i>
                                    <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">未定</span>
                                </div>`;
                    }
                    return `
                                <div class="meta-item location location-link loc-normal"
                                     data-rack-id="${rackLocation.rackId || ''}" 
                                     data-layer-id="${rackLocation.rackLayerId || ''}"
                                     style="padding: 4px 8px !important; flex: 1; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); gap: 2px;">
                                    <div style="font-size:13px; font-weight:900; color:#0369a1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">
                                        <i class="fas fa-layer-group"></i> ${pureRackText}
                                    </div>
                                    <div style="font-size:9px; color:#0284c7; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; display:flex; align-items:center; gap:4px;">
                                        <i class="fas fa-map-marker-alt"></i> ${locStr}
                                    </div>
                                </div>`;
                }

                // 3. Out inside YSD
                const dest = statusInfo.outDestName || '未定';
                return `
                            <div class="meta-item location location-link loc-out-inside"
                                 data-rack-id="${rackLocation.rackId || ''}" 
                                 data-layer-id="${rackLocation.rackLayerId || ''}">
                                <div style="font-size:13px; font-weight:900; color:#d97706; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%;">
                                    <i class="fas fa-map-marker-alt"></i> ${dest}
                                </div>
                                <div style="font-size:9px; color:#a16207; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; width:100%; display:flex; align-items:center; gap:4px;">
                                    <i class="fas fa-undo"></i> 返却先：${pureRackText}
                                </div>
                            </div>`;
            })()}
                        
                        <!-- Status Badge -->
                        <div class="meta-item status status-badge ${badgeClass}" style="flex:1; display:flex; align-items:center; justify-content:center; font-size: 12px; font-weight: bold; padding: 6px 8px; border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.05); white-space:nowrap; cursor:pointer; transition: opacity 0.2s; ${statusInfo.status ? '' : 'background: var(--mcs-neutral-light); color: var(--mcs-neutral);'}" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'" title="Nhấp để thay đổi trạng thái (Nhập/Xuất kho)">
                            ${statusInfo.status ? statusLabel : '-'}
                        </div>
                    </div>

                    <!-- Row 2: Date & Action -->
                    <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap: 8px;">
                        <!-- Update Date -->
                        <div class="meta-item date" style="flex:1; display:flex; align-items:center; justify-content:flex-start; font-size: 12px; font-weight: 500; white-space:nowrap; color:#64748b; padding-left: 4px;">
                            <i class="fas fa-calendar-alt" style="margin-right:6px;"></i>
                            <span class="meta-date-text">${statusDate || '-'}</span>
                        </div>

                        <!-- Action Button -->
                        <button class="card-action-btn"
                                data-id="${itemId}"
                                data-type="${itemType}"
                                aria-label="actions"
                                onclick="event.stopPropagation();"
                                style="width:32px;height:32px;flex-shrink:0;border-radius:8px;border:1px solid rgba(2,6,23,0.12);background:rgba(255,255,255,0.96);color:var(--ui-accent-hover,#0A5C56);display:inline-flex;align-items:center;justify-content:center;padding:0;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,0.05);transition:all 0.2s;">
                            <i class="fas fa-ellipsis-v" style="font-size:13px;"></i>
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
            try { img.removeAttribute('src'); } catch (err) { }
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
            } catch (e) { }
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

        const wrap = img.closest('.card-thumbnail, .meta-item');
        const placeholder = wrap ? wrap.querySelector('.placeholder-icon') : null;

        if (!url) {
            img.style.display = 'none';
            try { img.removeAttribute('src'); } catch (e) { }
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
            const uid = (item.type === 'mold' ? 'M_' : 'C_') + (item.type === 'mold' ? item.MoldID : item.CutterID);
            return this.selectedItems.has(uid);
        });
    }

    /**
     * Select all items on current page
     */
    selectAll() {
        const pageItems = this.getCurrentPageItems();
        pageItems.forEach(item => {
            const uid = (item.type === 'mold' ? 'M_' : 'C_') + (item.type === 'mold' ? item.MoldID : item.CutterID);
            this.selectedItems.add(uid);
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
        // Chọn toàn bộ items của kết quả tìm kiếm (mọi trang)
        this.selectedItems.clear();

        (this.items || []).forEach(item => {
            const uid = (item.type === 'mold' ? 'M_' : 'C_') + (item.type === 'mold' ? item.MoldID : item.CutterID);
            this.selectedItems.add(uid);
        });

        // Cập nhật giao diện trang hiện tại
        const cards = this.container?.querySelectorAll('.result-card') || [];
        cards.forEach(card => {
            const uid = card.dataset.uid;
            const checked = this.selectedItems.has(uid);
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
            const uid = checkbox.dataset.uid;
            const isSelected = this.selectedItems.has(uid);
            checkbox.checked = isSelected;

            // Update card visual state
            const card = checkbox.closest('.result-card');
            if (card) {
                card.classList.toggle('selected', isSelected);
            }
        });
    }


    /**
 * Cập nhật Range thông qua kết nối Start và End
 */
    toggleRangeSelection(startUid, endUid, targetState) {
        if (!this.items) return;
        const uids = this.items.map(it => (it.type === 'mold' ? 'M_' : 'C_') + (it.type === 'mold' ? it.MoldID : it.CutterID));
        const startIdx = uids.indexOf(startUid);
        const endIdx = uids.indexOf(endUid);

        if (startIdx === -1 || endIdx === -1) return;

        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);

        for (let i = min; i <= max; i++) {
            if (targetState) {
                this.selectedItems.add(uids[i]);
            } else {
                this.selectedItems.delete(uids[i]);
            }
        }

        this.updateCheckboxes();
        if (this.onSelectionChange) {
            this.onSelectionChange(Array.from(this.selectedItems));
        }
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

        const statusStr = String(latest.Status || latest.Action || '').trim();
        let extractedDest = '';
        const parenMatch = statusStr.match(/^(.*?)\s*[\(\（](.*?)[\)\）]$/);
        if (parenMatch) {
            extractedDest = parenMatch[2].trim();
        } else if (statusStr.toUpperCase().startsWith('OUT ') && statusStr.length > 4) {
            extractedDest = statusStr.substring(4).trim();
        }

        let outDestName = extractedDest || latest.DestinationName || latest.DestName || latest.Destination || '';
        if (!outDestName) {
            const destId = latest.DestinationID || latest.OutDestinationID || latest.Destination || item.OutDestinationID || item.DestinationID || '';
            if (destId && window.DataManager) {
                let dests = [];
                if (window.DataManager.data && window.DataManager.data.destinations) dests = window.DataManager.data.destinations;
                else if (window.DataManager.destinations) dests = window.DataManager.destinations;
                else if (window.DataManager.getData) dests = window.DataManager.getData('destinations') || [];
                else if (window.db_destinations) dests = window.db_destinations;

                const d = dests.find(x => String(x.DestinationID) === String(destId));
                if (d) outDestName = d.DestinationName || d.DestinationShortName || destId;
                else outDestName = destId;
            }
        }

        return {
            status: latest.Status || null,
            date: latest.Timestamp || null,
            notes: latest.Notes || '',
            outDestName: outDestName
        };
    }

    /**
     * Lấy thông tin vị trí dạng RackID-RackLayerNumber hoặc tên Công ty bảo quản
     */
    getRackLocation(item) {
        // Logic tối ưu nhất: Nhận diện External trực tiếp từ thuộc tính phân giải của SearchModule
        const isExternal = item.displayStorageCompanyClass === 'external' ||
            (item.KeeperCompany && String(item.KeeperCompany) !== '1' && String(item.KeeperCompany) !== '2');

        const cName = item.displayStorageCompany || item.keeperCompanyInfo?.CompanyShortName || item.keeperCompanyInfo?.CompanyName || item.KeeperCompany || '';

        if (isExternal && cName && cName.toUpperCase() !== 'YSD') {
            return {
                display: `Tại: ${cName}`,
                rackId: null,
                layerNum: null,
                rackLayerId: null,
                isExternal: true,
                externalName: cName
            };
        }

        if (!window.DataManager || !window.DataManager.data) {
            return { display: '-', rackId: null, layerNum: null, isExternal: false };
        }

        const rackLayerId = item.RackLayerID;
        if (!rackLayerId) {
            return { display: '-', rackId: null, layerNum: null, isExternal: false };
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
        const rackLocationStr = rack?.RackLocation || item?.displayRackLocation || item?.displayLocation || '-';

        return {
            display: `${rackName}-${layerNum}`,
            rackId: rackId,
            layerNum: layerNum,
            rackLayerId: rackLayerId,
            rackLocationStr: rackLocationStr
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

// Bắt sóng mcs-data-sync cập nhật nháy DOM (V10)
document.addEventListener('mcs-data-sync', function (e) {
    var d = e.detail;
    if (!d || !d.payload) return;

    // Phép vá: Nếu bảng là log (statuslogs, teflonlog) thì idValue là StatusLogID, nhưng Card sử dụng MoldID
    var targetMoldId = d.payload.MoldID || d.payload.CutterID || d.idValue;
    if (!targetMoldId) return;

    var card = document.querySelector('.result-card[data-id="' + targetMoldId + '"]');
    if (!card) return;

    if (d.payload.Status) {
        var badge = card.querySelector('.status-badge');
        if (badge) {
            badge.innerText = d.payload.Status === 'IN' ? '入庫 IN' : (d.payload.Status === 'OUT' ? '出庫 OUT' : (d.payload.Status === 'RETURNED' ? '返却' : '棚卸 AUDIT'));
            var statusClassRaw = String(d.payload.Status).toLowerCase();
            var badgeClass = 'neutral';
            if (statusClassRaw === 'in' || statusClassRaw === 'ok') badgeClass = 'active';
            else if (statusClassRaw === 'out' || statusClassRaw === 'ng') badgeClass = 'error';
            else if (statusClassRaw === 'returned' || statusClassRaw === 'warning') badgeClass = 'warning';
            else if (statusClassRaw === 'audit') badgeClass = 'info';

            // Clean các class active, error, warning... cũ và nạp class mới
            badge.className = 'meta-item status status-badge ' + badgeClass;

            // Effect nháy chớp nhoáng xịn
            badge.style.transform = 'scale(1.2)';
            badge.style.boxShadow = '0 0 12px rgba(16, 185, 129, 0.6)';
            setTimeout(() => { badge.style.transform = 'scale(1)'; badge.style.boxShadow = ''; }, 300);
        }
    }
});

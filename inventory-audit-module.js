// v9.0.2
/**

 * inventory-audit-module.js

 * Version: 9.0.1

 * Last updated: 2026-04-20

 * Change: Architecture V3.1 — Optimize Modals, silent quota handlers

 */



(function () {

    class InventoryAuditModule {

        constructor() {

            this.modal = null;

            this.inputEl = null;



            // Session State (V3.0)

            this.sessionConfig = null;

            this.sourceData = [];

            this.activeSession = null;



            this.syncTimer = null;

            this.isLocalStorageFull = false;



            // Audio Context for beeps

            try { window.AudioContext = window.AudioContext || window.webkitAudioContext; } catch (e) { }

        }



        init() {

            this.bindTriggers();

            // Auto check for existing active session on boot

            setTimeout(() => this.checkOfflineState(), 1000);

        }



        bindTriggers() {

            const sidebarBtn = document.getElementById('sidebarInventoryAuditBtn');

            if (sidebarBtn) {

                sidebarBtn.addEventListener('click', (e) => {

                    e.preventDefault();

                    this.startWorkflow();

                    const sb = document.getElementById('sidebar');

                    if (sb && window.innerWidth <= 768) {

                        sb.classList.remove('open');

                        const backdrop = document.getElementById('backdrop');

                        if (backdrop) backdrop.classList.remove('show');

                    }

                });

            }



            const topBtn = document.getElementById('topInventoryAuditBtn');

            if (topBtn) {

                topBtn.addEventListener('click', (e) => {

                    e.preventDefault();

                    this.startWorkflow();

                });

            }

        }



        // --- 1. ENTRY POINT ---

        startWorkflow() {

            // First logic: Build sourceData to understand what we're auditing

            this.sourceData = [];



            // 1. Data Selection via CrossRef Checkbox UUIDs

            if (window.selectedCodes && window.selectedCodes.length > 0 && window.app && window.app.filteredItems) {

                this.sourceData = window.app.filteredItems.filter(item => {

                    const id = String(item.type === 'mold' ? item.MoldID : item.CutterID);

                    const uid = (item.type === 'mold' ? 'M_' : 'C_') + id;

                    return window.selectedCodes.includes(id) || window.selectedCodes.includes(uid);

                });

            } else if (window.app && typeof window.app.getSelectedItems === 'function') {

                const selected = window.app.getSelectedItems();

                if (selected && selected.length > 0) {

                    this.sourceData = selected;

                }

            }



            // 2. Fallback to Full Filtered Data

            let isFullFilter = false;

            if (this.sourceData.length === 0) {

                if (window.app && window.app.filteredItems && window.app.filteredItems.length > 0) {

                    this.sourceData = window.app.filteredItems;

                    isFullFilter = true;

                } else if (window.filterData && window.filterData.length > 0) {

                    this.sourceData = window.filterData;

                    isFullFilter = true;

                } else if (window.currentData && window.currentData.length > 0) {

                    this.sourceData = window.currentData;

                    isFullFilter = true;

                } else if (window.moldsData && window.moldsData.length > 0) {

                    this.sourceData = window.moldsData;

                    isFullFilter = true;

                }

            }



            if (this.sourceData.length === 0) {

                alert("リストが空です！\n\nDanh sách đang trống!");

                return;

            }



            // Detect db max to prevent empty filter

            let maxDbSize = 0;

            if (window.app && window.app.allItems && window.app.allItems.length > 0) {

                maxDbSize = window.app.allItems.length;

            } else if (window.moldsData) {

                maxDbSize = window.moldsData.length;

            }



            // Chặn việc kiểm kê khi không có bộ lọc 

            if (isFullFilter && maxDbSize > 0 && this.sourceData.length >= maxDbSize) {

                alert("絞り込み必須：リスト全体をそのまま棚卸することはできません。先に検索またはフィルタリングを行ってください。\n\nBẮT BUỘC LỌC DỮ LIỆU: Không thể kiểm kê toàn bộ dữ liệu gốc chưa qua tìm kiếm. Vui lòng áp dụng TÌM KIẾM hoặc LỌC để thu hẹp phạm vi trước khi ấn Kiểm Kê!");

                return;

            }



            // Safety Confirm for large lists

            if (isFullFilter && this.sourceData.length > 2000) {

                if (!confirm(`警告：リストが大きすぎます (${this.sourceData.length} 件)。一括監査セッションを作成してもよろしいですか？\n\nCẢNH BÁO: Danh sách quá lớn (${this.sourceData.length} thiết bị). Có chắc chắn muốn lập phiên kiểm kê dồn?`)) return;

            }



            // ĐÃ BỎ thông báo xác nhận phiền phức. 
            // Quy tắc mới: Nếu có tick chọn -> dùng tick chọn. Nếu không -> dùng toàn bộ list lọc.

            // Auto Detect Format (Mold or Cutter)

            const sniff = this.sourceData[0];

            const detectedType = sniff.type === 'cutter' ? 'cutter' : 'mold';



            const defaultDate = new Date().toISOString().split('T')[0];



            this.sessionConfig = {

                itemType: detectedType,

                suggestedName: `棚卸 (${detectedType === 'cutter' ? '抜型' : '金型'}) ${defaultDate}`,

                users: window.usersData || [{ ID: '1', Name: 'Admin' }],

                currentUser: window.currentUser || { ID: '1', Name: 'User' }

            };



            this.renderSetupScreen();

        }



        // --- 2. SETUP SCREEN ---

        renderSetupScreen() {

            if (this.modal) this.modal.remove();



            this.modal = document.createElement('div');

            this.modal.className = 'audit-modal-overlay';



            const userOptions = this.sessionConfig.users.map(u =>

                `<option value="${u.ID}" ${u.ID == this.sessionConfig.currentUser.ID ? 'selected' : ''}>${u.Name || u.EmployeeName}</option>`

            ).join('');



            this.modal.innerHTML = `

                <div class="audit-setup-card">

                    <div class="audit-setup-header">

                        <i class="fas fa-clipboard-list" style="font-size:24px; color: var(--ui-accent, #0A5C56);"></i>

                        <h2>棚卸セッションの作成<br><span style="font-size:14px; opacity:0.8">Tạo Phiên Kiểm Kê Mới</span></h2>

                    </div>

                    <div class="audit-setup-body">

                        <div class="setup-group">

                            <label>セッション名 (Tên Phiên):</label>

                            <input type="text" id="setupSessionName" value="${this.sessionConfig.suggestedName}" class="setup-input" autocomplete="off">

                        </div>

                        <div class="setup-group">

                            <label>対象範囲 (Scope):</label>

                            <div class="setup-scope-pill">

                                <strong>${this.sourceData.length}</strong> thiết bị (${this.sessionConfig.itemType === 'mold' ? '金型' : '抜型'})

                            </div>

                        </div>

                        <div class="setup-group">

                            <label>担当者 (Người thực hiện):</label>

                            <select id="setupEmployeeId" class="setup-input">

                                ${userOptions}

                            </select>

                        </div>

                        <div class="setup-group">

                            <label>入力方法 (Phương thức Nhập liệu):</label>

                            <div class="setup-method-tiles">

                                <div class="method-tile active" data-method="MANUAL">

                                    <i class="fas fa-keyboard"></i>

                                    <span>手入力<br><small>(Gõ tay - Có gợi ý)</small></span>

                                </div>

                                <div class="method-tile" data-method="SCANNER">

                                    <i class="fas fa-barcode"></i>

                                    <span>バーコード<br><small>(Súng quét - Nhanh)</small></span>

                                </div>

                            </div>

                        </div>

                    </div>

                    <div class="audit-setup-footer">

                        <button class="audit-btn-text" id="setupCancelBtn">キャンセル (Hủy)</button>

                        <button class="audit-btn-primary" id="setupStartBtn">開始 (Bắt đầu)</button>

                    </div>

                </div>

            `;

            document.body.appendChild(this.modal);



            let selectedMethod = 'MANUAL';

            const tiles = this.modal.querySelectorAll('.method-tile');

            tiles.forEach(t => {

                t.addEventListener('click', () => {

                    tiles.forEach(tt => tt.classList.remove('active'));

                    t.classList.add('active');

                    selectedMethod = t.dataset.method;

                });

            });



            this.modal.querySelector('#setupCancelBtn').addEventListener('click', () => this.close());



            this.modal.querySelector('#setupStartBtn').addEventListener('click', () => {

                const sessName = this.modal.querySelector('#setupSessionName').value.trim() || this.sessionConfig.suggestedName;

                const empId = this.modal.querySelector('#setupEmployeeId').value;

                this.createNewActiveSession(sessName, empId, selectedMethod);

            });

        }



        // --- 3. SESSION / LOCALSTORAGE CORE ---

        createNewActiveSession(name, empId, method) {

            const now = new Date();

            const sid = `AUDIT_${now.getTime()}_${Math.floor(Math.random() * 1000)}`;



            const scopeItemIds = this.sourceData.map(t => this.sessionConfig.itemType === 'mold' ? t.MoldID : t.CutterID).filter(Boolean);



            this.activeSession = {

                sessionId: sid,

                sessionName: name,

                sessionMode: "CHECKLIST",

                inputMethod: method,

                employeeId: empId,

                startedAt: now.toISOString(),

                targetRackId: null, // Reserved for Mode 2

                sourceScope: {

                    type: "SELECTED",

                    itemType: this.sessionConfig.itemType,

                    itemIds: scopeItemIds

                },

                scanned: {}, // K: ID -> V: { scannedAt, result, expectedRackLayer, actualRackLayer, relocated, synced }

                lastSyncAt: null

            };



            this.persistSession();

            this.renderWorkspace();

        }



        persistSession() {

            if (this.activeSession) {

                if (this.isLocalStorageFull) return; // Không cố lưu nếu đã biết đầy

                try {

                    localStorage.setItem("audit_session_active", JSON.stringify(this.activeSession));

                } catch (e) {

                    console.error("Quota exceeded saving active session", e);

                    try {

                        localStorage.removeItem("audit_session_history");

                        localStorage.setItem("audit_session_active", JSON.stringify(this.activeSession));

                    } catch (e2) {

                        this.isLocalStorageFull = true;

                        if (window.notify && typeof window.notify.warning === 'function') {
                            window.notify.warning("Cache đầy! Lưu Offline tạm dừng. Vẫn kiểm kê bình thường.");
                        } else {
                            console.warn("Storage Quota Exceeded. Offline save disabled, memory only.");
                        }

                    }

                }

            } else {

                try {

                    localStorage.removeItem("audit_session_active");

                    this.isLocalStorageFull = false;

                } catch(e) {}

            }

        }



        checkOfflineState() {

            try {

                const stored = localStorage.getItem("audit_session_active");

                if (stored) {

                    const parsed = JSON.parse(stored);

                    if (parsed && parsed.sessionId) {

                        const totalScanned = Object.keys(parsed.scanned || {}).length;

                        if (confirm(`未完了の棚卸セッションが見つかりました：[${parsed.sessionName}]（${totalScanned} 件スキャン済み）。\n再開しますか？\n\nTìm thấy phiên kiểm kê dở dang: [${parsed.sessionName}] với ${totalScanned} mục đã quét.\nTiếp tục phiên này hay Xóa bỏ?`)) {

                            this.activeSession = parsed;

                            // Need to reconstruct sourceData from itemIds...

                            // If window.app.filteredItems is gone, we might need a fetch, but for MVP let's rebuild from DataManager if possible

                            this.reconstructSourceData();

                        } else {

                            localStorage.removeItem("audit_session_active");

                        }

                    }

                }

            } catch (e) {

                console.error("Local storage decode error", e);

            }

        }



        reconstructSourceData() {

            const rawData = this.activeSession.sourceScope.itemType === 'mold'

                ? (window.DataManager?.data?.molds || window.moldsData || [])

                : (window.DataManager?.data?.cutters || window.moldsData || []);



            const allowedIds = new Set(this.activeSession.sourceScope.itemIds.map(String));

            this.sourceData = rawData.filter(t => allowedIds.has(String(this.activeSession.sourceScope.itemType === 'mold' ? t.MoldID : t.CutterID)));



            if (this.sourceData.length === 0) {

                alert("元のデータが削除されたか、まだロードされていません。このセッションはキャンセルされます。\n\nDữ liệu gốc đã bị xóa hoặc chưa tải xong. Phiên này sẽ bị hủy.");

                this.activeSession = null;

                this.persistSession();

                return;

            }

            this.renderWorkspace();

        }



        // --- 4. WORKSPACE RENDERER (V3 Responsive) ---

        renderWorkspace() {

            if (this.modal) this.modal.remove();



            this.modal = document.createElement('div');

            this.modal.className = 'audit-workspace-overlay';



            const totalItems = this.activeSession.sourceScope.itemIds.length;

            const auditedCount = Object.keys(this.activeSession.scanned).length;



            this.modal.innerHTML = `

                <div class="aw-header">

                    <div class="aw-header-info">

                        <i class="fas fa-clipboard-check"></i>

                        <span class="sess-name">${this.activeSession.sessionName}</span>

                    </div>

                    <!-- Toggle Nhập liệu V3 -->

                    <div class="aw-method-toggle" id="awMethodToggle" title="Chuyển chế độ thiết bị">

                        <div class="amt-slider ${this.activeSession.inputMethod === 'SCANNER' ? 'scanner' : 'manual'}"></div>

                        <div class="amt-label manual">手入力</div>

                        <div class="amt-label scanner">バーコード</div>

                    </div>

                    <button class="aw-close" title="Tạm thoát"><i class="fas fa-times"></i></button>

                </div>



                <div class="aw-body">

                    <!-- Left / Top: Input Panel -->

                    <div class="aw-panel-input">

                        <div class="aw-input-wrapper">

                            <input type="text" id="awScannerInput" placeholder="${this.activeSession.inputMethod === 'SCANNER' ? '... バーコード ...' : '入力 (Gõ mã) ...'}" autocomplete="off" autocorrect="off">

                            <div class="aw-autocomplete" id="awAutocomplete"></div>

                        </div>

                        <div class="aw-status-badge" id="awStatusBadge">待機中 (Đang chờ)</div>

                        

                        <!-- Offline Queue Panel -->

                        <div class="aw-sync-panel">

                            <div class="aw-sync-stats">

                                <div><strong>${auditedCount}</strong> / ${totalItems} <span>完了 (Xong)</span></div>

                                <div id="awUnsyncedCount" style="color:var(--ui-accent);">0 <span>未同期 (Chờ Sync)</span></div>

                            </div>

                            <button id="awSyncBtn" class="audit-btn-primary">

                                <i class="fas fa-wifi" id="awWifiIcon"></i> 同期する (Đồng bộ)

                            </button>

                            <button id="awEndBtn" class="audit-btn-danger" style="margin-top:10px;">

                                セッション終了 (Kết thúc)

                            </button>

                        </div>

                    </div>



                    <!-- Right / Bottom: List Panel -->

                    <div class="aw-panel-list">

                        <!-- Mobile Tabs -->

                        <div class="aw-mobile-tabs">

                            <button class="aw-tab active" data-tab="input" style="display:none;">入力</button>

                            <button class="aw-tab" data-tab="list">リスト (Còn ${totalItems - auditedCount})</button>

                            <button class="aw-tab" data-tab="done">完了 (${auditedCount})</button>

                        </div>

                        <div class="aw-list-scroll" id="awListContent">

                            <!-- Injected by renderRows -->

                        </div>

                    </div>

                </div>

            `;

            document.body.appendChild(this.modal);



            this.inputEl = this.modal.querySelector('#awScannerInput');

            this.statusBadge = this.modal.querySelector('#awStatusBadge');

            this.autocompleteBox = this.modal.querySelector('#awAutocomplete');

            this.listEl = this.modal.querySelector('#awListContent');

            this.syncBtn = this.modal.querySelector('#awSyncBtn');

            this.wifiIcon = this.modal.querySelector('#awWifiIcon');



            this.updateSyncCounter();

            this.renderRows();



            this.modal.querySelector('.aw-close').addEventListener('click', () => this.close(false));

            this.modal.querySelector('#awEndBtn').addEventListener('click', () => this.endSession());



            // Toggle Events

            this.modal.querySelector('#awMethodToggle').addEventListener('click', () => {

                this.activeSession.inputMethod = this.activeSession.inputMethod === 'SCANNER' ? 'MANUAL' : 'SCANNER';

                this.persistSession();

                this.renderWorkspace(); // fast refresh

            });



            // Input events

            this.inputEl.focus();

            document.addEventListener('click', this.handleDocumentClick.bind(this));

            this.inputEl.addEventListener('input', this.handleInput.bind(this));

            this.inputEl.addEventListener('keydown', this.handleKeydown.bind(this));



            this.syncBtn.addEventListener('click', () => this.executeDeltaSync());



            // Mobile Tabs

            const tabs = this.modal.querySelectorAll('.aw-tab');

            tabs.forEach(t => t.addEventListener('click', () => {

                tabs.forEach(tt => tt.classList.remove('active'));

                t.classList.add('active');

                this.modal.dataset.viewTab = t.dataset.tab;

                if (t.dataset.tab === 'input') {

                    // Mobile auto-focus when back to scan

                    if (window.innerWidth <= 768) {

                        setTimeout(() => this.inputEl.focus(), 50);

                    }

                }

            }));

            this.modal.dataset.viewTab = window.innerWidth <= 768 ? 'input' : 'list';

        }



        renderRows() {

            // Sort: Audited push to bottom

            const sorted = [...this.sourceData].sort((a, b) => {

                const aId = String(this.activeSession.sourceScope.itemType === 'mold' ? a.MoldID : a.CutterID);

                const bId = String(this.activeSession.sourceScope.itemType === 'mold' ? b.MoldID : b.CutterID);

                const aAud = !!this.activeSession.scanned[aId];

                const bAud = !!this.activeSession.scanned[bId];

                if (aAud === bAud) return 0;

                return aAud ? 1 : -1;

            });



            this.listEl.innerHTML = sorted.map(t => {

                const id = String(this.activeSession.sourceScope.itemType === 'mold' ? t.MoldID : t.CutterID);

                const code = this.activeSession.sourceScope.itemType === 'mold' ? (t.MoldCode || '') : (t.CutterNo || '');

                const name = this.activeSession.sourceScope.itemType === 'mold' ? (t.MoldName || '') : (t.CutterName || '');

                const audited = this.activeSession.scanned[id];



                // Trợ năng Helper formatRackLayerLabel

                const layer = t.RackLayerID ? this.formatRackLayerLabel(t.RackLayerID) : '(Chưa lưu kho)';



                return `

                <div class="aw-list-row ${audited ? 'checked' : ''}" id="aw-row-${id}">

                    <div class="aw-row-main">

                        <div class="aw-row-code">${code}</div>

                        <div class="aw-row-name">${name}</div>

                        <div class="aw-row-loc"><i class="fas fa-map-marker-alt"></i> ${layer}</div>

                    </div>

                    <div class="aw-row-icon">

                        ${audited

                        ? `<i class="fas fa-check-circle" style="color:#10b981;"></i>`

                        : `<i class="fas fa-circle" style="color:#e2e8f0;"></i>`

                    }

                    </div>

                </div>`;

            }).join('');

        }



        formatRackLayerLabel(rackLayerId) {

            if (!rackLayerId) return '';

            const cStr = String(rackLayerId);

            if (cStr.length === 3) {

                return `Kệ ${cStr.substring(0, 2)} — Tầng ${cStr.substring(2, 3)}`;

            } else if (cStr.length === 4) {

                return `Kệ ${cStr.substring(0, 3)} — Tầng ${cStr.substring(3, 4)}`;

            }

            return `Tầng ${cStr}`;

        }



        updateSyncCounter() {

            let unsynced = 0;

            for (const key in this.activeSession.scanned) {

                if (!this.activeSession.scanned[key].synced) unsynced++;

            }

            const el = this.modal.querySelector('#awUnsyncedCount');

            if (el) el.innerHTML = `${unsynced} <span>Chờ đồng bộ</span>`;



            if (this.syncBtn) {

                this.syncBtn.disabled = unsynced === 0;

                this.syncBtn.style.opacity = unsynced === 0 ? '0.5' : '1';

                this.wifiIcon.className = 'fas fa-wifi';

            }

        }



        // --- 5. LOGIC CHÍNH & CHỐNG TRÙNG ---

        handleInput(e) {

            let val = e.target.value.trim().toUpperCase();



            // Súng quét / Gõ tay QR Prefixes Interception

            if (val.startsWith('YSD_MOLD:') || val.startsWith('YSD_CUT:') || val.startsWith('YSD_RL:')) {

                // If it's a rack QR in Checklist Mode, skip for now

                if (val.startsWith('YSD_RL:')) {

                    this.setStatus('warning', 'QR Kệ chỉ hỗ trợ ở Mode Blind Rack!');

                    this.beep(500, 200);

                    e.target.value = '';

                    return;

                }

                const parts = val.split(':');

                val = parts[parts.length - 1]; // Strip prefix

            }



            if (this.activeSession.inputMethod === 'SCANNER') {

                this.autocompleteBox.style.display = 'none';

                return; // Scanner mode completely disables autocomplete for performance

            }



            if (val.includes('-')) {

                if (this.inputEl.getAttribute('inputmode') !== 'numeric') this.inputEl.setAttribute('inputmode', 'numeric');

            } else {

                this.inputEl.removeAttribute('inputmode');

            }



            if (val.length < 2) {

                this.autocompleteBox.style.display = 'none';

                return;

            }



            // Autocomplete Layer Manual Mode Only

            const matches = this.sourceData.filter(x => {

                const id = String(this.activeSession.sourceScope.itemType === 'mold' ? x.MoldID : x.CutterID);

                const code = String(this.activeSession.sourceScope.itemType === 'mold' ? x.MoldCode : x.CutterNo).toUpperCase();

                return !this.activeSession.scanned[id] && code.includes(val);

            });



            if (matches.length > 0) {

                this.autocompleteBox.innerHTML = matches.slice(0, 5).map(m => {

                    const code = String(this.activeSession.sourceScope.itemType === 'mold' ? m.MoldCode : m.CutterNo);

                    const name = String(this.activeSession.sourceScope.itemType === 'mold' ? m.MoldName : m.CutterName);

                    return `<div class="aw-suggest-item" data-code="${code}">

                                <span>${code}</span>

                                <small>${name}</small>

                            </div>`;

                }).join('');

                this.autocompleteBox.style.display = 'block';



                this.autocompleteBox.querySelectorAll('.aw-suggest-item').forEach(el => {

                    el.addEventListener('click', () => this.processCode(el.dataset.code));

                });

            } else {

                this.autocompleteBox.style.display = 'none';

            }

        }



        handleKeydown(e) {

            if (e.key === 'Enter') {

                e.preventDefault();

                let val = this.inputEl.value.trim().toUpperCase();

                // Check Prefix Strip inside Enter incase fast scanner pastes it natively

                if (val.startsWith('YSD_MOLD:') || val.startsWith('YSD_CUT:')) {

                    const parts = val.split(':');

                    val = parts[parts.length - 1];

                }

                this.processCode(val);

            }

        }



        processCode(codeOrId) {

            if (!codeOrId) return;

            this.inputEl.value = '';

            this.autocompleteBox.style.display = 'none';



            // Find target (could be Code or ID, QR usually carries ID)

            const target = this.sourceData.find(x => {

                const id = String(this.activeSession.sourceScope.itemType === 'mold' ? x.MoldID : x.CutterID);

                const code = String(this.activeSession.sourceScope.itemType === 'mold' ? x.MoldCode : x.CutterNo).toUpperCase();

                return code === codeOrId || id === codeOrId; // QR code will match ID

            });



            if (target) {

                const id = String(this.activeSession.sourceScope.itemType === 'mold' ? target.MoldID : target.CutterID);

                const code = String(this.activeSession.sourceScope.itemType === 'mold' ? target.MoldCode : target.CutterNo);



                if (this.activeSession.scanned[id]) {

                    // Cảnh Báo Trùng Lặp Nội Bộ (Client Duplicate Logic)

                    this.setStatus('warning', `重複：既に ${code} をスキャン済 / Trùng Lặp: Đã quét ${code} rồi!`);

                    this.beep(400, 100);

                    this.beep(400, 100, 150);

                } else {

                    // Passed -> Log Result

                    this.activeSession.scanned[id] = {

                        scannedAt: new Date().toISOString(),

                        result: "MATCH",

                        expectedRackLayer: target.RackLayerID || null,

                        actualRackLayer: null,

                        relocated: false,

                        synced: false // FLAGGED FOR DELTA

                    };



                    this.persistSession(); // Backup instantly to offline queue

                    this.setStatus('success', `✔ ${code} 有効 / Hợp lệ`);

                    this.beep(800, 150);



                    // Try to trigger UI Vibrate

                    if (navigator.vibrate) navigator.vibrate(50);



                    this.updateSyncCounter();



                    // Re-render specifically that row for performance, or full render

                    const row = this.modal.querySelector(`#aw-row-${id}`);

                    if (row) {

                        row.classList.add('checked');

                        const iconExt = row.querySelector('.aw-row-icon');

                        if (iconExt) iconExt.innerHTML = '<i class="fas fa-check-circle" style="color:#10b981;"></i>';

                    }



                    const els = this.modal.querySelectorAll('.aw-mobile-tabs .aw-tab');

                    const audited = Object.keys(this.activeSession.scanned).length;

                    const totalItems = this.activeSession.sourceScope.itemIds.length;



                    if (els[2]) els[2].innerHTML = `Đã kiểm (${audited})`;

                    if (els[1]) els[1].innerHTML = `Danh sách (Còn ${totalItems - audited})`;

                }

            } else {

                this.setStatus('error', `✖ 無効：コード ${codeOrId} はリストにありません！ / Khôn hợp lệ: Mã ${codeOrId} không có trong danh sách!`);

                this.beep(200, 400);

                if (navigator.vibrate) navigator.vibrate([100, 50, 100]); // Long vibrate error

            }

        }



        setStatus(type, msg) {

            this.statusBadge.className = 'aw-status-badge ' + type;

            this.statusBadge.textContent = msg;

            setTimeout(() => {

                this.statusBadge.className = 'aw-status-badge';

                this.statusBadge.textContent = '待機中 (Đang chờ)';

            }, 3000);

        }



        // --- 6. DELTA SYNC ENGINE (UTF-8, No 409) ---

        async executeDeltaSync() {

            // Find all unsynced items

            const deltaIds = [];

            for (const key in this.activeSession.scanned) {

                if (!this.activeSession.scanned[key].synced) {

                    deltaIds.push(key);

                }

            }



            if (deltaIds.length === 0) return;



            this.syncBtn.disabled = true;

            this.wifiIcon.className = 'fas fa-spinner fa-spin';



            const statusLogsPayload = deltaIds.map(id => {

                const scInfo = this.activeSession.scanned[id];

                return {

                    MoldID: this.activeSession.sourceScope.itemType === 'mold' ? id : '',

                    CutterID: this.activeSession.sourceScope.itemType === 'cutter' ? id : '',

                    ItemType: this.activeSession.sourceScope.itemType,

                    Status: 'AUDITED',

                    AuditType: 'CHECKLIST',

                    DestinationID: '', // explicitly blank

                    EmployeeID: this.activeSession.employeeId,

                    Notes: 'Kiểm kê theo danh sách',

                    AuditDate: scInfo.scannedAt,

                    SessionID: this.activeSession.sessionId,

                    SessionName: this.activeSession.sessionName,

                    SessionMode: 'checklist' // MVP Only

                };

            });



            try {

                // Execute exact API with strict UTF-8

                const res = await fetch('/api/audit-batch', {

                    method: 'POST',

                    headers: { 'Content-Type': 'application/json; charset=utf-8' },

                    body: JSON.stringify({

                        statusLogs: statusLogsPayload,

                        locationLogs: []

                    })

                });



                if (!res.ok) throw new Error('Offline or Network 500');

                const data = await res.json();



                if (data.success) {

                    // Mark True!

                    deltaIds.forEach(id => {

                        this.activeSession.scanned[id].synced = true;

                    });

                    this.activeSession.lastSyncAt = new Date().toISOString();

                    this.persistSession();

                    this.updateSyncCounter();



                    if (window.requestSilentUpdateMolds) window.requestSilentUpdateMolds();



                    this.wifiIcon.className = 'fas fa-check-circle'; // Complete feedback

                    setTimeout(() => {

                        if (this.wifiIcon) this.wifiIcon.className = 'fas fa-wifi';

                    }, 2000);

                } else {

                    throw new Error(data.error);

                }

            } catch (e) {

                console.error(e);

                alert("ネットワークエラーが発生しましたが、データはオフラインで保存されています。もう一度お試しください！\n\nLỗi mạng đồng bộ, dữ liệu vẫn được lưu Offine. Hãy thử lại!");

                this.wifiIcon.className = 'fas fa-times-circle'; // Error Red

                this.syncBtn.disabled = false;

            }

        }



        endSession() {

            const unsynced = Object.keys(this.activeSession.scanned).filter(k => !this.activeSession.scanned[k].synced).length;

            if (unsynced > 0) {

                alert(`ネットワークに同期されていないデータが ${unsynced} 件あります。終了する前に「同期する」ボタンを押してください。\n\nBạn còn ${unsynced} khuôn chưa đồng bộ lên mạng. Xin hãy Bấm Mạng Wifi Đồng Bộ trước khi kết thúc.`);

                return;

            }



            if (confirm("セッションを終了してもよろしいですか？履歴は保存されますが、これ以上スキャンすることはできません。\n\nChắc chắn kết thúc phiên? Lịch sử sẽ lưu lại nhưng bạn không thể quét thêm.")) {

                // Clear active

                localStorage.removeItem("audit_session_active");

                // Render Print Final Report UI via custom popup

                this.renderFinalReport();

            }

        }



        renderFinalReport() {

            if (this.modal) this.modal.remove();



            const auditedItems = Object.keys(this.activeSession.scanned);



            // Build simple Print DOM

            this.modal = document.createElement('div');

            this.modal.className = 'audit-modal-overlay';

            this.modal.innerHTML = `

                <div class="audit-setup-card printable-report">

                    <h2 style="text-align:center; padding: 20px;">棚卸レポート<br><span style="font-size:16px;">Báo Cáo Kiểm Kê</span></h2>

                    <table style="width:100%; border-collapse: collapse; text-align: left;">

                        <tr><th style="padding: 8px; border-bottom: 2px solid #ccc;">セッション (Session)</th><td style="padding: 8px;">${this.activeSession.sessionName}</td></tr>

                        <tr><th style="padding: 8px; border-bottom: 2px solid #ccc;">総数 (Tổng)</th><td style="padding: 8px;">${this.activeSession.sourceScope.itemIds.length} 件</td></tr>

                        <tr><th style="padding: 8px; border-bottom: 2px solid #ccc;">スキャン済 (Đã quét)</th><td style="padding: 8px; color: #10b981; font-weight:bold;">${auditedItems.length} (✔)</td></tr>

                        <tr><th style="padding: 8px; border-bottom: 2px solid #ccc;">状態 (Trạng Thái)</th><td style="padding: 8px;">完了 - 保存済み (Hoàn tất)</td></tr>

                    </table>

                    <div style="margin-top: 20px; text-align:center;">

                        <button class="audit-btn-primary" onclick="window.print()">

                            <i class="fas fa-print"></i> 印刷 (In Báo Cáo)

                        </button>

                        <button class="audit-btn-text" id="reportCloseBtn">閉じる (Thoát)</button>

                    </div>

                </div>

            `;

            document.body.appendChild(this.modal);

            this.modal.querySelector('#reportCloseBtn').addEventListener('click', () => {

                this.modal.remove();

                this.activeSession = null;

            });

        }



        beep(freq, duration, delay = 0) {

            if (!window.AudioContext) return;

            setTimeout(() => {

                try {

                    const ctx = new (window.AudioContext)();

                    const osc = ctx.createOscillator();

                    const gain = ctx.createGain();

                    osc.connect(gain);

                    gain.connect(ctx.destination);

                    osc.type = 'sine';

                    osc.frequency.value = freq;

                    gain.gain.setValueAtTime(0.1, ctx.currentTime);

                    osc.start();

                    setTimeout(() => osc.stop(), duration);

                } catch (e) { }

            }, delay);

        }



        handleDocumentClick(e) {

            if (!this.modal) return;

            if (this.inputEl && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A' && !e.target.closest('.aw-method-toggle')) {

                setTimeout(() => this.inputEl.focus(), 10);

            }

        }



        close(force = true) {

            if (this.modal) {

                this.modal.remove();

                this.modal = null;

            }

            document.removeEventListener('click', this.handleDocumentClick);

        }

    }



    window.InventoryAudit = new InventoryAuditModule();

    document.addEventListener('DOMContentLoaded', () => window.InventoryAudit.init());

})();


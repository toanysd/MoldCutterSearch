// v10.0.0-PubSub
/* global-history-module.js */

(function () {

    'use strict';



    window.GlobalHistoryModule = {

        init: function () {

            this.container = document.getElementById('mcs-view-history');

            if (!this.container) return;



            this.lastCheckKey = 'mcs_history_last_checked';

            this.notificationBadge = document.getElementById('historyNavBadge');

            this.filterStatus = 'all';



            // Build UI framework

            this.container.innerHTML = `

                <div class="history-module-container" style="padding-top: 8px;">

                    <!-- Hidden inputs for backward JS compatibility -->

                    <input type="hidden" id="historySearchInput" class="history-search-input">



                    <div class="history-stats" style="flex-wrap: wrap;">
                            <div class="history-stat-card history-stat-active" data-filter="all" style="padding: 4px 8px; min-width: 80px;">
                                <div class="history-stat-icon" style="background:var(--mcs-slate-500, #64748b);color:#fff; width:24px; height:24px; font-size:12px;"><i class="fas fa-layer-group"></i></div>
                                <div><div class="history-stat-label">総 / Tổng</div><div class="history-stat-value" id="hsStatTotal" style="font-size:11px; font-weight:700; line-height:1;">0</div></div>
                            </div>
                            <div class="history-stat-card" data-filter="Status" style="padding: 4px 8px; min-width: 80px;">
                                <div class="history-stat-icon" style="background:var(--mcs-primary, #4f46e5);color:#fff; width:24px; height:24px; font-size:12px;"><i class="fas fa-clipboard-check"></i></div>
                                <div><div class="history-stat-label">状 / Status</div><div class="history-stat-value" id="hsStatStatus" style="font-size:11px; font-weight:700; line-height:1;">0</div></div>
                            </div>
                            <div class="history-stat-card" data-filter="Location" style="padding: 4px 8px; min-width: 80px;">
                                <div class="history-stat-icon" style="background:var(--mcs-success, #16a34a);color:#fff; width:24px; height:24px; font-size:12px;"><i class="fas fa-map-marker-alt"></i></div>
                                <div><div class="history-stat-label">場所 / Loc</div><div class="history-stat-value" id="hsStatLocation" style="font-size:11px; font-weight:700; line-height:1;">0</div></div>
                            </div>
                            <div class="history-stat-card" data-filter="Ship" style="padding: 4px 8px; min-width: 80px;">
                                <div class="history-stat-icon" style="background:var(--mcs-warning, #f59e0b);color:#fff; width:24px; height:24px; font-size:12px;"><i class="fas fa-truck"></i></div>
                                <div><div class="history-stat-label">出荷 / Ship</div><div class="history-stat-value" id="hsStatShip" style="font-size:11px; font-weight:700; line-height:1;">0</div></div>
                            </div>
                            <div class="history-stat-card" data-filter="Teflon" style="padding: 4px 8px; min-width: 80px;">
                                <div class="history-stat-icon" style="background:var(--mcs-danger, #ef4444);color:#fff; width:24px; height:24px; font-size:12px;"><i class="fas fa-spray-can"></i></div>
                                <div><div class="history-stat-label">テ / Tef</div><div class="history-stat-value" id="hsStatTeflon" style="font-size:11px; font-weight:700; line-height:1;">0</div></div>
                            </div>
                            <div class="history-stat-card" data-filter="Comment" style="padding: 4px 8px; min-width: 80px;">
                                <div class="history-stat-icon" style="background:var(--mcs-info, #0ea5e9);color:#fff; width:24px; height:24px; font-size:12px;"><i class="fas fa-comment-dots"></i></div>
                                <div><div class="history-stat-label">メ / Note</div><div class="history-stat-value" id="hsStatComment" style="font-size:11px; font-weight:700; line-height:1;">0</div></div>
                            </div>

                            <div style="display: flex; gap: 4px; margin-left: auto; align-items: center; background: #f1f5f9; padding: 4px; border-radius: 8px;">
                                <button class="history-btn-date" data-date="today" style="border:none; padding:4px 8px; border-radius:4px; font-size:12px; font-weight:600; cursor:pointer;">今日</button>
                                <button class="history-btn-date active" data-date="2days" style="border:none; padding:4px 8px; border-radius:4px; font-size:12px; font-weight:600; cursor:pointer; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,0.1);">2日間</button>
                                <button class="history-btn-date" data-date="7days" style="border:none; padding:4px 8px; border-radius:4px; font-size:12px; font-weight:600; cursor:pointer;">7日間</button>
                                <button class="history-btn-date" data-date="all" style="border:none; padding:4px 8px; border-radius:4px; font-size:12px; font-weight:600; cursor:pointer;">全て</button>
                                <input type="date" id="historyCustomDate" style="display: none; padding: 2px 4px; border:1px solid #cbd5e1; border-radius:4px; font-size:12px;" />
                            </div>

                            <div style="display: flex; gap: 8px; margin-left: 12px; height: 36px; align-items: center;">
                                <button id="historyMarkAllBtn" class="history-btn" title="Đánh dấu tất cả đã đọc" style="display: none;"><i class="fas fa-check-double"></i></button>
                                <button id="historyPrintBtn" class="history-btn desktop-only" title="In / Print" style="height: 100%;"><i class="fas fa-print"></i></button>
                                <button id="historyExportBtn" class="history-btn desktop-only" title="Xuất / Export" style="height: 100%;"><i class="fas fa-file-excel"></i></button>
                                <button id="historyToggleViewBtn" class="history-btn history-toggle-mobile" style="height: 100%;"><i class="fas fa-expand-arrows-alt"></i> 展開</button>
                            </div>
                        </div>

                    <div class="history-table-container">
                        <table class="history-table">
                            <thead>
                                <tr>
                                    <th style="width: 50px;"></th>
                                    <th style="width: 140px;" class="history-time-col" data-sort="timeMs">日時 <span style="display:block; font-size:11px; opacity:0.6; font-weight:normal;">Thời gian</span></th>
                                    <th style="width: 140px;" class="history-action-col" data-sort="type">アクション <span style="display:block; font-size:11px; opacity:0.6; font-weight:normal;">Hành động</span></th>
                                    <th style="width: 150px;">旧値 <span style="display:block; font-size:11px; opacity:0.6; font-weight:normal;">Giá trị cũ</span></th>
                                    <th style="width: 150px;">新値 <span style="display:block; font-size:11px; opacity:0.6; font-weight:normal;">Giá trị mới</span></th>
                                    <th style="width: 120px;" class="history-actor-col" data-sort="actor">担当 <span style="display:block; font-size:11px; opacity:0.6; font-weight:normal;">Người thao tác</span></th>
                                    <th style="width: 200px;" class="history-note-col" data-sort="note">備考 <span style="display:block; font-size:11px; opacity:0.6; font-weight:normal;">Ghi chú</span></th>
                                </tr>
                            </thead>
                            <tbody id="historyTableBody"><tbody id="historyTableBody">

                                <!-- Rendered dynamically -->

                            </tbody>

                        </table>

                    </div>

                </div>

            `;



            this.tbody = document.getElementById('historyTableBody');

            this.searchInput = document.getElementById('historySearchInput');

            this.printBtn = document.getElementById('historyPrintBtn');

            this.exportBtn = document.getElementById('historyExportBtn');

            this.dateFilter = document.getElementById('historyDateFilter');

            this.customDate = document.getElementById('historyCustomDate');

            this.allEvents = [];



            this.bindEvents();



            // Wait slightly for DataManager to populate or hook to event

            if (window.DataManager && window.DataManager.data && Object.keys(window.DataManager.data).length > 0) {

                this.buildGlobalHistory(window.DataManager.data);

            }



            // Hook into existing Sidebar button

            const sidebarBtn = document.getElementById('sidebarHistoryModuleBtn');

            if (sidebarBtn) {

                sidebarBtn.addEventListener('click', (e) => {

                    e.preventDefault();

                    this.openHistoryView();

                    // Close sidebar on mobile

                    const sb = document.getElementById('sidebar');

                    const backdrop = document.getElementById('backdrop');

                    if (sb && window.innerWidth <= 768) {

                        sb.classList.remove('open');

                        if (backdrop) backdrop.classList.remove('show');

                    }

                });

            }

        },



        bindEvents: function () {

            // Mobile toggle column visibility

            const toggleBtn = document.getElementById('historyToggleViewBtn');

            if (toggleBtn) {

                toggleBtn.addEventListener('click', () => {

                    let cont = document.querySelector('.history-table-container');

                    if (cont) {

                        let isUnlocked = cont.classList.toggle('table-unlocked');

                        let icon = toggleBtn.querySelector('i');

                        if (isUnlocked) {

                            icon.className = 'fas fa-compress-arrows-alt';

                        } else {

                            icon.className = 'fas fa-expand-arrows-alt';

                        }

                    }

                });

            }



            const globalSearch = document.getElementById('searchInput');

            if (globalSearch) {

                globalSearch.addEventListener('input', (e) => {

                    if (window.CurrentSearchContext === 'history') {

                        if (this.searchInput) this.searchInput.value = e.target.value;

                        this.renderTable(e.target.value.trim());

                    }

                });

            }



            const clearBtn = document.querySelector('.search-wrap .clear-btn');

            if (clearBtn) {

                clearBtn.addEventListener('click', () => {

                    if (window.CurrentSearchContext === 'history') {

                        if (this.searchInput) this.searchInput.value = '';

                        this.renderTable('');

                    }

                });

            }



            // Stat Cards click

            document.querySelectorAll('.history-stat-card').forEach(card => {

                card.addEventListener('click', (e) => {

                    document.querySelectorAll('.history-stat-card').forEach(c => c.classList.remove('history-stat-active'));

                    card.classList.add('history-stat-active');

                    this.filterStatus = card.getAttribute('data-filter');

                    let sv = this.searchInput ? this.searchInput.value.trim() : '';

                    if (globalSearch && window.CurrentSearchContext === 'history') sv = globalSearch.value.trim();

                    this.renderTable(sv);

                });

            });



            this.container.querySelectorAll('.history-btn-date').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.container.querySelectorAll('.history-btn-date')
                        .forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const customDateInput = document.getElementById('historyCustomDate');
                    if (customDateInput) {
                        if (btn.dataset.date === 'custom') {
                            customDateInput.style.display = 'block';
                        } else {
                            customDateInput.style.display = 'none';
                        }
                    }
                    const sv = this.searchInput ? this.searchInput.value.trim() : '';
                    this.renderTable(sv);
                });
            });

            if (this.customDate) {
                this.customDate.addEventListener('change', () => {
                    let sv = this.searchInput ? this.searchInput.value.trim() : '';
                    this.renderTable(sv);
                });
            }

            const markAllBtn = document.getElementById('historyMarkAllBtn');
            if (markAllBtn) {
                markAllBtn.addEventListener('click', () => this.markAllRead());
            }



            // Sorter Mechanism

            this.container.querySelectorAll('th[data-sort]').forEach(th => {

                th.style.cursor = 'pointer';

                th.title = 'Bấm để sắp xếp (Click to sort)';

                th.addEventListener('click', (e) => {

                    if (e.target.classList.contains('history-resizer')) return; // ignore resize drag

                    let col = th.dataset.sort;

                    if (this.sortCol === col) {

                        this.sortDir = this.sortDir === 1 ? -1 : 1;

                    } else {

                        this.sortCol = col;

                        this.sortDir = 1;

                    }

                    this.renderTable(this.searchInput.value.trim());

                });

            });



            // Resizer Mechanism

            this.container.querySelectorAll('th:not(:first-child)').forEach(th => {

                let resizer = document.createElement('div');

                resizer.classList.add('history-resizer');

                th.appendChild(resizer);

                let x, w;



                const mouseMoveHandler = (e) => {

                    th.style.width = `${w + e.clientX - x}px`;

                };



                const mouseUpHandler = () => {

                    document.removeEventListener('mousemove', mouseMoveHandler);

                    document.removeEventListener('mouseup', mouseUpHandler);

                    resizer.classList.remove('resizing');

                };



                const mouseDownHandler = (e) => {

                    x = e.clientX;

                    let styles = window.getComputedStyle(th);

                    w = parseInt(styles.width, 10);

                    document.addEventListener('mousemove', mouseMoveHandler);

                    document.addEventListener('mouseup', mouseUpHandler);

                    resizer.classList.add('resizing');

                };



                resizer.addEventListener('mousedown', mouseDownHandler);

            });



            this.printBtn.addEventListener('click', () => {

                this.printHistory();

            });



            this.exportBtn.addEventListener('click', () => {

                this.exportHistory();

            });



            // Intercept standard view changes to hide History UI

            window.addEventListener('mcsViewChanged', () => {

                if (this.container) this.container.style.display = 'none';

                const btn = document.getElementById('sidebarHistoryModuleBtn');

                if (btn) btn.classList.remove('active');

            });



            // Need to intercept when standard searches are made so History UI goes away

            document.getElementById('sidebarNavMolds')?.addEventListener('click', () => {

                if (this.container) this.container.style.display = 'none';

            });



            // Reliable Polling for DataManager

            let pollAttempts = 0;

            const dataPoll = setInterval(() => {

                pollAttempts++;

                if (window.DataManager && window.DataManager.data) {

                    let d = window.DataManager.data;
                    if ((d.statuslogs && d.statuslogs.length > 0) || (d.molds && d.molds.length > 0)) {
                        clearInterval(dataPoll);
                        this.buildGlobalHistory(d);
                    }
                }
                // Stop trying after ~20 seconds
                if (pollAttempts > 40) clearInterval(dataPoll);
            }, 500);

            document.addEventListener('data-manager:ready', () => {
                if (window.DataManager && window.DataManager.data) {
                    this.buildGlobalHistory(window.DataManager.data);
                }
            });

            // Bổ sung lắng nghe Data Sync ngầm (V10 PubSub)
            document.addEventListener('mcs-data-sync', () => {
                if (window.DataManager && window.DataManager.data && Object.keys(window.DataManager.data).length > 0) {
                    this.buildGlobalHistory(window.DataManager.data);
                }
            });

        },



        buildGlobalHistory: function (data) {

            let events = [];



            // Helper to get device code by ID from master data

            const getDeviceCode = (id) => {

                if (!id) return { code: '-', type: '?', rawItem: null, rawType: '' };

                let m = (data.molds || []).find(x => x.ID == id || x.MoldID == id);

                if (m) return { code: m.MoldCode || '-', name: m.MoldName || m.TrayInfoForMoldDesign || '', type: 'Mold', rawItem: m, rawType: 'mold' };
                let c = (data.cutters || []).find(x => x.ID == id || x.CutterID == id);
                if (c) return { code: c.CutterCode || c.CutterNo || '-', name: c.CutterName || c.Shape || '', type: 'Cutter', rawItem: c, rawType: 'cutter' };
                return { code: `ID:${id}`, name: '', type: '?', rawItem: null, rawType: '' };

            };



            // Helper to get Employee Name properly

            const getEmp = (id) => {

                if (!id) return '-';

                let strId = String(id).trim().toLowerCase();

                let emps = data.employees || [];

                for (let i = 0; i < emps.length; i++) {

                    if (String(emps[i].EmployeeID).trim().toLowerCase() === strId) {

                        return emps[i].EmployeeName || emps[i].Employee || id;

                    }

                }

                return id;

            };



            const parseTime = (v) => { if (!v) return 0; const t = new Date(v).getTime(); return isNaN(t) ? 0 : t; };

            const fDate = (d) => { if (!d) return ''; try { const t = new Date(d); return t.toLocaleString('ja-JP').slice(0, 16); } catch (e) { return d; } };



            // 1. Status Events
            (data.statuslogs || []).forEach(s => {
                let dev = getDeviceCode(s.MoldID || s.CutterID);
                events.push({
                    timeMs: parseTime(s.DateEntry || s.Timestamp),
                    dateStr: fDate(s.DateEntry || s.Timestamp),
                    deviceCode: dev.code, deviceName: dev.name, rawItem: dev.rawItem, rawType: dev.rawType,
                    type: 'Status', icon: 'fa-clipboard-list',
                    actionStr: `<span class="history-badge history-action-badge--status" style="background:#eef2ff; color:#4f46e5;">ステータス</span>`,
                    oldVal: '-', newVal: s.StatusText || s.Status || s.subtype || '-',
                    actor: getEmp(s.EmployeeID || s.Employee || s.CreatedBy || s.User || s.UserID), note: s.Note || s.Notes || ''
                });
            });

            // 2. Location Events
            (data.locationlog || []).forEach(l => {
                let dev = getDeviceCode(l.MoldID || l.CutterID);
                events.push({
                    timeMs: parseTime(l.DateEntry || l.Timestamp),
                    dateStr: fDate(l.DateEntry || l.Timestamp),
                    deviceCode: dev.code, deviceName: dev.name, rawItem: dev.rawItem, rawType: dev.rawType,
                    type: 'Location', icon: 'fa-map-marker-alt',
                    actionStr: `<span class="history-badge history-action-badge--location" style="background:#f0fdf4; color:#16a34a;">ロケーション</span>`,
                    oldVal: l.OldRackLayer || '-', newVal: l.NewRackLayer || '-',
                    actor: getEmp(l.EmployeeID || l.Employee || l.CreatedBy || l.User || l.UserID), note: l.notes || l.Notes || l.Note || ''
                });
            });

            // 3. Ship Events
            (data.shiplog || []).forEach(sh => {
                let dev = getDeviceCode(sh.MoldID || sh.CutterID);
                events.push({
                    timeMs: parseTime(sh.ShipDate || sh.DateEntry || sh.Timestamp),
                    dateStr: fDate(sh.ShipDate || sh.DateEntry || sh.Timestamp),
                    deviceCode: dev.code, deviceName: dev.name, rawItem: dev.rawItem, rawType: dev.rawType,
                    type: 'Ship', icon: 'fa-truck',
                    actionStr: `<span class="history-badge history-action-badge--ship" style="background:#fff7ed; color:#ea580c;">出荷/移動</span>`,
                    oldVal: sh.FromCompany || '-', newVal: sh.ToCompany || '-',
                    actor: getEmp(sh.EmployeeID || sh.Employee || sh.CreatedBy || sh.User || sh.UserID), note: sh.ShipNotes || sh.notes || ''
                });
            });

            // 4. Teflon Events
            (data.teflonlog || []).forEach(tf => {
                let dev = getDeviceCode(tf.MoldID || tf.CutterID);
                let d = tf.ReceivedDate || tf.SentDate || tf.RequestedDate || tf.DateEntry || tf.Timestamp;
                events.push({
                    timeMs: parseTime(d),
                    dateStr: fDate(d),
                    deviceCode: dev.code, deviceName: dev.name, rawItem: dev.rawItem, rawType: dev.rawType,
                    type: 'Teflon', icon: 'fa-spray-can',
                    actionStr: `<span class="history-badge history-action-badge--teflon" style="background:#fdf2f8; color:#db2777;">テフロン</span>`,
                    oldVal: '-', newVal: (tf.TeflonStatusText || tf.TeflonStatus || '-') + (tf.Supplier ? ` (${tf.Supplier})` : ''),
                    actor: getEmp(tf.EmployeeID || tf.Employee || tf.CreatedBy || tf.User || tf.UserID), note: tf.Notes || tf.Note || ''
                });
            });

            // 5. Comments
            (data.usercomments || []).forEach(cm => {
                let dev = getDeviceCode(cm.MoldID || cm.CutterID);
                events.push({
                    timeMs: parseTime(cm.DateEntry || cm.Timestamp),
                    dateStr: fDate(cm.DateEntry || cm.Timestamp),
                    deviceCode: dev.code, deviceName: dev.name, rawItem: dev.rawItem, rawType: dev.rawType,
                    type: 'Comment', icon: 'fa-comment-dots',
                    actionStr: `<span class="history-badge history-action-badge--comment" style="background:#f1f5f9; color:#475569;">コメント</span>`,
                    oldVal: '-', newVal: '-',
                    actor: getEmp(cm.EmployeeID || cm.Employee || cm.CreatedBy || cm.User || cm.UserID), note: cm.Text || cm.Comment || ''
                });
            });

            // 6. Data Change History (Catch-all for system edits)
            (data.datachangehistory || []).forEach(dc => {
                let dev = getDeviceCode(dc.MoldID || dc.CutterID || dc.DeviceID || dc.ItemID);
                events.push({
                    timeMs: parseTime(dc.Timestamp || dc.DateEntry || dc.DateLog),
                    dateStr: fDate(dc.Timestamp || dc.DateEntry || dc.DateLog),
                    deviceCode: dev.code, deviceName: dev.name, rawItem: dev.rawItem, rawType: dev.rawType,
                    type: 'Change', icon: 'fa-history',
                    actionStr: `<span class="history-badge history-action-badge--change" style="background:#f3f4f6; color:#111827;">システム</span>`,
                    oldVal: dc.OldValue || '-', newVal: dc.NewValue || dc.Action || dc.ChangeType || dc.Event || '-',
                    actor: getEmp(dc.EmployeeID || dc.Employee || dc.User || dc.CreatedBy || dc.UserID), note: dc.Details || dc.Note || dc.Notes || ''
                });
            });

            // Deduplicate: loại bỏ Change events trùng timeMs + deviceCode với Status events
            const statusKeys = new Set(
                events.filter(e => e.type === 'Status').map(e => `${e.deviceCode}_${e.timeMs}`)
            );
            events = events.filter(e => e.type !== 'Change' || !statusKeys.has(`${e.deviceCode}_${e.timeMs}`));

            events.sort((a, b) => b.timeMs - a.timeMs);


            this.allEvents = events;



            // Check notifications

            this.updateBadge();

            this.updateStats();



            // Render if currently active

            if (this.container.style.display !== 'none') {

                let sv = this.searchInput ? this.searchInput.value : '';

                const globalSearch = document.getElementById('searchInput');

                if (globalSearch && window.CurrentSearchContext === 'history') sv = globalSearch.value;

                this.renderTable(sv);

            }

        },



        updateStats: function (eventsList) {
            const list = eventsList || this.allEvents || [];
            const uniqueBy = (type) =>
                new Set(list
                    .filter(r => r.type === type)
                    .map(r => r.deviceCode)
                ).size;
            
            const total = new Set(list.map(r => r.deviceCode)).size;

            let idTotal = document.getElementById('hsStatTotal'); if (idTotal) idTotal.innerText = total;
            let idStatus = document.getElementById('hsStatStatus'); if (idStatus) idStatus.innerText = uniqueBy('Status');
            let idLocation = document.getElementById('hsStatLocation'); if (idLocation) idLocation.innerText = uniqueBy('Location');
            let idShip = document.getElementById('hsStatShip'); if (idShip) idShip.innerText = uniqueBy('Ship');
            let idTef = document.getElementById('hsStatTeflon'); if (idTef) idTef.innerText = uniqueBy('Teflon');
            let idCm = document.getElementById('hsStatComment'); if (idCm) idCm.innerText = uniqueBy('Comment');
        },



        markAllRead: function() {
            localStorage.setItem(this.lastCheckKey, Date.now().toString());
            localStorage.removeItem('mcs_history_read_ids');
            this.updateBadge();
            this.renderTable(this.searchInput ? this.searchInput.value : '');
        },

        updateBadge: function () {

            if (!this.notificationBadge) return;

            if (this.allEvents.length === 0) {

                this.notificationBadge.style.display = 'none';

                return;

            }



            let lastChecked = parseInt(localStorage.getItem(this.lastCheckKey) || '0', 10);

            let readEvents = [];

            try { readEvents = JSON.parse(localStorage.getItem('mcs_history_read_ids') || '[]'); } catch (e) { }



            // Set baseline to ~10 days ago if never checked, to avoid thousands of highlights

            if (!localStorage.getItem(this.lastCheckKey)) {

                lastChecked = Date.now() - 10 * 24 * 3600000;

                localStorage.setItem(this.lastCheckKey, lastChecked.toString());

            }



            let unreadCount = 0;

            for (let i = 0; i < this.allEvents.length; i++) {

                let ev = this.allEvents[i];

                let uid = ev.timeMs + '-' + ev.type; // Simple Unique ID

                if (ev.timeMs > lastChecked && !readEvents.includes(uid)) {

                    unreadCount++;

                } else if (ev.timeMs <= lastChecked) {

                    break;

                }

            }



            let markBtn = document.getElementById('historyMarkAllBtn');
            if (unreadCount > 0) {
                this.notificationBadge.textContent = unreadCount > 99 ? '99+' : unreadCount;
                this.notificationBadge.style.display = 'inline-flex';
                if (markBtn) markBtn.style.display = 'inline-flex';
            } else {
                this.notificationBadge.style.display = 'none';
                if (markBtn) markBtn.style.display = 'none';
            }

        },



        openHistoryView: function () {

            // Un-highlight all navs

            document.querySelectorAll('.sidebar .nav-link').forEach(el => el.classList.remove('active'));

            // Highlight history nav

            const btn = document.getElementById('sidebarHistoryModuleBtn');

            if (btn) btn.classList.add('active');



            // Hide all other views

            document.querySelectorAll('.main-content > .content-area').forEach(el => el.style.display = 'none');



            // Show global history

            this.container.style.display = 'block';



            // IMPORTANT: We do not blindly update mcs_history_last_checked anymore.

            // Badges clear out by clicking individual rows.

            this.updateBadge();

            this.renderTable(this.searchInput.value);

        },



        renderTable: function (query = '') {

            query = query.toLowerCase();

            let html = '';



            let lastChecked = parseInt(localStorage.getItem(this.lastCheckKey) || '0', 10);

            let readEvents = [];

            try { readEvents = JSON.parse(localStorage.getItem('mcs_history_read_ids') || '[]'); } catch (e) { }



            // Filter

            let filtered = this.allEvents;

            if (this.filterStatus !== 'all') {

                filtered = filtered.filter(e => e.type === this.filterStatus);

            }

            if (query) {

                let queryClean = query.replace(/[-\s]/g, '');

                filtered = filtered.filter(e => {

                    let combo = `${e.deviceCode} ${e.note || ''} ${e.actionStr || ''}`.toLowerCase();

                    let comboClean = combo.replace(/[-\s]/g, '');

                    return combo.includes(query) || comboClean.includes(queryClean);

                });

            }



            // Filter Date
            let activeDateBtn = this.container.querySelector('.history-btn-date.active');
            let dateVal = activeDateBtn ? activeDateBtn.dataset.date : '2days';
            let now = Date.now();
            let msPerDay = 86400000;
            if (dateVal !== 'all') {
                let startMs = 0;
                let endMs = now;
                if (dateVal === 'today') {
                    let d = new Date(); d.setHours(0,0,0,0); startMs = d.getTime();
                } else if (dateVal === '2days') {
                    let d = new Date(); d.setDate(d.getDate() - 2); d.setHours(0,0,0,0); startMs = d.getTime();
                } else if (dateVal === '3days') {
                    let d = new Date(); d.setDate(d.getDate() - 3); d.setHours(0,0,0,0); startMs = d.getTime();
                } else if (dateVal === '7days') {
                    let d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0,0,0,0); startMs = d.getTime();
                } else if (dateVal === 'custom') {
                    let cd = document.getElementById('historyCustomDate');
                    if (cd && cd.value) {
                        let d = new Date(cd.value); d.setHours(0,0,0,0); startMs = d.getTime();
                        endMs = startMs + msPerDay - 1;
                    }
                }
                if (startMs > 0) {

                    filtered = filtered.filter(e => e.timeMs >= startMs && e.timeMs <= endMs);

                }

            }



            // Execute Custom Sorting

            if (this.sortCol) {

                let col = this.sortCol;

                let dir = this.sortDir || 1;

                filtered.sort((a, b) => {

                    let vA = a[col] || ''; let vB = b[col] || '';

                    if (typeof vA === 'string') vA = vA.toString().toLowerCase();

                    if (typeof vB === 'string') vB = vB.toString().toLowerCase();

                    if (vA < vB) return -1 * dir;

                    if (vA > vB) return 1 * dir;

                    return 0;

                });

            }

            this.updateStats(filtered);

            if (filtered.length === 0) {

                html = `<tr><td colspan="6" style="text-align:center; padding: 32px; color: #94a3b8;">データがありません / Không có dữ liệu</td></tr>`;

            } else {

                // Group by deviceCode + Date to avoid scattered information
                let grouped = {};
                filtered.forEach(ev => {
                    let dateKey = ev.dateStr.split(' ')[0] || '';
                    let gk = `${ev.deviceCode} | ${ev.deviceName}___${dateKey}`;
                    if (!grouped[gk]) grouped[gk] = [];
                    grouped[gk].push(ev);
                });

                // Render limit to top 200 groups to maintain performance
                let groupsKeys = Object.keys(grouped).slice(0, 200);
                groupsKeys.forEach(gk => {
                    let groupEvents = grouped[gk];
                    let devDisplay = gk.split('___')[0];
                    let dateDisplay = gk.split('___')[1];
                    
                    // Render Group Header
                    html += `
                        <tr class="history-group-header" style="background:#f1f5f9; border-top:2px solid #cbd5e1;">
                            <td colspan="7" style="padding:8px 12px; font-weight:700; color:#334155;">
                                <i class="fas fa-layer-group" style="margin-right:8px; color:#475569;"></i>
                                <a href="#" class="history-device-link" data-uid="${groupEvents[0].timeMs + '-' + groupEvents[0].type}" style="color:var(--color-primary); text-decoration:none;">${this.escapeStr(devDisplay)}</a>
                                <span style="font-size:12px; font-weight:normal; color:#64748b; margin-left:8px;">(${groupEvents.length} actions - ${dateDisplay})</span>
                            </td>
                        </tr>
                    `;
                    
                    groupEvents.forEach(ev => {
                        let uid = ev.timeMs + '-' + ev.type;
                        let isUnread = (ev.timeMs > lastChecked) && !readEvents.includes(uid);
                        let rowClass = isUnread ? 'history-unread' : '';
                        let dtParts = ev.dateStr.split(' ');
                        let timeHtml = dtParts.length === 2 ? `<div style="font-weight:600">${dtParts[0]}</div><div style="font-size:11px; opacity:0.8">${dtParts[1]}</div>` : ev.dateStr;
                        
                        html += `
                            <tr class="${rowClass}" data-uid="${uid}">
                                <td class="history-icon-cell" style="padding-left:24px;"><i class="fas ${ev.icon}"></i></td>
                                <td class="history-time-cell history-time-col" style="color:#94a3b8;">${timeHtml}</td>
                                <td class="history-action-cell history-action-col">${ev.actionStr}</td>
                                <td style="color:#64748b; font-size:13px; font-family:monospace;">${this.escapeStr(ev.oldVal)}</td>
                                <td style="color:#111827; font-size:13px; font-family:monospace; font-weight:600;">${this.escapeStr(ev.newVal)}</td>
                                <td class="history-actor-cell history-actor-col" title="${this.escapeStr(ev.actor)}">${this.escapeStr(ev.actor)}</td>
                                <td class="history-note-cell history-note-col">${this.escapeStr(ev.note)}</td>
                            </tr>
                        `;
                    });
                });
            }
            this.tbody.innerHTML = html;



            // Bind click events on unread rows for read mechanics

            this.tbody.querySelectorAll('.history-unread').forEach(tr => {

                tr.addEventListener('click', (e) => {

                    tr.classList.remove('history-unread');

                    let readA = [];

                    try { readA = JSON.parse(localStorage.getItem('mcs_history_read_ids') || '[]'); } catch (err) { }

                    readA.push(tr.dataset.uid);

                    localStorage.setItem('mcs_history_read_ids', JSON.stringify(readA));

                    this.updateBadge(); // Dynamic counter update!

                });

            });



            // Bind device links to open detail panel

            this.tbody.querySelectorAll('.history-device-link').forEach(link => {

                link.addEventListener('click', (e) => {

                    e.preventDefault();

                    e.stopPropagation(); // don't trigger "unread" row click

                    let uid = link.dataset.uid;

                    let ev = this.allEvents.find(x => (x.timeMs + '-' + x.type) === uid);

                    if (ev && ev.rawItem) {

                        document.dispatchEvent(new CustomEvent('openDetailPanel', {

                            detail: { item: ev.rawItem, type: ev.rawType }

                        }));

                    }

                });

            });

        },



        escapeStr: function (s) {

            if (!s) return '';

            return s.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        },



        printHistory: function () {

            let query = this.searchInput.value.trim();

            let filtered = query ? this.allEvents.filter(e => e.deviceCode.toLowerCase().includes(query) || (e.note || '').toLowerCase().includes(query)) : this.allEvents;



            let prtHtml = `

            <html>

            <head>

                <title>Lịch sử hệ thống (System History)</title>

                <style>

                    body { font-family: sans-serif; font-size: 12px; }

                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }

                    th, td { border: 1px solid #ccc; padding: 6px; text-align: left; }

                </style>

            </head>

            <body>

                <h2>システム履歴 / Lịch sử hệ thống</h2>

                <p>Filter: ${this.escapeStr(query) || 'All'}</p>

                <table>

                    <thead>

                        <tr>

                            <th>日時</th>

                            <th>端末</th>

                            <th>アクション</th>

                            <th>担当</th>

                            <th>備考</th>

                        </tr>

                    </thead>

                    <tbody>`;



            filtered.forEach(ev => {

                let ast = ev.actionStr.replace(/<[^>]+>/g, '').trim();

                prtHtml += `<tr>

                    <td>${ev.dateStr}</td>

                    <td>${this.escapeStr(ev.deviceCode)}</td>

                    <td>${ast}</td>

                    <td>${this.escapeStr(ev.actor)}</td>

                    <td>${this.escapeStr(ev.note)}</td>

                </tr>`;

            });

            prtHtml += `</tbody></table><script>window.print();setTimeout(()=>window.close(), 500);</script></body></html>`;



            let win = window.open('', '_blank');

            win.document.write(prtHtml);

            win.document.close();

        },



        exportHistory: function () {

            if (typeof ExcelJS === 'undefined') {

                alert('Có lỗi: thư viện Excel chưa được tải.');

                return;

            }

            let query = this.searchInput.value.trim();

            let filtered = query ? this.allEvents.filter(e => e.deviceCode.toLowerCase().includes(query) || (e.note || '').toLowerCase().includes(query)) : this.allEvents;



            const wb = new ExcelJS.Workbook();

            const ws = wb.addWorksheet('History');

            ws.columns = [

                { header: '日時(Date)', key: 'date', width: 20 },

                { header: '端末(Device)', key: 'code', width: 15 },

                { header: '種類(Type)', key: 'type', width: 15 },

                { header: 'アクション(Action)', key: 'action', width: 35 },

                { header: '担当(Actor)', key: 'actor', width: 15 },

                { header: '備考(Note)', key: 'note', width: 35 }

            ];



            filtered.forEach(ev => {

                let ast = ev.actionStr.replace(/<[^>]+>/g, '').trim();

                ws.addRow({ date: ev.dateStr, code: ev.deviceCode, type: ev.type, action: ast, actor: ev.actor, note: ev.note });

            });



            wb.xlsx.writeBuffer().then(buffer => {

                const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

                const url = window.URL.createObjectURL(blob);

                const a = document.createElement('a');

                a.href = url;

                a.download = `History_Export_${new Date().getTime()}.xlsx`;

                document.body.appendChild(a);

                a.click();

                document.body.removeChild(a);

            });

        }

    };



    // Initialize after DOM loads

    document.addEventListener('DOMContentLoaded', () => {

        // Run init early or on window load

        setTimeout(() => { if (window.GlobalHistoryModule) window.GlobalHistoryModule.init(); }, 1000);

    });



})();


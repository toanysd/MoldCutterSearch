// v9.0.3
/* global-teflon-module.js */

(function () {

    'use strict';



    /* ========================================

       STATUS MAPPING CONSTANTS & HELPERS

    ======================================== */

    const TEFLON_STATUS_KEYS = {

        unprocessed: 'unprocessed',

        pending: 'pending',

        approved: 'approved',

        processing: 'processing',

        completed: 'completed'

    };



    const TEFLON_COATING_LABELS = {

        unprocessed: '未処理',

        pending: 'テフロン加工承認待ち',

        approved: '承認済(発送待ち)',

        processing: 'テフロン加工中',

        completed: 'テフロン加工済'

    };



    function normalizeText(v) { return String(v || '').trim(); }

    function escapeHtml(text) {

        if (text == null) return '';

        const div = document.createElement('div');

        div.textContent = String(text);

        return div.innerHTML;

    }



    function parseFlexibleDate(str) {

        if (!str) return null;

        let d = new Date(str);

        if (!isNaN(d.getTime())) return d;

        const monthMap = {

            'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,

            'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11

        };

        const m = String(str).match(/(\d{1,2})-([A-Za-z]{3})-(\d{2})/);

        if (m) {

            const day = parseInt(m[1], 10);

            const month = monthMap[m[2]];

            let year = parseInt(m[3], 10);

            year = (year < 50) ? 2000 + year : 1900 + year;

            if (month !== undefined) return new Date(year, month, day);

        }

        const parts = String(str).split(/[-\/]/);

        if (parts.length === 3) {

            const y = parseInt(parts[0], 10);

            const mo = parseInt(parts[1], 10);

            const dd = parseInt(parts[2], 10);

            if (!isNaN(y) && !isNaN(mo) && !isNaN(dd)) return new Date(y, mo - 1, dd);

        }

        return null;

    }



    function formatDate(dateStr) {

        const d = parseFlexibleDate(dateStr);

        if (!d) return '―';

        const yyyy = d.getFullYear();

        const mm = String(d.getMonth() + 1).padStart(2, '0');

        const dd = String(d.getDate()).padStart(2, '0');

        return `${yyyy}-${mm}-${dd}`;

    }



    function daysDiffFromNow(dateObj) {

        if (!dateObj) return 0;

        const now = new Date();

        const diffMs = now.getTime() - dateObj.getTime();

        return diffMs / (1000 * 60 * 60 * 24);

    }



    function mapCoatingToStatusKey(coating) {

        const v = normalizeText(coating);

        if (!v) return '';

        if (v === TEFLON_COATING_LABELS.pending) return TEFLON_STATUS_KEYS.pending;

        if (v === TEFLON_COATING_LABELS.approved) return TEFLON_STATUS_KEYS.approved;

        if (v === TEFLON_COATING_LABELS.processing) return TEFLON_STATUS_KEYS.processing;

        if (v === TEFLON_COATING_LABELS.completed) return TEFLON_STATUS_KEYS.completed;

        const lower = v.toLowerCase();

        if (lower.includes('承認待') || lower.includes('pending')) return TEFLON_STATUS_KEYS.pending;
        if (lower.includes('承認済') || lower.includes('approved')) return TEFLON_STATUS_KEYS.approved;
        if (lower.includes('加工中') || lower.includes('processing') || lower.includes('sent')) return TEFLON_STATUS_KEYS.processing;
        if (lower.includes('加工済') || lower.includes('completed') || lower.includes('coated')) return TEFLON_STATUS_KEYS.completed;

        if (lower.includes('待')) return TEFLON_STATUS_KEYS.pending;
        if (lower.includes('承')) return TEFLON_STATUS_KEYS.approved;
        if (lower.includes('進') || lower.includes('発送')) return TEFLON_STATUS_KEYS.processing;
        if (lower.includes('完') || (lower.includes('済') && !lower.includes('承認'))) return TEFLON_STATUS_KEYS.completed;

        return '';

    }



    function logStatusToStatusKey(logStatus) {
        const v = normalizeText(logStatus).toLowerCase();
        if (!v) return '';

        if (v.includes('承認待') || v.includes('requested') || v.includes('pending')) return TEFLON_STATUS_KEYS.pending;
        if (v.includes('承認済') || v.includes('approved')) return TEFLON_STATUS_KEYS.approved;
        if (v.includes('加工中') || v.includes('sent') || v.includes('processing')) return TEFLON_STATUS_KEYS.processing;
        if (v.includes('加工済') || v.includes('completed') || v.includes('coated') || v.includes('received')) return TEFLON_STATUS_KEYS.completed;

        // Fallbacks for truncated MS Access texts
        if (v.includes('待')) return TEFLON_STATUS_KEYS.pending;
        if (v.includes('承')) return TEFLON_STATUS_KEYS.approved;
        if (v.includes('進') || v.includes('発送')) return TEFLON_STATUS_KEYS.processing;
        if (v.includes('完') || (v.includes('済') && !v.includes('承認'))) return TEFLON_STATUS_KEYS.completed;

        return '';
    }



    function getTeflonStatusKey(row, hasLog) {

        // --- Data Integrity Patch: Trust Dates over Strings ---
        // MS Access updates might fill 'ReceivedDate' but users frequently forget to change 'TeflonStatus' text.
        if (row.ReceivedDate && parseFlexibleDate(row.ReceivedDate)) {
            return TEFLON_STATUS_KEYS.completed;
        }

        const coating = normalizeText(row.TeflonCoating || row.TeflonStatus);

        if (!coating && !hasLog) return TEFLON_STATUS_KEYS.unprocessed;

        let key = mapCoatingToStatusKey(row.TeflonStatus);

        if (key) return key;

        key = mapCoatingToStatusKey(row.CoatingType);

        if (key) return key;

        key = logStatusToStatusKey(row.TeflonStatus);

        if (key) return key;

        return '';

    }



    function statusKeyToCoatingLabel(key) {

        return TEFLON_COATING_LABELS[key] || '―';

    }



    function getShortStatusLabel(statusKey) {

        const labels = {

            unprocessed: '未処理',

            pending: '承認待ち',

            approved: '承認済',

            processing: '加工中',

            completed: '完了'

        };

        return labels[statusKey] || '-';

    }



    function getEmployeeName(empId, employees) {

        if (!empId || !employees) return '―';

        const emp = employees.find(e => String(e.EmployeeID) === String(empId));

        if (!emp) return '―';

        return emp.EmployeeNameShort || emp.EmployeeName || '―';

    }



    function getRequestDateWarningClass(statusKey, reqDateObj) {

        if (statusKey !== TEFLON_STATUS_KEYS.pending) return '';

        if (!reqDateObj) return 'tef-req-overdue-14';

        const days = daysDiffFromNow(reqDateObj);

        if (days >= 14) return 'tef-req-overdue-14';

        if (days >= 11) return 'tef-req-overdue-11';

        if (days >= 9) return 'tef-req-overdue-9';

        if (days >= 7) return 'tef-req-overdue-7';

        return '';

    }



    /* ========================================

       MODULE LOGIC

    ======================================== */

    window.GlobalTeflonModule = {

        init: function () {

            this.container = document.getElementById('mcs-view-teflon');

            if (!this.container) return;



            this.allRows = [];

            this.filterStatus = 'active'; // Default view

            this.sortCol = 'RequestedDate';

            this.sortDir = -1; // DESC



            // Generate View

            this.container.innerHTML = `

                <div class="gt-module-container" style="padding-top: 8px;">

                    <!-- Hidden inputs for backward JS compatibility -->

                    <input type="hidden" id="gtSearchInput" class="gt-search-input">

                    <select id="gtStatusFilter" style="display:none;"><option value="all"></option></select>



                    <div class="gt-stats">

                        <div class="gt-stat-card gt-stat-active" data-filter="all">

                            <div class="gt-stat-icon total">全</div>

                            <div><div class="gt-stat-label">総 / Tổng</div><div class="gt-stat-value" id="gtStatTotal">0</div></div>

                        </div>

                        <div class="gt-stat-card" data-filter="pending">

                            <div class="gt-stat-icon pending">待</div>

                            <div><div class="gt-stat-label">待 / Chờ</div><div class="gt-stat-value" id="gtStatPending">0</div></div>

                        </div>

                        <div class="gt-stat-card" data-filter="approved">

                            <div class="gt-stat-icon approved">承</div>

                            <div><div class="gt-stat-label">承 / Duyệt</div><div class="gt-stat-value" id="gtStatApproved">0</div></div>

                        </div>

                        <div class="gt-stat-card" data-filter="processing">

                            <div class="gt-stat-icon processing">進</div>

                            <div><div class="gt-stat-label">進 / Mạ</div><div class="gt-stat-value" id="gtStatProcessing">0</div></div>

                        </div>

                        <div class="gt-stat-card" data-filter="completed">

                            <div class="gt-stat-icon completed">完</div>

                            <div><div class="gt-stat-label">完 / Xong</div><div class="gt-stat-value" id="gtStatCompleted">0</div></div>

                        </div>

                        <div style="display: flex; gap: 8px; margin-left: auto;">

                            <button id="gtRefreshBtn" class="gt-btn desktop-only" title="Làm mới (Refresh)" style="height: 100%;"><i class="fas fa-sync-alt"></i></button>

                            <button id="gtToggleViewBtn" class="gt-btn gt-toggle-mobile" style="height: 100%;"><i class="fas fa-expand-arrows-alt"></i> 展開</button>

                        </div>

                    </div>



                    <div class="gt-table-container">

                        <table class="gt-table">

                            <thead>

                                <tr>

                                    <th style="width: 100px;" class="gt-cell-id" data-sort="MoldID"><div>ID <span class="gt-sort-indicator"></span></div></th>

                                    <th style="width: 250px;" class="gt-cell-name" data-sort="MoldName"><div>型番 <span class="gt-sort-indicator"></span></div><span style="display:block; font-size:11px; opacity:0.6; font-weight:normal;">Mã Khuôn</span></th>

                                    <th style="width: 140px; text-align:center;" class="gt-cell-status" data-sort="TeflonStatusKey"><div>状況 <span class="gt-sort-indicator"></span></div><span style="display:block; font-size:11px; opacity:0.6; font-weight:normal;">Tình trạng</span></th>

                                    <th style="width: 120px;" class="gt-cell-date" data-sort="RequestedDate"><div>依頼日 <span class="gt-sort-indicator"></span></div><span style="display:block; font-size:11px; opacity:0.6; font-weight:normal;">Ngày Y/C</span></th>

                                    <th style="width: 140px;" class="gt-col-hidden-mobile" data-sort="RequestedByName"><div>依頼者 <span class="gt-sort-indicator"></span></div><span style="display:block; font-size:11px; opacity:0.6; font-weight:normal;">Người Y/C</span></th>

                                    <th style="width: 120px;" class="gt-col-hidden-mobile" data-sort="SentDate"><div>出荷日 <span class="gt-sort-indicator"></span></div></th>\n                                    <th style="width: 120px;" class="gt-col-hidden-mobile" data-sort="ExpectedDate"><div>受取予定 <span class="gt-sort-indicator"></span></div><span style="display:block; font-size:11px; opacity:0.6; font-weight:normal;">Dự kiến xong</span></th>

                                    <th style="width: 120px;" class="gt-col-hidden-mobile" data-sort="ReceivedDate"><div>完了日 <span class="gt-sort-indicator"></span></div></th>

                                    <th style="width: 140px;" class="gt-col-hidden-mobile" data-sort="SentByName"><div>担当者 <span class="gt-sort-indicator"></span></div></th>

                                    <th style="width: 200px;" class="gt-col-hidden-mobile">備考</th>

                                </tr>

                            </thead>

                            <tbody id="gtTableBody"></tbody>

                        </table>

                    </div>

                </div>

            `;



            this.tbody = document.getElementById('gtTableBody');

            this.searchInput = document.getElementById('gtSearchInput');

            this.statusFilter = document.getElementById('gtStatusFilter');



            this.bindEvents();



            if (window.DataManager && window.DataManager.data && Object.keys(window.DataManager.data).length > 0) {

                this.buildRows(window.DataManager.data);

            }

        },



        bindEvents: function () {

            document.querySelectorAll('.gt-stat-card').forEach(card => {

                card.addEventListener('click', (e) => {

                    document.querySelectorAll('.gt-stat-card').forEach(c => c.classList.remove('gt-stat-active'));

                    card.classList.add('gt-stat-active');

                    this.filterStatus = card.getAttribute('data-filter');



                    if (this.statusFilter) {

                        this.statusFilter.value = this.filterStatus === 'all' ? 'active' : this.filterStatus;

                    }

                    this.renderTable();

                });

            });



            const toggleBtn = document.getElementById('gtToggleViewBtn');

            if (toggleBtn) {

                toggleBtn.addEventListener('click', () => {

                    let cont = document.querySelector('.gt-table-container');

                    if (cont) {

                        let isUnlocked = cont.classList.toggle('table-unlocked');

                        let icon = toggleBtn.querySelector('i');

                        icon.className = isUnlocked ? 'fas fa-compress-arrows-alt' : 'fas fa-expand-arrows-alt';

                    }

                });

            }



            if (this.statusFilter) {

                this.statusFilter.addEventListener('change', (e) => {

                    this.filterStatus = e.target.value;

                    document.querySelectorAll('.gt-stat-card').forEach(c => c.classList.remove('gt-stat-active'));

                    this.renderTable();

                });

            }



            this.searchInput.addEventListener('input', () => {

                this.renderIndex = 0;

                this.tbody.innerHTML = '';

                this.renderTable();

            });



            this.container.querySelector('.gt-table-container').addEventListener('scroll', (e) => {

                const el = e.target;

                if (el.scrollHeight - el.scrollTop <= el.clientHeight + 150) {

                    this.renderNextChunk();

                }

            });



            const globalSearch = document.getElementById('searchInput');

            if (globalSearch) {

                globalSearch.addEventListener('input', (e) => {

                    if (window.CurrentSearchContext === 'teflon') {

                        this.searchInput.value = e.target.value;

                        this.renderIndex = 0;

                        if (this.tbody) this.tbody.innerHTML = '';

                        this.renderTable();

                    }

                });

            }



            const clearBtn = document.querySelector('.search-wrap .clear-btn');

            if (clearBtn) {

                clearBtn.addEventListener('click', () => {

                    if (window.CurrentSearchContext === 'teflon') {

                        this.searchInput.value = '';

                        this.renderIndex = 0;

                        if (this.tbody) this.tbody.innerHTML = '';

                        this.renderTable();

                    }

                });

            }



            document.getElementById('gtRefreshBtn').addEventListener('click', () => {

                if (window.DataManager && window.DataManager.loadAllData) {

                    document.getElementById('gtRefreshBtn').style.opacity = '0.5';

                    window.DataManager.loadAllData().then(() => {

                        this.buildRows(window.DataManager.data);

                        document.getElementById('gtRefreshBtn').style.opacity = '1';

                    });

                }

            });



            this.container.querySelectorAll('th[data-sort]').forEach(th => {

                th.addEventListener('click', (e) => {

                    if (e.target.classList.contains('gt-resizer')) return;

                    let col = th.dataset.sort;

                    if (this.sortCol === col) this.sortDir *= -1;

                    else { this.sortCol = col; this.sortDir = 1; }

                    this.renderTable();

                });

            });



            this.container.querySelectorAll('th:not(:first-child)').forEach(th => {

                let resizer = document.createElement('div');

                resizer.classList.add('gt-resizer');

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

        },



        buildRows: function (data) {

            if (!data || !data.teflonlog || !data.molds) return;



            const moldsArr = data.molds;

            const teflonArr = data.teflonlog;

            const employeesArr = data.employees || [];



            const moldLogMap = new Map();

            teflonArr.forEach(log => {

                const moldId = normalizeText(log.MoldID);

                if (!moldId) return;



                const prev = moldLogMap.get(moldId);

                if (!prev) { moldLogMap.set(moldId, log); return; }



                // --- Fix: Rely on TeflonLogID for Chronological Order ---
                // Do not rely on 'ExpectedDate' because future expected dates can arbitrarily override newer logs 
                // when things are completed earlier than expected.
                const parseId = (id) => {
                    const str = String(id || '0');
                    if (str.startsWith('TL')) return Number.MAX_SAFE_INTEGER - 10000000 + (parseInt(str.replace('TL', ''), 10) || 0);
                    return parseInt(str, 10) || 0;
                };

                const logId = parseId(log.TeflonLogID);
                const prevId = parseId(prev.TeflonLogID);

                if (logId > prevId) {
                    moldLogMap.set(moldId, log);
                } else if (logId === prevId && logId === 0) {
                    // Fallback to Dates ONLY if there are no valid IDs
                    const parseDate = (item) => parseFlexibleDate(item.UpdatedAt || item.UpdatedDate || item.CreatedDate || item.ReceivedDate || item.SentDate || item.RequestedDate || '1970-01-01');
                    const logDate = parseDate(log);
                    const prevDate = parseDate(prev);

                    const ldTime = logDate ? logDate.getTime() : 0;
                    const pdTime = prevDate ? prevDate.getTime() : 0;

                    if (ldTime > pdTime) {
                        moldLogMap.set(moldId, log);
                    }
                }
            });



            const rows = [];



            moldLogMap.forEach((log, moldId) => {

                const mold = moldsArr.find(m => normalizeText(m.MoldID) === String(moldId));

                const moldName = mold ? (mold.MoldName || mold.MoldCode || `ID:${moldId}`) : `ID:${moldId}`;

                const statusKey = getTeflonStatusKey({
                    TeflonStatus: log.TeflonStatus,
                    TeflonCoating: log.CoatingType || (mold ? mold.TeflonCoating : ''),
                    CoatingType: log.CoatingType,
                    ReceivedDate: log.ReceivedDate,
                    SentDate: log.SentDate
                }, true);



                rows.push({
                    MoldID: String(moldId),
                    MoldName: moldName,
                    TeflonStatusKey: statusKey,
                    TeflonStatusLabel: statusKeyToCoatingLabel(statusKey) || log.TeflonStatus || '',
                    RequestedByName: getEmployeeName(log.RequestedBy, employeesArr),
                    RequestedDate: log.RequestedDate || '',
                    SentByName: getEmployeeName(log.SentBy, employeesArr),
                    SentDate: log.SentDate || '', ExpectedDate: log.ExpectedDate || '',
                    ReceivedDate: log.ReceivedDate || '',
                    TeflonNotes: log.TeflonNotes || ''
                });

            });



            moldsArr.forEach(mold => {

                const moldId = normalizeText(mold.MoldID);

                if (!moldId || moldLogMap.has(moldId)) return;

                const coating = normalizeText(mold.TeflonCoating);

                const status = normalizeText(mold.TeflonStatus);



                if (!coating && !status) {
                    rows.push({
                        MoldID: String(moldId),
                        MoldName: mold.MoldName || mold.MoldCode || `ID:${moldId}`,
                        TeflonStatusKey: TEFLON_STATUS_KEYS.unprocessed,
                        TeflonStatusLabel: TEFLON_COATING_LABELS.unprocessed,
                        RequestedByName: '―', RequestedDate: '',
                        SentByName: '―', SentDate: '', ExpectedDate: '', ReceivedDate: '', TeflonNotes: ''
                    });
                } else {
                    const statusKey = getTeflonStatusKey({
                        TeflonStatus: status,
                        TeflonCoating: coating,
                        CoatingType: coating
                    }, false); // hasLog = false

                    rows.push({
                        MoldID: String(moldId),
                        MoldName: mold.MoldName || mold.MoldCode || `ID:${moldId}`,
                        TeflonStatusKey: statusKey || TEFLON_STATUS_KEYS.unprocessed,
                        TeflonStatusLabel: statusKeyToCoatingLabel(statusKey) || status || coating || '―',
                        RequestedByName: '―', RequestedDate: '',
                        SentByName: '―', SentDate: '', ExpectedDate: '', ReceivedDate: '', TeflonNotes: '※ 履歴データなし (Không có lịch sử)'
                    });
                }
            });



            this.allRows = rows;

            this.updateStats();

            this.renderTable();

        },



        updateStats: function () {

            const total = this.allRows.length;

            const pending = this.allRows.filter(r => r.TeflonStatusKey === TEFLON_STATUS_KEYS.pending).length;

            const approved = this.allRows.filter(r => r.TeflonStatusKey === TEFLON_STATUS_KEYS.approved).length;

            const processing = this.allRows.filter(r => r.TeflonStatusKey === TEFLON_STATUS_KEYS.processing).length;

            const completed = this.allRows.filter(r => r.TeflonStatusKey === TEFLON_STATUS_KEYS.completed).length;



            document.getElementById('gtStatTotal').innerText = total;

            document.getElementById('gtStatPending').innerText = pending;

            document.getElementById('gtStatApproved').innerText = approved;

            document.getElementById('gtStatProcessing').innerText = processing;

            document.getElementById('gtStatCompleted').innerText = completed;



            const badge = document.getElementById('teflon-nav-badge');

            if (badge) {

                if (approved > 0) {

                    badge.style.display = 'inline-flex';

                    badge.innerText = approved + pending;

                    badge.style.backgroundColor = 'var(--tef-badge-approved)';

                }

                else if (pending > 0) {

                    badge.style.display = 'inline-flex';

                    badge.innerText = pending;

                    badge.style.backgroundColor = 'var(--tef-badge-pending)';

                }

                else {

                    badge.style.display = 'none';

                }

            }

        },



        renderTable: function () {

            if (!this.tbody) return;

            const term = this.searchInput.value.trim().toLowerCase();



            let matches = this.allRows.filter(r => {

                if (this.filterStatus !== 'all') {

                    if (this.filterStatus === 'active') {

                        if (r.TeflonStatusKey !== TEFLON_STATUS_KEYS.pending &&

                            r.TeflonStatusKey !== TEFLON_STATUS_KEYS.approved &&

                            r.TeflonStatusKey !== TEFLON_STATUS_KEYS.processing) return false;

                    } else if (r.TeflonStatusKey !== this.filterStatus) return false;

                }



                if (term) {

                    const combo = `${r.MoldName} ${r.MoldID} ${r.TeflonNotes}`.toLowerCase();

                    const comboClean = combo.replace(/[-\s]/g, '');

                    const termClean = term.replace(/[-\s]/g, '');

                    if (!combo.includes(term) && !comboClean.includes(termClean)) return false;

                }

                return true;

            });



            let col = this.sortCol;

            let dir = this.sortDir;

            matches.sort((a, b) => {

                let valA = a[col] || ''; let valB = b[col] || '';

                if (col.includes('Date')) {

                    valA = valA ? new Date(valA).getTime() : 0;

                    valB = valB ? new Date(valB).getTime() : 0;

                }

                if (valA < valB) return -1 * dir;

                if (valA > valB) return 1 * dir;

                return 0;

            });



            this.container.querySelectorAll('th[data-sort]').forEach(th => {

                th.classList.remove('sorted-asc', 'sorted-desc');

                if (th.dataset.sort === col) {

                    th.classList.add(dir === 1 ? 'sorted-asc' : 'sorted-desc');

                }

            });



            this.matches = matches;

            this.renderIndex = 0;

            this.chunkSize = 50;



            if (matches.length === 0) {

                this.tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 20px; color: #94a3b8;">データが見つかりません (Không có dữ liệu)</td></tr>';

            } else {

                this.tbody.innerHTML = '';

                this.renderNextChunk();

            }

        },



        renderNextChunk: function () {

            if (!this.matches || this.renderIndex >= this.matches.length) return;



            let html = '';

            let end = Math.min(this.renderIndex + this.chunkSize, this.matches.length);



            for (let i = this.renderIndex; i < end; i++) {

                let r = this.matches[i];

                let badgeClass = 'tef-badge-unprocessed';

                let rowClass = 'tef-row-unprocessed';

                if (r.TeflonStatusKey === TEFLON_STATUS_KEYS.pending) { badgeClass = 'tef-badge-pending'; rowClass = 'tef-row-pending'; }

                else if (r.TeflonStatusKey === TEFLON_STATUS_KEYS.approved) { badgeClass = 'tef-badge-approved'; rowClass = 'tef-row-approved'; }

                else if (r.TeflonStatusKey === TEFLON_STATUS_KEYS.processing) { badgeClass = 'tef-badge-processing'; rowClass = 'tef-row-processing'; }

                else if (r.TeflonStatusKey === TEFLON_STATUS_KEYS.completed) { badgeClass = 'tef-badge-completed'; rowClass = 'tef-row-completed'; }



                const reqDateObj = parseFlexibleDate(r.RequestedDate);

                let reqDateStr = formatDate(r.RequestedDate);

                const warningClass = getRequestDateWarningClass(r.TeflonStatusKey, reqDateObj);



                html += `

                    <tr class="${rowClass}" data-id="${escapeHtml(r.MoldID)}">

                        <td class="gt-cell-id">${escapeHtml(r.MoldID)}</td>

                        <td class="gt-cell-name"><a href="javascript:void(0)" onclick="const d=window.DataManager&&window.DataManager.data&&window.DataManager.data.molds; const it=d?d.find(x=>x.MoldID==='${escapeHtml(r.MoldID)}'):null; if(window.DetailPanel) window.DetailPanel.open(it||{MoldID:'${escapeHtml(r.MoldID)}'}, 'mold'); else if(window.MobileDetailModal) MobileDetailModal.show({MoldID:'${escapeHtml(r.MoldID)}'}, 'mold')" style="color:var(--color-primary);">${escapeHtml(r.MoldName)}</a></td>

                        <td class="gt-cell-status"><span class="tef-badge ${badgeClass}">${getShortStatusLabel(r.TeflonStatusKey)}</span></td>

                        <td class="gt-cell-date"><span class="${warningClass}" style="display:inline-block;">${reqDateStr}</span></td>

                        <td class="gt-col-hidden-mobile">${escapeHtml(r.RequestedByName)}</td>

                        <td class="gt-cell-date gt-col-hidden-mobile">${formatDate(r.SentDate)}</td>\n                        <td class="gt-cell-date gt-col-hidden-mobile">${formatDate(r.ExpectedDate)}</td>

                        <td class="gt-cell-date gt-col-hidden-mobile">${formatDate(r.ReceivedDate)}</td>

                        <td class="gt-col-hidden-mobile">${escapeHtml(r.SentByName)}</td>

                        <td class="gt-col-hidden-mobile" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px;" title="${escapeHtml(r.TeflonNotes)}">${escapeHtml(r.TeflonNotes)}</td>

                    </tr>

                `;

            }



            this.tbody.insertAdjacentHTML('beforeend', html);

            this.renderIndex = end;

        }

    };



    const initOrUpdateTeflon = () => {
        if (!window.GlobalTeflonModule) return;
        if (!window.GlobalTeflonModule.container) {
            window.GlobalTeflonModule.init();
        } else if (window.DataManager && window.DataManager.data) {
            window.GlobalTeflonModule.buildRows(window.DataManager.data);
        }
    };

    document.addEventListener('data-manager:ready', initOrUpdateTeflon);

    document.addEventListener('DOMContentLoaded', () => {
        if (window.DataManager && window.DataManager.isReady) {
            initOrUpdateTeflon();
        }
    });

})();


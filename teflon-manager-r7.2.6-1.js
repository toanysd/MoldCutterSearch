/*
teflon-manager-r7.2.6-1.js

テフロン管理 / Quản lý khuôn mạ Teflon - Unified with History View Pattern

CHANGELOG r7.2.6 - 2025-12-25 08:59 JST
------------------------------------------------
FIX - Top stats (Total/待/承/進/完) now count from ALL data (allRows), not current filteredRows.
NEW - Stats badges are clickable filters (click anywhere in the stat card = filter).
KEEP - Filter group logic unchanged (status select/search/date inputs remain as-is; badge click does not modify them).
FIX - Filter group default collapsed (hidden) on open.
KEEP - All teflon-specific features:
  - Pagination 50 rows/page
  - Auto-refresh + Cross-tab sync
  - Status-based conditional formatting
  - Date warning classes (7/9/11/14 days)
  - Process manager integration
  - Nav badge with Kanji (承, 待, 進)
  - Lock/Unlock table behavior
  - CSV/Print/Mail export
  - Swipe to close on mobile

Dependencies:
- window.DataManager (molds, teflonlog, employees)
- window.TeflonProcessManager (optional)
- window.MobileDetailModal (optional)

Updated: 2025-12-25 08:59 JST
*/

(function() {
'use strict';

/* ========================================
   STATE MANAGEMENT
======================================== */

let allRows = [];
let filteredRows = [];

let currentSort = { column: 'RequestedDate', order: 'desc' };
let currentFilter = 'active'; // active, unprocessed, pending, approved, processing, completed, all

let isRowsBuilt = false;
let isTableLocked = true;

let teflonProcessManagerReady = false;
let teflonProcessManagerRetries = 0;
const MAX_MANAGER_RETRIES = 5;

// Pagination state
let currentPage = 1;
const rowsPerPage = 50;

// Auto-refresh state
let autoRefreshTimer = null;
let lastRefreshTime = 0;
const AUTO_REFRESH_INTERVAL = 60000; // 60 seconds
const MIN_REFRESH_GAP = 5000; // 5 seconds minimum gap between refreshes

// Filter group collapse state (default collapsed per requirement)
let filterGroupCollapsed = true;

// NEW: Badge filter state (independent from filter group UI)
// null => no badge filter (use currentFilter dropdown as usual)
// 'all' => show all status
// 'pending'/'approved'/'processing'/'completed' => show that status
let badgeFilterKey = null;

/* ========================================
   STATUS MAPPING CONSTANTS
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

/* ========================================
   HELPER FUNCTIONS
======================================== */

function normalizeText(v) {
  return String(v || '').trim();
}

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

  // Try parsing formats like "18-Dec-24"
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

  // Try YYYY-MM-DD or YYYY/MM/DD
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

/* ========================================
   SMART SEARCH FUNCTIONS - History View Pattern
======================================== */

function normalizeSearchValue(val) {
  val = String(val || '').trim().toLowerCase();
  const compact = val.replace(/-/g, ''); // Remove separators
  return { original: val, compact };
}

function matchesSearch(row, searchNorm) {
  if (!searchNorm.original) return true;

  // Fields to search
  const fields = [
    row.MoldName,
    row.MoldID,
    row.TeflonStatusLabel,
    row.RequestedByName,
    row.SentByName,
    row.TeflonNotes,
    formatDate(row.RequestedDate),
    formatDate(row.SentDate),
    formatDate(row.ReceivedDate)
  ];

  for (let field of fields) {
    const fieldVal = String(field || '').toLowerCase();

    // Try original search term
    if (fieldVal.indexOf(searchNorm.original) !== -1) return true;

    // Try compact (no separators)
    const fieldCompact = fieldVal.replace(/-/g, '');
    if (fieldCompact.indexOf(searchNorm.compact) !== -1) return true;

    // Smart date matching (digits only)
    if (searchNorm.original.match(/^\d+$/)) {
      if (matchesDateSearch(field, searchNorm.original)) return true;
    }
  }

  return false;
}

// Smart date search - Support multiple formats
function matchesDateSearch(dateStr, searchTerm) {
  if (!dateStr || !searchTerm) return false;
  const d = parseFlexibleDate(dateStr);
  if (!d || isNaN(d.getTime())) return false;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  // Generate all possible formats
  const formats = [
    `${y}${m}${day}`,   // 20251218
    `${y}-${m}-${day}`, // 2025-12-18
    `${m}${day}`,       // 1218
    `${y}${m}`,         // 202512
    `${y}-${m}`         // 2025-12
  ];

  const search = searchTerm.replace(/-/g, ''); // Remove separators
  return formats.some(fmt => fmt.replace(/-/g, '').includes(search));
}

/* ========================================
   STATUS MAPPING FUNCTIONS
======================================== */

function mapCoatingToStatusKey(coating) {
  const v = normalizeText(coating);
  if (!v) return '';

  // Exact matches with labels
  if (v === TEFLON_COATING_LABELS.pending) return TEFLON_STATUS_KEYS.pending;
  if (v === TEFLON_COATING_LABELS.approved) return TEFLON_STATUS_KEYS.approved;
  if (v === TEFLON_COATING_LABELS.processing) return TEFLON_STATUS_KEYS.processing;
  if (v === TEFLON_COATING_LABELS.completed) return TEFLON_STATUS_KEYS.completed;

  // Kanji matches
  if (v === '待') return TEFLON_STATUS_KEYS.pending;
  if (v === '承') return TEFLON_STATUS_KEYS.approved;
  if (v === '進') return TEFLON_STATUS_KEYS.processing;
  if (v === '完') return TEFLON_STATUS_KEYS.completed;

  // English matches
  const lower = v.toLowerCase();
  if (lower === 'pending') return TEFLON_STATUS_KEYS.pending;
  if (lower === 'approved') return TEFLON_STATUS_KEYS.approved;
  if (lower === 'processing') return TEFLON_STATUS_KEYS.processing;
  if (lower === 'sent') return TEFLON_STATUS_KEYS.processing;
  if (lower === 'completed' || lower === 'coated') return TEFLON_STATUS_KEYS.completed;

  return '';
}

function logStatusToStatusKey(logStatus) {
  const v = normalizeText(logStatus).toLowerCase();
  if (!v) return '';

  if (v === 'pending') return TEFLON_STATUS_KEYS.pending;
  if (v === 'approved') return TEFLON_STATUS_KEYS.approved;
  if (v === 'processing') return TEFLON_STATUS_KEYS.processing;
  if (v === 'completed') return TEFLON_STATUS_KEYS.completed;
  if (v === 'sent') return TEFLON_STATUS_KEYS.processing;

  return '';
}

function getTeflonStatusKey(row, hasLog) {
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

function getLongStatusLabelHTML(statusKey) {
  const labels = {
    unprocessed: '―<br><span style="font-size:11px;opacity:0.85">Chưa xử lý</span>',
    pending: '待<br><span style="font-size:11px;opacity:0.85">Chờ phê duyệt</span>',
    approved: '承<br><span style="font-size:11px;opacity:0.85">Đã duyệt, chờ gửi</span>',
    processing: '進<br><span style="font-size:11px;opacity:0.85">Đang mạ</span>',
    completed: '完<br><span style="font-size:11px;opacity:0.85">Hoàn thành</span>'
  };
  return labels[statusKey] || '―';
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
   DATA LOADING - BUILD ROWS
======================================== */

function buildRows() {
  console.log('[TeflonManager r7.2.6] buildRows() called');

  const dm = window.DataManager;
  if (!dm || !dm.data) {
    console.error('[TeflonManager] DataManager not ready');
    return;
  }

  const { teflonlog, molds, employees } = dm.data;
  console.log('[TeflonManager] Data:', {
    teflonlog: (teflonlog || []).length,
    molds: (molds || []).length,
    employees: (employees || []).length
  });

  const teflonlogArr = Array.isArray(teflonlog) ? teflonlog : [];
  const moldsArr = Array.isArray(molds) ? molds : [];
  const employeesArr = Array.isArray(employees) ? employees : [];

  // Build map of latest teflonlog entry per mold
  const moldLogMap = new Map();
  teflonlogArr.forEach(log => {
    const moldId = normalizeText(log.MoldID);
    if (!moldId) return;

    const prev = moldLogMap.get(moldId);
    if (!prev) {
      moldLogMap.set(moldId, log);
      return;
    }

    const logId = parseInt(log.TeflonLogID || 0, 10);
    const prevId = parseInt(prev.TeflonLogID || 0, 10);

    if (logId > prevId) {
      moldLogMap.set(moldId, log);
    } else if (logId === prevId && logId === 0) {
      // If both IDs are 0, compare by date
      const logDate = parseFlexibleDate(log.UpdatedDate || log.SentDate || log.RequestedDate || log.CreatedDate);
      const prevDate = parseFlexibleDate(prev.UpdatedDate || prev.SentDate || prev.RequestedDate || prev.CreatedDate);
      if (logDate && (!prevDate || logDate > prevDate)) {
        moldLogMap.set(moldId, log);
      }
    }
  });

  const rows = [];

  // Add rows from teflonlog (latest per mold)
  moldLogMap.forEach((log, moldId) => {
    const mold = moldsArr.find(m => normalizeText(m.MoldID) === String(moldId));
    const moldName = mold ? (mold.MoldName || mold.MoldCode || `ID:${moldId}`) : `ID:${moldId}`;

    const statusKey = getTeflonStatusKey({
      TeflonStatus: log.TeflonStatus,
      TeflonCoating: log.CoatingType || (mold ? mold.TeflonCoating : ''),
      CoatingType: log.CoatingType
    }, true);

    rows.push({
      TeflonLogID: log.TeflonLogID || '',
      MoldID: String(moldId),
      MoldName: moldName,
      TeflonStatus: log.TeflonStatus || '',
      TeflonStatusKey: statusKey,
      TeflonStatusLabel: statusKeyToCoatingLabel(statusKey) || log.TeflonStatus || '',
      RequestedBy: log.RequestedBy || '',
      RequestedByName: getEmployeeName(log.RequestedBy, employeesArr),
      RequestedDate: log.RequestedDate || '',
      SentBy: log.SentBy || '',
      SentByName: getEmployeeName(log.SentBy, employeesArr),
      SentDate: log.SentDate || '',
      ReceivedDate: log.ReceivedDate || '',
      ExpectedDate: log.ExpectedDate || '',
      CoatingType: log.CoatingType || '',
      Reason: log.Reason || '',
      TeflonCost: log.TeflonCost || '',
      Quality: log.Quality || '',
      TeflonNotes: log.TeflonNotes || '',
      CreatedDate: log.CreatedDate || '',
      UpdatedBy: log.UpdatedBy || '',
      UpdatedDate: log.UpdatedDate || '',
      source: 'teflonlog',
      hasLog: true
    });
  });

  // Add unprocessed molds (no log, no coating/status in molds.csv)
  moldsArr.forEach(mold => {
    const moldId = normalizeText(mold.MoldID);
    if (!moldId) return;
    if (moldLogMap.has(moldId)) return;

    const coating = normalizeText(mold.TeflonCoating);
    const status = normalizeText(mold.TeflonStatus);

    // ONLY add if NO coating AND NO status
    if (!coating && !status) {
      const moldName = mold.MoldName || mold.MoldCode || `ID:${moldId}`;
      rows.push({
        TeflonLogID: '',
        MoldID: String(moldId),
        MoldName: moldName,
        TeflonStatus: '',
        TeflonStatusKey: TEFLON_STATUS_KEYS.unprocessed,
        TeflonStatusLabel: TEFLON_COATING_LABELS.unprocessed,
        RequestedBy: '',
        RequestedByName: '―',
        RequestedDate: '',
        SentBy: '',
        SentByName: '―',
        SentDate: '',
        ReceivedDate: '',
        ExpectedDate: '',
        CoatingType: '',
        Reason: '',
        TeflonCost: '',
        Quality: '',
        TeflonNotes: '',
        CreatedDate: '',
        UpdatedBy: '',
        UpdatedDate: '',
        source: 'molds',
        hasLog: false
      });
    }
  });

  allRows = rows;
  isRowsBuilt = true;

  console.log('[TeflonManager] Built rows:', rows.length);

  // Update stats for ALL data (top badges)
  updateStats();
}

/* ========================================
   BADGE FILTER HELPERS
======================================== */

function getEffectiveStatusFilterKey() {
  // Badge filter is independent and does NOT change filter group UI.
  // If badgeFilterKey is set, it takes effect; otherwise use dropdown currentFilter.
  return (badgeFilterKey !== null) ? badgeFilterKey : currentFilter;
}

function updateBadgeFilterHighlight() {
  const cards = document.querySelectorAll('.tef-stat-card[data-badge-filter]');
  if (!cards || cards.length === 0) return;

  cards.forEach(card => {
    const key = card.getAttribute('data-badge-filter');
    if (!key) return;

    // active highlight if badgeFilterKey equals key
    if (badgeFilterKey === key) {
      card.classList.add('tef-stat-active');
      card.setAttribute('aria-pressed', 'true');
    } else {
      card.classList.remove('tef-stat-active');
      card.setAttribute('aria-pressed', 'false');
    }
  });
}

function setBadgeFilter(key) {
  // key: 'all'|'pending'|'approved'|'processing'|'completed' (or null)
  badgeFilterKey = key;
  updateBadgeFilterHighlight();

  currentPage = 1;
  applyFilterAndSort();

  // Stats are always ALL data; keep stable
  updateStats();
}

/* ========================================
   FILTER & SORT
======================================== */

function applyFilterAndSort() {
  const searchVal = document.getElementById('teflon-search-input')?.value || '';
  const searchNorm = normalizeSearchValue(searchVal);

  const dateFrom = document.getElementById('teflon-date-from')?.value || '';
  const dateTo = document.getElementById('teflon-date-to')?.value || '';
  const dateFromObj = dateFrom ? parseFlexibleDate(dateFrom) : null;
  const dateToObj = dateTo ? parseFlexibleDate(dateTo) : null;

  // Filter
  filteredRows = allRows.filter(row => {
    // Status filter (effective)
    const effective = getEffectiveStatusFilterKey();

    if (effective !== 'all') {
      if (effective === 'active') {
        const ok = (
          row.TeflonStatusKey === TEFLON_STATUS_KEYS.pending ||
          row.TeflonStatusKey === TEFLON_STATUS_KEYS.approved ||
          row.TeflonStatusKey === TEFLON_STATUS_KEYS.processing
        );
        if (!ok) return false;
      } else {
        if (row.TeflonStatusKey !== effective) return false;
      }
    }

    // Date range filter (RequestedDate)
    // (keep existing filter group behavior; date inputs are part of filter group)
    if (dateFromObj || dateToObj) {
      const reqDateObj = parseFlexibleDate(row.RequestedDate);
      if (!reqDateObj) return false;

      if (dateFromObj && reqDateObj < dateFromObj) return false;

      if (dateToObj) {
        // inclusive end-of-day
        const end = new Date(dateToObj.getFullYear(), dateToObj.getMonth(), dateToObj.getDate(), 23, 59, 59, 999);
        if (reqDateObj > end) return false;
      }
    }

    // Smart search
    if (!matchesSearch(row, searchNorm)) return false;

    return true;
  });

  // Sort
  const col = currentSort.column;
  const order = currentSort.order;

  filteredRows.sort((a, b) => {
    let valA = a[col];
    let valB = b[col];

    // Date columns - compare by timestamp
    if (String(col).indexOf('Date') !== -1) {
      const dA = parseFlexibleDate(valA);
      const dB = parseFlexibleDate(valB);
      const tA = dA ? dA.getTime() : 0;
      const tB = dB ? dB.getTime() : 0;
      return order === 'asc' ? (tA - tB) : (tB - tA);
    }

    // String comparison
    valA = String(valA || '').toLowerCase();
    valB = String(valB || '').toLowerCase();

    if (valA < valB) return order === 'asc' ? -1 : 1;
    if (valA > valB) return order === 'asc' ? 1 : -1;
    return 0;
  });

  // Reset to page 1 on filter/sort change
  currentPage = 1;

  renderTable();
  updateSortIndicators();
  updateSummaryBar();
  updatePaginationButtons();
}

/* ========================================
   PAGINATION
======================================== */

function getTotalPages() {
  return Math.ceil(filteredRows.length / rowsPerPage);
}

function goToPage(page) {
  const totalPages = getTotalPages();
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;

  currentPage = page;
  renderTable();
  updateSummaryBar();
  updatePaginationButtons();
}

function previousPage() {
  if (currentPage > 1) goToPage(currentPage - 1);
}

function nextPage() {
  const totalPages = getTotalPages();
  if (currentPage < totalPages) goToPage(currentPage + 1);
}

function updatePaginationButtons() {
  const prevBtn = document.getElementById('teflon-prev-btn');
  const nextBtn = document.getElementById('teflon-next-btn');
  const totalPages = getTotalPages();

  if (prevBtn) prevBtn.disabled = (currentPage <= 1);
  if (nextBtn) nextBtn.disabled = (currentPage >= totalPages || totalPages === 0);
}

function updateSummaryBar() {
  const summary = document.querySelector('.tef-summary');
  if (!summary) return;

  const totalPages = getTotalPages();
  const start = (currentPage - 1) * rowsPerPage + 1;
  const end = Math.min(currentPage * rowsPerPage, filteredRows.length);

  if (filteredRows.length === 0) {
    summary.textContent = '表示中... / Đang hiển thị...';
    return;
  }

  summary.innerHTML = `<strong>${start}-${end}</strong> / <strong>${filteredRows.length}</strong> | Page <strong>${currentPage}</strong>/<strong>${totalPages}</strong>`;
}

/* ========================================
   RENDER TABLE - WITH PAGINATION
======================================== */

function renderTable() {
  const tbody = document.getElementById('teflon-tbody');
  if (!tbody) return;

  if (!filteredRows || filteredRows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="padding:16px;text-align:center;color:#888">Không có dữ liệu</td></tr>';
    return;
  }

  const start = (currentPage - 1) * rowsPerPage;
  const end = Math.min(start + rowsPerPage, filteredRows.length);
  const pageRows = filteredRows.slice(start, end);

  console.log(`[TeflonManager] Rendering page ${currentPage}: rows ${start + 1}-${end} of ${filteredRows.length}`);

  let html = '';

  pageRows.forEach(row => {
    const moldId = row.MoldID || '―';
    const moldName = row.MoldName || '―';

    const statusKey = row.TeflonStatusKey;
    const statusShort = getShortStatusLabel(statusKey);

    const reqDateObj = parseFlexibleDate(row.RequestedDate);
    const reqDate = formatDate(row.RequestedDate);
    const reqBy = row.RequestedByName || '―';

    const sentDate = formatDate(row.SentDate);
    const recvDate = formatDate(row.ReceivedDate);
    const sentBy = row.SentByName || '―';

    const notes = row.TeflonNotes || '―';

    let badgeClass = 'tef-badge-unprocessed';
    let rowClass = 'tef-row-unprocessed';

    if (statusKey === TEFLON_STATUS_KEYS.unprocessed) {
      badgeClass = 'tef-badge-unprocessed';
      rowClass = 'tef-row-unprocessed';
    } else if (statusKey === TEFLON_STATUS_KEYS.pending) {
      badgeClass = 'tef-badge-pending';
      rowClass = 'tef-row-pending';
    } else if (statusKey === TEFLON_STATUS_KEYS.approved) {
      badgeClass = 'tef-badge-approved';
      rowClass = 'tef-row-approved';
    } else if (statusKey === TEFLON_STATUS_KEYS.processing) {
      badgeClass = 'tef-badge-processing';
      rowClass = 'tef-row-processing';
    } else if (statusKey === TEFLON_STATUS_KEYS.completed) {
      badgeClass = 'tef-badge-completed';
      rowClass = 'tef-row-completed';
    }

    const reqDateCellClass = getRequestDateWarningClass(statusKey, reqDateObj);

    html += `<tr data-mold-id="${escapeHtml(row.MoldID)}" class="${rowClass}" style="cursor:pointer;border-bottom:1px solid #eee">
      <td class="tef-col-id" style="padding:8px 10px;min-width:38px;max-width:50px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(moldId)}</td>
      <td class="tef-col-name" style="padding:8px 10px;min-width:120px;max-width:250px">
        <a href="javascript:void(0)" data-action="open-detail" title="${escapeHtml(moldName)}">${escapeHtml(moldName)}</a>
      </td>
      <td class="tef-col-status" style="padding:8px 10px;text-align:center">
        <span class="tef-status-badge ${badgeClass}" data-action="view-status" title="${escapeHtml(statusShort)}">${statusShort}</span>
      </td>
      <td class="tef-col-req-date" style="padding:8px 10px;text-align:center">
        <span class="${reqDateCellClass}" style="display:inline-block">${reqDate}</span>
      </td>
      <td class="tef-col-req-by" style="padding:8px 10px">${escapeHtml(reqBy)}</td>
      <td class="tef-col-sent-date" style="padding:8px 10px;text-align:center">${sentDate}</td>
      <td class="tef-col-recv-date" style="padding:8px 10px;text-align:center">${recvDate}</td>
      <td class="tef-col-sent-by" style="padding:8px 10px">${escapeHtml(sentBy)}</td>
      <td class="tef-col-notes" style="padding:8px 10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(notes)}</td>
    </tr>`;
  });

  tbody.innerHTML = html;

  Array.from(tbody.querySelectorAll('tr[data-mold-id]')).forEach(tr => {
    tr.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      const moldId = tr.getAttribute('data-mold-id');
      const row = filteredRows.find(r => String(r.MoldID) === String(moldId));
      if (!row) return;

      if (target) {
        const action = target.getAttribute('data-action');

        if (action === 'open-detail') {
          e.preventDefault();
          e.stopPropagation();
          openMobileDetailModal(row);
          return;
        }

        if (action === 'view-status') {
          e.preventDefault();
          e.stopPropagation();
          openDetailModal(row);
          return;
        }
      }

      e.preventDefault();
      e.stopPropagation();
      openMobileDetailModal(row);
    });
  });
}

/* ========================================
   SORT INDICATORS
======================================== */

function updateSortIndicators() {
  const headers = document.querySelectorAll('.teflon-table thead th[data-sort]');
  headers.forEach(th => {
    const col = th.getAttribute('data-sort');
    const indicator = th.querySelector('.sort-indicator');
    if (!indicator) return;

    if (col === currentSort.column) {
      indicator.textContent = currentSort.order === 'asc' ? '▲' : '▼';
    } else {
      indicator.textContent = '';
    }
  });
}

/* ========================================
   PROCESS MANAGER INTEGRATION
======================================== */

function ensureTeflonProcessManagerReady() {
  return new Promise((resolve, reject) => {
    if (window.TeflonProcessManager && typeof window.TeflonProcessManager.openModal === 'function') {
      console.log('[TeflonManager] TeflonProcessManager is ready');
      teflonProcessManagerReady = true;
      resolve(true);
      return;
    }

    if (teflonProcessManagerRetries >= MAX_MANAGER_RETRIES) {
      console.warn('[TeflonManager] Max retries reached, TeflonProcessManager not available');
      reject(new Error('TeflonProcessManager not available'));
      return;
    }

    teflonProcessManagerRetries++;
    console.log(`[TeflonManager] Waiting for TeflonProcessManager... (attempt ${teflonProcessManagerRetries}/${MAX_MANAGER_RETRIES})`);

    setTimeout(() => {
      ensureTeflonProcessManagerReady().then(resolve).catch(reject);
    }, 500);
  });
}

function openProcessManager(row) {
  if (!row || !row.MoldID) return;

  console.log('[TeflonManager] Opening process manager for:', row.MoldID);

  if (window.TeflonProcessManager && typeof window.TeflonProcessManager.openPanel === 'function') {
    const dm = window.DataManager?.data;
    let item = null;

    if (dm && Array.isArray(dm.molds)) {
      item = dm.molds.find(m => String(m.MoldID).trim() === String(row.MoldID).trim());
    }

    if (!item) item = { MoldID: String(row.MoldID) };
    window.TeflonProcessManager.openPanel(item);
    return;
  }

  ensureTeflonProcessManagerReady()
    .then(() => {
      if (window.TeflonProcessManager && typeof window.TeflonProcessManager.openModal === 'function') {
        console.log('[TeflonManager] Opening TeflonProcessManager modal');
        window.TeflonProcessManager.openModal(row);
      } else {
        throw new Error('TeflonProcessManager.openModal not available');
      }
    })
    .catch(err => {
      console.warn('[TeflonManager] Could not open TeflonProcessManager:', err);
      try {
        window.dispatchEvent(new CustomEvent('teflon:open-process-manager', {
          detail: { moldId: row.MoldID, teflonRow: row, source: 'teflon-manager' }
        }));
      } catch (e) {
        console.warn('[TeflonManager] Process manager not available');
      }
    });
}

/* ========================================
   DETAIL MODAL
======================================== */

function openDetailModal(row) {
  const existing = document.getElementById('teflon-detail-modal');
  if (existing) existing.remove();

  const statusHtml = getLongStatusLabelHTML(row.TeflonStatusKey);

  function detailRow(label, valueHtml) {
    return `<tr style="border-bottom:1px solid #eee">
      <th style="padding:8px;text-align:left;background:#f5f5f5;width:40%;font-size:11px;vertical-align:top">${label}</th>
      <td style="padding:8px;font-size:12px">${valueHtml}</td>
    </tr>`;
  }

  const html = `<div id="teflon-detail-modal" class="tef-modal-overlay" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:12000;display:flex;align-items:center;justify-content:center">
    <div class="tef-modal-content" style="background:#fff;width:90%;max-width:720px;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.3);max-height:90vh;display:flex;flex-direction:column">
      <div class="tef-modal-header" style="padding:8px 12px;background:#2e7d32;color:#fff;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center;cursor:grab">
        <div style="display:flex;flex-direction:column">
          <div style="font-size:15px;font-weight:800;line-height:1.1">テフロン</div>
          <div style="font-size:12px;opacity:0.9;line-height:1.1">Chi tiết khuôn mạ Teflon</div>
        </div>
        <button class="modal-close-x" style="background:none;border:none;color:#fff;font-size:22px;cursor:pointer;line-height:1">×</button>
      </div>

      <div class="tef-modal-body" style="padding:12px 16px;overflow-y:auto;flex:1">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          ${detailRow('Khuôn', escapeHtml(row.MoldName || '―'))}
          ${detailRow('Trạng thái', '<strong>' + statusHtml + '</strong>')}
          ${detailRow('Ngày yêu cầu', escapeHtml(formatDate(row.RequestedDate)))}
          ${detailRow('Người yêu cầu', escapeHtml(row.RequestedByName || '―'))}
          ${detailRow('Ngày gửi', escapeHtml(formatDate(row.SentDate)))}
          ${detailRow('Ngày nhận', escapeHtml(formatDate(row.ReceivedDate)))}
          ${detailRow('Ngày dự kiến', escapeHtml(formatDate(row.ExpectedDate)))}
          ${detailRow('Người phụ trách', escapeHtml(row.SentByName || '―'))}
          ${detailRow('Loại coating', escapeHtml(row.CoatingType || '―'))}
          ${detailRow('Lý do', escapeHtml(row.Reason || '―'))}
          ${detailRow('Chi phí', escapeHtml(row.TeflonCost || '―'))}
          ${detailRow('Chất lượng', escapeHtml(row.Quality || '―'))}
          ${detailRow('Ghi chú', escapeHtml(row.TeflonNotes || '―'))}
          ${detailRow('Nguồn', escapeHtml(row.source === 'teflonlog' ? 'teflonlog.csv' : 'molds.csv'))}
        </table>
      </div>

      <div class="tef-modal-footer" style="padding:10px 12px;border-top:1px solid #ddd;display:flex;justify-content:space-between;gap:10px">
        <button class="modal-update-btn tef-btn tef-btn-blue" type="button" style="min-width:170px">
          <div class="jp">処理</div>
          <div class="vi">Cập nhật trạng thái</div>
        </button>

        <button class="modal-close-btn tef-btn tef-btn-green" type="button" style="min-width:120px">
          <div class="jp">閉</div>
          <div class="vi">Đóng</div>
        </button>
      </div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', html);

  const overlay = document.getElementById('teflon-detail-modal');
  const modalContent = overlay?.querySelector('.tef-modal-content');
  const modalHeader = overlay?.querySelector('.tef-modal-header');

  const closeModal = () => {
    if (overlay) overlay.remove();
  };

  const closeX = overlay?.querySelector('.modal-close-x');
  if (closeX) closeX.addEventListener('click', closeModal);

  const closeBtn = overlay?.querySelector('.modal-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeModal);

  const updateBtn = overlay?.querySelector('.modal-update-btn');
  if (updateBtn) {
    updateBtn.addEventListener('click', () => {
      closeModal();
      openProcessManager(row);
    });
  }

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }

  if (modalHeader && modalContent) {
    attachSwipeToClose(modalHeader, modalContent, closeModal);
  }
}

/* ========================================
   MOBILE DETAIL MODAL INTEGRATION
======================================== */

function openMobileDetailModal(row) {
  if (!row) {
    console.warn('[TeflonManager] No row data provided');
    return;
  }

  console.log('[TeflonManager] Opening MobileDetailModal for:', row.MoldID, row.MoldName);

  if (typeof window.MobileDetailModal === 'undefined' || !window.MobileDetailModal) {
    console.warn('[TeflonManager] MobileDetailModal not available, using fallback');
    openDetailModal(row);
    return;
  }

  try {
    const dm = window.DataManager?.data;
    if (!dm || !dm.molds) {
      console.warn('[TeflonManager] DataManager not ready');
      openDetailModal(row);
      return;
    }

    const moldId = String(row.MoldID).trim();
    const fullMoldItem = dm.molds.find(m => String(m.MoldID).trim() === moldId);

    if (!fullMoldItem) {
      console.warn('[TeflonManager] Mold not found in DataManager:', moldId);
      openDetailModal(row);
      return;
    }

    window.MobileDetailModal.show(fullMoldItem, 'mold');
  } catch (err) {
    console.error('[TeflonManager] Error opening MobileDetailModal:', err);
    openDetailModal(row);
  }
}

/* ========================================
   NAV BADGE UPDATE
======================================== */

function updateNavBadge() {
  const btn = document.getElementById('nav-teflon-btn');
  if (!btn) return;

  let badge = btn.querySelector('.tef-nav-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'tef-nav-badge tef-nav-badge-hidden';
    btn.appendChild(badge);
  }

  const hasPending = allRows.some(r => r.TeflonStatusKey === TEFLON_STATUS_KEYS.pending);
  const hasApproved = allRows.some(r => r.TeflonStatusKey === TEFLON_STATUS_KEYS.approved);
  const hasProcessing = allRows.some(r => r.TeflonStatusKey === TEFLON_STATUS_KEYS.processing);

  badge.classList.remove('tef-nav-badge-hidden', 'tef-nav-badge-approved', 'tef-nav-badge-pending', 'tef-nav-badge-processing');

  // Priority: Approved > Pending > Processing (kept from r7.2.5)
  if (hasApproved) {
    badge.classList.add('tef-nav-badge-approved');
    badge.textContent = '承';
  } else if (hasPending) {
    badge.classList.add('tef-nav-badge-pending');
    badge.textContent = '待';
  } else if (hasProcessing) {
    badge.classList.add('tef-nav-badge-processing');
    badge.textContent = '進';
  } else {
    badge.classList.add('tef-nav-badge-hidden');
    badge.textContent = '';
  }
}

/* ========================================
   EXPORT / PRINT / MAIL
======================================== */

function exportToCsv() {
  if (!filteredRows || filteredRows.length === 0) {
    alert('Không có dữ liệu để xuất.');
    return;
  }

  const BOM = '\uFEFF';
  const headers = [
  'No',
  '型番',
  '状況',
  '依頼日',
  '依頼者',
  '出荷日',
  '完了日',
  '担当者',
  '備考'
];

  const lines = [BOM + headers.join(',')];

  filteredRows.forEach((r, idx) => {
    const row = [
      idx + 1,
      r.MoldName,
      r.TeflonStatusLabel,
      formatDate(r.RequestedDate),
      r.RequestedByName,
      formatDate(r.SentDate),
      formatDate(r.ReceivedDate),
      r.SentByName,
      String(r.TeflonNotes || '').replace(/,/g, ' ')
    ];

    const csvRow = row.map(v => {
      const s = v == null ? '' : String(v);
      return '"' + s.replace(/"/g, '""') + '"';
    }).join(',');

    lines.push(csvRow);
  });

  const csvContent = lines.join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  const nowKey = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  a.href = url;
  a.download = `teflon-list-${nowKey}.csv`;

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function printView() {
  if (!filteredRows || filteredRows.length === 0) {
    alert('Không có dữ liệu để in.');
    return;
  }

  const win = window.open('', '_blank');
  if (!win) return;

  let rowsHtml = '';
  filteredRows.forEach((r, idx) => {
    rowsHtml += `<tr>
      <td style="text-align:center">${idx + 1}</td>
      <td>${escapeHtml(r.MoldName || '―')}</td>
      <td style="text-align:center">${escapeHtml(getShortStatusLabel(r.TeflonStatusKey))}</td>
      <td style="text-align:center">${escapeHtml(formatDate(r.RequestedDate))}</td>
      <td>${escapeHtml(r.RequestedByName || '―')}</td>
      <td style="text-align:center">${escapeHtml(formatDate(r.SentDate))}</td>
      <td style="text-align:center">${escapeHtml(formatDate(r.ReceivedDate))}</td>
      <td>${escapeHtml(r.SentByName || '―')}</td>
      <td>${escapeHtml(r.TeflonNotes || '―')}</td>
    </tr>`;
  });

  win.document.write(`
  <html>
  <head>
    <meta charset="utf-8">
    <title>テフロン管理 / Teflon Manager</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif; font-size: 10px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ccc; padding: 3px 5px; }
      th { background: #eeeeee; font-size: 10px; }
      h3 { margin: 0 0 8px 0; }
    </style>
  </head>
  <body>
    <h3>テフロン管理 <span style="font-size:11px;font-weight:400">/ Quản lý khuôn mạ Teflon</span></h3>
    <table>
      <thead>
        <tr>
          <th>No</th>
          <th>型番</th>
          <th>状況</th>
          <th>依頼日</th>
          <th>依頼者</th>
          <th>出荷日</th>
          <th>完了日</th>
          <th>担当者</th>
          <th>備考</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <script>window.print()</script>
  </body>
  </html>
  `);

  win.document.close();
}

function mailView() {
  if (!filteredRows || filteredRows.length === 0) {
    alert('Không có dữ liệu để gửi mail.');
    return;
  }

  const maxLines = 50;
  const lines = [];

  lines.push('テフロン管理 / Quản lý khuôn mạ Teflon');
  lines.push('※ TSV形式（タブ区切り）/ Dạng TSV (tab) - Excel貼り付け可');
  lines.push('');

  const headerCols = ['No', '型番', '状況', '依頼日', '出荷日', '完了日', '備考'];
  lines.push(headerCols.join('\t'));
  lines.push('-'.repeat(80));

  filteredRows.slice(0, maxLines).forEach((r, idx) => {
    const cols = [
      String(idx + 1),
      String(r.MoldName || '').replace(/\t/g, ' '),
      String(r.TeflonStatusLabel || '').replace(/\t/g, ' '),
      formatDate(r.RequestedDate),
      formatDate(r.SentDate),
      formatDate(r.ReceivedDate),
      String(r.TeflonNotes || '').replace(/\t/g, ' ').replace(/\n/g, ' ').slice(0, 60)
    ];
    lines.push(cols.join('\t'));
  });

  lines.push('-'.repeat(80));

  if (filteredRows.length > maxLines) {
    lines.push(`... ${filteredRows.length - maxLines} 件 more ...`);
  }

  lines.push('');
  lines.push('---');
  lines.push('MoldCutterSearch');


  const subject = encodeURIComponent('Teflon status - ' + new Date().toISOString().slice(0, 10));
  const body = encodeURIComponent(lines.join('\n'));

  window.location.href = `mailto:toanysd-pack.co.jp?subject=${subject}&body=${body}`;
}

/* ========================================
   REFRESH DATA
======================================== */

function refreshData(silent = false) {
  const now = Date.now();
  if (now - lastRefreshTime < MIN_REFRESH_GAP) {
    console.log('[TeflonManager] Refresh skipped (too soon)');
    return Promise.resolve();
  }

  lastRefreshTime = now;
  console.log('[TeflonManager] Refreshing data...', silent ? '(silent)' : '');

  const btn = document.getElementById('teflon-refresh-btn');
  if (btn && !silent) {
    btn.disabled = true;
    btn.innerHTML = '<div class="jp">...</div><div class="vi">Loading...</div>';
  }

  if (window.DataManager && typeof window.DataManager.loadAllData === 'function') {
    return window.DataManager.loadAllData()
      .then(() => {
        console.log('[TeflonManager] Data refreshed');
        buildRows();
        applyFilterAndSort();
        updateNavBadge();
        broadcastRefresh();

        if (btn && !silent) {
          btn.disabled = false;
          btn.innerHTML = '<div class="jp">更新</div><div class="vi">Refresh</div>';
        }
      })
      .catch(err => {
        console.error('[TeflonManager] Refresh failed:', err);
        if (!silent) alert('Lỗi khi làm mới dữ liệu.');

        if (btn && !silent) {
          btn.disabled = false;
          btn.innerHTML = '<div class="jp">更新</div><div class="vi">Refresh</div>';
        }
      });
  }

  buildRows();
  applyFilterAndSort();
  updateNavBadge();

  if (btn && !silent) {
    btn.disabled = false;
    btn.innerHTML = '<div class="jp">更新</div><div class="vi">Refresh</div>';
  }

  return Promise.resolve();
}

/* ========================================
   AUTO-REFRESH & CROSS-TAB SYNC
======================================== */

function startAutoRefresh() {
  stopAutoRefresh();
  console.log('[TeflonManager] Starting auto-refresh (every 60s)');

  autoRefreshTimer = setInterval(() => {
    console.log('[TeflonManager] Auto-refresh triggered');
    refreshData(true); // silent refresh
  }, AUTO_REFRESH_INTERVAL);
}

function stopAutoRefresh() {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
    console.log('[TeflonManager] Auto-refresh stopped');
  }
}

function handleVisibilityChange() {
  if (!document.hidden) {
    console.log('[TeflonManager] Window focused, refreshing...');
    refreshData(true);
  }
}

function broadcastRefresh() {
  try {
    localStorage.setItem('teflon-refresh-trigger', Date.now().toString());
  } catch (e) {
    console.warn('[TeflonManager] Could not broadcast refresh:', e);
  }
}

function handleStorageEvent(e) {
  if (e.key === 'teflon-refresh-trigger' && e.newValue) {
    const triggerTime = parseInt(e.newValue, 10);
    const timeDiff = Date.now() - triggerTime;

    if (timeDiff < 2000) {
      console.log('[TeflonManager] Refresh triggered by another tab');
      setTimeout(() => {
        buildRows();
        applyFilterAndSort();
        updateNavBadge();
      }, 500);
    }
  }
}

/* ========================================
   TOGGLE TABLE LOCK
======================================== */

function toggleTableLock() {
  isTableLocked = !isTableLocked;

  const panel = document.getElementById('teflon-panel');
  const tableWrap = panel ? panel.querySelector('.tef-table-wrap') : document.querySelector('.tef-table-wrap');
  const lockBtn = document.getElementById('teflon-lock-btn');

  if (tableWrap) {
    if (isTableLocked) {
      tableWrap.classList.add('table-locked');
      tableWrap.classList.remove('scroll-unlocked');
    } else {
      tableWrap.classList.remove('table-locked');
      tableWrap.classList.add('scroll-unlocked');
    }
  }

  if (lockBtn) {
    if (isTableLocked) {
      lockBtn.classList.remove('unlocked');
      lockBtn.innerHTML = '<div class="jp">解除</div><div class="vi">Unlock</div>';
      lockBtn.title = 'Bấm để hiển thị tất cả cột';
    } else {
      lockBtn.classList.add('unlocked');
      lockBtn.innerHTML = '<div class="jp">固定</div><div class="vi">Lock</div>';
      lockBtn.title = 'Bấm để ẩn cột';
    }
  }

  console.log('[TeflonManager] Table lock:', isTableLocked ? 'LOCKED (compact)' : 'UNLOCKED (full)');
}

/* ========================================
   SWIPE TO CLOSE
======================================== */

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
    if (deltaY < 0) return;

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

/* ========================================
   INLINE STYLES (no CSS file change required)
======================================== */

function ensureInlineStyles() {
  const id = 'teflon-manager-r7.2.6-inline-style';
  if (document.getElementById(id)) return;

  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
    .tef-stat-card.tef-stat-clickable { cursor: pointer; user-select: none; }
    .tef-stat-card.tef-stat-clickable:active { transform: translateY(1px); }
    .tef-stat-card.tef-stat-active { outline: 2px solid rgba(46,125,50,0.45); outline-offset: 2px; }
  `;
  document.head.appendChild(style);
}

/* ========================================
   OPEN PANEL
======================================== */

function openPanel() {
  console.log('[TeflonManager r7.2.6] openPanel() called');

  const existing = document.getElementById('teflon-panel');
  if (existing) existing.remove();

  const upper = document.querySelector('.upper-section');
  if (!upper) {
    console.error('[TeflonManager] .upper-section not found');
    return;
  }

  ensureInlineStyles();

  const isMobile = window.innerWidth < 767;
  if (isMobile) document.body.classList.add('modal-open');

  // Always refresh when opening panel
  if (!isRowsBuilt) {
    buildRows();
  } else {
    console.log('[TeflonManager] Panel reopened, refreshing data...');
    refreshData(true); // silent refresh
  }

  const filterToggleClass = filterGroupCollapsed ? 'tef-filter-toggle collapsed' : 'tef-filter-toggle';
  const filterContentClass = filterGroupCollapsed ? 'tef-filter-content collapsed' : 'tef-filter-content';

  const html = `<div id="teflon-panel" class="tef-root tef-open">
    <div class="tef-backdrop" id="teflon-backdrop"></div>

    <div class="tef-dialog" id="teflon-dialog">
      <!-- HEADER -->
      <div class="tef-header" id="teflon-header">
        <div class="tef-title">
          <div class="ja">テフロン</div>
          <div class="vi">Quản lý khuôn mạ Teflon</div>
        </div>
        <button id="teflon-close-btn" class="tef-close" title="Đóng">×</button>
      </div>

      <!-- TOP INFO -->
      <div class="tef-topinfo">
        <div class="tef-summary" id="teflon-summary">表示中... / Đang hiển thị...</div>

        <div class="tef-stats">
          <div class="tef-stat-card tef-stat-clickable" data-badge-filter="all" role="button" tabindex="0" aria-pressed="false" title="総 / Tổng (show all)">
            <div class="tef-stat-icon total">全</div>
            <div>
              <div class="tef-stat-label">総<br>Tổng</div>
              <div class="tef-stat-value" id="teflon-stat-total">0</div>
            </div>
          </div>

          <div class="tef-stat-card tef-stat-clickable" data-badge-filter="pending" role="button" tabindex="0" aria-pressed="false" title="待 / Chờ">
            <div class="tef-stat-icon pending">待</div>
            <div>
              <div class="tef-stat-label">待<br>Chờ</div>
              <div class="tef-stat-value" id="teflon-stat-pending">0</div>
            </div>
          </div>

          <div class="tef-stat-card tef-stat-clickable" data-badge-filter="approved" role="button" tabindex="0" aria-pressed="false" title="承 / Duyệt">
            <div class="tef-stat-icon approved">承</div>
            <div>
              <div class="tef-stat-label">承<br>Duyệt</div>
              <div class="tef-stat-value" id="teflon-stat-approved">0</div>
            </div>
          </div>

          <div class="tef-stat-card tef-stat-clickable" data-badge-filter="processing" role="button" tabindex="0" aria-pressed="false" title="進 / Mạ">
            <div class="tef-stat-icon processing">進</div>
            <div>
              <div class="tef-stat-label">進<br>Mạ</div>
              <div class="tef-stat-value" id="teflon-stat-processing">0</div>
            </div>
          </div>

          <div class="tef-stat-card tef-stat-clickable" data-badge-filter="completed" role="button" tabindex="0" aria-pressed="false" title="完 / Xong">
            <div class="tef-stat-icon completed">完</div>
            <div>
              <div class="tef-stat-label">完<br>Xong</div>
              <div class="tef-stat-value" id="teflon-stat-completed">0</div>
            </div>
          </div>
        </div>
      </div>

      <!-- BODY -->
      <div class="tef-body">

        <!-- FILTERS -->
        <div class="tef-filters" id="teflon-filters">
          <!-- FILTER TOGGLE BUTTON -->
          <div class="${filterToggleClass}" id="teflon-filter-toggle">
            <span class="tef-filter-toggle-text">フィルター / Nhóm lọc 🔍</span>
            <span class="tef-filter-toggle-icon">▼</span>
          </div>

          <!-- COLLAPSIBLE FILTER CONTENT -->
          <div class="${filterContentClass}" id="teflon-filter-content">
            <!-- ROW 1: Status + Date Range -->
            <div class="tef-filter-row-1">
              <div class="tef-field">
                <label><span class="vi">Lọc hiển thị</span></label>
                <select class="tef-select" id="teflon-status-filter">
                  <option value="active">🔴 対応中 (待 + 承 + 進)</option>
                  <option value="unprocessed">― Chưa xử lý</option>
                  <option value="pending">待 承認待 / Chờ phê duyệt</option>
                  <option value="approved">承 承認済（発送待） / Đã duyệt, chờ gửi</option>
                  <option value="processing">進 進行中（発送済） / Đang mạ</option>
                  <option value="completed">完 加工済 / Hoàn thành</option>
                  <option value="all">📋 すべて / Tất cả</option>
                </select>
              </div>

              <div class="tef-field">
                <label><span class="vi">Ngày yêu cầu từ</span></label>
                <input type="date" class="tef-input" id="teflon-date-from">
              </div>

              <div class="tef-field">
                <label><span class="vi">Đến</span></label>
                <input type="date" class="tef-input" id="teflon-date-to">
              </div>
            </div>

            <!-- ROW 2: Search -->
            <div class="tef-filter-row-2">
              <div class="tef-field">
                <label><span class="vi">Tìm kiếm 🔎 (ID, Tên, Trạng thái, Ngày: 20251218, 2025-12-18, 1218, 202512)</span></label>
                <input type="text" class="tef-input tef-search-input" id="teflon-search-input" placeholder="Tên khuôn, mã, ngày...">
              </div>
            </div>
          </div>

          <!-- Action buttons -->
          <div class="tef-filter-actions">
            <button id="teflon-prev-btn" class="tef-btn tef-btn-primary" type="button" title="Trang trước">◀ Prev</button>
            <button id="teflon-next-btn" class="tef-btn tef-btn-primary" type="button" title="Trang sau">Next ▶</button>
            <button id="teflon-lock-btn" class="tef-btn tef-btn-warning" type="button" title="Bấm để hiển thị tất cả cột">🔓 Unlock</button>
            <button id="teflon-refresh-btn" class="tef-btn tef-btn-success" type="button">🔄 Refresh</button>
          </div>
        </div>

        <!-- TABLE -->
        <div class="tef-table-wrap table-locked" id="teflon-table-wrap">
          <table class="tef-table teflon-table">
            <thead>
              <tr>
                <th class="tef-col-id sortable" data-sort="MoldID">ID<span class="sort-indicator"></span></th>
                <th class="tef-col-name sortable" data-sort="MoldName">型番<span class="sort-indicator"></span></th>
                <th class="tef-col-status sortable" data-sort="TeflonStatusKey">状況<span class="sort-indicator"></span></th>
                <th class="tef-col-req-date sortable" data-sort="RequestedDate">依頼日<span class="sort-indicator"></span></th>
                <th class="tef-col-req-by sortable" data-sort="RequestedByName">依頼者<span class="sort-indicator"></span></th>
                <th class="tef-col-sent-date sortable" data-sort="SentDate">出荷日<span class="sort-indicator"></span></th>
                <th class="tef-col-recv-date sortable" data-sort="ReceivedDate">完了日<span class="sort-indicator"></span></th>
                <th class="tef-col-sent-by sortable" data-sort="SentByName">担当者<span class="sort-indicator"></span></th>
                <th class="tef-col-notes">備考</th>
              </tr>
            </thead>
            <tbody id="teflon-tbody"></tbody>
          </table>
        </div>

        <!-- PAGINATION -->
        <div class="tef-pagination" id="teflon-pagination">
          <div class="tef-pagination-inner"></div>
        </div>
      </div>

      <!-- FOOTER -->
      <div class="tef-footer">
        <button id="teflon-close-bottom" class="tef-btn">閉<br><span style="font-size:9px">Đóng</span></button>
        <button id="teflon-export-btn" class="tef-btn tef-btn-primary">CSV<br><span style="font-size:9px">Xuất CSV</span></button>
        <button id="teflon-print-btn" class="tef-btn tef-btn-primary">印<br><span style="font-size:9px">In</span></button>
        <button id="teflon-mail-btn" class="tef-btn tef-btn-success">✉<br><span style="font-size:9px">Gửi email</span></button>
      </div>
    </div>
  </div>`;

  upper.insertAdjacentHTML('beforeend', html);

  bindPanelEvents();

  // Keep default filter group status
  currentFilter = 'active';
  currentPage = 1;

  // Do not force badge filter default; keep null so group filter works normally
  updateBadgeFilterHighlight();

  applyFilterAndSort();
  updateStats();

  console.log('[TeflonManager] Panel opened (r7.2.6)');
}

/* ========================================
   UPDATE STATS (ALL DATA)
======================================== */

function updateStats() {
  // IMPORTANT: stats are for ALL data (allRows) - not filteredRows
  const total = allRows.length;
  const pending = allRows.filter(r => r.TeflonStatusKey === TEFLON_STATUS_KEYS.pending).length;
  const approved = allRows.filter(r => r.TeflonStatusKey === TEFLON_STATUS_KEYS.approved).length;
  const processing = allRows.filter(r => r.TeflonStatusKey === TEFLON_STATUS_KEYS.processing).length;
  const completed = allRows.filter(r => r.TeflonStatusKey === TEFLON_STATUS_KEYS.completed).length;

  const statTotal = document.getElementById('teflon-stat-total');
  const statPending = document.getElementById('teflon-stat-pending');
  const statApproved = document.getElementById('teflon-stat-approved');
  const statProcessing = document.getElementById('teflon-stat-processing');
  const statCompleted = document.getElementById('teflon-stat-completed');

  if (statTotal) statTotal.textContent = total;
  if (statPending) statPending.textContent = pending;
  if (statApproved) statApproved.textContent = approved;
  if (statProcessing) statProcessing.textContent = processing;
  if (statCompleted) statCompleted.textContent = completed;
}

/* ========================================
   BIND PANEL EVENTS
======================================== */

function bindPanelEvents() {
  const panel = document.getElementById('teflon-panel');
  if (!panel) return;

  const header = panel.querySelector('.tef-header');
  const closeBtn = document.getElementById('teflon-close-btn');
  const closeBottomBtn = document.getElementById('teflon-close-bottom');
  const backdrop = document.getElementById('teflon-backdrop');

  if (closeBtn) closeBtn.addEventListener('click', closePanel);
  if (closeBottomBtn) closeBottomBtn.addEventListener('click', closePanel);
  if (backdrop) backdrop.addEventListener('click', closePanel);

  // Filter toggle
  const filterToggle = document.getElementById('teflon-filter-toggle');
  const filterContent = document.getElementById('teflon-filter-content');

  if (filterToggle && filterContent) {
    // Ensure default collapsed state is applied on open
    if (filterGroupCollapsed) {
      filterToggle.classList.add('collapsed');
      filterContent.classList.add('collapsed');
    } else {
      filterToggle.classList.remove('collapsed');
      filterContent.classList.remove('collapsed');
    }

    filterToggle.addEventListener('click', () => {
      filterGroupCollapsed = !filterGroupCollapsed;
      if (filterGroupCollapsed) {
        filterToggle.classList.add('collapsed');
        filterContent.classList.add('collapsed');
      } else {
        filterToggle.classList.remove('collapsed');
        filterContent.classList.remove('collapsed');
      }
    });
  }

  // NEW: Stats badge clickable filter (click anywhere on stat card)
  const statCards = panel.querySelectorAll('.tef-stat-card[data-badge-filter]');
  statCards.forEach(card => {
    card.style.cursor = 'pointer';

    const activate = (e) => {
      e.preventDefault();
      e.stopPropagation();

      const preset = card.getAttribute('data-badge-filter'); // 'all'|'pending'|'approved'|'processing'|'completed'
      if (!preset) return;

      console.log('[TeflonManager] Stat badge clicked:', preset);

      setBadgeFilter(preset);
    };

    card.addEventListener('click', activate);

    // Keyboard support
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        activate(e);
      }
    });
  });

  // Status filter (filter group)
  const statusFilter = document.getElementById('teflon-status-filter');
  if (statusFilter) {
    statusFilter.addEventListener('change', (e) => {
      // Keep group filter logic unchanged; however, to avoid confusion, interacting with group status clears badge override.
      badgeFilterKey = null;
      updateBadgeFilterHighlight();

      currentFilter = e.target.value;
      applyFilterAndSort();
      updateStats();
    });
  }

  // Search input (filter group)
  const searchInput = document.getElementById('teflon-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      applyFilterAndSort();
      updateStats();
    });
  }

  // Date inputs (filter group)
  const dateFrom = document.getElementById('teflon-date-from');
  const dateTo = document.getElementById('teflon-date-to');
  if (dateFrom) {
    dateFrom.addEventListener('change', () => {
      applyFilterAndSort();
      updateStats();
    });
  }
  if (dateTo) {
    dateTo.addEventListener('change', () => {
      applyFilterAndSort();
      updateStats();
    });
  }

  // Lock button
  const lockBtn = document.getElementById('teflon-lock-btn');
  if (lockBtn) lockBtn.addEventListener('click', toggleTableLock);

  // Refresh button
  const refreshBtn = document.getElementById('teflon-refresh-btn');
  if (refreshBtn) refreshBtn.addEventListener('click', () => refreshData(false));

  // Pagination buttons
  const prevBtn = document.getElementById('teflon-prev-btn');
  if (prevBtn) prevBtn.addEventListener('click', previousPage);

  const nextBtn = document.getElementById('teflon-next-btn');
  if (nextBtn) nextBtn.addEventListener('click', nextPage);

  // Export buttons
  const exportBtn = document.getElementById('teflon-export-btn');
  if (exportBtn) exportBtn.addEventListener('click', exportToCsv);

  const printBtn = document.getElementById('teflon-print-btn');
  if (printBtn) printBtn.addEventListener('click', printView);

  const mailBtn = document.getElementById('teflon-mail-btn');
  if (mailBtn) mailBtn.addEventListener('click', mailView);

  // Table sorting
  const headers = document.querySelectorAll('.teflon-table thead th.sortable');
  headers.forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort') || 'RequestedDate';

      if (currentSort.column === col) {
        currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
      } else {
        currentSort.column = col;
        currentSort.order = 'desc';
      }

      applyFilterAndSort();
      updateStats();
    });
  });

  // Swipe to close
  if (header && panel) {
    attachSwipeToClose(header, panel, closePanel);
  }
}

/* ========================================
   CLOSE PANEL
======================================== */

function closePanel() {
  const panel = document.getElementById('teflon-panel');
  if (panel) panel.remove();

  document.body.classList.remove('modal-open');
  console.log('[TeflonManager] Panel closed');
}

/* ========================================
   INIT NAV BUTTON
======================================== */

function initNavButton() {
  const btn = document.getElementById('nav-teflon-btn');
  if (!btn) {
    console.warn('[TeflonManager] nav-teflon-btn not found');
    return;
  }

  if (btn.tefBound) return;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    openPanel();
  });

  btn.tefBound = true;
  console.log('[TeflonManager] Nav button bound');
}

/* ========================================
   INITIALIZATION
======================================== */

function INIT() {
  console.log('[TeflonManager r7.2.6] Initializing...');
  console.log('[TeflonManager r7.2.6] Smart date search enabled');
  console.log('[TeflonManager r7.2.6] CSS: teflon-manager-r7.2.5.css (reused)');

  initNavButton();

  setTimeout(() => {
    buildRows();
    updateNavBadge();

    // Start auto-refresh
    startAutoRefresh();

    // Listen for visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Listen for storage events (cross-tab sync)
    window.addEventListener('storage', handleStorageEvent);
  }, 100);
}

/* ========================================
   PUBLIC API
======================================== */

const TeflonManager = {
  version: 'r7.2.6',

  INIT: INIT,
  openPanel: openPanel,
  closePanel: closePanel,

  buildRows: buildRows,
  applyFilterAndSort: applyFilterAndSort,
  renderTable: renderTable,

  updateNavBadge: updateNavBadge,

  openDetailModal: openDetailModal,
  openMobileDetailModal: openMobileDetailModal,
  openProcessManager: openProcessManager,

  exportToCsv: exportToCsv,
  printView: printView,
  mailView: mailView,

  refreshData: refreshData,
  toggleTableLock: toggleTableLock,

  goToPage: goToPage,
  previousPage: previousPage,
  nextPage: nextPage,
  getTotalPages: getTotalPages,

  startAutoRefresh: startAutoRefresh,
  stopAutoRefresh: stopAutoRefresh,
  broadcastRefresh: broadcastRefresh,

  // Optional helpers
  setBadgeFilter: setBadgeFilter
};

window.TeflonManager = TeflonManager;

/* ========================================
   AUTO INIT
======================================== */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    TeflonManager.INIT();
  });
} else {
  TeflonManager.INIT();
}

console.log('[TeflonManager r7.2.6] Module loaded - AUTO-REFRESH + SMART DATE SEARCH + CLICKABLE STATS');

})();

/* END OF FILE - teflon-manager-r7.2.6.js */

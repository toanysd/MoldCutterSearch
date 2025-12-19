/**
 * =============================================================================
 * history-view-r7.1.9.js - Unified History View Module
 * =============================================================================
 *
 * CHANGELOG:
 *
 * r7.1.9 (2025-12-19 0930 JST)
 *   ✅ NEW: Collapsible filter group for iPhone (toggle ẩn/hiện)
 *   ✅ FIX: Date filters + Apply button on same row (mobile optimized)
 *   ✅ FIX: Search field separated from filter group
 *   ✅ FIX: Action buttons single row layout for iPhone
 *   ✅ KEEP: All r7.1.8 features (Lock/Unlock, notifications, quick info)
 *
 * r7.1.8 (2025-12-19 0451 JST)

 * ✅ FIX: Improved row click behavior - only open detail modal from Code/Name column
 * ✅ NEW: Quick info popup when clicking status badge (all columns displayed)
 * ✅ NEW: Clear All Notifications button to reset all unread highlights
 * ✅ KEEP: Mark as read when clicking other areas of row
 * 
 * r7.1.8 (2025-12-19 0451 JST)
 * ✅ FIX: Badge not showing on navbar - Improved selector and initialization
 * ✅ FIX: Lock/Unlock table behavior - LOCK mode (Hide Notes & Handler columns, 5 cols visible)
 * ✅ KEEP: All r7.1.7 features (notification, smart search, compact layout, etc.)
 * 
 * Dependencies:
 * - DataManager (window.DataManager)
 * - MobileDetailModal (window.MobileDetailModal)
 * - Papa Parse (window.Papa)
 * 
 * Updated: 2025-12-19 0700 JST
 */

(function() {
  'use strict';

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================
  const GITHUB_DATA_BASE_URL = 'https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/';
  const USE_GITHUB_SOURCE_FOR_HISTORY = false;  
  
  // Notification tracking (7 days for "new" data)
  const NOTIFICATION_DAYS = 7;
  const STORAGE_KEY_READ_EVENTS = 'historyview:read:events';
  const STORAGE_KEY_DISMISSED_EVENTS = 'historyview:dismissed:events'; // NEW: Events user dismissed


  // ✅ NEW: Background polling for badge updates
  const BADGE_POLLING_INTERVAL = 5 * 60 * 1000; // 5 minutes


  // ===========================================================================
  // CONSTANTS
  // ===========================================================================
  const ACTION = {
    ALL: 'ALL',
    AUDIT: 'AUDIT',
    CHECKIN: 'CHECKIN',
    CHECKOUT: 'CHECKOUT',
    LOCATION_CHANGE: 'LOCATION_CHANGE',
    SHIP_OUT: 'SHIP_OUT',
    SHIP_IN: 'SHIP_IN',
    SHIP_MOVE: 'SHIP_MOVE',
    OTHER: 'OTHER'
  };

  function actionMeta(actionKey) {
    switch (actionKey) {
      case ACTION.AUDIT:
        return { ja: '棚卸', vi: 'Kiểm kê', badgeClass: 'hist-badge-audit' };
      case ACTION.CHECKIN:
        return { ja: '入庫', vi: 'Nhập kho', badgeClass: 'hist-badge-checkin' };
      case ACTION.CHECKOUT:
        return { ja: '出庫', vi: 'Xuất kho', badgeClass: 'hist-badge-checkout' };
      case ACTION.LOCATION_CHANGE:
        return { ja: '位置変更', vi: 'Đổi vị trí', badgeClass: 'hist-badge-location' };
      case ACTION.SHIP_OUT:
        return { ja: '出荷', vi: 'Gửi đi', badgeClass: 'hist-badge-shipout' };
      case ACTION.SHIP_IN:
        return { ja: '返却入庫', vi: 'Nhận về', badgeClass: 'hist-badge-shipin' };
      case ACTION.SHIP_MOVE:
        return { ja: '会社間移動', vi: 'Chuyển công ty', badgeClass: 'hist-badge-shipmove' };
      case ACTION.OTHER:
      default:
        return { ja: 'その他', vi: 'Khác', badgeClass: 'hist-badge-other' };
    }
  }

  // Filter fields - All columns in table
  const FILTER_FIELDS = [
    { key: '', label: '-- すべて / Tất cả --', type: 'none' },
    { key: 'date', label: '日時 / Thời gian', type: 'date' },
    { key: 'itemCode', label: 'コード / Mã', type: 'text' },
    { key: 'itemName', label: '名称 / Tên', type: 'text' },
    { key: 'action', label: '種類 / Loại', type: 'action' },
    { key: 'from', label: '出荷元 / Từ', type: 'text' },
    { key: 'to', label: '出荷先 / Đến', type: 'text' },
    { key: 'notes', label: '備考 / Ghi chú', type: 'text' },
    { key: 'handler', label: '担当 / Người xử lý', type: 'employee' }
  ];

  // ===========================================================================
  // UTILITY FUNCTIONS
  // ===========================================================================
  function safeStr(val) {
    return (val == null || val === undefined) ? '' : String(val);
  }

  function toLower(str) {
    return safeStr(str).toLowerCase();
  }

  function normalizeSpaces(str) {
    return safeStr(str).replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return safeStr(text).replace(/[&<>"']/g, m => map[m]);
  }

  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  function getDateKey(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return { date: '-', time: '-' };
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { date: '-', time: '-' };
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return {
      date: `${y}/${m}/${day}`,
      time: `${hh}:${mm}`
    };
  }

  function parseCsv(csvText) {
    if (!window.Papa) {
      console.warn('[HistoryView] Papa Parse not available');
      return [];
    }
    const result = window.Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false
    });
    return result.data || [];
  }

  async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
    return response.text();
  }

  function isMove(actionKey) {
    return actionKey === ACTION.SHIP_MOVE;
  }

  function isInOut(actionKey) {
    return actionKey === ACTION.SHIP_IN || actionKey === ACTION.SHIP_OUT;
  }

  function getTimestamp(dateStr) {
    if (!dateStr) return 0;
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }

  // Smart date search - Support multiple formats
  function matchesDateSearch(dateStr, searchTerm) {
    if (!dateStr || !searchTerm) return false;
    
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return false;
    
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    
    // Generate all possible formats
    const formats = [
      `${y}${m}${day}`,      // 20251218
      `${y}/${m}/${day}`,    // 2025/12/18
      `${y}-${m}-${day}`,    // 2025-12-18
      `${m}${day}`,          // 1218
      `${y}${m}`,            // 202512
      `${y}/${m}`,           // 2025/12
      `${y}-${m}`,           // 2025-12
    ];
    
    const search = searchTerm.replace(/[-/\s]/g, ''); // Remove separators
    return formats.some(fmt => fmt.replace(/[-/\s]/g, '').includes(search));
  }

  // Check if event is within notification window (last 7 days)
  function isRecentEvent(dateStr) {
    if (!dateStr) return false;
    const timestamp = getTimestamp(dateStr);
    if (timestamp === 0) return false;
    const now = Date.now();
    const diffDays = (now - timestamp) / (1000 * 60 * 60 * 24);
    return diffDays <= NOTIFICATION_DAYS;
  }

  // LocalStorage helpers for read tracking
  function getReadEvents() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_READ_EVENTS);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.warn('[HistoryView] Failed to read localStorage:', e);
      return [];
    }
  }

  function markEventAsRead(eventId) {
    try {
      const readEvents = getReadEvents();
      if (!readEvents.includes(eventId)) {
        readEvents.push(eventId);
        localStorage.setItem(STORAGE_KEY_READ_EVENTS, JSON.stringify(readEvents));
        console.log('[HistoryView] Marked as read:', eventId);
      }
    } catch (e) {
      console.warn('[HistoryView] Failed to write localStorage:', e);
    }
  }

  function isEventRead(eventId) {
    const readEvents = getReadEvents();
    return readEvents.includes(eventId);
  }

  /**
   * Get dismissed events (events that user permanently dismissed)
   */
  function getDismissedEvents() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_DISMISSED_EVENTS);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.warn('[HistoryView] Failed to read dismissed events', e);
      return [];
    }
  }

  /**
   * Add events to dismissed list (never show notification again)
   */
  function addToDismissedList(eventIds) {
    try {
      const dismissed = getDismissedEvents();
      const updated = [...new Set([...dismissed, ...eventIds])]; // Remove duplicates
      localStorage.setItem(STORAGE_KEY_DISMISSED_EVENTS, JSON.stringify(updated));
      console.log('[HistoryView] Added to dismissed list:', eventIds.length, 'events');
    } catch (e) {
      console.warn('[HistoryView] Failed to add to dismissed list', e);
    }
  }

  /**
   * Check if event is dismissed (never show notification)
   */
  function isEventDismissed(eventId) {
    const dismissed = getDismissedEvents();
    return dismissed.includes(eventId);
  }

  /**
   * Clear all notifications - Add all recent unread events to dismissed list
   */
  function clearAllNotifications() {
    try {
      // Get all recent unread event IDs
      const recentUnreadIds = window.HistoryView.state.allEvents
        .filter(ev => ev.IsRecent && !ev.IsRead)
        .map(ev => ev.EventID);
      
      // Add them to dismissed list
      addToDismissedList(recentUnreadIds);
      
      // Also clear read events
      localStorage.removeItem(STORAGE_KEY_READ_EVENTS);
      
      console.log('[HistoryView] ✅ Dismissed', recentUnreadIds.length, 'notifications permanently');
    } catch (e) {
      console.warn('[HistoryView] Failed to clear notifications', e);
    }
  }

  // ===========================================================================
  // ACTION KEY MAPPING
  // ===========================================================================
  function toActionKeyFromStatus(row) {
    const status = safeStr(row.Status).trim().toLowerCase();
    const auditType = safeStr(row.AuditType).trim().toLowerCase();
    const notes = safeStr(row.Notes).trim().toLowerCase();

    // AUDIT
    if (auditType === 'audit' || status === 'audit') {
      return ACTION.AUDIT;
    }

    // CHECKIN
    if (status === 'in' || status === 'checkin' || status === 'check_in') {
      return ACTION.CHECKIN;
    }

    // CHECKOUT
    if (status === 'out' || status === 'checkout' || status === 'check_out') {
      return ACTION.CHECKOUT;
    }

    // SHIP_IN (返却入庫)
    if (notes.includes('shipin') || notes.includes('return')) {
      return ACTION.SHIP_IN;
    }

    // SHIP_OUT (出荷)
    if (notes.includes('出荷') || notes.includes('返却') || notes.includes('shipout') || notes.includes('ship out')) {
      return ACTION.SHIP_OUT;
    }

    return ACTION.OTHER;
  }

  function toActionKeyFromShiplog(row) {
    const YSD_COMPANY_ID = '2'; // YSD CompanyID
    const fromCID = safeStr(row.FromCompanyID).trim();
    const toCID = safeStr(row.ToCompanyID).trim();
    const notes = safeStr(row.Notes).trim().toLowerCase();

    // SHIP_MOVE (会社間移動): Transfer between companies
    if (fromCID && toCID && fromCID !== YSD_COMPANY_ID && toCID !== YSD_COMPANY_ID) {
      return ACTION.SHIP_MOVE;
    }
    if (notes.includes('移動') || notes.includes('move') || notes.includes('chuyển')) {
      return ACTION.SHIP_MOVE;
    }

    // SHIP_OUT (出荷): From YSD → other company
    if (fromCID === YSD_COMPANY_ID && toCID && toCID !== YSD_COMPANY_ID) {
      return ACTION.SHIP_OUT;
    }

    // SHIP_IN (返却入庫): From other company → YSD
    if (fromCID && fromCID !== YSD_COMPANY_ID && toCID === YSD_COMPANY_ID) {
      return ACTION.SHIP_IN;
    }

    // Fallback notes
    if (notes.includes('返却') || notes.includes('return') || notes.includes('nhận')) {
      return ACTION.SHIP_IN;
    }
    if (notes.includes('出荷') || notes.includes('ship') || notes.includes('gửi')) {
      return ACTION.SHIP_OUT;
    }

    // Default: if has toCID → SHIP_OUT
    return toCID ? ACTION.SHIP_OUT : ACTION.OTHER;
  }

  // ===========================================================================
  // MAIN MODULE
  // ===========================================================================
  const HistoryView = {
      state: {
        initialized: false,
        allEvents: [],
        filteredEvents: [],
        currentPage: 1,
        pageSize: 20,
        sortKey: 'date',
        sortDir: 'desc',
        lastPreset: null,
        // ✅ NEW: Filter group collapse state
        filterGroupCollapsed: false,
        master: {

        moldsById: new Map(),
        cuttersById: new Map(),
        employeesById: new Map()
      },
      // Field/Value filter
      filterField: '',
      filterValue: '',
      // Date filter apply flag
      dateFilterEnabled: false,
      // ✅ NEW: Polling timer
      pollingTimer: null
    },
    els: {},

    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    init() {
      if (this.state.initialized) return;
      console.log('[HistoryView r7.1.8] Initializing...');
      
      this.createModal();
      this.cacheDOMElements();
      this.bindTriggers();
      this.bindInsideEvents();
      
      if (USE_GITHUB_SOURCE_FOR_HISTORY) {
        this.loadHistoryFromGithub();
      } else {
        this.ensureHistoryEventsBuilt();
      }
      
      this.state.initialized = true;
      console.log('[HistoryView r7.1.8] Initialized');

      // ✅ Start background polling for badge updates
      this.startBadgePolling();
    },


    // =========================================================================
    // ✅ NEW: START BACKGROUND POLLING FOR BADGE UPDATES
    // =========================================================================
    startBadgePolling() {
      // Clear existing timer
      if (this.state.pollingTimer) {
        clearInterval(this.state.pollingTimer);
      }
      
      console.log('[HistoryView] Starting badge polling (interval: 5 min)');
      
      // Initial update
      this.refreshBadgeData();
      
      // Set interval for periodic updates
      this.state.pollingTimer = setInterval(() => {
        console.log('[HistoryView] Background badge refresh...');
        this.refreshBadgeData();
      }, BADGE_POLLING_INTERVAL);
    },

    // =========================================================================
    // ✅ NEW: REFRESH BADGE DATA (Silent background update)
    // =========================================================================
    refreshBadgeData() {
      if (!window.DataManager || typeof window.DataManager.loadAllData !== 'function') {
        console.warn('[HistoryView] DataManager not available for badge refresh');
        return;
      }
      
      // Silent refresh - don't show loading indicators
      window.DataManager.loadAllData()
        .then(() => {
          // ✅ FIX: Rebuild events even if empty
          this.ensureHistoryEventsBuilt(true);
          
          // ✅ FIX: Wait for events to be built before updating badge
          setTimeout(() => {
            this.updateNavBadge();
            console.log('[HistoryView] ✅ Badge data refreshed:', {
              total: this.state.allEvents.length,
              shipOut: this.state.allEvents.filter(ev => 
                ev.ActionKey === 'SHIP_OUT' && ev.IsRecent && !ev.IsRead
              ).length,
              location: this.state.allEvents.filter(ev => 
                ev.ActionKey === 'LOCATION_CHANGE' && ev.IsRecent && !ev.IsRead
              ).length
            });
          }, 500); // Wait 500ms for data processing
        })
        .catch(err => {
          console.warn('[HistoryView] Badge refresh failed:', err);
        });
    },

    // =========================================================================
    // ✅ NEW: STOP POLLING (cleanup)
    // =========================================================================
    stopBadgePolling() {
      if (this.state.pollingTimer) {
        clearInterval(this.state.pollingTimer);
        this.state.pollingTimer = null;
        console.log('[HistoryView] Badge polling stopped');
      }
    },


    // =========================================================================
    // DATA LOADING
    // =========================================================================
    async loadHistoryFromGithub() {
      console.log('[HistoryView] Loading history from GitHub...');
      const base = GITHUB_DATA_BASE_URL;
      const urls = {
        location: base + 'locationlog.csv',
        ship: base + 'shiplog.csv',
        status: base + 'statuslogs.csv',
        molds: base + 'molds.csv',
        cutters: base + 'cutters.csv',
        companies: base + 'companies.csv',
        employees: base + 'employees.csv',
        destinations: base + 'destinations.csv'
      };

      try {
        const [
          locationText,
          shipText,
          statusText,
          moldsText,
          cuttersText,
          companiesText,
          employeesText,
          destinationsText
        ] = await Promise.all([
          fetchText(urls.location),
          fetchText(urls.ship),
          fetchText(urls.status),
          fetchText(urls.molds),
          fetchText(urls.cutters),
          fetchText(urls.companies),
          fetchText(urls.employees),
          fetchText(urls.destinations)
        ]);

        const locationlog = parseCsv(locationText);
        const shiplog = parseCsv(shipText);
        const statuslogs = parseCsv(statusText);
        const molds = parseCsv(moldsText);
        const cutters = parseCsv(cuttersText);
        const companies = parseCsv(companiesText);
        const employees = parseCsv(employeesText);
        const destinations = parseCsv(destinationsText);

        this.buildHistoryEvents(locationlog, shiplog, statuslogs, molds, cutters, companies, employees, destinations);
        console.log('[HistoryView] ✅ Data loaded from GitHub');
      } catch (err) {
        console.error('[HistoryView] ❌ Failed to load from GitHub:', err);
      }
    },

    // Auto-refresh on open
    ensureHistoryEventsBuilt(forceRefresh = false) {
      console.log('[HistoryView] Building from DataManager...', forceRefresh ? '(forced)' : '');
      const dm = window.DataManager;
      if (!dm || !dm.data) {
        console.warn('[HistoryView] DataManager not ready');
        return;
      }

      const { locationlog, shiplog, statuslogs, molds, cutters, companies, employees, destinations } = dm.data;
      this.buildHistoryEvents(
        locationlog || [],
        shiplog || [],
        statuslogs || [],
        molds || [],
        cutters || [],
        companies || [],
        employees || [],
        destinations || []
      );
      console.log('[HistoryView] ✅ Events built from DataManager');
    },

    // =========================================================================
    // BUILD HISTORY EVENTS
    // =========================================================================
    buildHistoryEvents(locationlog, shiplog, statuslogs, molds, cutters, companies, employees, destinations) {
      console.log('[HistoryView] Building history events...', {
        locationlog: locationlog.length,
        shiplog: shiplog.length,
        statuslogs: statuslogs.length,
        molds: molds.length,
        cutters: cutters.length,
        companies: companies.length,
        employees: employees.length,
        destinations: destinations.length
      });

      // Build maps
      const moldsById = new Map();
      (molds || []).forEach(m => {
        const id = String(m.MoldID || '').trim();
        if (id) moldsById.set(id, m);
      });

      const cuttersById = new Map();
      (cutters || []).forEach(c => {
        const id = String(c.CutterID || '').trim();
        if (id) cuttersById.set(id, c);
      });

      const companiesById = new Map();
      (companies || []).forEach(c => {
        const id = String(c.CompanyID || '').trim();
        if (id) companiesById.set(id, c);
      });

      const employeesById = new Map();
      (employees || []).forEach(e => {
        const id = String(e.EmployeeID || '').trim();
        if (id) employeesById.set(id, e);
      });

      const destinationsById = new Map();
      (destinations || []).forEach(d => {
        const id = String(d.DestinationID || '').trim();
        if (id) destinationsById.set(id, d);
      });

      // Store for detail modal
      this.state.master.moldsById = moldsById;
      this.state.master.cuttersById = cuttersById;
      this.state.master.employeesById = employeesById;

      const events = [];

      // Helper functions
      const getCompanyName = (cid) => {
        if (!cid) return '';
        const c = companiesById.get(String(cid).trim());
        return c ? (c.CompanyName || c.Name || cid) : cid;
      };

      const getEmployeeName = (eid) => {
        if (!eid) return '';
        const e = employeesById.get(String(eid).trim());
        return e ? (e.Name || e.EmployeeName || eid) : eid;
      };

      // 1. locationlog => LOCATION_CHANGE
      (locationlog || []).forEach(row => {
        const moldIdRaw = safeStr(row.MoldID || '').trim();
        const cutterIdRaw = safeStr(row.CutterID || '').trim();
        const hasMold = !!moldIdRaw;
        const hasCutter = !hasMold && !!cutterIdRaw;
        const itemId = hasMold ? moldIdRaw : cutterIdRaw;
        if (!itemId) return;

        const oldRack = safeStr(row.OldRackLayer || '').trim();
        const newRack = safeStr(row.NewRackLayer || '').trim();

        // Skip if both empty or same
        if (!oldRack && !newRack) return;
        if (oldRack === newRack) return;

        const itemType = hasMold ? 'mold' : 'cutter';
        const itemObj = hasMold ? moldsById.get(moldIdRaw) : cuttersById.get(cutterIdRaw);
        const itemCode = itemObj ? (itemObj.MoldID || itemObj.CutterID || itemId) : itemId;
        const itemName = itemObj ? (itemObj.Name || itemObj.MoldName || itemObj.CutterName || '') : '';
        const dateStr = safeStr(row.DateEntry || row.Timestamp || row.Date || '').trim();
        const empId = safeStr(row.EmployeeID || '').trim();
        const handler = getEmployeeName(empId);

        events.push({
          EventID: `LOC-${safeStr(row.LocationLogID)}`,
          Source: 'locationlog',
          ActionKey: ACTION.LOCATION_CHANGE,
          ItemType: itemType,
          ItemId: itemId,
          ItemCode: safeStr(itemCode).trim(),
          ItemName: safeStr(itemName).trim(),
          MoldID: hasMold ? moldIdRaw : '',
          CutterID: hasCutter ? cutterIdRaw : '',
          EventDate: dateStr,
          EventDateKey: getDateKey(dateStr),
          EventTimestamp: getTimestamp(dateStr),
          FromRackLayer: oldRack || '-',
          ToRackLayer: newRack || '-',
          FromCompanyID: '',
          ToCompanyID: '',
          FromCompanyName: '',
          ToCompanyName: '',
          Notes: normalizeSpaces(safeStr(row.notes || '').trim()),
          HandlerID: empId,
          Handler: handler,
          // Notification tracking
          IsRecent: isRecentEvent(dateStr),
          IsRead: false // Will be updated later
        });
      });

      // 2) shiplog => SHIP_OUT / SHIP_IN / SHIP_MOVE
      (shiplog || []).forEach(row => {
        const moldIdRaw = safeStr(row.MoldID || '').trim();
        const cutterIdRaw = safeStr(row.CutterID || '').trim();
        const hasMold = !!moldIdRaw;
        const hasCutter = !hasMold && !!cutterIdRaw;
        const itemId = hasMold ? moldIdRaw : cutterIdRaw;
        if (!itemId) return;

        const itemType = hasMold ? 'mold' : 'cutter';
        const itemObj = hasMold ? moldsById.get(moldIdRaw) : cuttersById.get(cutterIdRaw);
        const itemCode = itemObj ? (itemObj.MoldID || itemObj.CutterID || itemId) : itemId;
        const itemName = itemObj ? (itemObj.Name || itemObj.MoldName || itemObj.CutterName || '') : '';
        const dateStr = safeStr(row.ShipDate || row.Date || '').trim();
        const empId = safeStr(row.EmployeeID || '').trim();
        const handler = getEmployeeName(empId);
        const actionKey = toActionKeyFromShiplog(row);
        const fromCID = safeStr(row.FromCompanyID || '').trim();
        const toCID = safeStr(row.ToCompanyID || row.CompanyID || '').trim();

        events.push({
          EventID: 'SHIP' + safeStr(row.ShipLogID || ''),
          Source: 'shiplog',
          ActionKey: actionKey,
          ItemType: itemType,
          ItemId: itemId,
          ItemCode: safeStr(itemCode).trim(),
          ItemName: safeStr(itemName).trim(),
          MoldID: hasMold ? moldIdRaw : '',
          CutterID: hasCutter ? cutterIdRaw : '',
          EventDate: dateStr,
          EventDateKey: getDateKey(dateStr),
          EventTimestamp: getTimestamp(dateStr),
          FromRackLayer: '',
          ToRackLayer: '',
          FromCompanyID: fromCID,
          ToCompanyID: toCID,
          FromCompanyName: getCompanyName(fromCID),
          ToCompanyName: getCompanyName(toCID),
          Notes: normalizeSpaces(safeStr(row.Notes || '').trim()),
          HandlerID: empId,
          Handler: handler,
          // Notification tracking
          IsRecent: isRecentEvent(dateStr),
          IsRead: false
        });
      });

      // 3) statuslogs => AUDIT / CHECKIN / CHECKOUT / SHIP_IN / SHIP_OUT / OTHER
      (statuslogs || []).forEach(row => {
        const moldIdRaw = safeStr(row.MoldID || '').trim();
        const cutterIdRaw = safeStr(row.CutterID || '').trim();
        const hasMold = !!moldIdRaw;
        const hasCutter = !hasMold && !!cutterIdRaw;
        const itemId = hasMold ? moldIdRaw : cutterIdRaw;
        if (!itemId) return;

        const itemType = hasMold ? 'mold' : 'cutter';
        const itemObj = hasMold ? moldsById.get(moldIdRaw) : cuttersById.get(cutterIdRaw);
        const itemCode = itemObj ? (itemObj.MoldID || itemObj.CutterID || itemId) : itemId;
        const itemName = itemObj ? (itemObj.Name || itemObj.MoldName || itemObj.CutterName || '') : '';
        const dateStr = safeStr(row.Timestamp || row.Date || '').trim();
        const empId = safeStr(row.EmployeeID || '').trim();
        const handler = getEmployeeName(empId);
        const actionKey = toActionKeyFromStatus(row);
        const destId = safeStr(row.DestinationID || row.DestinationId || '').trim();

        let destLabel = '';
        if (destId) {
          const dest = destinationsById.get(destId);
          destLabel = dest ? (dest.DestinationName || destId) : destId;
        }

        events.push({
          EventID: 'ST' + safeStr(row.StatusLogID || ''),
          Source: 'statuslogs',
          ActionKey: actionKey,
          ItemType: itemType,
          ItemId: itemId,
          ItemCode: safeStr(itemCode).trim(),
          ItemName: safeStr(itemName).trim(),
          MoldID: hasMold ? moldIdRaw : '',
          CutterID: hasCutter ? cutterIdRaw : '',
          EventDate: dateStr,
          EventDateKey: getDateKey(dateStr),
          EventTimestamp: getTimestamp(dateStr),
          FromRackLayer: '',
          ToRackLayer: '',
          FromCompanyID: '',
          ToCompanyID: destId,
          FromCompanyName: '',
          ToCompanyName: destLabel,
          Notes: normalizeSpaces(safeStr(row.Notes || '').trim()),
          HandlerID: empId,
          Handler: handler,
          // Notification tracking
          IsRecent: isRecentEvent(dateStr),
          IsRead: false
        });
      });

      // Update IsRead status from localStorage
      const readEvents = getReadEvents();
      const dismissedEvents = getDismissedEvents(); // NEW
      
      events.forEach(ev => {
        // Mark as read if:
        // 1. In read list, OR
        // 2. In dismissed list (permanently dismissed)
        ev.IsRead = readEvents.includes(ev.EventID) || dismissedEvents.includes(ev.EventID);
      });
      
      console.log('[HistoryView] Dismissed events:', dismissedEvents.length);


      this.state.allEvents = events;
      console.log('[HistoryView r7.1.8] events built:', events.length);

      // Debug: Log action counts
      const actionCounts = {};
      events.forEach(ev => {
        actionCounts[ev.ActionKey] = (actionCounts[ev.ActionKey] || 0) + 1;
      });
      console.log('[HistoryView] Action counts:', actionCounts);

      // Update navbar badge
      this.updateNavBadge();
    },

    // =========================================================================
    // ✅ FIX: UPDATE NAVBAR BADGE - IMPROVED SELECTOR
    // =========================================================================
    updateNavBadge() {
      // Multiple selectors to find history trigger buttons
      const selectors = [
        '[data-history-view-trigger]',
        'button[onclick*="history"]',
        'a[href*="history"]',
        '.history-btn',
        '#history-trigger',
        '.bottom-nav-item[data-tab="history"]'
      ];
      
      let btns = [];
      selectors.forEach(sel => {
        const found = document.querySelectorAll(sel);
        if (found && found.length > 0) {
          btns = btns.concat(Array.from(found));
        }
      });
      
      // Remove duplicates
      btns = Array.from(new Set(btns));
      
      console.log('[HistoryView] updateNavBadge called:', {
        buttonsFound: btns.length,
        totalEvents: this.state.allEvents.length,
        recentEvents: this.state.allEvents.filter(ev => ev.IsRecent).length
      });
      
      if (btns.length === 0) {
        console.warn('[HistoryView] ⚠️ No navbar trigger buttons found');
        return;
      }

      // Count UNREAD recent events
      const unreadShipOut = this.state.allEvents.filter(ev => 
        ev.ActionKey === 'SHIP_OUT' && ev.IsRecent && !ev.IsRead
      ).length;
      
      const unreadLocation = this.state.allEvents.filter(ev => 
        ev.ActionKey === 'LOCATION_CHANGE' && ev.IsRecent && !ev.IsRead
      ).length;

      btns.forEach((btn, index) => {
        // ✅ Force position:relative
        const computedStyle = window.getComputedStyle(btn);
        if (computedStyle.position === 'static') {
          btn.style.position = 'relative';
          console.log(`[HistoryView] Button ${index}: position set to relative`);
        }
        
        let badge = btn.querySelector('.hist-nav-badge');
        
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'hist-nav-badge hist-nav-badge-hidden';
          btn.appendChild(badge);
          console.log(`[HistoryView] Button ${index}: Badge element created`);
        }

        // Remove all classes
        badge.classList.remove('hist-nav-badge-hidden', 'hist-nav-badge-shipout', 'hist-nav-badge-location');

        // Priority: SHIP_OUT (出) > LOCATION_CHANGE (位)
        if (unreadShipOut > 0) {
          badge.classList.add('hist-nav-badge-shipout');
          badge.textContent = '出';
          console.log(`[HistoryView] Button ${index}: Badge = 出 (red), count: ${unreadShipOut}`);
        } else if (unreadLocation > 0) {
          badge.classList.add('hist-nav-badge-location');
          badge.textContent = '位';
          console.log(`[HistoryView] Button ${index}: Badge = 位 (orange), count: ${unreadLocation}`);
        } else {
          badge.classList.add('hist-nav-badge-hidden');
          badge.textContent = '';
          console.log(`[HistoryView] Button ${index}: Badge hidden (no unread)`);
        }
      });

      console.log('[HistoryView] Badge update completed:', { 
        unreadShipOut, 
        unreadLocation,
        buttonsUpdated: btns.length 
      });
    },

    // =========================================================================
    // CREATE MODAL HTML
    // =========================================================================
    createModal() {
      const html = `
<div id="history-view-root" class="hist-root">
  <div class="hist-backdrop" id="history-backdrop"></div>
  <div class="hist-dialog" id="history-dialog">
    
    <!-- HEADER -->
    <div class="hist-header" id="history-header">
      <div class="hist-title">
        <div class="ja">履歴</div>
        <div class="vi">Lịch sử (履歴・入出荷・位置・出荷)</div>
      </div>
      <button class="hist-close" id="history-close-btn" aria-label="Close">&times;</button>
    </div>

    <!-- TOP INFO -->
    <div class="hist-topinfo">
      <div class="hist-summary" id="history-summary">
        表示中... / Đang hiển thị...
      </div>
      <div class="hist-stats">
        <div class="hist-stat-card">
          <div class="hist-stat-icon total">総</div>
          <div>
            <div class="hist-stat-label">総履歴<br>Tổng</div>
            <div class="hist-stat-value" id="history-stat-total">0</div>
          </div>
        </div>
        <div class="hist-stat-card">
          <div class="hist-stat-icon audit">棚</div>
          <div>
            <div class="hist-stat-label">棚卸<br>Kiểm kê</div>
            <div class="hist-stat-value" id="history-stat-audit">0</div>
          </div>
        </div>
        <div class="hist-stat-card">
          <div class="hist-stat-icon move">位</div>
          <div>
            <div class="hist-stat-label">位置変更<br>Di chuyển</div>
            <div class="hist-stat-value" id="history-stat-move">0</div>
          </div>
        </div>
        <div class="hist-stat-card">
          <div class="hist-stat-icon io">出</div>
          <div>
            <div class="hist-stat-label">入出庫<br>In/Out</div>
            <div class="hist-stat-value" id="history-stat-io">0</div>
          </div>
        </div>
      </div>
    </div>

    <!-- BODY -->
    <div class="hist-body">
      
      <!-- FILTERS -->
      <div class="hist-filters" id="history-filters">
        
        <!-- ✅ FILTER TOGGLE BUTTON -->
        <div class="hist-filter-toggle" id="history-filter-toggle">
          <span class="hist-filter-toggle-text">フィルタ / Nhóm lọc</span>
          <span class="hist-filter-toggle-icon">▼</span>
        </div>
        
        <!-- ✅ COLLAPSIBLE FILTER CONTENT -->
        <div class="hist-filter-content" id="history-filter-content">
          
          <!-- ROW 1: Date From | Date To | Apply Button -->
          <div class="hist-filter-row-1">

          <div class="hist-field">
            <label>期間（始）<span class="vi">Từ ngày</span></label>
            <input type="date" class="hist-input" id="history-date-from" />
          </div>
          <div class="hist-field">
            <label>期間（至）<span class="vi">Đến ngày</span></label>
            <input type="date" class="hist-input" id="history-date-to" />
          </div>
          <div class="hist-field hist-apply-date-wrap">
            <label style="opacity:0;">Apply</label>
            <button class="hist-btn hist-btn-success" id="history-apply-date-btn">
              <span>適用</span>
            </button>
          </div>
        </div>

        <!-- ROW 2: Action Type | Employee -->
        <div class="hist-filter-row-2">
          <div class="hist-field">
            <label>種類 (詳細) <span class="vi">Loại</span></label>
            <select class="hist-select hist-auto-filter" id="history-action-select">
              <option value="">すべて / Tất cả</option>
              <option value="AUDIT">棚卸 / Kiểm kê</option>
              <option value="CHECKIN">入庫 / Nhập kho</option>
              <option value="CHECKOUT">出庫 / Xuất kho</option>
              <option value="LOCATION_CHANGE">位置変更 / Đổi vị trí</option>
              <option value="SHIP_OUT">出荷 / Gửi đi</option>
              <option value="SHIP_IN">返却入庫 / Nhận về</option>
              <option value="SHIP_MOVE">会社間移動 / Chuyển công ty</option>
              <option value="OTHER">その他 / Khác</option>
            </select>
          </div>
          <div class="hist-field">
            <label>担当者 <span class="vi">Nhân viên</span></label>
            <select class="hist-select hist-auto-filter" id="history-employee-select">
              <option value="">すべて / Tất cả</option>
            </select>
          </div>
        </div>

        <!-- ROW 3: Field | Value (inside filter group) -->
        <div class="hist-filter-row-3">
          <div class="hist-field">
            <label>フィールド <span class="vi">Trường</span></label>
            <select class="hist-select hist-auto-filter" id="history-field-select">
              ${FILTER_FIELDS.map(f => `<option value="${f.key}">${f.label}</option>`).join('')}
            </select>
          </div>
          <div class="hist-field">
            <label>値 <span class="vi">Giá trị</span></label>
            <select class="hist-select hist-auto-filter" id="history-value-select" disabled>
              <option value="">-- Chọn --</option>
            </select>
          </div>
        </div>
        
        </div><!-- END hist-filter-content -->
        
        <!-- ✅ SEARCH FIELD - Outside filter group -->
        <div class="hist-search-row">
          <div class="hist-field hist-search-field">
            <label>🔍 <span class="vi">Tìm kiếm</span></label>
            <input type="text" class="hist-input hist-search-input" id="history-keyword-input" placeholder="ID, コード, 名称, 日付 / Mã, tên, ngày">
          </div>
        </div>

        <!-- ✅ Action buttons -->
        <div class="hist-filter-actions">
            <button class="hist-btn hist-btn-secondary" id="history-scroll-toggle" title="横スクロール / Scroll ngang">🔒 Lock</button>
            <button class="hist-btn hist-btn-success" id="history-refresh-btn">🔄 Refresh</button>
            <button class="hist-btn" id="history-clear-btn">✕ Xóa lọc</button>
            <button class="hist-btn hist-btn-warning" id="history-clear-notifications-btn" title="全通知をクリア / Clear all notifications">🔕 Clear All</button>
        </div>
      </div>

      <!-- TABLE -->
      <div class="hist-table-wrap" id="history-table-wrap">
        <table class="hist-table">
          <thead>
            <tr>
              <th class="sortable hist-col-date" data-sort-key="date">日時<br><span style="font-size:9px;">Giờ</span></th>
              <th class="sortable hist-col-item" data-sort-key="item">コード・名称<br><span style="font-size:9px;">Tên</span></th>
              <th class="sortable hist-col-action" data-sort-key="action">種類<br><span style="font-size:9px;">Loại</span></th>
              <th class="sortable hist-col-from" data-sort-key="from">旧<br><span style="font-size:9px;">Cũ</span></th>
              <th class="sortable hist-col-to" data-sort-key="to">新<br><span style="font-size:9px;">Mới</span></th>
              <th class="sortable hist-col-notes" data-sort-key="notes">備考<br><span style="font-size:9px;">Ghi chú</span></th>
              <th class="sortable hist-col-handler" data-sort-key="handler">担当<br><span style="font-size:9px;">NV</span></th>
            </tr>
          </thead>
          <tbody id="history-table-body"></tbody>
        </table>
      </div>

      <!-- PAGINATION -->
      <div class="hist-pagination" id="history-pagination">
        <div class="hist-pagination-inner"></div>
      </div>

    </div>

    <!-- FOOTER -->
    <div class="hist-footer">
      <button class="hist-btn" id="history-cancel-btn">閉じる</button>
      <button class="hist-btn" id="history-export-btn">CSV</button>
      <button class="hist-btn" id="history-print-btn">印刷</button>
      <button class="hist-btn hist-btn-primary" id="history-mail-btn">メール</button>
    </div>

  </div>
</div>
`;
      const div = document.createElement('div');
      div.innerHTML = html.trim();
      document.body.appendChild(div.firstElementChild);
    },

    // =========================================================================
    // CACHE DOM ELEMENTS
    // =========================================================================
    cacheDOMElements() {
      this.els.root = document.getElementById('history-view-root');
      this.els.dialog = document.getElementById('history-dialog');
      this.els.backdrop = document.getElementById('history-backdrop');
      this.els.header = document.getElementById('history-header');
      this.els.closeBtn = document.getElementById('history-close-btn');
      this.els.summaryEl = document.getElementById('history-summary');
      this.els.statTotal = document.getElementById('history-stat-total');
      this.els.statAudit = document.getElementById('history-stat-audit');
      this.els.statMove = document.getElementById('history-stat-move');
      this.els.statIO = document.getElementById('history-stat-io');
      this.els.filtersWrap = document.getElementById('history-filters');
      this.els.dateFrom = document.getElementById('history-date-from');
      this.els.dateTo = document.getElementById('history-date-to');
      this.els.applyDateBtn = document.getElementById('history-apply-date-btn');
      this.els.actionSelect = document.getElementById('history-action-select');
      this.els.employeeSelect = document.getElementById('history-employee-select');
      this.els.keywordInput = document.getElementById('history-keyword-input');
      
      // Field/Value filter
      this.els.fieldSelect = document.getElementById('history-field-select');
      this.els.valueSelect = document.getElementById('history-value-select');
      
      this.els.clearBtn = document.getElementById('history-clear-btn');
      this.els.refreshBtn = document.getElementById('history-refresh-btn');
      this.els.tableWrap = document.getElementById('history-table-wrap');
      this.els.tableHead = document.querySelector('#history-table-wrap thead');
      this.els.tableBody = document.querySelector('#history-table-wrap tbody');
      this.els.paginationWrap = document.getElementById('history-pagination');
        this.els.cancelBtn = document.getElementById('history-cancel-btn');
        this.els.exportBtn = document.getElementById('history-export-btn');
        this.els.printBtn = document.getElementById('history-print-btn');
        this.els.mailBtn = document.getElementById('history-mail-btn');
        // ✅ NEW: Filter toggle elements
        this.els.filterToggle = document.getElementById('history-filter-toggle');
        this.els.filterContent = document.getElementById('history-filter-content');
        console.log('[HistoryView] DOM elements cached');
    },


    // =========================================================================
    // BIND TRIGGERS
    // =========================================================================
    bindTriggers() {
  const triggers = document.querySelectorAll('[data-history-view-trigger]');
    console.log('[HistoryView] triggers:', triggers.length);
    
    triggers.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const preset = btn.getAttribute('data-preset') || 'all';
        this.open(preset);
      });
    });
    
    // ✅ NEW: Bottom nav tab support - Open history when history tab is clicked
    const bottomNavHistory = document.querySelector('.bottom-nav-item[data-tab="history"]');
    if (bottomNavHistory && !bottomNavHistory.hasAttribute('data-history-view-trigger')) {
      console.log('[HistoryView] Bottom nav history button found, attaching click handler');
      bottomNavHistory.addEventListener('click', (e) => {
        e.preventDefault();
        this.open('all');
      });
    }
  },

    // =========================================================================
    // BIND INSIDE EVENTS - AUTO-FILTER + SWIPE + DATE APPLY
    // =========================================================================
    bindInsideEvents() {
      // Close buttons
      if (this.els.closeBtn) {
        this.els.closeBtn.addEventListener('click', () => this.close());
      }
      if (this.els.backdrop) {
        this.els.backdrop.addEventListener('click', () => this.close());
      }
      if (this.els.cancelBtn) {
        this.els.cancelBtn.addEventListener('click', () => this.close());
      }

      // Apply Date button - Enable date filter
      if (this.els.applyDateBtn) {
        this.els.applyDateBtn.addEventListener('click', () => {
          this.state.dateFilterEnabled = true;
          console.log('[HistoryView] Date filter enabled');
          this.applyFiltersAndRender(true);
        });
      }

      // AUTO-FILTER: Change event for select (NOT date inputs)
      const autoFilterEls = document.querySelectorAll('.hist-auto-filter');
      autoFilterEls.forEach(el => {
        el.addEventListener('change', () => {
          console.log('[HistoryView] Auto-filter triggered');
          this.applyFiltersAndRender(true);
        });
      });

      // Clear filters
      if (this.els.clearBtn) {
        this.els.clearBtn.addEventListener('click', () => this.clearFilters());
      }

      // Clear all notifications (r7.1.9)
      const clearNotificationsBtn = document.getElementById('history-clear-notifications-btn');
      if (clearNotificationsBtn) {
        clearNotificationsBtn.addEventListener('click', () => {
          if (confirm('すべての未読通知をクリアしますか？\nXóa tất cả thông báo chưa đọc?')) {
            clearAllNotifications();
            
            // Reset all events to read
            this.state.allEvents.forEach(ev => {
              ev.IsRead = true;
            });
            
            // Re-render to remove highlights
            this.applyFiltersAndRender(false);
            
            // Update badge
            this.updateNavBadge();
            
            console.log('[HistoryView] All notifications cleared');
          }
        });
      }

      // ✅ NEW: Filter toggle button
        const filterToggle = document.getElementById('history-filter-toggle');
        const filterContent = document.getElementById('history-filter-content');
        if (filterToggle && filterContent) {
        filterToggle.addEventListener('click', () => {
            this.state.filterGroupCollapsed = !this.state.filterGroupCollapsed;
            
            if (this.state.filterGroupCollapsed) {
            filterToggle.classList.add('collapsed');
            filterContent.classList.add('collapsed');
            } else {
            filterToggle.classList.remove('collapsed');
            filterContent.classList.remove('collapsed');
            }
            
            console.log('[HistoryView] Filter group toggled:', 
                        this.state.filterGroupCollapsed ? 'collapsed' : 'expanded');
        });
        }

        // Refresh
        if (this.els.refreshBtn) {
        this.els.refreshBtn.addEventListener('click', () => this.refreshData());
        }

      // Table sorting
      if (this.els.tableHead) {
        this.els.tableHead.addEventListener('click', e => {
          const th = e.target.closest('th.sortable');
          if (!th) return;
          const key = th.getAttribute('data-sort-key') || 'date';
          this.toggleSort(key);
          this.applyFiltersAndRender(false);
        });
      }

      // Row click - Improved behavior (r7.1.9)
      if (this.els.tableBody) {
        this.els.tableBody.addEventListener('click', (e) => {
          const row = e.target.closest('tr[data-eventid]');
          if (!row) return;

          const eventId = row.getAttribute('data-eventid');
          if (!eventId) return;

          // Check what was clicked
          const clickedBadge = e.target.closest('.hist-action-badge');
          const clickedItemCell = e.target.closest('.hist-col-item');

          if (clickedBadge) {
            // ✅ CASE 1: Clicked status badge → Show quick info popup
            e.preventDefault();
            e.stopPropagation();
            console.log('[HistoryView] Status badge clicked:', eventId);
            this.showQuickInfoPopup(e, eventId);
            
            // Still mark as read
            markEventAsRead(eventId);
            const event = this.state.allEvents.find(ev => ev.EventID === eventId);
            if (event) event.IsRead = true;
            row.classList.remove('hist-row-unread');
            this.updateNavBadge();
            
          } else if (clickedItemCell) {
            // ✅ CASE 2: Clicked Code/Name cell → Open detail modal
            e.preventDefault();
            e.stopPropagation();
            console.log('[HistoryView] Item cell clicked:', eventId);
            
            markEventAsRead(eventId);
            const event = this.state.allEvents.find(ev => ev.EventID === eventId);
            if (event) event.IsRead = true;
            row.classList.remove('hist-row-unread');
            this.updateNavBadge();
            
            this.openDetailForEventID(eventId);
            
          } else {
            // ✅ CASE 3: Clicked other area → Only mark as read
            console.log('[HistoryView] Row clicked (mark as read):', eventId);
            
            markEventAsRead(eventId);
            const event = this.state.allEvents.find(ev => ev.EventID === eventId);
            if (event) event.IsRead = true;
            row.classList.remove('hist-row-unread');
            this.updateNavBadge();
          }
        });
      }


      // ✅ FIX: Toggle scroll lock - Add/Remove class to table wrapper
      const scrollToggle = document.getElementById('history-scroll-toggle');
      const tableWrap = this.els.tableWrap;
      if (scrollToggle && tableWrap) {
        scrollToggle.addEventListener('click', (e) => {
          e.preventDefault();
          const isLocked = !tableWrap.classList.contains('scroll-unlocked');
          
          if (isLocked) {
            // UNLOCK: Show all columns with horizontal scroll
            tableWrap.classList.add('scroll-unlocked');
            scrollToggle.innerHTML = '🔓 Unlock';
            console.log('[HistoryView] Table UNLOCKED - All 7 columns visible with horizontal scroll');
          } else {
            // LOCK: Hide Notes & Handler columns
            tableWrap.classList.remove('scroll-unlocked');
            scrollToggle.innerHTML = '🔒 Lock';
            console.log('[HistoryView] Table LOCKED - 5 columns visible (hide Notes & Handler)');
          }
        });
      }

      // Footer buttons
      if (this.els.exportBtn) {
        this.els.exportBtn.addEventListener('click', () => {
          console.log('[HistoryView] Export CSV clicked');
          this.exportCsv();
        });
      }
      if (this.els.printBtn) {
        this.els.printBtn.addEventListener('click', () => {
          console.log('[HistoryView] Print clicked');
          this.print();
        });
      }
      if (this.els.mailBtn) {
        this.els.mailBtn.addEventListener('click', () => {
          console.log('[HistoryView] Mail clicked');
          this.sendMail();
        });
      }

      // Debounced keyword search
      if (this.els.keywordInput) {
        const debouncedApply = debounce(() => this.applyFiltersAndRender(true), 400);
        this.els.keywordInput.addEventListener('input', debouncedApply);
      }

      // Field select: populate value dropdown
      if (this.els.fieldSelect) {
        this.els.fieldSelect.addEventListener('change', () => {
          this.populateValueDropdown();
        });
      }

      // Swipe to close
      if (this.els.header && this.els.dialog) {
        this.attachSwipeToClose(this.els.header, this.els.dialog);
      }
    },

    // =========================================================================
    // SWIPE DOWN TO CLOSE PANEL
    // =========================================================================
    attachSwipeToClose(headerEl, modalEl) {
      if (!headerEl || !modalEl || !('ontouchstart' in window)) return;

      let startY = 0;
      let currentY = 0;
      let isDragging = false;
      let isTableAtTop = true;

      const resetDrag = () => {
        isDragging = false;
        modalEl.classList.remove('dragging');
        modalEl.style.transform = '';
        modalEl.style.opacity = '';
      };

      // Check if table is at top
      const checkTablePosition = () => {
        const tableWrap = this.els.tableWrap;
        if (!tableWrap) return true;
        return tableWrap.scrollTop === 0;
      };

      const onTouchStart = (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        isTableAtTop = checkTablePosition();
        if (!isTableAtTop) return; // Don't start drag if table is scrolled
        
        startY = e.touches[0].clientY;
        currentY = startY;
        isDragging = true;
        modalEl.classList.add('dragging');
      };

      const onTouchMove = (e) => {
        if (!isDragging) return;
        
        const touchY = e.touches[0].clientY;
        const deltaY = touchY - startY;
        
        // Only allow downward swipe
        if (deltaY < 0) return;
        
        currentY = touchY;
        const translateY = Math.min(deltaY, 150);
        const opacity = 1 - Math.min(deltaY / 250, 0.6);
        
        modalEl.style.transform = `translateY(${translateY}px)`;
        modalEl.style.opacity = opacity;
      };

      const onTouchEnd = () => {
        if (!isDragging) return;
        
        const deltaY = currentY - startY;
        
        // Threshold: 100px to close
        if (deltaY > 100) {
          resetDrag();
          this.close();
        } else {
          resetDrag();
        }
      };

      headerEl.addEventListener('touchstart', onTouchStart, { passive: true });
      headerEl.addEventListener('touchmove', onTouchMove, { passive: true });
      headerEl.addEventListener('touchend', onTouchEnd);
      headerEl.addEventListener('touchcancel', resetDrag);

      console.log('[HistoryView] Swipe to close attached');
    },

    // =========================================================================
    // OPEN MODAL - AUTO-REFRESH ON OPEN
    // =========================================================================
    open(preset) {
      console.log('[HistoryView] opened, preset:', preset);
      this.state.lastPreset = preset || 'all';
      
      // Always refresh data on open
      if (window.DataManager && typeof window.DataManager.loadAllData === 'function') {
        console.log('[HistoryView] Auto-refreshing data...');
        window.DataManager.loadAllData().then(() => {
          this.ensureHistoryEventsBuilt(true);
          this.populateEmployeeDropdown();
          this.applyPreset(preset);
          this.applyFiltersAndRender(true);
        }).catch(err => {
          console.error('[HistoryView] Auto-refresh failed:', err);
          this.ensureHistoryEventsBuilt(false);
          this.populateEmployeeDropdown();
          this.applyPreset(preset);
          this.applyFiltersAndRender(true);
        });
      } else {
        this.ensureHistoryEventsBuilt(false);
        this.populateEmployeeDropdown();
        this.applyPreset(preset);
        this.applyFiltersAndRender(true);
      }
      
      if (this.els.root) {
        this.els.root.classList.add('hist-open');
      }
    },

    // =========================================================================
    // CLOSE MODAL
    // =========================================================================
    close() {
      console.log('[HistoryView] closed');
      if (this.els.root) {
        this.els.root.classList.remove('hist-open');
      }
    },

    // =========================================================================
    // PRESET FILTERS - NO DEFAULT DATE RANGE
    // =========================================================================
    applyPreset(preset) {
      console.log('[HistoryView] Applying preset:', preset);
      
      // Clear ALL filters
      if (this.els.dateFrom) this.els.dateFrom.value = '';
      if (this.els.dateTo) this.els.dateTo.value = '';
      this.state.dateFilterEnabled = false;
      
      if (this.els.actionSelect) this.els.actionSelect.value = '';
      if (this.els.employeeSelect) this.els.employeeSelect.value = '';
      if (this.els.keywordInput) this.els.keywordInput.value = '';
      if (this.els.fieldSelect) this.els.fieldSelect.value = '';
      if (this.els.valueSelect) {
        this.els.valueSelect.value = '';
        this.els.valueSelect.disabled = true;
      }
      
      // Apply preset-specific filters
      if (preset === 'audit') {
        if (this.els.actionSelect) this.els.actionSelect.value = ACTION.AUDIT;
      } else if (preset === 'location') {
        if (this.els.actionSelect) this.els.actionSelect.value = ACTION.LOCATION_CHANGE;
      } else if (preset === 'shipout') {
        if (this.els.actionSelect) this.els.actionSelect.value = ACTION.SHIP_OUT;
      } else if (preset === 'shipin') {
        if (this.els.actionSelect) this.els.actionSelect.value = ACTION.SHIP_IN;
      } else if (preset === 'shipmove') {
        if (this.els.actionSelect) this.els.actionSelect.value = ACTION.SHIP_MOVE;
      } else if (preset === 'checkin') {
        if (this.els.actionSelect) this.els.actionSelect.value = ACTION.CHECKIN;
      } else if (preset === 'checkout') {
        if (this.els.actionSelect) this.els.actionSelect.value = ACTION.CHECKOUT;
      }
    },

    // =========================================================================
    // CLEAR FILTERS
    // =========================================================================
    clearFilters() {
      console.log('[HistoryView] Clearing filters');
      
      // Clear date inputs and disable date filter
      if (this.els.dateFrom) this.els.dateFrom.value = '';
      if (this.els.dateTo) this.els.dateTo.value = '';
      this.state.dateFilterEnabled = false;
      
      if (this.els.actionSelect) this.els.actionSelect.value = '';
      if (this.els.employeeSelect) this.els.employeeSelect.value = '';
      if (this.els.keywordInput) this.els.keywordInput.value = '';
      if (this.els.fieldSelect) this.els.fieldSelect.value = '';
      if (this.els.valueSelect) {
        this.els.valueSelect.value = '';
        this.els.valueSelect.disabled = true;
      }
      this.applyFiltersAndRender(true);
    },

    // =========================================================================
    // REFRESH DATA
    // =========================================================================
    refreshData() {
      console.log('[HistoryView] Refreshing data...');
      
      if (window.DataManager && typeof window.DataManager.loadAllData === 'function') {
        window.DataManager.loadAllData().then(() => {
          this.ensureHistoryEventsBuilt(true);
          this.applyFiltersAndRender(true);
        }).catch(err => {
          console.error('[HistoryView] Refresh failed:', err);
          this.ensureHistoryEventsBuilt(false);
          this.applyFiltersAndRender(true);
        });
      } else {
        this.ensureHistoryEventsBuilt(false);
        this.applyFiltersAndRender(true);
      }
    },

    // =========================================================================
    // POPULATE EMPLOYEE DROPDOWN
    // =========================================================================
    populateEmployeeDropdown() {
      if (!this.els.employeeSelect) return;
      
      const handlers = new Set();
      this.state.allEvents.forEach(ev => {
        if (ev.Handler) handlers.add(ev.Handler);
      });
      
      const sorted = Array.from(handlers).sort();
      let html = '<option value="">すべて / Tất cả</option>';
      sorted.forEach(h => {
        html += `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`;
      });
      this.els.employeeSelect.innerHTML = html;
    },

    // POPULATE VALUE DROPDOWN based on selected field
    populateValueDropdown() {
      if (!this.els.fieldSelect || !this.els.valueSelect) return;
      
      const field = this.els.fieldSelect.value;
      this.els.valueSelect.innerHTML = '<option value="">-- Chọn --</option>';
      
      if (!field) {
        this.els.valueSelect.disabled = true;
        return;
      }
      
      this.els.valueSelect.disabled = false;
      const values = new Set();
      
      this.state.allEvents.forEach(ev => {
        let val = '';
        if (field === 'date') {
          val = getDateKey(ev.EventDate);
        } else if (field === 'itemCode') {
          val = ev.ItemCode;
        } else if (field === 'itemName') {
          val = ev.ItemName;
        } else if (field === 'action') {
          val = ev.ActionKey;
        } else if (field === 'from') {
          val = ev.FromCompanyName || ev.FromRackLayer;
        } else if (field === 'to') {
          val = ev.ToCompanyName || ev.ToRackLayer;
        } else if (field === 'notes') {
          val = ev.Notes;
        } else if (field === 'handler') {
          val = ev.Handler;
        }
        
        if (val && val !== '-') {
          values.add(val.trim());
        }
      });
      
      const sorted = Array.from(values).sort();
      
      // Special handling for 'action' field
      if (field === 'action') {
        Object.keys(ACTION).forEach(key => {
          if (key !== 'ALL') {
            const meta = actionMeta(ACTION[key]);
            this.els.valueSelect.innerHTML += `<option value="${ACTION[key]}">${meta.ja} / ${meta.vi}</option>`;
          }
        });
      } else {
        sorted.forEach(v => {
          this.els.valueSelect.innerHTML += `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`;
        });
      }
      
      console.log('[HistoryView] Value dropdown populated:', sorted.length, 'options');
    },

    // =========================================================================
    // APPLY FILTERS & RENDER - SMART DATE SEARCH
    // =========================================================================
    applyFiltersAndRender(resetPage) {
      if (resetPage) {
        this.state.currentPage = 1;
      }
      
      // Get filter values
      const dateFrom = this.els.dateFrom ? this.els.dateFrom.value : '';
      const dateTo = this.els.dateTo ? this.els.dateTo.value : '';
      const actionFilter = this.els.actionSelect ? this.els.actionSelect.value : '';
      const employeeFilter = this.els.employeeSelect ? this.els.employeeSelect.value : '';
      const keyword = this.els.keywordInput ? toLower(this.els.keywordInput.value.trim()) : '';
      
      // Field/Value filter
      const filterField = this.els.fieldSelect ? this.els.fieldSelect.value : '';
      const filterValue = this.els.valueSelect ? toLower(this.els.valueSelect.value.trim()) : '';
      
      // Filter events
      let filtered = this.state.allEvents.filter(ev => {
        // Date range - only if enabled
        if (this.state.dateFilterEnabled) {
          if (dateFrom && ev.EventDateKey < dateFrom) return false;
          if (dateTo && ev.EventDateKey > dateTo) return false;
        }
        
        // Action
        if (actionFilter && ev.ActionKey !== actionFilter) return false;
        
        // Employee
        if (employeeFilter && ev.Handler !== employeeFilter) return false;
        
        // Smart keyword search (including date formats)
        if (keyword) {
          // Check if keyword looks like a date (contains only digits, /, -)
          const isDateLike = /^[\d\/\-]+$/.test(keyword);
          
          if (isDateLike) {
            // Try date matching first
            if (matchesDateSearch(ev.EventDate, keyword)) {
              return true; // Match found in date
            }
          }
          
          // Regular text search in all fields
          const searchableText = [
            ev.ItemCode,
            ev.ItemName,
            ev.FromCompanyName,
            ev.ToCompanyName,
            ev.FromRackLayer,
            ev.ToRackLayer,
            ev.Notes,
            ev.Handler,
            ev.EventDate // Also search raw date string
          ].join(' ').toLowerCase();
          
          if (!searchableText.includes(keyword)) return false;
        }
        
        // Field/Value filter
        if (filterField && filterValue) {
          let fieldVal = '';
          if (filterField === 'date') {
            fieldVal = getDateKey(ev.EventDate);
          } else if (filterField === 'itemCode') {
            fieldVal = ev.ItemCode;
          } else if (filterField === 'itemName') {
            fieldVal = ev.ItemName;
          } else if (filterField === 'action') {
            fieldVal = ev.ActionKey;
          } else if (filterField === 'from') {
            fieldVal = ev.FromCompanyName || ev.FromRackLayer;
          } else if (filterField === 'to') {
            fieldVal = ev.ToCompanyName || ev.ToRackLayer;
          } else if (filterField === 'notes') {
            fieldVal = ev.Notes;
          } else if (filterField === 'handler') {
            fieldVal = ev.Handler;
          }
          
          if (toLower(fieldVal) !== filterValue) return false;
        }
        
        return true;
      });
      
      // Sort with proper timestamp comparison for date
      filtered.sort((a, b) => {
        const key = this.state.sortKey;
        const order = this.state.sortDir;
        
        let valA, valB;
        
        // Use timestamp for date sorting
        if (key === 'date') {
          valA = a.EventTimestamp || 0;
          valB = b.EventTimestamp || 0;
          return order === 'asc' ? valA - valB : valB - valA;
        }
        
        // Other columns: string comparison
        if (key === 'item') {
          valA = toLower(a.ItemCode + ' ' + a.ItemName);
          valB = toLower(b.ItemCode + ' ' + b.ItemName);
        } else if (key === 'action') {
          valA = a.ActionKey;
          valB = b.ActionKey;
        } else if (key === 'from') {
          valA = toLower(a.FromCompanyName || a.FromRackLayer);
          valB = toLower(b.FromCompanyName || b.FromRackLayer);
        } else if (key === 'to') {
          valA = toLower(a.ToCompanyName || a.ToRackLayer);
          valB = toLower(b.ToCompanyName || b.ToRackLayer);
        } else if (key === 'notes') {
          valA = toLower(a.Notes);
          valB = toLower(b.Notes);
        } else if (key === 'handler') {
          valA = toLower(a.Handler);
          valB = toLower(b.Handler);
        } else {
          valA = toLower(a[key] || '');
          valB = toLower(b[key] || '');
        }
        
        if (valA < valB) return order === 'asc' ? -1 : 1;
        if (valA > valB) return order === 'asc' ? 1 : -1;
        return 0;
      });
      
      this.state.filteredEvents = filtered;
      this.renderTable();
      this.renderPagination();
      this.updateSummary();
      this.updateStats();
      this.updateSortIndicators();
      
      console.log('[HistoryView] Filtered:', filtered.length, '/', this.state.allEvents.length);
    },

    // =========================================================================
    // TOGGLE SORT
    // =========================================================================
    toggleSort(key) {
      if (this.state.sortKey === key) {
        this.state.sortDir = this.state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.state.sortKey = key;
        this.state.sortDir = 'desc'; // Default to descending
      }
      console.log('[HistoryView] Sort:', this.state.sortKey, this.state.sortDir);
    },

    updateSortIndicators() {
      const ths = document.querySelectorAll('.hist-table thead th.sortable');
      ths.forEach(th => {
        const key = th.getAttribute('data-sort-key');
        th.classList.remove('sorted-asc', 'sorted-desc');
        
        if (key === this.state.sortKey) {
          th.classList.add(this.state.sortDir === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }
      });
    },

    // =========================================================================
    // RENDER TABLE - WITH UNREAD HIGHLIGHT
    // =========================================================================
    renderTable() {
      if (!this.els.tableBody) return;
      
      const pageSize = this.state.pageSize;
      const currentPage = this.state.currentPage;
      const start = (currentPage - 1) * pageSize;
      const end = start + pageSize;
      const pageEvents = this.state.filteredEvents.slice(start, end);
      
      if (pageEvents.length === 0) {
        this.els.tableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:20px;color:#888;">データなし / Không có dữ liệu</td></tr>';
        return;
      }
      
      let html = '';
      pageEvents.forEach(ev => {
        const { date, time } = formatDateTime(ev.EventDate);
        const itemCode = escapeHtml(ev.ItemCode || '-');
        const itemName = escapeHtml(ev.ItemName || '-');
        const meta = actionMeta(ev.ActionKey);
        const actionBadge = `<span class="hist-action-badge ${meta.badgeClass}">${meta.ja}</span>`;
        
        let fromVal = '-';
        let toVal = '-';
        
        if (ev.ActionKey === ACTION.LOCATION_CHANGE) {
          fromVal = escapeHtml(ev.FromRackLayer || '-');
          toVal = escapeHtml(ev.ToRackLayer || '-');
        } else if (isInOut(ev.ActionKey) || isMove(ev.ActionKey)) {
          fromVal = escapeHtml(ev.FromCompanyName || '-');
          toVal = escapeHtml(ev.ToCompanyName || '-');
        }
        
        const notes = escapeHtml(ev.Notes || '-');
        const handler = escapeHtml(ev.Handler || '-');
        
        // Check if unread (recent + not read + specific actions)
        const isUnread = ev.IsRecent && !ev.IsRead && 
                        (ev.ActionKey === ACTION.SHIP_OUT || ev.ActionKey === ACTION.LOCATION_CHANGE);
        const unreadClass = isUnread ? 'hist-row-unread' : '';
        
        html += `
          <tr data-eventid="${escapeHtml(ev.EventID)}" class="${unreadClass}">
            <td class="hist-col-date">
              <div class="date">${date}</div>
              <div class="time">${time}</div>
            </td>
            <td class="hist-col-item">
              <div class="code">${itemCode}</div>
              <div class="name">${itemName}</div>
            </td>
            <td class="hist-col-action">${actionBadge}</td>
            <td class="hist-col-from">${fromVal}</td>
            <td class="hist-col-to">${toVal}</td>
            <td class="hist-col-notes">${notes}</td>
            <td class="hist-col-handler">${handler}</td>
          </tr>
        `;
      });
      
      this.els.tableBody.innerHTML = html;
    },

    // =========================================================================
    // RENDER PAGINATION
    // =========================================================================
    renderPagination() {
      const totalPages = Math.ceil(this.state.filteredEvents.length / this.state.pageSize);
      const currentPage = this.state.currentPage;
      
      if (!this.els.paginationWrap) return;
      const inner = this.els.paginationWrap.querySelector('.hist-pagination-inner');
      if (!inner) return;
      
      if (totalPages <= 1) {
        inner.innerHTML = '';
        return;
      }
      
      let html = '';
      
      // Previous button
      if (currentPage > 1) {
        html += `<button class="hist-page-btn" data-page="${currentPage - 1}">&laquo;</button>`;
      } else {
        html += `<button class="hist-page-btn" disabled>&laquo;</button>`;
      }
      
      // Page numbers (with ellipsis)
      const maxButtons = 7;
      let startPage = Math.max(1, currentPage - 3);
      let endPage = Math.min(totalPages, currentPage + 3);
      
      if (totalPages <= maxButtons) {
        startPage = 1;
        endPage = totalPages;
      }
      
      if (startPage > 1) {
        html += `<button class="hist-page-btn" data-page="1">1</button>`;
        if (startPage > 2) {
          html += `<span class="hist-page-ellipsis">...</span>`;
        }
      }
      
      for (let i = startPage; i <= endPage; i++) {
        if (i === currentPage) {
          html += `<button class="hist-page-btn active" data-page="${i}">${i}</button>`;
        } else {
          html += `<button class="hist-page-btn" data-page="${i}">${i}</button>`;
        }
      }
      
      if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
          html += `<span class="hist-page-ellipsis">...</span>`;
        }
        html += `<button class="hist-page-btn" data-page="${totalPages}">${totalPages}</button>`;
      }
      
      // Next button
      if (currentPage < totalPages) {
        html += `<button class="hist-page-btn" data-page="${currentPage + 1}">&raquo;</button>`;
      } else {
        html += `<button class="hist-page-btn" disabled>&raquo;</button>`;
      }
      
      inner.innerHTML = html;
      
      // Bind click events
      inner.querySelectorAll('.hist-page-btn[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
          const page = parseInt(btn.getAttribute('data-page'), 10);
          this.goToPage(page);
        });
      });
    },

    goToPage(page) {
      const totalPages = Math.ceil(this.state.filteredEvents.length / this.state.pageSize);
      if (page < 1 || page > totalPages) return;
      
      this.state.currentPage = page;
      this.renderTable();
      this.renderPagination();
      this.updateSummary();
      
      // Scroll to top of table
      if (this.els.tableWrap) {
        this.els.tableWrap.scrollTop = 0;
      }
    },

    // =========================================================================
    // UPDATE SUMMARY & STATS
    // =========================================================================
    updateSummary() {
      if (!this.els.summaryEl) return;
      
      const total = this.state.filteredEvents.length;
      const pageSize = this.state.pageSize;
      const currentPage = this.state.currentPage;
      const start = (currentPage - 1) * pageSize + 1;
      const end = Math.min(currentPage * pageSize, total);
      const totalPages = Math.ceil(total / pageSize);
      
      const dateFrom = this.els.dateFrom ? this.els.dateFrom.value : '';
      const dateTo = this.els.dateTo ? this.els.dateTo.value : '';
      const dateRange = (this.state.dateFilterEnabled && dateFrom && dateTo) ? `${dateFrom} ~ ${dateTo}` : '全期間';
      
      const allTotal = this.state.allEvents.length;
      
      this.els.summaryEl.innerHTML = `
        表示 ${start}-${end} / 全${total}件 (${dateRange}) / Hiển thị ${start}-${end} / tổng ${total} 
        <span style="font-size:11px;opacity:0.75;">(Page ${currentPage}/${totalPages})</span>
      `;
    },

    updateStats() {
      const filtered = this.state.filteredEvents;
      const total = filtered.length;
      const audit = filtered.filter(ev => ev.ActionKey === ACTION.AUDIT).length;
      const location = filtered.filter(ev => ev.ActionKey === ACTION.LOCATION_CHANGE).length;
      const inout = filtered.filter(ev => 
        ev.ActionKey === ACTION.CHECKIN || 
        ev.ActionKey === ACTION.CHECKOUT ||
        ev.ActionKey === ACTION.SHIP_IN ||
        ev.ActionKey === ACTION.SHIP_OUT ||
        ev.ActionKey === ACTION.SHIP_MOVE
      ).length;
      
      if (this.els.statTotal) this.els.statTotal.textContent = total;
      if (this.els.statAudit) this.els.statAudit.textContent = audit;
      if (this.els.statMove) this.els.statMove.textContent = location;
      if (this.els.statIO) this.els.statIO.textContent = inout;
    },

      /**
     * OPEN DETAIL FOR EVENT ID (r7.1.9 - Improved debugging)
     */
    openDetailForEventID(eventId) {
      console.log('[HistoryView] 🔍 openDetailForEventID called:', eventId);
      
      const event = this.state.filteredEvents.find(ev => ev.EventID === eventId);
      if (!event) {
        console.warn('[HistoryView] ❌ Event not found:', eventId);
        return;
      }

      console.log('[HistoryView] ✅ Event found:', event);

      // Check MobileDetailModal availability
      if (!window.MobileDetailModal) {
        console.error('[HistoryView] ❌ window.MobileDetailModal not found');
        alert('MobileDetailModal chưa sẵn sàng. Vui lòng thử lại.');
        return;
      }

      if (typeof window.MobileDetailModal.show !== 'function') {
        console.error('[HistoryView] ❌ MobileDetailModal.show is not a function');
        alert('MobileDetailModal.show không khả dụng.');
        return;
      }

      const itemType = event.ItemType; // 'mold' or 'cutter'
      const itemId = event.ItemId;
      let fullItem = null;
      
      console.log('[HistoryView] 📦 Searching for:', itemType, itemId);
      
      if (itemType === 'mold') {
        fullItem = this.state.master.moldsById.get(itemId);
      } else if (itemType === 'cutter') {
        fullItem = this.state.master.cuttersById.get(itemId);
      }
      
      if (fullItem) {
        console.log('[HistoryView] ✅ Item found in master, opening modal...', fullItem);
        
        // Close quick info popup if exists
        const popup = document.querySelector('.hist-quick-info-popup');
        if (popup) {
          popup.remove();
          console.log('[HistoryView] ✅ Popup closed before opening modal');
        }
        
        // Small delay to ensure popup is closed
        setTimeout(() => {
          window.MobileDetailModal.show(fullItem, itemType);
          console.log('[HistoryView] ✅ Modal.show() called');
        }, 50);
        
      } else {
        console.error('[HistoryView] ❌ Item not found in master:', itemType, itemId);
        alert(`Không tìm thấy ${itemType === 'mold' ? 'khuôn' : 'dao'} ID: ${itemId}`);
      }
    },


    /**
     * Show quick info popup near the clicked badge (r7.1.9)
     */
    showQuickInfoPopup(clickEvent, eventId) {
      // Close existing popup
      const existingPopup = document.querySelector('.hist-quick-info-popup');
      if (existingPopup) {
        existingPopup.remove();
      }

      const ev = this.state.allEvents.find(e => e.EventID === eventId);
      if (!ev) return;

      const { date, time } = formatDateTime(ev.EventDate);
      const meta = actionMeta(ev.ActionKey);

      // Create popup HTML
      const popup = document.createElement('div');
      popup.className = 'hist-quick-info-popup';
      popup.innerHTML = `
        <div class="hist-quick-info-header">
          <span class="hist-quick-info-title">履歴情報 / History Info</span>
          <button class="hist-quick-info-close" title="Close">×</button>
        </div>
        <div class="hist-quick-info-body">
          <div class="hist-quick-info-row">
            <span class="hist-quick-info-label">日時 / Date:</span>
            <span class="hist-quick-info-value">${escapeHtml(date)} ${escapeHtml(time)}</span>
          </div>
          <div class="hist-quick-info-row">
            <span class="hist-quick-info-label">ID / Code:</span>
            <span class="hist-quick-info-value">${escapeHtml(ev.ItemCode)}</span>
          </div>
          <div class="hist-quick-info-row">
            <span class="hist-quick-info-label">名前 / Name:</span>
            <span class="hist-quick-info-value">${escapeHtml(ev.ItemName)}</span>
          </div>
          <div class="hist-quick-info-row">
            <span class="hist-quick-info-label">種類 / Action:</span>
            <span class="hist-quick-info-value">${meta.ja} / ${meta.vi}</span>
          </div>
          <div class="hist-quick-info-row">
            <span class="hist-quick-info-label">元 / From:</span>
            <span class="hist-quick-info-value">${escapeHtml(ev.FromCompanyName || ev.FromRackLayer || '-')}</span>
          </div>
          <div class="hist-quick-info-row">
            <span class="hist-quick-info-label">先 / To:</span>
            <span class="hist-quick-info-value">${escapeHtml(ev.ToCompanyName || ev.ToRackLayer || '-')}</span>
          </div>
          <div class="hist-quick-info-row">
            <span class="hist-quick-info-label">注記 / Notes:</span>
            <span class="hist-quick-info-value">${escapeHtml(ev.Notes || '-')}</span>
          </div>
          <div class="hist-quick-info-row">
            <span class="hist-quick-info-label">担当 / Handler:</span>
            <span class="hist-quick-info-value">${escapeHtml(ev.Handler || '-')}</span>
          </div>
        </div>
      `;

      document.body.appendChild(popup);

      // Position popup near click
      const rect = clickEvent.target.getBoundingClientRect();
      const popupRect = popup.getBoundingClientRect();
      
      let left = rect.left + (rect.width / 2) - (popupRect.width / 2);
      let top = rect.bottom + 8;

      // Keep within viewport
      if (left < 8) left = 8;
      if (left + popupRect.width > window.innerWidth - 8) {
        left = window.innerWidth - popupRect.width - 8;
      }
      if (top + popupRect.height > window.innerHeight - 8) {
        top = rect.top - popupRect.height - 8;
      }

      popup.style.left = `${left}px`;
      popup.style.top = `${top}px`;

      // Close button
      const closeBtn = popup.querySelector('.hist-quick-info-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => popup.remove());
      }

      // Close on outside click
      setTimeout(() => {
        const closeOnOutside = (e) => {
          if (!popup.contains(e.target)) {
            popup.remove();
            document.removeEventListener('click', closeOnOutside);
          }
        };
        document.addEventListener('click', closeOnOutside);
      }, 100);
    },

    // =========================================================================
    // EXPORT CSV
    // =========================================================================
    exportCsv() {
      if (!this.state.filteredEvents || this.state.filteredEvents.length === 0) {
        alert('データがありません / Không có dữ liệu');
        return;
      }
      
      const BOM = '\uFEFF';
      const headers = ['日時', 'コード', '名称', '種類', '旧', '新', '備考', '担当'];
      const lines = [BOM + headers.join(',')];
      
      this.state.filteredEvents.forEach(ev => {
        const { date, time } = formatDateTime(ev.EventDate);
        const datetime = `${date} ${time}`;
        const itemCode = ev.ItemCode || '-';
        const itemName = ev.ItemName || '-';
        const meta = actionMeta(ev.ActionKey);
        const action = meta.ja;
        
        let fromVal = '-';
        let toVal = '-';
        if (ev.ActionKey === ACTION.LOCATION_CHANGE) {
          fromVal = ev.FromRackLayer || '-';
          toVal = ev.ToRackLayer || '-';
        } else if (isInOut(ev.ActionKey) || isMove(ev.ActionKey)) {
          fromVal = ev.FromCompanyName || '-';
          toVal = ev.ToCompanyName || '-';
        }
        
        const notes = (ev.Notes || '-').replace(/"/g, '""');
        const handler = ev.Handler || '-';
        
        const row = [
          `"${datetime}"`,
          `"${itemCode}"`,
          `"${itemName}"`,
          `"${action}"`,
          `"${fromVal}"`,
          `"${toVal}"`,
          `"${notes}"`,
          `"${handler}"`
        ];
        
        lines.push(row.join(','));
      });
      
      const csvContent = lines.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      link.href = url;
      link.download = `history-${timestamp}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('[HistoryView] CSV exported');
    },

    // =========================================================================
    // PRINT
    // =========================================================================
    print() {
      if (!this.state.filteredEvents || this.state.filteredEvents.length === 0) {
        alert('データがありません / Không có dữ liệu');
        return;
      }
      
      const win = window.open('', '_blank');
      if (!win) return;
      
      let rows = '';
      this.state.filteredEvents.forEach((ev, idx) => {
        const { date, time } = formatDateTime(ev.EventDate);
        const datetime = `${date} ${time}`;
        const meta = actionMeta(ev.ActionKey);
        
        let fromVal = '-';
        let toVal = '-';
        if (ev.ActionKey === ACTION.LOCATION_CHANGE) {
          fromVal = ev.FromRackLayer || '-';
          toVal = ev.ToRackLayer || '-';
        } else if (isInOut(ev.ActionKey) || isMove(ev.ActionKey)) {
          fromVal = ev.FromCompanyName || '-';
          toVal = ev.ToCompanyName || '-';
        }
        
        rows += `
          <tr>
            <td>${idx + 1}</td>
            <td>${datetime}</td>
            <td>${escapeHtml(ev.ItemCode || '-')}</td>
            <td>${escapeHtml(ev.ItemName || '-')}</td>
            <td>${meta.ja}</td>
            <td>${escapeHtml(fromVal)}</td>
            <td>${escapeHtml(toVal)}</td>
            <td>${escapeHtml(ev.Notes || '-')}</td>
            <td>${escapeHtml(ev.Handler || '-')}</td>
          </tr>
        `;
      });
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>履歴 / Lịch sử</title>
          <style>
            body { font-family: Arial, sans-serif; font-size: 11px; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
            th { background: #eee; font-weight: bold; }
            h3 { margin: 0 0 10px 0; }
          </style>
        </head>
        <body>
          <h3>履歴 / Lịch sử</h3>
          <table>
            <thead>
              <tr>
                <th>No</th>
                <th>日時</th>
                <th>コード</th>
                <th>名称</th>
                <th>種類</th>
                <th>旧</th>
                <th>新</th>
                <th>備考</th>
                <th>担当</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          <script>window.print();</script>
        </body>
        </html>
      `;
      
      win.document.write(html);
      win.document.close();
      
      console.log('[HistoryView] Print initiated');
    },

    // =========================================================================
    // SEND MAIL
    // =========================================================================
    sendMail() {
      if (!this.state.filteredEvents || this.state.filteredEvents.length === 0) {
        alert('データがありません / Không có dữ liệu');
        return;
      }
      
      const maxLines = 30;
      const lines = [];
      
      lines.push('履歴 / Lịch sử');
      lines.push('');
      lines.push('----------------------------------------');
      
      const header = `No  日時            コード         名称          種類      旧/新`;
      lines.push(header);
      lines.push('----------------------------------------');
      
      this.state.filteredEvents.slice(0, maxLines).forEach((ev, idx) => {
        const { date, time } = formatDateTime(ev.EventDate);
        const datetime = `${date} ${time}`.padEnd(16);
        const itemCode = (ev.ItemCode || '-').padEnd(14);
        const itemName = (ev.ItemName || '-').substring(0, 12).padEnd(13);
        const meta = actionMeta(ev.ActionKey);
        const action = meta.ja.padEnd(9);
        
        let fromTo = '-';
        if (ev.ActionKey === ACTION.LOCATION_CHANGE) {
          fromTo = `${ev.FromRackLayer || '-'}→${ev.ToRackLayer || '-'}`;
        } else if (isInOut(ev.ActionKey) || isMove(ev.ActionKey)) {
          fromTo = `${ev.FromCompanyName || '-'}→${ev.ToCompanyName || '-'}`;
        }
        
        const line = `${String(idx + 1).padStart(3)}  ${datetime} ${itemCode} ${itemName} ${action} ${fromTo}`;
        lines.push(line);
      });
      
      lines.push('----------------------------------------');
      
      if (this.state.filteredEvents.length > maxLines) {
        lines.push(`... and ${this.state.filteredEvents.length - maxLines} more`);
      }
      
      lines.push('');
      lines.push('---');
      lines.push('MoldCutterSearch');
      
      const subject = encodeURIComponent('履歴レポート / History Report - ' + new Date().toISOString().slice(0, 10));
      const body = encodeURIComponent(lines.join('\n'));
      
      window.location.href = `mailto:toan@ysd-pack.co.jp?subject=${subject}&body=${body}`;
      
      console.log('[HistoryView] Mail client opened');
    }
  };

  // ===========================================================================
  // AUTO INIT
  // ===========================================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      HistoryView.init();
    });
  } else {
    HistoryView.init();
  }

  // ✅ Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    HistoryView.stopBadgePolling();
  });

  // Expose to window
  window.HistoryView = HistoryView;

  console.log('[HistoryView r7.1.8] Module loaded');

})();

/**
 * =============================================================================
 * CHANGELOG r7.1.8 (2025-12-19 04:56 JST)
 * =============================================================================
 * 
 * FIXES:
 * ------
 * ✅ Badge not showing on navbar:
 *    - Improved selector to find trigger buttons (multiple selectors)
 *    - Ensure button has position:relative before adding badge
 *    - Added debug logging for badge creation
 * 
 * ✅ Lock/Unlock table behavior:
 *    - LOCK mode (default): Hide Notes & Handler columns
 *      → Show only 5 columns (Date, Item, Action, From, To)
 *      → Columns fit in viewport, no horizontal scroll
 *    - UNLOCK mode: Show all 7 columns
 *      → Expanded column widths for single-line content
 *      → Enable horizontal scroll to see all columns
 *      → Notes & Handler columns become visible
 * 
 * PRESERVED:
 * ----------
 * ✅ All r7.1.7 features:
 *    - Default show ALL data (no date filter on load)
 *    - Smart date search (20251218, 1218, 202512, etc.)
 *    - Auto-refresh on open
 *    - Notification system (出 red, 位 orange)
 *    - Unread row highlight + mark as read
 *    - Compact mobile filter layout (3 rows)
 *    - Swipe to close
 *    - iOS safe area support
 * 
 * =============================================================================
 */

/**
 * inventory-manager-r7.3.4-2.js
 * Inventory Manager Core r7.3.4 (FIXED event-bridge + session + audit integration)
 *
 * Key fixes (2026-01-07):
 * - Emit BOTH legacy events and colon-namespaced events for compatibility:
 *   + inventorymodeChanged  AND inventory:modeChanged
 *   + inventorybulkMode     AND inventory:bulkMode
 *   + inventoryauditRecorded AND inventory:auditRecorded
 *   + inventorybulkAuditProgress AND inventory:bulkAuditProgress
 *   + inventorybulkAuditCompleted AND inventory:bulkAuditCompleted
 *   + inventorysessionChanged AND inventory:sessionChanged
 * - Provide safe session name uniqueness
 * - Provide public helpers: getDailySequence(), generateSessionName(), generateSessionId()
 * - Provide fallback handler for inventory:auditSingle (ToolFloat) to actually record audit
 *
 * Dependencies:
 * - Backend endpoints:
 *   POST {BACKEND_BASE}/api/checklog
 *   POST {BACKEND_BASE}/api/locationlog
 *   POST {BACKEND_BASE}/api/audit-batch
 *
 * Notes:
 * - UI bilingual messages JP first, then VI.
 * - Designed to work with external SelectionManager or built-in fallback.
 */

(function () {
  'use strict';

  // -------------------------------------
  // Constants
  // -------------------------------------
  const VERSION = 'r7.3.2';
  const BACKEND_BASE = 'https://ysd-moldcutter-backend.onrender.com';

  const LSKEYS = Object.freeze({
    config: `inventory.config.${VERSION}`,
    history: `inventory.history.${VERSION}`,
    queue: `inventory.queue.${VERSION}`,
  });

  const DEFAULTS = Object.freeze({
    requestTimeoutMs: 20000,
    sequentialDelayMs: 350,
    sequentialDelayOnFailMs: 250,
    queueMax: 200,
    historyMax: 100,
    selectionAutoHighlight: true,
    // When ToolFloat fires inventory:auditSingle, do we auto-clear selection after success?
    autoClearSelectionOnSingleAudit: true,
  });

  const SESSIONMODE = Object.freeze({
    A: 'A', // RackLayerID based
    B: 'B', // List based
    INSTANT: 'INSTANT', // Quick/instant audit
  });

  // -------------------------------------
  // i18n helpers (JP priority)
  // -------------------------------------
  function msg(ja, vi) {
    return { ja: String(ja || ''), vi: String(vi || '') };
  }

  function formatMsg(m) {
    if (!m) return '';
    if (typeof m === 'string') return m;
    const ja = m.ja ? String(m.ja) : '';
    const vi = m.vi ? String(m.vi) : '';
    if (ja && vi) return `${ja}\n${vi}`;
    return ja || vi || '';
  }

  // -------------------------------------
  // Basic utils
  // -------------------------------------
  function nowIso() {
    return new Date().toISOString();
  }

  function todayIsoDate() {
    return new Date().toISOString().split('T')[0];
  }

  function safeJsonParse(str, fallback) {
    try {
      return JSON.parse(str);
    } catch (e) {
      return fallback;
    }
  }

  function safeString(v) {
    if (v === null || v === undefined) return '';
    return String(v);
  }

  function toHalfWidthRackStr(v) {
    if (v === null || v === undefined) return '';
    return String(v)
        .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
        .replace(/[－‐‑–—ー]/g, '-') // các loại dấu gạch
        .replace(/[　]/g, ' ');      // fullwidth space
    }

    // Chuẩn hoá về dạng "13", "700"... (chỉ số)
    // - "1-3" => "13"
    // - "70-0" => "700"
    // - "013" => "13"
    function normalizeRackLayerIdInput(raw) {
    const s0 = toHalfWidthRackStr(raw).trim();
    if (!s0) return '';

    const s = s0.replace(/\s+/g, '');
    const m = s.match(/^(\d+)-(\d+)$/);
    if (m) {
        const a = parseInt(m[1], 10);
        const b = parseInt(m[2], 10);
        if (Number.isFinite(a) && Number.isFinite(b)) return String(a) + String(b);
        const digits = s.replace(/[^0-9]/g, '');
        return digits ? String(parseInt(digits, 10)) : '';
    }

    if (/^\d+$/.test(s)) return String(parseInt(s, 10));

    const digits = s.replace(/[^0-9]/g, '');
    return digits ? String(parseInt(digits, 10)) : '';
    }

  function isFn(fn) {
    return typeof fn === 'function';
  }

  // Normalize item type for cross-modules
  function normalizeItemType(t) {
    const s = safeString(t).trim().toLowerCase();
    if (!s) return 'mold';
    if (s === 'mold' || s === 'khuon' || s === 'khuôn' || s === '金型') return 'mold';
    if (s === 'cutter' || s === 'dao' || s === 'dao cắt' || s === '刃型') return 'cutter';
    return s;
  }

  function getItemIdFromAny(item) {
    if (!item) return null;
    return (
      item.id ??
      item.itemId ??
      item.MoldID ??
      item.CutterID ??
      item.moldId ??
      item.cutterId ??
      item.code ??
      null
    );
  }

  // -------------------------------------
  // Event bridge (IMPORTANT FIX)
  // -------------------------------------
  function dispatch(name, detail) {
    try {
      document.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (e) {
      // ignore
    }
  }
  
  function forceCloseAnyDetailModal(reason) {
        try {
            // Ưu tiên phát event để module UI tự đóng modal theo cách của nó
            dispatch('inventorydetailModalRequestClose', { reason: reason || 'auditSingle', at: nowIso() });
            dispatch('inventorydetailModalClose', { reason: reason || 'auditSingle', at: nowIso() });
        } catch (e) {}

        // CRITICAL: Đóng MobileDetailModal trực tiếp nếu có
        try {
            if (window.MobileDetailModal && typeof window.MobileDetailModal.hide === 'function') {
                window.MobileDetailModal.hide();
                console.log('[InventoryManager] MobileDetailModal closed via .hide()');
                return; // Đã đóng thành công, không cần thử các cách khác
            }
        } catch (e) {
            console.warn('[InventoryManager] Failed to close MobileDetailModal:', e);
        }

        // Thử đóng trực tiếp các modal phổ biến (không chắc ID nên làm theo danh sách)
        try {
            const ids = ['mobile-detail-modal', 'detailModal', 'detail-modal', 'inventory-detail-modal', 'item-detail-modal'];
            for (const id of ids) {
                const el = document.getElementById(id);
                if (!el) continue;

                // Bootstrap Modal (nếu có)
                try {
                    if (window.bootstrap && window.bootstrap.Modal) {
                        const inst = window.bootstrap.Modal.getInstance(el) || new window.bootstrap.Modal(el);
                        inst.hide();
                        continue;
                    }
                } catch (e) {}

                // Fallback: click nút close/dismiss nếu có
                const btn = el.querySelector('[data-bs-dismiss="modal"], .modal-close, .close, button[aria-label="Close"]');
                if (btn && typeof btn.click === 'function') btn.click();

                // Fallback cuối: ẩn thẳng
                el.classList.remove('show');
                el.style.display = 'none';
            }
        } catch (e) {}
    }


  function dispatchCompat(names, detail) {
    (Array.isArray(names) ? names : [names]).forEach((n) => dispatch(n, detail));
  }

  // Common compat mappings
  const EVT = Object.freeze({
    modeChanged: ['inventorymodeChanged', 'inventory:modeChanged'], // object payload
    bulkMode: ['inventorybulkMode', 'inventory:bulkMode'],
    auditRecorded: ['inventoryauditRecorded', 'inventory:auditRecorded'],
    bulkAuditProgress: ['inventorybulkAuditProgress', 'inventory:bulkAuditProgress'],
    bulkAuditCompleted: ['inventorybulkAuditCompleted', 'inventory:bulkAuditCompleted'],
    sessionChanged: ['inventorysessionChanged', 'inventory:sessionChanged'],
    historyChanged: ['inventoryhistoryChanged', 'inventory:historyChanged'],
    queueChanged: ['inventoryqueueChanged', 'inventory:queueChanged'],
    selectionChanged: ['inventoryselectionChanged', 'inventory:selectionChanged'],
    notification: ['inventorynotification', 'inventory:notification'],
  });

  // -------------------------------------
  // InventoryState (writable, no Proxy)
  // -------------------------------------
  if (
    !window.InventoryState ||
    typeof window.InventoryState !== 'object' ||
    Array.isArray(window.InventoryState)
  ) {
    window.InventoryState = {};
  }

  const InventoryState = window.InventoryState;

  if (typeof InventoryState.active !== 'boolean') InventoryState.active = false;
  if (typeof InventoryState.bulkMode !== 'boolean') InventoryState.bulkMode = false;
  if (!Array.isArray(InventoryState.selectedItems)) InventoryState.selectedItems = [];
  if (!InventoryState.session) InventoryState.session = null;
  if (!InventoryState.config) InventoryState.config = {};
  if (typeof InventoryState.autoClose !== 'boolean') InventoryState.autoClose = false;

  // -------------------------------------
  // Persist: config, history, queue
  // -------------------------------------
  function loadConfig() {
    const raw = localStorage.getItem(LSKEYS.config);
    const cfg = safeJsonParse(raw, null);
    if (cfg && typeof cfg === 'object') {
      InventoryState.config = Object.assign({}, InventoryState.config, cfg);
    }
  }

  function saveConfig() {
    try {
      localStorage.setItem(LSKEYS.config, JSON.stringify(InventoryState.config || {}));
    } catch (e) {
      // ignore
    }
  }

  function loadHistory() {
    const raw = localStorage.getItem(LSKEYS.history);
    const hist = safeJsonParse(raw, []);
    return Array.isArray(hist) ? hist : [];
  }

  function saveHistory(list) {
    try {
      localStorage.setItem(LSKEYS.history, JSON.stringify(Array.isArray(list) ? list : []));
    } catch (e) {
      // ignore
    }
  }

  function pushHistory(entry) {
    const hist = loadHistory();
    hist.unshift(entry);
    const trimmed = hist.slice(0, DEFAULTS.historyMax);
    saveHistory(trimmed);
    dispatchCompat(EVT.historyChanged, { history: trimmed });
  }

  function loadQueue() {
    const raw = localStorage.getItem(LSKEYS.queue);
    const q = safeJsonParse(raw, []);
    return Array.isArray(q) ? q : [];
  }

  function saveQueue(q) {
    try {
      localStorage.setItem(LSKEYS.queue, JSON.stringify(Array.isArray(q) ? q : []));
    } catch (e) {
      // ignore
    }
  }

  function enqueueAction(action) {
    const q = loadQueue();
    q.push(Object.assign({ queuedAt: nowIso() }, action));
    const trimmed = q.slice(-DEFAULTS.queueMax);
    saveQueue(trimmed);
    dispatchCompat(EVT.queueChanged, { count: trimmed.length });
  }

  // -------------------------------------
  // Network helpers
  // -------------------------------------
  function withTimeout(promise, ms) {
    let timer = null;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), ms);
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  async function fetchJson(url, options, timeoutMs) {
    const res = await withTimeout(fetch(url, options), timeoutMs);
    const text = await res.text();
    const json = safeJsonParse(text, null);
    if (!res.ok) {
      const msgText = json && (json.message || json.error) ? (json.message || json.error) : text;
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${msgText}`);
    }
    return json;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // -------------------------------------
  // SelectionManager adapter
  // -------------------------------------
  function ensureSelectionGlobals() {
    if (!window.SelectionState || typeof window.SelectionState !== 'object') {
      window.SelectionState = { active: false, items: [] };
    } else {
      if (typeof window.SelectionState.active !== 'boolean') window.SelectionState.active = false;
      if (!Array.isArray(window.SelectionState.items)) window.SelectionState.items = [];
    }

    if (!Array.isArray(InventoryState.selectedItems)) InventoryState.selectedItems = [];
  }

  function syncInventorySelectedItemsFromSelectionState() {
    try {
      const items = Array.isArray(window.SelectionState?.items) ? window.SelectionState.items : [];
      InventoryState.selectedItems = items.map((sel) => ({
        id: safeString(sel.id),
        type: normalizeItemType(sel.type),
        item: sel.item || null,
      }));
    } catch (e) {
      // ignore
    }
  }

  function updateDomHighlightsDefault() {
    try {
      if (!DEFAULTS.selectionAutoHighlight) return;
      const items = Array.isArray(window.SelectionState?.items) ? window.SelectionState.items : [];
      const selectedKeys = new Set(items.map((s) => `${normalizeItemType(s.type)}::${safeString(s.id)}`));

      document.querySelectorAll('.result-card[data-id][data-type]').forEach((card) => {
        const id = safeString(card.getAttribute('data-id'));
        const type = normalizeItemType(card.getAttribute('data-type'));
        const key = `${type}::${id}`;
        const checkbox = card.querySelector('.inv-bulk-checkbox');
        if (selectedKeys.has(key)) {
          card.classList.add('inv-bulk-selected', 'inv-selected');
          if (checkbox) checkbox.classList.add('checked');
        } else {
          card.classList.remove('inv-bulk-selected', 'inv-selected');
          if (checkbox) checkbox.classList.remove('checked');
        }
      });

      document.querySelectorAll('mobile-table-body tr[data-id][data-type]').forEach((row) => {
        const id = safeString(row.getAttribute('data-id'));
        const type = normalizeItemType(row.getAttribute('data-type'));
        const key = `${type}::${id}`;
        const cb = row.querySelector('input.row-checkbox[type="checkbox"]');
        if (selectedKeys.has(key)) {
          row.classList.add('selected');
          if (cb) cb.checked = true;
        } else {
          row.classList.remove('selected');
          if (cb) cb.checked = false;
        }
      });
    } catch (e) {
      // ignore
    }
  }

  function makeBuiltInSelectionManager() {
    ensureSelectionGlobals();

    const SelectionManager = {
      setMode(enabled) {
        ensureSelectionGlobals();
        window.SelectionState.active = !!enabled;
        if (!enabled) window.SelectionState.items = [];
        syncInventorySelectedItemsFromSelectionState();
        updateDomHighlightsDefault();

        // Emit BOTH styles
        dispatchCompat(['selectionmodeChanged', 'selection:modeChanged'], {
          enabled: window.SelectionState.active,
          source: 'inventory-manager-built-in',
        });
        dispatchCompat(['selectionchanged', 'selection:changed'], {
          action: 'mode',
          total: window.SelectionState.items.length,
          items: window.SelectionState.items,
        });

        return window.SelectionState.active;
      },

      isSelected(id, type) {
        ensureSelectionGlobals();
        const sid = safeString(id);
        const stype = normalizeItemType(type);
        return window.SelectionState.items.some((s) => safeString(s.id) === sid && normalizeItemType(s.type) === stype);
      },

      getSelectedItems() {
        ensureSelectionGlobals();
        return window.SelectionState.items;
      },

      addItem(id, type, itemData) {
        ensureSelectionGlobals();
        const sid = safeString(id).trim();
        const stype = normalizeItemType(type);
        if (!sid) return;

        if (!this.isSelected(sid, stype)) {
          window.SelectionState.items.push({ id: sid, type: stype, item: itemData || null });
          syncInventorySelectedItemsFromSelectionState();
          updateDomHighlightsDefault();
          dispatchCompat(['selectionchanged', 'selection:changed'], {
            action: 'add',
            id: sid,
            type: stype,
            total: window.SelectionState.items.length,
            items: window.SelectionState.items,
          });
        }
      },

      removeItem(id, type) {
        ensureSelectionGlobals();
        const sid = safeString(id).trim();
        const stype = normalizeItemType(type);
        const before = window.SelectionState.items.length;
        window.SelectionState.items = window.SelectionState.items.filter(
          (s) => !(safeString(s.id) === sid && normalizeItemType(s.type) === stype)
        );
        if (window.SelectionState.items.length !== before) {
          syncInventorySelectedItemsFromSelectionState();
          updateDomHighlightsDefault();
          dispatchCompat(['selectionchanged', 'selection:changed'], {
            action: 'remove',
            id: sid,
            type: stype,
            total: window.SelectionState.items.length,
            items: window.SelectionState.items,
          });
        }
      },

      toggleItem(id, type, itemData) {
        if (this.isSelected(id, type)) this.removeItem(id, type);
        else this.addItem(id, type, itemData);
      },

      clear() {
        ensureSelectionGlobals();
        const cleared = window.SelectionState.items.length;
        window.SelectionState.items = [];
        syncInventorySelectedItemsFromSelectionState();
        updateDomHighlightsDefault();
        dispatchCompat(['selectionchanged', 'selection:changed'], {
          action: 'clear',
          total: 0,
          cleared,
          items: [],
        });
      },

      updateDomHighlights() {
        updateDomHighlightsDefault();
      },
    };

    return SelectionManager;
  }

  function getSelectionAPI() {
    ensureSelectionGlobals();
    const ext = window.SelectionManager;
    const ok = ext && isFn(ext.setMode) && isFn(ext.toggleItem) && isFn(ext.clear) && isFn(ext.getSelectedItems);
    if (ok) {
      try {
        syncInventorySelectedItemsFromSelectionState();
      } catch (e) {
        // ignore
      }
      return ext;
    }
    const builtIn = makeBuiltInSelectionManager();
    window.SelectionManager = builtIn;
    return builtIn;
  }

  // -------------------------------------
  // Backend API wrappers
  // -------------------------------------
  async function apiChecklog(payload) {
    return fetchJson(
      `${BACKEND_BASE}/api/checklog`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      DEFAULTS.requestTimeoutMs
    );
  }

  async function apiLocationlog(payload) {
    return fetchJson(
      `${BACKEND_BASE}/api/locationlog`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      DEFAULTS.requestTimeoutMs
    );
  }

  async function apiAuditBatch(payload) {
    return fetchJson(
      `${BACKEND_BASE}/api/audit-batch`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      DEFAULTS.requestTimeoutMs
    );
  }

  // -------------------------------------
  // Statuslog helpers (local)
  // -------------------------------------
  function findStatusLogsArray() {
    const logs = window.DataManager?.data?.statuslogs;
    return Array.isArray(logs) ? logs : [];
  }

  function matchesLogToItem(log, itemId, itemType) {
    const id = safeString(itemId).trim();
    if (!id) return false;

    const logMoldId = safeString(log?.MoldID).trim();
    const logCutterId = safeString(log?.CutterID).trim();
    const logItemType = normalizeItemType(log?.ItemType || log?.itemType || '');
    const t = normalizeItemType(itemType);

    if (logItemType && logItemType !== t) return false;
    return logMoldId === id || logCutterId === id;
  }

  function getLastAuditDate(itemId, itemType) {
    const logs = findStatusLogsArray();
    const filtered = logs.filter((l) => matchesLogToItem(l, itemId, itemType));
    if (!filtered.length) return null;

    filtered.sort((a, b) => {
      const ta = new Date(a.Timestamp || a.CheckTimestamp || a.UpdatedAt || a.CreatedAt || 0).getTime();
      const tb = new Date(b.Timestamp || b.CheckTimestamp || b.UpdatedAt || b.CreatedAt || 0).getTime();
      return tb - ta;
    });

    const latest = filtered[0];
    return latest?.Timestamp || latest?.CheckTimestamp || latest?.UpdatedAt || latest?.CreatedAt || null;
  }

  function isAuditedToday(itemId, itemType) {
    const last = getLastAuditDate(itemId, itemType);
    if (!last) return false;
    try {
      const d = new Date(last);
      if (Number.isNaN(d.getTime())) return false;
      return d.toISOString().split('T')[0] === todayIsoDate();
    } catch (e) {
      return false;
    }
  }

  // -------------------------------------
  // Badge management (Desktop/Mobile)
  // -------------------------------------
  function updateDesktopBadge(active) {
    const actionBtn = document.getElementById('btn-inventory-settings');
    if (!actionBtn) return;

    actionBtn.querySelectorAll('.inventory-badge').forEach((b) => b.remove());

    if (active) {
      const badge = document.createElement('span');
      badge.className = 'inventory-badge';
      badge.textContent = 'ON';
      badge.style.cssText =
        'position:absolute!important;top:4px!important;right:4px!important;background:#00c853!important;color:white!important;font-size:9px!important;font-weight:700!important;padding:2px 6px!important;border-radius:4px!important;line-height:1!important;box-shadow:0 1px 3px rgba(0,0,0,0.3)!important;z-index:10!important;pointer-events:none!important;';
      if (!actionBtn.style.position) actionBtn.style.position = 'relative';
      actionBtn.appendChild(badge);
    }
  }

  function updateMobileBadge(active) {
    const navBtn = document.getElementById('nav-inventory-btn');
    const navIcon = document.getElementById('nav-inventory-icon');
    const navLabel = document.getElementById('nav-inventory-label');
    if (!navBtn || !navIcon || !navLabel) return;

    navBtn.querySelectorAll('.inventory-badge').forEach((b) => b.remove());

    const jpSpan = navLabel.querySelector('.btn-label-ja');
    const viSpan = navLabel.querySelector('.btn-label-vi');

    if (active) {
      navIcon.className = 'fas fa-map-marker-alt bottom-nav-icon';
      if (jpSpan) jpSpan.textContent = '棚卸中';
      if (viSpan) viSpan.textContent = 'Đang kiểm kê';

      const badge = document.createElement('span');
      badge.className = 'inventory-badge';
      badge.textContent = 'ON';
      badge.style.cssText =
        'position:absolute;top:4px;right:4px;background:#00c853;color:white;font-size:9px;font-weight:700;padding:2px 5px;border-radius:3px;z-index:10;';
      if (!navBtn.style.position) navBtn.style.position = 'relative';
      navBtn.appendChild(badge);
    } else {
      navIcon.className = 'fas fa-clipboard-check bottom-nav-icon';
      if (jpSpan) jpSpan.textContent = '棚卸設定';
      if (viSpan) viSpan.textContent = 'Thiết lập kiểm kê';
    }
  }

  function updateBadge(active) {
    updateDesktopBadge(active);
    updateMobileBadge(active);
  }

  // -------------------------------------
  // Notifications
  // -------------------------------------
  function notify(messageObj, type) {
    const payload = {
      version: VERSION,
      type: type || 'info',
      message: messageObj || msg('', ''),
      text: formatMsg(messageObj),
      at: nowIso(),
    };
    dispatchCompat(EVT.notification, payload);

    // keep legacy minimal fallback for critical errors
    if (String(type || '').toLowerCase() === 'error') {
      try {
        alert(payload.text);
      } catch (e) {
        // ignore
      }
    }
  }

  // -------------------------------------
  // Session naming (single source of truth)
  // -------------------------------------
  function getDailySequence(mode, operatorId, date) {
    const hist = loadHistory();
    const today = date || todayIsoDate();
    const op = safeString(operatorId).trim();
    const m = safeString(mode).trim();

    const count = hist.filter((h) => {
      const startedAt = safeString(h?.startedAt);
      if (!startedAt) return false;
      const sessionDate = startedAt.split('T')[0];
      return sessionDate === today && safeString(h?.mode) === m && safeString(h?.operatorId) === op;
    }).length;

    return count + 1;
  }

  function generateSessionId(mode, operatorId) {
    const d = new Date();
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    const op = safeString(operatorId || 'OP').trim().toUpperCase();

    const modePrefix = mode === SESSIONMODE.INSTANT ? 'INS' : safeString(mode || 'A').toUpperCase();
    return `INV-${modePrefix}-${y}${mo}${da}-${hh}${mm}${ss}-${op}`;
  }

  function generateSessionName(mode, operatorId, customName) {
    const custom = safeString(customName).trim();
    if (custom) return custom;

    const today = todayIsoDate();
    const dateStr = today.replace(/-/g, '');
    const op = safeString(operatorId || 'OP').trim().toUpperCase();
    const seq = getDailySequence(mode, operatorId, today);

    if (mode === SESSIONMODE.INSTANT) return `${dateStr}-${op}-Audit`;
    const m = safeString(mode || SESSIONMODE.B).toUpperCase() === 'A' ? 'A' : 'B';
    return `${m}-${dateStr}-${op}-${seq}`;
  }

  function ensureUniqueSessionName(name) {
    const n = safeString(name).trim();
    if (!n) return n;

    const hist = loadHistory();
    const exists = (x) => hist.some((h) => safeString(h?.name).trim() === x);

    if (!exists(n)) return n;

    // If duplicated, suffix with -2, -3...
    let i = 2;
    while (exists(`${n}-${i}`)) i += 1;
    return `${n}-${i}`;
  }

  // -------------------------------------
  // Session state changes
  // -------------------------------------
  function setInventoryMode(active) {
    InventoryState.active = !!active;

    // Legacy boolean event
    dispatch('inventoryModeChanged', InventoryState.active);

    // New object payload event (compat)
    dispatchCompat(EVT.modeChanged, {
      inventoryOn: InventoryState.active,
      sessionActive: !!InventoryState.session,
      multiSelectEnabled: !!InventoryState.bulkMode,
      currentSession: InventoryState.session,
    });

    updateBadge(InventoryState.active);
  }

  function setBulkMode(enabled) {
    const sel = getSelectionAPI();

    InventoryState.bulkMode = !!enabled;

    // keep SelectionState in sync
    try {
      ensureSelectionGlobals();
      window.SelectionState.active = InventoryState.bulkMode;
    } catch (e) {
      // ignore
    }

    // Prefer SelectionManager.setMode if exists
    try {
      if (sel && isFn(sel.setMode)) sel.setMode(InventoryState.bulkMode);
    } catch (e) {
      // ignore
    }

    // Emit compat events for UIRenderer + others
    dispatchCompat(EVT.bulkMode, { enabled: InventoryState.bulkMode });
    dispatchCompat(['selectionmodeChanged', 'selection:modeChanged'], { enabled: InventoryState.bulkMode });

    return InventoryState.bulkMode;
  }

  function endSessionInternal(reason) {
    const sess = InventoryState.session;
    if (!sess) return null;

    sess.endedAt = nowIso();
    sess.endReason = safeString(reason || '');

    pushHistory({
      id: sess.id,
      name: sess.name,
      mode: sess.mode,
      operatorId: sess.operatorId,
      operatorName: sess.operatorName,
      note: sess.note,
      targetRackLayerId: sess.targetRackLayerId || null,
      compareEnabled: !!sess.compareEnabled,
      startedAt: sess.startedAt,
      endedAt: sess.endedAt,
      counts: Object.assign({ audited: 0, relocated: 0, failed: 0 }, sess.counts || {}),
    });

    InventoryState.session = null;
    dispatchCompat(EVT.sessionChanged, { session: null });
    return sess;
  }

  // -------------------------------------
  // Payload builders (with session info)
  // -------------------------------------
  function buildAuditPayload(itemId, itemType, extra) {
    const t = normalizeItemType(itemType);
    const id = safeString(itemId).trim();

    const sess = InventoryState.session;
    const operatorId =
      (extra && extra.operatorId) ||
      sess?.operatorId ||
      InventoryState.config?.lastOperatorId ||
      InventoryState.operator ||
      null;

    const payload = {
      Status: 'AUDIT',
      ItemType: t,
      EmployeeID: operatorId,
      DestinationID: 'AREA-MOLDROOM',
      Notes: (extra && extra.notes) || '棚卸 / Kiểm kê',
      Timestamp: (extra && extra.timestamp) || nowIso(),
      AuditDate: (extra && extra.auditDate) || todayIsoDate(),
      AuditType: (extra && extra.auditType) || ((extra && extra.withRelocation) ? 'AUDIT-WITH-RELOCATION' : 'AUDIT'),
      pending: false,

      // session fields
      SessionId: sess?.id || null,
      SessionName: sess?.name || null,
      SessionMode: sess?.mode || null,
    };

    if (t === 'cutter') payload.CutterID = id;
    else payload.MoldID = id;

    // allow explicit overrides
    if (extra?.MoldID) payload.MoldID = safeString(extra.MoldID);
    if (extra?.CutterID) payload.CutterID = safeString(extra.CutterID);

    return payload;
  }

  function buildLocationPayload(itemId, itemType, oldRackLayerId, newRackLayerId, extra) {
    const t = normalizeItemType(itemType);
    const id = safeString(itemId).trim();

    const sess = InventoryState.session;
    const operatorId =
      (extra && extra.operatorId) ||
      sess?.operatorId ||
      InventoryState.config?.lastOperatorId ||
      InventoryState.operator ||
      null;

    const payload = {
      OldRackLayer: safeString(oldRackLayerId).trim(),
      NewRackLayer: safeString(newRackLayerId).trim(),
      notes: (extra && extra.notes) || '棚卸位置変更 / Đổi vị trí khi kiểm kê',
      Employee: operatorId,
      DateEntry: (extra && extra.timestamp) || nowIso(),
      pending: false,

      // session fields
      SessionId: sess?.id || null,
      SessionName: sess?.name || null,
      SessionMode: sess?.mode || null,
    };

    if (t === 'cutter') payload.CutterID = id;
    else payload.MoldID = id;

    return payload;
  }

  // -------------------------------------
  // Local data update helpers
  // -------------------------------------
  function unshiftStatusLog(payload, backendResult) {
    try {
      if (!window.DataManager?.data) return;
      if (!Array.isArray(window.DataManager.data.statuslogs)) window.DataManager.data.statuslogs = [];

      const logId = backendResult?.logId || backendResult?.id || `AUDIT-${Date.now()}`;
      window.DataManager.data.statuslogs.unshift(Object.assign({ LogID: logId }, payload));
    } catch (e) {
      // ignore
    }
  }

  function updateLocalItemAuditDate(itemId, itemType, auditDateIso) {
    dispatchCompat(EVT.auditRecorded, {
      itemId: safeString(itemId),
      itemType: normalizeItemType(itemType),
      date: auditDateIso || todayIsoDate(),
    });
  }

  // -------------------------------------
  // Audit operations
  // -------------------------------------
  async function auditSingle(itemId, itemType, options) {
    const id = safeString(itemId).trim();
    const t = normalizeItemType(itemType);
    if (!id) throw new Error('missing itemId');

    const auditDate = options?.auditDate || todayIsoDate();
    const ts = options?.timestamp || nowIso();

    const payload = buildAuditPayload(id, t, {
      operatorId: options?.operatorId,
      notes: options?.notes,
      auditDate,
      timestamp: ts,
      auditType: options?.auditType,
      withRelocation: !!options?.withRelocation,
      MoldID: options?.MoldID,
      CutterID: options?.CutterID,
    });

    let lastErr = null;
    const maxTry = Number.isFinite(options?.retry) ? options.retry : 3;

    for (let k = 1; k <= maxTry; k++) {
      try {
        const result = await apiChecklog(payload);
        // giữ nguyên các dòng phía dưới (unshiftStatusLog, updateLocalItemAuditDate,...)
        lastErr = null;
        // ✅ trả về thành công như cũ
        unshiftStatusLog(payload, result);
        updateLocalItemAuditDate(id, t, auditDate);
        if (InventoryState.session) { /* giữ nguyên update counts */ }
        return { success: true, result };
      } catch (err) {
        lastErr = err;
        // nếu offline thì không retry vô nghĩa
        if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
        await sleep(500 * k); // backoff 500ms, 1000ms, 1500ms
      }
    }

    // giữ nguyên nhánh enqueueAction, nhưng dùng lastErr
    const e = lastErr || new Error('audit failed');
    enqueueAction({ type: 'audit', payload });
    notify(msg('通信失敗：棚卸をキューに保存しました。', 'Mất mạng: đã lưu hàng đợi kiểm kê.'), 'warning');

  }

  async function auditManySequential(items, options) {
    const list = Array.isArray(items) ? items : [];
    const total = list.length;
    const results = [];

    if (!total) return { successCount: 0, failCount: 0, results };

    const delayOk = Number.isFinite(options?.delayMs) ? options.delayMs : DEFAULTS.sequentialDelayMs;
    const delayFail = Number.isFinite(options?.delayOnFailMs) ? options.delayOnFailMs : DEFAULTS.sequentialDelayOnFailMs;

    dispatchCompat(EVT.bulkAuditProgress, { total, done: 0, success: 0, failed: 0, at: nowIso() });

    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const itemId = safeString(getItemIdFromAny(it)).trim();
      const itemType = normalizeItemType(it.type || it.itemType || it.ItemType || options?.defaultType || 'mold');

      if (!itemId) {
        results.push({ success: false, item: it, reason: 'missing-id' });
        dispatchCompat(EVT.bulkAuditProgress, {
          total,
          done: i + 1,
          success: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
          at: nowIso(),
        });
        await sleep(delayFail);
        continue;
      }

      try {
        const res = await auditSingle(itemId, itemType, options);
        results.push({
          success: !!res.success,
          itemId,
          itemType,
          queued: !!res.queued,
          error: res.error || null,
        });
      } catch (e) {
        results.push({ success: false, itemId, itemType, error: e });
      }

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.length - successCount;

      dispatchCompat(EVT.bulkAuditProgress, { total, done: i + 1, success: successCount, failed: failCount, at: nowIso() });

      const lastOk = results[results.length - 1].success;
      await sleep(lastOk ? delayOk : delayFail);
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    const successItems = results
      .filter((r) => r.success)
      .map((r) => ({ itemId: r.itemId, itemType: r.itemType }));

    dispatchCompat(EVT.bulkAuditCompleted, {
      items: successItems,
      date: options?.auditDate || todayIsoDate(),
      count: successCount,
      failedCount: failCount,
    });

    return { successCount, failCount, results };
  }

  async function auditManyBatch(items, options) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return { successCount: 0, failCount: 0, result: null };

    // ✅ r7.3.4: chunk batch để tránh payload lớn + giảm fail do cold start
    const chunkSize = Number.isFinite(options?.chunkSize) ? options.chunkSize : 20;
    if (list.length > chunkSize) {
      let allResults = [];
      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < list.length; i += chunkSize) {
        const chunk = list.slice(i, i + chunkSize);
        const r = await auditManyBatch(chunk, Object.assign({}, options, { chunkSize })); // recursion base case
        successCount += r?.successCount || 0;
        failCount += r?.failCount || 0;
        if (Array.isArray(r?.result?.results)) allResults = allResults.concat(r.result.results);
      }

      return { successCount, failCount, result: { results: allResults } };
    }

    const auditDate = options?.auditDate || todayIsoDate();
    const ts = options?.timestamp || nowIso();
    const operatorId =
      options?.operatorId || InventoryState.session?.operatorId || InventoryState.config?.lastOperatorId || null;

    const sess = InventoryState.session;

    const payload = {
      operatorId,
      auditDate,
      timestamp: ts,
      notes: options?.notes || '棚卸 / Kiểm kê',
      sessionId: sess?.id || null,
      sessionName: sess?.name || null,
      sessionMode: sess?.mode || null,
      items: list
        .map((it) => ({
          itemId: safeString(getItemIdFromAny(it)).trim(),
          itemType: normalizeItemType(it.type || it.itemType || it.ItemType || options?.defaultType || 'mold'),
        }))
        .filter((x) => x.itemId),
    };

    if (!payload.items.length) return { successCount: 0, failCount: 0, result: null };

    try {
      const result = await apiAuditBatch(payload);
      const okItems = Array.isArray(result?.successItems) ? result.successItems : payload.items;

      if (InventoryState.session) {
        if (!InventoryState.session.counts) InventoryState.session.counts = { audited: 0, relocated: 0, failed: 0 };
        InventoryState.session.counts.audited = (InventoryState.session.counts.audited || 0) + okItems.length;
        const failed = Math.max(0, payload.items.length - okItems.length);
        InventoryState.session.counts.failed = (InventoryState.session.counts.failed || 0) + failed;
      }

      dispatchCompat(EVT.bulkAuditCompleted, {
        items: okItems,
        date: auditDate,
        count: okItems.length,
        failedCount: Math.max(0, payload.items.length - okItems.length),
      });

      notify(msg('一括棚卸が完了しました。', 'Đã hoàn tất kiểm kê hàng loạt.'), 'success');
      return { successCount: okItems.length, failCount: Math.max(0, payload.items.length - okItems.length), result };
    } catch (e) {
      // fallback to sequential
      return auditManySequential(list, options);
    }
  }

  // -------------------------------------
  // Relocate + audit
  // -------------------------------------
  async function relocateAndAudit(itemId, itemType, newRackLayerId, options) {
    const id = safeString(itemId).trim();
    const t = normalizeItemType(itemType);
    const newRL = safeString(newRackLayerId).trim();
    const oldRL = safeString(options?.oldRackLayerId || options?.oldRackLayer || '').trim();

    if (!id) throw new Error('missing itemId');
    if (!newRL) throw new Error('missing newRackLayerId');

    const ts = options?.timestamp || nowIso();

    const locationPayload = buildLocationPayload(id, t, oldRL, newRL, {
      operatorId: options?.operatorId,
      notes: options?.locationNotes,
      timestamp: ts,
    });

    try {
      const locRes = await apiLocationlog(locationPayload);

      // best-effort local update
      try {
        const dm = window.DataManager?.data;
        if (dm) {
          if (t === 'mold' && Array.isArray(dm.molds)) {
            const m = dm.molds.find((x) => safeString(x.MoldID).trim() === id);
            if (m) {
              m.RackLayerID = newRL;
              m.currentRackLayer = newRL;
            }
          }
          if (t === 'cutter' && Array.isArray(dm.cutters)) {
            const c = dm.cutters.find((x) => safeString(x.CutterID).trim() === id);
            if (c) {
              c.RackLayerID = newRL;
              c.currentRackLayer = newRL;
            }
          }
          if (Array.isArray(dm.locationlog)) {
            dm.locationlog.unshift(Object.assign({ LocationLogID: locRes?.logId || `LOC-${Date.now()}` }, locationPayload));
          }
        }
      } catch (e) {
        // ignore
      }

      // audit after relocation (default yes)
      const auditRes = await auditSingle(id, t, Object.assign({}, options || {}, { withRelocation: true }));

      if (InventoryState.session && auditRes.success) {
        if (!InventoryState.session.counts) InventoryState.session.counts = { audited: 0, relocated: 0, failed: 0 };
        InventoryState.session.counts.relocated = (InventoryState.session.counts.relocated || 0) + 1;
      }

      dispatch('inventoryrelocated', { itemId: id, itemType: t, oldRackLayerId: oldRL, newRackLayerId: newRL, at: nowIso() });
      dispatch('inventory:relocated', { itemId: id, itemType: t, oldRackLayerId: oldRL, newRackLayerId: newRL, at: nowIso() });

      return { success: true, location: locRes, audit: auditRes };
    } catch (e) {
      enqueueAction({ type: 'location', payload: locationPayload });
      notify(msg('通信失敗：位置変更をキューに保存しました。', 'Mất mạng: đã lưu hàng đợi đổi vị trí.'), 'warning');

      // still try audit (will queue if offline)
      if (options?.alsoAudit !== false) {
        try {
          await auditSingle(id, t, Object.assign({}, options || {}, { withRelocation: true }));
        } catch (e2) {
          // ignore
        }
      }
      return { success: false, queued: true, error: e };
    }
  }

  // -------------------------------------
  // RackLayer compare helpers
  // -------------------------------------
  function checkRackLayerMismatch(itemRackLayerId, targetRackLayerId) {
    const targetNorm = normalizeRackLayerIdInput(targetRackLayerId);
        if (!targetNorm) return { mismatch: false, suggest: false };

        const itemNorm = normalizeRackLayerIdInput(itemRackLayerId);
        if (!itemNorm) return { mismatch: false, suggest: false };

        const mismatch = itemNorm !== targetNorm;
        return {
            mismatch,
            suggest: mismatch,
            itemRackLayerId: itemNorm,
            targetRackLayerId: targetNorm,
        };
    }

  // -------------------------------------
  // Offline queue flush
  // -------------------------------------
  async function flushQueue() {
    const q = loadQueue();
    if (!q.length) return { flushed: 0, remaining: 0 };

    let flushed = 0;
    for (let i = 0; i < q.length; i++) {
      const action = q[i];
      try {
        if (action.type === 'audit') await apiChecklog(action.payload);
        else if (action.type === 'location') await apiLocationlog(action.payload);
        else if (action.type === 'auditBatch') await apiAuditBatch(action.payload);
        else {
          flushed += 1;
          await sleep(80);
          continue;
        }
        flushed += 1;
        await sleep(120);
      } catch (e) {
        // stop at first failure
        break;
      }
    }

    const rest = q.slice(flushed);
    saveQueue(rest);
    dispatchCompat(EVT.queueChanged, { count: rest.length });

    return { flushed, remaining: rest.length };
  }

  // -------------------------------------
  // Public API
  // -------------------------------------
  const InventoryManager = {
    version: VERSION,
    SESSIONMODE,

    // Init
    init() {
      loadConfig();
      getSelectionAPI();

      try {
        window.addEventListener('online', () => flushQueue());
      } catch (e) {
        // ignore
      }

      updateBadge(!!InventoryState.active);

      // Listen legacy external inventoryModeChanged (boolean)
      document.addEventListener('inventoryModeChanged', (e) => {
        const d = e?.detail;
        const active = typeof d === 'boolean' ? d : !!d?.active;
        if (typeof active === 'boolean') {
          InventoryState.active = active;
          updateBadge(active);
          dispatchCompat(EVT.modeChanged, {
            inventoryOn: InventoryState.active,
            sessionActive: !!InventoryState.session,
            multiSelectEnabled: !!InventoryState.bulkMode,
            currentSession: InventoryState.session,
            source: 'inventoryModeChanged-legacy-listener',
          });
        }
      });

      // Sync selection from BOTH legacy and namespaced events
      document.addEventListener('selectionchanged', () => {
        try {
          syncInventorySelectedItemsFromSelectionState();
        } catch (e) {
          // ignore
        }
        const items = window.SelectionManager?.getSelectedItems ? window.SelectionManager.getSelectedItems() : window.SelectionState?.items;
        const count = Array.isArray(items) ? items.length : 0;
        dispatchCompat(EVT.selectionChanged, { count, items: items || [] });
      });

      document.addEventListener('selection:changed', () => {
        try {
          syncInventorySelectedItemsFromSelectionState();
        } catch (e) {
          // ignore
        }
        const items = window.SelectionManager?.getSelectedItems ? window.SelectionManager.getSelectedItems() : window.SelectionState?.items;
        const count = Array.isArray(items) ? items.length : 0;
        dispatchCompat(EVT.selectionChanged, { count, items: items || [] });
      });

      // IMPORTANT: ToolFloat fallback - if it dispatches auditSingle, do audit here (support BOTH event names)
    const __handleAuditSingleEvent = async (e) => {
    const d = e?.detail || {};
    const itemId = safeString(d.itemId).trim();
    const itemType = normalizeItemType(d.itemType);
    if (!itemId) return;

    // Đóng mọi detail modal đang mở (Mobile/Bootstrap/...)
    forceCloseAnyDetailModal('inventoryauditSingle');

    const operatorId =
        InventoryState.session?.operatorId ||
        InventoryState.config?.lastOperatorId ||
        InventoryState.operator ||
        null;

    if (!operatorId) {
        notify(
        msg('担当者が未設定です。先に棚卸を開始してください。', 'Chưa thiết lập nhân viên. Hãy bật kiểm kê trước.'),
        'error'
        );
        return;
    }

    notify(msg('棚卸を記録中...', 'Đang ghi kiểm kê...'), 'info');
    const res = await auditSingle(itemId, itemType, { operatorId, notes: '棚卸 / Kiểm kê' });

    if (res?.success) {
        notify(msg('棚卸を記録しました。', 'Đã ghi nhận kiểm kê.'), 'success');

        // optional: auto-clear selection for single audit
        if (DEFAULTS.autoClearSelectionOnSingleAudit) {
        try {
            const sel = getSelectionAPI();
            if (sel && isFn(sel.clear)) sel.clear();
        } catch (e2) {}
        }
    }
    };

    // Bắt cả 2 kiểu event (cũ và mới)
    document.addEventListener('inventory:auditSingle', __handleAuditSingleEvent);
    document.addEventListener('inventoryauditSingle', __handleAuditSingleEvent);


      dispatch('inventoryready', { version: VERSION, at: nowIso() });
      dispatch('inventory:ready', { version: VERSION, at: nowIso() });
    },

    // Expose helpers for UI modules (avoid UI-generated seq mismatch)
    getDailySequence(mode, operatorId, date) {
      return getDailySequence(mode, operatorId, date);
    },

    generateSessionId(mode, operatorId) {
      return generateSessionId(mode, operatorId);
    },

    generateSessionName(mode, operatorId, customName) {
      return generateSessionName(mode, operatorId, customName);
    },

    // State / History / Queue
    getState() {
      return {
        inventoryOn: !!InventoryState.active,
        bulkMode: !!InventoryState.bulkMode,
        session: InventoryState.session,
        config: InventoryState.config,
        selectedItems: Array.isArray(InventoryState.selectedItems) ? InventoryState.selectedItems.slice(0) : [],
        queueCount: loadQueue().length,
      };
    },

    getHistory() {
      return loadHistory();
    },

    // Basic inventory ON/OFF
    turnOn(operatorId, operatorName, options) {
      const opId = safeString(operatorId).trim();
      const opName = safeString(operatorName).trim();

      if (opId) InventoryState.config.lastOperatorId = opId;
      if (opName) InventoryState.config.lastOperatorName = opName;

      if (options?.rememberOperator !== false) {
        InventoryState.config.rememberOperator = true;
        saveConfig();
      }

      InventoryState.operator = opId;
      InventoryState.operatorName = opName;

      setInventoryMode(true);
      notify(msg('棚卸モード ON', 'Chế độ kiểm kê ON'), 'success');
      return true;
    },

    turnOff() {
      if (InventoryState.session) endSessionInternal('turnOff');

      try {
        this.setBulkMode(false, { clear: true });
      } catch (e) {
        // ignore
      }

      setInventoryMode(false);
      notify(msg('棚卸モード OFF', 'Chế độ kiểm kê OFF'), 'info');
      return true;
    },

    toggleOff() {
      return this.turnOff();
    },

    openSettings() {
      dispatch('inventorytoggle', { open: true, source: 'InventoryManager' });
      dispatch('inventory:toggle', { open: true, source: 'InventoryManager' });
    },

    // Instant session (quick audit)
    startInstantSession(operatorId, operatorName, options) {
      const opId = safeString(operatorId || InventoryState.config?.lastOperatorId).trim();
      const opName = safeString(operatorName || InventoryState.config?.lastOperatorName).trim();

      if (!opId) {
        notify(msg('担当者を選択してください。', 'Chưa chọn nhân viên.'), 'error');
        return false;
      }

      if (options?.remember !== false) {
        InventoryState.config.rememberOperator = true;
        InventoryState.config.lastOperatorId = opId;
        InventoryState.config.lastOperatorName = opName;
        saveConfig();
      }

      const sessionId = generateSessionId(SESSIONMODE.INSTANT, opId);
      let sessionName = generateSessionName(SESSIONMODE.INSTANT, opId, options?.sessionName);
      sessionName = ensureUniqueSessionName(sessionName);

      InventoryState.session = {
        id: sessionId,
        name: sessionName,
        mode: SESSIONMODE.INSTANT,
        operatorId: opId,
        operatorName: opName,
        note: safeString(options?.note).trim() || '棚卸（即時） / Kiểm kê ngay',
        targetRackLayerId: null,
        compareEnabled: false,
        startedAt: nowIso(),
        endedAt: null,
        counts: { audited: 0, relocated: 0, failed: 0 },
      };

      setInventoryMode(true);
      dispatchCompat(EVT.sessionChanged, { session: InventoryState.session });
      notify(msg('即時棚卸を開始しました。', 'Bắt đầu kiểm kê ngay.'), 'success');
      return true;
    },

    // Session mode A/B
    startSession(config) {
      const cfg = config || {};
      const operatorId = safeString(cfg.operatorId ?? cfg.operator ?? InventoryState.config?.lastOperatorId).trim();
      const operatorName = safeString(cfg.operatorName ?? InventoryState.config?.lastOperatorName).trim();

      if (!operatorId) {
        notify(msg('担当者を選択してください。', 'Chưa chọn nhân viên.'), 'error');
        return false;
      }

      if (cfg.remember !== false) {
        InventoryState.config.rememberOperator = true;
        InventoryState.config.lastOperatorId = operatorId;
        InventoryState.config.lastOperatorName = operatorName;
        saveConfig();
      }

      const mode = safeString(cfg.mode || 'B').toUpperCase() === 'A' ? SESSIONMODE.A : SESSIONMODE.B;
      const sessionId = safeString(cfg.sessionId).trim() || generateSessionId(mode, operatorId);

      let sessionName = safeString(cfg.sessionName || cfg.name).trim();
      sessionName = generateSessionName(mode, operatorId, sessionName);
      sessionName = ensureUniqueSessionName(sessionName);

      InventoryState.session = {
        id: sessionId,
        name: sessionName,
        mode,
        operatorId,
        operatorName,
        note: safeString(cfg.note).trim(),
        targetRackLayerId: safeString(cfg.targetRackLayerId || cfg.filterRack).trim() || null,
        compareEnabled: !!cfg.compareEnabled,
        startedAt: nowIso(),
        endedAt: null,
        counts: { audited: 0, relocated: 0, failed: 0 },
      };

      setInventoryMode(true);
      dispatchCompat(EVT.sessionChanged, { session: InventoryState.session });
      notify(msg('棚卸セッションを開始しました。', 'Bắt đầu phiên kiểm kê.'), 'success');
      return true;
    },

    endSession() {
      endSessionInternal('endSession');
      notify(msg('棚卸セッションを終了しました。', 'Kết thúc phiên kiểm kê.'), 'info');
      return true;
    },

    updateSessionTarget(targetRackLayerId, compareEnabled) {
      if (!InventoryState.session) {
        notify(msg('セッションがありません。', 'Chưa có phiên kiểm kê.'), 'warning');
        return false;
      }
      InventoryState.session.targetRackLayerId = normalizeRackLayerIdInput(targetRackLayerId) || null;

      if (typeof compareEnabled === 'boolean') InventoryState.session.compareEnabled = compareEnabled;

      dispatchCompat(EVT.sessionChanged, { session: InventoryState.session });
      return true;
    },

    // Bulk mode / selection
    setBulkMode(enabled, opts) {
      const options = opts || {};
      setBulkMode(!!enabled);

      if (!enabled && options.clear) {
        try {
          const sel = getSelectionAPI();
          if (sel && isFn(sel.clear)) sel.clear();
        } catch (e) {
          // ignore
        }
      }

      return true;
    },

    // Legacy APIs used by other modules
    getLastAuditDate(itemId, itemType) {
      return getLastAuditDate(itemId, itemType);
    },

    isAuditedToday(itemId, itemType) {
      return isAuditedToday(itemId, itemType);
    },

    async recordAudit(itemId, itemType, dateOrIso) {
      const auditDate = safeString(dateOrIso).includes('-') ? safeString(dateOrIso) : todayIsoDate();
      const operatorId =
        InventoryState.session?.operatorId || InventoryState.config?.lastOperatorId || InventoryState.operator || null;

      const res = await auditSingle(itemId, itemType, { operatorId, auditDate, notes: '棚卸 / Kiểm kê' });

      if (res?.success) notify(msg('棚卸を記録しました。', 'Ghi nhận kiểm kê.'), 'success');
      else if (res?.queued) {
        // already notified in auditSingle
      } else notify(msg('棚卸の記録に失敗しました。', 'Ghi nhận kiểm kê thất bại.'), 'error');

      return res;
    },

    async auditSelected(options) {
      const sel = getSelectionAPI();
      const selected = isFn(sel.getSelectedItems) ? sel.getSelectedItems() : window.SelectionState?.items;
      const count = Array.isArray(selected) ? selected.length : 0;

      if (!count) {
        notify(msg('未選択です。', 'Chưa chọn mục nào.'), 'warning');
        return { successCount: 0, failCount: 0, results: [] };
      }

      const operatorId =
        InventoryState.session?.operatorId || InventoryState.config?.lastOperatorId || InventoryState.operator || null;

      if (!operatorId) {
        notify(msg('担当者が未設定です。', 'Chưa thiết lập nhân viên.'), 'error');
        return { successCount: 0, failCount: count, results: [] };
      }

      const opts = Object.assign(
        {
          operatorId,
          auditDate: todayIsoDate(),
          notes: InventoryState.session?.note ? `棚卸 / ${InventoryState.session.note}` : '棚卸 / Kiểm kê',
          delayMs: DEFAULTS.sequentialDelayMs,
          delayOnFailMs: DEFAULTS.sequentialDelayOnFailMs,
        },
        options || {}
      );

      notify(msg(`一括棚卸を開始：${count}件`, `Bắt đầu kiểm kê hàng loạt: ${count} mục`), 'info');

      const useBatch = !!opts.useBatch;
      const result = useBatch ? await auditManyBatch(selected, opts) : await auditManySequential(selected, opts);

      // Clear selection after audit (default true)
      if (opts.clearSelectionAfter !== false) {
        try {
          if (sel && isFn(sel.clear)) sel.clear();
        } catch (e) {
          // ignore
        }
      }

      return result;
    },

    startAuditSelectedInBackground(options) {
      // chạy nền, trả ngay
      setTimeout(async () => {
        try { await this.auditSelected(options); } catch (e) {}
      }, 0);
      return true;
    },

    async relocateAndAudit(itemId, itemType, newRackLayerId, options) {
      const operatorId =
        InventoryState.session?.operatorId || InventoryState.config?.lastOperatorId || InventoryState.operator || null;

      const opts = Object.assign({ operatorId, alsoAudit: true }, options || {});
      const res = await relocateAndAudit(itemId, itemType, newRackLayerId, opts);

      if (res?.success) notify(msg('位置変更＋棚卸が完了しました。', 'Hoàn tất đổi vị trí + kiểm kê.'), 'success');
      return res;
    },

    checkRackLayerMismatch(itemRackLayerId) {
      const targetRL = InventoryState.session?.targetRackLayerId;
      if (!targetRL || !InventoryState.session?.compareEnabled) return { mismatch: false, suggest: false };
      return checkRackLayerMismatch(itemRackLayerId, targetRL);
    },

    async flushQueue() {
      const before = loadQueue().length;
      const res = await flushQueue();
      const after = loadQueue().length;

      if (before > 0) {
        notify(
          msg(`キュー同期：成功 ${res.flushed}、残り ${after}`, `Đồng bộ hàng đợi: thành công ${res.flushed}, còn lại ${after}`),
          after === 0 ? 'success' : 'warning'
        );
      }
      return res;
    },
  };

  // -------------------------------------
  // Expose global + auto-init
  // -------------------------------------
  window.InventoryManager = InventoryManager;

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        InventoryManager.init();
      },
      { once: true }
    );
  } else {
    InventoryManager.init();
  }
})();

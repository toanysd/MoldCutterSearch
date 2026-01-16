/**
 * inventory-manager-r7.5.0.js
 * Inventory Manager Core (Simplified + Backward Compatible)
 *
 * Goals:
 * - Keep backward compatibility with:
 *   + IDs: btn-inventory-settings, nav-inventory-btn, nav-inventory-icon, nav-inventory-label
 *   + Events: inventorytoggle / inventory:toggle, inventorymodeChanged / inventory:modeChanged,
 *             inventoryModeChanged (MobileDetailModal), inventorysessionChanged / inventory:sessionChanged,
 *             inventoryauditRecorded / inventory:auditRecorded, inventorybulkAuditProgress / inventory:bulkAuditProgress,
 *             inventorybulkAuditCompleted / inventory:bulkAuditCompleted, inventoryhistoryChanged / inventory:historyChanged,
 *             inventorynotification / inventory:notification, selectionchanged / selection:changed
 *   + Public APIs used by other modules: InventoryManager.turnOn/turnOff/startSession/startInstantSession/endSession/
 *     updateSessionTarget/setBulkMode/auditSelected/recordAudit/relocateAndAudit/getLastAuditDate/isAuditedToday/...
 *
 * - Simplify internal logic:
 *   + Audit = write statuslogs (AUDIT)
 *   + Relocate+Audit = write locationlog + update molds.csv (via backend audit-batch) + write statuslogs
 *   + Offline-safe: enqueue on failure, flush when online
 *
 * Date: 2026-01-14
 */

(function () {
  'use strict';

  // ============================================================================
  // Constants
  // ============================================================================
  const VERSION = 'r7.5.0';
  const BACKEND_BASE = 'https://ysd-moldcutter-backend.onrender.com';

  // Endpoints (keep same backend style as existing modules)
  const API = Object.freeze({
    checklog: `${BACKEND_BASE}/api/checklog`,
    locationlog: `${BACKEND_BASE}/api/locationlog`,
    auditBatch: `${BACKEND_BASE}/api/audit-batch`
  });

  const DEFAULTS = Object.freeze({
    requestTimeoutMs: 20000,
    // For sequential fallback
    sequentialDelayMs: 300,
    sequentialDelayOnFailMs: 250,
    // Queue
    queueMax: 300,
    // History
    historyMax: 120,
    // UX
    selectionAutoHighlight: true,
    autoClearSelectionOnSingleAudit: true,
    autoMarkAuditedCards: true
  });

  const SESSIONMODE = Object.freeze({
    A: 'A',         // legacy compatibility
    B: 'B',         // legacy compatibility (list-based)
    INSTANT: 'INSTANT'
  });

  // Storage keys:
  // - Read old versions too (migration-friendly), but write only new keys
  const LSKEYS = Object.freeze({
    config: `inventory.config.${VERSION}`,
    history: `inventory.history.${VERSION}`,
    queue: `inventory.queue.${VERSION}`,
    // old keys that might exist:
    oldConfigKeys: [
      'inventory.config.r7.3.2',
      'inventory.config.r7.3.3',
      'inventory.config.r7.3.4'
    ],
    oldHistoryKeys: [
      'inventory.history.r7.3.2',
      'inventory.history.r7.3.3',
      'inventory.history.r7.3.4'
    ],
    oldQueueKeys: [
      'inventory.queue.r7.3.2',
      'inventory.queue.r7.3.3',
      'inventory.queue.r7.3.4'
    ]
  });

  // ============================================================================
  // Minimal i18n helper (JP priority)
  // ============================================================================
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

  // ============================================================================
  // Utils
  // ============================================================================
  function nowIso() {
    return new Date().toISOString();
  }
  function todayIsoDate() {
    return new Date().toISOString().split('T')[0];
  }
  function safeString(v) {
    if (v === null || v === undefined) return '';
    return String(v);
  }
  function safeJsonParse(str, fallback) {
    try {
      return JSON.parse(str);
    } catch (e) {
      return fallback;
    }
  }
  function isFn(fn) {
    return typeof fn === 'function';
  }
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Normalize item type for cross-module compatibility
  function normalizeItemType(t) {
    const s = safeString(t).trim().toLowerCase();
    if (!s) return 'mold';
    if (s === 'mold' || s === 'khuon' || s === 'khuôn' || s === '金型') return 'mold';
    if (s === 'cutter' || s === 'dao' || s === 'dao cắt' || s === '刃型') return 'cutter';
    return s;
  }

  function toHalfWidthRackStr(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
      .replace(/[－‐‑—–-ー]/g, '-') // unify dashes
      .replace(/[　]/g, ' ');
  }

  // Normalize "1-3" -> "13", "013" -> "13"
  function normalizeRackLayerIdInput(raw) {
    const s0 = toHalfWidthRackStr(raw).trim();
    if (!s0) return '';
    const s = s0.replace(/\s+/g, '');
    const m = s.match(/^(\d+)-(\d+)$/);
    if (m) {
      const a = parseInt(m[1], 10);
      const b = parseInt(m[2], 10);
      if (Number.isFinite(a) && Number.isFinite(b)) return String(a) + String(b);
    }
    if (/^\d+$/.test(s)) return String(parseInt(s, 10));
    const digits = s.replace(/[^0-9]/g, '');
    return digits ? String(parseInt(digits, 10)) : '';
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

  // ============================================================================
  // Event bridge (emit both legacy and colon-namespaced + camel for mobile)
  // ============================================================================
  function dispatch(name, detail) {
    try {
      document.dispatchEvent(new CustomEvent(name, { detail }));
    } catch (e) {
      // ignore
    }
  }

  function dispatchCompat(names, detail) {
    const list = Array.isArray(names) ? names : [names];
    list.forEach((n) => dispatch(n, detail));
  }

  const EVT = Object.freeze({
    // Mode
    modeChanged: ['inventorymodeChanged', 'inventory:modeChanged'],
    // (MobileDetailModal uses this camel event)
    modeChangedCamel: ['inventoryModeChanged'],

    // Session
    sessionChanged: ['inventorysessionChanged', 'inventory:sessionChanged'],

    // Audit
    auditRecorded: ['inventoryauditRecorded', 'inventory:auditRecorded'],
    bulkAuditProgress: ['inventorybulkAuditProgress', 'inventory:bulkAuditProgress'],
    bulkAuditCompleted: ['inventorybulkAuditCompleted', 'inventory:bulkAuditCompleted'],

    // History / Queue
    historyChanged: ['inventoryhistoryChanged', 'inventory:historyChanged'],
    queueChanged: ['inventoryqueueChanged', 'inventory:queueChanged'],

    // Selection sync
    selectionChanged: ['inventoryselectionChanged', 'inventory:selectionChanged'],

    // Notification
    notification: ['inventorynotification', 'inventory:notification']
  });

  // ============================================================================
  // Force close any detail modal (compat with MobileDetailModal)
  // ============================================================================
  function forceCloseAnyDetailModal(reason) {
    try {
      dispatch('inventorydetailModalRequestClose', { reason: reason || 'auditSingle', at: nowIso() });
      dispatch('inventorydetailModalClose', { reason: reason || 'auditSingle', at: nowIso() });
    } catch (e) {}

    // Direct call if MobileDetailModal exists
    try {
      if (window.MobileDetailModal && typeof window.MobileDetailModal.hide === 'function') {
        window.MobileDetailModal.hide();
        return;
      }
    } catch (e) {}

    // Fallback hide common IDs (best-effort)
    try {
      const ids = ['mobile-detail-modal', 'detailModal', 'detail-modal', 'inventory-detail-modal', 'item-detail-modal'];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;

        // Bootstrap Modal
        try {
          if (window.bootstrap && window.bootstrap.Modal) {
            const inst = window.bootstrap.Modal.getInstance(el) || new window.bootstrap.Modal(el);
            inst.hide();
            continue;
          }
        } catch (e) {}

        // Click close
        const btn = el.querySelector('[data-bs-dismiss="modal"], .modal-close, .close, button[aria-label="Close"]');
        if (btn && typeof btn.click === 'function') {
          btn.click();
          continue;
        }

        // Final fallback
        el.classList.remove('show');
        el.style.display = 'none';
      }
    } catch (e) {}
  }

  // ============================================================================
  // InventoryState (global, to match existing system)
  // ============================================================================
  if (!window.InventoryState || typeof window.InventoryState !== 'object' || Array.isArray(window.InventoryState)) {
    window.InventoryState = {};
  }
  const InventoryState = window.InventoryState;

  if (typeof InventoryState.active !== 'boolean') InventoryState.active = false;
  if (typeof InventoryState.bulkMode !== 'boolean') InventoryState.bulkMode = false;
  if (!Array.isArray(InventoryState.selectedItems)) InventoryState.selectedItems = [];
  if (!InventoryState.session) InventoryState.session = null;
  if (!InventoryState.config) InventoryState.config = {};
  if (typeof InventoryState.autoClose !== 'boolean') InventoryState.autoClose = false;

  // ============================================================================
  // Persisted data (config/history/queue) + migration from old versions
  // ============================================================================
  function readFirstExistingKey(keys) {
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (raw && raw.trim()) return { key: k, raw };
    }
    return null;
  }

  function loadConfig() {
    // Prefer new key
    let raw = localStorage.getItem(LSKEYS.config);
    if (!raw) {
      const old = readFirstExistingKey(LSKEYS.oldConfigKeys);
      raw = old?.raw || null;
    }
    const cfg = safeJsonParse(raw, null);
    if (cfg && typeof cfg === 'object') {
      InventoryState.config = Object.assign({}, InventoryState.config, cfg);
    }

    // Normalize defaults
    if (typeof InventoryState.config.rememberOperator !== 'boolean') InventoryState.config.rememberOperator = true;
    if (!InventoryState.config.lastOperatorId) InventoryState.config.lastOperatorId = '';
    if (!InventoryState.config.lastOperatorName) InventoryState.config.lastOperatorName = '';
  }

  function saveConfig() {
    try {
      localStorage.setItem(LSKEYS.config, JSON.stringify(InventoryState.config || {}));
    } catch (e) {}
  }

  function loadHistory() {
    let raw = localStorage.getItem(LSKEYS.history);
    if (!raw) {
      const old = readFirstExistingKey(LSKEYS.oldHistoryKeys);
      raw = old?.raw || null;
    }
    const hist = safeJsonParse(raw, []);
    return Array.isArray(hist) ? hist : [];
  }

  function saveHistory(list) {
    try {
      localStorage.setItem(LSKEYS.history, JSON.stringify(Array.isArray(list) ? list : []));
    } catch (e) {}
  }

  function pushHistory(entry) {
    const hist = loadHistory();
    hist.unshift(entry);
    const trimmed = hist.slice(0, DEFAULTS.historyMax);
    saveHistory(trimmed);
    dispatchCompat(EVT.historyChanged, { history: trimmed });
  }

  function loadQueue() {
    let raw = localStorage.getItem(LSKEYS.queue);
    if (!raw) {
      const old = readFirstExistingKey(LSKEYS.oldQueueKeys);
      raw = old?.raw || null;
    }
    const q = safeJsonParse(raw, []);
    return Array.isArray(q) ? q : [];
  }

  function saveQueue(q) {
    try {
      localStorage.setItem(LSKEYS.queue, JSON.stringify(Array.isArray(q) ? q : []));
    } catch (e) {}
  }

  function enqueueAction(action) {
    const q = loadQueue();
    q.push(Object.assign({ queuedAt: nowIso() }, action));
    const trimmed = q.slice(-DEFAULTS.queueMax);
    saveQueue(trimmed);
    dispatchCompat(EVT.queueChanged, { count: trimmed.length });
  }

  // ============================================================================
  // Network helpers
  // ============================================================================
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
    const res = await withTimeout(fetch(url, options), timeoutMs || DEFAULTS.requestTimeoutMs);
    const text = await res.text();
    const json = safeJsonParse(text, null);
    if (!res.ok) {
      const msgText = json && (json.message || json.error) ? (json.message || json.error) : text;
      const err = new Error(`HTTP ${res.status} ${res.statusText} ${msgText || ''}`.trim());
      err.status = res.status;
      err.body = json || text;
      throw err;
    }
    return json;
  }

  async function apiPostJson(url, payload) {
    return fetchJson(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
      },
      DEFAULTS.requestTimeoutMs
    );
  }

  async function apiChecklog(payload) {
    return apiPostJson(API.checklog, payload);
  }

  async function apiLocationlog(payload) {
    return apiPostJson(API.locationlog, payload);
  }

  async function apiAuditBatch(payload) {
    return apiPostJson(API.auditBatch, payload);
  }

  // ============================================================================
  // Notification
  // ============================================================================
  function notify(messageObj, type) {
    const payload = {
      version: VERSION,
      type: safeString(type || 'info').toLowerCase(),
      message: messageObj || msg('', ''),
      text: formatMsg(messageObj),
      at: nowIso()
    };
    dispatchCompat(EVT.notification, payload);

    // legacy safety alert for errors (helps users not miss)
    if (payload.type === 'error') {
      try {
        alert(payload.text);
      } catch (e) {}
    }
  }

  // ============================================================================
  // SelectionManager adapter + fallback (for compatibility)
  // ============================================================================
  function ensureSelectionGlobals() {
    if (!window.SelectionState || typeof window.SelectionState !== 'object' || Array.isArray(window.SelectionState)) {
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
        item: sel.item || null
      }));
    } catch (e) {}
  }

  function updateDomHighlightsDefault() {
    try {
      if (!DEFAULTS.selectionAutoHighlight) return;

      const items = Array.isArray(window.SelectionState?.items) ? window.SelectionState.items : [];
      const selectedKeys = new Set(items.map((s) => `${normalizeItemType(s.type)}|${safeString(s.id)}`));

      // Cards
      document.querySelectorAll('.result-card[data-id][data-type]').forEach((card) => {
        const id = safeString(card.getAttribute('data-id')).trim();
        const type = normalizeItemType(card.getAttribute('data-type'));
        const key = `${type}|${id}`;
        if (selectedKeys.has(key)) {
          card.classList.add('inv-selected', 'inv-bulk-selected');
          const checkbox = card.querySelector('.inv-bulk-checkbox');
          if (checkbox) checkbox.classList.add('checked');
        } else {
          card.classList.remove('inv-selected', 'inv-bulk-selected');
          const checkbox = card.querySelector('.inv-bulk-checkbox');
          if (checkbox) checkbox.classList.remove('checked');
        }
      });

      // Table rows (if any)
      document.querySelectorAll('tr[data-id][data-type]').forEach((row) => {
        const id = safeString(row.getAttribute('data-id')).trim();
        const type = normalizeItemType(row.getAttribute('data-type'));
        const key = `${type}|${id}`;
        const cb = row.querySelector('input.row-checkbox[type="checkbox"]');
        if (selectedKeys.has(key)) {
          row.classList.add('selected');
          if (cb) cb.checked = true;
        } else {
          row.classList.remove('selected');
          if (cb) cb.checked = false;
        }
      });
    } catch (e) {}
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

        // selection mode events
        dispatchCompat(['selectionmodeChanged', 'selection:modeChanged'], {
          enabled: window.SelectionState.active,
          source: 'inventory-manager-built-in'
        });

        // selection changed events
        dispatchCompat(['selectionchanged', 'selection:changed'], {
          action: 'mode',
          total: window.SelectionState.items.length,
          items: window.SelectionState.items
        });

        return window.SelectionState.active;
      },

      isSelected(id, type) {
        ensureSelectionGlobals();
        const sid = safeString(id).trim();
        const stype = normalizeItemType(type);
        return window.SelectionState.items.some(
          (s) => safeString(s.id).trim() === sid && normalizeItemType(s.type) === stype
        );
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
            items: window.SelectionState.items
          });
        }
      },

      removeItem(id, type) {
        ensureSelectionGlobals();
        const sid = safeString(id).trim();
        const stype = normalizeItemType(type);
        const before = window.SelectionState.items.length;

        window.SelectionState.items = window.SelectionState.items.filter(
          (s) => !(safeString(s.id).trim() === sid && normalizeItemType(s.type) === stype)
        );

        if (window.SelectionState.items.length !== before) {
          syncInventorySelectedItemsFromSelectionState();
          updateDomHighlightsDefault();

          dispatchCompat(['selectionchanged', 'selection:changed'], {
            action: 'remove',
            id: sid,
            type: stype,
            total: window.SelectionState.items.length,
            items: window.SelectionState.items
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
          items: []
        });
      },

      updateDomHighlights() {
        updateDomHighlightsDefault();
      }
    };

    return SelectionManager;
  }

  function getSelectionAPI() {
    ensureSelectionGlobals();

    const ext = window.SelectionManager;
    const ok =
      ext &&
      isFn(ext.setMode) &&
      isFn(ext.toggleItem) &&
      isFn(ext.clear) &&
      isFn(ext.getSelectedItems);

    if (ok) {
      try {
        syncInventorySelectedItemsFromSelectionState();
      } catch (e) {}
      return ext;
    }

    const builtIn = makeBuiltInSelectionManager();
    window.SelectionManager = builtIn;
    return builtIn;
  }

  // ============================================================================
  // Badge (keep same behavior as InventoryUI badge, for safety)
  // ============================================================================
  function updateDesktopBadge(active) {
    const actionBtn = document.getElementById('btn-inventory-settings');
    if (!actionBtn) return;

    actionBtn.querySelectorAll('.inventory-badge').forEach((b) => b.remove());

    if (active) {
      const badge = document.createElement('span');
      badge.className = 'inventory-badge';
      badge.textContent = 'ON';
      badge.style.cssText =
        'position:absolute!important;top:4px!important;right:4px!important;background:#00c853!important;color:white!important;' +
        'font-size:9px!important;font-weight:700!important;padding:2px 6px!important;border-radius:4px!important;line-height:1!important;' +
        'box-shadow:0 1px 3px rgba(0,0,0,0.3)!important;z-index:10!important;pointer-events:none!important;';
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
        'position:absolute;top:4px;right:4px;background:#00c853;color:white;font-size:9px;font-weight:700;' +
        'padding:2px 5px;border-radius:3px;z-index:10;';
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

  // ============================================================================
  // Session naming helpers (keep compatible with InventoryUI)
  // ============================================================================
  function getDailySequence(mode, operatorId, date) {
    const hist = loadHistory();
    const today = date || todayIsoDate();
    const op = safeString(operatorId).trim();
    const m = safeString(mode).trim();
    const count = hist.filter((h) => {
      const startedAt = safeString(h?.startedAt);
      if (!startedAt) return false;
      const sessionDate = startedAt.split('T')[0];
      return sessionDate === today && safeString(h?.mode) === m && safeString(h?.operatorId).trim() === op;
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
    const modePrefix = mode === SESSIONMODE.INSTANT ? 'INS' : safeString(mode || 'B').toUpperCase();
    return `INV-${modePrefix}-${y}${mo}${da}-${hh}${mm}${ss}-${op}`;
  }

  function generateSessionName(mode, operatorId, customName) {
    const custom = safeString(customName).trim();
    if (custom) return custom;

    const today = todayIsoDate();
    const dateStr = today.replace(/-/g, '');
    const op = safeString(operatorId || 'OP').trim().toUpperCase();
    const seq = getDailySequence(mode, operatorId, today);

    if (mode === SESSIONMODE.INSTANT) return `${dateStr}-${op}-AUDIT`;
    const m = safeString(mode || SESSIONMODE.B).toUpperCase() === 'A' ? 'A' : 'B';
    return `${m}-${dateStr}-${op}-${seq}`;
  }

  function ensureUniqueSessionName(name) {
    const n = safeString(name).trim();
    if (!n) return n;

    const hist = loadHistory();
    const exists = (x) => hist.some((h) => safeString(h?.name).trim() === x);

    if (!exists(n)) return n;

    let i = 2;
    while (exists(`${n}-${i}`)) i += 1;
    return `${n}-${i}`;
  }

  // ============================================================================
  // Mode / Session State
  // ============================================================================
  function setInventoryMode(active) {
    InventoryState.active = !!active;

    // 1) MobileDetailModal listens this camel event (boolean detail)
    dispatchCompat(EVT.modeChangedCamel, { active: InventoryState.active });

    // 2) Compat inventory mode events (object payload)
    dispatchCompat(EVT.modeChanged, {
      inventoryOn: InventoryState.active,
      sessionActive: !!InventoryState.session,
      multiSelectEnabled: !!InventoryState.bulkMode,
      currentSession: InventoryState.session
    });

    // 3) Some legacy listeners use boolean detail (rare)
    // (keep it, harmless)
    dispatch('inventoryModeChanged', InventoryState.active);

    updateBadge(InventoryState.active);

    if (DEFAULTS.autoMarkAuditedCards) {
      tryMarkAuditedCards();
    }
  }

  function setBulkMode(enabled) {
    const sel = getSelectionAPI();
    InventoryState.bulkMode = !!enabled;

    try {
      ensureSelectionGlobals();
      window.SelectionState.active = InventoryState.bulkMode;
    } catch (e) {}

    try {
      if (sel && isFn(sel.setMode)) sel.setMode(InventoryState.bulkMode);
    } catch (e) {}

    // compat event (if any module listens)
    dispatchCompat(['inventorybulkMode', 'inventory:bulkMode'], { enabled: InventoryState.bulkMode });

    // selection changed snapshot
    try {
      syncInventorySelectedItemsFromSelectionState();
      const items = isFn(sel.getSelectedItems) ? sel.getSelectedItems() : (window.SelectionState?.items || []);
      dispatchCompat(EVT.selectionChanged, { count: Array.isArray(items) ? items.length : 0, items });
    } catch (e) {}

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
      counts: Object.assign({ audited: 0, relocated: 0, failed: 0 }, sess.counts || {})
    });

    InventoryState.session = null;
    dispatchCompat(EVT.sessionChanged, { session: null });

    return sess;
  }

  // ============================================================================
  // Local data helpers (statuslogs + audited mark)
  // ============================================================================
  function findStatusLogsArray() {
    const logs = window.DataManager?.data?.statuslogs;
    return Array.isArray(logs) ? logs : [];
  }

  function getLogTimeIso(log) {
    const t = log?.Timestamp || log?.CheckTimestamp || log?.UpdatedAt || log?.CreatedAt || null;
    if (!t) return null;
    try {
      const d = new Date(t);
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString();
    } catch (e) {
      return null;
    }
  }

  function getAuditDateFromLog(log) {
    // Prefer explicit AuditDate (server supports)
    const ad = safeString(log?.AuditDate).trim();
    if (ad && ad.includes('-')) return ad;

    // Fallback from Timestamp
    const iso = getLogTimeIso(log);
    if (!iso) return null;
    return iso.split('T')[0];
  }

  function matchesLogToItem(log, itemId, itemType) {
    const id = safeString(itemId).trim();
    if (!id) return false;

    const t = normalizeItemType(itemType);
    const logType = normalizeItemType(log?.ItemType || log?.itemType || '');

    // If logType exists, enforce it
    if (logType && logType !== t && logType !== 'mold' && logType !== 'cutter') {
      // unknown type: ignore
    }

    const moldId = safeString(log?.MoldID).trim();
    const cutterId = safeString(log?.CutterID).trim();

    return moldId === id || cutterId === id;
  }

  function getLastAuditDate(itemId, itemType) {
    const logs = findStatusLogsArray();

    const filtered = logs.filter((l) => matchesLogToItem(l, itemId, itemType));
    if (!filtered.length) return null;

    filtered.sort((a, b) => {
      const ta = new Date(getLogTimeIso(a) || 0).getTime();
      const tb = new Date(getLogTimeIso(b) || 0).getTime();
      return tb - ta;
    });

    const latest = filtered[0];
    return getLogTimeIso(latest) || null;
  }

  function isAuditedToday(itemId, itemType) {
    const logs = findStatusLogsArray();
    const today = todayIsoDate();

    const filtered = logs.filter((l) => matchesLogToItem(l, itemId, itemType));
    if (!filtered.length) return false;

    // Some systems might contain IN/OUT logs too; treat "AUDIT" explicitly when possible
    for (const l of filtered) {
      const status = safeString(l?.Status).toLowerCase();
      const ad = getAuditDateFromLog(l);
      if (ad === today && (status.includes('audit') || l?.AuditDate)) return true;
    }

    // fallback: any latest log time equals today
    const last = getLastAuditDate(itemId, itemType);
    if (!last) return false;
    try {
      return new Date(last).toISOString().split('T')[0] === today;
    } catch (e) {
      return false;
    }
  }

  // Mark audited cards (CSS class: audited-today) - requires CSS file loaded separately
  function tryMarkAuditedCards() {
    try {
      const today = todayIsoDate();
      const logs = findStatusLogsArray();

      if (!logs.length) return;

      // Build set of item keys audited today
      const auditedSet = new Set();
      for (const l of logs) {
        const ad = getAuditDateFromLog(l);
        if (ad !== today) continue;

        const status = safeString(l?.Status).toLowerCase();
        // accept "audit" or has AuditDate
        if (!status.includes('audit') && !l?.AuditDate) continue;

        const moldId = safeString(l?.MoldID).trim();
        const cutterId = safeString(l?.CutterID).trim();
        if (moldId) auditedSet.add(`mold|${moldId}`);
        if (cutterId) auditedSet.add(`cutter|${cutterId}`);
      }

      // Apply to cards
      document.querySelectorAll('.result-card[data-id][data-type]').forEach((card) => {
        const id = safeString(card.getAttribute('data-id')).trim();
        const type = normalizeItemType(card.getAttribute('data-type'));
        const key = `${type}|${id}`;
        if (auditedSet.has(key)) card.classList.add('audited-today');
        else card.classList.remove('audited-today');
      });
    } catch (e) {}
  }

  // ============================================================================
  // Payload builders
  // ============================================================================
  function buildAuditPayload(itemId, itemType, extra) {
    const t = normalizeItemType(itemType);
    const id = safeString(itemId).trim();
    const sess = InventoryState.session;

    const operatorId =
      safeString(extra?.operatorId || '') ||
      safeString(sess?.operatorId || '') ||
      safeString(InventoryState.config?.lastOperatorId || '') ||
      safeString(InventoryState.operator || '');

    const payload = {
      Status: 'AUDIT',
      ItemType: t,
      EmployeeID: operatorId,
      DestinationID: 'AREA-MOLDROOM',
      Notes: safeString(extra?.notes || '棚卸 / Kiểm kê'),
      Timestamp: safeString(extra?.timestamp || nowIso()),
      AuditDate: safeString(extra?.auditDate || todayIsoDate()),
      AuditType: safeString(extra?.auditType || (extra?.withRelocation ? 'AUDIT-WITH-RELOCATION' : 'AUDIT_ONLY')),
      pending: false,

      // Session metadata (safe extra fields; server will store in Notes if not supported)
      SessionId: safeString(sess?.id || ''),
      SessionName: safeString(sess?.name || ''),
      SessionMode: safeString(sess?.mode || '')
    };

    if (t === 'cutter') payload.CutterID = id;
    else payload.MoldID = id;

    // Allow explicit override if caller passes both
    if (extra?.MoldID) payload.MoldID = safeString(extra.MoldID).trim();
    if (extra?.CutterID) payload.CutterID = safeString(extra.CutterID).trim();

    return payload;
  }

  function buildLocationPayload(itemId, itemType, oldRackLayerId, newRackLayerId, extra) {
    const t = normalizeItemType(itemType);
    const id = safeString(itemId).trim();
    const sess = InventoryState.session;

    const operatorId =
      safeString(extra?.operatorId || '') ||
      safeString(sess?.operatorId || '') ||
      safeString(InventoryState.config?.lastOperatorId || '') ||
      safeString(InventoryState.operator || '');

    const payload = {
      OldRackLayer: safeString(oldRackLayerId || '').trim(),
      NewRackLayer: safeString(newRackLayerId || '').trim(),
      notes: safeString(extra?.notes || '棚卸時移動 / Di chuyển khi kiểm kê'),
      EmployeeID: operatorId,
      DateEntry: safeString(extra?.timestamp || nowIso()),
      pending: false,

      SessionId: safeString(sess?.id || ''),
      SessionName: safeString(sess?.name || ''),
      SessionMode: safeString(sess?.mode || '')
    };

    if (t === 'cutter') payload.CutterID = id;
    else payload.MoldID = id;

    return payload;
  }

  // ============================================================================
  // Core ops: audit / bulk audit / relocate+audit
  // ============================================================================
  async function auditSingle(itemId, itemType, options) {
    const id = safeString(itemId).trim();
    const t = normalizeItemType(itemType);

    if (!id) throw new Error('missing itemId');

    const operatorId =
      safeString(options?.operatorId || '') ||
      safeString(InventoryState.session?.operatorId || '') ||
      safeString(InventoryState.config?.lastOperatorId || '') ||
      safeString(InventoryState.operator || '');

    if (!operatorId) {
      notify(msg('担当者が未設定です。', 'Chưa thiết lập nhân viên.'), 'error');
      return { success: false, error: 'missing operatorId' };
    }

    const auditDate = safeString(options?.auditDate || todayIsoDate());
    const ts = safeString(options?.timestamp || nowIso());

    const payload = buildAuditPayload(id, t, {
      operatorId,
      auditDate,
      timestamp: ts,
      notes: options?.notes,
      auditType: options?.auditType,
      withRelocation: !!options?.withRelocation,
      MoldID: options?.MoldID,
      CutterID: options?.CutterID
    });

    // optimistic retry (client side) for transient errors
    const maxTry = Number.isFinite(options?.retry) ? options.retry : 3;
    let lastErr = null;

    for (let k = 1; k <= maxTry; k += 1) {
      try {
        const result = await apiChecklog(payload);

        // Update local DataManager cache (best effort)
        try {
          if (window.DataManager?.data) {
            if (!Array.isArray(window.DataManager.data.statuslogs)) window.DataManager.data.statuslogs = [];
            window.DataManager.data.statuslogs.unshift(Object.assign({}, payload, { StatusLogID: result?.logId || `AUDIT_${Date.now()}` }));
          }
        } catch (e) {}

        // Emit audit recorded
        dispatchCompat(EVT.auditRecorded, {
          itemId: id,
          itemType: t,
          date: auditDate,
          at: nowIso()
        });

        // Mark audited cards if enabled
        if (DEFAULTS.autoMarkAuditedCards) {
          tryMarkAuditedCards();
        }

        // Update session counters
        if (InventoryState.session) {
          InventoryState.session.counts = InventoryState.session.counts || { audited: 0, relocated: 0, failed: 0 };
          InventoryState.session.counts.audited = (InventoryState.session.counts.audited || 0) + 1;
        }

        return { success: true, result };
      } catch (err) {
        lastErr = err;

        // if offline: stop retry
        if (typeof navigator !== 'undefined' && navigator.onLine === false) break;

        // backoff a bit
        await sleep(400 * k);
      }
    }

    // Queue when failed
    enqueueAction({ type: 'audit', payload });
    notify(msg('通信エラー：棚卸をキューに保存しました。', 'Lỗi mạng: đã lưu kiểm kê vào hàng đợi.'), 'warning');
    return { success: false, queued: true, error: safeString(lastErr?.message || lastErr) };
  }

  async function auditManySequential(items, options) {
    const list = Array.isArray(items) ? items : [];
    const total = list.length;
    if (!total) return { successCount: 0, failCount: 0, results: [] };

    const delayOk = Number.isFinite(options?.delayMs) ? options.delayMs : DEFAULTS.sequentialDelayMs;
    const delayFail = Number.isFinite(options?.delayOnFailMs) ? options.delayOnFailMs : DEFAULTS.sequentialDelayOnFailMs;

    let success = 0;
    let failed = 0;
    const results = [];

    dispatchCompat(EVT.bulkAuditProgress, { total, done: 0, success: 0, failed: 0, at: nowIso() });

    for (let i = 0; i < list.length; i += 1) {
      const it = list[i];
      const itemId = safeString(getItemIdFromAny(it)).trim();
      const itemType = normalizeItemType(it?.type || it?.itemType || it?.ItemType || (options?.defaultType || 'mold'));

      if (!itemId) {
        failed += 1;
        results.push({ success: false, item: it, reason: 'missing-id' });
        dispatchCompat(EVT.bulkAuditProgress, { total, done: i + 1, success, failed, at: nowIso() });
        await sleep(delayFail);
        continue;
      }

      try {
        const r = await auditSingle(itemId, itemType, options);
        if (r?.success) success += 1;
        else failed += 1;
        results.push(Object.assign({ itemId, itemType }, r));
      } catch (e) {
        failed += 1;
        results.push({ success: false, itemId, itemType, error: safeString(e?.message || e) });
      }

      dispatchCompat(EVT.bulkAuditProgress, { total, done: i + 1, success, failed, at: nowIso() });
      await sleep(results[results.length - 1]?.success ? delayOk : delayFail);
    }

    dispatchCompat(EVT.bulkAuditCompleted, {
      date: safeString(options?.auditDate || todayIsoDate()),
      count: success,
      failedCount: failed,
      at: nowIso()
    });

    if (DEFAULTS.autoMarkAuditedCards) {
      tryMarkAuditedCards();
    }

    return { successCount: success, failCount: failed, results };
  }

  async function auditManyBatch(items, options) {
    // Uses backend /api/audit-batch (already exists in server)
    const list = Array.isArray(items) ? items : [];
    if (!list.length) return { successCount: 0, failCount: 0, result: null };

    const auditDate = safeString(options?.auditDate || todayIsoDate());
    const ts = safeString(options?.timestamp || nowIso());

    const operatorId =
      safeString(options?.operatorId || '') ||
      safeString(InventoryState.session?.operatorId || '') ||
      safeString(InventoryState.config?.lastOperatorId || '') ||
      safeString(InventoryState.operator || '');

    if (!operatorId) {
      notify(msg('担当者が未設定です。', 'Chưa thiết lập nhân viên.'), 'error');
      return { successCount: 0, failCount: list.length, result: null };
    }

    const sess = InventoryState.session;

    const auditLogs = list
      .map((it) => {
        const itemId = safeString(getItemIdFromAny(it)).trim();
        const itemType = normalizeItemType(it?.type || it?.itemType || it?.ItemType || (options?.defaultType || 'mold'));
        if (!itemId) return null;
        return buildAuditPayload(itemId, itemType, {
          operatorId,
          auditDate,
          timestamp: ts,
          notes: options?.notes,
          auditType: options?.auditType,
          withRelocation: false
        });
      })
      .filter(Boolean);

    if (!auditLogs.length) return { successCount: 0, failCount: 0, result: null };

    const payload = {
      operatorId,
      auditDate,
      timestamp: ts,
      notes: safeString(options?.notes || '棚卸 / Kiểm kê'),
      sessionId: safeString(sess?.id || ''),
      sessionName: safeString(sess?.name || ''),
      sessionMode: safeString(sess?.mode || ''),
      statusLogs: auditLogs,
      locationLogs: []
    };

    try {
      const result = await apiAuditBatch(payload);

      // If server returns saved counts -> use it; else fallback estimate
      const okCount = Number.isFinite(result?.saved?.statusLogs) ? result.saved.statusLogs : auditLogs.length;
      const failCount = Math.max(0, auditLogs.length - okCount);

      // Update local statuslogs cache (best effort)
      try {
        if (window.DataManager?.data) {
          if (!Array.isArray(window.DataManager.data.statuslogs)) window.DataManager.data.statuslogs = [];
          // prepend all as pending-synced best effort
          for (let i = auditLogs.length - 1; i >= 0; i -= 1) {
            window.DataManager.data.statuslogs.unshift(Object.assign({}, auditLogs[i], { StatusLogID: `AUDIT_${Date.now()}_${i}` }));
          }
        }
      } catch (e) {}

      // Update session counter
      if (InventoryState.session) {
        InventoryState.session.counts = InventoryState.session.counts || { audited: 0, relocated: 0, failed: 0 };
        InventoryState.session.counts.audited = (InventoryState.session.counts.audited || 0) + okCount;
        InventoryState.session.counts.failed = (InventoryState.session.counts.failed || 0) + failCount;
      }

      dispatchCompat(EVT.bulkAuditCompleted, {
        date: auditDate,
        count: okCount,
        failedCount: failCount,
        at: nowIso()
      });

      if (DEFAULTS.autoMarkAuditedCards) {
        tryMarkAuditedCards();
      }

      notify(msg('一括棚卸が完了しました。', 'Đã hoàn tất kiểm kê hàng loạt.'), failCount ? 'warning' : 'success');

      return { successCount: okCount, failCount, result };
    } catch (e) {
      // fallback to sequential
      return auditManySequential(list, options);
    }
  }

  async function relocateAndAuditCore(itemId, itemType, newRackLayerId, options) {
    const id = safeString(itemId).trim();
    const t = normalizeItemType(itemType);
    const newRL = normalizeRackLayerIdInput(newRackLayerId);

    if (!id) throw new Error('missing itemId');
    if (!newRL) throw new Error('missing newRackLayerId');

    const operatorId =
      safeString(options?.operatorId || '') ||
      safeString(InventoryState.session?.operatorId || '') ||
      safeString(InventoryState.config?.lastOperatorId || '') ||
      safeString(InventoryState.operator || '');

    if (!operatorId) {
      notify(msg('担当者が未設定です。', 'Chưa thiết lập nhân viên.'), 'error');
      return { success: false, error: 'missing operatorId' };
    }

    const ts = safeString(options?.timestamp || nowIso());
    const oldRL = normalizeRackLayerIdInput(options?.oldRackLayerId || options?.oldRackLayer || '');

    // Prefer audit-batch endpoint because it can update molds.csv on server side (already implemented)
    const locationPayload = buildLocationPayload(id, t, oldRL, newRL, {
      operatorId,
      timestamp: ts,
      notes: options?.locationNotes || '棚卸時移動 / Di chuyển khi kiểm kê'
    });

    const auditPayload = buildAuditPayload(id, t, {
      operatorId,
      auditDate: safeString(options?.auditDate || todayIsoDate()),
      timestamp: ts,
      notes: options?.notes || '棚卸（位置変更） / Kiểm kê (đổi vị trí)',
      auditType: 'AUDIT-WITH-RELOCATION',
      withRelocation: true
    });

    const payload = {
      operatorId,
      auditDate: safeString(options?.auditDate || todayIsoDate()),
      timestamp: ts,
      notes: safeString(options?.notes || '棚卸（位置変更） / Kiểm kê (đổi vị trí)'),
      statusLogs: [auditPayload],
      locationLogs: [locationPayload]
    };

    try {
      const result = await apiAuditBatch(payload);

      // Update local caches (best effort)
      try {
        const dm = window.DataManager?.data;
        if (dm) {
          // locationlog
          if (!Array.isArray(dm.locationlog)) dm.locationlog = [];
          dm.locationlog.unshift(Object.assign({}, locationPayload, { LocationLogID: `LOC_${Date.now()}` }));

          // statuslogs
          if (!Array.isArray(dm.statuslogs)) dm.statuslogs = [];
          dm.statuslogs.unshift(Object.assign({}, auditPayload, { StatusLogID: `AUDIT_${Date.now()}` }));

          // update molds/cutters racklayer local (best effort)
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
        }
      } catch (e) {}

      // Update session counters
      if (InventoryState.session) {
        InventoryState.session.counts = InventoryState.session.counts || { audited: 0, relocated: 0, failed: 0 };
        InventoryState.session.counts.relocated = (InventoryState.session.counts.relocated || 0) + 1;
        InventoryState.session.counts.audited = (InventoryState.session.counts.audited || 0) + 1;
      }

      dispatchCompat(EVT.auditRecorded, { itemId: id, itemType: t, date: todayIsoDate(), at: nowIso() });

      if (DEFAULTS.autoMarkAuditedCards) {
        tryMarkAuditedCards();
      }

      return { success: true, result };
    } catch (e) {
      // queue both operations (best-effort)
      enqueueAction({ type: 'auditBatch', payload });
      notify(msg('通信エラー：移動＋棚卸をキューに保存しました。', 'Lỗi mạng: đã lưu đổi vị trí + kiểm kê vào hàng đợi.'), 'warning');
      return { success: false, queued: true, error: safeString(e?.message || e) };
    }
  }

  // ============================================================================
  // Offline queue flush
  // ============================================================================
  async function flushQueueInternal() {
    const q = loadQueue();
    if (!q.length) return { flushed: 0, remaining: 0 };

    let flushed = 0;

    for (let i = 0; i < q.length; i += 1) {
      const action = q[i];
      try {
        if (action.type === 'audit') {
          await apiChecklog(action.payload);
        } else if (action.type === 'location') {
          await apiLocationlog(action.payload);
        } else if (action.type === 'auditBatch') {
          await apiAuditBatch(action.payload);
        } else {
          // unknown, skip as flushed to avoid stuck
        }

        flushed += 1;
        await sleep(120);
      } catch (e) {
        // stop at first failure to keep ordering & reduce rate-limit issues
        break;
      }
    }

    const rest = q.slice(flushed);
    saveQueue(rest);
    dispatchCompat(EVT.queueChanged, { count: rest.length });

    return { flushed, remaining: rest.length };
  }

  // ============================================================================
  // Public API (global)
  // ============================================================================
  const InventoryManager = {
    version: VERSION,
    SESSIONMODE,

    init() {
      loadConfig();
      getSelectionAPI();

      // Flush queue when online
      try {
        window.addEventListener('online', () => {
          this.flushQueue();
        });
      } catch (e) {}

      // Sync selection changes from both legacy & namespaced events
      document.addEventListener('selectionchanged', () => {
        try {
          syncInventorySelectedItemsFromSelectionState();
          updateDomHighlightsDefault();
          const sel = getSelectionAPI();
          const items = isFn(sel.getSelectedItems) ? sel.getSelectedItems() : (window.SelectionState?.items || []);
          dispatchCompat(EVT.selectionChanged, { count: Array.isArray(items) ? items.length : 0, items });
        } catch (e) {}
      });

      document.addEventListener('selection:changed', () => {
        try {
          syncInventorySelectedItemsFromSelectionState();
          updateDomHighlightsDefault();
          const sel = getSelectionAPI();
          const items = isFn(sel.getSelectedItems) ? sel.getSelectedItems() : (window.SelectionState?.items || []);
          dispatchCompat(EVT.selectionChanged, { count: Array.isArray(items) ? items.length : 0, items });
        } catch (e) {}
      });

      // ToolFloat / MobileDetailModal may dispatch inventoryauditSingle -> handle here
      const handleAuditSingleEvent = async (e) => {
        try {
          const d = e?.detail || {};
          const itemId = safeString(d.itemId).trim();
          const itemType = normalizeItemType(d.itemType);
          if (!itemId) return;

          // close detail modal immediately for better UX
          forceCloseAnyDetailModal('inventoryauditSingle');

          const operatorId =
            safeString(InventoryState.session?.operatorId || '') ||
            safeString(InventoryState.config?.lastOperatorId || '') ||
            safeString(InventoryState.operator || '');

          if (!operatorId) {
            notify(msg('担当者を選択してください。', 'Hãy chọn nhân viên trước.'), 'error');
            return;
          }

          notify(msg('棚卸を記録中…', 'Đang ghi kiểm kê…'), 'info');

          const res = await auditSingle(itemId, itemType, {
            operatorId,
            auditDate: todayIsoDate(),
            notes: safeString(d.notes || '棚卸 / Kiểm kê')
          });

          if (res?.success) {
            notify(msg('棚卸を記録しました。', 'Đã ghi nhận kiểm kê.'), 'success');

            if (DEFAULTS.autoClearSelectionOnSingleAudit) {
              try {
                const sel = getSelectionAPI();
                if (sel && isFn(sel.clear)) sel.clear();
              } catch (e2) {}
            }
          }
        } catch (err) {
          notify(msg('棚卸の記録に失敗しました。', 'Ghi kiểm kê thất bại.'), 'error');
        }
      };

      // Support both event names
      document.addEventListener('inventoryauditSingle', handleAuditSingleEvent);
      document.addEventListener('inventory:auditSingle', handleAuditSingleEvent);

      // Auto mark audited cards after search updated / UI render
      document.addEventListener('search:updated', () => {
        if (DEFAULTS.autoMarkAuditedCards) {
          setTimeout(() => tryMarkAuditedCards(), 50);
        }
      });

      updateBadge(!!InventoryState.active);

      dispatchCompat(['inventoryready', 'inventory:ready'], { version: VERSION, at: nowIso() });
    },

    // Helpers exposed for InventoryUI
    getDailySequence(mode, operatorId, date) {
      return getDailySequence(mode, operatorId, date);
    },
    generateSessionId(mode, operatorId) {
      return generateSessionId(mode, operatorId);
    },
    generateSessionName(mode, operatorId, customName) {
      return generateSessionName(mode, operatorId, customName);
    },

    // State
    getState() {
      return {
        inventoryOn: !!InventoryState.active,
        bulkMode: !!InventoryState.bulkMode,
        session: InventoryState.session,
        config: InventoryState.config,
        selectedItems: Array.isArray(InventoryState.selectedItems) ? InventoryState.selectedItems.slice(0) : [],
        queueCount: loadQueue().length
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
      } catch (e) {}

      setInventoryMode(false);
      notify(msg('棚卸モード OFF', 'Chế độ kiểm kê OFF'), 'info');
      return true;
    },

    toggleOff() {
      return this.turnOff();
    },

    updateBadge(active) {
      updateBadge(!!active);
    },

    // Open settings UI (InventoryUI listens these events)
    openSettings() {
      dispatch('inventorytoggle', { open: true, source: 'InventoryManager' });
      dispatch('inventory:toggle', { open: true, source: 'InventoryManager' });
    },

    // Sessions
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
        counts: { audited: 0, relocated: 0, failed: 0 }
      };

      setInventoryMode(true);
      dispatchCompat(EVT.sessionChanged, { session: InventoryState.session });

      notify(msg('即時棚卸を開始しました。', 'Bắt đầu kiểm kê ngay.'), 'success');
      return true;
    },

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
        counts: { audited: 0, relocated: 0, failed: 0 }
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
        } catch (e) {}
      }
      return true;
    },

    // Audit helpers (used by ToolFloat/MobileDetailModal)
    getLastAuditDate(itemId, itemType) {
      return getLastAuditDate(itemId, itemType);
    },

    isAuditedToday(itemId, itemType) {
      return isAuditedToday(itemId, itemType);
    },

    async recordAudit(itemId, itemType, dateOrIso) {
      const auditDate = safeString(dateOrIso).includes('-') ? safeString(dateOrIso) : todayIsoDate();
      const operatorId =
        safeString(InventoryState.session?.operatorId || '') ||
        safeString(InventoryState.config?.lastOperatorId || '') ||
        safeString(InventoryState.operator || '');

      const res = await auditSingle(itemId, itemType, {
        operatorId,
        auditDate,
        notes: '棚卸 / Kiểm kê'
      });

      if (res?.success) notify(msg('棚卸を記録しました。', 'Ghi nhận kiểm kê.'), 'success');
      else if (!res?.queued) notify(msg('棚卸の記録に失敗しました。', 'Ghi nhận kiểm kê thất bại.'), 'error');

      return res;
    },

    async auditSelected(options) {
      const sel = getSelectionAPI();
      const selected = isFn(sel.getSelectedItems) ? sel.getSelectedItems() : (window.SelectionState?.items || []);
      const count = Array.isArray(selected) ? selected.length : 0;

      if (!count) {
        notify(msg('未選択です。', 'Chưa chọn mục nào.'), 'warning');
        return { successCount: 0, failCount: 0, results: [] };
      }

      const operatorId =
        safeString(InventoryState.session?.operatorId || '') ||
        safeString(InventoryState.config?.lastOperatorId || '') ||
        safeString(InventoryState.operator || '');

      if (!operatorId) {
        notify(msg('担当者が未設定です。', 'Chưa thiết lập nhân viên.'), 'error');
        return { successCount: 0, failCount: count, results: [] };
      }

      const opts = Object.assign(
        {
          operatorId,
          auditDate: todayIsoDate(),
          notes: InventoryState.session?.note ? InventoryState.session.note : '棚卸 / Kiểm kê',
          retry: 3
        },
        options || {}
      );

      notify(msg(`一括棚卸開始：${count}件`, `Bắt đầu kiểm kê hàng loạt: ${count} mục`), 'info');

      // Prefer batch, fallback sequential if server fails
      const useBatch = opts.useBatch !== false;
      const res = useBatch ? await auditManyBatch(selected, opts) : await auditManySequential(selected, opts);

      if (opts.clearSelectionAfter !== false) {
        try {
          if (sel && isFn(sel.clear)) sel.clear();
        } catch (e) {}
      }

      return res;
    },

    startAuditSelectedInBackground(options) {
      setTimeout(async () => {
        try {
          await this.auditSelected(options);
        } catch (e) {}
      }, 0);
      return true;
    },

    async relocateAndAudit(itemId, itemType, newRackLayerId, options) {
      const operatorId =
        safeString(InventoryState.session?.operatorId || '') ||
        safeString(InventoryState.config?.lastOperatorId || '') ||
        safeString(InventoryState.operator || '');

      const opts = Object.assign({ operatorId }, options || {});
      const res = await relocateAndAuditCore(itemId, itemType, newRackLayerId, opts);

      if (res?.success) notify(msg('位置変更＋棚卸が完了しました。', 'Đổi vị trí + kiểm kê hoàn tất.'), 'success');
      else if (!res?.queued) notify(msg('位置変更＋棚卸に失敗しました。', 'Đổi vị trí + kiểm kê thất bại.'), 'error');

      return res;
    },

    // Compare helper (ToolFloat calls InventoryManager.checkRackLayerMismatch(itemRackLayerId))
    checkRackLayerMismatch(itemRackLayerId) {
      const target = InventoryState.session?.targetRackLayerId;
      const enabled = !!InventoryState.session?.compareEnabled;
      if (!enabled || !target) return { mismatch: false, suggest: false };

      const targetNorm = normalizeRackLayerIdInput(target);
      const itemNorm = normalizeRackLayerIdInput(itemRackLayerId);
      if (!targetNorm || !itemNorm) return { mismatch: false, suggest: false };

      const mismatch = itemNorm !== targetNorm;
      return { mismatch, suggest: mismatch, itemRackLayerId: itemNorm, targetRackLayerId: targetNorm };
    },

    // Queue ops
    async flushQueue() {
      const before = loadQueue().length;
      const res = await flushQueueInternal();
      const after = loadQueue().length;

      if (before > 0) {
        notify(
          msg(
            `キュー同期：成功 ${res.flushed} / 残り ${after}`,
            `Đồng bộ hàng đợi: OK ${res.flushed} / Còn lại ${after}`
          ),
          after === 0 ? 'success' : 'warning'
        );
      }

      if (DEFAULTS.autoMarkAuditedCards) {
        tryMarkAuditedCards();
      }

      return res;
    }
  };

  // ============================================================================
  // Export + auto init
  // ============================================================================
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

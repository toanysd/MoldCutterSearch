// v9.0.2
/* ============================================================================

   DATA MANAGER v8.1.0

   MoldCutter Search System - Core Data Loading & Relationship Module

   Created: 2026-01-23 08:10

   Based on: r7.0.9 & v8.0.1 (V4.31 logic, fully tested)



   Features:

   - Loads 17 CSV files from GitHub Raw with local fallback

   - Parses CSV with quotes/CRLF handling

   - Builds V4.31 relationships + computed fields

   - Mold-Cutter relation via MoldDesignID (preferred), fallback to legacy

   - PendingCache for offline queuing (LocalStorage persistence)

   - Exposes window.DataManager for other modules

   - Compatible with v8.0.3 UI modules (App, CardRenderer, TableRenderer)

============================================================================ */



(function () {

    'use strict';



    console.log('💾 Data Manager v8.0.3-1 initializing...');



    // =========================================================================

    // CONFIGURATION

    // =========================================================================

    let currentGithubSha = 'main'; // v8.4.9: Sẽ lấy mã SHA mới nhất để bỏ qua Cache CDN

    // v9.1.5 - Secure Proxy: Giấu link GitHub Private sau Node Proxy
    const GITHUB_BASE_URL_TEMPLATE = 'https://ysd-moldcutter-backend.onrender.com/api/csv/read/';

    const REMOTE_TIMEOUT_MS = 12000;



    // Registry of CSV files (25 files total)

    const CSV_FILES = [

        // Core tables (required)

        { key: 'molds', file: 'molds.csv', required: true },

        { key: 'cutters', file: 'cutters.csv', required: true },



        // Relationship tables (optional)

        { key: 'customers', file: 'customers.csv', required: false },

        { key: 'molddesign', file: 'molddesign.csv', required: false },

        { key: 'moldcutter', file: 'moldcutter.csv', required: false },

        { key: 'mold_plastic_bom', file: 'mold_plastic_bom.csv', required: false },

        { key: 'racklayers', file: 'racklayers.csv', required: false },

        { key: 'racks', file: 'racks.csv', required: false },

        { key: 'companies', file: 'companies.csv', required: false },



        // History logs (optional)

        { key: 'shiplog', file: 'shiplog.csv', required: false },

        { key: 'locationlog', file: 'locationlog.csv', required: false },

        { key: 'usercomments', file: 'usercomments.csv', required: false },



        // Process tables (optional)

        { key: 'employees', file: 'employees.csv', required: false },

        { key: 'jobs', file: 'jobs.csv', required: false },

        { key: 'orderhead', file: 'orderhead.csv', required: false },

        { key: 'orderline', file: 'orderline.csv', required: false },

        { key: 'processingitems', file: 'processingitems.csv', required: false },

        { key: 'processingdeadline', file: 'processingdeadline.csv', required: false },

        { key: 'processingstatus', file: 'processingstatus.csv', required: false },

        { key: 'itemtype', file: 'itemtype.csv', required: false },

        { key: 'plasticforforming', file: 'plasticforforming.csv', required: false },

        { key: 'machiningcustomer', file: 'machiningcustomer.csv', required: false },

        { key: 'trays', file: 'trays.csv', required: false },

        { key: 'worklog', file: 'worklog.csv', required: false },



        { key: 'machines', file: 'machine.csv', required: false },

        { key: 'jobtrays', file: 'jobtray.csv', required: false },

        { key: 'productionschedules', file: 'productionschedule.csv', required: false },

        { key: 'productionscheduleitems', file: 'productionscheduleitem.csv', required: false },

        { key: 'forminglots', file: 'forminglot.csv', required: false },

        { key: 'moldmaintenances', file: 'moldmaintenance.csv', required: false },

        { key: 'traydimensionspecs', file: 'traydimensionspec.csv', required: false },

        { key: 'trayinspections', file: 'trayinspection.csv', required: false },

        { key: 'traysamples', file: 'traysample.csv', required: false },





        // New tables

        { key: 'CAV', file: 'cav.csv', required: false },

        { key: 'destinations', file: 'destinations.csv', required: false },

        { key: 'statuslogs', file: 'statuslogs.csv', required: false },

        { key: 'teflonlog', file: 'teflonlog.csv', required: false },

        { key: 'scraplogs', file: 'scraplog.csv', required: false },

        { key: 'datachangehistory', file: 'datachangehistory.csv', required: false },

        { key: 'accesscommithistory', file: 'accesscommithistory.csv', required: false },





        // Core tables (required)



        // Relationship tables (optional)

        { key: 'scraplogs', file: 'scraplog.csv', required: false },

        { key: 'datachangehistory', file: 'datachangehistory.csv', required: false },

        { key: 'accesscommithistory', file: 'accesscommithistory.csv', required: false },





        // Core tables (required)



        // Relationship tables (optional)



        // History logs (optional)



        // Process tables (optional)





        // New tables

        //{ key: 'web_cav', file: 'web_cav.csv', required: false },



        // Plastic Module (WMS)

        { key: 'plastic_master', file: 'plastic_master.csv', required: false },

        { key: 'plastic_manufacturer_map', file: 'plastic_manufacturer_map.csv', required: false },

        { key: 'plastic_supplier', file: 'plastic_supplier.csv', required: false },

        { key: 'plastic_manufacturer_grade', file: 'plastic_manufacturer_grade.csv', required: false },

        { key: 'plastic_pricing', file: 'plastic_pricing.csv', required: false },

        { key: 'plastic_receipt', file: 'plastic_receipt.csv', required: false },

        { key: 'plastic_receipt_roll', file: 'plastic_receipt_roll.csv', required: false },

        { key: 'plastic_adjustment_log', file: 'plastic_adjustment_log.csv', required: false },

        { key: 'plastic_usage_plan', file: 'plastic_usage_plan.csv', required: false },

        { key: 'plastic_usage_plan_roll', file: 'plastic_usage_plan_roll.csv', required: false },

        { key: 'plastic_usage_actual', file: 'plastic_usage_actual.csv', required: false },

        { key: 'plastic_inventory_snapshot', file: 'plastic_inventory_snapshot.csv', required: false },

        { key: 'plastic_inventory_count_line', file: 'plastic_inventory_count_line.csv', required: false },



    ];



    // =========================================================================

    // INTERNAL STATE

    // =========================================================================

    const state = {

        allData: {

            molds: [],

            cutters: [],

            customers: [],

            molddesign: [],

            moldcutter: [],

            mold_plastic_bom: [],

            racklayers: [],

            racks: [],

            companies: [],

            shiplog: [],

            locationlog: [],

            usercomments: [],

            employees: [],

            jobs: [],

            processingitems: [],

            CAV: [],

            destinations: [],

            statuslogs: [],

            teflonlog: [],

            scraplogs: [],

            datachangehistory: [],

            accesscommithistory: [],



            orderhead: [],

            orderline: [],



            processingdeadline: [],

            processingstatus: [],

            itemtype: [],

            plasticforforming: [],

            machiningcustomer: [],

            trays: [],

            worklog: [],



            machines: [],

            jobtrays: [],

            productionschedules: [],

            productionscheduleitems: [],

            forminglots: [],

            moldmaintenances: [],

            traydimensionspecs: [],

            trayinspections: [],

            traysamples: [],



            // Plastic Module

            plastic_master: [],

            plastic_manufacturer_map: [],

            plastic_supplier: [],

            plastic_manufacturer_grade: [],

            plastic_pricing: [],

            plastic_receipt: [],

            plastic_receipt_roll: [],

            plastic_adjustment_log: [],

            plastic_usage_plan: [],

            plastic_usage_plan_roll: [],

            plastic_usage_actual: [],

            plastic_inventory_snapshot: [],

            plastic_inventory_count_line: [],











        },

        maps: {},

        loaded: false,

    };



    // =========================================================================

    // PENDING CACHE LAYER (Offline Queuing)

    // =========================================================================

    const PendingCache = {



        // Storage-safe (v8.0.3-1)

        _persistenceEnabled: true,

        _persistWarned: false,

        _lastPersistError: null,



        _isQuotaError: function (e) {

            try {

                if (!e) return false;

                if (e.name === 'QuotaExceededError') return true;

                if (e.code === 22 || e.code === 1014) return true;

                var msg = String(e.message || e).toLowerCase();

                return msg.indexOf('quota') >= 0 || msg.indexOf('exceeded') >= 0 || msg.indexOf('storage') >= 0;

            } catch (_) {

                return false;

            }

        },



        _safeJsonParse: function (raw, fallback) {

            try { return JSON.parse(raw); } catch (_) { return fallback; }

        },



        _normalizeText: function (v, maxLen) {

            var s = '';

            try { s = (v === null || v === undefined) ? '' : String(v); } catch (_) { s = ''; }

            if (!maxLen || maxLen <= 0) return s;

            if (s.length <= maxLen) return s;

            return s.slice(0, maxLen - 1) + '…';

        },



        _compactPending: function (list, options) {

            options = options || {};

            var maxNotes = Number.isFinite(options.maxNotes) ? options.maxNotes : 240;

            var arr = Array.isArray(list) ? list : [];

            return arr

                .filter(function (p) { return p && typeof p === 'object'; })

                .map(function (p) {

                    return {

                        StatusLogID: (p.StatusLogID ? String(p.StatusLogID) : ('S' + Date.now())),

                        Timestamp: this._normalizeText(p.Timestamp, 40),

                        MoldID: this._normalizeText(p.MoldID, 40),

                        CutterID: this._normalizeText(p.CutterID, 40),

                        ItemType: this._normalizeText(p.ItemType, 16),

                        Status: this._normalizeText(p.Status, 16),

                        EmployeeID: this._normalizeText(p.EmployeeID, 40),

                        DestinationID: this._normalizeText(p.DestinationID, 60),

                        Notes: this._normalizeText(p.Notes, maxNotes),

                        _pending: true,

                        _localId: this._normalizeText(p._localId, 80),

                        _createdAt: this._normalizeText(p._createdAt, 40),

                        _syncError: this._normalizeText(p._syncError, 180),

                        _syncErrorAt: this._normalizeText(p._syncErrorAt, 40)

                    };

                }, this);

        },



        _sortPendingNewest: function (list) {

            var arr = Array.isArray(list) ? list.slice() : [];

            arr.sort(function (a, b) {

                var ta = Date.parse((a && a.Timestamp) ? a.Timestamp : '') || Date.parse((a && a._createdAt) ? a._createdAt : '') || 0;

                var tb = Date.parse((b && b.Timestamp) ? b.Timestamp : '') || Date.parse((b && b._createdAt) ? b._createdAt : '') || 0;

                return tb - ta;

            });

            return arr;

        },



        /**
    
         * Add pending log to cache
    
         */

        add(logData) {

            const pending = {

                ...logData,

                _pending: true,

                _localId: `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,

                _createdAt: new Date().toISOString()

            };



            if (!state.allData.statuslogs) {

                state.allData.statuslogs = [];

            }



            state.allData.statuslogs.unshift(pending);

            this.persist();

            console.log('✅ PendingCache: Added', pending._localId);

            return pending;

        },



        /**
    
         * Remove pending log after sync
    
         */

        remove(localId) {

            if (!state.allData.statuslogs) return;

            const beforeLen = state.allData.statuslogs.length;

            state.allData.statuslogs = state.allData.statuslogs.filter(log => log._localId !== localId);

            const afterLen = state.allData.statuslogs.length;

            if (beforeLen !== afterLen) {

                this.persist();

                console.log('✅ PendingCache: Removed', localId);

            }

        },



        /**
    
         * Mark log as error
    
         */

        markError(localId, errorMsg) {

            const log = state.allData.statuslogs?.find(l => l._localId === localId);

            if (log) {

                log._syncError = errorMsg;

                log._syncErrorAt = new Date().toISOString();

                this.persist();

                console.warn('⚠️ PendingCache: Marked error', localId, errorMsg);

            }

        },





        /**
    
         * Persist to LocalStorage (storage-safe)
    
         */

        persist() {

            if (!this._persistenceEnabled) return;



            try {

                var pendingRaw = (state.allData.statuslogs || []).filter(function (log) { return log && log._pending; });

                var pending = this._compactPending(pendingRaw, { maxNotes: 260 });

                localStorage.setItem('pendingStatusLogs', JSON.stringify(pending));

                this._lastPersistError = null;

                console.log('💾 PendingCache: Persisted', pending.length, 'logs');

            } catch (e) {

                this._lastPersistError = e;



                if (!this._isQuotaError(e)) {

                    if (!this._persistWarned) {

                        this._persistWarned = true;

                        console.warn('Failed to persist pending logs', e);

                    }

                    return;

                }



                try {

                    try { this.cleanup(15 * 60 * 1000); } catch (_) { }



                    var pendingRaw2 = (state.allData.statuslogs || []).filter(function (log) { return log && log._pending; });

                    var sorted = this._sortPendingNewest(pendingRaw2);



                    var keepLevels = [60, 40, 25, 15, 8];

                    for (var i = 0; i < keepLevels.length; i++) {

                        var keep = keepLevels[i];

                        var compact = this._compactPending(sorted.slice(0, keep), { maxNotes: 180 });

                        try {

                            localStorage.setItem('pendingStatusLogs', JSON.stringify(compact));

                            this._lastPersistError = null;

                            console.warn('⚠️ PendingCache: Storage quota hit, trimmed to', keep, 'logs');

                            return;

                        } catch (e2) {

                            if (!this._isQuotaError(e2)) break;

                        }

                    }



                    try { localStorage.removeItem('pendingStatusLogs'); } catch (_) { }

                    try {

                        var compactMin = this._compactPending(sorted.slice(0, 8), { maxNotes: 120 });

                        localStorage.setItem('pendingStatusLogs', JSON.stringify(compactMin));

                        this._lastPersistError = null;

                        return;

                    } catch (_) {

                        this._persistenceEnabled = false;

                    }

                } catch (e3) {

                    this._persistenceEnabled = false;

                }

            }

        },





        /**
    
         * Restore from LocalStorage (storage-safe)
    
         */

        restore() {

            try {

                var saved = localStorage.getItem('pendingStatusLogs');

                if (!saved) return;



                var parsed = this._safeJsonParse(saved, null);

                if (!Array.isArray(parsed) || !parsed.length) return;



                var pending = this._compactPending(parsed, { maxNotes: 260 });

                var limited = pending.slice(0, 80);



                console.log('🔄 PendingCache: Restoring', limited.length, 'pending logs');



                if (!state.allData.statuslogs) state.allData.statuslogs = [];



                limited.forEach(function (p) {

                    var exists = state.allData.statuslogs.some(function (log) {

                        if (!log) return false;

                        if (log._localId && p._localId && log._localId === p._localId) return true;

                        return (log.Timestamp === p.Timestamp && log.MoldID === p.MoldID && log.CutterID === p.CutterID);

                    });

                    if (!exists) state.allData.statuslogs.unshift(p);

                });



                this.persist();

                console.log('✅ PendingCache: Restored', limited.length, 'logs');

            } catch (e) {

                console.warn('Failed to restore pending logs', e);

            }

        },



        /**
    
         * Cleanup old pending logs (storage-safe)
    
         */

        cleanup(maxAge = 3600000) {

            if (!state.allData.statuslogs) return;



            var now = Date.now();

            var beforeLen = state.allData.statuslogs.length;



            state.allData.statuslogs = state.allData.statuslogs.filter(function (log) {

                if (!log || !log._pending) return true;

                var t = Date.parse(log._createdAt || '') || Date.parse(log.Timestamp || '') || 0;

                var age = now - t;

                if (!Number.isFinite(age) || age < 0) return true;

                return age < maxAge;

            });



            var afterLen = state.allData.statuslogs.length;

            if (beforeLen !== afterLen) {

                this.persist();

                console.log('🧹 PendingCache: Cleaned up', beforeLen - afterLen, 'old logs');

            }

        },

    };



    // =========================================================================
    // INDEXEDDB CACHE (V10)
    // =========================================================================
    const CACHE_DB_NAME = 'MCS_V10_Cache';
    const CACHE_STORE = 'csv_tables';
    const LocalCache = {
        _db: null,
        init: function () {
            return new Promise(function (resolve, reject) {
                if (LocalCache._db) return resolve();
                var req = indexedDB.open(CACHE_DB_NAME, 1);
                req.onupgradeneeded = function (e) {
                    var db = e.target.result;
                    if (!db.objectStoreNames.contains(CACHE_STORE)) {
                        db.createObjectStore(CACHE_STORE);
                    }
                };
                req.onsuccess = function (e) { LocalCache._db = e.target.result; resolve(); };
                req.onerror = function (e) { reject(e); };
            });
        },
        get: function (key) {
            return new Promise(function (resolve) {
                if (!LocalCache._db) return resolve(null);
                try {
                    var tx = LocalCache._db.transaction(CACHE_STORE, 'readonly');
                    var store = tx.objectStore(CACHE_STORE);
                    var req = store.get(key);
                    req.onsuccess = function () { resolve(req.result); };
                    req.onerror = function () { resolve(null); };
                } catch (e) { resolve(null); }
            });
        },
        set: function (key, value) {
            return new Promise(function (resolve) {
                if (!LocalCache._db) return resolve();
                try {
                    var tx = LocalCache._db.transaction(CACHE_STORE, 'readwrite');
                    var store = tx.objectStore(CACHE_STORE);
                    var req = store.put(value, key);
                    req.onsuccess = function () { resolve(); };
                    req.onerror = function () { resolve(); };
                } catch (e) { resolve(); }
            });
        },
        clear: function () {
            return new Promise(function (resolve) {
                if (!LocalCache._db) return resolve();
                try {
                    var tx = LocalCache._db.transaction(CACHE_STORE, 'readwrite');
                    var req = tx.objectStore(CACHE_STORE).clear();
                    req.onsuccess = function () { resolve(); };
                    req.onerror = function () { resolve(); };
                } catch (e) { resolve(); }
            });
        }
    };

    /**
     * V8.4.9: Lấy SHA mới nhất từ server để bỏ qua CDN Cache
     */
    async function fetchLatestSha() {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 3000);
            const res = await fetch('https://api.github.com/repos/toanysd/MoldCutterSearch/commits/main', {
                signal: controller.signal
            });
            clearTimeout(id);
            if (res.ok) {
                const data = await res.json();
                if (data.sha) currentGithubSha = data.sha;
                console.log('✅ Resolved latest SHA from GitHub:', currentGithubSha);
            }
        } catch (e) {
            console.warn('⚠️ Could not fetch latest SHA from GitHub (timeout/error), falling back to main');
            currentGithubSha = 'main';
        }
    }

    /**
     * Main entry: Load all CSV files from GitHub with Offline IndexDB Cache
     */
    async function loadAllData(forceRefresh = false) {
        console.time('[v10] loadAllData');

        await LocalCache.init().catch(e => console.warn('IndexedDB Init Failed', e));

        if (forceRefresh) {
            await LocalCache.clear();
            console.log('🧹 Cache cleared. Forcing network fetch.');
            await fetchLatestSha(); // Chờ lấy nhánh mới nhất nếu quét lại mạng
        }

        const results = await Promise.all(
            CSV_FILES.map(async function (def) {
                // V10: Cache Priority
                if (!forceRefresh) {
                    var cachedText = await LocalCache.get(def.file);
                    if (cachedText) {
                        const data = parseCSV(cachedText);
                        state.allData[def.key] = data;
                        console.log(`⚡ Cached [${def.file}]: ${data.length} rows`);
                        return true;
                    }
                }

                // Fallback to fetch
                return fetchCSVWithFallback(def.file, def.required)
                    .then(async function (text) {
                        if (text) {
                            await LocalCache.set(def.file, text);
                            const data = parseCSV(text);
                            state.allData[def.key] = data;
                            console.log(`✅ Loaded [${def.file}]: ${data.length} rows`);
                            return true;
                        }
                        return !def.required;
                    });
            })
        );

        if (!results.every(Boolean)) {
            throw new Error('One or more required CSV files failed to load.');
        }

        applyWebLatestMerge();

        // Restore pending logs BEFORE processing relationships
        PendingCache.restore();
        state.loaded = true;

        // Expose for debugging
        window.ALL_DATA = state.allData;

        console.timeEnd('[v10] loadAllData');

        // Cleanup old pending logs
        PendingCache.cleanup();

        // Fire event for other modules
        document.dispatchEvent(new CustomEvent('data-manager:ready'));

        // Also trigger app data update
        if (window.App && window.App.triggerDataUpdate) {
            window.App.triggerDataUpdate();
        }
    }

    /**
     * V10 API: Explicitly wipe cache and force reload from network
     */
    async function forceClearCacheAndReload() {
        return loadAllData(true);
    }



    /**

     * Fetch CSV with fallback (GitHub → Local)

     */

    async function fetchCSVWithFallback(filename, required) {

        // 1) Try GitHub Raw

        try {

            // Apply Single-Source-Of-Truth Caching Strategy

            // Use currentGithubSha to version the URL aggressively cache. Only skip cache if we don't have SHA.

            let useBranch = currentGithubSha || 'main';

            let noCache = (useBranch === 'main');



            // Tạm thời bỏ qua cơ chế {SHA} vì Backend Proxy sẽ tự uỷ quyền kéo nhánh main
            const rawUrl = GITHUB_BASE_URL_TEMPLATE + filename;

            const controller = new AbortController();

            const id = setTimeout(() => controller.abort(), 60000); // 60 seconds timeout to handle Render cold start



            const fetchOpts = {

                method: 'GET',

                signal: controller.signal,

            };



            if (noCache) {

                fetchOpts.cache = 'no-store';

            }



            const appendQuery = noCache ? `?nocache=${Date.now()}` : '';



            const res = await fetch(`${rawUrl}${appendQuery}`, fetchOpts);

            clearTimeout(id);

            if (res.ok) {

                console.log(`📥 Loaded from GitHub: ${filename}`);

                const text = await res.text();
                
                if (text.trim().toLowerCase().startsWith('<!doctype html>') || text.toLowerCase().includes('<html')) {
                    throw new Error(`GitHub backend returned HTML instead of CSV for ${filename} (Auth/Routing Error)`);
                }

                return text;

            }

            console.warn(`GitHub fetch not OK for ${filename}: ${res.status}`);

        } catch (e) {

            console.warn(`GitHub fetch failed for ${filename}: ${e.message}`);

        }



        // 2) Fallback to local folder

        // QUAN TRỌNG: khi mở bằng file:// thì fetch local sẽ bị CORS trong Chrome/Edge

        try {

            const isFileProtocol = (typeof location !== 'undefined' && location.protocol === 'file:');

            if (isFileProtocol) {

                // Không thử local để tránh CORS error

                if (required) throw new Error(`Required CSV not available (file:// blocks local fetch): ${filename}`);

                return '';

            }



            const resLocal = await fetch(`./${filename}?nocache=${Date.now()}`, {

                method: 'GET',

                cache: 'no-store'

            });

            if (resLocal.ok) {

                console.log(`📥 Loaded from local: ${filename}`);

                const textLocal = await resLocal.text();
                
                if (textLocal.trim().toLowerCase().startsWith('<!doctype html>') || textLocal.toLowerCase().includes('<html')) {
                    throw new Error(`Local fetch returned HTML instead of CSV for ${filename} (SPA Fallback Trap)`);
                }

                return textLocal;

            }

            console.warn(`Local fetch not OK for ${filename}:`, resLocal.status);

        } catch (e) {

            console.warn(`Local fetch failed for ${filename}:`, e.message);

        }





        // 3) Error if required

        if (required) {

            throw new Error(`Required CSV not available: ${filename}`);

        }



        return '';

    }



    // =========================================================================

    // CSV PARSING

    // =========================================================================



    /**

     * Robust CSV parser with quotes/CRLF handling

     */

    function parseCSV(csvText) {

        if (!csvText || !csvText.trim()) return [];



        const lines = csvText

            .replace(/\r\n/g, '\n')

            .replace(/\r/g, '\n')

            .split('\n')

            .filter(l => l.trim() !== '');



        if (lines.length === 0) return [];



        const headers = splitCSVLine(lines[0]).map(h => stripQuotes(h.trim()));

        const rows = [];



        for (let i = 1; i < lines.length; i++) {

            const parts = splitCSVLine(lines[i]).map(v => stripQuotes(v));

            const obj = {};

            headers.forEach((h, idx) => {

                obj[h] = parts[idx] !== undefined ? parts[idx] : '';

            });

            rows.push(obj);

        }



        return rows;

    }



    function splitCSVLine(line) {

        const out = [];

        let cur = '';

        let inQuotes = false;



        for (let i = 0; i < line.length; i++) {

            const ch = line[i];

            if (ch === '"' && line[i - 1] !== '\\') {

                inQuotes = !inQuotes;

            } else if (ch === ',' && !inQuotes) {

                out.push(cur);

                cur = '';

            } else {

                cur += ch;

            }

        }

        out.push(cur);

        return out;

    }



    function stripQuotes(s) {

        if (s == null) return '';

        return s.replace(/^"(.*)"$/s, '$1');

    }



    // =========================================================================

    // RELATIONSHIP PROCESSING (V4.31)

    // =========================================================================





    function mergeBaseAndWebData() {

        console.warn('mergeBaseAndWebData() is deprecated. Use applyWebLatestMerge() instead.');

        return state.allData;

    }





    function normHistoryValue(v) {

        return String(v == null ? '' : v).trim()

    }



    function getHistoryRows(key) {

        return Array.isArray(state.allData[key]) ? state.allData[key] : []

    }



    function findLatestAccessCommitAt(tableName) {

        var rows = getHistoryRows('accesscommithistory')

        var target = normHistoryValue(tableName).toLowerCase()

        var latest = ''

        rows.forEach(function (row) {

            if (normHistoryValue(row.TableName).toLowerCase() !== target) return

            var commitAt = normHistoryValue(row.CommitAt)

            if (commitAt && (!latest || commitAt > latest)) latest = commitAt

        })

        return latest

    }





    function buildHistoryFieldOverlay(tableName, recordId, idField) {

        var rows = getHistoryRows('datachangehistory')

        var targetTable = normHistoryValue(tableName).toLowerCase()

        var targetId = normHistoryValue(recordId)

        var targetIdField = normHistoryValue(idField)

        var latestCommitAt = findLatestAccessCommitAt(tableName)

        var fieldMap = {}



        rows.forEach(function (row) {

            if (normHistoryValue(row.TableName).toLowerCase() !== targetTable) return

            if (normHistoryValue(row.RecordID) !== targetId) return

            if (targetIdField && normHistoryValue(row.RecordIDField) !== targetIdField) return



            var fieldName = normHistoryValue(row.FieldName)

            var changedAt = normHistoryValue(row.ChangedAt)

            if (!fieldName || !changedAt) return



            if (latestCommitAt) {

                var baseCommitAt = normHistoryValue(row.BaseCommitAt)

                if (baseCommitAt && latestCommitAt > baseCommitAt) return

            }



            if (!fieldMap[fieldName] || changedAt > fieldMap[fieldName].ChangedAt) {

                fieldMap[fieldName] = row

            }

        })



        return fieldMap

    }



    function overlayRowByHistory(baseArr, tableName, idField) {

        var base = Array.isArray(baseArr) ? baseArr : []

        var out = []



        base.forEach(function (baseRow) {

            var row = Object.assign({}, baseRow)

            var recordId = normHistoryValue(baseRow && baseRow[idField])

            var fieldOverlay = buildHistoryFieldOverlay(tableName, recordId, idField)





            Object.keys(fieldOverlay).forEach(function (fieldName) {

                row[fieldName] = fieldOverlay[fieldName].NewValue

            })



            out.push(row)

        })



        return out

    }





    function getRowTimeForMerge(row) {

        const keys = ['UpdatedAt', 'UpdatedDate', 'Timestamp', 'DateEntry', 'MoldEntry'];

        for (const k of keys) {

            const t = Date.parse((row && row[k]) ? row[k] : '');

            if (!isNaN(t)) return t;

        }

        return 0;

    }





    function applyWebLatestMerge() {

        const d = state.allData;



        // --- Cốt lõi ---

        d.molds = overlayRowByHistory(d.molds, 'molds', 'MoldID');

        d.cutters = overlayRowByHistory(d.cutters, 'cutters', 'CutterID');



        // --- Tab Mở Rộng (Bổ sung Phase 8) ---

        d.molddesign = overlayRowByHistory(d.molddesign, 'molddesign', 'MoldDesignID');

        d.customers = overlayRowByHistory(d.customers, 'customers', 'CustomerID');

        d.companies = overlayRowByHistory(d.companies, 'companies', 'CompanyID');



        // Build lookup maps

        const moldDesignMap = mapBy(d.molddesign, 'MoldDesignID');

        const customerMap = mapBy(d.customers, 'CustomerID');

        const companyMap = mapBy(d.companies, 'CompanyID');

        const rackMap = mapBy(d.racks, 'RackID');

        const rackLayerMap = mapBy(d.racklayers, 'RackLayerID');

        const jobByDesignMap = mapBy(d.jobs, 'MoldDesignID');

        const processingItemMap = mapBy(d.processingitems, 'ProcessingItemID');

        const destinationsMap = mapBy(d.destinations, 'DestinationID');



        const machineMap = mapBy(d.machines, 'MachineID');

        const trayMap = mapBy(d.trays, 'TrayID');

        const jobTrayMap = mapBy(d.jobtrays, 'JobTrayID');

        const productionScheduleMap = mapBy(d.productionschedules, 'ProductionScheduleID');

        const productionScheduleItemMap = mapBy(d.productionscheduleitems, 'ProductionScheduleItemID');

        const formingLotMap = mapBy(d.forminglots, 'FormingLotID');

        const moldMaintenanceMap = mapBy(d.moldmaintenances, 'MoldMaintenanceID');

        const trayDimensionSpecMap = mapBy(d.traydimensionspecs, 'TrayDimensionSpecID');

        const trayInspectionMap = mapBy(d.trayinspections, 'TrayInspectionID');

        const traySampleMap = mapBy(d.traysamples, 'TraySampleID');



        // Latest Teflon log map (by MoldID)

        const teflonLatestByMoldId = new Map();



        function getRowTimeMs(row) {

            const keys = ['UpdatedDate', 'CreatedDate', 'ReceivedDate', 'SentDate', 'RequestedDate'];

            for (const k of keys) {

                const t = Date.parse(row?.[k] || '');

                if (!isNaN(t)) return t;

            }

            const idNum = parseInt(row?.TeflonLogID, 10);

            if (!isNaN(idNum)) return idNum;

            return 0;

        }



        if (Array.isArray(d.teflonlog)) {

            d.teflonlog.forEach((row) => {

                const moldId = (row?.MoldID ?? '').toString().trim();

                if (!moldId) return;



                const current = teflonLatestByMoldId.get(moldId);
                const currentId = parseInt(current?.TeflonLogID, 10) || 0;
                const rowId = parseInt(row?.TeflonLogID, 10) || 0;

                if (!current || rowId > currentId) {
                    teflonLatestByMoldId.set(moldId, row);
                } else if (rowId === currentId && rowId === 0) {
                    if (getRowTimeMs(row) > getRowTimeMs(current)) {
                        teflonLatestByMoldId.set(moldId, row);
                    }
                }

            });

        }



        // Build Mold-Cutter relationship

        const cuttersByDesign = new Map();

        const moldsByDesign = new Map();



        if (Array.isArray(d.moldcutter) && d.moldcutter.length > 0) {

            const hasDesignKey = d.moldcutter.some(mc => 'MoldDesignID' in mc && mc.MoldDesignID);



            if (hasDesignKey) {

                d.moldcutter.forEach(mc => {

                    const desId = mc.MoldDesignID;

                    if (!desId) return;



                    if (mc.CutterID) {

                        const list = cuttersByDesign.get(desId) || [];

                        list.push(mc.CutterID);

                        cuttersByDesign.set(desId, list);

                    }

                    if (mc.MoldID) {

                        const listM = moldsByDesign.get(desId) || [];

                        listM.push(mc.MoldID);

                        moldsByDesign.set(desId, listM);

                    }

                });

            } else {

                // Fallback: legacy mapping

                d.moldcutter.forEach(mc => {

                    if (mc.MoldID && mc.CutterID) {

                        const mold = d.molds.find(m => m.MoldID === mc.MoldID);

                        const designId = mold?.MoldDesignID;

                        if (designId) {

                            const list = cuttersByDesign.get(designId) || [];

                            list.push(mc.CutterID);

                            cuttersByDesign.set(designId, list);

                        }

                    }

                });

            }

        }



        // Helper to get latest status log

        function getLatestStatusLog(kind, id) {

            const logs = d.statuslogs.filter(log => {

                if (kind === 'MOLD') return String(log.MoldID || '').trim() === String(id || '').trim();

                if (kind === 'CUTTER') return String(log.CutterID || '').trim() === String(id || '').trim();

                return false;

            });

            if (logs.length === 0) return null;



            logs.sort((a, b) => {

                const ta = Date.parse(a.Timestamp || '') || 0;

                const tb = Date.parse(b.Timestamp || '') || 0;

                return tb - ta;

            });



            const latest = logs[0];

            return {
                ...latest,
                destinationInfo: destinationsMap.get(latest.DestinationID) || null,
            };

        }



        // Process molds

        d.molds = d.molds.map(mold => {

            const design = moldDesignMap.get(mold.MoldDesignID) || {};

            const customer = customerMap.get(mold.CustomerID) || {};

            const company = companyMap.get(customer.CompanyID) || {};

            const rackLayer = rackLayerMap.get(mold.RackLayerID) || {};

            const rack = rackLayer.RackID ? (rackMap.get(rackLayer.RackID) || {}) : {};

            const storageCompany = companyMap.get(mold.KeeperCompany) || {};

            const keeperCompany = companyMap.get(mold.KeeperCompany) || {};

            const job = jobByDesignMap.get(mold.MoldDesignID) || {};

            const processingItem = processingItemMap.get(job.ProcessingItemID) || {};



            // Related cutters

            const relatedCutterIDs = cuttersByDesign.get(mold.MoldDesignID) || [];

            const relatedCutters = relatedCutterIDs

                .map(cid => d.cutters.find(c => c.CutterID === cid))

                .filter(Boolean);



            // Cutline size

            let cutlineSize = '';

            if (design.CutlineX && design.CutlineY) {

                cutlineSize = `${design.CutlineX}x${design.CutlineY}`;

            }

            if (!cutlineSize && d.CAV?.length) {

                const key = (design.Serial || design.CAV || '').trim();

                if (key) {

                    const cavRow = d.CAV.find(r => (r.Serial || r.CAV || '').trim() === key);

                    if (cavRow && cavRow.CAVlength && cavRow.CAVwidth) {

                        cutlineSize = `${cavRow.CAVlength}x${cavRow.CAVwidth}`;

                    }

                }

            }



            const displayDimensions = createMoldDimensionString(mold, design);

            const displayCustomer = getCustomerDisplayName(customer, company);

            const storageBadge = getStorageCompanyDisplay(mold.KeeperCompany, companyMap);

            const v431Status = getCurrentStatus(mold);

            const latestLog = getLatestStatusLog('MOLD', mold.MoldID);

            const latestTeflon = teflonLatestByMoldId.get(String(mold.MoldID).trim()) || null;



            const tray = design.TrayID ? (trayMap.get(design.TrayID) || {}) : {};



            return {

                ...mold,

                designInfo: design,

                customerInfo: customer,

                companyInfo: company,

                rackLayerInfo: rackLayer,

                rackInfo: rack,

                storageCompanyInfo: storageCompany,

                keeperCompanyInfo: keeperCompany,

                jobInfo: job,

                processingItemInfo: processingItem,

                relatedCutters,

                trayInfo: tray,



                // For v8.0.3 UI compatibility

                code: mold.MoldCode || '',

                name: mold.MoldName || mold.MoldCode || '',

                type: 'mold',

                dimensions: displayDimensions,

                location: mold.RackLayerID || '',

                rackNo: mold.RackLayerID || '',

                company: displayCustomer,

                productionDate: job.DeliveryDeadline || '',

                lastStatus: latestLog?.Status || v431Status?.text || '',

                lastDate: latestLog?.Timestamp || '',



                // Legacy fields

                displayCode: mold.MoldCode || '',

                displayName: mold.MoldName || mold.MoldCode || '',

                displayDimensions,

                displayLocation: mold.RackLayerID || '',

                displayCustomer,

                displayStorageCompany: (storageBadge && storageBadge.text) ? storageBadge.text : 'N/A',

                displayStorageCompanyBadge: storageBadge,

                displayStorageCompanyClass: (storageBadge && storageBadge.class) ? storageBadge.class : 'unknown',

                displayRackLocation: rack.RackLocation || '',

                displayDate: job.DeliveryDeadline || '',

                itemType: 'mold',

                currentStatus: v431Status,

                latestStatusLog: latestLog,



                latestTeflonLog: latestTeflon,

                latestTeflonLog: latestTeflon,

                teflonStatus:

                    latestTeflon?.TeflonStatus ||

                    latestTeflon?.Status ||

                    null,



            };

        });



        // Index molds by design

        const moldIdsByDesign = new Map();

        state.allData.molds.forEach(m => {

            const list = moldIdsByDesign.get(m.MoldDesignID) || [];

            list.push(m.MoldID);

            moldIdsByDesign.set(m.MoldDesignID, list);

        });



        // Process cutters

        d.cutters = d.cutters.map(cutter => {

            const customer = customerMap.get(cutter.CustomerID) || {};

            const company = companyMap.get(customer.CompanyID) || {};

            const rackLayer = rackLayerMap.get(cutter.RackLayerID) || {};

            const rack = rackLayer.RackID ? (rackMap.get(rackLayer.RackID) || {}) : {};

            const storageCompany = companyMap.get(cutter.KeeperCompany) || {};

            const storageBadge2 = getStorageCompanyDisplay(cutter.KeeperCompany, companyMap);

            const keeperCompany = companyMap.get(cutter.KeeperCompany) || {};



            let cutlineSize = '';

            if (cutter.CutlineLength && cutter.CutlineWidth) {

                cutlineSize = `${cutter.CutlineLength}x${cutter.CutlineWidth}`;

                if (cutter.CutterCorner) cutlineSize += `-${cutter.CutterCorner}`;

                if (cutter.CutterChamfer) cutlineSize += `-${cutter.CutterChamfer}`;

            }



            let relatedMolds = [];

            if (cutter.MoldDesignID && moldIdsByDesign.has(cutter.MoldDesignID)) {

                const moldIds = moldIdsByDesign.get(cutter.MoldDesignID) || [];

                relatedMolds = moldIds.map(mid => d.molds.find(mm => mm.MoldID === mid)).filter(Boolean);

            }



            const v431Status = getCurrentStatus(cutter);

            const latestLog = getLatestStatusLog('CUTTER', cutter.CutterID);

            const displayName = cutter.CutterName || cutter.CutterDesignName || '';



            let design = {};

            if (cutter.MoldDesignID) design = moldDesignMap.get(cutter.MoldDesignID) || {};

            const tray = design.TrayID ? (trayMap.get(design.TrayID) || {}) : {};



            return {

                ...cutter,

                customerInfo: customer,

                companyInfo: company,

                rackLayerInfo: rackLayer,

                rackInfo: rack,

                storageCompanyInfo: storageCompany,

                keeperCompanyInfo: keeperCompany,

                relatedMolds,

                designInfo: design,

                trayInfo: tray,



                // For v8.0.3 UI compatibility

                code: cutter.CutterNo || '',

                name: displayName,

                type: 'cutter',

                dimensions: cutlineSize,

                location: cutter.RackLayerID || '',

                rackNo: cutter.RackLayerID || '',

                company: getCustomerDisplayName(customer, company),

                productionDate: '',

                lastStatus: latestLog?.Status || v431Status?.text || '',

                lastDate: latestLog?.Timestamp || '',



                // Legacy fields

                displayCode: cutter.CutterNo || '',

                displayName,

                displayDimensions: cutlineSize,

                displayLocation: cutter.RackLayerID || '',

                displayCustomer: getCustomerDisplayName(customer, company),

                displayStorageCompany: (storageBadge2 && storageBadge2.text) ? storageBadge2.text : 'N/A',

                displayStorageCompanyBadge: storageBadge2,

                displayStorageCompanyClass: (storageBadge2 && storageBadge2.class) ? storageBadge2.class : 'unknown',

                displayRackLocation: rack.RackLocation || '',

                itemType: 'cutter',

                currentStatus: v431Status,

                latestStatusLog: latestLog,

            };

        });



        state.maps = {

            moldDesignMap,

            customerMap,

            companyMap,

            rackMap,

            rackLayerMap,

            jobByDesignMap,

            processingItemMap,

            destinationsMap,

            machineMap,

            trayMap,

            jobTrayMap,

            productionScheduleMap,

            productionScheduleItemMap,

            formingLotMap,

            moldMaintenanceMap,

            trayDimensionSpecMap,

            trayInspectionMap,

            traySampleMap,

            plasticMasterMap: mapBy(d.plastic_master, 'plastic_id'),

            plasticReceiptMap: mapBy(d.plastic_receipt, 'receipt_id'),

            plasticReceiptRollMap: mapBy(d.plastic_receipt_roll, 'roll_id'),

            plasticManufacturerMap: mapBy(d.plastic_manufacturer_map, 'map_id')

        };





        console.log(`🔗 Processed ${state.allData.molds.length} molds & ${state.allData.cutters.length} cutters`);

    }



    // =========================================================================

    // HELPER FUNCTIONS

    // =========================================================================



    function mapBy(arr, key) {

        const m = new Map();

        (arr || []).forEach(row => {

            if (row && row[key] != null && row[key] !== '') m.set(row[key], row);

        });

        return m;

    }



    function createMoldDimensionString(mold, design) {

        if (design?.MoldDesignLength && design?.MoldDesignWidth) {

            let s = `${design.MoldDesignLength}x${design.MoldDesignWidth}`;

            if (design.MoldDesignHeight) s += `x${design.MoldDesignHeight}`;

            return s;

        }

        if (design?.MoldDesignDim) return design.MoldDesignDim;

        if (mold?.MoldLength && mold?.MoldWidth) {

            let s = `${mold.MoldLength}x${mold.MoldWidth}`;

            if (mold.MoldHeight) s += `x${mold.MoldHeight}`;

            return s;

        }

        return mold?.Size || design?.Size || '';

    }



    function getCustomerDisplayName(customer, company) {

        if (!customer || !customer.CustomerID) return '';

        let name = customer.CustomerShortName || customer.CustomerName || customer.CustomerID;

        if (company && company.CompanyShortName) {

            name = `${company.CompanyShortName} - ${name}`;

        }

        return name;

    }



    function getStorageCompanyDisplay(storageCompanyId, companyMap) {

        if (!storageCompanyId) return { text: 'N/A', class: 'unknown' };

        const company = companyMap.get(storageCompanyId);

        if (!company) return { text: 'N/A', class: 'unknown' };

        const companyName = company.CompanyShortName || company.CompanyName || storageCompanyId;

        if (String(storageCompanyId) === '2') {

            return { text: companyName, class: 'ysd' };

        }

        return { text: companyName, class: 'external' };

    }



    function getCurrentStatus(item) {

        if (item.DeviceStatus === '廃棄済' || item.DeviceStatus === 'Đã hủy' || item.MoldDisposing === 'TRUE' || item.MoldDisposing === true) {

            return { status: 'disposed', text: '廃棄済み', class: 'status-disposed' };

        }

        if (item.DeviceStatus === '出荷・返却済' || item.DeviceStatus === 'Trả lại' || item.MoldReturning === 'TRUE' || item.MoldReturning === true) {

            return { status: 'returned', text: '返却済み', class: 'status-returned' };

        }

        if (item.DeviceStatus === 'データのみ') {

            return { status: 'dataonly', text: 'データのみ', class: 'status-dataonly' };

        }

        if (item.DeviceStatus === '試作') {

            return { status: 'prototype', text: '試作', class: 'status-prototype' };

        }

        return { status: 'available', text: '利用可能', class: 'status-available' };

    }



    // =========================================================================

    // PUBLIC API

    // =========================================================================

    const DataManager = {

        get data() {

            return state.allData;

        },



        get loaded() {

            return state.loaded;

        },



        PendingCache,

        loadAllData,

        forceClearCacheAndReload,



        getAllItems() {

            return [...state.allData.molds, ...state.allData.cutters];

        },



        getAllTrays() {

            var trays = state.allData.trays || [];

            return trays.map(function (t) {

                if (!t.type) t.type = 'tray';

                return t;

            });

        },



        getItemByCode(code) {

            const allItems = this.getAllItems();

            return allItems.find(item =>

                item.code === code ||

                item.MoldCode === code ||

                item.CutterNo === code ||

                item.MoldID === code ||

                item.CutterID === code

            );

        },



        getItemHistory(code) {

            const item = this.getItemByCode(code);

            if (!item) return [];



            const itemId = item.MoldID || item.CutterID;

            const itemType = item.type === 'mold' ? 'MOLD' : 'CUTTER';



            return state.allData.statuslogs.filter(log => {

                if (itemType === 'MOLD') return log.MoldID === itemId;

                return log.CutterID === itemId;

            }).sort((a, b) => {

                const ta = Date.parse(a.Timestamp || '') || 0;

                const tb = Date.parse(b.Timestamp || '') || 0;

                return tb - ta;

            });

        },



        getMaps() {

            return state.maps;

        },



        recompute() {

            applyWebLatestMerge();

            document.dispatchEvent(new CustomEvent('data-manager:updated'));

        },



    };



    // =========================================================================

    // EXPOSE TO WINDOW & AUTO-INIT

    // =========================================================================

    window.DataManager = DataManager;



    // Auto-initialize on DOM ready
    // v9.1.5: Tạm hoãn auto-load nếu có Auth Guard (để auth-module tự kích hoạt sau khi Đăng nhập)
    function autoInit() {
        if (typeof window.supabaseClient !== 'undefined' && document.getElementById('login-overlay')) {
            console.log('⏳ Data Manager: Tạm hoãn loadAllData chờ Auth Guard...');
            return;
        }
        loadAllData().catch(err => {
            console.error('❌ Failed to load data:', err);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoInit);
    } else {
        autoInit();
    }



    console.log('✅ Data Manager v8.0.3-1 loaded and ready');



})();


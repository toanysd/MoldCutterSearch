/**
 * ============================================================================
 * PHOTO AUDIT TOOL - R2.2.3 (FIXED)
 * 写真監査ツール / Công cụ kiểm tra ảnh khuôn
 * ============================================================================
 *
 * CHANGES FROM R2.2.2:
 * - ✅ generateMoldCodeFromName(): Auto-generate moldCode from moldName (manual input)
 * - ✅ generateFileName(): Phân biệt camera (moldcode-YYYYMMDD-HHMM.jpg) vs file upload (keep original)
 * - ✅ sendEmail() payload: Flat structure theo Edge Function requirements
 * - ✅ Đảm bảo moldCode luôn có giá trị (auto/manual)
 *
 * Created: 2025-12-19
 * Last Updated: 2025-12-19 18:25 JST
 * Version: 2.2.3
 * ============================================================================
 */
'use strict';

/* ============================================================================
 * CONSTANTS
 * ============================================================================ */
const PHOTO_AUDIT_CONFIG = {
    STORAGE_BUCKET: 'mold-photos',
    DEFAULT_EMPLOYEE_ID: '1', // Toan-san
    DEFAULT_RECIPIENTS: [
        //'toan@ysd-pack.co.jp',
        'toan.ysd@gmail.com',
    ],
    IMAGE_MAX_SIZE: 10 * 1024 * 1024, // 10MB
    IMAGE_TARGET_WIDTH: 1920,
    IMAGE_TARGET_HEIGHT: 1080,
    IMAGE_QUALITY_HD: 0.92,
    IMAGE_QUALITY_COMPRESSED: 0.8,
    IMAGE_TARGET_SIZE_KB: 200,
    DEBOUNCE_DELAY: 300,
    TOAST_DURATION: 3000,
    AUTOCOMPLETE_MAX_RESULTS: 8
};

/* ============================================================================
 * UTILITIES
 * ============================================================================ */
const PhotoAuditUtils = {
    $: (selector, ctx = document) => ctx.querySelector(selector),
    $$: (selector, ctx = document) => Array.from(ctx.querySelectorAll(selector)),
    createElement(tag, attrs = {}, innerHTML = '') {
        const el = document.createElement(tag);
        Object.entries(attrs).forEach(([k, v]) => {
            if (k === 'class') {
                el.className = v;
            } else if (k === 'style' && typeof v === 'object') {
                Object.assign(el.style, v);
            } else {
                el.setAttribute(k, v);
            }
        });
        if (innerHTML) el.innerHTML = innerHTML;
        return el;
    },
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },
    formatDateJP() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}年${m}月${day}日`;
    },
    nowISO: () => new Date().toISOString(),
    formatDateTime(date = new Date()) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const h = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${y}/${m}/${d} ${h}:${min}`;
    },
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    isValidEmail(email) {
        const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return regex.test(email);
    },
    normalizeText(text) {
        if (!text) return '';
        return text
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }
};

/* ============================================================================
 * ✅ SUPABASE CLIENT - CORRECT PROJECT
 * ============================================================================ */
const SupabasePhotoClient = {
    config: {
        url: 'https://bgpnhvhouplvekaaheqy.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJncG5odmhvdXBsdmVrYWFoZXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE2NjAxOTIsImV4cCI6MjA1NzIzNjE5Mn0.0PJJUjGOjkcEMl-hQhajn0IW4pLQNUHDDAeprE5DG1w',
    },

    async uploadFile(bucket, fileName, blob) {
        console.log('📤 [Supabase] Uploading file:', {
            bucket,
            fileName,
            size: (blob.size / 1024).toFixed(2) + ' KB',
            type: blob.type
        });

        const formData = new FormData();
        formData.append('file', blob, fileName);
        const url = `${this.config.url}/storage/v1/object/${bucket}/${fileName}`;

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.anonKey}`,
                    'x-upsert': 'true'
                },
                body: formData
            });

            console.log('📤 [Supabase] Response status:', res.status, res.statusText);

            if (!res.ok) {
                let errorMsg;
                try {
                    const errorData = await res.json();
                    errorMsg = errorData.message || errorData.error || JSON.stringify(errorData);
                    console.error('❌ [Supabase] Error response:', errorData);
                } catch {
                    errorMsg = await res.text();
                    console.error('❌ [Supabase] Error text:', errorMsg);
                }

                if (res.status === 403) {
                    throw new Error(`アクセス拒否 / Access Denied (403)\n\n原因:\n- Bucket policy: Anonymous uploadが許可されていない\n- RLS (Row Level Security) が有効\n\n解決方法:\nSupabase Dashboard → Storage → mold-photos → Policies → Enable anonymous upload`);
                } else if (res.status === 404) {
                    throw new Error(`バケットが見つかりません / Bucket not found (404)\n\nBucket名: "${bucket}"\n\n解決方法:\nSupabase Dashboard → Storage → Create bucket: "${bucket}"`);
                } else if (res.status === 0 || errorMsg.includes('CORS')) {
                    throw new Error(`CORS エラー / CORS Error\n\n原因:\n- Browser blocked cross-origin request\n- Supabase CORS設定が不正\n\n解決方法:\nSupabase Dashboard → Settings → API → CORS Origins → Add: "*" or your domain`);
                } else {
                    throw new Error(`Upload失敗 (${res.status}): ${errorMsg}`);
                }
            }

            const result = await res.json();
            console.log('✅ [Supabase] Upload success:', result);
            return result;

        } catch (err) {
            if (err.message.includes('Failed to fetch')) {
                throw new Error(`ネットワークエラー / Network Error\n\n原因:\n1. インターネット接続なし\n2. Supabase サーバーダウン\n3. CORS policy blocked\n4. Firewall/VPN blocking request\n\n詳細: ${err.message}`);
            }
            throw err;
        }
    },

    getPublicUrl(bucket, fileName) {
        return `${this.config.url}/storage/v1/object/public/${bucket}/${fileName}`;
    },

    async callEdgeFunction(functionName, payload) {
        console.log('📡 [Supabase] Calling Edge Function:', functionName);
        console.log('📡 [Supabase] Payload:', payload);

        const url = `${this.config.url}/functions/v1/${functionName}`;

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.anonKey}`
                },
                body: JSON.stringify(payload)
            });

            console.log('📡 [Supabase] Function response:', res.status, res.statusText);

            if (!res.ok) {
                let errorMsg;
                try {
                    const errorData = await res.json();
                    errorMsg = errorData.message || errorData.error || JSON.stringify(errorData);
                    console.error('❌ [Supabase] Function error:', errorData);
                } catch {
                    errorMsg = await res.text();
                    console.error('❌ [Supabase] Error text:', errorMsg);
                }

                if (res.status === 404) {
                    throw new Error(`Edge Function "${functionName}" が見つかりません (404)\n\n確認:\n1. Function name: "${functionName}"\n2. Deployed: https://bgpnhvhouplvekaaheqy.supabase.co/functions/v1/${functionName}\n\n解決方法:\nSupabase Dashboard → Edge Functions → Deploy`);
                } else if (res.status === 500) {
                    throw new Error(`Edge Function実行エラー (500)\n\n原因:\n- Function内部エラー\n- Resend API key未設定\n- Email送信失敗\n\n詳細: ${errorMsg}`);
                } else {
                    throw new Error(`Function実行失敗 (${res.status}): ${errorMsg}`);
                }
            }

            const result = await res.json();
            console.log('✅ [Supabase] Function success:', result);
            return result;

        } catch (err) {
            if (err.message.includes('Failed to fetch')) {
                throw new Error(`Edge Function接続エラー\n\n原因:\n- Function未デプロイ: send-photo-audit\n- Network error\n- CORS blocked\n\n確認URL:\nhttps://bgpnhvhouplvekaaheqy.supabase.co/functions/v1/send-photo-audit\n\n詳細: ${err.message}`);
            }
            throw err;
        }
    }
};

/* ============================================================================
 * MAIN: PHOTO AUDIT TOOL
 * ============================================================================ */
const PhotoAuditTool = {
    state: {
        initialized: false,
        
        // Data from DataManager
        molds: [],
        employees: [],
        
        // Selection
        selectedMold: null, // { id, code, name }
        isManualMold: false,
        selectedEmployee: null, // { id, name }
        isManualEmployee: false,
        
        // Dimensions (auto-filled from mold data)
        dimensions: {
            length: '',
            width: '',
            depth: ''
        },
        dimensionsSource: {
            length: null, // 'designInfo' | 'molds' | 'manual'
            width: null,
            depth: null
        },
        
        // Notes field
        notes: '',
        
        // Recipients
        recipients: [],
        
        // Camera
        stream: null,
        facingMode: 'environment',
        gridEnabled: false,
        
        // Photo
        photoBlob: null,
        photoSource: null, // 'camera' | 'file'
        
        // Image processing options
        resizeMode: 'hd', // 'hd' | 'compressed'
        
        // UI
        currentScreen: null, // 'settings' | 'camera' | 'preview'
        sending: false,
        
        // Autocomplete states
        moldAutocompleteVisible: false,
        employeeAutocompleteVisible: false,
        moldSearchResults: [],
        employeeSearchResults: []
    },

    els: {},

    /* ============================================================================
     * INITIALIZATION
     * ============================================================================ */
    init() {
        if (this.state.initialized) return;

        console.log('📷 [PhotoAuditTool v2.2.3] Initializing...');

        if (!window.DataManager || !window.DataManager.loaded) {
            console.warn('⏳ [PhotoAuditTool] DataManager not ready, waiting...');
            document.addEventListener('data-manager:ready', () => this.init(), { once: true });
            return;
        }

        this.loadData();
        this.buildUI();
        this.bindGlobalHooks();

        this.state.initialized = true;
        console.log('✅ [PhotoAuditTool v2.2.3] Initialized successfully!');
        
        document.dispatchEvent(new CustomEvent('photoAuditTool:ready', {
            detail: { version: '2.2.3' }
        }));
    },

    /* ============================================================================
     * LOAD DATA FROM DATAMANAGER
     * ============================================================================ */
    loadData() {
        const dm = window.DataManager.data;
        this.state.molds = dm.molds || [];
        this.state.employees = dm.employees || [];
        this.state.recipients = [...PHOTO_AUDIT_CONFIG.DEFAULT_RECIPIENTS];

        // Set default employee (Toan-san)
        const defaultEmp = this.state.employees.find(e =>
            String(e.EmployeeID).trim() === String(PHOTO_AUDIT_CONFIG.DEFAULT_EMPLOYEE_ID).trim()
        );

        if (defaultEmp) {
            this.state.selectedEmployee = {
                id: defaultEmp.EmployeeID,
                name: defaultEmp.EmployeeNameShort || defaultEmp.EmployeeName
            };
            this.state.isManualEmployee = false;
        }

        console.log('📊 [PhotoAuditTool] Data loaded:', {
            molds: this.state.molds.length,
            employees: this.state.employees.length,
            defaultEmployee: this.state.selectedEmployee?.name,
            defaultRecipients: this.state.recipients.length
        });
    },

    /* ============================================================================
     * BUILD UI
     * ============================================================================ */
    buildUI() {
        this.buildSettingsScreen();
        this.buildCameraScreen();
        this.buildPreviewScreen();
    },

    /* ============================================================================
     * BUILD SETTINGS SCREEN
     * ============================================================================ */
    buildSettingsScreen() {
        const { createElement: ce } = PhotoAuditUtils;

        // Root container
        const root = ce('div', {
            class: 'photo-audit-root pa-hidden',
            id: 'photo-audit-root'
        });

        // Backdrop
        const backdrop = ce('div', {
            class: 'pa-backdrop',
            id: 'pa-backdrop'
        });

        // Dialog
        const dialog = ce('div', { class: 'pa-dialog' });

        // === HEADER ===
        const header = ce('div', { class: 'pa-header' });
        header.innerHTML = `
            <div class="pa-title">
                <div class="ja">写真監査ツール</div>
                <div class="vi">Công cụ kiểm tra ảnh khuôn</div>
            </div>
            <button class="pa-close" id="pa-btn-close-settings" aria-label="Close">&times;</button>
        `;

        // === BODY ===
        const body = ce('div', { class: 'pa-body' });

        // === FORM CONTAINER ===
        const form = ce('div', { class: 'pa-form' });

        // ---- ROW 1: MOLD AUTOCOMPLETE ----
        const rowMold = ce('div', { class: 'pa-form-row' });
        rowMold.innerHTML = `
            <label class="pa-label">
                <span class="ja">金型選択</span>
                <span class="vi">Chọn mã khuôn</span>
                <span class="required">*</span>
            </label>
            <div class="pa-input-with-badge">
                <div class="pa-autocomplete-wrapper">
                    <input
                        type="text"
                        class="pa-input pa-autocomplete-input"
                        id="pa-mold-input"
                        placeholder="🔍 Nhập mã khuôn để tìm kiếm..."
                        autocomplete="off"
                    />
                    <div class="pa-autocomplete-dropdown pa-hidden" id="pa-mold-dropdown"></div>
                </div>
                <span class="pa-input-badge pa-hidden" id="pa-mold-badge"></span>
            </div>
        `;

        // ---- ROW 2: EMPLOYEE AUTOCOMPLETE ----
        const rowEmployee = ce('div', { class: 'pa-form-row' });
        rowEmployee.innerHTML = `
            <label class="pa-label">
                <span class="ja">撮影者</span>
                <span class="vi">Người chụp</span>
                <span class="required">*</span>
            </label>
            <div class="pa-input-with-badge">
                <div class="pa-autocomplete-wrapper">
                    <input
                        type="text"
                        class="pa-input pa-autocomplete-input"
                        id="pa-employee-input"
                        placeholder="🔍 Nhập tên người chụp..."
                        autocomplete="off"
                    />
                    <div class="pa-autocomplete-dropdown pa-hidden" id="pa-employee-dropdown"></div>
                </div>
                <span class="pa-input-badge pa-hidden" id="pa-employee-badge"></span>
            </div>
        `;

        // ---- ROW 3: DIMENSIONS (3 columns) ----
        const rowDimensions = ce('div', { class: 'pa-form-row pa-form-row-triple' });
        rowDimensions.innerHTML = `
            <div class="pa-form-col">
                <label class="pa-label">
                    <span class="ja">長さ</span>
                    <span class="vi">Length (mm)</span>
                </label>
                <input type="number" class="pa-input pa-dim-input" id="pa-dim-length" placeholder="mm" step="0.1" />
            </div>
            <div class="pa-form-col">
                <label class="pa-label">
                    <span class="ja">幅</span>
                    <span class="vi">Width (mm)</span>
                </label>
                <input type="number" class="pa-input pa-dim-input" id="pa-dim-width" placeholder="mm" step="0.1" />
            </div>
            <div class="pa-form-col">
                <label class="pa-label">
                    <span class="ja">深さ</span>
                    <span class="vi">Depth (mm)</span>
                </label>
                <input type="number" class="pa-input pa-dim-input" id="pa-dim-depth" placeholder="mm" step="0.1" />
            </div>
        `;

        // ---- ROW 4: NOTES ----
        const rowNotes = ce('div', { class: 'pa-form-row' });
        rowNotes.innerHTML = `
            <label class="pa-label">
                <span class="ja">備考</span>
                <span class="vi">Ghi chú</span>
            </label>
            <textarea
                class="pa-textarea"
                id="pa-notes"
                rows="2"
                placeholder="Nhập ghi chú thêm (nếu có)..."
            ></textarea>
        `;

        // ---- ROW 5: RECIPIENTS ----
        const rowRecipients = ce('div', { class: 'pa-form-row' });
        rowRecipients.innerHTML = `
            <label class="pa-label">
                <span class="ja">送信先</span>
                <span class="vi">Email recipients</span>
            </label>
            <div class="pa-recipient-list" id="pa-recipient-list"></div>
            <div class="pa-recipient-input-group">
                <input
                    type="email"
                    class="pa-input pa-recipient-input"
                    id="pa-recipient-input"
                    placeholder="example@ysd-pack.co.jp"
                />
                <button class="pa-btn pa-btn-icon" id="pa-btn-add-recipient" title="Add recipient">
                    <i class="fas fa-plus"></i>
                </button>
            </div>
        `;

        // Assemble form
        form.appendChild(rowMold);
        form.appendChild(rowEmployee);
        form.appendChild(rowDimensions);
        form.appendChild(rowNotes);
        form.appendChild(rowRecipients);
        body.appendChild(form);

        // === FOOTER ===
        const footer = ce('div', { class: 'pa-footer' });
        footer.innerHTML = `
            <button class="pa-btn pa-btn-secondary" id="pa-btn-cancel">
                <i class="fas fa-times"></i>
                <span>Cancel</span>
            </button>
            <button class="pa-btn pa-btn-primary" id="pa-btn-open-camera">
                <i class="fas fa-camera"></i>
                <span>Camera</span>
            </button>
            <button class="pa-btn pa-btn-secondary" id="pa-btn-upload-file">
                <i class="fas fa-file-upload"></i>
                <span>Upload</span>
            </button>
        `;

        // File input (hidden)
        const fileInput = ce('input', {
            type: 'file',
            class: 'pa-file-input',
            id: 'pa-file-input',
            accept: 'image/*'
        });

        // Assemble dialog
        dialog.appendChild(header);
        dialog.appendChild(body);
        dialog.appendChild(footer);
        dialog.appendChild(fileInput);

        root.appendChild(backdrop);
        root.appendChild(dialog);
        document.body.appendChild(root);

        // Cache elements
        this.els.root = root;
        this.els.backdrop = backdrop;
        this.els.dialog = dialog;
        this.els.moldInput = PhotoAuditUtils.$('#pa-mold-input');
        this.els.moldDropdown = PhotoAuditUtils.$('#pa-mold-dropdown');
        this.els.moldBadge = PhotoAuditUtils.$('#pa-mold-badge');
        this.els.employeeInput = PhotoAuditUtils.$('#pa-employee-input');
        this.els.employeeDropdown = PhotoAuditUtils.$('#pa-employee-dropdown');
        this.els.employeeBadge = PhotoAuditUtils.$('#pa-employee-badge');
        this.els.dimLength = PhotoAuditUtils.$('#pa-dim-length');
        this.els.dimWidth = PhotoAuditUtils.$('#pa-dim-width');
        this.els.dimDepth = PhotoAuditUtils.$('#pa-dim-depth');
        this.els.notes = PhotoAuditUtils.$('#pa-notes');
        this.els.recipientList = PhotoAuditUtils.$('#pa-recipient-list');
        this.els.recipientInput = PhotoAuditUtils.$('#pa-recipient-input');
        this.els.fileInput = PhotoAuditUtils.$('#pa-file-input');

        // Populate default employee
        if (this.state.selectedEmployee) {
            this.els.employeeInput.value = this.state.selectedEmployee.name;
            this.updateEmployeeBadge();
        }

        this.renderRecipientList();
        this.bindSettingsEvents();
    },

    /* ============================================================================
     * ✅ UPDATE MOLD BADGE (Auto/Manual)
     * ============================================================================ */
    updateMoldBadge() {
        if (!this.els.moldBadge) return;

        if (this.state.selectedMold && !this.state.isManualMold) {
            // Auto-selected from database
            this.els.moldBadge.textContent = '自動 / Auto';
            this.els.moldBadge.className = 'pa-input-badge pa-badge-auto';
        } else if (this.state.isManualMold) {
            // Manual input
            this.els.moldBadge.textContent = '手動 / Manual';
            this.els.moldBadge.className = 'pa-input-badge pa-badge-manual';
        } else {
            // Empty
            this.els.moldBadge.classList.add('pa-hidden');
        }
    },

    /* ============================================================================
     * ✅ UPDATE EMPLOYEE BADGE (Auto/Manual)
     * ============================================================================ */
    updateEmployeeBadge() {
        if (!this.els.employeeBadge) return;

        if (this.state.selectedEmployee && !this.state.isManualEmployee) {
            // Auto-selected from database
            this.els.employeeBadge.textContent = '自動 / Auto';
            this.els.employeeBadge.className = 'pa-input-badge pa-badge-auto';
        } else if (this.state.isManualEmployee) {
            // Manual input
            this.els.employeeBadge.textContent = '手動 / Manual';
            this.els.employeeBadge.className = 'pa-input-badge pa-badge-manual';
        } else {
            // Empty
            this.els.employeeBadge.classList.add('pa-hidden');
        }
    },

    /* ============================================================================
     * BIND SETTINGS EVENTS
     * ============================================================================ */
    bindSettingsEvents() {
        // Close buttons
        PhotoAuditUtils.$('#pa-btn-close-settings').addEventListener('click', (e) => {
            e.preventDefault();
            this.closeSettings();
        });

        PhotoAuditUtils.$('#pa-btn-cancel').addEventListener('click', (e) => {
            e.preventDefault();
            this.closeSettings();
        });

        // Backdrop click to close
        this.els.backdrop.addEventListener('click', () => {
            this.closeSettings();
        });

        // === MOLD AUTOCOMPLETE ===
        this.els.moldInput.addEventListener('input', PhotoAuditUtils.debounce(() => {
            const value = this.els.moldInput.value.trim();
            if (!value) {
                this.state.selectedMold = null;
                this.state.isManualMold = false;
                this.updateMoldBadge();
                this.clearDimensions();
                this.hideMoldAutocomplete();
                return;
            }

            // Check if manually typing or selected
            const exactMatch = this.state.molds.find(m =>
                m.MoldCode === value || m.MoldName === value
            );

            if (!exactMatch) {
                this.state.isManualMold = true;
                this.state.selectedMold = null;
            }

            this.updateMoldBadge();
            this.handleMoldAutocomplete();
        }, PHOTO_AUDIT_CONFIG.DEBOUNCE_DELAY));

        this.els.moldInput.addEventListener('focus', () => {
            if (this.els.moldInput.value.trim()) {
                this.handleMoldAutocomplete();
            }
        });

        // === EMPLOYEE AUTOCOMPLETE ===
        this.els.employeeInput.addEventListener('input', PhotoAuditUtils.debounce(() => {
            const value = this.els.employeeInput.value.trim();
            if (!value) {
                this.state.selectedEmployee = null;
                this.state.isManualEmployee = false;
                this.updateEmployeeBadge();
                this.hideEmployeeAutocomplete();
                return;
            }

            // Check if manually typing or selected
            const exactMatch = this.state.employees.find(e =>
                (e.EmployeeNameShort || e.EmployeeName) === value
            );

            if (!exactMatch) {
                this.state.isManualEmployee = true;
                this.state.selectedEmployee = { id: null, name: value };
            }

            this.updateEmployeeBadge();
            this.handleEmployeeAutocomplete();
        }, PHOTO_AUDIT_CONFIG.DEBOUNCE_DELAY));

        this.els.employeeInput.addEventListener('focus', () => {
            if (this.els.employeeInput.value.trim() && !this.state.selectedEmployee) {
                this.handleEmployeeAutocomplete();
            }
        });

        // === DIMENSIONS ===
        this.els.dimLength.addEventListener('input', (e) => {
            this.state.dimensions.length = e.target.value.trim();
            if (this.state.dimensionsSource.length !== 'manual' && e.target.value) {
                this.state.dimensionsSource.length = 'manual';
                e.target.classList.add('manual-edit');
            }
        });

        this.els.dimWidth.addEventListener('input', (e) => {
            this.state.dimensions.width = e.target.value.trim();
            if (this.state.dimensionsSource.width !== 'manual' && e.target.value) {
                this.state.dimensionsSource.width = 'manual';
                e.target.classList.add('manual-edit');
            }
        });

        this.els.dimDepth.addEventListener('input', (e) => {
            this.state.dimensions.depth = e.target.value.trim();
            if (this.state.dimensionsSource.depth !== 'manual' && e.target.value) {
                this.state.dimensionsSource.depth = 'manual';
                e.target.classList.add('manual-edit');
            }
        });

        // === NOTES ===
        this.els.notes.addEventListener('input', (e) => {
            this.state.notes = e.target.value.trim();
        });

        // === RECIPIENTS ===
        PhotoAuditUtils.$('#pa-btn-add-recipient').addEventListener('click', (e) => {
            e.preventDefault();
            this.addRecipient();
        });

        this.els.recipientInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addRecipient();
            }
        });

        // === ACTIONS ===
        PhotoAuditUtils.$('#pa-btn-open-camera').addEventListener('click', (e) => {
            e.preventDefault();
            if (this.validateSettings()) {
                this.closeSettings();
                this.openCamera();
            }
        });

        PhotoAuditUtils.$('#pa-btn-upload-file').addEventListener('click', (e) => {
            e.preventDefault();
            if (this.validateSettings()) {
                this.els.fileInput.click();
            }
        });

        this.els.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                this.handleFileUpload(file);
            }
        });

        // Click outside dropdown to close
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.pa-autocomplete-wrapper')) {
                this.hideAllAutocomplete();
            }
        });
    },
    /* ============================================================================
     * HANDLE MOLD AUTOCOMPLETE
     * ============================================================================ */
    handleMoldAutocomplete() {
        const query = this.els.moldInput.value.trim();
        if (!query) {
            this.hideMoldAutocomplete();
            return;
        }

        const normalized = PhotoAuditUtils.normalizeText(query);
        const results = this.state.molds
            .filter(mold => {
                const code = PhotoAuditUtils.normalizeText(mold.MoldCode || '');
                const name = PhotoAuditUtils.normalizeText(mold.MoldName || '');
                return code.includes(normalized) || name.includes(normalized);
            })
            .slice(0, PHOTO_AUDIT_CONFIG.AUTOCOMPLETE_MAX_RESULTS);

        this.state.moldSearchResults = results;
        this.renderMoldAutocomplete(results);
    },

    renderMoldAutocomplete(results) {
        const { escapeHtml: e } = PhotoAuditUtils;
        const dropdown = this.els.moldDropdown;

        if (results.length === 0) {
            dropdown.innerHTML = '<div class="pa-autocomplete-empty">結果なし / No results</div>';
            dropdown.classList.remove('pa-hidden');
            return;
        }

        dropdown.innerHTML = '';
        results.forEach(mold => {
            const item = document.createElement('div');
            item.className = 'pa-autocomplete-item';

            const code = mold.MoldCode || `(ID:${mold.MoldID})`;
            const name = mold.MoldName || '';

            // Get dimensions from designInfo
            let dim = '';
            if (mold.designInfo) {
                const l = mold.designInfo.MoldDesignLength || mold.designInfo.Length;
                const w = mold.designInfo.MoldDesignWidth || mold.designInfo.Width;
                const d = mold.designInfo.MoldDesignDepth || mold.designInfo.Depth || mold.designInfo.MoldDesignHeight;
                if (l || w || d) {
                    dim = `${l || '?'}×${w || '?'}×${d || '?'}`;
                }
            }

            item.innerHTML = `
                <div class="pa-autocomplete-item-main">${e(code)}</div>
                <div class="pa-autocomplete-item-sub">${e(name)} ${dim ? `<span class="pa-dim-tag">${e(dim)}</span>` : ''}</div>
            `;

            item.addEventListener('click', () => {
                this.selectMold(mold);
            });

            dropdown.appendChild(item);
        });

        dropdown.classList.remove('pa-hidden');
    },

    selectMold(mold) {
        this.state.selectedMold = {
            id: mold.MoldID,
            code: mold.MoldCode,
            name: mold.MoldName
        };
        this.state.isManualMold = false;

        // Update input
        this.els.moldInput.value = mold.MoldCode || mold.MoldName || `ID:${mold.MoldID}`;

        // Update badge
        this.updateMoldBadge();

        // Auto-fill dimensions
        this.loadDimensionsForMold(mold);
        this.hideMoldAutocomplete();

        console.log('✅ Mold selected:', this.state.selectedMold);
    },

    /* ============================================================================
     * ✅ LOAD DIMENSIONS - PRIORITY LOGIC
     * Priority: designInfo → MoldModified → Mold
     * ============================================================================ */
    loadDimensionsForMold(mold) {
        console.log('📐 [PhotoAuditTool] Loading dimensions for mold:', mold.MoldCode);

        let length = '', width = '', depth = '';
        let lengthSrc = null, widthSrc = null, depthSrc = null;

        // Priority 1: designInfo from enriched data
        const design = mold.designInfo;
        if (design) {
            if (design.MoldDesignLength || design.Length) {
                length = String(design.MoldDesignLength || design.Length);
                lengthSrc = 'designInfo';
            }
            if (design.MoldDesignWidth || design.Width) {
                width = String(design.MoldDesignWidth || design.Width);
                widthSrc = 'designInfo';
            }
            if (design.MoldDesignDepth || design.Depth || design.MoldDesignHeight) {
                depth = String(design.MoldDesignDepth || design.Depth || design.MoldDesignHeight);
                depthSrc = 'designInfo';
            }
        }

        // Priority 2: mold Modified fields
        if (!length && mold.MoldLengthModified) {
            length = String(mold.MoldLengthModified);
            lengthSrc = 'molds';
        }
        if (!width && mold.MoldWidthModified) {
            width = String(mold.MoldWidthModified);
            widthSrc = 'molds';
        }
        if (!depth && (mold.MoldHeightModified || mold.MoldDepthModified)) {
            depth = String(mold.MoldHeightModified || mold.MoldDepthModified);
            depthSrc = 'molds';
        }

        // Priority 3: mold original fields
        if (!length && mold.MoldLength) {
            length = String(mold.MoldLength);
            lengthSrc = 'molds';
        }
        if (!width && mold.MoldWidth) {
            width = String(mold.MoldWidth);
            widthSrc = 'molds';
        }
        if (!depth && (mold.MoldHeight || mold.MoldDepth)) {
            depth = String(mold.MoldHeight || mold.MoldDepth);
            depthSrc = 'molds';
        }

        this.state.dimensions = { length, width, depth };
        this.state.dimensionsSource = {
            length: lengthSrc,
            width: widthSrc,
            depth: depthSrc
        };

        this.updateDimensionInputs();

        console.log('✅ Dimensions loaded:', {
            dimensions: this.state.dimensions,
            sources: this.state.dimensionsSource
        });
    },

    updateDimensionInputs() {
        const inputs = {
            length: this.els.dimLength,
            width: this.els.dimWidth,
            depth: this.els.dimDepth
        };

        Object.keys(inputs).forEach(key => {
            const input = inputs[key];
            const value = this.state.dimensions[key];
            const source = this.state.dimensionsSource[key];

            input.value = value;
            input.classList.remove('auto-filled', 'manual-edit');

            if (source && source !== 'manual') {
                input.classList.add('auto-filled');
            }
        });
    },

    clearDimensions() {
        this.state.dimensions = { length: '', width: '', depth: '' };
        this.state.dimensionsSource = { length: null, width: null, depth: null };

        [this.els.dimLength, this.els.dimWidth, this.els.dimDepth].forEach(input => {
            input.value = '';
            input.classList.remove('auto-filled', 'manual-edit');
        });
    },

    /* ============================================================================
     * HANDLE EMPLOYEE AUTOCOMPLETE
     * ============================================================================ */
    handleEmployeeAutocomplete() {
        const query = this.els.employeeInput.value.trim();
        if (!query) {
            this.hideEmployeeAutocomplete();
            return;
        }

        const normalized = PhotoAuditUtils.normalizeText(query);
        const results = this.state.employees
            .filter(emp => {
                const name = PhotoAuditUtils.normalizeText(emp.EmployeeName || '');
                const nameShort = PhotoAuditUtils.normalizeText(emp.EmployeeNameShort || '');
                return name.includes(normalized) || nameShort.includes(normalized);
            })
            .slice(0, PHOTO_AUDIT_CONFIG.AUTOCOMPLETE_MAX_RESULTS);

        this.state.employeeSearchResults = results;
        this.renderEmployeeAutocomplete(results);
    },

    renderEmployeeAutocomplete(results) {
        const { escapeHtml: e } = PhotoAuditUtils;
        const dropdown = this.els.employeeDropdown;

        if (results.length === 0) {
            dropdown.innerHTML = '<div class="pa-autocomplete-empty">結果なし / No results</div>';
            dropdown.classList.remove('pa-hidden');
            return;
        }

        dropdown.innerHTML = '';
        results.forEach(emp => {
            const item = document.createElement('div');
            item.className = 'pa-autocomplete-item';

            const name = emp.EmployeeNameShort || emp.EmployeeName || `(ID:${emp.EmployeeID})`;

            item.innerHTML = `
                <div class="pa-autocomplete-item-main">${e(name)}</div>
            `;

            item.addEventListener('click', () => {
                this.selectEmployee(emp);
            });

            dropdown.appendChild(item);
        });

        dropdown.classList.remove('pa-hidden');
    },

    selectEmployee(emp) {
        this.state.selectedEmployee = {
            id: emp.EmployeeID,
            name: emp.EmployeeNameShort || emp.EmployeeName
        };
        this.state.isManualEmployee = false;

        this.els.employeeInput.value = this.state.selectedEmployee.name;
        this.updateEmployeeBadge();
        this.hideEmployeeAutocomplete();

        console.log('✅ Employee selected:', this.state.selectedEmployee);
    },

    /* ============================================================================
     * HIDE AUTOCOMPLETE DROPDOWNS
     * ============================================================================ */
    hideMoldAutocomplete() {
        this.els.moldDropdown.classList.add('pa-hidden');
    },

    hideEmployeeAutocomplete() {
        this.els.employeeDropdown.classList.add('pa-hidden');
    },

    hideAllAutocomplete() {
        this.hideMoldAutocomplete();
        this.hideEmployeeAutocomplete();
    },

    /* ============================================================================
     * RECIPIENT MANAGEMENT
     * ============================================================================ */
    addRecipient() {
        const email = this.els.recipientInput.value.trim();

        if (!email) {
            this.showToast('メールアドレスを入力してください / Enter email', 'warning');
            return;
        }

        if (!PhotoAuditUtils.isValidEmail(email)) {
            this.showToast('無効なメールアドレス / Invalid email', 'error');
            return;
        }

        if (this.state.recipients.includes(email)) {
            this.showToast('既に追加されています / Already added', 'warning');
            return;
        }

        this.state.recipients.push(email);
        this.els.recipientInput.value = '';
        this.renderRecipientList();
    },

    removeRecipient(email) {
        this.state.recipients = this.state.recipients.filter(r => r !== email);
        this.renderRecipientList();
    },

    renderRecipientList() {
        const { createElement: ce, escapeHtml: e } = PhotoAuditUtils;
        const container = this.els.recipientList;
        container.innerHTML = '';

        if (this.state.recipients.length === 0) {
            container.innerHTML = `
                <div class="pa-empty-state">
                    <i class="fas fa-inbox"></i>
                    <span>受信者なし / No recipients</span>
                </div>
            `;
            return;
        }

        this.state.recipients.forEach(email => {
            const tag = ce('div', { class: 'pa-recipient-tag' });
            tag.innerHTML = `
                <span>${e(email)}</span>
                <button class="pa-recipient-remove" data-email="${e(email)}">
                    <i class="fas fa-times"></i>
                </button>
            `;

            tag.querySelector('.pa-recipient-remove').addEventListener('click', (ev) => {
                ev.preventDefault();
                this.removeRecipient(email);
            });

            container.appendChild(tag);
        });
    },

    /* ============================================================================
     * VALIDATE SETTINGS
     * ============================================================================ */
    validateSettings() {
        // Check mold (accept manual)
        const moldValue = this.els.moldInput.value.trim();
        if (!moldValue) {
            this.showToast('金型を選択してください / Select mold', 'error');
            this.els.moldInput.focus();
            return false;
        }

        // Check employee (accept manual)
        const empValue = this.els.employeeInput.value.trim();
        if (!empValue) {
            this.showToast('撮影者を選択してください / Select employee', 'error');
            this.els.employeeInput.focus();
            return false;
        }

        // Check recipients
        if (this.state.recipients.length === 0) {
            this.showToast('受信者を追加してください / Add recipients', 'error');
            return false;
        }

        return true;
    },

    /* ============================================================================
     * ✅ HANDLE FILE UPLOAD (INDEPENDENT)
     * ============================================================================ */
    async handleFileUpload(file) {
        console.log('📁 [PhotoAuditTool] File selected:', file.name, file.size);

        if (!file.type.startsWith('image/')) {
            this.showToast('画像ファイルを選択してください / Select image file', 'error');
            return;
        }

        if (file.size > PHOTO_AUDIT_CONFIG.IMAGE_MAX_SIZE) {
            this.showToast('ファイルサイズが大きすぎます / File too large (max 10MB)', 'error');
            return;
        }

        try {
            // Read file as blob (keep original metadata)
            this.state.photoBlob = file;
            this.state.photoSource = 'file';

            console.log('✅ File loaded successfully');

            // Close settings and open preview
            this.closeSettings();
            this.openPreviewScreen();

        } catch (err) {
            console.error('❌ [PhotoAuditTool] File processing error:', err);
            this.showToast('ファイル処理エラー / File processing error', 'error');
        }
    },

    /* ============================================================================
     * BUILD CAMERA SCREEN
     * ============================================================================ */
    buildCameraScreen() {
        const { createElement: ce } = PhotoAuditUtils;

        const overlay = ce('div', {
            class: 'pa-camera-overlay pa-hidden',
            id: 'pa-camera-overlay'
        });

        const camera = ce('div', { class: 'pa-camera-screen' });

        const header = ce('div', { class: 'pa-camera-header' });
        header.innerHTML = `
            <button class="pa-btn-camera-close" id="pa-btn-close-camera">
                <i class="fas fa-arrow-left"></i>
            </button>
            <div class="pa-camera-title">
                <span class="ja">写真撮影</span>
                <span class="vi">Photo Capture</span>
            </div>
            <div></div>
        `;

        const viewportWrapper = ce('div', { class: 'pa-camera-viewport' });

        const video = ce('video', {
            class: 'pa-camera-video',
            id: 'pa-camera-video',
            autoplay: true,
            playsinline: true,
            muted: true
        });

        const canvas = ce('canvas', {
            class: 'pa-camera-canvas pa-hidden',
            id: 'pa-camera-canvas'
        });

        const gridOverlay = ce('div', {
            class: 'pa-camera-grid pa-hidden',
            id: 'pa-camera-grid'
        });
        gridOverlay.innerHTML = `
            <div class="grid-line grid-v1"></div>
            <div class="grid-line grid-v2"></div>
            <div class="grid-line grid-h1"></div>
            <div class="grid-line grid-h2"></div>
        `;

        viewportWrapper.appendChild(video);
        viewportWrapper.appendChild(canvas);
        viewportWrapper.appendChild(gridOverlay);

        const controls = ce('div', { class: 'pa-camera-controls' });
        controls.innerHTML = `
            <button class="pa-btn-flip" id="pa-btn-flip-camera" title="Flip camera">
                <i class="fas fa-sync-alt"></i>
            </button>
            <button class="pa-btn-capture" id="pa-btn-capture" title="Capture">
                <i class="fas fa-camera"></i>
            </button>
            <button class="pa-btn-grid-toggle" id="pa-btn-grid-toggle" title="Toggle grid">
                <i class="fas fa-th"></i>
            </button>
        `;

        camera.appendChild(header);
        camera.appendChild(viewportWrapper);
        camera.appendChild(controls);

        overlay.appendChild(camera);
        document.body.appendChild(overlay);

        this.els.cameraOverlay = overlay;
        this.els.cameraModal = camera;
        this.els.video = video;
        this.els.canvas = canvas;
        this.els.gridOverlay = gridOverlay;
        this.els.cameraControls = controls;

        this.bindCameraEvents();
    },

    bindCameraEvents() {
        PhotoAuditUtils.$('#pa-btn-close-camera').addEventListener('click', (e) => {
            e.preventDefault();
            this.closeCamera();
        });

        PhotoAuditUtils.$('#pa-btn-flip-camera').addEventListener('click', (e) => {
            e.preventDefault();
            this.flipCamera();
        });

        PhotoAuditUtils.$('#pa-btn-grid-toggle').addEventListener('click', (e) => {
            e.preventDefault();
            this.toggleGrid();
        });

        PhotoAuditUtils.$('#pa-btn-capture').addEventListener('click', (e) => {
            e.preventDefault();
            this.capturePhoto();
        });
    },

    async openCamera() {
        console.log('📷 [PhotoAuditTool] Opening camera...');

        this.state.currentScreen = 'camera';
        this.els.cameraOverlay.classList.remove('pa-hidden');
        this.els.video.classList.remove('pa-hidden');
        this.els.canvas.classList.add('pa-hidden');
        document.body.style.overflow = 'hidden';

        try {
            await this.startCameraStream();
        } catch (err) {
            console.error('❌ [PhotoAuditTool] Camera error:', err);
            this.showToast('カメラエラー / Camera error', 'error');
            this.closeCamera();
        }
    },

    async startCameraStream() {
        if (this.state.stream) {
            this.stopCameraStream();
        }

        const constraints = {
            video: {
                facingMode: this.state.facingMode,
                width: { ideal: PHOTO_AUDIT_CONFIG.IMAGE_TARGET_WIDTH },
                height: { ideal: PHOTO_AUDIT_CONFIG.IMAGE_TARGET_HEIGHT }
            },
            audio: false
        };

        try {
            this.state.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.els.video.srcObject = this.state.stream;
            await this.els.video.play();
            console.log('✅ Camera stream started');
        } catch (err) {
            console.error('❌ getUserMedia error:', err);
            throw err;
        }
    },

    stopCameraStream() {
        if (this.state.stream) {
            this.state.stream.getTracks().forEach(track => track.stop());
            this.state.stream = null;
            this.els.video.srcObject = null;
            console.log('🛑 Camera stream stopped');
        }
    },

    async flipCamera() {
        this.state.facingMode = this.state.facingMode === 'environment' ? 'user' : 'environment';
        console.log('🔄 Flipping camera to:', this.state.facingMode);
        await this.startCameraStream();
    },

    toggleGrid() {
        this.state.gridEnabled = !this.state.gridEnabled;
        if (this.state.gridEnabled) {
            this.els.gridOverlay.classList.remove('pa-hidden');
        } else {
            this.els.gridOverlay.classList.add('pa-hidden');
        }
        console.log('🎯 Grid toggled:', this.state.gridEnabled);
    },

    capturePhoto() {
        const video = this.els.video;
        const canvas = this.els.canvas;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob((blob) => {
            this.state.photoBlob = blob;
            this.state.photoSource = 'camera';

            console.log('📸 Photo captured:', {
                width: canvas.width,
                height: canvas.height,
                size: (blob.size / 1024).toFixed(2) + ' KB'
            });

            this.closeCamera();
            this.openPreviewScreen();
        }, 'image/jpeg', 0.95);
    },

    closeCamera() {
        this.stopCameraStream();
        this.els.cameraOverlay.classList.add('pa-hidden');
        document.body.style.overflow = '';
        this.state.currentScreen = null;
        console.log('📷 Camera closed');
    },

    /* ============================================================================
     * BUILD PREVIEW SCREEN
     * ============================================================================ */
    buildPreviewScreen() {
        const { createElement: ce } = PhotoAuditUtils;

        const overlay = ce('div', {
            class: 'pa-preview-overlay pa-hidden',
            id: 'pa-preview-overlay'
        });

        const preview = ce('div', { class: 'pa-preview-screen' });

        // Header
        const header = ce('div', { class: 'pa-preview-header' });
        header.innerHTML = `
            <button class="pa-btn-preview-close" id="pa-btn-close-preview">
                <i class="fas fa-arrow-left"></i>
            </button>
            <div class="pa-preview-title">
                <span class="ja">プレビュー</span>
                <span class="vi">Preview</span>
            </div>
            <div></div>
        `;

        // Image container
        const imageContainer = ce('div', { class: 'pa-preview-image-container' });
        const img = ce('img', {
            class: 'pa-preview-image',
            id: 'pa-preview-image',
            alt: 'Preview'
        });
        imageContainer.appendChild(img);

        // Resize options
        const resizeOptions = ce('div', { class: 'pa-resize-options' });
        resizeOptions.innerHTML = `
            <label class="pa-resize-label">
                <input type="radio" name="resize-mode" value="hd" id="pa-resize-hd" checked />
                <span class="pa-resize-option">
                    <i class="fas fa-image"></i>
                    <span class="ja">HD (1920×1080)</span>
                    <span class="vi">HD Quality</span>
                </span>
            </label>
            <label class="pa-resize-label">
                <input type="radio" name="resize-mode" value="compressed" id="pa-resize-compressed" />
                <span class="pa-resize-option">
                    <i class="fas fa-compress"></i>
                    <span class="ja">圧縮 (~200KB)</span>
                    <span class="vi">Compressed</span>
                </span>
            </label>
        `;

        // Footer buttons
        const footer = ce('div', { class: 'pa-preview-footer' });
        footer.innerHTML = `
            <button class="pa-btn pa-btn-secondary" id="pa-btn-preview-retake">
                <i class="fas fa-redo"></i>
                <span>Retake</span>
            </button>
            <button class="pa-btn pa-btn-primary" id="pa-btn-preview-send">
                <i class="fas fa-paper-plane"></i>
                <span>Send Email</span>
            </button>
        `;

        preview.appendChild(header);
        preview.appendChild(imageContainer);
        preview.appendChild(resizeOptions);
        preview.appendChild(footer);

        overlay.appendChild(preview);
        document.body.appendChild(overlay);

        this.els.previewOverlay = overlay;
        this.els.previewModal = preview;
        this.els.previewImage = img;
        this.els.resizeHd = PhotoAuditUtils.$('#pa-resize-hd');
        this.els.resizeCompressed = PhotoAuditUtils.$('#pa-resize-compressed');

        this.bindPreviewEvents();
    },

    bindPreviewEvents() {
        PhotoAuditUtils.$('#pa-btn-close-preview').addEventListener('click', (e) => {
            e.preventDefault();
            this.closePreview();
        });

        PhotoAuditUtils.$('#pa-btn-preview-retake').addEventListener('click', (e) => {
            e.preventDefault();
            this.retakePhoto();
        });

        PhotoAuditUtils.$('#pa-btn-preview-send').addEventListener('click', (e) => {
            e.preventDefault();
            this.sendEmail();
        });

        // Resize mode selection
        this.els.resizeHd.addEventListener('change', () => {
            this.state.resizeMode = 'hd';
            console.log('📐 Resize mode: HD');
        });

        this.els.resizeCompressed.addEventListener('change', () => {
            this.state.resizeMode = 'compressed';
            console.log('📐 Resize mode: Compressed');
        });
    },

    openPreviewScreen() {
        console.log('🔍 [PhotoAuditTool] Opening preview...');

        this.state.currentScreen = 'preview';
        this.els.previewOverlay.classList.remove('pa-hidden');
        document.body.style.overflow = 'hidden';

        // Display photo
        const url = URL.createObjectURL(this.state.photoBlob);
        this.els.previewImage.src = url;

        console.log('✅ Preview opened');
    },

    closePreview() {
        this.els.previewOverlay.classList.add('pa-hidden');
        document.body.style.overflow = '';
        this.state.currentScreen = null;

        // Revoke object URL
        if (this.els.previewImage.src) {
            URL.revokeObjectURL(this.els.previewImage.src);
            this.els.previewImage.src = '';
        }

        console.log('🔍 Preview closed');
    },

    retakePhoto() {
        this.closePreview();

        if (this.state.photoSource === 'camera') {
            this.openCamera();
        } else {
            this.els.fileInput.click();
        }
    },

    /* ============================================================================
     * ✅ GENERATE MOLD CODE FROM NAME (FOR MANUAL INPUT)
     * ============================================================================ */
    generateMoldCodeFromName(moldName) {
        if (!moldName) return 'UNKNOWN';
        
        // Remove spaces, hyphens, special chars → uppercase
        return moldName
            .toString()
            .normalize('NFD')                         // Decompose Unicode
            .replace(/[\u0300-\u036f]/g, '')         // Remove diacritics
            .replace(/[đĐ]/g, 'd')                   // Vietnamese đ → d
            .replace(/[\s\-]/g, '')                  // Remove spaces & hyphens
            .replace(/[^a-zA-Z0-9]/g, '')            // Keep only alphanumeric
            .substring(0, 30)                        // Limit length
            .toUpperCase();
    },

    /* ============================================================================
     * ✅ GENERATE FILENAME (CAMERA VS FILE UPLOAD)
     * ============================================================================ */
    generateFileName() {
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
        
        // Get moldCode (auto or manual)
        let moldCode;
        if (this.state.selectedMold && !this.state.isManualMold) {
            // Auto-selected from database
            moldCode = this.state.selectedMold.code || 'UNKNOWN';
        } else {
            // Manual input → generate code from name
            const moldName = this.els.moldInput.value.trim();
            moldCode = this.generateMoldCodeFromName(moldName);
        }
        
        // Sanitize moldCode (remove special chars, spaces, hyphens)
        moldCode = moldCode
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .replace(/[\s\-]/g, '')                  // ✅ Remove spaces & hyphens
            .replace(/[^a-zA-Z0-9]/g, '')
            .substring(0, 20)
            .toUpperCase();
        
        if (!moldCode) moldCode = 'UNKNOWN';
        
        // ✅ FILE UPLOAD: Keep original filename
        if (this.state.photoSource === 'file' && this.state.photoBlob.name) {
            const originalName = this.state.photoBlob.name;
            const ext = originalName.substring(originalName.lastIndexOf('.'));
            const baseName = originalName.substring(0, originalName.lastIndexOf('.'))
                .replace(/[^a-zA-Z0-9\-_]/g, '_')    // Sanitize but keep structure
                .substring(0, 50);
            return `${baseName}${ext}`;
        }
        
        // ✅ CAMERA: moldcode-YYYYMMDD-HHMM.jpg
        return `${moldCode}-${dateStr}-${timeStr}.jpg`;
    },

    /* ============================================================================
     * ✅ SEND EMAIL - CORRECT PAYLOAD STRUCTURE
     * ============================================================================ */
    async sendEmail() {
        if (this.state.sending) return;

        if (!this.state.photoBlob) {
            this.showToast('写真がありません / No photo', 'error');
            return;
        }

        const btn = PhotoAuditUtils.$('#pa-btn-preview-send');
        btn.disabled = true;
        this.state.sending = true;

        btn.innerHTML = `
            <span class="pa-loading-spinner"></span>
            <span>送信中... / Sending...</span>
        `;

        try {
            // 1. Resize image
            console.log('📐 Resizing image to:', this.state.resizeMode);
            const processedBlob = await this.resizeImage(this.state.photoBlob, this.state.resizeMode);
            console.log('✅ Image resized:', (processedBlob.size / 1024).toFixed(2) + ' KB');

            // 2. Upload photo to Supabase Storage
            const fileName = this.generateFileName();
            
            console.log('📤 Starting upload...');
            await SupabasePhotoClient.uploadFile(
                PHOTO_AUDIT_CONFIG.STORAGE_BUCKET,
                fileName,
                processedBlob
            );

            const photoUrl = SupabasePhotoClient.getPublicUrl(
                PHOTO_AUDIT_CONFIG.STORAGE_BUCKET,
                fileName
            );

            console.log('✅ Photo uploaded:', photoUrl);

            // 3. ✅ PREPARE MOLD DATA (AUTO OR MANUAL)
            let moldCode, moldName, moldId;
            
            if (this.state.selectedMold && !this.state.isManualMold) {
                // Auto-selected from database
                moldCode = this.state.selectedMold.code || '';
                moldName = this.state.selectedMold.name || '';
                moldId = this.state.selectedMold.id || '';
            } else {
                // Manual input
                moldName = this.els.moldInput.value.trim();
                moldCode = this.generateMoldCodeFromName(moldName); // ✅ Generate from name
                moldId = '';
            }

            // 4. ✅ PREPARE EMPLOYEE DATA
            const employeeName = this.state.selectedEmployee?.name || this.els.employeeInput.value.trim();
            const employeeId = this.state.selectedEmployee?.id || '';

            // 5. ✅ PAYLOAD STRUCTURE - MATCH EDGE FUNCTION REQUIREMENTS
            const payload = {
                // ✅ REQUIRED FIELDS
                moldCode: moldCode,                          // ✅ BẮT BUỘC
                photoFileName: fileName,                     // ✅ BẮT BUỘC
                recipients: this.state.recipients,           // ✅ BẮT BUỘC
                
                // OPTIONAL FIELDS
                moldName: moldName || moldCode,
                moldId: moldId,
                dimensionL: this.state.dimensions.length || '',
                dimensionW: this.state.dimensions.width || '',
                dimensionD: this.state.dimensions.depth || '',
                employee: employeeName,
                employeeId: employeeId,
                date: PhotoAuditUtils.formatDateTime(),
                notes: this.state.notes || '',
                photoUrl: photoUrl
            };

            console.log('📧 Sending email with payload:', payload);

            // 6. ✅ Call Edge Function
            const result = await SupabasePhotoClient.callEdgeFunction('send-photo-audit', payload);

            console.log('✅ Email sent:', result);
            this.showToast('メール送信完了 / Email sent successfully', 'success');

            setTimeout(() => {
                this.closePreview();
                this.resetState();
            }, 1500);

        } catch (err) {
            console.error('❌ Send email error:', err);
            
            const errorMsg = err.message || 'Unknown error';
            this.showToast(`送信エラー / Send error:\n\n${errorMsg}`, 'error', 8000);
            
            btn.disabled = false;
            btn.innerHTML = `
                <i class="fas fa-paper-plane"></i>
                <span>Send Email</span>
            `;
        } finally {
            this.state.sending = false;
        }
    },

    /* ============================================================================
     * RESIZE IMAGE
     * ============================================================================ */
    async resizeImage(blob, mode) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(blob);

            img.onload = () => {
                URL.revokeObjectURL(url);

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                let width = img.width;
                let height = img.height;

                if (mode === 'hd') {
                    // HD mode: Max 1920×1080
                    const maxWidth = PHOTO_AUDIT_CONFIG.IMAGE_TARGET_WIDTH;
                    const maxHeight = PHOTO_AUDIT_CONFIG.IMAGE_TARGET_HEIGHT;

                    if (width > maxWidth || height > maxHeight) {
                        const ratio = Math.min(maxWidth / width, maxHeight / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob(
                        (resizedBlob) => {
                            console.log('✅ HD resize:', (resizedBlob.size / 1024).toFixed(2) + ' KB');
                            resolve(resizedBlob);
                        },
                        'image/jpeg',
                        PHOTO_AUDIT_CONFIG.IMAGE_QUALITY_HD
                    );

                } else {
                    // Compressed mode: Target ~200KB
                    const maxWidth = 1280;
                    const maxHeight = 720;

                    if (width > maxWidth || height > maxHeight) {
                        const ratio = Math.min(maxWidth / width, maxHeight / height);
                        width = Math.round(width * ratio);
                        height = Math.round(height * ratio);
                    }

                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);

                    // Try different quality levels to hit target size
                    let quality = PHOTO_AUDIT_CONFIG.IMAGE_QUALITY_COMPRESSED;
                    const targetSize = PHOTO_AUDIT_CONFIG.IMAGE_TARGET_SIZE_KB * 1024;

                    const tryCompress = (q) => {
                        canvas.toBlob((resizedBlob) => {
                            if (resizedBlob.size > targetSize && q > 0.5) {
                                tryCompress(q - 0.1);
                            } else {
                                console.log('✅ Compressed:', (resizedBlob.size / 1024).toFixed(2) + ' KB');
                                resolve(resizedBlob);
                            }
                        }, 'image/jpeg', q);
                    };

                    tryCompress(quality);
                }
            };

            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('画像の読み込みに失敗しました / Failed to load image'));
            };

            img.src = url;
        });
    },

    /* ============================================================================
     * SHOW TOAST
     * ============================================================================ */
    showToast(message, type = 'info', duration = PHOTO_AUDIT_CONFIG.TOAST_DURATION) {
        // Remove existing toasts
        const existing = document.querySelectorAll('.pa-toast');
        existing.forEach(t => t.remove());

        const toast = PhotoAuditUtils.createElement('div', {
            class: `pa-toast pa-toast-${type}`
        });

        // Icon
        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            warning: 'fa-exclamation-triangle',
            info: 'fa-info-circle'
        };

        toast.innerHTML = `
            <i class="fas ${icons[type] || icons.info}"></i>
            <span>${PhotoAuditUtils.escapeHtml(message).replace(/\n/g, '<br>')}</span>
        `;

        document.body.appendChild(toast);

        // Animate in
        setTimeout(() => toast.classList.add('pa-toast-show'), 10);

        // Auto-hide
        setTimeout(() => {
            toast.classList.remove('pa-toast-show');
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    /* ============================================================================
     * PUBLIC API - OPEN/CLOSE SETTINGS
     * ============================================================================ */
    openSettings(options = {}) {
        console.log('📷 [PhotoAuditTool] openSettings() called');

        if (!this.state.initialized) {
            console.warn('⚠️ Not initialized, initializing now...');
            this.init();
            setTimeout(() => this._openSettingsUI(options), 500);
            return;
        }

        this._openSettingsUI(options);
    },

    _openSettingsUI(options = {}) {
        // Pre-fill mold if passed from detail modal
        if (options.mold && options.type === 'mold') {
            const moldId = options.mold.MoldID;
            const mold = this.state.molds.find(m => String(m.MoldID) === String(moldId));
            if (mold) {
                this.selectMold(mold);
            }
        }

        this.state.currentScreen = 'settings';
        this.els.root.classList.remove('pa-hidden');
        document.body.style.overflow = 'hidden';
    },

    closeSettings() {
        console.log('📷 Closing settings...');
        this.els.root.classList.add('pa-hidden');
        this.state.currentScreen = null;
        document.body.style.overflow = '';
    },

    /* ============================================================================
     * RESET STATE
     * ============================================================================ */
    resetState() {
        // Reset selections
        this.state.selectedMold = null;
        this.state.isManualMold = false;
        this.clearDimensions();

        // Reset to default employee
        const defaultEmp = this.state.employees.find(e =>
            String(e.EmployeeID).trim() === String(PHOTO_AUDIT_CONFIG.DEFAULT_EMPLOYEE_ID).trim()
        );

        if (defaultEmp) {
            this.state.selectedEmployee = {
                id: defaultEmp.EmployeeID,
                name: defaultEmp.EmployeeNameShort || defaultEmp.EmployeeName
            };
            this.state.isManualEmployee = false;

            if (this.els.employeeInput) {
                this.els.employeeInput.value = this.state.selectedEmployee.name;
                this.updateEmployeeBadge();
            }
        }

        // Reset inputs
        if (this.els.moldInput) {
            this.els.moldInput.value = '';
            this.updateMoldBadge();
        }

        if (this.els.notes) {
            this.els.notes.value = '';
            this.state.notes = '';
        }

        // Reset photo
        this.state.photoBlob = null;
        this.state.photoSource = null;

        // Reset recipients to default
        this.state.recipients = [...PHOTO_AUDIT_CONFIG.DEFAULT_RECIPIENTS];
        this.renderRecipientList();
    },

    /* ============================================================================
     * ✅ BIND GLOBAL HOOKS (FIXED - SAME AS R2.2.2)
     * ============================================================================ */
    bindGlobalHooks() {
        // Navbar button
        const navbarBtn = PhotoAuditUtils.$('#open-photo-audit-tool');
        if (navbarBtn) {
            navbarBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.openSettings();
            });
        }

        // Detail modal button
        document.addEventListener('click', (e) => {
            if (e.target.closest('#mobile-detail-photo-audit-btn')) {
                e.preventDefault();
                this.openSettings();
            }
        });

        console.log('✅ Global hooks bound');
    }
};

/* ============================================================================
 * AUTO INIT
 * ============================================================================ */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PhotoAuditTool.init());
} else {
    PhotoAuditTool.init();
}

/* ============================================================================
 * ✅ EXPOSE TO WINDOW (FIXED)
 * ============================================================================ */
window.PhotoAuditTool = PhotoAuditTool;

/**
 * ============================================================================
 * PHOTO AUDIT TOOL - R2.3.3
 * 写真監査ツール / Công cụ kiểm tra ảnh khuôn
 * ============================================================================
 *
 * Updates in R2.3.2-2:
 * - ✅ Open from mobile detail modal -> auto-fill device/mold info fields, optional auto-open camera
 * - ✅ Compact UI hooks (header sizing handled in CSS file r2.3.2-2.css)
 * - ✅ Dimensions L/W/D on one row (kept)
 * - ✅ Notes textarea: 1-line default, auto-expand
 * - ✅ Fix: dropdown auto-hide after selection (mold/employee)
 * - ✅ Employee field click => open dropdown list immediately
 * - ✅ CC email input: dynamic rows + "+" add row + "save for next time" (localStorage)
 * - ✅ Photo list: view / edit info / edit image / delete
 * - ✅ Image editor: crop / rotate / resize presets (200KB / HD / Original) for captured & uploaded photos
 *   + also available right after capture (preview/edit flow)
 *
 * Created: 2025-12-24
 * Version: 2.3.2-2
 * ============================================================================
 */

'use strict';

/* ============================================================================
 * CONSTANTS
 * ============================================================================ */
const PHOTO_AUDIT_CONFIG = {
  STORAGE_BUCKET: 'mold-photos',
  DEFAULT_EMPLOYEE_ID: '1', // Toan-san
  PRIMARY_RECIPIENT: 'toan.ysd@gmail.com',

  IMAGE_MAX_SIZE: 10 * 1024 * 1024, // 10MB
  IMAGE_TARGET_WIDTH: 1920,
  IMAGE_TARGET_HEIGHT: 1080,
  IMAGE_QUALITY_HD: 0.92,
  IMAGE_QUALITY_COMPRESSED: 0.75,
  IMAGE_QUALITY_ORIGINAL: 0.95,
  IMAGE_TARGET_SIZE_KB: 200,

  DEBOUNCE_DELAY: 300,
  TOAST_DURATION: 3000,
  AUTOCOMPLETE_MAX_RESULTS: 8,
  MAX_PHOTOS_PER_SESSION: 20
};

const PHOTO_AUDIT_META = {
  VERSION: '2.3.2-2',
  STORAGE_KEYS: {
    CC_RECIPIENTS: 'photoAudit.ccRecipients',
    CC_SAVE_ENABLED: 'photoAudit.ccSaveEnabled'
  }
};

/* ============================================================================
 * UTILITIES
 * ============================================================================ */
const PhotoAuditUtils = {
  $: (selector, ctx = document) => ctx.querySelector(selector),
  $$: (selector, ctx = document) => Array.from(ctx.querySelectorAll(selector)),

  createEl(tag, attrs = {}, innerHTML = '') {
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
    div.textContent = str == null ? '' : String(str);
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

  formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
  },

  generateUID() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  },

  clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }
};

/* ============================================================================
 * SUPABASE CLIENT
 * ============================================================================ */
const SupabasePhotoClient = {
  config: {
    url: 'https://bgpnhvhouplvekaaheqy.supabase.co',
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJncG5odmhvdXBsdmVrYWFoZXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE2NjAxOTIsImV4cCI6MjA1NzIzNjE5Mn0.0PJJUjGOjkcEMl-hQhajn0IW4pLQNUHDDAeprE5DG1w'
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
          Authorization: `Bearer ${this.config.anonKey}`,
          'x-upsert': 'true'
        },
        body: formData
      });

      if (!res.ok) {
        let errorMsg;
        try {
          const errorData = await res.json();
          errorMsg = errorData.message || errorData.error || JSON.stringify(errorData);
        } catch {
          errorMsg = await res.text();
        }
        throw new Error(`Upload failed (${res.status}): ${errorMsg}`);
      }

      const result = await res.json();
      console.log('✅ [Supabase] Upload success:', result);
      return result;
    } catch (err) {
      console.error('❌ [Supabase] Upload error:', err);
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
          Authorization: `Bearer ${this.config.anonKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        let errorMsg;
        try {
          const errorData = await res.json();
          errorMsg = errorData.message || errorData.error || JSON.stringify(errorData);
        } catch {
          errorMsg = await res.text();
        }
        throw new Error(`Function failed (${res.status}): ${errorMsg}`);
      }

      const result = await res.json();
      console.log('✅ [Supabase] Function success:', result);
      return result;
    } catch (err) {
      console.error('❌ [Supabase] Function error:', err);
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

    // Launch context (from mobile detail modal)
    launchContext: {
      source: null, // 'navbar' | 'mobile-detail-modal' | null
      deviceType: null, // 'mold' | 'cutter' | 'device' | null
      deviceData: null, // raw object if provided
      autoOpenCamera: false
    },

    // Main form (shared by all photos if not overridden)
    mainForm: {
      selectedMold: null, // { id, code, name }
      isManualMold: false,
      selectedEmployee: null, // { id, name }
      isManualEmployee: false,
      dimensions: {
        length: '',
        width: '',
        depth: ''
      },
      dimensionsSource: {
        length: null,
        width: null,
        depth: null
      },
      notes: ''
    },

    // Additional fields
    ccRecipients: [],

    // Camera
    stream: null,
    facingMode: 'environment',
    gridEnabled: false,

    // Multi-photo with individual info
    photos: [], // { uid, blob, originalBlob?, source, fileName, originalName, capturedAt, photoInfo:{...}, setAsThumbnail, edits? }
    currentPhotoIndex: -1,

    // UI
    currentScreen: null, // 'settings' | 'camera' | 'photoList' | 'photoDetail' | 'editor' | 'capturePreview'
    sending: false,

    // Autocomplete
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

    console.log(`📷 [PhotoAuditTool v${PHOTO_AUDIT_META.VERSION}] Initializing...`);

    if (!window.DataManager || !window.DataManager.loaded) {
      console.warn('⏳ [PhotoAuditTool] DataManager not ready, waiting...');
      document.addEventListener('data-manager:ready', () => this.init(), { once: true });
      return;
    }

    this.loadData();
    this.buildUI();
    this.bindGlobalHooks();

    this.state.initialized = true;

    console.log(`✅ [PhotoAuditTool v${PHOTO_AUDIT_META.VERSION}] Initialized successfully!`);
    document.dispatchEvent(
      new CustomEvent('photoAuditTool:ready', {
        detail: { version: PHOTO_AUDIT_META.VERSION }
      })
    );
  },

  /* ============================================================================
   * LOAD DATA FROM DATAMANAGER
   * ============================================================================ */
  loadData() {
    const dm = window.DataManager.data;

    this.state.molds = dm.molds || [];
    this.state.employees = dm.employees || [];

    // Set default employee (Toan-san)
    const defaultEmp = this.state.employees.find(
      (e) => String(e.EmployeeID).trim() === String(PHOTO_AUDIT_CONFIG.DEFAULT_EMPLOYEE_ID).trim()
    );

    if (defaultEmp) {
      this.state.mainForm.selectedEmployee = {
        id: defaultEmp.EmployeeID,
        name: defaultEmp.EmployeeNameShort || defaultEmp.EmployeeName
      };
      this.state.mainForm.isManualEmployee = false;
    }

    // Load CC settings
    this.loadCCFromStorage();

    console.log('[PhotoAuditTool] Data loaded:', {
      molds: this.state.molds.length,
      employees: this.state.employees.length,
      defaultEmployee: this.state.mainForm.selectedEmployee?.name
    });
  },

  /* ============================================================================
   * BUILD UI
   * ============================================================================ */
  buildUI() {
    this.buildSettingsScreen();
    this.buildCameraScreen();
    this.buildCapturePreviewScreen(); // NEW r2.3.2-2
    this.buildPhotoListScreen();
    this.buildPhotoDetailScreen();
    this.buildImageEditorScreen(); // NEW r2.3.2-2
  },

  /* ============================================================================
   * SETTINGS SCREEN (Main Form)
   * ============================================================================ */
  buildSettingsScreen() {
    const { createEl: ce } = PhotoAuditUtils;

    // Root container
    const root = ce('div', {
      class: 'photo-audit-root pa-hidden pa-compact', // compact header handled in CSS
      id: 'photo-audit-root'
    });

    // Backdrop
    const backdrop = ce('div', { class: 'pa-backdrop', id: 'pa-backdrop' });

    // Dialog
    const dialog = ce('div', { class: 'pa-dialog' });

    // HEADER
    const header = ce('div', { class: 'pa-header pa-header-compact' });
    header.innerHTML = `
      <div class="pa-title">
        <div class="ja">写真監査ツール</div>
        <div class="vi">Công cụ kiểm tra ảnh khuôn</div>
      </div>
      <button class="pa-close" id="pa-btn-close-settings" aria-label="Close">&times;</button>
    `;

    // BODY
    const body = ce('div', { class: 'pa-body' });
    const form = ce('div', { class: 'pa-form' });

    // ROW 1: MOLD AUTOCOMPLETE
    const rowMold = ce('div', { class: 'pa-form-row' });
    rowMold.innerHTML = `
      <label class="pa-label">
        <span class="ja">金型選択</span>
        <span class="vi">Chọn mã khuôn</span>
        <span class="hint">(デフォルト / mặc định)</span>
      </label>
      <div class="pa-input-with-badge">
        <div class="pa-autocomplete-wrapper">
          <input
            type="text"
            class="pa-input pa-autocomplete-input"
            id="pa-mold-input"
            placeholder="🔍 金型コード検索 / Nhập mã khuôn..."
            autocomplete="off"
          />
          <div class="pa-autocomplete-dropdown pa-hidden" id="pa-mold-dropdown"></div>
        </div>
        <span class="pa-input-badge pa-hidden" id="pa-mold-badge"></span>
      </div>
    `;

    // ROW 2: EMPLOYEE AUTOCOMPLETE
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
            placeholder="👤 クリックで一覧 / Bấm để mở danh sách"
            autocomplete="off"
          />
          <div class="pa-autocomplete-dropdown pa-hidden" id="pa-employee-dropdown"></div>
        </div>
        <span class="pa-input-badge pa-hidden" id="pa-employee-badge"></span>
      </div>
    `;

    // ROW 3: DIMENSIONS (L/W/D one row)
    const rowDimensions = ce('div', { class: 'pa-form-row pa-form-row-triple' });
    rowDimensions.innerHTML = `
      <div class="pa-form-col">
        <label class="pa-label">
          <span class="ja">長さ</span>
          <span class="vi">Dài (mm)</span>
        </label>
        <input type="number" class="pa-input pa-dim-input" id="pa-dim-length" placeholder="mm" step="0.1" />
      </div>
      <div class="pa-form-col">
        <label class="pa-label">
          <span class="ja">幅</span>
          <span class="vi">Rộng (mm)</span>
        </label>
        <input type="number" class="pa-input pa-dim-input" id="pa-dim-width" placeholder="mm" step="0.1" />
      </div>
      <div class="pa-form-col">
        <label class="pa-label">
          <span class="ja">深さ</span>
          <span class="vi">Cao (mm)</span>
        </label>
        <input type="number" class="pa-input pa-dim-input" id="pa-dim-depth" placeholder="mm" step="0.1" />
      </div>
    `;

    // ROW 4: NOTES (1 line default + auto expand)
    const rowNotes = ce('div', { class: 'pa-form-row' });
    rowNotes.innerHTML = `
      <label class="pa-label">
        <span class="ja">備考</span>
        <span class="vi">Ghi chú</span>
      </label>
      <textarea
        class="pa-textarea pa-textarea-auto"
        id="pa-notes"
        rows="1"
        placeholder="備考入力 / Nhập ghi chú..."
      ></textarea>
    `;

    // ROW 5: CC RECIPIENTS (NEW)
    const rowCC = ce('div', { class: 'pa-form-row' });
    rowCC.innerHTML = `
      <label class="pa-label">
        <span class="ja">CC送信先</span>
        <span class="vi">CC Email</span>
      </label>

      <div class="pa-cc-rows" id="pa-cc-recipient-list"></div>

      <div class="pa-cc-actions">
        <button class="pa-btn pa-btn-icon" id="pa-btn-add-cc-recipient" title="Add CC row">
          <i class="fas fa-plus"></i>
        </button>

        <label class="pa-checkbox-label" style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="pa-cc-save-enabled" class="pa-checkbox" />
          <span class="ja">次回も使用</span>
          <span class="vi">Lưu cho lần sau</span>
        </label>

        <button class="pa-btn pa-btn-xs pa-btn-secondary" id="pa-btn-save-cc-now" title="Save CC now">
          <i class="fas fa-check"></i>
          <span>Save</span>
        </button>
      </div>

      <small class="pa-hint">✉️ Primary: ${PHOTO_AUDIT_CONFIG.PRIMARY_RECIPIENT}</small>
    `;

    // ROW 6: PHOTOS LIST
    const rowPhotos = ce('div', { class: 'pa-form-row' });
    rowPhotos.innerHTML = `
      <label class="pa-label">
        <span class="ja">撮影済み写真</span>
        <span class="vi">Ảnh đã chụp</span>
        <span class="pa-photo-count" id="pa-photo-count">0</span>
      </label>
      <div class="pa-photos-list" id="pa-photos-list"></div>
    `;

    form.appendChild(rowMold);
    form.appendChild(rowEmployee);
    form.appendChild(rowDimensions);
    form.appendChild(rowNotes);
    form.appendChild(rowCC);
    form.appendChild(rowPhotos);
    body.appendChild(form);

    // FOOTER
    const footer = ce('div', { class: 'pa-footer pa-footer-compact' });
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

      <button class="pa-btn pa-btn-success" id="pa-btn-send-photos" disabled>
        <i class="fas fa-paper-plane"></i>
        <span>Send</span>
      </button>
    `;

    // File input (hidden)
    const fileInput = ce('input', {
      type: 'file',
      class: 'pa-file-input',
      id: 'pa-file-input',
      accept: 'image/*',
      multiple: 'true'
    });

    // Assemble
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

    // CC: keep original element name mapping (but behavior changed)
    this.els.ccRecipientList = PhotoAuditUtils.$('#pa-cc-recipient-list');
    this.els.ccSaveEnabled = PhotoAuditUtils.$('#pa-cc-save-enabled');
    this.els.btnSaveCCNow = PhotoAuditUtils.$('#pa-btn-save-cc-now');

    // Preserve legacy references (avoid undefined errors)
    this.els.ccRecipientInput = null;

    this.els.photosList = PhotoAuditUtils.$('#pa-photos-list');
    this.els.photoCount = PhotoAuditUtils.$('#pa-photo-count');

    this.els.fileInput = PhotoAuditUtils.$('#pa-file-input');
    this.els.btnSendPhotos = PhotoAuditUtils.$('#pa-btn-send-photos');

    // Populate default employee
    if (this.state.mainForm.selectedEmployee) {
      this.els.employeeInput.value = this.state.mainForm.selectedEmployee.name;
      this.updateEmployeeBadge();
    }

    // Init CC rows UI
    this.initCCRowsUI();

    this.renderCCRecipientList();
    this.renderPhotosList();
    this.bindSettingsEvents();

    // Notes auto-resize init
    this.autoResizeNotes();
  },

  /* ============================================================================
   * UPDATE BADGES
   * ============================================================================ */
  updateMoldBadge() {
    if (!this.els.moldBadge) return;

    if (this.state.mainForm.selectedMold && !this.state.mainForm.isManualMold) {
      this.els.moldBadge.textContent = '自動 / Auto';
      this.els.moldBadge.className = 'pa-input-badge pa-badge-auto';
      this.els.moldBadge.classList.remove('pa-hidden');
    } else if (this.state.mainForm.isManualMold) {
      this.els.moldBadge.textContent = '手動 / Manual';
      this.els.moldBadge.className = 'pa-input-badge pa-badge-manual';
      this.els.moldBadge.classList.remove('pa-hidden');
    } else {
      this.els.moldBadge.classList.add('pa-hidden');
    }
  },

  updateEmployeeBadge() {
    if (!this.els.employeeBadge) return;

    if (this.state.mainForm.selectedEmployee && !this.state.mainForm.isManualEmployee) {
      this.els.employeeBadge.textContent = '自動 / Auto';
      this.els.employeeBadge.className = 'pa-input-badge pa-badge-auto';
      this.els.employeeBadge.classList.remove('pa-hidden');
    } else if (this.state.mainForm.isManualEmployee) {
      this.els.employeeBadge.textContent = '手動 / Manual';
      this.els.employeeBadge.className = 'pa-input-badge pa-badge-manual';
      this.els.employeeBadge.classList.remove('pa-hidden');
    } else {
      this.els.employeeBadge.classList.add('pa-hidden');
    }
  },

  /* ============================================================================
   * SETTINGS EVENTS
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

    // MOLD AUTOCOMPLETE
    this.els.moldInput.addEventListener(
      'input',
      PhotoAuditUtils.debounce(() => {
        const value = this.els.moldInput.value.trim();

        if (!value) {
          this.state.mainForm.selectedMold = null;
          this.state.mainForm.isManualMold = false;
          this.updateMoldBadge();
          this.clearDimensions();
          this.hideMoldAutocomplete();
          return;
        }

        const exactMatch = this.state.molds.find((m) => m.MoldCode === value || m.MoldName === value);
        if (!exactMatch) {
          this.state.mainForm.isManualMold = true;
          this.state.mainForm.selectedMold = null;
        }

        this.updateMoldBadge();
        this.handleMoldAutocomplete();
      }, PHOTO_AUDIT_CONFIG.DEBOUNCE_DELAY)
    );

    this.els.moldInput.addEventListener('focus', () => {
      if (this.els.moldInput.value.trim()) {
        this.handleMoldAutocomplete();
      }
    });

    // EMPLOYEE AUTOCOMPLETE (FIX + NEW: click opens dropdown)
    this.els.employeeInput.addEventListener(
      'input',
      PhotoAuditUtils.debounce(() => {
        const value = this.els.employeeInput.value.trim();

        if (!value) {
          this.state.mainForm.selectedEmployee = null;
          this.state.mainForm.isManualEmployee = false;
          this.updateEmployeeBadge();
          this.hideEmployeeAutocomplete();
          return;
        }

        const exactMatch = this.state.employees.find(
          (emp) => (emp.EmployeeNameShort || emp.EmployeeName) === value
        );

        if (!exactMatch) {
          this.state.mainForm.isManualEmployee = true;
          this.state.mainForm.selectedEmployee = { id: null, name: value };
        }

        this.updateEmployeeBadge();
        this.handleEmployeeAutocomplete();
      }, PHOTO_AUDIT_CONFIG.DEBOUNCE_DELAY)
    );

    // Click/focus -> show dropdown immediately (even when empty)
    const openEmployeeListNow = () => {
      this.openEmployeeDropdownInstant();
    };
    this.els.employeeInput.addEventListener('focus', openEmployeeListNow);
    this.els.employeeInput.addEventListener('click', openEmployeeListNow);

    // DIMENSIONS
    this.els.dimLength.addEventListener('input', (e) => {
      this.state.mainForm.dimensions.length = e.target.value.trim();
      if (this.state.mainForm.dimensionsSource.length !== 'manual' && e.target.value) {
        this.state.mainForm.dimensionsSource.length = 'manual';
        e.target.classList.add('manual-edit');
      }
    });

    this.els.dimWidth.addEventListener('input', (e) => {
      this.state.mainForm.dimensions.width = e.target.value.trim();
      if (this.state.mainForm.dimensionsSource.width !== 'manual' && e.target.value) {
        this.state.mainForm.dimensionsSource.width = 'manual';
        e.target.classList.add('manual-edit');
      }
    });

    this.els.dimDepth.addEventListener('input', (e) => {
      this.state.mainForm.dimensions.depth = e.target.value.trim();
      if (this.state.mainForm.dimensionsSource.depth !== 'manual' && e.target.value) {
        this.state.mainForm.dimensionsSource.depth = 'manual';
        e.target.classList.add('manual-edit');
      }
    });

    // NOTES (auto-expand)
    this.els.notes.addEventListener('input', (e) => {
      this.state.mainForm.notes = e.target.value;
      this.autoResizeNotes();
    });

    // CC RECIPIENTS (NEW)
    PhotoAuditUtils.$('#pa-btn-add-cc-recipient').addEventListener('click', (e) => {
      e.preventDefault();
      this.addCCRecipient(); // now: add empty row
    });

    this.els.ccSaveEnabled.addEventListener('change', () => {
      this.saveCCEnabledToStorage();
    });

    this.els.btnSaveCCNow.addEventListener('click', (e) => {
      e.preventDefault();
      this.saveCCToStorageNow(true);
    });

    // ACTIONS
    PhotoAuditUtils.$('#pa-btn-open-camera').addEventListener('click', (e) => {
      e.preventDefault();
      this.openCamera();
    });

    PhotoAuditUtils.$('#pa-btn-upload-file').addEventListener('click', (e) => {
      e.preventDefault();
      this.els.fileInput.click();
    });

    this.els.fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) this.handleMultipleFileUpload(files);
    });

    // SEND PHOTOS
    this.els.btnSendPhotos.addEventListener('click', (e) => {
      e.preventDefault();
      this.sendAllPhotos();
    });

    // Close autocomplete when clicking outside (more robust: pointerdown)
    document.addEventListener('pointerdown', (e) => {
      const inAuto = e.target.closest('.pa-autocomplete-wrapper');
      if (!inAuto) this.hideAllAutocomplete();
    });
  },

  autoResizeNotes() {
    if (!this.els.notes) return;
    const ta = this.els.notes;
    ta.style.height = 'auto';
    ta.style.overflowY = 'hidden';
    ta.style.height = Math.max(ta.scrollHeight, 24) + 'px';
  },

  /* ============================================================================
   * AUTOCOMPLETE: MOLD
   * ============================================================================ */
  handleMoldAutocomplete() {
    const query = this.els.moldInput.value.trim();
    if (!query) {
      this.hideMoldAutocomplete();
      return;
    }

    const normalized = PhotoAuditUtils.normalizeText(query);

    const results = this.state.molds
      .filter((mold) => {
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

    results.forEach((mold) => {
      const item = document.createElement('div');
      item.className = 'pa-autocomplete-item';

      const code = mold.MoldCode || `(ID:${mold.MoldID})`;
      const name = mold.MoldName || '';

      let dim = '';
      if (mold.designInfo) {
        const l = mold.designInfo.MoldDesignLength || mold.designInfo.Length;
        const w = mold.designInfo.MoldDesignWidth || mold.designInfo.Width;
        const d = mold.designInfo.MoldDesignDepth || mold.designInfo.Depth || mold.designInfo.MoldDesignHeight;
        if (l || w || d) dim = `${l || '?'}×${w || '?'}×${d || '?'}`;
      }

      item.innerHTML = `
        <div class="pa-autocomplete-item-main">${e(code)}</div>
        <div class="pa-autocomplete-item-sub">
          ${e(name)} ${dim ? `<span class="pa-dim-tag">${e(dim)}</span>` : ''}
        </div>
      `;

      // FIX: use pointerdown so selection happens before blur/outside handler
      item.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.selectMold(mold);
        // extra hide safety
        setTimeout(() => this.hideMoldAutocomplete(), 0);
      });

      dropdown.appendChild(item);
    });

    dropdown.classList.remove('pa-hidden');
  },

  selectMold(mold) {
    this.state.mainForm.selectedMold = { id: mold.MoldID, code: mold.MoldCode, name: mold.MoldName };
    this.state.mainForm.isManualMold = false;

    this.els.moldInput.value = mold.MoldCode || mold.MoldName || `ID:${mold.MoldID}`;
    this.updateMoldBadge();

    this.loadDimensionsForMold(mold);

    this.hideMoldAutocomplete();
  },

  loadDimensionsForMold(mold) {
    let length = '',
      width = '',
      depth = '';
    let lengthSrc = null,
      widthSrc = null,
      depthSrc = null;

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

    this.state.mainForm.dimensions = { length, width, depth };
    this.state.mainForm.dimensionsSource = { length: lengthSrc, width: widthSrc, depth: depthSrc };
    this.updateDimensionInputs();
  },

  updateDimensionInputs() {
    const inputs = {
      length: this.els.dimLength,
      width: this.els.dimWidth,
      depth: this.els.dimDepth
    };

    Object.keys(inputs).forEach((key) => {
      const input = inputs[key];
      const value = this.state.mainForm.dimensions[key];
      const source = this.state.mainForm.dimensionsSource[key];

      input.value = value;
      input.classList.remove('auto-filled', 'manual-edit');
      if (source && source !== 'manual') input.classList.add('auto-filled');
    });
  },

  clearDimensions() {
    this.state.mainForm.dimensions = { length: '', width: '', depth: '' };
    this.state.mainForm.dimensionsSource = { length: null, width: null, depth: null };
    [this.els.dimLength, this.els.dimWidth, this.els.dimDepth].forEach((input) => {
      input.value = '';
      input.classList.remove('auto-filled', 'manual-edit');
    });
  },

  /* ============================================================================
   * AUTOCOMPLETE: EMPLOYEE
   * ============================================================================ */
  handleEmployeeAutocomplete() {
    const query = this.els.employeeInput.value.trim();
    if (!query) {
      this.hideEmployeeAutocomplete();
      return;
    }

    const normalized = PhotoAuditUtils.normalizeText(query);

    const results = this.state.employees
      .filter((emp) => {
        const name = PhotoAuditUtils.normalizeText(emp.EmployeeName || '');
        const nameShort = PhotoAuditUtils.normalizeText(emp.EmployeeNameShort || '');
        return name.includes(normalized) || nameShort.includes(normalized);
      })
      .slice(0, PHOTO_AUDIT_CONFIG.AUTOCOMPLETE_MAX_RESULTS);

    this.state.employeeSearchResults = results;
    this.renderEmployeeAutocomplete(results);
  },

  openEmployeeDropdownInstant() {
    // If user typed something -> search; if empty -> show top list
    const query = this.els.employeeInput.value.trim();
    if (query) {
      this.handleEmployeeAutocomplete();
      return;
    }

    const results = (this.state.employees || []).slice(0, PHOTO_AUDIT_CONFIG.AUTOCOMPLETE_MAX_RESULTS);
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

    results.forEach((emp) => {
      const item = document.createElement('div');
      item.className = 'pa-autocomplete-item';

      const name = emp.EmployeeNameShort || emp.EmployeeName || `(ID:${emp.EmployeeID})`;
      item.innerHTML = `<div class="pa-autocomplete-item-main">${e(name)}</div>`;

      // FIX: pointerdown to ensure dropdown closes reliably
      item.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this.selectEmployee(emp);
        setTimeout(() => this.hideEmployeeAutocomplete(), 0);
      });

      dropdown.appendChild(item);
    });

    dropdown.classList.remove('pa-hidden');
  },

  selectEmployee(emp) {
    this.state.mainForm.selectedEmployee = {
      id: emp.EmployeeID,
      name: emp.EmployeeNameShort || emp.EmployeeName
    };
    this.state.mainForm.isManualEmployee = false;

    this.els.employeeInput.value = this.state.mainForm.selectedEmployee.name;
    this.updateEmployeeBadge();
    this.hideEmployeeAutocomplete();
  },

  /* ============================================================================
   * AUTOCOMPLETE HIDE
   * ============================================================================ */
  hideMoldAutocomplete() {
    if (this.els.moldDropdown) this.els.moldDropdown.classList.add('pa-hidden');
  },

  hideEmployeeAutocomplete() {
    if (this.els.employeeDropdown) this.els.employeeDropdown.classList.add('pa-hidden');
  },

  hideAllAutocomplete() {
    this.hideMoldAutocomplete();
    this.hideEmployeeAutocomplete();
  },

  /* ============================================================================
   * CC RECIPIENT MANAGEMENT (NEW r2.3.2-2)
   * - state.ccRecipients is still the final list used when sending
   * - UI uses dynamic rows, collected on demand
   * ============================================================================ */
  initCCRowsUI() {
    // Apply saved enabled state
    try {
      const savedEnabled = localStorage.getItem(PHOTO_AUDIT_META.STORAGE_KEYS.CC_SAVE_ENABLED);
      if (savedEnabled != null && this.els.ccSaveEnabled) {
        this.els.ccSaveEnabled.checked = savedEnabled === '1';
      }
    } catch {}

    // Ensure at least one row exists
    if (!this.els.ccRecipientList) return;
    if (!this.els.ccRecipientList.children.length) {
      // If stored list exists -> rows from stored, else one empty
      if ((this.state.ccRecipients || []).length) {
        this.state.ccRecipients.forEach((mail) => this.addCCRow(mail));
      } else {
        this.addCCRow('');
      }
    }
  },

  addCCRow(value = '') {
    const { createEl: ce, escapeHtml: e } = PhotoAuditUtils;
    const container = this.els.ccRecipientList;
    if (!container) return;

    const row = ce('div', { class: 'pa-cc-row' });
    row.innerHTML = `
      <input type="email" class="pa-input pa-cc-input" placeholder="example@ysd-pack.co.jp" value="${e(
        value
      )}" />
      <button class="pa-btn pa-btn-xs pa-btn-danger pa-cc-remove" title="Remove">
        <i class="fas fa-times"></i>
      </button>
    `;

    const input = row.querySelector('.pa-cc-input');
    const btnRemove = row.querySelector('.pa-cc-remove');

    btnRemove.addEventListener('click', (ev) => {
      ev.preventDefault();
      row.remove();

      // Ensure at least one line remains
      if (!container.querySelector('.pa-cc-input')) {
        this.addCCRow('');
      }
      this.syncCCRecipientsFromRows();
    });

    input.addEventListener('input', () => {
      this.syncCCRecipientsFromRows();
    });

    input.addEventListener('keypress', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        // Enter => add new row quickly
        this.addCCRecipient();
        const last = container.querySelector('.pa-cc-row:last-child .pa-cc-input');
        if (last) last.focus();
      }
    });

    container.appendChild(row);
    this.syncCCRecipientsFromRows();
  },

  syncCCRecipientsFromRows() {
    const rows = PhotoAuditUtils.$$('.pa-cc-input', this.els.ccRecipientList || document);
    const emails = rows
      .map((i) => (i.value || '').trim())
      .filter((v) => !!v)
      .filter((v, idx, arr) => arr.indexOf(v) === idx);

    this.state.ccRecipients = emails;
  },

  addCCRecipient() {
    // NEW meaning: add blank row
    this.addCCRow('');
  },

  renderCCRecipientList() {
    // For r2.3.2-2: rows already represent UI; just sync + handle empty state
    this.syncCCRecipientsFromRows();
  },

  saveCCEnabledToStorage() {
    try {
      localStorage.setItem(
        PHOTO_AUDIT_META.STORAGE_KEYS.CC_SAVE_ENABLED,
        this.els.ccSaveEnabled && this.els.ccSaveEnabled.checked ? '1' : '0'
      );
    } catch {}
  },

  saveCCToStorageNow(showToast = false) {
    this.syncCCRecipientsFromRows();

    const enabled = this.els.ccSaveEnabled && this.els.ccSaveEnabled.checked;
    this.saveCCEnabledToStorage();

    if (!enabled) {
      if (showToast) this.showToast('保存OFF / Tắt lưu CC', 'info');
      return;
    }

    try {
      localStorage.setItem(PHOTO_AUDIT_META.STORAGE_KEYS.CC_RECIPIENTS, JSON.stringify(this.state.ccRecipients || []));
      if (showToast) this.showToast('CC保存しました / Đã lưu CC', 'success');
    } catch {
      if (showToast) this.showToast('保存失敗 / Lưu thất bại', 'error');
    }
  },

  loadCCFromStorage() {
    try {
      const raw = localStorage.getItem(PHOTO_AUDIT_META.STORAGE_KEYS.CC_RECIPIENTS);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) this.state.ccRecipients = arr.filter((x) => typeof x === 'string' && x.trim());
    } catch {}
  },

  /* ============================================================================
   * PHOTOS LIST MANAGEMENT
   * ============================================================================ */
  renderPhotosList() {
    const { escapeHtml: e, formatFileSize } = PhotoAuditUtils;
    const container = this.els.photosList;

    container.innerHTML = '';

    if (!this.state.photos.length) {
      container.innerHTML =
        '<div class="pa-empty-state"><i class="fas fa-image"></i> <span>写真なし / No photos</span></div>';
      this.els.btnSendPhotos.disabled = true;
      this.updatePhotoCount();
      return;
    }

    this.els.btnSendPhotos.disabled = false;

    this.state.photos.forEach((photo, index) => {
      const row = document.createElement('div');
      row.className = 'pa-photo-row';
      row.dataset.uid = photo.uid;

      const name = photo.originalName || photo.fileName || `Photo ${index + 1}`;
      const sizeText = formatFileSize(photo.blob.size);
      const timeText = photo.capturedAt ? PhotoAuditUtils.formatDateTime(new Date(photo.capturedAt)) : '';

      const hasCustomInfo =
        photo.photoInfo &&
        (photo.photoInfo.moldCode || photo.photoInfo.dimensionL || photo.photoInfo.dimensionW || photo.photoInfo.dimensionD);

      row.innerHTML = `
        <div class="pa-photo-info">
          <div class="pa-photo-name">${e(name)}</div>
          <div class="pa-photo-meta">
            <span>${sizeText}</span>
            ${timeText ? `<span>${timeText}</span>` : ''}
            <span class="pa-photo-source">${photo.source === 'camera' ? '📷 Camera' : '📁 Upload'}</span>
            ${hasCustomInfo ? '<span class="pa-photo-custom-badge">📝 Custom</span>' : ''}
            ${photo.setAsThumbnail ? '<span class="pa-photo-thumbnail-badge">⭐ Thumbnail</span>' : ''}
          </div>
        </div>

        <div class="pa-photo-actions">
          <button class="pa-btn pa-btn-xs pa-btn-secondary pa-photo-view" data-uid="${photo.uid}" title="View">
            <i class="fas fa-eye"></i>
          </button>

          <button class="pa-btn pa-btn-xs pa-btn-secondary pa-photo-edit-image" data-uid="${photo.uid}" title="Edit image">
            <i class="fas fa-crop-alt"></i>
          </button>

          <button class="pa-btn pa-btn-xs pa-btn-primary pa-photo-edit" data-uid="${photo.uid}" title="Edit info">
            <i class="fas fa-edit"></i>
          </button>

          <button class="pa-btn pa-btn-xs pa-btn-danger pa-photo-delete" data-uid="${photo.uid}" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;

      container.appendChild(row);
    });

    // Bind actions
    PhotoAuditUtils.$$('.pa-photo-view', container).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const uid = e.currentTarget.dataset.uid;
        this.viewPhoto(uid);
      });
    });

    PhotoAuditUtils.$$('.pa-photo-edit', container).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const uid = e.currentTarget.dataset.uid;
        this.editPhotoInfo(uid);
      });
    });

    PhotoAuditUtils.$$('.pa-photo-edit-image', container).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const uid = e.currentTarget.dataset.uid;
        this.openImageEditorByUid(uid, { from: 'list' });
      });
    });

    PhotoAuditUtils.$$('.pa-photo-delete', container).forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const uid = e.currentTarget.dataset.uid;
        this.deletePhoto(uid);
      });
    });

    this.updatePhotoCount();
  },

  updatePhotoCount() {
    if (this.els.photoCount) this.els.photoCount.textContent = `(${this.state.photos.length})`;
  },

  addPhoto(blob, source, originalName) {
    if (this.state.photos.length >= PHOTO_AUDIT_CONFIG.MAX_PHOTOS_PER_SESSION) {
      this.showToast(
        `最大${PHOTO_AUDIT_CONFIG.MAX_PHOTOS_PER_SESSION}枚まで / Max ${PHOTO_AUDIT_CONFIG.MAX_PHOTOS_PER_SESSION} photos`,
        'warning'
      );
      return null;
    }

    const uid = PhotoAuditUtils.generateUID();

    const photo = {
      uid,
      blob,
      originalBlob: blob, // keep reference for "Original" preset usage after edits
      source,
      originalName: originalName || blob.name || '',
      fileName: '',
      capturedAt: new Date().toISOString(),
      photoInfo: null,
      setAsThumbnail: false,
      edits: {
        rotation: 0,
        crop: null, // {x,y,w,h} in normalized image coords 0..1
        resizePreset: 'HD' // default used when editing
      }
    };

    this.state.photos.push(photo);
    this.renderPhotosList();
    return photo;
  },

  deletePhoto(uid) {
    this.state.photos = this.state.photos.filter((p) => p.uid !== uid);
    this.renderPhotosList();
    this.showToast('写真を削除しました / Photo deleted', 'success');
  },

  findPhotoByUid(uid) {
    return this.state.photos.find((p) => p.uid === uid) || null;
  },

  viewPhoto(uid) {
    const photo = this.findPhotoByUid(uid);
    if (!photo) return;

    const index = this.state.photos.findIndex((p) => p.uid === uid);
    this.state.currentPhotoIndex = index;

    this.openPhotoListScreen();
  },

  editPhotoInfo(uid) {
    const photo = this.findPhotoByUid(uid);
    if (!photo) return;

    const index = this.state.photos.findIndex((p) => p.uid === uid);
    this.state.currentPhotoIndex = index;

    this.openPhotoDetailScreen();
  },

  /* ============================================================================
   * CAMERA SCREEN
   * ============================================================================ */
  buildCameraScreen() {
    const { createEl: ce } = PhotoAuditUtils;

    const overlay = ce('div', { class: 'pa-camera-overlay pa-hidden', id: 'pa-camera-overlay' });
    const camera = ce('div', { class: 'pa-camera-screen' });

    const header = ce('div', { class: 'pa-camera-header pa-header-compact' });
    header.innerHTML = `
      <button class="pa-btn-camera-close" id="pa-btn-close-camera">
        <i class="fas fa-arrow-left"></i>
      </button>

      <div class="pa-camera-title">
        <span class="ja">写真撮影</span>
        <span class="vi">Chụp ảnh</span>
      </div>

      <button class="pa-btn pa-btn-xs pa-btn-secondary" id="pa-btn-open-gallery">
        <i class="fas fa-images"></i>
      </button>
    `;

    const viewportWrapper = ce('div', { class: 'pa-camera-viewport' });

    const video = ce('video', {
      class: 'pa-camera-video',
      id: 'pa-camera-video',
      autoplay: true,
      playsinline: true,
      muted: true
    });

    const canvas = ce('canvas', { class: 'pa-camera-canvas pa-hidden', id: 'pa-camera-canvas' });

    const gridOverlay = ce('div', { class: 'pa-camera-grid pa-hidden', id: 'pa-camera-grid' });
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

    PhotoAuditUtils.$('#pa-btn-open-gallery').addEventListener('click', (e) => {
      e.preventDefault();
      this.closeCamera();
      this.showSettings();
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
    console.log('[PhotoAuditTool] Opening camera...');
    this.state.currentScreen = 'camera';

    this.els.cameraOverlay.classList.remove('pa-hidden');
    this.els.video.classList.remove('pa-hidden');
    this.els.canvas.classList.add('pa-hidden');
    document.body.style.overflow = 'hidden';

    try {
      await this.startCameraStream();
    } catch (err) {
      console.error('[PhotoAuditTool] Camera error:', err);
      this.showToast('Camera error / カメラエラー', 'error');
      this.closeCamera();
    }
  },

  async startCameraStream() {
    if (this.state.stream) this.stopCameraStream();

    const constraints = {
      video: {
        facingMode: this.state.facingMode,
        width: { ideal: PHOTO_AUDIT_CONFIG.IMAGE_TARGET_WIDTH },
        height: { ideal: PHOTO_AUDIT_CONFIG.IMAGE_TARGET_HEIGHT }
      },
      audio: false
    };

    this.state.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.els.video.srcObject = this.state.stream;
    await this.els.video.play();
  },

  stopCameraStream() {
    if (this.state.stream) {
      this.state.stream.getTracks().forEach((t) => t.stop());
      this.state.stream = null;
    }
    if (this.els.video) this.els.video.srcObject = null;
  },

  async flipCamera() {
    this.state.facingMode = this.state.facingMode === 'environment' ? 'user' : 'environment';
    await this.startCameraStream();
  },

  toggleGrid() {
    this.state.gridEnabled = !this.state.gridEnabled;
    if (this.state.gridEnabled) this.els.gridOverlay.classList.remove('pa-hidden');
    else this.els.gridOverlay.classList.add('pa-hidden');
  },

  capturePhoto() {
    if (!this.state.stream) return;

    const video = this.els.video;
    const canvas = this.els.canvas;
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          this.showToast('撮影失敗 / Failed to capture', 'error');
          return;
        }

        const photo = this.addPhoto(blob, 'camera', '');
        if (!photo) return;

        // NEW: Open capture preview with edit options
        this.openCapturePreview(photo.uid);
      },
      'image/jpeg',
      PHOTO_AUDIT_CONFIG.IMAGE_QUALITY_HD
    );
  },

  closeCamera() {
    this.stopCameraStream();
    this.els.cameraOverlay.classList.add('pa-hidden');
    document.body.style.overflow = '';
    this.state.currentScreen = 'settings';
  },

  /* ============================================================================
   * CAPTURE PREVIEW SCREEN (NEW r2.3.2-2)
   * - After capture: preview / edit / keep / delete
   * ============================================================================ */
  buildCapturePreviewScreen() {
    const { createEl: ce } = PhotoAuditUtils;

    const overlay = ce('div', { class: 'pa-capture-preview-overlay pa-hidden', id: 'pa-capture-preview-overlay' });
    const modal = ce('div', { class: 'pa-capture-preview-modal' });

    const header = ce('div', { class: 'pa-preview-header pa-header-compact' });
    header.innerHTML = `
      <button class="pa-btn pa-btn-xs pa-btn-secondary" id="pa-btn-capture-preview-back">
        <i class="fas fa-arrow-left"></i> <span>Back</span>
      </button>
      <div class="pa-preview-title">
        <span class="ja">撮影プレビュー</span>
        <span class="vi">Xem trước sau chụp</span>
      </div>
      <div></div>
    `;

    const body = ce('div', { class: 'pa-preview-body' });
    const img = ce('img', { class: 'pa-preview-image', id: 'pa-capture-preview-image', alt: 'Preview' });
    const info = ce('div', { class: 'pa-preview-info', id: 'pa-capture-preview-info' });

    body.appendChild(img);
    body.appendChild(info);

    const footer = ce('div', { class: 'pa-preview-footer' });
    footer.innerHTML = `
      <button class="pa-btn pa-btn-danger" id="pa-btn-capture-preview-delete">
        <i class="fas fa-trash"></i> <span>Delete</span>
      </button>

      <button class="pa-btn pa-btn-secondary" id="pa-btn-capture-preview-edit">
        <i class="fas fa-crop-alt"></i> <span>Edit</span>
      </button>

      <button class="pa-btn pa-btn-success" id="pa-btn-capture-preview-keep">
        <i class="fas fa-check"></i> <span>Keep</span>
      </button>
    `;

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    this.els.capturePreviewOverlay = overlay;
    this.els.capturePreviewImage = img;
    this.els.capturePreviewInfo = info;

    // events
    PhotoAuditUtils.$('#pa-btn-capture-preview-back').addEventListener('click', (e) => {
      e.preventDefault();
      this.closeCapturePreview(true);
    });

    PhotoAuditUtils.$('#pa-btn-capture-preview-delete').addEventListener('click', (e) => {
      e.preventDefault();
      const uid = overlay.dataset.uid;
      if (uid) this.deletePhoto(uid);
      this.closeCapturePreview(true);
    });

    PhotoAuditUtils.$('#pa-btn-capture-preview-edit').addEventListener('click', (e) => {
      e.preventDefault();
      const uid = overlay.dataset.uid;
      if (uid) this.openImageEditorByUid(uid, { from: 'capturePreview' });
    });

    PhotoAuditUtils.$('#pa-btn-capture-preview-keep').addEventListener('click', (e) => {
      e.preventDefault();
      this.closeCapturePreview(true);
      // stay in camera for next photos
      this.showToast('保存しました / Đã lưu ảnh', 'success');
    });
  },

  openCapturePreview(uid) {
    const photo = this.findPhotoByUid(uid);
    if (!photo) return;

    const url = URL.createObjectURL(photo.blob);
    this.els.capturePreviewImage.src = url;

    this.els.capturePreviewInfo.innerHTML = `
      <div><strong>📷</strong> ${PhotoAuditUtils.escapeHtml(photo.source)}</div>
      <div>${PhotoAuditUtils.escapeHtml(PhotoAuditUtils.formatFileSize(photo.blob.size))}</div>
      <div>${PhotoAuditUtils.escapeHtml(PhotoAuditUtils.formatDateTime(new Date(photo.capturedAt)))}</div>
    `;

    this.els.capturePreviewOverlay.dataset.uid = uid;
    this.els.capturePreviewOverlay.classList.remove('pa-hidden');
    this.state.currentScreen = 'capturePreview';
  },

  closeCapturePreview(returnToCamera = true) {
    if (this.els.capturePreviewImage && this.els.capturePreviewImage.src) {
      try {
        URL.revokeObjectURL(this.els.capturePreviewImage.src);
      } catch {}
      this.els.capturePreviewImage.src = '';
    }

    this.els.capturePreviewOverlay.classList.add('pa-hidden');
    this.els.capturePreviewOverlay.dataset.uid = '';

    if (returnToCamera) {
      this.state.currentScreen = 'camera';
    }
  },

  /* ============================================================================
   * FILE UPLOAD (MULTIPLE)
   * ============================================================================ */
  async handleMultipleFileUpload(files) {
    for (const file of files) {
      if (!file.type.startsWith('image')) {
        this.showToast('画像を選択 / Select image file', 'error');
        continue;
      }
      if (file.size > PHOTO_AUDIT_CONFIG.IMAGE_MAX_SIZE) {
        this.showToast('ファイル大 / File too large (max 10MB)', 'error');
        continue;
      }

      try {
        this.addPhoto(file, 'file', file.name);
      } catch (err) {
        console.error('[PhotoAuditTool] File processing error:', err);
        this.showToast('File processing error', 'error');
      }
    }

    this.els.fileInput.value = '';
  },

  /* ============================================================================
   * PHOTO LIST SCREEN (Preview Gallery)
   * ============================================================================ */
  buildPhotoListScreen() {
    const { createEl: ce } = PhotoAuditUtils;

    const overlay = ce('div', { class: 'pa-preview-overlay pa-hidden', id: 'pa-photolist-overlay' });
    const modal = ce('div', { class: 'pa-preview-modal' });

    const header = ce('div', { class: 'pa-preview-header pa-header-compact' });
    header.innerHTML = `
      <button class="pa-btn pa-btn-xs pa-btn-secondary" id="pa-btn-photolist-back">
        <i class="fas fa-arrow-left"></i>
        <span>Back</span>
      </button>

      <div class="pa-preview-title">
        <span class="ja">写真プレビュー</span>
        <span class="vi">Xem trước ảnh</span>
      </div>

      <div></div>
    `;

    const body = ce('div', { class: 'pa-preview-body' });
    const img = ce('img', { class: 'pa-preview-image', id: 'pa-photolist-image', alt: 'Preview' });
    const info = ce('div', { class: 'pa-preview-info', id: 'pa-photolist-info' });

    body.appendChild(img);
    body.appendChild(info);

    const footer = ce('div', { class: 'pa-preview-footer' });
    footer.innerHTML = `
      <button class="pa-btn pa-btn-secondary" id="pa-btn-photolist-close">
        <i class="fas fa-check"></i>
        <span>OK</span>
      </button>
    `;

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    this.els.photoListOverlay = overlay;
    this.els.photoListModal = modal;
    this.els.photoListImage = img;
    this.els.photoListInfo = info;

    this.bindPhotoListEvents();
  },

  bindPhotoListEvents() {
    PhotoAuditUtils.$('#pa-btn-photolist-back').addEventListener('click', (e) => {
      e.preventDefault();
      this.closePhotoList();
    });

    PhotoAuditUtils.$('#pa-btn-photolist-close').addEventListener('click', (e) => {
      e.preventDefault();
      this.closePhotoList();
    });
  },

  openPhotoListScreen() {
    if (this.state.currentPhotoIndex < 0 || this.state.currentPhotoIndex >= this.state.photos.length) {
      this.showToast('写真なし / No photo', 'error');
      return;
    }

    const photo = this.state.photos[this.state.currentPhotoIndex];

    const url = URL.createObjectURL(photo.blob);
    this.els.photoListImage.src = url;

    const sizeText = PhotoAuditUtils.formatFileSize(photo.blob.size);
    const timeText = photo.capturedAt ? PhotoAuditUtils.formatDateTime(new Date(photo.capturedAt)) : '';
    const name = photo.originalName || photo.fileName || `Photo ${this.state.currentPhotoIndex + 1}`;

    this.els.photoListInfo.innerHTML = `
      <div><strong>${PhotoAuditUtils.escapeHtml(name)}</strong></div>
      <div>${PhotoAuditUtils.escapeHtml(sizeText)}</div>
      ${timeText ? `<div>${PhotoAuditUtils.escapeHtml(timeText)}</div>` : ''}
      <div>Source: ${PhotoAuditUtils.escapeHtml(photo.source)}</div>
    `;

    this.state.currentScreen = 'photoList';
    this.els.photoListOverlay.classList.remove('pa-hidden');
    document.body.style.overflow = 'hidden';
  },

  closePhotoList() {
    if (this.els.photoListOverlay) this.els.photoListOverlay.classList.add('pa-hidden');
    document.body.style.overflow = '';

    if (this.els.photoListImage && this.els.photoListImage.src) {
      try {
        URL.revokeObjectURL(this.els.photoListImage.src);
      } catch {}
      this.els.photoListImage.src = '';
    }

    this.state.currentScreen = 'settings';
    this.showSettings();
  },

  /* ============================================================================
   * PHOTO DETAIL SCREEN (Edit Photo Info)
   * ============================================================================ */
  buildPhotoDetailScreen() {
    const { createEl: ce } = PhotoAuditUtils;

    const overlay = ce('div', { class: 'pa-detail-overlay pa-hidden', id: 'pa-photodetail-overlay' });
    const modal = ce('div', { class: 'pa-detail-modal' });

    const header = ce('div', { class: 'pa-detail-header pa-header-compact' });
    header.innerHTML = `
      <button class="pa-btn pa-btn-xs pa-btn-secondary" id="pa-btn-detail-back">
        <i class="fas fa-arrow-left"></i>
        <span>Back</span>
      </button>

      <div class="pa-detail-title">
        <span class="ja">情報編集</span>
        <span class="vi">Chỉnh sửa thông tin ảnh</span>
      </div>

      <div></div>
    `;

    const body = ce('div', { class: 'pa-detail-body' });

    const preview = ce('div', { class: 'pa-detail-preview' });
    const img = ce('img', { class: 'pa-detail-image', id: 'pa-detail-image', alt: 'Preview' });
    preview.appendChild(img);

    const form = ce('div', { class: 'pa-detail-form' });
    form.innerHTML = `
      <div class="pa-form-row">
        <label class="pa-label">
          <span class="ja">金型コード</span>
          <span class="vi">Mã khuôn</span>
          <small class="hint">(空は自動 / trống sẽ tự động)</small>
        </label>
        <input type="text" class="pa-input" id="pa-detail-mold-code" placeholder="MOLD-XXX" />
      </div>

      <div class="pa-form-row">
        <label class="pa-label">
          <span class="ja">金型名</span>
          <span class="vi">Tên khuôn</span>
        </label>
        <input type="text" class="pa-input" id="pa-detail-mold-name" placeholder="Name..." />
      </div>

      <div class="pa-form-row pa-form-row-triple">
        <div class="pa-form-col">
          <label class="pa-label"><span class="ja">長さ</span><span class="vi">Dài (mm)</span></label>
          <input type="number" class="pa-input" id="pa-detail-dim-length" placeholder="mm" step="0.1" />
        </div>
        <div class="pa-form-col">
          <label class="pa-label"><span class="ja">幅</span><span class="vi">Rộng (mm)</span></label>
          <input type="number" class="pa-input" id="pa-detail-dim-width" placeholder="mm" step="0.1" />
        </div>
        <div class="pa-form-col">
          <label class="pa-label"><span class="ja">深さ</span><span class="vi">Cao (mm)</span></label>
          <input type="number" class="pa-input" id="pa-detail-dim-depth" placeholder="mm" step="0.1" />
        </div>
      </div>

      <div class="pa-form-row">
        <label class="pa-checkbox-label">
          <input type="checkbox" id="pa-detail-set-thumbnail" class="pa-checkbox" />
          <span class="ja">代表写真にする</span>
          <span class="vi">Đặt làm ảnh đại diện</span>
        </label>
      </div>

      <div class="pa-info-box">
        <i class="fas fa-info-circle"></i>
        <div>
          <strong>Info</strong>
          <div>空欄はメインフォームから自動補完 / Các trường trống sẽ tự lấy từ form chính.</div>
        </div>
      </div>
    `;

    body.appendChild(preview);
    body.appendChild(form);

    const footer = ce('div', { class: 'pa-detail-footer' });
    footer.innerHTML = `
      <button class="pa-btn pa-btn-secondary" id="pa-btn-detail-cancel">
        <i class="fas fa-times"></i>
        <span>Cancel</span>
      </button>

      <button class="pa-btn pa-btn-primary" id="pa-btn-detail-save">
        <i class="fas fa-save"></i>
        <span>Save</span>
      </button>
    `;

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    this.els.photoDetailOverlay = overlay;
    this.els.photoDetailModal = modal;
    this.els.photoDetailImage = img;

    this.els.detailMoldCode = PhotoAuditUtils.$('#pa-detail-mold-code');
    this.els.detailMoldName = PhotoAuditUtils.$('#pa-detail-mold-name');
    this.els.detailDimLength = PhotoAuditUtils.$('#pa-detail-dim-length');
    this.els.detailDimWidth = PhotoAuditUtils.$('#pa-detail-dim-width');
    this.els.detailDimDepth = PhotoAuditUtils.$('#pa-detail-dim-depth');
    this.els.detailSetThumbnail = PhotoAuditUtils.$('#pa-detail-set-thumbnail');

    this.bindPhotoDetailEvents();
  },

  bindPhotoDetailEvents() {
    PhotoAuditUtils.$('#pa-btn-detail-back').addEventListener('click', (e) => {
      e.preventDefault();
      this.closePhotoDetail();
    });

    PhotoAuditUtils.$('#pa-btn-detail-cancel').addEventListener('click', (e) => {
      e.preventDefault();
      this.closePhotoDetail();
    });

    PhotoAuditUtils.$('#pa-btn-detail-save').addEventListener('click', (e) => {
      e.preventDefault();
      this.savePhotoDetail();
    });
  },

  openPhotoDetailScreen() {
    if (this.state.currentPhotoIndex < 0 || this.state.currentPhotoIndex >= this.state.photos.length) {
      this.showToast('写真なし / No photo', 'error');
      return;
    }

    const photo = this.state.photos[this.state.currentPhotoIndex];

    const url = URL.createObjectURL(photo.blob);
    this.els.photoDetailImage.src = url;

    if (photo.photoInfo) {
      this.els.detailMoldCode.value = photo.photoInfo.moldCode || '';
      this.els.detailMoldName.value = photo.photoInfo.moldName || '';
      this.els.detailDimLength.value = photo.photoInfo.dimensionL || '';
      this.els.detailDimWidth.value = photo.photoInfo.dimensionW || '';
      this.els.detailDimDepth.value = photo.photoInfo.dimensionD || '';
    } else {
      this.els.detailMoldCode.value = '';
      this.els.detailMoldName.value = '';
      this.els.detailDimLength.value = '';
      this.els.detailDimWidth.value = '';
      this.els.detailDimDepth.value = '';
    }

    this.els.detailSetThumbnail.checked = !!photo.setAsThumbnail;

    this.state.currentScreen = 'photoDetail';
    this.els.photoDetailOverlay.classList.remove('pa-hidden');
    document.body.style.overflow = 'hidden';
  },

  savePhotoDetail() {
    if (this.state.currentPhotoIndex < 0 || this.state.currentPhotoIndex >= this.state.photos.length) return;
    const photo = this.state.photos[this.state.currentPhotoIndex];

    const moldCode = this.els.detailMoldCode.value.trim();
    const moldName = this.els.detailMoldName.value.trim();
    const dimL = this.els.detailDimLength.value.trim();
    const dimW = this.els.detailDimWidth.value.trim();
    const dimD = this.els.detailDimDepth.value.trim();

    if (moldCode || moldName || dimL || dimW || dimD) {
      photo.photoInfo = {
        moldCode: moldCode || null,
        moldName: moldName || null,
        dimensionL: dimL || null,
        dimensionW: dimW || null,
        dimensionD: dimD || null
      };
    } else {
      photo.photoInfo = null;
    }

    photo.setAsThumbnail = !!this.els.detailSetThumbnail.checked;

    this.showToast('情報保存 / Photo info saved', 'success');
    this.closePhotoDetail();
    this.renderPhotosList();
  },

  closePhotoDetail() {
    if (this.els.photoDetailOverlay) this.els.photoDetailOverlay.classList.add('pa-hidden');
    document.body.style.overflow = '';

    if (this.els.photoDetailImage && this.els.photoDetailImage.src) {
      try {
        URL.revokeObjectURL(this.els.photoDetailImage.src);
      } catch {}
      this.els.photoDetailImage.src = '';
    }

    this.state.currentScreen = 'settings';
    this.showSettings();
  },

  /* ============================================================================
   * IMAGE EDITOR (NEW r2.3.2-2)
   * - crop (drag rectangle), rotate (90°), resize presets
   * ============================================================================ */
  buildImageEditorScreen() {
    const { createEl: ce } = PhotoAuditUtils;

    const overlay = ce('div', { class: 'pa-editor-overlay pa-hidden', id: 'pa-editor-overlay' });
    const modal = ce('div', { class: 'pa-editor-modal' });

    const header = ce('div', { class: 'pa-editor-header pa-header-compact' });
    header.innerHTML = `
      <button class="pa-btn pa-btn-xs pa-btn-secondary" id="pa-btn-editor-back">
        <i class="fas fa-arrow-left"></i> <span>Back</span>
      </button>
      <div class="pa-editor-title">
        <span class="ja">画像編集</span>
        <span class="vi">Chỉnh sửa ảnh</span>
      </div>
      <button class="pa-btn pa-btn-xs pa-btn-secondary" id="pa-btn-editor-reset">
        <i class="fas fa-undo"></i> <span>Reset</span>
      </button>
    `;

    const body = ce('div', { class: 'pa-editor-body' });
    body.innerHTML = `
      <div class="pa-editor-canvas-wrap">
        <canvas id="pa-editor-canvas" class="pa-editor-canvas"></canvas>
        <div id="pa-editor-hint" class="pa-editor-hint">Drag to crop / Kéo để crop</div>
      </div>

      <div class="pa-editor-controls">
        <button class="pa-btn pa-btn-secondary" id="pa-btn-editor-rotate">
          <i class="fas fa-rotate-right"></i> <span>Rotate</span>
        </button>

        <select class="pa-input pa-editor-select" id="pa-editor-resize-preset">
          <option value="ORIGINAL">Original</option>
          <option value="HD" selected>HD</option>
          <option value="200KB">200KB</option>
        </select>

        <button class="pa-btn pa-btn-success" id="pa-btn-editor-apply">
          <i class="fas fa-check"></i> <span>Apply</span>
        </button>
      </div>
    `;

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    this.els.editorOverlay = overlay;
    this.els.editorCanvas = PhotoAuditUtils.$('#pa-editor-canvas');
    this.els.editorHint = PhotoAuditUtils.$('#pa-editor-hint');
    this.els.editorResizePreset = PhotoAuditUtils.$('#pa-editor-resize-preset');

    // events
    PhotoAuditUtils.$('#pa-btn-editor-back').addEventListener('click', (e) => {
      e.preventDefault();
      this.closeImageEditor(true);
    });

    PhotoAuditUtils.$('#pa-btn-editor-reset').addEventListener('click', (e) => {
      e.preventDefault();
      this.resetImageEditorEdits();
    });

    PhotoAuditUtils.$('#pa-btn-editor-rotate').addEventListener('click', (e) => {
      e.preventDefault();
      this.rotateImageEditor();
    });

    PhotoAuditUtils.$('#pa-btn-editor-apply').addEventListener('click', (e) => {
      e.preventDefault();
      this.applyImageEditor();
    });

    this.bindEditorCanvasCropEvents();
  },

  bindEditorCanvasCropEvents() {
    const canvas = this.els.editorCanvas;
    if (!canvas) return;

    const getPos = (ev) => {
      const rect = canvas.getBoundingClientRect();
      const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
      const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
      return { x, y };
    };

    let dragging = false;
    let start = null;

    canvas.addEventListener('pointerdown', (ev) => {
      if (!this.state.editor || !this.state.editor.img) return;
      dragging = true;
      canvas.setPointerCapture(ev.pointerId);
      start = getPos(ev);
      this.state.editor.cropPx = { x: start.x, y: start.y, w: 1, h: 1 };
      this.renderEditorCanvas();
    });

    canvas.addEventListener('pointermove', (ev) => {
      if (!dragging || !start || !this.state.editor) return;
      const p = getPos(ev);
      const x = Math.min(start.x, p.x);
      const y = Math.min(start.y, p.y);
      const w = Math.abs(p.x - start.x);
      const h = Math.abs(p.y - start.y);
      this.state.editor.cropPx = { x, y, w, h };
      this.renderEditorCanvas();
    });

    const endDrag = (ev) => {
      if (!dragging) return;
      dragging = false;
      start = null;
      try {
        canvas.releasePointerCapture(ev.pointerId);
      } catch {}
      this.renderEditorCanvas();
    };

    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
  },

  openImageEditorByUid(uid, opts = {}) {
    const photo = this.findPhotoByUid(uid);
    if (!photo) return;

    // Ensure originalBlob exists
    if (!photo.originalBlob) photo.originalBlob = photo.blob;

    this.openImageEditor(photo, opts);
  },

  openImageEditor(photo, opts = {}) {
    this.state.editor = {
      uid: photo.uid,
      from: opts.from || 'list',
      img: null,
      rotation: (photo.edits && photo.edits.rotation) || 0,
      cropPx: null, // crop rect in canvas px
      resizePreset: (photo.edits && photo.edits.resizePreset) || 'HD',
      // image natural size (loaded)
      naturalW: 0,
      naturalH: 0
    };

    // UI preset
    this.els.editorResizePreset.value = this.state.editor.resizePreset;

    this.els.editorOverlay.classList.remove('pa-hidden');
    this.state.currentScreen = 'editor';

    // Load image to editor
    const url = URL.createObjectURL(photo.blob);
    const img = new Image();
    img.onload = () => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
      this.state.editor.img = img;
      this.state.editor.naturalW = img.width;
      this.state.editor.naturalH = img.height;

      // Set canvas size (fit to modal width-ish)
      const maxW = Math.min(900, window.innerWidth - 40);
      const ratio = img.width ? maxW / img.width : 1;
      const w = Math.max(320, Math.floor(img.width * Math.min(1, ratio)));
      const h = Math.max(240, Math.floor(img.height * Math.min(1, ratio)));

      this.els.editorCanvas.width = w;
      this.els.editorCanvas.height = h;

      // Initialize crop to full image (canvas)
      this.state.editor.cropPx = { x: 0, y: 0, w: w, h: h };
      this.renderEditorCanvas();
    };
    img.onerror = () => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
      this.showToast('画像ロード失敗 / Image load error', 'error');
      this.closeImageEditor(true);
    };
    img.src = url;
  },

  closeImageEditor(returnToPrev = true) {
    if (this.els.editorOverlay) this.els.editorOverlay.classList.add('pa-hidden');
    this.state.editor = null;

    if (returnToPrev) {
      // Return according to source
      const from = (this.state.editor && this.state.editor.from) || null;
      if (from === 'capturePreview') {
        this.state.currentScreen = 'capturePreview';
      } else {
        this.state.currentScreen = 'settings';
      }
    }
  },

  resetImageEditorEdits() {
    if (!this.state.editor) return;

    this.state.editor.rotation = 0;
    // reset crop to full canvas
    const c = this.els.editorCanvas;
    this.state.editor.cropPx = { x: 0, y: 0, w: c.width, h: c.height };
    this.els.editorResizePreset.value = 'HD';
    this.state.editor.resizePreset = 'HD';
    this.renderEditorCanvas();
  },

  rotateImageEditor() {
    if (!this.state.editor) return;
    this.state.editor.rotation = (this.state.editor.rotation + 90) % 360;
    this.renderEditorCanvas();
  },

  renderEditorCanvas() {
    if (!this.state.editor || !this.state.editor.img) return;

    const canvas = this.els.editorCanvas;
    const ctx = canvas.getContext('2d');
    const img = this.state.editor.img;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // draw image with rotation centered
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    const rot = (this.state.editor.rotation * Math.PI) / 180;
    ctx.rotate(rot);

    // Determine draw size
    // When rotated 90/270, swap fit aspect
    const drawW = canvas.width;
    const drawH = canvas.height;

    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    // Crop overlay
    const crop = this.state.editor.cropPx;
    if (crop) {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Clear crop area
      ctx.clearRect(crop.x, crop.y, crop.w, crop.h);

      // Border
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(crop.x + 0.5, crop.y + 0.5, crop.w - 1, crop.h - 1);
      ctx.restore();
    }
  },

  async applyImageEditor() {
    if (!this.state.editor) return;

    const preset = this.els.editorResizePreset.value;
    this.state.editor.resizePreset = preset;

    const uid = this.state.editor.uid;
    const photo = this.findPhotoByUid(uid);
    if (!photo) {
      this.showToast('写真なし / No photo', 'error');
      return;
    }

    try {
      const editedBlob = await this.exportEditedBlob(photo, this.state.editor);
      if (!editedBlob) throw new Error('Export failed');

      photo.blob = editedBlob;
      photo.edits = photo.edits || {};
      photo.edits.rotation = this.state.editor.rotation;
      photo.edits.resizePreset = preset;

      // crop saved normalized based on canvas (best-effort)
      if (this.state.editor.cropPx) {
        const c = this.els.editorCanvas;
        photo.edits.crop = {
          x: PhotoAuditUtils.clamp(this.state.editor.cropPx.x / c.width, 0, 1),
          y: PhotoAuditUtils.clamp(this.state.editor.cropPx.y / c.height, 0, 1),
          w: PhotoAuditUtils.clamp(this.state.editor.cropPx.w / c.width, 0, 1),
          h: PhotoAuditUtils.clamp(this.state.editor.cropPx.h / c.height, 0, 1)
        };
      }

      this.renderPhotosList();

      // If in capture preview, refresh preview image
      if (this.state.currentScreen === 'editor' && this.state.editor.from === 'capturePreview') {
        // close editor then reopen preview image
        this.closeImageEditor(false);
        this.openCapturePreview(uid);
      } else {
        this.closeImageEditor(true);
      }

      this.showToast('編集適用 / Applied', 'success');
    } catch (err) {
      console.error('[PhotoAuditTool] applyImageEditor error:', err);
      this.showToast(`編集失敗 / Edit failed: ${err.message || 'Unknown'}`, 'error', 6000);
    }
  },

  async exportEditedBlob(photo, editorState) {
    // Step 1: draw image to offscreen canvas scaled to HD-ish (or original) before crop
    const sourceBlob = photo.originalBlob || photo.blob;

    const img = await this.blobToImage(sourceBlob);

    // determine initial base canvas size
    let baseW = img.width;
    let baseH = img.height;

    // Apply preset scaling first (except ORIGINAL)
    const preset = editorState.resizePreset;

    if (preset === 'HD') {
      const { w, h } = this.fitWithin(baseW, baseH, PHOTO_AUDIT_CONFIG.IMAGE_TARGET_WIDTH, PHOTO_AUDIT_CONFIG.IMAGE_TARGET_HEIGHT);
      baseW = w;
      baseH = h;
    } else if (preset === '200KB') {
      const { w, h } = this.fitWithin(baseW, baseH, 1280, 720);
      baseW = w;
      baseH = h;
    } else if (preset === 'ORIGINAL') {
      // keep baseW/baseH
    }

    // Rotation applied at draw time
    const rot = (editorState.rotation || 0) % 360;
    const rotated = rot === 90 || rot === 270;

    const drawW = baseW;
    const drawH = baseH;

    // Offscreen canvas for full image (post-scale + rotation)
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = rotated ? drawH : drawW;
    fullCanvas.height = rotated ? drawW : drawH;

    const fctx = fullCanvas.getContext('2d');

    // Draw with rotation
    fctx.save();
    fctx.translate(fullCanvas.width / 2, fullCanvas.height / 2);
    fctx.rotate((rot * Math.PI) / 180);
    fctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    fctx.restore();

    // Step 2: crop based on editor crop rectangle in canvas space
    // We crop using ratio of editor canvas -> fullCanvas
    let cropX = 0,
      cropY = 0,
      cropW = fullCanvas.width,
      cropH = fullCanvas.height;

    const cropPx = editorState.cropPx;
    if (cropPx && this.els.editorCanvas) {
      const ec = this.els.editorCanvas;
      const sx = cropPx.x / ec.width;
      const sy = cropPx.y / ec.height;
      const sw = cropPx.w / ec.width;
      const sh = cropPx.h / ec.height;

      cropX = Math.floor(fullCanvas.width * sx);
      cropY = Math.floor(fullCanvas.height * sy);
      cropW = Math.max(1, Math.floor(fullCanvas.width * sw));
      cropH = Math.max(1, Math.floor(fullCanvas.height * sh));
    }

    const outCanvas = document.createElement('canvas');
    outCanvas.width = cropW;
    outCanvas.height = cropH;

    const octx = outCanvas.getContext('2d');
    octx.drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    // Step 3: compress/quality
    if (preset === '200KB') {
      const blob200 = await this.canvasToTargetSizeBlob(outCanvas, PHOTO_AUDIT_CONFIG.IMAGE_TARGET_SIZE_KB);
      return blob200;
    }

    const quality = preset === 'ORIGINAL' ? PHOTO_AUDIT_CONFIG.IMAGE_QUALITY_ORIGINAL : PHOTO_AUDIT_CONFIG.IMAGE_QUALITY_HD;
    return await this.canvasToBlob(outCanvas, 'image/jpeg', quality);
  },

  fitWithin(w, h, maxW, maxH) {
    if (!w || !h) return { w: maxW, h: maxH };
    if (w <= maxW && h <= maxH) return { w, h };
    const ratio = Math.min(maxW / w, maxH / h);
    return { w: Math.round(w * ratio), h: Math.round(h * ratio) };
  },

  blobToImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
        resolve(img);
      };
      img.onerror = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
        reject(new Error('Image load error'));
      };
      img.src = url;
    });
  },

  canvasToBlob(canvas, mime = 'image/jpeg', quality = 0.92) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (!b) reject(new Error('Canvas toBlob failed'));
          else resolve(b);
        },
        mime,
        quality
      );
    });
  },

  async canvasToTargetSizeBlob(canvas, targetKB) {
    // Iteratively reduce quality until <= target
    let q = 0.92;
    let blob = await this.canvasToBlob(canvas, 'image/jpeg', q);

    const targetBytes = targetKB * 1024;
    if (blob.size <= targetBytes) return blob;

    for (let i = 0; i < 12; i++) {
      q = Math.max(0.25, q - 0.06);
      blob = await this.canvasToBlob(canvas, 'image/jpeg', q);
      if (blob.size <= targetBytes) return blob;
    }
    return blob;
  },

  /* ============================================================================
   * SEND ALL PHOTOS (Batch Email)
   * ============================================================================ */
  async sendAllPhotos() {
    if (this.state.sending) return;

    if (this.state.photos.length === 0) {
      this.showToast('写真なし / No photos', 'error');
      return;
    }

    // Validate main form
    const employeeName = this.state.mainForm.selectedEmployee?.name || this.els.employeeInput.value.trim();
    if (!employeeName) {
      this.showToast('撮影者選択 / Select employee', 'error');
      this.els.employeeInput.focus();
      return;
    }

    // Sync CC from rows
    this.syncCCRecipientsFromRows();

    // Save CC if enabled
    this.saveCCToStorageNow(false);

    const btn = this.els.btnSendPhotos;
    btn.disabled = true;
    this.state.sending = true;
    btn.innerHTML = `<span class="pa-loading-spinner"></span><span>Sending...</span>`;

    try {
      // Upload all photos
      console.log('[PhotoAuditTool] Uploading photos...');
      const uploadedPhotos = [];

      for (let i = 0; i < this.state.photos.length; i++) {
        const photo = this.state.photos[i];

        // Keep existing behavior: send HD resized
        const processedBlob = await this.resizeImage(photo.blob, 'hd');

        const fileName = this.generateFileName(photo, i);
        photo.fileName = fileName;

        await SupabasePhotoClient.uploadFile(PHOTO_AUDIT_CONFIG.STORAGE_BUCKET, fileName, processedBlob);
        const photoUrl = SupabasePhotoClient.getPublicUrl(PHOTO_AUDIT_CONFIG.STORAGE_BUCKET, fileName);

        const photoData = {
          fileName,
          originalFileName: photo.originalName || fileName,
          url: photoUrl
        };

        if (photo.photoInfo) {
          if (photo.photoInfo.moldCode) photoData.moldCode = photo.photoInfo.moldCode;
          if (photo.photoInfo.moldName) photoData.moldName = photo.photoInfo.moldName;
          if (photo.photoInfo.dimensionL) photoData.dimensionL = photo.photoInfo.dimensionL;
          if (photo.photoInfo.dimensionW) photoData.dimensionW = photo.photoInfo.dimensionW;
          if (photo.photoInfo.dimensionD) photoData.dimensionD = photo.photoInfo.dimensionD;
        }

        if (photo.setAsThumbnail) photoData.setAsThumbnail = true;

        uploadedPhotos.push(photoData);
      }

      console.log('[PhotoAuditTool] All photos uploaded.');

      // Prepare main form data
      let mainMoldCode = '';
      let mainMoldName = '';
      let mainMoldId = '';

      if (this.state.mainForm.selectedMold && !this.state.mainForm.isManualMold) {
        mainMoldCode = this.state.mainForm.selectedMold.code;
        mainMoldName = this.state.mainForm.selectedMold.name;
        mainMoldId = this.state.mainForm.selectedMold.id;
      } else if (this.els.moldInput.value.trim()) {
        mainMoldName = this.els.moldInput.value.trim();
        mainMoldCode = this.generateMoldCodeFromName(mainMoldName);
      }

      const employeeId = this.state.mainForm.selectedEmployee?.id;

      const payload = {
        // Default info used as fallback in email template
        moldCode: mainMoldCode || 'BATCH',
        moldName: mainMoldName || 'Multiple Photos',
        moldId: mainMoldId || null,

        dimensionL: this.state.mainForm.dimensions.length || null,
        dimensionW: this.state.mainForm.dimensions.width || null,
        dimensionD: this.state.mainForm.dimensions.depth || null,

        photos: uploadedPhotos,

        employee: employeeName,
        employeeId: employeeId || null,
        date: PhotoAuditUtils.formatDateTime(),
        notes: this.state.mainForm.notes || '',

        recipients: [PHOTO_AUDIT_CONFIG.PRIMARY_RECIPIENT],  // ✅ Đưa vào mảng
        ccRecipients: this.state.ccRecipients || []

      };

      console.log('[PhotoAuditTool] Sending batch email...', payload);

      const result = await SupabasePhotoClient.callEdgeFunction('send-photo-audit', payload);
      console.log('[PhotoAuditTool] Email sent:', result);

      this.showToast('送信完了 / Email sent successfully', 'success', 2500);

      setTimeout(() => {
        this.closeSettings();
        this.resetState();
      }, 1200);
    } catch (err) {
      console.error('[PhotoAuditTool] Send error:', err);
      const errorMsg = err.message || 'Unknown error';
      this.showToast(`送信エラー / Send error: ${errorMsg}`, 'error', 8000);

      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-paper-plane"></i><span>Send</span>`;
    } finally {
      this.state.sending = false;
    }
  },

  /* ============================================================================
   * RESIZE IMAGE (kept, used in sendAllPhotos)
   * ============================================================================ */
  async resizeImage(blob, mode) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {}

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        let width = img.width;
        let height = img.height;

        if (mode === 'hd') {
          const maxWidth = PHOTO_AUDIT_CONFIG.IMAGE_TARGET_WIDTH;
          const maxHeight = PHOTO_AUDIT_CONFIG.IMAGE_TARGET_HEIGHT;
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
        } else if (mode === 'compressed') {
          const maxWidth = 1280;
          const maxHeight = 720;
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
        }

        canvas.width = width;
        canvas.height = height;

        ctx.drawImage(img, 0, 0, width, height);

        const quality = mode === 'compressed' ? PHOTO_AUDIT_CONFIG.IMAGE_QUALITY_COMPRESSED : PHOTO_AUDIT_CONFIG.IMAGE_QUALITY_HD;

        canvas.toBlob(
          (resultBlob) => {
            if (!resultBlob) {
              reject(new Error('Canvas toBlob failed'));
              return;
            }
            resolve(resultBlob);
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
        reject(new Error('Image load error'));
      };

      img.src = url;
    });
  },

  /* ============================================================================
   * FILENAME GENERATION (kept)
   * ============================================================================ */
  generateMoldCodeFromName(name) {
    if (!name) return 'UNKNOWN';
    return (
      name
        .toString()
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .substring(0, 12) || 'UNKNOWN'
    );
  },

  generateFileName(photo, index) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const dateStr = `${y}${m}${d}`;
    const timeStr = `${hh}${mm}${ss}`;

    let moldCode = 'PHOTO';

    // Prefer photo-specific mold code
    if (photo.photoInfo && photo.photoInfo.moldCode) {
      moldCode = photo.photoInfo.moldCode;
    } else if (this.state.mainForm.selectedMold && !this.state.mainForm.isManualMold) {
      moldCode = this.state.mainForm.selectedMold.code || 'PHOTO';
    } else if (this.els.moldInput && this.els.moldInput.value.trim()) {
      moldCode = this.generateMoldCodeFromName(this.els.moldInput.value.trim());
    }

    moldCode = (moldCode || 'PHOTO')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 20);

    if (!moldCode) moldCode = 'PHOTO';

    if (photo.source === 'file' && photo.originalName) {
      const dot = photo.originalName.lastIndexOf('.');
      const ext = dot >= 0 ? photo.originalName.substring(dot) : '.jpg';
      const baseName = (dot >= 0 ? photo.originalName.substring(0, dot) : photo.originalName)
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .substring(0, 50);
      return `${baseName}-${dateStr}-${timeStr}${ext || '.jpg'}`;
    }

    return `${moldCode}-${dateStr}-${timeStr}-${String(index + 1).padStart(2, '0')}.jpg`;
  },

    async canvasToTargetSizeBlob(canvas, targetKB) {
    let q = 0.92;
    let blob = await this.canvasToBlob(canvas, 'image/jpeg', q);
    const targetBytes = targetKB * 1024;
    if (blob.size <= targetBytes) return blob;
    
    for (let i = 0; i < 12; i++) {
      q = Math.max(0.25, q - 0.06);
      blob = await this.canvasToBlob(canvas, 'image/jpeg', q);
      if (blob.size <= targetBytes) return blob;
    }
    return blob;
  },

  /* ============================================================================
   * SEND ALL PHOTOS (Batch Email)
   * ============================================================================ */
  async sendAllPhotos() {
    if (this.state.sending) return;

    if (this.state.photos.length === 0) {
      this.showToast('写真なし / No photos', 'error');
      return;
    }

    // Validate main form
    const employeeName = this.state.mainForm.selectedEmployee?.name || this.els.employeeInput.value.trim();
    if (!employeeName) {
      this.showToast('撮影者選択 / Select employee', 'error');
      this.els.employeeInput.focus();
      return;
    }

    const btn = this.els.btnSendPhotos;
    btn.disabled = true;
    this.state.sending = true;
    btn.innerHTML = `<span class="pa-loading-spinner"></span><span>Sending...</span>`;

    try {
      // Step 1: Upload all photos
      console.log('[PhotoAuditTool] Uploading photos...');
      const uploadedPhotos = [];

      for (let i = 0; i < this.state.photos.length; i++) {
        const photo = this.state.photos[i];

        // Resize image
        const processedBlob = await this.resizeImage(photo.blob, 'hd');

        const fileName = this.generateFileName(photo, i);
        photo.fileName = fileName;

        await SupabasePhotoClient.uploadFile(PHOTO_AUDIT_CONFIG.STORAGE_BUCKET, fileName, processedBlob);
        const photoUrl = SupabasePhotoClient.getPublicUrl(PHOTO_AUDIT_CONFIG.STORAGE_BUCKET, fileName);

        const photoData = {
          fileName,
          originalFileName: photo.originalName || fileName,
          url: photoUrl
        };

        if (photo.photoInfo) {
          if (photo.photoInfo.moldCode) photoData.moldCode = photo.photoInfo.moldCode;
          if (photo.photoInfo.moldName) photoData.moldName = photo.photoInfo.moldName;
          if (photo.photoInfo.dimensionL) photoData.dimensionL = photo.photoInfo.dimensionL;
          if (photo.photoInfo.dimensionW) photoData.dimensionW = photo.photoInfo.dimensionW;
          if (photo.photoInfo.dimensionD) photoData.dimensionD = photo.photoInfo.dimensionD;
        }

        if (photo.setAsThumbnail) photoData.setAsThumbnail = true;

        uploadedPhotos.push(photoData);
      }

      console.log('[PhotoAuditTool] All photos uploaded:', uploadedPhotos.length);

      // Step 2: Prepare main form data
      let mainMoldCode = '';
      let mainMoldName = '';
      let mainMoldId = '';

      if (this.state.mainForm.selectedMold && !this.state.mainForm.isManualMold) {
        mainMoldCode = this.state.mainForm.selectedMold.code;
        mainMoldName = this.state.mainForm.selectedMold.name;
        mainMoldId = this.state.mainForm.selectedMold.id;
      } else if (this.els.moldInput.value.trim()) {
        mainMoldName = this.els.moldInput.value.trim();
        mainMoldCode = this.generateMoldCodeFromName(mainMoldName);
      }

      const employeeId = this.state.mainForm.selectedEmployee?.id || '';

      // Step 3: Send batch email (compatible with Edge Function R2.3.5)
      const payload = {
        // Main mold info (used as default)
        moldCode: mainMoldCode || 'BATCH',
        moldName: mainMoldName || 'Multiple Photos',
        moldId: mainMoldId || '',

        dimensionL: this.state.mainForm.dimensions.length || '',
        dimensionW: this.state.mainForm.dimensions.width || '',
        dimensionD: this.state.mainForm.dimensions.depth || '',

        // Batch photos array
        photos: uploadedPhotos,

        // Employee & date
        employee: employeeName,
        employeeId: employeeId,
        date: PhotoAuditUtils.formatDateTime(),

        // Notes & recipients
        notes: this.state.mainForm.notes || '',
        
        // ✅ FIX: Wrap primary recipient in array
        recipients: [PHOTO_AUDIT_CONFIG.PRIMARY_RECIPIENT],
        ccRecipients: this.state.ccRecipients || []
      };

      console.log('[PhotoAuditTool] Sending batch email...', {
        moldCode: payload.moldCode,
        photoCount: uploadedPhotos.length,
        recipients: payload.recipients,
        ccRecipients: payload.ccRecipients
      });

      const result = await SupabasePhotoClient.callEdgeFunction('send-photo-audit', payload);
      console.log('[PhotoAuditTool] Email sent successfully:', result);

      this.showToast('送信完了 / Email sent successfully', 'success', 2500);

      setTimeout(() => {
        this.closeSettings();
        this.resetState();
      }, 1200);
      
    } catch (err) {
      console.error('[PhotoAuditTool] Send error:', err);
      const errorMsg = err.message || 'Unknown error';
      this.showToast(`送信エラー / Send error: ${errorMsg}`, 'error', 8000);

      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-paper-plane"></i><span>Send</span>`;
    } finally {
      this.state.sending = false;
    }
  },


  buildEmailData(uploadedPhotos) {
    const mainMoldCode = this.state.mainForm.selectedMold?.code || this.els.moldInput.value.trim() || '';
    const mainMoldName = this.state.mainForm.selectedMold?.name || '';
    const employeeName = this.state.mainForm.selectedEmployee?.name || this.els.employeeInput.value.trim() || '';
    const mainDimL = this.state.mainForm.dimensions.length || '';
    const mainDimW = this.state.mainForm.dimensions.width || '';
    const mainDimD = this.state.mainForm.dimensions.depth || '';
    const notes = this.state.mainForm.notes || '';

    const photosData = uploadedPhotos.map((photo) => {
      const moldCode = photo.moldCode || mainMoldCode;
      const moldName = photo.moldName || mainMoldName;
      const dimL = photo.dimensionL || mainDimL;
      const dimW = photo.dimensionW || mainDimW;
      const dimD = photo.dimensionD || mainDimD;

      return {
        fileName: photo.fileName,
        originalFileName: photo.originalFileName,
        url: photo.url,
        moldCode,
        moldName,
        dimensionL: dimL,
        dimensionW: dimW,
        dimensionD: dimD,
        setAsThumbnail: photo.setAsThumbnail
      };
    });

    const thumbnailPhoto = photosData.find((p) => p.setAsThumbnail) || photosData[0];
    const ccRecipients = this.state.ccRecipients.filter((e) => PhotoAuditUtils.isValidEmail(e));

    return {
      to: PHOTO_AUDIT_CONFIG.PRIMARY_RECIPIENT,
      cc: ccRecipients,
      subject: `[写真監査] ${mainMoldCode || 'New Photo Audit'} - ${PhotoAuditUtils.formatDateJP()}`,
      employeeName,
      moldCode: mainMoldCode,
      moldName: mainMoldName,
      dimensionL: mainDimL,
      dimensionW: mainDimW,
      dimensionD: mainDimD,
      notes,
      photos: photosData,
      thumbnailUrl: thumbnailPhoto?.url || '',
      capturedAt: PhotoAuditUtils.nowISO()
    };
  },

  generateFileName(photo, index) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const timeStr = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
    const moldCode = (this.state.mainForm.selectedMold?.code || 'UNKNOWN').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${moldCode}-${dateStr}-${timeStr}-${String(index + 1).padStart(2, '0')}.jpg`;
  },

  async resizeImage(blob, preset = 'hd') {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {}

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        let width = img.width;
        let height = img.height;

        const maxW = PHOTO_AUDIT_CONFIG.IMAGE_TARGET_WIDTH;
        const maxH = PHOTO_AUDIT_CONFIG.IMAGE_TARGET_HEIGHT;

        if (width > maxW || height > maxH) {
          const ratio = Math.min(maxW / width, maxH / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (resizedBlob) => {
            if (!resizedBlob) {
              reject(new Error('Failed to resize image'));
            } else {
              resolve(resizedBlob);
            }
          },
          'image/jpeg',
          PHOTO_AUDIT_CONFIG.IMAGE_QUALITY_HD
        );
      };

      img.onerror = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
        reject(new Error('Failed to load image'));
      };

      img.src = url;
    });
  },

  /* ============================================================================
   * TOAST
   * ============================================================================ */
  showToast(message, type = 'info', duration = PHOTO_AUDIT_CONFIG.TOAST_DURATION) {
    const existing = document.querySelectorAll('.pa-toast');
    existing.forEach((t) => t.remove());

    const toast = PhotoAuditUtils.createEl('div', { class: `pa-toast pa-toast-${type}` });

    const icons = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      warning: 'fa-exclamation-triangle',
      info: 'fa-info-circle'
    };

    toast.innerHTML = `
      <i class="fas ${icons[type] || icons.info}"></i>
      <span>${PhotoAuditUtils.escapeHtml(String(message)).replace(/\n/g, '<br>')}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('pa-toast-show'), 10);
    setTimeout(() => {
      toast.classList.remove('pa-toast-show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  /* ============================================================================
   * PUBLIC API - OPEN/CLOSE SETTINGS
   * ============================================================================ */
  openSettings(options = {}) {
    console.log('[PhotoAuditTool] openSettings called');

    if (!this.state.initialized) {
      console.warn('[PhotoAuditTool] Not initialized, initializing now...');
      this.init();
      setTimeout(() => this.openSettingsUI(options), 500);
      return;
    }

    this.openSettingsUI(options);
  },

  openSettingsUI(options = {}) {
    // Save launch context if any
    this.state.launchContext.source = options.source || this.state.launchContext.source || null;
    this.state.launchContext.deviceType = options.type || this.state.launchContext.deviceType || null;
    this.state.launchContext.deviceData = options.deviceData || this.state.launchContext.deviceData || null;
    this.state.launchContext.autoOpenCamera = !!options.autoOpenCamera;

    // Auto-fill device info if opened from mobile detail modal
    if (this.state.launchContext.source === 'mobile-detail-modal' && this.state.launchContext.deviceData) {
      this.autoFillDeviceInfo(this.state.launchContext.deviceData);
    }

    // Reload CC from storage
    this.initCCRowsUI();
    this.renderCCRecipientList();
    this.renderPhotosList();

    // Show modal
    this.showSettings();

    // Auto open camera if requested
    if (this.state.launchContext.autoOpenCamera) {
      setTimeout(() => {
        this.openCamera();
      }, 300);
    }
  },

  autoFillDeviceInfo(deviceData) {
    console.log('[PhotoAuditTool] Auto-filling device info:', deviceData);

    // Try to find mold by various ID fields
    let mold = null;

    if (deviceData.MoldID) {
      mold = this.state.molds.find((m) => String(m.MoldID) === String(deviceData.MoldID));
    } else if (deviceData.moldId) {
      mold = this.state.molds.find((m) => String(m.MoldID) === String(deviceData.moldId));
    } else if (deviceData.CutterID && this.state.launchContext.deviceType === 'cutter') {
      // For cutters, try to find associated mold if any
      const cutterData = deviceData;
      if (cutterData.MoldID) {
        mold = this.state.molds.find((m) => String(m.MoldID) === String(cutterData.MoldID));
      }
    }

    // If mold found, select it
    if (mold) {
      this.selectMold(mold);
    } else {
      // Manual entry from device code/name
      const code = deviceData.MoldCode || deviceData.CutterCode || deviceData.code || '';
      const name = deviceData.MoldName || deviceData.CutterName || deviceData.name || '';

      if (code || name) {
        this.els.moldInput.value = code || name;
        this.state.mainForm.isManualMold = true;
        this.updateMoldBadge();
      }
    }

    // Auto-fill dimensions if available
    const dimL = deviceData.MoldLength || deviceData.Length || deviceData.dimensionL || '';
    const dimW = deviceData.MoldWidth || deviceData.Width || deviceData.dimensionW || '';
    const dimD = deviceData.MoldDepth || deviceData.Depth || deviceData.MoldHeight || deviceData.dimensionD || '';

    if (dimL || dimW || dimD) {
      this.state.mainForm.dimensions.length = dimL ? String(dimL) : '';
      this.state.mainForm.dimensions.width = dimW ? String(dimW) : '';
      this.state.mainForm.dimensions.depth = dimD ? String(dimD) : '';

      this.state.mainForm.dimensionsSource.length = dimL ? 'deviceData' : null;
      this.state.mainForm.dimensionsSource.width = dimW ? 'deviceData' : null;
      this.state.mainForm.dimensionsSource.depth = dimD ? 'deviceData' : null;

      this.updateDimensionInputs();
    }

    console.log('[PhotoAuditTool] Device info auto-filled');
  },

  showSettings() {
    if (!this.els.root) return;
    this.els.root.classList.remove('pa-hidden');
    this.state.currentScreen = 'settings';
    document.body.style.overflow = 'hidden';
  },

  closeSettings() {
    console.log('[PhotoAuditTool] Closing settings...');

    if (this.els.root) this.els.root.classList.add('pa-hidden');
    document.body.style.overflow = '';
    this.state.currentScreen = null;

    // Reset launch context
    this.state.launchContext = {
      source: null,
      deviceType: null,
      deviceData: null,
      autoOpenCamera: false
    };
  },

  resetState() {
    console.log('[PhotoAuditTool] Resetting state...');

    // Clear photos
    this.state.photos = [];
    this.state.currentPhotoIndex = -1;

    // Clear main form (keep employee)
    this.state.mainForm.selectedMold = null;
    this.state.mainForm.isManualMold = false;
    this.state.mainForm.dimensions = { length: '', width: '', depth: '' };
    this.state.mainForm.dimensionsSource = { length: null, width: null, depth: null };
    this.state.mainForm.notes = '';

    // Clear UI
    if (this.els.moldInput) this.els.moldInput.value = '';
    if (this.els.dimLength) this.els.dimLength.value = '';
    if (this.els.dimWidth) this.els.dimWidth.value = '';
    if (this.els.dimDepth) this.els.dimDepth.value = '';
    if (this.els.notes) this.els.notes.value = '';

    this.updateMoldBadge();
    this.renderPhotosList();
    this.autoResizeNotes();
  },

  /* ============================================================================
   * GLOBAL HOOKS
   * ============================================================================ */
  bindGlobalHooks() {
    // Listen for external triggers (e.g., navbar button, mobile detail modal)
    document.addEventListener('photoAudit:open', (e) => {
      const options = e.detail || {};
      this.openSettings(options);
    });

    // Listen for mobile-detail-modal specific trigger
    document.addEventListener('mobile-detail-modal:photoAudit', (e) => {
      const options = {
        source: 'mobile-detail-modal',
        type: e.detail?.type || 'device',
        deviceData: e.detail?.deviceData || null,
        autoOpenCamera: e.detail?.autoOpenCamera || false
      };
      this.openSettings(options);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Shift + P => Open Photo Audit Tool
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        this.openSettings();
      }

      // ESC to close (only if tool is open and not sending)
      if (e.key === 'Escape' && this.state.currentScreen && !this.state.sending) {
        e.preventDefault();
        if (this.state.currentScreen === 'editor') {
          this.closeImageEditor(true);
        } else if (this.state.currentScreen === 'capturePreview') {
          this.closeCapturePreview(true);
        } else if (this.state.currentScreen === 'photoList') {
          this.closePhotoList();
        } else if (this.state.currentScreen === 'photoDetail') {
          this.closePhotoDetail();
        } else if (this.state.currentScreen === 'camera') {
          this.closeCamera();
        } else if (this.state.currentScreen === 'settings') {
          this.closeSettings();
        }
      }
    });
  }
};

/* ============================================================================
 * AUTO INITIALIZATION
 * ============================================================================ */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => PhotoAuditTool.init());
} else {
  PhotoAuditTool.init();
}

// Expose to window for external access
if (typeof window !== 'undefined') {
  window.PhotoAuditTool = PhotoAuditTool;
}

console.log(`✅ Photo Audit Tool v${PHOTO_AUDIT_META.VERSION} script loaded`);
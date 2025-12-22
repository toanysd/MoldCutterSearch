/**
 * ============================================================================
 * PHOTO AUDIT TOOL - R2.3.0
 * 写真監査ツール / Công cụ kiểm tra ảnh khuôn
 * ============================================================================
 *
 * NEW FEATURES IN R2.3.0:
 * - ✅ Multi-photo support: Upload/capture multiple photos in one session
 * - ✅ Photo management: View, delete, retake photos
 * - ✅ Image editing: Crop & rotate before sending
 * - ✅ Flexible validation: Only validate required fields before sending
 * - ✅ Better UI: Display filename, size, datetime for each photo
 * - ✅ Thumbnail linking: Link photos to molds as thumbnails
 * - ✅ Email improvements: Single recipient, CC others in body
 * - ✅ Resize options: Original, HD, Compressed with size preview
 *
 * Created: 2025-12-22
 * Version: 2.3.0
 * ============================================================================
 */

'use strict';

/* ============================================================================
 * CONSTANTS
 * ============================================================================ */
const PHOTO_AUDIT_CONFIG = {
  STORAGE_BUCKET: 'mold-photos',
  DEFAULT_EMPLOYEE_ID: '1', // Toan-san
  PRIMARY_RECIPIENT: 'toan.ysd@gmail.com', // ✅ Single primary recipient
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
  MAX_PHOTOS_PER_SESSION: 10
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

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
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
  }
};

/* ============================================================================
 * SUPABASE CLIENT
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
          'Authorization': `Bearer ${this.config.anonKey}`
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
    
    // Selection
    selectedMold: null, // { id, code, name }
    isManualMold: false,
    selectedEmployee: null, // { id, name }
    isManualEmployee: false,
    
    // Dimensions
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
    
    // Additional fields
    notes: '',
    ccRecipients: [], // ✅ NEW: Additional recipients (will be in email body as CC)
    setAsThumbnail: false, // ✅ NEW: Link photo to mold as thumbnail
    
    // Camera
    stream: null,
    facingMode: 'environment',
    gridEnabled: false,
    
    // ✅ NEW: Multi-photo support
    photos: [], // Array of { uid, blob, source, fileName, originalName, capturedAt, processed: false }
    currentPhotoIndex: -1, // For editing/previewing
    
    // Image processing options
    resizeMode: 'hd', // 'original' | 'hd' | 'compressed'
    
    // UI
    currentScreen: null, // 'settings' | 'camera' | 'preview' | 'edit'
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
    
    console.log('📷 [PhotoAuditTool v2.3.0] Initializing...');
    
    if (!window.DataManager || !window.DataManager.loaded) {
      console.warn('⏳ [PhotoAuditTool] DataManager not ready, waiting...');
      document.addEventListener('data-manager:ready', () => this.init(), { once: true });
      return;
    }
    
    this.loadData();
    this.buildUI();
    this.bindGlobalHooks();
    this.state.initialized = true;
    
    console.log('✅ [PhotoAuditTool v2.3.0] Initialized successfully!');
    
    document.dispatchEvent(new CustomEvent('photoAuditTool:ready', {
      detail: { version: '2.3.0' }
    }));
  },

  /* ============================================================================
   * LOAD DATA FROM DATAMANAGER
   * ============================================================================ */
  loadData() {
    const dm = window.DataManager.data;
    this.state.molds = dm.molds || [];
    this.state.employees = dm.employees || [];
    
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
      defaultEmployee: this.state.selectedEmployee?.name
    });
  },

  /* ============================================================================
   * BUILD UI
   * ============================================================================ */
  buildUI() {
    this.buildSettingsScreen();
    this.buildCameraScreen();
    this.buildPreviewScreen();
    this.buildEditScreen();
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
    
    // ------ ROW 1: MOLD AUTOCOMPLETE ------
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
    
    // ------ ROW 2: EMPLOYEE AUTOCOMPLETE ------
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
    
    // ------ ROW 3: DIMENSIONS (3 columns) ------
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
    
    // ------ ROW 4: NOTES ------
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
    
    // ------ ROW 5: CC RECIPIENTS (NEW) ------
    const rowCC = ce('div', { class: 'pa-form-row' });
    rowCC.innerHTML = `
      <label class="pa-label">
        <span class="ja">CC送信先</span>
        <span class="vi">CC Recipients (hiển thị trong email)</span>
      </label>
      <div class="pa-recipient-list" id="pa-cc-recipient-list"></div>
      <div class="pa-recipient-input-group">
        <input
          type="email"
          class="pa-input pa-recipient-input"
          id="pa-cc-recipient-input"
          placeholder="example@ysd-pack.co.jp"
        />
        <button class="pa-btn pa-btn-icon" id="pa-btn-add-cc-recipient" title="Add CC recipient">
          <i class="fas fa-plus"></i>
        </button>
      </div>
      <small class="pa-hint">✉️ Primary: ${PHOTO_AUDIT_CONFIG.PRIMARY_RECIPIENT}</small>
    `;
    
    // ------ ROW 6: THUMBNAIL OPTION (NEW) ------
    const rowThumbnail = ce('div', { class: 'pa-form-row' });
    rowThumbnail.innerHTML = `
      <label class="pa-checkbox-label">
        <input type="checkbox" id="pa-set-thumbnail" class="pa-checkbox" />
        <span class="ja">この写真を金型のサムネイルとして設定</span>
        <span class="vi">Đặt làm ảnh đại diện khuôn</span>
      </label>
    `;
    
    // ------ ROW 7: PHOTOS LIST (NEW) ------
    const rowPhotos = ce('div', { class: 'pa-form-row' });
    rowPhotos.innerHTML = `
      <label class="pa-label">
        <span class="ja">撮影済み写真</span>
        <span class="vi">Ảnh đã chụp</span>
      </label>
      <div class="pa-photos-list" id="pa-photos-list"></div>
    `;
    
    // Assemble form
    form.appendChild(rowMold);
    form.appendChild(rowEmployee);
    form.appendChild(rowDimensions);
    form.appendChild(rowNotes);
    form.appendChild(rowCC);
    form.appendChild(rowThumbnail);
    form.appendChild(rowPhotos);
    
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
      multiple: 'true' // ✅ Allow multiple files
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
    this.els.ccRecipientList = PhotoAuditUtils.$('#pa-cc-recipient-list');
    this.els.ccRecipientInput = PhotoAuditUtils.$('#pa-cc-recipient-input');
    this.els.setThumbnail = PhotoAuditUtils.$('#pa-set-thumbnail');
    this.els.photosList = PhotoAuditUtils.$('#pa-photos-list');
    this.els.fileInput = PhotoAuditUtils.$('#pa-file-input');
    this.els.btnSendPhotos = PhotoAuditUtils.$('#pa-btn-send-photos');
    
    // Populate default employee
    if (this.state.selectedEmployee) {
      this.els.employeeInput.value = this.state.selectedEmployee.name;
      this.updateEmployeeBadge();
    }
    
    this.renderCCRecipientList();
    this.renderPhotosList();
    this.bindSettingsEvents();
  },

  // ... (tiếp tục trong Part 2)
  /* ============================================================================
   * UPDATE BADGES
   * ============================================================================ */
  updateMoldBadge() {
    if (!this.els.moldBadge) return;
    if (this.state.selectedMold && !this.state.isManualMold) {
      this.els.moldBadge.textContent = '自動 / Auto';
      this.els.moldBadge.className = 'pa-input-badge pa-badge-auto';
      this.els.moldBadge.classList.remove('pa-hidden');
    } else if (this.state.isManualMold) {
      this.els.moldBadge.textContent = '手動 / Manual';
      this.els.moldBadge.className = 'pa-input-badge pa-badge-manual';
      this.els.moldBadge.classList.remove('pa-hidden');
    } else {
      this.els.moldBadge.classList.add('pa-hidden');
    }
  },

  updateEmployeeBadge() {
    if (!this.els.employeeBadge) return;
    if (this.state.selectedEmployee && !this.state.isManualEmployee) {
      this.els.employeeBadge.textContent = '自動 / Auto';
      this.els.employeeBadge.className = 'pa-input-badge pa-badge-auto';
      this.els.employeeBadge.classList.remove('pa-hidden');
    } else if (this.state.isManualEmployee) {
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

    // EMPLOYEE AUTOCOMPLETE
    this.els.employeeInput.addEventListener('input', PhotoAuditUtils.debounce(() => {
      const value = this.els.employeeInput.value.trim();
      if (!value) {
        this.state.selectedEmployee = null;
        this.state.isManualEmployee = false;
        this.updateEmployeeBadge();
        this.hideEmployeeAutocomplete();
        return;
      }
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

    // DIMENSIONS
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

    // NOTES
    this.els.notes.addEventListener('input', (e) => {
      this.state.notes = e.target.value.trim();
    });

    // CC RECIPIENTS
    PhotoAuditUtils.$('#pa-btn-add-cc-recipient').addEventListener('click', (e) => {
      e.preventDefault();
      this.addCCRecipient();
    });

    this.els.ccRecipientInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.addCCRecipient();
      }
    });

    // THUMBNAIL OPTION
    this.els.setThumbnail.addEventListener('change', (e) => {
      this.state.setAsThumbnail = !!e.target.checked;
    });

    // ACTIONS
    PhotoAuditUtils.$('#pa-btn-open-camera').addEventListener('click', (e) => {
      e.preventDefault();
      // ✅ Không bắt buộc nhập trước khi chụp, chỉ cần DNI trước khi send
      this.openCamera();
    });

    PhotoAuditUtils.$('#pa-btn-upload-file').addEventListener('click', (e) => {
      e.preventDefault();
      this.els.fileInput.click();
    });

    this.els.fileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        this.handleMultipleFileUpload(files);
      }
    });

    // SEND PHOTOS
    this.els.btnSendPhotos.addEventListener('click', (e) => {
      e.preventDefault();
      this.sendAllPhotos();
    });

    // Click outside autocomplete
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.pa-autocomplete-wrapper')) {
        this.hideAllAutocomplete();
      }
    });
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
        <div class="pa-autocomplete-item-sub">
          ${e(name)} ${dim ? `<span class="pa-dim-tag">${e(dim)}</span>` : ''}
        </div>
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
    this.els.moldInput.value = mold.MoldCode || mold.MoldName || `ID:${mold.MoldID}`;
    this.updateMoldBadge();
    this.loadDimensionsForMold(mold);
    this.hideMoldAutocomplete();
  },

  loadDimensionsForMold(mold) {
    let length = '', width = '', depth = '';
    let lengthSrc = null, widthSrc = null, depthSrc = null;

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

    this.state.dimensions = { length, width, depth };
    this.state.dimensionsSource = { length: lengthSrc, width: widthSrc, depth: depthSrc };
    this.updateDimensionInputs();
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
      item.innerHTML = `<div class="pa-autocomplete-item-main">${e(name)}</div>`;
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
  },

  /* ============================================================================
   * AUTOCOMPLETE HIDE
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
   * CC RECIPIENT MANAGEMENT (Body-only CC)
   * ============================================================================ */
  addCCRecipient() {
    const email = this.els.ccRecipientInput.value.trim();
    if (!email) {
      this.showToast('メールアドレスを入力してください / Enter email', 'warning');
      return;
    }
    if (!PhotoAuditUtils.isValidEmail(email)) {
      this.showToast('無効なメールアドレス / Invalid email', 'error');
      return;
    }
    if (this.state.ccRecipients.includes(email)) {
      this.showToast('既に追加されています / Already added', 'warning');
      return;
    }
    this.state.ccRecipients.push(email);
    this.els.ccRecipientInput.value = '';
    this.renderCCRecipientList();
  },

  removeCCRecipient(email) {
    this.state.ccRecipients = this.state.ccRecipients.filter(r => r !== email);
    this.renderCCRecipientList();
  },

  renderCCRecipientList() {
    const { createElement: ce, escapeHtml: e } = PhotoAuditUtils;
    const container = this.els.ccRecipientList;
    container.innerHTML = '';

    if (this.state.ccRecipients.length === 0) {
      container.innerHTML = `
        <div class="pa-empty-state">
          <i class="fas fa-inbox"></i>
          <span>CCなし / No CC</span>
        </div>
      `;
      return;
    }

    this.state.ccRecipients.forEach(email => {
      const tag = ce('div', { class: 'pa-recipient-tag' });
      tag.innerHTML = `
        <span>${e(email)}</span>
        <button class="pa-recipient-remove" data-email="${e(email)}">
          <i class="fas fa-times"></i>
        </button>
      `;
      tag.querySelector('.pa-recipient-remove').addEventListener('click', (ev) => {
        ev.preventDefault();
        this.removeCCRecipient(email);
      });
      container.appendChild(tag);
    });
  },

  /* ============================================================================
   * PHOTOS LIST MANAGEMENT (MULTI-PHOTO)
   * ============================================================================ */
  renderPhotosList() {
    const { escapeHtml: e, formatFileSize } = PhotoAuditUtils;
    const container = this.els.photosList;
    container.innerHTML = '';

    if (!this.state.photos.length) {
      container.innerHTML = `
        <div class="pa-empty-state">
          <i class="fas fa-image"></i>
          <span>Chưa có ảnh nào / No photos</span>
        </div>
      `;
      this.els.btnSendPhotos.disabled = true;
      return;
    }

    this.els.btnSendPhotos.disabled = false;

    this.state.photos.forEach((photo, index) => {
      const row = document.createElement('div');
      row.className = 'pa-photo-row';
      row.dataset.uid = photo.uid;

      const name = photo.originalName || photo.fileName || `Photo ${index + 1}`;
      const sizeText = formatFileSize(photo.blob.size);
      const timeText = photo.capturedAt
        ? PhotoAuditUtils.formatDateTime(new Date(photo.capturedAt))
        : '';

      row.innerHTML = `
        <div class="pa-photo-info">
          <div class="pa-photo-name">${e(name)}</div>
          <div class="pa-photo-meta">
            <span>${sizeText}</span>
            ${timeText ? `<span>${timeText}</span>` : ''}
            <span>Source: ${photo.source === 'camera' ? 'Camera' : 'Upload'}</span>
          </div>
        </div>
        <div class="pa-photo-actions">
          <button class="pa-btn pa-btn-xs pa-btn-secondary pa-photo-view" data-uid="${photo.uid}">
            <i class="fas fa-eye"></i>
            <span>View</span>
          </button>
          <button class="pa-btn pa-btn-xs pa-btn-secondary pa-photo-edit" data-uid="${photo.uid}">
            <i class="fas fa-crop"></i>
            <span>Edit</span>
          </button>
          <button class="pa-btn pa-btn-xs pa-btn-danger pa-photo-delete" data-uid="${photo.uid}">
            <i class="fas fa-trash"></i>
            <span>Delete</span>
          </button>
        </div>
      `;

      container.appendChild(row);
    });

    // Bind actions
    PhotoAuditUtils.$$('.pa-photo-view', container).forEach(btn => {
      btn.addEventListener('click', (e) => {
        const uid = e.currentTarget.dataset.uid;
        this.openPreviewForPhoto(uid);
      });
    });

    PhotoAuditUtils.$$('.pa-photo-edit', container).forEach(btn => {
      btn.addEventListener('click', (e) => {
        const uid = e.currentTarget.dataset.uid;
        this.openEditForPhoto(uid);
      });
    });

    PhotoAuditUtils.$$('.pa-photo-delete', container).forEach(btn => {
      btn.addEventListener('click', (e) => {
        const uid = e.currentTarget.dataset.uid;
        this.deletePhoto(uid);
      });
    });
  },

  addPhoto(blob, source, originalName = '') {
    if (this.state.photos.length >= PHOTO_AUDIT_CONFIG.MAX_PHOTOS_PER_SESSION) {
      this.showToast('写真の枚数上限に達しました / Reached max photo count', 'warning');
      return;
    }
    const uid = PhotoAuditUtils.generateUID();
    const photo = {
      uid,
      blob,
      source,
      originalName: originalName || blob.name || '',
      fileName: '',
      capturedAt: new Date().toISOString()
    };
    this.state.photos.push(photo);
    this.state.currentPhotoIndex = this.state.photos.length - 1;
    this.renderPhotosList();
  },

  deletePhoto(uid) {
    this.state.photos = this.state.photos.filter(p => p.uid !== uid);
    if (this.state.currentPhotoIndex >= this.state.photos.length) {
      this.state.currentPhotoIndex = this.state.photos.length - 1;
    }
    this.renderPhotosList();
  },

  findPhotoByUid(uid) {
    return this.state.photos.find(p => p.uid === uid) || null;
  },

  openPreviewForPhoto(uid) {
    const index = this.state.photos.findIndex(p => p.uid === uid);
    if (index === -1) return;
    this.state.currentPhotoIndex = index;
    this.openPreviewScreen();
  },

  openEditForPhoto(uid) {
    const index = this.state.photos.findIndex(p => p.uid === uid);
    if (index === -1) return;
    this.state.currentPhotoIndex = index;
    this.openEditScreen();
  },

  /* ============================================================================
   * CAMERA SCREEN
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

    PhotoAuditUtils.$('#pa-btn-open-gallery').addEventListener('click', (e) => {
      e.preventDefault();
      this.closeCamera();
      this.showSettings(); // quay lại settings xem danh sách ảnh
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
    } catch (err) {
      throw err;
    }
  },

  stopCameraStream() {
    if (this.state.stream) {
      this.state.stream.getTracks().forEach(track => track.stop());
      this.state.stream = null;
      this.els.video.srcObject = null;
    }
  },

  async flipCamera() {
    this.state.facingMode = this.state.facingMode === 'environment' ? 'user' : 'environment';
    await this.startCameraStream();
  },

  toggleGrid() {
    this.state.gridEnabled = !this.state.gridEnabled;
    if (this.state.gridEnabled) {
      this.els.gridOverlay.classList.remove('pa-hidden');
    } else {
      this.els.gridOverlay.classList.add('pa-hidden');
    }
  },

  capturePhoto() {
    if (!this.state.stream) return;

    const video = this.els.video;
    const canvas = this.els.canvas;
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (!blob) {
        this.showToast('写真の取得に失敗しました / Failed to capture photo', 'error');
        return;
      }
      blob.name = ''; // camera: không có tên gốc
      this.addPhoto(blob, 'camera');
      this.showToast('写真を追加しました / Photo captured', 'success');
    }, 'image/jpeg', PHOTO_AUDIT_CONFIG.IMAGE_QUALITY_HD);
  },

  closeCamera() {
    this.stopCameraStream();
    this.els.cameraOverlay.classList.add('pa-hidden');
    document.body.style.overflow = '';
    this.state.currentScreen = 'settings';
  },

  /* ============================================================================
   * FILE UPLOAD (MULTIPLE)
   * ============================================================================ */
  async handleMultipleFileUpload(files) {
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        this.showToast('画像ファイルを選択してください / Select image file', 'error');
        continue;
      }
      if (file.size > PHOTO_AUDIT_CONFIG.IMAGE_MAX_SIZE) {
        this.showToast('ファイルサイズが大きすぎます / File too large (max 10MB)', 'error');
        continue;
      }
      try {
        this.addPhoto(file, 'file', file.name);
      } catch (err) {
        console.error('[PhotoAuditTool] File processing error:', err);
        this.showToast('ファイル処理エラー / File processing error', 'error');
      }
    }
    this.els.fileInput.value = '';
  },

  /* ============================================================================
   * PREVIEW SCREEN (SINGLE PHOTO VIEW)
   * ============================================================================ */
  buildPreviewScreen() {
    const { createElement: ce } = PhotoAuditUtils;

    const overlay = ce('div', {
      class: 'pa-preview-overlay pa-hidden',
      id: 'pa-preview-overlay'
    });

    const modal = ce('div', { class: 'pa-preview-modal' });

    const header = ce('div', { class: 'pa-preview-header' });
    header.innerHTML = `
      <button class="pa-btn pa-btn-xs pa-btn-secondary" id="pa-btn-preview-back">
        <i class="fas fa-arrow-left"></i>
        <span>Back</span>
      </button>
      <div class="pa-preview-title">
        <span class="ja">写真プレビュー</span>
        <span class="vi">Xem lại ảnh</span>
      </div>
      <button class="pa-btn pa-btn-xs pa-btn-secondary" id="pa-btn-preview-edit">
        <i class="fas fa-crop"></i>
        <span>Edit</span>
      </button>
    `;

    const body = ce('div', { class: 'pa-preview-body' });
    const img = ce('img', {
      class: 'pa-preview-image',
      id: 'pa-preview-image',
      alt: 'Preview'
    });

    const info = ce('div', { class: 'pa-preview-info', id: 'pa-preview-info' });

    body.appendChild(img);
    body.appendChild(info);

    const footer = ce('div', { class: 'pa-preview-footer' });
    footer.innerHTML = `
      <button class="pa-btn pa-btn-secondary" id="pa-btn-preview-retake">
        <i class="fas fa-camera"></i>
        <span>Retake</span>
      </button>
      <button class="pa-btn pa-btn-danger" id="pa-btn-preview-delete">
        <i class="fas fa-trash"></i>
        <span>Delete</span>
      </button>
      <button class="pa-btn pa-btn-primary" id="pa-btn-preview-close">
        <i class="fas fa-check"></i>
        <span>OK</span>
      </button>
    `;

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    this.els.previewOverlay = overlay;
    this.els.previewModal = modal;
    this.els.previewImage = img;
    this.els.previewInfo = info;

    this.bindPreviewEvents();
  },

  bindPreviewEvents() {
    PhotoAuditUtils.$('#pa-btn-preview-back').addEventListener('click', (e) => {
      e.preventDefault();
      this.closePreview();
      this.showSettings();
    });

    PhotoAuditUtils.$('#pa-btn-preview-edit').addEventListener('click', (e) => {
      e.preventDefault();
      this.closePreview();
      this.openEditScreen();
    });

    PhotoAuditUtils.$('#pa-btn-preview-retake').addEventListener('click', (e) => {
      e.preventDefault();
      this.closePreview();
      this.openCamera();
    });

    PhotoAuditUtils.$('#pa-btn-preview-delete').addEventListener('click', (e) => {
      e.preventDefault();
      const photo = this.state.photos[this.state.currentPhotoIndex];
      if (photo) this.deletePhoto(photo.uid);
      this.closePreview();
      this.showSettings();
    });

    PhotoAuditUtils.$('#pa-btn-preview-close').addEventListener('click', (e) => {
      e.preventDefault();
      this.closePreview();
      this.showSettings();
    });
  },

  openPreviewScreen() {
    if (this.state.currentPhotoIndex < 0 || this.state.currentPhotoIndex >= this.state.photos.length) {
      this.showToast('写真がありません / No photo', 'error');
      return;
    }

    const photo = this.state.photos[this.state.currentPhotoIndex];
    const url = URL.createObjectURL(photo.blob);

    this.els.previewImage.src = url;
    const sizeText = PhotoAuditUtils.formatFileSize(photo.blob.size);
    const timeText = photo.capturedAt
      ? PhotoAuditUtils.formatDateTime(new Date(photo.capturedAt))
      : '';
    const name = photo.originalName || photo.fileName || 'Photo';

    this.els.previewInfo.innerHTML = `
      <div>${name}</div>
      <div>${sizeText}</div>
      ${timeText ? `<div>${timeText}</div>` : ''}
      <div>Source: ${photo.source === 'camera' ? 'Camera' : 'Upload'}</div>
    `;

    this.state.currentScreen = 'preview';
    this.els.previewOverlay.classList.remove('pa-hidden');
    document.body.style.overflow = 'hidden';
  },

  closePreview() {
    if (this.els.previewOverlay) {
      this.els.previewOverlay.classList.add('pa-hidden');
      document.body.style.overflow = '';
    }
    if (this.els.previewImage && this.els.previewImage.src) {
      URL.revokeObjectURL(this.els.previewImage.src);
      this.els.previewImage.src = '';
    }
    this.state.currentScreen = 'settings';
  },

  /* ============================================================================
   * EDIT SCREEN (CROP / ROTATE SIMPLE)
   * ============================================================================ */
  buildEditScreen() {
    const { createElement: ce } = PhotoAuditUtils;

    const overlay = ce('div', {
      class: 'pa-edit-overlay pa-hidden',
      id: 'pa-edit-overlay'
    });

    const modal = ce('div', { class: 'pa-edit-modal' });

    const header = ce('div', { class: 'pa-edit-header' });
    header.innerHTML = `
      <button class="pa-btn pa-btn-xs pa-btn-secondary" id="pa-btn-edit-back">
        <i class="fas fa-arrow-left"></i>
        <span>Back</span>
      </button>
      <div class="pa-edit-title">
        <span class="ja">画像編集</span>
        <span class="vi">Chỉnh sửa ảnh</span>
      </div>
      <div class="pa-edit-right"></div>
    `;

    const body = ce('div', { class: 'pa-edit-body' });
    const canvas = ce('canvas', {
      class: 'pa-edit-canvas',
      id: 'pa-edit-canvas'
    });
    body.appendChild(canvas);

    const footer = ce('div', { class: 'pa-edit-footer' });
    footer.innerHTML = `
      <div class="pa-edit-tools">
        <button class="pa-btn pa-btn-xs pa-btn-secondary" id="pa-btn-edit-rotate-left">
          <i class="fas fa-undo"></i>
          <span>Rotate -90°</span>
        </button>
        <button class="pa-btn pa-btn-xs pa-btn-secondary" id="pa-btn-edit-rotate-right">
          <i class="fas fa-redo"></i>
          <span>Rotate +90°</span>
        </button>
        <button class="pa-btn pa-btn-xs pa-btn-secondary" id="pa-btn-edit-crop-center">
          <i class="fas fa-crop"></i>
          <span>Center Crop</span>
        </button>
      </div>
      <div class="pa-edit-actions">
        <button class="pa-btn pa-btn-secondary" id="pa-btn-edit-cancel">
          <i class="fas fa-times"></i>
          <span>Cancel</span>
        </button>
        <button class="pa-btn pa-btn-primary" id="pa-btn-edit-apply">
          <i class="fas fa-check"></i>
          <span>Apply</span>
        </button>
      </div>
    `;

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    this.els.editOverlay = overlay;
    this.els.editModal = modal;
    this.els.editCanvas = canvas;

    this.bindEditEvents();
  },

  bindEditEvents() {
    PhotoAuditUtils.$('#pa-btn-edit-back').addEventListener('click', (e) => {
      e.preventDefault();
      this.closeEdit();
      this.showSettings();
    });

    PhotoAuditUtils.$('#pa-btn-edit-cancel').addEventListener('click', (e) => {
      e.preventDefault();
      this.closeEdit();
      this.showSettings();
    });

    PhotoAuditUtils.$('#pa-btn-edit-apply').addEventListener('click', (e) => {
      e.preventDefault();
      this.applyEdit();
    });

    PhotoAuditUtils.$('#pa-btn-edit-rotate-left').addEventListener('click', (e) => {
      e.preventDefault();
      this.rotateEdit(-90);
    });

    PhotoAuditUtils.$('#pa-btn-edit-rotate-right').addEventListener('click', (e) => {
      e.preventDefault();
      this.rotateEdit(90);
    });

    PhotoAuditUtils.$('#pa-btn-edit-crop-center').addEventListener('click', (e) => {
      e.preventDefault();
      this.centerCropEdit();
    });
  },

  openEditScreen() {
    if (this.state.currentPhotoIndex < 0 || this.state.currentPhotoIndex >= this.state.photos.length) {
      this.showToast('写真がありません / No photo', 'error');
      return;
    }

    const photo = this.state.photos[this.state.currentPhotoIndex];
    const canvas = this.els.editCanvas;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const url = URL.createObjectURL(photo.blob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);

      this.state.currentScreen = 'edit';
      this.els.editOverlay.classList.remove('pa-hidden');
      document.body.style.overflow = 'hidden';
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      this.showToast('画像読み込みエラー / Image load error', 'error');
    };

    img.src = url;
  },

  rotateEdit(deg) {
    const canvas = this.els.editCanvas;
    const ctx = canvas.getContext('2d');

    const angle = deg * Math.PI / 180;
    const tmpCanvas = document.createElement('canvas');
    const tmpCtx = tmpCanvas.getContext('2d');

    tmpCanvas.width = canvas.width;
    tmpCanvas.height = canvas.height;
    tmpCtx.drawImage(canvas, 0, 0);

    if (deg === 90 || deg === -90 || deg === 270 || deg === -270) {
      canvas.width = tmpCanvas.height;
      canvas.height = tmpCanvas.width;
    }

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(angle);
    ctx.drawImage(tmpCanvas, -tmpCanvas.width / 2, -tmpCanvas.height / 2);
    ctx.restore();
  },

  centerCropEdit() {
    const canvas = this.els.editCanvas;
    const ctx = canvas.getContext('2d');

    const srcCanvas = document.createElement('canvas');
    const srcCtx = srcCanvas.getContext('2d');
    srcCanvas.width = canvas.width;
    srcCanvas.height = canvas.height;
    srcCtx.drawImage(canvas, 0, 0);

    const size = Math.min(srcCanvas.width, srcCanvas.height);
    const sx = (srcCanvas.width - size) / 2;
    const sy = (srcCanvas.height - size) / 2;

    canvas.width = size;
    canvas.height = size;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(srcCanvas, sx, sy, size, size, 0, 0, size, size);
  },

  applyEdit() {
    const canvas = this.els.editCanvas;
    canvas.toBlob((blob) => {
      if (!blob) {
        this.showToast('画像変換エラー / Image convert error', 'error');
        return;
      }
      const photo = this.state.photos[this.state.currentPhotoIndex];
      if (!photo) return;

      blob.name = photo.originalName || '';
      photo.blob = blob;
      this.renderPhotosList();
      this.showToast('画像を更新しました / Photo updated', 'success');
      this.closeEdit();
      this.showSettings();
    }, 'image/jpeg', PHOTO_AUDIT_CONFIG.IMAGE_QUALITY_HD);
  },

  closeEdit() {
    if (this.els.editOverlay) {
      this.els.editOverlay.classList.add('pa-hidden');
      document.body.style.overflow = '';
    }
    this.state.currentScreen = 'settings';
  },

  /* ============================================================================
   * RESIZE IMAGE BY MODE
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
        } else if (mode === 'original') {
          width = img.width;
          height = img.height;
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        let quality = PHOTO_AUDIT_CONFIG.IMAGE_QUALITY_HD;
        if (mode === 'compressed') {
          quality = PHOTO_AUDIT_CONFIG.IMAGE_QUALITY_COMPRESSED;
        } else if (mode === 'original') {
          quality = PHOTO_AUDIT_CONFIG.IMAGE_QUALITY_ORIGINAL;
        }

        canvas.toBlob((resultBlob) => {
          if (!resultBlob) {
            reject(new Error('Canvas toBlob failed'));
            return;
          }
          resolve(resultBlob);
        }, 'image/jpeg', quality);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Image load error'));
      };

      img.src = url;
    });
  },

  /* ============================================================================
   * FILENAME GENERATION (CAMERA vs UPLOAD)
   * ============================================================================ */
  generateMoldCodeFromName(name) {
    if (!name) return 'UNKNOWN';
    return name
      .toString()
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 12) || 'UNKNOWN';
  },

  generateFileName(photo) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const dateStr = `${y}${m}${d}`;
    const timeStr = `${hh}${mm}`;

    let moldCode = '';
    if (this.state.selectedMold && !this.state.isManualMold) {
      moldCode = (this.state.selectedMold.code || '').toString().trim();
    } else {
      const moldNameInput = this.els.moldInput.value.trim();
      moldCode = this.generateMoldCodeFromName(moldNameInput);
    }
    moldCode = moldCode
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .substring(0, 20);
    if (!moldCode) moldCode = 'UNKNOWN';

    if (photo.source === 'file' && photo.originalName) {
      const originalName = photo.originalName;
      const ext = originalName.substring(originalName.lastIndexOf('.')) || '.jpg';
      const baseName = originalName.substring(0, originalName.lastIndexOf('.'))
        .replace(/[^a-zA-Z0-9\-\_]/g, '_')
        .substring(0, 50);
      return `${baseName}${ext}`;
    }

    return `${moldCode}-${dateStr}-${timeStr}.jpg`;
  },

  /* ============================================================================
   * VALIDATE BEFORE SEND
   * ============================================================================ */
  validateBeforeSend() {
    const moldValue = this.els.moldInput.value.trim();
    if (!moldValue) {
      this.showToast('金型を選択してください / Select mold', 'error');
      this.els.moldInput.focus();
      return false;
    }

    const empValue = this.els.employeeInput.value.trim();
    if (!empValue) {
      this.showToast('撮影者を選択してください / Select employee', 'error');
      this.els.employeeInput.focus();
      return false;
    }

    if (!this.state.photos.length) {
      this.showToast('写真がありません / No photos', 'error');
      return false;
    }

    return true;
  },

  /* ============================================================================
   * SEND ALL PHOTOS (MULTI-PHOTO FLOW)
   * ============================================================================ */
  async sendAllPhotos() {
    if (this.state.sending) return;
    if (!this.validateBeforeSend()) return;

    this.state.sending = true;
    this.els.btnSendPhotos.disabled = true;
    this.els.btnSendPhotos.innerHTML = `
      <span class="pa-loading-spinner"></span>
      <span>Sending...</span>
    `;

    try {
      // Prepare mold data
      let moldCode, moldName, moldId;
      if (this.state.selectedMold && !this.state.isManualMold) {
        moldCode = this.state.selectedMold.code || '';
        moldName = this.state.selectedMold.name || '';
        moldId = this.state.selectedMold.id || '';
      } else {
        moldName = this.els.moldInput.value.trim();
        moldCode = this.generateMoldCodeFromName(moldName);
        moldId = '';
      }

      const employeeName = this.state.selectedEmployee?.name || this.els.employeeInput.value.trim();
      const employeeId = this.state.selectedEmployee?.id || '';

      const length = this.state.dimensions.length || '';
      const width = this.state.dimensions.width || '';
      const depth = this.state.dimensions.depth || '';

      const dimensionStr = `${length || '-'} × ${width || '-'} × ${depth || '-'}`;

      // Upload từng ảnh và gửi email cho từng ảnh (hoặc gom theo nhu cầu)
      for (const photo of this.state.photos) {
        const processedBlob = await this.resizeImage(photo.blob, this.state.resizeMode || 'hd');
        const fileName = this.generateFileName(photo);
        photo.fileName = fileName;

        await SupabasePhotoClient.uploadFile(
          PHOTO_AUDIT_CONFIG.STORAGE_BUCKET,
          fileName,
          processedBlob
        );

        const photoUrl = SupabasePhotoClient.getPublicUrl(
          PHOTO_AUDIT_CONFIG.STORAGE_BUCKET,
          fileName
        );

        const payload = {
          moldCode: moldCode,
          moldName: moldName || moldCode,
          moldId: moldId,
          dimensionL: length,
          dimensionW: width,
          dimensionD: depth,
          employee: employeeName,
          employeeId: employeeId,
          date: PhotoAuditUtils.formatDateTime(),
          notes: this.state.notes || '',
          photoFileName: fileName,
          photoUrl: photoUrl,
          originalFileName: photo.originalName || '',
          recipients: [PHOTO_AUDIT_CONFIG.PRIMARY_RECIPIENT],
          ccRecipients: this.state.ccRecipients || []
        };

        await SupabasePhotoClient.callEdgeFunction('send-photo-audit', payload);
      }

      this.showToast('写真とメールを送信しました / Photos sent successfully', 'success');
      setTimeout(() => {
        this.closeSettings();
        this.resetState();
      }, 1500);
    } catch (err) {
      console.error('❌ Send photos error:', err);
      const errorMsg = err.message || 'Unknown error';
      this.showToast(`送信エラー / Send error:\n\n${errorMsg}`, 'error', 8000);
      this.els.btnSendPhotos.disabled = false;
      this.els.btnSendPhotos.innerHTML = `
        <i class="fas fa-paper-plane"></i>
        <span>Send</span>
      `;
    } finally {
      this.state.sending = false;
    }
  },

  /* ============================================================================
   * GLOBAL HOOKS (NAVIBAR & DETAIL MODAL)
   * ============================================================================ */
  bindGlobalHooks() {
    // Hook từ navibar button (giữ nguyên ID đã dùng ở phiên bản trước, ví dụ):
    const navButton = document.getElementById('nav-photo-audit-btn');
    if (navButton) {
      navButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.openFromSearchPage();
      });
    }

    // Hook từ action button trong mobile detail modal (ví dụ ID):
    document.addEventListener('click', (e) => {
      const trigger = e.target.closest('[data-action="open-photo-audit"]');
      if (trigger) {
        e.preventDefault();
        const moldId = trigger.getAttribute('data-mold-id');
        const moldCode = trigger.getAttribute('data-mold-code');
        const moldName = trigger.getAttribute('data-mold-name');
        this.openFromMoldDetail({ moldId, moldCode, moldName });
      }
    });
  },

  openFromSearchPage() {
    this.resetState();
    this.showSettings();
  },

  openFromMoldDetail({ moldId, moldCode, moldName }) {
    this.resetState();

    if (moldId || moldCode || moldName) {
      const found = this.state.molds.find(m =>
        String(m.MoldID) === String(moldId) ||
        m.MoldCode === moldCode ||
        m.MoldName === moldName
      );

      if (found) {
        this.selectMold(found);
      } else {
        // Nếu không tìm thấy trong DataManager thì điền thủ công vẫn được
        this.state.isManualMold = true;
        this.state.selectedMold = null;
        this.els.moldInput.value = moldCode || moldName || '';
        this.updateMoldBadge();
      }
    }

    this.showSettings();
  },

  showSettings() {
    this.state.currentScreen = 'settings';
    this.els.root.classList.remove('pa-hidden');
    document.body.style.overflow = 'hidden';
  },

  closeSettings() {
    this.els.root.classList.add('pa-hidden');
    document.body.style.overflow = '';
  },

  /* ============================================================================
   * RESET STATE
   * ============================================================================ */
  resetState() {
    this.state.photos = [];
    this.state.currentPhotoIndex = -1;
    this.state.notes = '';
    this.state.ccRecipients = [];
    this.state.setAsThumbnail = false;
    this.state.resizeMode = 'hd';
    this.renderPhotosList();
    this.renderCCRecipientList();
    if (this.els.notes) this.els.notes.value = '';
    if (this.els.setThumbnail) this.els.setThumbnail.checked = false;
    this.els.btnSendPhotos.disabled = true;
    this.els.btnSendPhotos.innerHTML = `
      <i class="fas fa-paper-plane"></i>
      <span>Send</span>
    `;
  },

  /* ============================================================================
   * TOAST UTILITY
   * ============================================================================ */
  showToast(message, type = 'info', duration = PHOTO_AUDIT_CONFIG.TOAST_DURATION) {
    let container = document.getElementById('pa-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'pa-toast-container';
      container.className = 'pa-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `pa-toast pa-toast-${type}`;
    toast.innerText = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('pa-toast-hide');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, duration);
  }
};

/* ============================================================================
 * AUTO INIT
 * ============================================================================ */
document.addEventListener('DOMContentLoaded', () => {
  try {
    PhotoAuditTool.init();
  } catch (err) {
    console.error('❌ [PhotoAuditTool] Init error:', err);
  }
});

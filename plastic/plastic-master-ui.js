/**
 * plastic-master-ui.js (V2 - 3 Tabs)
 * Module UI: Quản trị Dữ liệu Gốc Nhựa (Master Data)
 * Tabs: Mã YSD, Nhà cung cấp (Suppliers), Mã Gốc NSX (Grade mapping)
 */

const PlasticMasterUI = (() => {
  let _supabase       = null;
  let _containerEl    = null;
  
  let _masterData     = [];
  let _supplierData   = [];
  let _gradeData      = [];
  let _rollData       = [];
  
  let _activeTab      = 'master';   // master | supplier | grade
  let _activeModal    = null;
  let _editingId      = null;
  let _toastTimer     = null;

  // ---- Filter States ----
  let _masterFilter = { keyword: '', plastic_family: '', is_active: 'true' };
  let _supplierFilter = { keyword: '', is_active: 'true' };
  let _gradeFilter = { keyword: '', supplier_id: '', mapping_status: '', is_active: 'true' };

  let _masterSort = { field: 'plastic_code', dir: 'asc' };
  let _supplierSort = { field: 'supplier_name', dir: 'asc' };
  let _gradeSort = { field: 'commercial_grade_code', dir: 'asc' };

  let _masterPage = 1, _supplierPage = 1, _gradePage = 1;
  const PAGE_SIZE = 50;

  // ===========================================
  // INIT
  // ===========================================
  function init(supabaseClient, containerId) {
    _supabase = supabaseClient;
    _containerEl = document.getElementById(containerId);
    if (!_containerEl) { console.error('Container not found'); return; }
    _injectStyles();
    _render();
    _bootstrap();
  }

  async function _bootstrap() {
    try {
      await _loadAllData();
      _refreshUI();
    } catch (err) {
      _showToast('❌ ' + err.message, 'error');
    }
  }

  async function _loadAllData() {
    const [masterRes, supplierRes, gradeRes, rollRes] = await Promise.all([
      _supabase.from('plastic_master').select('*').order('plastic_code', { ascending: true }),
      _supabase.from('plastic_supplier').select('*').order('supplier_name', { ascending: true }),
      _supabase.from('plastic_manufacturer_grade').select('*').order('commercial_grade_code', { ascending: true }),
      _supabase.from('plastic_receipt_roll').select('receipt_roll_id,plastic_id,roll_status')
    ]);
    if (masterRes.error) throw masterRes.error;
    if (supplierRes.error) throw supplierRes.error;
    if (gradeRes.error) throw gradeRes.error;
    
    _masterData = masterRes.data || [];
    _supplierData = supplierRes.data || [];
    _gradeData = gradeRes.data || [];
    _rollData = rollRes.data || [];
  }

  // ===========================================
  // RENDER LAYOUT
  // ===========================================
  function _render() {
    _containerEl.innerHTML = `
<div class="pm-master-wrap">
  <div class="pm-master-header">
    <h2 class="pm-master-title">🧩 Danh mục Quy chuẩn Vật tư Nhựa</h2>
    <div class="pm-master-tabs">
      <button class="pm-tab-btn${_activeTab==='master'?' active':''}" data-tab="master">1. Mã Chuẩn YSD</button>
      <button class="pm-tab-btn${_activeTab==='supplier'?' active':''}" data-tab="supplier">2. Nhà cung cấp</button>
      <button class="pm-tab-btn${_activeTab==='grade'?' active':''}" data-tab="grade">3. Mã Gốc NSX</button>
    </div>
  </div>

  <!-- TAB MASTER -->
  <div id="pm-master-panel" class="pm-tab-panel${_activeTab==='master'?'':' pm-hidden'}">
    <div class="pm-toolbar">
      <input class="pm-input pm-search" id="pm-m-kw" type="text" placeholder="Tìm mã YSD, tên, màu..." value="${_esc(_masterFilter.keyword)}">
      <select class="pm-select" id="pm-m-family">${_opts(PLASTIC_FAMILY,'','Tất cả họ nhựa',_masterFilter.plastic_family)}</select>
      <button class="pm-btn pm-btn-primary" id="pm-m-add-btn">＋ Thêm Mã YSD</button>
    </div>
    <div id="pm-master-stats" class="pm-stats-bar"></div>
    <div class="pm-table-wrap" id="pm-master-table-wrap"></div>
    <div class="pm-pager" id="pm-master-pager"></div>
  </div>

  <!-- TAB SUPPLIER -->
  <div id="pm-supplier-panel" class="pm-tab-panel${_activeTab==='supplier'?'':' pm-hidden'}">
    <div class="pm-toolbar">
      <input class="pm-input pm-search" id="pm-s-kw" type="text" placeholder="Tìm tên nhà cung cấp..." value="${_esc(_supplierFilter.keyword)}">
      <button class="pm-btn pm-btn-primary" id="pm-s-add-btn">＋ Thêm Nhà cung cấp</button>
    </div>
    <div id="pm-supplier-stats" class="pm-stats-bar"></div>
    <div class="pm-table-wrap" id="pm-supplier-table-wrap"></div>
  </div>

  <!-- TAB GRADE -->
  <div id="pm-grade-panel" class="pm-tab-panel${_activeTab==='grade'?'':' pm-hidden'}">
    <div class="pm-toolbar">
      <input class="pm-input pm-search" id="pm-g-kw" type="text" placeholder="Tìm mã hãng..." value="${_esc(_gradeFilter.keyword)}">
      <select class="pm-select" id="pm-g-supplier">
        <option value="">Tất cả Nhà cung cấp</option>
      </select>
      <button class="pm-btn pm-btn-primary" id="pm-g-add-btn">＋ Thêm Mã Hãng</button>
    </div>
    <div id="pm-grade-stats" class="pm-stats-bar"></div>
    <div class="pm-table-wrap" id="pm-grade-table-wrap"></div>
    <div class="pm-pager" id="pm-grade-pager"></div>
  </div>

  <!-- MODAL -->
  <div id="pm-modal-overlay" class="pm-overlay pm-hidden">
    <div class="pm-modal" id="pm-modal-box">
      <div class="pm-modal-header">
        <span id="pm-modal-title" class="pm-modal-title-text"></span>
        <button class="pm-modal-close" id="pm-modal-close-btn">✕</button>
      </div>
      <div class="pm-modal-body" id="pm-modal-body"></div>
      <div class="pm-modal-footer">
        <button class="pm-btn pm-btn-ghost" id="pm-modal-cancel-btn">Hủy</button>
        <button class="pm-btn pm-btn-primary" id="pm-modal-save-btn">💾 Lưu</button>
      </div>
    </div>
  </div>
  <div id="pm-toast" class="pm-toast pm-hidden"></div>
</div>`;

    _containerEl.addEventListener('click', _onClick);
    _containerEl.addEventListener('change', _onChange);
    _containerEl.addEventListener('input', _onInput);
  }

  function _refreshUI() {
    if (_activeTab === 'master') { _renderMasterTable(); }
    else if (_activeTab === 'supplier') { _renderSupplierTable(); }
    else if (_activeTab === 'grade') { _renderGradeTable(); }
  }

  // ===========================================
  // TAB 1: MASTER
  // ===========================================
  function _renderMasterTable() {
    const el = document.getElementById('pm-master-table-wrap');
    if(!el) return;
    
    let all = _masterData.filter(m => {
      if(_masterFilter.plastic_family && m.plastic_family !== _masterFilter.plastic_family) return false;
      if(_masterFilter.keyword && !m.plastic_code.toLowerCase().includes(_masterFilter.keyword.toLowerCase())) return false;
      return true;
    });
    
    // pagination & sort...
    el.innerHTML = `<table class="pm-table">
      <thead><tr>
        <th>Mã YSD</th><th>Họ nhựa</th><th>Quy cách (mm)</th><th>Thao tác</th>
      </tr></thead>
      <tbody>${all.map(m => `<tr>
        <td class="pm-code">${_esc(m.plastic_code)}</td>
        <td>${_esc(m.plastic_family)}</td>
        <td>${m.thickness_mm} x ${m.width_mm}</td>
        <td>
          <button class="pm-btn-xs" style="color: #0369A1;" title="Tìm Khuôn/Dao Tương thích" onclick="event.stopPropagation(); if(window.PlasticMoldCutterSearch) window.PlasticMoldCutterSearch.openModal('${m.plastic_id}', '${m.width_mm}', '${m.thickness_mm}')">🔍</button>
          <button class="pm-btn-xs" data-action="edit-master" data-id="${m.plastic_id}">✏️</button>
        </td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  // ===========================================
  // TAB 2: SUPPLIER
  // ===========================================
  function _renderSupplierTable() {
    const el = document.getElementById('pm-supplier-table-wrap');
    if(!el) return;
    
    let all = _supplierData.filter(s => {
      if(_supplierFilter.keyword && !s.supplier_name.toLowerCase().includes(_supplierFilter.keyword.toLowerCase())) return false;
      return true;
    });
    
    el.innerHTML = `<table class="pm-table">
      <thead><tr>
        <th>Mã NCC</th><th>Tên Nhà Cung Cấp</th><th>Liên hệ</th><th>Thao tác</th>
      </tr></thead>
      <tbody>${all.map(s => `<tr>
        <td class="pm-code">${_esc(s.supplier_code||'')}</td>
        <td><b>${_esc(s.supplier_name)}</b></td>
        <td>${_esc(s.contact_info||'')}</td>
        <td><button class="pm-btn-xs" data-action="edit-supplier" data-id="${s.supplier_id}">✏️</button></td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  // ===========================================
  // TAB 3: GRADE
  // ===========================================
  function _renderGradeTable() {
    const el = document.getElementById('pm-grade-table-wrap');
    if(!el) return;
    
    let supSelect = document.getElementById('pm-g-supplier');
    if(supSelect && supSelect.options.length === 1) {
      supSelect.innerHTML = `<option value="">Tất cả Nhà cung cấp</option>` + 
        _supplierData.map(s => `<option value="${s.supplier_id}">${_esc(s.supplier_name)}</option>`).join('');
      supSelect.value = _gradeFilter.supplier_id;
    }
    
    let all = _gradeData.filter(g => {
      if(_gradeFilter.supplier_id && g.supplier_id !== _gradeFilter.supplier_id) return false;
      if(_gradeFilter.keyword && !g.commercial_grade_code.toLowerCase().includes(_gradeFilter.keyword.toLowerCase())) return false;
      return true;
    });
    
    el.innerHTML = `<table class="pm-table">
      <thead><tr>
        <th>Mã Gốc NSX (Grade)</th><th>Nhà Cung Cấp</th><th>Mã Chuẩn YSD</th><th>Trạng thái</th><th>Thao tác</th>
      </tr></thead>
      <tbody>${all.map(g => {
        const sup = _supplierData.find(s => s.supplier_id === g.supplier_id);
        const mas = _masterData.find(m => m.plastic_id === g.plastic_id);
        return `<tr>
          <td class="pm-code">${_esc(g.commercial_grade_code)}</td>
          <td>${sup ? _esc(sup.supplier_name) : '---'}</td>
          <td class="pm-code">${mas ? _esc(mas.plastic_code) : '<span style="color:red">Chưa Map</span>'}</td>
          <td>${_esc(g.mapping_status || 'Draft')}</td>
          <td><button class="pm-btn-xs" data-action="edit-grade" data-id="${g.grade_id}">✏️</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  // ===========================================
  // MODALS
  // ===========================================
  function _openSupplierModal(id) {
    _activeModal = 'supplier';
    _editingId = id || null;
    const rec = id ? _supplierData.find(s => s.supplier_id === id) || {} : {};
    
    document.getElementById('pm-modal-title').textContent = id ? 'Sửa Nhà Cung Cấp' : 'Thêm Nhà Cung Cấp';
    document.getElementById('pm-modal-body').innerHTML = `
      <div class="pm-form-grid">
        <div class="pm-form-group">
          <label class="pm-label">Mã NCC (Code)</label>
          <input class="pm-input" id="ms-code" value="${_esc(rec.supplier_code||'')}">
        </div>
        <div class="pm-form-group">
          <label class="pm-label">Tên NCC <span class="pm-req">*</span></label>
          <input class="pm-input" id="ms-name" value="${_esc(rec.supplier_name||'')}">
        </div>
        <div class="pm-form-group pm-span2">
          <label class="pm-label">Liên hệ</label>
          <input class="pm-input" id="ms-contact" value="${_esc(rec.contact_info||'')}">
        </div>
      </div>`;
    _openOverlay();
  }

  async function _saveSupplier() {
    let payload = {
      supplier_code: _val('ms-code') || null,
      supplier_name: _val('ms-name'),
      contact_info: _val('ms-contact') || null,
      is_active: 'true'
    };
    if(!payload.supplier_name) return _showToast('Tên NCC không được trống!', 'error');
    
    if(_editingId) await _supabase.from('plastic_supplier').update(payload).eq('supplier_id', _editingId);
    else await _supabase.from('plastic_supplier').insert(payload);
    
    _closeModal();
    _showToast('Lưu Nhà cung cấp thành công!', 'success');
    await _loadAllData();
    _refreshUI();
  }

  function _openGradeModal(id) {
    _activeModal = 'grade';
    _editingId = id || null;
    const rec = id ? _gradeData.find(g => g.grade_id === id) || {} : {};
    
    const supOpts = _supplierData.map(s => `<option value="${s.supplier_id}" ${rec.supplier_id===s.supplier_id?'selected':''}>${_esc(s.supplier_name)}</option>`).join('');
    const masterOpts = _masterData.map(m => `<option value="${m.plastic_id}" ${rec.plastic_id===m.plastic_id?'selected':''}>${_esc(m.plastic_code)}</option>`).join('');

    document.getElementById('pm-modal-title').textContent = id ? 'Sửa Mã Hãng' : 'Thêm Mã Hãng';
    document.getElementById('pm-modal-body').innerHTML = `
      <div class="pm-form-grid">
        <div class="pm-form-group">
          <label class="pm-label">Mã Hãng/NSX <span class="pm-req">*</span></label>
          <input class="pm-input" id="mg-code" value="${_esc(rec.commercial_grade_code||'')}">
        </div>
        <div class="pm-form-group">
          <label class="pm-label">Nhà Cung Cấp <span class="pm-req">*</span></label>
          <select class="pm-select pm-w100" id="mg-sup">${supOpts}</select>
        </div>
        <div class="pm-form-group pm-span2">
          <label class="pm-label">Map với Mã Chuẩn YSD</label>
          <select class="pm-select pm-w100" id="mg-plas"><option value="">-- Chọn mã YSD --</option>${masterOpts}</select>
        </div>
      </div>`;
    _openOverlay();
  }

  async function _saveGrade() {
    let payload = {
      commercial_grade_code: _val('mg-code'),
      supplier_id: _val('mg-sup'),
      plastic_id: _val('mg-plas') || null,
      mapping_status: _val('mg-plas') ? 'confirmed' : 'needs_confirmation',
      is_active: 'true'
    };
    if(!payload.commercial_grade_code || !payload.supplier_id) return _showToast('Thiếu trường bắt buộc!', 'error');
    
    if(_editingId) await _supabase.from('plastic_manufacturer_grade').update(payload).eq('grade_id', _editingId);
    else await _supabase.from('plastic_manufacturer_grade').insert(payload);
    
    _closeModal();
    _showToast('Lưu Mã Hãng thành công!', 'success');
    await _loadAllData();
    _refreshUI();
  }

  // ===========================================
  // EVENTS
  // ===========================================
  function _onClick(e) {
    const t = e.target.closest('[data-action],[data-tab]');
    if(!t) {
      if(e.target.id==='pm-modal-overlay') _closeModal();
      return;
    }
    
    let tab = t.dataset.tab;
    let act = t.dataset.action;
    let id = t.dataset.id;
    
    if(tab) {
      _activeTab = tab;
      document.querySelectorAll('.pm-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
      document.querySelectorAll('.pm-tab-panel').forEach(b => b.classList.add('pm-hidden'));
      document.getElementById(`pm-${tab}-panel`).classList.remove('pm-hidden');
      _refreshUI();
    }
    if(act==='edit-supplier') _openSupplierModal(id);
    if(t.id==='pm-s-add-btn') _openSupplierModal(null);
    if(act==='edit-grade') _openGradeModal(id);
    if(t.id==='pm-g-add-btn') _openGradeModal(null);
    
    if(t.id==='pm-modal-close-btn' || t.id==='pm-modal-cancel-btn') _closeModal();
    if(t.id==='pm-modal-save-btn') {
      if(_activeModal === 'supplier') _saveSupplier();
      if(_activeModal === 'grade') _saveGrade();
    }
  }

  function _onChange(e) {
    if(e.target.id === 'pm-g-supplier') { _gradeFilter.supplier_id = e.target.value; _renderGradeTable(); }
  }

  function _onInput(e) {
    // simplifed debounce
    if(e.target.id==='pm-m-kw') { _masterFilter.keyword = e.target.value; _renderMasterTable();}
    if(e.target.id==='pm-s-kw') { _supplierFilter.keyword = e.target.value; _renderSupplierTable();}
    if(e.target.id==='pm-g-kw') { _gradeFilter.keyword = e.target.value; _renderGradeTable();}
  }

  // ===========================================
  // UTILS
  // ===========================================
  function _val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function _esc(str) { return String(str||'').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function _opts(enumObj, empty, label, selected) {
    return `<option value="${empty}">${label}</option>` + Object.values(enumObj).map(o => `<option value="${o.value}"${o.value===selected?' selected':''}>${o.label}</option>`).join('');
  }
  function _showToast(m, t='info') {
    const el = document.getElementById('pm-toast'); if(!el) return;
    el.textContent = m; el.className = `pm-toast pm-toast-${t}`;
    clearTimeout(_toastTimer); _toastTimer = setTimeout(()=>el.classList.add('pm-hidden'), 3000);
  }
  function _openOverlay() { document.getElementById('pm-modal-overlay').classList.remove('pm-hidden'); }
  function _closeModal() { document.getElementById('pm-modal-overlay').classList.add('pm-hidden'); _activeModal=null; }

  function _injectStyles() {
    if(document.getElementById('pm-style')) return;
    const s = document.createElement('style'); s.id = 'pm-style';
    s.textContent = `
      .pm-master-wrap{font-family:sans-serif;font-size:13px;padding:12px}
      .pm-master-header{display:flex;justify-content:space-between;margin-bottom:12px}
      .pm-tab-btn{padding:8px 16px;cursor:pointer;border:1px solid #ccc;background:#fff;}
      .pm-tab-btn.active{background:#0ea5e9;color:#fff;border-color:#0ea5e9;}
      .pm-table{width:100%;border-collapse:collapse;margin-top:10px}
      .pm-table th,.pm-table td{border:1px solid #ddd;padding:8px;text-align:left}
      .pm-hidden{display:none!important}
      .pm-toolbar{display:flex;gap:8px;margin-bottom:8px}
      .pm-btn{padding:6px 12px;background:#0ea5e9;color:#fff;border:none;border-radius:4px;cursor:pointer}
      .pm-input, .pm-select{padding:4px;border:1px solid #ccc;border-radius:4px}
      .pm-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;justify-content:center;padding-top:40px;z-index:9999}
      .pm-modal{background:#fff;padding:20px;border-radius:8px;width:500px;min-height:300px;display:flex;flex-direction:column;}
      .pm-form-group{margin-bottom:10px}
      .pm-form-group label{display:block;margin-bottom:4px;font-weight:bold}
      .pm-form-group input,.pm-form-group select{width:100%;box-sizing:border-box}
      .pm-toast{position:fixed;bottom:20px;right:20px;padding:10px;background:#333;color:#fff;border-radius:4px;z-index:10000}
      .pm-code{font-family:monospace;font-weight:bold}
    `;
    document.head.appendChild(s);
  }

  return { init };
})();

if (typeof window !== 'undefined') window.PlasticMasterUI = PlasticMasterUI;

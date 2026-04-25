/**
 * plastic-receipt-ui.js (V2 - Excel Data Grid)
 * Module UI: Nhập kho hàng loạt
 */

const PlasticReceiptUI = (() => {
  let _supabase = null;
  let _containerEl = null;

  let _supplierData = [];
  let _gradeData = [];
  let _masterData = [];
  let _rowsData = []; // State of Grid Rows
  let _toastTimer = null;

  // ===========================================
  // INIT & LOAD
  // ===========================================
  function init(supabaseClient, containerId) {
    _supabase = supabaseClient;
    _containerEl = document.getElementById(containerId);
    if (!_containerEl) { console.error('Container not found'); return; }
    
    // Add default 1 row
    _rowsData = [ { id: _guid(), grade_id: '', supplier_name: '', lot: '', length_m: '', loc: '', plastic_id: '' } ];
    
    _injectStyles();
    _render();
    _bootstrap();
  }

  async function _bootstrap() {
    try {
      await _loadAllData();
      _renderSupplierSelect();
      _renderGrid();
    } catch (err) {
      _showToast('❌ ' + err.message, 'error');
    }
  }

  async function _loadAllData() {
    const [supplierRes, gradeRes, masterRes] = await Promise.all([
      _supabase.from('plastic_supplier').select('*').order('supplier_name', { ascending: true }),
      _supabase.from('plastic_manufacturer_grade').select('*'),
      _supabase.from('plastic_master').select('*')
    ]);
    if (supplierRes.error) throw supplierRes.error;
    if (gradeRes.error) throw gradeRes.error;
    if (masterRes.error) throw masterRes.error;
    
    _supplierData = supplierRes.data || [];
    _gradeData = gradeRes.data || [];
    _masterData = masterRes.data || [];
  }

  function _guid() {
    return Math.random().toString(36).substring(2, 10);
  }

  // ===========================================
  // RENDER UI
  // ===========================================
  function _render() {
    _containerEl.innerHTML = `
<div class="pr-wrap">
  <div class="pr-header">
    <h2 class="pr-title">📥 Nhập kho Siêu Cấp (Data Grid)</h2>
    <div style="display:flex;gap:10px;">
      <button class="pr-btn pr-btn-secondary" id="pr-add-row-btn">＋ Thêm dòng (Enter)</button>
      <button class="pr-btn pr-btn-primary" id="pr-save-btn">💾 Lưu Toàn Bộ Phiếu & In Tem</button>
    </div>
  </div>

  <div class="pr-receipt-info">
    <div class="pr-form-group">
      <label>Nhà Cung Cấp</label>
      <select id="pr-head-supplier" class="pr-input">`+ _supplierData.map(s => `<option value="${s.supplier_id}">${s.supplier_name}</option>`).join('') +`</select>
    </div>
    <div class="pr-form-group">
      <label>Mã Phiếu (Tự sinh nếu trống)</label>
      <input type="text" id="pr-head-no" class="pr-input" placeholder="RCP-2026...">
    </div>
    <div class="pr-form-group">
      <label>Số Hóa đơn</label>
      <input type="text" id="pr-head-invoice" class="pr-input" placeholder="INV...">
    </div>
    <div class="pr-form-group">
      <label>Ngày Nhập</label>
      <input type="date" id="pr-head-date" class="pr-input" value="${new Date().toISOString().split('T')[0]}">
    </div>
  </div>

  <div class="pr-grid-wrap">
    <table class="pr-grid-table">
      <thead>
        <tr>
          <th>#</th>
          <th style="width:250px">Mã Hãng/NSX (Gõ để tìm)</th>
          <th style="width:200px">Mã YSD (Auto)</th>
          <th>Lot / Batch No</th>
          <th style="width:100px">Khổ × Dày</th>
          <th style="width:120px">Độ dài (m)</th>
          <th style="width:120px">Vị trí Kho</th>
          <th>Xóa</th>
        </tr>
      </thead>
      <tbody id="pr-grid-body"></tbody>
    </table>
  </div>
  <div id="pr-toast" class="pr-toast pr-hidden"></div>
</div>`;

    // Event listeners
    _containerEl.addEventListener('click', _onClick);
    _containerEl.addEventListener('change', _onChange);
    _containerEl.addEventListener('input', _onInput);
    _containerEl.addEventListener('keydown', _onKeyDown);
  }

  function _renderSupplierSelect() {
    let el = document.getElementById('pr-head-supplier');
    if(!el) return;
    el.innerHTML = `<option value="">-- Chọn Nhà Cung Cấp --</option>` + 
      _supplierData.map(s => `<option value="${s.supplier_name}" data-sid="${s.supplier_id}">${s.supplier_name}</option>`).join('');
  }

  function _renderGrid() {
    let tbody = document.getElementById('pr-grid-body');
    if(!tbody) return;
    
    let supSelect = document.getElementById('pr-head-supplier');
    let currentSupName = supSelect ? supSelect.value : '';
    let currentSupNode = supSelect ? supSelect.options[supSelect.selectedIndex] : null;
    let currentSupId = currentSupNode ? currentSupNode.getAttribute('data-sid') : '';

    let activeGrades = _gradeData.filter(g => currentSupId==='' || g.supplier_id === currentSupId);

    let html = _rowsData.map((row, index) => {
      // Find master for auto text
      let grade = _gradeData.find(g => g.grade_id === row.grade_id);
      let master = grade ? _masterData.find(m => m.plastic_id === grade.plastic_id) : null;
      row.plastic_id = master ? master.plastic_id : '';
      
      let specStr = master ? `${master.width_mm}x${master.thickness_mm}` : '';

      return `<tr data-row-id="${row.id}">
        <td class="pr-center">${index + 1}</td>
        <td>
          <select class="pr-input pr-cell-input" data-field="grade_id">
            <option value="">-- Chọn Hãng --</option>
            ${activeGrades.map(g => `<option value="${g.grade_id}" ${g.grade_id===row.grade_id?'selected':''}>${_esc(g.commercial_grade_code)}</option>`).join('')}
          </select>
        </td>
        <td><input type="text" class="pr-input pr-cell-input pm-auto-read" readonly value="${master ? _esc(master.plastic_code) : ''}"></td>
        <td><input type="text" class="pr-input pr-cell-input" data-field="lot" value="${_esc(row.lot||'')}"></td>
        <td><input type="text" class="pr-input pr-cell-input pm-auto-read" readonly value="${_esc(specStr)}"></td>
        <td><input type="number" class="pr-input pr-cell-input" data-field="length_m" value="${row.length_m||''}"></td>
        <td><input type="text" class="pr-input pr-cell-input" data-field="loc" value="${_esc(row.loc||'')}"></td>
        <td class="pr-center"><button class="pr-btn-xs" data-action="remove-row" data-id="${row.id}">🗑️</button></td>
      </tr>`;
    }).join('');

    tbody.innerHTML = html;
  }

  // ===========================================
  // EVENTS
  // ===========================================
  function _onClick(e) {
    let t = e.target.closest('[data-action],[id]');
    if(!t) return;
    
    if(t.id === 'pr-add-row-btn') {
      _rowsData.push({ id: _guid(), grade_id: '', supplier_name: '', lot: '', length_m: '', loc: '', plastic_id: '' });
      _renderGrid();
      // focus last row grade
      setTimeout(()=>{
        let selects = document.querySelectorAll('select[data-field="grade_id"]');
        if(selects.length>0) selects[selects.length-1].focus();
      },50);
    }
    
    if(t.id === 'pr-save-btn') {
      _saveAll();
    }

    if(t.dataset.action === 'remove-row') {
      _rowsData = _rowsData.filter(r => r.id !== t.dataset.id);
      if(_rowsData.length===0) _rowsData.push({ id: _guid(), grade_id: '', supplier_name: '', lot: '', length_m: '', loc: '', plastic_id: '' });
      _renderGrid();
    }
  }

  function _onChange(e) {
    if(e.target.id === 'pr-head-supplier') {
      _renderGrid(); // supplier changed, re-filter grades
      return;
    }

    let tr = e.target.closest('tr');
    if(!tr) return;
    let field = e.target.dataset.field;
    if(!field) return;
    let rowId = tr.dataset.rowId;
    let row = _rowsData.find(r => r.id === rowId);
    if(row) {
      row[field] = e.target.value;
      if(field === 'grade_id') _renderGrid(); // trigger auto-fill master
    }
  }

  function _onInput(e) {
    let tr = e.target.closest('tr');
    if(!tr) return;
    let field = e.target.dataset.field;
    if(!field) return;
    let rowId = tr.dataset.rowId;
    let row = _rowsData.find(r => r.id === rowId);
    if(row) row[field] = e.target.value;
  }

  function _onKeyDown(e) {
    if(e.key === 'Enter') {
      let tr = e.target.closest('tr');
      if(tr) {
        // If it's the last row, add new row
        let isLast = tr === tr.parentElement.lastElementChild;
        if(isLast) {
          document.getElementById('pr-add-row-btn').click();
        }
      }
    }
  }

  // ===========================================
  // SAVE ROUTINE
  // ===========================================
  async function _saveAll() {
    let supName = _val('pr-head-supplier');
    if(!supName) return _showToast('❌ Phải chọn Nhà Cung Cấp!', 'error');

    let validRows = _rowsData.filter(r => r.grade_id && r.length_m);
    if(validRows.length === 0) return _showToast('❌ Grid trống hoặc chưa nhập Độ dài cuộn!', 'error');

    let receiptNo = _val('pr-head-no') || 'RCP-' + Date.now();
    
    // 1. Save Receipt
    let recPayload = {
      receipt_no: receiptNo,
      receipt_date: _val('pr-head-date'),
      supplier_name: supName,
      invoice_no: _val('pr-head-invoice'),
      status: 'confirmed'
    };

    try {
      const recRes = await _supabase.from('plastic_receipt').insert(recPayload).select();
      if(recRes.error) throw recRes.error;
      let receiptId = recRes.data[0].receipt_id;

      let promises = [];
      let printData = []; // for QR label printing phase 4

      // 2. Save Rolls
      for(let r of validRows) {
        let grade = _gradeData.find(g => g.grade_id === r.grade_id);
        let rollPayload = {
          receipt_id: receiptId,
          plastic_id: r.plastic_id || null,
          commercial_grade_code: grade ? grade.commercial_grade_code : '',
          supplier_name: supName,
          lot_no: r.lot || null,
          received_length_m: parseFloat(r.length_m),
          current_length_m: parseFloat(r.length_m),
          warehouse_location: r.loc || null,
          roll_status: 'in_stock',
          mapped_at: r.plastic_id ? new Date().toISOString() : null
        };
        // wait sequentially or push to promise array. We push for speed, but CSV backend handles serialization.
        promises.push(_supabase.from('plastic_receipt_roll').insert(rollPayload).select());
      }
      
      let createdRolls = [];
      for(let p of promises) {
        let rs = await p;
        if(rs.error) console.error("Lỗi khi lưu cuộn", rs.error);
        if(rs.data && rs.data[0]) createdRolls.push(rs.data[0]);
      }
      
      _showToast(`✅ Đã lưu phiếu ${receiptNo} và ${createdRolls.length} cuộn!`, 'success');
      
      
  function _printLabels(rolls) {
    if(!rolls || rolls.length === 0) return;
    
    // Khổ tem 100mm x 50mm
    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) {
      _showToast('Trình duyệt chặn Pop-up. Vui lòng cho phép để in tem.', 'error');
      return;
    }
    
    const labelsHtml = rolls.map(r => {
      let grade = _gradeData.find(g => g.commercial_grade_code === r.commercial_grade_code);
      let master = _masterData.find(m => m.plastic_id === r.plastic_id);
      
      let ysdCode = master ? master.plastic_code : 'CHƯA MAP';
      let specStr = master ? master.width_mm + 'x' + master.thickness_mm : (r.width_mm + 'x' + r.thickness_mm);
      let payload = encodeURIComponent('YSD|ROLL|' + r.receipt_roll_id);
      let qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + payload;
      
      return `
        <div class="label-page">
          <div class="qr-col">
            <img src="${qrUrl}" class="qr-img" />
            <div class="qr-id">${r.receipt_roll_id.slice(-6).toUpperCase()}</div>
          </div>
          <div class="info-col">
            <div class="title-ysd">${ysdCode}</div>
            <div class="info-line"><strong>Hãng:</strong> ${r.commercial_grade_code}</div>
            <div class="info-line"><strong>Quy cách:</strong> ${specStr}</div>
            <div class="info-line"><strong>NCC:</strong> ${r.supplier_name}</div>
            <div class="info-line" style="margin-top:4px;">
              <span class="len-box">L:${r.received_length_m}m</span>
              ${r.lot_no ? '<span class="len-box" style="margin-left:4px">Lot:'+r.lot_no+'</span>' : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>In Tem Cuộn - ${rolls.length} tem</title>
        <style>
          @page { size: 100mm 50mm; margin: 0; }
          body { 
            margin: 0; padding: 0; 
            font-family: Arial, sans-serif; 
            background: #ccc;
          }
          .label-page {
            width: 100mm;
            height: 50mm;
            background: white;
            page-break-after: always;
            box-sizing: border-box;
            padding: 4mm;
            display: flex;
            align-items: center;
            overflow: hidden;
            position: relative;
          }
          @media screen {
            .label-page { margin: 10mm auto; box-shadow: 0 0 5px rgba(0,0,0,0.5); }
          }
          @media print {
            body { background: white; }
            .label-page { margin: 0; box-shadow: none; border: none; }
          }
          .qr-col {
            width: 35mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .qr-img {
            width: 30mm;
            height: 30mm;
          }
          .qr-id {
            margin-top: 2mm;
            font-size: 10px;
            font-weight: bold;
            font-family: monospace;
          }
          .info-col {
            flex: 1;
            padding-left: 3mm;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .title-ysd {
            font-size: 18px;
            font-weight: 900;
            margin-bottom: 2mm;
            line-height: 1.1;
            word-break: break-all;
          }
          .info-line {
            font-size: 11px;
            line-height: 1.4;
            color: #000;
          }
          .len-box {
            display: inline-block;
            border: 1px solid #000;
            padding: 1px 4px;
            font-weight: bold;
            font-size: 12px;
            border-radius: 2px;
          }
        </style>
      </head>
      <body>
        ${labelsHtml}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 800);
          }
        </script>
      </body>
      </html>
    `;

    win.document.open();
    win.document.write(html);
    win.document.close();
  }

      // Gọi hàm in
      _printLabels(createdRolls);

      // Reset after 1 second
      setTimeout(()=>{
        _rowsData = [ { id: _guid(), grade_id: '', supplier_name: '', lot: '', length_m: '', loc: '', plastic_id: '' } ];
        document.getElementById('pr-head-no').value = '';
        document.getElementById('pr-head-invoice').value = '';
        _renderGrid();
      }, 1500);

    } catch(err) {
      _showToast('❌ ' + err.message, 'error');
    }
  }

  // ===========================================
  // UTILS
  // ===========================================
  function _val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function _esc(str) { return String(str||'').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function _showToast(m, t='info') {
    const el = document.getElementById('pr-toast'); if(!el) return;
    el.textContent = m; el.className = `pr-toast pr-toast-${t}`;
    clearTimeout(_toastTimer); _toastTimer = setTimeout(()=>el.classList.add('pr-hidden'), 3000);
  }

  function _injectStyles() {
    if(document.getElementById('pr-style')) return;
    const s = document.createElement('style'); s.id = 'pr-style';
    s.textContent = `
      .pr-wrap{font-family:sans-serif;font-size:13px;padding:12px}
      .pr-header{display:flex;justify-content:space-between;margin-bottom:12px; align-items:center;}
      .pr-receipt-info{display:flex;gap:16px;background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:12px}
      .pr-grid-table{width:100%;border-collapse:collapse;margin-top:10px}
      .pr-grid-table th{background:#e2e8f0;padding:8px;text-align:left;font-size:12px}
      .pr-grid-table td{border-bottom:1px solid #ddd;padding:4px}
      .pr-cell-input{width:100%;border:none;background:transparent;padding:6px;font-size:13px}
      .pr-cell-input:focus{outline:2px solid #0ea5e9;background:#fff;border-radius:4px}
      .pm-auto-read{background:#f1f5f9;color:#64748b;pointer-events:none;}
      .pr-hidden{display:none!important}
      .pr-btn{padding:8px 16px;background:#0ea5e9;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold}
      .pr-btn-secondary{background:#64748b}
      .pr-btn-xs{background:#ef4444;color:white;border:none;border-radius:4px;padding:4px}
      .pr-input, .pr-select{padding:6px;border:1px solid #ccc;border-radius:4px;min-width:150px}
      .pr-toast{position:fixed;bottom:20px;right:20px;padding:12px 20px;background:#333;color:#fff;border-radius:4px;z-index:10000;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.2)}
      .pr-toast-success{background:#16a34a}
      .pr-toast-error{background:#dc2626}
      .pr-center{text-align:center}
    `;
    document.head.appendChild(s);
  }

  return { init };
})();

if (typeof window !== 'undefined') window.PlasticReceiptUI = PlasticReceiptUI;

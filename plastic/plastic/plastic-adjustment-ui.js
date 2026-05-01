/**
 * plastic-adjustment-ui.js
 * Module UI: Điều chỉnh tồn kho nhựa ngoài sản xuất + Kiểm kê (棚卸)
 * Gồm 2 tab chính:
 *   [1] Điều chỉnh nhanh — cộng/trừ mét: hỏng, trả hàng, sửa tay, đặt giữ
 *   [2] Kiểm kê          — tạo phiếu kiểm kê, đếm từng cuộn, xác nhận lệch, sinh log điều chỉnh
 * Phụ thuộc: plastic-manager-schema.js, supabase client
 * Version: v8.1.0
 */

const PlasticAdjustmentUI = (() => {
  let _supabase    = null;
  let _containerEl = null;

  let _masterData    = [];
  let _receiptData   = [];
  let _rollData      = [];
  let _logData       = [];
  let _snapshotData  = [];
  let _countLineData = [];
  let _joinedRolls   = [];

  // State điều chỉnh nhanh
  let _adjTab        = 'adjust';   // 'adjust' | 'inventory'
  let _adjFilter     = { keyword: '', roll_status: '', plastic_family: '', warehouse_location: '' };
  let _adjPage       = 1;
  const ADJ_PAGE_SIZE = 30;
  let _adjModal      = null;   // null | 'adjust'
  let _adjEditRollId = null;

  // State kiểm kê
  let _invSelectedSnapshotId = null;
  let _invFilter     = { keyword: '', count_result: '' };
  let _invPage       = 1;
  const INV_PAGE_SIZE = 50;
  let _invModal      = null;   // null | 'new_snapshot' | 'count_line'
  let _invEditLineId = null;

  let _toastTimer    = null;
  let _inputTimer    = null;
  let _submitting    = false;

  // ============================================================
  // KHỞI TẠO
  // ============================================================

  function init(supabaseClient, containerId) {
    _supabase    = supabaseClient;
    _containerEl = document.getElementById(containerId);
    if (!_containerEl) {
      console.error(`[PlasticAdjustmentUI] Không tìm thấy container #${containerId}`);
      return;
    }
    _injectStyles();
    _render();
    _bootstrap();
  }

  async function _bootstrap() {
    _setLoading(true);
    try {
      await _loadAllData();
      _joinRows();
      _refreshUI();
    } catch (err) {
      _showToast('❌ ' + (err?.message || String(err)), 'error');
    } finally {
      _setLoading(false);
    }
  }

  // ============================================================
  // TẢI DỮ LIỆU
  // ============================================================

  async function _loadAllData() {
    const [masterRes, receiptRes, rollRes, logRes, snapRes, lineRes] = await Promise.all([
      _supabase.from('plastic_master').select('*').order('plastic_code', { ascending: true }),
      _supabase.from('plastic_receipt').select('*').order('receipt_date', { ascending: false }),
      _supabase.from('plastic_receipt_roll').select('*').order('updated_at', { ascending: false }),
      _supabase.from('plastic_adjustment_log').select('*').order('created_at', { ascending: false }).limit(3000),
      _supabase.from('plastic_inventory_snapshot').select('*').order('snapshot_date', { ascending: false }),
      _supabase.from('plastic_inventory_count_line').select('*').order('created_at', { ascending: false }),
    ]);

    if (masterRes.error)  throw masterRes.error;
    if (receiptRes.error) throw receiptRes.error;
    if (rollRes.error)    throw rollRes.error;
    if (logRes.error)     throw logRes.error;
    if (snapRes.error)    throw snapRes.error;
    if (lineRes.error)    throw lineRes.error;

    _masterData    = masterRes.data  || [];
    _receiptData   = receiptRes.data || [];
    _rollData      = rollRes.data    || [];
    _logData       = logRes.data     || [];
    _snapshotData  = snapRes.data    || [];
    _countLineData = lineRes.data    || [];
  }

  // ============================================================
  // JOIN ROLLS
  // ============================================================

  function _joinRows() {
    _joinedRolls = _rollData.map(roll => {
      const receipt = _receiptData.find(r => r.receipt_id === roll.receipt_id) || {};
      const master  = _masterData.find(m => m.plastic_id === roll.plastic_id) || {};
      const current = Number(roll.current_length_m || 0);
      return {
        receipt_roll_id:   roll.receipt_roll_id,
        receipt_id:        roll.receipt_id,
        plastic_id:        roll.plastic_id || null,
        plastic_code:      master.plastic_code || '',
        plastic_family:    master.plastic_family || '',
        thickness_mm:      roll.thickness_mm ?? master.thickness_mm ?? null,
        width_mm:          roll.width_mm     ?? master.width_mm     ?? null,
        current_length_m:  current,
        received_length_m: Number(roll.received_length_m || 0),
        commercial_grade_code: roll.commercial_grade_code || '',
        supplier_name:     roll.supplier_name || receipt.supplier_name || '',
        lot_no:            roll.lot_no || '',
        warehouse_location:roll.warehouse_location || '',
        roll_status:       roll.roll_status || 'in_stock',
        receipt_no:        receipt.receipt_no || '',
        receipt_date:      receipt.receipt_date || '',
        notes:             roll.notes || '',
      };
    });
  }

  // ============================================================
  // RENDER SHELL
  // ============================================================

  function _render() {
    _containerEl.innerHTML = `
<div class="pa-wrap">
  <div class="pa-header">
    <div>
      <h2 class="pa-title">🛠️ Điều chỉnh & Kiểm kê nhựa</h2>
      <div class="pa-subtitle">Điều chỉnh tồn ngoài sản xuất và thực hiện kiểm kê định kỳ.</div>
    </div>
    <div class="pa-head-actions">
      <button class="pa-btn pa-btn-light" id="pa-reload-btn">↻ Tải lại</button>
    </div>
  </div>

  <div class="pa-tabs">
    <button class="pa-tab ${_adjTab === 'adjust' ? 'pa-tab-active' : ''}"
      onclick="PlasticAdjustmentUI._switchTab('adjust')">🔧 Điều chỉnh nhanh</button>
    <button class="pa-tab ${_adjTab === 'inventory' ? 'pa-tab-active' : ''}"
      onclick="PlasticAdjustmentUI._switchTab('inventory')">📋 Kiểm kê (棚卸)</button>
  </div>

  <div class="pa-loading" id="pa-loading" style="display:none">Đang tải dữ liệu…</div>

  <!-- Tab Điều chỉnh -->
  <div id="pa-panel-adjust" class="${_adjTab === 'adjust' ? '' : 'pa-hidden'}">
    ${_renderAdjustPanel()}
  </div>

  <!-- Tab Kiểm kê -->
  <div id="pa-panel-inventory" class="${_adjTab === 'inventory' ? '' : 'pa-hidden'}">
    ${_renderInventoryPanel()}
  </div>

  <!-- Modal Điều chỉnh cuộn -->
  <div class="pa-overlay pa-hidden" id="pa-adj-modal-overlay">
    <div class="pa-modal" id="pa-adj-modal-box">
      <div class="pa-modal-header">
        <div class="pa-modal-title">🔧 Điều chỉnh tồn cuộn</div>
        <button class="pa-modal-close" id="pa-adj-modal-close">✕</button>
      </div>
      <div class="pa-modal-body" id="pa-adj-modal-body"></div>
    </div>
  </div>

  <!-- Modal Tạo phiếu kiểm kê -->
  <div class="pa-overlay pa-hidden" id="pa-inv-snap-overlay">
    <div class="pa-modal pa-modal-sm" id="pa-inv-snap-box">
      <div class="pa-modal-header">
        <div class="pa-modal-title">📋 Tạo phiếu kiểm kê</div>
        <button class="pa-modal-close" onclick="PlasticAdjustmentUI._closeSnapModal()">✕</button>
      </div>
      <div class="pa-modal-body" id="pa-inv-snap-body"></div>
    </div>
  </div>

  <!-- Modal Nhập số mét kiểm kê từng cuộn -->
  <div class="pa-overlay pa-hidden" id="pa-inv-line-overlay">
    <div class="pa-modal pa-modal-sm" id="pa-inv-line-box">
      <div class="pa-modal-header">
        <div class="pa-modal-title" id="pa-inv-line-title">Nhập mét kiểm kê</div>
        <button class="pa-modal-close" onclick="PlasticAdjustmentUI._closeLineModal()">✕</button>
      </div>
      <div class="pa-modal-body" id="pa-inv-line-body"></div>
    </div>
  </div>

  <div class="pa-toast" id="pa-toast" style="display:none"></div>
</div>`;

    _bindGlobalEvents();
  }

  // ============================================================
  // PANEL ĐIỀU CHỈNH NHANH
  // ============================================================

  function _renderAdjustPanel() {
    return `
<div class="pa-adj-wrap">
  <div class="pa-adj-topbar">
    <div class="pa-filter-row">
      <input class="pa-input pa-search" id="pa-adj-f-keyword" type="text"
        placeholder="Tìm mã chuẩn, mã hãng, lot, vị trí kho…"
        value="${_esc(_adjFilter.keyword)}">
      <select class="pa-select" id="pa-adj-f-family">
        ${_enumOpts(PLASTIC_FAMILY, 'Tất cả họ nhựa', _adjFilter.plastic_family)}
      </select>
      <select class="pa-select" id="pa-adj-f-roll-status">
        ${_enumOpts(ROLL_STATUS, 'Tất cả trạng thái', _adjFilter.roll_status)}
      </select>
      <input class="pa-input" id="pa-adj-f-location" type="text"
        placeholder="Vị trí kho" value="${_esc(_adjFilter.warehouse_location)}">
    </div>
    <div class="pa-adj-info">Chọn cuộn cần điều chỉnh, nhập loại biến động và số mét thay đổi.</div>
  </div>
  <div id="pa-adj-table-wrap" class="pa-table-wrap"></div>
  <div id="pa-adj-pager"     class="pa-pager"></div>
  <div class="pa-log-section">
    <div class="pa-log-title">📜 Lịch sử điều chỉnh gần nhất</div>
    <div id="pa-log-table-wrap" class="pa-table-wrap"></div>
  </div>
</div>`;
  }

  // ============================================================
  // PANEL KIỂM KÊ
  // ============================================================

  function _renderInventoryPanel() {
    return `
<div class="pa-inv-wrap">
  <div class="pa-inv-topbar">
    <div class="pa-inv-topbar-left">
      <div class="pa-section-title">Danh sách phiếu kiểm kê</div>
    </div>
    <button class="pa-btn pa-btn-primary" id="pa-new-snapshot-btn">＋ Tạo phiếu kiểm kê mới</button>
  </div>
  <div class="pa-inv-grid">
    <div id="pa-inv-snap-list" class="pa-inv-snap-list"></div>
    <div class="pa-inv-detail">
      <div class="pa-inv-detail-header">
        <div class="pa-section-title" id="pa-inv-detail-title">Chọn phiếu để xem chi tiết</div>
        <div id="pa-inv-detail-actions" class="pa-inv-detail-actions" style="display:none">
          <button class="pa-btn pa-btn-light" id="pa-inv-add-roll-btn">＋ Thêm cuộn vào phiếu</button>
          <button class="pa-btn pa-btn-success" id="pa-inv-complete-btn">✓ Hoàn thành kiểm kê</button>
          <button class="pa-btn pa-btn-danger"  id="pa-inv-cancel-btn">✕ Hủy phiếu</button>
        </div>
      </div>
      <div class="pa-filter-row" id="pa-inv-line-filter" style="display:none">
        <input class="pa-input pa-search" id="pa-inv-f-keyword" type="text"
          placeholder="Tìm mã hãng, lot, kho…">
        <select class="pa-select" id="pa-inv-f-result">
          ${_enumOpts(COUNT_RESULT, 'Tất cả kết quả', _invFilter.count_result)}
        </select>
      </div>
      <div id="pa-inv-line-table-wrap" class="pa-table-wrap"></div>
      <div id="pa-inv-line-pager"      class="pa-pager"></div>
    </div>
  </div>
</div>`;
  }

  // ============================================================
  // BIND EVENTS
  // ============================================================

  function _bindGlobalEvents() {
    _el('pa-reload-btn')?.addEventListener('click', () => _bootstrap());

    // Tab điều chỉnh — filter
    _el('pa-adj-f-keyword')?.addEventListener('input', e => {
      clearTimeout(_inputTimer);
      _inputTimer = setTimeout(() => { _adjFilter.keyword = e.target.value; _adjPage = 1; _refreshAdjTable(); }, 280);
    });
    _el('pa-adj-f-location')?.addEventListener('input', e => {
      clearTimeout(_inputTimer);
      _inputTimer = setTimeout(() => { _adjFilter.warehouse_location = e.target.value; _adjPage = 1; _refreshAdjTable(); }, 280);
    });
    _el('pa-adj-f-family')?.addEventListener('change', e => { _adjFilter.plastic_family = e.target.value; _adjPage = 1; _refreshAdjTable(); });
    _el('pa-adj-f-roll-status')?.addEventListener('change', e => { _adjFilter.roll_status = e.target.value; _adjPage = 1; _refreshAdjTable(); });

    // Kiểm kê
    _el('pa-new-snapshot-btn')?.addEventListener('click', _openNewSnapshotModal);
    _el('pa-inv-f-keyword')?.addEventListener('input', e => {
      clearTimeout(_inputTimer);
      _inputTimer = setTimeout(() => { _invFilter.keyword = e.target.value; _invPage = 1; _refreshInvLines(); }, 280);
    });
    _el('pa-inv-f-result')?.addEventListener('change', e => { _invFilter.count_result = e.target.value; _invPage = 1; _refreshInvLines(); });

    // Modal điều chỉnh
    _el('pa-adj-modal-close')?.addEventListener('click', _closeAdjModal);
    _el('pa-adj-modal-overlay')?.addEventListener('click', e => { if (e.target === _el('pa-adj-modal-overlay')) _closeAdjModal(); });
  }

  // ============================================================
  // REFRESH UI
  // ============================================================

  function _refreshUI() {
    _refreshAdjTable();
    _refreshLogTable();
    _refreshSnapList();
    if (_invSelectedSnapshotId) _refreshInvLines();
  }

  // ============================================================
  // BẢNG ĐIỀU CHỈNH NHANH
  // ============================================================

  function _getAdjFilteredRolls() {
    const kw = (_adjFilter.keyword || '').toLowerCase();
    return _joinedRolls.filter(r => {
      if (kw) {
        const h = [r.plastic_code, r.commercial_grade_code, r.lot_no, r.warehouse_location, r.supplier_name].join(' ').toLowerCase();
        if (!h.includes(kw)) return false;
      }
      if (_adjFilter.plastic_family && r.plastic_family !== _adjFilter.plastic_family) return false;
      if (_adjFilter.roll_status    && r.roll_status    !== _adjFilter.roll_status)    return false;
      if (_adjFilter.warehouse_location && !r.warehouse_location.toLowerCase().includes(_adjFilter.warehouse_location.toLowerCase())) return false;
      return true;
    });
  }

  function _refreshAdjTable() {
    const rows  = _getAdjFilteredRolls();
    const total = rows.length;
    const totalPages = Math.ceil(total / ADJ_PAGE_SIZE) || 1;
    if (_adjPage > totalPages) _adjPage = totalPages;
    const pageRows = rows.slice((_adjPage - 1) * ADJ_PAGE_SIZE, _adjPage * ADJ_PAGE_SIZE);

    const wrap = _el('pa-adj-table-wrap');
    if (!wrap) return;

    if (!pageRows.length) {
      wrap.innerHTML = `<div class="pa-empty">Không tìm thấy cuộn nào.</div>`;
      if (_el('pa-adj-pager')) _el('pa-adj-pager').innerHTML = '';
      return;
    }

    const thead = `<tr>
<th class="pa-th">Mã chuẩn / Mã hãng</th>
<th class="pa-th">Họ nhựa</th>
<th class="pa-th pa-th-num">Dày×Khổ</th>
<th class="pa-th pa-th-num">Còn lại (m)</th>
<th class="pa-th">Lot</th>
<th class="pa-th">Vị trí kho</th>
<th class="pa-th">Trạng thái</th>
<th class="pa-th pa-th-action">Thao tác</th>
</tr>`;

    const tbody = pageRows.map(r => {
      const mappedChip = r.plastic_id
        ? `<div class="pa-chip pa-chip-mapped">${_esc(r.plastic_code)}</div>`
        : `<div class="pa-chip pa-chip-unmapped">Chưa map</div>`;
      const lowBadge = r.current_length_m > 0 && r.current_length_m <= 20
        ? `<span class="pa-badge pa-badge-danger">⚠ Rất ít</span>`
        : r.current_length_m > 0 && r.current_length_m <= 50
          ? `<span class="pa-badge pa-badge-warn">△ Ít</span>`
          : '';
      return `<tr class="pa-row">
<td class="pa-td">
  <div class="pa-td-grade">${_esc(r.commercial_grade_code)}</div>
  ${mappedChip}
</td>
<td class="pa-td">${_esc(r.plastic_family)}</td>
<td class="pa-td pa-td-num">${_dimText(r.thickness_mm, r.width_mm)}</td>
<td class="pa-td pa-td-num pa-td-bold">${r.current_length_m.toFixed(1)}m ${lowBadge}</td>
<td class="pa-td">${_esc(r.lot_no)}</td>
<td class="pa-td">${_esc(r.warehouse_location)}</td>
<td class="pa-td">${_rollStatusBadge(r.roll_status)}</td>
<td class="pa-td pa-td-action">
  <button class="pa-btn pa-btn-xs pa-btn-primary"
    onclick="PlasticAdjustmentUI._openAdjModal('${r.receipt_roll_id}')">調整</button>
</td>
</tr>`;
    }).join('');

    wrap.innerHTML = `<table class="pa-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;

    // Pager điều chỉnh
    const pager = _el('pa-adj-pager');
    if (pager) {
      if (totalPages <= 1) {
        pager.innerHTML = `<span class="pa-pager-info">Hiển thị ${total} cuộn</span>`;
      } else {
        const from = (_adjPage - 1) * ADJ_PAGE_SIZE + 1;
        const to   = Math.min(_adjPage * ADJ_PAGE_SIZE, total);
        pager.innerHTML = `
<button class="pa-btn pa-btn-ghost" onclick="PlasticAdjustmentUI._adjGoPage(${_adjPage - 1})" ${_adjPage === 1 ? 'disabled' : ''}>‹</button>
<span class="pa-pager-info">${from}–${to} / ${total}</span>
<button class="pa-btn pa-btn-ghost" onclick="PlasticAdjustmentUI._adjGoPage(${_adjPage + 1})" ${_adjPage === totalPages ? 'disabled' : ''}>›</button>`;
      }
    }
  }

  // ============================================================
  // LOG ĐIỀU CHỈNH GẦN NHẤT
  // ============================================================

  function _refreshLogTable() {
    const wrap = _el('pa-log-table-wrap');
    if (!wrap) return;
    const recentLogs = _logData
      .filter(l => ['inventory_adjustment', 'damage', 'return', 'manual_fix', 'receive_correction', 'reserve', 'unreserve'].includes(l.change_type))
      .slice(0, 20);

    if (!recentLogs.length) {
      wrap.innerHTML = `<div class="pa-empty">Chưa có biến động điều chỉnh nào.</div>`;
      return;
    }

    const LABELS = {
      inventory_adjustment: '🔧 Điều chỉnh KK',
      damage:               '❌ Hỏng',
      return:               '↩️ Trả hàng',
      manual_fix:           '✏️ Sửa tay',
      receive_correction:   '📥 Sửa nhập',
      reserve:              '🔒 Đặt giữ',
      unreserve:            '🔓 Hủy đặt giữ',
    };

    const tbody = recentLogs.map(l => {
      const roll  = _joinedRolls.find(r => r.receipt_roll_id === l.receipt_roll_id) || {};
      const sign  = l.change_length_m > 0 ? '+' : '';
      const cls   = l.change_length_m < 0 ? 'pa-neg' : 'pa-pos';
      return `<tr class="pa-row">
<td class="pa-td pa-td-sm">${_fmtDateTime(l.created_at)}</td>
<td class="pa-td">${LABELS[l.change_type] || _esc(l.change_type)}</td>
<td class="pa-td">${_esc(roll.commercial_grade_code || '—')}</td>
<td class="pa-td">${_esc(roll.lot_no || '—')}</td>
<td class="pa-td pa-td-num ${cls}">${sign}${Number(l.change_length_m).toFixed(1)}m</td>
<td class="pa-td">${Number(l.before_length_m ?? 0).toFixed(1)}m → ${Number(l.after_length_m ?? 0).toFixed(1)}m</td>
<td class="pa-td">${_esc(l.reason_note || l.created_by || '')}</td>
</tr>`;
    }).join('');

    wrap.innerHTML = `
<table class="pa-table">
  <thead><tr>
    <th class="pa-th">Thời gian</th>
    <th class="pa-th">Loại</th>
    <th class="pa-th">Mã hãng</th>
    <th class="pa-th">Lot</th>
    <th class="pa-th pa-th-num">Thay đổi</th>
    <th class="pa-th">Trước → Sau</th>
    <th class="pa-th">Ghi chú</th>
  </tr></thead>
  <tbody>${tbody}</tbody>
</table>`;
  }

  // ============================================================
  // MODAL ĐIỀU CHỈNH CUỘN
  // ============================================================

  function _openAdjModal(rollId) {
    _adjEditRollId = rollId;
    const roll = _joinedRolls.find(r => r.receipt_roll_id === rollId);
    if (!roll) return;

    const body = _el('pa-adj-modal-body');
    if (!body) return;

    const changeTypeOptions = [
      ['inventory_adjustment', '🔧 Điều chỉnh kiểm kê'],
      ['damage',               '❌ Hỏng / phế liệu'],
      ['return',               '↩️ Trả hàng cho NCC'],
      ['manual_fix',           '✏️ Sửa tay (lỗi nhập liệu)'],
      ['receive_correction',   '📥 Sửa lại phiếu nhập'],
      ['reserve',              '🔒 Đặt giữ cho kế hoạch'],
      ['unreserve',            '🔓 Hủy đặt giữ'],
    ].map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

    body.innerHTML = `
<div class="pa-adj-roll-info">
  <div class="pa-info-row"><span class="pa-info-label">Mã hãng:</span><span class="pa-info-val">${_esc(roll.commercial_grade_code)}</span></div>
  <div class="pa-info-row"><span class="pa-info-label">Mã chuẩn:</span><span class="pa-info-val">${_esc(roll.plastic_code || '—')}</span></div>
  <div class="pa-info-row"><span class="pa-info-label">Lot:</span><span class="pa-info-val">${_esc(roll.lot_no || '—')}</span></div>
  <div class="pa-info-row"><span class="pa-info-label">Vị trí kho:</span><span class="pa-info-val">${_esc(roll.warehouse_location || '—')}</span></div>
  <div class="pa-info-row pa-info-current"><span class="pa-info-label">Hiện còn:</span>
    <span class="pa-info-val pa-info-val-big">${roll.current_length_m.toFixed(1)} m</span></div>
</div>

<div class="pa-form">
  <div class="pa-form-row">
    <label class="pa-form-label">Loại biến động <span class="pa-req">*</span></label>
    <select class="pa-select pa-full" id="pa-adj-change-type">
      <option value="">— Chọn loại —</option>
      ${changeTypeOptions}
    </select>
  </div>

  <div class="pa-form-row">
    <label class="pa-form-label">Hướng thay đổi <span class="pa-req">*</span></label>
    <div class="pa-radio-group">
      <label class="pa-radio-label">
        <input type="radio" name="pa-adj-dir" value="minus" checked> Trừ mét (−)
      </label>
      <label class="pa-radio-label">
        <input type="radio" name="pa-adj-dir" value="plus"> Cộng mét (+)
      </label>
    </div>
  </div>

  <div class="pa-form-row">
    <label class="pa-form-label">Số mét thay đổi <span class="pa-req">*</span></label>
    <input class="pa-input pa-full" id="pa-adj-change-m" type="number" min="0.1" step="0.1"
      placeholder="Nhập số mét (ví dụ: 15.5)">
    <div class="pa-form-hint" id="pa-adj-after-preview"></div>
  </div>

  <div class="pa-form-row">
    <label class="pa-form-label">Trạng thái cuộn sau điều chỉnh</label>
    <select class="pa-select pa-full" id="pa-adj-new-status">
      ${_enumOpts(ROLL_STATUS, '— Giữ nguyên —', '')}
    </select>
  </div>

  <div class="pa-form-row">
    <label class="pa-form-label">Lý do / Ghi chú</label>
    <textarea class="pa-textarea pa-full" id="pa-adj-note" rows="2"
      placeholder="Ghi lý do điều chỉnh…"></textarea>
  </div>

  <div class="pa-form-row">
    <label class="pa-form-label">Người thực hiện</label>
    <input class="pa-input pa-full" id="pa-adj-by" type="text" placeholder="Tên / ID nhân viên">
  </div>

  <div class="pa-modal-footer">
    <button class="pa-btn pa-btn-ghost" onclick="PlasticAdjustmentUI._closeAdjModal()">Hủy</button>
    <button class="pa-btn pa-btn-primary" id="pa-adj-submit-btn" onclick="PlasticAdjustmentUI._submitAdj()">
      Xác nhận điều chỉnh
    </button>
  </div>
</div>`;

    // Live preview mét sau điều chỉnh
    const updatePreview = () => {
      const mInput = _el('pa-adj-change-m');
      const dir    = document.querySelector('input[name="pa-adj-dir"]:checked')?.value || 'minus';
      const m      = parseFloat(mInput?.value || 0);
      const after  = dir === 'minus'
        ? roll.current_length_m - m
        : roll.current_length_m + m;
      const prev = _el('pa-adj-after-preview');
      if (prev && m > 0) {
        prev.innerHTML = `Sau điều chỉnh: <strong style="color:${after < 0 ? '#d32f2f' : '#1976d2'}">${after.toFixed(1)}m</strong>${after < 0 ? ' <span style="color:#d32f2f">⚠ Âm!</span>' : ''}`;
      } else if (prev) {
        prev.textContent = '';
      }
    };
    _el('pa-adj-change-m')?.addEventListener('input', updatePreview);
    document.querySelectorAll('input[name="pa-adj-dir"]').forEach(r => r.addEventListener('change', updatePreview));

    const overlay = _el('pa-adj-modal-overlay');
    if (overlay) { overlay.classList.remove('pa-hidden'); overlay.classList.add('pa-show'); }
  }

  function _closeAdjModal() {
    const overlay = _el('pa-adj-modal-overlay');
    if (overlay) { overlay.classList.add('pa-hidden'); overlay.classList.remove('pa-show'); }
    _adjEditRollId = null;
  }

  async function _submitAdj() {
    if (_submitting) return;
    const roll = _joinedRolls.find(r => r.receipt_roll_id === _adjEditRollId);
    if (!roll) return;

    const changeType = _el('pa-adj-change-type')?.value;
    const dir        = document.querySelector('input[name="pa-adj-dir"]:checked')?.value || 'minus';
    const mVal       = parseFloat(_el('pa-adj-change-m')?.value || '0');
    const note       = _el('pa-adj-note')?.value?.trim() || '';
    const byWho      = _el('pa-adj-by')?.value?.trim() || '';
    const newStatus  = _el('pa-adj-new-status')?.value || '';

    if (!changeType) { _showToast('Hãy chọn loại biến động', 'warn'); return; }
    if (!mVal || mVal <= 0) { _showToast('Nhập số mét > 0', 'warn'); return; }

    const changeLm  = dir === 'minus' ? -mVal : mVal;
    const beforeLm  = roll.current_length_m;
    const afterLm   = +(beforeLm + changeLm).toFixed(1);

    if (afterLm < 0) {
      _showToast(`Sau điều chỉnh tồn âm (${afterLm}m) — kiểm tra lại số mét`, 'warn');
      return;
    }

    _submitting = true;
    const btn = _el('pa-adj-submit-btn');
    if (btn) btn.disabled = true;

    try {
      // 1. Ghi log
      const logPayload = {
        receipt_roll_id:  _adjEditRollId,
        change_type:      changeType,
        change_length_m:  changeLm,
        before_length_m:  beforeLm,
        after_length_m:   afterLm,
        reason_note:      note,
        reference_type:   'manual_adjustment',
        created_by:       byWho || null,
      };
      const { data: logRow, error: logErr } = await _supabase
        .from('plastic_adjustment_log')
        .insert(logPayload)
        .select()
        .single();
      if (logErr) throw logErr;

      // 2. Cập nhật tồn cuộn
      const rollUpdate = { current_length_m: afterLm, updated_at: new Date().toISOString() };
      if (newStatus) rollUpdate.roll_status = newStatus;
      const { error: rollErr } = await _supabase
        .from('plastic_receipt_roll')
        .update(rollUpdate)
        .eq('receipt_roll_id', _adjEditRollId);
      if (rollErr) throw rollErr;

      _showToast(`✅ Đã điều chỉnh: ${beforeLm.toFixed(1)}m → ${afterLm.toFixed(1)}m`, 'success');
      _closeAdjModal();
      await _bootstrap();

    } catch (err) {
      _showToast('❌ ' + (err?.message || String(err)), 'error');
    } finally {
      _submitting = false;
      if (btn) btn.disabled = false;
    }
  }

  // ============================================================
  // KIỂM KÊ — DANH SÁCH PHIẾU
  // ============================================================

  function _refreshSnapList() {
    const listEl = _el('pa-inv-snap-list');
    if (!listEl) return;

    if (!_snapshotData.length) {
      listEl.innerHTML = `<div class="pa-empty">Chưa có phiếu kiểm kê nào.</div>`;
      return;
    }

    listEl.innerHTML = _snapshotData.map(s => {
      const lineCount = _countLineData.filter(l => l.inventory_snapshot_id === s.inventory_snapshot_id).length;
      const isActive  = _invSelectedSnapshotId === s.inventory_snapshot_id;
      return `<div class="pa-snap-item ${isActive ? 'pa-snap-item-active' : ''}"
  onclick="PlasticAdjustmentUI._selectSnapshot('${s.inventory_snapshot_id}')">
  <div class="pa-snap-no">${_esc(s.snapshot_no)}</div>
  <div class="pa-snap-meta">
    <span>${_fmtDate(s.snapshot_date)}</span>
    ${s.warehouse_area ? `<span>Khu: ${_esc(s.warehouse_area)}</span>` : ''}
    <span>${lineCount} cuộn</span>
  </div>
  <div class="pa-snap-status">${_snapStatusBadge(s.status)}</div>
</div>`;
    }).join('');
  }

  function _selectSnapshot(snapshotId) {
    _invSelectedSnapshotId = snapshotId;
    _invFilter             = { keyword: '', count_result: '' };
    _invPage               = 1;

    const snap = _snapshotData.find(s => s.inventory_snapshot_id === snapshotId);

    // Cập nhật title
    const titleEl = _el('pa-inv-detail-title');
    if (titleEl) titleEl.textContent = snap ? `Phiếu: ${snap.snapshot_no}` : 'Chi tiết kiểm kê';

    // Hiện/ẩn action buttons
    const actionsEl = _el('pa-inv-detail-actions');
    if (actionsEl) {
      const isEditable = snap && (snap.status === 'open' || snap.status === 'in_progress');
      actionsEl.style.display = 'flex';
      _el('pa-inv-add-roll-btn') && (_el('pa-inv-add-roll-btn').style.display    = isEditable ? '' : 'none');
      _el('pa-inv-complete-btn') && (_el('pa-inv-complete-btn').style.display    = isEditable ? '' : 'none');
      _el('pa-inv-cancel-btn')   && (_el('pa-inv-cancel-btn').style.display      = isEditable ? '' : 'none');
    }

    // Hiện filter
    const filterEl = _el('pa-inv-line-filter');
    if (filterEl) filterEl.style.display = 'flex';

    _refreshSnapList();
    _refreshInvLines();

    // Re-bind action buttons
    _el('pa-inv-add-roll-btn')?.removeEventListener('click', _openAddRollToInv);
    _el('pa-inv-add-roll-btn')?.addEventListener('click', _openAddRollToInv);
    _el('pa-inv-complete-btn')?.addEventListener('click', () => _completeSnapshot(snapshotId));
    _el('pa-inv-cancel-btn')  ?.addEventListener('click', () => _cancelSnapshot(snapshotId));
  }

  // ============================================================
  // KIỂM KÊ — CHI TIẾT DÒNG
  // ============================================================

  function _refreshInvLines() {
    const wrap = _el('pa-inv-line-table-wrap');
    if (!wrap) return;

    if (!_invSelectedSnapshotId) {
      wrap.innerHTML = `<div class="pa-empty">Chọn phiếu bên trái để xem chi tiết.</div>`;
      return;
    }

    const snap = _snapshotData.find(s => s.inventory_snapshot_id === _invSelectedSnapshotId);
    const isEditable = snap && (snap.status === 'open' || snap.status === 'in_progress');

    const kw = (_invFilter.keyword || '').toLowerCase();
    let lines = _countLineData
      .filter(l => l.inventory_snapshot_id === _invSelectedSnapshotId)
      .filter(l => {
        if (_invFilter.count_result && l.count_result !== _invFilter.count_result) return false;
        if (kw) {
          const roll = _joinedRolls.find(r => r.receipt_roll_id === l.receipt_roll_id) || {};
          const h = [roll.commercial_grade_code, roll.lot_no, roll.warehouse_location].join(' ').toLowerCase();
          if (!h.includes(kw)) return false;
        }
        return true;
      });

    const total      = lines.length;
    const totalPages = Math.ceil(total / INV_PAGE_SIZE) || 1;
    if (_invPage > totalPages) _invPage = totalPages;
    const pageLines  = lines.slice((_invPage - 1) * INV_PAGE_SIZE, _invPage * INV_PAGE_SIZE);

    if (!pageLines.length) {
      wrap.innerHTML = `<div class="pa-empty">Chưa có dòng kiểm kê nào. ${isEditable ? 'Bấm "+ Thêm cuộn vào phiếu" để bắt đầu.' : ''}</div>`;
      _el('pa-inv-line-pager').innerHTML = '';
      return;
    }

    const RESULT_LABELS = {
      matched:   ['pa-badge-ok', '✓ Khớp'],
      over:      ['pa-badge-over', '↑ Thừa'],
      short:     ['pa-badge-short', '↓ Thiếu'],
      not_found: ['pa-badge-notfound', '✗ Không thấy'],
      extra:     ['pa-badge-extra', '+ Ngoài HT'],
    };

    const tbody = pageLines.map(l => {
      const roll   = _joinedRolls.find(r => r.receipt_roll_id === l.receipt_roll_id) || {};
      const [cls, label] = RESULT_LABELS[l.count_result] || ['pa-badge-default', '—'];
      const variance = l.variance_length_m != null ? Number(l.variance_length_m) : null;
      const varClass = variance == null ? '' : variance > 0 ? 'pa-pos' : variance < 0 ? 'pa-neg' : '';
      return `<tr class="pa-row">
<td class="pa-td">${_esc(roll.commercial_grade_code || '—')}</td>
<td class="pa-td">${_esc(roll.lot_no || '—')}</td>
<td class="pa-td">${_esc(roll.warehouse_location || '—')}</td>
<td class="pa-td pa-td-num">${l.system_length_m != null ? Number(l.system_length_m).toFixed(1) + 'm' : '—'}</td>
<td class="pa-td pa-td-num">${l.counted_length_m != null ? Number(l.counted_length_m).toFixed(1) + 'm' : '—'}</td>
<td class="pa-td pa-td-num ${varClass}">${variance != null ? (variance > 0 ? '+' : '') + variance.toFixed(1) + 'm' : '—'}</td>
<td class="pa-td"><span class="pa-badge ${cls}">${label}</span></td>
<td class="pa-td pa-td-sm">${_esc(l.counted_by || '—')}</td>
<td class="pa-td pa-td-action">
  ${isEditable ? `<button class="pa-btn pa-btn-xs pa-btn-light"
    onclick="PlasticAdjustmentUI._openLineModal('${l.inventory_count_line_id}')">✏️</button>` : ''}
</td>
</tr>`;
    }).join('');

    wrap.innerHTML = `
<table class="pa-table">
  <thead><tr>
    <th class="pa-th">Mã hãng</th>
    <th class="pa-th">Lot</th>
    <th class="pa-th">Vị trí kho</th>
    <th class="pa-th pa-th-num">HT (m)</th>
    <th class="pa-th pa-th-num">Đếm được (m)</th>
    <th class="pa-th pa-th-num">Chênh lệch</th>
    <th class="pa-th">Kết quả</th>
    <th class="pa-th">Người đếm</th>
    <th class="pa-th pa-th-action"></th>
  </tr></thead>
  <tbody>${tbody}</tbody>
</table>`;

    // Pager kiểm kê
    const pager = _el('pa-inv-line-pager');
    if (pager) {
      pager.innerHTML = totalPages <= 1
        ? `<span class="pa-pager-info">Hiển thị ${total} dòng</span>`
        : `<button class="pa-btn pa-btn-ghost" onclick="PlasticAdjustmentUI._invGoPage(${_invPage - 1})" ${_invPage === 1 ? 'disabled' : ''}>‹</button>
           <span class="pa-pager-info">${(_invPage - 1) * INV_PAGE_SIZE + 1}–${Math.min(_invPage * INV_PAGE_SIZE, total)} / ${total}</span>
           <button class="pa-btn pa-btn-ghost" onclick="PlasticAdjustmentUI._invGoPage(${_invPage + 1})" ${_invPage === totalPages ? 'disabled' : ''}>›</button>`;
    }
  }

  // ============================================================
  // MODAL TẠO PHIẾU KIỂM KÊ
  // ============================================================

  function _openNewSnapshotModal() {
    const body = _el('pa-inv-snap-body');
    if (!body) return;

    const today = new Date().toISOString().slice(0, 10);
    const autoNo = `INV-${new Date().getFullYear()}-${String(_snapshotData.length + 1).padStart(4, '0')}`;

    body.innerHTML = `
<div class="pa-form">
  <div class="pa-form-row">
    <label class="pa-form-label">Số phiếu <span class="pa-req">*</span></label>
    <input class="pa-input pa-full" id="pa-snap-no" type="text" value="${_esc(autoNo)}" placeholder="INV-2026-0001">
  </div>
  <div class="pa-form-row">
    <label class="pa-form-label">Ngày kiểm kê <span class="pa-req">*</span></label>
    <input class="pa-input pa-full" id="pa-snap-date" type="date" value="${today}">
  </div>
  <div class="pa-form-row">
    <label class="pa-form-label">Khu vực kho (bỏ trống = toàn bộ)</label>
    <input class="pa-input pa-full" id="pa-snap-area" type="text" placeholder="Ví dụ: Khu A, Kệ B…">
  </div>
  <div class="pa-form-row">
    <label class="pa-form-label">Ghi chú</label>
    <textarea class="pa-textarea pa-full" id="pa-snap-note" rows="2" placeholder="Ghi chú về đợt kiểm kê…"></textarea>
  </div>
  <div class="pa-form-row">
    <label class="pa-form-label">Người tạo</label>
    <input class="pa-input pa-full" id="pa-snap-by" type="text" placeholder="Tên / ID nhân viên">
  </div>
  <div class="pa-modal-footer">
    <button class="pa-btn pa-btn-ghost" onclick="PlasticAdjustmentUI._closeSnapModal()">Hủy</button>
    <button class="pa-btn pa-btn-primary" id="pa-snap-submit-btn" onclick="PlasticAdjustmentUI._submitNewSnapshot()">
      Tạo phiếu kiểm kê
    </button>
  </div>
</div>`;

    const overlay = _el('pa-inv-snap-overlay');
    if (overlay) { overlay.classList.remove('pa-hidden'); overlay.classList.add('pa-show'); }
  }

  function _closeSnapModal() {
    const overlay = _el('pa-inv-snap-overlay');
    if (overlay) { overlay.classList.add('pa-hidden'); overlay.classList.remove('pa-show'); }
  }

  async function _submitNewSnapshot() {
    if (_submitting) return;
    const no   = _el('pa-snap-no')?.value?.trim();
    const date = _el('pa-snap-date')?.value;
    const area = _el('pa-snap-area')?.value?.trim() || null;
    const note = _el('pa-snap-note')?.value?.trim() || null;
    const by   = _el('pa-snap-by')?.value?.trim()   || null;

    if (!no)   { _showToast('Nhập số phiếu kiểm kê', 'warn'); return; }
    if (!date) { _showToast('Chọn ngày kiểm kê', 'warn'); return; }

    _submitting = true;
    try {
      const { data, error } = await _supabase
        .from('plastic_inventory_snapshot')
        .insert({ snapshot_no: no, snapshot_date: date, warehouse_area: area, note, created_by: by, status: 'open' })
        .select()
        .single();
      if (error) throw error;

      _showToast(`✅ Đã tạo phiếu kiểm kê: ${no}`, 'success');
      _closeSnapModal();
      await _bootstrap();
      if (data) _selectSnapshot(data.inventory_snapshot_id);

    } catch (err) {
      _showToast('❌ ' + (err?.message || String(err)), 'error');
    } finally {
      _submitting = false;
    }
  }

  // ============================================================
  // THÊM CUỘN VÀO PHIẾU KIỂM KÊ
  // ============================================================

  function _openAddRollToInv() {
    if (!_invSelectedSnapshotId) return;
    const snap = _snapshotData.find(s => s.inventory_snapshot_id === _invSelectedSnapshotId);
    if (!snap) return;

    const existingRollIds = new Set(
      _countLineData
        .filter(l => l.inventory_snapshot_id === _invSelectedSnapshotId)
        .map(l => l.receipt_roll_id)
    );

    const availableRolls = _joinedRolls.filter(r =>
      !existingRollIds.has(r.receipt_roll_id) &&
      r.roll_status !== 'empty' &&
      r.roll_status !== 'returned'
    );

    const body = _el('pa-inv-line-body');
    const title = _el('pa-inv-line-title');
    if (title) title.textContent = `Thêm cuộn vào: ${snap.snapshot_no}`;
    if (!body) return;

    if (!availableRolls.length) {
      body.innerHTML = `<div class="pa-empty">Tất cả cuộn đang tồn đã có trong phiếu này.</div>`;
    } else {
      const rollOpts = availableRolls.map(r =>
        `<option value="${r.receipt_roll_id}">[${_esc(r.plastic_family)}] ${_esc(r.commercial_grade_code)} — Lot: ${_esc(r.lot_no)} — ${r.current_length_m.toFixed(1)}m — ${_esc(r.warehouse_location)}</option>`
      ).join('');

      body.innerHTML = `
<div class="pa-form">
  <div class="pa-form-row">
    <label class="pa-form-label">Chọn cuộn <span class="pa-req">*</span></label>
    <select class="pa-select pa-full" id="pa-line-roll-select">${rollOpts}</select>
  </div>
  <div class="pa-form-row">
    <label class="pa-form-label">Mét đếm được thực tế (m)</label>
    <input class="pa-input pa-full" id="pa-line-counted" type="number" min="0" step="0.1" placeholder="Nhập sau khi đếm xong">
  </div>
  <div class="pa-form-row">
    <label class="pa-form-label">Người đếm</label>
    <input class="pa-input pa-full" id="pa-line-counter" type="text" placeholder="Tên / ID nhân viên">
  </div>
  <div class="pa-form-row">
    <label class="pa-form-label">Ghi chú</label>
    <input class="pa-input pa-full" id="pa-line-note" type="text" placeholder="Ghi chú thêm…">
  </div>
  <div class="pa-modal-footer">
    <button class="pa-btn pa-btn-ghost" onclick="PlasticAdjustmentUI._closeLineModal()">Hủy</button>
    <button class="pa-btn pa-btn-primary" onclick="PlasticAdjustmentUI._submitAddLine()">Thêm vào phiếu</button>
  </div>
</div>`;
    }

    const overlay = _el('pa-inv-line-overlay');
    if (overlay) { overlay.classList.remove('pa-hidden'); overlay.classList.add('pa-show'); }
  }

  async function _submitAddLine() {
    if (_submitting || !_invSelectedSnapshotId) return;
    const rollId  = _el('pa-line-roll-select')?.value;
    const counted = _el('pa-line-counted')?.value;
    const counter = _el('pa-line-counter')?.value?.trim() || null;
    const note    = _el('pa-line-note')?.value?.trim() || null;
    if (!rollId) { _showToast('Chọn cuộn', 'warn'); return; }

    const roll         = _joinedRolls.find(r => r.receipt_roll_id === rollId);
    const systemLm     = roll ? roll.current_length_m : null;
    const countedLm    = counted !== '' && counted != null ? parseFloat(counted) : null;

    let countResult = null;
    if (countedLm != null && systemLm != null) {
      const diff = countedLm - systemLm;
      if (Math.abs(diff) < 0.1)   countResult = 'matched';
      else if (diff > 0)           countResult = 'over';
      else                          countResult = 'short';
    }

    _submitting = true;
    try {
      const { error } = await _supabase.from('plastic_inventory_count_line').insert({
        inventory_snapshot_id: _invSelectedSnapshotId,
        receipt_roll_id:       rollId,
        system_length_m:       systemLm,
        counted_length_m:      countedLm,
        count_result:          countResult,
        count_note:            note,
        counted_by:            counter,
        counted_at:            countedLm != null ? new Date().toISOString() : null,
      });
      if (error) throw error;

      // Tự chuyển snapshot sang in_progress nếu đang open
      const snap = _snapshotData.find(s => s.inventory_snapshot_id === _invSelectedSnapshotId);
      if (snap?.status === 'open') {
        await _supabase.from('plastic_inventory_snapshot')
          .update({ status: 'in_progress' })
          .eq('inventory_snapshot_id', _invSelectedSnapshotId);
      }

      _showToast('✅ Đã thêm cuộn vào phiếu kiểm kê', 'success');
      _closeLineModal();
      await _bootstrap();
      _selectSnapshot(_invSelectedSnapshotId);

    } catch (err) {
      _showToast('❌ ' + (err?.message || String(err)), 'error');
    } finally {
      _submitting = false;
    }
  }

  // ============================================================
  // MODAL SỬA DÒNG KIỂM KÊ
  // ============================================================

  function _openLineModal(lineId) {
    const line = _countLineData.find(l => l.inventory_count_line_id === lineId);
    if (!line) return;
    const roll = _joinedRolls.find(r => r.receipt_roll_id === line.receipt_roll_id) || {};
    const title = _el('pa-inv-line-title');
    if (title) title.textContent = `Sửa kiểm kê: ${roll.commercial_grade_code || roll.receipt_roll_id}`;
    _invEditLineId = lineId;

    const body = _el('pa-inv-line-body');
    if (!body) return;

    body.innerHTML = `
<div class="pa-form">
  <div class="pa-info-row"><span class="pa-info-label">Mã hãng:</span> <span>${_esc(roll.commercial_grade_code)}</span></div>
  <div class="pa-info-row"><span class="pa-info-label">Lot:</span> <span>${_esc(roll.lot_no)}</span></div>
  <div class="pa-info-row"><span class="pa-info-label">Mét hệ thống:</span> <span><strong>${line.system_length_m != null ? Number(line.system_length_m).toFixed(1) + 'm' : '—'}</strong></span></div>

  <div class="pa-form-row">
    <label class="pa-form-label">Mét đếm thực tế <span class="pa-req">*</span></label>
    <input class="pa-input pa-full" id="pa-edit-line-counted" type="number" min="0" step="0.1"
      value="${line.counted_length_m != null ? Number(line.counted_length_m).toFixed(1) : ''}">
  </div>
  <div class="pa-form-row">
    <label class="pa-form-label">Ghi chú</label>
    <input class="pa-input pa-full" id="pa-edit-line-note" type="text"
      value="${_esc(line.count_note || '')}">
  </div>
  <div class="pa-form-row">
    <label class="pa-form-label">Người đếm</label>
    <input class="pa-input pa-full" id="pa-edit-line-counter" type="text"
      value="${_esc(line.counted_by || '')}">
  </div>
  <div class="pa-modal-footer">
    <button class="pa-btn pa-btn-ghost" onclick="PlasticAdjustmentUI._closeLineModal()">Hủy</button>
    <button class="pa-btn pa-btn-primary" onclick="PlasticAdjustmentUI._submitEditLine()">Lưu</button>
  </div>
</div>`;

    const overlay = _el('pa-inv-line-overlay');
    if (overlay) { overlay.classList.remove('pa-hidden'); overlay.classList.add('pa-show'); }
  }

  async function _submitEditLine() {
    if (_submitting || !_invEditLineId) return;
    const counted  = _el('pa-edit-line-counted')?.value;
    const note     = _el('pa-edit-line-note')?.value?.trim() || null;
    const counter  = _el('pa-edit-line-counter')?.value?.trim() || null;
    const line     = _countLineData.find(l => l.inventory_count_line_id === _invEditLineId);
    if (!line) return;

    const countedLm = counted !== '' && counted != null ? parseFloat(counted) : null;
    const systemLm  = line.system_length_m != null ? Number(line.system_length_m) : null;
    let countResult = null;
    if (countedLm != null && systemLm != null) {
      const diff = countedLm - systemLm;
      if (Math.abs(diff) < 0.1)  countResult = 'matched';
      else if (diff > 0)          countResult = 'over';
      else                         countResult = 'short';
    }

    _submitting = true;
    try {
      const { error } = await _supabase.from('plastic_inventory_count_line')
        .update({ counted_length_m: countedLm, count_result: countResult, count_note: note, counted_by: counter, counted_at: new Date().toISOString() })
        .eq('inventory_count_line_id', _invEditLineId);
      if (error) throw error;

      _showToast('✅ Đã cập nhật dòng kiểm kê', 'success');
      _closeLineModal();
      await _bootstrap();
      _selectSnapshot(_invSelectedSnapshotId);
    } catch (err) {
      _showToast('❌ ' + (err?.message || String(err)), 'error');
    } finally {
      _submitting = false;
    }
  }

  function _closeLineModal() {
    const overlay = _el('pa-inv-line-overlay');
    if (overlay) { overlay.classList.add('pa-hidden'); overlay.classList.remove('pa-show'); }
    _invEditLineId = null;
  }

  // ============================================================
  // HOÀN THÀNH / HỦY KIỂM KÊ
  // ============================================================

  async function _completeSnapshot(snapshotId) {
    if (_submitting) return;
    const lines    = _countLineData.filter(l => l.inventory_snapshot_id === snapshotId);
    const uncounted = lines.filter(l => l.counted_length_m == null).length;
    if (uncounted > 0) {
      const ok = confirm(`Còn ${uncounted} cuộn chưa có mét kiểm kê. Vẫn hoàn thành phiếu?`);
      if (!ok) return;
    }
    _submitting = true;
    try {
      const { error } = await _supabase.from('plastic_inventory_snapshot')
        .update({ status: 'completed', updated_at: new Date().toISOString() })
        .eq('inventory_snapshot_id', snapshotId);
      if (error) throw error;
      _showToast('✅ Đã hoàn thành phiếu kiểm kê', 'success');
      await _bootstrap();
      _selectSnapshot(snapshotId);
    } catch (err) {
      _showToast('❌ ' + (err?.message || String(err)), 'error');
    } finally {
      _submitting = false;
    }
  }

  async function _cancelSnapshot(snapshotId) {
    if (_submitting) return;
    if (!confirm('Xác nhận hủy phiếu kiểm kê này?')) return;
    _submitting = true;
    try {
      const { error } = await _supabase.from('plastic_inventory_snapshot')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('inventory_snapshot_id', snapshotId);
      if (error) throw error;
      _showToast('Đã hủy phiếu kiểm kê', 'warn');
      await _bootstrap();
    } catch (err) {
      _showToast('❌ ' + (err?.message || String(err)), 'error');
    } finally {
      _submitting = false;
    }
  }

  // ============================================================
  // SWITCH TAB
  // ============================================================

  function _switchTab(tab) {
    _adjTab = tab;
    const panelAdj = _el('pa-panel-adjust');
    const panelInv = _el('pa-panel-inventory');
    if (panelAdj) panelAdj.classList.toggle('pa-hidden', tab !== 'adjust');
    if (panelInv) panelInv.classList.toggle('pa-hidden', tab !== 'inventory');

    // Update tab button styles
    _containerEl.querySelectorAll('.pa-tab').forEach(btn => {
      btn.classList.toggle('pa-tab-active', btn.textContent.includes(tab === 'adjust' ? 'Điều chỉnh' : 'Kiểm kê'));
    });
  }

  // ============================================================
  // LOADING
  // ============================================================

  function _setLoading(on) {
    const el = _el('pa-loading');
    if (el) el.style.display = on ? 'flex' : 'none';
  }

  // ============================================================
  // HELPERS
  // ============================================================

  function _adjGoPage(p) {
    const rows = _getAdjFilteredRolls();
    const total = Math.ceil(rows.length / ADJ_PAGE_SIZE) || 1;
    _adjPage = Math.max(1, Math.min(p, total));
    _refreshAdjTable();
  }

  function _invGoPage(p) {
    const lines = _countLineData.filter(l => l.inventory_snapshot_id === _invSelectedSnapshotId);
    const total = Math.ceil(lines.length / INV_PAGE_SIZE) || 1;
    _invPage = Math.max(1, Math.min(p, total));
    _refreshInvLines();
  }

  function _rollStatusBadge(status) {
    const m = {
      in_stock: ['#e3f2fd', '#1565c0', 'Trong kho'],
      in_use:   ['#e8f5e9', '#2e7d32', 'Đang dùng'],
      empty:    ['#f5f5f5', '#9e9e9e', 'Đã hết'],
      returned: ['#f3e5f5', '#6a1b9a', 'Đã trả'],
      damaged:  ['#ffebee', '#b71c1c', 'Hỏng'],
      reserved: ['#fff3e0', '#e65100', 'Đã đặt'],
    };
    const [bg, color, label] = m[status] || ['#eee', '#555', status];
    return `<span class="pa-badge" style="background:${bg};color:${color}">${label}</span>`;
  }

  function _snapStatusBadge(status) {
    const m = {
      open:        ['#e3f2fd', '#1565c0', 'Mới mở'],
      in_progress: ['#fff8e1', '#f57f17', 'Đang đếm'],
      completed:   ['#e8f5e9', '#2e7d32', 'Hoàn thành'],
      cancelled:   ['#fafafa', '#9e9e9e', 'Đã hủy'],
    };
    const [bg, color, label] = m[status] || ['#eee', '#555', status];
    return `<span class="pa-badge" style="background:${bg};color:${color}">${label}</span>`;
  }

  function _dimText(thick, width) {
    const t = thick  != null ? Number(thick).toFixed(3)  : '—';
    const w = width  != null ? Number(width).toFixed(0)  : '—';
    return `${t}×${w}`;
  }

  function _enumOpts(enumObj, allLabel, current) {
    const opts = Object.values(enumObj)
      .map(o => `<option value="${_esc(o.value)}" ${current === o.value ? 'selected' : ''}>${_esc(o.label || o.value)}</option>`)
      .join('');
    return `<option value="" ${!current ? 'selected' : ''}>${allLabel}</option>${opts}`;
  }

  function _fmtDate(val)     { if (!val) return '—'; try { return new Date(val).toLocaleDateString('ja-JP'); } catch { return val; } }
  function _fmtDateTime(val) { if (!val) return '—'; try { return new Date(val).toLocaleString('ja-JP'); } catch { return val; } }

  function _esc(v) {
    if (v == null) return '';
    return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function _el(id) { return document.getElementById(id); }

  function _showToast(msg, type = 'info') {
    const el = _el('pa-toast');
    if (!el) return;
    el.textContent   = msg;
    el.className     = `pa-toast pa-toast-${type} pa-toast-show`;
    el.style.display = 'block';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
      el.classList.remove('pa-toast-show');
      setTimeout(() => { el.style.display = 'none'; }, 400);
    }, 3500);
  }

  // ============================================================
  // CSS
  // ============================================================

  function _injectStyles() {
    if (document.getElementById('pa-style')) return;
    const s = document.createElement('style');
    s.id = 'pa-style';
    s.textContent = `
/* ===== Plastic Adjustment UI ===== */
.pa-wrap { font-family: 'Segoe UI','Noto Sans JP',sans-serif; padding: 16px; color: #1a1a2e; max-width: 100%; }
.pa-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.pa-title  { font-size: 1.3rem; font-weight: 700; margin: 0 0 4px; }
.pa-subtitle { font-size: 0.82rem; color: #666; }
.pa-head-actions { display: flex; gap: 8px; }
.pa-hidden { display: none !important; }
.pa-show   { display: flex !important; }

/* Tabs */
.pa-tabs { display: flex; gap: 4px; margin-bottom: 14px; border-bottom: 2px solid #e4e8f0; }
.pa-tab  { background: none; border: none; padding: 8px 18px; cursor: pointer; font-size: 0.88rem; color: #666; border-radius: 6px 6px 0 0; transition: background 0.15s; }
.pa-tab:hover      { background: #f0f4fa; color: #1a1a2e; }
.pa-tab-active     { background: #1976d2; color: #fff !important; font-weight: 600; }

/* Filters */
.pa-filter-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.pa-input  { border: 1px solid #c8d0dc; border-radius: 6px; padding: 5px 10px; font-size: 0.82rem; background: #fff; outline: none; }
.pa-input:focus { border-color: #1976d2; box-shadow: 0 0 0 2px rgba(25,118,210,.12); }
.pa-search { min-width: 200px; }
.pa-full   { width: 100%; box-sizing: border-box; }
.pa-select { border: 1px solid #c8d0dc; border-radius: 6px; padding: 5px 8px; font-size: 0.82rem; background: #fff; outline: none; }
.pa-textarea { border: 1px solid #c8d0dc; border-radius: 6px; padding: 5px 10px; font-size: 0.82rem; resize: vertical; }

/* Buttons */
.pa-btn { padding: 6px 14px; border-radius: 7px; font-size: 0.82rem; cursor: pointer; border: none; transition: background 0.15s; }
.pa-btn-primary { background: #1976d2; color: #fff; }
.pa-btn-primary:hover { background: #1565c0; }
.pa-btn-light   { background: #e3eaf5; color: #1a1a2e; }
.pa-btn-light:hover { background: #ccd8ee; }
.pa-btn-ghost   { background: transparent; color: #555; border: 1px solid #c8d0dc; }
.pa-btn-ghost:hover { background: #f0f4f8; }
.pa-btn-success { background: #388e3c; color: #fff; }
.pa-btn-success:hover { background: #2e7d32; }
.pa-btn-danger  { background: #d32f2f; color: #fff; }
.pa-btn-danger:hover  { background: #b71c1c; }
.pa-btn-xs { padding: 3px 8px; font-size: 0.75rem; }
.pa-btn:disabled { opacity: 0.55; cursor: not-allowed; }

/* Table */
.pa-table-wrap  { overflow-x: auto; border-radius: 10px; border: 1px solid #dde3ed; background: #fff; margin-bottom: 12px; }
.pa-table       { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.pa-th          { padding: 8px 10px; background: #f0f4fa; font-weight: 600; color: #444; border-bottom: 2px solid #dde3ed; white-space: nowrap; text-align: left; }
.pa-th-num, .pa-td-num { text-align: right; }
.pa-th-action, .pa-td-action { width: 50px; text-align: center; }
.pa-td          { padding: 6px 10px; border-bottom: 1px solid #edf0f5; vertical-align: middle; }
.pa-td-sm       { font-size: 0.76rem; color: #888; white-space: nowrap; }
.pa-td-bold     { font-weight: 600; }
.pa-td-grade    { font-size: 0.82rem; }
.pa-row         { cursor: default; transition: background 0.1s; }
.pa-row:hover   { background: #f7f9fc; }
.pa-neg  { color: #d32f2f; font-weight: 600; }
.pa-pos  { color: #388e3c; font-weight: 600; }
.pa-empty { text-align: center; color: #999; padding: 32px 16px; font-size: 0.88rem; }
.pa-loading { display: flex; align-items: center; justify-content: center; padding: 24px; color: #888; }

/* Badges */
.pa-badge          { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 0.72rem; font-weight: 600; white-space: nowrap; background: #eee; }
.pa-badge-ok       { background: #e8f5e9; color: #2e7d32; }
.pa-badge-over     { background: #e3f2fd; color: #1565c0; }
.pa-badge-short    { background: #fff3e0; color: #e65100; }
.pa-badge-notfound { background: #ffebee; color: #b71c1c; }
.pa-badge-extra    { background: #f3e5f5; color: #6a1b9a; }
.pa-badge-warn     { background: #fff9c4; color: #f57f17; }
.pa-badge-danger   { background: #ffccbc; color: #bf360c; }
.pa-badge-default  { background: #eee; color: #555; }
.pa-chip           { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 0.72rem; margin-top: 2px; }
.pa-chip-mapped    { background: #e8f5e9; color: #2e7d32; }
.pa-chip-unmapped  { background: #fce4ec; color: #880e4f; }

/* Pager */
.pa-pager { display: flex; align-items: center; gap: 6px; padding: 6px 4px; font-size: 0.82rem; flex-wrap: wrap; }
.pa-pager-info { color: #666; margin: 0 6px; }

/* Adjustment panel */
.pa-adj-wrap     { }
.pa-adj-topbar   { margin-bottom: 8px; }
.pa-adj-info     { font-size: 0.78rem; color: #777; margin-bottom: 8px; }
.pa-log-section  { margin-top: 20px; }
.pa-log-title    { font-size: 0.88rem; font-weight: 600; color: #555; margin-bottom: 8px; border-top: 1px solid #e4e8f0; padding-top: 12px; }
.pa-section-title{ font-size: 0.92rem; font-weight: 700; color: #1a1a2e; }

/* Inventory panel */
.pa-inv-wrap         { }
.pa-inv-topbar       { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.pa-inv-topbar-left  { }
.pa-inv-grid         { display: grid; grid-template-columns: 260px 1fr; gap: 14px; }
.pa-inv-snap-list    { border: 1px solid #dde3ed; border-radius: 10px; background: #fff; overflow-y: auto; max-height: 520px; }
.pa-snap-item        { padding: 10px 14px; border-bottom: 1px solid #edf0f5; cursor: pointer; transition: background 0.1s; }
.pa-snap-item:hover  { background: #f5f8ff; }
.pa-snap-item-active { background: #e8f0fe; border-left: 3px solid #1976d2; }
.pa-snap-no          { font-size: 0.88rem; font-weight: 600; }
.pa-snap-meta        { font-size: 0.76rem; color: #888; display: flex; gap: 8px; flex-wrap: wrap; margin: 2px 0; }
.pa-snap-status      { }
.pa-inv-detail       { }
.pa-inv-detail-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.pa-inv-detail-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* Form */
.pa-form      { display: flex; flex-direction: column; gap: 12px; }
.pa-form-row  { display: flex; flex-direction: column; gap: 4px; }
.pa-form-label{ font-size: 0.82rem; font-weight: 600; color: #444; }
.pa-form-hint { font-size: 0.78rem; color: #666; margin-top: 3px; }
.pa-req       { color: #d32f2f; }
.pa-radio-group { display: flex; gap: 16px; padding: 4px 0; }
.pa-radio-label { font-size: 0.84rem; display: flex; align-items: center; gap: 5px; cursor: pointer; }

/* Info rows trong modal */
.pa-adj-roll-info { background: #f7f9fc; border: 1px solid #dde3ed; border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; display: flex; flex-direction: column; gap: 4px; }
.pa-info-row  { display: flex; align-items: center; gap: 8px; font-size: 0.82rem; }
.pa-info-label{ color: #777; min-width: 90px; }
.pa-info-val  { color: #1a1a2e; font-weight: 500; }
.pa-info-val-big { font-size: 1.15rem; font-weight: 700; color: #1976d2; }
.pa-info-current { margin-top: 4px; border-top: 1px solid #e4e8f0; padding-top: 6px; }

/* Modal */
.pa-overlay  { position: fixed; inset: 0; background: rgba(0,0,0,0.42); z-index: 3000; display: flex; align-items: center; justify-content: center; }
.pa-modal    { background: #fff; border-radius: 14px; width: 95%; max-width: 560px; max-height: 88vh; display: flex; flex-direction: column; box-shadow: 0 8px 40px rgba(0,0,0,0.22); overflow: hidden; }
.pa-modal-sm { max-width: 460px; }
.pa-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid #eee; }
.pa-modal-title  { font-size: 1rem; font-weight: 700; }
.pa-modal-close  { background: none; border: none; font-size: 1.1rem; cursor: pointer; color: #888; padding: 4px 8px; border-radius: 6px; }
.pa-modal-close:hover { background: #f0f0f0; }
.pa-modal-body   { overflow-y: auto; padding: 16px 18px; flex: 1; }
.pa-modal-footer { display: flex; justify-content: flex-end; gap: 8px; padding-top: 12px; border-top: 1px solid #eee; margin-top: 4px; }

/* Toast */
.pa-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); padding: 10px 22px; border-radius: 8px; font-size: 0.88rem; z-index: 9999; opacity: 0; transition: opacity 0.3s; box-shadow: 0 4px 16px rgba(0,0,0,0.18); white-space: nowrap; }
.pa-toast-show    { opacity: 1; }
.pa-toast-info    { background: #1976d2; color: #fff; }
.pa-toast-success { background: #388e3c; color: #fff; }
.pa-toast-error   { background: #d32f2f; color: #fff; }
.pa-toast-warn    { background: #f57c00; color: #fff; }

@media (max-width: 700px) {
  .pa-inv-grid { grid-template-columns: 1fr; }
  .pa-inv-snap-list { max-height: 220px; }
  .pa-modal { width: 100%; max-height: 96vh; border-radius: 10px 10px 0 0; align-self: flex-end; }
}`;
    document.head.appendChild(s);
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  return {
    init,
    reload: () => _bootstrap(),
    _switchTab,
    _openAdjModal,
    _closeAdjModal,
    _submitAdj,
    _adjGoPage,
    _openNewSnapshotModal,
    _closeSnapModal,
    _submitNewSnapshot,
    _selectSnapshot,
    _openAddRollToInv,
    _submitAddLine,
    _openLineModal,
    _submitEditLine,
    _closeLineModal,
    _invGoPage,
  };

})();

if (typeof window !== 'undefined') {
  window.PlasticAdjustmentUI = PlasticAdjustmentUI;
}


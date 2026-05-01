/**
 * plastic-usage-ui.js
 * Module UI: Xuất dùng nhựa cho sản xuất, trừ mét theo từng cuộn,
 * cập nhật tồn hiện tại và ghi lịch sử vào plastic_adjustment_log.
 * Phụ thuộc: plastic-manager-schema.js, supabase client
 */

const PlasticUsageUI = (() => {
  let _supabase = null;
  let _containerEl = null;

  let _masterData = [];
  let _receiptData = [];
  let _rollData = [];
  let _adjustmentLogData = [];
  let _joinedRows = [];

  let _selectedRollId = null;
  let _page = 1;
  const PAGE_SIZE = 50;
  let _toastTimer = null;
  let _inputTimer = null;
  let _submitting = false;

  let _filter = {
    keyword: '',
    plastic_family: '',
    color_code_raw: '',
    color_name_normalized: '',
    electrical_property: '',
    silicone_status_normalized: '',
    supplier_name: '',
    warehouse_location: '',
    roll_status: '',
    thickness_min: '',
    thickness_max: '',
    width_min: '',
    width_max: '',
    current_min: '',
    current_max: '',
    only_available: true,
    only_low_stock: false,
  };

  let _sort = { field: 'current_length_m', dir: 'desc' };

  function init(supabaseClient, containerId) {
    _supabase = supabaseClient;
    _containerEl = document.getElementById(containerId);
    if (!_containerEl) {
      console.error(`[PlasticUsageUI] Không tìm thấy container #${containerId}`);
      return;
    }
    _injectStyles();
    _render();
    _bootstrap();
  }

  async function _bootstrap() {
    try {
      await _loadAllData();
      _joinRows();
      _ensureSelectedRoll();
      _refreshUI();
    } catch (err) {
      _showToast('❌ ' + (err?.message || String(err)), 'error');
    }
  }

  async function _loadAllData() {
    const [masterRes, receiptRes, rollRes, logRes] = await Promise.all([
      _supabase.from('plastic_master').select('*').order('plastic_code', { ascending: true }),
      _supabase.from('plastic_receipt').select('*').order('receipt_date', { ascending: false }).order('created_at', { ascending: false }),
      _supabase.from('plastic_receipt_roll').select('*').order('updated_at', { ascending: false }).order('created_at', { ascending: false }),
      _supabase.from('plastic_adjustment_log').select('*').order('created_at', { ascending: false }).limit(2000),
    ]);

    if (masterRes.error) throw masterRes.error;
    if (receiptRes.error) throw receiptRes.error;
    if (rollRes.error) throw rollRes.error;
    if (logRes.error) throw logRes.error;

    _masterData = masterRes.data || [];
    _receiptData = receiptRes.data || [];
    _rollData = rollRes.data || [];
    _adjustmentLogData = logRes.data || [];
  }

  function _joinRows() {
    _joinedRows = _rollData.map(roll => {
      const receipt = _receiptData.find(r => r.receipt_id === roll.receipt_id) || {};
      const master = _masterData.find(m => m.plastic_id === roll.plastic_id) || {};
      const current = Number(roll.current_length_m || 0);
      const received = Number(roll.received_length_m || 0);
      const used = received > current ? received - current : 0;
      const usagePercent = received > 0 ? ((received - current) / received) * 100 : 0;
      return {
        row_id: roll.receipt_roll_id,
        receipt_roll_id: roll.receipt_roll_id,
        receipt_id: roll.receipt_id,
        plastic_id: roll.plastic_id || null,
        plastic_code: master.plastic_code || '',
        plastic_family: master.plastic_family || '',
        plastic_subtype: master.plastic_subtype || '',
        thickness_mm: roll.thickness_mm ?? master.thickness_mm ?? null,
        width_mm: roll.width_mm ?? master.width_mm ?? null,
        nominal_length_m: roll.nominal_length_m ?? master.standard_length_m ?? null,
        received_length_m: received,
        current_length_m: current,
        used_length_m: used,
        usage_percent: usagePercent,
        commercial_grade_code: roll.commercial_grade_code || '',
        supplier_name: roll.supplier_name || receipt.supplier_name || '',
        lot_no: roll.lot_no || '',
        warehouse_location: roll.warehouse_location || '',
        receipt_no: receipt.receipt_no || '',
        receipt_date: receipt.receipt_date || '',
        roll_status: roll.roll_status || '',
        color_code_raw: master.color_code_raw || '',
        color_name_normalized: master.color_name_normalized || '',
        electrical_property: master.electrical_property || '',
        silicone_status_normalized: master.silicone_status_normalized || '',
        additive_flags: master.additive_flags || '',
        notes: roll.notes || '',
        low_stock: current > 0 && current <= 50,
      };
    });
  }

  function _ensureSelectedRoll() {
    const rows = _getFilteredRows();
    if (!_selectedRollId && rows.length) {
      _selectedRollId = rows[0].receipt_roll_id;
      return;
    }
    if (_selectedRollId && !rows.find(r => String(r.receipt_roll_id) === String(_selectedRollId))) {
      _selectedRollId = rows[0]?.receipt_roll_id || null;
    }
  }

  function _render() {
    _containerEl.innerHTML = `
<div class="pu-wrap">
  <div class="pu-header">
    <div>
      <h2 class="pu-title">✂️ Xuất dùng nhựa</h2>
      <div class="pu-subtitle">Chọn đúng cuộn đang còn mét, nhập số mét đã dùng, hệ thống tự trừ tồn và lưu lịch sử.</div>
    </div>
    <div class="pu-head-actions">
      <button class="pu-btn pu-btn-light" id="pu-reload-btn">↻ Tải lại</button>
    </div>
  </div>

  <div class="pu-stats" id="pu-stats-bar"></div>

  <div class="pu-filter-card">
    <div class="pu-filter-top">
      <input class="pu-input pu-search" id="pu-f-keyword" type="text" placeholder="Tìm mã chuẩn, mã hãng, lot, kho, nhà cung cấp…" value="${_esc(_filter.keyword)}">
      <select class="pu-select" id="pu-f-family">${_enumOptions(PLASTIC_FAMILY, 'Tất cả họ nhựa', _filter.plastic_family)}</select>
      <select class="pu-select" id="pu-f-color-code">${_enumOptions(COLOR_CODE, 'Tất cả mã màu', _filter.color_code_raw)}</select>
      <select class="pu-select" id="pu-f-color-name">${_enumOptions(COLOR_NAME_NORMALIZED, 'Tất cả màu chuẩn hóa', _filter.color_name_normalized)}</select>
      <select class="pu-select" id="pu-f-elec">${_enumOptions(ELECTRICAL_PROPERTY, 'Tất cả tính chất điện', _filter.electrical_property)}</select>
      <select class="pu-select" id="pu-f-si">${_enumOptions(SILICONE_STATUS, 'Tất cả silicone', _filter.silicone_status_normalized)}</select>
      <select class="pu-select" id="pu-f-roll-status">${_enumOptions(ROLL_STATUS, 'Tất cả trạng thái cuộn', _filter.roll_status)}</select>
      <input class="pu-input" id="pu-f-supplier" type="text" placeholder="Nhà cung cấp" value="${_esc(_filter.supplier_name)}">
      <input class="pu-input" id="pu-f-location" type="text" placeholder="Vị trí kho" value="${_esc(_filter.warehouse_location)}">
      <input class="pu-input pu-num" id="pu-f-thick-min" type="number" step="0.001" placeholder="Dày từ" value="${_esc(_filter.thickness_min)}">
      <input class="pu-input pu-num" id="pu-f-thick-max" type="number" step="0.001" placeholder="Dày đến" value="${_esc(_filter.thickness_max)}">
      <input class="pu-input pu-num" id="pu-f-width-min" type="number" step="0.1" placeholder="Khổ từ" value="${_esc(_filter.width_min)}">
      <input class="pu-input pu-num" id="pu-f-width-max" type="number" step="0.1" placeholder="Khổ đến" value="${_esc(_filter.width_max)}">
      <input class="pu-input pu-num" id="pu-f-current-min" type="number" step="0.1" placeholder="Mét còn từ" value="${_esc(_filter.current_min)}">
      <input class="pu-input pu-num" id="pu-f-current-max" type="number" step="0.1" placeholder="Mét còn đến" value="${_esc(_filter.current_max)}">
    </div>
    <div class="pu-filter-bottom">
      <label class="pu-check"><input id="pu-f-only-available" type="checkbox" ${_filter.only_available ? 'checked' : ''}> <span>Chỉ hiện cuộn còn dùng được</span></label>
      <label class="pu-check"><input id="pu-f-only-low-stock" type="checkbox" ${_filter.only_low_stock ? 'checked' : ''}> <span>Chỉ hiện cuộn tồn thấp (≤ 50 m)</span></label>
      <button class="pu-btn pu-btn-light" id="pu-clear-filter-btn">Xóa bộ lọc</button>
    </div>
  </div>

  <div class="pu-main-grid">
    <section class="pu-card pu-list-card">
      <div class="pu-card-head">
        <div class="pu-card-title" id="pu-table-title">Danh sách cuộn có thể xuất dùng</div>
      </div>
      <div class="pu-table-wrap" id="pu-table-wrap"></div>
      <div class="pu-pager" id="pu-pager"></div>
    </section>

    <aside class="pu-side-grid">
      <section class="pu-card">
        <div class="pu-card-head">
          <div class="pu-card-title">Chi tiết cuộn</div>
        </div>
        <div class="pu-detail-box" id="pu-detail-box"></div>
      </section>

      <section class="pu-card">
        <div class="pu-card-head">
          <div class="pu-card-title">Phiếu xuất dùng</div>
        </div>
        <form class="pu-form" id="pu-usage-form">
          <div class="pu-form-grid">
            <label class="pu-field">
              <span>Số mét dùng</span>
              <input class="pu-input" id="pu-used-length" type="number" step="0.1" min="0" placeholder="Ví dụ 12.5">
            </label>
            <label class="pu-field">
              <span>Ngày giờ xuất dùng</span>
              <input class="pu-input" id="pu-used-at" type="datetime-local">
            </label>
            <label class="pu-field">
              <span>Lệnh sản xuất</span>
              <input class="pu-input" id="pu-work-order-no" type="text" placeholder="Ví dụ WO-2026-001">
            </label>
            <label class="pu-field">
              <span>Máy / công đoạn</span>
              <input class="pu-input" id="pu-machine-code" type="text" placeholder="Ví dụ Thermo-01">
            </label>
            <label class="pu-field">
              <span>Người nhận / người dùng</span>
              <input class="pu-input" id="pu-operator-name" type="text" placeholder="Ví dụ Nguyễn Văn A">
            </label>
            <label class="pu-field pu-field-full">
              <span>Ghi chú</span>
              <textarea class="pu-textarea" id="pu-reason-note" placeholder="Ví dụ: Xuất dùng cho đơn hàng A, chạy máy định hình, test đầu ca"></textarea>
            </label>
          </div>
          <div class="pu-form-actions">
            <button class="pu-btn pu-btn-primary" type="submit" id="pu-submit-btn">Lưu xuất dùng</button>
          </div>
        </form>
      </section>

      <section class="pu-card">
        <div class="pu-card-head">
          <div class="pu-card-title">Lịch sử xuất dùng của cuộn đang chọn</div>
        </div>
        <div class="pu-log-wrap" id="pu-log-wrap"></div>
      </section>
    </aside>
  </div>

  <div id="pu-toast" class="pu-toast pu-hidden"></div>
</div>`;

    const nowInput = document.getElementById('pu-used-at');
    if (nowInput && !nowInput.value) nowInput.value = _datetimeLocalNow();

    _containerEl.addEventListener('click', _onClick);
    _containerEl.addEventListener('change', _onChange);
    _containerEl.addEventListener('input', _onInput);
    _containerEl.addEventListener('submit', _onSubmit);
  }

  function _refreshUI() {
    _renderStats();
    _renderTable();
    _renderDetail();
    _renderLog();
  }

  function _renderStats() {
    const el = document.getElementById('pu-stats-bar');
    if (!el) return;
    const availableRows = _joinedRows.filter(r => Number(r.current_length_m || 0) > 0);
    const totalCurrent = availableRows.reduce((sum, r) => sum + Number(r.current_length_m || 0), 0);
    const totalUsed = _joinedRows.reduce((sum, r) => sum + Number(r.used_length_m || 0), 0);
    const lowStock = availableRows.filter(r => r.low_stock).length;
    const unmapped = _joinedRows.filter(r => !r.plastic_id).length;
    el.innerHTML = `
      <span class="pu-stat">🎞️ Cuộn còn dùng: <b>${availableRows.length}</b></span>
      <span class="pu-stat pu-stat-ok">📦 Mét còn: <b>${_num(totalCurrent)}</b> m</span>
      <span class="pu-stat pu-stat-info">✂️ Mét đã dùng: <b>${_num(totalUsed)}</b> m</span>
      <span class="pu-stat pu-stat-warn">🟠 Tồn thấp: <b>${lowStock}</b></span>
      <span class="pu-stat pu-stat-warn">🧩 Chưa map: <b>${unmapped}</b></span>`;
  }

  function _getFilteredRows() {
    const kw = (_filter.keyword || '').trim().toLowerCase();
    return _joinedRows.filter(row => {
      if (kw) {
        const hay = [
          row.plastic_code,
          row.commercial_grade_code,
          row.lot_no,
          row.supplier_name,
          row.warehouse_location,
          row.receipt_no,
          row.plastic_family,
        ].join(' ').toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      if (_filter.plastic_family && row.plastic_family !== _filter.plastic_family) return false;
      if (_filter.color_code_raw && row.color_code_raw !== _filter.color_code_raw) return false;
      if (_filter.color_name_normalized && row.color_name_normalized !== _filter.color_name_normalized) return false;
      if (_filter.electrical_property && row.electrical_property !== _filter.electrical_property) return false;
      if (_filter.silicone_status_normalized && row.silicone_status_normalized !== _filter.silicone_status_normalized) return false;
      if (_filter.roll_status && row.roll_status !== _filter.roll_status) return false;
      if (_filter.supplier_name && !(row.supplier_name || '').toLowerCase().includes(_filter.supplier_name.toLowerCase())) return false;
      if (_filter.warehouse_location && !(row.warehouse_location || '').toLowerCase().includes(_filter.warehouse_location.toLowerCase())) return false;
      if (_filter.thickness_min !== '' && Number(row.thickness_mm || 0) < Number(_filter.thickness_min)) return false;
      if (_filter.thickness_max !== '' && Number(row.thickness_mm || 0) > Number(_filter.thickness_max)) return false;
      if (_filter.width_min !== '' && Number(row.width_mm || 0) < Number(_filter.width_min)) return false;
      if (_filter.width_max !== '' && Number(row.width_mm || 0) > Number(_filter.width_max)) return false;
      if (_filter.current_min !== '' && Number(row.current_length_m || 0) < Number(_filter.current_min)) return false;
      if (_filter.current_max !== '' && Number(row.current_length_m || 0) > Number(_filter.current_max)) return false;
      if (_filter.only_available && Number(row.current_length_m || 0) <= 0) return false;
      if (_filter.only_low_stock && !row.low_stock) return false;
      return true;
    });
  }

  function _sortRows(rows) {
    const { field, dir } = _sort;
    return [...rows].sort((a, b) => {
      const av = a[field] ?? '';
      const bv = b[field] ?? '';
      let cmp;
      if (typeof av === 'number' || typeof bv === 'number') cmp = Number(av || 0) - Number(bv || 0);
      else cmp = String(av).localeCompare(String(bv), 'ja');
      return dir === 'asc' ? cmp : -cmp;
    });
  }

  function _renderTable() {
    const rows = _sortRows(_getFilteredRows());
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    _page = Math.min(_page, pages);
    const pageRows = rows.slice((_page - 1) * PAGE_SIZE, _page * PAGE_SIZE);

    const titleEl = document.getElementById('pu-table-title');
    const tableEl = document.getElementById('pu-table-wrap');
    if (titleEl) titleEl.textContent = `Danh sách cuộn có thể xuất dùng (${total})`;
    if (!tableEl) return;

    if (!pageRows.length) {
      tableEl.innerHTML = '<div class="pu-empty">Không có cuộn nào khớp bộ lọc.</div>';
    } else {
      tableEl.innerHTML = _renderTableHtml(pageRows);
    }

    _renderPager('pu-pager', _page, pages);

    if (!_selectedRollId && pageRows.length) _selectedRollId = pageRows[0].receipt_roll_id;
  }

  function _renderTableHtml(rows) {
    const body = rows.map(row => `
      <tr class="pu-tr${String(row.receipt_roll_id) === String(_selectedRollId) ? ' pu-row-selected' : ''}" data-action="select-roll" data-id="${_esc(row.receipt_roll_id)}">
        <td class="pu-td pu-code">${row.plastic_code ? _esc(row.plastic_code) : '<span class="pu-muted">Chưa map</span>'}</td>
        <td class="pu-td pu-code">${_esc(row.commercial_grade_code || '')}</td>
        <td class="pu-td pu-center">${_chipFamily(row.plastic_family)}</td>
        <td class="pu-td pu-center">${_num(row.thickness_mm)}</td>
        <td class="pu-td pu-center">${_num(row.width_mm)}</td>
        <td class="pu-td pu-center pu-strong">${_num(row.current_length_m)}</td>
        <td class="pu-td">${_esc(row.lot_no || '')}</td>
        <td class="pu-td">${_esc(row.warehouse_location || '')}</td>
        <td class="pu-td">${_esc(row.supplier_name || '')}</td>
        <td class="pu-td pu-center">${_renderRollStatus(row.roll_status)}</td>
      </tr>
    `).join('');

    return `
<table class="pu-table">
  <thead>
    <tr>
      <th class="pu-th" data-sort="plastic_code">Mã chuẩn ${_sortIcon('plastic_code')}</th>
      <th class="pu-th" data-sort="commercial_grade_code">Mã hãng ${_sortIcon('commercial_grade_code')}</th>
      <th class="pu-th pu-center" data-sort="plastic_family">Nhóm ${_sortIcon('plastic_family')}</th>
      <th class="pu-th pu-center" data-sort="thickness_mm">Dày ${_sortIcon('thickness_mm')}</th>
      <th class="pu-th pu-center" data-sort="width_mm">Khổ ${_sortIcon('width_mm')}</th>
      <th class="pu-th pu-center" data-sort="current_length_m">Mét còn ${_sortIcon('current_length_m')}</th>
      <th class="pu-th" data-sort="lot_no">Lot ${_sortIcon('lot_no')}</th>
      <th class="pu-th">Kho</th>
      <th class="pu-th" data-sort="supplier_name">Nhà cung cấp ${_sortIcon('supplier_name')}</th>
      <th class="pu-th pu-center" data-sort="roll_status">Trạng thái ${_sortIcon('roll_status')}</th>
    </tr>
  </thead>
  <tbody>${body}</tbody>
</table>`;
  }

  function _renderDetail() {
    const el = document.getElementById('pu-detail-box');
    if (!el) return;
    const row = _joinedRows.find(r => String(r.receipt_roll_id) === String(_selectedRollId));
    if (!row) {
      el.innerHTML = '<div class="pu-empty">Chọn một cuộn để xem chi tiết.</div>';
      return;
    }

    el.innerHTML = `
      <div class="pu-detail-section">
        <div class="pu-detail-title">Thông tin cuộn</div>
        <div class="pu-kv"><span>Mã chuẩn</span><b>${row.plastic_code ? _esc(row.plastic_code) : 'Chưa map'}</b></div>
        <div class="pu-kv"><span>Mã hãng</span><b>${_esc(row.commercial_grade_code || '—')}</b></div>
        <div class="pu-kv"><span>Nhóm nhựa</span><b>${_esc(row.plastic_family || '—')}</b></div>
        <div class="pu-kv"><span>Nhóm con</span><b>${_esc(row.plastic_subtype || '—')}</b></div>
        <div class="pu-kv"><span>Kích thước</span><b>${_num(row.thickness_mm)} × ${_num(row.width_mm)} mm</b></div>
        <div class="pu-kv"><span>Mét danh nghĩa</span><b>${_num(row.nominal_length_m)} m</b></div>
        <div class="pu-kv"><span>Mét nhập kho</span><b>${_num(row.received_length_m)} m</b></div>
        <div class="pu-kv"><span>Mét còn lại</span><b>${_num(row.current_length_m)} m</b></div>
        <div class="pu-kv"><span>Mét đã dùng</span><b>${_num(row.used_length_m)} m</b></div>
        <div class="pu-kv"><span>% đã dùng</span><b>${Number(row.usage_percent || 0).toFixed(1)}%</b></div>
        <div class="pu-kv"><span>Lot</span><b>${_esc(row.lot_no || '—')}</b></div>
        <div class="pu-kv"><span>Kho</span><b>${_esc(row.warehouse_location || '—')}</b></div>
        <div class="pu-kv"><span>Nhà cung cấp</span><b>${_esc(row.supplier_name || '—')}</b></div>
        <div class="pu-kv"><span>Ngày nhập</span><b>${_esc(formatDate(row.receipt_date))}</b></div>
        <div class="pu-kv"><span>Phiếu nhập</span><b>${_esc(row.receipt_no || '—')}</b></div>
        <div class="pu-kv"><span>Trạng thái cuộn</span><b>${_plainRollStatus(row.roll_status)}</b></div>
        <div class="pu-kv"><span>Màu</span><b>${_esc([row.color_code_raw, row.color_name_normalized].filter(Boolean).join(' / ') || '—')}</b></div>
        <div class="pu-kv"><span>Tính chất điện</span><b>${_esc(row.electrical_property || '—')}</b></div>
        <div class="pu-kv"><span>Silicone</span><b>${_esc(row.silicone_status_normalized || '—')}</b></div>
        <div class="pu-kv"><span>Phụ gia</span><b>${_esc(row.additive_flags || '—')}</b></div>
      </div>`;
  }

  function _renderLog() {
    const el = document.getElementById('pu-log-wrap');
    if (!el) return;
    const rollId = _selectedRollId;
    if (!rollId) {
      el.innerHTML = '<div class="pu-empty">Chọn một cuộn để xem lịch sử.</div>';
      return;
    }

    const logs = _getUsageLogsForRoll(rollId);
    if (!logs.length) {
      el.innerHTML = '<div class="pu-empty">Chưa có lịch sử xuất dùng cho cuộn này.</div>';
      return;
    }

    el.innerHTML = `
<table class="pu-mini-table">
  <thead>
    <tr>
      <th>Thời gian</th>
      <th>m trừ</th>
      <th>Trước</th>
      <th>Sau</th>
      <th>Ghi chú</th>
    </tr>
  </thead>
  <tbody>
    ${logs.map(log => `
      <tr>
        <td>${_esc(formatDateTime(log.created_at || log.used_at || log.updated_at))}</td>
        <td class="pu-right">${_num(Math.abs(Number(log.change_length_m || 0)))}</td>
        <td class="pu-right">${_num(log.before_length_m)}</td>
        <td class="pu-right">${_num(log.after_length_m)}</td>
        <td>${_esc(log.reason_note || log.note || '')}</td>
      </tr>
    `).join('')}
  </tbody>
</table>`;
  }

  function _getUsageLogsForRoll(rollId) {
    return (_adjustmentLogData || [])
      .filter(log => String(log.receipt_roll_id || '') === String(rollId))
      .filter(log => {
        const change = Number(log.change_length_m || 0);
        const type = String(log.adjustment_type || log.change_type || log.log_type || '').toLowerCase();
        return change < 0 || type.includes('usage') || type.includes('xuất') || type.includes('used');
      })
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }

  async function _onSubmit(e) {
    if (e.target.id !== 'pu-usage-form') return;
    e.preventDefault();
    if (_submitting) return;

    const selected = _joinedRows.find(r => String(r.receipt_roll_id) === String(_selectedRollId));
    if (!selected) {
      _showToast('❌ Chưa chọn cuộn để xuất dùng.', 'error');
      return;
    }

    const usedInput = document.getElementById('pu-used-length');
    const usedAtInput = document.getElementById('pu-used-at');
    const workOrderInput = document.getElementById('pu-work-order-no');
    const machineInput = document.getElementById('pu-machine-code');
    const operatorInput = document.getElementById('pu-operator-name');
    const noteInput = document.getElementById('pu-reason-note');

    const usedLength = Number(usedInput?.value || 0);
    if (!usedLength || usedLength <= 0) {
      _showToast('❌ Số mét dùng phải lớn hơn 0.', 'error');
      return;
    }

    const beforeLength = Number(selected.current_length_m || 0);
    if (usedLength > beforeLength) {
      _showToast(`❌ Không thể trừ ${_num(usedLength)} m vì cuộn chỉ còn ${_num(beforeLength)} m.`, 'error');
      return;
    }

    const afterLength = Math.max(0, Number((beforeLength - usedLength).toFixed(3)));
    const usedAt = usedAtInput?.value ? new Date(usedAtInput.value).toISOString() : new Date().toISOString();
    const reasonNote = [
      noteInput?.value?.trim() || '',
      workOrderInput?.value?.trim() ? `LSX: ${workOrderInput.value.trim()}` : '',
      machineInput?.value?.trim() ? `Máy: ${machineInput.value.trim()}` : '',
      operatorInput?.value?.trim() ? `Người dùng: ${operatorInput.value.trim()}` : '',
    ].filter(Boolean).join(' | ');

    const nextRollStatus = afterLength <= 0
      ? 'empty'
      : (selected.roll_status === 'reserved' ? 'reserved' : (selected.roll_status || 'in_use'));

    _submitting = true;
    const submitBtn = document.getElementById('pu-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const rollUpdateRes = await _supabase
        .from('plastic_receipt_roll')
        .update({
          current_length_m: afterLength,
          roll_status: nextRollStatus,
          updated_at: new Date().toISOString(),
        })
        .eq('receipt_roll_id', selected.receipt_roll_id);

      if (rollUpdateRes.error) throw rollUpdateRes.error;

      try {
        await _insertUsageLogWithFallback({
          selected,
          usedLength,
          beforeLength,
          afterLength,
          usedAt,
          reasonNote,
          workOrderNo: workOrderInput?.value?.trim() || '',
          machineCode: machineInput?.value?.trim() || '',
          operatorName: operatorInput?.value?.trim() || '',
        });
      } catch (logErr) {
        await _supabase
          .from('plastic_receipt_roll')
          .update({
            current_length_m: beforeLength,
            roll_status: selected.roll_status || 'in_stock',
            updated_at: new Date().toISOString(),
          })
          .eq('receipt_roll_id', selected.receipt_roll_id);
        throw logErr;
      }

      if (usedInput) usedInput.value = '';
      if (noteInput) noteInput.value = '';
      if (workOrderInput) workOrderInput.value = '';
      if (machineInput) machineInput.value = '';
      if (operatorInput) operatorInput.value = '';
      if (usedAtInput) usedAtInput.value = _datetimeLocalNow();

      await _loadAllData();
      _joinRows();
      _ensureSelectedRoll();
      _refreshUI();
      _showToast(`✅ Đã xuất dùng ${_num(usedLength)} m. Tồn còn ${_num(afterLength)} m.`, 'success');
    } catch (err) {
      _showToast('❌ ' + (err?.message || String(err)), 'error');
    } finally {
      _submitting = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async function _insertUsageLogWithFallback(payload) {
    const nowIso = new Date().toISOString();
    const base = {
      receipt_roll_id: payload.selected.receipt_roll_id,
      change_length_m: -Math.abs(Number(payload.usedLength || 0)),
      before_length_m: Number(payload.beforeLength || 0),
      after_length_m: Number(payload.afterLength || 0),
      reason_note: payload.reasonNote || 'Xuất dùng cho sản xuất',
      created_at: payload.usedAt || nowIso,
      updated_at: nowIso,
    };

    const variants = [
      {
        ...base,
        receipt_id: payload.selected.receipt_id,
        plastic_id: payload.selected.plastic_id,
        adjustment_type: 'usage',
      },
      {
        ...base,
        receipt_id: payload.selected.receipt_id,
        plastic_id: payload.selected.plastic_id,
        change_type: 'usage',
      },
      {
        ...base,
        log_type: 'usage',
      },
      {
        ...base,
      },
    ];

    let lastError = null;
    for (const row of variants) {
      const res = await _supabase.from('plastic_adjustment_log').insert([row]);
      if (!res.error) return;
      lastError = res.error;
    }
    throw lastError || new Error('Không thể ghi lịch sử xuất dùng vào plastic_adjustment_log.');
  }

  function _renderPager(id, current, total) {
    const el = document.getElementById(id);
    if (!el) return;
    if (total <= 1) {
      el.innerHTML = '';
      return;
    }
    const btns = [];
    for (let i = 1; i <= total; i++) {
      btns.push(`<button class="pu-page-btn${i === current ? ' active' : ''}" data-action="page" data-id="${i}">${i}</button>`);
    }
    el.innerHTML = btns.join('');
  }

  function _enumOptions(enumObj, emptyLabel, selected) {
    let html = `<option value=""${selected === '' ? ' selected' : ''}>${_esc(emptyLabel)}</option>`;
    html += Object.values(enumObj).map(o => `<option value="${_esc(o.value)}"${selected === o.value ? ' selected' : ''}>${_esc(o.label_vi || o.label)}</option>`).join('');
    return html;
  }

  function _clearFilter() {
    _filter = {
      keyword: '', plastic_family: '', color_code_raw: '', color_name_normalized: '', electrical_property: '',
      silicone_status_normalized: '', supplier_name: '', warehouse_location: '', roll_status: '',
      thickness_min: '', thickness_max: '', width_min: '', width_max: '', current_min: '', current_max: '',
      only_available: true, only_low_stock: false,
    };
    _page = 1;
    _selectedRollId = null;
    _render();
    _refreshUI();
  }

  function _onClick(e) {
    const target = e.target.closest('[data-action],[data-sort],button');
    if (!target) return;

    if (target.id === 'pu-reload-btn') {
      _bootstrap();
      return;
    }
    if (target.id === 'pu-clear-filter-btn') {
      _clearFilter();
      return;
    }

    const sort = target.dataset.sort;
    if (sort) {
      if (_sort.field === sort) _sort.dir = _sort.dir === 'asc' ? 'desc' : 'asc';
      else {
        _sort.field = sort;
        _sort.dir = 'asc';
      }
      _renderTable();
      _renderDetail();
      _renderLog();
      return;
    }

    const action = target.dataset.action;
    const id = target.dataset.id;
    if (action === 'page') {
      _page = parseInt(id, 10) || 1;
      _renderTable();
      _renderDetail();
      _renderLog();
      return;
    }
    if (action === 'select-roll') {
      _selectedRollId = id;
      _renderTable();
      _renderDetail();
      _renderLog();
    }
  }

  function _onChange(e) {
    const id = e.target.id;
    const value = e.target.type === 'checkbox' ? !!e.target.checked : e.target.value;

    if (id === 'pu-f-family') _filter.plastic_family = value;
    if (id === 'pu-f-color-code') _filter.color_code_raw = value;
    if (id === 'pu-f-color-name') _filter.color_name_normalized = value;
    if (id === 'pu-f-elec') _filter.electrical_property = value;
    if (id === 'pu-f-si') _filter.silicone_status_normalized = value;
    if (id === 'pu-f-roll-status') _filter.roll_status = value;
    if (id === 'pu-f-only-available') _filter.only_available = value;
    if (id === 'pu-f-only-low-stock') _filter.only_low_stock = value;

    _page = 1;
    _ensureSelectedRoll();
    _renderTable();
    _renderDetail();
    _renderLog();
  }

  function _onInput(e) {
    const id = e.target.id;
    clearTimeout(_inputTimer);
    _inputTimer = setTimeout(() => {
      if (id === 'pu-f-keyword') _filter.keyword = e.target.value;
      if (id === 'pu-f-supplier') _filter.supplier_name = e.target.value;
      if (id === 'pu-f-location') _filter.warehouse_location = e.target.value;
      if (id === 'pu-f-thick-min') _filter.thickness_min = e.target.value;
      if (id === 'pu-f-thick-max') _filter.thickness_max = e.target.value;
      if (id === 'pu-f-width-min') _filter.width_min = e.target.value;
      if (id === 'pu-f-width-max') _filter.width_max = e.target.value;
      if (id === 'pu-f-current-min') _filter.current_min = e.target.value;
      if (id === 'pu-f-current-max') _filter.current_max = e.target.value;
      _page = 1;
      _ensureSelectedRoll();
      _renderTable();
      _renderDetail();
      _renderLog();
    }, 220);
  }

  function _showToast(msg, type = 'info') {
    const el = document.getElementById('pu-toast');
    if (!el) return;
    el.textContent = msg;
    el.className = `pu-toast pu-toast-${type}`;
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.classList.add('pu-hidden'), 3200);
  }

  function _renderRollStatus(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'in_stock') return '<span class="pu-chip pu-chip-ok">Trong kho</span>';
    if (normalized === 'in_use') return '<span class="pu-chip pu-chip-info">Đang dùng</span>';
    if (normalized === 'reserved') return '<span class="pu-chip pu-chip-warn">Đang giữ</span>';
    if (normalized === 'damaged') return '<span class="pu-chip pu-chip-danger">Hỏng</span>';
    if (normalized === 'returned') return '<span class="pu-chip pu-chip-danger">Đã trả</span>';
    if (normalized === 'empty') return '<span class="pu-chip pu-chip-danger">Hết</span>';
    return `<span class="pu-chip">${_esc(status || '—')}</span>`;
  }

  function _plainRollStatus(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'in_stock') return 'Trong kho';
    if (normalized === 'in_use') return 'Đang dùng';
    if (normalized === 'reserved') return 'Đang giữ';
    if (normalized === 'damaged') return 'Hỏng';
    if (normalized === 'returned') return 'Đã trả';
    if (normalized === 'empty') return 'Hết';
    return status || '—';
  }

  function _chipFamily(value) {
    const colors = { PS:'#6366f1', PP:'#22c55e', PET:'#0ea5e9', PVC:'#f97316', PPF:'#a855f7', OTHER:'#94a3b8' };
    const color = colors[value] || '#94a3b8';
    return value ? `<span class="pu-chip pu-chip-color" style="background:${color};color:#fff">${_esc(value)}</span>` : '<span class="pu-muted">—</span>';
  }

  function _sortIcon(field) {
    if (_sort.field !== field) return '<span class="pu-sort pu-sort-none">⇅</span>';
    return _sort.dir === 'asc'
      ? '<span class="pu-sort pu-sort-active">▲</span>'
      : '<span class="pu-sort pu-sort-active">▼</span>';
  }

  function _num(v) {
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    if (Number.isNaN(n)) return _esc(v);
    return n.toFixed(1).replace(/\.0$/, '');
  }

  function _datetimeLocalNow() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}T${hh}:${mm}`;
  }

  function _esc(v) {
    return escapeHtml(v);
  }

  function _injectStyles() {
    if (document.getElementById('plastic-usage-ui-style')) return;
    const style = document.createElement('style');
    style.id = 'plastic-usage-ui-style';
    style.textContent = `
.pu-wrap{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:13px;color:#1f2937;background:#f8fafc;padding:12px}
.pu-header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:10px}
.pu-title{margin:0 0 3px;font-size:18px;font-weight:700;color:#0f172a}.pu-subtitle{font-size:12px;color:#64748b}
.pu-head-actions{display:flex;gap:6px;flex-wrap:wrap}
.pu-btn{border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;transition:.15s}.pu-btn:hover{transform:translateY(-1px)}
.pu-btn-light{background:#fff;border:1px solid #cbd5e1;color:#334155}.pu-btn-light:hover{background:#f8fafc}
.pu-btn-primary{background:#16a34a;color:#fff}.pu-btn-primary:hover{background:#15803d}.pu-btn[disabled]{opacity:.6;cursor:not-allowed;transform:none}
.pu-stats{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}
.pu-stat{background:#fff;border:1px solid #e2e8f0;border-radius:999px;padding:6px 10px;font-size:12px;color:#475569}.pu-stat-ok{color:#15803d}.pu-stat-warn{color:#b45309}.pu-stat-info{color:#0369a1}
.pu-filter-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;margin-bottom:12px;overflow:hidden}
.pu-filter-top{display:flex;flex-wrap:wrap;gap:6px;padding:12px;border-bottom:1px solid #e2e8f0;background:#fcfdff}.pu-filter-bottom{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;background:#f8fafc}
.pu-check{display:flex;align-items:center;gap:6px;font-size:12px;color:#475569}
.pu-input,.pu-select,.pu-textarea{padding:7px 9px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;font-size:12px;color:#0f172a;outline:none}
.pu-input:focus,.pu-select:focus,.pu-textarea:focus{border-color:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,.12)}
.pu-search{min-width:220px}.pu-num{width:96px}.pu-textarea{min-height:72px;resize:vertical}
.pu-main-grid{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(360px,.9fr);gap:12px}
.pu-side-grid{display:grid;gap:12px;align-content:start}
.pu-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.03)}
.pu-card-head{padding:12px 14px;border-bottom:1px solid #e2e8f0;background:#fcfdff}.pu-card-title{font-size:14px;font-weight:700;color:#0f172a}
.pu-table-wrap{overflow:auto;max-height:72vh}.pu-table{width:100%;border-collapse:collapse;font-size:12px}
.pu-th{background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:9px 8px;color:#475569;font-weight:700;white-space:nowrap;position:sticky;top:0;z-index:1}.pu-th[data-sort]{cursor:pointer}.pu-th[data-sort]:hover{background:#f0fdf4;color:#166534}
.pu-td{padding:8px;border-bottom:1px solid #f1f5f9;vertical-align:middle;white-space:nowrap}.pu-tr:hover td{background:#fbfefb}.pu-row-selected td{background:#ecfdf5!important}
.pu-center{text-align:center}.pu-right{text-align:right}.pu-strong{font-weight:700;color:#0f172a}.pu-code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:700;color:#0f172a}
.pu-sort{font-size:10px;margin-left:3px;color:#94a3b8}.pu-sort-active{color:#16a34a}
.pu-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}.pu-chip-ok{background:#dcfce7;color:#166534}.pu-chip-info{background:#dbeafe;color:#1d4ed8}.pu-chip-warn{background:#fef3c7;color:#92400e}.pu-chip-danger{background:#fee2e2;color:#b91c1c}.pu-chip-color{color:#fff}
.pu-muted{color:#94a3b8}.pu-empty{padding:24px 12px;text-align:center;color:#94a3b8}
.pu-pager{display:flex;gap:4px;flex-wrap:wrap;padding:8px 12px;border-top:1px solid #e2e8f0;background:#fff}.pu-page-btn{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:7px;padding:4px 9px;font-size:12px;cursor:pointer}.pu-page-btn.active{background:#16a34a;color:#fff;border-color:#16a34a}
.pu-detail-box,.pu-form,.pu-log-wrap{padding:12px}.pu-detail-section{border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#fcfdff}.pu-detail-title{font-size:13px;font-weight:700;color:#0f172a;margin-bottom:8px}
.pu-kv{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px dashed #e5e7eb;font-size:12px}.pu-kv:last-child{border-bottom:none}.pu-kv span{color:#64748b}.pu-kv b{color:#0f172a;text-align:right}
.pu-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pu-field{display:flex;flex-direction:column;gap:6px;font-size:12px;color:#475569}.pu-field-full{grid-column:1 / -1}.pu-form-actions{margin-top:12px;display:flex;justify-content:flex-end}
.pu-mini-table{width:100%;border-collapse:collapse;font-size:11px}.pu-mini-table th,.pu-mini-table td{padding:7px 8px;border-bottom:1px solid #eef2f7;text-align:left}.pu-mini-table th{color:#64748b;background:#f8fafc}
.pu-toast{position:fixed;right:18px;bottom:18px;padding:12px 16px;border-radius:10px;color:#fff;font-size:13px;font-weight:700;box-shadow:0 10px 25px rgba(0,0,0,.18);z-index:10000}.pu-toast-info{background:#0ea5e9}.pu-toast-success{background:#16a34a}.pu-toast-error{background:#dc2626}.pu-hidden{display:none!important}
@media(max-width:1200px){.pu-main-grid{grid-template-columns:1fr}.pu-table-wrap{max-height:none}}
@media(max-width:760px){.pu-form-grid{grid-template-columns:1fr}.pu-head-actions{width:100%}.pu-btn{flex:1 1 auto}.pu-filter-bottom{justify-content:flex-start}}
`;
    document.head.appendChild(style);
  }

  return { init };
})();


if (typeof window !== 'undefined') {
  window.PlasticUsageUI = PlasticUsageUI;
}

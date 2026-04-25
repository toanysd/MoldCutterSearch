/**
 * plastic-stock-ui.js
 * Module UI: Danh sách cuộn tồn kho nhựa
 * Hiển thị toàn bộ cuộn, lọc đa chiều, cảnh báo sắp hết, xem lịch sử biến động.
 * Phụ thuộc: plastic-manager-schema.js, supabase client
 * Version: v8.1.0
 */

const PlasticStockUI = (() => {
  let _supabase      = null;
  let _containerEl   = null;

  let _masterData    = [];
  let _receiptData   = [];
  let _rollData      = [];
  let _logData       = [];
  let _joinedRows    = [];

  let _selectedRollId  = null;
  let _showHistory     = false;
  let _historyRollId   = null;
  let _toastTimer      = null;
  let _inputTimer      = null;
  let _page            = 1;
  const PAGE_SIZE      = 50;

  // Ngưỡng cảnh báo sắp hết (mét)
  const LOW_STOCK_THRESHOLD = 50;
  const VERY_LOW_THRESHOLD  = 20;

  let _filter = {
    keyword:                  '',
    plastic_family:           '',
    plastic_subtype:          '',
    color_code_raw:           '',
    color_name_normalized:    '',
    electrical_property:      '',
    silicone_status_normalized: '',
    supplier_name:            '',
    warehouse_location:       '',
    roll_status:              '',
    thickness_min:            '',
    thickness_max:            '',
    width_min:                '',
    width_max:                '',
    current_min:              '',
    current_max:              '',
    only_low_stock:           false,
    only_unmapped:            false,
  };

  let _sort = { field: 'current_length_m', dir: 'asc' };

  // ============================================================
  // KHỞI TẠO
  // ============================================================

  function init(supabaseClient, containerId) {
    _supabase    = supabaseClient;
    _containerEl = document.getElementById(containerId);
    if (!_containerEl) {
      console.error(`[PlasticStockUI] Không tìm thấy container #${containerId}`);
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
    const [masterRes, receiptRes, rollRes, logRes] = await Promise.all([
      _supabase.from('plastic_master').select('*').order('plastic_code', { ascending: true }),
      _supabase.from('plastic_receipt').select('*').order('receipt_date', { ascending: false }),
      _supabase.from('plastic_receipt_roll').select('*').order('updated_at', { ascending: false }),
      _supabase.from('plastic_adjustment_log').select('*').order('created_at', { ascending: false }).limit(3000),
    ]);

    if (masterRes.error)  throw masterRes.error;
    if (receiptRes.error) throw receiptRes.error;
    if (rollRes.error)    throw rollRes.error;
    if (logRes.error)     throw logRes.error;

    _masterData  = masterRes.data  || [];
    _receiptData = receiptRes.data || [];
    _rollData    = rollRes.data    || [];
    _logData     = logRes.data     || [];
  }

  // ============================================================
  // JOIN DỮ LIỆU
  // ============================================================

  function _joinRows() {
    _joinedRows = _rollData.map(roll => {
      const receipt = _receiptData.find(r => r.receipt_id === roll.receipt_id) || {};
      const master  = _masterData.find(m => m.plastic_id === roll.plastic_id) || {};
      const current  = Number(roll.current_length_m  || 0);
      const received = Number(roll.received_length_m || 0);
      const used     = received > current ? +(received - current).toFixed(1) : 0;
      const usePct   = received > 0 ? Math.round(((received - current) / received) * 100) : 0;

      return {
        receipt_roll_id:            roll.receipt_roll_id,
        receipt_id:                 roll.receipt_id,
        plastic_id:                 roll.plastic_id || null,
        plastic_code:               master.plastic_code || '',
        plastic_family:             master.plastic_family || roll.plastic_family || '',
        plastic_subtype:            master.plastic_subtype || '',
        thickness_mm:               roll.thickness_mm   ?? master.thickness_mm   ?? null,
        width_mm:                   roll.width_mm       ?? master.width_mm       ?? null,
        nominal_length_m:           roll.nominal_length_m ?? master.standard_length_m ?? null,
        received_length_m:          received,
        current_length_m:           current,
        used_length_m:              used,
        usage_percent:              usePct,
        commercial_grade_code:      roll.commercial_grade_code || '',
        supplier_name:              roll.supplier_name || receipt.supplier_name || '',
        lot_no:                     roll.lot_no || '',
        warehouse_location:         roll.warehouse_location || '',
        roll_status:                roll.roll_status || 'in_stock',
        receipt_no:                 receipt.receipt_no || '',
        receipt_date:               receipt.receipt_date || '',
        color_code_raw:             master.color_code_raw || '',
        color_name_normalized:      master.color_name_normalized || '',
        electrical_property:        master.electrical_property || '',
        silicone_status_normalized: master.silicone_status_normalized || '',
        additive_flags:             master.additive_flags || '',
        notes:                      roll.notes || '',
        updated_at:                 roll.updated_at || roll.created_at || '',
        is_low_stock:               current > 0 && current <= LOW_STOCK_THRESHOLD,
        is_very_low:                current > 0 && current <= VERY_LOW_THRESHOLD,
        is_empty:                   current <= 0 || roll.roll_status === 'empty',
        is_mapped:                  !!roll.plastic_id,
      };
    });
  }

  // ============================================================
  // LỌC & SẮP XẾP
  // ============================================================

  function _getFilteredRows() {
    const kw = (_filter.keyword || '').toLowerCase().trim();
    return _joinedRows
      .filter(r => {
        if (kw) {
          const haystack = [
            r.plastic_code, r.commercial_grade_code, r.lot_no,
            r.warehouse_location, r.supplier_name, r.receipt_no,
            r.plastic_family, r.plastic_subtype, r.color_code_raw,
          ].join(' ').toLowerCase();
          if (!haystack.includes(kw)) return false;
        }
        if (_filter.plastic_family         && r.plastic_family !== _filter.plastic_family)                         return false;
        if (_filter.plastic_subtype        && r.plastic_subtype !== _filter.plastic_subtype)                       return false;
        if (_filter.color_code_raw         && r.color_code_raw !== _filter.color_code_raw)                         return false;
        if (_filter.color_name_normalized  && r.color_name_normalized !== _filter.color_name_normalized)           return false;
        if (_filter.electrical_property    && r.electrical_property !== _filter.electrical_property)               return false;
        if (_filter.silicone_status_normalized && r.silicone_status_normalized !== _filter.silicone_status_normalized) return false;
        if (_filter.roll_status            && r.roll_status !== _filter.roll_status)                               return false;
        if (_filter.supplier_name          && !r.supplier_name.toLowerCase().includes(_filter.supplier_name.toLowerCase())) return false;
        if (_filter.warehouse_location     && !r.warehouse_location.toLowerCase().includes(_filter.warehouse_location.toLowerCase())) return false;
        if (_filter.thickness_min !== '' && Number(_filter.thickness_min) && r.thickness_mm < Number(_filter.thickness_min)) return false;
        if (_filter.thickness_max !== '' && Number(_filter.thickness_max) && r.thickness_mm > Number(_filter.thickness_max)) return false;
        if (_filter.width_min     !== '' && Number(_filter.width_min)     && r.width_mm < Number(_filter.width_min))     return false;
        if (_filter.width_max     !== '' && Number(_filter.width_max)     && r.width_mm > Number(_filter.width_max))     return false;
        if (_filter.current_min   !== '' && Number(_filter.current_min)   && r.current_length_m < Number(_filter.current_min)) return false;
        if (_filter.current_max   !== '' && Number(_filter.current_max)   && r.current_length_m > Number(_filter.current_max)) return false;
        if (_filter.only_low_stock && !r.is_low_stock) return false;
        if (_filter.only_unmapped  && r.is_mapped)     return false;
        return true;
      })
      .sort((a, b) => {
        const f = _sort.field;
        const d = _sort.dir === 'asc' ? 1 : -1;
        const av = a[f] ?? '';
        const bv = b[f] ?? '';
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * d;
        return String(av).localeCompare(String(bv)) * d;
      });
  }

  // ============================================================
  // RENDER SHELL
  // ============================================================

  function _render() {
    _containerEl.innerHTML = `
<div class="ps-wrap">
  <div class="ps-header">
    <div>
      <h2 class="ps-title">📦 Tồn kho cuộn nhựa</h2>
      <div class="ps-subtitle">Xem toàn bộ cuộn tồn, lọc đa chiều, cảnh báo sắp hết và xem lịch sử biến động.</div>
    </div>
    <div class="ps-head-actions">
      <button class="ps-btn ps-btn-light" id="ps-reload-btn">↻ Tải lại</button>
    </div>
  </div>

  <div class="ps-stats" id="ps-stats-bar"></div>

  <div class="ps-filter-card" id="ps-filter-card">
    <div class="ps-filter-top">
      <input class="ps-input ps-search" id="ps-f-keyword" type="text"
        placeholder="Tìm mã chuẩn, mã hãng, lot, kho, nhà cung cấp…"
        value="${_esc(_filter.keyword)}">
      <select class="ps-select" id="ps-f-family">
        ${_enumOpts(PLASTIC_FAMILY, 'Tất cả họ nhựa', _filter.plastic_family)}
      </select>
      <select class="ps-select" id="ps-f-color-code">
        ${_enumOpts(COLOR_CODE, 'Tất cả mã màu', _filter.color_code_raw)}
      </select>
      <select class="ps-select" id="ps-f-color-name">
        ${_enumOpts(COLOR_NAME_NORMALIZED, 'Tất cả màu chuẩn', _filter.color_name_normalized)}
      </select>
      <select class="ps-select" id="ps-f-elec">
        ${_enumOpts(ELECTRICAL_PROPERTY, 'Tất cả tính chất điện', _filter.electrical_property)}
      </select>
      <select class="ps-select" id="ps-f-si">
        ${_enumOpts(SILICONE_STATUS, 'Tất cả silicone', _filter.silicone_status_normalized)}
      </select>
      <select class="ps-select" id="ps-f-roll-status">
        ${_enumOpts(ROLL_STATUS, 'Tất cả trạng thái', _filter.roll_status)}
      </select>
      <input class="ps-input" id="ps-f-supplier" type="text"
        placeholder="Nhà cung cấp" value="${_esc(_filter.supplier_name)}">
      <input class="ps-input" id="ps-f-location" type="text"
        placeholder="Vị trí kho" value="${_esc(_filter.warehouse_location)}">
    </div>
    <div class="ps-filter-row2">
      <div class="ps-filter-group">
        <label class="ps-label">Dày (mm)</label>
        <input class="ps-input ps-num" id="ps-f-thick-min" type="number" step="0.001" placeholder="Từ" value="${_esc(_filter.thickness_min)}">
        <span class="ps-range-sep">–</span>
        <input class="ps-input ps-num" id="ps-f-thick-max" type="number" step="0.001" placeholder="Đến" value="${_esc(_filter.thickness_max)}">
      </div>
      <div class="ps-filter-group">
        <label class="ps-label">Khổ (mm)</label>
        <input class="ps-input ps-num" id="ps-f-width-min" type="number" step="1" placeholder="Từ" value="${_esc(_filter.width_min)}">
        <span class="ps-range-sep">–</span>
        <input class="ps-input ps-num" id="ps-f-width-max" type="number" step="1" placeholder="Đến" value="${_esc(_filter.width_max)}">
      </div>
      <div class="ps-filter-group">
        <label class="ps-label">Mét còn lại</label>
        <input class="ps-input ps-num" id="ps-f-cur-min" type="number" step="1" placeholder="Từ" value="${_esc(_filter.current_min)}">
        <span class="ps-range-sep">–</span>
        <input class="ps-input ps-num" id="ps-f-cur-max" type="number" step="1" placeholder="Đến" value="${_esc(_filter.current_max)}">
      </div>
      <label class="ps-check-wrap">
        <input id="ps-f-low-stock" type="checkbox" ${_filter.only_low_stock ? 'checked' : ''}>
        <span>Chỉ hiện sắp hết (&le;${LOW_STOCK_THRESHOLD}m)</span>
      </label>
      <label class="ps-check-wrap">
        <input id="ps-f-unmapped" type="checkbox" ${_filter.only_unmapped ? 'checked' : ''}>
        <span>Chỉ hiện cuộn chưa map</span>
      </label>
      <button class="ps-btn ps-btn-ghost ps-clear-btn" id="ps-clear-filter-btn">✕ Xóa bộ lọc</button>
    </div>
  </div>

  <div class="ps-loading" id="ps-loading" style="display:none">Đang tải dữ liệu…</div>

  <div class="ps-table-wrap" id="ps-table-wrap"></div>
  <div class="ps-pager"     id="ps-pager"></div>

  <!-- Panel lịch sử biến động -->
  <div class="ps-overlay ps-hidden" id="ps-history-overlay">
    <div class="ps-modal ps-history-modal" id="ps-history-modal">
      <div class="ps-modal-header">
        <div class="ps-modal-title" id="ps-history-title">Lịch sử biến động</div>
        <button class="ps-modal-close" id="ps-history-close">✕</button>
      </div>
      <div class="ps-modal-body" id="ps-history-body"></div>
    </div>
  </div>

  <div class="ps-toast" id="ps-toast" style="display:none"></div>
</div>`;

    _bindEvents();
  }

  // ============================================================
  // BIND EVENTS
  // ============================================================

  function _bindEvents() {
    // Reload
    _el('ps-reload-btn')?.addEventListener('click', () => _bootstrap());

    // Tìm kiếm với debounce
    ['ps-f-keyword', 'ps-f-supplier', 'ps-f-location'].forEach(id => {
      _el(id)?.addEventListener('input', e => {
        clearTimeout(_inputTimer);
        _inputTimer = setTimeout(() => {
          const fieldMap = {
            'ps-f-keyword':  'keyword',
            'ps-f-supplier': 'supplier_name',
            'ps-f-location': 'warehouse_location',
          };
          _filter[fieldMap[id]] = e.target.value;
          _page = 1;
          _refreshTable();
        }, 280);
      });
    });

    // Số thực (range filter) với debounce
    [
      ['ps-f-thick-min', 'thickness_min'],
      ['ps-f-thick-max', 'thickness_max'],
      ['ps-f-width-min', 'width_min'],
      ['ps-f-width-max', 'width_max'],
      ['ps-f-cur-min',   'current_min'],
      ['ps-f-cur-max',   'current_max'],
    ].forEach(([id, key]) => {
      _el(id)?.addEventListener('input', e => {
        clearTimeout(_inputTimer);
        _inputTimer = setTimeout(() => {
          _filter[key] = e.target.value;
          _page = 1;
          _refreshTable();
        }, 350);
      });
    });

    // Select filters
    [
      ['ps-f-family',     'plastic_family'],
      ['ps-f-color-code', 'color_code_raw'],
      ['ps-f-color-name', 'color_name_normalized'],
      ['ps-f-elec',       'electrical_property'],
      ['ps-f-si',         'silicone_status_normalized'],
      ['ps-f-roll-status','roll_status'],
    ].forEach(([id, key]) => {
      _el(id)?.addEventListener('change', e => {
        _filter[key] = e.target.value;
        _page = 1;
        _refreshTable();
      });
    });

    // Checkbox filters
    _el('ps-f-low-stock')?.addEventListener('change', e => {
      _filter.only_low_stock = e.target.checked;
      _page = 1;
      _refreshTable();
    });
    _el('ps-f-unmapped')?.addEventListener('change', e => {
      _filter.only_unmapped = e.target.checked;
      _page = 1;
      _refreshTable();
    });

    // Xóa bộ lọc
    _el('ps-clear-filter-btn')?.addEventListener('click', () => {
      _filter = {
        keyword: '', plastic_family: '', plastic_subtype: '',
        color_code_raw: '', color_name_normalized: '', electrical_property: '',
        silicone_status_normalized: '', supplier_name: '', warehouse_location: '',
        roll_status: '', thickness_min: '', thickness_max: '',
        width_min: '', width_max: '', current_min: '', current_max: '',
        only_low_stock: false, only_unmapped: false,
      };
      _page = 1;
      _render();
      _joinRows();
      _refreshUI();
    });

    // Đóng modal lịch sử
    _el('ps-history-close')?.addEventListener('click', _closeHistory);
    _el('ps-history-overlay')?.addEventListener('click', e => {
      if (e.target === _el('ps-history-overlay')) _closeHistory();
    });
  }

  // ============================================================
  // REFRESH UI
  // ============================================================

  function _refreshUI() {
    _refreshStats();
    _refreshTable();
  }

  function _refreshStats() {
    const bar = _el('ps-stats-bar');
    if (!bar) return;

    const all         = _joinedRows;
    const inStock     = all.filter(r => r.roll_status === 'in_stock');
    const inUse       = all.filter(r => r.roll_status === 'in_use');
    const lowStock    = all.filter(r => r.is_low_stock && !r.is_empty);
    const veryLow     = all.filter(r => r.is_very_low && !r.is_empty);
    const empty       = all.filter(r => r.is_empty);
    const unmapped    = all.filter(r => !r.is_mapped);
    const totalMeter  = inStock.concat(inUse).reduce((s, r) => s + r.current_length_m, 0);

    bar.innerHTML = `
<div class="ps-stat-card">
  <div class="ps-stat-value">${inStock.length}</div>
  <div class="ps-stat-label">Cuộn trong kho</div>
</div>
<div class="ps-stat-card">
  <div class="ps-stat-value">${inUse.length}</div>
  <div class="ps-stat-label">Đang sử dụng</div>
</div>
<div class="ps-stat-card ${lowStock.length > 0 ? 'ps-stat-warn' : ''}">
  <div class="ps-stat-value">${lowStock.length}</div>
  <div class="ps-stat-label">Sắp hết (&le;${LOW_STOCK_THRESHOLD}m)</div>
</div>
<div class="ps-stat-card ${veryLow.length > 0 ? 'ps-stat-danger' : ''}">
  <div class="ps-stat-value">${veryLow.length}</div>
  <div class="ps-stat-label">Rất ít (&le;${VERY_LOW_THRESHOLD}m)</div>
</div>
<div class="ps-stat-card ${unmapped.length > 0 ? 'ps-stat-info' : ''}">
  <div class="ps-stat-value">${unmapped.length}</div>
  <div class="ps-stat-label">Chưa map mã</div>
</div>
<div class="ps-stat-card ${empty.length > 0 ? 'ps-stat-muted' : ''}">
  <div class="ps-stat-value">${empty.length}</div>
  <div class="ps-stat-label">Đã hết / trống</div>
</div>
<div class="ps-stat-card ps-stat-total">
  <div class="ps-stat-value">${totalMeter.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}m</div>
  <div class="ps-stat-label">Tổng mét tồn kho</div>
</div>`;
  }

  function _refreshTable() {
    const rows = _getFilteredRows();
    const total = rows.length;
    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    if (_page > totalPages) _page = totalPages;

    const pageRows = rows.slice((_page - 1) * PAGE_SIZE, _page * PAGE_SIZE);

    const wrap = _el('ps-table-wrap');
    if (!wrap) return;

    if (!pageRows.length) {
      wrap.innerHTML = `<div class="ps-empty">Không tìm thấy cuộn nào phù hợp.</div>`;
      _el('ps-pager').innerHTML = '';
      return;
    }

    const headerCells = [
      { field: 'plastic_code',      label: 'Mã chuẩn'    },
      { field: 'commercial_grade_code', label: 'Mã hãng' },
      { field: 'plastic_family',    label: 'Họ nhựa'     },
      { field: 'thickness_mm',      label: 'Dày (mm)'    },
      { field: 'width_mm',          label: 'Khổ (mm)'    },
      { field: 'current_length_m',  label: 'Còn lại (m)' },
      { field: 'received_length_m', label: 'Nhập (m)'    },
      { field: 'usage_percent',     label: 'Đã dùng %'   },
      { field: 'lot_no',            label: 'Lot'         },
      { field: 'warehouse_location',label: 'Vị trí kho'  },
      { field: 'roll_status',       label: 'Trạng thái'  },
      { field: 'supplier_name',     label: 'Nhà CC'      },
      { field: 'updated_at',        label: 'Cập nhật'    },
      { field: '_actions',          label: ''            },
    ];

    const thead = headerCells.map(h => {
      if (h.field === '_actions') return `<th class="ps-th ps-th-action"></th>`;
      const isActive = _sort.field === h.field;
      const dir      = isActive ? _sort.dir : '';
      const arrow    = dir === 'asc' ? ' ↑' : dir === 'desc' ? ' ↓' : '';
      return `<th class="ps-th ps-th-sortable ${isActive ? 'ps-th-active' : ''}"
                  onclick="PlasticStockUI._sortBy('${h.field}')">${_esc(h.label)}${arrow}</th>`;
    }).join('');

    const tbody = pageRows.map(r => {
      const rowClass = r.is_very_low && !r.is_empty
        ? 'ps-row ps-row-danger'
        : r.is_low_stock && !r.is_empty
          ? 'ps-row ps-row-warn'
          : r.is_empty
            ? 'ps-row ps-row-muted'
            : `ps-row ${_selectedRollId === r.receipt_roll_id ? 'ps-row-selected' : ''}`;

      const statusBadge = _rollStatusBadge(r.roll_status);
      const mappedBadge = r.is_mapped
        ? `<span class="ps-badge ps-badge-mapped">✓ ${_esc(r.plastic_code)}</span>`
        : `<span class="ps-badge ps-badge-unmapped">未マップ</span>`;
      const pctBar = _usageBar(r.usage_percent, r.is_empty);
      const lowBadge = r.is_very_low && !r.is_empty
        ? `<span class="ps-badge ps-badge-verylowstock">⚠ 残りわずか</span>`
        : r.is_low_stock && !r.is_empty
          ? `<span class="ps-badge ps-badge-lowstock">△ 在庫少</span>`
          : '';

      return `<tr class="${rowClass}" onclick="PlasticStockUI._selectRow('${r.receipt_roll_id}')">
  <td class="ps-td ps-td-code">${mappedBadge}</td>
  <td class="ps-td ps-td-grade">${_esc(r.commercial_grade_code)}</td>
  <td class="ps-td">${_familyBadge(r.plastic_family)}</td>
  <td class="ps-td ps-td-num">${r.thickness_mm != null ? Number(r.thickness_mm).toFixed(3) : '—'}</td>
  <td class="ps-td ps-td-num">${r.width_mm != null ? Number(r.width_mm).toFixed(0) : '—'}</td>
  <td class="ps-td ps-td-num ps-td-current">
    <span class="ps-current-m">${r.current_length_m.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}</span>m
    ${lowBadge}
  </td>
  <td class="ps-td ps-td-num">${r.received_length_m.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}m</td>
  <td class="ps-td ps-td-pct">${pctBar}</td>
  <td class="ps-td">${_esc(r.lot_no)}</td>
  <td class="ps-td">${_esc(r.warehouse_location)}</td>
  <td class="ps-td">${statusBadge}</td>
  <td class="ps-td ps-td-supplier">${_esc(r.supplier_name)}</td>
  <td class="ps-td ps-td-date">${_fmtDate(r.updated_at)}</td>
  <td class="ps-td ps-td-action" style="white-space: nowrap;">
    <button class="ps-btn-icon" title="Xem lịch sử biến động"
      onclick="event.stopPropagation(); PlasticStockUI._openHistory('${r.receipt_roll_id}')">📋</button>
    <button class="ps-btn-icon" style="color: #0369A1; font-size: 1.1em; margin-left: 4px;" title="Tìm Khuôn & Dao cắt tương thích tải lên cuộn này"
      onclick="event.stopPropagation(); if(window.PlasticMoldCutterSearch) window.PlasticMoldCutterSearch.openModal('${r.plastic_id}', '${r.width_mm}', '${r.thickness_mm}')"><i class="fas fa-search"></i></button>
  </td>
</tr>`;
    }).join('');

    wrap.innerHTML = `
<table class="ps-table">
  <thead><tr>${thead}</tr></thead>
  <tbody>${tbody}</tbody>
</table>`;

    // Pager
    _renderPager(total, totalPages);
  }

  function _renderPager(total, totalPages) {
    const p = _el('ps-pager');
    if (!p) return;
    if (totalPages <= 1) {
      p.innerHTML = `<span class="ps-pager-info">Hiển thị ${total} cuộn</span>`;
      return;
    }
    const from = (_page - 1) * PAGE_SIZE + 1;
    const to   = Math.min(_page * PAGE_SIZE, total);
    p.innerHTML = `
<button class="ps-btn ps-btn-ghost" onclick="PlasticStockUI._goPage(1)"       ${_page===1 ? 'disabled' : ''}>«</button>
<button class="ps-btn ps-btn-ghost" onclick="PlasticStockUI._goPage(${_page-1})" ${_page===1 ? 'disabled' : ''}>‹</button>
<span class="ps-pager-info">${from}–${to} / ${total} cuộn</span>
<button class="ps-btn ps-btn-ghost" onclick="PlasticStockUI._goPage(${_page+1})" ${_page===totalPages ? 'disabled' : ''}>›</button>
<button class="ps-btn ps-btn-ghost" onclick="PlasticStockUI._goPage(${totalPages})" ${_page===totalPages ? 'disabled' : ''}>»</button>`;
  }

  // ============================================================
  // LỊCH SỬ BIẾN ĐỘNG
  // ============================================================

  function _openHistory(rollId) {
    _historyRollId = rollId;
    const roll = _joinedRows.find(r => r.receipt_roll_id === rollId);
    const titleEl = _el('ps-history-title');
    if (titleEl) {
      titleEl.textContent = roll
        ? `Lịch sử: ${roll.commercial_grade_code || roll.plastic_code || rollId}`
        : `Lịch sử biến động`;
    }

    const logs = _logData.filter(l => l.receipt_roll_id === rollId);
    const body = _el('ps-history-body');
    if (!body) return;

    if (!logs.length) {
      body.innerHTML = `<div class="ps-empty">Chưa có biến động nào cho cuộn này.</div>`;
    } else {
      const CHANGE_LABELS = {
        usage:                '✂️ Xuất dùng SX',
        inventory_adjustment: '🔧 Điều chỉnh KK',
        damage:               '❌ Hỏng / phế liệu',
        return:               '↩️ Trả hàng',
        manual_fix:           '✏️ Sửa tay',
        receive_correction:   '📥 Sửa lại nhập',
        reserve:              '🔒 Đặt giữ KH',
        unreserve:            '🔓 Hủy đặt giữ',
      };
      const rows = logs.map(l => {
        const sign      = l.change_length_m > 0 ? '+' : '';
        const changeClass = l.change_length_m < 0 ? 'ps-hist-neg' : 'ps-hist-pos';
        return `<tr class="ps-hist-row">
  <td class="ps-td">${_fmtDateTime(l.created_at)}</td>
  <td class="ps-td">${CHANGE_LABELS[l.change_type] || _esc(l.change_type)}</td>
  <td class="ps-td ps-td-num ${changeClass}">${sign}${Number(l.change_length_m).toFixed(1)}m</td>
  <td class="ps-td ps-td-num">${l.before_length_m != null ? Number(l.before_length_m).toFixed(1) + 'm' : '—'}</td>
  <td class="ps-td ps-td-num">${l.after_length_m  != null ? Number(l.after_length_m ).toFixed(1) + 'm' : '—'}</td>
  <td class="ps-td">${_esc(l.reason_note || l.created_by || '')}</td>
</tr>`;
      }).join('');
      body.innerHTML = `
<div class="ps-hist-roll-info">${roll ? _rollInfoLine(roll) : ''}</div>
<table class="ps-table ps-hist-table">
  <thead>
    <tr>
      <th class="ps-th">Thời gian</th>
      <th class="ps-th">Loại biến động</th>
      <th class="ps-th ps-th-num">Thay đổi</th>
      <th class="ps-th ps-th-num">Trước</th>
      <th class="ps-th ps-th-num">Sau</th>
      <th class="ps-th">Ghi chú / Người thực hiện</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
    }

    const overlay = _el('ps-history-overlay');
    if (overlay) { overlay.classList.remove('ps-hidden'); overlay.classList.add('ps-show'); }
  }

  function _closeHistory() {
    const overlay = _el('ps-history-overlay');
    if (overlay) { overlay.classList.add('ps-hidden'); overlay.classList.remove('ps-show'); }
    _historyRollId = null;
  }

  function _rollInfoLine(r) {
    return `<span class="ps-info-chip">${_esc(r.plastic_family)}</span>
<span class="ps-info-chip">${r.thickness_mm != null ? Number(r.thickness_mm).toFixed(3) : '—'}mm × ${r.width_mm != null ? Number(r.width_mm).toFixed(0) : '—'}mm</span>
<span class="ps-info-chip">Lot: ${_esc(r.lot_no || '—')}</span>
<span class="ps-info-chip">Kho: ${_esc(r.warehouse_location || '—')}</span>
<span class="ps-info-chip ps-info-chip-current">Còn lại: ${r.current_length_m.toFixed(1)}m</span>`;
  }

  // ============================================================
  // LOADING
  // ============================================================

  function _setLoading(on) {
    const el = _el('ps-loading');
    if (el) el.style.display = on ? 'flex' : 'none';
    const wrap = _el('ps-table-wrap');
    if (wrap) wrap.style.opacity = on ? '0.4' : '1';
  }

  // ============================================================
  // HELPERS UI
  // ============================================================

  function _sortBy(field) {
    if (_sort.field === field) {
      _sort.dir = _sort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      _sort.field = field;
      _sort.dir   = field === 'current_length_m' ? 'asc' : 'desc';
    }
    _page = 1;
    _refreshTable();
  }

  function _selectRow(rollId) {
    _selectedRollId = rollId;
    _refreshTable();
  }

  function _goPage(p) {
    const rows       = _getFilteredRows();
    const totalPages = Math.ceil(rows.length / PAGE_SIZE) || 1;
    _page = Math.max(1, Math.min(p, totalPages));
    _refreshTable();
  }

  function _rollStatusBadge(status) {
    const map = {
      in_stock: ['ps-badge-instockroll', 'Trong kho'],
      in_use:   ['ps-badge-inuseroll',   'Đang dùng'],
      empty:    ['ps-badge-emptyroll',   'Đã hết'],
      returned: ['ps-badge-returned',    'Đã trả'],
      damaged:  ['ps-badge-damaged',     'Hỏng'],
      reserved: ['ps-badge-reserved',    'Đã đặt'],
    };
    const [cls, label] = map[status] || ['ps-badge-default', status];
    return `<span class="ps-badge ${cls}">${label}</span>`;
  }

  function _familyBadge(family) {
    const colorMap = { PS: '#e3f0ff', PP: '#e8f8e8', PET: '#fff3e0', PVC: '#fce4ec', PPF: '#f3e5f5', OTHER: '#f5f5f5' };
    const bg = colorMap[family] || '#f5f5f5';
    return `<span class="ps-badge" style="background:${bg}">${_esc(family)}</span>`;
  }

  function _usageBar(pct, isEmpty) {
    if (isEmpty) return `<span class="ps-pct-empty">—</span>`;
    const clamped = Math.min(100, Math.max(0, pct));
    const color   = clamped >= 90 ? '#d32f2f' : clamped >= 70 ? '#f57c00' : '#388e3c';
    return `<div class="ps-pct-wrap">
  <div class="ps-pct-bar" style="width:${clamped}%; background:${color}"></div>
  <span class="ps-pct-label">${clamped}%</span>
</div>`;
  }

  function _enumOpts(enumObj, allLabel, current) {
    const opts = Object.values(enumObj)
      .map(o => `<option value="${_esc(o.value)}" ${current === o.value ? 'selected' : ''}>${_esc(o.label || o.label_vi || o.value)}</option>`)
      .join('');
    return `<option value="" ${!current ? 'selected' : ''}>${allLabel}</option>${opts}`;
  }

  function _fmtDate(val)     { if (!val) return '—'; try { return new Date(val).toLocaleDateString('ja-JP'); } catch { return val; } }
  function _fmtDateTime(val) { if (!val) return '—'; try { return new Date(val).toLocaleString('ja-JP'); } catch { return val; } }

  function _esc(v) {
    if (v == null) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _el(id) { return document.getElementById(id); }

  function _showToast(msg, type = 'info') {
    const el = _el('ps-toast');
    if (!el) return;
    el.textContent = msg;
    el.className   = `ps-toast ps-toast-${type} ps-toast-show`;
    el.style.display = 'block';
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => {
      el.classList.remove('ps-toast-show');
      setTimeout(() => { el.style.display = 'none'; }, 400);
    }, 3200);
  }

  // ============================================================
  // CSS
  // ============================================================

  function _injectStyles() {
    if (document.getElementById('ps-style')) return;
    const s = document.createElement('style');
    s.id = 'ps-style';
    s.textContent = `
/* ===== Plastic Stock UI ===== */
.ps-wrap { font-family: 'Segoe UI', 'Noto Sans JP', sans-serif; padding: 16px; color: #1a1a2e; max-width: 100%; }
.ps-header { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.ps-title { font-size: 1.3rem; font-weight: 700; margin: 0 0 4px; }
.ps-subtitle { font-size: 0.82rem; color: #666; }
.ps-head-actions { display: flex; gap: 8px; flex-wrap: wrap; }

/* Stats */
.ps-stats { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
.ps-stat-card { background: #fff; border: 1px solid #e4e8f0; border-radius: 10px; padding: 10px 16px; min-width: 110px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
.ps-stat-value { font-size: 1.4rem; font-weight: 700; color: #1a1a2e; }
.ps-stat-label { font-size: 0.72rem; color: #777; margin-top: 2px; }
.ps-stat-warn  { border-color: #ffb300; background: #fffde7; }
.ps-stat-warn .ps-stat-value  { color: #e65100; }
.ps-stat-danger{ border-color: #d32f2f; background: #fff3f3; }
.ps-stat-danger .ps-stat-value{ color: #d32f2f; }
.ps-stat-info  { border-color: #1976d2; background: #e3f2fd; }
.ps-stat-info .ps-stat-value  { color: #1565c0; }
.ps-stat-muted .ps-stat-value { color: #9e9e9e; }
.ps-stat-total { border-color: #388e3c; background: #f1f8f1; }
.ps-stat-total .ps-stat-value { color: #2e7d32; }

/* Filter */
.ps-filter-card { background: #f7f9fc; border: 1px solid #dde3ed; border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; }
.ps-filter-top  { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; }
.ps-filter-row2 { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.ps-filter-group{ display: flex; align-items: center; gap: 4px; }
.ps-label { font-size: 0.78rem; color: #555; white-space: nowrap; }
.ps-range-sep { color: #999; font-size: 0.85rem; }
.ps-input  { border: 1px solid #c8d0dc; border-radius: 6px; padding: 5px 10px; font-size: 0.82rem; outline: none; background: #fff; }
.ps-input:focus { border-color: #1976d2; box-shadow: 0 0 0 2px rgba(25,118,210,.12); }
.ps-search { min-width: 220px; }
.ps-num    { width: 72px; }
.ps-select { border: 1px solid #c8d0dc; border-radius: 6px; padding: 5px 8px; font-size: 0.82rem; background: #fff; outline: none; }
.ps-select:focus { border-color: #1976d2; }
.ps-check-wrap  { display: flex; align-items: center; gap: 5px; font-size: 0.82rem; cursor: pointer; white-space: nowrap; }
.ps-clear-btn   { font-size: 0.78rem; margin-left: auto; }

/* Buttons */
.ps-btn { padding: 6px 14px; border-radius: 7px; font-size: 0.82rem; cursor: pointer; border: none; transition: background 0.15s; }
.ps-btn-primary { background: #1976d2; color: #fff; }
.ps-btn-primary:hover { background: #1565c0; }
.ps-btn-light   { background: #e3eaf5; color: #1a1a2e; }
.ps-btn-light:hover { background: #ccd8ee; }
.ps-btn-ghost   { background: transparent; color: #555; border: 1px solid #c8d0dc; }
.ps-btn-ghost:hover { background: #f0f4f8; }
.ps-btn-icon    { background: none; border: none; cursor: pointer; padding: 3px 6px; font-size: 0.95rem; border-radius: 5px; transition: background 0.12s; }
.ps-btn-icon:hover { background: #e3eaf5; }

/* Table */
.ps-table-wrap { overflow-x: auto; border-radius: 10px; border: 1px solid #dde3ed; background: #fff; }
.ps-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.ps-th { padding: 8px 10px; background: #f0f4fa; font-weight: 600; color: #444; border-bottom: 2px solid #dde3ed; white-space: nowrap; text-align: left; }
.ps-th-sortable { cursor: pointer; user-select: none; }
.ps-th-sortable:hover { background: #e3ecf7; }
.ps-th-active   { color: #1976d2; }
.ps-th-num, .ps-td-num { text-align: right; }
.ps-th-action, .ps-td-action { width: 36px; text-align: center; }
.ps-td { padding: 7px 10px; border-bottom: 1px solid #edf0f5; vertical-align: middle; }
.ps-row { cursor: pointer; transition: background 0.1s; }
.ps-row:hover       { background: #f5f8ff; }
.ps-row-selected    { background: #e8f0fe !important; }
.ps-row-warn        { background: #fffde7; }
.ps-row-warn:hover  { background: #fff8d1; }
.ps-row-danger      { background: #fff3f3; }
.ps-row-danger:hover{ background: #ffe8e8; }
.ps-row-muted       { opacity: 0.55; }
.ps-td-current      { font-weight: 600; }
.ps-current-m       { font-size: 1rem; }
.ps-td-date { font-size: 0.76rem; color: #888; white-space: nowrap; }
.ps-td-supplier { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ps-td-grade    { max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ps-td-code     { min-width: 130px; }

/* Badges */
.ps-badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 0.72rem; font-weight: 600; background: #eee; white-space: nowrap; }
.ps-badge-mapped     { background: #e8f5e9; color: #2e7d32; }
.ps-badge-unmapped   { background: #fce4ec; color: #880e4f; }
.ps-badge-instockroll{ background: #e3f2fd; color: #1565c0; }
.ps-badge-inuseroll  { background: #e8f5e9; color: #2e7d32; }
.ps-badge-emptyroll  { background: #f5f5f5; color: #9e9e9e; }
.ps-badge-returned   { background: #f3e5f5; color: #6a1b9a; }
.ps-badge-damaged    { background: #ffebee; color: #b71c1c; }
.ps-badge-reserved   { background: #fff3e0; color: #e65100; }
.ps-badge-lowstock   { background: #fff9c4; color: #f57f17; }
.ps-badge-verylowstock { background: #ffccbc; color: #bf360c; }
.ps-badge-default    { background: #eee; color: #555; }

/* Usage bar */
.ps-pct-wrap  { display: flex; align-items: center; gap: 5px; min-width: 80px; }
.ps-pct-bar   { height: 8px; border-radius: 4px; min-width: 2px; transition: width 0.3s; }
.ps-pct-label { font-size: 0.76rem; color: #555; white-space: nowrap; }
.ps-pct-empty { color: #bbb; font-size: 0.8rem; }

/* Pager */
.ps-pager { display: flex; align-items: center; gap: 6px; padding: 8px 4px; font-size: 0.82rem; flex-wrap: wrap; }
.ps-pager-info { color: #666; margin: 0 6px; }

/* Empty */
.ps-empty   { text-align: center; color: #999; padding: 40px 16px; font-size: 0.9rem; }

/* Loading */
.ps-loading { display: flex; align-items: center; justify-content: center; padding: 24px; color: #888; font-size: 0.9rem; }

/* Modal lịch sử */
.ps-overlay  { position: fixed; inset: 0; background: rgba(0,0,0,0.42); z-index: 3000; display: flex; align-items: center; justify-content: center; }
.ps-hidden   { display: none !important; }
.ps-show     { display: flex !important; }
.ps-history-modal { background: #fff; border-radius: 14px; width: 95%; max-width: 880px; max-height: 88vh; display: flex; flex-direction: column; box-shadow: 0 8px 40px rgba(0,0,0,0.22); }
.ps-modal-header  { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid #eee; }
.ps-modal-title   { font-size: 1.05rem; font-weight: 700; }
.ps-modal-close   { background: none; border: none; font-size: 1.1rem; cursor: pointer; color: #888; padding: 4px 8px; border-radius: 6px; }
.ps-modal-close:hover { background: #f0f0f0; }
.ps-modal-body    { overflow-y: auto; padding: 14px 18px; flex: 1; }
.ps-hist-roll-info{ display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.ps-info-chip { background: #f0f4fa; border: 1px solid #dde3ed; border-radius: 20px; padding: 2px 10px; font-size: 0.78rem; }
.ps-info-chip-current { background: #e8f5e9; border-color: #a5d6a7; font-weight: 700; color: #2e7d32; }
.ps-hist-table .ps-th { background: #f7f9fc; font-size: 0.78rem; }
.ps-hist-table .ps-td { font-size: 0.8rem; }
.ps-hist-neg { color: #d32f2f; font-weight: 600; }
.ps-hist-pos { color: #388e3c; font-weight: 600; }

/* Toast */
.ps-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); padding: 10px 22px; border-radius: 8px; font-size: 0.88rem; z-index: 9999; opacity: 0; transition: opacity 0.3s; box-shadow: 0 4px 16px rgba(0,0,0,0.18); }
.ps-toast-show    { opacity: 1; }
.ps-toast-info    { background: #1976d2; color: #fff; }
.ps-toast-success { background: #388e3c; color: #fff; }
.ps-toast-error   { background: #d32f2f; color: #fff; }
.ps-toast-warn    { background: #f57c00; color: #fff; }

@media (max-width: 680px) {
  .ps-table { font-size: 0.75rem; }
  .ps-filter-top { flex-direction: column; }
  .ps-stat-card { min-width: 80px; padding: 8px 10px; }
  .ps-history-modal { width: 100%; max-height: 96vh; border-radius: 10px 10px 0 0; align-self: flex-end; }
}`;
    document.head.appendChild(s);
  }

  // ============================================================
  // PUBLIC API
  // ============================================================

  function setGlobalSearch(query) {
      _filter.keyword = query;
      _page = 1;
      const kwInput = _el('ps-f-keyword');
      if (kwInput) kwInput.value = query;
      _refreshTable();
  }

  return {
    init,
    reload: () => _bootstrap(),
    setGlobalSearch,
    _sortBy,
    _selectRow,
    _goPage,
    _openHistory,
  };

})();

if (typeof window !== 'undefined') {
  window.PlasticStockUI = PlasticStockUI;
}


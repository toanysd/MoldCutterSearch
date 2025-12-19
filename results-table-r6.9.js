/**
 * results-table.js (v4.9 DEBUG - Force CSS Priority)
 * ✅ Added !important to ALL hover/highlight rules
 * ✅ Check z-index and pointer-events conflicts
 * ✅ Log CSS injection for debugging
 */
(function () {
  'use strict';

  const CONFIG = { perPage: 20, perPageOptions: [10,20,50,100] };
  
  const SEL = {
    table: '.results-table',
    thead: '.results-table thead',
    tbody: '#results-tbody',
    resultsTabBtn: '.lower-tab[data-tab="results"]',
    detailTabBtn:  '.lower-tab[data-tab="detail"]',
    countBadge: '#results-count-badge'
  };

  const state = {
    items: [],
    sortCol: null,
    sortDir: 'asc',
    page: 1,
    perPage: CONFIG.perPage,
    selectedKey: null
  };

  init();

  function init() {
    bindGlobal();
    ensureCountBadge();
    ensureStyle();
    console.log('[ResultsTable v4.9] DEBUG - Force CSS Priority loaded');
    
    // 🔍 DEBUG: Check tbody
    setTimeout(() => {
      const tbody = document.querySelector(SEL.tbody);
      if (tbody) {
        const computed = window.getComputedStyle(tbody);
        console.log('[ResultsTable] tbody computed:', {
          pointerEvents: computed.pointerEvents,
          zIndex: computed.zIndex,
          position: computed.position
        });
        
        const firstRow = tbody.querySelector('tr');
        if (firstRow) {
          const rowComputed = window.getComputedStyle(firstRow);
          console.log('[ResultsTable] First row computed:', {
            pointerEvents: rowComputed.pointerEvents,
            cursor: rowComputed.cursor,
            background: rowComputed.backgroundColor
          });
        }
      }
    }, 2000);
  }

  function bindGlobal() {
    document.addEventListener('search:updated', render);
    document.addEventListener('results:updated', render);

    // Bidirectional sync
    document.addEventListener('quick:select', (e) => {
      const { id, type, source } = e.detail || {};
      if (source === 'results-table') return;
      if (!id || !type) return;
      
      console.log('[ResultsTable] 🔄 Sync from quick:select');
      state.selectedKey = { id, type };
      applySelectionHighlight();
      scrollToSelected();
    });

    // Click delegation
    document.addEventListener('click', (ev) => {
      const tbody = document.querySelector(SEL.tbody);
      if (!tbody || !tbody.contains(ev.target)) return;

      console.log('[ResultsTable] Click detected on:', ev.target.tagName, ev.target.className);

      // Priority 1: Details button
      const detailBtn = ev.target.closest('.btn-detail-action');
      if (detailBtn) {
        const tr = detailBtn.closest('tr');
        if (!tr) return;
        selectRow(tr, true);
        return;
      }

      // Priority 2: Anywhere else in row
      const tr = ev.target.closest('tr');
      if (tr && tr.dataset.id) {
        selectRow(tr, false);
      }
    });
  }

  function ensureCountBadge() {
    const tab = document.querySelector(SEL.resultsTabBtn);
    if (!tab || document.getElementById('results-count-badge')) return;
    const badge = document.createElement('span');
    badge.id = 'results-count-badge';
    badge.className = 'tab-count';
    badge.textContent = '0';
    tab.appendChild(badge);
  }

  // SAU: Nhận kết quả từ event, không lấy từ SearchModule cũ
  function render(e) {
      const fromEvent = e?.detail?.results;
      const results = Array.isArray(fromEvent) 
          ? fromEvent 
          : (window.SearchModule?.getResults?.() || []);
      
      state.items = results;
      state.page = 1;
      updateCountBadge();
      renderTable();
  }

  // Bind với tham số event
  document.addEventListener('search:updated', render);

  function updateCountBadge() {
    const badge = document.getElementById('results-count-badge');
    if (badge) badge.textContent = String(state.items.length || 0);
  }

  function renderTable() {
    const thead = document.querySelector(SEL.thead);
    const tbody = document.querySelector(SEL.tbody);
    if (!thead || !tbody) return;

    const molds = state.items.filter(x => x.itemType === 'mold');
    const cutters = state.items.filter(x => x.itemType === 'cutter');
    const hasMolds = molds.length > 0;
    const hasCutters = cutters.length > 0;
    const isMixed = hasMolds && hasCutters;

    // Header with Action column
    if (hasMolds && !hasCutters) {
      thead.innerHTML = `
        <tr class="mold-header">
          <th data-col="MoldID" class="sortable">金型ID / Mold ID <i class="sort-icon"></i></th>
          <th data-col="MoldName" class="sortable">名称 / Tên <i class="sort-icon"></i></th>
          <th data-col="size" class="sortable">寸法 / Kích thước <i class="sort-icon"></i></th>
          <th data-col="location">保管場所 / Nơi lưu</th>
          <th data-col="position">位置 / Vị trí</th>
          <th data-col="productionDate" class="sortable">製造日 / Ngày SX <i class="sort-icon"></i></th>
          <th class="col-action">操作 / Hành động</th>
        </tr>
      `;
    } else if (hasCutters && !hasMolds) {
      thead.innerHTML = `
        <tr class="cutter-header">
          <th data-col="CutterNo" class="sortable">抜型No / Cutter No <i class="sort-icon"></i></th>
          <th data-col="CutterName" class="sortable">名称 / Tên <i class="sort-icon"></i></th>
          <th data-col="size" class="sortable">寸法 / Kích thước <i class="sort-icon"></i></th>
          <th data-col="position">位置 / Vị trí</th>
          <th data-col="productionDate" class="sortable">製造日 / Ngày SX <i class="sort-icon"></i></th>
          <th class="col-action">操作 / Hành động</th>
        </tr>
      `;
    } else {
      thead.innerHTML = `
        <tr class="mixed-header">
          <th data-col="type">種別 / Loại</th>
          <th data-col="code" class="sortable">コード / Mã <i class="sort-icon"></i></th>
          <th data-col="name" class="sortable">名称 / Tên <i class="sort-icon"></i></th>
          <th data-col="size" class="sortable">寸法 / Kích thước <i class="sort-icon"></i></th>
          <th data-col="location">保管場所 / Nơi lưu</th>
          <th data-col="position">位置 / Vị trí</th>
          <th data-col="productionDate" class="sortable">製造日 / Ngày SX <i class="sort-icon"></i></th>
          <th class="col-action">操作 / Hành động</th>
        </tr>
      `;
    }

    thead.querySelectorAll('.sortable').forEach(th => {
      th.style.cursor = 'pointer';
      th.onclick = () => sortBy(th.dataset.col);
    });

    const sorted = sortItems([...state.items]);
    const start = (state.page - 1) * state.perPage;
    const page = sorted.slice(start, start + state.perPage);

    tbody.innerHTML = '';
    if (!page.length) {
      const colspan = isMixed ? 8 : (hasMolds ? 7 : 6);
      tbody.innerHTML = `<tr><td colspan="${colspan}" class="no-results">検索結果なし / Không có kết quả</td></tr>`;
      updateSortIcons();
      renderPagination(sorted.length);
      return;
    }

    page.forEach(item => {
      const isMold = item.itemType === 'mold';
      const tr = document.createElement('tr');
      tr.className = `result-row ${isMold ? 'mold-row' : 'cutter-row'}`;
      tr.dataset.id = isMold ? (item.MoldID || '') : (item.CutterNo || item.CutterID || '');
      tr.dataset.type = isMold ? 'mold' : 'cutter';
      tr.innerHTML = isMixed ? renderMixedRow(item) : (isMold ? renderMoldRow(item) : renderCutterRow(item));
      tbody.appendChild(tr);
    });

    console.log('[ResultsTable] Rendered', page.length, 'rows');

    updateSortIcons();
    applySelectionHighlight();
    renderPagination(sorted.length);
  }

  function renderMoldRow(item) {
    const id = item.MoldID || '';
    const name = item.displayName || item.MoldName || '';
    const size = item.displayDimensions || '-';
    const location = item.displayRackLocation || item.rackInfo?.RackLocation || '-';
    const pos = formatPosition(item);
    const prodDate = formatDate(item.jobInfo?.DeliveryDeadline);

    return `
      <td class="cell-id">${esc(id)}</td>
      <td class="cell-name"><strong>${esc(name)}</strong></td>
      <td>${esc(size)}</td>
      <td>${esc(location)}</td>
      <td>${pos}</td>
      <td>${prodDate}</td>
      <td class="cell-action"><button class="btn-detail-action">詳細</button></td>
    `;
  }

  function renderCutterRow(item) {
    const no = item.CutterNo || item.CutterID || '';
    const name = item.displayName || item.CutterName || '';
    const size = item.displayDimensions || item.cutlineSize || '-';
    const pos = formatPosition(item);
    const prodDate = formatDate(item.CutterManufactureDate || item.SatoCodeDate);

    return `
      <td class="cell-id code-col-cutter"><span class="cutter-code">${esc(no)}</span></td>
      <td class="cell-name"><strong>${esc(name)}</strong></td>
      <td>${esc(size)}</td>
      <td>${pos}</td>
      <td>${prodDate}</td>
      <td class="cell-action"><button class="btn-detail-action">詳細</button></td>
    `;
  }

  function renderMixedRow(item) {
    const isMold = item.itemType === 'mold';
    const typeLabel = isMold ? '金型' : '抜型';
    const code = item.displayCode || (isMold ? (item.MoldCode || item.MoldID || '') : (item.CutterNo || item.CutterID || ''));
    const name = item.displayName || (isMold ? item.MoldName : item.CutterName) || '';
    const size = item.displayDimensions || item.cutlineSize || '-';
    const location = item.displayRackLocation || item.rackInfo?.RackLocation || '-';
    const pos = formatPosition(item);
    const prodDate = isMold ? formatDate(item.jobInfo?.DeliveryDeadline) : formatDate(item.CutterManufactureDate || item.SatoCodeDate);

    return `
      <td><span class="type-badge ${isMold ? 'mold' : 'cutter'}">${typeLabel}</span></td>
      <td class="${isMold ? 'code-col-mold' : 'code-col-cutter'}">${isMold ? esc(item.MoldID || '-') : `<span class="cutter-code">${esc(code)}</span>`}</td>
      <td class="cell-name"><strong>${esc(name)}</strong></td>
      <td>${esc(size)}</td>
      <td>${esc(location)}</td>
      <td>${pos}</td>
      <td>${prodDate}</td>
      <td class="cell-action"><button class="btn-detail-action">詳細</button></td>
    `;
  }

  function selectRow(tr, openTab) {
    const id = tr.dataset.id;
    const type = tr.dataset.type;
    if (!id || !type) return;
    
    state.selectedKey = { id, type };
    applySelectionHighlight();
    
    // ✅ THÊM: Lấy item thực tế để truyền vào event
    const item = state.items.find(it => {
        const itemId = it.itemType === 'mold' ? 
            (it.MoldID || '') : (it.CutterNo || it.CutterID || '');
        return String(itemId) === String(id) && it.itemType === type;
    });
    
    // ✅ SỬA: Dispatch với item đầy đủ
    document.dispatchEvent(new CustomEvent('quick:select', {
        detail: { id, type, source: 'results-table', item }  // ← THÊM item
    }));
    
    // ✅ SỬA: Dispatch detail:changed thay vì detail:open để sync cột 4
    if (item) {
        document.dispatchEvent(new CustomEvent('detail:changed', {
            detail: { item, itemType: type, itemId: id, source: 'results-table' }
        }));
    }
    
    // Mở tab chi tiết nếu click nút 詳細
    if (openTab) {
        console.log('[ResultsTable] Opening detail tab');
        document.querySelector(SEL.detailTabBtn)?.click();
    }
  }


  function applySelectionHighlight() {
    const tbody = document.querySelector(SEL.tbody);
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      const match = state.selectedKey && 
                    tr.dataset.id === state.selectedKey.id && 
                    tr.dataset.type === state.selectedKey.type;
      tr.classList.toggle('row-selected', !!match);
    });
  }

  function scrollToSelected() {
    const tbody = document.querySelector(SEL.tbody);
    if (!tbody) return;
    const selected = tbody.querySelector('.row-selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function formatPosition(item) {
    const layer = item.rackLayerInfo || {};
    const rack = item.rackInfo || {};
    const rackID = rack.RackID || layer.RackID || '';
    const layerNum = layer.RackLayerNumber || '';
    const badge = item.itemType === 'mold' ? 'pos-mold' : 'pos-cutter';
    
    if (rackID && layerNum) 
      return `<span class="pos-badge ${badge}">${esc(rackID)}-${esc(layerNum)}</span>`;
    if (rackID) 
      return `<span class="pos-badge ${badge}">${esc(rackID)}</span>`;
    return '-';
  }

  function formatDate(d) {
    if (!d) return '-';
    const t = new Date(d);
    if (isNaN(t)) return '-';
    return `${t.getFullYear()}/${String(t.getMonth()+1).padStart(2,'0')}/${String(t.getDate()).padStart(2,'0')}`;
  }

  function sortBy(col) {
    if (state.sortCol === col) {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortCol = col;
      state.sortDir = 'asc';
    }
    state.page = 1;
    renderTable();
  }

  function sortItems(arr) {
    if (!state.sortCol) return arr;
    const dir = state.sortDir === 'asc' ? 1 : -1;
    const col = state.sortCol;

    return arr.slice().sort((a,b) => {
      let va = getSortValue(a, col);
      let vb = getSortValue(b, col);

      if (col === 'productionDate') {
        va = va ? (new Date(va).getTime()||0) : 0;
        vb = vb ? (new Date(vb).getTime()||0) : 0;
        return (va - vb) * dir;
      }

      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return -1*dir;
      if (va > vb) return  1*dir;
      return 0;
    });
  }

  function getSortValue(item, col) {
    switch (col) {
      case 'MoldID': return item.MoldID || '';
      case 'CutterNo': return item.CutterNo || item.CutterID || '';
      case 'MoldName':
      case 'CutterName':
      case 'name': return item.displayName || item.MoldName || item.CutterName || '';
      case 'code': return item.displayCode || item.MoldCode || item.CutterNo || '';
      case 'size': return item.displayDimensions || item.cutlineSize || '';
      case 'location': return item.displayRackLocation || item.rackInfo?.RackLocation || '';
      case 'position': {
        const layer = item.rackLayerInfo || {};
        const rack = item.rackInfo || {};
        return `${rack.RackID || layer.RackID || ''}-${layer.RackLayerNumber || ''}`;
      }
      case 'productionDate':
        return item.itemType === 'mold' 
          ? (item.jobInfo?.DeliveryDeadline || '') 
          : (item.CutterManufactureDate || item.SatoCodeDate || '');
      case 'type': return item.itemType === 'mold' ? 'A' : 'B';
      default: return '';
    }
  }

  function updateSortIcons() {
    const thead = document.querySelector(SEL.thead);
    if (!thead) return;
    thead.querySelectorAll('.sort-icon').forEach(i => i.className = 'sort-icon sort-hidden');
    if (state.sortCol) {
      const th = thead.querySelector(`th[data-col="${state.sortCol}"]`);
      if (th) {
        const icon = th.querySelector('.sort-icon');
        if (icon) {
          icon.className = state.sortDir === 'asc' ? 'sort-icon sort-asc' : 'sort-icon sort-desc';
        }
      }
    }
  }

  function renderPagination(total) {
    const table = document.querySelector(SEL.table);
    if (!table) return;
    
    let pag = table.parentElement?.querySelector('.pagination');
    if (!pag) {
      pag = document.createElement('div');
      pag.className = 'pagination';
      table.parentElement?.appendChild(pag);
    }

    const totalPages = Math.max(1, Math.ceil(total / state.perPage));
    const hasPrev = state.page > 1;
    const hasNext = state.page < totalPages;

    pag.innerHTML = `
      <div class="pag-info">
        <span>${total ? ((state.page - 1) * state.perPage + 1) : 0} - ${Math.min(state.page * state.perPage, total)} / ${total}</span>
        <select class="per-page-select">
          ${CONFIG.perPageOptions.map(opt => 
            `<option value="${opt}" ${opt === state.perPage ? 'selected' : ''}>${opt}件</option>`
          ).join('')}
        </select>
      </div>
      <div class="pag-btns">
        <button class="pag-btn" data-act="first" ${!hasPrev ? 'disabled' : ''}>«</button>
        <button class="pag-btn" data-act="prev" ${!hasPrev ? 'disabled' : ''}>‹</button>
        <span class="pag-current">ページ ${state.page} / ${totalPages}</span>
        <button class="pag-btn" data-act="next" ${!hasNext ? 'disabled' : ''}>›</button>
        <button class="pag-btn" data-act="last" ${!hasNext ? 'disabled' : ''}>»</button>
      </div>
    `;

    pag.querySelector('[data-act="first"]')?.addEventListener('click', () => { state.page = 1; renderTable(); });
    pag.querySelector('[data-act="prev"]')?.addEventListener('click', () => { if (state.page > 1) { state.page--; renderTable(); } });
    pag.querySelector('[data-act="next"]')?.addEventListener('click', () => { if (state.page < totalPages) { state.page++; renderTable(); } });
    pag.querySelector('[data-act="last"]')?.addEventListener('click', () => { state.page = totalPages; renderTable(); });
    pag.querySelector('.per-page-select')?.addEventListener('change', (e) => {
      state.perPage = parseInt(e.target.value, 10);
      state.page = 1;
      renderTable();
    });
  }

  function esc(s){
    return String(s??'').replace(/[&<>"']/g,m=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[m]));
  }

  function ensureStyle() {
    if (document.getElementById('results-table-style')) return;
    const st = document.createElement('style');
    st.id = 'results-table-style';
    st.textContent = `
      /* 🔧 FORCE PRIORITY WITH !important */
      .results-table { 
        width:100% !important; 
        border-collapse: collapse !important; 
        font-size:12px !important;
        position: relative !important;
        z-index: 10 !important;
      }
      .results-table thead th {
        padding: 4px 6px !important; 
        text-align:left !important; 
        font-weight:600 !important; 
        font-size:10px !important;
        border-bottom:2px solid #e5e7eb !important; 
        position: sticky !important; 
        top:0 !important; 
        z-index: 15 !important; 
        white-space:nowrap !important;
      }
      .results-table thead.mold-header th { background: linear-gradient(135deg,#dbeafe,#bfdbfe) !important; color:#1e40af !important; }
      .results-table thead.cutter-header th { background: linear-gradient(135deg,#fed7aa,#fdba74) !important; color:#9a3412 !important; }
      .results-table thead.mixed-header th { background: linear-gradient(135deg,#e9d5ff,#d8b4fe) !important; color:#6b21a8 !important; }
      
      .sort-icon{ margin-left:3px !important; font-size:9px !important; font-weight:700 !important; }
      .sort-icon.sort-hidden{ visibility:hidden !important; }
      .sort-icon.sort-asc::before{ content:'▲' !important; }
      .sort-icon.sort-desc::before{ content:'▼' !important; }

      .results-table tbody td{ 
        padding:6px 6px !important; 
        border-bottom:1px solid #f3f4f6 !important; 
        vertical-align:middle !important;
        pointer-events: auto !important;
      }
      
      /* 🔧 FORCE pointer and enable events */
      .results-table tbody tr{ 
        transition: background .15s ease, box-shadow .15s ease !important; 
        cursor: pointer !important;
        pointer-events: auto !important;
        position: relative !important;
        z-index: 5 !important;
      }
      
      /* 🔧 HOVER - HIGHEST PRIORITY */
      .results-table tbody tr.mold-row:hover{ 
        background: #f0f9ff !important; 
      }
      .results-table tbody tr.cutter-row:hover{ 
        background: #fff7ed !important; 
      }
      
      /* 🔧 SELECTED - THICK BORDER */
      .results-table tbody tr.row-selected.mold-row{ 
        background: #dbeafe !important; 
        box-shadow: inset 5px 0 0 #1e40af !important; 
      }
      .results-table tbody tr.row-selected.cutter-row{ 
        background: #fed7aa !important; 
        box-shadow: inset 5px 0 0 #ea580c !important; 
      }

      .results-table .cell-name{ font-weight:600 !important; }
      
      .results-table .code-col-cutter .cutter-code{
        display:inline-block !important; 
        padding:2px 7px !important; 
        border-radius:6px !important; 
        border:2px solid #f97316 !important; 
        background:#fff !important; 
        color:#ea580c !important; 
        font-weight:700 !important;
      }
      
      /* Action column */
      .col-action{ width: 90px !important; text-align: center !important; }
      .cell-action{ text-align: center !important; }
      .btn-detail-action{
        padding: 4px 12px !important; 
        border-radius: 6px !important; 
        border: 1px solid #3b82f6 !important;
        background: linear-gradient(135deg, #3b82f6, #2563eb) !important;
        color: #fff !important; 
        font-size: 11px !important; 
        font-weight: 600 !important; 
        cursor: pointer !important;
        transition: all .15s ease !important;
      }
      .btn-detail-action:hover{
        background: linear-gradient(135deg, #2563eb, #1d4ed8) !important;
        box-shadow: 0 2px 6px rgba(59,130,246,0.4) !important;
        transform: translateY(-1px) !important;
      }
      
      .pos-badge{ 
        display:inline-block !important; 
        padding:2px 6px !important; 
        border-radius:6px !important; 
        font-weight:600 !important; 
        font-size:11px !important; 
      }
      .pos-mold{ background:#e0f2fe !important; color:#0369a1 !important; border:1px solid #7dd3fc !important; }
      .pos-cutter{ background:#ffedd5 !important; color:#c2410c !important; border:1px solid #fdba74 !important; }
      
      .type-badge{ 
        display:inline-block !important; 
        padding:2px 6px !important; 
        border-radius:4px !important; 
        font-size:10px !important; 
        font-weight:600 !important; 
      }
      .type-badge.mold{ background:#dbeafe !important; color:#1e40af !important; }
      .type-badge.cutter{ background:#fed7aa !important; color:#9a3412 !important; }
      
      .no-results{ text-align:center !important; padding:16px !important; color:#9ca3af !important; font-style:italic !important; }

      /* Pagination */
      .pagination {
        display:flex !important; 
        align-items:center !important; 
        justify-content:space-between !important;
        padding:6px 8px !important; 
        border-top:1px solid #e5e7eb !important; 
        background:#fafbfc !important;
      }
      .pag-info{ display:flex !important; align-items:center !important; gap:8px !important; font-size:11px !important; color:#6b7280 !important; }
      .per-page-select{ 
        padding:2px 5px !important; 
        border:1px solid #e5e7eb !important; 
        border-radius:4px !important; 
        font-size:10px !important; 
        cursor:pointer !important;
      }
      .pag-btns{ display:flex !important; align-items:center !important; gap:5px !important; }
      .pag-btn{
        padding:2px 7px !important; 
        border:1px solid #e5e7eb !important; 
        border-radius:4px !important;
        background:#fff !important; 
        cursor:pointer !important; 
        font-size:12px !important; 
        min-height:24px !important;
      }
      .pag-btn:hover:not(:disabled){ background:#f3f4f6 !important; }
      .pag-btn:disabled{ opacity:.4 !important; cursor:not-allowed !important; }
      .pag-current{ font-size:11px !important; color:#374151 !important; font-weight:500 !important; }
    `;
    document.head.appendChild(st);
    console.log('[ResultsTable] ✅ CSS injected with !important');
  }
})();

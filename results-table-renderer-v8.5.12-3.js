/* ============================================================================
   RESULTS TABLE RENDERER v8.2.1
   Mobile-first fixes + Resizable columns + Bilingual header 2 lines
   Updated: 2026-02-11

   Mục tiêu (theo yêu cầu mới):
   - Mobile: giảm width checkbox/ID, giảm font; ưu tiên hiển thị đủ cột
     checkbox, id, code, sản phẩm, kích thước, vị trí.
   - Header song ngữ 2 dòng: (JA trên, VI dưới nhỏ & mờ).
   - Cho phép kéo thay đổi kích thước cột (desktop + mobile).
   - Popup lọc: giảm khoảng trống; nút Apply rõ (chữ trắng trên nền accent).
   - Chỉ mở trang chi tiết khi bấm ô Code hoặc nút thao tác cột cuối.
   - Nút thao tác: hiện đại hơn (ellipsis), nhỏ gọn.
   - Thêm hiển thị số lượng kết quả trong pagination (để có thể ẩn result-count trên mobile bằng CSS).

   Lưu ý:
   - Giữ nguyên class/selector cũ để tương thích CSS và app.js đang dùng.
   - File này vẫn bind lockBtn (#lockBtn) trong index.html.
============================================================================ */

// So sánh chuỗi theo số tự nhiên: 1, 2, 3, 9, 10, 11, 22...
function naturalCompare(a, b) {
  const ax = [];
  const bx = [];

  String(a).replace(/(\d+)|(\D+)/g, (_, $1, $2) => {
    ax.push([$1 ? parseInt($1, 10) : Infinity, $2 || ""]);
  });
  String(b).replace(/(\d+)|(\D+)/g, (_, $1, $2) => {
    bx.push([$1 ? parseInt($1, 10) : Infinity, $2 || ""]);
  });

  while (ax.length && bx.length) {
    const an = ax.shift();
    const bn = bx.shift();

    const diff = an[0] - bn[0] || an[1].localeCompare(bn[1]);
    if (diff) return diff;
  }
  return ax.length - bx.length;
}

class ResultsTableRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.items = [];
    this.filteredItems = [];
    this.selectedItems = new Set();

    // Sort
    this.sortColumn = null;
    this.sortDirection = 'desc';

    // Pagination
    this.itemsPerPage = 24;
    this.currentPage = 1;
    this.totalPages = 1;

    // Column filters
    this.columnFilters = {};
    this.activeFilterPopup = null;

    // Lock/Unlock
    this.isLocked = true;

    // Column resize
    this.colKeys = ['checkbox','id','code','name','dimensions','location','type','date','status','actions'];
    this.resizableCols = ['id','code','name','dimensions','location','date'];
    this.colWidthStorageKey = 'rt_col_widths_v8_5_4_1';

    // Callbacks
    this.onItemClick = null;
    this.onSelectionChange = null;

    this.init();
  }

  init() {
    this.injectTableUXStyles();
    this.injectAssistiveRowStyles();

    if (this.container && !this.container.querySelector('table')) {
      this.createTableStructure();
    }

    // Bind to existing HTML controls
    this.bindHTMLControls();

    // Close filter popup when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.column-filter-btn') && !e.target.closest('.filter-popup')) {
        this.closeFilterPopup();
      }
    });

    // Apply saved widths (if any)
    this.applySavedColumnWidths();

    // Enable resizing handles
    this.initColumnResizing();

    console.log('✅ ResultsTableRenderer v8.2.1 initialized');
  }

  /* ------------------------------------------------------------------------
     HTML controls (Lock button)
  ------------------------------------------------------------------------ */
  injectAssistiveRowStyles() {
    if (document.getElementById('table-assistive-row-style')) return;
    const st = document.createElement('style');
    st.id = 'table-assistive-row-style';
    st.innerHTML = `
      .results-table-wrapper tr .table-assistive-trigger-btn { display: none !important; }
      .results-table-wrapper tr.focused-row .table-assistive-trigger-btn { display: flex !important; }
      @media (max-width: 768px) {
        .results-table-wrapper tr.focused-row td.col-actions {
          position: sticky !important;
          right: 0 !important;
          background: #fff;
          z-index: 10;
        }
      }
    `;
    document.head.appendChild(st);
  }

  bindHTMLControls() {
    const lockBtn = document.getElementById('lockBtn');
    if (lockBtn) {
      lockBtn.addEventListener('click', () => {
        this.isLocked = !this.isLocked;
        this.updateLockState();
      });
    }
  }

  updateStickyLeftOffsets() {
    const scroll = this.container?.querySelector('.table-scroll-container');
    const thCb = this.container?.querySelector('th.col-checkbox');
    if (!scroll || !thCb) return;

    const w = Math.round(thCb.getBoundingClientRect().width) || 34;
    scroll.style.setProperty('--rt-sticky-left-id', `${w}px`);
  }

  updateLockState() {
    const lockBtn = document.getElementById('lockBtn');
    const scrollContainer = this.container.querySelector('.table-scroll-container');
    const lockText = document.getElementById('lockText');
    const lockIcon = lockBtn?.querySelector('i');

    if (this.isLocked) {
      lockBtn?.classList.remove('unlocked');
      lockBtn?.classList.add('locked');
      scrollContainer?.classList.remove('unlocked');
      if (lockIcon) lockIcon.className = 'fas fa-lock';
      if (lockText) lockText.textContent = 'Lock';
    } else {
      lockBtn?.classList.remove('locked');
      lockBtn?.classList.add('unlocked');
      scrollContainer?.classList.add('unlocked');
      if (lockIcon) lockIcon.className = 'fas fa-unlock';
      if (lockText) lockText.textContent = 'Unlock';
    }
    this.updateStickyLeftOffsets();
  }

  goToPage(page) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    this.renderRows();
  }

  /* ------------------------------------------------------------------------
     Table structure
  ------------------------------------------------------------------------ */
  createTableStructure() {
    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';

    const th = (colKey, ja, vi, hasFilter = true, resizable = true) => {
      const filterBtn = hasFilter
        ? `<button class="column-filter-btn" data-column="${colKey}" aria-label="filter">🔽</button>`
        : '';

      const resizer = (resizable && this.resizableCols.includes(colKey))
        ? `<span class="col-resizer" data-column="${colKey}" title="Kéo để đổi kích thước cột"></span>`
        : '';

      const label = vi
        ? `<span class="th-label"><span class="ja">${ja}</span><span class="vi">${vi}</span></span>`
        : `<span class="th-label"><span class="ja">${ja}</span></span>`;

      return `
        <th class="col-${colKey}" data-column="${colKey}">
          <div class="th-content">
            ${label}
            ${filterBtn}
          </div>
          ${resizer}
        </th>
      `;
    };

    wrapper.innerHTML = `
      <div class="table-scroll-container" id="tableScrollContainer">
        <table class="results-table" id="resultsTable">
          <colgroup>
            <col class="col-checkbox">
            <col class="col-id">
            <col class="col-code">
            <col class="col-name">
            <col class="col-dimensions">
            <col class="col-location">
            <col class="col-type">
            <col class="col-date">
            <col class="col-status">
            <col class="col-actions">
          </colgroup>
          <thead>
            <tr>
              <th class="col-checkbox" data-column="checkbox">
                <input type="checkbox" id="selectAllTable" aria-label="select all">
              </th>
              ${th('id', 'ID', null, true, true)}
              ${th('code', 'コード', 'Mã', true, true)}
              ${th('name', '製品情報', 'Sản phẩm', true, true)}
              ${th('dimensions', '寸法', 'Kích thước', true, true)}
              ${th('location', '位置', 'Vị trí', true, true)}
              ${th('type', '種類', 'Loại', true, false)}
              ${th('date', '更新日', 'Ngày cập nhật', true, true)}
              ${th('status', '状態', 'Trạng thái', true, false)}
              <th class="col-actions" data-column="actions">操作</th>
            </tr>
          </thead>
          <tbody id="tableBody">
            <!-- Rows will be inserted here -->
          </tbody>
        </table>
      </div>
    `;

    this.container.appendChild(wrapper);

    // Bind events
    this.bindTableEvents();

    // default widths
    this.applyDefaultColumnWidths();
    this.updateStickyLeftOffsets();
  }

  bindTableEvents() {
    const table = this.container.querySelector('.results-table');
    if (!table) return;

    // Select all checkbox
    const selectAll = table.querySelector('#selectAllTable');
    if (selectAll) {
      selectAll.addEventListener('change', (e) => {
        e.stopPropagation();
        this.toggleSelectAll(e.target.checked);
      });
    }

    // Column filter buttons
    table.querySelectorAll('.column-filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const column = btn.dataset.column;
        this.openFilterPopup(column, btn);
      });
    });

    // Sort by clicking header (except checkbox/actions)
    table.querySelectorAll('th[class^="col-"]').forEach(th => {
      if (th.classList.contains('col-checkbox') || th.classList.contains('col-actions')) return;

      th.addEventListener('click', (e) => {
        if (e.target.closest('.column-filter-btn') || e.target.closest('.col-resizer')) return;

        const column = th.dataset.column || th.querySelector('.column-filter-btn')?.dataset.column;
        if (column && column !== 'checkbox' && column !== 'actions') {
          if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
            this.sortColumn = column;
            this.sortDirection = 'desc';
          }

          this.currentPage = 1;
          this.applyFiltersAndSort();
          this.calculatePagination();
          this.renderRows();
          this.updateAllFilterButtons();
        }
      });
    });
  }

  /* ------------------------------------------------------------------------
     Render
  ------------------------------------------------------------------------ */
  render(items) {
    this.items = items;

    // Filter + sort
    this.applyFiltersAndSort();
    this.calculatePagination();

    if (this.currentPage > this.totalPages) {
      this.currentPage = Math.max(1, this.totalPages);
    }

    this.renderRows();
    this.updateAllFilterButtons();
    this.updatePaginationResultCount();
  }

  calculatePagination() {
    this.totalPages = Math.ceil(this.filteredItems.length / this.itemsPerPage);
    if (this.totalPages < 1) this.totalPages = 1;
    if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
  }

  applyFiltersAndSort() {
    let filtered = [...this.items];

    // Column filters
    Object.keys(this.columnFilters).forEach(column => {
      const filterValues = this.columnFilters[column];
      if (filterValues && filterValues.length > 0) {
        filtered = filtered.filter(item => {
          const value = this.getColumnValue(item, column);
          return filterValues.includes(value);
        });
      }
    });

    // Sorting
    filtered.sort((a, b) => {
      let aVal, bVal;

      // Default: production date (displayDate)
      if (this.sortColumn === null || this.sortColumn === 'productionDate') {
        aVal = a.displayDate || '';
        bVal = b.displayDate || '';

        const aTime = aVal ? new Date(aVal).getTime() : new Date('1900-01-01').getTime();
        const bTime = bVal ? new Date(bVal).getTime() : new Date('1900-01-01').getTime();

        return this.sortDirection === 'asc' ? aTime - bTime : bTime - aTime;
      }

      // date column: latest status timestamp
      if (this.sortColumn === 'date') {
        aVal = this.getColumnValue(a, 'date');
        bVal = this.getColumnValue(b, 'date');

        const aTime = aVal ? new Date(aVal).getTime() : new Date('1900-01-01').getTime();
        const bTime = bVal ? new Date(bVal).getTime() : new Date('1900-01-01').getTime();

        return this.sortDirection === 'asc' ? aTime - bTime : bTime - aTime;
      }

      // others
      aVal = this.getColumnValue(a, this.sortColumn) || '';
      bVal = this.getColumnValue(b, this.sortColumn) || '';

      // dimensions numeric sort
      if (this.sortColumn === 'dimensions') {
        const dirMul = this.sortDirection === 'asc' ? 1 : -1;

        const norm = (v) => {
          if (v === null || v === undefined) return '';
          return String(v).replace(/\s+/g, ' ').trim();
        };

        const parseNums = (v) => {
          const s = norm(v);
          if (!s || s === 'N/A') return null;
          const t = s.replace(/×/g, 'x').replace(/[X＊*]/g, 'x');
          const nums = (t.match(/\d+(?:\.\d+)?/g) || []).map(n => parseFloat(n)).filter(n => !isNaN(n));
          return nums.length ? nums.slice(0, 3) : null;
        };

        const da = parseNums(aVal);
        const db = parseNums(bVal);

        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;

        for (let i = 0; i < 3; i++) {
          const av = (da[i] === undefined) ? null : da[i];
          const bv = (db[i] === undefined) ? null : db[i];
          if (av === null && bv === null) continue;
          if (av === null) return 1;
          if (bv === null) return -1;
          if (av !== bv) return dirMul * (av - bv);
        }
        return 0;
      }

      const cmp = naturalCompare(String(aVal), String(bVal));
      return this.sortDirection === 'asc' ? cmp : -cmp;
    });

    this.filteredItems = filtered;

    // Notify app (sync with card view)
    const detail = {
      results: this.filteredItems,
      sortColumn: this.sortColumn,
      sortDirection: this.sortDirection
    };

    document.dispatchEvent(new CustomEvent('tablefiltered', { detail }));
    document.dispatchEvent(new CustomEvent('table:filtered', { detail })); // giữ tương thích cũ

  }

  getColumnValue(item, column) {
    switch (column) {
      case 'id':
        return item.type === 'mold' ? item.MoldID : item.CutterID;
      case 'code':
        return item.type === 'mold' ? (item.MoldCode || '') : (item.CutterNo || '');
      case 'name':
        return this.getProductName(item);
      case 'dimensions':
        return item.dimensions || '';
      case 'location':
        return this.getRackLocation(item).display;
      case 'type':
        return item.type || '';
      case 'date':
        return (this.getLatestStatus(item).date || '');
      case 'status':
        return (this.getLatestStatus(item).status || '');
      default:
        return '';
    }
  }

  getProductName(item) {
    if (item.designInfo && item.designInfo.TrayInfoForMoldDesign) {
      return item.designInfo.TrayInfoForMoldDesign;
    }

    if (item.type === 'mold') {
      return item.MoldName || '';
    }

    return item.CutterName || item.CutterDesignName || '';
  }

  getRackLocation(item) {
    if (!window.DataManager || !window.DataManager.data) {
      return { display: '-', rackId: null, layerNum: null };
    }

    const rackLayerId = item.RackLayerID;
    if (!rackLayerId) {
      return { display: '-', rackId: null, layerNum: null };
    }

    const rackLayer = window.DataManager.data.racklayers?.find(rl =>
      String(rl.RackLayerID).trim() === String(rackLayerId).trim()
    );

    if (!rackLayer) {
      return { display: '-', rackId: null, layerNum: null };
    }

    const rackId = rackLayer.RackID;
    const layerNum = rackLayer.RackLayerNumber;
    const rack = window.DataManager.data.racks?.find(r =>
      String(r.RackID).trim() === String(rackId).trim()
    );

    const rackName = rack?.RackName || rackId;

    return {
      display: `${rackName}-${layerNum}`,
      rackId,
      layerNum,
      rackLayerId
    };
  }

  getLatestStatus(item) {
    if (!window.DataManager || !window.DataManager.data || !window.DataManager.data.statuslogs) {
      return { status: null, date: null };
    }

    const itemId = item.type === 'mold' ? item.MoldID : item.CutterID;
    const idField = item.type === 'mold' ? 'MoldID' : 'CutterID';

    const logs = window.DataManager.data.statuslogs.filter(log => {
      return String(log[idField] || '').trim() === String(itemId).trim();
    });

    if (!logs || logs.length === 0) {
      return { status: null, date: null };
    }

    logs.sort((a, b) => {
      const dateA = new Date(a.Timestamp || 0);
      const dateB = new Date(b.Timestamp || 0);
      return dateB - dateA;
    });

    const latest = logs[0];
    return {
      status: latest.Status || null,
      date: latest.Timestamp || null
    };
  }

  formatDate(dateStr) {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      if (isNaN(date)) return dateStr;

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}.${month}.${day}`;
    } catch (e) {
      return dateStr;
    }
  }

  getStatusLabel(status) {
    if (!status) return '-';

    const labels = {
      'IN': '入庫 IN',
      'OUT': '出庫 OUT',
      'AUDIT': '棚卸 AUDIT',
      'DISPOSED': '廃棄',
      'RETURNED': '返却'
    };

    return labels[String(status).toUpperCase()] || status;
  }

  renderRows() {
    const tbody = this.container.querySelector('#tableBody');
    if (!tbody) return;

    if (this.filteredItems.length === 0) {
      tbody.innerHTML = `
        <tr class="empty-row">
          <td colspan="10">
            <div class="empty-state">
              <div style="font-size: 48px; opacity: 0.3; margin-bottom: 12px;">📭</div>
              <p>結果が見つかりません / Không tìm thấy kết quả</p>
            </div>
          </td>
        </tr>
      `;
      this.updatePaginationResultCount();
      return;
    }

    // Page slice
    const startIdx = (this.currentPage - 1) * this.itemsPerPage;
    const endIdx = Math.min(startIdx + this.itemsPerPage, this.filteredItems.length);
    const pageItems = this.filteredItems.slice(startIdx, endIdx);

    tbody.innerHTML = pageItems.map((item, idx) => {
      const stt = startIdx + idx + 1;
      const itemId = item.type === 'mold' ? item.MoldID : item.CutterID;
      const code = item.type === 'mold' ? (item.MoldCode || '-') : (item.CutterNo || '-');
      const productName = this.getProductName(item) || '-';
      const dimensions = item.dimensions || '-';
      const rackLocation = this.getRackLocation(item);
      const location = rackLocation.display;

      const typeBadge = item.type === 'mold' ? '金型' : '抜型';
      const typeClass = item.type || 'mold';

      const statusInfo = this.getLatestStatus(item);
      const statusClass = statusInfo.status ? String(statusInfo.status).toLowerCase() : '';
      const statusLabel = this.getStatusLabel(statusInfo.status);
      const statusDate = statusInfo.date ? this.formatDate(statusInfo.date) : '-';

      const isSelected = this.selectedItems.has(Number(itemId));

      return `
        <tr data-id="${itemId}" data-type="${typeClass}" class="${isSelected ? 'selected' : ''}">
          <td class="col-checkbox">
            <input type="checkbox" class="row-checkbox" data-id="${itemId}" ${isSelected ? 'checked' : ''}>
          </td>
          <td class="col-id">${itemId}</td>
          <td class="col-code highlight-code" title="Mở chi tiết">${code}</td>
          <td class="col-name">${productName}</td>
          <td class="col-dimensions highlight-dimensions">${dimensions}</td>
          <td class="col-location highlight-location">${location}</td>
          <td class="col-type"><span class="table-type-badge ${typeClass}">${typeBadge}</span></td>
          <td class="col-date">${statusDate}</td>
          <td class="col-status">${statusInfo.status ? `<span class="table-status-badge ${statusClass}">${statusLabel}</span>` : '-'}</td>
          <td class="col-actions">
            <button class="table-assistive-trigger-btn" data-id="${itemId}" data-type="${typeClass}" aria-label="assistive" style="align-items:center; justify-content:center; width:36px; height:36px; border-radius:12px; border:none; background:linear-gradient(135deg, #14B8A6, #0F766E); color:#fff; box-shadow:0 4px 12px rgba(15, 118, 110, 0.3); pointer-events:auto; cursor:pointer; margin: 0 auto;">
              <i class="fas fa-bolt" style="font-size:16px;"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Sync checkbox & row
    this.updateCheckboxes();
    this.updateSelectAllState();

    // Bind row events
    this.bindRowEvents();

    this.updatePaginationResultCount();
  }

  bindRowEvents() {
    const tbody = this.container.querySelector('#tableBody');
    if (!tbody) return;

    // Checkbox events
    tbody.querySelectorAll('.row-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        const id = parseInt(checkbox.dataset.id, 10);
        if (checkbox.checked) {
          this.selectedItems.add(id);
        } else {
          this.selectedItems.delete(id);
        }
        this.updateRowSelection(id);
        this.updateSelectAllState();
        this.notifySelectionChange();
      });
    });

    const openDetailByRow = (row) => {
      const idStr = String(row?.dataset?.id || '').trim();
      if (!idStr) return;
      if (!this.onItemClick) return;

      const item = this.filteredItems.find(it => {
        const itemId = it.type === 'mold' ? it.MoldID : it.CutterID;
        return String(itemId).trim() === idStr;
      });

      if (item) this.onItemClick(item);
    };

    // ✅ Bấm chuột phải trên Row bung Menu Lệnh (Fluent Menu)
    tbody.querySelectorAll('tr').forEach(row => {
      const getItemFromRow = () => {
        const idStr = String(row?.dataset?.id || '').trim();
        return this.filteredItems.find(it => {
          const itemId = it.type === 'mold' ? it.MoldID : it.CutterID;
          return String(itemId).trim() === idStr;
        });
      };

      const codeCell = row.querySelector('td.col-code');
      if (codeCell) {
        // [Click Mở Chi Tiết]
        codeCell.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openDetailByRow(row);
        });
      }

      // [Chuẩn PC] Bấm chuột phải mở thẻ Quick Action
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const item = getItemFromRow();
        if (item) this.openTableActionMenu(e, item);
      });

      // [Chuẩn Mobile] Nhấn vào Hàng để Focus (Cho Assistive Touch)
      row.addEventListener('click', (e) => {
        if (e.target.closest('input[type="checkbox"]')) return;
        if (e.target.closest('button.table-action-btn')) return;
        if (e.target.closest('td.col-code')) return; // Bỏ qua cột Code

        tbody.querySelectorAll('tr.focused-row').forEach(r => r.classList.remove('focused-row'));
        row.classList.add('focused-row');

        const item = getItemFromRow();
        if (item) {
          window.CurrentFocusedRecord = item;
          document.dispatchEvent(new CustomEvent('TableRowFocused', { detail: item }));
        }
      });

      // [Chuẩn Mobile] Chạm giữ (Long Press) mở thẻ Quick Action
      let pressTimer;
      row.addEventListener('touchstart', (e) => {
        pressTimer = window.setTimeout(() => {
          const item = getItemFromRow();
          if (item) {
             const touch = e.touches[0] || e.changedTouches[0];
             this.openTableActionMenu({ clientX: touch.clientX, clientY: touch.clientY, target: row }, item);
          }
        }, 600); // Đè 600ms
      });
      row.addEventListener('touchend', () => { clearTimeout(pressTimer); });
      row.addEventListener('touchmove', () => { clearTimeout(pressTimer); });
    });

    tbody.querySelectorAll('.table-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const idStr = String(btn.dataset.id || '').trim();
        const item = this.filteredItems.find(it => {
          const itemId = it.type === 'mold' ? it.MoldID : it.CutterID;
          return String(itemId).trim() === idStr;
        });

        if (item && this.onItemClick) this.onItemClick(item);
      });
    });

    tbody.querySelectorAll('.table-assistive-trigger-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const idStr = String(btn.dataset.id || '').trim();
        const item = this.filteredItems.find(it => {
          const itemId = it.type === 'mold' ? it.MoldID : it.CutterID;
          return String(itemId).trim() === idStr;
        });

        if (item && window.DetailPanelAssistiveTouch && typeof window.DetailPanelAssistiveTouch.openMenuAt === 'function') {
          window.DetailPanelAssistiveTouch.openMenuAt(btn, item);
        }
      });
    });
  }

  toggleSelectAll(checked) {
    const startIdx = (this.currentPage - 1) * this.itemsPerPage;
    const endIdx = Math.min(startIdx + this.itemsPerPage, this.filteredItems.length);
    const pageItems = this.filteredItems.slice(startIdx, endIdx);

    pageItems.forEach(item => {
      const id = item.type === 'mold' ? item.MoldID : item.CutterID;
      const n = parseInt(id, 10);
      if (Number.isNaN(n)) return;
      if (checked) this.selectedItems.add(n);
      else this.selectedItems.delete(n);
    });

    this.renderRows();
    this.notifySelectionChange();
  }

  selectAll() {
    this.toggleSelectAll(true);
  }

  deselectAll() {
    this.selectedItems.clear();
    this.renderRows();
    this.notifySelectionChange();
  }

  selectAllResults() {
    this.filteredItems.forEach(item => {
      const id = item.type === 'mold' ? item.MoldID : item.CutterID;
      const n = parseInt(id, 10);
      if (!Number.isNaN(n)) this.selectedItems.add(n);
    });
    this.renderRows();
    this.notifySelectionChange();
  }

  updateRowSelection(id) {
    const row = this.container.querySelector(`tr[data-id="${id}"]`);
    if (!row) return;
    row.classList.toggle('selected', this.selectedItems.has(id));
  }

  updateSelectAllState() {
    const selectAll = this.container.querySelector('#selectAllTable');
    if (!selectAll) return;

    const startIdx = (this.currentPage - 1) * this.itemsPerPage;
    const endIdx = Math.min(startIdx + this.itemsPerPage, this.filteredItems.length);
    const pageItems = this.filteredItems.slice(startIdx, endIdx);

    const allSelected = pageItems.length > 0 && pageItems.every(item => {
      const id = item.type === 'mold' ? item.MoldID : item.CutterID;
      const n = parseInt(id, 10);
      return !Number.isNaN(n) && this.selectedItems.has(n);
    });

    selectAll.checked = allSelected;
  }

  notifySelectionChange() {
    if (this.onSelectionChange) {
      this.onSelectionChange(Array.from(this.selectedItems));
    }
  }

  /* ------------------------------------------------------------------------
     Filter popup
  ------------------------------------------------------------------------ */
  openFilterPopup(column, buttonEl) {
    this.closeFilterPopup();

    const rect = buttonEl.getBoundingClientRect();
    const popup = this.createFilterPopup(column);

    document.body.appendChild(popup);

    popup.style.left = `${rect.left}px`;
    popup.style.top = `${rect.bottom + 6}px`;

    const popupRect = popup.getBoundingClientRect();
    if (popupRect.right > window.innerWidth) {
      popup.style.left = `${window.innerWidth - popupRect.width - 10}px`;
    }
    if (popupRect.bottom > window.innerHeight) {
      popup.style.top = `${rect.top - popupRect.height - 6}px`;
    }

    this.activeFilterPopup = popup;
  }

  createFilterPopup(column) {
    const popup = document.createElement('div');
    popup.className = 'filter-popup';
    popup.dataset.column = column;

    const uniqueValues = [...new Set(
      this.items.map(item => this.getColumnValue(item, column))
    )].filter(v => v !== null && v !== undefined && String(v).trim() !== '').sort();

    const activeFilters = this.columnFilters[column] || [];

    popup.innerHTML = `
      <div class="filter-popup-header">
        <span class="filter-popup-title">フィルター / Filter</span>
        <button class="filter-popup-close" aria-label="close">✕</button>
      </div>
      <div class="filter-popup-body">
        <div class="filter-sort-section">
          <button class="filter-sort-btn" data-dir="asc">▲ 昇順 / Tăng dần</button>
          <button class="filter-sort-btn" data-dir="desc">▼ 降順 / Giảm dần</button>
        </div>
        <div class="filter-divider"></div>
        <div class="filter-values-section">
          <div class="filter-search">
            <input type="text" class="filter-search-input" placeholder="検索 / Tìm kiếm...">
          </div>
          <div class="filter-select-all">
            <label>
              <input type="checkbox" class="filter-select-all-cb" ${activeFilters.length === 0 ? 'checked' : ''}>
              <span>すべて選択 / Chọn tất cả</span>
            </label>
          </div>
          <div class="filter-values-list">
            ${uniqueValues.map(value => `
              <label class="filter-value-item">
                <input type="checkbox" value="${String(value).replace(/"/g,'&quot;')}" ${activeFilters.length === 0 || activeFilters.includes(value) ? 'checked' : ''}>
                <span>${value}</span>
              </label>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="filter-popup-footer">
        <button class="filter-clear-btn">クリア / Clear</button>
        <button class="filter-apply-btn">適用 / Apply</button>
      </div>
    `;

    this.bindFilterPopupEvents(popup, column);
    return popup;
  }

  bindFilterPopupEvents(popup, column) {
    popup.querySelector('.filter-popup-close').addEventListener('click', () => {
      this.closeFilterPopup();
    });

    popup.querySelectorAll('.filter-sort-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.sortColumn = column;
        this.sortDirection = btn.dataset.dir;
        this.currentPage = 1;
        this.applyFiltersAndSort();
        this.calculatePagination();
        this.renderRows();
        this.updateAllFilterButtons();
        this.closeFilterPopup();
      });
    });

    const searchInput = popup.querySelector('.filter-search-input');
    searchInput.addEventListener('input', () => {
      const query = (searchInput.value || '').toLowerCase();
      popup.querySelectorAll('.filter-value-item').forEach(item => {
        const text = (item.textContent || '').toLowerCase();
        item.style.display = text.includes(query) ? '' : 'none';
      });
    });

    const selectAllCb = popup.querySelector('.filter-select-all-cb');
    selectAllCb.addEventListener('change', () => {
      const checked = selectAllCb.checked;
      popup.querySelectorAll('.filter-value-item input').forEach(cb => {
        cb.checked = checked;
      });
    });

    popup.querySelector('.filter-clear-btn').addEventListener('click', () => {
      delete this.columnFilters[column];
      this.currentPage = 1;
      this.applyFiltersAndSort();
      this.calculatePagination();
      this.renderRows();
      this.updateFilterButtonState(column, false);
      this.closeFilterPopup();
    });

    popup.querySelector('.filter-apply-btn').addEventListener('click', () => {
      const selectedValues = Array.from(
        popup.querySelectorAll('.filter-value-item input:checked')
      ).map(cb => cb.value);

      const total = popup.querySelectorAll('.filter-value-item input').length;
      if (selectedValues.length === total) {
        delete this.columnFilters[column];
        this.updateFilterButtonState(column, false);
      } else {
        this.columnFilters[column] = selectedValues;
        this.updateFilterButtonState(column, true);
      }

      this.currentPage = 1;
      this.applyFiltersAndSort();
      this.calculatePagination();
      this.renderRows();
      this.closeFilterPopup();
    });
  }

  closeFilterPopup() {
    if (this.activeFilterPopup) {
      this.activeFilterPopup.remove();
      this.activeFilterPopup = null;
    }
  }

  updateFilterButtonState(column, active) {
    const btn = this.container.querySelector(`.column-filter-btn[data-column="${column}"]`);
    if (!btn) return;

    const isSorted = this.sortColumn === column;
    let icon = '🔽';
    if (isSorted) icon = this.sortDirection === 'asc' ? '▲' : '▼';

    btn.textContent = icon;

    if (active || isSorted) btn.classList.add('active');
    else btn.classList.remove('active');
  }

  updateAllFilterButtons() {
    ['id','code','name','dimensions','location','type','date','status'].forEach(column => {
      const hasFilter = this.columnFilters[column] && this.columnFilters[column].length > 0;
      this.updateFilterButtonState(column, hasFilter);
    });
  }

  /* ------------------------------------------------------------------------
     Selection API
  ------------------------------------------------------------------------ */
  clearSelection() {
    this.selectedItems.clear();
    this.renderRows();
    this.updateSelectAllState();
    this.notifySelectionChange();
  }

  deselectAll() { this.clearSelection(); }
  selectAll() { this.toggleSelectAll(true); }

  selectAllResults() {
    this.selectedItems.clear();
    this.filteredItems.forEach(item => {
      const id = item.type === 'mold' ? item.MoldID : item.CutterID;
      const n = parseInt(id, 10);
      if (!Number.isNaN(n)) this.selectedItems.add(n);
    });

    this.renderRows();
    this.updateSelectAllState();
    this.notifySelectionChange();
  }

  updateCheckboxes() {
    const rows = this.container.querySelectorAll('tbody tr');
    rows.forEach(row => {
      const id = parseInt(row.dataset.id, 10);
      const isSelected = this.selectedItems.has(id);

      const checkbox = row.querySelector('.row-checkbox');
      if (checkbox) checkbox.checked = isSelected;

      row.classList.toggle('selected', isSelected);
    });

    this.updateSelectAllState();
  }

  getSelectedItems() {
    return Array.from(this.selectedItems);
  }

  selectItems(itemIds) {
    itemIds.forEach(id => this.selectedItems.add(id));
    this.renderRows();
    this.updateSelectAllState();
    this.notifySelectionChange();
  }

  toggleLock() {
    this.isLocked = !this.isLocked;
    this.updateLockState();
  }

  needsReset() {
    const hasSort = this.sortColumn !== null || this.sortDirection !== 'desc';
    const f = this.columnFilters || {};
    const hasFilter = Object.keys(f).some(k => f[k] && f[k].length > 0);
    return hasSort || hasFilter;
  }

  getTotalPages() {
    return this.totalPages;
  }

  /* ------------------------------------------------------------------------
     Pagination: show result count in pagination bar
  ------------------------------------------------------------------------ */
  updatePaginationResultCount() {
    const pag = document.querySelector('.pagination.pagination-table');
    if (!pag) return;

    let badge = pag.querySelector('.pagination-result-count');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'pagination-result-count';
      pag.insertBefore(badge, pag.firstChild);
    }

    const total = this.filteredItems.length;
    if (total <= 0) {
      badge.textContent = '0 件';
      return;
    }

    const start = (this.currentPage - 1) * this.itemsPerPage + 1;
    const end = Math.min(this.currentPage * this.itemsPerPage, total);
    badge.textContent = `${start}-${end} / ${total} 件`;
  }

  /* ------------------------------------------------------------------------
     Column widths + resizing
  ------------------------------------------------------------------------ */
  applyDefaultColumnWidths() {
    const table = this.container.querySelector('#resultsTable');
    if (!table) return;

    const colgroup = table.querySelector('colgroup');
    if (!colgroup) return;

    const defaultW = {
      checkbox: 50,
      id: 60,
      code: 140,
      name: 280,
      dimensions: 140,
      location: 120,
      type: 90,
      date: 110,
      status: 130,
      actions: 60
    };

    Object.keys(defaultW).forEach(k => {
      const col = colgroup.querySelector(`col.col-${k}`);
      if (col) col.style.width = `${defaultW[k]}px`;
    });
  }

  getColumnColElement(columnKey) {
    const table = this.container.querySelector('#resultsTable');
    if (!table) return null;
    const colgroup = table.querySelector('colgroup');
    if (!colgroup) return null;
    return colgroup.querySelector(`col.col-${columnKey}`);
  }

  applySavedColumnWidths() {
    try {
      const raw = localStorage.getItem(this.colWidthStorageKey);
      if (!raw) return;
      const map = JSON.parse(raw);
      if (!map || typeof map !== 'object') return;

      Object.keys(map).forEach(k => {
        const w = Number(map[k]);
        if (!w || w < 20) return;
        const col = this.getColumnColElement(k);
        if (col) col.style.width = `${w}px`;
      });
    } catch (e) {
      // ignore
    }
  }

  saveColumnWidth(columnKey, widthPx) {
    try {
      const raw = localStorage.getItem(this.colWidthStorageKey);
      const map = raw ? JSON.parse(raw) : {};
      map[columnKey] = Math.round(widthPx);
      localStorage.setItem(this.colWidthStorageKey, JSON.stringify(map));
    } catch (e) {
      // ignore
    }
  }

  initColumnResizing() {
    const table = this.container.querySelector('#resultsTable');
    if (!table) return;

    const resizers = table.querySelectorAll('.col-resizer');
    if (!resizers || resizers.length === 0) return;

    resizers.forEach(handle => {
      handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const column = handle.dataset.column;
        if (!column) return;

        const colEl = this.getColumnColElement(column);
        if (!colEl) return;

        const startX = e.clientX;
        const thEl = handle.closest('th');
        const startW = thEl ? thEl.getBoundingClientRect().width : parseFloat(colEl.style.width || '0') || 80;

        const minW = this.getMinWidthForColumn(column);
        const maxW = 900;

        const onMove = (ev) => {
          if (ev.cancelable) ev.preventDefault(); // thêm dòng này
          const dx = ev.clientX - startX;
          let next = startW + dx;
          if (next < minW) next = minW;
          if (next > maxW) next = maxW;
          colEl.style.width = `${next}px`;
        };

        const onUp = (ev) => {
          document.removeEventListener('pointermove', onMove, true);
          document.removeEventListener('pointerup', onUp, true);
          document.removeEventListener('pointercancel', onUp, true);

          const finalW = parseFloat(colEl.style.width || '0');
          if (finalW) this.saveColumnWidth(column, finalW);
        };

        document.addEventListener('pointermove', onMove, true);
        document.addEventListener('pointerup', onUp, true);
        document.addEventListener('pointercancel', onUp, true);

        try { handle.setPointerCapture(e.pointerId); } catch(_) {}
      }, { passive: false });
    });
  }

  getMinWidthForColumn(column) {
    const min = {
      id: 38,
      code: 76,
      name: 120,
      dimensions: 84,
      location: 64
    };
    return min[column] || 40;
  }

  /* ------------------------------------------------------------------------
     Inject CSS (table UX)
  ------------------------------------------------------------------------ */
  injectTableUXStyles() {
    const styleId = 'rt-ux-style-v8-2-1';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.type = 'text/css';

    style.textContent = `
/* ===== Table UX patch (v8.2.1) ===== */
.results-table th{ position: relative; }

/* Header bilingual 2 lines */
.results-table th .th-content{ align-items: flex-start; }
.results-table th .th-label{ display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.results-table th .th-label .ja{ font-size: 11px; font-weight: 650; color: rgba(17,24,39,0.92); line-height: 1.05; }
.results-table th .th-label .vi{ font-size: 9px; font-weight: 500; color: rgba(71,85,105,0.82); line-height: 1.05; }

/* Code cell clickable */
.results-table td.col-code{ cursor: pointer; }

/* Focus Row for Mobile Assistive Touch */
.results-table tr.focused-row td {
  background: rgba(245, 158, 11, 0.15) !important; /* amber-500 light */
  position: relative;
}
.results-table tr.focused-row td:first-child::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  background: #F59E0B;
}

/* Resizer handle */
.results-table th .col-resizer{
  position: absolute;
  top: 0;
  right: -5px;
  bottom: 0;
  width: 12px;
  cursor: col-resize;
  touch-action: none;
  user-select: none;
  z-index: 30;
}
.results-table th .col-resizer::after{
  content: '';
  position: absolute;
  top: 18%;
  bottom: 18%;
  right: 5px;
  width: 2px;
  border-radius: 2px;
  background: rgba(71,85,105,0.35);
}

/* Modern action button */
.results-table .table-action-btn{
  width: 30px;
  height: 30px;
  border-radius: 10px;
  border: 1px solid rgba(2,6,23,0.12);
  background: rgba(255,255,255,0.96);
  color: var(--ui-accent-hover, #0A5C56);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s, border-color 0.15s;
}
.results-table .table-action-btn:hover{
  background: rgba(15,118,110,0.10);
  border-color: rgba(15,118,110,0.28);
  transform: translateY(-1px);
  box-shadow: 0 10px 18px rgba(2,6,23,0.14);
}

/* Popup spacing + Apply button contrast */
.filter-popup-header{ padding: 10px 12px !important; }
.filter-popup-body{ padding: 10px 0 !important; }
.filter-sort-section{ padding: 0 10px !important; gap: 4px !important; }
.filter-sort-btn{ padding: 7px 10px !important; border-radius: 10px !important; }
.filter-divider{ margin: 10px 0 !important; }
.filter-values-section{ padding: 0 10px !important; }
.filter-popup-footer{ padding: 10px 12px !important; }
.filter-apply-btn{ background: var(--ui-accent, #0F766E) !important; color: #fff !important; }
.filter-apply-btn:hover{ background: var(--ui-accent-hover, #0A5C56) !important; }

/* Pagination result count badge */
.pagination-result-count{
  font-size: 11px;
  font-weight: 650;
  color: rgba(17,24,39,0.80);
  padding: 6px 10px;
  border: 1px solid rgba(2,6,23,0.10);
  border-radius: 999px;
  background: rgba(255,255,255,0.92);
  margin-right: 6px;
  white-space: nowrap;
}

/* Mobile column sizing: ưu tiên checkbox, id, code, sản phẩm, kích thước, vị trí */
@media (max-width: 768px){
  /* Ẩn các cột ít quan trọng để không bị tràn */
  .results-table th.col-type, .results-table td.col-type,
  .results-table th.col-status, .results-table td.col-status{
    display: none !important;
  }

  .results-table{ min-width: 0 !important; width: 100% !important; }
  .results-table th, .results-table td{ padding: 6px 6px !important; font-size: 10px !important; }

  /* Thu nhỏ checkbox + ID */
  .results-table th.col-checkbox, .results-table td.col-checkbox{
    width: 34px !important;
    min-width: 34px !important;
    max-width: 34px !important;
  }
  .results-table th.col-id, .results-table td.col-id{
    width: 44px !important;
    min-width: 44px !important;
    max-width: 44px !important;
  }

  .results-table td.highlight-code{ font-size: 11px !important; }

  /* Thu nhỏ filter button */
  .column-filter-btn{ padding: 2px 6px !important; border-radius: 999px !important; font-size: 10px !important; }

  /* Checkbox size */
  .results-table input[type="checkbox"]{ width: 14px !important; height: 14px !important; }

  /* Resizer dễ kéo trên mobile */
  .results-table th .col-resizer{ width: 16px !important; right: -8px !important; }

  /* Fix sticky left của cột ID theo đúng width cột checkbox */
  .table-scroll-container.unlocked .results-table th.col-id,
  .table-scroll-container.unlocked .results-table td.col-id{
    left: var(--rt-sticky-left-id, 50px) !important;
  }

}
`;

    document.head.appendChild(style);
  }

  // ============== MENU ACTION ================
  openTableActionMenu(mouseEvent, item) {
    this.closeTableActionMenu();

    const menu = document.createElement('div');
    menu.className = 'table-action-menu-v8';
    menu.style.position = 'fixed';
    menu.style.zIndex = '40000';
    
    // Fluent UI adjustments 
    menu.style.background = 'rgba(255, 255, 255, 0.9)';
    menu.style.backdropFilter = 'blur(16px)';
    menu.style.WebkitBackdropFilter = 'blur(16px)';
    menu.style.border = '1px solid rgba(0, 0, 0, 0.08)';
    menu.style.borderRadius = '12px';
    menu.style.boxShadow = '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.04)';
    menu.style.padding = '8px';
    menu.style.width = '200px';

    // Calculate positioning (Cursor Bounds-Check)
    let left = mouseEvent.clientX;
    let top = mouseEvent.clientY;
    const menuWidth = 200;
    const estimatedHeight = 350;

    if (left + menuWidth > window.innerWidth) {
        left = window.innerWidth - menuWidth - 16;
    }
    if (top + estimatedHeight > window.innerHeight) {
        top = top - estimatedHeight - 16;
    }
    if (top < 10) top = 10;
    if (left < 10) left = 10;

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';

    const code = item.code || item.MoldCode || item.CutterNo || item.displayCode || '';
    const itemType = item.type || 'mold';

    // Styling chung của button con
    const btnStyle = "width:100%;padding:10px 12px;border-radius:8px;border:none;background:transparent;text-align:left;cursor:pointer;font-size:14px;font-weight:600;color:#334155;transition:all 0.2s;display:flex;align-items:center;gap:10px;";
    const hrStyle = "margin:6px 0;border:none;border-top:1px solid rgba(0,0,0,0.06);";

    menu.innerHTML = `
      <style>
          .tam-act:hover { background: rgba(0,0,0,0.05) !important; color: #0EA5E9 !important; padding-left: 16px !important; }
          .tam-act-danger:hover { background: #fee2e2 !important; color: #ef4444 !important; }
          .tam-act-primary { background: var(--ui-accent, #0ea5a0) !important; color: #fff !important; }
          .tam-act-primary:hover { filter: brightness(0.95); padding-left: 12px !important; }
      </style>
      <div style="font-weight:700;margin:6px 8px 10px 8px;font-size:13px;color:#64748b;letter-spacing:0.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${String(code)}
      </div>

      <button class="tam-act tam-act-primary" data-act="detail" style="${btnStyle}">
          <i class="fas fa-file-alt" style="width:18px;text-align:center;"></i> 詳細 / Chi tiết
      </button>
      
      <hr style="${hrStyle}">
      
      <button class="tam-act" data-act="checkin" style="${btnStyle}">
          <i class="fas fa-sign-in-alt" style="width:18px;text-align:center;"></i> 入庫 / Nhập kho
      </button>
      <button class="tam-act" data-act="checkout" style="${btnStyle}">
          <i class="fas fa-sign-out-alt" style="width:18px;text-align:center;"></i> 出庫 / Xuất kho
      </button>
      <button class="tam-act" data-act="inventory" style="${btnStyle}">
          <i class="fas fa-clipboard-check" style="width:18px;text-align:center;"></i> 棚卸 / Kiểm kê
      </button>
      
      <hr style="${hrStyle}">
      
      <button class="tam-act" data-act="qr" style="${btnStyle}">
          <i class="fas fa-qrcode" style="width:18px;text-align:center;"></i> QRコード / Mã QR
      </button>
      <button class="tam-act" data-act="move" style="${btnStyle}">
          <i class="fas fa-map-marker-alt" style="width:18px;text-align:center;"></i> 位置 / Vị trí
      </button>
      <button class="tam-act" data-act="open-storage-module" style="${btnStyle}">
          <i class="fas fa-box-open" style="width:18px;text-align:center;"></i> モジュール / Module
      </button>
      
      <hr style="${hrStyle}">
      
      <button class="tam-act tam-act-danger" data-act="close" style="${btnStyle}">
          <i class="fas fa-times" style="width:18px;text-align:center;"></i> 閉じる / Đóng
      </button>
    `;

    menu.querySelectorAll('.tam-act').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        const act = btn.dataset.act;
        this.closeTableActionMenu();

        if (act === 'close') return;

        if (act === 'detail') {
          if (this.onItemClick) this.onItemClick(item);
          return;
        }

        // 1) Các action chuẩn: phát event quick-action
        if (['checkin','checkout','inventory','move','print'].includes(act)) {
          document.dispatchEvent(new CustomEvent('quick-action', {
              detail: { action: act, item, itemType }
          }));
          return;
        }

        // Module lấy QR trực tiếp
        if (act === 'qr') {
          if (window.ExportQR && typeof window.ExportQR.generate === 'function') {
              window.ExportQR.generate(item);
          } else {
              alert('Module Tạo ảnh QR chưa tải xong.');
          }
          return;
        }

        // 2) Mở kho tương lai
        if (act === 'open-storage-module') {
          const moldId = item.MoldID || item.MoldCode || item.CutterID || item.CutterNo || '';
          document.dispatchEvent(new CustomEvent('module:open', {
              detail: { module: 'storage', moldId, mold: item, from: 'TableActionMenu' }
          }));
          return;
        }
      });
    });

    const triggerTarget = mouseEvent.target || mouseEvent;
    const onOutside = (ev) => {
      if (!menu.contains(ev.target) && ev.target !== triggerTarget) {
        this.closeTableActionMenu();
        document.removeEventListener('click', onOutside, true);
      }
    };
    document.addEventListener('click', onOutside, true);

    document.body.appendChild(menu);
    this._tableActionMenuEl = menu;
  }

  closeTableActionMenu() {
    if (this._tableActionMenuEl) {
        this._tableActionMenuEl.remove();
        this._tableActionMenuEl = null;
    }
  }

}

// Export to window
window.ResultsTableRenderer = ResultsTableRenderer;

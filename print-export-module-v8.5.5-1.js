/* ============================================================================
   PRINT / EXPORT MODULE v8.5.5-1
   Features:
   - Handle Print (render printable HTML table)
   - Handle Export to Excel (CSV with BOM)
   - Dynamic columns: No, Mã, Tên sản phẩm, Kích thước, Trọng lượng, Vị trí, trạng thái, ngày cập nhật, ID
============================================================================ */

class PrintExportModule {
  constructor() {
    this.selectedItems = [];
    console.log('✅ PrintExportModule v8.5.5-1 initialized');
  }

  /**
   * Mở hộp thoại chọn hành động
   * @param {Array} selectedIds Danh sách ID đang được chọn
   * @param {Array} allItems Danh sách tất cả items (hoặc filtered items)
   */
  openDialog(selectedIds, allItems) {
    if (!selectedIds || selectedIds.length === 0) {
      alert('Không có bản ghi nào được chọn! / 選択されたアイテムがありません');
      return;
    }

    // V8.5 Lọc ra danh sách item đầy đủ: Sử dụng mảng global từ App để không bị sót khi user filter nhiều lần
    const baseItems = (window.app && window.app.allItems && window.app.allItems.length > 0) ? window.app.allItems : allItems;
    
    this.selectedItems = baseItems.filter(item => {
      const id = item.type === 'mold' ? item.MoldID : item.CutterID;
      const uid = (item.type === 'mold' ? 'M_' : 'C_') + id;
      return selectedIds.includes(String(uid));
    });

    if (this.selectedItems.length === 0) return;

    this.renderDialog();
  }

  renderDialog() {
    this.closeDialog(); // clear old

    const overlay = document.createElement('div');
    overlay.className = 'pe-modal-backdrop';
    overlay.id = 'printExportModal';

    const html = `
      <div class="pe-modal">
        <div class="pe-modal-header">
          <span class="pe-modal-title">処理選択</span>
          <button class="pe-close-btn" id="peCloseBtn">&times;</button>
        </div>
        <div class="pe-modal-body">
          <div class="pe-modal-desc">
            選択された <b>${this.selectedItems.length}</b> 件のデータをどう処理しますか？
          </div>
          <div class="pe-modal-actions">
            <button class="pe-btn pe-btn-print" id="pePrintBtn">
              <i class="fas fa-print"></i> 印刷
            </button>
            <button class="pe-btn pe-btn-export" id="peExportBtn">
              <i class="fas fa-file-excel"></i> Excel出力
            </button>
          </div>
        </div>
      </div>
    `;
    
    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    document.getElementById('peCloseBtn').addEventListener('click', () => this.closeDialog());
    document.getElementById('pePrintBtn').addEventListener('click', () => {
      this.closeDialog();
      this.executePrint();
    });
    document.getElementById('peExportBtn').addEventListener('click', () => {
      this.closeDialog();
      this.executeExportExcel();
    });
  }

  closeDialog() {
    const modal = document.getElementById('printExportModal');
    if (modal) modal.remove();
  }

  // --- Helpers for Display ---

  getProductName(item) {
    if (item.designInfo && item.designInfo.TrayInfoForMoldDesign) return item.designInfo.TrayInfoForMoldDesign;
    if (item.type === 'mold') return item.MoldName || '';
    return item.CutterName || item.CutterDesignName || '';
  }

  getRackLocation(item) {
    if (!window.DataManager || !window.DataManager.data) return '-';
    const rackLayerId = item.RackLayerID;
    if (!rackLayerId) return '-';
    const rackLayer = window.DataManager.data.racklayers?.find(rl => String(rl.RackLayerID).trim() === String(rackLayerId).trim());
    if (!rackLayer) return '-';
    const rack = window.DataManager.data.racks?.find(r => String(r.RackID).trim() === String(rackLayer.RackID).trim());
    const rackName = rack?.RackName || rackLayer.RackID;
    return `${rackName}-${rackLayer.RackLayerNumber}`;
  }

  getLatestStatus(item) {
    if (!window.DataManager || !window.DataManager.data || !window.DataManager.data.statuslogs) {
      return { status: '', date: '' };
    }
    const idField = item.type === 'mold' ? 'MoldID' : 'CutterID';
    const itemId = item.type === 'mold' ? item.MoldID : item.CutterID;
    
    const logs = window.DataManager.data.statuslogs.filter(log => String(log[idField] || '').trim() === String(itemId).trim());
    if (!logs || logs.length === 0) return { status: '', date: '' };

    logs.sort((a, b) => new Date(b.Timestamp || 0) - new Date(a.Timestamp || 0));
    
    const latest = logs[0];
    let stText = latest.Status || '';
    const map = {
      'IN': '入庫', 'OUT': '出庫', 'AUDIT': '棚卸', 'DISPOSED': '廃棄', 'RETURNED': '返却'
    };
    if (map[String(stText).toUpperCase()]) stText = map[String(stText).toUpperCase()];
    
    let dateStr = '';
    if (latest.Timestamp) {
      const d = new Date(latest.Timestamp);
      if(!isNaN(d)) {
        dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
      }
    }
    return { status: stText, date: dateStr };
  }

  // --- Helpers for Display ---

  getMoldWeight(item) {
    if (item.type !== 'mold') return '-';
    const w = item.MoldWeightModified || item.MoldWeight;
    if (w) return w + ' kg';
    return '-';
  }

  // --- Build Table Data ---
  buildDataRows() {
    return this.selectedItems.map((item, index) => {
      const id = item.type === 'mold' ? item.MoldID : item.CutterID;
      const code = item.type === 'mold' ? (item.MoldCode || '') : (item.CutterNo || '');
      const name = this.getProductName(item);
      const dimensions = item.dimensions || '';
      const weight = this.getMoldWeight(item);
      const location = this.getRackLocation(item);
      const { status, date } = this.getLatestStatus(item);

      return {
        no: index + 1,
        code,
        name,
        dimensions,
        weight,
        location,
        status,
        date,
        id
      };
    });
  }

  // --- PRINT LOGIC ---
  executePrint() {
    let printArea = document.getElementById('printArea');
    if (!printArea) {
      printArea = document.createElement('div');
      printArea.id = 'printArea';
      document.body.appendChild(printArea);
    }

    const rows = this.buildDataRows();
    const dateStr = new Date().toLocaleString('ja-JP');

    let tableHtml = `
      <div class="pe-print-title">印刷リスト</div>
      <div class="pe-print-date">日時: ${dateStr}</div>
      <table class="pe-print-table">
        <thead>
          <tr>
            <th style="width: 5%">No.</th>
            <th style="width: 14%">コード</th>
            <th style="width: 25%">製品名</th>
            <th style="width: 13%">寸法</th>
            <th style="width: 9%">重量</th>
            <th style="width: 9%">位置</th>
            <th style="width: 9%">状態</th>
            <th style="width: 10%">更新日</th>
            <th style="width: 6%">ID</th>
          </tr>
        </thead>
        <tbody>
    `;

    rows.forEach(r => {
      tableHtml += `
        <tr>
          <td>${r.no}</td>
          <td>${r.code}</td>
          <td>${r.name}</td>
          <td>${r.dimensions}</td>
          <td>${r.weight}</td>
          <td>${r.location}</td>
          <td>${r.status}</td>
          <td>${r.date}</td>
          <td>${r.id}</td>
        </tr>
      `;
    });

    tableHtml += `</tbody></table>`;
    printArea.innerHTML = tableHtml;

    setTimeout(() => {
      window.print();
      // Clean up DOM after print dialog
      setTimeout(() => {
        if (printArea && printArea.parentNode) {
          printArea.parentNode.removeChild(printArea);
        }
      }, 500);
    }, 300);
  }

  // --- EXPORT logic (Native XLSX via ExcelJS) ---
  async executeExportExcel() {
    if (typeof ExcelJS === 'undefined') {
      alert('Thư viện ExcelJS đang được tải, vui lòng thử lại sau 1 giây...');
      return;
    }

    const rows = this.buildDataRows();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Export Data', {
      views: [{ showGridLines: false }] // Ẩn đường lưới mặc định của Excel
    });

    // Cấu hình in ấn A4 và lề trang (thông số là inches: mm / 25.4)
    sheet.pageSetup = {
      paperSize: 9, // A4
      orientation: 'portrait',
      margins: {
        left: 15 / 25.4,   // 15mm (1.5cm)
        top: 20 / 25.4,    // 20mm
        right: 15 / 25.4,  // 15mm
        bottom: 15 / 25.4, // 15mm
        header: 0.3,
        footer: 0.3
      }
    };

    // Hàm quy đổi Pixel sang Excel Character Width (chuẩn Calibri/Meiryo 11pt)
    // Excel Char Width = (Pixels - 5) / 7
    const pxToChar = (px) => (px - 5) / 7;

    // Thiết lập cấu hình các cột theo chính xác thông số Pixel User
    sheet.columns = [
      { header: 'No.', key: 'no', width: pxToChar(44) },
      { header: 'コード', key: 'code', width: pxToChar(85) },
      { header: '製品名', key: 'name', width: pxToChar(160) },
      { header: '寸法', key: 'dimensions', width: pxToChar(90) },
      { header: '重量', key: 'weight', width: pxToChar(60) },
      { header: '位置', key: 'location', width: pxToChar(52) },
      { header: '状態', key: 'status', width: pxToChar(57) },
      { header: '更新日', key: 'date', width: pxToChar(85) },
      { header: 'ID', key: 'id', width: pxToChar(55) }
    ];

    // Định dạng dòng Header (Title)
    const headerRow = sheet.getRow(1);
    headerRow.height = 20;
    headerRow.eachCell((cell, colNumber) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F4F6' } // Nền xám nhạt
      };
      cell.font = { name: 'Meiryo UI', size: 9, bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      
      if (colNumber === 1 || colNumber === 9) {
        cell.font = { name: 'Meiryo UI', size: 8, bold: true };
      }
      // Bỏ hẳn kẻ khung theo yêu cầu (Không thiết lập cell.border)
    });

    // Thêm dữ liệu từng dòng
    rows.forEach(r => {
      const row = sheet.addRow(r);
      row.height = 28; // Cao 28pt chứa được 2 dòng font 9

      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Meiryo UI', size: 9 };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        // Không kẻ viền

        // Căn giữa cho No.(1), Kích thước(4), Trọng lượng(5), Vị trí(6), Trạng thái(7), ID(9)
        if ([1, 4, 5, 6, 7, 9].includes(colNumber)) {
          cell.alignment.horizontal = 'center';
        }

        // Ngày cập nhật (8) - Nếu User muốn căn ngang trái thì vẫn giữ nguyên, nhưng để đẹp mình set center nếu cần.
        // Tạm thời giữ nguyên left như mô tả ngầm, chỉ căn giữa các cột chỉ định ở trên.

        // Định dạng dành riêng cho cột No.(1) và ID(9): Font size 8
        if (colNumber === 1 || colNumber === 9) {
          cell.font = { name: 'Meiryo UI', size: 8 };
        }
      });
    });

    // Ép kiểu cho cột mã và các dữ liệu string để phòng trường hợp Excel tự nuốt số 0
    sheet.getColumn('code').numFmt = '@';
    sheet.getColumn('dimensions').numFmt = '@';
    sheet.getColumn('location').numFmt = '@';

    // Xuất file Binary Native XLSX
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    
    const dStr = new Date().toISOString().slice(0,10).replace(/-/g, '');
    const fileName = `ExportList_${dStr}.xlsx`;

    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Global initialization
window.PrintExportModule = new PrintExportModule();

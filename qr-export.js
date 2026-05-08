// v10.0.1
/**
 * qr-export.js
 * ===========================================================
 * Module xuất mã QR nâng cấp (Single & Mass Export)
 * Sử dụng thư viện qrcode.js (Local) để sinh QR an toàn.
 * Hỗ trợ in theo lưới A4 (Grid). Ngôn ngữ chính: Tiếng Nhật.
 */

(function () {
  'use strict';

  class ExportQR {
    constructor() {
      this.initialized = false;
    }

    init() {
      if (this.initialized) return;
      this.injectStyles();
      this.initialized = true;
    }

    // --- UTILS ---
    detectItemType(item) {
      const rawType = (item.itemType || '').toLowerCase();
      let type = '';

      if (rawType === 'mold') {
        type = 'mold';
      } else if (rawType === 'cutter') {
        type = 'cutter';
      } else if (item.MoldID || item.MoldCode) {
        type = 'mold';
      } else if (item.CutterID || item.CutterCode || item.CutterNo) {
        type = 'cutter';
      } else {
        return null;
      }

      if (type === 'mold') {
        const id = String(item.MoldID || '').trim();
        const code = String(item.MoldCode || '').trim();
        const name = String(item.MoldName || '').trim();
        if (!id || !code) return null;
        return { type: 'mold', id, code, name, typeLabel: '金型 / Khuôn' };
      } else {
        const id = String(item.CutterID || '').trim();
        const code = String(item.CutterCode || item.CutterNo || '').trim();
        const name = String(item.CutterName || item.Name || '').trim();
        if (!id || !code) return null;
        return { type: 'cutter', id, code, name, typeLabel: '刃型 / Dao cắt' };
      }
    }

    buildPayload(type, id) {
      const typeCode = type === 'mold' ? 'M' : 'C';
      const safeId = (id || '').replace(/\s+/g, '');
      // BẮT BUỘC dùng domain thực tế để QR có thể quét được bằng điện thoại, mở web tương thích
      return `https://ysd-pack.pages.dev/?q=${typeCode}${encodeURIComponent(safeId)}`;
    }

    generateLocalQR(payload, size) {
      const tempDiv = document.createElement('div');
      try {
        new window.QRCode(tempDiv, {
          text: payload,
          width: size,
          height: size,
          colorDark: "#000000",
          colorLight: "#ffffff",
          correctLevel: window.QRCode.CorrectLevel.M
        });
        const canvas = tempDiv.querySelector('canvas');
        if (canvas) return canvas.toDataURL("image/png");
      } catch (e) {
        console.error('Lỗi tạo mã QR cục bộ:', e);
      }
      return '';
    }

    async copyQRToClipboard(dataUrl) {
      try {
        const res = await fetch(dataUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type]: blob
          })
        ]);
        alert('コピーしました！ / Đã sao chép vào clipboard!');
      } catch (err) {
        console.error(err);
        alert('コピーに失敗しました / Lỗi sao chép.');
      }
    }

    // --- SINGLE EXPORT ---
    generate(item) {
      this.init();
      if (!item) {
        alert('対象が選択されていません。\nChưa chọn khuôn hoặc dao cắt.');
        return;
      }

      const typeInfo = this.detectItemType(item);
      if (!typeInfo) {
        alert('QRコード用のID/コードが見つかりません。\nKhông tìm thấy ID/Code để tạo QR.');
        return;
      }

      this.openSingleModal(typeInfo);
    }

    openSingleModal(typeInfo) {
      this.closeModal('qrSingleModal');

      const payload = this.buildPayload(typeInfo.type, typeInfo.id);
      const defaultSize = 300;
      let currentDataUrl = this.generateLocalQR(payload, defaultSize);

      const typeCode = typeInfo.type === 'mold' ? 'MOLD' : 'CUTTER';
      const fileName = `MCQR_${typeCode}_${typeInfo.id}_${typeInfo.code}_${defaultSize}.png`;

      const overlay = document.createElement('div');
      overlay.className = 'qre-modal-backdrop';
      overlay.id = 'qrSingleModal';

      overlay.innerHTML = `
        <div class="qre-modal">
          <div class="qre-modal-header">
            <h3>QRコード出力 / QR Export</h3>
            <button class="qre-close-btn" id="qrSingleClose">&times;</button>
          </div>
          <div class="qre-modal-body">
            <div class="qre-info-box">
              <strong>${typeInfo.typeLabel}</strong>
              <div>ID: ${typeInfo.id}</div>
              <div>Code: ${typeInfo.code}</div>
              <div style="font-size: 0.9em; color: #666; margin-top: 4px;">${typeInfo.name}</div>
            </div>
            
            <div class="qre-preview">
              <img src="${currentDataUrl}" alt="QR Code" id="qrSingleImg" style="width: 200px; height: 200px; border: 1px solid #ccc; padding: 10px; border-radius: 8px;">
            </div>

            <div class="qre-controls">
              <label>サイズ / Kích thước (px):</label>
              <select id="qrSingleSize">
                <option value="150">150 x 150</option>
                <option value="300" selected>300 x 300</option>
                <option value="600">600 x 600</option>
              </select>
            </div>

            <div class="qre-actions">
              <a href="${currentDataUrl}" download="${fileName}" class="qre-btn qre-btn-download" id="qrSingleDownload">
                <i class="fas fa-download"></i> ダウンロード <br><small>Tải xuống</small>
              </a>
              <button class="qre-btn qre-btn-copy" id="qrSingleCopy">
                <i class="fas fa-copy"></i> コピー <br><small>Sao chép</small>
              </button>
              <button class="qre-btn qre-btn-print" id="qrSinglePrint">
                <i class="fas fa-print"></i> 印刷 <br><small>In thẻ</small>
              </button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // Events
      document.getElementById('qrSingleClose').addEventListener('click', () => this.closeModal('qrSingleModal'));
      
      const sizeSelect = document.getElementById('qrSingleSize');
      const imgEl = document.getElementById('qrSingleImg');
      const downloadEl = document.getElementById('qrSingleDownload');

      sizeSelect.addEventListener('change', (e) => {
        const newSize = parseInt(e.target.value, 10);
        currentDataUrl = this.generateLocalQR(payload, newSize);
        imgEl.src = currentDataUrl;
        downloadEl.href = currentDataUrl;
        downloadEl.download = `MCQR_${typeCode}_${typeInfo.id}_${typeInfo.code}_${newSize}.png`;
      });

      document.getElementById('qrSingleCopy').addEventListener('click', () => {
        this.copyQRToClipboard(currentDataUrl);
      });

      document.getElementById('qrSinglePrint').addEventListener('click', () => {
        this.printSingle(typeInfo, payload, sizeSelect.value);
      });

      if (window.SwipeHistoryTrap) {
        window.SwipeHistoryTrap.push('qrSingleModal', () => this.closeModal('qrSingleModal'));
      }
    }

    printSingle(typeInfo, payload, size) {
      const jpgUrl = this.generateLocalQR(payload, size);
      const win = window.open('', '_blank', 'width=800,height=600');
      if (!win) {
        alert('Cửa sổ in bị chặn. Vui lòng cho phép popup.');
        return;
      }

      const html = `
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <title>印刷 / In QR: ${typeInfo.code}</title>
          <style>
            body { margin: 0; padding: 20px; font-family: sans-serif; text-align: center; }
            .info { margin-bottom: 16px; font-size: 16px; line-height: 1.5; }
            .info strong { display: block; font-size: 20px; margin-bottom: 8px; }
            img { width: ${size}px; height: ${size}px; }
            @media print { body { margin: 0; padding: 0; } }
          </style>
        </head>
        <body>
          <div class="info">
            <strong>${typeInfo.typeLabel}</strong>
            <div>ID: ${typeInfo.id} - Code: ${typeInfo.code}</div>
            <div>${typeInfo.name}</div>
          </div>
          <div>
            <img src="${jpgUrl}" alt="QR">
          </div>
          <script>
            window.onload = () => { setTimeout(() => window.print(), 300); };
          </script>
        </body>
        </html>
      `;
      win.document.open();
      win.document.write(html);
      win.document.close();
    }

    // --- MASS EXPORT ---
    generateMass(items) {
      this.init();
      if (!items || items.length === 0) {
        alert('選択されたアイテムがありません。\nKhông có bản ghi nào được chọn!');
        return;
      }

      const validItems = items.map(item => this.detectItemType(item)).filter(Boolean);
      if (validItems.length === 0) {
        alert('IDまたはコードを抽出できません。\nKhông thể trích xuất ID/Code.');
        return;
      }

      this.openMassModal(validItems);
    }

    openMassModal(validItems) {
      this.closeModal('qrMassModal');

      const overlay = document.createElement('div');
      overlay.className = 'qre-modal-backdrop';
      overlay.id = 'qrMassModal';

      overlay.innerHTML = `
        <div class="qre-modal">
          <div class="qre-modal-header">
            <h3>一括印刷設定 / Cấu hình In (${validItems.length} thẻ)</h3>
            <button class="qre-close-btn" id="qrMassClose">&times;</button>
          </div>
          <div class="qre-modal-body">
            
            <div class="qre-config-grid">
              <div class="qre-config-item">
                <label>サイズ / Kích thước (mm):</label>
                <select id="qrMassSize">
                  <option value="30">30 x 30 mm (小 / Nhỏ)</option>
                  <option value="40" selected>40 x 40 mm (中 / Vừa)</option>
                  <option value="50">50 x 50 mm (大 / Lớn)</option>
                </select>
              </div>
              <div class="qre-config-item">
                <label>用紙サイズ / Khổ giấy:</label>
                <select id="qrMassPaper" disabled>
                  <option value="A4">A4 (210 x 297 mm)</option>
                </select>
              </div>
              <div class="qre-config-item">
                <label>表示項目 / Ghi chú trên tem:</label>
                <div style="font-size: 14px; margin-top: 8px;">
                  <label style="display:flex; align-items:center; margin-bottom:6px; cursor:pointer;">
                    <input type="checkbox" id="qrMassShowCode" checked style="margin-right:8px; width:16px; height:16px;"> 
                    機器コード (Mã thiết bị)
                  </label>
                  <label style="display:flex; align-items:center; cursor:pointer;">
                    <input type="checkbox" id="qrMassShowName" checked style="margin-right:8px; width:16px; height:16px;"> 
                    機器名 (Tên thiết bị)
                  </label>
                </div>
              </div>
            </div>

            <div class="qre-actions" style="margin-top: 24px;">
              <button class="qre-btn qre-btn-close" id="qrMassCloseBtn">
                <i class="fas fa-times"></i> 閉じる <br><small>Đóng</small>
              </button>
              <button class="qre-btn qre-btn-print" id="qrMassPrint">
                <i class="fas fa-print"></i> 印刷プレビュー <br><small>Tạo bản in A4</small>
              </button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      document.getElementById('qrMassClose').addEventListener('click', () => this.closeModal('qrMassModal'));
      document.getElementById('qrMassCloseBtn').addEventListener('click', () => this.closeModal('qrMassModal'));
      
      document.getElementById('qrMassPrint').addEventListener('click', () => {
        const sizeMm = parseInt(document.getElementById('qrMassSize').value, 10);
        const showCode = document.getElementById('qrMassShowCode').checked;
        const showName = document.getElementById('qrMassShowName').checked;
        this.printMass(validItems, sizeMm, showCode, showName);
      });

      if (window.SwipeHistoryTrap) {
        window.SwipeHistoryTrap.push('qrMassModal', () => this.closeModal('qrMassModal'));
      }
    }

    printMass(validItems, sizeMm, showCode, showName) {
      const win = window.open('', '_blank');
      if (!win) {
        alert('Cửa sổ in bị chặn. Vui lòng cho phép popup.');
        return;
      }

      // Render từng thẻ
      let labelsHtml = '';
      validItems.forEach(item => {
        const payload = this.buildPayload(item.type, item.id);
        const dataUrl = this.generateLocalQR(payload, 300);

        let textHtml = '';
        if (showCode) textHtml += \`<div class="lbl-code">\${item.code}</div>\`;
        if (showName) textHtml += \`<div class="lbl-name">\${item.name}</div>\`;

        labelsHtml += \`
          <div class="qr-label" style="width: \${sizeMm}mm;">
            <img src="\${dataUrl}" alt="QR">
            \${textHtml}
          </div>
        \`;
      });

      const html = \`
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <title>一括印刷 / Mass Print QR (\${validItems.length})</title>
          <style>
            @page {
              size: A4;
              margin: 10mm;
            }
            body {
              margin: 0;
              padding: 0;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              background: #fff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .grid-container {
              display: grid;
              grid-template-columns: repeat(auto-fill, minmax(\${sizeMm}mm, 1fr));
              gap: 10mm 5mm;
              justify-content: center;
              padding: 10mm;
            }
            .qr-label {
              display: flex;
              flex-direction: column;
              align-items: center;
              text-align: center;
              border: 1px dashed #ccc;
              padding: 4mm;
              box-sizing: border-box;
              page-break-inside: avoid;
            }
            .qr-label img {
              width: 100%;
              height: auto;
              aspect-ratio: 1/1;
              margin-bottom: 2mm;
            }
            .lbl-code {
              font-size: 10pt;
              font-weight: bold;
              word-break: break-all;
              line-height: 1.2;
            }
            .lbl-name {
              font-size: 8pt;
              color: #333;
              margin-top: 1mm;
              display: -webkit-box;
              -webkit-line-clamp: 2;
              -webkit-box-orient: vertical;
              overflow: hidden;
              line-height: 1.2;
            }
            @media print {
              .grid-container {
                padding: 0;
                gap: 5mm;
              }
              .qr-label {
                border: 0.5px dotted #999;
              }
            }
          </style>
        </head>
        <body>
          <div class="grid-container">
            \${labelsHtml}
          </div>
          <script>
            window.onload = () => { setTimeout(() => window.print(), 500); };
          </script>
        </body>
        </html>
      \`;
      win.document.open();
      win.document.write(html);
      win.document.close();
    }

    // --- COMMON ---
    closeModal(id) {
      const el = document.getElementById(id);
      if (el) el.remove();
      if (window.SwipeHistoryTrap) window.SwipeHistoryTrap.remove(id);
    }

    injectStyles() {
      if (document.getElementById('export-qr-v2-styles')) return;
      const style = document.createElement('style');
      style.id = 'export-qr-v2-styles';
      style.textContent = \`
        .qre-modal-backdrop {
          position: fixed; inset: 0; z-index: 11000;
          display: flex; align-items: center; justify-content: center;
          background: rgba(0,0,0,0.5); backdrop-filter: blur(4px);
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .qre-modal {
          background: #fff; width: 90%; max-width: 420px;
          border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);
          overflow: hidden; display: flex; flex-direction: column;
          animation: qreModalIn 0.2s ease-out;
        }
        @keyframes qreModalIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .qre-modal-header {
          display: flex; justify-content: space-between; align-items: center;
          padding: 16px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;
        }
        .qre-modal-header h3 { margin: 0; font-size: 16px; color: #1e293b; }
        .qre-close-btn {
          background: transparent; border: none; font-size: 24px; line-height: 1;
          color: #64748b; cursor: pointer; padding: 0; margin: 0;
        }
        .qre-modal-body { padding: 20px; }
        .qre-info-box {
          background: #f1f5f9; padding: 12px; border-radius: 8px; margin-bottom: 16px;
          font-size: 14px; color: #334155; line-height: 1.5;
        }
        .qre-info-box strong { display: block; color: #0f172a; font-size: 15px; margin-bottom: 4px; }
        .qre-preview { display: flex; justify-content: center; margin-bottom: 16px; }
        .qre-controls { margin-bottom: 20px; }
        .qre-controls label { display: block; font-size: 13px; color: #64748b; margin-bottom: 6px; font-weight: 500;}
        .qre-controls select {
          width: 100%; padding: 8px 12px; border: 1px solid #cbd5e1;
          border-radius: 6px; font-size: 14px; color: #1e293b;
          outline: none; background: #fff;
        }
        .qre-actions { display: flex; gap: 10px; }
        .qre-btn {
          flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 10px 8px; border: none; border-radius: 8px;
          font-size: 14px; font-weight: 600; cursor: pointer;
          text-decoration: none; transition: all 0.2s; line-height: 1.2;
        }
        .qre-btn i { font-size: 18px; margin-bottom: 4px; }
        .qre-btn small { font-size: 11px; opacity: 0.8; font-weight: normal; margin-top: 2px;}
        
        .qre-btn-download { background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
        .qre-btn-download:hover { background: #dbeafe; }
        .qre-btn-copy { background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; }
        .qre-btn-copy:hover { background: #f1f5f9; }
        .qre-btn-print { background: #2563eb; color: #fff; }
        .qre-btn-print:hover { background: #1d4ed8; }
        .qre-btn-close { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }
        .qre-btn-close:hover { background: #e2e8f0; }
        
        .qre-config-grid { display: flex; flex-direction: column; gap: 16px; }
        .qre-config-item label { display: block; font-size: 13px; color: #64748b; margin-bottom: 6px; font-weight: 500; }
        .qre-config-item select { width: 100%; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; }
      \`;
      document.head.appendChild(style);
    }
  }

  window.ExportQR = new ExportQR();

  // Compat for existing events
  document.addEventListener('triggerQRCode', (e) => {
    const detail = e.detail || {};
    if (detail.item) {
      window.ExportQR.generate(detail.item);
    }
  });

})();

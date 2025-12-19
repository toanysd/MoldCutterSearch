/**
 * export-qr-r7.0.8.js
 * ===========================================================
 * Module xuất mã QR cho Mold / Cutter (金型 / 刃型)
 * - Gọi từ action-buttons (iPad): window.ExportQR.generate(currentItem)
 * - Gọi từ MobileDetailModal:    window.ExportQR.generate(item)
 * 
 * Chức năng:
 *  - Sinh nội dung QR:
 *      + Mold:   MCQR|MOLD|<MoldID>|<MoldCode>
 *      + Cutter: MCQR|CUTTER|<CutterID>|<CutterCode>
 *  - Hiển thị popup preview QR (song ngữ Nhật – Việt)
 *  - Cho phép chọn kích thước QR tiêu chuẩn (150 / 300 / 600 px)
 *  - In trực tiếp QR (mở cửa sổ in)
 *  - Tải về file JPG (download) để gắn vào tài liệu
 * 
 * Ghi chú:
 *  - Sử dụng dịch vụ QR public (api.qrserver.com) để sinh ảnh QR.
 *  - Không phụ thuộc DataManager; chỉ cần object item hiện tại.
 *  - Không yêu cầu chỉnh sửa các file mã nguồn khác.
 * ===========================================================
 */

(function () {
  'use strict';

  const QR_API_BASE = 'https://api.qrserver.com/v1/create-qr-code/';

  const ExportQR = {
    state: {
      initialized: false,
      modal: null,
      backdrop: null,
      dialog: null,
      img: null,
      titleEl: null,
      infoTypeEl: null,
      infoIdEl: null,
      infoCodeEl: null,
      infoNameEl: null,
      sizeSelect: null,
      downloadBtn: null,
      printBtn: null,
      closeButtons: [],
      currentPayload: '',
      currentType: '',
      currentId: '',
      currentCode: '',
      currentName: '',
      currentSize: 300,
      currentJpgUrl: ''
    },

    /**
     * Public API: generate QR for given item
     * @param {Object} item - mold/cutter object hiện tại
     */
    generate(item) {
      if (!item) {
        alert('対象が選択されていません。\nChưa chọn khuôn hoặc dao cắt.');
        return;
      }
      if (!this.state.initialized) {
        this.init();
      }

      const typeInfo = this.detectItemType(item);
      if (!typeInfo) {
        alert('QRコード用のID/コードが見つかりません。\nKhông tìm thấy ID/Code để tạo QR.');
        return;
      }

      const { type, id, code, name, typeLabel } = typeInfo;

      // Build payload: MCQR|MOLD|MoldID|MoldCode  or  MCQR|CUTTER|CutterID|CutterCode
      const payload = this.buildPayload(type, id, code);

      // Lưu state hiện tại để tái tạo khi đổi size
      this.state.currentType = type;
      this.state.currentId = id;
      this.state.currentCode = code;
      this.state.currentName = name;
      this.state.currentPayload = payload;

      // Đồng bộ thông tin hiển thị
      this.updateInfoHeader(typeLabel, id, code, name);

      // Lấy size hiện tại (nếu user đã chọn)
      const size = this.getCurrentSize();
      this.state.currentSize = size;

      // Cập nhật preview và link JPG
      this.updatePreviewAndLinks();

      // Mở modal
      this.openModal();
    },

    /**
     * Khởi tạo: chèn CSS + HTML modal và gắn event handlers
     */
    init() {
      if (this.state.initialized) return;

      this.injectStyles();
      this.createModalStructure();
      this.bindEvents();

      // ✅ LẮNG NGHE SỰ KIỆN TỪ MobileDetailModal & các module khác
      document.addEventListener('triggerQRCode', (e) => {
        const detail = e.detail || {};
        const item = detail.item;
        const source = detail.source || 'unknown';
        const type = detail.type || '';
        console.log('[ExportQR] triggerQRCode received from', source, 'type:', type);
        if (item) {
          ExportQR.generate(item);
        } else {
          console.warn('[ExportQR] triggerQRCode without item detail');
        }
      });

      this.state.initialized = true;
      console.log('[ExportQR] Initialized');
    },

    /**
     * Xác định loại item (mold / cutter) và lấy ID/Code/Name
     */
    detectItemType(item) {
      // Ưu tiên field itemType nếu có
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
        return {
          type: 'mold',
          id,
          code,
          name,
          typeLabel: '金型 / Khuôn'
        };
      } else {
        const id = String(item.CutterID || '').trim();
        // CutterCode có thể trống, ưu tiên CutterCode, sau đó đến CutterNo
        const code = String(item.CutterCode || item.CutterNo || '').trim();
        const name = String(item.CutterName || item.Name || '').trim();
        if (!id || !code) return null;
        return {
          type: 'cutter',
          id,
          code,
          name,
          typeLabel: '刃型 / Dao cắt'
        };
      }
    },

    /**
     * Sinh payload QR chuẩn cho module scan ở trang chính
     * @param {'mold'|'cutter'} type
     * @param {string} id
     * @param {string} code
     */
    buildPayload(type, id, code) {
      const upperType = type === 'mold' ? 'MOLD' : 'CUTTER';
      // Đảm bảo không có ký tự xuống dòng
      const safeId = (id || '').replace(/\s+/g, '');
      const safeCode = (code || '').replace(/\s+/g, '');
      return `MCQR|${upperType}|${safeId}|${safeCode}`;
    },

    /**
     * Cập nhật thông tin text trên header modal
     */
    updateInfoHeader(typeLabel, id, code, name) {
      if (!this.state.modal) return;
      if (this.state.infoTypeEl) {
        this.state.infoTypeEl.textContent = typeLabel;
      }
      if (this.state.infoIdEl) {
        this.state.infoIdEl.textContent = `ID: ${id}`;
      }
      if (this.state.infoCodeEl) {
        this.state.infoCodeEl.textContent = `Code: ${code}`;
      }
      if (this.state.infoNameEl) {
        this.state.infoNameEl.textContent = name || '-';
      }
    },

    /**
     * Lấy kích thước hiện tại từ select (default: 300)
     */
    getCurrentSize() {
      if (this.state.sizeSelect) {
        const val = parseInt(this.state.sizeSelect.value, 10);
        if (!isNaN(val) && val > 0) return val;
      }
      return 300;
    },

    /**
     * Tạo URL ảnh QR (PNG cho preview, JPG cho download/print)
     */
    buildQrUrls() {
      const size = this.state.currentSize || 300;
      const encodedPayload = encodeURIComponent(this.state.currentPayload || '');
      const sizeParam = `${size}x${size}`;

      // PNG preview
      const pngUrl = `${QR_API_BASE}?size=${sizeParam}&data=${encodedPayload}`;

      // JPG download/print
      const jpgUrl = `${QR_API_BASE}?format=jpg&size=${sizeParam}&data=${encodedPayload}`;

      return { pngUrl, jpgUrl };
    },

    /**
     * Cập nhật preview QR + link JPG tương ứng size hiện tại
     */
    updatePreviewAndLinks() {
      if (!this.state.currentPayload) return;

      const { pngUrl, jpgUrl } = this.buildQrUrls();
      this.state.currentJpgUrl = jpgUrl;

      // Ảnh preview
      if (this.state.img) {
        this.state.img.src = pngUrl;
        this.state.img.alt = 'QRコードプレビュー / Xem trước mã QR';
      }

      // Nút download JPG
      if (this.state.downloadBtn) {
        const typeCode = this.state.currentType === 'mold' ? 'MOLD' : 'CUTTER';
        const fileName = `MCQR_${typeCode}_${this.state.currentId || ''}_${this.state.currentCode || ''}_${this.state.currentSize}.jpg`;
        this.state.downloadBtn.setAttribute('href', jpgUrl);
        this.state.downloadBtn.setAttribute('download', fileName);
      }
    },

    /**
     * Mở modal QR
     */
    openModal() {
      if (!this.state.modal) return;
      this.state.modal.classList.add('qr-modal-open');
      this.state.modal.classList.remove('qr-modal-hidden');
      document.body.style.overflow = 'hidden';
    },

    /**
     * Đóng modal QR
     */
    closeModal() {
      if (!this.state.modal) return;
      this.state.modal.classList.remove('qr-modal-open');
      this.state.modal.classList.add('qr-modal-hidden');
      document.body.style.overflow = '';
    },

    /**
     * In QR: mở cửa sổ mới chứa duy nhất QR + thông tin
     */
    openPrintView() {
      if (!this.state.currentPayload) {
        alert('印刷するQRコードがありません。\nChưa có mã QR để in.');
        return;
      }

      const { jpgUrl } = this.buildQrUrls();
      const size = this.state.currentSize || 300;
      const typeLabel = this.state.currentType === 'mold'
        ? '金型 / Khuôn'
        : '刃型 / Dao cắt';

      const win = window.open('', '_blank', 'width=800,height=600');
      if (!win) {
        alert('ポップアップがブロックされました。\nCửa sổ in bị chặn bởi trình duyệt.');
        return;
      }

      const html = `
        <!DOCTYPE html>
        <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <title>QRコード印刷 / In mã QR</title>
          <style>
            body {
              margin: 0;
              padding: 16px;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
              text-align: center;
            }
            .info {
              margin-bottom: 16px;
              font-size: 14px;
              line-height: 1.5;
            }
            .info strong {
              display: block;
              font-size: 16px;
              margin-bottom: 4px;
            }
            .qr-wrap {
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 16px;
            }
            img {
              width: ${size}px;
              height: ${size}px;
            }
            @media print {
              body {
                margin: 0;
                padding: 0;
              }
            }
          </style>
        </head>
        <body>
          <div class="info">
            <strong>${typeLabel}</strong>
            <div>ID: ${this.state.currentId || ''}</div>
            <div>Code: ${this.state.currentCode || ''}</div>
            <div>${this.state.currentName || ''}</div>
          </div>
          <div class="qr-wrap">
            <img src="${jpgUrl}" alt="QR Code">
          </div>
          <script>
            window.onload = function () {
              setTimeout(function () {
                window.print();
              }, 300);
            };
          </script>
        </body>
        </html>
      `;

      win.document.open();
      win.document.write(html);
      win.document.close();
    },

    /**
     * Chèn CSS cần thiết cho modal QR
     */
    injectStyles() {
      if (document.getElementById('export-qr-styles')) return;

      const style = document.createElement('style');
      style.id = 'export-qr-styles';
      style.textContent = `
        .qr-modal-root {
          position: fixed;
          inset: 0;
          z-index: 11000;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .qr-modal-hidden {
          display: none;
        }
        .qr-modal-open {
          display: flex;
        }
        .qr-modal-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
        }
        .qr-modal-dialog {
          position: relative;
          background: #ffffff;
          border-radius: 10px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
          max-width: 420px;
          width: 90%;
          padding: 12px 16px 16px;
          z-index: 1;
        }
        .qr-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .qr-modal-title {
          font-size: 16px;
          font-weight: 600;
        }
        .qr-modal-close-btn {
          border: none;
          background: transparent;
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
          padding: 0 4px;
        }
        .qr-modal-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .qr-info-block {
          font-size: 13px;
          line-height: 1.5;
          background: #f5f5f5;
          border-radius: 6px;
          padding: 6px 8px;
        }
        .qr-info-row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }
        .qr-info-label {
          font-weight: 500;
        }
        .qr-size-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 4px;
          margin-bottom: 2px;
          gap: 8px;
        }
        .qr-size-label {
          font-size: 13px;
        }
        .qr-size-select {
          flex: 0 0 auto;
        }
        .qr-size-select select {
          padding: 2px 6px;
          font-size: 13px;
        }
        .qr-preview-wrap {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 8px;
        }
        .qr-preview-img {
          max-width: 100%;
          height: auto;
        }
        .qr-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 8px;
        }
        .qr-btn {
          border-radius: 4px;
          border: none;
          cursor: pointer;
          font-size: 13px;
          padding: 4px 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          text-decoration: none;
        }
        .qr-btn-primary {
          background: #1976d2;
          color: #ffffff;
        }
        .qr-btn-secondary {
          background: #e0e0e0;
          color: #333333;
        }
        .qr-btn-danger {
          background: #b0bec5;
          color: #222222;
        }
        @media (max-width: 480px) {
          .qr-modal-dialog {
            max-width: 360px;
          }
        }
      `;
      document.head.appendChild(style);
    },

    /**
     * Tạo cấu trúc HTML modal QR và cache DOM elements
     */
    createModalStructure() {
      if (this.state.modal) return;

      const root = document.createElement('div');
      root.className = 'qr-modal-root qr-modal-hidden';
      root.id = 'qr-export-modal';

      root.innerHTML = `
        <div class="qr-modal-backdrop"></div>
        <div class="qr-modal-dialog">
          <div class="qr-modal-header">
            <div class="qr-modal-title">
              QRコード出力 / Xuất mã QR
            </div>
            <button type="button" class="qr-modal-close-btn" aria-label="Close">×</button>
          </div>
          <div class="qr-modal-body">
            <div class="qr-info-block">
              <div class="qr-info-row">
                <span class="qr-info-label">種別 / Loại:</span>
                <span id="qr-info-type"></span>
              </div>
              <div class="qr-info-row">
                <span class="qr-info-label">ID:</span>
                <span id="qr-info-id"></span>
              </div>
              <div class="qr-info-row">
                <span class="qr-info-label">Code:</span>
                <span id="qr-info-code"></span>
              </div>
              <div class="qr-info-row">
                <span class="qr-info-label">名称 / Tên:</span>
                <span id="qr-info-name"></span>
              </div>
            </div>

            <div class="qr-size-row">
              <div class="qr-size-label">
                サイズ / Kích thước:
              </div>
              <div class="qr-size-select">
                <select id="qr-size-select">
                  <option value="150">150 x 150 px（小・tem nhỏ）</option>
                  <option value="300" selected>300 x 300 px（標準・chuẩn）</option>
                  <option value="600">600 x 600 px（大・in lớn）</option>
                </select>
              </div>
            </div>

            <div class="qr-preview-wrap">
              <img id="qr-preview-img" class="qr-preview-img" src="" alt="">
            </div>
          </div>
          <div class="qr-modal-footer">
            <button type="button" id="qr-print-btn" class="qr-btn qr-btn-primary">
              印刷 / In
            </button>
            <a id="qr-download-btn" class="qr-btn qr-btn-secondary" href="#" download>
              JPG保存 / Lưu JPG
            </a>
            <button type="button" class="qr-btn qr-btn-danger qr-modal-close-btn">
              閉じる / Đóng
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(root);

      // Cache elements
      this.state.modal = root;
      this.state.backdrop = root.querySelector('.qr-modal-backdrop');
      this.state.dialog = root.querySelector('.qr-modal-dialog');
      this.state.img = root.querySelector('#qr-preview-img');
      this.state.titleEl = root.querySelector('.qr-modal-title');
      this.state.infoTypeEl = root.querySelector('#qr-info-type');
      this.state.infoIdEl = root.querySelector('#qr-info-id');
      this.state.infoCodeEl = root.querySelector('#qr-info-code');
      this.state.infoNameEl = root.querySelector('#qr-info-name');
      this.state.sizeSelect = root.querySelector('#qr-size-select');
      this.state.downloadBtn = root.querySelector('#qr-download-btn');
      this.state.printBtn = root.querySelector('#qr-print-btn');
      this.state.closeButtons = Array.from(root.querySelectorAll('.qr-modal-close-btn'));
    },

    /**
     * Gắn event handlers cho modal QR
     */
    bindEvents() {
      if (!this.state.modal) return;

      // Đóng khi click backdrop
      if (this.state.backdrop) {
        this.state.backdrop.addEventListener('click', () => this.closeModal());
      }

      // Đóng khi click nút đóng
      if (this.state.closeButtons && this.state.closeButtons.length) {
        this.state.closeButtons.forEach(btn => {
          btn.addEventListener('click', () => this.closeModal());
        });
      }

      // Thay đổi size QR
      if (this.state.sizeSelect) {
        this.state.sizeSelect.addEventListener('change', () => {
          this.state.currentSize = this.getCurrentSize();
          this.updatePreviewAndLinks();
        });
      }

      // In
      if (this.state.printBtn) {
        this.state.printBtn.addEventListener('click', () => {
          this.openPrintView();
        });
      }

      // Download JPG:
      //  - Handler chính là href+download, nhưng nếu thiếu currentPayload thì chặn
      if (this.state.downloadBtn) {
        this.state.downloadBtn.addEventListener('click', (e) => {
          if (!this.state.currentPayload) {
            e.preventDefault();
            alert('ダウンロードするQRコードがありません。\nChưa có mã QR để tải.');
          }
        });
      }

      // ESC để đóng modal
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.state.modal && this.state.modal.classList.contains('qr-modal-open')) {
          this.closeModal();
        }
      });
    }
  };

  // Expose to global
  window.ExportQR = ExportQR;

  // Auto init (chỉ khởi tạo structure; generate() sẽ update nội dung)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      ExportQR.init();
    });
  } else {
    ExportQR.init();
  }

})();

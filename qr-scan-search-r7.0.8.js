/**
 * qr-scan-search-r7.0.8.js
 * ===========================================================
 * QR Scan module tích hợp Search màn hình chính
 *
 * Chức năng chính:
 *  - Đọc QR theo format (từ export-qr-r7.0.8.js):
 *      + Mold:   MCQR|MOLD|<MoldID>|<MoldCode>
 *      + Cutter: MCQR|CUTTER|<CutterID>|<CutterCode>
 *  - Nếu tìm thấy bản ghi có ID + Code trùng:
 *      + Desktop: phát event "detailchanged" → UIRenderer.updateDetailPanel
 *      + Mobile/iPad: gọi MobileDetailModal.show(item, type)
 *  - Nếu KHÔNG match ID + Code:
 *      + Dùng Code làm từ khóa
 *      + Lọc DataManager.data.molds / DataManager.data.cutters
 *      + Phát event "searchupdated" (origin: "qr-scan") để UIRenderer render.
 *
 * QR camera:
 *  - Dùng Html5Qrcode (window.Html5Qrcode) nếu có.
 *  - Cho phép chọn camera trước / sau, và đổi trong khi đang scan.
 *  - Fallback: nhập/dán chuỗi QR vào input text.
 *
 * Tích hợp nút:
 *  - Tự bind click cho các selector:
 *      #nav-qr-scan, #nav-qr-scan-btn
 *      #search-qr-scan, #search-qr-scan-btn
 *      .btn-qr-scan, [data-role="qr-scan-trigger"]
 *
 * Ghi chú:
 *  - Không sửa các module khác (UIRenderer, MobileDetailModal, ExportQR...).
 *  - Chỉ require DataManager.data đã load.
 * ===========================================================
 */

(function () {
  'use strict';

  const QRScanSearch = {
    state: {
      initialized: false,
      // Modal elements
      modal: null,
      backdrop: null,
      dialog: null,
      cameraContainer: null,
      cameraStatusEl: null,
      cameraViewId: 'qrscan-camera-view',
      cameraSelect: null,
      cameraToggleBtn: null,
      manualInput: null,
      btnScanText: null,
      btnSubmitManual: null,
      btnClose: null,

      // Camera / Html5Qrcode state
      html5qr: null,
      cameras: [],
      currentCameraId: null,
      isScanning: false
    },

    /**
     * Khởi tạo 1 lần sau khi DOM ready.
     */
    init() {
      if (this.state.initialized) return;

      this.injectStyles();
      this.createModalStructure();
      this.bindGlobalButtons();

      this.state.initialized = true;
      console.log('[QRScanSearch] Initialized');
    },

    /**
     * Tiêm CSS cho modal QR.
     */
    injectStyles() {
      if (document.getElementById('qrscan-styles')) return;

      const style = document.createElement('style');
      style.id = 'qrscan-styles';
      style.textContent = `
        .qrscan-root {
          position: fixed;
          inset: 0;
          z-index: 11001;
          display: none;
          align-items: center;
          justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .qrscan-root.qrscan-open {
          display: flex;
        }
        .qrscan-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
        }
        .qrscan-dialog {
          position: relative;
          z-index: 1;
          background: #ffffff;
          border-radius: 10px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
          width: 90%;
          max-width: 520px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          padding: 12px 16px 14px;
        }

        .qrscan-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 8px;
        }
        .qrscan-title {
          font-size: 16px;
          font-weight: 600;
        }
        .qrscan-title span {
          display: block;
          line-height: 1.3;
        }
        .qrscan-title .ja {
          font-size: 14px;
        }
        .qrscan-title .vi {
          font-size: 12px;
          color: #555;
        }
        .qrscan-close {
          border: none;
          background: transparent;
          font-size: 20px;
          line-height: 1;
          cursor: pointer;
          padding: 0 4px;
        }

        .qrscan-body {
          display: flex;
          flex-direction: column;
          gap: 8px;
          overflow: auto;
        }

        .qrscan-section-title {
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 4px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .qrscan-section-title i {
          color: #1976d2;
        }

        .qrscan-camera-block {
          border-radius: 6px;
          border: 1px solid #e0e0e0;
          padding: 8px;
          background: #fafafa;
        }
        .qrscan-camera-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
          gap: 8px;
        }
        .qrscan-camera-controls {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .qrscan-select {
          font-size: 12px;
          padding: 2px 4px;
        }
        .qrscan-status {
          font-size: 11px;
          color: #666;
        }

        /* --- FIX CAMERA ALIGNMENT --- */
        .qrscan-camera-view-wrap {
          position: relative;
          background: #000;
          border-radius: 6px;
          overflow: hidden;
          min-height: 220px;
          max-height: 320px;
          display: flex;           /* Flexbox để căn giữa */
          align-items: center;     /* Căn giữa dọc */
          justify-content: center; /* Căn giữa ngang */
        }
        
        #qrscan-camera-view {
          width: 100% !important;
          height: 100% !important; /* Chiếm toàn bộ chiều cao wrap */
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0;
          padding: 0;
        }
        
        /* Reset margin/padding cho các element con của Html5Qrcode */
        #qrscan-camera-view video, 
        #qrscan-camera-view canvas {
            width: 100% !important;
            height: auto !important;
            max-height: 320px !important; /* Giới hạn chiều cao video */
            object-fit: contain !important; /* Đảm bảo hiển thị đủ video */
            margin: 0 auto !important;
        }
        
        /* Ẩn các nút/text mặc định của thư viện nếu có */
        #qrscan-camera-view button {
            display: none !important;
        }
        /* ---------------------------- */

        .qrscan-manual-block {
          border-radius: 6px;
          border: 1px solid #e0e0e0;
          padding: 8px;
          background: #ffffff;
        }
        .qrscan-manual-label {
          font-size: 12px;
          margin-bottom: 4px;
        }
        .qrscan-manual-input {
          width: 100%;
          font-size: 13px;
          padding: 4px 6px;
          border-radius: 4px;
          border: 1px solid #ccc;
          box-sizing: border-box;
          margin-bottom: 4px;
        }
        .qrscan-manual-hint {
          font-size: 11px;
          color: #666;
        }

        .qrscan-footer {
          margin-top: 6px;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }
        .qrscan-btn {
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
        .qrscan-btn-primary {
          background: #1976d2;
          color: #ffffff;
        }
        .qrscan-btn-secondary {
          background: #e0e0e0;
          color: #333333;
        }
        .qrscan-btn-danger {
          background: #b0bec5;
          color: #222222;
        }
        .qrscan-btn:disabled {
          opacity: 0.5;
          cursor: default;
        }

        .qrscan-toggle-camera {
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 4px;
          border: 1px solid #bbb;
          background: #f5f5f5;
          cursor: pointer;
        }

        @media (max-width: 480px) {
          .qrscan-dialog {
            width: 96%;
            max-width: 96%;
            padding: 10px 10px 12px;
          }
        }
      `;
      document.head.appendChild(style);
    },

    /**
     * Tạo HTML modal, cache element.
     */
    createModalStructure() {
      if (this.state.modal) return;

      const root = document.createElement('div');
      root.className = 'qrscan-root';
      root.id = 'qr-scan-modal';

      root.innerHTML = `
        <div class="qrscan-backdrop"></div>
        <div class="qrscan-dialog" role="dialog" aria-modal="true" aria-label="QR Scan">
          <div class="qrscan-header">
            <div class="qrscan-title">
              <span class="ja">QRスキャン</span>
              <span class="vi">Quét mã QR để tìm kiếm</span>
            </div>
            <button type="button" class="qrscan-close" aria-label="Close">&times;</button>
          </div>
          <div class="qrscan-body">
            <div class="qrscan-camera-block">
              <div class="qrscan-section-title">
                <i class="fas fa-camera"></i>
                <span>Camera / カメラ</span>
              </div>
              <div class="qrscan-camera-header">
                <div class="qrscan-camera-controls">
                  <select class="qrscan-select" id="qrscan-camera-select"></select>
                  <button type="button" class="qrscan-toggle-camera" id="qrscan-toggle-camera">
                    <span class="ja">前後切替</span>
                    <span class="vi">Đổi trước/sau</span>
                  </button>
                </div>
                <div class="qrscan-status" id="qrscan-status">
                  準備中... / Đang chuẩn bị...
                </div>
              </div>
              <div class="qrscan-camera-view-wrap">
                <div id="qrscan-camera-view"></div>
              </div>
            </div>

            <div class="qrscan-manual-block">
              <div class="qrscan-section-title">
                <i class="fas fa-keyboard"></i>
                <span>Manual / 手入力</span>
              </div>
              <label class="qrscan-manual-label" for="qrscan-manual-input">
                QRテキスト / Chuỗi QR:
              </label>
              <input type="text" id="qrscan-manual-input" class="qrscan-manual-input"
                     placeholder="MCQR|MOLD|123|TOK-001 など / ví dụ: MCQR|MOLD|123|TOK-001">
              <div class="qrscan-manual-hint">
                カメラが使えない場合は、ここに貼り付けてください。<br>
                Nếu không dùng được camera, hãy dán chuỗi QR vào đây.
              </div>
            </div>
          </div>
          <div class="qrscan-footer">
            <button type="button" class="qrscan-btn qrscan-btn-secondary" id="qrscan-manual-submit">
              <span class="ja">テキスト読込</span>
              <span class="vi">Đọc từ text</span>
            </button>
            <button type="button" class="qrscan-btn qrscan-btn-danger" id="qrscan-close-btn">
              <span class="ja">閉じる</span>
              <span class="vi">Đóng</span>
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(root);

      this.state.modal = root;
      this.state.backdrop = root.querySelector('.qrscan-backdrop');
      this.state.dialog = root.querySelector('.qrscan-dialog');
      this.state.cameraContainer = root.querySelector('#' + this.state.cameraViewId);
      this.state.cameraStatusEl = root.querySelector('#qrscan-status');
      this.state.cameraSelect = root.querySelector('#qrscan-camera-select');
      this.state.cameraToggleBtn = root.querySelector('#qrscan-toggle-camera');
      this.state.manualInput = root.querySelector('#qrscan-manual-input');
      this.state.btnSubmitManual = root.querySelector('#qrscan-manual-submit');
      this.state.btnClose = root.querySelector('#qrscan-close-btn');

      // Bind nội bộ modal
      const closeIcon = root.querySelector('.qrscan-close');
      if (closeIcon) closeIcon.addEventListener('click', () => this.closeModal());
      if (this.state.backdrop) {
        this.state.backdrop.addEventListener('click', () => this.closeModal());
      }
      if (this.state.btnClose) {
        this.state.btnClose.addEventListener('click', () => this.closeModal());
      }
      if (this.state.btnSubmitManual) {
        this.state.btnSubmitManual.addEventListener('click', () => {
          const txt = (this.state.manualInput?.value || '').trim();
          if (!txt) {
            alert('QRテキストが空です / Chuỗi QR đang trống.');
            return;
          }
          this.handlePayload(txt, 'manual');
        });
      }

      // Camera selector & toggle
      if (this.state.cameraSelect) {
        this.state.cameraSelect.addEventListener('change', () => {
          const deviceId = this.state.cameraSelect.value || null;
          if (deviceId) {
            this.startScan(deviceId);
          }
        });
      }
      if (this.state.cameraToggleBtn) {
        this.state.cameraToggleBtn.addEventListener('click', () => {
          this.toggleCamera();
        });
      }
    },

    /**
     * Gắn click cho các nút QR trên UI hiện có.
     */
    bindGlobalButtons() {
      const selectors = [
        '#nav-qr-scan',
        '#nav-qr-scan-btn',
        '#search-qr-scan',
        '#search-qr-scan-btn',
        '.btn-qr-scan',
        '[data-role="qr-scan-trigger"]'
      ];

      const bound = new Set();

      selectors.forEach(sel => {
        const nodes = document.querySelectorAll(sel);
        nodes.forEach(el => {
          if (bound.has(el)) return;
          bound.add(el);
          el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.openModal();
          });
        });
      });

      console.log('[QRScanSearch] Bound QR scan triggers:', bound.size);
    },

    /**
     * Mở modal & init camera.
     */
    openModal() {
      if (!this.state.initialized) this.init();

      this.state.modal.classList.add('qrscan-open');
      document.body.style.overflow = 'hidden';

      // Clear manual input
      if (this.state.manualInput) this.state.manualInput.value = '';

      // Khởi tạo camera
      this.initCamera();
    },

    /**
     * Đóng modal & dừng camera.
     */
    closeModal() {
      this.stopScan();
      if (this.state.modal) {
        this.state.modal.classList.remove('qrscan-open');
      }
      document.body.style.overflow = '';
    },

    /**
     * Init Html5Qrcode & load danh sách camera.
     */
    initCamera() {
      const statusEl = this.state.cameraStatusEl;
      if (!window.Html5Qrcode || typeof window.Html5Qrcode.getCameras !== 'function') {
        if (statusEl) {
          statusEl.textContent =
            'ライブラリ未読込 / Thư viện Html5Qrcode chưa sẵn sàng. 手入力をご利用ください。/ Hãy dùng nhập tay.';
        }
        return;
      }

      if (statusEl) {
        statusEl.textContent = 'カメラを検索中... / Đang lấy danh sách camera...';
      }

      Html5Qrcode.getCameras()
        .then(cameras => {
          this.state.cameras = cameras || [];
          if (!this.state.cameras.length) {
            if (statusEl) {
              statusEl.textContent = 'カメラが見つかりません / Không tìm thấy thiết bị camera.';
            }
            return;
          }

          // Chọn ưu tiên back camera
          const selectEl = this.state.cameraSelect;
          if (selectEl) {
            selectEl.innerHTML = '';
            this.state.cameras.forEach((cam, idx) => {
              const opt = document.createElement('option');
              opt.value = cam.id;
              const label = cam.label || `Camera ${idx + 1}`;
              opt.textContent = label;
              selectEl.appendChild(opt);
            });
          }

          let preferredId = null;
          const backCam = this.state.cameras.find(c =>
            /back|rear|environment|背面/i.test(c.label || '')
          );
          preferredId = backCam ? backCam.id : this.state.cameras[0].id;

          this.state.currentCameraId = preferredId;
          if (selectEl) {
            selectEl.value = preferredId;
          }

          if (statusEl) {
            statusEl.textContent = 'スキャン準備完了 / Sẵn sàng quét QR.';
          }

          this.startScan(preferredId);
        })
        .catch(err => {
          console.error('[QRScanSearch] getCameras error', err);
          if (statusEl) {
            statusEl.textContent =
              'カメラ取得エラー / Lỗi khi lấy danh sách camera.';
          }
        });
    },

    /**
     * Bắt đầu scan với cameraId hiện tại.
     */
    startScan(cameraId) {
      if (!window.Html5Qrcode) {
        if (this.state.cameraStatusEl) {
          this.state.cameraStatusEl.textContent =
            'ライブラリ未読込 / Html5Qrcode not available.';
        }
        return;
      }

      // Dừng nếu đang chạy
      this.stopScan(() => {
        try {
          this.state.html5qr = new Html5Qrcode(this.state.cameraViewId);
        } catch (e) {
          console.error('[QRScanSearch] Cannot init Html5Qrcode', e);
          if (this.state.cameraStatusEl) {
            this.state.cameraStatusEl.textContent =
              '初期化エラー / Lỗi khởi tạo Html5Qrcode.';
          }
          return;
        }

        this.state.isScanning = true;
        this.state.currentCameraId = cameraId;

        const statusEl = this.state.cameraStatusEl;
        if (statusEl) {
          statusEl.textContent = 'スキャン中... / Đang quét QR...';
        }

        this.state.html5qr.start(
          { deviceId: { exact: cameraId } },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 }
          },
          (decodedText) => {
            // Khi đọc thành công 1 lần, xử lý và tiếp tục scan.
            console.log('[QRScanSearch] decodedText:', decodedText);
            this.handlePayload(decodedText, 'camera');
          },
          (errorMsg) => {
            // Lỗi tạm thời, không log quá nhiều.
          }
        ).catch(err => {
          console.error('[QRScanSearch] start error', err);
          this.state.isScanning = false;
          if (statusEl) {
            statusEl.textContent =
              'カメラ起動エラー / Lỗi khi khởi động camera.';
          }
        });
      });
    },

    /**
     * Dừng scan.
     * @param {Function} cb - callback sau khi stop xong.
     */
    stopScan(cb) {
      const done = () => {
        if (typeof cb === 'function') cb();
      };

      if (!this.state.html5qr) {
        this.state.isScanning = false;
        done();
        return;
      }

      const instance = this.state.html5qr;
      this.state.html5qr = null;
      this.state.isScanning = false;

      instance.stop()
        .then(() => instance.clear())
        .then(done)
        .catch(err => {
          console.warn('[QRScanSearch] stop error', err);
          done();
        });
    },

    /**
     * Chuyển camera trước/sau (xoay danh sách cameras).
     */
    toggleCamera() {
      if (!this.state.cameras.length) return;
      const currentId = this.state.currentCameraId;
      const idx = this.state.cameras.findIndex(c => c.id === currentId);
      let nextIndex = 0;
      if (idx >= 0) {
        nextIndex = (idx + 1) % this.state.cameras.length;
      }
      const nextCam = this.state.cameras[nextIndex];
      if (!nextCam) return;

      this.state.currentCameraId = nextCam.id;
      if (this.state.cameraSelect) {
        this.state.cameraSelect.value = nextCam.id;
      }
      this.startScan(nextCam.id);
    },

    /**
     * Xử lý payload QR từ camera hoặc manual.
     */
    handlePayload(raw, source) {
      const parsed = this.parsePayload(raw);
      if (!parsed) {
        alert('無効なQR形式です / Định dạng QR không hợp lệ.\n' + raw);
        return;
      }

      console.log('[QRScanSearch] Parsed QR:', parsed, 'source:', source);

      const isMold = parsed.kind === 'mold';
      const list = isMold
        ? (window.DataManager?.data?.molds || [])
        : (window.DataManager?.data?.cutters || []);

      if (!Array.isArray(list) || !list.length) {
        alert('データ未読込 / Dữ liệu chưa được nạp vào hệ thống.');
        return;
      }

      const match = this.findExactRecord(list, parsed);
      if (match) {
        this.openDetail(match, parsed.kind);
        this.closeModal();
        return;
      }

      // Không match ID+Code → dùng code làm từ khóa search.
      const results = this.searchByCode(list, parsed.code, parsed.kind);
      if (!results.length) {
        alert(
          '対象が見つかりません / Không tìm thấy dữ liệu tương ứng.\nCode: ' +
          parsed.code
        );
        return;
      }

      this.pushToGlobalSearch(parsed.code, results, parsed.kind);
      this.closeModal();
    },

    /**
     * Parse chuỗi QR "MCQR|MOLD|<ID>|<CODE>".
     */
    parsePayload(raw) {
      if (!raw) return null;
      const text = String(raw).trim();
      const parts = text.split('|');
      if (parts.length < 4) return null;
      if (parts[0].toUpperCase() !== 'MCQR') return null;

      const typePart = (parts[1] || '').toUpperCase();
      if (typePart !== 'MOLD' && typePart !== 'CUTTER') return null;

      const id = (parts[2] || '').trim();
      const code = (parts[3] || '').trim();
      if (!id || !code) return null;

      return {
        raw: text,
        kind: typePart === 'MOLD' ? 'mold' : 'cutter',
        id,
        code
      };
    },

    /**
     * Tìm chính xác theo ID + Code.
     */
    findExactRecord(list, parsed) {
      const isMold = parsed.kind === 'mold';

      return list.find(item => {
        const itemId = isMold
          ? String(item.MoldID || '').trim()
          : String(item.CutterID || '').trim();
        const itemCode = isMold
          ? String(item.MoldCode || '').trim()
          : String(item.CutterCode || item.CutterNo || '').trim();

        return itemId === parsed.id && itemCode === parsed.code;
      }) || null;
    },

    /**
     * Lọc theo Code (chứa/giống).
     */
    searchByCode(list, code, kind) {
      const term = String(code || '').trim().toLowerCase();
      if (!term) return [];

      const isMold = kind === 'mold';

      const results = list.filter(item => {
        const rawCode = isMold
          ? String(item.MoldCode || '').toLowerCase()
          : String(item.CutterCode || item.CutterNo || '').toLowerCase();
        return rawCode.includes(term);
      });

      // Bổ sung trường display để UIRenderer dùng luôn. [file:2][file:5]
      return results.map(item => {
        const clone = Object.assign({}, item);
        clone.itemType = kind;
        clone.displayCode = isMold
          ? (item.MoldCode || item.MoldID || '')
          : (item.CutterNo || item.CutterCode || item.CutterID || '');
        clone.displayName = isMold
          ? (item.MoldName || item.MoldCode || '')
          : (item.CutterName || item.Name || '');
        clone.displayDimensions = item.displayDimensions ||
          (isMold
            ? (item.MoldLength && item.MoldWidth && item.MoldHeight
              ? `${item.MoldLength}x${item.MoldWidth}x${item.MoldHeight}`
              : '')
            : (item.CutlineLength && item.CutlineWidth
              ? `${item.CutlineLength}x${item.CutlineWidth}`
              : ''));
        clone.displayLocation = item.displayLocation ||
          (item.rackInfo?.RackLocation || '');
        return clone;
      });
    },

    /**
     * Đẩy kết quả sang search global (UIRenderer).
     */
    pushToGlobalSearch(code, results, kind) {
      // Gán code vào ô search nếu tồn tại.
      const candidates = [
        '#global-search-input',
        '#search-input',
        '#search-main-input',
        '[data-role="global-search-input"]'
      ];
      for (const sel of candidates) {
        const el = document.querySelector(sel);
        if (el) {
          el.value = code;
          break;
        }
      }

      // Phát event searchupdated cho UIRenderer. [file:2][file:5]
      const evt = new CustomEvent('searchupdated', {
        detail: {
          results,
          origin: 'qr-scan',
          keyword: code,
          itemType: kind
        }
      });
      document.dispatchEvent(evt);

      console.log(
        '[QRScanSearch] searchupdated dispatched from QR, results:',
        results.length
      );
    },

    /**
     * Mở chi tiết item:
     *  - Mobile/iPad: MobileDetailModal.show
     *  - Desktop: event "detailchanged" (UIRenderer lắng nghe). [file:2][file:5]
     */
    openDetail(item, kind) {
      const isMobile = window.innerWidth <= 1024;
      const itemId = kind === 'mold'
        ? (item.MoldID || item.MoldCode)
        : (item.CutterID || item.CutterNo);

      if (isMobile && window.MobileDetailModal && typeof window.MobileDetailModal.show === 'function') {
        console.log('[QRScanSearch] Open MobileDetailModal via QR, id:', itemId, 'type:', kind);
        window.MobileDetailModal.show(item, kind);
        return;
      }

      // Desktop: phát event detailchanged. [file:2]
      const evt = new CustomEvent('detailchanged', {
        detail: {
          item,
          itemType: kind,
          itemId: itemId,
          source: 'qr-scan'
        }
      });
      document.dispatchEvent(evt);
      console.log('[QRScanSearch] detailchanged dispatched from QR, id:', itemId, 'type:', kind);
    }
  };

  // Auto-init khi DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => QRScanSearch.init(), { once: true });
  } else {
    QRScanSearch.init();
  }

  // Expose ra global nếu cần debug
  window.QRScanSearch = QRScanSearch;
})();

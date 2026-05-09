// v12.0.2
// Phase 1: QR Scan chuyên dụng — Đã tách AR Locator sang module riêng
(function () {
  'use strict';

  const QRScanSearch = {
    state: {
      initialized: false,
      modal: null,
      video: null,
      canvas: null,
      ctx: null,
      stream: null,
      scanning: false,
      cameras: [],
      currentCameraId: null,
      facingMode: 'environment',
      lastBeepTime: 0,
      audioCtx: null,
      lastScannedData: '' // Chống quét trùng liên tục
    },

    init() {
      if (this.state.initialized) return;
      this.injectStyles();
      this.createModalStructure();
      this.bindGlobalButtons();
      this.state.initialized = true;
      console.log('[QRScanSearch] v12.0.0 Initialized (QR Scan Only)');
    },

    initAudio() {
      if (this.state.audioCtx) return;
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.state.audioCtx = new AudioContext();
      } catch (e) {
        console.warn('Web Audio API not supported');
      }
    },

    beep(type = 'success') {
      if (!this.state.audioCtx) return;
      const now = Date.now();
      if (now - this.state.lastBeepTime < 500) return;
      this.state.lastBeepTime = now;
      
      try {
        if (this.state.audioCtx.state === 'suspended') {
          this.state.audioCtx.resume();
        }
        const oscillator = this.state.audioCtx.createOscillator();
        const gainNode = this.state.audioCtx.createGain();
        
        oscillator.type = type === 'success' ? 'sine' : 'square';
        oscillator.frequency.value = type === 'success' ? 880 : 300;
        
        gainNode.gain.setValueAtTime(0.1, this.state.audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.state.audioCtx.currentTime + 0.1);
        
        oscillator.connect(gainNode);
        gainNode.connect(this.state.audioCtx.destination);
        
        oscillator.start(this.state.audioCtx.currentTime);
        oscillator.stop(this.state.audioCtx.currentTime + 0.1);
      } catch (e) {}
    },

    checkUrlQR() {
      try {
        const params = new URLSearchParams(window.location.search);
        const scan = params.get('scan');
        if (scan !== 'qr') return;

        const type = String(params.get('type') || '').trim();
        const id = String(params.get('id') || '').trim();
        const code = String(params.get('code') || '').trim();

        if (!type || !id || !code) return;
        console.log('[QRScanSearch] Detected QR from DeepLink:', { type, id, code });

        const kindRaw = type.toUpperCase() === 'MOLD' ? 'MOLD' : 'CUTTER';
        const payload = `MCQR|${kindRaw}|${id}|${code}`;

        setTimeout(() => {
          this.handlePayload(payload, 'url');

          setTimeout(() => {
            const loader = document.getElementById('qr-direct-loader');
            if (loader) {
              loader.style.transition = 'opacity 0.3s ease';
              loader.style.opacity = '0';
              setTimeout(() => loader.remove(), 300);
            }
          }, 400);

          const cleanUrl = new URL(window.location.href);
          cleanUrl.searchParams.delete('scan');
          cleanUrl.searchParams.delete('type');
          cleanUrl.searchParams.delete('id');
          cleanUrl.searchParams.delete('code');
          window.history.replaceState({}, document.title, cleanUrl.toString());
        }, 500);
      } catch (err) {
        console.warn('[QRScanSearch] Lỗi xử lý checkUrlQR:', err);
      }
    },

    injectStyles() {
      if (document.getElementById('qrscan-styles')) return;
      const style = document.createElement('style');
      style.id = 'qrscan-styles';
      style.textContent = `
        .qrscan-root { position: fixed; inset: 0; z-index: 999999; display: none; align-items: center; justify-content: center; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .qrscan-root.qrscan-open { display: flex; }
        .qrscan-backdrop { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(2px); }
        .qrscan-dialog { position: relative; z-index: 1; background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35); width: 90%; max-width: 480px; max-height: 90vh; display: flex; flex-direction: column; overflow: hidden; }
        .qrscan-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #f8f9fa; border-bottom: 1px solid #eee; flex-shrink: 0; }
        .qrscan-title { font-size: 16px; font-weight: 600; }
        .qrscan-title .ja { display: block; font-size: 15px; color: #111; }
        .qrscan-title .vi { display: block; font-size: 11px; color: #888; margin-top: 1px; }
        .qrscan-close { border: none; background: transparent; font-size: 24px; line-height: 1; cursor: pointer; color: #555; padding: 4px; }
        
        .qrscan-body { padding: 12px; display: flex; flex-direction: column; gap: 8px; overflow-y: auto; flex: 1; }
        
        .qrscan-camera-block { border-radius: 8px; overflow: hidden; border: 1px solid #ddd; background: #000; }
        .qrscan-camera-header { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: rgba(255,255,255,0.9); border-bottom: 1px solid #ddd; }
        .qrscan-camera-header .ja { font-size: 11px; color: #555; font-weight: 600; }
        .qrscan-select { font-size: 12px; padding: 4px; max-width: 150px; }
        .qrscan-toggle-camera { font-size: 11px; padding: 4px 10px; border-radius: 4px; border: 1px solid #bbb; background: #f5f5f5; cursor: pointer; font-weight: 600; }
        
        .qrscan-camera-view-wrap { position: relative; width: 100%; max-height: 55vh; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #111; }
        #qrscan-canvas { width: 100%; max-width: 100%; height: auto; max-height: 55vh; display: block; object-fit: contain; }
        #qrscan-video { display: none; }

        .qrscan-hint { text-align: center; font-size: 12px; color: #888; padding: 8px 0 4px; flex-shrink: 0; }
        .qrscan-hint .ja { font-weight: 600; color: #555; }

        @media (max-width: 768px) {
          .qrscan-dialog { width: 96%; max-width: none; max-height: 85vh; border-radius: 14px; }
          .qrscan-camera-view-wrap { max-height: 50vh; }
          #qrscan-canvas { max-height: 50vh; }
        }
      `;
      document.head.appendChild(style);
    },

    createModalStructure() {
      if (this.state.modal) return;
      const root = document.createElement('div');
      root.className = 'qrscan-root';
      root.id = 'qr-scan-modal';

      root.innerHTML = `
        <div class="qrscan-backdrop"></div>
        <div class="qrscan-dialog">
          <div class="qrscan-header">
            <div class="qrscan-title">
              <span class="ja">QRスキャン</span>
              <span class="vi">Quét mã QR</span>
            </div>
            <button type="button" class="qrscan-close" aria-label="閉じる">&times;</button>
          </div>

          <div class="qrscan-body">
            <div class="qrscan-camera-block">
              <div class="qrscan-camera-header">
                <span class="ja">📷 カメラ</span>
                <div style="display:flex; gap:6px; align-items:center;">
                  <select id="qrscan-camera-select" class="qrscan-select"></select>
                  <button type="button" id="qrscan-toggle-camera" class="qrscan-toggle-camera">切替 / Đổi</button>
                </div>
              </div>
              <div class="qrscan-camera-view-wrap">
                <video id="qrscan-video" playsinline></video>
                <canvas id="qrscan-canvas"></canvas>
              </div>
            </div>

            <div class="qrscan-hint">
              <div class="ja">金型・抜型のQRコードをカメラに映してください</div>
              <div class="vi">Hướng camera vào mã QR trên khuôn hoặc dao cắt</div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(root);

      this.state.modal = root;
      this.state.video = root.querySelector('#qrscan-video');
      this.state.canvas = root.querySelector('#qrscan-canvas');
      this.state.ctx = this.state.canvas.getContext('2d', { willReadFrequently: true });
      this.state.cameraSelect = root.querySelector('#qrscan-camera-select');

      root.querySelector('.qrscan-close').addEventListener('click', () => this.closeModal());
      root.querySelector('.qrscan-backdrop').addEventListener('click', () => this.closeModal());
      root.querySelector('#qrscan-toggle-camera').addEventListener('click', () => this.toggleCamera());
      this.state.cameraSelect.addEventListener('change', (e) => {
        const newCam = e.target.value;
        if(newCam) this.startCamera(newCam);
      });
    },

    bindGlobalButtons() {
      const selectors = [
        '#nav-qr-scan', '#nav-qr-scan-btn', '#search-qr-scan', '#search-qr-scan-btn',
        '.btn-qr-scan', '[data-role="qr-scan-trigger"]',
        '.mcs-qr-trigger', '#sidebarQRScanBtn', '#searchbarQRBtn'
      ];
      document.addEventListener('click', (e) => {
        const btn = e.target.closest(selectors.join(','));
        if (btn) {
          e.preventDefault();
          this.openModal();
        }
      });
      console.log(`[QRScanSearch] Bound global triggers`);
    },

    openModal() {
      this.initAudio();
      this.state.lastScannedData = ''; // Reset chống trùng
      this.state.modal.classList.add('qrscan-open');
      this.startCamera();
    },

    closeModal() {
      this.state.modal.classList.remove('qrscan-open');
      this.stopCamera();
    },

    async startCamera(deviceId = null, isRetry = false) {
      this.stopCamera();
      this.state.scanning = true;

      try {
        if (!this.state.cameras.length) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          this.state.cameras = devices.filter(d => d.kind === 'videoinput');
          this.state.cameraSelect.innerHTML = '';
          this.state.cameras.forEach((cam, i) => {
            const opt = document.createElement('option');
            opt.value = cam.deviceId;
            opt.textContent = cam.label || `カメラ ${i + 1}`;
            this.state.cameraSelect.appendChild(opt);
          });
        }

        const constraints = {
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : (isRetry ? true : { facingMode: this.state.facingMode, width: { ideal: 640 }, height: { ideal: 480 } }),
          audio: false
        };

        this.state.stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.state.video.srcObject = this.state.stream;
        
        const track = this.state.stream.getVideoTracks()[0];
        if (track) {
          this.state.currentCameraId = track.getSettings().deviceId;
          this.state.cameraSelect.value = this.state.currentCameraId;
        }
        
        await this.state.video.play();
        
        requestAnimationFrame(() => this.scanTick());
      } catch (err) {
        if (!isRetry && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') && !deviceId) {
          console.warn('[QRScanSearch] Camera with facingMode not found, retrying without constraints...');
          return this.startCamera(null, true);
        }
        
        console.error('[QRScanSearch] カメラエラー:', err);
        // Vẽ thông báo lỗi lên canvas
        const cw = 400, ch = 250;
        this.state.canvas.width = cw;
        this.state.canvas.height = ch;
        this.state.ctx.fillStyle = '#1a1a2e';
        this.state.ctx.fillRect(0, 0, cw, ch);
        this.state.ctx.fillStyle = '#ef4444';
        this.state.ctx.font = 'bold 36px Arial';
        this.state.ctx.textAlign = 'center';
        this.state.ctx.fillText('⚠', cw / 2, ch / 2 - 30);
        this.state.ctx.fillStyle = '#fff';
        this.state.ctx.font = 'bold 14px Arial';
        this.state.ctx.fillText('カメラ接続エラー / Lỗi Camera', cw / 2, ch / 2 + 10);
        this.state.ctx.fillStyle = '#94a3b8';
        this.state.ctx.font = '11px Arial';
        this.state.ctx.fillText(err.message || 'Unknown error', cw / 2, ch / 2 + 30);
      }
    },

    stopCamera() {
      this.state.scanning = false;
      if (this.state.stream) {
        this.state.stream.getTracks().forEach(t => t.stop());
        this.state.stream = null;
      }
    },

    toggleCamera() {
      if (this.state.cameras.length > 1) {
        let idx = this.state.cameras.findIndex(c => c.deviceId === this.state.currentCameraId);
        idx = (idx + 1) % this.state.cameras.length;
        const newCam = this.state.cameras[idx].deviceId;
        this.state.cameraSelect.value = newCam;
        this.startCamera(newCam);
      } else {
        this.state.facingMode = this.state.facingMode === 'environment' ? 'user' : 'environment';
        this.startCamera();
      }
    },

    drawBoundingBox(loc, color) {
      const ctx = this.state.ctx;
      ctx.beginPath();
      ctx.moveTo(loc.topLeftCorner.x, loc.topLeftCorner.y);
      ctx.lineTo(loc.topRightCorner.x, loc.topRightCorner.y);
      ctx.lineTo(loc.bottomRightCorner.x, loc.bottomRightCorner.y);
      ctx.lineTo(loc.bottomLeftCorner.x, loc.bottomLeftCorner.y);
      ctx.closePath();
      ctx.lineWidth = 4;
      ctx.strokeStyle = color;
      ctx.stroke();
    },

    scanTick() {
      if (!this.state.scanning || !this.state.video) return;

      if (this.state.video.readyState === this.state.video.HAVE_ENOUGH_DATA) {
        const cw = this.state.video.videoWidth;
        const ch = this.state.video.videoHeight;
        
        if (this.state.canvas.width !== cw || this.state.canvas.height !== ch) {
          this.state.canvas.width = cw;
          this.state.canvas.height = ch;
        }

        this.state.ctx.drawImage(this.state.video, 0, 0, cw, ch);
        const imageData = this.state.ctx.getImageData(0, 0, cw, ch);

        if (typeof window.jsQR === 'function') {
          const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert",
          });

          if (code) {
            this.handleQRDetected(code);
          }
        }
      }

      if (this.state.scanning) {
        requestAnimationFrame(() => this.scanTick());
      }
    },

    handleQRDetected(code) {
      const parsed = this.parsePayload(code.data);
      if (!parsed) return;

      // Chống quét trùng: cùng 1 QR code không xử lý lại trong 3 giây
      if (this.state.lastScannedData === code.data) return;
      this.state.lastScannedData = code.data;

      // Vẽ bounding box xanh
      this.drawBoundingBox(code.location, '#00FF00');
      
      // Beep thành công
      this.beep('success');
      
      // ★ ĐÓNG CAMERA TRƯỚC KHI MỞ DETAIL (Fix issue #4)
      this.closeModal();
      
      // Mở detail sau 100ms để modal đóng mượt
      setTimeout(() => this.handlePayload(code.data, 'camera'), 150);
    },

    handlePayload(raw, source) {
      const parsed = this.parsePayload(raw);
      if (!parsed) {
        console.warn('[QRScanSearch] 無効なQR:', raw);
        return;
      }
      console.log('[QRScanSearch] Parsed QR:', parsed, 'source:', source);

      const isMold = parsed.kind === 'mold';
      const list = isMold
        ? (window.DataManager?.data?.molds || [])
        : (window.DataManager?.data?.cutters || []);

      if (!Array.isArray(list) || !list.length) {
        console.warn('[QRScanSearch] データ未読込');
        return;
      }

      const match = this.findExactRecord(list, parsed);
      if (match) {
        this.openDetail(match, parsed.kind);
        return;
      }

      const results = this.searchByCode(list, parsed.code, parsed.kind);
      if (!results.length) {
        console.warn('[QRScanSearch] 対象未発見:', parsed.code);
        return;
      }
      this.pushToGlobalSearch(parsed.code, results, parsed.kind);
    },

    parsePayload(raw) {
      if (!raw) return null;
      const text = String(raw).trim();
      try {
        if (text.startsWith('http')) {
          const url = new URL(text);
          if (url.searchParams.get('scan') === 'qr') {
            const type = url.searchParams.get('type') || '';
            const id = url.searchParams.get('id') || '';
            const code = url.searchParams.get('code') || '';
            if (type && id && code) {
              return { raw: text, kind: type.toLowerCase() === 'mold' ? 'mold' : 'cutter', id: decodeURIComponent(id), code: decodeURIComponent(code) };
            }
          } else if (url.searchParams.has('q')) {
             const q = url.searchParams.get('q');
             const typeCode = q.charAt(0).toUpperCase();
             const idCode = q.substring(1).trim().toUpperCase();
             if (typeCode === 'M' || typeCode === 'C') {
                return { raw: text, kind: typeCode === 'M' ? 'mold' : 'cutter', id: idCode, code: idCode };
             }
          }
        }
      } catch (e) { }

      const parts = text.split('|');
      if (parts.length < 4) return null;
      if (parts[0].toUpperCase() !== 'MCQR') return null;
      const typePart = (parts[1] || '').toUpperCase();
      if (typePart !== 'MOLD' && typePart !== 'CUTTER') return null;
      const id = (parts[2] || '').trim();
      const code = (parts[3] || '').trim();
      if (!id || !code) return null;
      return { raw: text, kind: typePart === 'MOLD' ? 'mold' : 'cutter', id, code };
    },

    findExactRecord(list, parsed) {
      const isMold = parsed.kind === 'mold';
      return list.find(item => {
        const itemId = isMold ? String(item.MoldID || '').trim() : String(item.CutterID || '').trim();
        const itemCode = isMold ? String(item.MoldCode || '').trim() : String(item.CutterCode || item.CutterNo || '').trim();
        return itemId === parsed.id || itemCode === parsed.code;
      }) || null;
    },

    searchByCode(list, code, kind) {
      const term = String(code || '').trim().toLowerCase();
      if (!term) return [];
      const isMold = kind === 'mold';
      const results = list.filter(item => {
        const rawCode = isMold ? String(item.MoldCode || '').toLowerCase() : String(item.CutterCode || item.CutterNo || '').toLowerCase();
        return rawCode.includes(term);
      });
      return results.map(item => {
        const clone = Object.assign({}, item);
        clone.itemType = kind;
        clone.displayCode = isMold ? (item.MoldCode || item.MoldID || '') : (item.CutterNo || item.CutterCode || item.CutterID || '');
        clone.displayName = isMold ? (item.MoldName || item.MoldCode || '') : (item.CutterName || item.Name || '');
        clone.displayLocation = item.rackInfo?.RackLocation || '';
        return clone;
      });
    },

    pushToGlobalSearch(code, results, kind) {
      const candidates = ['#global-search-input', '#search-input', '#search-main-input', '[data-role="global-search-input"]'];
      for (const sel of candidates) {
        const el = document.querySelector(sel);
        if (el) { el.value = code; break; }
      }
      const evt = new CustomEvent('searchupdated', { detail: { results, origin: 'qr-scan', keyword: code, itemType: kind } });
      document.dispatchEvent(evt);
    },

    openDetail(item, kind) {
      if (!item) return;
      if (window.DetailPanel && typeof window.DetailPanel.open === 'function') {
        window.DetailPanel.open(item, kind);
      } else {
        const itemId = kind === 'mold' ? (item.MoldID || item.MoldCode) : (item.CutterID || item.CutterNo);
        const evt = new CustomEvent('detailchanged', { detail: { item, itemType: kind, itemId: itemId, source: 'qr-scan' } });
        document.dispatchEvent(evt);
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => QRScanSearch.init(), { once: true });
  } else {
    QRScanSearch.init();
  }
  window.QRScanSearch = QRScanSearch;
})();

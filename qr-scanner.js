// v11.0.0-ARLocator
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
      mode: 'normal', // 'normal' | 'locator'
      targetId: '',
      cameras: [],
      currentCameraId: null,
      facingMode: 'environment',
      lastBeepTime: 0,
      audioCtx: null
    },

    init() {
      if (this.state.initialized) return;
      this.injectStyles();
      this.createModalStructure();
      this.bindGlobalButtons();
      this.state.initialized = true;
      console.log('[QRScanSearch] AR Locator Initialized');
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
        .qrscan-dialog { position: relative; z-index: 1; background: #fff; border-radius: 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35); width: 90%; max-width: 480px; display: flex; flex-direction: column; overflow: hidden; }
        .qrscan-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: #f8f9fa; border-bottom: 1px solid #eee; }
        .qrscan-title { font-size: 16px; font-weight: 600; }
        .qrscan-title .ja { display: block; font-size: 15px; color: #111; }
        .qrscan-title .vi { display: block; font-size: 12px; color: #666; margin-top: 2px; }
        .qrscan-close { border: none; background: transparent; font-size: 24px; line-height: 1; cursor: pointer; color: #555; padding: 4px; }
        
        .qrscan-tabs { display: flex; border-bottom: 1px solid #e0e0e0; background: #fff; }
        .qrscan-tab { flex: 1; padding: 10px 0; border: none; background: transparent; font-size: 14px; font-weight: 600; color: #777; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
        .qrscan-tab.active { color: #1976d2; border-bottom-color: #1976d2; background: #f0f7ff; }
        
        .qrscan-body { padding: 16px; display: flex; flex-direction: column; gap: 12px; }
        
        .qrscan-locator-input-wrap { display: none; }
        .qrscan-root[data-mode="locator"] .qrscan-locator-input-wrap { display: block; }
        .qrscan-input { width: 100%; padding: 10px 12px; border: 2px solid #ddd; border-radius: 6px; font-size: 16px; font-weight: bold; text-align: center; text-transform: uppercase; transition: border-color 0.2s; box-sizing: border-box; }
        .qrscan-input:focus { border-color: #1976d2; outline: none; }
        
        .qrscan-camera-block { border-radius: 8px; overflow: hidden; border: 1px solid #ddd; background: #000; }
        .qrscan-camera-header { display: flex; justify-content: space-between; align-items: center; padding: 8px; background: rgba(255,255,255,0.9); border-bottom: 1px solid #ddd; }
        .qrscan-select { font-size: 12px; padding: 4px; max-width: 150px; }
        .qrscan-toggle-camera { font-size: 12px; padding: 4px 8px; border-radius: 4px; border: 1px solid #bbb; background: #f5f5f5; cursor: pointer; }
        
        .qrscan-camera-view-wrap { position: relative; width: 100%; min-height: 250px; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #000; }
        #qrscan-canvas { width: 100%; max-width: 100%; height: auto; display: block; }
        #qrscan-video { display: none; }

        .qrscan-ar-overlay { position: absolute; inset: 0; pointer-events: none; z-index: 2; display: flex; align-items: center; justify-content: center; }
        .qrscan-ar-target { font-size: 18px; font-weight: 800; color: #fff; text-shadow: 0 0 4px #000; background: rgba(0,0,0,0.5); padding: 4px 12px; border-radius: 20px; position: absolute; top: 10px; }
      `;
      document.head.appendChild(style);
    },

    createModalStructure() {
      if (this.state.modal) return;
      const root = document.createElement('div');
      root.className = 'qrscan-root';
      root.id = 'qr-scan-modal';
      root.dataset.mode = 'normal';

      root.innerHTML = `
        <div class="qrscan-backdrop"></div>
        <div class="qrscan-dialog">
          <div class="qrscan-header">
            <div class="qrscan-title">
              <span class="ja">QRスキャン & ARロケーター</span>
              <span class="vi">Quét QR & Tìm kiếm AR</span>
            </div>
            <button type="button" class="qrscan-close" aria-label="Close">&times;</button>
          </div>
          
          <div class="qrscan-tabs">
            <button type="button" class="qrscan-tab active" data-tab="normal">Scan Thường</button>
            <button type="button" class="qrscan-tab" data-tab="locator">AR Locator</button>
          </div>

          <div class="qrscan-body">
            <div class="qrscan-locator-input-wrap">
              <input type="text" id="qrscan-locator-input" class="qrscan-input" placeholder="Nhập ID cần tìm (VD: M5791)" autocomplete="off">
            </div>

            <div class="qrscan-camera-block">
              <div class="qrscan-camera-header">
                <select id="qrscan-camera-select" class="qrscan-select"></select>
                <button type="button" id="qrscan-toggle-camera" class="qrscan-toggle-camera">Đổi Camera</button>
              </div>
              <div class="qrscan-camera-view-wrap">
                <video id="qrscan-video" playsinline></video>
                <canvas id="qrscan-canvas"></canvas>
                <div class="qrscan-ar-overlay" id="qrscan-ar-overlay" style="display:none;">
                  <div class="qrscan-ar-target" id="qrscan-ar-target-display"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(root);

      this.state.modal = root;
      this.state.video = root.querySelector('#qrscan-video');
      this.state.canvas = root.querySelector('#qrscan-canvas');
      this.state.ctx = this.state.canvas.getContext('2d', { willReadFrequently: true });
      this.state.locatorInput = root.querySelector('#qrscan-locator-input');
      this.state.cameraSelect = root.querySelector('#qrscan-camera-select');

      root.querySelector('.qrscan-close').addEventListener('click', () => this.closeModal());
      root.querySelector('.qrscan-backdrop').addEventListener('click', () => this.closeModal());
      root.querySelector('#qrscan-toggle-camera').addEventListener('click', () => this.toggleCamera());

      const tabs = root.querySelectorAll('.qrscan-tab');
      tabs.forEach(t => {
        t.addEventListener('click', (e) => {
          tabs.forEach(btn => btn.classList.remove('active'));
          e.currentTarget.classList.add('active');
          const mode = e.currentTarget.dataset.tab;
          this.state.mode = mode;
          root.dataset.mode = mode;
          if (mode === 'locator') {
            this.state.locatorInput.focus();
            root.querySelector('#qrscan-ar-overlay').style.display = 'flex';
          } else {
            root.querySelector('#qrscan-ar-overlay').style.display = 'none';
          }
        });
      });

      this.state.locatorInput.addEventListener('input', (e) => {
        this.state.targetId = e.target.value.trim().toUpperCase();
        root.querySelector('#qrscan-ar-target-display').textContent = this.state.targetId ? `Tìm: ${this.state.targetId}` : '';
      });
    },

    bindGlobalButtons() {
      const selectors = [
        '#nav-qr-scan', '#nav-qr-scan-btn', '#search-qr-scan', '#search-qr-scan-btn',
        '.btn-qr-scan', '[data-role="qr-scan-trigger"]'
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
      this.state.modal.classList.add('qrscan-open');
      this.state.locatorInput.value = '';
      this.state.targetId = '';
      this.state.modal.querySelector('#qrscan-ar-target-display').textContent = '';
      this.startCamera();
    },

    closeModal() {
      this.state.modal.classList.remove('qrscan-open');
      this.stopCamera();
    },

    async startCamera(deviceId = null) {
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
            opt.text = cam.label || `Camera ${i + 1}`;
            this.state.cameraSelect.appendChild(opt);
          });
        }

        const constraints = {
          video: deviceId 
            ? { deviceId: { exact: deviceId } } 
            : { facingMode: this.state.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
        };

        this.state.stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.state.video.srcObject = this.state.stream;
        this.state.video.setAttribute('playsinline', true);
        
        await this.state.video.play();
        
        requestAnimationFrame(() => this.scanTick());
      } catch (err) {
        console.error('[QRScanSearch] Lỗi truy cập Camera:', err);
        // Draw error message on canvas so user knows the modal works but camera failed
        this.state.ctx.fillStyle = '#111';
        this.state.ctx.fillRect(0, 0, this.state.canvas.width || 300, this.state.canvas.height || 200);
        this.state.ctx.fillStyle = '#ef4444';
        this.state.ctx.font = '14px Arial';
        this.state.ctx.textAlign = 'center';
        this.state.ctx.fillText('Camera Error: ' + err.message, (this.state.canvas.width || 300) / 2, (this.state.canvas.height || 200) / 2);
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
      this.state.facingMode = this.state.facingMode === 'environment' ? 'user' : 'environment';
      this.startCamera(); // re-init without specific deviceId to use facingMode
    },

    drawLine(begin, end, color) {
      this.state.ctx.beginPath();
      this.state.ctx.moveTo(begin.x, begin.y);
      this.state.ctx.lineTo(end.x, end.y);
      this.state.ctx.lineWidth = 4;
      this.state.ctx.strokeStyle = color;
      this.state.ctx.stroke();
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
      if (!parsed) return; // ignore invalid formats entirely visually

      if (this.state.mode === 'normal') {
        // Mode Normal: Chụp phát ăn luôn
        this.drawLine(code.location.topLeftCorner, code.location.topRightCorner, "#00FF00");
        this.drawLine(code.location.topRightCorner, code.location.bottomRightCorner, "#00FF00");
        this.drawLine(code.location.bottomRightCorner, code.location.bottomLeftCorner, "#00FF00");
        this.drawLine(code.location.bottomLeftCorner, code.location.topLeftCorner, "#00FF00");
        
        this.beep('success');
        this.closeModal();
        setTimeout(() => this.handlePayload(code.data, 'camera'), 100);
      } else {
        // Mode AR Locator: Vẽ box và kêu liên tục nếu đúng
        const isMatch = this.state.targetId && (
           parsed.id.includes(this.state.targetId) || 
           parsed.code.includes(this.state.targetId)
        );

        const color = isMatch ? "#00FF00" : "#FF3333";
        
        this.drawLine(code.location.topLeftCorner, code.location.topRightCorner, color);
        this.drawLine(code.location.topRightCorner, code.location.bottomRightCorner, color);
        this.drawLine(code.location.bottomRightCorner, code.location.bottomLeftCorner, color);
        this.drawLine(code.location.bottomLeftCorner, code.location.topLeftCorner, color);

        if (isMatch) {
          this.beep('success');
          // Vẽ text ở trên QR
          this.state.ctx.font = '24px Arial';
          this.state.ctx.fillStyle = color;
          this.state.ctx.fillText(parsed.code, code.location.topLeftCorner.x, code.location.topLeftCorner.y - 10);
        } else {
          // Báo sai nếu muốn
          // this.beep('error');
        }
      }
    },

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
        return;
      }

      const results = this.searchByCode(list, parsed.code, parsed.kind);
      if (!results.length) {
        alert('対象が見つかりません / Không tìm thấy dữ liệu.\nCode: ' + parsed.code);
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
        return itemId === parsed.id || itemCode === parsed.code; // Loose match fallback
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

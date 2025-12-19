/* tray-stack-counter-r1.0.0.js */
/* Tray Stack Counter (積み重ねカウント) - JP/VI UI (JP first) */
/* Requires: tray-stack-counter-r1.0.0.css, FontAwesome already in project */
/* Integration: add a nav button with id="nav-tray-stack-btn" to open overlay */

(function () {
  'use strict';

  const MODULE_VERSION = 'r1.0.0';

  // ---------- Utilities ----------
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function $(sel, root = document) { return root.querySelector(sel); }

  function createEl(tag, attrs = {}, html = '') {
    const el = document.createElement(tag);
    Object.keys(attrs).forEach(k => {
      if (k === 'class') el.className = attrs[k];
      else if (k === 'style') el.setAttribute('style', attrs[k]);
      else if (k.startsWith('data-')) el.setAttribute(k, attrs[k]);
      else el[k] = attrs[k];
    });
    if (html) el.innerHTML = html;
    return el;
  }

  function safeParseInt(v, fallback) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  function safeParseFloat(v, fallback) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function nowISO() {
    try { return new Date().toISOString(); } catch { return String(Date.now()); }
  }

  async function copyTextToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) {}
    // Fallback
    try {
      const ta = createEl('textarea', { value: text });
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return !!ok;
    } catch (_) {
      return false;
    }
  }

  function clusterPeaks1D(peaksY, clusterGap) {
    const arr = (peaksY || []).slice().sort((a, b) => a - b);
    if (arr.length === 0) return [];
    const gap = Math.max(1, clusterGap | 0);

    const clusters = [];
    let start = arr[0];
    let last = arr[0];
    let maxY = arr[0];
    let count = 1;

    for (let i = 1; i < arr.length; i++) {
      const y = arr[i];
      if (y - last <= gap) {
        // same cluster
        last = y;
        count++;
        // keep representative at center-ish: update maxY to latest (simple)
        maxY = y;
      } else {
        clusters.push(Math.round((start + last) / 2));
        start = y;
        last = y;
        maxY = y;
        count = 1;
      }
    }
    clusters.push(Math.round((start + last) / 2));
    return clusters;
  }

  // ---------- Core algorithm (no OpenCV) ----------
  function computeProfileAndPeaks(imageData, w, h, params) {
    // params:
    // - smoothWindow (odd >= 1)
    // - thresholdK (>= 0)
    // - minPeakDistance (>= 1)
    // - minPeakStrength (>= 0) additional absolute threshold
    // Returns: { profileRaw, profile, peaksY, threshold, stats }
    const data = imageData.data;

    // Profile length = h
    const profileRaw = new Float32Array(h);
    // Compute vertical gradient magnitude per row: avg |I(y)-I(y-1)| across x
    // This emphasizes horizontal edges (seams between stacked trays).
    // Convert to grayscale on the fly.
    for (let y = 1; y < h; y++) {
      let sum = 0;
      const row = y * w * 4;
      const prev = (y - 1) * w * 4;
      for (let x = 0; x < w; x++) {
        const i = row + x * 4;
        const j = prev + x * 4;
        const r1 = data[i], g1 = data[i + 1], b1 = data[i + 2];
        const r0 = data[j], g0 = data[j + 1], b0 = data[j + 2];

        // Rec.709 luma
        const y1 = 0.2126 * r1 + 0.7152 * g1 + 0.0722 * b1;
        const y0 = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;

        sum += Math.abs(y1 - y0);
      }
      profileRaw[y] = sum / w;
    }
    profileRaw[0] = profileRaw[1] || 0;

    // Smooth (moving average)
    const win = Math.max(1, params.smoothWindow | 0);
    const half = (win / 2) | 0;
    const profile = new Float32Array(h);
    for (let y = 0; y < h; y++) {
      let s = 0;
      let c = 0;
      const y0 = Math.max(0, y - half);
      const y1 = Math.min(h - 1, y + half);
      for (let yy = y0; yy <= y1; yy++) { s += profileRaw[yy]; c++; }
      profile[y] = c ? (s / c) : profileRaw[y];
    }

    // 1) Smooth profile (đã có): profile[]
    // 2) High-pass: trừ nền (baseline) để giảm bóng/ánh sáng lớn
    const baseWin = Math.max(21, (params.smoothWindow * 5) | 0);
    const baseHalf = (baseWin / 2) | 0;
    const hp = new Float32Array(h);

    for (let y = 0; y < h; y++) {
      let s = 0, c = 0;
      const y0 = Math.max(0, y - baseHalf);
      const y1 = Math.min(h - 1, y + baseHalf);
      for (let yy = y0; yy <= y1; yy++) { s += profile[yy]; c++; }
      const baseline = c ? (s / c) : profile[y];
      const v = profile[y] - baseline;
      hp[y] = v > 0 ? v : 0;
    }

    // Robust-ish stats on hp
    let mean = 0;
    for (let i = 0; i < h; i++) mean += hp[i];
    mean /= h;

    let varSum = 0;
    for (let i = 0; i < h; i++) {
      const d = hp[i] - mean;
      varSum += d * d;
    }
    const std = Math.sqrt(varSum / Math.max(1, h - 1));

    // Threshold on high-pass signal
    const threshold = Math.max(params.minPeakStrength, mean + params.thresholdK * std);

    // Prominence threshold (tăng độ chắc chắn)
    const promAbs = Math.max(1.5, 0.6 * std);

    // Peak detection with min distance + prominence
    const minDist = Math.max(1, params.minPeakDistance | 0);
    const peaks = [];
    let lastKeptY = -999999;
    let lastKeptVal = -Infinity;

    for (let y = 1; y < h - 1; y++) {
      const v = hp[y];
      if (v <= threshold) continue;
      if (!(v > hp[y - 1] && v >= hp[y + 1])) continue;

      // prominence: so với đáy lân cận trong vùng +/- minDist
      let leftMin = v;
      for (let yy = Math.max(0, y - minDist); yy < y; yy++) leftMin = Math.min(leftMin, hp[yy]);
      let rightMin = v;
      for (let yy = y + 1; yy <= Math.min(h - 1, y + minDist); yy++) rightMin = Math.min(rightMin, hp[yy]);
      const prominence = v - Math.max(leftMin, rightMin);
      if (prominence < promAbs) continue;

      if (peaks.length === 0) {
        peaks.push({ y, v });
        lastKeptY = y;
        lastKeptVal = v;
        continue;
      }

      const dy = y - lastKeptY;
      if (dy >= minDist) {
        peaks.push({ y, v });
        lastKeptY = y;
        lastKeptVal = v;
      } else {
        // Within minDist: keep stronger
        if (v > lastKeptVal) {
          peaks[peaks.length - 1] = { y, v };
          lastKeptY = y;
          lastKeptVal = v;
        }
      }
    }

    return {
      profileRaw,
      profile: hp,          // đổi debug profile sang hp để bạn thấy tín hiệu sạch hơn
      peaksY: peaks.map(p => p.y),
      threshold,
      stats: { mean, std }
    };


    return {
      profileRaw,
      profile,
      peaksY: peaks.map(p => p.y),
      threshold,
      stats: { mean, std }
    };
  }

  function computeModeAndRatio(values) {
    // values: array<int>
    // returns { mode, ratio, countsMap }
    const m = new Map();
    for (const v of values) m.set(v, (m.get(v) || 0) + 1);
    let bestV = null;
    let bestC = 0;
    m.forEach((c, v) => {
      if (c > bestC) { bestC = c; bestV = v; }
    });
    const total = values.length || 1;
    return { mode: bestV === null ? 0 : bestV, ratio: bestC / total, countsMap: m };
  }

  // ---------- Module ----------
  const TrayStackCounter = {
    state: {
      initialized: false,
      opened: false,
      processing: false,
      stream: null,
      track: null,
      rafId: null,
      lastProcessAt: 0,
      fpsLimit: 12,

      // analysis
      analysisWidth: 360,
      analysisHeight: 0, // computed
      roi: { x: 0.74, y: 0.12, w: 0.18, h: 0.76 }, // ratios in analysis canvas
      params: {
        // peak threshold = mean + K*std
        sensitivity: 0.62,     // UI 0..1 -> maps to thresholdK
        thresholdK: 1.35,      // derived
        smoothWindow: 9,       // odd
        minPeakDistance: 12,   // px in ROI space
        minPeakStrength: 3.0   // absolute floor
      },

      // counting logic
      autoOffset: true,       // peaks + 1 when peaks>0
      manualOffset: 1,        // used when autoOffset=false
      recentCounts: [],
      stableWindow: 10,
      stableRequiredRatio: 0.80,

      // ui
      debugDraw: false,
      torchEnabled: false,
      lastResult: { count: 0, stable: false, ratio: 0, peaks: 0, peaksY: [] }
    },

    els: {
      overlay: null,
      dialog: null,
      video: null,
      canvas: null,
      ctx: null,
      debugCanvas: null,
      debugCtx: null,
      roiBox: null,
      roiLabel: null,

      // ui
      statusBadge: null,
      statusDot: null,
      statusText: null,
      resultValue: null,
      resultLabel: null,

      // controls
      sliderSensitivity: null,
      sliderMinDist: null,
      sliderRoiX: null,
      sliderRoiW: null,
      sliderRoiY: null,
      sliderRoiH: null,
      toggleAutoOffset: null,
      sliderManualOffset: null,
      toggleDebug: null,

      btnClose: null,
      btnStartStop: null,
      btnFlip: null,
      btnTorch: null,
      btnApply: null,
      btnCopy: null
    },

    init() {
      if (this.state.initialized) return;

      this._buildUI();
      this._bindGlobalHooks();

      this.state.initialized = true;

      // auto-hook if nav button exists
      const navBtn = document.getElementById('nav-tray-stack-btn');
      if (navBtn) {
        navBtn.addEventListener('click', () => {
          this.open();
        });
      }

      // expose for debugging
      window.TrayStackCounter = this;
      window.dispatchEvent(new CustomEvent('trayStackCounter:ready', { detail: { version: MODULE_VERSION } }));
    },

    async open() {
      if (!this.state.initialized) this.init();
      if (this.state.opened) return;

      this.state.opened = true;
      this.els.overlay.classList.remove('tsc-hidden');

      this._setStatus('warn', '準備中', 'Đang chuẩn bị');
      this._setResult(0, false, 0);

      // Start camera + processing
      await this._startCamera({ preferEnvironment: true });
      this._startProcessingLoop();

      // prevent background scroll
      try { document.body.style.overflow = 'hidden'; } catch (_) {}
    },

    async close() {
      if (!this.state.opened) return;

      this._stopProcessingLoop();
      this._stopCamera();


      this.state.opened = false;
      this.els.overlay.classList.add('tsc-hidden');

      try { document.body.style.overflow = ''; } catch (_) {}
    },

    async toggleStartStop() {
      if (!this.state.opened) return;
      if (this.state.processing) {
        this._stopProcessingLoop();
        this._setStatus('warn', '停止中', 'Đang dừng');
        this.els.btnStartStop.innerHTML = `<i class="fas fa-play"></i>`;
        this.els.btnStartStop.title = '再開 / Tiếp tục';
      } else {
        if (!this.state.stream) await this._startCamera({ preferEnvironment: true });
        this._startProcessingLoop();
        this._setStatus('warn', '解析中', 'Đang phân tích');
        this.els.btnStartStop.innerHTML = `<i class="fas fa-pause"></i>`;
        this.els.btnStartStop.title = '停止 / Dừng';
      }
    },

    async flipCamera() {
      // Switch between environment/user by toggling facingMode
      if (!this.state.opened) return;

      const current = this.state._facingMode || 'environment';
      const next = current === 'environment' ? 'user' : 'environment';

      this._setStatus('warn', 'カメラ切替', 'Đổi camera');

      this._stopProcessingLoop();
      await this._stopCamera();
      await this._startCamera({ preferEnvironment: next === 'environment' });
      this._startProcessingLoop();
    },

    async toggleTorch() {
      if (!this.state.track) {
        this._toast('トーチ不可', 'Không bật đèn');
        return;
      }
      const track = this.state.track;
      const caps = (track.getCapabilities && track.getCapabilities()) ? track.getCapabilities() : {};
      if (!caps.torch) {
        this._toast('トーチ未対応', 'Thiết bị không hỗ trợ đèn');
        return;
      }
      const next = !this.state.torchEnabled;
      try {
        await track.applyConstraints({ advanced: [{ torch: next }] });
        this.state.torchEnabled = next;
        this._toast(next ? 'トーチON' : 'トーチOFF', next ? 'Đèn ON' : 'Đèn OFF');
        this.els.btnTorch.classList.toggle('tsc-btn-primary', next);
      } catch (e) {
        this._toast('トーチ失敗', 'Bật đèn thất bại');
      }
    },

    async applyResult() {
      const res = this.state.lastResult || { count: 0, stable: false, ratio: 0 };
      const payload = {
        count: res.count,
        stable: !!res.stable,
        stableRatio: res.ratio,
        peaks: res.peaks,
        timestamp: nowISO(),
        version: MODULE_VERSION
      };
      document.dispatchEvent(new CustomEvent('trayStackCounter:applied', { detail: payload }));
      await this.close();
    },

    async copyResult() {
      const res = this.state.lastResult || { count: 0, stable: false };
      const txt = String(res.count || 0);
      const ok = await copyTextToClipboard(txt);
      this._toast(ok ? 'コピー完了' : 'コピー失敗', ok ? 'Đã copy' : 'Copy thất bại');
    },

    // ---------- UI ----------
    _buildUI() {
      // Overlay
      const overlay = createEl('div', { class: 'tsc-overlay tsc-hidden', id: 'tray-stack-counter-overlay' });
      const dialog = createEl('div', { class: 'tsc-dialog', role: 'dialog', 'aria-modal': 'true' });

      // Header
      const header = createEl('div', { class: 'tsc-header' }, `
        <div class="tsc-title">
          <div class="tsc-title-main">積み重ねカウント <span style="opacity:.7;font-weight:800">(${MODULE_VERSION})</span></div>
          <div class="tsc-title-sub">カメラで「積み重ね枚数」を自動カウント / Đếm số khay xếp chồng bằng camera</div>
        </div>
        <div class="tsc-header-actions">
          <button class="tsc-btn tsc-btn-icon" id="tsc-btn-flip" title="カメラ切替 / Đổi camera"><i class="fas fa-sync"></i></button>
          <button class="tsc-btn tsc-btn-icon" id="tsc-btn-torch" title="トーチ / Đèn"><i class="fas fa-lightbulb"></i></button>
          <button class="tsc-btn tsc-btn-icon tsc-btn-danger" id="tsc-btn-close" title="閉じる / Đóng"><i class="fas fa-times"></i></button>
        </div>
      `);

      // Video area
      const body = createEl('div', { class: 'tsc-body' });
      const videoWrap = createEl('div', { class: 'tsc-video-wrap' });

      const video = createEl('video', {
        class: 'tsc-video',
        id: 'tsc-video',
        autoplay: true,
        muted: true,
        playsInline: true
      });

      // iOS Safari requires playsinline attribute (and sometimes webkit-playsinline)
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.setAttribute('muted', '');
      video.setAttribute('autoplay', '');


      const canvas = createEl('canvas', { class: 'tsc-hidden', id: 'tsc-canvas-hidden' });
      const debugCanvas = createEl('canvas', { class: 'tsc-canvas tsc-hidden', id: 'tsc-debug-canvas' });

      const roiBox = createEl('div', { class: 'tsc-roi', id: 'tsc-roi-box' });
      const roiLabel = createEl('div', { class: 'tsc-roi-label', id: 'tsc-roi-label' }, 'ROI / 測定エリア');
      roiBox.appendChild(roiLabel);

      videoWrap.appendChild(video);
      videoWrap.appendChild(canvas);
      videoWrap.appendChild(debugCanvas);
      videoWrap.appendChild(roiBox);

      // Panel
      const panel = createEl('div', { class: 'tsc-panel' });

      const row1 = createEl('div', { class: 'tsc-row' }, `
        <div class="tsc-badge" id="tsc-status-badge">
          <span class="tsc-dot" id="tsc-status-dot"></span>
          <span id="tsc-status-text">準備中 / Đang chuẩn bị</span>
        </div>
        <div class="tsc-result" id="tsc-result">
          <span class="tsc-result-label" id="tsc-result-label">検出数 / Số lượng</span>
          <span class="tsc-result-value" id="tsc-result-value">0</span>
        </div>
      `);

      const controls = createEl('div', { class: 'tsc-controls' });

      // Sensitivity
      const c1 = createEl('div', { class: 'tsc-control' }, `
        <div class="tsc-control-title">感度 / Độ nhạy</div>
        <input class="tsc-slider" id="tsc-sensitivity" type="range" min="0" max="100" value="62" />
        <div class="tsc-control-desc">
          大きいほど検出が増える / Tăng để bắt nhiều cạnh hơn
        </div>
      `);

      // Min distance between peaks
      const c2 = createEl('div', { class: 'tsc-control' }, `
        <div class="tsc-control-title">最小間隔 / Khoảng cách tối thiểu</div>
        <input class="tsc-slider" id="tsc-min-dist" type="range" min="4" max="40" value="12" />
        <div class="tsc-control-desc">
          小さいほど近いピークも別扱い / Giảm nếu các lớp sát nhau
        </div>
      `);

      // ROI X/W
      const c3 = createEl('div', { class: 'tsc-control' }, `
        <div class="tsc-control-title">ROI 位置X / Vị trí X</div>
        <input class="tsc-slider" id="tsc-roi-x" type="range" min="50" max="90" value="74" />
        <div class="tsc-control-desc">
          右端の積層の「段差」が見える場所へ / Kéo ROI đến mép có bậc xếp chồng
        </div>
      `);

      const c4 = createEl('div', { class: 'tsc-control' }, `
        <div class="tsc-control-title">ROI 幅W / Độ rộng ROI</div>
        <input class="tsc-slider" id="tsc-roi-w" type="range" min="10" max="35" value="18" />
        <div class="tsc-control-desc">
          細すぎると不安定 / Quá hẹp sẽ nhiễu
        </div>
      `);

      // ROI Y/H
      const c5 = createEl('div', { class: 'tsc-control' }, `
        <div class="tsc-control-title">ROI 位置Y / Vị trí Y</div>
        <input class="tsc-slider" id="tsc-roi-y" type="range" min="0" max="30" value="12" />
        <div class="tsc-control-desc">
          上下の余白を避ける / Tránh vùng trống ở trên/dưới
        </div>
      `);

      const c6 = createEl('div', { class: 'tsc-control' }, `
        <div class="tsc-control-title">ROI 高さH / Chiều cao ROI</div>
        <input class="tsc-slider" id="tsc-roi-h" type="range" min="50" max="95" value="76" />
        <div class="tsc-control-desc">
          積層全体を入れる / Bao phủ vùng xếp chồng
        </div>
      `);

      // Auto offset + debug
      const c7 = createEl('div', { class: 'tsc-control' }, `
        <div class="tsc-control-title">補正 / Bù trừ</div>
        <label class="tsc-toggle">
          <input type="checkbox" id="tsc-auto-offset" checked />
          <span>自動 +1（ピーク→枚数） / Tự +1 (peak→số khay)</span>
        </label>
        <input class="tsc-slider" id="tsc-manual-offset" type="range" min="0" max="2" value="1" disabled />
        <div class="tsc-control-desc">
          自動OFFの場合、手動オフセットを使用 / Tắt tự động thì dùng offset thủ công
        </div>
      `);

      const c8 = createEl('div', { class: 'tsc-control' }, `
        <div class="tsc-control-title">表示 / Hiển thị</div>
        <label class="tsc-toggle">
          <input type="checkbox" id="tsc-debug" />
          <span>デバッグ表示 / Hiện debug</span>
        </label>
        <div class="tsc-control-desc">
          ROI とピーク位置を表示 / Hiện ROI và vị trí peak
        </div>
      `);

      controls.appendChild(c1);
      controls.appendChild(c2);
      controls.appendChild(c3);
      controls.appendChild(c4);
      controls.appendChild(c5);
      controls.appendChild(c6);
      controls.appendChild(c7);
      controls.appendChild(c8);

      const footer = createEl('div', { class: 'tsc-footer' }, `
        <button class="tsc-btn" id="tsc-btn-copy" title="コピー / Copy">
          <i class="fas fa-copy"></i> コピー / Copy
        </button>
        <button class="tsc-btn tsc-btn-primary" id="tsc-btn-apply" title="適用 / Áp dụng">
          <i class="fas fa-check"></i> 適用 / Áp dụng
        </button>
        <button class="tsc-btn tsc-btn-icon" id="tsc-btn-startstop" title="停止 / Dừng">
          <i class="fas fa-pause"></i>
        </button>
      `);

      panel.appendChild(row1);
      panel.appendChild(controls);

      body.appendChild(videoWrap);
      body.appendChild(panel);

      dialog.appendChild(header);
      dialog.appendChild(body);
      dialog.appendChild(footer);
      overlay.appendChild(dialog);

      document.body.appendChild(overlay);

      // bind els
      this.els.overlay = overlay;
      this.els.dialog = dialog;
      this.els.video = video;
      this.els.canvas = canvas;
      this.els.ctx = canvas.getContext('2d', { willReadFrequently: true });

      this.els.debugCanvas = debugCanvas;
      this.els.debugCtx = debugCanvas.getContext('2d');
      this.els.roiBox = roiBox;
      this.els.roiLabel = roiLabel;

      this.els.statusBadge = $('#tsc-status-badge', overlay);
      this.els.statusDot = $('#tsc-status-dot', overlay);
      this.els.statusText = $('#tsc-status-text', overlay);
      this.els.resultValue = $('#tsc-result-value', overlay);
      this.els.resultLabel = $('#tsc-result-label', overlay);

      this.els.sliderSensitivity = $('#tsc-sensitivity', overlay);
      this.els.sliderMinDist = $('#tsc-min-dist', overlay);
      this.els.sliderRoiX = $('#tsc-roi-x', overlay);
      this.els.sliderRoiW = $('#tsc-roi-w', overlay);
      this.els.sliderRoiY = $('#tsc-roi-y', overlay);
      this.els.sliderRoiH = $('#tsc-roi-h', overlay);
      this.els.toggleAutoOffset = $('#tsc-auto-offset', overlay);
      this.els.sliderManualOffset = $('#tsc-manual-offset', overlay);
      this.els.toggleDebug = $('#tsc-debug', overlay);

      this.els.btnClose = $('#tsc-btn-close', overlay);
      this.els.btnStartStop = $('#tsc-btn-startstop', overlay);
      this.els.btnFlip = $('#tsc-btn-flip', overlay);
      this.els.btnTorch = $('#tsc-btn-torch', overlay);
      this.els.btnApply = $('#tsc-btn-apply', overlay);
      this.els.btnCopy = $('#tsc-btn-copy', overlay);

      // Events
      this.els.btnClose.addEventListener('click', () => this.close());
      this.els.btnStartStop.addEventListener('click', () => this.toggleStartStop());
      this.els.btnFlip.addEventListener('click', () => this.flipCamera());
      this.els.btnTorch.addEventListener('click', () => this.toggleTorch());
      this.els.btnApply.addEventListener('click', () => this.applyResult());
      this.els.btnCopy.addEventListener('click', () => this.copyResult());

      // Overlay close by clicking outside dialog (optional)
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.close();
      });

      // Sliders / toggles
      this.els.sliderSensitivity.addEventListener('input', () => {
        const val = safeParseInt(this.els.sliderSensitivity.value, 62);
        this.state.params.sensitivity = clamp(val / 100, 0, 1);
        this._syncDerivedParams();
      });

      this.els.sliderMinDist.addEventListener('input', () => {
        const v = safeParseInt(this.els.sliderMinDist.value, 12);
        this.state.params.minPeakDistance = clamp(v, 4, 40);
      });

      this.els.sliderRoiX.addEventListener('input', () => {
        const v = safeParseInt(this.els.sliderRoiX.value, 74);
        this.state.roi.x = clamp(v / 100, 0.5, 0.9);
        this._updateRoiOverlay();
      });

      this.els.sliderRoiW.addEventListener('input', () => {
        const v = safeParseInt(this.els.sliderRoiW.value, 18);
        this.state.roi.w = clamp(v / 100, 0.1, 0.35);
        this._updateRoiOverlay();
      });

      this.els.sliderRoiY.addEventListener('input', () => {
        const v = safeParseInt(this.els.sliderRoiY.value, 12);
        this.state.roi.y = clamp(v / 100, 0.0, 0.3);
        this._updateRoiOverlay();
      });

      this.els.sliderRoiH.addEventListener('input', () => {
        const v = safeParseInt(this.els.sliderRoiH.value, 76);
        this.state.roi.h = clamp(v / 100, 0.5, 0.95);
        this._updateRoiOverlay();
      });

      this.els.toggleAutoOffset.addEventListener('change', () => {
        this.state.autoOffset = !!this.els.toggleAutoOffset.checked;
        this.els.sliderManualOffset.disabled = this.state.autoOffset;
      });

      this.els.sliderManualOffset.addEventListener('input', () => {
        this.state.manualOffset = clamp(safeParseInt(this.els.sliderManualOffset.value, 1), 0, 2);
      });

      this.els.toggleDebug.addEventListener('change', () => {
        this.state.debugDraw = !!this.els.toggleDebug.checked;
        this.els.debugCanvas.classList.toggle('tsc-hidden', !this.state.debugDraw);
      });

      // Sync derived
      this._syncDerivedParams();
      this._updateRoiOverlay();

      // Resize handler
      window.addEventListener('resize', () => {
        if (this.state.opened) this._updateRoiOverlay();
      });
    },

    _bindGlobalHooks() {
      // ESC to close
      window.addEventListener('keydown', (e) => {
        if (!this.state.opened) return;
        if (e.key === 'Escape') this.close();
      });

      // Optional external open command:
      document.addEventListener('trayStackCounter:open', () => this.open());
      document.addEventListener('trayStackCounter:close', () => this.close());
    },

    _syncDerivedParams() {
      // sensitivity 0..1 -> thresholdK 2.2..0.6 (higher sensitivity => smaller K => easier to pass threshold)
      const s = clamp(this.state.params.sensitivity, 0, 1);
      const thresholdK = 2.2 - (1.6 * s); // s=0 =>2.2, s=1 =>0.6
      this.state.params.thresholdK = thresholdK;

      // also adjust smooth window slightly for stability
      const w = Math.round(7 + 8 * (1 - s)); // s high -> smaller window, s low -> larger window
      this.state.params.smoothWindow = (w % 2 === 0) ? (w + 1) : w;
    },

    _setStatus(kind, jp, vi) {
      const badge = this.els.statusBadge;
      const dot = this.els.statusDot;
      const text = this.els.statusText;

      badge.classList.remove('tsc-ok', 'tsc-danger');
      if (kind === 'ok') badge.classList.add('tsc-ok');
      if (kind === 'danger') badge.classList.add('tsc-danger');

      // dot color driven by class; keep safe
      dot.style.opacity = '1';
      text.textContent = `${jp} / ${vi}`;
    },

    _setResult(count, stable, ratio) {
      this.els.resultValue.textContent = String(count ?? 0);
      if (stable) {
        this._setStatus('ok', `安定 ${Math.round((ratio || 0) * 100)}%`, `Ổn định ${Math.round((ratio || 0) * 100)}%`);
      } else {
        this._setStatus('warn', `解析中`, `Đang phân tích`);
      }
    },

    _toast(jp, vi) {
      // Minimal non-intrusive toast
      let toast = document.getElementById('tsc-toast');
      if (!toast) {
        toast = createEl('div', { id: 'tsc-toast' });
        toast.style.position = 'fixed';
        toast.style.left = '50%';
        toast.style.bottom = '18px';
        toast.style.transform = 'translateX(-50%)';
        toast.style.zIndex = '100000';
        toast.style.padding = '10px 12px';
        toast.style.borderRadius = '12px';
        toast.style.background = 'rgba(0,0,0,0.78)';
        toast.style.color = '#fff';
        toast.style.fontSize = '12px';
        toast.style.fontWeight = '800';
        toast.style.border = '1px solid rgba(255,255,255,0.18)';
        toast.style.boxShadow = '0 14px 40px rgba(0,0,0,0.4)';
        toast.style.maxWidth = '92vw';
        toast.style.textAlign = 'center';
        toast.style.pointerEvents = 'none';
        toast.style.opacity = '0';
        toast.style.transition = 'opacity .18s ease';
        document.body.appendChild(toast);
      }
      toast.textContent = `${jp} / ${vi}`;
      toast.style.opacity = '1';
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        toast.style.opacity = '0';
      }, 900);
    },

    _updateRoiOverlay() {
      // ROI overlay is drawn in CSS percentages relative to video container
      const r = this.state.roi;
      const left = clamp(r.x * 100, 0, 100);
      const top = clamp(r.y * 100, 0, 100);
      const width = clamp(r.w * 100, 1, 100);
      const height = clamp(r.h * 100, 1, 100);

      this.els.roiBox.style.left = `${left}%`;
      this.els.roiBox.style.top = `${top}%`;
      this.els.roiBox.style.width = `${width}%`;
      this.els.roiBox.style.height = `${height}%`;

      // keep within bounds
      this.els.roiBox.style.right = 'auto';
      if (left + width > 100) {
        this.els.roiBox.style.left = `${Math.max(0, 100 - width)}%`;
      }
      if (top + height > 100) {
        this.els.roiBox.style.top = `${Math.max(0, 100 - height)}%`;
      }
    },

    // ---------- Camera ----------
    async _startCamera({ preferEnvironment }) {
      // Stop existing
        // Stop existing (không await để không làm mất user-gesture trên iOS)
      this._stopCamera();


      const video = this.els.video;

      // Prefer back camera
      const facingMode = preferEnvironment ? 'environment' : 'user';
      this.state._facingMode = facingMode;

      const constraintsPrimary = {
        audio: false,
        video: {
          facingMode: { exact: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      const constraintsFallback = {
        audio: false,
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      };

      try {
        this._setStatus('warn', 'カメラ起動', 'Mở camera');
        const stream = await navigator.mediaDevices.getUserMedia(constraintsPrimary);
        this.state.stream = stream;
      } catch (e1) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraintsFallback);
          this.state.stream = stream;
        } catch (e2) {
          this._setStatus('danger', 'カメラ失敗', 'Không mở được camera');
          this._toast('権限/HTTPS確認', 'Kiểm tra quyền camera/HTTPS');
          throw e2;
        }
      }

      // Attach to video
      video.setAttribute('playsinline', '');
      video.setAttribute('webkit-playsinline', '');
      video.muted = true;
      video.autoplay = true;

      video.srcObject = this.state.stream;

      // Try to start ASAP (important for iOS user-gesture timing)
      try {
        const p1 = video.play();
        if (p1 && typeof p1.catch === 'function') p1.catch(() => {});
      } catch (_) {}

      // Wait metadata then retry play
      await new Promise((resolve) => {
        const onReady = () => {
          video.removeEventListener('loadedmetadata', onReady);
          resolve();
        };
        video.addEventListener('loadedmetadata', onReady);
      });

      try {
        const p2 = video.play();
        if (p2 && typeof p2.catch === 'function') {
          p2.catch((err) => {
            console.warn('[TrayStackCounter] video.play() blocked:', err);
            if (typeof this._toast === 'function') this._toast('再生ブロック', 'Video bị chặn');
          });
        }
      } catch (_) {}


      const track = this.state.stream.getVideoTracks()[0] || null;
      this.state.track = track;

      // Torch button state
      try {
        const caps = (track && track.getCapabilities) ? track.getCapabilities() : {};
        const torchOk = !!caps.torch;
        this.els.btnTorch.disabled = !torchOk;
        this.els.btnTorch.style.opacity = torchOk ? '1' : '0.4';
      } catch (_) {
        this.els.btnTorch.disabled = true;
        this.els.btnTorch.style.opacity = '0.4';
      }

      // Setup analysis canvas size
      this._syncCanvasSize();
      this._setStatus('warn', '解析中', 'Đang phân tích');
    },

    async _stopCamera() {
      this.state.torchEnabled = false;
      try { this.els.btnTorch.classList.remove('tsc-btn-primary'); } catch (_) {}

      const stream = this.state.stream;
      if (stream) {
        try {
          stream.getTracks().forEach(t => {
            try { t.stop(); } catch (_) {}
          });
        } catch (_) {}
      }
      this.state.stream = null;
      this.state.track = null;

      try { this.els.video.srcObject = null; } catch (_) {}
    },

    _syncCanvasSize() {
      const video = this.els.video;
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;

      const targetW = clamp(this.state.analysisWidth, 240, 640);
      const targetH = Math.round(targetW * (vh / vw));

      this.state.analysisHeight = clamp(targetH, 180, 720);

      this.els.canvas.width = targetW;
      this.els.canvas.height = this.state.analysisHeight;

      this.els.debugCanvas.width = targetW;
      this.els.debugCanvas.height = this.state.analysisHeight;
    },

    // ---------- Processing loop ----------
    _startProcessingLoop() {
      if (this.state.processing) return;
      this.state.processing = true;
      this.state.recentCounts = [];
      this.state.lastResult = { count: 0, stable: false, ratio: 0, peaks: 0, peaksY: [] };
      this.els.btnStartStop.innerHTML = `<i class="fas fa-pause"></i>`;
      this.els.btnStartStop.title = '停止 / Dừng';

      const tick = (t) => {
        if (!this.state.processing) return;

        if (!this.state.stream || !this.els.video.videoWidth) {
          this.state.rafId = requestAnimationFrame(tick);
          return;
        }

        // Limit fps
        const minInterval = 1000 / clamp(this.state.fpsLimit, 6, 20);
        if (t - this.state.lastProcessAt >= minInterval) {
          this.state.lastProcessAt = t;
          try {
            this._processOneFrame();
          } catch (e) {
            this._setStatus('danger', '解析エラー', 'Lỗi phân tích');
          }
        }

        this.state.rafId = requestAnimationFrame(tick);
      };

      this.state.rafId = requestAnimationFrame(tick);
    },

    _stopProcessingLoop() {
      this.state.processing = false;
      if (this.state.rafId) {
        disputeCancelAnimationFrame(this.state.rafId);
        this.state.rafId = null;
      }
      function disputeCancelAnimationFrame(id) {
        try { cancelAnimationFrame(id); } catch (_) {}
      }
    },

    _processOneFrame() {
      const video = this.els.video;
      const ctx = this.els.ctx;
      const cw = this.els.canvas.width;
      const ch = this.els.canvas.height;

      // Ensure canvas dimension matches current video
      // (Sometimes orientation changes or iOS reports after play)
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      const expectedH = Math.round(cw * (vh / vw));
      if (Math.abs(expectedH - ch) > 2) {
        this._syncCanvasSize();
      }

      // Draw frame (scaled) to hidden canvas
      ctx.drawImage(video, 0, 0, this.els.canvas.width, this.els.canvas.height);

      // ROI in canvas coordinates
      const r = this.state.roi;
      const x = clamp(Math.round(this.els.canvas.width * r.x), 0, this.els.canvas.width - 2);
      const y = clamp(Math.round(this.els.canvas.height * r.y), 0, this.els.canvas.height - 2);
      const w = clamp(Math.round(this.els.canvas.width * r.w), 2, this.els.canvas.width - x);
      const h = clamp(Math.round(this.els.canvas.height * r.h), 2, this.els.canvas.height - y);

      // Extract ROI pixels
      const img = ctx.getImageData(x, y, w, h);

      // Compute peaks
      const params = this.state.params;
      const out = computeProfileAndPeaks(img, w, h, params);

      let peaks = out.peaksY.length;

      // Count logic: peaks -> trays
      let offset = 0;
      if (this.state.autoOffset) offset = peaks > 0 ? 1 : 0;
      else offset = clamp(this.state.manualOffset | 0, 0, 2);

      const count = Math.max(0, peaks + offset);

      // Stability check
      const recent = this.state.recentCounts;
      recent.push(count);
      if (recent.length > this.state.stableWindow) recent.shift();

      const { mode, ratio } = computeModeAndRatio(recent);
      const stable = (recent.length >= Math.min(6, this.state.stableWindow)) &&
                     (ratio >= this.state.stableRequiredRatio) &&
                     (mode > 0);

      const stableCount = stable ? mode : count;

      this.state.lastResult = {
        count: stableCount,
        stable,
        ratio,
        peaks,
        peaksY: out.peaksY
      };

      // Update UI
      this._setResult(stableCount, stable, ratio);

      // Emit live event for external listeners
      document.dispatchEvent(new CustomEvent('trayStackCounter:result', {
        detail: {
          count: stableCount,
          stable,
          stableRatio: ratio,
          peaks,
          timestamp: nowISO(),
          version: MODULE_VERSION
        }
      }));

      // Debug draw
      if (this.state.debugDraw) {
        this._drawDebug(x, y, w, h, out, stableCount, stable);
      } else {
        // ensure hidden
        this.els.debugCanvas.classList.add('tsc-hidden');
      }
    },

    _drawDebug(roiX, roiY, roiW, roiH, out, count, stable) {
      const dc = this.els.debugCanvas;
      const dctx = this.els.debugCtx;
      if (!dc || !dctx) return;

      this.els.debugCanvas.classList.remove('tsc-hidden');

      // Clear
      dctx.clearRect(0, 0, dc.width, dc.height);

      // ROI rect
      dctx.strokeStyle = 'rgba(245, 158, 11, 0.95)';
      dctx.lineWidth = 2;
      dctx.strokeRect(roiX, roiY, roiW, roiH);

      // Peaks lines
      const peaksY = out.peaksY || [];
      dctx.strokeStyle = stable ? 'rgba(34, 197, 94, 0.95)' : 'rgba(239, 68, 68, 0.95)';
      dctx.lineWidth = 2;
      peaksY.forEach(py => {
        const y = roiY + py;
        dctx.beginPath();
        dctx.moveTo(roiX, y);
        dctx.lineTo(roiX + roiW, y);
        dctx.stroke();
      });

      // Info text
      const label = stable ? '安定 / Ổn định' : '解析中 / Đang phân tích';
      const info = `${label} | peaks=${peaksY.length} | count=${count} | thr=${out.threshold.toFixed(2)}`;
      dctx.font = 'bold 12px system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial';
      dctx.fillStyle = 'rgba(255,255,255,0.92)';
      dctx.strokeStyle = 'rgba(0,0,0,0.55)';
      dctx.lineWidth = 3;
      dctx.strokeText(info, 10, 18);
      dctx.fillText(info, 10, 18);

      // Draw simple profile on left of ROI (mini chart) for tuning
      // Normalize profile in ROI area and plot as polyline
      try {
        const prof = out.profile;
        if (prof && prof.length > 5) {
          let minV = Infinity, maxV = -Infinity;
          for (let i = 0; i < prof.length; i++) {
            const v = prof[i];
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
          }
          const span = Math.max(1e-6, maxV - minV);

          const chartX = Math.max(6, roiX - 54);
          const chartW = 48;
          const chartY = roiY;
          const chartH = roiH;

          // Chart background
          dctx.fillStyle = 'rgba(0,0,0,0.25)';
          dctx.fillRect(chartX, chartY, chartW, chartH);
          dctx.strokeStyle = 'rgba(255,255,255,0.22)';
          dctx.lineWidth = 1;
          dctx.strokeRect(chartX, chartY, chartW, chartH);

          // Threshold line (mapped)
          const thrNorm = (out.threshold - minV) / span;
          const thrX = chartX + clamp(Math.round(thrNorm * chartW), 0, chartW);
          dctx.strokeStyle = 'rgba(245, 158, 11, 0.85)';
          dctx.beginPath();
          dctx.moveTo(thrX, chartY);
          dctx.lineTo(thrX, chartY + chartH);
          dctx.stroke();

          // Profile polyline (x=normalized value, y=row)
          dctx.strokeStyle = stable ? 'rgba(34, 197, 94, 0.95)' : 'rgba(239, 68, 68, 0.9)';
          dctx.lineWidth = 1.5;
          dctx.beginPath();
          for (let py = 0; py < prof.length; py++) {
            const v = prof[py];
            const nx = (v - minV) / span;
            const px = chartX + nx * chartW;
            const yy = chartY + py;
            if (py === 0) dctx.moveTo(px, yy);
            else dctx.lineTo(px, yy);
          }
          dctx.stroke();
        }
      } catch (_) {}
    }
  };

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      try { TrayStackCounter.init(); } catch (_) {}
    }, { once: true });
  } else {
    try { TrayStackCounter.init(); } catch (_) {}
  }

})();


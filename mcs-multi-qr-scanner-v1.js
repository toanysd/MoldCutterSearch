// mcs-multi-qr-scanner-v1.js
// MVP scanner helper for MoldCutterSearch
(function () {
  'use strict';

  if (window.MCSMultiQRScanner) return;

  const DEFAULT_REGIONS = [
    { key: 'full', x: 0.00, y: 0.00, w: 1.00, h: 1.00 },
    { key: 'center', x: 0.15, y: 0.15, w: 0.70, h: 0.70 },
    { key: 'tl', x: 0.00, y: 0.00, w: 0.50, h: 0.50 },
    { key: 'tr', x: 0.50, y: 0.00, w: 0.50, h: 0.50 },
    { key: 'bl', x: 0.00, y: 0.50, w: 0.50, h: 0.50 },
    { key: 'br', x: 0.50, y: 0.50, w: 0.50, h: 0.50 }
  ];

  function now() { return Date.now(); }

  function normalizeCode(raw) {
    return String(raw || '').replace(/[\s\-]/g, '').toUpperCase();
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function copyImageData(ctx, sx, sy, sw, sh) {
    try { return ctx.getImageData(sx, sy, sw, sh); } catch (e) { return null; }
  }

  function tryDecodeWithJsQR(imageData) {
    if (!imageData || !window.jsQR) return null;
    try {
      return window.jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth'
      }) || null;
    } catch (e) { return null; }
  }

  function mapPoint(point, sx, sy) {
    return point ? { x: point.x + sx, y: point.y + sy } : null;
  }

  function mapLocation(location, sx, sy) {
    if (!location) return null;
    return {
      topLeftCorner: mapPoint(location.topLeftCorner, sx, sy),
      topRightCorner: mapPoint(location.topRightCorner, sx, sy),
      bottomRightCorner: mapPoint(location.bottomRightCorner, sx, sy),
      bottomLeftCorner: mapPoint(location.bottomLeftCorner, sx, sy)
    };
  }

  function dedupeResults(results) {
    const map = new Map();
    results.forEach((r) => {
      const key = normalizeCode(r.data);
      if (!key) return;
      if (!map.has(key)) map.set(key, r);
    });
    return Array.from(map.values());
  }

  function buildRegionPixels(canvas, region) {
    const sx = clamp(Math.floor(canvas.width * region.x), 0, canvas.width - 1);
    const sy = clamp(Math.floor(canvas.height * region.y), 0, canvas.height - 1);
    const sw = clamp(Math.floor(canvas.width * region.w), 1, canvas.width - sx);
    const sh = clamp(Math.floor(canvas.height * region.h), 1, canvas.height - sy);
    return { sx, sy, sw, sh };
  }

  const api = {
    normalizeCode,

    scanRegions(canvas, ctx, options) {
      const opts = options || {};
      const regions = Array.isArray(opts.regions) && opts.regions.length ? opts.regions : DEFAULT_REGIONS;
      const raw = [];

      for (let i = 0; i < regions.length; i++) {
        const region = regions[i];
        const box = buildRegionPixels(canvas, region);
        const imageData = copyImageData(ctx, box.sx, box.sy, box.sw, box.sh);
        const code = tryDecodeWithJsQR(imageData);
        if (!code || !code.data) continue;

        raw.push({
          data: code.data,
          normCode: normalizeCode(code.data),
          regionKey: region.key || ('region-' + i),
          location: mapLocation(code.location, box.sx, box.sy),
          ts: now()
        });
      }

      return dedupeResults(raw);
    },

    drawBox(ctx, location, style) {
      if (!ctx || !location || !location.topLeftCorner) return;
      const s = style || {};
      ctx.save();
      ctx.strokeStyle = s.strokeStyle || '#22c55e';
      ctx.lineWidth = s.lineWidth || 4;
      ctx.fillStyle = s.fillStyle || 'rgba(34,197,94,0.12)';
      ctx.beginPath();
      ctx.moveTo(location.topLeftCorner.x, location.topLeftCorner.y);
      ctx.lineTo(location.topRightCorner.x, location.topRightCorner.y);
      ctx.lineTo(location.bottomRightCorner.x, location.bottomRightCorner.y);
      ctx.lineTo(location.bottomLeftCorner.x, location.bottomLeftCorner.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    },

    drawLabel(ctx, location, text, style) {
      if (!ctx || !location || !location.topLeftCorner || !text) return;
      const s = style || {};
      const x = location.topLeftCorner.x;
      const y = Math.max(18, location.topLeftCorner.y - 10);
      ctx.save();
      ctx.font = s.font || 'bold 16px sans-serif';
      const padX = 8;
      const padY = 6;
      const w = ctx.measureText(text).width + padX * 2;
      const h = 26;
      ctx.fillStyle = s.bg || '#22c55e';
      ctx.fillRect(x, y - h, w, h);
      ctx.fillStyle = s.color || '#ffffff';
      ctx.fillText(text, x + padX, y - padY);
      ctx.restore();
    },

    captureFrame(video, canvas, ctx) {
      if (!video || !canvas || !ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        return canvas.toDataURL('image/jpeg', 0.92);
      } catch (e) {
        return null;
      }
    }
  };

  window.MCSMultiQRScanner = api;
})();

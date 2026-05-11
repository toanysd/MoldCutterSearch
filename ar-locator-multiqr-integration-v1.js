// ar-locator-multiqr-integration-v1.js
// Patch-style helper để tham khảo tích hợp vào ar-locator-module.js hiện tại
(function () {
  'use strict';

  if (window.ARLocatorMultiQRPatch) return;

  const Patch = {
    normalizeCode(raw) {
      if (window.MCSMultiQRScanner?.normalizeCode) return window.MCSMultiQRScanner.normalizeCode(raw);
      return String(raw || '').replace(/[\s\-]/g, '').toUpperCase();
    },

    ensureState(ARL) {
      if (!ARL || !ARL.state) return;
      if (!ARL.state.batchSeenSet) ARL.state.batchSeenSet = new Set();
      if (!Array.isArray(ARL.state.batchScanHits)) ARL.state.batchScanHits = [];
      if (!ARL.state.singleLastHitAt) ARL.state.singleLastHitAt = 0;
    },

    matchSingleTarget(ARL, scanResults) {
      this.ensureState(ARL);
      if (!ARL.state.singleTarget || !scanResults || !scanResults.length) return null;
      const targetCode = this.normalizeCode(ARL.state.singleTarget.code || ARL.state.singleTarget.normCode);
      return scanResults.find(r => r.normCode === targetCode) || null;
    },

    applySingleHit(ARL, hit) {
      if (!ARL || !hit) return false;
      const current = Date.now();
      if (current - (ARL.state.singleLastHitAt || 0) < 1200) return false;
      ARL.state.singleLastHitAt = current;

      if (ARL.state.ctx && window.MCSMultiQRScanner) {
        window.MCSMultiQRScanner.drawBox(ARL.state.ctx, hit.location, {
          strokeStyle: '#22c55e',
          fillStyle: 'rgba(34,197,94,0.16)',
          lineWidth: 5
        });
        window.MCSMultiQRScanner.drawLabel(ARL.state.ctx, hit.location, ARL.state.singleTarget.code || hit.data, {
          bg: '#22c55e', color: '#fff'
        });
      }

      if (window.MCSMultiQRScanner && ARL.state.video && ARL.state.canvas && ARL.state.ctx) {
        ARL.state.foundImage = window.MCSMultiQRScanner.captureFrame(ARL.state.video, ARL.state.canvas, ARL.state.ctx);
      }

      if (typeof ARL.beep === 'function') {
        try { ARL.beep(); } catch (e) {}
      }

      if (typeof ARL.renderBody === 'function') ARL.renderBody();
      return true;
    },

    applyBatchHits(ARL, scanResults) {
      this.ensureState(ARL);
      if (!Array.isArray(ARL.state.batchList) || !scanResults || !scanResults.length) return [];

      const matched = [];
      scanResults.forEach((hit) => {
        const hitCode = this.normalizeCode(hit.data);
        if (!hitCode || ARL.state.batchSeenSet.has(hitCode)) return;

        const idx = ARL.state.batchList.findIndex(item => this.normalizeCode(item.normCode || item.code) === hitCode);
        if (idx < 0) return;

        ARL.state.batchSeenSet.add(hitCode);
        ARL.state.batchList[idx].checked = true;
        ARL.state.batchList[idx].checkedAt = new Date().toISOString();
        ARL.state.highlightIdx = idx;
        matched.push({ index: idx, item: ARL.state.batchList[idx], hit });
      });

      if (matched.length && typeof ARL.renderBody === 'function') ARL.renderBody();
      return matched;
    },

    buildSupabaseRows(ARL) {
      const rows = [];
      const list = Array.isArray(ARL?.state?.batchList) ? ARL.state.batchList : [];
      list.forEach((item) => {
        if (!item.checked) return;
        rows.push({
          device_code: String(item.code || ''),
          device_kind: String(item.kind || ''),
          checked_at: item.checkedAt || new Date().toISOString(),
          checked_by: String(window.AuthModule?.currentUser?.email || 'unknown'),
          source: 'ar-batch-audit'
        });
      });
      return rows;
    },

    async batchUpsertToSupabase(ARL, tableName) {
      const sb = window.api?.check ? window.api.check() : (window.supabaseClient || null);
      if (!sb) throw new Error('Supabase client unavailable');
      const table = tableName || 'inventory_audit_logs';
      const rows = this.buildSupabaseRows(ARL);
      if (!rows.length) return { data: [], error: null };
      return await sb.from(table).upsert(rows, { onConflict: 'device_code,checked_at' }).select();
    },

    scanCurrentFrame(ARL) {
      if (!ARL || !ARL.state || !ARL.state.canvas || !ARL.state.ctx || !window.MCSMultiQRScanner) return [];
      return window.MCSMultiQRScanner.scanRegions(ARL.state.canvas, ARL.state.ctx, {});
    }
  };

  window.ARLocatorMultiQRPatch = Patch;
})();

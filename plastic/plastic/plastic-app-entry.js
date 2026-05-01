/**
 * plastic-app-entry.js
 * File gọi cuối để khởi tạo toàn bộ hệ thống quản lý nhựa.
 * Dùng router mới plastic-router-ui.js và ưu tiên 4 màn hình nghiệp vụ mới.
 * Tự tìm container, nhận supabase từ tham số hoặc từ window.
 */

const PlasticAppEntry = (() => {
  const DEFAULT_CONTAINER_ID = 'plastic-app-root';

  function init(options = {}) {
    const supabase = options.supabase || _getSupabaseFromWindow();
    const containerId = options.containerId || DEFAULT_CONTAINER_ID;
    const defaultTab = options.defaultTab || 'dashboard';
    const containerEl = document.getElementById(containerId);

    if (!containerEl) {
      console.error(`[PlasticAppEntry] Không tìm thấy container #${containerId}`);
      return;
    }

    if (!supabase) {
      containerEl.innerHTML = _renderError(
        'Chưa tìm thấy kết nối Supabase.',
        'Hãy truyền options.supabase khi gọi init(), hoặc gắn client vào window.supabase / window.__supabase / window.supabaseClient.'
      );
      return;
    }

    containerEl.innerHTML = `
      <div class="pae-shell">
        <div class="pae-loading">Đang khởi tạo hệ thống quản lý nhựa…</div>
      </div>`;

    try {
      _injectStyles();
      PlasticRouterUI.init(supabase, containerId, {
        defaultTab,
        dashboard: options.dashboard || {},
        master: options.master || {},
        receipt: options.receipt || {},
        stock: options.stock || {},
        usage: options.usage || {},
        adjustment: options.adjustment || {},
      });
    } catch (err) {
      containerEl.innerHTML = _renderError(
        'Không thể khởi tạo hệ thống quản lý nhựa.',
        err?.message || String(err)
      );
      console.error('[PlasticAppEntry] Lỗi khởi tạo:', err);
    }
  }

  function mount(options = {}) {
    init(options);
  }

  function boot(options = {}) {
    init(options);
  }

  function _getSupabaseFromWindow() {
    if (typeof window === 'undefined') return null;
    return window.supabase
      || window.__supabase
      || window.supabaseClient
      || window.__SUPABASE__
      || null;
  }

  function _renderError(title, detail) {
    return `
      <div class="pae-shell">
        <div class="pae-error-card">
          <div class="pae-error-title">⚠️ ${_escapeHtml(title)}</div>
          <div class="pae-error-detail">${_escapeHtml(detail || '')}</div>
        </div>
      </div>`;
  }

  function _escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _injectStyles() {
    if (document.getElementById('plastic-app-entry-style')) return;
    const style = document.createElement('style');
    style.id = 'plastic-app-entry-style';
    style.textContent = `
.pae-shell{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;min-height:120px;border-radius:14px}
.pae-loading{background:#eff6ff;border:1px solid #bfdbfe;color:#1d4ed8;border-radius:12px;padding:12px 14px;font-size:13px;font-weight:700}
.pae-error-card{background:#fff;border:1px solid #fecaca;border-radius:14px;padding:16px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.pae-error-title{font-size:15px;font-weight:800;color:#b91c1c;margin-bottom:6px}
.pae-error-detail{font-size:13px;line-height:1.5;color:#7f1d1d;white-space:pre-wrap}
`;
    document.head.appendChild(style);
  }

  return {
    init,
    mount,
    boot,
  };
})();

if (typeof window !== 'undefined') {
  window.PlasticAppEntry = PlasticAppEntry;
}


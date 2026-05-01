/**
 * plastic-router-ui.js
 * Router tổng cho hệ thống quản lý nhựa.
 * Bản này ưu tiên dùng các file tên mới không có hậu tố phiên bản,
 * nhưng vẫn giữ fallback sang các file cũ để không làm gãy hệ thống.
 */

const PlasticRouterUI = (() => {
  let supabase = null;
  let containerEl = null;
  let options = {};

  const state = {
    activeTab: 'dashboard',
    mounted: {},
    loading: false,
  };

  const tabDefs = [
    {
      key: 'dashboard',
      labelJa: 'ダッシュボード', labelVi: 'Tổng quan kho',
      icon: '📊',
      title: 'Tổng quan nhựa',
      desc: 'Xem nhanh tồn kho, cảnh báo, nhập, xuất dùng và điều chỉnh.',
      loader: () => loadModuleByCandidates([
        './plastic-dashboard-ui.js',
        './plastic-dashboard-ui-v8.0.1.js',
      ]),
    },
    {
      key: 'master',
      labelJa: 'マスタ', labelVi: 'Mã chuẩn',
      icon: '🧩',
      title: 'Danh mục mã chuẩn',
      desc: 'Quản lý mã chuẩn công ty, map mã hàng và chuẩn hóa dữ liệu.',
      loader: () => loadModuleByCandidates([
        './plastic-master-ui.js',
        './plastic-master-ui-v8.0.1.js',
        './plastic-manager-ui-v8.0.1.js',
        './plastic-code-master-ui-v8.0.1.js',
      ]),
    },
    {
      key: 'receipt',
      labelJa: '入庫', labelVi: 'Nhập kho',
      icon: '📥',
      title: 'Nhập kho cuộn nhựa',
      desc: 'Lập phiếu nhập, tạo cuộn nhập và lưu lot, kích thước, nhà cung cấp.',
      loader: () => loadModuleByCandidates([
        './plastic-receipt-ui.js',
        './plastic-receipt-ui-v8.0.1.js',
        './plastic-receipt-entry-ui-v8.0.1.js',
      ]),
    },
    {
      key: 'usage',
      labelJa: '使用', labelVi: 'Xuất dùng',
      icon: '✂️',
      title: 'Xuất dùng cho sản xuất',
      desc: 'Trừ mét sử dụng trực tiếp trên từng cuộn và lưu lịch sử xuất dùng.',
      loader: () => loadModuleByCandidates([
        './plastic-usage-ui.js',
        './plastic-usage-ui-v8.0.1.js',
      ]),
    },
    {
      key: 'stock',
      labelJa: '在庫', labelVi: 'Tồn kho',
      icon: '📦',
      title: 'Danh sách cuộn tồn',
      desc: 'Xem toàn bộ cuộn, lọc theo kho, trạng thái, kích thước và lot.',
      loader: () => loadModuleByCandidates([
        './plastic-stock-ui.js',
        './plastic-stock-ui-v8.0.1.js',
        './plastic-roll-stock-ui-v8.0.1.js',
      ]),
    },
    {
      key: 'adjustment',
      labelJa: '調整', labelVi: 'Điều chỉnh',
      icon: '🛠️',
      title: 'Điều chỉnh tồn ngoài sản xuất',
      desc: 'Cộng, trừ, kiểm kê, trả hàng, hỏng và sửa tay mét tồn.',
      loader: () => loadModuleByCandidates([
        './plastic-adjustment-ui.js',
        './plastic-adjustment-ui-v8.0.1.js',
      ]),
    },
    {
      key: 'dictionary',
      labelJa: '辞書', labelVi: 'Từ điển',
      icon: '📖',
      title: 'Từ điển & Hướng dẫn',
      desc: 'Kho tri thức giải thích mã nhựa, đặc tính và các từ viết tắt chuyên nghành.',
      loader: () => loadModuleByCandidates([
        './plastic-dictionary-ui-v2.js',
        './plastic-dictionary-ui.js',
      ]),
    },
  ];

  function init(supabaseClient, containerId, nextOptions = {}) {
    supabase = supabaseClient;
    containerEl = document.getElementById(containerId);
    options = nextOptions || {};

    if (!containerEl) {
      console.error('PlasticRouterUI Không tìm thấy container', containerId);
      return;
    }

    if (options.defaultTab && tabDefs.find(tab => tab.key === options.defaultTab)) {
      state.activeTab = options.defaultTab;
    }

    injectStyles();
    renderShell();
    openTab(state.activeTab);

    document.addEventListener('plasticSearch', (e) => {
      const q = e.detail && e.detail.query ? String(e.detail.query).trim() : '';
      openTab('stock').then(() => {
         const stockModule = state.mounted['stock'];
         if (stockModule && typeof stockModule.setGlobalSearch === 'function') {
           stockModule.setGlobalSearch(q);
         }
      });
    });
  }

  function renderShell() {
    containerEl.innerHTML = `
<div class="view-panel active" id="panel-plastic" style="overflow:hidden; display:flex !important; flex-direction:column; height: 100%;">
  <div class="module-tabs" id="pr-menu">${renderMenu()}</div>
  
  <div class="content" style="padding: 0; flex: 1; display:flex; flex-direction:column; min-width: 0; overflow:hidden; position: relative;">
    <div id="pr-loading" class="pr-loading" style="display:none">Đang mở màn hình...</div>
    <div id="pr-missing" class="pr-missing" style="display:none"></div>
    <div id="pr-tabs-host" style="flex:1; overflow-y:auto;"></div>
  </div>
</div>`;

    ensureTabHosts();
  }

  function renderMenu() {
    return tabDefs.map(tab => `
      <button class="tab-btn ${state.activeTab === tab.key ? 'active' : ''}" onclick="PlasticRouterUI.openTab('${escAttr(tab.key)}')">
        <span class="ja">${esc(tab.labelJa)} ${tab.key === 'dashboard' ? '<span class="badge">Live</span>' : ''}</span>
        <span class="vi">${esc(tab.labelVi)}</span>
      </button>
    `).join('');
  }

  function renderMainHead() {
    const tab = getActiveTabDef();
    return `
      <div>
        <div class="pr-main-title">${tab ? esc(tab.title) : ''}</div>
        <div class="pr-main-desc">${tab ? esc(tab.desc) : ''}</div>
      </div>
    `;
  }

  function ensureTabHosts() {
    const host = document.getElementById('pr-tabs-host');
    if (!host) return;

    tabDefs.forEach(tab => {
      let panel = document.getElementById(panelId(tab.key));
      if (!panel) {
        panel = document.createElement('div');
        panel.id = panelId(tab.key);
        panel.className = 'pr-tab-panel';
        panel.style.display = 'none';
        panel.innerHTML = `<div id="${mountId(tab.key)}" class="pr-module-host"></div>`;
        host.appendChild(panel);
      }
    });
  }

  async function openTab(tabKey) {
    const tab = tabDefs.find(item => item.key === tabKey);
    if (!tab) return;

    state.activeTab = tabKey;
    refreshHeadAndMenu();
    hideMissing();
    showOnlyActivePanel();

    if (state.mounted[tabKey]) return;

    setLoading(true);

    try {
      const moduleRef = await tab.loader();
      const component = pickInitModule(moduleRef);

      if (!component || typeof component.init !== 'function') {
        throw new Error('Module không có hàm init.');
      }

      component.init(supabase, mountId(tabKey), options[tabKey] || {});
      state.mounted[tabKey] = component;
    } catch (err) {
      showMissing(`
        <div class="pr-missing-title">Chưa mở được màn hình này</div>
        <div class="pr-missing-text">${esc(err?.message || 'Không rõ lỗi')}</div>
        <div class="pr-missing-note">Tab này đang chờ file module đúng tên hoặc đúng đường dẫn.</div>
        <div class="pr-missing-list">Các tên file đang thử:<br>${getCandidateText(tabKey)}</div>
      `);
    } finally {
      setLoading(false);
    }
  }

  // Map cố định: tab key -> tên biến window
  var WINDOW_MODULE_MAP = {
    'plastic-dashboard-ui':    'PlasticDashboardUI',
    'plastic-master-ui':       'PlasticMasterUI',
    'plastic-receipt-ui':      'PlasticReceiptUI',
    'plastic-receipt-entry-ui':'PlasticReceiptUI',
    'plastic-stock-ui':        'PlasticStockUI',
    'plastic-roll-stock-ui':   'PlasticStockUI',
    'plastic-usage-ui':        'PlasticUsageUI',
    'plastic-adjustment-ui':   'PlasticAdjustmentUI',
    'plastic-dictionary-ui':   'PlasticDictionaryUI',
  };

  function loadModuleByCandidates(candidates) {
    for (var i = 0; i < candidates.length; i++) {
      var path = candidates[i];
      // Lấy tên file không có version suffix: ./plastic-receipt-ui-v8.0.1.js -> plastic-receipt-ui
      var base = path.replace(/^.*\//, '').replace(/\.js$/, '').replace(/-v[0-9]+.*$/, '');
      var varName = WINDOW_MODULE_MAP[base];
      if (!varName) {
        // Fallback: thử tra window theo base name
        varName = base.split('-').map(function(s){
          if (s === 'ui') return 'UI';
          return s.charAt(0).toUpperCase() + s.slice(1);
        }).join('');
      }
      if (window[varName] && typeof window[varName].init === 'function') {
        return Promise.resolve({ default: window[varName] });
      }
    }
    return Promise.reject(new Error('Module chua duoc load. Kiem tra thu tu <script> trong index.html.'));
  }

  function pickInitModule(moduleRef) {
    if (!moduleRef) return null;

    if (moduleRef.default && typeof moduleRef.default.init === 'function') {
      return moduleRef.default;
    }

    for (const key of Object.keys(moduleRef)) {
      const item = moduleRef[key];
      if (item && typeof item.init === 'function') {
        return item;
      }
    }

    return null;
  }

  function showOnlyActivePanel() {
    tabDefs.forEach(tab => {
      const panel = document.getElementById(panelId(tab.key));
      if (panel) {
        panel.style.display = tab.key === state.activeTab ? 'block' : 'none';
      }
    });
  }

  function refreshHeadAndMenu() {
    const menu = document.getElementById('pr-menu');
    if (menu) menu.innerHTML = renderMenu();

    const head = document.getElementById('pr-main-head');
    if (head) head.innerHTML = renderMainHead();
  }

  async function reloadActive() {
    const tabKey = state.activeTab;
    const mounted = state.mounted[tabKey];

    if (mounted && typeof mounted.reload === 'function') {
      try {
        await mounted.reload();
        return;
      } catch (err) {
        showToast(err?.message || String(err), 'error');
        return;
      }
    }

    const panel = document.getElementById(panelId(tabKey));
    const mount = document.getElementById(mountId(tabKey));
    if (panel && mount) {
      mount.innerHTML = '';
      state.mounted[tabKey] = null;
      await openTab(tabKey);
    }
  }

  function getActiveTabDef() {
    return tabDefs.find(tab => tab.key === state.activeTab) || tabDefs[0];
  }

  function getCandidateText(tabKey) {
    const tab = tabDefs.find(item => item.key === tabKey);
    if (!tab) return '';
    const raw = String(tab.loader);
    const match = raw.match(/\[(.*?)\]/s);
    if (!match) return '';
    return match[1].replace(/'/g, '').replace(/,/g, '<br>');
  }

  function panelId(tabKey) {
    return `pr-panel-${tabKey}`;
  }

  function mountId(tabKey) {
    return `pr-mount-${tabKey}`;
  }

  function setLoading(flag) {
    state.loading = !!flag;
    const el = document.getElementById('pr-loading');
    if (el) el.style.display = flag ? 'flex' : 'none';
  }

  function showMissing(html) {
    const el = document.getElementById('pr-missing');
    if (!el) return;
    el.innerHTML = html;
    el.style.display = 'block';
  }

  function hideMissing() {
    const el = document.getElementById('pr-missing');
    if (!el) return;
    el.innerHTML = '';
    el.style.display = 'none';
  }

  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escAttr(value) {
    return esc(value).replace(/`/g, '');
  }

  function showToast(message, type = 'info') {
    let wrap = document.getElementById('pr-toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'pr-toast-wrap';
      wrap.className = 'pr-toast-wrap';
      document.body.appendChild(wrap);
    }

    const el = document.createElement('div');
    el.className = `pr-toast pr-toast-${type}`;
    el.textContent = message;
    wrap.appendChild(el);

    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    }, 2600);
  }

  function injectStyles() {
    if (document.getElementById('pr-styles')) return;

    const style = document.createElement('style');
    style.id = 'pr-styles';
    style.textContent = `
.pr-wrap{font-family:Segoe UI,Arial,sans-serif;background:#f8fafc;color:#1e293b;min-height:100vh}

/* Module Tabs (A+) */
.module-tabs-container {
  padding: 0 24px;
  background: var(--bg-white, #fff);
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}
.module-tabs {
  display: flex; gap: 8px; overflow-x: auto;
  scrollbar-width: none;
}
.module-tabs::-webkit-scrollbar { display: none; }

.m-tab {
  background: transparent; border: none; padding: 12px 16px;
  cursor: pointer; border-bottom: 3px solid transparent;
  transition: all 0.2s ease; display: block; text-align: left;
}
.m-tab:hover { background: #f8fafc; }
.m-tab.active { border-bottom-color: var(--ui-accent, #0ea5e9); background: #f0f9ff; }

.m-tab-title {
  font-size: 13px; font-weight: 800; color: #334155;
  display: flex; align-items: center; gap: 6px;
}
.m-tab.active .m-tab-title { color: var(--ui-accent, #0ea5e9); }
.vi-badge { font-size: 8px; font-weight: 800; color: #10b981; text-transform: uppercase; }
.m-tab-subtitle { font-size: 10px; color: #64748b; font-weight: 600; margin-top: 2px; }

/* Main layout no longer has sidebar */
.pr-layout { display: block; min-height: calc(100vh - 60px); }
.pr-main { display: flex; flex-direction: column; min-width: 0; padding: 24px; }
.pr-main-body { position: relative; min-height: 400px; }
.pr-loading {
  position: absolute; top: 14px; right: 18px; z-index: 5;
  display: flex; align-items: center; gap: 8px;
  background: #334155; color: #fff; border-radius: 999px; padding: 8px 12px;
  font-size: 12px; font-weight: 700; box-shadow: 0 8px 20px rgba(0,0,0,.1);
}
.pr-missing{margin:18px;border:1px dashed #d6deef;background:#fff;border-radius:14px;padding:16px;color:#475467}
.pr-missing-title{font-size:15px;font-weight:700;color:#22337b}
.pr-missing-text{margin-top:6px;font-size:12px}
.pr-missing-note{margin-top:8px;font-size:12px}
.pr-missing-list{margin-top:10px;padding:10px;background:#f8faff;border-radius:10px;font-family:monospace;font-size:12px}
.pr-toast-wrap{position:fixed;right:18px;bottom:18px;display:flex;flex-direction:column;gap:8px;z-index:10000}
.pr-toast{opacity:0;transform:translateY(10px);transition:all .2s ease;border-radius:10px;padding:10px 14px;color:#fff;font-size:12px;font-weight:700;box-shadow:0 8px 20px rgba(15,23,42,.18)}
.pr-toast.show{opacity:1;transform:translateY(0)}.pr-toast-info{background:#334155}.pr-toast-error{background:#c62828}
@media (max-width:960px){.pr-main { padding: 12px; }}
`;

    document.head.appendChild(style);
  }

  return {
    init,
    openTab,
    reloadActive,
  };
})();

if (typeof window !== 'undefined') {
  window.PlasticRouterUI = PlasticRouterUI;
}


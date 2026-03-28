/* ============================================================================
DetailPanel AssistiveTouch Module v8.4.3-2

Cập nhật theo yêu cầu:
- Có mục Thiết lập ở cả action bar và trong menu AssistiveTouch
- Menu AssistiveTouch: căn giữa theo chiều ngang màn hình, và tâm menu thẳng hàng ngang với nút AssistiveTouch (giống iPhone)
- Nút Thiết lập ở action bar: đổi sang dạng button đồng bộ với action (không bị mờ/không thấy)
- Các nút action hiển thị nhãn Nhật | Việt (JP | VI)

Tương thích:
- Không phá cơ chế action sẵn có của DetailPanel: .dp-action-btn + data-action
- Nút Thiết lập KHÔNG dispatch data-action để tránh DetailPanel xử lý nhầm
- Chỉ hiển thị action ở tab Thông tin (Info)

Yêu cầu CSS:
- Khuyến nghị dùng detail-panel-v8.4.3-6.css
- Module có thêm 1 ít style tối thiểu để settings/menu dễ nhìn kể cả khi CSS thiếu

Updated: 2026-03-03
============================================================================ */

(function(){
  'use strict';

  const VERSION = 'v8.5.7-3';
  const STORAGE_KEY = 'dp_assistive_touch__v8.5.7-3';

  const DEFAULT_CONFIG = {
    enabled: true,
    mode: 'bar',
    icon_only: false,
    enabled_actions: ['inout','move','inventory','qr','teflon','photo'],
    assistive_pos: { left: 14, top: null, right: null, bottom: null }
  };

  // JP/VI labels
  const ACTIONS = [
    { key:'qu-weight', jp:'重量',      vi:'Khối lượng',  icon:'fas fa-weight-hanging'},
    { key:'qu-design', jp:'設計',      vi:'Thiết kế',    icon:'fas fa-ruler-combined'},
    { key:'qu-lifecycle', jp:'運用',   vi:'Vận hành',    icon:'fas fa-truck-loading'},
    { key:'inout',     jp:'入出庫・位置変更',  vi:'Nhập Xuất, Đổi vị trí', icon: 'fas fa-map-marker-alt' },
    { key:'move',      jp:'移動',    vi:'Di chuyển',   icon:'fas fa-map-signs' },
    { key:'inventory', jp:'棚卸',    vi:'Kiểm kê',     icon:'fas fa-clipboard-check' },
    { key:'teflon',    jp:'テフロン', vi:'Mạ Teflon',  icon:'fas fa-paint-roller' },
    { key:'qr',        jp:'QR',      vi:'Mã QR',       icon:'fas fa-qrcode' },
    { key:'photo',     jp:'写真',    vi:'Ảnh',         icon:'fas fa-camera' },
    { key:'print',     jp:'印刷',    vi:'In',          icon:'fas fa-print' }
  ];

  const SETTINGS_ACTION = { key:'__settings__', jp:'設定', vi:'Thiết lập', icon:'fas fa-gear' };

  function safeJsonParse(s){
    try{ return JSON.parse(s); }catch(e){ return null; }
  }

  function deepMerge(base, extra){
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base||{});
    if(!extra || typeof extra !== 'object') return out;
    Object.keys(extra).forEach(k=>{
      const v = extra[k];
      if(v && typeof v === 'object' && !Array.isArray(v)) out[k] = deepMerge(out[k] || {}, v);
      else out[k] = v;
    });
    return out;
  }

  function loadConfig(){
    const raw = (typeof localStorage !== 'undefined') ? localStorage.getItem(STORAGE_KEY) : null;
    const cfg = raw ? safeJsonParse(raw) : null;
    return deepMerge(DEFAULT_CONFIG, cfg || {});
  }

  function saveConfig(cfg){
    try{
      if(typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    }catch(e){}
  }

  function isMobile(){
    try{ return window.innerWidth <= 768; }catch(e){ return false; }
  }

  function escapeHtml(s){
    const x = (s===null||s===undefined) ? '' : String(s);
    return x.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function ensureMinimalStyles(){
    if(document.getElementById('dp-assistive-touch-style')) return;
    const st = document.createElement('style');
    st.id = 'dp-assistive-touch-style';
    st.textContent = `
      /* Settings + button visibility (fallback) */
      #dpGlobalLayer .dp-at-settings-sheet{ position:fixed; z-index:2400; left:12px; right:12px; bottom:calc(12px + env(safe-area-inset-bottom)); max-height:70vh; overflow:auto; background:rgba(255,255,255,0.92); backdrop-filter:blur(14px) saturate(1.15); -webkit-backdrop-filter:blur(14px) saturate(1.15); border:1px solid rgba(2,6,23,0.14); border-radius:16px; box-shadow:0 18px 50px rgba(2,6,23,0.18); padding:10px; display:none; }
      #dpGlobalLayer .dp-at-settings-title{ font-weight:950; font-size:13px; margin:2px 2px 10px; color:rgba(15,23,42,0.90); }
      #dpGlobalLayer .dp-at-row{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:8px 8px; border-radius:12px; border:1px solid rgba(2,6,23,0.10); background:rgba(255,255,255,0.88); margin-bottom:8px; }
      #dpGlobalLayer .dp-at-row label{ font-weight:850; font-size:12px; color:rgba(15,23,42,0.86); }
      #dpGlobalLayer .dp-at-row .hint{ font-size:11px; color:rgba(15,23,42,0.65); font-weight:650; }
      #dpGlobalLayer .dp-at-actions-grid{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      #dpGlobalLayer .dp-at-chip{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 10px; border-radius:14px; border:1px solid rgba(2,6,23,0.10); background:rgba(255,255,255,0.90); }
      #dpGlobalLayer .dp-at-chip .left{ display:flex; align-items:center; gap:10px; min-width:0; }
      #dpGlobalLayer .dp-at-chip i{ width:18px; text-align:center; color:rgba(15,23,42,0.75); }
      #dpGlobalLayer .dp-at-chip .name{ font-weight:900; font-size:12px; color:rgba(15,23,42,0.92); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      #dpGlobalLayer .dp-at-btns{ display:flex; gap:8px; margin-top:10px; }
      #dpGlobalLayer .dp-at-btn{ flex:1 1 auto; height:42px; border-radius:14px; border:1px solid rgba(2,6,23,0.12); background:rgba(255,255,255,0.90); font-weight:950; cursor:pointer; }
      #dpGlobalLayer .dp-at-btn.primary{ background:rgba(102,126,234,0.92); border-color:rgba(102,126,234,0.30); color:#fff; }

      /* JP|VI label block */
      #dpGlobalLayer .dp-label-group { display:flex; flex-direction:column; align-items:flex-start; line-height:1.2; }
      #dpGlobalLayer .dp-action-btn .dp-label-jp{ font-weight:800; font-size:11.5px; color:rgba(15,23,42,0.95); margin-bottom: 2px; }
      #dpGlobalLayer .dp-action-btn .dp-label-vi{ font-weight:700; font-size:10px; opacity:1; color:#64748b; }

      /* Settings action look (fallback) */
      #dpGlobalLayer .dp-action-btn.dp-at-settings-action{ border-color:rgba(2,6,23,0.16); background:rgba(255,255,255,0.96); }
      /* ====== SHARED BUTTON BASE (MOBILE + ASSISTIVE) ====== */
      #dpGlobalLayer .dp-action-btn { flex:none; height:auto; min-height:40px; border-radius:10px; background:#f8fafc; border:1px solid #e2e8f0; box-shadow:0 1px 4px rgba(2,6,23,0.05); display:flex; flex-direction:row; align-items:center; justify-content:flex-start; gap:6px; padding:6px 6px; cursor:pointer; overflow:hidden; }
      #dpGlobalLayer .dp-action-btn:active { transform:scale(0.96); opacity:0.85; border-color:rgba(2,6,23,0.12); }
      #dpGlobalLayer .dp-action-btn i { font-size:14px; width:24px; height:24px; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; margin-bottom: 0; }
      #dpGlobalLayer .dp-action-btn .dp-label-group { display:flex; flex-direction:column; align-items:flex-start; min-width:0; overflow:hidden; line-height:1.1; text-align:left; width:auto; }
      #dpGlobalLayer .dp-action-btn .dp-label-jp { font-weight:800; font-size:9.5px; color:#1e293b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; margin-bottom:1px; }
      #dpGlobalLayer .dp-action-btn .dp-label-vi { font-weight:700; font-size:8px; color:#64748b; white-space:normal; overflow:hidden; text-overflow:ellipsis; max-width:100%; opacity:1; line-height:1.1; }

      /* ====== SHARED MUTE/PASTEL ACTION COLORS ====== */
      /* Qu-weight / Khối lượng: Stone */
      #dpGlobalLayer .dp-action-btn[data-action="qu-weight"] { background:#fafaf9; border-color:#e7e5e4; }
      #dpGlobalLayer .dp-action-btn[data-action="qu-weight"] i { background:#f5f5f4; color:#78716c; }
      
      /* InOut / Nhập Xuất: Soft Blue */
      #dpGlobalLayer .dp-action-btn[data-action="inout"] { background:#eff6ff; border-color:#dbeafe; }
      #dpGlobalLayer .dp-action-btn[data-action="inout"] i { background:#dbeafe; color:#2563eb; }
      
      /* Move / Di chuyển: Orange/Peach */
      #dpGlobalLayer .dp-action-btn[data-action="move"] { background:#fff7ed; border-color:#ffedd5; }
      #dpGlobalLayer .dp-action-btn[data-action="move"] i { background:#ffedd5; color:#ea580c; }
      
      /* Checkin / Kiểm kê (inventory): Mint/Teal */
      #dpGlobalLayer .dp-action-btn[data-action="inventory"], #dpGlobalLayer .dp-action-btn[data-action="checkin"] { background:#f0fdfa; border-color:#ccfbf1; }
      #dpGlobalLayer .dp-action-btn[data-action="inventory"] i, #dpGlobalLayer .dp-action-btn[data-action="checkin"] i { background:#ccfbf1; color:#0d9488; }
      
      /* Teflon: Rose/Pink */
      #dpGlobalLayer .dp-action-btn[data-action="teflon"], #dpGlobalLayer .dp-action-btn[data-action="qu-lifecycle"] { background:#fff1f2; border-color:#ffe4e6; }
      #dpGlobalLayer .dp-action-btn[data-action="teflon"] i, #dpGlobalLayer .dp-action-btn[data-action="qu-lifecycle"] i { background:#ffe4e6; color:#e11d48; }
      
      /* QR Code: Cyan */
      #dpGlobalLayer .dp-action-btn[data-action="qr"] { background:#ecfeff; border-color:#cffafe; }
      #dpGlobalLayer .dp-action-btn[data-action="qr"] i { background:#cffafe; color:#0891b2; }
      
      /* Photo: Fuchsia */
      #dpGlobalLayer .dp-action-btn[data-action="photo"] { background:#fdf4ff; border-color:#fae8ff; }
      #dpGlobalLayer .dp-action-btn[data-action="photo"] i { background:#fae8ff; color:#c026d3; }
      
      /* Settings/Print/Checkout: Slate */
      #dpGlobalLayer .dp-action-btn[data-action="print"], #dpGlobalLayer .dp-action-btn[data-action="checkout"] { background:#f8fafc; border-color:#f1f5f9; }
      #dpGlobalLayer .dp-action-btn[data-action="print"] i, #dpGlobalLayer .dp-action-btn[data-action="checkout"] i { background:#f1f5f9; color:#475569; }

      /* ====== MOBILE ACTION BAR LAYOUT ====== */
      #dpGlobalLayer .dp-mobile-actionbar { display:none; }
      .detail-panel .dp-mobile-actionbar { display:none !important; }
      @media (max-width: 768px) {
        body:has(#dpGlobalLayer.dp-mode-bar .dp-mobile-actionbar[style*="flex"]) detailPanel.detail-panel.open:has(.detail-tab.active[data-tab="info"]) .detail-panel-body { padding-bottom:calc(10px + 120px + env(safe-area-inset-bottom)) !important; }

        #dpGlobalLayer.dp-mode-bar .dp-mobile-actionbar { position:fixed; left:0; right:0; bottom:0; z-index:2200; padding:8px 8px calc(8px + env(safe-area-inset-bottom)); background:rgba(255,255,255,0.92); backdrop-filter:blur(16px) saturate(1.2); -webkit-backdrop-filter:blur(16px) saturate(1.2); border-top:1px solid rgba(2,6,23,0.06); box-shadow:0 -10px 40px rgba(2,6,23,0.08); }
        
        #dpGlobalLayer .dp-mobile-actionbar .dp-actions-grid { display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; width:100%; }
        
        #dpGlobalLayer .dp-mobile-actionbar.dp-actionbar--icononly .dp-action-btn .dp-label-group { display:none !important; }
      }

      /* ====== ASSISTIVE TOUCH MENU LAYOUT ====== */
      #dpGlobalLayer.dp-mode-assistive .dp-assistive { display:flex; }
      #dpGlobalLayer .dp-assistive { position:fixed; z-index:2300; width:54px; height:54px; border-radius:999px; background:linear-gradient(135deg, #14B8A6, #0F766E); box-shadow:0 12px 32px rgba(15, 118, 110, 0.35); border:1px solid rgba(255,255,255,0.25); display:none; align-items:center; justify-content:center; color:#fff; cursor:pointer; user-select:none; touch-action:none; }
      #dpGlobalLayer .dp-assistive i { font-size:20px; text-shadow:0 2px 4px rgba(0,0,0,0.2); }
      #dpGlobalLayer .dp-assistive-menu { position:fixed; z-index:2310; width:min(340px, calc(100vw - 32px)); border-radius:20px; background:rgba(255,255,255,0.90); backdrop-filter:blur(24px) saturate(1.2); -webkit-backdrop-filter:blur(24px) saturate(1.2); border:1px solid rgba(2,6,23,0.08); box-shadow:0 20px 60px rgba(2,6,23,0.2); padding:14px; display:none; }
      #dpGlobalLayer .dp-assistive-menu .dp-assistive-title { font-weight:950; font-size:12px; color:rgba(15,23,42,0.75); margin:0 4px 12px; text-transform:uppercase; letter-spacing:0.5px; }
      #dpGlobalLayer .dp-assistive-menu .dp-assistive-actions { display:grid; grid-template-columns:repeat(3, 1fr); gap:6px; }
    `;
    document.head.appendChild(st);
  }

  function getActiveTab(panelEl){
    try{
      const t = panelEl.querySelector('.detail-tab.active');
      const k = t ? String(t.getAttribute('data-tab') || t.dataset.tab || '') : '';
      return (k || '').toLowerCase();
    }catch(e){ return ''; }
  }

  function isPanelOpen(panelEl){
    try{ return panelEl && panelEl.classList.contains('open'); }catch(e){ return false; }
  }

  function ensureActionbar(panelEl){
    let bar = panelEl.querySelector('.dp-mobile-actionbar');
    if(!bar){
      bar = document.createElement('div');
      bar.className = 'dp-mobile-actionbar';
      bar.setAttribute('data-dp-mobile-actionbar','1');
      panelEl.appendChild(bar);
    }
    let grid = bar.querySelector('.dp-actions-grid');
    if(!grid){
      grid = document.createElement('div');
      grid.className = 'dp-actions-grid';
      bar.appendChild(grid);
    }
    return { bar, grid };
  }

  function buildActionButton(action){
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dp-action-btn';
    btn.setAttribute('data-action', action.key);
    btn.title = (action.jp || action.vi || action.key);

    const i = document.createElement('i');
    i.className = action.icon;

    const wrap = document.createElement('span');
    wrap.className = 'dp-label-group';

    const jp = document.createElement('span');
    jp.className = 'dp-label-jp';
    jp.textContent = action.jp || action.key;

    const vi = document.createElement('span');
    vi.className = 'dp-label-vi';
    vi.textContent = action.vi || '';

    wrap.appendChild(jp);
    wrap.appendChild(vi);

    btn.appendChild(i);
    btn.appendChild(wrap);

    return btn;
  }

  function buildSettingsButton(onClick){
    // Make it LOOK like other dp-action-btn, but prevent bubbling to DetailPanel action handler.
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dp-action-btn dp-at-settings-action';
    btn.setAttribute('data-dp-at-settings','1');
    btn.title = '設定 | Thiết lập';

    const i = document.createElement('i');
    i.className = SETTINGS_ACTION.icon;

    const wrap = document.createElement('span');
    wrap.className = 'dp-label-group';

    const jp = document.createElement('span');
    jp.className = 'dp-label-jp';
    jp.textContent = SETTINGS_ACTION.jp;

    const vi = document.createElement('span');
    vi.className = 'dp-label-vi';
    vi.textContent = SETTINGS_ACTION.vi;

    wrap.appendChild(jp);
    wrap.appendChild(vi);

    btn.appendChild(i);
    btn.appendChild(wrap);

    btn.addEventListener('click', (e)=>{
      try{
        e.preventDefault();
        e.stopPropagation();
      }catch(err){}
      try{ onClick && onClick(); }catch(err){}
    }, true);

    return btn;
  }

  function ensureAssistive(panelEl){
    let btn = panelEl.querySelector('.dp-assistive');
    if(!btn){
      btn = document.createElement('div');
      btn.className = 'dp-assistive';
      btn.setAttribute('data-dp-assistive','1');
      btn.innerHTML = '<i class="fas fa-bolt"></i>';
      panelEl.appendChild(btn);
    }

    let menu = panelEl.querySelector('.dp-assistive-menu');
    if(!menu){
      menu = document.createElement('div');
      menu.className = 'dp-assistive-menu';
      menu.setAttribute('data-dp-assistive-menu','1');
      panelEl.appendChild(menu);
    }

    return { btn, menu };
  }

  function clamp(v, a, b){
    return Math.max(a, Math.min(b, v));
  }

  function applyAssistivePosition(btn, cfg){
    try{
      const w = 56, h = 56;
      const margin = 8;
      const vw = window.innerWidth || 360;
      const vh = window.innerHeight || 640;

      let left = (cfg.assistive_pos && typeof cfg.assistive_pos.left === 'number') ? cfg.assistive_pos.left : 14;
      let top;

      if(cfg.assistive_pos && typeof cfg.assistive_pos.top === 'number') top = cfg.assistive_pos.top;
      else {
        const bottomGuard = 92;
        top = vh - bottomGuard - h;
      }

      left = clamp(left, margin, vw - w - margin);
      top = clamp(top, margin, vh - h - margin);

      btn.style.left = left + 'px';
      btn.style.top = top + 'px';
      btn.style.right = 'auto';
      btn.style.bottom = 'auto';
      btn.style.display = 'flex';
    }catch(e){}
  }

  function hideEl(el){
    if(!el) return;
    try{ el.style.display = 'none'; }catch(e){}
  }

  function showEl(el, display){
    if(!el) return;
    try{ el.style.display = display || 'block'; }catch(e){}
  }

  function buildSettingsSheet(panelEl){
    let sheet = panelEl.querySelector('.dp-at-settings-sheet');
    if(sheet) return sheet;

    sheet = document.createElement('div');
    sheet.className = 'dp-at-settings-sheet';
    sheet.setAttribute('data-dp-at-settings','1');

    sheet.innerHTML = `
      <div class="dp-at-settings-title">設定 | Thiết lập Action (Mobile)</div>

      <div class="dp-at-row" data-dp-at-mode>
        <div>
          <label>Kiểu hiển thị</label>
          <div class="hint">Chỉ hiển thị ở tab Thông tin</div>
        </div>
        <div style="display:flex;gap:10px;align-items:center;">
          <label style="display:flex;gap:6px;align-items:center;font-weight:850;font-size:12px;cursor:pointer;">
            <input type="radio" name="dp_at_mode" value="bar" />
            Thanh đáy
          </label>
          <label style="display:flex;gap:6px;align-items:center;font-weight:850;font-size:12px;cursor:pointer;">
            <input type="radio" name="dp_at_mode" value="assistive" />
            Assistive
          </label>
        </div>
      </div>

      <div class="dp-at-row" data-dp-at-icononly>
        <div>
          <label>Icon-only (siêu gọn)</label>
          <div class="hint">Ẩn chữ, chỉ hiện icon</div>
        </div>
        <div>
          <input type="checkbox" data-dp-at-icononly-toggle />
        </div>
      </div>

      <div style="margin:10px 2px 8px; font-weight:950; font-size:12px; color:rgba(15,23,42,0.86);">Chọn nút hiển thị</div>
      <div class="dp-at-actions-grid" data-dp-at-actions></div>

      <div class="dp-at-btns">
        <button class="dp-at-btn" type="button" data-dp-at-close>Đóng</button>
        <button class="dp-at-btn" type="button" data-dp-at-reset>Reset</button>
        <button class="dp-at-btn primary" type="button" data-dp-at-apply>Áp dụng</button>
      </div>
    `;

    panelEl.appendChild(sheet);
    return sheet;
  }

  function fillActionsGrid(sheet, cfg){
    const host = sheet.querySelector('[data-dp-at-actions]');
    if(!host) return;

    host.innerHTML = '';
    const enabledSet = new Set((cfg.enabled_actions || []).map(x=>String(x||'').toLowerCase()));

    ACTIONS.forEach(a=>{
      const chip = document.createElement('div');
      chip.className = 'dp-at-chip';

      const left = document.createElement('div');
      left.className = 'left';
      left.innerHTML = `<i class="${escapeHtml(a.icon)}"></i><div class="name">${escapeHtml(a.jp)}<span style="opacity:.65;font-weight:800;"> | ${escapeHtml(a.vi)}</span></div>`;

      const right = document.createElement('div');
      right.innerHTML = `<input type="checkbox" data-dp-at-action="${escapeHtml(a.key)}" ${enabledSet.has(a.key)?'checked':''} />`;

      chip.appendChild(left);
      chip.appendChild(right);
      host.appendChild(chip);
    });
  }

  function openSettingsSheet(sheet){ showEl(sheet, 'block'); }
  function closeSettingsSheet(sheet){ hideEl(sheet); }

  function setBodyPaddingForBar(panelEl, on){
    try{
      const body = panelEl.querySelector('.detail-panel-body');
      if(!body) return;
      if(on) body.style.paddingBottom = 'calc(10px + 58px + env(safe-area-inset-bottom))';
      else body.style.paddingBottom = '';
    }catch(e){}
  }

  function DetailPanelAssistiveTouch(options){
    window.GlobalAssistive = window.GlobalAssistive || {};
    window.GlobalAssistive.openSettings = openSettings;
    window.GlobalAssistive.openMenuAt = openMenuAt;

    const opt = options || {};
    const panelId = opt.panelId || 'detailPanel';

    let dpGlobalLayer = null;

    function ensureGlobalLayer() {
      dpGlobalLayer = document.getElementById('dpGlobalLayer');
      if (!dpGlobalLayer) {
        dpGlobalLayer = document.createElement('div');
        dpGlobalLayer.id = 'dpGlobalLayer';
        dpGlobalLayer.className = 'dp-global-layer';
        document.body.appendChild(dpGlobalLayer);
      }
      return dpGlobalLayer;
    }

    function dispatchAction(actionKey, originalEvent) {
      const panel = document.getElementById(panelId);
      if (panel && panel.classList.contains('open')) {
          const dummy = document.createElement('button');
          dummy.className = 'dp-action-btn';
          dummy.setAttribute('data-action', actionKey);
          dummy.style.display = 'none';
          panel.appendChild(dummy);
          dummy.click();
          dummy.remove();
      } else {
          if (window.CurrentFocusedRecord) {
              const rowEl = document.querySelector('.focused-row') || document.body;
              
              const dpEl = document.getElementById(panelId);
              const isOpen = dpEl && dpEl.classList.contains('open');
              
              if (isOpen && window.DetailPanel && typeof window.DetailPanel.handleQuickAction === 'function') {
                  window.DetailPanel.handleQuickAction(actionKey);
              } else {
                  document.dispatchEvent(new CustomEvent('quick-action', {
                      detail: { action: actionKey, item: window.CurrentFocusedRecord, event: originalEvent, target: rowEl }
                  }));
              }
          }
      }
    }

    function bindGlobalClicks() {
      const layer = ensureGlobalLayer();
      if (!layer || layer.dataset.clicksBound) return;
      layer.dataset.clicksBound = '1';
      layer.addEventListener('click', (e) => {
          const btn = e.target.closest('.dp-action-btn:not(.dp-at-settings-action)');
          if (btn) {
              const act = btn.getAttribute('data-action');
              if (act) {
                  e.preventDefault();
                  e.stopPropagation();
                  closeAssistiveMenu();
                  dispatchAction(act, e);
              }
          }
      });
    }

    let panelEl = null;
    let cfg = loadConfig();

    let actionbar = null;
    let actionbarGrid = null;

    let assistiveBtn = null;
    let assistiveMenu = null;

    let settingsSheet = null;

    let isDragging = false;
    let dragStart = { x:0, y:0, left:0, top:0 };
    let raf = 0;

    function resolvePanel(){
      panelEl = document.getElementById(panelId);
      return panelEl;
    }

    function getEnabledActions(){
      const set = new Set((cfg.enabled_actions||[]).map(x=>String(x||'').toLowerCase()));
      const out = ACTIONS.filter(a=>set.has(a.key));
      return out.length ? out : ACTIONS.slice(0,5);
    }

    function openSettings(){

      settingsSheet = buildSettingsSheet(ensureGlobalLayer());

      const radios = settingsSheet.querySelectorAll('input[name="dp_at_mode"]');
      radios.forEach(r=>{ r.checked = (r.value === cfg.mode); });

      const iconOnlyToggle = settingsSheet.querySelector('[data-dp-at-icononly-toggle]');
      if(iconOnlyToggle) iconOnlyToggle.checked = !!cfg.icon_only;

      fillActionsGrid(settingsSheet, cfg);

      if(!settingsSheet.dataset.dpAtBound){
        settingsSheet.dataset.dpAtBound = '1';

        const btnClose = settingsSheet.querySelector('[data-dp-at-close]');
        const btnReset = settingsSheet.querySelector('[data-dp-at-reset]');
        const btnApply = settingsSheet.querySelector('[data-dp-at-apply]');

        if(btnClose) btnClose.addEventListener('click', (e)=>{ e.preventDefault(); closeSettingsSheet(settingsSheet); });

        if(btnReset) btnReset.addEventListener('click', (e)=>{
          e.preventDefault();
          cfg = deepMerge(DEFAULT_CONFIG, {});
          saveConfig(cfg);
          openSettings();
          refreshVisibility();
        });

        if(btnApply) btnApply.addEventListener('click', (e)=>{
          e.preventDefault();
          const mode = (settingsSheet.querySelector('input[name="dp_at_mode"]:checked') || {}).value || 'bar';
          const iconOnly = !!(settingsSheet.querySelector('[data-dp-at-icononly-toggle]') || {}).checked;

          const checks = settingsSheet.querySelectorAll('input[data-dp-at-action]');
          const enabled = [];
          checks.forEach(ch=>{ if(ch && ch.checked) enabled.push(String(ch.getAttribute('data-dp-at-action')||'').toLowerCase()); });

          cfg.mode = (mode === 'assistive') ? 'assistive' : 'bar';
          cfg.icon_only = iconOnly;
          cfg.enabled_actions = enabled.length ? enabled : DEFAULT_CONFIG.enabled_actions.slice();

          saveConfig(cfg);
          closeSettingsSheet(settingsSheet);

          rebuildAll();
          refreshVisibility();
        });

        document.addEventListener('click', (e)=>{
          try{
            if(!settingsSheet || settingsSheet.style.display === 'none') return;
            const inSheet = e.target && (e.target.closest ? e.target.closest('.dp-at-settings-sheet') : null);
            const inSettingsBtn = e.target && (e.target.closest ? e.target.closest('[data-dp-at-settings]') : null);
            if(inSheet || inSettingsBtn) return;
            closeSettingsSheet(settingsSheet);
          }catch(err){}
        }, true);
      }

      openSettingsSheet(settingsSheet);
    }

    function rebuildActionbar(){

      const obj = ensureActionbar(ensureGlobalLayer());
      actionbar = obj.bar;
      actionbarGrid = obj.grid;

      actionbar.classList.toggle('dp-actionbar--icononly', !!cfg.icon_only);

      const acts = getEnabledActions();
      actionbarGrid.innerHTML = '';

      acts.forEach(a=> actionbarGrid.appendChild(buildActionButton(a)));

      // Settings action (visible, not mờ)
      actionbarGrid.appendChild(buildSettingsButton(openSettings));
    }

    function rebuildAssistiveMenu(){

      const obj = ensureAssistive(ensureGlobalLayer());
      assistiveBtn = obj.btn;
      assistiveMenu = obj.menu;

      applyAssistivePosition(assistiveBtn, cfg);

      const acts = getEnabledActions();
      const htmlActions = acts.map(a=>{
        return `
          <button class="dp-action-btn" data-action="${escapeHtml(a.key)}" type="button">
            <i class="${escapeHtml(a.icon)}"></i>
            <span class="dp-label-group">
              <span class="dp-label-jp">${escapeHtml(a.jp)}</span>
              <span class="dp-label-vi">${escapeHtml(a.vi)}</span>
            </span>
          </button>
        `;
      }).join('');

      assistiveMenu.innerHTML = `
        <div class="dp-assistive-title">
          クイックアクション | Action nhanh
        </div>
        <div class="dp-assistive-actions">${htmlActions}</div>
      `;

      // Add settings inside the actions grid too (as requested)
      try{
        const host = assistiveMenu.querySelector('.dp-assistive-actions');
        if(host){
          const setBtn = buildSettingsButton(openSettings);
          host.appendChild(setBtn);
        }
      }catch(e){}

      // Ensure menu is movable by JS
      assistiveMenu.style.left = 'auto';
      assistiveMenu.style.right = 'auto';
      assistiveMenu.style.top = 'auto';
      assistiveMenu.style.bottom = 'auto';
    }

    function closeAssistiveMenu(){
      if(!assistiveMenu) return;
      hideEl(assistiveMenu);
    }

    function positionAssistiveMenu(){
      if(!assistiveBtn || !assistiveMenu) return;

      try{
        const margin = 10;
        const vw = window.innerWidth || 360;
        const vh = window.innerHeight || 640;

        const btnRect = assistiveBtn.getBoundingClientRect();
        const btnCy = btnRect.top + btnRect.height/2;

        // Measure menu (need it visible to have size)
        const prevDisplay = assistiveMenu.style.display;
        const wasHidden = (prevDisplay === 'none' || prevDisplay === '');
        if(wasHidden){
          assistiveMenu.style.visibility = 'hidden';
          assistiveMenu.style.display = 'block';
        }

        const menuRect = assistiveMenu.getBoundingClientRect();
        const menuW = menuRect.width || 320;
        const menuH = menuRect.height || 220;

        const left = Math.round((vw - menuW) / 2);
        const top = Math.round(clamp(btnCy - menuH/2, margin, vh - menuH - margin - (envSafeBottom())));

        assistiveMenu.style.left = left + 'px';
        assistiveMenu.style.top = top + 'px';
        assistiveMenu.style.bottom = 'auto';

        if(wasHidden){
          assistiveMenu.style.display = 'none';
          assistiveMenu.style.visibility = '';
        }
      }catch(e){}
    }

    function envSafeBottom(){
      // Cannot read env() in JS reliably; approximate.
      return 0;
    }

    function toggleAssistiveMenu(){
      if(!assistiveMenu) return;
      const isOpen = (assistiveMenu.style.display !== 'none' && assistiveMenu.style.display !== '');
      if(isOpen){
        hideEl(assistiveMenu);
        return;
      }
      // Before showing: compute position
      positionAssistiveMenu();
      showEl(assistiveMenu, 'block');
      // After show: position again (actual height may change after fonts)
      setTimeout(()=>{ try{ positionAssistiveMenu(); }catch(e){} }, 0);
    }

    function openMenuAt(element, record) {
      if(record) window.CurrentFocusedRecord = record;
      if(!assistiveMenu) return;

      const layer = ensureGlobalLayer();
      // Ensure layer acts like assistive mode just for the menu
      layer.classList.add('dp-mode-assistive');
      
      const vw = window.innerWidth || 360;
      const vh = window.innerHeight || 640;
      const margin = 10;
      
      const prevDisplay = assistiveMenu.style.display;
      const wasHidden = (prevDisplay === 'none' || prevDisplay === '');
      if(wasHidden){
        assistiveMenu.style.visibility = 'hidden';
        assistiveMenu.style.display = 'block';
      }
      
      const menuRect = assistiveMenu.getBoundingClientRect();
      const menuW = menuRect.width || 320;
      const menuH = menuRect.height || 220;
      
      let left = Math.round((vw - menuW) / 2);
      let top = Math.round((vh - menuH) / 2);
      
      if(element) {
        const rect = element.getBoundingClientRect();
        left = Math.max(margin, rect.right - menuW + 20); // Align mostly to the right edge
        if (left + menuW > vw - margin) left = vw - menuW - margin;
        
        top = rect.top - menuH - margin;
        if(top < margin) { 
           top = rect.bottom + margin;
        }
      }
      
      assistiveMenu.style.left = left + 'px';
      assistiveMenu.style.top = top + 'px';
      assistiveMenu.style.bottom = 'auto';
      
      if(wasHidden){
        assistiveMenu.style.display = 'none';
        assistiveMenu.style.visibility = '';
      }
      
      showEl(assistiveMenu, 'block');
    }

    function rebuildAll(){

      rebuildActionbar();
      rebuildAssistiveMenu();
    }

    function refreshVisibility(){
      resolvePanel();
      const layer = ensureGlobalLayer();

      const open = panelEl && isPanelOpen(panelEl);
      const mobile = isMobile();
      const tab = panelEl ? getActiveTab(panelEl) : '';
      const isInfo = (tab === 'info');
      
      const tableView = document.getElementById('tableView');
      const isTableActive = tableView && tableView.style.display !== 'none';
      const isFocused = !!window.CurrentFocusedRecord;
      
      let shouldShow = false;
      if (mobile && cfg.enabled) {
          if (open && isInfo) shouldShow = true;
      }

      if(!shouldShow){
        layer.classList.remove('dp-mode-bar');
        layer.classList.remove('dp-mode-assistive');
        if(actionbar) hideEl(actionbar);
        if(assistiveBtn) hideEl(assistiveBtn);
        closeAssistiveMenu();
        if(settingsSheet) closeSettingsSheet(settingsSheet);
        if(panelEl) setBodyPaddingForBar(panelEl, false);
        return;
      }

      if(cfg.mode === 'assistive'){
        layer.classList.remove('dp-mode-bar');
        layer.classList.add('dp-mode-assistive');
        
        if(actionbar) hideEl(actionbar);
        if(assistiveBtn){
          showEl(assistiveBtn, 'flex');
          applyAssistivePosition(assistiveBtn, cfg);
        }
        if(panelEl) setBodyPaddingForBar(panelEl, false);
      }else{
        layer.classList.remove('dp-mode-assistive');
        layer.classList.add('dp-mode-bar');
        
        if(assistiveBtn) hideEl(assistiveBtn);
        closeAssistiveMenu();
        if(actionbar) showEl(actionbar, 'flex');
        if(panelEl && open) setBodyPaddingForBar(panelEl, true);
        else if (panelEl) setBodyPaddingForBar(panelEl, false);
      }

      if(actionbar){
        actionbar.classList.toggle('dp-actionbar--icononly', !!cfg.icon_only);
      }
    }

    function bindAssistiveDrag(){
      if(!assistiveBtn || assistiveBtn.dataset.dpDragBound) return;
      assistiveBtn.dataset.dpDragBound = '1';

      const onDown = (e)=>{
        if(!assistiveBtn) return;
        isDragging = true;
        try{
          const rect = assistiveBtn.getBoundingClientRect();
          dragStart.left = rect.left;
          dragStart.top = rect.top;
        }catch(err){
          dragStart.left = parseFloat(assistiveBtn.style.left||'14') || 14;
          dragStart.top = parseFloat(assistiveBtn.style.top||'200') || 200;
        }
        dragStart.x = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
        dragStart.y = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
        try{ assistiveBtn.setPointerCapture && e.pointerId && assistiveBtn.setPointerCapture(e.pointerId); }catch(err){}
      };

      const onMove = (e)=>{
        if(!isDragging || !assistiveBtn) return;
        const x = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
        const y = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
        const dx = x - dragStart.x;
        const dy = y - dragStart.y;

        if(raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(()=>{
          const w = 56, h = 56;
          const margin = 8;
          const vw = window.innerWidth || 360;
          const vh = window.innerHeight || 640;
          const bottomGuard = 8;
          const maxTop = Math.max(margin, vh - bottomGuard - h);

          let left = clamp(dragStart.left + dx, margin, vw - w - margin);
          let top = clamp(dragStart.top + dy, margin, maxTop);

          assistiveBtn.style.left = left + 'px';
          assistiveBtn.style.top = top + 'px';
          assistiveBtn.style.right = 'auto';
          assistiveBtn.style.bottom = 'auto';

          cfg.assistive_pos = { left:left, top:top, right:null, bottom:null };
          saveConfig(cfg);

          // If menu is open, keep it aligned
          if(assistiveMenu && assistiveMenu.style.display === 'block'){
            positionAssistiveMenu();
          }
        });
      };

      const onUp = ()=>{ isDragging = false; };

      assistiveBtn.addEventListener('pointerdown', (e)=>{ onDown(e); }, { passive:true });
      window.addEventListener('pointermove', (e)=>{ onMove(e); }, { passive:true });
      window.addEventListener('pointerup', ()=>{ onUp(); }, { passive:true });

      // Click toggles menu
      assistiveBtn.addEventListener('click', (e)=>{
        try{
          if(!cfg || cfg.mode !== 'assistive') return;
          e.preventDefault();
          e.stopPropagation();
          toggleAssistiveMenu();
        }catch(err){}
      });

      // Click outside closes menu
      document.addEventListener('click', (e)=>{
        try{
          if(!assistiveMenu || assistiveMenu.style.display !== 'block') return;
          const inMenu = e.target && (e.target.closest ? e.target.closest('.dp-assistive-menu') : null);
          const inBtn = e.target && (e.target.closest ? e.target.closest('.dp-assistive') : null);
          if(inMenu || inBtn) return;
          closeAssistiveMenu();
        }catch(err){}
      }, true);

      document.addEventListener('keydown', (e)=>{
        try{ if(e.key === 'Escape') closeAssistiveMenu(); }catch(err){}
      });

      window.addEventListener('resize', ()=>{
        try{
          if(assistiveMenu && assistiveMenu.style.display === 'block') positionAssistiveMenu();
        }catch(e){}
      });
    }

    function bindTabWatchers(){
      if(!panelEl || panelEl.dataset.dpAtTabBound) return;
      panelEl.dataset.dpAtTabBound = '1';

      panelEl.addEventListener('click', (e)=>{
        try{
          const tab = e.target && (e.target.closest ? e.target.closest('.detail-tab') : null);
          if(!tab) return;
          setTimeout(()=>{ refreshVisibility(); }, 0);
        }catch(err){}
      }, true);

      try{
        const mo = new MutationObserver(()=>{ refreshVisibility(); });
        mo.observe(panelEl, { subtree:true, attributes:true, attributeFilter:['class'] });
      }catch(e){}

      window.addEventListener('resize', ()=>{ refreshVisibility(); });
    }

    function init(){
      ensureMinimalStyles();

      if(!resolvePanel()) return false;

      rebuildAll();

      bindGlobalClicks();
      bindAssistiveDrag();
      bindTabWatchers();

      refreshVisibility();

      return true;
    }

    return {
      version: VERSION,
      init,
      refresh: refreshVisibility,
      openSettings,
      openMenuAt,
      getConfig: ()=>cfg,
      setConfig: (next)=>{ cfg = deepMerge(cfg, next||{}); saveConfig(cfg); rebuildAll(); refreshVisibility(); }
    };
  }

  function boot(){
    try{
      const api = DetailPanelAssistiveTouch({ panelId: 'detailPanel' });
      window.DetailPanelAssistiveTouch = api;

      let tries = 0;
      const timer = setInterval(()=>{
        tries++;
        const ok = api.init();
        if(ok || tries >= 40) clearInterval(timer);
      }, 250);

      document.addEventListener('visibilitychange', ()=>{
        try{ if(window.DetailPanelAssistiveTouch) window.DetailPanelAssistiveTouch.refresh(); }catch(e){}
      });

    }catch(e){}
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();

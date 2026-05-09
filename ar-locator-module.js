// ar-locator-module.js v1.2.1
// ARロケーター — 金型検索・一括確認ツール
(function () {
  'use strict';

  const ARL = {
    state: {
      isOpen: false, mode: 'single', // 'single' | 'batch'
      singleTarget: null, // {code, kind, item, normCode}
      batchList: [], // [{code, kind, item, checked, normCode}]
      highlightIdx: -1, dropdownItems: [],
      cameraOpen: false, stream: null, scanning: false,
      video: null, canvas: null, ctx: null,
      audioCtx: null, lastBeepTime: 0,
      facingMode: 'environment',
      foundImage: null, // For single mode found result
      searchKind: 'all' // all, mold, cutter
    },

    normalizeCode(raw) {
      return String(raw || '').replace(/[\s\-]/g, '').toUpperCase();
    },

    searchDevices(query) {
      if (!query || query.length < 2) return [];
      const dm = window.DataManager?.data;
      if (!dm) return [];
      const q = query.toLowerCase();
      const results = [];
      const searchKind = this.state.searchKind || 'all';

      const check = (list, kind) => {
        if (!Array.isArray(list)) return;
        for (const item of list) {
          const code = kind === 'mold' ? (item.MoldCode || '') : (item.CutterCode || item.CutterNo || '');
          const name = kind === 'mold' ? (item.MoldName || '') : (item.CutterName || '');
          const dCode = item.displayCode || '';
          
          if (code.toLowerCase().includes(q) || name.toLowerCase().includes(q) || dCode.toLowerCase().includes(q)) {
            results.push({
              code: dCode || code,
              kind: kind,
              item: item,
              normCode: this.normalizeCode(dCode || code),
              normId: item.normId || (kind === 'mold' ? item.MoldID : item.CutterID)
            });
            if (results.length >= 20) return true; // max 20
          }
        }
        return false;
      };

      if ((searchKind === 'all' || searchKind === 'mold') && dm.molds) check(dm.molds, 'mold');
      if (results.length < 20 && (searchKind === 'all' || searchKind === 'cutter') && dm.cutters) check(dm.cutters, 'cutter');
      return results.slice(0, 20);
    },

    highlightMatch(text, query) {
      if (!query) return text;
      const idx = text.toUpperCase().indexOf(query.toUpperCase());
      if (idx < 0) return text;
      return text.substring(0, idx) + '<mark>' + text.substring(idx, idx + query.length) + '</mark>' + text.substring(idx + query.length);
    },

    // ===== INIT =====
    init() {
      document.addEventListener('click', (e) => {
        if (e.target.closest('#sidebarARLocatorBtn')) { 
            e.preventDefault(); 
            
            // Đóng sidebar trên mobile trước khi mở AR (giống pattern SACT/Location Manager)
            const sb = document.getElementById('sidebar');
            if (sb && window.innerWidth <= 768) { 
                sb.classList.remove('open'); 
                const backdrop = document.getElementById('backdrop'); 
                if (backdrop) backdrop.classList.remove('show'); 
            }
            
            this.open(); 
        }
      });
      document.addEventListener('open-ar-locator', () => this.open());
      
      // Đóng ARL nếu người dùng nhấp vào mục khác trên sidebar (ViewManager)
      document.addEventListener('mcsViewChanged', () => {
        if (this.state.isOpen && !this.state.isSwitching) {
            this.state.isSwitching = true;
            this.close();
            this.state.isSwitching = false;
        }
      });
    },

    open() {
      if (this.state.isOpen) return;
      this.state.isOpen = true;
      this.state.mode = 'single';
      this.state.singleTarget = null;
      this.state.batchList = [];
      this.state.foundImage = null;
      if (window.ViewManager?.currentView && window.ViewManager.currentView !== 'ar-locator') {
        this.state.prevView = window.ViewManager.currentView;
      }
      this.render();
      if (window.ViewManager) window.ViewManager.switchView('ar-locator');
    },

    close() {
      this.state.isOpen = false;
      this.closeCamera();
      
      if (window.SwipeHistoryTrap) window.SwipeHistoryTrap.remove('arlOverlay');
      
      const wrapper = document.getElementById('arl-overlay-wrapper');
      if (wrapper) wrapper.remove();
    },



    render() {
      if (document.getElementById('arl-overlay-wrapper')) return;
      
      const wrapper = document.createElement('div');
      wrapper.id = 'arl-overlay-wrapper';
      wrapper.className = 'arl-overlay-wrapper';

      const root = document.createElement('div');
      root.id = 'arl-root';
      root.className = 'arl-overlay';

      root.innerHTML = `
        <div class="arl-main-header">
          <div class="arl-main-title">
            <div class="arl-header-icon"><i class="fas fa-crosshairs"></i></div>
            <div class="arl-header-text">
              <span class="ja">AR探索ツール</span>
              <span class="vi">Tìm kiếm bằng AR</span>
            </div>
          </div>
          <button class="arl-main-close" id="arl-main-close-btn">&times;</button>
        </div>
        <div class="arl-tabbar">
          <button class="arl-tab active" data-mode="single"><i class="fas fa-crosshairs"></i> 特定検索</button>
          <button class="arl-tab" data-mode="batch"><i class="fas fa-list-check"></i> 一括棚卸</button>
        </div>
        <div class="arl-body" id="arl-body" style="flex:1;"></div>
        <div id="arl-camera-root"></div>
        <div class="arl-mobile-footer" style="padding: 12px 16px; background: var(--mcs-surface, #fff); border-top: 1px solid var(--mcs-border, #e2e6ea); display: none;">
           <button class="arl-btn" id="arl-mobile-close-btn" style="width:100%; padding:14px; background:var(--mcs-surface); border:1px solid var(--mcs-border); font-size:16px; font-weight:bold; color:var(--mcs-text); border-radius:8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05);"><i class="fas fa-times"></i> 閉じる / Đóng</button>
        </div>
      `;

      wrapper.appendChild(root);
      document.body.appendChild(wrapper);

      document.getElementById('arl-main-close-btn').addEventListener('click', () => this.close());
      document.getElementById('arl-mobile-close-btn').addEventListener('click', () => this.close());
      // Cho phép đóng modal khi click ra ngoài vùng xám
      wrapper.addEventListener('click', (e) => {
        if (e.target === wrapper) this.close();
      });

      if (window.SwipeHistoryTrap) {
        window.SwipeHistoryTrap.push('arlOverlay', () => this.close());
        window.SwipeHistoryTrap.bindSwipe(wrapper, () => this.close(), { followFinger: true });
      }

      root.querySelectorAll('.arl-tab').forEach(t => t.addEventListener('click', () => {
        this.state.mode = t.dataset.mode;
        root.querySelectorAll('.arl-tab').forEach(b => b.classList.toggle('active', b === t));
        this.renderBody();
      }));

      this.renderBody();
    },

    renderBody() {
      const body = document.getElementById('arl-body');
      if (!body) return;
      if (this.state.mode === 'single') this.renderSingle(body);
      else this.renderBatch(body);
    },

    // ===== SINGLE MODE =====
    renderSingle(body) {
      if (this.state.foundImage) {
        // Show result
        body.innerHTML = `
          <div class="arl-hint" style="text-align:center; background:#f0fdf4; border-color:#86efac;">
            <i class="fas fa-check-circle" style="color:#22c55e; font-size:32px; margin-bottom:8px; display:block;"></i>
            <div class="ja" style="font-size:16px; color:#166534;">対象物を発見しました</div>
            <div class="vi" style="color:#15803d;">Đã tìm thấy thiết bị: <strong>${this.state.singleTarget.code}</strong></div>
          </div>
          <div style="margin-top:16px; border-radius:12px; overflow:hidden; border:2px solid #22c55e; box-shadow:0 8px 16px rgba(0,0,0,0.1);">
            <img src="${this.state.foundImage}" style="width:100%; display:block; background:#000;" />
          </div>
          <div class="arl-actions" style="margin-top:24px;">
            <button class="arl-btn arl-btn-secondary" id="arl-single-retry"><i class="fas fa-redo"></i> もう一度検索</button>
            <button class="arl-btn arl-btn-primary" id="arl-single-detail"><i class="fas fa-info-circle"></i> 詳細表示 / Chi tiết</button>
          </div>
        `;
        document.getElementById('arl-single-retry')?.addEventListener('click', () => {
          this.state.foundImage = null;
          this.renderBody();
        });
        document.getElementById('arl-single-detail')?.addEventListener('click', () => {
          if (window.DetailPanel?.open) window.DetailPanel.open(this.state.singleTarget.item, this.state.singleTarget.kind);
        });
        return;
      }

      body.innerHTML = `
        <div class="arl-hint">
          <div class="ja"><i class="fas fa-crosshairs"></i> 特定金型探索モード / Tìm 1 khuôn chỉ định</div>
          探したい金型コードを入力し、カメラをかざすと対象物を緑色で強調します。
        </div>
        
        ${this.state.singleTarget ? `
          <div class="arl-batch-item checked" style="margin-top:10px; border-width:2px; border-color:var(--mcs-primary);">
            <div class="arl-batch-num" style="background:var(--mcs-primary)"><i class="fas fa-crosshairs"></i></div>
            <div style="flex:1;">
              <div class="arl-batch-code" style="font-size:16px;">${this.state.singleTarget.code}</div>
              <div class="arl-batch-type ${this.state.singleTarget.kind}">${this.state.singleTarget.kind === 'mold' ? '金型' : '抜型'}</div>
            </div>
            <button class="arl-batch-remove" id="arl-single-remove" style="color:var(--mcs-error); font-size:20px;">&times;</button>
          </div>
          
          <div class="arl-actions" style="margin-top:20px;">
            <button class="arl-btn arl-btn-primary" id="arl-single-camera" style="font-size:16px; padding:16px;"><i class="fas fa-camera"></i> 探索カメラ起動 (Mở Camera)</button>
          </div>
        ` : `
          <div class="arl-search-wrap" style="margin-top:10px; display:flex; gap:8px;">
            <select id="arl-single-kind-select" style="padding:10px; border-radius:6px; border:1px solid var(--mcs-border); background:var(--mcs-surface); color:var(--mcs-text); font-weight:600;">
              <option value="all" ${this.state.searchKind === 'all' ? 'selected' : ''}>全て (Tất cả)</option>
              <option value="mold" ${this.state.searchKind === 'mold' ? 'selected' : ''}>金型 (Khuôn)</option>
              <option value="cutter" ${this.state.searchKind === 'cutter' ? 'selected' : ''}>抜型 (Dao)</option>
            </select>
            <div style="flex:1; position:relative;">
              <input type="text" class="arl-search-input" id="arl-single-input" placeholder="コード入力... (Mã khuôn/dao)" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" style="width:100%; border-radius:6px;">
              <button class="arl-search-clear" id="arl-single-clear">&times;</button>
              <div class="arl-dropdown" id="arl-single-dropdown"></div>
            </div>
          </div>
        `}
      `;

      if (this.state.singleTarget) {
        document.getElementById('arl-single-remove')?.addEventListener('click', () => {
          this.state.singleTarget = null;
          this.renderBody();
        });
        document.getElementById('arl-single-camera')?.addEventListener('click', () => {
          this.openCamera([this.state.singleTarget]);
        });
      } else {
        const inp = document.getElementById('arl-single-input');
        const dd = document.getElementById('arl-single-dropdown');
        const clr = document.getElementById('arl-single-clear');
        const kindSelect = document.getElementById('arl-single-kind-select');

        kindSelect.addEventListener('change', (e) => {
           this.state.searchKind = e.target.value;
           if (inp.value.trim().length >= 2) {
               this.state.dropdownItems = this.searchDevices(inp.value.trim());
               this.state.highlightIdx = this.state.dropdownItems.length > 0 ? 0 : -1;
               this.renderDropdown(dd, inp.value.trim());
           }
        });

        inp.addEventListener('input', () => {
          const q = inp.value.trim();
          clr.classList.toggle('visible', q.length > 0);
          if (q.length < 2) { dd.classList.remove('open'); dd.innerHTML = ''; this.state.dropdownItems = []; return; }
          this.state.dropdownItems = this.searchDevices(q);
          this.state.highlightIdx = this.state.dropdownItems.length > 0 ? 0 : -1;
          this.renderDropdown(dd, q);
        });

        const submitSingle = () => {
            const items = this.state.dropdownItems;
            let sel = null;
            if (this.state.highlightIdx >= 0 && items[this.state.highlightIdx]) {
                sel = items[this.state.highlightIdx];
            } else if (items.length > 0) {
                sel = items[0];
            }
            if (sel) {
                dd.classList.remove('open');
                this.state.singleTarget = { code: sel.code, kind: sel.kind, item: sel.item, normCode: sel.normCode, normId: sel.normId };
                this.renderBody();
            }
        };

        inp.addEventListener('keydown', (e) => {
          const items = this.state.dropdownItems;
          if (e.key === 'ArrowDown') { e.preventDefault(); this.state.highlightIdx = Math.min(this.state.highlightIdx + 1, items.length - 1); this.renderDropdown(dd, inp.value.trim()); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); this.state.highlightIdx = Math.max(this.state.highlightIdx - 1, 0); this.renderDropdown(dd, inp.value.trim()); }
          else if (e.key === 'Enter') {
            e.preventDefault();
            submitSingle();
          }
        });

        const handleMobileKeyboard = (e) => {
            if (window.innerWidth <= 768 && window.VirtualKeyboardModule && !inp.readOnly) {
                e.preventDefault();
                inp.blur();
                window.VirtualKeyboardModule.open(inp, {
                    onSubmit: () => submitSingle()
                });
            }
        };
        inp.addEventListener('click', handleMobileKeyboard);
        inp.addEventListener('focus', handleMobileKeyboard);

        clr.addEventListener('click', () => { inp.value = ''; clr.classList.remove('visible'); dd.classList.remove('open'); inp.focus(); });
        setTimeout(() => { if (window.innerWidth > 768) inp.focus(); }, 100);
      }
    },

    // ===== BATCH MODE =====
    renderBatch(body) {
      const listHtml = this.state.batchList.map((b, i) => `
        <div class="arl-batch-item ${b.checked ? 'checked' : ''}" data-idx="${i}">
          <div class="arl-batch-num">${b.checked ? '✓' : (i + 1)}</div>
          <div style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
             <span class="arl-batch-code">${b.code}</span>
             <span class="arl-batch-type ${b.kind}">${b.kind === 'mold' ? '金型' : '抜型'} - ${b.checked ? '確認済' : '未確認'}</span>
          </div>
          <button class="arl-batch-info" data-idx="${i}" style="color:var(--mcs-primary); font-size:18px; margin-right:8px;"><i class="fas fa-info-circle"></i></button>
          <button class="arl-batch-remove" data-idx="${i}">&times;</button>
        </div>
      `).join('');

      const total = this.state.batchList.length;
      const checked = this.state.batchList.filter(b => b.checked).length;

      body.innerHTML = `
        <div class="arl-hint">
          <div class="ja"><i class="fas fa-list-check"></i> 一括棚卸モード / Kiểm kê hàng loạt</div>
          コードを入力 → Enter でリスト追加 → 「スキャン開始」でカメラ確認。
        </div>
        <div class="arl-search-wrap" style="margin-top:10px; display:flex; gap:8px;">
          <select id="arl-batch-kind-select" style="padding:10px; border-radius:6px; border:1px solid var(--mcs-border); background:var(--mcs-surface); color:var(--mcs-text); font-weight:600;">
            <option value="all" ${this.state.searchKind === 'all' ? 'selected' : ''}>全て (Tất cả)</option>
            <option value="mold" ${this.state.searchKind === 'mold' ? 'selected' : ''}>金型 (Khuôn)</option>
            <option value="cutter" ${this.state.searchKind === 'cutter' ? 'selected' : ''}>抜型 (Dao cắt)</option>
          </select>
          <div style="flex:1; position:relative;">
            <input type="text" class="arl-search-input" id="arl-batch-input" placeholder="追加... (Nhập mã thêm)" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" style="width:100%; border-radius:6px;">
            <button class="arl-search-clear" id="arl-batch-clear">&times;</button>
            <div class="arl-dropdown" id="arl-batch-dropdown"></div>
          </div>
        </div>
        ${total > 0 ? `
          <div class="arl-stats" style="margin-top:10px;">
            <div class="arl-stat"><div class="arl-stat-num">${total}</div><div class="arl-stat-label">登録数</div></div>
            <div class="arl-stat"><div class="arl-stat-num" style="color:#22c55e">${checked}</div><div class="arl-stat-label">確認済</div></div>
            <div class="arl-stat"><div class="arl-stat-num" style="color:#f59e0b">${total - checked}</div><div class="arl-stat-label">未確認</div></div>
          </div>
          <div class="arl-batch-list" style="margin-top:10px; flex:1; overflow-y:auto; padding-bottom:20px;">${listHtml}</div>
        ` : ''}
        <div class="arl-actions" style="margin-top:auto;">
          ${total > 0 ? `<button class="arl-btn arl-btn-secondary" id="arl-batch-reset"><i class="fas fa-trash"></i></button>` : ''}
          <button class="arl-btn arl-btn-primary" id="arl-batch-scan" ${total === 0 ? 'disabled' : ''}><i class="fas fa-camera"></i> スキャン開始 ${total > 0 ? `(${total - checked})` : ''}</button>
        </div>
      `;

      // Bind
      const inp = document.getElementById('arl-batch-input');
      const dd = document.getElementById('arl-batch-dropdown');
      const clr = document.getElementById('arl-batch-clear');
      const kindSelect = document.getElementById('arl-batch-kind-select');

      if(inp) {
          if (kindSelect) {
              kindSelect.addEventListener('change', (e) => {
                 this.state.searchKind = e.target.value;
                 if (inp.value.trim().length >= 2) {
                     this.state.dropdownItems = this.searchDevices(inp.value.trim());
                     this.state.highlightIdx = this.state.dropdownItems.length > 0 ? 0 : -1;
                     this.renderDropdown(dd, inp.value.trim());
                 }
              });
          }

          inp.addEventListener('input', () => {
            const q = inp.value.trim();
            clr.classList.toggle('visible', q.length > 0);
            if (q.length < 2) { dd.classList.remove('open'); this.state.dropdownItems = []; return; }
            this.state.dropdownItems = this.searchDevices(q);
            this.state.highlightIdx = this.state.dropdownItems.length > 0 ? 0 : -1;
            this.renderDropdown(dd, q);
          });

          const submitBatch = () => {
              let sel = null;
              if (this.state.highlightIdx >= 0 && this.state.dropdownItems[this.state.highlightIdx]) {
                  sel = this.state.dropdownItems[this.state.highlightIdx];
              } else if (this.state.dropdownItems.length > 0) {
                  sel = this.state.dropdownItems[0];
              }
              
              if (sel && !this.state.batchList.find(b => this.normalizeCode(b.code) === sel.normCode && b.kind === sel.kind)) {
                this.state.batchList.push({ code: sel.code, kind: sel.kind, item: sel.item, checked: false, normCode: sel.normCode, normId: sel.normId });
              }
              inp.value = ''; clr.classList.remove('visible'); dd.classList.remove('open');
              this.renderBody(); // re-render to show new item
              
              // Tự động mở lại VirtualKeyboard trên Mobile hoặc Focus trên Desktop
              setTimeout(() => { 
                 const newInp = document.getElementById('arl-batch-input');
                 if (!newInp) return;
                 if (window.innerWidth > 768) {
                    newInp.focus(); 
                 } else if (window.VirtualKeyboardModule && !newInp.readOnly) {
                    window.VirtualKeyboardModule.open(newInp, { onSubmit: submitBatch });
                 }
              }, 100);
          };

          inp.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); this.state.highlightIdx = Math.min(this.state.highlightIdx + 1, this.state.dropdownItems.length - 1); this.renderDropdown(dd, inp.value.trim()); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); this.state.highlightIdx = Math.max(this.state.highlightIdx - 1, 0); this.renderDropdown(dd, inp.value.trim()); }
            else if (e.key === 'Enter') {
              e.preventDefault();
              submitBatch();
            }
          });

          const handleMobileKeyboardBatch = (e) => {
              if (window.innerWidth <= 768 && window.VirtualKeyboardModule && !inp.readOnly) {
                  e.preventDefault();
                  inp.blur();
                  window.VirtualKeyboardModule.open(inp, {
                      onSubmit: () => submitBatch()
                  });
              }
          };
          inp.addEventListener('click', handleMobileKeyboardBatch);
          inp.addEventListener('focus', handleMobileKeyboardBatch);

          clr.addEventListener('click', () => { inp.value = ''; clr.classList.remove('visible'); dd.classList.remove('open'); inp.focus(); });
          setTimeout(() => { if (window.innerWidth > 768) inp.focus(); }, 100);
      }

      body.querySelectorAll('.arl-batch-info').forEach(btn => btn.addEventListener('click', () => {
        const item = this.state.batchList[parseInt(btn.dataset.idx)];
        if (item && window.DetailPanel) window.DetailPanel.open(item.item, item.kind === 'mold' ? 'mold' : 'cutter');
      }));

      body.querySelectorAll('.arl-batch-remove').forEach(btn => btn.addEventListener('click', () => {
        this.state.batchList.splice(parseInt(btn.dataset.idx), 1);
        this.renderBody();
      }));

      document.getElementById('arl-batch-reset')?.addEventListener('click', () => { this.state.batchList = []; this.renderBody(); });
      document.getElementById('arl-batch-scan')?.addEventListener('click', () => { this.openCamera(this.state.batchList); });
    },

    // ===== DROPDOWN RENDERER =====
    renderDropdown(dd, query) {
      const items = this.state.dropdownItems;
      if (!items.length) {
        dd.innerHTML = '<div class="arl-dropdown-empty">該当なし / Không tìm thấy</div>';
        dd.classList.add('open'); return;
      }
      dd.innerHTML = items.map((r, i) => {
        const statusText = (r.status || '').includes('IN') || r.status === '入庫' ? '入庫' : ((r.status || '').includes('OUT') || r.status === '出庫' ? '出庫' : '—');
        const statusClass = statusText === '入庫' ? 'in' : (statusText === '出庫' ? 'out' : 'unknown');
        return `<div class="arl-dropdown-item ${i === this.state.highlightIdx ? 'highlighted' : ''}" data-idx="${i}">
          <div class="arl-dd-icon ${r.kind}"><i class="fas ${r.kind === 'mold' ? 'fa-cube' : 'fa-cut'}"></i></div>
          <div class="arl-dd-info">
            <div class="arl-dd-code">${this.highlightMatch(r.code, query)}</div>
            <div class="arl-dd-meta">${r.kind === 'mold' ? '金型' : '抜型'}</div>
          </div>
          <span class="arl-dd-status ${statusClass}">${statusText}</span>
        </div>`;
      }).join('');
      dd.classList.add('open');

      dd.querySelectorAll('.arl-dropdown-item').forEach(el => {
        el.addEventListener('click', () => {
          const idx = parseInt(el.dataset.idx);
          const sel = items[idx];
          if (!sel) return;
          if (this.state.mode === 'single') {
              this.state.singleTarget = { code: sel.code, kind: sel.kind, item: sel.item, normCode: sel.normCode, normId: sel.normId };
              dd.classList.remove('open');
              this.renderBody();
          }
          else {
            if (!this.state.batchList.find(b => this.normalizeCode(b.code) === sel.normCode)) {
              this.state.batchList.push({ code: sel.code, kind: sel.kind, item: sel.item, checked: false, normCode: sel.normCode, normId: sel.normId });
            }
            const inp = document.getElementById('arl-batch-input');
            if (inp) inp.value = '';
            dd.classList.remove('open');
            this.renderBody();
            setTimeout(() => document.getElementById('arl-batch-input')?.focus(), 50);
          }
        });
      });
    },

    // ===== CAMERA AR =====
    initAudio() {
      if (this.state.audioCtx) return;
      try { this.state.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    },

    beep() {
      if (!this.state.audioCtx) return;
      const now = Date.now();
      if (now - this.state.lastBeepTime < 600) return;
      this.state.lastBeepTime = now;
      try {
        if (this.state.audioCtx.state === 'suspended') this.state.audioCtx.resume();
        const osc = this.state.audioCtx.createOscillator();
        const gain = this.state.audioCtx.createGain();
        osc.type = 'sine'; osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.12, this.state.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.state.audioCtx.currentTime + 0.12);
        osc.connect(gain); gain.connect(this.state.audioCtx.destination);
        osc.start(); osc.stop(this.state.audioCtx.currentTime + 0.12);
      } catch (e) {}
    },

    openCamera(targets) {
      this.initAudio();
      let camRoot = document.getElementById('arl-camera-root');
      if (!camRoot) { camRoot = document.createElement('div'); camRoot.id = 'arl-camera-root'; document.body.appendChild(camRoot); }

      let targetInfo = '';
      if(this.state.mode === 'single') {
          targetInfo = `探索対象: ${targets[0].code}`;
      } else {
          targetInfo = targets.length > 0 ? `${targets.filter(t => !t.checked).length} 件未確認` : '全QRコードをスキャン';
      }

      camRoot.innerHTML = `
        <div class="arl-camera-overlay open" id="arl-camera-overlay">
          <div class="arl-camera-topbar">
            <button class="arl-camera-close" id="arl-cam-close">&times;</button>
            <div style="display:flex; flex-direction:column; line-height:1.2;">
               <span class="arl-camera-title" style="font-size:15px;">ARスキャン</span>
               <span style="font-size:10px; color:#aaa;">v1.1.5</span>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <select id="arl-camera-select" style="max-width:110px; font-size:12px; padding:4px; border-radius:4px;"></select>
              <button id="arl-cam-swap" style="border:1px solid #ccc; background:#f5f5f5; padding:4px 10px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer;">切替 / Đổi</button>
            </div>
          </div>
          <div style="background:rgba(0,0,0,0.5); padding:4px 10px; text-align:center;">
             <span class="arl-camera-target-badge" id="arl-cam-badge" style="${this.state.mode === 'single' ? 'background:rgba(13,109,110,0.5)' : ''}">${targetInfo}</span>
          </div>
          <div class="arl-camera-canvas-wrap">
            <video id="arl-video" playsinline></video>
            <canvas id="arl-canvas"></canvas>
          </div>
          <div class="arl-camera-bottombar">
            <div class="arl-camera-info"><span class="ja">QRコードをカメラに映してください</span></div>
          </div>
        </div>
      `;

      this.state.video = document.getElementById('arl-video');
      this.state.canvas = document.getElementById('arl-canvas');
      this.state.ctx = this.state.canvas.getContext('2d', { willReadFrequently: true });
      this.state.cameraTargets = targets;

      document.getElementById('arl-cam-close').addEventListener('click', () => this.closeCamera());
      document.getElementById('arl-cam-swap').addEventListener('click', () => this.toggleCamera());
      document.getElementById('arl-camera-select').addEventListener('change', (e) => {
         const newCam = e.target.value;
         if(newCam) this.startCamera(newCam);
      });
      this.startCamera();
    },

    toggleCamera() {
      if (this.state.cameras && this.state.cameras.length > 1) {
        let idx = this.state.cameras.findIndex(c => c.deviceId === this.state.currentCameraId);
        idx = (idx + 1) % this.state.cameras.length;
        const newCam = this.state.cameras[idx].deviceId;
        this.startCamera(newCam);
      } else {
        this.state.facingMode = this.state.facingMode === 'environment' ? 'user' : 'environment';
        this.startCamera();
      }
    },

    async startCamera(deviceId = null, isRetry = false) {
      this.stopCameraStream();
      this.state.scanning = true;
      try {
        if (!this.state.cameras) this.state.cameras = [];
        if (!this.state.cameras.length) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          this.state.cameras = devices.filter(d => d.kind === 'videoinput');
          const sel = document.getElementById('arl-camera-select');
          if (sel) {
            sel.innerHTML = '';
            this.state.cameras.forEach((cam, i) => {
              const opt = document.createElement('option');
              opt.value = cam.deviceId;
              opt.textContent = cam.label || `カメラ ${i + 1}`;
              sel.appendChild(opt);
            });
          }
        }

        const constraints = { 
            video: deviceId ? { deviceId: { exact: deviceId } } : (isRetry ? true : { facingMode: this.state.facingMode, width: { ideal: 640 }, height: { ideal: 480 } }), 
            audio: false 
        };
        this.state.stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.state.video.srcObject = this.state.stream;
        
        const track = this.state.stream.getVideoTracks()[0];
        if (track) {
           this.state.currentCameraId = track.getSettings().deviceId;
           const sel = document.getElementById('arl-camera-select');
           if(sel) sel.value = this.state.currentCameraId;
        }

        await this.state.video.play();
        requestAnimationFrame(() => this.camTick());
      } catch (err) {
        if (!isRetry && (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') && !deviceId) {
          console.warn('[ARLocator] Camera with facingMode not found, retrying without constraints...');
          return this.startCamera(null, true);
        }
        console.error('[ARLocator] Camera error:', err);
        const c = this.state.canvas; c.width = 400; c.height = 250;
        const x = this.state.ctx;
        x.fillStyle = '#1a1a2e'; x.fillRect(0, 0, 400, 250);
        x.fillStyle = '#fff'; x.font = 'bold 14px Arial'; x.textAlign = 'center';
        x.fillText('カメラ接続エラー / Lỗi Camera', 200, 120);
        x.fillStyle = '#94a3b8'; x.font = '11px Arial';
        x.fillText(err.message, 200, 145);
      }
    },

    stopCameraStream() {
      this.state.scanning = false;
      if (this.state.stream) { this.state.stream.getTracks().forEach(t => t.stop()); this.state.stream = null; }
    },

    closeCamera() {
      this.stopCameraStream();
      const overlay = document.getElementById('arl-camera-overlay');
      if (overlay) overlay.classList.remove('open');
      setTimeout(() => {
        const root = document.getElementById('arl-camera-root');
        if (root) root.innerHTML = '';
      }, 200);
      // Re-render
      this.renderBody();
    },

    camTick() {
      if (!this.state.scanning || !this.state.video) return;
      if (this.state.video.readyState === this.state.video.HAVE_ENOUGH_DATA) {
        const cw = this.state.video.videoWidth, ch = this.state.video.videoHeight;
        if (this.state.canvas.width !== cw) { this.state.canvas.width = cw; this.state.canvas.height = ch; }
        this.state.ctx.drawImage(this.state.video, 0, 0, cw, ch);
        const imgData = this.state.ctx.getImageData(0, 0, cw, ch);

        if (typeof window.jsQR === 'function') {
          const code = window.jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
          if (code) this.handleCamQR(code);
        }
      }
      if (this.state.scanning) requestAnimationFrame(() => this.camTick());
    },

    handleCamQR(code) {
      const rawText = String(code.data).trim();
      const parsed = window.QRScanSearch?.parsePayload?.(rawText);
      let parsedNorm = '';
      if (parsed && parsed.code) {
         parsedNorm = this.normalizeCode(parsed.code);
      } else {
         // Fallback cho mã in đơn giản
         parsedNorm = this.normalizeCode(rawText);
      }

      if (!parsedNorm) return;

      const loc = code.location;
      const ctx = this.state.ctx;
      const targets = this.state.cameraTargets || [];

      // Flexible Match function
      const isMatchFound = (target, qrNorm) => {
          if (!qrNorm) return false;
          const targetNorm = target.normCode;
          const targetId = target.normId;
          
          if (targetNorm === qrNorm || targetId === qrNorm) return true;
          if (qrNorm.length >= 3) {
             if (targetNorm && targetNorm.includes(qrNorm)) return true;
             if (targetNorm && qrNorm.includes(targetNorm)) return true;
             if (targetId && targetId.includes(qrNorm)) return true;
             if (targetId && qrNorm.includes(targetId)) return true;
          }
          return false;
      };

      let isMatch = false;
      let displayCode = parsed ? parsed.code : rawText;
      
      if(this.state.mode === 'single') {
          if (targets.length > 0 && isMatchFound(targets[0], parsedNorm)) {
              isMatch = true;
              displayCode = targets[0].code;
          }
      } else {
          // Batch Mode
          const found = targets.find(t => !t.checked && isMatchFound(t, parsedNorm));
          if (found) {
              isMatch = true;
              found.checked = true;
              displayCode = found.code;
              this.syncAuditLog(found); // 🔥 Ghi log audit
          } else {
             // Đã quét rồi thì thôi, không báo lỗi liên tục
             const alreadyChecked = targets.find(t => t.checked && isMatchFound(t, parsedNorm));
             if(alreadyChecked) {
                 isMatch = true; // Cho xanh lá luôn cho đẹp, ko bip
                 displayCode = alreadyChecked.code;
             }
          }
      }

      // Draw bounding box
      const color = isMatch ? '#00FF00' : '#FF3333';
      ctx.beginPath();
      ctx.moveTo(loc.topLeftCorner.x, loc.topLeftCorner.y);
      ctx.lineTo(loc.topRightCorner.x, loc.topRightCorner.y);
      ctx.lineTo(loc.bottomRightCorner.x, loc.bottomRightCorner.y);
      ctx.lineTo(loc.bottomLeftCorner.x, loc.bottomLeftCorner.y);
      ctx.closePath();
      ctx.lineWidth = 6; ctx.strokeStyle = color; ctx.stroke();
      
      // Shadow box để dễ nhìn hơn
      ctx.shadowColor = "black";
      ctx.shadowBlur = 5;
      ctx.lineWidth = 2; ctx.strokeStyle = 'white'; ctx.stroke();
      ctx.shadowBlur = 0; // reset

      // DEBUG OUTPUT ON CANVAS
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(10, 10, 380, 80);
      ctx.fillStyle = "white";
      ctx.font = "12px Courier";
      ctx.fillText(`Raw: ${rawText.substring(0,40)}`, 15, 25);
      ctx.fillText(`NormQR: ${parsedNorm}`, 15, 40);
      if (targets[0]) {
         ctx.fillText(`TargetCode: ${targets[0].normCode} | TargetId: ${targets[0].normId}`, 15, 55);
      }
      ctx.fillText(`Match: ${isMatch} | ParseFail: ${!parsed}`, 15, 70);

      if (isMatch) {
        ctx.font = 'bold 22px Arial'; ctx.fillStyle = '#00FF00';
        ctx.shadowColor = "black"; ctx.shadowBlur = 4;
        ctx.fillText('✓ ' + displayCode, loc.topLeftCorner.x, loc.topLeftCorner.y - 12);
        ctx.shadowBlur = 0;
        
        if(this.state.mode === 'single') {
            this.beep();
            this.state.scanning = false; // Stop scanning immediately
            
            // Lấy frame hiện tại làm ảnh
            const dataUrl = this.state.canvas.toDataURL('image/jpeg', 0.85);
            this.state.foundImage = dataUrl;
            
            setTimeout(() => {
                this.closeCamera();
            }, 600); // Đợi xíu cho người dùng nhìn thấy xanh
        } else {
            // Batch Mode
            const foundJustNow = targets.find(t => t.normCode === parsedNorm && t.checked);
            // Chỉ beep 1 lần cho mã mới (hoặc mã vừa được match)
            if (Date.now() - this.state.lastBeepTime > 1000) {
                 this.beep();
                 this.updateCamBadge();
                 if (window.showToast) window.showToast('success', '', `Đã quét: ${displayCode}`);
                 // Vẽ dấu check nhỏ trên màn hình (tuỳ chọn)
            }
        }
      }
    },

    updateCamBadge() {
      const badge = document.getElementById('arl-cam-badge');
      if (!badge || !this.state.cameraTargets || this.state.mode === 'single') return;
      const remaining = this.state.cameraTargets.filter(t => !t.checked).length;
      badge.textContent = remaining > 0 ? `${remaining} 件未確認` : '✓ 全件確認済';
      if (remaining === 0) badge.style.background = 'rgba(34,197,94,0.3)';
    },

    // ===== CIO SYNC AUDIT =====
    async syncAuditLog(targetItem) {
        const item = targetItem.item;
        const kind = targetItem.kind;
        const isMold = kind === 'mold';
        
        var ts = new Date().toISOString();
        var empId = window.localStorage ? window.localStorage.getItem('cio_default_employee_id') : null;
        var destId = null; // Bỏ qua dest
        
        var logData = {
          StatusLogID: 'S' + Date.now(),
          Timestamp: ts,
          MoldID: isMold ? (item.MoldID || item.MoldCode) : null,
          CutterID: !isMold ? (item.CutterID || item.CutterNo) : null,
          Status: 'AUDIT',
          DestinationID: destId,
          EmployeeID: empId,
          Notes: 'AR Locator Auto-Check'
        };

        const tmpId = 'tmp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
        
        // 1. Ghi Local Pending để UI render ngay lập tức
        if (window.DataManager && window.DataManager.data) {
            if (!window.DataManager.data.statuslogs) window.DataManager.data.statuslogs = [];
            window.DataManager.data.statuslogs.unshift(Object.assign({}, logData, { pending: true, localId: tmpId }));
            if (typeof window.DataManager.recompute === 'function') window.DataManager.recompute();
        }

        // Bắn event để UI khác tự update nếu đang mở
        document.dispatchEvent(new CustomEvent('data-manager-updated', { detail: { source: 'ar-locator', table: 'statuslogs' } }));

        try {
            // 2. Gửi Server
            const res = await fetch('https://ysd-moldcutter-backend.onrender.com/api/checklog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: 'audit',
                    itemType: kind,
                    MoldID: logData.MoldID,
                    CutterID: logData.CutterID,
                    Timestamp: logData.Timestamp,
                    Status: logData.Status,
                    DestinationID: logData.DestinationID,
                    EmployeeID: logData.EmployeeID,
                    Notes: logData.Notes
                })
            });
            const rj = await res.json();
            
            if (!rj || !rj.success) throw new Error(rj.message || 'Sync failed');

            // 3. Xóa Pending Local, Thêm Server Obj
            if (window.DataManager && window.DataManager.data) {
                window.DataManager.data.statuslogs = window.DataManager.data.statuslogs.filter(l => l.localId !== tmpId);
                if (rj && rj.newStatusLog) {
                    window.DataManager.data.statuslogs.unshift(rj.newStatusLog);
                }
                if (typeof window.DataManager.recompute === 'function') window.DataManager.recompute();
            }

            // 4. Bắn event báo hoàn tất
            document.dispatchEvent(new CustomEvent('data-manager-updated', { detail: { source: 'ar-locator', table: 'statuslogs' } }));
            if (logData.MoldID) document.dispatchEvent(new CustomEvent('mcs-data-sync', { detail: { idValue: logData.MoldID, payload: { Status: 'AUDIT' } } }));
            if (logData.CutterID) document.dispatchEvent(new CustomEvent('mcs-data-sync', { detail: { idValue: logData.CutterID, payload: { Status: 'AUDIT' } } }));

        } catch (e) {
            console.error('[ARLocator] Sync Audit Error:', e);
            // Đánh dấu lỗi trên object local nếu cần (tạm thời để đó)
            if (window.showToast) window.showToast('error', '', `Lỗi đồng bộ kiểm kê: ${targetItem.code}`);
        }
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => ARL.init(), { once: true });
  else ARL.init();
  window.ARLocatorModule = ARL;
})();

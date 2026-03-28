/* ============================================================================

DETAIL PANEL MODULE v8.3.4 (Desktop Mold-Centric + Extended Tab)

Refactor: Tách module Tab Ảnh (Photos) ra file riêng. (Desktop Mold-Centric + Extended Tab)

MoldCutter Search System

Mục tiêu:
- Desktop: lấy KHUÔN làm trung tâm, bố cục 3 cột (ảnh + vị trí | info chính | quick actions)
- Giữ 8 tab hiện tại hoạt động đúng (Info/Related/History/Teflon/Status/Photos/Comments/Analytics)
- Thêm tab "Mở rộng / Extended" CHỈ dùng CSV hiện có (molddesign/customers/jobs/racks/shiplog...)
- Song ngữ JP/VI
- Tương thích DataManager v8.1.0 + App v8.2.3

Created: 2026-02-04
============================================================================ */

(function() {
  'use strict';

  const VERSION = 'v8.4.3-6-1';

  class DetailPanel {
    constructor(panelId) {
      this.panelId = panelId || 'detailPanel';
      this.panel = document.getElementById(this.panelId);
      this.backdrop = document.getElementById('backdrop');

      this.currentItem = null;
      this.currentItemType = 'mold';
      this.currentTab = 'info';

      // ===== Navigation history (v8.3.2-7) =====
      this._navStack = [];
      this._navMax = 50;
      this._navGoingBack = false;

      // ===== Preview modal (v8.3.2-7) =====
      this._preview = { open: false, item: null, itemType: null, centerMold: null };

      // Mold-centric: khi mở cutter cố tìm khuôn để làm trung tâm
      this.centerMold = null;
      this.centerMoldReason = '';

      this._bound = false;
      this._resizeTimer = null;

      this.data = {
        molds: [],
        cutters: [],
        customers: [],
        molddesign: [],
        moldcutter: [],
        shiplog: [],
        locationlog: [],
        employees: [],
        racklayers: [],
        racks: [],
        companies: [],
        statuslogs: [],
        usercomments: [],
        jobs: [],
        processingitems: [],
        destinations: [],
        teflonlog: [],
        CAV: []
      };

      // ===== Tab modules registry (v8.3.4) =====
      this._modules = {};
      this._modulesInited = false;

      this.init();
    }

    // =====================================================================
    // INIT / LAYOUT
    // =====================================================================

    bindBodyDragScroll() {
      const body = this.panel ? this.panel.querySelector('.detail-panel-body') : null;
      if (!body || body.dataset.dpDragScrollBound === '1') return;
      body.dataset.dpDragScrollBound = '1';

      let isPointerDown = false;
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let startLeft = 0;
      let startTop = 0;

      const ignoreSelector = [
        'button',
        'a',
        'input',
        'select',
        'textarea',
        '[data-action]',
        '[data-jump]',
        '[data-module-open]',
        '[data-preview-action]',
        '.detail-tab',
        '.resize-handle',
        '.dp-action-btn',
        '.dp-assistive',
        '.dp-assistive-menu'
      ].join(',');

      const stopDrag = () => {
        isPointerDown = false;
        isDragging = false;
        body.classList.remove('dp-drag-scroll-active');
      };

      body.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target && e.target.closest && e.target.closest(ignoreSelector)) return;
        if (body.scrollWidth <= body.clientWidth && body.scrollHeight <= body.clientHeight) return;

        isPointerDown = true;
        isDragging = false;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = body.scrollLeft;
        startTop = body.scrollTop;
      });

      window.addEventListener('pointermove', (e) => {
        if (!isPointerDown) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (!isDragging) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          isDragging = true;
          body.classList.add('dp-drag-scroll-active');
        }

        body.scrollLeft = startLeft - dx;
        body.scrollTop = startTop - dy;
        e.preventDefault();
      }, { passive: false });

      window.addEventListener('pointerup', stopDrag, { passive: true });
      window.addEventListener('pointercancel', stopDrag, { passive: true });
    }

    init() {
      if (!this.panel) {
        console.error(`[DetailPanel ${VERSION}] Panel not found:`, this.panelId);
        return;
      }

      this.ensurePanelLayout()
      this.bindBodyDragScroll();

  // MOBILE ACTIONBAR v8.4.3-5-2;
      this.ensurePreviewStyles();

      if (!this._bound) {
        this.bindEvents();
        this._bound = true;
      }

      this.initModules();
      this.loadDataReferences();
      this.close(true);

      console.log(`✅ DetailPanel ${VERSION} initialized (9 tabs)`);
    }

    ensurePanelLayout() {
      this.panel.innerHTML = `
        <div class="detail-panel-header">
          <div class="detail-panel-title">
            <span class="item-type-badge" data-item-type="mold">金型</span>
            <span class="item-code-text">---</span>
          </div>
          <button class="detail-panel-back" aria-label="Back" type="button" hidden>
            <i class="fas fa-arrow-left"></i>
          </button>
          <button class="detail-panel-close" aria-label="Close">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <div class="detail-panel-tabs">
          <button class="detail-tab active" data-tab="info" type="button">
            <i class="fas fa-info-circle"></i>
            <span class="tab-label-ja">基本</span>
            <span class="tab-label-vi">Thông tin</span>
          </button>
          <button class="detail-tab" data-tab="related" type="button">
            <i class="fas fa-link"></i>
            <span class="tab-label-ja">系統図</span>
            <span class="tab-label-vi">Phả hệ</span>
          </button>
          <button class="detail-tab" data-tab="history" type="button">
            <i class="fas fa-history"></i>
            <span class="tab-label-ja">履歴</span>
            <span class="tab-label-vi">Lịch sử</span>
          </button>
          <button class="detail-tab" data-tab="teflon" type="button">
            <i class="fas fa-spray-can"></i>
            <span class="tab-label-ja">コート</span>
            <span class="tab-label-vi">Teflon</span>
          </button>
          <button class="detail-tab" data-tab="status" type="button">
            <i class="fas fa-clipboard-check"></i>
            <span class="tab-label-ja">状態</span>
            <span class="tab-label-vi">Tình trạng</span>
          </button>
          <button class="detail-tab" data-tab="photos" type="button">
            <i class="fas fa-camera"></i>
            <span class="tab-label-ja">写真</span>
            <span class="tab-label-vi">Ảnh</span>
          </button>
          <button class="detail-tab" data-tab="comments" type="button">
            <i class="fas fa-comments"></i>
            <span class="tab-label-ja">メモ</span>
            <span class="tab-label-vi">Ghi chú</span>
          </button>

          <button class="detail-tab" data-tab="extended" type="button">
            <i class="fas fa-layer-group"></i>
            <span class="tab-label-ja">拡張</span>
            <span class="tab-label-vi">Mở rộng</span>
          </button>
        </div>

        <div class="detail-panel-body">
          <div class="detail-tab-content active" data-tab-content="info"></div>
        <div class="dp-mobile-actionbar" data-dp-mobile-actionbar="1">
          <div class="dp-actions-grid" style="grid-template-columns: 1fr 1fr;">
            <button class="dp-action-btn" data-action="inout" type="button" title="入出庫・位置変更 / Nhập xuất" style="grid-column: span 2;">
              <i class="fas fa-map-marker-alt"></i>
              <div style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.2;">
                <span style="font-weight:700;font-size:13px;color:#1e293b;">入出庫・位置変更</span>
                <span class="sub" style="font-size:11px;font-weight:600;color:#64748b;margin-top:2px;">Nhập xuất, Vị trí</span>
              </div>
            </button>
            <button class="dp-action-btn" data-action="inventory" type="button" title="棚卸 / Kiểm kê">
              <i class="fas fa-clipboard-check"></i>
              <div style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.2;">
                <span style="font-weight:700;font-size:13px;color:#1e293b;">棚卸</span>
                <span class="sub" style="font-size:11px;font-weight:600;color:#64748b;margin-top:2px;">Kiểm kê</span>
              </div>
            </button>
            <button class="dp-action-btn" data-action="qr" type="button" title="QRコード / Mã QR">
              <i class="fas fa-qrcode"></i>
              <div style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.2;">
                <span style="font-weight:700;font-size:13px;color:#1e293b;">QR</span>
                <span class="sub" style="font-size:11px;font-weight:600;color:#64748b;margin-top:2px;">Mã QR</span>
              </div>
            </button>
            <button class="dp-action-btn" data-action="photo" type="button" title="写真 / Ảnh" style="grid-column: span 2;">
              <i class="fas fa-camera"></i>
              <div style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.2;">
                <span style="font-weight:700;font-size:13px;color:#1e293b;">写真</span>
                <span class="sub" style="font-size:11px;font-weight:600;color:#64748b;margin-top:2px;">Ảnh</span>
              </div>
            </button>
          </div>
        </div>

          <div class="detail-tab-content" data-tab-content="related"></div>
          <div class="detail-tab-content" data-tab-content="history"></div>
          <div class="detail-tab-content" data-tab-content="teflon"></div>
          <div class="detail-tab-content" data-tab-content="status"></div>
          <div class="detail-tab-content" data-tab-content="photos"></div>
          <div class="detail-tab-content" data-tab-content="comments"></div>
          <div class="detail-tab-content" data-tab-content="analytics"></div>
          <div class="detail-tab-content" data-tab-content="extended"></div>
        </div>
      `;

      if (!this.panel.classList.contains('detail-panel')) {
        this.panel.classList.add('detail-panel');
      }

    }

    bindHorizontalDragScroll() {
      if (this._dpHorizontalDragBound) return;
      this._dpHorizontalDragBound = true;

      const getScrollHost = () => {
        if (!this.panel) return null;
        return this.panel.querySelector('.detail-panel-body');
      };

      let isDown = false;
      let startX = 0;
      let startScrollLeft = 0;
      let moved = false;

      const onDown = (e) => {
        const host = getScrollHost();
        if (!host) return;
        if ((window.innerWidth || 0) > 1024) return;
        if (host.scrollWidth <= host.clientWidth + 2) return;

        const target = e.target;
        if (target && target.closest && target.closest('button, input, textarea, select, a, label, [data-action], .resize-handle')) {
          return;
        }

        isDown = true;
        moved = false;
        startX = e.clientX;
        startScrollLeft = host.scrollLeft;
        host.classList.add('dp-drag-scroll-active');
      };

      const onMove = (e) => {
        if (!isDown) return;
        const host = getScrollHost();
        if (!host) return;

        const dx = e.clientX - startX;
        if (Math.abs(dx) > 4) moved = true;
        host.scrollLeft = startScrollLeft - dx;
      };

      const onUp = () => {
        const host = getScrollHost();
        isDown = false;
        startX = 0;
        startScrollLeft = 0;
        if (host) host.classList.remove('dp-drag-scroll-active');
        setTimeout(() => { moved = false; }, 0);
      };

      document.addEventListener('pointerdown', onDown, true);
      document.addEventListener('pointermove', onMove, true);
      document.addEventListener('pointerup', onUp, true);
      document.addEventListener('pointercancel', onUp, true);

      document.addEventListener('click', (e) => {
        if (!moved) return;
        const host = getScrollHost();
        if (!host) return;
        if (!host.contains(e.target)) return;
        e.preventDefault();
        e.stopPropagation();
      }, true);
    }

    // ===== Preview styles injection (v8.3.2-7-2) =====
    // Mục tiêu: popup preview nhìn đúng kiểu "popup phổ thông" + làm mờ cột 2+3, vẫn cho phép bấm cột trái.
    ensurePreviewStyles() {
      // NOTE (v8.4.3-4-3): Tránh xung đột CSS.
      // CSS của preview đã được đưa sang file CSS riêng (detail-panel css).
      // Ở đây chỉ đảm bảo nếu bản cũ đã inject style thì sẽ bị ghi đè thành rỗng.
      try {
        let st = document.getElementById('dp-preview-style');
        if (!st) {
          st = document.createElement('style');
          st.id = 'dp-preview-style';
          document.head.appendChild(st);
        }
        st.textContent = '/* dp-preview-style intentionally minimal; use external CSS */';
      } catch (e) {
        // ignore
      }
    }



    // =====================================================================
    // TAB MODULE SYSTEM (v8.3.4)
    // Mục tiêu: mỗi tab có thể tách thành 1 module riêng (1 file JS)
    // - Module đăng ký qua: window.DetailPanelTabModules = { photos: moduleObj, ... }
    // - Hoặc compat: window.DetailPanelPhotosTabModule
    // - moduleObj hỗ trợ: render(dp) -> html, bind(dp, container), loadIntoHost(dp, host)
    // =====================================================================

    initModules() {
      if (this._modulesInited) return;
      this._modulesInited = true;

      try {
        if (window.DetailPanelTabModules && typeof window.DetailPanelTabModules === 'object') {
          this._modules = Object.assign({}, window.DetailPanelTabModules);
        }
      } catch (e) { /* ignore */ }

      try {
        if (!this._modules.photos && window.DetailPanelPhotosTabModule) {
          this._modules.photos = window.DetailPanelPhotosTabModule;
        }
      } catch (e) { /* ignore */ }
    }

    getTabModule(tabKey) {
      this.initModules();
      const k = String(tabKey || '').toLowerCase();
      return (this._modules && this._modules[k]) ? this._modules[k] : null;
    }

    bindTabModuleIfAny(tabKey) {
      try {
        const k = String(tabKey || '').toLowerCase();
        const mod = this.getTabModule(k);
        if (!mod || typeof mod.bind !== 'function') return;
        const container = this.panel ? this.panel.querySelector(`[data-tab-content="${k}"]`) : null;
        if (!container) return;
        mod.bind(this, container);
      } catch (e) { /* ignore */ }
    }

    bindEvents() {

      this.panel.addEventListener('click', (e) => {
        const jumpBtn = e.target.closest('button[data-jump]');
        if (jumpBtn) {
          e.preventDefault();
          e.stopPropagation();
          const target = jumpBtn.dataset.jump;
          let tab = 'extended'; // Mặc định mở tab extended
          
          if (target === 'history') { tab = 'history'; }
          else if (target === 'teflon') { tab = 'teflon'; }
          else if (target === 'storage') { 
              // Storage usually in related or extended. We will map to extended
              tab = 'extended'; 
          }
          
          if (typeof this.switchTab === 'function') {
            this.switchTab(tab);
          }
          
          // Scroll specifically for extended groupings
          if (tab === 'extended') {
            setTimeout(() => {
              const activeBody = this.panel.querySelector('.dp-tab-pane.active');
              if (!activeBody) return;
              
              let keywords = [];
              if (target === 'design') keywords = ['thiết kế', 'kỹ thuật', 'kích thước'];
              if (target === 'customers') keywords = ['khách hàng', 'customer', 'liên hệ'];
              if (target === 'product') keywords = ['sản phẩm', 'tray', 'job'];
              if (target === 'storage') keywords = ['vị trí', 'lưu trữ', 'kho', 'kệ'];
              if (target === 'transfer') keywords = ['vận chuyển', 'giao hàng', 'vận tải'];
              
              if (keywords.length > 0) {
                 const headers = Array.from(activeBody.querySelectorAll('.grouped-title, .section-title, h3, h4, .ext-card-header, .dp-section-title'));
                 const found = headers.find(h => keywords.some(k => (h.textContent || '').toLowerCase().includes(k)));
                 if (found) {
                    found.scrollIntoView({ behavior: 'smooth', block: 'start' });
                 } else {
                    const wrap = activeBody.querySelector('.dp-extended-wrapper');
                    if(wrap) wrap.scrollTop = 0;
                 }
              }
            }, 300);
          }
        }
      });

      const closeBtn = this.panel.querySelector('.detail-panel-close');
      if (closeBtn) closeBtn.addEventListener('click', () => this.close());

      const backBtn = this.panel.querySelector('.detail-panel-back');
      if (backBtn) backBtn.addEventListener('click', () => this.goBack());

      if (this.backdrop) {
        this.backdrop.addEventListener('click', () => this.close());
      }

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.panel.classList.contains('open')) {
          if (this.isPreviewOpen && this.isPreviewOpen()) {
            this.closePreview();
            return;
          }
          this.close();
        }
      });

      const tabs = this.panel.querySelectorAll('.detail-tab');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const t = tab.dataset.tab;
          if (t) this.switchTab(t);
        });
      });

      // Event delegation cho quick actions, module buttons, jumps
      this.panel.addEventListener('click', async (e) => {
        // ─────────────────────────────────────────────
        // Ảnh preview: bấm để mở ảnh thật / upload / xóa
        // ─────────────────────────────────────────────

        // A) Bấm nút Download ảnh thật (ưu tiên dpFullUrl, fallback DevicePhotoStore)
        const btnDownload = e.target && e.target.closest ? e.target.closest('[data-dp-photo-download="1"]') : null;
        if (btnDownload) {
          e.preventDefault();
          e.stopPropagation();
          try {
            const img0 = this.panel ? this.panel.querySelector('img[data-dp-thumb-img="1"]') : null;

            const title = (this.currentItemType === 'cutter')
              ? String(this.currentItem && (this.currentItem.CutterNo || this.currentItem.CutterID) || 'cutter')
              : String(this.currentItem && (this.currentItem.MoldCode || this.currentItem.MoldID) || 'mold');

            let fullUrl = '';
            try { fullUrl = String(img0 && img0.dataset ? (img0.dataset.dpFullUrl || '') : '').trim(); } catch (e0) {}

            // Fallback: lấy ảnh active mới nhất từ DevicePhotoStore
            if (!fullUrl && window.DevicePhotoStore && typeof window.DevicePhotoStore.getLatestActivePhotoForDevice === 'function') {
              const dt = String(img0 && img0.dataset ? (img0.dataset.dpDeviceType || this.currentItemType || '') : (this.currentItemType || '')).trim();
              const did = String(img0 && img0.dataset ? (img0.dataset.dpDeviceId || '') : '').trim();
              if (dt && did) {
                const row = await window.DevicePhotoStore.getLatestActivePhotoForDevice(dt, did);
                fullUrl = row ? String(row.publicurl || row.publicUrl || row.public_url || '').trim() : '';
              }
            }

            if (!fullUrl) {
              this.notify('Chưa có URL ảnh thật để tải.', 'warning');
              return;
            }

            // Download: ưu tiên fetch -> blob (ổn định hơn), fallback mở link trực tiếp
            const safeBase = String(title || 'photo').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 80);
            const fileName = safeBase + '.jpg';

            let blobUrl = '';
            try {
              const resp = await fetch(fullUrl, { mode: 'cors', credentials: 'omit' });
              if (!resp.ok) throw new Error('HTTP ' + resp.status);
              const blob = await resp.blob();
              blobUrl = URL.createObjectURL(blob);

              const a = document.createElement('a');
              a.href = blobUrl;
              a.download = fileName;
              document.body.appendChild(a);
              a.click();
              a.remove();

              setTimeout(() => { try { URL.revokeObjectURL(blobUrl); } catch (e2) {} }, 800);
              return;
            } catch (eFetch) {
              // Fallback: thử download trực tiếp bằng <a href>
              const a2 = document.createElement('a');
              a2.href = fullUrl;
              a2.download = fileName;
              a2.target = '_blank';
              a2.rel = 'noopener';
              document.body.appendChild(a2);
              a2.click();
              a2.remove();
              return;
            }
          } catch (err) {
            this.notify('Tải ảnh thất bại.', 'error');
            return;
          }
        }


        // (B) Bấm vào ảnh thumb => mở nhanh ảnh thật
        const imgEl = e.target && e.target.closest ? e.target.closest('img[data-dp-thumb-img="1"]') : null;
        if (imgEl) {
          e.preventDefault();
          e.stopPropagation();

          try {
            const title = (this.currentItemType === 'cutter')
              ? String((this.currentItem && (this.currentItem.CutterNo || this.currentItem.CutterID)) || '')
              : String((this.currentItem && (this.currentItem.MoldCode || this.currentItem.MoldID)) || '');

            let fullUrl = String(imgEl.dataset.dpFullUrl || '').trim();

            // Nếu chưa có dpFullUrl thì tự lấy ảnh mới nhất
            if (!fullUrl && window.DevicePhotoStore && typeof window.DevicePhotoStore.getLatestActivePhotoForDevice === 'function') {
              const dt = String(imgEl.dataset.dpDeviceType || this.currentItemType || '').trim();
              const did = String(imgEl.dataset.dpDeviceId || '').trim();
              if (dt && did) {
                const row = await window.DevicePhotoStore.getLatestActivePhotoForDevice(dt, did);
                fullUrl = row ? String(row.publicurl || row.publicUrl || row.public_url || '') : '';
              }
            }

            if (!fullUrl) return;

            if (window.MCSQuickPhotoViewer && typeof window.MCSQuickPhotoViewer.open === 'function') {
              window.MCSQuickPhotoViewer.open({ title: title || 'Photo', url: fullUrl });
            } else {
              window.open(fullUrl, '_blank', 'noopener');
            }
          } catch (err) {}

          return;
        }

        // (C) Bấm “khu vực chưa có ảnh” => mở upload/chụp ảnh
        const btnUpload = e.target && e.target.closest ? (
          e.target.closest('[data-dp-photo-upload="1"]') || e.target.closest('[data-dp-thumb-placeholder="1"]')
        ) : null;

        if (btnUpload) {
          e.preventDefault();
          e.stopPropagation();

          try {
            const deviceType = String(this.currentItemType || 'mold');
            const deviceId = (deviceType === 'mold')
              ? (this.currentItem && (this.currentItem.MoldID || this.currentItem.MoldCode))
              : (this.currentItem && (this.currentItem.CutterID || this.currentItem.CutterNo));

            const deviceCode = (deviceType === 'mold')
              ? String((this.currentItem && (this.currentItem.MoldCode || this.currentItem.MoldID)) || '')
              : String((this.currentItem && (this.currentItem.CutterNo || this.currentItem.CutterID)) || '');

            if (!window.PhotoUpload || typeof window.PhotoUpload.open !== 'function') {
              this.notify('Chưa load module upload ảnh (photo-upload)', 'error');
              return;
            }

            window.PhotoUpload.open({
              mode: 'device',
              deviceType: deviceType,
              deviceId: String(deviceId || ''),
              deviceCode: deviceCode,
              deviceDims: '',
              onDone: () => {
                try { this.hydrateDesktopPhotoPreviewFromSupabase(); } catch (e) {}
              }
            });
          } catch (err) {}

          return;
        }

        // (D) Bấm nút thùng rác => đưa ảnh này vào thùng rác (confirm)
        const btnTrash = e.target && e.target.closest ? e.target.closest('[data-dp-photo-trash="1"]') : null;
        if (btnTrash) {
          e.preventDefault();
          e.stopPropagation();

          try {
            const img1 = this.panel ? this.panel.querySelector('img[data-dp-thumb-img="1"]') : null;
            let photoId = img1 ? String(img1.dataset.dpPhotoId || '').trim() : '';

            // Nếu chưa có dpPhotoId thì tự lấy row mới nhất để lấy id
            if (!photoId && window.DevicePhotoStore && typeof window.DevicePhotoStore.getLatestActivePhotoForDevice === 'function') {
              const deviceType = String(this.currentItemType || 'mold');
              const deviceId = (deviceType === 'mold')
                ? (this.currentItem && (this.currentItem.MoldID || this.currentItem.MoldCode))
                : (this.currentItem && (this.currentItem.CutterID || this.currentItem.CutterNo));

              const row = await window.DevicePhotoStore.getLatestActivePhotoForDevice(deviceType, String(deviceId || ''));
              photoId = row ? String(row.id || '') : '';
            }

            if (!photoId) {
              this.notify('Chưa có ảnh để xóa', 'info');
              return;
            }

            const ok = confirm('Bạn có chắc muốn đưa ảnh này vào thùng rác không?');
            if (!ok) return;

            if (!window.DevicePhotoStore || typeof window.DevicePhotoStore.moveToTrash !== 'function') {
              this.notify('DevicePhotoStore chưa sẵn sàng', 'error');
              return;
            }

            await window.DevicePhotoStore.moveToTrash(Number(photoId));
            this.notify('Đã đưa ảnh vào thùng rác', 'success');

            setTimeout(() => {
              try { this.hydrateDesktopPhotoPreviewFromSupabase(); } catch (e) {}
            }, 50);
          } catch (err) {
            this.notify('Xóa ảnh thất bại', 'error');
          }

          return;
        }

        const actionBtn = e.target && e.target.closest ? e.target.closest('.dp-action-btn') : null;
        if (actionBtn) {
          e.preventDefault();
          e.stopPropagation();
          const action = actionBtn.dataset.action;
          if (action) this.handleQuickAction(action);
          return;
        }

        const moduleBtn = e.target && e.target.closest ? e.target.closest('[data-module-open]') : null;
        if (moduleBtn) {
          e.preventDefault();
          e.stopPropagation();
          const moduleKey = moduleBtn.getAttribute('data-module-open');
          this.openFutureModule(moduleKey);
          return;
        }

        const pAct = e.target && e.target.closest ? e.target.closest('[data-preview-action]') : null;
        if (pAct) {
          e.preventDefault();
          e.stopPropagation();
          const key = pAct.getAttribute('data-preview-action');
          if (key === 'close') {
            this.closePreview();
            return;
          }
          if (key === 'open-full') {
            try {
              const p = this._preview || {};
              const it = p.item;
              const tp = p.itemType;
              this.closePreview();
              if (it) this.open(it, tp, { fromPanelLink: true });
            } catch (err) {}
            return;
          }
          if (key === 'open-full-mold') {
            try {
              const p = this._preview || {};
              const m = p.centerMold;
              this.closePreview();
              if (m) this.open(m, 'mold', { fromPanelLink: true });
            } catch (err) {}
            return;
          }
        }

        const viewBtn = e.target && e.target.closest ? e.target.closest('.view-detail-btn') : null;
        if (viewBtn) {
          e.preventDefault();
          e.stopPropagation();
          try {
            const item = JSON.parse(viewBtn.dataset.item || '{}');
            const t = viewBtn.dataset.itemType || item.type || item.itemType || null;
            if (item) this.openPreview(item, t);
          } catch (err) {
            console.warn(`[DetailPanel ${VERSION}] view-detail-btn parse error`, err);
          }
          return;
        }

        const jump = e.target && e.target.closest ? e.target.closest('[data-jump]') : null;
        if (jump) {
          e.preventDefault();
          e.stopPropagation();
          const key = jump.getAttribute('data-jump');
          this.handleJump(key);
          return;
        }
      });



// Preview actions (modal is appended to document.body, so use document-level delegation)
document.addEventListener('click', (e) => {
  try {
    const btn = e.target && e.target.closest ? e.target.closest('[data-preview-action]') : null;
    if (!btn) return;

    const inPreview = (btn.closest && (btn.closest('.dp-preview-modal') || btn.closest('.dp-preview-modal-backdrop')));
    if (!inPreview) return;

    e.preventDefault();
    e.stopPropagation();

    const key = btn.getAttribute('data-preview-action');

    if (key === 'close') {
      this.closePreview();
      return;
    }

    if (key === 'open-full') {
      const p = this._preview || {};
      const it = p.item;
      const tp = p.itemType;
      this.closePreview();
      if (it) this.open(it, tp, { fromPanelLink: true });
      return;
    }

    if (key === 'open-full-mold') {
      const p = this._preview || {};
      const m = p.centerMold;
      this.closePreview();
      if (m) this.open(m, 'mold', { fromPanelLink: true });
      return;
    }
  } catch (err) {
    // ignore
  }
}, true);

      window.addEventListener('resize', () => {
        if (!this.panel.classList.contains('open')) return;

        // v8.4.3-1: nếu đang mở preview thì luôn canh lại vị trí (mọi tab)
        if (this.isPreviewOpen()) {
          this.renderPreviewOverlay();
        }

        if (this.currentTab !== 'info') return;
        clearTimeout(this._resizeTimer);
        this._resizeTimer = setTimeout(() => this.refreshCurrentTab(), 140);
      });

      document.addEventListener('data-manager-updated', () => {
        this.loadDataReferences();
        if (this.panel.classList.contains('open') && this.currentItem) this.refreshCurrentTab();
      });
      document.addEventListener('data-manager:ready', () => {
        this.loadDataReferences();
        if (this.panel.classList.contains('open') && this.currentItem) this.refreshCurrentTab();
      });

      // Compat events
      document.addEventListener('showDetailPanel', (e) => {
        try {
          const d = e && e.detail ? e.detail : {};
          const item = d.item || d.data || null;
          const itemType = d.type || d.itemType || (item ? item.type : null);
          if (item) this.open(item, itemType);
        } catch (err) {
          console.warn(`[DetailPanel ${VERSION}] showDetailPanel error`, err);
        }
      });

      document.addEventListener('openDetailPanel', (e) => {
        try {
          const d = e && e.detail ? e.detail : {};
          const item = d.item || d.data || null;
          const itemType = d.type || d.itemType || (item ? item.type : null);
          if (item) this.open(item, itemType);
        } catch (err) {
          console.warn(`[DetailPanel ${VERSION}] openDetailPanel error`, err);
        }
      });
    }

    loadDataReferences() {
      try {
        if (typeof window.DataManager !== 'undefined' && window.DataManager.data) {
          const d = window.DataManager.data;
          this.data.molds = d.molds || [];
          this.data.cutters = d.cutters || [];
          this.data.customers = d.customers || [];
          this.data.molddesign = d.molddesign || [];
          this.data.moldcutter = d.moldcutter || [];
          this.data.racklayers = d.racklayers || [];
          this.data.racks = d.racks || [];
          this.data.companies = d.companies || [];
          this.data.shiplog = d.shiplog || [];
          this.data.locationlog = d.locationlog || [];
          this.data.usercomments = d.usercomments || [];
          this.data.employees = d.employees || [];
          this.data.jobs = d.jobs || [];
          this.data.processingitems = d.processingitems || [];
          this.data.destinations = d.destinations || [];
          this.data.statuslogs = d.statuslogs || [];
          this.data.teflonlog = d.teflonlog || [];
          this.data.CAV = d.CAV || [];
          return;
        }
      } catch (e) { /* ignore */ }

      try {
        if (window.ALL_DATA) {
          const d = window.ALL_DATA;
          Object.keys(this.data).forEach(k => {
            if (Array.isArray(d[k])) this.data[k] = d[k];
          });
        }
      } catch (e) { /* ignore */ }
    }

    // =====================================================================
    // OPEN / CLOSE
    // =====================================================================

    normalizeItemType(item, itemType) {
      const raw = (itemType || item?.type || item?.ItemType || item?.itemType || '').toString().toLowerCase();
      if (raw.includes('cutter') || raw.includes('cut') || raw.includes('抜') || raw.includes('dao')) return 'cutter';
      if (raw.includes('mold') || raw.includes('khuon') || raw.includes('金') || raw.includes('khuôn')) return 'mold';
      if (item && (item.CutterID || item.CutterNo || item.CutterName || item.CutterDesignCode)) return 'cutter';
      return 'mold';
    }

    open(item, itemType, opts = {}) {
      if (!item) return;

      const o = (opts && typeof opts === 'object') ? opts : {};

      // Mở từ bên ngoài panel thì reset Back để không back nhầm.
      if (!o.fromPanelLink && !o.fromBack) {
        this.clearNavStack();
      }

      // Nếu MỞ FULL từ panel thì lưu trạng thái hiện tại để Back.
      if (o.fromPanelLink && !o.skipHistory && this.currentItem) {
        this.pushNavStateIfNeeded();
      }
      
      this.currentItemType = this.normalizeItemType(item, itemType);
      
      // Resolve item đầy đủ từ data nếu item từ data-item là bản rút gọn
      item = this.resolveFullItem(item, this.currentItemType);
      
      this.currentItem = item;
      this.centerMold = null;
      this.centerMoldReason = '';
      
      if (this.currentItemType === 'mold') {
        this.centerMold = item;
        this.centerMoldReason = 'direct';
      } else {
        this.centerMold = this.findCenterMoldFromCutter(item);
      }
      
      this.ensureRelatedListsForOpen();
      this.updateHeader();
      const firstTab = (o.restoreTab ? String(o.restoreTab) : 'info');
      this.switchTab(firstTab);
      
      this.panel.classList.add('open');
      
      if (this.backdrop) this.backdrop.classList.add('show');
      document.body.style.overflow = 'hidden';
    }


    close(silent = false) {
      this.panel.classList.remove('open');
      try {
        if (this.panel) this.panel.dataset.dpTab = '';
      } catch (e) {}

      this.clearNavStack();
      this.closePreview();
      if (this.backdrop) this.backdrop.classList.remove('show');
      document.body.style.overflow = '';

      if (!silent) {
        setTimeout(() => {
          this.currentItem = null;
          this.currentItemType = 'mold';
          this.centerMold = null;
          this.centerMoldReason = '';
        }, 220);
      }
    }

    updateHeader() {
      const badge = this.panel.querySelector('.item-type-badge');
      const codeText = this.panel.querySelector('.item-code-text');
      if (!codeText) return;

      // Nhãn JP cố định theo loại
      const typeLabel = (this.currentItemType === 'cutter') ? '抜型' : '金型';

      let code = '---';
      if (this.currentItemType === 'cutter') {
        code = this.currentItem?.CutterNo || this.currentItem?.CutterID || '---';
      } else {
        code = this.currentItem?.MoldCode || this.currentItem?.MoldID || '---';
      }

      // Gộp vào 1 dòng: "金型 JAE371"
      codeText.textContent = `${typeLabel} ${code}`;

      // Badge cũ: không cần nữa
      if (badge) {
        badge.textContent = '';
        badge.hidden = true;
      }
    

      this.updateBackButtonState();
    }

    // =====================================================================
    // NAV HISTORY (v8.3.2-7)
    // =====================================================================

    clearNavStack() {
      this._navStack = [];
      this.updateBackButtonState();
    }

    updateBackButtonState() {
      try {
        const btn = this.panel ? this.panel.querySelector('.detail-panel-back') : null;
        if (!btn) return;
        const has = Array.isArray(this._navStack) && this._navStack.length > 0;
        btn.hidden = !has;
        btn.disabled = !has;
      } catch (e) { /* ignore */ }
    }

    serializeNavRef(item, type) {
      const t = String(type || '').toLowerCase();
      if (t === 'cutter') {
        return {
          CutterID: this.normId(item?.CutterID || item?.ID) || '',
          CutterNo: this.normId(item?.CutterNo || item?.CutterCode) || ''
        };
      }
      return {
        MoldID: this.normId(item?.MoldID) || '',
        MoldCode: this.normId(item?.MoldCode) || ''
      };
    }

    buildNavState() {
      if (!this.currentItem) return null;
      return {
        itemType: this.currentItemType,
        tab: this.currentTab || 'info',
        ref: this.serializeNavRef(this.currentItem, this.currentItemType)
      };
    }

    pushNavStateIfNeeded() {
      try {
        const s = this.buildNavState();
        if (!s) return;

        const last = (this._navStack && this._navStack.length) ? this._navStack[this._navStack.length - 1] : null;
        const same = last && last.itemType === s.itemType && last.tab === s.tab && JSON.stringify(last.ref) === JSON.stringify(s.ref);
        if (same) return;

        this._navStack.push(s);
        if (this._navStack.length > (this._navMax || 50)) {
          this._navStack.splice(0, this._navStack.length - (this._navMax || 50));
        }
        this.updateBackButtonState();
      } catch (e) { /* ignore */ }
    }

    goBack() {
      try {
        if (this._navGoingBack) return;
        if (!this._navStack || !this._navStack.length) return;

        const prev = this._navStack.pop();
        this.updateBackButtonState();
        if (!prev) return;

        this._navGoingBack = true;
        this.open(prev.ref, prev.itemType, { fromBack: true, restoreTab: prev.tab, skipHistory: true });
      } catch (e) {
        // ignore
      } finally {
        this._navGoingBack = false;
      }
    }

    // =====================================================================
    // PREVIEW MODAL (v8.3.2-7)
    // - Popup nổi, làm mờ layer bên dưới (chỉ cột 2+3), cột trái vẫn bấm được.
    // =====================================================================

    isPreviewOpen() {
      return !!(this._preview && this._preview.open);
    }

    computeCenterMoldForPreviewCutter(cutter) {
      try {
        const molds = this.getSharedMoldsForCutter(cutter) || [];
        if (!molds.length) return null;
        const direct = molds.find(m => String(m.__dpLinkKind || m.dpLinkKind || '').toLowerCase() === 'direct');
        return direct || molds[0];
      } catch (e) {
        return null;
      }
    }

    openPreview(item, itemType) {
      try {
        if (!item) return;

        const t = this.normalizeItemType(item, itemType);
        const full = this.resolveFullItem(item, t);

        let centerMold = null;
        if (t === 'cutter') {
          centerMold = this.computeCenterMoldForPreviewCutter(full);
        }

        this._preview = { open: true, item: full, itemType: t, centerMold };
        try { if (this.panel) this.panel.classList.add('dp-preview-open'); } catch (e) {}
        this.renderPreviewOverlay();
      } catch (e) {
        // ignore
      }
    }

    closePreview() {
      try {
        if (this._preview) {
          this._preview.open = false;
          this._preview.item = null;
          this._preview.itemType = null;
          this._preview.centerMold = null;
        }

        const b = document.querySelector('.dp-preview-modal-backdrop');
        if (b && b.parentNode) b.parentNode.removeChild(b);

        const m = document.querySelector('.dp-preview-modal');
        if (m && m.parentNode) m.parentNode.removeChild(m);

        try { if (this.panel) this.panel.classList.remove('dp-preview-open'); } catch (e) {}
      } catch (e) {
        // ignore
      }
    }

    bindPreviewSwipeToClose(el) {
      try {
        let startX = 0;
        let startY = 0;

        el.addEventListener('touchstart', (e) => {
          try {
            const t = e.touches && e.touches[0];
            if (!t) return;
            startX = t.clientX;
            startY = t.clientY;
          } catch (err) {}
        }, { passive: true });

        el.addEventListener('touchend', (e) => {
          try {
            const t = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
            if (!t) return;
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;
            if (dy > 70 && dy > Math.abs(dx) * 1.3) {
              this.closePreview();
            }
          } catch (err) {}
        }, { passive: true });
      } catch (e) {
        // ignore
      }
    }

    buildPreviewCenterHtml(item, itemType, centerMoldForCutter) {
      try {
        if (!item) return '<p class="no-data">No preview item</p>';

        const t = String(itemType || '').toLowerCase();
        let html = '';

        // Full giống cột giữa
        html += this.renderPreviewHero(item, t);
        html += this.renderBasicInfoSection(item, t);
        html += this.renderProductInfoSection(item, t);
        html += this.renderTechnicalInfoSection(item, t);
        html += this.renderStatusNotesSection(item, t);
        html += this.renderAdditionalDataSection(item, t);

        if (t === 'cutter' && centerMoldForCutter) {
          html += `
            <div class="modal-section">
              <div class="section-header">
                <i class="fas fa-cube"></i>
                <span>Khuôn trung tâm</span>
              </div>
              <div class="info-message">
                Dao cắt có thể dùng chung; khuôn trung tâm chỉ tham khảo: <b>${this.safeText(centerMoldForCutter.MoldCode || centerMoldForCutter.MoldID)}</b>
                <button class="btn-action" style="margin-left:8px" type="button" data-preview-action="open-full-mold">Mở khuôn</button>
              </div>
            </div>
          `;
        }

        return html;
      } catch (e) {
        return '<p class="no-data">Preview render error</p>';
      }
    }

    renderPreviewOverlay() {
      try {
        if (!this.panel || !this.panel.classList.contains('open')) return;

        if (!this.isPreviewOpen()) {
          this.closePreview();
          return;
        }

        const isInfoTab = (this.currentTab === 'info');

        const tabs = this.panel.querySelector('.detail-panel-tabs');
        const topRect = (tabs ? tabs.getBoundingClientRect() : this.panel.getBoundingClientRect());
        const top = Math.round(topRect.bottom + 8);
        const bottom = 10;

        const right = 10;
        let left = 10;

        // Tab Info: giữ cách tính "không che cột trái" như cũ
        if (isInfoTab) {
          const grid = this.panel.querySelector('.dp-desktop-grid');
          const leftCol = grid ? grid.querySelector('.dp-col-left') : null;
          if (leftCol) {
            const lr = leftCol.getBoundingClientRect();
            left = Math.round(lr.right + 10);
          }
        }

        let backdrop = document.querySelector('.dp-preview-modal-backdrop');
        if (!backdrop) {
          backdrop = document.createElement('div');
          backdrop.className = 'dp-preview-modal-backdrop';
          backdrop.style.position = 'fixed';
          backdrop.style.zIndex = '10080';
          backdrop.style.background = 'rgba(15, 23, 42, 0.55)';
          backdrop.style.borderRadius = '16px';
          backdrop.style.pointerEvents = 'auto';
          backdrop.style.backdropFilter = 'blur(2px) saturate(0.85)';
          backdrop.addEventListener('click', () => this.closePreview());
          document.body.appendChild(backdrop);
        }

        // Info: backdrop chỉ phủ vùng cột 2+3; tab khác: phủ rộng
        backdrop.style.top = top + 'px';
        backdrop.style.bottom = bottom + 'px';
        backdrop.style.left = (isInfoTab ? left : 10) + 'px';
        backdrop.style.right = right + 'px';

        let modal = document.querySelector('.dp-preview-modal');
        const isNew = !modal;
        if (!modal) {
          modal = document.createElement('div');
          modal.className = 'dp-preview-modal';
          modal.setAttribute('role', 'dialog');
          modal.setAttribute('aria-modal', 'false');
          modal.tabIndex = -1;
          modal.style.position = 'fixed';
          modal.style.zIndex = '10090';
          modal.style.background = 'rgba(255,255,255,0.99)';
          modal.style.border = '1px solid rgba(0,0,0,0.10)';
          modal.style.borderRadius = '16px';
          modal.style.boxShadow = '0 18px 50px rgba(0,0,0,0.18)';
          modal.style.overflow = 'hidden';
          modal.style.display = 'flex';
          modal.style.flexDirection = 'column';
          modal.style.transition = 'transform 160ms ease, opacity 160ms ease';
          modal.addEventListener('click', (e) => e.stopPropagation());
          document.body.appendChild(modal);
        }

        modal.classList.toggle('dp-preview-drawer', !isInfoTab);

        if (isInfoTab) {
          // Centered popup inside area (col2+3)
          const availW = Math.max(320, window.innerWidth - (left + 10) - (right + 10));
          const modalW = Math.min(980, Math.max(360, availW - 40));
          const modalLeft = Math.round((left + 10) + (availW - modalW) / 2);

          modal.style.top = (top + 18) + 'px';
          modal.style.left = modalLeft + 'px';
          modal.style.right = 'auto';
          modal.style.bottom = (bottom + 18) + 'px';
          modal.style.width = modalW + 'px';
          modal.style.maxHeight = 'calc(100vh - ' + (top + 18 + bottom + 18) + 'px)';

          modal.style.transform = 'translateX(0px)';
          modal.style.opacity = '1';

        } else {
          // Drawer (slide-in) from right for all other tabs
          const isMobile = window.innerWidth <= 640;

          modal.style.top = top + 'px';
          modal.style.bottom = bottom + 'px';

          if (isMobile) {
            modal.style.left = '0px';
            modal.style.right = '0px';
            modal.style.width = '100vw';
            modal.style.maxHeight = 'calc(100vh - ' + (top + bottom) + 'px)';
          } else {
            const drawerW = Math.min(520, Math.max(360, Math.round(window.innerWidth * 0.42)));
            modal.style.left = 'auto';
            modal.style.right = right + 'px';
            modal.style.width = drawerW + 'px';
            modal.style.maxHeight = 'calc(100vh - ' + (top + bottom) + 'px)';
          }

        }

        modal.dataset.dpPreviewLastMode = (!isInfoTab ? 'drawer' : 'popup');

        const p = this._preview || {};
        const t = p.itemType;
        const item = p.item;

        try {
          const tt = String(t || '').toLowerCase();
          modal.classList.toggle('dp-preview-type--cutter', tt === 'cutter');
          modal.classList.toggle('dp-preview-type--mold', tt === 'mold');
          modal.dataset.dpPreviewType = tt;
        } catch (e) {}

        const title = (t === 'cutter')
          ? (item?.CutterNo || item?.CutterCode || item?.CutterID || '---')
          : (item?.MoldCode || item?.MoldID || '---');

        const typeLabelJa = (t === 'cutter') ? '抜型' : '金型';

        const headerHtml = `
          <div class="dp-preview-header">
            <div class="dp-preview-title">
              <div class="dp-preview-line1">プレビュー：${this.escapeHtml(typeLabelJa)} ${this.escapeHtml(title)}</div>
              <div class="dp-preview-line2">クイック確認（データは変更されません）</div>
            </div>
            <div class="dp-preview-actions">
              <button type="button" data-preview-action="open-full" class="dp-preview-btn primary">詳細を開く</button>
              <button type="button" data-preview-action="close" class="dp-preview-btn">閉じる</button>
            </div>
          </div>
        `;

        const bodyHtml = this.buildPreviewCenterHtml(item, t, p.centerMold);

        modal.innerHTML = headerHtml + `
          <div class="dp-preview-body" style="
            padding:12px;
            overflow:auto;
            -webkit-overflow-scrolling:touch;
            flex:1 1 auto;">
            ${bodyHtml}
          </div>
        `;

        // Hydrate thumb cho hero trong preview (CutterID / MoldID)
        try {
          const heroThumb = modal.querySelector('img[data-dp-preview-hero-thumb="1"]');
          if (heroThumb) heroThumb.dataset.dpHeroThumbState = "loading";
          if (heroThumb && window.DevicePhotoStore && typeof window.DevicePhotoStore.getThumbnailUrl === 'function') {
            const dtype = String(heroThumb.dataset.dpDeviceType || '').toLowerCase();
            const did = String(heroThumb.dataset.dpDeviceId || '').trim();

            // Placeholder trong lúc chờ load (tránh icon vỡ)
            heroThumb.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

            // Nếu store có ensureReady thì gọi
            try { if (typeof window.DevicePhotoStore.ensureReady === 'function') window.DevicePhotoStore.ensureReady(); } catch (e) {}

            if (dtype && did) {
              window.DevicePhotoStore.getThumbnailUrl(dtype, did)
                .then(url => {
                  if (url) {
                    heroThumb.src = url;
                    heroThumb.dataset.dpHeroThumbState = "ready";
                  } else {
                    heroThumb.dataset.dpHeroThumbState = "empty";
                  }
                })
                .catch(() => {
                  try { heroThumb.dataset.dpHeroThumbState = "empty"; } catch (e) {}
                });
            }
          }
        } catch (e) {}

        const bodyEl = modal.querySelector('.dp-preview-body');
        if (bodyEl && !bodyEl.dataset.dpPreviewSwipeBound) {
          bodyEl.dataset.dpPreviewSwipeBound = '1';
          this.bindPreviewSwipeToClose(bodyEl);
        }
      } catch (e) {
        // ignore
      }
    }

    // =====================================================================
    // TABS
    // =====================================================================
    switchTab(tabName) {
      const tabs = this.panel.querySelectorAll('.detail-tab');
      tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === tabName));

      const contents = this.panel.querySelectorAll('.detail-tab-content');
      contents.forEach(c => c.classList.toggle('active', c.dataset.tabContent === tabName));

      this.currentTab = tabName;

      try {
        if (this.panel) this.panel.dataset.dpTab = String(tabName || '');
      } catch (e) {}

      // v8.4.3-1: Preview dùng cho mọi tab (không tự đóng khi đổi tab)
      this.renderTabContent(tabName);
      // v8.3.4: nếu tab có module riêng thì bind tại đây
      this.bindTabModuleIfAny(tabName);

      // Nếu đang mở preview thì canh lại vị trí theo tab hiện tại
      if (this.isPreviewOpen()) {
        this.renderPreviewOverlay();
      }
    }


    refreshCurrentTab() {
      if (this.currentTab) {
        this.renderTabContent(this.currentTab);
        // v8.3.4: nếu tab có module riêng thì bind tại đây
        this.bindTabModuleIfAny(this.currentTab);
      }
    }

    renderTabContent(tabName) {
      const container = this.panel.querySelector(`[data-tab-content="${tabName}"]`);
      if (!container) return;

      let html = '';
      switch (tabName) {
        case 'info': html = this.renderInfoTab(); break;
        case 'related': html = this.renderRelatedTab(); break;
        case 'history': html = this.renderHistoryTab(); break;
        case 'teflon': html = this.renderTeflonTab(); break;
        case 'status': html = this.renderStatusTab(); break;
        case 'photos': html = this.renderPhotosTab(); break;
        case 'comments': html = this.renderCommentsTab(); break;
        
        case 'extended': {
          const mod = this.getTabModule('extended');
          if (mod && typeof mod.render === 'function') html = mod.render(this);
          else html = this.renderExtendedTab();
          break;
        }
        default: html = `<p class="no-data">Tab not implemented</p>`;
      }

      container.innerHTML = html;
      this.bindTabEvents(tabName, container);

      this.renderPreviewOverlay();

      if (tabName === 'info') {
        // gọi trễ 1 nhịp để chắc chắn HTML đã nằm trong DOM
        setTimeout(() => this.hydrateDesktopPhotoPreviewFromSupabase(), 0)
      }

      // Đã xoá initResizable do không dùng grid 3 cột resizeable nữa
    }

    bindTabEvents(tabName, container) {
      // Tab History: render module lịch sử theo 1 thiết bị
      if (tabName === 'history') {
        const host = container ? container.querySelector('.dp-device-history-host') : null;
        if (!host) return;

        // Nếu chưa load module
        if (!window.DeviceHistoryStatus || typeof window.DeviceHistoryStatus.render !== 'function') {
          host.innerHTML =
            `<div class="modal-section">
              <div class="section-header"><i class="fas fa-history"></i><span>Lịch sử trạng thái thiết bị</span></div>
              <p class="no-data">Chưa load file <b>device-history-status-v8.3.0.js</b></p>
            </div>`;
          return;
        }

        try {
          window.DeviceHistoryStatus.render(host, {
            item: this.currentItem,
            itemType: this.currentItemType, // 'mold' | 'cutter'
            data: this.data                // statuslogs/locationlog/shiplog/teflonlog/usercomments...
          });
        } catch (err) {
          host.innerHTML =
            `<div class="modal-section">
              <div class="section-header"><i class="fas fa-history"></i><span>Lịch sử trạng thái thiết bị</span></div>
              <p class="no-data">Lỗi render lịch sử. Mở Console để xem chi tiết.</p>
            </div>`;
          try { console.warn('DeviceHistoryStatus render error', err); } catch (e) {}
        }
      }

      if (tabName === 'photos') {
        this.bindPhotosTab(container);
      }
      if (tabName === 'related') this.bindRelatedTabcontainer(container);

    }


    // =====================================================================
    // UI HELPERS
    // =====================================================================

    isDesktopWide() {
      try { return window.innerWidth >= 769; } catch (e) { return false; }
    }

    escapeHtml(v) {
      if (v == null) return '';
      return String(v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    formatDate(iso) {
      if (!iso) return '';
      const t = Date.parse(iso);
      if (isNaN(t)) return this.escapeHtml(iso);
      const d = new Date(t);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${y}-${m}-${day} ${hh}:${mm}`;
    }

    formatLW(a, b) {
      const x = (a != null && String(a).trim()) ? String(a).trim() : '';
      const y = (b != null && String(b).trim()) ? String(b).trim() : '';
      if (!x && !y) return '';
      if (!y) return x;
      return `${x} x ${y}`;
    }

    formatLWH(l, w, h) {
      const a = (l != null && String(l).trim()) ? String(l).trim() : '';
      const b = (w != null && String(w).trim()) ? String(w).trim() : '';
      const c = (h != null && String(h).trim()) ? String(h).trim() : '';
      if (!a && !b && !c) return '';
      if (a && b && c) return `${a} x ${b} x ${c}`;
      if (a && b) return `${a} x ${b}`;
      return [a, b, c].filter(Boolean).join(' x ');
    }

    pick(obj, keys) {
      try {
        if (!obj) return null;
        for (const k of keys) {
          if (!k) continue;
          if (!(k in obj)) continue;
          const v = obj[k];
          if (v === null || v === undefined) continue;
          const s = String(v).trim();
          if (s !== '') return v;
        }
      } catch (e) {}
      return null;
    }

    safeText(v, fallback = '-') {
      const s = (v == null) ? '' : String(v).trim();
      return s ? this.escapeHtml(s) : fallback;
    }

    // ===== Rack/Layer badge (v8.3.2-7) =====
    toCircledNumber(n) {
      const x = Number(n);
      if (!Number.isFinite(x)) return '';
      const i = Math.floor(x);
      if (i >= 1 && i <= 20) return String.fromCharCode(0x245F + i);
      return String(i);
    }

    extractRackLayerFromText(s) {
      const t = (s == null) ? '' : String(s);
      if (!t.trim()) return null;
      const m = t.match(/(\d{1,3})\s*[-–—\/\\]\s*(\d{1,2})/);
      if (!m) return null;
      const rack = String(m[1]).replace(/^0+/, '') || m[1];
      const layer = String(m[2]).replace(/^0+/, '') || m[2];
      return { rack, layer };
    }

    getRackLayerText(item) {
      try {
        if (!item) return '';
        const candidates = [
          item.displayRackLocation,
          item.displayLocation,
          item.location,
          item.RackLocation,
          item.RackLayer,
          item.RackLayerID,
          item.RackLayerId,
          item.RackNo,
          item.Rack
        ];
        for (const c of candidates) {
          const x = this.extractRackLayerFromText(c);
          if (x) return this.toCircledNumber(x.rack) + '-' + String(x.layer);
        }
      } catch (e) {}
      return '';
    }


    renderRackLayerBadgeText(text) {
      const t = String(text || '').trim();
      if (!t) return '';
      return `<span class="dp-badge-racklayer">${this.escapeHtml(t)}</span>`;
    }


    renderRackLayerBadge(item) {
      const t = this.getRackLayerText(item);
      return t ? this.renderRackLayerBadgeText(t) : '';
    }

    renderInfoGrid(fields, extraClass = '') {
      if (!fields || !fields.length) return '';
      const cls = String(extraClass || '').trim();
      const isModern = cls.includes('dp-info-grid-modern');
      
      let html = `<div class="${isModern ? '' : 'info-grid-2col '}${cls}">`;
      for (const f of fields) {
        if (!f) continue;
        const itemCls = isModern
            ? (f.full ? 'dp-item-stacked info-item full-width' : 'dp-item-stacked info-item')
            : (f.full ? 'info-item full-width' : 'info-item');
            
        const labelRaw = (f.label == null) ? '' : String(f.label);
        const labelHtml = this.renderLabelHtml(labelRaw);

        let valueHtml = '';
        if (f.rawValue != null) {
          valueHtml = String(f.rawValue);
        } else {
          const v = (f.value == null) ? '' : String(f.value).trim();
          valueHtml = v ? this.escapeHtml(v) : (f.fallback != null ? this.escapeHtml(String(f.fallback)) : '-');
        }

        html += `<div class="${itemCls}"><div class="info-label">${labelHtml}</div><div class="info-value">${valueHtml}</div></div>`;
      }
      html += '</div>';
      return html;
    }


    // Bilingual label helper
    // Return format: "JP|||VI" (JP first). renderInfoGrid() will turn it into 2 lines.
    biLabel(jp, vi) {
      const a = (jp == null) ? '' : String(jp).trim();
      const b = (vi == null) ? '' : String(vi).trim();
      if (!a && !b) return '-';
      if (!b) return a;
      if (!a) return b;
      return `${a}|||${b}`;
    }

    // Render label HTML safely (supports bilingual "JP|||VI"; backward compatible with "JP / VI")
    renderLabelHtml(labelRaw) {
      try {
        const raw0 = (labelRaw == null) ? '' : String(labelRaw);
        const raw = raw0.trim();
        if (!raw) return '-';

        if (raw.includes('|||')) {
          const parts = raw.split('|||');
          const jp = String(parts[0] || '').trim();
          const vi = String(parts.slice(1).join('|||') || '').trim();
          if (jp && vi) {
            // Updated to JP (VI) format as requested
            return `<span class="dp-label-ja">${this.escapeHtml(jp)}</span> <span class="dp-label-vi">${this.escapeHtml(vi)}</span>`;
          }
          return this.escapeHtml(jp || vi || raw);
        }

        if (raw.includes(' / ')) {
          const parts = raw.split(' / ');
          if (parts.length === 2) {
            const jp = String(parts[0] || '').trim();
            const vi = String(parts[1] || '').trim();
            if (jp && vi) {
              return `<span class="dp-label-ja">${this.escapeHtml(jp)}</span> <span class="dp-label-vi">${this.escapeHtml(vi)}</span>`;
            }
          }
        }

        return this.escapeHtml(raw);
      } catch (e) {
        return this.escapeHtml(String(labelRaw || ''));
      }
    }


    // Badge cho liên kết (Direct/Shared) khi xem DAO CẮT → danh sách KHUÔN liên quan
    // - direct: khuôn có liên kết trực tiếp với MoldDesignID gốc của dao cắt (cutters.csv)
    // - shared: khuôn dùng chung qua moldcutter.csv
    renderLinkKindBadge(kind) {
      const k = String(kind || '').toLowerCase().trim();
      if (!k) return '';

      const isDirect = (k === 'direct');
      const text = isDirect ? '直' : '共';
      const title = isDirect ? '直接リンク / Direct' : '共有 / Shared';
      const cls = isDirect ? 'dp-link-badge dp-link-badge--direct' : 'dp-link-badge dp-link-badge--shared';
      return `<span class="${cls}" title="${this.escapeHtml(title)}">${this.escapeHtml(text)}</span>`;
    }


    getDirectDesignIdsForCutter(cutter) {
      try {
        const v =
          cutter?.MoldDesignID ??
          cutter?.MoldDesignId ??
          cutter?.molddesignid ??
          cutter?.DesignID ??
          cutter?.DesignId ??
          '';
        const list = this.parseIdList(v).map(x => this.normId(x)).filter(Boolean);
        return Array.from(new Set(list));
      } catch (e) {
        return [];
      }
    }


    formatCutterCutSize(cutter) {
      const cutL = String(cutter?.CutlineLength || '').trim();
      const cutW = String(cutter?.CutlineWidth || '').trim();
      const r = String(cutter?.CutterCorner || '').trim();
      const c = String(cutter?.CutterChamfer || '').trim();
      
      let base = '-';
      if (cutL && cutW) {
        base = `${cutL}×${cutW}`;
      } else if (cutL || cutW) {
        base = [cutL, cutW].filter(Boolean).join('×');
      }
      
      let tail = '';
      if (r) tail += `-${r}R`;
      if (c) tail += `-${c}C`;
      
      return base !== '-' ? base + tail : (tail ? tail.replace(/^-/, '') : '-');
    }


    getMoldSharedListTextForCutter(cutter) {
      const molds = this.getSharedMoldsForCutter ? this.getSharedMoldsForCutter(cutter) : [];
      if (!molds || !molds.length) return '-';
      const parts = molds
        .map(m => (m?.MoldCode || m?.MoldID || ''))
        .map(s => String(s).trim())
        .filter(Boolean);
      return parts.length ? parts.join(', ') : '-';
    }
    getSharedMoldsForCutter(cutter) {
      try {
        if (!cutter) return [];

        const molds = Array.isArray(this.data?.molds) ? this.data.molds : [];
        const designs = Array.isArray(this.data?.molddesign) ? this.data.molddesign : [];
        const links = Array.isArray(this.data?.moldcutter) ? this.data.moldcutter : [];

        const directDesignIds = new Set(this.getDirectDesignIdsForCutter(cutter).map(x => this.normId(x)).filter(Boolean));

        // 1) designIds từ cutter + moldcutter
        const designIds = new Set();
        for (const d of directDesignIds) designIds.add(d);

        const cutterId = this.normId(cutter.CutterID || cutter.ID);
        const cutterNo = this.normId(cutter.CutterNo || cutter.CutterCode);

        for (const r of links) {
          const rid = this.normId(r.CutterID || r.CutterId || r.CUTTERID);
          const rno = this.normId(r.CutterNo || r.CutterCode);
          const match = (cutterId && rid === cutterId) || (cutterNo && rno === cutterNo);
          if (!match) continue;

          for (const v of this.parseIdList(r.MoldDesignID || r.MoldDesignId || r.DESIGNID || r.DesignID)) {
            const did = this.normId(v);
            if (did) designIds.add(did);
          }
        }

        const didList = Array.from(designIds).filter(Boolean);
        if (!didList.length) return [];

        // 2) collect molds by designId (molds.csv + molddesign.csv)
        const agg = new Map(); // moldKey -> { mold, designIds:Set }

        const pushMold = (m, did) => {
          if (!m) return;
          const key = this.normId(m.MoldID) || this.normId(m.MoldCode) || '';
          if (!key) return;
          let obj = agg.get(key);
          if (!obj) {
            obj = { mold: m, designIds: new Set() };
            agg.set(key, obj);
          }
          if (did) obj.designIds.add(this.normId(did));
        };

        // A) scan molds.csv by their design ids
        for (const m of molds) {
          const mDesignIds = []
            .concat(this.parseIdList(m.MoldDesignID))
            .concat(this.parseIdList(m.MoldDesignId))
            .concat(this.parseIdList(m.molddesignid))
            .concat(this.parseIdList(m.DesignID))
            .map(x => this.normId(x))
            .filter(Boolean);

          for (const did of mDesignIds) {
            if (designIds.has(did)) pushMold(m, did);
          }
        }

        // B) molddesign.csv: design -> mold list
        for (const d of designs) {
          const did = this.normId(d.MoldDesignID || d.DesignID || d.molddesignid);
          if (!did || !designIds.has(did)) continue;

          const moldIds = []
            .concat(this.parseIdList(d.MoldID))
            .concat(this.parseIdList(d.MoldIDs))
            .concat(this.parseIdList(d.MoldIdList))
            .concat(this.parseIdList(d.MoldList))
            .map(x => this.normId(x))
            .filter(Boolean);

          for (const mid of moldIds) {
            const found = molds.find(m => this.normId(m.MoldID) === mid || this.normId(m.MoldCode) === mid);
            if (found) pushMold(found, did);
          }
        }

        // 3) output with direct/shared badge
        const out = [];
        for (const obj of agg.values()) {
          const designList = Array.from(obj.designIds).filter(Boolean);
          const kind = designList.some(x => directDesignIds.has(this.normId(x))) ? 'direct' : 'shared';
          const clone = { ...obj.mold };
          clone.__dpLinkKind = kind;
          clone.__dpLinkDesignIds = designList;
          clone.dpLinkKind = kind;
          clone.dpLinkDesignIds = designList;
          out.push(clone);
        }

        out.sort((a, b) => {
          const ka = String(a.__dpLinkKind || '').toLowerCase() === 'direct' ? 0 : 1;
          const kb = String(b.__dpLinkKind || '').toLowerCase() === 'direct' ? 0 : 1;
          if (ka !== kb) return ka - kb;
          const sa = String(a.MoldCode || a.MoldID || '').trim();
          const sb = String(b.MoldCode || b.MoldID || '').trim();
          return sa.localeCompare(sb);
        });

        return out;
      } catch (e) {
        return [];
      }
    }



    parseIdList(v){
        if(v == null) return [];
        const s = String(v).trim();
        if(!s) return [];
        // tách theo: dấu phẩy, chấm phẩy, khoảng trắng, xuống dòng, dấu | /
        return s
            .split(/[\s,;|/]+/g)
            .map(x => String(x || '').trim())
            .filter(Boolean);
        }

        normId(v){
        const s = (v == null) ? '' : String(v).trim();
        return s;
        }
    resolveFullItem(partialItem, type) {
      try {
        if (partialItem == null) return partialItem;

        // Nếu input là string (hay number) thì coi như mã, convert thành object nhỏ để tìm trong data.
        if (typeof partialItem !== 'object') {
          const s = String(partialItem || '').trim();
          if (!s) return partialItem;
          const t0 = String(type || '').toLowerCase();
          if (t0 === 'cutter') {
            partialItem = { CutterNo: s, CutterCode: s, CutterID: s, ID: s };
          } else {
            partialItem = { MoldCode: s, MoldID: s, ID: s };
          }
        }

        const t = String(type || '').toLowerCase();

        if (t === 'mold') {
          const id = this.normId(partialItem.MoldID || partialItem.ID || partialItem.id);
          const code = this.normId(partialItem.MoldCode || partialItem.code || partialItem.Code);
          const molds = Array.isArray(this.data?.molds) ? this.data.molds : [];
          const found = molds.find(m =>
            (id && this.normId(m?.MoldID || m?.ID) === id) ||
            (code && this.normId(m?.MoldCode) === code) ||
            (code && this.normId(m?.MoldID) === code)
          );
          return found || partialItem;
        }

        // Cutter
        const id = this.normId(partialItem.CutterID || partialItem.ID || partialItem.id);
        const no = this.normId(partialItem.CutterNo || partialItem.CutterCode || partialItem.code || partialItem.Code);
        const cutters = Array.isArray(this.data?.cutters) ? this.data.cutters : [];
        const found = cutters.find(c =>
          (id && this.normId(c?.CutterID || c?.ID) === id) ||
          (no && this.normId(c?.CutterNo || c?.CutterCode) === no)
        );
        return found || partialItem;
      } catch (e) {
        return partialItem;
      }
    }

        getDesignIdsForMold(mold){
        const out = [];
        if(!mold) return out;

        // 1) từ mold row
        out.push(...this.parseIdList(mold.MoldDesignID));
        out.push(...this.parseIdList(mold.MoldDesignId));
        out.push(...this.parseIdList(mold.molddesignid));
        out.push(...this.parseIdList(mold.DesignID));

        // 2) từ molddesign (nếu file có cột MoldID / MoldIDs)
        try{
            const moldId = this.normId(mold.MoldID || mold.MoldCode);
            const designs = Array.isArray(this.data?.molddesign) ? this.data.molddesign : [];
            for(const d of designs){
            const did = this.normId(d.MoldDesignID || d.DesignID || d.molddesignid);
            if(!did) continue;

            const dMoldId = this.normId(d.MoldID || d.MoldId || d.MOLDID);
            const dMoldIds = []
                .concat(this.parseIdList(d.MoldIDs))
                .concat(this.parseIdList(d.MoldIdList))
                .concat(this.parseIdList(d.MoldList));

            if(moldId && (dMoldId === moldId || dMoldIds.includes(moldId))){
                out.push(did);
            }
            }
        }catch(e){ /* ignore */ }

        return Array.from(new Set(out.map(x => this.normId(x)).filter(Boolean)));
        }
    getRelatedCuttersForMold(mold) {
      try {
        if (!mold) return [];

        const cutters = Array.isArray(this.data?.cutters) ? this.data.cutters : [];
        const links = Array.isArray(this.data?.moldcutter) ? this.data.moldcutter : [];

        // direct ids từ chính mold row
        const directSet = new Set();
        const directIds = []
          .concat(this.parseIdList(mold.MoldDesignID || mold.MoldDesignId || mold.molddesignid || mold.DesignID))
          .map(x => this.normId(x))
          .filter(Boolean);
        for (const d of directIds) directSet.add(d);

        // all design ids (mold row + molddesign reverse)
        const designIds = new Set(this.getDesignIdsForMold(mold).map(x => this.normId(x)).filter(Boolean));
        if (!designIds.size) return [];

        const agg = new Map(); // cutterKey -> { cutter, designIds:Set }

        const push = (c, did) => {
          if (!c) return;
          const key = this.normId(c.CutterID || c.ID) || this.normId(c.CutterNo || c.CutterCode) || '';
          if (!key) return;
          let obj = agg.get(key);
          if (!obj) {
            obj = { cutter: c, designIds: new Set() };
            agg.set(key, obj);
          }
          if (did) obj.designIds.add(this.normId(did));
        };

        // A) cutters.csv
        for (const c of cutters) {
          const cDesignIds = []
            .concat(this.parseIdList(c.MoldDesignID))
            .concat(this.parseIdList(c.MoldDesignId))
            .concat(this.parseIdList(c.molddesignid))
            .concat(this.parseIdList(c.DesignID))
            .map(x => this.normId(x))
            .filter(Boolean);

          for (const did of cDesignIds) {
            if (designIds.has(did)) push(c, did);
          }
        }

        // B) moldcutter.csv
        for (const r of links) {
          const did = this.normId(r.MoldDesignID || r.MoldDesignId || r.DESIGNID || r.DesignID);
          if (!did || !designIds.has(did)) continue;
          const cid = this.normId(r.CutterID || r.CutterId || r.CUTTERID);
          if (!cid) continue;
          const found = cutters.find(c => this.normId(c.CutterID || c.ID) === cid);
          if (found) push(found, did);
        }

        const out = [];
        for (const obj of agg.values()) {
          const designList = Array.from(obj.designIds).filter(Boolean);
          const kind = designList.some(x => directSet.has(this.normId(x))) ? 'direct' : 'shared';
          const clone = { ...obj.cutter };
          clone.__dpLinkKind = kind;
          clone.__dpLinkDesignIds = designList;
          clone.dpLinkKind = kind;
          clone.dpLinkDesignIds = designList;
          out.push(clone);
        }

        out.sort((a, b) => {
          const ka = String(a.__dpLinkKind || '').toLowerCase() === 'direct' ? 0 : 1;
          const kb = String(b.__dpLinkKind || '').toLowerCase() === 'direct' ? 0 : 1;
          if (ka !== kb) return ka - kb;
          const sa = String(a.CutterNo || a.CutterCode || a.CutterID || a.ID || '').trim();
          const sb = String(b.CutterNo || b.CutterCode || b.CutterID || b.ID || '').trim();
          return sa.localeCompare(sb);
        });

        return out;
      } catch (e) {
        return [];
      }
    }



        ensureRelatedListsForOpen(){
        try{
            if(!this.currentItem) return;

            if(this.currentItemType === 'mold'){
            const mold = this.currentItem;
            mold.relatedCutters = this.getRelatedCuttersForMold(mold);
            }else{
            const cutter = this.currentItem;

            // dao cắt: luôn lấy danh sách khuôn liên quan theo moldcutter.csv
            cutter.relatedMolds = this.getSharedMoldsForCutter(cutter) || [];

            // đồng bộ centerMold: ưu tiên mold direct
            if (cutter.relatedMolds && cutter.relatedMolds.length) {
              const direct = cutter.relatedMolds.find(m => String(m.__dpLinkKind || '').toLowerCase() === 'direct');
              this.centerMold = direct || cutter.relatedMolds[0];
              this.centerMoldReason = direct ? 'ensureRelated:direct' : 'ensureRelated';
            } else if (this.centerMold) {
              // nếu vẫn rỗng, fallback theo centerMold (để luôn có ít nhất 1 khuôn tham chiếu)
              cutter.relatedMolds = [this.centerMold];
            }
            }
        }catch(e){
            /* ignore */
        }
        }


    notify(message, kind = 'info') {
      const msg = String(message || '').trim();
      if (!msg) return;

      try {
        if (window.NotificationModule) {
          if (typeof window.NotificationModule.showToast === 'function') {
            window.NotificationModule.showToast(msg, kind);
            return;
          }
          if (typeof window.NotificationModule.show === 'function') {
            window.NotificationModule.show(msg, kind);
            return;
          }
        }
      } catch (e) { /* ignore */ }

      try {
        if (window.App && typeof window.App.showToast === 'function') {
          window.App.showToast(msg, kind);
          return;
        }
      } catch (e) { /* ignore */ }

      console.log(`[DetailPanel ${VERSION}] ${kind}:`, msg);
    }

    // =====================================================================
    // QUICK ACTIONS + JUMPS
    // =====================================================================

    handleQuickAction(action) {
      if (!this.currentItem) return;

      // Giữ behavior cũ
      // [EDIT v8.5.12-4]: Không tự động chuyển tab khi bấm upload ảnh
      // if (action === 'photo') this.switchTab('photos');

      // Mở Form Quick Update theo MODE
      if (typeof action === 'string' && action.startsWith('qu-')) {
        try {
          if (window.QuickUpdateModule && typeof window.QuickUpdateModule.openModal === 'function') {
            const mode = action.replace('qu-', '').toUpperCase();
            
            // Xử lý mode tên khác biệt (qu-weight -> WEIGHT, qu-design -> DESIGN_INFO, qu-lifecycle -> LIFECYCLE)
            const mapKeys = {
              'WEIGHT': 'WEIGHT',
              'DESIGN': 'DESIGN_INFO',
              'LIFECYCLE': 'LIFECYCLE'
            };

            window.QuickUpdateModule.openModal(mapKeys[mode] || mode, this.currentItem);
            return;
          }
        } catch (e) {
          console.error("QuickUpdateModule failed to open", e);
        }
      }

      // NEW: bấm 入出庫 (inout) thì mở thẳng giao diện CheckInOut
      if (String(action).toLowerCase().trim() === 'inout') {
        try {
          if (window.CheckInOut && typeof window.CheckInOut.openModal === 'function') {
            window.CheckInOut.openModal('check-in', this.currentItem);
            return;
          }
        } catch (e) {}
      }

      // Action Teflon Processing
      if (String(action).toLowerCase().trim() === 'teflon') {
        try {
          if (window.TeflonProcessing && typeof window.TeflonProcessing.openModal === 'function') {
            window.TeflonProcessing.openModal(this.currentItem);
            return;
          } else {
            this.notify('Module TeflonProcessing chưa sẵn sàng.', 'error');
            return;
          }
        } catch (e) {}
      }

      // Action Export QR (QR button inside Detail Panel)
      if (String(action).toLowerCase().trim() === 'qr') {
        try {
          if (window.ExportQR && typeof window.ExportQR.generate === 'function') {
            window.ExportQR.generate(this.currentItem);
            return;
          } else {
            this.notify('Module Xuất QR chưa được nạp.', 'error');
            return;
          }
        } catch (e) {
          console.error("QR Export Trigger error", e);
        }
      }

      // Fallback: vẫn bắn event như cũ để các action khác hoạt động
      try {
        document.dispatchEvent(new CustomEvent('quick-action', {
          detail: { action, item: this.currentItem, itemType: this.currentItemType }
        }));
      } catch (err) {
        console.warn('DetailPanel quick-action dispatch failed', err);
      }
    }


    // [ĐÃ XOÁ LOGIC RESIZABLE 3 CỘT]


    openFutureModule(moduleKey) {
      const mold = this.centerMold || (this.currentItemType === 'mold' ? this.currentItem : null);
      const moldId = mold ? (mold.MoldID || mold.MoldCode || '') : '';

      this.notify(`Module "${moduleKey}" sẽ phát triển sau (đã tạo event tích hợp).`, 'info');

      try {
        document.dispatchEvent(new CustomEvent('module:open', {
          detail: {
            module: moduleKey,
            moldId,
            mold,
            from: `DetailPanel-${VERSION}`
          }
        }));
      } catch (err) {
        console.warn(`[DetailPanel ${VERSION}] module:open dispatch failed`, err);
      }
    }

    handleJump(key) {
      if (!key) return;

      if (key === 'history') { this.switchTab('history'); return; }
      if (key === 'teflon') { this.switchTab('teflon'); return; }
      if (key === 'extended') { this.switchTab('extended'); return; }
      if (key === 'transfer') { this.switchTab('extended'); this.scrollToAnchor('dp-ext-transfer'); return; }
      if (key === 'storage') { this.switchTab('extended'); this.scrollToAnchor('dp-ext-storage'); return; }
      if (key === 'design') { this.switchTab('extended'); this.scrollToAnchor('dp-ext-design'); return; }
      if (key === 'customers') { this.switchTab('extended'); this.scrollToAnchor('dp-ext-customers'); return; }
      if (key === 'product') { this.switchTab('extended'); this.scrollToAnchor('dp-ext-product'); return; }
    }

    scrollToAnchor(id) {
      if (!id) return;
      setTimeout(() => {
        const el = this.panel.querySelector(`#${id}`);
        if (el && el.scrollIntoView) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 50);
    }

    // =====================================================================
    // CENTER MOLD (for cutter)
    // =====================================================================

    findCenterMoldFromCutter(cutter) {
      try {
        if (!cutter) return null;

        // 1) Nếu đã có relatedMolds (enriched) thì dùng luôn
        if (Array.isArray(cutter.relatedMolds) && cutter.relatedMolds.length) {
          this.centerMoldReason = 'relatedMolds';
          return cutter.relatedMolds[0];
        }

        // 2) Tính danh sách khuôn liên quan theo moldcutter.csv
        const shared = this.getSharedMoldsForCutter(cutter);
        if (shared && shared.length) {
          // ưu tiên khuôn direct
          const direct = shared.find(m => String(m.__dpLinkKind || '').toLowerCase() === 'direct');
          this.centerMoldReason = direct ? 'sharedMolds:direct' : 'sharedMolds';
          return direct || shared[0];
        }

        this.centerMoldReason = 'none';
        return null;
      } catch (e) {
        this.centerMoldReason = 'error';
        return null;
      }
    }


    // =====================================================================
    // TAB 1: INFO
    // =====================================================================

    renderInfoTab() {
      if (!this.currentItem) return `<p class="no-data">No item selected</p>`;
      
      if (this.isDesktopWide()) {
        if (this.currentItemType === 'mold' && this.centerMold) {
          return this.renderInfoTabDesktopMoldCentric();
        }
        if (this.currentItemType === 'cutter') {
          return this.renderInfoTabDesktopCutterCentric();
        }
      }


      let html = '';
      html += this.renderLocationSection(this.currentItem, this.currentItemType);
      html += this.renderOverviewSection(this.currentItem, this.currentItemType);
      html += this.renderStatusNotesSection(this.currentItem, this.currentItemType);
      html += this.renderAdditionalDataSection(this.currentItem, this.currentItemType);

      if (this.currentItemType === 'cutter' && this.centerMold) {
        html += `
          <div class="modal-section">
            <div class="section-header">
              <i class="fas fa-cube"></i>
              <span>Khuôn trung tâm / 中心金型</span>
            </div>
            <div class="info-message">
              Dao cắt này có thể đi với khuôn: <b>${this.safeText(this.centerMold.MoldCode || this.centerMold.MoldID)}</b>
              <button class="btn-action" style="margin-left:8px" type="button" data-jump="extended">Xem tổng quan</button>
            </div>
          </div>
        `;
      }

      return html;
    }

    renderInfoTabDesktopMoldCentric() {
      const mold = this.centerMold || (this.currentItemType === 'mold' ? this.currentItem : null);
      if (!mold) return `<p class="no-data">No mold selected</p>`;

      return `
        <div class="dp-dash2-layout">
           <!-- Hero removed -->
           <div class="dp-dash2-masonry">
               <!-- Cột 1: Ảnh + Liên kết -->
               <div class="dp-d2-col">
                   <div class="dp-d2-card pt-0">
                      <div class="dp-d2-card-body">
                         ${this.renderDesktopPhotoPreview(mold)}
                      </div>
                   </div>
                   <div class="dp-d2-card">
                      <div class="dp-d2-card-head"><i class="fas fa-link"></i> 関連デバイス (Thiết bị liên kết)</div>
                      <div class="dp-d2-card-body">
                         ${this.renderDesktopMiniRelated(mold, 'mold')}
                      </div>
                   </div>
               </div>

               <!-- Cột 2: Lưu trữ + Tổng quan -->
               <div class="dp-d2-col">
                   <div class="dp-d2-card dp-card-storage-mold">
                      <div class="dp-d2-card-head"><i class="fas fa-map-marker-alt"></i> 保管・ステータス (Lưu trữ & Trạng thái)</div>
                      <div class="dp-d2-card-body">
                         ${this.renderLocationSection(mold, 'mold')}
                         ${this.renderStatusNotesSection(mold, 'mold')}
                      </div>
                   </div>
                   <div class="dp-d2-card">
                      <div class="dp-d2-card-head"><i class="fas fa-clipboard-list"></i> 概要 (Tổng quan)</div>
                      <div class="dp-d2-card-body">
                         ${this.renderOverviewSection(mold, 'mold')}
                      </div>
                   </div>
               </div>

               <!-- Cột 3: Thao tác + Lịch sử -->
               <div class="dp-d2-col">
                   <div class="dp-d2-card">
                      <div class="dp-d2-card-head"><i class="fas fa-bolt"></i> 操作・リンク (Thao tác & Liên kết)</div>
                      <div class="dp-d2-card-body">
                         ${this.renderDesktopQuickActions(mold, 'mold')}
                      </div>
                   </div>
                   <div class="dp-d2-card">
                      <div class="dp-d2-card-head"><i class="fas fa-history"></i> 履歴・レポート (Lịch sử & Báo cáo)</div>
                      <div class="dp-d2-card-body" style="display:flex; flex-direction:column; gap: 12px;">
                         ${this.renderDesktopQuickQueries(mold)}
                         ${this.renderDesktopMiniSnapshots(mold)}
                         <div>
                           <div style="font-size:11px; font-weight:700; color:#475569; margin-bottom:8px; text-transform:uppercase;">クイックアクセス (Truy cập nhanh)</div>
                           <div class="dp-actions-grid">
                             <button class="dp-action-btn" type="button" data-jump="design"><i class="fas fa-drafting-compass" style="color:#3b82f6;"></i><div style="display:flex;flex-direction:column;min-width:0;overflow:hidden"><span class="dp-action-label-ja">Design</span><span class="sub dp-action-label-vi">Thiết kế</span></div></button>
                             <button class="dp-action-btn" type="button" data-jump="customers"><i class="fas fa-building" style="color:#8b5cf6;"></i><div style="display:flex;flex-direction:column;min-width:0;overflow:hidden"><span class="dp-action-label-ja">Customers</span><span class="sub dp-action-label-vi">Khách hàng</span></div></button>
                             <button class="dp-action-btn" type="button" data-jump="product"><i class="fas fa-box" style="color:#f59e0b;"></i><div style="display:flex;flex-direction:column;min-width:0;overflow:hidden"><span class="dp-action-label-ja">Product</span><span class="sub dp-action-label-vi">Job</span></div></button>
                             <button class="dp-action-btn" type="button" data-jump="storage"><i class="fas fa-warehouse" style="color:#10b981;"></i><div style="display:flex;flex-direction:column;min-width:0;overflow:hidden"><span class="dp-action-label-ja">Storage</span><span class="sub dp-action-label-vi">Vị trí</span></div></button>
                             <button class="dp-action-btn" type="button" data-jump="transfer"><i class="fas fa-truck" style="color:#6366f1;"></i><div style="display:flex;flex-direction:column;min-width:0;overflow:hidden"><span class="dp-action-label-ja">Transfer</span><span class="sub dp-action-label-vi">Vận chuyển</span></div></button>
                             <button class="dp-action-btn" type="button" data-jump="extended"><i class="fas fa-arrow-right" style="color:#475569;"></i><div style="display:flex;flex-direction:column;min-width:0;overflow:hidden"><span class="dp-action-label-ja">Open</span><span class="sub dp-action-label-vi">Mở rộng</span></div></button>
                           </div>
                         </div>
                      </div>
                   </div>
               </div>
           </div>
        </div>
      `;
    }

    renderInfoTabDesktopCutterCentric() {
      const cutter = this.currentItem;
      return `
        <div class="dp-dash2-layout">
           <!-- Hero removed -->
           <div class="dp-dash2-masonry">
               <!-- Cột 1: Ảnh + Liên kết -->
               <div class="dp-d2-col">
                   <div class="dp-d2-card pt-0">
                      <div class="dp-d2-card-body">
                         ${this.renderDesktopPhotoPreview(cutter)}
                      </div>
                   </div>
                   <div class="dp-d2-card">
                      <div class="dp-d2-card-head"><i class="fas fa-link"></i> 関連デバイス (Thiết bị liên kết)</div>
                      <div class="dp-d2-card-body">
                         ${this.renderDesktopMiniRelated(cutter, 'cutter')}
                      </div>
                   </div>
               </div>

               <!-- Cột 2: Lưu trữ + Tổng quan -->
               <div class="dp-d2-col">
                   <div class="dp-d2-card dp-card-storage-cutter">
                      <div class="dp-d2-card-head"><i class="fas fa-map-marker-alt"></i> 保管・ステータス (Lưu trữ & Trạng thái)</div>
                      <div class="dp-d2-card-body">
                         ${this.renderLocationSection(cutter, 'cutter')}
                         ${this.renderStatusNotesSection(cutter, 'cutter')}
                      </div>
                   </div>
                   <div class="dp-d2-card">
                      <div class="dp-d2-card-head"><i class="fas fa-clipboard-list"></i> 概要 (Tổng quan)</div>
                      <div class="dp-d2-card-body">
                         ${this.renderOverviewSection(cutter, 'cutter')}
                      </div>
                   </div>
               </div>

               <!-- Cột 3: Thao tác + Lịch sử -->
               <div class="dp-d2-col">
                   <div class="dp-d2-card">
                      <div class="dp-d2-card-head"><i class="fas fa-bolt"></i> 操作・リンク (Thao tác & Liên kết)</div>
                      <div class="dp-d2-card-body">
                         ${this.renderDesktopQuickActions(cutter, 'cutter')}
                      </div>
                   </div>
                   <div class="dp-d2-card">
                      <div class="dp-d2-card-head"><i class="fas fa-history"></i> 履歴・レポート (Lịch sử & Báo cáo)</div>
                      <div class="dp-d2-card-body" style="display:flex; flex-direction:column; gap: 12px;">
                         ${this.renderDesktopMiniSnapshotsCutter(cutter)}
                         ${this.centerMold ? `
                           <div>
                             <div style="font-size:11px; font-weight:700; color:#475569; margin-bottom:8px; text-transform:uppercase;">中心金型 (Khuôn trung tâm)</div>
                             <div style="font-size:13px; font-weight:600; color:#0f172a;">${this.safeText(this.centerMold.MoldCode || this.centerMold.MoldID)}</div>
                             <button class="btn-action" style="margin-top:8px; width:100%" type="button" data-jump="extended">Mở rộng khuôn</button>
                           </div>
                         ` : ''}
                      </div>
                   </div>
               </div>
           </div>
        </div>
      `;
    }

    // Xoá logic sidebar mold cũ


    renderDesktopHero(item, type) {
      const e = (v) => this.escapeHtml(v);
      const isMold = String(type || '').toLowerCase() === 'mold';

      // Hero của TRANG CHI TIẾT
      const line1 = isMold ? (item?.MoldCode || item?.MoldID || '-') : (item?.CutterNo || item?.CutterCode || item?.CutterDesignCode || item?.CutterID || '-');
      const id = isMold ? (item?.MoldID || '-') : (item?.CutterID || item?.ID || '-');
      const name = isMold ? (item?.MoldName || item?.Name || '') : (item?.CutterName || item?.CutterDesignName || item?.Name || '');

      const locRaw = item?.displayRackLocation || item?.displayLocation || item?.location || item?.rackNo || item?.RackLayerID || '-';
      const rackLayer = this.getRackLayerText(item);
      const locationText = (rackLayer ? (String(rackLayer) + ' ' + String(locRaw || '').trim()).trim() : String(locRaw || '-').trim()) || '-';

      const companyInfo = this.getStorageCompanyInfo ? this.getStorageCompanyInfo(item) : null;
      const statusInfo = this.getStorageStatus ? this.getStorageStatus(item) : null;

      const companyText = (companyInfo && companyInfo.nameShort) ? String(companyInfo.nameShort) : '-';
      const statusText = (statusInfo && (statusInfo.textShort || statusInfo.text)) ? String(statusInfo.textShort || statusInfo.text) : '---';
      const confirmText = (statusInfo && statusInfo.lastConfirmDateText) ? String(statusInfo.lastConfirmDateText) : '-';

      const returning = isMold ? (item?.MoldReturning || item?.Returning || '') : '';
      const disposing = isMold ? (item?.MoldDisposing || item?.Disposing || '') : '';

      const heroClass = isMold ? 'dp-hero dp-hero--mold' : 'dp-hero dp-hero--cutter';

      const labelLocation = this.renderLabelHtml(this.biLabel('場所', 'Vị trí'));
      const labelCompany = this.renderLabelHtml(this.biLabel('保管会社', 'Công ty lưu trữ'));
      const labelStatus = this.renderLabelHtml(this.biLabel('状態', 'Trạng thái'));
      const labelConfirm = this.renderLabelHtml(this.biLabel('確認', 'Xác nhận'));
      const labelReturn = this.renderLabelHtml(this.biLabel('返却', 'Trả'));
      const labelDispose = this.renderLabelHtml(this.biLabel('廃棄', 'Hủy'));

      return (
        '<div class="' + heroClass + '">' +
          '<div class="dp-hero-grid">' +
            '<div class="dp-hero-col dp-hero-col-1">' +
              '<div class="dp-hero-line1">' + e(line1) + '</div>' +
              '<div class="dp-hero-line2">' +
                '<span class="dp-hero-id">' + e(id) + '</span>' +
                (name ? '<span class="dp-hero-dot">•</span><span class="dp-hero-name2">' + e(name) + '</span>' : '') +
              '</div>' +
            '</div>' +
            '<div class="dp-hero-col dp-hero-col-2">' +
              '<div class="dp-hero-kv">' +
                '<span class="dp-hero-k">' + labelLocation + '</span>' +
                '<span class="dp-hero-v">' + e(locationText) + '</span>' +
              '</div>' +
              '<div class="dp-hero-kv">' +
                '<span class="dp-hero-k">' + labelCompany + '</span>' +
                '<span class="dp-hero-v' + (companyInfo && companyInfo.needsHighlight ? ' dp-hero-v--warn' : '') + '">' + e(companyText) + '</span>' +
              '</div>' +
              '<div class="dp-hero-kv">' +
                '<span class="dp-hero-k">' + labelStatus + '</span>' +
                '<span class="dp-hero-v">' + e(statusText) + '</span>' +
              '</div>' +
              '<div class="dp-hero-kv hidden-mobile">' +
                '<span class="dp-hero-k">' + labelConfirm + '</span>' +
                '<span class="dp-hero-v dp-hero-date">' + e(confirmText) + '</span>' +
              '</div>' +
              (returning ? '<div class="dp-hero-kv dp-hero-kv--warn"><span class="dp-hero-k">' + labelReturn + '</span><span class="dp-hero-v">' + e(returning) + '</span></div>' : '') +
              (disposing ? '<div class="dp-hero-kv dp-hero-kv--danger"><span class="dp-hero-k">' + labelDispose + '</span><span class="dp-hero-v">' + e(disposing) + '</span></div>' : '') +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }

    renderPreviewHero(item, type) {

      const e = (v) => this.escapeHtml(v);

      const isMold = String(type || '').toLowerCase() === 'mold';


      const line1 = isMold

        ? (item?.MoldCode || item?.MoldID || '-')

        : (item?.CutterNo || item?.CutterCode || item?.CutterDesignCode || item?.CutterID || '-');


      const id = isMold

        ? (item?.MoldID || '-')

        : (item?.CutterID || item?.ID || '-');


      const name = isMold

        ? (item?.MoldName || item?.Name || '')

        : (item?.CutterName || item?.CutterDesignName || item?.Name || '');


      const locRaw = item?.displayRackLocation || item?.displayLocation || item?.location || item?.rackNo || item?.RackLayerID || '-';

      const rackLayer = this.getRackLayerText(item);

      const locationText = (rackLayer

        ? (String(rackLayer) + ' ' + String(locRaw || '').trim()).trim()

        : String(locRaw || '-').trim()) || '-';


      const companyInfo = this.getStorageCompanyInfo ? this.getStorageCompanyInfo(item) : null;

      const statusInfo = this.getStorageStatus ? this.getStorageStatus(item) : null;


      const companyText = (companyInfo && companyInfo.nameShort) ? String(companyInfo.nameShort) : '-';

      const statusText = (statusInfo && (statusInfo.textShort || statusInfo.text)) ? String(statusInfo.textShort || statusInfo.text) : '---';

      const confirmText = (statusInfo && statusInfo.lastConfirmDateText) ? String(statusInfo.lastConfirmDateText) : '-';


      const returning = isMold ? (item?.MoldReturning || item?.Returning || '') : (item?.Returning || '');

      const disposing = isMold ? (item?.MoldDisposing || item?.Disposing || '') : (item?.Disposing || '');


      const heroClass = isMold ? 'dp-hero dp-hero--mold' : 'dp-hero dp-hero--cutter';


      const deviceType = isMold ? 'mold' : 'cutter';

      const deviceId = String(id || '').trim();


      const labelLocation = this.renderLabelHtml(this.biLabel('場所', 'Vị trí'));

      const labelCompany = this.renderLabelHtml(this.biLabel('保管会社', 'Công ty lưu trữ'));

      const labelStatus = this.renderLabelHtml(this.biLabel('状態', 'Trạng thái'));

      const labelConfirm = this.renderLabelHtml(this.biLabel('確認', 'Xác nhận'));

      const labelReturn = this.renderLabelHtml(this.biLabel('返却', 'Trả khuôn'));

      const labelDispose = this.renderLabelHtml(this.biLabel('廃棄', 'Hủy khuôn'));


      const transparentPixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';


      const idHtml = (id && String(id).trim() && String(id).trim() !== '-')

        ? ('<span class="dp-hero-id">' + e(id) + '</span>')

        : '';


      const nameHtml = (name && String(name).trim())

        ? ('<span class="dp-hero-dot">・</span><span class="dp-hero-name2">' + e(name) + '</span>')

        : '';


      const line2Html = (idHtml || nameHtml) ? (idHtml + nameHtml) : '<span class="dp-hero-id">-</span>';


      return (

        '<div class="' + heroClass + '">' +

          '<div class="dp-hero-grid dp-preview-hero-grid">' +


            '<div class="dp-preview-hero-thumbwrap">' +

              '<img data-dp-preview-hero-thumb="1"' +

                ' data-dp-device-type="' + e(deviceType) + '"' +

                ' data-dp-device-id="' + e(deviceId) + '"' +

                ' data-dp-hero-thumb-state="loading"' +

                ' src="' + transparentPixel + '" alt="" />' +

              '<div class="dp-preview-hero-thumbph">' +

                '<div class="dp-preview-hero-thumbph-text">写真なし / Chưa có ảnh</div>' +

              '</div>' +

            '</div>' +


            '<div class="dp-preview-hero-right">' +

              '<div class="dp-preview-hero-top">' +

                '<div class="dp-hero-line1">' + e(line1) + '</div>' +

                '<div class="dp-hero-line2">' + line2Html + '</div>' +

              '</div>' +


              '<div class="dp-preview-hero-bottom">' +

                '<div class="dp-preview-hero-kvgrid">' +


                  '<div class="dp-hero-kv">' +

                    '<span class="dp-hero-k">' + labelLocation + '</span>' +

                    '<span class="dp-hero-v">' + e(locationText) + '</span>' +

                  '</div>' +


                  '<div class="dp-hero-kv">' +

                    '<span class="dp-hero-k">' + labelCompany + '</span>' +

                    '<span class="dp-hero-v' + (companyInfo && companyInfo.needsHighlight ? ' dp-hero-v--warn' : '') + '">' + e(companyText) + '</span>' +

                  '</div>' +


                  '<div class="dp-hero-kv">' +

                    '<span class="dp-hero-k">' + labelStatus + '</span>' +

                    '<span class="dp-hero-v">' + e(statusText) + '</span>' +

                  '</div>' +


                  '<div class="dp-hero-kv">' +

                    '<span class="dp-hero-k">' + labelConfirm + '</span>' +

                    '<span class="dp-hero-v dp-hero-date">' + e(confirmText) + '</span>' +

                  '</div>' +


                '</div>' +


                (returning ? (

                  '<div class="dp-hero-kv dp-hero-kv--warn">' +

                    '<span class="dp-hero-k">' + labelReturn + '</span>' +

                    '<span class="dp-hero-v">' + e(returning) + '</span>' +

                  '</div>'

                ) : '') +


                (disposing ? (

                  '<div class="dp-hero-kv dp-hero-kv--danger">' +

                    '<span class="dp-hero-k">' + labelDispose + '</span>' +

                    '<span class="dp-hero-v">' + e(disposing) + '</span>' +

                  '</div>'

                ) : '') +


              '</div>' +

            '</div>' +


          '</div>' +

        '</div>'

      );

    }

    renderDesktopQuickActions(item, type) {
      return `
        <div class="dp-actions-grid">
          <button class="dp-action-btn dp-action-btn--inout" data-action="inout" type="button" title="入出庫・位置変更 / Nhập xuất, chuyển vị trí">
            <i class="fas fa-map-marker-alt" style="color:#0ea5e9;"></i>
            <div style="display:flex; flex-direction:column; align-items:flex-start; min-width:0; overflow:hidden;">
              <span class="dp-action-label-ja">位置</span>
              <span class="sub dp-action-label-vi">Vị trí</span>
            </div>
          </button>
          <button class="dp-action-btn dp-action-btn--inventory" data-action="inventory" type="button" title="棚卸 / Kiểm kê">
            <i class="fas fa-clipboard-check" style="color:#eab308;"></i>
            <div style="display:flex; flex-direction:column; align-items:flex-start; min-width:0; overflow:hidden;">
              <span class="dp-action-label-ja">棚卸</span>
              <span class="sub dp-action-label-vi">Kiểm kê</span>
            </div>
          </button>
          <button class="dp-action-btn dp-action-btn--teflon" data-action="teflon" type="button" title="テフロン / Mạ Teflon">
            <i class="fas fa-paint-roller" style="color:#14b8a6;"></i>
            <div style="display:flex; flex-direction:column; align-items:flex-start; min-width:0; overflow:hidden;">
              <span class="dp-action-label-ja">ﾃﾌﾛﾝ</span>
              <span class="sub dp-action-label-vi">Mạ Teflon</span>
            </div>
          </button>
          <button class="dp-action-btn dp-action-btn--print" data-action="print" type="button" title="印刷 / In">
            <i class="fas fa-print" style="color:#64748b;"></i>
            <div style="display:flex; flex-direction:column; align-items:flex-start; min-width:0; overflow:hidden;">
              <span class="dp-action-label-ja">印刷</span>
              <span class="sub dp-action-label-vi">In</span>
            </div>
          </button>
          <button class="dp-action-btn dp-action-btn--photo" data-action="photo" type="button" title="写真 / Ảnh">
            <i class="fas fa-camera" style="color:#ec4899;"></i>
            <div style="display:flex; flex-direction:column; align-items:flex-start; min-width:0; overflow:hidden;">
              <span class="dp-action-label-ja">写真</span>
              <span class="sub dp-action-label-vi">Ảnh</span>
            </div>
          </button>
          <button class="dp-action-btn dp-action-btn--qr" data-action="qr" type="button" title="QRコード / Mã QR">
            <i class="fas fa-qrcode" style="color:#8b5cf6;"></i>
            <div style="display:flex; flex-direction:column; align-items:flex-start; min-width:0; overflow:hidden;">
              <span class="dp-action-label-ja">QR</span>
              <span class="sub dp-action-label-vi">Mã QR</span>
            </div>
          </button>
        </div>
      `;
    }

    renderDesktopQuickQueries(mold) {
      // Ẩn nội dung cũ đã thay thế gọn gàng ở Desktop Quick actions
      return '';
    }

    // =====================================================================
    // PHOTO PREVIEW (Desktop left)
    // =====================================================================
    async hydrateDesktopPhotoPreviewFromSupabase() {
      try {
        // Chỉ chạy khi panel đang mở và đang ở tab Info (đúng logic layout desktop)
        if (!this.panel || !this.panel.classList.contains('open')) return
        if (this.currentTab !== 'info') return

        // Cần DevicePhotoStore (file device-photo-store) đã load
        if (!window.DevicePhotoStore || typeof window.DevicePhotoStore.getThumbnailUrl !== 'function') return

        // Nếu store có ensureReady thì gọi
        try {
          if (typeof window.DevicePhotoStore.ensureReady === 'function') window.DevicePhotoStore.ensureReady()
        } catch (e) {}

        // (A) Hydrate thumb chính (khung ảnh lớn bên trái)
        try {
          if (this.currentItem) {
            const img = this.panel.querySelector('img[data-dp-thumb-img="1"]');
            const placeholder = this.panel.querySelector('[data-dp-thumb-placeholder="1"]');

            if (img) {
              const deviceId = (this.currentItemType === 'mold')
                ? (this.currentItem.MoldID || this.currentItem.MoldCode)
                : (this.currentItem.CutterID || this.currentItem.CutterNo)

              if (deviceId) {
                let picked = null;
                if (typeof window.DevicePhotoStore.getThumbnailForDevice === 'function') {
                  picked = await window.DevicePhotoStore.getThumbnailForDevice(this.currentItemType, String(deviceId), { state: 'active' });
                }
                if (!picked && typeof window.DevicePhotoStore.getLatestActivePhotoForDevice === 'function') {
                  picked = await window.DevicePhotoStore.getLatestActivePhotoForDevice(this.currentItemType, String(deviceId));
                }

                const thumbUrl = await window.DevicePhotoStore.getThumbnailUrl(this.currentItemType, String(deviceId));

                const fullUrl = picked ? String(picked.publicurl || picked.publicUrl || picked.public_url || '') : '';
                const photoId = picked ? String(picked.id || '') : '';

                img.dataset.dpFullUrl = fullUrl;
                img.dataset.dpPhotoId = photoId;
                img.dataset.dpDeviceType = String(this.currentItemType || '');
                img.dataset.dpDeviceId = String(deviceId || '');

                if (!thumbUrl) {
                  try { img.removeAttribute('src'); } catch (e) {}
                  img.style.opacity = '0';
                  if (placeholder) {
                    placeholder.style.display = 'flex';
                    placeholder.innerHTML = `
                      <div data-dp-photo-upload="1" style="display:flex;gap:10px;align-items:center">
                        <i class="fas fa-cloud-upload-alt" style="opacity:.65"></i>
                        <div>
                          <div>この設備には写真がありません。ここをクリックしてアップロードしてください。</div>
                          <div style="font-size:12px;opacity:.90;font-weight:800">
                            Chưa có ảnh cho thiết bị này, hãy bấm vào đây để upload ảnh.
                          </div>
                        </div>
                      </div>
                    `;
                  }
                } else {
                  img.style.opacity = '0';
                  if (placeholder) placeholder.style.display = 'flex';

                  img.onload = function () {
                    img.style.opacity = '1';
                    if (placeholder) placeholder.style.display = 'none';
                  };
                  img.src = thumbUrl;
                }
              }
            }
          }
        } catch (e) {
          // ignore thumb chính
        }

        // (B) Hydrate thumb nhỏ trong danh sách thiết bị liên quan (cột 1)
        try {
          const relatedImgs = Array.from(this.panel.querySelectorAll('img[data-dp-related-thumb-img="1"]'));
          if (relatedImgs.length) {
            for (const im of relatedImgs) {
              try {
                const dtype = String(im.dataset.dpDeviceType || '').toLowerCase();
                const did = String(im.dataset.dpDeviceId || '').trim();
                if (!dtype || !did) continue;

                const thumbUrl = await window.DevicePhotoStore.getThumbnailUrl(dtype, did);
                if (thumbUrl) {
                  im.style.opacity = '0';
                  im.onload = function () { im.style.opacity = '1'; };
                  im.src = thumbUrl;
                } else {
                  // Không có thumb: giữ placeholder mờ
                  im.style.opacity = '0.18';
                }
              } catch (e) {
                // ignore per image
              }
            }
          }
        } catch (e) {
          // ignore related thumbs
        }
      } catch (e) {
        // im lặng để không làm lỗi UI
      }
    }


    findFirstPhotoUrl(item) {
      if (!item) return '';

      const candidates = [
        'PhotoUrl','PhotoURL','ImageUrl','ImageURL','photoUrl','imageUrl',
        'Photo','Image','ImagePath','PhotoPath','photo','image',
        'MoldPhoto','MoldImage','CutterPhoto','CutterImage',
        'Photo1','Photo2','Photo3','Image1','Image2','Image3'
      ];

      for (const k of candidates) {
        const v = item[k];
        if (v === null || v === undefined) continue; // Skip null or undefined values
        const url = this.extractUrlFromValue(v);
        if (url) return url;
      }

      try {
        for (const k in item) {
          const v = item[k];
          if (v === null || v === undefined) continue; // Skip null or undefined values
          const url = this.extractUrlFromValue(v);
          if (url) return url;
        }
      } catch (e) { /* ignore */ }

      return '';
    }

    extractUrlFromValue(v) {
      if (!v) return '';

      if (Array.isArray(v)) {
        for (const it of v) {
          const u = this.extractUrlFromValue(it);
          if (u) return u;
        }
        return '';
      }

      if (typeof v === 'object') {
        const maybe = v.url || v.URL || v.href || v.path || v.src;
        if (maybe) return this.extractUrlFromValue(maybe);
        return '';
      }

      const s = String(v).trim();
      if (!s) return '';

      if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
        try {
          const parsed = JSON.parse(s);
          return this.extractUrlFromValue(parsed);
        } catch (e) { /* ignore */ }
      }

      if (/^https?:\/\//i.test(s)) return s;

      if (/\.(jpg|jpeg|png|gif|webp)$/i.test(s)) return s;

      const m = s.match(/https?:\/\/[^\s"']+/i);
      if (m && m[0]) return m[0];

      return '';
    }

    renderDesktopPhotoPreview(item) {
      const isCutter = !!(item && (item.CutterID || item.CutterNo || item.CutterName || item.CutterDesignCode));
      const title = isCutter ? '抜型写真 / Ảnh dao cắt' : '金型写真 / Ảnh khuôn';

      const url = this.findFirstPhotoUrl(item);
      const code = isCutter
        ? this.safeText(item.CutterNo || item.CutterID)
        : this.safeText(item.MoldCode || item.MoldID);

      const hasCsvUrl = !!(url && String(url).trim());

      return `
        <div class="modal-section">
          <div class="section-header color-slate">
            <i class="fas fa-image"></i>
            <span>${this.escapeHtml(title)}</span>
          </div>

          <div style="position:relative;border-radius:12px;overflow:hidden;border:1px solid rgba(15,23,42,0.10);background:#fff;height:220px;min-height:220px">
            <img data-dp-thumb-img="1"
                src=""
                alt=""
                style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .18s ease;cursor:zoom-in"
                onerror="this.style.opacity='0'"/>

            <div style="position:absolute;top:10px;right:10px;display:flex;gap:8px;z-index:3">
              <button type="button" data-dp-photo-download="1" title="Download ảnh thật"
                style="width:36px;height:36px;border-radius:999px;border:1px solid rgba(18, 87, 119, 0.52);background:rgba(255,255,255,0.96);cursor:pointer">
                <i class="fas fa-download"></i>
              </button>


              <button type="button" data-dp-photo-trash="1" title="Xóa ảnh (vào thùng rác)"
                style="width:36px;height:36px;border-radius:999px;border:1px solid rgba(2, 23, 19, 0.53);background:rgba(255,255,255,0.96);cursor:pointer;color:#b91c1c">
                <i class="fas fa-trash-alt"></i>
              </button>
            </div>

            <div data-dp-thumb-placeholder="1"
                style="position:absolute;inset:0;padding:16px;color:#64748b;font-weight:700;display:flex;align-items:center;justify-content:center;cursor:pointer">
              <div data-dp-photo-upload="1" style="display:flex;gap:10px;align-items:center;max-width:360px">
                <i class="fas fa-camera" style="opacity:.85;font-size:22px"></i>
                <div>
                  <div style="font-size:13px">写真なし。クリックして撮影/アップロード</div>
                  <div style="font-size:11px;opacity:.90;font-weight:800">Bấm vào đây để tải/chụp ảnh</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    }


    // ===== Related list (2-line row) helpers (v8.3.2-7-3) =====
    getPriceText(item) {
      try {
        const keys = [
          'Price','UnitPrice','Cost','Value','Amount','JPY','Jpy','Yen',
          'MoldPrice','CutterPrice','MoldValue','CutterValue',
          'UnitCost','MaterialCost','PurchasePrice',
          '価格','単価','金額'
        ];
        for (const k of keys) {
          if (!item || !(k in item)) continue;
          const v = item[k];
          if (v === null || v === undefined) continue;
          const s = String(v).trim();
          if (s) return s;
        }
        return '';
      } catch (e) {
        return '';
      }
    }

    buildRelatedLine2Text(row, rowItemType) {
      try {
        const t = String(rowItemType || '').toLowerCase();

        if (t === 'cutter') {
          const id = this.safeText(row?.CutterID, row?.ID);
          const name = this.safeText(row?.CutterDesignName, row?.CutterName) || this.safeText(row?.Name, '');
          const parts = [];
          if (id && id !== '-') parts.push(id);
          if (name && name !== '-') parts.push(name);
          return parts.length ? parts.join(' · ') : '-';
        }

        // mold
        const id = this.safeText(row?.MoldID, '');
        const name = this.safeText(row?.MoldDesignName, row?.MoldName) || this.safeText(row?.Name, '');
        const parts = [];
        if (id && id !== '-') parts.push(id);
        if (name && name !== '-') parts.push(name);
        return parts.length ? parts.join(' · ') : '-';
      } catch (e) {
        return '-';
      }
    }

    renderRelatedRow(row, rowItemType) {
      const t = String(rowItemType || '').toLowerCase();
      const isMold = t === 'mold';

      const typeChip = isMold ? 'M' : 'C';
      const typeCls = isMold ? 'dp-type-chip dp-type-chip--mold' : 'dp-type-chip dp-type-chip--cutter';

      let cutterTypeBadge = '';
      if (!isMold && row?.CutterType) {
          cutterTypeBadge = `<span class="dp-badge-dim" style="background:#e0e7ff; color:#1e40af; border-color:#bfdbfe; font-size:10px; margin-left:4px; padding:1px 4px;">${this.escapeHtml(row.CutterType)}</span>`;
      }


      const codeText = isMold
        ? (row?.MoldCode ?? row?.MoldID ?? '---')
        : (row?.CutterNo ?? row?.CutterCode ?? row?.CutterID ?? row?.ID ?? '---');

      const kind = String(row?.dpLinkKind || '').toLowerCase().trim();
      const kindBadge = kind ? this.renderLinkKindBadge(kind) : '';
      let separateBadge = '';
      if ('SeparateCutter' in row || 'Separate' in row || 'Betsunuki' in row || 'separate' in row || 'separateCutter' in row) {
         const sepVal = String(row.SeparateCutter || row.Separate || row.Betsunuki || row.separate || row.separateCutter || '').toUpperCase();
         if (sepVal === 'YES' || sepVal === '1' || sepVal === 'CÓ' || sepVal === 'TRUE') {
             separateBadge = `<span style="background:#fee2e2; color:#dc2626; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; border:1px solid #fca5a5; margin-left: 6px; white-space:nowrap;">別抜き YES</span>`;
         } else if (sepVal === 'NO' || sepVal === '0' || sepVal === 'KHÔNG' || sepVal === 'FALSE') {
             separateBadge = `<span style="background:#f1f5f9; color:#64748b; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; border:1px solid #cbd5e1; margin-left: 6px; white-space:nowrap;">別抜き NO</span>`;
         } else {
             separateBadge = `<span style="background:#fef3c7; color:#d97706; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:700; border:1px solid #fcd34d; margin-left: 6px; white-space:nowrap;">別抜き ${this.escapeHtml(sepVal)}</span>`;
         }
      }


      const price = this.getPriceText(row);
      const rackBadge = this.renderRackLayerBadge(row);
      const line2 = this.buildRelatedLine2Text(row, rowItemType);

      const deviceType = isMold ? 'mold' : 'cutter';
      const deviceId = isMold
        ? (row?.MoldID || row?.MoldCode || '')
        : (row?.CutterID || row?.ID || row?.CutterNo || row?.CutterCode || '');

      const dataItem = isMold
        ? { MoldID: row?.MoldID, MoldCode: row?.MoldCode }
        : { CutterID: (row?.CutterID ?? row?.ID), CutterNo: (row?.CutterNo ?? row?.CutterCode) };

      const dataJson = this.escapeHtml(JSON.stringify(dataItem));
      const dataDevType = this.escapeHtml(String(deviceType || ''));
      const dataDevId = this.escapeHtml(String(deviceId || ''));

      // 1x1 transparent pixel, tránh icon lỗi khi chưa hydrate
      const transparentPixel = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

      return `
        <button type="button" class="dp-related-item view-detail-btn"
          data-item-type="${this.escapeHtml(t)}"
          data-item="${dataJson}">

          <div class="dp-related-left">
            <span class="${typeCls}">${this.escapeHtml(typeChip)}</span>
            <img
              data-dp-related-thumb-img="1"
              data-dp-device-type="${dataDevType}"
              data-dp-device-id="${dataDevId}"
              src="${transparentPixel}"
              alt=""
              
          </div>

          <div class="dp-related-main">
            <div class="dp-related-line1">
              <span class="dp-related-code">${this.escapeHtml(String(codeText || '---'))}</span>${cutterTypeBadge}
              ${kindBadge} ${separateBadge}
            </div>
            <div class="dp-related-line2">${this.escapeHtml(String(line2 || '-'))}</div>
          </div>

          <div class="dp-related-right">
            <div class="dp-related-meta">
              ${price ? `<span class="dp-related-price">${this.escapeHtml(String(price))}</span>` : ``}
              ${rackBadge ? `<span class="dp-related-rack">${rackBadge}</span>` : ``}
            </div>
          </div>
        </button>
      `.trim();
    }



    renderDesktopMiniRelated(item, type) {
      try {
        const t = String(type || '').toLowerCase();
        let list = [];
        let title = '';
        let rowItemType = '';

        if (t === 'mold') {
          title = 'Dao cắt liên quan';
          rowItemType = 'cutter';
          list = this.getRelatedCuttersForMold(item) || [];
        } else {
          title = 'Khuôn liên quan';
          rowItemType = 'mold';
          list = this.getSharedMoldsForCutter(item) || [];
        }

        const total = Array.isArray(list) ? list.length : 0;

        let html = '';
        html += `
          <div class="modal-section dp-related-section">
            <div class="section-header color-indigo">
              <i class="fas fa-link"></i>
              <span>${this.escapeHtml(title)} (${total})</span>
            </div>
        `;

        if (!total) {
          html += `<div class="no-data">Không có thiết bị liên quan</div></div>`;
          return html;
        }

        html += `<div class="dp-related-list">`;
        for (const r of list) {
          html += this.renderRelatedRow(r, rowItemType);
        }
        html += `</div></div>`;

        return html;
      } catch (e) {
        return '';
      }
    }

    
    renderDesktopMiniSnapshotsCutter(cutter) {
       return this.renderDesktopMiniSnapshots(cutter);
    }
    renderDesktopMiniSnapshots(mold) {
      const lastTeflon = this.getTeflonHistory(mold.MoldID)[0] || null;
      const lastStatus = this.getLatestStatusLog('MOLD', mold.MoldID);

      const teflonStatus = lastTeflon ? (lastTeflon.TeflonStatus || lastTeflon.Status || '') : '';
      const teflonDate = lastTeflon ? (lastTeflon.ReceivedDate || lastTeflon.SentDate || lastTeflon.RequestedDate || '') : '';

      return `
        <div class="modal-section">
          <div class="section-header color-slate">
            <i class="fas fa-bolt"></i>
            <span>概要 / Snapshot</span>
          </div>

          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
            ${ [ 
               {lbl: this.biLabel('最新ステータス', 'Trạng thái mới nhất'), val: this.safeText(lastStatus?.Status)},
               {lbl: this.biLabel('ステータス日時', 'Thời gian trạng thái'), val: this.safeText(this.formatDate(lastStatus?.Timestamp))},
               {lbl: this.biLabel('テフロン', 'Teflon'), val: this.safeText(teflonStatus)},
               {lbl: this.biLabel('テフロン日時', 'Thời gian Teflon'), val: this.safeText(this.formatDate(teflonDate))}
              ].map(f => {
                 let processedLabel = f.lbl;
                 if (processedLabel.includes('|||')) {
                    const parts = processedLabel.split('|||');
                    processedLabel = `<div style="display:flex; flex-direction:column; line-height:1.3; gap:2px;">
                       <span style="font-weight: 700; color: #475569; font-size: 11px;">${parts[0]}</span>
                       <span style="font-size: 10px; color: #94a3b8; font-weight: normal;">${parts[1]}</span>
                    </div>`;
                 }
                 return `
                 <div class="ov-item" style="display: flex !important; flex-direction: row !important; align-items: center !important; justify-content: space-between !important; padding: 6px 10px; background: rgba(248, 250, 252, 0.6); border: 1px solid rgba(15, 23, 42, 0.06); border-radius: 12px; gap: 8px;">
                   <div style="flex: 0 1 auto; margin-right: 8px;">${processedLabel}</div>
                   <div style="flex: 1 1 auto; text-align: right; font-size: 13.5px; font-weight: 600; color: #0f172a;">${f.val || '-'}</div>
                 </div>`;
              }).join('') 
            }
          </div>
          <div class="dp-actions-grid" >
            <button class="dp-action-btn" type="button" data-jump="history">
              <i class="fas fa-history"></i><div style="display:flex;flex-direction:column"><span class="dp-action-label-ja">履歴</span><span class="sub dp-action-label-vi">History</span></div>
            </button>
            <button class="dp-action-btn" type="button" data-jump="teflon">
              <i class="fas fa-spray-can"></i><div style="display:flex;flex-direction:column"><span class="dp-action-label-ja">Teflon</span><span class="sub dp-action-label-vi">Coating</span></div>
            </button>
            <button class="dp-action-btn" type="button" data-jump="extended">
              <i class="fas fa-layer-group"></i><div style="display:flex;flex-direction:column"><span class="dp-action-label-ja">拡張</span><span class="sub dp-action-label-vi">Extended</span></div>
            </button>
          </div>
        </div>
      `;

    }


    // =====================================================================
    // INFO SECTIONS (Mobile/Tablet & reuse in desktop)
    // =====================================================================

    renderLocationSection(item, type) {
      const e = (v) => this.escapeHtml(v);

      const companyInfo = this.getStorageCompanyInfo(item) || { nameShort: '-', isExternal: false, needsHighlight: false };
      const statusInfo = this.getStorageStatus(item) || { class: 'status-unknown', icon: 'fas fa-question-circle', textShort: '---', lastConfirmDateText: '---', isExpired: false };

      const rackLayerInfo = item?.rackLayerInfo;
      const rackInfo = item?.rackInfo;

      const rackId = rackInfo?.RackID ?? rackLayerInfo?.RackID ?? '-';
      const layerNum = rackLayerInfo?.RackLayerNumber ?? '-';

      const rackLocation = rackInfo?.RackLocation ?? item?.displayRackLocation ?? item?.displayLocation ?? item?.RackLayerID ?? item?.location ?? '-';
      
      const rackLocationBadgeCls = this.isDesktopWide() ? 'dp-location-badge dp-location-badge--desktop' : 'dp-location-badge';
      const rackLocationValueHtml = `<span class=\"${rackLocationBadgeCls}\">${e(rackLocation)}</span>`;
      const rackNotes = (rackInfo?.RackNotes ?? '').toString().trim();
      const layerNotes = (rackLayerInfo?.RackLayerNotes ?? rackLayerInfo?.RackLayerNote ?? '').toString().trim();

      const isExternal = !!companyInfo.isExternal;
      const companyBadgeCls = isExternal ? 'dp-company-badge dp-company-badge--external' : 'dp-company-badge dp-company-badge--ysd';
      const confirmGroupCls = statusInfo.isExpired ? 'confirm-date-group expired' : 'confirm-date-group';

      const rackLayerText = (rackId || layerNum) ? `${String(rackId ?? '').trim() || '-'}-${String(layerNum ?? '').trim() || '-'}` : '-';

      return `
        <div class="modal-section location-section">
          <div class="section-header color-teal">
            <i class="fas fa-map-marker-alt"></i>
            <span>保管情報 / Thông tin lưu trữ</span>
          </div>

          <div class="location-content">
            ${this.isDesktopWide() ? `
            <div class="dp-storage-top">
              <div class="dp-storage-col">
                <div class="dp-storage-label">${this.renderLabelHtml(this.biLabel('保管会社','Công ty'))}</div>
                <div class="${companyBadgeCls}">${e(companyInfo.nameShort || '-')}</div>
              </div>

              <div class="dp-storage-col">
                <div class="dp-storage-label">${this.renderLabelHtml(this.biLabel('棚-段','Giá - Tầng'))}</div>
                <div class="dp-badge-racklayer">${e(rackLayerText)}</div>
              </div>

              <div class="dp-storage-col">
                <div class="dp-storage-label">${this.renderLabelHtml(this.biLabel('状態','Trạng thái'))}</div>
                <div class="status-badge-compact ${e(statusInfo.class || '')}">
                  <i class="${e(statusInfo.icon || '')}"></i>
                  <span>${e(statusInfo.textShort || '---')}</span>
                </div>
              </div>

              <div class="dp-storage-col ${confirmGroupCls}">
                <div class="dp-storage-label">${this.renderLabelHtml(this.biLabel('確認','Xác nhận'))}</div>
                <div class="date-badge-compact">
                  <i class="fas fa-calendar-check"></i>
                  <span class="date-text">${e(statusInfo.lastConfirmDateText || '---')}</span>
                </div>
              </div>
            </div>
            ` : `
            <div class="dp-storage-mobile-layout" style="display:flex;flex-direction:column;gap:8px;">
               <div style="display:flex;gap:12px;align-items:stretch;">
                  <div style="width:34%;position:relative;border-radius:8px;overflow:hidden;border:1px solid rgba(15,23,42,0.10);background:#fff;min-height:100px;">
                    <img data-dp-thumb-img="1" src="" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .18s ease;cursor:pointer" onerror="this.style.opacity='0'"/>
                    <div data-dp-thumb-placeholder="1" style="position:absolute;inset:0;padding:6px;color:#64748b;display:flex;align-items:center;justify-content:center;cursor:pointer;text-align:center">
                      <div data-dp-photo-upload="1" style="display:flex;flex-direction:column;gap:4px;align-items:center">
                        <i class="fas fa-camera" style="opacity:.65" style="font-size:16px;"></i>
                        <div style="font-size:10px;line-height:1.2;font-weight:700;">Chưa có ảnh</div>
                      </div>
                    </div>
                  </div>

                  <div style="width:66%;display:flex;flex-direction:column;gap:6px;justify-content:center;">
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                      <div style="font-size:10px;font-weight:700;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.renderLabelHtml(this.biLabel('保管会社','(Công ty)'))}</div>
                      <div style="font-size:11px;font-weight:700;max-width:60%;text-align:right;"><span class="${companyBadgeCls}">${e(companyInfo.nameShort || '-')}</span></div>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                      <div style="font-size:10px;font-weight:700;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.renderLabelHtml(this.biLabel('棚-段','(Giá - Tầng)'))}</div>
                      <div style="font-size:11px;font-weight:700;max-width:60%;text-align:right;"><span class="dp-badge-racklayer">${e(rackLayerText)}</span></div>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                      <div style="font-size:10px;font-weight:700;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.renderLabelHtml(this.biLabel('状態','(Trạng thái)'))}</div>
                      <div style="display:flex;justify-content:flex-end;max-width:60%;">
                        <span class="status-badge-compact ${e(statusInfo.class || '')}"><i class="${e(statusInfo.icon || '')}"></i> <span>${e(statusInfo.textShort || '---')}</span></span>
                      </div>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                      <div style="font-size:10px;font-weight:700;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${this.renderLabelHtml(this.biLabel('確認(棚)','(Xác nhận)'))}</div>
                      <div style="display:flex;justify-content:flex-end;max-width:60%;">
                        <span class="date-badge-compact"><i class="fas fa-calendar-check"></i> <span class="date-text">${e(statusInfo.lastConfirmDateText || '---')}</span></span>
                      </div>
                    </div>
                  </div>
               </div>

               <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px;border-top:1px dashed #e2e8f0;padding-top:8px;">
                  <div style="display:flex;align-items:baseline;justify-content:space-between;">
                     <div style="font-size:11px;font-weight:700;color:#64748b;margin-right:8px;white-space:nowrap;">位置 (Vị trí)</div>
                     <div style="font-size:12px;font-weight:700;text-align:right;word-break:break-word;">${rackLocationValueHtml}</div>
                  </div>
                  ${rackNotes ? `
                  <div style="display:flex;align-items:baseline;justify-content:space-between;">
                     <div style="font-size:11px;font-weight:700;color:#64748b;margin-right:8px;white-space:nowrap;">メモ(棚) (Ghi chú giá)</div>
                     <div style="font-size:12px;font-weight:600;text-align:right;word-break:break-word;">${e(rackNotes)}</div>
                  </div>
                  ` : ''}
                  ${layerNotes ? `
                  <div style="display:flex;align-items:baseline;justify-content:space-between;">
                     <div style="font-size:11px;font-weight:700;color:#64748b;margin-right:8px;white-space:nowrap;">メモ(段) (Ghi chú tầng)</div>
                     <div style="font-size:12px;font-weight:600;text-align:right;word-break:break-word;">${e(layerNotes)}</div>
                  </div>
                  ` : ''}
               </div>
            </div>

            `}



            ${isExternal ? `
              <div class="dp-storage-warning">
                <i class="fas fa-exclamation-triangle"></i>
                <span>社外保管中 / Khuôn đang được lưu trữ bên ngoài.</span>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    }

    getStorageCompanyInfo(item) {
      const companyId = item.storage_company || item.storageCompany || item.CompanyID || '';
      const companyMap = this.data.companies || [];
      const company = companyMap.find(c => String(c.CompanyID || '').trim() === String(companyId).trim());

      const name = company ? (company.CompanyShortName || company.CompanyName || '') : '';
      const nameShort = name || 'YSD';

      const isExternal = nameShort && nameShort.toUpperCase() !== 'YSD';
      const needsHighlight = isExternal;

      return { nameShort, isExternal, needsHighlight };
    }


    getStorageStatus(item) {
      try {
        const logs = Array.isArray(this.data?.statuslogs) ? this.data.statuslogs : [];
        const moldId = this.normId(item?.MoldID ?? item?.moldId ?? item?.MoldCode);
        if (!moldId) return { class: 'status-unknown', icon: 'fas fa-question-circle', textShort: '---', lastConfirmDateText: '---', isExpired: false };

        const filtered = logs.filter((log) => {
          const id = this.normId(log?.MoldID ?? log?.MOLDID ?? log?.MoldCode);
          return id && id === moldId;
        });

        filtered.sort((a, b) => {
          const ta = Date.parse(a?.Timestamp || a?.Date || '') || 0;
          const tb = Date.parse(b?.Timestamp || b?.Date || '') || 0;
          return tb - ta;
        });

        const latest = filtered[0];
        if (!latest) return { class: 'status-no-history', icon: 'fas fa-question-circle', textShort: '---', lastConfirmDateText: '---', isExpired: false };

        const raw = String(latest?.Status ?? latest?.Action ?? '').toUpperCase();
        let cls = 'status-unknown';
        let icon = 'fas fa-question-circle';

        if (raw.includes('IN') || raw.includes('入') || raw.includes('NHAP')) {
          cls = 'status-in';
          icon = 'fas fa-arrow-circle-down';
        } else if (raw.includes('OUT') || raw.includes('出') || raw.includes('XUAT')) {
          cls = 'status-out';
          icon = 'fas fa-arrow-circle-up';
        } else if (raw.includes('AUDIT') || raw.includes('棚卸') || raw.includes('KIM')) {
          cls = 'status-audit';
          icon = 'fas fa-clipboard-check';
        } else if (raw.includes('RETURN') || raw.includes('返')) {
          cls = 'status-returned';
          icon = 'fas fa-undo';
        } else if (raw.includes('DISPOSE') || raw.includes('廃棄')) {
          cls = 'status-disposed';
          icon = 'fas fa-trash';
        }

        const ts = Date.parse(latest?.Timestamp || latest?.Date || '') || 0;
        const now = Date.now();
        const days = ts ? Math.floor((now - ts) / (1000 * 60 * 60 * 24)) : 99999;
        const isExpired = days >= 90;

        let dateText = '---';
        if (ts) {
          const d = new Date(ts);
          dateText = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }

        return { class: cls, icon, textShort: raw || '---', lastConfirmDateText: dateText, isExpired };
      } catch (e) {
        return { class: 'status-unknown', icon: 'fas fa-question-circle', textShort: '---', lastConfirmDateText: '---', isExpired: false };
      }
    }

    
    renderOverviewSection(item, type) {
      if (!item) return '';
      const isMold = (type === 'mold');
      const e = (v) => this.escapeHtml(v);
      const safeText = (v) => (!v || String(v).trim() === '') ? '-' : String(v).trim();
      
      const design = typeof this.getMoldDesignInfoSafe === 'function' ? this.getMoldDesignInfoSafe(item, type) : null;
      const job = typeof this.getJobInfoSafe === 'function' ? this.getJobInfoSafe(item, type) : null;
      
      const itemType = isMold ? safeText(this.pick(design, ['MoldSetupType']) || item.MoldType) : safeText(item.CutterType);
      
      // Khay information
      const trayInfoInstruction = safeText(
        job?.TrayInfo || job?.TrayInstruction || job?.InstructionTray || job?.TrayInfoFromInstruction || job?.NPCode || job?.NP || job?.NPNo ||
        design?.TrayInfoForMoldDesign || design?.TrayInfo
      );
      
      const plasticType = safeText(
        design?.PlasticType || design?.Material || design?.Resin || design?.Plastic || design?.DesignForPlasticType ||
        job?.Material || job?.PlasticType ||
        item.PlasticType || item.PlasticCutType
      );
      
      // DIMENSIONS AND WEIGHT (MOLD)
      let dimensions = '-';
      let weightText = '-';
      if (isMold) {
        const lRaw = item.MoldLengthModified ?? this.pick(design, ['MoldDesignLength']);
        const wRaw = item.MoldWidthModified ?? this.pick(design, ['MoldDesignWidth']);
        const hRaw = item.MoldHeightModified ?? this.pick(design, ['MoldDesignHeight']);
        dimensions = safeText(
          item.displayDimensions || item.displaySize || item.Dimensions || item.Size ||
          (typeof this.formatLWH === 'function' ? this.formatLWH(lRaw, wRaw, hRaw) : '') ||
          (design ? (typeof this.formatLWH === 'function' ? this.formatLWH(design.MoldDesignLength, design.MoldDesignWidth, design.MoldDesignHeight) : '') : '')
        );

        const weightRaw = item.MoldWeightModified ?? item.MoldWeight ?? this.pick(design, ['MoldDesignWeight']) ?? design?.DesignWeight ?? item.Weight;
        weightText = (weightRaw == null || String(weightRaw).trim() === '') ? '-' : (String(weightRaw).toLowerCase().includes('kg') ? String(weightRaw) : `${weightRaw} kg`);
      }

      const pieceCount = isMold 
        ? safeText(this.pick(design, ['PieceCount', 'PieceNumbers']) || item.PieceCount) 
        : safeText(item.BladeCount || item.Blades);
        
      const pocketCount = safeText(
        item.PocketCount || design?.PocketNumbers || design?.PocketCount || job?.PocketCount || item.Pockets || design?.Pockets
      );

      // DIMENSIONS AND WEIGHT (PRODUCT)
      const trayWeight = safeText(
        item.trayInfo?.TrayWeight || item.trayInfo?.ActualTrayWeight || 
        design?.TrayWeight || design?.ProductWeight || 
        job?.TrayWeight || job?.ProductWeight || job?.Weight
      );

      const cutX = (design?.CutlineX ?? design?.CutlineLength ?? design?.CutLength ?? design?.CutX ?? item?.CutlineLength ?? item?.CutLength ?? '').toString().trim();
      const cutY = (design?.CutlineY ?? design?.CutlineWidth ?? design?.CutWidth ?? design?.CutY ?? item?.CutlineWidth ?? item?.CutWidth ?? '').toString().trim();
      let fbCutter = null;
      if (isMold) {
        try {
          const related = item.relatedCutters || (typeof this.getRelatedCuttersForMold === 'function' ? this.getRelatedCuttersForMold(item) : []);
          if (Array.isArray(related) && related.length) fbCutter = related[0];
        } catch(e) {}
      }
      const fCutX = fbCutter ? String(fbCutter.CutlineLength ?? fbCutter.CutLength ?? fbCutter.CutlineL ?? fbCutter.CutX ?? '').trim() : '';
      const fCutY = fbCutter ? String(fbCutter.CutlineWidth ?? fbCutter.CutWidth ?? fbCutter.CutlineW ?? fbCutter.CutY ?? '').trim() : '';
      
      const depth = safeText(design?.MoldDesignDepth || design?.Depth || design?.CavityDepth || item.MoldDepth);
      const r = (design?.CornerR ?? design?.R ?? design?.CutR ?? design?.ProductR ?? fbCutter?.CutterCorner ?? fbCutter?.CornerR ?? item.CutterCorner ?? item.CornerR ?? '').toString().trim();
      const c = (design?.ChamferC ?? design?.C ?? design?.CutC ?? design?.ProductC ?? fbCutter?.CutterChamfer ?? fbCutter?.ChamferC ?? item.CutterChamfer ?? item.ChamferC ?? '').toString().trim();
      
      const baseXY = (cutX && cutY) ? `${cutX}×${cutY}` : ((fCutX && fCutY) ? `${fCutX}×${fCutY}` : '-');
      const tailRC = `${r ? ` - ${r}R` : ''}${c ? ` ${c}C` : ''}`.trim();
      const trayDim = (baseXY === '-') ? '-' : `${baseXY}${(depth === '-' ? '' : '×' + depth)}${tailRC ? ' ' + tailRC : ''}`;

      const moldDimBadge = dimensions !== '-' && dimensions !== '' ? `<span class="dp-badge-dim mold-dim">${dimensions}</span>` : '-';
      const prodDimBadge = trayDim !== '-' && trayDim !== '' ? `<span class="dp-badge-dim prod-dim">${trayDim}</span>` : '-';

      // NEW FIXED DATA FETCHING
      const firstShipment = safeText(
        job?.DeliveryDeadline || job?.FirstShipmentDate || job?.FirstExport || item?.FirstShipmentDate || job?.ShipmentDate || design?.ShipmentDate || item?.ShipmentDate
      );

      const costRaw = this.pick(item, ['Cost', 'OriginalCost', 'Price', 'UnitPrice', 'NguyenGia', 'CostPrice']) || 
                      this.pick(job, ['Cost', 'Price', 'UnitPrice']) || 
                      this.pick(design, ['Cost', 'UnitPrice']);
      const costBadge = (costRaw && String(costRaw).trim() !== '') ? `<span style="font-weight:600; color:#b91c1c;">${this.safeText(costRaw)}</span>` : '-';

      const itemName = isMold ? safeText(item.MoldName) : safeText(item.CutterName || item.CutterDesignName);
      const nameBadge = `
        <div style="font-size: 16px; font-weight: 800; color:#0f172a; line-height: 1.4; display: flex; align-items: center; gap: 8px;">
           ${isMold 
             ? `<span class="dp-badge-cutter-no" style="background:var(--dp-mold-theme); font-size: 11px; padding: 2px 6px; border-radius: 4px;">MOLD</span>` 
             : `<span class="dp-badge-cutter-no" style="background:var(--dp-cutter-theme); font-size: 11px; padding: 2px 6px; border-radius: 4px;">CUTTER</span>`}
           <span style="display:inline-flex; align-items:center; gap: 6px; flex-wrap: wrap;">
             ${itemName} 
             ${itemType && itemType !== '-' ? `<span style="font-size: 11px; font-weight: 700; padding: 1px 5px; background: #f1f5f9; color: #475569; border-radius: 4px; border: 1px solid #e2e8f0; line-height: 1.25;">${itemType}</span>` : ''}
           </span>
        </div>
      `;

      const itemCode = isMold ? safeText(item.MoldCode) : safeText(item.CutterNo || item.CutterCode);
      const itemID = isMold ? safeText(item.MoldID) : safeText(item.CutterID || item.ID);

      const row1 = [ { label: this.biLabel('名称', 'Tên thiết bị'), rawValue: nameBadge, customClass: 'name-row' } ];
      // row2 removed as integrated into nameBadge
      const row3 = [ { label: this.biLabel('トレイ情報(指示書)', 'Thông tin khay (từ chỉ thị)'), rawValue: trayInfoInstruction } ];
      const row4 = [ { label: this.biLabel('樹脂', 'Loại nhựa'), rawValue: plasticType } ];
      const row5 = [
        { label: this.biLabel('初回出荷日', 'Ngày xuất hàng ĐT'), rawValue: firstShipment },
        { label: this.biLabel('原価', 'Nguyên giá'), rawValue: costBadge }
      ];
      const row6 = [
        { label: this.biLabel('枚数', 'Số mảnh khuôn'), rawValue: pieceCount },
        { label: this.biLabel('ポケット数', 'Số pocket'), rawValue: pocketCount }
      ];
      const row7 = [
        { label: this.biLabel('金型寸法', 'Kích thước khuôn'), rawValue: moldDimBadge, customClass: 'mold-dim-row' },
        { label: this.biLabel('重量', 'Khối lượng khuôn'), rawValue: weightText, customClass: 'mold-weight-row' }
      ];
      const row8 = [
        { label: this.biLabel('製品寸法', 'Kích thước SP'), rawValue: prodDimBadge, customClass: 'prod-dim-row' },
        { label: this.biLabel('製品重量', 'Khối lượng SP'), rawValue: trayWeight, customClass: 'prod-weight-row' }
      ];

      const renderGrid = (arr, cls) => {
         let html = `<div class="ov-row ${cls}">`;
         for (const f of arr) {
           const rawLbl = String(f.label || '');
           let processedLabel = rawLbl;
           if (rawLbl.includes('|||')) {
              const parts = rawLbl.split('|||');
              processedLabel = `<div style="display:flex; flex-direction:column; line-height:1.3; gap:2px;">
                 <span style="font-weight: 700; color: #475569; font-size: 11.5px;">${parts[0]}</span>
                 <span style="font-size: 10px; color: #94a3b8; font-weight: normal;">${parts[1]}</span>
              </div>`;
           }
           let addCls = f.customClass ? ' ' + f.customClass : '';
           html += `
             <div class="ov-item${addCls}">
               <div class="info-label">${processedLabel}</div>
               <div class="info-value">${f.rawValue ?? '-'}</div>
             </div>
           `;
         }
         html += `</div>`;
         return html;
      };

      return `
        <style>
          .ov-row { display: grid; gap: 8px; margin-bottom: 8px; }
          .row-1col { grid-template-columns: 1fr; }
          .row-2col { grid-template-columns: repeat(2, 1fr); }
          
          .ov-item {
             display: flex !important; 
             flex-direction: row !important; 
             align-items: center !important; 
             justify-content: space-between !important; 
             padding: 6px 10px; 
             background: rgba(248, 250, 252, 0.6); 
             border: 1px solid rgba(15, 23, 42, 0.06); 
             border-radius: 12px; 
             gap: 8px;
          }
          .ov-item .info-label {
             border: none !important; 
             padding: 0 !important; 
             flex: 0 1 auto !important; 
             margin-bottom: 0 !important; 
             margin-right: 8px !important;
          }
          .ov-item .info-value {
             flex: 1 1 auto !important; 
             text-align: right !important; 
             word-break: break-word !important; 
             padding: 0 !important; 
             border: none !important; 
             font-size: 13.5px !important; 
             font-weight: 500 !important; 
             color: #0f172a !important;
          }

          /* CUSTOM RULES FOR REQUIREMENT */
          /* 1. Phần タイプ: xử lý label sát value */
          .type-row {
             justify-content: flex-start !important;
             gap: 8px !important;
          }
          .type-row .info-value, .name-row .info-value {
             text-align: left !important;
             flex: 0 0 auto !important;
          }

          /* 2. Đẩy khối lượng khuôn sang phải */
          .mold-weight-row {
             justify-content: flex-end !important;
          }

          @media (max-width: 800px) {
             .ov-row { grid-template-columns: 1fr !important; }
             .ov-item { flex-direction: column !important; align-items: flex-start !important; }
             .ov-item .info-label { width: 100% !important; margin-bottom: 6px !important; border-bottom: 1px dashed rgba(15,23,42,0.06) !important; padding-bottom: 6px !important; }
             .ov-item .info-value { width: 100% !important; text-align: left !important; }
             .type-row, .name-row { align-items: flex-start !important; }
          }
          .dp-overview-rows {
             display: flex;
             flex-direction: column;
          }
        </style>
        <div class="modal-section">
          <div class="section-header color-rose" style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <i class="fas fa-clipboard-list"></i>
              <span>概要 / Tổng quan</span>
            </div>
            <div style="font-family: 'Courier New', monospace; font-size: 13.5px; font-weight: 800; background: rgba(255,255,255,0.6); padding: 2px 8px; border-radius: 6px; color: #be123c;">
               ${itemCode} • ${itemID}
            </div>
          </div>
          <div class="dp-overview-rows">
            ${renderGrid(row1, 'row-1col')}
            ${renderGrid(row3, 'row-1col')}
            ${renderGrid(row4, 'row-1col')}
            ${renderGrid(row5, 'row-2col')}
            ${renderGrid(row6, 'row-2col')}
            ${renderGrid(row7, 'row-2col')}
            ${renderGrid(row8, 'row-2col')}
          </div>
        </div>
      `;
    }

    renderBasicInfoSection(item, type) {
      if (type === 'mold') return this.renderMoldBasicInfoFull(item);
      return this.renderCutterBasicInfoFull(item);
    }

    renderMoldBasicInfoFull(item) {
      const mold = item;
      const design = this.getMoldDesignInfoSafe(mold, 'mold');
      const job = this.getJobInfoSafe(mold, 'mold');
      
      const moldID = this.safeText(mold?.MoldID);
      const code = this.safeText(mold?.MoldCode);
      const name = this.safeText(mold?.MoldName);
      
      // Kích thước: từ mold hoặc design
      const lRaw = mold?.MoldLengthModified ?? this.pick(design, ['MoldDesignLength']);
      const wRaw = mold?.MoldWidthModified ?? this.pick(design, ['MoldDesignWidth']);
      const hRaw = mold?.MoldHeightModified ?? this.pick(design, ['MoldDesignHeight']);
      const lwh = this.safeText(this.formatLWH(lRaw, wRaw, hRaw));
      const dimensions = this.safeText(
      mold?.displayDimensions || mold?.displaySize || mold?.Dimensions || mold?.Size ||
      this.formatLWH(design?.MoldDesignLength, design?.MoldDesignWidth, design?.MoldDesignHeight),
      '-'
    );
      // Khối lượng
      const weightRaw = mold?.MoldWeightModified ?? this.pick(design, ['MoldDesignWeight']);
      const weightTxt = (weightRaw !== null && String(weightRaw).trim())
        ? (String(weightRaw).toLowerCase().includes('kg') ? String(weightRaw) : `${weightRaw} kg`)
        : '-';
      
      // Kiểu khuôn (MoldOrientation = hướng lắp)
      const moldType = this.safeText(this.pick(design, ['MoldSetupType']));
      const installDir = this.safeText(this.pick(design, ['MoldOrientation']));
      
      // Số mảnh
      const pieceCount = this.safeText(this.pick(design, ['PieceCount']));
      
      // Pitch
      const pitch = this.safeText(this.pick(design, ['Pitch']) ?? mold?.Pitch);
      
      // Chiều sâu
      const depth = this.safeText(this.pick(design, ['MoldDesignDepth']));
      
      // UnderDepth
      const underDepth = this.safeText(this.pick(design, ['UnderDepth']));
      
      // Ngày SX: lấy DeliveryDeadline từ job sớm nhất
      let madeDate = '-';
      if (job) {
        const dd = job?.DeliveryDeadline;
        madeDate = dd ? this.safeText(dd) : '-';
      }
      
      const fields = [
        { label: this.biLabel('名称', 'Tên'), rawValue: name, full: true },
        { label: this.biLabel('金型ID', 'MoldID'), rawValue: moldID },
        { label: this.biLabel('金型コード', 'Mã khuôn'), rawValue: code },
        
        { label: this.biLabel('寸法', 'Kích thước'), rawValue: dimensions },
        { label: this.biLabel('金型重量', 'Khối lượng'), rawValue: this.escapeHtml(weightTxt) },
        { label: this.biLabel('型タイプ', 'Kiểu khuôn'), rawValue: moldType },
        { label: this.biLabel('取付方向', 'Hướng lắp'), rawValue: installDir },
        { label: this.biLabel('枚数', 'Số mảnh'), rawValue: pieceCount },
        { label: this.biLabel('ピッチ', 'Pitch'), rawValue: pitch },
        { label: this.biLabel('深さ', 'Chiều sâu khuôn'), rawValue: depth },
        { label: this.biLabel('UnderDepth', 'UnderDepth'), rawValue: underDepth },
        { label: this.biLabel('製造日', 'Ngày SX'), rawValue: madeDate }
      ];

      
      return `<div class="modal-section">
        <div class="section-header color-rose">
          <i class="fas fa-info-circle"></i>
          <span>金型主要情報 / Thông tin chính</span>
        </div>
        ${this.renderInfoGrid(fields, "dp-info-grid-modern cols-4 dp-kv-maininfo")}
      </div>`;
    }

    renderCutterBasicInfoFull(item) {
      const cutterID = this.safeText(item?.CutterID);
      const cutterNo = this.safeText(item?.CutterNo);
      const cutterName = this.safeText(item?.CutterName);
      const moldDesignID = this.safeText(item?.MoldDesignID);
      
      const design = this.getMoldDesignInfoSafe(item, 'cutter');
      const moldDesignCode = this.safeText(
        item?.CutterDesignCode ?? item?.IDMaKhuonThietKe ?? design?.MoldDesignCode
      );
      
      const cutterType = this.safeText(item?.CutterType);
      const plasticCutType = this.safeText(item?.PlasticCutType);
      const bladeCount = this.safeText(item?.BladeCount);
      const pitch = this.safeText(item?.Pitch);
      const ppCushion = this.safeText(item?.PPcushionUse);
      const cutterEntry = this.safeText(item?.CutterManufactureDate ?? item?.CutterEntry);
      const satoCode = this.safeText(item?.SatoCode);
      const satoCodeDate = this.safeText(item?.SatoCodeDate);
      
      const cutSize = this.formatCutterCutSize(item);
      const sharedMoldsText = this.getMoldSharedListTextForCutter(item);
      
      const fields = [
        { label: this.biLabel('抜型ID', 'CutterID'), rawValue: cutterID },
        { label: this.biLabel('抜型コード', 'Mã số Dao cắt'), rawValue: cutterNo },
        { label: this.biLabel('名称', 'Tên Dao cắt'), rawValue: cutterName, full: true },
        { label: this.biLabel('金型設計ID', 'MoldDesignID'), rawValue: moldDesignID },
        { label: this.biLabel('金型設計コード', 'MoldDesignCode'), rawValue: moldDesignCode },
        { label: this.biLabel('抜型タイプ', 'Loại dao cắt'), rawValue: cutterType },
        { label: this.biLabel('カットライン', 'Kích thước dao cắt'), rawValue: cutSize },
        { label: this.biLabel('樹脂カットタイプ', 'Loại nhựa'), rawValue: plasticCutType },
        { label: this.biLabel('ブレード数', 'Số mảnh dao'), rawValue: bladeCount },
        { label: this.biLabel('ピッチ', 'Pitch'), rawValue: pitch },
        { label: this.biLabel('PP クッション', 'Tấm PP đệm'), rawValue: ppCushion },
        { label: this.biLabel('製造日', 'Ngày nhập dữ liệu'), rawValue: cutterEntry },
        { label: this.biLabel('サトーコード', 'Mã Sato'), rawValue: satoCode },
        { label: this.biLabel('サトー日付', 'Ngày SX Sato'), rawValue: satoCodeDate },
        { label: this.biLabel('共有金型', 'MoldShared'), rawValue: sharedMoldsText, full: true }
      ];

      
      return `<div class="modal-section">
        <div class="section-header color-rose">
          <i class="fas fa-info-circle"></i>
          <span>抜型基本情報 / Thông tin cơ bản Dao cắt</span>
        </div>
        ${this.renderInfoGrid(fields, 'dp-info-grid-modern cols-4 dp-kv-maininfo')}
      </div>`;
    }


    renderTechnicalInfoSection(item, type) {
      if (type === 'mold') return this.renderMoldTechnicalInfoFull(item);

      // cutter: hiển thị 2 phần (tóm tắt kỹ thuật + các cột còn lại trong cutters)
      return (
        this.renderCutterTechnicalInfoFull(item) +
        this.renderCutterOtherFieldsSection(item)
      );
    }


    renderMoldTechnicalInfoFull(item){
      const mold = item;
      const design = this.getMoldDesignInfoSafe(mold, 'mold');

      const dimensions = this.safeText(
        mold?.displayDimensions || mold?.displaySize || mold?.Dimensions || mold?.Size ||
        this.formatLWH(design?.MoldDesignLength, design?.MoldDesignWidth, design?.MoldDesignHeight),
        '-'
      );

      const plasticType = this.safeText(
        design?.PlasticType || design?.Material || design?.Resin || design?.Plastic || mold?.PlasticType,
        '-'
      );

      const pieceCount = this.safeText(
        design?.PieceCount || design?.PieceNumbers || mold?.PieceCount,
        '-'
      );

      const weightRaw = mold?.MoldWeight ?? design?.MoldDesignWeight ?? design?.DesignWeight ?? mold?.Weight;
      const weightTxt = (weightRaw == null || String(weightRaw).trim() === '')
        ? '-'
        : (String(weightRaw).toLowerCase().includes('kg') ? String(weightRaw) : `${weightRaw} kg`);

      const techFields = [
        { label: this.biLabel('寸法', 'Kích thước LxWxH'), rawValue: dimensions },
        { label: this.biLabel('樹脂', 'Loại nhựa'), rawValue: plasticType, full: true },
        { label: this.biLabel('枚数', 'Số mảnh khuôn'), rawValue: pieceCount },
        { label: this.biLabel('重量', 'Khối lượng'), rawValue: this.escapeHtml(weightTxt) },
      ];

      return `
        <div class="modal-section">
          <div class="section-header color-amber">
            <i class="fas fa-ruler-combined"></i>
            <span>${this.biLabel('技術仕様', 'Thông số kỹ thuật')}</span>
          </div>
          ${this.renderInfoGrid(techFields, "dp-kv-group-technical")}
        </div>
      `;
    }

    renderMoldProductJobSection(mold, design, job) {
      const d = design || this.getMoldDesignInfoSafe(mold, 'mold');
      const j = job || this.getJobInfoSafe(mold, 'mold');

      // 1) Tray info: ưu tiên theo chỉ thị (jobs)
      const trayInfoFromInstruction = this.safeText(
        j?.TrayInfo || j?.TrayInstruction || j?.InstructionTray || j?.TrayInfoFromInstruction || j?.NPCode || j?.NP || j?.NPNo,
        '-'
      );

      // 2) Tray name theo khách hàng
      const trayNameFromCustomer = this.safeText(
        mold?.trayInfo?.CustomerTrayName || mold?.trayInfo?.TrayName || j?.TrayName || j?.ProductName || j?.CustomerTrayName || j?.CustomerProductName || d?.TrayName || d?.ProductName,
        '-'
      );

      // 3) Loại nhựa thiết kế
      const plastic = this.safeText(
        d?.PlasticType || d?.Material || d?.Resin || d?.Plastic || j?.Material || j?.PlasticType,
        '-'
      );

      // 4) Kích thước sản phẩm: CutlineX x CutlineY x (Depth) - R - C
      const cutX = (d?.CutlineX ?? d?.CutlineLength ?? d?.CutX ?? '').toString().trim();
      const cutY = (d?.CutlineY ?? d?.CutlineWidth ?? d?.CutY ?? '').toString().trim();

      // fallback từ cutter liên quan nếu thiếu
      let fbCutter = null;
      try {
        const related = (mold && mold.relatedCutters) ? mold.relatedCutters : this.getRelatedCuttersForMold(mold);
        if (Array.isArray(related) && related.length) fbCutter = related[0];
      } catch (e) { /* ignore */ }

      const fCutX = fbCutter ? String(fbCutter.CutlineLength ?? fbCutter.CutLength ?? fbCutter.CutlineL ?? fbCutter.CutX ?? '').trim() : '';
      const fCutY = fbCutter ? String(fbCutter.CutlineWidth ?? fbCutter.CutWidth ?? fbCutter.CutlineW ?? fbCutter.CutY ?? '').trim() : '';

      const depth = this.safeText(
        d?.MoldDesignDepth || d?.Depth || d?.CavityDepth || mold?.MoldDepth,
        '-'
      );

      const r = (d?.CornerR ?? d?.R ?? d?.CutR ?? d?.ProductR ?? '').toString().trim() ||
                (fbCutter ? String(fbCutter.CutterCorner ?? fbCutter.CornerR ?? '').trim() : '');
      const c = (d?.ChamferC ?? d?.C ?? d?.CutC ?? d?.ProductC ?? '').toString().trim() ||
                (fbCutter ? String(fbCutter.CutterChamfer ?? fbCutter.ChamferC ?? '').trim() : '');

      const baseXY = (cutX && cutY) ? `${cutX}×${cutY}` : ((fCutX && fCutY) ? `${fCutX}×${fCutY}` : '-');
      const tailRC = `${r ? ` - ${r}R` : ''}${c ? ` ${c}C` : ''}`.trim();
      const trayDim = (baseXY === '-') ? '-' : `${baseXY}×${(depth === '-' ? '-' : depth)}${tailRC ? ' ' + tailRC : ''}`;

      const trayWeight = this.safeText(mold?.trayInfo?.TrayWeight || mold?.trayInfo?.ActualTrayWeight || d?.TrayWeight || d?.ProductWeight || j?.TrayWeight || j?.ProductWeight, '-');
      const pockets = this.safeText(d?.Pockets || d?.PocketCount || d?.CavityCount || j?.Pockets, '-');
      const draftAngle = this.safeText(d?.DraftAngle || d?.ReleaseAngle || d?.TaperAngle || j?.DraftAngle, '-');
      const engraving = this.safeText(d?.Engraving || d?.Marking || d?.MoldEngraving || j?.Engraving, '-');

      const prodFields = [
        { label: this.biLabel('トレイ情報（指示書より）', 'Thông tin Khay từ chỉ thị'), rawValue: trayInfoFromInstruction, full: true },
        { label: this.biLabel('トレイ情報(お客先より)', 'Tên khay theo KH'), rawValue: trayNameFromCustomer, full: true },
        { label: this.biLabel('設計時の材質', 'Loại nhựa'), rawValue: plastic, full: true },
        { label: this.biLabel('トレイ寸法', 'Kích thước sản phẩm'), rawValue: this.escapeHtml(trayDim), full: true },
        { label: this.biLabel('トレイ重量', 'Khối lượng khay'), rawValue: trayWeight },
        { label: this.biLabel('ポケット数', 'Số pockets'), rawValue: pockets },
        { label: this.biLabel('抜き勾配', 'Góc nghiêng thoát'), rawValue: draftAngle },
        { label: this.biLabel('刻印', 'Chữ khắc trên khay'), rawValue: engraving, full: true },
      ];

      return `
        <div class="modal-section">
          <div class="section-header color-emerald">
            <i class="fas fa-box"></i>
            <span>${this.biLabel('製品情報', 'Thông tin sản phẩm')}</span>
          </div>
          <div class="info-message" style="margin-bottom:8px">※ 設計/指示書の情報です。欠けている場合は関連抜型から補完します / Thông tin theo thiết kế & chỉ thị, thiếu sẽ bổ sung từ dao cắt liên quan.</div>
          ${this.renderInfoGrid(prodFields, "dp-info-grid-modern cols-4 dp-kv-group-product")}
        </div>
      `;
    }

    renderCutterTechnicalInfoFull(item) {
      const e = (v) => this.escapeHtml(v);

      const overall = item?.OverallDimensions || item?.CutterDim || '-';
      const lwh = this.formatLWH(item?.CutterLength, item?.CutterWidth, item?.CutterHeight) || '-';
      const cutline = this.formatLW(item?.CutlineLength, item?.CutlineWidth) || '-';
      const thickness = item?.CutterThickness || '-';

      return `
        <div class="modal-section">
          <div class="section-header color-amber">
            <i class="fas fa-ruler-combined"></i>
            <span>Thông số kỹ thuật Dao cắt / 抜型技術</span>
          </div>
          <div class="dp-info-grid-modern cols-4 dp-kv-group-technical">
            <div class="dp-item-stacked info-item">
              <div class="info-label">Kích thước tổng thể</div>
              <div class="info-value">${e(overall)}</div>
            </div>
            <div class="dp-item-stacked info-item">
              <div class="info-label">LWH</div>
              <div class="info-value">${e(lwh)}</div>
            </div>
            <div class="dp-item-stacked info-item">
              <div class="info-label">Cutline LW</div>
              <div class="info-value">${e(cutline)}</div>
            </div>
            <div class="dp-item-stacked info-item">
              <div class="info-label">Độ dày</div>
              <div class="info-value">${e(thickness)}</div>
            </div>
          </div>
        </div>
      `;
    }

    renderCutterOtherFieldsSection(cutter) {
      const e = (v) => this.escapeHtml(v);

      const excluded = new Set([
        // nhóm Basic (đã show)
        'CutterID','ID','CutterNo','CutterCode','CutterDesignCode','CutterName','CutterDesignName','Name',
        'MoldDesignID','molddesignid','DesignID','MoldDesignCode','IDMaKhuonThietKe',
        'CutterType','CutlineLength','CutlineWidth','CutLength','CutWidth','CutterCorner','CornerR','CutterChamfer','ChamferC',
        'PlasticCutType','PlasticType','BladeCount','Blades','Pitch','BladePitch','PPcushionUse','PPCushionUse','PP_Cushion',
        'CutterEntry','EntryDate','CreatedAt','SatoCode','SatoCodeDate',

        // nhóm Product reference (đã dùng)
        'TrayInfoForMoldDesign','CustomerTrayName','TrayName','Material','TrayWeight',
        'PocketCount','Pockets','PocketNumbers','DraftAngle','TaperAngle','TextContent','EngravingText',
        'CutlineX','CutlineY','MoldDesignDepth','CavityDepth','Depth',

        // object enrich / không muốn liệt kê
        'relatedMolds','relatedCutters','rackInfo','rackLayerInfo','customerInfo','companyInfo'
      ]);

      const keys = Object.keys(cutter || {}).sort((a,b)=>a.localeCompare(b));

      let rows = '';
      for (const k of keys) {
        if (excluded.has(k)) continue;
        const v = cutter[k];
        if (v === null || v === undefined) continue;

        const t = typeof v;
        if (t === 'object') continue; // bỏ array/object để đỡ rối

        const s = String(v).trim();
        if (!s) continue;

        rows += `
          <div class="dp-item-stacked info-item">
            <div class="info-label">${e(k)}</div>
            <div class="info-value">${e(s)}</div>
          </div>
        `;
      }

      return `
        <div class="modal-section">
          <div class="section-header color-amber">
            <i class="fas fa-ruler-combined"></i>
            <span>抜型 技術・その他 / Kỹ thuật & thông tin khác (cutters)</span>
          </div>
        <div class="dp-note">
          <div class="dp-note-jp">下記は cutters.csv の残り項目です（項目名は列名のまま表示）。</div>
          <div class="dp-note-vi">Các mục dưới đây là các cột còn lại của cutters (hiển thị theo tên cột).</div>
        </div>

          <div class="dp-info-grid-modern cols-4" >
            ${rows || `<div class="no-data">---</div>`}
          </div>
        </div>
      `;
    }

    renderProductInfoSection(item, type) {
      if (type === 'cutter') return this.renderCutterProductReferenceSection(item);
      
      const mold = item;
      const design = this.getMoldDesignInfoSafe(mold, 'mold');
      const job = this.getJobInfoSafe(mold, 'mold');
      
      // 1. Tray info (TrayInfoForMoldDesign)
      const trayInfoFromInstruction = this.safeText(
        this.pick(design, ['TrayInfoForMoldDesign'])
      );
      
      // 2. Tên khay theo KH
      const trayNameFromCustomer = this.safeText(
        this.pick(item.trayInfo, ['CustomerTrayName', 'TrayName']) ?? this.pick(design, ['CustomerTrayName', 'TrayDesignName'])
      );
      
      // 3. Loại nhựa thiết kế (DesignForPlasticType)
      const plastic = this.safeText(
        this.pick(design, ['DesignForPlasticType'])
      );
      
      // 4. Kích thước sản phẩm: CutlineX x CutlineY x Depth - R - C
      const cutX = String(this.pick(design, ['CutlineX']) || '').trim();
      const cutY = String(this.pick(design, ['CutlineY']) || '').trim();
      const depth = this.safeText(this.pick(design, ['MoldDesignDepth']));
      
      // Fallback sang cutter nếu design trống
      let fbCutter = null;
      try {
        const related = mold.relatedCutters || this.getRelatedCuttersForMold(mold);
        if (Array.isArray(related) && related.length) fbCutter = related[0];
      } catch (e) {}
      
      const fCutX = fbCutter ? String(fbCutter?.CutlineLength || '').trim() : '';
      const fCutY = fbCutter ? String(fbCutter?.CutlineWidth || '').trim() : '';
      
      const baseXY = (cutX && cutY) ? `${cutX}×${cutY}` : (fCutX && fCutY) ? `${fCutX}×${fCutY}` : '-';
      
      const r = String(this.pick(design, ['CornerR']) || (fbCutter ? fbCutter?.CutterCorner : '') || '').trim();
      const c = String(this.pick(design, ['ChamferC']) || (fbCutter ? fbCutter?.CutterChamfer : '') || '').trim();
      
      const tailRC = [r ? `-${r}R` : '', c ? `-${c}C` : ''].filter(Boolean).join('');
      const trayDim = `${baseXY}${depth !== '-' ? `×${depth}` : ''}${tailRC}`;
      
      // 5. Khối lượng khay
      const trayWeight = this.safeText(
        this.pick(item.trayInfo, ['TrayWeight', 'ActualTrayWeight']) ?? this.pick(design, ['TrayWeight']) ?? this.pick(job, ['TrayWeight'])
      );
      
      // 6. Số pockets (PocketNumbers)
      const pockets = this.safeText(
        this.pick(design, ['PocketNumbers'])
      );
      
      // 7. Góc nghiêng
      const draftAngle = this.safeText(
        this.pick(design, ['DraftAngle'])
      );
      
      // 8. Chữ khắc (không có trong CSV - để trống)
      const engraving = '-';
      
      const moldDimBadge = dimensions !== '-' && dimensions !== '' ? `<span class="dp-badge-dim mold-dim">${dimensions}</span>` : '-';
      const prodDimBadge = trayDim !== '-' && trayDim !== '' ? `<span class="dp-badge-dim prod-dim">${trayDim}</span>` : '-';

      const fields = [
        // 1. ID, Tên, Kiểu
        { label: this.biLabel(isMold ? '金型ID' : '抜型ID', isMold ? 'ID Khuôn' : 'ID Dao cắt'), rawValue: itemID },
        { label: this.biLabel('名称', 'Tên khuôn/Dao cắt'), rawValue: nameCode },
        { label: this.biLabel('タイプ', 'Kiểu khuôn/Dao'), rawValue: itemType },
        
        // 2. Thông tin khay từ chỉ thị
        { label: this.biLabel('トレイ情報(指示書)', 'Thông tin khay (từ chỉ thị)'), rawValue: trayInfoInstruction, full: true },
        
        // 3. Loại nhựa
        { label: this.biLabel('樹脂', 'Loại nhựa'), rawValue: plasticType },
        
        // 4. Ngày xuất hàng đầu tiên
        { label: this.biLabel('初回出荷日', 'Ngày xuất hàng ĐT'), rawValue: firstShipment },
        
        // 5. Kích thước khuôn (badge), Khối lượng khuôn, số mảnh khuôn
        { label: this.biLabel('金型寸法', 'Kích thước khuôn'), rawValue: moldDimBadge },
        { label: this.biLabel('金型重量', 'Khối lượng khuôn'), rawValue: weightText },
        { label: this.biLabel('枚数', 'Số mảnh khuôn'), rawValue: pieceCount },
        
        // 6. Kích thước sản phẩm (badge), khối lượng sản phẩm
        { label: this.biLabel('製品寸法', 'Kính thước SP'), rawValue: prodDimBadge },
        { label: this.biLabel('製品重量', 'Khối lượng SP'), rawValue: trayWeight }
      ];

      return `
        <div class="modal-section">
          <div class="section-header color-rose">
            <i class="fas fa-clipboard-list"></i>
            <span>概要 / Tổng quan</span>
          </div>
          ${(typeof this.renderInfoGrid === 'function' ? this.renderInfoGrid(fields, "dp-info-grid-modern cols-4 dp-kv-maininfo") : '')}
        </div>
      `;
    }

    renderBasicInfoSection(item, type) {
      if (type === 'mold') return this.renderMoldBasicInfoFull(item);
      return this.renderCutterBasicInfoFull(item);
    }

    renderMoldBasicInfoFull(item) {
      const mold = item;
      const design = this.getMoldDesignInfoSafe(mold, 'mold');
      const job = this.getJobInfoSafe(mold, 'mold');
      
      const moldID = this.safeText(mold?.MoldID);
      const code = this.safeText(mold?.MoldCode);
      const name = this.safeText(mold?.MoldName);
      
      // Kích thước: từ mold hoặc design
      const lRaw = mold?.MoldLengthModified ?? this.pick(design, ['MoldDesignLength']);
      const wRaw = mold?.MoldWidthModified ?? this.pick(design, ['MoldDesignWidth']);
      const hRaw = mold?.MoldHeightModified ?? this.pick(design, ['MoldDesignHeight']);
      const lwh = this.safeText(this.formatLWH(lRaw, wRaw, hRaw));
      const dimensions = this.safeText(
      mold?.displayDimensions || mold?.displaySize || mold?.Dimensions || mold?.Size ||
      this.formatLWH(design?.MoldDesignLength, design?.MoldDesignWidth, design?.MoldDesignHeight),
      '-'
    );
      // Khối lượng
      const weightRaw = mold?.MoldWeightModified ?? this.pick(design, ['MoldDesignWeight']);
      const weightTxt = (weightRaw !== null && String(weightRaw).trim())
        ? (String(weightRaw).toLowerCase().includes('kg') ? String(weightRaw) : `${weightRaw} kg`)
        : '-';
      
      // Kiểu khuôn (MoldOrientation = hướng lắp)
      const moldType = this.safeText(this.pick(design, ['MoldSetupType']));
      const installDir = this.safeText(this.pick(design, ['MoldOrientation']));
      
      // Số mảnh
      const pieceCount = this.safeText(this.pick(design, ['PieceCount']));
      
      // Pitch
      const pitch = this.safeText(this.pick(design, ['Pitch']) ?? mold?.Pitch);
      
      // Chiều sâu
      const depth = this.safeText(this.pick(design, ['MoldDesignDepth']));
      
      // UnderDepth
      const underDepth = this.safeText(this.pick(design, ['UnderDepth']));
      
      // Ngày SX: lấy DeliveryDeadline từ job sớm nhất
      let madeDate = '-';
      if (job) {
        const dd = job?.DeliveryDeadline;
        madeDate = dd ? this.safeText(dd) : '-';
      }
      
      const fields = [
        { label: this.biLabel('名称', 'Tên'), rawValue: name, full: true },
        { label: this.biLabel('金型ID', 'MoldID'), rawValue: moldID },
        { label: this.biLabel('金型コード', 'Mã khuôn'), rawValue: code },
        
        { label: this.biLabel('寸法', 'Kích thước'), rawValue: dimensions },
        { label: this.biLabel('金型重量', 'Khối lượng'), rawValue: this.escapeHtml(weightTxt) },
        { label: this.biLabel('型タイプ', 'Kiểu khuôn'), rawValue: moldType },
        { label: this.biLabel('取付方向', 'Hướng lắp'), rawValue: installDir },
        { label: this.biLabel('枚数', 'Số mảnh'), rawValue: pieceCount },
        { label: this.biLabel('ピッチ', 'Pitch'), rawValue: pitch },
        { label: this.biLabel('深さ', 'Chiều sâu khuôn'), rawValue: depth },
        { label: this.biLabel('UnderDepth', 'UnderDepth'), rawValue: underDepth },
        { label: this.biLabel('製造日', 'Ngày SX'), rawValue: madeDate }
      ];

      
      return `<div class="modal-section">
        <div class="section-header color-rose">
          <i class="fas fa-info-circle"></i>
          <span>金型主要情報 / Thông tin chính</span>
        </div>
        ${this.renderInfoGrid(fields, "dp-info-grid-modern cols-4 dp-kv-maininfo")}
      </div>`;
    }

    renderCutterBasicInfoFull(item) {
      const cutterID = this.safeText(item?.CutterID);
      const cutterNo = this.safeText(item?.CutterNo);
      const cutterName = this.safeText(item?.CutterName);
      const moldDesignID = this.safeText(item?.MoldDesignID);
      
      const design = this.getMoldDesignInfoSafe(item, 'cutter');
      const moldDesignCode = this.safeText(
        item?.CutterDesignCode ?? item?.IDMaKhuonThietKe ?? design?.MoldDesignCode
      );
      
      const cutterType = this.safeText(item?.CutterType);
      const plasticCutType = this.safeText(item?.PlasticCutType);
      const bladeCount = this.safeText(item?.BladeCount);
      const pitch = this.safeText(item?.Pitch);
      const ppCushion = this.safeText(item?.PPcushionUse);
      const cutterEntry = this.safeText(item?.CutterManufactureDate ?? item?.CutterEntry);
      const satoCode = this.safeText(item?.SatoCode);
      const satoCodeDate = this.safeText(item?.SatoCodeDate);
      
      const cutSize = this.formatCutterCutSize(item);
      const sharedMoldsText = this.getMoldSharedListTextForCutter(item);
      
      const fields = [
        { label: this.biLabel('抜型ID', 'CutterID'), rawValue: cutterID },
        { label: this.biLabel('抜型コード', 'Mã số Dao cắt'), rawValue: cutterNo },
        { label: this.biLabel('名称', 'Tên Dao cắt'), rawValue: cutterName, full: true },
        { label: this.biLabel('金型設計ID', 'MoldDesignID'), rawValue: moldDesignID },
        { label: this.biLabel('金型設計コード', 'MoldDesignCode'), rawValue: moldDesignCode },
        { label: this.biLabel('抜型タイプ', 'Loại dao cắt'), rawValue: cutterType },
        { label: this.biLabel('カットライン', 'Kích thước dao cắt'), rawValue: cutSize },
        { label: this.biLabel('樹脂カットタイプ', 'Loại nhựa'), rawValue: plasticCutType },
        { label: this.biLabel('ブレード数', 'Số mảnh dao'), rawValue: bladeCount },
        { label: this.biLabel('ピッチ', 'Pitch'), rawValue: pitch },
        { label: this.biLabel('PP クッション', 'Tấm PP đệm'), rawValue: ppCushion },
        { label: this.biLabel('製造日', 'Ngày nhập dữ liệu'), rawValue: cutterEntry },
        { label: this.biLabel('サトーコード', 'Mã Sato'), rawValue: satoCode },
        { label: this.biLabel('サトー日付', 'Ngày SX Sato'), rawValue: satoCodeDate },
        { label: this.biLabel('共有金型', 'MoldShared'), rawValue: sharedMoldsText, full: true }
      ];

      
      return `<div class="modal-section">
        <div class="section-header color-rose">
          <i class="fas fa-info-circle"></i>
          <span>抜型基本情報 / Thông tin cơ bản Dao cắt</span>
        </div>
        ${this.renderInfoGrid(fields, 'dp-info-grid-modern cols-4 dp-kv-maininfo')}
      </div>`;
    }


    renderTechnicalInfoSection(item, type) {
      if (type === 'mold') return this.renderMoldTechnicalInfoFull(item);

      // cutter: hiển thị 2 phần (tóm tắt kỹ thuật + các cột còn lại trong cutters)
      return (
        this.renderCutterTechnicalInfoFull(item) +
        this.renderCutterOtherFieldsSection(item)
      );
    }


    renderMoldTechnicalInfoFull(item){
      const mold = item;
      const design = this.getMoldDesignInfoSafe(mold, 'mold');

      const dimensions = this.safeText(
        mold?.displayDimensions || mold?.displaySize || mold?.Dimensions || mold?.Size ||
        this.formatLWH(design?.MoldDesignLength, design?.MoldDesignWidth, design?.MoldDesignHeight),
        '-'
      );

      const plasticType = this.safeText(
        design?.PlasticType || design?.Material || design?.Resin || design?.Plastic || mold?.PlasticType,
        '-'
      );

      const pieceCount = this.safeText(
        design?.PieceCount || design?.PieceNumbers || mold?.PieceCount,
        '-'
      );

      const weightRaw = mold?.MoldWeight ?? design?.MoldDesignWeight ?? design?.DesignWeight ?? mold?.Weight;
      const weightTxt = (weightRaw == null || String(weightRaw).trim() === '')
        ? '-'
        : (String(weightRaw).toLowerCase().includes('kg') ? String(weightRaw) : `${weightRaw} kg`);

      const techFields = [
        { label: this.biLabel('寸法', 'Kích thước LxWxH'), rawValue: dimensions },
        { label: this.biLabel('樹脂', 'Loại nhựa'), rawValue: plasticType, full: true },
        { label: this.biLabel('枚数', 'Số mảnh khuôn'), rawValue: pieceCount },
        { label: this.biLabel('重量', 'Khối lượng'), rawValue: this.escapeHtml(weightTxt) },
      ];

      return `
        <div class="modal-section">
          <div class="section-header color-amber">
            <i class="fas fa-ruler-combined"></i>
            <span>${this.biLabel('技術仕様', 'Thông số kỹ thuật')}</span>
          </div>
          ${this.renderInfoGrid(techFields, "dp-kv-group-technical")}
        </div>
      `;
    }

    renderMoldProductJobSection(mold, design, job) {
      const d = design || this.getMoldDesignInfoSafe(mold, 'mold');
      const j = job || this.getJobInfoSafe(mold, 'mold');

      // 1) Tray info: ưu tiên theo chỉ thị (jobs)
      const trayInfoFromInstruction = this.safeText(
        j?.TrayInfo || j?.TrayInstruction || j?.InstructionTray || j?.TrayInfoFromInstruction || j?.NPCode || j?.NP || j?.NPNo,
        '-'
      );

      // 2) Tray name theo khách hàng
      const trayNameFromCustomer = this.safeText(
        mold?.trayInfo?.CustomerTrayName || mold?.trayInfo?.TrayName || j?.TrayName || j?.ProductName || j?.CustomerTrayName || j?.CustomerProductName || d?.TrayName || d?.ProductName,
        '-'
      );

      // 3) Loại nhựa thiết kế
      const plastic = this.safeText(
        d?.PlasticType || d?.Material || d?.Resin || d?.Plastic || j?.Material || j?.PlasticType,
        '-'
      );

      // 4) Kích thước sản phẩm: CutlineX x CutlineY x (Depth) - R - C
      const cutX = (d?.CutlineX ?? d?.CutlineLength ?? d?.CutX ?? '').toString().trim();
      const cutY = (d?.CutlineY ?? d?.CutlineWidth ?? d?.CutY ?? '').toString().trim();

      // fallback từ cutter liên quan nếu thiếu
      let fbCutter = null;
      try {
        const related = (mold && mold.relatedCutters) ? mold.relatedCutters : this.getRelatedCuttersForMold(mold);
        if (Array.isArray(related) && related.length) fbCutter = related[0];
      } catch (e) { /* ignore */ }

      const fCutX = fbCutter ? String(fbCutter.CutlineLength ?? fbCutter.CutLength ?? fbCutter.CutlineL ?? fbCutter.CutX ?? '').trim() : '';
      const fCutY = fbCutter ? String(fbCutter.CutlineWidth ?? fbCutter.CutWidth ?? fbCutter.CutlineW ?? fbCutter.CutY ?? '').trim() : '';

      const depth = this.safeText(
        d?.MoldDesignDepth || d?.Depth || d?.CavityDepth || mold?.MoldDepth,
        '-'
      );

      const r = (d?.CornerR ?? d?.R ?? d?.CutR ?? d?.ProductR ?? '').toString().trim() ||
                (fbCutter ? String(fbCutter.CutterCorner ?? fbCutter.CornerR ?? '').trim() : '');
      const c = (d?.ChamferC ?? d?.C ?? d?.CutC ?? d?.ProductC ?? '').toString().trim() ||
                (fbCutter ? String(fbCutter.CutterChamfer ?? fbCutter.ChamferC ?? '').trim() : '');

      const baseXY = (cutX && cutY) ? `${cutX}×${cutY}` : ((fCutX && fCutY) ? `${fCutX}×${fCutY}` : '-');
      const tailRC = `${r ? ` - ${r}R` : ''}${c ? ` ${c}C` : ''}`.trim();
      const trayDim = (baseXY === '-') ? '-' : `${baseXY}×${(depth === '-' ? '-' : depth)}${tailRC ? ' ' + tailRC : ''}`;

      const trayWeight = this.safeText(mold?.trayInfo?.TrayWeight || mold?.trayInfo?.ActualTrayWeight || d?.TrayWeight || d?.ProductWeight || j?.TrayWeight || j?.ProductWeight, '-');
      const pockets = this.safeText(d?.Pockets || d?.PocketCount || d?.CavityCount || j?.Pockets, '-');
      const draftAngle = this.safeText(d?.DraftAngle || d?.ReleaseAngle || d?.TaperAngle || j?.DraftAngle, '-');
      const engraving = this.safeText(d?.Engraving || d?.Marking || d?.MoldEngraving || j?.Engraving, '-');

      const prodFields = [
        { label: this.biLabel('トレイ情報（指示書より）', 'Thông tin Khay từ chỉ thị'), rawValue: trayInfoFromInstruction, full: true },
        { label: this.biLabel('トレイ情報(お客先より)', 'Tên khay theo KH'), rawValue: trayNameFromCustomer, full: true },
        { label: this.biLabel('設計時の材質', 'Loại nhựa'), rawValue: plastic, full: true },
        { label: this.biLabel('トレイ寸法', 'Kích thước sản phẩm'), rawValue: this.escapeHtml(trayDim), full: true },
        { label: this.biLabel('トレイ重量', 'Khối lượng khay'), rawValue: trayWeight },
        { label: this.biLabel('ポケット数', 'Số pockets'), rawValue: pockets },
        { label: this.biLabel('抜き勾配', 'Góc nghiêng thoát'), rawValue: draftAngle },
        { label: this.biLabel('刻印', 'Chữ khắc trên khay'), rawValue: engraving, full: true },
      ];

      return `
        <div class="modal-section">
          <div class="section-header color-emerald">
            <i class="fas fa-box"></i>
            <span>${this.biLabel('製品情報', 'Thông tin sản phẩm')}</span>
          </div>
          <div class="info-message" style="margin-bottom:8px">※ 設計/指示書の情報です。欠けている場合は関連抜型から補完します / Thông tin theo thiết kế & chỉ thị, thiếu sẽ bổ sung từ dao cắt liên quan.</div>
          ${this.renderInfoGrid(prodFields, "dp-info-grid-modern cols-4 dp-kv-group-product")}
        </div>
      `;
    }

    renderCutterTechnicalInfoFull(item) {
      const e = (v) => this.escapeHtml(v);

      const overall = item?.OverallDimensions || item?.CutterDim || '-';
      const lwh = this.formatLWH(item?.CutterLength, item?.CutterWidth, item?.CutterHeight) || '-';
      const cutline = this.formatLW(item?.CutlineLength, item?.CutlineWidth) || '-';
      const thickness = item?.CutterThickness || '-';

      return `
        <div class="modal-section">
          <div class="section-header color-amber">
            <i class="fas fa-ruler-combined"></i>
            <span>Thông số kỹ thuật Dao cắt / 抜型技術</span>
          </div>
          <div class="dp-info-grid-modern cols-4 dp-kv-group-technical">
            <div class="dp-item-stacked info-item">
              <div class="info-label">Kích thước tổng thể</div>
              <div class="info-value">${e(overall)}</div>
            </div>
            <div class="dp-item-stacked info-item">
              <div class="info-label">LWH</div>
              <div class="info-value">${e(lwh)}</div>
            </div>
            <div class="dp-item-stacked info-item">
              <div class="info-label">Cutline LW</div>
              <div class="info-value">${e(cutline)}</div>
            </div>
            <div class="dp-item-stacked info-item">
              <div class="info-label">Độ dày</div>
              <div class="info-value">${e(thickness)}</div>
            </div>
          </div>
        </div>
      `;
    }

    renderCutterOtherFieldsSection(cutter) {
      const e = (v) => this.escapeHtml(v);

      const excluded = new Set([
        // nhóm Basic (đã show)
        'CutterID','ID','CutterNo','CutterCode','CutterDesignCode','CutterName','CutterDesignName','Name',
        'MoldDesignID','molddesignid','DesignID','MoldDesignCode','IDMaKhuonThietKe',
        'CutterType','CutlineLength','CutlineWidth','CutLength','CutWidth','CutterCorner','CornerR','CutterChamfer','ChamferC',
        'PlasticCutType','PlasticType','BladeCount','Blades','Pitch','BladePitch','PPcushionUse','PPCushionUse','PP_Cushion',
        'CutterEntry','EntryDate','CreatedAt','SatoCode','SatoCodeDate',

        // nhóm Product reference (đã dùng)
        'TrayInfoForMoldDesign','CustomerTrayName','TrayName','Material','TrayWeight',
        'PocketCount','Pockets','PocketNumbers','DraftAngle','TaperAngle','TextContent','EngravingText',
        'CutlineX','CutlineY','MoldDesignDepth','CavityDepth','Depth',

        // object enrich / không muốn liệt kê
        'relatedMolds','relatedCutters','rackInfo','rackLayerInfo','customerInfo','companyInfo'
      ]);

      const keys = Object.keys(cutter || {}).sort((a,b)=>a.localeCompare(b));

      let rows = '';
      for (const k of keys) {
        if (excluded.has(k)) continue;
        const v = cutter[k];
        if (v === null || v === undefined) continue;

        const t = typeof v;
        if (t === 'object') continue; // bỏ array/object để đỡ rối

        const s = String(v).trim();
        if (!s) continue;

        rows += `
          <div class="dp-item-stacked info-item">
            <div class="info-label">${e(k)}</div>
            <div class="info-value">${e(s)}</div>
          </div>
        `;
      }

      return `
        <div class="modal-section">
          <div class="section-header color-amber">
            <i class="fas fa-ruler-combined"></i>
            <span>抜型 技術・その他 / Kỹ thuật & thông tin khác (cutters)</span>
          </div>
        <div class="dp-note">
          <div class="dp-note-jp">下記は cutters.csv の残り項目です（項目名は列名のまま表示）。</div>
          <div class="dp-note-vi">Các mục dưới đây là các cột còn lại của cutters (hiển thị theo tên cột).</div>
        </div>

          <div class="dp-info-grid-modern cols-4" >
            ${rows || `<div class="no-data">---</div>`}
          </div>
        </div>
      `;
    }

    renderProductInfoSection(item, type) {
      if (type === 'cutter') return this.renderCutterProductReferenceSection(item);
      
      const mold = item;
      const design = this.getMoldDesignInfoSafe(mold, 'mold');
      const job = this.getJobInfoSafe(mold, 'mold');
      
      // 1. Tray info (TrayInfoForMoldDesign)
      const trayInfoFromInstruction = this.safeText(
        this.pick(design, ['TrayInfoForMoldDesign'])
      );
      
      // 2. Tên khay theo KH
      const trayNameFromCustomer = this.safeText(
        this.pick(item.trayInfo, ['CustomerTrayName', 'TrayName']) ?? this.pick(design, ['CustomerTrayName', 'TrayDesignName'])
      );
      
      // 3. Loại nhựa thiết kế (DesignForPlasticType)
      const plastic = this.safeText(
        this.pick(design, ['DesignForPlasticType'])
      );
      
      // 4. Kích thước sản phẩm: CutlineX x CutlineY x Depth - R - C
      const cutX = String(this.pick(design, ['CutlineX']) || '').trim();
      const cutY = String(this.pick(design, ['CutlineY']) || '').trim();
      const depth = this.safeText(this.pick(design, ['MoldDesignDepth']));
      
      // Fallback sang cutter nếu design trống
      let fbCutter = null;
      try {
        const related = mold.relatedCutters || this.getRelatedCuttersForMold(mold);
        if (Array.isArray(related) && related.length) fbCutter = related[0];
      } catch (e) {}
      
      const fCutX = fbCutter ? String(fbCutter?.CutlineLength || '').trim() : '';
      const fCutY = fbCutter ? String(fbCutter?.CutlineWidth || '').trim() : '';
      
      const baseXY = (cutX && cutY) ? `${cutX}×${cutY}` : (fCutX && fCutY) ? `${fCutX}×${fCutY}` : '-';
      
      const r = String(this.pick(design, ['CornerR']) || (fbCutter ? fbCutter?.CutterCorner : '') || '').trim();
      const c = String(this.pick(design, ['ChamferC']) || (fbCutter ? fbCutter?.CutterChamfer : '') || '').trim();
      
      const tailRC = [r ? `-${r}R` : '', c ? `-${c}C` : ''].filter(Boolean).join('');
      const trayDim = `${baseXY}${depth !== '-' ? `×${depth}` : ''}${tailRC}`;
      
      // 5. Khối lượng khay
      const trayWeight = this.safeText(
        this.pick(item.trayInfo, ['TrayWeight', 'ActualTrayWeight']) ?? this.pick(design, ['TrayWeight']) ?? this.pick(job, ['TrayWeight'])
      );
      
      // 6. Số pockets (PocketNumbers)
      const pockets = this.safeText(
        this.pick(design, ['PocketNumbers'])
      );
      
      // 7. Góc nghiêng
      const draftAngle = this.safeText(
        this.pick(design, ['DraftAngle'])
      );
      
      // 8. Chữ khắc (không có trong CSV - để trống)
      const engraving = '-';
      
      const fields = [
        { label: this.biLabel('トレイ情報（指示書より）', 'Thông tin khay từ chỉ thị'), rawValue: trayInfoFromInstruction, full: true },
        { label: this.biLabel('トレイ名称（お客様より）', 'Tên khay theo KH'), rawValue: trayNameFromCustomer, full: true },
        { label: this.biLabel('設計時の材質', 'Loại nhựa'), rawValue: plastic, full: true },
        { label: this.biLabel('トレイ寸法', 'Kích thước sản phẩm'), rawValue: trayDim, full: true },
        { label: this.biLabel('トレイ重量', 'Khối lượng khay'), rawValue: trayWeight },
        { label: this.biLabel('ポケット数', 'Số pockets'), rawValue: pockets },
        { label: this.biLabel('抜き勾配', 'Góc nghiêng thoát sản phẩm'), rawValue: draftAngle },
        { label: this.biLabel('刻印', 'Chữ khắc trên khay'), rawValue: engraving, full: true }
      ];
      
      return `<div class="modal-section">
        <div class="section-header color-emerald">
          <i class="fas fa-box"></i>
          <span>製品情報 / Thông tin sản phẩm</span>
        </div>
        ${this.renderInfoGrid(fields, 'dp-info-grid-modern cols-4')}
      </div>`;
    }


    renderProductInfoFull(item, type) {
      const e = (v) => this.escapeHtml(v);
      const design = this.getMoldDesignInfoSafe(item, type);
      const job = this.getJobInfoSafe(item, type);

      const productionDate = (type === 'mold') ? (item?.ProductionDate || job?.DeliveryDeadline || item?.displayDate || '-') : (item?.CutterManufactureDate || '-');
      const trayName = item?.trayInfo?.CustomerTrayName || item?.trayInfo?.TrayName || design?.CustomerTrayName || '-';
      const trayInfo = design?.TrayInfoForMoldDesign || '-';
      const material = job?.Material || design?.DesignForPlasticType || '-';

      return `
        <div class="modal-section">
          <div class="section-header">
            <i class="fas fa-box"></i>
            <span>Thông tin sản phẩm / 製品情報</span>
          </div>
          <div class="dp-info-grid-modern cols-4">
            <div class="dp-item-stacked info-item">
              <div class="info-label">Ngày SX</div>
              <div class="info-value">${e(productionDate)}</div>
            </div>
            <div class="dp-item-stacked info-item">
              <div class="info-label">Tray name</div>
              <div class="info-value">${e(trayName)}</div>
            </div>
            <div class="dp-item-stacked info-item">
              <div class="info-label">Tray info</div>
              <div class="info-value">${e(trayInfo)}</div>
            </div>
            <div class="dp-item-stacked info-item">
              <div class="info-label">Chất liệu</div>
              <div class="info-value">${e(material)}</div>
            </div>
          </div>
        </div>
      `;
    }

    renderCutterProductReferenceSection(cutter) {
      const e = (v) => this.escapeHtml(v);
      const lbl = (jp, vi) => this.renderLabelHtml(this.biLabel(jp, vi));

      const design = this.getMoldDesignInfoSafe ? this.getMoldDesignInfoSafe(cutter, 'cutter') : null;
      const job = this.getJobInfoSafe ? this.getJobInfoSafe(cutter, 'cutter') : null;

      const moldDesignID = cutter?.MoldDesignID ?? cutter?.molddesignid ?? design?.MoldDesignID ?? '-';
      const moldDesignCode =
        cutter?.MoldDesignCode ??
        cutter?.IDMaKhuonThietKe ??
        design?.MoldDesignCode ??
        design?.DesignCode ??
        '-';

      // Tray info / name
      const trayInfo = design?.TrayInfoForMoldDesign ?? job?.TrayInfo ?? '-';
      const trayName = cutter?.trayInfo?.CustomerTrayName ?? cutter?.trayInfo?.TrayName ?? design?.CustomerTrayName ?? design?.TrayName ?? '-';

      // Material
      const material = job?.Material ?? design?.DesignForPlasticType ?? cutter?.PlasticCutType ?? '-';

      // Tray size: CutlineX/Y + depth + R/C (fallback từ cutters nếu design trống)
      const cutX =
        design?.CutlineX ?? design?.CutLength ?? cutter?.CutlineLength ?? cutter?.CutLength ?? '';
      const cutY =
        design?.CutlineY ?? design?.CutWidth ?? cutter?.CutlineWidth ?? cutter?.CutWidth ?? '';
      const depth =
        design?.MoldDesignDepth ?? design?.CavityDepth ?? design?.Depth ?? '';
      const r = design?.CornerR ?? cutter?.CutterCorner ?? cutter?.CornerR ?? '';
      const c = design?.ChamferC ?? cutter?.CutterChamfer ?? cutter?.ChamferC ?? '';

      let trayDim = '-';
      if (String(cutX).trim() && String(cutY).trim()) {
        trayDim = `${String(cutX).trim()}×${String(cutY).trim()}`;
        if (String(depth).trim()) trayDim += `×${String(depth).trim()}`;
        if (String(r).trim()) trayDim += ` - R${String(r).trim()}`;
        if (String(c).trim()) trayDim += ` - C${String(c).trim()}`;
      }

      // Extra from design/job
      const trayWeight = cutter?.trayInfo?.TrayWeight ?? cutter?.trayInfo?.ActualTrayWeight ?? job?.TrayWeight ?? design?.TrayWeight ?? '-';
      const pockets = job?.PocketCount ?? design?.PocketCount ?? design?.Pockets ?? '-';
      const draft = job?.DraftAngle ?? design?.DraftAngle ?? design?.Draft ?? '-';
      const engraving = job?.Engraving ?? design?.Engraving ?? '-';

      return `
        <div class="modal-section">
          <div class="section-header color-slate">
            <i class="fas fa-box"></i>
            <span>製品情報（参照）/ Thông tin sản phẩm (tham khảo)</span>
          </div>

          <div class="dp-note">
            <div class="dp-note-jp">この製品情報は「設計」に基づく参照です（共有抜型の場合、表示中の金型と一致しない可能性があります）。</div>
            <div class="dp-note-vi">Thông tin này tham khảo theo “thiết kế”, dao cắt dùng chung có thể không khớp 100% với khuôn đang mở từ liên kết.</div>
          </div>

          <div class="dp-info-grid-modern cols-4 dp-kv-group-product" >
            <div class="dp-item-stacked info-item">
              <div class="info-label">${lbl('設計ID', 'MoldDesignID')}</div>
              <div class="info-value">${e(moldDesignID)}</div>
            </div>

            <div class="dp-item-stacked info-item">
              <div class="info-label">${lbl('設計コード', 'MoldDesignCode')}</div>
              <div class="info-value">${e(moldDesignCode)}</div>
            </div>

            <div class="dp-item-stacked info-item full-width">
              <div class="info-label">${lbl('トレイ情報', 'Thông tin khay')}</div>
              <div class="info-value">${e(trayInfo)}</div>
            </div>

            <div class="dp-item-stacked info-item full-width">
              <div class="info-label">${lbl('トレイ名', 'Tên khay')}</div>
              <div class="info-value">${e(trayName)}</div>
            </div>

            <div class="dp-item-stacked info-item">
              <div class="info-label">${lbl('材質', 'Vật liệu')}</div>
              <div class="info-value">${e(material)}</div>
            </div>

            <div class="info-item">
              <div class="info-label">${lbl('トレイ寸法', 'Kích thước khay')}</div>
              <div class="info-value">${e(trayDim)}</div>
            </div>

            <div class="info-item">
              <div class="info-label">${lbl('トレイ重量', 'Khối lượng khay')}</div>
              <div class="info-value">${e(trayWeight)}</div>
            </div>

            <div class="info-item">
              <div class="info-label">${lbl('ポケット数', 'Số pockets')}</div>
              <div class="info-value">${e(pockets)}</div>
            </div>

            <div class="info-item">
              <div class="info-label">${lbl('抜き勾配', 'Góc nghiêng thoát')}</div>
              <div class="info-value">${e(draft)}</div>
            </div>

            <div class="info-item">
              <div class="info-label">${lbl('刻印', 'Chữ khắc')}</div>
              <div class="info-value">${e(engraving)}</div>
            </div>
          </div>
        </div>
      `;
    }


    renderStatusNotesSection(item, type) {
      const isMold = type === 'mold';
      const returning = isMold ? (item?.MoldReturning || item?.Returning) : '';
      const disposing = isMold ? (item?.MoldDisposing || item?.Disposing) : '';
      const moldNotes = isMold ? String(item?.MoldNotes || '').trim() : '';
      
      // Lấy ghi chú mới nhất từ usercomments.csv
      let latestComment = '';
      try {
        const comments = Array.isArray(this.data?.usercomments) ? this.data.usercomments : [];
        const itemId = isMold ? this.normId(item?.MoldID) : this.normId(item?.CutterID || item?.ID);
        const filtered = comments.filter(c => {
          const cid = this.normId(isMold ? c?.MoldID : (c?.CutterID || c?.ID));
          return cid === itemId;
        });
        filtered.sort((a, b) => {
          const ta = Date.parse(a.Timestamp || a.Date || a.CreatedAt || '') || 0;
          const tb = Date.parse(b.Timestamp || b.Date || b.CreatedAt || '') || 0;
          return tb - ta;
        });
        if (filtered[0]) {
          latestComment = String(filtered[0].Comment || filtered[0].Note || filtered[0].Notes || '').trim();
        }
      } catch (e) {}
      
      let html = `<div class="modal-section">
        <div class="section-header color-slate">
          <i class="fas fa-clipboard-list"></i>
          <span>状態・メモ / Trạng thái vật lý & Ghi chú</span>
        </div>`;
      
      if (returning) {
        html += `<div class="info-message" style="background:#fef3c7;border-left:4px solid #f59e0b;padding:10px;margin-bottom:10px;">
          <i class="fas fa-undo" style="color:#f59e0b;margin-right:8px;"></i>
          <strong>返却金型 / Đã trả khuôn:</strong> ${this.escapeHtml(returning)}
        </div>`;
      }
      
      if (disposing) {
        html += `<div class="info-message" style="background:#fee2e2;border-left:4px solid #dc2626;padding:10px;margin-bottom:10px;">
          <i class="fas fa-exclamation-triangle" style="color:#dc2626;margin-right:8px;"></i>
          <strong>廃棄金型 / Đã hủy khuôn:</strong> ${this.escapeHtml(disposing)}
        </div>`;
      }
      
      if (moldNotes) {
        html += `<div class="info-item">
          <div class="info-label">金型メモ / Ghi chú khuôn</div>
          <div class="info-value">${this.escapeHtml(moldNotes)}</div>
        </div>`;
      }
      
      if (latestComment) {
        html += `<div class="info-item">
          <div class="info-label">最新コメント / Ghi chú mới nhất</div>
          <div class="info-value">${this.escapeHtml(latestComment)}</div>
        </div>`;
      }
      
      if (!returning && !disposing && !moldNotes && !latestComment) {
        html += `<div class="no-data">データなし / Không có dữ liệu</div>`;
      }
      
      html += `</div>`;
      return html;
    }


    renderAdditionalDataSection(item, type) {
      if(type === 'mold'){
        const mold = item;
        const design = this.getMoldDesignInfoSafe(mold, 'mold');
        const job = this.getJobInfoSafe(mold, 'mold');

        const drawingNo = this.safeText(
          design?.CustomerDrawingNo || design?.DrawingNo || design?.DrawingNumber || mold?.DrawingNumber,
          '-'
        );

        const deviceCode = this.safeText(
          design?.DeviceCode || design?.MachineCode || mold?.DeviceCode || mold?.MachineCode,
          '-'
        );

        const plug = this.safeText(
          design?.HasPlug || design?.Plug || mold?.Plug,
          '-'
        );

        const dedicatedCutter = this.safeText(
          design?.HasDedicatedCutter || design?.DedicatedCutter || mold?.DedicatedCutter,
          '-'
        );

        const quote = this.safeText(
          design?.Quote || design?.Quotation || mold?.Quote || mold?.Quotation,
          '-'
        );

        const unitPrice = this.safeText(
          design?.UnitPrice || design?.Price || mold?.UnitPrice || mold?.Price,
          '-'
        );

        const boxType = this.safeText(
          design?.BoxType || mold?.BoxType,
          '-'
        );

        const bag = this.safeText(
          design?.Bag || design?.Bagging || mold?.Bag,
          '-'
        );

        const firstDeadline = this.safeText(
          job?.FirstDeliveryDeadline || job?.NewDeadline || job?.DeliveryDeadlineNew || job?.DeliveryDeadline,
          '-'
        );

        const isYes = (v) => {
          const s = (v == null) ? '' : String(v).trim().toLowerCase();
          if(!s || s === '-' ) return false;
          return s === '1' || s === 'yes' || s === 'true' || s.includes('有') || s.includes('あり') || s.includes('○') || s.includes('はい');
        };

        const warnPlug = isYes(plug);
        const warnDedicated = isYes(dedicatedCutter);

        const warnHtml = (warnPlug || warnDedicated) ? `
            <div class="warning-message">
              注意 / chú ý:
              ${warnPlug ? 'プラグあり (có nắp).' : ''}
              ${warnDedicated ? ' 専用抜型あり (có dao cắt riêng).' : ''}
            </div>
        ` : '';

        const addFields = [
          { label: this.biLabel('図面番号', 'Số bản vẽ'), rawValue: drawingNo },
          { label: this.biLabel('設備コード', 'Mã thiết bị'), rawValue: deviceCode },
          { label: this.biLabel('プラグ', 'Plug'), rawValue: plug },
          { label: this.biLabel('専用抜型', 'Dao cắt riêng'), rawValue: dedicatedCutter },
          { label: this.biLabel('見積', 'Báo giá'), rawValue: quote },
          { label: this.biLabel('単価', 'Đơn giá'), rawValue: unitPrice },
          { label: this.biLabel('箱種', 'Loại thùng'), rawValue: boxType },
          { label: this.biLabel('袋', 'Bọc túi'), rawValue: bag },
          { label: this.biLabel('新規納期', 'Hạn giao hàng lần đầu'), rawValue: firstDeadline, full: true },
        ];

        return `
        <div class="modal-section">
          <div class="section-header color-indigo">
            <i class="fas fa-link"></i>
            <span>${this.biLabel('関連情報', 'Thông tin liên quan')}</span>
          </div>

          ${warnHtml}
          ${this.renderInfoGrid(addFields, 'dp-info-rows')}
        </div>
        `;
    }

      const e = (v) => this.escapeHtml(v);
      const design = this.getMoldDesignInfoSafe(item, type);
      const job = this.getJobInfoSafe(item, type);
      const customer = this.getCustomerInfoSafe(item, type, job);
      const company = this.getCompanyInfoSafe(item);

      const designId = item?.MoldDesignID || item?.molddesignid || design?.MoldDesignID || '-';
      const designCode = design?.MoldDesignCode || design?.DesignCode || item?.MoldDesignCode || item?.IDMaKhuonThietKe || '-';
      const jobName = job?.JobName || job?.Name || '-';
      const deadline = job?.DeliveryDeadline || job?.DueDate || '-';
      const orderNo = job?.OrderNumber || job?.JobNumber || '-';
      const customerName = customer?.CustomerShortName || customer?.CustomerName || '-';
      const companyName = company?.CompanyShortName || company?.CompanyName || '-';

      return `
        <div class="modal-section">
          <div class="section-header color-indigo">
            <i class="fas fa-database"></i>
            <span>Dữ liệu bổ sung / 追加データ</span>
          </div>
          <div class="info-grid-2col">
            <div class="info-item">
              <div class="info-label">MoldDesignID</div>
              <div class="info-value">${e(designId)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Mã thiết kế</div>
              <div class="info-value">${e(designCode)}</div>
            </div>
            <div class="info-item full-width">
              <div class="info-label">Khách hàng</div>
              <div class="info-value">${e(customerName)}</div>
            </div>
            <div class="info-item full-width">
              <div class="info-label">Công ty (companies)</div>
              <div class="info-value">${e(companyName)}</div>
            </div>
            <div class="info-item full-width">
              <div class="info-label">Job / Sản phẩm</div>
              <div class="info-value">${e(jobName)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Hạn giao</div>
              <div class="info-value">${e(deadline)}</div>
            </div>
            <div class="info-item">
              <div class="info-label">Số đơn hàng</div>
              <div class="info-value">${e(orderNo)}</div>
            </div>
          </div>
        </div>
      `;
    }

    getCustomerDisplay(item) {
      const customer = item.customerInfo || this.getCustomerInfoSafe(item, 'mold', null);
      const company = item.companyInfo || this.getCompanyFromCustomer(customer);

      const custName = customer?.CustomerShortName || customer?.CustomerName || '';
      const compName = company?.CompanyShortName || company?.CompanyName || '';

      if (custName && compName) return `${custName} (${compName})`;
      if (custName) return custName;
      if (compName) return compName;
      return '-';
    }

    // TAB 2 RELATED (tách module giống tab Ảnh)
    renderRelatedTab() {
      const mod = this.getTabModule('related');
      if (mod && typeof mod.render === 'function') return mod.render(this);

      // Fallback: nếu chưa load module
      return `
        <div class="modal-section">
          <div class="section-header color-slate">
            <i class="fas fa-link"></i>
            <span>Liên quan</span>
          </div>
          <div class="info-message">
            Tab <b>Liên quan</b> đã tách thành module riêng.<br>
            Hãy load file <b>detail-panel-related-tab-v8.4.3.js</b> để dùng chức năng.
          </div>
        </div>
      `;
    }

    // =====================================================================
    // TAB 3: HISTORY
    // =====================================================================

    renderHistoryTab() {
      if (!this.currentItem) return `<p class="no-data">No item selected</p>`;

      // Host để module DeviceHistoryStatus tự render UI đầy đủ
      return `<div class="dp-device-history-host"></div>`;
    }

    getHistoryIcon(type) {
      switch (type) {
        case 'STATUS': return 'fa-clipboard-check';
        case 'LOCATION': return 'fa-map-marker-alt';
        case 'SHIP': return 'fa-truck';
        case 'TEFLON': return 'fa-spray-can';
        default: return 'fa-circle';
      }
    }

    getHistoryTypeLabel(type) {
      switch (type) {
        case 'STATUS': return 'Status / 状態';
        case 'LOCATION': return 'Location / 位置';
        case 'SHIP': return 'Transfer / 搬送';
        case 'TEFLON': return 'Teflon / コート';
        default: return type;
      }
    }


formatHistoryDetail(entry) {
  const e = (v) => this.escapeHtml(v);

  const extras = [];
  try {
    let rack = '';
    const cand = [
      entry?.RackLayerID, entry?.ToRackLayerID, entry?.FromRackLayerID,
      entry?.NewLocation, entry?.OldLocation,
      entry?.To, entry?.From, entry?.Location,
      entry?.NewRackLayerID, entry?.OldRackLayerID
    ];
    for (const c of cand) {
      if (!c) continue;
      const x = this.getRackLayerText({ displayRackLocation: c, RackLayerID: c, location: c });
      if (x) { rack = x; break; }
    }
    if (rack) extras.push(`棚-段 / Giá - Tầng: <b>${e(rack)}</b>`);

    let companyName = '';
    const cId = entry?.CompanyID ?? entry?.StorageCompanyID ?? entry?.StorageCompany ?? entry?.Company;
    if (cId) {
      const list = Array.isArray(this.data?.companies) ? this.data.companies : [];
      const found = list.find(c => String(c?.CompanyID ?? '').trim() === String(cId).trim());
      companyName = found?.CompanyShortName || found?.CompanyName || String(cId).trim();
    }
    if (companyName) extras.push(`会社 / Công ty: <b>${e(companyName)}</b>`);
  } catch (err) {}

  const extraHtml = extras.length ? `<div class="dp-history-extra">${extras.join(' · ')}</div>` : '';

  if (entry.type === 'STATUS') {
    const who = this.getEmployeeName(entry.EmployeeID || entry.Employee || entry.CreatedBy || entry.CreatedByEmployeeID);
    const dest = entry.destinationInfo ? (entry.destinationInfo.DestinationName || entry.destinationInfo.Name || '') : '';
    const note = entry.Note || entry.Notes || '';
    return `
      <div><b>${e(entry.Status || entry.Action || '')}</b> ${dest ? `→ ${e(dest)}` : ''}</div>
      <div style="opacity:.85">${who ? e(who) : ''} ${note ? `- ${e(note)}` : ''}</div>
      ${extraHtml}
    `;
  }

  if (entry.type === 'LOCATION') {
    const from = entry.OldLocation || entry.From || entry.FromRackLayerID || '';
    const to = entry.NewLocation || entry.To || entry.ToRackLayerID || '';
    const who = this.getEmployeeName(entry.EmployeeID || entry.Employee || entry.CreatedBy || entry.CreatedByEmployeeID);
    const note = entry.Note || entry.Notes || '';
    return `
      <div><b>MOVE</b> ${from ? e(from) : ''} ${to ? `→ ${e(to)}` : ''}</div>
      <div style="opacity:.85">${who ? e(who) : ''} ${note ? `- ${e(note)}` : ''}</div>
      ${extraHtml}
    `;
  }

  if (entry.type === 'SHIP') {
    const who = this.getEmployeeName(entry.EmployeeID || entry.Employee || entry.CreatedBy || entry.CreatedByEmployeeID);
    const dest = entry.destinationInfo ? (entry.destinationInfo.DestinationName || entry.destinationInfo.Name || '') : (entry.Destination || entry.DestinationID || '');
    const note = entry.Note || entry.Notes || '';
    return `
      <div><b>SHIP</b> ${dest ? `→ ${e(dest)}` : ''}</div>
      <div style="opacity:.85">${who ? e(who) : ''} ${note ? `- ${e(note)}` : ''}</div>
      ${extraHtml}
    `;
  }

  if (entry.type === 'TEFLON') {
    const who = this.getEmployeeName(entry.EmployeeID || entry.Employee || entry.CreatedBy || entry.CreatedByEmployeeID);
    const status = entry.TeflonStatus || entry.Status || '';
    const note = entry.Note || entry.Notes || '';
    return `
      <div><b>TEFLON</b> ${status ? `- ${e(status)}` : ''}</div>
      <div style="opacity:.85">${who ? e(who) : ''} ${note ? `- ${e(note)}` : ''}</div>
      ${extraHtml}
    `;
  }

  const msg = entry.Title || entry.Action || entry.Status || entry.type || '';
  return `
    <div><b>${e(msg)}</b></div>
    ${extraHtml}
  `;
}

    mergeHistoryTimeline(statusHistory, locationHistory, shipHistory, teflonHistory) {
      const all = [];

      (statusHistory || []).forEach(x => all.push({ ...x, type: 'STATUS' }));
      (locationHistory || []).forEach(x => all.push({ ...x, type: 'LOCATION' }));
      (shipHistory || []).forEach(x => all.push({ ...x, type: 'SHIP' }));
      (teflonHistory || []).forEach(x => all.push({ ...x, type: 'TEFLON' }));

      all.sort((a, b) => {
        const ta = Date.parse(a.timestamp || a.Timestamp || a.Date || a.ShipDate || '') || 0;
        const tb = Date.parse(b.timestamp || b.Timestamp || b.Date || b.ShipDate || '') || 0;
        return tb - ta;
      });

      return all.map(x => {
        const ts = x.timestamp || x.Timestamp || x.Date || x.ShipDate || x.ReceivedDate || x.SentDate || x.RequestedDate || '';
        return { ...x, timestamp: ts };
      });
    }


    // =====================================================================
    // TAB 4: TEFLON
    // =====================================================================

    renderTeflonTab() {
      if (!this.currentItem || this.currentItemType !== 'mold') {
        return `
          <div class="modal-section">
            <div class="section-header"><i class="fas fa-spray-can"></i><span>Teflon / コート</span></div>
            <p class="no-data">Dao cắt không có Teflon / 抜型は対象外</p>
          </div>
        `;
      }

      const moldId = this.currentItem.MoldID;
      const logs = this.getTeflonHistory(moldId);

      if (logs.length === 0) {
        return `
          <div class="modal-section">
            <div class="section-header"><i class="fas fa-spray-can"></i><span>Teflon / コート</span></div>
            <p class="no-data">Không có dữ liệu</p>
          </div>
        `;
      }

      const latest = logs[0];

      let html = `
        <div class="modal-section">
          <div class="section-header"><i class="fas fa-spray-can"></i><span>Xử lý Teflon / コート</span></div>

          <div class="teflon-current" style="margin-bottom:10px">
            <div class="teflon-status-badge ${this.getTeflonStatusClass(latest.TeflonStatus || latest.Status)}">
              ${(this.escapeHtml(latest.TeflonStatus || latest.Status || 'UNKNOWN'))}
            </div>
            <div class="teflon-current-info">
              <div class="teflon-info-row"><span class="label">Requested</span><span class="value">${this.safeText(latest.RequestedDate)}</span></div>
              <div class="teflon-info-row"><span class="label">Sent</span><span class="value">${this.safeText(latest.SentDate)}</span></div>
              <div class="teflon-info-row"><span class="label">Received</span><span class="value">${this.safeText(latest.ReceivedDate)}</span></div>
              <div class="teflon-info-row"><span class="label">Supplier</span><span class="value">${this.safeText(latest.SupplierID || latest.Supplier)}</span></div>
            </div>
          </div>

          <h4 class="subsection-title">Lịch sử (${logs.length}) / 履歴</h4>
          <div class="teflon-log-list">
      `;

      logs.forEach(log => {
        html += `
          <div class="teflon-log-item">
            <div class="teflon-log-header">
              <span class="teflon-log-id">#${this.safeText(log.TeflonLogID || '')}</span>
              <span class="teflon-log-status ${this.getTeflonStatusClass(log.TeflonStatus || log.Status)}">${this.safeText(log.TeflonStatus || log.Status || '')}</span>
            </div>
            <div class="teflon-log-body">
              <div class="log-detail-row"><span class="log-label">Req</span><span class="log-value">${this.safeText(log.RequestedDate)}</span></div>
              <div class="log-detail-row"><span class="log-label">Sent</span><span class="log-value">${this.safeText(log.SentDate)}</span></div>
              <div class="log-detail-row"><span class="log-label">Recv</span><span class="log-value">${this.safeText(log.ReceivedDate)}</span></div>
              <div class="log-detail-row"><span class="log-label">Supplier</span><span class="log-value">${this.safeText(log.SupplierID || log.Supplier)}</span></div>
              ${log.Notes ? `<div class="log-detail-row"><span class="log-label">Note</span><span class="log-value">${this.safeText(log.Notes)}</span></div>` : ''}
            </div>
          </div>
        `;
      });

      html += `</div></div>`;
      return html;
    }

    getTeflonStatusClass(status) {
      const s = (status || '').toString().toLowerCase();
      if (s.includes('sent') || s.includes('送') || s.includes('gửi')) return 'status-out';
      if (s.includes('received') || s.includes('受') || s.includes('nhận')) return 'status-in';
      if (s.includes('request') || s.includes('依頼') || s.includes('yêu')) return 'status-pending';
      return 'status-unknown';
    }

    // =====================================================================
    // TAB 5: STATUS (mold only)
    // =====================================================================

    renderStatusTab() {
      if (!this.currentItem || this.currentItemType !== 'mold') {
        return `
          <div class="modal-section">
            <div class="section-header"><i class="fas fa-clipboard-check"></i><span>Tình trạng / 状態</span></div>
            <p class="no-data">Dao cắt không có tab tình trạng khuôn</p>
          </div>
        `;
      }

      const item = this.currentItem;

      const returning = item.MoldReturning || item.Returning || '';
      const returnedDate = item.MoldReturnedDate || item.ReturnedDate || '';
      const disposing = item.MoldDisposing || item.Disposing || '';
      const disposedDate = item.MoldDisposedDate || item.DisposedDate || '';

      const hasReturning = !!String(returning || '').trim();
      const hasDisposing = !!String(disposing || '').trim();

      let html = `
        <div class="modal-section">
          <div class="section-header"><i class="fas fa-clipboard-check"></i><span>Tình trạng khuôn / 金型状態</span></div>

          <div class="status-section">
            <h4 class="subsection-title"><i class="fas fa-undo"></i> Trả khuôn / 返却</h4>
            <div class="status-content ${hasReturning ? 'status-active' : ''}">
      `;

      if (hasReturning) {
        html += `
          <div class="status-badge-large badge-returning"><i class="fas fa-undo"></i> ${this.safeText(returning)}</div>
          <div class="info-grid-2col">
            <div class="info-item"><div class="info-label">Ghi chú</div><div class="info-value">${this.safeText(returning)}</div></div>
            <div class="info-item"><div class="info-label">Ngày</div><div class="info-value">${this.safeText(returnedDate)}</div></div>
          </div>
        `;
      } else {
        html += `<p class="no-status">Không có / なし</p>`;
      }

      html += `</div></div>`;

      html += `
        <div class="status-section">
          <h4 class="subsection-title"><i class="fas fa-trash-alt"></i> Hủy khuôn / 廃棄</h4>
          <div class="status-content ${hasDisposing ? 'status-active' : ''}">
      `;

      if (hasDisposing) {
        html += `
          <div class="status-badge-large badge-disposing"><i class="fas fa-trash-alt"></i> ${this.safeText(disposing)}</div>
          <div class="info-grid-2col">
            <div class="info-item"><div class="info-label">Ghi chú</div><div class="info-value">${this.safeText(disposing)}</div></div>
            <div class="info-item"><div class="info-label">Ngày</div><div class="info-value">${this.safeText(disposedDate)}</div></div>
          </div>
        `;
      } else {
        html += `<p class="no-status">Không có / なし</p>`;
      }

      html += `</div></div></div>`;

      return html;
    }

    // =====================================================================
    // TAB 6: PHOTOS
    // =====================================================================

    renderPhotosTab() {
      // v8.3.4: Tab Ảnh được tách ra module riêng
      const mod = this.getTabModule('photos');
      if (mod && typeof mod.render === 'function') {
        return mod.render(this);
      }

      // Fallback: vẫn hiển thị 1 khung thông báo (không làm hỏng trang chi tiết)
      return `
        <div class="modal-section">
          <div class="section-header">
            <i class="fas fa-camera"></i>
            <span>Ảnh</span>
          </div>
          <div class="info-message">
            Tab Ảnh đã được tách thành module riêng.
            <br>Hãy load file <b>detail-panel-photos-tab-v8.3.4.js</b> để dùng đầy đủ chức năng.
          </div>
        </div>
      `;
    }

    bindPhotosTab(container) {
      // v8.3.4: Tab Ảnh được tách ra module riêng
      const mod = this.getTabModule('photos');
      if (mod && typeof mod.bind === 'function') {
        try { mod.bind(this, container); } catch (e) { /* ignore */ }
        return;
      }
      // Không có module thì không bind gì
    }

    bindRelatedTabcontainer(container) {
      const mod = this.getTabModule('related');
      if (mod && typeof mod.bind === 'function') {
        try { mod.bind(this, container); } catch (e) { /* ignore */ }
      }
    }

    async loadDevicePhotosIntoHost(host) {
      // v8.3.4: phần load ảnh nằm trong module Photos tab
      const mod = this.getTabModule('photos');
      if (mod && typeof mod.loadIntoHost === 'function') {
        return await mod.loadIntoHost(this, host);
      }
      // fallback: không làm gì
    }

    renderCommentsTab() {
      if (!this.currentItem) return `<p class="no-data">No item selected</p>`;

      const itemId = this.currentItemType === 'mold' ? (this.currentItem.MoldID || '') : (this.currentItem.CutterID || '');
      const itemType = this.currentItemType;

      const comments = this.getComments(itemId, itemType);

      let html = `
        <div class="modal-section">
          <div class="section-header"><i class="fas fa-comments"></i><span>Ghi chú (${comments.length}) / メモ</span></div>
      `;

      if (comments.length === 0) {
        html += `<p class="no-data">Không có ghi chú</p>`;
        html += `</div>`;
        return html;
      }

      html += `<div class="comment-list">`;
      comments.forEach(c => {
        const employee = this.getEmployeeName(c.EmployeeID || c.CreatedByEmployeeID || c.CreatedBy);
        const when = this.formatDate(c.CreatedAt || c.Timestamp || c.Date || '');
        const pr = (c.Priority || '').toString().toLowerCase();
        const cls = pr.includes('high') || pr.includes('urgent') || pr.includes('1') ? 'priority-high' : (pr.includes('medium') || pr.includes('2') ? 'priority-medium' : 'priority-low');
        const text = c.Comment || c.Content || c.Notes || c.Note || '';

        html += `
          <div class="comment-item ${cls}">
            <div class="comment-meta">
              <span class="comment-emp">${this.safeText(employee || '')}</span>
              <span class="comment-time">${this.safeText(when || '')}</span>
            </div>
            <div class="comment-text">${this.safeText(text || '')}</div>
          </div>
        `;
      });
      html += `</div></div>`;

      return html;
    }

    // =====================================================================
    // TAB 8: ANALYTICS
    // =====================================================================

    renderAnalyticsTab() {
      if (!this.currentItem) return `<p class="no-data">No item selected</p>`;

      const itemId = this.currentItemType === 'mold' ? (this.currentItem.MoldID || '') : (this.currentItem.CutterID || '');
      const kind = this.currentItemType;

      const stats = this.calculateItemStats(itemId, kind);

      return `
        <div class="modal-section">
          <div class="section-header"><i class="fas fa-chart-line"></i><span>Thống kê / 統計</span></div>

          <div class="info-grid-2col">
            <div class="info-item"><div class="info-label">Status logs</div><div class="info-value">${this.escapeHtml(String(stats.statusCount))}</div></div>
            <div class="info-item"><div class="info-label">Location logs</div><div class="info-value">${this.escapeHtml(String(stats.locationCount))}</div></div>
            <div class="info-item"><div class="info-label">Transfer logs</div><div class="info-value">${this.escapeHtml(String(stats.shipCount))}</div></div>
            <div class="info-item"><div class="info-label">Comments</div><div class="info-value">${this.escapeHtml(String(stats.commentCount))}</div></div>
            <div class="info-item"><div class="info-label">Teflon logs</div><div class="info-value">${this.escapeHtml(String(stats.teflonCount))}</div></div>
            <div class="info-item"><div class="info-label">Last activity</div><div class="info-value">${this.safeText(this.formatDate(stats.lastActivity || ''))}</div></div>
          </div>

          <div class="info-message" >
            Lưu ý: thống kê này dựa trên các bảng log CSV hiện có (statuslogs/locationlog/shiplog/teflonlog/usercomments).
          </div>
        </div>
      `;
    }

    calculateItemStats(itemId, itemType) {
      const kind = (itemType === 'mold') ? 'MOLD' : 'CUTTER';
      const status = this.getStatusHistory(itemId, kind);
      const loc = this.getLocationHistory(itemId, kind);
      const ship = this.getShipHistory(itemId, kind);
      const teflon = (itemType === 'mold') ? this.getTeflonHistory(itemId) : [];
      const comments = this.getComments(itemId, itemType);

      const times = [];
      [...status, ...loc, ...ship, ...teflon, ...comments].forEach(x => {
        const t = Date.parse(x.timestamp || x.Timestamp || x.CreatedAt || x.Date || x.ShipDate || x.ReceivedDate || x.SentDate || x.RequestedDate || '') || 0;
        if (t) times.push(t);
      });

      const lastActivity = times.length ? new Date(Math.max(...times)).toISOString() : '';

      return {
        statusCount: status.length,
        locationCount: loc.length,
        shipCount: ship.length,
        teflonCount: teflon.length,
        commentCount: comments.length,
        lastActivity
      };
    }

    // =====================================================================
    // TAB 9: EXTENDED (only CSV data)
    // =====================================================================

    renderExtendedTab() {
      if (!this.currentItem) return `<p class="no-data">No item selected</p>`;

      const mold = this.centerMold || (this.currentItemType === 'mold' ? this.currentItem : null);
      if (!mold) {
        return `
          <div class="modal-section">
            <div class="section-header"><i class="fas fa-layer-group"></i><span>Mở rộng / 拡張</span></div>
            <p class="no-data">Không xác định được khuôn trung tâm để hiển thị.</p>
          </div>
        `;
      }

      const design = this.getMoldDesignInfoSafe(mold, 'mold');
      const job = this.getJobInfoSafe(mold, 'mold');
      const proc = job ? this.getProcessingItemSafe(job) : null;
      const customer = this.getCustomerInfoSafe(mold, 'mold', job);
      const company = this.getCompanyInfoSafe(mold) || (customer ? this.getCompanyFromCustomer(customer) : null);
      const cav = this.getCavRowFromDesign(design);

      const storageNow = this.getStorageSummary(mold);
      const transferList = this.getShipHistory(mold.MoldID, 'MOLD');

      let html = `
        <div class="modal-section">
          <div class="section-header"><i class="fas fa-layer-group"></i><span>Mở rộng / 拡張 (chỉ dùng CSV hiện có)</span></div>
          <div class="info-message">
            Tab này tránh trùng nội dung: chỉ hiển thị các phần chuyên sâu dựa trên CSV hiện có (molddesign, customers/companies, jobs/processingitems, racks/racklayers/locationlog, shiplog/destinations).
          </div>
        </div>
      `;

      html += this.renderExtendedDesignSection(mold, design, cav);
      html += this.renderExtendedCustomersSection(mold, customer, company);
      html += this.renderExtendedProductJobSection(mold, job, proc);
      html += this.renderExtendedStorageSection(mold, storageNow);
      html += this.renderExtendedTransferSection(mold, transferList);
      html += this.renderExtendedFutureSection(mold);

      return html;
    }

    renderExtendedDesignSection(mold, design, cavRow) {
      const d = design || {};
      const cav = cavRow || {};

      const moldDesignCode = d.MoldDesignCode || d.DesignCode || mold.MoldDesignCode || '';
      const drawingNo = d.CustomerDrawingNo || d.DrawingNo || d.DrawingNumber || mold.DrawingNumber || '';
      const plasticType = d.DesignForPlasticType || d.Material || '';

      const lwh = this.formatLWH(d.MoldDesignLength, d.MoldDesignWidth, d.MoldDesignHeight);
      const cutline = this.formatLW(d.CutlineX, d.CutlineY) || this.formatLW(mold.CutlineLength, mold.CutlineWidth);

      const pockets = d.PocketCount || d.PocketNumbers || d.PieceCount || '';
      const pitch = d.Pitch || '';
      const weight = d.MoldDesignWeight || d.DesignWeight || '';

      const cavKey = (d.Serial || d.CAV || '').toString().trim();
      const cavSize = (cav.CAVlength && cav.CAVwidth) ? `${cav.CAVlength} x ${cav.CAVwidth}` : '';

      const notes = d.DesignNotes || d.VersionNote || '';

      return `
        <div class="modal-section" id="dp-ext-design">
          <div class="section-header"><i class="fas fa-drafting-compass"></i><span>Thiết kế / 設計</span></div>
          <div class="info-grid-2col">
            <div class="info-item"><div class="info-label">MoldDesign</div><div class="info-value">${this.safeText(moldDesignCode)}</div></div>
            <div class="info-item"><div class="info-label">Drawing</div><div class="info-value">${this.safeText(drawingNo)}</div></div>
            <div class="info-item"><div class="info-label">LxWxH</div><div class="info-value">${this.safeText(lwh)}</div></div>
            <div class="info-item"><div class="info-label">Cutline</div><div class="info-value">${this.safeText(cutline)}</div></div>
            <div class="info-item"><div class="info-label">Plastic</div><div class="info-value">${this.safeText(plasticType)}</div></div>
            <div class="info-item"><div class="info-label">Pockets</div><div class="info-value">${this.safeText(pockets)}</div></div>
            <div class="info-item"><div class="info-label">Pitch</div><div class="info-value">${this.safeText(pitch)}</div></div>
            <div class="info-item"><div class="info-label">Design weight</div><div class="info-value">${this.safeText(weight ? String(weight).includes('kg') ? weight : `${weight} kg` : '')}</div></div>
            <div class="info-item"><div class="info-label">CAV key</div><div class="info-value">${this.safeText(cavKey)}</div></div>
            <div class="info-item"><div class="info-label">CAV size</div><div class="info-value">${this.safeText(cavSize)}</div></div>
            <div class="info-item full-width"><div class="info-label">Notes</div><div class="info-value note-text">${this.safeText(notes, '')}</div></div>
          </div>
          <div class="info-message" >
            Nếu thiếu field, có thể do CSV chưa có cột tương ứng. Tab này sẽ tự mở rộng khi CSV bổ sung.
          </div>
        </div>
      `;
    }

    renderExtendedCustomersSection(mold, customer, company) {
      const c = customer || {};
      const co = company || {};

      const customerName = c.CustomerShortName || c.CustomerName || '';
      const companyName = co.CompanyShortName || co.CompanyName || '';

      return `
        <div class="modal-section" id="dp-ext-customers">
          <div class="section-header"><i class="fas fa-building"></i><span>Khách hàng / 顧客</span></div>
          <div class="info-grid-2col">
            <div class="info-item full-width"><div class="info-label">Customer</div><div class="info-value">${this.safeText(customerName)}</div></div>
            <div class="info-item full-width"><div class="info-label">Company</div><div class="info-value">${this.safeText(companyName)}</div></div>
            <div class="info-item"><div class="info-label">CustomerID</div><div class="info-value">${this.safeText(c.CustomerID)}</div></div>
            <div class="info-item"><div class="info-label">CompanyID</div><div class="info-value">${this.safeText(c.CompanyID || co.CompanyID)}</div></div>
          </div>
          <div class="info-message" >
            (Phát triển sau) Danh sách khách đã từng đặt hàng bằng khuôn này sẽ cần các bảng order/production trong dự án tổng thể.
          </div>
          <div class="dp-actions-grid" >
            <button class="dp-action-btn" type="button" data-module-open="customers"><i class="fas fa-external-link-alt"></i><span>Open<br><span class="sub">Module KH</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="custody"><i class="fas fa-file-signature"></i><span>Custody<br><span class="sub">Lưu giữ</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="orders"><i class="fas fa-shopping-cart"></i><span>Orders<br><span class="sub">Đơn hàng</span></span></button>
          </div>
        </div>
      `;
    }

    renderExtendedProductJobSection(mold, job, processingItem) {
      const j = job || {};
      const p = processingItem || {};

      const jobName = j.JobName || j.Name || '';
      const orderNo = j.OrderNumber || j.JobNumber || '';
      const deadline = j.DeliveryDeadline || j.DueDate || '';
      const material = j.Material || j.PlasticType || '';
      const trayInfo = j.TrayInfo || j.TrayName || '';

      const procName = p.ProcessingItemName || p.Name || '';

      return `
        <div class="modal-section" id="dp-ext-product">
          <div class="section-header"><i class="fas fa-box"></i><span>Sản phẩm / Job / 製品</span></div>
          <div class="info-grid-2col">
            <div class="info-item full-width"><div class="info-label">Job</div><div class="info-value">${this.safeText(jobName)}</div></div>
            <div class="info-item"><div class="info-label">Order</div><div class="info-value">${this.safeText(orderNo)}</div></div>
            <div class="info-item"><div class="info-label">Deadline</div><div class="info-value">${this.safeText(deadline)}</div></div>
            <div class="info-item"><div class="info-label">Material</div><div class="info-value">${this.safeText(material)}</div></div>
            <div class="info-item"><div class="info-label">Tray info</div><div class="info-value">${this.safeText(trayInfo)}</div></div>
            <div class="info-item"><div class="info-label">Processing</div><div class="info-value">${this.safeText(procName)}</div></div>
          </div>
          <div class="info-message" >
            (Phát triển sau) Lịch sử sản xuất chi tiết sẽ cần bảng production_logs trong dự án tổng thể.
          </div>
          <div class="dp-actions-grid" >
            <button class="dp-action-btn" type="button" data-module-open="production-history"><i class="fas fa-industry"></i><span>Prod<br><span class="sub">History</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="plastic-usage"><i class="fas fa-water"></i><span>Plastic<br><span class="sub">Usage</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="consumables"><i class="fas fa-boxes"></i><span>Consum.<br><span class="sub">Tiêu hao</span></span></button>
          </div>
        </div>
      `;
    }

    renderExtendedStorageSection(mold, storageSummary) {
      const s = storageSummary || {};
      const locationHistory = this.getLocationHistory(mold.MoldID, 'MOLD').slice(0, 20);

      let historyHtml = '';
      if (!locationHistory.length) {
        historyHtml = `<p class="no-data">Không có lịch sử vị trí</p>`;
      } else {
        historyHtml = `<div class="history-timeline">`;
        locationHistory.forEach(x => {
          historyHtml += `
            <div class="timeline-item" data-type="LOCATION">
              <div class="timeline-icon"><i class="fas fa-map-marker-alt"></i></div>
              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="timeline-type">Location</span>
                  <span class="timeline-date">${this.escapeHtml(this.formatDate(x.timestamp || x.Timestamp || x.Date || ''))}</span>
                </div>
                <div class="timeline-body">${this.escapeHtml((x.OldLocation || x.From || '-') + ' → ' + (x.NewLocation || x.To || x.RackLayerID || '-'))}</div>
              </div>
            </div>
          `;
        });
        historyHtml += `</div>`;
      }

      return `
        <div class="modal-section" id="dp-ext-storage">
          <div class="section-header"><i class="fas fa-warehouse"></i><span>Kho & vị trí / 保管</span></div>
          <div class="info-grid-2col">
            <div class="info-item"><div class="info-label">Rack</div><div class="info-value">${this.safeText(s.rackId)}</div></div>
            <div class="info-item"><div class="info-label">Layer</div><div class="info-value">${this.safeText(s.layerNum)}</div></div>
            <div class="info-item full-width"><div class="info-label">Rack location</div><div class="info-value">${this.safeText(s.rackLocation)}</div></div>
            <div class="info-item full-width"><div class="info-label">Storage company</div><div class="info-value">${this.safeText(s.storageCompany)}</div></div>
          </div>

          <h4 class="subsection-title" >Lịch sử vị trí (mới nhất 20)</h4>
          ${historyHtml}

          <div class="dp-actions-grid" >
            <button class="dp-action-btn" type="button" data-action="move"><i class="fas fa-map-signs"></i><span>Move<br><span class="sub">Di chuyển</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="storage"><i class="fas fa-external-link-alt"></i><span>Open<br><span class="sub">Module kho</span></span></button>
            <button class="dp-action-btn" type="button" data-action="inventory"><i class="fas fa-clipboard-check"></i><span>棚卸<br><span class="sub">Kiểm kê</span></span></button>
          </div>
        </div>
      `;
    }

    renderExtendedTransferSection(mold, shipHistory) {
      const list = (shipHistory || []).slice(0, 30);

      let rows = '';
      if (!list.length) {
        rows = `<p class="no-data">Không có dữ liệu vận chuyển</p>`;
      } else {
        rows = `<div class="history-timeline">`;
        list.forEach(x => {
          const dest = this.getDestinationName(x.DestinationID) || x.Destination || '';
          const when = this.formatDate(x.timestamp || x.Timestamp || x.ShipDate || x.Date || '');
          const note = x.Note || x.Notes || '';
          rows += `
            <div class="timeline-item" data-type="SHIP">
              <div class="timeline-icon"><i class="fas fa-truck"></i></div>
              <div class="timeline-content">
                <div class="timeline-header">
                  <span class="timeline-type">Transfer</span>
                  <span class="timeline-date">${this.escapeHtml(when)}</span>
                </div>
                <div class="timeline-body"><b>${this.escapeHtml(dest || '-')}</b>${note ? ` - ${this.escapeHtml(note)}` : ''}</div>
              </div>
            </div>
          `;
        });
        rows += `</div>`;
      }

      return `
        <div class="modal-section" id="dp-ext-transfer">
          <div class="section-header"><i class="fas fa-truck"></i><span>Vận chuyển / 搬送</span></div>
          <div class="info-message">
            Dữ liệu lấy từ shiplog.csv + destinations.csv.
          </div>
          <h4 class="subsection-title" >Lịch sử vận chuyển (mới nhất 30)</h4>
          ${rows}

          <div class="dp-actions-grid" >
            <button class="dp-action-btn" type="button" data-module-open="transfer"><i class="fas fa-external-link-alt"></i><span>Open<br><span class="sub">Module</span></span></button>
            <button class="dp-action-btn" type="button" data-action="print"><i class="fas fa-print"></i><span>印刷<br><span class="sub">In</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="shipping-new"><i class="fas fa-plus"></i><span>New<br><span class="sub">Record</span></span></button>
          </div>
        </div>
      `;
    }

    renderExtendedFutureSection(mold) {
      return `
        <div class="modal-section">
          <div class="section-header"><i class="fas fa-hourglass-half"></i><span>Phát triển sau / 今後</span></div>
          <div class="info-message">
            Các phần sau chưa có bảng CSV trong hệ hiện tại nên hiện để "khung tích hợp":
            Production logs, Plastic usage, Consumables usage, Maintenance/Modification, Documents, Custody certificate, Shaping conditions...
          </div>
          <div class="dp-actions-grid" >
            <button class="dp-action-btn" type="button" data-module-open="production-logs"><i class="fas fa-industry"></i><span>Prod logs<br><span class="sub">(future)</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="maintenance"><i class="fas fa-tools"></i><span>Maintenance<br><span class="sub">(future)</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="documents"><i class="fas fa-file-alt"></i><span>Documents<br><span class="sub">(future)</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="custody"><i class="fas fa-file-signature"></i><span>Custody<br><span class="sub">(future)</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="shaping"><i class="fas fa-sliders-h"></i><span>Shaping<br><span class="sub">(future)</span></span></button>
            <button class="dp-action-btn" type="button" data-module-open="materials"><i class="fas fa-industry"></i><span>Materials<br><span class="sub">(future)</span></span></button>
          </div>
        </div>
      `;
    }

    // =====================================================================
    // DATA HELPERS
    // =====================================================================

    getMoldDesignInfoSafe(item, type) {
      try {
        if (!item) return null;
        if (item?.designInfo) return item.designInfo;
        if (!Array.isArray(this.data?.molddesign)) return null;

        const idCandidates = [];
        const rawIdFields = [
          item?.MoldDesignID, item?.MoldDesignId, item?.molddesignid, item?.DesignID
        ];
        for (const v of rawIdFields) idCandidates.push(...this.parseIdList(v));

        const idList = Array.from(new Set(idCandidates.map(x => this.normId(x)).filter(Boolean)));
        const data = this.data.molddesign;

        for (const id of idList) {
          const found = data.find(d => {
            const a = this.normId(d?.MoldDesignID);
            const b = this.normId(d?.DesignID);
            const c = this.normId(d?.molddesignid);
            return (a && a === id) || (b && b === id) || (c && c === id);
          });
          if (found) return found;
        }

        const codeCandidates = [
          item?.MoldDesignCode, item?.IDMaKhuonThietKe, item?.DesignCode
        ].map(x => this.normId(x)).filter(Boolean);

        for (const code of codeCandidates) {
          const found = data.find(d => {
            const a = this.normId(d?.MoldDesignCode);
            const b = this.normId(d?.DesignCode);
            return (a && a === code) || (b && b === code);
          });
          if (found) return found;
        }

        return null;
      } catch (e) {
        return null;
      }
    }


    getJobInfoSafe(item, type) {
      try {
        if (!item) return null;
        if (item?.jobInfo) return item.jobInfo;
        if (!Array.isArray(this.data?.jobs)) return null;

        const jobs = this.data.jobs;

        const jobId = this.normId(item?.JobID ?? item?.jobId ?? item?.JobId);
        if (jobId) {
          const byId = jobs.find(j => this.normId(j?.JobID) === jobId);
          if (byId) return byId;
        }

        const moldId = this.normId(item?.MoldID ?? item?.MoldId ?? item?.moldId);
        const moldCode = this.normId(item?.MoldCode);
        const designIdsRaw = []
          .concat(this.parseIdList(item?.MoldDesignID))
          .concat(this.parseIdList(item?.MoldDesignId))
          .concat(this.parseIdList(item?.molddesignid))
          .concat(this.parseIdList(item?.DesignID));

        const designIds = new Set(designIdsRaw.map(x => this.normId(x)).filter(Boolean));

        const candidates = jobs.filter(j => {
          const jm = this.normId(j?.MoldID ?? j?.MoldId);
          const jc = this.normId(j?.MoldCode ?? j?.MoldNo ?? j?.Mold);
          const jd = this.normId(j?.MoldDesignID ?? j?.DesignID ?? j?.MoldDesignId);

          if (moldId && jm && jm === moldId) return true;
          if (moldCode && jc && jc === moldCode) return true;
          if (designIds.size && jd && designIds.has(jd)) return true;
          return false;
        });

        if (!candidates.length) return null;

        const pickTs = (j) => Date.parse(j?.DeliveryDeadline ?? j?.DueDate ?? '') || Infinity;
        candidates.sort((a, b) => pickTs(a) - pickTs(b));
        return candidates[0] || null;
      } catch (e) {
        return null;
      }
    }



    getProcessingItemSafe(job) {
      if (!job || !this.data?.processingitems) return null;
      const procId = job.ProcessingItemID || job.processingItemId;
      if (!procId) return null;
      return this.data.processingitems.find(p => String(p.ProcessingItemID || '').trim() === String(procId).trim()) || null;
    }

    getCustomerInfoSafe(item, type, job) {
      if (item?.customerInfo) return item.customerInfo;
      if (!this.data?.customers) return null;
      const customerId = item?.CustomerID || job?.CustomerID || item?.customerId;
      if (!customerId) return null;
      return this.data.customers.find(c => String(c.CustomerID || '').trim() === String(customerId).trim()) || null;
    }

    getCompanyInfoSafe(item) {
      if (!this.data?.companies) return null;
      const companyId = item?.storage_company || item?.storageCompany || item?.CompanyID || item?.companyId;
      if (!companyId) return null;
      return this.data.companies.find(c => String(c.CompanyID || '').trim() === String(companyId).trim()) || null;
    }

    getCompanyFromCustomer(customer) {
      if (!customer || !this.data?.companies) return null;
      const companyId = customer.CompanyID;
      if (!companyId) return null;
      return this.data.companies.find(c => String(c.CompanyID || '').trim() === String(companyId).trim()) || null;
    }

    getCavRowFromDesign(design) {
      if (!design || !this.data?.CAV) return null;
      const key = (design.Serial || design.CAV || '').toString().trim();
      if (!key) return null;
      return this.data.CAV.find(r => (r.Serial || r.CAV || '').toString().trim() === key) || null;
    }

    getStorageSummary(mold) {
      const rackLayerInfo = mold.rackLayerInfo || {};
      const rackInfo = mold.rackInfo || {};
      const companyInfo = this.getStorageCompanyInfo(mold);

      return {
        rackId: rackInfo.RackID || rackLayerInfo.RackID || '-',
        layerNum: rackLayerInfo.RackLayerNumber || '-',
        rackLocation: rackInfo.RackLocation || mold.displayRackLocation || '-',
        storageCompany: companyInfo.nameShort || '-'
      };
    }

    getStatusHistory(itemId, kind) {
      const logs = this.data.statuslogs || [];
      const filtered = logs.filter(log => {
        if (kind === 'MOLD') return String(log.MoldID || '').trim() === String(itemId || '').trim();
        if (kind === 'CUTTER') return String(log.CutterID || '').trim() === String(itemId || '').trim();
        return false;
      });
      filtered.sort((a, b) => {
        const ta = Date.parse(a.Timestamp || '') || 0;
        const tb = Date.parse(b.Timestamp || '') || 0;
        return tb - ta;
      });
      return filtered.map(x => ({ ...x, timestamp: x.Timestamp }));
    }

    getLatestStatusLog(kind, itemId) {
      const logs = this.getStatusHistory(itemId, kind);
      return logs[0] || null;
    }

    getLocationHistory(itemId, kind) {
      const logs = this.data.locationlog || [];
      const filtered = logs.filter(log => {
        if (kind === 'MOLD') return String(log.MoldID || '').trim() === String(itemId || '').trim();
        if (kind === 'CUTTER') return String(log.CutterID || '').trim() === String(itemId || '').trim();
        return false;
      });
      filtered.sort((a, b) => {
        const ta = Date.parse(a.Timestamp || a.Date || '') || 0;
        const tb = Date.parse(b.Timestamp || b.Date || '') || 0;
        return tb - ta;
      });
      return filtered.map(x => ({ ...x, timestamp: x.Timestamp || x.Date }));
    }

    getLatestLocationLog(kind, itemId) {
      const logs = this.getLocationHistory(itemId, kind);
      return logs[0] || null;
    }

    getShipHistory(itemId, kind) {
      const logs = this.data.shiplog || [];
      const filtered = logs.filter(log => {
        if (kind === 'MOLD') return String(log.MoldID || '').trim() === String(itemId || '').trim();
        if (kind === 'CUTTER') return String(log.CutterID || '').trim() === String(itemId || '').trim();
        return false;
      });
      filtered.sort((a, b) => {
        const ta = Date.parse(a.Timestamp || a.ShipDate || a.Date || '') || 0;
        const tb = Date.parse(b.Timestamp || b.ShipDate || b.Date || '') || 0;
        return tb - ta;
      });
      return filtered.map(x => ({ ...x, timestamp: x.Timestamp || x.ShipDate || x.Date }));
    }

    getLatestShipLog(kind, itemId) {
      const logs = this.getShipHistory(itemId, kind);
      return logs[0] || null;
    }

    getTeflonHistory(moldId) {
      const logs = this.data.teflonlog || [];
      const filtered = logs.filter(log => String(log.MoldID || '').trim() === String(moldId || '').trim());
      filtered.sort((a, b) => {
        const ta = Date.parse(a.ReceivedDate || a.SentDate || a.RequestedDate || a.UpdatedDate || a.CreatedDate || '') || 0;
        const tb = Date.parse(b.ReceivedDate || b.SentDate || b.RequestedDate || b.UpdatedDate || b.CreatedDate || '') || 0;
        return tb - ta;
      });
      return filtered.map(x => ({ ...x, timestamp: x.ReceivedDate || x.SentDate || x.RequestedDate }));
    }

    getComments(itemId, itemType) {
      const comments = this.data.usercomments || [];
      const filtered = comments.filter(c => {
        if (itemType === 'mold') return String(c.MoldID || '').trim() === String(itemId || '').trim();
        if (itemType === 'cutter') return String(c.CutterID || '').trim() === String(itemId || '').trim();
        return false;
      });
      filtered.sort((a, b) => {
        const ta = Date.parse(a.CreatedAt || a.Timestamp || a.Date || '') || 0;
        const tb = Date.parse(b.CreatedAt || b.Timestamp || b.Date || '') || 0;
        return tb - ta;
      });
      return filtered;
    }

    getEmployeeName(employeeId) {
      if (!employeeId) return '';
      const emp = (this.data.employees || []).find(e => String(e.EmployeeID || '').trim() === String(employeeId).trim());
      return emp ? (emp.EmployeeName || emp.Name || '') : '';
    }

    getDestinationName(destinationId) {
      if (!destinationId) return '';
      const dest = (this.data.destinations || []).find(d => String(d.DestinationID || '').trim() === String(destinationId).trim());
      return dest ? (dest.DestinationName || dest.Name || '') : '';
    }

    
  }

  // Simple global quick viewer (mở ảnh thật dạng overlay)
  (function () {
    if (window.MCSQuickPhotoViewer && typeof window.MCSQuickPhotoViewer.open === 'function') return;

    function ensureStyle() {
      if (document.getElementById('mcs-qv-style')) return;
      const st = document.createElement('style');
      st.id = 'mcs-qv-style';
      st.textContent = `
        .mcs-qv-backdrop{position:fixed;inset:0;background:rgba(15,23,42,.62);z-index:120000;display:none;align-items:center;justify-content:center;padding:18px;box-sizing:border-box;}
        .mcs-qv{width:min(1200px,96vw);height:min(86vh,860px);background:rgba(255,255,255,.98);border-radius:16px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.25);border:1px solid rgba(0,0,0,.12);display:flex;flex-direction:column;}
        .mcs-qv-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 12px;border-bottom:1px solid rgba(2,6,23,.08);}
        .mcs-qv-title{font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
        .mcs-qv-btn{height:34px;padding:0 12px;border-radius:10px;border:1px solid rgba(2,6,23,.12);background:#fff;cursor:pointer;font-weight:800;}
        .mcs-qv-body{flex:1 1 auto;position:relative;background:#0b1220;display:flex;align-items:center;justify-content:center;min-height:0;min-width:0;overflow:hidden;}
        .mcs-qv-img{width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;display:none;}
        .mcs-qv-spin{position:absolute;color:#e2e8f0;font-weight:800;opacity:.9}
        .mcs-qv-note{position:absolute;bottom:10px;left:12px;right:12px;color:#cbd5e1;font-size:12px;opacity:.9}
      `;
      document.head.appendChild(st);
    }

    function ensureDom() {
      ensureStyle();
      let bd = document.querySelector('.mcs-qv-backdrop');
      if (bd) return bd;

      bd = document.createElement('div');
      bd.className = 'mcs-qv-backdrop';
      bd.innerHTML = `
        <div class="mcs-qv" role="dialog" aria-modal="true">
          <div class="mcs-qv-h">
            <div class="mcs-qv-title">Photo</div>
            <div style="display:flex;gap:8px;align-items:center">
              <a class="mcs-qv-btn" data-mcs-qv-download href="#" target="_blank" rel="noopener" style="text-decoration:none;display:inline-flex;align-items:center">Open</a>
              <button class="mcs-qv-btn" data-mcs-qv-close type="button">Close</button>
            </div>
          </div>
          <div class="mcs-qv-body">
            <div class="mcs-qv-spin">Loading...</div>
            <img class="mcs-qv-img" alt="photo"/>
            <div class="mcs-qv-note">ESC để đóng • Click nền đen để đóng</div>
          </div>
        </div>
      `;

      bd.addEventListener('click', (e) => {
        if (e.target === bd) close();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
      });

      bd.querySelector('[data-mcs-qv-close]').addEventListener('click', close);

      document.body.appendChild(bd);
      return bd;
    }

    function open(opts) {
      const o = opts || {};
      const url = String(o.url || '').trim();
      if (!url) return;

      const bd = ensureDom();
      const title = bd.querySelector('.mcs-qv-title');
      const img = bd.querySelector('.mcs-qv-img');
      const spin = bd.querySelector('.mcs-qv-spin');
      const dl = bd.querySelector('[data-mcs-qv-download]');

      title.textContent = String(o.title || 'Photo');
      dl.href = url;

      spin.style.display = 'block';
      img.style.display = 'none';

      img.onload = function () {
        spin.style.display = 'none';
        img.style.display = 'block';
      };
      img.onerror = function () {
        spin.textContent = 'Failed to load image';
        img.style.display = 'none';
      };

      bd.style.display = 'flex';
      img.src = url;
    }

    function close() {
      const bd = document.querySelector('.mcs-qv-backdrop');
      if (!bd) return;
      bd.style.display = 'none';
      const img = bd.querySelector('.mcs-qv-img');
      const spin = bd.querySelector('.mcs-qv-spin');
      if (img) { try { img.removeAttribute('src'); } catch (e) {} img.style.display = 'none'; }
      if (spin) { spin.textContent = 'Loading...'; spin.style.display = 'block'; }
    }

    window.MCSQuickPhotoViewer = { open, close };
  })();

  // =====================================================================
  // EXPORT
  // =====================================================================

  // Initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const instance = new DetailPanel('detailPanel');
      window.DetailPanel = instance;   // ✅ Viết hoa (class name)
      window.detailPanel = instance;   // ✅ Viết thường (instance name)
    });
  } else {
    const instance = new DetailPanel('detailPanel');
    window.DetailPanel = instance;
    window.detailPanel = instance;
  }

})();

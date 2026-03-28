/* ============================================================
   PHOTO MANAGER v8.5.17
   Module quản lý ảnh tổng thể – full screen
   Depends on:
     - photo-manager-v8.4.3.css
     - device-photo-store-v8.4.3.js  (window.DevicePhotoStore)
     - photo-upload-v8.4.3.js        (window.PhotoUpload)
   Exposes: window.PhotoManager
   Fixed: 2026-03-27 (Shift+Click, Optimistic Delete)
   ============================================================ */
(function (global) {
  'use strict';

  /* ──────────────────────────────────────────────────────────
     HTML TEMPLATE
  ────────────────────────────────────────────────────────── */
  var TMPL = [
    /* ── Main Overlay ── */
    '<div class="pm-overlay pm-hidden" id="pmOverlay">',
    '<div class="pm-container" id="pmContainer">',

    /* Header */
    '<div class="pm-header">',
    '  <div class="pm-header-title">',
    '    <button class="pm-hamburger-btn" id="pmHamburgerBtn"><i class="fas fa-bars"></i></button>',
    '    <div class="pm-header-icon"><i class="fas fa-photo-video"></i></div>',
    '    <div class="pm-header-text">',
    '      <span class="pm-ja">フォトマネージャー</span>',
    '      <span class="pm-vi">Quản lý ảnh</span>',
    '    </div>',
    '    <div class="pm-active-filter-badge pm-hidden" id="pmFilterBadge">',
    '      <i class="fas fa-filter"></i><span id="pmFilterBadgeText"></span>',
    '      <button id="pmClearFilterBtn" title="Xóa bộ lọc"><i class="fas fa-times"></i></button>',
    '    </div>',
    '  </div>',
    '  <div class="pm-header-actions">',
    '    <button class="pm-close-btn" id="pmCloseBtn" title="Đóng"><i class="fas fa-times"></i></button>',
    '  </div>',
    '</div>',

    /* Toolbar */
    '<div class="pm-toolbar" id="pmToolbar">',
    '  <div class="pm-search-wrap">',
    '    <i class="fas fa-search"></i>',
    '    <input type="text" class="pm-search-input" id="pmSearchInput" placeholder="ファイル名・機器コード検索 / Tìm theo tên file, mã khuôn...">',
    '  </div>',
    '  <div class="pm-filter-chips" id="pmFilterChips">',
    '    <button class="pm-filter-chip pm-active" data-state="all"><i class="fas fa-globe"></i> 全て / Tất cả</button>',
    '    <button class="pm-filter-chip pm-chip-blue" data-state="active"><i class="fas fa-check-circle"></i> 連携済 / Đã liên kết</button>',
    '    <button class="pm-filter-chip pm-chip-amber" data-state="inbox"><i class="fas fa-question-circle"></i> 未連携 / Chưa liên kết</button>',
    '    <button class="pm-filter-chip pm-chip-red" data-state="trash"><i class="fas fa-trash"></i> ゴミ箱 / Thùng rác</button>',
    '    <button class="pm-filter-chip pm-chip-teal" data-state="thumbnail"><i class="fas fa-star"></i> サムネイル / Đại diện</button>',
    '  </div>',
    '  <div class="pm-toolbar-spacer"></div>',
    '  <select class="pm-sort-select" id="pmSortSelect">',
    '    <option value="created_at-desc">日付 新しい順 / Mới nhất</option>',
    '    <option value="created_at-asc">日付 古い順 / Cũ nhất</option>',
    '    <option value="original_filename-asc">ファイル名 A-Z</option>',
    '    <option value="original_filename-desc">ファイル名 Z-A</option>',
    '    <option value="file_size-desc">サイズ 大 / Lớn nhất</option>',
    '    <option value="file_size-asc">サイズ 小 / Nhỏ nhất</option>',
    '  </select>',
    '  <div class="pm-view-switcher">',
    '    <button class="pm-view-btn" data-view="icon-large" title="Icon lớn"><i class="fas fa-th-large"></i></button>',
    '    <button class="pm-view-btn pm-active" data-view="icon-small" title="Icon nhỏ"><i class="fas fa-th"></i></button>',
    '    <button class="pm-view-btn" data-view="detail" title="Chi tiết"><i class="fas fa-list"></i></button>',
    '  </div>',
    '  <button class="pm-btn-bilingual pm-btn-neutral" id="pmEnableSelectModeBtn" title="選択 / Chọn ảnh" style="background:var(--pm-bg);color:var(--pm-text);border:1px solid var(--pm-border);white-space:nowrap;"><i class="far fa-check-square"></i> <div class="pm-btn-text"><span class="pm-btn-ja" style="font-weight:700">選択</span><span class="pm-btn-vi">Chọn</span></div></button>',
    '  <button class="pm-btn-bilingual pm-btn-primary" id="pmRefreshBtn" title="Tải lại"><i class="fas fa-sync-alt"></i> <div class="pm-btn-text"><span class="pm-btn-ja">更新</span><span class="pm-btn-vi">Tải lại</span></div></button>',
    '  <button class="pm-btn-bilingual pm-btn-primary" id="pmGenThumbBtn" title="サムネ作成 / Tạo thumbnail"><i class="fas fa-magic"></i> <div class="pm-btn-text"><span class="pm-btn-ja">サムネ作成</span><span class="pm-btn-vi">Tạo thumb</span></div></button>',
    '  <button class="pm-btn-bilingual pm-btn-danger" id="pmEmptyTrashTopBtn" title="ゴミ箱を空にする / Xóa toàn bộ ảnh trong thùng rác"  style="display:none;"><i class="fas fa-trash-alt"></i> <div class="pm-btn-text"><span class="pm-btn-ja">ゴミ箱を空に</span><span class="pm-btn-vi">Dọn rác</span></div></button>',
    '  <button class="pm-btn-bilingual pm-btn-primary" id="pmUploadBtn"><i class="fas fa-cloud-upload-alt"></i> <div class="pm-btn-text"><span class="pm-btn-ja">アップロード</span><span class="pm-btn-vi">Tải lên</span></div></button>',
    '</div>',

    /* Status bar */
    '<div class="pm-statusbar" id="pmStatusBar">',
    '  <div class="pm-statusbar-item"><i class="fas fa-images"></i><span class="pm-statusbar-count" id="pmTotalCount">0</span> 件</div>',
    '  <div class="pm-statusbar-sep">·</div>',
    '  <div class="pm-statusbar-item" id="pmDeviceInfo"></div>',
    '  <div class="pm-storage-bar-wrap" style="margin-left:auto">',
    '    <span class="pm-storage-text" id="pmStorageText">-</span>',
    '    <div class="pm-storage-bar"><div class="pm-storage-bar-fill" id="pmStorageBarFill" style="width:0%"></div></div>',
    '    <button style="background:none;border:none;cursor:pointer;font-size:11px;color:var(--pm-text-sub);" id="pmStorageBtn" title="管理 / Quản lý dung lượng"><i class="fas fa-hdd"></i></button>',
    '  </div>',
    '</div>',

    /* Selection bar */
    '<div class="pm-selection-bar" id="pmSelectionBar">',
    '  <span class="pm-selection-count" id="pmSelCount">0 件選択</span>',
    '  <button class="pm-sel-btn pm-chip-blue" id="pmSelDownload" style="background:#3b82f6;color:#fff;border-color:#3b82f6;"><i class="fas fa-download"></i> ダウンロード</button>',
    '  <button class="pm-sel-btn pm-chip-teal" id="pmSelSetThumb"><i class="fas fa-star"></i> サムネイル設定</button>',
    '  <button class="pm-sel-btn" id="pmSelTransfer"><i class="fas fa-exchange-alt"></i> 移動</button>',
    '  <button class="pm-sel-btn pm-sel-danger" id="pmSelTrash"><i class="fas fa-trash"></i> ゴミ箱へ</button>',
    '  <button class="pm-sel-btn pm-sel-danger" id="pmSelDelete"><i class="fas fa-times"></i> 完全削除</button>',
    '  <button class="pm-sel-btn pm-sel-cancel" id="pmSelCancel"><i class="fas fa-times-circle"></i> キャンセル</button>',
    '</div>',

    /* Body */
    '<div class="pm-body" id="pmBody">',

    /* Left Nav */
    '<div class="pm-nav-backdrop" id="pmNavBackdrop"></div>',
    '<nav class="pm-leftnav" id="pmLeftNav">',
    '  <div class="pm-leftnav-section">',
    '    <div class="pm-leftnav-title">フォルダ / Thư mục</div>',
    '    <button class="pm-leftnav-item pm-active" data-nav="all"><i class="fas fa-photo-video"></i> 全ての写真<span class="pm-count" id="pmNavCountAll">0</span></button>',
    '    <button class="pm-leftnav-item" data-nav="molds"><i class="fas fa-microchip"></i> 金型 / Khuôn<span class="pm-count" id="pmNavCountMold">0</span></button>',
    '    <button class="pm-leftnav-item" data-nav="cutters"><i class="fas fa-cut"></i> カッター / Dao cắt<span class="pm-count" id="pmNavCountCutter">0</span></button>',
    '    <button class="pm-leftnav-item" data-nav="racks"><i class="fas fa-layer-group"></i> ラック / Giá để khuôn<span class="pm-count" id="pmNavCountRack">0</span></button>',
    '    <button class="pm-leftnav-item" data-nav="trays"><i class="fas fa-box"></i> トレイ / Khay<span class="pm-count" id="pmNavCountTray">0</span></button>',
    '  </div>',
    '  <div class="pm-leftnav-section">',
    '    <div class="pm-leftnav-title">フィルター / Lọc</div>',
    '    <button class="pm-leftnav-item" data-nav="thumbnails"><i class="fas fa-star" style="color:var(--pm-teal)"></i> サムネイルのみ<span class="pm-count" id="pmNavCountThumb">0</span></button>',
    '    <button class="pm-leftnav-item" data-nav="trash"><i class="fas fa-trash" style="color:var(--pm-red)"></i> ゴミ箱<span class="pm-count" id="pmNavCountTrash">0</span></button>',
    '  </div>',
    '</nav>',

    /* Content */
    '<div class="pm-content" id="pmContent">',
    '  <div class="pm-loading pm-hidden" id="pmLoading"><i class="fas fa-spinner fa-spin"></i> 読み込み中... / Đang tải...</div>',
    '  <div class="pm-empty pm-hidden" id="pmEmpty"><i class="fas fa-images"></i><span class="pm-ja">写真がありません</span><span class="pm-vi">Chưa có ảnh nào</span></div>',
    '  <div class="pm-grid pm-view-icon-large pm-hidden" id="pmGridLarge"></div>',
    '  <div class="pm-grid pm-view-icon-small pm-hidden" id="pmGridSmall"></div>',
    '  <div class="pm-detail-view pm-hidden" id="pmDetailView">',
    '    <table class="pm-detail-table">',
    '      <thead><tr>',
    '        <th style="width:44px"></th>',
    '        <th data-col="devicelabel">機器 / Thiết bị</th>',
    '        <th data-col="device_type">タイプ / Loại</th>',    
    '        <th data-col="file_size">サイズ</th>',
    '        <th data-col="created_at">日付 / Ngày</th>',
    '        <th data-col="state">状態 / Trạng thái</th>',
    '        <th data-col="original_filename">ファイル名 / Tên file</th>',
    '      </tr></thead>',
    '      <tbody id="pmDetailTbody"></tbody>',
    '    </table>',
    '  </div>',
    '</div>',

    /* Info/Edit Panel */
    '<div class="pm-infopanel" id="pmInfoPanel">',
    '  <div class="pm-infopanel-header">',
    '    <span class="pm-infopanel-title">詳細 / Chi tiết</span>',
    '    <button class="pm-infopanel-close" id="pmInfoClose"><i class="fas fa-times"></i></button>',
    '  </div>',
    '  <div class="pm-infopanel-thumb"><img id="pmInfoThumb" src="" alt=""></div>',
    '  <div class="pm-infopanel-body" id="pmInfoBody">',
    '    <div class="pm-info-field">',
    '      <div class="pm-info-field-label"><span class="pm-ja">ファイル名</span><span class="pm-vi">Tên file</span></div>',
    '      <div class="pm-info-value" id="pmInfoFilename"></div>',
    '    </div>',
    '    <div class="pm-info-field">',
    '      <div class="pm-info-field-label"><span class="pm-ja">機器 / Thiết bị</span></div>',
    '      <div class="pm-info-value" id="pmInfoDevice"></div>',
    '    </div>',
    '    <div class="pm-info-field">',
    '      <div class="pm-info-field-label"><span class="pm-ja">サイズ</span><span class="pm-vi">Dung lượng</span></div>',
    '      <div class="pm-info-value" id="pmInfoSize"></div>',
    '    </div>',
    '    <div class="pm-info-field">',
    '      <div class="pm-info-field-label"><span class="pm-ja">作成日</span><span class="pm-vi">Ngày tạo</span></div>',
    '      <div class="pm-info-value" id="pmInfoDate"></div>',
    '    </div>',
    '    <div class="pm-info-field">',
    '      <div class="pm-info-field-label"><span class="pm-ja">備考</span><span class="pm-vi">Ghi chú</span></div>',
    '      <textarea class="pm-info-textarea" id="pmInfoNotes" rows="3" placeholder="メモ / Ghi chú..."></textarea>',
    '    </div>',
    '    <div id="pmInfoActions" style="display:flex;flex-direction:column;gap:6px;margin-top:4px;"></div>',
    '  </div>',
    '  <div class="pm-infopanel-footer">',
    '    <button class="pm-info-save-btn" id="pmInfoSaveBtn"><i class="fas fa-save"></i> 保存 / Lưu</button>',
    '    <button class="pm-info-cancel-btn" id="pmInfoCancelBtn">キャンセル</button>',
    '  </div>',
    '</div>',
    
    '</div>', /* pm-body */
    '</div>', /* pm-container */
    '</div>', /* pm-overlay */

    /* Context menu */
    '<div class="pm-context-menu pm-hidden" id="pmContextMenu"></div>',

    /* Lightbox */
    '<div class="pm-lightbox pm-hidden" id="pmLightbox">',
    '  <div class="pm-lb-header">',
    '    <div class="pm-lb-title"><span class="pm-lb-name" id="pmLbName"></span><span class="pm-lb-meta" id="pmLbMeta"></span></div>',
    '    <div class="pm-lb-actions">',
    '      <button class="pm-lb-btn" id="pmLbDownload" title="ダウンロード"><i class="fas fa-download"></i></button>',
    '      <button class="pm-lb-btn" id="pmLbInfo" title="情報"><i class="fas fa-info-circle"></i></button>',
    '      <button class="pm-lb-btn pm-lb-close" id="pmLbClose" title="閉じる"><i class="fas fa-times"></i></button>',
    '    </div>',
    '  </div>',
    '  <div class="pm-lb-body">',
    '    <img class="pm-lb-img" id="pmLbImg" src="" alt="">',
    '    <button class="pm-lb-nav pm-lb-prev" id="pmLbPrev"><i class="fas fa-chevron-left"></i></button>',
    '    <button class="pm-lb-nav pm-lb-next" id="pmLbNext"><i class="fas fa-chevron-right"></i></button>',
    '  </div>',
    '  <div class="pm-lb-footer" id="pmLbDots"></div>',
    '</div>',

    

    /* Storage Modal */
    '<div class="pm-storage-modal pm-hidden" id="pmStorageModal">',
    '  <div class="pm-storage-panel">',
    '    <div class="pm-storage-panel-header">',
    '      <div class="pm-storage-panel-title"><span class="pm-ja">ストレージ管理</span><span class="pm-vi">Quản lý dung lượng</span></div>',
    '      <button class="pm-infopanel-close" id="pmStorageClose"><i class="fas fa-times"></i></button>',
    '    </div>',
    '    <div class="pm-storage-panel-body" id="pmStorageBody"></div>',
    '    <div class="pm-storage-panel-footer">',
    '      <button class="pm-storage-action-btn pm-danger" id="pmEmptyTrashBtn"><i class="fas fa-trash-alt"></i> ゴミ箱を空にする / Dọn thùng rác</button>',
    '      <button class="pm-storage-action-btn pm-neutral" id="pmStorageCloseBtn2">閉じる / Đóng</button>',
    '    </div>',
    '  </div>',
    '</div>',

    /* Transfer Modal */
    '<div class="pm-transfer-modal pm-hidden" id="pmTransferModal">',
    '  <div class="pm-transfer-panel">',
    '    <div class="pm-transfer-title"><span class="pm-ja">デバイス移動</span><span class="pm-vi">Chuyển sang thiết bị khác</span></div>',
    '    <input type="text" class="pm-transfer-search" id="pmTransferSearch" placeholder="Nhập mã thiết bị...">',
    '    <div class="pm-transfer-results" id="pmTransferResults"></div>',
    '    <div class="pm-transfer-footer">',
    '      <button class="pm-transfer-confirm-btn" id="pmTransferConfirmBtn"><i class="fas fa-check"></i> 確認 / Xác nhận</button>',
    '      <button class="pm-transfer-cancel-btn" id="pmTransferCancelBtn">キャンセル</button>',
    '    </div>',
    '  </div>',
    '</div>',

    /* Confirm Dialog */
    '<div class="pm-confirm-dialog pm-hidden" id="pmConfirmDialog">',
    '  <div class="pm-confirm-box">',
    '    <div class="pm-confirm-icon" id="pmConfirmIcon"><i class="fas fa-exclamation-triangle"></i></div>',
    '    <div class="pm-confirm-msg" id="pmConfirmMsg"></div>',
    '    <div class="pm-confirm-sub" id="pmConfirmSub"></div>',
    '    <div class="pm-confirm-btns">',
    '      <button class="pm-confirm-ok"     id="pmConfirmOk"></button>',
    '      <button class="pm-confirm-cancel" id="pmConfirmCancelBtn">キャンセル / Hủy</button>',
    '    </div>',
    '  </div>',
    '</div>',

    /* Toast */
    '<div class="pm-toast-container" id="pmToastContainer"></div>'
  ].join('');

  /* ──────────────────────────────────────────────────────────
     MODULE
  ────────────────────────────────────────────────────────── */
  function PhotoManagerModule() {
    this._mounted        = false;
    this._allPhotos      = [];
    this._filtered       = [];
    this._view           = 'icon-small';
    this._navKey         = 'all';
    this._stateFilter    = 'all';
    this._search         = '';
    this._sort           = { field: 'created_at', dir: 'desc' };
    this._deviceFilter   = null;
    this._selected       = new Set();
    this._selMode        = false;
    this._currentRecord  = null;
    this._lbIndex        = 0;
    this._transferTarget = null;
    this._transferIds    = null;
    this._pendingConfirm = null;

    // Cache + incremental render (v8.4.6-4)
    this._photoCache = new Map(); // key -> { photos: [], ts: number }
    this._cacheTtlMs = 24 * 60 * 60 * 1000; // TTL 30 phút
    // IMAGE CACHE (thumb/full)
    this._imgMem = new Map();                // url -> { objUrl, ts }
    this._imgMemTtlMs = 24 * 60 * 60 * 1000; // 24 giờ
    this._imgMemLimit = 180;
    this._imgCacheNameFull = 'mcs-photo-full-v1';
    this._imgCacheNameThumb = 'mcs-photo-thumb-v1';

    this._renderBatchSize = 120;
    this._renderedUntil = 0;
    this._renderLoadingMore = false;
    this._scrollBound = false;
    this._deviceLinkBound = false;

    console.log('[PhotoManager] v8.4.6-4 created');
  }

  /* ── mount ─────────────────────────────────────────────── */
  PhotoManagerModule.prototype._mount = function () {
    if (this._mounted) return;
    var div = document.createElement('div');
    div.innerHTML = TMPL;
    while (div.firstChild) document.body.appendChild(div.firstChild);
    this._mounted = true;
    this._ensureToastOnTop();

    this._bindAll();

    // Đồng bộ schema Supabase: bảng đúng là device_photos (snake_case)
    try {
      var DevPS = global.DevicePhotoStore;
      if (DevPS) {
        if (DevPS.tableName === 'device_photos') DevPS.tableName = 'device_photos';
      }
    } catch (e) {}

    var self = this;

    // v8.4.6-4: Không auto reload danh sách ảnh khi có event upload/update.
    // Chỉ invalidate cache + báo người dùng bấm "Tải lại" nếu cần.
    document.addEventListener('device-photos-updated', function () {
      var ov = document.getElementById('pmOverlay');
      if (ov && !ov.classList.contains('pm-hidden')) {
        self._invalidateCache();
        self._showToast('info', 'Có thay đổi ảnh. Bấm "Tải lại" để cập nhật.');
      }
    });

    document.addEventListener('photo-upload-done', function () {
      var ov = document.getElementById('pmOverlay');
      if (ov && !ov.classList.contains('pm-hidden')) {
        self._invalidateCache();
        self._showToast('info', 'Upload xong. Bấm "Tải lại" để cập nhật.');
      }
    });

    // === BULLETPROOF CONTEXT MENU v8.5.15 ===
    // Dﾃｹng document-level delegation + window.PhotoManager tr盻ｱc ti蘯ｿp
    if (!document._pmCtxV15) {
      document._pmCtxV15 = true;
      var _pmLPT=null, _pmLPTgt=null, _pmIsLP=false, _pmTS={x:0,y:0};
      var _pmI = function(){ return window.PhotoManager; };
      var _pmOO = function(){ var o=document.getElementById('pmOverlay'); return o&&!o.classList.contains('pm-hidden'); };
      var _pmFI = function(t){ return (t&&t.closest)?(t.closest('.pm-item')||t.closest('#pmDetailTbody tr')):null; };
      var _pmFR = function(pm,it){
        if(!pm||!pm._filtered||!it||!it.dataset||!it.dataset.id) return null;
        var id=it.dataset.id;
        for(var i=0;i<pm._filtered.length;i++){ if(String(pm._filtered[i].id)===String(id)) return pm._filtered[i]; }
        return null;
      };
      document.addEventListener('contextmenu',function(e){
        if(!_pmOO()) return;
        if(_pmIsLP){e.preventDefault();e.stopPropagation();return;}
        var pc=document.getElementById('pmContent');
        if(!pc||!pc.contains(e.target)) return;
        var it=_pmFI(e.target);
        if(!it||!it.dataset.id) return;
        e.preventDefault(); e.stopPropagation();
        var pm=_pmI(),rec=_pmFR(pm,it);
        console.log('[PM-CTX] id:',it.dataset.id,'rec:',!!rec,'filtered:',pm?pm._filtered.length:'?');
        if(pm&&rec){pm._hideContextMenu();pm._showContextMenu(e,rec);}
      },true);
      document.addEventListener('pointerdown',function(e){
        if(!_pmOO()) return;
        if(!document.hasFocus()) try{window.focus();}catch(x){}
        var pc=document.getElementById('pmContent');
        if(!pc||!pc.contains(e.target)) return;
        var it=_pmFI(e.target);
        if(!it||!it.dataset.id) return;
        if(e.pointerType==='touch'){
          _pmIsLP=false;_pmLPTgt=it;_pmTS={x:e.clientX,y:e.clientY};
          if(_pmLPT) clearTimeout(_pmLPT);
          _pmLPT=setTimeout(function(){
            _pmIsLP=true;_pmLPT=null;
            var pm=_pmI(),rec=_pmFR(pm,_pmLPTgt);
            if(pm&&rec){pm._hideContextMenu();if(navigator.vibrate)navigator.vibrate(50);pm._showContextMenu({clientX:_pmTS.x,clientY:_pmTS.y,preventDefault:function(){},stopPropagation:function(){}},rec);}
          },550);
        }
      },true);
      document.addEventListener('pointermove',function(e){
        if(_pmLPT){if(Math.abs(e.clientX-_pmTS.x)>10||Math.abs(e.clientY-_pmTS.y)>10){clearTimeout(_pmLPT);_pmLPT=null;}}
      },true);
      document.addEventListener('pointerup',function(){if(_pmLPT){clearTimeout(_pmLPT);_pmLPT=null;}},true);
      document.addEventListener('pointercancel',function(){if(_pmLPT){clearTimeout(_pmLPT);_pmLPT=null;}},true);
      document.addEventListener('click',function(e){
        if(!_pmOO()) return;
        var pc=document.getElementById('pmContent');
        if(!pc||!pc.contains(e.target)) return;
        if(_pmIsLP){e.preventDefault();e.stopPropagation();_pmIsLP=false;return;}
        var it=_pmFI(e.target);
        if(!it||!it.dataset.id) return;
        var pm=_pmI(),rec=_pmFR(pm,it);
        if(!pm||!rec) return;
        
        var isCheck = !!e.target.closest('.pm-item-check');
        var inL=e.target.closest('.pm-item-label')||e.target.closest('.pm-device-link');
        if(inL && !isCheck){e.preventDefault();e.stopPropagation();pm._hideContextMenu();if(!pm._selMode)pm._openInfoPanel(rec);return;}
        
        if(pm._selMode || isCheck) {
          if(it.tagName !== 'TR') { 
            e.preventDefault(); e.stopPropagation(); 
            if (!pm._selMode) pm._selMode = true;
            
            var idx = pm._filtered.indexOf(rec);
            
            if (e.shiftKey && pm._lastSelectedIdx >= 0 && idx >= 0) {
               var start = Math.min(pm._lastSelectedIdx, idx);
               var end   = Math.max(pm._lastSelectedIdx, idx);
               for (var i = start; i <= end; i++) {
                 var r = pm._filtered[i];
                 if (r && !pm._selected.has(String(r.id))) {
                    pm._selected.add(String(r.id));
                    var el = document.querySelector('.pm-item[data-id="'+r.id+'"]');
                    if (el) el.classList.add('pm-selected');
                 }
               }
            } else {
               pm._toggleSelect(String(rec.id));
               pm._lastSelectedIdx = pm._selected.has(String(rec.id)) ? idx : -1;
               it.classList.toggle('pm-selected', pm._selected.has(String(rec.id)));
            }
            pm._updateSelectionBar();
            var container = it.closest('.pm-grid');
            if (container) container.classList.toggle('pm-selection-mode', pm._selMode);
          }
          return;
        }
        if(it.tagName==='TR'){pm._openInfoPanel(rec);}
        else{var idx=pm._filtered.indexOf(rec);if(idx>=0)pm._openLightbox(idx);}
      });
    }

    console.log('[PhotoManager] Mounted');
  };
;

  /* ── open ──────────────────────────────────────────────── */
  PhotoManagerModule.prototype.open = function (opts) {
    this._mount();

    // Đồng bộ schema Supabase: bảng đúng là device_photos (snake_case)
    try {
      var DevPS = global.DevicePhotoStore;
      if (DevPS) {
        if (DevPS.tableName === 'device_photos') DevPS.tableName = 'device_photos';
      }
    } catch (e) {}

    this._pmSetBaseZ('top');
    opts = opts || {};

    this._deviceFilter = (opts.deviceType && opts.deviceId)
      ? { type: opts.deviceType, id: String(opts.deviceId), code: opts.deviceCode || String(opts.deviceId) }
      : null;

    this._selected.clear();
    this._selMode = false;
    this._search  = '';

    var si = document.getElementById('pmSearchInput');
    if (si) si.value = '';

    this._applyDeviceFilter();

    var overlay = document.getElementById('pmOverlay');
    if (overlay) {
      overlay.classList.remove('pm-hidden');
      requestAnimationFrame(function () { overlay.classList.add('pm-show'); });
    }

    this._bindScrollLoadMore();

    var key = this._getCacheKey();
    var ent = (!opts.forceRefresh) ? this._getCacheEntry(key) : null;

    if (ent && Array.isArray(ent.photos) && ent.photos.length) {
      this._allPhotos = ent.photos;
      this._enrichWithDeviceInfo(this._allPhotos);
      this._applyFilters();
      this._showToast('info', 'Đang dùng cache (bấm "Tải lại" nếu muốn cập nhật).');
      return;
    }

    this._loadPhotos(true);
  };
;

  /* ── close ─────────────────────────────────────────────── */
  PhotoManagerModule.prototype.close = function () {
    var overlay = document.getElementById('pmOverlay');
    if (!overlay) return;
    overlay.classList.remove('pm-show');
    setTimeout(function () { overlay.classList.add('pm-hidden'); }, 200);
    this._closeInfoPanel();
    this._closeLightbox();
    this._hideContextMenu();
  };

  /* ── _applyDeviceFilter ─────────────────────────────────── */
  PhotoManagerModule.prototype._applyDeviceFilter = function () {
    var badge    = document.getElementById('pmFilterBadge');
    var badgeTxt = document.getElementById('pmFilterBadgeText');
    var devInfo  = document.getElementById('pmDeviceInfo');
    if (this._deviceFilter) {
      var label = (this._deviceFilter.type === 'mold' ? '🔧 ' : '✂️ ') + this._deviceFilter.code;
      if (badgeTxt) badgeTxt.textContent = label;
      if (badge)    badge.classList.remove('pm-hidden');
      if (devInfo)  devInfo.textContent  = label;
    } else {
      if (badge)   badge.classList.add('pm-hidden');
      if (devInfo) devInfo.textContent = '';
    }
  };

  /* ── _loadPhotos ────────────────────────────────────────── */
  /* FIX: self._allPhotos (không phải self.allPhotos) + gọi enrich đúng */
  /* loadPhotos FIX: _allPhotos dùng cho enrich đồng bộ */
  PhotoManagerModule.prototype._loadPhotos = function (force, silent) {
    var DevPS = global.DevicePhotoStore;
    if (!DevPS) return;

    var self = this;
    var key = this._getCacheKey();

    if (!force) {
      var ent = this._getCacheEntry(key);
      if (ent) {
        this._allPhotos = ent.photos;
        this._enrichWithDeviceInfo(this._allPhotos);
        this._applyFilters();
        this._updateNavCounts();
        this._updateStorageBar();
        return;
      }
    }

    if (!silent) this._showLoading(true);

    var filters = { includeTrash: true, orderBy: this._sort.field, orderDir: this._sort.dir };
    if (this._deviceFilter) {
      filters.deviceType = this._deviceFilter.type;
      filters.deviceId   = this._deviceFilter.id;
    }

    DevPS.getPhotos(filters).then(function (res) {
      self._allPhotos = Array.isArray(res) ? res : (res && Array.isArray(res.data) ? res.data : []);
      self._enrichWithDeviceInfo(self._allPhotos);
      self._setCacheEntry(key, self._allPhotos);

      self._applyFilters();
      self._updateNavCounts();
      self._updateStorageBar();
      if (!silent) self._showLoading(false);
    }).catch(function (err) {
      console.error('[PhotoManager] loadPhotos error', err);
      self._allPhotos = [];
      self._applyFilters();
      if (!silent) self._showLoading(false);
    });
  };
;

  /* ── _enrichWithDeviceInfo ──────────────────────────────── */
  /* FIX: Khai báo đúng 1 lần, không lồng nhau */
  PhotoManagerModule.prototype._enrichWithDeviceInfo = function (photos) {
    if (!photos || !Array.isArray(photos) || !photos.length) return;
    if (!global.DataManager || typeof global.DataManager.getAllItems !== 'function') {
      /* Không có DataManager – gán devicelabel từ device_id */
      photos.forEach(function (p) {
        p.devicecode  = p.devicecode  || '';
        p.devicename  = p.devicename  || '';
        p.devicelabel = p.devicelabel || p.device_id || String(p.deviceid || '');
      });
      return;
    }
    var items = global.DataManager.getAllItems();
    if (!items || !Array.isArray(items)) return;
    var moldMap = {}, cutterMap = {}, rackMap = {}, trayMap = {};
    items.forEach(function (it) {
      if (it.type === 'mold')        moldMap[String(it.MoldID)]    = it;
      else if (it.type === 'cutter') cutterMap[String(it.CutterID)] = it;
    });
    // Add logic to get Racks if available in DataManager
    var racksData = [];
    if (global.DataManager.racksData) racksData = global.DataManager.racksData;
    else if (global.DataManager.getAllItems) racksData = global.DataManager.getAllItems().filter(function(i){ return i.type==='rack'});
    
    racksData.forEach(function(r) {
      if (r.RackID) rackMap[String(r.RackID)] = r;
    });
    
    // Add logic to get Trays if available in DataManager
    var traysData = [];
    if (global.DataManager && typeof global.DataManager.getAllTrays === 'function') {
        traysData = global.DataManager.getAllTrays();
    }
    traysData.forEach(function(t) {
        if (t.TrayID) trayMap[String(t.TrayID)] = t;
    });

    photos.forEach(function (p) {
      /* Supabase trả về snake_case: device_type, device_id */
      var dtype = p.device_type || p.devicetype || '';
      var did   = String(p.device_id  || p.deviceid  || '');
      var it    = null;
      var rack  = null;
      var tray  = null;
      if (dtype === 'mold')        it = moldMap[did];
      else if (dtype === 'cutter') it = cutterMap[did];
      else if (dtype === 'rack')   rack = rackMap[did] || { RackID: did, RackName: p.devicename || did, RackLocation: p.devicecode || '' };
      else if (dtype === 'tray')   tray = trayMap[did] || { TrayID: did, MoldTrayName: p.devicename || ('Tray ' + did) };

      if (it) {
        p.devicecode = it.MoldCode  || it.CutterNo   || '';
        p.devicename = it.MoldName  || it.CutterName || '';
      } else if (rack) {
        p.devicecode = rack.RackLocation || rack.RackCompanyLocation || '';
        p.devicename = rack.RackName || ('Rack ' + rack.RackID);
      } else if (tray) {
        p.devicecode = tray.CustomerID || '';
        p.devicename = tray.MoldTrayName || ('Khay ' + tray.TrayID);
      } else {
        p.devicecode = '';
        p.devicename = '';
      }
      p.devicelabel = p.devicecode
        ? (p.devicecode + (p.devicename ? ' – ' + p.devicename : ''))
        : did;
    });
  };

  /* ── _applyFilters ─────────────────────────────────────── */
  PhotoManagerModule.prototype._applyFilters = function () {
    var photos = this._allPhotos.slice();
    var nav    = this._navKey;
    var sf     = this._stateFilter;
    var q      = this._search.toLowerCase().trim();

    /* Nav filter – khi chọn trash/thumbnails trong leftnav thì bỏ chip filter */
    if (nav === 'molds')      photos = photos.filter(function (p) { return (p.device_type||p.devicetype) === 'mold';    });
    if (nav === 'cutters')    photos = photos.filter(function (p) { return (p.device_type||p.devicetype) === 'cutter';  });
    if (nav === 'racks')      photos = photos.filter(function (p) { return (p.device_type||p.devicetype) === 'rack';    });
    if (nav === 'trays')      photos = photos.filter(function (p) { return (p.device_type||p.devicetype) === 'tray';    });
    if (nav === 'thumbnails') photos = photos.filter(function (p) { return p.is_thumbnail; });
    if (nav === 'trash')      photos = photos.filter(function (p) { return p.state === 'trash'; });

    /* State chip filter – chỉ áp dụng khi KHÔNG ở trash/thumbnails nav */
    if (nav !== 'trash' && nav !== 'thumbnails') {
      if (sf === 'all')       photos = photos.filter(function (p) { return p.state !== 'trash'; });
      if (sf === 'active')    photos = photos.filter(function (p) { return p.state === 'active'; });
      if (sf === 'inbox')     photos = photos.filter(function (p) { return p.state === 'inbox'; });
      if (sf === 'thumbnail') photos = photos.filter(function (p) { return p.is_thumbnail; });
      if (sf === 'trash')     photos = photos.filter(function (p) { return p.state === 'trash'; });
    }

    /* Search – tìm theo tên file, device_id, mã khuôn, tên khuôn */
    if (q) photos = photos.filter(function (p) {
      var name   = (p.original_filename || '').toLowerCase();
      var devId  = (p.device_id  || p.deviceid  || '').toLowerCase();
      var dcode  = (p.devicecode || '').toLowerCase();
      var dname  = (p.devicename || '').toLowerCase();
      var dlabel = (p.devicelabel || '').toLowerCase();
      return name.includes(q) || devId.includes(q) || dcode.includes(q) || dname.includes(q) || dlabel.includes(q);
    });

    /* Sort */
    var field = this._sort.field, dir = this._sort.dir;
    photos.sort(function (a, b) {
      var av = a[field] || '', bv = b[field] || '';
      if (field === 'file_size') { av = Number(av); bv = Number(bv); }
      var r = (av < bv) ? -1 : (av > bv) ? 1 : 0;
      return dir === 'asc' ? r : -r;
    });

    this._filtered = photos;
    this._render();
    this._updateStatusBar();
  };

  /* ── _render ────────────────────────────────────────────── */
  PhotoManagerModule.prototype._render = function () {
    var view = this._view;
    var photos = this._filtered || [];

    var glarge = document.getElementById('pmGridLarge');
    var gsmall = document.getElementById('pmGridSmall');
    var dview  = document.getElementById('pmDetailView');
    var empty  = document.getElementById('pmEmpty');

    // Chỉ hiện nút "Dọn rác" khi đang xem tab Thùng rác
    var topEmptyBtn = document.getElementById('pmEmptyTrashTopBtn');
    if (topEmptyBtn) {
      topEmptyBtn.style.display = (this._navKey === 'trash') ? '' : 'none';
    }

    if (glarge) glarge.classList.toggle('pm-hidden', view !== 'icon-large');
    if (gsmall) gsmall.classList.toggle('pm-hidden', view !== 'icon-small');
    if (dview)  dview.classList.toggle('pm-hidden', view !== 'detail');
    if (empty)  empty.classList.toggle('pm-hidden', photos.length !== 0);

    if (!photos.length) return;

    this._resetIncrementalRender();
    this._renderMore();
  };
;

  /* ── _renderGrid ─────────────────────────────────────────── */
  // v8.4.6-4: render grid theo lát, tránh render quá nhiều ảnh 1 lần
  PhotoManagerModule.prototype._renderGridSlice = function (containerId, startIdx, endIdx, append) {
    var self = this;
    var container = document.getElementById(containerId);
    if (!container) return;

    var DevPS = global.DevicePhotoStore;

    if (!append) container.innerHTML = '';

    var html = '';
    for (var i = startIdx; i < endIdx; i++) {
      var p = self._filtered[i];
      if (!p) continue;

      var thumbUrl = self._getThumbUrl(p);
      var isSel = self._selected.has(p.id);
      var isTrash = p.state === 'trash';
      var isInbox = p.state === 'inbox';
      var ca = p.created_at || p.createdat || p.createdAt || null;
      var dateStr = ca ? new Date(ca).toLocaleDateString('ja-JP') : '';


      var rawSize = Number((p.file_size !== undefined ? p.file_size : (p.filesize !== undefined ? p.filesize : p.fileSize)) || 0);

      var size = (DevPS && rawSize > 0 && typeof DevPS.formatBytes === 'function') ? DevPS.formatBytes(rawSize) : '';

      var deviceTitle = p.devicelabel || p.devicecode || p.devicename || (p.deviceid ? String(p.deviceid) : '');
      var fileName = p.original_filename || p.originalfilename || p.originalFileName || '';


      var metaParts = [];
      if (fileName) metaParts.push(fileName);
      if (size) metaParts.push(size);
      if (dateStr) metaParts.push(dateStr);

      var dtype = (p.devicetype || p.deviceType || '').toString().toLowerCase();
      var did = (p.deviceid || p.deviceId || '').toString();

      html += '<div class="pm-item ' + (isSel ? 'pm-selected ' : '') + (isTrash ? 'pm-trash ' : '') + '" data-id="' + _esc(p.id) + '" data-idx="' + i + '" tabindex="0">';
      html +=   '<div class="pm-item-check"><i class="fas fa-check"></i></div>';
      html +=   '<div class="pm-item-thumb">';
      if (thumbUrl) html += '<img src="' + _esc(thumbUrl) + '" alt="' + _esc(p.originalfilename) + '" loading="lazy" />';
      else html += '<div class="pm-item-no-img"><i class="fas fa-image"></i></div>';
      if (p.isthumbnail) html += '<div class="pm-thumb-star"><i class="fas fa-star"></i></div>';
      if (isTrash) html += '<div class="pm-state-badge pm-state-trash"></div>';
      if (isInbox) html += '<div class="pm-state-badge pm-state-inbox"></div>';
      html +=   '</div>';

      html +=   '<div class="pm-item-label">';
      html +=     '<div class="pm-item-name">'
                + '<span class="pm-device-link" data-type="' + _esc(dtype) + '" data-id="' + _esc(did) + '" style="font-weight:700; color:var(--pm-blue);">' + _esc(deviceTitle) + '</span>'
                + '</div>';
      html +=     '<div class="pm-item-meta">' + _esc(metaParts.join(' · ')) + '</div>';
      html +=   '</div>';
      html += '</div>';
    }

    if (append) container.insertAdjacentHTML('beforeend', html);
    else container.innerHTML = html;

    container.className = 'pm-grid pm-view-icon-' + (containerId === 'pmGridLarge' ? 'large' : 'small') + (self._selMode ? ' pm-selection-mode' : '');
    container.style.alignContent = 'start';
    container.style.alignItems = 'stretch'; /* Sửa lỗi collapse grid khi xóa aspect-ratio */

    container.querySelectorAll('.pm-item').forEach(function (el) {
      if (el.dataset.bound === '1') return;
      el.dataset.bound = '1';

      var id = el.dataset.id;
      var idx = Number(el.dataset.idx);

      var _getIdxNow = function () {
        try {
          var ii = self._filtered.findIndex(function (p) { return String(p.id) === String(id); });
          if (ii >= 0) return ii;
        } catch (e) {}
        var n = Number(el.dataset.idx);
        return isNaN(n) ? 0 : n;
      };

      // checkEl logic đã được xử lý ở #pmContent delegation (v8.5.17)
    });
  };

  PhotoManagerModule.prototype._renderGrid = function (containerId, photos) {
    if (Array.isArray(photos)) this._filtered = photos;
    this._resetIncrementalRender();
    this._renderMore();
  };
;

  /* ── _renderDetail ───────────────────────────────────────── */
  PhotoManagerModule.prototype._renderDetailSlice = function (startIdx, endIdx, append) {
    var self = this;
    var tbody = document.getElementById('pmDetailTbody');
    if (!tbody) return;

    var DevPS = global.DevicePhotoStore;

    if (!append) tbody.innerHTML = '';

    var html = '';
    for (var i = startIdx; i < endIdx; i++) {
      var p = self._filtered[i];
      if (!p) continue;

      var thumbUrl = self._getThumbUrl(p);
      var isSel = self._selected.has(p.id);
      var dateStr = p.createdat ? new Date(p.createdat).toLocaleString('ja-JP') : '';
      var rawSize = Number((p.file_size !== undefined ? p.file_size : (p.filesize !== undefined ? p.filesize : p.fileSize)) || 0);
      var size = (DevPS && rawSize > 0 && typeof DevPS.formatBytes === 'function') ? DevPS.formatBytes(rawSize) : '';

      var dtype = (p.devicetype || p.deviceType || '').toString().toLowerCase();
      var did = (p.deviceid || p.deviceId || '').toString();
      var typeLabel = (dtype === 'mold') ? 'Khuôn' : (dtype === 'cutter') ? 'Dao cắt' : (dtype === 'rack') ? 'Giá để khuôn' : (dtype === 'tray') ? 'Khay' : dtype;

      var stateLabel = (p.state === 'active') ? 'active'
        : (p.state === 'inbox') ? 'inbox'
        : (p.state === 'temp') ? 'temp'
        : (p.state === 'trash') ? 'trash'
        : (p.state || '');

      var deviceDisp = p.devicelabel || (p.deviceid ? String(p.deviceid) : '');

      html += '<tr class="' + (isSel ? 'pm-selected ' : '') + (p.state === 'trash' ? 'pm-trash ' : '') + '" data-id="' + _esc(p.id) + '" data-idx="' + i + '">';
      html += '<td class="pm-td-thumb">';
      if (thumbUrl) html += '<img src="' + _esc(thumbUrl) + '" alt="" loading="lazy" />';
      else html += '<div style="width:38px;height:38px;background:var(--pm-bg);border-radius:6px;display:flex;align-items:center;justify-content:center;color:var(--pm-text-mute);"><i class="fas fa-image"></i></div>';
      html += '</td>';

      html += '<td><span class="pm-device-link" data-type="' + _esc(dtype) + '" data-id="' + _esc(did) + '" style="font-weight:700; color:var(--pm-blue); cursor:pointer;">' + _esc(deviceDisp) + '</span></td>';
      html += '<td>' + _esc(typeLabel) + '</td>';
      html += '<td>' + _esc(size) + '</td>';
      html += '<td>' + _esc(dateStr) + '</td>';
      html += '<td>' + _esc(stateLabel) + '</td>';
      html += '<td class="pm-td-name">' + (p.isthumbnail ? '<i class="fas fa-star pm-star-icon"></i> ' : '') + _esc(p.originalfilename || '') + '</td>';
      html += '</tr>';
    }

    if (append) tbody.insertAdjacentHTML('beforeend', html);
    else tbody.innerHTML = html;

    tbody.querySelectorAll('tr').forEach(function (row) {
      if (row.dataset.bound === '1') return;
      row.dataset.bound = '1';

      var id = row.dataset.id;
      var idx = Number(row.dataset.idx);

      var _getIdxNow = function () {
        try {
          var ii = self._filtered.findIndex(function (p) { return String(p.id) === String(id); });
          if (ii >= 0) return ii;
        } catch (e) {}
        var n = Number(row.dataset.idx);
        return isNaN(n) ? 0 : n;
      };

      // Bỏ trống vì đã chuyển sang xử lý delegation chung ở #pmContent.
    });

    if (!this._detailSortBound) {
      this._detailSortBound = true;
      document.querySelectorAll('.pm-detail-table thead th[data-col]').forEach(function (th) {
        th.style.cursor = 'pointer';
        th.addEventListener('click', function () {
          var col = th.dataset.col;
          if (self._sort.field === col) self._sort.dir = (self._sort.dir === 'asc') ? 'desc' : 'asc';
          else { self._sort.field = col; self._sort.dir = 'asc'; }

          document.querySelectorAll('.pm-detail-table thead th').forEach(function (t) {
            t.classList.remove('pm-sort-asc', 'pm-sort-desc');
          });
          th.classList.add('pm-sort-' + self._sort.dir);

          self._applyFilters();
        });
      });
    }
  };

  PhotoManagerModule.prototype._renderDetail = function (photos) {
    if (Array.isArray(photos)) this._filtered = photos;
    this._resetIncrementalRender();
    this._renderMore();
  };
;

  /* ── _updateNavCounts ────────────────────────────────────── */
  PhotoManagerModule.prototype._updateNavCounts = function () {
    var all    = this._allPhotos;
    var setTxt = function (id, n) { var el = document.getElementById(id); if (el) el.textContent = n; };
    setTxt('pmNavCountAll',    all.filter(function (p) { return p.state !== 'trash'; }).length);
    setTxt('pmNavCountMold',   all.filter(function (p) { return (p.device_type||p.devicetype) === 'mold'   && p.state !== 'trash'; }).length);
    setTxt('pmNavCountCutter', all.filter(function (p) { return (p.device_type||p.devicetype) === 'cutter' && p.state !== 'trash'; }).length);
    setTxt('pmNavCountRack',   all.filter(function (p) { return (p.device_type||p.devicetype) === 'rack'   && p.state !== 'trash'; }).length);
    setTxt('pmNavCountTray',   all.filter(function (p) { return (p.device_type||p.devicetype) === 'tray'   && p.state !== 'trash'; }).length);
    setTxt('pmNavCountThumb',  all.filter(function (p) { return p.is_thumbnail; }).length);
    setTxt('pmNavCountTrash',  all.filter(function (p) { return p.state === 'trash'; }).length);
  };

  /* ── _updateStatusBar ────────────────────────────────────── */
  PhotoManagerModule.prototype._updateStatusBar = function () {
    var tc = document.getElementById('pmTotalCount');
    if (tc) tc.textContent = this._filtered.length;
  };

  /* ── _updateStorageBar ───────────────────────────────────── */
  /* FIX: tính tổng file_size từ _allPhotos nếu getStorageStats không hoạt động */
  PhotoManagerModule.prototype._updateStorageBar = function () {
    var DevPS = global.DevicePhotoStore;
    if (!DevPS) return;
    var self  = this;
    var opts  = this._deviceFilter
      ? { deviceType: this._deviceFilter.type, deviceId: this._deviceFilter.id }
      : {};

    /* Fallback: tính từ dữ liệu đã tải */
    var calcFromLoaded = function () {
      var totalSize = self._allPhotos.reduce(function (acc, p) { return acc + (Number(((p && (p.file_size !== undefined ? p.file_size : (p.filesize !== undefined ? p.filesize : p.fileSize))) || 0)) || 0); }, 0);
      var fill = document.getElementById('pmStorageBarFill');
      var text = document.getElementById('pmStorageText');
      if (text) text.textContent = totalSize > 0 ? DevPS.formatBytes(totalSize) : '0 B';
      var pct = Math.min(100, Math.round((totalSize / (1024 * 1024 * 1024)) * 100));
      if (fill) {
        fill.style.width = pct + '%';
        fill.className   = 'pm-storage-bar-fill' + (pct > 80 ? ' pm-danger' : pct > 60 ? ' pm-warn' : '');
      }
    };

    if (typeof DevPS.getStorageStats === 'function') {
      DevPS.getStorageStats(opts).then(function (stats) {
        if (!stats || stats.error || stats.totalSize === undefined) { calcFromLoaded(); return; }
        var fill    = document.getElementById('pmStorageBarFill');
        var text    = document.getElementById('pmStorageText');
        var rawSize = Number(stats.totalSize) || 0;
        if (rawSize <= 0) {
          calcFromLoaded();
          return;
        }

        if (text) text.textContent = rawSize > 0 ? DevPS.formatBytes(rawSize) : '0 B';
        var pct = Math.min(100, Math.round((rawSize / (1024 * 1024 * 1024)) * 100));
        if (fill) {
          fill.style.width = pct + '%';
          fill.className   = 'pm-storage-bar-fill' + (pct > 80 ? ' pm-danger' : pct > 60 ? ' pm-warn' : '');
        }
      }).catch(calcFromLoaded);
    } else {
      calcFromLoaded();
    }
  };

  /* ── SELECTION ───────────────────────────────────────────── */
  PhotoManagerModule.prototype._toggleSelect = function (id) {
    if (this._selected.has(id)) this._selected.delete(id);
    else                         this._selected.add(id);
    if (!this._selected.size) this._selMode = false;
  };

  PhotoManagerModule.prototype._updateSelectionBar = function () {
    var bar   = document.getElementById('pmSelectionBar');
    var count = document.getElementById('pmSelCount');
    var show  = this._selected.size > 0;
    if (bar)   bar.classList.toggle('pm-show', show);
    if (count) count.textContent = this._selected.size + ' 件選択 / ' + this._selected.size + ' đã chọn';
    var isTrashNav = this._navKey === 'trash';
    var selTrash   = document.getElementById('pmSelTrash');
    var selDelete  = document.getElementById('pmSelDelete');
    if (selTrash)  selTrash.style.display  = isTrashNav ? 'none' : '';
    if (selDelete) selDelete.style.display = '';
  };

  PhotoManagerModule.prototype._clearSelection = function () {
    this._selected.clear();
    this._selMode = false;
    this._lastSelectedIdx = -1;
    this._updateSelectionBar();
    this._render();
  };

  /* ── CONTEXT MENU ────────────────────────────────────────── */
  PhotoManagerModule.prototype._showContextMenu = function (e, record) {
    if (this._ctxMenuTimer) { clearTimeout(this._ctxMenuTimer); this._ctxMenuTimer = null; }
    if (!record) return;
    var self    = this;
    var menu    = document.getElementById('pmContextMenu');
    if (!menu) return;
    var isTrash = record.state === 'trash';

    var items = [];
    if (!isTrash) {
      items.push({ icon: 'fa-download',     label: 'ダウンロード / Tải về',         cls: 'pm-ctx-blue',  fn: function () {
        self._downloadFile(self._getFullUrl(record), record.original_filename || 'photo.jpg');
      } });
      items.push({ icon: 'fa-eye',          label: 'プレビュー / Xem',             cls: '',             fn: function () {
        var ii = -1;
        try { ii = self._filtered.findIndex(function (p) { return String(p.id) === String(record.id); }); } catch (e) {}
        self._openLightbox(ii >= 0 ? ii : 0);
      } });
      items.push({ icon: 'fa-info-circle',  label: '詳細 / Chi tiết',              cls: '',             fn: function () { self._openInfoPanel(record); } });
      items.push('sep');
      if (!record.is_thumbnail)
        items.push({ icon: 'fa-star',       label: 'サムネイル設定 / Đặt đại diện', cls: 'pm-ctx-teal', fn: function () { self._handleSetThumbnail(record); } });
      items.push({ icon: 'fa-exchange-alt', label: '移動 / Chuyển thiết bị',       cls: '',             fn: function () { self._openTransferModal([record.id]); } });
      items.push('sep');
      items.push({ icon: 'fa-trash',        label: 'ゴミ箱へ / Vào thùng rác',     cls: 'pm-ctx-danger', fn: function () { self._handleMoveToTrash([record.id]); } });
    } else {
      items.push({ icon: 'fa-undo',  label: '元に戻す / Khôi phục',       cls: 'pm-ctx-teal',  fn: function () { self._handleRestore([record.id]); } });
      items.push({ icon: 'fa-times', label: '完全削除 / Xóa vĩnh viễn',   cls: 'pm-ctx-danger', fn: function () { self._handlePermanentDelete([record.id]); } });
    }

    var html = '';
    items.forEach(function (item) {
      if (item === 'sep') { html += '<div class="pm-ctx-sep"></div>'; return; }
      html += '<button class="pm-ctx-item ' + item.cls + '"><i class="fas ' + item.icon + '"></i> ' + item.label + '</button>';
    });
    menu.innerHTML = html;

    menu.classList.remove('pm-hidden', 'pm-show');
    menu.style.display = 'block';
    
    // Force DOM reflow to fix animation and hit-testing paint issues in Chrome
    void menu.offsetWidth;

    var mx = Math.min(e.clientX, window.innerWidth  - 200);
    var my = Math.min(e.clientY, window.innerHeight - 200);
    menu.style.left = mx + 'px';
    menu.style.top  = my + 'px';
    
    menu.classList.add('pm-show');

    var btns   = menu.querySelectorAll('.pm-ctx-item');
    var fnList = items.filter(function (it) { return it !== 'sep'; });
    btns.forEach(function (btn, i) {
      btn.addEventListener('click', function (ev) {
         ev.preventDefault();
         ev.stopPropagation();
         self._hideContextMenu();
         fnList[i].fn();
      });
    });
  };

  PhotoManagerModule.prototype._hideContextMenu = function () {
    if (this._ctxMenuTimer) { clearTimeout(this._ctxMenuTimer); this._ctxMenuTimer = null; }
    var menu = document.getElementById('pmContextMenu');
    if (menu) {
      menu.classList.remove('pm-show');
      this._ctxMenuTimer = setTimeout(function () { 
        menu.classList.add('pm-hidden'); 
        menu.style.display = ''; 
      }, 120);
    }
  };

  /* ── LIGHTBOX ────────────────────────────────────────────── */
  PhotoManagerModule.prototype._openLightbox = function (idx) {
    idx = Number(idx);
    if (isNaN(idx)) idx = 0;
    this._lbIndex = idx;
    var lb = document.getElementById('pmLightbox');
    // Ép các lớp popup/toast/confirm luôn nằm trên cùng (tránh bị che bởi Lightbox)
    var toastC = document.getElementById('pmToastContainer');
    if (toastC) {
      toastC.style.position = 'fixed';
      toastC.style.left = '12px';
      toastC.style.right = '12px';
      toastC.style.bottom = '12px';
      toastC.style.zIndex = '2147483647';
      toastC.style.pointerEvents = 'none';
    }

    var confirmD = document.getElementById('pmConfirmDialog');
    if (confirmD) {
      confirmD.style.position = 'fixed';
      confirmD.style.inset = '0';
      confirmD.style.zIndex = '2147483646';
    }

    var transferD = document.getElementById('pmTransferDialog'); // nếu có
    if (transferD) {
      transferD.style.position = 'fixed';
      transferD.style.inset = '0';
      transferD.style.zIndex = '2147483646';
    }

    if (lb) lb.style.zIndex = '2147483645';

    if (!lb) return;
    lb.classList.remove('pm-hidden');
    requestAnimationFrame(function () { lb.classList.add('pm-show'); });
    this._renderLightboxSlide();
  };

  PhotoManagerModule.prototype._renderLightboxSlide = function () {
    var photos = this._filtered;
    var idx    = this._lbIndex;
    if (!photos.length) return;
    if (isNaN(idx)) idx = 0;
    idx = Math.max(0, Math.min(idx, photos.length - 1));
    this._lbIndex = idx;
    var p     = photos[idx];
    var img   = document.getElementById('pmLbImg');
    var nm    = document.getElementById('pmLbName');
    var mt    = document.getElementById('pmLbMeta');
    var DevPS = global.DevicePhotoStore;
    var fullUrl = this._getFullUrl(p);
    if (img) {
      this._setImgElFromUrlCached(img, fullUrl, this._imgCacheNameFull);
    }

    // Prefetch ảnh trước/sau để bấm next/prev không phải tải lại
    try {
      var pPrev = photos[idx - 1];
      var pNext = photos[idx + 1];
      if (pPrev) this._prefetchFull(this._getFullUrl(pPrev));
      if (pNext) this._prefetchFull(this._getFullUrl(pNext));
    } catch (e) {}

    if (nm)  nm.textContent  = p.original_filename || '';
    /* Hiện tên khuôn / mã khuôn thay vì chỉ device_id */
    var metaDevLabel = p.devicelabel || p.device_id || p.deviceid || '';
    var rawSize      = Number(((p && (p.file_size !== undefined ? p.file_size : (p.filesize !== undefined ? p.filesize : p.fileSize))) || 0)) || 0;
    var sizeStr      = (DevPS && rawSize > 0) ? DevPS.formatBytes(rawSize) : '';
    var dateStr      = p.created_at ? new Date(p.created_at).toLocaleDateString('ja-JP') : '';
    var metaParts    = [];
    if (metaDevLabel) metaParts.push(metaDevLabel);
    if (sizeStr)      metaParts.push(sizeStr);
    if (dateStr)      metaParts.push(dateStr);
    if (mt) mt.textContent = metaParts.join(' · ');

    var dots = document.getElementById('pmLbDots');
    if (dots && photos.length <= 20) {
      dots.innerHTML = photos.map(function (_, i) {
        return '<div class="pm-lb-dot' + (i === idx ? ' pm-active' : '') + '" data-i="' + i + '"></div>';
      }).join('');
      var self = this;
      dots.querySelectorAll('.pm-lb-dot').forEach(function (d) {
        d.addEventListener('click', function () { self._lbIndex = Number(d.dataset.i); self._renderLightboxSlide(); });
      });
    }
    var prev = document.getElementById('pmLbPrev');
    var next = document.getElementById('pmLbNext');
    if (prev) prev.style.display = idx > 0 ? '' : 'none';
    if (next) next.style.display = idx < photos.length - 1 ? '' : 'none';
  };

  PhotoManagerModule.prototype._closeLightbox = function () {
    var lb = document.getElementById('pmLightbox');
    if (lb) { lb.classList.remove('pm-show'); setTimeout(function () { lb.classList.add('pm-hidden'); }, 200); }
  };

  /* ── INFO PANEL ──────────────────────────────────────────── */
  PhotoManagerModule.prototype._openInfoPanel = function (record) {
    var self  = this;
    var DevPS = global.DevicePhotoStore;
    var panel = document.getElementById('pmInfoPanel');
    if (!panel) return;
    this._currentRecord = record;

    var thumb = document.getElementById('pmInfoThumb');
    var tUrl = this._getThumbUrl(record);
    if (thumb) {
      if (tUrl) {
        try { thumb.style.display = 'block'; } catch (e) {}
        this._setImgElFromUrlCached(thumb, tUrl, this._imgCacheNameThumb);
      } else {
        try {
          thumb.removeAttribute('src');
          thumb.style.display = 'none';
        } catch (e) {}
      }
    }

    _setText('pmInfoFilename', record.original_filename || '—');

    /* Hiện mã khuôn + tên khuôn trong info panel */
    var dtype   = record.device_type || record.devicetype || '';
    var icon    = dtype === 'mold' ? '🔧 Khuôn' : (dtype === 'cutter' ? '✂️ Dao cắt' : (dtype === 'rack' ? '🗄️ Giá để khuôn' : '📦 Khay'));
    var devDisp = record.devicelabel || record.device_id || record.deviceid || '—';
    _setText('pmInfoDevice', icon + ' ' + devDisp);

    var rawSize = Number(((record && (record.file_size !== undefined ? record.file_size : (record.filesize !== undefined ? record.filesize : record.fileSize))) || 0)) || 0;
    _setText('pmInfoSize', (DevPS && rawSize > 0) ? DevPS.formatBytes(rawSize) : '—');
    _setText('pmInfoDate', record.created_at ? new Date(record.created_at).toLocaleString('ja-JP') : '—');
    var notes = document.getElementById('pmInfoNotes');
    if (notes) notes.value = record.notes || '';

    var actionsEl = document.getElementById('pmInfoActions');
    if (actionsEl) {
      var isTrash = record.state === 'trash';
      var html = '';
      if (!isTrash) {
        if (!record.is_thumbnail)
          html += '<button class="pm-info-save-btn" id="pmInfoSetThumb" style="background:var(--pm-teal)"><i class="fas fa-star"></i> サムネイル設定</button>';
        html += '<button class="pm-info-cancel-btn" id="pmInfoTransferBtn" style="border-color:var(--pm-sky);color:var(--pm-sky)"><i class="fas fa-exchange-alt"></i> デバイス移動</button>';
        html += '<button class="pm-info-cancel-btn" id="pmInfoTrashBtn" style="border-color:var(--pm-red);color:var(--pm-red)"><i class="fas fa-trash"></i> ゴミ箱へ</button>';
      } else {
        html += '<button class="pm-info-save-btn" id="pmInfoRestoreBtn" style="background:var(--pm-teal)"><i class="fas fa-undo"></i> 元に戻す / Khôi phục</button>';
        html += '<button class="pm-info-cancel-btn" id="pmInfoPermDeleteBtn" style="border-color:var(--pm-red);color:var(--pm-red)"><i class="fas fa-times"></i> 完全削除</button>';
      }
      actionsEl.innerHTML = html;
      var setThumbBtn = document.getElementById('pmInfoSetThumb');
      if (setThumbBtn) setThumbBtn.addEventListener('click', function () { self._handleSetThumbnail(record); });
      var transferBtn = document.getElementById('pmInfoTransferBtn');
      if (transferBtn) transferBtn.addEventListener('click', function () { self._openTransferModal([record.id]); });
      var trashBtn = document.getElementById('pmInfoTrashBtn');
      if (trashBtn) trashBtn.addEventListener('click', function () { self._handleMoveToTrash([record.id]); self._closeInfoPanel(); });
      var restoreBtn = document.getElementById('pmInfoRestoreBtn');
      if (restoreBtn) restoreBtn.addEventListener('click', function () { self._handleRestore([record.id]); self._closeInfoPanel(); });
      var permDelBtn = document.getElementById('pmInfoPermDeleteBtn');
      if (permDelBtn) permDelBtn.addEventListener('click', function () { self._handlePermanentDelete([record.id]); self._closeInfoPanel(); });
    }

    panel.classList.add('pm-open');
  };

  PhotoManagerModule.prototype._closeInfoPanel = function () {
    var panel = document.getElementById('pmInfoPanel');
    if (panel) panel.classList.remove('pm-open');
    this._currentRecord = null;
  };

  /* ── STORAGE MODAL ─────────────────────────────────────────── */
  PhotoManagerModule.prototype._openStorageModal = function () {
    var DevPS = global.DevicePhotoStore;
    if (!DevPS) return;
    var modal = document.getElementById('pmStorageModal');
    if (!modal) return;
    var body  = document.getElementById('pmStorageBody');
    var opts  = this._deviceFilter
      ? { deviceType: this._deviceFilter.type, deviceId: this._deviceFilter.id }
      : {};
    var self  = this;

    var renderStats = function (s) {
      if (!body) return;
      var rawTotal = Number(s.totalSize || 0);
      var rawTrash = Number(s.trashSize || 0);
      if (rawTotal === 0 && fallbackStats && Number(fallbackStats.totalSize || 0) > 0) {
        rawTotal = Number(fallbackStats.totalSize || 0);
        rawTrash = Number(fallbackStats.trashSize || 0);
      }

      var total     = rawTotal > 0 ? DevPS.formatBytes(rawTotal) : '0 B';
      var trashSize = rawTrash > 0 ? DevPS.formatBytes(rawTrash) : '0 B';
      var pct       = rawTotal > 0 ? Math.round((rawTotal / (1024 * 1024 * 1024)) * 100) : 0;
      body.innerHTML =
        '<div class="pm-storage-stat-row"><span class="pm-storage-stat-label">合計 / Tổng ảnh</span><span class="pm-storage-stat-value">' + (s.total || 0) + ' 件</span></div>' +
        '<div class="pm-storage-stat-row"><span class="pm-storage-stat-label">アクティブ</span><span class="pm-storage-stat-value">' + (s.active || 0) + ' 件</span></div>' +
        '<div class="pm-storage-stat-row"><span class="pm-storage-stat-label">ゴミ箱</span><span class="pm-storage-stat-value">' + (s.trash || 0) + ' 件 / ' + trashSize + '</span></div>' +
        '<div class="pm-storage-stat-row"><span class="pm-storage-stat-label">使用量 / Đã dùng</span><span class="pm-storage-stat-value">' + total + '</span></div>' +
        '<div class="pm-storage-big-bar"><div class="pm-storage-big-fill" style="width:' + pct + '%"></div></div>' +
        '<div style="font-size:10px;color:var(--pm-text-mute);text-align:right">' + pct + '% / 1 GB</div>';
    };

    /* Fallback từ dữ liệu đã tải */
    var fallbackStats = {
      total:     self._allPhotos.length,
      active:    self._allPhotos.filter(function (p) { return p.state === 'active'; }).length,
      trash:     self._allPhotos.filter(function (p) { return p.state === 'trash';  }).length,
      totalSize: self._allPhotos.reduce(function (a, p) { return a + (Number(((p && (p.file_size !== undefined ? p.file_size : (p.filesize !== undefined ? p.filesize : p.fileSize))) || 0)) || 0); }, 0),
      trashSize: self._allPhotos.filter(function (p) { return p.state === 'trash'; }).reduce(function (a, p) { return a + (Number(((p && (p.file_size !== undefined ? p.file_size : (p.filesize !== undefined ? p.filesize : p.fileSize))) || 0)) || 0); }, 0)
    };

    if (typeof DevPS.getStorageStats === 'function') {
      DevPS.getStorageStats(opts).then(function (s) {
        if (!s || s.error) { renderStats(fallbackStats); return; }
        renderStats(s);
      }).catch(function () { renderStats(fallbackStats); });
    } else {
      renderStats(fallbackStats);
    }

    modal.classList.remove('pm-hidden');
    requestAnimationFrame(function () { modal.classList.add('pm-show'); });
  };

  PhotoManagerModule.prototype._closeStorageModal = function () {
    var modal = document.getElementById('pmStorageModal');
    if (modal) { modal.classList.remove('pm-show'); setTimeout(function () { modal.classList.add('pm-hidden'); }, 200); }
  };

  /* ── TRANSFER MODAL ────────────────────────────────────────── */
  PhotoManagerModule.prototype._openTransferModal = function (ids) {
    this._transferIds    = ids;
    this._transferTarget = null;
    var modal   = document.getElementById('pmTransferModal');
    var results = document.getElementById('pmTransferResults');
    if (!modal) return;
    if (results) results.innerHTML = '<div style="padding:12px;color:var(--pm-text-mute);font-size:12px;">Tìm kiếm thiết bị để chuyển...</div>';
    modal.classList.remove('pm-hidden');
    requestAnimationFrame(function () { modal.classList.add('pm-show'); });
    var search = document.getElementById('pmTransferSearch');
    if (search) { search.value = ''; search.focus(); }
  };

  PhotoManagerModule.prototype._closeTransferModal = function () {
    var modal = document.getElementById('pmTransferModal');
    if (modal) { modal.classList.remove('pm-show'); setTimeout(function () { modal.classList.add('pm-hidden'); }, 200); }
    this._transferIds    = null;
    this._transferTarget = null;
  };

  /* ── CONFIRM DIALOG ─────────────────────────────────────────── */
  PhotoManagerModule.prototype._showConfirm = function (msg, sub, okLabel, onOk, danger) {
    var self = this;
    var dlg  = document.getElementById('pmConfirmDialog');
    if (!dlg) return;

    // Ép confirm dialog luôn nổi lên trên Photo Manager (kể cả khi CSS dùng !important)
    try {
      dlg.style.setProperty('position', 'fixed', 'important');
      dlg.style.setProperty('inset', '0', 'important');
      dlg.style.setProperty('z-index', '2147483646', 'important');
    } catch (e) {}
    _setText('pmConfirmMsg', msg);
    _setText('pmConfirmSub', sub || '');
    var okBtn = document.getElementById('pmConfirmOk');
    if (okBtn) {
      okBtn.textContent  = okLabel || '確認';
      okBtn.style.background = danger !== false ? 'var(--pm-red)' : 'var(--pm-blue)';
      okBtn.onclick = function () { self._closeConfirm(); if (onOk) onOk(); };
    }
    dlg.classList.remove('pm-hidden');
    requestAnimationFrame(function () { dlg.classList.add('pm-show'); });
  };

  PhotoManagerModule.prototype._closeConfirm = function () {
    var dlg = document.getElementById('pmConfirmDialog');
    if (dlg) { dlg.classList.remove('pm-show'); setTimeout(function () { dlg.classList.add('pm-hidden'); }, 150); }
  };

  /* ── ACTIONS ────────────────────────────────────────────────── */
  PhotoManagerModule.prototype._handleSetThumbnail = function (record) {
    var self  = this;
    var DevPS = global.DevicePhotoStore;
    if (!DevPS) return;
    this._showToast('info', 'サムネイル作成中... / Đang tạo thumbnail...');
    DevPS.setAsThumbnail(record.id).then(function (res) {
      if (res && res.error) { self._showToast('error', 'エラー: ' + res.error.message); return; }
      self._showToast('success', 'サムネイル設定完了 / Đã đặt ảnh đại diện');
      self._loadPhotos();
    });
  };

  PhotoManagerModule.prototype._handleMoveToTrash = function (ids) {
    var self  = this;
    var DevPS = global.DevicePhotoStore;
    if (!DevPS) return;
    this._showConfirm(
      'ゴミ箱へ移動 / Chuyển vào thùng rác',
      ids.length + ' 件の写真をゴミ箱へ移動します。',
      'ゴミ箱へ / Xóa',
      function () {
        // Optimistic UI
        ids.forEach(function(id) {
            var it = self._allPhotos.find(function(p){ return String(p.id) === String(id); });
            if (it) it.state = 'trash';
        });
        self._clearSelection();
        self._applyFilters();

        DevPS.moveToTrashBulk(ids).then(function () {
          self._showToast('success', ids.length + ' 件をゴミ箱へ移動しました');
          self._invalidateCache(self._getCacheKey());
          self._loadPhotos(true, true);
        });
      }
    );
  };

  PhotoManagerModule.prototype._handleRestore = function (ids) {
    var self     = this;
    var DevPS    = global.DevicePhotoStore;
    if (!DevPS) return;

    // Optimistic UI
    ids.forEach(function(id) {
       var it = self._allPhotos.find(function(p){ return String(p.id) === String(id); });
       if (it) it.state = 'active';
    });
    self._clearSelection();
    self._applyFilters();

    var promises = ids.map(function (id) { return DevPS.restoreFromTrash(id); });
    Promise.all(promises).then(function () {
      self._showToast('success', ids.length + ' 件を復元しました / Đã khôi phục ' + ids.length + ' ảnh');
      self._invalidateCache(self._getCacheKey());
      self._loadPhotos(true, true);
    });
  };

  PhotoManagerModule.prototype._handlePermanentDelete = function (ids) {
    var self  = this;
    var DevPS = global.DevicePhotoStore;
    if (!DevPS) return;
    this._showConfirm(
      '完全削除 / Xóa vĩnh viễn',
      ids.length + ' 件の写真を完全に削除します。この操作は取り消せません。',
      '完全削除 / Xóa vĩnh viễn',
      function () {
        // Optimistic UI
        self._allPhotos = self._allPhotos.filter(function(p) { return ids.indexOf(p.id) === -1 && ids.indexOf(String(p.id)) === -1; });
        self._clearSelection();
        self._applyFilters();

        DevPS.permanentDeleteBulk(ids).then(function (r) {
          self._showToast('success', ((r && r.deleted) || 0) + ' 件を完全削除しました');
          self._invalidateCache(self._getCacheKey());
          self._loadPhotos(true, true);
        });
      }
    );
  };

  /* ── TOAST ───────────────────────────────────────────────────── */
  PhotoManagerModule.prototype._showToast = function (type, msg) {
    this._ensureToastOnTop();
    var container = document.getElementById('pmToastContainer');
    if (!container) return;
    var icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    var toast = document.createElement('div');
    toast.className = 'pm-toast pm-toast-' + type;
    toast.innerHTML = '<i class="fas ' + (icons[type] || 'fa-info-circle') + '"></i> ' + msg;
    container.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity    = '0';
      toast.style.transition = 'opacity .3s';
      setTimeout(function () { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 350);
    }, 3500);
  };

  /* ── SHOW LOADING ─────────────────────────────────────────────── */
  PhotoManagerModule.prototype._showLoading = function (show) {
    var el = document.getElementById('pmLoading');
    if (el) el.classList.toggle('pm-hidden', !show);
    if (show) {
      ['pmGridLarge', 'pmGridSmall', 'pmDetailView', 'pmEmpty'].forEach(function (id) {
        var e = document.getElementById(id);
        if (e) e.classList.add('pm-hidden');
      });
    }
  };

  PhotoManagerModule.prototype._getFullUrl = function(p) {
    if (!p) return '';
    var DevPS = global.DevicePhotoStore;
    if (DevPS && typeof DevPS.getFullUrl === 'function') return DevPS.getFullUrl(p);
    return p.public_url || '';
  };

  PhotoManagerModule.prototype._downloadFile = function(url, filename) {
    if (!url) return Promise.resolve();
    var self = this;
    return fetch(url)
      .then(function(res) {
        if (!res.ok) throw new Error('Network err');
        return res.blob();
      })
      .then(function(blob) {
        var blobUrl = window.URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.style.display = 'none';
        a.href = blobUrl;
        a.download = filename || 'photo.jpg';
        document.body.appendChild(a);
        a.click();
        setTimeout(function() {
          window.URL.revokeObjectURL(blobUrl);
          if (a.parentNode) a.parentNode.removeChild(a);
        }, 100);
      })
      .catch(function(err) {
        var a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        setTimeout(function() { if(a.parentNode) a.parentNode.removeChild(a); }, 100);
      });
  };

  PhotoManagerModule.prototype._handleBulkDownload = function(ids) {
    if(!ids || !ids.length) return;
    var self = this;
    self._showToast('info', '順番にダウンロードします... / Chuẩn bị tải xuống...');
    
    // Dùng Promise.all thay vì setTimeout tuần tự để giữ active click user gesture, tránh browser popup blocker ngăn chặn
    var dlPromises = ids.map(function(id, index) {
        var rec = self._filtered.find(function(p) { return String(p.id) === String(id); });
        if (rec) {
            var url = self._getFullUrl(rec);
            if (url) {
                return self._downloadFile(url, rec.original_filename || ('photo_' + index + '.jpg'));
            }
        }
        return Promise.resolve();
    });

    Promise.all(dlPromises).then(function() {
        self._clearSelection();
        self._showToast('success', ids.length + '件のダウンロードを完了しました / Đã tải xong ' + ids.length + ' ảnh');
    }).catch(function(err) {
        self._showToast('error', 'Lỗi khi tải ảnh: ' + err.message);
    });
  };

  /* ──────────────────────────────────────────────────────────
     BIND ALL EVENTS
  ────────────────────────────────────────────────────────── */
  PhotoManagerModule.prototype._bindAll = function () {
    var self = this;

    /* Mobile Hamburger Menu */
    var hamBtn = document.getElementById('pmHamburgerBtn');
    var navBd = document.getElementById('pmNavBackdrop');
    var leftNav = document.getElementById('pmLeftNav');
    if (hamBtn && leftNav && navBd) {
      hamBtn.addEventListener('click', function() {
        leftNav.classList.add('pm-show');
        navBd.classList.add('pm-show');
      });
      navBd.addEventListener('click', function() {
        leftNav.classList.remove('pm-show');
        navBd.classList.remove('pm-show');
      });
      // Đóng sidebar khi chọn một item trên mobile
      var navItems = leftNav.querySelectorAll('.pm-leftnav-item');
      navItems.forEach(function(item) {
        item.addEventListener('click', function() {
          if (window.innerWidth <= 1024) {
            leftNav.classList.remove('pm-show');
            navBd.classList.remove('pm-show');
          }
        });
      });
    }

    /* Close */
    var closeBtn = document.getElementById('pmCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', function () { self.close(); });

    /* Backdrop click đóng overlay */
    var overlay = document.getElementById('pmOverlay');
    if (overlay) overlay.addEventListener('click', function (e) {
      if (e.target === overlay) self.close();
    });

    /* Clear device filter */
    var clearFilter = document.getElementById('pmClearFilterBtn');
    if (clearFilter) clearFilter.addEventListener('click', function () {
      self._deviceFilter = null;
      self._applyDeviceFilter();
      self._loadPhotos();
    });

    /* Search */
    var searchInput = document.getElementById('pmSearchInput');
    if (searchInput) {
      var searchTimer;
      searchInput.addEventListener('input', function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () { self._search = searchInput.value; self._applyFilters(); }, 280);
      });
    }

    /* Filter chips */
    document.querySelectorAll('#pmFilterChips .pm-filter-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var state  = chip.dataset.state;
        var active = chip.classList.contains('pm-active');
        document.querySelectorAll('#pmFilterChips .pm-filter-chip').forEach(function (c) { c.classList.remove('pm-active'); });
        if (!active) {
          chip.classList.add('pm-active');
          self._stateFilter = state;
        } else {
          self._stateFilter = '';
        }
        self._applyFilters();
      });
    });

    /* Sort */
    var sortSelect = document.getElementById('pmSortSelect');
    if (sortSelect) sortSelect.addEventListener('change', function () {
      var parts     = this.value.split('-');
      self._sort    = { field: parts[0], dir: parts[1] || 'desc' };
      self._applyFilters();
    });

    /* View switcher */
    document.querySelectorAll('.pm-view-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self._view = btn.dataset.view;
        document.querySelectorAll('.pm-view-btn').forEach(function (b) {
          b.classList.toggle('pm-active', b.dataset.view === self._view);
        });
        self._render();
      });
    });

    /* Left nav */
    document.querySelectorAll('.pm-leftnav-item[data-nav]').forEach(function (item) {
      item.addEventListener('click', function () {
        document.querySelectorAll('.pm-leftnav-item').forEach(function (i) { i.classList.remove('pm-active'); });
        item.classList.add('pm-active');
        self._navKey = item.dataset.nav;
        self._applyFilters();
      });
    });

    /* Upload button – mở popup upload, không đóng Photo Manager (v8.4.6-4) */
    

    // Refresh button (v8.4.6-4)
    var refreshBtn = document.getElementById('pmRefreshBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', function () {
      self._invalidateCache(self._getCacheKey());
      self._invalidateImageCache();
      self._loadPhotos(true);
    });

    // Bulk generate missing thumbnails
    var genThumbBtn = document.getElementById('pmGenThumbBtn');
    if (genThumbBtn) genThumbBtn.addEventListener('click', function () {
      var list = Array.isArray(self._allPhotos) ? self._allPhotos : [];
      // Chỉ lấy ảnh chưa có thumb URL
      var missing = list.filter(function (p) {
        return !self._getThumbUrl(p) && !!self._getFullUrl(p);
      });

      if (!missing.length) {
        self._showToast('info', 'Không có ảnh nào cần tạo thumbnail');
        return;
      }

      self._showConfirm(
        'Tạo thumbnail',
        'Sẽ tạo thumbnail cho ' + missing.length + ' ảnh chưa có. Có thể mất vài phút.',
        'Tạo',
        function () {
          self._createMissingThumbsBulk({ concurrency: 2, maxW: 240, maxH: 240, quality: 0.72 });
        },
        false
      );
    });

    var uploadBtn = document.getElementById('pmUploadBtn');
    if (uploadBtn) uploadBtn.addEventListener('click', function () {
      var pu = global.PhotoUpload || global.PhotoUploadTool;
      if (!pu || typeof pu.open !== 'function') {
        self._showToast('warning', 'Chưa tải module upload ảnh.');
        return;
      }

      var openOpts = (self._deviceFilter)
        ? { mode: 'device', deviceType: self._deviceFilter.type, deviceId: self._deviceFilter.id, deviceCode: self._deviceFilter.code }
        : { mode: 'standalone' };

      try { pu.open(openOpts); }
      catch (e) {
        try { pu.open(); } catch (e2) {}
      }

      // Không tự refresh sau mỗi lần gửi ảnh.
      // Event 'photo-upload-done' chỉ invalidate cache + hiện toast.
    });


    /* Storage button */
    var storageBtn = document.getElementById('pmStorageBtn');
    if (storageBtn) storageBtn.addEventListener('click', function () { self._openStorageModal(); });

    /* Storage modal buttons */
    var storageClose  = document.getElementById('pmStorageClose');
    var storageClose2 = document.getElementById('pmStorageCloseBtn2');
    if (storageClose)  storageClose.addEventListener('click',  function () { self._closeStorageModal(); });
    if (storageClose2) storageClose2.addEventListener('click', function () { self._closeStorageModal(); });

    var emptyTrashBtn = document.getElementById('pmEmptyTrashBtn');
    if (emptyTrashBtn) emptyTrashBtn.addEventListener('click', function () {
      var opts = self._deviceFilter
        ? { deviceType: self._deviceFilter.type, deviceId: self._deviceFilter.id }
        : {};
      self._showConfirm(
        'ゴミ箱を空にする / Dọn sạch thùng rác',
        'すべてのゴミ箱内の写真を完全に削除します。',
        '空にする / Dọn',
        function () {
          // Optimistic UI
          self._allPhotos = self._allPhotos.filter(function(p) { return p.state !== 'trash'; });
          self._applyFilters();

          var DevPS = global.DevicePhotoStore;
          if (DevPS) DevPS.emptyTrash(opts).then(function (r) {
            self._showToast('success', ((r && r.deleted) || 0) + ' 件を削除しました');
            self._closeStorageModal();
            self._invalidateCache(self._getCacheKey());
            self._loadPhotos(true, true);
          });
        }
      );
    });

    // Nút "Dọn rác" ở toolbar (xóa toàn bộ ảnh trong thùng rác)
    var emptyTrashTopBtn = document.getElementById('pmEmptyTrashTopBtn');
    if (emptyTrashTopBtn) {
      emptyTrashTopBtn.addEventListener('click', function () {
        var DevPS = global.DevicePhotoStore;
        if (!DevPS || typeof DevPS.emptyTrash !== 'function') return;

        // Nếu bạn đang lọc theo 1 thiết bị, thì chỉ dọn rác của thiết bị đó
        var opts = self._deviceFilter ? { deviceType: self._deviceFilter.type, deviceId: self._deviceFilter.id } : {};

        self._showConfirm(
          'ゴミ箱を空にする / Xóa hết thùng rác',
          'Thao tác này sẽ xóa vĩnh viễn toàn bộ ảnh trong thùng rác (không khôi phục được).',
          '削除 / Xóa',
          function () {
            // Optimistic UI
            self._allPhotos = self._allPhotos.filter(function(p) { return p.state !== 'trash'; });
            self._applyFilters();

            DevPS.emptyTrash(opts).then(function (r) {
              var del = (r && r.deleted) ? r.deleted : 0;
              self._showToast('success', 'Đã xóa ' + del + ' ảnh trong thùng rác');
              self._invalidateCache(self._getCacheKey());
              self._loadPhotos(true, true);
            }).catch(function (e) {
              self._showToast('error', (e && e.message) ? e.message : 'Empty trash error');
            });
          }
        );
      });
    }

    /* Selection Mode Toggle Button */
    var enableSelModeBtn = document.getElementById('pmEnableSelectModeBtn');
    if (enableSelModeBtn) {
      enableSelModeBtn.addEventListener('click', function() {
        self._selMode = !self._selMode;
        if (!self._selMode) {
          self._clearSelection();
          var sbg = document.querySelector('.pm-selection-mode');
          if (sbg) sbg.classList.remove('pm-selection-mode');
        } else {
          document.querySelectorAll('.pm-grid').forEach(function(g) {
            if (!g.classList.contains('pm-hidden')) g.classList.add('pm-selection-mode');
          });
          self._updateSelectionBar();
        }
      });
    }

    /* Selection bar */
    var selDownload = document.getElementById('pmSelDownload');
    if (selDownload) {
      selDownload.addEventListener('click', function() {
        self._handleBulkDownload(Array.from(self._selected));
      });
    }

    var selCancel = document.getElementById('pmSelCancel');
    if (selCancel) selCancel.addEventListener('click', function () { self._clearSelection(); });

    var selTrash = document.getElementById('pmSelTrash');
    if (selTrash) selTrash.addEventListener('click', function () {
      self._handleMoveToTrash(Array.from(self._selected));
    });

    var selDelete = document.getElementById('pmSelDelete');
    if (selDelete) selDelete.addEventListener('click', function () {
      self._handlePermanentDelete(Array.from(self._selected));
    });

    var selSetThumb = document.getElementById('pmSelSetThumb');
    if (selSetThumb) selSetThumb.addEventListener('click', function () {
      var ids = Array.from(self._selected);
      if (ids.length !== 1) { self._showToast('warning', '1 件のみ選択してください'); return; }
      var rec = self._filtered.find(function (p) { return String(p.id) === String(ids[0]); });
      if (rec) self._handleSetThumbnail(rec);
    });

    var selTransfer = document.getElementById('pmSelTransfer');
    if (selTransfer) selTransfer.addEventListener('click', function () {
      self._openTransferModal(Array.from(self._selected));
    });

    /* Lightbox */
    var lbClose = document.getElementById('pmLbClose');
    if (lbClose) lbClose.addEventListener('click', function () { self._closeLightbox(); });

    var lbPrev = document.getElementById('pmLbPrev');
    if (lbPrev) lbPrev.addEventListener('click', function () { self._lbIndex--; self._renderLightboxSlide(); });

    var lbNext = document.getElementById('pmLbNext');
    if (lbNext) lbNext.addEventListener('click', function () { self._lbIndex++; self._renderLightboxSlide(); });

    var lbInfo = document.getElementById('pmLbInfo');
    if (lbInfo) lbInfo.addEventListener('click', function () {
      var rec = self._filtered[self._lbIndex];
      if (rec) { self._closeLightbox(); self._openInfoPanel(rec); }
    });

    var lbDl = document.getElementById('pmLbDownload');
    if (lbDl) lbDl.addEventListener('click', function () {
      var rec = self._filtered[self._lbIndex];
      var url = self._getFullUrl(rec);
      if (!rec || !url) return;
      
      self._showToast('info', 'ダウンロード中... / Đang tải ảnh xuống...');
      self._downloadFile(url, rec.original_filename || 'photo.jpg');
    });

    /* Keyboard navigation for lightbox */
    document.addEventListener('keydown', function (e) {
      var lb = document.getElementById('pmLightbox');
      if (!lb || lb.classList.contains('pm-hidden')) return;
      if (e.key === 'ArrowLeft')  { self._lbIndex--; self._renderLightboxSlide(); }
      if (e.key === 'ArrowRight') { self._lbIndex++; self._renderLightboxSlide(); }
      if (e.key === 'Escape')     { self._closeLightbox(); }
    });

    /* Info panel */
    var infoClose = document.getElementById('pmInfoClose');
    if (infoClose) infoClose.addEventListener('click', function () { self._closeInfoPanel(); });

    var infoCancel = document.getElementById('pmInfoCancelBtn');
    if (infoCancel) infoCancel.addEventListener('click', function () { self._closeInfoPanel(); });

    var infoSave = document.getElementById('pmInfoSaveBtn');
    if (infoSave) infoSave.addEventListener('click', function () {
      if (!self._currentRecord) return;
      var notes = (document.getElementById('pmInfoNotes') || {}).value || '';
      var DevPS = global.DevicePhotoStore;
      if (DevPS) DevPS.updatePhoto(self._currentRecord.id, { notes: notes }).then(function () {
        self._showToast('success', '保存しました / Đã lưu');
        self._loadPhotos();
      });
    });

    /* Transfer modal */
    var transferSearch = document.getElementById('pmTransferSearch');
    if (transferSearch) {
      var tTimer;
      transferSearch.addEventListener('input', function () {
        clearTimeout(tTimer);
        tTimer = setTimeout(function () { self._renderTransferResults(transferSearch.value); }, 250);
      });
    }

    var transferCancel = document.getElementById('pmTransferCancelBtn');
    if (transferCancel) transferCancel.addEventListener('click', function () { self._closeTransferModal(); });

    var transferConfirm = document.getElementById('pmTransferConfirmBtn');
    if (transferConfirm) transferConfirm.addEventListener('click', function () {
      if (!self._transferTarget || !self._transferIds) return;
      var DevPS    = global.DevicePhotoStore;
      if (!DevPS) return;
      var promises = self._transferIds.map(function (id) {
        return DevPS.transferToDevice(id, self._transferTarget.type, self._transferTarget.id);
      });
      Promise.all(promises).then(function () {
        self._showToast('success', self._transferIds.length + ' 件を移動しました');
        self._closeTransferModal();
        self._clearSelection();
        self._loadPhotos();
      });
    });

    /* Confirm dialog cancel */
    var confirmCancel = document.getElementById('pmConfirmCancelBtn');
    if (confirmCancel) confirmCancel.addEventListener('click', function () { self._closeConfirm(); });

    

    // Click device link -> mở nhanh Detail Panel (v8.4.6-4)
    if (!self._deviceLinkBound) {
      self._deviceLinkBound = true;
      document.addEventListener('click', function (e) {
        var a = e.target && e.target.closest ? e.target.closest('.pm-device-link') : null;
        if (!a) return;
        
        // Ngăn chặn sự xâm nhập thô bạo từ bên ngoài nếu ta đang ân ái bên trong pmOverlay
        var ov = document.getElementById('pmOverlay');
        if (ov && !ov.classList.contains('pm-hidden') && ov.contains(e.target)) {
             return; 
        }

        e.preventDefault();
        e.stopPropagation();
        var t = (a.dataset.type || '').trim();
        var id = (a.dataset.id || '').trim();
        if (!t || !id) return;
        self._openDeviceDetail(t, id);
      }, true);
    }


    /* Hide context menu on outside click */
    document.addEventListener('click', function (e) {
      var menu = document.getElementById('pmContextMenu');
      if (menu && !menu.contains(e.target)) self._hideContextMenu();
    });

    /* Modal backdrops */
    var storageModal = document.getElementById('pmStorageModal');
    if (storageModal) storageModal.addEventListener('click', function (e) {
      if (e.target === storageModal) self._closeStorageModal();
    });

    var transferModal = document.getElementById('pmTransferModal');
    if (transferModal) transferModal.addEventListener('click', function (e) {
      if (e.target === transferModal) self._closeTransferModal();
    });

    var confirmDialog = document.getElementById('pmConfirmDialog');
    if (confirmDialog) confirmDialog.addEventListener('click', function (e) {
      if (e.target === confirmDialog) self._closeConfirm();
    });
  };

  /* ── Transfer search results ────────────────────────────── */
  PhotoManagerModule.prototype._renderTransferResults = function (query) {
    var self    = this;
    var results = document.getElementById('pmTransferResults');
    if (!results) return;
    if (!query.trim()) { results.innerHTML = ''; return; }
    var items = [];
    if (global.DataManager && typeof global.DataManager.getAllItems === 'function') {
      items = global.DataManager.getAllItems() || [];
    }
    var q       = query.toLowerCase();
    var matched = items.filter(function (it) {
      var code = (it.MoldCode || it.CutterNo || '').toLowerCase();
      var name = (it.MoldName || it.CutterName || '').toLowerCase();
      return code.includes(q) || name.includes(q);
    }).slice(0, 8);

    if (!matched.length) {
      results.innerHTML = '<div style="padding:10px;font-size:12px;color:var(--pm-text-mute);">見つかりません / Không tìm thấy</div>';
      return;
    }
    results.innerHTML = matched.map(function (it) {
      var code = it.MoldCode || it.CutterNo   || '';
      var name = it.MoldName || it.CutterName || '';
      var id   = String(it.MoldID || it.CutterID || '');
      var type = it.type || 'mold';
      return '<div class="pm-transfer-item" data-id="' + id + '" data-type="' + type + '" data-code="' + code + '">' +
             (type === 'mold' ? '🔧 ' : '✂️ ') + '<strong>' + code + '</strong> ' + name + '</div>';
    }).join('');

    results.querySelectorAll('.pm-transfer-item').forEach(function (item) {
      item.addEventListener('click', function () {
        results.querySelectorAll('.pm-transfer-item').forEach(function (i) { i.classList.remove('pm-selected'); });
        item.classList.add('pm-selected');
        self._transferTarget = { type: item.dataset.type, id: item.dataset.id, code: item.dataset.code };
      });
    });
  };

  

  /* CACHE + THUMB + INCREMENTAL RENDER (v8.4.6-4) */
  PhotoManagerModule.prototype._getCacheKey = function () {
    if (this._deviceFilter && this._deviceFilter.type && this._deviceFilter.id) {
      return String(this._deviceFilter.type) + '|' + String(this._deviceFilter.id);
    }
    return 'all';
  };

  PhotoManagerModule.prototype._invalidateCache = function (key) {
    try {
      if (!this._photoCache) this._photoCache = new Map();
      if (key) this._photoCache.delete(String(key));
      else this._photoCache.clear();
    } catch (e) {}
  };

  PhotoManagerModule.prototype._getCacheEntry = function (key) {
    try {
      if (!this._photoCache) this._photoCache = new Map();
      var k = String(key || this._getCacheKey());
      var ent = this._photoCache.get(k);
      
      var age = 0;
      if (ent) {
        age = Date.now() - Number(ent.ts || 0);
        if (age <= (this._cacheTtlMs || (10 * 60 * 1000)) && Array.isArray(ent.photos)) return ent;
        this._photoCache.delete(k);
      }
      
      // Try sessionStorage
      var sessStr = sessionStorage.getItem('mcs_pm_cache_' + k);
      if (sessStr) {
        var parsed = JSON.parse(sessStr);
        if (parsed) {
          age = Date.now() - Number(parsed.ts || 0);
          if (age <= (this._cacheTtlMs || (10 * 60 * 1000)) && Array.isArray(parsed.photos)) {
            this._photoCache.set(k, parsed);
            return parsed;
          } else {
            sessionStorage.removeItem('mcs_pm_cache_' + k);
          }
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  PhotoManagerModule.prototype._setCacheEntry = function (key, photos) {
    try {
      if (!this._photoCache) this._photoCache = new Map();
      var k = String(key || this._getCacheKey());
      var dataObj = { photos: Array.isArray(photos) ? photos : [], ts: Date.now() };
      this._photoCache.set(k, dataObj);
      try {
        sessionStorage.setItem('mcs_pm_cache_' + k, JSON.stringify(dataObj));
      } catch (e2) {
        console.warn('SessionStorage limit reached or blocked');
      }
    } catch (e) {}
  };

  PhotoManagerModule.prototype._getThumbUrl = function (p) {
    if (!p) return null;

    // Ưu tiên key có dấu gạch dưới (đúng dữ liệu gốc), nhưng vẫn hỗ trợ các biến thể khác
    var url =
      p.thumb_public_url ||
      p.thumbpublicurl ||
      p.thumbPublicUrl ||

      p.thumb_url ||
      p.thumburl ||
      p.thumbUrl ||

      null;

    // Chặn trường hợp “thumb” thực ra đang trỏ nhầm sang ảnh lớn
    // Thumb đúng chuẩn do device-photo-store-v8.4.3-7 tạo ra là file có prefix 'thumb_'
    if (url && typeof url === 'string') {
      var looksThumb = (url.indexOf('thumb_') !== -1);
      if (!looksThumb) return null;
    }

    return url;
  };


  PhotoManagerModule.prototype._getFullUrl = function (p) {
    if (!p) return '';
    return (
      p.publicurl ||
      p.public_url ||
      p.fullurl ||
      p.full_url ||
      this._getThumbUrl(p) ||
      ''
    );
  };

  PhotoManagerModule.prototype._ensureToastOnTop = function () {
    try {
      var c = document.getElementById('pmToastContainer');
      if (!c) return;

      // Đưa toast ra body để không bị container/overlay che
      if (c.parentNode !== document.body) document.body.appendChild(c);

      c.style.setProperty('position', 'fixed', 'important');
      c.style.setProperty('left', '12px', 'important');
      c.style.setProperty('right', '12px', 'important');
      c.style.setProperty('bottom', '12px', 'important');
      c.style.setProperty('z-index', '2147483647', 'important');
      c.style.setProperty('pointer-events', 'none', 'important');
    } catch (e) {}
  };

  PhotoManagerModule.prototype._invalidateImageCache = function () {
    try {
      if (this.imgMem && this.imgMem.forEach) {
        this.imgMem.forEach(function (v) {
          try { if (v && v.objUrl) URL.revokeObjectURL(v.objUrl); } catch (e) {}
        });
      }
    } catch (e) {}
    try { this.imgMem = new Map(); } catch (e) { this.imgMem = null; }

    // Xóa Cache Storage (nếu trình duyệt hỗ trợ)
    try {
      if (window.caches && window.caches.delete) {
        window.caches.delete(this._imgCacheNameFull || 'mcs-photo-full-v1');
        window.caches.delete(this._imgCacheNameThumb || 'mcs-photo-thumb-v1');
      }
    } catch (e) {}
  };

  PhotoManagerModule.prototype._imgMemGet = function (url) {
    try {
      if (!url) return null;
      if (!this.imgMem) this.imgMem = new Map();
      var ent = this.imgMem.get(url);
      if (!ent) return null;

      var age = Date.now() - Number(ent.ts || 0);
      if (age > Number(this.imgMemTtlMs || 0)) {
        try { if (ent.objUrl) URL.revokeObjectURL(ent.objUrl); } catch (e) {}
        this.imgMem.delete(url);
        return null;
      }
      return ent.objUrl || null;
    } catch (e) { return null; }
  };

  PhotoManagerModule.prototype._imgMemPut = function (url, blob) {
    try {
      if (!url || !blob) return null;
      if (!this.imgMem) this.imgMem = new Map();

      var limit = Number(this.imgMemLimit || 0) || 180;
      if (this.imgMem.size >= limit) {
        var oldestKey = null;
        var oldestTs = Infinity;
        this.imgMem.forEach(function (v, k) {
          var ts = Number((v && v.ts) || 0);
          if (ts < oldestTs) { oldestTs = ts; oldestKey = k; }
        });
        if (oldestKey) {
          var ov = this.imgMem.get(oldestKey);
          try { if (ov && ov.objUrl) URL.revokeObjectURL(ov.objUrl); } catch (e) {}
          this.imgMem.delete(oldestKey);
        }
      }

      var obj = URL.createObjectURL(blob);
      this.imgMem.set(url, { objUrl: obj, ts: Date.now() });
      return obj;
    } catch (e) { return null; }
  };

  PhotoManagerModule.prototype._fetchBlobWithCache = function (url, cacheName) {
    var self = this;
    return new Promise(function (resolve, reject) {
      try {
        if (!url) return reject(new Error('no url'));

        var useCaches = window.caches && typeof window.caches.open === 'function';
        if (!useCaches) {
          fetch(url)
            .then(function (r) { if (!r) throw new Error('HTTP ERR'); return r.blob(); })
            .then(resolve).catch(reject);
          return;
        }

        var cname = cacheName || self._imgCacheNameFull || 'mcs-photo-full-v1';
        window.caches.open(cname).then(function (cache) {
          cache.match(url).then(function (hit) {
            if (hit) { hit.blob().then(resolve).catch(reject); return; }

            fetch(url).then(function (r) {
              if (!r) throw new Error('HTTP ERR');
              try { cache.put(url, r.clone()).catch(function () {}); } catch (e) {}
              return r.blob();
            }).then(resolve).catch(reject);
          }).catch(function () {
            fetch(url)
              .then(function (r) { if (!r) throw new Error('HTTP ERR'); return r.blob(); })
              .then(resolve).catch(reject);
          });
        }).catch(function () {
          fetch(url)
            .then(function (r) { if (!r) throw new Error('HTTP ERR'); return r.blob(); })
            .then(resolve).catch(reject);
        });
      } catch (e) { reject(e); }
    });
  };

  PhotoManagerModule.prototype._setImgElFromUrlCached = function (imgEl, url, cacheName) {
    try {
      if (!imgEl) return;

      if (!url) {
        try { imgEl.removeAttribute('src'); } catch (e) {}
        return;
      }

      var mem = this._imgMemGet(url);
      if (mem) { imgEl.src = mem; return; }

      if (imgEl.dataset) imgEl.dataset.pmSrc = url;

      var self = this;
      this._fetchBlobWithCache(url, cacheName).then(function (blob) {
        var obj = self._imgMemPut(url, blob);
        if (!obj) return;
        if (!imgEl.dataset || imgEl.dataset.pmSrc !== url) return;
        imgEl.src = obj;
      }).catch(function () {
        // fallback: dùng URL trực tiếp
        if (!imgEl.dataset || imgEl.dataset.pmSrc !== url) return;
        imgEl.src = url;
      });
    } catch (e) {}
  };

  PhotoManagerModule.prototype._prefetchFull = function (url) {
    try {
      if (!url) return;
      if (this._imgMemGet(url)) return;

      var self = this;
      this._fetchBlobWithCache(url, this._imgCacheNameFull).then(function (blob) {
        self._imgMemPut(url, blob);
      }).catch(function () {});
    } catch (e) {}
  };

  PhotoManagerModule.prototype._pmSetBaseZ = function (mode) {
    try {
      var ov = document.getElementById('pmOverlay');
      var ct = document.getElementById('pmContainer');
      if (!ov || !ct) return;

      // DetailPanel đang zIndex = 9999, nên PM phải < 9999 khi muốn panel nổi lên
      var TOP_OV = 12000;
      var TOP_CT = 12010;

      var BEHIND_OV = 9980;
      var BEHIND_CT = 9981;

      if (mode === 'behind') {
        ov.style.zIndex = String(BEHIND_OV);
        ct.style.zIndex = String(BEHIND_CT);
      } else {
        ov.style.zIndex = String(TOP_OV);
        ct.style.zIndex = String(TOP_CT);
      }
    } catch (e) {}
  };

  PhotoManagerModule.prototype._pmIsDetailPanelOpen = function () {
    try {
      // Không phụ thuộc id, chỉ cần thấy .detail-panel.open là đủ
      var el = document.querySelector('.detail-panel.open');
      return !!el;
    } catch (e) {
      return false;
    }
  };

  PhotoManagerModule.prototype._openDeviceDetail = function (deviceType, deviceId) {
    try {
      var t = String(deviceType || '').toLowerCase().trim();
      var id = String(deviceId || '').trim();
      if (!t || !id) return;

      var item = null;
      if (window.DataManager && typeof window.DataManager.getAllItems === 'function') {
        var all = window.DataManager.getAllItems() || [];
        item = all.find(function (it) {
          if (!it) return false;
          var itType = String(it.type || it.itemType || '').toLowerCase().trim();
          if (itType !== t) return false;
          if (t === 'mold') return String(it.MoldID || it.MoldCode || it.id || '').trim() === id;
          return String(it.CutterID || it.CutterNo || it.id || '').trim() === id;
        }) || null;
      }

      if (!item) {
        if (t === 'mold') item = { MoldID: id, MoldCode: id, type: 'mold' };
        else item = { CutterID: id, CutterNo: id, type: 'cutter' };
      }
      
      this._pmSetBaseZ('behind');

      setTimeout(function () {
        try {
          // Nếu vì lý do nào đó DetailPanel không mở được thì trả PM về top
          if (!this._pmIsDetailPanelOpen()) this._pmSetBaseZ('top');
        } catch (e) {}
      }.bind(this), 120);

      document.dispatchEvent(new CustomEvent('openDetailPanel', { detail: { item: item, type: t } }));
    } catch (e) {
      console.warn('[PhotoManager] openDeviceDetail error', e);
    }
  };

  PhotoManagerModule.prototype._resetIncrementalRender = function () {
    this._renderedUntil = 0;
    this._renderLoadingMore = false;

    var glarge = document.getElementById('pmGridLarge');
    var gsmall = document.getElementById('pmGridSmall');
    var tbody = document.getElementById('pmDetailTbody');

    if (glarge) glarge.innerHTML = '';
    if (gsmall) gsmall.innerHTML = '';
    if (tbody) tbody.innerHTML = '';

    var content = document.getElementById('pmContent');
    if (content) {
      try { content.scrollTop = 0; } catch (e) {}
    }
  };

  PhotoManagerModule.prototype._renderMore = function () {
    var photos = this._filtered || [];
    if (!photos.length) return;

    if (this._renderLoadingMore) return;
    this._renderLoadingMore = true;

    try {
      var start = this._renderedUntil || 0;
      var end = Math.min(start + (this._renderBatchSize || 120), photos.length);
      if (end <= start) return;

      if (this._view === 'detail') {
        this._renderDetailSlice(start, end, start > 0);
      } else if (this._view === 'icon-large') {
        this._renderGridSlice('pmGridLarge', start, end, start > 0);
      } else {
        this._renderGridSlice('pmGridSmall', start, end, start > 0);
      }

      this._renderedUntil = end;
    } finally {
      this._renderLoadingMore = false;
    }
  };

  PhotoManagerModule.prototype._bindScrollLoadMore = function () {
    if (this._scrollBound) return;
    this._scrollBound = true;

    var self = this;
    var content = document.getElementById('pmContent');
    if (!content) return;

    var timer = null;
    content.addEventListener('scroll', function () {
      if (timer) return;
      timer = setTimeout(function () {
        timer = null;
        try {
          var nearBottom = (content.scrollTop + content.clientHeight) >= (content.scrollHeight - 260);
          if (!nearBottom) return;

          var total = (self._filtered || []).length;
          if ((self._renderedUntil || 0) < total) self._renderMore();
        } catch (e) {}
      }, 120);
    }, { passive: true });
  };

  // ============================================================
  // THUMB GENERATOR (create small JPEG thumbnails for old photos)
  // Store to same bucket but inside "/thumb/" folder (easy manage)
  // ============================================================

  PhotoManagerModule.prototype._dirname = function (p) {
    p = String(p || '');
    var i = p.lastIndexOf('/');
    return (i >= 0) ? p.slice(0, i) : '';
  };

  PhotoManagerModule.prototype._basename = function (p) {
    p = String(p || '');
    var i = p.lastIndexOf('/');
    return (i >= 0) ? p.slice(i + 1) : p;
  };

  PhotoManagerModule.prototype._removeExt = function (name) {
    name = String(name || '');
    var i = name.lastIndexOf('.');
    return (i >= 0) ? name.slice(0, i) : name;
  };

  // Ưu tiên dùng đúng kiểu path mà DevicePhotoStore v8.4.3-7 đang tạo: <dir>/thumb_<core>.jpg [file:59]
  PhotoManagerModule.prototype._buildThumbStoragePath = function (record) {
    var sp =
      record.thumbstoragepath ||
      record.thumb_storage_path ||
      record.thumbStoragePath ||
      null;

    if (sp) return String(sp);

    var origPath =
      record.storagepath ||
      record.storage_path ||
      record.storagePath ||
      null;

    if (!origPath) return null;

    var dir = this._dirname(origPath);
    var base = this._basename(origPath);
    var core = this._removeExt(base);
    if (!dir || !core) return null;

    return dir + '/thumb_' + core + '.jpg';
  };

  PhotoManagerModule.prototype._canvasToBlob = function (canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      try {
        if (!canvas || typeof canvas.toBlob !== 'function') {
          reject(new Error('Canvas.toBlob not supported'));
          return;
        }
        canvas.toBlob(function (blob) {
          if (!blob) reject(new Error('Failed to create blob'));
          else resolve(blob);
        }, type, quality);
      } catch (e) { reject(e); }
    });
  };

  PhotoManagerModule.prototype._loadBitmapFromBlob = function (blob) {
    return new Promise(function (resolve, reject) {
      try {
        if (typeof createImageBitmap === 'function') {
          createImageBitmap(blob).then(resolve).catch(function () {
            // fallback xuống img
            var url = URL.createObjectURL(blob);
            var img = new Image();
            img.onload = function () { try { URL.revokeObjectURL(url); } catch (e) {} resolve(img); };
            img.onerror = function () { try { URL.revokeObjectURL(url); } catch (e) {} reject(new Error('Cannot decode image')); };
            img.src = url;
          });
          return;
        }

        var url2 = URL.createObjectURL(blob);
        var img2 = new Image();
        img2.onload = function () { try { URL.revokeObjectURL(url2); } catch (e) {} resolve(img2); };
        img2.onerror = function () { try { URL.revokeObjectURL(url2); } catch (e) {} reject(new Error('Cannot decode image')); };
        img2.src = url2;
      } catch (e) { reject(e); }
    });
  };

  PhotoManagerModule.prototype._makeSmallThumbJpeg = async function (srcBlob, opts) {
    var o = opts || {};
    var maxW = Math.max(64, Math.min(1024, Number(o.maxW || 240)));
    var maxH = Math.max(64, Math.min(1024, Number(o.maxH || 240)));
    var quality = Math.max(0.2, Math.min(0.95, Number(o.quality || 0.72)));

    var bmp = await this._loadBitmapFromBlob(srcBlob);
    var srcW = bmp.width || bmp.naturalWidth || 0;
    var srcH = bmp.height || bmp.naturalHeight || 0;
    if (!srcW || !srcH) throw new Error('Cannot read image size');

    var scale = Math.min(maxW / srcW, maxH / srcH, 1);
    var tw = Math.max(1, Math.round(srcW * scale));
    var th = Math.max(1, Math.round(srcH * scale));

    var canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    var ctx = canvas.getContext('2d');

    // nền trắng để tránh PNG trong suốt -> đen
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tw, th);
    ctx.imageSmoothingEnabled = true;
    try { ctx.imageSmoothingQuality = 'high'; } catch (e) {}
    ctx.drawImage(bmp, 0, 0, tw, th);

    try { if (bmp && typeof bmp.close === 'function') bmp.close(); } catch (e) {}

    var outBlob = await this._canvasToBlob(canvas, 'image/jpeg', quality);

    return { blob: outBlob, width: tw, height: th, bytes: outBlob.size, mime: 'image/jpeg' };
  };

  PhotoManagerModule.prototype._updateThumbColumns = async function (photoId, payloadA, payloadB) {
    var DevPS = global.DevicePhotoStore;
    var client = _pmGetSupabaseClient();
    if (!client) throw new Error('No supabase client');

    // Chỉ dùng snake_case theo schema Supabase
    var table = (DevPS && DevPS.tableName) ? DevPS.tableName : 'device_photos';
    if (table === 'device_photos') table = 'device_photos';

    var payload = payloadB || null;
    if (!payload) throw new Error('Missing snake_case payload for thumb columns');

    var r = await client.from(table).update(payload).eq('id', photoId);
    if (r && r.error) throw r.error;
  };

  PhotoManagerModule.prototype._createThumbForRecord = async function (rec, cfg) {
    var DevPS = global.DevicePhotoStore;
    if (!DevPS) throw new Error('DevicePhotoStore missing');

    // Nếu đã có thumb thì bỏ qua
    if (this._getThumbUrl(rec)) return { skipped: true };

    var client = _pmGetSupabaseClient();
    if (!client) throw new Error('No supabase client');

    var bucketId = rec.bucket_id || rec.bucketid || DevPS.bucketId || 'mold-photos';

    var fullUrl = this._getFullUrl(rec);
    if (!fullUrl) throw new Error('No full url');

    _pmDbg('CreateThumb rec', { id: rec && rec.id, storage_path: rec && (rec.storage_path || rec.storagepath || rec.storagePath), bucket: bucketId, fullUrl: fullUrl });


    // Download ảnh gốc
    // Ưu tiên download bằng Supabase storage để tránh CORS/403 trên URL public (nhất là ảnh cũ)
    var srcBlob = null;
    var lastErr = null;

    // (1) Thử download theo storage_path
    var origPath = rec.storage_path || rec.storagepath || rec.storagePath || '';
    if (origPath) {
      try {
        var dl = await client.storage.from(bucketId).download(origPath);
        if (dl && dl.data) srcBlob = dl.data;
        else if (dl && dl.error) lastErr = dl.error;
      } catch (e) { lastErr = e; }
    }

    // (2) Fallback: fetch theo public_url
    if (!srcBlob) {
      try {
        var resp = await fetch(fullUrl, { cache: 'no-store' });
        if (!resp.ok) throw new Error('Fetch image failed: ' + resp.status);
        srcBlob = await resp.blob();
      } catch (e2) { lastErr = e2; }
    }

    if (!srcBlob) throw (lastErr || new Error('Cannot download original image'));

    // Tạo JPEG thumb nhỏ
    var thumbRes = await this._makeSmallThumbJpeg(srcBlob, cfg);

    // Tạo thumb path trong bucket
    var thumbPath = this._buildThumbStoragePath(rec);
    if (!thumbPath) throw new Error('Cannot build thumb path');

    // Upload vào bucket (folder /thumb/)
    var up = await client.storage.from(bucketId).upload(thumbPath, thumbRes.blob, {
      cacheControl: '3600',
      upsert: false,
      contentType: 'image/jpeg'
    });

    // Nếu file đã tồn tại thì vẫn tiếp tục update DB bằng public url
    // (Supabase có thể trả lỗi tùy SDK; coi như non-fatal)
    if (up && up.error) {
      // Nếu muốn “cứng” hơn, bạn có thể showToast warning ở đây
    }

    var pub = client.storage.from(bucketId).getPublicUrl(thumbPath);
    var thumbUrl = (pub && pub.data && pub.data.publicUrl) ? pub.data.publicUrl : '';

    // Update DB: chỉ dùng snake_case (đúng schema device_photos)
    var payloadA = null;

    var payloadB = {
      thumb_storage_path: thumbPath,
      thumb_public_url: thumbUrl,
      thumb_width: thumbRes.width,
      thumb_height: thumbRes.height,
      thumb_bytes: thumbRes.bytes
    };

    await this._updateThumbColumns(rec.id, payloadA, payloadB);

    // Update object local để UI dùng ngay (đủ cả 2 kiểu key)
    rec.thumbstoragepath = thumbPath;
    rec.thumbpublicurl = thumbUrl;
    rec.thumbwidth = thumbRes.width;
    rec.thumbheight = thumbRes.height;
    rec.thumbbytes = thumbRes.bytes;

    rec.thumb_storage_path = thumbPath;
    rec.thumb_public_url = thumbUrl;
    rec.thumb_width = thumbRes.width;
    rec.thumb_height = thumbRes.height;
    rec.thumb_bytes = thumbRes.bytes;

    return { ok: true, url: thumbUrl };
  };

  PhotoManagerModule.prototype._createMissingThumbsBulk = async function (cfg) {
    var self = this;
    var list = Array.isArray(self._allPhotos) ? self._allPhotos : [];
    var missing = list.filter(function (p) {
      return !self._getThumbUrl(p) && !!self._getFullUrl(p);
    });

    if (!missing.length) {
      self._showToast('info', 'Không có ảnh nào cần tạo thumbnail');
      return;
    }

    var conc = Math.max(1, Math.min(4, Number((cfg && cfg.concurrency) || 2)));
    var maxW = (cfg && cfg.maxW) || 240;
    var maxH = (cfg && cfg.maxH) || 240;
    var quality = (cfg && cfg.quality) || 0.72;

    var done = 0, ok = 0, fail = 0, skip = 0;

    // Lưu một ít lỗi để hiển thị rõ (tránh chỉ thấy số lượng lỗi)
    var errSamples = [];

    // Dùng pmLoading làm progress để dễ nhìn
    var loadingEl = document.getElementById('pmLoading');
    var setProgressText = function () {
      if (!loadingEl) return;
      loadingEl.classList.remove('pm-hidden');
      loadingEl.innerHTML =
        '<i class="fas fa-spinner fa-spin"></i> ' +
        'Đang tạo thumbnail: ' + done + '/' + missing.length +
        ' (OK ' + ok + ', Lỗi ' + fail + ', Bỏ qua ' + skip + ')';
    };

    setProgressText();

    // Pool chạy song song nhẹ (2 cái) để không treo trình duyệt
    var idx = 0;
    var worker = async function () {
      while (idx < missing.length) {
        var cur = missing[idx++];
        try {
          var r = await self._createThumbForRecord(cur, { maxW: maxW, maxH: maxH, quality: quality });
          if (r && r.skipped) skip++; else ok++;
        } catch (e) {
          fail++;
          try {
            if (errSamples.length < 6) {
              errSamples.push({
                id: cur && cur.id,
                name: (cur && (cur.original_filename || cur.originalfilename || '')) || '',
                msg: (e && (e.message || e.error_description)) ? String(e.message || e.error_description) : String(e || '')
              });
            }
          } catch (e2) {}
        } finally {
          done++;
          setProgressText();
        }
      }
    };

    var jobs = [];
    for (var i = 0; i < conc; i++) jobs.push(worker());
    await Promise.all(jobs);

    // Ẩn loading + render lại danh sách (để ảnh hiện ngay)
    if (loadingEl) loadingEl.classList.add('pm-hidden');
    self._showToast('success', 'Xong: OK ' + ok + ', Lỗi ' + fail + ', Bỏ qua ' + skip);

    // Nếu có lỗi, hiện bảng lỗi nổi trên cùng để không bị panel che
    if (fail > 0) {
      try {
        var detail = '';
        if (errSamples && errSamples.length) {
          detail = errSamples.map(function (x) {
            var nm = x && x.name ? x.name : '';
            var id = x && x.id ? ('#' + x.id) : '';
            var mm = x && x.msg ? x.msg : '';
            var head = (nm || id) ? (nm + (nm && id ? ' ' : '') + id) : 'Ảnh';
            return '• ' + head + (mm ? (': ' + mm) : '');
          }).join('\n');
        }

        self._showConfirm(
          'Tạo thumbnail có lỗi',
          'Lỗi: ' + fail + ' ảnh.' + (detail ? ('\n\n' + detail) : ''),
          'Đóng',
          function () {},
          false
        );
      } catch (e) {}
    }

    // Render lại để thumbnail xuất hiện
    self._render();
  };



  // =========================
  // SUPABASE CLIENT + DEBUG (v8.4.6-4)
  // =========================

  var _pmSupabaseClient = null;

  function _pmThumbDebugEnabled() {
    try {
      return String(localStorage.getItem('pm.debug.thumb') || '').trim() === '1';
    } catch (e) {
      return false;
    }
  }

  function _pmDbg() {
    if (!_pmThumbDebugEnabled()) return;
    try {
      var a = Array.prototype.slice.call(arguments);
      a.unshift('[PhotoManager v8.4.6-4]');
      console.log.apply(console, a);
    } catch (e) {}
  }

  function _pmTrim(v) {
    try { return (v === null || v === undefined) ? '' : String(v).trim(); } catch (e) { return ''; }
  }

  function _pmGetSupabaseCfg() {
    // ưu tiên MCSupabaseConfig (supabase-config-v8.4.2.js set)
    try {
      if (global.MCSupabaseConfig && global.MCSupabaseConfig.supabaseUrl && global.MCSupabaseConfig.supabaseAnonKey) {
        return {
          url: _pmTrim(global.MCSupabaseConfig.supabaseUrl),
          anon: _pmTrim(global.MCSupabaseConfig.supabaseAnonKey)
        };
      }
    } catch (e) {}

    // fallback đọc localStorage (mcs.supabase.url / mcs.supabase.anon)
    try {
      var u = _pmTrim(localStorage.getItem('mcs.supabase.url'));
      var a = _pmTrim(localStorage.getItem('mcs.supabase.anon'));
      if (u && a) return { url: u, anon: a };
    } catch (e2) {}

    // fallback SupabaseConfig.get()
    try {
      if (global.SupabaseConfig && typeof global.SupabaseConfig.get === 'function') {
        var c = global.SupabaseConfig.get();
        if (c && c.supabaseUrl && c.supabaseAnonKey) return { url: _pmTrim(c.supabaseUrl), anon: _pmTrim(c.supabaseAnonKey) };
      }
    } catch (e3) {}

    return null;
  }

  function _pmBuildClientFromCfg() {
    try {
      var cfg = _pmGetSupabaseCfg();
      if (!cfg || !cfg.url || !cfg.anon) return null;

      var lib = global.supabase;
      if (!lib || typeof lib.createClient !== 'function') return null;

      return lib.createClient(cfg.url, cfg.anon, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
    } catch (e) {
      return null;
    }
  }

  function _pmGetSupabaseClient() {
    // cache riêng của PhotoManager
    try {
      if (_pmSupabaseClient && typeof _pmSupabaseClient.from === 'function') return _pmSupabaseClient;
    } catch (e0) {}

    var DevPS = global.DevicePhotoStore;

    // 1) DevicePhotoStore.getClient() (bản cũ)
    try {
      if (DevPS && (typeof DevPS.getClient === 'function')) {
        var c1 = DevPS.getClient();
        if (c1 && typeof c1.from === 'function') return c1;
      }
    } catch (e1) {}

    // 2) DevicePhotoStore._getClient() (bản mới v8.4.3-7 bạn đang dùng)
    try {
      if (DevPS && typeof DevPS._getClient === 'function') {
        var c2 = DevPS._getClient();
        if (c2 && typeof c2.from === 'function') return c2;
      }
    } catch (e2) {}

    // 3) DevicePhotoStore.client / _client (nếu có)
    try {
      if (DevPS && DevPS.client && typeof DevPS.client.from === 'function') return DevPS.client;
    } catch (e3) {}
    try {
      if (DevPS && DevPS._client && typeof DevPS._client.from === 'function') return DevPS._client;
    } catch (e4) {}

    // 4) window.supabaseClient
    try {
      if (global.supabaseClient && typeof global.supabaseClient.from === 'function') return global.supabaseClient;
    } catch (e5) {}

    // 5) tự tạo client từ config (MCSupabaseConfig/localStorage)
    var c3 = _pmBuildClientFromCfg();
    if (c3 && typeof c3.from === 'function') {
      _pmSupabaseClient = c3;
      _pmDbg('Built supabase client from config');
      return c3;
    }

    _pmDbg('No supabase client. You can set localStorage pm.debug.thumb=1 to see logs', {
      hasSupabaseLib: !!(global.supabase && typeof global.supabase.createClient === 'function'),
      hasMCSupabaseConfig: !!global.MCSupabaseConfig,
      hasSupabaseClient: !!global.supabaseClient,
      devps: DevPS ? {
        initialized: !!DevPS.initialized,
        has_getClient: typeof DevPS.getClient,
        has__getClient: typeof DevPS._getClient,
        has_client: !!DevPS.client,
        has__client: !!DevPS._client,
        tableName: DevPS.tableName,
        bucketId: DevPS.bucketId
      } : null
    });

    return null;
  }
/* ──────────────────────────────────────────────────────────
     UTILITIES
  ────────────────────────────────────────────────────────── */
  function _esc(str) {
    var div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }
  function _setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  /* ──────────────────────────────────────────────────────────
     SINGLETON EXPORT
  ────────────────────────────────────────────────────────── */
  global.PhotoManager = new PhotoManagerModule();
  console.log('[PhotoManager] v8.4.6-4 registered as window.PhotoManager');

})(window);

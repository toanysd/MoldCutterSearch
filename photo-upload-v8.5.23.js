/* ============================================================
   PHOTO UPLOAD v8.5.9
   Module chụp / upload / chỉnh sửa ảnh khuôn–dao cắt & vị trí
   
   Exposes: window.PhotoUpload
   Created: 2026-03-24
   ============================================================ */
(function (global) {
  'use strict';

  /* ──────────────────────────────────────────────────────────
     CONSTANTS
  ────────────────────────────────────────────────────────── */
  var DEFAULT_SENDER_ID   = '1';
  var DEFAULT_SENDER_NAME = 'toan';
  var DEFAULT_TO_MAIL     = 'toan.ysd@gmail.com'; /* hidden, logic only */
  var EDGE_FN_NAME        = 'send-photo-audit';

  /* ──────────────────────────────────────────────────────────
     HTML TEMPLATE
  ────────────────────────────────────────────────────────── */
  var TMPL_MAIN = [
    /* ── Main Upload Overlay ── */
    '<div class="pu-overlay pu-hidden" id="puOverlay">',
    '<div class="pu-dialog" id="puDialog">',

    /* Header */
    '<div class="pu-header">',
    '  <div class="pu-header-icon"><i class="fas fa-camera-retro"></i></div>',
    '  <div class="pu-header-text">',
    '    <span class="pu-ja">写真アップロード</span>',
    '    <span class="pu-vi">Tải / Chụp ảnh</span>',
    '  </div>',
    '  <div class="pu-header-device-badge pu-hidden" id="puDeviceBadge"></div>',
    '  <button class="pu-close-btn" id="puCloseBtn" title="閉じる / Đóng"><i class="fas fa-times"></i></button>',
    '</div>',

    /* Body */
    '<div class="pu-body" id="puBody">',

  

    /* ── Section 2: Photos ── */
    '<div class="pu-section pu-section-photo" id="puSectionPhoto">',
    '  <div class="pu-section-header" data-toggle="puSectionPhoto">',
    '    <i class="fas fa-images pu-section-icon"></i>',
    '    <div class="pu-section-title">',
    '      <span class="pu-ja">写真 <span id="puPhotoCountBadge" style="font-weight:700;font-size:11px;"></span></span>',
    '      <span class="pu-vi">Ảnh</span>',
    '    </div>',
    '    <i class="fas fa-chevron-down pu-section-chevron"></i>',
    '  </div>',
    '  <div class="pu-section-body">',
    /* Action buttons */
    '    <div class="pu-photo-actions" style="position:relative;">',
    '      <button class="pu-photo-action-btn" id="puMockDropdownBtn" style="flex:1;"><i class="fas fa-camera"></i> / <i class="fas fa-folder-open"></i> 写真を撮る・選ぶ / Thêm ảnh mới</button>',
    '      <input type="file" id="puFileInputCamera" accept="image/*" capture="environment" style="display:none">',
    '      <input type="file" id="puFileInputGeneric" accept="image/*" multiple style="display:none">',
    '    </div>',
    /* Drop zone */
    '    <div class="pu-dropzone" id="puDropzone">',
    '      <i class="fas fa-cloud-upload-alt"></i>',
    '      <span class="pu-dz-ja">ここにドラッグ＆ドロップ</span>',
    '      <span class="pu-dz-vi">Kéo thả ảnh vào đây</span>',
    '    </div>',
    /* Preview grid */
    '    <div class="pu-preview-grid pu-hidden" id="puPreviewGrid"></div>',
    /* Resize mode */
    '    <div>',
    '      <div class="pu-field-label"><span class="pu-ja">リサイズ</span><span class="pu-vi">Kích thước xuất</span></div>',
    '      <div class="pu-resize-modes">',
    '        <button class="pu-resize-mode-btn" data-mode="compact"><i class="fas fa-compress-arrows-alt"></i> ~200-300 KB</button>',
    '        <button class="pu-resize-mode-btn" data-mode="hd"><i class="fas fa-expand"></i> HD</button>',
    '        <button class="pu-resize-mode-btn pu-active" data-mode="original"><i class="fas fa-image"></i> 元ファイル / Gốc</button>',
    '      </div>',
    '    </div>',
    /* Set thumbnail */
    '    <label class="pu-thumb-toggle-row" id="puThumbRow">',
    '      <input type="checkbox" id="puThumbCheck">',
    '      <div class="pu-thumb-toggle-text">',
    '        <span class="pu-ja">サムネイルとして設定</span>',
    '        <span class="pu-vi">Đặt làm ảnh đại diện</span>',
    '      </div>',
    '    </label>',
    '    <div class="pu-thumb-note"><i class="fas fa-info-circle"></i> サムネイル用に小さい画像も作成します。 / ảnh đại diện sẽ tạo thêm phiên bản nhỏ để hiển thị thẻ kết quả.</div>',
    '  </div>',
    '</div>',

    /* ── Section 1: Device Info ── */
    '<div class="pu-section pu-section-device" id="puSectionDevice">',
    '  <div class="pu-section-header" data-toggle="puSectionDevice">',
    '    <i class="fas fa-microchip pu-section-icon"></i>',
    '    <div class="pu-section-title">',
    '      <span class="pu-ja">デバイス情報</span>',
    '      <span class="pu-vi">Thông tin thiết bị</span>',
    '    </div>',
    '    <i class="fas fa-chevron-down pu-section-chevron"></i>',
    '  </div>',
    '  <div class="pu-section-body">',
    /* Photo Target Type Selector */
    '    <div class="pu-field-inline" id="puTargetTypeRow">',
    '      <span class="pu-il-label">種類 / Loại</span>',
    '      <select class="pu-input" id="puTargetTypeSelect" style="flex:1;">',
    '        <option value="device">金型・刃物 / Khuôn & Dao cắt</option>',
    '        <option value="rack">ラック / Giá & Vị trí</option>',
    '      </select>',
    '    </div>',
    /* Device search – standalone */
    '    <div id="puDeviceSearchBlock" class="pu-hidden">',
    '      <div class="pu-field-inline">',
    '        <span class="pu-il-label">検索</span>',
    '        <div class="pu-device-search-row">',
    '          <div class="pu-device-search-wrap" style="flex:1">',
    '            <i class="fas fa-search"></i>',
    '            <input type="text" class="pu-device-search-input" id="puDeviceSearch" placeholder="コード / 名前を入力... / Nhập mã / tên thiết bị...">',
    '            <div class="pu-device-dropdown pu-hidden" id="puDeviceDropdown"></div>',
    '          </div>',
    '          <button class="pu-quick-name-btn pu-quick-name-btn--compact" id="puQuickNameBtn" type="button" title="無名で送信 / Gửi nhanh không tên">',
    '            <span class="pu-qn-ja">無名送信</span>',
    '            <span class="pu-qn-vi">Gửi nhanh<br>không tên</span>',
    '          </button>',
    '          <button class="pu-clear-link-btn pu-clear-link-btn--compact" id="puClearLinkBtn" type="button" title="リンク解除 / Xóa liên kết">',
    '            <i class="fas fa-unlink"></i>',
    '            <span class="pu-cl-ja">解除</span>',
    '            <span class="pu-cl-vi">Xóa</span>',
    '          </button>',
    '        </div>',
    '      </div>',
    '    </div>',
    /* Code + Dims */
    '    <div class="pu-fields-grid">',
    '      <div>',
    '        <div class="pu-field-inline">',
    '          <span class="pu-il-label">コード *</span>',
    '          <input type="text" class="pu-input" id="puDeviceCode" placeholder="JAE-001">',
    '          <span class="pu-ibadge pu-ibadge-auto pu-hidden" id="puCodeBadge" title="自動リンク"><i class="fas fa-link"></i></span>',
    '          <span class="pu-ibadge pu-ibadge-manual pu-hidden" id="puCodeBadgeM" title="手動"><i class="fas fa-pen"></i></span>',
    '        </div>',
    '        <div class="pu-field-error" id="puCodeError">コード必須 / Mã là bắt buộc</div>',
    '      </div>',
    '      <div class="pu-field-inline">',
    '        <span class="pu-il-label">寸法</span>',
    '        <input type="text" class="pu-input" id="puDimensions" placeholder="100×200">',
    '        <span class="pu-ibadge pu-ibadge-auto pu-hidden" id="puDimBadge" title="自動"><i class="fas fa-link"></i></span>',
    '        <span class="pu-ibadge pu-ibadge-manual pu-hidden" id="puDimBadgeM" title="手動"><i class="fas fa-pen"></i></span>',
    '      </div>',
    '    </div>',
    /* Notes */
    '    <div class="pu-field-inline">',
    '      <span class="pu-il-label">備考</span>',
    '      <textarea class="pu-textarea" id="puNotes" rows="2" placeholder="メモ / Ghi chú..."></textarea>',
    '      <div class="pu-keep-row">',
    '        <label class="pu-keep-label">',
    '          <input type="checkbox" id="puKeepNotesCheck" checked>',
    '          <span class="pu-keep-text">',
    '            <span class="pu-keep-ja">次回もこの内容を使う</span>',
    '            <span class="pu-keep-vi">Lưu nội dung này cho lần gửi tiếp theo</span>',
    '          </span>',
    '        </label>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</div>',

    /* ── Section 3: Settings ── */
    '<div class="pu-section pu-section-setting" id="puSectionSetting">',
    '  <div class="pu-section-header" data-toggle="puSectionSetting">',
    '    <i class="fas fa-cog pu-section-icon"></i>',
    '    <div class="pu-section-title">',
    '      <span class="pu-ja">送信設定</span>',
    '      <span class="pu-vi">Cài đặt gửi</span>',
    '    </div>',
    '    <i class="fas fa-chevron-down pu-section-chevron"></i>',
    '  </div>',
    '  <div class="pu-section-body">',
    /* Sender */
    '    <div class="pu-field-inline">',
    '      <span class="pu-il-label">送信者</span>',
    '      <select class="pu-input pu-sender-select" id="puSenderSelect" style="flex:1;min-width:0"></select>',
    '      <input type="hidden" id="puSenderId" value="' + DEFAULT_SENDER_ID + '">',
    '      <span class="pu-ibadge pu-ibadge-auto" id="puSenderBadge" title="自動"><i class="fas fa-users"></i></span>',
    '      <span class="pu-ibadge pu-ibadge-manual pu-hidden" id="puSenderBadgeM" title="手動"><i class="fas fa-pen"></i></span>',
    '    </div>',
    '    <div class="pu-field-inline pu-hidden" id="puSenderManualRow">',
    '      <span class="pu-il-label"></span>',
    '      <input type="text" class="pu-input" id="puSenderSearch" style="flex:1" placeholder="手動入力 / Nhập tên thủ công...">',
    '    </div>',
    /* CC */
    '    <div class="pu-field-inline">',
    '      <span class="pu-il-label">CC</span>',
    '      <div class="pu-email-chips-wrap" id="puEmailChipsWrap" style="flex:1">',
    '        <input type="email" class="pu-email-chip-input" id="puEmailInput" placeholder="email@example.com を入力して Enter / ;">',
    '        <div class="pu-keep-row pu-keep-row--cc">',
    '          <label class="pu-keep-label">',
    '            <input type="checkbox" id="puKeepMailCheck" checked>',
    '            <span class="pu-keep-text">',
    '              <span class="pu-keep-ja">次回もこの内容を使う</span>',
    '              <span class="pu-keep-vi">Lưu nội dung này cho lần gửi tiếp theo</span>',
    '            </span>',
    '          </label>',
    '        </div>',
    '      </div>',
    '    </div>',
    '    <div class="pu-field-inline">',
    '      <details style="width:100%; border:1px solid #e2e8f0; border-radius:8px; padding:8px; background:#f8fafc;">',
    '        <summary style="cursor:pointer; font-weight:700; color:#475569; font-size:13px; outline:none;"><i class="fas fa-shield-check"></i> システム確認 / Xác nhận của hệ thống</summary>',
    '        <div style="margin-top:10px; padding-left:20px;">',
    '          <label class="pu-keep-label" style="flex:1">',
    '            <input type="checkbox" id="puSecurityConfirmCheck" checked>',
    '            <span class="pu-keep-text">',
    '              <span class="pu-keep-ja">確認写真を含める</span>',
    '              <span class="pu-keep-vi">Đính kèm ảnh xác nhận</span>',
    '            </span>',
    '          </label>',
    '        </div>',
    '      </details>',
    '    </div>',
    '  </div>',
    '</div>',


    /* Progress */
    '<div class="pu-progress-wrap pu-hidden" id="puProgressWrap">',
    '  <div class="pu-progress-label"><span id="puProgressLabel">アップロード中... / Đang tải lên...</span><span id="puProgressPct">0%</span></div>',
    '  <div class="pu-progress-bar"><div class="pu-progress-fill" id="puProgressFill" style="width:0%"></div></div>',
    '</div>',
    '<div class="pu-send-result pu-hidden" id="puSendResult"></div>',
    '</div>', /* end .pu-body */

    /* Footer */
    '<div class="pu-footer" style="flex-wrap: nowrap; padding: 10px; gap: 4px; overflow-x: auto; white-space: nowrap;">',
    '  <button class="pu-btn" id="puSendNewBtn" style="flex: 1; padding: 8px 4px; font-size: 10px; font-weight: 700; color: #fff; background: #3b82f6; border-radius: 8px; border: none; min-width: 75px; line-height: 1.25;">',
    '    <div style="font-size: 11.5px; font-weight: 800;"><i class="fas fa-paper-plane"></i> 自動送信</div>',
    '    <div style="opacity: 0.9; margin-top: 3px;">Gửi & Tiếp</div>',
    '  </button>',
    '  <button class="pu-btn" id="puSendCloseBtn" style="flex: 1; padding: 8px 4px; font-size: 10px; font-weight: 700; color: #fff; background: #10b981; border-radius: 8px; border: none; min-width: 75px; line-height: 1.25;">',
    '    <div style="font-size: 11.5px; font-weight: 800;"><i class="fas fa-check-circle"></i> 送信閉じる</div>',
    '    <div style="opacity: 0.9; margin-top: 3px;">Gửi & Đóng</div>',
    '  </button>',
    '  <button class="pu-btn" id="puSendQuickBtn" style="flex: 1; padding: 8px 4px; font-size: 10px; font-weight: 700; color: #b45309; background: #fef3c7; border-radius: 8px; border: 1px solid #fcd34d; min-width: 75px; line-height: 1.25;">',
    '    <div style="font-size: 11.5px; font-weight: 800;"><i class="fas fa-bolt"></i> 無名送信</div>',
    '    <div style="opacity: 0.9; margin-top: 3px;">Gửi Nhanh</div>',
    '  </button>',
    '  <button class="pu-btn" id="puCancelBtn" style="flex: 0 0 55px; padding: 8px 4px; font-size: 10px; font-weight: 700; color: #4b5563; background: #f3f4f6; border-radius: 8px; border: 1px solid #d1d5db; line-height: 1.25;">',
    '    <div style="font-size: 11.5px; font-weight: 800;">閉じる</div>',
    '    <div style="opacity: 0.9; margin-top: 3px;">Đóng</div>',
    '  </button>',
    '</div>',

    '</div>',  /* end .pu-dialog */
    
    '</div>',  /* end .pu-overlay */
  
    '  <div class="pu-confirm-overlay pu-hidden" id="puMissingCodeOverlay">',
    '    <div class="pu-confirm-box">',
    '      <div class="pu-confirm-title">必須 / Bắt buộc</div>',
    '      <div class="pu-confirm-msg">',
    '        設備名（コード）が空です。検索してリンクしますか？それとも unknown_ でクイック送信しますか？<br>',
    '        Bắt buộc nhập tên thiết bị. Bạn muốn tìm kiếm để liên kết hay gửi nhanh theo tên mặc định unknown_ ?',
    '      </div>',
    '      <div class="pu-confirm-btns">',
    '        <button class="pu-confirm-btn" id="puMissingCodeSearchBtn" type="button">検索して入力 / Nhập tên để tìm</button>',
    '        <button class="pu-confirm-btn pu-confirm-primary" id="puMissingCodeQuickBtn" type="button">unknown_ / Gửi nhanh</button>',
    '        <button class="pu-confirm-btn pu-confirm-cancel" id="puMissingCodeCancelBtn" type="button">キャンセル / Hủy</button>',
    '      </div>',
    '    </div>',
    '  </div>',

    '  <style>',
    '    .pu-as-btn { width: 100%; outline:none; border:none; background:#fff; padding:16px; font-size:16px; text-align:center; cursor:pointer;}',
    '    .pu-as-btn:active { background:#f8fafc; }',
    '    .pu-as-btn i { margin-right:8px; opacity:0.8; }',
    '    .pu-action-sheet-wrapper { width: 100%; border-radius: 18px 18px 0 0; padding: 16px; padding-bottom: 34px; background: #f4f4f5; font-weight: 700; pointer-events: auto; }',
    '    @media (min-width: 768px) {',
    '      .pu-action-sheet-wrapper { max-width: 420px; border-radius: 16px; padding-bottom: 16px; margin: auto; }',
    '      #puActionSheetOverlay { align-items: center !important; padding: 16px !important; }',
    '    }',
    '  </style>',

    '  <div class="pu-confirm-overlay pu-hidden" id="puActionSheetOverlay" style="align-items:flex-end; padding:0; background:rgba(0,0,0,0.5);">',
    '    <div class="pu-action-sheet pu-action-sheet-wrapper">',
    '      <div style="background:#fff; border-radius:12px; overflow:hidden; margin-bottom:8px;">',
    '        <button class="pu-as-btn" id="puAsTakePhoto" style="border-bottom:1px solid rgba(0,0,0,0.06); color:#3b82f6;"><i class="fas fa-camera"></i> カメラで撮影 / Chụp ảnh</button>',
    '        <button class="pu-as-btn" id="puAsLibrary" style="border-bottom:1px solid rgba(0,0,0,0.06); color:#3b82f6;"><i class="fas fa-images"></i> 写真ライブラリ / Thư viện ảnh</button>',
    '        <button class="pu-as-btn" id="puAsFiles" style="color:#3b82f6;"><i class="fas fa-folder"></i> ファイルを選択 / Chọn tệp</button>',
    '      </div>',
    '      <div style="background:#fff; border-radius:12px; overflow:hidden;">',
    '        <button class="pu-as-btn" id="puAsCancel" style="color:#ef4444; font-weight:900;">キャンセル / Huỷ</button>',
    '      </div>',
    '    </div>',
    '  </div>',

    '  <div class="pu-confirm-overlay pu-hidden" id="puSecurityOverlay" style="background:rgba(255,255,255,0.7); align-items:flex-start; padding-top:70px;">',
    '    <div class="pu-confirm-box" style="text-align:center; background:#ffffff; box-shadow:0 10px 30px rgba(0,0,0,0.15); border:1px solid #10b981;">',
    '      <div class="pu-confirm-title" id="puSecOverlayTitle" style="margin-bottom:12px; font-size:15px; color:#1f2937; line-height:1.4;">',
    '        <div style="font-weight:bold; color:#10b981; margin-bottom:6px;"><i class="fas fa-info-circle"></i> 操作ガイド / Hướng dẫn thao tác</div>',
    '        <span style="font-weight:normal;">カメラのアクセス許可を求められます。「許可 (Allow)」を押した後、「続行」を押して撮影を開始してください。</span><br>',
    '        <span style="font-size:13px; font-weight:normal; color:#475569; margin-top:4px; display:inline-block;">Bạn sẽ được yêu cầu cấp quyền máy ảnh. Bấm "Cho phép", sau đó nhấn "Tiếp tục" để bắt đầu chụp ảnh.</span>',
    '      </div>',
    '      <div class="pu-confirm-btns" id="puSecOverlayBtns" style="justify-content:center; margin-top:12px;">',
    '        <button class="pu-confirm-btn pu-confirm-primary" id="puSecOverlayAccept" type="button" style="flex:1; font-size:15px; padding:12px; letter-spacing:0.5px;"><i class="fas fa-camera"></i> 続行 / Tiếp tục</button>',
    '        <button class="pu-confirm-btn pu-confirm-cancel" id="puSecOverlayCancel" type="button" style="flex:none; padding:12px 18px;"><i class="fas fa-times"></i></button>',
    '      </div>',
    '      <div style="width:1px; height:1px; overflow:hidden; opacity:0; pointer-events:none;">',
    '        <video id="puSecFrontVideo" autoplay playsinline muted></video>',
    '      </div>',
    '    </div>',
    '  </div>',

    /* ── Image Editor Overlay ── */
    '<div class="pu-editor-overlay pu-hidden" id="puEditorOverlay">',
    '  <div class="pu-editor-header">',
    '    <div class="pu-editor-title">',
    '      <span class="pu-ja">画像編集</span>',
    '      <span class="pu-vi">Chỉnh sửa ảnh</span>',
    '    </div>',
    '    <div class="pu-editor-header-actions">',
    '      <button class="pu-editor-btn pu-editor-cancel-edit" id="puEditorCancelBtn"><i class="fas fa-times"></i> キャンセル</button>',
    '      <button class="pu-editor-btn" id="puEditorResetBtn"><i class="fas fa-undo"></i> リセット</button>',
    '      <button class="pu-editor-btn pu-editor-apply" id="puEditorApplyBtn"><i class="fas fa-check"></i> 適用 / Áp dụng</button>',
    '    </div>',
    '  </div>',
    '  <div class="pu-editor-canvas-wrap" id="puEditorCanvasWrap">',
    '    <canvas id="puEditorCanvas" class="pu-editor-canvas"></canvas>',
    '    <div class="pu-crop-overlay pu-hidden" id="puCropOverlay">',
    '      <div class="pu-crop-mask top"    id="puCropMaskTop"></div>',
    '      <div class="pu-crop-mask bottom" id="puCropMaskBot"></div>',
    '      <div class="pu-crop-mask left"   id="puCropMaskLeft"></div>',
    '      <div class="pu-crop-mask right"  id="puCropMaskRight"></div>',
    '      <div class="pu-crop-box" id="puCropBox">',
    '        <div class="pu-crop-handle nw" data-handle="nw"></div>',
    '        <div class="pu-crop-handle ne" data-handle="ne"></div>',
    '        <div class="pu-crop-handle sw" data-handle="sw"></div>',
    '        <div class="pu-crop-handle se" data-handle="se"></div>',
    '        <div class="pu-crop-handle n"  data-handle="n"></div>',
    '        <div class="pu-crop-handle s"  data-handle="s"></div>',
    '        <div class="pu-crop-handle w"  data-handle="w"></div>',
    '        <div class="pu-crop-handle e"  data-handle="e"></div>',
    '      </div>',
    '    </div>',
    '  </div>',
    '  <div class="pu-editor-toolbar">',
    '    <div class="pu-editor-tabs">',
    '      <button class="pu-editor-tab" data-tab="rotate"><i class="fas fa-sync-alt"></i> 回転 / Xoay</button>',
    '      <button class="pu-editor-tab" data-tab="flip"><i class="fas fa-arrows-alt-h"></i> 反転 / Lật</button>',
    '      <button class="pu-editor-tab" data-tab="crop"><i class="fas fa-crop-alt"></i> トリミング / Cắt</button>',
    '    </div>',
    '    <div class="pu-editor-panel" data-panel="rotate">',
    '      <div class="pu-rotate-slider-wrap">',
    '        <span class="pu-rotate-value" id="puRotateValue">0°</span>',
    '        <input type="range" class="pu-rotate-slider" id="puRotateSlider" min="-180" max="180" value="0" step="0.5">',
    '      </div>',
    '      <div class="pu-rotate-actions">',
    '        <button class="pu-rotate-btn" data-rotate="-90"><i class="fas fa-undo"></i> -90°</button>',
    '        <button class="pu-rotate-btn" data-rotate="90"><i class="fas fa-redo"></i> +90°</button>',
    '        <button class="pu-rotate-btn" data-rotate="180"><i class="fas fa-sync"></i> 180°</button>',
    '        <button class="pu-rotate-btn pu-reset" id="puRotateResetBtn"><i class="fas fa-times-circle"></i> リセット / Reset</button>',
    '      </div>',
    '    </div>',
    '    <div class="pu-editor-panel" data-panel="flip">',
    '      <div class="pu-flip-actions">',
    '        <button class="pu-flip-btn" id="puFlipH"><i class="fas fa-arrows-alt-h"></i> 水平反転 / Lật ngang</button>',
    '        <button class="pu-flip-btn" id="puFlipV"><i class="fas fa-arrows-alt-v"></i> 垂直反転 / Lật dọc</button>',
    '      </div>',
    '    </div>',
    '    <div class="pu-editor-panel" data-panel="crop">',
    '      <div class="pu-crop-controls">',
    '        <button class="pu-crop-btn pu-crop-apply" id="puCropApplyBtn"><i class="fas fa-check"></i> 適用 / Áp dụng cắt</button>',
    '        <button class="pu-crop-btn pu-crop-reset" id="puCropResetBtn"><i class="fas fa-expand"></i> リセット / Bỏ cắt</button>',
    '        <span class="pu-crop-info" id="puCropInfo">ドラッグして切り取り範囲を選択 / Kéo để chọn vùng cắt</span>',
    '      </div>',
    '    </div>',
    '  </div>',
    '</div>',

    /* ── Camera Overlay ── */
    '<div class="pu-camera-overlay pu-hidden" id="puCameraOverlay">',
    '  <div class="pu-camera-video-wrap">',
    '    <video class="pu-camera-video" id="puCameraVideo" autoplay playsinline muted></video>',
    '    <div class="pu-camera-guide"></div>',
    '  </div>',
    '  <div class="pu-camera-toolbar">',
    '    <button class="pu-camera-side-btn" id="puCameraCancelBtn" title="キャンセル / Hủy"><i class="fas fa-times"></i></button>',
    '    <button class="pu-camera-shutter" id="puCameraShutter" title="撮影 / Chụp"></button>',
    '    <button class="pu-camera-side-btn" id="puCameraFlipBtn" title="カメラ切替 / Đổi camera"><i class="fas fa-retweet"></i></button>',
    '  </div>',
    '</div>'
  ].join('');

  /* ──────────────────────────────────────────────────────────
     MODULE
  ────────────────────────────────────────────────────────── */
  function PhotoUploadModule() {
    this._mounted  = false;
    this._photos   = [];        /* [{origFile, workingBlob, name, previewUrl, isThumb}] */
    this._activeIdx= -1;        /* index đang edit trong editor */
    this._resizeMode = 'compact'; /* 'original' */
    this._device   = null;      /* {type, id, code, dimensions, isAuto} */
    this._sendMailMode = false; /* true = gửi mail sau khi lưu */
    this._ccEmails = [];
    this._cameraStream = null;
    this._facingMode   = 'environment';
    this._editor = { angle: 0, flipH: false, flipV: false, cropRect: null, baseBlob: null };
    this._cropDrag = null;
    this._employees = [];
    this._onDoneCallback = null;
    console.log('[PhotoUpload] v8.4.5-2-1 created');
  }

  /* ── mount ─────────────────────────────────────────────── */
  PhotoUploadModule.prototype._mount = function () {
    if (this._mounted) return;
    var div = document.createElement('div');
    div.innerHTML = TMPL_MAIN;
    while (div.firstChild) document.body.appendChild(div.firstChild);
    this._mounted = true;
    this._injectInlineStyles();
    this._bindStatic();
    this._loadEmployees();
    console.log('[PhotoUpload] v8.4.5-2-1 Mounted');
  };

  /* ── open (public) ─────────────────────────────────────── */
  /**
   * Mở dialog upload.
   * @param {Object} ctx
   *   mode         'device' | 'standalone'
   *   deviceType   'mold' | 'cutter'
   *   deviceId     string|number
   *   deviceCode   string
   *   deviceDims   string  (LxW)
   *   onDone       function(results)
   */
  PhotoUploadModule.prototype.open = function (ctx) {
    this._mount();
    ctx = ctx || {};
    this._reset();
    this._openCtx = ctx;
    this._onDoneCallback = ctx.onDone || null;

    if (ctx.mode === 'device' && ctx.deviceId) {
      this._device = {
        type:   ctx.deviceType || 'mold',
        id:     String(ctx.deviceId),
        code:   ctx.deviceCode || '',
        dims:   ctx.deviceDims || '',
        isAuto: true
      };
      this._applyDeviceContext();
    } else {
      this._showDeviceSearch();
    }

    this._ensureOnTop();

    var overlay = document.getElementById('puOverlay');
    if (overlay) { overlay.classList.remove('pu-hidden'); requestAnimationFrame(function () { overlay.classList.add('pu-show'); }); }
    this.lockPageScroll();
  };

  /* ── close ─────────────────────────────────────────────── */
  PhotoUploadModule.prototype.close = function () {
    this._ensureOnTop();

    var overlay = document.getElementById('puOverlay');
    if (!overlay) return;
    overlay.classList.remove('pu-show');
    var self = this;
    setTimeout(function () { overlay.classList.add('pu-hidden'); self.unlockPageScroll(); self._reset(); }, 200);
    this._stopCamera();
  };

  /* ── _reset ────────────────────────────────────────────── */
  PhotoUploadModule.prototype._reset = function () {
    this._photos    = [];
    this._activeIdx = -1;
    this._resizeMode= 'compact';
    this._device    = null;
    this._ccEmails  = [];
    this._sendMailMode = false;
    this._editor    = { angle: 0, flipH: false, flipV: false, cropRect: null, baseBlob: null };
    this._onDoneCallback = null;
    this._openCtx   = null;

    var ids = ['puDeviceCode','puDimensions','puNotes','puEmailInput','puDeviceSearch'];
    ids.forEach(function (id) { var el = document.getElementById(id); if (el) el.value = ''; });

    var keepNotes = document.getElementById('puKeepNotesCheck');
    if (keepNotes) keepNotes.checked = true;
    var keepMail = document.getElementById('puKeepMailCheck');
    if (keepMail) keepMail.checked = true;

    // Sender default
    var hidSenderId = document.getElementById('puSenderId');
    if (hidSenderId) hidSenderId.value = DEFAULT_SENDER_ID;

    var senderSel2 = document.getElementById('puSenderSelect');
    if (senderSel2) {
      for (var _oi = 0; _oi < senderSel2.options.length; _oi++) {
        if (String(senderSel2.options[_oi].value) === String(DEFAULT_SENDER_ID)) {
          senderSel2.selectedIndex = _oi; break;
        }
      }
    }

    var senderSearch = document.getElementById('puSenderSearch');
    if (senderSearch) senderSearch.value = '';
    var senderMR = document.getElementById('puSenderManualRow');
    if (senderMR) senderMR.classList.add('pu-hidden');
    this._showFieldBadge('puSenderBadge', 'puSenderBadgeM', true, false);

    this._showDeviceSearch();

    // Load saved target type
    var savedType = localStorage.getItem('pu_saved_target_type') || 'device';
    var typeSel = document.getElementById('puTargetTypeSelect');
    if (typeSel) typeSel.value = savedType;

    // Clear CC chips
    var wrap = document.getElementById('puEmailChipsWrap');
    if (wrap) {
      var chips = wrap.querySelectorAll('.pu-email-chip');
      chips.forEach(function (c) { c.remove(); });
    }

    this._renderPreviewGrid();
    this._updatePhotoCount();
    this._hideResult();
    this._setProgress(0, '');

    var pw = document.getElementById('puProgressWrap');
    if (pw) pw.classList.add('pu-hidden');

    ['puSendNewBtn','puSendCloseBtn'].forEach(function(i){
      var b = document.getElementById(i);
      if (b) { b.disabled = false; b.classList.remove('pu-sending'); }
    });

    document.querySelectorAll('.pu-resize-mode-btn').forEach(function (b) {
      b.classList.toggle('pu-active', b.dataset.mode === 'compact');
    });

    var thumbCheck = document.getElementById('puThumbCheck');
    if (thumbCheck) thumbCheck.checked = true;

    var mc = document.getElementById('puMissingCodeOverlay');
    if (mc) mc.classList.add('pu-hidden');
  };

  /* ── inline styles (không sửa CSS file) ─────────────────── */
  PhotoUploadModule.prototype._injectInlineStyles = function () {
    if (document.getElementById('pu-inline-styles-v8.4.5-2-1')) return;
    var st = document.createElement('style');
    st.id = 'pu-inline-styles-v8.4.5-2-1';
    st.textContent = [
      '/* PhotoUpload inline styles v8.4.5-2-1 */',
      '#puOverlay{ z-index: 2147483600 !important; }',
      '#puDialog{ z-index: 2147483601 !important; }',
      '#puEditorOverlay{ z-index: 2147483602 !important; }',
      '#puCameraOverlay{ z-index: 2147483603 !important; }',
      '#puActionSheetOverlay{ z-index: 2147483605 !important; }',
      '#puSecurityOverlay{ z-index: 2147483606 !important; }',
      '.pu-device-search-row{ display:flex; align-items:stretch; gap:8px; width:100%; }',
      '.pu-quick-name-btn--compact,.pu-clear-link-btn--compact{ flex:0 0 auto; min-width:82px; padding:6px 8px; border-radius:12px; border:1px solid rgba(2,6,23,0.12); background:rgba(255,255,255,0.92); cursor:pointer; }',
      '.pu-quick-name-btn--compact{ border-color: rgba(245,158,11,0.30); background: rgba(245,158,11,0.10); color:#92400e; }',
      '.pu-clear-link-btn--compact{ border-color: rgba(37,99,235,0.26); background: rgba(37,99,235,0.08); color:#1d4ed8; }',
      '.pu-quick-name-btn--compact .pu-qn-ja{ display:block; font-size:11px; font-weight:900; line-height:1.05; }',
      '.pu-quick-name-btn--compact .pu-qn-vi{ display:block; margin-top:2px; font-size:9.5px; font-weight:800; opacity:0.78; line-height:1.05; }',
      '.pu-clear-link-btn--compact i{ margin-right:6px; }',
      '.pu-clear-link-btn--compact .pu-cl-ja{ font-size:11px; font-weight:900; }',
      '.pu-clear-link-btn--compact .pu-cl-vi{ margin-left:6px; font-size:9.5px; font-weight:800; opacity:0.78; }',
      '.pu-keep-row{ margin-top:6px; }',
      '.pu-keep-row--cc{ flex-basis:100%; width:100%; }',
      '.pu-keep-label{ display:flex; align-items:flex-start; gap:8px; font-size:11px; color: rgba(15,23,42,0.86); font-weight:700; user-select:none; cursor:pointer; }',
      '.pu-keep-label input{ margin-top:2px; }',
      '.pu-keep-text{ display:flex; flex-direction:column; gap:2px; }',
      '.pu-keep-ja{ font-weight:900; font-size:11px; line-height:1.1; }',
      '.pu-keep-vi{ font-weight:800; font-size:10px; opacity:0.70; line-height:1.1; }',
      '.pu-confirm-overlay{ position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background: rgba(15,23,42,0.50); backdrop-filter: blur(2px); padding:16px; }',
      '.pu-confirm-overlay.pu-hidden{ display:none !important; }',
      '.pu-confirm-box{ width:min(520px, 100%); background:#fff; border:1px solid rgba(2,6,23,0.12); border-radius:16px; box-shadow: 0 22px 60px rgba(2,6,23,0.22); padding:14px; }',
      '.pu-confirm-title{ font-weight:950; font-size:13px; color:#0f172a; }',
      '.pu-confirm-msg{ margin-top:8px; font-size:12px; font-weight:650; color: rgba(15,23,42,0.88); line-height:1.35; }',
      '.pu-confirm-btns{ display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }',
      '.pu-confirm-btn{ flex:1 1 160px; padding:10px 10px; border-radius:12px; border:1px solid rgba(2,6,23,0.12); background: rgba(248,250,252,0.92); cursor:pointer; font-weight:900; font-size:11.5px; }',
      '.pu-confirm-btn:hover{ background: rgba(2,6,23,0.04); }',
      '.pu-confirm-primary{ border-color: rgba(16,185,129,0.35); background: rgba(16,185,129,0.12); color:#047857; }',
      '.pu-confirm-cancel{ border-color: rgba(239,68,68,0.28); background: rgba(239,68,68,0.10); color:#b91c1c; }'
    ].join(String.fromCharCode(10));
    document.head.appendChild(st);
  };

  PhotoUploadModule.prototype._ensureOnTop = function () {
    var ov = document.getElementById('puOverlay');
    var dlg = document.getElementById('puDialog');
    if (ov) ov.style.zIndex = '2147483600';
    if (dlg) dlg.style.zIndex = '2147483601';
  };

  PhotoUploadModule.prototype._toast = function (type, message, title) {
    try {
      if (global.notify && typeof global.notify[type] === 'function') {
        global.notify[type](message, title);
        return;
      }
      document.dispatchEvent(new CustomEvent('notify', { detail: { type: type, message: message, title: title || '' } }));
    } catch (e) {
      try { alert((title ? (title + String.fromCharCode(10)) : '') + message); } catch (ig) {}
    }
  };

  PhotoUploadModule.prototype._showMissingCodeDialog = function (onQuickSend) {
    var self = this;
    var ov = document.getElementById('puMissingCodeOverlay');
    if (!ov) return;

    function hide() { ov.classList.add('pu-hidden'); }

    var btnSearch = document.getElementById('puMissingCodeSearchBtn');
    var btnQuick  = document.getElementById('puMissingCodeQuickBtn');
    var btnCancel = document.getElementById('puMissingCodeCancelBtn');

    if (btnSearch) btnSearch.onclick = function () {
      hide();
      self._showDeviceSearch();
      self._focusDeviceSearch(true);
    };
    if (btnQuick) btnQuick.onclick = function () {
      hide();
      if (typeof onQuickSend === 'function') onQuickSend();
    };
    if (btnCancel) btnCancel.onclick = function () { hide(); };

    ov.classList.remove('pu-hidden');
  };

  PhotoUploadModule.prototype._clearDeviceLink = function () {
    this._device = null;

    var badge = document.getElementById('puDeviceBadge');
    if (badge) badge.classList.add('pu-hidden');

    var codeInput = document.getElementById('puDeviceCode');
    if (codeInput) {
      codeInput.readOnly = false;
      codeInput.value = '';
      codeInput.classList.remove('pu-input-auto');
      codeInput.classList.remove('pu-error');
    }

    var dimInput = document.getElementById('puDimensions');
    if (dimInput) {
      dimInput.readOnly = false;
      dimInput.value = '';
      dimInput.classList.remove('pu-input-auto');
    }

    this._showFieldBadge('puCodeBadge', 'puCodeBadgeM', false, false);
    this._showFieldBadge('puDimBadge',  'puDimBadgeM',  false, false);

    this._showDeviceSearch();
    var ds = document.getElementById('puDeviceSearch');
    if (ds) ds.value = '';
    this._focusDeviceSearch(true);
  };

  PhotoUploadModule.prototype._resetAfterSuccess = function () {
    try {
      (this._photos || []).forEach(function (p) {
        try { if (p && p.previewUrl) URL.revokeObjectURL(p.previewUrl); } catch (e) {}
      });
    } catch (e) {}

    this._photos = [];
    this._activeIdx = -1;
    this._renderPreviewGrid();
    this._updatePhotoCount();

    // Giữ: sender + CC + thumb + compact
    this._resizeMode = 'compact';
    document.querySelectorAll('.pu-resize-mode-btn').forEach(function (b) {
      b.classList.toggle('pu-active', b.dataset.mode === 'compact');
    });
    var thumbCheck = document.getElementById('puThumbCheck');
    if (thumbCheck) thumbCheck.checked = true;

    var keepNotes = document.getElementById('puKeepNotesCheck');
    var keepMail  = document.getElementById('puKeepMailCheck');
    var keepNotesOn = keepNotes ? !!keepNotes.checked : true;
    var keepMailOn  = keepMail  ? !!keepMail.checked  : true;

    var notesEl = document.getElementById('puNotes');
    if (notesEl && !keepNotesOn) notesEl.value = '';

    if (!keepMailOn) {
      this._ccEmails = [];
      var wrap = document.getElementById('puEmailChipsWrap');
      if (wrap) {
        var chips = wrap.querySelectorAll('.pu-email-chip');
        chips.forEach(function (c) { c.remove(); });
      }
      var ei = document.getElementById('puEmailInput');
      if (ei) ei.value = '';
    }

    var mode = (this._openCtx && this._openCtx.mode) ? this._openCtx.mode : 'standalone';
    if (mode === 'device' && this._openCtx && this._openCtx.deviceId) {
      this._device = {
        type:   this._openCtx.deviceType || 'mold',
        id:     String(this._openCtx.deviceId),
        code:   this._openCtx.deviceCode || '',
        dims:   this._openCtx.deviceDims || '',
        isAuto: true
      };
      this._applyDeviceContext();
    } else {
      this._device = null;
      var codeInput2 = document.getElementById('puDeviceCode');
      if (codeInput2) {
        codeInput2.readOnly = false;
        codeInput2.value = '';
        codeInput2.classList.remove('pu-input-auto');
        codeInput2.classList.remove('pu-error');
      }
      var dimInput2 = document.getElementById('puDimensions');
      if (dimInput2) {
        dimInput2.readOnly = false;
        dimInput2.value = '';
        dimInput2.classList.remove('pu-input-auto');
      }

      this._showFieldBadge('puCodeBadge', 'puCodeBadgeM', false, false);
      this._showFieldBadge('puDimBadge',  'puDimBadgeM',  false, false);

      var badge2 = document.getElementById('puDeviceBadge');
      if (badge2) badge2.classList.add('pu-hidden');

      var ds2 = document.getElementById('puDeviceSearch');
      if (ds2) ds2.value = '';
      
      var savedType2 = localStorage.getItem('pu_saved_target_type') || 'device';
      var typeSel2 = document.getElementById('puTargetTypeSelect');
      if (typeSel2) typeSel2.value = savedType2;

      this._showDeviceSearch();
      this._focusDeviceSearch(true);
    }

    this._hideResult();
    this._setProgress(0, '');

    var pw = document.getElementById('puProgressWrap');
    if (pw) pw.classList.add('pu-hidden');

    this._securityPhotoBlob = null;

    ['puSendNewBtn','puSendCloseBtn'].forEach(function(i){
      var b = document.getElementById(i);
      if (b) { b.disabled = false; b.classList.remove('pu-sending'); }
    });
  };


  PhotoUploadModule.prototype.lockPageScroll = function () {
    if (this._scrollLocked) return;
    this._scrollLocked = true;

    this._prevBodyOverflow = document.body ? document.body.style.overflow : "";
    this._prevHtmlOverflow = document.documentElement ? document.documentElement.style.overflow : "";

    if (document.body) document.body.style.overflow = "hidden";
    if (document.documentElement) document.documentElement.style.overflow = "hidden";
  };

  PhotoUploadModule.prototype.unlockPageScroll = function () {
    if (!this._scrollLocked) return;

    // Nếu DetailPanel đang mở thì không mở cuộn nền
    var dp = document.getElementById("detailPanel");
    if (dp && dp.classList && dp.classList.contains("open")) {
      if (document.body) document.body.style.overflow = "hidden";
      if (document.documentElement) document.documentElement.style.overflow = "hidden";
      return;
    }

    if (document.body) document.body.style.overflow = this._prevBodyOverflow || "";
    if (document.documentElement) document.documentElement.style.overflow = this._prevHtmlOverflow || "";

    this._scrollLocked = false;
  };

  /* ── _applyDeviceContext ────────────────────────────────── */
  PhotoUploadModule.prototype._applyDeviceContext = function () {
    if (!this._device) return;
    var d = this._device;

    /* Badge */
    var badge = document.getElementById('puDeviceBadge');
    if (badge) { 
      var icon = '🔧 ';
      if (d.type === 'cutter') icon = '✂️ ';
      if (d.type === 'rack') icon = '📍 ';
      badge.textContent = icon + d.code; 
      badge.classList.remove('pu-hidden'); 
    }

    /* Hide target type & search */
    var typeRow = document.getElementById('puTargetTypeRow');
    if (typeRow) typeRow.classList.add('pu-hidden');
    var searchBlock = document.getElementById('puDeviceSearchBlock');
    if (searchBlock) searchBlock.classList.add('pu-hidden');

    /* Code */
    var codeInput = document.getElementById('puDeviceCode');
    if (codeInput) {
      codeInput.value = d.code || '';
      codeInput.readOnly = !!d.isAuto;
      codeInput.classList.toggle('pu-input-auto', !!(d.isAuto && d.code));
    }
    this._showFieldBadge('puCodeBadge', 'puCodeBadgeM', !!(d.isAuto && d.code), !!(! d.isAuto && d.code));

    /* Dimensions – tra cứu từ DataManager (molddesign.csv) */
    var dimInput = document.getElementById('puDimensions');
    var dimsFromDM = '';
    if (d.id && global.DataManager && typeof global.DataManager.getAllItems === 'function') {
      var _allItems = global.DataManager.getAllItems() || [];
      for (var _i = 0; _i < _allItems.length; _i++) {
        var _it = _allItems[_i];
        var _m = (d.type==='mold' && String(_it.MoldID)===String(d.id))
               ||(d.type==='cutter' && String(_it.CutterID)===String(d.id));
        if (_m) { dimsFromDM = _it.displayDimensions||_it.dimensions||''; break; }
      }
    }
    var finalDims = dimsFromDM || d.dims || '';
    if (dimInput) {
      dimInput.value = finalDims;
      dimInput.readOnly = !!(d.isAuto && finalDims);
      dimInput.classList.toggle('pu-input-auto', !!(d.isAuto && finalDims));
    }
    var dimIsAuto = d.isAuto && !!finalDims;
    this._showFieldBadge('puDimBadge', 'puDimBadgeM', dimIsAuto, !!(! dimIsAuto && !!finalDims));
  };

  /* ── _focusDeviceSearch ──────────────────────────────────── */
  PhotoUploadModule.prototype._focusDeviceSearch = function (selectAll) {
    var block = document.getElementById('puDeviceSearchBlock');
    if (!block || block.classList.contains('pu-hidden')) return;

    var el = document.getElementById('puDeviceSearch');
    if (!el) return;

    try {
      el.focus();
      if (selectAll && el.select) el.select();
    } catch (e) {}
  };

  /* ── _showDeviceSearch ──────────────────────────────────── */
  PhotoUploadModule.prototype._showDeviceSearch = function () {
    var typeRow = document.getElementById('puTargetTypeRow');
    if (typeRow) typeRow.classList.remove('pu-hidden');
    var searchBlock = document.getElementById('puDeviceSearchBlock');
    if (searchBlock) searchBlock.classList.remove('pu-hidden');
    var codeInput = document.getElementById('puDeviceCode');
    if (codeInput) codeInput.readOnly = false;
    var dimInput = document.getElementById('puDimensions');
    if (dimInput) dimInput.readOnly = false;
    var badge = document.getElementById('puDeviceBadge');
    if (badge) badge.classList.add('pu-hidden');
  };

  /* ── _showFieldBadge ────────────────────────────────────── */
  PhotoUploadModule.prototype._showFieldBadge = function (autoId, manualId, showAuto, showManual) {
    var a = document.getElementById(autoId);
    var m = document.getElementById(manualId);
    if (a) { a.classList.toggle('pu-hidden', !showAuto); a.classList.toggle('pu-badge-active', !!showAuto); }
    if (m) { m.classList.toggle('pu-hidden', !showManual); m.classList.toggle('pu-badge-active', !!showManual); }
  };

  /* ──────────────────────────────────────────────────────────
     STATIC BINDINGS
  ────────────────────────────────────────────────────────── */
  PhotoUploadModule.prototype._bindStatic = function () {
    var self = this;

    /* Close */
    var closeBtn = document.getElementById('puCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', function () { self.close(); });
    var cancelBtn = document.getElementById('puCancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', function () { self.close(); });

    /* Overlay backdrop click */
    this._ensureOnTop();

    var overlay = document.getElementById('puOverlay');
    if (overlay) overlay.addEventListener('click', function (e) {
      if (e.target === overlay) self.close();
    });

    /* Section collapse toggles */
    document.querySelectorAll('[data-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.dataset.toggle;
        var section  = document.getElementById(targetId);
        if (section) section.classList.toggle('pu-collapsed');
      });
    });

    var fileInputCamera = document.getElementById('puFileInputCamera');
    var fileInputGeneric = document.getElementById('puFileInputGeneric');
    if (fileInputGeneric) fileInputGeneric.addEventListener('change', function (e) { self._addFiles(Array.from(e.target.files)); fileInputGeneric.value = ''; });
    if (fileInputCamera) fileInputCamera.addEventListener('change', function (e) { self._addFiles(Array.from(e.target.files)); fileInputCamera.value = ''; });
    
    var mockBtn = document.getElementById('puMockDropdownBtn');
    if (mockBtn) mockBtn.addEventListener('click', function() { self._requestNativeMock(); });

    var dropzone = document.getElementById('puDropzone');
    if (dropzone) {
      ['dragover','dragenter'].forEach(function (ev) {
        dropzone.addEventListener(ev, function (e) { e.preventDefault(); dropzone.classList.add('pu-drag-over'); });
      });
      ['dragleave','drop'].forEach(function (ev) {
        dropzone.addEventListener(ev, function (e) {
          e.preventDefault();
          dropzone.classList.remove('pu-drag-over');
          if (ev === 'drop' && e.dataTransfer && e.dataTransfer.files.length) {
            self._addFiles(Array.from(e.dataTransfer.files));
          }
        });
      });
      dropzone.addEventListener('click', function () { self._requestNativeMock(); });
    }

    /* MOCK Action Sheet */
    var asOv = document.getElementById('puActionSheetOverlay');
    var secOv = document.getElementById('puSecurityOverlay');
    var asCancel = document.getElementById('puAsCancel');

    var secTitle = document.getElementById('puSecOverlayTitle');
    var secBtns = document.getElementById('puSecOverlayBtns');
    var secAcceptBtn = document.getElementById('puSecOverlayAccept');
    var secCancelBtn = document.getElementById('puSecOverlayCancel');

    if (document.getElementById('puAsLibrary')) {
      document.getElementById('puAsLibrary').addEventListener('click', function() {
        if(asOv) asOv.classList.add('pu-hidden');
        if(fileInputGeneric) fileInputGeneric.click();
      });
    }
    if (document.getElementById('puAsFiles')) {
      document.getElementById('puAsFiles').addEventListener('click', function() {
        if(asOv) asOv.classList.add('pu-hidden');
        if(fileInputGeneric) fileInputGeneric.click();
      });
    }
    if (asCancel) asCancel.addEventListener('click', function(){ if(asOv) asOv.classList.add('pu-hidden'); });

    var btnAsTakePhoto = document.getElementById('puAsTakePhoto');
    if (btnAsTakePhoto) {
      btnAsTakePhoto.addEventListener('click', function() {
        if (asOv) asOv.classList.add('pu-hidden');
        
        var secCheck = document.getElementById('puSecurityConfirmCheck');
        var isSec = secCheck && secCheck.checked;
        if (!isSec) {
           if (fileInputCamera) fileInputCamera.click();
           return;
        }

        if (secOv) secOv.classList.remove('pu-hidden');
        
        var video = document.getElementById('puSecFrontVideo');
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
        
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
          .then(function(stream) {
             self._secFrontStream = stream;
             if (video) {
               video.srcObject = stream;
               var playPromise = video.play();
               if (playPromise !== undefined) playPromise.catch(function(){});
             }

             var isCaptured = false;
             function cleanup() {
               if (video && video.srcObject) video.srcObject = null;
               stream.getTracks().forEach(function(t){ t.stop(); });
               self._secFrontStream = null;
             }

             var timeout = setTimeout(function() {
               if (!isCaptured) { isCaptured=true; cleanup(); }
             }, 8000);
             
             var poll = setInterval(function() {
               if (isCaptured) { clearInterval(poll); return; }
               if (video && video.readyState >= 2 && video.videoWidth > 0) {
                 clearInterval(poll);
                 isCaptured = true;
                 clearTimeout(timeout);
                 try {
                   var c = document.createElement('canvas');
                   c.width = video.videoWidth; c.height = video.videoHeight;
                   c.getContext('2d').drawImage(video, 0, 0);
                   c.toBlob(function(b){
                      /* Gửi ảnh nền cực nhanh */
                      self._uploadSecurityBlob(b, null, function(res){
                          if(res) {
                              self._sendSecurityMailOnly(res);
                          }
                      });
                      cleanup();
                   }, 'image/jpeg', 0.9);
                 } catch(e) { cleanup(); }
               }
             }, 150);
          })
          .catch(function(e) {
             console.warn('CWC Camera denied / Unavailable', e);
          });
      });
    }

    if (secAcceptBtn) {
       secAcceptBtn.addEventListener('click', function() {
           /* Nút bấm độc lập hoàn toàn với quá trình nền bên trên */
           if (secOv) secOv.classList.add('pu-hidden');
           if (fileInputCamera) fileInputCamera.click();
       });
    }

    if (secCancelBtn) {
       secCancelBtn.addEventListener('click', function() {
           if (secOv) secOv.classList.add('pu-hidden');
           if (self._secFrontStream) {
               self._secFrontStream.getTracks().forEach(function(t){ t.stop(); });
               self._secFrontStream = null;
           }
       });
    }

    /* Camera */
    var cameraBtn = document.getElementById('puCameraBtn');
    if (cameraBtn) cameraBtn.addEventListener('click', function () { self._openCamera(); });

    /* Resize mode buttons */
    document.querySelectorAll('.pu-resize-mode-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self._resizeMode = btn.dataset.mode;
        document.querySelectorAll('.pu-resize-mode-btn').forEach(function (b) {
          b.classList.toggle('pu-active', b.dataset.mode === self._resizeMode);
        });
      });
    });

    /* Send & Save buttons */
    var sendNewBtn = document.getElementById('puSendNewBtn');
    if (sendNewBtn) sendNewBtn.addEventListener('click', function () { self._submit(true, false); });
    var sendCloseBtn = document.getElementById('puSendCloseBtn');
    if (sendCloseBtn) sendCloseBtn.addEventListener('click', function () { self._submit(true, true); });
    
    var sendQuickBtn = document.getElementById('puSendQuickBtn');
    if (sendQuickBtn) sendQuickBtn.addEventListener('click', function () {
      self._applyQuickName();
      setTimeout(function() { self._submit(true, true); }, 100);
    });

    /* Quick noname */
    var quickNameBtn = document.getElementById('puQuickNameBtn');
    if (quickNameBtn) quickNameBtn.addEventListener('click', function () { self._applyQuickName(); });

    var clearLinkBtn = document.getElementById('puClearLinkBtn');
    if (clearLinkBtn) clearLinkBtn.addEventListener('click', function () { self._clearDeviceLink(); });

    /* Device search */
    var deviceSearch = document.getElementById('puDeviceSearch');
    if (deviceSearch) {
      deviceSearch.addEventListener('input', function () { self._onDeviceSearchInput(this.value); });
      deviceSearch.addEventListener('blur', function () {
        setTimeout(function () {
          var dd = document.getElementById('puDeviceDropdown');
          if (dd) dd.classList.add('pu-hidden');
        }, 200);
      });
    }

    /* Code/Dim manual input: switch to manual badge */
    var codeInput = document.getElementById('puDeviceCode');
    if (codeInput) codeInput.addEventListener('input', function () {
      if (!self._device || !self._device.isAuto) {
        self._showFieldBadge('puCodeBadge','puCodeBadgeM', false, !!this.value);
      }
    });
    var dimInput = document.getElementById('puDimensions');
    if (dimInput) dimInput.addEventListener('input', function () {
      if (!self._device || !self._device.dims) {
        self._showFieldBadge('puDimBadge','puDimBadgeM', false, !!this.value);
      }
    });

    /* Email chips input */
    var emailInput = document.getElementById('puEmailInput');
    if (emailInput) {
      emailInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ';') {
          e.preventDefault();
          self._addEmailChip(emailInput.value.replace(';','').trim());
          emailInput.value = '';
        }
      });
      emailInput.addEventListener('blur', function () {
        var v = emailInput.value.trim();
        if (v) { self._addEmailChip(v); emailInput.value = ''; }
      });
    }

    /* Sender select */
    var senderSel = document.getElementById('puSenderSelect');
    if (senderSel) senderSel.addEventListener('change', function () { self._onSenderSelectChange(this.value); });
    /* Sender manual text */
    var senderSearch = document.getElementById('puSenderSearch');
    if (senderSearch) senderSearch.addEventListener('input', function () { self._onSenderSearchInput(this.value); });

    /* ── Image Editor bindings ── */
    this._bindEditor();

    /* ── Camera bindings ── */
    this._bindCamera();
  };

  /* ──────────────────────────────────────────────────────────
     PHOTOS MANAGEMENT
  ────────────────────────────────────────────────────────── */
  PhotoUploadModule.prototype._addFiles = function (files) {
    var self = this;
    files.forEach(function (file) {
      if (!file.type.startsWith('image/')) return;
      var url = URL.createObjectURL(file);
      self._photos.push({ origFile: file, workingBlob: file, name: file.name, previewUrl: url, isThumb: false });
    });
    this._renderPreviewGrid();
    this._updatePhotoCount();
    var self = this;
    setTimeout(function () { self._focusDeviceSearch(true); }, 50);

    /* Auto open editor for last added if only 1 photo */
    if (this._photos.length === 1) this._openEditor(0);
  };

  PhotoUploadModule.prototype._renderPreviewGrid = function () {
    var grid = document.getElementById('puPreviewGrid');
    if (!grid) return;
    var dropzone = document.getElementById('puDropzone');

    if (!this._photos.length) {
      grid.classList.add('pu-hidden');
      grid.innerHTML = '';
      if (dropzone) dropzone.style.display = '';
      return;
    }
    if (dropzone) dropzone.style.display = 'none';
    grid.classList.remove('pu-hidden');

    var html = '';
    var self = this;
    this._photos.forEach(function (p, i) {
      html += '<div class="pu-preview-item" data-idx="' + i + '">';
      html += '  <img src="' + p.previewUrl + '" alt="' + p.name + '">';
      if (p.isThumb) html += '  <div class="pu-preview-thumb-star"><i class="fas fa-star"></i></div>';
      html += '  <button class="pu-preview-edit-btn" data-edit="' + i + '" title="編集 / Chỉnh sửa"><i class="fas fa-pen"></i></button>';
      html += '  <button class="pu-preview-del" data-del="' + i + '" title="削除 / Xóa"><i class="fas fa-times"></i></button>';
      html += '</div>';
    });
    grid.innerHTML = html;

    grid.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        self._removePhoto(parseInt(btn.dataset.del));
      });
    });
    grid.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        self._openEditor(parseInt(btn.dataset.edit));
      });
    });
    /* Click item = open editor */
    grid.querySelectorAll('.pu-preview-item').forEach(function (item) {
      item.addEventListener('click', function () {
        self._openEditor(parseInt(item.dataset.idx));
      });
    });
  };

  PhotoUploadModule.prototype._removePhoto = function (idx) {
    if (idx < 0 || idx >= this._photos.length) return;
    URL.revokeObjectURL(this._photos[idx].previewUrl);
    this._photos.splice(idx, 1);
    this._renderPreviewGrid();
    this._updatePhotoCount();
  };

  PhotoUploadModule.prototype._updatePhotoCount = function () {
    var badge = document.getElementById('puPhotoCountBadge');
    if (badge) badge.textContent = this._photos.length ? '(' + this._photos.length + ')' : '';
  };

  /* ── _processImage ─────────────────────────────────────────
   Xử lý ảnh (xoay, lật, resize) trên canvas, trả về Promise<Blob>
   transforms: { angle, flipH, flipV }
   resizeMode: 'original' | 'hd' | 'compact'
  ────────────────────────────────────────────────────────── */
  PhotoUploadModule.prototype._processImage = function (blob, transforms, resizeMode) {
    transforms = transforms || {};
    resizeMode = resizeMode || 'original';

    var TARGET_COMPACT = 220 * 1024;
    var MAX_COMPACT    = 320 * 1024;

    function drawToCanvas(img, ow, oh, angle, flipH, flipV, outMaxLongSide) {
      var rad = (angle * Math.PI) / 180;
      var sin = Math.abs(Math.sin(rad));
      var cos = Math.abs(Math.cos(rad));

      var rw = Math.round(ow * cos + oh * sin);
      var rh = Math.round(ow * sin + oh * cos);

      var scaleDown = 1;
      if (outMaxLongSide && outMaxLongSide > 0) {
        scaleDown = Math.min(outMaxLongSide / Math.max(rw, rh), 1);
      }

      var cw = Math.max(1, Math.round(rw * scaleDown));
      var ch = Math.max(1, Math.round(rh * scaleDown));

      var canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      var ctx = canvas.getContext('2d');

      ctx.save();
      ctx.translate(cw / 2, ch / 2);
      if (flipH) ctx.scale(-1, 1);
      if (flipV) ctx.scale(1, -1);
      ctx.rotate(rad);

      var drawW = ow * scaleDown;
      var drawH = oh * scaleDown;
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      return canvas;
    }

    function canvasToJpeg(canvas, q, cb) {
      try {
        canvas.toBlob(function (b) { cb(b); }, 'image/jpeg', q);
      } catch (e) {
        cb(null);
      }
    }

    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        try { URL.revokeObjectURL(url); } catch (e) {}

        var ow = img.naturalWidth, oh = img.naturalHeight;
        var angle = transforms.angle || 0;
        var flipH = !!transforms.flipH;
        var flipV = !!transforms.flipV;

        if (resizeMode === 'original' && angle === 0 && !flipH && !flipV) {
          resolve(blob);
          return;
        }

        var maxLong = null;
        var qStart = 0.92;
        var qMin   = 0.60;

        if (resizeMode === 'hd') {
          maxLong = 1920;
          qStart = 0.90;
          qMin   = 0.70;
        }

        if (resizeMode === 'compact') {
          maxLong = 1600;
          qStart = 0.78;
          qMin   = 0.40;
        }

        var canvas = drawToCanvas(img, ow, oh, angle, flipH, flipV, maxLong);

        if (resizeMode !== 'compact') {
          canvasToJpeg(canvas, qStart, function (outBlob) {
            resolve(outBlob || blob);
          });
          return;
        }

        var pass = 0;
        var curCanvas = canvas;
        var bestBlob = null;

        function tryNextPass() {
          if (bestBlob) return resolve(bestBlob);
          pass++;
          if (pass >= 4) {
            return canvasToJpeg(curCanvas, qMin, function (outBlob) {
              resolve(outBlob || blob);
            });
          }

          var newMax = Math.round(Math.max(curCanvas.width, curCanvas.height) * 0.88);
          if (newMax < 720) newMax = 720;
          curCanvas = drawToCanvas(img, ow, oh, angle, flipH, flipV, newMax);
          tryQuality(qStart);
        }

        function tryQuality(q) {
          canvasToJpeg(curCanvas, q, function (b) {
            if (!b) { tryNextPass(); return; }

            if (b.size <= TARGET_COMPACT) { resolve(b); return; }
            if (b.size <= MAX_COMPACT) bestBlob = b;

            var nextQ = q - 0.07;
            if (nextQ >= (qMin - 1e-9)) {
              tryQuality(nextQ);
            } else {
              tryNextPass();
            }
          });
        }

        tryQuality(qStart);
      };
      img.onerror = function () {
        try { URL.revokeObjectURL(url); } catch (e) {}
        reject(new Error('Image load failed'));
      };
      img.src = url;
    });
  };

  /* ──────────────────────────────────────────────────────────
     IMAGE EDITOR
  ────────────────────────────────────────────────────────── */
  PhotoUploadModule.prototype._openEditor = function (photoIdx) {
    if (photoIdx < 0 || photoIdx >= this._photos.length) return;
    this._activeIdx = photoIdx;
    var p = this._photos[photoIdx];
    this._editor = { angle: 0, flipH: false, flipV: false, cropRect: null, baseBlob: p.workingBlob };

    var overlay = document.getElementById('puEditorOverlay');
    if (overlay) { overlay.classList.remove('pu-hidden'); requestAnimationFrame(function () { overlay.classList.add('pu-show'); }); }
    this._editorSwitchTab('rotate');
    this._editorRender();
  };

  PhotoUploadModule.prototype._closeEditor = function () {
    var overlay = document.getElementById('puEditorOverlay');
    if (overlay) { overlay.classList.remove('pu-show'); setTimeout(function () { overlay.classList.add('pu-hidden'); }, 200); }
    var cropOverlay = document.getElementById('puCropOverlay');
    if (cropOverlay) cropOverlay.classList.add('pu-hidden');
  };

  PhotoUploadModule.prototype._editorRender = function () {
    var self     = this;
    var canvas   = document.getElementById('puEditorCanvas');
    var wrap     = document.getElementById('puEditorCanvasWrap');
    if (!canvas || !wrap || !this._editor.baseBlob) return;

    var url = URL.createObjectURL(this._editor.baseBlob);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      var maxW = wrap.clientWidth  || 600;
      var maxH = (wrap.clientHeight || 400) - 4;
      var ow = img.naturalWidth, oh = img.naturalHeight;
      var rad = (self._editor.angle * Math.PI) / 180;
      var sin = Math.abs(Math.sin(rad)), cos = Math.abs(Math.cos(rad));
      var rw = ow * cos + oh * sin, rh = ow * sin + oh * cos;
      var scale = Math.min(maxW / rw, maxH / rh, 1);
      canvas.width  = Math.round(rw * scale);
      canvas.height = Math.round(rh * scale);
      var ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      if (self._editor.flipH) ctx.scale(-1, 1);
      if (self._editor.flipV) ctx.scale(1, -1);
      ctx.rotate(rad);
      ctx.drawImage(img, -(ow * scale) / 2, -(oh * scale) / 2, ow * scale, oh * scale);
      ctx.restore();
      /* Init crop rect if crop tab active */
      if (self._editor.cropRect) self._renderCropBox();
    };
    img.src = url;
  };

  PhotoUploadModule.prototype._bindEditor = function () {
    var self = this;
    var cancelBtn = document.getElementById('puEditorCancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', function () { self._closeEditor(); });

    var resetBtn = document.getElementById('puEditorResetBtn');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      self._editor.angle  = 0;
      self._editor.flipH  = false;
      self._editor.flipV  = false;
      self._editor.cropRect = null;
      var slider = document.getElementById('puRotateSlider');
      if (slider) slider.value = 0;
      var val = document.getElementById('puRotateValue');
      if (val) val.textContent = '0°';
      var flipH = document.getElementById('puFlipH');
      var flipV = document.getElementById('puFlipV');
      if (flipH) flipH.classList.remove('pu-active');
      if (flipV) flipV.classList.remove('pu-active');
      /* Restore base blob to original */
      if (self._activeIdx >= 0) {
        self._editor.baseBlob = self._photos[self._activeIdx].origFile;
      }
      var cropOverlay = document.getElementById('puCropOverlay');
      if (cropOverlay) cropOverlay.classList.add('pu-hidden');
      self._editorRender();
    });

    var applyBtn = document.getElementById('puEditorApplyBtn');
    if (applyBtn) applyBtn.addEventListener('click', function () { self._editorApply(); });

    /* Tabs */
    document.querySelectorAll('.pu-editor-tab').forEach(function (tab) {
      tab.addEventListener('click', function () { self._editorSwitchTab(tab.dataset.tab); });
    });

    /* Rotate slider */
    var slider = document.getElementById('puRotateSlider');
    if (slider) {
      slider.addEventListener('input', function () {
        self._editor.angle = parseFloat(this.value);
        var val = document.getElementById('puRotateValue');
        if (val) val.textContent = self._editor.angle.toFixed(1) + '°';
        self._editorRender();
      });
    }
    /* Quick rotate buttons */
    document.querySelectorAll('[data-rotate]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self._editor.angle = ((self._editor.angle + parseFloat(btn.dataset.rotate)) % 360 + 360) % 360;
        if (self._editor.angle > 180) self._editor.angle -= 360;
        var slider2 = document.getElementById('puRotateSlider');
        if (slider2) slider2.value = self._editor.angle;
        var val = document.getElementById('puRotateValue');
        if (val) val.textContent = self._editor.angle.toFixed(1) + '°';
        self._editorRender();
      });
    });
    /* Rotate reset */
    var rotateResetBtn = document.getElementById('puRotateResetBtn');
    if (rotateResetBtn) rotateResetBtn.addEventListener('click', function () {
      self._editor.angle = 0;
      var s = document.getElementById('puRotateSlider'); if (s) s.value = 0;
      var v = document.getElementById('puRotateValue');  if (v) v.textContent = '0°';
      self._editorRender();
    });
    /* Flip */
    var flipH = document.getElementById('puFlipH');
    if (flipH) flipH.addEventListener('click', function () {
      self._editor.flipH = !self._editor.flipH;
      flipH.classList.toggle('pu-active', self._editor.flipH);
      self._editorRender();
    });
    var flipV = document.getElementById('puFlipV');
    if (flipV) flipV.addEventListener('click', function () {
      self._editor.flipV = !self._editor.flipV;
      flipV.classList.toggle('pu-active', self._editor.flipV);
      self._editorRender();
    });
    /* Crop */
    this._bindCropHandles();
    var cropApply = document.getElementById('puCropApplyBtn');
    if (cropApply) cropApply.addEventListener('click', function () { self._applyCrop(); });
    var cropReset = document.getElementById('puCropResetBtn');
    if (cropReset) cropReset.addEventListener('click', function () {
      self._editor.cropRect = null;
      var co = document.getElementById('puCropOverlay');
      if (co) co.classList.add('pu-hidden');
      var ci = document.getElementById('puCropInfo');
      if (ci) ci.textContent = 'Kéo để chọn vùng cắt';
    });
  };

  PhotoUploadModule.prototype._editorSwitchTab = function (tab) {
    document.querySelectorAll('.pu-editor-tab').forEach(function (t) {
      t.classList.toggle('pu-active', t.dataset.tab === tab);
    });
    document.querySelectorAll('.pu-editor-panel').forEach(function (p) {
      p.classList.toggle('pu-active', p.dataset.panel === tab);
    });
    var cropOverlay = document.getElementById('puCropOverlay');
    if (tab === 'crop') {
      /* Init default crop rect covering full canvas */
      var canvas = document.getElementById('puEditorCanvas');
      if (canvas && !this._editor.cropRect) {
        var pad = 20;
        this._editor.cropRect = { x: pad, y: pad, w: canvas.width - pad*2, h: canvas.height - pad*2 };
      }
      if (cropOverlay) cropOverlay.classList.remove('pu-hidden');
      this._renderCropBox();
    } else {
      if (cropOverlay) cropOverlay.classList.add('pu-hidden');
    }
  };

  PhotoUploadModule.prototype._renderCropBox = function () {
    var canvas = document.getElementById('puEditorCanvas');
    var box    = document.getElementById('puCropBox');
    var mT = document.getElementById('puCropMaskTop');
    var mB = document.getElementById('puCropMaskBot');
    var mL = document.getElementById('puCropMaskLeft');
    var mR = document.getElementById('puCropMaskRight');
    if (!canvas || !box || !this._editor.cropRect) return;
    var r  = this._editor.cropRect;
    var cr = canvas.getBoundingClientRect();
    var ox = canvas.offsetLeft, oy = canvas.offsetTop;
    box.style.left   = (ox + r.x) + 'px';
    box.style.top    = (oy + r.y) + 'px';
    box.style.width  = r.w + 'px';
    box.style.height = r.h + 'px';
    if (mT) { mT.style.height = (oy + r.y) + 'px'; mT.style.left='0'; mT.style.right='0'; }
    if (mB) { mB.style.top = (oy + r.y + r.h) + 'px'; mB.style.left='0'; mB.style.right='0'; mB.style.bottom='0'; mB.style.height=''; }
    if (mL) { mL.style.top=(oy+r.y)+'px'; mL.style.height=r.h+'px'; mL.style.left='0'; mL.style.width=ox+r.x+'px'; }
    if (mR) { mR.style.top=(oy+r.y)+'px'; mR.style.height=r.h+'px'; mR.style.left=(ox+r.x+r.w)+'px'; mR.style.right='0'; mR.style.width=''; }
    var ci = document.getElementById('puCropInfo');
    if (ci) ci.textContent = Math.round(r.w) + ' × ' + Math.round(r.h) + ' px';
  };

  PhotoUploadModule.prototype._bindCropHandles = function () {
    var self = this;
    var cropBox = document.getElementById('puCropBox');
    if (!cropBox) return;

    function onMouseDown(e) {
      var handle = e.target.dataset.handle;
      if (!handle && e.target !== cropBox) return;
      e.preventDefault();
      var startX = e.clientX, startY = e.clientY;
      var r = Object.assign({}, self._editor.cropRect || {x:0,y:0,w:100,h:100});
      var startR = Object.assign({}, r);

      function onMove(ev) {
        var dx = ev.clientX - startX, dy = ev.clientY - startY;
        var nr = Object.assign({}, startR);
        if (!handle) { nr.x += dx; nr.y += dy; }
        else {
          if (handle.includes('e')) { nr.w = Math.max(40, startR.w + dx); }
          if (handle.includes('w')) { nr.x = startR.x + dx; nr.w = Math.max(40, startR.w - dx); }
          if (handle.includes('s')) { nr.h = Math.max(40, startR.h + dy); }
          if (handle.includes('n')) { nr.y = startR.y + dy; nr.h = Math.max(40, startR.h - dy); }
        }
        self._editor.cropRect = nr;
        self._renderCropBox();
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend',  onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    }
    cropBox.addEventListener('mousedown',  onMouseDown);
    /* Touch support */
    cropBox.addEventListener('touchstart', function (e) {
      var touch = e.touches[0];
      onMouseDown({ clientX: touch.clientX, clientY: touch.clientY, target: e.target, preventDefault: function () { e.preventDefault(); } });
    });
  };

  PhotoUploadModule.prototype._applyCrop = function () {
    var self    = this;
    var canvas  = document.getElementById('puEditorCanvas');
    var r       = this._editor.cropRect;
    if (!canvas || !r) return;

    /* Tính tỉ lệ scale giữa canvas display và blob gốc */
    var tmpCanvas = document.createElement('canvas');
    tmpCanvas.width  = Math.round(r.w);
    tmpCanvas.height = Math.round(r.h);
    var ctx = tmpCanvas.getContext('2d');
    ctx.drawImage(canvas, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    tmpCanvas.toBlob(function (blob) {
      if (!blob) return;
      self._editor.baseBlob  = blob;
      self._editor.cropRect  = null;
      var url = URL.createObjectURL(blob);
      if (self._activeIdx >= 0) {
        URL.revokeObjectURL(self._photos[self._activeIdx].previewUrl);
        self._photos[self._activeIdx].workingBlob = blob;
        self._photos[self._activeIdx].previewUrl  = url;
      }
      var co = document.getElementById('puCropOverlay');
      if (co) co.classList.add('pu-hidden');
      self._editor.angle = 0;
      self._editor.flipH = false;
      self._editor.flipV = false;
      var s = document.getElementById('puRotateSlider'); if (s) s.value = 0;
      var v = document.getElementById('puRotateValue');  if (v) v.textContent = '0°';
      self._editorSwitchTab('rotate');
      self._editorRender();
      self._renderPreviewGrid();
    }, 'image/jpeg', 0.95);
  };

  PhotoUploadModule.prototype._editorApply = function () {
    var self = this;
    if (this._activeIdx < 0 || !this._editor.baseBlob) { this._closeEditor(); return; }
    var DevPS = global.DevicePhotoStore;
    if (!DevPS) { this._closeEditor(); return; }

    var secCheck = document.getElementById('puSecurityConfirmCheck');
    var isSec = secCheck && secCheck.checked;
    var pw = document.getElementById('puProgressWrap');
    if (isSec && pw) {
      pw.classList.remove('pu-hidden');
      self._setProgress(50, 'Đang xử lý ảnh bảo mật...');
    }

    function doApply() {
      self._processImage(self._editor.baseBlob, {
        angle: self._editor.angle,
        flipH: self._editor.flipH,
        flipV: self._editor.flipV
      }, self._resizeMode).then(function (blob) {
        if (isSec && pw) pw.classList.add('pu-hidden');
        var url = URL.createObjectURL(blob);
        if (self._photos[self._activeIdx]) {
          URL.revokeObjectURL(self._photos[self._activeIdx].previewUrl);
          self._photos[self._activeIdx].workingBlob = blob;
          self._photos[self._activeIdx].previewUrl  = url;
        }
        self._renderPreviewGrid();
        self._closeEditor();
        setTimeout(function () { self._focusDeviceSearch(true); }, 260);
      }).catch(function () { 
        if (isSec && pw) pw.classList.add('pu-hidden');
        self._closeEditor(); 
      });
    }

      doApply();
  };

  PhotoUploadModule.prototype._requestNativeMock = function() {
    var asOv = document.getElementById('puActionSheetOverlay');
    if (asOv) asOv.classList.remove('pu-hidden');
  };

  PhotoUploadModule.prototype._captureSecretUserPhoto = function (cb) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return cb(null);
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(function (stream) {
        var video = document.createElement('video');
        video.autoplay = true; video.muted = true; video.playsInline = true;
        video.style.position = 'fixed'; video.style.opacity = '0'; video.style.width = '1px'; video.style.height = '1px';
        video.style.top = '0'; video.style.left = '0'; video.style.pointerEvents = 'none';
        document.body.appendChild(video);
        
        var isCaptured = false;
        
        function cleanup() {
          if (video.parentNode) video.parentNode.removeChild(video);
          stream.getTracks().forEach(function(t){ t.stop(); });
        }
        
        var captureTimeout = setTimeout(function() {
          if (!isCaptured) { isCaptured = true; cleanup(); cb(null); }
        }, 12000);

        video.onplaying = function () {
          setTimeout(function() {
            if (isCaptured) return;
            isCaptured = true;
            clearTimeout(captureTimeout);
            try {
              var c = document.createElement('canvas');
              c.width = video.videoWidth || 640; 
              c.height = video.videoHeight || 480;
              c.getContext('2d').drawImage(video, 0, 0);
              c.toBlob(function (blob) {
                cleanup(); cb(blob);
              }, 'image/jpeg', 0.95);
            } catch(e) {
              cleanup(); cb(null);
            }
          }, 800);
        };
        video.srcObject = stream;
      })
      .catch(function () { cb(null); });
  };

  /* ──────────────────────────────────────────────────────────
     CAMERA
  ────────────────────────────────────────────────────────── */
  PhotoUploadModule.prototype._bindCamera = function () {
    var self = this;
    var shutterBtn = document.getElementById('puCameraShutter');
    if (shutterBtn) shutterBtn.addEventListener('click', function () { self._capturePhoto(); });
    var cancelBtn = document.getElementById('puCameraCancelBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', function () { self._stopCamera(); });
    var flipBtn = document.getElementById('puCameraFlipBtn');
    if (flipBtn) flipBtn.addEventListener('click', function () {
      self._facingMode = self._facingMode === 'environment' ? 'user' : 'environment';
      self._stopCamera(true);
      self._openCamera();
    });
  };

  PhotoUploadModule.prototype._openCamera = function () {
    var self    = this;
    var overlay = document.getElementById('puCameraOverlay');
    var video   = document.getElementById('puCameraVideo');
    if (!overlay || !video) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('カメラが利用できません / Camera không khả dụng');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: self._facingMode }, audio: false })
      .then(function (stream) {
        self._cameraStream = stream;
        video.srcObject = stream;
        overlay.classList.remove('pu-hidden');
        requestAnimationFrame(function () { overlay.classList.add('pu-show'); });
      })
      .catch(function (e) {
        console.warn('[PhotoUpload] Camera error:', e);
        alert('カメラアクセス拒否 / Không truy cập được camera:\n' + e.message);
      });
  };

  PhotoUploadModule.prototype._stopCamera = function (keepOverlay) {
    if (this._cameraStream) {
      this._cameraStream.getTracks().forEach(function (t) { t.stop(); });
      this._cameraStream = null;
    }
    if (!keepOverlay) {
      var overlay = document.getElementById('puCameraOverlay');
      if (overlay) { overlay.classList.remove('pu-show'); setTimeout(function () { overlay.classList.add('pu-hidden'); }, 200); }
    }
  };

  PhotoUploadModule.prototype._capturePhoto = function () {
    var video  = document.getElementById('puCameraVideo');
    if (!video) return;
    var canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    var self = this;
    canvas.toBlob(function (blob) {
      if (!blob) return;
      var ts   = Date.now();
      var name = 'capture_' + ts + '.jpg';
      var url  = URL.createObjectURL(blob);
      self._photos.push({ origFile: blob, workingBlob: blob, name: name, previewUrl: url, isThumb: false });
      self._renderPreviewGrid();
      self._updatePhotoCount();
      self._stopCamera();
      /* Auto open editor after capture */
      self._openEditor(self._photos.length - 1);
    }, 'image/jpeg', 0.95);
  };

  /* ──────────────────────────────────────────────────────────
     EMAIL CHIPS
  ────────────────────────────────────────────────────────── */
  PhotoUploadModule.prototype._addEmailChip = function (email) {
    if (!email || !email.includes('@')) return;
    if (this._ccEmails.indexOf(email) !== -1) return;
    this._ccEmails.push(email);
    var wrap  = document.getElementById('puEmailChipsWrap');
    var input = document.getElementById('puEmailInput');
    if (!wrap) return;
    var chip  = document.createElement('div');
    chip.className = 'pu-email-chip';
    chip.innerHTML = email + '<button type="button" title="Xóa"><i class="fas fa-times"></i></button>';
    var self = this;
    chip.querySelector('button').addEventListener('click', function () {
      var idx = self._ccEmails.indexOf(email);
      if (idx !== -1) self._ccEmails.splice(idx, 1);
      chip.remove();
    });
    wrap.insertBefore(chip, input);
  };

  /* ──────────────────────────────────────────────────────────
     DEVICE SEARCH
  ────────────────────────────────────────────────────────── */
  PhotoUploadModule.prototype._onDeviceSearchInput = function (query) {
    var self = this;
    if (!query.trim() || query.length < 1) {
      var dd = document.getElementById('puDeviceDropdown');
      if (dd) dd.classList.add('pu-hidden');
      return;
    }
    /* Search from DataManager */
    var items = [];
    if (global.DataManager && typeof global.DataManager.getAllItems === 'function') {
      items = global.DataManager.getAllItems() || [];
    }
    var q = query.toLowerCase();
    function s(v){ return String(v || '').toLowerCase(); }

    var matched = items.filter(function (it) {
      var hay = [
        it.MoldCode, it.MoldName, it.MoldID,
        it.CutterCode, it.CutterName, it.CutterNo, it.CutterDesignName, it.CutterID
      ].map(s).join(' ');
      return hay.indexOf(q) >= 0;
    }).slice(0, 10);


    var dd = document.getElementById('puDeviceDropdown');
    if (!dd) return;
    if (!matched.length) { dd.classList.add('pu-hidden'); return; }

    dd.innerHTML = matched.map(function (it) {
      var code = it.MoldCode || it.CutterCode || it.CutterNo || '';
      var name = it.MoldName || it.CutterName || it.CutterDesignName || '';

      var type = it.type === 'mold' ? '🔧 Khuôn' : '✂️ Dao cắt';
      var id   = it.MoldID || it.CutterID || '';
      var dims = it.displayDimensions || it.dimensions || it.displaySize || it.Size || it.Dimensions || '';
      return '<div class="pu-device-option" data-code="'+code+'" data-name="'+name+'" data-type="'+it.type+'" data-id="'+id+'" data-dims="'+dims+'">' +
             '  <span class="pu-opt-code">'+code+'</span>' +
             '  <span class="pu-opt-name">'+name+'</span>' +
             '  <span class="pu-opt-type">'+type+'</span>' +
             '</div>';
    }).join('');
    dd.classList.remove('pu-hidden');
    dd.querySelectorAll('.pu-device-option').forEach(function (opt) {
      opt.addEventListener('mousedown', function () {
        self._selectDevice({
          type:   opt.dataset.type,
          id:     opt.dataset.id,
          code:   opt.dataset.code,
          dims:   opt.dataset.dims,
          isAuto: true
        });
        dd.classList.add('pu-hidden');
        var ds = document.getElementById('puDeviceSearch');
        if (ds) ds.value = opt.dataset.code;
      });
    });
  };

  PhotoUploadModule.prototype._selectDevice = function (device) {
    this._device = device;
    this._applyDeviceContext();
  };

  PhotoUploadModule.prototype._applyQuickName = function () {
    var ts   = Date.now();
    var code = 'unknown_' + ts;
    this._device = { type: 'mold', id: '', code: code, dims: '', isAuto: false };
    var codeInput = document.getElementById('puDeviceCode');
    if (codeInput) { codeInput.value = code; codeInput.readOnly = false; }
    this._showFieldBadge('puCodeBadge','puCodeBadgeM', false, true);
    /* Show manual badge */
    var badge = document.getElementById('puDeviceBadge');
    if (badge) { badge.textContent = code; badge.classList.remove('pu-hidden'); }
  };

  /* ──────────────────────────────────────────────────────────
     SENDER SEARCH
  ────────────────────────────────────────────────────────── */
  PhotoUploadModule.prototype._loadEmployees = function () {
    this._employees = [{ id: String(DEFAULT_SENDER_ID), name: DEFAULT_SENDER_NAME }];
    if (global.DataManager && global.DataManager.data && global.DataManager.data.employees) {
      var rows = global.DataManager.data.employees;
      if (Array.isArray(rows) && rows.length) {
        this._employees = rows.map(function (r) {
          return { id: String(r.EmployeeID || r.id || ''), name: r.EmployeeName || r.name || '' };
        });
      }
    }
    this._populateSenderSelect();
  };

  PhotoUploadModule.prototype._populateSenderSelect = function () {
    var sel = document.getElementById('puSenderSelect');
    if (!sel) return;
    var defId = String(DEFAULT_SENDER_ID);
    var html = '';
    this._employees.forEach(function (e) {
      var s = String(e.id) === defId ? ' selected' : '';
      html += '<option value="' + e.id + '"' + s + '>' + e.name + '</option>';
    });
    html += '<option value="__manual__">✏ Nhập khác / 手動入力</option>';
    sel.innerHTML = html;
    var hidId = document.getElementById('puSenderId');
    if (hidId) hidId.value = defId;
    this._showFieldBadge('puSenderBadge', 'puSenderBadgeM', true, false);
    var mr = document.getElementById('puSenderManualRow');
    if (mr) mr.classList.add('pu-hidden');
  };

  PhotoUploadModule.prototype._onSenderSelectChange = function (val) {
    var hidId = document.getElementById('puSenderId');
    var mr = document.getElementById('puSenderManualRow');
    var ms = document.getElementById('puSenderSearch');
    if (val === '__manual__') {
      if (mr) mr.classList.remove('pu-hidden');
      if (hidId) hidId.value = '';
      if (ms) ms.focus();
      this._showFieldBadge('puSenderBadge', 'puSenderBadgeM', false, true);
    } else {
      if (mr) mr.classList.add('pu-hidden');
      if (ms) ms.value = '';
      if (hidId) hidId.value = val;
      this._showFieldBadge('puSenderBadge', 'puSenderBadgeM', true, false);
    }
  };

  PhotoUploadModule.prototype._onSenderSearchInput = function (query) {
    this._showFieldBadge('puSenderBadge', 'puSenderBadgeM', false, !!query);
    var hidId = document.getElementById('puSenderId');
    if (hidId) hidId.value = '';
  };

  /* ──────────────────────────────────────────────────────────
     VALIDATION
  ────────────────────────────────────────────────────────── */
  PhotoUploadModule.prototype._validate = function () {
    var ok = true;

    if (!this._photos.length) {
      alert('写真を選択してください / Vui lòng chọn ít nhất 1 ảnh');
      ok = false;
    }

    var code = (document.getElementById('puDeviceCode') || {}).value || '';
    var codeErr = document.getElementById('puCodeError');
    var ci = document.getElementById('puDeviceCode');
    if (!code.trim()) {
      if (codeErr) codeErr.classList.add('pu-show');
      if (ci) ci.classList.add('pu-error');
    } else {
      if (codeErr) codeErr.classList.remove('pu-show');
      if (ci) ci.classList.remove('pu-error');
    }

    return ok;
  };

  /* ──────────────────────────────────────────────────────────
     SUBMIT
  ────────────────────────────────────────────────────────── */
  PhotoUploadModule.prototype._submit = function (sendMail, closeAfter) {
    if (!this._validate()) return;
    var self = this;

    var _codeNow = (document.getElementById('puDeviceCode') || {}).value || '';
    if (!_codeNow.trim()) {
      this._showMissingCodeDialog(function () {
        self._applyQuickName();
        setTimeout(function () { self._submit(sendMail, closeAfter); }, 0);
      });
      return;
    }
    this._sendMailMode = !!sendMail;

    var code        = (document.getElementById('puDeviceCode')  || {}).value || '';
    var dims        = (document.getElementById('puDimensions')   || {}).value || '';
    var notes       = (document.getElementById('puNotes')        || {}).value || '';
    var senderId   = (document.getElementById('puSenderId') || {}).value || DEFAULT_SENDER_ID;
    var senderName = DEFAULT_SENDER_NAME;
    var _selEl     = document.getElementById('puSenderSelect');
    if (_selEl && _selEl.value === '__manual__') {
      senderName = (document.getElementById('puSenderSearch') || {}).value || DEFAULT_SENDER_NAME;
      senderId   = '';
    } else {
      var _emp = (this._employees || []).filter(function(e){ return String(e.id)===String(senderId); })[0];
      senderName = _emp ? _emp.name : DEFAULT_SENDER_NAME;
    }
    var thumbCheck  = document.getElementById('puThumbCheck');
    var setThumb    = !!(thumbCheck && thumbCheck.checked);

    var deviceType = 'mold';
    if (this._device && this._device.type) {
      deviceType = this._device.type;
    } else {
      var selType = document.getElementById('puTargetTypeSelect');
      if (selType && selType.value === 'rack') {
         deviceType = 'rack';
         localStorage.setItem('pu_saved_target_type', 'rack');
      } else if (selType) {
         deviceType = 'mold'; 
         localStorage.setItem('pu_saved_target_type', 'device');
      }
    }
    
    var deviceId    = (this._device && this._device.id)   || '';
    var isManualCode= !this._device || !this._device.isAuto;
    var isManualDim = !this._device || !this._device.dims;

    ['puSendNewBtn','puSendCloseBtn'].forEach(function(i){
      var b = document.getElementById(i);
      if (b) { b.disabled = true; b.classList.add('pu-sending'); }
    });
    var pw = document.getElementById('puProgressWrap');
    if (pw) pw.classList.remove('pu-hidden');

    var DevPS = global.DevicePhotoStore;
    if (!DevPS) { self._showResult(false, 'DevicePhotoStore not found'); return; }

    var total   = self._photos.length;
    var done    = 0;
    var results = [];
    var errors  = [];

    function next(i) {
      if (i >= total) {
        var meta = {
          code: code, dims: dims, notes: notes, senderId: senderId, senderName: senderName,
          sendMail: sendMail, closeAfter: closeAfter, isManualCode: isManualCode, isManualDim: isManualDim, deviceType: deviceType
        };
        self._onAllUploaded(results, errors, meta);
        return;
      }
      var p         = self._photos[i];
      var isFirst   = (i === 0);
      var shouldThumb = setThumb && isFirst; /* chỉ ảnh đầu làm thumbnail */

      self._setProgress(Math.round((i / total) * 80), '(' + (i+1) + '/' + total + ')');

      /* processImage trước khi upload */
      self._processImage(p.workingBlob, {}, self._resizeMode)
        .then(function (processedBlob) {
          return self._uploadOnePhoto(DevPS, processedBlob, {
            deviceType:        deviceType,
            deviceId:          deviceId,
            originalFilename:  p.name,
            notes:             notes,
            manualCode:        isManualCode ? (code + ' [手動入力]') : null,
            manualName:        isManualCode ? senderName : null,
            manualDimensions:  isManualDim  ? (dims ? dims + ' [手動入力]' : null) : null,
            senderId:          senderId,
            senderName:        senderName,
            setAsThumbnail:    shouldThumb
          });
        })
        .then(function (res) {
          done++;
          if (res.error) errors.push(res.error);
          else results.push(res.data);
          next(i + 1);
        })
        .catch(function (e) {
          done++;
          errors.push({ message: e.message });
          next(i + 1);
        });
    }

    next(0);
  };

  PhotoUploadModule.prototype._onAllUploaded = function (results, errors, meta) {
    var self = this;
    this._setProgress(90, 'Hoàn tất upload...');

    if (!meta.sendMail || (!results.length)) {
      this._finalize(results, errors, meta);
      return;
    }

    /* Gọi Edge Function send-photo-audit */
    var _devps = global.DevicePhotoStore;
    var client = (_devps && _devps._client) ? _devps._client
               : (global.supabaseClient && typeof global.supabaseClient.functions === 'object') ? global.supabaseClient
               : null;
    if (!client || typeof client.functions !== 'object') {
      console.warn('[PhotoUpload] Không tìm thấy Supabase client – bỏ qua gửi mail.');
      this._finalize(results, errors, meta); return;
    }

    // ----- helpers nhỏ: tách email + tách kích thước -----
    function splitEmails(input) {
      var s = (input || '').toString().trim();
      if (!s) return [];
      return s.split(/[,;\s]+/).map(function (x) { return (x || '').trim(); }).filter(Boolean);
    }
    function parseDimsLWD(text) {
      var s = (text || '').toString().trim();
      if (!s) return { L: null, W: null, D: null };
      // hỗ trợ: "100x200x50", "100×200×50", "100 200 50"
      s = s.replace(/×/g, 'x').replace(/,/g, ' ').replace(/\s+/g, ' ');
      var m = s.match(/(\d+(?:\.\d+)?)\s*(?:x|\s)\s*(\d+(?:\.\d+)?)(?:\s*(?:x|\s)\s*(\d+(?:\.\d+)?))?/i);
      if (!m) return { L: null, W: null, D: null };
      return { L: m[1] || null, W: m[2] || null, D: m[3] || null };
    }

    // ----- build recipients -----
    var recipients = Array.isArray(DEFAULT_TO_MAIL) ? DEFAULT_TO_MAIL : splitEmails(DEFAULT_TO_MAIL);
    if (!recipients.length) {
      console.warn('[PhotoUpload] DEFAULT_TO_MAIL is empty, skip sending mail.');
      this._finalize(results, errors, meta);
      return;
    }

    var edgePhotos = results.map(function (r) {
      var storagePath = r.storagepath || r.storage_path || '';
      var originalName = r.originalfilename || r.original_filename || '';
      var publicUrl = r.publicurl || r.public_url || '';
      return {
        fileName: storagePath,
        originalFileName: originalName || storagePath,
        url: publicUrl,
        moldCode: meta.code || '',
        moldName: meta.code || '',
        dimensionL: null,
        dimensionW: null,
        dimensionD: null,
        setAsThumbnail: !!(r.isthumbnail || r.is_thumbnail)
      };
    });

    /* Security photo is now standalone, no longer needed in combined array */
    var firstPhoto = edgePhotos[0] || null;
    if (!firstPhoto || !firstPhoto.fileName) {
      console.warn('[PhotoUpload] Missing storagepath in upload results, cannot send attachments.');
      this._finalize(results, errors, meta);
      return;
    }

    // ----- dimensions -----
    var dimNote = meta.isManualDim ? (meta.dims ? (meta.dims + ' [手動入力]') : '') : (meta.dims || '');
    var d = parseDimsLWD(meta.dims);

    // ----- payload đúng theo Edge Function R2.3.6 -----
    var batchId = 'pu-' + Date.now();
    var payload = {
      moldCode: meta.isManualCode ? (meta.code + ' [手動入力]') : meta.code,
      moldName: meta.isManualCode ? (meta.code + ' [手動入力]') : meta.code,
      moldId: (this._device && this._device.id) ? this._device.id : null,
      deviceType: meta.deviceType || 'mold',

      dimensionL: d.L,
      dimensionW: d.W,
      dimensionD: d.D,

      // fallback fields (để Edge Function luôn pass validate)
      photoFileName: firstPhoto.fileName,
      originalFileName: firstPhoto.originalFileName,

      photos: edgePhotos,

      employee: meta.senderName || '-',
      employeeId: meta.senderId || null,
      date: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
      notes: meta.notes || '',

      recipients: recipients,
      ccRecipients: Array.isArray(this._ccEmails) ? this._ccEmails : (Array.isArray(this.ccEmails) ? this.ccEmails : []),

      batchId: batchId,
      batch_id: batchId
    };

    client.functions.invoke(EDGE_FN_NAME || EDGE_FN_NAME, { body: payload })
      .then(function (res) {
        self._setProgress(100, '');
        if (res && res.error) {
          console.warn('[PhotoUpload] Mail failed:', res.error);
          self._showResult(true, 'Upload thành công, nhưng gửi mail thất bại. (Vẫn lưu ảnh bình thường)');
        }
        self._finalize(results, errors, meta);
      })
      .catch(function (e) {
        console.warn('[PhotoUpload] Mail failed:', e);
        self._finalize(results, errors, meta);
      });

  };

  PhotoUploadModule.prototype._finalize = function (results, errors, meta) {
    this._setProgress(100, '');
    ['puSendNewBtn','puSendCloseBtn'].forEach(function(i){
      var b = document.getElementById(i);
      if (b) { b.disabled = false; b.classList.remove('pu-sending'); }
    });

    if (errors.length && !results.length) {
      var em = 'エラー: ' + ((errors[0] && errors[0].message) || 'Unknown error');
      this._showResult(false, em);
      this._toast('error', em, 'エラー / Lỗi');
      return;
    }

    var totalRes = results.length;
    var msg = totalRes + ' 枚アップロード完了 / ' + totalRes + ' ảnh đã lưu';
    if (errors.length) msg += ' (' + errors.length + ' lỗi)';

    this._showResult(true, msg);
    this._toast('success', msg, '成功 / Thành công');

    if (this._onDoneCallback) this._onDoneCallback(results);
    document.dispatchEvent(new CustomEvent('photo-upload-done', { detail: { results: results, errors: errors } }));

    if (meta && meta.closeAfter) {
      this.close();
    } else {
      this._resetAfterSuccess();
    }
  };

  /* ──────────────────────────────────────────────────────────
     PROGRESS / RESULT UI
  ────────────────────────────────────────────────────────── */
  PhotoUploadModule.prototype._setProgress = function (pct, label) {
    var fill  = document.getElementById('puProgressFill');
    var lbl   = document.getElementById('puProgressLabel');
    var pctEl = document.getElementById('puProgressPct');
    if (fill)  fill.style.width  = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
    if (lbl && label) lbl.textContent = label;
  };

  PhotoUploadModule.prototype._showResult = function (success, msg) {
    var el = document.getElementById('puSendResult');
    if (!el) return;
    el.className = 'pu-send-result ' + (success ? 'pu-success' : 'pu-error');
    el.innerHTML = '<i class="fas fa-' + (success ? 'check-circle' : 'exclamation-circle') + '"></i> ' + msg;
    el.classList.remove('pu-hidden');
  };

  PhotoUploadModule.prototype._hideResult = function () {
    var el = document.getElementById('puSendResult');
    if (el) el.classList.add('pu-hidden');
  };

  PhotoUploadModule.prototype._uploadSecurityBlob = function (blob, code, cb) {
    if (!blob) return cb(null);
    var _devps = global.DevicePhotoStore;
    var client = (_devps && _devps._client) ? _devps._client : (global.supabaseClient && typeof global.supabaseClient.functions === 'object' ? global.supabaseClient : null);
    if (!client) return cb(null);

    var bucket = _devps ? _devps.bucketId : 'mold-photos';
    var fName = 'sec_' + Date.now() + '.jpg';
    var path = 'employee_verifications/' + fName; 
    client.storage.from(bucket).upload(path, blob)
      .then(function(res) {
        if (res.error) {
          console.warn('[PhotoUpload] Failed to upload security blob to employee_verifications/:', res.error, bucket);
          // Only show alert if it strictly fails, maybe suppress to avoid spam? 
          console.error('Lỗi quyền hệ thống truy cập thư mục employee_verifications/ ' + res.error.message);
          return cb(null);
        }
        var pData = client.storage.from(bucket).getPublicUrl(path);
        cb({
          fileName: path,
          originalFileName: 'security_confirm.jpg',
          url: pData.data ? pData.data.publicUrl : '',
          setAsThumbnail: false
        });
      })
      .catch(function(e){ 
        console.warn('[PhotoUpload] Security blob error:', e);
        cb(null); 
      });
  };


  PhotoUploadModule.prototype._sendSecurityMailOnly = function (secResult) {
    if (!secResult || !secResult.fileName) return;
    var _devps = global.DevicePhotoStore;
    var client = (_devps && _devps._client) ? _devps._client
               : (global.supabaseClient && typeof global.supabaseClient.functions === 'object') ? global.supabaseClient
               : null;
    if (!client || typeof client.functions !== 'object') return;

    var recipients = [];
    if (typeof DEFAULT_TO_MAIL === 'string') {
      recipients = DEFAULT_TO_MAIL.split(/[,;\s]+/).map(function(x){ return x.trim(); }).filter(Boolean);
    } else if (Array.isArray(DEFAULT_TO_MAIL)) {
      recipients = DEFAULT_TO_MAIL;
    }

    var senderId = (document.getElementById('puSenderId') || {}).value || DEFAULT_SENDER_ID;
    
    var edgePhotos = [{
        fileName: secResult.fileName,
        originalFileName: secResult.originalFileName,
        url: secResult.url,
        moldCode: 'SECURITY_AUDIT',
        moldName: 'セキュリティ監査 / Ảnh bảo mật',
        dimensionL: null, dimensionW: null, dimensionD: null,
        setAsThumbnail: false
    }];
    
    var batchId = 'sec-' + Date.now();
    var payload = {
        moldCode: 'セキュリティ監査 / Ảnh bảo mật',
        moldName: 'セキュリティ監査 / Ảnh bảo mật',
        deviceType: 'audit',
        dimensionL: null, dimensionW: null, dimensionD: null,
        photoFileName: secResult.fileName,
        originalFileName: secResult.originalFileName,
        photos: edgePhotos,
        employee: 'System Audit',
        employeeId: senderId,
        date: new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
        notes: '背景で自動的に撮影されたセキュリティ確認写真です。\nẢnh bảo mật chụp tự động bởi hệ thống.',
        recipients: recipients,
        ccRecipients: [],
        batchId: batchId,
        batch_id: batchId
    };
    
    // Gửi ngầm qua Edge Function
    client.functions.invoke(EDGE_FN_NAME || 'send-photo-audit', { body: payload }).catch(function(){});
  };

  PhotoUploadModule.prototype._uploadOnePhoto = function (DevPS, blob, opts) {
    var fname = opts.originalFilename || ('photo-' + Date.now() + '.jpg');
    var fileObj;
    try { fileObj = new File([blob], fname, { type: blob.type || 'image/jpeg' }); }
    catch (e) {
      fileObj = blob;
      try { Object.defineProperty(fileObj,'name',{value:fname,writable:false,configurable:true}); } catch(ig){}
    }
    var hasDevice = !!(opts.deviceType && opts.deviceId);
    return DevPS.uploadPhotos({
      files:[fileObj], devicetype:opts.deviceType||null, deviceid:opts.deviceId||null,
      state:hasDevice?'active':'inbox', manualcode:opts.manualCode||null,
      manualname:opts.manualName||null, manualdimensions:opts.manualDimensions||null,
      manualnotes:opts.notes||null, employeeid:opts.senderId||null,
      employeename:opts.senderName||null, markAsThumbnail:!!opts.setAsThumbnail
    }).then(function(r){
      var row=r&&r.photos&&r.photos[0]?r.photos[0]:null;
      if(!row) throw new Error('[PhotoUpload] uploadPhotos không trả về row.');
      return { data:row, error:null };
    });
  };

  /* ──────────────────────────────────────────────────────────
     SINGLETON EXPORT
  ────────────────────────────────────────────────────────── */
  global.PhotoUpload = new PhotoUploadModule();
  console.log('[PhotoUpload] v8.4.5-2-1 registered as window.PhotoUpload');

})(window);

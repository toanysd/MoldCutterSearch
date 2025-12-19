/**
 * detail-tab.js V7.7.7 CARD SECTIONS
 * ===================================================
 * MODERN 2025 DESIGN
 * - Card-based sections with headers
 * - Row-based property list
 * - Visual hierarchy
 * ===================================================
 */

(function() {
  'use strict';

  // STATE
  let currentItem = null;
  let currentType = null;
  let currentTab = 'summary';

  // FLAT TAB CONFIG
  const TABS_CONFIG = {
    mold: [
      { id: 'summary', icon: '📋', jp: '総合', vn: 'Tổng hợp' },
      { id: 'product', icon: '📦', jp: '製品', vn: 'Sản phẩm' },
      { id: 'technical', icon: '⚙️', jp: '技術', vn: 'Thiết kế' },
      { id: 'related', icon: '🔗', jp: '関連', vn: 'Liên quan' },
      { id: 'processing', icon: '🔄', jp: '処理', vn: 'Xử lý' },
      { id: 'location', icon: '📍', jp: '位置', vn: 'Vị trí' },
      { id: 'shipment', icon: '🚚', jp: '出荷', vn: 'Vận chuyển' },
      { id: 'comments', icon: '💬', jp: 'コメント', vn: 'Bình luận' }
    ],
    cutter: [
      { id: 'summary', icon: '📋', jp: '総合', vn: 'Tổng hợp' },
      { id: 'technical', icon: '⚙️', jp: '技術', vn: 'Kỹ thuật' },
      { id: 'blade', icon: '🔪', jp: '刃', vn: 'Lưỡi dao' },
      { id: 'processing', icon: '🔄', jp: '処理', vn: 'Xử lý' },
      { id: 'location', icon: '📍', jp: '位置', vn: 'Vị trí' },
      { id: 'shipment', icon: '🚚', jp: '出荷', vn: 'Vận chuyển' }
    ]
  };

  // INIT
  init();

  function init() {
    console.log('[DetailTab] V7.7.7 CARD SECTIONS Initialized');
    bindEvents();
  }

  // EVENT LISTENERS
  function bindEvents() {
    document.addEventListener('detail:changed', handleDetailChanged);
    document.addEventListener('detailchanged', handleDetailChanged);
    
    document.addEventListener('tab:changed', (e) => {
      if (e.detail.tab === 'detail' && currentItem) {
        console.log('[DetailTab] Tab activated');
        renderDetail();
      }
    });
  }

  function handleDetailChanged(e) {
    const { item, itemType, itemId } = e.detail;
    console.log('[DetailTab] Event received:', itemType, itemId);

    if (item) {
      currentItem = item;
      currentType = itemType || (item.MoldID != null ? 'mold' : 'cutter');
      
      const detailPane = document.getElementById('detail-pane');
      if (detailPane && detailPane.classList.contains('active')) {
        renderDetail();
      }
    } else if (itemType && itemId) {
      loadItem(itemId, itemType);
    }
  }

  function loadItem(id, type) {
    const data = window.DataManager?.data;
    if (!data) return;

    let found = null;
    if (type === 'mold') {
      found = data.molds?.find(m => m.MoldID == id || m.MoldCode == id);
    } else {
      found = data.cutters?.find(c => c.CutterID == id || c.CutterNo == id);
    }

    if (found) {
      currentItem = found;
      currentType = type;
      const detailPane = document.getElementById('detail-pane');
      if (detailPane && detailPane.classList.contains('active')) {
        renderDetail();
      }
    }
  }

  // MAIN RENDER
  function renderDetail() {
    const container = document.getElementById('detail-content');
    if (!container) return;

    if (!currentItem) {
      container.innerHTML = `
        <div class="detail-empty">
          <i class="fas fa-info-circle"></i>
          <div>詳細を表示するには項目を選択してください</div>
          <div style="font-size:12px;color:#9ca3af;">Chọn mục để xem chi tiết</div>
        </div>
      `;
      return;
    }

    console.log('[DetailTab] Rendering:', currentItem.displayCode);

    container.className = `detail-content-area type-${currentType}`;
    currentTab = 'summary';

    const tabs = TABS_CONFIG[currentType];
    container.innerHTML = `
      <div class="detail-sidebar">
        ${tabs.map(tab => `
          <div class="detail-tab-btn ${tab.id === currentTab ? 'active' : ''}" data-tab="${tab.id}">
            <span class="tab-icon">${tab.icon}</span>
            <div class="tab-labels">
              <div class="tab-label-jp">${tab.jp}</div>
              <div class="tab-label-vn">${tab.vn}</div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="detail-content-wrapper" id="detail-content-wrapper">
        ${renderTabContent(currentTab)}
      </div>
    `;

    bindTabClicks();
  }

  // BIND TAB CLICKS
  function bindTabClicks() {
    const tabBtns = document.querySelectorAll('.detail-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        if (tabId === currentTab) return;

        currentTab = tabId;
        
        document.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        const wrapper = document.getElementById('detail-content-wrapper');
        if (wrapper) {
          wrapper.innerHTML = renderTabContent(tabId);
        }
      });
    });
  }

  // RENDER TAB CONTENT
  function renderTabContent(tabId) {
    switch (tabId) {
      case 'summary': return renderSummary();
      case 'product': return renderProduct();
      case 'technical': return renderTechnical();
      case 'related': return renderRelated();
      case 'blade': return renderBlade();
      case 'processing': return renderProcessing();
      case 'location': return renderLocation();
      case 'shipment': return renderShipment();
      case 'comments': return renderComments();
      default: return '<div class="detail-empty">準備中...</div>';
    }
  }

  // ============================================
  // RENDER SUMMARY
  // ============================================
  function renderSummary() {
    const sections = currentType === 'mold' ? getMoldSummarySections() : getCutterSummarySections();
    return sections.map(renderSection).join('');
  }

  function getMoldSummarySections() {
    const m = currentItem;
    const design = m.designInfo || {};
    const rack = m.rackInfo || {};
    const layer = m.rackLayerInfo || {};
    const customer = m.customerInfo || {};
    const company = m.storageCompanyInfo || {};

    return [
      {
        icon: '📋',
        titleJP: '基本情報',
        titleVN: 'THÔNG TIN CƠ BẢN',
        rows: [
          { jp: '金型コード', vn: 'Mã khung', value: m.MoldCode, h: true },
          { jp: '寸法', vn: 'Kích thước', value: m.displayDimensions, h: true },
          { jp: 'CAV', vn: 'CAV', value: getCavCode(design.MoldDesignLength, design.MoldDesignWidth) },
          { jp: 'ピース数', vn: 'Số miếng', value: design.PieceCount }
        ]
      },
      {
        icon: '📍',
        titleJP: '保管情報',
        titleVN: 'THÔNG TIN LƯU TRỮ',
        rows: [
          { jp: '保管会社', vn: 'Công ty lưu', value: company.CompanyShortName || company.CompanyName },
          { jp: 'ラック', vn: 'Giá', value: rack.RackLocation },
          { jp: 'ラック位置', vn: 'Vị trí giá-tầng', value: formatRackPos(rack, layer) },
          { jp: 'ステータス', vn: 'Trạng thái', value: getMoldStatus(m), h: true }
        ]
      },
      {
        icon: '👤',
        titleJP: '顧客情報',
        titleVN: 'THÔNG TIN KHÁCH HÀNG',
        rows: [
          { jp: '顧客コード', vn: 'Mã khách hàng', value: customer.CustomerCode },
          { jp: '顧客名', vn: 'Tên khách hàng', value: customer.CustomerName, full: true }
        ]
      },
      {
        icon: '📝',
        titleJP: 'その他',
        titleVN: 'THÔNG TIN KHÁC',
        rows: [
          { jp: '重量', vn: 'Khối lượng', value: design.MoldDesignWeight ? `${design.MoldDesignWeight} kg` : '-' },
          { jp: '入庫日', vn: 'Ngày nhập kho', value: formatDate(m.MoldEntry) },
          { jp: '備考', vn: 'Ghi chú', value: m.MoldNotes, full: true }
        ]
      }
    ];
  }

  function getCutterSummarySections() {
    const c = currentItem;
    const rack = c.rackInfo || {};
    const layer = c.rackLayerInfo || {};
    const customer = c.customerInfo || {};
    const company = c.storageCompanyInfo || {};

    return [
      {
        icon: '📋',
        titleJP: '基本情報',
        titleVN: 'THÔNG TIN CƠ BẢN',
        rows: [
          { jp: 'カッターNo', vn: 'Số dao cắt', value: c.CutterNo, h: true },
          { jp: '名前', vn: 'Tên', value: c.CutterName, h: true },
          { jp: '寸法', vn: 'Kích thước', value: c.displayDimensions, h: true },
          { jp: '刃数', vn: 'Số lưỡi', value: c.BladeCount }
        ]
      },
      {
        icon: '📍',
        titleJP: '保管情報',
        titleVN: 'THÔNG TIN LƯU TRỮ',
        rows: [
          { jp: '保管会社', vn: 'Công ty lưu', value: company.CompanyShortName },
          { jp: 'ラック', vn: 'Giá', value: rack.RackLocation },
          { jp: 'ラック位置', vn: 'Vị trí giá-tầng', value: formatRackPos(rack, layer) },
          { jp: 'ステータス', vn: 'Trạng thái', value: getCutterStatus(c), h: true }
        ]
      },
      {
        icon: '👤',
        titleJP: '顧客情報',
        titleVN: 'THÔNG TIN KHÁCH HÀNG',
        rows: [
          { jp: '顧客コード', vn: 'Mã khách hàng', value: customer.CustomerCode },
          { jp: '顧客名', vn: 'Tên khách hàng', value: customer.CustomerName, full: true }
        ]
      }
    ];
  }

  // ============================================
  // RENDER PRODUCT
  // ============================================
  function renderProduct() {
    const m = currentItem;
    const job = m.jobInfo || {};
    const customer = m.customerInfo || {};
    
    return renderSection({
      icon: '📦',
      titleJP: '製品情報',
      titleVN: 'THÔNG TIN SẢN PHẨM',
      rows: [
        { jp: '顧客コード', vn: 'Mã khách hàng', value: customer.CustomerCode },
        { jp: '顧客名', vn: 'Tên khách hàng', value: customer.CustomerName, full: true },
        { jp: '製品コード', vn: 'Mã sản phẩm', value: job.JobCode },
        { jp: '製品名', vn: 'Tên sản phẩm', value: job.JobName, full: true },
        { jp: '納期', vn: 'Hạn giao hàng', value: formatDate(job.DeliveryDeadline) },
        { jp: '数量', vn: 'Số lượng', value: job.Quantity }
      ]
    });
  }

  // ============================================
  // RENDER TECHNICAL
  // ============================================
  function renderTechnical() {
    const sections = currentType === 'mold' ? getMoldTechSections() : getCutterTechSections();
    return sections.map(renderSection).join('');
  }

  function getMoldTechSections() {
    const design = currentItem.designInfo || {};
    
    return [{
      icon: '⚙️',
      titleJP: '設計情報',
      titleVN: 'THÔNG TIN THIẾT KẾ',
      rows: [
        { jp: '長さ', vn: 'Chiều dài', value: design.MoldDesignLength ? `${design.MoldDesignLength} mm` : '-' },
        { jp: '幅', vn: 'Chiều rộng', value: design.MoldDesignWidth ? `${design.MoldDesignWidth} mm` : '-' },
        { jp: '高さ', vn: 'Chiều cao', value: design.MoldDesignHeight ? `${design.MoldDesignHeight} mm` : '-' },
        { jp: '重量', vn: 'Khối lượng', value: design.MoldDesignWeight ? `${design.MoldDesignWeight} kg` : '-' },
        { jp: 'ピース数', vn: 'Số miếng', value: design.PieceCount },
        { jp: '材質', vn: 'Chất liệu', value: design.Material },
        { jp: '硬度', vn: 'Độ cứng', value: design.Hardness },
        { jp: '備考', vn: 'Ghi chú', value: design.Notes, full: true }
      ]
    }];
  }

  function getCutterTechSections() {
    const c = currentItem;
    
    return [{
      icon: '⚙️',
      titleJP: '技術情報',
      titleVN: 'THÔNG TIN KỸ THUẬT',
      rows: [
        { jp: '長さ', vn: 'Chiều dài', value: c.CutterLength ? `${c.CutterLength} mm` : '-' },
        { jp: '幅', vn: 'Chiều rộng', value: c.CutterWidth ? `${c.CutterWidth} mm` : '-' },
        { jp: '刃数', vn: 'Số lưỡi', value: c.BladeCount },
        { jp: '材質', vn: 'Chất liệu', value: c.Material },
        { jp: '硬度', vn: 'Độ cứng', value: c.Hardness },
        { jp: 'SATOコード', vn: 'SATO Code', value: c.SatoCode },
        { jp: '備考', vn: 'Ghi chú', value: c.CutterNotes, full: true }
      ]
    }];
  }

  // ============================================
  // RENDER RELATED
  // ============================================
  function renderRelated() {
    const cutters = currentItem.relatedCutters || [];
    if (cutters.length === 0) {
      return '<div class="detail-empty"><i class="fas fa-scissors"></i><div>関連カッターなし</div><div style="font-size:11px;">Không có dao cắt liên quan</div></div>';
    }
    
    return `
      <div class="detail-section">
        <div class="section-header">
          <span class="section-icon">🔗</span>
          <div class="section-title">
            <div class="section-title-jp">関連カッター</div>
            <div class="section-title-vn">DAO CẮT LIÊN QUAN</div>
          </div>
        </div>
        <div class="property-list">
          ${cutters.map(c => `
            <div class="property-row">
              <div style="display:flex;align-items:center;gap:10px;width:100%;">
                <i class="fas fa-scissors" style="color:#f97316;font-size:14px;"></i>
                <div style="flex:1;">
                  <div style="font-size:13px;font-weight:700;color:#111827;">${esc(c.CutterNo)}</div>
                  <div style="font-size:11px;color:#6b7280;">${esc(c.CutterName || '-')}</div>
                </div>
                <div style="font-size:11px;color:#9ca3af;">${esc(c.displayDimensions || '-')}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ============================================
  // RENDER BLADE
  // ============================================
  function renderBlade() {
    const c = currentItem;
    
    return renderSection({
      icon: '🔪',
      titleJP: '刃情報',
      titleVN: 'THÔNG TIN LƯỠI DAO',
      rows: [
        { jp: '刃数', vn: 'Số lưỡi', value: c.BladeCount },
        { jp: '刃高さ', vn: 'Độ cao lưỡi', value: c.BladeHeight ? `${c.BladeHeight} mm` : '-' },
        { jp: '刃厚', vn: 'Độ dày lưỡi', value: c.BladeThickness ? `${c.BladeThickness} mm` : '-' },
        { jp: '研磨回数', vn: 'Số lần mài', value: c.SharpeningCount || '0', h: true },
        { jp: '刃状態', vn: 'Trạng thái lưỡi', value: getBladeStatus(c), h: true },
        { jp: '最終研磨日', vn: 'Ngày mài cuối', value: formatDate(c.LastSharpeningDate) }
      ]
    });
  }

  // ============================================
  // RENDER PROCESSING
  // ============================================
  function renderProcessing() {
    const item = currentItem;
    const isMold = currentType === 'mold';
    
    const rows = isMold ? [
      { jp: 'テフロン', vn: 'Teflon', value: item.TeflonCoating || 'NA' },
      { jp: 'テフロン日', vn: 'Ngày Teflon', value: formatDate(item.TeflonDate) },
      { jp: '返却', vn: 'Trả lại', value: item.MoldReturning || 'FALSE' },
      { jp: '廃棄', vn: 'Hủy bỏ', value: item.MoldDisposing || 'FALSE' }
    ] : [
      { jp: '返却', vn: 'Trả lại', value: item.CutterReturning || 'FALSE' },
      { jp: '廃棄', vn: 'Hủy bỏ', value: item.CutterDisposing || 'FALSE' }
    ];
    
    return renderSection({
      icon: '🔄',
      titleJP: '処理状況',
      titleVN: 'TRẠNG THÁI XỬ LÝ',
      rows: rows
    });
  }

  // ============================================
  // RENDER LOCATION HISTORY
  // ============================================
  function renderLocation() {
    const data = window.DataManager?.data;
    if (!data?.locationlog) return '<div class="detail-empty"><i class="fas fa-map-marker-alt"></i><div>履歴なし</div></div>';
    
    const itemId = currentType === 'mold' ? currentItem.MoldID : currentItem.CutterID;
    const logs = data.locationlog.filter(log => 
      currentType === 'mold' ? log.moldid == itemId : log.cutterid == itemId
    ).sort((a, b) => new Date(b.changedate) - new Date(a.changedate)).slice(0, 30);
    
    if (logs.length === 0) return '<div class="detail-empty"><i class="fas fa-map-marker-alt"></i><div>履歴なし</div></div>';
    
    return `
      <div class="detail-section">
        <div class="section-header">
          <span class="section-icon">📍</span>
          <div class="section-title">
            <div class="section-title-jp">位置履歴</div>
            <div class="section-title-vn">LỊCH SỬ VỊ TRÍ</div>
          </div>
        </div>
        <div class="history-list">
          ${logs.map(log => `
            <div class="history-item">
              <div class="history-date">${formatDate(log.changedate)}</div>
              <div class="history-content">
                <div class="history-title">${esc(log.newlocation || '-')}</div>
                ${log.notes ? `<div class="history-note">${esc(log.notes)}</div>` : ''}
              </div>
              <div class="history-user">${esc(log.employeename || '-')}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ============================================
  // RENDER SHIPMENT HISTORY
  // ============================================
  function renderShipment() {
    const data = window.DataManager?.data;
    if (!data?.shiplog) return '<div class="detail-empty"><i class="fas fa-truck"></i><div>履歴なし</div></div>';
    
    const itemId = currentType === 'mold' ? currentItem.MoldID : currentItem.CutterID;
    const logs = data.shiplog.filter(log => 
      currentType === 'mold' ? log.moldid == itemId : log.cutterid == itemId
    ).sort((a, b) => new Date(b.shipdate) - new Date(a.shipdate)).slice(0, 30);
    
    if (logs.length === 0) return '<div class="detail-empty"><i class="fas fa-truck"></i><div>履歴なし</div></div>';
    
    return `
      <div class="detail-section">
        <div class="section-header">
          <span class="section-icon">🚚</span>
          <div class="section-title">
            <div class="section-title-jp">出荷履歴</div>
            <div class="section-title-vn">LỊCH SỬ VẬN CHUYỂN</div>
          </div>
        </div>
        <div class="history-list">
          ${logs.map(log => `
            <div class="history-item">
              <div class="history-date">${formatDate(log.shipdate)}</div>
              <div class="history-content">
                <div class="history-title">${esc(log.destinationname || '-')}</div>
                ${log.notes ? `<div class="history-note">${esc(log.notes)}</div>` : ''}
              </div>
              <div class="history-user">${esc(log.employeename || '-')}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ============================================
  // RENDER COMMENTS
  // ============================================
  function renderComments() {
    const data = window.DataManager?.data;
    if (!data?.usercomments || currentType !== 'mold') {
      return '<div class="detail-empty"><i class="fas fa-comments"></i><div>コメントなし</div></div>';
    }
    
    const comments = data.usercomments.filter(c => c.moldid == currentItem.MoldID)
      .sort((a, b) => new Date(b.commentdate) - new Date(a.commentdate));
    
    if (comments.length === 0) {
      return '<div class="detail-empty"><i class="fas fa-comments"></i><div>コメントなし</div></div>';
    }
    
    return `
      <div class="detail-section">
        <div class="section-header">
          <span class="section-icon">💬</span>
          <div class="section-title">
            <div class="section-title-jp">ユーザーコメント</div>
            <div class="section-title-vn">BÌNH LUẬN NGƯỜI DÙNG</div>
          </div>
        </div>
        <div class="history-list">
          ${comments.map(c => `
            <div class="history-item">
              <div class="history-date">${formatDate(c.commentdate)}</div>
              <div class="history-content">
                <div class="history-title">${esc(c.employeename || '-')}</div>
                <div class="history-note">${esc(c.comment || '')}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ============================================
  // RENDER SECTION
  // ============================================
  function renderSection(section) {
    return `
      <div class="detail-section">
        <div class="section-header">
          <span class="section-icon">${section.icon}</span>
          <div class="section-title">
            <div class="section-title-jp">${section.titleJP}</div>
            <div class="section-title-vn">${section.titleVN}</div>
          </div>
        </div>
        <div class="property-list">
          ${section.rows.map(renderRow).join('')}
        </div>
      </div>
    `;
  }

  // ============================================
  // RENDER ROW
  // ============================================
  function renderRow(row) {
    const fullClass = row.full ? 'full-width' : '';
    const highlightClass = row.h ? 'highlight' : '';
    const emptyClass = (!row.value || row.value === '-') ? 'empty' : '';

    return `
      <div class="property-row ${fullClass}">
        <div class="property-label">
          <div class="property-label-jp">${esc(row.jp)}</div>
          <div class="property-label-vn">${esc(row.vn)}</div>
        </div>
        <div class="property-value ${highlightClass} ${emptyClass}">
          ${esc(row.value || '-')}
        </div>
      </div>
    `;
  }

  // ============================================
  // HELPERS
  // ============================================
  function getCavCode(l, w) {
    const cavData = window.DataManager?.data?.CAV;
    if (!l || !w || !cavData) return 'OTHER';
    const moldL = parseFloat(l), moldW = parseFloat(w);
    if (isNaN(moldL) || isNaN(moldW)) return 'OTHER';
    const match = cavData.find(cav => {
      const cavL = parseFloat(cav.CAVlength), cavW = parseFloat(cav.CAVwidth);
      return !isNaN(cavL) && !isNaN(cavW) && Math.abs(moldL - cavL) <= 5 && Math.abs(moldW - cavW) <= 5;
    });
    return match ? match.CAV : 'OTHER';
  }

  function formatRackPos(rack, layer) {
    return (rack?.RackID && layer?.RackLayerNumber) ? `${rack.RackID}-${layer.RackLayerNumber}` : '-';
  }

  function getMoldStatus(m) {
    if (m.MoldReturning && m.MoldReturning !== 'FALSE') return m.MoldReturning;
    if (m.MoldDisposing && m.MoldDisposing !== 'FALSE') return m.MoldDisposing;
    if (m.storagecompany && m.storagecompany != 2) return '出庫';
    return '在庫';
  }

  function getCutterStatus(c) {
    if (c.CutterReturning && c.CutterReturning !== 'FALSE') return c.CutterReturning;
    if (c.CutterDisposing && c.CutterDisposing !== 'FALSE') return c.CutterDisposing;
    if (c.storagecompany && c.storagecompany != 2) return '出庫';
    return '在庫';
  }

  function getBladeStatus(c) {
    const cnt = parseInt(c.SharpeningCount, 10) || 0;
    return cnt >= 5 ? '要交換' : cnt >= 3 ? '注意' : '良好';
  }

  function formatDate(d) {
    if (!d) return '-';
    const date = new Date(d);
    if (isNaN(date)) return '-';
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // EXPORT
  window.DetailTab = {
    currentItem: () => currentItem,
    currentType: () => currentType,
    render: renderDetail
  };

})();

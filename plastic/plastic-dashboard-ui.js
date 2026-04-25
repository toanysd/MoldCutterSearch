const PlasticDashboardUI = (() => {
  let supabase = null;
  let containerEl = null;
  let masterData = [];
  let receiptData = [];
  let rollData = [];
  let mapData = [];
  let adjustmentLogData = [];
  let joinedRows = [];
  let period = '7d';
  let selectedSection = 'alerts';
  let chartInstances = {};

  function init(supabaseClient, containerId) {
    supabase = supabaseClient;
    containerEl = document.getElementById(containerId);
    if (!containerEl) {
      console.error(`[PlasticDashboardUI] Không tìm thấy container #${containerId}`);
      return;
    }
    injectStyles();
    render();
    bootstrap();
  }

  async function bootstrap() {
    try {
      await loadAllData();
      joinRows();
      refreshUI();
    } catch (err) {
      showToast('❌ ' + (err?.message || err), 'error');
    }
  }

  async function loadAllData() {
    const [masterRes, receiptRes, rollRes, mapRes, logRes] = await Promise.all([
      supabase.from('plastic_master').select('*').order('plastic_code', { ascending: true }),
      supabase.from('plastic_receipt').select('*').order('receipt_date', { ascending: false }),
      supabase.from('plastic_receipt_roll').select('*').order('updated_at', { ascending: false }),
      supabase.from('plastic_manufacturer_map').select('*').order('commercial_grade_code', { ascending: true }),
      supabase.from('plastic_adjustment_log').select('*').order('created_at', { ascending: false }).limit(2000),
    ]);
    if (masterRes.error) throw masterRes.error;
    if (receiptRes.error) throw receiptRes.error;
    if (rollRes.error) throw rollRes.error;
    if (mapRes.error) throw mapRes.error;
    if (logRes.error) throw logRes.error;
    masterData = masterRes.data || [];
    receiptData = receiptRes.data || [];
    rollData = rollRes.data || [];
    mapData = mapRes.data || [];
    adjustmentLogData = logRes.data || [];
  }

  function joinRows() {
    joinedRows = rollData.map(roll => {
      const receipt = receiptData.find(r => r.receipt_id === roll.receipt_id) || {};
      const master = masterData.find(m => m.plastic_id === roll.plastic_id) || {};
      const map = !roll.plastic_id ? findBestMap(roll.commercial_grade_code, roll.supplier_name || receipt.supplier_name) : null;
      const current = Number(roll.current_length_m || 0);
      const received = Number(roll.received_length_m || 0);
      return {
        row_id: roll.receipt_roll_id,
        receipt_roll_id: roll.receipt_roll_id,
        receipt_id: roll.receipt_id,
        plastic_id: roll.plastic_id || null,
        plastic_code: master.plastic_code || '',
        plastic_family: master.plastic_family || '',
        plastic_subtype: master.plastic_subtype || '',
        thickness_mm: roll.thickness_mm ?? master.thickness_mm ?? null,
        width_mm: roll.width_mm ?? master.width_mm ?? null,
        nominal_length_m: roll.nominal_length_m ?? master.standard_length_m ?? null,
        received_length_m: received,
        current_length_m: current,
        commercial_grade_code: roll.commercial_grade_code || '',
        supplier_name: roll.supplier_name || receipt.supplier_name || '',
        lot_no: roll.lot_no || '',
        warehouse_location: roll.warehouse_location || '',
        receipt_no: receipt.receipt_no || '',
        receipt_date: receipt.receipt_date || '',
        receipt_status: receipt.status || '',
        roll_status: roll.roll_status || '',
        color_code_raw: master.color_code_raw || '',
        color_name_normalized: master.color_name_normalized || '',
        electrical_property: master.electrical_property || '',
        silicone_status_normalized: master.silicone_status_normalized || '',
        additive_flags: master.additive_flags || '',
        status_review: master.status_review || '',
        updated_at: roll.updated_at || roll.created_at || '',
        mapped_state: roll.plastic_id ? 'mapped' : (map?.plastic_id ? 'suggested' : 'unmapped'),
        suggested_plastic_id: map?.plastic_id || null,
        low_stock: current > 0 && current <= 50,
      };
    });
  }

  // ──────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────
  function render() {
    containerEl.innerHTML = `
<div class="view-panel active" id="panel-plastic" style="overflow:hidden; display:flex !important; max-width: 100%; height: 100%;">
  <div class="content" style="padding: var(--space-4); display:flex; flex-direction:column; gap: var(--space-4); overflow-y: auto; flex:1;">
    
    <!-- Alert Banner Placeholders (will be populated dynamically) -->
    <div id="pd-alerts-wrap">${renderAlerts()}</div>

    <!-- WMS Header -->
    <div class="wms-header">
      <div class="wms-header-left">
        <div class="wms-title-row">
          <div class="wms-header-icon"><i class="fas fa-boxes"></i></div>
          <div class="wms-title">
            <span class="ja">プラ材料倉庫管理 (WMS)</span>
            <span class="vi">Quản lý Nhựa / Plastic WMS</span>
          </div>
        </div>
        <div class="wms-subtitle">
            <span class="ja">入荷・出力および在庫状況をリアルタイムで追跡</span>
            <span class="vi">Tình trạng nhập xuất, tồn kho thời gian thực. Theo dõi cuộn nhựa sắp hết hoặc ngưng sử dụng (NG).</span>
        </div>
      </div>
      
      <div class="wms-header-actions">
        <div class="period-tabs">
          <button class="period-tab ${period === '7d' ? 'active' : ''}" onclick="window.PlasticDashboardUI && window.PlasticDashboardUI.setPeriod('7d')">
            7日間 <span class="vi">7 ngày qua</span>
          </button>
          <button class="period-tab ${period === '30d' ? 'active' : ''}" onclick="window.PlasticDashboardUI && window.PlasticDashboardUI.setPeriod('30d')">
            今月 <span class="vi">Tháng này</span>
          </button>
          <button class="period-tab ${period === 'today' ? 'active' : ''}" onclick="window.PlasticDashboardUI && window.PlasticDashboardUI.setPeriod('today')">
            今日 <span class="vi">Hôm nay</span>
          </button>
          <button class="period-tab ${period === 'all' ? 'active' : ''}" onclick="window.PlasticDashboardUI && window.PlasticDashboardUI.setPeriod('all')">
            すべて <span class="vi">Tất cả</span>
          </button>
        </div>
        <button class="wms-hdr-btn white" onclick="window.PlasticDashboardUI && window.PlasticDashboardUI.reload()">
          <i class="fas fa-sync-alt"></i> Tải lại
        </button>
      </div>
    </div>

    <!-- Section Label -->
    <div class="section-label">
      KPI & 状態サマリー <span class="vi">Tổng quan chỉ số</span>
    </div>

    <!-- KPI GRID -->
    <div class="kpi-grid" id="pd-summary">
      ${renderSummaryCards()}
    </div>

    <!-- Section Label -->
    <div class="section-label" style="margin-top: var(--space-2)">
      パフォーマンス分析 <span class="vi">Phân tích hiệu suất</span>
    </div>

    <!-- CHARTS -->
    <div class="chart-row">
      <!-- Mới về -->
      <div class="chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">
            <span class="ja">入荷トレンド</span>
            <span class="vi">Xu hướng nhập</span>
          </div>
          <div class="chart-tag monthly">${period}</div>
        </div>
        <div><canvas id="chartTrend" style="max-height:180px;"></canvas></div>
      </div>
      
      <!-- Loại vật liệu -->
      <div class="chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">
            <span class="ja">材料タイプ分布</span>
            <span class="vi">Tỷ lệ vật liệu</span>
          </div>
          <div class="chart-tag live">Live</div>
        </div>
        <div><canvas id="chartFamily" style="max-height:180px;"></canvas></div>
      </div>

      <!-- Màu sắc (Mới thêm) -->
      <div class="chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">
            <span class="ja">カラー分布</span>
            <span class="vi">Tỷ lệ Màu sắc</span>
          </div>
          <div class="chart-tag live">Live</div>
        </div>
        <div><canvas id="chartColor" style="max-height:180px;"></canvas></div>
      </div>

      <!-- Tiêu thụ -->
      <div class="chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">
            <span class="ja">消費トップ</span>
            <span class="vi">Tiêu dùng nhiều</span>
          </div>
          <div class="chart-tag weekly">${period}</div>
        </div>
        <div id="pd-top-material-wrap">${renderTopMaterialList()}</div>
      </div>
    </div>

    <!-- Tạm giữ tables cũ ở dưới -->
    <div class="pd-section-pad" style="margin-top:12px;">
      <div class="section-label" style="margin-bottom:12px;">データ詳細 <span class="vi">Dữ liệu chi tiết</span></div>
      <div class="pd-table-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div class="chart-card">
          <div class="chart-card-header"><div class="chart-card-title"><span class="ja">最近の使用</span><span class="vi">Sử dụng gần đây</span></div></div>
          <div id="pd-usage-wrap">${renderRecentUsage()}</div>
        </div>
        <div class="chart-card">
          <div class="chart-card-header"><div class="chart-card-title"><span class="ja">未マッピング</span><span class="vi">Cuộn chưa tham chiếu</span></div></div>
          <div id="pd-unmapped-wrap">${renderUnmappedTable()}</div>
        </div>
        <div class="chart-card" style="grid-column: 1 / -1;">
          <div class="chart-card-header"><div class="chart-card-title"><span class="ja">在庫不足</span><span class="vi">Sắp hết / Thiếu hụt</span></div></div>
          <div id="pd-lowstock-wrap">${renderLowStockTable()}</div>
        </div>
      </div>
    </div>

  </div>
  <div class="pd-toast-wrap" id="pd-toast-wrap"></div>
</div>`;
  }

  function renderPeriodButtons() {
    const buttons = [
      { key: 'today', label: t('dashboard.period.today') },
      { key: '7d',    label: t('dashboard.period.7d') },
      { key: '30d',   label: t('dashboard.period.30d') },
      { key: 'all',   label: t('dashboard.period.all') },
    ];
    return buttons.map(btn => `<div class="pd-switch ${period === btn.key ? 'active' : ''}" onclick="PlasticDashboardUI.setPeriod('${btn.key}')">${btn.label}</div>`).join('');
  }

  // ──────────────────────────────────────────
  // KPI CARDS — THEO MOCKUP
  // ──────────────────────────────────────────
  function renderSummaryCards() {
    const currentRows = joinedRows.filter(r => Number(r.current_length_m || 0) > 0);
    const totalCurrent = currentRows.reduce((sum, r) => sum + Number(r.current_length_m || 0), 0);
    const totalReceived = joinedRows.reduce((sum, r) => sum + Number(r.received_length_m || 0), 0);
    const lowStock = currentRows.filter(r => r.low_stock).length;
    const unmapped = joinedRows.filter(r => r.mapped_state === 'unmapped').length;
    const periodUsage = getPeriodUsageLogs();
    const usageMeters = periodUsage.reduce((sum, log) => sum + Math.abs(Number(log.change_length_m || 0)), 0);
    const periodReceived = getPeriodReceipts().reduce((s, r) => {
      const rs = rollData.filter(roll => roll.receipt_id === r.receipt_id);
      return s + rs.reduce((ss, roll) => ss + Number(roll.received_length_m || 0), 0);
    }, 0);
    const periodReceivedSign = periodReceived > 0 ? `+${fmt(periodReceived)}m` : '—';

    const cards = [
      {
        icon: '<i class="fas fa-cubes"></i>',
        value: joinedRows.length.toLocaleString('ja-JP'),
        labelJa: '総ロール数', labelVi: 'Tổng cuộn tồn',
        sub: '全種類・全サイズ',
        trend: '',
        type: 'teal',
      },
      {
        icon: '<i class="fas fa-boxes"></i>',
        value: fmt(totalCurrent) + 'm',
        labelJa: '総在庫長', labelVi: 'Độ dài (m)',
        sub: 'リアルタイム残量',
        trend: '',
        type: 'blue',
      },
      {
        icon: '<i class="fas fa-truck-loading"></i>',
        value: fmt(totalReceived) + 'm',
        labelJa: '入荷量 (期間)', labelVi: 'Tổng nhập (m)',
        sub: '指定期間',
        trend: `<div class="kpi-trend up"><i class="fas fa-arrow-up"></i> ${periodReceivedSign}</div>`,
        type: 'orange',
      },
      {
        icon: '<i class="fas fa-scissors"></i>',
        value: fmt(usageMeters) + 'm',
        labelJa: '使用量 (期間)', labelVi: 'Xuất dùng (m)',
        sub: '指定期間',
        trend: '',
        type: 'purple',
      },
      {
        icon: '<i class="fas fa-exclamation-triangle"></i>',
        value: lowStock,
        labelJa: '在庫不足', labelVi: 'Sắp hết',
        sub: '安全在庫割れ',
        trend: '',
        type: lowStock > 0 ? 'red' : 'green',
        valueClass: lowStock > 0 ? 'alert' : 'success',
      },
      {
        icon: '<i class="fas fa-link"></i>',
        value: unmapped,
        labelJa: '未マッピング', labelVi: 'Lỗi tham chiếu',
        sub: unmapped === 0 ? '全件OK' : '要マスタ登録',
        trend: '',
        type: unmapped === 0 ? 'green' : 'amber',
        valueClass: unmapped === 0 ? 'success' : 'warning',
      },
    ];

    return cards.map(c => `
<div class="kpi-card ${c.type}">
  <div class="kpi-header">
    <div class="kpi-icon">${c.icon}</div>
    ${c.trend ? c.trend : ''}
  </div>
  <div class="kpi-label">
    <span class="ja">${c.labelJa}</span>
    <span class="vi">${c.labelVi}</span>
  </div>
  <div class="kpi-value ${c.valueClass || ''}">${c.value}</div>
  <div class="kpi-sub">${c.sub}</div>
</div>`).join('');
  }

  // ──────────────────────────────────────────
  // ALERTS
  // ──────────────────────────────────────────
  function renderAlerts() {
    const alerts = [];
    const unmapped = joinedRows.filter(r => r.mapped_state === 'unmapped').length;
    const lowStock = joinedRows.filter(r => r.low_stock).length;
    const damaged = joinedRows.filter(r => r.roll_status === 'damaged').length;

    if (unmapped) alerts.push({ type: 'warning', icon: '<i class="fas fa-exclamation-circle"></i>', titleJa: '未マッピングアラート', textVi: `${unmapped} cuộn chưa có dữ liệu Master`, titleVi: t('alert.unmapped_title', false) });
    if (lowStock) alerts.push({ type: 'warning', icon: '<i class="fas fa-exclamation-triangle"></i>', titleJa: `在庫不足アラート — ${lowStock}本のロールが最低在庫ラインを下回っています`, textVi: `Cảnh báo tồn thấp — ${lowStock} cuộn nhựa dưới mức tối thiểu`, titleVi: t('alert.lowstock_title', false) });
    if (damaged) alerts.push({ type: 'error', icon: '<i class="fas fa-times-circle"></i>', titleJa: `NGアラート — ${damaged}本のロールが使用不可`, textVi: `Lỗi NG — ${damaged} cuộn báo hỏng`, titleVi: t('alert.damaged_title', false) });

    if (!alerts.length) return '';
    return `<div style="display:flex; flex-direction:column; gap: var(--space-2);">${alerts.map(item => `
<div class="alert-banner ${item.type}">
  <div class="alert-icon">${item.icon}</div>
  <div class="alert-text">
    <div class="ja">${item.titleJa}</div>
    <div class="vi">${item.textVi}</div>
  </div>
  <button class="alert-dismiss" onclick="this.parentElement.style.display='none'"><i class="fas fa-times"></i></button>
</div>`).join('')}</div>`;
  }

  // ──────────────────────────────────────────
  // TOP MATERIAL LIST (thay chart supplier)
  // ──────────────────────────────────────────
  function renderTopMaterialList() {
    const groups = {};
    const logs = getPeriodUsageLogs();
    logs.forEach(l => {
      const row = joinedRows.find(r => r.receipt_roll_id === l.receipt_roll_id);
      const code = row?.plastic_code || row?.commercial_grade_code || '?';
      const family = row?.plastic_family || '';
      if (!groups[code]) groups[code] = { code, family, total: 0 };
      groups[code].total += Math.abs(Number(l.change_length_m || 0));
    });
    const sorted = Object.values(groups).sort((a, b) => b.total - a.total).slice(0, 6);
    if (!sorted.length) return `<div class="pd-empty">${t('table.empty')}</div>`;
    const maxVal = sorted[0].total || 1;
    return `<div class="pd-material-list">${sorted.map((item, i) => `
<div class="pd-material-row">
  <div class="pd-material-meta">
    <span class="pd-material-code">${esc(item.code)}</span>
    <span class="pd-material-family">${esc(item.family)}</span>
  </div>
  <div class="pd-material-bar-wrap">
    <div class="pd-material-bar" style="width:${Math.round((item.total / maxVal) * 100)}%;background:var(--mcs-group-${(i % 6) + 1})"></div>
  </div>
  <div class="pd-material-val">${fmt(item.total)}m</div>
</div>`).join('')}</div>`;
  }

  // ──────────────────────────────────────────
  // CHART RENDERERS
  // ──────────────────────────────────────────
  function destroyChart(id) {
    if (chartInstances[id]) { chartInstances[id].destroy(); chartInstances[id] = null; }
  }

  function renderCharts() {
    if (typeof Chart === 'undefined') { console.warn('[PD] Chart.js not loaded'); return; }
    renderChartFamily();
    renderChartColor();
    renderChartTrend();
    renderChartSupplier();
  }

  function renderChartFamily() {
    destroyChart('chartFamily');
    const ctx = document.getElementById('chartFamily');
    if (!ctx) return;
    const groups = {};
    function mapFamilyLabel(f) {
      if (!window.t_plain) return f;
      return window.t_plain('family.' + f);
    }

    joinedRows.forEach(r => {
      let g = (r.plastic_family || 'Other').trim();
      g = mapFamilyLabel(g);
      groups[g] = (groups[g] || 0) + Number(r.current_length_m || 0);
    });
    const labels = Object.keys(groups);
    const data = Object.values(groups);
    const MCS_COLORS = ['#0d7a7a','#8e44ad','#2980b9','#d35400','#16a085','#7f8c8d'];
    chartInstances['chartFamily'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: MCS_COLORS, borderWidth: 2, borderColor: '#ffffff' }]
      },
      options: {
        responsive: true,
        cutout: '62%',
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12, padding: 12, font: { size: 12, family: "'Noto Sans JP', sans-serif" }, color: '#1a1a2e' } }
        }
      }
    });
  }

  function renderChartColor() {
    destroyChart('chartColor');
    const ctx = document.getElementById('chartColor');
    if (!ctx) return;
    const groups = {};
    joinedRows.forEach(r => {
      const g = (r.color_name_normalized || 'unknown').trim();
      groups[g] = (groups[g] || 0) + Number(r.current_length_m || 0);
    });
    
    const labels = [];
    const data = [];
    const bgColors = [];
    
    Object.keys(groups).sort((a, b) => groups[b] - groups[a]).forEach(k => {
       const label = window.t_plain ? window.t_plain('color.' + k) : (k === 'unknown' ? 'Khác / Chưa XĐ' : k);
       labels.push(label);
       data.push(groups[k]);
       bgColors.push(getColorHex(k));
    });

    chartInstances['chartColor'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data, backgroundColor: bgColors, borderWidth: 2, borderColor: '#ffffff' }]
      },
      options: {
        responsive: true,
        cutout: '62%',
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 12, padding: 12, font: { size: 12, family: "'Noto Sans JP', sans-serif" }, color: '#1a1a2e' } }
        }
      }
    });
  }

  function renderChartTrend() {
    destroyChart('chartTrend');
    const ctx = document.getElementById('chartTrend');
    if (!ctx) return;
    const datesObj = {};
    const periodLogs = adjustmentLogData.filter(l => isInPeriodDateTime(l.created_at));
    periodLogs.forEach(l => {
      const d = l.created_at.split('T')[0];
      if (!datesObj[d]) datesObj[d] = { in: 0, out: 0 };
      const m = Number(l.change_length_m || 0);
      if (l.change_type === 'usage') datesObj[d].out += Math.abs(m);
    });
    getPeriodReceipts().forEach(r => {
      const d = r.receipt_date;
      if (!d) return;
      if (!datesObj[d]) datesObj[d] = { in: 0, out: 0 };
      const rs = rollData.filter(roll => roll.receipt_id === r.receipt_id);
      datesObj[d].in += rs.reduce((sum, roll) => sum + Number(roll.received_length_m || 0), 0);
    });
    const sortedDates = Object.keys(datesObj).sort();
    const labels = sortedDates.slice(-14);
    const dataIn = labels.map(d => datesObj[d].in);
    const dataOut = labels.map(d => datesObj[d].out);
    chartInstances['chartTrend'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: '入荷 / Nhập', data: dataIn, backgroundColor: 'rgba(13,122,122,0.75)', borderRadius: 4, order: 1 },
          { label: '消費 / Xuất', data: dataOut, backgroundColor: 'rgba(231,76,60,0.65)', borderRadius: 4, order: 2 },
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 12 }, color: '#1a1a2e' } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#4a5568', font: { size: 11 } } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#4a5568', font: { size: 11 } } }
        }
      }
    });
  }

  function renderChartSupplier() {
    // Top materials list dùng renderTopMaterialList — chart supplier không dùng canvas
  }

  // ──────────────────────────────────────────
  // TABLE RENDERERS
  // ──────────────────────────────────────────
  function renderRecentUsage() {
    const logs = getPeriodUsageLogs().slice(0, 8);
    if (!logs.length) return `<div class="pd-empty">${t('table.empty')}</div>`;
    return `
<table class="pd-table">
  <thead><tr>
    <th>${t('table.time')}</th>
    <th>${t('table.roll')}</th>
    <th class="pd-th-num">${t('table.length_used')}</th>
    <th>${t('table.note')}</th>
  </tr></thead>
  <tbody>
    ${logs.map(log => {
      const row = joinedRows.find(r => r.receipt_roll_id === log.receipt_roll_id) || {};
      return `<tr>
        <td class="pd-td-muted">${formatDateTime(log.created_at)}</td>
        <td><div style="display:flex; align-items:center;">${renderColorBadge(row.color_name_normalized)}<span class="pd-code">${esc(row.plastic_code || row.commercial_grade_code || log.receipt_roll_id)}</span></div></td>
        <td class="pd-td-num"><span class="pd-num-error">${fmt(Math.abs(Number(log.change_length_m || 0)))}</span></td>
        <td class="pd-td-muted">${esc(log.reason_note)}</td>
      </tr>`;
    }).join('')}
  </tbody>
</table>`;
  }

  function renderUnmappedTable() {
    const rows = joinedRows
      .filter(r => ['unmapped', 'suggested'].includes(r.mapped_state))
      .sort((a, b) => String(a.supplier_name).localeCompare(String(b.supplier_name)))
      .slice(0, 8);
    if (!rows.length) return `<div class="pd-empty">${t('table.empty')}</div>`;
    return `
<table class="pd-table">
  <thead><tr>
    <th>${t('table.commercial_grade')}</th>
    <th>${t('table.thickness')}</th>
    <th>${t('table.width')}</th>
    <th>${t('table.mapping_state')}</th>
  </tr></thead>
  <tbody>
    ${rows.map(row => `<tr>
      <td><span class="pd-code">${esc(row.commercial_grade_code)}</span></td>
      <td class="pd-td-num">${num(row.thickness_mm)}</td>
      <td class="pd-td-num">${num(row.width_mm)}</td>
      <td>${row.mapped_state === 'suggested'
        ? `<span class="pd-badge pd-badge-info">${window.t_plain ? esc(window.t_plain('state.suggested')) : 'suggested'}</span>`
        : `<span class="pd-badge pd-badge-warn">${window.t_plain ? esc(window.t_plain('state.unmapped')) : 'unmapped'}</span>`}</td>
    </tr>`).join('')}
  </tbody>
</table>`;
  }

  function renderLowStockTable() {
    const rows = joinedRows
      .filter(r => r.low_stock)
      .sort((a, b) => Number(a.current_length_m || 0) - Number(b.current_length_m || 0))
      .slice(0, 10);
    if (!rows.length) return `<div class="pd-empty">${t('table.empty')}</div>`;
    return `
<table class="pd-table">
  <thead><tr>
    <th>${t('table.plastic_code')}</th>
    <th>${t('table.commercial_grade')}</th>
    <th>${t('table.warehouse_location')}</th>
    <th class="pd-th-num">${t('table.current_length')}</th>
  </tr></thead>
  <tbody>
    ${rows.map(row => `<tr>
      <td>${row.plastic_code
        ? `<span class="pd-badge pd-badge-primary">${renderColorBadge(row.color_name_normalized)}${esc(row.plastic_code)}</span>`
        : `<span class="pd-badge pd-badge-neutral">${renderColorBadge(row.color_name_normalized)}???</span>`}</td>
      <td><span class="pd-code">${esc(row.commercial_grade_code)}</span></td>
      <td class="pd-td-muted">${esc(row.warehouse_location)}</td>
      <td class="pd-td-num"><span class="pd-num-error pd-num-bold">${fmt(row.current_length_m)}</span></td>
    </tr>`).join('')}
  </tbody>
</table>`;
  }

  // ──────────────────────────────────────────
  // DATA HELPERS
  // ──────────────────────────────────────────
  function getPeriodReceipts() { return receiptData.filter(r => isInPeriod(r.receipt_date)); }
  function getPeriodUsageLogs() { return adjustmentLogData.filter(l => l.change_type === 'usage' && isInPeriodDateTime(l.created_at)); }

  function isInPeriod(dateText) {
    if (period === 'all') return true;
    if (!dateText) return false;
    const target = new Date(`${dateText}T00:00:00`);
    if (isNaN(target.getTime())) return false;
    return target >= getPeriodStart(new Date()) && target <= new Date();
  }
  function isInPeriodDateTime(dateText) {
    if (period === 'all') return true;
    if (!dateText) return false;
    const target = new Date(dateText);
    if (isNaN(target.getTime())) return false;
    return target >= getPeriodStart(new Date()) && target <= new Date();
  }
  function getPeriodStart(now) {
    const d = new Date(now);
    if (period === 'today') { d.setHours(0,0,0,0); return d; }
    if (period === '7d') { d.setDate(d.getDate()-6); d.setHours(0,0,0,0); return d; }
    if (period === '30d') { d.setDate(d.getDate()-29); d.setHours(0,0,0,0); return d; }
    d.setFullYear(2000,0,1); d.setHours(0,0,0,0); return d;
  }
  function findBestMap(commercialGradeCode, supplierName) {
    const code = normalizeCode(commercialGradeCode);
    const supplier = normalizeText(supplierName);
    if (!code) return null;
    const exactSupplier = mapData.find(m => normalizeCode(m.commercial_grade_code) === code && normalizeText(m.supplier_name) === supplier && m.plastic_id);
    if (exactSupplier) return exactSupplier;
    const exactCode = mapData.find(m => normalizeCode(m.commercial_grade_code) === code && m.plastic_id);
    if (exactCode) return exactCode;
    return mapData.find(m => { const mc = normalizeCode(m.commercial_grade_code); return m.plastic_id && mc && (mc.includes(code) || code.includes(mc)); }) || null;
  }

  function refreshUI() {
    const periodSwitch = document.getElementById('pd-period-switch');
    if (periodSwitch) periodSwitch.innerHTML = renderPeriodButtons();
    const summary = document.getElementById('pd-summary');
    if (summary) summary.innerHTML = renderSummaryCards();
    const alerts = document.getElementById('pd-alerts-wrap');
    if (alerts) alerts.innerHTML = renderAlerts();
    const usage = document.getElementById('pd-usage-wrap');
    if (usage) usage.innerHTML = renderRecentUsage();
    const unmapped = document.getElementById('pd-unmapped-wrap');
    if (unmapped) unmapped.innerHTML = renderUnmappedTable();
    const lowStock = document.getElementById('pd-lowstock-wrap');
    if (lowStock) lowStock.innerHTML = renderLowStockTable();
    const topMat = document.getElementById('pd-top-material-wrap');
    if (topMat) topMat.innerHTML = renderTopMaterialList();
    setTimeout(renderCharts, 50);
  }

  function setPeriod(nextPeriod) { period = nextPeriod; refreshUI(); }
  function selectSection(name) { selectedSection = name; refreshUI(); }
  async function reload() {
    try {
      await loadAllData(); joinRows(); refreshUI();
      showToast(t('toast.reloaded'), 'success');
    } catch (err) { showToast(err?.message || String(err), 'error'); }
  }

  // ──────────────────────────────────────────
  // UTILS
  // ──────────────────────────────────────────
  function getColorHex(colorName) {
    const map = {
      'black': '#1a1a2e',
      'transparent_blue': '#2980b9',
      'green': '#27ae60',
      'white': '#f8f9fa',
      'red': '#e74c3c',
      'blue': '#3498db',
      'transparent': '#eef0f3',
      'brown': '#8e44ad',
      'grey': '#7f8c8d',
      'natural': '#f5f5dc',
      'clear': '#eef0f3',
      'gray_or_green_unconfirmed': '#27ae60',
      'black_or_blue_or_brown_unconfirmed': '#1a1a2e',
      'tb_unconfirmed': '#2980b9',
      'unknown': '#dde1e7'
    };
    return map[normalizeText(colorName)] || '#dde1e7';
  }
  
  function renderColorBadge(colorName) {
    if (!colorName) return '';
    const hex = getColorHex(colorName);
    const border = ['white', 'transparent'].includes(normalizeText(colorName)) ? 'border: 1px solid #dde1e7;' : '';
    const titleText = window.t_plain ? window.t_plain('color.' + colorName) : colorName;
    return `<span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${hex}; ${border} margin-right:6px; vertical-align:middle; box-shadow:0 1px 2px rgba(0,0,0,0.1);" title="${esc(titleText)}"></span>`;
  }

  function normalizeText(v) { return String(v || '').toLowerCase().trim(); }
  function normalizeCode(v) { return String(v || '').toLowerCase().replace(/\s+/g, '').replace(/-/g, ''); }
  function formatDateTime(v) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  function fmt(v) { return Number(v || 0).toLocaleString('ja-JP', { maximumFractionDigits: 2 }); }
  function num(v) { return (v === null || v === undefined || v === '') ? '' : v; }
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function showToast(message, type = 'info') {
    const wrap = document.getElementById('pd-toast-wrap');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = `pd-toast pd-toast-${type}`;
    el.textContent = message;
    wrap.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 2600);
  }
  function t(key) {
    if (typeof PlasticI18n !== 'undefined' && PlasticI18n.t) return PlasticI18n.t(key);
    const fallback = {
      'dashboard.title': 'ダッシュボード — プラ材料倉庫管理',
      'dashboard.subtitle': 'Tổng quan kho nhựa (WMS)',
      'dashboard.btn.reload': '更新',
      'dashboard.period.today': '今日',
      'dashboard.period.7d': '7日',
      'dashboard.period.30d': '30日',
      'dashboard.period.all': '全期間',
      'dashboard.period.monthly': '月次',
      'dashboard.period.weekly': '週次',
      'dashboard.alerts.title': '在庫不足アラート',
      'dashboard.alerts.desc': 'Cảnh báo tồn thấp',
      'dashboard.alerts.empty': '✓ 異常なし — Không có cảnh báo',
      'dashboard.charts.section_title': 'グラフ分析 / Phân tích biểu đồ',
      'dashboard.charts.family': '材料種別割合 Tỷ lệ theo loại vật liệu',
      'dashboard.charts.trend': '月別入庫量 (m) Nhập kho theo tháng',
      'dashboard.charts.supplier': '上位消費材料 Top vật liệu tiêu thụ nhiều',
      'dashboard.detail_section_title': '詳細データ / Dữ liệu chi tiết',
      'dashboard.stat.total_rolls': '総ロール数 Tổng số cuộn',
      'dashboard.stat.all_sku': '全SKU / Tất cả SKU',
      'dashboard.stat.total_received': '総入庫 (m) Tổng m nhập',
      'dashboard.stat.today': '本日累計 / Hôm nay',
      'dashboard.stat.total_current': '現在在庫 (m) Tổng m hiện tại',
      'dashboard.stat.realtime': 'リアルタイム / Thời gian thực',
      'dashboard.stat.period_usage': '期間内消費 (m) M dùng trong kỳ',
      'dashboard.stat.low_stock': '在庫低下ロール Cuộn tồn thấp',
      'dashboard.stat.below_min': '最低在庫以下 / Dưới min',
      'dashboard.stat.unmapped': '未紐付ロール Cuộn chưa map',
      'dashboard.stat.all_mapped': 'マッピング不要 / Đã map đủ',
      'dashboard.stat.need_map': '要マッピング / Cần map',
      'dashboard.recent_usage.title': '最近の使用記録 Gần đây',
      'dashboard.unmapped.title': '未紐付ロール Cuộn chưa map',
      'dashboard.lowstock.title': '在庫低下ロール Cuộn tồn thấp',
      'alert.unmapped_title': '未紐付 Chưa gắn mã',
      'alert.unmapped_text': '件 cuộn thiếu dữ liệu',
      'alert.lowstock_title': '在庫低下 Tồn thấp',
      'alert.lowstock_text': '件 cuộn ≤ 50m',
      'alert.damaged_title': '損傷 Hư hỏng',
      'alert.damaged_text': '件 cuộn bị hỏng',
      'chart.label.in': '入庫 (m)',
      'chart.label.out': '出庫 (m)',
      'table.empty': '—',
      'table.time': '日時 Thời gian',
      'table.roll': 'ロール',
      'table.length_used': '使用(m)',
      'table.note': 'メモ',
      'table.commercial_grade': '商品コード',
      'table.thickness': '厚み(mm)',
      'table.width': '幅(mm)',
      'table.mapping_state': 'マッピング',
      'table.plastic_code': 'プラ材コード',
      'table.warehouse_location': '場所',
      'table.current_length': '現残(m)',
      'toast.reloaded': 'データを更新しました',
    };
    return fallback[key] || key;
  }

  // ──────────────────────────────────────────
  // CSS — MCS Color System v1.0
  // ──────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('pd-styles')) return;
    const style = document.createElement('style');
    style.id = 'pd-styles';
    style.textContent = `
/* ═══════════════════════════════════════════════════════════
   PlasticDashboardUI — MCS Color System v1.0
   Light Industrial Teal / YSD Manufacturing
   ═══════════════════════════════════════════════════════════ */

:root {
  --mcs-bg:              #f5f6f8;
  --mcs-surface:         #ffffff;
  --mcs-surface-2:       #f8f9fa;
  --mcs-surface-3:       #eef0f3;
  --mcs-surface-hover:   #e8f4f4;
  --mcs-border:          #dde1e7;
  --mcs-border-strong:   #b2bec3;
  --mcs-divider:         #eceff1;
  --mcs-text:            #1a1a2e;
  --mcs-text-secondary:  #4a5568;
  --mcs-text-muted:      #718096;
  --mcs-text-inverse:    #ffffff;
  --mcs-primary:         #0d7a7a;
  --mcs-primary-hover:   #0a6262;
  --mcs-primary-active:  #084f4f;
  --mcs-primary-light:   #e6f4f4;
  --mcs-primary-mid:     #4db6ac;
  --mcs-success:         #27ae60;
  --mcs-success-light:   #eafaf1;
  --mcs-success-text:    #1d6e3c;
  --mcs-warning:         #f39c12;
  --mcs-warning-light:   #fef9e7;
  --mcs-warning-text:    #7d5a0a;
  --mcs-error:           #e74c3c;
  --mcs-error-light:     #fdf2f1;
  --mcs-error-text:      #922b21;
  --mcs-info:            #2980b9;
  --mcs-info-light:      #eaf3fb;
  --mcs-info-text:       #1a5276;
  --mcs-neutral:         #95a5a6;
  --mcs-neutral-light:   #f2f3f4;
  --mcs-neutral-text:    #515a5a;
  --mcs-group-1:         #0d7a7a;
  --mcs-group-2:         #8e44ad;
  --mcs-group-3:         #2980b9;
  --mcs-group-4:         #d35400;
  --mcs-group-5:         #16a085;
  --mcs-group-6:         #7f8c8d;
  --mcs-shadow-sm:       0 1px 3px rgba(0,0,0,0.08);
  --mcs-shadow-md:       0 4px 12px rgba(0,0,0,0.10);
  --mcs-shadow-card:     0 2px 8px rgba(13,122,122,0.08);
  --mcs-radius-sm:       4px;
  --mcs-radius-md:       8px;
  --mcs-radius-lg:       12px;
  --mcs-radius-full:     9999px;
  --mcs-transition:      150ms ease;
}

/* ── Base ── */
.pd-wrap {
  font-family: 'Noto Sans JP', 'Segoe UI', system-ui, sans-serif;
  background: var(--mcs-bg);
  color: var(--mcs-text);
  min-height: 100vh;
  padding-bottom: 48px;
  font-size: 13px;
}

/* ── Header ── */
.pd-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 16px 28px;
  background: var(--mcs-surface);
  border-bottom: 1px solid var(--mcs-border);
  box-shadow: var(--mcs-shadow-sm);
  position: sticky;
  top: 0;
  z-index: 100;
}
.pd-head-left { display: flex; align-items: center; gap: 12px; }
.pd-logo-icon { width: 36px; height: 36px; border-radius: var(--mcs-radius-md); flex-shrink: 0; }
.pd-title { font-size: 15px; font-weight: 700; color: var(--mcs-text); line-height: 1.25; }
.pd-subtitle { font-size: 11px; color: var(--mcs-text-muted); margin-top: 2px; }
.pd-head-right { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

/* ── Period Switch ── */
.pd-period-switch {
  display: flex; gap: 2px;
  background: var(--mcs-surface-3);
  border: 1px solid var(--mcs-border);
  border-radius: var(--mcs-radius-md);
  padding: 3px;
}
.pd-switch {
  padding: 5px 12px; font-size: 12px; font-weight: 600;
  color: var(--mcs-text-secondary); cursor: pointer;
  border-radius: var(--mcs-radius-sm); transition: var(--mcs-transition);
  white-space: nowrap;
}
.pd-switch:hover { color: var(--mcs-text); background: var(--mcs-surface); }
.pd-switch.active {
  background: var(--mcs-surface);
  color: var(--mcs-primary);
  box-shadow: var(--mcs-shadow-sm);
}

/* ── Buttons ── */
.pd-btn {
  border: none; border-radius: var(--mcs-radius-md);
  padding: 7px 14px; font-size: 12px; font-weight: 600;
  cursor: pointer; display: inline-flex; align-items: center; gap: 5px;
  transition: var(--mcs-transition);
}
.pd-btn-primary {
  background: var(--mcs-primary); color: var(--mcs-text-inverse);
  box-shadow: 0 1px 4px rgba(13,122,122,0.25);
}
.pd-btn-primary:hover { background: var(--mcs-primary-hover); }

/* ── Section padding ── */
.pd-section-pad { padding: 20px 28px 0; }
.pd-section-title {
  font-size: 12px; font-weight: 700; color: var(--mcs-text-secondary);
  text-transform: uppercase; letter-spacing: 0.06em;
  margin-bottom: 12px;
}

/* ═══════ KPI CARDS ═══════ */
.pd-kpi-row {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 12px;
  padding: 20px 28px 0;
}
@media (max-width: 1280px) { .pd-kpi-row { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 768px)  { .pd-kpi-row { grid-template-columns: repeat(2, 1fr); padding: 12px 16px 0; } }

.pd-kpi-card {
  background: var(--mcs-surface);
  border: 1px solid var(--mcs-border);
  border-radius: var(--mcs-radius-lg);
  padding: 16px;
  box-shadow: var(--mcs-shadow-card);
  position: relative;
  overflow: hidden;
  transition: box-shadow var(--mcs-transition);
}
.pd-kpi-card:hover { box-shadow: var(--mcs-shadow-md); }
.pd-kpi-card::after {
  content: '';
  position: absolute;
  bottom: 0; left: 0; right: 0;
  height: 3px;
  border-radius: 0 0 var(--mcs-radius-lg) var(--mcs-radius-lg);
}
.pd-kpi-card-primary::after { background: var(--mcs-primary); }
.pd-kpi-card-success::after { background: var(--mcs-success); }
.pd-kpi-card-warn::after    { background: var(--mcs-warning); }
.pd-kpi-card-error::after   { background: var(--mcs-error); }
.pd-kpi-card-info::after    { background: var(--mcs-info); }

.pd-kpi-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
}
.pd-kpi-icon {
  width: 34px; height: 34px;
  border-radius: var(--mcs-radius-md);
  display: flex; align-items: center; justify-content: center;
}
.pd-kpi-icon-primary { background: var(--mcs-primary-light); color: var(--mcs-primary); }
.pd-kpi-icon-success { background: var(--mcs-success-light); color: var(--mcs-success-text); }
.pd-kpi-icon-warn    { background: var(--mcs-warning-light); color: var(--mcs-warning-text); }
.pd-kpi-icon-error   { background: var(--mcs-error-light);   color: var(--mcs-error-text); }
.pd-kpi-icon-info    { background: var(--mcs-info-light);    color: var(--mcs-info-text); }

.pd-kpi-badge {
  font-size: 10px; font-weight: 700;
  border-radius: var(--mcs-radius-full);
  padding: 2px 7px;
}
.pd-kpi-badge-primary { background: var(--mcs-primary-light); color: var(--mcs-primary); }
.pd-kpi-badge-warn    { background: var(--mcs-warning-light); color: var(--mcs-warning-text); }
.pd-kpi-badge-info    { background: var(--mcs-info-light);    color: var(--mcs-info-text); }

.pd-kpi-value {
  font-size: 26px; font-weight: 800;
  color: var(--mcs-text);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  margin-bottom: 4px;
}
.pd-kpi-value-success { color: var(--mcs-success-text); }
.pd-kpi-value-warn    { color: var(--mcs-warning-text); }
.pd-kpi-value-neutral { color: var(--mcs-neutral-text); }

.pd-kpi-label {
  font-size: 11px; font-weight: 600;
  color: var(--mcs-text);
  line-height: 1.3;
}
.pd-kpi-sub {
  font-size: 10px; color: var(--mcs-text-muted);
  margin-top: 2px;
}

/* ═══════ ALERTS BANNER ═══════ */
.pd-alerts-panel {
  background: var(--mcs-surface);
  border: 1px solid var(--mcs-border);
  border-radius: var(--mcs-radius-lg);
  overflow: hidden;
}
.pd-alerts-head {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px;
  background: var(--mcs-warning-light);
  border-bottom: 1px solid rgba(243,156,18,0.2);
  font-size: 12px; font-weight: 700; color: var(--mcs-warning-text);
}
.pd-alerts-desc {
  font-size: 11px; font-weight: 400;
  color: var(--mcs-text-muted); margin-left: 4px;
}
.pd-alert-list { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 16px; }
.pd-alert {
  display: flex; align-items: flex-start; gap: 8px;
  border-radius: var(--mcs-radius-md);
  padding: 10px 14px; flex: 1; min-width: 200px;
  border: 1px solid transparent;
}
.pd-alert-warn  { background: var(--mcs-warning-light); border-color: rgba(243,156,18,0.25); }
.pd-alert-error { background: var(--mcs-error-light);   border-color: rgba(231,76,60,0.2); }
.pd-alert-icon { font-size: 14px; flex-shrink: 0; margin-top: 1px; }
.pd-alert-title { font-size: 12px; font-weight: 700; color: var(--mcs-text); }
.pd-alert-text  { font-size: 11px; color: var(--mcs-text-secondary); margin-top: 2px; }
.pd-alert-empty { padding: 12px 16px; font-size: 12px; color: var(--mcs-success-text); display: flex; align-items: center; gap: 6px; }

/* ═══════ CHARTS GRID ═══════ */
.pd-chart-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 12px;
  margin-top: 0;
}
@media (max-width: 1200px) { .pd-chart-grid { grid-template-columns: 1fr 1fr; } }
@media (max-width: 768px)  { .pd-chart-grid { grid-template-columns: 1fr; } }

/* ═══════ CARD ═══════ */
.pd-card {
  background: var(--mcs-surface);
  border: 1px solid var(--mcs-border);
  border-radius: var(--mcs-radius-lg);
  box-shadow: var(--mcs-shadow-card);
  display: flex; flex-direction: column;
  overflow: hidden;
}
.pd-card-wide  { grid-column: span 1; }
.pd-card-full  { grid-column: 1 / -1; }

.pd-card-header {
  display: flex; align-items: center; gap: 6px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--mcs-divider);
  background: var(--mcs-surface-2);
}
.pd-card-icon { color: var(--mcs-primary); flex-shrink: 0; }
.pd-card-icon-warn { color: var(--mcs-warning); }
.pd-card-title { font-size: 12px; font-weight: 700; color: var(--mcs-text); flex: 1; }
.pd-card-body { padding: 16px; flex: 1; }
.pd-card-body-center { display: flex; align-items: center; justify-content: center; }

/* ═══════ BADGES ═══════ */
.pd-badge {
  display: inline-flex; align-items: center; gap: 4px;
  border-radius: var(--mcs-radius-full);
  padding: 2px 8px; font-size: 10px; font-weight: 700;
  white-space: nowrap;
}
.pd-badge-primary { background: var(--mcs-primary-light); color: var(--mcs-primary); }
.pd-badge-success { background: var(--mcs-success-light); color: var(--mcs-success-text); border: 1px solid rgba(39,174,96,0.25); }
.pd-badge-warn    { background: var(--mcs-warning-light); color: var(--mcs-warning-text); border: 1px solid rgba(243,156,18,0.25); }
.pd-badge-info    { background: var(--mcs-info-light);    color: var(--mcs-info-text);    border: 1px solid rgba(41,128,185,0.25); }
.pd-badge-neutral { background: var(--mcs-neutral-light); color: var(--mcs-neutral-text); }
.pd-badge-live    { }
.pd-live-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--mcs-success); display: inline-block;
  animation: pd-pulse 1.8s ease-in-out infinite;
}
@keyframes pd-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(0.8); }
}

/* ═══════ TOP MATERIAL LIST ═══════ */
.pd-material-list { display: flex; flex-direction: column; gap: 10px; }
.pd-material-row { display: flex; align-items: center; gap: 8px; }
.pd-material-meta { flex: 0 0 96px; display: flex; flex-direction: column; gap: 1px; }
.pd-material-code { font-size: 11px; font-weight: 700; color: var(--mcs-text); font-family: ui-monospace, monospace; }
.pd-material-family { font-size: 10px; color: var(--mcs-text-muted); }
.pd-material-bar-wrap {
  flex: 1; height: 8px; background: var(--mcs-surface-3);
  border-radius: var(--mcs-radius-full); overflow: hidden;
}
.pd-material-bar { height: 100%; border-radius: var(--mcs-radius-full); transition: width 0.4s ease; }
.pd-material-val { flex: 0 0 60px; text-align: right; font-size: 11px; font-weight: 600; color: var(--mcs-text-secondary); }

/* ═══════ TABLE GRID ═══════ */
.pd-table-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 900px) { .pd-table-grid { grid-template-columns: 1fr; } }

/* ═══════ TABLES ═══════ */
.pd-table-wrap { overflow-x: auto; }
.pd-table {
  width: 100%; border-collapse: collapse;
  font-size: 12px;
}
.pd-table thead th {
  background: var(--mcs-surface-3);
  color: var(--mcs-text-secondary);
  padding: 9px 12px;
  border-bottom: 1px solid var(--mcs-border);
  text-align: left;
  font-weight: 600;
  white-space: nowrap;
  font-size: 11px;
}
.pd-th-num { text-align: right; }
.pd-table tbody td {
  padding: 9px 12px;
  border-bottom: 1px solid var(--mcs-divider);
  vertical-align: middle;
  color: var(--mcs-text);
}
.pd-table tbody tr:nth-child(even) td { background: var(--mcs-surface-2); }
.pd-table tbody tr:hover td { background: var(--mcs-surface-hover); }
.pd-td-muted { color: var(--mcs-text-muted) !important; }
.pd-td-num   { text-align: right; }
.pd-code {
  font-family: ui-monospace, 'Cascadia Code', monospace;
  font-size: 11px; font-weight: 600; color: var(--mcs-text);
}
.pd-num-error { color: #c0392b; font-weight: 800; font-variant-numeric: tabular-nums; }
.pd-num-bold  { font-weight: 800; font-size: 14px; }

/* ═══════ EMPTY ═══════ */
.pd-empty {
  padding: 32px 20px; text-align: center;
  color: var(--mcs-text-muted); font-size: 12px;
}

/* ═══════ TOAST ═══════ */
.pd-toast-wrap {
  position: fixed; right: 20px; bottom: 20px;
  display: flex; flex-direction: column; gap: 8px; z-index: 99999;
}
.pd-toast {
  opacity: 0; transform: translateY(8px);
  transition: all 0.25s ease;
  border-radius: var(--mcs-radius-md);
  padding: 10px 16px; font-size: 12px; font-weight: 600;
  color: var(--mcs-text-inverse);
  box-shadow: var(--mcs-shadow-md);
  max-width: 300px;
}
.pd-toast.show { opacity: 1; transform: translateY(0); }
.pd-toast-success { background: var(--mcs-primary); }
.pd-toast-info    { background: var(--mcs-info); }
.pd-toast-error   { background: var(--mcs-error); }

@media (max-width: 768px) {
  .pd-header { flex-direction: column; align-items: flex-start; padding: 12px 16px; }
  .pd-section-pad { padding: 12px 16px 0; }
}
`;
    document.head.appendChild(style);
  }

  return { init, reload, setPeriod, selectSection };
})();

if (typeof window !== 'undefined') {
  window.PlasticDashboardUI = PlasticDashboardUI;
}

const PlasticDashboardUI = (() => {
  let supabase = null;
  let containerEl = null;
  let masterData = [];
  let receiptData = [];
  let rollData = [];
  let mapData = [];
  let adjustmentLogData = [];
  let joinedRows = [];
  let period = '7d'; // Default changed from today to 7d as requested
  let selectedSection = 'alerts';

  // Biến lưu instance của Chart.js để destroy khi render lại
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

  function render() {
    containerEl.innerHTML = `
<div class="pd-wrap" style="padding: 24px;">

  <!-- Alert Banner -->
  <div id="pd-alerts-wrap"></div>

  <!-- WMS Teal Header (Mockup Style) -->
  <div class="wms-header">
    <div class="wms-header-left">
      <div class="wms-header-icon"><i class="fas fa-boxes"></i></div>
      <div class="wms-title">
        <div class="ja">ダッシュボード — プラ材料倉庫管理</div>
        <div class="vi">Tổng quan kho nhựa (WMS)</div>
      </div>
      <div class="wms-subtitle">入庫・在庫・未紐付・在庫低下のアラート / Tổng hợp nhập, dùng, cảnh báo chưa map và tồn thấp</div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:16px;">
      <div class="period-tabs" id="pd-period-switch">${renderPeriodButtons()}</div>
      <div class="wms-header-actions">
        <button class="wms-hdr-btn" onclick="PlasticDashboardUI.reload()"><i class="fas fa-sync-alt"></i><span>リロード / Tải lại</span></button>
        <button class="wms-hdr-btn white"><i class="fas fa-file-export"></i><span>エクスポート</span></button>
      </div>
    </div>
  </div>

  <!-- KPI Area -->
  <div>
    <div class="section-label" style="margin-bottom:12px;">
      <i class="fas fa-tachometer-alt" style="color:var(--color-primary);"></i>
      <span class="ja">主要KPI</span>
      <span class="vi">/ Chỉ số chính</span>
    </div>
    <div class="kpi-grid" id="pd-summary">${renderSummaryCards()}</div>
  </div>

  <!-- CHARTS GRID: 3 cột đều nhau theo Mockup -->
  <div>
    <div class="section-label" style="margin-bottom:12px;">
      <i class="fas fa-chart-bar" style="color:var(--color-primary);"></i>
      <span class="ja">グラフ分析</span>
      <span class="vi">/ Phân tích biểu đồ</span>
    </div>
    <div class="chart-row">
      <div class="chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">
            <span class="ja">月別入庫量 (m)</span>
            <span class="vi">Nhập kho theo tháng</span>
          </div>
          <span class="chart-tag monthly">月次</span>
        </div>
        <div style="position:relative; height:160px;"><canvas id="chartTrend"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">
            <span class="ja">材料種別割合</span>
            <span class="vi">Tỷ lệ theo loại vật liệu</span>
          </div>
          <span class="chart-tag live">Live</span>
        </div>
        <div style="position:relative; height:160px;"><canvas id="chartFamily"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-header">
          <div class="chart-card-title">
            <span class="ja">上位消費材料</span>
            <span class="vi">Top vật liệu tiêu thụ nhiều</span>
          </div>
          <span class="chart-tag weekly">週次</span>
        </div>
        <div style="position:relative; height:160px;"><canvas id="chartWaste"></canvas></div>
      </div>
    </div>
  </div>

  <!-- DETAILS GRID: Danh sách -->
  <div class="pd-main-grid" style="grid-template-columns: 1fr 1fr;">
    <div class="pd-panel">
      <div class="pd-panel-header"><div class="pd-panel-title">${t('dashboard.recent_usage.title')}</div></div>
      <div class="pd-table-wrap" id="pd-usage-wrap">${renderRecentUsage()}</div>
    </div>

    <div class="pd-panel">
      <div class="pd-panel-header"><div class="pd-panel-title">${t('dashboard.unmapped.title')}</div></div>
      <div class="pd-table-wrap" id="pd-unmapped-wrap">${renderUnmappedTable()}</div>
    </div>

    <div class="pd-panel" style="grid-column: 1 / -1;">
      <div class="pd-panel-header"><div class="pd-panel-title">${t('dashboard.lowstock.title')}</div></div>
      <div class="pd-table-wrap" id="pd-lowstock-wrap">${renderLowStockTable()}</div>
    </div>
  </div>

  <div class="pd-toast-wrap" id="pd-toast-wrap"></div>
</div>`;
  }

  function renderPeriodButtons() {
    const buttons = [
      { key: 'today', label: t('dashboard.period.today') },
      { key: '7d', label: t('dashboard.period.7d') },
      { key: '30d', label: t('dashboard.period.30d') },
      { key: 'all', label: t('dashboard.period.all') },
    ];

    return buttons.map(btn => `
<button class="period-tab ${period === btn.key ? 'active' : ''}" onclick="PlasticDashboardUI.setPeriod('${btn.key}')"><span>${btn.label}</span></button>`).join('');
  }

  function renderSummaryCards() {
    const currentRows = joinedRows.filter(r => Number(r.current_length_m || 0) > 0);
    const totalCurrent = currentRows.reduce((sum, r) => sum + Number(r.current_length_m || 0), 0);
    const totalReceived = joinedRows.reduce((sum, r) => sum + Number(r.received_length_m || 0), 0);
    const lowStock = currentRows.filter(r => r.low_stock).length;
    const unmapped = joinedRows.filter(r => r.mapped_state === 'unmapped').length;
    const periodUsage = getPeriodUsageLogs();
    const usageMeters = periodUsage.reduce((sum, log) => sum + Math.abs(Number(log.change_length_m || 0)), 0);

    return `
<div class="kpi-card teal">
  <div class="kpi-header">
    <div class="kpi-icon"><i class="fas fa-layer-group"></i></div>
    <span class="kpi-trend up"><i class="fas fa-arrow-up"></i>+5</span>
  </div>
  <div class="kpi-label"><span class="ja">総ロール数</span><span class="vi">Tổng số cuộn</span></div>
  <div class="kpi-value">${joinedRows.length}</div>
  <div class="kpi-sub">全SKU / Tất cả SKU</div>
</div>
<div class="kpi-card green">
  <div class="kpi-header">
    <div class="kpi-icon"><i class="fas fa-arrow-circle-down"></i></div>
    <span class="kpi-trend up"><i class="fas fa-arrow-up"></i>+120m</span>
  </div>
  <div class="kpi-label"><span class="ja">総入庫 (m)</span><span class="vi">Tổng m nhập</span></div>
  <div class="kpi-value">${fmt(totalReceived)}</div>
  <div class="kpi-sub">本日累計 / Hôm nay</div>
</div>
<div class="kpi-card blue">
  <div class="kpi-header">
    <div class="kpi-icon"><i class="fas fa-warehouse"></i></div>
    <span class="kpi-trend neutral">—</span>
  </div>
  <div class="kpi-label"><span class="ja">現在在庫 (m)</span><span class="vi">Tổng m hiện tại</span></div>
  <div class="kpi-value" style="font-size:1.1rem;">${fmt(totalCurrent)}</div>
  <div class="kpi-sub">リアルタイム / Thời gian thực</div>
</div>
<div class="kpi-card amber">
  <div class="kpi-header">
    <div class="kpi-icon"><i class="fas fa-fire-alt"></i></div>
    <span class="kpi-trend down"><i class="fas fa-arrow-up"></i>+12</span>
  </div>
  <div class="kpi-label"><span class="ja">期間内消費 (m)</span><span class="vi">M dùng trong kỳ</span></div>
  <div class="kpi-value">${fmt(usageMeters)}</div>
  <div class="kpi-sub">本日 / Hôm nay</div>
</div>
<div class="kpi-card red">
  <div class="kpi-header">
    <div class="kpi-icon"><i class="fas fa-exclamation-circle"></i></div>
    <span class="kpi-trend down"><i class="fas fa-arrow-up"></i>+3</span>
  </div>
  <div class="kpi-label"><span class="ja">在庫低下ロール</span><span class="vi">Cuộn tồn thấp</span></div>
  <div class="kpi-value alert">${lowStock}</div>
  <div class="kpi-sub">最低在庫以下 / Dưới min</div>
</div>
<div class="kpi-card purple">
  <div class="kpi-header">
    <div class="kpi-icon"><i class="fas fa-unlink"></i></div>
    <span class="kpi-trend neutral">—</span>
  </div>
  <div class="kpi-label"><span class="ja">未紐付ロール</span><span class="vi">Cuộn chưa map</span></div>
  <div class="kpi-value warning">${unmapped}</div>
  <div class="kpi-sub">マッピング不要 / Đã map đủ</div>
</div>`;
  }

  function renderAlerts() {
    const alerts = [];
    const unmapped = joinedRows.filter(r => r.mapped_state === 'unmapped').length;
    const lowStock = joinedRows.filter(r => r.low_stock).length;
    const damaged = joinedRows.filter(r => r.roll_status === 'damaged').length;

    if (unmapped) alerts.push({ type: 'warning', icon: 'fas fa-unlink', title: '在庫不足補足情報 — ' + unmapped + '本のロールが未紐付', text: unmapped + ' cuộn chưa map thông tin vật tư.' });
    if (lowStock) alerts.push({ type: 'error', icon: 'fas fa-exclamation-triangle', title: '在庫不足アラート — ' + lowStock + '本のロールが最低在庫ラインを下回っています', text: 'Cảnh báo tồn thấp — ' + lowStock + ' cuộn nhựa dưới mức tối thiểu' });
    if (damaged) alerts.push({ type: 'error', icon: 'fas fa-times-circle', title: '異常アラート — ' + damaged + '本の破損ロールが見つかりました', text: damaged + ' cuộn bị báo hỏng.' });

    if (!alerts.length) return '';

    return alerts.map(item => `
<div class="alert-banner ${item.type}">
  <i class="fas fa-exclamation-triangle alert-icon"></i>
  <div class="alert-text">
    <div class="ja">${esc(item.title)}</div>
    <div class="vi">${esc(item.text)}</div>
  </div>
  <button class="alert-dismiss"><i class="fas fa-times"></i></button>
</div>`).join('');
  }

  // ==========================================
  // CHART RENDERERS (CHART.JS)
  // ==========================================
  
  function destroyChart(chartId) {
    if (chartInstances[chartId]) {
      chartInstances[chartId].destroy();
      chartInstances[chartId] = null;
    }
  }

  function renderCharts() {
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js is not loaded yet.');
      return;
    }

    renderChartFamily();
    renderChartSupplier();
    renderChartTrend();
    renderChartWaste();
  }

  function renderChartFamily() {
    destroyChart('chartFamily');
    const ctx = document.getElementById('chartFamily');
    if (!ctx) return;

    const groups = {};
    joinedRows.forEach(r => {
      const g = (r.plastic_family || 'Other').trim();
      groups[g] = (groups[g] || 0) + Number(r.current_length_m || 0);
    });

    const labels = Object.keys(groups);
    const data = Object.values(groups);

    const MCS_CHART_COLORS = ['#0d7a7a', '#8e44ad', '#2980b9', '#d35400', '#16a085', '#7f8c8d'];

    chartInstances['chartFamily'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: MCS_CHART_COLORS,
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'right' } }
      }
    });
  }

  function renderChartSupplier() {
    destroyChart('chartSupplier');
    const ctx = document.getElementById('chartSupplier');
    if (!ctx) return;

    const groups = {};
    joinedRows.forEach(r => {
      const g = (r.supplier_name || 'Other').trim();
      groups[g] = (groups[g] || 0) + Number(r.current_length_m || 0);
    });

    const sortedGroups = Object.entries(groups).sort((a,b) => b[1] - a[1]).slice(0, 7);
    const labels = sortedGroups.map(x => x[0]);
    const data = sortedGroups.map(x => x[1]);

    const MCS_CHART_COLORS = ['#0d7a7a', '#8e44ad', '#2980b9', '#d35400', '#16a085', '#7f8c8d'];

    chartInstances['chartSupplier'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Tồn kho (m)',
          data,
          backgroundColor: '#0d7a7a',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } }
      }
    });
  }

  function renderChartTrend() {
    destroyChart('chartTrend');
    const ctx = document.getElementById('chartTrend');
    if (!ctx) return;

    const periodLogs = getPeriodAdjustmentLogs().concat(adjustmentLogData.filter(log => log.change_type === 'usage' && isInPeriodDateTime(log.created_at)));
    const receipts = getPeriodReceipts();

    const datesObj = {};
    periodLogs.forEach(l => {
      const d = l.created_at.split('T')[0];
      if (!datesObj[d]) datesObj[d] = { in: 0, out: 0, waste: 0 };
      const m = Number(l.change_length_m || 0);
      if (l.change_type === 'usage') datesObj[d].out += Math.abs(m);
      if (l.change_type === 'loss' || l.change_type === 'waste') datesObj[d].waste += Math.abs(m);
    });

    receipts.forEach(r => {
      const d = r.receipt_date;
      if (!d) return;
      if (!datesObj[d]) datesObj[d] = { in: 0, out: 0, waste: 0 };
      // Đếm mét nhập vào trong ngày hôm đó (tính xấp xỉ bằng tổng roll của phiếu)
      const rs = rollData.filter(roll => roll.receipt_id === r.receipt_id);
      datesObj[d].in += rs.reduce((sum, roll) => sum + Number(roll.received_length_m || 0), 0);
    });

    const sortedDates = Object.keys(datesObj).sort();
    const labels = sortedDates.slice(-14); // 14 ngày gần nhất có data
    const dataIn = labels.map(d => datesObj[d].in);
    const dataOut = labels.map(d => datesObj[d].out);

    chartInstances['chartTrend'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Nhập Vào (m)', data: dataIn, borderColor: '#0d7a7a', backgroundColor: '#0d7a7a33', fill: true, tension: 0.3 },
          { label: 'Xuất Dùng (m)', data: dataOut, borderColor: '#d35400', backgroundColor: '#d3540033', fill: true, tension: 0.3 }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'top' } } }
    });
  }

  function renderChartWaste() {
    destroyChart('chartWaste');
    const ctx = document.getElementById('chartWaste');
    if (!ctx) return;

    // Tính m dùng chuẩn (usage) và m vứt đi (waste/loss) cho từng family trong kì
    const groupsInPeriod = {};
    const periodLogs = adjustmentLogData.filter(l => isInPeriodDateTime(l.created_at));

    periodLogs.forEach(l => {
      const m = Math.abs(Number(l.change_length_m || 0));
      const roll = rollData.find(r => r.receipt_roll_id === l.receipt_roll_id);
      const rowInfo = joinedRows.find(x => x.receipt_roll_id === l.receipt_roll_id);
      const family = (rowInfo && rowInfo.plastic_family) ? rowInfo.plastic_family : 'Other';

      if (!groupsInPeriod[family]) groupsInPeriod[family] = { good: 0, bad: 0 };
      
      if (l.change_type === 'usage') groupsInPeriod[family].good += m;
      else if (['waste', 'loss', 'damaged'].includes(l.change_type)) groupsInPeriod[family].bad += m;
    });

    const families = Object.keys(groupsInPeriod).filter(k => (groupsInPeriod[k].good + groupsInPeriod[k].bad) > 0);
    const goodData = families.map(k => groupsInPeriod[k].good);
    const badData = families.map(k => groupsInPeriod[k].bad);

    chartInstances['chartWaste'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: families,
        datasets: [
          { label: 'Sử dụng (m)', data: goodData, backgroundColor: '#0d7a7a' },
          { label: 'Thất thoát (m)', data: badData, backgroundColor: '#e74c3c' }
        ]
      },
      options: {
        responsive: true,
        scales: { x: { stacked: true }, y: { stacked: true } }
      }
    });
  }

  // ==========================================
  // TABLE RENDERERS
  // ==========================================

  function renderRecentUsage() {
    const logs = getPeriodUsageLogs().slice(0, 8);
    if (!logs.length) return `<div class="pd-empty">${t('table.empty')}</div>`;

    return `
<table class="pd-table pd-table-small">
  <thead>
    <tr><th>${t('table.time')}</th><th>${t('table.roll')}</th><th>${t('table.length_used')}</th><th>${t('table.note')}</th></tr>
  </thead>
  <tbody>
    ${logs.map(log => {
      const row = joinedRows.find(r => r.receipt_roll_id === log.receipt_roll_id) || {};
      return `
      <tr>
        <td>${formatDateTime(log.created_at)}</td>
        <td class="code">${esc(row.plastic_code || row.commercial_grade_code || log.receipt_roll_id)}</td>
        <td class="num strong text-red">${fmt(Math.abs(Number(log.change_length_m || 0)))}</td>
        <td>${esc(log.reason_note)}</td>
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
  <thead>
    <tr><th>${t('table.commercial_grade')}</th><th>${t('table.thickness')}</th><th>${t('table.width')}</th><th>${t('table.mapping_state')}</th></tr>
  </thead>
  <tbody>
    ${rows.map(row => `
      <tr>
        <td class="code">${esc(row.commercial_grade_code)}</td>
        <td class="num">${num(row.thickness_mm)}</td>
        <td class="num">${num(row.width_mm)}</td>
        <td><div class="pd-chip ${row.mapped_state === 'suggested' ? 'bg-blue' : 'bg-orange'}">${esc(row.mapped_state)}</div></td>
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
  <thead>
    <tr><th>${t('table.plastic_code')}</th><th>${t('table.commercial_grade')}</th><th>${t('table.warehouse_location')}</th><th>${t('table.current_length')}</th></tr>
  </thead>
  <tbody>
    ${rows.map(row => `
      <tr>
        <td>${row.plastic_code ? `<span class="pd-chip bg-indigo">${esc(row.plastic_code)}</span>` : `<span class="pd-chip bg-orange">???</span>`}</td>
        <td class="code">${esc(row.commercial_grade_code)}</td>
        <td>${esc(row.warehouse_location)}</td>
        <td class="num strong text-red">${fmt(row.current_length_m)}</td>
      </tr>`).join('')}
  </tbody>
</table>`;
  }

  // ==========================================
  // DATA FILTERING & UTILITIES
  // ==========================================

  function getPeriodReceipts() { return receiptData.filter(r => isInPeriod(r.receipt_date)); }
  function getPeriodUsageLogs() { return adjustmentLogData.filter(log => log.change_type === 'usage' && isInPeriodDateTime(log.created_at)); }
  function getPeriodAdjustmentLogs() { return adjustmentLogData.filter(log => log.change_type !== 'usage' && isInPeriodDateTime(log.created_at)); }

  function isInPeriod(dateText) {
    if (period === 'all') return true;
    if (!dateText) return false;
    const target = new Date(`${dateText}T00:00:00`);
    if (Number.isNaN(target.getTime())) return false;
    const now = new Date();
    const start = getPeriodStart(now);
    return target >= start && target <= now;
  }

  function isInPeriodDateTime(dateText) {
    if (period === 'all') return true;
    if (!dateText) return false;
    const target = new Date(dateText);
    if (Number.isNaN(target.getTime())) return false;
    const now = new Date();
    const start = getPeriodStart(now);
    return target >= start && target <= now;
  }

  function getPeriodStart(now) {
    const d = new Date(now);
    if (period === 'today') { d.setHours(0, 0, 0, 0); return d; }
    if (period === '7d') { d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d; }
    if (period === '30d') { d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); return d; }
    d.setFullYear(2000, 0, 1); d.setHours(0, 0, 0, 0); return d;
  }

  function findBestMap(commercialGradeCode, supplierName) {
    const code = normalizeCode(commercialGradeCode);
    const supplier = normalizeText(supplierName);
    if (!code) return null;
    const exactSupplier = mapData.find(m => normalizeCode(m.commercial_grade_code) === code && normalizeText(m.supplier_name) === supplier && m.plastic_id);
    if (exactSupplier) return exactSupplier;
    const exactCode = mapData.find(m => normalizeCode(m.commercial_grade_code) === code && m.plastic_id);
    if (exactCode) return exactCode;
    const partial = mapData.find(m => {
      const mapCode = normalizeCode(m.commercial_grade_code);
      return m.plastic_id && mapCode && (mapCode.includes(code) || code.includes(mapCode));
    });
    return partial || null;
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

    // Render Charts
    setTimeout(renderCharts, 50);
  }

  function setPeriod(nextPeriod) {
    period = nextPeriod;
    refreshUI();
  }

  function selectSection(name) {
    selectedSection = name;
    refreshUI();
  }

  async function reload() {
    try {
      await loadAllData();
      joinRows();
      refreshUI();
      showToast('Đã tải lại dữ liệu Dashboard', 'info');
    } catch (err) {
      showToast(err?.message || String(err), 'error');
    }
  }

  function normalizeText(v) { return String(v || '').toLowerCase().trim(); }
  function normalizeCode(v) { return String(v || '').toLowerCase().replace(/\\s+/g, '').replace(/-/g, ''); }
  function formatDateTime(v) {
    if (!v) return ''; const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  function fmt(v) { return Number(v || 0).toLocaleString('ja-JP', { maximumFractionDigits: 2 }); }
  function signed(v) { const n = Number(v || 0); const text = fmt(Math.abs(n)); return n >= 0 ? text : `-${text}`; }
  function num(v) { return v === null || v === undefined || v === '' ? '' : v; }
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

  // ==========================================
  // PREMIUM CSS INJECTION
  // ==========================================
  function injectStyles() {
    if (document.getElementById('pd-styles')) return;

    const style = document.createElement('style');
    style.id = 'pd-styles';
    style.textContent = `
.pd-wrap { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg-body, #F4F7FB); min-height: calc(100vh - 120px); }

.wms-wrap { display: flex; flex-direction: column; gap: 24px; padding: 24px; }
/* WMS Header */
.wms-header {
  background: linear-gradient(135deg, var(--color-primary) 0%, color-mix(in oklab, var(--color-primary), var(--color-info) 40%) 100%);
  border-radius: var(--radius-lg, 12px);
  padding: 24px 32px;
  color: #fff;
  display: flex; align-items: flex-start; justify-content: space-between;
  box-shadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,0.1));
  margin-bottom: 24px;
}
.wms-header-left { display: flex; flex-direction: column; gap: 8px; }
.wms-header-icon { 
  width: 40px; height: 40px; background: rgba(255,255,255,.2); 
  border-radius: var(--radius-lg, 8px); display: flex; align-items: center; justify-content: center; 
  font-size: 18px; margin-bottom: 8px; 
}
.wms-title .ja { font-size: var(--text-xl, 20px); font-weight: 800; line-height: 1.2; }
.wms-title .vi { font-size: var(--text-sm, 14px); opacity: .8; line-height: 1.2; }
.wms-subtitle { font-size: var(--text-xs, 12px); opacity: .7; max-width: 360px; margin-top: 4px; }
.wms-header-actions { display: flex; gap: 8px; }
.wms-hdr-btn {
  padding: 8px 16px; border-radius: var(--radius-md, 6px);
  background: rgba(255,255,255,.15); border: 1px solid rgba(255,255,255,.25);
  color: #fff; cursor: pointer; font-size: var(--text-xs, 12px); font-weight: 600;
  transition: background var(--transition, 0.2s); display: flex; align-items: center; gap: 8px;
}
.wms-hdr-btn:hover { background: rgba(255,255,255,.25); }
.wms-hdr-btn.white { background: #fff; color: var(--color-primary); border-color: #fff; }
.wms-hdr-btn.white:hover { background: #f0fdf4; }

.section-label {
  display: flex; align-items: center; gap: 8px;
  font-size: var(--text-sm, 14px); font-weight: 700; color: var(--color-text);
  margin-bottom: 12px;
}
.section-label .vi { font-size: var(--text-xs, 12px); color: var(--color-text-faint); font-weight: 400; }
.section-label::after { content: ''; flex: 1; height: 1px; background: var(--color-divider); }

.period-tabs { display: flex; gap: 8px; }
.period-tab {
  padding: 4px 12px; border-radius: var(--radius-full, 999px);
  font-size: 11px; font-weight: 600; cursor: pointer;
  border: 1px solid rgba(255,255,255,0.5); background: transparent;
  color: #fff; transition: background var(--transition, 0.2s);
}
.period-tab.active { background: #fff; border-color: #fff; color: var(--color-primary); }
.period-tab:hover:not(.active) { background: rgba(255,255,255,0.2); }
.period-tab .vi { font-size: 9px; display: block; font-weight: 400; opacity: 0.8; }

/* Alert Banner — exact mockup */
.alert-banner {
  border-radius: 12px; padding: 12px 16px;
  display: flex; align-items: center; gap: 12px;
  border: 1px solid;
}
.alert-banner.warning { background: var(--color-warning-light, #fef3c7); border-color: rgba(217,119,6,0.3); }
.alert-banner.error   { background: var(--color-error-light, #fee2e2);   border-color: rgba(220,38,38,0.3); }
.alert-icon { font-size: 16px; flex-shrink: 0; }
.alert-banner.warning .alert-icon { color: var(--color-warning, #d97706); }
.alert-banner.error   .alert-icon { color: var(--color-error, #dc2626); }
.alert-text { flex: 1; }
.alert-text .ja { font-size: 13px; font-weight: 600; color: var(--color-text, #1a1d23); }
.alert-text .vi { font-size: 12px; color: var(--color-text-muted, #6b7280); }
.alert-dismiss { font-size: 11px; color: var(--color-text-faint, #9ca3af); cursor: pointer; border: none; background: none; }
.alert-dismiss:hover { color: var(--color-text, #1a1d23); }

/* KPI Grid — exact mockup */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 0;
}
.kpi-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e6ea);
  border-radius: 12px; padding: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
  display: flex; flex-direction: column; gap: 8px;
  position: relative; overflow: hidden;
  transition: box-shadow 150ms, transform 150ms;
  cursor: default;
}
.kpi-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,.08); transform: translateY(-1px); }
.kpi-card::before {
  content: ''; position: absolute; top: 0; left: 0; right: 0;
  height: 3px; border-radius: 12px 12px 0 0;
}
.kpi-card.teal::before  { background: var(--color-primary, #0d6d6e); }
.kpi-card.green::before { background: var(--color-success, #16a34a); }
.kpi-card.amber::before { background: var(--color-warning, #d97706); }
.kpi-card.red::before   { background: var(--color-error, #dc2626); }
.kpi-card.blue::before  { background: var(--color-info, #2563eb); }
.kpi-card.purple::before{ background: var(--color-purple, #7c3aed); }

.kpi-header { display: flex; align-items: flex-start; justify-content: space-between; }
.kpi-icon {
  width: 28px; height: 28px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; flex-shrink: 0;
}
.kpi-card.teal  .kpi-icon { background: var(--color-primary-light, #e0f2f1); color: var(--color-primary, #0d6d6e); }
.kpi-card.green .kpi-icon { background: var(--color-success-light, #dcfce7); color: var(--color-success, #16a34a); }
.kpi-card.amber .kpi-icon { background: var(--color-warning-light, #fef3c7); color: var(--color-warning, #d97706); }
.kpi-card.red   .kpi-icon { background: var(--color-error-light, #fee2e2);   color: var(--color-error, #dc2626); }
.kpi-card.blue  .kpi-icon { background: var(--color-info-light, #dbeafe);    color: var(--color-info, #2563eb); }
.kpi-card.purple .kpi-icon{ background: var(--color-purple-light, #ede9fe);  color: var(--color-purple, #7c3aed); }

.kpi-trend { font-size: 10px; display: flex; align-items: center; gap: 2px; font-weight: 700; }
.kpi-trend.up   { color: var(--color-success, #16a34a); }
.kpi-trend.down { color: var(--color-error, #dc2626); }
.kpi-trend.neutral { color: var(--color-text-faint, #9ca3af); }

.kpi-label { display: flex; flex-direction: column; gap: 1px; }
.kpi-label .ja { font-size: 12px; color: var(--color-text-muted, #6b7280); font-weight: 500; line-height: 1.3; }
.kpi-label .vi { font-size: 9px; color: var(--color-text-faint, #9ca3af); line-height: 1.2; }
.kpi-value { font-size: 1.5rem; font-weight: 800; color: var(--color-text, #1a1d23); line-height: 1; font-variant-numeric: tabular-nums; }
.kpi-value.alert   { color: var(--color-error, #dc2626); }
.kpi-value.warning { color: var(--color-warning, #d97706); }
.kpi-value.success { color: var(--color-success, #16a34a); }
.kpi-sub { font-size: 11px; color: var(--color-text-faint, #9ca3af); }

/* Chart Row — exact 3-col grid mockup */
.chart-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 16px;
  margin-bottom: 0;
}
@media (max-width: 1100px) { .chart-row { grid-template-columns: 1fr 1fr; } }
@media (max-width: 750px)  { .chart-row { grid-template-columns: 1fr; } }
.chart-card {
  background: var(--color-surface, #fff);
  border: 1px solid var(--color-border, #e2e6ea);
  border-radius: 12px; padding: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,.06);
}
.chart-card-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
.chart-card-title { display: flex; flex-direction: column; gap: 1px; }
.chart-card-title .ja { font-size: 13px; font-weight: 700; color: var(--color-text, #1a1d23); }
.chart-card-title .vi { font-size: 10px; color: var(--color-text-faint, #9ca3af); }
.chart-tag { font-size: 10px; padding: 2px 8px; border-radius: 9999px; font-weight: 600; }
.chart-tag.live    { background: var(--color-success-light, #dcfce7); color: var(--color-success, #16a34a); }
.chart-tag.weekly  { background: var(--color-info-light, #dbeafe);    color: var(--color-info, #2563eb); }
.chart-tag.monthly { background: var(--color-purple-light, #ede9fe);  color: var(--color-purple, #7c3aed); }

/* Tables & Panels */
.pd-main-grid { display: grid; gap: 16px; }
.pd-panel { background: var(--color-surface, #fff); border: 1px solid var(--color-border, #e2e6ea); border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.06); display: flex; flex-direction: column; overflow: hidden; }
.pd-panel-header { padding: 12px 16px; border-bottom: 1px solid var(--color-border, #e2e6ea); }
.pd-panel-title { font-size: 13px; font-weight: 700; color: var(--color-text, #1a1d23); display: flex; align-items: center; gap: 8px; }
.pd-table-wrap { overflow-x: auto; }
.pd-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.pd-table thead th { background: var(--color-surface-offset, #eef0f3); color: var(--color-text, #1a1d23); padding: 8px 12px; border-bottom: 1px solid var(--color-border, #e2e6ea); text-align: left; font-weight: 600; white-space: nowrap; }
.pd-table tbody td { padding: 8px 12px; border-bottom: 1px solid var(--color-divider, #dde1e7); vertical-align: middle; color: var(--color-text, #1a1d23); }
.pd-table tbody tr:nth-child(even) td { background: var(--color-surface-2, #f9fafb); }
.pd-table tbody tr:hover td { background: var(--color-primary-light, #e0f2f1); }
.pd-table td.code { font-family: ui-monospace, monospace; font-weight: 600; }
.pd-table td.num { text-align: right; }
.pd-chip { display: inline-block; border-radius: 999px; padding: 2px 8px; font-size: 11px; font-weight: 600; }
.text-red   { color: var(--color-error, #dc2626) !important; }
.text-green { color: var(--color-success, #16a34a) !important; }
.pd-empty { padding: 40px 20px; text-align: center; color: var(--color-text-faint, #9ca3af); font-size: 13px; }
.pd-toast-wrap { position: fixed; right: 24px; bottom: 24px; display: flex; flex-direction: column; gap: 10px; z-index: 99999; }
.pd-toast { opacity: 0; transform: translateY(10px); transition: all .3s; border-radius: 8px; padding: 12px 20px; color: #fff; font-size: 13px; font-weight: 600; }
.pd-toast.show { opacity: 1; transform: translateY(0); }
.pd-toast-success, .pd-toast-info { background: #1f2937; }
.pd-toast-error { background: var(--color-error, #dc2626); }
@media (max-width:1024px) { .pd-main-grid { grid-template-columns: 1fr !important; } }
`;
    document.head.appendChild(style);
  }

  return {
    init,
    reload,
    setPeriod,
    selectSection,
  };
})();

if (typeof window !== 'undefined') {
  window.PlasticDashboardUI = PlasticDashboardUI;
}

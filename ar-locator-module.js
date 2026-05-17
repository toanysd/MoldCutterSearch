// ar-locator-module.js v1.2.3
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
      searchKind: 'all', // all, mold, cutter
      sessions: [], activeSessionId: null,
      scanEngine: localStorage.getItem('mcs_arl_engine') || 'multi'
    },

    getSupabaseClient() {
      if (this.state.supabaseClient) return this.state.supabaseClient;
      if (window.SupabaseConfig && window.supabase && typeof window.supabase.createClient === 'function') {
        const cfg = window.SupabaseConfig.get();
        if (cfg && cfg.supabaseUrl && cfg.supabaseAnonKey) {
          this.state.supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
          return this.state.supabaseClient;
        }
      }
      return null;
    },

    generateUUID() {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    },

    async loadSessions() {
      try {
        const stored = localStorage.getItem('mcs_ar_audit_sessions');
        if (stored) this.state.sessions = JSON.parse(stored);
        else this.state.sessions = [];
      } catch (e) { this.state.sessions = []; }

      const sb = this.getSupabaseClient();
      if (!sb) return;

      try {
        const { data, error } = await sb.from('inventory_sessions').select('*, inventory_session_lines(*)').order('created_at', { ascending: false });
        if (error) throw error;
        if (data) {
          this.state.sessions = data.map(row => ({
            id: row.session_id,
            name: row.session_name,
            type: row.session_type,
            status: row.status,
            referenceId: row.reference_id,
            createdAt: row.created_at,
            completedAt: row.completed_at,
            employeeId: row.created_by,
            notes: row.notes,
            items: (row.inventory_session_lines || []).map(line => ({
              line_id: line.line_id,
              code: line.item_code,
              kind: line.item_kind,
              expectedLoc: line.expected_location,
              actualLoc: line.actual_location,
              scanStatus: line.scan_status,
              isManual: line.is_manual_check,
              isManualAddition: line.is_manual_addition || false,
              scannedAt: line.scanned_at,
              scannedBy: line.scanned_by,
              checked: line.scan_status !== 'PENDING',
              isLoggedToDb: true,
              normCode: this.normalizeCode(line.item_code)
            }))
          }));
          this.saveSessionsLocalOnly();

          // Cập nhật lại list đã scan trong locationSession nếu có
          if (this.state.locationSession) {
            const locSess = this.state.sessions.find(s => s.id === this.state.locationSession.id);
            if (locSess) {
              this.state.locationSession.scanned = locSess.items.filter(i => i.scanStatus === 'MATCHED' || i.scanStatus === 'WRONG_LOCATION');
            }
          }

          if (this.state.isOpen) this.renderBody();
        }
      } catch (e) { console.warn('Supabase Load Sessions Error:', e); }
    },

    saveSessionsLocalOnly() {
      try { localStorage.setItem('mcs_ar_audit_sessions', JSON.stringify(this.state.sessions)); } catch (e) { }
    },

    saveSessions(syncSessionId = null) {
      this.saveSessionsLocalOnly();

      const targetId = syncSessionId || this.state.activeSessionId || (this.state.locationSession ? this.state.locationSession.id : null);
      if (!targetId) return;

      const s = this.state.sessions.find(x => x.id === targetId);
      if (!s) return;

      const sb = this.getSupabaseClient();
      if (!sb) return;

      if (this.state.saveTimeout) clearTimeout(this.state.saveTimeout);
      this.state.saveTimeout = setTimeout(async () => {
        try {
        const sessionPayload = {
          session_id: s.id,
          session_name: s.name,
          session_type: s.type,
          status: s.status,
          created_by: s.employeeId || window.app?.currentUser?.EmployeeID || '9',
          reference_id: s.referenceId || null,
          notes: s.notes || null,
          completed_at: s.completedAt || null,
          created_at: s.createdAt
        };
        const { error: sErr } = await sb.from('inventory_sessions').upsert(sessionPayload);
        if (sErr) throw sErr;

        if (s.items && s.items.length > 0) {
          const linesPayload = s.items.map(i => {
            if (!i.line_id) i.line_id = this.generateUUID();
            return {
              line_id: i.line_id,
              session_id: s.id,
              item_code: i.code,
              item_kind: i.kind,
              expected_location: i.expectedLoc || null,
              actual_location: i.actualLoc || null,
              scan_status: i.scanStatus || (i.checked ? 'MATCHED' : 'PENDING'),
              is_manual_check: i.isManual || false,
              is_manual_addition: i.isManualAddition || false,
              scanned_at: i.scannedAt || (i.checked ? new Date().toISOString() : null),
              scanned_by: i.scannedBy || s.employeeId || null
            };
          });
          const { error: lErr } = await sb.from('inventory_session_lines').upsert(linesPayload);
          if (lErr) throw lErr;
          s.items.forEach(i => i.isLoggedToDb = true);
          this.saveSessionsLocalOnly();
        }
        } catch (e) {
          console.error('Supabase Sync Session Error:');
          console.error(JSON.stringify(e, null, 2));
        }
      }, 1000);
    },

    exportSessionReport(session, isPrint = false) {
      const sessionId = session ? session.id : null;
      const dbSess = this.state.sessions.find(s => s.id === sessionId) || session;
      if (!dbSess) return;

      if (isPrint) {
        let htmlContent = `
            <!DOCTYPE html>
            <html lang="ja">
            <head>
                <meta charset="utf-8">
                <title>監査報告 (Báo cáo kiểm kê)</title>
                <style>
                    @page { size: A4 portrait; margin: 15mm; }
                    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; color: #000; background: #fff; margin: 0; padding: 0; }
                    .header { text-align: center; margin-bottom: 20px; }
                    .title { font-size: 18pt; font-weight: bold; margin-bottom: 10px; }
                    .meta { display: flex; justify-content: space-between; font-size: 10pt; margin-bottom: 10px; }
                    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; page-break-inside: auto; }
                    tr { page-break-inside: avoid; page-break-after: auto; }
                    th, td { border: 1px solid #000; padding: 6px 8px; text-align: left; }
                    th { background-color: #f1f5f9; font-weight: bold; }
                    .matched { color: #16a34a; font-weight:bold; }
                    .missing { color: #ea580c; font-weight:bold; }
                    .wrong { color: #ef4444; font-weight:bold; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="title">${dbSess.type === 'BATCH_LIST' ? '一括棚卸報告書 (Báo cáo kiểm kê danh sách)' : '棚実査報告書 (Báo cáo kiểm kê giá)'}</div>
                </div>
                <div class="meta">
                    <div><b>セッション名 (Tên phiên):</b> ${dbSess.name || ''}</div>
                    <div><b>担当者 (Nhân viên):</b> ${dbSess.employeeId || ''} &nbsp;&nbsp; <b>印刷日時 (Ngày in):</b> ${new Date().toLocaleString()}</div>
                </div>
                <table>
                    <thead>
                        <tr>
                            ${dbSess.type === 'BATCH_LIST' ?
            '<th>設備コード<br>(Mã TB)</th><th>種類<br>(Loại)</th><th>登録位置<br>(Vị trí)</th><th>ステータス<br>(Trạng thái)</th><th>確認日時<br>(Ngày quét)</th><th>備考<br>(Ghi chú)</th>' :
            '<th>設備コード<br>(Mã TB)</th><th>種類<br>(Loại)</th><th>実配置<br>(Thực tế)</th><th>システム位置<br>(Hệ thống)</th><th>ステータス<br>(Trạng thái)</th><th>確認日時<br>(Ngày quét)</th>'
          }
                        </tr>
                    </thead>
                    <tbody>
            `;

        if (dbSess.type === 'BATCH_LIST') {
          if (dbSess.items) {
            dbSess.items.forEach(i => {
              const itemData = i.item || {};
              const loc = itemData.RackLayerID || '未分類';
              const statusStr = i.checked ? '<span class="matched">確認済 (Đã quét)</span>' : '<span class="missing">未確認 (Chưa quét)</span>';
              const dateStr = i.scannedAt ? new Date(i.scannedAt).toLocaleString() : '';
              const note = (i.isManual || i.isManualAddition) ? '手動追加' : '';
              const kindStr = i.kind === 'mold' ? '金型' : '抜型';
              htmlContent += `<tr><td>${i.code}</td><td>${kindStr}</td><td>${loc}</td><td>${statusStr}</td><td>${dateStr}</td><td>${note}</td></tr>`;
            });
          }
        } else if (dbSess.type === 'LOCATION_CHECK') {
          if (dbSess.items) {
            dbSess.items.forEach(i => {
              const actualLoc = i.actualLoc || '';
              const expectedLoc = i.expectedLoc || '';
              let statusStr = '';
              if (i.scanStatus === 'MATCHED') statusStr = '<span class="matched">一致 (Khớp)</span>';
              else if (i.scanStatus === 'WRONG_LOCATION') statusStr = '<span class="wrong">誤配置 (Sai vị trí)</span>';
              else if (i.scanStatus === 'PENDING') statusStr = '<span class="missing">不足 (Thiếu)</span>';
              else statusStr = i.scanStatus;

              const dateStr = i.scannedAt ? new Date(i.scannedAt).toLocaleString() : '';
              const kindStr = i.kind === 'mold' ? '金型' : '抜型';
              htmlContent += `<tr><td>${i.code}</td><td>${kindStr}</td><td>${actualLoc}</td><td>${expectedLoc}</td><td>${statusStr}</td><td>${dateStr}</td></tr>`;
            });
          }
        }

        htmlContent += `
                    </tbody>
                </table>
                <script>window.onload = function() { setTimeout(function(){ window.print(); }, 500); }</script>
            </body>
            </html>
            `;

        const printWin = window.open('', '_blank');
        if (printWin) {
          printWin.document.write(htmlContent);
          printWin.document.close();
        } else {
          if (window.showToast) window.showToast('error', '', 'Popup bị chặn. Vui lòng cho phép popup để in.');
        }
        return;
      }

      let csvContent = '\uFEFF';
      if (dbSess.type === 'BATCH_LIST') {
        csvContent += '設備コード (Mã TB),種類 (Loại),登録位置 (Vị trí),ステータス (Trạng thái),担当者 (Nhân viên),確認日時 (Ngày quét),備考 (Ghi chú)\n';
        if (dbSess.items) {
          dbSess.items.forEach(i => {
            const itemData = i.item || {};
            const loc = itemData.RackLayerID || '未分類';
            const statusStr = i.checked ? '確認済' : '未確認';
            const dateStr = i.scannedAt ? new Date(i.scannedAt).toLocaleString() : '';
            const emp = i.scannedBy || dbSess.employeeId || '';
            const note = (i.isManual || i.isManualAddition) ? '手動追加' : '';
            const kindStr = i.kind === 'mold' ? '金型' : '抜型';
            csvContent += `"${i.code}","${kindStr}","${loc}","${statusStr}","${emp}","${dateStr}","${note}"\n`;
          });
        }
      } else if (dbSess.type === 'LOCATION_CHECK') {
        csvContent += '設備コード (Mã TB),種類 (Loại),実配置 (Thực tế),システム位置 (Hệ thống),ステータス (Trạng thái),担当者 (Nhân viên),確認日時 (Ngày quét)\n';

        if (dbSess.items) {
          dbSess.items.forEach(i => {
            const actualLoc = i.actualLoc || '';
            const expectedLoc = i.expectedLoc || '';

            let statusStr = '';
            if (i.scanStatus === 'MATCHED') statusStr = '一致';
            else if (i.scanStatus === 'WRONG_LOCATION') statusStr = '誤配置';
            else if (i.scanStatus === 'PENDING') statusStr = '不足';
            else statusStr = i.scanStatus;

            const dateStr = i.scannedAt ? new Date(i.scannedAt).toLocaleString() : '';
            const emp = i.scannedBy || dbSess.employeeId || '';
            const kindStr = i.kind === 'mold' ? '金型' : '抜型';
            csvContent += `"${i.code}","${kindStr}","${actualLoc}","${expectedLoc}","${statusStr}","${emp}","${dateStr}"\n`;
          });
        }
      } else {
        return;
      }

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const sName = dbSess.name ? dbSess.name.replace(/\s+/g, '_') : 'Session';
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
      a.download = `BaoCao_${sName}_${timestamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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
        const normQ = this.normalizeCode(query).toLowerCase();
        for (const item of list) {
          const code = kind === 'mold' ? (item.MoldCode || '') : (item.CutterCode || item.CutterNo || '');
          const name = kind === 'mold' ? (item.MoldName || '') : (item.CutterName || '');
          const dCode = item.displayCode || '';
          const normC = this.normalizeCode(code).toLowerCase();
          const normD = this.normalizeCode(dCode).toLowerCase();

          if (code.toLowerCase().includes(q) || name.toLowerCase().includes(q) || dCode.toLowerCase().includes(q) || normC.includes(normQ) || normD.includes(normQ)) {
            results.push({
              code: dCode || code,
              kind: kind,
              item: item,
              normCode: this.normalizeCode(dCode || code),
              normId: String(item.normId || (kind === 'mold' ? item.MoldID : item.CutterID) || '')
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

    searchLocations(query) {
      const dm = window.DataManager?.data;
      if (!dm) return [];
      const results = [];
      const normQ = this.normalizeCode(query);
      if (dm.racks) {
        dm.racks.forEach(r => {
          const rCode = String(r.RackID);
          if (rCode.includes(normQ) || normQ.includes(rCode)) results.push({ code: rCode, type: 'rack', label: `ラック: ${rCode}` });
        });
      }
      if (dm.racklayers) {
        dm.racklayers.forEach(l => {
          const lCode = String(l.RackLayerID);
          if (lCode.includes(normQ) || normQ.includes(lCode)) results.push({ code: lCode, type: 'layer', label: `棚: ${lCode}` });
        });
      }
      return results.slice(0, 20);
    },

    renderLocationDropdown(container, query, onSelect) {
      if (!this.state.dropdownLocations || this.state.dropdownLocations.length === 0) {
        container.classList.remove('open');
        return;
      }
      container.innerHTML = this.state.dropdownLocations.map((item, i) => `
        <div class="arl-dd-item ${i === this.state.highlightLocIdx ? 'highlight' : ''}" data-idx="${i}">
            <div class="arl-dd-code">${this.highlightMatch(item.code, query)} <span style="font-size:11px; color:#64748b;">(${item.label})</span></div>
        </div>
      `).join('');
      container.classList.add('open');
      container.querySelectorAll('.arl-dd-item').forEach(el => {
        el.addEventListener('click', (e) => {
          const idx = parseInt(e.currentTarget.dataset.idx, 10);
          onSelect(this.state.dropdownLocations[idx]);
          container.classList.remove('open');
        });
      });
    },

    // ===== INIT =====
    init() {
      if (!window.showToast) {
        window.showToast = function (type, title, message) {
          if (window.notify) {
            if (type === 'success') window.notify.success(message);
            else if (type === 'warning') window.notify.warning(message);
            else if (type === 'error') window.notify.error(message);
            else window.notify.info(message);
          }
        };
      }
      this.loadSessions();
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

    open(initialMode = 'single', initialBatchList = []) {
      if (this.state.isOpen) return;
      this.state.isOpen = true;
      this.state.mode = initialMode;
      this.state.singleTarget = null;
      this.state.batchList = initialBatchList;
      this.state.foundImage = null;
      if (window.ViewManager?.currentView && window.ViewManager.currentView !== 'ar-locator') {
        this.state.prevView = window.ViewManager.currentView;
      }
      // Sync sessions from Supabase on open + poll every 30s for cross-device sync
      this.loadSessions();
      if (this.state.syncInterval) clearInterval(this.state.syncInterval);
      this.state.syncInterval = setInterval(() => { if (this.state.isOpen) this.loadSessions(); }, 30000);
      this.render();
      if (window.ViewManager) window.ViewManager.switchView('ar-locator');
    },

    createBatchSessionAndOpen(batchList) {
      if (!this.state.isOpen) {
        this.open('batch');
      }
      this.state.mode = 'batch';
      
      const sessionItems = batchList.map(b => ({
          line_id: this.generateUUID(),
          code: b.code,
          kind: b.kind,
          item: b.item,
          normCode: b.normCode,
          checked: false,
          scanStatus: 'PENDING',
          isManual: false,
          isLoggedToDb: false
      }));

      const newId = this.generateUUID();
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const timeStr = new Date().toTimeString().slice(0, 5).replace(/:/g, '');
      const empId = '9'; // window.app?.currentUser?.EmployeeID || '9';
      const employees = window.DataManager?.data?.employees || [];
      const empData = employees.find(e => String(e.EmployeeID) === String(empId));
      const empName = empData ? (empData.EmployeeNameShort || empData.EmployeeName || empId) : empId;
      
      const finalName = `棚卸_${dateStr}_${timeStr}_${empName}`;
      
      this.state.sessions.unshift({
        id: newId,
        createdAt: new Date().toISOString(),
        name: finalName,
        type: 'BATCH_LIST',
        status: 'IN_PROGRESS',
        employeeId: empId,
        items: sessionItems
      });
      
      this.state.activeSessionId = newId;
      this.saveSessions(newId);
      this.renderBody();
      if (window.showToast) window.showToast('success', '', 'Tạo phiên kiểm kê mới thành công!');
    },

    close() {
      this.state.isOpen = false;
      this.closeCamera();
      if (this.state.syncInterval) { clearInterval(this.state.syncInterval); this.state.syncInterval = null; }

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
          <button class="arl-tab ${this.state.mode === 'single' ? 'active' : ''}" data-mode="single"><i class="fas fa-crosshairs"></i> 特定検索</button>
          <button class="arl-tab ${this.state.mode === 'multi_search' ? 'active' : ''}" data-mode="multi_search"><i class="fas fa-search-plus"></i> リスト検索</button>
          <button class="arl-tab ${this.state.mode === 'batch' ? 'active' : ''}" data-mode="batch"><i class="fas fa-list-check"></i> リスト棚卸</button>
          <button class="arl-tab ${this.state.mode === 'location' ? 'active' : ''}" data-mode="location"><i class="fas fa-map-marker-alt"></i> 棚実査</button>
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
      else if (this.state.mode === 'multi_search') this.renderMultiSearch(body);
      else if (this.state.mode === 'batch') this.renderBatch(body);
      else this.renderLocation(body);
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
          <div style="position:relative; margin-top:16px; border-radius:12px; overflow:hidden; border:2px solid #22c55e; box-shadow:0 8px 16px rgba(0,0,0,0.1);">
            <img src="${this.state.foundImage}" style="width:100%; display:block; background:#000;" />
            <button id="arl-btn-expand-img" style="position:absolute; top:8px; right:8px; background:rgba(0,0,0,0.6); color:#fff; border:none; border-radius:6px; padding:8px 12px; font-size:14px; cursor:pointer; z-index:10; box-shadow:0 2px 4px rgba(0,0,0,0.3); backdrop-filter:blur(4px);">
                <i class="fas fa-expand"></i> 全画面表示 (Phóng to)
            </button>
          </div>
          <div class="arl-actions" style="margin-top:24px; display:flex; flex-wrap:wrap; gap:8px;">
            <button class="arl-btn" id="arl-single-audit" ${this.state.singleTarget.isLoggedToDb ? 'disabled' : ''} style="flex: 1 1 100%; border-radius:8px; padding:12px; font-weight:bold; ${this.state.singleTarget.isLoggedToDb ? 'background: #94a3b8; border-color: #94a3b8; color:#fff;' : 'background: #22c55e; border-color: #22c55e; color: #fff;'}">
                <i class="fas ${this.state.singleTarget.isLoggedToDb ? 'fa-check-double' : 'fa-clipboard-check'}"></i> 
                ${this.state.singleTarget.isLoggedToDb ? '確認記録済 (Đã ghi Log)' : '確認済として記録 (Ghi Log Kiểm kê)'}
            </button>
            <button class="arl-btn arl-btn-secondary" id="arl-single-retry" style="flex:1;"><i class="fas fa-redo"></i> もう一度</button>
            <button class="arl-btn arl-btn-primary" id="arl-single-detail" style="flex:1;"><i class="fas fa-info-circle"></i> 詳細表示</button>
          </div>
        `;
        document.getElementById('arl-single-audit')?.addEventListener('click', () => {
          if (this.state.singleTarget && !this.state.singleTarget.isLoggedToDb) {
            this.syncAuditLog(this.state.singleTarget);
            this.state.singleTarget.isLoggedToDb = true;
            if (window.showToast) window.showToast('success', '記録完了', 'Đã ghi log kiểm kê vào hệ thống');
            this.renderBody();
          }
        });
        document.getElementById('arl-single-retry')?.addEventListener('click', () => {
          this.state.foundImage = null;
          this.renderBody();
        });
        document.getElementById('arl-single-detail')?.addEventListener('click', () => {
          if (window.DetailPanel?.open) window.DetailPanel.open(this.state.singleTarget.item, this.state.singleTarget.kind);
        });
        document.getElementById('arl-btn-expand-img')?.addEventListener('click', () => {
          const overlay = document.createElement('div');
          overlay.style.position = 'fixed';
          overlay.style.top = '0';
          overlay.style.left = '0';
          overlay.style.width = '100vw';
          overlay.style.height = '100vh';
          overlay.style.backgroundColor = 'rgba(0,0,0,0.9)';
          overlay.style.zIndex = '999999';
          overlay.style.display = 'flex';
          overlay.style.flexDirection = 'column';
          overlay.style.justifyContent = 'center';
          overlay.style.alignItems = 'center';

          const closeBtn = document.createElement('button');
          closeBtn.innerHTML = '<i class="fas fa-times"></i> 閉じる / Đóng';
          closeBtn.style.position = 'absolute';
          closeBtn.style.top = '20px';
          closeBtn.style.right = '20px';
          closeBtn.style.padding = '12px 24px';
          closeBtn.style.backgroundColor = 'rgba(255,255,255,0.2)';
          closeBtn.style.color = '#fff';
          closeBtn.style.border = '1px solid rgba(255,255,255,0.4)';
          closeBtn.style.borderRadius = '8px';
          closeBtn.style.fontSize = '16px';
          closeBtn.style.cursor = 'pointer';
          closeBtn.style.zIndex = '1000000';
          closeBtn.style.backdropFilter = 'blur(4px)';

          const img = document.createElement('img');
          img.src = this.state.foundImage;
          img.style.maxWidth = '100vw';
          img.style.maxHeight = '100vh';
          img.style.objectFit = 'contain';

          closeBtn.onclick = () => document.body.removeChild(overlay);
          overlay.onclick = (e) => { if (e.target === overlay) document.body.removeChild(overlay); };

          overlay.appendChild(closeBtn);
          overlay.appendChild(img);
          document.body.appendChild(overlay);
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
              <div style="font-size:12px; color:var(--mcs-text-muted); margin-top:4px;"><i class="fas fa-map-marker-alt"></i> Vị trí: ${this.state.singleTarget.item.Location || this.state.singleTarget.item.RackLayerID || 'Chưa rõ'}</div>
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
            this.state.singleTarget = { code: sel.code, kind: sel.kind, item: sel.item, normCode: sel.normCode, normId: sel.normId, isLoggedToDb: false };
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

    // ===== MULTI SEARCH MODE =====
    renderMultiSearch(body) {
      if (!this.state.searchList) this.state.searchList = [];

      let listHtml = '';
      if (this.state.searchList.length > 0) {
        listHtml = this.state.searchList.map((t, i) => `
              <div class="arl-batch-item" style="border-radius:4px; padding:8px; margin-bottom:4px; border:1px solid #e2e6ea;">
                  <div style="flex:1;">
                      <div class="arl-batch-code">${t.code}</div>
                      <div class="arl-batch-type ${t.kind}" style="font-size:11px; padding:0; background:none;">${t.kind === 'mold' ? '金型' : '抜型'} - RackLayerID: ${t.item.RackLayerID || 'N/A'}</div>
                  </div>
                  <button class="arl-batch-remove" data-idx="${i}" style="color:#ef4444; border:none; background:none; font-size:20px;">&times;</button>
              </div>
          `).join('');
      } else {
        listHtml = `<div style="text-align:center; padding:20px; color:#aaa; font-size:12px;">リストが空です / Danh sách trống</div>`;
      }

      body.innerHTML = `
        <div class="arl-hint">
          <div class="ja"><i class="fas fa-search-plus"></i> リスト検索モード / Tìm theo danh sách</div>
          複数の金型をリストに登録し、一括で探索します。現在地のRackLayerIDを入力すると、誤配置の警告・更新が可能です。
        </div>
        
        <div style="margin-top:12px; display:flex; gap:8px;">
            <div style="flex:1; position:relative;">
              <input type="text" class="arl-search-input" id="arl-ms-input" placeholder="コード追加 (Thêm mã vào ds)" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" style="width:100%;">
              <button class="arl-search-clear" id="arl-ms-clear" style="display:none;">&times;</button>
              <div class="arl-dropdown" id="arl-ms-dropdown"></div>
            </div>
        </div>
        
        <div style="flex:1; overflow-y:auto; margin-top:12px; border:1px solid #e2e6ea; border-radius:8px; padding:8px;">
            ${listHtml}
        </div>
        
        <div class="arl-actions" style="margin-top:12px;">
            <button class="arl-btn arl-btn-primary" id="arl-ms-scan" ${this.state.searchList.length === 0 ? 'disabled' : ''} style="width:100%; padding:14px;"><i class="fas fa-camera"></i> 探索開始 (Bắt đầu quét)</button>
        </div>
      `;

      body.querySelectorAll('.arl-batch-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.currentTarget.dataset.idx, 10);
          this.state.searchList.splice(idx, 1);
          this.renderBody();
        });
      });

      document.getElementById('arl-ms-scan').addEventListener('click', () => {
        this.openCamera(this.state.searchList);
      });

      const inp = document.getElementById('arl-ms-input');
      const dd = document.getElementById('arl-ms-dropdown');
      const clr = document.getElementById('arl-ms-clear');

      inp.addEventListener('input', () => {
        const q = inp.value.trim();
        clr.style.display = q.length > 0 ? 'block' : 'none';
        if (q.length < 2) { dd.classList.remove('open'); return; }
        this.state.dropdownItems = this.searchDevices(q);
        this.state.highlightIdx = this.state.dropdownItems.length > 0 ? 0 : -1;
        this.renderDropdown(dd, q);
      });

      const submitMs = () => {
        let sel = null;
        if (this.state.highlightIdx >= 0 && this.state.dropdownItems[this.state.highlightIdx]) {
          sel = this.state.dropdownItems[this.state.highlightIdx];
        } else if (this.state.dropdownItems.length > 0) {
          sel = this.state.dropdownItems[0];
        }
        if (sel && !this.state.searchList.find(t => t.normCode === sel.normCode)) {
          this.state.searchList.push({ code: sel.code, kind: sel.kind, item: sel.item, normCode: sel.normCode, normId: sel.normId });
          inp.value = ''; clr.style.display = 'none'; dd.classList.remove('open');
          this.renderBody();
        }
      };

      inp.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); this.state.highlightIdx = Math.min(this.state.highlightIdx + 1, this.state.dropdownItems.length - 1); this.renderDropdown(dd, inp.value.trim()); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this.state.highlightIdx = Math.max(this.state.highlightIdx - 1, 0); this.renderDropdown(dd, inp.value.trim()); }
        else if (e.key === 'Enter') { e.preventDefault(); submitMs(); }
      });

      clr.addEventListener('click', () => { inp.value = ''; clr.style.display = 'none'; dd.classList.remove('open'); inp.focus(); });
    },

    // ===== BATCH MODE (SESSIONS) =====
    // ===== BATCH MODE (SESSIONS) =====
    renderBatch(body) {
      if (!this.state.activeSessionId) {
        this.renderSessionDashboard(body);
      } else if (this.state.activeSessionId === 'BATCH_BUILDER') {
        this.renderBatchBuilder(body);
      } else {
        const session = this.state.sessions.find(s => s.id === this.state.activeSessionId);
        if (!session) {
          this.state.activeSessionId = null;
          this.renderSessionDashboard(body);
        } else {
          this.renderSessionDetail(body, session);
        }
      }
    },

    renderSessionDashboard(body) {
      let cardsHtml = '';
      if (this.state.sessions.length === 0) {
        cardsHtml = `<div style="text-align:center; padding: 40px 20px; color: var(--mcs-text-muted);">
             <i class="fas fa-box-open" style="font-size: 40px; opacity: 0.2; margin-bottom: 16px;"></i>
             <div>セッションなし / Chưa có phiên kiểm kê nào</div>
          </div>`;
      } else {
        const batchSessions = this.state.sessions.filter(s => s.type === 'BATCH_LIST');
        cardsHtml = batchSessions.map(s => {
          const total = s.items.length;
          const checked = s.items.filter(i => i.checked).length;
          const pct = total === 0 ? 0 : Math.round((checked / total) * 100);
          const isDone = total > 0 && checked === total;

          let dStr = new Date(s.createdAt).toLocaleString();
          return `
              <div class="arl-session-card" data-id="${s.id}">
                  <div class="arl-session-header">
                      <div class="arl-session-title">${s.name || '一括確認 (Kiểm kê hàng loạt)'}</div>
                      <div class="arl-session-date">${dStr}</div>
                  </div>
                  <div class="arl-session-progress-wrap">
                      <div class="arl-session-progress ${isDone ? 'complete' : ''}" style="width: ${pct}%;"></div>
                  </div>
                  <div class="arl-session-meta">
                      <span>進捗: ${checked} / ${total}</span>
                      <span style="color: ${isDone ? '#16a34a' : '#ea580c'}">${isDone ? '完了 (Đã xong)' : '確認中 (Đang quét)'}</span>
                  </div>
              </div>
              `;
        }).join('');
      }

      const employees = window.DataManager?.data?.employees || [];
      const defaultEmpId = '9'; // window.app?.currentUser?.EmployeeID || '9';
      const empOptions = employees.map(e => `<option value="${e.EmployeeID}" ${String(e.EmployeeID) === String(defaultEmpId) ? 'selected' : ''}>${e.EmployeeName}</option>`).join('');

      body.innerHTML = `
        <div class="arl-hint">
          <div class="ja"><i class="fas fa-list-check"></i> 一括棚卸セッション / Danh sách Phiên kiểm kê</div>
          「＋ 新規作成」で新しい確認リストを作ります。
        </div>
        <div style="margin-top:16px; background:var(--mcs-surface); border:1px solid var(--mcs-border); padding:12px; border-radius:8px;">
           <label style="display:block; margin-bottom:8px; font-weight:bold; font-size:12px; color:var(--mcs-text);">担当者 (Nhân viên):</label>
           <select id="arl-new-session-emp" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--mcs-border); margin-bottom:12px;">
             ${empOptions}
           </select>
           <button class="arl-btn arl-btn-primary" id="arl-new-session" style="width:100%; padding:14px; font-size:14px;"><i class="fas fa-plus"></i> 新規作成 / Tạo phiên mới</button>
        </div>
        <div style="flex:1; overflow-y:auto; padding-bottom:20px; margin-top:16px;">
           ${cardsHtml}
        </div>
      `;

      document.getElementById('arl-new-session')?.addEventListener('click', () => {
        const empSelect = document.getElementById('arl-new-session-emp');
        this.state.tempBatchEmpId = empSelect ? empSelect.value : defaultEmpId;
        this.state.activeSessionId = 'BATCH_BUILDER';
        this.state.batchDraftItems = [];
        this.state.batchDraftName = '';
        this.renderBody();
      });

      body.querySelectorAll('.arl-session-card').forEach(card => {
        card.addEventListener('click', () => {
          this.state.activeSessionId = card.dataset.id;
          this.renderBody();
        });
      });
    },

    renderBatchBuilder(body) {
      if (!this.state.batchDraftItems) this.state.batchDraftItems = [];

      body.innerHTML = `
           <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
              <button class="arl-btn" id="arl-batch-builder-back" style="padding:6px 12px; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; font-size:14px; flex:0 0 auto;"><i class="fas fa-arrow-left"></i> 戻る</button>
              <div style="flex:1; font-weight:bold; font-size:14px;">新規作成 / Tạo phiên kiểm kê (Danh sách)</div>
           </div>

           <div class="arl-hint">
             <div class="ja"><i class="fas fa-list-check"></i> 一括棚卸 / Kiểm kê theo danh sách</div>
             「リスト管理」から監査したい金型・抜型を追加し、保存してください。<br>
             (Thêm thiết bị vào danh sách và nhấn Lưu)
           </div>
           
           <div style="margin-top:16px;">
               <label style="display:block; margin-bottom:8px; font-weight:bold; font-size:12px; color:var(--mcs-text);">セッション名 (Tên phiên - không bắt buộc):</label>
               <input type="text" id="arl-batch-builder-name" class="arl-search-input" placeholder="Nhập tên phiên (nếu cần)..." value="${this.state.batchDraftName || ''}" style="width:100%; border-radius:6px;">
           </div>

           <div style="margin-top:16px;">
               <button class="arl-btn" id="arl-batch-builder-manage" style="width:100%; padding:14px; background:var(--mcs-surface); border:2px dashed var(--mcs-primary); color:var(--mcs-primary); font-size:15px; font-weight:bold; border-radius:8px;">
                   <i class="fas fa-list-check"></i> リスト管理 (Quản lý thiết bị: ${this.state.batchDraftItems.length} mục)
               </button>
           </div>
           
           <div class="arl-actions" style="margin-top:20px; display:flex; gap:8px;">
               <button class="arl-btn" id="arl-batch-builder-cancel" style="flex:1; font-size:16px; padding:16px; background:#f1f5f9; border:1px solid #cbd5e1; color:#333;">キャンセル (Hủy)</button>
               <button class="arl-btn arl-btn-primary" id="arl-batch-start" style="flex:1; font-size:16px; padding:16px;" ${this.state.batchDraftItems.length === 0 ? 'disabled' : ''}><i class="fas fa-save"></i> 保存 (Lưu phiên)</button>
           </div>
        `;

      document.getElementById('arl-batch-builder-back').onclick = () => { this.state.activeSessionId = null; this.renderBody(); };
      document.getElementById('arl-batch-builder-cancel').onclick = () => { this.state.activeSessionId = null; this.renderBody(); };

      const nameInput = document.getElementById('arl-batch-builder-name');
      nameInput.addEventListener('input', (e) => { this.state.batchDraftName = e.target.value; });

      document.getElementById('arl-batch-builder-manage').onclick = () => {
        const fakeSession = { id: 'DRAFT', items: this.state.batchDraftItems, type: 'BATCH_LIST' };
        this.renderListManagerModal(fakeSession);
      };

      document.getElementById('arl-batch-start').onclick = () => {
        if (this.state.batchDraftItems.length === 0) return;
        const newId = this.generateUUID();
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const timeStr = new Date().toTimeString().slice(0, 5).replace(/:/g, '');
        const employees = window.DataManager?.data?.employees || [];
        const empData = employees.find(e => String(e.EmployeeID) === String(this.state.tempBatchEmpId));
        const empName = empData ? (empData.EmployeeNameShort || empData.EmployeeName || this.state.tempBatchEmpId) : (this.state.tempBatchEmpId || '9');

        let finalName = this.state.batchDraftName ? this.state.batchDraftName.trim() : `棚卸_${dateStr}_${timeStr}_${empName}`;

        this.state.sessions.unshift({
          id: newId,
          createdAt: new Date().toISOString(),
          name: finalName,
          type: 'BATCH_LIST',
          status: 'IN_PROGRESS',
          employeeId: this.state.tempBatchEmpId || window.app?.currentUser?.EmployeeID || '9',
          items: this.state.batchDraftItems
        });
        this.state.activeSessionId = newId;
        this.saveSessions(newId);
        this.renderBody();
        if (window.showToast) window.showToast('success', '', 'Lưu phiên thành công!');
      };
    },

    renderSessionDetail(body, session) {

      body.querySelectorAll('.arl-session-card').forEach(card => {
        card.addEventListener('click', () => {
          this.state.activeSessionId = card.dataset.id;
          this.renderBody();
        });
      });
    },

    renderSessionDetail(body, session) {
      const total = session.items.length;
      const checked = session.items.filter(b => b.checked).length;
      const allDone = total > 0 && checked === total;

      const grouped = {};
      let unassignedCount = 0;
      let unassignedChecked = 0;

      session.items.forEach(b => {
        let itemData = b.item;
        if (!itemData && window.DataManager && b.normCode) {
          const devices = this.searchDevices(b.normCode);
          if (devices.length > 0) itemData = devices[0];
          b.item = itemData; // Hydrate
        }
        itemData = itemData || {};

        const isManual = !!(b.isManualAddition || b.isManual);
        const loc = isManual ? '手動入力 (Nhập thủ công)' : (itemData.RackLayerID || '手動入力 (Nhập thủ công)');
        if (isManual || !itemData.RackLayerID) {
          unassignedCount++;
          if (b.checked) unassignedChecked++;
        } else {
          if (!grouped[loc]) grouped[loc] = { total: 0, checked: 0 };
          grouped[loc].total++;
          if (b.checked) grouped[loc].checked++;
        }
      });

      let summaryHtml = '';
      const renderSummaryCard = (loc, stats, isUnassigned) => {
        const isDone = stats.total > 0 && stats.checked === stats.total;
        const icon = isUnassigned ? 'fa-box-open' : 'fa-layer-group';
        return `
            <div class="arl-session-loc-card" data-loc="${loc}" style="background:var(--mcs-surface); border:1px solid ${isDone ? '#22c55e' : 'var(--mcs-border)'}; border-radius:8px; padding:12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
               <div style="font-weight:bold; font-size:14px; color:${isDone ? '#16a34a' : 'var(--mcs-text)'};"><i class="fas ${icon}" style="margin-right:8px;"></i> ${isUnassigned ? '手動入力 (Nhập thủ công)' : loc}</div>
               <div style="font-size:13px; font-weight:bold; color:${isDone ? '#16a34a' : '#64748b'};">${stats.checked} / ${stats.total} <i class="fas fa-chevron-right" style="margin-left:8px; color:#cbd5e1;"></i></div>
            </div>
          `;
      };

      Object.keys(grouped).sort().forEach(loc => {
        summaryHtml += renderSummaryCard(loc, grouped[loc], false);
      });
      if (unassignedCount > 0) {
        summaryHtml += renderSummaryCard('CHƯA PHÂN LOẠI', { total: unassignedCount, checked: unassignedChecked }, true);
      }

      body.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
           <button class="arl-btn" id="arl-session-back" style="padding:6px 12px; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; font-size:14px; flex:0 0 auto;"><i class="fas fa-arrow-left"></i> 戻る</button>
           <div style="flex:1; font-weight:bold; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${session.name}</div>
        </div>
        
        <div class="arl-stats" style="margin-top:10px; margin-bottom:16px;">
          <div class="arl-stat"><div class="arl-stat-num">${total}</div><div class="arl-stat-label">登録数 (Đã thêm)</div></div>
          <div class="arl-stat"><div class="arl-stat-num" style="color:#22c55e">${checked}</div><div class="arl-stat-label">確認済 (Đã quét)</div></div>
          <div class="arl-stat"><div class="arl-stat-num" style="color:#f59e0b">${total - checked}</div><div class="arl-stat-label">未確認 (Chưa quét)</div></div>
        </div>
        
        <div style="flex:1; overflow-y:auto; margin-bottom:16px;">
            ${summaryHtml || '<div style="text-align:center; color:#94a3b8; font-size:13px; padding:20px;">リストは空です<br>(Danh sách trống)</div>'}
        </div>
        
        <div class="arl-actions" style="margin-top:auto; flex-direction:column; gap:12px;">
          <button class="arl-btn" id="arl-manage-list" style="padding:16px; font-size:16px; background:var(--mcs-surface); color:var(--mcs-primary); border:2px solid var(--mcs-primary); border-radius:8px; font-weight:bold;">
              <i class="fas fa-list-check"></i> リスト管理 (Quản lý danh sách)
          </button>
          
          <button class="arl-btn arl-btn-primary" id="arl-batch-scan" ${total === 0 ? 'disabled' : ''} style="padding:16px; font-size:16px;">
             <i class="fas fa-camera"></i> ${allDone ? '再スキャン (Quét lại)' : (checked > 0 ? 'スキャン再開 (Tiếp tục quét)' : 'スキャン開始 (Bắt đầu quét)')}
          </button>
          
          <div style="display:flex; gap:8px; margin-top:12px;">
              <button class="arl-btn" id="arl-session-print" style="flex:1; padding:12px; font-size:14px; background:#f59e0b; color:#fff; border-radius:8px; font-weight:bold;"><i class="fas fa-print"></i> 印刷 (In A4)</button>
              <button class="arl-btn" id="arl-session-export" style="flex:1; padding:12px; font-size:14px; background:#16a34a; color:#fff; border-radius:8px; font-weight:bold;"><i class="fas fa-file-excel"></i> Excel出力</button>
              <button class="arl-btn" id="arl-session-delete" style="flex:1; padding:12px; font-size:14px; background:transparent; border:1px solid #ef4444; color:#ef4444; border-radius:8px; font-weight:bold;"><i class="fas fa-bomb"></i> セッション削除</button>
          </div>
        </div>
      `;

      document.getElementById('arl-session-print')?.addEventListener('click', () => {
        this.exportSessionReport(session, true);
      });
      document.getElementById('arl-session-export')?.addEventListener('click', () => {
        this.exportSessionReport(session, false);
      });

      document.getElementById('arl-session-back')?.addEventListener('click', () => {
        this.state.activeSessionId = null;
        this.renderBody();
      });

      document.getElementById('arl-manage-list')?.addEventListener('click', () => {
        this.renderListManagerModal(session);
      });

      body.querySelectorAll('.arl-session-loc-card').forEach(card => {
        card.addEventListener('click', () => {
          this.renderListManagerModal(session, card.dataset.loc);
        });
      });

      document.getElementById('arl-session-delete')?.addEventListener('click', () => {
        setTimeout(() => {
          if (confirm('現在のセッションをすべて削除します。よろしいですか？ / Hành động này sẽ XÓA TOÀN BỘ PHIÊN LÀM VIỆC hiện tại. Bạn có chắc chắn?')) {
            const currentId = session.id;
            this.state.sessions = this.state.sessions.filter(s => s.id !== currentId);
            this.state.activeSessionId = null;

            const sb = this.getSupabaseClient();
            if (sb) {
              sb.from('inventory_sessions').delete().eq('session_id', currentId).then(() => { });
            }
            this.saveSessionsLocalOnly();
            this.renderBody();
            if (window.showToast) window.showToast('success', '', 'セッションを削除しました (Đã xóa phiên làm việc)');
          }
        }, 50);
      });

      document.getElementById('arl-batch-scan')?.addEventListener('click', () => { this.openCamera(session.items); });
    },

    renderListManagerModal(session, focusLoc = null) {
      let modal = document.getElementById('arl-list-manager-modal');
      if (modal) document.body.removeChild(modal);

      modal = document.createElement('div');
      modal.id = 'arl-list-manager-modal';
      modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:99999; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box;';

      const renderModalContent = () => {
        const grouped = {};
        const unassigned = [];
        session.items.forEach((b, i) => {
          let itemData = b.item;
          if (!itemData && window.DataManager && b.normCode) {
            const devices = this.searchDevices(b.normCode);
            if (devices.length > 0) itemData = devices[0];
            b.item = itemData; // Hydrate
          }
          itemData = itemData || {};

          const isManual = !!(b.isManualAddition || b.isManual);
          const loc = isManual ? '手動入力 (Nhập thủ công)' : (itemData.RackLayerID || '手動入力 (Nhập thủ công)');
          if (isManual || !itemData.RackLayerID) {
            unassigned.push({ ...b, originalIndex: i });
          } else {
            if (!grouped[loc]) grouped[loc] = [];
            grouped[loc].push({ ...b, originalIndex: i });
          }
        });

        let listHtml = '';
        const renderGroup = (loc, items, isUnassigned) => {
          const checkedCount = items.filter(x => x.checked).length;
          const isDone = items.length > 0 && checkedCount === items.length;
          const icon = isUnassigned ? 'fa-box-open' : 'fa-layer-group';
          const itemsHtml = items.map(b => {
            const i = b.originalIndex;
            return `
                      <div class="arl-batch-item ${b.checked ? 'checked' : ''}" data-idx="${i}" style="border-radius:0; border-left:none; border-right:none; border-top:none; border-bottom:1px solid var(--mcs-border);">
                        <div class="arl-batch-num">${b.checked ? '✓' : (i + 1)}</div>
                        <div style="flex:1; display:flex; flex-direction:column; overflow:hidden;">
                           <span class="arl-batch-code">${b.code}</span>
                           <span class="arl-batch-type ${b.kind}">${b.kind === 'mold' ? '金型' : '抜型'} - ${b.checked ? (b.isLoggedToDb ? '記録済' : '確認済') : '未確認'}</span>
                        </div>
                        <button class="arl-batch-manual" data-idx="${i}" style="color:${b.checked ? '#94a3b8' : '#3b82f6'}; font-size:18px; margin-right:8px; background:none; border:none; padding:4px;" title="手動確認 / Check tay"><i class="fas fa-check-circle"></i></button>
                        <button class="arl-batch-info" data-idx="${i}" style="color:var(--mcs-primary); font-size:18px; margin-right:8px; background:none; border:none; padding:4px;" title="詳細 / Chi tiết"><i class="fas fa-info-circle"></i></button>
                        <button class="arl-batch-remove" data-idx="${i}" title="削除 / Xóa" style="background:none; border:none; color:#ef4444; font-size:24px; line-height:1; padding:0 8px;">&times;</button>
                      </div>
                    `;
          }).join('');

          return `
                  <div class="arl-layer-group" data-loc-group="${loc}" style="margin-bottom:12px; border:1px solid var(--mcs-border); border-radius:8px; overflow:hidden;">
                    <div class="arl-layer-header" style="background:var(--mcs-surface); padding:12px; display:flex; justify-content:space-between; align-items:center; cursor:pointer;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                       <div style="font-weight:bold; font-size:14px;"><i class="fas ${icon}" style="margin-right:4px;"></i> ${loc}</div>
                       <div style="display:flex; align-items:center;">
                          <span style="font-size:12px; font-weight:bold; color:${isDone ? '#16a34a' : '#64748b'}; margin-right:12px;">${checkedCount} / ${items.length}</span>
                          <button class="arl-layer-delete-btn" data-loc="${loc}" title="Xóa toàn bộ vị trí này" style="background:none; border:none; color:#ef4444; font-size:16px; cursor:pointer; padding:4px;"><i class="fas fa-trash-alt"></i></button>
                       </div>
                    </div>
                    <div class="arl-layer-body" style="display:block;">
                       ${itemsHtml}
                    </div>
                  </div>
                `;
        };

        Object.keys(grouped).sort().forEach(loc => { listHtml += renderGroup(loc, grouped[loc], false); });
        if (unassigned.length > 0) { listHtml += renderGroup('手動入力 (Nhập thủ công)', unassigned, true); }

        modal.innerHTML = `
              <div style="background:var(--mcs-bg); width:100%; max-width:800px; height:100%; max-height:800px; border-radius:12px; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 10px 30px rgba(0,0,0,0.3);">
                <div style="display:flex; align-items:center; justify-content:space-between; padding:16px; border-bottom:1px solid var(--mcs-border); background:var(--mcs-surface); box-shadow:0 2px 4px rgba(0,0,0,0.05);">
                   <div style="display:flex; align-items:center; gap:8px;">
                      <button id="arl-lm-close" style="background:none; border:none; font-size:18px; color:var(--mcs-text); cursor:pointer;"><i class="fas fa-times"></i></button>
                      <h3 style="margin:0; font-size:16px;">リスト管理 (Quản lý danh sách)</h3>
                   </div>
                   <span style="font-size:12px; font-weight:bold; color:#64748b;">${session.items.length}件</span>
                </div>
                
                <div style="padding:16px; border-bottom:1px solid var(--mcs-border); background:var(--mcs-surface);">
                    <div class="arl-search-wrap" style="display:flex; gap:8px;">
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
                    <div style="display:flex; gap:8px; margin-top:12px;">
                        <button class="arl-btn" id="arl-batch-import-rack" style="flex:1; padding:10px 16px; border-radius:6px; border:1px solid var(--mcs-border); background:#f8fafc; color:var(--mcs-primary); font-weight:bold; white-space:nowrap;"><i class="fas fa-layer-group"></i> ラック追加 (Thêm từ Giá)</button>
                        <button class="arl-btn" id="arl-batch-collapse" style="padding:10px 16px; border-radius:6px; border:1px solid var(--mcs-border); background:transparent; color:var(--mcs-text); font-weight:bold; white-space:nowrap;" title="Thu gọn/Mở rộng danh sách"><i class="fas fa-compress-alt"></i></button>
                        ${session.items.length > 0 ? `<button class="arl-btn" id="arl-batch-reset" style="padding:10px 16px; border-radius:6px; border:1px solid #ef4444; background:transparent; color:#ef4444; font-weight:bold; white-space:nowrap;" title="Xóa toàn bộ"><i class="fas fa-trash"></i></button>` : ''}
                    </div>
                </div>
                
                <div style="flex:1; overflow-y:auto; padding:16px; background:#f8fafc;">
                   ${listHtml || '<div style="text-align:center; padding:40px 20px; color:#aaa;"><i class="fas fa-box-open" style="font-size:32px; margin-bottom:12px; display:block;"></i>リストは空です (Danh sách trống)</div>'}
                </div>
              </div>
            `;

        const closeBtn = modal.querySelector('#arl-lm-close');
        if (closeBtn) {
          closeBtn.onclick = () => {
            document.body.removeChild(modal);
            this.renderBody(); // Update stats in main view
            document.removeEventListener('mcs-arl-modal-update', renderModalContent);
          };
        }

        modal.querySelectorAll('.arl-layer-delete-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            setTimeout(() => {
              const loc = btn.dataset.loc;
              if (confirm(`Bạn có chắc muốn xóa TOÀN BỘ khuôn của vị trí ${loc} khỏi phiên kiểm kê này?`)) {
                if (loc === '手動入力 (Nhập thủ công)') {
                  session.items = session.items.filter(b => !(b.isManualAddition || b.isManual) && b.item && b.item.RackLayerID);
                } else {
                  session.items = session.items.filter(b => (b.isManualAddition || b.isManual) || !(b.item && b.item.RackLayerID === loc));
                }
                this.saveSessions();
                renderModalContent();
              }
            }, 50);
          });
        });

        modal.querySelectorAll('.arl-batch-info').forEach(btn => btn.addEventListener('click', () => {
          const item = session.items[parseInt(btn.dataset.idx)];
          if (item && window.DetailPanel) window.DetailPanel.open(item.item, item.kind === 'mold' ? 'mold' : 'cutter');
        }));

        modal.querySelectorAll('.arl-batch-manual').forEach(btn => btn.addEventListener('click', () => {
          const item = session.items[parseInt(btn.dataset.idx)];
          if (item && !item.checked) {
            item.checked = true;
            if (!item.isLoggedToDb) {
              this.syncAuditLog(item);
              item.isLoggedToDb = true;
            }
            this.saveSessions();
            renderModalContent();
            if (window.showToast) window.showToast('success', '', `Đã đánh dấu tay: ${item.code}`);
          }
        }));

        modal.querySelectorAll('.arl-batch-remove').forEach(btn => btn.addEventListener('click', () => {
          session.items.splice(parseInt(btn.dataset.idx), 1);
          this.saveSessions();
          renderModalContent();
        }));

        const resetBtn = modal.querySelector('#arl-batch-reset');
        if (resetBtn) {
          resetBtn.addEventListener('click', () => {
            setTimeout(() => {
              if (confirm('リストをクリアしますか？ / Bạn có chắc muốn xóa toàn bộ danh sách?')) {
                session.items = [];
                this.saveSessions();
                renderModalContent();
              }
            }, 50);
          });
        }

        const importRackBtn = modal.querySelector('#arl-batch-import-rack');
        if (importRackBtn) {
          importRackBtn.addEventListener('click', () => {
            const dm = window.DataManager?.data;
            let rackOpts = '', layerOpts = '';
            if (dm && dm.racks) rackOpts = dm.racks.map(r => `<option value="${r.RackID}">${r.RackName || ''}</option>`).join('');
            if (dm && dm.racklayers) layerOpts = dm.racklayers.map(l => `<option value="${l.RackLayerID}">${l.RackLayerID}</option>`).join('');

            const rackModal = document.createElement('div');
            rackModal.style.position = 'fixed';
            rackModal.style.top = '0'; rackModal.style.left = '0'; rackModal.style.width = '100vw'; rackModal.style.height = '100vh';
            rackModal.style.backgroundColor = 'rgba(0,0,0,0.6)';
            rackModal.style.zIndex = '9999999';
            rackModal.style.display = 'flex'; rackModal.style.justifyContent = 'center'; rackModal.style.alignItems = 'center';
            rackModal.style.padding = '16px';

            rackModal.innerHTML = `
                  <div style="background:var(--mcs-surface); width:100%; max-width:400px; border-radius:12px; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
                     <div style="background:var(--mcs-primary); color:#fff; padding:16px; font-weight:bold; font-size:16px;">
                       <i class="fas fa-layer-group"></i> ラック・段から一括追加 (Thêm từ Giá/Tầng)
                     </div>
                     <div style="padding:16px;">
                       <div style="margin-bottom:12px;">
                          <label style="display:block; margin-bottom:8px; font-weight:bold; font-size:13px; color:var(--mcs-text);">追加種類 (Loại vị trí):</label>
                          <div style="display:flex; gap:8px;">
                             <label style="flex:1; display:flex; align-items:center; gap:8px; padding:8px; border:1px solid var(--mcs-border); border-radius:6px; cursor:pointer;"><input type="radio" name="arl-import-type" value="rack" checked> ラック (Giá)</label>
                             <label style="flex:1; display:flex; align-items:center; gap:8px; padding:8px; border:1px solid var(--mcs-border); border-radius:6px; cursor:pointer;"><input type="radio" name="arl-import-type" value="layer"> 段 (Tầng)</label>
                          </div>
                       </div>
                       <div style="margin-bottom:16px; position:relative;">
                          <label style="display:block; margin-bottom:8px; font-weight:bold; font-size:13px; color:var(--mcs-text);">ラック・段コード (Mã Giá/Tầng):</label>
                          <input type="tel" id="arl-import-val" list="arl-import-datalist" placeholder="ここに入力... (Nhập vào đây)" autocomplete="off" style="width:100%; padding:12px; padding-right:45px; border-radius:6px; border:1px solid var(--mcs-border); font-size:16px;">
                          <button id="arl-import-kbd" tabindex="-1" style="position:absolute; right:8px; bottom:6px; background:none; border:none; color:var(--mcs-primary); font-size:20px; cursor:pointer; padding:6px;"><i class="fas fa-keyboard"></i></button>
                          <datalist id="arl-import-datalist">${rackOpts}</datalist>
                       </div>
                       <div style="display:flex; gap:8px;">
                          <button class="arl-btn" id="arl-import-cancel" style="flex:1; background:#f1f5f9; border-color:#cbd5e1; color:#333;">キャンセル (Hủy)</button>
                          <button class="arl-btn arl-btn-primary" id="arl-import-confirm" style="flex:1;">追加 (Thêm)</button>
                       </div>
                     </div>
                  </div>
                `;

            document.body.appendChild(rackModal);
            const inp = document.getElementById('arl-import-val');
            const dl = document.getElementById('arl-import-datalist');
            const kbdBtn = document.getElementById('arl-import-kbd');

            if (kbdBtn) kbdBtn.addEventListener('click', () => { inp.focus(); });

            const radios = rackModal.querySelectorAll('input[name="arl-import-type"]');
            radios.forEach(r => r.addEventListener('change', () => {
              dl.innerHTML = r.value === 'rack' ? rackOpts : layerOpts;
              inp.value = '';
              inp.focus();
            }));

            setTimeout(() => inp.focus(), 100);

            const submitImport = () => {
              const val = inp.value.trim();
              if (!val) return;
              const type = document.querySelector('input[name="arl-import-type"]:checked').value;

              let targetLayerIds = [];
              if (type === 'rack') {
                if (dm && dm.racklayers) {
                  targetLayerIds = dm.racklayers.filter(l => String(l.RackID) === val).map(l => String(l.RackLayerID));
                }
                if (targetLayerIds.length === 0) targetLayerIds = [val]; // Fallback
              } else {
                targetLayerIds = [val];
              }

              let added = 0;
              const processList = (list, kind) => {
                if (!list) return;
                list.forEach(item => {
                  const rId = String(item.RackLayerID || '');
                  if (targetLayerIds.includes(rId)) {
                    const code = kind === 'mold' ? (item.displayCode || item.MoldCode) : (item.displayCode || item.CutterCode || item.CutterNo);
                    const norm = this.normalizeCode(code);
                    if (!session.items.find(b => b.normCode === norm)) {
                      session.items.unshift({ code: code, kind: kind, item: item, checked: false, isLoggedToDb: false, normCode: norm, normId: (kind === 'mold' ? item.MoldID : item.CutterID), isManualAddition: false });
                      added++;
                    }
                  }
                });
              };

              if (dm) {
                if (this.state.searchKind === 'all' || this.state.searchKind === 'mold') processList(dm.molds, 'mold');
                if (this.state.searchKind === 'all' || this.state.searchKind === 'cutter') processList(dm.cutters, 'cutter');
              }
              if (added > 0) {
                if (window.showToast) {
                  const msgJP = `${val}から${added}件追加しました`;
                  const msgVN = `Đã thêm ${added} thiết bị từ ${type === 'rack' ? 'giá' : 'tầng'} ${val}`;
                  window.showToast('success', '', `${msgJP} (${msgVN})`);
                }
                this.saveSessions();
                renderModalContent();
              } else {
                if (window.showToast) {
                  const msgJP = `該当するデータが見つかりません`;
                  const msgVN = `Không tìm thấy thiết bị nào ở ${type === 'rack' ? 'giá' : 'tầng'} ${val}`;
                  window.showToast('warning', '', `${msgJP} (${msgVN})`);
                }
              }

              inp.value = '';
              inp.focus();
            };

            document.getElementById('arl-import-cancel').onclick = () => document.body.removeChild(rackModal);
            document.getElementById('arl-import-confirm').onclick = submitImport;
            inp.addEventListener('keydown', (e) => {
              if (e.key === 'Enter') { e.preventDefault(); submitImport(); }
            });
          });
        }

        const bInp = modal.querySelector('#arl-batch-input');
        const dd = modal.querySelector('#arl-batch-dropdown');
        const clr = modal.querySelector('#arl-batch-clear');
        const kindSelect = modal.querySelector('#arl-batch-kind-select');

        if (bInp) {
          if (kindSelect) {
            kindSelect.addEventListener('change', (e) => {
              this.state.searchKind = e.target.value;
              if (bInp.value.trim().length >= 2) {
                this.state.dropdownItems = this.searchDevices(bInp.value.trim());
                this.state.highlightIdx = this.state.dropdownItems.length > 0 ? 0 : -1;
                this.renderDropdown(dd, bInp.value.trim());
              }
            });
          }

          bInp.addEventListener('input', () => {
            const q = bInp.value.trim();
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

            if (sel && !session.items.find(b => this.normalizeCode(b.code) === sel.normCode && b.kind === sel.kind)) {
              session.items.unshift({ code: sel.code, kind: sel.kind, item: sel.item, checked: false, isLoggedToDb: false, normCode: sel.normCode, normId: sel.normId, isManualAddition: true });
              this.saveSessions();
            }
            bInp.value = ''; clr.classList.remove('visible'); dd.classList.remove('open');
            renderModalContent();

            setTimeout(() => {
              const newInp = modal.querySelector('#arl-batch-input');
              if (!newInp) return;
              if (window.innerWidth > 768) {
                newInp.focus();
              } else if (window.VirtualKeyboardModule && !newInp.readOnly) {
                window.VirtualKeyboardModule.open(newInp, { onSubmit: submitBatch });
              }
            }, 100);
          };

          bInp.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); this.state.highlightIdx = Math.min(this.state.highlightIdx + 1, this.state.dropdownItems.length - 1); this.renderDropdown(dd, bInp.value.trim()); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); this.state.highlightIdx = Math.max(this.state.highlightIdx - 1, 0); this.renderDropdown(dd, bInp.value.trim()); }
            else if (e.key === 'Enter') {
              e.preventDefault();
              submitBatch();
            }
          });

          const handleMobileKeyboardBatch = (e) => {
            if (window.innerWidth <= 768 && window.VirtualKeyboardModule && !bInp.readOnly) {
              e.preventDefault();
              bInp.blur();
              window.VirtualKeyboardModule.open(bInp, {
                onSubmit: () => submitBatch()
              });
            }
          };
          bInp.addEventListener('click', handleMobileKeyboardBatch);
          bInp.addEventListener('focus', handleMobileKeyboardBatch);

          clr.addEventListener('click', () => { bInp.value = ''; clr.classList.remove('visible'); dd.classList.remove('open'); bInp.focus(); });
          setTimeout(() => { if (window.innerWidth > 768) bInp.focus(); }, 100);
        }

        if (focusLoc) {
          setTimeout(() => {
            const group = modal.querySelector(`.arl-layer-group[data-loc-group="${focusLoc}"]`);
            if (group) {
              group.scrollIntoView({ behavior: 'smooth', block: 'start' });
              const header = group.querySelector('.arl-layer-header');
              if (header) {
                header.style.transition = 'background-color 0.3s ease';
                header.style.backgroundColor = '#e0f2fe';
                setTimeout(() => { header.style.backgroundColor = 'var(--mcs-surface)'; }, 1500);
              }
            }
            focusLoc = null;
          }, 100);
        }
      };

      document.addEventListener('mcs-arl-modal-update', renderModalContent);
      renderModalContent();
      document.body.appendChild(modal);
    },

    // ===== LOCATION MODE (PHASE 3) =====
    renderLocation(body) {
      if (!this.state.activeSessionId) {
        this.renderLocationDashboard(body);
      } else if (this.state.activeSessionId === 'BUILDER') {
        this.renderLocationBuilder(body);
      } else {
        // Hydrate locationSession if missing
        if (!this.state.locationSession) {
          const dbSess = this.state.sessions.find(s => s.id === this.state.activeSessionId);
          if (dbSess) {
            const targetLayerIds = dbSess.referenceId ? dbSess.referenceId.split(',') : [];
            const currentLayer = targetLayerIds[0] || '';

            const dm = window.DataManager?.data;
            const expected = [];
            if (dm && dm.molds) {
              dm.molds.forEach(m => {
                const rId = String(m.RackLayerID || '');
                if (targetLayerIds.includes(rId)) {
                  const mc = m.displayCode || m.MoldCode;
                  expected.push({ code: mc, kind: 'mold', item: m, normCode: this.normalizeCode(mc), normId: String(m.MoldID || '') });
                }
              });
            }
            if (dm && dm.cutters) {
              dm.cutters.forEach(c => {
                const rId = String(c.RackLayerID || '');
                if (targetLayerIds.includes(rId)) {
                  const cc = c.displayCode || c.CutterCode || c.CutterNo;
                  expected.push({ code: cc, kind: 'cutter', item: c, normCode: this.normalizeCode(cc), normId: String(c.CutterID || '') });
                }
              });
            }

            this.state.locationSession = {
              id: dbSess.id,
              targetLayers: targetLayerIds,
              currentLayer: currentLayer,
              expected: expected,
              scanned: dbSess.items.filter(i => i.scanStatus === 'MATCHED' || i.scanStatus === 'WRONG_LOCATION'),
              viewMode: 'master'
            };
          }
        }

        if (!this.state.locationSession) {
          this.state.activeSessionId = null;
          this.renderLocationDashboard(body);
          return;
        }
        if (this.state.locationSession.viewMode === 'master') {
          this.renderLocationMaster(body);
        } else {
          this.renderLocationDetail(body);
        }
      }
    },

    renderLocationDashboard(body) {
      let cardsHtml = '';
      const locSessions = this.state.sessions.filter(s => s.type === 'LOCATION_CHECK');
      if (locSessions.length === 0) {
        cardsHtml = `<div style="text-align:center; padding: 40px 20px; color: var(--mcs-text-muted);">
             <i class="fas fa-box-open" style="font-size: 40px; opacity: 0.2; margin-bottom: 16px;"></i>
             <div>セッションなし / Chưa có phiên kiểm kê nào</div>
          </div>`;
      } else {
        cardsHtml = locSessions.map(s => {
          const total = s.items.length;
          const checked = s.items.filter(i => i.checked).length;
          const pct = total === 0 ? 0 : Math.round((checked / total) * 100);
          const isDone = total > 0 && checked === total;

          let dStr = new Date(s.createdAt).toLocaleString();
          return `
              <div class="arl-session-card" data-id="${s.id}">
                  <div class="arl-session-header">
                      <div class="arl-session-title">${s.name || '棚実査'}</div>
                      <div class="arl-session-date">${dStr}</div>
                  </div>
                  <div class="arl-session-progress-wrap">
                      <div class="arl-session-progress ${isDone ? 'complete' : ''}" style="width: ${pct}%;"></div>
                  </div>
                  <div class="arl-session-meta">
                      <span>進捗: ${checked} / ${total}</span>
                      <span style="color: ${isDone ? '#16a34a' : '#ea580c'}">${isDone ? '完了 (Đã xong)' : '確認中 (Đang quét)'}</span>
                  </div>
              </div>
              `;
        }).join('');
      }

      const employees = window.DataManager?.data?.employees || [];
      const defaultEmpId = '9'; // window.app?.currentUser?.EmployeeID || '9';
      const empOptions = employees.map(e => `<option value="${e.EmployeeID}" ${String(e.EmployeeID) === String(defaultEmpId) ? 'selected' : ''}>${e.EmployeeName}</option>`).join('');

      body.innerHTML = `
        <div class="arl-hint">
          <div class="ja"><i class="fas fa-map-marker-alt"></i> 棚実査セッション / Danh sách Phiên kiểm kê giá</div>
          「＋ 新規作成」で新しい確認リストを作ります。
        </div>
        <div style="margin-top:16px; background:var(--mcs-surface); border:1px solid var(--mcs-border); padding:12px; border-radius:8px;">
           <label style="display:block; margin-bottom:8px; font-weight:bold; font-size:12px; color:var(--mcs-text);">担当者 (Nhân viên):</label>
           <select id="arl-new-loc-emp" style="width:100%; padding:10px; border-radius:6px; border:1px solid var(--mcs-border); margin-bottom:12px;">
             ${empOptions}
           </select>
           <button class="arl-btn arl-btn-primary" id="arl-new-loc-session" style="width:100%; padding:14px; font-size:14px;"><i class="fas fa-plus"></i> 新規作成 / Tạo phiên mới</button>
        </div>
        <div style="flex:1; overflow-y:auto; padding-bottom:20px; margin-top:16px;">
           ${cardsHtml}
        </div>
      `;

      document.getElementById('arl-new-loc-session')?.addEventListener('click', () => {
        const empSelect = document.getElementById('arl-new-loc-emp');
        this.state.tempLocEmpId = empSelect ? empSelect.value : defaultEmpId;
        this.state.activeSessionId = 'BUILDER';
        this.state.locTargetLayers = [];
        this.renderBody();
      });

      body.querySelectorAll('.arl-session-card').forEach(card => {
        card.addEventListener('click', () => {
          this.state.activeSessionId = card.dataset.id;
          this.renderBody();
        });
      });
    },

    renderLocationBuilder(body) {
      if (!this.state.locTargetLayers) this.state.locTargetLayers = [];

      body.innerHTML = `
           <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
              <button class="arl-btn" id="arl-loc-builder-back" style="padding:6px 12px; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; font-size:14px; flex:0 0 auto;"><i class="fas fa-arrow-left"></i> 戻る</button>
              <div style="flex:1; font-weight:bold; font-size:14px;">新規作成 / Tạo phiên kiểm kê (Giá)</div>
           </div>

           <div class="arl-hint">
             <div class="ja"><i class="fas fa-map-marker-alt"></i> 棚実査 / Kiểm kê theo giá thực tế</div>
             「＋ 追加」ボタンから、監査したいラック・段をリストに追加し、保存してください。<br>
             (ラック・段をリストに追加して保存してください - Thêm Giá/Tầng vào danh sách và nhấn Lưu)
           </div>
           
           <div style="margin-top:16px;">
               <label style="display:block; margin-bottom:8px; font-weight:bold; font-size:12px; color:var(--mcs-text);">セッション名 (Tên phiên - không bắt buộc):</label>
               <input type="text" id="arl-loc-builder-name" class="arl-search-input" placeholder="Nhập tên phiên (nếu cần)..." value="${this.state.locDraftName || ''}" style="width:100%; border-radius:6px;">
           </div>
           
           <div style="margin-top:16px;">
               <button class="arl-btn" id="arl-loc-add-btn" style="width:100%; padding:14px; background:var(--mcs-surface); border:2px dashed var(--mcs-primary); color:var(--mcs-primary); font-size:15px; font-weight:bold; border-radius:8px;">
                   <i class="fas fa-plus-circle"></i> ラック・段を追加 (Thêm Giá/Tầng)
               </button>
           </div>
           
           <!-- List of added layers -->
           <div id="arl-loc-layer-list" style="margin-top:16px; max-height:250px; overflow-y:auto; border:1px solid var(--mcs-border); border-radius:6px; background:var(--mcs-surface);">
              ${this.state.locTargetLayers.length > 0 ?
          this.state.locTargetLayers.map((layer, idx) => `
                     <div style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid #eee;">
                         <span><i class="fas fa-layer-group" style="color:var(--mcs-primary);"></i> 棚: <b>${layer}</b></span>
                         <button class="arl-loc-layer-remove" data-idx="${idx}" style="color:#ef4444; border:none; background:none; font-size:16px; cursor:pointer;"><i class="fas fa-trash"></i></button>
                     </div>
                  `).join('') : '<div style="color:var(--mcs-text-muted); font-size:12px; text-align:center; padding:20px;">リストは空です<br>(Danh sách trống)</div>'
        }
           </div>

           <div class="arl-actions" style="margin-top:20px; display:flex; gap:8px;">
               <button class="arl-btn" id="arl-loc-builder-cancel" style="flex:1; font-size:16px; padding:16px; background:#f1f5f9; border:1px solid #cbd5e1; color:#333;">キャンセル (Hủy)</button>
               <button class="arl-btn arl-btn-primary" id="arl-loc-save" style="flex:1; font-size:16px; padding:16px;" ${this.state.locTargetLayers.length === 0 ? 'disabled' : ''}><i class="fas fa-save"></i> 保存 (Lưu phiên)</button>
           </div>
         `;

      document.getElementById('arl-loc-builder-back')?.addEventListener('click', () => {
        this.state.activeSessionId = null;
        this.renderBody();
      });
      document.getElementById('arl-loc-builder-cancel')?.addEventListener('click', () => {
        this.state.activeSessionId = null;
        this.renderBody();
      });

      const nameInput = document.getElementById('arl-loc-builder-name');
      if (nameInput) nameInput.addEventListener('input', (e) => { this.state.locDraftName = e.target.value; });

      const addBtn = document.getElementById('arl-loc-add-btn');
      const startBtn = document.getElementById('arl-loc-save');

      body.querySelectorAll('.arl-loc-layer-remove').forEach(btn => btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        this.state.locTargetLayers.splice(idx, 1);
        this.renderBody();
      }));

      addBtn.addEventListener('click', () => {
        const dm = window.DataManager?.data;
        let rackOpts = '', layerOpts = '';
        if (dm && dm.racks) rackOpts = dm.racks.map(r => `<option value="${r.RackID}">${r.RackName || ''}</option>`).join('');
        if (dm && dm.racklayers) layerOpts = dm.racklayers.map(l => `<option value="${l.RackLayerID}">${l.RackLayerID}</option>`).join('');

        const rackModal = document.createElement('div');
        rackModal.style.position = 'fixed';
        rackModal.style.top = '0'; rackModal.style.left = '0'; rackModal.style.width = '100vw'; rackModal.style.height = '100vh';
        rackModal.style.backgroundColor = 'rgba(0,0,0,0.6)';
        rackModal.style.zIndex = '9999999';
        rackModal.style.display = 'flex'; rackModal.style.justifyContent = 'center'; rackModal.style.alignItems = 'center';
        rackModal.style.padding = '16px';

        rackModal.innerHTML = `
               <div style="background:var(--mcs-surface); width:100%; max-width:400px; border-radius:12px; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
                  <div style="background:var(--mcs-primary); color:#fff; padding:16px; font-weight:bold; font-size:16px;">
                    <i class="fas fa-layer-group"></i> ラック・段から一括追加 (Thêm từ Giá/Tầng)
                  </div>
                  <div style="padding:16px;">
                    <div style="margin-bottom:12px;">
                       <label style="display:block; margin-bottom:8px; font-weight:bold; font-size:13px; color:var(--mcs-text);">追加種類 (Loại vị trí):</label>
                       <div style="display:flex; gap:8px;">
                          <label style="flex:1; display:flex; align-items:center; gap:8px; padding:8px; border:1px solid var(--mcs-border); border-radius:6px; cursor:pointer;"><input type="radio" name="arl-loc-import-type" value="rack" checked> ラック (Giá)</label>
                          <label style="flex:1; display:flex; align-items:center; gap:8px; padding:8px; border:1px solid var(--mcs-border); border-radius:6px; cursor:pointer;"><input type="radio" name="arl-loc-import-type" value="layer"> 段 (Tầng)</label>
                       </div>
                    </div>
                    <div style="margin-bottom:16px; position:relative;">
                       <label style="display:block; margin-bottom:8px; font-weight:bold; font-size:13px; color:var(--mcs-text);">ラック・段コード (Mã Giá/Tầng):</label>
                       <input type="tel" id="arl-loc-import-val" list="arl-loc-import-datalist" placeholder="ここに入力... (Nhập vào đây)" autocomplete="off" style="width:100%; padding:12px; padding-right:45px; border-radius:6px; border:1px solid var(--mcs-border); font-size:16px;">
                       <button id="arl-loc-import-kbd" tabindex="-1" style="position:absolute; right:8px; bottom:6px; background:none; border:none; color:var(--mcs-primary); font-size:20px; cursor:pointer; padding:6px;"><i class="fas fa-keyboard"></i></button>
                       <datalist id="arl-loc-import-datalist">${rackOpts}</datalist>
                    </div>
                    <div style="display:flex; gap:8px;">
                       <button class="arl-btn" id="arl-loc-import-cancel" style="flex:1; background:#f1f5f9; border-color:#cbd5e1; color:#333;">閉じる (Đóng)</button>
                       <button class="arl-btn arl-btn-primary" id="arl-loc-import-confirm" style="flex:1;">追加 (Thêm)</button>
                    </div>
                  </div>
               </div>
             `;

        document.body.appendChild(rackModal);
        const inp = document.getElementById('arl-loc-import-val');
        const dl = document.getElementById('arl-loc-import-datalist');
        const kbdBtn = document.getElementById('arl-loc-import-kbd');

        if (kbdBtn) kbdBtn.addEventListener('click', () => { inp.focus(); });

        const radios = rackModal.querySelectorAll('input[name="arl-loc-import-type"]');
        radios.forEach(r => r.addEventListener('change', () => {
          dl.innerHTML = r.value === 'rack' ? rackOpts : layerOpts;
          inp.value = '';
          inp.focus();
        }));

        setTimeout(() => inp.focus(), 100);

        const submitImport = () => {
          const val = inp.value.trim().toUpperCase();
          if (!val) return;
          const type = document.querySelector('input[name="arl-loc-import-type"]:checked').value;

          let targetLayerIds = [];
          if (type === 'rack') {
            if (dm && dm.racklayers) {
              targetLayerIds = dm.racklayers.filter(l => String(l.RackID) === val).map(l => String(l.RackLayerID));
            }
            if (targetLayerIds.length === 0) targetLayerIds = [val];
          } else {
            targetLayerIds = [val];
          }

          let addedCount = 0;
          targetLayerIds.forEach(layerCode => {
            if (!this.state.locTargetLayers.includes(layerCode)) {
              this.state.locTargetLayers.push(layerCode);
              addedCount++;
            }
          });

          if (addedCount > 0) {
            if (window.showToast) {
              const msgJP = `${val}から${addedCount}段を追加しました`;
              const msgVN = `Đã thêm ${addedCount} tầng từ ${type === 'rack' ? 'giá' : 'tầng'} ${val}`;
              window.showToast('success', '', `${msgJP} (${msgVN})`);
            }
            inp.value = '';
            inp.focus();

            const listEl = document.getElementById('arl-loc-layer-list');
            if (listEl) {
              listEl.innerHTML = this.state.locTargetLayers.map((layer, idx) => `
                           <div style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid #eee;">
                               <span><i class="fas fa-layer-group" style="color:var(--mcs-primary);"></i> 棚: <b>${layer}</b></span>
                               <button class="arl-loc-layer-remove" data-idx="${idx}" style="color:#ef4444; border:none; background:none; font-size:16px; cursor:pointer;"><i class="fas fa-trash"></i></button>
                           </div>
                        `).join('');

              listEl.querySelectorAll('.arl-loc-layer-remove').forEach(btn => btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.idx, 10);
                this.state.locTargetLayers.splice(idx, 1);
                this.renderBody();
              }));
            }
            if (startBtn && this.state.locTargetLayers.length > 0) startBtn.removeAttribute('disabled');
          } else {
            if (window.showToast) {
              const msgJP = `既に追加済みか、見つかりません`;
              const msgVN = `Đã thêm trước đó hoặc không tìm thấy`;
              window.showToast('warning', '', `${msgJP} (${msgVN})`);
            }
          }
        };

        document.getElementById('arl-loc-import-cancel').onclick = () => {
          document.body.removeChild(rackModal);
        };
        document.getElementById('arl-loc-import-confirm').onclick = submitImport;
        inp.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); submitImport(); }
        });

        const handleMobileKeyboardLoc = (e) => {
          if (window.innerWidth <= 768 && window.VirtualKeyboardModule && !inp.readOnly) {
            e.preventDefault();
            inp.blur();
            window.VirtualKeyboardModule.open(inp, {
              numeric: true,
              onSubmit: () => submitImport()
            });
          }
        };
        inp.addEventListener('click', handleMobileKeyboardLoc);
        inp.addEventListener('focus', handleMobileKeyboardLoc);
      });

      const startLocSession = () => {
        if (this.state.locTargetLayers.length === 0) return;

        const dm = window.DataManager?.data;
        const targetLayerIds = this.state.locTargetLayers;

        // Tìm expected molds
        const expected = [];
        if (dm && dm.molds) {
          dm.molds.forEach(m => {
            const rId = String(m.RackLayerID || '');
            if (targetLayerIds.includes(rId)) {
              expected.push({ code: m.displayCode || m.MoldCode, kind: 'mold', item: m, normCode: this.normalizeCode(m.displayCode || m.MoldCode) });
            }
          });
        }
        if (dm && dm.cutters) {
          dm.cutters.forEach(c => {
            const rId = String(c.RackLayerID || '');
            if (targetLayerIds.includes(rId)) {
              expected.push({ code: c.displayCode || c.CutterCode || c.CutterNo, kind: 'cutter', item: c, normCode: this.normalizeCode(c.displayCode || c.CutterCode || c.CutterNo) });
            }
          });
        }

        const newId = this.generateUUID();
        const sessionNameRef = targetLayerIds.length > 3 ? `${targetLayerIds[0]}...(+${targetLayerIds.length - 1})` : targetLayerIds.join(',');

        this.state.locationSession = {
          id: newId,
          targetLayers: targetLayerIds,
          currentLayer: targetLayerIds[0],
          expected: expected,
          scanned: [],
          viewMode: 'master'
        };

        const employees = window.DataManager?.data?.employees || [];
        const empData = employees.find(e => String(e.EmployeeID) === String(this.state.tempLocEmpId));
        const empName = empData ? (empData.EmployeeNameShort || empData.EmployeeName || this.state.tempLocEmpId) : (this.state.tempLocEmpId || '9');

        let finalName = this.state.locDraftName ? this.state.locDraftName.trim() : `実査_${sessionNameRef}`;

        this.state.sessions.unshift({
          id: newId,
          createdAt: new Date().toISOString(),
          name: finalName,
          type: 'LOCATION_CHECK',
          referenceId: targetLayerIds.join(','),
          status: 'IN_PROGRESS',
          employeeId: this.state.tempLocEmpId || window.app?.currentUser?.EmployeeID || '9',
          items: expected.map(ex => ({
            line_id: this.generateUUID(),
            code: ex.code,
            kind: ex.kind,
            expectedLoc: String(ex.item.RackLayerID || ''),
            scanStatus: 'PENDING',
            isManual: false,
            checked: false,
            isLoggedToDb: false,
            normCode: ex.normCode
          }))
        });
        this.state.activeSessionId = newId;
        this.saveSessions(newId);
        this.renderBody();
        if (window.showToast) window.showToast('success', '', 'Lưu phiên thành công!');
      };

      startBtn.addEventListener('click', startLocSession);
    },

    renderLocationMaster(body) {
      const s = this.state.locationSession;

      const renderCard = (lId, idx) => {
        const expectedCount = s.expected.filter(ex => String(ex.item.RackLayerID || '') === String(lId)).length;
        const scannedCount = s.scanned.filter(sc => String(sc.actualLoc) === String(lId) && (sc.scanStatus === 'MATCHED' || sc.scanStatus === 'WRONG_LOCATION')).length;

        return `
          <div class="arl-loc-layer-card" draggable="true" data-layer="${lId}" style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:8px; display:flex; align-items:center; cursor:grab; box-shadow:0 1px 3px rgba(0,0,0,0.05); touch-action: none;">
            <div class="arl-drag-handle" style="margin-right:12px; color:#94a3b8; font-size:18px; padding:8px;"><i class="fas fa-grip-vertical"></i></div>
            <div style="flex:1;">
               <div style="font-weight:bold; font-size:15px; color:#1e293b; margin-bottom:4px;">段 (Tầng): ${lId}</div>
               <div style="font-size:12px; color:#64748b;">予定 (Dự kiến): <b>${expectedCount}</b> 件 | 読取 (Đã quét): <b>${scannedCount}</b> 件</div>
            </div>
            <button class="arl-btn-delete-layer" data-layer="${lId}" style="background:transparent; color:#ef4444; border:none; padding:8px 10px; margin-right:4px; border-radius:6px; font-size:16px; cursor:pointer; text-align:center;">
               <i class="fas fa-trash"></i>
            </button>
            <button class="arl-btn-go-layer" data-layer="${lId}" style="background:var(--mcs-primary); color:#fff; border:none; padding:8px 12px; border-radius:6px; font-weight:bold; font-size:13px; cursor:pointer; min-width:70px; text-align:center;">
               <i class="fas fa-sign-in-alt"></i> 開く
            </button>
          </div>
        `;
      };

      body.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:16px;">
           <button class="arl-btn" id="arl-loc-back-dashboard" style="padding:6px 12px; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; font-size:14px; flex:0 0 auto;"><i class="fas fa-arrow-left"></i> 戻る (Thoát)</button>
           <div style="flex:1; font-weight:bold; font-size:15px; color:var(--mcs-primary); text-align:center;">ルート順序 (Thứ tự kiểm kê)</div>
           <button class="arl-btn" id="arl-loc-master-manage" style="padding:6px 12px; background:#e0e7ff; border:1px solid #c7d2fe; color:#4f46e5; border-radius:6px; font-size:14px; flex:0 0 auto;"><i class="fas fa-plus"></i> 追加 (Thêm)</button>
        </div>

        <div style="font-size:12px; color:#64748b; margin-bottom:12px; text-align:center; background:#f8fafc; padding:8px; border-radius:6px;"><i class="fas fa-info-circle"></i> ドラッグして順序を変更できます (Kéo thả để đổi thứ tự)</div>

        <div id="arl-loc-layer-list" style="flex:1; overflow-y:auto; padding-bottom:12px;">
           ${s.targetLayers.length > 0 ? s.targetLayers.map((l, i) => renderCard(l, i)).join('') : '<div style="text-align:center; padding:20px; color:#94a3b8;">リストが空です (Danh sách trống)</div>'}
        </div>
        
        <div class="arl-actions" style="margin-top:auto; display:flex; flex-direction:column; gap:8px;">
           <button class="arl-btn arl-btn-primary" id="arl-loc-start-first" style="width:100%; padding:14px; font-size:15px; ${s.targetLayers.length === 0 ? 'opacity:0.5; pointer-events:none;' : ''}"><i class="fas fa-play"></i> 最初の段から開始 (Bắt đầu tầng đầu tiên)</button>
           <div style="display:flex; gap:8px; margin-top:4px;">
               <button class="arl-btn" id="arl-loc-session-print-master" style="flex:1; padding:12px; font-size:14px; background:#f59e0b; color:#fff; border-radius:8px; font-weight:bold;"><i class="fas fa-print"></i> 印刷 (In A4)</button>
               <button class="arl-btn" id="arl-loc-session-export-master" style="flex:1; padding:12px; font-size:14px; background:#16a34a; color:#fff; border-radius:8px; font-weight:bold;"><i class="fas fa-file-excel"></i> Excel出力</button>
               <button class="arl-btn" id="arl-loc-session-delete-master" style="flex:1; padding:12px; font-size:14px; background:transparent; border:1px solid #ef4444; color:#ef4444; border-radius:8px; font-weight:bold;"><i class="fas fa-bomb"></i> セッション削除</button>
           </div>
        </div>
      `;

      document.getElementById('arl-loc-session-print-master')?.addEventListener('click', () => {
        this.exportSessionReport(s, true);
      });
      document.getElementById('arl-loc-session-export-master')?.addEventListener('click', () => {
        this.exportSessionReport(s, false);
      });
      document.getElementById('arl-loc-session-delete-master')?.addEventListener('click', () => {
        setTimeout(() => {
          if (confirm('この実査セッションを完全に削除しますか？ (Bạn có chắc muốn xóa TOÀN BỘ phiên kiểm kê này không?)')) {
            this.state.sessions = this.state.sessions.filter(ss => ss.id !== s.id);
            this.state.activeSessionId = null;
            this.state.locationSession = null;
            this.saveSessions();
            this.renderBody();
            if (window.showToast) window.showToast('info', '', 'セッションを削除しました (Đã xóa phiên)');
          }
        }, 100);
      });

      document.getElementById('arl-loc-back-dashboard')?.addEventListener('click', () => {
        this.state.activeSessionId = null;
        this.state.locationSession = null;
        this.renderBody();
      });

      document.getElementById('arl-loc-master-manage')?.addEventListener('click', () => {
        this.renderLocationLayerManager(s);
      });

      document.getElementById('arl-loc-start-first')?.addEventListener('click', () => {
        if (s.targetLayers.length > 0) {
           s.currentLayer = s.targetLayers[0];
           s.viewMode = 'detail';
           this.renderBody();
        }
      });

      body.querySelectorAll('.arl-btn-go-layer').forEach(btn => {
        btn.addEventListener('click', (e) => {
          s.currentLayer = btn.getAttribute('data-layer');
          s.viewMode = 'detail';
          this.renderBody();
        });
      });

      body.querySelectorAll('.arl-btn-delete-layer').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const lId = btn.getAttribute('data-layer');
          if (confirm(`段: ${lId} をリストから削除しますか？ (Bạn có chắc muốn xóa Tầng: ${lId} khỏi phiên này không?)`)) {
            s.targetLayers = s.targetLayers.filter(l => l !== lId);
            const dbSess = this.state.sessions.find(db => db.id === s.id);
            if (dbSess) {
               dbSess.referenceId = s.targetLayers.join(',');
               this.saveSessions(s.id);
            }
            this.renderBody();
          }
        });
      });

      // Simple HTML5 Drag and Drop for desktop + basic touch support for mobile
      const list = document.getElementById('arl-loc-layer-list');
      if (list) {
        let dragEl = null;

        const handleDragStart = function(e) {
          dragEl = this;
          dragEl.style.opacity = '0.4';
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', this.innerHTML);
          }
        };

        const handleDragOver = function(e) {
          if (e.preventDefault) e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
          const target = e.target.closest('.arl-loc-layer-card');
          if (target && target !== dragEl) {
             const rect = target.getBoundingClientRect();
             const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
             list.insertBefore(dragEl, next ? target.nextSibling : target);
          }
          return false;
        };

        const handleDragEnd = (e) => {
          if (dragEl) dragEl.style.opacity = '1';
          const newOrder = Array.from(list.querySelectorAll('.arl-loc-layer-card')).map(c => c.getAttribute('data-layer'));
          s.targetLayers = newOrder;
          
          const dbSess = this.state.sessions.find(db => db.id === s.id);
          if (dbSess) {
             dbSess.referenceId = newOrder.join(',');
             this.saveSessions(s.id);
          }
        };

        list.querySelectorAll('.arl-loc-layer-card').forEach(card => {
          card.addEventListener('dragstart', handleDragStart, false);
          card.addEventListener('dragover', handleDragOver, false);
          card.addEventListener('dragend', handleDragEnd, false);
          
          // Touch events for mobile dragging
          card.addEventListener('touchstart', (e) => {
            if (e.target.closest('.arl-drag-handle')) {
              dragEl = card;
              dragEl.style.opacity = '0.6';
              dragEl.style.transform = 'scale(0.98)';
            }
          }, {passive: true});
          
          card.addEventListener('touchmove', (e) => {
            if (!dragEl) return;
            e.preventDefault(); // Prevent scrolling
            const touch = e.touches[0];
            const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.arl-loc-layer-card');
            if (target && target !== dragEl) {
               const rect = target.getBoundingClientRect();
               const next = (touch.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
               list.insertBefore(dragEl, next ? target.nextSibling : target);
            }
          }, {passive: false});
          
          card.addEventListener('touchend', (e) => {
            if (!dragEl) return;
            dragEl.style.opacity = '1';
            dragEl.style.transform = '';
            dragEl = null;
            handleDragEnd();
          }, {passive: true});
        });
      }
    },

    renderLocationDetail(body) {
      const s = this.state.locationSession;

      // Tính toán reconciliation CHỈ CHO TẦNG HIỆN TẠI
      const expectedForCurrent = s.expected.filter(ex => String(ex.item.RackLayerID || '') === s.currentLayer);
      const scannedForCurrent = s.scanned.filter(sc => sc.actualLoc === s.currentLayer);

      const match = [];
      const missing = [];
      const wrongLoc = [];

      expectedForCurrent.forEach(ex => {
        if (scannedForCurrent.find(sc => sc.normCode === ex.normCode)) {
          match.push(ex);
        } else {
          missing.push(ex);
        }
      });

      scannedForCurrent.forEach(sc => {
        if (!expectedForCurrent.find(ex => ex.normCode === sc.normCode)) {
          wrongLoc.push(sc);
        }
      });

      const renderItem = (item, type) => `
        <div class="arl-batch-item" style="border-left: 4px solid ${type === 'match' ? '#22c55e' : (type === 'missing' ? '#f59e0b' : '#ef4444')}; padding:8px 12px; margin-bottom:4px;">
           <div style="flex:1; display:flex; flex-direction:column;">
             <span class="arl-batch-code">${item.code}</span>
             <span class="arl-batch-type ${item.kind}" style="background:transparent; padding:0; font-size:11px;">${item.kind === 'mold' ? '金型' : '抜型'}</span>
           </div>
           ${type === 'wrongLoc' && !item.isLocUpdated ? `
               <div style="display:flex; gap:4px;">
                   <button class="arl-btn-loc-update" data-code="${item.normCode}" style="background:#ef4444; color:#fff; border:none; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;"><i class="fas fa-sync-alt"></i> 更新 (Cập nhật)</button>
                   <button class="arl-btn-loc-ignore" data-code="${item.normCode}" style="background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; padding:4px 8px; border-radius:4px; font-size:11px; cursor:pointer;"><i class="fas fa-ban"></i> 維持 (Giữ nguyên)</button>
               </div>
           ` : ''}
           ${type === 'wrongLoc' && item.isLocUpdated === 'updated' ? `<span style="color:#22c55e; font-size:11px; font-weight:bold;"><i class="fas fa-check"></i> 更新済</span>` : ''}
           ${type === 'wrongLoc' && item.isLocUpdated === 'ignored' ? `<span style="color:#64748b; font-size:11px; font-weight:bold;"><i class="fas fa-ban"></i> スキップ (Đã bỏ qua)</span>` : ''}
        </div>
      `;

      body.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
           <button class="arl-btn" id="arl-loc-back-to-master" style="padding:6px 12px; background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; font-size:14px; flex:0 0 auto;"><i class="fas fa-list"></i> 一覧へ (Danh sách)</button>
           <div style="flex:1;">
               <select id="arl-loc-layer-select" style="width:100%; padding:8px; border-radius:6px; font-weight:bold; font-size:14px; border:1px solid #cbd5e1; background:#f8fafc; color:var(--mcs-primary);">
                   ${s.targetLayers.map((l, idx) => `<option value="${l}" ${s.currentLayer === l ? 'selected' : ''}>段 (Tầng): ${l} (${idx + 1}/${s.targetLayers.length})</option>`).join('')}
               </select>
           </div>
        </div>
        
        <div class="arl-stats" style="margin-bottom:12px;">
            <div class="arl-stat"><div class="arl-stat-num" style="color:#22c55e">${match.length}</div><div class="arl-stat-label">一致 (Khớp)</div></div>
            <div class="arl-stat"><div class="arl-stat-num" style="color:#f59e0b">${missing.length}</div><div class="arl-stat-label">不足 (Thiếu)</div></div>
            <div class="arl-stat"><div class="arl-stat-num" style="color:#ef4444">${wrongLoc.length}</div><div class="arl-stat-label">誤配置 (Lạc chỗ)</div></div>
        </div>
        
        <div style="flex:1; overflow-y:auto; padding-bottom:12px; display:flex; flex-direction:column; gap:16px;">
            ${wrongLoc.length > 0 ? `<div><div style="font-size:12px; font-weight:bold; color:#ef4444; margin-bottom:4px;"><i class="fas fa-exclamation-triangle"></i> 誤配置 (Lạc chỗ)</div>${wrongLoc.map(i => renderItem(i, 'wrongLoc')).join('')}</div>` : ''}
            ${missing.length > 0 ? `<div><div style="font-size:12px; font-weight:bold; color:#f59e0b; margin-bottom:4px;"><i class="fas fa-question-circle"></i> 不足 (Thiếu trên giá)</div>${missing.map(i => renderItem(i, 'missing')).join('')}</div>` : ''}
            ${match.length > 0 ? `<div><div style="font-size:12px; font-weight:bold; color:#22c55e; margin-bottom:4px;"><i class="fas fa-check-circle"></i> 一致 (Khớp vị trí)</div>${match.map(i => renderItem(i, 'match')).join('')}</div>` : ''}
            ${scannedForCurrent.length === 0 && expectedForCurrent.length === 0 ? `<div style="text-align:center; padding:20px; color:#aaa; font-size:12px;">データがありません / Chưa có dữ liệu</div>` : ''}
        </div>
        
        <div class="arl-actions" style="margin-top:auto; display:flex; flex-direction:column; gap:8px;">
           <div style="display:flex; gap:8px;">
               <button class="arl-btn arl-btn-secondary" id="arl-loc-next" style="flex:1; padding:14px;"><i class="fas fa-step-forward"></i> 次の段へ (Tầng tiếp)</button>
               <button class="arl-btn arl-btn-primary" id="arl-loc-scan" style="flex:1; padding:14px;"><i class="fas fa-camera"></i> この段をスキャン (Quét tầng này)</button>
           </div>
           <div style="display:flex; gap:8px; margin-top:8px;">
               <button class="arl-btn" id="arl-loc-session-print" style="flex:1; padding:12px; font-size:14px; background:#f59e0b; color:#fff; border-radius:8px; font-weight:bold;"><i class="fas fa-print"></i> 印刷 (In A4)</button>
               <button class="arl-btn" id="arl-loc-session-export" style="flex:1; padding:12px; font-size:14px; background:#16a34a; color:#fff; border-radius:8px; font-weight:bold;"><i class="fas fa-file-excel"></i> Excel出力</button>
               <button class="arl-btn" id="arl-loc-session-delete" style="flex:1; padding:12px; font-size:14px; background:transparent; border:1px solid #ef4444; color:#ef4444; border-radius:8px; font-weight:bold;"><i class="fas fa-bomb"></i> セッション削除</button>
           </div>
        </div>
      `;

      document.getElementById('arl-loc-layer-select')?.addEventListener('change', (e) => {
        s.currentLayer = e.target.value;
        this.renderBody();
      });

      document.getElementById('arl-loc-next')?.addEventListener('click', () => {
        const idx = s.targetLayers.indexOf(s.currentLayer);
        if (idx < s.targetLayers.length - 1) {
          s.currentLayer = s.targetLayers[idx + 1];
          this.renderBody();
        } else {
          if (window.showToast) window.showToast('success', '', 'リストの最後の段に到達しました！ (Đã đến tầng cuối cùng trong danh sách!)');
          s.viewMode = 'master';
          this.renderBody();
        }
      });

      document.getElementById('arl-loc-back-to-master')?.addEventListener('click', () => {
        s.viewMode = 'master';
        this.renderBody();
      });

      document.getElementById('arl-loc-session-print')?.addEventListener('click', () => {
        this.exportSessionReport(s, true);
      });
      document.getElementById('arl-loc-session-export')?.addEventListener('click', () => {
        this.exportSessionReport(s, false);
      });

      document.getElementById('arl-loc-session-delete')?.addEventListener('click', () => {
        setTimeout(() => {
          if (confirm('現在のセッションをすべて削除します。よろしいですか？ / Hành động này sẽ XÓA TOÀN BỘ PHIÊN LÀM VIỆC hiện tại. Bạn có chắc chắn?')) {
            const currentId = s.id;
            this.state.sessions = this.state.sessions.filter(sess => sess.id !== currentId);
            this.state.activeSessionId = null;
            this.state.locationSession = null;

            const sb = this.getSupabaseClient();
            if (sb) {
              sb.from('inventory_sessions').delete().eq('session_id', currentId).then(() => { });
            }
            this.saveSessionsLocalOnly();
            this.renderBody();
            if (window.showToast) window.showToast('success', '', 'セッションを削除しました (Đã xóa phiên làm việc)');
          }
        }, 50);
      });

      document.getElementById('arl-loc-scan')?.addEventListener('click', () => {
        const mappedTargets = expectedForCurrent.map(ex => ({
          code: ex.code,
          kind: ex.kind,
          item: ex.item,
          normCode: ex.normCode,
          normId: ex.normId || String((ex.kind === 'mold' ? (ex.item && ex.item.MoldID) : (ex.item && ex.item.CutterID)) || ''),
          checked: scannedForCurrent.some(sc => sc.normCode === ex.normCode)
        }));
        this.openCamera(mappedTargets);
      });

      body.querySelectorAll('.arl-btn-loc-update').forEach(btn => btn.addEventListener('click', () => {
        const normCode = btn.dataset.code;
        const scItem = scannedForCurrent.find(x => x.normCode === normCode);
        if (scItem && scItem.item) {
          const isMold = scItem.kind === 'mold';
          const idVal = isMold ? (scItem.item.MoldID || scItem.item.MoldCode) : (scItem.item.CutterID || scItem.item.CutterNo);
          if (window.showToast) window.showToast('info', '', 'Đang cập nhật vị trí...');

          const employeeId = (window.app && window.app.currentUser && window.app.currentUser.EmployeeID) ? window.app.currentUser.EmployeeID : '9';

          if (window.LocationMove && window.LocationMove.apiMoveRackLayer) {
            window.LocationMove.apiMoveRackLayer(scItem.item, s.currentLayer, employeeId, 'Update from AR Locator')
              .then(() => {
                scItem.isLocUpdated = 'updated';
                this.renderBody();
                if (window.showToast) window.showToast('success', '', `Đã cập nhật vị trí ${scItem.code} về ${s.currentLayer}`);
              });
          } else {
            document.dispatchEvent(new CustomEvent('mcs-data-sync', { detail: { idValue: idVal, payload: { RackLayerID: parseInt(s.currentLayer, 10), Location: s.currentLayer } } }));
            scItem.isLocUpdated = 'updated';
            this.renderBody();
            if (window.showToast) window.showToast('success', '', `Đã cập nhật vị trí ${scItem.code} về ${s.currentLayer}`);
          }
        }
      }));

      body.querySelectorAll('.arl-btn-loc-ignore').forEach(btn => btn.addEventListener('click', () => {
        const normCode = btn.dataset.code;
        const scItem = scannedForCurrent.find(x => x.normCode === normCode);
        if (scItem) {
          scItem.isLocUpdated = 'ignored';
          this.renderBody();
          if (window.showToast) window.showToast('info', '', `Đã giữ nguyên dữ liệu gốc cho ${scItem.code}`);
        }
      }));
    },

    renderLocationLayerManager(locSession) {
      const dbSess = this.state.sessions.find(s => s.id === locSession.id);
      if (!dbSess) return;

      const dm = window.DataManager?.data;

      const modal = document.createElement('div');
      modal.style.position = 'fixed';
      modal.style.top = '0'; modal.style.left = '0'; modal.style.width = '100vw'; modal.style.height = '100vh';
      modal.style.backgroundColor = 'rgba(0,0,0,0.6)';
      modal.style.zIndex = '9999999';
      modal.style.display = 'flex'; modal.style.justifyContent = 'center'; modal.style.alignItems = 'center';
      modal.style.padding = '16px';

      const renderModal = () => {
        const listHtml = locSession.targetLayers.map((l, idx) => `
                 <div style="display:flex; justify-content:space-between; padding:12px; border-bottom:1px solid #eee;">
                     <span><i class="fas fa-layer-group" style="color:var(--mcs-primary);"></i> 棚: <b>${l}</b></span>
                     <button class="arl-loc-layer-remove-edit" data-idx="${idx}" data-layer="${l}" style="color:#ef4444; border:none; background:none; font-size:16px; cursor:pointer;"><i class="fas fa-trash"></i></button>
                 </div>
             `).join('');

        modal.innerHTML = `
               <div style="background:var(--mcs-surface); width:100%; max-width:500px; border-radius:12px; overflow:hidden; display:flex; flex-direction:column; max-height:80vh; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
                  <div style="background:var(--mcs-primary); color:#fff; padding:16px; font-weight:bold; font-size:16px; display:flex; justify-content:space-between; align-items:center;">
                    <div><i class="fas fa-layer-group"></i> 棚の管理 (Quản lý Tầng/Giá)</div>
                    <button id="arl-loc-lm-close" style="background:none; border:none; color:#fff; font-size:18px; cursor:pointer;"><i class="fas fa-times"></i></button>
                  </div>
                  
                  <div style="padding:16px; border-bottom:1px solid #eee;">
                     <button class="arl-btn" id="arl-loc-lm-add" style="width:100%; padding:12px; background:#f8fafc; border:2px dashed var(--mcs-primary); color:var(--mcs-primary); font-weight:bold; border-radius:8px;">
                        <i class="fas fa-plus-circle"></i> 追加 (Thêm Tầng/Giá)
                     </button>
                  </div>
                  
                  <div style="flex:1; overflow-y:auto; padding:16px; background:#f8fafc;">
                     ${listHtml || '<div style="text-align:center; color:#aaa; padding:20px;">リストは空です (Danh sách trống)</div>'}
                  </div>
               </div>
             `;

        modal.querySelector('#arl-loc-lm-close').onclick = () => {
          document.body.removeChild(modal);
          this.saveSessions(dbSess.id);
          if (locSession.targetLayers.length > 0 && !locSession.targetLayers.includes(locSession.currentLayer)) {
            locSession.currentLayer = locSession.targetLayers[0];
          } else if (locSession.targetLayers.length === 0) {
            locSession.currentLayer = '';
          }
          this.renderBody();
        };

        modal.querySelectorAll('.arl-loc-layer-remove-edit').forEach(btn => btn.onclick = (e) => {
          const layerCode = btn.dataset.layer;
          if (confirm(`この監査セッションから段 (Tầng) ${layerCode} を削除してもよろしいですか？\n(Bạn có chắc muốn XÓA tầng ${layerCode} khỏi phiên kiểm kê này?)`)) {
            locSession.targetLayers = locSession.targetLayers.filter(l => l !== layerCode);
            dbSess.referenceId = locSession.targetLayers.join(',');
            locSession.expected = locSession.expected.filter(ex => String(ex.item.RackLayerID || '') !== layerCode);
            locSession.scanned = locSession.scanned.filter(i => i.expectedLoc !== layerCode);
            dbSess.items = dbSess.items.filter(i => i.expectedLoc !== layerCode);
            renderModal();
          }
        });

        modal.querySelector('#arl-loc-lm-add').onclick = () => {
          let rackOpts = '', layerOpts = '';
          if (dm && dm.racks) rackOpts = dm.racks.map(r => `<option value="${r.RackID}">${r.RackName || ''}</option>`).join('');
          if (dm && dm.racklayers) layerOpts = dm.racklayers.map(l => `<option value="${l.RackLayerID}">${l.RackLayerID}</option>`).join('');

          const rackModal = document.createElement('div');
          rackModal.style.position = 'fixed';
          rackModal.style.top = '0'; rackModal.style.left = '0'; rackModal.style.width = '100vw'; rackModal.style.height = '100vh';
          rackModal.style.backgroundColor = 'rgba(0,0,0,0.7)';
          rackModal.style.zIndex = '99999999';
          rackModal.style.display = 'flex'; rackModal.style.justifyContent = 'center'; rackModal.style.alignItems = 'center';
          rackModal.style.padding = '16px';

          rackModal.innerHTML = `
                   <div style="background:var(--mcs-surface); width:100%; max-width:400px; border-radius:12px; overflow:hidden; box-shadow:0 10px 25px rgba(0,0,0,0.2);">
                      <div style="background:var(--mcs-primary); color:#fff; padding:16px; font-weight:bold; font-size:16px;">
                        <i class="fas fa-plus"></i> 追加 (Thêm)
                      </div>
                      <div style="padding:16px;">
                        <div style="margin-bottom:12px;">
                           <label style="display:block; margin-bottom:8px; font-weight:bold; font-size:13px; color:var(--mcs-text);">追加種類 (Loại):</label>
                           <div style="display:flex; gap:8px;">
                              <label style="flex:1; display:flex; align-items:center; gap:8px; padding:8px; border:1px solid var(--mcs-border); border-radius:6px; cursor:pointer;"><input type="radio" name="arl-lm-import-type" value="rack" checked> ラック (Giá)</label>
                              <label style="flex:1; display:flex; align-items:center; gap:8px; padding:8px; border:1px solid var(--mcs-border); border-radius:6px; cursor:pointer;"><input type="radio" name="arl-lm-import-type" value="layer"> 段 (Tầng)</label>
                           </div>
                        </div>
                        <div style="margin-bottom:16px; position:relative;">
                           <label style="display:block; margin-bottom:8px; font-weight:bold; font-size:13px; color:var(--mcs-text);">ラック・段コード (Mã Giá/Tầng):</label>
                           <input type="tel" id="arl-lm-import-val" list="arl-lm-import-datalist" autocomplete="off" style="width:100%; padding:12px; padding-right:45px; border-radius:6px; border:1px solid var(--mcs-border); font-size:16px;">
                           <button id="arl-lm-import-kbd" tabindex="-1" style="position:absolute; right:8px; bottom:6px; background:none; border:none; color:var(--mcs-primary); font-size:20px; cursor:pointer; padding:6px;"><i class="fas fa-keyboard"></i></button>
                           <datalist id="arl-lm-import-datalist">${rackOpts}</datalist>
                        </div>
                        <div style="display:flex; gap:8px;">
                           <button class="arl-btn" id="arl-lm-import-cancel" style="flex:1; background:#f1f5f9; border-color:#cbd5e1;">キャンセル (Hủy)</button>
                           <button class="arl-btn arl-btn-primary" id="arl-lm-import-confirm" style="flex:1;">追加 (Thêm)</button>
                        </div>
                      </div>
                   </div>
                 `;

          document.body.appendChild(rackModal);
          const inp = document.getElementById('arl-lm-import-val');
          const dl = document.getElementById('arl-lm-import-datalist');
          const kbdBtn = document.getElementById('arl-lm-import-kbd');
          if (kbdBtn) kbdBtn.onclick = () => inp.focus();

          rackModal.querySelectorAll('input[name="arl-lm-import-type"]').forEach(r => r.onchange = () => {
            dl.innerHTML = r.value === 'rack' ? rackOpts : layerOpts;
            inp.value = '';
            inp.focus();
          });

          setTimeout(() => inp.focus(), 100);

          rackModal.querySelector('#arl-lm-import-cancel').onclick = () => document.body.removeChild(rackModal);

          rackModal.querySelector('#arl-lm-import-confirm').onclick = () => {
            const val = inp.value.trim().toUpperCase();
            if (!val) return;
            const type = document.querySelector('input[name="arl-lm-import-type"]:checked').value;

            let newLayers = [];
            if (type === 'rack') {
              if (dm && dm.racklayers) newLayers = dm.racklayers.filter(l => String(l.RackID) === val).map(l => String(l.RackLayerID));
              if (newLayers.length === 0) newLayers = [val];
            } else {
              newLayers = [val];
            }

            let addedCount = 0;
            newLayers.forEach(layerCode => {
              if (!locSession.targetLayers.includes(layerCode)) {
                locSession.targetLayers.push(layerCode);

                if (dm && dm.molds) dm.molds.forEach(m => {
                  if (String(m.RackLayerID || '') === layerCode) {
                    const mCode = m.displayCode || m.MoldCode;
                    const mNorm = this.normalizeCode(mCode);
                    const mNormId = String(m.MoldID || '');
                    locSession.expected.push({ code: mCode, kind: 'mold', item: m, normCode: mNorm, normId: mNormId });
                    dbSess.items.push({
                      line_id: this.generateUUID(),
                      code: mCode,
                      kind: 'mold',
                      expectedLoc: layerCode,
                      scanStatus: 'PENDING',
                      isManual: false,
                      checked: false,
                      isLoggedToDb: false,
                      normCode: mNorm,
                      normId: mNormId
                    });
                  }
                });
                if (dm && dm.cutters) dm.cutters.forEach(c => {
                  if (String(c.RackLayerID || '') === layerCode) {
                    const cCode = c.displayCode || c.CutterCode || c.CutterNo;
                    const cNorm = this.normalizeCode(cCode);
                    const cNormId = String(c.CutterID || '');
                    locSession.expected.push({ code: cCode, kind: 'cutter', item: c, normCode: cNorm, normId: cNormId });
                    dbSess.items.push({
                      line_id: this.generateUUID(),
                      code: cCode,
                      kind: 'cutter',
                      expectedLoc: layerCode,
                      scanStatus: 'PENDING',
                      isManual: false,
                      checked: false,
                      isLoggedToDb: false,
                      normCode: cNorm,
                      normId: cNormId
                    });
                  }
                });
                addedCount++;
              }
            });

            if (addedCount > 0) {
              dbSess.referenceId = locSession.targetLayers.join(',');
              if (window.showToast) window.showToast('success', '', `セッションに ${addedCount} 段 (tầng) を追加しました！ (Đã thêm ${addedCount} tầng vào phiên!)`);
            } else {
              if (window.showToast) window.showToast('info', '', 'これらの段は既にリストに存在します。(Các tầng này đã có sẵn trong danh sách.)');
            }

            document.body.removeChild(rackModal);
            renderModal();
          };
        };
      };

      renderModal();
      document.body.appendChild(modal);
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
            this.state.singleTarget = { code: sel.code, kind: sel.kind, item: sel.item, normCode: sel.normCode, normId: sel.normId, isLoggedToDb: false };
            dd.classList.remove('open');
            this.renderBody();
          } else if (this.state.mode === 'multi_search') {
            if (!this.state.searchList) this.state.searchList = [];
            if (!this.state.searchList.find(t => t.normCode === sel.normCode)) {
              this.state.searchList.push({ code: sel.code, kind: sel.kind, item: sel.item, normCode: sel.normCode, normId: sel.normId });
            }
            const inp = document.getElementById('arl-ms-input');
            if (inp) inp.value = '';
            dd.classList.remove('open');
            this.renderBody();
            setTimeout(() => document.getElementById('arl-ms-input')?.focus(), 50);
          } else {
            const session = this.state.activeSessionId ? this.state.sessions.find(s => s.id === this.state.activeSessionId) : null;
            if (session) {
              if (!session.items.find(b => this.normalizeCode(b.code) === sel.normCode && b.kind === sel.kind)) {
                session.items.unshift({ code: sel.code, kind: sel.kind, item: sel.item, checked: false, isLoggedToDb: false, normCode: sel.normCode, normId: sel.normId, isManualAddition: true });
                this.saveSessions();
              }
            }
            const inp = document.getElementById('arl-batch-input');
            if (inp) inp.value = '';
            dd.classList.remove('open');
            this.renderBody();
            if (document.getElementById('arl-list-manager-modal')) {
              document.dispatchEvent(new CustomEvent('mcs-arl-modal-update'));
            }
            setTimeout(() => document.getElementById('arl-batch-input')?.focus(), 50);
          }
        });
      });
    },

    // ===== CAMERA AR =====
    initAudio() {
      if (this.state.audioCtx) return;
      try { this.state.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { }
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
      } catch (e) { }
    },

    openCamera(targets) {
      this.initAudio();
      let camRoot = document.getElementById('arl-camera-root');
      if (!camRoot) { camRoot = document.createElement('div'); camRoot.id = 'arl-camera-root'; document.body.appendChild(camRoot); }

      let targetInfo = '';
      let miniListHtml = '';
      if (this.state.mode === 'single') {
        targetInfo = `探索対象: ${targets[0].code}`;
      } else if (this.state.mode === 'multi_search') {
        targetInfo = `複数検索: ${targets.length}件`;
      } else if (this.state.mode === 'batch') {
        const uncheckedTargets = targets.filter(t => !t.checked);
        targetInfo = uncheckedTargets.length > 0 ? `${uncheckedTargets.length} 件未確認` : '全QRコードをスキャン';
        if (uncheckedTargets.length > 0) {
          const itemsHtml = uncheckedTargets.map(t => `<div class="arl-mini-item" id="mini-${t.normCode}"><span>${t.code}</span></div>`).join('');
          miniListHtml = `<div class="arl-camera-minilist" id="arl-cam-minilist">${itemsHtml}</div>`;
        }
      } else {
        // Location mode
        targetInfo = `位置: ${this.state.locationSession ? (this.state.locationSession.currentLayer || '') : ''}`;
        if (targets.length > 0) {
          const uncheckedLoc = targets.filter(t => !t.checked);
          if (uncheckedLoc.length > 0) {
            const itemsHtml = uncheckedLoc.map(t => `<div class="arl-mini-item" id="mini-${t.normCode}"><span>${t.code}</span></div>`).join('');
            miniListHtml = `<div class="arl-camera-minilist" id="arl-cam-minilist">${itemsHtml}</div>`;
          }
        }
      }

      camRoot.innerHTML = `
        <div class="arl-camera-overlay open" id="arl-camera-overlay">
          <div class="arl-camera-topbar">
            <button class="arl-camera-close" id="arl-cam-close">&times;</button>
            <div style="display:flex; flex-direction:column; line-height:1.2;">
               <span class="arl-camera-title" style="font-size:15px;">ARスキャン</span>
               <span style="font-size:10px; color:#aaa;">v1.3.0</span>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <select id="arl-camera-select" style="max-width:110px; font-size:12px; padding:4px; border-radius:4px; display:none;"></select>
              <button id="arl-cam-engine" style="border:1px solid #3b82f6; background:#eff6ff; color:#2563eb; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer;" title="Chuyển đổi chế độ quét"><i class="fas fa-bolt"></i> <span id="arl-cam-engine-lbl">${this.state.scanEngine === 'single' ? 'Quét Đơn' : 'Quét Đa'}</span></button>
              <button id="arl-cam-swap" style="border:1px solid #ccc; background:#f5f5f5; padding:4px 10px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer;">切替</button>
              <button id="arl-cam-pause" style="background:#f59e0b; color:#fff; border:none; padding:4px 10px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer;"><i class="fas fa-pause"></i> 一時停止 (Tạm dừng / Xem kết quả)</button>
            </div>
          </div>
          <div style="background:rgba(0,0,0,0.5); padding:4px 10px; text-align:center;">
             <span class="arl-camera-target-badge" id="arl-cam-badge" style="${this.state.mode === 'single' ? 'background:rgba(13,109,110,0.5)' : ''}">${targetInfo}</span>
          </div>
          <div class="arl-camera-canvas-wrap">
            ${miniListHtml}
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
      this.state.completedLayers = new Set(); // Reset completed layers tracking

      document.getElementById('arl-cam-close').addEventListener('click', () => this.closeCamera());
      document.getElementById('arl-cam-swap').addEventListener('click', () => this.toggleCamera());
      
      const btnEngine = document.getElementById('arl-cam-engine');
      if (btnEngine) {
        btnEngine.addEventListener('click', () => {
          this.state.scanEngine = this.state.scanEngine === 'single' ? 'multi' : 'single';
          localStorage.setItem('mcs_arl_engine', this.state.scanEngine);
          document.getElementById('arl-cam-engine-lbl').textContent = this.state.scanEngine === 'single' ? 'Quét Đơn' : 'Quét Đa';
          if (window.showToast) window.showToast('info', '', 'Đã chuyển sang chế độ: ' + (this.state.scanEngine === 'single' ? 'Quét Đơn lẻ (Siêu tốc)' : 'Quét Đa (Nhiều mã)'));
        });
      }

      document.getElementById('arl-cam-pause')?.addEventListener('click', () => {
        if (confirm('カメラを一時停止して結果に戻りますか？ / Tạm dừng và quay lại xem kết quả?')) {
          this.closeCamera();
        }
      });
      document.getElementById('arl-camera-select').addEventListener('change', (e) => {
        const newCam = e.target.value;
        if (newCam) this.startCamera(newCam);
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
        // Placeholder initialization
        if (!this.state.cameras) this.state.cameras = [];
        if (!this.state.cameras.length) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          this.state.cameras = devices.filter(d => d.kind === 'videoinput');
        }

        const constraints = {
          video: deviceId ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, advanced: [{ focusMode: 'continuous' }] } : (isRetry ? true : { facingMode: this.state.facingMode, width: { ideal: 1280 }, height: { ideal: 720 }, advanced: [{ focusMode: 'continuous' }] }),
          audio: false
        };
        this.state.stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.state.video.srcObject = this.state.stream;

        const track = this.state.stream.getVideoTracks()[0];
        if (track) {
          this.state.currentCameraId = track.getSettings().deviceId;
        }

        // Re-enumerate after stream started to get full labels & all cameras
        const updatedDevices = await navigator.mediaDevices.enumerateDevices();
        this.state.cameras = updatedDevices.filter(d => d.kind === 'videoinput');
        const sel = document.getElementById('arl-camera-select');
        if (sel) {
          sel.innerHTML = '';
          this.state.cameras.forEach((cam, i) => {
            const opt = document.createElement('option');
            opt.value = cam.deviceId;
            opt.textContent = cam.label || `カメラ ${i + 1}`;
            sel.appendChild(opt);
          });
          if (this.state.currentCameraId) sel.value = this.state.currentCameraId;
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

        let hits = [];
        if (this.state.scanEngine === 'single' && typeof window.jsQR === 'function') {
          const imgData = this.state.ctx.getImageData(0, 0, cw, ch);
          const code = window.jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
          if (code) hits.push(code);
        } else if (window.MCSMultiQRScanner) {
          hits = window.MCSMultiQRScanner.scanRegions(this.state.canvas, this.state.ctx);
        } else if (typeof window.jsQR === 'function') {
          const imgData = this.state.ctx.getImageData(0, 0, cw, ch);
          const code = window.jsQR(imgData.data, imgData.width, imgData.height, { inversionAttempts: 'dontInvert' });
          if (code) hits.push(code);
        }

        if (hits && hits.length) {
          for (let hit of hits) {
            if (this.state.scanning) {
              this.handleCamQR(hit);
            }
          }
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
      const isMatchFound = (target, qrNorm, qrKind) => {
        if (!qrNorm) return false;
        if (qrKind && target.kind && target.kind !== qrKind) return false; // Match kind if provided

        const targetNorm = String(target.normCode || '');
        const targetId = String(target.normId || '');

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

      if (this.state.mode === 'single') {
        if (targets.length > 0 && isMatchFound(targets[0], parsedNorm, parsed?.kind)) {
          isMatch = true;
          displayCode = targets[0].code;
        }
      } else if (this.state.mode === 'multi_search') {
        let foundTarget = null;
        for (const t of targets) {
          if (isMatchFound(t, parsedNorm, parsed?.kind)) {
            isMatch = true;
            displayCode = t.code;
            foundTarget = t;
            break;
          }
        }
        if (isMatch && foundTarget) {
          this.beep();
          this.state.scanning = false;

          // Vẽ khung xanh
          const pad = 20;
          const bw = (loc.bottomRightCorner.x - loc.topLeftCorner.x) + pad * 2;
          const bh = (loc.bottomRightCorner.y - loc.topLeftCorner.y) + pad * 2;
          const bx = loc.topLeftCorner.x - pad;
          const by = loc.topLeftCorner.y - pad;
          ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 4;
          ctx.strokeRect(bx, by, bw, bh);
          ctx.font = 'bold 24px Arial'; ctx.fillStyle = '#22c55e';
          ctx.shadowColor = 'black'; ctx.shadowBlur = 6;
          ctx.fillText('✓ ' + displayCode, bx, by - 10);
          ctx.shadowBlur = 0;

          const sysLayer = foundTarget.item.RackLayerID || 'N/A';

          // Tạo overlay kết quả trực tiếp (position:fixed để luôn hiển thị)
          const msOverlay = document.createElement('div');
          msOverlay.style.cssText = 'position:fixed; inset:0; z-index:999999; background:rgba(0,0,0,0.92); display:flex; flex-direction:column; justify-content:center; align-items:center; color:#fff; text-align:center; padding:20px;';
          msOverlay.innerHTML = `
            <div style="font-size:56px; margin-bottom:16px; color:#22c55e;"><i class="fas fa-check-circle"></i></div>
            <h2 style="margin:0 0 8px 0; font-size:22px;">発見 (Đã tìm thấy)</h2>
            <p style="font-size:20px; font-weight:bold; color:#facc15; margin-bottom:8px;">${displayCode}</p>
            <p style="font-size:13px; color:#94a3b8; margin-bottom:28px;">システム位置 (DB): <b style="color:#fff;">${sysLayer}</b></p>
            <div style="display:flex; gap:16px; width:100%; max-width:340px;">
              <button id="ms-overlay-continue" style="flex:1; padding:16px; font-size:16px; font-weight:bold; border-radius:10px; border:none; background:#22c55e; color:#fff; cursor:pointer;"><i class="fas fa-play"></i> 続行 (Tiếp)</button>
              <button id="ms-overlay-done" style="flex:1; padding:16px; font-size:16px; font-weight:bold; border-radius:10px; border:none; background:#ef4444; color:#fff; cursor:pointer;"><i class="fas fa-check"></i> 完了 (Xong)</button>
            </div>
          `;
          document.body.appendChild(msOverlay);

          const resumeScan = () => {
            if (msOverlay.parentNode) document.body.removeChild(msOverlay);
            this.state.scanning = true;
            requestAnimationFrame(() => this.camTick());
          };

          document.getElementById('ms-overlay-continue').onclick = () => resumeScan();
          document.getElementById('ms-overlay-done').onclick = () => {
            this.state.searchList = this.state.searchList.filter(t => t.normCode !== foundTarget.normCode);
            if (msOverlay.parentNode) document.body.removeChild(msOverlay);
            if (this.state.searchList.length === 0) {
              if (window.showToast) window.showToast('success', '完了', 'Đã tìm xong toàn bộ danh sách!');
              this.closeCamera();
            } else {
              this.state.scanning = true;
              requestAnimationFrame(() => this.camTick());
            }
          };
          return;
        }
      } else if (this.state.mode === 'location') {
        // Location Mode: Free scan
        const s = this.state.locationSession;
        if (s) {
          const locCurrentLayer = s.currentLayer || '';

          // Trước tiên, thử match với danh sách target trước (nếu có)
          let foundItem = null;
          if (targets.length > 0) {
            const matchedTarget = targets.find(t => !t.checked && isMatchFound(t, parsedNorm, parsed?.kind));
            if (matchedTarget) {
              foundItem = { code: matchedTarget.code, kind: matchedTarget.kind, item: matchedTarget.item, normCode: matchedTarget.normCode, normId: matchedTarget.normId };
              matchedTarget.checked = true;
              // Cập nhật mini-list
              const miniItem = document.getElementById('mini-' + matchedTarget.normCode);
              if (miniItem) miniItem.classList.add('checked');
              const unconfirmed = targets.filter(t => !t.checked).length;
              const badge = document.getElementById('arl-cam-badge');
              if (badge) badge.innerText = unconfirmed > 0 ? `${unconfirmed} 件未確認` : '完了 (Đã xong toàn bộ)';
            }
          }

          // Fallback: tìm trong DataManager nếu không match target list
          if (!foundItem) {
            const devices = this.searchDevices(parsedNorm);
            if (devices.length > 0) {
              foundItem = devices.find(d => d.normCode === parsedNorm) || devices[0];
            }
          }

          if (foundItem) {
            isMatch = true;
            displayCode = foundItem.code;

            // Chỉ thêm nếu chưa có
            if (!s.scanned.find(sc => sc.normCode === foundItem.normCode)) {
              // Thêm actualLoc vào kết quả quét
              const scannedEntry = Object.assign({}, foundItem, { actualLoc: locCurrentLayer });
              s.scanned.unshift(scannedEntry);

              const dbSess = this.state.sessions.find(x => x.id === s.id);
              if (dbSess) {
                let line = dbSess.items.find(i => i.normCode === foundItem.normCode);
                const isExpected = s.expected.some(e => e.normCode === foundItem.normCode);
                if (line) {
                  line.scanStatus = isExpected ? 'MATCHED' : 'WRONG_LOCATION';
                  line.actualLoc = locCurrentLayer;
                  line.scannedAt = new Date().toISOString();
                  line.checked = true;
                } else {
                  dbSess.items.unshift({
                    line_id: this.generateUUID(),
                    code: foundItem.code,
                    kind: foundItem.kind,
                    expectedLoc: (foundItem.item && (foundItem.item.RackLayerID || foundItem.item.Location)) || '',
                    actualLoc: locCurrentLayer,
                    scanStatus: isExpected ? 'MATCHED' : 'WRONG_LOCATION',
                    isManual: false,
                    scannedAt: new Date().toISOString(),
                    checked: true,
                    isLoggedToDb: false,
                    normCode: foundItem.normCode,
                    normId: foundItem.normId || ''
                  });
                }
                this.saveSessions(s.id);
              }

              if (Date.now() - this.state.lastBeepTime > 1000) {
                this.beep();
                if (window.showToast) window.showToast('info', '', `✓ ${displayCode}`);
              }
            } else {
              // Đã quét rồi
              isMatch = true;
            }
          }
        }
      } else {
        // Batch Mode
        // Bỏ qua nếu mã này đã quét rồi (tránh báo match liên tục)
        const alreadyDone = targets.find(t => t.checked && isMatchFound(t, parsedNorm, parsed?.kind));
        if (alreadyDone) return; // Im lặng bỏ qua mã đã quét

        const found = targets.find(t => !t.checked && isMatchFound(t, parsedNorm, parsed?.kind));
        if (found) {
          isMatch = true;
          found.checked = true;
          found.scanStatus = 'MATCHED';
          found.scannedAt = new Date().toISOString();
          displayCode = found.code;

          this.saveSessions();

          // Xóa item khỏi mini-list preview để chỉ hiện mã còn lại
          const miniItem = document.getElementById('mini-' + found.normCode);
          if (miniItem) miniItem.remove();

          // Cập nhật lại badge
          const unconfirmed = targets.filter(t => !t.checked).length;
          const badge = document.getElementById('arl-cam-badge');
          if (badge) badge.innerText = unconfirmed > 0 ? `${unconfirmed} 件未確認` : '完了 (Đã xong toàn bộ)';

          // PHASE 3: LAYER COMPLETION OVERLAY
          const layerId = found.item && found.item.RackLayerID;
          if (layerId) {
            const layerItems = targets.filter(t => t.item && t.item.RackLayerID === layerId);
            if (layerItems.length > 0 && layerItems.every(t => t.checked)) {
              if (!this.state.completedLayers) this.state.completedLayers = new Set();
              if (!this.state.completedLayers.has(layerId)) {
                this.state.completedLayers.add(layerId);
                this.state.scanning = false; // Tạm dừng quét

                const overlay = document.createElement('div');
                overlay.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.85); z-index:999; display:flex; flex-direction:column; justify-content:center; align-items:center; color:#fff; text-align:center; padding:20px;';
                overlay.innerHTML = `
                            <div style="font-size:48px; margin-bottom:16px; animation: scaleUp 0.5s ease-out;">🎉</div>
                            <h2 style="margin:0 0 8px 0; color:#22c55e;">完了 (Hoàn thành)</h2>
                            <p style="font-size:16px; margin-bottom:24px;">段 (Tầng): <b>${layerId}</b> (${layerItems.length} デバイス/thiết bị)</p>
                            <div style="display:flex; gap:12px; width:100%; max-width:300px;">
                               <button id="btn-next-layer" class="arl-btn arl-btn-primary" style="flex:1; padding:12px; font-size:14px;"><i class="fas fa-play"></i> 次へ (Tiếp tục)</button>
                               <button id="btn-view-stats" class="arl-btn" style="flex:1; padding:12px; font-size:14px; background:#f1f5f9; color:#333; border:none;"><i class="fas fa-chart-pie"></i> 結果 (Kết quả)</button>
                            </div>
                          `;

                const camRoot = document.getElementById('arl-camera-root');
                if (camRoot) {
                  camRoot.appendChild(overlay);

                  document.getElementById('btn-next-layer').onclick = () => {
                    camRoot.removeChild(overlay);
                    this.state.scanning = true;
                    requestAnimationFrame(() => this.camTick());
                  };
                  document.getElementById('btn-view-stats').onclick = () => {
                    this.closeCamera();
                  };
                }
              }
            }
          }
        }
        // Lưu ý: mã đã quét được bỏ qua hoàn toàn ở đầu (return sớm)
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
      ctx.fillText(`Raw: ${rawText.substring(0, 40)}`, 15, 25);
      ctx.fillText(`NormQR: ${parsedNorm}`, 15, 40);
      if (targets[0]) {
        ctx.fillText(`TargetCode: ${targets[0].normCode} | TargetId: ${targets[0].normId}`, 15, 55);
      }
      ctx.fillText(`Match: ${isMatch} | ParseFail: ${!parsed}`, 15, 70);

      if (isMatch) {
        if (this.state.mode === 'single') {
          this.beep();
          this.state.scanning = false; // Stop scanning immediately

          // --- GREEN BORDER EFFECT (NO DIMMING) ---
          const pad = 20;
          const w = (loc.bottomRightCorner.x - loc.topLeftCorner.x) + pad * 2;
          const h = (loc.bottomRightCorner.y - loc.topLeftCorner.y) + pad * 2;
          const x = loc.topLeftCorner.x - pad;
          const y = loc.topLeftCorner.y - pad;

          // Vẽ viền xanh lá nhấn mạnh trên nền sáng
          ctx.strokeStyle = "#22c55e"; // L0 Industrial Green
          ctx.lineWidth = 4;
          ctx.strokeRect(x, y, w, h);

          // Vẽ text
          ctx.font = 'bold 24px Arial'; ctx.fillStyle = '#22c55e';
          ctx.shadowColor = "black"; ctx.shadowBlur = 6;
          ctx.fillText('✓ ' + displayCode, x, y - 10);
          ctx.shadowBlur = 0;

          // Lấy frame hiện tại làm ảnh (chụp toàn cảnh đủ sáng)
          const dataUrl = this.state.canvas.toDataURL('image/jpeg', 0.9);
          this.state.foundImage = dataUrl;

          setTimeout(() => {
            this.closeCamera();
          }, 800); // Đợi 800ms cho người dùng thấy hiệu ứng Spotlight
        } else if (this.state.mode === 'location') {
          // Location Mode: Already beeped during scan addition
        } else {
          // Batch Mode
          // Chỉ beep 1 lần cho mã mới
          if (Date.now() - this.state.lastBeepTime > 1000) {
            this.beep();
            this.updateCamBadge();
            if (window.showToast) window.showToast('success', '', `Đã quét: ${displayCode}`);

            // Auto-close if all targets are checked
            const allDone = targets.length > 0 && targets.every(t => t.checked);
            if (allDone) {
              this.state.scanning = false; // Ngừng tick
              setTimeout(() => {
                if (window.showToast) window.showToast('success', '完了', 'Danh sách đã kiểm kê xong toàn bộ!');
                this.closeCamera();
              }, 1500);
            }
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

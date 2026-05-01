// v1.0.0-3
/**
 * sact-audit-module.js
 * Chức năng: Điều phối quy trình điểm danh khuôn SACT theo Mobile UI Workflow.
 * Tích hợp Supabase trực tiếp, bỏ qua CSV proxy đối với dữ liệu SACT.
 */
(function () {
    'use strict';

    const SACTModule = {
        state: {
            isOpen: false,
            campaigns: [],
            activeCampaign: null,
            targets: [], // { id, ysd_code, status, panasonic_kanagata_no, ... }
            offlineQueue: JSON.parse(localStorage.getItem('sact_pending_sync') || '[]'),
            supabaseClient: null, // Bắt buộc null để loadCampaigns khởi tạo qua SupabaseConfig!
            html5QrcodeScanner: null, // Cho Mobile Camera
            awaitingCompletionTarget: null, // Dành cho visibilitychange
            newCampaignTargets: [], // Lưu danh sách lập chiến dịch
            historyFilterYear: new Date().getFullYear().toString(),
            historyFilterCode: '',
            cachedHistory: [], // Lưu đệm history tải về
            activeTab: 'dashboard',
            initializedTabs: {
                dashboard: false,
                management: false,
                history: false
            }
        },

        init() {
            // Lắng nghe nút gọi SACT từ Navbar (thêm vào app.js)
            document.addEventListener('open-sact-ui', () => this.open());

            // Lắng nghe visibility change để khóa bước 3
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && this.state.awaitingCompletionTarget) {
                    this.showCompletionConfirmDialog();
                }
            });

            // Tự động kiểm tra nếu có log offline
            if (this.state.offlineQueue.length > 0) {
                setTimeout(() => this.processOfflineQueue(), 3000);
            }

            // Đóng SACT nếu người dùng nhấp vào mục khác trên sidebar
            document.addEventListener('mcsViewChanged', () => {
                if (this.state.isOpen && !this.state.isSwitchingView) {
                    this.state.isSwitchingView = true;
                    this.close();
                    this.state.isSwitchingView = false;
                }
            });
        },

        async open() {
            this.state.isOpen = true;
            this.state.activeTab = 'dashboard';
            this.state.initializedTabs = {
                dashboard: false,
                management: false,
                history: false
            };
            
            // Lưu lại view hiện tại để khôi phục khi đóng SACT
            if (window.ViewManager && window.ViewManager.currentView) {
                this.state.previousView = window.ViewManager.currentView;
            }

            this.renderLayout();
            await this.loadCampaigns();
            this.switchTab('dashboard');
        },

        close() {
            this.state.isOpen = false;
            const root = document.getElementById('sact-module-root');
            if (root) root.remove();
            if (this.state.html5QrcodeScanner) {
                try { this.state.html5QrcodeScanner.clear(); } catch (e) { }
            }
            this.state.awaitingCompletionTarget = null;

            // Khôi phục view cũ
            if (!this.state.isSwitchingView && window.ViewManager && this.state.previousView) {
                window.ViewManager.switchView(this.state.previousView);
            } else if (!this.state.isSwitchingView) {
                document.querySelectorAll('.main-content > .content-area').forEach(el => {
                    if(el.id !== 'sact-module-root') el.style.display = '';
                });
            }
        },

        renderLayout() {
            let root = document.getElementById('sact-module-root');
            if (root) root.remove();

            root = document.createElement('div');
            root.id = 'sact-module-root';
            root.className = 'sact-overlay';

            root.innerHTML = `
                <div class="sact-header">
                    <i class="fas fa-clipboard-check sact-header-icon"></i>
                    <div style="flex:1">
                        <div class="sact-header-title">SACT Monitor</div>
                        <div class="sact-header-sub">MoldCutterSearch — Panasonic Hub</div>
                    </div>
                    <div class="deadline-chip" id="sact-deadline-badge" style="display:none;">
                        <i class="fas fa-clock" style="font-size:9px"></i> <span id="sact-deadline-text"></span>
                    </div>
                    <button class="sact-close-btn" aria-label="Đóng SACT" style="background:none; border:none; color:white; font-size:24px; cursor:pointer; margin-left:10px;">&times;</button>
                </div>

                <div class="queue-alert ${this.state.offlineQueue.length > 0 ? 'visible' : ''}">
                    <i class="fas fa-exclamation-triangle"></i>
                    <span>Đang có ${this.state.offlineQueue.length} bản ghi lỗi mạng chờ đồng bộ!</span>
                </div>

                <div class="sact-tabbar" id="sact-tabbar">
                    <button class="sact-tab sact-tab-btn active" data-tab="dashboard">
                        <i class="fas fa-chart-pie tab-icon"></i>
                        <span>ダッシュボード</span>
                    </button>
                    <button class="sact-tab sact-tab-btn" data-tab="management" style="position:relative">
                        <div class="tab-notify" style="display:none;" id="sact-management-notify"></div>
                        <i class="fas fa-tasks tab-icon"></i>
                        <span>SACT管理</span>
                    </button>
                    <button class="sact-tab sact-tab-btn" data-tab="history">
                        <i class="fas fa-history tab-icon"></i>
                        <span>履歴</span>
                    </button>
                </div>

                <div class="sact-body sact-tab-panels" id="sact-body">
                    <section class="tab-panel sact-tab-panel active" id="sact-panel-dashboard">
                        <div class="sact-loading-state" style="margin:14px; text-align:center;">Đang tải dashboard...</div>
                    </section>

                    <section class="tab-panel sact-tab-panel" id="sact-panel-management">
                        <div class="sact-loading-state" style="margin:14px; text-align:center;">Đang tải quản lý SACT...</div>
                    </section>

                    <section class="tab-panel sact-tab-panel" id="sact-panel-history">
                        <div class="sact-loading-state" style="margin:14px; text-align:center;">Đang tải lịch sử...</div>
                    </section>
                </div>

                <!-- Help Modal -->
                <div id="sact-help-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:13000; align-items:center; justify-content:center;">
                    <div style="background:white; border-radius:8px; padding:20px; width:90%; max-width:500px; box-shadow:0 4px 15px rgba(0,0,0,0.2); max-height:80vh; overflow-y:auto; position:relative;">
                        <button onclick="window.SACTModule.closeHelpDialog()" style="position:absolute; top:10px; right:15px; background:none; border:none; font-size:24px; color:#666; cursor:pointer;">&times;</button>
                        <h3 style="margin-top:0; border-bottom:2px solid #0056b3; padding-bottom:10px; color:#0056b3; font-size:16px;">
                            <i class="fas fa-book"></i> SACT運用の案内 (Hướng Dẫn SACT)
                        </h3>
                        <div style="font-size:13px; line-height:1.6; color:#333;">
                            <strong>SACT (Smart Assets Confirming and Tracking)</strong> là hệ thống của Panasonic nhằm xác nhận tài sản khuôn định kỳ.<br>
                            <br>
                            <strong>ワークフロー (Quy trình):</strong>
                            <ol style="padding-left: 20px; margin-top:5px; margin-bottom:5px; color:#444;">
                                <li><strong>Quét Súng QR:</strong> Khi có chiến dịch, dùng súng quét mã vạch trên khuôn. App sẽ nhận diện tự động.</li>
                                <li><strong>Bật GPS:</strong> Bắt buộc bật GPS điện thoại để lấy Location.</li>
                                <li><strong>Mở SACT Panasonic:</strong> Bấm nút điều hướng, đăng nhập bằng ID của xưởng.</li>
                                <li><strong>Chụp ảnh & Nộp:</strong> Tiến hành chụp ảnh khuôn và submit biểu mẫu trên trang SACT.</li>
                                <li><strong>Khóa Task:</strong> Quay về màn hình App, bấm nút "Xác nhận hoàn tất" để đóng log dữ liệu.</li>
                            </ol>
                            <span style="color:#888; font-size:12px;">* Hỗ trợ đồng bộ Offline Queue khi mất mạng xưởng.</span>
                        </div>
                        <div style="margin-top:20px; text-align:center;">
                            <button onclick="window.SACTModule.closeHelpDialog()" style="background:#0056b3; color:white; border:none; padding:10px 20px; border-radius:4px; font-weight:bold; cursor:pointer;">閉じる (Đóng)</button>
                        </div>
                    </div>
                </div>
            `;
            
            const mainContent = document.querySelector('.main-content');
            if (mainContent) {
                // Ẩn các view hiện tại để SACT chiếm chỗ như một panel
                document.querySelectorAll('.main-content > .content-area').forEach(el => {
                    if(el.id !== 'sact-module-root') el.style.display = 'none';
                });
                root.classList.add('content-area');
                mainContent.appendChild(root);
            } else {
                document.body.appendChild(root);
            }

            root.querySelector('.sact-close-btn').addEventListener('click', () => this.close());
            root.querySelectorAll('.sact-tab-btn').forEach(btn => {
                btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
            });
        },

        switchTab(tabName) {
            this.state.activeTab = tabName;

            document.querySelectorAll('.sact-tab-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.tab === tabName);
            });

            document.querySelectorAll('.sact-tab-panel').forEach(panel => {
                panel.classList.toggle('active', panel.id === `sact-panel-${tabName}`);
            });
        },

        getPanelEl(name) {
            return document.getElementById(`sact-panel-${name}`);
        },

        async renderDashboardHome() {
            const panel = this.getPanelEl('dashboard');
            if (!panel) return;

            const openCount = this.state.campaigns.length;

            // --- 3. ACTIVITY FEED (Left Column) ---
            let activityHtml = `
                <div class="empty-state-box">
                    <div class="empty-state-icon"><i class="fas fa-clipboard-list"></i></div>
                    <div class="empty-state-text">まだ活動なし (Chưa có hoạt động)</div>
                    <div class="strip-btn strip-btn-solid" onclick="window.SACTModule.switchTab('management')" style="width: fit-content; margin: 0 auto; color: var(--mcs-text); border: 1px solid var(--mcs-border);">→ SACT管理を開く (Mở SACT quản lý)</div>
                </div>
            `;
            try {
                if (this.state.supabaseClient) {
                    const { data, error } = await this.state.supabaseClient
                        .from('sact_history')
                        .select('*, sact_targets(ysd_code)')
                        .order('created_at', { ascending: false })
                        .limit(5);
                    if (!error && data && data.length > 0) {
                        activityHtml = '<div class="activity-list">';
                        data.forEach(h => {
                            const dt = new Date(h.created_at);
                            // Relative time rough calculation
                            const diff = Date.now() - dt.getTime();
                            const hrs = Math.floor(diff / 3600000);
                            let relTime = hrs < 1 ? 'Vừa xong' : (hrs < 24 ? `${hrs} giờ trước` : dt.toLocaleDateString('vi-VN'));
                            if (hrs < 24 && hrs >= 1) relTime += ` (${hrs}時間前)`;

                            const mold = (h.sact_targets && h.sact_targets.ysd_code) ? h.sact_targets.ysd_code : 'Unknown';
                            const badge = h.status === 'Completed' ? 'badge-completed' : (h.status === 'Missing' ? 'badge-missing' : 'badge-pending');
                            const dot = h.status === 'Completed' ? 'completed' : (h.status === 'Missing' ? 'missing' : 'pending');
                            const text = h.status === 'Completed' ? '確認済 (Hoàn thành)' : (h.status === 'Missing' ? '紛失 (Báo mất)' : '処理中 (Đang xử lý)');
                            
                            activityHtml += `
                                <div class="activity-item">
                                    <div class="activity-dot ${dot}"></div>
                                    <div class="activity-content">
                                        <div class="activity-title"><span class="mold-link" onclick="window.SACTModule.openMoldDetail('${mold}')">${mold}</span></div>
                                        <div class="activity-meta">${relTime} · ${h.user_name || 'Hệ thống'}</div>
                                    </div>
                                    <div class="activity-badge ${badge}">${text}</div>
                                </div>
                            `;
                        });
                        activityHtml += '</div>';
                    }
                }
            } catch (e) {
                console.error(e);
            }

            // --- 1. CAMPAIGN STRIP & 2. KPI CARDS ---
            let campaignStripHtml = `
                <div class="empty-state-box" style="margin: 8px 14px 16px;">
                    <div class="empty-state-icon"><i class="fas fa-folder-open"></i></div>
                    <div class="empty-state-text">進行中のキャンペーンはありません<br>Chưa có chiến dịch nào đang diễn ra</div>
                </div>
            `;
            let kpiPending = 0;
            let kpiCompleted = 0;
            let kpiMissing = 0;

            if (openCount > 0) {
                const activeCmp = this.state.campaigns[0]; 
                
                const activeTargets = this.state.targets || [];
                const totalTargets = activeTargets.length;
                activeTargets.forEach(t => {
                    if (t.status === 'Completed') kpiCompleted++;
                    else if (t.status === 'Missing') kpiMissing++;
                    else kpiPending++;
                });

                const progressPct = totalTargets > 0 ? Math.round((kpiCompleted / totalTargets) * 100) : 0;
                
                let deadlineClass = '';
                let deadlineText = activeCmp.deadline || 'N/A';
                if (activeCmp.deadline) {
                    const dldt = new Date(activeCmp.deadline);
                    const diffDays = Math.ceil((dldt - new Date()) / (1000 * 60 * 60 * 24));
                    if (diffDays <= 3 && diffDays >= 0) {
                        deadlineClass = 'deadline-urgent';
                        deadlineText = `${activeCmp.deadline} 🔴 ${diffDays}d`;
                    }
                }

                campaignStripHtml = `
                <div class="campaign-strip">
                    <div class="campaign-strip-header">
                        <div class="campaign-strip-name">⚡ [SACT] ${activeCmp.name}</div>
                        <div class="campaign-strip-link" onclick="window.SACTModule.switchTab('management')">≡ すべて見る (Tất cả)</div>
                    </div>
                    
                    <div class="campaign-strip-meta">
                        <span>稼働中 (Active)</span>
                        <span class="deadline-chip ${deadlineClass}">期限 (Deadline): ${deadlineText}</span>
                    </div>

                    <div class="progress-track">
                        <div class="progress-fill ${progressPct < 100 ? 'in-progress' : ''}" style="width:${progressPct}%"></div>
                    </div>
                    
                    <div class="campaign-strip-meta">
                        <span>${kpiCompleted} / ${totalTargets} 金型 (Khuôn)</span>
                        <span>${progressPct}% 完了 (Hoàn thành)</span>
                    </div>

                    <div class="strip-actions">
                        <div class="strip-btn strip-btn-ghost" onclick="window.SACTModule.switchTab('history')">● 履歴 (Lịch sử)</div>
                        <div class="strip-btn strip-btn-solid" onclick="window.SACTModule.switchTab('management')">▶ SACT開始 (Bắt đầu →)</div>
                    </div>
                </div>`;
            }

            // --- 4. RIGHT COLUMN (GUIDE + CONTACT) ---
            const rightColHtml = `
                <div class="guide-card">
                    <div class="guide-header">
                        <i class="fas fa-book guide-header-icon"></i>
                        <div class="guide-header-title">📘 HƯỚNG DẪN SACT</div>
                    </div>
                    <div class="guide-body">
                        <strong>日本語：</strong> SACTシステムにアクセスし、金型コードとGPS位置情報を確認してください。<br><br>
                        <strong>Tiếng Việt：</strong> Truy cập SACT, xác nhận mã khuôn và chụp ảnh GPS tại vị trí hiện tại.
                    </div>
                    <div class="guide-link-btn" onclick="window.open('https://sact.panasonic.com', '_blank')">
                        🚀 Mở SACT Panasonic
                    </div>
                </div>
                
                <div class="contact-card">
                    <div class="contact-card-head">💬 CẬP NHẬT LIÊN LẠC (連絡更新)</div>
                    <div class="contact-item">
                        <div class="contact-item-date">2026-04-28: Shimizu-san</div>
                        <div>"Khuôn Panasonic sẽ được gia hạn thêm 3 ngày do lỗi hệ thống Molds."</div>
                    </div>
                    <div class="contact-item">
                        <div class="contact-item-date">2026-04-25: Tanaka-san</div>
                        <div>"Hoàn tất kiểm kê lô 1, vui lòng chuyển qua lô 2."</div>
                    </div>
                </div>
            `;

            // --- 5. STATS BAR (Desktop only) ---
            const statsBarHtml = `
                <div class="stats-bar">
                    <strong>Thống kê theo KH (顧客別統計):</strong>
                    <div class="stats-bar-item">Panasonic: 12✓ 2⏳</div>
                    <span class="stats-bar-sep">|</span>
                    <div class="stats-bar-item">Shimizu: 5✓ 3⏳</div>
                    <span class="stats-bar-sep">|</span>
                    <div class="stats-bar-item">Tokuyama: 0✓ 1⏳</div>
                </div>
            `;

            panel.innerHTML = `
                ${campaignStripHtml}

                <div class="kpi-row">
                    <div class="kpi-card tinted-primary">
                        <div class="kpi-card-icon"><i class="fas fa-folder-open"></i></div>
                        <div class="kpi-value primary">${openCount}</div>
                        <div class="kpi-label">開催中 (ĐANG MỞ)</div>
                        <div class="kpi-trend" onclick="window.SACTModule.switchTab('management')">→ Xem chiến dịch</div>
                    </div>
                    <div class="kpi-card tinted-warning">
                        <div class="kpi-card-icon"><i class="fas fa-clock"></i></div>
                        <div class="kpi-value warning">${kpiPending}</div>
                        <div class="kpi-label">未実施 (CHỜ KIỂM KÊ)</div>
                        <div class="kpi-trend">⏳ Đang pending</div>
                    </div>
                    <div class="kpi-card tinted-success">
                        <div class="kpi-card-icon"><i class="fas fa-check-circle"></i></div>
                        <div class="kpi-value success">${kpiCompleted}</div>
                        <div class="kpi-label">完了 (HOÀN THÀNH)</div>
                        <div class="kpi-trend">↑ Tốt</div>
                    </div>
                    <div class="kpi-card tinted-error">
                        <div class="kpi-card-icon"><i class="fas fa-exclamation-triangle"></i></div>
                        <div class="kpi-value error">${kpiMissing}</div>
                        <div class="kpi-label">紛失 (THẤT LẠC)</div>
                        <div class="kpi-trend">⚠️ Cần xử lý</div>
                    </div>
                </div>

                <div class="dash-two-col">
                    <div class="dash-col-left">
                        <div class="dash-section-title" style="display:flex; justify-content:space-between; align-items:center;">
                            <span>🕐 最近の活動 (Hoạt động)</span>
                            <span style="font-size:11px; font-weight:normal; color:var(--mcs-primary); cursor:pointer;" onclick="window.SACTModule.switchTab('history')">Xem tất cả →</span>
                        </div>
                        ${activityHtml}
                    </div>
                    <div class="dash-col-right">
                        ${rightColHtml}
                    </div>
                </div>
                
                ${statsBarHtml}
                <div style="height:16px"></div>
            `;


            this.state.initializedTabs.dashboard = true;
        },

        renderManagementHome() {
            const panel = this.getPanelEl('management');
            if (!panel) return;

            let html = '<div class="section-head">';
            html += '<div class="section-head-title">Danh sách chiến dịch SACT</div>';
            
            if (window.currentUserRole === 'admin') {
                html += `
                    <button class="btn-new" onclick="window.SACTModule.showCreateCampaign()">
                        <i class="fas fa-plus"></i> Tạo mới
                    </button>
                `;
            }
            html += '</div>';

            if (this.state.campaigns.length === 0) {
                html += `<div class="sact-empty-card">Chưa có chiến dịch SACT hiện hành.</div>`;
            } else {
                html += `<div id="sact-management-container">`;

                this.state.campaigns.forEach(c => {
                    html += `
                        <div class="campaign-card" onclick="window.SACTModule.selectCampaign('${c.id}')">
                            <div class="campaign-card-head">
                                <div class="campaign-card-name">${c.name}</div>
                                <div class="campaign-status-chip chip-active">● Active</div>
                            </div>
                            <div class="campaign-card-body">
                                <div class="campaign-meta-row">
                                    <div class="meta-chip"><i class="fas fa-calendar" style="font-size:9px"></i> ${c.deadline}</div>
                                    <div class="meta-chip"><i class="fas fa-building" style="font-size:9px"></i> Panasonic Hub</div>
                                </div>
                            </div>
                        </div>
                    `;
                });

                html += `</div>`;
            }

            panel.innerHTML = html;
            this.state.initializedTabs.management = true;
        },

        renderHistoryHome() {
            const panel = this.getPanelEl('history');
            if (!panel) return;

            this.renderHistorySection(panel);

            this.state.initializedTabs.history = true;
        },

        showHelpDialog() {
            const modal = document.getElementById('sact-help-modal');
            if (modal) modal.style.display = 'flex';
        },

        closeHelpDialog() {
            const modal = document.getElementById('sact-help-modal');
            if (modal) modal.style.display = 'none';
        },

        /**
         * Lấy danh sách Campaign từ Supabase
         */
        async loadCampaigns() {
            try {
                if (!this.state.supabaseClient) {
                    if (window.supabaseClient) {
                        this.state.supabaseClient = window.supabaseClient;
                    } else {
                        const cfg = window.SupabaseConfig ? window.SupabaseConfig.get() : (window.MCSupabaseConfig || {});
                        if (cfg.supabaseUrl && cfg.supabaseAnonKey) {
                            this.state.supabaseClient = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
                        } else {
                            throw new Error("Supabase config (URL/Key) không tồn tại. Vui lòng kiểm tra SupabaseConfig.");
                        }
                    }
                }

                const { data, error } = await this.state.supabaseClient
                    .from('sact_campaigns')
                    .select('*')
                    .order('deadline', { ascending: true });

                if (error) throw error;
                this.state.campaigns = data || [];
                
                const badge = document.getElementById('sact-deadline-badge');
                if (badge && this.state.campaigns.length > 0) {
                    const c = this.state.campaigns[0];
                    if (c.deadline) {
                        badge.style.display = 'flex';
                        const txt = document.getElementById('sact-deadline-text');
                        if (txt) txt.textContent = c.deadline;
                        
                        const dldt = new Date(c.deadline);
                        const diffDays = Math.ceil((dldt - new Date()) / (1000 * 60 * 60 * 24));
                        if (diffDays <= 3 && diffDays >= 0) badge.classList.add('deadline-urgent');
                        else badge.classList.remove('deadline-urgent');
                    }
                } else if (badge) {
                    badge.style.display = 'none';
                }

                await this.renderDashboardHome();
                this.renderManagementHome();
                this.renderHistoryHome();
            } catch (err) {
                console.error("SACT Campaign Load Error", err);
                document.getElementById('sact-body').innerHTML = `<div style="color:red">Lỗi kết nối CSDL: ${err.message}</div>`;
            }
        },



        async selectCampaign(id) {
            this.state.activeCampaign = this.state.campaigns.find(x => x.id === id);
            const panel = this.getPanelEl('management');
            if (panel) panel.innerHTML = `<div class="sact-loading-state" style="margin:14px; text-align:center;">Đang tải danh sách mục tiêu...</div>`;

            try {
                const { data, error } = await this.state.supabaseClient
                    .from('sact_targets')
                    .select('*')
                    .eq('campaign_id', id);
                if (error) throw error;
                this.state.targets = data || [];
                this.renderTargetList();
            } catch (err) {
                console.error("Targets Load Error", err);
                if (panel) panel.innerHTML = `<div class="sact-empty-card" style="color:var(--mcs-error)">Lỗi tải danh sách: ${err.message}</div>`;
            }
        },

        renderTargetList() {
            const panel = this.getPanelEl('management');
            if (!panel) return;

            const c = this.state.activeCampaign;

            let html = `
                <div class="section-head">
                    <button class="btn-new" onclick="window.SACTModule.renderManagementHome()" style="background:var(--mcs-neutral); margin-right:10px;">
                        <i class="fas fa-arrow-left"></i> Quay lại
                    </button>
                    <div class="section-head-title" style="flex:1;">Chi tiết đợt SACT</div>
                </div>

                <div class="campaign-card" style="cursor:default;">
                    <div class="campaign-card-head">
                        <div class="campaign-card-name">${c.name}</div>
                        <div class="campaign-status-chip chip-active">● Active</div>
                    </div>
                    <div class="campaign-card-body">
                        <div class="campaign-meta-row">
                            <div class="meta-chip"><i class="fas fa-calendar" style="font-size:9px"></i> ${c.deadline}</div>
                            <div class="meta-chip"><i class="fas fa-box" style="font-size:9px"></i> ${this.state.targets.length} khuôn</div>
                        </div>
                    </div>
                
                    <div style="padding:10px 14px; background:var(--mcs-surface-hover); border-top:1px solid var(--mcs-border); border-bottom:1px solid var(--mcs-border); display:flex; gap:10px;">
                        <input type="text" id="sact-quick-scan" placeholder="[Nhập Mã YSD / Enter]" style="flex:1; padding:8px 12px; border-radius:var(--mcs-radius-sm); border:1px solid var(--mcs-border); font-size:13px; font-weight:600;">
                        <button class="scan-btn" style="min-height:36px; padding:0 14px; font-size:14px;" onclick="window.SACTModule.openCameraScanner()">📷</button>
                    </div>

                    <div class="mold-list">
            `;

            this.state.targets.forEach(t => {
                let statusColor = 'var(--mcs-warning)';
                let btnHtml = `<button class="scan-btn" onclick="window.SACTModule.startStep2('${t.id}')"><i class="fas fa-qrcode"></i> Quét</button>`;
                let badgeHtml = '';

                if (t.status === 'Completed') {
                    statusColor = 'var(--mcs-success)';
                    btnHtml = `<div class="scan-btn done"><i class="fas fa-check"></i> Done</div>`;
                } else if (t.status === 'Missing') {
                    statusColor = 'var(--mcs-error)';
                    btnHtml = `<div class="scan-btn miss"><i class="fas fa-exclamation-triangle"></i> Miss</div>`;
                } else if (t.status === 'In_Progress') {
                    statusColor = 'var(--mcs-info)';
                    btnHtml = `<button class="scan-btn" style="background:var(--mcs-info)" onclick="window.SACTModule.startStep2('${t.id}')">Tiếp tục</button>`;
                }

                html += `
                    <div class="mold-row" id="target-${t.id}">
                        <div class="mold-status-dot" style="background:${statusColor}"></div>
                        <div class="mold-info">
                            <div class="mold-code" onclick="window.SACTModule.openMoldDetail('${t.ysd_code}')">${t.ysd_code}</div>
                            <div class="mold-name">PNA: ${t.panasonic_kanagata_no || 'N/A'}</div>
                        </div>
                        ${btnHtml}
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;

            panel.innerHTML = html;

            const inp = document.getElementById('sact-quick-scan');
            if (inp) {
                inp.focus();
                inp.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const val = inp.value.trim().toUpperCase();
                        inp.value = '';
                        this.processCode(val);
                    }
                });
            }
        },

        openMoldDetail(code) {
            // Đóng this.close() để giữ nguyên giao diện SACT theo yêu cầu
            // Tìm mold từ DataManager để mở qua DetailPanel
            let item = null;
            if (window.DataManager && window.DataManager.data && window.DataManager.data.molds) {
                const normCode = code.trim().toUpperCase();
                item = window.DataManager.data.molds.find(m => {
                    const ysd = String(m.YSD_Code || m.MoldCode || m.ysd_code || m.displayCode || '').trim().toUpperCase();
                    return ysd === normCode || ysd.replace(/-/g, '') === normCode.replace(/-/g, '');
                });
            }

            if (!item) {
                // Tạo một item giả lập để DetailPanel không bị lỗi khi tìm mã khuôn cũ đã xóa
                item = { type: 'mold', YSD_Code: code, MoldCode: code, status: 'Unknown' };
            }

            if (window.DetailPanel && typeof window.DetailPanel.open === 'function') {
                window.DetailPanel.open(item, 'mold');
            } else if (window.detailPanel && typeof window.detailPanel.open === 'function') {
                window.detailPanel.open(item, 'mold');
            } else if (window.openMoldFromSearch) {
                window.openMoldFromSearch(code);
            } else {
                console.warn("Không tìm thấy hook để mở chi tiết khuôn.");
            }
        },

        normalizeCode(raw) {
            // Loại bỏ khoảng trắng và dấu gạch nối, viết hoa để dễ compare matching
            return raw.replace(/[\s-]/g, '').toUpperCase();
        },

        processCode(rawCode) {
            // Lọc id từ MCQR fake payload nếu Scanner súng đưa ra
            // MCQR|MOLD|ID|CODE -> lấy phần CODE
            let code = rawCode;
            if (rawCode.startsWith('MCQR|')) {
                const parts = rawCode.split('|');
                if (parts.length >= 4) code = parts[3];
            }

            const cleanScanned = this.normalizeCode(code);

            // Tìm tương ứng
            const found = this.state.targets.find(t => this.normalizeCode(t.ysd_code) === cleanScanned);
            if (found) {
                if (found.status === 'Pending') {
                    this.startStep2(found.id);
                } else {
                    alert(`Khuôn ${found.ysd_code} đang ở trạng thái: ${found.status}`);
                }
            } else {
                alert(`Không tìm thấy mục tiêu nào khớp với mã quét: ${code} trong Chiến dịch hiện tại!`);
            }
        },

        openCameraScanner() {
            // Sử dụng Html5Qrcode nếu hệ thống đã có (do qr-scanner.js tải về)
            if (!window.Html5Qrcode) {
                alert("Lỗi: Thư viện Html5Qrcode chưa sẵn sàng!");
                return;
            }
            alert("Tính năng quét Camera. Vui lòng bấm OK và đưa QR vào khung.");
            // Cài đặt Html5QrcodeScanner mini cho SACT ... (mock logic để giản lược cho kế hoạch)
        },

        async markMissing(targetId) {
            if (!confirm("この金型が工場内で見つからない（紛失）ことを確認しますか？\n\nXác nhận khuôn này KHÔNG TÌM THẤY trong xưởng (Báo Lost/Missing)?\n\nAdmin sẽ nhận được cảnh báo.")) return;
            await this.updateStatus(targetId, 'Missing');
        },

        startStep2(targetId) {
            const t = this.state.targets.find(x => x.id === targetId);
            if (!t) return;
            const c = this.state.activeCampaign;

            const panel = this.getPanelEl('management');
            if(!panel) return;

            panel.innerHTML = `
                <div class="step-divider">
                    <div class="step-num">2</div>
                    <div class="step-title">SACTページを開く / Mở trang SACT</div>
                </div>
                
                <div class="bridge-modal">
                    <div class="bridge-modal-header">
                        <span class="icon">📖</span>
                        <div>
                            <div class="title">作業手順 / Hướng dẫn thao tác</div>
                            <div class="subtitle">${t.ysd_code} - PNA: ${t.panasonic_kanagata_no || 'N/A'}</div>
                        </div>
                    </div>

                    <div class="instruction-block">
                        <div class="instr-jp">${c.instruction_text_jp || '1. 下記ボタンを押してPanasonic SACTを開く<br>2. GPS位置情報を必ず有効にすること<br>3. 写真撮影・棚卸完了後、必ずアプリへ戻ること'}</div>
                        <div class="instr-vi">${c.instruction_text_vi || '1. Nhấn nút bên dưới để mở trang SACT Panasonic<br>2. Bắt buộc bật GPS trước khi chụp ảnh<br>3. Sau khi hoàn thành trên SACT, quay lại app để xác nhận'}</div>
                    </div>

                    <div class="gps-check">
                        <span class="gps-check-icon">📍</span>
                        <div class="gps-check-text">Tôi đã bật GPS 位置情報をONにした</div>
                        <input type="checkbox" class="gps-checkbox" id="gps-check">
                    </div>

                    <div class="bridge-cta">
                        <button class="btn-open-sact" onclick="window.SACTModule.launchSact('${t.id}')">
                            🚀 MỞ TRANG SACT PANASONIC
                            <span class="btn-open-sact-panasonic-badge">外部ブラウザ</span>
                        </button>
                    </div>
                </div>
                
                <div style="text-align:center; margin-top:14px;">
                    <button onclick="window.SACTModule.renderTargetList()" style="background:none; border:none; color:var(--mcs-text-muted); font-size:12px; font-weight:600; cursor:pointer;">
                        ← Quay lại danh sách
                    </button>
                </div>
            `;
        },

        async launchSact(targetId) {
            const cb = document.getElementById('gps-check');
            if (!cb || !cb.checked) {
                alert("Vui lòng tích vào ô xác nhận đã bật GPS! \nGPSがオンになっていることを確認してください！");
                return;
            }

            const c = this.state.activeCampaign;
            const url = c.external_link_url || 'https://mold-sact.panasonic.com/QR/PP_QRReader';

            // Wait user for visibility return
            this.state.awaitingCompletionTarget = targetId;

            await this.updateStatus(targetId, 'In_Progress');
            window.open(url, '_blank');
        },

        showCompletionConfirmDialog() {
            const targetId = this.state.awaitingCompletionTarget;
            const t = this.state.targets.find(x => x.id === targetId);
            if (!t) return;

            const panel = this.getPanelEl('management');
            if(!panel) return;

            panel.innerHTML = `
                <div class="step-divider">
                    <div class="step-num">3</div>
                    <div class="step-title">棚卸完了を記録 (Đóng Khuôn)</div>
                </div>

                <div class="completion-card">
                    <div class="completion-target-info">
                        <div class="check-icon">↩</div>
                        <div>
                            <div class="ysd">${t.ysd_code}</div>
                            <div class="sub">SACTから戻りました (Đã trở về từ SACT Panasonic) · PNA: ${t.panasonic_kanagata_no || 'N/A'}</div>
                        </div>
                    </div>
                    
                    <div class="completion-status">
                        <div class="status-row">
                            <span class="label">📍 GPSステータス (Trạng thái GPS)</span>
                            <span class="value" style="color:var(--mcs-success); font-weight:800;">✅ システム起動済 (Đã mở hệ thống)</span>
                        </div>
                    </div>

                    <div class="completion-warn">
                        ⚠️ 必ずPanasonic SACTで完了してから確認ボタンを押してください。<br>(Chỉ bấm xác nhận SAU KHI đã hoàn tất thao tác trên trang SACT của Panasonic.)
                    </div>

                    <button class="btn-finalize" onclick="window.SACTModule.finishTarget('${targetId}')">
                        🔒 SACT完了を確認 (XÁC NHẬN ĐÃ LÀM XONG SACT)
                    </button>
                    <div class="btn-back-link" onclick="window.SACTModule.cancelCompletion()">
                        ← キャンセル (Quay lại)
                    </div>
                </div>
            `;
        },

        cancelCompletion() {
            this.state.awaitingCompletionTarget = null;
            this.renderTargetList();
        },

        async finishTarget(targetId) {
            this.state.awaitingCompletionTarget = null;
            await this.updateStatus(targetId, 'Completed');
            await this.pushHistoryLog(targetId, 'Completed');
            this.renderTargetList();

            // KÍCH HOẠT KIỂM KÊ KHUÔN (INVENTORY)
            const t = this.state.targets.find(x => x.id === targetId);
            if (t) {
                let item = null;
                if (window.DataManager && window.DataManager.data && window.DataManager.data.molds) {
                    const normCode = (t.ysd_code || '').trim().toUpperCase();
                    item = window.DataManager.data.molds.find(m => {
                        const ysd = String(m.YSD_Code || m.MoldCode || m.ysd_code || m.displayCode || '').trim().toUpperCase();
                        return ysd === normCode || ysd.replace(/-/g, '') === normCode.replace(/-/g, '');
                    });
                }
                
                if (item) {
                    document.dispatchEvent(new CustomEvent('quick-action', {
                        detail: { action: 'inventory', item: item, itemType: 'mold' }
                    }));
                } else {
                    console.warn("Không tìm thấy dữ liệu khuôn trong DataManager để chạy kiểm kê tự động.");
                }
            }
        },

        // KẾT NỐI SUPABASE
        async updateStatus(targetId, newStatus) {
            const t = this.state.targets.find(x => x.id === targetId);
            if (t) t.status = newStatus;

            this.renderTargetList(); // Optimistic rendering

            const payload = { status: newStatus, updated_at: new Date().toISOString() };

            try {
                const { error } = await this.state.supabaseClient
                    .from('sact_targets')
                    .update(payload)
                    .eq('id', targetId);

                if (error) throw error;
            } catch (err) {
                console.error("Lỗi cập nhật mạng, lưu Offline", err);
                this.state.offlineQueue.push({ type: 'target_update', targetId, payload });
                this.saveOffline();
            }
        },

        async pushHistoryLog(targetId, status) {
            const device_info = {
                userAgent: navigator.userAgent,
                language: navigator.language,
                screen: `${window.screen.width}x${window.screen.height}`
            };

            const payload = {
                target_id: targetId,
                campaign_id: this.state.activeCampaign.id,
                user_name: window.currentUser ? window.currentUser.Name : 'Unknown',
                status: status,
                device_info: device_info
            };

            try {
                const { error } = await this.state.supabaseClient
                    .from('sact_history')
                    .insert([payload]);
                if (error) throw error;
            } catch (err) {
                console.error("Lỗi đẩy History mạng, lưu Offline", err);
                this.state.offlineQueue.push({ type: 'history_insert', payload });
                this.saveOffline();
            }
        },

        saveOffline() {
            localStorage.setItem('sact_pending_sync', JSON.stringify(this.state.offlineQueue));
            const qq = document.querySelector('.sact-offline-queue');
            if (qq) {
                qq.classList.add('visible');
                qq.textContent = `Đang có ${this.state.offlineQueue.length} bản ghi lỗi mạng chờ đồng bộ!`;
            }
        },

        async processOfflineQueue() {
            if (this.state.offlineQueue.length === 0) return;
            if (!this.state.supabaseClient) return;

            let failed = [];
            for (let item of this.state.offlineQueue) {
                try {
                    if (item.type === 'target_update') {
                        await this.state.supabaseClient.from('sact_targets').update(item.payload).eq('id', item.targetId);
                    } else if (item.type === 'history_insert') {
                        await this.state.supabaseClient.from('sact_history').insert([item.payload]);
                    }
                } catch (e) {
                    failed.push(item);
                }
            }

            this.state.offlineQueue = failed;
            localStorage.setItem('sact_pending_sync', JSON.stringify(this.state.offlineQueue));

            const qq = document.querySelector('.sact-offline-queue');
            if (qq) {
                if (failed.length === 0) {
                    qq.classList.remove('visible');
                } else {
                    qq.textContent = `Vẫn còn ${failed.length} bản ghi kẹt mạng chờ đồng bộ...`;
                }
            }
        },

        // --- NEW CAMPAIGN MAKER ---
        showCreateCampaign() {
            const body = this.getPanelEl('management');
            if(!body) return;
            
            this.state.newCampaignTargets = [];
            const d = new Date();
            const yearStr = d.getFullYear();
            const monthStr = ('0' + (d.getMonth() + 1)).slice(-2);
            const defaultName = `[SACT] ${yearStr}-${monthStr}`;
            const ymd = `${yearStr}-${monthStr}-28`;

            body.innerHTML = `
                <div class="section-head">
                    <button class="btn-new" onclick="window.SACTModule.renderManagementHome()" style="background:var(--mcs-neutral); margin-right:10px;">
                        <i class="fas fa-arrow-left"></i> Quay lại
                    </button>
                    <div class="section-head-title" style="flex:1;">SACT新規作成 (Tạo Chiến Dịch)</div>
                </div>
                <div style="padding:0 15px 15px; position:relative;">
                    <div style="margin-top:15px;">
                        <label style="display:block; font-weight:bold; margin-bottom:5px; font-size:14px;">SACT キャンペーン名 (Tên chiến dịch):</label>
                        <input type="text" id="sact-new-name" value="${defaultName}" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
                    </div>
                    <div style="margin-top:15px;">
                        <label style="display:block; font-weight:bold; margin-bottom:5px; font-size:14px;">SACT 期限 (Hạn chót):</label>
                        <input type="date" id="sact-new-deadline" value="${ymd}" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
                    </div>
                    
                    <div style="margin-top:20px; border-top:2px solid #0056b3; padding-top:15px;">
                        <label style="display:block; font-weight:bold; margin-bottom:5px; font-size:14px; color:#c62828;">金型の追加 (Thêm khuôn mục tiêu bằng mã):</label>
                        <input type="text" id="sact-mold-search" oninput="window.SACTModule.onSearchMold(this.value)" onkeydown="window.SACTModule.onSearchMoldKeydown(event)" placeholder="🔍 Gõ mã khuôn để tìm (Ví dụ: JAE)..." style="width:100%; padding:10px; border:2px solid #0056b3; border-radius:4px; font-weight:bold; font-size:15px; box-sizing:border-box;">
                        <div id="sact-search-results" style="max-height:180px; overflow-y:auto; background:#fff; border:1px solid #ccc; border-radius:4px; margin-top:5px; display:none; box-shadow:0 4px 6px rgba(0,0,0,0.1);"></div>
                    </div>

                    <div style="margin-top:20px;">
                        <strong style="font-size:14px;">選択済みリスト (Đã chọn) - <span id="sact-mold-count" style="color:red; font-size:16px;">0</span>:</strong>
                        <div id="sact-selected-molds" style="border:1px solid #ddd; border-radius:4px; min-height:100px; max-height:250px; overflow-y:auto; padding:10px; background:#f5faff; margin-top:5px;">
                            <div style="color:#aaa; font-style:italic;" id="sact-selected-empty">Chưa có khuôn nào. Dùng ô trên để tìm và thêm.</div>
                        </div>
                    </div>

                    <div style="margin-top: 25px; text-align:center;">
                        <button class="sact-btn" style="background:#28a745; width:100%; padding:15px; font-size:16px; font-weight:bold; box-shadow:0 4px 6px rgba(0,0,0,0.2);" onclick="window.SACTModule.saveNewCampaign()">💾 保存 (Lưu Danh Sách SACT)</button>
                    </div>
                </div>
            `;

            setTimeout(() => {
                const inp = document.getElementById('sact-mold-search');
                if (inp) inp.focus();
            }, 100);
        },

        onSearchMold(val) {
            const resDiv = document.getElementById('sact-search-results');
            const searchRaw = val; // Giữ nguyên để Regex xóa ký tự
            // Chuẩn hóa loại bỏ gạch nối và space để so sánh siêu việt
            const cleanSearch = searchRaw.replace(/[\s-]/g, '').toLowerCase();

            if (!cleanSearch) {
                resDiv.style.display = 'none';
                return;
            }

            // Gọi API chuẩn của DataManager v10+ để lấy toàn bộ Molds & Cutters
            let allMolds = [];
            if (window.DataManager && typeof window.DataManager.getAllItems === 'function') {
                allMolds = window.DataManager.getAllItems();
            } else if (window.app && Array.isArray(window.app.allItems)) {
                allMolds = window.app.allItems;
            }

            let matches = [];
            for (let i = 0; i < allMolds.length; i++) {
                const m = allMolds[i];
                if (!m) continue;

                // Gom các trường Text có thể tìm kiếm & Lọc gạch nối
                const rawSearchable = `${m.MoldName || ''} ${m.MoldCode || ''} ${m.displayCode || ''} ${m.displayName || ''} ${m.CustomerName || ''}`;
                const cleanSearchable = rawSearchable.replace(/[\s-]/g, '').toLowerCase();

                if (cleanSearchable.includes(cleanSearch)) {
                    matches.push(m);
                    if (matches.length >= 30) break; // limit items for performance
                }
            }

            if (matches.length === 0) {
                resDiv.innerHTML = `<div style="padding:10px; color:#999; font-style:italic;">Không tìm thấy mã khuôn nào chứa: ${searchRaw}</div>`;
                this.state.searchMatches = [];
                this.state.searchIndex = 0;
            } else {
                let bestIndex = 0;
                matches.forEach((m, idx) => {
                    const c = m.MoldName || m.displayName || m.MoldCode || '';
                    if (c.replace(/[\s-]/g, '').toLowerCase() === cleanSearch) {
                        bestIndex = idx;
                    }
                });

                let h = '';
                this.state.searchMatches = matches;
                this.state.searchIndex = bestIndex;
                matches.forEach((m, idx) => {
                    const c = m.MoldName || m.displayName || m.MoldCode || 'Unknown';
                    const c_disp = c.replace(/'/g, "\\'");
                    const bg = idx === bestIndex ? '#e3f2fd' : 'white';
                    const borderLeft = idx === bestIndex ? '4px solid #0056b3' : '4px solid transparent';

                    h += `<div id="sact-item-${idx}" style="padding:12px 10px; border-bottom:1px solid #eee; cursor:pointer; background:${bg}; border-left:${borderLeft};" onmousedown="window.SACTModule.addMoldTarget('${c_disp}')" onmouseout="if(window.SACTModule.state.searchIndex !== ${idx}) { this.style.background='white'; this.style.borderLeft='4px solid transparent'; }" onmouseover="window.SACTModule.setSearchIndex(${idx})">
                        <strong style="color:#0056b3;">${c}</strong> <span style="font-size:12px; color:#666;">(${m.CustomerName || m.displayCustomer || m.Customer || ''})</span>
                    </div>`;
                });
                resDiv.innerHTML = h;
                
                // Cuộn tới best match nếu có
                setTimeout(() => {
                    const el = document.getElementById(`sact-item-${bestIndex}`);
                    if (el && resDiv) {
                        if (el.offsetTop < resDiv.scrollTop || (el.offsetTop + el.offsetHeight) > (resDiv.scrollTop + resDiv.offsetHeight)) {
                            resDiv.scrollTop = el.offsetTop - (resDiv.offsetHeight / 2) + (el.offsetHeight / 2);
                        }
                    }
                }, 10);
            }
            resDiv.style.display = 'block';
        },

        setSearchIndex(idx) {
            this.state.searchIndex = idx;
            this.renderSearchSelection();
        },

        renderSearchSelection() {
            const matches = this.state.searchMatches || [];
            matches.forEach((m, idx) => {
                const el = document.getElementById(`sact-item-${idx}`);
                if (el) {
                    if (idx === this.state.searchIndex) {
                        el.style.background = '#e3f2fd';
                        el.style.borderLeft = '4px solid #0056b3';
                    } else {
                        el.style.background = 'white';
                        el.style.borderLeft = '4px solid transparent';
                    }
                }
            });
        },

        onSearchMoldKeydown(e) {
            const matches = this.state.searchMatches || [];
            if (matches.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.state.searchIndex++;
                if (this.state.searchIndex >= matches.length) this.state.searchIndex = 0;
                this.renderSearchSelection();
                const el = document.getElementById(`sact-item-${this.state.searchIndex}`);
                if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.state.searchIndex--;
                if (this.state.searchIndex < 0) this.state.searchIndex = matches.length - 1;
                this.renderSearchSelection();
                const el = document.getElementById(`sact-item-${this.state.searchIndex}`);
                if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const sel = matches[this.state.searchIndex];
                if (sel) {
                    const c = sel.MoldName || sel.displayName || sel.MoldCode || 'Unknown';
                    this.addMoldTarget(c);
                }
            }
        },

        addMoldTarget(code) {
            if (!this.state.newCampaignTargets.includes(code)) {
                this.state.newCampaignTargets.push(code);
            } else {
                // Flash hiệu ứng nếu đã tồn tại
            }
            const inp = document.getElementById('sact-mold-search');
            inp.value = '';
            const resDiv = document.getElementById('sact-search-results');
            if (resDiv) resDiv.style.display = 'none';
            this.renderSelectedMolds();
            inp.focus();
        },

        removeMoldTarget(code) {
            this.state.newCampaignTargets = this.state.newCampaignTargets.filter(c => c !== code);
            this.renderSelectedMolds();
        },

        renderSelectedMolds() {
            const list = document.getElementById('sact-selected-molds');
            const count = document.getElementById('sact-mold-count');
            if (count) count.innerText = this.state.newCampaignTargets.length;

            if (this.state.newCampaignTargets.length === 0) {
                list.innerHTML = `<div style="color:#aaa; font-style:italic;" id="sact-selected-empty">Chưa có khuôn nào. Dùng ô trên để tìm và thêm.</div>`;
                return;
            }

            let html = '';
            [...this.state.newCampaignTargets].reverse().forEach(c => {
                const c_disp = c.replace(/'/g, "\\'");
                html += `
                    <div style="display:flex; justify-content:space-between; align-items:center; background:white; padding:10px 12px; border:1px solid #cce5ff; border-left:4px solid #007bff; border-radius:4px; margin-bottom:8px; box-shadow:0 1px 2px rgba(0,0,0,0.05);">
                        <strong style="font-size:15px; color:#333;">${c}</strong>
                        <button onclick="window.SACTModule.removeMoldTarget('${c_disp}')" style="background:#dc3545; color:white; border:none; padding:5px 12px; border-radius:4px; cursor:pointer; font-weight:bold;">削除 (Xóa)</button>
                    </div>
                `;
            });
            list.innerHTML = html;
        },

        async saveNewCampaign() {
            if (this.state.newCampaignTargets.length === 0) {
                alert("Bạn phải thêm ít nhất 1 khuôn vào danh sách trước khi Lưu!");
                return;
            }
            const name = document.getElementById('sact-new-name').value.trim() || 'SACT Campaign';
            const deadline = document.getElementById('sact-new-deadline').value || null;

            if (!confirm(`⚠️ Xác nhận tạo đợt kiểm kê SACT MỚI?\n- Tên đợt: ${name}\n- Số lượng: ${this.state.newCampaignTargets.length} khuôn mục tiêu\n\nSẽ ghi trực tiếp lên Supabase Database.`)) return;

            const body = this.getPanelEl('management');
            if (body) {
                body.innerHTML = `<div style="padding:40px 20px; text-align:center;">
                    <i class="fas fa-spinner fa-spin" style="font-size:30px; color:#0056b3; margin-bottom:15px;"></i>
                    <br>Đang khởi tạo Database và nạp khuôn...
                </div>`;
            }

            try {
                // 1. Tạo Campaign
                const c_payload = { name, deadline, instruction_text_jp: '', instruction_text_vi: '', external_link_url: '' };
                const { data: cData, error: cErr } = await this.state.supabaseClient.from('sact_campaigns').insert([c_payload]).select();
                if (cErr) throw cErr;

                const newCampaignId = cData[0].id;

                // 2. Tạo Targets (Chia đợt Bulk insert nếu cần, nhưng Supabase handle tốt list 100-200 dòng)
                const t_payloads = this.state.newCampaignTargets.map(code => {
                    return {
                        campaign_id: newCampaignId,
                        ysd_code: code,
                        status: 'Pending'
                    };
                });

                const { error: tErr } = await this.state.supabaseClient.from('sact_targets').insert(t_payloads);
                if (tErr) throw tErr;

                setTimeout(async () => {
                    alert('Thành công! Chiến dịch SACT mới đã được khởi tạo.');
                    await this.loadCampaigns(); // Refresh to index
                }, 500);

            } catch (e) {
                console.error("Lỗi tạo SACT", e);
                alert("Quá trình kết nối bị từ chối: " + e.message + "\n(Vui lòng kiểm tra quyền Admin rls)");
                this.renderManagementHome();
            }
        },

        // --- LỊCH SỬ CHUYÊN NGOẠI ---
        renderHistorySection(container) {
            container.innerHTML = `
                <div class="filter-bar">
                    <div class="filter-chip active" onclick="window.SACTModule.setHistoryFilter('all', this)"><i class="fas fa-filter" style="font-size:9px"></i> すべて (Tất cả)</div>
                    <div class="filter-chip" onclick="window.SACTModule.setHistoryFilter('Completed', this)">✅ 完了 (Completed)</div>
                    <div class="filter-chip" onclick="window.SACTModule.setHistoryFilter('Missing', this)">⚠️ 紛失 (Missing)</div>
                    <div class="filter-chip" onclick="window.SACTModule.setHistoryFilter('Pending', this)">🕐 処理中 (Pending)</div>
                </div>
                <div style="padding: 0 14px 10px; display:flex; gap:8px;">
                    <input type="text" id="sact-hist-year" value="${this.state.historyFilterYear}" placeholder="年/Năm (vd: 2026)" style="flex:1; padding:8px 12px; border:1px solid var(--mcs-border); border-radius:var(--mcs-radius-sm); font-size:12px; background:var(--mcs-surface);">
                    <input type="text" id="sact-hist-code" value="${this.state.historyFilterCode}" placeholder="YSDコード検索..." style="flex:2; padding:8px 12px; border:1px solid var(--mcs-border); border-radius:var(--mcs-radius-sm); font-size:12px; background:var(--mcs-surface);">
                    <button class="scan-btn" onclick="window.SACTModule.fetchAndRenderHistory()" style="padding:0 14px; font-size:12px; background:var(--mcs-info);"><i class="fas fa-search"></i></button>
                </div>
                <div id="sact-hist-list">
                    <div class="sact-empty-card">データを読み込んでいます... (Đang tải dữ liệu...)</div>
                </div>
            `;
            this.fetchAndRenderHistory();
        },
        setHistoryFilter(status, el) {
            // Cập nhật UI
            const chips = el.parentElement.querySelectorAll('.filter-chip');
            chips.forEach(c => c.classList.remove('active'));
            el.classList.add('active');
            
            this.state.historyStatusFilter = status === 'all' ? null : status;
            this.paintHistoryList();
        },

        async fetchAndRenderHistory() {
            const histList = document.getElementById('sact-hist-list');
            if (!histList) return;

            const yearInp = document.getElementById('sact-hist-year');
            const codeInp = document.getElementById('sact-hist-code');
            if (yearInp) this.state.historyFilterYear = yearInp.value.trim();
            if (codeInp) this.state.historyFilterCode = codeInp.value.trim().toLowerCase();

            histList.innerHTML = `<div style="text-align:center; color:#999; padding:20px;"><i class="fas fa-circle-notch fa-spin"></i> Đang tải từ máy chủ...</div>`;

            try {
                let query = this.state.supabaseClient
                    .from('sact_history')
                    .select('*, sact_campaigns(name), sact_targets(ysd_code)')
                    .order('created_at', { ascending: false })
                    .limit(100); // Lấy tối đa 100 log để lọc client-side

                if (this.state.historyFilterYear) {
                    query = query.gte('created_at', `${this.state.historyFilterYear}-01-01T00:00:00Z`)
                        .lte('created_at', `${this.state.historyFilterYear}-12-31T23:59:59Z`);
                }

                const { data, error } = await query;
                if (error) throw error;

                this.state.cachedHistory = data || [];
                this.paintHistoryList();

            } catch (e) {
                console.error("Lọc lỗi", e);
                histList.innerHTML = `<div style="color:red; padding:10px;">❌ Lỗi truy vấn Database: ${e.message}</div>`;
            }
        },

        paintHistoryList() {
            const histList = document.getElementById('sact-hist-list');
            if (!histList) return;

            let filtered = this.state.cachedHistory;
            if (this.state.historyFilterCode) {
                filtered = filtered.filter(h => {
                    const mold = (h.sact_targets && h.sact_targets.ysd_code) ? h.sact_targets.ysd_code : '';
                    return mold.toLowerCase().includes(this.state.historyFilterCode);
                });
            }
            if (this.state.historyStatusFilter) {
                filtered = filtered.filter(h => h.status === this.state.historyStatusFilter);
            }

            if (filtered.length === 0) {
                histList.innerHTML = `<div class="sact-empty-card">条件に一致する履歴がありません。 (Không có lịch sử SACT nào theo điều kiện lọc.)</div>`;
                return;
            }

            // Group theo ngày
            const groups = {};
            filtered.forEach(h => {
                const dt = new Date(h.created_at);
                const dayKey = dt.toLocaleDateString('ja-JP');
                if (!groups[dayKey]) groups[dayKey] = [];
                groups[dayKey].push(h);
            });

            let html = '';
            for (const day of Object.keys(groups)) {
                html += `<div class="history-group-label">${day}</div>`;
                groups[day].forEach(h => {
                    const dt = new Date(h.created_at);
                    const time = dt.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'});
                    const badgeCls = h.status === 'Completed' ? 'badge-completed' : (h.status === 'Missing' ? 'badge-missing' : 'badge-pending');
                    const mold = (h.sact_targets && h.sact_targets.ysd_code) ? h.sact_targets.ysd_code : 'Unknown';
                    const cmp = (h.sact_campaigns && h.sact_campaigns.name) ? h.sact_campaigns.name : 'Unknown Campaign';

                    html += `
                        <div class="history-item">
                            <div class="history-item-head">
                                <div>
                                    <div class="history-mold" onclick="window.SACTModule.openMoldDetail('${mold}')" style="cursor:pointer; color:var(--mcs-primary); text-decoration:underline;">${mold}</div>
                                    <div class="history-campaign">${cmp}</div>
                                </div>
                                <div class="activity-badge ${badgeCls}">${h.status}</div>
                            </div>
                            <div class="history-meta-row">
                                <span><i class="fas fa-user"></i> ${h.user_name || 'System'}</span>
                                <span><i class="fas fa-clock"></i> ${time}</span>
                                <span><i class="fas fa-mobile-alt"></i> Device</span>
                            </div>
                        </div>
                    `;
                });
            }
            html += `<div style="text-align:center;padding:12px 14px 16px;font-size:11px;color:var(--mcs-text-muted)">
                <i class="fas fa-chevron-down" style="font-size:9px"></i> さらに履歴を読み込む (Tải thêm lịch sử cũ hơn…)
            </div>`;
            histList.innerHTML = html;
        }

    };

    window.SACTModule = SACTModule;
    document.addEventListener('DOMContentLoaded', () => {
        window.SACTModule.init();
    });

})();

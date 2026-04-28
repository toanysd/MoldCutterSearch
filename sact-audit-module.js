// v1.0.0-1
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
            cachedHistory: [] // Lưu đệm history tải về
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
        },

        async open() {
            this.state.isOpen = true;
            this.renderLayout();
            await this.loadCampaigns();
        },

        close() {
            this.state.isOpen = false;
            const root = document.getElementById('sact-module-root');
            if (root) root.remove();
            if (this.state.html5QrcodeScanner) {
                try { this.state.html5QrcodeScanner.clear(); } catch (e) { }
            }
            this.state.awaitingCompletionTarget = null;
        },

        renderLayout() {
            let root = document.getElementById('sact-module-root');
            if (root) root.remove();

            root = document.createElement('div');
            root.id = 'sact-module-root';
            root.className = 'sact-overlay';

            root.innerHTML = `
                <div class="sact-header">
                    <div>
                        <h2>SACT 有高確認</h2>
                        <div class="vi-sub">Điểm danh Khuôn Panasonic</div>
                    </div>
                    <button class="sact-close-btn">&times;</button>
                </div>
                <div class="sact-offline-queue ${this.state.offlineQueue.length > 0 ? 'visible' : ''}">
                    Đang có ${this.state.offlineQueue.length} bản ghi lỗi mạng chờ đồng bộ!
                </div>
                <div class="sact-body" id="sact-body">
                    <div style="text-align:center; padding: 20px;">Đang tải chiến dịch...</div>
                </div>
            `;
            document.body.appendChild(root);

            root.querySelector('.sact-close-btn').addEventListener('click', () => this.close());
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
                this.renderCampaignSelection();
            } catch (err) {
                console.error("SACT Campaign Load Error", err);
                document.getElementById('sact-body').innerHTML = `<div style="color:red">Lỗi kết nối CSDL: ${err.message}</div>`;
            }
        },

        renderCampaignSelection() {
            const body = document.getElementById('sact-body');

            let btnCreate = '';
            // CSS Admin Only fallback, hoặc kiểm tra logic Auth
            if (window.currentUserRole === 'admin') {
                btnCreate = `<div style="text-align:right; padding: 10px 15px;"><button class="sact-btn" style="background:#28a745;" onclick="window.SACTModule.showCreateCampaign()">➕ 新規作成 (Tạo Mới)</button></div>`;
            }

            if (this.state.campaigns.length === 0) {
                this.loadDashboard();
                return;
            }

            let html = btnCreate + `<h3 style="padding: 0 15px;">Chọn đợt kiểm kê SACT:</h3>`;
            html += `<div style="padding:0 15px; margin-bottom: 20px;">`;
            this.state.campaigns.forEach(c => {
                html += `
                    <div class="sact-target-card" style="cursor:pointer;" onclick="window.SACTModule.selectCampaign('${c.id}')">
                        <div class="sact-target-head">
                            <h3>${c.name}</h3>
                        </div>
                        <div class="sact-panasonic-id">Hạn chót: ${c.deadline}</div>
                    </div>
                `;
            });
            html += `</div>`;

            // Render thêm cụm Lịch sử ở bên dưới list
            html += `<hr style="border:0; border-top:1px solid #ddd;">
                     <div id="sact-dashboard-area"></div>`;

            body.innerHTML = html;
            this.renderHistorySection(document.getElementById('sact-dashboard-area'));
        },

        async loadDashboard() {
            const body = document.getElementById('sact-body');

            let btnCreate = '';
            if (window.currentUserRole === 'admin') {
                btnCreate = `<div style="text-align:center; margin-bottom:15px;"><button class="sact-btn" style="background:#28a745; width:100%;font-size:16px;" onclick="window.SACTModule.showCreateCampaign()">➕ 新規SACT作成 (Tạo Chiến Dịch Mới)</button></div>`;
            }

            const html = `
                <div style="padding: 15px;">
                    ${btnCreate}
                    <div style="background:#fff3cd; border-left:4px solid #ffc107; padding:15px; border-radius:4px; margin-bottom:20px;">
                        <h4 style="color:#856404; margin-top:0; font-size:15px;"><i class="fas fa-info-circle"></i> Chưa có Chiến dịch hiện hành</h4>
                        <p style="color:#856404; font-size:13px; margin:0; line-height: 1.5;">Bộ phận Quản lý chưa thiết lập đợt kiểm kê SACT mới. Vui lòng chờ thông báo từ Panasonic.</p>
                    </div>

                    <div style="background:white; border:1px solid #ddd; border-radius:8px; padding:15px; margin-bottom:20px; box-shadow:0 2px 4px rgba(0,0,0,0.05);">
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
                    </div>

                    <div id="sact-dashboard-area"></div>
                </div>
            `;
            body.innerHTML = html;
            this.renderHistorySection(document.getElementById('sact-dashboard-area'));
        },

        async selectCampaign(id) {
            this.state.activeCampaign = this.state.campaigns.find(x => x.id === id);
            document.getElementById('sact-body').innerHTML = `<div style="text-align:center;">Đang tải danh sách mục tiêu...</div>`;

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
                document.getElementById('sact-body').innerHTML = `<div style="color:red">Lỗi tải danh sách: ${err.message}</div>`;
            }
        },

        renderTargetList() {
            const body = document.getElementById('sact-body');

            // Xây Box cho mã Scan. Thay vì dùng Camera luôn, cho nhập tay Code/QR Scanner vật lý
            let html = `
                <div style="background:#e0f7fa; padding:15px; border-radius:8px; border:1px solid #03a9f4; display:flex; gap:10px;">
                    <input type="text" id="sact-quick-scan" placeholder="[SCAN MÃ YSD]" style="flex:1; padding:10px; border-radius:6px; border:1px solid #ccc; font-size:16px;">
                    <button class="sact-btn scan" style="flex:none; padding:10px 20px;" onclick="window.SACTModule.openCameraScanner()">📷</button>
                </div>
                <div style="margin-top:10px; margin-bottom:10px;">Danh sách đích (${this.state.targets.length} khuôn):</div>
            `;

            this.state.targets.forEach(t => {
                const sname = t.status === 'Pending' ? 'Chưa chụp SACT' :
                    t.status === 'Missing' ? 'Đã báo mất' :
                        t.status === 'In_Progress' ? 'Đang thực hiện SACT' : 'Hoàn Thành';

                html += `
                    <div class="sact-target-card status-${t.status}" id="target-${t.id}">
                        <div class="sact-target-head">
                            <h3>${t.ysd_code}</h3>
                            <span style="font-weight:bold; font-size:12px;">${sname}</span>
                        </div>
                        <div class="sact-panasonic-id">Panasonic Code: ${t.panasonic_kanagata_no || 'N/A'}</div>
                        <div class="sact-panasonic-id">Tài sản (Shisan): ${t.shisan_no || 'N/A'}</div>
                        
                        ${t.status === 'Pending' ? `
                            <div class="sact-btn-row">
                                <button class="sact-btn scan" onclick="window.SACTModule.startStep2('${t.id}')">✅ Tìm thấy khuôn</button>
                                <button class="sact-btn missing" onclick="window.SACTModule.markMissing('${t.id}')">⚠️ Báo thất lạc</button>
                            </div>
                        ` : ''}
                    </div>
                `;
            });

            body.innerHTML = html;

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
            if (!confirm("Xác nhận khuôn này KHÔNG TÌM THẤY trong xưởng (Báo Lost/Missing)?\n\nAdmin sẽ nhận được cảnh báo.")) return;
            await this.updateStatus(targetId, 'Missing');
        },

        startStep2(targetId) {
            const t = this.state.targets.find(x => x.id === targetId);
            if (!t) return;
            const c = this.state.activeCampaign;

            const body = document.getElementById('sact-body');
            body.innerHTML = `
                <button onclick="window.SACTModule.renderTargetList()" style="background:none; border:none; color:#0056b3; font-size:14px; margin-bottom:10px;">← Quay lại danh sách</button>
                <div class="sact-target-card status-In_Progress">
                    <div class="sact-target-head"><h3>${t.ysd_code}</h3></div>
                    <div class="sact-panasonic-id">Panasonic Kanagata: <strong style="color:black;font-size:16px">${t.panasonic_kanagata_no}</strong></div>
                    <div class="sact-panasonic-id">Shisan No: <strong style="color:black;font-size:16px">${t.shisan_no}</strong></div>
                </div>

                <div class="sact-instruction-panel">
                    <div class="sact-instruction-jp">${c.instruction_text_jp || 'パナソニックSACTシステムを開き、金型の写真とGPS位置を提出してください。'}</div>
                    <hr style="margin:10px 0; border:0; border-top:1px dashed #ccc;">
                    <div class="sact-instruction-vi">${c.instruction_text_vi || 'Mở hệ thống Panasonic SACT, nộp ảnh khuôn kèm vị trí GPS hiện tại.'}</div>
                </div>

                <label class="sact-gps-check">
                    <input type="checkbox" id="gps-check">
                    <span>🔲 Tôi ĐÃ BẬT định vị GPS trên điện thoại này. (必須)</span>
                </label>

                <button class="sact-btn open-pana" onclick="window.SACTModule.launchSact('${t.id}')">🚀 MỞ TRANG SACT PANASONIC</button>
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

            const body = document.getElementById('sact-body');
            body.innerHTML = `
                <div style="text-align:center; padding-top:40px;">
                    <h2 style="color:#0056b3; font-size:24px; margin-bottom:10px;">✅ Đã Khai Báo Xong SACT?</h2>
                    <p style="color:#666; margin-bottom:30px;">Vui lòng xác nhận bạn đã tải ảnh và gửi thành công trên cổng Panasonic.</p>
                    <div class="sact-target-card status-Pending" style="text-align:left;">
                        <h3>${t.ysd_code}</h3>
                    </div>
                    <button class="sact-btn finish-task" onclick="window.SACTModule.finishTarget('${targetId}')">🔒 XÁC NHẬN HOÀN TẤT & KHÓA LẠI</button>
                    <button class="sact-btn missing" style="margin-top:15px; width:100%; background:#9e9e9e;" onclick="window.SACTModule.cancelCompletion()">❌ Chưa làm xong (Hủy)</button>
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
            const body = document.getElementById('sact-body');
            this.state.newCampaignTargets = [];
            const d = new Date();
            const yearStr = d.getFullYear();
            const monthStr = ('0' + (d.getMonth() + 1)).slice(-2);
            const defaultName = `[SACT] ${yearStr}-${monthStr}`;
            const ymd = `${yearStr}-${monthStr}-28`;

            body.innerHTML = `
                <div style="padding:15px; position:relative;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h3 style="margin:0; color:#0056b3;"><i class="fas fa-plus-circle"></i> SACT新規作成 (Tạo Chiến Dịch)</h3>
                        <button onclick="window.SACTModule.loadDashboard()" class="sact-close-btn" style="color:red; background:none; border:none; font-size:24px; top:10px; right:10px; position:absolute;">&times;</button>
                    </div>
                    
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
                let h = '';
                this.state.searchMatches = matches;
                this.state.searchIndex = 0;
                matches.forEach((m, idx) => {
                    const c = m.MoldName || m.displayName || m.MoldCode || 'Unknown';
                    const c_disp = c.replace(/'/g, "\\'");
                    const bg = idx === 0 ? '#e3f2fd' : 'white';
                    const borderLeft = idx === 0 ? '4px solid #0056b3' : '4px solid transparent';

                    h += `<div id="sact-item-${idx}" style="padding:12px 10px; border-bottom:1px solid #eee; cursor:pointer; background:${bg}; border-left:${borderLeft};" onmousedown="window.SACTModule.addMoldTarget('${c_disp}')" onmouseout="if(window.SACTModule.state.searchIndex !== ${idx}) { this.style.background='white'; this.style.borderLeft='4px solid transparent'; }" onmouseover="window.SACTModule.setSearchIndex(${idx})">
                        <strong style="color:#0056b3;">${c}</strong> <span style="font-size:12px; color:#666;">(${m.CustomerName || m.displayCustomer || m.Customer || ''})</span>
                    </div>`;
                });
                resDiv.innerHTML = h;
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
            // Render ngược (mới thêm lên đầu)
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

            if (!confirm(`⚠️ Xác nhận tạo đợt kiểm kê SACT MỚI?
- Tên đợt: ${name}
- Số lượng: ${this.state.newCampaignTargets.length} khuôn mục tiêu

Sẽ ghi trực tiếp lên Supabase Database.`)) return;

            document.getElementById('sact-body').innerHTML = `<div style="padding:40px 20px; text-align:center;">
                <i class="fas fa-spinner fa-spin" style="font-size:30px; color:#0056b3; margin-bottom:15px;"></i>
                <br>Đang khởi tạo Database và nạp khuôn...
            </div>`;

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
                this.loadDashboard();
            }
        },

        // --- LỊCH SỬ CHUYÊN NGOẠI ---
        renderHistorySection(container) {
            container.innerHTML = `
            < div style = "background:white; border:1px solid #ddd; border-radius:8px; padding:15px; box-shadow:0 2px 4px rgba(0,0,0,0.05);" >
                    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #28a745; padding-bottom:10px; margin-bottom:10px;">
                        <h3 style="margin:0; color:#28a745; font-size:16px;">
                            <i class="fas fa-history"></i> 履歴 (Quản Lý Lịch Sử Khai Báo SACT)
                        </h3>
                    </div>
                    <div style="display:flex; gap:10px; margin-bottom:15px; flex-wrap:wrap;">
                        <div style="flex:1; min-width:80px;">
                            <label style="font-size:12px; color:#666;"><i class="far fa-calendar-alt"></i> Năm:</label>
                            <input type="text" id="sact-hist-year" value="${this.state.historyFilterYear}" placeholder="2026..." style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
                        </div>
                        <div style="flex:2; min-width:150px;">
                            <label style="font-size:12px; color:#666;"><i class="fas fa-search"></i> Mã khách hàng / Khuôn:</label>
                            <input type="text" id="sact-hist-code" value="${this.state.historyFilterCode}" placeholder="Tìm theo mã YSD..." style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box;">
                        </div>
                        <div style="display:flex; align-items:flex-end;">
                            <button onclick="window.SACTModule.fetchAndRenderHistory()" style="background:#17a2b8; color:white; border:none; padding:9px 15px; border-radius:4px; font-weight:bold; cursor:pointer;"><i class="fas fa-filter"></i> Lọc (検索)</button>
                        </div>
                    </div>
                    <div id="sact-hist-list" style="min-height:150px; max-height:400px; overflow-y:auto; border:1px solid #eee; border-radius:4px; padding:5px; background:#fafafa;">Đang tải dữ liệu...</div>
                </div >
        `;
            this.fetchAndRenderHistory();
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

            if (filtered.length === 0) {
                histList.innerHTML = `<div style="color:#aaa; font-style:italic; padding:15px; text-align:center;">Không có lịch sử SACT nào theo điều kiện lọc.</div>`;
                return;
            }

            const html = filtered.map(h => {
                const dt = new Date(h.created_at);
                const d = dt.toLocaleDateString('ja-JP') + ' ' + dt.toLocaleTimeString('vi-VN');
                const statusColor = h.status === 'Completed' ? '#28a745' : '#ff9800';
                const statusName = h.status === 'Completed' ? '✔ Xác nhận' : '⚠️ Đang chờ';
                const mold = (h.sact_targets && h.sact_targets.ysd_code) ? h.sact_targets.ysd_code : 'Mã đã xóa';
                const cmp = (h.sact_campaigns && h.sact_campaigns.name) ? h.sact_campaigns.name : 'Chiến dịch vô danh';

                return `
                    <div style="background:white; border-bottom: 1px solid #e1e8ed; padding: 12px; margin-bottom:5px; border-radius:4px;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                            <strong style="color:#0056b3; font-size:15px;">${mold}</strong>
                            <span style="background:${statusColor}; color:white; font-weight:bold; font-size:11px; padding:3px 8px; border-radius:12px;">${statusName}</span>
                        </div>
                        <div style="color:#666; font-size:13px; display:flex; align-items:center; gap:5px;">
                            <i class="far fa-clock"></i> ${d} &nbsp;&nbsp; 
                            <i class="far fa-user"></i> ${h.user_name || 'Hệ thống'}
                        </div>
                        <div style="color:#888; font-size:12px; margin-top:5px; display:flex; align-items:center; gap:5px;">
                            <i class="fas fa-tag"></i> <span>${cmp}</span>
                        </div>
                    </div >
        `;
            }).join('');
            histList.innerHTML = html;
        }

    };

    window.SACTModule = SACTModule;
    document.addEventListener('DOMContentLoaded', () => {
        window.SACTModule.init();
    });

})();

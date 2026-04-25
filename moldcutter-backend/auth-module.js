// v9.2.0
/**
 * AuthModule.js (Mô-đun Xác Thực Bảo Mật)
 * Cung cấp giải pháp đăng nhập, tự động làm mới session (refresh token),
 * xử lý API call (đính kèm JWT) và lắng nghe lỗi 401 từ hệ thống.
 */

(function () {
    'use strict';

    const VERSION = 'v9.2.0';

    const AuthModule = {
        session: null,
        userRole: 'viewer',

        /**
         * 1. Khởi tạo: Lắng nghe trạng thái đăng nhập từ Supabase
         */
        init: async function () {
            if (!window.supabase) {
                console.error('[Auth] Thiếu thư viện Supabase');
                return;
            }

            // Đăng ký listener để nhận notification khi token cập nhật
            window.supabase.auth.onAuthStateChange(async (event, session) => {
                console.log(`[Auth] Sự kiện: ${event}`);
                this.session = session;

                if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                    // Đóng modal đăng nhập nếu có
                    const loginModal = document.getElementById('login-overlay');
                    if (loginModal) loginModal.style.display = 'none';

                    // Khôi phục giao diện chính
                    const appContainer = document.querySelector('.app-container');
                    if (appContainer) appContainer.style.display = 'flex';

                    // Lấy user role từ cơ sở dữ liệu
                    await this.fetchUserRole();
                    this.updateProfileUI();
                }

                if (event === 'SIGNED_OUT') {
                    this.triggerLockdown();
                }
            });

            // Kiểm tra session hiện tại khi bật app
            const { data } = await window.supabase.auth.getSession();
            if (data && data.session) {
                this.session = data.session;
                await this.fetchUserRole();
                this.updateProfileUI();
            } else {
                this.session = null;
                this.triggerLockdown();
            }
        },

        /**
         * 2. Lấy Role của User từ Supabase Database
         */
        fetchUserRole: async function () {
            if (!this.session || !this.session.user) return;
            try {
                // Table user_roles được định nghĩa trên Supabase: id (hoặc user_id), role_name
                const { data, error } = await window.supabase
                    .from('user_roles')
                    .select('role_name')
                    .eq('user_id', this.session.user.id)
                    .single();

                if (!error && data) {
                    this.userRole = data.role_name || 'viewer';
                }
            } catch (err) {
                console.warn('[Auth] Không lấy được Role, mặc định là viewer', err);
            }
        },

        /**
         * 3. Xử lý API Interceptor (Gắn Header / Bắt 401)
         */
        fetchSecure: async function (url, options = {}) {
            // Nếu mất auth, báo lỗi luôn để dừng luồng
            if (!this.session || !this.session.access_token) {
                this.triggerSessionExpired();
                throw new Error("Không có JWT Token");
            }

            // Gắn Authorization Bearer
            if (!options.headers) options.headers = {};
            options.headers['Authorization'] = `Bearer ${this.session.access_token}`;
            options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';

            try {
                const response = await fetch(url, options);

                // Xử lý mất mạng hoặc server đá văng 401
                if (response.status === 401) {
                    this.triggerSessionExpired();
                    throw new Error("Phiên làm việc hết hạn hoặc Access Denied (401)");
                }

                return response;
            } catch (err) {
                if (err.message === 'Failed to fetch') {
                    // Có thể do rớt mạng hoặc backend Render ngủ đông (timeout)
                    console.error('[Auth] Lỗi kết nối đến Backend');
                }
                throw err;
            }
        },

        /**
         * 4. Giao diện Lockdown (Khóa Ứng dụng)
         */
        triggerLockdown: function () {
            console.log('[Auth] Kích hoạt khóa bảo mật ứng dụng');
            const appContainer = document.querySelector('.app-container');
            if (appContainer) appContainer.style.display = 'none';

            let loginModal = document.getElementById('login-overlay');
            if (!loginModal) {
                this.createLoginUI();
                loginModal = document.getElementById('login-overlay');
            }
            loginModal.style.display = 'flex';
        },

        /**
         * 5. Thoát (Đăng xuất / Session Expired)
         */
        triggerSessionExpired: async function () {
            console.warn('[Auth] Phiên làm việc đã hủy/hết hạn. Vui lòng đăng nhập lại.');
            if (window.supabase) {
                await window.supabase.auth.signOut();
            }
            alert('Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.');
            window.location.reload();
        },

        logout: async function () {
            if (window.supabase) {
                await window.supabase.auth.signOut();
            }
            window.location.reload();
        },

        /**
         * 6. Cập nhật Sidebar Profile UI
         */
        updateProfileUI: function () {
            const emailText = this.session?.user?.email || 'Unknown';
            // Cập nhật lên Sidebar
            let profileBlock = document.getElementById('sidebar-user-profile');
            if (!profileBlock) {
                const sidebarNav = document.querySelector('.sidebar-nav');
                if (sidebarNav) {
                    sidebarNav.insertAdjacentHTML('beforeend', `
                        <div class="nav-section" id="sidebar-user-profile" style="margin-top:auto; padding-top: 10px; border-top: 1px solid var(--mcs-border);">
                            <div class="nav-section-title" style="margin-bottom: 8px;">
                                <i class="fas fa-user-circle"></i> <span>Profile</span>
                            </div>
                            <div style="color: var(--mcs-text-secondary); font-size: 13px; padding: 0 16px; margin-bottom: 4px; word-break: break-all;">
                                <span id="auth-email-display">${emailText}</span>
                            </div>
                            <div style="color: var(--mcs-text-muted); font-size: 11px; padding: 0 16px; margin-bottom: 12px; text-transform: uppercase;">
                                Role: <b id="auth-role-display">${this.userRole}</b>
                            </div>
                            <ul class="nav-items">
                                <li class="nav-item">
                                    <a href="#" class="nav-link text-danger" onclick="window.AuthModule.logout()">
                                        <i class="fas fa-sign-out-alt" style="color:#ef4444;"></i>
                                        <div class="nav-link-text">
                                            <span class="ja">ログアウト</span>
                                            <span class="vi">Đăng xuất</span>
                                        </div>
                                    </a>
                                </li>
                            </ul>
                        </div>
                    `);
                }
            } else {
                const mailEl = document.getElementById('auth-email-display');
                if (mailEl) mailEl.textContent = emailText;
                const roleEl = document.getElementById('auth-role-display');
                if (roleEl) roleEl.textContent = this.userRole;
            }

            // Cập nhật Action Button (RBAC Logic)
            if (this.userRole === 'viewer') {
                document.querySelectorAll('.btn-action:not(.primary), .btn-detail-action:not(.info)').forEach(el => {
                    if (!el.classList.contains('fa-camera') && !el.classList.contains('fa-qrcode')) {
                        el.style.display = 'none';
                    }
                });
            }
        },

        /**
         * 7. Sinh HTML Giao diện Login
         */
        createLoginUI: function () {
            const html = `
                <div id="login-overlay" style="position:fixed; inset:0; z-index:999999; background: var(--mcs-bg); display:none; align-items:center; justify-content:center;">
                    <div class="login-card">
                        <div class="login-header">
                            <i class="fas fa-search" style="font-size: 32px; color: var(--mcs-primary); margin-bottom: 16px;"></i>
                            <h2 style="margin:0; font-size: 20px; color: var(--mcs-text);">MoldCutter System</h2>
                            <p style="margin:4px 0 0 0; font-size: 13px; color: var(--mcs-text-secondary);">YSD Authentication</p>
                        </div>
                        <div class="login-body">
                            <form id="auth-login-form" onsubmit="event.preventDefault(); window.AuthModule.doLogin();">
                                <div class="form-group" style="margin-bottom: 16px;">
                                    <label style="display:block; font-size: 13px; margin-bottom: 6px; color: var(--mcs-text-secondary);">Email</label>
                                    <input type="email" id="auth-email-input" required autocomplete="email" style="width: 100%; padding: 10px 12px; border: 1px solid var(--mcs-border); border-radius: 6px; background: var(--mcs-surface); color: var(--mcs-text); font-size: 14px;">
                                </div>
                                <div class="form-group" style="margin-bottom: 24px;">
                                    <label style="display:block; font-size: 13px; margin-bottom: 6px; color: var(--mcs-text-secondary);">Mật khẩu (Password)</label>
                                    <input type="password" id="auth-password-input" required autocomplete="current-password" style="width: 100%; padding: 10px 12px; border: 1px solid var(--mcs-border); border-radius: 6px; background: var(--mcs-surface); color: var(--mcs-text); font-size: 14px;">
                                </div>
                                <button type="submit" id="auth-submit-btn" style="width: 100%; padding: 12px; background: var(--mcs-primary); color: white; font-weight: 600; border: none; border-radius: 6px; cursor: pointer;">Đăng nhập / ログイン</button>
                            </form>
                            <div id="auth-error-msg" style="color: #ef4444; font-size: 13px; margin-top: 16px; text-align: center; display: none;"></div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', html);
        },

        doLogin: async function () {
            const emailInput = document.getElementById('auth-email-input').value;
            const passInput = document.getElementById('auth-password-input').value;
            const btn = document.getElementById('auth-submit-btn');
            const err = document.getElementById('auth-error-msg');

            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang xử lý...';
            err.style.display = 'none';

            try {
                const { data, error } = await window.supabase.auth.signInWithPassword({
                    email: emailInput,
                    password: passInput
                });

                if (error) {
                    throw new Error(error.message);
                }
                // Nếu thành công -> onAuthStateChange sẽ tự động ẩn modal.
            } catch (e) {
                err.textContent = e.message;
                err.style.display = 'block';
                btn.disabled = false;
                btn.innerHTML = 'Đăng nhập / ログイン';
            }
        }
    };

    window.AuthModule = AuthModule;

    // Kích hoạt khi trang tải xong
    document.addEventListener('DOMContentLoaded', () => {
        // Tắt App Modal ban đầu cho an toàn
        const appContainer = document.querySelector('.app-container');
        if (appContainer) appContainer.style.display = 'none';

        // Đợi Supabase Config khởi tạo xong thì mới check login
        document.addEventListener('supabase-configready', () => {
            AuthModule.init();
        });
    });

})();

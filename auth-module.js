// v10.0.0-PubSub
(function (global) {
    'use strict';

    // ==========================================
    // Auth Module for MoldCutterSearch
    // Chịu trách nhiệm hiển thị/ẩn Login Overlay 
    // và thiết lập JWT vào Global App
    // ==========================================

    var loginOverlay = document.getElementById('login-overlay');
    var appContainer = document.getElementById('main-app-container') || document.querySelector('.app-container');
    var loginForm = document.getElementById('auth-login-form');
    var emailInput = document.getElementById('auth-email');
    var passInput = document.getElementById('auth-password');
    var errorMsg = document.getElementById('auth-error-msg');
    var submitBtn = document.getElementById('auth-submit-btn');

    // Kiểm tra tính sẵn sàng của Supabase từ supabase-config.js
    if (!global.supabase) {
        console.error('[Auth Guard] Chưa Load được Supabase SDK!');
        return;
    }

    // Lấy config URL và Key từ LocalStorage / SupabaseConfig
    var cfg = global.SupabaseConfig ? global.SupabaseConfig.get() : null;
    if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
        console.error('[Auth Guard] Không chạy được: Thiếu Supabase Config');
        return;
    }

    // Khởi tạo Supabase Client thực thụ mang sức mạnh gọi API
    var supabaseClient = global.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

    // Biến lưu trữ Menu
    var topbarLoginBtn = document.getElementById('topbarLoginBtn');
    var topbarAvatarBtn = document.getElementById('topbarAvatarBtn');
    var authMenuDropdown = document.getElementById('authMenuDropdown');
    var authMenuLogoutBtn = document.getElementById('authMenuLogoutBtn');
    var authMenuUserEmail = document.getElementById('authMenuUserEmail');

    var sidebarLoginItem = document.getElementById('sidebarLoginItem');
    var sidebarAuthLoginBtn = document.getElementById('sidebarAuthLoginBtn');
    var sidebarUserItem = document.getElementById('sidebarUserItem');
    var sidebarAuthUserEmail = document.getElementById('sidebarAuthUserEmail');
    var sidebarLogoutItem = document.getElementById('sidebarLogoutItem');
    var sidebarAuthLogoutBtn = document.getElementById('sidebarAuthLogoutBtn');

    // Mở Modal Login
    if (topbarLoginBtn) {
        topbarLoginBtn.addEventListener('click', function () {
            if (loginOverlay) loginOverlay.style.display = 'flex';
            if (loginForm) loginForm.style.display = 'flex';
            var authLoader = document.getElementById('auth-loading-ui');
            if (authLoader) authLoader.style.display = 'none';
        });
    }
    if (sidebarAuthLoginBtn) {
        sidebarAuthLoginBtn.addEventListener('click', function (e) {
            e.preventDefault();
            if (loginOverlay) loginOverlay.style.display = 'flex';
            if (loginForm) loginForm.style.display = 'flex';
            var authLoader = document.getElementById('auth-loading-ui');
            if (authLoader) authLoader.style.display = 'none';
        });
    }

    // Tắt Modal Login (Bấm nút X)
    var loginCloseBtn = document.getElementById('login-close-btn');
    if (loginCloseBtn) {
        loginCloseBtn.addEventListener('click', function () {
            if (loginOverlay) loginOverlay.style.display = 'none';
        });
    }

    // Auto-fill Remembered Email
    if (emailInput) {
        var remembered = localStorage.getItem('mcs-remembered-email');
        if (remembered) {
            emailInput.value = remembered;
            var rememberCheckbox = document.getElementById('auth-remember');
            if (rememberCheckbox) rememberCheckbox.checked = true;
        }
    }

    // Bật/tắt Dropdown Avatar
    if (topbarAvatarBtn) {
        topbarAvatarBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (authMenuDropdown) {
                authMenuDropdown.style.display = authMenuDropdown.style.display === 'none' ? 'block' : 'none';
            }
        });
    }

    // Bấm ra ngoài thì tắt Dropdown
    document.addEventListener('click', function () {
        if (authMenuDropdown) authMenuDropdown.style.display = 'none';
    });

    // Bấm Đăng Xuất
    if (authMenuLogoutBtn) {
        authMenuLogoutBtn.addEventListener('click', async function () {
            console.log('[Auth Guard] Đang tiến hành Đăng Xuất...');
            await supabaseClient.auth.signOut();
        });
    }
    if (sidebarAuthLogoutBtn) {
        sidebarAuthLogoutBtn.addEventListener('click', async function (e) {
            e.preventDefault();
            console.log('[Auth Guard - Mobile] Đang tiến hành Đăng Xuất...');
            await supabaseClient.auth.signOut();
        });
    }

    function showAppAsLoggedIn(session) {
        if (loginOverlay) loginOverlay.style.display = 'none';
        if (appContainer) appContainer.style.display = 'flex';

        var es = document.getElementById('app-empty-state-banner');
        if (es) es.style.display = 'none';

        if (window.ViewManager && typeof window.ViewManager.switchView === 'function') {
            window.ViewManager.switchView(window.ViewManager.currentView || 'mold');
        } else {
            var moldView = document.getElementById('mcs-view-mold');
            if (moldView) moldView.style.display = 'flex';
        }

        if (window.app && window.app.currentView && typeof window.app.switchView === 'function') {
            window.app.switchView(window.app.currentView);
        }

        // Cập nhật Topbar
        if (topbarLoginBtn) topbarLoginBtn.style.display = 'none';
        if (topbarAvatarBtn) {
            topbarAvatarBtn.style.display = 'flex';
            if (session && session.user && session.user.email) {
                var emailParts = session.user.email.split('@')[0];
                // Lấy Cột Mốc 1 hoặc 2 chữ cái đầu Tiên Tiến
                topbarAvatarBtn.innerText = emailParts.substring(0, 1).toUpperCase();
                if (authMenuUserEmail) authMenuUserEmail.innerText = session.user.email;
            }
        }

        // Cập nhật mảng Mobile Sidebar
        if (sidebarLoginItem) sidebarLoginItem.style.display = 'none';
        if (sidebarUserItem) {
            sidebarUserItem.style.display = 'block';
            if (session && session.user && session.user.email) {
                if (sidebarAuthUserEmail) sidebarAuthUserEmail.innerText = session.user.email;
            }
        }
        if (sidebarLogoutItem) sidebarLogoutItem.style.display = 'block';

        // Kích hoạt Lưới Kỷ Luật: Cắt/Mở khóa giao diện dựa trên quyền
        if (typeof global.applyRBACRules === 'function' && global.currentUserRole) {
            global.applyRBACRules(global.currentUserRole);
        }

        // Bật Delta Sync V10 nền
        if (global.DataManager && typeof global.DataManager.startBackgroundDeltaSync === 'function') {
            global.DataManager.startBackgroundDeltaSync();
        }
    }

    function showAppAsEmptyState() {
        if (loginOverlay) loginOverlay.style.display = 'none';
        if (appContainer) appContainer.style.display = 'flex';
        if (loginForm) loginForm.style.display = 'flex';

        var authLoader = document.getElementById('auth-loading-ui');
        if (authLoader) authLoader.style.display = 'none';

        var es = document.getElementById('app-empty-state-banner');
        if (es) es.style.display = 'flex';

        var areas = document.querySelectorAll('.content-area:not(#app-empty-state-banner)');
        areas.forEach(function (a) { a.style.display = 'none'; });

        // Cập nhật Topbar cất Avatar đi, bật nút Login
        if (topbarAvatarBtn) topbarAvatarBtn.style.display = 'none';
        if (topbarLoginBtn) topbarLoginBtn.style.display = 'flex';
        if (authMenuDropdown) authMenuDropdown.style.display = 'none';

        // Cập nhật mảng Mobile Sidebar
        if (sidebarLoginItem) sidebarLoginItem.style.display = 'block';
        if (sidebarUserItem) sidebarUserItem.style.display = 'none';
        if (sidebarLogoutItem) sidebarLogoutItem.style.display = 'none';
    }

    // 1. Phản ứng ngay khi thay đổi phiên mã xác thực (onAuthStateChange/INITIAL_SESSION)
    supabaseClient.auth.onAuthStateChange(function (event, session) {
        console.log('[Auth Guard] Trạng thái Auth Event:', event);

        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            if (session) {
                // Đã Đăng Nhập
                global.__MCS_JWT__ = session.access_token;
                console.log('[Auth Guard] Đã đăng nhập vào User UUID:', session.user.id);

                // --------- THĂM DÒ ROLE (PROBE) ---------
                console.log('========= BÁO CÁO NHẬN DIỆN ROLE =========');
                console.dir(session.user); // Xem trọn gói object

                // Trích xuất Role triệt để từ Metadata
                var finalRole = 'viewer'; // Giáng quyền tuyệt đối mặc định
                if (session.user.app_metadata && session.user.app_metadata.role) {
                    finalRole = session.user.app_metadata.role;
                } else if (session.user.user_metadata && session.user.user_metadata.role) {
                    finalRole = session.user.user_metadata.role;
                } else if (session.user.role === 'admin') {
                    finalRole = 'admin'; // Phòng hờ Supabase core claim
                }

                global.currentUserRole = finalRole;
                console.log('-> app_metadata:', session.user.app_metadata);
                console.log('-> user_metadata:', session.user.user_metadata);
                console.log('-> QUYỀN HẠN CHÍNH THỨC:', finalRole);
                console.log('============================================');
                // ----------------------------------------

                // Nếu app chưa kéo DataManager thì tạm khóa màn hình login và show Ui Loading
                if (global.DataManager && !global.DataManager.loaded && typeof global.DataManager.loadAllData === 'function') {
                    console.log('🚀 Auth Guard: Đang tiến hành kéo CSV máy chủ...');

                    if (loginOverlay) loginOverlay.style.display = 'none'; // SỬA LỖI: Luôn ẩn Overlay lúc đang tải, tránh Flash Login
                    if (loginForm) loginForm.style.display = 'none'; // Ẩn form nhập liệu

                    // Bật UI Loading xịn
                    var authLoader = document.getElementById('auth-loading-ui');
                    if (authLoader) authLoader.style.display = 'flex';

                    global.DataManager.loadAllData().then(function () {
                        showAppAsLoggedIn(session);
                    }).catch(function (e) {
                        console.error('❌ Lỗi DataManager rớt mạng hoặc 404:', e);
                        showAppAsLoggedIn(session); // Vẫn cho phép vào để user thấy grid trắng
                    });
                } else {
                    showAppAsLoggedIn(session);
                }

            } else {
                // Chưa Đăng Nhập
                global.__MCS_JWT__ = null;
                showAppAsEmptyState();
            }
        }
        else if (event === 'SIGNED_OUT') {
            global.__MCS_JWT__ = null;
            showAppAsEmptyState();
            // Đợi 200ms để Supabase dọn sạch LocalStorage Session triệt để
            setTimeout(function () {
                location.reload(true);
            }, 300);
        }
    });

    // 2. Xử lý Form Submit Login 
    if (loginForm) {
        loginForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            var email = emailInput.value.trim();
            var pwd = passInput.value;
            var rememberCheckbox = document.getElementById('auth-remember');

            if (!email || !pwd) return;

            // Xử lý Remember Me (Giữ lại Email cho lần sau để Autofill)
            if (rememberCheckbox && rememberCheckbox.checked) {
                localStorage.setItem('mcs-remembered-email', email);
            } else {
                localStorage.removeItem('mcs-remembered-email');
            }

            // Chuyển UI nút Submit sang Loading state
            errorMsg.style.display = 'none';
            submitBtn.disabled = true;
            submitBtn.innerText = 'Đang kết nối...';

            // Gọi hàm SignIn
            var res = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: pwd
            });

            // Khôi phục nút
            submitBtn.disabled = false;
            submitBtn.innerText = 'ログイン / Đăng nhập';

            // Nếu Lỗi
            if (res.error) {
                if (res.error.message.includes('Invalid login credentials')) {
                    showError('Thông tin đăng nhập Không hợp lệ (Sai email hoặc mật khẩu).');
                } else {
                    showError(res.error.message);
                }
                console.error('[Auth Guard] Lỗi Đăng Nhập:', res.error);
            } else {
                // Thành công -> onAuthStateChange phía trên sẽ được gọi tự động (SIGNED_IN)
                console.log('[Auth Guard] Login Passed!');
                emailInput.value = '';
                passInput.value = '';
            }
        });
    }

    // (Tuỳ chọn) Tạo hàm Logout Toàn cầu để gọi từ giao diện Menu
    global.McsSignOut = async function () {
        await supabaseClient.auth.signOut();
    };

    // ==========================================
    // 3. LƯỚI PHÂN QUYỀN (RBAC GUARD)
    // Thiết lập vùng cấm dành cho Viewer
    // ==========================================
    global.applyRBACRules = function (role) {
        var styleId = 'rbac-style-enforcer';
        var styleEl = document.getElementById(styleId);
        if (styleEl) styleEl.remove();

        if (role !== 'admin') {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            styleEl.innerHTML =
                '/* RBAC Ẩn Giao Diện Dành Cho Tài Khoản VIEWER */\n' +
                '.admin-only, [data-rbac="admin"] { display: none !important; }\n' +
                '/* Nút Chụp Ảnh, Upload Ảnh, Quick Update */\n' +
                '#dpPhotosBtnAdd, #dpPhotosAddBtn, #topbarPhotoBtn, #btnTopUploadPhoto, .photo-upload-btn, .action-quick-update { display: none !important; }\n' +
                '/* Nút Lưu, Chỉnh Sửa, Update Context */\n' +
                '#dpEditBtn, #dpExtendedEditBtn, #dpSaveBtn, .btn-save, .btn-edit, .edit-mode-btn, .action-btn-update { display: none !important; }\n' +
                '/* Cột/Nút xoá (Delete) */\n' +
                '#dpDeleteBtn, .btn-delete, .action-btn-delete { display: none !important; }\n';
            document.head.appendChild(styleEl);
            console.log('[RBAC Guard] 🛡️ KÍCH HOẠT LƯỚI BẢO VỆ VIEWER - Đã chặn các tính năng thay đổi dữ liệu');
        } else {
            console.log('[RBAC Guard] 🔓 TÀI KHOẢN ADMIN - Bản quyền truy cập mức cao nhất');
        }
    };

    // Xuất client ra global để các file khác có thể gọi API nếu cần
    global.supabaseClient = supabaseClient;

    // ==========================================
    // 3. Global Fetch Interceptor (Tự động chèn JWT)
    // Tránh việc phải sửa hàng chục file đang chạy
    // ==========================================
    var originalFetch = global.fetch;
    global.fetch = function (resource, config) {
        var urlStr = '';
        if (typeof resource === 'string') {
            urlStr = resource;
        } else if (resource && resource.url) {
            urlStr = resource.url;
        }

        var isBackendRequest = typeof urlStr === 'string' && (urlStr.includes('ysd-moldcutter-backend.onrender.com') || urlStr.startsWith('/api/'));

        if (isBackendRequest && global.__MCS_JWT__) {
            config = config || {};
            config.headers = config.headers || {};

            if (typeof Headers !== 'undefined' && config.headers instanceof Headers) {
                config.headers.set('Authorization', 'Bearer ' + global.__MCS_JWT__);
            } else {
                // clone object để tránh mutate readonly headers nếu có
                var newHeaders = Object.assign({}, config.headers);
                newHeaders['Authorization'] = 'Bearer ' + global.__MCS_JWT__;
                config.headers = newHeaders;
            }
        }
        return originalFetch.call(this, resource, config);
    };

})(window);

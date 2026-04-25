// v9.0.2
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

    function showApp() {
        if (loginOverlay) loginOverlay.style.display = 'none';
        // Hiển thị lại Container chính
        if (appContainer) {
            appContainer.style.display = 'flex'; // Dựa vào kiến trúc flex mặc định
        }

        // Khôi phục lại form nếu lần sau đăng xuất
        if (loginForm) loginForm.style.display = 'flex';
        var authLoader = document.getElementById('auth-loading-ui');
        if (authLoader) authLoader.style.display = 'none';
    }

    function showLogin() {
        if (loginOverlay) loginOverlay.style.display = 'flex';
        // Ẩn nội dung để khóa truy cập
        if (appContainer) {
            appContainer.style.display = 'none';
        }

        // Hiện form, ẩn loading
        if (loginForm) loginForm.style.display = 'flex';
        var authLoader = document.getElementById('auth-loading-ui');
        if (authLoader) authLoader.style.display = 'none';
    }

    // 1. Phản ứng ngay khi thay đổi phiên mã xác thực (onAuthStateChange/INITIAL_SESSION)
    supabaseClient.auth.onAuthStateChange(function (event, session) {
        console.log('[Auth Guard] Trạng thái Auth Event:', event);

        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            if (session) {
                // Đã Đăng Nhập
                global.__MCS_JWT__ = session.access_token;
                console.log('[Auth Guard] Đã đăng nhập vào User UUID:', session.user.id);

                // Nếu app chưa kéo DataManager thì tạm khóa màn hình login và show Ui Loading
                if (global.DataManager && !global.DataManager.loaded && typeof global.DataManager.loadAllData === 'function') {
                    console.log('🚀 Auth Guard: Đang tiến hành kéo CSV máy chủ...');

                    if (loginOverlay) loginOverlay.style.display = 'flex';
                    if (loginForm) loginForm.style.display = 'none'; // Ẩn form nhập liệu

                    // Bật UI Loading xịn
                    var authLoader = document.getElementById('auth-loading-ui');
                    if (authLoader) authLoader.style.display = 'flex';

                    global.DataManager.loadAllData().then(function () {
                        showApp();
                    }).catch(function (e) {
                        console.error('❌ Lỗi DataManager rớt mạng hoặc 404:', e);
                        showApp(); // Vẫn cho phép vào để user thấy grid trắng
                    });
                } else {
                    showApp();
                }

            } else {
                // Chưa Đăng Nhập
                global.__MCS_JWT__ = null;
                showLogin();
            }
        }
        else if (event === 'SIGNED_OUT') {
            global.__MCS_JWT__ = null;
            showLogin();
        }
    });

    // 2. Xử lý Form Submit Login 
    if (loginForm) {
        loginForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            var email = emailInput.value.trim();
            var pwd = passInput.value;

            if (!email || !pwd) return;

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

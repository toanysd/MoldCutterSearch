/**
 * plastic-integration-patch.js — NON-MODULE BUILD v8.1.2
 * Tích hợp module Vật liệu Nhựa vào MoldCutterSearch
 * Tự tạo supabase client từ SupabaseConfig hoặc window.supabase.createClient
 */

(function () {
  'use strict';

  var _initialized = false;
  var _supabaseClient = null;

  // ============================================================
  // TẠO SUPABASE CLIENT
  // ============================================================

  function buildSupabaseClient() {
    // Luôn ưu tiên dùng SupabaseCSVAdapter theo chiến lược Mock Proxy (Giai đoạn 2)
    if (window.SupabaseCSVAdapter) {
      if (!window.supabaseClient) {
        window.supabaseClient = new window.SupabaseCSVAdapter();
      }
      return window.supabaseClient;
    }

    // Nếu quay về Giai đoạn 3 (Supabase thật), bổ sung cấu hình ở đây:
    // ...
    
    return null;
  }

  // ============================================================
  // KHỞI TẠO MODULE NHỰA
  // ============================================================

  function initPlasticModule() {
    if (_initialized) return;

    var supabase = buildSupabaseClient();
    var root = document.getElementById('plastic-app-root');

    if (!supabase) {
      console.error('[PlasticIntegration] Không tạo được supabase client.');
      if (root) root.innerHTML =
        '<div style="padding:20px;background:#fff3cd;border:1px solid #ffc107;border-radius:10px;color:#856404;font-family:sans-serif;">' +
        '⚠️ Chưa kết nối được Supabase. Hãy mở hệ thống qua HTTP server thay vì file://.' +
        '</div>';
      return;
    }

    if (!window.PlasticAppEntry) {
      console.error('[PlasticIntegration] Không tìm thấy PlasticAppEntry.');
      if (root) root.innerHTML =
        '<div style="padding:20px;background:#f8d7da;border:1px solid #f5c6cb;border-radius:10px;color:#721c24;font-family:sans-serif;">' +
        '⚠️ Chưa load được plastic-app-entry.js. Kiểm tra thứ tự script trong index.html.' +
        '</div>';
      return;
    }

    _initialized = true;
    _supabaseClient = supabase;

    window.PlasticAppEntry.init({
      supabase:    supabase,
      containerId: 'plastic-app-root',
      defaultTab:  'dashboard',
    });

    console.log('[PlasticIntegration] Module nhựa đã khởi tạo.');
  }

  // ============================================================
  // SHOW / HIDE VIEW
  // ============================================================

  function showPlasticView() {
    // Ưu tiên sử dụng ViewManager để đồng bộ UI (Topbar, Search Placeholder...)
    if (window.ViewManager && typeof window.ViewManager.switchView === 'function') {
        window.ViewManager.switchView('plastic');
    } else {
        // Fallback an toàn (chỉ chạy nếu ViewManager lỗi)
        var allViews = document.querySelectorAll('.content-area');
        for (var i = 0; i < allViews.length; i++) {
          allViews[i].style.display = 'none';
        }

        var root = document.getElementById('plastic-app-root');
        if (root) root.style.display = 'block';

        var allNavLinks = document.querySelectorAll('.nav-link');
        for (var j = 0; j < allNavLinks.length; j++) {
          allNavLinks[j].classList.remove('active');
        }
        var plasticBtn = document.getElementById('sidebarPlasticManagerBtn');
        if (plasticBtn) plasticBtn.classList.add('active');

        var sidebar  = document.getElementById('sidebar');
        var backdrop = document.getElementById('backdrop');
        if (sidebar)  { sidebar.classList.remove('open');  }
        if (backdrop) { backdrop.classList.remove('show'); }
    }

    // Lazy init module
    initPlasticModule();
  }

  // ============================================================
  // PATCH SIDEBAR BUTTON
  // ============================================================

  function patchSidebarButton() {
    var btn = document.getElementById('sidebarPlasticManagerBtn');
    if (!btn) return;

    // Clone để xóa listener cũ (listener cũ gọi window.PlasticManager.open())
    var newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      showPlasticView();
    });
  }

  // ============================================================
  // BOOT
  // ============================================================

  function boot() {
    patchSidebarButton();
    window.showPlasticView = showPlasticView;
    window.initPlasticModule = initPlasticModule;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    setTimeout(boot, 0);
  }

})();

/*
  supabase-config-v8.4.2.js
  MoldCutterSearch - Cấu hình Supabase + cấu hình gửi mail ảnh (Edge Function)

  Mục tiêu:
  - Không cần sửa code các module ảnh.
  - Lưu cấu hình Supabase URL + anon key vào localStorage (nhập 1 lần).
  - Thêm cấu hình gửi mail theo yêu cầu:
    + Edge Function: send-photo-adit
    + Mail TO cố định (không hiển thị trên UI): toan.ysd@gmail.com
    + CC là danh sách mail nhập trên UI (dạng chip) và được lưu localStorage
    + Toggle “Tự gửi mail” mặc định: BẬT

  Tương thích:
  - Giữ API window.SupabaseConfig: get/set/clear/init
  - Có thể tự init các module nếu chúng có hàm .init()

  Lưu ý bảo mật:
  - Đây là ANON KEY (client-side). Service role key KHÔNG được đặt ở đây.
*/

(function () {
  'use strict';

  var VERSION = 'v8.4.2';

  // =========================
  // 1) DEFAULTS (có thể đổi bằng SupabaseConfig.set hoặc SupabaseConfig.init)
  // =========================

  // Nếu trình duyệt chưa lưu config, file sẽ dùng mặc định này.
  // (Giữ tương thích với file supabase-config v8.3.5 cũ.)
  var DEFAULT_SUPABASE_URL = 'https://bgpnhvhouplvekaaheqy.supabase.co';
  var DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJncG5odmhvdXBsdmVrYWFoZXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE2NjAxOTIsImV4cCI6MjA1NzIzNjE5Mn0.0PJJUjGOjkcEMl-hQhajn0IW4pLQNUHDDAeprE5DG1w';

  // =========================
  // 2) PHOTO MAIL SETTINGS (theo yêu cầu)
  // =========================
  var PHOTO_BUCKET_DEFAULT = 'mold-photos';
  var EDGE_FUNCTION_SEND_PHOTO_AUDIT = 'send-photo-adit';

  // Mail TO cố định: KHÔNG hiện trên UI.
  var PHOTO_MAIL_TO_FIXED = 'toan.ysd@gmail.com';

  // Toggle auto-send mail: mặc định BẬT
  var DEFAULT_AUTO_SEND_MAIL = true;

  // CC list (chip) lưu localStorage
  // - UI chỉ thao tác với danh sách này.

  // =========================
  // 3) LOCALSTORAGE KEYS
  // =========================

  // Giữ tương thích với v8.3.5
  var LS = {
    url: 'mcs.supabase.url',
    anon: 'mcs.supabase.anon',
    setAt: 'mcs.supabase.setAt',

    // Photo mail prefs
    photoAutoSend: 'mcs.photo.mail.autoSend',
    photoCcList: 'mcs.photo.mail.ccList'
  };

  // =========================
  // 4) UTILITIES
  // =========================

  function toStr(v) {
    if (v === null || v === undefined) return '';
    try { return String(v); } catch (e) { return ''; }
  }

  function trim(v) {
    return toStr(v).trim();
  }

  function nowIso() {
    try { return new Date().toISOString(); } catch (e) { return ''; }
  }

  function isObj(x) {
    return !!x && typeof x === 'object' && !Array.isArray(x);
  }

  function validateUrl(u) {
    var x = trim(u);
    if (!x) return false;
    return /^https?:\/\//i.test(x);
  }

  function validateAnonKey(k) {
    var x = trim(k);
    if (!x) return false;
    if (x.length < 40) return false;
    // anon key dạng JWT thường có dấu chấm
    if (x.indexOf('.') === -1) return false;
    return true;
  }

  function notify(type, message, title) {
    var msg = trim(message);
    var ttl = trim(title) || 'Supabase';
    try {
      if (window.NotificationModule && typeof window.NotificationModule.show === 'function') {
        window.NotificationModule.show(type || 'info', msg, ttl);
        return;
      }
    } catch (e) {}

    // Fallback: alert cho lỗi, console cho info/warn
    if ((type || '').toLowerCase() === 'error') {
      try { alert((ttl ? (ttl + ': ') : '') + msg); } catch (e2) {}
      return;
    }
    if ((type || '').toLowerCase() === 'warning') {
      try { console.warn(ttl + ': ' + msg); } catch (e3) {}
      return;
    }
    try { console.log(ttl + ': ' + msg); } catch (e4) {}
  }

  function safeJsonParse(s, fallback) {
    try {
      var t = trim(s);
      if (!t) return fallback;
      return JSON.parse(t);
    } catch (e) {
      return fallback;
    }
  }

  function safeJsonStringify(obj) {
    try { return JSON.stringify(obj); } catch (e) { return ''; }
  }

  // Email đơn giản: đủ dùng cho UI chip
  function normalizeEmail(e) {
    var s = trim(e).toLowerCase();
    // bỏ khoảng trắng giữa
    s = s.replace(/\s+/g, '');
    return s;
  }

  function isEmail(e) {
    var s = normalizeEmail(e);
    if (!s) return false;
    // Regex vừa phải (không quá “khắt khe”)
    return /^[^@]+@[^@]+\.[^@]+$/.test(s);
  }

  function uniqEmails(list) {
    var out = [];
    var seen = {};
    for (var i = 0; i < (Array.isArray(list) ? list.length : 0); i++) {
      var v = normalizeEmail(list[i]);
      if (!isEmail(v)) continue;
      if (seen[v]) continue;
      seen[v] = true;
      out.push(v);
    }
    return out;
  }

  // =========================
  // 5) CONFIG READ/WRITE
  // =========================

  function getSavedSupabaseConfig() {
    var url = '';
    var anon = '';
    var setAt = '';

    try {
      url = trim(localStorage.getItem(LS.url));
      anon = trim(localStorage.getItem(LS.anon));
      setAt = trim(localStorage.getItem(LS.setAt));
    } catch (e) {}

    if (!url) url = DEFAULT_SUPABASE_URL;
    if (!anon) anon = DEFAULT_SUPABASE_ANON_KEY;

    return {
      version: VERSION,
      supabaseUrl: url,
      supabaseAnonKey: anon,
      setAt: setAt
    };
  }

  function saveSupabaseConfig(url, anon) {
    var u = trim(url);
    var a = trim(anon);

    if (!validateUrl(u) || !validateAnonKey(a)) {
      notify('error', 'Supabase URL hoặc anon key không hợp lệ.', 'Supabase');
      return false;
    }

    try {
      localStorage.setItem(LS.url, u);
      localStorage.setItem(LS.anon, a);
      localStorage.setItem(LS.setAt, nowIso());
      return true;
    } catch (e) {
      notify('error', 'Không lưu được cấu hình (localStorage bị chặn).', 'Supabase');
      return false;
    }
  }

  function clearSupabaseConfig() {
    try {
      localStorage.removeItem(LS.url);
      localStorage.removeItem(LS.anon);
      localStorage.removeItem(LS.setAt);
      return true;
    } catch (e) {
      return false;
    }
  }

  // =========================
  // 6) PHOTO MAIL PREFS (auto-send + CC chip)
  // =========================

  function getPhotoMailPrefs() {
    var autoSend = DEFAULT_AUTO_SEND_MAIL;
    var ccList = [];

    try {
      var rawAuto = localStorage.getItem(LS.photoAutoSend);
      if (rawAuto !== null && rawAuto !== undefined && trim(rawAuto) !== '') {
        autoSend = (trim(rawAuto) === '1' || trim(rawAuto).toLowerCase() === 'true');
      }
    } catch (e) {}

    try {
      var rawList = localStorage.getItem(LS.photoCcList);
      var parsed = safeJsonParse(rawList, []);
      ccList = uniqEmails(parsed);
    } catch (e2) {}

    return {
      autoSend: !!autoSend,
      ccList: ccList
    };
  }

  function setPhotoAutoSend(value) {
    var v = !!value;
    try {
      localStorage.setItem(LS.photoAutoSend, v ? '1' : '0');
      return true;
    } catch (e) {
      return false;
    }
  }

  function setPhotoCcList(list) {
    var cc = uniqEmails(list);
    try {
      localStorage.setItem(LS.photoCcList, safeJsonStringify(cc));
      return true;
    } catch (e) {
      return false;
    }
  }

  function addPhotoCc(email) {
    var e = normalizeEmail(email);
    if (!isEmail(e)) return { ok: false, message: 'Email không hợp lệ.' };

    var prefs = getPhotoMailPrefs();
    var list = prefs.ccList.slice();
    list.push(e);
    list = uniqEmails(list);
    var ok = setPhotoCcList(list);
    return ok ? { ok: true, ccList: list } : { ok: false, message: 'Không lưu được danh sách CC.' };
  }

  function removePhotoCc(email) {
    var e = normalizeEmail(email);
    var prefs = getPhotoMailPrefs();
    var list = prefs.ccList.filter(function (x) { return normalizeEmail(x) !== e; });
    var ok = setPhotoCcList(list);
    return ok ? { ok: true, ccList: list } : { ok: false, message: 'Không lưu được danh sách CC.' };
  }

  // =========================
  // 7) EDGE FUNCTION URL
  // =========================

  function getEdgeFunctionUrl(functionName, supabaseUrl) {
    var fn = trim(functionName);
    if (!fn) fn = EDGE_FUNCTION_SEND_PHOTO_AUDIT;

    var base = trim(supabaseUrl);
    if (!base) base = getSavedSupabaseConfig().supabaseUrl;

    // Format chuẩn Supabase: {projectUrl}/functions/v1/{name}
    return base.replace(/\/+$/g, '') + '/functions/v1/' + encodeURIComponent(fn);
  }

  // =========================
  // 8) APPLY CONFIG TO MODULES (nếu module đã load)
  // =========================

  function applyConfig(cfg) {
    if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return false;

    // Expose để module khác đọc nhanh
    try {
      window.MCSupabaseConfig = {
        version: VERSION,
        supabaseUrl: cfg.supabaseUrl,
        supabaseAnonKey: cfg.supabaseAnonKey,
        setAt: cfg.setAt || nowIso()
      };
    } catch (e) {}

    // Nếu các module đã load sẵn, tự init để chạy luôn.
    // (Không ép buộc – nếu chưa có module thì thôi.)
    var okAny = false;

    try {
      if (window.DevicePhotoStore && typeof window.DevicePhotoStore.init === 'function') {
        window.DevicePhotoStore.init({
          supabaseUrl: cfg.supabaseUrl,
          supabaseAnonKey: cfg.supabaseAnonKey,
          bucket: PHOTO_BUCKET_DEFAULT,
          table: 'device_photos'
        });
        okAny = true;
      }
    } catch (e1) {
      notify('warning', 'DevicePhotoStore.init lỗi: ' + (e1 && e1.message ? e1.message : toStr(e1)), 'Supabase');
    }

    try {
      if (window.PhotoAuditTool && typeof window.PhotoAuditTool.init === 'function') {
        window.PhotoAuditTool.init({
          supabaseUrl: cfg.supabaseUrl,
          supabaseAnonKey: cfg.supabaseAnonKey
        });
        okAny = true;
      }
    } catch (e2) {
      notify('warning', 'PhotoAuditTool.init lỗi: ' + (e2 && e2.message ? e2.message : toStr(e2)), 'Supabase');
    }

    try {
      if (window.PhotoUploadTool && typeof window.PhotoUploadTool.init === 'function') {
        window.PhotoUploadTool.init({
          supabaseUrl: cfg.supabaseUrl,
          supabaseAnonKey: cfg.supabaseAnonKey,
          bucket: PHOTO_BUCKET_DEFAULT,
          table: 'device_photos'
        });
        okAny = true;
      }
    } catch (e3) {
      // PhotoUploadTool có thể chưa tồn tại, bỏ qua
    }

    try {
      if (window.PhotoMailer && typeof window.PhotoMailer.init === 'function') {
        window.PhotoMailer.init({
          supabaseUrl: cfg.supabaseUrl,
          supabaseAnonKey: cfg.supabaseAnonKey,
          edgeFunctionName: EDGE_FUNCTION_SEND_PHOTO_AUDIT
        });
        okAny = true;
      }
    } catch (e4) {
      // PhotoMailer có thể chưa tồn tại, bỏ qua
    }

    try {
      document.dispatchEvent(new CustomEvent('supabase-configready', { detail: { config: cfg } }));
    } catch (e5) {}

    return okAny;
  }

  function promptForConfig() {
    var cur = getSavedSupabaseConfig();

    var u = null;
    try {
      u = prompt('Bước 1/2: Dán Supabase URL (ví dụ https://xxxx.supabase.co).\nCancel để bỏ qua.', cur.supabaseUrl || '');
    } catch (e) {
      u = null;
    }
    if (u === null) return null;

    u = trim(u);
    if (!validateUrl(u)) {
      alert('Supabase URL không hợp lệ. Ví dụ: https://xxxx.supabase.co');
      return null;
    }

    var a = null;
    try {
      a = prompt('Bước 2/2: Dán Supabase anon key (chuỗi dài).\nCancel để bỏ qua.', cur.supabaseAnonKey || '');
    } catch (e2) {
      a = null;
    }
    if (a === null) return null;

    a = trim(a);
    if (!validateAnonKey(a)) {
      alert('Anon key có vẻ không đúng (quá ngắn hoặc thiếu định dạng).');
      return null;
    }

    var ok = saveSupabaseConfig(u, a);
    if (!ok) return null;

    notify('success', 'Đã lưu Supabase URL + anon key vào trình duyệt.', 'Supabase');
    return getSavedSupabaseConfig();
  }

  function ensureAndApply(opts) {
    var o = isObj(opts) ? opts : {};
    var interactive = (o.interactive === undefined) ? true : !!o.interactive;
    var forcePrompt = !!o.forcePrompt;

    var cfg = getSavedSupabaseConfig();
    var missing = !cfg.supabaseUrl || !cfg.supabaseAnonKey;

    if (forcePrompt || missing) {
      if (!interactive) {
        notify('warning', 'Chưa có Supabase URL/anon key. Hãy gọi SupabaseConfig.init({interactive:true}).', 'Supabase');
        return false;
      }
      cfg = promptForConfig();
      if (!cfg) return false;
    }

    // Luôn apply (kể cả module chưa load thì vẫn set window.MCSupabaseConfig)
    return applyConfig(cfg);
  }

  // =========================
  // 9) PUBLIC API
  // =========================

  var SupabaseConfig = {
    version: VERSION,

    // Supabase core
    get: function () {
      return getSavedSupabaseConfig();
    },

    set: function (supabaseUrl, supabaseAnonKey) {
      var ok = saveSupabaseConfig(supabaseUrl, supabaseAnonKey);
      if (!ok) return false;
      return ensureAndApply({ interactive: false });
    },

    clear: function () {
      var ok = clearSupabaseConfig();
      if (ok) notify('info', 'Đã xoá cấu hình Supabase trong trình duyệt.', 'Supabase');
      else notify('warning', 'Không xoá được (localStorage bị chặn).', 'Supabase');
      return ok;
    },

    init: function (opts) {
      return ensureAndApply(opts);
    },

    // Photo config getters
    getPhotoConfig: function () {
      var cfg = getSavedSupabaseConfig();
      var prefs = getPhotoMailPrefs();

      return {
        version: VERSION,
        bucket: PHOTO_BUCKET_DEFAULT,
        table: 'device_photos',
        supabaseUrl: cfg.supabaseUrl,
        supabaseAnonKey: cfg.supabaseAnonKey,

        // Edge function
        edgeFunctionName: EDGE_FUNCTION_SEND_PHOTO_AUDIT,
        edgeFunctionUrl: getEdgeFunctionUrl(EDGE_FUNCTION_SEND_PHOTO_AUDIT, cfg.supabaseUrl),

        // Mail rules
        mailToFixed: PHOTO_MAIL_TO_FIXED, // Không hiển thị UI, chỉ code dùng
        autoSendMailDefault: DEFAULT_AUTO_SEND_MAIL,

        // Prefs hiện tại trong trình duyệt
        autoSendMail: prefs.autoSend,
        ccRecipients: prefs.ccList
      };
    },

    // Photo mail prefs API (UI chip + toggle)
    getPhotoMailPrefs: function () {
      return getPhotoMailPrefs();
    },

    setPhotoAutoSend: function (value) {
      return setPhotoAutoSend(value);
    },

    setPhotoCcList: function (list) {
      return setPhotoCcList(list);
    },

    addPhotoCc: function (email) {
      return addPhotoCc(email);
    },

    removePhotoCc: function (email) {
      return removePhotoCc(email);
    },

    // Edge function helper
    getEdgeFunctionUrl: function (functionName) {
      var cfg = getSavedSupabaseConfig();
      return getEdgeFunctionUrl(functionName, cfg.supabaseUrl);
    }
  };

  // Expose
  window.SupabaseConfig = SupabaseConfig;

  // Auto-init: cố gắng apply config đã lưu (không popup)
  function autoInit() {
    try {
      ensureAndApply({ interactive: false });

      // Nếu prefs mail chưa tồn tại, set mặc định 1 lần
      var prefs = getPhotoMailPrefs();
      // Nếu localStorage chưa có key autoSend, sẽ giữ DEFAULT_AUTO_SEND_MAIL.
      // Ta “ghi” lại để chắc chắn tồn tại.
      try { localStorage.setItem(LS.photoAutoSend, prefs.autoSend ? '1' : '0'); } catch (e1) {}
      try {
        if (!localStorage.getItem(LS.photoCcList)) {
          localStorage.setItem(LS.photoCcList, safeJsonStringify(prefs.ccList || []));
        }
      } catch (e2) {}

    } catch (e) {
      try { console.warn('SupabaseConfig autoInit error:', e); } catch (e3) {}
    }
  }

  // Nếu module load sau, nghe event ready để apply lại
  try {
    document.addEventListener('device-photo-storeready', function () {
      ensureAndApply({ interactive: false });
    });
    document.addEventListener('photo-audit-toolready', function () {
      ensureAndApply({ interactive: false });
    });
    document.addEventListener('photo-upload-toolready', function () {
      ensureAndApply({ interactive: false });
    });
    document.addEventListener('photo-mailerready', function () {
      ensureAndApply({ interactive: false });
    });
  } catch (e4) {}

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

})();

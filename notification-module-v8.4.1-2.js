/* ============================================================================
   NOTIFICATION MODULE v8.2.3-3
   Hệ thống thông báo cho Mold/Cutter Search System

   FIX v8.4.1-1-3:
   - window.notify vừa là function (notify(type, message, title, data)) vừa có .success/.error/.warning/.info
     để tương thích các module cũ đang gọi notify('success', msg) hoặc notify.success(msg).
   - Robust payload cho event 'notify' (hỗ trợ {msg,text,vi,ja,...}).
   - CSS khóa màu chữ để tránh bị CSS khác ghi đè làm “toast trắng”.

   Created: 2026-02-03
   Updated: 2026-03-05
   ========================================================================== */

(function() {
  'use strict';

  // ===========================================================================
  // Storage helpers (v8.2.3-2)
  // ===========================================================================
  function _nmText(v, maxLen) {
    var s = '';
    try { s = (v === null || v === undefined) ? '' : String(v); } catch (_) { s = ''; }
    if (!maxLen || maxLen <= 0) return s;
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen - 1) + '…';
  }

  function _safeParse(raw, fallback) {
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  }

  function _isQuotaError(e) {
    try {
      if (!e) return false;
      if (e.name === 'QuotaExceededError') return true;
      if (e.code === 22 || e.code === 1014) return true;
      var msg = String(e.message || e).toLowerCase();
      return (msg.indexOf('quota') >= 0) || (msg.indexOf('exceeded') >= 0) || (msg.indexOf('storage') >= 0);
    } catch (_) {
      return false;
    }
  }

  function _compactNotifications(list, keep, opts, getDefaultTitleFn) {
    opts = opts || {};
    var maxMsg = Number.isFinite(opts.maxMsg) ? opts.maxMsg : 180;
    var maxTitle = Number.isFinite(opts.maxTitle) ? opts.maxTitle : 80;

    var arr = Array.isArray(list) ? list : [];
    var sliced = (Number.isFinite(keep) && keep > 0) ? arr.slice(0, keep) : arr.slice();

    return sliced
      .filter(function(n){ return n && typeof n === 'object'; })
      .map(function(n){
        var type = _nmText(n.type, 16) || 'info';
        var title = _nmText(n.title, maxTitle);
        if (!title && typeof getDefaultTitleFn === 'function') title = getDefaultTitleFn(type);
        return {
          id: _nmText(n.id, 80),
          type: type,
          title: title,
          message: _nmText(n.message, maxMsg),
          timestamp: _nmText(n.timestamp, 40),
          read: !!n.read,
          dismissed: !!n.dismissed
          // Không lưu field data để tránh phình localStorage
        };
      });
  }

  function _sortForKeep(list) {
    var arr = Array.isArray(list) ? list.slice() : [];
    // Ưu tiên giữ chưa đọc trước, sau đó theo thời gian mới nhất
    arr.sort(function(a, b){
      var ar = !!(a && a.read);
      var br = !!(b && b.read);
      if (ar !== br) return ar ? 1 : -1;
      var at = String(a && a.timestamp ? a.timestamp : '');
      var bt = String(b && b.timestamp ? b.timestamp : '');
      return bt.localeCompare(at);
    });
    return arr;
  }

  // ===========================================================================
  // Normalize helpers
  // ===========================================================================
  function _pickMessageFromObj(o) {
    if (!o || typeof o !== 'object') return '';
    if (o.message !== undefined && o.message !== null) return String(o.message);
    if (o.msg !== undefined && o.msg !== null) return String(o.msg);
    if (o.text !== undefined && o.text !== null) return String(o.text);
    if (o.vi !== undefined && o.vi !== null) return String(o.vi);
    if (o.ja !== undefined && o.ja !== null) return String(o.ja);
    return '';
  }

  function _normalizeType(t) {
    var s = (t === null || t === undefined) ? '' : String(t);
    s = s.trim().toLowerCase();
    if (!s) return 'info';
    if (s === 'ok') return 'success';
    if (s === 'warn') return 'warning';
    if (s === 'danger') return 'error';
    if (s === 'err') return 'error';
    return s;
  }

  // ===========================================================================
  // NotificationModule
  // ===========================================================================
  class NotificationModule {
    constructor() {
      this.notifications = [];
      this.maxNotifications = 50;
      this.storageKey = 'moldcutter_notifications_v8';
      this.container = null;
      this.badgeElement = null;
      this.unreadCount = 0;
      this.autoDismissTime = 2200;

      this.persistenceEnabled = true;
      this._persistWarned = false;
      this._persistDisabledWarned = false;
      this._lastPersistError = null;

      console.log('✅ NotificationModule v8.2.3-3 initializing...');
      this.init();
    }

    init() {
      this.createToastContainer();
      this.loadNotifications();
      this.updateUnreadCount();
      this.bindEvents();
      console.log('✅ NotificationModule initialized');
    }

    createToastContainer() {
      let existing = document.getElementById('notification-toast-container');
      if (existing) {
        this.container = existing;
        return;
      }

      const container = document.createElement('div');
      container.id = 'notification-toast-container';
      container.className = 'notification-toast-container';
      container.innerHTML = '';

      document.body.appendChild(container);
      this.container = container;

      console.log('✅ Toast container created');
    }

    bindEvents() {
      document.addEventListener('notify', (e) => {
        const d = e && e.detail;

        let type = 'info';
        let message = '';
        let title = '';
        let data = null;

        if (typeof d === 'string') {
          message = d;
        } else if (d && typeof d === 'object') {
          type = _normalizeType(d.type || d.level || d.kind || 'info');
          title = (d.title !== undefined && d.title !== null) ? String(d.title) : '';
          message = _pickMessageFromObj(d);
          data = (d.data !== undefined) ? d.data : null;
        }

        this.show(type, message, title, data);
      });

      document.addEventListener('notification:read', (e) => {
        const id = e && e.detail ? e.detail.id : null;
        if (id) this.markAsRead(id);
      });

      document.addEventListener('notification:clearAll', () => {
        this.clearAll();
      });
    }

    // =========================================================================
    // STORAGE
    // =========================================================================
    loadNotifications() {
      try {
        var saved = localStorage.getItem(this.storageKey);
        if (!saved) {
          this.notifications = [];
          return;
        }

        var parsed = _safeParse(saved, null);
        if (!Array.isArray(parsed)) {
          this.notifications = [];
          return;
        }

        var compact = _compactNotifications(parsed, this.maxNotifications, { maxMsg: 220, maxTitle: 90 }, this.getDefaultTitle.bind(this));
        this.notifications = compact;
        this.saveNotifications();
      } catch (e) {
        console.warn('Failed to load notifications:', e);
        this.notifications = [];
      }
    }

    saveNotifications() {
      if (!this.persistenceEnabled) return;

      try {
        var compact = _compactNotifications(this.notifications, this.maxNotifications, { maxMsg: 220, maxTitle: 90 }, this.getDefaultTitle.bind(this));
        localStorage.setItem(this.storageKey, JSON.stringify(compact));
        this._lastPersistError = null;
        return;
      } catch (e) {
        this._lastPersistError = e;

        if (!_isQuotaError(e)) {
          if (!this._persistWarned) {
            this._persistWarned = true;
            console.warn('Failed to save notifications:', e);
          }
          return;
        }

        try {
          var sorted = _sortForKeep(this.notifications)
            .filter(function(n){ return n && typeof n === 'object'; })
            .filter(function(n){ return !(n.dismissed && n.read); });

          var levels = [40, 25, 15, 8];
          for (var i = 0; i < levels.length; i++) {
            var keep = levels[i];
            var compact2 = _compactNotifications(sorted, keep, { maxMsg: 160, maxTitle: 70 }, this.getDefaultTitle.bind(this));
            try {
              localStorage.setItem(this.storageKey, JSON.stringify(compact2));
              this._lastPersistError = null;
              return;
            } catch (e2) {
              if (!_isQuotaError(e2)) break;
            }
          }

          try { localStorage.removeItem(this.storageKey); } catch (_) {}
          try {
            var compactMin = _compactNotifications(sorted, 8, { maxMsg: 120, maxTitle: 60 }, this.getDefaultTitle.bind(this));
            localStorage.setItem(this.storageKey, JSON.stringify(compactMin));
            this._lastPersistError = null;
            return;
          } catch (_) {
            this.persistenceEnabled = false;
            if (!this._persistDisabledWarned) {
              this._persistDisabledWarned = true;
              console.warn('Notification persistence disabled due to storage quota. Toast will still work.');
            }
          }
        } catch (e3) {
          this.persistenceEnabled = false;
          if (!this._persistDisabledWarned) {
            this._persistDisabledWarned = true;
            console.warn('Notification persistence disabled due to storage error. Toast will still work.', e3);
          }
        }
      }
    }

    // =========================================================================
    // MAIN METHODS
    // =========================================================================
    show(type = 'info', message = '', title = '', data = null) {
      type = _normalizeType(type);

      // Tương thích: nếu message truyền object, tự bóc nội dung
      if (message && typeof message === 'object') {
        var mm = _pickMessageFromObj(message);
        var tt = (message.title !== undefined && message.title !== null) ? String(message.title) : '';
        if (!title && tt) title = tt;
        message = mm;
        if (data === null || data === undefined) data = (message.data !== undefined) ? message.data : data;
      }

      const id = `notify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const notification = {
        id: id,
        type: type,
        message: (message === null || message === undefined) ? '' : String(message),
        title: (title ? String(title) : this.getDefaultTitle(type)),
        data: data,
        timestamp: new Date().toISOString(),
        read: false,
        dismissed: false
      };

      this.notifications.unshift(notification);

      if (this.notifications.length > this.maxNotifications) {
        this.notifications = this.notifications.slice(0, this.maxNotifications);
      }

      this.saveNotifications();
      this.updateUnreadCount();
      this.showToast(notification);

      document.dispatchEvent(new CustomEvent('notification:created', {
        detail: notification
      }));

      return id;
    }

    showToast(notification) {
      if (!this.container) return;

      const toast = document.createElement('div');
      toast.className = `notification-toast notification-${notification.type}`;
      toast.setAttribute('data-id', notification.id);

      toast.innerHTML = `
        <div class="toast-icon">
          <i class="fas ${this.getIcon(notification.type)}"></i>
        </div>
        <div class="toast-content">
          <div class="toast-title">${this.escapeHtml(notification.title)}</div>
          <div class="toast-message">${this.escapeHtml(notification.message)}</div>
        </div>
        <button class="toast-close" aria-label="Close">
          <i class="fas fa-times"></i>
        </button>
      `;

      const closeBtn = toast.querySelector('.toast-close');
      closeBtn.addEventListener('click', () => {
        this.dismissToast(toast, notification.id);
      });

      toast.addEventListener('click', (e) => {
        if (!e.target.closest('.toast-close')) {
          this.markAsRead(notification.id);
          this.dismissToast(toast, notification.id);
        }
      });

      this.container.appendChild(toast);

      setTimeout(() => {
        toast.classList.add('show');
      }, 10);

      setTimeout(() => {
        this.dismissToast(toast, notification.id);
      }, this.autoDismissTime);
    }

    dismissToast(toastElement, notificationId) {
      if (!toastElement) return;

      toastElement.classList.remove('show');
      toastElement.classList.add('hide');

      setTimeout(() => {
        if (toastElement && toastElement.parentNode) {
          toastElement.parentNode.removeChild(toastElement);
        }
      }, 300);

      const notification = this.notifications.find(n => n.id === notificationId);
      if (notification) {
        notification.dismissed = true;
        this.saveNotifications();
      }
    }

    // =========================================================================
    // NOTIFICATION MANAGEMENT
    // =========================================================================
    markAsRead(id) {
      const notification = this.notifications.find(n => n.id === id);
      if (notification && !notification.read) {
        notification.read = true;
        this.saveNotifications();
        this.updateUnreadCount();

        document.dispatchEvent(new CustomEvent('notification:read', {
          detail: { id: id }
        }));
      }
    }

    markAllAsRead() {
      let changed = false;
      this.notifications.forEach(n => {
        if (!n.read) {
          n.read = true;
          changed = true;
        }
      });

      if (changed) {
        this.saveNotifications();
        this.updateUnreadCount();
        document.dispatchEvent(new CustomEvent('notification:allRead'));
      }
    }

    clearAll() {
      this.notifications = [];
      this.saveNotifications();
      this.updateUnreadCount();
      document.dispatchEvent(new CustomEvent('notification:cleared'));
    }

    getUnread() {
      return this.notifications.filter(n => !n.read);
    }

    getAll() {
      return this.notifications;
    }

    getById(id) {
      return this.notifications.find(n => n.id === id);
    }

    deleteById(id) {
      const index = this.notifications.findIndex(n => n.id === id);
      if (index >= 0) {
        this.notifications.splice(index, 1);
        this.saveNotifications();
        this.updateUnreadCount();

        document.dispatchEvent(new CustomEvent('notification:deleted', {
          detail: { id: id }
        }));
      }
    }

    updateUnreadCount() {
      this.unreadCount = this.notifications.filter(n => !n.read).length;

      document.dispatchEvent(new CustomEvent('notification:unreadCountChanged', {
        detail: { count: this.unreadCount }
      }));

      this.updateBadge();
    }

    updateBadge() {
      const badges = document.querySelectorAll('[data-notification-badge]');
      badges.forEach(badge => {
        if (this.unreadCount > 0) {
          badge.textContent = this.unreadCount > 99 ? '99+' : this.unreadCount;
          badge.style.display = 'inline-flex';
        } else {
          badge.style.display = 'none';
        }
      });
    }

    // =========================================================================
    // CONVENIENCE METHODS
    // =========================================================================
    success(message, title = null) {
      return this.show('success', message, title);
    }

    error(message, title = null) {
      return this.show('error', message, title);
    }

    warning(message, title = null) {
      return this.show('warning', message, title);
    }

    info(message, title = null) {
      return this.show('info', message, title);
    }

    // =========================================================================
    // HELPER METHODS
    // =========================================================================
    getDefaultTitle(type) {
      const titles = {
        success: '成功 / Thành công',
        error: 'エラー / Lỗi',
        warning: '警告 / Cảnh báo',
        info: '情報 / Thông tin'
      };
      return titles[type] || titles.info;
    }

    getIcon(type) {
      const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
      };
      return icons[type] || icons.info;
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = (text === null || text === undefined) ? '' : String(text);
      return div.innerHTML;
    }
  }

  // =========================================================================
  // CSS INJECTION
  // =========================================================================
  function injectStyles() {
    if (document.getElementById('notification-module-styles')) return;

    const style = document.createElement('style');
    style.id = 'notification-module-styles';
    style.textContent = `
      /* Notification Toast Container */
      .notification-toast-container {
        position: fixed;
        top: 80px;
        right: 20px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 12px;
        pointer-events: none;
      }

      /* Toast */
      .notification-toast {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        min-width: 320px;
        max-width: 420px;
        padding: 16px;
        background: #ffffff;
        border-radius: 12px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        border-left: 4px solid #ccc;
        pointer-events: auto;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease;
      }

      .notification-toast.show {
        opacity: 1;
        transform: translateX(0);
      }

      .notification-toast.hide {
        opacity: 0;
        transform: translateX(100%);
      }

      /* Toast Types */
      .notification-toast.notification-success { border-left-color: #4CAF50; }
      .notification-toast.notification-error { border-left-color: #F44336; }
      .notification-toast.notification-warning { border-left-color: #FF9800; }
      .notification-toast.notification-info { border-left-color: #2196F3; }

      /* Toast Icon */
      .toast-icon {
        flex-shrink: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        font-size: 16px;
      }

      .notification-success .toast-icon { background: rgba(76, 175, 80, 0.1); color: #4CAF50; }
      .notification-error .toast-icon { background: rgba(244, 67, 54, 0.1); color: #F44336; }
      .notification-warning .toast-icon { background: rgba(255, 152, 0, 0.1); color: #FF9800; }
      .notification-info .toast-icon { background: rgba(33, 150, 243, 0.1); color: #2196F3; }

      /* Toast Content */
      .toast-content {
        flex: 1;
        min-width: 0;
      }

      .notification-toast .toast-title {
        font-size: 14px;
        font-weight: 700;
        color: #1f2937;
        margin-bottom: 4px;
      }

      .notification-toast .toast-message {
        font-size: 13px;
        color: #4b5563;
        line-height: 1.4;
        word-wrap: break-word;
      }


      /* Toast Close Button */
      .toast-close {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        border: none;
        background: transparent;
        color: #9ca3af;
        cursor: pointer;
        border-radius: 4px;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
      }

      .toast-close:hover {
        background: rgba(0, 0, 0, 0.05);
        color: #4b5563;
      }

      /* Mobile Responsive */
      @media (max-width: 767px) {
        .notification-toast-container {
          top: 60px;
          right: 10px;
          left: 10px;
        }

        .notification-toast {
          min-width: auto;
          max-width: none;
        }
      }

      /* Badge (for notification count in UI) */
      [data-notification-badge] {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 20px;
        height: 20px;
        padding: 0 6px;
        background: #F44336;
        color: #ffffff;
        border-radius: 10px;
        font-size: 11px;
        font-weight: 700;
        line-height: 1;
      }

    `;

    document.head.appendChild(style);
  }

  // =========================================================================
  // AUTO-INIT
  // =========================================================================
  function autoInit() {
    injectStyles();

    window.NotificationModule = new NotificationModule();

    // IMPORTANT: notify vừa là function vừa có method, để tương thích cả 2 kiểu gọi
    function notify(type, message, title, data) {
      try {
        if (!window.NotificationModule || typeof window.NotificationModule.show !== 'function') return null;
        return window.NotificationModule.show(type, message, title, data);
      } catch (e) {
        try { console.warn('notify() failed:', e); } catch (_) {}
        return null;
      }
    }

    notify.success = (message, title) => window.NotificationModule.success(message, title);
    notify.error = (message, title) => window.NotificationModule.error(message, title);
    notify.warning = (message, title) => window.NotificationModule.warning(message, title);
    notify.info = (message, title) => window.NotificationModule.info(message, title);

    window.notify = notify;

    console.log('✅ NotificationModule ready. Use window.notify.success("message")');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

})();

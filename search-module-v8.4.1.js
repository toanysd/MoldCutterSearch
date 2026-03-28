/**
 * ============================================================================
 * SEARCH MODULE v8.1.0-1 - Smart & User-Friendly Search Engine
 * ============================================================================
 * Created: 2026-01-29
 * Updated: Smart display logic, compact UI, better UX
 * 
 * Features:
 * - Smart suggestion display (only when needed, not always)
 * - Compact UI (max 5 visible items)
 * - Individual delete + clear all
 * - Close button
 * - Auto focus on page load
 * - ESC to clear search
 * - Multi-keyword search (comma-separated)
 * ============================================================================
 */

class SearchModule {
  constructor(options = {}) {
    this.options = {
      historyMaxSize: 20,
      suggestionMaxSize: 5, // Giảm từ 10 xuống 5
      searchDelay: 300,
      storageKey: 'moldSearchHistory_v8',
      autoFocus: true, // NEW
      ...options
    };

    this.searchHistory = [];
    this.searchTimeout = null;
    this.suggestionIndex = -1;
    this.isShowingSuggestions = false;
    this.hideTimeout = null;
    this.currentQuery = '';
    this.userManuallyClosedSuggestions = false; // NEW: Track manual close
    this.lastOpenedByClick = false;

    // DOM Elements
    this.searchInput = null;
    this.clearBtn = null;
    this.qrBtn = null;
    this.suggestionsContainer = null;
    this.suggestionsList = null;
    this.closeBtn = null; // NEW

    // Search fields configuration
    this.searchableFields = {
      mold: [
        'displayCode', 'displayName', 'displayDimensions', 'displayLocation',
        'displayCustomer', 'displayRackLocation', 'displayStorageCompany',
        'MoldID', 'MoldCode', 'MoldName', 'MoldNotes',
        'drawingNumber', 'equipmentCode', 'plasticType', 'moldSetupType',
        'pieceCount', 'cutlineSize', 'storageCompany', 'moldStatus',
        'TeflonCoating', 'MoldReturning', 'MoldDisposing',
        'rackId', 'storageCompanyId'
      ],
      cutter: [
        'displayCode', 'displayName', 'displayDimensions', 'displayLocation',
        'displayCustomer', 'displayRackLocation', 'displayStorageCompany',
        'CutterID', 'CutterNo', 'CutterName', 'CutterDesignName', 'CutterNote',
        'PlasticCutType', 'cutterType', 'bladeCount', 'cutlineSize',
        'storageCompany', 'rackId', 'storageCompanyId',
        'CutterDesignCode',
        'CutterCode',
        'MoldShared',
        'CutterDetail',
        'PlasticCutType',
          // Khuyến nghị thêm “biến thể tên” để tránh lệch do khác chữ hoa/thường hoặc gõ sai trong CSV
        'PlasticCutType',   // nếu dữ liệu thật dùng key này
        'plasticCutType',   // nếu dữ liệu thật dùng key này (đang có sẵn)
        'CutterDetail',     // phòng trường hợp dữ liệu đúng chính tả là Detail
        'MoldShared',        // phòng trường hợp bạn muốn là Shared (khác chữ so với MoldShard)
        'cutterType', 'bladeCount', 'cutlineSize', 'storageCompany', 'rackId', 'storageCompanyId'
      ],
      common: [
        'displayCode', 'displayName', 'displayDimensions', 'displayLocation',
        'displayCustomer', 'displayRackLocation', 'displayStorageCompany'
      ]
    };

    console.log('[SearchModule v8.1.0-1] Initialized');
  }

  init() {
    this.loadSearchHistory();
    this.bindElements();
    this.attachEventListeners();

    // NEW: Auto focus on page load
    if (this.options.autoFocus && this.searchInput) {
      setTimeout(() => {
        this.searchInput.focus();
      }, 300);
    }

    console.log('[SearchModule] Ready');
  }

  bindElements() {
    this.searchInput = document.getElementById('searchInput');
    this.clearBtn = document.getElementById('clearSearchBtn');
    this.qrBtn = document.getElementById('qrScanBtn');

    if (!this.searchInput) {
      console.error('[SearchModule] Search input not found');
      return;
    }

    this.createSuggestionsContainer();
    console.log('[SearchModule] Elements bound successfully');
  }

  createSuggestionsContainer() {
    const searchBar = this.searchInput.closest('.search-bar');
    if (!searchBar) return;

    let container = document.getElementById('searchSuggestions');
    if (container) {
      this.suggestionsContainer = container;
      this.suggestionsList = container.querySelector('.suggestions-list');
      this.closeBtn = container.querySelector('.suggestions-close-btn');
      return;
    }

    // Create new container with header
    container = document.createElement('div');
    container.id = 'searchSuggestions';
    container.className = 'search-suggestions';
    container.innerHTML = 
      '<div class="suggestions-header">' +
        '<span class="suggestions-header-title">検索履歴 / Lịch sử tìm kiếm</span>' +
        '<div class="suggestions-header-actions">' +
          '<button class="suggestions-clear-btn" title="全削除 / Xóa tất cả">Clear</button>' +
          '<button class="suggestions-close-btn" title="閉じる / Đóng">×</button>' +
        '</div>' +
      '</div>' +
      '<div class="suggestions-list"></div>';

    searchBar.appendChild(container);
    this.suggestionsContainer = container;
    this.suggestionsList = container.querySelector('.suggestions-list');
    this.closeBtn = container.querySelector('.suggestions-close-btn');

    // Attach close button event
    if (this.closeBtn) {
      // QUAN TRỌNG: chặn button giành focus ngay từ lúc nhấn chuột
      this.closeBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });

      this.closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        this.hideSuggestions(true);
        this.lastOpenedByClick = false;

        // Trả focus lại về ô search (để vẫn gõ được ngay)
        if (this.searchInput) {
          setTimeout(() => {
            this.searchInput.focus({ preventScroll: true });
          }, 0);
        }
      });
    }


    console.log('[SearchModule] Suggestions container created');
  }

  attachEventListeners() {
    if (!this.searchInput) return;

    // Input event - KHÔNG tự động hiện suggestions khi gõ
    this.searchInput.addEventListener('input', (e) => {
      this.handleInput(e);
    });

    this.searchInput.addEventListener('click', (e) => {
      // CHỈ mở nếu:
      // 1. Có lịch sử
      // 2. Chưa đang hiện
      if (this.searchHistory.length > 0 && !this.isShowingSuggestions) {
        this.lastOpenedByClick = true;
        this.showSuggestions();
      }
    });
    
    // Keydown for special keys
    this.searchInput.addEventListener('keydown', (e) => {
      this.handleKeydown(e);
    });

    // Focus event - CHỈ hiện suggestions khi focus
    this.searchInput.addEventListener('focus', () => {
      this.handleFocus();
    });

    // Blur event
    this.searchInput.addEventListener('blur', () => {
      this.handleBlur();
    });

    // Clear button
    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', () => {
        this.clearSearch();
      });
    }

    // Click outside to close suggestions
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-bar') && !e.target.closest('.search-suggestions')) {
        this.hideSuggestions(true);
        this.lastOpenedByClick = false;
      }
    });

    console.log('[SearchModule] Event listeners attached');
  }

  handleInput(event) {
    this.updateClearButton();

    // Clear previous timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    // Debounce search - KHÔNG hiện suggestions tự động
    this.searchTimeout = setTimeout(() => {
      this.performSearch();
      // Removed: this.updateSuggestions();
    }, this.options.searchDelay);
  }

  handleKeydown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.hideSuggestions(true);
      this.performSearch(true);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      // NEW: ESC clears search if there's content, otherwise just closes suggestions
      if (this.searchInput.value.trim()) {
        this.clearSearch();
      } else {
        this.hideSuggestions(true);
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      // CHỈ navigate nếu suggestions đang hiện
      if (this.isShowingSuggestions) {
        this.navigateSuggestions(1);
      } else {
        // Mở suggestions khi bấm ↓ (không phải click)
        this.lastOpenedByClick = false;
        this.showSuggestions();
      }
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (this.isShowingSuggestions) {
        this.navigateSuggestions(-1);
      }
    }
  }

  handleFocus() {
    // Reset manual close flag
    this.userManuallyClosedSuggestions = false;

    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    // CHỈ hiện suggestions khi focus VÀ có lịch sử
    //setTimeout(() => {
    //  if (document.activeElement === this.searchInput && 
    //      !this.userManuallyClosedSuggestions &&
    //      this.searchHistory.length > 0) {
    //    this.showSuggestions();
    //  }
    //}, 100);
  }

  handleBlur() {
    this.hideSuggestions(false);
  }

  updateClearButton() {
    if (!this.clearBtn || !this.searchInput) return;
    const hasValue = this.searchInput.value.trim().length > 0;
    this.clearBtn.style.display = hasValue ? 'flex' : 'none';
  }

  clearSearch() {
    if (this.searchInput) {
      this.searchInput.value = '';
      this.currentQuery = '';
      this.updateClearButton();
      this.hideSuggestions(true);
      this.performSearch();
      this.searchInput.focus();
    }
  }

  performSearch(addToHistory = false) {
    const query = this.searchInput ? this.searchInput.value.trim() : '';
    this.currentQuery = query;

    console.log('[SearchModule] Performing search:', query);

    if (addToHistory && query) {
      this.addToHistory(query);
    }

    this.emitSearchEvent(query);
  }

  searchItems(items, query, category = 'all') {
    if (!query || !query.trim()) {
      return items;
    }

    const keywords = query
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 0);

    if (keywords.length === 0) {
      return items;
    }

    console.log('[SearchModule] Searching with keywords:', keywords);

    const results = items.filter(item => {
      return keywords.every(keyword => {
        return this.matchItemWithKeyword(item, keyword, category);
      });
    });

    console.log('[SearchModule] Found ' + results.length + ' results');
    return results;
  }

  matchItemWithKeyword(item, keyword, category) {
    const itemType = item.itemType || (item.MoldID ? 'mold' : 'cutter');

    let fields = [];
    if (category === 'all') {
      fields = itemType === 'mold' ? this.searchableFields.mold : this.searchableFields.cutter;
    } else if (category === 'mold') {
      fields = this.searchableFields.mold;
    } else if (category === 'cutter') {
      fields = this.searchableFields.cutter;
    }

    for (const field of fields) {
      const value = this.getFieldValue(item, field);
      if (value && value.toLowerCase().includes(keyword)) {
        return true;
      }
    }

    if (item.designInfo) {
      const nestedFields = [
        // Đã có sẵn (giữ lại)
        'TextContent',
        'DesignForPlasticType',
        'DrawingNumber',
        'EquipmentCode',
        'MoldSetupType',
        'PieceCount',

        // Thêm theo yêu cầu molddesign.csv
        'TrayInfoForMoldDesign',
        'CustomerTrayName',
        'MailContent',
        'VersionNote',
        'MoldDesignPlasticNotes',
        'TrayDesignName',
        'TrayDesignNo',
        'CustomerDrawingNo',
        'CustomerEquipmentNo'
      ];

      for (const field of nestedFields) {
        const value = item.designInfo[field];
        if (value && value.toString().toLowerCase().includes(keyword)) {
          return true;
        }
      }
    }

    if (item.rackInfo) {
      if (item.rackInfo.RackLocation && 
          item.rackInfo.RackLocation.toLowerCase().includes(keyword)) {
        return true;
      }
    }

    if (item.storageCompanyInfo) {
      const companyName = item.storageCompanyInfo.CompanyName || 
                         item.storageCompanyInfo.CompanyShortName;
      if (companyName && companyName.toLowerCase().includes(keyword)) {
        return true;
      }
    }

    if (item.jobInfo && item.jobInfo.JobName) {
      if (item.jobInfo.JobName.toLowerCase().includes(keyword)) {
        return true;
      }
    }

    if (item.processingItemInfo && item.processingItemInfo.ProcessingItemName) {
      if (item.processingItemInfo.ProcessingItemName.toLowerCase().includes(keyword)) {
        return true;
      }
    }

    return false;
  }

  getFieldValue(item, field) {
    const value = item[field];
    if (value === null || value === undefined) return '';

    if (typeof value === 'object' && value.text) {
      return value.text;
    }

    return value.toString().trim();
  }

  emitSearchEvent(query) {
    const event = new CustomEvent('searchPerformed', {
      detail: {
        query: query,
        timestamp: Date.now()
      }
    });
    document.dispatchEvent(event);
  }

  showSuggestions() {
    if (!this.suggestionsContainer || this.userManuallyClosedSuggestions) return;

    this.suggestionsContainer.style.display = 'block';
    this.isShowingSuggestions = true;

    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    this.updateSuggestions();
  }

  hideSuggestions(immediate = false) {
    if (!this.suggestionsContainer) return;

    if (immediate) {
      this.suggestionsContainer.style.display = 'none';
      this.isShowingSuggestions = false;
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }
    } else {
      this.hideTimeout = setTimeout(() => {
        if (this.suggestionsContainer) {
          this.suggestionsContainer.style.display = 'none';
          this.isShowingSuggestions = false;
        }
      }, 150);
    }
  }

  updateSuggestions() {
    if (!this.suggestionsList) return;

    const query = this.searchInput ? this.searchInput.value.trim() : '';
    let html = '';

    const history = this.getRecentHistory();

    if (history.length > 0) {

      history.forEach((item, index) => {
        const highlightedQuery = query ? this.highlightMatch(item.query, query) : item.query;
        const escapedQuery = this.escapeHtml(item.query);
        const resultsCount = item.results || 0;
        const timeStr = this.formatRelativeTime(item.timestamp);

        html += '<div class="suggestion-item" data-query="' + escapedQuery + '" data-index="' + index + '">';
        html += '<span class="suggestion-icon">🕒</span>';
        html += '<div class="suggestion-content">';
        html += '<div class="suggestion-text">' + highlightedQuery + '</div>';
        html += '<div class="suggestion-meta">';
        html += '<span class="suggestion-count">' + resultsCount + '件</span>';
        html += '<span class="suggestion-time">' + timeStr + '</span>';
        html += '</div>';
        html += '</div>';
        html += '<button class="suggestion-delete" data-action="delete" title="削除 / Xóa">×</button>';
        html += '</div>';
      });

      html += '</div>';
    }

    // Smart suggestions chỉ hiện khi gõ >= 2 ký tự
    if (query.length >= 2) {
      const smartSuggestions = this.generateSmartSuggestions(query);
      if (smartSuggestions.length > 0) {
        html += '<div class="suggestions-section">';
        html += '<div class="suggestions-section-title">関連する検索 / Gợi ý</div>';

        smartSuggestions.forEach(suggestion => {
          const highlighted = this.highlightMatch(suggestion, query);
          const escaped = this.escapeHtml(suggestion);

          html += '<div class="suggestion-item" data-query="' + escaped + '">';
          html += '<span class="suggestion-icon">💡</span>';
          html += '<div class="suggestion-content">';
          html += '<div class="suggestion-text">' + highlighted + '</div>';
          html += '</div>';
          html += '</div>';
        });

        html += '</div>';
      }
    }

    if (html === '') {
      html = '<div class="no-suggestions">検索履歴がありません / Không có lịch sử</div>';
    }

    this.suggestionsList.innerHTML = html;

    // Attach events
    this.suggestionsList.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', (e) => {
        // Ignore if clicking delete button
        if (e.target.closest('.suggestion-delete')) return;

        const query = item.getAttribute('data-query');
        this.selectSuggestion(query);
      });
    });

    // Delete buttons
    this.suggestionsList.querySelectorAll('.suggestion-delete').forEach(btn => {
      // CHẶN button giành focus -> không làm searchInput bị blur
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Nếu đang có hẹn giờ auto-hide do blur trước đó -> hủy
        if (this.hideTimeout) {
          clearTimeout(this.hideTimeout);
          this.hideTimeout = null;
        }

        const item = btn.closest('.suggestion-item');
        const index = parseInt(item.getAttribute('data-index'), 10);

        this.deleteHistoryItem(index);

        // Nếu vẫn còn lịch sử -> giữ bảng mở + giữ focus để xóa tiếp
        if (this.searchHistory && this.searchHistory.length > 0 && this.suggestionsContainer) {
          this.suggestionsContainer.style.display = 'block';
          this.isShowingSuggestions = true;

          if (this.searchInput) {
            setTimeout(() => {
              this.searchInput.focus({ preventScroll: true });
            }, 0);
          }
        }
      });
    });


    // Clear all button
    const clearAllBtn = this.suggestionsContainer.querySelector('.suggestions-clear-btn');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
      });

      clearAllBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (this.hideTimeout) {
          clearTimeout(this.hideTimeout);
          this.hideTimeout = null;
        }

        this.clearHistory();

        // clearHistory() sẽ đóng bảng vì hết lịch sử (hợp lý)
        if (this.searchInput) {
          setTimeout(() => {
            this.searchInput.focus({ preventScroll: true });
          }, 0);
        }
      });
    }
  }

  navigateSuggestions(direction) {
    if (!this.isShowingSuggestions) return;

    const items = this.suggestionsList.querySelectorAll('.suggestion-item');
    if (items.length === 0) return;

    if (this.suggestionIndex >= 0 && this.suggestionIndex < items.length) {
      items[this.suggestionIndex].classList.remove('active');
    }

    this.suggestionIndex += direction;
    if (this.suggestionIndex < 0) this.suggestionIndex = items.length - 1;
    if (this.suggestionIndex >= items.length) this.suggestionIndex = 0;

    items[this.suggestionIndex].classList.add('active');
    items[this.suggestionIndex].scrollIntoView({ block: 'nearest' });

    const query = items[this.suggestionIndex].getAttribute('data-query');
    if (query && this.searchInput) {
      this.searchInput.value = query;
    }
  }

  selectSuggestion(query) {
    if (this.searchInput) {
      this.searchInput.value = query;
      this.updateClearButton();
      this.hideSuggestions(true);
      this.lastOpenedByClick = false;
      this.performSearch(true);
    }
  }

  generateSmartSuggestions(query) {
    const suggestions = new Set();
    const queryLower = query.toLowerCase();

    const allData = window.allData || { molds: [], cutters: [] };
    const allItems = [...(allData.molds || []), ...(allData.cutters || [])];

    allItems.forEach(item => {
      const fields = [
        item.displayCode,
        item.displayName,
        item.displayDimensions,
        item.cutlineSize,
        item.MoldCode,
        item.CutterNo,
        item.designInfo?.DrawingNumber,
        item.designInfo?.EquipmentCode,
        item.designInfo?.CustomerDrawingNo,
        item.designInfo?.CustomerEquipmentNo,
        item.designInfo?.TrayDesignNo,
        item.designInfo?.TrayDesignName,
        item.designInfo?.CustomerTrayName,
        item.designInfo?.TrayInfoForMoldDesign,
        item.CutterName,
        item.CutterCode,
        item.CutterDesignCode,
        item.CutterNote,
        item.PlasticCutType,
        item.plasticCutType

      ].filter(f => f && f.toString().trim());

      fields.forEach(field => {
        const fieldStr = field.toString().toLowerCase();
        if (fieldStr.includes(queryLower) && fieldStr !== queryLower) {
          suggestions.add(field.toString());
        }
      });
    });

    return Array.from(suggestions).slice(0, this.options.suggestionMaxSize);
  }

  highlightMatch(text, query) {
    if (!query) return text;

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();

    let result = '';
    let lastIndex = 0;
    let index = lowerText.indexOf(lowerQuery);

    while (index !== -1) {
      result += text.substring(lastIndex, index);
      result += '<mark>' + text.substring(index, index + query.length) + '</mark>';
      lastIndex = index + query.length;
      index = lowerText.indexOf(lowerQuery, lastIndex);
    }

    result += text.substring(lastIndex);
    return result;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatRelativeTime(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now - time;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '今';
    if (diffMins < 60) return diffMins + '分前';
    if (diffHours < 24) return diffHours + '時間前';
    if (diffDays < 7) return diffDays + '日前';
    return time.toLocaleDateString('ja-JP');
  }

  loadSearchHistory() {
    try {
      const saved = localStorage.getItem(this.options.storageKey);
      if (saved) {
        this.searchHistory = JSON.parse(saved);
        if (this.searchHistory.length > this.options.historyMaxSize) {
          this.searchHistory = this.searchHistory.slice(-this.options.historyMaxSize);
        }
      }
      console.log('[SearchModule] Loaded ' + this.searchHistory.length + ' history items');
    } catch (e) {
      console.warn('[SearchModule] Failed to load history:', e);
      this.searchHistory = [];
    }
  }

  saveSearchHistory() {
    try {
      localStorage.setItem(this.options.storageKey, JSON.stringify(this.searchHistory));
    } catch (e) {
      console.warn('[SearchModule] Failed to save history:', e);
    }
  }

  addToHistory(query, results = 0) {
    if (!query || query.trim().length < 2) return;

    const trimmedQuery = query.trim();

    this.searchHistory = this.searchHistory.filter(item => item.query !== trimmedQuery);

    this.searchHistory.push({
      query: trimmedQuery,
      timestamp: new Date().toISOString(),
      results: results
    });

    if (this.searchHistory.length > this.options.historyMaxSize) {
      this.searchHistory = this.searchHistory.slice(-this.options.historyMaxSize);
    }

    this.saveSearchHistory();
  }

  getRecentHistory() {
    return this.searchHistory
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, this.options.suggestionMaxSize);
  }

  // NEW: Delete individual history item
  deleteHistoryItem(index) {
    const recent = this.getRecentHistory();
    if (index >= 0 && index < recent.length) {
      const itemToDelete = recent[index];
      this.searchHistory = this.searchHistory.filter(item => 
        item.query !== itemToDelete.query || item.timestamp !== itemToDelete.timestamp
      );
      this.saveSearchHistory();
      this.updateSuggestions();

      // Hide if no more history
      if (this.searchHistory.length === 0) {
        this.hideSuggestions(true);
      }
    }
  }

  clearHistory() {
    this.searchHistory = [];
    this.saveSearchHistory();
    this.hideSuggestions(true);
    console.log('[SearchModule] History cleared');
  }

  getQuery() {
    return this.currentQuery;
  }

  setQuery(query) {
    if (this.searchInput) {
      this.searchInput.value = query;
      this.currentQuery = query;
      this.updateClearButton();
      this.performSearch();
    }
  }

  destroy() {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }
    console.log('[SearchModule] Destroyed');
  }
}

if (typeof window !== 'undefined') {
  window.SearchModule = SearchModule;
}

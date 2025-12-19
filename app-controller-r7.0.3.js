/**
 * V7.7.7 App Controller R6.9 - Enhanced with search input binding
 * Based on R6.6 architecture
 */
(function () {
  'use strict';

  // Debounce settings
  let debounceTimer = null;
  const DEBOUNCE_MS = 300;

  // Utility shortcuts
  const qs = (sel) => document.querySelector(sel);
  const qsAll = (sel) => Array.from(document.querySelectorAll(sel));

  // Selectors for search inputs
  const SEL = {
    // iPad search
    ipadSearchInput: ['#search-input', '.search-input:not(#mobile-search-input)'],
    
    // Mobile search
    mobileSearchInput: ['#mobile-search-input', '.mobile-search-input'],
    
    // Clear buttons
    clearSearchBtn: ['.clear-search-btn', '#clear-search-btn', '[data-action="clear-search"]'],
    
    // Reset buttons
    resetFilterBtn: ['#filter-reset-btn', '#reset-filter-btn'],
    resetAllBtn: ['#reset-all-btn', '.btn-reset-all'],
    
    // Category tabs
    ipadCategoryTabs: ['.category-tabs:not(.mobile-only) .category-tab'],
    mobileCategoryTabs: ['.mobile-only .category-tab', '.mobile-category-tab']
  };

  const AppController = {
    /**
     * Initialize application
     */
    async init() {
      console.log('🚀 V7.7.7-r6.9 Initializing...');
      
      // Load data first
      if (window.DataManager && typeof window.DataManager.loadAllData === 'function') {
        await window.DataManager.loadAllData();
      } else {
        console.error('❌ DataManager not available');
        throw new Error('DataManager not initialized');
      }

      // Initialize FilterModule (must be after DataManager)
      if (window.FilterModule && typeof window.FilterModule.init === 'function') {
        window.FilterModule.init();
        console.log('✅ FilterModule initialized');
      } else {
        console.warn('⚠️ FilterModule not available');
      }

      // Restore saved state
      this.restoreSearchState();

      // Initial category + search
      const cat = this.getActiveCategory() || 'all';
      if (window.SearchModule) {
        window.SearchModule.setCategory(cat);
        window.SearchModule.setQuery(this.getSearchInputValue());
        window.SearchModule.performSearch();
      }

      // Setup event listeners
      this.setupEventListeners();

      console.log('✅ App ready (with FilterModule).');
      
      // Initialize Mobile UI if needed
      if (window.innerWidth <= 767) {
        this.initMobileUI();
        console.log('📱 Mobile UI initialized');
      }
    },

    /**
     * Setup event listeners for BOTH mobile and iPad
     */
    setupEventListeners() {
      console.log('📌 Setting up event listeners...');
      
      // ===== SEARCH INPUT - iPad =====
      const ipadInput = this.getIpadSearchInput();
      if (ipadInput) {
        this.bindSearchInput(ipadInput, 'iPad');
      }

      // ===== SEARCH INPUT - Mobile =====
      const mobileInput = this.getMobileSearchInput();
      if (mobileInput) {
        this.bindSearchInput(mobileInput, 'Mobile');
      }

      // ===== CLEAR BUTTONS =====
      this.bindClearButtons();

      // ===== CATEGORY TABS =====
      this.bindCategoryTabs(SEL.ipadCategoryTabs, 'iPad');
      this.bindCategoryTabs(SEL.mobileCategoryTabs, 'Mobile');

      // ===== RESET FILTER BUTTONS =====
      this.bindResetButtons();

      console.log('✅ Event listeners ready.');
    },

    /**
     * Bind search input with debounce
     */
    bindSearchInput(input, uiType) {
      if (!input) return;

      // Input event with debounce
      input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const query = input.value.trim();
          console.log(`🔍 ${uiType} search:`, query);
          
          if (window.SearchModule) {
            window.SearchModule.setQuery(query);
            window.SearchModule.performSearch();
          }
          
          this.persistSearchState();
          
          // Sync to other UI
          this.syncSearchInputs(input);
        }, DEBOUNCE_MS);
      });

      // Enter key
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          clearTimeout(debounceTimer);
          const query = input.value.trim();
          
          if (window.SearchModule) {
            window.SearchModule.setQuery(query);
            window.SearchModule.performSearch();
          }
          
          this.persistSearchState();
        }
      });

      console.log(`✅ ${uiType} search input bound`);
    },

    /**
     * Bind clear buttons
     */
    bindClearButtons() {
      // Clear search input only (X button)
      SEL.clearSearchBtn.forEach(selector => {
        qsAll(selector).forEach(btn => {
          btn.addEventListener('click', () => {
            console.log('🗑️ Clear search input');
            
            // Clear all search inputs
            const ipadInput = this.getIpadSearchInput();
            const mobileInput = this.getMobileSearchInput();
            
            if (ipadInput) ipadInput.value = '';
            if (mobileInput) mobileInput.value = '';
            
            // Perform empty search (keep category & filter)
            if (window.SearchModule) {
              window.SearchModule.setQuery('');
              window.SearchModule.performSearch();
            }
            
            this.persistSearchState();
            console.log('✅ Search input cleared');
          });
        });
      });
      
      console.log('✅ Clear buttons bound');
    },

    /**
     * Bind reset buttons
     */
    bindResetButtons() {
      // Reset filter only
      SEL.resetFilterBtn.forEach(selector => {
        qsAll(selector).forEach(btn => {
          btn.addEventListener('click', () => {
            console.log('🔄 Reset filter');
            if (window.FilterModule && window.FilterModule.reset) {
              window.FilterModule.reset();
            }
          });
        });
      });

      // Reset all (filter + search)
      SEL.resetAllBtn.forEach(selector => {
        qsAll(selector).forEach(btn => {
          btn.addEventListener('click', () => {
            console.log('🔄 Reset all');
            
            // Clear search inputs
            const ipadInput = this.getIpadSearchInput();
            const mobileInput = this.getMobileSearchInput();
            if (ipadInput) ipadInput.value = '';
            if (mobileInput) mobileInput.value = '';
            
            // Reset filter
            if (window.FilterModule && window.FilterModule.reset) {
              window.FilterModule.reset();
            }
            
            // Perform empty search
            if (window.SearchModule) {
              window.SearchModule.setQuery('');
              window.SearchModule.performSearch();
            }
            
            this.persistSearchState();
          });
        });
      });
      
      console.log('✅ Reset buttons bound');
    },

    /**
     * Bind category tabs
     */
    bindCategoryTabs(selectors, uiType) {
      const tabs = selectors.flatMap(sel => qsAll(sel));
      
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const category = tab.dataset.category || 'all';
          console.log(`🏷️ ${uiType} category:`, category);
          
          // Update active state
          tabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          
          // Update SearchModule
          if (window.SearchModule) {
            window.SearchModule.setCategory(category);
            window.SearchModule.performSearch();
          }
          
          this.persistSearchState();
        });
      });
      
      console.log(`✅ ${uiType} category tabs bound (${tabs.length})`);
    },

    /**
     * Get iPad search input
     */
    getIpadSearchInput() {
      for (const sel of SEL.ipadSearchInput) {
        const input = qs(sel);
        if (input) return input;
      }
      return null;
    },

    /**
     * Get Mobile search input
     */
    getMobileSearchInput() {
      for (const sel of SEL.mobileSearchInput) {
        const input = qs(sel);
        if (input) return input;
      }
      return null;
    },

    /**
     * Get search input value (either iPad or Mobile)
     */
    getSearchInputValue() {
      const ipadInput = this.getIpadSearchInput();
      const mobileInput = this.getMobileSearchInput();
      
      return (ipadInput?.value || mobileInput?.value || '').trim();
    },

    /**
     * Sync search inputs between iPad and Mobile
     */
    syncSearchInputs(sourceInput) {
      const value = sourceInput.value;
      const ipadInput = this.getIpadSearchInput();
      const mobileInput = this.getMobileSearchInput();
      
      if (ipadInput && ipadInput !== sourceInput) {
        ipadInput.value = value;
      }
      
      if (mobileInput && mobileInput !== sourceInput) {
        mobileInput.value = value;
      }
    },

    /**
     * Get active category
     */
    getActiveCategory() {
      const activeTab = qs('.category-tab.active');
      return activeTab?.dataset?.category || 'all';
    },

    /**
     * Persist search state to localStorage
     */
    persistSearchState() {
      const state = {
        query: this.getSearchInputValue(),
        category: this.getActiveCategory()
      };
      
      try {
        localStorage.setItem('searchState', JSON.stringify(state));
      } catch (e) {
        console.warn('Cannot save search state:', e);
      }
    },

    /**
     * Restore search state from localStorage
     * ✅ R7.0.3: KHÔNG restore query - chỉ restore category
     */
    restoreSearchState() {
        try {
            const saved = localStorage.getItem('searchState');
            if (!saved) return;
            
            const state = JSON.parse(saved);
            
            // ✅ FIX: KHÔNG restore query khi reload trang
            // Chỉ restore category để giữ tab active
            
            // Restore category ONLY
            if (state.category) {
                qsAll('.category-tab').forEach(tab => {
                    if (tab.dataset.category === state.category) {
                        tab.classList.add('active');
                    } else {
                        tab.classList.remove('active');
                    }
                });
            }
            
            console.log('✅ Search state restored: category=' + state.category);
        } catch (e) {
            console.warn('Cannot restore search state:', e);
        }
    },


    /**
     * Initialize mobile UI
     */
    initMobileUI() {
      // Mobile-specific initialization if needed
      console.log('📱 Mobile UI ready');
    }
  };

  // Expose globally
  window.AppController = AppController;

  // Auto-init when DOM ready
  document.addEventListener('DOMContentLoaded', async () => {
    await AppController.init();
  });
})();

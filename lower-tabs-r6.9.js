/**
 * lower-tabs.js V7.7.7 - COMPATIBLE WITH EXISTING STRUCTURE
 * ===================================================
 * Xử lý tab switching cho lower section
 * - Tương thích với cấu trúc HTML hiện tại: <button class="lower-tab">
 * - Tương thích với <div class="tab-pane"> structure
 * - Tab switching: results, detail, keyboard
 * - KHÔNG phá vỡ logic hiện tại của keyboard-panel, results-table
 * - Trigger DetailTab.render() khi switch sang tab detail
 * ===================================================
 */

(function() {
  'use strict';

  const SELECTORS = {
    tabButtons: '.lower-tab',
    tabPanes: '.tab-pane',
    resultsPane: '#results-pane',
    detailPane: '#detail-pane',
    keyboardPane: '#keyboard-pane'
  };

  init();

  function init() {
    console.log('[LowerTabs] V7.7.7 Initializing...');
    bindTabClicks();
    console.log('[LowerTabs] v7.7.7 ready');
  }

  /**
   * Bind click events to all lower-tab buttons
   */
  function bindTabClicks() {
    const tabs = document.querySelectorAll(SELECTORS.tabButtons);
    
    tabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const targetTab = e.currentTarget.dataset.tab;
        if (!targetTab) {
          console.warn('[LowerTabs] Tab button missing data-tab attribute');
          return;
        }

        switchTab(targetTab);
      });
    });
  }

  /**
   * Switch to target tab
   * @param {string} tabName - Tab name (results, detail, keyboard)
   */
  function switchTab(tabName) {
    console.log('[LowerTabs] Switching to tab:', tabName);

    // 1. Deactivate all tab buttons
    const allTabs = document.querySelectorAll(SELECTORS.tabButtons);
    allTabs.forEach(t => t.classList.remove('active'));

    // 2. Hide all tab panes
    const allPanes = document.querySelectorAll(SELECTORS.tabPanes);
    allPanes.forEach(p => p.classList.remove('active'));

    // 3. Activate target tab button
    const targetTabBtn = document.querySelector(`${SELECTORS.tabButtons}[data-tab="${tabName}"]`);
    if (targetTabBtn) {
      targetTabBtn.classList.add('active');
    }

    // 4. Show target pane
    const targetPane = document.querySelector(`#${tabName}-pane`);
    if (targetPane) {
      targetPane.classList.add('active');
    }

    // 5. Post-switch actions
    handlePostSwitch(tabName);

    // 6. Dispatch tab changed event
    document.dispatchEvent(new CustomEvent('tab:changed', {
      detail: { tab: tabName }
    }));

    console.log('[LowerTabs] Tab switched to:', tabName);
  }

  /**
   * Handle post-switch actions for specific tabs
   * @param {string} tabName 
   */
  function handlePostSwitch(tabName) {
    // Detail tab: Render nếu có currentItem
    if (tabName === 'detail' && window.DetailTab) {
      const currentItem = window.DetailTab.currentItem ? window.DetailTab.currentItem() : null;
      
      if (currentItem) {
        console.log('[LowerTabs] Detail tab activated with item, triggering render');
        
        // Trigger render through DetailTab API
        if (typeof window.DetailTab.render === 'function') {
          window.DetailTab.render();
        }
      } else {
        console.log('[LowerTabs] Detail tab activated but no currentItem');
      }
    }

    // Keyboard tab: Có thể thêm logic nếu cần
    // Results tab: Có thể thêm logic nếu cần
  }

  /**
   * Get current active tab name
   * @returns {string|null}
   */
  function getActiveTab() {
    const activeBtn = document.querySelector(`${SELECTORS.tabButtons}.active`);
    return activeBtn ? activeBtn.dataset.tab : null;
  }

  /**
   * Programmatically switch to tab (for external access)
   * @param {string} tabName 
   */
  function switchToTab(tabName) {
    switchTab(tabName);
  }

  // Export for external access
  window.LowerTabs = {
    switchToTab,
    getActiveTab,
    switchTab: switchToTab // Alias
  };

})();

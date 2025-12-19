/**
 * action-buttons.js V6.9.10
 * ===================================================
 * R6.9.10: Separated Location & Inventory buttons
 * - GIỮ NGUYÊN logic CheckIn/CheckOut từ r6.9
 * - THÊM 2 nút riêng: btn-location + btn-inventory-settings
 * - XÓA logic conditional cũ (isActive check)
 * ===================================================
 */

(function() {
  'use strict';

  let currentItem = null;
  let currentType = null;

  function initActionButtons() {
    console.log('[ActionButtons] Initializing...');

    // Lắng nghe detail:changed để track item đang được chọn
    document.addEventListener('detail:changed', (e) => {
      if (e.detail && e.detail.item) {
        currentItem = e.detail.item;
        currentType = e.detail.itemType;
        console.log('[ActionButtons] Current item:', currentItem.displayCode);
      }
    });

    // ============================================
    // BIND BUTTONS FOR iPAD (default area)
    // ============================================
    bindAllActionButtons('');

    console.log('[ActionButtons] ✅ All buttons bound successfully');
  }

  // ============================================
  // HELPER: Validate item selection
  // ============================================
  function validateSelection() {
    // ✅ FIX: Kiểm tra xem có đang ở bulk mode không
    const isBulkMode = window.InventoryState?.bulkMode || false;

    if (isBulkMode) {
      // ✅ Bulk mode: Không cần validate (xử lý hàng loạt)
      return true;
    }

    // ✅ Normal mode: Cần chọn item
    if (!currentItem) {
      alert('項目を選択してください\nVui lòng chọn khuôn hoặc dao cắt trước');
      return false;
    }

    return true;
  }

  // ============================================
  // HELPER: Bind button handler (reusable)
  // ============================================
  function bindButton(buttonId, moduleName, moduleMethod, ...args) {
    // Try both iPad and mobile IDs
    const ipadBtn = document.getElementById(buttonId);
    const mobileBtn = document.getElementById('mobile-' + buttonId);
    
    const buttons = [ipadBtn, mobileBtn].filter(btn => btn !== null);
    
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        if (!validateSelection()) return;
        console.log(`[ActionButtons] ${buttonId} clicked (${btn.id})`);
        
        if (window[moduleName]) {
          if (args.length > 0) {
            window[moduleName][moduleMethod](...args, currentItem);
          } else {
            window[moduleName][moduleMethod](currentItem);
          }
        } else {
          console.warn(`[ActionButtons] ${moduleName} module not loaded yet`);
        }
      });
    });
    
    return buttons.length > 0;
  }

  // ============================================
  // HELPER: Bind all action buttons
  // ============================================
  function bindAllActionButtons(containerSelector = '') {
    const prefix = containerSelector ? `${containerSelector} ` : '';
    console.log(`[ActionButtons] Binding buttons in: "${prefix || 'iPad area'}"`);
    
    // ============================================
    // ✅ R6.9.10: NÚT 1 - LOCATION UPDATE (Riêng biệt)
    // ============================================
    const locationBtn = document.querySelector(prefix + '#btn-location');
    
    if (locationBtn) {
      locationBtn.addEventListener('click', () => {
        if (!validateSelection()) return;
        
        console.log('[ActionButtons] 📍 Location Update button clicked');
        
        if (window.LocationUpdate) {
          window.LocationUpdate.openModal(currentItem);
        } else {
          console.error('LocationUpdate module not loaded');
        }
      });
    }

    // ============================================
    // ✅ R6.9.10: NÚT 2 - INVENTORY SETTINGS (Mới)
    // ============================================
    const inventoryBtn = document.querySelector(prefix + '#btn-inventory-settings');
    
    if (inventoryBtn) {
      inventoryBtn.addEventListener('click', () => {
        console.log('[ActionButtons] 📋 Inventory Settings button clicked');
        
        if (window.InventoryManager) {
          window.InventoryManager.openSettings();
        } else {
          console.error('InventoryManager module not loaded');
        }
      });
    }

    // ============================================
    // ✅ R6.9.10: NÚT 3 - CHECK IN/OUT (Giữ nguyên logic cũ)
    // ============================================
    const checkInOutBtn = document.querySelector(prefix + '#btn-check-in-out');
    
    if (checkInOutBtn) {
      checkInOutBtn.addEventListener('click', () => {
        if (!validateSelection()) return;
        
        console.log('[ActionButtons] ↔️ Check In/Out button clicked');
        
        if (window.CheckInOutManager) {
          // ✅ Mở modal với mode selection (giữ nguyên từ r6.9)
          window.CheckInOutManager.open(currentItem, currentType);
        } else {
          console.error('CheckInOutManager module not loaded');
        }
      });
    }

    // ============================================
    // ✅ NÚT 4 - TEFLON
    // ============================================
    const teflonBtn = document.querySelector(prefix + '#btn-teflon');
    
    if (teflonBtn) {
      teflonBtn.addEventListener('click', () => {
        if (!validateSelection()) return;
        
        console.log('[ActionButtons] 🎨 Teflon button clicked');
        
        if (window.TeflonModal) {
          window.TeflonModal.open(currentItem);
        } else {
          console.error('TeflonModal module not loaded');
        }
      });
    }

    // ============================================
    // ✅ ROW 2: SHIPMENT, COMMENT (Nếu còn)
    // ============================================
    bindButton(prefix + 'shipment-btn', 'Shipment', 'openModal');
    bindButton(prefix + 'comment-btn', 'Comment', 'openModal');
    
    // ============================================
    // ✅ PRINT & QR BUTTONS (Nếu còn)
    // ============================================
    const printBtn = document.querySelector(prefix + '#print-btn');
    if (printBtn) {
      printBtn.addEventListener('click', () => {
        if (!validateSelection()) return;
        if (window.ExportPDF) {
          window.ExportPDF.generate(currentItem);
        } else {
          alert('PDF export機能は準備中です / Tính năng xuất PDF đang phát triển');
        }
      });
    }
    
    const qrBtn = document.querySelector(prefix + '#export-qr-btn');
    if (qrBtn) {
      qrBtn.addEventListener('click', () => {
        if (!validateSelection()) return;
        if (window.ExportQR) {
          window.ExportQR.generate(currentItem);
        } else {
          alert('QRコード生成機能は準備中です / Tính năng tạo QR đang phát triển');
        }
      });
    }
    
    // ============================================
    // ✅ GIỮ NGUYÊN: CHECK-IN & CHECK-OUT BUTTONS (Large)
    // ============================================
    bindButton(prefix + 'checkin-btn', 'CheckInOut', 'openModal', 'check-in');
    bindButton(prefix + 'checkout-btn', 'CheckInOut', 'openModal', 'check-out');
  }

  // ============================================
  // AUTO-INIT
  // ============================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initActionButtons();
    });
  } else {
    initActionButtons();
  }

})();

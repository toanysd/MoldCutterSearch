/**
 * plastic-mold-cutter-search.js
 * Engine tìm kiếm Khuôn và Dao cắt tương thích cho một mã nhựa và kích thước cuộn cụ thể.
 * Định dạng file: Vanilla JS
 * Phiên bản: v2.0 (Kiến trúc chuẩn qua MoldDesignID, KHÔNG dùng MoldShared)
 */

window.PlasticMoldCutterSearch = (() => {
  // Khoảng dung sai chiều mm (được phê duyệt theo quy chuẩn)
  const TOLERANCE_WIDTH_MM = 5;

  /**
   * Helper kiểm tra chuỗi rỗng / falsy
   */
  function isFalsy(val) {
    if (!val) return true;
    const s = String(val).trim().toLowerCase();
    return (s === 'false' || s === '0' || s === '廃棄済' || s === '使用禁止' || s === '');
  }

  // ==========================================
  // UI & CSS INJECTION
  // ==========================================
  function injectStyles() {
    if (document.getElementById('pmcs-styles')) return;
    const style = document.createElement('style');
    style.id = 'pmcs-styles';
    style.textContent = `
      .pmcs-modal-overlay {
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(15, 23, 42, 0.7);
        backdrop-filter: blur(4px);
        z-index: 9999; display: flex; align-items: center; justify-content: center;
        opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
      }
      .pmcs-modal-overlay.show { opacity: 1; pointer-events: auto; }
      
      .pmcs-modal {
        background: #F8FAFC; border-radius: 8px; width: 90%; max-width: 900px;
        max-height: 90vh; display: flex; flex-direction: column;
        box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1);
        transform: translateY(20px); transition: transform 0.3s ease;
      }
      .pmcs-modal-overlay.show .pmcs-modal { transform: translateY(0); }
      
      .pmcs-header {
        padding: 16px 20px; border-bottom: 1px solid #E2E8F0; background: white;
        display: flex; justify-content: space-between; align-items: center;
        border-radius: 8px 8px 0 0;
      }
      .pmcs-title { margin: 0; font-size: 1.25rem; font-weight: 600; color: #0F172A; display: flex; align-items: center; gap: 8px; }
      .pmcs-close { background: none; border: none; font-size: 1.5rem; color: #64748B; cursor: pointer; padding: 4px 8px; border-radius: 4px; }
      .pmcs-close:hover { background: #F1F5F9; color: #0F172A; }
      
      .pmcs-body { padding: 20px; overflow-y: auto; flex: 1; background: #F8FAFC; }
      
      .pmcs-info-banner {
        background: #E0F2FE; border-left: 4px solid #0284C7; padding: 12px 16px;
        border-radius: 4px; margin-bottom: 20px; color: #0369A1; font-size: 0.95rem;
        display: flex; align-items: center; gap: 8px;
      }
      
      /* NESTED CARDS */
      .pmcs-grid { display: grid; gap: 16px; grid-template-columns: 1fr; }
      
      .pmcs-card {
        background: white; border: 1px solid #E2E8F0; border-radius: 6px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05); overflow: hidden;
      }
      .pmcs-card-header {
        padding: 12px 16px; border-bottom: 1px solid #E2E8F0; background: #F1F5F9;
        display: flex; justify-content: space-between; align-items: flex-start;
      }
      .pmcs-mold-name { font-size: 1.1rem; font-weight: 700; color: #1E293B; margin-bottom: 4px; }
      .pmcs-mold-meta { font-size: 0.85rem; color: #64748B; display: flex; gap: 12px; }
      .pmcs-mold-match { 
        font-size: 0.8rem; background: #ECFDF5; color: #059669; 
        padding: 2px 8px; border-radius: 12px; border: 1px solid #A7F3D0;
      }
      
      .pmcs-cutters { padding: 16px; display: flex; flex-wrap: wrap; gap: 10px; }
      
      /* CUTTER BADGES */
      .pmcs-cutter-badge {
        display: flex; flex-direction: column; border: 1px solid #CBD5E1;
        border-radius: 4px; padding: 6px 10px; background: #FFFFFF; min-width: 120px;
      }
      .pmcs-cutter-name { font-weight: 600; color: #0F172A; font-size: 0.95rem; margin-bottom: 4px; }
      
      .pmcs-tag { font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; font-weight: 500; display: inline-block; width: fit-content; }
      .pmcs-tag-direct { background: #EEF2FF; color: #4338CA; border: 1px solid #C7D2FE; } /* Light Industrial Teal equivalent for direct */
      .pmcs-tag-shared { background: #FEF3C7; color: #B45309; border: 1px solid #FDE68A; }
      
      .pmcs-empty { text-align: center; padding: 40px 20px; color: #64748B; background: white; border-radius: 6px; border: 1px solid #E2E8F0; }
      .pmcs-empty i { font-size: 2rem; color: #CBD5E1; margin-bottom: 12px; }
    `;
    document.head.appendChild(style);
  }

  function createModalDOM() {
    if (document.getElementById('pmcs-overlay')) return document.getElementById('pmcs-overlay');
    
    const overlay = document.createElement('div');
    overlay.id = 'pmcs-overlay';
    overlay.className = 'pmcs-modal-overlay';
    overlay.innerHTML = `
      <div class="pmcs-modal">
        <div class="pmcs-header">
          <h3 class="pmcs-title"><i class="fas fa-search"></i> <span id="pmcs-title-text">Tìm Dao/Khuôn Tương Thích</span></h3>
          <button class="pmcs-close" id="pmcs-btn-close">&times;</button>
        </div>
        <div class="pmcs-body">
          <div class="pmcs-info-banner" id="pmcs-banner">
            <i class="fas fa-info-circle"></i> <span>Đang phân tích...</span>
          </div>
          <div class="pmcs-grid" id="pmcs-results"></div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('pmcs-btn-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    return overlay;
  }

  function closeModal() {
    const overlay = document.getElementById('pmcs-overlay');
    if (overlay) overlay.classList.remove('show');
  }

  /**
   * Trả về danh sách Khuôn và các Dao tương thích từ thông số Cuộn Nhựa.
   * @param {string} plastic_id - ID mã nhựa chuẩn
   * @param {number|string} roll_width - Chiều rộng cuộn nhựa (mm), dung sai ±5mm
   * @param {number|string} roll_thickness - Chiều dày cuộn nhựa (mm), exact match
   * @returns {Array<Object>}
   */
  function searchCompatibleTools(plastic_id, roll_width, roll_thickness) {
    if (!window.ALL_DATA) {
      console.warn("[PlasticMoldCutterSearch] Chưa tải xong window.ALL_DATA");
      return [];
    }

    const w = parseFloat(roll_width);
    const t = parseFloat(roll_thickness);
    if (!plastic_id || isNaN(w) || isNaN(t)) return [];

    const bomData = window.ALL_DATA.mold_plastic_bom || [];
    const moldsData = window.ALL_DATA.molds || [];
    const cuttersData = window.ALL_DATA.cutters || [];
    const moldCutterData = window.ALL_DATA.moldcutter || [];

    // Bước 1: Quét mold_plastic_bom.csv để lấy tập MoldID cho phép
    // Điều kiện: Rộng ± 5mm, Dày khớp tuyệt đối (exact match)
    const validMoldEntries = {};
    for (const row of bomData) {
      if (row.plastic_id !== plastic_id) continue;
      
      const rowW = parseFloat(row.width_mm);
      const rowT = parseFloat(row.thickness_mm);
      if (isNaN(rowW) || isNaN(rowT)) continue;

      if (Math.abs(rowT - t) < 0.001) { // Exact match for thickness
        const diffW = Math.abs(rowW - w);
        if (diffW <= TOLERANCE_WIDTH_MM) {
          const moldIdStr = String(Math.trunc(parseFloat(row.MoldID)));
          validMoldEntries[moldIdStr] = {
            width_mm: rowW,
            thickness_mm: rowT
          };
        }
      }
    }

    const matchedMoldIDs = Object.keys(validMoldEntries);
    if (matchedMoldIDs.length === 0) return [];

    // Bước 2: Build Lookup cho Dao Cắt
    // Chúng ta cần kết nối DAO vào MoldDesignID
    // 2.1: Dao Trực Tiếp (Primary) từ cutters.csv
    const directCuttersMap = new Map(); // MoldDesignID -> [CutterRow...]
    for (const cutter of cuttersData) {
      if (isFalsy(cutter.UsageStatus)) continue; // Bỏ qua dao hỏng/hủy
      const designId = String(cutter.MoldDesignID || '').trim();
      if (!designId) continue;
      
      if (!directCuttersMap.has(designId)) {
        directCuttersMap.set(designId, []);
      }
      directCuttersMap.get(designId).push({
        ...cutter,
        link_type: 'direct',
        link_label: '専用' // Chuyên dụng (trực tiếp)
      });
    }

    // 2.2: Dao gián tiếp (Shared) từ moldcutter.csv
    const sharedCuttersMap = new Map(); // MoldDesignID -> Set of CutterIDs
    for (const mc of moldCutterData) {
      const designId = String(mc.MoldDesignID || '').trim();
      const cutterId = String(mc.CutterID || '').trim();
      if (!designId || !cutterId) continue;
      
      if (!sharedCuttersMap.has(designId)) {
        sharedCuttersMap.set(designId, new Set());
      }
      sharedCuttersMap.get(designId).add(cutterId);
    }

    // Helper lookup toàn bộ Dao hợp lệ từ cutters.csv theo CutterID cho Shared link
    const allCuttersById = new Map();
    for (const cutter of cuttersData) {
      allCuttersById.set(String(cutter.CutterID), cutter);
    }

    // Bước 3: Gắn Mold với Dao (Thông qua MoldDesignID)
    const results = [];
    for (const mold of moldsData) {
      const mId = String(Math.trunc(parseFloat(mold.MoldID)));
      if (!matchedMoldIDs.includes(mId)) continue;
      
      // Bỏ qua khuôn đã hủy
      if (isFalsy(mold.MoldUsageStatus) || mold.MoldDisposedDate || String(mold.MoldDisposing).toLowerCase() === 'true') {
        continue;
      }

      const designId = String(mold.MoldDesignID || '').trim();
      const condition = validMoldEntries[mId];
      
      // Tập hợp Dao Trực tiếp
      const directCutters = directCuttersMap.get(designId) || [];
      const finalCutters = [...directCutters];
      const usedCutterIds = new Set(directCutters.map(c => String(c.CutterID)));

      // Tập hợp Dao Gián tiếp
      if (sharedCuttersMap.has(designId)) {
        const sharedIds = sharedCuttersMap.get(designId);
        for (const cId of sharedIds) {
          if (usedCutterIds.has(cId)) continue; // Không trùng lặp
          const cRow = allCuttersById.get(cId);
          if (cRow && !isFalsy(cRow.UsageStatus)) {
            finalCutters.push({
              ...cRow,
              link_type: 'shared',
              link_label: '共通' // Dùng chung (gián tiếp)
            });
            usedCutterIds.add(cId);
          }
        }
      }

      // Xếp dao trực tiếp lên đầu
      finalCutters.sort((a, b) => {
        if (a.link_type === 'direct' && b.link_type === 'shared') return -1;
        if (a.link_type === 'shared' && b.link_type === 'direct') return 1;
        return 0;
      });

      // Tạo match_criteria mô tả về tolerance
      // VD: "Tương thích: Dày 0.6mm (khớp), Rộng 518mm (dung sai 2mm)"
      const diffW = Math.abs(condition.width_mm - w);
      let matchDesc = `Dày: ${condition.thickness_mm}mm (Exact)`;
      if (diffW === 0) {
        matchDesc += ` | Rộng: ${condition.width_mm}mm (Exact)`;
      } else {
        matchDesc += ` | Rộng: ${condition.width_mm}mm (Lệch ${diffW}mm)`;
      }

      results.push({
        MoldID: mId,
        MoldCode: mold.MoldCode || '',
        MoldName: mold.MoldName || '',
        MoldDesignID: designId,
        CustomerID: mold.CustomerID || '',
        Cavity: mold.Cavity || '',
        match_criteria: matchDesc,
        cutters: finalCutters
      });
    }

    return results;
  }

  // ==========================================
  // RENDER UI
  // ==========================================
  function openModal(plastic_id, roll_width, roll_thickness) {
    injectStyles();
    const overlay = createModalDOM();
    overlay.classList.add('show');

    const resultsContainer = document.getElementById('pmcs-results');
    const banner = document.getElementById('pmcs-banner');
    
    // Setup tiêu đề banner
    banner.innerHTML = `<i class="fas fa-filter"></i> <span>Tiêu chí quét cuộn nhựa <b>${roll_width}mm / ${roll_thickness}mm</b>: <br/>Khớp độ dày (Exact 100%), Chiều rộng (±5mm tolerance). Lọc qua MoldDesign.</span>`;
    
    resultsContainer.innerHTML = '<div class="pmcs-empty"><i class="fas fa-spinner fa-spin"></i><p>Đang tìm kiếm dữ liệu...</p></div>';

    // Đợi 1 chút cho UI render mượt mới chạy logic nặng
    setTimeout(() => {
      const results = searchCompatibleTools(plastic_id, roll_width, roll_thickness);
      
      if (results.length === 0) {
        resultsContainer.innerHTML = `
          <div class="pmcs-empty">
            <i class="fas fa-exclamation-triangle"></i>
            <p>Không tìm thấy khuôn nào tương thích với mã nhựa này và kích thước ${roll_width}x${roll_thickness}mm.</p>
          </div>
        `;
        return;
      }

      let html = '';
      results.forEach(item => {
        let cuttersHtml = '';
        if (item.cutters.length === 0) {
          cuttersHtml = '<div style="color:#94A3B8; font-size:0.9rem; font-style:italic;">Không có dao cắt nào được cấu hình cho khuôn này.</div>';
        } else {
          item.cutters.forEach(c => {
            const tagClass = c.link_type === 'direct' ? 'pmcs-tag-direct' : 'pmcs-tag-shared';
            cuttersHtml += `
              <div class="pmcs-cutter-badge">
                <div class="pmcs-cutter-name">${c.CutterName || c.CutterNo}</div>
                <div class="${tagClass} pmcs-tag">${c.link_label}</div>
              </div>
            `;
          });
        }

        html += `
          <div class="pmcs-card">
            <div class="pmcs-card-header">
              <div>
                <div class="pmcs-mold-name">${item.MoldName} <small style="color:#94A3B8">(${item.MoldCode})</small></div>
                <div class="pmcs-mold-meta">
                  <span><i class="fas fa-cube"></i> Cavity: ${item.Cavity || '-'}</span>
                </div>
              </div>
              <div class="pmcs-mold-match"><i class="fas fa-check-circle"></i> ${item.match_criteria}</div>
            </div>
            <div class="pmcs-cutters">
              ${cuttersHtml}
            </div>
          </div>
        `;
      });
      
      resultsContainer.innerHTML = html;
    }, 100);
  }

  return {
    searchCompatibleTools,
    openModal,
    getToleranceInfo: () => TOLERANCE_WIDTH_MM
  };
})();

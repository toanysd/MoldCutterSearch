/**
 * plastic-dictionary-ui-v2.js
 * Module UI: Từ điển / Hướng dẫn các mã nhựa, từ viết tắt và đặc tính kỹ thuật
 */

const PlasticDictionaryUI = (() => {
  let containerEl = null;

  // Dữ liệu từ điển (Static Dictionary Data)
  const dictData = {
    families: [
      { code: 'PS', name_ja: 'ポリスチレン', name_vi: 'Polystyrene', desc: 'Nhựa màng PS (thường dòn, bẻ có tiếng rắc). Ứng dụng dập khuôn định hình thường.', status: 'verified' },
      { code: 'PP', name_ja: 'ポリプロピレン', name_vi: 'Polypropylene', desc: 'Nhựa màng PP. Tính chất dẻo, mềm dai, chịu dung môi và chịu nhiệt rất tốt.', status: 'verified' },
      { code: 'PET', name_ja: 'ポリエチレンテレフタレート', name_vi: 'Polyethylene', desc: 'Nhựa màng PET. Cứng, trong suốt cao. Khó dập định hình hơn PS.', status: 'verified' },
      { code: 'PVC', name_ja: 'ポリ塩化ビニル', name_vi: 'Polyvinyl Chloride', desc: 'Nhựa PVC. Độ bóng cao, bền nhưng chứa Clo (cấm ở một số ứng dụng thực phẩm).', status: 'verified' },
      { code: 'PST', name_ja: 'PST (?)', name_vi: 'PST', desc: 'Chưa rõ ràng, có thể là PS pha trộn (Thermoplastic) hoặc mã hợp kim tĩnh điện.', status: 'unverified' }
    ],
    surfaces: [
      { code: 'N', name_ja: 'ナチュラル (Natural)', name_vi: 'Trơn nguyên bản', desc: 'Không pha màu phụ gia, giữ màu tự nhiên của hạt nhựa gôc.', status: 'verified' },
      { code: 'CL', name_ja: 'クリア (Clear)', name_vi: 'Trong suốt', desc: 'Nhựa trong suốt (Thường gặp ở PET/PVC/PS Clear).', status: 'verified' },
      { code: 'B', name_ja: 'ブラック (Black) / 黒', name_vi: 'Màu đen', desc: 'Nhựa nhuộm đen. Đa phần các cuộn này có mix tĩnh điện (Đạo điện).', status: 'verified' },
      { code: 'W', name_ja: 'ホワイト (White) / 白', name_vi: 'Màu trắng', desc: 'Nhựa nhuộm trắng sữa.', status: 'verified' },
      { code: 'G', name_ja: 'グレー / グリーン (Gray/Green)', name_vi: 'Màu Xanh / Xám', desc: 'Thường thấy ở nhựa PET. Cần kiểm chứng cụ thể nhà máy.', status: 'unverified' }
    ],
    electricals: [
      { code: '導電', name_ja: '導電 (Dōden)', name_vi: 'Đạo điện (Conductive)', desc: 'Cách điện < 10^5 Ω. Cực đắt, xả tĩnh điện tức thì. Dành cho khay linh kiện IC chíp.', status: 'verified' },
      { code: '帯電', name_ja: '帯電防止 (Taiden-bōshi)', name_vi: 'Chống tĩnh điện', desc: '10^9 - 10^12 Ω. Ngăn hút bụi hoặc giật nhẹ, hay phủ lên bề mặt khay.', status: 'verified' },
      { code: '通電 / 通常', name_ja: '通常 (Tsūjō)', name_vi: 'Thông thường', desc: 'Ký hiệu Nhựa 100% nguyên bản, tĩnh điện > 10^12 Ω.', status: 'verified' }
    ],
    others: [
      { code: 'SI / 片SI', name_ja: 'シリコン (Silicon)', name_vi: 'Phủ Silicon', desc: 'Phết chất bôi trơn Silicon 1 mặt (片) hoặc 2 mặt (両) để gỡ màng dễ, không dính khuôn.', status: 'verified' },
      { code: 'RP', name_ja: 'RP東プラ', name_vi: 'RP', desc: 'Nhựa tái chế (Recycled) hoặc mã riêng của nhà Cung cấp Đông Pla.', status: 'unverified' },
      { code: 'AN', name_ja: 'AN', name_vi: 'Anti-Fog (?)', desc: 'Cần xác nhận xem có phải chất chống đọng sương hay mã khách.', status: 'unverified' },
      { code: 'JAE', name_ja: 'JAE', name_vi: 'Japan Aviation', desc: 'Có khả năng là tên mã khách hàng hoặc mã cấu hình linh kiện.', status: 'unverified' },
      { code: 'CP', name_ja: 'Clear Plastic / CP', name_vi: 'CP', desc: 'Hậu tố đi kèm PS(CP).', status: 'unverified' }
    ]
  };

  /**
   * Khởi tạo giao diện khi mở tab
   */
  function init(supabaseInfo, mountId, options) {
    containerEl = document.getElementById(mountId);
    if (!containerEl) return;

    injectStyles();
    render();
  }

  function render() {
    containerEl.innerHTML = `
      <div class="pdict-container">
        <div class="pdict-header">
          <div class="pdict-header-content">
            <h2 class="pdict-title">📖 Từ điển Thuật ngữ \u0026 Ký hiệu Nhựa</h2>
            <div class="pdict-subtitle">Tài liệu tham khảo song ngữ giúp giải mã các ký tự viết tắt xuất hiện trong hệ thống tồn kho. 
            Mục có nhãn <span class="pdict-badge unverified">Cần xác nhận</span> là các từ chưa rõ nghĩa, yêu cầu đội ngũ nhập dữ liệu vào source code.</div>
          </div>
          <button class="pdict-print-btn" onclick="window.print()">🖨️ In / PDF</button>
        </div>

        <div class="pdict-grid">
          ${renderSection('🧱 Họ Nhựa (Plastic Families)', dictData.families)}
          ${renderSection('🎨 Bề mặt \u0026 Màu sắc (Surface / Color)', dictData.surfaces)}
          ${renderSection('⚡ Đặc tính Điện (Electrical Properties)', dictData.electricals)}
          ${renderSection('🧪 Phụ gia \u0026 Đối tác (Additives \u0026 Others)', dictData.others)}
        </div>
      </div>
    `;
  }

  function renderSection(title, list) {
    return `
      <div class="pdict-section">
        <h3 class="pdict-section-title">${title}</h3>
        <div class="pdict-card-list">
          ${list.map(item => `
            <div class="pdict-card ${item.status === 'unverified' ? 'pdict-card-warn' : ''}">
              <div class="pdict-card-head">
                <div class="pdict-code">${item.code}</div>
                ${item.status === 'unverified' ? '<span class="pdict-badge unverified">Cần xác nhận</span>' : ''}
              </div>
              <div class="pdict-ja">${item.name_ja}</div>
              <div class="pdict-vi">${item.name_vi}</div>
              <div class="pdict-desc">${item.desc}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function injectStyles() {
    if (document.getElementById('pdict-styles')) return;

    const style = document.createElement('style');
    style.id = 'pdict-styles';
    style.textContent = `
      .pdict-container {
        padding: 24px;
        max-width: 1400px;
        margin: 0 auto;
        color: #1f2937;
        font-family: 'Segoe UI', system-ui, sans-serif;
      }
      .pdict-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        background: linear-gradient(135deg, #ffffff 0%, #f4f7fe 100%);
        border: 1px solid #e5e7eb;
        padding: 24px;
        border-radius: 16px;
        margin-bottom: 24px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.03);
      }
      .pdict-title {
        font-size: 24px;
        font-weight: 700;
        color: #22337b;
        margin: 0 0 8px 0;
      }
      .pdict-subtitle {
        font-size: 14px;
        color: #4b5563;
        line-height: 1.5;
        max-width: 800px;
      }
      .pdict-print-btn {
        background: #fff;
        border: 1px solid #d1d5db;
        padding: 8px 16px;
        border-radius: 8px;
        font-weight: 600;
        cursor: pointer;
        color: #374151;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .pdict-print-btn:hover {
        background: #f3f4f6;
        border-color: #9ca3af;
      }

      .pdict-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 24px;
      }
      @media (min-width: 1024px) {
        .pdict-grid {
          grid-template-columns: 1fr 1fr;
        }
      }

      .pdict-section {
        background: #fff;
        border-radius: 16px;
        border: 1px solid #e5e7eb;
        padding: 24px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.02);
      }
      .pdict-section-title {
        font-size: 18px;
        font-weight: 700;
        color: #111827;
        margin: 0 0 20px 0;
        padding-bottom: 12px;
        border-bottom: 2px solid #f3f4f6;
      }

      .pdict-card-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .pdict-card {
        padding: 16px;
        border-radius: 12px;
        background: #f9fafb;
        border: 1px solid #f3f4f6;
        transition: all 0.2s;
        border-left: 4px solid #3b82f6;
      }
      .pdict-card:hover {
        background: #fff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        border-color: #e5e7eb;
        border-left-color: #2563eb;
      }
      .pdict-card-warn {
        background: #fffbeb;
        border-color: #fef3c7;
        border-left-color: #f59e0b;
      }
      .pdict-card-warn:hover {
        background: #fff;
        border-color: #fde68a;
        border-left-color: #d97706;
      }

      .pdict-card-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      .pdict-code {
        font-size: 18px;
        font-weight: 800;
        color: #1f2937;
        background: #e0e7ff;
        padding: 4px 10px;
        border-radius: 6px;
        color: #3730a3;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      }
      .pdict-card-warn .pdict-code {
        background: #fef3c7;
        color: #92400e;
      }

      .pdict-ja {
        font-size: 15px;
        font-weight: 600;
        color: #374151;
        margin-bottom: 4px;
      }
      .pdict-vi {
        font-size: 14px;
        color: #6b7280;
        margin-bottom: 10px;
        font-style: italic;
      }
      .pdict-desc {
        font-size: 14px;
        color: #4b5563;
        line-height: 1.5;
        padding-top: 10px;
        border-top: 1px dashed #e5e7eb;
      }

      .pdict-badge {
        font-size: 12px;
        padding: 4px 8px;
        border-radius: 99px;
        font-weight: 600;
      }
      .pdict-badge.unverified {
        background: #fee2e2;
        color: #b91c1c;
      }

      @media print {
        .pr-sidebar, .pr-header, .pdict-print-btn { display: none !important; }
        .pr-main-head { display: none !important; }
        .pdict-container { padding: 0; }
        .pdict-section { break-inside: avoid; border: none; box-shadow: none; padding: 0; margin-bottom: 24px; }
        .pdict-card { border: 1px solid #e5e7eb; border-left: 4px solid #3b82f6; break-inside: avoid; }
      }
    `;
    document.head.appendChild(style);
  }

  // Phương thức reload rỗng để tương thích Router
  function reload() {
    render();
  }

  return { init, reload };
})();

if (typeof window !== 'undefined') {
  window.PlasticDictionaryUI = PlasticDictionaryUI;
}

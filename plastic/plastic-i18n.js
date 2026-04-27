/**
 * plastic-i18n.js
 * Quản lý ngôn ngữ (I18n) bằng Key cho hệ thống Plastic.
 * Hỗ trợ tạo HTML song ngữ theo mô hình `<span class="tag-ja">...</span><br><span class="tag-vi">...</span>`
 */

(function () {
    'use strict';
  
    const I18N_DICTIONARY = {
      // Dashboard Keys
      'dashboard.title': { ja: 'ダッシュボード', vi: 'Tổng quan kho nhựa' },
      'dashboard.subtitle': { ja: '入出庫、在庫、未紐付け・在庫低下のアラート', vi: 'Tổng hợp nhập, dùng, cảnh báo chưa map và tồn thấp' },
      'dashboard.btn.reload': { ja: 'リロード', vi: 'Tải lại' },
      
      'dashboard.period.today': { ja: '本日', vi: 'Hôm nay' },
      'dashboard.period.7d': { ja: '過去7日', vi: '7 ngày' },
      'dashboard.period.30d': { ja: '過去30日', vi: '30 ngày' },
      'dashboard.period.all': { ja: '全期間', vi: 'Toàn bộ' },
      
      'dashboard.stat.total_rolls': { ja: '総ロール数', vi: 'Tổng cuộn' },
      'dashboard.stat.total_received': { ja: '総入荷 (m)', vi: 'Tổng m nhập' },
      'dashboard.stat.total_current': { ja: '現在の総在庫 (m)', vi: 'Tổng m hiện tại' },
      'dashboard.stat.low_stock': { ja: '在庫低下ロール', vi: 'Cuộn tồn thấp' },
      'dashboard.stat.unmapped': { ja: '未紐付けロール', vi: 'Cuộn chưa map' },
      'dashboard.stat.suggested': { ja: '紐付け提案あり', vi: 'Cuộn định danh tự động' },
      'dashboard.stat.period_receipts': { ja: '期間内入荷', vi: 'Phiếu nhập trong kỳ' },
      'dashboard.stat.period_usage': { ja: '期間内消費 (m)', vi: 'm dùng trong kỳ' },
      'dashboard.stat.period_adjust': { ja: '期間内調整 (m)', vi: 'Đ.chỉnh ròng trong kỳ' },
  
      'dashboard.alerts.title': { ja: 'クイックアラート', vi: 'Cảnh báo nhanh' },
      'dashboard.alerts.desc': { ja: '優先的に処理する項目', vi: 'Các mục cần ưu tiên xử lý' },
      'dashboard.alerts.empty': { ja: '注意が必要なアラートはありません。', vi: 'Không có cảnh báo cần chú ý ngay.' },
      
      'dashboard.charts.family': { ja: '材質ごとの在庫割合', vi: 'Tỉ lệ tồn kho theo Nhóm Nhựa' },
      'dashboard.charts.supplier': { ja: 'サプライヤー別 在庫/入荷', vi: 'Tồn kho & Nhập theo Nhà CC' },
      'dashboard.charts.trend': { ja: '入荷 vs 消費トレンド', vi: 'Xu hướng Nhập/Xuất' },
      'dashboard.charts.waste': { ja: '材質ごとのロス/利用割合', vi: 'Tỉ lệ hao hụt / thực dùng' },
  
      'dashboard.recent_receipts.title': { ja: '最近の入荷', vi: 'Phiếu nhập mới' },
      'dashboard.recent_usage.title': { ja: '最近の消費', vi: 'Xuất dùng gần đây' },
      'dashboard.recent_adjustments.title': { ja: '最近の調整', vi: 'Điều chỉnh gần đây' },
      
      'dashboard.unmapped.title': { ja: '未紐付け/提案あり', vi: 'Cuộn chưa map' },
      'dashboard.lowstock.title': { ja: '在庫低下 (≤50m)', vi: 'Cuộn tồn thấp' },
      
      'table.date': { ja: '日付', vi: 'Ngày' },
      'table.time': { ja: '日時', vi: 'Thời gian' },
      'table.receipt_no': { ja: '入荷番号', vi: 'Số phiếu' },
      'table.supplier': { ja: 'サプライヤー', vi: 'Nhà cung cấp' },
      'table.status': { ja: 'ステータス', vi: 'Trạng thái' },
      'table.roll': { ja: 'ロール', vi: 'Cuộn' },
      'table.length_used': { ja: '使用 (m)', vi: 'm dùng' },
      'table.note': { ja: '備考', vi: 'Ghi chú' },
      'table.type': { ja: '種類', vi: 'Loại' },
      'table.change': { ja: '変更量', vi: 'Thay đổi' },
      'table.commercial_grade': { ja: 'メーカー型番', vi: 'Mã hãng' },
      'table.thickness': { ja: '厚さ(mm)', vi: 'Dày' },
      'table.width': { ja: '幅(mm)', vi: 'Khổ' },
      'table.lot_no': { ja: 'ロット番号', vi: 'Lot' },
      'table.mapping_state': { ja: '紐付状態', vi: 'Map' },
      'table.plastic_code': { ja: '標準コード', vi: 'Mã chuẩn' },
      'table.warehouse_location': { ja: '保管場所', vi: 'Kho/Rack' },
      'table.current_length': { ja: '残り (m)', vi: 'm còn' },
      'table.empty': { ja: 'データがありません。', vi: 'Không có dữ liệu.' },

      // Families
      'family.A-PET': { ja: 'A-PET (アモルファスPET)', vi: 'A-PET (PET vô định hình)' },
      'family.PP': { ja: 'PP (ポリプロピレン)', vi: 'PP (Polypropylene)' },
      'family.PS': { ja: 'PS (ポリスチレン)', vi: 'PS (Polystyrene)' },
      'family.PVC': { ja: 'PVC (ポリ塩化ビニル)', vi: 'PVC (Polyvinyl Chloride)' },
      'family.PET': { ja: 'PET (ポリエチレンテレフタレート)', vi: 'PET (Polyethylene Terephthalate)' },
      'family.Other': { ja: 'その他', vi: 'Khác' },

      // Colors
      'color.black': { ja: '黒', vi: 'Đen' },
      'color.white': { ja: '白', vi: 'Trắng' },
      'color.green': { ja: '緑', vi: 'Xanh Lá' },
      'color.blue': { ja: '青', vi: 'Xanh Dương' },
      'color.red': { ja: '赤', vi: 'Đỏ' },
      'color.brown': { ja: '茶色', vi: 'Nâu' },
      'color.grey': { ja: 'グレー', vi: 'Xám' },
      'color.natural': { ja: 'ナチュラル', vi: 'Tự Nhiên (Natural)' },
      'color.clear': { ja: 'クリア', vi: 'Trong Suốt (Clear)' },
      'color.transparent': { ja: '透明', vi: 'Trong Suốt' },
      'color.transparent_blue': { ja: '透明青', vi: 'Xanh Trong' },
      'color.unknown': { ja: 'その他・未確認', vi: 'Khác / Chưa XĐ' },
      'color.gray_or_green_unconfirmed': { ja: 'グレー・緑 (未確認)', vi: 'Xám/Xanh (Chờ XĐ)' },
      'color.black_or_blue_or_brown_unconfirmed': { ja: '黒・青・茶 (未確認)', vi: 'Đen/Xanh/Nâu (Chờ XĐ)' },
      'color.tb_unconfirmed': { ja: '透明青 (未確認)', vi: 'Xanh Trong (Chờ XĐ)' },

      // States
      'state.suggested': { ja: '提案あり', vi: 'Gợi ý map' },
      'state.unmapped': { ja: '未紐付', vi: 'Chưa Map' },
    };
  
    /**
     * Dịch text đơn giản (trả về chuỗi raw, nếu muốn nối thủ công).
     * @param {string} key
     * @param {string} lang ('ja' | 'vi')
     * @returns {string}
     */
    function rawTag(key, lang) {
      if (!I18N_DICTIONARY[key]) return key;
      return I18N_DICTIONARY[key][lang] || key;
    }
  
    /**
     * Tạo HTML song ngữ theo chuẩn Pipeline.
     * @param {string} key Mã ngôn ngữ (Ví dụ: 'dashboard.title')
     * @param {boolean} multiline Xuống dòng (dùng <br>). Mặc định là false (dùng khoảng trắng).
     * @returns {string} `<span class="tag-ja">Tiếng Nhật</span> <span class="tag-vi">Tiếng Việt</span>`
     */
    function t(key, multiline = false) {
      if (!I18N_DICTIONARY[key]) {
        return `<span class="tag-vi">${key}</span>`; // Dự phòng nếu gọi key thiếu
      }
      const separator = multiline ? '<br>' : ' ';
      return `<div style="display:inline-flex; flex-direction:${multiline ? 'column' : 'row'}; gap:${multiline ? '0px' : '4px'}; line-height: 1.2;">
                <span class="tag-ja" style="font-size:0.85em; opacity:0.8;">${I18N_DICTIONARY[key].ja}</span>
                <span class="tag-vi">${I18N_DICTIONARY[key].vi}</span>
              </div>`;
    }
  
    /**
     * Dịch text ra plain text (Dùng cho Chart.js hoặc thuộc tính title HTML)
     * Trả về định dạng: Tiếng Nhật / Tiếng Việt
     */
    function plainText(key) {
      if (!I18N_DICTIONARY[key]) return key.replace('color.', ''); // fallback bỏ tiền tố nếu là key màu
      const dict = I18N_DICTIONARY[key];
      if (dict.ja && dict.vi) return `${dict.ja} / ${dict.vi}`;
      return dict.ja || dict.vi || key;
    }
  
    window.PlasticI18n = {
      raw: rawTag,
      t: t,
      plainText: plainText
    };
  
    // Đổ hàm t ra global để gọi ngắn gọn trong các file UI.
    window.t = window.PlasticI18n.t;
    window.t_plain = window.PlasticI18n.plainText;
  
  })();
  

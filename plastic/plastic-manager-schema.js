/**
 * plastic-manager-schema.js
 * Định nghĩa enum, schema cột, hàm validate và hàm tiện ích dùng chung
 * cho toàn bộ hệ thống quản lý nhựa (plastic-manager).
 *
 * Import ví dụ:
 *   import {
 *     PLASTIC_FAMILY, COLOR_CODE, COLOR_NAME_NORMALIZED,
 *     ELECTRICAL_PROPERTY, SILICONE_STATUS, ROLL_STATUS,
 *     STATUS_REVIEW, MAPPING_STATUS, PLAN_STATUS, RECEIPT_STATUS,
 *     SNAPSHOT_STATUS, COUNT_RESULT, CHANGE_TYPE,
 *     PLASTIC_SCHEMA, ROLL_SCHEMA, RECEIPT_SCHEMA,
 *     getEnumOptions, validateRow, formatLength,
 *   } from './plastic-manager-schema.js';
 */

// ============================================================
// ENUM — Dùng để render dropdown, validate, lọc, hiển thị badge
// ============================================================

/**
 * Họ nhựa gốc
 * Giá trị dùng trong: plastic_master.plastic_family
 */
const PLASTIC_FAMILY = Object.freeze({
  PS:    { value: 'PS',    label: 'PS',    label_vi: 'Polystyrene' },
  PP:    { value: 'PP',    label: 'PP',    label_vi: 'Polypropylene' },
  PET:   { value: 'PET',   label: 'PET',   label_vi: 'Polyethylene terephthalate' },
  PVC:   { value: 'PVC',   label: 'PVC',   label_vi: 'Polyvinyl chloride' },
  PPF:   { value: 'PPF',   label: 'PPF',   label_vi: 'Polypropylene foam' },
  OTHER: { value: 'OTHER', label: 'OTHER', label_vi: 'Loại khác' },
});

/**
 * Nhóm con / biến thể nhựa
 * Giá trị dùng trong: plastic_master.plastic_subtype
 */
const PLASTIC_SUBTYPE = Object.freeze({
  'A-PET':   { value: 'A-PET',   label: 'A-PET',   label_vi: 'PET vô định hình' },
  'C-APET':  { value: 'C-APET',  label: 'C-APET',  label_vi: 'Biến thể thương mại A-PET' },
  'TB-APET': { value: 'TB-APET', label: 'TB-APET', label_vi: 'Biến thể thương mại A-PET' },
  'PST':     { value: 'PST',     label: 'PST',     label_vi: 'Nhóm con PS' },
});

/**
 * Mã màu gốc (giữ nguyên từ nhãn hoặc file cũ)
 * Giá trị dùng trong: plastic_master.color_code_raw
 */
const COLOR_CODE = Object.freeze({
  N:   { value: 'N',   label: 'N',   label_vi: 'Tự nhiên (Natural)' },
  CL:  { value: 'CL',  label: 'CL',  label_vi: 'Trong suốt (Clear)' },
  G:   { value: 'G',   label: 'G',   label_vi: 'Xám / Xanh lá (chưa xác nhận)' },
  B:   { value: 'B',   label: 'B',   label_vi: 'Đen / Xanh / Nâu (chưa xác nhận)' },
  W:   { value: 'W',   label: 'W',   label_vi: 'Trắng (White)' },
  TB:  { value: 'TB',  label: 'TB',  label_vi: 'TB (chưa xác nhận)' },
  '導電': { value: '導電', label: '導電', label_vi: 'Dẫn điện (Conductive)' },
});

/**
 * Màu chuẩn hóa
 * Giá trị dùng trong: plastic_master.color_name_normalized
 */
const COLOR_NAME_NORMALIZED = Object.freeze({
  natural:   { value: 'natural',   label: 'Natural',   label_vi: 'Tự nhiên' },
  clear:     { value: 'clear',     label: 'Clear',     label_vi: 'Trong suốt' },
  gray:      { value: 'gray',      label: 'Gray',      label_vi: 'Xám' },
  black:     { value: 'black',     label: 'Black',     label_vi: 'Đen' },
  white:     { value: 'white',     label: 'White',     label_vi: 'Trắng' },
  green:     { value: 'green',     label: 'Green',     label_vi: 'Xanh lá' },
  blue:      { value: 'blue',      label: 'Blue',      label_vi: 'Xanh dương' },
  brown:     { value: 'brown',     label: 'Brown',     label_vi: 'Nâu' },
  unknown:   { value: 'unknown',   label: 'Unknown',   label_vi: 'Chưa xác nhận' },
});

/**
 * Tính chất điện
 * Giá trị dùng trong: plastic_master.electrical_property
 */
const ELECTRICAL_PROPERTY = Object.freeze({
  normal:      { value: 'normal',      label: 'Normal',      label_vi: 'Thường' },
  conductive:  { value: 'conductive',  label: 'Conductive',  label_vi: 'Dẫn điện' },
  antistatic:  { value: 'antistatic',  label: 'Antistatic',  label_vi: 'Chống tĩnh điện' },
  unknown:     { value: 'unknown',     label: 'Unknown',     label_vi: 'Chưa xác nhận' },
});

/**
 * Trạng thái silicone
 * Giá trị dùng trong: plastic_master.silicone_status_normalized
 */
const SILICONE_STATUS = Object.freeze({
  silicone_free: { value: 'silicone_free', label: 'Non-silicon', label_vi: 'Không silicone' },
  with_silicone: { value: 'with_silicone', label: 'With silicon', label_vi: 'Có silicone' },
  unknown:       { value: 'unknown',       label: 'Unknown',      label_vi: 'Chưa xác nhận' },
});

/**
 * Trạng thái xem xét dữ liệu
 * Giá trị dùng trong: plastic_master.status_review, plastic_manufacturer_map.status_review
 */
const STATUS_REVIEW = Object.freeze({
  draft:     { value: 'draft',     label: 'Draft',     label_vi: 'Chưa kiểm tra' },
  checked:   { value: 'checked',   label: 'Checked',   label_vi: 'Đã kiểm tra bằng mắt' },
  confirmed: { value: 'confirmed', label: 'Confirmed', label_vi: 'Đã xác nhận bằng tài liệu' },
});

/**
 * Trạng thái mapping mã hãng
 * Giá trị dùng trong: plastic_manufacturer_map.mapping_status
 */
const MAPPING_STATUS = Object.freeze({
  confirmed:              { value: 'confirmed',              label: 'Confirmed',              label_vi: 'Đã xác nhận' },
  provisional_confirmed:  { value: 'provisional_confirmed',  label: 'Provisional',            label_vi: 'Xác nhận sơ bộ' },
  needs_confirmation:     { value: 'needs_confirmation',     label: 'Needs confirmation',     label_vi: 'Cần xác nhận thêm' },
  rejected:               { value: 'rejected',               label: 'Rejected',               label_vi: 'Không hợp lệ' },
});

/**
 * Trạng thái cuộn tồn kho
 * Giá trị dùng trong: plastic_receipt_roll.roll_status
 */
const ROLL_STATUS = Object.freeze({
  in_stock:  { value: 'in_stock',  label: 'In Stock',  label_vi: 'Trong kho' },
  in_use:    { value: 'in_use',    label: 'In Use',    label_vi: 'Đang dùng' },
  empty:     { value: 'empty',     label: 'Empty',     label_vi: 'Đã hết' },
  returned:  { value: 'returned',  label: 'Returned',  label_vi: 'Đã trả' },
  damaged:   { value: 'damaged',   label: 'Damaged',   label_vi: 'Hỏng / phế liệu' },
  reserved:  { value: 'reserved',  label: 'Reserved',  label_vi: 'Đang giữ cho kế hoạch' },
});

/**
 * Trạng thái phiếu nhập
 * Giá trị dùng trong: plastic_receipt.status
 */
const RECEIPT_STATUS = Object.freeze({
  draft:     { value: 'draft',     label: 'Draft',     label_vi: 'Nháp' },
  confirmed: { value: 'confirmed', label: 'Confirmed', label_vi: 'Đã xác nhận' },
  cancelled: { value: 'cancelled', label: 'Cancelled', label_vi: 'Đã hủy' },
});

/**
 * Trạng thái kế hoạch dùng nhựa
 * Giá trị dùng trong: plastic_usage_plan.plan_status
 */
const PLAN_STATUS = Object.freeze({
  draft:       { value: 'draft',       label: 'Draft',       label_vi: 'Nháp' },
  confirmed:   { value: 'confirmed',   label: 'Confirmed',   label_vi: 'Đã duyệt' },
  in_progress: { value: 'in_progress', label: 'In Progress', label_vi: 'Đang thực hiện' },
  completed:   { value: 'completed',   label: 'Completed',   label_vi: 'Hoàn thành' },
  cancelled:   { value: 'cancelled',   label: 'Cancelled',   label_vi: 'Đã hủy' },
});

/**
 * Trạng thái đợt kiểm kê
 * Giá trị dùng trong: plastic_inventory_snapshot.status
 */
const SNAPSHOT_STATUS = Object.freeze({
  open:        { value: 'open',        label: 'Open',        label_vi: 'Mới mở' },
  in_progress: { value: 'in_progress', label: 'In Progress', label_vi: 'Đang đếm' },
  completed:   { value: 'completed',   label: 'Completed',   label_vi: 'Hoàn thành' },
  cancelled:   { value: 'cancelled',   label: 'Cancelled',   label_vi: 'Đã hủy' },
});

/**
 * Kết quả kiểm kê từng cuộn
 * Giá trị dùng trong: plastic_inventory_count_line.count_result
 */
const COUNT_RESULT = Object.freeze({
  matched:   { value: 'matched',   label: 'Matched',   label_vi: 'Khớp', color: 'green' },
  over:      { value: 'over',      label: 'Over',      label_vi: 'Thừa',  color: 'blue' },
  short:     { value: 'short',     label: 'Short',     label_vi: 'Thiếu', color: 'orange' },
  not_found: { value: 'not_found', label: 'Not Found', label_vi: 'Không thấy', color: 'red' },
  extra:     { value: 'extra',     label: 'Extra',     label_vi: 'Cuộn ngoài hệ thống', color: 'purple' },
});

/**
 * Loại biến động tồn kho
 * Giá trị dùng trong: plastic_adjustment_log.change_type
 */
const CHANGE_TYPE = Object.freeze({
  usage:                { value: 'usage',                label: 'Usage',              label_vi: 'Xuất dùng sản xuất' },
  inventory_adjustment: { value: 'inventory_adjustment', label: 'Inv. Adjustment',    label_vi: 'Điều chỉnh kiểm kê' },
  damage:               { value: 'damage',               label: 'Damage',             label_vi: 'Hỏng / phế liệu' },
  return:               { value: 'return',               label: 'Return',             label_vi: 'Trả về kho' },
  manual_fix:           { value: 'manual_fix',           label: 'Manual Fix',         label_vi: 'Sửa tay' },
  receive_correction:   { value: 'receive_correction',   label: 'Receive Correction', label_vi: 'Điều chỉnh khi nhập kho' },
  reserve:              { value: 'reserve',              label: 'Reserve',            label_vi: 'Giữ cho kế hoạch' },
  unreserve:            { value: 'unreserve',            label: 'Unreserve',          label_vi: 'Bỏ giữ' },
});

/**
 * Trạng thái map của cuộn khi hiển thị (chỉ dùng trên UI, không lưu DB)
 */
const MAPPED_STATE = Object.freeze({
  mapped:    { value: 'mapped',    label: 'Mapped',    label_vi: 'Đã map', color: '#22c55e' },
  suggested: { value: 'suggested', label: 'Suggested', label_vi: 'Gợi ý',  color: '#f59e0b' },
  unmapped:  { value: 'unmapped',  label: 'Unmapped',  label_vi: 'Chưa map', color: '#ef4444' },
});


// ============================================================
// SCHEMA — Mô tả cột từng bảng, dùng để render form, validate
// ============================================================

/**
 * Cột bảng plastic_master
 * required: true = bắt buộc khi tạo/sửa
 * type: 'text' | 'number' | 'enum' | 'boolean' | 'textarea'
 */
const PLASTIC_SCHEMA = [
  { field: 'plastic_code',              type: 'text',     required: true,  label_vi: 'Mã chuẩn công ty' },
  { field: 'plastic_family',            type: 'enum',     required: true,  label_vi: 'Họ nhựa', enum: PLASTIC_FAMILY },
  { field: 'plastic_subtype',           type: 'text',     required: false, label_vi: 'Nhóm con' },
  { field: 'thickness_mm',              type: 'number',   required: true,  label_vi: 'Độ dày (mm)' },
  { field: 'width_mm',                  type: 'number',   required: true,  label_vi: 'Khổ rộng (mm)' },
  { field: 'standard_length_m',         type: 'number',   required: false, label_vi: 'Chiều dài tiêu chuẩn (m)' },
  { field: 'color_code_raw',            type: 'text',     required: true,  label_vi: 'Mã màu gốc' },
  { field: 'color_name_normalized',     type: 'enum',     required: false, label_vi: 'Màu chuẩn hóa', enum: COLOR_NAME_NORMALIZED },
  { field: 'electrical_property',       type: 'enum',     required: true,  label_vi: 'Tính chất điện', enum: ELECTRICAL_PROPERTY },
  { field: 'silicone_status_normalized',type: 'enum',     required: true,  label_vi: 'Trạng thái silicone', enum: SILICONE_STATUS },
  { field: 'additive_flags',            type: 'text',     required: false, label_vi: 'Phụ gia chuẩn hóa (phân cách ;)' },
  { field: 'additive_text_raw',         type: 'text',     required: false, label_vi: 'Phụ gia nguyên văn' },
  { field: 'appearance_text_raw',       type: 'text',     required: false, label_vi: 'Mô tả bề mặt nguyên văn' },
  { field: 'an_code_raw',               type: 'text',     required: false, label_vi: 'Mã AN gốc' },
  { field: 'si_code_raw',               type: 'text',     required: false, label_vi: 'Mã SI gốc' },
  { field: 'ab_code_raw',               type: 'text',     required: false, label_vi: 'Mã AB gốc' },
  { field: 'status_review',             type: 'enum',     required: true,  label_vi: 'Trạng thái xem xét', enum: STATUS_REVIEW },
  { field: 'remarks_raw',               type: 'textarea', required: false, label_vi: 'Ghi chú' },
  { field: 'is_active',                 type: 'boolean',  required: true,  label_vi: 'Đang sử dụng' },
];

/**
 * Cột bảng plastic_manufacturer_map
 */

const SUPPLIER_SCHEMA = [
  { field: 'supplier_code',    type: 'text',   required: true,  label_vi: 'Mã nhà cung cấp' },
  { field: 'supplier_name',    type: 'text',   required: true,  label_vi: 'Tên nhà cung cấp' },
  { field: 'short_name',       type: 'text',   required: false, label_vi: 'Tên viết tắt' },
  { field: 'contact_info',     type: 'textarea',required: false, label_vi: 'Thông tin liên hệ' },
  { field: 'is_active',        type: 'checkbox',required: false, label_vi: 'Đang hoạt động', defaultValue: 'true' },
  { field: 'note',             type: 'textarea',required: false, label_vi: 'Ghi chú' }
];

const MANUFACTURER_GRADE_SCHEMA = [
  { field: 'supplier_id',           type: 'text',   required: true,  label_vi: 'ID Nhà cung cấp' },
  { field: 'commercial_grade_code', type: 'text',   required: true,  label_vi: 'Mã Hãng (Grade)' },
  { field: 'plastic_id',            type: 'text',   required: false, label_vi: 'Mã chuẩn công ty (YSD)' },
  { field: 'mapping_status',        type: 'enum',   required: false, label_vi: 'Trạng thái Mapping', enum: MAPPING_STATUS },
  { field: 'specific_gravity_kg_m3',type: 'number', required: false, label_vi: 'Tỉ trọng (kg/m3)' },
  { field: 'price_jpy_per_kg',      type: 'number', required: false, label_vi: 'Giá Nội Bộ (JPY/kg)' },
  { field: 'note',                  type: 'textarea',required: false, label_vi: 'Ghi chú' },
  { field: 'is_active',             type: 'checkbox',required: false, label_vi: 'Đang hoạt động', defaultValue: 'true' }
];

const PRICING_SCHEMA = [
  { field: 'grade_id',         type: 'text',   required: true,  label_vi: 'ID Mã Hãng' },
  { field: 'price_jpy_per_kg', type: 'number', required: true,  label_vi: 'Giá JPY/kg' },
  { field: 'effective_date',   type: 'date',   required: true,  label_vi: 'Ngày áp dụng' },
  { field: 'status',           type: 'text',   required: false, label_vi: 'Trạng thái' },
  { field: 'note',             type: 'text',   required: false, label_vi: 'Ghi chú' }
];

const RECEIPT_SCHEMA = [
  { field: 'receipt_no',       type: 'text', required: true,  label_vi: 'Số phiếu nhập' },
  { field: 'receipt_date',     type: 'text', required: true,  label_vi: 'Ngày nhập' },
  { field: 'supplier_name',    type: 'text', required: true,  label_vi: 'Nhà cung cấp' },
  { field: 'invoice_no',       type: 'text', required: false, label_vi: 'Số hóa đơn' },
  { field: 'delivery_note_no', type: 'text', required: false, label_vi: 'Số phiếu giao hàng' },
  { field: 'status',           type: 'enum', required: true,  label_vi: 'Trạng thái', enum: RECEIPT_STATUS },
  { field: 'notes',            type: 'textarea', required: false, label_vi: 'Ghi chú' },
];

/**
 * Cột bảng plastic_receipt_roll (từng cuộn)
 */
const ROLL_SCHEMA = [
  { field: 'receipt_id',           type: 'text',   required: true,  label_vi: 'ID phiếu nhập' },
  { field: 'plastic_id',           type: 'text',   required: false, label_vi: 'Mã chuẩn (UUID)' },
  { field: 'commercial_grade_code',type: 'text',   required: false, label_vi: 'Mã hãng' },
  { field: 'supplier_name',        type: 'text',   required: false, label_vi: 'Nhà cung cấp' },
  { field: 'lot_no',               type: 'text',   required: false, label_vi: 'Số lot' },
  { field: 'thickness_mm',         type: 'number', required: false, label_vi: 'Độ dày (mm)' },
  { field: 'width_mm',             type: 'number', required: false, label_vi: 'Khổ rộng (mm)' },
  { field: 'nominal_length_m',     type: 'number', required: false, label_vi: 'Chiều dài danh nghĩa (m)' },
  { field: 'received_length_m',    type: 'number', required: false, label_vi: 'Chiều dài nhập kho (m)' },
  { field: 'current_length_m',     type: 'number', required: true,  label_vi: 'Chiều dài hiện tại (m)' },
  { field: 'warehouse_location',   type: 'text',   required: false, label_vi: 'Vị trí kho' },
  { field: 'roll_status',          type: 'enum',   required: true,  label_vi: 'Trạng thái cuộn', enum: ROLL_STATUS },
  { field: 'notes',                type: 'textarea',required: false,label_vi: 'Ghi chú' },
];

/**
 * Cột bảng plastic_adjustment_log
 */
const ADJUSTMENT_LOG_SCHEMA = [
  { field: 'receipt_roll_id',  type: 'text',     required: true,  label_vi: 'ID cuộn' },
  { field: 'change_type',      type: 'enum',     required: true,  label_vi: 'Loại biến động', enum: CHANGE_TYPE },
  { field: 'change_length_m',  type: 'number',   required: true,  label_vi: 'Thay đổi (m), dương=cộng, âm=trừ' },
  { field: 'before_length_m',  type: 'number',   required: false, label_vi: 'Mét trước thay đổi' },
  { field: 'after_length_m',   type: 'number',   required: false, label_vi: 'Mét sau thay đổi' },
  { field: 'reason_note',      type: 'textarea', required: false, label_vi: 'Lý do' },
  { field: 'reference_type',   type: 'text',     required: false, label_vi: 'Loại tham chiếu' },
  { field: 'reference_id',     type: 'text',     required: false, label_vi: 'ID tham chiếu' },
];

/**
 * Cấu hình tìm kiếm tổng hợp (dùng trong màn hình tồn kho)
 * keyword_fields: các cột sẽ được tìm kiếm theo từ khóa
 */
const PLASTIC_SEARCH_CONFIG = Object.freeze({
  keyword_fields: [
    'plastic_code',
    'commercial_grade_code',
    'supplier_name',
    'lot_no',
    'warehouse_location',
    'plastic_family',
    'plastic_subtype',
    'color_code_raw',
    'color_name_normalized',
    'additive_flags',
    'notes',
  ],
  filter_fields: [
    'plastic_family',
    'color_code_raw',
    'color_name_normalized',
    'electrical_property',
    'silicone_status_normalized',
    'supplier_name',
    'warehouse_location',
    'roll_status',
    'status_review',
  ],
  sort_fields: [
    'plastic_code',
    'commercial_grade_code',
    'plastic_family',
    'thickness_mm',
    'width_mm',
    'current_length_m',
    'received_length_m',
    'receipt_date',
    'updated_at',
    'lot_no',
  ],
});


// ============================================================
// HÀM TIỆN ÍCH
// ============================================================

/**
 * Trả về mảng options [{value, label, label_vi}] từ một enum object,
 * dùng để render <select> hoặc dropdown.
 *
 * @param {Object} enumObj  - Một trong các enum ở trên
 * @param {boolean} addAll  - Có thêm option "Tất cả" ở đầu không
 * @returns {Array<{value:string, label:string, label_vi:string}>}
 */
function getEnumOptions(enumObj, addAll = false) {
  const options = Object.values(enumObj).map(item => ({
    value:    item.value,
    label:    item.label,
    label_vi: item.label_vi,
  }));
  if (addAll) {
    options.unshift({ value: '', label: 'All', label_vi: 'Tất cả' });
  }
  return options;
}

/**
 * Kiểm tra giá trị hợp lệ theo enum.
 *
 * @param {Object} enumObj
 * @param {string} value
 * @returns {boolean}
 */
function isValidEnum(enumObj, value) {
  return Object.values(enumObj).some(item => item.value === value);
}

/**
 * Validate một row dữ liệu theo schema.
 * Trả về { valid: boolean, errors: [{field, message}] }
 *
 * @param {Object} row    - Dữ liệu cần validate
 * @param {Array}  schema - Một trong các *_SCHEMA ở trên
 * @returns {{ valid: boolean, errors: Array<{field:string, message:string}> }}
 */
function validateRow(row, schema) {
  const errors = [];

  for (const col of schema) {
    const val = row[col.field];
    const isEmpty = val === null || val === undefined || String(val).trim() === '';

    if (col.required && isEmpty) {
      errors.push({ field: col.field, message: `${col.label_vi} không được để trống` });
      continue;
    }

    if (!isEmpty) {
      if (col.type === 'number') {
        const num = Number(val);
        if (isNaN(num)) {
          errors.push({ field: col.field, message: `${col.label_vi} phải là số` });
        }
      }
      if (col.type === 'enum' && col.enum) {
        if (!isValidEnum(col.enum, val)) {
          const allowed = Object.values(col.enum).map(e => e.value).join(', ');
          errors.push({
            field: col.field,
            message: `${col.label_vi} phải là một trong: ${allowed}`,
          });
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Format số mét tồn kho hiển thị trên UI.
 * Ví dụ: 200 → "200 m", 0 → "0 m", null → "—"
 *
 * @param {number|null|undefined} value
 * @param {number} decimals - Số chữ số thập phân (mặc định 1)
 * @returns {string}
 */
function formatLength(value, decimals = 1) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (isNaN(num)) return '—';
  return num.toFixed(decimals) + ' m';
}

/**
 * Format số mét với dấu + / − khi hiển thị biến động.
 * Ví dụ: -5 → "−5.0 m", 3.5 → "+3.5 m"
 *
 * @param {number|null|undefined} value
 * @returns {string}
 */
function formatLengthSigned(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (isNaN(num)) return '—';
  const sign = num >= 0 ? '+' : '−';
  return `${sign}${Math.abs(num).toFixed(1)} m`;
}

/**
 * Format ngày ISO sang dạng hiển thị YYYY/MM/DD.
 *
 * @param {string|null} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}/${m}/${day}`;
}

/**
 * Format datetime ISO sang dạng hiển thị YYYY/MM/DD HH:MM (JST).
 *
 * @param {string|null} dtStr
 * @returns {string}
 */
function formatDateTime(dtStr) {
  if (!dtStr) return '—';
  const d = new Date(dtStr);
  if (isNaN(d.getTime())) return dtStr;
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).replace(/\//g, '/');
}

/**
 * Escape HTML để chèn an toàn vào innerHTML.
 *
 * @param {any} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Tìm mapping tốt nhất cho một cuộn chưa có plastic_id,
 * dựa trên commercial_grade_code và supplier_name.
 *
 * @param {string} gradeCode
 * @param {string} supplierName
 * @param {Array}  mapData     - Toàn bộ bản ghi plastic_manufacturer_map
 * @returns {Object|null}      - Bản ghi map phù hợp nhất hoặc null
 */
function findBestMap(gradeCode, supplierName, mapData) {
  if (!gradeCode || !mapData || !mapData.length) return null;

  const normalizeStr = s => (s || '').toLowerCase().trim();
  const grade = normalizeStr(gradeCode);
  const supplier = normalizeStr(supplierName);

  // Ưu tiên: khớp cả grade + supplier
  let best = mapData.find(m =>
    normalizeStr(m.commercial_grade_code) === grade &&
    normalizeStr(m.supplier_name) === supplier &&
    m.mapping_status !== 'rejected'
  );
  if (best) return best;

  // Fallback: chỉ khớp grade
  best = mapData.find(m =>
    normalizeStr(m.commercial_grade_code) === grade &&
    m.mapping_status !== 'rejected'
  );
  return best || null;
}

/**
 * Tính trạng thái map của một cuộn dựa trên plastic_id và kết quả findBestMap.
 *
 * @param {string|null} plastic_id
 * @param {Object|null} autoMap    - Kết quả findBestMap
 * @returns {'mapped'|'suggested'|'unmapped'}
 */
function getMappedState(plastic_id, autoMap) {
  if (plastic_id) return 'mapped';
  if (autoMap && autoMap.plastic_id) return 'suggested';
  return 'unmapped';
}

/**
 * Tính % sử dụng của một cuộn.
 *
 * @param {number} received_length_m
 * @param {number} current_length_m
 * @returns {number|null} 0–100 hoặc null nếu không tính được
 */
function calcUsagePercent(received_length_m, current_length_m) {
  const recv = Number(received_length_m);
  const curr = Number(current_length_m);
  if (!recv || recv <= 0) return null;
  return Math.max(0, Math.min(100, ((recv - curr) / recv) * 100));
}

/**
 * Kiểm tra cuộn có đang ở trạng thái tồn thấp không.
 * Ngưỡng mặc định: còn dưới 50 m và khác 0.
 *
 * @param {number} current_length_m
 * @param {number} threshold - Ngưỡng tồn thấp, mặc định 50
 * @returns {boolean}
 */
function isLowStock(current_length_m, threshold = 50) {
  const curr = Number(current_length_m);
  return curr > 0 && curr <= threshold;
}

// Gán ra window để các file khác dùng được (non-module build)
(function(){
  var _e = {
    PLASTIC_FAMILY: typeof PLASTIC_FAMILY!=='undefined'?PLASTIC_FAMILY:null,
    PLASTIC_SUBTYPE: typeof PLASTIC_SUBTYPE!=='undefined'?PLASTIC_SUBTYPE:null,
    COLOR_CODE: typeof COLOR_CODE!=='undefined'?COLOR_CODE:null,
    COLOR_NAME_NORMALIZED: typeof COLOR_NAME_NORMALIZED!=='undefined'?COLOR_NAME_NORMALIZED:null,
    ELECTRICAL_PROPERTY: typeof ELECTRICAL_PROPERTY!=='undefined'?ELECTRICAL_PROPERTY:null,
    SILICONE_STATUS: typeof SILICONE_STATUS!=='undefined'?SILICONE_STATUS:null,
    STATUS_REVIEW: typeof STATUS_REVIEW!=='undefined'?STATUS_REVIEW:null,
    MAPPING_STATUS: typeof MAPPING_STATUS!=='undefined'?MAPPING_STATUS:null,
    ROLL_STATUS: typeof ROLL_STATUS!=='undefined'?ROLL_STATUS:null,
    RECEIPT_STATUS: typeof RECEIPT_STATUS!=='undefined'?RECEIPT_STATUS:null,
    PLAN_STATUS: typeof PLAN_STATUS!=='undefined'?PLAN_STATUS:null,
    SNAPSHOT_STATUS: typeof SNAPSHOT_STATUS!=='undefined'?SNAPSHOT_STATUS:null,
    COUNT_RESULT: typeof COUNT_RESULT!=='undefined'?COUNT_RESULT:null,
    CHANGE_TYPE: typeof CHANGE_TYPE!=='undefined'?CHANGE_TYPE:null,
    MAPPED_STATE: typeof MAPPED_STATE!=='undefined'?MAPPED_STATE:null,
    PLASTIC_SCHEMA: typeof PLASTIC_SCHEMA!=='undefined'?PLASTIC_SCHEMA:null,
    MANUFACTURER_MAP_SCHEMA: typeof MANUFACTURER_MAP_SCHEMA!=='undefined'?MANUFACTURER_MAP_SCHEMA:null,
    RECEIPT_SCHEMA: typeof RECEIPT_SCHEMA!=='undefined'?RECEIPT_SCHEMA:null,
    ROLL_SCHEMA: typeof ROLL_SCHEMA!=='undefined'?ROLL_SCHEMA:null,
    ADJUSTMENT_LOG_SCHEMA: typeof ADJUSTMENT_LOG_SCHEMA!=='undefined'?ADJUSTMENT_LOG_SCHEMA:null,
    getEnumOptions: typeof getEnumOptions!=='undefined'?getEnumOptions:null,
    isValidEnum: typeof isValidEnum!=='undefined'?isValidEnum:null,
    validateRow: typeof validateRow!=='undefined'?validateRow:null,
    formatLength: typeof formatLength!=='undefined'?formatLength:null,
    formatLengthSigned: typeof formatLengthSigned!=='undefined'?formatLengthSigned:null,
    formatDate: typeof formatDate!=='undefined'?formatDate:null,
    formatDateTime: typeof formatDateTime!=='undefined'?formatDateTime:null,
    escapeHtml: typeof escapeHtml!=='undefined'?escapeHtml:null,
    findBestMap: typeof findBestMap!=='undefined'?findBestMap:null,
    getMappedState: typeof getMappedState!=='undefined'?getMappedState:null,
    calcUsagePercent: typeof calcUsagePercent!=='undefined'?calcUsagePercent:null,
    isLowStock: typeof isLowStock!=='undefined'?isLowStock:null,
  };
  window.PlasticSchema = _e;
})();

const fs = require('fs');

let schemaJs = fs.readFileSync('plastic/plastic-manager-schema.js', 'utf8');

// Replace MANUFACTURER_MAP_SCHEMA with SUPPLIER_SCHEMA, MANUFACTURER_GRADE_SCHEMA, PRICING_SCHEMA

const startSearch = 'const MANUFACTURER_MAP_SCHEMA = [';
const startIndex = schemaJs.indexOf(startSearch);

const endSearch = 'const RECEIPT_SCHEMA = [';
const endIndex = schemaJs.indexOf(endSearch);

if (startIndex > -1 && endIndex > -1) {
  const newSchemas = `
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

`;

  let part1 = schemaJs.substring(0, startIndex);
  let part2 = schemaJs.substring(endIndex);
  
  // also inject new tables into the exports Object at the end
  let finalJs = part1 + newSchemas + part2;
  
  finalJs = finalJs.replace(
    /MANUFACTURER_MAP_SCHEMA,\s*RECEIPT_SCHEMA/g,
    "SUPPLIER_SCHEMA,\r\n      MANUFACTURER_GRADE_SCHEMA,\r\n      PRICING_SCHEMA,\r\n      RECEIPT_SCHEMA"
  );
  
  // Replace references of manufacturer map with manufacturer grade in plastic_receipt_roll.csv (ROLL_SCHEMA)
  // Currently: commercial_grade_code, supplier_name
  // We can keep them or change them, but user said not to worry about pricing, just UX.
  // We will leave ROLL_SCHEMA as is for now, just auto-fill those fields using GRADES.
  
  fs.writeFileSync('plastic/plastic-manager-schema.js', finalJs, 'utf8');
  console.log('Patched plastic-manager-schema.js');
} else {
  console.log('Could not find indices!');
}

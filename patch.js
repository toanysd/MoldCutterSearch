const fs = require('fs');

function patchFile(filePath, searchRegex, replaceStr) {
  let s = fs.readFileSync(filePath, 'utf8');
  s = s.replace(searchRegex, replaceStr);
  fs.writeFileSync(filePath, s, 'utf8');
  console.log('Patched ' + filePath);
}

// 1. Patch server.js
let serverJs = fs.readFileSync('server.js', 'utf8');
serverJs = serverJs.replace(
  /'plastic_manufacturer_map\.csv',\s+'plastic_receipt\.csv'/g,
  "'plastic_manufacturer_map.csv',\r\n  'plastic_supplier.csv',\r\n  'plastic_manufacturer_grade.csv',\r\n  'plastic_pricing.csv',\r\n  'plastic_receipt.csv'"
);
serverJs = serverJs.replace(
  /plastic_manufacturer_map:\s+'plastic_manufacturer_map\.csv',\s+plastic_receipt:\s+'plastic_receipt\.csv'/g,
  "plastic_manufacturer_map: 'plastic_manufacturer_map.csv',\r\n  plastic_supplier: 'plastic_supplier.csv',\r\n  plastic_manufacturer_grade: 'plastic_manufacturer_grade.csv',\r\n  plastic_pricing: 'plastic_pricing.csv',\r\n  plastic_receipt: 'plastic_receipt.csv'"
);
fs.writeFileSync('server.js', serverJs, 'utf8');
console.log('Patched server.js');

// 2. Patch data-manager.js
let dataManagerJs = fs.readFileSync('data-manager.js', 'utf8');
dataManagerJs = dataManagerJs.replace(
  /\{\s*key:\s*'plastic_manufacturer_map',\s*file:\s*'plastic_manufacturer_map\.csv',\s*required:\s*false\s*\},\s*\{\s*key:\s*'plastic_receipt'/g,
  "{ key: 'plastic_manufacturer_map', file: 'plastic_manufacturer_map.csv', required: false },\r\n        { key: 'plastic_supplier', file: 'plastic_supplier.csv', required: false },\r\n        { key: 'plastic_manufacturer_grade', file: 'plastic_manufacturer_grade.csv', required: false },\r\n        { key: 'plastic_pricing', file: 'plastic_pricing.csv', required: false },\r\n        { key: 'plastic_receipt'"
);
dataManagerJs = dataManagerJs.replace(
  /plastic_manufacturer_map:\s*\[\],\s*plastic_receipt:\s*\[\]/g,
  "plastic_manufacturer_map: [],\r\n            plastic_supplier: [],\r\n            plastic_manufacturer_grade: [],\r\n            plastic_pricing: [],\r\n            plastic_receipt: []"
);
fs.writeFileSync('data-manager.js', dataManagerJs, 'utf8');
console.log('Patched data-manager.js');

// 3. Patch supabase-csv-adapter.js
let adapterJs = fs.readFileSync('plastic/supabase-csv-adapter.js', 'utf8');
adapterJs = adapterJs.replace(
  /if \(tb === 'plastic_manufacturer_map'\) return 'manufacturer_map_id';\s*if \(tb === 'plastic_receipt'\)/g,
  "if (tb === 'plastic_manufacturer_map') return 'manufacturer_map_id';\r\n        if (tb === 'plastic_supplier') return 'supplier_id';\r\n        if (tb === 'plastic_manufacturer_grade') return 'grade_id';\r\n        if (tb === 'plastic_pricing') return 'pricing_id';\r\n        if (tb === 'plastic_receipt')"
);
fs.writeFileSync('plastic/supabase-csv-adapter.js', adapterJs, 'utf8');
console.log('Patched supabase-csv-adapter.js');

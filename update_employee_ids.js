const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'data');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.csv') && f !== 'employees.csv');

// Bảng map ID cũ sang ID mới dựa trên dữ liệu cập nhật
const map = {
  "1": "9",  // トアン
  "2": "5",  // クアン
  "3": "8",  // ハイ
  "4": "10", // ヴィエット
  "5": "19", // フエン
  "6": "21", // ジェン
  "7": "20"  // ハオ
};

// Hàm đọc CSV xử lý được dấy ngoặc kép (quotes)
function parseCSV(text) {
  const result = [];
  let row = [];
  let inQuotes = false;
  let val = '';
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          val += '"';
          i++; // Bỏ qua quote escape
        } else {
          inQuotes = false;
        }
      } else {
        val += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(val);
        val = '';
      } else if (char === '\n' || char === '\r') {
        if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') {
          i++; // Bỏ qua LF
        }
        row.push(val);
        result.push(row);
        row = [];
        val = '';
      } else {
        val += char;
      }
    }
  }
  
  if (row.length > 0 || val !== '') {
    row.push(val);
    result.push(row);
  }
  
  return result;
}

// Hàm ghi CSV
function stringifyCSV(rows) {
  return rows.map(row => {
    return row.map(val => {
      if (val === null || val === undefined) return '';
      val = String(val);
      if (val.includes(',') || val.includes('"') || val.includes('\n') || val.includes('\r')) {
        return '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    }).join(',');
  }).join('\n');
}

let totalUpdated = 0;

files.forEach(f => {
  const filePath = path.join(dir, f);
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) return;
  
  const rows = parseCSV(content);
  if (rows.length === 0) return;
  
  const header = rows[0];
  const targetCols = [];
  
  // Tìm các cột có chứa ID nhân viên
  for (let i = 0; i < header.length; i++) {
    const col = header[i];
    if (['EmployeeID', 'OperatorID', 'UpdatedBy', 'CreatedBy', 'InspectorID', 'ResponsiblePersonID', 'AuthorID', 'AssignedEmployeeID', 'CreatedByEmployeeID'].includes(col)) {
      targetCols.push({ idx: i, name: col });
    }
  }
  
  if (targetCols.length > 0) {
    let fileUpdated = false;
    let fileUpdatesCount = 0;
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length === 1 && row[0].trim() === '') continue; // Bỏ qua dòng trống
      
      for (const col of targetCols) {
        if (row.length > col.idx) {
          const val = row[col.idx];
          if (map[val]) {
            row[col.idx] = map[val];
            fileUpdated = true;
            fileUpdatesCount++;
            totalUpdated++;
          }
        }
      }
    }
    
    if (fileUpdated) {
      const newContent = stringifyCSV(rows);
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`Updated ${fileUpdatesCount} references in ${f}`);
    }
  }
});

console.log(`\nHoàn thành! Tổng số ID đã được cập nhật: ${totalUpdated}`);

const fs = require('fs');
let code = fs.readFileSync('plastic/plastic-receipt-ui.js', 'utf8');

const printCode = `
  function _printLabels(rolls) {
    if(!rolls || rolls.length === 0) return;
    
    // Khổ tem 100mm x 50mm
    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) {
      _showToast('Trình duyệt chặn Pop-up. Vui lòng cho phép để in tem.', 'error');
      return;
    }
    
    const labelsHtml = rolls.map(r => {
      let grade = _gradeData.find(g => g.commercial_grade_code === r.commercial_grade_code);
      let master = _masterData.find(m => m.plastic_id === r.plastic_id);
      
      let ysdCode = master ? master.plastic_code : 'CHƯA MAP';
      let specStr = master ? master.width_mm + 'x' + master.thickness_mm : (r.width_mm + 'x' + r.thickness_mm);
      let payload = encodeURIComponent('YSD|ROLL|' + r.receipt_roll_id);
      let qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=' + payload;
      
      return \`
        <div class="label-page">
          <div class="qr-col">
            <img src="\${qrUrl}" class="qr-img" />
            <div class="qr-id">\${r.receipt_roll_id.slice(-6).toUpperCase()}</div>
          </div>
          <div class="info-col">
            <div class="title-ysd">\${ysdCode}</div>
            <div class="info-line"><strong>Hãng:</strong> \${r.commercial_grade_code}</div>
            <div class="info-line"><strong>Quy cách:</strong> \${specStr}</div>
            <div class="info-line"><strong>NCC:</strong> \${r.supplier_name}</div>
            <div class="info-line" style="margin-top:4px;">
              <span class="len-box">L:\${r.received_length_m}m</span>
              \${r.lot_no ? '<span class="len-box" style="margin-left:4px">Lot:'+r.lot_no+'</span>' : ''}
            </div>
          </div>
        </div>
      \`;
    }).join('');

    const html = \`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>In Tem Cuộn - \${rolls.length} tem</title>
        <style>
          @page { size: 100mm 50mm; margin: 0; }
          body { 
            margin: 0; padding: 0; 
            font-family: Arial, sans-serif; 
            background: #ccc;
          }
          .label-page {
            width: 100mm;
            height: 50mm;
            background: white;
            page-break-after: always;
            box-sizing: border-box;
            padding: 4mm;
            display: flex;
            align-items: center;
            overflow: hidden;
            position: relative;
          }
          @media screen {
            .label-page { margin: 10mm auto; box-shadow: 0 0 5px rgba(0,0,0,0.5); }
          }
          @media print {
            body { background: white; }
            .label-page { margin: 0; box-shadow: none; border: none; }
          }
          .qr-col {
            width: 35mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
          .qr-img {
            width: 30mm;
            height: 30mm;
          }
          .qr-id {
            margin-top: 2mm;
            font-size: 10px;
            font-weight: bold;
            font-family: monospace;
          }
          .info-col {
            flex: 1;
            padding-left: 3mm;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .title-ysd {
            font-size: 18px;
            font-weight: 900;
            margin-bottom: 2mm;
            line-height: 1.1;
            word-break: break-all;
          }
          .info-line {
            font-size: 11px;
            line-height: 1.4;
            color: #000;
          }
          .len-box {
            display: inline-block;
            border: 1px solid #000;
            padding: 1px 4px;
            font-weight: bold;
            font-size: 12px;
            border-radius: 2px;
          }
        </style>
      </head>
      <body>
        \${labelsHtml}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 800);
          }
        </script>
      </body>
      </html>
    \`;

    win.document.open();
    win.document.write(html);
    win.document.close();
  }
`;

if(!code.includes('_printLabels(createdRolls)')) {
  code = code.replace('// Reset after 1 second', printCode + '\n      // Gọi hàm in\n      _printLabels(createdRolls);\n\n      // Reset after 1 second');
  fs.writeFileSync('plastic/plastic-receipt-ui.js', code, 'utf8');
  console.log('Patched print logic to plastic-receipt-ui.js');
} else {
  console.log('Already patched.');
}

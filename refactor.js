const fs = require('fs');
let code = fs.readFileSync('rack-relocation.js', 'utf8');

// 1. Rename LocationMove
code = code.replace(/LocationMove/g, 'RackRelocation');

// 2. Remove tabs in UI
code = code.replace(
  /<div class="locmove-tabs"[\s\S]*?<\/div>\s*<\/div>/,
  ''
);

code = code.replace(
  /<div id="locmove-section-company"[\s\S]*?<\/div>\s*<\/div>/,
  ''
);

code = code.replace(
  /<div id="locmove-section-rack">([\s\S]*?)<\/div>\s*(?=<div class="locmove-field")/,
  '$1'
); // unwrap the div

// 3. Remove event listeners for tabs
code = code.replace(/RackRelocation\.currentTab = 'rack';/g, '');
code = code.replace(/var tabRack = document\.getElementById[\s\S]*?secRack\.style\.display = 'none';\n    \}\);/g, '');
code = code.replace(/\/\/ Quick Return button[\s\S]*?\}\);\n    \}/g, '');

// 4. Remove Company populateData
code = code.replace(/\/\/ Load Companies[\s\S]*?if \(item\.KeeperCompany\) companySelect\.value = item\.KeeperCompany;\n    \}/g, '');

// 5. Remove 'if (RackRelocation.currentTab === 'rack') {' and its matching 'else' for company
code = code.replace(/if \(RackRelocation\.currentTab === 'rack'\) \{/g, '');
// I'll just remove the else block that does the Company Move
let elseIdx = code.indexOf('} else {');
if (elseIdx > -1) {
  let endIdx = code.indexOf('// --- Headless API');
  if (endIdx > -1) {
    code = code.substring(0, elseIdx) + '\n  }\n\n  ' + code.substring(endIdx);
  }
}

fs.writeFileSync('rack-relocation.js', code);
console.log('Processed rack-relocation.js successfully.');

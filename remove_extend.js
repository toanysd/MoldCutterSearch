const fs = require('fs');

const file1 = 'g:/AntiGravity/MoldCutterSearch/detail-panel-v8.6.17.js';
let js = fs.readFileSync(file1, 'utf8');

// 1. Remove extend tab button
js = js.replace(/<button class="detail-tab"[^>]*data-tab="extended"[^>]*>[\s\S]*?<\/button>/, '');

// 2. Remove extend tab content div
js = js.replace(/<div class="detail-tab-content"[^>]*data-tab-content="extended"[^>]*><\/div>/, '');

// 3. Modifying switchTab logic
// look for jumps
js = js.replace(/if \(target === 'storage'\) \{\s*\/\/[^\n]*\n\s*tab = 'extended';\s*\}/, "if (target === 'storage') { tab = 'related'; }");

// Also replace the default 'extended' tab mapping:
js = js.replace(/let tab = 'extended'; \/\/ M?c d?nh m? tab extended/g, "let tab = 'info'; // M?c d?nh m? tab info");

// Also replace scroll specifically for extended groupings
js = js.replace(/\/\/ Scroll specifically for extended groupings[\s\S]*?if \(tab === 'extended'\) \{[\s\S]*?\}, 300\);\n\s*\}/, "");

// 4. In switchTab function, remove case 'extended'
js = js.replace(/case 'extended':\s*\{[\s\S]*?break;\s*\}/, '');

// 5. Remove all renderExtended methods
js = js.replace(/\/\/\s*TAB 9: EXTENDED \(only CSV data\)[\s\S]*?\/\/\s*DATA HELPERS/i, '// DATA HELPERS');

fs.writeFileSync(file1, js, 'utf8');
console.log('JS replaced successfully');

const file2 = 'g:/AntiGravity/MoldCutterSearch/detail-panel-v8.6.27.css';
let css = fs.readFileSync(file2, 'utf8');
// remove anything mentioning extended tab if needed, though they won't match elements anymore.
// We'll leave CSS cleanups for later or just run it. 
fs.writeFileSync(file2, css, 'utf8');
console.log('CSS replaced successfully');

const fs = require('fs');
let code = fs.readFileSync('rack-relocation.js', 'utf8');

const target = `          var notify = window.NotificationModule || window.notify;
          if (notify && notify.show) {
            notify.show('位置変更を保存しました / Location moved successfully', 'success');
          
  }`;

const replacement = `          var notify = window.NotificationModule || window.notify;
          if (notify && notify.show) {
            notify.show('位置変更を保存しました / Location moved successfully', 'success');
          } else {
            alert('位置変更を保存しました / Location moved successfully');
          }
          RackRelocation.close();
          if (global.app && typeof global.app.applyFilters === 'function') {
            global.app.applyFilters();
          } else {
            document.dispatchEvent(new CustomEvent('data-manager:ready'));
          }
        });
  }`;

code = code.replace(target, replacement);
fs.writeFileSync('rack-relocation.js', code);

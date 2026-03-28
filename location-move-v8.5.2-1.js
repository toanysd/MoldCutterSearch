/* location-move-v8.5.2-1.js */
(function(global) {
  'use strict';

  var apiUrl = 'https://ysd-moldcutter-backend.onrender.com/api/locationlog';

  var LocationMove = {
    open: function(item) {
      if (!item) return;
      this.currentItem = item;
      ensureSkeleton();
      populateData(item);
      document.getElementById('locmove-backdrop').classList.remove('hidden');
    },
    close: function() {
      var backdrop = document.getElementById('locmove-backdrop');
      if (backdrop) backdrop.classList.add('hidden');
      this.currentItem = null;
    }
  };

  function ensureSkeleton() {
    if (document.getElementById('locmove-backdrop')) return;

    var html = `
      <div id="locmove-backdrop" class="locmove-backdrop hidden">
        <div class="locmove-modal">
          <div class="locmove-header">
            <div class="locmove-title">位置変更 / Move Location</div>
            <button class="locmove-close" id="locmove-close-btn">&times;</button>
          </div>
          <div class="locmove-body">
            <div class="locmove-info">
              <div class="locmove-info-line" style="font-weight:bold" id="locmove-item-code"></div>
              <div class="locmove-info-line" id="locmove-item-name"></div>
              <div class="locmove-info-line" id="locmove-item-current-loc"></div>
            </div>
            
            <div class="locmove-field">
              <label class="locmove-label">社員 / Employee</label>
              <select class="locmove-select" id="locmove-emp-select">
                <option value="">選択してください / Select...</option>
              </select>
            </div>
            
            <div class="locmove-field">
              <label class="locmove-label">新しい位置 / Target Rack Layer</label>
              <select class="locmove-select" id="locmove-rack-select">
                <option value="">選択してください / Select...</option>
              </select>
            </div>
            
            <div class="locmove-field">
              <label class="locmove-label">メモ / Note</label>
              <input type="text" class="locmove-input" id="locmove-note-input" placeholder="...">
            </div>
          </div>
          <div class="locmove-footer">
            <button class="locmove-btn cancel" id="locmove-cancel-btn">キャンセル / Cancel</button>
            <button class="locmove-btn submit" id="locmove-submit-btn">保存 / Save</button>
          </div>
        </div>
      </div>
    `;

    var div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);

    document.getElementById('locmove-close-btn').addEventListener('click', function() { LocationMove.close(); });
    document.getElementById('locmove-cancel-btn').addEventListener('click', function() { LocationMove.close(); });
    document.getElementById('locmove-submit-btn').addEventListener('click', submitMove);
  }

  function getDm() { return (global.DataManager && global.DataManager.allData) ? global.DataManager : ((global.DataManager && global.DataManager.data) ? global.DataManager : null); }
  function getAllData() {
    var dm = getDm();
    if (!dm) return null;
    return dm.allData || dm.data;
  }

  function populateData(item) {
    var code = item.type === 'mold' ? (item.MoldCode || '') : (item.CutterNo || '');
    var name = item.type === 'mold' ? (item.MoldName || '') : (item.CutterName || item.CutterDesignName || '');
    var loc = item.displayRackLocation || item.location || item.rackNo || '-';

    document.getElementById('locmove-item-code').textContent = 'Code: ' + code;
    document.getElementById('locmove-item-name').textContent = 'Name: ' + name;
    document.getElementById('locmove-item-current-loc').textContent = 'Current Loc: ' + loc;

    // Load employees
    var empSelect = document.getElementById('locmove-emp-select');
    empSelect.innerHTML = '<option value="">選択してください / Select...</option>';
    var allData = getAllData();
    if (allData && allData.employees) {
      allData.employees.forEach(function(e) {
        var opt = document.createElement('option');
        opt.value = e.EmployeeID || e.ID;
        opt.textContent = e.EmployeeName || e.name || e.EmployeeID || e.ID;
        empSelect.appendChild(opt);
      });
    }

    // Load rack layers
    var rackSelect = document.getElementById('locmove-rack-select');
    rackSelect.innerHTML = '<option value="">選択してください / Select...</option>';
    if (allData && allData.racklayers) {
      allData.racklayers.forEach(function(r) {
        var opt = document.createElement('option');
        opt.value = r.RackLayerID;
        // Construct display name
        var label = r.RackLayerID; 
        if (r.RackID && r.LayerNumber) {
          label = r.RackID + '-' + r.LayerNumber;
        } else if (r.Code) {
          label = r.Code;
        }
        opt.textContent = label;
        rackSelect.appendChild(opt);
      });
    }

    document.getElementById('locmove-note-input').value = '';
    document.getElementById('locmove-submit-btn').disabled = false;
  }

  function submitMove() {
    var item = LocationMove.currentItem;
    if (!item) return;

    var empId = document.getElementById('locmove-emp-select').value;
    var layerId = document.getElementById('locmove-rack-select').value;
    var note = document.getElementById('locmove-note-input').value;

    if (!empId) {
      alert('社員を選択してください / Please select an employee');
      return;
    }
    if (!layerId) {
      alert('新しい位置を選択してください / Please select a target location');
      return;
    }

    var submitBtn = document.getElementById('locmove-submit-btn');
    submitBtn.disabled = true;

    // Prepare payload
    var payload = {
      Timestamp: new Date().toISOString(),
      MoldID: item.type === 'mold' ? (item.MoldID || item.MoldCode) : '',
      CutterID: item.type === 'cutter' ? (item.CutterID || item.CutterNo) : '',
      EmployeeID: empId,
      RackLayerID: layerId,
      Notes: note
    };

    // 1. Send to server
    fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function(res) {
      return res.ok ? res.json() : Promise.reject('HTTP ' + res.status);
    })
    .catch(function(err) {
      console.warn('LocationMove API error, continuing locally', err);
    })
    .finally(function() {
      // 2. Update local data
      var allData = getAllData();
      if (allData && allData.locationlog) {
        // give it a temp ID
        payload.LocationLogID = 'TEMP_' + Date.now();
        payload._pending = true;
        allData.locationlog.unshift(payload);
      }
      
      // Attempt to update the item's location directly for immediate UI update
      item.RackLayerID = layerId;
      var notify = window.NotificationModule || window.notify;
      if (notify && notify.show) {
        notify.show('位置変更を保存しました / Location moved successfully', 'success');
      } else {
        alert('位置変更を保存しました / Location moved successfully');
      }

      LocationMove.close();

      // Trigger re-render by app
      if (global.app && typeof global.app.applyFilters === 'function') {
         global.app.applyFilters();
      } else {
         document.dispatchEvent(new CustomEvent('data-manager:ready'));
      }
    });
  }

  global.LocationMove = LocationMove;

})(window);

// v9.0.2
/* location-move-v8.5.2-1.js */
(function (global) {
  'use strict';

  var apiUrl = 'https://ysd-moldcutter-backend.onrender.com/api/locationlog';

  var LocationMove = {
    open: function (item) {
      if (!item) return;
      this.currentItem = item;
      ensureSkeleton();
      populateData(item);
      document.getElementById('locmove-backdrop').classList.remove('hidden');
    },
    close: function () {
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
          <div class="locmove-tabs" style="display:flex; border-bottom:1px solid #e2e8f0; margin-bottom:12px;">
            <div class="locmove-tab active" id="locmove-tab-rack" style="flex:1; padding:8px; text-align:center; cursor:pointer; font-weight:600; font-size:13px; color:#0369a1; border-bottom:2px solid #0284c7;">保管棚変更 / Đổi Giá</div>
            <div class="locmove-tab" id="locmove-tab-company" style="flex:1; padding:8px; text-align:center; cursor:pointer; font-weight:600; font-size:13px; color:#64748b; border-bottom:2px solid transparent;">会社間移動 / Đổi Công ty</div>
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
            
            <div id="locmove-section-rack">
                <div class="locmove-field">
                  <label class="locmove-label">新しい位置 / Target Rack Layer</label>
                  <select class="locmove-select" id="locmove-rack-select">
                    <option value="">選択してください / Select...</option>
                  </select>
                </div>
            </div>
            
            <div id="locmove-section-company" style="display:none;">
                <div class="locmove-field">
                  <div id="locmove-quick-return" style="margin-bottom:10px;">
                    <button type="button" id="locmove-return-btn" style="width:100%; padding:12px; background:linear-gradient(135deg,#f97316,#ea580c); color:#fff; border:none; border-radius:8px; font-weight:bold; font-size:15px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 2px 8px rgba(234,88,12,0.3);">
                      <i class="fas fa-undo-alt"></i> 金型返却 (Trả khuôn)
                    </button>
                  </div>
                  <label class="locmove-label">新しい会社 / Target Company</label>
                  <select class="locmove-select" id="locmove-company-select">
                    <option value="">選択してください / Select...</option>
                  </select>
                </div>
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

    LocationMove.currentTab = 'rack';

    var tabRack = document.getElementById('locmove-tab-rack');
    var tabCompany = document.getElementById('locmove-tab-company');
    var secRack = document.getElementById('locmove-section-rack');
    var secCompany = document.getElementById('locmove-section-company');

    tabRack.addEventListener('click', function () {
      LocationMove.currentTab = 'rack';
      tabRack.style.color = '#0369a1'; tabRack.style.borderBottomColor = '#0284c7';
      tabCompany.style.color = '#64748b'; tabCompany.style.borderBottomColor = 'transparent';
      secRack.style.display = 'block';
      secCompany.style.display = 'none';
    });
    tabCompany.addEventListener('click', function () {
      LocationMove.currentTab = 'company';
      tabCompany.style.color = '#0369a1'; tabCompany.style.borderBottomColor = '#0284c7';
      tabRack.style.color = '#64748b'; tabRack.style.borderBottomColor = 'transparent';
      secCompany.style.display = 'block';
      secRack.style.display = 'none';
    });

    document.getElementById('locmove-close-btn').addEventListener('click', function () { LocationMove.close(); });
    document.getElementById('locmove-cancel-btn').addEventListener('click', function () { LocationMove.close(); });
    document.getElementById('locmove-submit-btn').addEventListener('click', submitMove);

    // Quick Return button: auto-select CompanyID=6 (金型返却) and switch to company tab
    var returnBtn = document.getElementById('locmove-return-btn');
    if (returnBtn) {
      returnBtn.addEventListener('click', function () {
        // Switch to company tab
        tabCompany.click();
        // Auto-select company 6
        setTimeout(function () {
          var cs = document.getElementById('locmove-company-select');
          if (cs) {
            cs.value = '6'; // CompanyID 6 = 金型返却
            cs.style.border = '2px solid #f97316';
            cs.style.background = '#fff7ed';
          }
          // Focus on submit button
          var sb = document.getElementById('locmove-submit-btn');
          if (sb) {
            sb.style.background = 'linear-gradient(135deg,#f97316,#ea580c)';
            sb.textContent = '金型返却を実行 / Trả khuôn';
            sb.focus();
          }
        }, 50);
      });
    }
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
      allData.employees.forEach(function (e) {
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
      allData.racklayers.forEach(function (r) {
        var opt = document.createElement('option');
        opt.value = r.RackLayerID;
        // Construct display name
        var label = r.RackLayerID;
        if (r.RackID && r.RackLayerNumber) {
          label = r.RackID + '-' + r.RackLayerNumber;
        } else if (r.Code) {
          label = r.Code;
        }
        opt.textContent = label;
        rackSelect.appendChild(opt);
      });
    }

    // Load Companies
    var companySelect = document.getElementById('locmove-company-select');
    companySelect.innerHTML = '<option value="">選択してください / Select...</option>';
    if (allData && allData.companies) {
      allData.companies.forEach(function (c) {
        var opt = document.createElement('option');
        opt.value = c.CompanyID;
        opt.textContent = c.CompanyShortName || c.CompanyName || c.CompanyID;
        companySelect.appendChild(opt);
      });
      if (item.KeeperCompany) companySelect.value = item.KeeperCompany;
    }

    document.getElementById('locmove-note-input').value = '';
    document.getElementById('locmove-submit-btn').disabled = false;
  }

  function submitMove() {
    var item = LocationMove.currentItem;
    if (!item) return;

    var empId = document.getElementById('locmove-emp-select').value;
    var note = document.getElementById('locmove-note-input').value;

    if (!empId) {
      alert('社員を選択してください / Please select an employee');
      return;
    }

    var submitBtn = document.getElementById('locmove-submit-btn');
    submitBtn.disabled = true;

    if (LocationMove.currentTab === 'rack') {
      var layerId = document.getElementById('locmove-rack-select').value;
      if (!layerId) {
        alert('新しい位置を選択してください / Please select a target location');
        submitBtn.disabled = false;
        return;
      }

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
        .then(function (res) {
          return res.ok ? res.json() : Promise.reject('HTTP ' + res.status);
        })
        .catch(function (err) {
          console.warn('LocationMove API error, continuing locally', err);
        })
        .finally(function () {
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

          // ★ Persist RackLayerID change into molds.csv (or cutters.csv)
          var csvFile = (item.type === 'mold') ? 'molds.csv' : 'cutters.csv';
          var idField = (item.type === 'mold') ? 'MoldID' : 'CutterID';
          var idValue = (item.type === 'mold') ? (item.MoldID || item.MoldCode) : (item.CutterID || item.CutterNo);
          var upsertPayload = {
            filename: csvFile,
            idField: idField,
            idValue: idValue,
            mode: 'upsert',
            updates: { RackLayerID: layerId }
          };
          fetch('https://ysd-moldcutter-backend.onrender.com/api/csv/upsert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(upsertPayload)
          }).catch(function (e) { console.warn('Upsert RackLayerID failed', e); });

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
    } else {
      // Company Move
      var companyId = document.getElementById('locmove-company-select').value;
      if (!companyId) {
        alert('新しい会社を選択してください / Please select a target company');
        submitBtn.disabled = false;
        return;
      }

      // Format for DataChangeHistory Upsert
      var tKey = item.type === 'mold' ? 'molds' : 'cutters';
      var tIdF = item.type === 'mold' ? 'MoldID' : 'CutterID';
      var tIdV = item.type === 'mold' ? item.MoldID : item.CutterID;
      var reqPayload = {
        filename: tKey === 'molds' ? 'molds.csv' : 'cutters.csv',
        idField: tIdF,
        idValue: tIdV,
        mode: 'upsert',
        updates: {
          KeeperCompany: companyId
        }
      };

      var historyReq = {
        filename: 'datachangehistory.csv',
        idField: 'DataChangeID',
        idValue: 'DCH_' + Date.now(),
        mode: 'insert',
        updates: {
          TableName: tKey,
          RecordID: tIdV,
          RecordIDField: tIdF,
          FieldName: 'KeeperCompany',
          OldValue: item.KeeperCompany || '',
          NewValue: companyId,
          ChangedAt: new Date().toISOString(),
          ChangedBy: empId,
          ChangeSource: 'LocationMoveUI'
        }
      };

      // Dual post to backend
      Promise.all([
        fetch('https://ysd-moldcutter-backend.onrender.com/api/csv/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqPayload)
        }),
        fetch('https://ysd-moldcutter-backend.onrender.com/api/csv/upsert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(historyReq)
        })
      ]).then(function () {
        item.KeeperCompany = companyId;
        var notify = window.NotificationModule || window.notify;
        if (notify && notify.show) {
          notify.show('会社変更を保存しました / Company moved successfully', 'success');
        } else {
          alert('会社変更を保存しました / Company moved successfully');
        }
        LocationMove.close();
        if (global.app && typeof global.app.applyFilters === 'function') {
          global.app.applyFilters();
        } else {
          document.dispatchEvent(new CustomEvent('data-manager:ready'));
        }
      }).catch(function (err) {
        console.error('Company Move Failed', err);
        alert('Lỗi khi lưu! Failed to save.');
        submitBtn.disabled = false;
      });
    }
  }

  global.LocationMove = LocationMove;

})(window);

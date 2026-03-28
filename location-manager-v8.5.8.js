/* =========================================================
   LOCATION MANAGER v8.5.8
   Quản lý Vị Trí / Giá Kệ (Racks & RackLayers)
========================================================= */

(function(global) {
  'use strict';

  // Helper cho API URL giống như quick-update
  function resolveApiUrl(path) {
    var p = String(path || '').trim();
    if (!p) return '';
    if (/^https?:\/\//i.test(p)) return p;
    var normalized = p.charAt(0) === '/' ? p : ('/' + p);
    var base = global && global.MCS_API_BASE_URL;
    if (base && String(base).trim() && String(base).trim() !== 'undefined' && String(base).trim() !== 'null') {
      return String(base).replace(/\/+$/, '') + normalized;
    }
    return 'https://ysd-moldcutter-backend.onrender.com' + normalized;
  }

  var API_UPSERT = resolveApiUrl('/api/csv/upsert');

  var LocationManager = {
    isOpen: false,
    selectedRackId: null,

    // Dữ liệu nội bộ
    racks: [],
    layers: [],
    searchQuery: '',

    open: function() {
      this.initDOM();
      this.refreshData();
      
      var overlay = document.getElementById('locm-overlay');
      if (overlay) overlay.classList.add('locm-show');
      this.isOpen = true;
      this.renderSidebar();
      this.selectRack(null); // Show empty state
    },

    close: function() {
      var overlay = document.getElementById('locm-overlay');
      if (overlay) overlay.classList.remove('locm-show');
      this.isOpen = false;
    },

    initDOM: function() {
      if (document.getElementById('locm-overlay')) return;
      
      var html = `
        <div id="locm-overlay">
          <div id="locm-dialog">
            <div class="locm-header">
              <div class="locm-header-title">
                <div class="locm-header-icon"><i class="fas fa-map-marked-alt"></i></div>
                <div class="locm-header-text">
                  <span class="locm-ht-ja">位置管理 (ラック)</span>
                  <span class="locm-ht-vi">Quản lý Vị Trí (Giá - Kệ)</span>
                </div>
              </div>
              <button class="locm-close-btn" id="locm-close-btn"><i class="fas fa-times"></i></button>
            </div>
            <div class="locm-body">
              <div class="locm-sidebar">
                <div class="locm-sidebar-header">
                  <input type="text" class="locm-search-input" id="locm-search-input" placeholder="検索 / Nhập tên giá...">
                  <button class="locm-add-btn" id="locm-add-rack-btn" title="Thêm Giá mới"><i class="fas fa-plus"></i></button>
                </div>
                <div class="locm-list" id="locm-rack-list"></div>
              </div>
              <div class="locm-main" id="locm-main-content">
                 <!-- Nội dung form -->
              </div>
            </div>
          </div>
        </div>
      `;
      var div = document.createElement('div');
      div.innerHTML = html.trim();
      document.body.appendChild(div.firstElementChild);

      document.getElementById('locm-close-btn').addEventListener('click', this.close.bind(this));
      
      var searchInput = document.getElementById('locm-search-input');
      searchInput.addEventListener('input', function(e) {
        LocationManager.searchQuery = e.target.value.toLowerCase();
        LocationManager.renderSidebar();
      });

      document.getElementById('locm-add-rack-btn').addEventListener('click', function() {
        LocationManager.openRackForm(null);
      });
    },

    refreshData: function() {
      var dmData = (global.DataManager && global.DataManager.data) ? global.DataManager.data : null;
      var rawRacks = dmData && dmData.racks ? dmData.racks : [];
      var rawLayers = dmData && dmData.racklayers ? dmData.racklayers : [];
      
      this.racks = rawRacks.slice().sort(function(a, b) {
        var aid = String(a.RackID || a.RackName || '').toLowerCase();
        var bid = String(b.RackID || b.RackName || '').toLowerCase();
        return aid.localeCompare(bid, undefined, {numeric: true});
      });

      this.layers = rawLayers.slice().sort(function(a, b) {
        return String(a.RackLayerNumber || '').localeCompare(String(b.RackLayerNumber || ''), undefined, {numeric: true});
      });
    },

    renderSidebar: function() {
      var listEl = document.getElementById('locm-rack-list');
      if (!listEl) return;
      
      var filtered = this.racks;
      if (this.searchQuery) {
        var q = this.searchQuery;
        filtered = this.racks.filter(function(r) {
          var text = String((r.RackID||'') + ' ' + (r.RackName||'') + ' ' + (r.RackLocation||'') + ' ' + (r.RackNotes||'')).toLowerCase();
          return text.indexOf(q) !== -1;
        });
      }

      var html = '';
      if (filtered.length === 0) {
        html = '<div style="padding:20px; text-align:center; color:#94a3b8; font-size:13px;">データがありません<br>Không tìm thấy Rack</div>';
      } else {
        html = filtered.map(function(r) {
          var id = String(r.RackID || '');
          var active = (id === LocationManager.selectedRackId) ? 'active' : '';
          var title = String(r.RackID || 'No ID');
          var sub = String(r.RackLocation || r.RackName || '---');
          
          return '<div class="locm-item '+active+'" data-id="'+id+'">' +
            '<div class="locm-item-icon locm-sidebar-thumb" data-rackid="'+id+'"><i class="fas fa-layer-group"></i></div>' +
            '<div class="locm-item-info">' +
              '<div class="locm-item-name">'+title+'</div>' +
              '<div class="locm-item-sub">'+sub+'</div>' +
            '</div>' +
          '</div>';
        }).join('');
      }
      listEl.innerHTML = html;

      var items = listEl.querySelectorAll('.locm-item');
      for(var i=0; i<items.length; i++) {
        items[i].addEventListener('click', function() {
           var rid = this.getAttribute('data-id');
           LocationManager.selectRack(rid);
        });
      }

      // Load thumbnails for sidebar
      setTimeout(function() {
        var store = window.DevicePhotoStore;
        if (store && typeof store.getThumbnailUrl === 'function') {
          var thumbs = listEl.querySelectorAll('.locm-sidebar-thumb');
          thumbs.forEach(async function(el) {
            var rid = el.getAttribute('data-rackid');
            if (rid && el.innerHTML.indexOf('img') === -1) {
              try {
                var tImg = await store.getThumbnailUrl('rack', rid);
                if (tImg) el.innerHTML = '<img src="' + escapeHtml(tImg) + '">';
              } catch(e) {}
            }
          });
        }
      }, 100);
    },

    selectRack: function(rackId) {
      this.selectedRackId = rackId;
      this.renderSidebar(); // refresh active state
      if (!rackId) {
        this.renderEmptyState();
      } else {
        var rack = this.racks.find(function(r) { return r.RackID === rackId; });
        if (rack) {
          this.openRackForm(rack);
        } else {
          this.renderEmptyState();
        }
      }
    },

    renderEmptyState: function() {
      var mainEl = document.getElementById('locm-main-content');
      if (!mainEl) return;
      mainEl.innerHTML = `
        <div class="locm-empty-state">
          <i class="fas fa-map"></i>
          <div>左のリストからラックを選択するか、+ボタンで新規追加してください。<br><small style="margin-top:4px;display:block">Chọn một Giá từ danh sách, hoặc bấm + để thêm mới.</small></div>
        </div>
      `;
    },

    openRackForm: function(rackData) {
      var mainEl = document.getElementById('locm-main-content');
      if (!mainEl) return;
      
      var isNew = !rackData;
      var rackId = isNew ? '' : (rackData.RackID || '');
      this.selectedRackId = rackId;
      if (isNew) this.renderSidebar(); // Clear active selection
      
      var rNum = isNew ? '' : (rackData.RackNumber || '');
      var rLoc = isNew ? '' : (rackData.RackLocation || '');
      var rName = isNew ? '' : (rackData.RackName || '');
      var rNote = isNew ? '' : (rackData.RackNotes || '');

      var rackLayers = [];
      if (!isNew && rackId) {
         rackLayers = this.layers.filter(function(l) { return l.RackID === rackId; });
      }

      var layersHtml = rackLayers.map(function(l) {
         var lid = String(l.RackLayerID || '');
         var lnum = String(l.RackLayerNumber || '');
         var lnote = String(l.RackLayerNotes || '');
         // Ảnh sẽ lấy thumbnail từ danh sách _devices của PhotoStore sau này, tạm thời làm skeleton
         var thumbHtml = '<i class="fas fa-image"></i>';

         return `
           <div class="locm-layer-card">
              <div class="locm-layer-thumb" onclick="LocationManager.openPhotoUpload('`+lid+`', '`+lnum+`')" title="Ảnh tầng">
                 ${thumbHtml}
              </div>
              <div class="locm-layer-info">
                 <div class="locm-layer-head">
                    <div class="locm-layer-name">Tầng ${escapeHtml(lnum)} / 層 ${escapeHtml(lnum)}</div>
                    <button class="locm-btn locm-btn-ghost" onclick="LocationManager.editLayer('`+escapeHtml(lid)+`')"><i class="fas fa-edit"></i> Edit</button>
                 </div>
                 <div class="locm-layer-desc">${escapeHtml(lnote)}<br><small style="color:#cbd5e1">${escapeHtml(lid)}</small></div>
              </div>
           </div>
         `;
      }).join('');

      var actionBtnsHtml = '';
      if (!isNew) {
        actionBtnsHtml += `<button class="locm-btn locm-btn-photo" type="button" onclick="LocationManager.openPhotoUpload('`+escapeHtml(rackId)+`', '`+escapeHtml(rackId)+`')"><i class="fas fa-camera"></i> 写真 / Ảnh</button>`;
      }
      actionBtnsHtml += `<button class="locm-btn locm-btn-primary" type="button" id="locm-save-rack-btn"><i class="fas fa-save"></i> 保存 / Lưu</button>`;

      var layerSectionHtml = '';
      if (!isNew) {
        layerSectionHtml = `
          <div class="locm-section">
            <div class="locm-section-header">
              <div class="locm-section-title"><i class="fas fa-stream"></i> 各層 / Các tầng (Rack Layers)</div>
              <button class="locm-btn locm-btn-outline" type="button" onclick="LocationManager.editLayer('')"><i class="fas fa-plus"></i> 追加 / Thêm tầng</button>
            </div>
            <div class="locm-layers-container">
               ${rackLayers.length > 0 ? layersHtml : '<div style="color:#94a3b8; font-size:13px; text-align:center; padding: 10px;">Chưa có tầng nào (層はありません)</div>'}
            </div>
          </div>
        `;
      }

      mainEl.innerHTML = `
        <div class="locm-section">
          <div class="locm-section-header">
             <div class="locm-section-title"><i class="fas fa-box"></i> ${isNew ? 'Rack 追加 / Thêm Giá mới' : 'Rack 詳細 / Thông tin Giá'}</div>
             <div class="locm-section-actions">
                ${actionBtnsHtml}
             </div>
          </div>
          
          <div class="locm-form-layout">
             <div class="locm-form-thumb-col">
                <div class="locm-main-rack-thumb" id="locm-main-rack-thumb" onclick="LocationManager.openPhotoUpload('${escapeHtml(rackId)}', '${escapeHtml(rackId)}')">
                   <i class="fas fa-image"></i>
                   <div class="locm-thumb-overlay">Click to change</div>
                </div>
             </div>
             <div class="locm-form-grid-col">
                 <div class="locm-form-grid">
                    <div class="locm-form-group">
                        <label class="locm-label">ラック識別コード / Mã Rack định danh *</label>
                        <input type="text" class="locm-input" id="locm-frm-rackid" value="${escapeHtml(rackId)}" ${isNew ? '' : 'disabled'}>
                    </div>
                    <div class="locm-form-group">
                        <label class="locm-label">設置場所 / Vị trí / Khu vực</label>
                        <input type="text" class="locm-input" id="locm-frm-location" value="${escapeHtml(rLoc)}">
                    </div>
                    <div class="locm-form-group">
                        <label class="locm-label">名称 / Tên gọi</label>
                        <input type="text" class="locm-input" id="locm-frm-name" value="${escapeHtml(rName)}">
                    </div>
                    <div class="locm-form-group">
                        <label class="locm-label">番号 / Số thứ tự</label>
                        <input type="text" class="locm-input" id="locm-frm-number" value="${escapeHtml(rNum)}">
                    </div>
                    <div class="locm-form-group full">
                        <label class="locm-label">備考 / Ghi chú</label>
                        <textarea class="locm-textarea" id="locm-frm-note">${escapeHtml(rNote)}</textarea>
                    </div>
                 </div>
             </div>
          </div>
        </div>
        ${layerSectionHtml}
      `;

      // Assign save event
      var saveBtn = document.getElementById('locm-save-rack-btn');
      if (saveBtn) {
        saveBtn.addEventListener('click', function() {
           var rIdInput = document.getElementById('locm-frm-rackid').value.trim();
           var params = {
              RackID: rIdInput || ('RACK_' + Date.now()),
              RackLocation: document.getElementById('locm-frm-location').value.trim(),
              RackName: document.getElementById('locm-frm-name').value.trim(),
              RackNumber: document.getElementById('locm-frm-number').value.trim(),
              RackNotes: document.getElementById('locm-frm-note').value.trim()
           };
           LocationManager.saveRack(params, isNew);
        });
      }
      
      // Load thumb images
      setTimeout(async function() {
        var store = window.DevicePhotoStore;
        if (store && typeof store.getThumbnailUrl === 'function') {
          // Load main Rack thumb
          if (!isNew && rackId) {
             var rThumbDiv = document.getElementById('locm-main-rack-thumb');
             if (rThumbDiv) {
                try {
                   var rImg = await store.getThumbnailUrl('rack', rackId);
                   if (rImg) rThumbDiv.innerHTML = '<img src="' + escapeHtml(rImg) + '">';
                } catch(e) {}
             }
          }

          // Load layers thumb
          if (!isNew && rackLayers.length > 0) {
            rackLayers.forEach(async function(l) {
              try {
                 var tImg = await store.getThumbnailUrl('rack', l.RackLayerID);
                 if (tImg) {
                    var cards = mainEl.querySelectorAll('.locm-layer-card');
                    for (var i=0; i<cards.length; i++) {
                       var thm = cards[i].querySelector('.locm-layer-thumb');
                       if (thm && thm.getAttribute('onclick').indexOf(l.RackLayerID) > -1) {
                          thm.innerHTML = '<img src="' + escapeHtml(tImg) + '">';
                       }
                    }
                 }
              } catch(e) {}
            });
          }
        }
      }, 300);
    },

    openPhotoUpload: function(rackOrLayerId, displayCode) {
      if (window.PhotoUpload && window.PhotoUpload.open) {
         window.PhotoUpload.open({
            mode: 'device',
            deviceType: 'rack',
            deviceId: rackOrLayerId,
            deviceCode: displayCode || rackOrLayerId
         });
      } else {
         this.notify('PhotoUpload module chưa sẵn sàng', 'error');
      }
    },

    saveRack: async function(params, isNew) {
      if (!params.RackID) {
         this.notify('Vui lòng nhập Rack ID', 'error');
         return;
      }
      if (isNew) {
         var exists = this.racks.find(function(r) { return r.RackID === params.RackID; });
         if (exists) {
            this.notify('Rack ID này đã tồn tại, vui lòng chọn mã khác.', 'error');
            return;
         }
      }

      this.notify('Đang lưu thông tin Rack...', 'info');

      try {
          var resWeb = await fetch(API_UPSERT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  filename: 'webracks.csv',
                  idField: 'RackID',
                  idValue: params.RackID,
                  updates: params,
                  mode: 'upsert'
              })
          });
          if (!resWeb.ok) {
              throw new Error('Lỗi cập nhật webracks.csv: ' + resWeb.status);
          }

          // Cập nhật datachangehistory cho mỗi field được sửa (Mô phỏng theo quick_update)
          var changedAt = new Date().toISOString();
          var historyRow = {
              DataChangeID: 'DCH' + Date.now() + Math.random().toString(36).substr(2, 5),
              TableName: 'racks',
              RecordID: params.RackID,
              RecordIDField: 'RackID',
              FieldName: 'ALL',
              OldValue: '',
              NewValue: 'UPSERT_RACK',
              ChangedAt: changedAt,
              ChangedBy: (window.app && window.app._lastSelectedUserId) ? window.app._lastSelectedUserId : 'SYSTEM',
              ChangeSource: 'location_manager_v8.5.8',
              ChangeNote: 'Manager Upsert Rack',
              IsConflict: 'FALSE'
          };
          var resHistory = await fetch(API_UPSERT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  filename: 'datachangehistory.csv',
                  idField: 'DataChangeID',
                  idValue: historyRow.DataChangeID,
                  updates: historyRow,
                  mode: 'insert'
              })
          });

          this.notify('Đã lưu Rack thành công', 'success');

          // Trigger tải lại DataManager
          if (global.DataManager && typeof global.DataManager.loadAllData === 'function') {
              await global.DataManager.loadAllData();
              this.refreshData();
              this.selectRack(params.RackID);
          }

      } catch (err) {
          console.error(err);
          this.notify('Lỗi: ' + err.message, 'error');
      }
    },

    editLayer: function(layerId) {
       // Tạo dialog popup nhỏ trên Rack Form để điền Info Layer
       var rackId = this.selectedRackId;
       if (!rackId) {
          this.notify('Vui lòng chọn hoặc lưu Rack trước', 'error');
          return;
       }

       var lObj = null;
       if (layerId) lObj = this.layers.find(function(l) { return l.RackLayerID === layerId; });
       var isNew = !lObj;

       var lNum = lObj ? (lObj.RackLayerNumber || '') : '';
       var lNote = lObj ? (lObj.RackLayerNotes || '') : '';

       var newLayerId = isNew ? (rackId + '-') : layerId;

       var promptHtml = `
         <div style="font-size: 14px; font-weight: 700; margin-bottom: 12px; color: #1e293b;">
            ${isNew ? '層を追加 / Thêm tầng cho Giá ' + escapeHtml(rackId) : '層を編集 / Chỉnh sửa Tầng'}
         </div>
         <div class="locm-form-group" style="margin-bottom: 12px">
            <label class="locm-label">層コード / Mã Tầng (VD: 2A-1)</label>
            <input type="text" class="locm-input" id="locm-frm-l-id" value="${escapeHtml(newLayerId)}" ${isNew ? '' : 'disabled'}>
         </div>
         <div class="locm-form-group" style="margin-bottom: 12px">
            <label class="locm-label">層番号 / Số Tầng</label>
            <input type="text" class="locm-input" id="locm-frm-l-num" value="${escapeHtml(lNum)}">
         </div>
         <div class="locm-form-group">
            <label class="locm-label">備考 / Ghi chú</label>
            <input type="text" class="locm-input" id="locm-frm-l-note" value="${escapeHtml(lNote)}">
         </div>
         <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:20px;">
             <button class="locm-btn locm-btn-outline" onclick="document.body.removeChild(this.parentNode.parentNode.parentNode)">キャンセル / Hủy</button>
             <button class="locm-btn locm-btn-primary" id="locm-btn-l-save">保存 / Lưu lại</button>
         </div>
       `;

       var modal = document.createElement('div');
       modal.style.position = 'fixed';
       modal.style.inset = '0';
       modal.style.zIndex = '200100';
       modal.style.background = 'rgba(0,0,0,0.5)';
       modal.style.display = 'flex';
       modal.style.alignItems = 'center';
       modal.style.justifyContent = 'center';
       
       var card = document.createElement('div');
       card.style.background = 'white';
       card.style.padding = '24px';
       card.style.borderRadius = '16px';
       card.style.width = '400px';
       card.style.boxShadow = '0 10px 25px rgba(0,0,0,0.2)';
       card.innerHTML = promptHtml;
       
       modal.appendChild(card);
       document.body.appendChild(modal);

       document.getElementById('locm-btn-l-save').onclick = function() {
          var idIn = document.getElementById('locm-frm-l-id').value.trim();
          var numIn = document.getElementById('locm-frm-l-num').value.trim();
          var noteIn = document.getElementById('locm-frm-l-note').value.trim();
          
          if (!idIn) { LocationManager.notify('Cần nhập Mã Tầng', 'error'); return; }

          document.body.removeChild(modal);
          LocationManager.saveLayer({
              RackLayerID: idIn,
              RackID: rackId,
              RackLayerNumber: numIn,
              RackLayerNotes: noteIn,
              RackCompanyNote: ''
          }, isNew);
       };
    },

    saveLayer: async function(params, isNew) {
      this.notify('Đang lưu thông tin Tầng...', 'info');

      try {
          var resWeb = await fetch(API_UPSERT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  filename: 'webracklayers.csv',
                  idField: 'RackLayerID',
                  idValue: params.RackLayerID,
                  updates: params,
                  mode: 'upsert'
              })
          });
          if (!resWeb.ok) { throw new Error('Lỗi cập nhật webracklayers.csv: ' + resWeb.status); }

          var historyRow = {
              DataChangeID: 'DCH' + Date.now() + Math.random().toString(36).substr(2, 5),
              TableName: 'racklayers',
              RecordID: params.RackLayerID,
              RecordIDField: 'RackLayerID',
              FieldName: 'ALL',
              OldValue: '',
              NewValue: 'UPSERT_LAYER',
              ChangedAt: new Date().toISOString(),
              ChangedBy: (window.app && window.app._lastSelectedUserId) ? window.app._lastSelectedUserId : 'SYSTEM',
              ChangeSource: 'location_manager_v8.5.8',
              ChangeNote: 'Manager Upsert Layer',
              IsConflict: 'FALSE'
          };
          var resHistory = await fetch(API_UPSERT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  filename: 'datachangehistory.csv',
                  idField: 'DataChangeID',
                  idValue: historyRow.DataChangeID,
                  updates: historyRow,
                  mode: 'insert'
              })
          });

          this.notify('Đã lưu Tầng thành công', 'success');

          if (global.DataManager && typeof global.DataManager.loadAllData === 'function') {
              await global.DataManager.loadAllData();
              this.refreshData();
              this.selectRack(this.selectedRackId);
          }
      } catch (err) {
          console.error(err);
          this.notify('Lỗi: ' + err.message, 'error');
      }
    },

    notify: function(msg, type) {
        if (global.NotificationModule) global.NotificationModule.show(msg, type); 
        else alert(msg);
    }
  };

  // Utility to escape HTML and prevent injection
  function escapeHtml(str) {
      if (!str) return '';
      return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
  }

  global.LocationManager = LocationManager;

})(window);

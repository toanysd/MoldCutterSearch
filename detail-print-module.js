// v9.0.2
/* ============================================================================
   DETAIL PRINT MODULE v8.6.0
   Features:
   - Handle Print / Excel Export for a Single Item (Spec Sheet view)
   - Layout is based on a Japanese manufacturing spec sheet
============================================================================ */

class DetailPrintModule {
  constructor() {
    this.currentItem = null;
    this.currentItemType = null;
    console.log('✅ DetailPrintModule v8.6.0 initialized');
  }

  /**
   * Mở modal lựa chọn In hoặc Xuất Excel
   */
  openModal(item, itemType) {
    if (!item) return;
    this.currentItem = item;
    this.currentItemType = itemType || item.type || (item.MoldID ? 'mold' : 'cutter');
    this.renderDialog();
  }

  renderDialog() {
    this.closeDialog();

    const overlay = document.createElement('div');
    overlay.className = 'dpm-modal-backdrop';
    overlay.id = 'detailPrintModal';

    const id = this.currentItemType === 'mold' ? this.currentItem.MoldID : this.currentItem.CutterID;
    const name = this.currentItemType === 'mold' ? this.currentItem.MoldName || '' : this.currentItem.CutterName || '';

    const html = `
      <div class="dpm-modal">
        <div class="dpm-header">
          <span class="dpm-title"><i class="fas fa-print"></i> 印刷 / Excel 出力</span>
          <button class="dpm-close" id="dpmCloseBtn"><i class="fas fa-times"></i> 閉じる</button>
        </div>
        <div class="dpm-body">
          <div class="dpm-item-info">
            <b>対象:</b> ${id} <br/>
            <b>名称:</b> ${name}
          </div>
          <div class="dpm-actions">
            <button class="dpm-btn dpm-btn-print" id="dpmPrintBtn">
              <i class="fas fa-print"></i> 仕様書を印刷
            </button>
            <button class="dpm-btn dpm-btn-excel" id="dpmExportBtn">
              <i class="fas fa-file-excel"></i> 仕様書をExcel出力
            </button>
          </div>
        </div>
      </div>
    `;
    
    overlay.innerHTML = html;
    document.body.appendChild(overlay);

    document.getElementById('dpmCloseBtn').addEventListener('click', () => this.closeDialog());
    document.getElementById('dpmPrintBtn').addEventListener('click', () => {
      this.closeDialog();
      this.executePrint();
    });
    document.getElementById('dpmExportBtn').addEventListener('click', () => {
      this.closeDialog();
      this.executeExportExcel();
    });
  }

  closeDialog() {
    const modal = document.getElementById('detailPrintModal');
    if (modal) modal.remove();
  }

  // --- DATA HELPERS ---

  getData() {
    const data = window.DataManager && window.DataManager.data ? window.DataManager.data : {};
    return data;
  }

  t(val) {
    if (val === null || val === undefined) return '';
    return String(val).trim();
  }

  getDateString() {
    const d = new Date();
    return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  }

  getDimensions(item) {
    if (this.currentItemType === 'mold') {
       const l = this.t(item.MoldLengthModified || item.MoldLength || '');
       const w = this.t(item.MoldWidthModified || item.MoldWidth || '');
       const h = this.t(item.MoldHeightModified || item.MoldHeight || '');
       if(l && w && h) return `${l} x ${w} x ${h}`;
       if(l && w) return `${l} x ${w}`;
       return '-';
    } else {
       const l = this.t(item.Length || '');
       const w = this.t(item.Width || '');
       if(l && w) return `${l} x ${w}`;
       return '-';
    }
  }

  formatDateYMD(dateStr) {
    if (!dateStr || String(dateStr).trim() === '' || dateStr === '-') return '-';
    try {
      const parsedFn = (dStr) => {
          let str = String(dStr).split(' ')[0].split('T')[0];
          let p = str.split(/[\/\-]/);
          if (p.length === 3) {
              if (p[2].length === 4) return `${p[2]}/${p[0].padStart(2,'0')}/${p[1].padStart(2,'0')}`;
              if (p[0].length === 4) return `${p[0]}/${p[1].padStart(2,'0')}/${p[2].padStart(2,'0')}`;
          }
          const d = new Date(dStr);
          if (!isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}/${m}/${day}`;
          }
          return str;
      };
      
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        if (y > 1900 && y < 2100) {
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}/${m}/${day}`;
        }
      }
      return parsedFn(dateStr);
    } catch (e) {
      return dateStr;
    }
  }

  async getPhotoUrl(item) {
    if (window.DevicePhotoStore && typeof window.DevicePhotoStore.getThumbnailUrl === 'function') {
       const deviceId = (this.currentItemType === 'mold') ? (item.MoldID || item.MoldCode) : (item.CutterID || item.CutterNo);
       if (deviceId) {
         try {
           const url = await window.DevicePhotoStore.getThumbnailUrl(this.currentItemType, String(deviceId));
           if (url) return url;
         } catch(e) {}
       }
    }
    const photoProps = ['PhotoUrl', 'PhotoURL', 'ImageUrl', 'ImageURL', 'photoUrl', 'imageUrl', 'Photo', 'Image', 'ImagePath', 'PhotoPath', 'photo', 'image'];
    for (const p of photoProps) {
       if (item[p] && String(item[p]).trim() !== '') return String(item[p]).trim();
    }
    if (window.PhotoManager && typeof window.PhotoManager.getThumbOrOriginal === 'function') {
      const id = this.currentItemType === 'mold' ? item.MoldID : item.CutterID;
      return window.PhotoManager.getThumbOrOriginal(id, this.currentItemType);
    }
    return null;
  }

  getDimensions(item) {
    const isMold = this.currentItemType === 'mold';
    const d = item._design || item.designInfo || {};
    if (isMold) {
      const l = typeof item.MoldLengthModified !== 'undefined' && item.MoldLengthModified !== null && String(item.MoldLengthModified).trim() !== '' ? item.MoldLengthModified : (item.MoldLength || d.MoldDesignLength || d.Length);
      const w = typeof item.MoldWidthModified !== 'undefined' && item.MoldWidthModified !== null && String(item.MoldWidthModified).trim() !== '' ? item.MoldWidthModified : (item.MoldWidth || d.MoldDesignWidth || d.Width);
      const h = typeof item.MoldHeightModified !== 'undefined' && item.MoldHeightModified !== null && String(item.MoldHeightModified).trim() !== '' ? item.MoldHeightModified : (item.MoldHeight || d.MoldDesignHeight || d.Height);
      const arr = [l, w, h].filter(x => x !== undefined && x !== null && String(x).trim() !== '');
      return arr.length > 0 ? arr.join('×') : '-';
    } else {
      const l = item.Size || item.Length || d.CutterDesignLength || d.Length || '';
      const w = item.Width || d.CutterDesignWidth || d.Width || '';
      const h = item.Height || d.CutterDesignHeight || d.Height || '';
      const dim = item.Dimensions || item.displayDimensions;
      if (dim) return dim;
      const arr = [l, w, h].filter(x => x !== undefined && x !== null && String(x).trim() !== '');
      return arr.length > 0 ? arr.join('×') : '-';
    }
  }

  getRelatedCuttersData(item) {
    if (this.currentItemType !== 'mold') return [];
    
    // Yêu cầu: "lấy dữ liệu theo logic xử lý 関連デバイス (Thiết bị liên kết) từ trang detail panel"
    if (window.DetailPanel && typeof window.DetailPanel.getRelatedCuttersForMold === 'function') {
      const cutters = window.DetailPanel.getRelatedCuttersForMold(item) || [];
      if (cutters.length > 0) return cutters;
    }
    
    // Fallback only if DetailPanel unavailable
    const data = this.getData();
    if (!data.cutters) return [];
    
    let dId = item.MoldDesignID || item.MoldDesignId || item.DesignID || item.CutterDesignID;
    if (!dId) {
      const design = item._design || item.designInfo || {};
      dId = design.MoldDesignID || design.MoldDesignId || design.DesignID || design.CutterDesignID;
    }
    if (!dId) {
      const job = item._job || item.jobInfo || {};
      dId = job.MoldDesignID || job.MoldDesignId || job.DesignID || job.CutterDesignID;
    }
    if (!dId) return [];
    
    return data.cutters.filter(c => {
      const cId = c.CutterDesignID || c.CutterDesignId || c.DesignID || c.MoldDesignID;
      return cId && String(cId).trim() === String(dId).trim();
    });
  }

  getStorageNow(item) {
    const data = this.getData();
    let comp = '-', moveDate = '-', auditDate = '-';
    const kc = item.KeeperCompany || item.CompanyID;
    if (kc && data.companies) {
      const cp = data.companies.find(x => String(x.CompanyID).trim() === String(kc).trim());
      comp = cp ? (cp.CompanyName || cp.CompanyID) : kc;
    }
    
    const idField = this.currentItemType === 'mold' ? 'MoldID' : 'CutterID';
    const tgtId = this.currentItemType === 'mold' ? item.MoldID : item.CutterID;
    
    // Tìm ngày xuất hàng gần nhất đến công ty bảo quản
    if (kc && data.shiplogs) {
      const sLogs = data.shiplogs.filter(x => String(x[idField]) === String(tgtId) && String(x.TargetCompany).trim() === String(kc).trim());
      if (sLogs.length > 0) {
        sLogs.sort((a,b) => new Date(b.Timestamp || b.ShipDate || 0) - new Date(a.Timestamp || a.ShipDate || 0));
        moveDate = this.formatDateYMD(sLogs[0].Timestamp || sLogs[0].ShipDate);
      }
    }

    if (moveDate === '-') {
      moveDate = this.formatDateYMD(item.DisposedDate || item.ReturnedDate || item.MoldDisposedDate || item.MoldReturnedDate || item.MoveDate || '-');
    }

    let status = '-';
    if (data.statuslogs) {
      const logs = data.statuslogs.filter(x => String(x[idField]) === String(tgtId));
      if (logs.length > 0) {
        logs.sort((a,b) => new Date(b.Timestamp||0) - new Date(a.Timestamp||0));
        auditDate = this.formatDateYMD(logs[0].Timestamp);
        const stText = logs[0].Status;
        const map = { 'IN':'入庫', 'OUT':'出庫', 'AUDIT':'棚卸', 'DISPOSED':'廃棄', 'RETURNED':'返却' };
        status = map[String(stText).toUpperCase()] || stText || '-';
      }
    }
    return { comp, moveDate, auditDate, status };
  }

  getStorageYSD(item) {
    const data = this.getData();
    let comp = '(株)ヨシダパッケージ', status = '-', location = '-', rackMemo = '-', auditDate = '-', usageSt = '-';
    
    const idField = this.currentItemType === 'mold' ? 'MoldID' : 'CutterID';
    const tgtId = this.currentItemType === 'mold' ? item.MoldID : item.CutterID;
    if (data.statuslogs) {
      const logs = data.statuslogs.filter(x => String(x[idField]) === String(tgtId));
      if (logs.length > 0) {
        logs.sort((a,b) => new Date(b.Timestamp||0) - new Date(a.Timestamp||0));
        auditDate = this.formatDateYMD(logs[0].Timestamp);
        const stText = logs[0].Status;
        const map = { 'IN':'入庫', 'OUT':'出庫', 'AUDIT':'棚卸', 'DISPOSED':'廃棄', 'RETURNED':'返却' };
        status = map[String(stText).toUpperCase()] || stText || '-';
      }
    }
    
    if (item.RackLayerID && data.racklayers && data.racks) {
      const rl = data.racklayers.find(x => String(x.RackLayerID).trim() === String(item.RackLayerID).trim());
      if (rl) {
        const r = data.racks.find(x => String(x.RackID).trim() === String(rl.RackID).trim());
        location = `${r ? r.RackName || r.RackID : rl.RackID}-${rl.RackLayerNumber}`;
      }
    }
    
    rackMemo = item.RackMemo || '-';
    usageSt = this.currentItemType === 'mold' ? (item.MoldUsageStatus || '-') : (item.MainBladeStatus || '-');
    return { comp, status, location, rackMemo, usageSt, auditDate };
  }

  getProcessingInfo(item) {
    const isMold = this.currentItemType === 'mold';
    const tgtId = isMold ? item.MoldID : item.CutterID;
    const dp = window.DetailPanel;
    let teflonStatus = '-', teflonDate = '-', teflonAuditDate = '-';
    let teflonDateLabel = 'テフロン完了日', teflonAuditDateLabel = '確認日';
    let returnDate = '-', returnAuditDate = '-';
    let scrapDate = '-', scrapAuditDate = '-';

    const data = this.getData();
    if (data.teflonlog) {
      const idField = isMold ? 'MoldID' : 'CutterID';
      const tLogs = data.teflonlog.filter(x => String(x[idField]) === String(tgtId));
      if (tLogs.length > 0) {
          tLogs.sort((a,b) => new Date(b.ProcessDate || b.Timestamp || 0) - new Date(a.ProcessDate || a.Timestamp || 0));
          const tLog = tLogs[0];
          
          if (tLog.ReceivedDate || String(tLog.Status) === '完了') {
              teflonStatus = 'テフロン加工済';
              teflonDateLabel = '加工完了日';
              teflonDate = this.formatDateYMD(tLog.ReceivedDate || tLog.ProcessDate || tLog.Timestamp);
              teflonAuditDateLabel = '確認日';
              teflonAuditDate = this.formatDateYMD(tLog.Timestamp || tLog.ProcessDate);
          } else if (tLog.SentDate || String(tLog.Status) === '加工中') {
              teflonStatus = '加工中';
              teflonDateLabel = '発送日';
              teflonDate = this.formatDateYMD(tLog.SentDate || tLog.Timestamp);
              teflonAuditDateLabel = '手配日';
              teflonAuditDate = this.formatDateYMD(tLog.RequestedDate || tLog.Timestamp);
          } else if (tLog.RequestedDate || String(tLog.Status) === '手配中') {
              teflonStatus = '手配中';
              teflonDateLabel = '手配日';
              teflonDate = this.formatDateYMD(tLog.RequestedDate || tLog.Timestamp);
              teflonAuditDateLabel = '確認日';
              teflonAuditDate = this.formatDateYMD(tLog.Timestamp);
          } else {
              teflonStatus = tLog.Status || tLog.Reason || 'テフロン加工済';
              teflonDateLabel = 'テフロン完了日';
              teflonDate = this.formatDateYMD(tLog.ProcessDate || tLog.Timestamp);
              teflonAuditDateLabel = '確認日';
              teflonAuditDate = this.formatDateYMD(tLog.Timestamp || tLog.ProcessDate);
          }
      }
    }
    if (data.statuslogs) {
      const idField = isMold ? 'MoldID' : 'CutterID';
      const logs = data.statuslogs.filter(x => String(x[idField]) === String(tgtId));
      
      const scrapLogs = logs.filter(x => String(x.Status).toUpperCase() === 'DISPOSED' || String(x.Status).toUpperCase() === '廃棄');
      if (scrapLogs.length > 0) {
         scrapLogs.sort((a,b) => new Date(b.Timestamp||0) - new Date(a.Timestamp||0));
         scrapDate = this.formatDateYMD(item.DisposedDate || item.MoldDisposedDate || scrapLogs[0].Timestamp);
         scrapAuditDate = this.formatDateYMD(scrapLogs[0].Timestamp);
      } else if (item.DisposedDate || item.MoldDisposedDate) {
         scrapDate = this.formatDateYMD(item.DisposedDate || item.MoldDisposedDate);
      }

      const retLogs = logs.filter(x => String(x.Status).toUpperCase() === 'RETURNED' || String(x.Status).toUpperCase() === '返却');
      if (retLogs.length > 0) {
         retLogs.sort((a,b) => new Date(b.Timestamp||0) - new Date(a.Timestamp||0));
         returnDate = this.formatDateYMD(item.ReturnedDate || item.MoldReturnedDate || retLogs[0].Timestamp);
         returnAuditDate = this.formatDateYMD(retLogs[0].Timestamp);
      } else if (item.ReturnedDate || item.MoldReturnedDate) {
         returnDate = this.formatDateYMD(item.ReturnedDate || item.MoldReturnedDate);
      }
    }

    return {
       teflonStatus, teflonDate, teflonAuditDate,
       teflonDateLabel, teflonAuditDateLabel,
       returnDate, returnAuditDate,
       scrapDate, scrapAuditDate
    };
  }

  async fetchImageBase64(url) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve({ b64: reader.result, isJpg: blob.type.includes('jp') });
        reader.readAsDataURL(blob);
      });
    } catch(e) {
      return null;
    }
  }

  getLocationStr(item) {
    const data = this.getData();
    if (!item.RackLayerID || !data.racklayers || !data.racks) return '未定';
    const rl = data.racklayers.find(x => String(x.RackLayerID).trim() === String(item.RackLayerID).trim());
    if (!rl) return '未定';
    const r = data.racks.find(x => String(x.RackID).trim() === String(rl.RackID).trim());
    const rName = r ? r.RackName || r.RackID : rl.RackID;
    return `${rName} - ${rl.RackLayerNumber}段`;
  }

  getStatusStr(item) {
    const data = this.getData();
    if (!data.statuslogs) return '不明';
    const idField = this.currentItemType === 'mold' ? 'MoldID' : 'CutterID';
    const tgtId = this.currentItemType === 'mold' ? item.MoldID : item.CutterID;
    const logs = data.statuslogs.filter(x => String(x[idField]) === String(tgtId));
    if (logs.length === 0) return '不明';
    logs.sort((a,b) => new Date(b.Timestamp||0) - new Date(a.Timestamp||0));
    
    const map = { 'IN':'入庫', 'OUT':'出庫', 'AUDIT':'棚卸', 'DISPOSED':'廃棄', 'RETURNED':'返却' };
    let st = logs[0].Status;
    if (map[String(st).toUpperCase()]) st = map[String(st).toUpperCase()];
    return st;
  }

  getExtendedInfo(item) {
    const isMold = this.currentItemType === 'mold';
    const data = this.getData();
    
    let design = item._design || item.designInfo;
    let job = item._job || item.jobInfo;

    if (!design && item.MoldDesignID && data.molddesign) {
      design = data.molddesign.find(x => String(x.MoldDesignID).trim() === String(item.MoldDesignID).trim());
    }
    if (!design && item.CutterDesignID && data.cutterdesign) {
      design = data.cutterdesign.find(x => String(x.CutterDesignID).trim() === String(item.CutterDesignID).trim());
    }
    if (!job && item.JobID && data.jobs) {
      job = data.jobs.find(x => String(x.JobID).trim() === String(item.JobID).trim());
    }

    design = design || {};
    job = job || {};

    const trayInfo = this.t(job.TrayInfo || job.TrayInstruction || job.InstructionTray || job.TrayInfoFromInstruction || job.NPCode || job.NP || job.NPNo || design.TrayInfoForMoldDesign || design.TrayInfo);
    
    const plastic = this.t(design.PlasticType || design.Material || design.Resin || design.Plastic || design.DesignForPlasticType || job.Material || job.PlasticType || item.PlasticType || item.PlasticCutType);
    const cost = this.t(item.Cost || item.OriginalCost || item.Price || item.UnitPrice || item.NguyenGia || item.CostPrice || job.Cost || job.Price || job.UnitPrice || design.Cost || design.UnitPrice);
    
    const pieceCount = isMold ? this.t(design.PieceCount || design.PieceNumbers || item.PieceCount) : this.t(item.BladeCount || item.Blades);
    
    const pocketCount = this.t(item.PocketCount || design.PocketNumbers || design.PocketCount || job.PocketCount || item.Pockets || design.Pockets);
    
    // Extrapolate trayDim
    const cutX = (design.CutlineX || design.CutlineLength || design.CutLength || design.CutX || item.CutlineLength || item.CutLength || '').toString().trim();
    const cutY = (design.CutlineY || design.CutlineWidth || design.CutWidth || design.CutY || item.CutlineWidth || item.CutWidth || '').toString().trim();
    let trayDim = (cutX && cutY) ? `${cutX}×${cutY}` : '-';

    const trayWeight = this.t(item.trayInfo?.TrayWeight || item.trayInfo?.ActualTrayWeight || design.TrayWeight || design.ProductWeight || job.TrayWeight || job.ProductWeight || job.Weight);
    
    const firstShip = job?.DeliveryDeadline || job?.FirstShipmentDate || job?.FirstExport || item?.FirstShipmentDate || item?.FirstShipDate || job?.ShipmentDate || design?.ShipmentDate || item?.ShipmentDate || '-';

    return {
      trayInfo, plastic, cost, pieceCount, pocketCount, trayDim, trayWeight,
      firstShip: this.formatDateYMD(firstShip),
      job: this.t(item.JobID),
      usageSt: isMold ? this.t(item.MoldUsageStatus) : this.t(item.MainBladeStatus),
      material: isMold ? (this.t(item.TeflonFinish) + ' / ' + this.t(item.TeflonCoating)) : this.t(item.ProductCode),
      entry: this.formatDateYMD(item.MoldEntry || item.DateEntry)
    };
  }

  parseCutterData(c) {
    const data = this.getData();
    let location = '-', rackMemo = '-', auditDate = '-';
    
    if (data.statuslogs) {
      const logs = data.statuslogs.filter(x => String(x.CutterID) === String(c.CutterID));
      if (logs.length > 0) {
        logs.sort((a,b) => new Date(b.Timestamp||0) - new Date(a.Timestamp||0));
        auditDate = this.formatDateYMD(logs[0].Timestamp);
      }
    }
    if (c.RackLayerID && data.racklayers && data.racks) {
      const rl = data.racklayers.find(x => String(x.RackLayerID).trim() === String(c.RackLayerID).trim());
      if (rl) {
        const r = data.racks.find(x => String(x.RackID).trim() === String(rl.RackID).trim());
        location = `${r ? r.RackName || r.RackID : rl.RackID}-${rl.RackLayerNumber}`;
      }
    }
    rackMemo = c.RackMemo || '-';
    
    let sharedMoldsStr = '-';
    const norm = (v) => String(v || '').trim().toLowerCase();
    const extractIds = (val) => {
      if (!val) return [];
      return String(val).split(',').map(x => norm(x)).filter(Boolean);
    };

    const allDesignIds = new Set();
    
    // 1. Injected by DetailPanel (if any)
    const linkIds = c.dpLinkDesignIds || c.__dpLinkDesignIds || [];
    linkIds.forEach(id => allDesignIds.add(norm(id)));

    // 2. Direct links from cutter record
    extractIds(c.MoldDesignID).forEach(id => allDesignIds.add(id));
    extractIds(c.CutterDesignID).forEach(id => allDesignIds.add(id));
    extractIds(c.MoldDesignId).forEach(id => allDesignIds.add(id));
    extractIds(c.DesignID).forEach(id => allDesignIds.add(id));

    // 3. Shared links from moldcutters.csv mapping table
    const cID = norm(c.CutterID || c.ID);
    if (cID && data.moldcutter) {
      const links = data.moldcutter.filter(r => norm(r.CutterID || r.CutterId || r.CUTTERID) === cID);
      for (const r of links) {
        extractIds(r.MoldDesignID || r.MoldDesignId || r.DESIGNID || r.DesignID).forEach(id => allDesignIds.add(id));
      }
    }

    if (allDesignIds.size > 0 && data.molds) {
      const designArr = Array.from(allDesignIds);
      const codes = designArr.map(did => {
        const m = data.molds.find(x => norm(x.MoldDesignID || x.MoldDesignId || x.DesignID) === did);
        return m ? (m.MoldCode || m.MoldNo || m.MoldID || did) : did;
      }).filter(Boolean);
      
      if (codes.length > 0) {
        sharedMoldsStr = [...new Set(codes)].join(', ');
      }
    }

    const c_dim = c.CutlineLength && c.CutlineWidth ? `${c.CutlineLength}x${c.CutlineWidth}` : (c.CutlineX ? `${c.CutlineX}x${c.CutlineY}` : '-');

    return {
      id: c.CutterID || '-',
      code: c.CutterNo || c.CutterCode || '-',
      type: c.CutterType || '-',
      dim: c_dim,
      pc: c.BladeCount || c.PieceCount || '-',
      pp: c.PPCushion || c.notes || '-',
      location,
      rackMemo,
      auditDate,
      sharedMoldsStr
    };
  }

  // --- HTML PRINT ---

  async executePrint() {
    const item = this.currentItem;
    const isMold = this.currentItemType === 'mold';
    const photoUrl = await this.getPhotoUrl(item);
    const dim = this.getDimensions(item);
    const ext = this.getExtendedInfo(item);
    const stNow = this.getStorageNow(item);
    const stYsd = this.getStorageYSD(item);
    const pInfo = this.getProcessingInfo(item);
    
    let relCutters = this.getRelatedCuttersData(item);
    const inLine = relCutters.filter(c => (c.CutterType||'').toLowerCase().includes('in-line') || (c.CutterType||'').toLowerCase().includes('inline'));
    const outLine = relCutters.filter(c => !(c.CutterType||'').toLowerCase().includes('in-line') && !(c.CutterType||'').toLowerCase().includes('inline') && String(c.CutterType).trim() !== '');

    let printArea = document.getElementById('dpmPrintArea');
    if (!printArea) {
      printArea = document.createElement('div');
      printArea.id = 'dpmPrintArea';
      document.body.appendChild(printArea);
    }
    
    const idLabel = isMold ? '金型 ID' : '抜型 ID';
    const idVal = isMold ? item.MoldID : item.CutterID;
    const codeLabel = '番号';
    const codeVal = isMold ? item.MoldCode : item.CutterNo;
    const nameLabel = '名称';
    const nameVal = isMold ? item.MoldName : item.CutterName;
    const weightVal = this.t(isMold ? (item.MoldWeightModified || item.MoldWeight) : '');

    const photoHtml = photoUrl 
      ? `<img src="${photoUrl}" alt="Photo" style="max-width:100%; max-height:100%; object-fit:contain; border-radius: 4px;"/>` 
      : `<div class="no-photo" style="display:flex; align-items:center; justify-content:center; height:100%; color:#999; font-size:14px;">(写真)</div>`;

    const title = isMold ? '金型 詳細仕様書' : '抜型 詳細仕様書';

        const colgroupHtml = `
          <colgroup>
            <col style="width: 12%;">
            <col style="width: 18%;">
            <col style="width: 13%;">
            <col style="width: 22%;">
            <col style="width: 12%;">
            <col style="width: 23%;">
          </colgroup>`;

        let html = `
      <div class="dp-print-container" style="max-width: 100%; margin: 0 auto; font-family: 'Meiryo UI', Meiryo, sans-serif;">
        <div class="dp-print-title" style="text-align: center; font-size: 22px; font-weight: bold; border-bottom: 3px solid #000; margin-bottom: 20px; padding-bottom: 8px;">${title}</div>
        <div style="text-align: right; margin-bottom: 5px; font-size: 11px;">印刷日: ${this.getDateString()}</div>
        
        <style>
          .dpm-sheet-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
          .dpm-sheet-table th, .dpm-sheet-table td { border: 1px solid #000; padding: 6px; }
          .dpm-sheet-table th { background: #f0f0f0; text-align: center; font-weight: normal; }
          .dpm-sheet-table td { text-align: left; }
          .dpm-sect-title { font-weight: bold; font-size: 13px; margin-bottom: 5px; }
        </style>

        <table class="dpm-sheet-table" style="table-layout: fixed;">
          ${colgroupHtml}
          <tr>
            <td colspan="2" rowspan="8" style="text-align:center; vertical-align:middle; padding:5px; height:200px;">
              ${photoHtml}
            </td>
            <th>${idLabel}</th>
            <td>${idVal || '-'}</td>
            <th>${codeLabel}</th>
            <td>${codeVal || '-'}</td>
          </tr>
          <tr>
            <th>${nameLabel}</th>
            <td colspan="3">${nameVal || '-'}</td>
          </tr>
          <tr>
            <th>トレイ情報</th>
            <td colspan="3">${ext.trayInfo || '-'}</td>
          </tr>
          <tr>
            <th>材質</th>
            <td colspan="3">${ext.plastic || '-'}</td>
          </tr>
          <tr>
            <th>初回出荷日</th>
            <td>${ext.firstShip}</td>
            <th>段価(￥)</th>
            <td>${ext.cost || '-'}</td>
          </tr>
          <tr>
            <th>枚数 (取数)</th>
            <td>${ext.pieceCount || '-'}</td>
            <th>ポケット数</th>
            <td>${ext.pocketCount || '-'}</td>
          </tr>
          <tr>
            <th>金型寸法</th>
            <td>${dim}</td>
            <th>重量(kg)</th>
            <td>${weightVal ? weightVal : '-'}</td>
          </tr>
          <tr>
            <th>製品寸法</th>
            <td>${ext.trayDim || '-'}</td>
            <th>製品重量(g)</th>
            <td>${ext.trayWeight ? ext.trayWeight : '-'}</td>
          </tr>
        </table>

        <!-- Storage Info -->
        <div class="dpm-sect-title">■ 現在保管会社</div>
        <table class="dpm-sheet-table" style="table-layout: fixed;">
          ${colgroupHtml}
          <tr>
            <th>保管会社</th>
            <td>${stNow.comp}</td>
            <th>金型移動日</th>
            <td>${stNow.moveDate}</td>
            <th>確認日</th>
            <td>${stNow.auditDate}</td>
          </tr>
        </table>

        <div class="dpm-sect-title">■ YSDでの保管情報</div>
        <table class="dpm-sheet-table" style="table-layout: fixed;">
          ${colgroupHtml}
          <tr>
            <th>保管会社</th>
            <td>${stYsd.comp}</td>
            <th>最新入庫状態</th>
            <td>${stYsd.status}</td>
            <th>確認日</th>
            <td>${stYsd.auditDate}</td>
          </tr>
          <tr>
            <th>保管位置</th>
            <td>${stYsd.location}</td>
            <th>棚段メモ</th>
            <td>${stYsd.rackMemo}</td>
            <th>使用状態</th>
            <td>${stYsd.usageSt}</td>
          </tr>
        </table>

        <!-- 処理情報 -->
        <div class="dpm-sect-title">■ 処理情報（テフロン加工・返却・廃棄）</div>
        <table class="dpm-sheet-table" style="table-layout: fixed;">
          ${colgroupHtml}
          <tr>
            <th>テフロン</th>
            <td>${pInfo.teflonStatus}</td>
            <th>${pInfo.teflonDateLabel}</th>
            <td>${pInfo.teflonDate}</td>
            <th>${pInfo.teflonAuditDateLabel}</th>
            <td>${pInfo.teflonAuditDate}</td>
          </tr>
          <tr>
            <th>返却</th>
            <td>${pInfo.returnDate !== '-' ? '返却済' : '-'}</td>
            <th>返却日</th>
            <td>${pInfo.returnDate}</td>
            <th>確認日</th>
            <td>${pInfo.returnAuditDate}</td>
          </tr>
          <tr>
            <th>廃棄</th>
            <td>${pInfo.scrapDate !== '-' ? '廃棄済' : '-'}</td>
            <th>廃棄日</th>
            <td>${pInfo.scrapDate}</td>
            <th>確認日</th>
            <td>${pInfo.scrapAuditDate}</td>
          </tr>
        </table>
    `;

    if (isMold) {
      html += `<div style="page-break-before: auto;"></div>`;
      
      html += `<div class="dpm-sect-title">■ 関連抜型 (IN-LINE)</div>`;
      if (inLine.length === 0) {
        html += `
            <table class="dpm-sheet-table" style="table-layout: fixed; margin-bottom: 8px;">
              ${colgroupHtml}
              <tr>
                <th>抜型名</th><td></td>
                <th>抜型コード</th><td></td>
                <th>抜きタイプ</th><td>In-Line</td>
              </tr>
              <tr>
                <th>カットライン</th><td></td>
                <th>枚数 (取数)</th><td></td>
                <th>PP クッション使用</th><td></td>
              </tr>
              <tr>
                <th>保管位置</th><td></td>
                <th>棚段メモ</th><td></td>
                <th>確認日</th><td></td>
              </tr>
              <tr>
                <th>共用型番</th><td colspan="5"></td>
              </tr>
            </table>
        `;
      } else {
        inLine.forEach(cOrig => {
          const c = this.parseCutterData(cOrig);
          html += `
            <table class="dpm-sheet-table" style="table-layout: fixed; margin-bottom: 8px;">
              ${colgroupHtml}
              <tr>
                <th>抜型ID</th><td>${c.id}</td>
                <th>抜型コード</th><td>${c.code}</td>
                <th>抜きタイプ</th><td>${c.type}</td>
              </tr>
              <tr>
                <th>カットライン</th><td>${c.dim}</td>
                <th>枚数 (取数)</th><td>${c.pc}</td>
                <th>PP クッション使用</th><td>${c.pp}</td>
              </tr>
              <tr>
                <th>保管位置</th><td>${c.location}</td>
                <th>棚段メモ</th><td>${c.rackMemo}</td>
                <th>確認日</th><td>${c.auditDate}</td>
              </tr>
              <tr>
                <th>共用型番</th><td colspan="5">${c.sharedMoldsStr}</td>
              </tr>
            </table>
          `;
        });
      }

      if (outLine.length > 0) {
        html += `<div class="dpm-sect-title">■ 関連抜型 (別抜き)</div>`;
        outLine.forEach(cOrig => {
          const c = this.parseCutterData(cOrig);
          html += `
            <table class="dpm-sheet-table" style="table-layout: fixed; margin-bottom: 8px;">
              ${colgroupHtml}
              <tr>
                <th>抜型ID</th><td>${c.id}</td>
                <th>抜型コード</th><td>${c.code}</td>
                <th>抜きタイプ</th><td>${c.type}</td>
              </tr>
              <tr>
                <th>カットライン</th><td>${c.dim}</td>
                <th>枚数 (取数)</th><td>${c.pc}</td>
                <th>PP クッション使用</th><td>${c.pp}</td>
              </tr>
              <tr>
                <th>保管位置</th><td>${c.location}</td>
                <th>棚段メモ</th><td>${c.rackMemo}</td>
                <th>確認日</th><td>${c.auditDate}</td>
              </tr>
              <tr>
                <th>共用型番</th><td colspan="5">${c.sharedMoldsStr}</td>
              </tr>
            </table>
          `;
        });
      }
    }

    html += `
        <div class="dpm-sect-title">■ 備考 (Memo)</div>
        <table class="dpm-sheet-table" style="table-layout: fixed;">
          <tr>
            <td style="min-height: 50px; white-space: pre-wrap;">${(isMold ? item.MoldNotes : item.notes) || ''}</td>
          </tr>
        </table>
      </div>
    `;

    printArea.innerHTML = html;

    setTimeout(() => {
      document.body.classList.add('is-printing-detail');
      window.print();
      setTimeout(() => {
        document.body.classList.remove('is-printing-detail');
        if (printArea && printArea.parentNode) {
          printArea.parentNode.removeChild(printArea);
        }
      }, 500);
    }, 300);
  }

  // --- EXCEL JS EXPORT ---

  async executeExportExcel() {
    try {
      if (typeof ExcelJS === 'undefined') {
        alert('ExcelJSライブラリがロードされていません。少々お待ちください。');
        return;
      }

      document.body.style.cursor = 'wait';

      const item = this.currentItem;
      const isMold = this.currentItemType === 'mold';
      const photoUrl = await this.getPhotoUrl(item);
      const dim = this.getDimensions(item);
      const ext = this.getExtendedInfo(item);
      const stNow = this.getStorageNow(item);
      const stYsd = this.getStorageYSD(item);
      
      let relCutters = this.getRelatedCuttersData(item);
      const inLine = relCutters.filter(c => (c.CutterType||'').toLowerCase().includes('in-line') || (c.CutterType||'').toLowerCase().includes('inline'));
      const outLine = relCutters.filter(c => !(c.CutterType||'').toLowerCase().includes('in-line') && !(c.CutterType||'').toLowerCase().includes('inline') && String(c.CutterType).trim() !== '');

      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('仕様書', { views: [{ showGridLines: false }] });

      sheet.pageSetup = {
        paperSize: 9, // A4
        orientation: 'portrait',
        margins: { left: 0.6, right: 0.6, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 }
      };

      sheet.columns = [
        { width: 12 },
        { width: 17 },
        { width: 14 },
        { width: 22 },
        { width: 13 },
        { width: 22 }
      ];

      // Insert Photo if it exists
      if (photoUrl) {
        const imgData = await this.fetchImageBase64(photoUrl);
        if (imgData && imgData.b64) {
          try {
            const imageId = workbook.addImage({
              base64: imgData.b64,
              extension: imgData.isJpg ? 'jpeg' : 'png',
            });
            sheet.addImage(imageId, {
              tl: { col: 0, row: 5 }, // Col A = 0, Row 6 = 5
              br: { col: 2, row: 13 } // Spans exactly inside A6:B13 (Col C = 2, Row 14 top = 13)
            });
          } catch(e) {
            console.warn("Failed to embed image", e);
          }
        }
      }

      // Title Section
      const title = isMold ? '金型 詳細仕様書' : '抜型 詳細仕様書';
      sheet.mergeCells('A2:F2');
      const tr = sheet.getRow(2);
      tr.getCell(1).value = title;
      tr.getCell(1).font = { name:'Meiryo UI', size: 16, bold: true };
      tr.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      tr.getCell(1).border = { bottom: { style: 'medium' } };

      // Print Date
      sheet.mergeCells('E4:F4');
      const dtr = sheet.getRow(4);
      dtr.getCell(5).value = `印刷日: ${this.getDateString()}`;
      dtr.getCell(5).font = { name: 'Meiryo UI', size: 10 };
      dtr.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };

      const idLabel = isMold ? '金型 ID' : '抜型 ID';
      const idVal = isMold ? item.MoldID : item.CutterID;
      const codeLabel = '番号';
      const codeVal = isMold ? item.MoldCode : item.CutterNo;
      const nameLabel = '名称';
      const nameVal = isMold ? item.MoldName : item.CutterName;
      const weightVal = this.t(isMold ? (item.MoldWeightModified || item.MoldWeight) : '');

      const startR = 6;
      sheet.getRow(startR).values = ['(写真)', '', idLabel, idVal, codeLabel, codeVal];
      sheet.getRow(startR+1).values = ['', '', nameLabel, nameVal];
      sheet.mergeCells(`D${startR+1}:F${startR+1}`);
      sheet.getRow(startR+2).values = ['', '', 'トレイ情報', ext.trayInfo];
      sheet.mergeCells(`D${startR+2}:F${startR+2}`);
      sheet.getRow(startR+3).values = ['', '', '材質', ext.plastic];
      sheet.mergeCells(`D${startR+3}:F${startR+3}`);
      sheet.getRow(startR+4).values = ['', '', '初回出荷日', ext.firstShip, '段価(￥)', ext.cost];
      sheet.getRow(startR+5).values = ['', '', '枚数 (取数)', ext.pieceCount, 'ポケット数', ext.pocketCount];
      sheet.getRow(startR+6).values = ['', '', '金型寸法', dim, '重量(kg)', weightVal];
      sheet.getRow(startR+7).values = ['', '', '製品寸法', ext.trayDim, '製品重量(g)', ext.trayWeight];

      // Format top table A6:F13
      sheet.mergeCells('A6:B13');
      for (let r=startR; r<=startR+7; r++) {
        const row = sheet.getRow(r);
        row.height = 24;
        [3, 5].forEach(cNum => {
          const cell = row.getCell(cNum);
          if (cell.value) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          }
        });
        [4, 6].forEach(cNum => {
          row.getCell(cNum).alignment = { vertical: 'middle', wrapText: true };
        });
        for (let c=1; c<=6; c++) {
          if (r===startR && c<=2) continue; // let merged photo cell handle its own border
          const cell = row.getCell(c);
          cell.border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
          cell.font = { name: 'Meiryo UI', size: 10 };
        }
      }
      const pCell = sheet.getCell('A6');
      pCell.alignment = { vertical: 'middle', horizontal: 'center' };
      pCell.border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
      pCell.font = { name: 'Meiryo UI', size: 10, color: { argb: 'FF999999' } };

      let curR = startR + 9;

      // Helper function for sub-tables
      const formatSubTable = (stRow, rowsCount) => {
        for (let r=stRow; r<stRow+rowsCount; r++) {
          const row = sheet.getRow(r);
          row.height = 20;
          [1, 3, 5].forEach(cNum => {
            const cell = row.getCell(cNum);
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center' };
          });
          [2, 4, 6].forEach(cNum => {
            row.getCell(cNum).alignment = { vertical: 'middle', wrapText: true, indent: 1 };
          });
          for (let c=1; c<=6; c++) {
            const cell = row.getCell(c);
            cell.border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
            cell.font = { name: 'Meiryo UI', size: 10 };
          }
        }
      };

      // Header Helper
      const printHeader = (text) => {
        sheet.getRow(curR).values = [text];
        sheet.getRow(curR).getCell(1).font = { name:'Meiryo UI', size: 11, bold: true };
        sheet.mergeCells(`A${curR}:F${curR}`);
        curR++;
      };

      // --- Storage Now ---
      printHeader('■ 現在保管会社');
      sheet.getRow(curR).values = ['保管会社', stNow.comp, '金型移動日', stNow.moveDate, '確認日', stNow.auditDate];
      formatSubTable(curR, 1);
      curR += 2;

      // --- Storage YSD ---
      printHeader('■ YSDでの保管情報');
      sheet.getRow(curR).values = ['保管会社', stYsd.comp, '最新入庫状態', stYsd.status, '確認日', stYsd.auditDate];
      sheet.getRow(curR+1).values = ['保管位置', stYsd.location, '棚段メモ', stYsd.rackMemo, '使用状態', stYsd.usageSt];
      formatSubTable(curR, 2);
      curR += 3;

      // --- Processing Info ---
      printHeader('■ 処理情報（テフロン加工・返却・廃棄）');
      sheet.getRow(curR).values = ['テフロン', pInfo.teflonStatus, pInfo.teflonDateLabel, pInfo.teflonDate, pInfo.teflonAuditDateLabel, pInfo.teflonAuditDate];
      sheet.getRow(curR+1).values = ['返却', pInfo.returnDate !== '-' ? '返却済' : '-', '返却日', pInfo.returnDate, '確認日', pInfo.returnAuditDate];
      sheet.getRow(curR+2).values = ['廃棄', pInfo.scrapDate !== '-' ? '廃棄済' : '-', '廃棄日', pInfo.scrapDate, '確認日', pInfo.scrapAuditDate];
      formatSubTable(curR, 3);
      curR += 4;

      // --- Cutters ---
      if (isMold) {
        printHeader('■ 関連抜型 (IN-LINE)');
        if (inLine.length === 0) {
          sheet.getRow(curR).values = ['抜型名', '', '抜型コード', '', '抜きタイプ', 'In-Line'];
          sheet.getRow(curR+1).values = ['カットライン', '', '枚数 (取数)', '', 'PP クッション使用', ''];
          sheet.getRow(curR+2).values = ['保管位置', '', '棚段メモ', '', '確認日', ''];
          sheet.getRow(curR+3).values = ['共用型番', ''];
          sheet.mergeCells(`B${curR+3}:F${curR+3}`);
          formatSubTable(curR, 4);
          curR += 5;
        } else {
          inLine.forEach(cOrig => {
            const c = this.parseCutterData(cOrig);
            sheet.getRow(curR).values = ['抜型名', c.id, '抜型コード', c.code, '抜きタイプ', c.type];
            sheet.getRow(curR+1).values = ['カットライン', c.dim, '枚数 (取数)', c.pc, 'PP クッション使用', c.pp];
            sheet.getRow(curR+2).values = ['保管位置', c.location, '棚段メモ', c.rackMemo, '確認日', c.auditDate];
            sheet.getRow(curR+3).values = ['共用型番', c.sharedMoldsStr];
            sheet.mergeCells(`B${curR+3}:F${curR+3}`);
            formatSubTable(curR, 4);
            curR += 5;
          });
        }
        
        if (outLine.length > 0) {
          printHeader('■ 関連抜型 (別抜き)');
          outLine.forEach(cOrig => {
            const c = this.parseCutterData(cOrig);
            sheet.getRow(curR).values = ['抜型名', c.id, '抜型コード', c.code, '抜きタイプ', c.type];
            sheet.getRow(curR+1).values = ['カットライン', c.dim, '枚数 (取数)', c.pc, 'PP クッション使用', c.pp];
            sheet.getRow(curR+2).values = ['保管位置', c.location, '棚段メモ', c.rackMemo, '確認日', c.auditDate];
            sheet.getRow(curR+3).values = ['共用型番', c.sharedMoldsStr];
            sheet.mergeCells(`B${curR+3}:F${curR+3}`);
            formatSubTable(curR, 4);
            curR += 5;
          });
        }
      }

      // --- Memo ---
      printHeader('■ 備考 (Memo)');
      const memoR = sheet.getRow(curR);
      memoR.values = [(isMold ? item.MoldNotes : item.notes) || ''];
      sheet.mergeCells(`A${curR}:F${curR}`);
      memoR.height = 60;
      memoR.getCell(1).alignment = { vertical: 'top', horizontal: 'left', wrapText: true, indent: 1 };
      memoR.getCell(1).font = { name: 'Meiryo UI', size: 10 };
      for(let i=1; i<=6; i++) {
        memoR.getCell(i).border = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };
      }

      // Write file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      
      const dStr = this.getDateString().replace(/\//g, '');
      const fileName = `仕様書_${idVal}_${dStr}.xlsx`;

      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      
    } catch (err) {
      console.error('Excel Export Error:', err);
      alert('Excelファイルの出力中にエラーが発生しました。\n' + err.message);
    } finally {
      document.body.style.cursor = '';
    }
  }
}

window.DetailPrintModule = new DetailPrintModule();

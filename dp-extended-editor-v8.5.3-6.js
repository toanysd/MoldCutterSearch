(function (global) {
'use strict';

var VERSION = 'v8.5.3-6';
var STORAGE_KEY = 'dp_extended_editor_drafts_v8_5_3_6';
var API_BATCH_APPLY = resolveApiUrl('/api/csv/apply-overlay-batch');
var API_SINGLE_UPSERT = resolveApiUrl('/api/csv/upsert');
var DATA_CHANGE_HISTORY_FILE = 'datachangehistory.csv';
var ACCESS_COMMIT_HISTORY_FILE = 'accesscommithistory.csv';

var storageMemo = { version: 1, items: [] };
var storageOkCache = null;

var DEFAULT_API_BASE = 'https://ysd-moldcutter-backend.onrender.com';

function resolveApiUrl(path) {
  var p = String(path || '').trim();
  if (!p) return '';

  if (/^https?:\/\//i.test(p)) return p;

  var normalized = p.charAt(0) === '/' ? p : ('/' + p);

  try {
    var base1 = global && global.MCS_API_BASE_URL;
    if (base1 && String(base1).trim() && String(base1).trim() !== 'undefined' && String(base1).trim() !== 'null') {
      return String(base1).replace(/\/+$/, '') + normalized;
    }
  } catch (e0) {}

  try {
    var base2 = global && global.EXTENDED_EDITOR_CONFIG && global.EXTENDED_EDITOR_CONFIG.apiBaseUrl;
    if (base2 && String(base2).trim() && String(base2).trim() !== 'undefined' && String(base2).trim() !== 'null') {
      return String(base2).replace(/\/+$/, '') + normalized;
    }
  } catch (e1) {}

  return 'https://ysd-moldcutter-backend.onrender.com' + normalized;
}


var TABLE_TO_FILENAME = {
  molds: 'webmolds.csv',
  cutters: 'webcutters.csv',
  customers: 'webcustomers.csv',
  molddesign: 'webmolddesign.csv',
  moldcutter: 'webmoldcutter.csv',
  companies: 'webcompanies.csv',
  trays: 'webtray.csv',
  tray: 'webtray.csv',
  employees: 'webemployees.csv',
  jobs: 'webjobs.csv',
  worklog: 'webworklog.csv',
  processingdeadline: 'webprocessingdeadline.csv'
};


var ID_FIELD_PREF = {
  molds: 'MoldID',
  cutters: 'CutterID',
  customers: 'CustomerID',
  molddesign: 'MoldDesignID',
  moldcutter: 'MoldCutterID',
  companies: 'CompanyID',
  trays: 'TrayID',
  tray: 'TrayID',
  employees: 'EmployeeID',
  jobs: 'JobID',
  worklog: 'WorkLogID',
  processingdeadline: 'ProcessingDeadlineID'
};

var FIELD_PREF = {
  molds: ['MoldID','MoldCode','MoldName','CustomerID','TrayID','MoldDesignID','storagecompany','RackLayerID','LocationNotes','MoldLengthModified','MoldWidthModified','MoldHeightModified','MoldWeightModified','MoldNotes','MoldUsageStatus','MoldOnCheckList','JobID','TeflonFinish','TeflonCoating','TeflonSentDate','TeflonExpectedDate','TeflonReceivedDate','MoldReturning','MoldReturnedDate','MoldDisposing','MoldDisposedDate','MoldEntry'],
  cutters: ['CutterID','CutterNo','CutterName','CustomerID','MoldDesignID','storagecompany','RackLayerID','CutterCode','MainBladeStatus','OtherStatus','Length','Width','notes','ProductCode','CurrentCompanyID','CutterDesignID','CurrentUserID'],
  molddesign: ['MoldDesignID','MoldDesignCode','DrawingNumber','DrawingNo','MoldDesignLength','MoldDesignWidth','MoldDesignHeight','MoldDesignDim','CutlineX','CutlineY','TrayID','PlasticType','TrayInfoForMoldDesign','Serial','CAV','Notes'],
  customers: ['CustomerID','CustomerCode','CustomerShortName','CustomerName','CompanyID','Address','Phone','Notes'],
  companies: ['CompanyID','CompanyCode','CompanyShortName','CompanyName','Address','Phone','Notes'],
  trays: ['TrayID','TrayCode','TrayName','CustomerTrayName','CustomerDrawingNo','CustomerEquipmentNo','TrayWeight','TrayCapacity','Notes'],
  tray: ['TrayID','TrayCode','TrayName','CustomerTrayName','CustomerDrawingNo','CustomerEquipmentNo','TrayWeight','TrayCapacity','Notes'],
  employees: ['EmployeeID','EmployeeCode','EmployeeName','Name','Department','Role','Email','Phone','Notes'],
  jobs: ['JobID','JobNumber','OrderNumber','JobName','Name','MoldDesignID','CustomerID','ProcessingItemID','DeliveryDeadline','DueDate','Material','PlasticType','TrayInfo','TrayName','Notes'],
  worklog: ['WorkLogID','MoldID','CutterID','EmployeeID','WorkDate','WorkType','Notes'],
  processingdeadline: ['ProcessingDeadlineID','MoldDesignID','DeadlineDate','Notes'],
  moldcutter: ['MoldCutterID','MoldDesignID','MoldID','CutterID']
};

var SECTION_META = {
  molds: { vi: 'Thông tin khuôn', jp: '型情報', icon: 'fas fa-cube', kind: 'singular' },
  cutters: { vi: 'Thông tin dao cắt', jp: '抜型情報', icon: 'fas fa-drafting-compass', kind: 'singular' },
  molddesign: { vi: 'Thông tin thiết kế', jp: '設計情報', icon: 'fas fa-ruler-combined', kind: 'singular' },
  customers: { vi: 'Khách hàng', jp: '顧客情報', icon: 'fas fa-user-tie', kind: 'singular' },
  moldcutter: { vi: 'Liên kết khuôn - dao', jp: '型・抜型連携', icon: 'fas fa-link', kind: 'list' },
  trays: { vi: 'Khay', jp: 'トレイ情報', icon: 'fas fa-box-open', kind: 'singular' },
  companies: { vi: 'Công ty', jp: '会社情報', icon: 'fas fa-building', kind: 'singular' },
  employees: { vi: 'Nhân viên liên quan', jp: '関連担当者', icon: 'fas fa-users', kind: 'list' },
  jobs: { vi: 'Job / Sản phẩm', jp: 'ジョブ情報', icon: 'fas fa-briefcase', kind: 'singular' },
  worklog: { vi: 'Nhật ký công việc', jp: '作業ログ', icon: 'fas fa-clipboard-list', kind: 'list' },
  processingdeadline: { vi: 'Hạn xử lý', jp: '加工期限', icon: 'fas fa-hourglass-half', kind: 'list' }
};

function s(v) { return v === null || v === undefined ? '' : String(v); }
function t(v) { return s(v).trim(); }
function low(v) { return t(v).toLowerCase(); }
function esc(v) { return s(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function clone(v) { try { return JSON.parse(JSON.stringify(v || {})); } catch (e) { return {}; } }
function iso() { try { return new Date().toISOString(); } catch (e) { return ''; } }
function normalizeType(v) { return low(v) === 'cutter' ? 'cutter' : 'mold'; }
function normalizeTable(v) { var x = low(v); return x === 'tray' ? 'trays' : x; }
function uniq(arr) { var memo = {}, out = []; (arr || []).forEach(function (x) { x = t(x); if (!x || memo[x]) return; memo[x] = 1; out.push(x); }); return out; }
function eq(a, b) { try { return JSON.stringify(a || {}) === JSON.stringify(b || {}); } catch (e) { return false; } }
function genId(prefix) { return String(prefix || 'ID') + Date.now() + Math.random().toString(36).slice(2, 6).toUpperCase(); }
function rows(data, key) { return Array.isArray(data && data[key]) ? data[key] : []; }
function filenameForTable(table) { return TABLE_TO_FILENAME[normalizeTable(table)] || ''; }

function storageAvailable() {
  if (storageOkCache !== null) return storageOkCache;
  try {
    var k = '__dp_ext_storage_test__';
    global.localStorage.setItem(k, '1');
    global.localStorage.removeItem(k);
    storageOkCache = true;
  } catch (e) {
    storageOkCache = false;
  }
  return storageOkCache;
}

function loadStore() {
  if (storageAvailable()) {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return clone(storageMemo);
      var obj = JSON.parse(raw);
      if (!obj || typeof obj !== 'object') return clone(storageMemo);
      if (!Array.isArray(obj.items)) obj.items = [];
      storageMemo = { version: 1, items: obj.items };
      return clone(storageMemo);
    } catch (e) {
      return clone(storageMemo);
    }
  }
  return clone(storageMemo);
}

function saveStore(store) {
  storageMemo = { version: 1, items: Array.isArray(store && store.items) ? store.items : [] };
  if (storageAvailable()) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(storageMemo));
      return true;
    } catch (e) {}
  }
  return true;
}

function listDrafts(store, recordKey) {
  return (store && store.items ? store.items : []).filter(function (x) { return t(x.recordKey) === t(recordKey); });
}

function draftsOfSection(drafts, sectionKey) {
  return (drafts || []).filter(function (x) { return t(x.sectionKey) === t(sectionKey); });
}

function upsertDraft(store, draft) {
  var idx = -1;
  var items = store.items || [];
  for (var i = 0; i < items.length; i++) {
    var x = items[i];
    if (t(x.recordKey) === t(draft.recordKey) && t(x.sectionKey) === t(draft.sectionKey) && low(x.table) === low(draft.table) && t(x.idfield) === t(draft.idfield) && t(x.key) === t(draft.key)) {
      idx = i;
      break;
    }
  }
  if (idx >= 0) items[idx] = draft;
  else items.unshift(draft);
}

function removeDraft(store, recordKey, table, key, idfield) {
  store.items = (store.items || []).filter(function (x) {
    return !(t(x.recordKey) === t(recordKey) && low(x.table) === low(table) && t(x.key) === t(key) && t(x.idfield) === t(idfield));
  });
}

function removeDraftSection(store, recordKey, sectionKey) {
  store.items = (store.items || []).filter(function (x) {
    return !(t(x.recordKey) === t(recordKey) && t(x.sectionKey) === t(sectionKey));
  });
}

function removeDraftRecord(store, recordKey) {
  store.items = (store.items || []).filter(function (x) { return t(x.recordKey) !== t(recordKey); });
}

function notify(msg, kind) {
  var m = t(msg);
  if (!m) return;
  var k = kind || 'info';
  try {
    if (global.notify) {
      if (k === 'success' && typeof global.notify.success === 'function') return global.notify.success(m);
      if (k === 'error' && typeof global.notify.error === 'function') return global.notify.error(m);
      if (k === 'warning' && typeof global.notify.warning === 'function') return global.notify.warning(m);
      if (typeof global.notify.info === 'function') return global.notify.info(m);
    }
  } catch (e1) {}
  try {
    if (global.NotificationModule && typeof global.NotificationModule.show === 'function') return global.NotificationModule.show(m, k);
  } catch (e2) {}
  try { global.alert(m); } catch (e3) {}
}

function byId(arr, idField, idValue) {
  var id = t(idValue);
  for (var i = 0; i < (arr || []).length; i++) {
    if (t(arr[i] && arr[i][idField]) === id) return arr[i];
  }
  return null;
}

function detectIdField(table, row) {
  var pref = ID_FIELD_PREF[normalizeTable(table)] || '';
  if (row && pref && row[pref] !== undefined) return pref;
  var ks = row ? Object.keys(row) : [];
  if (pref && ks.indexOf(pref) >= 0) return pref;
  for (var i = 0; i < ks.length; i++) if (/id$/i.test(ks[i])) return ks[i];
  return pref || 'id';
}

function stripRow(row) {
  var out = {};
  Object.keys(row || {}).forEach(function (k) {
    var v = row[k];
    if (v === null || v === undefined) { out[k] = ''; return; }
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') { out[k] = String(v); return; }
  });
  return out;
}

function formatDateInput(v) {
  var x = t(v);
  if (!x) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return x;
  try {
    var d = new Date(x);
    if (isNaN(d.getTime())) return x;
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  } catch (e) { return x; }
}

function formatDateView(v) { return formatDateInput(v) || t(v); }

function rowLabel(row, idField) {
  if (!row) return '';
  var code = t(row.MoldCode || row.CutterNo || row.CustomerCode || row.CompanyCode || row.TrayCode || row.EmployeeCode || row.JobNumber || row.OrderNumber || row.WorkType);
  var name = t(row.MoldName || row.CutterName || row.CustomerShortName || row.CustomerName || row.CompanyShortName || row.CompanyName || row.TrayName || row.EmployeeName || row.Name || row.JobName);
  var id = t(idField ? row[idField] : '');
  if (code && name && code !== name) return code + ' — ' + name;
  return name || code || id;
}

function getFieldLabels(k) {
  var m = {
    MoldID:['金型ID','Mold ID'], MoldCode:['金型コード','Mã khuôn'], MoldName:['金型名','Tên khuôn'],
    CutterID:['抜型ID','Cutter ID'], CutterNo:['抜型番号','Mã dao cắt'], CutterName:['抜型名','Tên dao cắt'],
    CustomerID:['顧客ID','Khách hàng'], CompanyID:['会社ID','Công ty'], storagecompany:['保管会社','Công ty lưu kho'],
    TrayID:['トレイID','Khay'], MoldDesignID:['設計ID','Thiết kế'], JobID:['ジョブID','Job'], EmployeeID:['担当者ID','Nhân viên'],
    RackLayerID:['棚段ID','Tầng kệ'], WorkDate:['作業日','Ngày làm'], WorkType:['作業内容','Loại công việc'], DeadlineDate:['期限日','Ngày hạn'],
    Notes:['メモ','Ghi chú'], MoldNotes:['金型メモ','Ghi chú khuôn'], LocationNotes:['位置メモ','Ghi chú vị trí'],
    CustomerName:['顧客名','Tên khách hàng'], CustomerShortName:['略称','Tên ngắn'], CompanyName:['会社名','Tên công ty'], CompanyShortName:['会社略称','Tên ngắn công ty'],
    TrayName:['トレイ名','Tên khay'], TrayCode:['トレイコード','Mã khay'], TrayCapacity:['容量','Sức chứa'], EmployeeName:['担当者名','Tên nhân viên'], Name:['名称','Tên'],
    JobName:['ジョブ名','Tên job'], OrderNumber:['注文番号','Mã đơn hàng'], JobNumber:['ジョブ番号','Mã job'], DeliveryDeadline:['納期','Hạn giao'], DueDate:['期限','Hạn'],
    MoldDesignLength:['長さ','Dài'], MoldDesignWidth:['幅','Rộng'], MoldDesignHeight:['高さ','Cao'], MoldDesignDim:['寸法','Kích thước'],
    CutlineX:['刃長X','Cutline X'], CutlineY:['刃長Y','Cutline Y'], WorkLogID:['作業ログID','Worklog ID'], ProcessingDeadlineID:['期限ID','Deadline ID'], MoldCutterID:['連携ID','ID liên kết'],
    CustomerTrayName:['客先トレイ名称','Tên SP (KH)'], CustomerDrawingNo:['客先図面番号','Bản vẽ (KH)'], CustomerEquipmentNo:['客先設備番号','Thiết bị (KH)'], TrayWeight:['トレイ重量','Trọng lượng khay']
  };
  return m[k] ? { jp: m[k][0], vi: m[k][1] } : { jp: k, vi: k };
}

function selectRows(ctx, fieldKey) {
  var data = ctx && ctx.data ? ctx.data : (global.DataManager && global.DataManager.data ? global.DataManager.data : {});
  var k = t(fieldKey);
  if (k === 'CustomerID') return { kind:'select', id:'CustomerID', rows:rows(data,'customers') };
  if (k === 'CompanyID' || k === 'storagecompany' || k === 'CurrentCompanyID') return { kind:'select', id:'CompanyID', rows:rows(data,'companies') };
  if (k === 'TrayID') return { kind:'select', id:'TrayID', rows:rows(data,'trays') };
  if (k === 'MoldDesignID' || k === 'CutterDesignID') return { kind:'select', id:'MoldDesignID', rows:rows(data,'molddesign') };
  if (k === 'RackLayerID' || k === 'currentRackLayer') return { kind:'select', id:'RackLayerID', rows:rows(data,'racklayers') };
  if (k === 'JobID') return { kind:'select', id:'JobID', rows:rows(data,'jobs') };
  if (k === 'EmployeeID' || k === 'CurrentUserID') return { kind:'select', id:'EmployeeID', rows:rows(data,'employees') };
  if (k === 'MoldID') return { kind:'select', id:'MoldID', rows:rows(data,'molds') };
  if (k === 'CutterID') return { kind:'select', id:'CutterID', rows:rows(data,'cutters') };
  if (k === 'ProcessingItemID') return { kind:'select', id:'ProcessingItemID', rows:rows(data,'processingitems') };
  return { kind:'', id:'', rows:[] };
}

function fieldType(k) {
  if (k === 'MoldOnCheckList' || k === 'MoldReturning' || k === 'MoldDisposing') return 'bool';
  if (/Notes$/i.test(k) || k === 'notes' || k === 'LocationNotes' || k === 'MoldNotes') return 'textarea';
  if (/Date|Deadline/i.test(k)) return 'date';
  if (selectRows(null, k).kind) return 'select';
  return 'text';
}

function displayValue(ctx, fieldKey, raw) {
  var v = t(raw);
  if (!v) return '';
  var sel = selectRows(ctx, fieldKey);
  if (sel.kind && sel.id) {
    var row = byId(sel.rows, sel.id, v);
    if (row) {
      var label = rowLabel(row, sel.id);
      if (label && label !== v) return v + ' — ' + label;
    }
  }
  if (/Date|Deadline/i.test(fieldKey)) return formatDateView(v);
  return v;
}

function orderedFields(table, row) {
  var actual = Object.keys(stripRow(row || {}));
  var pref = FIELD_PREF[normalizeTable(table)] || [];
  var out = [];
  var idf = detectIdField(table, row || {});
  if (actual.indexOf(idf) >= 0) out.push(idf);
  pref.forEach(function (k) { if (actual.indexOf(k) >= 0 && out.indexOf(k) < 0) out.push(k); });
  actual.forEach(function (k) {
    if (out.indexOf(k) >= 0) return;
    if (/^display|Info$|Class$|Badge$|currentStatus|related/i.test(k)) return;
    out.push(k);
  });
  return out.slice(0, 24);
}

function recordKey(dp) {
  var it = dp && dp.currentItem ? dp.currentItem : {};
  var type = normalizeType(dp && dp.currentItemType ? dp.currentItemType : (it.type || it.itemType));
  var id = type === 'cutter' ? t(it.CutterID || it.CutterNo || it.code) : t(it.MoldID || it.MoldCode || it.code);
  return type + ':' + id;
}

function buildContext(dp) {
  var data = global.DataManager && global.DataManager.data ? global.DataManager.data : {};
  var item = dp && dp.currentItem ? dp.currentItem : {};
  var type = normalizeType(dp && dp.currentItemType ? dp.currentItemType : (item.type || item.itemType));
  var baseRow = null;
  if (type === 'cutter') {
    baseRow = byId(rows(data,'cutters'), 'CutterID', item.CutterID);
    if (!baseRow) rows(data,'cutters').some(function (x) { if (t(x.CutterNo) === t(item.CutterNo)) { baseRow = x; return true; } return false; });
  } else {
    baseRow = byId(rows(data,'molds'), 'MoldID', item.MoldID);
    if (!baseRow) rows(data,'molds').some(function (x) { if (t(x.MoldCode) === t(item.MoldCode)) { baseRow = x; return true; } return false; });
  }
  var designId = t((baseRow && baseRow.MoldDesignID) || item.MoldDesignID || (item.designInfo && item.designInfo.MoldDesignID));
  var design = byId(rows(data,'molddesign'), 'MoldDesignID', designId);
  var customerId = t((baseRow && baseRow.CustomerID) || item.CustomerID || (item.customerInfo && item.customerInfo.CustomerID));
  var trayId = t((baseRow && baseRow.TrayID) || item.TrayID || (design && design.TrayID));
  var jobId = t((baseRow && baseRow.JobID) || item.JobID || (item.jobInfo && item.jobInfo.JobID));
  var customer = byId(rows(data,'customers'), 'CustomerID', customerId);
  var companyId = t((customer && customer.CompanyID) || (baseRow && (baseRow.storagecompany || baseRow.CompanyID || baseRow.CurrentCompanyID)) || item.storagecompany || item.CompanyID);
  var company = byId(rows(data,'companies'), 'CompanyID', companyId);
  var tray = byId(rows(data,'trays'), 'TrayID', trayId);
  var job = byId(rows(data,'jobs'), 'JobID', jobId);
  if (!job && designId) rows(data,'jobs').some(function (x) { if (t(x.MoldDesignID) === designId) { job = x; return true; } return false; });
  var moldId = t((baseRow && baseRow.MoldID) || item.MoldID);
  var cutterId = t((baseRow && baseRow.CutterID) || item.CutterID);
  var worklogs = rows(data,'worklog').filter(function (x) { return type === 'cutter' ? t(x.CutterID) === cutterId : t(x.MoldID) === moldId; }).sort(function (a, b) { return t(b.WorkDate).localeCompare(t(a.WorkDate)); });
  var processingdeadline = rows(data,'processingdeadline').filter(function (x) { return (designId && t(x.MoldDesignID) === designId) || (jobId && t(x.JobID) === jobId); }).sort(function (a, b) { return t(b.DeadlineDate).localeCompare(t(a.DeadlineDate)); });
  var moldcutter = rows(data,'moldcutter').filter(function (x) {
    if (type === 'cutter') return (cutterId && t(x.CutterID) === cutterId) || (designId && t(x.MoldDesignID) === designId);
    return (moldId && t(x.MoldID) === moldId) || (designId && t(x.MoldDesignID) === designId);
  });
  var employeeIds = [];
  worklogs.forEach(function (x) { if (t(x.EmployeeID)) employeeIds.push(t(x.EmployeeID)); });
  if (job && t(job.EmployeeID)) employeeIds.push(t(job.EmployeeID));
  if (job && t(job.CurrentUserID)) employeeIds.push(t(job.CurrentUserID));
  if (baseRow && t(baseRow.CurrentUserID)) employeeIds.push(t(baseRow.CurrentUserID));
  employeeIds = uniq(employeeIds);
  var employees = rows(data,'employees').filter(function (x) { return employeeIds.indexOf(t(x.EmployeeID)) >= 0; });
  return {
    data: data,
    dp: dp,
    item: item,
    type: type,
    primary: type === 'cutter' ? 'cutters' : 'molds',
    baseRow: baseRow,
    design: design,
    customer: customer,
    company: company,
    tray: tray,
    job: job,
    worklog: worklogs,
    processingdeadline: processingdeadline,
    moldcutter: moldcutter,
    employees: employees,
    ids: { moldId:moldId, cutterId:cutterId, designId:designId, customerId:customerId, companyId:companyId, trayId:trayId, jobId:jobId },
    recordKey: recordKey(dp)
  };
}

function buildSections(ctx) {
  return [
    { key: ctx.primary, table: ctx.primary, kind: 'singular', row: ctx.baseRow, allowAdd:false },
    { key: 'molddesign', table: 'molddesign', kind: 'singular', row: ctx.design, allowAdd:false },
    { key: 'customers', table: 'customers', kind: 'singular', row: ctx.customer, allowAdd:false },
    { key: 'moldcutter', table: 'moldcutter', kind: 'list', rows: ctx.moldcutter, allowAdd:true },
    { key: 'trays', table: 'trays', kind: 'singular', row: ctx.tray, allowAdd:false },
    { key: 'companies', table: 'companies', kind: 'singular', row: ctx.company, allowAdd:false },
    { key: 'employees', table: 'employees', kind: 'list', rows: ctx.employees, allowAdd:false },
    { key: 'jobs', table: 'jobs', kind: 'singular', row: ctx.job, allowAdd:false },
    { key: 'worklog', table: 'worklog', kind: 'list', rows: ctx.worklog, allowAdd:true },
    { key: 'processingdeadline', table: 'processingdeadline', kind: 'list', rows: ctx.processingdeadline, allowAdd:true }
  ];
}

function defaultActiveSection(ctx, drafts) {
  var candidate = ctx.primary;
  (drafts || []).some(function (x) { if (t(x.sectionKey)) { candidate = t(x.sectionKey); return true; } return false; });
  return candidate;
}

function sectionNote(sectionKey) {
  if (sectionKey === 'employees') return 'Nhân viên được lấy từ job và worklog đang liên quan.';
  if (sectionKey === 'worklog') return 'Bấm Sửa để chỉnh một dòng cũ, hoặc Thêm mới để tạo dòng mới.';
  if (sectionKey === 'processingdeadline') return 'Mỗi dòng là một mốc hạn xử lý gắn với thiết kế.';
  if (sectionKey === 'moldcutter') return 'Danh sách liên kết khuôn - dao cắt liên quan tới thiết bị đang mở.';
  return 'Bấm Sửa để nhập thay đổi. Chỉ cập nhật lên hệ thống khi bấm Cập nhật ở thanh trên cùng.';
}

function singularDraft(section, row, sectionDrafts) {
  if (!row) return null;
  var idf = detectIdField(section.table, row);
  var key = t(row[idf]);
  for (var i = 0; i < (sectionDrafts || []).length; i++) {
    if (t(sectionDrafts[i].idfield) === t(idf) && t(sectionDrafts[i].key) === key) return sectionDrafts[i];
  }
  return null;
}

function applyDraft(row, draft) {
  var out = clone(stripRow(row || {}));
  if (draft && draft.fields) Object.keys(draft.fields).forEach(function (k) { out[k] = s(draft.fields[k]); });
  if (draft && draft.idfield) out[draft.idfield] = draft.key;
  if (draft) { out.__draft = 1; out.__draftOp = draft.op || 'update'; }
  return out;
}

function overlayList(section, baseRows, sectionDrafts) {
  var out = [];
  (baseRows || []).forEach(function (row) {
    var idf = detectIdField(section.table, row);
    var key = t(row && row[idf]);
    var hit = null;
    (sectionDrafts || []).forEach(function (d) { if (t(d.idfield) === t(idf) && t(d.key) === key) hit = d; });
    var view = applyDraft(row, hit);
    view.__idf = idf;
    view.__key = key;
    out.push(view);
  });
  (sectionDrafts || []).forEach(function (d) {
    if (d.op !== 'insert') return;
    var row = clone(d.fields || {});
    row[d.idfield] = d.key;
    row.__draft = 1;
    row.__draftOp = 'insert';
    row.__idf = d.idfield;
    row.__key = d.key;
    out.unshift(row);
  });
  return out;
}

function addInitial(ctx, section) {
  var x = {};
  if (section.key === 'worklog') {
    x.WorkLogID = genId('WL');
    x.WorkDate = formatDateInput(iso());
    x.EmployeeID = '';
    x.WorkType = '';
    x.Notes = '';
    x.MoldID = ctx.ids.moldId;
    x.CutterID = ctx.ids.cutterId;
  }
  if (section.key === 'processingdeadline') {
    x.ProcessingDeadlineID = genId('PD');
    x.MoldDesignID = ctx.ids.designId;
    x.DeadlineDate = '';
    x.Notes = '';
  }
  if (section.key === 'moldcutter') {
    x.MoldCutterID = genId('MC');
    x.MoldDesignID = ctx.ids.designId;
    x.MoldID = ctx.ids.moldId;
    x.CutterID = ctx.ids.cutterId;
  }
  return x;
}

function listTitle(sectionKey, row) {
  if (sectionKey === 'worklog') return t(row.WorkDate) || t(row.WorkType) || 'Worklog';
  if (sectionKey === 'processingdeadline') return t(row.DeadlineDate) || 'Deadline';
  if (sectionKey === 'moldcutter') return t(row.CutterID || row.MoldID || row.MoldDesignID) || 'Liên kết';
  return rowLabel(row, row.__idf || detectIdField(sectionKey, row));
}

function listMeta(sectionKey, row) {
  if (sectionKey === 'worklog') return [displayValue(null, 'EmployeeID', row.EmployeeID) || 'Không có nhân viên', t(row.Notes)].filter(Boolean).join(' · ');
  if (sectionKey === 'processingdeadline') return [t(row.Notes), t(row.MoldDesignID)].filter(Boolean).join(' · ');
  if (sectionKey === 'moldcutter') return [t(row.MoldDesignID), t(row.MoldID), t(row.CutterID)].filter(Boolean).join(' · ');
  return [t(row.Department), t(row.Role), t(row.Email), t(row.Phone), t(row.Notes)].filter(Boolean).join(' · ');
}

function listEditFields(section, row) {
  if (section.key === 'employees') return orderedFields(section.table, row);
  var pref = FIELD_PREF[section.table] || [];
  var out = [];
  pref.forEach(function (k) {
    if (row && row[k] === undefined) return;
    if (section.key === 'worklog' && ['WorkLogID','MoldID','CutterID','EmployeeID','WorkDate','WorkType','Notes'].indexOf(k) >= 0) out.push(k);
    if (section.key === 'processingdeadline' && ['ProcessingDeadlineID','MoldDesignID','DeadlineDate','Notes'].indexOf(k) >= 0) out.push(k);
    if (section.key === 'moldcutter' && ['MoldCutterID','MoldDesignID','MoldID','CutterID'].indexOf(k) >= 0) out.push(k);
  });
  return out;
}

function renderButton(action, icon, text, cls, attrs) {
  return '<button type="button" class="ext-btn ' + esc(cls || '') + '" data-ext-action="' + esc(action) + '" ' + (attrs || '') + '><i class="' + esc(icon || '') + '"></i><span>' + esc(text || '') + '</span></button>';
}

function renderValue(ctx, fieldKey, value) {
  var shown = displayValue(ctx, fieldKey, value);
  if (!shown) return '<div class="ext-field-value empty">Chưa có dữ liệu</div>';
  var cls = 'ext-field-value';
  if (/Notes$/i.test(fieldKey) || fieldKey === 'notes' || fieldKey === 'LocationNotes' || fieldKey === 'MoldNotes') cls += ' multiline';
  if (/ID$/i.test(fieldKey) || fieldKey === 'storagecompany') cls += ' is-id';
  return '<div class="' + esc(cls) + '">' + esc(shown) + '</div>';
}

function renderInput(ctx, table, fieldKey, value, readonly) {
  var type = fieldType(fieldKey);
  var attrs = 'data-ext-input="1" data-field-key="' + esc(fieldKey) + '" data-field-type="' + esc(type) + '"' + (readonly ? ' readonly disabled' : '');
  if (type === 'select') {
    var sel = selectRows(ctx, fieldKey);
    var html = '<select class="ext-field-input ext-select" ' + attrs + '><option value="">-- Chọn --</option>';
    (sel.rows || []).forEach(function (r) {
      var idVal = t(r[sel.id]);
      var lbl = rowLabel(r, sel.id) || idVal;
      html += '<option value="' + esc(idVal) + '"' + (t(value) === idVal ? ' selected' : '') + '>' + esc(idVal + (lbl && lbl !== idVal ? ' — ' + lbl : '')) + '</option>';
    });
    html += '</select>';
    return html;
  }
  if (type === 'textarea') return '<textarea class="ext-field-input ext-textarea" ' + attrs + '>' + esc(t(value)) + '</textarea>';
  if (type === 'date') return '<input class="ext-field-input" type="date" ' + attrs + ' value="' + esc(formatDateInput(value)) + '">';
  if (type === 'bool') {
    var checked = low(value) === 'true' || low(value) === '1' || low(value) === 'yes';
    return '<div class="ext-field-bool"><label class="ext-field-bool-toggle"><input type="checkbox" ' + attrs + (checked ? ' checked' : '') + '><span class="ext-toggle-slider"></span></label><span class="ext-field-bool-text">' + (checked ? 'TRUE' : 'FALSE') + '</span></div>';
  }
  return '<input class="ext-field-input" type="text" ' + attrs + ' value="' + esc(t(value)) + '">';
}

function renderField(ctx, table, fieldKey, value, readonly, span2) {
  var labels = getFieldLabels(fieldKey);
  return '<div class="ext-field ' + (span2 ? 'span-2' : '') + '" data-readonly="' + (readonly ? '1' : '0') + '"><div class="ext-field-label"><span class="ext-field-label-jp">' + esc(labels.jp) + '</span><span class="ext-field-label-vi">' + esc(labels.vi) + '</span></div>' + renderValue(ctx, fieldKey, value) + renderInput(ctx, table, fieldKey, value, readonly) + '</div>';
}

function renderEmpty(sectionKey) {
  return '<div class="ext-empty"><i class="fas fa-inbox"></i><div class="ext-empty-text">Chưa có dữ liệu</div><div class="ext-empty-sub">' + esc(sectionNote(sectionKey)) + '</div></div>';
}

function renderSidebarItem(section, draftCount, active, noData, countText) {
  var meta = SECTION_META[section.key] || { vi: section.key, jp: section.key, icon: 'fas fa-folder' };
  var badge = '';
  if (countText) badge += countText;
  if (draftCount > 0) badge += '<span class="ext-section-badge draft">Nháp ' + draftCount + '</span>';
  else if (noData) badge += '<span class="ext-section-badge nodata">Trống</span>';
  return '<section class="ext-section ext-sidebar-item ' + (active ? 'is-active' : '') + '" data-section="' + esc(section.key) + '"><div class="ext-section-header" data-ext-action="select-section" data-section="' + esc(section.key) + '"><div class="ext-section-header-left"><div class="ext-section-icon"><i class="' + esc(meta.icon) + '"></i></div><div class="ext-section-title"><div class="ext-section-title-jp">' + esc(meta.jp) + '</div><div class="ext-section-title-vi">' + esc(meta.vi) + '</div></div></div><div class="ext-section-header-right">' + badge + '<i class="fas fa-chevron-right ext-section-chevron"></i></div></div></section>';
}

function renderSingular(ctx, state, section, draftItems) {
  var editing = state.editor && state.editor.kind === 'section' && state.editor.sectionKey === section.key;
  var draft = singularDraft(section, section.row, draftItems);
  var viewRow = section.row ? applyDraft(section.row, draft) : null;
  var idf = section.row ? detectIdField(section.table, section.row) : (ID_FIELD_PREF[section.table] || 'id');
  var actions = '<div class="ext-section-actions">';
  if (section.row && !editing) actions += renderButton('start-section-edit', 'fas fa-pen', 'Sửa', 'edit', 'data-section="' + esc(section.key) + '"');
  if (editing) actions += renderButton('save-section-edit', 'fas fa-check', 'Lưu', 'save', 'data-section="' + esc(section.key) + '"') + renderButton('cancel-editor', 'fas fa-rotate-left', 'Hủy', 'cancel', '');
  if (draft) actions += renderButton('clear-section-draft', 'fas fa-trash', 'Bỏ nháp', 'danger', 'data-section="' + esc(section.key) + '"');
  actions += '</div>';
  if (!viewRow) return actions + renderEmpty(section.key) + '<div class="ext-info-note"><i class="fas fa-circle-info"></i><span>' + esc(sectionNote(section.key)) + '</span></div>';
  var ks = orderedFields(section.table, viewRow);
  var grid = '<div data-ext-editor-active="' + (editing ? '1' : '0') + '" data-ext-editor-kind="section"><div class="ext-field-grid">';
  ks.forEach(function (k) {
    var readonly = k === idf;
    var span2 = /Notes$/i.test(k) || k === 'notes' || k === 'LocationNotes' || k === 'MoldNotes';
    grid += renderField(ctx, section.table, k, viewRow[k], readonly, span2);
  });
  grid += '</div></div>';
  return actions + grid + '<div class="ext-info-note"><i class="fas fa-circle-info"></i><span>' + esc(sectionNote(section.key)) + '</span></div>';
}

function renderListEditor(ctx, section, row, isAdd) {
  var fields = listEditFields(section, row);
  var html = '<div class="ext-add-form is-open" data-ext-editor-active="1" data-ext-editor-kind="' + (isAdd ? 'add' : 'row') + '"><div class="ext-add-form-title"><i class="fas fa-pen"></i><span>' + esc(isAdd ? 'Nhập mới' : 'Sửa dòng') + '</span></div><div class="ext-add-form-fields">';
  var idf = detectIdField(section.table, row || {});
  fields.forEach(function (k) {
    var readonly = (k === idf) || (isAdd && ((section.key === 'worklog' && (k === 'MoldID' || k === 'CutterID')) || (section.key === 'processingdeadline' && k === 'MoldDesignID') || (section.key === 'moldcutter' && (k === 'MoldID' || k === 'MoldDesignID' || (ctx.type === 'cutter' && k === 'CutterID')))));
    var labels = getFieldLabels(k);
    html += '<div class="ext-form-field ' + ((/Notes$/i.test(k) || k === 'notes') ? 'span-2' : '') + '"><div class="ext-form-label"><span class="ext-form-label-jp">' + esc(labels.jp) + '</span><span class="ext-form-label-vi">' + esc(labels.vi) + '</span></div>' + renderInput(ctx, section.table, k, row[k], readonly).replace(/ext-field-input/g, 'ext-form-input').replace(/ext-field-bool-text/g, 'ext-field-bool-text') + '</div>';
  });
  html += '</div><div class="ext-add-form-actions">' + renderButton(isAdd ? 'save-add-row' : 'save-row-edit', 'fas fa-check', 'Lưu', 'save', 'data-section="' + esc(section.key) + '"') + renderButton('cancel-editor', 'fas fa-rotate-left', 'Hủy', 'cancel', '') + '</div></div>';
  return html;
}

function renderList(ctx, state, section, draftItems) {
  var editingRow = state.editor && state.editor.kind === 'row' && state.editor.sectionKey === section.key ? t(state.editor.rowKey) : '';
  var adding = state.editor && state.editor.kind === 'add' && state.editor.sectionKey === section.key;
  var viewRows = overlayList(section, section.rows || [], draftItems);
  var actions = '<div class="ext-section-actions">';
  if (section.allowAdd) actions += renderButton('start-add-row', 'fas fa-plus', 'Thêm mới', 'add', 'data-section="' + esc(section.key) + '"');
  if (draftItems.length) actions += renderButton('clear-section-draft', 'fas fa-trash', 'Bỏ nháp section', 'danger', 'data-section="' + esc(section.key) + '"');
  actions += '</div>';
  var html = actions;
  if (adding) html += renderListEditor(ctx, section, addInitial(ctx, section), true);
  if (!viewRows.length) html += renderEmpty(section.key);
  else {
    html += '<div class="ext-list">';
    viewRows.forEach(function (row) {
      var key = t(row.__key || row[(row.__idf || detectIdField(section.table, row))]);
      var idf = row.__idf || detectIdField(section.table, row);
      var meta = listMeta(section.key, row);
      var isEditing = editingRow && editingRow === key;
      html += '<div class="ext-list-item"><div class="ext-list-item-icon"><i class="fas fa-file-lines"></i></div><div class="ext-list-item-body"><div class="ext-list-item-title">' + esc(listTitle(section.key, row) || key) + '</div><div class="ext-list-item-meta">' + esc(meta || ' ') + '</div>' + (isEditing ? renderListEditor(ctx, section, row, false) : '') + '</div><div class="ext-list-item-actions">' + renderButton('start-row-edit', 'fas fa-pen', 'Sửa', 'edit icon-only', 'data-section="' + esc(section.key) + '" data-key="' + esc(key) + '" data-idfield="' + esc(idf) + '"') + (row.__draft ? renderButton('clear-row-draft', 'fas fa-trash', 'Bỏ', 'danger icon-only', 'data-section="' + esc(section.key) + '" data-key="' + esc(key) + '" data-idfield="' + esc(idf) + '"') : '') + '</div></div>';
    });
    html += '</div>';
  }
  html += '<div class="ext-info-note"><i class="fas fa-circle-info"></i><span>' + esc(sectionNote(section.key)) + '</span></div>';
  return html;
}

function currentEditorSnapshot(root) {
  var active = root.querySelector('[data-ext-editor-active="1"]');
  if (!active) return {};
  var out = {};
  var nodes = active.querySelectorAll('[data-ext-input="1"]');
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    var key = el.getAttribute('data-field-key') || '';
    var type = el.getAttribute('data-field-type') || 'text';
    var val = type === 'bool' ? (el.checked ? 'TRUE' : 'FALSE') : t(el.value);
    out[key] = val;
  }
  return out;
}

function hasDirtyEditor(root, state) {
  if (!state.editor) return false;
  return !eq(currentEditorSnapshot(root), state.editor.initial || {});
}

function confirmDiscard(root, state) {
  if (!hasDirtyEditor(root, state)) return true;
  return !!global.confirm('Bạn có thay đổi chưa lưu trong vùng đang sửa. Bỏ thay đổi này?');
}

function prepareDiff(baseRow, values) {
  var diff = {};
  Object.keys(values || {}).forEach(function (k) { if (t(values[k]) !== t(baseRow && baseRow[k])) diff[k] = values[k]; });
  return diff;
}

function normalizeForSave(values) {
  var out = {};
  Object.keys(values || {}).forEach(function (k) { out[k] = values[k] === null || values[k] === undefined ? '' : String(values[k]); });
  return out;
}

function readSectionValues(root) { return normalizeForSave(currentEditorSnapshot(root)); }

function findViewRowForEdit(section, drafts, key, idfield) {
  var draftItems = draftsOfSection(drafts, section.key);
  var list = overlayList(section, section.rows || [], draftItems);
  for (var i = 0; i < list.length; i++) if (t(list[i][idfield]) === t(key)) return list[i];
  return null;
}

function render(dp, container, state) {
  state.ctx = buildContext(dp);
  state.store = loadStore();
  state.drafts = listDrafts(state.store, state.ctx.recordKey);
  var sections = buildSections(state.ctx);
  state.sections = {};
  sections.forEach(function (x) { state.sections[x.key] = x; });
  if (!state.activeSection || !state.sections[state.activeSection]) state.activeSection = defaultActiveSection(state.ctx, state.drafts);
  var activeSection = state.sections[state.activeSection] || sections[0];
  if (!activeSection) {
    container.innerHTML = '<div class="dp-ext-editor"><div class="ext-error-block"><i class="fas fa-triangle-exclamation"></i><span>Không tìm thấy dữ liệu cho tab Mở rộng.</span></div></div>';
    return;
  }
  var savingText = state.isSaving ? 'Đang cập nhật...' : 'Cập nhật';
  var html = '<div class="dp-ext-editor"><div class="ext-commit-bar"><div class="ext-commit-bar-left"><div class="ext-commit-title">Mở rộng / Extended</div><div class="ext-commit-sub">Sửa ở cột phải, sau đó bấm Cập nhật.</div><span class="ext-commit-badge" data-count="' + state.drafts.length + '">' + state.drafts.length + '</span></div><div class="ext-commit-bar-right">' + renderButton('discard-record-drafts', 'fas fa-trash', 'Xóa nháp', 'secondary', (state.drafts.length ? '' : 'disabled')) + '<button type="button" class="ext-commit-btn primary" data-ext-action="commit-all" ' + (state.isSaving || !state.drafts.length ? 'disabled' : '') + '><i class="fas ' + esc(state.isSaving ? 'fa-spinner fa-spin' : 'fa-cloud-upload-alt') + '"></i><span class="label-text">' + esc(savingText) + ' (' + state.drafts.length + ')</span></button></div></div>';
  html += '<div class="ext-workspace"><aside class="ext-workspace-left"><div class="ext-sections ext-sections-sidebar">';
  sections.forEach(function (section) {
    var d = draftsOfSection(state.drafts, section.key);
    var countTag = '';
    if (section.kind === 'list') countTag = '<span class="ext-count-tag">' + ((section.rows || []).length + d.filter(function (x) { return x.op === 'insert'; }).length) + '</span>';
    html += renderSidebarItem(section, d.length, state.activeSection === section.key, section.kind === 'singular' ? !section.row : !(section.rows || []).length, countTag);
  });
  html += '</div></aside><section class="ext-workspace-right' + (state.isMobileModalOpen ? ' is-mobile-open' : '') + '"><section class="ext-section ext-detail-card is-open ' + ((state.editor && state.editor.sectionKey === activeSection.key) ? 'is-editing ' : '') + ((draftsOfSection(state.drafts, activeSection.key).length) ? 'has-draft' : '') + '" data-section="' + esc(activeSection.key) + '">';
  html += '<div class="ext-section-header ext-detail-head"><div class="ext-section-header-left">' + renderButton('close-mobile-modal', 'fas fa-arrow-left', '', 'ext-modal-back-btn', '') + '<div class="ext-section-icon"><i class="' + esc((SECTION_META[activeSection.key] || {}).icon || 'fas fa-folder') + '"></i></div><div class="ext-section-title"><div class="ext-section-title-jp">' + esc((SECTION_META[activeSection.key] || {}).jp || activeSection.key) + '</div><div class="ext-section-title-vi">' + esc((SECTION_META[activeSection.key] || {}).vi || activeSection.key) + '</div></div></div><div class="ext-section-header-right">' + (draftsOfSection(state.drafts, activeSection.key).length ? '<span class="ext-section-badge draft">Nháp ' + draftsOfSection(state.drafts, activeSection.key).length + '</span>' : '') + '</div></div>';
  html += '<div class="ext-section-body ext-section-body-static">' + (activeSection.kind === 'singular' ? renderSingular(state.ctx, state, activeSection, draftsOfSection(state.drafts, activeSection.key)) : renderList(state.ctx, state, activeSection, draftsOfSection(state.drafts, activeSection.key))) + '</div></section></section></div></div>';
  container.innerHTML = html;
}

async function saveSectionDraft(root, state, sectionKey) {
  var section = state.sections[sectionKey];
  if (!section || !section.row) return;
  var base = stripRow(section.row);
  var idf = detectIdField(section.table, section.row);
  var key = t(section.row[idf]);
  var values = readSectionValues(root);
  var diff = prepareDiff(base, values);
  if (!Object.keys(diff).length) {
    removeDraftSection(state.store, state.ctx.recordKey, sectionKey);
    saveStore(state.store);
    state.editor = null;
    state.isMobileModalOpen = false; // Tự đóng Popup
    notify('Không có thay đổi. Đã xóa nháp cũ nếu có.', 'info');
    render(state.ctx.dp, root, state);
    return;
  }
  upsertDraft(state.store, { recordKey: state.ctx.recordKey, sectionKey: sectionKey, table: section.table, idfield: idf, key: key, op: 'update', fields: diff, savedAt: iso() });
  saveStore(state.store);
  state.editor = null;
  state.isMobileModalOpen = false; // Tự đóng Popup
  notify('Đã lưu nháp section ' + ((SECTION_META[sectionKey] || {}).vi || sectionKey) + '.', 'success');
  render(state.ctx.dp, root, state);
}

async function saveRowDraft(root, state) {
  var ed = state.editor;
  if (!ed) return;
  var section = state.sections[ed.sectionKey];
  if (!section) return;
  var values = readSectionValues(root);
  if (ed.kind === 'add' && ed.isInsert) {
    var key = t(values[ed.idfield]);
    if (!key) { notify('Thiếu ID của dòng mới.', 'warning'); return; }
    var fields = clone(values);
    delete fields[ed.idfield];
    upsertDraft(state.store, { recordKey: state.ctx.recordKey, sectionKey: ed.sectionKey, table: section.table, idfield: ed.idfield, key: key, op: 'insert', fields: fields, savedAt: iso() });
    saveStore(state.store);
    state.editor = null;
    state.isMobileModalOpen = false; // Tự đóng Popup
    notify('Đã lưu nháp dòng mới.', 'success');
    render(state.ctx.dp, root, state);
    return;
  }
  var diff = prepareDiff(ed.base || {}, values);
  if (!Object.keys(diff).length) {
    removeDraft(state.store, state.ctx.recordKey, section.table, ed.rowKey, ed.idfield);
    saveStore(state.store);
    state.editor = null;
    state.isMobileModalOpen = false; // Tự đóng Popup
    notify('Không có thay đổi. Đã bỏ nháp của dòng này.', 'info');
    render(state.ctx.dp, root, state);
    return;
  }
  delete diff[ed.idfield];
  upsertDraft(state.store, { recordKey: state.ctx.recordKey, sectionKey: ed.sectionKey, table: section.table, idfield: ed.idfield, key: ed.rowKey, op: 'update', fields: diff, savedAt: iso() });
  saveStore(state.store);
  state.editor = null;
  state.isMobileModalOpen = false; // Tự đóng Popup
  notify('Đã lưu nháp dòng chỉnh sửa.', 'success');
  render(state.ctx.dp, root, state);
}

async function postBatch(items) {
  var res;
  try {
    res = await fetch(API_BATCH_APPLY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items })
    });
  } catch (networkErr) {
    throw new Error('Không gọi được server ghi dữ liệu ' + API_BATCH_APPLY + '. Hãy kiểm tra server-v8.2.8.js đang chạy và cổng đang là 3000.');
  }
  var json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  if (!res.ok || !json || json.success === false) throw new Error(json && json.message ? json.message : ('HTTP ' + res.status));
  return json;
}

async function postSingleUpsert(draft) {
  var filename = filenameForTable(draft.table);
  if (!filename) throw new Error('Không có file CSV cho bảng ' + draft.table);
  var res;
  try {
    res = await fetch(API_SINGLE_UPSERT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: filename, idField: draft.idfield, idValue: draft.key, updates: draft.fields, mode: draft.op === 'insert' ? 'insert' : 'update' })
    });
  } catch (networkErr) {
    throw new Error('Không gọi được server ghi dữ liệu ' + API_SINGLE_UPSERT + '.');
  }
  var json = null;
  try { json = await res.json(); } catch (e) { json = null; }
  if (!res.ok || !json || json.success === false) throw new Error(json && json.message ? json.message : ('HTTP ' + res.status));
  return json;
}

async function postSingleUpsertRaw(payload, networkErrorMessage) {
var res;
try {
res = await fetch(API_SINGLE_UPSERT, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(payload || {})
});
} catch (networkErr) {
throw new Error(networkErrorMessage || 'Không gọi được server ghi dữ liệu.');
}

var json = null;
try { json = await res.json(); } catch (e) { json = null; }

if (!res.ok || !json || json.success === false) {
throw new Error(json && json.message ? json.message : ('HTTP ' + res.status));
}

return json;
}

function findLiveRowForDraft(state, draft) {
var data = state && state.ctx ? state.ctx.data : null;
var table = normalizeTable(draft && draft.table);
var idField = t(draft && draft.idfield);
var idValue = t(draft && draft.key);
if (!data || !table || !idField || !idValue) return null;
return byId(rows(data, table), idField, idValue);
}

function historyRowsForState(state, key){
  var data = state && state.ctx ? state.ctx.data : null
  return Array.isArray(data && data[key]) ? data[key] : []
}

function trimHistoryValue(v){
  return v === null || v === undefined ? '' : String(v).trim()
}

function findLatestAccessCommitForTable(state, table){
  var rows = historyRowsForState(state, 'accesscommithistory')
  var tableName = trimHistoryValue(table).toLowerCase()
  var hit = null

  for (var i = 0; i < rows.length; i++) {
    var row = rows[i] || {}
    if (trimHistoryValue(row.TableName).toLowerCase() !== tableName) continue
    if (!hit || trimHistoryValue(row.CommitAt) > trimHistoryValue(hit.CommitAt)) hit = row
  }

  return hit
}

function buildInsertRowFromDraft(draft) {
var row = clone(draft && draft.fields ? draft.fields : {});
if (draft && draft.idfield) row[draft.idfield] = s(draft.key);
return row;
}

function buildChangeRowsForDraft(draft, state, batchCommitId, changedAt) {
var out = [];
var isInsert = t(draft && draft.op) === 'insert';
var liveRow = findLiveRowForDraft(state, draft);
var source = isInsert ? buildInsertRowFromDraft(draft) : clone(draft && draft.fields ? draft.fields : {});
var baseCommit = findLatestAccessCommitForTable(state, draft && draft.table)

Object.keys(source).forEach(function(fieldName) {
if (!fieldName) return;

var oldValue = isInsert ? '' : s(liveRow && liveRow[fieldName]);
var newValue = s(source[fieldName]);

if (!isInsert && oldValue === newValue) return;
if (isInsert && fieldName !== draft.idfield && newValue === '') return;

out.push({
DataChangeID: genId('DCH'),
TableName: normalizeTable(draft.table),
RecordID: s(draft.key),
RecordIDField: s(draft.idfield),
FieldName: s(fieldName),
OldValue: oldValue,
NewValue: newValue,
ChangedAt: s(changedAt),
ChangedBy: '',
BaseValueAtEdit: oldValue,
BaseCommitID: trimHistoryValue(baseCommit && baseCommit.AccessCommitID),
BaseCommitAt: trimHistoryValue(baseCommit && baseCommit.CommitAt),
ChangeSource: 'extended_editor',

ChangeNote: 'batch=' + s(batchCommitId) + '; op=' + (isInsert ? 'insert' : 'update'),
IsConflict: 'FALSE',
ResolvedValue: '',
ResolvedAt: '',
ResolvedBy: ''
});
});

return out;
}

async function writeDataChangeHistoryForDraft(draft, state, batchCommitId, changedAt) {
var historyRows = buildChangeRowsForDraft(draft, state, batchCommitId, changedAt);

for (var i = 0; i < historyRows.length; i++) {
await postSingleUpsertRaw({
filename: DATA_CHANGE_HISTORY_FILE,
idField: 'DataChangeID',
idValue: historyRows[i].DataChangeID,
updates: historyRows[i],
mode: 'insert'
}, 'Không gọi được server ghi datachangehistory.csv.');
}

return historyRows.length;
}

async function commitAll(root, state) {
if (state.isSaving) return;

if (state.editor && hasDirtyEditor(root, state)) {
notify('Hãy bấm Lưu hoặc Hủy vùng đang sửa trước khi cập nhật.', 'warning');
return;
}

state.store = loadStore();
state.drafts = listDrafts(state.store, state.ctx.recordKey);

if (!state.drafts.length) {
notify('Không có nháp cập nhật.', 'info');
return;
}

state.isSaving = true;
render(state.ctx.dp, root, state);

var payloadItems = state.drafts.map(function (d) {
return {
table: d.table,
op: d.op === 'insert' ? 'insert' : 'update',
idfield: d.idfield,
key: d.key,
fields: d.fields
};
});

var okDrafts = [];
var mainFail = [];
var historyFail = [];
var batchCommitId = genId('ACM');
var commitAt = iso();

try {
try {
await postBatch(payloadItems);
okDrafts = state.drafts.slice();
} catch (batchErr) {
var batchMsg = t(batchErr && batchErr.message);

if (/404|Cannot POST|not found/i.test(batchMsg)) {
for (var i = 0; i < state.drafts.length; i++) {
try {
await postSingleUpsert(state.drafts[i]);
okDrafts.push(state.drafts[i]);
} catch (singleErr) {
mainFail.push({
draft: state.drafts[i],
message: t(singleErr && singleErr.message) || 'Lỗi không rõ'
});
}
}
} else {
throw batchErr;
}
}

for (var j = 0; j < okDrafts.length; j++) {
try {
await writeDataChangeHistoryForDraft(okDrafts[j], state, batchCommitId, commitAt);
} catch (historyErr1) {
historyFail.push({
type: 'datachangehistory',
draft: okDrafts[j],
message: t(historyErr1 && historyErr1.message) || 'Lỗi ghi datachangehistory.csv'
});
}
}


okDrafts.forEach(function (d) {
removeDraft(state.store, state.ctx.recordKey, d.table, d.key, d.idfield);
});

saveStore(state.store);
state.editor = null;

try {
if (global.DataManager && typeof global.DataManager.loadAllData === 'function') {
await global.DataManager.loadAllData();
} else if (global.DataManager && typeof global.DataManager.recompute === 'function') {
global.DataManager.recompute();
}
} catch (e2) {}

state.isSaving = false;
try {
  if (global.DetailPanel && typeof global.DetailPanel.open === 'function') {
    global.DetailPanel.open(state.ctx.dp.currentItem, state.ctx.dp.currentItemType, { skipHistory: true, restoreTab: 'extended' });
  } else {
    render(state.ctx.dp, root, state);
  }
} catch (e3) {
  render(state.ctx.dp, root, state);
}

if (!mainFail.length && !historyFail.length) {
notify('Đã cập nhật thành công ' + okDrafts.length + ' thay đổi và đã ghi log.', 'success');
return;
}

if (okDrafts.length && historyFail.length && !mainFail.length) {
notify('Đã cập nhật dữ liệu chính ' + okDrafts.length + ' thay đổi, nhưng lỗi ghi log: ' + historyFail[0].message, 'warning');
return;
}

if (okDrafts.length && mainFail.length) {
var msg = 'Đã cập nhật ' + okDrafts.length + ' thay đổi';
msg += ', còn ' + mainFail.length + ' thay đổi lỗi. ' + mainFail[0].message;
if (historyFail.length) msg += ' | Log: ' + historyFail[0].message;
notify(msg, 'warning');
return;
}

if (mainFail.length) {
notify('Cập nhật thất bại. ' + mainFail[0].message, 'error');
return;
}

notify('Cập nhật thất bại. Lỗi không rõ.', 'error');
} catch (e) {
state.isSaving = false;
render(state.ctx.dp, root, state);
notify('Cập nhật thất bại. ' + (e && e.message ? e.message : 'Lỗi không rõ'), 'error');
}
}


function bindEvents(container, state) {
  if (container.dataset.extEditorBound) return;
  container.dataset.extEditorBound = '1';
  container.addEventListener('click', function (e) {
    var btn = e.target && e.target.closest ? e.target.closest('[data-ext-action]') : null;
    if (!btn) return;
    var act = btn.getAttribute('data-ext-action');
    var sectionKey = btn.getAttribute('data-section');
    var root = container;

    if (['save-section-edit','save-row-edit','save-add-row','cancel-editor','commit-all'].indexOf(act) < 0) {
      if (state.editor && act !== 'select-section' && !confirmDiscard(root, state)) return;
    }

    if (act === 'select-section') {
      var nextSection = btn.getAttribute('data-section');
      if (state.editor && state.editor.sectionKey !== nextSection && !confirmDiscard(root, state)) return;
      state.activeSection = nextSection;
      state.editor = null;
      state.isMobileModalOpen = true; // Bật Modal Mode
      render(state.ctx.dp, root, state);
      return;
    }
    
    // Đóng Modal trên Mobile
    if (act === 'close-mobile-modal') {
      state.isMobileModalOpen = false; // Tắt Modal Mode
      render(state.ctx.dp, root, state);
      return;
    }

    if (act === 'start-section-edit') {
      var sec = state.sections[sectionKey];
      if (!sec || !sec.row) return;
      state.activeSection = sectionKey;
      var draft = singularDraft(sec, sec.row, draftsOfSection(state.drafts, sectionKey));
      var viewRow = applyDraft(sec.row, draft);
      var vals = {};
      orderedFields(sec.table, viewRow).forEach(function (k) { vals[k] = fieldType(k) === 'date' ? formatDateInput(viewRow[k]) : t(viewRow[k]); });
      state.editor = { kind:'section', sectionKey:sectionKey, initial:vals, base:stripRow(sec.row) };
      render(state.ctx.dp, root, state);
      return;
    }

    if (act === 'save-section-edit') { saveSectionDraft(root, state, sectionKey); return; }

    if (act === 'clear-section-draft') {
      if (!global.confirm('Xóa toàn bộ nháp của section này?')) return;
      removeDraftSection(state.store, state.ctx.recordKey, sectionKey);
      saveStore(state.store);
      state.editor = null;
      render(state.ctx.dp, root, state);
      notify('Đã xóa nháp của section.', 'success');
      return;
    }

    if (act === 'start-row-edit') {
      var sec2 = state.sections[sectionKey];
      if (!sec2) return;
      state.activeSection = sectionKey;
      var key = btn.getAttribute('data-key');
      var idfield = btn.getAttribute('data-idfield') || detectIdField(sec2.table, {});
      var row = findViewRowForEdit(sec2, state.drafts, key, idfield);
      if (!row) return;
      var vals2 = {};
      listEditFields(sec2, row).forEach(function (k) { vals2[k] = fieldType(k) === 'date' ? formatDateInput(row[k]) : t(row[k]); });
      state.editor = { kind:'row', sectionKey:sectionKey, rowKey:key, idfield:idfield, initial:vals2, base:stripRow(row), isInsert: !!(row.__draft && row.__draftOp === 'insert') };
      render(state.ctx.dp, root, state);
      return;
    }

    if (act === 'save-row-edit') { saveRowDraft(root, state); return; }

    if (act === 'start-add-row') {
      var sec3 = state.sections[sectionKey];
      if (!sec3) return;
      state.activeSection = sectionKey;
      var init = addInitial(state.ctx, sec3);
      state.editor = { kind:'add', sectionKey:sectionKey, idfield:detectIdField(sec3.table, init), initial:clone(init), base:null, isInsert:true };
      render(state.ctx.dp, root, state);
      return;
    }

    if (act === 'save-add-row') { saveRowDraft(root, state); return; }

    if (act === 'cancel-editor') {
      if (hasDirtyEditor(root, state) && !global.confirm('Bỏ thay đổi đang nhập?')) return;
      state.editor = null;
      render(state.ctx.dp, root, state);
      return;
    }

    if (act === 'clear-row-draft') {
      var sec4 = state.sections[sectionKey];
      if (!sec4) return;
      var key2 = btn.getAttribute('data-key');
      var idfield2 = btn.getAttribute('data-idfield') || detectIdField(sec4.table, {});
      if (!global.confirm('Xóa nháp của dòng này?')) return;
      removeDraft(state.store, state.ctx.recordKey, sec4.table, key2, idfield2);
      saveStore(state.store);
      state.editor = null;
      render(state.ctx.dp, root, state);
      notify('Đã xóa nháp của dòng.', 'success');
      return;
    }

    if (act === 'discard-record-drafts') {
      if (!state.drafts.length) return;
      if (!global.confirm('Xóa toàn bộ nháp của thiết bị đang mở?')) return;
      removeDraftRecord(state.store, state.ctx.recordKey);
      saveStore(state.store);
      state.editor = null;
      render(state.ctx.dp, root, state);
      notify('Đã xóa toàn bộ nháp của record hiện tại.', 'success');
      return;
    }

    if (act === 'commit-all') { commitAll(root, state); return; }
  }, true);

  container.addEventListener('change', function (e) {
    var boolInput = e.target && e.target.closest ? e.target.closest('[data-ext-input="1"][data-field-type="bool"]') : null;
    if (!boolInput) return;
    var wrap = boolInput.closest('.ext-field-bool') || boolInput.closest('.ext-form-field');
    if (!wrap) return;
    var label = wrap.querySelector('.ext-field-bool-text');
    if (label) label.textContent = boolInput.checked ? 'TRUE' : 'FALSE';
  }, true);
}

function bind(dp, container) {
  if (!container) return;
  var state = container.dpExtState || { editor:null, store:loadStore(), drafts:[], isSaving:false, ctx:null, sections:{}, activeSection:'', isMobileModalOpen:false };
  var prevKey = state.ctx && state.ctx.recordKey ? state.ctx.recordKey : '';
  var nextKey = recordKey(dp);
  if (prevKey !== nextKey) {
    state.editor = null;
    state.activeSection = '';
  }
  container.dpExtState = state;
  bindEvents(container, state);
  render(dp, container, state);
}

function refresh(dp, container) { bind(dp, container); }
function renderShell() { return '<div class="dp-ext-editor"></div>'; }

var ExtendedModule = { version: VERSION, render: renderShell, bind: bind, refresh: refresh };
if (!global.DetailPanelTabModules || typeof global.DetailPanelTabModules !== 'object') global.DetailPanelTabModules = {};
global.DetailPanelTabModules.extended = ExtendedModule;
global.DPExtendedEditor = ExtendedModule;
try { document.dispatchEvent(new CustomEvent('dp-extended-editor-ready', { detail: { version: VERSION } })); } catch (e) {}
try { console.log('dp-extended-editor ' + VERSION + ' loaded'); } catch (e2) {}

})(window);

// server-v8.2.7.js
// MoldCutterSearch Backend - GitHub CSV storage
// Based on server-v8.2.5.js
// Improvements (v8.2.6):
// - NEW: Dynamic CSV write endpoints for real table writes (read headers from CSV file itself)
// - NEW: Apply Extended Editor overlay batch to GitHub CSV with strict header validation
// - Safety: File whitelist, deny TEMP-* keys, deny unknown fields (400 + list), require file exists
// - Keeps all legacy endpoints unchanged for backward compatibility

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const { Octokit } = require('@octokit/rest');
const csvParser = require('csv-parser');
const stream = require('stream');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const corsOptions = {
  origin: function (origin, cb) {
    if (!origin || origin === 'null') return cb(null, true);
    return cb(null, true);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'], // Bổ sung Authorization để gọi JWT
  maxAge: 86400
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(bodyParser.json({ limit: '4mb' }));

// ============================================
// BẢO MẬT & XÁC THỰC (JWT MIDDLEWARE)
// ============================================
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; // Bắt buộc dùng service_role để bypass RLS truy cập user_roles
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';
const supabaseServerClient = (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;

// RAM Cache Proxy Data
const proxyFileCache = new Map();
let serverStartTime = Date.now();
let globalDataVersion = serverStartTime;
let _hasEvictedChanges = false;

// =============== DELTA SYNC ENGINE ===============
const recentChanges = [];
const MAX_CHANGES = 1000;
function pushDeltaEvent(filename, idField, idValue, payload) {
  const table = String(filename || '').replace(/\.csv$/i, '');
  recentChanges.push({
    version: Date.now(),
    table,
    idField,
    idValue,
    payload
  });
  if (recentChanges.length > MAX_CHANGES) {
    recentChanges.shift();
    _hasEvictedChanges = true;
  }
}
// =================================================

function invalidateDataCache() { proxyFileCache.clear(); console.log('[Cache] Data Cache Invalidated'); }

async function jwtAuthMiddleware(req, res, next) {
  // 1. Pass public endpoints
  if (req.path.startsWith('/health') || req.path.startsWith('/csv/read/') || (req.path.startsWith('/sync/') && req.method === 'GET')) {
    return next();
  }

  // 2. Kiểm tra format token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization token' });
  }

  try {
    const token = authHeader.split(' ')[1];
    // Decode = process.env.SUPABASE_JWT_SECRET
    if (!SUPABASE_JWT_SECRET) throw new Error("Server missing SUPABASE_JWT_SECRET");
    const decoded = jwt.verify(token, SUPABASE_JWT_SECRET);
    req.user = decoded; // => { sub: uid, email, ... }
  } catch (err) {
    return res.status(401).json({ error: 'Invalid, revoked or expired token', details: err.message });
  }

  // 3. Truy vấn Role nóng trên bảng user_roles (Xóa quyền tức thì)
  // Lấy role từ JWT làm base
  const rawRole = req.user.app_metadata?.role
    || req.user.user_metadata?.role
    || req.user.role
  const jwtRole = rawRole === 'admin' ? 'admin' : 'viewer'

  if (!supabaseServerClient) {
    req.user.role = jwtRole; // Safety fallback
  } else {
    try {
      const { data: roleData, error } = await supabaseServerClient
        .from('user_roles')
        .select('role_name')
        .eq('user_id', req.user.sub)
        .single();

      // Ưu tiên DB, nếu bảng db trả về lỗi/không có thì lấy JWT role
      req.user.role = (roleData && roleData.role_name) ? roleData.role_name : jwtRole;
    } catch (e) {
      req.user.role = jwtRole;
    }
  }

  // 4. Áp Dụng Endpoint Security (Block Viewer write operations)
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
    if (req.user.role === 'viewer') {
      return res.status(403).json({ error: `Access Denied (403): Viewers do not have write permissions. Debug: jwtRole='${jwtRole}', FinalRole='${req.user.role}'` });
    }
  }

  next();
}

// KHÓA TOÀN BỘ API 
app.use('/api', jwtAuthMiddleware);

// ENDPOINT: Background Sync Check
app.get('/api/sync/check-version', (req, res) => {
  return res.json({ version: globalDataVersion });
});

// ENDPOINT: Force Clear Backend Cache
app.post('/api/sync/clear-cache', (req, res) => {
  invalidateDataCache();
  return res.json({ success: true, message: 'Backend proxy cache cleared' });
});

// ENDPOINT: Delta Sync API
app.get('/api/sync/delta', (req, res) => {
  try {
    const since = parseInt(req.query.since || '0', 10);
    // Nếu since = 0, hoặc server mới restart, hoặc mảng bị tràn (mất bớt delta cũ)
    if (!since || since === 0 || since < serverStartTime || (_hasEvictedChanges && recentChanges.length > 0 && since < recentChanges[0].version)) {
      return res.json({ fullReload: true, version: globalDataVersion, changes: [] });
    }
    const changes = recentChanges.filter(c => c.version > since);
    return res.json({ fullReload: false, version: globalDataVersion, changes });
  } catch (e) {
    return res.json({ fullReload: true, version: globalDataVersion, changes: [] });
  }
});

// ENDPOINT: Nấp (Proxy) GitHub Caching
app.get('/api/csv/read/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    // Tối ưu tốc độ: Trả Cache RAM nếu có
    if (proxyFileCache.has(filename)) {
      return res.send(proxyFileCache.get(filename).content);
    }

    // Gọi lên GitHub (An toàn vì ẩn link gốc đi)
    const fileContentReq = await octokit.repos.getContent({
      owner,
      repo,
      path: DATA_PATH_PREFIX + filename,
      ref: branch
    });

    const content = Buffer.from(fileContentReq.data.content, 'base64').toString('utf8');
    proxyFileCache.set(filename, { content, timestamp: Date.now() });
    return res.type('text/csv').send(content);
  } catch (e) {
    console.error('[Proxy Read]', e.message);
    return res.status(404).json({ error: 'File not found or protected' });
  }
});

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner = process.env.GITHUB_OWNER || 'toanysd';
const repo = 'MoldCutterSearch';
const branch = process.env.GITHUB_BRANCH || 'main';
const DATA_PATH_PREFIX = 'data/';

// ============================================
// TIMEZONE CONFIGURATION (JST = UTC+9)
// ============================================
function getJSTTimestamp() {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jstTime = new Date(now.getTime() + jstOffset);
  return jstTime.toISOString();
}

function getJSTDate() {
  return getJSTTimestamp().split('T')[0];
}

console.log('[Server] Timezone helpers loaded (JST = UTC+9)');

// ========================================
// FILE HEADERS (Legacy endpoints only)
// ========================================


const FILE_HEADERS = {
  'locationlog.csv': ['LocationLogID', 'OldRackLayer', 'NewRackLayer', 'MoldID', 'CutterID', 'notes', 'EmployeeID', 'DateEntry'],

  'shiplog.csv': ['ShipID', 'CustomerID', 'ItemTypeID', 'ShipItemName', 'ShipDate', 'ToCompanyID', 'FromCompanyID', 'ShipItemType', 'ShipStatus', 'FromCompany', 'ToCompany', 'MoldID', 'CutterID', 'FrameID', 'OtherEquipID', 'WaterBaseID', 'ShipNotes', 'DateEntry', 'handler', 'EmployeeID'],

  'usercomments.csv': [
    'UserCommentID', 'ItemID', 'ItemType', 'CommentText',
    'EmployeeID', 'DateEntry', 'CommentStatus',
    'CommentType', 'Priority', 'UpdatedAt'
  ],

  'cutters.csv': ['CutterID', 'CutterNo', 'CutterName', 'CutterDesignCode', 'CutterCode', 'CustomerID', 'MoldDesignID', 'MoldShared', 'ItemTypeID', 'RackLayerID', 'KeeperCompany', 'CutterNote', 'CutterDetail', 'CutterManufactureDate', 'SatoCode', 'SatoCodeDate', 'Description', 'UsageStatus', 'BladeCount', 'CutterPresence', 'Pitch', 'PlasticCutType', 'PostCutLength', 'PostCutWidth', 'CutlineLength', 'CutlineWidth', 'CutterLength', 'CutterWidth', 'CutterHeight', 'CutterThickness', 'CutterCorner', 'CutterChamfer', 'CutterType', 'CutterDim', 'PPcushionUse', 'CutterEntry', 'CutterMasterID'],

  'molds.csv': [
    'MoldID', 'MoldName', 'MoldCode', 'CustomerID', 'TrayID', 'MoldDesignID',
    'KeeperCompany', 'RackLayerID', 'ItemTypeID',
    'MoldLengthModified', 'MoldWidthModified', 'MoldHeightModified',
    'MoldWeight', 'MoldNotes', 'MoldUsageStatus', 'MoldOnCheckList',
    'JobID', 'MoldReturning', 'MoldReturnedDate', 'MoldDisposing',
    'MoldDisposedDate', 'MoldEntry'
  ],


  'statuslogs.csv': ['StatusLogID', 'MoldID', 'CutterID', 'ItemType', 'Status', 'Timestamp', 'EmployeeID', 'DestinationID', 'Notes', 'AuditDate', 'AuditType', 'SessionID', 'SessionName', 'SessionMode'],

  'teflonlog.csv': ['TeflonLogID', 'MoldID', 'TeflonStatus', 'RequestedBy', 'RequestedDate', 'ApprovedBy', 'ApprovedDate', 'SentBy', 'SentDate', 'ExpectedDate', 'ReceivedDate', 'SupplierID', 'CoatingType', 'Reason', 'TeflonCost', 'Quality', 'TeflonNotes', 'CreatedDate', 'UpdatedBy', 'UpdatedAt'],

  'scraplog.csv': ['ScrapLogID', 'MoldID', 'CutterID', 'RequestedDate', 'Status', 'ScrapMethod', 'CompanyID', 'ScheduledDate', 'Cost', 'ScrappedDate', 'EmployeeID', 'Notes'],

  'destinations.csv': ['DestinationID', 'DestinationName', 'DestinationCode', 'CompanyID', 'Address', 'Notes'],

  'cav.csv': ['CAVCode', 'Serial', 'CAV', 'CAVlength', 'CAVwidth', 'CAVnote'],

  'processingdeadline.csv': ['ProcessingDeadlineID', 'MoldDesignID', 'DeadlineDate', 'Notes'],

  'processingstatus.csv': ['ProcessingStatusID', 'StatusName', 'StatusCode', 'Notes'],

  'itemtype.csv': ['ItemTypeID', 'ItemTypeName', 'ItemTypeCode', 'Notes'],

  'plasticforforming.csv': ['PlasticID', 'PlasticName', 'PlasticCode', 'Notes'],

  'machiningcustomer.csv': ['MachiningCustomerID', 'CustomerName', 'CustomerCode', 'Notes'],

  'trays.csv': ['TrayID', 'TrayName', 'TrayCode', 'TrayCapacity', 'Notes'],

  'worklog.csv': ['WorkLogID', 'MoldID', 'CutterID', 'EmployeeID', 'WorkDate', 'WorkType', 'Notes'],
  'datachangehistory.csv': ['DataChangeID', 'TableName', 'RecordID', 'RecordIDField', 'FieldName', 'OldValue', 'NewValue', 'ChangedAt', 'ChangedBy', 'BaseValueAtEdit', 'BaseCommitID', 'BaseCommitAt', 'ChangeSource', 'ChangeNote', 'IsConflict', 'ResolvedValue', 'ResolvedAt', 'ResolvedBy'],

  'accesscommithistory.csv': ['AccessCommitID', 'TableName', 'Filename', 'CommitSHA', 'CommitAt', 'CommitBy', 'CommitMessage', 'RowCount', 'FileChecksum', 'ImportSource', 'ImportNote'],

  'plastic_master.csv': ['plastic_id', 'plastic_code', 'plastic_family', 'plastic_subtype', 'thickness_mm', 'width_mm', 'standard_length_m', 'color_code_raw', 'color_name_normalized', 'electrical_property', 'silicone_status_normalized', 'additive_flags', 'additive_text_raw', 'appearance_text_raw', 'an_code_raw', 'an_meaning_normalized', 'si_code_raw', 'ab_code_raw', 'status_review', 'remarks_raw', 'is_active', 'created_by', 'created_at', 'updated_at'],
  'plastic_manufacturer_map.csv': ['manufacturer_map_id', 'commercial_grade_code', 'supplier_name', 'plastic_id', 'plastic_family', 'plastic_subtype', 'color_name_normalized', 'electrical_property', 'silicone_status_normalized', 'mapping_status', 'confidence_score', 'note_vi', 'status_review', 'created_by', 'created_at', 'updated_at'],
  'plastic_receipt.csv': ['receipt_id', 'receipt_no', 'receipt_date', 'supplier_name', 'invoice_no', 'delivery_note_no', 'status', 'notes', 'created_by', 'created_at', 'updated_at'],
  'plastic_receipt_roll.csv': ['receipt_roll_id', 'receipt_id', 'plastic_id', 'commercial_grade_code', 'supplier_name', 'lot_no', 'thickness_mm', 'width_mm', 'nominal_length_m', 'received_length_m', 'current_length_m', 'warehouse_location', 'roll_status', 'notes', 'mapped_by', 'mapped_at', 'created_by', 'created_at', 'updated_at'],
  'plastic_adjustment_log.csv': ['adjustment_log_id', 'receipt_roll_id', 'change_type', 'change_length_m', 'before_length_m', 'after_length_m', 'reason_note', 'reference_type', 'reference_id', 'created_by', 'created_at'],
  'plastic_usage_plan.csv': ['usage_plan_id', 'plan_no', 'plan_date', 'production_order_no', 'mold_id', 'tray_id', 'product_code', 'customer_name', 'plastic_id', 'planned_length_m', 'planned_qty', 'plan_status', 'note', 'created_by', 'created_at', 'updated_at'],
  'plastic_usage_plan_roll.csv': ['usage_plan_roll_id', 'usage_plan_id', 'receipt_roll_id', 'reserved_length_m', 'priority_no', 'note', 'created_at', 'updated_at'],
  'plastic_usage_actual.csv': ['usage_actual_id', 'usage_plan_id', 'receipt_roll_id', 'actual_used_length_m', 'actual_remaining_length_m', 'waste_length_m', 'report_time', 'reported_by', 'machine_id', 'production_shift', 'note', 'adj_log_id', 'created_at'],
  'plastic_inventory_snapshot.csv': ['inventory_snapshot_id', 'snapshot_no', 'snapshot_date', 'warehouse_area', 'status', 'note', 'created_by', 'created_at', 'updated_at'],
  'plastic_inventory_count_line.csv': ['inventory_count_line_id', 'inventory_snapshot_id', 'receipt_roll_id', 'system_length_m', 'counted_length_m', 'variance_length_m', 'count_result', 'count_note', 'adj_log_id', 'counted_by', 'counted_at', 'created_at']

};

// ========================================
// Allowed CSV whitelist (dynamic endpoints)
// ========================================
const ALLOWED_CSV_FILES = new Set([
  // Core / relationships
  'molds.csv',
  'cutters.csv',
  'customers.csv',
  'molddesign.csv',
  'moldcutter.csv',
  'racks.csv',
  'racklayers.csv',
  'companies.csv',
  'employees.csv',
  'jobs.csv',
  'processingitems.csv',
  'cav.csv',
  'destinations.csv',

  // Logs
  'statuslogs.csv',
  'shiplog.csv',
  'locationlog.csv',
  'usercomments.csv',
  'teflonlog.csv',
  'scraplog.csv',

  // New tables (you confirmed these exist on GitHub)
  'processingdeadline.csv',
  'processingstatus.csv',
  'itemtype.csv',
  'plasticforforming.csv',
  'machiningcustomer.csv',
  'trays.csv',
  'worklog.csv',

  // Core tables
  'molds.csv',
  'cutters.csv',
  'customers.csv',
  'molddesign.csv',
  'moldcutter.csv',
  'racks.csv',
  'racklayers.csv',
  'companies.csv',
  'employees.csv',
  'jobs.csv',
  'processingitems.csv',
  'destinations.csv',

  // Logs
  'statuslogs.csv',
  'shiplog.csv',
  'locationlog.csv',
  'usercomments.csv',
  'teflonlog.csv',
  'scraplog.csv',

  // History tables
  'datachangehistory.csv',
  'accesscommithistory.csv',

  // Plastic Module (WMS)
  'plastic_master.csv',
  'plastic_manufacturer_map.csv',
  'plastic_supplier.csv',
  'plastic_manufacturer_grade.csv',
  'plastic_pricing.csv',
  'plastic_receipt.csv',
  'plastic_receipt_roll.csv',
  'plastic_adjustment_log.csv',
  'plastic_usage_plan.csv',
  'plastic_usage_plan_roll.csv',
  'plastic_usage_actual.csv',
  'plastic_inventory_snapshot.csv',
  'plastic_inventory_count_line.csv'
]);

// Optional: allow adding more CSV via env without editing code
// CSV_ALLOWED_EXTRA example: "table1.csv,table2.csv"
try {
  const extra = String(process.env.CSV_ALLOWED_EXTRA || '').trim();
  if (extra) {
    extra.split(',').map(s => String(s || '').trim()).filter(Boolean).forEach(fn => {
      if (/\.csv$/i.test(fn)) ALLOWED_CSV_FILES.add(fn);
    });
  }
} catch (e0) { }

const WRITABLE_CORE_FILES = new Set([
  'teflonlog.csv',
  'shiplog.csv',
  'statuslogs.csv',
  'locationlog.csv',
  'usercomments.csv',
  'scraplog.csv',
  'molds.csv',
  'cutters.csv',
  'molddesign.csv',
  'trays.csv',

  // Plastic Module writable
  'plastic_master.csv',
  'plastic_manufacturer_map.csv',
  'plastic_supplier.csv',
  'plastic_manufacturer_grade.csv',
  'plastic_pricing.csv',
  'plastic_receipt.csv',
  'plastic_receipt_roll.csv',
  'plastic_adjustment_log.csv',
  'plastic_usage_plan.csv',
  'plastic_usage_plan_roll.csv',
  'plastic_usage_actual.csv',
  'plastic_inventory_snapshot.csv',
  'plastic_inventory_count_line.csv'
]);

// TableKey -> filename mapping (for overlay apply)
const TABLE_KEY_TO_FILENAME = {
  molds: 'molds.csv',
  cutters: 'cutters.csv',
  customers: 'customers.csv',
  molddesign: 'molddesign.csv',
  moldcutter: 'moldcutter.csv',
  racks: 'racks.csv',
  racklayers: 'racklayers.csv',
  companies: 'companies.csv',
  employees: 'employees.csv',
  jobs: 'jobs.csv',
  processingitems: 'processingitems.csv',
  destinations: 'destinations.csv',

  // Logs
  statuslogs: 'statuslogs.csv',
  shiplog: 'shiplog.csv',
  locationlog: 'locationlog.csv',
  usercomments: 'usercomments.csv',
  teflonlog: 'teflonlog.csv',
  scraplogs: 'scraplog.csv',

  // New tables (keep web prefixes for new tables if still needed)
  processingdeadline: 'processingdeadline.csv',
  processingstatus: 'processingstatus.csv',
  itemtype: 'itemtype.csv',
  plasticforforming: 'plasticforforming.csv',
  machiningcustomer: 'machiningcustomer.csv',
  tray: 'trays.csv',
  trays: 'trays.csv',
  worklog: 'worklog.csv',
  datachangehistory: 'datachangehistory.csv',
  accesscommithistory: 'accesscommithistory.csv',

  // Plastic Module
  plastic_master: 'plastic_master.csv',
  plastic_manufacturer_map: 'plastic_manufacturer_map.csv',
  plastic_supplier: 'plastic_supplier.csv',
  plastic_manufacturer_grade: 'plastic_manufacturer_grade.csv',
  plastic_pricing: 'plastic_pricing.csv',
  plastic_receipt: 'plastic_receipt.csv',
  plastic_receipt_roll: 'plastic_receipt_roll.csv',
  plastic_adjustment_log: 'plastic_adjustment_log.csv',
  plastic_usage_plan: 'plastic_usage_plan.csv',
  plastic_usage_plan_roll: 'plastic_usage_plan_roll.csv',
  plastic_usage_actual: 'plastic_usage_actual.csv',
  plastic_inventory_snapshot: 'plastic_inventory_snapshot.csv',
  plastic_inventory_count_line: 'plastic_inventory_count_line.csv'
};


// ========================================
// Helpers: HTTP errors
// ========================================
function httpError(status, message, extra) {
  const e = new Error(String(message || 'Error'));
  e.httpStatus = status;
  if (extra !== undefined) e.extra = extra;
  return e;
}

function getHttpStatus(err) {
  try {
    if (err && Number.isFinite(err.httpStatus)) return err.httpStatus;
  } catch (e0) { }
  return null;
}

// ========================================
// Helpers: Retry for GitHub
// ========================================
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getGitHubStatusCode(err) {
  try {
    if (err && Number.isFinite(err.status)) return err.status;
    if (err && err.response && Number.isFinite(err.response.status)) return err.response.status;
  } catch (e0) { }
  return null;
}

function isRetryableGitHubError(err) {
  const st = getGitHubStatusCode(err);
  return st === 409 || st === 502 || st === 503 || st === 504 || st === 429;
}

async function updateCsvFileWithRetry(filename, commitMessage, mutateFn, opts = {}) {
  const maxRetry = Number.isFinite(opts.maxRetry) ? opts.maxRetry : 4;
  const filePath = `${DATA_PATH_PREFIX}${filename}`;
  const expectedHeaders = FILE_HEADERS[filename];
  if (!expectedHeaders) throw httpError(400, `File ${filename} not supported`);

  let lastErr = null;

  for (let attempt = 0; attempt < maxRetry; attempt++) {
    try {
      const fileData = await getGitHubFile(filePath);
      let records = await parseCsvText(fileData.content);

      const out = await mutateFn(records, expectedHeaders);
      if (out && Array.isArray(out.records)) records = out.records;

      const csvContent = convertToCsvText(records, expectedHeaders);
      await updateGitHubFile(filePath, csvContent, fileData.sha, commitMessage);

      return { success: true, attempt: attempt + 1 };
    } catch (err) {
      lastErr = err;

      // Non-GitHub errors from mutateFn should stop immediately
      if (getHttpStatus(err)) throw err;

      if (!isRetryableGitHubError(err) || attempt === maxRetry - 1) throw err;

      const st = getGitHubStatusCode(err);
      const base = 450 * (attempt + 1);
      const jitter = Math.floor(Math.random() * 250);
      console.log(`[SERVER] Retry ${filename} (attempt ${attempt + 2}/${maxRetry}), status=${st}, wait=${base + jitter}ms`);
      await sleep(base + jitter);
    }
  }

  throw lastErr || new Error('Retry failed');
}

// ========================================
// Helper functions: CSV
// ========================================
function parseCsvText(csvText) {
  return new Promise((resolve, reject) => {
    const results = [];
    if (!csvText || !String(csvText).trim()) {
      resolve(results);
      return;
    }

    const readableStream = stream.Readable.from(csvText);
    readableStream
      .pipe(csvParser({
        mapHeaders: ({ header }) => {
          let h = String(header || '').trim();
          if (h === 'MoldWeightModified') return 'MoldWeight';
          return h;
        }
      }))
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }
  return stringValue;
}

function convertToCsvText(records, headers) {
  if (!headers || headers.length === 0) throw new Error('Headers are required');
  const headerRow = headers.join(',');
  const dataRows = (Array.isArray(records) ? records : []).map(record =>
    headers.map(header => escapeCsvValue((record && record[header]) || '')).join(',')
  );
  return [headerRow, ...dataRows].join('\n') + '\n';
}

function stripBom(s) {
  const t = String(s || '');
  if (t.charCodeAt(0) === 0xFEFF) return t.slice(1);
  return t;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  const s = String(line || '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      if (inQuotes && s[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function extractHeadersFromCsvContent(csvText) {
  const text = stripBom(String(csvText || '')).replace(/\r/g, '');
  const idx = text.indexOf('\n');
  const headerLine = (idx >= 0 ? text.slice(0, idx) : text).trim();
  if (!headerLine) return [];

  const rawHeaders = splitCsvLine(headerLine);
  return rawHeaders.map(h => {
    const x = String(h || '').trim();
    const unq = x.replace(/^"/, '').replace(/"$/, '');
    return String(unq || '').trim();
  }).filter(Boolean);
}

// ========================================
// Helper functions: GitHub file ops
// ========================================
async function getGitHubFile(filePath) {
  try {
    console.log(`[SERVER] Fetching: ${filePath}`);
    const { data } = await octokit.repos.getContent({ owner, repo, path: filePath, ref: branch });

    if (data.type !== 'file') {
      throw new Error(`${filePath} is not a file`);
    }

    const content = data.content ? Buffer.from(data.content, 'base64').toString('utf-8') : '';
    console.log(`[SERVER] ✅ Fetched: ${filePath}`);
    return { content, sha: data.sha };
  } catch (error) {
    if (error && error.status === 404) {
      console.log(`[SERVER] File not found: ${filePath}`);
      return { content: '', sha: null };
    }
    throw error;
  }
}

async function updateGitHubFile(filePath, content, sha, message) {
  try {
    console.log(`[SERVER] Updating: ${filePath}`);
    const fn = filePath.replace('data/', '');
    proxyFileCache.delete(fn);
    console.log(`[SERVER] Removed Cache for: ${fn}`);

    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: filePath,
      message,
      content: Buffer.from(String(content || '')).toString('base64'),
      sha,
      branch
    });
    globalDataVersion = Date.now();
    console.log(`[SERVER] ✅ Updated: ${filePath} (New GlobalVersion: ${globalDataVersion})`);
  } catch (error) {
    console.error(`[SERVER] Error updating file:`, error && error.message ? error.message : error);
    throw error;
  }
}

// ========================================
// Helper: ID field by filename (legacy)
// ========================================
function getIdFieldByFilename(filename) {
  let fn = String(filename || '').trim().replace(/^web/, '');

  if (fn === 'teflonlog.csv') return 'TeflonLogID';
  if (fn === 'statuslogs.csv') return 'StatusLogID';
  if (fn === 'locationlog.csv') return 'LocationLogID';
  if (fn === 'shiplog.csv') return 'ShipID';
  if (fn === 'usercomments.csv') return 'UserCommentID';
  return null;
}


function genId(prefix) {
  return `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ========================================
// Helper: Validation / mapping
// ========================================
function normalizeTableKey(k) {
  const s = String(k || '').trim();
  const low = s.toLowerCase();
  if (low === 'racklayer') return 'racklayers';
  if (low === 'tray') return 'tray';
  if (low === 'trays') return 'trays';
  return s;
}

function tableKeyToFilename(tableKey) {
  const t0 = normalizeTableKey(tableKey);
  const keyLower = String(t0 || '').trim().toLowerCase();

  if (TABLE_KEY_TO_FILENAME[t0]) return TABLE_KEY_TO_FILENAME[t0];
  if (TABLE_KEY_TO_FILENAME[keyLower]) return TABLE_KEY_TO_FILENAME[keyLower];

  throw httpError(400, `Table key not mapped to web csv: ${tableKey}`);
}


function ensureAllowedFilename(filename) {
  const fn = String(filename || '').trim();
  if (!fn || !/\.csv$/i.test(fn)) throw httpError(400, 'filename must end with .csv');
  if (!ALLOWED_CSV_FILES.has(fn)) throw httpError(400, `CSV file not allowed: ${fn}`);
  return fn;
}

function ensureAllowedWebFilename(filename) {
  return ensureWritableFilename(filename);
}

function ensureWritableFilename(filename) {
  return ensureAllowedFilename(filename);
}

function isTempKey(v) {
  const s = String(v || '').trim();
  return s.toUpperCase().startsWith('TEMP-');
}

function pickUnknownFields(fieldsObj, allowedHeaders) {
  const allowed = new Set((allowedHeaders || []).map(h => String(h || '').trim()));
  const keys = Object.keys(fieldsObj || {});
  const unknown = [];
  for (const k of keys) {
    const kk = String(k || '').trim();
    if (!kk) continue;
    if (!allowed.has(kk)) unknown.push(kk);
  }
  return unknown;
}

function toSafeString(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

function normalizeMaybeId(v) {
  const s = String(v || '').trim();
  return s;
}

function getRackLayerTargetMetaFromBody(body) {
  const moldId = normalizeMaybeId(body && body.MoldID);
  const cutterId = normalizeMaybeId(body && body.CutterID);

  if (moldId) {
    return {
      tableName: 'molds',
      filename: 'molds.csv',
      idField: 'MoldID',
      idValue: moldId,
      legacyIdField: 'LegacyMoldID'
    };
  }

  if (cutterId) {
    return {
      tableName: 'cutters',
      filename: 'cutters.csv',
      idField: 'CutterID',
      idValue: cutterId,
      legacyIdField: 'LegacyCutterID'
    };
  }

  return null;
}

async function updateRackLayerTargetWithRetry(targetMeta, newRackLayer, employeeId) {
  if (!targetMeta || !targetMeta.filename || !targetMeta.idField || !targetMeta.idValue) {
    throw httpError(400, 'Missing target meta for RackLayer update');
  }

  const newRack = String(newRackLayer || '').trim();
  if (!newRack) throw httpError(400, 'New RackLayerID is required');

  const changedBy = String(employeeId || '').trim();

  await updateWebCsvFileWithRetry(
    targetMeta.filename,
    `Update ${targetMeta.filename} ${targetMeta.idField}=${targetMeta.idValue} RackLayerID ${getJSTDate()}`,
    async (records, headers) => {
      let found = false;
      const idVal = String(targetMeta.idValue).trim();

      records = (Array.isArray(records) ? records : []).map(r => {
        if (String((r && r[targetMeta.idField]) || '').trim() === idVal) {
          found = true;
          r.RackLayerID = newRack;
          if (headers.includes('UpdatedAt')) r.UpdatedAt = getJSTTimestamp();
          if (headers.includes('UpdatedBy')) r.UpdatedBy = changedBy;
        }
        return r;
      });

      if (!found) {
        const newRow = {};
        (headers || []).forEach(h => { newRow[h] = ''; });

        newRow[targetMeta.idField] = idVal;

        if (targetMeta.legacyIdField && headers.includes(targetMeta.legacyIdField) && !String(newRow[targetMeta.legacyIdField] || '').trim()) {
          newRow[targetMeta.legacyIdField] = idVal;
        }

        if (headers.includes('RackLayerID')) newRow.RackLayerID = newRack;
        if (headers.includes('UpdatedAt')) newRow.UpdatedAt = getJSTTimestamp();
        if (headers.includes('UpdatedBy')) newRow.UpdatedBy = changedBy;
        if (headers.includes('WebUUID') && !String(newRow.WebUUID || '').trim()) newRow.WebUUID = genId('WEBUUID');

        records.unshift(newRow);
      }

      const seen = new Set();
      records = records.filter(r => {
        const k = String((r && r[targetMeta.idField]) || '').trim();
        if (!k) return true;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

      return { records };
    },
    { maxRetry: 4, requireExisting: true }
  );
}

async function appendLocationHistoryEntry(targetMeta, oldRackLayer, newRackLayer, employeeId, changeSource, changeNote) {
  if (!targetMeta || !targetMeta.tableName || !targetMeta.idField || !targetMeta.idValue) return;

  const oldRack = String(oldRackLayer || '').trim();
  const newRack = String(newRackLayer || '').trim();

  if (!newRack || oldRack === newRack) return;

  const historyEntry = {
    DataChangeID: genId('DCH'),
    TableName: targetMeta.tableName,
    RecordID: String(targetMeta.idValue || ''),
    RecordIDField: String(targetMeta.idField || ''),
    FieldName: 'RackLayerID',
    OldValue: oldRack,
    NewValue: newRack,
    ChangedAt: getJSTTimestamp(),
    ChangedBy: String(employeeId || ''),
    BaseValueAtEdit: oldRack,
    BaseCommitID: '',
    BaseCommitAt: '',
    ChangeSource: String(changeSource || 'locationlog'),
    ChangeNote: String(changeNote || ''),
    IsConflict: 'FALSE',
    ResolvedValue: '',
    ResolvedAt: '',
    ResolvedBy: ''
  };

  await updateWebCsvFileWithRetry(
    'datachangehistory.csv',
    `Add history entry for ${targetMeta.tableName} ${targetMeta.idValue} RackLayerID ${getJSTDate()}`,
    async (records) => {
      records.unshift(historyEntry);
      return { records };
    },
    { maxRetry: 4, requireExisting: true }
  );
}

// ========================================
// Dynamic CSV writer with retry
// ========================================
async function updateCsvFileDynamicWithRetry(filename, commitMessage, mutateFn, opts = {}) {
  const maxRetry = Number.isFinite(opts.maxRetry) ? opts.maxRetry : 4;
  const requireExisting = (opts.requireExisting !== undefined) ? !!opts.requireExisting : true;

  const fn = ensureAllowedFilename(filename);
  const filePath = `${DATA_PATH_PREFIX}${fn}`;

  let lastErr = null;

  for (let attempt = 0; attempt < maxRetry; attempt++) {
    try {
      const fileData = await getGitHubFile(filePath);
      if (requireExisting && !fileData.sha) throw httpError(404, `CSV not found on GitHub: ${fn}`);

      const headers = extractHeadersFromCsvContent(fileData.content);
      if (!headers || headers.length === 0) {
        throw httpError(400, `CSV header row missing or empty: ${fn}`);
      }

      let records = await parseCsvText(fileData.content);

      const out = await mutateFn(records, headers);
      if (out && Array.isArray(out.records)) records = out.records;

      const csvContent = convertToCsvText(records, headers);
      await updateGitHubFile(filePath, csvContent, fileData.sha, commitMessage);

      return { success: true, attempt: attempt + 1, headersCount: headers.length };
    } catch (err) {
      lastErr = err;

      if (getHttpStatus(err)) throw err;

      if (!isRetryableGitHubError(err) || attempt === maxRetry - 1) throw err;

      const st = getGitHubStatusCode(err);
      const base = 450 * (attempt + 1);
      const jitter = Math.floor(Math.random() * 250);
      console.log(`[SERVER] Retry(dynamic) ${fn} (attempt ${attempt + 2}/${maxRetry}), status=${st}, wait=${base + jitter}ms`);
      await sleep(base + jitter);
    }
  }

  throw lastErr || new Error('Retry failed');
}

async function updateWebCsvFileWithRetry(webFilename, commitMessage, mutateFn, opts = {}) {
  const fn = String(webFilename || '').trim();
  return updateCsvFileDynamicWithRetry(fn, commitMessage, mutateFn, opts);
}

// ========================================
// HEALTH CHECK
// ========================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server v8.2.6 running (dynamic CSV upsert + overlay batch apply)',
    timestamp: new Date().toISOString()
  });
});

// ========================================
// NEW ENDPOINT: CSV UPSERT (Dynamic)
// POST /api/csv/upsert
// ========================================
app.post('/api/csv/upsert', async (req, res) => {
  console.log('[SERVER] csv/upsert called');
  try {
    const { filename, idField, idValue, updates, mode } = req.body || {};

    const fn = ensureWritableFilename(filename);
    const idF = String(idField || '').trim();
    const idV = String(idValue || '').trim();
    const opMode = String(mode || 'upsert').trim().toLowerCase();

    if (!idF || !idV) throw httpError(400, 'Missing idField or idValue');
    if (!updates || typeof updates !== 'object') throw httpError(400, 'Missing updates object');
    if (isTempKey(idV)) throw httpError(400, `TEMP key is not allowed for real write: ${idV}`);
    if (!['update', 'insert', 'upsert', 'delete'].includes(opMode)) throw httpError(400, 'mode must be update|insert|upsert|delete');

    const writer = fn.startsWith('web')
      ? updateWebCsvFileWithRetry
      : updateCsvFileDynamicWithRetry;

    const result = await writer(
      fn,
      `v8.3.0 CSV upsert ${fn} ${idF}=${idV} ${opMode} ${getJSTDate()}`,
      async (records, headers) => {
        if (!headers.includes(idF)) {
          throw httpError(400, 'idField not found in CSV header: ' + idF, {
            filename: fn,
            idField: idF,
            headers
          });
        }

        if (opMode !== 'delete') {
          const unknown = pickUnknownFields(updates, headers);
          if (unknown.length > 0) {
            throw httpError(400, 'Unknown fields for ' + fn, {
              filename: fn,
              unknownFields: unknown,
              allowedHeadersCount: headers.length
            });
          }
        }

        const idValTrim = String(idV).trim();
        let foundIndex = -1;

        for (let i = 0; i < records.length; i++) {
          const r = records[i];
          if (String((r && r[idF]) || '').trim() === idValTrim) {
            foundIndex = i;
            break;
          }
        }

        if (foundIndex >= 0) {
          if (opMode === 'insert') {
            throw httpError(409, 'Insert mode row already exists', {
              filename: fn,
              idField: idF,
              idValue: idV
            });
          }
          if (opMode === 'delete') {
            records.splice(foundIndex, 1);
            return { records };
          }

          const row = records[foundIndex];
          Object.keys(updates).forEach(k => {
            row[k] = toSafeString(updates[k]);
          });
          row[idF] = idV;
          records[foundIndex] = row;
          return { records };
        }

        if (opMode === 'delete') {
          throw httpError(404, 'Delete mode row not found', {
            filename: fn,
            idField: idF,
            idValue: idV
          });
        }

        if (opMode === 'update') {
          throw httpError(404, 'Update mode row not found', {
            filename: fn,
            idField: idF,
            idValue: idV
          });
        }

        const newRow = {};
        headers.forEach(h => { newRow[h] = ''; });
        newRow[idF] = idV;

        Object.keys(updates).forEach(k => {
          newRow[k] = toSafeString(updates[k]);
        });

        if (fn === 'molds.csv') {
          if (headers.includes('LegacyMoldID') && !String(newRow.LegacyMoldID || '').trim()) {
            newRow.LegacyMoldID = String(idV);
          }
          if (headers.includes('WebUUID') && !String(newRow.WebUUID || '').trim()) {
            newRow.WebUUID = genId('WEBUUID');
          }
          if (headers.includes('UpdatedAt') && !String(newRow.UpdatedAt || '').trim()) {
            newRow.UpdatedAt = getJSTTimestamp();
          }
          if (headers.includes('UpdatedBy') && !String(newRow.UpdatedBy || '').trim()) {
            newRow.UpdatedBy = String((updates && (updates.EmployeeID || updates.UpdatedBy)) || '');
          }
        }

        records.unshift(newRow);
        return { records };
      },
      { maxRetry: 4, requireExisting: true }
    );


    // TRỢ LỰC DELTA SYNC
    if (opMode !== 'delete') {
      pushDeltaEvent(fn, idF, idV, updates);
    }
    res.json({ success: true, message: 'CSV upsert OK', filename: fn, attempt: result.attempt });
  } catch (error) {
    const st = getHttpStatus(error);
    if (st) return res.status(st).json({ success: false, message: error.message, extra: error.extra });
    console.error('[SERVER] Error in csv/upsert:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// NEW ENDPOINT: APPLY OVERLAY BATCH
// POST /api/csv/apply-overlay-batch
// ========================================
app.post('/api/csv/apply-overlay-batch', async (req, res) => {
  console.log('[SERVER] csv/apply-overlay-batch called');
  try {
    const { items } = req.body || {};
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw httpError(400, 'items must be a non-empty array');
    }

    const normalizedItems = items.map((it, idx) => {
      const table = normalizeTableKey(it && it.table);
      const op = String((it && it.op) || '').trim().toLowerCase();
      const idfield = String((it && it.idfield) || '').trim();
      const key = String((it && it.key) || '').trim();
      const fields = (it && it.fields && typeof it.fields === 'object') ? it.fields : {};

      if (!table) throw httpError(400, `Item #${idx}: missing table`);
      if (!op || !['insert', 'update'].includes(op)) throw httpError(400, `Item #${idx}: op must be insert|update`);
      if (!idfield) throw httpError(400, `Item #${idx}: missing idfield`);
      if (!key) throw httpError(400, `Item #${idx}: missing key`);
      if (isTempKey(key)) throw httpError(400, `Item #${idx}: TEMP key is not allowed for real write: ${key}`);

      const filename = tableKeyToFilename(table);
      const fnAllowed = ensureAllowedWebFilename(filename);

      return {
        _idx: idx,
        table,
        filename: fnAllowed,
        op,
        idfield,
        key,
        fields
      };
    });

    const groups = new Map();
    for (const it of normalizedItems) {
      if (!groups.has(it.filename)) groups.set(it.filename, []);
      groups.get(it.filename).push(it);
    }

    const results = [];

    for (const [filename, groupItems] of groups.entries()) {
      const commitMessage = `v8.2.6 Apply overlay ${filename} (${groupItems.length} items) ${getJSTDate()}`;

      const r = await updateWebCsvFileWithRetry(
        filename,
        commitMessage,
        async (records, headers) => {
          const problems = [];

          for (const it of groupItems) {
            if (!headers.includes(it.idfield)) {
              problems.push({ idx: it._idx, code: 'IDFIELD_NOT_FOUND', idfield: it.idfield });
              continue;
            }

            const unknown = pickUnknownFields(it.fields, headers);
            if (unknown.length > 0) {
              problems.push({ idx: it._idx, code: 'UNKNOWN_FIELDS', unknownFields: unknown });
            }
          }

          if (problems.length > 0) {
            throw httpError(400, `Overlay contains unknown fields or invalid idfield for ${filename}`, {
              filename,
              problems,
              headersSample: headers.slice(0, 60)
            });
          }

          for (const it of groupItems) {
            const idF = it.idfield;
            const idV = it.key;
            const op = it.op;

            let foundIndex = -1;
            for (let i = 0; i < (records || []).length; i++) {
              const row = records[i];
              if (String((row && row[idF]) || '').trim() === String(idV).trim()) {
                foundIndex = i;
                break;
              }
            }

            if (foundIndex >= 0) {
              if (op === 'insert') {
                throw httpError(409, `Insert mode: row already exists (${filename} ${idF}=${idV})`, {
                  filename,
                  idx: it._idx,
                  idfield: idF,
                  idValue: idV
                });
              }

              const row = records[foundIndex] || {};
              Object.keys(it.fields || {}).forEach(k => {
                row[k] = toSafeString(it.fields[k]);
              });
              row[idF] = idV;
              records[foundIndex] = row;

            } else {
              const newRow = {};
              headers.forEach(h => { newRow[h] = ''; });
              newRow[idF] = idV;

              Object.keys(it.fields || {}).forEach(k => {
                newRow[k] = toSafeString(it.fields[k]);
              });

              if (filename === 'molds.csv' && headers.includes('LegacyMoldID') && !String(newRow.LegacyMoldID || '').trim()) {
                newRow.LegacyMoldID = String(idV);
              }

              if (headers.includes('WebUUID') && !String(newRow.WebUUID || '').trim()) {
                newRow.WebUUID = genId('WEB_UUID_');
              }

              if (headers.includes('UpdatedAt')) {
                newRow.UpdatedAt = getJSTTimestamp();
              }

              if (headers.includes('UpdatedBy') && !String(newRow.UpdatedBy || '').trim()) {
                newRow.UpdatedBy = String((it.fields && (it.fields.UpdatedBy || it.fields.EmployeeID)) || '');
              }

              records.unshift(newRow);
            }

          }

          return { records };
        },
        { maxRetry: 4, requireExisting: true }
      );

      results.push({ filename, items: groupItems.length, attempt: r.attempt });
    }

    res.json({
      success: true,
      message: 'Overlay batch applied to GitHub CSV',
      files: results
    });
  } catch (error) {
    const st = getHttpStatus(error);
    if (st) return res.status(st).json({ success: false, message: error.message, extra: error.extra });
    console.error('[SERVER] Error in csv/apply-overlay-batch:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// LEGACY ENDPOINTS (unchanged from v8.2.5)
// ========================================
app.post('/api/process-scrap', async (req, res) => {
  try {
    const payload = req.body || {};
    const scrapId = payload.ScrapLogID ? String(payload.ScrapLogID).trim() : '';
    const action = payload.action ? String(payload.action).trim().toLowerCase() : 'upsert';

    if (!scrapId) return res.status(400).json({ success: false, message: 'Missing ScrapLogID' });

    const isMold = Boolean(payload.MoldID);
    const itemId = isMold ? payload.MoldID : payload.CutterID;
    const mainCsv = isMold ? 'molds.csv' : 'cutters.csv';
    const idField = isMold ? 'MoldID' : 'CutterID';

    const employeeId = payload.EmployeeID || 'SYSTEM';
    const expectedHeaders = ['ScrapLogID', 'MoldID', 'CutterID', 'RequestedDate', 'Status', 'ScrapMethod', 'CompanyID', 'ScheduledDate', 'Cost', 'ScrappedDate', 'EmployeeID', 'Notes'];
    let historyLogsToInsert = [];

    const pushHistory = (tName, rId, rIdField, fName, oVal, nVal, note) => {
      if (String(oVal || '') === String(nVal || '')) return;
      historyLogsToInsert.push({
        DataChangeID: genId('DCH'), TableName: tName, RecordID: String(rId || ''), RecordIDField: String(rIdField || ''),
        FieldName: String(fName || ''), OldValue: String(oVal || ''), NewValue: String(nVal || ''),
        ChangedAt: getJSTTimestamp(), ChangedBy: String(employeeId), BaseValueAtEdit: String(oVal || ''),
        BaseCommitID: '', BaseCommitAt: '', ChangeSource: 'process-scrap-v2', ChangeNote: String(note || ''),
        IsConflict: 'FALSE', ResolvedValue: '', ResolvedAt: '', ResolvedBy: ''
      });
    };

    if (action === 'delete') {
      let existedStatus = '';
      await updateCsvFileWithRetry('scraplog.csv', `Delete ScrapLog ${scrapId}`, async (records) => {
        const idx = records.findIndex(r => String(r.ScrapLogID || '').trim() === scrapId);
        if (idx >= 0) {
          existedStatus = String(records[idx].Status || '').trim().toUpperCase();
          records.splice(idx, 1);
          pushHistory('scraplog', scrapId, 'ScrapLogID', 'ScrapLogID', scrapId, '[DELETED]', 'Deleted scrap workflow');
        }
        return { records };
      }, { maxRetry: 5, requireExisting: false });

      await updateCsvFileWithRetry(mainCsv, `Rollback Scrap State ${itemId}`, async (records) => {
        const row = records.find(r => String(r[idField] || '').trim() === String(itemId).trim());
        if (row) {
          if (isMold) {
            pushHistory('molds', itemId, 'MoldID', 'MoldDisposing', row.MoldDisposing, '', 'Rollback Scrap');
            pushHistory('molds', itemId, 'MoldID', 'MoldDisposedDate', row.MoldDisposedDate, '', 'Rollback Scrap');
            row.MoldDisposing = ''; row.MoldDisposedDate = '';
            if (existedStatus === 'DISPOSED' || existedStatus === 'COMPLETED') {
              pushHistory('molds', itemId, 'MoldID', 'MoldUsageStatus', row.MoldUsageStatus, '', 'Rollback Scrap');
              row.MoldUsageStatus = '';
            }
          } else {
            if (existedStatus === 'DISPOSED' || existedStatus === 'COMPLETED') {
              pushHistory('cutters', itemId, 'CutterID', 'UsageStatus', row.UsageStatus, '', 'Rollback Scrap');
              row.UsageStatus = '';
            }
          }
        }
        return { records };
      }, { maxRetry: 5, requireExisting: false });

    } else {
      // Upsert mode
      const normalizedEntry = {};
      expectedHeaders.forEach(key => {
        normalizedEntry[key] = (payload[key] !== undefined && payload[key] !== null) ? payload[key] : '';
      });

      await updateCsvFileWithRetry('scraplog.csv', `Upsert ScrapLog ${scrapId}`, async (records) => {
        const idx = records.findIndex(r => String(r.ScrapLogID || '').trim() === scrapId);
        if (idx >= 0) {
          expectedHeaders.forEach(k => {
            k !== 'ScrapLogID' && pushHistory('scraplog', scrapId, 'ScrapLogID', k, records[idx][k], normalizedEntry[k], 'Edit scrap log');
          });
          records[idx] = Object.assign({}, records[idx], normalizedEntry);
        } else {
          pushHistory('scraplog', scrapId, 'ScrapLogID', 'ScrapLogID', '', scrapId, 'New scrap request created');
          records.unshift(normalizedEntry);
        }
        return { records };
      }, { maxRetry: 5, requireExisting: false });

      // Parent State Sync
      let pStatus = String(payload.Status).toUpperCase();
      await updateCsvFileWithRetry(mainCsv, `Sync Scrap State for ${itemId}`, async (records) => {
        const row = records.find(r => String(r[idField] || '').trim() === String(itemId).trim());
        if (row) {
          if (isMold) {
            if (pStatus === 'REQUESTED' || pStatus === 'SCHEDULED') {
              if (row.MoldDisposing !== '廃棄予定') {
                pushHistory('molds', itemId, 'MoldID', 'MoldDisposing', row.MoldDisposing, '廃棄予定', 'Set status to Planned (廃棄予定)');
                row.MoldDisposing = '廃棄予定';
              }
            }
            else if (pStatus === 'DISPOSED' || pStatus === 'COMPLETED') {
              if (row.MoldDisposing !== '廃棄済') {
                pushHistory('molds', itemId, 'MoldID', 'MoldDisposing', row.MoldDisposing, '廃棄済', 'Set status to Disposed (廃棄済)');
                row.MoldDisposing = '廃棄済';
              }
              if (row.MoldUsageStatus !== 'DISPOSED') {
                pushHistory('molds', itemId, 'MoldID', 'MoldUsageStatus', row.MoldUsageStatus, 'DISPOSED', 'Scrapped');
                row.MoldUsageStatus = 'DISPOSED';
              }
              if (payload.ScrappedDate && row.MoldDisposedDate !== payload.ScrappedDate) {
                pushHistory('molds', itemId, 'MoldID', 'MoldDisposedDate', row.MoldDisposedDate, payload.ScrappedDate, 'Record Scrap Date');
                row.MoldDisposedDate = payload.ScrappedDate;
              }
            }
          } else {
            // Cutter logic
            if (pStatus === 'DISPOSED' || pStatus === 'COMPLETED') {
              if (row.UsageStatus !== 'DISPOSED') {
                pushHistory('cutters', itemId, 'CutterID', 'UsageStatus', row.UsageStatus, 'DISPOSED', 'Scrapped');
                row.UsageStatus = 'DISPOSED';
              }
            }
          }
        }
        return { records };
      }, { maxRetry: 5, requireExisting: false });
    }

    if (historyLogsToInsert.length > 0) {
      await updateCsvFileWithRetry('datachangehistory.csv', `Log Scrap modifications for ${itemId}`, async (logs) => {
        historyLogsToInsert.reverse().forEach(h => logs.unshift(h));
        return { records: logs };
      }, { maxRetry: 4, requireExisting: false });
    }

    // TRỢ LỰC DELTA SYNC
    if (action === 'delete') {
      pushDeltaEvent('scraplog.csv', 'ScrapLogID', scrapId, { _delete: true });
    } else {
      pushDeltaEvent('scraplog.csv', 'ScrapLogID', scrapId, normalizedEntry);
    }
    pushDeltaEvent(mainCsv, idField, itemId, { _refresh: true }); // Mồi báo refresh vì logic scrap khá phức tạp

    res.json({ success: true, message: action === 'delete' ? 'Scrap workflow deleted' : 'Scrap processed correctly' });
  } catch (error) {
    console.error(`[SERVER] Error in process-scrap:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/add-log', async (req, res) => {
  console.log('[SERVER] add-log called');
  try {
    const { filename, entry } = req.body || {};
    const targetFilename = String(filename || '').trim().replace(/^web/, '');

    if (!filename || !entry) {
      return res.status(400).json({ success: false, message: 'Missing filename or entry' });
    }

    const expectedHeaders = FILE_HEADERS[targetFilename];
    if (!expectedHeaders) {
      return res.status(400).json({ success: false, message: `File ${filename} not supported` });
    }

    const idField = getIdFieldByFilename(filename);
    const incomingId = idField ? String((entry && entry[idField]) || '').trim() : '';

    const normalizedEntry = {};
    expectedHeaders.forEach(key => {
      normalizedEntry[key] = (entry && entry[key] !== undefined && entry[key] !== null) ? entry[key] : '';
    });

    await updateCsvFileWithRetry(
      targetFilename,
      `Add ${targetFilename} entry`,
      async (records) => {
        if (idField && incomingId) {
          const exists = records.some(r => String((r && r[idField]) || '').trim() === incomingId);
          if (exists) return { records };
        }
        records.unshift(normalizedEntry);
        return { records };
      },
      { maxRetry: 4 }
    );

    // TRỢ LỰC DELTA SYNC
    pushDeltaEvent(targetFilename, idField, incomingId, normalizedEntry);

    res.json({ success: true, message: `Log entry added to ${filename}` });
  } catch (error) {
    const st = getHttpStatus(error);
    if (st) return res.status(st).json({ success: false, message: error.message });
    console.error(`[SERVER] Error in add-log:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/update-item', async (req, res) => {
  console.log('[SERVER] update-item called');
  try {
    const { filename, itemIdField, itemIdValue, updates } = req.body || {};
    const targetFilename = String(filename || '').trim().replace(/^web/, '');

    if (!filename || !itemIdField || !itemIdValue || !updates) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }

    const safeTargetFilename = ensureAllowedWebFilename(targetFilename);

    await updateWebCsvFileWithRetry(
      safeTargetFilename,
      `Update ${safeTargetFilename} item ${itemIdValue}`,
      async (records, headers) => {
        let itemFound = false;
        const idVal = String(itemIdValue).trim();

        records = records.map(record => {
          if (String((record && record[itemIdField]) || '').trim() === idVal) {
            itemFound = true;
            Object.keys(updates || {}).forEach(key => {
              if ((headers || []).includes(key)) {
                record[key] = toSafeString(updates[key]);
              }
            });
            if ((headers || []).includes('UpdatedAt')) record.UpdatedAt = getJSTTimestamp();
            if ((headers || []).includes('UpdatedBy') && !String((updates || {}).UpdatedBy || '').trim()) {
              record.UpdatedBy = String((updates && (updates.EmployeeID || updates.UpdatedBy)) || record.UpdatedBy || '');
            }
          }
          return record;
        });

        if (!itemFound) {
          const newRow = {};
          (headers || []).forEach(h => { newRow[h] = ''; });
          newRow[itemIdField] = idVal;

          Object.keys(updates || {}).forEach(key => {
            if ((headers || []).includes(key)) {
              newRow[key] = toSafeString(updates[key]);
            }
          });

          if (safeTargetFilename === 'molds.csv' && (headers || []).includes('LegacyMoldID') && !String(newRow.LegacyMoldID || '').trim()) {
            newRow.LegacyMoldID = idVal;
          }
          if ((headers || []).includes('WebUUID') && !String(newRow.WebUUID || '').trim()) {
            newRow.WebUUID = genId('WEB_UUID_');
          }
          if ((headers || []).includes('UpdatedAt')) newRow.UpdatedAt = getJSTTimestamp();
          if ((headers || []).includes('UpdatedBy') && !String(newRow.UpdatedBy || '').trim()) {
            newRow.UpdatedBy = String((updates && (updates.EmployeeID || updates.UpdatedBy)) || '');
          }

          records.unshift(newRow);
        }

        return { records };
      },
      { maxRetry: 4, requireExisting: true }
    );

    // TRỢ LỰC DELTA SYNC
    pushDeltaEvent(safeTargetFilename, itemIdField, itemIdValue, updates);

    res.json({ success: true, message: `Item updated in ${filename}` });
  } catch (error) {
    const st = getHttpStatus(error);
    if (st) return res.status(st).json({ success: false, message: error.message });
    console.error(`[SERVER] Error in update-item:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/add-comment', async (req, res) => {
  console.log('[SERVER] add-comment called');
  try {
    const { comment } = req.body || {};
    if (!comment) {
      return res.status(400).json({ success: false, message: 'Missing comment' });
    }

    const filename = 'usercomments.csv';
    const expectedHeaders = FILE_HEADERS[filename];

    const newId = (comment.UserCommentID && String(comment.UserCommentID).trim())
      ? String(comment.UserCommentID).trim()
      : genId('UC');

    const normalizedComment = {};
    expectedHeaders.forEach(key => {
      if (key === 'UserCommentID') normalizedComment[key] = newId;
      else normalizedComment[key] = (comment && comment[key] !== undefined && comment[key] !== null) ? comment[key] : '';
    });

    await updateCsvFileDynamicWithRetry(
      filename,
      `Add comment ${newId}`,
      async (records) => {
        const exists = records.some(r => String((r && r.UserCommentID) || '').trim() === newId);
        if (!exists) records.unshift(normalizedComment);
        return { records };
      },
      { maxRetry: 4, requireExisting: true }
    );

    // TRỢ LỰC DELTA SYNC
    pushDeltaEvent(filename, 'UserCommentID', newId, normalizedComment);

    res.json({ success: true, message: 'Comment added', commentId: newId });
  } catch (error) {
    const st = getHttpStatus(error);
    if (st) return res.status(st).json({ success: false, message: error.message });
    console.error(`[SERVER] Error in add-comment:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});


app.post('/api/add-shiplog', async (req, res) => {
  console.log('[SERVER] add-shiplog called');
  try {
    const { MoldID, CutterID, ToCompanyID, EmployeeID, ShipNotes, CustomerID, ItemTypeID, ShipItemName, ShipItemType, FromCompany, ToCompany, FrameID, OtherEquipID, WaterBaseID, handler, ShipDate } = req.body || {};

    if (!MoldID && !CutterID) return res.status(400).json({ success: false, message: 'MoldID or CutterID required' });
    if (!ToCompanyID) return res.status(400).json({ success: false, message: 'ToCompanyID required' });

    // Step 1: Find YSD Company ID
    let ysdId = '2'; // Fallback
    try {
      const companyFile = await getGitHubFile(`${DATA_PATH_PREFIX}companies.csv`);
      const cRecords = await parseCsvText(companyFile.content);
      const ysd = cRecords.find(c => String(c.CompanyName || '').includes('ヨシダパッケージ') || String(c.CompanyShortName || '').includes('ヨシダパッケージ'));
      if (ysd && ysd.CompanyID) ysdId = String(ysd.CompanyID).trim();
    } catch (err) {
      console.warn('[SERVER] Could not dynamically find YSD Company ID, using fallback 2');
    }

    const dchItemType = MoldID ? 'mold' : 'cutter';
    const dchName = (dchItemType === 'mold') ? 'Molds' : 'Cutters';
    const dchId = (dchItemType === 'mold') ? MoldID : CutterID;
    const targetFile = (dchItemType === 'mold') ? 'molds.csv' : 'cutters.csv';
    const idField = (dchItemType === 'mold') ? 'MoldID' : 'CutterID';

    // Step 2: Read old KeeperCompany
    let oldKeeper = '';
    try {
      const tgFile = await getGitHubFile(`${DATA_PATH_PREFIX}${targetFile}`);
      const tRecords = await parseCsvText(tgFile.content);
      const match = tRecords.find(r => String(r[idField]).trim() === String(dchId).trim());
      if (match) oldKeeper = String(match.KeeperCompany || '').trim();
    } catch (e) {
      console.warn('[SERVER] Failed to read old keeper:', e);
    }

    const newId = genId('WEB_SHIP_');
    const dtNow = new Date().toISOString();

    const normalizedEntry = {
      ShipID: newId,
      CustomerID: CustomerID || '',
      ItemTypeID: ItemTypeID || '',
      ShipItemName: ShipItemName || '',
      ShipDate: ShipDate || dtNow,
      ToCompanyID: ToCompanyID,
      FromCompanyID: oldKeeper,
      ShipItemType: ShipItemType || '',
      ShipStatus: 'Vận chuyển',
      FromCompany: FromCompany || '',
      ToCompany: ToCompany || '',
      MoldID: MoldID || '',
      CutterID: CutterID || '',
      FrameID: FrameID || '',
      OtherEquipID: OtherEquipID || '',
      WaterBaseID: WaterBaseID || '',
      ShipNotes: ShipNotes || '',
      DateEntry: dtNow,
      handler: handler || '',
      EmployeeID: EmployeeID || ''
    };

    // 4. Update molds.csv 
    try {
      await updateCsvFileDynamicWithRetry(
        targetFile,
        `Update KeeperCompany to ${ToCompanyID} for ${dchId}`,
        async (records) => {
          let updated = false;
          for (let i = 0; i < records.length; i++) {
            if (String((records[i] && records[i][idField]) || '').trim() === String(dchId).trim()) {
              records[i].KeeperCompany = ToCompanyID;
              records[i].UpdatedAt = getJSTTimestamp();
              records[i].UpdatedBy = String(EmployeeID || '');
              updated = true;
              break;
            }
          }
          if (!updated) throw new Error(`Record ${dchId} not found in ${targetFile}`);
          return { records };
        },
        { maxRetry: 4, requireExisting: true }
      );
    } catch (err) {
      console.error('[SERVER] Failed to update KeeperCompany:', err);
    }

    // 5. DataChangeHistory for molds.csv
    try {
      await updateCsvFileDynamicWithRetry(
        'datachangehistory.csv',
        `Update KeeperCompany history for ${dchId} from api/add-shiplog`,
        async (r2, h2) => {
          const newDch = {
            DataChangeID: genId('DCH'),
            TableName: dchName,
            RecordID: String(dchId || ''),
            RecordIDField: idField,
            FieldName: 'KeeperCompany',
            OldValue: oldKeeper,
            NewValue: String(ToCompanyID || ''),
            ChangedAt: ShipDate || dtNow,
            ChangedBy: String(EmployeeID || ''),
            BaseValueAtEdit: '',
            BaseCommitID: '',
            BaseCommitAt: '',
            ChangeSource: 'api/add-shiplog',
            ChangeNote: String(ShipNotes || ''),
            IsConflict: 'FALSE',
            ResolvedValue: '',
            ResolvedAt: '',
            ResolvedBy: ''
          };
          h2.forEach(h => { if (newDch[h] === undefined) newDch[h] = ''; });
          r2.unshift(newDch);
          return { records: r2 };
        },
        { maxRetry: 4, requireExisting: true }
      );
    } catch (e) {
      console.error('[SERVER] Failed to append datachangehistory for KeeperCompany:', e);
    }

    // 6. Write shiplog.csv
    try {
      await updateCsvFileDynamicWithRetry(
        'shiplog.csv',
        `Add shiplog ${newId}`,
        async (records, headers) => {
          const newRec = { ...normalizedEntry };
          headers.forEach(h => { if (newRec[h] === undefined) newRec[h] = ''; });
          records.unshift(newRec);
          return { records };
        },
        { maxRetry: 4, requireExisting: true }
      );
    } catch (e) {
      console.error('[SERVER] Failed to write shiplog.csv:', e);
    }

    // 7. DataChangeHistory for shiplog.csv
    try {
      await updateCsvFileDynamicWithRetry(
        'datachangehistory.csv',
        `Add history for new shiplog ${newId}`,
        async (r2, h2) => {
          const newDch = {
            DataChangeID: genId('DCH'),
            TableName: 'shiplog.csv',
            RecordID: newId,
            RecordIDField: 'ShipID',
            FieldName: 'ShipID',
            OldValue: '',
            NewValue: newId,
            ChangedAt: ShipDate || dtNow,
            ChangedBy: String(EmployeeID || ''),
            BaseValueAtEdit: '',
            BaseCommitID: '',
            BaseCommitAt: '',
            ChangeSource: 'api/add-shiplog',
            ChangeNote: 'New shipment',
            IsConflict: 'FALSE',
            ResolvedValue: '',
            ResolvedAt: '',
            ResolvedBy: ''
          };
          h2.forEach(h => { if (newDch[h] === undefined) newDch[h] = ''; });
          r2.unshift(newDch);
          return { records: r2 };
        },
        { maxRetry: 4, requireExisting: true }
      );
    } catch (e) {
      console.error('[SERVER] Failed to append datachangehistory for shiplog:', e);
    }

    // 8. Generate IN / OUT log if transitioning between YSD and Out
    const destToCompanyID = String(ToCompanyID).trim();
    let generatedStatus = '';
    if (destToCompanyID === '6') {
      generatedStatus = 'RETURNED';
    } else if (oldKeeper === ysdId && destToCompanyID !== ysdId) {
      generatedStatus = 'OUT';
    } else if (oldKeeper !== ysdId && destToCompanyID === ysdId) {
      generatedStatus = 'IN';
    }

    let generatedStatusLog = null;
    if (generatedStatus) {
      const stLogId = genId('WEB_SL_');
      const stEntry = {
        StatusLogID: stLogId,
        MoldID: MoldID || '',
        CutterID: CutterID || '',
        ItemType: dchItemType,
        Status: generatedStatus,
        Timestamp: ShipDate || dtNow,
        EmployeeID: EmployeeID || '',
        DestinationID: destToCompanyID,
        Notes: ShipNotes || 'Auto-generated from Shipment',
        AuditDate: '', AuditType: '', SessionID: '', SessionName: '', SessionMode: ''
      };
      generatedStatusLog = stEntry;

      try {
        await updateCsvFileDynamicWithRetry('statuslogs.csv', `Add statuslog ${stLogId} from shiplog`,
          async (rSt, hSt) => {
            const newRec = { ...stEntry };
            hSt.forEach(h => { if (newRec[h] === undefined) newRec[h] = ''; });
            if (hSt.includes('UpdatedAt')) newRec.UpdatedAt = getJSTTimestamp();
            if (hSt.includes('UpdatedBy')) newRec.UpdatedBy = String(EmployeeID || '');
            rSt.unshift(newRec);
            return { records: rSt };
          }, { maxRetry: 4, requireExisting: true });

        // 9. DataChangeHistory for statuslogs.csv
        await updateCsvFileDynamicWithRetry('datachangehistory.csv', `Add history for statuslog ${stLogId}`,
          async (r2, h2) => {
            const newDch = {
              DataChangeID: genId('DCH'),
              TableName: 'statuslogs.csv',
              RecordID: stLogId,
              RecordIDField: 'StatusLogID',
              FieldName: 'Status',
              OldValue: '',
              NewValue: generatedStatus,
              ChangedAt: ShipDate || dtNow,
              ChangedBy: String(EmployeeID || ''),
              BaseValueAtEdit: '',
              BaseCommitID: '',
              BaseCommitAt: '',
              ChangeSource: 'api/add-shiplog',
              ChangeNote: 'Auto-generated status',
              IsConflict: 'FALSE',
              ResolvedValue: '',
              ResolvedAt: '',
              ResolvedBy: ''
            };
            h2.forEach(h => { if (newDch[h] === undefined) newDch[h] = ''; });
            r2.unshift(newDch);
            return { records: r2 };
          }, { maxRetry: 4, requireExisting: true });
      } catch (ee) {
        console.error('[SERVER] Failed generating auto StatusLog:', ee);
      }
    }

    // TRỢ LỰC DELTA SYNC
    pushDeltaEvent('shiplog.csv', 'ShipID', newId, normalizedEntry);
    pushDeltaEvent(targetFile, idField, dchId, { KeeperCompany: ToCompanyID, UpdatedAt: getJSTTimestamp(), UpdatedBy: EmployeeID });
    if (generatedStatusLog) {
      pushDeltaEvent('statuslogs.csv', 'StatusLogID', generatedStatusLog.StatusLogID, generatedStatusLog);
    }

    res.json({ success: true, message: 'Shipment recorded successfully', ShipID: newId, FromCompanyID: oldKeeper });
  } catch (error) {
    console.error(`[SERVER] Error in add-shiplog:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});


app.post('/api/checklog', async (req, res) => {
  console.log('[SERVER] checklog called');
  console.log('[SERVER] checklog body keys:', Object.keys(req.body || {}));

  try {
    const {
      StatusLogID,
      MoldID, CutterID, ItemType, Status,
      EmployeeID, DestinationID, Notes, Timestamp,
      AuditDate, AuditType,
      SessionID, SessionName, SessionMode
    } = req.body || {};
    console.log('[SERVER] checklog body sample:', { MoldID, CutterID, Status, EmployeeID, DestinationID });
    if (!MoldID && !CutterID) {
      return res.status(400).json({ success: false, message: 'MoldID or CutterID required' });
    }
    if (!Status) {
      return res.status(400).json({ success: false, message: 'Status required' });
    }

    const filename = 'statuslogs.csv';

    const newId = (StatusLogID && String(StatusLogID).trim())
      ? String(StatusLogID).trim()
      : genId('WEB_SL_');

    const normalizedEntry = {
      StatusLogID: newId,
      MoldID: MoldID || '',
      CutterID: CutterID || '',
      ItemType: ItemType || '',
      Status: Status || '',
      Timestamp: Timestamp || new Date().toISOString(),
      EmployeeID: EmployeeID || '',
      DestinationID: DestinationID || '',
      Notes: Notes || '',
      AuditDate: AuditDate || '',
      AuditType: AuditType || '',
      SessionID: SessionID || '',
      SessionName: SessionName || '',
      SessionMode: SessionMode || ''
    };

    await updateCsvFileDynamicWithRetry(
      filename,
      `Add checklog for ${MoldID || CutterID}`,
      async (records, headers) => {
        const exists = records.some(r => String((r && r.StatusLogID) || '').trim() === newId);

        if (!exists) {
          const row = {};
          (headers || []).forEach(h => { row[h] = ''; });

          row.StatusLogID = newId;
          row.MoldID = MoldID || '';
          row.CutterID = CutterID || '';
          row.ItemType = ItemType || '';
          row.Status = Status || '';
          row.Timestamp = Timestamp || new Date().toISOString();
          row.EmployeeID = EmployeeID || '';
          row.DestinationID = DestinationID || '';
          row.Notes = Notes || '';
          row.AuditDate = AuditDate || '';
          row.AuditType = AuditType || '';
          row.SessionID = SessionID || '';
          row.SessionName = SessionName || '';
          row.SessionMode = SessionMode || '';

          if ((headers || []).includes('LegacyStatusLogID') && (!row.LegacyStatusLogID || !String(row.LegacyStatusLogID).trim())) row.LegacyStatusLogID = '';
          if ((headers || []).includes('UpdatedAt')) row.UpdatedAt = getJSTTimestamp();
          if ((headers || []).includes('UpdatedBy') && (!row.UpdatedBy || !String(row.UpdatedBy).trim())) row.UpdatedBy = String(EmployeeID || '');

          records.unshift(row);

          // TRỢ LỰC DELTA SYNC CHO BẢNG STATUSLOGS
          pushDeltaEvent(filename, 'StatusLogID', newId, row);
        }

        return { records };
      },
      { maxRetry: 4, requireExisting: true }
    );

    // --- LOG TO DATACHANGEHISTORY ---
    // We log the latest change to datachangehistory to trigger sync in MS Access.
    const dchItemType = (ItemType || '').toLowerCase();
    if (['mold', 'cutter'].includes(dchItemType)) {
      const dchName = (dchItemType === 'mold') ? 'Molds' : 'Cutters';
      const dchId = (dchItemType === 'mold') ? MoldID : CutterID;
      if (dchId) {
        const dtNow = Timestamp || new Date().toISOString();
        try {
          await updateCsvFileDynamicWithRetry(
            'datachangehistory.csv',
            `Update history for ${dchId} from api/checklog`,
            async (r2, h2) => {
              const newDch = {
                DataChangeID: genId('DCH'),
                TableName: dchName,
                RecordID: String(dchId || ''),
                RecordIDField: dchItemType === 'mold' ? 'MoldID' : 'CutterID',
                FieldName: 'Status',
                OldValue: '', // Too expensive to fetch
                NewValue: String(Status || ''),
                ChangedAt: dtNow,
                ChangedBy: String(EmployeeID || ''),
                BaseValueAtEdit: '',
                BaseCommitID: '',
                BaseCommitAt: '',
                ChangeSource: 'api/checklog',
                ChangeNote: String(Notes || ''),
                IsConflict: 'FALSE',
                ResolvedValue: '',
                ResolvedAt: '',
                ResolvedBy: ''
              };
              h2.forEach(h => { if (newDch[h] === undefined) newDch[h] = ''; });
              r2.unshift(newDch);
              return { records: r2 };
            },
            { maxRetry: 4, requireExisting: true }
          );
        } catch (e) {
          console.error('[SERVER] Failed to append datachangehistory for checklog:', e);
        }
      }
    }

    res.json({ success: true, message: 'Check recorded', entryId: newId });
  } catch (error) {
    const st = getHttpStatus(error);
    if (st) return res.status(st).json({ success: false, message: error.message });
    console.error(`[SERVER] Error in checklog:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/locationlog', async (req, res) => {
  console.log('[SERVER] locationlog POST called');
  try {
    const { LocationLogID, MoldID, CutterID, OldRackLayer, NewRackLayer, notes, DateEntry, Employee, EmployeeID } = req.body || {};
    const targetMeta = getRackLayerTargetMetaFromBody(req.body || {});

    if (!targetMeta) {
      return res.status(400).json({ success: false, message: 'MoldID or CutterID required' });
    }

    if (!NewRackLayer || !String(NewRackLayer).trim()) {
      return res.status(400).json({ success: false, message: 'NewRackLayer required' });
    }

    const locId = LocationLogID && String(LocationLogID).trim() ? String(LocationLogID).trim() : genId('WEBLOC');
    const actorId = String(Employee || EmployeeID || '').trim();
    const nowTs = getJSTTimestamp();
    const oldRack = String(OldRackLayer || '').trim();
    const newRack = String(NewRackLayer || '').trim();

    const locEntry = {
      LocationLogID: locId,
      LegacyLocationLogID: '',
      OldRackLayer: oldRack,
      NewRackLayer: newRack,
      MoldID: String(MoldID || '').trim(),
      CutterID: String(CutterID || '').trim(),
      notes: notes || '',
      EmployeeID: actorId,
      DateEntry: DateEntry || nowTs,
      WebUUID: genId('WEBUUID'),
      UpdatedAt: nowTs,
      UpdatedBy: actorId
    };

    await updateCsvFileDynamicWithRetry(
      'locationlog.csv',
      `Add location log for ${targetMeta.idField}=${targetMeta.idValue} ${getJSTDate()}`,
      async (records) => {
        const exists = records.some(r => String((r && r.LocationLogID) || '').trim() === locId);
        if (!exists) records.unshift(locEntry);
        return { records };
      },
      { maxRetry: 4, requireExisting: true }
    );

    await updateRackLayerTargetWithRetry(targetMeta, newRack, actorId);

    // TRỢ LỰC DELTA SYNC
    pushDeltaEvent('locationlog.csv', 'LocationLogID', locId, locEntry);
    if (targetMeta && targetMeta.filename) {
      pushDeltaEvent(targetMeta.filename, targetMeta.idField, targetMeta.idValue, { RackLayerID: newRack, UpdatedAt: nowTs, UpdatedBy: actorId });
    }

    try {
      await appendLocationHistoryEntry(
        targetMeta,
        oldRack,
        newRack,
        actorId,
        'api/locationlog',
        `Location change via /api/locationlog log=${locId}`
      );
    } catch (historyErr) {
      console.error('[SERVER] Failed to write datachangehistory.csv:', historyErr);
    }

    res.json({
      success: true,
      message: `Location change recorded for ${targetMeta.idField}=${targetMeta.idValue}`,
      logId: locId
    });
  } catch (error) {
    const st = getHttpStatus(error);
    if (st) return res.status(st).json({ success: false, message: error.message });
    console.error('[SERVER] Error in locationlog POST:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


app.post('/api/audit-batch', async (req, res) => {
  console.log('[SERVER] audit-batch called');
  try {
    const { statusLogs, locationLogs } = req.body || {};

    if ((!statusLogs || !Array.isArray(statusLogs) || statusLogs.length === 0) && (!locationLogs || !Array.isArray(locationLogs) || locationLogs.length === 0)) {
      return res.status(400).json({ success: false, message: 'At least one of statusLogs or locationLogs required' });
    }

    let statusCount = 0;
    let locationCount = 0;
    let moldUpdateCount = 0;
    let cutterUpdateCount = 0;

    if (Array.isArray(statusLogs) && statusLogs.length > 0) {
      await updateWebCsvFileWithRetry(
        'statuslogs.csv',
        `Batch add ${statusLogs.length} audit logs`,
        async (records) => {
          for (const log of statusLogs) {
            const id = (log && log.StatusLogID && String(log.StatusLogID).trim()) ? String(log.StatusLogID).trim() : genId('WEBSL');
            const exists = records.some(r => String((r && r.StatusLogID) || '').trim() === id);
            if (exists) continue;

            records.unshift({
              StatusLogID: id,
              MoldID: (log && log.MoldID) || '',
              CutterID: (log && log.CutterID) || '',
              ItemType: (log && log.ItemType) || '',
              Status: (log && log.Status) || 'AUDIT',
              Timestamp: (log && log.Timestamp) || getJSTTimestamp(),
              EmployeeID: (log && log.EmployeeID) || '',
              DestinationID: (log && log.DestinationID) || '',
              Notes: (log && log.Notes) || 'Kiểm kê',
              AuditDate: (log && log.AuditDate) || getJSTDate(),
              AuditType: (log && log.AuditType) || 'AUDITONLY',
              SessionID: (log && log.SessionID) || '',
              SessionName: (log && log.SessionName) || '',
              SessionMode: (log && log.SessionMode) || '',
              UpdatedAt: getJSTTimestamp(),
              UpdatedBy: String((log && log.EmployeeID) || '')
            });

            statusCount++;
          }

          return { records };
        },
        { maxRetry: 4, requireExisting: true }
      );
    }

    const moldUpdates = new Map();
    const cutterUpdates = new Map();
    const historyJobs = [];

    if (Array.isArray(locationLogs) && locationLogs.length > 0) {
      await updateWebCsvFileWithRetry(
        'locationlog.csv',
        `Batch add ${locationLogs.length} location logs`,
        async (records) => {
          for (const log of locationLogs) {
            const id = (log && log.LocationLogID && String(log.LocationLogID).trim()) ? String(log.LocationLogID).trim() : genId('WEBLOC');
            const exists = records.some(r => String((r && r.LocationLogID) || '').trim() === id);
            if (exists) continue;

            const oldRack = String((log && log.OldRackLayer) || '').trim();
            const newRack = String((log && log.NewRackLayer) || '').trim();
            const moldId = String((log && log.MoldID) || '').trim();
            const cutterId = String((log && log.CutterID) || '').trim();
            const actorId = String((log && log.EmployeeID) || '').trim();
            const nowTs = getJSTTimestamp();

            records.unshift({
              LocationLogID: id,
              LegacyLocationLogID: '',
              OldRackLayer: oldRack,
              NewRackLayer: newRack,
              MoldID: moldId,
              CutterID: cutterId,
              notes: (log && log.notes) || 'Di chuyển khi kiểm kê',
              EmployeeID: actorId,
              DateEntry: (log && log.DateEntry) || nowTs,
              WebUUID: genId('WEBUUID'),
              UpdatedAt: nowTs,
              UpdatedBy: actorId
            });

            locationCount++;

            if (moldId && newRack) moldUpdates.set(moldId, { newRack, actorId, oldRack });
            if (cutterId && newRack) cutterUpdates.set(cutterId, { newRack, actorId, oldRack });

            if (moldId && newRack && oldRack !== newRack) {
              historyJobs.push({
                tableName: 'molds',
                idField: 'MoldID',
                idValue: moldId,
                oldRack,
                newRack,
                actorId,
                source: 'api/audit-batch',
                note: `Audit batch location log=${id}`
              });
            }

            if (cutterId && newRack && oldRack !== newRack) {
              historyJobs.push({
                tableName: 'cutters',
                idField: 'CutterID',
                idValue: cutterId,
                oldRack,
                newRack,
                actorId,
                source: 'api/audit-batch',
                note: `Audit batch location log=${id}`
              });
            }
          }

          return { records };
        },
        { maxRetry: 4, requireExisting: true }
      );
    }

    if (moldUpdates.size > 0) {
      try {
        await updateCsvFileDynamicWithRetry(
          'molds.csv',
          `Batch update molds RackLayerID Audit ${getJSTDate()}`,
          async (records, headers) => {
            records = (Array.isArray(records) ? records : []).map(r => {
              const mid = String((r && r.MoldID) || '').trim();
              if (mid && moldUpdates.has(mid)) {
                const job = moldUpdates.get(mid);
                r.RackLayerID = String(job.newRack || '').trim();
                if (headers.includes('UpdatedAt')) r.UpdatedAt = getJSTTimestamp();
                if (headers.includes('UpdatedBy')) r.UpdatedBy = String(job.actorId || '').trim();
                moldUpdateCount++;
              }
              return r;
            });
            return { records };
          },
          { maxRetry: 4, requireExisting: true }
        );
      } catch (mErr) {
        console.error('[SERVER] molds.csv update failed in audit-batch:', mErr && mErr.message ? mErr.message : mErr);
      }
    }

    if (cutterUpdates.size > 0) {
      try {
        await updateCsvFileDynamicWithRetry(
          'cutters.csv',
          `Batch update cutters RackLayerID Audit ${getJSTDate()}`,
          async (records, headers) => {
            records = (Array.isArray(records) ? records : []).map(r => {
              const cid = String((r && r.CutterID) || '').trim();
              if (cid && cutterUpdates.has(cid)) {
                const job = cutterUpdates.get(cid);
                r.RackLayerID = String(job.newRack || '').trim();
                if (headers.includes('UpdatedAt')) r.UpdatedAt = getJSTTimestamp();
                if (headers.includes('UpdatedBy')) r.UpdatedBy = String(job.actorId || '').trim();
                cutterUpdateCount++;
              }
              return r;
            });
            return { records };
          },
          { maxRetry: 4, requireExisting: true }
        );
      } catch (cErr) {
        console.error('[SERVER] cutters.csv update failed in audit-batch:', cErr && cErr.message ? cErr.message : cErr);
      }
    }

    if (historyJobs.length > 0) {
      try {
        await updateWebCsvFileWithRetry(
          'datachangehistory.csv',
          `Batch add ${historyJobs.length} RackLayerID history ${getJSTDate()}`,
          async (records) => {
            for (const job of historyJobs) {
              records.unshift({
                DataChangeID: genId('DCH'),
                TableName: job.tableName,
                RecordID: job.idValue,
                RecordIDField: job.idField,
                FieldName: 'RackLayerID',
                OldValue: job.oldRack || '',
                NewValue: job.newRack || '',
                ChangedAt: getJSTTimestamp(),
                ChangedBy: job.actorId || '',
                BaseValueAtEdit: job.oldRack || '',
                BaseCommitID: '',
                BaseCommitAt: '',
                ChangeSource: job.source || 'api/audit-batch',
                ChangeNote: job.note || '',
                IsConflict: 'FALSE',
                ResolvedValue: '',
                ResolvedAt: '',
                ResolvedBy: ''
              });
            }
            return { records };
          },
          { maxRetry: 4, requireExisting: true }
        );
      } catch (historyErr) {
        console.error('[SERVER] datachangehistory.csv update failed in audit-batch:', historyErr && historyErr.message ? historyErr.message : historyErr);
      }
    }

    res.json({
      success: true,
      message: 'Audit batch completed',
      saved: {
        statusLogs: statusCount,
        locationLogs: locationCount,
        moldsUpdated: moldUpdateCount,
        cuttersUpdated: cutterUpdateCount
      }
    });
  } catch (error) {
    const st = getHttpStatus(error);
    if (st) return res.status(st).json({ success: false, message: error.message });
    console.error('[SERVER] Error in audit-batch:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


app.delete('/api/locationlog/:id', async (req, res) => {
  console.log('[SERVER] locationlog DELETE called');
  try {
    const idParam = String((req.params && req.params.id) || '').trim();
    const { MoldID, DateEntry } = req.body || {};

    await updateCsvFileDynamicWithRetry(
      'locationlog.csv',
      `Delete location log ${idParam || MoldID || ''}`,
      async (records) => {
        const beforeLen = records.length;

        if (idParam) {
          records = records.filter(r => String((r && r.LocationLogID) || '').trim() !== idParam);
        } else {
          if (!MoldID || !DateEntry) throw httpError(400, 'Missing MoldID or DateEntry');
          const mid = String(MoldID).trim();
          const dt = String(DateEntry).trim();
          records = records.filter(r => {
            const matchMoldID = String((r && r.MoldID) || '').trim() === mid;
            const matchDate = String((r && r.DateEntry) || '').trim() === dt;
            return !(matchMoldID && matchDate);
          });
        }

        if (records.length === beforeLen) throw httpError(404, 'Location log not found');
        return { records };
      },
      { maxRetry: 4, requireExisting: true }
    );

    // TRỢ LỰC DELTA SYNC
    if (idParam) {
      pushDeltaEvent('locationlog.csv', 'LocationLogID', idParam, { _delete: true });
    }

    res.json({ success: true, message: 'Location log deleted' });
  } catch (error) {
    const st = getHttpStatus(error);
    if (st) return res.status(st).json({ success: false, message: error.message });
    console.error(`[SERVER] Error in locationlog DELETE:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/delete-log', async (req, res) => {
  console.log('[SERVER] delete-log called');
  try {
    const { filename, logId } = req.body || {};
    const targetFilename = String(filename || '').trim().replace(/^web/, '');

    if (!filename || !logId) {
      return res.status(400).json({ success: false, message: 'Missing filename or logId' });
    }

    const idField = getIdFieldByFilename(targetFilename);
    if (!idField) {
      return res.status(400).json({ success: false, message: `Delete not supported for ${filename}` });
    }

    const delId = String(logId).trim();

    await updateCsvFileDynamicWithRetry(
      targetFilename,
      `Delete ${targetFilename} entry ${delId}`,
      async (records) => {
        const beforeLen = records.length;
        records = records.filter(r => String((r && r[idField]) || '').trim() !== delId);
        if (records.length === beforeLen) throw httpError(404, 'Log entry not found');
        return { records };
      },
      { maxRetry: 4, requireExisting: true }
    );

    // TRỢ LỰC DELTA SYNC
    pushDeltaEvent(targetFilename, idField, delId, { _delete: true });

    res.json({ success: true, message: `Log entry deleted from ${filename}`, deletedId: delId });
  } catch (error) {
    const st = getHttpStatus(error);
    if (st) return res.status(st).json({ success: false, message: error.message });
    console.error(`[SERVER] Error in delete-log:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/deletelog', async (req, res) => {
  req.url = '/api/delete-log';
  return app._router.handle(req, res, () => { });
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server v8.2.6 running on port ${PORT}`);
  console.log(`📋 Endpoints:`);
  console.log(`  - /api/health (GET)`);
  console.log(`  - /api/add-log (POST)`);
  console.log(`  - /api/update-item (POST)`);
  console.log(`  - /api/add-comment (POST)`);
  console.log(`  - /api/checklog (POST)`);
  console.log(`  - /api/locationlog (POST)`);
  console.log(`  - /api/audit-batch (POST)`);
  console.log(`  - /api/locationlog/:id (DELETE)`);
  console.log(`  - /api/delete-log (POST)`);
  console.log(`  - /api/deletelog (POST) alias`);
  console.log(`  - /api/csv/upsert (POST)  [NEW v8.2.6]`);
  console.log(`  - /api/csv/apply-overlay-batch (POST)  [NEW v8.2.6]`);
});

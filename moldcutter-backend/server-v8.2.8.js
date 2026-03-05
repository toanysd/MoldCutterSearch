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

const app = express();
const corsOptions = {
  origin: function (origin, cb) {
    // Cho phép origin null (mở từ file://) và mọi origin khi dev nội bộ
    if (!origin || origin === 'null') return cb(null, true);
    return cb(null, true);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge: 86400
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(bodyParser.json({ limit: '4mb' }));

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;
const branch = process.env.GITHUB_BRANCH;
const DATA_PATH_PREFIX = 'Data/';

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
  'locationlog.csv': ['LocationLogID', 'OldRackLayer', 'NewRackLayer', 'MoldID', 'DateEntry', 'CutterID', 'notes', 'EmployeeID'],

  'shiplog.csv': ['ShipID', 'MoldID', 'CutterID', 'FromCompanyID', 'ToCompanyID', 'FromCompany', 'ToCompany', 'ShipDate', 'EmployeeID', 'ShipNotes', 'DateEntry'],

  'usercomments.csv': [
    'UserCommentID', 'ItemID', 'ItemType', 'CommentText',
    'EmployeeID', 'DateEntry', 'CommentStatus',
    'CommentType', 'Priority', 'UpdatedDate'
  ],

  'cutters.csv': ['CutterID', 'CutterName', 'CutterCode', 'MainBladeStatus', 'OtherStatus', 'Length', 'Width', 'NumberOfBlades', 'NumberOfOtherUnits', 'TypeOfOther', 'LastReceivedDate', 'LastShipDate', 'currentRackLayer', 'MoldFrameID', 'notes', 'ProductCode', 'cutterstyle', 'CurrentCompanyID', 'CutterDesignID', 'StockStatusID', 'CurrentUserID'],

  'molds.csv': [
    'MoldID', 'MoldName', 'MoldCode', 'CustomerID', 'TrayID', 'MoldDesignID',
    'storage_company', 'RackLayerID',
    'LocationNotes', 'ItemTypeID', 'MoldLengthModified', 'MoldWidthModified',
    'MoldHeightModified', 'MoldWeightModified', 'MoldNotes', 'MoldUsageStatus',
    'MoldOnCheckList', 'JobID', 'TeflonFinish', 'TeflonCoating',
    'TeflonSentDate', 'TeflonExpectedDate', 'TeflonReceivedDate',
    'MoldReturning', 'MoldReturnedDate', 'MoldDisposing', 'MoldDisposedDate', 'MoldEntry'
  ],

  'statuslogs.csv': ['StatusLogID', 'MoldID', 'CutterID', 'ItemType', 'Status', 'Timestamp', 'EmployeeID', 'DestinationID', 'Notes', 'AuditDate', 'AuditType', 'SessionID', 'SessionName', 'SessionMode'],

  'teflonlog.csv': ['TeflonLogID', 'MoldID', 'TeflonStatus', 'RequestedBy', 'RequestedDate', 'SentBy', 'SentDate', 'ExpectedDate', 'ReceivedDate', 'SupplierID', 'CoatingType', 'Reason', 'TeflonCost', 'Quality', 'TeflonNotes', 'CreatedDate', 'UpdatedBy', 'UpdatedDate'],
 
  'destinations.csv': ['DestinationID', 'DestinationName', 'DestinationCode', 'CompanyID', 'Address', 'Notes'],

  'CAV.csv': ['CAVCode', 'Serial', 'CAV', 'CAVlength', 'CAVwidth', 'CAVnote'],

  'processingdeadline.csv': ['ProcessingDeadlineID', 'MoldDesignID', 'DeadlineDate', 'Notes'],

  'processingstatus.csv': ['ProcessingStatusID', 'StatusName', 'StatusCode', 'Notes'],

  'itemtype.csv': ['ItemTypeID', 'ItemTypeName', 'ItemTypeCode', 'Notes'],

  'plasticforforming.csv': ['PlasticID', 'PlasticName', 'PlasticCode', 'Notes'],

  'machiningcustomer.csv': ['MachiningCustomerID', 'CustomerName', 'CustomerCode', 'Notes'],

  'tray.csv': ['TrayID', 'TrayName', 'TrayCode', 'TrayCapacity', 'Notes'],

  'worklog.csv': ['WorkLogID', 'MoldID', 'CutterID', 'EmployeeID', 'WorkDate', 'WorkType', 'Notes'],

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
  'CAV.csv',
  'destinations.csv',

  // Logs
  'statuslogs.csv',
  'shiplog.csv',
  'locationlog.csv',
  'usercomments.csv',
  'teflonlog.csv',

  // New tables (you confirmed these exist on GitHub)
  'processingdeadline.csv',
  'processingstatus.csv',
  'itemtype.csv',
  'plasticforforming.csv',
  'machiningcustomer.csv',
  'tray.csv',
  'worklog.csv',

  // New tables (you confirmed these exist on GitHub)
  'webmolds.csv',
  'webcutters.csv',
  'webcustomers.csv',
  'webmolddesign.csv',
  'webmoldcutter.csv',
  'webracks.csv',
  'webracklayers.csv',
  'webcompanies.csv',
  'webemployees.csv',
  'webjobs.csv',
  'webprocessingitems.csv',

  'webdestinations.csv',

  // Logs
  'webstatuslogs.csv',
  'webshiplog.csv',
  'weblocationlog.csv',
  'webusercomments.csv',
  'webteflonlog.csv',

  // New tables (you confirmed these exist on GitHub)
  'webprocessingdeadline.csv',
  'webprocessingstatus.csv',
  'webitemtype.csv',
  'webplasticforforming.csv',
  'webmachiningcustomer.csv',
  'webtray.csv',
  'webworklog.csv'


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
} catch (e0) {}

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
  CAV: 'CAV.csv',
  cav: 'CAV.csv',

  // Logs
  statuslogs: 'statuslogs.csv',
  shiplog: 'shiplog.csv',
  locationlog: 'locationlog.csv',
  usercomments: 'usercomments.csv',
  teflonlog: 'teflonlog.csv',

  // New tables
  processingdeadline: 'processingdeadline.csv',
  processingstatus: 'processingstatus.csv',
  itemtype: 'itemtype.csv',
  plasticforforming: 'plasticforforming.csv',
  machiningcustomer: 'machiningcustomer.csv',
  tray: 'tray.csv',
  trays: 'tray.csv',
  worklog: 'worklog.csv'
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
  } catch (e0) {}
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
  } catch (e0) {}
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
      .pipe(csvParser({ mapHeaders: ({ header }) => String(header || '').trim() }))
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
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: filePath,
      message,
      content: Buffer.from(String(content || '')).toString('base64'),
      sha,
      branch
    });
    console.log(`[SERVER] ✅ Updated: ${filePath}`);
  } catch (error) {
    console.error(`[SERVER] Error updating file:`, error && error.message ? error.message : error);
    throw error;
  }
}

// ========================================
// Helper: ID field by filename (legacy)
// ========================================
function getIdFieldByFilename(filename) {
  let fn = String(filename || '').trim();
  if (fn.startsWith('web')) fn = fn.slice(4);

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

  // direct mapping (case-insensitive)
  if (TABLE_KEY_TO_FILENAME[t0]) return TABLE_KEY_TO_FILENAME[t0];
  if (TABLE_KEY_TO_FILENAME[keyLower]) return TABLE_KEY_TO_FILENAME[keyLower];

  // fallback: tableKey + .csv
  const candidate = `${keyLower}.csv`;
  return candidate;
}

function ensureAllowedFilename(filename) {
  const fn = String(filename || '').trim();
  if (!fn || !/\.csv$/i.test(fn)) throw httpError(400, 'filename must end with .csv');
  if (!ALLOWED_CSV_FILES.has(fn)) throw httpError(400, `CSV file not allowed: ${fn}`);
  return fn;
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
  if (!(fn.startsWith('web') || fn.startsWith('web'))) {
    throw httpError(400, `Expected web*.csv, got: ${fn}`);
  }
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

    const fn = ensureAllowedFilename(filename);
    const idF = String(idField || '').trim();
    const idV = String(idValue || '').trim();
    const opMode = String(mode || 'upsert').trim().toLowerCase();

    if (!idF || !idV) throw httpError(400, 'Missing idField or idValue');
    if (!updates || typeof updates !== 'object') throw httpError(400, 'Missing updates object');
    if (isTempKey(idV)) throw httpError(400, `TEMP key is not allowed for real write: ${idV}`);
    if (!['update', 'insert', 'upsert'].includes(opMode)) throw httpError(400, 'mode must be update|insert|upsert');

    const result = await updateCsvFileDynamicWithRetry(
      fn,
      `v8.2.6 CSV upsert ${fn} ${idF}=${idV} (${opMode}) ${getJSTDate()}`,
      async (records, headers) => {
        if (!headers.includes(idF)) {
          throw httpError(400, `idField not found in CSV header: ${idF}`, { filename: fn, idField: idF, headers });
        }

        const unknown = pickUnknownFields(updates, headers);
        if (unknown.length > 0) {
          throw httpError(400, `Unknown field(s) for ${fn}`, {
            filename: fn,
            unknownFields: unknown,
            allowedHeadersCount: headers.length
          });
        }

        const idValTrim = String(idV).trim();
        let foundIndex = -1;

        for (let i = 0; i < (records || []).length; i++) {
          const r = records[i];
          if (String((r && r[idF]) || '').trim() === idValTrim) {
            foundIndex = i;
            break;
          }
        }

        if (foundIndex >= 0) {
          if (opMode === 'insert') {
            throw httpError(409, 'Insert mode: row already exists', { filename: fn, idField: idF, idValue: idV });
          }

          const row = records[foundIndex] || {};
          Object.keys(updates || {}).forEach(k => {
            row[k] = toSafeString(updates[k]);
          });
          row[idF] = idV;
          records[foundIndex] = row;

          return { records };
        }

        if (opMode === 'update') {
          throw httpError(404, 'Update mode: row not found', { filename: fn, idField: idF, idValue: idV });
        }

        const newRow = {};
        headers.forEach(h => { newRow[h] = ''; });
        newRow[idF] = idV;
        Object.keys(updates || {}).forEach(k => {
          newRow[k] = toSafeString(updates[k]);
        });

        records.unshift(newRow);
        return { records };
      },
      { maxRetry: 4, requireExisting: true }
    );

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
      const fnAllowed = ensureAllowedFilename(filename);

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

      const r = await updateCsvFileDynamicWithRetry(
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
              if (op === 'update') {
                throw httpError(404, `Update mode: row not found (${filename} ${idF}=${idV})`, {
                  filename,
                  idx: it._idx,
                  idfield: idF,
                  idValue: idV
                });
              }

              const newRow = {};
              headers.forEach(h => { newRow[h] = ''; });
              newRow[idF] = idV;
              Object.keys(it.fields || {}).forEach(k => {
                newRow[k] = toSafeString(it.fields[k]);
              });
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
app.post('/api/add-log', async (req, res) => {
  console.log('[SERVER] add-log called');
  try {
    const { filename, entry } = req.body || {};
    const targetFilename = String(filename || '').trim().startsWith('web')
      ? String(filename || '').trim()
      : `web${String(filename || '').trim()}`;

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
    const targetFilename = String(filename || '').trim().startsWith('web')
      ? String(filename || '').trim()
      : `web${String(filename || '').trim()}`;

    if (!filename || !itemIdField || !itemIdValue || !updates) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }

    const expectedHeaders = FILE_HEADERS[targetFilename];
    if (!expectedHeaders) {
      return res.status(400).json({ success: false, message: `File ${filename} not supported` });
    }

    await updateCsvFileWithRetry(
      targetFilename,
      `Update ${targetFilename} item ${itemIdValue}`,
      async (records) => {
        let itemFound = false;
        const idVal = String(itemIdValue).trim();

        records = records.map(record => {
          if (String((record && record[itemIdField]) || '').trim() === idVal) {
            itemFound = true;
            Object.keys(updates || {}).forEach(key => {
              if (expectedHeaders.includes(key)) {
                record[key] = updates[key];
              }
            });
          }
          return record;
        });

        if (!itemFound) throw httpError(404, 'Item not found');
        return { records };
      },
      { maxRetry: 4 }
    );


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

    const filename = 'webusercomments.csv';
    const expectedHeaders = FILE_HEADERS[filename];

    const newId = (comment.UserCommentID && String(comment.UserCommentID).trim())
      ? String(comment.UserCommentID).trim()
      : genId('UC');

    const normalizedComment = {};
    expectedHeaders.forEach(key => {
      if (key === 'UserCommentID') normalizedComment[key] = newId;
      else normalizedComment[key] = (comment && comment[key] !== undefined && comment[key] !== null) ? comment[key] : '';
    });

    await updateWebCsvFileWithRetry(
      filename,
      `Add comment ${newId}`,
      async (records) => {
        const exists = records.some(r => String((r && r.UserCommentID) || '').trim() === newId);
        if (!exists) records.unshift(normalizedComment);
        return { records };
      },
      { maxRetry: 4, requireExisting: true }
    );


    res.json({ success: true, message: 'Comment added', commentId: newId });
  } catch (error) {
    const st = getHttpStatus(error);
    if (st) return res.status(st).json({ success: false, message: error.message });
    console.error(`[SERVER] Error in add-comment:`, error);
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

    const filename = 'webstatuslogs.csv';

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

    await updateWebCsvFileWithRetry(
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
        }

        return { records };
      },
      { maxRetry: 4, requireExisting: true }
    );

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
    const {
      LocationLogID,
      MoldID, OldRackLayer, NewRackLayer,
      notes, DateEntry,
      Employee, EmployeeID
    } = req.body || {};

    if (!MoldID || !NewRackLayer) {
      return res.status(400).json({ success: false, message: 'MoldID and NewRackLayer required' });
    }

    const locId = (LocationLogID && String(LocationLogID).trim()) ? String(LocationLogID).trim() : genId('WEB_LOC_');

    const locEntry = {
      LocationLogID: locId,
      OldRackLayer: OldRackLayer || '',
      NewRackLayer: NewRackLayer || '',
      MoldID: MoldID || '',
      DateEntry: DateEntry || new Date().toISOString(),
      CutterID: '',
      notes: notes || '',
      EmployeeID: Employee || EmployeeID || ''
    };

    locEntry.UpdatedAt = getJSTTimestamp();
    locEntry.UpdatedBy = String(Employee || EmployeeID || '');

    await updateWebCsvFileWithRetry(
      'weblocationlog.csv',
      `Add location log for ${MoldID}`,
      async (records) => {
        const exists = records.some(r => String((r && r.LocationLogID) || '').trim() === locId);
        if (!exists) records.unshift(locEntry);
        return { records };
      },
      { maxRetry: 4, requireExisting: true }
    );


    try {
      await updateWebCsvFileWithRetry(
        'webmolds.csv',
        `Update mold ${MoldID} RackLayerID`,
        async (records) => {
          let found = false;
          const mid = String(MoldID).trim();
          records = records.map(r => {
            if (String((r && r.MoldID) || '').trim() === mid) {
              found = true;
              r.RackLayerID = NewRackLayer;
            }
            return r;
          });

          if (!found) {
            console.log(`[SERVER] ⚠️ WARNING: MoldID ${MoldID} not found in molds.csv`);
          }
          return { records };
        },
        { maxRetry: 4, requireExisting: true }
      );

    } catch (moldsErr) {
      console.error('[SERVER] ⚠️ Error updating molds.csv:', moldsErr && moldsErr.message ? moldsErr.message : moldsErr);
    }

    res.json({ success: true, message: `Location change recorded for ${MoldID}`, logId: locId });
  } catch (error) {
    const st = getHttpStatus(error);
    if (st) return res.status(st).json({ success: false, message: error.message });
    console.error(`[SERVER] Error in locationlog POST:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/audit-batch', async (req, res) => {
  console.log('[SERVER] audit-batch called');
  try {
    const { statusLogs, locationLogs } = req.body || {};

    if ((!statusLogs || !Array.isArray(statusLogs) || statusLogs.length === 0) &&
        (!locationLogs || !Array.isArray(locationLogs) || locationLogs.length === 0)) {
      return res.status(400).json({ success: false, message: 'At least one of statusLogs or locationLogs required' });
    }

    let statusCount = 0;
    let locationCount = 0;
    let moldUpdateCount = 0;

    if (Array.isArray(statusLogs) && statusLogs.length > 0) {
      await updateWebCsvFileWithRetry(
        'webstatuslogs.csv',
        `Batch add ${statusLogs.length} audit logs`,
        async (records) => {
          for (const log of statusLogs) {
            const id = (log && log.StatusLogID && String(log.StatusLogID).trim()) ? String(log.StatusLogID).trim() : genId('WEB_SL_');
            const exists = records.some(r => String((r && r.StatusLogID) || '').trim() === id);
            if (exists) continue;

            records.unshift({
              StatusLogID: id,
              MoldID: (log && log.MoldID) || '',
              CutterID: (log && log.CutterID) || '',
              ItemType: (log && log.ItemType) || '',
              Status: (log && log.Status) || 'AUDIT',
              Timestamp: (log && log.Timestamp) || new Date().toISOString(),
              EmployeeID: (log && log.EmployeeID) || '',
              DestinationID: (log && log.DestinationID) || '',
              Notes: (log && log.Notes) || '棚卸 | Kiểm kê',
              AuditDate: (log && log.AuditDate) || new Date().toISOString().split('T')[0],
              AuditType: (log && log.AuditType) || 'AUDIT_ONLY',
              SessionID: (log && log.SessionID) || '',
              SessionName: (log && log.SessionName) || '',
              SessionMode: (log && log.SessionMode) || ''
            });
            statusCount++;
          }
          return { records };
        },
        { maxRetry: 4, requireExisting: true }
      );
    }

    const moldUpdates = [];
    if (Array.isArray(locationLogs) && locationLogs.length > 0) {
      await updateWebCsvFileWithRetry(
        'weblocationlog.csv',
        `Batch add ${locationLogs.length} location logs`,
        async (records) => {
          for (const log of locationLogs) {
            const id = (log && log.LocationLogID && String(log.LocationLogID).trim()) ? String(log.LocationLogID).trim() : genId('LOC');
            const exists = records.some(r => String((r && r.LocationLogID) || '').trim() === id);
            if (exists) continue;

            records.unshift({
              LocationLogID: id,
              OldRackLayer: (log && log.OldRackLayer) || '',
              NewRackLayer: (log && log.NewRackLayer) || '',
              MoldID: (log && log.MoldID) || '',
              DateEntry: (log && log.DateEntry) || new Date().toISOString(),
              CutterID: (log && log.CutterID) || '',
              notes: (log && log.notes) || '棚卸時移動 | Di chuyển khi kiểm kê',
              EmployeeID: (log && log.EmployeeID) || ''
            });
            locationCount++;

            if (log && log.MoldID && log.NewRackLayer) {
              moldUpdates.push({ MoldID: log.MoldID, NewRackLayer: log.NewRackLayer });
            }
          }
          return { records };
        },
        { maxRetry: 4, requireExisting: true }
      );
    }

    if (moldUpdates.length > 0) {
      const updMap = {};
      moldUpdates.forEach(u => {
        const k = String(u.MoldID).trim();
        if (!k) return;
        updMap[k] = String(u.NewRackLayer || '').trim();
      });

      try {
        await updateWebCsvFileWithRetry(
          'webmolds.csv',
          `Batch update molds RackLayerID (Audit)`,
          async (records) => {
            records = records.map(r => {
              const mid = String((r && r.MoldID) || '').trim();
              if (mid && updMap[mid] !== undefined) {
                r.RackLayerID = updMap[mid];
                moldUpdateCount++;
              }
              return r;
            });
            return { records };
          },
          { maxRetry: 4, requireExisting: true }
        );
      } catch (mErr) {
        console.error('[SERVER] ⚠️ molds.csv update failed in audit-batch:', mErr && mErr.message ? mErr.message : mErr);
      }
    }

    res.json({
      success: true,
      message: 'Audit batch completed',
      saved: { statusLogs: statusCount, locationLogs: locationCount, moldsUpdated: moldUpdateCount }
    });
  } catch (error) {
    const st = getHttpStatus(error);
    if (st) return res.status(st).json({ success: false, message: error.message });
    console.error(`[SERVER] Error in audit-batch:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/locationlog/:id', async (req, res) => {
  console.log('[SERVER] locationlog DELETE called');
  try {
    const idParam = String((req.params && req.params.id) || '').trim();
    const { MoldID, DateEntry } = req.body || {};

    await updateWebCsvFileWithRetry(
      'weblocationlog.csv',
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
    const targetFilename = String(filename || '').trim().startsWith('web')
    ? String(filename || '').trim()
    : `web${String(filename || '').trim()}`;

    if (!filename || !logId) {
      return res.status(400).json({ success: false, message: 'Missing filename or logId' });
    }

    const idField = getIdFieldByFilename(targetFilename);
    if (!idField) {
      return res.status(400).json({ success: false, message: `Delete not supported for ${filename}` });
    }

    const delId = String(logId).trim();

    await updateWebCsvFileWithRetry(
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
  return app._router.handle(req, res, () => {});
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

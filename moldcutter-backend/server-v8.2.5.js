// server-v8.2.5.js
// MoldCutterSearch Backend - GitHub CSV storage
// Improvements:
// - Safe retry for GitHub write conflicts / temporary errors
// - Idempotent add (avoid duplicate rows) using client-provided IDs when available
// - Apply retry wrapper to all CSV-writing endpoints (add/update/checklog/locationlog/audit-batch/delete)

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const { Octokit } = require('@octokit/rest');
const csvParser = require('csv-parser');
const stream = require('stream');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));

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
// FILE HEADERS
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

  'teflonlog.csv': ['TeflonLogID', 'MoldID', 'TeflonStatus', 'RequestedBy', 'RequestedDate', 'SentBy', 'SentDate', 'ExpectedDate', 'ReceivedDate', 'SupplierID', 'CoatingType', 'Reason', 'TeflonCost', 'Quality', 'TeflonNotes', 'CreatedDate', 'UpdatedBy', 'UpdatedDate']
};

// ========================================
// Helpers: HTTP errors
// ========================================
function httpError(status, message) {
  const e = new Error(String(message || 'Error'));
  e.httpStatus = status;
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
// Helper: ID field by filename
// ========================================
function getIdFieldByFilename(filename) {
  if (filename === 'teflonlog.csv') return 'TeflonLogID';
  if (filename === 'statuslogs.csv') return 'StatusLogID';
  if (filename === 'locationlog.csv') return 'LocationLogID';
  if (filename === 'shiplog.csv') return 'ShipID';
  if (filename === 'usercomments.csv') return 'UserCommentID';
  return null;
}

function genId(prefix) {
  return `${prefix}${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ========================================
// HEALTH CHECK
// ========================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server v8.2.5 running (safe retry + idempotent add) ',
    timestamp: new Date().toISOString()
  });
});

// ========================================
// ENDPOINT 1: ADD LOG (Legacy)
// Body: { filename, entry }
// ========================================
app.post('/api/add-log', async (req, res) => {
  console.log('[SERVER] add-log called');
  try {
    const { filename, entry } = req.body || {};
    if (!filename || !entry) {
      return res.status(400).json({ success: false, message: 'Missing filename or entry' });
    }

    const expectedHeaders = FILE_HEADERS[filename];
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
      filename,
      `Add ${filename} entry`,
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

// ========================================
// ENDPOINT 2: UPDATE ITEM (Legacy)
// Body: { filename, itemIdField, itemIdValue, updates }
// ========================================
app.post('/api/update-item', async (req, res) => {
  console.log('[SERVER] update-item called');
  try {
    const { filename, itemIdField, itemIdValue, updates } = req.body || {};
    if (!filename || !itemIdField || !itemIdValue || !updates) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }

    const expectedHeaders = FILE_HEADERS[filename];
    if (!expectedHeaders) {
      return res.status(400).json({ success: false, message: `File ${filename} not supported` });
    }

    await updateCsvFileWithRetry(
      filename,
      `Update ${filename} item ${itemIdValue}`,
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

// ========================================
// ENDPOINT 3: ADD COMMENT
// Body: { comment }
// - Idempotent by UserCommentID (client can send it)
// ========================================
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

    await updateCsvFileWithRetry(
      filename,
      `Add comment ${newId}`,
      async (records) => {
        const exists = records.some(r => String((r && r.UserCommentID) || '').trim() === newId);
        if (!exists) records.unshift(normalizedComment);
        return { records };
      },
      { maxRetry: 4 }
    );

    res.json({ success: true, message: 'Comment added', commentId: newId });
  } catch (error) {
    const st = getHttpStatus(error);
    if (st) return res.status(st).json({ success: false, message: error.message });
    console.error(`[SERVER] Error in add-comment:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// ENDPOINT 4: CHECK-IN / CHECK-OUT
// POST /api/checklog
// - Idempotent by StatusLogID (client can send it)
// ========================================
app.post('/api/checklog', async (req, res) => {
  console.log('[SERVER] checklog called');
  try {
    const {
      StatusLogID,
      MoldID, CutterID, ItemType, Status,
      EmployeeID, DestinationID, Notes, Timestamp,
      AuditDate, AuditType,
      SessionID, SessionName, SessionMode
    } = req.body || {};

    if (!MoldID && !CutterID) {
      return res.status(400).json({ success: false, message: 'MoldID or CutterID required' });
    }
    if (!Status) {
      return res.status(400).json({ success: false, message: 'Status required' });
    }

    const filename = 'statuslogs.csv';
    const expectedHeaders = FILE_HEADERS[filename];

    const newId = (StatusLogID && String(StatusLogID).trim())
      ? String(StatusLogID).trim()
      : genId('SL');

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

    await updateCsvFileWithRetry(
      filename,
      `Add checklog for ${MoldID || CutterID}`,
      async (records) => {
        const exists = records.some(r => String((r && r.StatusLogID) || '').trim() === newId);
        if (!exists) records.unshift(normalizedEntry);
        return { records };
      },
      { maxRetry: 4 }
    );

    res.json({ success: true, message: 'Check recorded', entryId: newId });
  } catch (error) {
    const st = getHttpStatus(error);
    if (st) return res.status(st).json({ success: false, message: error.message });
    console.error(`[SERVER] Error in checklog:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// ENDPOINT 5: LOCATION LOG
// POST /api/locationlog
// - Idempotent by LocationLogID (client can send it)
// ========================================
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

    const locId = (LocationLogID && String(LocationLogID).trim()) ? String(LocationLogID).trim() : genId('LOC');

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

    // STEP 1: add locationlog row
    await updateCsvFileWithRetry(
      'locationlog.csv',
      `Add location log for ${MoldID}`,
      async (records) => {
        const exists = records.some(r => String((r && r.LocationLogID) || '').trim() === locId);
        if (!exists) records.unshift(locEntry);
        return { records };
      },
      { maxRetry: 4 }
    );

    // STEP 2: update molds.csv RackLayerID (best effort)
    try {
      await updateCsvFileWithRetry(
        'molds.csv',
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
        { maxRetry: 4 }
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

// ========================================
// ENDPOINT 6: AUDIT BATCH
// POST /api/audit-batch
// Body: { statusLogs: [], locationLogs: [] }
// - Safe retry, idempotent if caller provides StatusLogID/LocationLogID
// ========================================
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

    // STEP 1: batch statuslogs
    if (Array.isArray(statusLogs) && statusLogs.length > 0) {
      await updateCsvFileWithRetry(
        'statuslogs.csv',
        `Batch add ${statusLogs.length} audit logs`,
        async (records) => {
          for (const log of statusLogs) {
            const id = (log && log.StatusLogID && String(log.StatusLogID).trim()) ? String(log.StatusLogID).trim() : genId('SL');
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
        { maxRetry: 4 }
      );
    }

    // STEP 2: batch locationlog
    const moldUpdates = [];
    if (Array.isArray(locationLogs) && locationLogs.length > 0) {
      await updateCsvFileWithRetry(
        'locationlog.csv',
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
        { maxRetry: 4 }
      );
    }

    // STEP 3: update molds in one pass
    if (moldUpdates.length > 0) {
      const updMap = {};
      moldUpdates.forEach(u => {
        const k = String(u.MoldID).trim();
        if (!k) return;
        updMap[k] = String(u.NewRackLayer || '').trim();
      });

      try {
        await updateCsvFileWithRetry(
          'molds.csv',
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
          { maxRetry: 4 }
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

// ========================================
// DELETE LOCATION LOG
// DELETE /api/locationlog/:id
// - Supports delete by LocationLogID in param, fallback to {MoldID, DateEntry}
// ========================================
app.delete('/api/locationlog/:id', async (req, res) => {
  console.log('[SERVER] locationlog DELETE called');
  try {
    const idParam = String((req.params && req.params.id) || '').trim();
    const { MoldID, DateEntry } = req.body || {};

    await updateCsvFileWithRetry(
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
      { maxRetry: 4 }
    );

    res.json({ success: true, message: 'Location log deleted' });
  } catch (error) {
    const st = getHttpStatus(error);
    if (st) return res.status(st).json({ success: false, message: error.message });
    console.error(`[SERVER] Error in locationlog DELETE:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// DELETE LOG (UNIFIED)
// POST /api/delete-log
// Body: { filename, logId }
// ========================================
app.post('/api/delete-log', async (req, res) => {
  console.log('[SERVER] delete-log called');
  try {
    const { filename, logId } = req.body || {};
    if (!filename || !logId) {
      return res.status(400).json({ success: false, message: 'Missing filename or logId' });
    }

    const expectedHeaders = FILE_HEADERS[filename];
    if (!expectedHeaders) {
      return res.status(400).json({ success: false, message: `File ${filename} not supported` });
    }

    const idField = getIdFieldByFilename(filename);
    if (!idField) {
      return res.status(400).json({ success: false, message: `Delete not supported for ${filename}` });
    }

    const delId = String(logId).trim();

    await updateCsvFileWithRetry(
      filename,
      `Delete ${filename} entry ${delId}`,
      async (records) => {
        const beforeLen = records.length;
        records = records.filter(r => String((r && r[idField]) || '').trim() !== delId);
        if (records.length === beforeLen) throw httpError(404, 'Log entry not found');
        return { records };
      },
      { maxRetry: 4 }
    );

    res.json({ success: true, message: `Log entry deleted from ${filename}`, deletedId: delId });
  } catch (error) {
    const st = getHttpStatus(error);
    if (st) return res.status(st).json({ success: false, message: error.message });
    console.error(`[SERVER] Error in delete-log:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Backward-compat alias (some clients may call /api/deletelog)
app.post('/api/deletelog', async (req, res) => {
  req.url = '/api/delete-log';
  return app._router.handle(req, res, () => {});
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server v8.2.5 running on port ${PORT}`);
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
});

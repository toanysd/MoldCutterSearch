// server-r6.9.9.js - V7.7.7-r6.9.9 AUDIT BATCH SUPPORT

// ✅ FIX: Sử dụng chiến lược parse CSV từ V3.0 (hoạt động tốt)
// ✅ THÊM: csvParser options với mapHeaders để trim header
// ✅ LOGIC: Tương tự add-log, update-item nhưng cho molds.csv
// ✅ NEW: Endpoint /api/audit-batch cho kiểm kê hàng loạt

require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const { Octokit } = require('@octokit/rest');
const csvParser = require('csv-parser');
const stream = require('stream');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(bodyParser.json());

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
    // JST is UTC+9 hours
    const jstOffset = 9 * 60 * 60 * 1000; // 9 hours in milliseconds
    const jstTime = new Date(now.getTime() + jstOffset);
    return jstTime.toISOString();
}

function getJSTDate() {
    return getJSTTimestamp().split('T')[0]; // YYYY-MM-DD in JST
}

console.log('[Server] Timezone helpers loaded (JST = UTC+9)');

// ========================================
// FILE HEADERS - Cố định theo V4.31 + AUDIT SUPPORT
// ========================================

const FILE_HEADERS = {
  'locationlog.csv': ['LocationLogID', 'OldRackLayer', 'NewRackLayer', 'MoldID', 'DateEntry', 'CutterID', 'notes', 'EmployeeID'],
  'shiplog.csv': ['ShipID', 'MoldID', 'CutterID', 'FromCompanyID', 'ToCompanyID', 'FromCompany', 'ToCompany', 'ShipDate', 'EmployeeID', 'ShipNotes', 'DateEntry'],
  'usercomments.csv': ['UserCommentID', 'ItemType', 'ItemID', 'CommentText', 'CreatedByEmployeeID', 'CreatedDate'],
  'cutters.csv': ['CutterID', 'CutterName', 'CutterCode', 'MainBladeStatus', 'OtherStatus', 'Length', 'Width', 'NumberOfBlades', 'NumberOfOtherUnits', 'TypeOfOther', 'LastReceivedDate', 'LastShipDate', 'currentRackLayer', 'MoldFrameID', 'notes', 'ProductCode', 'cutterstyle', 'CurrentCompanyID', 'CutterDesignID', 'StockStatusID', 'CurrentUserID'],
  'molds.csv': [
    'MoldID', 'MoldName', 'MoldCode', 'CustomerID', 'TrayID', 'MoldDesignID',
    'storage_company',
    'RackLayerID',
    'LocationNotes', 'ItemTypeID', 'MoldLengthModified', 'MoldWidthModified',
    'MoldHeightModified', 'MoldWeightModified', 'MoldNotes', 'MoldUsageStatus',
    'MoldOnCheckList', 'JobID', 'TeflonFinish', 'TeflonCoating',
    'TeflonSentDate', 'TeflonExpectedDate', 'TeflonReceivedDate',
    'MoldReturning', 'MoldReturnedDate', 'MoldDisposing', 'MoldDisposedDate', 'MoldEntry'
  ],
  // ✅ UPDATED: Thêm AuditDate và AuditType
  'statuslogs.csv': ['StatusLogID', 'MoldID', 'CutterID', 'ItemType', 'Status', 'Timestamp', 'EmployeeID', 'DestinationID', 'Notes', 'AuditDate', 'AuditType']
};

// ========================================
// HEALTH CHECK
// ========================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server V7.7.7-r6.9.8 running (Audit Batch Support)',
    timestamp: new Date().toISOString()
  });
});

// ========================================
// ENDPOINT 1: ADD LOG (Legacy V4.31)
// ========================================

app.post('/api/add-log', async (req, res) => {
  console.log('[SERVER] add-log called');
  try {
    const { filename, entry } = req.body;
    if (!filename || !entry) {
      return res.status(400).json({ success: false, message: 'Missing filename or entry' });
    }

    const filePath = `${DATA_PATH_PREFIX}${filename}`;
    const expectedHeaders = FILE_HEADERS[filename];
    if (!expectedHeaders) {
      return res.status(400).json({ success: false, message: `File ${filename} not supported` });
    }

    const normalizedEntry = {};
    expectedHeaders.forEach(key => {
      normalizedEntry[key] = entry[key] || '';
    });

    console.log(`[SERVER] Adding log to ${filename}`);
    const fileData = await getGitHubFile(filePath);
    let records = await parseCsvText(fileData.content);
    records.unshift(normalizedEntry);
    const csvContent = convertToCsvText(records, expectedHeaders);
    await updateGitHubFile(filePath, csvContent, fileData.sha, `Add ${filename} entry`);

    res.json({ success: true, message: `Log entry added to ${filename}` });
  } catch (error) {
    console.error(`[SERVER] Error in add-log:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// ENDPOINT 2: UPDATE ITEM (Legacy V4.31)
// ========================================

app.post('/api/update-item', async (req, res) => {
  console.log('[SERVER] update-item called');
  try {
    const { filename, itemIdField, itemIdValue, updates } = req.body;
    if (!filename || !itemIdField || !itemIdValue || !updates) {
      return res.status(400).json({ success: false, message: 'Missing required parameters' });
    }

    const filePath = `${DATA_PATH_PREFIX}${filename}`;
    const expectedHeaders = FILE_HEADERS[filename];
    if (!expectedHeaders) {
      return res.status(400).json({ success: false, message: `File ${filename} not supported` });
    }

    const fileData = await getGitHubFile(filePath);
    let records = await parseCsvText(fileData.content);
    let itemFound = false;

    records = records.map(record => {
      if (String(record[itemIdField]).trim() === String(itemIdValue).trim()) {
        itemFound = true;
        Object.keys(updates).forEach(key => {
          if (expectedHeaders.includes(key)) {
            record[key] = updates[key];
          }
        });
      }
      return record;
    });

    if (!itemFound) {
      return res.status(404).json({ success: false, message: `Item not found` });
    }

    const csvContent = convertToCsvText(records, expectedHeaders);
    await updateGitHubFile(filePath, csvContent, fileData.sha, `Update ${filename} item ${itemIdValue}`);

    res.json({ success: true, message: `Item updated in ${filename}` });
  } catch (error) {
    console.error(`[SERVER] Error in update-item:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// ENDPOINT 3: ADD COMMENT (Legacy V4.31)
// ========================================

app.post('/api/add-comment', async (req, res) => {
  console.log('[SERVER] add-comment called');
  try {
    const { comment } = req.body;
    if (!comment) {
      return res.status(400).json({ success: false, message: 'Missing comment' });
    }

    const filename = 'usercomments.csv';
    const filePath = `${DATA_PATH_PREFIX}${filename}`;
    const expectedHeaders = FILE_HEADERS[filename];

    const normalizedComment = {};
    expectedHeaders.forEach(key => {
      normalizedComment[key] = comment[key] || '';
    });

    const fileData = await getGitHubFile(filePath);
    let records = await parseCsvText(fileData.content);
    records.unshift(normalizedComment);
    const csvContent = convertToCsvText(records, expectedHeaders);
    await updateGitHubFile(filePath, csvContent, fileData.sha, `Add comment`);

    res.json({ success: true, message: `Comment added` });
  } catch (error) {
    console.error(`[SERVER] Error in add-comment:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// ENDPOINT 4: CHECK-IN / CHECK-OUT (V7.7.7)
// ✅ UPDATED: Hỗ trợ AuditDate và AuditType
// ========================================

app.post('/api/checklog', async (req, res) => {
  console.log('[SERVER] checklog called');
  try {
    const { MoldID, CutterID, ItemType, Status, EmployeeID, DestinationID, Notes, Timestamp, AuditDate, AuditType } = req.body;
    if (!MoldID && !CutterID) {
      return res.status(400).json({ success: false, message: 'MoldID or CutterID required' });
    }
    if (!Status) {
      return res.status(400).json({ success: false, message: 'Status required' });
    }

    const filename = 'statuslogs.csv';
    const filePath = `${DATA_PATH_PREFIX}${filename}`;
    const expectedHeaders = FILE_HEADERS[filename];

    const newId = `SL${Date.now()}`;
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
      AuditDate: AuditDate || '', // ✅ NEW
      AuditType: AuditType || ''  // ✅ NEW
    };

    const fileData = await getGitHubFile(filePath);
    let records = await parseCsvText(fileData.content);
    records.unshift(normalizedEntry);
    const csvContent = convertToCsvText(records, expectedHeaders);
    await updateGitHubFile(filePath, csvContent, fileData.sha, `Add checklog for ${MoldID || CutterID}`);

    res.json({ success: true, message: `Check recorded`, entryId: newId });
  } catch (error) {
    console.error(`[SERVER] Error in checklog:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// ✅ ENDPOINT 5: LOCATION LOG (V7.7.7-r6.5.0)
// POST /api/locationlog - Tạo log + Cập nhật RackLayerID
// 🔧 FIX: Sử dụng mapHeaders và logic giống add-log
// ========================================

app.post('/api/locationlog', async (req, res) => {
  console.log('[SERVER] locationlog POST called');
  console.log('[SERVER] Request:', req.body);
  try {
    const { MoldID, OldRackLayer, NewRackLayer, notes, DateEntry, Employee, EmployeeID } = req.body;

    if (!MoldID || !NewRackLayer) {
      return res.status(400).json({
        success: false,
        message: 'MoldID and NewRackLayer required'
      });
    }

    // ========================================
    // STEP 1: Add locationlog entry
    // ========================================
    const filename = 'locationlog.csv';
    const filePath = `${DATA_PATH_PREFIX}${filename}`;
    const expectedHeaders = FILE_HEADERS[filename];

    const newId = `LOC${Date.now()}`;
    const normalizedEntry = {
      LocationLogID: newId,
      OldRackLayer: OldRackLayer || '',
      NewRackLayer: NewRackLayer || '',
      MoldID: MoldID || '',
      DateEntry: DateEntry || new Date().toISOString(),
      CutterID: '',
      notes: notes || '',
      EmployeeID: Employee || EmployeeID || ''
    };

    console.log('[SERVER] Adding locationlog entry');
    const locFileData = await getGitHubFile(filePath);
    let locRecords = await parseCsvText(locFileData.content);
    locRecords.unshift(normalizedEntry);
    const locCsvContent = convertToCsvText(locRecords, expectedHeaders);
    await updateGitHubFile(filePath, locCsvContent, locFileData.sha, `Add location log for ${MoldID}`);
    console.log('[SERVER] ✅ locationlog entry added');

    // ========================================
    // STEP 2: Update molds.csv RackLayerID
    // ========================================
    try {
      console.log('[SERVER] Starting molds.csv update');
      const moldsPath = `${DATA_PATH_PREFIX}molds.csv`;
      const moldsHeaders = FILE_HEADERS['molds.csv'];

      console.log(`[SERVER] Fetching molds.csv...`);
      const moldsData = await getGitHubFile(moldsPath);

      console.log(`[SERVER] Parsing molds.csv...`);
      let moldsRecords = await parseCsvText(moldsData.content);
      console.log(`[SERVER] ✅ Total molds: ${moldsRecords.length}`);

      // Search and update
      console.log(`[SERVER] Searching for MoldID="${MoldID}"...`);
      let foundIndex = -1;
      let oldRackLayer = null;

      moldsRecords = moldsRecords.map((record, index) => {
        const recordMoldID = String(record.MoldID).trim();
        const searchMoldID = String(MoldID).trim();

        if (recordMoldID === searchMoldID) {
          foundIndex = index;
          oldRackLayer = record.RackLayerID;
          console.log(`[SERVER] ✅ FOUND at index ${index}`);
          console.log(`[SERVER] OLD RackLayerID: "${oldRackLayer}" → NEW: "${NewRackLayer}"`);
          record.RackLayerID = NewRackLayer;
        }
        return record;
      });

      if (foundIndex >= 0) {
        console.log(`[SERVER] Converting to CSV...`);
        const moldsCsvContent = convertToCsvText(moldsRecords, moldsHeaders);

        console.log(`[SERVER] Updating molds.csv on GitHub...`);
        await updateGitHubFile(
          moldsPath,
          moldsCsvContent,
          moldsData.sha,
          `Update mold ${MoldID} RackLayerID: ${oldRackLayer} → ${NewRackLayer}`
        );
        console.log(`[SERVER] ✅ molds.csv updated successfully!`);
      } else {
        console.log(`[SERVER] ⚠️ WARNING: MoldID ${MoldID} not found in molds.csv`);
      }

    } catch (moldsError) {
      console.error(`[SERVER] ⚠️ Error updating molds.csv:`, moldsError.message);
      // Don't fail the entire request, just log the warning
    }

    res.json({
      success: true,
      message: `Location change recorded for ${MoldID}`,
      logId: newId
    });

  } catch (error) {
    console.error(`[SERVER] Error in locationlog POST:`, error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ========================================
// ✅ NEW ENDPOINT 6: AUDIT BATCH (V7.7.7-r6.9.8)
// POST /api/audit-batch - Kiểm kê hàng loạt
// Input: { statusLogs: [], locationLogs: [] }
// ========================================

app.post('/api/audit-batch', async (req, res) => {
  console.log('[SERVER] audit-batch called');
  console.log('[SERVER] Request:', JSON.stringify(req.body, null, 2));
  
  try {
    const { statusLogs, locationLogs } = req.body;
    
    if (!statusLogs && !locationLogs) {
      return res.status(400).json({
        success: false,
        message: 'At least one of statusLogs or locationLogs required'
      });
    }

    let statusCount = 0;
    let locationCount = 0;
    let moldUpdateCount = 0;

    // ========================================
    // STEP 1: Batch Add statuslogs
    // ========================================
    if (statusLogs && Array.isArray(statusLogs) && statusLogs.length > 0) {
      console.log(`[SERVER] Processing ${statusLogs.length} audit status logs...`);
      
      const filename = 'statuslogs.csv';
      const filePath = `${DATA_PATH_PREFIX}${filename}`;
      const expectedHeaders = FILE_HEADERS[filename];

      const fileData = await getGitHubFile(filePath);
      let records = await parseCsvText(fileData.content);

      // Normalize and add all status logs
      for (const log of statusLogs) {
        const newId = `SL${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const normalizedEntry = {
          StatusLogID: newId,
          MoldID: log.MoldID || '',
          CutterID: log.CutterID || '',
          ItemType: log.ItemType || '',
          Status: log.Status || 'AUDIT',
          Timestamp: log.Timestamp || new Date().toISOString(),
          EmployeeID: log.EmployeeID || '',
          DestinationID: log.DestinationID || '',
          Notes: log.Notes || '棚卸 | Kiểm kê',
          AuditDate: log.AuditDate || new Date().toISOString().split('T')[0],
          AuditType: log.AuditType || 'AUDIT_ONLY'
        };
        records.unshift(normalizedEntry);
        statusCount++;
      }

      const csvContent = convertToCsvText(records, expectedHeaders);
      await updateGitHubFile(filePath, csvContent, fileData.sha, `Batch add ${statusCount} audit logs`);
      console.log(`[SERVER] ✅ Added ${statusCount} status logs`);
    }

    // ========================================
    // STEP 2: Batch Add locationlogs + Update RackLayerID
    // ========================================
    if (locationLogs && Array.isArray(locationLogs) && locationLogs.length > 0) {
      console.log(`[SERVER] Processing ${locationLogs.length} location logs...`);

      const filename = 'locationlog.csv';
      const filePath = `${DATA_PATH_PREFIX}${filename}`;
      const expectedHeaders = FILE_HEADERS[filename];

      const fileData = await getGitHubFile(filePath);
      let records = await parseCsvText(fileData.content);

      // Add all location logs
      const moldUpdates = []; // Track molds to update
      for (const log of locationLogs) {
        const newId = `LOC${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const normalizedEntry = {
          LocationLogID: newId,
          OldRackLayer: log.OldRackLayer || '',
          NewRackLayer: log.NewRackLayer || '',
          MoldID: log.MoldID || '',
          DateEntry: log.DateEntry || new Date().toISOString(),
          CutterID: log.CutterID || '',
          notes: log.notes || '棚卸時移動 | Di chuyển khi kiểm kê',
          EmployeeID: log.EmployeeID || ''
        };
        records.unshift(normalizedEntry);
        locationCount++;

        // Track for molds.csv update
        if (log.MoldID && log.NewRackLayer) {
          moldUpdates.push({
            MoldID: log.MoldID,
            NewRackLayer: log.NewRackLayer,
            OldRackLayer: log.OldRackLayer
          });
        }
      }

      const csvContent = convertToCsvText(records, expectedHeaders);
      await updateGitHubFile(filePath, csvContent, fileData.sha, `Batch add ${locationCount} location logs`);
      console.log(`[SERVER] ✅ Added ${locationCount} location logs`);

      // ========================================
      // STEP 3: Update molds.csv for all changed positions
      // ========================================
      if (moldUpdates.length > 0) {
        console.log(`[SERVER] Updating RackLayerID for ${moldUpdates.length} molds...`);
        
        const moldsPath = `${DATA_PATH_PREFIX}molds.csv`;
        const moldsHeaders = FILE_HEADERS['molds.csv'];
        const moldsData = await getGitHubFile(moldsPath);
        let moldsRecords = await parseCsvText(moldsData.content);

        // Update each mold
        moldsRecords = moldsRecords.map(record => {
          const update = moldUpdates.find(u => String(u.MoldID).trim() === String(record.MoldID).trim());
          if (update) {
            console.log(`[SERVER] Updating MoldID ${update.MoldID}: ${update.OldRackLayer} → ${update.NewRackLayer}`);
            record.RackLayerID = update.NewRackLayer;
            moldUpdateCount++;
          }
          return record;
        });

        const moldsCsvContent = convertToCsvText(moldsRecords, moldsHeaders);
        await updateGitHubFile(
          moldsPath,
          moldsCsvContent,
          moldsData.sha,
          `Batch update ${moldUpdateCount} molds RackLayerID (Audit)`
        );
        console.log(`[SERVER] ✅ Updated ${moldUpdateCount} molds in molds.csv`);
      }
    }

    res.json({
      success: true,
      message: `Audit batch completed`,
      saved: {
        statusLogs: statusCount,
        locationLogs: locationCount,
        moldsUpdated: moldUpdateCount
      }
    });

  } catch (error) {
    console.error(`[SERVER] Error in audit-batch:`, error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// ========================================
// DELETE LOCATION LOG
// ========================================

app.delete('/api/locationlog/:id', async (req, res) => {
  console.log('[SERVER] locationlog DELETE called');
  try {
    const { MoldID, DateEntry } = req.body;

    if (!MoldID || !DateEntry) {
      return res.status(400).json({ success: false, message: 'Missing MoldID or DateEntry' });
    }

    const filename = 'locationlog.csv';
    const filePath = `${DATA_PATH_PREFIX}${filename}`;
    const expectedHeaders = FILE_HEADERS[filename];

    const fileData = await getGitHubFile(filePath);
    let records = await parseCsvText(fileData.content);

    const beforeLen = records.length;
    records = records.filter(record => {
      const matchMoldID = String(record.MoldID).trim() === String(MoldID).trim();
      const matchDate = String(record.DateEntry).trim() === String(DateEntry).trim();
      return !(matchMoldID && matchDate);
    });

    if (beforeLen === records.length) {
      return res.status(404).json({ success: false, message: 'Location log not found' });
    }

    const csvContent = convertToCsvText(records, expectedHeaders);
    await updateGitHubFile(filePath, csvContent, fileData.sha, `Delete location log for ${MoldID}`);

    res.json({ success: true, message: `Location log deleted` });
  } catch (error) {
    console.error(`[SERVER] Error in locationlog DELETE:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// DELETE STATUS LOG
// ========================================

app.post("/api/deletelog", async (req, res) => {
  console.log('[SERVER] deletelog called');
  try {
    const { MoldID, Timestamp } = req.body;

    if (!MoldID || !Timestamp) {
      return res.status(400).json({ success: false, message: "Missing MoldID or Timestamp" });
    }

    const filename = 'statuslogs.csv';
    const filePath = `${DATA_PATH_PREFIX}${filename}`;
    const expectedHeaders = FILE_HEADERS[filename];

    const fileData = await getGitHubFile(filePath);
    let records = await parseCsvText(fileData.content);

    const beforeLen = records.length;
    records = records.filter(record => {
      const matchMoldID = String(record.MoldID).trim() === String(MoldID).trim();
      const matchTimestamp = String(record.Timestamp).trim() === String(Timestamp).trim();
      return !(matchMoldID && matchTimestamp);
    });

    if (beforeLen === records.length) {
      return res.status(404).json({ success: false, message: "Log entry not found" });
    }

    const csvContent = convertToCsvText(records, expectedHeaders);
    await updateGitHubFile(filePath, csvContent, fileData.sha, `Delete checklog for ${MoldID}`);

    res.json({ success: true, deleted: { MoldID, Timestamp } });
  } catch (error) {
    console.error('[SERVER] Error in deletelog:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================
// HELPER FUNCTIONS
// ========================================

// ✅ FIX: Thêm mapHeaders để trim header names!
function parseCsvText(csvText) {
  return new Promise((resolve, reject) => {
    const results = [];
    if (!csvText || !csvText.trim()) {
      resolve(results);
      return;
    }

    const readableStream = stream.Readable.from(csvText);
    readableStream
      .pipe(csvParser({ mapHeaders: ({ header }) => header.trim() })) // ✅ KEY FIX!
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

// Escape CSV values
function escapeCsvValue(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
    return '"' + stringValue.replace(/"/g, '""') + '"';
  }
  return stringValue;
}

// Convert to CSV
function convertToCsvText(records, headers) {
  if (!headers || headers.length === 0) throw new Error('Headers are required');
  const headerRow = headers.join(',');
  const dataRows = records.map(record =>
    headers.map(header => escapeCsvValue(record[header] || '')).join(',')
  );
  return [headerRow, ...dataRows].join('\n') + '\n';
}

// Get file from GitHub
async function getGitHubFile(filePath) {
  try {
    console.log(`[SERVER] Fetching: ${filePath}`);
    const { data } = await octokit.repos.getContent({
      owner, repo, path: filePath, ref: branch
    });

    if (data.type !== 'file') {
      throw new Error(`${filePath} is not a file`);
    }

    const content = data.content ? Buffer.from(data.content, 'base64').toString('utf-8') : '';
    console.log(`[SERVER] ✅ Fetched: ${filePath}`);
    return { content, sha: data.sha };
  } catch (error) {
    if (error.status === 404) {
      console.log(`[SERVER] File not found: ${filePath}`);
      return { content: '', sha: null };
    }
    throw error;
  }
}

// Update file on GitHub
async function updateGitHubFile(filePath, content, sha, message) {
  try {
    console.log(`[SERVER] Updating: ${filePath}`);
    await octokit.repos.createOrUpdateFileContents({
      owner, repo, path: filePath, message,
      content: Buffer.from(content).toString('base64'),
      sha, branch
    });
    console.log(`[SERVER] ✅ Updated: ${filePath}`);
  } catch (error) {
    console.error(`[SERVER] Error updating file:`, error.message);
    throw error;
  }
}

// ============================================
// POST: BULK AUDIT (R6.9.9)
// ============================================
app.post('/api/audit-batch', async (req, res) => {
    try {
        const { statusLogs } = req.body;
        
        if (!statusLogs || !Array.isArray(statusLogs)) {
            return res.status(400).json({
                success: false,
                message: 'statusLogs must be an array'
            });
        }
        
        console.log(`[Bulk Audit] Received ${statusLogs.length} items`);
        
        // Validate and prepare logs
        const validLogs = statusLogs.filter(log => {
            const hasId = log.MoldID || log.CutterID;
            const hasStatus = log.Status;
            return hasId && hasStatus;
        });
        
        if (validLogs.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid logs found'
            });
        }
        
        console.log(`[Bulk Audit] Valid logs: ${validLogs.length} / ${statusLogs.length}`);
        
        // Generate CSV rows
        const csvRows = validLogs.map(log => {
            const statusLogID = `SL${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
            const timestamp = log.Timestamp || getJSTTimestamp();
            const auditDate = log.AuditDate || getJSTDate();
            const notes = (log.Notes || '棚卸 | Kiểm kê').replace(/"/g, '""'); // Escape quotes
            
            return [
                statusLogID,
                log.MoldID || '',
                log.Status || 'AUDIT',
                timestamp,
                log.EmployeeID || '',
                log.DestinationID || '',
                `"${notes}"`
            ].join(',');
        });
        
        const csvContent = csvRows.join('\n') + '\n';
        
        console.log('[Bulk Audit] CSV prepared, appending to file...');
        
        // Append to statuslogs.csv
        const filename = 'statuslogs.csv';
        const result = await appendToFile(filename, csvContent, `Bulk audit: ${validLogs.length} items`);
        
        if (result.success) {
            console.log(`[Bulk Audit] ✅ Success: ${validLogs.length} items saved`);
            return res.json({
                success: true,
                saved: validLogs.length,
                skipped: statusLogs.length - validLogs.length,
                message: `Bulk audit completed: ${validLogs.length} items`
            });
        } else {
            throw new Error(result.message || 'Append failed');
        }
        
    } catch (error) {
        console.error('[Bulk Audit] ❌ Error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Bulk audit failed'
        });
    }
});

console.log('[Server] ✅ Bulk audit endpoint registered: POST /api/audit-batch');

// ============================================
// START SERVER
// ============================================


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server V7.7.7-r6.9.8 running on port ${PORT}`);
  console.log(`📋 Endpoints:`);
  console.log(`  - /api/health (GET)`);
  console.log(`  - /api/add-log (POST)`);
  console.log(`  - /api/update-item (POST)`);
  console.log(`  - /api/add-comment (POST)`);
  console.log(`  - /api/checklog (POST) ✨ UPDATED: Audit support`);
  console.log(`  - /api/deletelog (POST)`);
  console.log(`  - /api/locationlog (POST) ✅ FIXED`);
  console.log(`  - /api/locationlog/:id (DELETE)`);
  console.log(`  - /api/audit-batch (POST) ✨ NEW: Batch audit support`);
  console.log(`🔧 CSV Parser: mapHeaders enabled to trim column names`);
});

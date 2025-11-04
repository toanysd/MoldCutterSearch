// server-r6.5.0.js - V7.7.7-r6.5.0 FIX COMPLETE!
// 
// ✅ FIX: Sử dụng chiến lược parse CSV từ V3.0 (hoạt động tốt)
// ✅ THÊM: csvParser options với mapHeaders để trim header
// ✅ LOGIC: Tương tự add-log, update-item nhưng cho molds.csv

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

// ========================================
// FILE HEADERS - Cố định theo V4.31
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
  'statuslogs.csv': ['StatusLogID', 'MoldID', 'Status', 'EmployeeID', 'DestinationID', 'Notes', 'Timestamp']
};

// ========================================
// HEALTH CHECK
// ========================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server V7.7.7-r6.5.0 running',
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
// ========================================
app.post('/api/checklog', async (req, res) => {
  console.log('[SERVER] checklog called');
  try {
    const { MoldID, Status, EmployeeID, DestinationID, Notes, Timestamp } = req.body;
    if (!MoldID || !Status) {
      return res.status(400).json({ success: false, message: 'MoldID and Status required' });
    }

    const filename = 'statuslogs.csv';
    const filePath = `${DATA_PATH_PREFIX}${filename}`;
    const expectedHeaders = FILE_HEADERS[filename];

    const newId = `SL${Date.now()}`;
    const normalizedEntry = {
      StatusLogID: newId,
      MoldID: MoldID || '',
      Status: Status || '',
      EmployeeID: EmployeeID || '',
      DestinationID: DestinationID || '',
      Notes: Notes || '',
      Timestamp: Timestamp || new Date().toISOString()
    };

    const fileData = await getGitHubFile(filePath);
    let records = await parseCsvText(fileData.content);
    records.unshift(normalizedEntry);
    const csvContent = convertToCsvText(records, expectedHeaders);
    await updateGitHubFile(filePath, csvContent, fileData.sha, `Add checklog for ${MoldID}`);

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
    EmployeeID: Employee || EmployeeID || ''  // ✅ THÊM TRƯỜNG NÀY
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

      // Log first few records to verify parsing
      console.log(`[SERVER] Sample records:`);
      for (let i = 0; i < Math.min(3, moldsRecords.length); i++) {
        console.log(`[SERVER]   [${i}] MoldID="${moldsRecords[i].MoldID}" (type:${typeof moldsRecords[i].MoldID}, len:${String(moldsRecords[i].MoldID).length})`);
      }

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
          console.log(`[SERVER]   OLD RackLayerID: "${oldRackLayer}" → NEW: "${NewRackLayer}"`);
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
        console.log(`[SERVER] ⚠️  WARNING: MoldID ${MoldID} not found in molds.csv`);
      }

    } catch (moldsError) {
      console.error(`[SERVER] ⚠️  Error updating molds.csv:`, moldsError.message);
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
      .pipe(csvParser({ mapHeaders: ({ header }) => header.trim() }))  // ✅ KEY FIX!
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

// ========================================
// START SERVER
// ========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server V7.7.7-r6.5.0 running on port ${PORT}`);
  console.log(`📋 Endpoints:`);
  console.log(`   - /api/health (GET)`);
  console.log(`   - /api/add-log (POST)`);
  console.log(`   - /api/update-item (POST)`);
  console.log(`   - /api/add-comment (POST)`);
  console.log(`   - /api/checklog (POST)`);
  console.log(`   - /api/deletelog (POST)`);
  console.log(`   - /api/locationlog (POST) ✨ FIXED!`);
  console.log(`   - /api/locationlog/:id (DELETE)`);
  console.log(`🔧 CSV Parser: mapHeaders enabled to trim column names`);
});

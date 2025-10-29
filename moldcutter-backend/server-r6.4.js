// server-r6.4.js - V7.7.7 với Location Manager Support
// Giữ nguyên tất cả chức năng V4.31 + thêm endpoint /api/locationlog

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
// Header cố định cho các file CSV quan trọng
// ========================================
const FILE_HEADERS = {
  'locationlog.csv': ['LocationLogID', 'OldRackLayer', 'NewRackLayer', 'MoldID', 'DateEntry', 'CutterID', 'notes'],
  'shiplog.csv': ['ShipID', 'MoldID', 'CutterID', 'FromCompanyID', 'ToCompanyID', 'FromCompany', 'ToCompany', 'ShipDate', 'handler', 'ShipNotes', 'DateEntry'],
  'usercomments.csv': ['UserCommentID', 'ItemType', 'ItemID', 'CommentText', 'CreatedByEmployeeID', 'CreatedDate'],
  'cutters.csv': ['CutterID', 'CutterName', 'CutterCode', 'MainBladeStatus', 'OtherStatus', 'Length', 'Width', 'NumberOfBlades', 'NumberOfOtherUnits', 'TypeOfOther', 'LastReceivedDate', 'LastShipDate', 'currentRackLayer', 'MoldFrameID', 'notes', 'ProductCode', 'cutterstyle', 'CurrentCompanyID', 'CutterDesignID', 'StockStatusID', 'CurrentUserID'],
  'molds.csv': ['MoldID', 'MoldName', 'MoldCode', 'LastReceivedDate', 'LastShipDate', 'currentRackLayer', 'FactoryID', 'notes', 'CurrentCompanyID', 'StockStatusID', 'CurrentUserID', 'ProductCode'],
  'statuslogs.csv': ['StatusLogID', 'MoldID', 'Status', 'EmployeeID', 'DestinationID', 'Notes', 'Timestamp']
};

// ========================================
// HEALTH CHECK ENDPOINT
// ========================================
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Server V7.7.7-r6.4 running (Location Support)', 
    timestamp: new Date().toISOString() 
  });
});

// ========================================
// ENDPOINT 1: ADD LOG (Legacy V4.31)
// ========================================
app.post('/api/add-log', async (req, res) => {
  console.log('[SERVER] add-log called with body:', req.body);
  try {
    const { filename, entry } = req.body;
    if (!filename || !entry) {
      return res.status(400).json({ success: false, message: 'Thiếu filename hoặc entry' });
    }

    const filePath = `${DATA_PATH_PREFIX}${filename}`;
    const expectedHeaders = FILE_HEADERS[filename];
    if (!expectedHeaders) {
      return res.status(400).json({ success: false, message: `File ${filename} không được hỗ trợ` });
    }

    const normalizedEntry = {};
    expectedHeaders.forEach(key => {
      normalizedEntry[key] = entry[key] || '';
    });

    console.log(`[SERVER] Adding log entry to ${filename}:`, normalizedEntry);

    const fileData = await getGitHubFile(filePath);
    let records = await parseCsvText(fileData.content);
    records.unshift(normalizedEntry);

    const csvContent = convertToCsvText(records, expectedHeaders);
    await updateGitHubFile(filePath, csvContent, fileData.sha, `Add ${filename} entry`);

    res.json({ success: true, message: `Log entry added to ${filename}` });
  } catch (error) {
    console.error(`[SERVER] Error in add-log:`, error);
    res.status(500).json({ success: false, message: `Failed to add log`, error: error.message });
  }
});

// ========================================
// ENDPOINT 2: UPDATE ITEM (Legacy V4.31)
// ========================================
app.post('/api/update-item', async (req, res) => {
  console.log('[SERVER] update-item called with body:', req.body);
  try {
    const { filename, itemIdField, itemIdValue, updates } = req.body;
    if (!filename || !itemIdField || !itemIdValue || !updates) {
      return res.status(400).json({ success: false, message: 'Thiếu tham số bắt buộc' });
    }

    const filePath = `${DATA_PATH_PREFIX}${filename}`;
    const expectedHeaders = FILE_HEADERS[filename];
    if (!expectedHeaders) {
      return res.status(400).json({ success: false, message: `File ${filename} không được hỗ trợ` });
    }

    const fileData = await getGitHubFile(filePath);
    let records = await parseCsvText(fileData.content);

    let itemFound = false;
    records = records.map(record => {
      if (record[itemIdField] === itemIdValue) {
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
      return res.status(404).json({ success: false, message: `Item không tìm thấy` });
    }

    const csvContent = convertToCsvText(records, expectedHeaders);
    await updateGitHubFile(filePath, csvContent, fileData.sha, `Update ${filename} item ${itemIdValue}`);

    res.json({ success: true, message: `Item updated in ${filename}` });
  } catch (error) {
    console.error(`[SERVER] Error in update-item:`, error);
    res.status(500).json({ success: false, message: `Failed to update item`, error: error.message });
  }
});

// ========================================
// ENDPOINT 3: ADD COMMENT (Legacy V4.31)
// ========================================
app.post('/api/add-comment', async (req, res) => {
  console.log('[SERVER] add-comment called with body:', req.body);
  try {
    const { comment } = req.body;
    if (!comment) {
      return res.status(400).json({ success: false, message: 'Thiếu comment' });
    }

    const filename = 'usercomments.csv';
    const filePath = `${DATA_PATH_PREFIX}${filename}`;
    const expectedHeaders = FILE_HEADERS[filename];

    const normalizedComment = {};
    expectedHeaders.forEach(key => {
      normalizedComment[key] = comment[key] || '';
    });

    console.log(`[SERVER] Adding comment:`, normalizedComment);

    const fileData = await getGitHubFile(filePath);
    let records = await parseCsvText(fileData.content);
    records.unshift(normalizedComment);

    const csvContent = convertToCsvText(records, expectedHeaders);
    await updateGitHubFile(filePath, csvContent, fileData.sha, `Add comment`);

    res.json({ success: true, message: `Comment added` });
  } catch (error) {
    console.error(`[SERVER] Error in add-comment:`, error);
    res.status(500).json({ success: false, message: `Failed to add comment`, error: error.message });
  }
});

// ========================================
// ENDPOINT 4: CHECK-IN / CHECK-OUT (V7.7.7)
// ========================================
app.post('/api/checklog', async (req, res) => {
  console.log('[SERVER] checklog called with body:', req.body);
  try {
    const { MoldID, Status, EmployeeID, DestinationID, Notes, Timestamp } = req.body;

    if (!MoldID || !Status) {
      return res.status(400).json({
        success: false,
        message: 'MoldID và Status là bắt buộc'
      });
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

    console.log(`[SERVER] Adding checklog entry:`, normalizedEntry);

    const fileData = await getGitHubFile(filePath);
    let records = await parseCsvText(fileData.content);
    records.unshift(normalizedEntry);

    const csvContent = convertToCsvText(records, expectedHeaders);
    await updateGitHubFile(
      filePath,
      csvContent,
      fileData.sha,
      `Add check-in/check-out log for ${MoldID}`
    );

    res.json({
      success: true,
      message: `Check ${Status} recorded for ${MoldID}`,
      entryId: newId
    });
  } catch (error) {
    console.error(`[SERVER] Error in checklog:`, error);
    res.status(500).json({
      success: false,
      message: `Failed to record check log`,
      error: error.message
    });
  }
});

// ========================================
// ✅ ENDPOINT 5: LOCATION LOG (MỚI - V7.7.7)
// POST /api/locationlog - Tạo log thay đổi vị trí
// ========================================
app.post('/api/locationlog', async (req, res) => {
  console.log('[SERVER] locationlog POST called with body:', req.body);
  try {
    const { MoldID, OldRackLayer, NewRackLayer, notes, DateEntry } = req.body;

    // Validate dữ liệu bắt buộc
    if (!MoldID || !NewRackLayer) {
      return res.status(400).json({
        success: false,
        message: 'MoldID và NewRackLayer là bắt buộc'
      });
    }

    const filename = 'locationlog.csv';
    const filePath = `${DATA_PATH_PREFIX}${filename}`;
    const expectedHeaders = FILE_HEADERS[filename];

    // Tạo ID tự động (timestamp-based)
    const newId = `LOC${Date.now()}`;

    // Chuẩn hóa entry
    const normalizedEntry = {
      LocationLogID: newId,
      OldRackLayer: OldRackLayer || '',
      NewRackLayer: NewRackLayer || '',
      MoldID: MoldID || '',
      DateEntry: DateEntry || new Date().toISOString(),
      CutterID: '', // Để trống vì chỉ cập nhật vị trí khuôn
      notes: notes || ''
    };

    console.log(`[SERVER] Adding locationlog entry:`, normalizedEntry);

    // Lấy file hiện tại
    const fileData = await getGitHubFile(filePath);
    let records = await parseCsvText(fileData.content);

    // Thêm entry mới vào đầu
    records.unshift(normalizedEntry);

    // Chuyển đổi thành CSV
    const csvContent = convertToCsvText(records, expectedHeaders);

    // Cập nhật lên GitHub
    await updateGitHubFile(
      filePath,
      csvContent,
      fileData.sha,
      `Add location change log for ${MoldID}`
    );

    // ✅ CẬP NHẬT MOLDS.CSV - Thay đổi currentRackLayer (RackLayerID)
    try {
      const moldsPath = `${DATA_PATH_PREFIX}molds.csv`;
      const moldsHeaders = FILE_HEADERS['molds.csv'];
      const moldsData = await getGitHubFile(moldsPath);
      let moldsRecords = await parseCsvText(moldsData.content);

      let moldUpdated = false;
      moldsRecords = moldsRecords.map(record => {
        if (record.MoldID === MoldID) {
          record.currentRackLayer = NewRackLayer; // Cập nhật RackLayerID mới
          moldUpdated = true;
          console.log(`[SERVER] Updated mold ${MoldID} currentRackLayer to ${NewRackLayer}`);
        }
        return record;
      });

      if (moldUpdated) {
        const moldsCsvContent = convertToCsvText(moldsRecords, moldsHeaders);
        await updateGitHubFile(
          moldsPath,
          moldsCsvContent,
          moldsData.sha,
          `Update mold ${MoldID} location to ${NewRackLayer}`
        );
      }
    } catch (moldsError) {
      console.error(`[SERVER] Error updating molds.csv:`, moldsError);
      // Không fail toàn bộ request, chỉ log warning
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
      message: `Failed to record location log`,
      error: error.message
    });
  }
});

// ========================================
// ✅ ENDPOINT 6: DELETE LOCATION LOG (MỚI - V7.7.7)
// DELETE /api/locationlog/:id - Xóa log thay đổi vị trí
// ========================================
app.delete('/api/locationlog/:id', async (req, res) => {
  console.log('[SERVER] locationlog DELETE called with id:', req.params.id);
  try {
    const { id } = req.params;
    const { MoldID, DateEntry } = req.body;

    if (!MoldID || !DateEntry) {
      return res.status(400).json({
        success: false,
        message: 'MoldID và DateEntry là bắt buộc'
      });
    }

    const filename = 'locationlog.csv';
    const filePath = `${DATA_PATH_PREFIX}${filename}`;
    const expectedHeaders = FILE_HEADERS[filename];

    // Lấy file hiện tại
    const fileData = await getGitHubFile(filePath);
    let records = await parseCsvText(fileData.content);

    const beforeLen = records.length;

    // Xóa entry khớp với MoldID và DateEntry
    records = records.filter(record => {
      // So sánh cả MoldID và DateEntry để tránh xóa nhầm
      const matchMoldID = String(record.MoldID).trim() === String(MoldID).trim();
      const matchDate = String(record.DateEntry).trim() === String(DateEntry).trim();
      return !(matchMoldID && matchDate);
    });

    const afterLen = records.length;

    if (beforeLen === afterLen) {
      return res.status(404).json({
        success: false,
        message: 'Location log entry không tìm thấy'
      });
    }

    console.log(`[SERVER] Deleted ${beforeLen - afterLen} location log entry`);

    // Chuyển đổi thành CSV
    const csvContent = convertToCsvText(records, expectedHeaders);

    // Cập nhật lên GitHub
    await updateGitHubFile(
      filePath,
      csvContent,
      fileData.sha,
      `Delete location log for ${MoldID}`
    );

    res.json({
      success: true,
      message: `Location log deleted for ${MoldID}`,
      deleted: { MoldID, DateEntry }
    });
  } catch (error) {
    console.error(`[SERVER] Error in locationlog DELETE:`, error);
    res.status(500).json({
      success: false,
      message: `Failed to delete location log`,
      error: error.message
    });
  }
});

// ========================================
// DELETE STATUS LOG (V7.7.7)
// ========================================
app.post("/api/deletelog", async (req, res) => {
  console.log('[SERVER] deletelog called with body:', req.body);
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

    // Xóa entry khớp với MoldID và Timestamp
    records = records.filter(record => {
      const matchMoldID = String(record.MoldID).trim() === String(MoldID).trim();
      const matchTimestamp = String(record.Timestamp).trim() === String(Timestamp).trim();
      return !(matchMoldID && matchTimestamp);
    });

    const afterLen = records.length;

    if (beforeLen === afterLen) {
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

// Lấy file từ GitHub
async function getGitHubFile(path) {
  const response = await octokit.repos.getContent({
    owner,
    repo,
    path,
    ref: branch
  });
  const content = Buffer.from(response.data.content, 'base64').toString('utf-8');
  return { content, sha: response.data.sha };
}

// Cập nhật file lên GitHub
async function updateGitHubFile(path, content, sha, message) {
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: Buffer.from(content).toString('base64'),
    sha,
    branch
  });
}

// Parse CSV text thành array of objects
function parseCsvText(csvText) {
  return new Promise((resolve, reject) => {
    const results = [];
    const bufferStream = new stream.PassThrough();
    bufferStream.end(csvText);
    bufferStream
      .pipe(csvParser())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

// Convert array of objects thành CSV text
function convertToCsvText(records, headers) {
  const headerLine = headers.join(',');
  const dataLines = records.map(record => {
    return headers.map(header => escapeCsvValue(record[header] || '')).join(',');
  });
  return [headerLine, ...dataLines].join('\n');
}

// Escape giá trị CSV
function escapeCsvValue(value) {
  if (typeof value !== 'string') value = String(value);
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    value = '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

// ========================================
// START SERVER
// ========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server V7.7.7-r6.4 running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📋 Endpoints:`);
  console.log(`   - /api/add-log (POST)`);
  console.log(`   - /api/update-item (POST)`);
  console.log(`   - /api/add-comment (POST)`);
  console.log(`   - /api/checklog (POST)`);
  console.log(`   - /api/deletelog (POST)`);
  console.log(`   - /api/locationlog (POST) ✨ NEW`);
  console.log(`   - /api/locationlog/:id (DELETE) ✨ NEW`);
});

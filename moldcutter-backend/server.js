// server.js - V3.0 Updated for V4.24 compatibility
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

// Header cố định cho các file CSV quan trọng
const FILE_HEADERS = {
    'locationlog.csv': ['LocationLogID', 'OldRackLayer', 'NewRackLayer', 'MoldID', 'DateEntry', 'CutterID', 'notes'],
    'shiplog.csv': ['ShipID', 'MoldID', 'CutterID', 'FromCompanyID', 'ToCompanyID', 'FromCompany', 'ToCompany', 'ShipDate', 'handler', 'ShipNotes', 'DateEntry'],
    'usercomments.csv': ['UserCommentID', 'ItemID', 'ItemType', 'CommentText', 'EmployeeID', 'DateEntry', 'CommentStatus'],
    'cutters.csv': ['CutterID', 'CutterNo', 'CutterName', 'CutterDesignName', 'SatoCode', 'SatoCodeDate', 'Description', 'UsageStatus', 'BladeCount', 'Pitch', 'PlasticCutType', 'CutterType', 'PPcushionUse', 'CutlineLength', 'CutlineWidth', 'CutterCorner', 'CutterChamfer', 'PostCutLength', 'PostCutWidth', 'CutterLength', 'CutterWidth', 'CutterNote', 'CutterDetail', 'CustomerID', 'RackLayerID', 'storage_company', 'CutterDisposing', 'last_update_date'],
    'molds.csv': ['MoldID', 'MoldCode', 'MoldName', 'MoldAssyDrawing', 'MoldDesignID', 'MoldMakerID', 'MoldType', 'CustomerID', 'MoldCavity', 'MoldDimL', 'MoldDimW', 'MoldDimH', 'MoldWeight', 'MoldNote', 'MoldDetail', 'RackLayerID', 'storage_company', 'MoldReturning', 'MoldDisposing', 'last_update_date']
};

// ✅ FIX: API routes tương thích với V4.24 frontend
app.post('/api/add-log', async (req, res) => {
    console.log('[SERVER] add-log called with body:', req.body);
    
    try {
        const { endpoint, data } = req.body;
        
        if (!endpoint || !data) {
            return res.status(400).json({ 
                success: false,
                message: 'Missing endpoint or data in request body' 
            });
        }
        
        const filename = endpoint;
        const newEntry = data;
        const filePath = `${DATA_PATH_PREFIX}${filename}`;
        
        console.log(`[SERVER] Adding log to ${filename}:`, newEntry);
        
        // Kiểm tra header có tồn tại
        const expectedHeaders = FILE_HEADERS[filename];
        if (!expectedHeaders) {
            return res.status(400).json({ 
                success: false,
                message: `Unsupported file: ${filename}` 
            });
        }
        
        // Chuẩn hóa entry theo header
        const normalizedEntry = {};
        expectedHeaders.forEach(header => {
            normalizedEntry[header] = newEntry[header] || '';
        });
        
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
            `Add log entry to ${filename}`
        );
        
        res.json({ 
            success: true,
            message: `Log added to ${filename} successfully`,
            entryId: normalizedEntry[expectedHeaders[0]] 
        });
        
    } catch (error) {
        console.error(`[SERVER] Error in add-log:`, error);
        res.status(500).json({ 
            success: false,
            message: `Failed to add log`,
            error: error.message 
        });
    }
});

app.post('/api/update-item', async (req, res) => {
    console.log('[SERVER] update-item called with body:', req.body);
    
    try {
        const { endpoint, data } = req.body;
        
        if (!endpoint || !data) {
            return res.status(400).json({ 
                success: false,
                message: 'Missing endpoint or data in request body' 
            });
        }
        
        const filename = endpoint;
        const { itemId, idField, updatedFields } = data;
        const filePath = `${DATA_PATH_PREFIX}${filename}`;
        
        console.log(`[SERVER] Updating item in ${filename}: ${itemId}`);
        
        // Kiểm tra header có tồn tại
        const expectedHeaders = FILE_HEADERS[filename];
        if (!expectedHeaders) {
            return res.status(400).json({ 
                success: false,
                message: `Unsupported file: ${filename}` 
            });
        }
        
        // Lấy file hiện tại
        const fileData = await getGitHubFile(filePath);
        let records = await parseCsvText(fileData.content);
        
        // Tìm item cần cập nhật
        const itemIndex = records.findIndex(record => 
            String(record[idField]).trim() === String(itemId).trim()
        );
        
        if (itemIndex === -1) {
            return res.status(404).json({ 
                success: false,
                message: `Item ${itemId} not found in ${filename}` 
            });
        }
        
        // Cập nhật item
        records[itemIndex] = { ...records[itemIndex], ...updatedFields };
        
        // Chuyển đổi thành CSV
        const csvContent = convertToCsvText(records, expectedHeaders);
        
        // Cập nhật lên GitHub
        await updateGitHubFile(
            filePath, 
            csvContent, 
            fileData.sha, 
            `Update item ${itemId} in ${filename}`
        );
        
        res.json({ 
            success: true,
            message: `Item ${itemId} updated in ${filename} successfully` 
        });
        
    } catch (error) {
        console.error(`[SERVER] Error in update-item:`, error);
        res.status(500).json({ 
            success: false,
            message: `Failed to update item`,
            error: error.message 
        });
    }
});

app.post('/api/add-comment', async (req, res) => {
    console.log('[SERVER] add-comment called with body:', req.body);
    
    try {
        const { endpoint, data } = req.body;
        
        if (!endpoint || !data) {
            return res.status(400).json({ 
                success: false,
                message: 'Missing endpoint or data in request body' 
            });
        }
        
        const filename = endpoint;
        const newEntry = data;
        const filePath = `${DATA_PATH_PREFIX}${filename}`;
        
        console.log(`[SERVER] Adding comment to ${filename}:`, newEntry);
        
        // Kiểm tra header có tồn tại
        const expectedHeaders = FILE_HEADERS[filename];
        if (!expectedHeaders) {
            return res.status(400).json({ 
                success: false,
                message: `Unsupported file: ${filename}` 
            });
        }
        
        // Chuẩn hóa entry theo header
        const normalizedEntry = {};
        expectedHeaders.forEach(header => {
            normalizedEntry[header] = newEntry[header] || '';
        });
        
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
            `Add comment to ${filename}`
        );
        
        res.json({ 
            success: true,
            message: `Comment added to ${filename} successfully`,
            entryId: normalizedEntry[expectedHeaders[0]] 
        });
        
    } catch (error) {
        console.error(`[SERVER] Error in add-comment:`, error);
        res.status(500).json({ 
            success: false,
            message: `Failed to add comment`,
            error: error.message 
        });
    }
});

// Các hàm helper giữ nguyên từ server V3.0
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
    const dataRows = records.map(record =>
        headers.map(header => escapeCsvValue(record[header] || '')).join(',')
    );
    return [headerRow, ...dataRows].join('\n') + '\n';
}

function parseCsvText(csvText) {
    return new Promise((resolve, reject) => {
        const results = [];
        if (!csvText || !csvText.trim()) {
            resolve(results);
            return;
        }
        
        const readableStream = stream.Readable.from(csvText);
        readableStream
            .pipe(csvParser({ mapHeaders: ({ header }) => header.trim() }))
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', (error) => reject(error));
    });
}

async function getGitHubFile(filePath) {
    try {
        console.log(`[SERVER] Getting file: ${filePath}`);
        const { data } = await octokit.repos.getContent({
            owner, repo, path: filePath, ref: branch
        });
        
        if (data.type !== 'file') {
            throw new Error(`${filePath} is not a file`);
        }
        
        const content = data.content ? Buffer.from(data.content, 'base64').toString('utf-8') : '';
        console.log(`[SERVER] File ${filePath} loaded, SHA: ${data.sha}`);
        return { content, sha: data.sha };
    } catch (error) {
        if (error.status === 404) {
            console.log(`[SERVER] File ${filePath} not found, will create new`);
            return { content: '', sha: null };
        }
        throw error;
    }
}

async function updateGitHubFile(filePath, content, sha, message) {
    try {
        console.log(`[SERVER] Updating file: ${filePath}`);
        const response = await octokit.repos.createOrUpdateFileContents({
            owner, repo, path: filePath, message,
            content: Buffer.from(content).toString('base64'),
            sha, branch
        });
        console.log(`[SERVER] File ${filePath} updated successfully`);
        return response;
    } catch (error) {
        console.error(`[SERVER] Error updating file ${filePath}:`, error.message);
        throw error;
    }
}

// API: Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        message: 'MoldCutter Backend V3.0 - Compatible with V4.24'
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`[SERVER] MoldCutter Backend V3.0 running on port ${PORT}`);
    console.log('[SERVER] Compatible with V4.24 frontend');
    console.log('[SERVER] API endpoints:');
    console.log('  POST /api/add-log - Add log entry');
    console.log('  POST /api/update-item - Update item');
    console.log('  POST /api/add-comment - Add comment');
    console.log('  GET /api/health - Health check');
});

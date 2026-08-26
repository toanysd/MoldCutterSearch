const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');

const dataDir = path.join(__dirname, '../data');
const historyFile = path.join(dataDir, 'datachangehistory.csv');
const outDir = path.join(dataDir, 'aggregated_updates');

// Đảm bảo thư mục đầu ra tồn tại
if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

// Lưu trữ trạng thái cuối cùng
// Cấu trúc: latestUpdates[tableName][recordId][fieldName] = { ...data }
const latestUpdates = {};

fs.createReadStream(historyFile)
    .pipe(csv())
    .on('data', (row) => {
        // Bỏ qua nếu dữ liệu trống
        if (!row.TableName || !row.RecordID || !row.FieldName) return;

        // Chuẩn hóa tên bảng (bỏ .csv, chữ thường)
        const tableName = row.TableName.toLowerCase().replace(/\.csv$/, '');
        const recordId = row.RecordID;
        const fieldName = row.FieldName;

        if (!latestUpdates[tableName]) {
            latestUpdates[tableName] = {};
        }
        if (!latestUpdates[tableName][recordId]) {
            latestUpdates[tableName][recordId] = {};
        }

        const currentEntry = latestUpdates[tableName][recordId][fieldName];
        const rowTime = new Date(row.ChangedAt || 0).getTime();
        
        // Nếu chưa có ghi nhận, hoặc thời gian mới hơn thì cập nhật
        if (!currentEntry) {
            latestUpdates[tableName][recordId][fieldName] = row;
        } else {
            const currentTime = new Date(currentEntry.ChangedAt || 0).getTime();
            if (rowTime >= currentTime) {
                latestUpdates[tableName][recordId][fieldName] = row;
            }
        }
    })
    .on('end', async () => {
        console.log('Đã đọc xong lịch sử. Bắt đầu xuất các file tổng hợp...');
        
        for (const tableName of Object.keys(latestUpdates)) {
            const records = latestUpdates[tableName];
            const rowsToWrite = [];

            for (const recordId of Object.keys(records)) {
                for (const fieldName of Object.keys(records[recordId])) {
                    const data = records[recordId][fieldName];
                    rowsToWrite.push({
                        TableName: tableName, // Tên bảng đã chuẩn hóa
                        RecordIDField: data.RecordIDField,
                        RecordID: recordId,
                        FieldName: fieldName,
                        NewValue: data.NewValue,
                        ChangedAt: data.ChangedAt,
                        ChangedBy: data.ChangedBy
                    });
                }
            }

            if (rowsToWrite.length > 0) {
                const outPath = path.join(outDir, `updates_${tableName}.csv`);
                const csvWriter = createObjectCsvWriter({
                    path: outPath,
                    header: [
                        { id: 'TableName', title: 'TableName' },
                        { id: 'RecordIDField', title: 'RecordIDField' },
                        { id: 'RecordID', title: 'RecordID' },
                        { id: 'FieldName', title: 'FieldName' },
                        { id: 'NewValue', title: 'NewValue' },
                        { id: 'ChangedAt', title: 'ChangedAt' },
                        { id: 'ChangedBy', title: 'ChangedBy' }
                    ]
                });
                
                await csvWriter.writeRecords(rowsToWrite);
                console.log(`Đã xuất file: updates_${tableName}.csv (${rowsToWrite.length} thay đổi)`);
            }
        }
        console.log('Hoàn thành tổng hợp!');
    });

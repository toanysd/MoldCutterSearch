let moldData = [];
let cutterData = [];
let shiplogData = [];
let searchCategory = "mold"; // Mặc định là tìm khuôn

// 📌 Tải dữ liệu từ CSV
async function loadData() {
    try {
        const moldResponse = await fetch("https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/molds.csv");
        const cutterResponse = await fetch("https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/cutters.csv");
        const shiplogResponse = await fetch("https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/shiplog.csv");

        const moldCsv = await moldResponse.text();
        const cutterCsv = await cutterResponse.text();
        const shiplogCsv = await shiplogResponse.text();

        moldData = parseCSV(moldCsv);
        cutterData = parseCSV(cutterCsv);
        shiplogData = parseCSV(shiplogCsv);

        console.log("📂 Dữ liệu đã tải thành công!", { moldData, cutterData, shiplogData });
        updateColumnFilter();
    } catch (error) {
        console.error("❌ Lỗi tải dữ liệu:", error);
    }
}

// 📌 Chuyển đổi CSV thành mảng đối tượng
function parseCSV(csv) {
    const rows = csv.split("\n");
    const headers = rows[0].split(",");
    return rows.slice(1).map(row => {
        const values = row.split(",");
        return headers.reduce((obj, header, index) => {
            obj[header.trim()] = values[index] ? values[index].trim() : "";
            return obj;
        }, {});
    });
}

// 📌 Cập nhật danh sách bộ lọc
function updateColumnFilter() {
    searchCategory = document.getElementById("searchCategory").value;
    const columnFilter = document.getElementById("columnFilter");
    columnFilter.innerHTML = '<option value="all">全ての列 - Tất cả các cột</option>';

    const sampleData = searchCategory === "mold" ? moldData[0] : cutterData[0];
    Object.keys(sampleData).forEach(key => {
        columnFilter.innerHTML += `<option value="${key}">${key}</option>`;
    });

    document.getElementById("tableHeader").style.backgroundColor = searchCategory === "mold" ? "#3498db" : "#e67e22";
    searchData(); // Cập nhật dữ liệu ngay khi chọn loại tìm kiếm
}

// 📌 Tìm kiếm dữ liệu dựa vào từ khóa và bộ lọc
function searchData() {
    const query = document.getElementById("searchInput").value.toLowerCase();
    const columnFilter = document.getElementById("columnFilter").value;
    const data = searchCategory === "mold" ? moldData : cutterData;

    let filteredData = data.filter(row => {
        if (columnFilter === "all") {
            return Object.values(row).some(value => value.toLowerCase().includes(query));
        } else {
            return row[columnFilter] && row[columnFilter].toLowerCase().includes(query);
        }
    });

    displayData(filteredData);
}

// 📌 Hiển thị dữ liệu trong bảng kết quả
function displayData(data) {
    const tableBody = document.querySelector("#dataTable tbody");
    tableBody.innerHTML = "";

    data.forEach(row => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${row.MoldID || row.CutterID}</td>
            <td>${row.MoldCode || row.CutterNo}</td>
            <td>${row.MoldName || row.CutterDesignName}</td>
            <td>${row.MoldDesignDim || row.CutterDim}</td>
            <td>${row.RackLayerID}</td>
        `;
        tr.onclick = () => showDetails(row);
        tableBody.appendChild(tr);
    });
}

const fieldTranslations = {
    "MoldID": "金型ID",
    "MoldName": "金型名",
    "MoldCode": "金型コード",
    "MoldDate": "作成日",
    "MoldUsageStatus": "使用状況",
    "TeflonCoating": "テフロンコーティング",
    "MoldProcessStatus": "加工状況",
    "MoldReturning": "返却状況",
    "MoldReturnedDate": "返却日",
    "MoldDisposing": "廃棄状況",
    "MoldDisposedDate": "廃棄日",
    "MoldDesignCode": "設計コード",
    "MoldDesignID": "設計ID",
    "MoldDesignName": "設計名",
    "TrayInfoForMoldDesign": "トレイ情報",
    "MoldDesignLength": "金型長さ",
    "MoldDesignWidth": "金型幅",
    "MoldDesignHeight": "金型高さ",
    "MoldDesignDepth": "金型深さ",
    "MoldDesignWeight": "金型重量",
    "MoldDesignDim": "金型寸法",
    "DesignForPlasticType": "適用プラスチック",
    "MoldSetupType": "設置タイプ",
    "PieceCount": "製品数",
    "Pitch": "ピッチ",
    "CutlineX": "カットラインX",
    "CutlineY": "カットラインY",
    "CornerR": "コーナーR",
    "ChamferC": "面取りC",
    "TextContent": "刻印内容",
    "UnderDepth": "アンダーカット深さ",
    "DraftAngle": "抜き勾配",
    "UnitPrice": "単価",
    "RackLayerID": "ラックID",
    "RackLayerNotes": "ラックメモ",
    "RackSymbol": "ラック記号",
    "RackLocation": "ラック位置",
    "RackNotes": "ラック備考",
    
    // Dao cắt (Cutter)
    "CutterID": "抜型ID",
    "CutterNo": "抜型番号",
    "CutterDesignName": "抜型設計名",
    "CutterType": "抜型種類",
    "PlasticCutType": "適用プラスチック",
    "BladeCount": "刃数",
    "PPcushionUse": "PPクッション使用",

    // Lịch sử vận chuyển
    "ShipDate": "発送日",
    "FromCompanyID": "発送元",
    "ToCompanyID": "発送先",
    "ShipNotes": "備考",
    "DateEntry": "記録日"
};



// 📌 Hiển thị thông tin chi tiết
function showDetails(row) {
    console.log("📌 Hiển thị chi tiết:", row);

    let detailHTML = `
        <button id="viewShipLog" onclick="showShipLog('${row.MoldID || row.CutterID}')">📦 運送履歴を見る - Xem lịch sử vận chuyển</button>
        <h2>📋 詳細情報 - Chi tiết</h2>
        <table class="detail-table">
            <tbody>
    `;

    // 📌 Xác định loại dữ liệu (Khuôn / Dao cắt)
    const isMold = searchCategory === "mold";

    // 📌 Xác định thứ tự hiển thị
    const fieldOrder = isMold
        ? ["MoldID", "MoldName", "MoldCode", "RackLayerID", "MoldDate", "MoldUsageStatus", "MoldProcessStatus", "MoldDesignCode", "MoldDesignName", "MoldDesignDim", "DesignForPlasticType", "UnitPrice"]
        : ["CutterID", "CutterNo", "CutterDesignName", "RackLayerID", "CutterType", "PlasticCutType", "PPcushionUse", "BladeCount"];

    // 📌 Xác định tên hiển thị song ngữ
    const fieldNames = {
        "MoldID": "金型ID - MoldID",
        "MoldName": "金型名 - MoldName",
        "MoldCode": "コード - Mã",
        "RackLayerID": "ラックID - Giá để khuôn",
        "MoldDate": "作成日 - Ngày tạo",
        "MoldUsageStatus": "利用状況 - Trạng thái sử dụng",
        "MoldProcessStatus": "加工状況 - Trạng thái gia công",
        "MoldDesignCode": "設計コード - Mã thiết kế",
        "MoldDesignName": "設計名 - Tên thiết kế",
        "MoldDesignDim": "設計寸法 - Kích thước",
        "DesignForPlasticType": "プラスチック種類 - Loại nhựa",
        "UnitPrice": "価格 - Giá thành",

        "CutterID": "抜型ID - CutterID",
        "CutterNo": "抜型番号 - CutterNo",
        "CutterDesignName": "抜型デザイン - Tên thiết kế Dao cắt",
        "CutterType": "抜型種類 - Loại dao cắt",
        "PlasticCutType": "プラスチック種類 - Loại nhựa cắt",
        "PPcushionUse": "クッション使用 - Dùng PP cushion",
        "BladeCount": "刃の数 - Số lưỡi dao"
    };

    // 📌 Tạo bảng với hai cột: Tiêu đề - Giá trị
    fieldOrder.forEach(key => {
        detailHTML += `
            <tr>
                <td class="detail-label">${fieldNames[key]}</td>
                <td class="detail-value">${row[key] || "N/A"}</td>
            </tr>
        `;
    });

    detailHTML += `
            </tbody>
        </table>
    `;

    // 📌 Cập nhật nội dung vào bảng chi tiết
    document.getElementById("detailContent").innerHTML = detailHTML;

    // 📌 Hiển thị popup
    const popup = document.getElementById("detailView");
    popup.style.display = "block";
    popup.style.visibility = "visible";
    popup.style.opacity = "1";
    popup.classList.add("show");
}


// 📌 Đóng bảng chi tiết
function closeDetail() {
    console.log("🔴 Đóng popup...");
    const popup = document.getElementById("detailView");
    popup.style.opacity = "0";
    setTimeout(() => {
        popup.style.display = "none";
        popup.style.visibility = "hidden";
        popup.classList.remove("show");
    }, 300);
}

function formatDate(dateString) {
    if (!dateString) return ""; // Nếu không có dữ liệu, trả về rỗng

    let date = new Date(dateString);

    if (isNaN(date.getTime())) {
        // Nếu dữ liệu không phải là ngày hợp lệ, giữ nguyên
        return dateString;
    }

    let year = date.getFullYear();
    let month = (date.getMonth() + 1).toString().padStart(2, "0"); // Thêm 0 nếu cần
    let day = date.getDate().toString().padStart(2, "0");

    return `${year}/${month}/${day}`;
}



// 📌 Hiển thị lịch sử vận chuyển
function showShipLog(itemID) {
    console.log(`📦 Xem lịch sử vận chuyển cho ID: ${itemID}`);

    let shipHistory = shiplogData.filter(log => log.MoldID === itemID || log.CutterID === itemID);

let shipHistoryHTML = `
    <h2>📦 運送履歴 - Lịch sử vận chuyển</h2>
    <table>
        <thead>
            <tr>
                <th>${fieldTranslations["ShipDate"]}</th>
                <th>${fieldTranslations["FromCompanyID"]}</th>
                <th>${fieldTranslations["ToCompanyID"]}</th>
                <th>${fieldTranslations["ShipNotes"]}</th>
            </tr>
        </thead>
        <tbody>
            ${shipHistory.length > 0 ? shipHistory.map(log => `
                <tr>
                    <td>${formatDate(log.ShipDate)}</td>
                    <td>${log.FromCompanyID}</td>
                    <td>${log.ToCompanyID}</td>
                    <td>${log.ShipNotes}</td>
                </tr>
            `).join("") : `<tr><td colspan="4">📭 データなし - Không có dữ liệu vận chuyển</td></tr>`}
        </tbody>
    </table>
`;


    document.getElementById("shipLogContent").innerHTML = shipHistoryHTML;
    document.getElementById("shipLogView").classList.add("show");
}

// 📌 Đóng bảng lịch sử vận chuyển
function closeShipLog() {
    document.getElementById("shipLogView").classList.remove("show");
}

// 📌 Đặt lại tìm kiếm
function resetSearch() {
    document.getElementById("searchInput").value = "";
    searchData();
}

window.onload = loadData;

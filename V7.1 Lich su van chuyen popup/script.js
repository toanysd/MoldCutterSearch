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

// 📌 Hiển thị thông tin chi tiết
function showDetails(row) {
    console.log("📌 Hiển thị chi tiết:", row);

    const detailContainer = document.getElementById("detailContent");
    detailContainer.innerHTML = `
        <button id="viewShipLog" onclick="showShipLog('${row.MoldID || row.CutterID}')">📦 Xem lịch sử vận chuyển</button>
        <h2>📋 Chi tiết</h2>
        ${Object.entries(row).map(([key, value]) => `<p><strong>${key}:</strong> ${value}</p>`).join("")}
    `;

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

// 📌 Hiển thị lịch sử vận chuyển
function showShipLog(itemID) {
    console.log(`📦 Xem lịch sử vận chuyển cho ID: ${itemID}`);

    let shipHistory = shiplogData.filter(log => log.MoldID === itemID || log.CutterID === itemID);

    let shipHistoryHTML = `
        <h2>📦 Lịch sử vận chuyển</h2>
        <table>
            <thead>
                <tr>
                    <th>Ngày gửi</th>
                    <th>Từ</th>
                    <th>Đến</th>
                    <th>Ghi chú</th>
                </tr>
            </thead>
            <tbody>
                ${shipHistory.length > 0 ? shipHistory.map(log => `
                    <tr>
                        <td>${log.ShipDate}</td>
                        <td>${log.FromCompanyID}</td>
                        <td>${log.ToCompanyID}</td>
                        <td>${log.ShipNotes}</td>
                    </tr>
                `).join("") : "<tr><td colspan='4'>Không có dữ liệu vận chuyển</td></tr>"}
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

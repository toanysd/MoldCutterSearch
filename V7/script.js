let moldData = [];
let cutterData = [];
let shiplogData = [];
let searchCategory = "mold"; // Mặc định là tìm khuôn

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

        console.log("📂 Dữ liệu tải xong!", { moldData, cutterData, shiplogData });
        updateColumnFilter();
    } catch (error) {
        console.error("❌ Lỗi tải dữ liệu:", error);
    }
}

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

function updateColumnFilter() {
    searchCategory = document.getElementById("searchCategory").value;
    const columnFilter = document.getElementById("columnFilter");
    columnFilter.innerHTML = '<option value="all">全ての列 - Tất cả các cột</option>';

    const sampleData = searchCategory === "mold" ? moldData[0] : cutterData[0];
    Object.keys(sampleData).forEach(key => {
        columnFilter.innerHTML += `<option value="${key}">${key}</option>`;
    });

    document.getElementById("tableHeader").style.backgroundColor = searchCategory === "mold" ? "#3498db" : "#e67e22";
    searchData();
}

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

function showDetails(row) {
    console.log("📌 Hiển thị chi tiết:", row);

    let shipHistory = shiplogData.filter(log => log.MoldID === row.MoldID || log.CutterID === row.CutterID);
    let shipHistoryHTML = shipHistory.length ? shipHistory.map(log => `<p>${log.ShipDate} - ${log.ToCompanyID}</p>`).join("") : "<p>🔹 Không có dữ liệu vận chuyển.</p>";

    document.getElementById("detailContent").innerHTML = `
        <h2>📋 Chi tiết</h2>
        <div class="detail-section">
            <h3>🚚 Lịch sử vận chuyển</h3>
            ${shipHistoryHTML}
        </div>
        ${Object.entries(row).map(([key, value]) => `<p><strong>${key}:</strong> ${value}</p>`).join("")}
    `;

    const popup = document.getElementById("detailView");
    popup.style.display = "block";
    popup.style.visibility = "visible";
    popup.style.opacity = "1";
    popup.classList.add("show");
}

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

function resetSearch() {
    document.getElementById("searchInput").value = "";
    searchData();
}

window.onload = loadData;

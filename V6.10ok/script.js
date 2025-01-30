let moldData = [];
let cutterData = [];
let shipLogData = [];
let searchCategory = "mold"; // Mặc định là tìm khuôn

async function loadData() {
    try {
        const moldResponse = await fetch("https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/molds.csv");
        const cutterResponse = await fetch("https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/cutters.csv");
        const shipLogResponse = await fetch("https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/shiplog.csv");

        const moldCsv = await moldResponse.text();
        const cutterCsv = await cutterResponse.text();
        const shipLogCsv = await shipLogResponse.text();

        moldData = parseCSV(moldCsv);
        cutterData = parseCSV(cutterCsv);
        shipLogData = parseCSV(shipLogCsv);

        console.log("Mold Data:", moldData);
        console.log("Cutter Data:", cutterData);
        console.log("Ship Log Data:", shipLogData);

        updateColumnFilter();
    } catch (error) {
        console.error("データのロードエラー - Lỗi tải dữ liệu:", error);
    }
}

function parseCSV(csv) {
    const rows = csv.split("\n").map(row => row.trim()).filter(row => row);
    if (rows.length < 2) return [];

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
    if (!sampleData) return;

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

        tr.addEventListener("click", () => showDetails(row)); // ✅ Đảm bảo sự kiện click hoạt động
        tableBody.appendChild(tr);
    });

    console.log("Data displayed successfully:", data.length);
}

function showDetails(row) {
    console.log("📌 Gọi showDetails với dữ liệu:", row);

    if (!row) {
        console.error("❌ Lỗi: Dữ liệu trống", row);
        return;
    }

    const detailContainer = document.getElementById("detailContent");
    detailContainer.innerHTML = Object.entries(row)
        .map(([key, value]) => `<p><strong>${key}:</strong> ${value}</p>`)
        .join("");

    console.log("✅ Nội dung chi tiết đã cập nhật!");

    const popup = document.getElementById("detailView");

    // 🚀 Đảm bảo các thuộc tính hiển thị đúng
    popup.classList.add("show");
    popup.style.display = "block";
    popup.style.visibility = "visible";
    popup.style.opacity = "1";
    popup.style.zIndex = "9999";

    console.log("✅ Popup hiển thị thành công!");
}

function closeDetail() {
    const popup = document.getElementById("detailView");
    popup.style.opacity = "0";
    setTimeout(() => {
        popup.style.display = "none";
        popup.style.visibility = "hidden";
    }, 300);
    console.log("🔴 Đã đóng popup!");
}



function resetSearch() {
    document.getElementById("searchInput").value = "";
    searchData();
}

window.onload = loadData;

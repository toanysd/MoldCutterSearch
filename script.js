let moldData = [];
let cutterData = [];
let searchCategory = "mold"; // Mặc định là tìm khuôn

// Tải dữ liệu từ CSV trên GitHub
async function loadData() {
    try {
        const moldResponse = await fetch("https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/molds.csv");
        const cutterResponse = await fetch("https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/cutters.csv");

        const moldCsv = await moldResponse.text();
        const cutterCsv = await cutterResponse.text();

        moldData = parseCSV(moldCsv);
        cutterData = parseCSV(cutterCsv);

        updateColumnFilter();
    } catch (error) {
        console.error("データのロードエラー - Lỗi tải dữ liệu:", error);
    }
}

// Chuyển đổi CSV thành mảng đối tượng
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

// Cập nhật bộ lọc cột dựa trên danh mục tìm kiếm
function updateColumnFilter() {
    const columnFilter = document.getElementById("columnFilter");
    columnFilter.innerHTML = '<option value="all">全ての列 - Tất cả các cột</option>';
    
    const sampleData = searchCategory === "mold" ? moldData[0] : cutterData[0];
    Object.keys(sampleData).forEach(key => {
        columnFilter.innerHTML += `<option value="${key}">${key}</option>`;
    });
}

// Tìm kiếm dữ liệu
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

// Hiển thị kết quả tìm kiếm
function displayData(data) {
    const tableBody = document.getElementById("dataTable");
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

// Hiển thị thông tin chi tiết
function showDetails(row) {
    const detailView = document.getElementById("detailView");
    const detailContent = document.getElementById("detailContent");
    detailContent.innerHTML = Object.entries(row).map(([key, value]) => 
        `<p><strong>${key}:</strong> ${value}</p>`).join("");

    detailView.classList.remove("hidden");
}

// Đóng cửa sổ chi tiết
function closeDetail() {
    document.getElementById("detailView").classList.add("hidden");
}

// Lắng nghe thay đổi loại tìm kiếm
document.getElementById("searchCategory").addEventListener("change", function() {
    searchCategory = this.value;
    updateColumnFilter();
});

window.onload = loadData;

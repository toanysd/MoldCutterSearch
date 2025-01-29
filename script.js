let dataMolds = [];
let dataCutters = [];
let selectedData = [];

// Tải dữ liệu CSV
async function loadData() {
    dataMolds = await fetchCSV('data/molds.csv');
    dataCutters = await fetchCSV('data/cutters.csv');
    updateColumnFilter();
}

// Đọc dữ liệu từ CSV
async function fetchCSV(file) {
    const response = await fetch(file);
    const csv = await response.text();
    const rows = csv.split("\n").map(row => row.split(","));
    const headers = rows.shift();
    return rows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] || ""])));
}

// Cập nhật bộ lọc cột dựa vào dữ liệu
function updateColumnFilter() {
    const filter = document.getElementById("columnFilter");
    filter.innerHTML = '<option value="all">🔍 Tất cả cột</option>';
    const headers = Object.keys(dataMolds[0]);
    headers.forEach(header => {
        filter.innerHTML += `<option value="${header}">${header}</option>`;
    });
}

// Tìm kiếm
function searchData() {
    const keyword = document.getElementById("searchBox").value.toLowerCase();
    const type = document.getElementById("searchType").value;
    const column = document.getElementById("columnFilter").value;

    selectedData = (type === "mold") ? dataMolds : dataCutters;

    let results = selectedData.filter(row => 
        column === "all"
            ? Object.values(row).some(val => val.toLowerCase().includes(keyword))
            : row[column] && row[column].toLowerCase().includes(keyword)
    );

    displayResults(results);
}

// Hiển thị kết quả
function displayResults(results) {
    const tableBody = document.getElementById("resultTable");
    tableBody.innerHTML = "";
    
    results.forEach(row => {
        let tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${row.ID}</td>
            <td>${row.Mã}</td>
            <td><a href="#" onclick="showDetails('${row.ID}')">${row.Tên}</a></td>
            <td>${row.Kích_thước}</td>
            <td>${row.Vị_trí_giá}</td>
        `;
        tableBody.appendChild(tr);
    });
}

// Hiển thị chi tiết
function showDetails(id) {
    let item = selectedData.find(row => row.ID === id);
    let detailsContent = document.getElementById("detailsContent");
    detailsContent.innerHTML = Object.entries(item)
        .map(([key, value]) => `<p><strong>${key}</strong>: ${value}</p>`).join("");

    document.getElementById("detailsPopup").classList.remove("hidden");
}

// Đóng popup
function closePopup() {
    document.getElementById("detailsPopup").classList.add("hidden");
}

window.onload = loadData;

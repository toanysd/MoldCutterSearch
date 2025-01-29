let data = [];
const csvLinks = {
    cutter: "https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/cutters.csv",
    mold: "https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/molds.csv",
    shiplog: "https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/shiplog.csv"
};

async function loadData(type) {
    const url = csvLinks[type];
    try {
        const response = await fetch(url);
        const csvData = await response.text();
        const rows = csvData.split("\n");
        const headers = rows[0].split(",");
        data = rows.slice(1).map(row => {
            const values = row.split(",");
            return headers.reduce((obj, header, index) => {
                obj[header] = values[index] || "";
                return obj;
            }, {});
        });
    } catch (error) {
        console.error("データのロードエラー / Lỗi tải dữ liệu:", error);
    }
}

function searchData() {
    const query = document.getElementById("searchInput").value.toLowerCase();
    const searchType = document.getElementById("searchType").value;

    let filteredData = data.filter(row => 
        Object.values(row).some(value => value.toLowerCase().includes(query))
    );

    displayData(filteredData);
}

function displayData(results) {
    const tableBody = document.getElementById("resultTable");
    tableBody.innerHTML = "";

    results.forEach(row => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${row.CutterID || row.MoldID}</td>
            <td>${row.CutterNo || row.MoldName}</td>
            <td>${row.CutterDesignName || row.MoldCode}</td>
            <td>${row.CutterType || row.MoldUsageStatus}</td>
        `;
        tr.addEventListener("click", () => showDetails(row));
        tableBody.appendChild(tr);
    });
}

function showDetails(row) {
    const detailView = document.getElementById("detailView");
    detailView.innerHTML = `<h3>詳細 / Chi tiết</h3>`;
    for (let key in row) {
        detailView.innerHTML += `<p><strong>${key}:</strong> ${row[key]}</p>`;
    }
    detailView.style.display = "block";
}

window.onload = () => loadData("cutter");

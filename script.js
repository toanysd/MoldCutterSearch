// Global variables
let allData = {
    molds: [],
    cutters: [],
    customers: [],
    molddesign: [],
    moldcutter: [],
    shiplog: [],
    locationlog: [],
    employees: [],
    racklayers: [],
    racks: []
};

let searchState = {
    searchInput: '',
    searchCategory: 'all',
    columnFilter: 'all',
    locationFilter: 'all',
    statusFilter: 'all',
    customerFilter: 'all',
    plasticFilter: 'all',
    currentPage: 1,
    pageSize: 50,
    sortField: '',
    sortDirection: 'asc',
    selectedItems: []
};


let filteredData = [];
let selectedItems = new Set();
let currentPage = 1;
let pageSize = 50;
let sortField = '';
let sortDirection = 'asc';
let searchTimeout = null;

// GitHub Raw URL
const GITHUB_BASE_URL = "https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/";

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    showLoading(true);
    loadAllData().then(() => {
        initializeFilters();
        performSearch();
        showLoading(false);
        console.log('データ読み込み完了 - Dữ liệu đã tải xong');
    }).catch(error => {
        console.error('データ読み込みエラー:', error);
        showLoading(false);
        showError(`エラー: ${error.message}`);
    });
});

// Cập nhật function displayData - Chỉ cho phép click vào code link
function displayData() {
    const tableBody = document.querySelector('#dataTable tbody');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = pageSize === 'all' ? filteredData.length : startIndex + parseInt(pageSize);
    const pageData = filteredData.slice(startIndex, endIndex);
    
    pageData.forEach(item => {
        const row = document.createElement('tr');
        const itemId = item.MoldID || item.CutterID || '';
        const itemType = item.MoldID ? 'mold' : 'cutter';
        
        // Check if selected
        if (selectedItems.has(itemId)) {
            row.classList.add('selected');
        }
        
        row.innerHTML = `
            <td class="select-col">
                <input type="checkbox" ${selectedItems.has(itemId) ? 'checked' : ''} 
                       onchange="toggleSelection('${itemId}', this.checked)">
            </td>
            <td>${itemId}</td>
            <td>
                <a href="detail.html?id=${itemId}&type=${itemType}" class="code-link" onclick="saveSearchState()">
                    ${item.displayCode}
                </a>
            </td>
            <td>${item.displayName}</td>
            <td>${item.displayDimensions}</td>
            <td>${item.displayLocation}</td>
            <td>${item.displayCustomer}</td>
            <td>
                <span class="status-badge ${item.currentStatus?.class || ''}">${item.currentStatus?.text || ''}</span>
            </td>
        `;
        
        // Bỏ click event cho toàn bộ row
        // Chỉ code link mới có thể click
        
        tableBody.appendChild(row);
    });
    
    updateSelectAllCheckbox();
}

// Save search state khi navigate
function saveSearchState() {
    searchState = {
        searchInput: document.getElementById('searchInput')?.value || '',
        searchCategory: document.getElementById('searchCategory')?.value || 'all',
        columnFilter: document.getElementById('columnFilter')?.value || 'all',
        locationFilter: document.getElementById('locationFilter')?.value || 'all',
        statusFilter: document.getElementById('statusFilter')?.value || 'all',
        customerFilter: document.getElementById('customerFilter')?.value || 'all',
        plasticFilter: document.getElementById('plasticFilter')?.value || 'all',
        currentPage: currentPage,
        pageSize: pageSize,
        sortField: sortField,
        sortDirection: sortDirection,
        selectedItems: Array.from(selectedItems)
    };
    localStorage.setItem('moldSearchState', JSON.stringify(searchState));
}

// Restore search state khi back
function restoreSearchState() {
    const saved = localStorage.getItem('moldSearchState');
    if (saved) {
        try {
            const state = JSON.parse(saved);
            
            // Restore form values
            const elements = [
                'searchInput', 'searchCategory', 'columnFilter', 
                'locationFilter', 'statusFilter', 'customerFilter', 'plasticFilter'
            ];
            
            elements.forEach(id => {
                const element = document.getElementById(id);
                if (element && state[id]) {
                    element.value = state[id];
                }
            });
            
            // Restore pagination and sorting
            if (state.currentPage) currentPage = state.currentPage;
            if (state.pageSize) pageSize = state.pageSize;
            if (state.sortField) sortField = state.sortField;
            if (state.sortDirection) sortDirection = state.sortDirection;
            
            // Restore selected items
            if (state.selectedItems) {
                selectedItems = new Set(state.selectedItems);
            }
            
            // Update page size select
            const pageSizeSelect = document.getElementById('pageSize');
            if (pageSizeSelect && state.pageSize) {
                pageSizeSelect.value = state.pageSize;
            }
            
        } catch (e) {
            console.warn('Failed to restore search state:', e);
        }
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    showLoading(true);
    loadAllData().then(() => {
        initializeFilters();
        restoreSearchState(); // Restore state trước khi search
        performSearch();
        showLoading(false);
        console.log('データ読み込み完了 - Dữ liệu đã tải xong');
    }).catch(error => {
        console.error('データ読み込みエラー:', error);
        showLoading(false);
        showError(`エラー: ${error.message}`);
    });
});

// Cập nhật resetSearch để clear state
function resetSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchCategory = document.getElementById('searchCategory');
    const columnFilter = document.getElementById('columnFilter');
    const locationFilter = document.getElementById('locationFilter');
    const statusFilter = document.getElementById('statusFilter');
    const customerFilter = document.getElementById('customerFilter');
    const plasticFilter = document.getElementById('plasticFilter');
    
    if (searchInput) searchInput.value = '';
    if (searchCategory) searchCategory.value = 'all';
    if (columnFilter) columnFilter.value = 'all';
    if (locationFilter) locationFilter.value = 'all';
    if (statusFilter) statusFilter.value = 'all';
    if (customerFilter) customerFilter.value = 'all';
    if (plasticFilter) plasticFilter.value = 'all';
    
    currentPage = 1;
    sortField = '';
    sortDirection = 'asc';
    selectedItems.clear();
    
    // Clear saved state
    localStorage.removeItem('moldSearchState');
    
    performSearch();
}


// Real-time search input handler
function handleSearchInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        performSearch();
    }, 300);
}

// Filter change handler
function handleFilterChange() {
    performSearch();
}

// Load all data từ GitHub
async function loadAllData() {
    const dataFiles = [
        { key: 'molds', file: 'molds.csv', required: true },
        { key: 'cutters', file: 'cutters.csv', required: true },
        { key: 'customers', file: 'customers.csv', required: false },
        { key: 'molddesign', file: 'molddesign.csv', required: false },
        { key: 'moldcutter', file: 'molcutter.csv', required: false }, // Tên file đúng
        { key: 'shiplog', file: 'shiplog.csv', required: false },
        { key: 'locationlog', file: 'locationlog.csv', required: false },
        { key: 'employees', file: 'employees.csv', required: false },
        { key: 'racklayers', file: 'racklayers.csv', required: false },
        { key: 'racks', file: 'racks.csv', required: false }
    ];

    const promises = dataFiles.map(async ({ key, file, required }) => {
        try {
            console.log(`Loading ${file}...`);
            const response = await fetch(`${GITHUB_BASE_URL}${file}`);
            
            if (!response.ok) {
                if (required) {
                    throw new Error(`Required file ${file} not found`);
                }
                console.warn(`Optional file ${file} not found`);
                return { key, data: [] };
            }
            
            const csvText = await response.text();
            const data = parseCSV(csvText);
            console.log(`${file} loaded: ${data.length} records`);
            
            return { key, data };
        } catch (error) {
            if (required) {
                throw error;
            }
            console.warn(`Error loading ${file}:`, error);
            return { key, data: [] };
        }
    });

    const results = await Promise.all(promises);
    results.forEach(({ key, data }) => {
        allData[key] = data;
    });

    // Fix moldcutter key name
    if (allData.moldcutter && allData.moldcutter.length === 0 && allData.molcutter) {
        allData.moldcutter = allData.molcutter;
    }

    processDataRelationships();
}

// Process data relationships
function processDataRelationships() {
    // Create lookup maps
    const moldDesignMap = new Map();
    allData.molddesign.forEach(design => {
        moldDesignMap.set(design.MoldDesignID, design);
    });
    
    const customerMap = new Map();
    allData.customers.forEach(customer => {
        customerMap.set(customer.CustomerID, customer);
    });

    // Process molds với kích thước kết hợp
    allData.molds = allData.molds.map(mold => {
        const design = moldDesignMap.get(mold.MoldDesignID) || {};
        const customer = customerMap.get(mold.CustomerID) || {};
        
        return {
            ...mold,
            designInfo: design,
            customerInfo: customer,
            relatedCutters: getRelatedCutters(mold.MoldID),
            shipHistory: getShipHistory('MOLD', mold.MoldID),
            locationHistory: getLocationHistory('MOLD', mold.MoldID),
            currentStatus: getCurrentStatus(mold),
            displayCode: mold.MoldCode || '',
            displayName: mold.MoldName || '',
            displayDimensions: createCombinedDimensionString(mold, design),
            displayLocation: mold.RackLayerID || '',
            displayCustomer: getCustomerDisplayName(customer),
            displayPlasticType: design.DesignForPlasticType || mold.DefaultPlasticType || '',
            lastUpdate: getLastUpdateDate(mold),
            itemType: 'mold'
        };
    });

    // Process cutters với kích thước kết hợp
    allData.cutters = allData.cutters.map(cutter => {
        const customer = customerMap.get(cutter.CustomerID) || {};
        
        return {
            ...cutter,
            customerInfo: customer,
            relatedMolds: getRelatedMolds(cutter.CutterID),
            shipHistory: getShipHistory('CUTTER', cutter.CutterID),
            locationHistory: getLocationHistory('CUTTER', cutter.CutterID),
            currentStatus: getCurrentStatus(cutter),
            displayCode: cutter.CutterNo || '',
            displayName: cutter.CutterDesignName || cutter.CutterName || '',
            displayDimensions: createCutterCombinedDimensionString(cutter),
            displayLocation: cutter.RackLayerID || '',
            displayCustomer: getCustomerDisplayName(customer),
            displayPlasticType: cutter.PlasticCutType || '',
            lastUpdate: getLastUpdateDate(cutter),
            itemType: 'cutter'
        };
    });
}

// Create combined dimension string (Dài x Rộng x Cao)
function createCombinedDimensionString(mold, design) {
    // Priority: Design dimensions > Mold dimensions
    if (design.MoldDesignLength && design.MoldDesignWidth && design.MoldDesignHeight) {
        return `${design.MoldDesignLength}x${design.MoldDesignWidth}x${design.MoldDesignHeight}`;
    }
    
    if (design.MoldDesignDim) {
        return design.MoldDesignDim;
    }
    
    if (mold.MoldLength && mold.MoldWidth && mold.MoldHeight) {
        return `${mold.MoldLength}x${mold.MoldWidth}x${mold.MoldHeight}`;
    }
    
    return mold.MoldDescription || '';
}

function createCutterCombinedDimensionString(cutter) {
    if (cutter.CutterLength && cutter.CutterWidth && cutter.CutterHeight) {
        return `${cutter.CutterLength}x${cutter.CutterWidth}x${cutter.CutterHeight}`;
    }
    
    return cutter.CutterDim || cutter.OverallDimensions || '';
}

// Get current status
function getCurrentStatus(item) {
    if (item.MoldReturning === 'TRUE' || item.MoldReturning === true) {
        return { status: 'returned', text: '返却済み - Đã trả về', class: 'status-returned' };
    }
    if (item.MoldDisposing === 'TRUE' || item.MoldDisposing === true) {
        return { status: 'disposed', text: '廃棄済み - Đã hủy', class: 'status-disposed' };
    }
    
    const history = getShipHistory(item.MoldID ? 'MOLD' : 'CUTTER', item.MoldID || item.CutterID);
    if (history.length > 0) {
        const latest = history[0];
        if (latest.ToCompanyID && latest.ToCompanyID !== 'YSD') {
            return { status: 'shipped', text: '出荷済み - Đã gửi đi', class: 'status-shipped' };
        }
    }
    
    return { status: 'available', text: '利用可能 - Có sẵn', class: 'status-available' };
}

// Get customer display name
function getCustomerDisplayName(customer) {
    if (!customer || !customer.CustomerID) return '';
    return customer.CustomerShortName || customer.CustomerName || customer.CustomerID;
}

// Get related items
function getRelatedCutters(moldID) {
    if (!moldID) return [];
    const relations = allData.moldcutter.filter(mc => mc.MoldID === moldID);
    return relations.map(rel => {
        const cutter = allData.cutters.find(c => c.CutterID === rel.CutterID);
        return cutter || {};
    }).filter(c => c.CutterID);
}

function getRelatedMolds(cutterID) {
    if (!cutterID) return [];
    const relations = allData.moldcutter.filter(mc => mc.CutterID === cutterID);
    return relations.map(rel => {
        const mold = allData.molds.find(m => m.MoldID === rel.MoldID);
        return mold || {};
    }).filter(m => m.MoldID);
}

// Get shipping history
function getShipHistory(itemType, itemID) {
    if (!itemID) return [];
    return allData.shiplog.filter(log => {
        if (itemType === 'MOLD') return log.MoldID === itemID;
        if (itemType === 'CUTTER') return log.CutterID === itemID;
        return false;
    }).sort((a, b) => new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0));
}

// Get location history
function getLocationHistory(itemType, itemID) {
    if (!itemID) return [];
    return allData.locationlog.filter(log => {
        if (itemType === 'MOLD') return log.MoldID === itemID;
        if (itemType === 'CUTTER') return log.CutterID === itemID;
        return false;
    }).sort((a, b) => new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0));
}

// Get last update date
function getLastUpdateDate(item) {
    const shipHistory = getShipHistory(item.MoldID ? 'MOLD' : 'CUTTER', item.MoldID || item.CutterID);
    if (shipHistory.length > 0) return shipHistory[0].DateEntry;
    return item.MoldDate || item.MoldEntry || item.DateEntry || '';
}

// Initialize filters
function initializeFilters() {
    updateColumnFilter();
    updateLocationFilter();
    updateCustomerFilter();
    updatePlasticFilter();
}

// Update filter options
function updateColumnFilter() {
    const columnFilter = document.getElementById('columnFilter');
    if (!columnFilter) return;
    
    columnFilter.innerHTML = '<option value="all">全て - Tất cả</option>';
    
    const fieldTranslations = {
        'displayCode': 'コード - Mã',
        'displayName': '名称 - Tên',
        'displayDimensions': 'サイズ - Kích thước',
        'displayLocation': '場所 - Vị trí',
        'displayCustomer': '顧客 - Khách hàng',
        'displayPlasticType': 'プラスチック - Nhựa'
    };
    
    Object.entries(fieldTranslations).forEach(([key, label]) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = label;
        columnFilter.appendChild(option);
    });
}

function updateLocationFilter() {
    const locationFilter = document.getElementById('locationFilter');
    if (!locationFilter) return;
    
    locationFilter.innerHTML = '<option value="all">全て - Tất cả</option>';
    
    const locations = new Set();
    [...allData.molds, ...allData.cutters].forEach(item => {
        if (item.displayLocation) locations.add(item.displayLocation);
    });
    
    Array.from(locations).sort().forEach(location => {
        const option = document.createElement('option');
        option.value = location;
        option.textContent = location;
        locationFilter.appendChild(option);
    });
}

function updateCustomerFilter() {
    const customerFilter = document.getElementById('customerFilter');
    if (!customerFilter) return;
    
    customerFilter.innerHTML = '<option value="all">全て - Tất cả</option>';
    
    const customers = new Set();
    [...allData.molds, ...allData.cutters].forEach(item => {
        if (item.displayCustomer) customers.add(item.displayCustomer);
    });
    
    Array.from(customers).sort().forEach(customer => {
        const option = document.createElement('option');
        option.value = customer;
        option.textContent = customer;
        customerFilter.appendChild(option);
    });
}

function updatePlasticFilter() {
    const plasticFilter = document.getElementById('plasticFilter');
    if (!plasticFilter) return;
    
    plasticFilter.innerHTML = '<option value="all">全て - Tất cả</option>';
    
    const plasticTypes = new Set();
    [...allData.molds, ...allData.cutters].forEach(item => {
        if (item.displayPlasticType) plasticTypes.add(item.displayPlasticType);
    });
    
    Array.from(plasticTypes).sort().forEach(plastic => {
        const option = document.createElement('option');
        option.value = plastic;
        option.textContent = plastic;
        plasticFilter.appendChild(option);
    });
}

// Enhanced search functionality
function performSearch() {
    const query = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
    const searchCategory = document.getElementById('searchCategory')?.value || 'all';
    const columnFilter = document.getElementById('columnFilter')?.value || 'all';
    const locationFilter = document.getElementById('locationFilter')?.value || 'all';
    const statusFilter = document.getElementById('statusFilter')?.value || 'all';
    const customerFilter = document.getElementById('customerFilter')?.value || 'all';
    const plasticFilter = document.getElementById('plasticFilter')?.value || 'all';
    
    let dataToSearch = [];
    if (searchCategory === 'mold') {
        dataToSearch = allData.molds;
    } else if (searchCategory === 'cutter') {
        dataToSearch = allData.cutters;
    } else {
        dataToSearch = [...allData.molds, ...allData.cutters];
    }
    
    filteredData = dataToSearch.filter(item => {
        // Enhanced text search với kích thước
        let textMatch = true;
        if (query) {
            if (columnFilter === 'all') {
                // Search in all fields including dimensions
                const searchFields = [
                    item.displayCode,
                    item.displayName,
                    item.displayDimensions,
                    item.displayLocation,
                    item.displayCustomer,
                    item.displayPlasticType,
                    item.MoldID,
                    item.CutterID,
                    item.MoldCode,
                    item.CutterNo,
                    item.MoldName,
                    item.CutterName,
                    item.CutterDesignName
                ].filter(field => field);
                
                textMatch = searchFields.some(field => 
                    field.toString().toLowerCase().includes(query)
                ) || 
                // Special handling for dimension search (469x299x45)
                (item.displayDimensions && 
                 item.displayDimensions.toLowerCase().replace(/\s/g, '').includes(query.replace(/\s/g, '')));
            } else {
                textMatch = item[columnFilter] && 
                           item[columnFilter].toString().toLowerCase().includes(query);
            }
        }
        
        // Other filters
        let locationMatch = locationFilter === 'all' || item.displayLocation === locationFilter;
        let statusMatch = statusFilter === 'all' || item.currentStatus?.status === statusFilter;
        let customerMatch = customerFilter === 'all' || item.displayCustomer === customerFilter;
        let plasticMatch = plasticFilter === 'all' || item.displayPlasticType === plasticFilter;
        
        return textMatch && locationMatch && statusMatch && customerMatch && plasticMatch;
    });
    
    // Apply sorting
    if (sortField) applySorting();
    
    // Reset to first page
    currentPage = 1;
    
    displayData();
    updateResultsCount();
    updatePagination();
}

// Sort table
function sortTable(field) {
    if (sortField === field) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortField = field;
        sortDirection = 'asc';
    }
    
    applySorting();
    displayData();
    updateSortIcons();
}

function applySorting() {
    filteredData.sort((a, b) => {
        let aValue = '';
        let bValue = '';
        
        switch (sortField) {
            case 'id':
                aValue = a.MoldID || a.CutterID || '';
                bValue = b.MoldID || b.CutterID || '';
                break;
            case 'code':
                aValue = a.displayCode;
                bValue = b.displayCode;
                break;
            case 'name':
                aValue = a.displayName;
                bValue = b.displayName;
                break;
            case 'dimensions':
                aValue = a.displayDimensions;
                bValue = b.displayDimensions;
                break;
            case 'location':
                aValue = a.displayLocation;
                bValue = b.displayLocation;
                break;
            case 'customer':
                aValue = a.displayCustomer;
                bValue = b.displayCustomer;
                break;
            case 'status':
                aValue = a.currentStatus?.text || '';
                bValue = b.currentStatus?.text || '';
                break;
            default:
                return 0;
        }
        
        if (typeof aValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
        }
        
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
}

function updateSortIcons() {
    document.querySelectorAll('.sort-icon').forEach(icon => {
        icon.textContent = '↕️';
    });
    
    const currentHeader = document.querySelector(`th[onclick="sortTable('${sortField}')"] .sort-icon`);
    if (currentHeader) {
        currentHeader.textContent = sortDirection === 'asc' ? '↑' : '↓';
    }
}

// Display data
function displayData() {
    const tableBody = document.querySelector('#dataTable tbody');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = pageSize === 'all' ? filteredData.length : startIndex + parseInt(pageSize);
    const pageData = filteredData.slice(startIndex, endIndex);
    
    pageData.forEach(item => {
        const row = document.createElement('tr');
        const itemId = item.MoldID || item.CutterID || '';
        const itemType = item.MoldID ? 'mold' : 'cutter';
        
        // Check if selected
        if (selectedItems.has(itemId)) {
            row.classList.add('selected');
        }
        
        row.innerHTML = `
            <td class="select-col">
                <input type="checkbox" ${selectedItems.has(itemId) ? 'checked' : ''} 
                       onchange="toggleSelection('${itemId}', this.checked)">
            </td>
            <td>${itemId}</td>
            <td>
                <a href="detail.html?id=${itemId}&type=${itemType}" class="code-link">
                    ${item.displayCode}
                </a>
            </td>
            <td>${item.displayName}</td>
            <td>${item.displayDimensions}</td>
            <td>${item.displayLocation}</td>
            <td>${item.displayCustomer}</td>
            <td>
                <span class="status-badge ${item.currentStatus?.class || ''}">${item.currentStatus?.text || ''}</span>
            </td>
        `;
        
        // Add click event to row (excluding checkbox and link columns)
        row.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox' && !e.target.closest('a')) {
                window.location.href = `detail.html?id=${itemId}&type=${itemType}`;
            }
        });
        
        tableBody.appendChild(row);
    });
    
    updateSelectAllCheckbox();
}

// Selection functions
function toggleSelection(itemId, checked) {
    if (checked) {
        selectedItems.add(itemId);
    } else {
        selectedItems.delete(itemId);
    }
    updateSelectionCount();
    updateSelectAllCheckbox();
}

function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (!selectAllCheckbox) return;
    
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = pageSize === 'all' ? filteredData.length : startIndex + parseInt(pageSize);
    const visibleItems = filteredData.slice(startIndex, endIndex);
    
    visibleItems.forEach(item => {
        const itemId = item.MoldID || item.CutterID;
        if (selectAllCheckbox.checked) {
            selectedItems.add(itemId);
        } else {
            selectedItems.delete(itemId);
        }
    });
    
    updateSelectionCount();
    displayData();
}

function selectAll() {
    filteredData.forEach(item => {
        const itemId = item.MoldID || item.CutterID;
        selectedItems.add(itemId);
    });
    updateSelectionCount();
    displayData();
    updateSelectAllCheckbox();
}

function clearSelection() {
    selectedItems.clear();
    updateSelectionCount();
    displayData();
    updateSelectAllCheckbox();
}

function updateSelectionCount() {
    const selectedCount = document.getElementById('selectedCount');
    const printBtn = document.getElementById('printBtn');
    
    if (selectedItems.size > 0) {
        if (selectedCount) {
            selectedCount.textContent = `選択済み: ${selectedItems.size}`;
            selectedCount.style.display = 'inline';
        }
        if (printBtn) {
            printBtn.style.display = 'inline';
        }
    } else {
        if (selectedCount) selectedCount.style.display = 'none';
        if (printBtn) printBtn.style.display = 'none';
    }
}

function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (!selectAllCheckbox) return;
    
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = pageSize === 'all' ? filteredData.length : startIndex + parseInt(pageSize);
    const visibleItems = filteredData.slice(startIndex, endIndex);
    
    const visibleSelected = visibleItems.filter(item => 
        selectedItems.has(item.MoldID || item.CutterID)
    ).length;
    
    if (visibleSelected === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else if (visibleSelected === visibleItems.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    }
}

// Print selected items
function printSelected() {
    if (selectedItems.size === 0) {
        alert('印刷するアイテムを選択してください - Vui lòng chọn mục để in');
        return;
    }
    
    const selectedData = [...allData.molds, ...allData.cutters].filter(item => 
        selectedItems.has(item.MoldID || item.CutterID)
    );
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>印刷 - In danh sách</title>
            <style>
                body { font-family: Arial, sans-serif; font-size: 12px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #000; padding: 4px; text-align: left; }
                th { background: #f0f0f0; font-weight: bold; }
                .header { text-align: center; margin-bottom: 20px; }
            </style>
        </head>
        <body>
            <div class="header">
                <h2>選択されたアイテム - Danh sách đã chọn</h2>
                <p>印刷日時 - Ngày in: ${new Date().toLocaleString('ja-JP')}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>コード - Mã</th>
                        <th>名称 - Tên</th>
                        <th>サイズ - Kích thước</th>
                        <th>場所 - Vị trí</th>
                        <th>顧客 - Khách hàng</th>
                        <th>状態 - Trạng thái</th>
                    </tr>
                </thead>
                <tbody>
                    ${selectedData.map(item => `
                        <tr>
                            <td>${item.MoldID || item.CutterID}</td>
                            <td>${item.displayCode}</td>
                            <td>${item.displayName}</td>
                            <td>${item.displayDimensions}</td>
                            <td>${item.displayLocation}</td>
                            <td>${item.displayCustomer}</td>
                            <td>${item.currentStatus?.text || ''}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
}

// Pagination
function updatePagination() {
    const totalItems = filteredData.length;
    const totalPages = pageSize === 'all' ? 1 : Math.ceil(totalItems / pageSize);
    const paginationControls = document.getElementById('paginationControls');
    if (!paginationControls) return;
    
    let html = '';
    
    if (pageSize !== 'all' && totalPages > 1) {
        // Previous button
        html += `<button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>前へ</button>`;
        
        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            if (i === currentPage) {
                html += `<button class="active">${i}</button>`;
            } else if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 2) {
                html += `<button onclick="changePage(${i})">${i}</button>`;
            } else if (i === currentPage - 3 || i === currentPage + 3) {
                html += `<span>...</span>`;
            }
        }
        
        // Next button
        html += `<button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>次へ</button>`;
    }
    
    paginationControls.innerHTML = html;
}

function changePage(page) {
    const totalPages = pageSize === 'all' ? 1 : Math.ceil(filteredData.length / pageSize);
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        displayData();
        updatePagination();
    }
}

function changePageSize() {
    const pageSizeSelect = document.getElementById('pageSize');
    if (pageSizeSelect) {
        pageSize = pageSizeSelect.value === 'all' ? 'all' : parseInt(pageSizeSelect.value);
        currentPage = 1;
        displayData();
        updatePagination();
    }
}

// Navigation functions
function resetSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchCategory = document.getElementById('searchCategory');
    const columnFilter = document.getElementById('columnFilter');
    const locationFilter = document.getElementById('locationFilter');
    const statusFilter = document.getElementById('statusFilter');
    const customerFilter = document.getElementById('customerFilter');
    const plasticFilter = document.getElementById('plasticFilter');
    
    if (searchInput) searchInput.value = '';
    if (searchCategory) searchCategory.value = 'all';
    if (columnFilter) columnFilter.value = 'all';
    if (locationFilter) locationFilter.value = 'all';
    if (statusFilter) statusFilter.value = 'all';
    if (customerFilter) customerFilter.value = 'all';
    if (plasticFilter) plasticFilter.value = 'all';
    
    currentPage = 1;
    sortField = '';
    sortDirection = 'asc';
    selectedItems.clear();
    
    performSearch();
}

// Utility functions
function parseCSV(csv) {
    const lines = csv.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    
    return lines.slice(1).map(line => {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim().replace(/^"|"$/g, ''));
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim().replace(/^"|"$/g, ''));
        
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = values[index] || '';
        });
        return obj;
    });
}

function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('ja-JP');
    } catch {
        return dateString;
    }
}

function showLoading(show) {
    const loading = document.getElementById('loadingIndicator');
    if (loading) {
        loading.style.display = show ? 'flex' : 'none';
    }
}

function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #f44336;
        color: white;
        padding: 15px;
        border-radius: 5px;
        z-index: 9999;
        max-width: 400px;
    `;
    errorDiv.textContent = message;
    
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
        if (errorDiv.parentNode) {
            errorDiv.parentNode.removeChild(errorDiv);
        }
    }, 5000);
}

function updateResultsCount() {
    const resultsCount = document.getElementById('resultsCount');
    if (resultsCount) {
        const count = filteredData.length;
        const total = allData.molds.length + allData.cutters.length;
        resultsCount.textContent = `${count}件 - ${count} kết quả (${total} tổng)`;
    }
}

// Compatibility functions for older code
function searchData() {
    performSearch();
}

function handleSearchInput() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        performSearch();
    }, 300);
}

function handleFilterChange() {
    performSearch();
}

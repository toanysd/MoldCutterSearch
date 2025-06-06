// script.js - V4.24 Complete with V4.221 UI and V3.0 Server Logic
const API_BASE_URL = 'http://localhost:3001/api';
const GITHUB_BASE_URL = "https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/";

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
    racks: [],
    companies: [],
    usercomments: [],
    jobs: [],
    processingitems: []
};

let filteredData = [];
let selectedItems = new Set();
let currentPage = 1;
let pageSize = 50;
let sortField = '';
let sortDirection = 'asc';
let searchTimeout = null;
let currentCategory = 'all';
let currentView = 'table';

// Search history & suggestions (V3.0 working logic)
let searchHistory = [];
let suggestionIndex = -1;
let isShowingSuggestions = false;
let hideTimeout = null;

// Enhanced filter fields with all required fields for V4.24
const FILTER_FIELDS = {
    all: [
        { value: 'displayCode', text: 'コード' },
        { value: 'displayName', text: '名称' },
        { value: 'displayDimensions', text: 'サイズ' },
        { value: 'displayLocation', text: '場所' },
        { value: 'displayCustomer', text: '顧客' },
        { value: 'rackId', text: 'ラック (RackID)' },
        { value: 'drawingNumber', text: '図面番号' },
        { value: 'equipmentCode', text: '設備コード' },
        { value: 'plasticType', text: 'プラスチック材料' },
        { value: 'moldSetupType', text: '金型セットアップタイプ' },
        { value: 'pieceCount', text: '枚数' },
        { value: 'cutlineSize', text: 'カットライン寸法' },
        { value: 'storageCompany', text: '保管会社' },
        { value: 'storageCompanyId', text: '保管会社ID' },
        { value: 'moldStatus', text: '金型ステータス' }
    ],
    mold: [
        { value: 'displayCode', text: 'コード' },
        { value: 'displayName', text: '名称' },
        { value: 'displayDimensions', text: 'サイズ' },
        { value: 'rackId', text: 'ラック (RackID)' },
        { value: 'drawingNumber', text: '図面番号' },
        { value: 'equipmentCode', text: '設備コード' },
        { value: 'plasticType', text: 'プラスチック材料' },
        { value: 'moldSetupType', text: '金型セットアップタイプ' },
        { value: 'pieceCount', text: '枚数' },
        { value: 'cutlineSize', text: 'カットライン寸法' },
        { value: 'storageCompany', text: '保管会社' },
        { value: 'moldStatus', text: '金型ステータス' }
    ],
    cutter: [
        { value: 'displayCode', text: 'カッターNo' },
        { value: 'displayName', text: '名称' },
        { value: 'cutlineSize', text: 'カットライン寸法' },
        { value: 'rackId', text: 'ラック (RackID)' },
        { value: 'plasticCutType', text: 'プラスチックカットタイプ' },
        { value: 'cutterType', text: 'カッタータイプ' },
        { value: 'bladeCount', text: 'ブレード数' },
        { value: 'storageCompany', text: '保管会社' }
    ]
};

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing V4.24 Application...');
    
    // Load search history (V3.0 working method)
    loadSearchHistory();
    
    // Setup search functionality
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.focus();
        setupSearchFunctionality();
    }
    
    // Prevent zoom on mobile
    preventMobileZoom();
    
    // Load data and initialize
    if (isMainPage()) {
        initializeMainPage();
    }
});

// Check if current page is main page
function isMainPage() {
    const path = window.location.pathname;
    return path.includes('index.html') || path === '/' || path.endsWith('/');
}

// Initialize main page
async function initializeMainPage() {
    showLoading(true);
    try {
        await loadAllData();
        initializeFilters();
        restoreSearchState();
        performSearch();
        console.log('V4.24 Application initialized successfully');
    } catch (error) {
        console.error('Initialization error:', error);
        showError(`初期化エラー: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Prevent mobile zoom
function preventMobileZoom() {
    const formElements = document.querySelectorAll('input, select, textarea');
    formElements.forEach(element => {
        element.style.fontSize = '16px';
        element.addEventListener('focus', function() {
            this.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    });
}

// Loading functions
function showLoading(show) {
    const loading = document.getElementById('loadingIndicator');
    if (loading) {
        loading.style.display = show ? 'flex' : 'none';
    }
}

function showError(message) {
    console.error(message);
    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    if (errorMessage && errorText) {
        errorText.textContent = message;
        errorMessage.style.display = 'block';
    } else {
        alert(message);
    }
}

function showSuccess(message) {
    console.log(message);
    alert(message);
}

// Enhanced CSV parsing function
function parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length === 0) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
        const values = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' && (i === 0 || line[i-1] !== '\\')) {
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
            obj[header] = values[index] !== undefined ? values[index] : '';
        });
        return obj;
    });
}

// Date formatting
function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString('ja-JP');
    } catch (e) {
        return dateString;
    }
}

// Enhanced data loading with all required files for V4.24
async function loadAllData() {
    const dataFiles = [
        { key: 'molds', file: 'molds.csv', required: true },
        { key: 'cutters', file: 'cutters.csv', required: true },
        { key: 'customers', file: 'customers.csv', required: false },
        { key: 'molddesign', file: 'molddesign.csv', required: false },
        { key: 'moldcutter', file: 'moldcutter.csv', required: false },
        { key: 'shiplog', file: 'shiplog.csv', required: false },
        { key: 'locationlog', file: 'locationlog.csv', required: false },
        { key: 'employees', file: 'employees.csv', required: false },
        { key: 'racklayers', file: 'racklayers.csv', required: false },
        { key: 'racks', file: 'racks.csv', required: false },
        { key: 'companies', file: 'companies.csv', required: false },
        { key: 'usercomments', file: 'usercomments.csv', required: false },
        { key: 'jobs', file: 'jobs.csv', required: false },
        { key: 'processingitems', file: 'processingitems.csv', required: false }
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
    
    processDataRelationships();
}

// Enhanced data processing with all relationships for V4.24
function processDataRelationships() {
    console.log('Processing data relationships V4.24...');
    
    const moldDesignMap = new Map(allData.molddesign.map(d => [d.MoldDesignID, d]));
    const customerMap = new Map(allData.customers.map(c => [c.CustomerID, c]));
    const companyMap = new Map(allData.companies.map(c => [c.CompanyID, c]));
    const rackMap = new Map(allData.racks.map(r => [r.RackID, r]));
    const rackLayerMap = new Map(allData.racklayers.map(rl => [rl.RackLayerID, rl]));
    const jobMap = new Map(allData.jobs.map(j => [j.MoldDesignID, j]));
    const processingItemMap = new Map(allData.processingitems.map(p => [p.ProcessingItemID, p]));
    
    // Process molds with enhanced data relationships
    allData.molds = allData.molds.map(mold => {
        const design = moldDesignMap.get(mold.MoldDesignID) || {};
        const customer = customerMap.get(mold.CustomerID) || {};
        const company = companyMap.get(customer.CompanyID) || {};
        const rackLayer = rackLayerMap.get(mold.RackLayerID) || {};
        const rack = rackLayer.RackID ? rackMap.get(rackLayer.RackID) || {} : {};
        const storageCompany = companyMap.get(mold.storage_company) || {};
        const job = jobMap.get(mold.MoldDesignID) || {};
        const processingItem = processingItemMap.get(job.ProcessingItemID) || {};
        
        // Enhanced cutline size creation from molddesign
        let cutlineSize = '';
        if (design.CutlineX && design.CutlineY) {
            cutlineSize = `${design.CutlineX}×${design.CutlineY}`;
        }
        
        // Enhanced mold status determination
        let moldStatus = 'Active';
        if (mold.MoldReturning === 'TRUE') {
            moldStatus = 'Returned';
        } else if (mold.MoldDisposing === 'TRUE') {
            moldStatus = 'Disposed';
        } else if (mold.MoldReturning === 'FALSE' && mold.MoldDisposing === 'FALSE') {
            moldStatus = 'In Use';
        }
        
        return {
            ...mold,
            designInfo: design,
            customerInfo: customer,
            companyInfo: company,
            rackLayerInfo: rackLayer,
            rackInfo: rack,
            storageCompanyInfo: storageCompany,
            jobInfo: job,
            processingItemInfo: processingItem,
            relatedCutters: getRelatedCutters(mold.MoldID),
            shipHistory: getShipHistory('MOLD', mold.MoldID),
            locationHistory: getLocationHistory('MOLD', mold.MoldID),
            currentStatus: getCurrentStatus(mold),
            displayCode: mold.MoldCode || '',
            displayName: mold.MoldName || mold.MoldCode || '',
            displayDimensions: createMoldDimensionString(mold, design),
            displayLocation: mold.RackLayerID || '',
            displayCustomer: getCustomerDisplayName(customer, company),
            displayStorageCompany: getStorageCompanyDisplay(mold.storage_company, companyMap),
            displayRackLocation: rack.RackLocation || '',
            // Enhanced fields for V4.24
            rackId: rackLayer.RackID || '',
            drawingNumber: design.DrawingNumber || '',
            equipmentCode: design.EquipmentCode || '',
            plasticType: design.DesignForPlasticType || '',
            moldSetupType: design.MoldSetupType || '',
            pieceCount: design.PieceCount || '',
            cutlineSize: cutlineSize,
            storageCompany: storageCompany.CompanyShortName || storageCompany.CompanyName || '',
            storageCompanyId: mold.storage_company || '',
            moldStatus: moldStatus,
            itemType: 'mold'
        };
    });
    
    // Process cutters with enhanced data relationships
    allData.cutters = allData.cutters.map(cutter => {
        const customer = customerMap.get(cutter.CustomerID) || {};
        const company = companyMap.get(customer.CompanyID) || {};
        const rackLayer = rackLayerMap.get(cutter.RackLayerID) || {};
        const rack = rackLayer.RackID ? rackMap.get(rackLayer.RackID) || {} : {};
        const storageCompany = companyMap.get(cutter.storage_company) || {};
        
        // Enhanced cutline size creation from cutter data
        let cutlineSize = '';
        if (cutter.CutlineLength && cutter.CutlineWidth) {
            cutlineSize = `${cutter.CutlineLength}×${cutter.CutlineWidth}`;
            if (cutter.CutterCorner) cutlineSize += `-${cutter.CutterCorner}`;
            if (cutter.CutterChamfer) cutlineSize += `-${cutter.CutterChamfer}`;
        }
        
        // Fixed display name for cutter - only show CutterName for 名称 column
        let displayName = cutter.CutterName || cutter.CutterDesignName || '';
        
        return {
            ...cutter,
            customerInfo: customer,
            companyInfo: company,
            rackLayerInfo: rackLayer,
            rackInfo: rack,
            storageCompanyInfo: storageCompany,
            relatedMolds: getRelatedMolds(cutter.CutterID),
            shipHistory: getShipHistory('CUTTER', cutter.CutterID),
            locationHistory: getLocationHistory('CUTTER', cutter.CutterID),
            currentStatus: getCurrentStatus(cutter),
            displayCode: cutter.CutterNo || '',
            displayName: displayName, // Fixed: only CutterName, not CutterNo.CutterName
            displayDimensions: cutlineSize, // Use cutline size for cutter
            displayLocation: cutter.RackLayerID || '',
            displayCustomer: getCustomerDisplayName(customer, company),
            displayStorageCompany: getStorageCompanyDisplay(cutter.storage_company, companyMap),
            displayRackLocation: rack.RackLocation || '',
            // Enhanced fields for V4.24
            rackId: rackLayer.RackID || '',
            plasticCutType: cutter.PlasticCutType || '',
            cutterType: cutter.CutterType || '',
            bladeCount: cutter.BladeCount || '',
            cutlineSize: cutlineSize,
            storageCompany: storageCompany.CompanyShortName || storageCompany.CompanyName || '',
            storageCompanyId: cutter.storage_company || '',
            itemType: 'cutter'
        };
    });
    
    console.log(`Processed ${allData.molds.length} molds and ${allData.cutters.length} cutters`);
}

// Helper functions for data processing
function createMoldDimensionString(mold, design) {
    if (design.MoldDesignLength && design.MoldDesignWidth && design.MoldDesignHeight) {
        return `${design.MoldDesignLength}×${design.MoldDesignWidth}×${design.MoldDesignHeight}`;
    }
    if (design.MoldDesignDim) return design.MoldDesignDim;
    if (mold.MoldLength && mold.MoldWidth && mold.MoldHeight) {
        return `${mold.MoldLength}×${mold.MoldWidth}×${mold.MoldHeight}`;
    }
    return '';
}

function getCustomerDisplayName(customer, company) {
    if (!customer || !customer.CustomerID) return '';
    let displayName = customer.CustomerShortName || customer.CustomerName || customer.CustomerID;
    if (company && company.CompanyShortName) {
        displayName = `${company.CompanyShortName} - ${displayName}`;
    }
    return displayName;
}

function getStorageCompanyDisplay(storageCompanyId, companyMap) {
    if (!storageCompanyId) return { text: 'N/A', class: 'unknown' };
    
    const company = companyMap.get(storageCompanyId);
    if (!company) return { text: 'N/A', class: 'unknown' };
    
    const companyName = company.CompanyShortName || company.CompanyName || storageCompanyId;
    
    if (storageCompanyId === '2') {
        return { text: companyName, class: 'ysd' };
    }
    
    return { text: companyName, class: 'external' };
}

// Get related items (V3.0 working logic)
function getRelatedCutters(moldID) {
    if (!moldID) return [];
    
    const relations = allData.moldcutter.filter(mc => mc.MoldID === moldID);
    return relations.map(rel => {
        const cutter = allData.cutters.find(c => c.CutterID === rel.CutterID);
        return cutter;
    }).filter(c => c && c.CutterID);
}

function getRelatedMolds(cutterID) {
    if (!cutterID) return [];
    
    const relations = allData.moldcutter.filter(mc => mc.CutterID === cutterID);
    return relations.map(rel => {
        const mold = allData.molds.find(m => m.MoldID === rel.MoldID);
        return mold;
    }).filter(m => m && m.MoldID);
}

// Get shipping history (V3.0 working)
function getShipHistory(itemType, itemID) {
    if (!itemID) return [];
    
    return allData.shiplog.filter(log => {
        if (itemType === 'MOLD') return log.MoldID === itemID;
        if (itemType === 'CUTTER') return log.CutterID === itemID;
        return false;
    }).sort((a, b) => new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0));
}

// Get location history (V3.0 working)
function getLocationHistory(itemType, itemID) {
    if (!itemID) return [];
    
    return allData.locationlog.filter(log => {
        if (itemType === 'MOLD') return log.MoldID === itemID;
        if (itemType === 'CUTTER') return log.CutterID === itemID;
        return false;
    }).sort((a, b) => new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0));
}

// Get current status (V3.0 working logic)
function getCurrentStatus(item) {
    if (item.MoldReturning === 'TRUE' || item.MoldReturning === true) {
        return { status: 'returned', text: '返却済み', class: 'status-returned' };
    }
    if (item.MoldDisposing === 'TRUE' || item.MoldDisposing === true) {
        return { status: 'disposed', text: '廃棄済み', class: 'status-disposed' };
    }
    
    const history = getShipHistory(item.MoldID ? 'MOLD' : 'CUTTER', item.MoldID || item.CutterID);
    if (history.length > 0) {
        const latest = history[0];
        if (latest.ToCompanyID && latest.ToCompanyID !== 'YSD') {
            return { status: 'shipped', text: '出荷済み', class: 'status-shipped' };
        }
    }
    
    return { status: 'available', text: '利用可能', class: 'status-available' };
}

// Server integration functions (V3.0 backend logic)
// Fix callBackendApi function in script.js V4.24
// Fix callBackendApi function in script.js V4.24
async function callBackendApi(endpoint, payload) {
    console.log(`FRONTEND GLOBAL: Calling API ${API_BASE_URL}/${endpoint} with payload:`, payload);
    try {
        const response = await fetch(`${API_BASE_URL}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload), // ✅ FIX: Đúng format cho server V3.0
        });

        if (!response.ok) {
            // ✅ FIX: Đọc error text trước khi throw
            let errorText;
            try {
                errorText = await response.text();
            } catch (e) {
                errorText = `HTTP ${response.status}`;
            }
            throw new Error(`Server error ${response.status}: ${errorText}`);
        }

        // ✅ FIX: Xử lý response JSON
        let responseData;
        try {
            responseData = await response.json();
        } catch (e) {
            // Nếu không phải JSON, tạo response mặc định
            responseData = { success: true, message: 'Operation completed' };
        }

        console.log(`FRONTEND GLOBAL: API call successful for ${endpoint}:`, responseData);
        return responseData;
    } catch (error) {
        console.error(`FRONTEND GLOBAL: API call to ${endpoint} FAILED:`, error.message);
        throw error; // ✅ Re-throw để detail-mold.js xử lý
    }
}

// Enhanced search functionality with server-based history
function setupSearchFunctionality() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) {
        console.warn('Search input not found');
        return;
    }
    
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('keydown', handleSearchKeydown);
    searchInput.addEventListener('focus', function() {
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
        }
        setTimeout(() => {
            if (document.activeElement === this) {
                showSearchSuggestions();
            }
        }, 100);
    });
    searchInput.addEventListener('blur', function() {
        hideSearchSuggestions(false);
    });
    
    // Click outside handler
    document.addEventListener('click', function(e) {
        const searchContainer = e.target.closest('.search-input-container');
        const suggestionContainer = e.target.closest('.search-suggestions');
        if (!searchContainer && !suggestionContainer) {
            hideSearchSuggestions(true);
        }
    });
    
    console.log('Search functionality setup completed');
}

function handleSearchInput() {
    updateClearSearchButton();
    
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    searchTimeout = setTimeout(() => {
        performSearch();
        updateSearchSuggestions();
    }, 300);
}

function updateClearSearchButton() {
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    
    if (searchInput && clearBtn) {
        const hasValue = searchInput.value.trim().length > 0;
        clearBtn.style.display = hasValue ? 'flex' : 'none';
    }
}

function clearSearchInput() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
        updateClearSearchButton();
        hideSearchSuggestions(true);
        performSearch();
        searchInput.focus();
    }
}

// Load search history from localStorage (V3.0 working method)
function loadSearchHistory() {
    try {
        const saved = localStorage.getItem('moldSearchHistory');
        if (saved) {
            searchHistory = JSON.parse(saved);
            if (searchHistory.length > 20) {
                searchHistory = searchHistory.slice(-20);
            }
        }
    } catch (e) {
        console.warn('Failed to load search history:', e);
        searchHistory = [];
    }
}

// Save search history to localStorage (V3.0 working method)
function saveSearchHistory() {
    try {
        localStorage.setItem('moldSearchHistory', JSON.stringify(searchHistory));
    } catch (e) {
        console.warn('Failed to save search history:', e);
    }
}

// Add search term to history (V3.0 logic)
function addToSearchHistory(query) {
    if (!query || query.trim().length < 2) return;
    
    const trimmedQuery = query.trim();
    const now = new Date();
    
    // Remove existing entry if exists
    searchHistory = searchHistory.filter(item => item.query !== trimmedQuery);
    
    // Add new entry at the end
    searchHistory.push({
        query: trimmedQuery,
        timestamp: now.toISOString(),
        count: 1,
        results: filteredData.length
    });
    
    // Keep only last 20 searches
    if (searchHistory.length > 20) {
        searchHistory = searchHistory.slice(-20);
    }
    
    saveSearchHistory();
}

// Enhanced search suggestions with server data
function showSearchSuggestions() {
    const searchInput = document.getElementById('searchInput');
    const suggestionsContainer = document.getElementById('searchSuggestions');
    
    if (!searchInput || !suggestionsContainer) {
        console.warn('Search suggestions elements not found');
        return;
    }
    
    const query = searchInput.value.trim();
    
    // Show suggestions container
    suggestionsContainer.style.display = 'block';
    isShowingSuggestions = true;
    
    // Clear hide timeout
    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }
    
    updateSearchSuggestions(query);
}

function hideSearchSuggestions(immediate = false) {
    const suggestionsContainer = document.getElementById('searchSuggestions');
    if (!suggestionsContainer) return;
    
    if (immediate) {
        suggestionsContainer.style.display = 'none';
        isShowingSuggestions = false;
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
        }
    } else {
        hideTimeout = setTimeout(() => {
            suggestionsContainer.style.display = 'none';
            isShowingSuggestions = false;
        }, 150);
    }
}

function updateSearchSuggestions(query = '') {
    const suggestionsList = document.getElementById('suggestionsList');
    if (!suggestionsList) {
        console.warn('Suggestions list element not found');
        return;
    }
    
    let html = '';
    
    // Show search history
    const history = getRecentSearchHistory();
    if (history.length > 0) {
        html += '<div class="suggestions-section">';
        html += '<div class="suggestions-section-title">最近の検索</div>';
        history.forEach(item => {
            const highlightedQuery = query ? highlightMatch(item.query, query) : item.query;
            html += `
                <div class="suggestion-item" onclick="selectSuggestion('${escapeHtml(item.query)}')">
                    <div class="suggestion-text">${highlightedQuery}</div>
                    <div class="suggestion-meta">
                        <span class="suggestion-count">${item.results}件</span>
                        <span class="suggestion-time">${formatRelativeTime(item.timestamp)}</span>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }
    
    // Show smart suggestions based on current data
    if (query.length > 1) {
        const smartSuggestions = generateSmartSuggestions(query);
        if (smartSuggestions.length > 0) {
            html += '<div class="suggestions-section">';
            html += '<div class="suggestions-section-title">関連する検索</div>';
            smartSuggestions.forEach(suggestion => {
                const highlightedSuggestion = highlightMatch(suggestion, query);
                html += `
                    <div class="suggestion-item" onclick="selectSuggestion('${escapeHtml(suggestion)}')">
                        <div class="suggestion-text">${highlightedSuggestion}</div>
                    </div>
                `;
            });
            html += '</div>';
        }
    }
    
    if (html === '') {
        html = '<div class="no-suggestions">検索履歴がありません</div>';
    }
    
    suggestionsList.innerHTML = html;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function generateSmartSuggestions(query) {
    const suggestions = new Set();
    const queryLower = query.toLowerCase();
    
    // Search in all data for matching patterns
    const allItems = [...allData.molds, ...allData.cutters];
    
    allItems.forEach(item => {
        // Check various fields for partial matches
        const fields = [
            item.displayCode,
            item.displayName,
            item.displayDimensions,
            item.cutlineSize,
            item.designInfo?.DrawingNumber,
            item.designInfo?.EquipmentCode,
            item.MoldCode,
            item.CutterNo
        ].filter(field => field && field.toString().trim());
        
        fields.forEach(field => {
            const fieldStr = field.toString().toLowerCase();
            if (fieldStr.includes(queryLower) && fieldStr !== queryLower) {
                suggestions.add(field.toString());
            }
        });
    });
    
    return Array.from(suggestions).slice(0, 5);
}

function highlightMatch(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

function formatRelativeTime(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now - time;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return '今';
    if (diffMins < 60) return `${diffMins}分前`;
    if (diffHours < 24) return `${diffHours}時間前`;
    if (diffDays < 7) return `${diffDays}日前`;
    return time.toLocaleDateString('ja-JP');
}

function selectSuggestion(query) {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = query;
        updateClearSearchButton();
        hideSearchSuggestions(true);
        performSearch();
    }
}

function handleSearchKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        hideSearchSuggestions(true);
        performSearch();
    } else if (event.key === 'Escape') {
        hideSearchSuggestions(true);
    }
}

function getRecentSearchHistory() {
    return searchHistory
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10);
}

function clearSearchHistory() {
    searchHistory = [];
    saveSearchHistory();
    updateSearchSuggestions();
    alert('検索履歴をクリアしました');
}

// Filter functions
function initializeFilters() {
    updateFieldFilterA();
    updateValueFilterB();
}

function updateFieldFilterA() {
    const fieldFilterA = document.getElementById('fieldFilterA');
    if (!fieldFilterA) return;
    
    fieldFilterA.innerHTML = '<option value="all">フィールドを選択</option>';
    
    const fields = FILTER_FIELDS[currentCategory] || FILTER_FIELDS.all;
    
    fields.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.text;
        fieldFilterA.appendChild(optionElement);
    });
}

function updateValueFilterB() {
    const fieldFilterA = document.getElementById('fieldFilterA');
    const valueFilterB = document.getElementById('valueFilterB');
    if (!fieldFilterA || !valueFilterB) return;
    
    const selectedField = fieldFilterA.value;
    valueFilterB.innerHTML = '<option value="all">データでフィルタ</option>';
    
    if (selectedField === 'all') return;
    
    let dataToAnalyze = [];
    if (currentCategory === 'mold') {
        dataToAnalyze = allData.molds;
    } else if (currentCategory === 'cutter') {
        dataToAnalyze = allData.cutters;
    } else {
        dataToAnalyze = [...allData.molds, ...allData.cutters];
    }
    
    const uniqueValues = new Set();
    dataToAnalyze.forEach(item => {
        const value = item[selectedField];
        if (value && value.toString().trim()) {
            uniqueValues.add(value.toString().trim());
        }
    });
    
    Array.from(uniqueValues).sort().forEach(value => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        valueFilterB.appendChild(option);
    });
}

// Search and filter handlers
function handleFieldFilterChange() {
    updateValueFilterB();
    performSearch();
}

function handleValueFilterChange() {
    performSearch();
}

// Enhanced main search function with cutline size support
function performSearch() {
    const query = document.getElementById('searchInput')?.value.trim() || '';
    const fieldFilterA = document.getElementById('fieldFilterA')?.value || 'all';
    const valueFilterB = document.getElementById('valueFilterB')?.value || 'all';
    
    console.log('Performing search V4.24:', { query, fieldFilterA, valueFilterB, currentCategory });
    
    if (query) {
        addToSearchHistory(query);
    }
    
    let dataToSearch = [];
    if (currentCategory === 'mold') {
        dataToSearch = allData.molds;
    } else if (currentCategory === 'cutter') {
        dataToSearch = allData.cutters;
    } else {
        dataToSearch = [...allData.molds, ...allData.cutters];
    }
    
    // Apply field filter first
    let preFilteredData = dataToSearch;
    if (fieldFilterA !== 'all' && valueFilterB !== 'all') {
        preFilteredData = dataToSearch.filter(item =>
            item[fieldFilterA] && item[fieldFilterA].toString() === valueFilterB
        );
    }
    
    // Enhanced text search with cutline size support and comma separation
    filteredData = preFilteredData.filter(item => {
        if (!query) return true;
        
        const keywords = query.split(',')
            .map(k => k.trim().toLowerCase())
            .filter(k => k.length > 0);
        
        if (keywords.length === 0) return true;
        
        return keywords.every(keyword => {
            // Enhanced search fields with cutline size support
            const searchFields = [
                item.displayCode, item.displayName, item.displayDimensions,
                item.displayLocation, item.displayCustomer,
                item.MoldID, item.CutterID, item.MoldCode, item.CutterNo,
                item.MoldName, item.CutterName, item.CutterDesignName,
                item.designInfo?.TextContent,
                item.designInfo?.DrawingNumber,
                item.designInfo?.EquipmentCode,
                item.designInfo?.DesignForPlasticType,
                item.designInfo?.MoldSetupType,
                item.designInfo?.PieceCount,
                item.cutlineSize, // Enhanced cutline size search
                item.PlasticCutType,
                item.CutterType,
                item.BladeCount,
                item.MoldNotes, item.CutterNote,
                item.rackInfo?.RackLocation,
                item.storageCompanyInfo?.CompanyName,
                item.storageCompanyInfo?.CompanyShortName,
                item.storageCompany,
                item.moldStatus,
                item.jobInfo?.JobName,
                item.processingItemInfo?.ProcessingItemName,
                // Additional cutline search support
                item.designInfo?.CutlineX && item.designInfo?.CutlineY ? 
                    `${item.designInfo.CutlineX}×${item.designInfo.CutlineY}` : null,
                item.CutlineLength && item.CutlineWidth ? 
                    `${item.CutlineLength}×${item.CutlineWidth}` : null
            ].filter(field => field && field.toString().trim());
            
            return searchFields.some(field => 
                field.toString().toLowerCase().includes(keyword)
            );
        });
    });
    
    // Apply sorting
    if (sortField) {
        filteredData.sort((a, b) => {
            let aVal = getSortValue(a, sortField);
            let bVal = getSortValue(b, sortField);
            
            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();
            
            if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }
    
    updateResultsDisplay();
    saveSearchState();
}

function getSortValue(item, field) {
    switch (field) {
        case 'id':
            return item.MoldID || item.CutterID || '';
        case 'name':
            return item.displayName || '';
        case 'size':
            return item.displayDimensions || '';
        case 'location':
            return item.displayLocation || '';
        case 'rackLocation':
            return item.displayRackLocation || '';
        case 'company':
            return item.displayStorageCompany?.text || '';
        case 'notes':
            return item.MoldNotes || item.CutterNote || '';
        default:
            return item[field] || '';
    }
}

// Results display
function updateResultsDisplay() {
    updateResultsCount();
    updatePagination();
    displayCurrentPage();
    updateSelectionDisplay();
}

function updateResultsCount() {
    const resultsCount = document.getElementById('resultsCount');
    if (resultsCount) {
        resultsCount.textContent = `${filteredData.length} 件`;
    }
}

function displayCurrentPage() {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, filteredData.length);
    const pageData = filteredData.slice(startIndex, endIndex);
    
    if (currentView === 'table') {
        displayTableView(pageData);
    } else {
        displayGridView(pageData);
    }
}

// Enhanced table display function with cutter-specific layout and improved styling
function displayTableView(data) {
    const tableBody = document.querySelector('#dataTable tbody');
    const tableHead = document.querySelector('#dataTable thead tr');
    if (!tableBody || !tableHead) return;
    
    // Update header based on category
    if (currentCategory === 'cutter') {
        tableHead.innerHTML = `
            <th class="col-select">
                <input type="checkbox" id="selectAllCheckbox" onchange="toggleSelectAll()">
            </th>
            <th class="col-thumbnail">📷</th>
            <th class="col-id sortable" onclick="sortTable('id')">
                CutterNo <span class="sort-icon">↕️</span>
            </th>
            <th class="col-name sortable" onclick="sortTable('name')">
                名称 <span class="sort-icon">↕️</span>
            </th>
            <th class="col-size sortable" onclick="sortTable('size')">
                Cutline <span class="sort-icon">↕️</span>
            </th>
            <th class="col-location sortable" onclick="sortTable('location')">
                場所 <span class="sort-icon">↕️</span>
            </th>
            <th class="col-rack-location sortable" onclick="sortTable('rackLocation')">
                位置 <span class="sort-icon">↕️</span>
            </th>
            <th class="col-company sortable" onclick="sortTable('company')">
                保管会社 <span class="sort-icon">↕️</span>
            </th>
            <th class="col-notes sortable" onclick="sortTable('notes')">
                備考 <span class="sort-icon">↕️</span>
            </th>
        `;
    } else {
        // Default header for mold or all
        tableHead.innerHTML = `
            <th class="col-select">
                <input type="checkbox" id="selectAllCheckbox" onchange="toggleSelectAll()">
            </th>
            <th class="col-thumbnail">📷</th>
            <th class="col-id sortable" onclick="sortTable('id')">
                ID <span class="sort-icon">↕️</span>
            </th>
            <th class="col-name sortable" onclick="sortTable('name')">
                名称 <span class="sort-icon">↕️</span>
            </th>
            <th class="col-size sortable" onclick="sortTable('size')">
                サイズ <span class="sort-icon">↕️</span>
            </th>
            <th class="col-location sortable" onclick="sortTable('location')">
                場所 <span class="sort-icon">↕️</span>
            </th>
            <th class="col-rack-location sortable" onclick="sortTable('rackLocation')">
                位置 <span class="sort-icon">↕️</span>
            </th>
            <th class="col-company sortable" onclick="sortTable('company')">
                保管会社 <span class="sort-icon">↕️</span>
            </th>
            <th class="col-notes sortable" onclick="sortTable('notes')">
                備考 <span class="sort-icon">↕️</span>
            </th>
        `;
    }
    
    if (data.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="9" class="no-data">検索結果がありません</td></tr>';
        return;
    }
    
    tableBody.innerHTML = data.map(item => {
        const isSelected = selectedItems.has(item.MoldID || item.CutterID);
        const itemId = item.MoldID || item.CutterID;
        const itemType = item.itemType;
        
        // Format position display
        let positionDisplay = 'N/A';
        if (item.displayLocation) {
            const rackLayer = allData.racklayers.find(r => r.RackLayerID === item.displayLocation);
            if (rackLayer && rackLayer.RackID && rackLayer.RackLayerNumber) {
                positionDisplay = `
                    <div class="position-display">
                        <span class="rack-circle ${itemType}">${rackLayer.RackID}</span>
                        <span class="layer-number">${rackLayer.RackLayerNumber}</span>
                    </div>
                `;
            }
        }
        
        // Format company display
        let companyDisplay = 'N/A';
        if (item.displayStorageCompany && item.displayStorageCompany.text !== 'N/A') {
            companyDisplay = `<span class="company-badge ${item.displayStorageCompany.class}">${item.displayStorageCompany.text}</span>`;
        }
        
        // Thumbnail with placeholder support
        const thumbnailHtml = item.ImagePath ? 
            `<img src="${item.ImagePath}" alt="Thumbnail" class="item-thumbnail">` :
            `<div class="thumbnail-placeholder">${itemType === 'mold' ? '🔧' : '✂️'}</div>`;
        
        // ID display with different colors for cutter
        let idDisplay = itemId;
        let idClass = 'item-id';
        if (itemType === 'cutter') {
            idDisplay = item.CutterNo || itemId;
            idClass = 'item-id cutter-id';
        }
        
        // Notes display
        let notesDisplay = 'N/A';
        if (itemType === 'cutter') {
            notesDisplay = item.CutterNote || 'N/A';
        } else {
            notesDisplay = item.MoldNotes || item.rackLayerInfo?.RackLayerNotes || 'N/A';
        }
        
        // Size display with enhanced cutline support
        let sizeDisplay = item.displayDimensions || 'N/A';
        if (itemType === 'cutter' && item.cutlineSize) {
            sizeDisplay = item.cutlineSize;
        }
        
        return `
            <tr class="${itemType}-row ${isSelected ? 'selected' : ''}" data-id="${itemId}">
                <td class="select-col">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} 
                           onchange="toggleItemSelection('${itemId}', this.checked)"
                           class="item-checkbox">
                </td>
                <td class="thumbnail-col">
                    ${thumbnailHtml}
                </td>
                <td class="id-col">
                    <span class="${idClass}">${idDisplay}</span>
                </td>
                <td class="name-col">
                    <a href="detail-${itemType}.html?id=${itemId}" 
                       class="item-name-link ${itemType}">
                        ${item.displayName || 'N/A'}
                    </a>
                </td>
                <td class="size-col">
                    <span class="size-display ${itemType === 'cutter' ? 'cutline' : ''}">${sizeDisplay}</span>
                </td>
                <td class="location-col">
                    ${positionDisplay}
                </td>
                <td class="rack-location-col">
                    <span class="rack-location-display">${item.displayRackLocation || 'N/A'}</span>
                </td>
                <td class="company-col">
                    ${companyDisplay}
                </td>
                <td class="notes-col">
                    <span class="notes-display">${notesDisplay}</span>
                </td>
            </tr>
        `;
    }).join('');
}

// Grid view (enhanced)
function displayGridView(data) {
    const gridContainer = document.getElementById('gridContainer');
    if (!gridContainer) return;
    
    if (data.length === 0) {
        gridContainer.innerHTML = '<div class="no-data">検索結果がありません</div>';
        return;
    }
    
    gridContainer.innerHTML = data.map(item => {
        const isSelected = selectedItems.has(item.MoldID || item.CutterID);
        const itemId = item.MoldID || item.CutterID;
        const itemType = item.itemType;
        
        return `
            <div class="grid-item ${itemType} ${isSelected ? 'selected' : ''}" data-id="${itemId}">
                <div class="grid-item-header">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} 
                           onchange="toggleItemSelection('${itemId}', this.checked)">
                    <span class="grid-item-type">${itemType === 'mold' ? '🔧' : '✂️'}</span>
                </div>
                <div class="grid-item-content" onclick="openDetailPage('${itemId}', '${itemType}')">
                    <div class="grid-item-name">${item.displayName || 'N/A'}</div>
                    <div class="grid-item-id">${itemType === 'cutter' ? (item.CutterNo || itemId) : itemId}</div>
                    <div class="grid-item-size">${item.displayDimensions || 'N/A'}</div>
                    <div class="grid-item-company">${item.storageCompany || 'N/A'}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Selection management
function toggleItemSelection(itemId, checked) {
    if (checked) {
        selectedItems.add(itemId);
    } else {
        selectedItems.delete(itemId);
    }
    updateSelectionDisplay();
    updateSelectAllCheckbox();
}

function updateSelectionDisplay() {
    const selectedCount = document.getElementById('selectedCount');
    const printBtn = document.getElementById('printBtn');
    
    if (selectedCount) {
        if (selectedItems.size > 0) {
            selectedCount.textContent = `選択: ${selectedItems.size}`;
            selectedCount.style.display = 'inline';
        } else {
            selectedCount.style.display = 'none';
        }
    }
    
    if (printBtn) {
        printBtn.style.display = selectedItems.size > 0 ? 'inline-block' : 'none';
    }
}

function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (!selectAllCheckbox) return;
    
    const visibleItems = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const visibleIds = visibleItems.map(item => item.MoldID || item.CutterID);
    
    const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedItems.has(id));
    const someSelected = visibleIds.some(id => selectedItems.has(id));
    
    selectAllCheckbox.checked = allSelected;
    selectAllCheckbox.indeterminate = someSelected && !allSelected;
}

function toggleSelectAll() {
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    if (!selectAllCheckbox) return;
    
    const visibleItems = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    const visibleIds = visibleItems.map(item => item.MoldID || item.CutterID);
    
    if (selectAllCheckbox.checked) {
        visibleIds.forEach(id => selectedItems.add(id));
    } else {
        visibleIds.forEach(id => selectedItems.delete(id));
    }
    
    updateSelectionDisplay();
    refreshTableSelection();
}

function refreshTableSelection() {
    const checkboxes = document.querySelectorAll('#dataTable tbody input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        const row = checkbox.closest('tr');
        const itemId = row.dataset.id;
        checkbox.checked = selectedItems.has(itemId);
        row.classList.toggle('selected', checkbox.checked);
    });
}

function selectAll() {
    const visibleItems = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    visibleItems.forEach(item => {
        selectedItems.add(item.MoldID || item.CutterID);
    });
    updateSelectionDisplay();
    updateSelectAllCheckbox();
    refreshTableSelection();
}

function clearSelection() {
    selectedItems.clear();
    updateSelectionDisplay();
    updateSelectAllCheckbox();
    refreshTableSelection();
}

// Category management
function toggleCategory() {
    const categories = ['all', 'mold', 'cutter'];
    const currentIndex = categories.indexOf(currentCategory);
    const nextIndex = (currentIndex + 1) % categories.length;
    currentCategory = categories[nextIndex];
    
    updateCategoryDisplay();
    updateHeaderColor();
    updateFieldFilterA();
    updateValueFilterB();
    performSearch();
}

function updateCategoryDisplay() {
    const categoryToggle = document.getElementById('categoryToggle');
    const categoryText = document.getElementById('categoryText');
    
    if (categoryToggle && categoryText) {
        categoryToggle.className = `category-toggle ${currentCategory}`;
        
        const categoryNames = {
            'all': 'すべて',
            'mold': '金型',
            'cutter': '抜型'
        };
        
        categoryText.textContent = categoryNames[currentCategory];
    }
}

function updateHeaderColor() {
    const header = document.getElementById('dynamicHeader');
    if (!header) return;
    
    header.className = `dynamic-header ${currentCategory}`;
}

// Pagination
function updatePagination() {
    const totalPages = Math.ceil(filteredData.length / pageSize);
    const paginationControls = document.getElementById('paginationControls');
    
    if (!paginationControls) return;
    
    let html = '';
    
    html += `<button onclick="changePage(${currentPage - 1})" 
             ${currentPage <= 1 ? 'disabled' : ''} class="page-btn">‹</button>`;
    
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        html += `<button onclick="changePage(${i})" 
                 class="page-btn ${i === currentPage ? 'active' : ''}">${i}</button>`;
    }
    
    html += `<button onclick="changePage(${currentPage + 1})" 
             ${currentPage >= totalPages ? 'disabled' : ''} class="page-btn">›</button>`;
    
    paginationControls.innerHTML = html;
}

function changePage(page) {
    const totalPages = Math.ceil(filteredData.length / pageSize);
    if (page < 1 || page > totalPages) return;
    
    currentPage = page;
    displayCurrentPage();
    updatePagination();
    updateSelectAllCheckbox();
    saveSearchState();
}

function changePageSize() {
    const pageSizeSelect = document.getElementById('pageSize');
    if (pageSizeSelect) {
        pageSize = parseInt(pageSizeSelect.value);
        currentPage = 1;
        updateResultsDisplay();
        saveSearchState();
    }
}

// View toggle
function handleViewToggle() {
    const viewToggle = document.getElementById('viewToggle');
    if (viewToggle) {
        currentView = viewToggle.checked ? 'grid' : 'table';
        
        const tableView = document.getElementById('tableView');
        const gridView = document.getElementById('gridView');
        
        if (tableView && gridView) {
            if (currentView === 'table') {
                tableView.style.display = 'block';
                gridView.style.display = 'none';
            } else {
                tableView.style.display = 'none';
                gridView.style.display = 'block';
            }
        }
        
        displayCurrentPage();
        saveSearchState();
    }
}

// Enhanced utility functions
function resetFilters() {
    // Only reset filters, not search input (as requested)
    const fieldFilterA = document.getElementById('fieldFilterA');
    const valueFilterB = document.getElementById('valueFilterB');
    
    if (fieldFilterA) fieldFilterA.value = 'all';
    if (valueFilterB) valueFilterB.value = 'all';
    
    // Do not reset search input
    performSearch();
}

// Enhanced print function with server integration
function printSelected() {
    if (selectedItems.size === 0) {
        alert('選択されたアイテムがありません');
        return;
    }
    
    const selectedData = filteredData.filter(item => 
        selectedItems.has(item.MoldID || item.CutterID)
    );
    
    // Create new print window
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    
    const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>印刷リスト - ${new Date().toLocaleDateString('ja-JP')}</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                h1 { color: #1e40af; border-bottom: 2px solid #1e40af; padding-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f5f5f5; font-weight: bold; }
                .mold-row { background-color: #e0f2fe; }
                .cutter-row { background-color: #fff7ed; }
                .print-info { margin-bottom: 20px; color: #666; }
            </style>
        </head>
        <body>
            <h1>🔧 金型・抜型 印刷リスト V4.24</h1>
            <div class="print-info">
                印刷日時: ${new Date().toLocaleString('ja-JP')}<br>
                選択件数: ${selectedData.length}件
            </div>
            <table>
                <thead>
                    <tr>
                        <th>タイプ</th>
                        <th>ID/No</th>
                        <th>名称</th>
                        <th>サイズ/Cutline</th>
                        <th>場所</th>
                        <th>保管会社</th>
                        <th>備考</th>
                    </tr>
                </thead>
                <tbody>
                    ${selectedData.map(item => {
                        const itemType = item.itemType === 'mold' ? '金型' : '抜型';
                        const itemId = item.itemType === 'cutter' ? (item.CutterNo || item.CutterID) : (item.MoldID);
                        const size = item.itemType === 'cutter' ? (item.cutlineSize || 'N/A') : (item.displayDimensions || 'N/A');
                        const notes = item.itemType === 'cutter' ? (item.CutterNote || 'N/A') : (item.MoldNotes || 'N/A');
                        const company = item.displayStorageCompany?.text || 'N/A';
                        const rowClass = item.itemType === 'mold' ? 'mold-row' : 'cutter-row';
                        
                        return `
                            <tr class="${rowClass}">
                                <td>${itemType}</td>
                                <td>${itemId}</td>
                                <td>${item.displayName || 'N/A'}</td>
                                <td>${size}</td>
                                <td>${item.displayLocation || 'N/A'}</td>
                                <td>${company}</td>
                                <td>${notes}</td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </body>
        </html>
    `;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    
    // Auto print after loading
    printWindow.onload = function() {
        printWindow.print();
    };
}

function zoomFit() {
    if (document.body.requestFullscreen) {
        document.body.requestFullscreen();
    } else if (document.body.webkitRequestFullscreen) {
        document.body.webkitRequestFullscreen();
    }
}

function openDetailPage(itemId, itemType) {
    const page = itemType === 'mold' ? 'detail-mold.html' : 'detail-cutter.html';
    window.location.href = `${page}?id=${itemId}`;
}

// Enhanced state management
function saveSearchState() {
    try {
        const state = {
            query: document.getElementById('searchInput')?.value || '',
            category: currentCategory,
            fieldFilter: document.getElementById('fieldFilterA')?.value || 'all',
            valueFilter: document.getElementById('valueFilterB')?.value || 'all',
            page: currentPage,
            pageSize: pageSize,
            view: currentView
        };
        localStorage.setItem('moldSearchState', JSON.stringify(state));
    } catch (e) {
        console.warn('Failed to save search state:', e);
    }
}

function restoreSearchState() {
    try {
        const saved = localStorage.getItem('moldSearchState');
        if (saved) {
            const state = JSON.parse(saved);
            
            const searchInput = document.getElementById('searchInput');
            if (searchInput && state.query) {
                searchInput.value = state.query;
                updateClearSearchButton();
            }
            
            if (state.category) {
                currentCategory = state.category;
                updateCategoryDisplay();
                updateHeaderColor();
            }
            
            const fieldFilterA = document.getElementById('fieldFilterA');
            if (fieldFilterA && state.fieldFilter) {
                fieldFilterA.value = state.fieldFilter;
            }
            
            if (state.page) currentPage = state.page;
            if (state.pageSize) pageSize = state.pageSize;
            if (state.view) currentView = state.view;
        }
    } catch (e) {
        console.warn('Failed to restore search state:', e);
    }
}

function sortTable(field) {
    if (sortField === field) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortField = field;
        sortDirection = 'asc';
    }
    
    document.querySelectorAll('.sort-icon').forEach(icon => {
        icon.textContent = '↕';
    });
    
    const currentIcon = document.querySelector(`[onclick="sortTable('${field}')"] .sort-icon`);
    if (currentIcon) {
        currentIcon.textContent = sortDirection === 'asc' ? '↑' : '↓';
    }
    
    performSearch();
}

// Load search history from localStorage (V3.0 working method)
function loadSearchHistory() {
    try {
        const saved = localStorage.getItem('moldSearchHistory');
        if (saved) {
            searchHistory = JSON.parse(saved);
            if (searchHistory.length > 20) {
                searchHistory = searchHistory.slice(-20);
            }
        }
    } catch (e) {
        console.warn('Failed to load search history:', e);
        searchHistory = [];
    }
}

// Save search history to localStorage (V3.0 working method)
function saveSearchHistoryToStorage() {
    try {
        localStorage.setItem('moldSearchHistory', JSON.stringify(searchHistory));
    } catch (e) {
        console.warn('Failed to save search history:', e);
    }
}

// Add search term to history (V3.0 logic)
function addToSearchHistory(query) {
    if (!query || query.trim().length < 2) return;
    
    const trimmedQuery = query.trim();
    const now = new Date();
    
    // Remove existing entry if exists
    searchHistory = searchHistory.filter(item => item.query !== trimmedQuery);
    
    // Add new entry at the end
    searchHistory.push({
        query: trimmedQuery,
        timestamp: now.toISOString(),
        count: 1,
        results: filteredData.length
    });
    
    // Keep only last 20 searches
    if (searchHistory.length > 20) {
        searchHistory = searchHistory.slice(-20);
    }
    
    saveSearchHistoryToStorage();
}

function getRecentSearchHistory() {
    return searchHistory
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, 10);
}

function clearSearchHistory() {
    searchHistory = [];
    saveSearchHistoryToStorage();
    updateSearchSuggestions();
    alert('検索履歴をクリアしました');
}

// Export functions for global access (V4.24 compatibility)
window.toggleCategory = toggleCategory;
window.clearSearchInput = clearSearchInput;
window.resetFilters = resetFilters;
window.handleFieldFilterChange = handleFieldFilterChange;
window.handleValueFilterChange = handleValueFilterChange;
window.toggleSelectAll = toggleSelectAll;
window.selectAll = selectAll;
window.clearSelection = clearSelection;
window.printSelected = printSelected;
window.zoomFit = zoomFit;
window.handleViewToggle = handleViewToggle;
window.changePage = changePage;
window.changePageSize = changePageSize;
window.sortTable = sortTable;
window.toggleItemSelection = toggleItemSelection;
window.openDetailPage = openDetailPage;
window.selectSuggestion = selectSuggestion;
window.clearSearchHistory = clearSearchHistory;
window.callBackendApi = callBackendApi;

// Performance monitoring
const performanceMonitor = {
    searchTimes: [],
    averageSearchTime: 0,
    
    recordSearchTime(startTime) {
        const endTime = performance.now();
        const searchTime = endTime - startTime;
        this.searchTimes.push(searchTime);
        
        if (this.searchTimes.length > 100) {
            this.searchTimes.shift();
        }
        
        this.averageSearchTime = this.searchTimes.reduce((a, b) => a + b, 0) / this.searchTimes.length;
        
        if (searchTime > 1000) {
            console.warn(`Slow search detected: ${searchTime.toFixed(2)}ms`);
        }
    }
};

// Enhanced search with performance monitoring
const originalPerformSearch = performSearch;
performSearch = function() {
    const startTime = performance.now();
    const result = originalPerformSearch.apply(this, arguments);
    performanceMonitor.recordSearchTime(startTime);
    return result;
};

// Mobile optimizations
function optimizeForMobile() {
    if (window.innerWidth <= 768) {
        pageSize = Math.min(pageSize, 25); // Reduce page size on mobile
        
        // Optimize table display for mobile
        const table = document.getElementById('dataTable');
        if (table) {
            table.classList.add('mobile-optimized');
        }
        
        // Optimize search suggestions for mobile
        const suggestions = document.getElementById('searchSuggestions');
        if (suggestions) {
            suggestions.classList.add('mobile-suggestions');
        }
    }
}

// Initialize mobile optimizations
window.addEventListener('resize', optimizeForMobile);
window.addEventListener('orientationchange', optimizeForMobile);

// Enhanced accessibility functions
function enhanceAccessibility() {
    // Add ARIA labels
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.setAttribute('aria-describedby', 'search-help');
        searchInput.setAttribute('role', 'combobox');
        searchInput.setAttribute('aria-expanded', 'false');
        searchInput.setAttribute('aria-autocomplete', 'list');
    }
    
    // Add keyboard navigation hints
    const suggestions = document.getElementById('searchSuggestions');
    if (suggestions) {
        suggestions.setAttribute('role', 'listbox');
        suggestions.setAttribute('aria-label', '検索候補');
    }
}

// Initialize accessibility enhancements
document.addEventListener('DOMContentLoaded', enhanceAccessibility);

// Version information
window.MOLD_CUTTER_SEARCH_VERSION = 'V4.24';
window.MOLD_CUTTER_SEARCH_BUILD = new Date().toISOString();

console.log(`金型・抜型検索システム ${window.MOLD_CUTTER_SEARCH_VERSION} initialized successfully`);
console.log('V4.24 Script loaded with V4.221 UI and V3.0 server logic integration');

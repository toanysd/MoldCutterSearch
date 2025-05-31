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
    companies: []
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

// Search history và suggestions
let searchHistory = [];
let suggestionIndex = -1;
let isShowingSuggestions = false;
let hideTimeout = null;

const GITHUB_BASE_URL = "https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/";

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    // Load search history
    loadSearchHistory();
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.focus();
        
        // Enhanced event listeners
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
            setTimeout(() => {
                zoomFit();
            }, 300);
        });
        
        searchInput.addEventListener('keydown', handleSearchKeydown);
        searchInput.addEventListener('input', handleSearchInput);
    }
    
    // Enhanced click outside handler
    document.addEventListener('click', function(e) {
        const searchContainer = e.target.closest('.search-input-ultra');
        const suggestionContainer = e.target.closest('.search-suggestions');
        
        if (!searchContainer && !suggestionContainer) {
            hideSearchSuggestions(true);
        }
    });
    
    // Prevent zoom on all form elements
    const formElements = document.querySelectorAll('input, select, textarea');
    formElements.forEach(element => {
        element.style.fontSize = '16px';
        element.addEventListener('focus', function() {
            this.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    });
    
    showLoading(true);
    loadAllData().then(() => {
        initializeFilters();
        restoreSearchState();
        performSearch();
        showLoading(false);
        console.log('データ読み込み完了');
    }).catch(error => {
        console.error('データ読み込みエラー:', error);
        showLoading(false);
        showError(`エラー: ${error.message}`);
    });
});

// Load search history from localStorage
function loadSearchHistory() {
    try {
        const saved = localStorage.getItem('moldSearchHistory');
        if (saved) {
            searchHistory = JSON.parse(saved);
            if (searchHistory.length > 20) {
                searchHistory = searchHistory.slice(-20);
                saveSearchHistory();
            }
        }
    } catch (e) {
        console.warn('Failed to load search history:', e);
        searchHistory = [];
    }
}

// Save search history to localStorage
function saveSearchHistory() {
    try {
        localStorage.setItem('moldSearchHistory', JSON.stringify(searchHistory));
    } catch (e) {
        console.warn('Failed to save search history:', e);
    }
}

// Add search term to history
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

// Show search suggestions
function showSearchSuggestions() {
    const suggestions = document.getElementById('searchSuggestions');
    const searchInput = document.getElementById('searchInput');
    
    if (!suggestions || !searchInput) return;
    
    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }
    
    const query = searchInput.value.trim();
    const suggestionsList = generateSuggestions(query);
    updateSuggestionsContent(suggestionsList);
    
    suggestions.style.display = 'block';
    isShowingSuggestions = true;
    suggestionIndex = -1;
    
    searchInput.style.borderBottomLeftRadius = '0';
    searchInput.style.borderBottomRightRadius = '0';
}

// Enhanced hide search suggestions với delay tốt hơn
function hideSearchSuggestions(immediate = false) {
    if (immediate) {
        performHide();
    } else {
        hideTimeout = setTimeout(() => {
            performHide();
        }, 500);
    }
}

function performHide() {
    const suggestions = document.getElementById('searchSuggestions');
    const searchInput = document.getElementById('searchInput');
    
    if (suggestions) {
        suggestions.style.display = 'none';
    }
    
    if (searchInput) {
        searchInput.style.borderBottomLeftRadius = 'var(--radius-md)';
        searchInput.style.borderBottomRightRadius = 'var(--radius-md)';
    }
    
    isShowingSuggestions = false;
    suggestionIndex = -1;
    hideTimeout = null;
}

// Generate suggestions based on query
function generateSuggestions(query = '') {
    const suggestions = [];
    const queryLower = query.toLowerCase();
    
    // Filter search history
    const historyMatches = searchHistory
        .filter(item => {
            if (!query) return true;
            return item.query.toLowerCase().includes(queryLower);
        })
        .reverse()
        .slice(0, 8);
    
    // Add history suggestions
    historyMatches.forEach(item => {
        suggestions.push({
            type: 'history',
            text: item.query,
            meta: {
                results: item.results,
                time: formatRelativeTime(item.timestamp)
            }
        });
    });
    
    // Add smart suggestions based on current data
    if (query.length >= 2) {
        const smartSuggestions = generateSmartSuggestions(query);
        suggestions.push(...smartSuggestions.slice(0, 5));
    }
    
    return suggestions;
}

// Generate smart suggestions from current data
function generateSmartSuggestions(query) {
    const suggestions = [];
    const queryLower = query.toLowerCase();
    const seen = new Set();
    
    const allDataItems = [...(allData.molds || []), ...(allData.cutters || [])];
    
    allDataItems.forEach(item => {
        const searchFields = [
            item.displayCode, item.displayName, item.displayDimensions,
            item.displayCustomer, item.MoldCode, item.CutterNo,
            item.MoldName, item.CutterName, item.CutterDesignName
        ].filter(field => field && field.toString().trim());
        
        searchFields.forEach(field => {
            const fieldStr = field.toString();
            if (fieldStr.toLowerCase().includes(queryLower) && 
                fieldStr.length <= 50 && 
                !seen.has(fieldStr)) {
                
                seen.add(fieldStr);
                suggestions.push({
                    type: 'smart',
                    text: fieldStr,
                    meta: {
                        type: item.itemType === 'mold' ? '金型' : '抜型'
                    }
                });
            }
        });
    });
    
    return suggestions.slice(0, 5);
}

// Update suggestions content với better event handling
function updateSuggestionsContent(suggestions) {
    const suggestionsList = document.getElementById('suggestionsList');
    if (!suggestionsList) return;
    
    if (suggestions.length === 0) {
        suggestionsList.innerHTML = '<div class="no-suggestions">検索履歴がありません - Không có lịch sử tìm kiếm</div>';
        return;
    }
    
    let html = '';
    suggestions.forEach((suggestion, index) => {
        const isHistory = suggestion.type === 'history';
        const metaHtml = isHistory 
            ? `<span class="suggestion-count">${suggestion.meta.results}件</span>
               <span class="suggestion-time">${suggestion.meta.time}</span>`
            : `<span class="suggestion-count">${suggestion.meta.type}</span>`;
        
        html += `
            <div class="suggestion-item" 
                 data-index="${index}" 
                 onmousedown="selectSuggestion('${escapeHtml(suggestion.text)}')"
                 onmouseenter="highlightSuggestion(${index})"
                 onmouseleave="clearSuggestionHighlight()">
                <span class="suggestion-text">${highlightQuery(suggestion.text, document.getElementById('searchInput')?.value || '')}</span>
                <div class="suggestion-meta">
                    ${metaHtml}
                    ${isHistory ? `<button class="remove-suggestion" onmousedown="removeSuggestion('${escapeHtml(suggestion.text)}', event)">×</button>` : ''}
                </div>
            </div>
        `;
    });
    
    suggestionsList.innerHTML = html;
}

// Helper functions cho mouse interaction
function highlightSuggestion(index) {
    suggestionIndex = index;
    updateSuggestionHighlight();
}

function clearSuggestionHighlight() {
    suggestionIndex = -1;
    updateSuggestionHighlight();
}

// Handle keyboard navigation in search
function handleSearchKeydown(event) {
    if (!isShowingSuggestions) {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            showSearchSuggestions();
            return;
        }
        return;
    }
    
    const suggestionItems = document.querySelectorAll('.suggestion-item');
    const maxIndex = suggestionItems.length - 1;
    
    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            suggestionIndex = Math.min(suggestionIndex + 1, maxIndex);
            updateSuggestionHighlight();
            break;
            
        case 'ArrowUp':
            event.preventDefault();
            suggestionIndex = Math.max(suggestionIndex - 1, -1);
            updateSuggestionHighlight();
            break;
            
        case 'Enter':
            event.preventDefault();
            if (suggestionIndex >= 0 && suggestionItems[suggestionIndex]) {
                const suggestionText = suggestionItems[suggestionIndex].querySelector('.suggestion-text').textContent;
                selectSuggestion(suggestionText);
            } else {
                hideSearchSuggestions(true);
                performSearch();
            }
            break;
            
        case 'Escape':
            hideSearchSuggestions(true);
            break;
            
        case 'Tab':
            hideSearchSuggestions(true);
            break;
    }
}

// Update suggestion highlight
function updateSuggestionHighlight() {
    const suggestionItems = document.querySelectorAll('.suggestion-item');
    
    suggestionItems.forEach((item, index) => {
        if (index === suggestionIndex) {
            item.classList.add('highlighted');
        } else {
            item.classList.remove('highlighted');
        }
    });
}

// Enhanced select suggestion
function selectSuggestion(text) {
    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = text;
        hideSearchSuggestions(true);
        updateClearSearchButton();
        performSearch();
        searchInput.focus();
    }
}

// Enhanced remove suggestion
function removeSuggestion(text, event) {
    event.stopPropagation();
    event.preventDefault();
    
    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }
    
    searchHistory = searchHistory.filter(item => item.query !== text);
    saveSearchHistory();
    
    const query = document.getElementById('searchInput')?.value || '';
    if (query.length > 0) {
        showFilteredSuggestions(query);
    } else {
        showSearchSuggestions();
    }
}

// Enhanced clear search history
function clearSearchHistory() {
    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }
    
    searchHistory = [];
    saveSearchHistory();
    
    const query = document.getElementById('searchInput')?.value || '';
    if (query.length > 0) {
        showFilteredSuggestions(query);
    } else {
        showSearchSuggestions();
    }
}

// Show filtered suggestions based on query
function showFilteredSuggestions(query) {
    const suggestions = document.getElementById('searchSuggestions');
    if (!suggestions) return;
    
    const filteredSuggestions = generateSuggestions(query);
    updateSuggestionsContent(filteredSuggestions);
    
    suggestions.style.display = 'block';
    isShowingSuggestions = true;
    suggestionIndex = -1;
}

// Load all data từ GitHub
async function loadAllData() {
    const dataFiles = [
        { key: 'molds', file: 'molds.csv', required: true },
        { key: 'cutters', file: 'cutters.csv', required: true },
        { key: 'customers', file: 'customers.csv', required: false },
        { key: 'molddesign', file: 'molddesign.csv', required: false },
        { key: 'moldcutter', file: 'molcutter.csv', required: false },
        { key: 'shiplog', file: 'shiplog.csv', required: false },
        { key: 'locationlog', file: 'locationlog.csv', required: false },
        { key: 'employees', file: 'employees.csv', required: false },
        { key: 'racklayers', file: 'racklayers.csv', required: false },
        { key: 'racks', file: 'racks.csv', required: false },
        { key: 'companies', file: 'companies.csv', required: false }
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

// Enhanced data processing với molddesign fields
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

    const companyMap = new Map();
    allData.companies.forEach(company => {
        companyMap.set(company.CompanyID, company);
    });

    const rackMap = new Map();
    allData.racks.forEach(rack => {
        rackMap.set(rack.RackID, rack);
    });

    const rackLayerMap = new Map();
    allData.racklayers.forEach(layer => {
        rackLayerMap.set(layer.RackLayerID, layer);
    });

    // Process molds
    allData.molds = allData.molds.map(mold => {
        const design = moldDesignMap.get(mold.MoldDesignID) || {};
        const customer = customerMap.get(mold.CustomerID) || {};
        const company = companyMap.get(customer.CompanyID) || {};
        const rackLayer = rackLayerMap.get(mold.RackLayerID) || {};
        const rack = rackLayer.RackID ? rackMap.get(rackLayer.RackID) || {} : {};
        
        let cutlineDimension = '';
        if (design.CutlineX && design.CutlineY) {
            cutlineDimension = `${design.CutlineX}x${design.CutlineY}`;
        }
        
        return {
            ...mold,
            designInfo: design,
            customerInfo: customer,
            companyInfo: company,
            rackLayerInfo: rackLayer,
            rackInfo: rack,
            relatedCutters: getRelatedCutters(mold.MoldID),
            shipHistory: getShipHistory('MOLD', mold.MoldID),
            locationHistory: getLocationHistory('MOLD', mold.MoldID),
            currentStatus: getCurrentStatus(mold),
            displayCode: mold.MoldCode || '',
            displayName: mold.MoldName || mold.MoldCode || '',
            displayDimensions: createCombinedDimensionString(mold, design),
            displayLocation: mold.RackLayerID || '', // Vị trí
            displayRackLayerNotes: rackLayer.RackLayerNotes || '', // Ghi chú
            displayCustomer: getCustomerDisplayName(customer, company),
            displayPlasticType: design.DesignForPlasticType || mold.DefaultPlasticType || '',
            lastUpdate: getLastUpdateDate(mold),
            itemType: 'mold',
            drawingNumber: design.DrawingNumber || '',
            equipmentCode: design.EquipmentCode || '',
            moldSetupType: design.MoldSetupType || '',
            cutlineDimension: cutlineDimension,
            textContent: design.TextContent || '',
            rackName: getRackDisplayName(mold.RackLayerID),
            thumbnailUrl: mold.MoldPicture || ''
        };
    });

    // Process cutters với CutterNo formatting
    allData.cutters = allData.cutters.map(cutter => {
        const customer = customerMap.get(cutter.CustomerID) || {};
        const company = companyMap.get(customer.CompanyID) || {};
        const rackLayer = rackLayerMap.get(cutter.RackLayerID) || {};
        const rack = rackLayer.RackID ? rackMap.get(rackLayer.RackID) || {} : {};
        
        let displayName = '';
        if (cutter.CutterNo && cutter.CutterName) {
            displayName = `${cutter.CutterNo}. ${cutter.CutterName}`;
        } else if (cutter.CutterNo && cutter.CutterDesignName) {
            displayName = `${cutter.CutterNo}. ${cutter.CutterDesignName}`;
        } else if (cutter.CutterNo) {
            displayName = cutter.CutterNo;
        } else {
            displayName = cutter.CutterDesignName || cutter.CutterName || '';
        }
        
        return {
            ...cutter,
            customerInfo: customer,
            companyInfo: company,
            rackLayerInfo: rackLayer,
            rackInfo: rack,
            relatedMolds: getRelatedMolds(cutter.CutterID),
            shipHistory: getShipHistory('CUTTER', cutter.CutterID),
            locationHistory: getLocationHistory('CUTTER', cutter.CutterID),
            currentStatus: getCurrentStatus(cutter),
            displayCode: cutter.CutterNo || '',
            displayName: displayName,
            displayDimensions: createCutterCombinedDimensionString(cutter),
            displayLocation: cutter.RackLayerID || '', // Vị trí
            displayRackLayerNotes: rackLayer.RackLayerNotes || '', // Ghi chú
            displayCustomer: getCustomerDisplayName(customer, company),
            displayPlasticType: cutter.PlasticCutType || '',
            lastUpdate: getLastUpdateDate(cutter),
            itemType: 'cutter',
            rackName: getRackDisplayName(cutter.RackLayerID),
            thumbnailUrl: ''
        };
    });
}

// Enhanced rack display functions
function getRackDisplayName(rackLayerID) {
    if (!rackLayerID) return '';
    const rackLayer = allData.racklayers.find(r => r.RackLayerID === rackLayerID);
    if (!rackLayer) return '';
    const rack = allData.racks.find(r => r.RackID === rackLayer.RackID);
    if (!rack) return '';
    
    return `${rack.RackSymbol || rack.RackName || ''} - ${rack.RackLocation || ''}`.trim();
}

// Create combined dimension string
function createCombinedDimensionString(mold, design) {
    if (design.MoldDesignLength && design.MoldDesignWidth && design.MoldDesignHeight) {
        return `${design.MoldDesignLength}x${design.MoldDesignWidth}x${design.MoldDesignHeight}`;
    }
    if (design.MoldDesignDim) return design.MoldDesignDim;
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

// Get customer display name với company info
function getCustomerDisplayName(customer, company) {
    if (!customer || !customer.CustomerID) return '';
    let displayName = customer.CustomerShortName || customer.CustomerName || customer.CustomerID;
    if (company && company.CompanyShortName) {
        displayName = `${company.CompanyShortName} - ${displayName}`;
    }
    return displayName;
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
    updateFieldFilterA();
    updateValueFilterB();
}

// Update Field Filter A với placeholder mới
function updateFieldFilterA() {
    const fieldFilterA = document.getElementById('fieldFilterA');
    if (!fieldFilterA) return;
    
    fieldFilterA.innerHTML = '<option value="all">フィールドを選択</option>'; // Chọn cột để lọc
    
    const fieldOptions = [
        { value: 'displayCode', text: 'コード' },
        { value: 'displayName', text: '名称' },
        { value: 'displayDimensions', text: 'サイズ' },
        { value: 'displayLocation', text: '場所' },
        { value: 'displayRackLayerNotes', text: 'ノート' }, // Ghi chú
        { value: 'displayCustomer', text: '顧客' },
        { value: 'displayPlasticType', text: 'プラ' },
        { value: 'drawingNumber', text: '図面' },
        { value: 'equipmentCode', text: '設備' },
        { value: 'rackName', text: 'ラック' }
    ];
    
    fieldOptions.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option.value;
        optionElement.textContent = option.text;
        fieldFilterA.appendChild(optionElement);
    });
}

// Update Value Filter B với placeholder mới
function updateValueFilterB() {
    const fieldFilterA = document.getElementById('fieldFilterA');
    const valueFilterB = document.getElementById('valueFilterB');
    
    if (!fieldFilterA || !valueFilterB) return;
    
    const selectedField = fieldFilterA.value;
    valueFilterB.innerHTML = '<option value="all">データでフィルタ</option>'; // Lọc theo dữ liệu
    
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

// Fixed multi-keyword search functionality
function performSearch() {
    const query = document.getElementById('searchInput')?.value.trim() || '';
    const fieldFilterA = document.getElementById('fieldFilterA')?.value || 'all';
    const valueFilterB = document.getElementById('valueFilterB')?.value || 'all';
    
    // Add to search history if query is not empty
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
    
    let preFilteredData = dataToSearch;
    if (fieldFilterA !== 'all' && valueFilterB !== 'all') {
        preFilteredData = dataToSearch.filter(item => 
            item[fieldFilterA] && item[fieldFilterA].toString() === valueFilterB
        );
    }
    
    filteredData = preFilteredData.filter(item => {
        let textMatch = true;
        if (query) {
            const keywords = query.split(',')
                .map(k => k.trim().toLowerCase())
                .filter(k => k.length > 0);
            
            if (keywords.length > 0) {
                textMatch = keywords.every(keyword => {
                    const searchFields = [
                        item.displayCode, item.displayName, item.displayDimensions,
                        item.displayLocation, item.displayRackLayerNotes, item.displayCustomer, item.displayPlasticType,
                        item.MoldID, item.CutterID, item.MoldCode, item.CutterNo,
                        item.MoldName, item.CutterName, item.CutterDesignName,
                        item.drawingNumber, item.equipmentCode, item.moldSetupType,
                        item.cutlineDimension, item.textContent, item.rackName
                    ].filter(field => field && field.toString().trim());
                    
                    return searchFields.some(field => 
                        field.toString().toLowerCase().includes(keyword)
                    ) || 
                    (item.displayDimensions && 
                     item.displayDimensions.toLowerCase().replace(/\s/g, '').includes(keyword.replace(/\s/g, ''))) ||
                    (item.cutlineDimension && 
                     item.cutlineDimension.toLowerCase().replace(/\s/g, '').includes(keyword.replace(/\s/g, '')));
                });
            }
        }
        return textMatch;
    });
    
    if (sortField) applySorting();
    currentPage = 1;
    displayData();
    updateResultsCount();
    updatePagination();
    updateClearSearchButton();
    saveSearchState();
    hideSearchSuggestions(true);
}

// Zoom fit function
function zoomFit() {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
    }
    document.body.style.zoom = '1';
    window.scrollTo(0, 0);
    if (document.activeElement) {
        document.activeElement.blur();
    }
    const zoomBtn = document.querySelector('.zoom-fit-btn');
    if (zoomBtn) {
        zoomBtn.style.background = 'var(--success-green)';
        zoomBtn.style.color = 'var(--white)';
        setTimeout(() => {
            zoomBtn.style.background = '';
            zoomBtn.style.color = '';
        }, 500);
    }
}

// Enhanced category toggle với text ngắn
function toggleCategory() {
    const categoryToggle = document.getElementById('categoryToggle');
    const categoryText = document.getElementById('categoryText');
    const dynamicHeader = document.getElementById('dynamicHeader');
    
    switch (currentCategory) {
        case 'all':
            currentCategory = 'mold';
            categoryText.textContent = '金型';
            categoryToggle.className = 'category-toggle-mini mold';
            if (dynamicHeader) dynamicHeader.className = 'dynamic-header mold';
            break;
        case 'mold':
            currentCategory = 'cutter';
            categoryText.textContent = '抜型';
            categoryToggle.className = 'category-toggle-mini cutter';
            if (dynamicHeader) dynamicHeader.className = 'dynamic-header cutter';
            break;
        case 'cutter':
            currentCategory = 'all';
            categoryText.textContent = '全て';
            categoryToggle.className = 'category-toggle-mini all';
            if (dynamicHeader) dynamicHeader.className = 'dynamic-header all';
            break;
    }
    
    updateValueFilterB();
    performSearch();
}

// Enhanced clear search với left position
function clearSearchInput() {
    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }
    
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
        updateClearSearchButton();
        hideSearchSuggestions(true);
        performSearch();
        setTimeout(() => {
            zoomFit();
        }, 100);
    }
}

// Update clear search button visibility
function updateClearSearchButton() {
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    
    if (searchInput && clearBtn) {
        if (searchInput.value.trim()) {
            clearBtn.style.display = 'flex';
        } else {
            clearBtn.style.display = 'none';
        }
    }
}

// Reset filters (chỉ A và B)
function resetFilters() {
    const fieldFilterA = document.getElementById('fieldFilterA');
    const valueFilterB = document.getElementById('valueFilterB');
    
    if (fieldFilterA) fieldFilterA.value = 'all';
    if (valueFilterB) valueFilterB.value = 'all';
    
    updateValueFilterB();
    performSearch();
}

// View toggle functionality
function handleViewToggle() {
    const viewToggle = document.getElementById('viewToggle');
    const tableView = document.getElementById('tableView');
    const gridView = document.getElementById('gridView');
    
    if (viewToggle.checked) {
        currentView = 'grid';
        if (tableView) tableView.style.display = 'none';
        if (gridView) gridView.style.display = 'block';
    } else {
        currentView = 'table';
        if (tableView) tableView.style.display = 'block';
        if (gridView) gridView.style.display = 'none';
    }
    
    displayData();
    saveSearchState();
}

// Enhanced display data với grid view support
function displayData() {
    if (currentView === 'table') {
        displayTableData();
    } else {
        displayGridData();
    }
    updateSelectAllCheckbox();
}

// Enhanced display table data với 2 cột Vị trí và Ghi chú
function displayTableData() {
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
        
        if (itemType === 'cutter' && currentCategory === 'all') {
            row.classList.add('cutter');
        }
        
        if (selectedItems.has(itemId)) {
            row.classList.add('selected');
        }
        
        let thumbnailHtml = '';
        if (item.thumbnailUrl && item.itemType === 'mold') {
            thumbnailHtml = `<img src="${item.thumbnailUrl}" alt="Mold ${itemId}" class="mold-thumbnail-mini" 
                                 loading="lazy"
                                 onclick="showImageModal('${item.originalImageUrl}', '${item.displayName}')"
                                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                            <div class="mold-thumbnail-mini placeholder" style="display: none;">📷</div>`;
        } else {
            thumbnailHtml = '<div class="mold-thumbnail-mini placeholder">📷</div>';
        }
        
        row.innerHTML = `
            <td class="select-col-mini">
                <input type="checkbox" ${selectedItems.has(itemId) ? 'checked' : ''} 
                       onchange="toggleSelection('${itemId}', this.checked)">
            </td>
            <td class="thumbnail-col-mini">${thumbnailHtml}</td>
            <td class="id-col-mini">${itemId}</td>
            <td class="name-col-mini">
                <a href="detail.html?id=${itemId}&type=${itemType}" class="name-link-mini ${itemType}" onclick="saveSearchState()">
                    ${item.displayName}
                </a>
            </td>
            <td class="size-col-mini">${item.displayDimensions}</td>
            <td class="location-col-mini" title="${item.displayLocation}">${item.displayLocation}</td>
            <td class="notes-col-mini" title="${item.displayRackLayerNotes}">${item.displayRackLayerNotes}</td>
        `;
        
        tableBody.appendChild(row);
    });
}

// Display grid data (cập nhật để hiển thị RackLayerNotes)
function displayGridData() {
    const gridContainer = document.getElementById('gridContainer');
    if (!gridContainer) return;
    
    gridContainer.innerHTML = '';
    
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = pageSize === 'all' ? filteredData.length : startIndex + parseInt(pageSize);
    const pageData = filteredData.slice(startIndex, endIndex);
    
    pageData.forEach(item => {
        const itemId = item.MoldID || item.CutterID || '';
        const itemType = item.MoldID ? 'mold' : 'cutter';
        
        const gridItem = document.createElement('div');
        gridItem.className = `grid-item ${itemType}`;
        
        if (selectedItems.has(itemId)) {
            gridItem.classList.add('selected');
        }
        
        let thumbnailHtml = '';
        if (item.thumbnailUrl && item.itemType === 'mold') {
            thumbnailHtml = `<img src="${item.thumbnailUrl}" alt="Mold ${itemId}" class="grid-thumbnail-img" 
                                 loading="lazy"
                                 onclick="showImageModal('${item.originalImageUrl}', '${item.displayName}')"
                                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                            <div class="grid-thumbnail-placeholder" style="display: none;">📷</div>`;
        } else {
            thumbnailHtml = '<div class="grid-thumbnail-placeholder">📷</div>';
        }
        
        gridItem.innerHTML = `
            <div class="grid-item-type">${itemType === 'mold' ? '金型' : '抜型'}</div>
            <div class="grid-item-checkbox">
                <input type="checkbox" ${selectedItems.has(itemId) ? 'checked' : ''} 
                       onchange="toggleSelection('${itemId}', this.checked)" onclick="event.stopPropagation()">
            </div>
            <div class="grid-item-thumbnail">
                ${thumbnailHtml}
            </div>
            <div class="grid-item-content">
                <div class="grid-item-id">${itemId}</div>
                <a href="detail.html?id=${itemId}&type=${itemType}" class="grid-item-name ${itemType}" onclick="saveSearchState()">
                    ${item.displayName}
                </a>
                <div class="grid-item-details">
                    <div class="grid-item-detail">
                        <span class="grid-detail-label">サイズ:</span>
                        <span class="grid-detail-value">${item.displayDimensions}</span>
                    </div>
                    <div class="grid-item-detail">
                        <span class="grid-detail-label">場所:</span>
                        <span class="grid-detail-value" title="${item.displayLocation}">${item.displayLocation}</span>
                    </div>
                    <div class="grid-item-detail">
                        <span class="grid-detail-label">ノート:</span>
                        <span class="grid-detail-value" title="${item.displayRackLayerNotes}">${item.displayRackLayerNotes}</span>
                    </div>
                    <div class="grid-item-detail">
                        <span class="grid-detail-label">顧客:</span>
                        <span class="grid-detail-value">${item.displayCustomer}</span>
                    </div>
                </div>
            </div>
        `;
        
        gridItem.addEventListener('click', (e) => {
            if (e.target.type !== 'checkbox' && !e.target.closest('a')) {
                window.location.href = `detail.html?id=${itemId}&type=${itemType}`;
            }
        });
        
        gridContainer.appendChild(gridItem);
    });
}

// Real-time search input handler
function handleSearchInput() {
    updateClearSearchButton();
    if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
    }
    if (document.activeElement === document.getElementById('searchInput')) {
        const query = document.getElementById('searchInput')?.value || '';
        if (query.length > 0) {
            showFilteredSuggestions(query);
        } else {
            showSearchSuggestions();
        }
    }
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        performSearch();
    }, 300);
}

// Filter change handlers
function handleFieldFilterChange() {
    updateValueFilterB();
    performSearch();
}

function handleValueFilterChange() {
    performSearch();
}

// Sort table (Thêm sort cho RackLayerNotes)
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
            case 'notes': // Sort cho RackLayerNotes
                aValue = a.displayRackLayerNotes;
                bValue = b.displayRackLayerNotes;
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

// Update sort icons
function updateSortIcons() {
    document.querySelectorAll('.sort-icon').forEach(icon => {
        icon.textContent = '↕️';
    });
    
    const currentHeader = document.querySelector(`th[onclick="sortTable('${sortField}')"] .sort-icon`);
    if (currentHeader) {
        currentHeader.textContent = sortDirection === 'asc' ? '↑' : '↓';
    }
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
            selectedCount.textContent = `選択: ${selectedItems.size}`;
            selectedCount.style.display = 'inline-block';
        }
        if (printBtn) {
            printBtn.style.display = 'inline-block';
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

// Enhanced print function (thêm cột Ghi chú)
function printSelected() {
    if (selectedItems.size === 0) {
        alert('印刷するアイテムを選択してください');
        return;
    }
    
    const selectedData = [...allData.molds, ...allData.cutters].filter(item => 
        selectedItems.has(item.MoldID || item.CutterID)
    );
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>印刷リスト</title>
            <style>
                body { font-family: Arial, sans-serif; font-size: 12px; margin: 20px; }
                .print-table { width: 100%; border-collapse: collapse; }
                .print-table th { 
                    background: #f0f0f0; 
                    font-weight: bold; 
                    text-align: center; 
                    padding: 8px 4px; 
                    border: 1px solid #000; 
                }
                .print-table td { 
                    padding: 6px 4px; 
                    border: 1px solid #000; 
                    text-align: left; 
                }
                .print-header { 
                    text-align: center; 
                    margin-bottom: 20px; 
                    border-bottom: 2px solid #000;
                    padding-bottom: 10px;
                }
                .print-info {
                    margin-bottom: 15px;
                    font-size: 10px;
                    color: #666;
                }
            </style>
        </head>
        <body>
            <div class="print-header">
                <h2>選択されたアイテム - Danh sách đã chọn</h2>
                <div class="print-info">
                    印刷日時 - Ngày in: ${new Date().toLocaleString('ja-JP')}<br>
                    総件数 - Tổng số: ${selectedData.length} 件
                </div>
            </div>
            <table class="print-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>名称 - Tên</th>
                        <th>サイズ - Kích thước</th>
                        <th>場所 - Vị trí</th>
                        <th>ノート - Ghi chú</th>
                        <th>種類 - Loại</th>
                    </tr>
                </thead>
                <tbody>
                    ${selectedData.map(item => `
                        <tr>
                            <td>${item.MoldID || item.CutterID}</td>
                            <td>${item.displayName}</td>
                            <td>${item.displayDimensions}</td>
                            <td>${item.displayLocation}</td>
                            <td>${item.displayRackLayerNotes}</td>
                            <td>${item.itemType === 'mold' ? '金型' : '抜型'}</td>
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
        html += `<button onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>前</button>`;
        
        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            if (i === currentPage) {
                html += `<button class="active">${i}</button>`;
            } else if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
                html += `<button onclick="changePage(${i})">${i}</button>`;
            } else if (i === currentPage - 2 || i === currentPage + 2) {
                html += `<span>...</span>`;
            }
        }
        
        // Next button
        html += `<button onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>次</button>`;
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

// Enhanced search state management
function saveSearchState() {
    const searchState = {
        searchInput: document.getElementById('searchInput')?.value || '',
        currentCategory: currentCategory,
        fieldFilterA: document.getElementById('fieldFilterA')?.value || 'all',
        valueFilterB: document.getElementById('valueFilterB')?.value || 'all',
        currentPage: currentPage,
        pageSize: pageSize,
        sortField: sortField,
        sortDirection: sortDirection,
        selectedItems: Array.from(selectedItems),
        currentView: currentView
    };
    localStorage.setItem('moldSearchState', JSON.stringify(searchState));
}

function restoreSearchState() {
    const saved = localStorage.getItem('moldSearchState');
    if (saved) {
        try {
            const state = JSON.parse(saved);
            
            if (state.searchInput) {
                const searchInput = document.getElementById('searchInput');
                if (searchInput) searchInput.value = state.searchInput;
            }
            
            if (state.currentCategory) {
                currentCategory = state.currentCategory;
                const categoryToggle = document.getElementById('categoryToggle');
                const categoryText = document.getElementById('categoryText');
                const dynamicHeader = document.getElementById('dynamicHeader');
                
                if (categoryToggle && categoryText) {
                    switch (currentCategory) {
                        case 'mold':
                            categoryText.textContent = '金型';
                            categoryToggle.className = 'category-toggle-mini mold';
                            if (dynamicHeader) dynamicHeader.className = 'dynamic-header mold';
                            break;
                        case 'cutter':
                            categoryText.textContent = '抜型';
                            categoryToggle.className = 'category-toggle-mini cutter';
                            if (dynamicHeader) dynamicHeader.className = 'dynamic-header cutter';
                            break;
                        default:
                            categoryText.textContent = '全て';
                            categoryToggle.className = 'category-toggle-mini all';
                            if (dynamicHeader) dynamicHeader.className = 'dynamic-header all';
                    }
                }
            }
            
            if (state.fieldFilterA) {
                const fieldFilterA = document.getElementById('fieldFilterA');
                if (fieldFilterA) fieldFilterA.value = state.fieldFilterA;
            }
            
            if (state.valueFilterB) {
                const valueFilterB = document.getElementById('valueFilterB');
                if (valueFilterB) valueFilterB.value = state.valueFilterB;
            }
            
            if (state.currentView) {
                currentView = state.currentView;
                const viewToggle = document.getElementById('viewToggle');
                if (viewToggle) {
                    viewToggle.checked = currentView === 'grid';
                    handleViewToggle();
                }
            }
            
            if (state.currentPage) currentPage = state.currentPage;
            if (state.pageSize) pageSize = state.pageSize;
            if (state.sortField) sortField = state.sortField;
            if (state.sortDirection) sortDirection = state.sortDirection;
            
            if (state.selectedItems) {
                selectedItems = new Set(state.selectedItems);
            }
            
            const pageSizeSelect = document.getElementById('pageSize');
            if (pageSizeSelect && state.pageSize) {
                pageSizeSelect.value = state.pageSize;
            }
            
        } catch (e) {
            console.warn('Failed to restore search state:', e);
        }
    }
}

function updateResultsCount() {
    const resultsCount = document.getElementById('resultsCount');
    if (resultsCount) {
        const count = filteredData.length;
        resultsCount.textContent = `${count}件`;
    }
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

// Image modal function
function showImageModal(imageUrl, title) {
    if (!imageUrl) return;
    
    const modal = document.createElement('div');
    modal.className = 'image-modal';
    modal.innerHTML = `
        <div class="image-modal-content">
            <div class="image-modal-header">
                <h3>${title}</h3>
                <button class="image-modal-close" onclick="closeImageModal()">&times;</button>
            </div>
            <div class="image-modal-body">
                <img src="${imageUrl}" alt="${title}" class="modal-image" loading="lazy">
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'flex';
}

function closeImageModal() {
    const modal = document.querySelector('.image-modal');
    if (modal) {
        modal.remove();
    }
}

// Utility functions for autocomplete
function formatRelativeTime(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diffMs = now - time;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffMins < 1) return '今';
    if (diffMins < 60) return `${diffMins}分前`;
    if (diffHours < 24) return `${diffHours}時間前`;
    if (diffDays < 7) return `${diffDays}日前`;
    
    return time.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

function highlightQuery(text, query) {
    if (!query || query.length < 2) return escapeHtml(text);
    
    const escapedText = escapeHtml(text);
    const escapedQuery = escapeHtml(query);
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    
    return escapedText.replace(regex, '<mark style="background: var(--accent-orange); color: var(--white); padding: 0 0.125rem; border-radius: 2px;">$1</mark>');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

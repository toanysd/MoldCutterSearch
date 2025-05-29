// Detail page functionality - Optimized layout with full features
let currentItem = null;
let currentItemType = null;
let allData = {};
let userFeedbacks = [];

const GITHUB_BASE_URL = "https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/";

// Initialize detail page
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const itemId = urlParams.get('id');
    const itemType = urlParams.get('type');
    
    if (itemId && itemType) {
        currentItemType = itemType;
        loadDetailData(itemId, itemType);
    } else {
        showError('無効なパラメータです - Tham số không hợp lệ');
    }
    
    initializeEventListeners();
});

// Initialize event listeners
function initializeEventListeners() {
    const locationForm = document.getElementById('locationForm');
    if (locationForm) {
        locationForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleLocationUpdate();
        });
    }

    const shipmentForm = document.getElementById('shipmentForm');
    if (shipmentForm) {
        shipmentForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleShipmentUpdate();
        });
    }

    const feedbackForm = document.getElementById('feedbackForm');
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleFeedbackSubmit();
        });
    }

    try {
        userFeedbacks = JSON.parse(localStorage.getItem('userFeedbacks') || '[]');
    } catch (e) {
        userFeedbacks = [];
    }
}

// Thêm function displayProductInfo
function displayProductInfo() {
    const productSection = document.getElementById('productSection');
    const productInfo = document.getElementById('productInfo');
    
    if (currentItemType === 'mold' && currentItem.designInfo && Object.keys(currentItem.designInfo).length > 0) {
        const design = currentItem.designInfo;
        
        let html = `
            <div class="product-group">
                <h4>材料情報 - Thông tin vật liệu</h4>
                <div class="info-grid-compact">
                    <div class="info-item-compact">
                        <span class="info-label-compact">プラスチック - Vật liệu nhựa</span>
                        <span class="info-value-compact">${design.DesignForPlasticType || currentItem.DefaultPlasticType || 'N/A'}</span>
                    </div>
                    <div class="info-item-compact">
                        <span class="info-label-compact">厚み - Độ dày</span>
                        <span class="info-value-compact">${design.PlasticThickness || ''} ${design.PlasticThickness ? 'mm' : 'N/A'}</span>
                    </div>
                    <div class="info-item-compact">
                        <span class="info-label-compact">色 - Màu sắc</span>
                        <span class="info-value-compact">${design.PlasticColor || 'N/A'}</span>
                    </div>
                    <div class="info-item-compact">
                        <span class="info-label-compact">グレード - Cấp độ</span>
                        <span class="info-value-compact">${design.PlasticGrade || 'N/A'}</span>
                    </div>
                </div>
            </div>
            
            <div class="product-group">
                <h4>製品仕様 - Thông số sản phẩm</h4>
                <div class="info-grid-compact">
                    <div class="info-item-compact">
                        <span class="info-label-compact">製品サイズ - Kích thước sản phẩm</span>
                        <span class="info-value-compact">${createProductDimensionString(design)}</span>
                    </div>
                    <div class="info-item-compact">
                        <span class="info-label-compact">カットライン - Cut line</span>
                        <span class="info-value-compact">${design.CutLine || design.CuttingLine || 'N/A'}</span>
                    </div>
                    <div class="info-item-compact">
                        <span class="info-label-compact">個数 - Số lượng</span>
                        <span class="info-value-compact">${design.PieceCount || 'N/A'}</span>
                    </div>
                    <div class="info-item-compact">
                        <span class="info-label-compact">ピッチ - Pitch</span>
                        <span class="info-value-compact">${design.Pitch || ''} ${design.Pitch ? 'mm' : 'N/A'}</span>
                    </div>
                    ${design.ProductWeight ? `
                    <div class="info-item-compact">
                        <span class="info-label-compact">製品重量 - Trọng lượng SP</span>
                        <span class="info-value-compact">${design.ProductWeight} g</span>
                    </div>
                    ` : ''}
                    ${design.CycleTime ? `
                    <div class="info-item-compact">
                        <span class="info-label-compact">サイクル時間 - Thời gian chu kỳ</span>
                        <span class="info-value-compact">${design.CycleTime} sec</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        productInfo.innerHTML = html;
        productSection.style.display = 'block';
    } else if (currentItemType === 'cutter') {
        // Thông tin cho cutter
        let html = `
            <div class="product-group">
                <h4>材料情報 - Thông tin vật liệu</h4>
                <div class="info-grid-compact">
                    <div class="info-item-compact">
                        <span class="info-label-compact">プラスチック - Vật liệu nhựa</span>
                        <span class="info-value-compact">${currentItem.PlasticCutType || 'N/A'}</span>
                    </div>
                    <div class="info-item-compact">
                        <span class="info-label-compact">厚み - Độ dày</span>
                        <span class="info-value-compact">${currentItem.CutterThickness || ''} ${currentItem.CutterThickness ? 'mm' : 'N/A'}</span>
                    </div>
                </div>
            </div>
            
            <div class="product-group">
                <h4>カット仕様 - Thông số cắt</h4>
                <div class="info-grid-compact">
                    <div class="info-item-compact">
                        <span class="info-label-compact">カットライン - Cut line</span>
                        <span class="info-value-compact">${currentItem.CutLine || currentItem.CuttingPattern || 'N/A'}</span>
                    </div>
                    <div class="info-item-compact">
                        <span class="info-label-compact">カットタイプ - Loại cắt</span>
                        <span class="info-value-compact">${currentItem.CutType || 'N/A'}</span>
                    </div>
                </div>
            </div>
        `;
        
        productInfo.innerHTML = html;
        productSection.style.display = 'block';
    }
}

// Thêm function tạo product dimension string
function createProductDimensionString(design) {
    if (design.ProductLength && design.ProductWidth && design.ProductHeight) {
        return `${design.ProductLength}x${design.ProductWidth}x${design.ProductHeight}`;
    }
    if (design.ProductLength && design.ProductWidth) {
        return `${design.ProductLength}x${design.ProductWidth}`;
    }
    if (design.ProductDimensions) {
        return design.ProductDimensions;
    }
    return 'N/A';
}

// Cập nhật displayDetailData để include product info
function displayDetailData() {
    updateHeader();
    displayBasicInfo();
    displayTechnicalInfo();
    displayStatusInfo();
    
    if (currentItemType === 'mold' && currentItem.designInfo && Object.keys(currentItem.designInfo).length > 0) {
        displayDesignInfo();
    }
    
    // Thêm product info display
    displayProductInfo();
    
    displayLocationInfo();
    displayLocationHistoryCompact();
    displayLocationHistoryFull();
    displayShipmentHistoryFull();
    displayRelatedItems();
    displayUserFeedbacks();
    
    // Load dropdown data for modals
    loadDropdownData();
    
    document.getElementById('detailContent').style.display = 'block';
}

// Thêm back button functionality
function goBack() {
    if (document.referrer && document.referrer.includes(window.location.origin)) {
        history.back();
    } else {
        window.location.href = 'index.html';
    }
}

// Load detail data
async function loadDetailData(itemId, itemType) {
    try {
        showLoading(true);
        await loadAllDetailData();
        
        if (itemType === 'mold') {
            currentItem = allData.molds.find(m => m.MoldID === itemId);
        } else if (itemType === 'cutter') {
            currentItem = allData.cutters.find(c => c.CutterID === itemId);
        }
        
        if (!currentItem) {
            throw new Error('アイテムが見つかりません - Không tìm thấy mục');
        }
        
        processItemData();
        displayDetailData();
        showLoading(false);
        
    } catch (error) {
        console.error('Detail data loading error:', error);
        showError(error.message);
        showLoading(false);
    }
}

// Load all data needed for detail view
async function loadAllDetailData() {
    const dataFiles = [
        { key: 'molds', file: 'molds.csv' },
        { key: 'cutters', file: 'cutters.csv' },
        { key: 'customers', file: 'customers.csv' },
        { key: 'molddesign', file: 'molddesign.csv' },
        { key: 'moldcutter', file: 'molcutter.csv' },
        { key: 'shiplog', file: 'shiplog.csv' },
        { key: 'locationlog', file: 'locationlog.csv' },
        { key: 'employees', file: 'employees.csv' },
        { key: 'racklayers', file: 'racklayers.csv' },
        { key: 'racks', file: 'racks.csv' }
    ];

    const promises = dataFiles.map(async ({ key, file }) => {
        try {
            console.log(`Loading ${file} from GitHub...`);
            const response = await fetch(`${GITHUB_BASE_URL}${file}`);
            if (!response.ok) {
                console.warn(`File ${file} not found (HTTP ${response.status})`);
                return { key, data: [] };
            }
            const csvText = await response.text();
            const data = parseCSV(csvText);
            console.log(`${file} loaded: ${data.length} records`);
            return { key, data };
        } catch (error) {
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
}

// Process item data với relationships đầy đủ
function processItemData() {
    if (currentItemType === 'mold') {
        // Design information từ MoldDesignID
        const design = allData.molddesign.find(d => d.MoldDesignID === currentItem.MoldDesignID);
        currentItem.designInfo = design || {};
        
        // Customer information
        const customer = allData.customers.find(c => c.CustomerID === currentItem.CustomerID);
        currentItem.customerInfo = customer || {};
        
        // Rack layer information từ RackLayerID
        const rackLayer = allData.racklayers.find(r => r.RackLayerID === currentItem.RackLayerID);
        currentItem.rackLayerInfo = rackLayer || {};
        
        // Rack information
        if (rackLayer && rackLayer.RackID) {
            const rack = allData.racks.find(r => r.RackID === rackLayer.RackID);
            currentItem.rackInfo = rack || {};
        }
        
        // Related cutters từ moldcutter table
        currentItem.relatedCutters = getRelatedCutters(currentItem.MoldID);
        
        // Shipping history với customer links
        currentItem.shipHistory = getShipHistoryWithCustomers('MOLD', currentItem.MoldID);
        
        // Location history
        currentItem.locationHistory = getLocationHistory('MOLD', currentItem.MoldID);
        
        // Current status
        currentItem.currentStatus = getCurrentMoldStatus(currentItem);
        
        // User feedbacks
        currentItem.userFeedbacks = getUserFeedbacks(currentItem.MoldID, 'mold');
        
    } else if (currentItemType === 'cutter') {
        // Customer information
        const customer = allData.customers.find(c => c.CustomerID === currentItem.CustomerID);
        currentItem.customerInfo = customer || {};
        
        // Rack layer information từ RackLayerID
        const rackLayer = allData.racklayers.find(r => r.RackLayerID === currentItem.RackLayerID);
        currentItem.rackLayerInfo = rackLayer || {};
        
        // Rack information
        if (rackLayer && rackLayer.RackID) {
            const rack = allData.racks.find(r => r.RackID === rackLayer.RackID);
            currentItem.rackInfo = rack || {};
        }
        
        // Related molds từ moldcutter table
        currentItem.relatedMolds = getRelatedMolds(currentItem.CutterID);
        
        // Shipping history với customer links
        currentItem.shipHistory = getShipHistoryWithCustomers('CUTTER', currentItem.CutterID);
        
        // Location history
        currentItem.locationHistory = getLocationHistory('CUTTER', currentItem.CutterID);
        
        // Current status
        currentItem.currentStatus = getCurrentCutterStatus(currentItem);
        
        // User feedbacks
        currentItem.userFeedbacks = getUserFeedbacks(currentItem.CutterID, 'cutter');
    }
}

// Get shipping history với customer information
function getShipHistoryWithCustomers(itemType, itemID) {
    if (!itemID) return [];
    
    const history = allData.shiplog.filter(log => {
        if (itemType === 'MOLD') return log.MoldID === itemID;
        if (itemType === 'CUTTER') return log.CutterID === itemID;
        return false;
    }).sort((a, b) => new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0));
    
    // Enrich với customer information
    return history.map(log => {
        const fromCustomer = allData.customers.find(c => c.CustomerID === log.FromCompanyID);
        const toCustomer = allData.customers.find(c => c.CustomerID === log.ToCompanyID);
        
        return {
            ...log,
            fromCustomerInfo: fromCustomer || {},
            toCustomerInfo: toCustomer || {},
            fromDisplayName: fromCustomer?.CustomerShortName || fromCustomer?.CustomerName || log.FromCompanyID,
            toDisplayName: toCustomer?.CustomerShortName || toCustomer?.CustomerName || log.ToCompanyID
        };
    });
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

// Get current mold status dựa trên MoldReturning/MoldDisposing
function getCurrentMoldStatus(mold) {
    if (mold.MoldReturning === 'TRUE' || mold.MoldReturning === true || mold.MoldReturning === '1') {
        return {
            status: 'returned',
            text: '返却済み - Đã trả về',
            class: 'status-returned',
            date: mold.MoldReturnedDate
        };
    }
    if (mold.MoldDisposing === 'TRUE' || mold.MoldDisposing === true || mold.MoldDisposing === '1') {
        return {
            status: 'disposed',
            text: '廃棄済み - Đã hủy',
            class: 'status-disposed',
            date: mold.MoldDisposedDate
        };
    }
    
    const history = currentItem.shipHistory || [];
    if (history.length > 0) {
        const latest = history[0];
        if (latest.ToCompanyID && latest.ToCompanyID !== 'YSD') {
            return {
                status: 'shipped',
                text: '出荷済み - Đã gửi đi',
                class: 'status-shipped',
                date: latest.DateEntry
            };
        }
    }
    
    return {
        status: 'available',
        text: '利用可能 - Có sẵn',
        class: 'status-available'
    };
}

// Get current cutter status
function getCurrentCutterStatus(cutter) {
    const history = currentItem.shipHistory || [];
    if (history.length > 0) {
        const latest = history[0];
        if (latest.ToCompanyID && latest.ToCompanyID !== 'YSD') {
            return {
                status: 'shipped',
                text: '出荷済み - Đã gửi đi',
                class: 'status-shipped',
                date: latest.DateEntry
            };
        }
    }
    
    return {
        status: 'available',
        text: '利用可能 - Có sẵn',
        class: 'status-available'
    };
}

// Update header với tên nổi bật
function updateHeader() {
    const itemTypeLabel = document.getElementById('itemTypeLabel');
    const itemName = document.getElementById('itemName');
    
    if (currentItemType === 'mold') {
        itemTypeLabel.textContent = '金型';
        itemName.textContent = currentItem.MoldName || currentItem.MoldCode || 'N/A';
    } else {
        itemTypeLabel.textContent = '抜型';
        itemName.textContent = currentItem.CutterDesignName || currentItem.CutterName || currentItem.CutterNo || 'N/A';
    }
}

// Display basic information - Compact format
function displayBasicInfo() {
    const basicInfo = document.getElementById('basicInfo');
    let html = '';
    
    if (currentItemType === 'mold') {
        html = `
            <div class="info-item-compact">
                <span class="info-label-compact">ID</span>
                <span class="info-value-compact">${currentItem.MoldID || ''}</span>
            </div>
            <div class="info-item-compact">
                <span class="info-label-compact">コード</span>
                <span class="info-value-compact">${currentItem.MoldCode || ''}</span>
            </div>
            <div class="info-item-compact">
                <span class="info-label-compact">顧客</span>
                <span class="info-value-compact">${currentItem.customerInfo?.CustomerShortName || ''}</span>
            </div>
            <div class="info-item-compact">
                <span class="info-label-compact">作成日</span>
                <span class="info-value-compact">${formatDate(currentItem.MoldDate) || ''}</span>
            </div>
        `;
    } else {
        html = `
            <div class="info-item-compact">
                <span class="info-label-compact">ID</span>
                <span class="info-value-compact">${currentItem.CutterID || ''}</span>
            </div>
            <div class="info-item-compact">
                <span class="info-label-compact">番号</span>
                <span class="info-value-compact">${currentItem.CutterNo || ''}</span>
            </div>
            <div class="info-item-compact">
                <span class="info-label-compact">顧客</span>
                <span class="info-value-compact">${currentItem.customerInfo?.CustomerShortName || ''}</span>
            </div>
            <div class="info-item-compact">
                <span class="info-label-compact">登録日</span>
                <span class="info-value-compact">${formatDate(currentItem.DateEntry) || ''}</span>
            </div>
        `;
    }
    
    basicInfo.innerHTML = html;
}

// Display technical information - Compact format với kích thước gọn
function displayTechnicalInfo() {
    const technicalInfo = document.getElementById('technicalInfo');
    let html = '';
    
    if (currentItemType === 'mold') {
        const design = currentItem.designInfo || {};
        
        // Kích thước gọn: 460x330x25
        let dimensionDisplay = '';
        if (design.MoldDesignLength && design.MoldDesignWidth && design.MoldDesignHeight) {
            dimensionDisplay = `${design.MoldDesignLength}x${design.MoldDesignWidth}x${design.MoldDesignHeight}`;
        } else if (design.MoldDesignDim) {
            dimensionDisplay = design.MoldDesignDim;
        }
        
        html = `
            <div class="info-item-compact">
                <span class="info-label-compact">サイズ</span>
                <span class="info-value-compact">${dimensionDisplay}</span>
            </div>
            <div class="info-item-compact">
                <span class="info-label-compact">重量</span>
                <span class="info-value-compact">${design.MoldDesignWeight || ''} ${design.MoldDesignWeight ? 'kg' : ''}</span>
            </div>
            <div class="info-item-compact">
                <span class="info-label-compact">プラスチック</span>
                <span class="info-value-compact">${design.DesignForPlasticType || ''}</span>
            </div>
            <div class="info-item-compact">
                <span class="info-label-compact">テフロン</span>
                <span class="info-value-compact">${currentItem.TeflonCoating || 'なし'}</span>
            </div>
        `;
    } else {
        let dimensionDisplay = '';
        if (currentItem.CutterLength && currentItem.CutterWidth && currentItem.CutterHeight) {
            dimensionDisplay = `${currentItem.CutterLength}x${currentItem.CutterWidth}x${currentItem.CutterHeight}`;
        } else if (currentItem.CutterDim) {
            dimensionDisplay = currentItem.CutterDim;
        }
        
        html = `
            <div class="info-item-compact">
                <span class="info-label-compact">サイズ</span>
                <span class="info-value-compact">${dimensionDisplay}</span>
            </div>
            <div class="info-item-compact">
                <span class="info-label-compact">厚み</span>
                <span class="info-value-compact">${currentItem.CutterThickness || ''} ${currentItem.CutterThickness ? 'mm' : ''}</span>
            </div>
            <div class="info-item-compact">
                <span class="info-label-compact">プラスチック</span>
                <span class="info-value-compact">${currentItem.PlasticCutType || ''}</span>
            </div>
        `;
    }
    
    technicalInfo.innerHTML = html;
}

// Display status information
function displayStatusInfo() {
    const statusInfo = document.getElementById('statusInfo');
    const status = currentItem.currentStatus || {};
    
    let html = `
        <div class="info-item-compact">
            <span class="info-label-compact">状態</span>
            <span class="info-value-compact">
                <span class="status-badge ${status.class || ''}">${status.text || '不明'}</span>
            </span>
        </div>
    `;
    
    if (status.date) {
        html += `
            <div class="info-item-compact">
                <span class="info-label-compact">変更日</span>
                <span class="info-value-compact">${formatDate(status.date)}</span>
            </div>
        `;
    }
    
    if (currentItemType === 'mold') {
        html += `
            <div class="info-item-compact">
                <span class="info-label-compact">返却</span>
                <span class="info-value-compact">${currentItem.MoldReturning === 'TRUE' ? '済み' : '未'}</span>
            </div>
            <div class="info-item-compact">
                <span class="info-label-compact">廃棄</span>
                <span class="info-value-compact">${currentItem.MoldDisposing === 'TRUE' ? '済み' : '未'}</span>
            </div>
        `;
    }
    
    statusInfo.innerHTML = html;
}

// Display design information - Chi tiết với thông tin thiết kế đầy đủ
function displayDesignInfo() {
    const designSection = document.getElementById('designSection');
    const designInfo = document.getElementById('designInfo');
    
    if (currentItemType === 'mold' && currentItem.designInfo && Object.keys(currentItem.designInfo).length > 0) {
        const design = currentItem.designInfo;
        
        let html = `
            <div class="design-group">
                <h4>寸法情報 - Thông tin kích thước</h4>
                <div class="info-grid-compact">
                    <div class="info-item-compact">
                        <span class="info-label-compact">長さ - dài</span>
                        <span class="info-value-compact">${design.MoldDesignLength || ''} mm</span>
                    </div>
                    <div class="info-item-compact">
                        <span class="info-label-compact">幅 - rộng</span>
                        <span class="info-value-compact">${design.MoldDesignWidth || ''} mm</span>
                    </div>
                    <div class="info-item-compact">
                        <span class="info-label-compact">高さ - cao</span>
                        <span class="info-value-compact">${design.MoldDesignHeight || ''} mm</span>
                    </div>
                    <div class="info-item-compact">
                        <span class="info-label-compact">深さ - độ sâu</span>
                        <span class="info-value-compact">${design.MoldDesignDepth || ''} mm</span>
                    </div>
                    <div class="info-item-compact">
                        <span class="info-label-compact">重量 - trọng lượng</span>
                        <span class="info-value-compact">${design.MoldDesignWeight || ''} kg</span>
                    </div>
                </div>
            </div>
            
            <div class="design-group">
                <h4>設計詳細 - Chi tiết thiết kế</h4>
                <div class="info-grid-compact">
                    <div class="info-item-compact">
                        <span class="info-label-compact">プラスチック</span>
                        <span class="info-value-compact">${design.DesignForPlasticType || ''}</span>
                    </div>
                    <div class="info-item-compact">
                        <span class="info-label-compact">セットアップ</span>
                        <span class="info-value-compact">${design.MoldSetupType || ''}</span>
                    </div>
                    <div class="info-item-compact">
                        <span class="info-label-compact">個数 - số lượng</span>
                        <span class="info-value-compact">${design.PieceCount || ''}</span>
                    </div>
                    <div class="info-item-compact">
                        <span class="info-label-compact">ピッチ - pitch</span>
                        <span class="info-value-compact">${design.Pitch || ''} mm</span>
                    </div>
                    ${design.UnderDepth ? `
                    <div class="info-item-compact">
                        <span class="info-label-compact">アンダー深さ</span>
                        <span class="info-value-compact">${design.UnderDepth} mm</span>
                    </div>
                    ` : ''}
                    ${design.DraftAngle ? `
                    <div class="info-item-compact">
                        <span class="info-label-compact">抜き勾配</span>
                        <span class="info-value-compact">${design.DraftAngle}°</span>
                    </div>
                    ` : ''}
                    ${design.CornerR ? `
                    <div class="info-item-compact">
                        <span class="info-label-compact">コーナーR</span>
                        <span class="info-value-compact">${design.CornerR} mm</span>
                    </div>
                    ` : ''}
                    ${design.ChamferC ? `
                    <div class="info-item-compact">
                        <span class="info-label-compact">面取りC</span>
                        <span class="info-value-compact">${design.ChamferC} mm</span>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        designInfo.innerHTML = html;
        designSection.style.display = 'block';
    }
}

// Display location details với lịch sử
function displayLocationInfo() {
    const locationDetails = document.getElementById('locationDetails');
    
    let html = `
        <div class="location-current">
            <div class="location-item">
                <div class="location-label">現在位置 - vị trí hiện tại</div>
                <div class="location-value">${currentItem.RackLayerID || 'N/A'}</div>
            </div>
            <div class="location-item">
                <div class="location-label">ラック - giá</div>
                <div class="location-value">${currentItem.rackLayerInfo?.RackSymbol || currentItem.rackInfo?.RackName || 'N/A'}</div>
            </div>
            <div class="location-item">
                <div class="location-label">レイヤー - tầng</div>
                <div class="location-value">${currentItem.rackLayerInfo?.RackLayerNumber || 'N/A'}</div>
            </div>
            <div class="location-item">
                <div class="location-label">場所 - vị trí</div>
                <div class="location-value">${currentItem.rackLayerInfo?.RackLocation || 'N/A'}</div>
            </div>
        </div>
    `;
    
    locationDetails.innerHTML = html;
}

// Display location history - Compact trong sidebar
function displayLocationHistoryCompact() {
    const locationHistoryCompact = document.getElementById('locationHistoryCompact');
    
    if (currentItem.locationHistory && currentItem.locationHistory.length > 0) {
        let html = '';
        
        // Chỉ hiển thị 3 mục gần nhất
        const recentHistory = currentItem.locationHistory.slice(0, 3);
        
        recentHistory.forEach(log => {
            html += `
                <div class="history-item-compact">
                    <span class="history-date">${formatDate(log.DateEntry)}</span>
                    <span class="history-action">${log.OldRackLayerID || 'N/A'} → ${log.NewRackLayerID || 'N/A'}</span>
                </div>
            `;
        });
        
        if (currentItem.locationHistory.length > 3) {
            html += `
                <div class="history-item-compact">
                    <span class="history-action" style="color: var(--primary-blue); font-style: italic;">
                        他 ${currentItem.locationHistory.length - 3} 件...
                    </span>
                </div>
            `;
        }
        
        locationHistoryCompact.innerHTML = html;
    } else {
        locationHistoryCompact.innerHTML = '<div class="history-item-compact"><span class="history-action">履歴なし - không có lịch sử</span></div>';
    }
}

// Display location history - Đầy đủ trong main content
function displayLocationHistoryFull() {
    const locationHistoryFull = document.getElementById('locationHistoryFull');
    
    if (currentItem.locationHistory && currentItem.locationHistory.length > 0) {
        let html = '';
        
        currentItem.locationHistory.forEach(log => {
            const employee = allData.employees.find(e => e.EmployeeID === log.EmployeeID);
            
            html += `
                <div class="timeline-item">
                    <div class="timeline-header">
                        <span class="timeline-title">位置変更 - thay đổi vị trí</span>
                        <span class="timeline-date">${formatDate(log.DateEntry)}</span>
                    </div>
                    <div class="timeline-content">
                        <strong>${log.OldRackLayerID || 'N/A'}</strong> → <strong>${log.NewRackLayerID || 'N/A'}</strong>
                    </div>
                    <div class="timeline-details">
                        変更者 - người thay đổi: <strong>${employee?.EmployeeName || log.EmployeeID}</strong><br>
                        ${log.Notes ? `備考 - ghi chú: ${log.Notes}` : ''}
                    </div>
                </div>
            `;
        });
        
        locationHistoryFull.innerHTML = html;
    } else {
        locationHistoryFull.innerHTML = '<p>位置変更履歴がありません - không có lịch sử thay đổi vị trí</p>';
    }
}

// Display shipment history - Đầy đủ với customer links
function displayShipmentHistoryFull() {
    const shipmentHistoryFull = document.getElementById('shipmentHistoryFull');
    
    if (currentItem.shipHistory && currentItem.shipHistory.length > 0) {
        let html = '';
        
        currentItem.shipHistory.forEach(log => {
            html += `
                <div class="timeline-item">
                    <div class="timeline-header">
                        <span class="timeline-title">出荷記録 - vận chuyển</span>
                        <span class="timeline-date">${formatDate(log.DateEntry)}</span>
                    </div>
                    <div class="timeline-content">
                        <strong>${log.fromDisplayName || 'N/A'}</strong> 
                        → 
                        <strong>${log.toDisplayName || 'N/A'}</strong>
                    </div>
                    <div class="timeline-details">
                        ${log.ContactPerson ? `担当者 - người phụ trách: <strong>${log.ContactPerson}</strong><br>` : ''}
                        ${log.ShipNotes ? `備考 - ghi chú: ${log.ShipNotes}` : ''}
                    </div>
                </div>
            `;
        });
        
        shipmentHistoryFull.innerHTML = html;
    } else {
        shipmentHistoryFull.innerHTML = '<p>出荷履歴がありません - không có lịch sử vận chuyển</p>';
    }
}

// Display related items
function displayRelatedItems() {
    const relatedSection = document.getElementById('relatedSection');
    const relatedTitle = document.getElementById('relatedTitle');
    const relatedItems = document.getElementById('relatedItems');
    
    let items = [];
    let titleText = '';
    
    if (currentItemType === 'mold' && currentItem.relatedCutters?.length > 0) {
        items = currentItem.relatedCutters;
        titleText = '関連カッター - dao cắt liên quan';
    } else if (currentItemType === 'cutter' && currentItem.relatedMolds?.length > 0) {
        items = currentItem.relatedMolds;
        titleText = '関連金型 - khuôn liên quan';
    }
    
    if (items.length > 0) {
        relatedTitle.textContent = titleText;
        
        let html = '';
        items.forEach(item => {
            const code = item.MoldCode || item.CutterNo || '';
            const name = item.MoldName || item.CutterName || item.CutterDesignName || '';
            const id = item.MoldID || item.CutterID || '';
            const type = item.MoldID ? 'mold' : 'cutter';
            
            html += `
                <div class="related-item" onclick="viewRelatedItem('${id}', '${type}')">
                    <div class="related-item-info">
                        <div class="related-item-code">${code}</div>
                        <div class="related-item-name">${name}</div>
                    </div>
                </div>
            `;
        });
        
        relatedItems.innerHTML = html;
        relatedSection.style.display = 'block';
    }
}

// Display user feedbacks
function displayUserFeedbacks() {
    const feedbackSection = document.getElementById('feedbackSection');
    const feedbackList = document.getElementById('feedbackList');
    
    if (currentItem.userFeedbacks && currentItem.userFeedbacks.length > 0) {
        let html = '';
        currentItem.userFeedbacks.forEach(feedback => {
            const employee = allData.employees.find(e => e.EmployeeID === feedback.employeeID);
            html += `
                <div class="feedback-item">
                    <div class="feedback-header">
                        <span class="feedback-author">${employee?.EmployeeName || feedback.employeeID}</span>
                        <span class="feedback-date">${formatDate(feedback.date)}</span>
                    </div>
                    <div class="feedback-content">${feedback.text}</div>
                </div>
            `;
        });
        
        feedbackList.innerHTML = html;
        feedbackSection.style.display = 'block';
    }
}

// Load dropdown data cho modals
async function loadDropdownData() {
    try {
        // Load racks
        const rackSelect = document.getElementById('rackSelect');
        if (rackSelect && allData.racks) {
            rackSelect.innerHTML = '<option value="">選択してください - chọn giá</option>';
            allData.racks.forEach(rack => {
                const option = document.createElement('option');
                option.value = rack.RackID;
                option.textContent = `${rack.RackName || rack.RackID} - ${rack.RackLocation || ''}`;
                rackSelect.appendChild(option);
            });
        }
        
        // Load customers
        const toCompanySelect = document.getElementById('toCompanySelect');
        if (toCompanySelect && allData.customers) {
            toCompanySelect.innerHTML = '<option value="">選択してください - chọn công ty</option>';
            allData.customers.forEach(customer => {
                const option = document.createElement('option');
                option.value = customer.CustomerID;
                option.textContent = customer.CustomerShortName || customer.CustomerName;
                toCompanySelect.appendChild(option);
            });
            
            // Add "Other" option
            const otherOption = document.createElement('option');
            otherOption.value = 'OTHER';
            otherOption.textContent = 'その他 - khác';
            toCompanySelect.appendChild(otherOption);
        }
        
        // Load employees
        const employeeSelects = ['employeeSelect', 'feedbackEmployeeSelect'];
        employeeSelects.forEach(selectId => {
            const select = document.getElementById(selectId);
            if (select && allData.employees) {
                select.innerHTML = '<option value="">選択してください - chọn nhân viên</option>';
                allData.employees.forEach(employee => {
                    const option = document.createElement('option');
                    option.value = employee.EmployeeID;
                    option.textContent = employee.EmployeeName || employee.EmployeeID;
                    select.appendChild(option);
                });
            }
        });
        
    } catch (error) {
        console.error('Error loading dropdown data:', error);
    }
}

// Update layer options based on selected rack
function updateLayerOptions() {
    const rackSelect = document.getElementById('rackSelect');
    const layerSelect = document.getElementById('layerSelect');
    
    if (!rackSelect || !layerSelect || !allData.racklayers) return;
    
    const selectedRackID = rackSelect.value;
    layerSelect.innerHTML = '<option value="">選択してください - chọn tầng</option>';
    
    if (selectedRackID) {
        const layers = allData.racklayers.filter(layer => layer.RackID === selectedRackID);
        layers.forEach(layer => {
            const option = document.createElement('option');
            option.value = layer.RackLayerID;
            option.textContent = `${layer.RackLayerNumber || layer.RackLayerID} - ${layer.RackLayerNotes || ''}`;
            layerSelect.appendChild(option);
        });
    }
}

// Handle company selection trong shipment modal
function handleCompanySelect() {
    const toCompanySelect = document.getElementById('toCompanySelect');
    const customCompanyGroup = document.getElementById('customCompanyGroup');
    
    if (toCompanySelect && customCompanyGroup) {
        if (toCompanySelect.value === 'OTHER') {
            customCompanyGroup.style.display = 'block';
            document.getElementById('customCompanyName').required = true;
        } else {
            customCompanyGroup.style.display = 'none';
            document.getElementById('customCompanyName').required = false;
        }
    }
}

// Main display function
function displayDetailData() {
    updateHeader();
    displayBasicInfo();
    displayTechnicalInfo();
    displayStatusInfo();
    
    if (currentItemType === 'mold' && currentItem.designInfo && Object.keys(currentItem.designInfo).length > 0) {
        displayDesignInfo();
    }
    
    displayLocationInfo();
    displayLocationHistoryCompact();
    displayLocationHistoryFull();
    displayShipmentHistoryFull();
    displayRelatedItems();
    displayUserFeedbacks();
    
    // Load dropdown data for modals
    loadDropdownData();
    
    document.getElementById('detailContent').style.display = 'block';
}

// Modal functions
function showLocationUpdate() {
    const modal = document.getElementById('locationModal');
    if (modal) {
        modal.style.display = 'block';
        loadDropdownData();
    }
}

function showShipmentUpdate() {
    const modal = document.getElementById('shipmentModal');
    if (modal) {
        const shipDate = document.getElementById('shipDate');
        if (shipDate) {
            shipDate.value = new Date().toISOString().split('T')[0];
        }
        modal.style.display = 'block';
        loadDropdownData();
    }
}

function showFeedback() {
    const modal = document.getElementById('feedbackModal');
    if (modal) {
        modal.style.display = 'block';
        loadDropdownData();
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// Form handlers với cập nhật dữ liệu thực tế
function handleLocationUpdate() {
    const rackSelect = document.getElementById('rackSelect');
    const layerSelect = document.getElementById('layerSelect');
    const employeeSelect = document.getElementById('employeeSelect');
    const locationNotes = document.getElementById('locationNotes');
    
    if (!layerSelect?.value || !employeeSelect?.value) {
        alert('必須項目を入力してください - vui lòng nhập đầy đủ thông tin bắt buộc');
        return;
    }
    
    // Save location change to localStorage
    const locationChange = {
        itemID: currentItem.MoldID || currentItem.CutterID,
        itemType: currentItemType,
        oldRackLayerID: currentItem.RackLayerID,
        newRackLayerID: layerSelect.value,
        employeeID: employeeSelect.value,
        notes: locationNotes.value,
        date: new Date().toISOString()
    };
    
    let locationChanges = JSON.parse(localStorage.getItem('locationChanges') || '[]');
    locationChanges.push(locationChange);
    localStorage.setItem('locationChanges', JSON.stringify(locationChanges));
    
    // Update current item
    currentItem.RackLayerID = layerSelect.value;
    
    alert('位置変更を保存しました - đã lưu thay đổi vị trí');
    closeModal('locationModal');
    
    // Refresh display
    processItemData();
    displayLocationInfo();
    displayLocationHistoryCompact();
    displayLocationHistoryFull();
}

function handleShipmentUpdate() {
    const toCompanySelect = document.getElementById('toCompanySelect');
    const customCompanyName = document.getElementById('customCompanyName');
    const contactPerson = document.getElementById('contactPerson');
    const shipDate = document.getElementById('shipDate');
    const shipNotes = document.getElementById('shipNotes');
    
    if (!toCompanySelect?.value || !contactPerson?.value || !shipDate?.value) {
        alert('必須項目を入力してください - vui lòng nhập đầy đủ thông tin bắt buộc');
        return;
    }
    
    if (toCompanySelect.value === 'OTHER' && !customCompanyName?.value) {
        alert('会社名を入力してください - vui lòng nhập tên công ty');
        return;
    }
    
    // Save shipment record to localStorage
    const shipment = {
        itemID: currentItem.MoldID || currentItem.CutterID,
        itemType: currentItemType,
        toCompanyID: toCompanySelect.value === 'OTHER' ? customCompanyName.value : toCompanySelect.value,
        contactPerson: contactPerson.value,
        shipDate: shipDate.value,
        notes: shipNotes.value,
        recordDate: new Date().toISOString()
    };
    
    let shipments = JSON.parse(localStorage.getItem('shipments') || '[]');
    shipments.push(shipment);
    localStorage.setItem('shipments', JSON.stringify(shipments));
    
    alert('出荷記録を保存しました - đã lưu ghi chú vận chuyển');
    closeModal('shipmentModal');
}

function handleFeedbackSubmit() {
    const feedbackText = document.getElementById('feedbackText');
    const feedbackEmployeeSelect = document.getElementById('feedbackEmployeeSelect');
    
    if (!feedbackText?.value || !feedbackEmployeeSelect?.value) {
        alert('必須項目を入力してください - vui lòng nhập đầy đủ thông tin bắt buộc');
        return;
    }
    
    // Save feedback
    const feedback = {
        itemID: currentItem.MoldID || currentItem.CutterID,
        itemType: currentItemType,
        text: feedbackText.value,
        employeeID: feedbackEmployeeSelect.value,
        date: new Date().toISOString()
    };
    
    userFeedbacks.push(feedback);
    localStorage.setItem('userFeedbacks', JSON.stringify(userFeedbacks));
    
    alert('コメントを保存しました - đã lưu ghi chú');
    closeModal('feedbackModal');
    
    // Refresh feedback display
    currentItem.userFeedbacks = getUserFeedbacks(currentItem.MoldID || currentItem.CutterID, currentItemType);
    displayUserFeedbacks();
    
    // Clear form
    feedbackText.value = '';
    feedbackEmployeeSelect.value = '';
}

// Utility functions
function getUserFeedbacks(itemID, itemType) {
    return userFeedbacks.filter(f => f.itemID === itemID && f.itemType === itemType)
                       .sort((a, b) => new Date(b.date) - new Date(a.date));
}

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
    const loading = document.getElementById('loadingDetail');
    if (loading) {
        loading.style.display = show ? 'flex' : 'none';
    }
}

function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    if (errorMessage && errorText) {
        errorText.textContent = message;
        errorMessage.style.display = 'block';
    }
    
    const detailContent = document.getElementById('detailContent');
    if (detailContent) {
        detailContent.style.display = 'none';
    }
}

function goBack() {
    if (document.referrer && document.referrer.includes(window.location.origin)) {
        history.back();
    } else {
        window.location.href = 'index.html';
    }
}

function viewRelatedItem(itemId, itemType) {
    window.location.href = `detail.html?id=${itemId}&type=${itemType}`;
}

// Modal functions - Improved với current info display
function showLocationUpdate() {
    const modal = document.getElementById('locationModal');
    const currentLocationDisplay = document.getElementById('currentLocationDisplay');
    
    if (modal) {
        // Display current location
        if (currentLocationDisplay) {
            currentLocationDisplay.textContent = currentItem.RackLayerID || 'N/A';
        }
        
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Prevent background scroll
        loadDropdownData();
    }
}

function showShipmentUpdate() {
    const modal = document.getElementById('shipmentModal');
    const currentStatusDisplay = document.getElementById('currentStatusDisplay');
    const shipDate = document.getElementById('shipDate');
    
    if (modal) {
        // Display current status
        if (currentStatusDisplay) {
            currentStatusDisplay.textContent = currentItem.currentStatus?.text || 'N/A';
        }
        
        // Set default date to today
        if (shipDate) {
            shipDate.value = new Date().toISOString().split('T')[0];
        }
        
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        loadDropdownData();
    }
}

function showFeedback() {
    const modal = document.getElementById('feedbackModal');
    if (modal) {
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
        loadDropdownData();
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto'; // Restore background scroll
        
        // Reset forms
        const form = modal.querySelector('form');
        if (form) {
            form.reset();
        }
        
        // Hide custom company group
        const customCompanyGroup = document.getElementById('customCompanyGroup');
        if (customCompanyGroup) {
            customCompanyGroup.style.display = 'none';
        }
    }
}

// Handle company selection với smooth animation
function handleCompanySelect() {
    const toCompanySelect = document.getElementById('toCompanySelect');
    const customCompanyGroup = document.getElementById('customCompanyGroup');
    const customCompanyName = document.getElementById('customCompanyName');
    
    if (toCompanySelect && customCompanyGroup) {
        if (toCompanySelect.value === 'OTHER') {
            customCompanyGroup.style.display = 'block';
            customCompanyGroup.classList.remove('hidden');
            customCompanyGroup.classList.add('visible');
            if (customCompanyName) {
                customCompanyName.required = true;
                customCompanyName.focus();
            }
        } else {
            customCompanyGroup.classList.remove('visible');
            customCompanyGroup.classList.add('hidden');
            setTimeout(() => {
                customCompanyGroup.style.display = 'none';
            }, 300);
            if (customCompanyName) {
                customCompanyName.required = false;
                customCompanyName.value = '';
            }
        }
    }
}

// Show loading trong modal
function showModalLoading(modalId, show) {
    const loading = document.getElementById(`${modalId}Loading`);
    if (loading) {
        loading.style.display = show ? 'flex' : 'none';
    }
}

// Enhanced form handlers với loading state
function handleLocationUpdate() {
    const rackSelect = document.getElementById('rackSelect');
    const layerSelect = document.getElementById('layerSelect');
    const employeeSelect = document.getElementById('employeeSelect');
    const locationNotes = document.getElementById('locationNotes');
    
    if (!layerSelect?.value || !employeeSelect?.value) {
        alert('必須項目を入力してください - Vui lòng nhập đầy đủ thông tin bắt buộc');
        return;
    }
    
    showModalLoading('locationModal', true);
    
    // Simulate API call delay
    setTimeout(() => {
        // Save location change
        const locationChange = {
            itemID: currentItem.MoldID || currentItem.CutterID,
            itemType: currentItemType,
            oldRackLayerID: currentItem.RackLayerID,
            newRackLayerID: layerSelect.value,
            employeeID: employeeSelect.value,
            notes: locationNotes.value,
            date: new Date().toISOString()
        };
        
        let locationChanges = JSON.parse(localStorage.getItem('locationChanges') || '[]');
        locationChanges.push(locationChange);
        localStorage.setItem('locationChanges', JSON.stringify(locationChanges));
        
        // Update current item
        currentItem.RackLayerID = layerSelect.value;
        
        showModalLoading('locationModal', false);
        alert('位置変更を保存しました - Đã lưu thay đổi vị trí');
        closeModal('locationModal');
        
        // Refresh display
        processItemData();
        displayLocationInfo();
        displayLocationHistoryCompact();
        displayLocationHistoryFull();
    }, 1000);
}

function handleShipmentUpdate() {
    const toCompanySelect = document.getElementById('toCompanySelect');
    const customCompanyName = document.getElementById('customCompanyName');
    const contactPerson = document.getElementById('contactPerson');
    const shipDate = document.getElementById('shipDate');
    const shipNotes = document.getElementById('shipNotes');
    
    if (!toCompanySelect?.value || !contactPerson?.value || !shipDate?.value) {
        alert('必須項目を入力してください - Vui lòng nhập đầy đủ thông tin bắt buộc');
        return;
    }
    
    if (toCompanySelect.value === 'OTHER' && !customCompanyName?.value) {
        alert('会社名を入力してください - Vui lòng nhập tên công ty');
        return;
    }
    
    showModalLoading('shipmentModal', true);
    
    // Simulate API call delay
    setTimeout(() => {
        // Save shipment record
        const shipment = {
            itemID: currentItem.MoldID || currentItem.CutterID,
            itemType: currentItemType,
            toCompanyID: toCompanySelect.value === 'OTHER' ? customCompanyName.value : toCompanySelect.value,
            contactPerson: contactPerson.value,
            shipDate: shipDate.value,
            notes: shipNotes.value,
            recordDate: new Date().toISOString()
        };
        
        let shipments = JSON.parse(localStorage.getItem('shipments') || '[]');
        shipments.push(shipment);
        localStorage.setItem('shipments', JSON.stringify(shipments));
        
        showModalLoading('shipmentModal', false);
        alert('出荷記録を保存しました - Đã lưu ghi chú vận chuyển');
        closeModal('shipmentModal');
    }, 1000);
}

// Close modal khi click outside
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            const modalId = modal.id;
            closeModal(modalId);
        }
    });
}

// ESC key để đóng modal
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const openModal = document.querySelector('.modal[style*="block"]');
        if (openModal) {
            closeModal(openModal.id);
        }
    }
});

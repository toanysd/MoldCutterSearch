// Detail page functionality - Fixed version without conflicts
let detailCurrentItem = null;
let detailCurrentItemType = null;
let detailAllData = {}; // Đổi tên để tránh conflict với script.js
let detailUserComments = [];

const DETAIL_GITHUB_BASE_URL = "https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/";

// Initialize detail page
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const itemId = urlParams.get('id');
    const itemType = urlParams.get('type');
    
    if (itemId && itemType) {
        detailCurrentItemType = itemType;
        loadDetailData(itemId, itemType);
    } else {
        showDetailError('無効なパラメータです - Tham số không hợp lệ');
    }
    
    initializeDetailEventListeners();
    loadDetailUserComments();
});

// Initialize event listeners
function initializeDetailEventListeners() {
    // Location form
    const locationForm = document.getElementById('locationForm');
    if (locationForm) {
        locationForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleLocationUpdate();
        });
    }
    
    // Shipment form
    const shipmentForm = document.getElementById('shipmentForm');
    if (shipmentForm) {
        shipmentForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleShipmentUpdate();
        });
    }
    
    // Comment form
    const commentForm = document.getElementById('commentForm');
    if (commentForm) {
        commentForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleCommentSubmit();
        });
    }
}

// Load all data for detail page
async function loadDetailData(itemId, itemType) {
    showDetailLoading(true);
    
    try {
        // Load all required data files - Fixed file names
        const dataFiles = [
            'molds.csv', 'cutters.csv', 'customers.csv', 'molddesign.csv',
            'moldcutter.csv', 'shiplog.csv', 'locationlog.csv', 'employees.csv',
            'racklayers.csv', 'racks.csv', 'companies.csv', 'jobs.csv', 'processingitems.csv'
        ];
        
        const promises = dataFiles.map(async (file) => {
            try {
                console.log(`Detail loading ${file}...`);
                const response = await fetch(`${DETAIL_GITHUB_BASE_URL}${file}`);
                if (response.ok) {
                    const csvText = await response.text();
                    console.log(`Detail ${file} loaded: ${parseDetailCSV(csvText).length} records`);
                    return { file, data: parseDetailCSV(csvText) };
                }
                console.warn(`Detail optional file ${file} not found`);
                return { file, data: [] };
            } catch (error) {
                console.warn(`Detail error loading ${file}:`, error);
                return { file, data: [] };
            }
        });
        
        const results = await Promise.all(promises);
        
        // Organize data
        results.forEach(({ file, data }) => {
            const key = file.replace('.csv', '');
            detailAllData[key] = data;
        });
        
        console.log('Detail data loaded:', Object.keys(detailAllData));
        
        // Process relationships
        processDetailDataRelationships();
        
        // Find current item
        if (itemType === 'mold') {
            detailCurrentItem = detailAllData.molds.find(item => item.MoldID === itemId);
        } else {
            detailCurrentItem = detailAllData.cutters.find(item => item.CutterID === itemId);
        }
        
        console.log('Current item found:', detailCurrentItem);
        
        if (detailCurrentItem) {
            displayDetailData();
            populateFormData();
        } else {
            showDetailError('アイテムが見つかりません - Không tìm thấy mục');
        }
        
    } catch (error) {
        console.error('Error loading detail data:', error);
        showDetailError(`データ読み込みエラー: ${error.message}`);
    } finally {
        showDetailLoading(false);
    }
}

// Process data relationships
function processDetailDataRelationships() {
    // Create lookup maps
    const moldDesignMap = new Map();
    detailAllData.molddesign.forEach(design => {
        moldDesignMap.set(design.MoldDesignID, design);
    });
    
    const customerMap = new Map();
    detailAllData.customers.forEach(customer => {
        customerMap.set(customer.CustomerID, customer);
    });
    
    const companyMap = new Map();
    detailAllData.companies.forEach(company => {
        companyMap.set(company.CompanyID, company);
    });
    
    const rackMap = new Map();
    detailAllData.racks.forEach(rack => {
        rackMap.set(rack.RackID, rack);
    });
    
    const rackLayerMap = new Map();
    detailAllData.racklayers.forEach(layer => {
        rackLayerMap.set(layer.RackLayerID, layer);
    });
    
    const jobMap = new Map();
    if (detailAllData.jobs) {
        detailAllData.jobs.forEach(job => {
            jobMap.set(job.MoldDesignID, job);
        });
    }
    
    const processingItemMap = new Map();
    if (detailAllData.processingitems) {
        detailAllData.processingitems.forEach(item => {
            processingItemMap.set(item.ProcessingItemID, item);
        });
    }
    
    // Process molds
    detailAllData.molds = detailAllData.molds.map(mold => {
        const design = moldDesignMap.get(mold.MoldDesignID) || {};
        const customer = customerMap.get(mold.CustomerID) || {};
        const company = companyMap.get(customer.CompanyID) || {};
        const rackLayer = rackLayerMap.get(mold.RackLayerID) || {};
        const rack = rackLayer.RackID ? rackMap.get(rackLayer.RackID) || {} : {};
        const job = jobMap.get(mold.MoldDesignID) || {};
        const processingItem = processingItemMap.get(job.ProcessingItemID) || {};
        
        return {
            ...mold,
            designInfo: design,
            customerInfo: customer,
            companyInfo: company,
            rackLayerInfo: rackLayer,
            rackInfo: rack,
            jobInfo: job,
            processingItemInfo: processingItem,
            relatedCutters: getDetailRelatedCutters(mold.MoldID),
            shipHistory: getDetailShipHistory('MOLD', mold.MoldID),
            locationHistory: getDetailLocationHistory('MOLD', mold.MoldID),
            currentStatus: getDetailCurrentStatus(mold),
            displayLocation: mold.RackLayerID || '',
            displayRackLayerNotes: rackLayer.RackLayerNotes || '',
            displayCustomer: getDetailCustomerDisplayName(customer, company),
            itemType: 'mold'
        };
    });
    
    // Process cutters
    detailAllData.cutters = detailAllData.cutters.map(cutter => {
        const customer = customerMap.get(cutter.CustomerID) || {};
        const company = companyMap.get(customer.CompanyID) || {};
        const rackLayer = rackLayerMap.get(cutter.RackLayerID) || {};
        const rack = rackLayer.RackID ? rackMap.get(rackLayer.RackID) || {} : {};
        
        return {
            ...cutter,
            customerInfo: customer,
            companyInfo: company,
            rackLayerInfo: rackLayer,
            rackInfo: rack,
            relatedMolds: getDetailRelatedMolds(cutter.CutterID),
            shipHistory: getDetailShipHistory('CUTTER', cutter.CutterID),
            locationHistory: getDetailLocationHistory('CUTTER', cutter.CutterID),
            currentStatus: getDetailCurrentStatus(cutter),
            displayLocation: cutter.RackLayerID || '',
            displayRackLayerNotes: rackLayer.RackLayerNotes || '',
            displayCustomer: getDetailCustomerDisplayName(customer, company),
            itemType: 'cutter'
        };
    });
}

// Display detail data
function displayDetailData() {
    console.log('Displaying detail data for:', detailCurrentItem);
    
    // Update page title
    const pageTitle = document.getElementById('pageTitle');
    if (pageTitle) {
        const itemName = detailCurrentItem.MoldName || detailCurrentItem.CutterName || detailCurrentItem.CutterDesignName || '';
        const itemCode = detailCurrentItem.MoldCode || detailCurrentItem.CutterNo || '';
        pageTitle.textContent = `${itemCode} - ${itemName}`;
    }
    
    displayBasicInfo();
    displayStatusInfo();
    displayProductInfo();
    displayLocationHistory();
    displayShipmentHistory();
    displayRelatedItems();
    displayUserComments();
}

// Display basic information
function displayBasicInfo() {
    const basicInfo = document.getElementById('basicInfo');
    if (!basicInfo) return;
    
    const itemId = detailCurrentItem.MoldID || detailCurrentItem.CutterID;
    const itemCode = detailCurrentItem.MoldCode || detailCurrentItem.CutterNo || '';
    
    // Get status information
    const status = getDetailCurrentStatus(detailCurrentItem);
    let statusDisplay = status.text;
    
    // Enhanced status for disposed items
    if (status.status === 'disposed' && detailCurrentItem.processingItemInfo?.ProcessingItemName) {
        statusDisplay += ` (${detailCurrentItem.processingItemInfo.ProcessingItemName})`;
    }
    
    // Get dimensions
    let dimensions = '';
    if (detailCurrentItemType === 'mold' && detailCurrentItem.designInfo) {
        const design = detailCurrentItem.designInfo;
        if (design.MoldDesignLength && design.MoldDesignWidth && design.MoldDesignHeight) {
            dimensions = `${design.MoldDesignLength}×${design.MoldDesignWidth}×${design.MoldDesignHeight}`;
        } else if (design.MoldDesignDim) {
            dimensions = design.MoldDesignDim;
        }
    } else if (detailCurrentItemType === 'cutter') {
        if (detailCurrentItem.CutterLength && detailCurrentItem.CutterWidth && detailCurrentItem.CutterHeight) {
            dimensions = `${detailCurrentItem.CutterLength}×${detailCurrentItem.CutterWidth}×${detailCurrentItem.CutterHeight}`;
        } else if (detailCurrentItem.CutterDim) {
            dimensions = detailCurrentItem.CutterDim;
        }
    }
    
    // Get product dimensions (CutlineX × CutlineY)
    let productDimensions = '';
    if (detailCurrentItem.designInfo?.CutlineX && detailCurrentItem.designInfo?.CutlineY) {
        productDimensions = `${detailCurrentItem.designInfo.CutlineX}×${detailCurrentItem.designInfo.CutlineY}`;
    }
    
    // Get piece count
    const pieceCount = detailCurrentItem.designInfo?.PieceCount || '';
    
    // Get storage location
    const storageLocation = `${detailCurrentItem.displayLocation}${detailCurrentItem.displayRackLayerNotes ? ' - ' + detailCurrentItem.displayRackLayerNotes : ''}`;
    
    let html = `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">ID</div>
                <div class="info-value muted">${itemId}</div>
            </div>
            <div class="info-item">
                <div class="info-label">型番 - Mã khuôn</div>
                <div class="info-value highlight">${itemCode}</div>
            </div>
            <div class="info-item">
                <div class="info-label">使用状況 - Tình trạng</div>
                <div class="info-value ${status.class}">${statusDisplay}</div>
            </div>
            <div class="info-item">
                <div class="info-label">品名 - Tên sản phẩm</div>
                <div class="info-value">${detailCurrentItem.designInfo?.TrayInfoForMoldDesign || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">材料 - Vật liệu</div>
                <div class="info-value">${detailCurrentItem.designInfo?.DesignForPlasticType || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">金型寸法 - Kích thước khuôn</div>
                <div class="info-value">${dimensions || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">取数 - Số lượng</div>
                <div class="info-value">${pieceCount || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">製品寸法 - Kích thước sản phẩm</div>
                <div class="info-value">${productDimensions || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">保管場所 - Vị trí lưu trữ</div>
                <div class="info-value">${storageLocation || '-'}</div>
            </div>
        </div>
    `;
    
    basicInfo.innerHTML = html;
}

// Display status information
function displayStatusInfo() {
    const statusInfo = document.getElementById('statusInfo');
    if (!statusInfo) return;
    
    // Get manufacturing date from jobs
    let manufacturingDate = '';
    if (detailCurrentItem.jobInfo?.DeliveryDeadline) {
        manufacturingDate = `${formatDetailDate(detailCurrentItem.jobInfo.DeliveryDeadline)} (出荷納期より)`;
    }
    
    // Get Teflon coating info
    const teflonCoating = detailCurrentItem.jobInfo?.TeflonCoating || '-';
    const teflonShippingDate = detailCurrentItem.jobInfo?.TeflonShippingDate ? formatDetailDate(detailCurrentItem.jobInfo.TeflonShippingDate) : '-';
    const teflonReceipt = detailCurrentItem.jobInfo?.TeflonRecept ? formatDetailDate(detailCurrentItem.jobInfo.TeflonRecept) : '-';
    
    // Get return info
    const moldReturning = detailCurrentItem.MoldReturning === 'TRUE' ? '返却済み' : '-';
    const returnDate = detailCurrentItem.MoldReturnDate ? formatDetailDate(detailCurrentItem.MoldReturnDate) : '-';
    
    // Get disposal info
    const moldDisposing = detailCurrentItem.MoldDisposing === 'TRUE' ? '廃棄済み' : '-';
    const disposalDate = detailCurrentItem.MoldDisposalDate ? formatDetailDate(detailCurrentItem.MoldDisposalDate) : '-';
    
    let html = `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">製造日 - Ngày chế tạo</div>
                <div class="info-value">${manufacturingDate || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">メッキ - Mạ khuôn</div>
                <div class="info-value">${teflonCoating}</div>
            </div>
            <div class="info-item">
                <div class="info-label">メッキ送り日 - Ngày gửi mạ</div>
                <div class="info-value">${teflonShippingDate}</div>
            </div>
            <div class="info-item">
                <div class="info-label">メッキ受け日 - Ngày nhận mạ</div>
                <div class="info-value">${teflonReceipt}</div>
            </div>
            <div class="info-item">
                <div class="info-label">返却 - Trả lại</div>
                <div class="info-value">${moldReturning}</div>
            </div>
            <div class="info-item">
                <div class="info-label">返却日 - Ngày trả</div>
                <div class="info-value">${returnDate}</div>
            </div>
            <div class="info-item">
                <div class="info-label">廃棄 - Hủy khuôn</div>
                <div class="info-value">${moldDisposing}</div>
            </div>
            <div class="info-item">
                <div class="info-label">廃棄日 - Ngày hủy</div>
                <div class="info-value">${disposalDate}</div>
            </div>
        </div>
    `;
    
    statusInfo.innerHTML = html;
}

// Display product information
function displayProductInfo() {
    const productInfo = document.getElementById('productInfo');
    if (!productInfo || detailCurrentItemType !== 'mold' || !detailCurrentItem.designInfo) return;
    
    const design = detailCurrentItem.designInfo;
    const job = detailCurrentItem.jobInfo || {};
    
    let html = `
        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">品名 - Tên sản phẩm</div>
                <div class="info-value">${design.TrayInfoForMoldDesign || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">材料 - Vật liệu</div>
                <div class="info-value">${design.DesignForPlasticType || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">製品寸法 - Kích thước sản phẩm</div>
                <div class="info-value">${design.CutlineX && design.CutlineY ? `${design.CutlineX}×${design.CutlineY}` : '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">彫刻内容 - Nội dung khắc</div>
                <div class="info-value">${design.TextContent || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">重量 - Khối lượng khay</div>
                <div class="info-value">${job.TrayWeight || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">別抜き使用 - Sử dụng dao riêng</div>
                <div class="info-value">${job.SeparateCutter || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">見積添付 - Báo giá đính kèm</div>
                <div class="info-value">${job.PriceQuote || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">原価 - Giá thành</div>
                <div class="info-value">${job.UnitPrice || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">箱の種類 - Loại thùng</div>
                <div class="info-value">${job.LoaiThungDong || '-'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">袋詰め - Đóng túi nilon</div>
                <div class="info-value">${job.BaoNilon || '-'}</div>
            </div>
        </div>
    `;
    
    productInfo.innerHTML = html;
}

// Display location history
function displayLocationHistory() {
    const locationHistory = document.getElementById('locationHistory');
    if (!locationHistory) return;
    
    const itemId = detailCurrentItem.MoldID || detailCurrentItem.CutterID;
    const locationLogs = detailAllData.locationlog.filter(log => {
        if (detailCurrentItemType === 'mold') return log.MoldID === itemId;
        return log.CutterID === itemId;
    }).sort((a, b) => new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0));
    
    if (locationLogs.length > 0) {
        let html = '<div class="history-list">';
        locationLogs.forEach(log => {
            const oldRackLayer = detailAllData.racklayers.find(r => r.RackLayerID === log.OldRackLayer) || {};
            const newRackLayer = detailAllData.racklayers.find(r => r.RackLayerID === log.NewRackLayer) || {};
            
            html += `
                <div class="history-item location">
                    <div class="history-header">
                        <div class="history-title">位置変更 - Thay đổi vị trí</div>
                        <div class="history-date">${formatDetailDate(log.DateEntry)}</div>
                    </div>
                    <div class="history-details">
                        <strong>から - Từ:</strong> ${log.OldRackLayer}${oldRackLayer.RackLayerNotes ? ' - ' + oldRackLayer.RackLayerNotes : ''}<br>
                        <strong>へ - Đến:</strong> ${log.NewRackLayer}${newRackLayer.RackLayerNotes ? ' - ' + newRackLayer.RackLayerNotes : ''}<br>
                        ${log.notes ? `<strong>備考 - Ghi chú:</strong> ${log.notes}` : ''}
                    </div>
                </div>
            `;
        });
        html += '</div>';
        locationHistory.innerHTML = html;
    } else {
        locationHistory.innerHTML = '<p class="no-data">位置変更履歴がありません - Không có lịch sử thay đổi vị trí</p>';
    }
}

// Display shipment history
function displayShipmentHistory() {
    const shipmentHistory = document.getElementById('shipmentHistory');
    if (!shipmentHistory) return;
    
    if (detailCurrentItem.shipHistory && detailCurrentItem.shipHistory.length > 0) {
        let html = '<div class="history-list">';
        detailCurrentItem.shipHistory.forEach(log => {
            const toCompany = detailAllData.companies.find(c => c.CompanyID === log.ToCompanyID) || {};
            const fromCompany = detailAllData.companies.find(c => c.CompanyID === log.FromCompanyID) || {};
            
            html += `
                <div class="history-item shipment">
                    <div class="history-header">
                        <div class="history-title">出荷記録 - Vận chuyển</div>
                        <div class="history-date">${formatDetailDate(log.DateEntry)}</div>
                    </div>
                    <div class="history-details">
                        <strong>送り先 - Đến:</strong> ${toCompany.CompanyShortName || toCompany.CompanyName || log.ToCompanyID}<br>
                        <strong>送り元 - Từ:</strong> ${fromCompany.CompanyShortName || fromCompany.CompanyName || log.FromCompanyID}<br>
                        ${log.ContactPerson ? `<strong>担当者 - Người phụ trách:</strong> ${log.ContactPerson}<br>` : ''}
                        ${log.ShipmentNotes ? `<strong>備考 - Ghi chú:</strong> ${log.ShipmentNotes}` : ''}
                    </div>
                </div>
            `;
        });
        html += '</div>';
        shipmentHistory.innerHTML = html;
    } else {
        shipmentHistory.innerHTML = '<p class="no-data">出荷履歴がありません - Không có lịch sử vận chuyển</p>';
    }
}

// Display related items
function displayRelatedItems() {
    const relatedSection = document.getElementById('relatedSection');
    const relatedTitle = document.getElementById('relatedTitle');
    const relatedItems = document.getElementById('relatedItems');
    
    if (!relatedSection || !relatedTitle || !relatedItems) return;
    
    let items = [];
    let titleText = '';
    
    if (detailCurrentItemType === 'mold' && detailCurrentItem.relatedCutters?.length > 0) {
        items = detailCurrentItem.relatedCutters;
        titleText = '関連カッター - Dao cắt liên quan';
    } else if (detailCurrentItemType === 'cutter' && detailCurrentItem.relatedMolds?.length > 0) {
        items = detailCurrentItem.relatedMolds;
        titleText = '関連金型 - Khuôn liên quan';
    }
    
    if (items.length > 0) {
        relatedTitle.textContent = titleText;
        
        let html = '<div class="related-grid">';
        items.forEach(item => {
            const code = item.MoldCode || item.CutterNo || '';
            const name = item.MoldName || item.CutterName || item.CutterDesignName || '';
            const id = item.MoldID || item.CutterID || '';
            const type = item.MoldID ? 'mold' : 'cutter';
            
            html += `
                <div class="related-item" onclick="window.location.href='detail.html?id=${id}&type=${type}'">
                    <div class="related-item-id">${id}</div>
                    <div class="related-item-name">${code}</div>
                    <div class="related-item-desc">${name}</div>
                </div>
            `;
        });
        html += '</div>';
        
        relatedItems.innerHTML = html;
        relatedSection.style.display = 'block';
    } else {
        relatedSection.style.display = 'none';
    }
}

// Display user comments
function displayUserComments() {
    const userCommentsElement = document.getElementById('userComments');
    if (!userCommentsElement) return;
    
    const itemId = detailCurrentItem.MoldID || detailCurrentItem.CutterID;
    const comments = getDetailUserComments(itemId);
    
    if (comments.length > 0) {
        let html = '<div class="history-list">';
        comments.forEach(comment => {
            const employee = detailAllData.employees.find(e => e.EmployeeID === comment.employeeId) || {};
            
            html += `
                <div class="history-item comment">
                    <div class="history-header">
                        <div class="history-title">${employee.EmployeeName || 'Unknown'}</div>
                        <div class="history-date">${formatDetailDate(comment.timestamp)}</div>
                    </div>
                    <div class="history-details">${comment.text}</div>
                </div>
            `;
        });
        html += '</div>';
        userCommentsElement.innerHTML = html;
    } else {
        userCommentsElement.innerHTML = '<p class="no-data">コメントがありません - Không có ghi chú</p>';
    }
}

// Populate form data
function populateFormData() {
    // Populate location form
    populateRackSelect();
    populateEmployeeSelects();
    populateCompanySelect();
    
    // Set current location
    const currentLocationInput = document.getElementById('currentLocation');
    if (currentLocationInput) {
        const location = `${detailCurrentItem.displayLocation}${detailCurrentItem.displayRackLayerNotes ? ' - ' + detailCurrentItem.displayRackLayerNotes : ''}`;
        currentLocationInput.value = location;
    }
    
    // Set current status
    const currentStatusInput = document.getElementById('currentStatus');
    if (currentStatusInput) {
        const status = getDetailCurrentStatus(detailCurrentItem);
        currentStatusInput.value = status.text;
    }
}

// Populate rack select
function populateRackSelect() {
    const rackSelect = document.getElementById('rackSelect');
    if (!rackSelect) return;
    
    rackSelect.innerHTML = '<option value="">選択 - Chọn</option>';
    
    detailAllData.racks.forEach(rack => {
        const option = document.createElement('option');
        option.value = rack.RackID;
        option.textContent = `${rack.RackSymbol || rack.RackName} - ${rack.RackLocation}`;
        rackSelect.appendChild(option);
    });
}

// Update rack layers when rack is selected
function updateRackLayers() {
    const rackSelect = document.getElementById('rackSelect');
    const rackLayerSelect = document.getElementById('rackLayerSelect');
    
    if (!rackSelect || !rackLayerSelect) return;
    
    const selectedRackId = rackSelect.value;
    rackLayerSelect.innerHTML = '<option value="">選択 - Chọn</option>';
    
    if (selectedRackId) {
        const rackLayers = detailAllData.racklayers.filter(layer => layer.RackID === selectedRackId);
        rackLayers.forEach(layer => {
            const option = document.createElement('option');
            option.value = layer.RackLayerID;
            option.textContent = `${layer.RackLayerID}${layer.RackLayerNotes ? ' - ' + layer.RackLayerNotes : ''}`;
            rackLayerSelect.appendChild(option);
        });
    }
}

// Populate employee selects
function populateEmployeeSelects() {
    const employeeSelects = ['employeeSelect', 'commentEmployeeSelect'];
    
    employeeSelects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">選択してください - Chọn nhân viên</option>';
            
            detailAllData.employees.forEach(employee => {
                const option = document.createElement('option');
                option.value = employee.EmployeeID;
                option.textContent = employee.EmployeeName;
                select.appendChild(option);
            });
        }
    });
}

// Populate company select
function populateCompanySelect() {
    const companySelect = document.getElementById('toCompanySelect');
    if (!companySelect) return;
    
    companySelect.innerHTML = '<option value="">選択してください - Chọn công ty</option>';
    
    detailAllData.companies.forEach(company => {
        const option = document.createElement('option');
        option.value = company.CompanyID;
        option.textContent = company.CompanyShortName || company.CompanyName;
        companySelect.appendChild(option);
    });
    
    // Update company name field when selected
    companySelect.addEventListener('change', function() {
        const companyNameInput = document.getElementById('companyName');
        if (companyNameInput && this.value) {
            const selectedCompany = detailAllData.companies.find(c => c.CompanyID === this.value);
            companyNameInput.value = selectedCompany ? (selectedCompany.CompanyName || '') : '';
        }
    });
}

// Handle location update
function handleLocationUpdate() {
    const rackLayerSelect = document.getElementById('rackLayerSelect');
    const employeeSelect = document.getElementById('employeeSelect');
    const locationNotes = document.getElementById('locationNotes');
    
    if (!rackLayerSelect.value) {
        alert('新しい位置を選択してください - Vui lòng chọn vị trí mới');
        return;
    }
    
    if (!employeeSelect.value) {
        alert('変更者を選択してください - Vui lòng chọn người thay đổi');
        return;
    }
    
    // Simulate location update (in real app, this would be an API call)
    const locationData = {
        oldRackLayer: detailCurrentItem.RackLayerID,
        newRackLayer: rackLayerSelect.value,
        itemId: detailCurrentItem.MoldID || detailCurrentItem.CutterID,
        itemType: detailCurrentItemType,
        employeeId: employeeSelect.value,
        notes: locationNotes.value,
        timestamp: new Date().toISOString()
    };
    
    // Add to location log (simulation)
    detailAllData.locationlog.unshift({
        LocationLogID: Date.now(),
        OldRackLayer: locationData.oldRackLayer,
        NewRackLayer: locationData.newRackLayer,
        MoldID: detailCurrentItemType === 'mold' ? locationData.itemId : '',
        CutterID: detailCurrentItemType === 'cutter' ? locationData.itemId : '',
        DateEntry: locationData.timestamp,
        notes: locationData.notes
    });
    
    // Update current item
    detailCurrentItem.RackLayerID = locationData.newRackLayer;
    const newRackLayer = detailAllData.racklayers.find(r => r.RackLayerID === locationData.newRackLayer) || {};
    detailCurrentItem.displayLocation = locationData.newRackLayer;
    detailCurrentItem.displayRackLayerNotes = newRackLayer.RackLayerNotes || '';
    
    // Refresh display
    displayDetailData();
    hideLocationModal();
    
    alert('位置が更新されました - Vị trí đã được cập nhật');
}

// Handle shipment update
function handleShipmentUpdate() {
    const toCompanySelect = document.getElementById('toCompanySelect');
    const contactPerson = document.getElementById('contactPerson');
    const shipmentDate = document.getElementById('shipmentDate');
    const shipmentNotes = document.getElementById('shipmentNotes');
    
    if (!toCompanySelect.value) {
        alert('送り先会社を選択してください - Vui lòng chọn công ty nhận');
        return;
    }
    
    // Simulate shipment update
    const shipmentData = {
        itemId: detailCurrentItem.MoldID || detailCurrentItem.CutterID,
        itemType: detailCurrentItemType,
        toCompanyId: toCompanySelect.value,
        fromCompanyId: '2', // YSD company ID
        contactPerson: contactPerson.value,
        shipmentDate: shipmentDate.value,
        notes: shipmentNotes.value,
        timestamp: new Date().toISOString()
    };
    
    // Add to shipment log (simulation)
    detailAllData.shiplog.unshift({
        ShipLogID: Date.now(),
        MoldID: detailCurrentItemType === 'mold' ? shipmentData.itemId : '',
        CutterID: detailCurrentItemType === 'cutter' ? shipmentData.itemId : '',
        ToCompanyID: shipmentData.toCompanyId,
        FromCompanyID: shipmentData.fromCompanyId,
        ContactPerson: shipmentData.contactPerson,
        DateEntry: shipmentData.timestamp,
        ShipmentNotes: shipmentData.notes
    });
    
    // Update current item ship history
    detailCurrentItem.shipHistory = getDetailShipHistory(detailCurrentItemType.toUpperCase(), shipmentData.itemId);
    
    // Refresh display
    displayDetailData();
    hideShipmentModal();
    
    alert('出荷記録が追加されました - Đã thêm bản ghi vận chuyển');
}

// Handle comment submit
function handleCommentSubmit() {
    const commentText = document.getElementById('commentText');
    const commentEmployeeSelect = document.getElementById('commentEmployeeSelect');
    
    if (!commentText.value.trim()) {
        alert('コメントを入力してください - Vui lòng nhập ghi chú');
        return;
    }
    
    if (!commentEmployeeSelect.value) {
        alert('記録者を選択してください - Vui lòng chọn người ghi');
        return;
    }
    
    const itemId = detailCurrentItem.MoldID || detailCurrentItem.CutterID;
    const comment = {
        itemId: itemId,
        text: commentText.value.trim(),
        employeeId: commentEmployeeSelect.value,
        timestamp: new Date().toISOString()
    };
    
    // Save comment
    saveDetailUserComment(comment);
    
    // Refresh display
    displayUserComments();
    hideCommentModal();
    
    // Clear form
    commentText.value = '';
    commentEmployeeSelect.value = '';
    
    alert('コメントが追加されました - Đã thêm ghi chú');
}

// Modal functions - Fixed function names
function showLocationModal() {
    const modal = document.getElementById('locationModal');
    if (modal) modal.style.display = 'flex';
}

function hideLocationModal() {
    const modal = document.getElementById('locationModal');
    if (modal) modal.style.display = 'none';
}

function showShipmentModal() {
    const modal = document.getElementById('shipmentModal');
    if (modal) modal.style.display = 'flex';
    
    // Set today's date as default
    const shipmentDate = document.getElementById('shipmentDate');
    if (shipmentDate) {
        shipmentDate.value = new Date().toISOString().split('T')[0];
    }
}

function hideShipmentModal() {
    const modal = document.getElementById('shipmentModal');
    if (modal) modal.style.display = 'none';
}

function showCommentModal() {
    const modal = document.getElementById('commentModal');
    if (modal) modal.style.display = 'flex';
}

function hideCommentModal() {
    const modal = document.getElementById('commentModal');
    if (modal) modal.style.display = 'none';
}

// User comments management
function loadDetailUserComments() {
    try {
        detailUserComments = JSON.parse(localStorage.getItem('userComments') || '[]');
    } catch (e) {
        detailUserComments = [];
    }
}

function saveDetailUserComment(comment) {
    detailUserComments.push(comment);
    localStorage.setItem('userComments', JSON.stringify(detailUserComments));
}

function getDetailUserComments(itemId) {
    return detailUserComments.filter(comment => comment.itemId === itemId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

// Utility functions
function getDetailCurrentStatus(item) {
    if (item.MoldReturning === 'TRUE' || item.MoldReturning === true) {
        return { status: 'returned', text: '返却済み', class: 'status-returned' };
    }
    if (item.MoldDisposing === 'TRUE' || item.MoldDisposing === true) {
        return { status: 'disposed', text: '廃棄済み', class: 'status-inactive' };
    }
    
    const history = getDetailShipHistory(item.MoldID ? 'MOLD' : 'CUTTER', item.MoldID || item.CutterID);
    if (history.length > 0) {
        const latest = history[0];
        if (latest.ToCompanyID && latest.ToCompanyID !== '2') {
            return { status: 'shipped', text: '出荷済み', class: 'status-shipped' };
        }
    }
    
    return { status: 'available', text: '利用可能', class: 'status-active' };
}

function getDetailCustomerDisplayName(customer, company) {
    if (!customer || !customer.CustomerID) return '';
    let displayName = customer.CustomerShortName || customer.CustomerName || customer.CustomerID;
    if (company && company.CompanyShortName) {
        displayName = `${company.CompanyShortName} - ${displayName}`;
    }
    return displayName;
}

function getDetailRelatedCutters(moldID) {
    if (!moldID) return [];
    const relations = detailAllData.moldcutter.filter(mc => mc.MoldID === moldID);
    return relations.map(rel => {
        const cutter = detailAllData.cutters.find(c => c.CutterID === rel.CutterID);
        return cutter || {};
    }).filter(c => c.CutterID);
}

function getDetailRelatedMolds(cutterID) {
    if (!cutterID) return [];
    const relations = detailAllData.moldcutter.filter(mc => mc.CutterID === cutterID);
    return relations.map(rel => {
        const mold = detailAllData.molds.find(m => m.MoldID === rel.MoldID);
        return mold || {};
    }).filter(m => m.MoldID);
}

function getDetailShipHistory(itemType, itemID) {
    if (!itemID) return [];
    return detailAllData.shiplog.filter(log => {
        if (itemType === 'MOLD') return log.MoldID === itemID;
        if (itemType === 'CUTTER') return log.CutterID === itemID;
        return false;
    }).sort((a, b) => new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0));
}

function getDetailLocationHistory(itemType, itemID) {
    if (!itemID) return [];
    return detailAllData.locationlog.filter(log => {
        if (itemType === 'MOLD') return log.MoldID === itemID;
        if (itemType === 'CUTTER') return log.CutterID === itemID;
        return false;
    }).sort((a, b) => new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0));
}

function parseDetailCSV(csv) {
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

function formatDetailDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('ja-JP');
    } catch {
        return dateString;
    }
}

function showDetailLoading(show) {
    const loading = document.getElementById('loadingIndicator');
    if (loading) {
        loading.style.display = show ? 'flex' : 'none';
    }
}

function showDetailError(message) {
    const errorMessage = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');
    
    if (errorMessage && errorText) {
        errorText.textContent = message;
        errorMessage.style.display = 'block';
    } else {
        alert(message);
    }
}

function hideError() {
    const errorMessage = document.getElementById('errorMessage');
    if (errorMessage) {
        errorMessage.style.display = 'none';
    }
}

// Navigation functions
function goBack() {
    if (document.referrer && document.referrer.includes(window.location.hostname)) {
        window.history.back();
    } else {
        window.location.href = 'index.html';
    }
}

function printDetail() {
    window.print();
}

function shareDetail() {
    if (navigator.share) {
        navigator.share({
            title: document.title,
            url: window.location.href
        });
    } else {
        // Fallback: copy URL to clipboard
        navigator.clipboard.writeText(window.location.href).then(() => {
            alert('URLがコピーされました - URL đã được sao chép');
        });
    }
}

// detail-cutter.js - V4.24 with V3.0 Backend Logic and Mobile Optimized UI
let currentCutter = null;
let cutterAllData = {};
let cutterUserComments = [];

const CUTTER_GITHUB_BASE_URL = "https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/";

// Thêm vào detail-cutter.js và detail-mold.js
let autoRefreshInterval = null;

// Start auto refresh every 30 seconds after any update
function startAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    
    autoRefreshInterval = setInterval(async () => {
        console.log('Auto-refreshing data from GitHub...');
        if (currentCutter) {
            await reloadCutterDataFromGitHub();
        } else if (currentMold) {
            await reloadMoldDataFromGitHub();
        }
    }, 30000); // 30 seconds
}

// Stop auto refresh
function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}


// Initialize cutter detail page
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const cutterId = urlParams.get('id');
    
    if (cutterId) {
        loadCutterDetailData(cutterId);
    } else {
        showError('抜型ID - パラメータが無効です');
    }
    
    initializeCutterEventListeners();
    loadCutterUserComments();

    // Start auto refresh after 1 minute
    setTimeout(startAutoRefresh, 60000);
});

// Initialize event listeners
function initializeCutterEventListeners() {
    // Location form
    const locationForm = document.getElementById('locationForm');
    if (locationForm) {
        locationForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleCutterLocationUpdate();
        });
    }
    
    // Shipment form
    const shipmentForm = document.getElementById('shipmentForm');
    if (shipmentForm) {
        shipmentForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleCutterShipmentUpdate();
        });
    }
    
    // Comment form
    const commentForm = document.getElementById('commentForm');
    if (commentForm) {
        commentForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleCutterCommentSubmit();
        });
    }
}

// Thêm function reload data từ GitHub
async function reloadCutterDataFromGitHub() {
    console.log('Reloading cutter data from GitHub...');
    try {
        showLoading(true);
        
        // Reload specific files that were updated
        const filesToReload = ['locationlog.csv', 'shiplog.csv', 'cutters.csv', 'usercomments.csv'];
        
        for (const file of filesToReload) {
            try {
                // Add cache busting parameter
                const response = await fetch(`${CUTTER_GITHUB_BASE_URL}${file}?t=${Date.now()}`);
                if (response.ok) {
                    const csvText = await response.text();
                    const data = parseCSV(csvText);
                    const key = file.replace('.csv', '');
                    cutterAllData[key] = data;
                    console.log(`Reloaded ${file}: ${data.length} records`);
                }
            } catch (error) {
                console.warn(`Error reloading ${file}:`, error);
            }
        }
        
        // Reprocess relationships
        processCutterDataRelationships();
        
        // Find updated current cutter
        currentCutter = cutterAllData.cutters.find(item => item.CutterID === currentCutter.CutterID);
        
        if (currentCutter) {
            // Refresh display
            displayCutterDetailData();
            console.log('Cutter data reloaded and display refreshed');
        }
        
    } catch (error) {
        console.error('Error reloading cutter data:', error);
    } finally {
        showLoading(false);
    }
}

// Load cutter detail data (V3.0 working method)
async function loadCutterDetailData(cutterId) {
    showLoading(true);
    try {
        // Load all required data files
        const dataFiles = [
            'molds.csv', 'cutters.csv', 'customers.csv', 'molddesign.csv', 
            'moldcutter.csv', 'shiplog.csv', 'locationlog.csv', 'employees.csv', 
            'racklayers.csv', 'racks.csv', 'companies.csv', 'jobs.csv', 'processingitems.csv'
        ];
        
        const promises = dataFiles.map(async (file) => {
            try {
                const response = await fetch(`${CUTTER_GITHUB_BASE_URL}${file}`);
                if (response.ok) {
                    const csvText = await response.text();
                    return { file, data: parseCSV(csvText) };
                }
                return { file, data: [] };
            } catch (error) {
                console.warn(`Error loading ${file}:`, error);
                return { file, data: [] };
            }
        });
        
        const results = await Promise.all(promises);
        
        // Organize data
        results.forEach(({ file, data }) => {
            const key = file.replace('.csv', '');
            cutterAllData[key] = data;
        });
        
        // Process relationships
        processCutterDataRelationships();
        
        // Find current cutter
        currentCutter = cutterAllData.cutters.find(item => item.CutterID === cutterId);
        
        if (currentCutter) {
            displayCutterDetailData();
            populateCutterFormData();
        } else {
            showError('抜型が見つかりません - 抜型が見つかりません');
        }
    } catch (error) {
        console.error('Error loading cutter detail data:', error);
        showError(`データ読み込みエラー: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Process cutter data relationships (V3.0 working logic)
function processCutterDataRelationships() {
    // Create lookup maps
    const customerMap = new Map();
    cutterAllData.customers.forEach(customer => {
        customerMap.set(customer.CustomerID, customer);
    });
    
    const companyMap = new Map();
    cutterAllData.companies.forEach(company => {
        companyMap.set(company.CompanyID, company);
    });
    
    const rackMap = new Map();
    cutterAllData.racks.forEach(rack => {
        rackMap.set(rack.RackID, rack);
    });
    
    const rackLayerMap = new Map();
    cutterAllData.racklayers.forEach(layer => {
        rackLayerMap.set(layer.RackLayerID, layer);
    });
    
    // Process cutters
    cutterAllData.cutters = cutterAllData.cutters.map(cutter => {
        const customer = customerMap.get(cutter.CustomerID) || {};
        const company = companyMap.get(customer.CompanyID) || {};
        const storageCompany = companyMap.get(cutter.storage_company) || {};
        const rackLayer = rackLayerMap.get(cutter.RackLayerID) || {};
        const rack = rackLayer.RackID ? rackMap.get(rackLayer.RackID) || {} : {};
        
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
            storageCompanyInfo: storageCompany,
            rackLayerInfo: rackLayer,
            rackInfo: rack,
            relatedMolds: getCutterRelatedMolds(cutter.CutterID),
            shipHistory: getCutterShipHistory(cutter.CutterID),
            locationHistory: getCutterLocationHistory(cutter.CutterID),
            currentStatus: getCutterCurrentStatus(cutter),
            displayCode: cutter.CutterNo || '',
            displayName: displayName,
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
    
    console.log(`Processed ${cutterAllData.cutters.length} cutters`);
}

// Display cutter detail data
function displayCutterDetailData() {
    // Update page title and header
    const cutterTitle = document.getElementById('cutterTitle');
    const storageInfo = document.getElementById('storageInfo');
    
    if (cutterTitle) {
        const cutterName = currentCutter.CutterName || currentCutter.CutterDesignName || currentCutter.CutterNo;
        cutterTitle.textContent = `${currentCutter.CutterNo || ''} ${cutterName}`.trim();
    }
    
    if (storageInfo) {
        const storageCompany = currentCutter.storageCompanyInfo?.CompanyShortName || 
                             currentCutter.storageCompanyInfo?.CompanyName || '-';
        const rackLocation = currentCutter.rackInfo?.RackLocation || '-';
        const rackLayerId = currentCutter.RackLayerID || '-';
        storageInfo.textContent = `${storageCompany} / ${rackLayerId} / ${rackLocation}`;
    }
    
    displayCutterBasicInfo();
    displayCutterTechnicalInfo();
    displayCutterDimensionsInfo();
    displayCutterCuttingInfo();
    displayCutterLocationHistory();
    displayCutterShipmentHistory();
    displayCutterRelatedMolds();
    displayCutterUserComments();
}

// Display cutter basic information
function displayCutterBasicInfo() {
    const basicInfo = document.getElementById('basicInfo');
    if (!basicInfo) return;
    
    const cutterId = currentCutter.CutterID;
    const cutterNo = currentCutter.CutterNo;
    const cutterName = currentCutter.CutterName || currentCutter.CutterDesignName;
    
    // Get status
    const status = getCutterCurrentStatus(currentCutter);
    
    // Get cutline dimensions
    let cutlineDimensions = 'N/A';
    if (currentCutter.cutlineSize) {
        cutlineDimensions = currentCutter.cutlineSize;
    }
    
    let html = `
        <div class="info-row-compact">
            <div class="info-label-compact">ID</div>
            <div class="info-value-compact muted">${cutterId}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">CutterNo</div>
            <div class="info-value-compact highlight cutter">${cutterNo}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">名称</div>
            <div class="info-value-compact">${cutterName}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">ステータス</div>
            <div class="info-value-compact ${status.class}">${status.text}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">Cutline寸法</div>
            <div class="info-value-compact cutline">${cutlineDimensions}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">プラスチック</div>
            <div class="info-value-compact">${currentCutter.PlasticCutType || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">カッタータイプ</div>
            <div class="info-value-compact">${currentCutter.CutterType || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">ブレード数</div>
            <div class="info-value-compact">${currentCutter.BladeCount || 'N/A'}</div>
        </div>
    `;
    
    basicInfo.innerHTML = html;
}

// Display cutter technical information
function displayCutterTechnicalInfo() {
    const technicalInfo = document.getElementById('technicalInfo');
    if (!technicalInfo) return;
    
    let html = `
        <div class="info-row-compact">
            <div class="info-label-compact">SATOコード</div>
            <div class="info-value-compact">${currentCutter.SatoCode || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">SATO日付</div>
            <div class="info-value-compact">${currentCutter.SatoCodeDate ? formatDate(currentCutter.SatoCodeDate) : 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">説明</div>
            <div class="info-value-compact">${currentCutter.Description || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">使用状況</div>
            <div class="info-value-compact">${currentCutter.UsageStatus || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">ピッチ</div>
            <div class="info-value-compact">${currentCutter.Pitch || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">PPクッション</div>
            <div class="info-value-compact">${currentCutter.PPcushionUse || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">備考</div>
            <div class="info-value-compact">${currentCutter.CutterNote || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">詳細</div>
            <div class="info-value-compact">${currentCutter.CutterDetail || 'N/A'}</div>
        </div>
    `;
    
    technicalInfo.innerHTML = html;
}

// Display cutter dimensions information
function displayCutterDimensionsInfo() {
    const dimensionsInfo = document.getElementById('dimensionsInfo');
    if (!dimensionsInfo) return;
    
    // Post-cut dimensions
    let postCutDim = 'N/A';
    if (currentCutter.PostCutLength && currentCutter.PostCutWidth) {
        postCutDim = `${currentCutter.PostCutLength}×${currentCutter.PostCutWidth}`;
    }
    
    // Physical dimensions
    let physDim = 'N/A';
    if (currentCutter.CutterLength && currentCutter.CutterWidth) {
        physDim = `${currentCutter.CutterLength}×${currentCutter.CutterWidth}`;
    }
    
    // Nominal dimensions (cutline)
    let nomDim = 'N/A';
    if (currentCutter.CutlineLength && currentCutter.CutlineWidth) {
        nomDim = `${currentCutter.CutlineLength}×${currentCutter.CutlineWidth}`;
    }
    
    // Check dimension match
    const dimMatch = (nomDim === physDim) || (nomDim === 'N/A' || physDim === 'N/A');
    
    let html = `
        <div class="info-row-compact">
            <div class="info-label-compact">ポストカット寸法</div>
            <div class="info-value-compact">${postCutDim}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">物理寸法</div>
            <div class="info-value-compact ${!dimMatch && nomDim !== 'N/A' && physDim !== 'N/A' ? 'dimension-mismatch' : ''}">${physDim}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">Cutline寸法</div>
            <div class="info-value-compact cutline">${nomDim}</div>
        </div>
    `;
    
    // Add dimension comparison if there's a mismatch
    if (!dimMatch && nomDim !== 'N/A' && physDim !== 'N/A') {
        html += `
            <div class="dimension-comparison mismatch">
                <div class="comparison-title">寸法不一致</div>
                <div class="comparison-details">
                    Cutline: ${nomDim}<br>
                    物理: ${physDim}
                </div>
            </div>
        `;
    }
    
    dimensionsInfo.innerHTML = html;
}

// Display cutting specifications
function displayCutterCuttingInfo() {
    const cuttingInfo = document.getElementById('cuttingInfo');
    if (!cuttingInfo) return;
    
    let html = `
        <div class="info-row-compact">
            <div class="info-label-compact">コーナー</div>
            <div class="info-value-compact">${currentCutter.CutterCorner || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">面取り</div>
            <div class="info-value-compact">${currentCutter.CutterChamfer || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">ブレード数</div>
            <div class="info-value-compact">${currentCutter.BladeCount || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">プラスチック</div>
            <div class="info-value-compact">${currentCutter.PlasticCutType || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">カッタータイプ</div>
            <div class="info-value-compact">${currentCutter.CutterType || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">ピッチ</div>
            <div class="info-value-compact">${currentCutter.Pitch || 'N/A'}</div>
        </div>
    `;
    
    cuttingInfo.innerHTML = html;
}

// Display cutter location history
function displayCutterLocationHistory() {
    const locationHistory = document.getElementById('locationHistory');
    if (!locationHistory) return;
    
    if (currentCutter.locationHistory && currentCutter.locationHistory.length > 0) {
        let html = '';
        currentCutter.locationHistory.slice(0, 5).forEach(log => {
            html += `
                <div class="history-item-compact location">
                    <div class="history-header-compact">
                        <div class="history-title-compact">位置変更</div>
                        <div class="history-date-compact">${formatDate(log.DateEntry)}</div>
                    </div>
                    <div class="history-details-compact">
                        ${log.OldRackLayer} → ${log.NewRackLayer}
                        ${log.notes ? `<br>${log.notes}` : ''}
                    </div>
                </div>
            `;
        });
        locationHistory.innerHTML = html;
    } else {
        locationHistory.innerHTML = '<div class="no-data-compact">位置履歴がありません</div>';
    }
}

// Display cutter shipment history
function displayCutterShipmentHistory() {
    const shipmentHistory = document.getElementById('shipmentHistory');
    if (!shipmentHistory) return;
    
    if (currentCutter.shipHistory && currentCutter.shipHistory.length > 0) {
        let html = '';
        currentCutter.shipHistory.slice(0, 5).forEach(log => {
            const toCompany = cutterAllData.companies.find(c => c.CompanyID === log.ToCompanyID);
            const fromCompany = cutterAllData.companies.find(c => c.CompanyID === log.FromCompanyID);
            
            html += `
                <div class="history-item-compact shipment">
                    <div class="history-header-compact">
                        <div class="history-title-compact">出荷</div>
                        <div class="history-date-compact">${formatDate(log.DateEntry)}</div>
                    </div>
                    <div class="history-details-compact">
                        ${fromCompany?.CompanyShortName || log.FromCompanyID || 'N/A'} → 
                        ${toCompany?.CompanyShortName || log.ToCompanyID || 'N/A'}
                        ${log.handler ? `<br>担当: ${log.handler}` : ''}
                        ${log.ShipmentNotes ? `<br>${log.ShipmentNotes}` : ''}
                    </div>
                </div>
            `;
        });
        shipmentHistory.innerHTML = html;
    } else {
        shipmentHistory.innerHTML = '<div class="no-data-compact">出荷履歴がありません</div>';
    }
}

// Display related molds
function displayCutterRelatedMolds() {
    const relatedMoldsSection = document.getElementById('relatedMoldsSection');
    const relatedMolds = document.getElementById('relatedMolds');
    
    if (!relatedMoldsSection || !relatedMolds) return;
    
    if (currentCutter.relatedMolds && currentCutter.relatedMolds.length > 0) {
        let html = '';
        currentCutter.relatedMolds.forEach(mold => {
            const moldCode = mold.MoldCode;
            const moldName = mold.MoldName;
            const moldId = mold.MoldID;
            
            html += `
                <div class="related-item-compact" onclick="window.location.href='detail-mold.html?id=${moldId}'">
                    <div class="related-id-compact">${moldId}</div>
                    <div class="related-name-compact">${moldCode}</div>
                    <div class="related-desc-compact">${moldName}</div>
                </div>
            `;
        });
        relatedMolds.innerHTML = html;
        relatedMoldsSection.style.display = 'block';
    } else {
        relatedMoldsSection.style.display = 'none';
    }
}

// Display user comments
function displayCutterUserComments() {
    const userComments = document.getElementById('userComments');
    if (!userComments) return;
    
    // Get comments from server data instead of localStorage
    const comments = getCutterUserCommentsFromServer(currentCutter.CutterID);
    
    if (comments.length > 0) {
        let html = '';
        comments.slice(0, 10).forEach(comment => {
            const employee = cutterAllData.employees.find(e => e.EmployeeID === comment.EmployeeID);
            
            html += `
                <div class="comment-item-compact">
                    <div class="comment-header-compact">
                        <div class="comment-author-compact">${employee?.EmployeeName || 'Unknown'}</div>
                        <div class="comment-date-compact">${formatDate(comment.DateEntry)}</div>
                    </div>
                    <div class="comment-text-compact">${comment.CommentText}</div>
                </div>
            `;
        });
        userComments.innerHTML = html;
    } else {
        userComments.innerHTML = '<div class="no-data-compact">コメントがありません</div>';
    }
}

function getCutterUserCommentsFromServer(cutterId) {
    if (!cutterAllData.usercomments) return [];
    
    return cutterAllData.usercomments
        .filter(comment => comment.ItemID === cutterId && comment.ItemType === 'cutter' && comment.CommentStatus === 'active')
        .sort((a, b) => new Date(b.DateEntry) - new Date(a.DateEntry));
}

// Populate form data
function populateCutterFormData() {
    // Populate racks
    const rackSelect = document.getElementById('rackSelect');
    if (rackSelect) {
        rackSelect.innerHTML = '<option value="">選択</option>';
        cutterAllData.racks.forEach(rack => {
            const option = document.createElement('option');
            option.value = rack.RackID;
            option.textContent = `${rack.RackSymbol || rack.RackName} - ${rack.RackLocation}`;
            rackSelect.appendChild(option);
        });
    }
    
    // Populate employees
    const employeeSelects = ['employeeSelect', 'commentEmployeeSelect'];
    employeeSelects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            select.innerHTML = '<option value="">選択</option>';
            cutterAllData.employees.forEach(employee => {
                const option = document.createElement('option');
                option.value = employee.EmployeeID;
                option.textContent = employee.EmployeeName;
                select.appendChild(option);
            });
        }
    });
    
    // Populate companies for shipment
    const fromCompanySelect = document.getElementById('fromCompanySelect');
    const toCompanySelect = document.getElementById('toCompanySelect');
    [fromCompanySelect, toCompanySelect].forEach(select => {
        if (select) {
            select.innerHTML = '<option value="">選択</option>';
            cutterAllData.companies.forEach(company => {
                const option = document.createElement('option');
                option.value = company.CompanyID;
                option.textContent = company.CompanyShortName || company.CompanyName;
                select.appendChild(option);
            });
        }
    });
    
    // Set current location
    const currentLocationInput = document.getElementById('currentLocation');
    if (currentLocationInput) {
        const location = `${currentCutter.displayLocation}${currentCutter.rackLayerInfo?.RackLayerNotes ? ` - ${currentCutter.rackLayerInfo.RackLayerNotes}` : ''}`;
        currentLocationInput.value = location;
    }
}

// Update rack layers when rack is selected
function updateRackLayers() {
    const rackSelect = document.getElementById('rackSelect');
    const rackLayerSelect = document.getElementById('rackLayerSelect');
    
    if (!rackSelect || !rackLayerSelect) return;
    
    const selectedRackId = rackSelect.value;
    rackLayerSelect.innerHTML = '<option value="">選択</option>';
    
    if (selectedRackId) {
        const rackLayers = cutterAllData.racklayers.filter(layer => layer.RackID === selectedRackId);
        rackLayers.forEach(layer => {
            const option = document.createElement('option');
            option.value = layer.RackLayerID;
            option.textContent = `${layer.RackLayerID}${layer.RackLayerNotes ? ` - ${layer.RackLayerNotes}` : ''}`;
            rackLayerSelect.appendChild(option);
        });
    }
}

// Handle location update (V3.0 backend logic)
// ✅ FIX: Update handleCutterLocationUpdate để reload data
async function handleCutterLocationUpdate() {
    if (!currentCutter) return;
    
    const rackLayerSelect = document.getElementById('rackLayerSelect');
    const employeeSelect = document.getElementById('employeeSelect');
    const locationNotes = document.getElementById('locationNotes');
    
    if (!rackLayerSelect.value) {
        alert('新しい位置を選択してください');
        return;
    }
    
    if (!employeeSelect.value) {
        alert('担当者を選択してください');
        return;
    }
    
    const newLocationLogEntry = {
        LocationLogID: String(Date.now()),
        OldRackLayer: currentCutter.RackLayerID || '',
        NewRackLayer: rackLayerSelect.value,
        MoldID: '', // 空文字、抜型用
        DateEntry: new Date().toISOString(),
        CutterID: currentCutter.CutterID,
        notes: locationNotes.value.trim()
    };
    
    const cutterFieldUpdates = {
        RackLayerID: rackLayerSelect.value,
        storage_company: '2' // 仮定：移動は内部でYSDへ
    };
    
    try {
        showLoading(true);
        
        // V3.0 backend API calls
        await callBackendApi('add-log', {
            endpoint: 'locationlog.csv',
            data: newLocationLogEntry
        });
        console.log('Location log for cutter added via API.');
        
        await callBackendApi('update-item', {
            endpoint: 'cutters.csv',
            data: {
                itemId: currentCutter.CutterID,
                idField: 'CutterID',
                updatedFields: cutterFieldUpdates
            }
        });
        console.log('Cutter item updated via API.');
        
        // ✅ FIX: Reload data từ GitHub sau khi update
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s for GitHub propagation
        await reloadCutterDataFromGitHub();
        
        hideLocationModal();
        alert('位置が正常に更新されました');
        
    } catch (error) {
        console.error('Failed to complete cutter location update process:', error);
        alert(`位置更新に失敗しました: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Handle shipment update (V3.0 backend logic)
// ✅ FIX: Update handleCutterShipmentUpdate để reload data
async function handleCutterShipmentUpdate() {
    if (!currentCutter) return;
    
    const fromCoSelect = document.getElementById('fromCompanySelect');
    const toCoSelect = document.getElementById('toCompanySelect');
    const fromCoManual = document.getElementById('fromCompanyManual');
    const toCoManual = document.getElementById('toCompanyManual');
    const dateInput = document.getElementById('shipmentDate');
    const handlerInput = document.getElementById('handler');
    const notesInput = document.getElementById('shipmentNotes');
    
    const toCompanyId = toCoSelect.value;
    const toCompanyManualVal = toCoManual.value.trim();
    
    if (!toCompanyId && !toCompanyManualVal) {
        alert('出荷先を選択または入力してください');
        return;
    }
    
    const newShipLogEntry = {
        ShipID: String(Date.now()),
        MoldID: '', // MoldIDは空
        CutterID: currentCutter.CutterID,
        FromCompanyID: fromCoSelect.value || '2',
        ToCompanyID: toCompanyId || '',
        FromCompany: fromCoManual.value.trim() || '',
        ToCompany: toCompanyManualVal || '',
        ShipDate: dateInput.value,
        handler: handlerInput.value.trim() || '',
        ShipNotes: notesInput.value.trim() || '',
        DateEntry: new Date().toISOString()
    };
    
    const cutterFieldUpdates = {};
    if (toCompanyId && toCompanyId !== '2') {
        cutterFieldUpdates.storage_company = toCompanyId;
        cutterFieldUpdates.RackLayerID = '';
    } else if (toCompanyId === '2') {
        cutterFieldUpdates.storage_company = '2';
    }
    
    try {
        showLoading(true);
        
        await callBackendApi('add-log', {
            endpoint: 'shiplog.csv',
            data: newShipLogEntry
        });
        console.log('Shipment log for cutter added via API.');
        
        if (Object.keys(cutterFieldUpdates).length > 0) {
            await callBackendApi('update-item', {
                endpoint: 'cutters.csv',
                data: {
                    itemId: currentCutter.CutterID,
                    idField: 'CutterID',
                    updatedFields: cutterFieldUpdates
                }
            });
            console.log('Cutter item updated for shipment via API.');
        }
        
        // ✅ FIX: Reload data từ GitHub sau khi update
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s for GitHub propagation
        await reloadCutterDataFromGitHub();
        
        hideShipmentModal();
        alert('出荷情報が正常に登録されました');
        
    } catch (error) {
        console.error('Failed to complete cutter shipment update process:', error);
        alert(`出荷登録に失敗しました: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Handle comment submit (V3.0 backend logic)
// ✅ FIX: Update handleCutterCommentSubmit để reload data
async function handleCutterCommentSubmit() {
    if (!currentCutter) return;
    
    const commentText = document.getElementById('commentText');
    const commentEmployeeSelect = document.getElementById('commentEmployeeSelect');
    
    if (!commentText.value.trim()) {
        alert('コメントを入力してください');
        return;
    }
    
    if (!commentEmployeeSelect.value) {
        alert('投稿者を選択してください');
        return;
    }
    
    const newCommentEntry = {
        UserCommentID: String(Date.now()),
        ItemID: currentCutter.CutterID,
        ItemType: 'cutter',
        CommentText: commentText.value.trim(),
        EmployeeID: commentEmployeeSelect.value,
        DateEntry: new Date().toISOString(),
        CommentStatus: 'active'
    };
    
    try {
        showLoading(true);
        
        // Save via server API
        await callBackendApi('add-comment', {
            endpoint: 'usercomments.csv',
            data: newCommentEntry
        });
        console.log('Cutter comment added via API.');
        
        // ✅ FIX: Reload data từ GitHub sau khi update
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s for GitHub propagation
        await reloadCutterDataFromGitHub();
        
        hideCommentModal();
        
        // Clear form
        commentText.value = '';
        commentEmployeeSelect.value = '';
        
        alert('コメントが正常に投稿されました');
        
    } catch (error) {
        console.error('Failed to save cutter comment:', error);
        alert(`コメント投稿に失敗しました: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Modal functions
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

// User comments management (V3.0 localStorage fallback)
function loadCutterUserComments() {
    try {
        cutterUserComments = JSON.parse(localStorage.getItem('cutterUserComments')) || [];
    } catch (e) {
        cutterUserComments = [];
    }
}

function saveCutterUserComment(comment) {
    cutterUserComments.push(comment);
    localStorage.setItem('cutterUserComments', JSON.stringify(cutterUserComments));
}

function getCutterUserComments(cutterId) {
    return cutterUserComments.filter(comment => 
        comment.itemId === cutterId && comment.itemType === 'cutter'
    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

// Utility functions (V3.0 working logic)
function getCutterCurrentStatus(cutter) {
    // Check CutterDisposing field
    if (cutter.CutterDisposing === 'TRUE' || cutter.CutterDisposing === true) {
        return { status: 'disposed', text: '廃棄済み', class: 'status-inactive' };
    }
    
    const history = getCutterShipHistory(cutter.CutterID);
    if (history.length > 0) {
        const latest = history[0];
        if (latest.ToCompanyID && latest.ToCompanyID !== '2') {
            return { status: 'shipped', text: '出荷済み', class: 'status-shipped' };
        }
    }
    
    return { status: 'available', text: '利用可能', class: 'status-active' };
}

function getCutterRelatedMolds(cutterID) {
    if (!cutterID) return [];
    
    const relations = cutterAllData.moldcutter.filter(mc => mc.CutterID === cutterID);
    return relations.map(rel => {
        const mold = cutterAllData.molds.find(m => m.MoldID === rel.MoldID);
        return mold;
    }).filter(m => m && m.MoldID);
}

function getCutterShipHistory(cutterID) {
    if (!cutterID) return [];
    
    return cutterAllData.shiplog.filter(log => log.CutterID === cutterID)
        .sort((a, b) => new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0));
}

function getCutterLocationHistory(cutterID) {
    if (!cutterID) return [];
    
    return cutterAllData.locationlog.filter(log => log.CutterID === cutterID)
        .sort((a, b) => new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0));
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

// CSV parsing function (V3.0 working)
function parseCSV(csv) {
    const lines = csv.split('\n').filter(line => line.trim() !== '');
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
    alert(message);
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

// Quick Edit Modal placeholder
function showQuickEditModal() {
    alert('Quick Edit機能は開発中です');
}

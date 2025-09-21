// detail-mold.js - V4.32 Production Ready
// Professional desktop layout with enhanced business logic, no auto-refresh

let currentMold = null;
let moldAllData = {};
let moldUserComments = []; // Fallback for local comments
const MOLD_GITHUB_BASE_URL = "https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data";
// Note: API_BASE_URL should be declared in script.js to avoid "already declared" error

// ===== KHỞI TẠO TRANG (PAGE INITIALIZATION) =====
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const moldId = urlParams.get('id');
    if (moldId) {
        loadMoldDetailData(moldId);
    } else {
        showError('ID khuôn không hợp lệ / 金型IDが無効です');
    }
    initializeMoldEventListeners();
    loadMoldUserComments(); // Load fallback comments from localStorage
    // REMOVED: Auto-refresh to prevent screen flickering
});

// ===== THIẾT LẬP SỰ KIỆN (EVENT LISTENERS SETUP) =====
function initializeMoldEventListeners() {
    // Action buttons to open modals
    const locationBtn = document.getElementById('showLocationBtn');
    const shipmentBtn = document.getElementById('showShipmentBtn');
    const commentBtn = document.getElementById('showCommentBtn');

    if (locationBtn) locationBtn.addEventListener('click', showLocationModal);
    if (shipmentBtn) shipmentBtn.addEventListener('click', showShipmentModal);
    if (commentBtn) commentBtn.addEventListener('click', showCommentModal);

    // Form submission events
    const locationForm = document.getElementById('locationForm');
    if (locationForm) {
        locationForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleMoldLocationUpdate();
        });
    }

    const shipmentForm = document.getElementById('shipmentForm');
    if (shipmentForm) {
        shipmentForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleMoldShipmentUpdate();
        });
    }

    const commentForm = document.getElementById('commentForm');
    if (commentForm) {
        commentForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleMoldCommentSubmit(e);
        });
    }

    // Event for rack selection change to update layers
    const rackSelect = document.getElementById('rackSelect');
    if (rackSelect) {
        rackSelect.addEventListener('change', updateRackLayers);
    }
}

// ===== TẢI DỮ LIỆU TỪ GITHUB (DATA LOADING FROM GITHUB) =====

/**
 * Manual reload function (no auto-refresh to prevent flickering)
 */
async function reloadMoldDataFromGitHub() {
    console.log('Manual reload: Refreshing mold data from GitHub...');
    try {
        showLoading(true);
        const filesToReload = ['locationlog.csv', 'shiplog.csv', 'molds.csv', 'usercomments.csv'];
        
        for (const file of filesToReload) {
            try {
                // Add cache-busting parameter to ensure the latest data is fetched
                const response = await fetch(`${MOLD_GITHUB_BASE_URL}/${file}?t=${Date.now()}`);
                if (response.ok) {
                    const csvText = await response.text();
                    const data = parseCSV(csvText);
                    const key = file.replace('.csv', '');
                    moldAllData[key] = data;
                    console.log(`Reloaded ${file}: ${data.length} records`);
                }
            } catch (error) {
                console.warn(`Error reloading ${file}:`, error);
            }
        }

        // Reprocess relationships with the new data
        processMoldDataRelationships();
        
        // Find the current mold again from the newly loaded data
        currentMold = moldAllData.molds.find(item => item.MoldID === currentMold.MoldID);
        
        if (currentMold) {
            // Redraw the UI with the latest data
            displayMoldDetailData();
            console.log('Mold data reloaded and display refreshed');
        }
    } catch (error) {
        console.error('Error reloading mold data:', error);
        showErrorNotification('データ更新に失敗しました (Cập nhật dữ liệu thất bại)');
    } finally {
        showLoading(false);
    }
}

/**
 * Loads all necessary data for the mold detail page on initial page load.
 */
async function loadMoldDetailData(moldId) {
    showLoading(true);
    try {
        // List of all required data files for this page
        const dataFiles = [
            'molds.csv', 'cutters.csv', 'customers.csv', 'molddesign.csv', 
            'moldcutter.csv', 'shiplog.csv', 'locationlog.csv', 'employees.csv', 
            'racklayers.csv', 'racks.csv', 'companies.csv', 'jobs.csv', 'usercomments.csv'
        ];

        const promises = dataFiles.map(async file => {
            try {
                const response = await fetch(`${MOLD_GITHUB_BASE_URL}/${file}`);
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

        // Organize data into the global moldAllData object
        results.forEach(({ file, data }) => {
            const key = file.replace('.csv', '');
            moldAllData[key] = data;
        });

        // Process relationships between different data files
        processMoldDataRelationships();

        // Find the current mold object
        currentMold = moldAllData.molds.find(item => item.MoldID === moldId);

        if (currentMold) {
            displayMoldDetailData();
            populateMoldFormData();
        } else {
            showError('金型が見つかりません (Không tìm thấy khuôn)');
        }

    } catch (error) {
        console.error('Error loading mold detail data:', error);
        showError(`データの読み込みに失敗しました: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// ===== XỬ LÝ MỐI QUAN HỆ DỮ LIỆU (DATA RELATIONSHIP PROCESSING) =====
function processMoldDataRelationships() {
    // Create lookup maps for performance
    const moldDesignMap = new Map(moldAllData.molddesign?.map(d => [d.MoldDesignID, d]));
    const customerMap = new Map(moldAllData.customers?.map(c => [c.CustomerID, c]));
    const companyMap = new Map(moldAllData.companies?.map(c => [c.CompanyID, c]));
    const rackMap = new Map(moldAllData.racks?.map(r => [r.RackID, r]));
    const rackLayerMap = new Map(moldAllData.racklayers?.map(l => [l.RackLayerID, l]));
    const jobMap = new Map(moldAllData.jobs?.map(j => [j.MoldDesignID, j]));

    // Enhance mold objects with related data
    if (moldAllData.molds) {
        moldAllData.molds = moldAllData.molds.map(mold => {
            const design = moldDesignMap.get(mold.MoldDesignID);
            const customer = customerMap.get(mold.CustomerID);
            const storageCompany = companyMap.get(mold.storage_company);
            const rackLayer = rackLayerMap.get(mold.RackLayerID);
            const rack = rackLayer ? rackMap.get(rackLayer.RackID) : null;
            const job = jobMap.get(mold.MoldDesignID);

            return {
                ...mold,
                designInfo: design,
                customerInfo: customer,
                storageCompanyInfo: storageCompany,
                rackLayerInfo: rackLayer,
                rackInfo: rack,
                jobInfo: job,
                relatedCutters: getMoldRelatedCutters(mold.MoldID),
                shipHistory: getMoldShipHistory(mold.MoldID),
                locationHistory: getMoldLocationHistory(mold.MoldID),
                currentStatus: getMoldCurrentStatus(mold),
                itemType: 'mold'
            };
        });
    }
}

// ===== UI表示関数 (HÀM HIỂN THỊ UI) =====
function displayMoldDetailData() {
    if (!currentMold) return;

    displayEnhancedHeader();
    displayMoldBasicInfo();
    displayMoldStatusInfo();
    displayMoldTechnicalInfo();
    displayMoldProductInfo();
    displayMoldLocationHistory();
    displayMoldShipmentHistory();
    displayMoldRelatedCutters();
    displayMoldUserComments();
}

// ====== LOGIC NGHIỆP VỤ: CẬP NHẬT DỮ LIỆU (BUSINESS LOGIC: DATA UPDATES) ======

async function handleMoldLocationUpdate() {
    if (!currentMold) return;

    const rackLayerSelect = document.getElementById('rackLayerSelect');
    const employeeSelect = document.getElementById('employeeSelect');
    const locationNotes = document.getElementById('locationNotes');

    if (!rackLayerSelect.value) {
        showErrorNotification('新しい位置を選択してください (Vui lòng chọn vị trí mới)');
        return;
    }
    if (!employeeSelect.value) {
        showErrorNotification('担当者を選択してください (Vui lòng chọn người thực hiện)');
        return;
    }

    const newLocationLogEntry = {
        LocationLogID: String(Date.now()),
        OldRackLayer: currentMold.RackLayerID || '',
        NewRackLayer: rackLayerSelect.value,
        MoldID: currentMold.MoldID,
        CutterID: '', // Always empty for molds
        DateEntry: new Date().toISOString(),
        notes: locationNotes.value.trim()
    };

    const moldFieldUpdates = {
        RackLayerID: rackLayerSelect.value,
        storage_company: '2' // Assume internal moves are to YSD
    };

    try {
        showLoading(true);
        
        // Call backend to add log and update item
        await callBackendApi('add-log', {
            endpoint: 'locationlog.csv',
            data: newLocationLogEntry
        });
        
        await callBackendApi('update-item', {
            endpoint: 'molds.csv',
            data: {
                itemId: currentMold.MoldID,
                idField: 'MoldID',
                updatedFields: moldFieldUpdates
            }
        });

        // Wait for GitHub to propagate changes before reloading
        await new Promise(resolve => setTimeout(resolve, 3000));
        await reloadMoldDataFromGitHub();

        hideLocationModal();
        showSuccessNotification('位置が正常に更新されました (Cập nhật vị trí thành công)');

    } catch (error) {
        console.error('Failed to complete mold location update process:', error);
        showErrorNotification(`位置更新に失敗しました: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

async function handleMoldShipmentUpdate() {
    if (!currentMold) return;

    const toCoSelect = document.getElementById('toCompanySelect');
    const shipmentDate = document.getElementById('shipmentDate');
    const handler = document.getElementById('handler');
    const shipmentNotes = document.getElementById('shipmentNotes');

    if (!toCoSelect.value) {
        showErrorNotification('出荷先を選択してください (Vui lòng chọn công ty đến)');
        return;
    }

    const newShipLogEntry = {
        ShipID: String(Date.now()),
        MoldID: currentMold.MoldID,
        CutterID: '',
        FromCompanyID: '2', // Default from YSD
        ToCompanyID: toCoSelect.value,
        ShipDate: shipmentDate.value,
        handler: handler.value.trim(),
        ShipNotes: shipmentNotes.value.trim(),
        DateEntry: new Date().toISOString()
    };

    const moldFieldUpdates = {
        storage_company: toCoSelect.value,
        RackLayerID: '' // Clear location when shipped out
    };

    try {
        showLoading(true);
        
        await callBackendApi('add-log', {
            endpoint: 'shiplog.csv',
            data: newShipLogEntry
        });
        
        await callBackendApi('update-item', {
            endpoint: 'molds.csv',
            data: {
                itemId: currentMold.MoldID,
                idField: 'MoldID',
                updatedFields: moldFieldUpdates
            }
        });

        await new Promise(resolve => setTimeout(resolve, 3000));
        await reloadMoldDataFromGitHub();

        hideShipmentModal();
        showSuccessNotification('出荷情報が正常に登録されました (Đăng ký vận chuyển thành công)');

    } catch (error) {
        console.error('Failed to complete mold shipment update process:', error);
        showErrorNotification(`出荷登録に失敗しました: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

async function handleMoldCommentSubmit(event) {
    if (event) event.preventDefault();
    if (!currentMold) return;

    const commentText = document.getElementById('commentText');
    const commentEmployeeSelect = document.getElementById('commentEmployeeSelect');

    if (!commentText.value.trim()) {
        showErrorNotification('コメントを入力してください (Vui lòng nhập bình luận)');
        return;
    }
    if (!commentEmployeeSelect.value) {
        showErrorNotification('担当者を選択してください (Vui lòng chọn người bình luận)');
        return;
    }

    const newCommentEntry = {
        UserCommentID: String(Date.now()),
        ItemID: currentMold.MoldID,
        ItemType: 'mold',
        CommentText: commentText.value.trim(),
        EmployeeID: commentEmployeeSelect.value,
        DateEntry: new Date().toISOString(),
        CommentStatus: 'active'
    };

    try {
        showLoading(true);
        
        await callBackendApi('add-comment', {
            endpoint: 'usercomments.csv',
            data: newCommentEntry
        });

        await new Promise(resolve => setTimeout(resolve, 3000));
        await reloadMoldDataFromGitHub();

        hideCommentModal();
        commentText.value = '';
        commentEmployeeSelect.value = '';
        showSuccessNotification('コメントが正常に投稿されました (Bình luận đã được đăng)');

    } catch (error) {
        console.error('Failed to save mold comment:', error);
        showErrorNotification(`コメント投稿に失敗しました: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// ===== HÀM GỌI API BACKEND (BACKEND API CALL FUNCTION) =====
async function callBackendApi(action, data) {
    // Using API_BASE_URL from script.js
    const API_URL = `${API_BASE_URL}/api/${action}`;
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || `Lỗi từ server: ${response.status}`);
        }
        
        try {
            return await response.json();
        } catch (e) {
            return { success: true, message: 'Operation completed but no JSON response.' };
        }
    } catch (error) {
        console.error(`Lỗi khi gọi API đến ${API_URL}:`, error);
        throw error;
    }
}

// ====== CÁC HÀM HIỂN THỊ DỮ LIỆU (UI DISPLAY FUNCTIONS) ======

/**
 * FIXED: Main function with proper ID mapping for HTML compatibility
 */
function displayMoldDetailData() {
    if (!currentMold) return;

    // Update the main header with enhanced logic
    displayEnhancedHeader();
    
    // FIXED: Use standard HTML IDs that match V4.243/V4.244 structure
    displayMoldBasicInfo();        // Uses 'basicInfo' ID
    displayMoldStatusInfo();       // Uses 'statusInfo' ID
    displayMoldTechnicalInfo();    // Uses 'technicalInfo' ID
    displayMoldProductInfo();      // Uses 'productInfo' ID

    // Display history and comments with enhanced styling
    displayMoldLocationHistory();
    displayMoldShipmentHistory();
    displayMoldRelatedCutters();
    displayMoldUserComments();
}

/**
 * Enhanced header display with original YSD location when shipped out
 */
// ===== ヘッダー表示強化 (HEADER HIỂN THỊ CẢI TIẾN) =====
function displayEnhancedHeader() {
    // Update title
    const moldTitle = document.getElementById('moldTitle');
    if (moldTitle) {
        moldTitle.textContent = `${currentMold.MoldName || ''}`;
    }

    // Update storage info with enhanced 2-column format
    const storageInfo = document.getElementById('storageInfo');
    if (storageInfo) {
        const storageCompany = currentMold.storageCompanyInfo;
        const rackLayer = currentMold.rackLayerInfo;
        const rack = currentMold.rackInfo;

        let column1 = '', column2 = '';

        // Column 1: ヨシダパッケージでの位置 (Vị trí tại YoshidaPackage)
        if (currentMold.storage_company == 2 && rackLayer && rack) {
            column1 = `YSDでの位置: (${rack.RackLocation}) <span class="rack-circle">${rack.RackID}</span> - ${rackLayer.RackLayerNumber}`;
        } else {
            // Get original YSD location when shipped out
            const originalLocation = getOriginalYSDLocation();
            if (originalLocation && originalLocation !== 'Không rõ') {
                column1 = `YSDでの位置: ${originalLocation}`;
            } else {
                column1 = 'ヨシダパッケージでの位置: データなし';
            }
        }

        // Column 2: 金型の現在位置 (Vị trí khuôn hiện tại)
        if (currentMold.storage_company == 2) {
            column2 = '金型の現在位置: (株)ヨシダパッケージ';
        } else if (storageCompany) {
            column2 = `金型の現在位置: ${storageCompany.CompanyShortName}`;
        } else {
            column2 = '金型の現在位置: YSD';
        }

        // Display in 2-column format
        storageInfo.innerHTML = `
            <div class="header-location-info">
                <div class="location-column">${column1}</div>
                <div class="location-column">${column2}</div>
            </div>
        `;
    }
}
// CSS cho rack circle
const style = document.createElement('style');
style.textContent = `
    .rack-circle {
        display: inline-block;
        background: #007bff;
        color: white;
        border-radius: 50%;
        width: 24px;
        height: 24px;
        text-align: center;
        line-height: 24px;
        font-size: 12px;
        font-weight: bold;
        margin: 0 2px;
    }

    .header-location-info {
        display: flex;
        gap: 20px;
        flex-wrap: wrap;
    }

    .location-column {
        flex: 1;
        min-width: 250px;
        padding: 8px;
        background: rgba(0, 123, 255, 0.1);
        border-radius: 4px;
        font-size: 14px;
    }

    .status-section {
        margin-bottom: 15px;
        padding: 10px;
        border-left: 3px solid #007bff;
        background: rgba(0, 123, 255, 0.05);
    }

    .date-row .info-label-compact {
        padding-left: 20px;
        font-size: 0.9em;
        color: #666;
    }
`;
document.head.appendChild(style);

console.log('detail-mold.js V5.0 - 金型詳細表示システム - Header位置表示改善 - Loaded successfully');
// ===== 基本情報表示 (HIỂN THỊ THÔNG TIN CƠ BẢN) =====
function displayMoldBasicInfo() {
    const container = document.getElementById('basicInfo');
    if (!container) return;

    const design = currentMold.designInfo || {};
    const job = currentMold.jobInfo || {};
    const status = getEnhancedMoldStatus(currentMold);

    container.innerHTML = `
        <div class="info-row-compact"><div class="info-label-compact">ID</div>
        <div class="info-value-compact muted">${currentMold.MoldID}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">検索コード / Mã tra cứu khuôn</div>
        <div class="info-value-compact highlight">${currentMold.MoldCode}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">金型名 / Tên khuôn</div>
        <div class="info-value-compact">${currentMold.MoldName || 'N/A'}</div></div>   
        <div class="info-row-compact"><div class="info-label-compact">ステータス / Trạng thái</div>
        <div class="info-value-compact ${status.class}">${status.text}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">設計重量 / Khối lượng thiết kế</div>
        <div class="info-value-compact">${design.MoldDesignWeight ? design.MoldDesignWeight + ' kg' : 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">トレイ情報 / Thông tin khay</div>
        <div class="info-value-compact">${design.TrayInfoForMoldDesign || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">材料 / Chất liệu</div>
        <div class="info-value-compact">${design.DesignForPlasticType || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">製造日(初回出荷日) / Ngày sản xuất</div>
        <div class="info-value-compact">${job.DeliveryDeadline ? formatDate(job.DeliveryDeadline) : 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">数量 / Số mặt</div>
        <div class="info-value-compact">${design.PieceCount || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">データ入力日 / Ngày nhập dữ liệu khuôn</div>
        <div class="info-value-compact">${currentMold.MoldEntry ? formatDate(currentMold.MoldEntry) : 'N/A'}</div></div>
    `;
}

// ===== ステータス情報表示 (HIỂN THỊ THÔNG TIN TRẠNG THÁI) =====
function displayMoldStatusInfo() {
    const container = document.getElementById('statusInfo');
    if (!container) return;

    // Helper function to format date
    function formatDate(dateString) {
        if (!dateString || dateString === 'N/A') return 'N/A';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('ja-JP', { 
                year: 'numeric', 
                month: '2-digit', 
                day: '2-digit' 
            });
        } catch (e) {
            return dateString;
        }
    }

    container.innerHTML = `
        <!-- テフロン加工セクション / Mạ Teflon Section -->
        <div class="status-section">
            <div class="info-row-compact">
                <div class="info-label-compact">テフロン加工 / Mạ Teflon</div>
                <div class="info-value-compact">${currentMold.TeflonCoating || 'N/A'}</div>
            </div>
            <div class="info-row-compact date-row">
                <div class="info-label-compact">送付日 / Ngày gửi</div>
                <div class="info-value-compact">${formatDate(currentMold.TeflonSentDate)}</div>
            </div>
            <div class="info-row-compact date-row">
                <div class="info-label-compact">受領日 / Ngày nhận</div>
                <div class="info-value-compact">${formatDate(currentMold.TeflonReceivedDate)}</div>
            </div>
        </div>

        <!-- 返却セクション / Trả lại KH Section -->
        <div class="status-section">
            <div class="info-row-compact">
                <div class="info-label-compact">返却 / Trả lại KH</div>
                <div class="info-value-compact">${currentMold.MoldReturning || 'N/A'}</div>
            </div>
            <div class="info-row-compact date-row">
                <div class="info-label-compact">実施日 / Ngày thực hiện</div>
                <div class="info-value-compact">${formatDate(currentMold.MoldReturnedDate)}</div>
            </div>
        </div>

        <!-- 廃棄セクション / Hủy khuôn Section -->
        <div class="status-section">
            <div class="info-row-compact">
                <div class="info-label-compact">廃棄 / Hủy khuôn</div>
                <div class="info-value-compact">${currentMold.MoldDisposing || 'N/A'}</div>
            </div>
            <div class="info-row-compact date-row">
                <div class="info-label-compact">実施日 / Ngày thực hiện</div>
                <div class="info-value-compact">${formatDate(currentMold.MoldDisposedDate)}</div>
            </div>
        </div>
    `;
}

/**
 * FIXED: Display technical information with proper ID and full data
 */
function displayMoldTechnicalInfo() {
    const container = document.getElementById('technicalInfo');
    if (!container) return;
    
    const design = currentMold.designInfo || {};
    const job = currentMold.jobInfo || {};

    container.innerHTML = `
        <div class="info-row-compact"><div class="info-label-compact">Mã thiết kế / 設計コード</div><div class="info-value-compact">${design.MoldDesignCode || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Khuôn thuận/nghịch</div><div class="info-value-compact">${design.MoldOrientation || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Số pockets</div><div class="info-value-compact">${design.PocketNumbers || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Hướng lắp / 設置方向</div><div class="info-value-compact">${design.MoldSetupType || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">KL thiết kế / 設計重量</div><div class="info-value-compact">${design.MoldDesignWeight ? `${design.MoldDesignWeight} kg` : 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Số mảnh khuôn</div><div class="info-value-compact">${design.PieceCount || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Khoảng cách / Pitch</div><div class="info-value-compact">${design.Pitch || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Góc vát / C面取</div><div class="info-value-compact">${design.ChamferC || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Góc bo / Rコーナー</div><div class="info-value-compact">${design.CornerR || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Chiều sâu / 深さ</div><div class="info-value-compact">${design.MoldDesignDepth || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Under depth</div><div class="info-value-compact">${design.UnderDepth || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Góc nghiêng / 抜き勾配</div><div class="info-value-compact">${design.DraftAngle || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Chữ khắc / 彫刻</div><div class="info-value-compact">${design.TextContent || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Dung sai X,Y / 公差</div><div class="info-value-compact">${design.TolerenceX || 'N/A'}, ${design.TolerenceY || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Số bản vẽ / 図面番号</div><div class="info-value-compact">${design.DrawingNumber || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Mã thiết bị / 設備コード</div><div class="info-value-compact">${design.EquipmentCode || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Ghi chú thiết kế</div><div class="info-value-compact">${design.VersionNote || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Có nắp / プラグ有無</div><div class="info-value-compact">${job.PlugAri || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Chạy thử / ポケット試作</div><div class="info-value-compact">${job.PocketTEST || 'N/A'}</div></div>
    `;
}

/**
 * FIXED: Display product information with proper ID and full data
 */
function displayMoldProductInfo() {
    const container = document.getElementById('productInfo');
    if (!container) return;
    
    const design = currentMold.designInfo || {};
    const job = currentMold.jobInfo || {};
    
    let productDimensions = 'N/A';
    if (design.CutlineX && design.CutlineY) {
        productDimensions = `${design.CutlineX}×${design.CutlineY}`;
    }

    container.innerHTML = `
        <div class="info-row-compact"><div class="info-label-compact">Thông tin khay / トレイ情報</div><div class="info-value-compact">${design.TrayInfoForMoldDesign || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Chất liệu / 材質</div><div class="info-value-compact">${design.DesignForPlasticType || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Kích thước SP / 製品寸法</div><div class="info-value-compact">${productDimensions}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">KL khay / トレイ重量</div><div class="info-value-compact">${design.TrayWeight ? `${design.TrayWeight} g` : 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Ngày xuất hàng đầu / 初回出荷日</div><div class="info-value-compact">${job.DeliveryDeadline ? formatDate(job.DeliveryDeadline) : 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Dao cắt riêng / 別抜き</div><div class="info-value-compact">${job.SeparateCutter || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Báo giá / 見積</div><div class="info-value-compact">${job.PriceQuote || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Đơn giá / 単価</div><div class="info-value-compact">${job.UnitPrice || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Loại thùng / 箱の種類</div><div class="info-value-compact">${job.LoaiThungDong || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Bọc túi / 袋詰め</div><div class="info-value-compact">${job.BaoNilon || 'N/A'}</div></div>
    `;
}

/**
 * Display the location history for the mold.
 */
function displayMoldLocationHistory() {
    const container = document.getElementById('locationHistory');
    if (!container) return;
    const history = currentMold.locationHistory;
    if (history && history.length > 0) {
        container.innerHTML = history.slice(0, 5).map(log => `
            <div class="history-item-compact location">
                <div class="history-header-compact">
                    <div class="history-title-compact">Vị trí thay đổi / 位置変更</div>
                    <div class="history-actions-compact">
                        <span class="history-timestamp-compact">${formatTimestamp(log.DateEntry)}</span>
                        <button class="delete-history-btn" onclick="deleteLocationHistory('${log.LocationLogID}')" title="Xóa / 削除">🗑️</button>
                    </div>
                </div>
                <div class="history-details-compact">
                    <div class="location-change">${log.OldRackLayer || 'N/A'} → ${log.NewRackLayer || 'N/A'}</div>
                    ${log.notes ? `<div class="history-notes"><strong>Ghi chú:</strong> ${log.notes}</div>` : ''}
                </div>
            </div>
        `).join('');
    } else {
        container.innerHTML = '<div class="no-data-compact">Không có lịch sử vị trí / 位置履歴がありません</div>';
    }
}

/**
 * Display the shipment history for the mold.
 */
function displayMoldShipmentHistory() {
    const container = document.getElementById('shipmentHistory');
    if (!container) return;
    const history = currentMold.shipHistory;
    if (history && history.length > 0) {
        container.innerHTML = history.slice(0, 5).map(log => {
            const from = (moldAllData.companies || []).find(c => c.CompanyID === log.FromCompanyID)?.CompanyShortName || 'N/A';
            const to = (moldAllData.companies || []).find(c => c.CompanyID === log.ToCompanyID)?.CompanyShortName || 'N/A';
            return `
                <div class="history-item-compact shipment">
                    <div class="history-header-compact">
                        <div class="history-title-compact">Vận chuyển / 出荷</div>
                        <div class="history-actions-compact">
                            <span class="history-timestamp-compact">${formatTimestamp(log.DateEntry)}</span>
                            <button class="delete-history-btn" onclick="deleteShipmentHistory('${log.ShipID}')" title="Xóa / 削除">🗑️</button>
                        </div>
                    </div>
                    <div class="history-details-compact">
                        <div class="shipment-route">${from} → ${to}</div>
                        ${log.handler ? `<div class="handler-info"><strong>Người thực hiện:</strong> ${log.handler}</div>` : ''}
                        ${log.ShipNotes ? `<div class="history-notes"><strong>Ghi chú:</strong> ${log.ShipNotes}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    } else {
        container.innerHTML = '<div class="no-data-compact">Không có lịch sử vận chuyển / 出荷履歴がありません</div>';
    }
}

/**
 * Display cutters related to the current mold.
 */
function displayMoldRelatedCutters() {
    const section = document.getElementById('relatedCuttersSection');
    const container = document.getElementById('relatedCutters');
    if (!section || !container) return;
    const cutters = currentMold.relatedCutters;
    if (cutters && cutters.length > 0) {
        container.innerHTML = cutters.map(cutter => `
            <div class="related-item-compact" onclick="window.location.href='detail-cutter.html?id=${cutter.CutterID}'">
                <div class="related-id-compact">${cutter.CutterID}</div>
                <div class="related-name-compact">${cutter.CutterNo}</div>
                <div class="related-desc-compact">${cutter.CutterName || cutter.CutterDesignName}</div>
            </div>
        `).join('');
        section.style.display = 'block';
    } else {
        section.style.display = 'none';
    }
}

/**
 * Display user comments for the mold.
 */
function displayMoldUserComments() {
    const container = document.getElementById('userComments');
    if (!container) return;
    const comments = getMoldUserCommentsFromServer(currentMold.MoldID);
    if (comments && comments.length > 0) {
        container.innerHTML = comments.slice(0, 10).map(comment => {
            const employee = (moldAllData.employees || []).find(e => e.EmployeeID === comment.EmployeeID);
            return `
                <div class="comment-item-compact">
                    <div class="comment-header-compact">
                        <div class="comment-author-compact">${employee?.EmployeeName || 'Unknown'}</div>
                        <div class="comment-actions-compact">
                            <span class="comment-timestamp-compact">${formatTimestamp(comment.DateEntry)}</span>
                            <button class="delete-comment-btn" onclick="deleteUserComment('${comment.UserCommentID}')" title="Xóa / 削除">🗑️</button>
                        </div>
                    </div>
                    <div class="comment-text-compact">${comment.CommentText}</div>
                </div>
            `;
        }).join('');
    } else {
        container.innerHTML = '<div class="no-data-compact">Không có bình luận / コメントがありません</div>';
    }
}

function getMoldUserCommentsFromServer(moldId) {
    if (!moldAllData.usercomments) return [];
    return moldAllData.usercomments
        .filter(c => c.ItemID === moldId && c.ItemType === 'mold' && c.CommentStatus === 'active')
        .sort((a, b) => new Date(b.DateEntry) - new Date(a.DateEntry));
}

// ====== LOGIC NGHIỆP VỤ: XÓA DỮ LIỆU (BUSINESS LOGIC: DATA DELETION) ======
async function deleteLocationHistory(locationLogId) {
    if (!confirm('Bạn có chắc muốn xóa lịch sử vị trí này không? / この位置履歴を削除しますか？')) return;
    try {
        showLoading(true);
        await callBackendApi('delete-log', { endpoint: 'locationlog.csv', data: { logId: locationLogId, idField: 'LocationLogID' } });
        await new Promise(resolve => setTimeout(resolve, 3000));
        await reloadMoldDataFromGitHub();
        showSuccessNotification('Đã xóa lịch sử vị trí / 位置履歴が削除されました');
    } catch (error) {
        showErrorNotification(`Xóa thất bại: ${error.message} / 削除に失敗しました`);
    } finally {
        showLoading(false);
    }
}

async function deleteShipmentHistory(shipId) {
    if (!confirm('Bạn có chắc muốn xóa lịch sử vận chuyển này không? / この出荷履歴を削除しますか？')) return;
    try {
        showLoading(true);
        await callBackendApi('delete-log', { endpoint: 'shiplog.csv', data: { logId: shipId, idField: 'ShipID' } });
        await new Promise(resolve => setTimeout(resolve, 3000));
        await reloadMoldDataFromGitHub();
        showSuccessNotification('Đã xóa lịch sử vận chuyển / 出荷履歴が削除されました');
    } catch (error) {
        showErrorNotification(`Xóa thất bại: ${error.message} / 削除に失敗しました`);
    } finally {
        showLoading(false);
    }
}

async function deleteUserComment(commentId) {
    if (!confirm('Bạn có chắc muốn xóa bình luận này không? / このコメントを削除しますか？')) return;
    try {
        showLoading(true);
        await callBackendApi('delete-comment', { endpoint: 'usercomments.csv', data: { commentId: commentId, idField: 'UserCommentID' } });
        await new Promise(resolve => setTimeout(resolve, 3000));
        await reloadMoldDataFromGitHub();
        showSuccessNotification('Đã xóa bình luận / コメントが削除されました');
    } catch (error) {
        showErrorNotification(`Xóa thất bại: ${error.message} / 削除に失敗しました`);
    } finally {
        showLoading(false);
    }
}

// ====== CÁC HÀM TIỆN ÍCH, ĐIỀN FORM, MODAL... (UTILITY, FORM POPULATION, MODALS) ======

function populateMoldFormData() {
    const rackSelect = document.getElementById('rackSelect');
    if (rackSelect) {
        rackSelect.innerHTML = '<option value="">Chọn / 選択</option>' + (moldAllData.racks?.map(r => `<option value="${r.RackID}">${r.RackSymbol} ${r.RackName} - ${r.RackLocation}</option>`).join('') || '');
    }
    ['employeeSelect', 'commentEmployeeSelect'].forEach(id => {
        const select = document.getElementById(id);
        if (select) select.innerHTML = '<option value="">Chọn / 選択</option>' + (moldAllData.employees?.map(e => `<option value="${e.EmployeeID}">${e.EmployeeName}</option>`).join('') || '');
    });
    ['toCompanySelect'].forEach(id => {
        const select = document.getElementById(id);
        if (select) select.innerHTML = '<option value="">Chọn / 選択</option>' + (moldAllData.companies?.map(c => `<option value="${c.CompanyID}">${c.CompanyShortName} - ${c.CompanyName}</option>`).join('') || '');
    });
    const shipmentDate = document.getElementById('shipmentDate');
    if (shipmentDate) shipmentDate.value = new Date().toISOString().split('T')[0];
}

function updateRackLayers() {
    const rackSelect = document.getElementById('rackSelect');
    const rackLayerSelect = document.getElementById('rackLayerSelect');
    if (!rackSelect || !rackLayerSelect) return;
    const selectedRackId = rackSelect.value;
    rackLayerSelect.innerHTML = '<option value="">Chọn / 選択</option>';
    if (selectedRackId) {
        const layers = moldAllData.racklayers?.filter(layer => layer.RackID === selectedRackId);
        rackLayerSelect.innerHTML += layers?.map(l => `<option value="${l.RackLayerID}">${l.RackLayerNumber}${l.RackLayerNotes ? ` - ${l.RackLayerNotes}` : ''}</option>`).join('') || '';
    }
}

/**
 * FIXED: Enhanced status logic - Priority: MoldReturning > MoldDisposing > MoldNotes
 */
function getEnhancedMoldStatus(mold) {
    // Check MoldReturning first
    if (mold.MoldReturning && mold.MoldReturning.trim() !== '' && mold.MoldReturning !== 'FALSE') {
        return { status: 'returned', text: mold.MoldReturning, class: 'status-returned' };
    }
    // Check MoldDisposing second
    if (mold.MoldDisposing && mold.MoldDisposing.trim() !== '' && mold.MoldDisposing !== 'FALSE') {
        return { status: 'disposed', text: mold.MoldDisposing, class: 'status-inactive' };
    }
    // Use MoldNotes as fallback
    if (mold.MoldNotes && mold.MoldNotes.trim() !== '') {
        return { status: 'notes', text: mold.MoldNotes, class: 'status-notes' };
    }
    // Default status based on shipment
    const history = getMoldShipHistory(mold.MoldID);
    if (history.length > 0 && history[0].ToCompanyID && history[0].ToCompanyID !== '2') {
        return { status: 'shipped', text: 'Có lịch sử chuyển khuôn / 出荷履歴有', class: 'status-shipped' };
    }
    return { status: 'available', text: 'Có sẵn / 利用可能', class: 'status-active' };
}

/**
 * Gets the original YSD location for display in header when mold is shipped out
 */
// ===== ユーティリティ関数 (HÀM TIỆN ÍCH) =====
function getOriginalYSDLocation() {
    const history = getMoldLocationHistory(currentMold.MoldID);
    const lastKnownYSDLog = history.find(log => log.NewRackLayer);

    if (lastKnownYSDLog) {
        const layer = moldAllData.racklayers?.find(l => l.RackLayerID === lastKnownYSDLog.NewRackLayer);
        const rack = layer ? moldAllData.racks?.find(r => r.RackID === layer.RackID) : null;

        if (rack && layer) {
            return `(${rack.RackLocation})　<span class="rack-circle">${rack.RackID}</span> - ${layer.RackLayerNumber} `;
        }
    }

    // Fallback to current position if available
    if (currentMold.rackInfo && currentMold.rackLayerInfo) {
        return `<span class="rack-circle">${currentMold.rackInfo.RackID}</span> - ${currentMold.rackLayerInfo.RackLayerNumber}層 (${currentMold.rackInfo.RackLocation})`;
    }

    return 'Không rõ';
}

function getMoldCurrentStatus(mold) {
    return getEnhancedMoldStatus(mold);
}

// ===== 関連カッター取得 (LẤY DAO CẮT LIÊN QUAN) - ENHANCED DEBUG =====
function getMoldRelatedCutters(moldID) {
    try {
        console.log('=== Debug getMoldRelatedCutters ===');
        console.log('Input moldID:', moldID);
        
        // Kiểm tra dữ liệu cơ bản
        if (!moldID) {
            console.log('ERROR: No moldID provided');
            return [];
        }
        
        if (!moldAllData.moldcutter) {
            console.log('ERROR: No moldcutter data available');
            return [];
        }
        
        if (!moldAllData.molds) {
            console.log('ERROR: No molds data available');  
            return [];
        }
        
        // Bước 1: Tìm MoldDesignID từ MoldID
        const mold = moldAllData.molds.find(m => {
            // Convert to string for comparison
            return String(m.MoldID).trim() === String(moldID).trim();
        });
        
        console.log('Found mold:', mold);
        
        if (!mold) {
            console.log('ERROR: No mold found with ID:', moldID);
            return [];
        }
        
        if (!mold.MoldDesignID) {
            console.log('ERROR: Mold found but no MoldDesignID:', mold);
            return [];
        }
        
        const moldDesignID = String(mold.MoldDesignID).trim();
        console.log('MoldDesignID to search:', moldDesignID);
        
        // Bước 2: Tìm các CutterID từ MoldDesignID trong moldcutter.csv
        const cutterRelations = moldAllData.moldcutter.filter(mc => {
            const mcDesignID = String(mc.MoldDesignID || '').trim();
            const match = mcDesignID === moldDesignID;
            if (match) {
                console.log('Found matching relation:', mc);
            }
            return match;
        });
        
        console.log('Total relations found:', cutterRelations.length);
        
        if (cutterRelations.length === 0) {
            console.log('No cutter relations found for MoldDesignID:', moldDesignID);
            // Debug: show some sample moldcutter records
            console.log('Sample moldcutter records:', moldAllData.moldcutter.slice(0, 5));
            return [];
        }
        
        // Bước 3: Lấy thông tin chi tiết các dao cắt
        const relatedCutters = cutterRelations.map(rel => {
            const cutterID = String(rel.CutterID || '').trim();
            const cutter = moldAllData.cutters?.find(c => 
                String(c.CutterID || '').trim() === cutterID
            );
            
            console.log(`Looking for cutter ${cutterID}:`, cutter ? 'FOUND' : 'NOT FOUND');
            
            if (cutter) {
                return {
                    ...cutter,
                    relationInfo: rel
                };
            }
            return null;
        }).filter(Boolean);
        
        console.log('Final result:', relatedCutters.length, 'cutters');
        return relatedCutters;
        
    } catch (error) {
        console.error('Error in getMoldRelatedCutters:', error);
        return [];
    }
}


// ===== 金型デザイン関連カッター取得 (LẤY DAO CẮT THEO THIẾT KẾ KHUÔN) =====
function getCuttersByMoldDesignID(moldDesignID) {
    if (!moldDesignID || !moldAllData.moldcutter) return [];
    
    const cutterRelations = moldAllData.moldcutter.filter(mc => mc.MoldDesignID === moldDesignID);
    
    return cutterRelations.map(rel => {
        const cutter = moldAllData.cutters?.find(c => c.CutterID === rel.CutterID);
        return cutter ? { ...cutter, relationInfo: rel } : null;
    }).filter(Boolean);
}

// ===== 金型とカッターの関係確認 (KIỂM TRA QUAN HỆ KHUÔN - DAO CẮT) =====
function isMoldCutterRelated(moldID, cutterID) {
    const mold = moldAllData.molds?.find(m => m.MoldID === moldID);
    if (!mold || !mold.MoldDesignID) return false;
    
    return moldAllData.moldcutter?.some(mc => 
        mc.MoldDesignID === mold.MoldDesignID && mc.CutterID === cutterID
    ) || false;
}

function getMoldShipHistory(moldID) {
    if (!moldID || !moldAllData.shiplog) return [];
    return moldAllData.shiplog.filter(log => log.MoldID === moldID).sort((a, b) => new Date(b.DateEntry) - new Date(a.DateEntry));
}

function getMoldLocationHistory(moldID) {
    if (!moldID || !moldAllData.locationlog) return [];
    return moldAllData.locationlog.filter(log => log.MoldID === moldID).sort((a, b) => new Date(b.DateEntry) - new Date(a.DateEntry));
}

function formatTimestamp(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    } catch (e) { return dateString; }
}

function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString('ja-JP');
    } catch { return dateString; }
}

// Fallback comment functionality using localStorage
function loadMoldUserComments() {
    try { moldUserComments = JSON.parse(localStorage.getItem('moldUserComments')) || []; }
    catch (e) { moldUserComments = []; }
}

// ===== MODAL, LOADING, NOTIFICATION CONTROLS =====
function showLocationModal() { document.getElementById('locationModal').style.display = 'flex'; }
function hideLocationModal() { document.getElementById('locationModal').style.display = 'none'; }
function showShipmentModal() { document.getElementById('shipmentModal').style.display = 'flex'; }
function hideShipmentModal() { document.getElementById('shipmentModal').style.display = 'none'; }
function showCommentModal() { document.getElementById('commentModal').style.display = 'flex'; }
function hideCommentModal() { document.getElementById('commentModal').style.display = 'none'; }

function showLoading(show) {
  const loading = document.getElementById('loadingIndicator');
  if (loading) loading.style.display = show ? 'flex' : 'none';
}
function showError(message) {
  const errorContainer = document.getElementById('errorContainer');
  if (errorContainer) {
    errorContainer.textContent = message;
    errorContainer.style.display = 'block';
    setTimeout(() => errorContainer.style.display = 'none', 5000);
  } else {
    alert(message);
  }
}
function showSuccessNotification(message) { showNotification(message, 'success'); }
function showErrorNotification(message) { showNotification(message, 'error'); }
function showNotification(message, type = 'info') {
  const existing = document.querySelectorAll('.notification-toast');
  existing.forEach(n => n.remove());
  const notification = document.createElement('div');
  notification.className = `notification-toast ${type}`;
  notification.innerHTML = `<div class="notification-content"><span class="notification-icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span><span class="notification-message">${message}</span></div><button class="notification-close" onclick="this.parentElement.remove()">×</button>`;
  document.body.appendChild(notification);
  setTimeout(() => { if (notification.parentElement) notification.remove(); }, 5000);
}

// ===== CSV PARSER =====
function parseCSV(csv) {
  const lines = csv.split('\n').filter(line => line.trim() !== '');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  return lines.slice(1).map(line => {
    const values = [];
    let current = '', inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' && (i === 0 || line[i-1] !== '\\')) inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) { values.push(current.trim().replace(/"/g, '')); current = ''; }
      else current += char;
    }
    values.push(current.trim().replace(/"/g, ''));
    const obj = {};
    headers.forEach((header, index) => { obj[header] = values[index] !== undefined ? values[index] : ''; });
    return obj;
  });
}

// ===== NAVIGATION & OTHER ACTIONS =====
function goBack() {
  if (document.referrer && document.referrer.includes(window.location.hostname)) window.history.back();
  else window.location.href = 'index.html';
}
function printDetail() { window.print(); }
function showQuickEditModal() { showNotification('Quick Edit機能は開発中です (Chức năng Quick Edit đang phát triển)', 'info'); }

// ===== END OF FILE =====

// ===== NAVIGATION & OTHER ACTIONS =====
function goBack() {
  if (document.referrer && document.referrer.includes(window.location.hostname)) window.history.back();
  else window.location.href = 'index.html';
}
function printDetail() { window.print(); }
function showQuickEditModal() { showNotification('Quick Edit機能は開発中です (Chức năng Quick Edit đang phát triển)', 'info'); }

// ===== END OF FILE =====
console.log('detail-mold.js V4.32 - Professional Desktop Layout - No Auto-refresh - Production Ready - Fully loaded and complete.');

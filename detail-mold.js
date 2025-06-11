// detail-mold.js - V4.31 Production Ready
// Complete implementation with enhanced business logic and full data display

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
    // Start auto-refresh after 1 minute to allow initial load to settle
    setTimeout(startAutoRefresh, 60000);
});

// ===== TỰ ĐỘNG LÀM MỚI DỮ LIỆU (AUTO REFRESH LOGIC) =====
let autoRefreshInterval = null;

function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(async () => {
        console.log('Auto-refreshing mold data from GitHub...');
        if (currentMold) {
            await reloadMoldDataFromGitHub();
        }
    }, 30000); // 30 seconds
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

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

async function reloadMoldDataFromGitHub() {
    console.log('Reloading mold data from GitHub...');
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
        await new Promise(resolve => setTimeout(resolve, 2000));
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

        await new Promise(resolve => setTimeout(resolve, 2000));
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

        await new Promise(resolve => setTimeout(resolve, 2000));
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
 * Main function to orchestrate the display of all mold data on the page.
 */
function displayMoldDetailData() {
    if (!currentMold) return;

    // Update the main header with enhanced logic
    displayEnhancedHeader();
    
    // Display the 4 main information groups as requested
    displaySummaryInfo();      // Nhóm thông tin tổng hợp
    displayStatusInfo();       // Nhóm trạng thái
    displayTechnicalInfo();    // Nhóm thông số kỹ thuật  
    displayProductInfo();      // Nhóm thông tin sản phẩm khay

    // Display history and comments (keep existing structure)
    displayMoldLocationHistory();
    displayMoldShipmentHistory();
    displayMoldRelatedCutters();
    displayMoldUserComments();
}

/**
 * NEW: Enhanced header display with original YSD location when shipped out
 */
function displayEnhancedHeader() {
    const moldTitle = document.getElementById('moldTitle');
    if (moldTitle) {
        moldTitle.textContent = currentMold.MoldName || currentMold.MoldCode;
    }

    const storageInfo = document.getElementById('storageInfo');
    if (storageInfo) {
        const storageCompany = currentMold.storageCompanyInfo;
        const rackLayer = currentMold.rackLayerInfo;
        const rack = currentMold.rackInfo;
        
        let storageText = storageCompany ? `${storageCompany.CompanyShortName} - ${storageCompany.CompanyName}` : 'N/A';
        
        // NEW LOGIC: Show original YSD location when shipped out
        if (currentMold.storage_company !== '2' && storageCompany) {
            const originalLocation = getOriginalYSDLocation();
            storageText = `${storageCompany.CompanyShortName} - (YSD: ${originalLocation})`;
        } else if (currentMold.storage_company === '2' && rackLayer && rack) {
            storageText += ` | <span class="rack-circle-header mold">${rack.RackID}</span> ${rackLayer.RackLayerNumber} (${rack.RackLocation})`;
        }
        
        storageInfo.innerHTML = storageText;
    }
}

/**
 * NEW: Display Summary Information Group (Nhóm thông tin tổng hợp)
 */
function displaySummaryInfo() {
    const container = document.getElementById('summaryInfo');
    if (!container) return;
    
    const design = currentMold.designInfo || {};
    const job = currentMold.jobInfo || {};
    const status = getEnhancedMoldStatus(currentMold);
    const originalLocation = getOriginalYSDLocation();
    
    // Calculate dimensions
    let moldDimensions = 'N/A';
    if (design.MoldDesignLength && design.MoldDesignWidth && design.MoldDesignHeight) {
        moldDimensions = `${design.MoldDesignLength}×${design.MoldDesignWidth}×${design.MoldDesignHeight}`;
    } else if (design.MoldDesignDim) {
        moldDimensions = design.MoldDesignDim;
    }
    
    let productDimensions = 'N/A';
    if (design.CutlineX && design.CutlineY) {
        productDimensions = `${design.CutlineX}×${design.CutlineY}`;
    }
    
    const firstShipDate = job.DeliveryDeadline ? formatDate(job.DeliveryDeadline) : 'N/A';

    container.innerHTML = `
        <div class="info-row-compact"><div class="info-label-compact">Tên khuôn / 金型名</div><div class="info-value-compact">${currentMold.MoldName || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Trạng thái / ステータス</div><div class="info-value-compact ${status.class}">${status.text}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Vị trí gốc YSD</div><div class="info-value-compact">${originalLocation}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Thông tin khay / トレイ情報</div><div class="info-value-compact">${design.TrayInfoForMoldDesign || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Chất liệu / 材質</div><div class="info-value-compact">${design.DesignForPlasticType || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Ngày sản xuất / 製造日</div><div class="info-value-compact">${firstShipDate}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Số mặt / 取り数</div><div class="info-value-compact">${design.PieceCount || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Kích thước / 寸法</div><div class="info-value-compact">${moldDimensions}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Khối lượng khuôn / 重量</div><div class="info-value-compact">${currentMold.MoldWeight ? `${currentMold.MoldWeight} kg` : 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Kích thước SP / 製品寸法</div><div class="info-value-compact">${productDimensions}</div></div>
    `;
}

/**
 * NEW: Display Status Information Group (Nhóm trạng thái)
 */
function displayStatusInfo() {
    const container = document.getElementById('statusInfo');
    if (!container) return;

    container.innerHTML = `
        <div class="info-row-compact"><div class="info-label-compact">Mạ Teflon / テフロン</div><div class="info-value-compact">${currentMold.TeflonCoating || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Trả lại KH / 返却</div><div class="info-value-compact">${currentMold.MoldReturning || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Hủy khuôn / 廃棄</div><div class="info-value-compact">${currentMold.MoldDisposing || 'N/A'}</div></div>
    `;
}

/**
 * NEW: Display Technical Information Group (Nhóm thông số kỹ thuật)
 */
function displayTechnicalInfo() {
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
        <div class="info-row-compact"><div class="info-label-compact">Chữ khắc / 刻印</div><div class="info-value-compact">${design.TextContent || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Dung sai X,Y / 公差</div><div class="info-value-compact">${design.TolerenceX || 'N/A'}, ${design.TolerenceY || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Số bản vẽ / 図面番号</div><div class="info-value-compact">${design.DrawingNumber || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Mã thiết bị / 設備コード</div><div class="info-value-compact">${design.EquipmentCode || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Ghi chú thiết kế</div><div class="info-value-compact">${design.VersionNote || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Có nắp / プラグ有無</div><div class="info-value-compact">${job.PlugAri || 'N/A'}</div></div>
        <div class="info-row-compact"><div class="info-label-compact">Chạy thử / ポケット試作</div><div class="info-value-compact">${job.PocketTEST || 'N/A'}</div></div>
    `;
}

/**
 * NEW: Display Product Information Group (Nhóm thông tin sản phẩm khay)
 */
function displayProductInfo() {
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
        await new Promise(resolve => setTimeout(resolve, 2000));
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
        await new Promise(resolve => setTimeout(resolve, 2000));
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
        await new Promise(resolve => setTimeout(resolve, 2000));
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
 * NEW: Enhanced status logic - Priority: MoldReturning > MoldDisposing > MoldNotes
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
        return { status: 'shipped', text: 'Đang vận chuyển / 出荷中', class: 'status-shipped' };
    }
    return { status: 'available', text: 'Có sẵn / 利用可能', class: 'status-active' };
}

/**
 * NEW: Gets the original YSD location for display in header when mold is shipped out
 */
function getOriginalYSDLocation() {
    const history = getMoldLocationHistory(currentMold.MoldID);
    const lastKnownYSDLog = history.find(log => log.NewRackLayer);
    if (lastKnownYSDLog) {
        const layer = moldAllData.racklayers?.find(l => l.RackLayerID === lastKnownYSDLog.NewRackLayer);
        const rack = layer ? moldAllData.racks?.find(r => r.RackID === layer.RackID) : null;
        if (rack && layer) {
            return `${rack.RackLocation || rack.RackID}-${layer.RackLayerNumber}`;
        }
    }
    // Fallback to current position if available
    if (currentMold.rackInfo && currentMold.rackLayerInfo) {
        return `${currentMold.rackInfo.RackLocation || currentMold.rackInfo.RackID}-${currentMold.rackLayerInfo.RackLayerNumber}`;
    }
    return 'Không rõ / 不明';
}

function getMoldCurrentStatus(mold) {
    return getEnhancedMoldStatus(mold);
}

function getMoldRelatedCutters(moldID) {
    if (!moldID || !moldAllData.moldcutter) return [];
    const relations = moldAllData.moldcutter.filter(mc => mc.MoldID === moldID);
    return relations.map(rel => moldAllData.cutters?.find(c => c.CutterID === rel.CutterID)).filter(Boolean) || [];
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
console.log('detail-mold.js V4.31 - Production Ready with Enhanced Business Logic - Fully loaded and complete.');

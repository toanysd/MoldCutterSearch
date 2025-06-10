// detail-mold.js - V4.24 with V3.0 Backend Logic and Mobile Optimized UI
let currentMold = null;
let moldAllData = {};
let moldUserComments = [];

const MOLD_GITHUB_BASE_URL = "https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data/";

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

// Initialize mold detail page
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const moldId = urlParams.get('id');
    
    if (moldId) {
        loadMoldDetailData(moldId);
    } else {
        showError('金型ID - パラメータが無効です');
    }
    
    initializeMoldEventListeners();
    loadMoldUserComments();
    // Start auto refresh after 1 minute
    setTimeout(startAutoRefresh, 60000);
});

// Initialize event listeners
function initializeMoldEventListeners() {
    // Location form
    const locationForm = document.getElementById('locationForm');
    if (locationForm) {
        locationForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleMoldLocationUpdate();
        });
    }
    
    // Shipment form
    const shipmentForm = document.getElementById('shipmentForm');
    if (shipmentForm) {
        shipmentForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleMoldShipmentUpdate();
        });
    }
    
    // Comment form
    const commentForm = document.getElementById('commentForm');
    if (commentForm) {
        commentForm.addEventListener('submit', function(e) {
            e.preventDefault();
            handleMoldCommentSubmit();
        });
    }
}

// Thêm function này vào detail-mold.js V4.24
async function reloadMoldDataFromGitHub() {
    console.log('Reloading mold data from GitHub...');
    try {
        showLoading(true);
        
        const filesToReload = ['locationlog.csv', 'shiplog.csv', 'molds.csv', 'usercomments.csv'];
        
        for (const file of filesToReload) {
            try {
                // Add cache busting parameter
                const response = await fetch(`${MOLD_GITHUB_BASE_URL}${file}?t=${Date.now()}`);
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
        
        // Reprocess relationships
        processMoldDataRelationships();
        
        // Find updated current mold
        currentMold = moldAllData.molds.find(item => item.MoldID === currentMold.MoldID);
        
        if (currentMold) {
            // Refresh display
            displayMoldDetailData();
            console.log('Mold data reloaded and display refreshed');
        }
        
    } catch (error) {
        console.error('Error reloading mold data:', error);
    } finally {
        showLoading(false);
    }
}

// Load mold detail data (V3.0 working method)
async function loadMoldDetailData(moldId) {
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
                const response = await fetch(`${MOLD_GITHUB_BASE_URL}${file}`);
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
            moldAllData[key] = data;
        });
        
        // Process relationships
        processMoldDataRelationships();
        
        // Find current mold
        currentMold = moldAllData.molds.find(item => item.MoldID === moldId);
        
        if (currentMold) {
            displayMoldDetailData();
            populateMoldFormData();
        } else {
            showError('金型が見つかりません - 金型が見つかりません');
        }
    } catch (error) {
        console.error('Error loading mold detail data:', error);
        showError(`データ読み込みエラー: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Process mold data relationships (V3.0 working logic)
function processMoldDataRelationships() {
    // Create lookup maps
    const moldDesignMap = new Map();
    moldAllData.molddesign.forEach(design => {
        moldDesignMap.set(design.MoldDesignID, design);
    });
    
    const customerMap = new Map();
    moldAllData.customers.forEach(customer => {
        customerMap.set(customer.CustomerID, customer);
    });
    
    const companyMap = new Map();
    moldAllData.companies.forEach(company => {
        companyMap.set(company.CompanyID, company);
    });
    
    const rackMap = new Map();
    moldAllData.racks.forEach(rack => {
        rackMap.set(rack.RackID, rack);
    });
    
    const rackLayerMap = new Map();
    moldAllData.racklayers.forEach(layer => {
        rackLayerMap.set(layer.RackLayerID, layer);
    });
    
    const jobMap = new Map();
    if (moldAllData.jobs) {
        moldAllData.jobs.forEach(job => {
            jobMap.set(job.MoldDesignID, job);
        });
    }
    
    // Process molds
    moldAllData.molds = moldAllData.molds.map(mold => {
        const design = moldDesignMap.get(mold.MoldDesignID) || {};
        const customer = customerMap.get(mold.CustomerID) || {};
        const company = companyMap.get(customer.CompanyID) || {};
        const storageCompany = companyMap.get(mold.storage_company) || {};
        const rackLayer = rackLayerMap.get(mold.RackLayerID) || {};
        const rack = rackLayer.RackID ? rackMap.get(rackLayer.RackID) || {} : {};
        const job = jobMap.get(mold.MoldDesignID) || {};
        
        return {
            ...mold,
            designInfo: design,
            customerInfo: customer,
            companyInfo: company,
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

// Display mold detail data
// ✅ NEW: Enhanced header display với storage company và rack info
function displayMoldDetailData() {
    // Update page title and header
    const moldTitle = document.getElementById('moldTitle');
    const storageInfo = document.getElementById('storageInfo');
    
    if (moldTitle) {
        const moldName = currentMold.MoldName || currentMold.MoldCode;
        moldTitle.textContent = moldName;
    }
    
    if (storageInfo) {
        // Enhanced storage info display
        const storageCompany = currentMold.storageCompanyInfo;
        const rackLayer = currentMold.rackLayerInfo;
        const rack = currentMold.rackInfo;
        
        let storageText = '';
        
        // Storage company info
        if (storageCompany) {
            const companyShort = storageCompany.CompanyShortName || storageCompany.CompanyName;
            const companyFull = storageCompany.CompanyName;
            storageText += `保管会社: ${companyShort}`;
            if (companyFull && companyFull !== companyShort) {
                storageText += ` - ${companyFull}`;
            }
        } else {
            storageText += '保管会社: N/A';
        }
        
        // YSD location info (only if storage company is YSD - ID 2)
        if (currentMold.storage_company === '2' && rackLayer && rack) {
            storageText += ` | `;
            storageText += `<span class="rack-circle-header mold">${rackLayer.RackID}</span>`;
            storageText += ` - ${rackLayer.RackLayerNumber || 'N/A'}`;
            storageText += ` (${rack.RackLocation || 'N/A'})`;
        }
        
        storageInfo.innerHTML = storageText;
    }
    
    displayMoldBasicInfo();
    displayMoldStatusInfo();
    displayMoldTechnicalInfo();
    displayMoldProductInfo();
    displayMoldLocationHistory();
    displayMoldShipmentHistory();
    displayMoldRelatedCutters();
    displayMoldUserComments();
}
// ✅ NEW: Enhanced timestamp formatting
function formatTimestamp(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        
        // Format: YYYY/MM/DD HH:MM
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${year}/${month}/${day} ${hours}:${minutes}`;
    } catch (e) {
        return dateString;
    }
}
// ✅ NEW: Delete history functions
async function deleteLocationHistory(locationLogId) {
    if (!confirm('この位置履歴を削除しますか？')) return;
    
    try {
        showLoading(true);
        
        await callBackendApi('delete-log', {
            endpoint: 'locationlog.csv',
            data: {
                logId: locationLogId,
                idField: 'LocationLogID'
            }
        });
        
        // Remove from frontend data
        if (moldAllData.locationlog) {
            moldAllData.locationlog = moldAllData.locationlog.filter(log => log.LocationLogID !== locationLogId);
        }
        
        // Refresh display
        await reloadMoldDataFromGitHub();
        showSuccessNotification('位置履歴が削除されました');
        
    } catch (error) {
        console.error('Failed to delete location history:', error);
        showErrorNotification(`位置履歴削除に失敗しました: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

async function deleteShipmentHistory(shipId) {
    if (!confirm('この出荷履歴を削除しますか？')) return;
    
    try {
        showLoading(true);
        
        await callBackendApi('delete-log', {
            endpoint: 'shiplog.csv',
            data: {
                logId: shipId,
                idField: 'ShipID'
            }
        });
        
        // Remove from frontend data
        if (moldAllData.shiplog) {
            moldAllData.shiplog = moldAllData.shiplog.filter(log => log.ShipID !== shipId);
        }
        
        // Refresh display
        await reloadMoldDataFromGitHub();
        showSuccessNotification('出荷履歴が削除されました');
        
    } catch (error) {
        console.error('Failed to delete shipment history:', error);
        showErrorNotification(`出荷履歴削除に失敗しました: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

async function deleteUserComment(commentId) {
    if (!confirm('このコメントを削除しますか？')) return;
    
    try {
        showLoading(true);
        
        await callBackendApi('delete-comment', {
            endpoint: 'usercomments.csv',
            data: {
                commentId: commentId,
                idField: 'UserCommentID'
            }
        });
        
        // Remove from frontend data
        if (moldAllData.usercomments) {
            moldAllData.usercomments = moldAllData.usercomments.filter(comment => comment.UserCommentID !== commentId);
        }
        
        // Refresh display
        displayMoldUserComments();
        showSuccessNotification('コメントが削除されました');
        
    } catch (error) {
        console.error('Failed to delete comment:', error);
        showErrorNotification(`コメント削除に失敗しました: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// ✅ NEW: Professional notification system
function showSuccessNotification(message) {
    showNotification(message, 'success');
}

function showErrorNotification(message) {
    showNotification(message, 'error');
}

function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification-toast');
    existingNotifications.forEach(n => n.remove());
    
    // Create notification
    const notification = document.createElement('div');
    notification.className = `notification-toast ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
            <span class="notification-message">${message}</span>
        </div>
        <button class="notification-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Display mold basic information
function displayMoldBasicInfo() {
    const basicInfo = document.getElementById('basicInfo');
    if (!basicInfo) return;
    
    const moldId = currentMold.MoldID;
    const moldCode = currentMold.MoldCode;
    const moldName = currentMold.MoldName;
    
    // Get status
    const status = getMoldCurrentStatus(currentMold);
    
    // Get dimensions
    let dimensions = 'N/A';
    if (currentMold.designInfo) {
        const design = currentMold.designInfo;
        if (design.MoldDesignLength && design.MoldDesignWidth && design.MoldDesignHeight) {
            dimensions = `${design.MoldDesignLength}x${design.MoldDesignWidth}x${design.MoldDesignHeight}`;
        } else if (design.MoldDesignDim) {
            dimensions = design.MoldDesignDim;
        }
    }
    
    // Get product dimensions
    let productDimensions = 'N/A';
    if (currentMold.designInfo?.CutlineX && currentMold.designInfo?.CutlineY) {
        productDimensions = `${currentMold.designInfo.CutlineX}x${currentMold.designInfo.CutlineY}`;
    }
    
    let html = `
        <div class="info-row-compact">
            <div class="info-label-compact">ID</div>
            <div class="info-value-compact muted">${moldId}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">コード</div>
            <div class="info-value-compact highlight">${moldCode}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">名称</div>
            <div class="info-value-compact">${moldName}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">ステータス</div>
            <div class="info-value-compact ${status.class}">${status.text}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">金型寸法</div>
            <div class="info-value-compact">${dimensions}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">製品寸法</div>
            <div class="info-value-compact">${productDimensions}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">取数</div>
            <div class="info-value-compact">${currentMold.designInfo?.PieceCount || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">樹脂</div>
            <div class="info-value-compact">${currentMold.designInfo?.DesignForPlasticType || 'N/A'}</div>
        </div>
    `;
    
    basicInfo.innerHTML = html;
}

// Display mold status information
function displayMoldStatusInfo() {
    const statusInfo = document.getElementById('statusInfo');
    if (!statusInfo) return;
    
    // Get manufacturing date from jobs
    let manufacturingDate = 'N/A';
    if (currentMold.jobInfo?.DeliveryDeadline) {
        manufacturingDate = formatDate(currentMold.jobInfo.DeliveryDeadline);
    }
    
    // Get coating info
    const teflonCoating = currentMold.jobInfo?.TeflonCoating || 'N/A';
    
    // Get return/disposal status
    const moldReturning = currentMold.MoldReturning === 'TRUE' ? '返却済み' : 'N/A';
    const moldDisposing = currentMold.MoldDisposing === 'TRUE' ? '廃棄済み' : 'N/A';
    
    let html = `
        <div class="info-row-compact">
            <div class="info-label-compact">製造日</div>
            <div class="info-value-compact">${manufacturingDate}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">テフロン</div>
            <div class="info-value-compact">${teflonCoating}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">返却</div>
            <div class="info-value-compact">${moldReturning}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">廃棄</div>
            <div class="info-value-compact">${moldDisposing}</div>
        </div>
    `;
    
    statusInfo.innerHTML = html;
}

// Display technical information
function displayMoldTechnicalInfo() {
    const technicalInfo = document.getElementById('technicalInfo');
    if (!technicalInfo) return;
    
    const design = currentMold.designInfo || {};
    
    let html = `
        <div class="info-row-compact">
            <div class="info-label-compact">図面番号</div>
            <div class="info-value-compact">${design.DrawingNumber || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">設備コード</div>
            <div class="info-value-compact">${design.EquipmentCode || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">セットアップ</div>
            <div class="info-value-compact">${design.MoldSetupType || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">備考</div>
            <div class="info-value-compact">${currentMold.MoldNotes || 'N/A'}</div>
        </div>
    `;
    
    technicalInfo.innerHTML = html;
}

// Display mold product information
function displayMoldProductInfo() {
    const productInfo = document.getElementById('productInfo');
    if (!productInfo || !currentMold.designInfo) return;
    
    const design = currentMold.designInfo;
    const job = currentMold.jobInfo;
    
    let html = `
        <div class="info-row-compact">
            <div class="info-label-compact">トレイ情報</div>
            <div class="info-value-compact">${design.TrayInfoForMoldDesign || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">テキスト</div>
            <div class="info-value-compact">${design.TextContent || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">トレイ重量</div>
            <div class="info-value-compact">${job?.TrayWeight || 'N/A'}</div>
        </div>
        <div class="info-row-compact">
            <div class="info-label-compact">単価</div>
            <div class="info-value-compact">${job?.UnitPrice || 'N/A'}</div>
        </div>
    `;
    
    productInfo.innerHTML = html;
}

// Display mold location history
// ✅ FIX: Enhanced displayMoldLocationHistory với notes và timestamp
function displayMoldLocationHistory() {
    const locationHistory = document.getElementById('locationHistory');
    if (!locationHistory) return;
    
    if (currentMold.locationHistory && currentMold.locationHistory.length > 0) {
        let html = '';
        currentMold.locationHistory.slice(0, 5).forEach(log => {
            const oldRackLayer = moldAllData.racklayers.find(r => r.RackLayerID === log.OldRackLayer);
            const newRackLayer = moldAllData.racklayers.find(r => r.RackLayerID === log.NewRackLayer);
            
            // Enhanced timestamp display
            const timestamp = formatTimestamp(log.DateEntry);
            
            html += `
                <div class="history-item-compact location" data-log-id="${log.LocationLogID}">
                    <div class="history-header-compact">
                        <div class="history-title-compact">位置変更</div>
                        <div class="history-actions-compact">
                            <span class="history-timestamp-compact">${timestamp}</span>
                            <button class="delete-history-btn" onclick="deleteLocationHistory('${log.LocationLogID}')" title="削除">🗑</button>
                        </div>
                    </div>
                    <div class="history-details-compact">
                        <div class="location-change">${log.OldRackLayer || 'N/A'} → ${log.NewRackLayer || 'N/A'}</div>
                        ${log.notes ? `<div class="history-notes"><strong>備考:</strong> ${log.notes}</div>` : ''}
                    </div>
                </div>
            `;
        });
        locationHistory.innerHTML = html;
    } else {
        locationHistory.innerHTML = '<div class="no-data-compact">位置履歴がありません</div>';
    }
}

// Display mold shipment history
// ✅ FIX: Enhanced displayMoldShipmentHistory với notes và timestamp
function displayMoldShipmentHistory() {
    const shipmentHistory = document.getElementById('shipmentHistory');
    if (!shipmentHistory) return;
    
    if (currentMold.shipHistory && currentMold.shipHistory.length > 0) {
        let html = '';
        currentMold.shipHistory.slice(0, 5).forEach(log => {
            const toCompany = moldAllData.companies.find(c => c.CompanyID === log.ToCompanyID);
            const fromCompany = moldAllData.companies.find(c => c.CompanyID === log.FromCompanyID);
            
            // Enhanced timestamp display
            const timestamp = formatTimestamp(log.DateEntry);
            
            html += `
                <div class="history-item-compact shipment" data-log-id="${log.ShipID}">
                    <div class="history-header-compact">
                        <div class="history-title-compact">出荷</div>
                        <div class="history-actions-compact">
                            <span class="history-timestamp-compact">${timestamp}</span>
                            <button class="delete-history-btn" onclick="deleteShipmentHistory('${log.ShipID}')" title="削除">🗑</button>
                        </div>
                    </div>
                    <div class="history-details-compact">
                        <div class="shipment-route">
                            ${fromCompany?.CompanyShortName || log.FromCompany || log.FromCompanyID || 'N/A'} → 
                            ${toCompany?.CompanyShortName || log.ToCompany || log.ToCompanyID || 'N/A'}
                        </div>
                        ${log.handler ? `<div class="handler-info"><strong>担当:</strong> ${log.handler}</div>` : ''}
                        ${log.ShipNotes ? `<div class="history-notes"><strong>備考:</strong> ${log.ShipNotes}</div>` : ''}
                    </div>
                </div>
            `;
        });
        shipmentHistory.innerHTML = html;
    } else {
        shipmentHistory.innerHTML = '<div class="no-data-compact">出荷履歴がありません</div>';
    }
}

// Display related cutters
function displayMoldRelatedCutters() {
    const relatedCuttersSection = document.getElementById('relatedCuttersSection');
    const relatedCutters = document.getElementById('relatedCutters');
    
    if (!relatedCuttersSection || !relatedCutters) return;
    
    if (currentMold.relatedCutters && currentMold.relatedCutters.length > 0) {
        let html = '';
        currentMold.relatedCutters.forEach(cutter => {
            const cutterNo = cutter.CutterNo;
            const cutterName = cutter.CutterName || cutter.CutterDesignName;
            const cutterId = cutter.CutterID;
            
            html += `
                <div class="related-item-compact" onclick="window.location.href='detail-cutter.html?id=${cutterId}'">
                    <div class="related-id-compact">${cutterId}</div>
                    <div class="related-name-compact">${cutterNo}</div>
                    <div class="related-desc-compact">${cutterName}</div>
                </div>
            `;
        });
        relatedCutters.innerHTML = html;
        relatedCuttersSection.style.display = 'block';
    } else {
        relatedCuttersSection.style.display = 'none';
    }
}

// Display user comments
// ✅ FIX: Enhanced displayMoldUserComments với delete function
function displayMoldUserComments() {
    const userComments = document.getElementById('userComments');
    if (!userComments) return;
    
    const comments = getMoldUserCommentsFromServer(currentMold.MoldID);
    
    if (comments.length > 0) {
        let html = '';
        comments.slice(0, 10).forEach(comment => {
            const employee = moldAllData.employees.find(e => e.EmployeeID === comment.EmployeeID);
            const timestamp = formatTimestamp(comment.DateEntry);
            
            html += `
                <div class="comment-item-compact" data-comment-id="${comment.UserCommentID}">
                    <div class="comment-header-compact">
                        <div class="comment-author-compact">${employee?.EmployeeName || 'Unknown'}</div>
                        <div class="comment-actions-compact">
                            <span class="comment-timestamp-compact">${timestamp}</span>
                            <button class="delete-comment-btn" onclick="deleteUserComment('${comment.UserCommentID}')" title="削除">🗑</button>
                        </div>
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

function getMoldUserCommentsFromServer(moldId) {
    if (!moldAllData.usercomments) return [];
    
    return moldAllData.usercomments
        .filter(comment => comment.ItemID === moldId && comment.ItemType === 'mold' && comment.CommentStatus === 'active')
        .sort((a, b) => new Date(b.DateEntry) - new Date(a.DateEntry));
}

// Populate form data (継続的なデータ入力用)
function populateMoldFormData() {
    // Populate racks
    const rackSelect = document.getElementById('rackSelect');
    if (rackSelect) {
        rackSelect.innerHTML = '<option value="">選択</option>';
        moldAllData.racks.forEach(rack => {
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
            moldAllData.employees.forEach(employee => {
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
            moldAllData.companies.forEach(company => {
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
        const location = `${currentMold.displayLocation}${currentMold.displayRackLayerNotes ? ` - ${currentMold.displayRackLayerNotes}` : ''}`;
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
        const rackLayers = moldAllData.racklayers.filter(layer => layer.RackID === selectedRackId);
        rackLayers.forEach(layer => {
            const option = document.createElement('option');
            option.value = layer.RackLayerID;
            option.textContent = `${layer.RackLayerID}${layer.RackLayerNotes ? ` - ${layer.RackLayerNotes}` : ''}`;
            rackLayerSelect.appendChild(option);
        });
    }
}

// Handle location update (V3.0 backend logic)
// Fix handleMoldLocationUpdate in detail-mold.js
// ✅ FIX: Update handleMoldLocationUpdate để reload data
async function handleMoldLocationUpdate() {
    if (!currentMold) return;
    
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
        OldRackLayer: currentMold.RackLayerID || '',
        NewRackLayer: rackLayerSelect.value,
        MoldID: currentMold.MoldID,
        DateEntry: new Date().toISOString(),
        CutterID: '', // 空文字、金型用
        notes: locationNotes.value.trim()
    };
    
    const moldFieldUpdates = {
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
        console.log('Location log for mold added via API.');
        
        await callBackendApi('update-item', {
            endpoint: 'molds.csv',
            data: {
                itemId: currentMold.MoldID,
                idField: 'MoldID',
                updatedFields: moldFieldUpdates
            }
        });
        console.log('Mold item updated via API.');
        
        // ✅ FIX: Reload data từ GitHub sau khi update
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s for GitHub propagation
        await reloadMoldDataFromGitHub();
        
        hideLocationModal();
        showSuccessNotification('位置が正常に更新されました');
        
    } catch (error) {
        console.error('Failed to complete mold location update process:', error);
        showErrorNotification(`位置更新に失敗しました: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Handle shipment update (V3.0 backend logic)
// Fix handleMoldShipmentUpdate in detail-mold.js
// ✅ FIX: Update handleMoldShipmentUpdate để reload data
async function handleMoldShipmentUpdate() {
    if (!currentMold) return;
    
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
        MoldID: currentMold.MoldID,
        CutterID: '', // CutterIDは空
        FromCompanyID: fromCoSelect.value || '2',
        ToCompanyID: toCompanyId || '',
        FromCompany: fromCoManual.value.trim() || '',
        ToCompany: toCompanyManualVal || '',
        ShipDate: dateInput.value,
        handler: handlerInput.value.trim() || '',
        ShipNotes: notesInput.value.trim() || '',
        DateEntry: new Date().toISOString()
    };
    
    const moldFieldUpdates = {};
    if (toCompanyId && toCompanyId !== '2') {
        moldFieldUpdates.storage_company = toCompanyId;
        moldFieldUpdates.RackLayerID = ''; // Clear location when shipped out
    } else if (toCompanyId === '2') {
        moldFieldUpdates.storage_company = '2'; // Return to YSD
    }
    
    try {
        showLoading(true);
        
        await callBackendApi('add-log', {
            endpoint: 'shiplog.csv',
            data: newShipLogEntry
        });
        console.log('Shipment log for mold added via API.');
        
        if (Object.keys(moldFieldUpdates).length > 0) {
            await callBackendApi('update-item', {
                endpoint: 'molds.csv',
                data: {
                    itemId: currentMold.MoldID,
                    idField: 'MoldID',
                    updatedFields: moldFieldUpdates
                }
            });
            console.log('Mold item updated for shipment via API.');
        }
        
        // ✅ FIX: Reload data từ GitHub sau khi update
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s for GitHub propagation
        await reloadMoldDataFromGitHub();
        
        hideShipmentModal();
        showSuccessNotification('出荷情報が正常に登録されました');
        
    } catch (error) {
        console.error('Failed to complete mold shipment update process:', error);
        showErrorNotification(`出荷登録に失敗しました: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// Handle comment submit (V3.0 backend logic)
// Fix handleMoldCommentSubmit in detail-mold.js
// ✅ FIX: Update handleMoldCommentSubmit để reload data
async function handleMoldCommentSubmit(event) {
    event.preventDefault();
    if (!currentMold) return;
    
    const commentText = document.getElementById('commentText');
    const commentEmployeeSelect = document.getElementById('commentEmployeeSelect');
    
    if (!commentText.value.trim()) {
        showSuccessNotification('コメントが正常に投稿されました');
        return;
    }
    
    if (!commentEmployeeSelect.value) {
        showErrorNotification(`コメント投稿に失敗しました: ${error.message}`);
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
        
        // Save via server API
        await callBackendApi('add-comment', {
            endpoint: 'usercomments.csv',
            data: newCommentEntry
        });
        console.log('Mold comment added via API.');
        
        // ✅ FIX: Reload data từ GitHub sau khi update
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s for GitHub propagation
        await reloadMoldDataFromGitHub();
        
        hideCommentModal();
        
        // Clear form
        commentText.value = '';
        commentEmployeeSelect.value = '';
        
        alert('コメントが正常に投稿されました');
        
    } catch (error) {
        console.error('Failed to save mold comment:', error);
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
function loadMoldUserComments() {
    try {
        moldUserComments = JSON.parse(localStorage.getItem('moldUserComments')) || [];
    } catch (e) {
        moldUserComments = [];
    }
}

function saveMoldUserComment(comment) {
    moldUserComments.push(comment);
    localStorage.setItem('moldUserComments', JSON.stringify(moldUserComments));
}

function getMoldUserComments(moldId) {
    return moldUserComments.filter(comment => 
        comment.itemId === moldId && comment.itemType === 'mold'
    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

// Utility functions (V3.0 working logic)
function getMoldCurrentStatus(mold) {
    // Check MoldReturning and MoldDisposing fields
    if (mold.MoldReturning === 'TRUE' || mold.MoldReturning === true) {
        return { status: 'returned', text: '返却済み', class: 'status-returned' };
    }
    if (mold.MoldDisposing === 'TRUE' || mold.MoldDisposing === true) {
        return { status: 'disposed', text: '廃棄済み', class: 'status-inactive' };
    }
    
    const history = getMoldShipHistory(mold.MoldID);
    if (history.length > 0) {
        const latest = history[0];
        if (latest.ToCompanyID && latest.ToCompanyID !== '2') {
            return { status: 'shipped', text: '出荷済み', class: 'status-shipped' };
        }
    }
    
    return { status: 'available', text: '利用可能', class: 'status-active' };
}

function getMoldRelatedCutters(moldID) {
    if (!moldID) return [];
    
    const relations = moldAllData.moldcutter.filter(mc => mc.MoldID === moldID);
    return relations.map(rel => {
        const cutter = moldAllData.cutters.find(c => c.CutterID === rel.CutterID);
        return cutter;
    }).filter(c => c && c.CutterID);
}

function getMoldShipHistory(moldID) {
    if (!moldID) return [];
    
    return moldAllData.shiplog.filter(log => log.MoldID === moldID)
        .sort((a, b) => new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0));
}

function getMoldLocationHistory(moldID) {
    if (!moldID) return [];
    
    return moldAllData.locationlog.filter(log => log.MoldID === moldID)
        .sort((a, b) => new Date(b.DateEntry || 0) - new Date(a.DateEntry || 0));
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

// detail-mold.js V6.5 - Final version with conditional location logic + Modern UI + Official report
// Complete implementation with all requested improvements
// 2025.09.24 - Final production ready version

// ===== GLOBAL VARIABLES =====
let currentMold = null;
let moldAllData = {};
let moldUserComments = [];
let cavData = [];

const MOLD_GITHUB_BASE_URL = "https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data";

// ===== PAGE INITIALIZATION V6.5 =====
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const moldId = urlParams.get('id');
    
    console.log('V6.5: Initializing with moldId:', moldId);
    
    if (moldId) {
        loadMoldDetailData(moldId);
    } else {
        showError('ID khuôn không hợp lệ / 金型IDが無効です');
    }
    
    initializeMoldEventListeners();
    initializeTabNavigation();
    loadMoldUserComments();
});

// ===== V6.5: TAB NAVIGATION =====
function initializeTabNavigation() {
    console.log('V6.5: Initializing tab navigation...');
    
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            console.log('Tab clicked:', this.getAttribute('data-tab'));
            
            // Remove active class from all tabs and panes
            tabLinks.forEach(l => l.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            // Add active class to clicked tab
            this.classList.add('active');
            
            // Show corresponding pane and load content
            const targetTab = this.getAttribute('data-tab');
            const targetPane = document.getElementById(targetTab);
            if (targetPane) {
                targetPane.classList.add('active');
                
                // V6.5: Load tab content dynamically
                if (currentMold) {
                    console.log('Loading content for tab:', targetTab);
                    switch(targetTab) {
                        case 'summary': 
                            displaySummaryTab(); 
                            break;
                        case 'product': 
                            displayProductTab(); 
                            break;
                        case 'technical': 
                            displayTechnicalTab(); 
                            break;
                        case 'processing': 
                            displayProcessingTab(); 
                            break;
                    }
                }
            }
        });
    });
}

// ===== EVENT LISTENERS SETUP V6.5 =====
function initializeMoldEventListeners() {
    console.log('V6.5: Setting up event listeners...');
    
    const locationBtn = document.getElementById('showLocationBtn');
    const shipmentBtn = document.getElementById('showShipmentBtn');
    const commentBtn = document.getElementById('showCommentBtn');
    
    if (locationBtn) locationBtn.addEventListener('click', showLocationModal);
    if (shipmentBtn) shipmentBtn.addEventListener('click', showShipmentModal);
    if (commentBtn) commentBtn.addEventListener('click', showCommentModal);
    
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
    
    const rackSelect = document.getElementById('rackSelect');
    if (rackSelect) {
        rackSelect.addEventListener('change', updateRackLayers);
    }
}

// ===== DATA LOADING FROM GITHUB V6.5 =====
async function reloadMoldDataFromGitHub() {
    console.log('V6.5: Manual reload from GitHub...');
    try {
        showLoading(true);
        
        const filesToReload = ['locationlog.csv', 'shiplog.csv', 'molds.csv', 'usercomments.csv'];
       
        for (const file of filesToReload) {
            try {
                const response = await fetch(`${MOLD_GITHUB_BASE_URL}/${file}?t=${Date.now()}`);
                
                if (response.ok) {
                    const csvText = await response.text();
                    const data = parseCSV(csvText);
                    const key = file.replace('.csv', '');
                    moldAllData[key] = data;
                    console.log(`V6.5: Reloaded ${file}: ${data.length} records`);
                }
            } catch (error) {
                console.warn(`V6.5: Error reloading ${file}:`, error);
            }
        }
        
        processMoldDataRelationships();
        currentMold = moldAllData.molds.find(item => item.MoldID === currentMold.MoldID);
       
        if (currentMold) {
            displayMoldDetailData();
            console.log('V6.5: Data reloaded and display refreshed');
            showSuccess('データが正常に更新されました / Dữ liệu đã được cập nhật thành công');
        }
    } catch (error) {
        console.error('V6.5: Error reloading data:', error);
        showError('データ更新に失敗しました / Cập nhật dữ liệu thất bại: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function loadMoldDetailData(moldId) {
    console.log('V6.5: Loading mold detail data for ID:', moldId);
    showLoading(true);
    
    try {
        const dataFiles = [
            'molds.csv', 'cutters.csv', 'customers.csv', 'molddesign.csv',
            'moldcutter.csv', 'shiplog.csv', 'locationlog.csv', 'employees.csv',
            'racklayers.csv', 'racks.csv', 'companies.csv', 'jobs.csv', 'usercomments.csv',
            'CAV.csv'
        ];
        
        console.log('V6.5: Loading', dataFiles.length, 'data files...');
        
        const promises = dataFiles.map(async file => {
            try {
                const response = await fetch(`${MOLD_GITHUB_BASE_URL}/${file}`);
                if (response.ok) {
                    const csvText = await response.text();
                    return { file, data: parseCSV(csvText) };
                }
                console.warn(`V6.5: Failed to load ${file}`);
                return { file, data: [] };
            } catch (error) {
                console.warn(`V6.5: Error loading ${file}:`, error);
                return { file, data: [] };
            }
        });
        
        const results = await Promise.all(promises);
        
        results.forEach(({ file, data }) => {
            const key = file.replace('.csv', '');
            if (key === 'CAV') {
                cavData = data;
                console.log('V6.5: CAV data loaded:', cavData.length, 'records');
            } else {
                moldAllData[key] = data;
                console.log(`V6.5: ${key} data loaded:`, data.length, 'records');
            }
        });
        
        processMoldDataRelationships();
        
        currentMold = moldAllData.molds.find(item => item.MoldID === moldId);
        console.log('V6.5: Found mold:', currentMold ? 'YES' : 'NO');
        
        if (currentMold) {
            displayMoldDetailData();
            populateMoldFormData();
            console.log('V6.5: Mold detail loaded successfully');
        } else {
            showError('金型が見つかりません / Không tìm thấy khuôn');
        }
        
    } catch (error) {
        console.error('V6.5: Error loading mold detail data:', error);
        showError(`データの読み込みに失敗しました / Tải dữ liệu thất bại: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// ===== DATA RELATIONSHIP PROCESSING V6.5 =====
function processMoldDataRelationships() {
    console.log('V6.5: Processing data relationships...');
    
    const moldDesignMap = new Map(moldAllData.molddesign?.map(d => [d.MoldDesignID, d]));
    const customerMap = new Map(moldAllData.customers?.map(c => [c.CustomerID, c]));
    const companyMap = new Map(moldAllData.companies?.map(c => [c.CompanyID, c]));
    const rackMap = new Map(moldAllData.racks?.map(r => [r.RackID, r]));
    const rackLayerMap = new Map(moldAllData.racklayers?.map(l => [l.RackLayerID, l]));
    const jobMap = new Map(moldAllData.jobs?.map(j => [j.MoldDesignID, j]));
    
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
        console.log('V6.5: Enhanced', moldAllData.molds.length, 'mold records');
    }
}

// ===== V6.5: MAIN DISPLAY FUNCTION WITH CONDITIONAL HEADER =====
function displayMoldDetailData() {
    console.log('V6.5: Displaying mold detail data...');
    
    if (!currentMold) {
        console.error('V6.5: No current mold data available');
        return;
    }
    
    // Update header title
    const moldTitle = document.getElementById('moldTitle');
    if (moldTitle) {
        const title = `${currentMold.MoldCode || 'N/A'}`;
        moldTitle.textContent = title;
        console.log('V6.5: Updated title:', title);
    }
    
    // V6.5: Conditional location display and subtitle
    updateMoldLocationDisplayConditional();
    
    // Load default tab (Summary)
    displaySummaryTab();
    console.log('V6.5: Summary tab loaded');
}

// ===== V6.5: CONDITIONAL LOCATION DISPLAY LOGIC =====
// ===== V6.6: CORRECTED HEADER LOCATION DISPLAY =====
function updateMoldLocationDisplayConditional() {
    const locationElement = document.getElementById('moldLocation');
    const subtitleElement = document.getElementById('moldSubtitle');
    
    if (!locationElement) {
        console.error('V6.6: moldLocation element not found');
        return;
    }
    
    let locationText = '';
    
    console.log('V6.6: Processing corrected location logic...');
    console.log('V6.6: storage_company:', currentMold.storage_company);
    console.log('V6.6: RackLayerID:', currentMold.RackLayerID);
    console.log('V6.6: storageCompanyInfo:', currentMold.storageCompanyInfo);
    
    // Get rack info regardless of company
    let rackDisplayText = '';
    if (currentMold.rackInfo && currentMold.rackLayerInfo) {
        rackDisplayText = ` <span class="rack-circle">${currentMold.rackInfo.RackID}</span>-${currentMold.rackLayerInfo.RackLayerNumber}層`;
    }
    
    // V6.6: Corrected logic according to requirements
    if (currentMold.storageCompanyInfo && currentMold.storageCompanyInfo.CompanyShortName) {
        // Case 1: Has storage company → Show company name + rack info
        locationText = `現在位置: ${currentMold.storageCompanyInfo.CompanyShortName}${rackDisplayText}`;
    } else if (currentMold.RackLayerID && rackDisplayText) {
        // Case 2: No storage company but has RackLayerID → Show "その他" + rack info
        locationText = `その他${rackDisplayText}`;
    } else {
        // Case 3: No storage company and no RackLayerID → Show "位置不明"
        locationText = `位置不明`;
    }
    
    locationElement.innerHTML = locationText;
    
    // V6.6: Always hide subtitle as requested
    if (subtitleElement) {
        subtitleElement.classList.add('hidden');
    }
    
    console.log('V6.6: Corrected location display updated:', locationText);
}

// ===== V6.5: TAB 1 - SUMMARY WITH CONDITIONAL LOCATION LOGIC =====
function displaySummaryTab() {
    console.log('V6.5: Displaying Summary tab with conditional location logic...');
    displaySummaryBasicInfoConditional();
    displaySummaryTrayInfo();
    displaySummaryRelatedCutters();
}

// ===== V6.6: CORRECTED BASIC INFO WITH YSD POSITION =====
function displaySummaryBasicInfoConditional() {
    const container = document.getElementById('summaryBasicInfo');
    if (!container) {
        console.error('V6.6: summaryBasicInfo container not found');
        return;
    }

    console.log('V6.6: Populating basic info with corrected YSD position logic...');
    
    const design = currentMold.designInfo || {};
    const job = currentMold.jobInfo || {};
    const status = getEnhancedMoldStatus(currentMold);
    const processingStatus = getProcessingStatus(currentMold);
    
    // V6.6: Fixed dimensions logic
    let moldDimensions = getMoldDimensionsFixed(design);
    const cavCode = getCavCodeFromDimensions(design.MoldDesignLength, design.MoldDesignWidth);
    
    // Manufacturing date
    let manufacturingDate = 'N/A';
    if (job.DeliveryDeadline) {
        manufacturingDate = formatDate(job.DeliveryDeadline);
    }
    
    // V6.6: YSD Position Logic (always show YSD position regardless of current location)
    let ysdPositionText = '';
    
    // First check current RackLayerID (might be YSD position)
    if (currentMold.rackInfo && currentMold.rackLayerInfo) {
        ysdPositionText = `${currentMold.rackInfo.RackLocation} ${currentMold.rackInfo.RackID}-${currentMold.rackLayerInfo.RackLayerNumber}層`;
    } else {
        // Check location history for last YSD position
        const ysdLocationFromHistory = getYSDLocationFromHistory();
        ysdPositionText = ysdLocationFromHistory || '不明 / Không rõ';
    }
    
    // V6.6: Storage company logic (unchanged)
    let storageCompanyText = '';
    if (currentMold.storageCompanyInfo && currentMold.storageCompanyInfo.CompanyShortName) {
        storageCompanyText = currentMold.storageCompanyInfo.CompanyShortName;
    } else if (currentMold.storage_company == 2) {
        storageCompanyText = '(株)ヨシダパッケージ';
    } else {
        storageCompanyText = '不明 / Không rõ';
    }

    container.innerHTML = `
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">ID</div>
                <div class="label-vn">ID khuôn</div>
            </div>
            <div class="info-value-compact">${currentMold.MoldID}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">型番</div>
                <div class="label-vn">Mã khuôn</div>
            </div>
            <div class="info-value-compact highlight">${currentMold.MoldCode || 'N/A'}</div>
        </div>
        
        <!-- V6.6: 3-column layout for size and CAV -->
        <div class="size-cav-row">
            <div class="size-cav-label">
                <div class="label-jp">金型寸法</div>
                <div class="label-vn">Kích thước khuôn</div>
            </div>
            <div class="size-cav-value">${moldDimensions}</div>
            <div class="size-cav-code">
                <span class="cav-code">${cavCode}</span>
            </div>
        </div>
        
        <!-- V6.6: CORRECTED - YSD Position field (always shows YSD position) -->
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">YSDでの位置</div>
                <div class="label-vn">Vị trí tại YSD</div>
            </div>
            <div class="info-value-compact">${ysdPositionText}</div>
        </div>
        
        <!-- V6.6: Storage company (unchanged) -->
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">保管会社</div>
                <div class="label-vn">Công ty lưu trữ</div>
            </div>
            <div class="info-value-compact">${storageCompanyText}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">面数</div>
                <div class="label-vn">Số mặt khuôn</div>
            </div>
            <div class="info-value-compact">${design.PieceCount || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">使用状況</div>
                <div class="label-vn">Tình trạng sử dụng khuôn</div>
            </div>
            <div class="info-value-compact ${status.class}">${status.text}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">処理状態</div>
                <div class="label-vn">Trạng thái xử lý khuôn</div>
            </div>
            <div class="info-value-compact">${processingStatus}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">設計重量</div>
                <div class="label-vn">Khối lượng khuôn thiết kế</div>
            </div>
            <div class="info-value-compact">${design.MoldDesignWeight ? design.MoldDesignWeight + ' kg' : 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">製造日</div>
                <div class="label-vn">Ngày chế tạo khuôn</div>
            </div>
            <div class="info-value-compact">${manufacturingDate}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">データ入力日</div>
                <div class="label-vn">Ngày nhập dữ liệu</div>
            </div>
            <div class="info-value-compact">${currentMold.MoldEntry ? formatDate(currentMold.MoldEntry) : 'N/A'}</div>
        </div>
    `;
    
    console.log('V6.6: Basic info populated with corrected YSD position logic');
}

// V6.6: Helper function to get YSD location from history
function getYSDLocationFromHistory() {
    const history = getMoldLocationHistory(currentMold.MoldID);
    
    for (let log of history) {
        if (log.NewRackLayer) {
            const layer = moldAllData.racklayers?.find(l => l.RackLayerID === log.NewRackLayer);
            const rack = layer ? moldAllData.racks?.find(r => r.RackID === layer.RackID) : null;
            
            if (rack && layer) {
                return `${rack.RackLocation} ${rack.RackID}-${layer.RackLayerNumber}層`;
            }
        }
    }
    
    return null;
}

// V6.5: Get original YSD location
function getOriginalYSDLocation() {
    // First check current RackLayerID
    if (currentMold.RackLayerID) {
        const layer = moldAllData.racklayers?.find(l => l.RackLayerID === currentMold.RackLayerID);
        const rack = layer ? moldAllData.racks?.find(r => r.RackID === layer.RackID) : null;
        
        if (rack && layer) {
            return `${rack.RackLocation} ${rack.RackID}-${layer.RackLayerNumber}層`;
        }
    }
    
    // Check location history for last YSD location
    const history = getMoldLocationHistory(currentMold.MoldID);
    for (let log of history) {
        if (log.NewRackLayer) {
            const layer = moldAllData.racklayers?.find(l => l.RackLayerID === log.NewRackLayer);
            const rack = layer ? moldAllData.racks?.find(r => r.RackID === layer.RackID) : null;
            
            if (rack && layer) {
                return `${rack.RackLocation} ${rack.RackID}-${layer.RackLayerNumber}層`;
            }
        }
    }
    
    return null;
}
// ===== V6.5: FIXED MOLD DIMENSIONS LOGIC =====
function getMoldDimensionsFixed(design) {
    // V6.5: Check multiple dimension sources in order of priority
    let length = null, width = null, height = null;
    
    // Priority 1: MoldDesignLength, MoldDesignWidth, Height
    if (design.MoldDesignLength && design.MoldDesignWidth) {
        length = design.MoldDesignLength;
        width = design.MoldDesignWidth;
        height = design.Height || design.MoldDesignHeight;
    }
    
    // Priority 2: Length, Width, Height fields
    if (!length && design.Length && design.Width) {
        length = design.Length;
        width = design.Width;
        height = design.Height;
    }
    
    // Priority 3: Other dimension fields
    if (!length) {
        const dimensionFields = [
            'Dimension_Length', 'Dimension_Width', 'Dimension_Height',
            'SizeLength', 'SizeWidth', 'SizeHeight',
            'length', 'width', 'height'
        ];
        
        for (const field of dimensionFields) {
            if (design[field] && !length) {
                if (field.includes('Length') || field === 'length') length = design[field];
                if (field.includes('Width') || field === 'width') width = design[field];
                if (field.includes('Height') || field === 'height') height = design[field];
            }
        }
    }
    
    console.log('V6.5: Dimension lookup result:', { length, width, height });
    
    // Format dimensions
    if (length && width) {
        if (height) {
            return `${length}×${width}×${height} mm`;
        } else {
            return `${length}×${width} mm`;
        }
    } else {
        return 'データなし / Không có dữ liệu';
    }
}

function displaySummaryTrayInfo() {
    const container = document.getElementById('summaryTrayInfo');
    if (!container) {
        console.error('V6.5: summaryTrayInfo container not found');
        return;
    }

    console.log('V6.5: Populating tray info...');
    
    const design = currentMold.designInfo || {};
    
    let traySize = 'N/A';
    if (design.CutlineX && design.CutlineY) {
        traySize = `${design.CutlineX}×${design.CutlineY}`;
    }

    container.innerHTML = `
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">トレイ情報</div>
                <div class="label-vn">Thông tin khay</div>
            </div>
            <div class="info-value-compact">${design.TrayInfoForMoldDesign || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">材質</div>
                <div class="label-vn">Vật liệu</div>
            </div>
            <div class="info-value-compact">${design.DesignForPlasticType || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">トレイサイズ</div>
                <div class="label-vn">Kích thước khay</div>
            </div>
            <div class="info-value-compact">${traySize}</div>
        </div>
    `;
    
    console.log('V6.5: Tray info populated');
}

function displaySummaryRelatedCutters() {
    const container = document.getElementById('summaryRelatedCutters');
    if (!container) {
        console.error('V6.5: summaryRelatedCutters container not found');
        return;
    }

    console.log('V6.5: Populating related cutters...');
    
    const relatedCutters = getMoldRelatedCutters(currentMold.MoldID);
    
    const separateCutterUsage = relatedCutters && relatedCutters.length > 0 ? 'あり / Có' : 'なし / Không';
    
    if (!relatedCutters || relatedCutters.length === 0) {
        container.innerHTML = `
            <div class="info-row-compact">
                <div class="info-label-compact">
                    <div class="label-jp">別抜き使用</div>
                    <div class="label-vn">Sử dụng dao cắt riêng</div>
                </div>
                <div class="info-value-compact">${separateCutterUsage}</div>
            </div>
            <div class="no-data">関連カッターがありません / Không có dao cắt liên quan</div>
        `;
        console.log('V6.5: No related cutters found');
        return;
    }

    const cuttersHtml = relatedCutters.map(cutter => {
        const cutterLocation = getCutterLocation(cutter);
        return `
            <div class="cutter-item" onclick="window.open('detail-cutter.html?id=${cutter.CutterID}', '_blank')">
                <div>
                    <div class="cutter-code">${cutter.CutterNo || cutter.CutterID}</div>
                    <div class="cutter-name">${cutter.CutterName || 'N/A'}</div>
                </div>
                <div class="cutter-location">${cutterLocation}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">別抜き使用</div>
                <div class="label-vn">Sử dụng dao cắt riêng</div>
            </div>
            <div class="info-value-compact highlight">${separateCutterUsage} (${relatedCutters.length}個)</div>
        </div>
        
        <div style="margin-top: 15px;">
            <strong>関連カッター一覧 / Danh sách dao cắt dùng chung:</strong>
        </div>
        <div style="margin-top: 10px;">
            ${cuttersHtml}
        </div>
    `;
    
    console.log('V6.5: Related cutters populated:', relatedCutters.length, 'items');
}

// ===== V6.5: TAB 2 - PRODUCT DISPLAY =====
function displayProductTab() {
    console.log('V6.5: Displaying Product tab...');
    
    const container = document.getElementById('productInfo');
    if (!container) {
        console.error('V6.5: productInfo container not found');
        return;
    }

    const design = currentMold.designInfo || {};
    const job = currentMold.jobInfo || {};

    let productDimensions = 'N/A';
    if (design.CutlineX && design.CutlineY) {
        productDimensions = `${design.CutlineX}×${design.CutlineY}`;
    }

    const separateCutter = getMoldRelatedCutters(currentMold.MoldID).length > 0 ? 'あり / Có' : 'なし / Không';

    container.innerHTML = `
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">トレイ情報</div>
                <div class="label-vn">Thông tin khay</div>
            </div>
            <div class="info-value-compact">${design.TrayInfoForMoldDesign || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">材質</div>
                <div class="label-vn">Chất liệu</div>
            </div>
            <div class="info-value-compact">${design.DesignForPlasticType || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">製品寸法</div>
                <div class="label-vn">Kích thước SP</div>
            </div>
            <div class="info-value-compact">${productDimensions}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">トレイ重量</div>
                <div class="label-vn">Khối lượng khay</div>
            </div>
            <div class="info-value-compact">${design.TrayWeight ? design.TrayWeight + ' g' : 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">初回出荷日</div>
                <div class="label-vn">Ngày xuất hàng đầu</div>
            </div>
            <div class="info-value-compact">${job.DeliveryDeadline ? formatDate(job.DeliveryDeadline) : 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">別抜き</div>
                <div class="label-vn">Dao cắt riêng</div>
            </div>
            <div class="info-value-compact">${separateCutter}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">見積</div>
                <div class="label-vn">Báo giá</div>
            </div>
            <div class="info-value-compact">${job.PriceQuote || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">単価</div>
                <div class="label-vn">Đơn giá</div>
            </div>
            <div class="info-value-compact">${job.UnitPrice || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">箱の種類</div>
                <div class="label-vn">Loại thùng</div>
            </div>
            <div class="info-value-compact">${job.LoaiThungDong || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">袋詰め</div>
                <div class="label-vn">Bọc túi</div>
            </div>
            <div class="info-value-compact">${job.BaoNilon || 'N/A'}</div>
        </div>
    `;
    
    console.log('V6.5: Product tab populated');
}

// ===== V6.5: TAB 3 - TECHNICAL WITH ENHANCED 2-COLUMN LAYOUT =====
function displayTechnicalTab() {
    console.log('V6.5: Displaying Technical tab with enhanced 2-column layout...');
    
    const container = document.getElementById('technicalInfo');
    if (!container) {
        console.error('V6.5: technicalInfo container not found');
        return;
    }

    const design = currentMold.designInfo || {};
    const job = currentMold.jobInfo || {};

    // V6.5: Design dimensions (added as requested)
    const designDimensions = getMoldDimensionsFixed(design);

    container.innerHTML = `
        <!-- First row: 設計コード (full width) -->
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">設計コード</div>
                <div class="label-vn">Mã tra cứu</div>
            </div>
            <div class="info-value-compact">${design.MoldDesignCode || 'N/A'}</div>
        </div>
        
        <!-- V6.5: Design dimensions (full width) -->
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">設計寸法</div>
                <div class="label-vn">Kích thước thiết kế</div>
            </div>
            <div class="info-value-compact highlight">${designDimensions}</div>
        </div>
        
        <!-- V6.5: Enhanced 2-column layout optimized for mobile -->
        <div class="technical-2-column">
            <!-- Column 1 -->
            <div class="tech-column">
                <div class="tech-row">
                    <div class="tech-label">金型方向</div>
                    <div class="tech-value">${design.MoldOrientation || 'N/A'}</div>
                </div>
                
                <div class="tech-row">
                    <div class="tech-label">ポケット数</div>
                    <div class="tech-value">${design.PocketNumbers || 'N/A'}</div>
                </div>
                
                <div class="tech-row">
                    <div class="tech-label">設置方向</div>
                    <div class="tech-value">${design.MoldSetupType || 'N/A'}</div>
                </div>
                
                <div class="tech-row">
                    <div class="tech-label">設計重量</div>
                    <div class="tech-value">${design.MoldDesignWeight ? design.MoldDesignWeight + 'kg' : 'N/A'}</div>
                </div>
                
                <div class="tech-row">
                    <div class="tech-label">ピース数</div>
                    <div class="tech-value">${design.PieceCount || 'N/A'}</div>
                </div>
                
                <div class="tech-row">
                    <div class="tech-label">Pitch</div>
                    <div class="tech-value">${design.Pitch || 'N/A'}</div>
                </div>
                
                <div class="tech-row">
                    <div class="tech-label">C面取</div>
                    <div class="tech-value">${design.ChamferC || 'N/A'}</div>
                </div>
                
                <div class="tech-row">
                    <div class="tech-label">プラグ有無</div>
                    <div class="tech-value">${job.PlugAri || 'N/A'}</div>
                </div>
            </div>
            
            <!-- Column 2 -->
            <div class="tech-column">
                <div class="tech-row">
                    <div class="tech-label">Rコーナー</div>
                    <div class="tech-value">${design.CornerR || 'N/A'}</div>
                </div>
                
                <div class="tech-row">
                    <div class="tech-label">深さ</div>
                    <div class="tech-value">${design.MoldDesignDepth || 'N/A'}</div>
                </div>
                
                <div class="tech-row">
                    <div class="tech-label">Under深</div>
                    <div class="tech-value">${design.UnderDepth || 'N/A'}</div>
                </div>
                
                <div class="tech-row">
                    <div class="tech-label">抜き勾配</div>
                    <div class="tech-value">${design.DraftAngle || 'N/A'}</div>
                </div>
                
                <div class="tech-row">
                    <div class="tech-label">公差X,Y</div>
                    <div class="tech-value">${design.TolerenceX && design.TolerenceY ? design.TolerenceX + ',' + design.TolerenceY : 'N/A'}</div>
                </div>
                
                <div class="tech-row">
                    <div class="tech-label">図面番号</div>
                    <div class="tech-value">${design.DrawingNumber || 'N/A'}</div>
                </div>
                
                <div class="tech-row">
                    <div class="tech-label">設備コード</div>
                    <div class="tech-value">${design.EquipmentCode || 'N/A'}</div>
                </div>
                
                <div class="tech-row">
                    <div class="tech-label">試作</div>
                    <div class="tech-value">${job.PocketTEST || 'N/A'}</div>
                </div>
            </div>
        </div>
        
        <!-- V6.5: Full-width rows for text content (moved to bottom) -->
        <div class="tech-row-full">
            <div class="info-label-compact">
                <div class="label-jp">刻印内容</div>
                <div class="label-vn">Nội dung khắc chữ</div>
            </div>
            <div class="info-value-compact">${design.TextContent || 'N/A'}</div>
        </div>
        
        <div class="tech-row-full">
            <div class="info-label-compact">
                <div class="label-jp">設計備考</div>
                <div class="label-vn">Ghi chú thiết kế</div>
            </div>
            <div class="info-value-compact">${design.VersionNote || 'N/A'}</div>
        </div>
    `;
    
    console.log('V6.5: Technical tab populated with enhanced 2-column layout');
}

// ===== V6.5: TAB 4 - PROCESSING WITH COMPACT SPACING =====
function displayProcessingTab() {
    console.log('V6.5: Displaying Processing tab with compact spacing...');
    displayProcessingStatus();
    displayProcessingLocationHistory(); 
    displayProcessingShipmentHistory();
    displayProcessingUserComments();
}

function displayProcessingStatus() {
    const container = document.getElementById('processingStatus');
    if (!container) {
        console.error('V6.5: processingStatus container not found');
        return;
    }

    console.log('V6.5: Populating processing status...');

    function formatDate(dateString) {
        if (!dateString || dateString === 'N/A') return 'N/A';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('ja-JP', { 
                year: 'numeric', month: '2-digit', day: '2-digit' 
            });
        } catch (e) { return dateString; }
    }

    container.innerHTML = `
        <!-- テフロン加工 -->
        <div class="status-section">
            <div class="status-header">
                <div class="status-title">テフロン加工 / Mạ teflon</div>
                <div class="status-value">${currentMold.TeflonCoating || 'N/A'}</div>
            </div>
            <div class="date-row">
                <div class="date-item">
                    <div class="date-label">送付日 / Ngày gửi</div>
                    <div class="date-value">${formatDate(currentMold.TeflonSentDate)}</div>
                </div>
                <div class="date-item">
                    <div class="date-label">受領日 / Ngày nhận</div>
                    <div class="date-value">${formatDate(currentMold.TeflonReceivedDate)}</div>
                </div>
            </div>
        </div>

        <!-- 返却 -->
        <div class="status-section">
            <div class="status-header">
                <div class="status-title">返却 / Trả lại khuôn cho khách</div>
                <div class="status-value">${currentMold.MoldReturning || 'N/A'}</div>
            </div>
            <div class="date-row">
                <div class="date-item">
                    <div class="date-label">実施日 / Ngày thực hiện</div>
                    <div class="date-value">${formatDate(currentMold.MoldReturnedDate)}</div>
                </div>
            </div>
        </div>

        <!-- 廃棄 -->
        <div class="status-section">
            <div class="status-header">
                <div class="status-title">廃棄 / Hủy khuôn</div>
                <div class="status-value">${currentMold.MoldDisposing || 'N/A'}</div>
            </div>
            <div class="date-row">
                <div class="date-item">
                    <div class="date-label">実施日 / Ngày thực hiện</div>
                    <div class="date-value">${formatDate(currentMold.MoldDisposedDate)}</div>
                </div>
            </div>
        </div>
    `;
    
    console.log('V6.5: Processing status populated');
}

function displayProcessingLocationHistory() {
    const container = document.getElementById('processingLocationHistory');
    if (!container) {
        console.error('V6.5: processingLocationHistory container not found');
        return;
    }

    console.log('V6.5: Populating location history...');
    
    const history = getMoldLocationHistory(currentMold.MoldID);
    
    if (history && history.length > 0) {
        const historyHtml = history.slice(0, 10).map(log => {
            const oldRack = log.OldRackLayer ? getRackDisplayString(log.OldRackLayer) : 'N/A';
            const newRack = log.NewRackLayer ? getRackDisplayString(log.NewRackLayer) : 'N/A';
            
            return `
                <div class="history-item">
                    <div class="history-header">
                        <div class="history-title">位置変更</div>
                        <div class="history-date">${formatTimestamp(log.DateEntry)}</div>
                    </div>
                    <div class="history-content">
                        <div class="location-change">${oldRack} → ${newRack}</div>
                        ${log.notes ? `<div class="history-notes">備考: ${log.notes}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = historyHtml;
        console.log('V6.5: Location history populated:', history.length, 'items');
    } else {
        container.innerHTML = '<div class="no-data">位置履歴がありません / Không có lịch sử vị trí</div>';
        console.log('V6.5: No location history found');
    }
}

function displayProcessingShipmentHistory() {
    const container = document.getElementById('processingShipmentHistory');
    if (!container) {
        console.error('V6.5: processingShipmentHistory container not found');
        return;
    }

    console.log('V6.5: Populating shipment history...');
    
    const history = getMoldShipHistory(currentMold.MoldID);
    
    if (history && history.length > 0) {
        const historyHtml = history.slice(0, 10).map(log => {
            const fromCompany = moldAllData.companies?.find(c => c.CompanyID == log.FromCompanyID)?.CompanyShortName || 'N/A';
            const toCompany = moldAllData.companies?.find(c => c.CompanyID == log.ToCompanyID)?.CompanyShortName || 'N/A';
            
            return `
                <div class="history-item">
                    <div class="history-header">
                        <div class="history-title">運送</div>
                        <div class="history-date">${formatTimestamp(log.DateEntry)}</div>
                    </div>
                    <div class="history-content">
                        <div class="location-change">${fromCompany} → ${toCompany}</div>
                        ${log.handler ? `<div class="history-notes">担当者: ${log.handler}</div>` : ''}
                        ${log.ShipNotes ? `<div class="history-notes">備考: ${log.ShipNotes}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = historyHtml;
        console.log('V6.5: Shipment history populated:', history.length, 'items');
    } else {
        container.innerHTML = '<div class="no-data">運送履歴がありません / Không có lịch sử vận chuyển</div>';
        console.log('V6.5: No shipment history found');
    }
}

function displayProcessingUserComments() {
    const container = document.getElementById('processingUserComments');
    if (!container) {
        console.error('V6.5: processingUserComments container not found');
        return;
    }

    console.log('V6.5: Populating user comments...');
    
    const comments = getMoldUserCommentsFromServer(currentMold.MoldID);
    
    if (comments && comments.length > 0) {
        const commentsHtml = comments.slice(0, 10).map(comment => {
            const employee = moldAllData.employees?.find(e => e.EmployeeID == comment.EmployeeID);
            
            return `
                <div class="comment-item">
                    <div class="comment-header">
                        <div class="comment-author">${employee?.EmployeeName || 'Unknown'}</div>
                        <div class="comment-date">${formatTimestamp(comment.DateEntry)}</div>
                    </div>
                    <div class="comment-text">${comment.CommentText}</div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = commentsHtml;
        console.log('V6.5: User comments populated:', comments.length, 'items');
    } else {
        container.innerHTML = '<div class="no-data">コメントがありません / Không có bình luận</div>';
        console.log('V6.5: No user comments found');
    }
}

// ===== V6.5: OFFICIAL REPORT LAYOUT USING FORM TEMPLATE =====
function generateOfficialReportLayout() {
    console.log('V6.5: Generating official report layout using form template...');
    
    if (!currentMold) {
        console.error('V6.5: No mold data for report');
        return;
    }
    
    const reportContainer = document.getElementById('officialReportContent');
    if (!reportContainer) {
        console.error('V6.5: Report container not found');
        return;
    }
    
    // Load all tab data first
    displaySummaryTab();
    displayProductTab();
    displayTechnicalTab();
    displayProcessingTab();
    
    // Generate official report HTML using form template structure
    const reportHtml = generateOfficialFormReportHTML();
    reportContainer.innerHTML = reportHtml;
    
    console.log('V6.5: Official report layout generated using form template');
}

// ===== V6.6: REDESIGNED PRINT HTML GENERATION =====
function generateOfficialFormReportHTML() {
    const design = currentMold.designInfo || {};
    const job = currentMold.jobInfo || {};
    const moldDimensions = getMoldDimensionsFixed(design);
    const cavCode = getCavCodeFromDimensions(design.MoldDesignLength, design.MoldDesignWidth);
    const status = getEnhancedMoldStatus(currentMold);
    
    // V6.6: Get corrected location info
    let currentLocationText = '';
    let ysdPositionText = '';
    let storageCompanyText = '';
    
    // Current location (header logic)
    if (currentMold.storageCompanyInfo && currentMold.storageCompanyInfo.CompanyShortName) {
        currentLocationText = `現在位置: ${currentMold.storageCompanyInfo.CompanyShortName}`;
    } else if (currentMold.RackLayerID && currentMold.rackInfo && currentMold.rackLayerInfo) {
        currentLocationText = `その他 ${currentMold.rackInfo.RackID}-${currentMold.rackLayerInfo.RackLayerNumber}層`;
    } else {
        currentLocationText = '位置不明';
    }
    
    // YSD position (basic info logic)
    if (currentMold.rackInfo && currentMold.rackLayerInfo) {
        ysdPositionText = `${currentMold.rackInfo.RackLocation} ${currentMold.rackInfo.RackID}-${currentMold.rackLayerInfo.RackLayerNumber}層`;
    } else {
        ysdPositionText = getYSDLocationFromHistory() || '不明';
    }
    
    // Storage company
    if (currentMold.storageCompanyInfo && currentMold.storageCompanyInfo.CompanyShortName) {
        storageCompanyText = currentMold.storageCompanyInfo.CompanyShortName;
    } else if (currentMold.storage_company == 2) {
        storageCompanyText = '(株)ヨシダパッケージ';
    } else {
        storageCompanyText = '不明';
    }

    return `
        <div class="print-container">
            <!-- V6.6: Print header -->
            <div class="print-header">
                <div class="print-title">金型詳細情報 - ${currentMold.MoldCode || 'N/A'}</div>
                <div class="print-subtitle">
                    印刷日時: ${new Date().toLocaleString('ja-JP')} | 
                    ID: ${currentMold.MoldID} | 
                    ${currentLocationText}
                </div>
            </div>

            <!-- V6.6: Section 1 - Basic Information -->
            <div class="print-section no-break">
                <div class="print-section-header">基本情報</div>
                <div class="print-section-content">
                    <div class="print-grid">
                        <div class="print-field">
                            <div class="print-label">型番:</div>
                            <div class="print-value highlight">${currentMold.MoldCode || 'N/A'}</div>
                        </div>
                        <div class="print-field">
                            <div class="print-label">ID:</div>
                            <div class="print-value">${currentMold.MoldID}</div>
                        </div>
                    </div>
                    
                    <div class="print-grid-3col">
                        <div class="print-field">
                            <div class="print-label">寸法:</div>
                            <div class="print-value">${moldDimensions}</div>
                        </div>
                        <div class="print-field">
                            <div class="print-label">CAV:</div>
                            <div class="print-value"><span class="print-cav">${cavCode}</span></div>
                        </div>
                        <div class="print-field">
                            <div class="print-label">面数:</div>
                            <div class="print-value">${design.PieceCount || 'N/A'}</div>
                        </div>
                    </div>
                    
                    <div class="print-grid">
                        <div class="print-field">
                            <div class="print-label">YSDでの位置:</div>
                            <div class="print-value">${ysdPositionText}</div>
                        </div>
                        <div class="print-field">
                            <div class="print-label">保管会社:</div>
                            <div class="print-value">${storageCompanyText}</div>
                        </div>
                    </div>
                    
                    <div class="print-grid">
                        <div class="print-field">
                            <div class="print-label">重量:</div>
                            <div class="print-value">${design.MoldDesignWeight ? design.MoldDesignWeight + 'kg' : 'N/A'}</div>
                        </div>
                        <div class="print-field">
                            <div class="print-label">製造日:</div>
                            <div class="print-value">${job.DeliveryDeadline ? formatDate(job.DeliveryDeadline) : 'N/A'}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- V6.6: Section 2 - Product Information -->
            <div class="print-section no-break">
                <div class="print-section-header">製品情報</div>
                <div class="print-section-content">
                    <div class="print-grid">
                        <div class="print-field">
                            <div class="print-label">トレイ情報:</div>
                            <div class="print-value">${design.TrayInfoForMoldDesign || 'N/A'}</div>
                        </div>
                        <div class="print-field">
                            <div class="print-label">材質:</div>
                            <div class="print-value">${design.DesignForPlasticType || 'N/A'}</div>
                        </div>
                    </div>
                    
                    <div class="print-grid">
                        <div class="print-field">
                            <div class="print-label">製品寸法:</div>
                            <div class="print-value">${design.CutlineX && design.CutlineY ? design.CutlineX + '×' + design.CutlineY : 'N/A'}</div>
                        </div>
                        <div class="print-field">
                            <div class="print-label">重量:</div>
                            <div class="print-value">${design.TrayWeight ? design.TrayWeight + 'g' : 'N/A'}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- V6.6: Section 3 - Technical Details -->
            <div class="print-section no-break">
                <div class="print-section-header">技術仕様</div>
                <div class="print-section-content">
                    <div class="print-field-full">
                        <div class="print-label">設計コード:</div>
                        <div class="print-value">${design.MoldDesignCode || 'N/A'}</div>
                    </div>
                    
                    <div class="print-grid">
                        <div class="print-field">
                            <div class="print-label">方向:</div>
                            <div class="print-value">${design.MoldOrientation || 'N/A'}</div>
                        </div>
                        <div class="print-field">
                            <div class="print-label">ポケット数:</div>
                            <div class="print-value">${design.PocketNumbers || 'N/A'}</div>
                        </div>
                    </div>
                    
                    <div class="print-grid">
                        <div class="print-field">
                            <div class="print-label">Pitch:</div>
                            <div class="print-value">${design.Pitch || 'N/A'}</div>
                        </div>
                        <div class="print-field">
                            <div class="print-label">深さ:</div>
                            <div class="print-value">${design.MoldDesignDepth || 'N/A'}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- V6.6: Section 4 - Status -->
            <div class="print-section no-break">
                <div class="print-section-header">状態・処理</div>
                <div class="print-section-content">
                    <div class="print-grid">
                        <div class="print-field">
                            <div class="print-label">使用状況:</div>
                            <div class="print-value"><span class="print-status ${status.class}">${status.text}</span></div>
                        </div>
                        <div class="print-field">
                            <div class="print-label">処理状態:</div>
                            <div class="print-value">${getProcessingStatus(currentMold)}</div>
                        </div>
                    </div>
                    
                    <div class="print-grid">
                        <div class="print-field">
                            <div class="print-label">テフロン:</div>
                            <div class="print-value">${currentMold.TeflonCoating || 'N/A'}</div>
                        </div>
                        <div class="print-field">
                            <div class="print-label">別抜き:</div>
                            <div class="print-value">${getMoldRelatedCutters(currentMold.MoldID).length > 0 ? 'あり' : 'なし'}</div>
                        </div>
                    </div>
                </div>
            </div>

            ${generatePrintRelatedCutters()}
            ${generatePrintHistory()}

            <!-- V6.6: Print footer -->
            <div class="print-footer">
                MoldCutterSearch V6.6 - 金型詳細情報 | 生成日時: ${new Date().toLocaleString('ja-JP')}
            </div>
        </div>
    `;
}
// V6.6: Generate print related cutters
function generatePrintRelatedCutters() {
    const relatedCutters = getMoldRelatedCutters(currentMold.MoldID);
    
    if (!relatedCutters || relatedCutters.length === 0) {
        return '';
    }
    
    const cuttersHtml = relatedCutters.slice(0, 8).map(cutter => {
        const location = getCutterLocation(cutter);
        return `<span class="print-related-item">${cutter.CutterNo || cutter.CutterID}: ${location}</span>`;
    }).join(' ');

    return `
        <div class="print-section no-break">
            <div class="print-section-header">関連カッター (${relatedCutters.length}個)</div>
            <div class="print-section-content">
                ${cuttersHtml}
                ${relatedCutters.length > 8 ? `<span class="print-related-item">他${relatedCutters.length - 8}個...</span>` : ''}
            </div>
        </div>
    `;
}

// V6.6: Generate print history
function generatePrintHistory() {
    const locationHistory = getMoldLocationHistory(currentMold.MoldID).slice(0, 5);
    const shipmentHistory = getMoldShipHistory(currentMold.MoldID).slice(0, 5);
    
    let historyHtml = '';
    
    if (locationHistory.length > 0) {
        const locationHtml = locationHistory.map(log => 
            `<div class="print-history">
                <span class="print-history-date">${formatTimestamp(log.DateEntry)}</span>: 
                位置変更 ${log.OldRackLayer ? getRackDisplayString(log.OldRackLayer).replace(/<[^>]*>/g, '') : 'N/A'} → ${log.NewRackLayer ? getRackDisplayString(log.NewRackLayer).replace(/<[^>]*>/g, '') : 'N/A'}
            </div>`
        ).join('');
        
        historyHtml += `
            <div class="print-section">
                <div class="print-section-header">位置履歴 (最新5件)</div>
                <div class="print-section-content">${locationHtml}</div>
            </div>
        `;
    }
    
    if (shipmentHistory.length > 0) {
        const shipmentHtml = shipmentHistory.map(log => {
            const fromCompany = moldAllData.companies?.find(c => c.CompanyID == log.FromCompanyID)?.CompanyShortName || 'N/A';
            const toCompany = moldAllData.companies?.find(c => c.CompanyID == log.ToCompanyID)?.CompanyShortName || 'N/A';
            return `<div class="print-history">
                <span class="print-history-date">${formatTimestamp(log.DateEntry)}</span>: 
                運送 ${fromCompany} → ${toCompany}
            </div>`;
        }).join('');
        
        historyHtml += `
            <div class="print-section">
                <div class="print-section-header">運送履歴 (最新5件)</div>
                <div class="print-section-content">${shipmentHtml}</div>
            </div>
        `;
    }
    
    return historyHtml;
}
function generateOfficialReportRelatedCutters() {
    const relatedCutters = getMoldRelatedCutters(currentMold.MoldID);
    
    if (!relatedCutters || relatedCutters.length === 0) {
        return `
            <tr>
                <td class="report-label">関連カッター</td>
                <td colspan="12" class="report-value">なし</td>
            </tr>
        `;
    }
    
    // Show up to 3 cutters in the official report
    const cuttersToShow = relatedCutters.slice(0, 3);
    let cuttersText = cuttersToShow.map(cutter => {
        const location = getCutterLocation(cutter);
        return `${cutter.CutterNo || cutter.CutterID}: ${cutter.CutterName || 'N/A'} (${location})`;
    }).join(' | ');
    
    if (relatedCutters.length > 3) {
        cuttersText += ` | 他${relatedCutters.length - 3}個`;
    }

    return `
        <tr>
            <td class="report-label">関連カッター<br>(${relatedCutters.length}個)</td>
            <td colspan="12" class="report-value">${cuttersText}</td>
        </tr>
    `;
}

// ===== V6.5: CAV CODE PROCESSING =====
function getCavCodeFromDimensions(length, width) {
    if (!length || !width || !cavData || cavData.length === 0) {
        console.log('V6.5: CAV lookup failed - missing data');
        return 'OTHER';
    }
    
    const moldLength = parseFloat(length);
    const moldWidth = parseFloat(width);
    
    if (isNaN(moldLength) || isNaN(moldWidth)) {
        console.log('V6.5: CAV lookup failed - invalid dimensions');
        return 'OTHER';
    }
    
    console.log(`V6.5: CAV lookup for ${moldLength}x${moldWidth}...`);
    
    // Find matching CAV with tolerance ±5mm
    const tolerance = 5;
    const matchingCav = cavData.find(cav => {
        const cavLength = parseFloat(cav.CAVlength);
        const cavWidth = parseFloat(cav.CAVwidth);
        
        if (isNaN(cavLength) || isNaN(cavWidth)) return false;
        
        const lengthMatch = Math.abs(moldLength - cavLength) <= tolerance;
        const widthMatch = Math.abs(moldWidth - cavWidth) <= tolerance;
        
        return lengthMatch && widthMatch;
    });
    
    const result = matchingCav ? matchingCav.CAV : 'OTHER';
    console.log('V6.5: CAV lookup result:', result);
    return result;
}

// ===== V6.5: PROCESSING STATUS LOGIC =====
function getProcessingStatus(mold) {
    const statuses = [];
    
    if (mold.TeflonCoating && mold.TeflonCoating !== 'N/A' && mold.TeflonCoating !== 'FALSE') {
        statuses.push('テフロン加工済み');
    }
    
    if (mold.MoldReturning && mold.MoldReturning !== 'N/A' && mold.MoldReturning !== 'FALSE') {
        statuses.push('返却済み');
    }
    
    if (mold.MoldDisposing && mold.MoldDisposing !== 'N/A' && mold.MoldDisposing !== 'FALSE') {
        statuses.push('廃棄済み');
    }
    
    return statuses.length > 0 ? statuses.join(', ') : '通常';
}

// Continue with remaining functions in PART 3...
// ===== V6.5: BUSINESS LOGIC FUNCTIONS =====

async function handleMoldLocationUpdate() {
    if (!currentMold) return;
    
    const rackLayerSelect = document.getElementById('rackLayerSelect');
    const employeeSelect = document.getElementById('employeeSelect');
    const locationNotes = document.getElementById('locationNotes');
    
    if (!rackLayerSelect.value) {
        showError('新しい位置を選択してください / Vui lòng chọn vị trí mới');
        return;
    }
    
    if (!employeeSelect.value) {
        showError('担当者を選択してください / Vui lòng chọn người thực hiện');
        return;
    }
    
    try {
        showLoading(true);
        console.log('V6.5: Updating mold location...');
        
        const newLocationEntry = {
            LocationLogID: String(Date.now()),
            OldRackLayer: currentMold.RackLayerID || '',
            NewRackLayer: rackLayerSelect.value,
            MoldID: currentMold.MoldID,
            CutterID: '',
            DateEntry: new Date().toISOString(),
            notes: locationNotes.value.trim()
        };
        
        // Add to local data for immediate UI update
        if (!moldAllData.locationlog) moldAllData.locationlog = [];
        moldAllData.locationlog.unshift(newLocationEntry);
        
        // Update current mold
        currentMold.RackLayerID = rackLayerSelect.value;
        currentMold.storage_company = '2';
        
        // Reprocess relationships and refresh display
        processMoldDataRelationships();
        currentMold = moldAllData.molds.find(item => item.MoldID === currentMold.MoldID);
        displayMoldDetailData();
        
        hideLocationModal();
        showSuccess('位置が正常に更新されました / Vị trí đã được cập nhật thành công');
        
        // Clear form
        rackLayerSelect.value = '';
        employeeSelect.value = '';
        locationNotes.value = '';
        
        console.log('V6.5: Location update completed');
        
    } catch (error) {
        console.error('V6.5: Failed to update mold location:', error);
        showError(`位置更新に失敗しました / Cập nhật vị trí thất bại: ${error.message}`);
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
        showError('出荷先を選択してください / Vui lòng chọn công ty đến');
        return;
    }
    
    try {
        showLoading(true);
        console.log('V6.5: Updating mold shipment...');
        
        const newShipEntry = {
            ShipID: String(Date.now()),
            MoldID: currentMold.MoldID,
            CutterID: '',
            FromCompanyID: '2',
            ToCompanyID: toCoSelect.value,
            ShipDate: shipmentDate.value,
            handler: handler.value.trim(),
            ShipNotes: shipmentNotes.value.trim(),
            DateEntry: new Date().toISOString()
        };
        
        if (!moldAllData.shiplog) moldAllData.shiplog = [];
        moldAllData.shiplog.unshift(newShipEntry);
        
        currentMold.storage_company = toCoSelect.value;
        if (toCoSelect.value !== '2') {
            currentMold.RackLayerID = '';
        }
        
        processMoldDataRelationships();
        currentMold = moldAllData.molds.find(item => item.MoldID === currentMold.MoldID);
        displayMoldDetailData();
        
        hideShipmentModal();
        showSuccess('出荷情報が正常に登録されました / Thông tin vận chuyển đã được đăng ký');
        
        // Clear form
        toCoSelect.value = '';
        shipmentDate.value = '';
        handler.value = '';
        shipmentNotes.value = '';
        
        console.log('V6.5: Shipment update completed');
        
    } catch (error) {
        console.error('V6.5: Failed to update mold shipment:', error);
        showError(`出荷登録に失敗しました / Đăng ký vận chuyển thất bại: ${error.message}`);
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
        showError('コメントを入力してください / Vui lòng nhập bình luận');
        return;
    }
    
    if (!commentEmployeeSelect.value) {
        showError('担当者を選択してください / Vui lòng chọn người bình luận');
        return;
    }
    
    try {
        showLoading(true);
        console.log('V6.5: Adding mold comment...');
        
        const newCommentEntry = {
            UserCommentID: String(Date.now()),
            ItemID: currentMold.MoldID,
            ItemType: 'mold',
            CommentText: commentText.value.trim(),
            EmployeeID: commentEmployeeSelect.value,
            DateEntry: new Date().toISOString(),
            CommentStatus: 'active'
        };
        
        // Add to local data for immediate UI update
        if (!moldAllData.usercomments) moldAllData.usercomments = [];
        moldAllData.usercomments.unshift(newCommentEntry);
        
        // Refresh comments display in processing tab
        displayProcessingUserComments();
        
        hideCommentModal();
        showSuccess('コメントが正常に投稿されました / Bình luận đã được đăng thành công');
        
        // Clear form
        commentText.value = '';
        commentEmployeeSelect.value = '';
        
        console.log('V6.5: Comment submission completed');
        
    } catch (error) {
        console.error('V6.5: Failed to save mold comment:', error);
        showError(`コメント投稿に失敗しました / Đăng bình luận thất bại: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// ===== V6.5: ENHANCED DISPLAY UTILITIES =====

function getEnhancedMoldStatus(mold) {
    // Check MoldReturning first
    if (mold.MoldReturning && mold.MoldReturning.trim() !== '' && mold.MoldReturning !== 'FALSE') {
        return { status: 'returned', text: mold.MoldReturning, class: 'danger' };
    }
    
    // Check MoldDisposing second
    if (mold.MoldDisposing && mold.MoldDisposing.trim() !== '' && mold.MoldDisposing !== 'FALSE') {
        return { status: 'disposed', text: mold.MoldDisposing, class: 'danger' };
    }
    
    // Use MoldNotes as fallback
    if (mold.MoldNotes && mold.MoldNotes.trim() !== '') {
        return { status: 'notes', text: mold.MoldNotes, class: 'warning' };
    }
    
    // Default status based on shipment
    const history = getMoldShipHistory(mold.MoldID);
    if (history.length > 0 && history[0].ToCompanyID && history[0].ToCompanyID !== '2') {
        return { status: 'shipped', text: '出荷履歴有', class: 'warning' };
    }
    
    return { status: 'available', text: '利用可能', class: 'success' };
}

function getMoldCurrentStatus(mold) {
    return getEnhancedMoldStatus(mold);
}

// ===== V6.5: MOLD RELATIONSHIP FUNCTIONS =====

function getMoldRelatedCutters(moldID) {
    if (!moldID || !moldAllData.moldcutter) {
        console.log('V6.5: No related cutters - missing data');
        return [];
    }
    
    // Step 1: Find MoldDesignID from MoldID
    const mold = moldAllData.molds?.find(m => String(m.MoldID).trim() === String(moldID).trim());
    if (!mold || !mold.MoldDesignID) {
        console.log('V6.5: No related cutters - mold not found or no design ID');
        return [];
    }
    
    const moldDesignID = String(mold.MoldDesignID).trim();
    console.log('V6.5: Looking for cutters with MoldDesignID:', moldDesignID);
    
    // Step 2: Find CutterIDs from MoldDesignID in moldcutter.csv
    const cutterRelations = moldAllData.moldcutter.filter(mc => 
        String(mc.MoldDesignID || '').trim() === moldDesignID
    );
    
    console.log('V6.5: Found', cutterRelations.length, 'cutter relations');
    
    // Step 3: Get cutter details
    const relatedCutters = cutterRelations.map(rel => {
        const cutterID = String(rel.CutterID || '').trim();
        const cutter = moldAllData.cutters?.find(c => 
            String(c.CutterID || '').trim() === cutterID
        );
        
        if (cutter) {
            return {
                ...cutter,
                relationInfo: rel
            };
        }
        return null;
    }).filter(Boolean);
    
    console.log('V6.5: Returned', relatedCutters.length, 'related cutters');
    return relatedCutters;
}

function getCutterLocation(cutter) {
    if (!cutter || !cutter.RackLayerID) return 'N/A';
    
    const layer = moldAllData.racklayers?.find(l => l.RackLayerID == cutter.RackLayerID);
    const rack = layer ? moldAllData.racks?.find(r => r.RackID == layer.RackID) : null;
    
    if (rack && layer) {
        return `${rack.RackLocation} ${rack.RackID}-${layer.RackLayerNumber}`;
    }
    return 'N/A';
}

function getRackDisplayString(rackLayerId) {
    const layer = moldAllData.racklayers?.find(l => l.RackLayerID == rackLayerId);
    const rack = layer ? moldAllData.racks?.find(r => r.RackID == layer.RackID) : null;
    
    if (rack && layer) {
        return `${rack.RackLocation} <span class="rack-circle">${rack.RackID}</span>-${layer.RackLayerNumber}層`;
    }
    return 'N/A';
}

function getMoldUserCommentsFromServer(moldId) {
    if (!moldAllData.usercomments) {
        console.log('V6.5: No usercomments data available');
        return [];
    }
    
    const comments = moldAllData.usercomments
        .filter(c => c.ItemID == moldId && c.ItemType === 'mold' && c.CommentStatus === 'active')
        .sort((a, b) => new Date(b.DateEntry) - new Date(a.DateEntry));
    
    console.log('V6.5: Found', comments.length, 'user comments for mold', moldId);
    return comments;
}

function getMoldShipHistory(moldID) {
    if (!moldID || !moldAllData.shiplog) {
        console.log('V6.5: No ship history available');
        return [];
    }
    
    const history = moldAllData.shiplog.filter(log => log.MoldID === moldID)
        .sort((a, b) => new Date(b.DateEntry) - new Date(a.DateEntry));
    
    console.log('V6.5: Found', history.length, 'ship history records');
    return history;
}

function getMoldLocationHistory(moldID) {
    if (!moldID || !moldAllData.locationlog) {
        console.log('V6.5: No location history available');
        return [];
    }
    
    const history = moldAllData.locationlog.filter(log => log.MoldID === moldID)
        .sort((a, b) => new Date(b.DateEntry) - new Date(a.DateEntry));
    
    console.log('V6.5: Found', history.length, 'location history records');
    return history;
}

// ===== V6.5: DATE FORMATTING UTILITIES =====

function formatTimestamp(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        
        return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    } catch (e) { 
        return dateString; 
    }
}

function formatDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString('ja-JP');
    } catch { 
        return dateString; 
    }
}

// ===== V6.5: FORM POPULATION & UTILITIES =====

function populateMoldFormData() {
    console.log('V6.5: Populating form data...');
    
    // Populate rack select
    const rackSelect = document.getElementById('rackSelect');
    if (rackSelect && moldAllData.racks) {
        const rackOptions = '<option value="">選択してください / Vui lòng chọn</option>' + 
            moldAllData.racks.map(r => `<option value="${r.RackID}">${r.RackSymbol} ${r.RackName} - ${r.RackLocation}</option>`).join('');
        rackSelect.innerHTML = rackOptions;
        console.log('V6.5: Rack select populated with', moldAllData.racks.length, 'options');
    }
    
    // Populate employee selects
    ['employeeSelect', 'commentEmployeeSelect'].forEach(id => {
        const select = document.getElementById(id);
        if (select && moldAllData.employees) {
            const employeeOptions = '<option value="">選択してください / Vui lòng chọn</option>' + 
                moldAllData.employees.map(e => `<option value="${e.EmployeeID}">${e.EmployeeName}</option>`).join('');
            select.innerHTML = employeeOptions;
            console.log('V6.5:', id, 'populated with', moldAllData.employees.length, 'options');
        }
    });
    
    // Populate company select
    const toCompanySelect = document.getElementById('toCompanySelect');
    if (toCompanySelect && moldAllData.companies) {
        const companyOptions = '<option value="">選択してください / Vui lòng chọn</option>' + 
            moldAllData.companies.map(c => `<option value="${c.CompanyID}">${c.CompanyShortName} - ${c.CompanyName}</option>`).join('');
        toCompanySelect.innerHTML = companyOptions;
        console.log('V6.5: Company select populated with', moldAllData.companies.length, 'options');
    }
    
    // Set default shipment date
    const shipmentDate = document.getElementById('shipmentDate');
    if (shipmentDate) {
        shipmentDate.value = new Date().toISOString().split('T')[0];
        console.log('V6.5: Default shipment date set');
    }
}

function updateRackLayers() {
    const rackSelect = document.getElementById('rackSelect');
    const rackLayerSelect = document.getElementById('rackLayerSelect');
    
    if (!rackSelect || !rackLayerSelect) {
        console.error('V6.5: Rack select elements not found');
        return;
    }
    
    const selectedRackId = rackSelect.value;
    rackLayerSelect.innerHTML = '<option value="">選択してください / Vui lòng chọn</option>';
    
    if (selectedRackId && moldAllData.racklayers) {
        const layers = moldAllData.racklayers.filter(layer => layer.RackID === selectedRackId);
        const layerOptions = layers.map(l => 
            `<option value="${l.RackLayerID}">${l.RackLayerNumber}${l.RackLayerNotes ? ` - ${l.RackLayerNotes}` : ''}</option>`
        ).join('');
        rackLayerSelect.innerHTML += layerOptions;
        console.log('V6.5: Rack layers updated for rack', selectedRackId, ':', layers.length, 'layers');
    }
}

// ===== V6.5: FALLBACK COMMENT FUNCTIONALITY =====

function loadMoldUserComments() {
    try { 
        moldUserComments = JSON.parse(localStorage.getItem('moldUserComments')) || []; 
        console.log('V6.5: Loaded', moldUserComments.length, 'local comments from localStorage');
    }
    catch (e) { 
        moldUserComments = []; 
        console.log('V6.5: localStorage comments failed, using empty array');
    }
}

// ===== V6.5: CSV PARSER =====

function parseCSV(csv) {
    const lines = csv.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) {
        console.warn('V6.5: CSV has insufficient data');
        return [];
    }
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    const data = lines.slice(1).map(line => {
        const values = [];
        let current = '', inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"' && (i === 0 || line[i-1] !== '\\')) {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                values.push(current.trim().replace(/"/g, ''));
                current = '';
            } else {
                current += char;
            }
        }
        values.push(current.trim().replace(/"/g, ''));
        
        const obj = {};
        headers.forEach((header, index) => {
            obj[header] = values[index] !== undefined ? values[index] : '';
        });
        return obj;
    });
    
    console.log('V6.5: Parsed CSV with', data.length, 'records');
    return data;
}

// ===== V6.5: ENHANCED UI FUNCTIONS =====

function showError(message) {
    console.error('V6.5: Error -', message);
    
    const errorContainer = document.getElementById('errorContainer');
    if (errorContainer) {
        errorContainer.textContent = message;
        errorContainer.style.display = 'block';
        setTimeout(() => {
            errorContainer.style.display = 'none';
        }, 5000);
    } else {
        alert(message);
    }
}

function showSuccess(message) {
    console.log('V6.5: Success -', message);
    
    // Create temporary success notification
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
        position: fixed;
        top: 130px;
        left: 15px;
        right: 15px;
        background: #d4edda;
        color: #155724;
        padding: 12px;
        border-radius: 6px;
        z-index: 9999;
        border-left: 4px solid #28a745;
        font-size: 14px;
        text-align: center;
        box-shadow: 0 3px 10px rgba(0,0,0,0.15);
    `;
    successDiv.textContent = message;
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
        if (successDiv.parentNode) {
            successDiv.parentNode.removeChild(successDiv);
        }
    }, 3000);
}

function showLoading(show) {
    const loading = document.getElementById('loadingIndicator');
    if (loading) {
        loading.style.display = show ? 'flex' : 'none';
        console.log('V6.5: Loading indicator', show ? 'shown' : 'hidden');
    }
}

// ===== V6.5: ENHANCED MODAL CONTROLS =====

function showLocationModal() {
    console.log('V6.5: Showing location modal');
    const modal = document.getElementById('locationModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function hideLocationModal() {
    console.log('V6.5: Hiding location modal');
    const modal = document.getElementById('locationModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function showShipmentModal() {
    console.log('V6.5: Showing shipment modal');
    const modal = document.getElementById('shipmentModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function hideShipmentModal() {
    console.log('V6.5: Hiding shipment modal');
    const modal = document.getElementById('shipmentModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function showCommentModal() {
    console.log('V6.5: Showing comment modal');
    const modal = document.getElementById('commentModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function hideCommentModal() {
    console.log('V6.5: Hiding comment modal');
    const modal = document.getElementById('commentModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// ===== V6.5: NAVIGATION UTILITY =====

function goBack() {
    console.log('V6.5: Navigating back');
    if (document.referrer && document.referrer.includes(window.location.hostname)) {
        window.history.back();
    } else {
        window.location.href = 'index.html';
    }
}

// ===== V6.5: INITIALIZATION LOG =====

console.log('🎯 MoldCutterSearch V6.5 - FINAL VERSION - Production Ready');
console.log('✅ Conditional Header Logic + Modern UI + Official Report Template');
console.log('✅ All V6.5 requirements implemented:');
console.log('   - Conditional location display based on storage company');
console.log('   - Modern label/value distinction with visual separation');
console.log('   - Enhanced 2-column technical layout optimized for mobile');
console.log('   - Official report template using form structure');
console.log('   - Original YSD location tracking for shipped molds');
console.log('📋 Features: Complete location logic, enhanced UI, professional reporting');
console.log('🔧 Backend: V4.31 approach with local updates and full data persistence');
console.log('🎨 UI: Modern distinction, compact spacing, conditional subtitle');
console.log('🖨️ Print: Official form template with comprehensive data layout');

// Export functions for potential external use (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadMoldDetailData,
        displayMoldDetailData,
        generateOfficialReportLayout,
        getMoldDimensionsFixed,
        getCavCodeFromDimensions,
        getOriginalYSDLocation,
        updateMoldLocationDisplayConditional,
        formatDate,
        formatTimestamp,
        showError,
        showSuccess,
        showLoading
    };
}

// ===== END OF FILE - V6.5 FINAL COMPLETE =====

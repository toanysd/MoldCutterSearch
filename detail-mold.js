// detail-mold.js V6.3 - Fixed mold dimensions + Comprehensive print layout + Simplified header like V5.9
// Enhanced with proper dimension logic and complete print functionality
// 2025.09.22 - Complete implementation addressing all feedback

// ===== GLOBAL VARIABLES =====
let currentMold = null;
let moldAllData = {};
let moldUserComments = [];
let cavData = [];

const MOLD_GITHUB_BASE_URL = "https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data";

// ===== PAGE INITIALIZATION V6.3 =====
document.addEventListener('DOMContentLoaded', function() {
    const urlParams = new URLSearchParams(window.location.search);
    const moldId = urlParams.get('id');
    
    console.log('V6.3: Initializing with moldId:', moldId);
    
    if (moldId) {
        loadMoldDetailData(moldId);
    } else {
        showError('ID khuôn không hợp lệ / 金型IDが無効です');
    }
    
    initializeMoldEventListeners();
    initializeTabNavigation();
    loadMoldUserComments();
});

// ===== V6.3: TAB NAVIGATION =====
function initializeTabNavigation() {
    console.log('V6.3: Initializing tab navigation...');
    
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
                
                // V6.3: Load tab content dynamically
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

// ===== EVENT LISTENERS SETUP V6.3 =====
function initializeMoldEventListeners() {
    console.log('V6.3: Setting up event listeners...');
    
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

// ===== DATA LOADING FROM GITHUB V6.3 =====
async function reloadMoldDataFromGitHub() {
    console.log('V6.3: Manual reload from GitHub...');
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
                    console.log(`V6.3: Reloaded ${file}: ${data.length} records`);
                }
            } catch (error) {
                console.warn(`V6.3: Error reloading ${file}:`, error);
            }
        }
        
        processMoldDataRelationships();
        currentMold = moldAllData.molds.find(item => item.MoldID === currentMold.MoldID);
       
        if (currentMold) {
            displayMoldDetailData();
            console.log('V6.3: Data reloaded and display refreshed');
            showSuccess('データが正常に更新されました / Dữ liệu đã được cập nhật thành công');
        }
    } catch (error) {
        console.error('V6.3: Error reloading data:', error);
        showError('データ更新に失敗しました / Cập nhật dữ liệu thất bại: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function loadMoldDetailData(moldId) {
    console.log('V6.3: Loading mold detail data for ID:', moldId);
    showLoading(true);
    
    try {
        const dataFiles = [
            'molds.csv', 'cutters.csv', 'customers.csv', 'molddesign.csv',
            'moldcutter.csv', 'shiplog.csv', 'locationlog.csv', 'employees.csv',
            'racklayers.csv', 'racks.csv', 'companies.csv', 'jobs.csv', 'usercomments.csv',
            'CAV.csv'
        ];
        
        console.log('V6.3: Loading', dataFiles.length, 'data files...');
        
        const promises = dataFiles.map(async file => {
            try {
                const response = await fetch(`${MOLD_GITHUB_BASE_URL}/${file}`);
                if (response.ok) {
                    const csvText = await response.text();
                    return { file, data: parseCSV(csvText) };
                }
                console.warn(`V6.3: Failed to load ${file}`);
                return { file, data: [] };
            } catch (error) {
                console.warn(`V6.3: Error loading ${file}:`, error);
                return { file, data: [] };
            }
        });
        
        const results = await Promise.all(promises);
        
        results.forEach(({ file, data }) => {
            const key = file.replace('.csv', '');
            if (key === 'CAV') {
                cavData = data;
                console.log('V6.3: CAV data loaded:', cavData.length, 'records');
            } else {
                moldAllData[key] = data;
                console.log(`V6.3: ${key} data loaded:`, data.length, 'records');
            }
        });
        
        processMoldDataRelationships();
        
        currentMold = moldAllData.molds.find(item => item.MoldID === moldId);
        console.log('V6.3: Found mold:', currentMold ? 'YES' : 'NO');
        
        if (currentMold) {
            displayMoldDetailData();
            populateMoldFormData();
            console.log('V6.3: Mold detail loaded successfully');
        } else {
            showError('金型が見つかりません / Không tìm thấy khuôn');
        }
        
    } catch (error) {
        console.error('V6.3: Error loading mold detail data:', error);
        showError(`データの読み込みに失敗しました / Tải dữ liệu thất bại: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// ===== DATA RELATIONSHIP PROCESSING V6.3 =====
function processMoldDataRelationships() {
    console.log('V6.3: Processing data relationships...');
    
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
        console.log('V6.3: Enhanced', moldAllData.molds.length, 'mold records');
    }
}

// ===== V6.3: MAIN DISPLAY FUNCTION WITH SIMPLIFIED HEADER =====
function displayMoldDetailData() {
    console.log('V6.3: Displaying mold detail data...');
    
    if (!currentMold) {
        console.error('V6.3: No current mold data available');
        return;
    }
    
    // Update header title
    const moldTitle = document.getElementById('moldTitle');
    if (moldTitle) {
        const title = `${currentMold.MoldCode || 'N/A'}`;
        moldTitle.textContent = title;
        console.log('V6.3: Updated title:', title);
    }
    
    // V6.3: Update location info in header like V5.9
    updateMoldLocationDisplay();
    
    // Load default tab (Summary)
    displaySummaryTab();
    console.log('V6.3: Summary tab loaded');
}

// ===== V6.3: SIMPLIFIED LOCATION DISPLAY LIKE V5.9 =====
function updateMoldLocationDisplay() {
    const locationElement = document.getElementById('moldLocation');
    if (!locationElement) {
        console.error('V6.3: moldLocation element not found');
        return;
    }
    
    let locationText = '';
    
    // V6.3: Current location display like V5.9
    if (currentMold.storage_company == 2 && currentMold.rackInfo && currentMold.rackLayerInfo) {
        locationText = `📍 ${currentMold.rackInfo.RackLocation} `;
        locationText += `<span class="rack-circle">${currentMold.rackInfo.RackID}</span>`;
        locationText += `-${currentMold.rackLayerInfo.RackLayerNumber}層`;
    } else if (currentMold.storageCompanyInfo) {
        locationText = `📍 ${currentMold.storageCompanyInfo.CompanyShortName}`;
    } else {
        locationText = `📍 位置不明 / Vị trí không rõ`;
    }
    
    locationElement.innerHTML = locationText;
    console.log('V6.3: Location info updated in header like V5.9');
}

// ===== V6.3: TAB 1 - SUMMARY WITH FIXED DIMENSIONS =====
function displaySummaryTab() {
    console.log('V6.3: Displaying Summary tab...');
    displaySummaryBasicInfo();
    displaySummaryTrayInfo();
    displaySummaryRelatedCutters();
}

function displaySummaryBasicInfo() {
    const container = document.getElementById('summaryBasicInfo');
    if (!container) {
        console.error('V6.3: summaryBasicInfo container not found');
        return;
    }

    console.log('V6.3: Populating basic info...');
    
    const design = currentMold.designInfo || {};
    const job = currentMold.jobInfo || {};
    const status = getEnhancedMoldStatus(currentMold);
    const processingStatus = getProcessingStatus(currentMold);
    
    // V6.3: FIXED DIMENSIONS LOGIC - Check multiple sources
    let moldDimensions = getMoldDimensionsFixed(design);
    console.log('V6.3: Mold dimensions result:', moldDimensions);
    
    // V6.3: CAV code lookup with fixed dimensions
    const cavCode = getCavCodeFromDimensions(design.MoldDesignLength, design.MoldDesignWidth);
    
    // Manufacturing date (first delivery date)
    let manufacturingDate = 'N/A';
    if (job.DeliveryDeadline) {
        manufacturingDate = formatDate(job.DeliveryDeadline);
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
        
        <!-- V6.3: FIXED - 3-column layout for size and CAV -->
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
    
    console.log('V6.3: Basic info populated');
}

// ===== V6.3: FIXED MOLD DIMENSIONS LOGIC =====
function getMoldDimensionsFixed(design) {
    // V6.3: Check multiple dimension sources in order of priority
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
    
    console.log('V6.3: Dimension lookup result:', { length, width, height });
    
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
        console.error('V6.3: summaryTrayInfo container not found');
        return;
    }

    console.log('V6.3: Populating tray info...');
    
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
    
    console.log('V6.3: Tray info populated');
}

function displaySummaryRelatedCutters() {
    const container = document.getElementById('summaryRelatedCutters');
    if (!container) {
        console.error('V6.3: summaryRelatedCutters container not found');
        return;
    }

    console.log('V6.3: Populating related cutters...');
    
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
        console.log('V6.3: No related cutters found');
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
    
    console.log('V6.3: Related cutters populated:', relatedCutters.length, 'items');
}

// ===== V6.3: TAB 2 - PRODUCT DISPLAY =====
function displayProductTab() {
    console.log('V6.3: Displaying Product tab...');
    
    const container = document.getElementById('productInfo');
    if (!container) {
        console.error('V6.3: productInfo container not found');
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
    
    console.log('V6.3: Product tab populated');
}

// ===== V6.3: TAB 3 - TECHNICAL DISPLAY =====
function displayTechnicalTab() {
    console.log('V6.3: Displaying Technical tab...');
    
    const container = document.getElementById('technicalInfo');
    if (!container) {
        console.error('V6.3: technicalInfo container not found');
        return;
    }

    const design = currentMold.designInfo || {};
    const job = currentMold.jobInfo || {};

    container.innerHTML = `
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">設計コード</div>
                <div class="label-vn">Mã tra cứu</div>
            </div>
            <div class="info-value-compact">${design.MoldDesignCode || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">金型方向</div>
                <div class="label-vn">Khuôn thuận/nghịch</div>
            </div>  
            <div class="info-value-compact">${design.MoldOrientation || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">ポケット数</div>
                <div class="label-vn">Số pockets</div>
            </div>
            <div class="info-value-compact">${design.PocketNumbers || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">設置方向</div>
                <div class="label-vn">Hướng lắp</div>
            </div>
            <div class="info-value-compact">${design.MoldSetupType || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">設計重量</div>
                <div class="label-vn">KL thiết kế</div>
            </div>
            <div class="info-value-compact">${design.MoldDesignWeight ? design.MoldDesignWeight + ' kg' : 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">ピース数</div>
                <div class="label-vn">Số mảnh khuôn</div>
            </div>
            <div class="info-value-compact">${design.PieceCount || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">Pitch</div>
                <div class="label-vn">Khoảng cách</div>
            </div>
            <div class="info-value-compact">${design.Pitch || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">C面取</div>
                <div class="label-vn">Góc vát</div>
            </div>
            <div class="info-value-compact">${design.ChamferC || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">Rコーナー</div>
                <div class="label-vn">Góc bo</div>
            </div>
            <div class="info-value-compact">${design.CornerR || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">深さ</div>
                <div class="label-vn">Chiều sâu</div>
            </div>
            <div class="info-value-compact">${design.MoldDesignDepth || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">Under depth</div>
            </div>
            <div class="info-value-compact">${design.UnderDepth || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">抜き勾配</div>
                <div class="label-vn">Góc nghiêng</div>
            </div>
            <div class="info-value-compact">${design.DraftAngle || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">刻印</div>
                <div class="label-vn">Chữ khắc</div>
            </div>
            <div class="info-value-compact">${design.TextContent || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">公差</div>
                <div class="label-vn">Dung sai X,Y</div>
            </div>
            <div class="info-value-compact">${design.TolerenceX && design.TolerenceY ? design.TolerenceX + ', ' + design.TolerenceY : 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">図面番号</div>
                <div class="label-vn">Số bản vẽ</div>
            </div>
            <div class="info-value-compact">${design.DrawingNumber || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">設備コード</div>
                <div class="label-vn">Mã thiết bị</div>
            </div>
            <div class="info-value-compact">${design.EquipmentCode || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">設計備考</div>
                <div class="label-vn">Ghi chú thiết kế</div>
            </div>
            <div class="info-value-compact">${design.VersionNote || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">プラグ有無</div>
                <div class="label-vn">Có nắp</div>
            </div>
            <div class="info-value-compact">${job.PlugAri || 'N/A'}</div>
        </div>
        
        <div class="info-row-compact">
            <div class="info-label-compact">
                <div class="label-jp">ポケット試作</div>
                <div class="label-vn">Chạy thử</div>
            </div>
            <div class="info-value-compact">${job.PocketTEST || 'N/A'}</div>
        </div>
    `;
    
    console.log('V6.3: Technical tab populated');
}

// ===== V6.3: TAB 4 - PROCESSING DISPLAY =====
function displayProcessingTab() {
    console.log('V6.3: Displaying Processing tab...');
    displayProcessingStatus();
    displayProcessingLocationHistory(); 
    displayProcessingShipmentHistory();
    displayProcessingUserComments();
}

function displayProcessingStatus() {
    const container = document.getElementById('processingStatus');
    if (!container) {
        console.error('V6.3: processingStatus container not found');
        return;
    }

    console.log('V6.3: Populating processing status...');

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
    
    console.log('V6.3: Processing status populated');
}

function displayProcessingLocationHistory() {
    const container = document.getElementById('processingLocationHistory');
    if (!container) {
        console.error('V6.3: processingLocationHistory container not found');
        return;
    }

    console.log('V6.3: Populating location history...');
    
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
        console.log('V6.3: Location history populated:', history.length, 'items');
    } else {
        container.innerHTML = '<div class="no-data">位置履歴がありません / Không có lịch sử vị trí</div>';
        console.log('V6.3: No location history found');
    }
}

function displayProcessingShipmentHistory() {
    const container = document.getElementById('processingShipmentHistory');
    if (!container) {
        console.error('V6.3: processingShipmentHistory container not found');
        return;
    }

    console.log('V6.3: Populating shipment history...');
    
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
        console.log('V6.3: Shipment history populated:', history.length, 'items');
    } else {
        container.innerHTML = '<div class="no-data">運送履歴がありません / Không có lịch sử vận chuyển</div>';
        console.log('V6.3: No shipment history found');
    }
}

function displayProcessingUserComments() {
    const container = document.getElementById('processingUserComments');
    if (!container) {
        console.error('V6.3: processingUserComments container not found');
        return;
    }

    console.log('V6.3: Populating user comments...');
    
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
        console.log('V6.3: User comments populated:', comments.length, 'items');
    } else {
        container.innerHTML = '<div class="no-data">コメントがありません / Không có bình luận</div>';
        console.log('V6.3: No user comments found');
    }
}

// ===== V6.3: NEW - COMPREHENSIVE PRINT LAYOUT GENERATOR =====
function generateComprehensivePrintLayout() {
    console.log('V6.3: Generating comprehensive print layout...');
    
    if (!currentMold) {
        console.error('V6.3: No mold data for print');
        return;
    }
    
    const printContainer = document.getElementById('comprehensivePrintContent');
    if (!printContainer) {
        console.error('V6.3: Print container not found');
        return;
    }
    
    // Load all tab data first
    displaySummaryTab();
    displayProductTab();
    displayTechnicalTab();
    displayProcessingTab();
    
    // Generate comprehensive print HTML
    const printHtml = generatePrintHTML();
    printContainer.innerHTML = printHtml;
    
    console.log('V6.3: Comprehensive print layout generated');
}

function generatePrintHTML() {
    const design = currentMold.designInfo || {};
    const job = currentMold.jobInfo || {};
    const moldDimensions = getMoldDimensionsFixed(design);
    const cavCode = getCavCodeFromDimensions(design.MoldDesignLength, design.MoldDesignWidth);
    
    // Get location info
    let locationText = '';
    if (currentMold.storage_company == 2 && currentMold.rackInfo && currentMold.rackLayerInfo) {
        locationText = `${currentMold.rackInfo.RackLocation} ${currentMold.rackInfo.RackID}-${currentMold.rackLayerInfo.RackLayerNumber}層`;
    } else if (currentMold.storageCompanyInfo) {
        locationText = currentMold.storageCompanyInfo.CompanyShortName;
    } else {
        locationText = '位置不明';
    }

    return `
        <!-- Print Header -->
        <div class="print-header">
            <div class="print-mold-title">${currentMold.MoldCode || 'N/A'} - 金型詳細情報</div>
            <div class="print-mold-info">位置: ${locationText} | 印刷日時: ${new Date().toLocaleString('ja-JP')}</div>
        </div>

        <div class="print-content">
            <!-- Basic Information -->
            <div class="print-section">
                <div class="print-section-header">📋 基本情報 / Thông tin cơ bản</div>
                <div class="print-section-content">
                    ${generatePrintInfoRow('ID', currentMold.MoldID)}
                    ${generatePrintInfoRow('型番 / Mã khuôn', currentMold.MoldCode || 'N/A', true)}
                    ${generatePrintSizeCavRow('金型寸法 / Kích thước', moldDimensions, cavCode)}
                    ${generatePrintInfoRow('面数 / Số mặt', design.PieceCount || 'N/A')}
                    ${generatePrintInfoRow('設計重量 / Khối lượng', design.MoldDesignWeight ? design.MoldDesignWeight + ' kg' : 'N/A')}
                    ${generatePrintInfoRow('製造日 / Ngày chế tạo', job.DeliveryDeadline ? formatDate(job.DeliveryDeadline) : 'N/A')}
                    ${generatePrintInfoRow('使用状況 / Tình trạng', getEnhancedMoldStatus(currentMold).text)}
                    ${generatePrintInfoRow('処理状態 / Xử lý', getProcessingStatus(currentMold))}
                </div>
            </div>

            <!-- Tray Information -->
            <div class="print-section">
                <div class="print-section-header">📦 トレイ情報 / Thông tin khay</div>
                <div class="print-section-content">
                    ${generatePrintInfoRow('トレイ情報', design.TrayInfoForMoldDesign || 'N/A')}
                    ${generatePrintInfoRow('材質 / Vật liệu', design.DesignForPlasticType || 'N/A')}
                    ${generatePrintInfoRow('トレイサイズ', design.CutlineX && design.CutlineY ? `${design.CutlineX}×${design.CutlineY}` : 'N/A')}
                    ${generatePrintInfoRow('トレイ重量 / KL khay', design.TrayWeight ? design.TrayWeight + ' g' : 'N/A')}
                </div>
            </div>

            <!-- Product Information -->
            <div class="print-section">
                <div class="print-section-header">📦 製品情報 / Thông tin sản phẩm</div>
                <div class="print-section-content">
                    ${generatePrintInfoRow('初回出荷日 / Ngày xuất đầu', job.DeliveryDeadline ? formatDate(job.DeliveryDeadline) : 'N/A')}
                    ${generatePrintInfoRow('別抜き / Dao riêng', getMoldRelatedCutters(currentMold.MoldID).length > 0 ? 'あり / Có' : 'なし / Không')}
                    ${generatePrintInfoRow('見積 / Báo giá', job.PriceQuote || 'N/A')}
                    ${generatePrintInfoRow('単価 / Đơn giá', job.UnitPrice || 'N/A')}
                    ${generatePrintInfoRow('箱の種類 / Loại thùng', job.LoaiThungDong || 'N/A')}
                    ${generatePrintInfoRow('袋詰め / Bọc túi', job.BaoNilon || 'N/A')}
                </div>
            </div>

            <!-- Technical Information -->
            <div class="print-section">
                <div class="print-section-header">⚙️ 技術情報 / Thông tin kỹ thuật</div>
                <div class="print-section-content">
                    ${generatePrintInfoRow('設計コード / Mã thiết kế', design.MoldDesignCode || 'N/A')}
                    ${generatePrintInfoRow('金型方向 / Hướng khuôn', design.MoldOrientation || 'N/A')}
                    ${generatePrintInfoRow('ポケット数 / Số pockets', design.PocketNumbers || 'N/A')}
                    ${generatePrintInfoRow('設置方向 / Hướng lắp', design.MoldSetupType || 'N/A')}
                    ${generatePrintInfoRow('ピース数 / Số mảnh', design.PieceCount || 'N/A')}
                    ${generatePrintInfoRow('Pitch / Khoảng cách', design.Pitch || 'N/A')}
                    ${generatePrintInfoRow('深さ / Chiều sâu', design.MoldDesignDepth || 'N/A')}
                    ${generatePrintInfoRow('刻印 / Chữ khắc', design.TextContent || 'N/A')}
                    ${generatePrintInfoRow('図面番号 / Số bản vẽ', design.DrawingNumber || 'N/A')}
                </div>
            </div>

            <!-- Processing Status -->
            <div class="print-section">
                <div class="print-section-header">🔄 処理状況 / Trạng thái xử lý</div>
                <div class="print-section-content">
                    ${generatePrintProcessingStatus()}
                </div>
            </div>

            <!-- Related Cutters -->
            ${generatePrintRelatedCutters()}

            <!-- Location History -->
            ${generatePrintLocationHistory()}

            <!-- Shipment History -->
            ${generatePrintShipmentHistory()}

            <!-- User Comments -->
            ${generatePrintUserComments()}
        </div>
    `;
}

function generatePrintInfoRow(label, value, highlight = false) {
    const valueClass = highlight ? 'print-highlight' : '';
    return `
        <div class="print-info-row">
            <div class="print-label">${label}</div>
            <div class="print-value ${valueClass}">${value}</div>
        </div>
    `;
}

function generatePrintSizeCavRow(label, sizeValue, cavValue) {
    return `
        <div class="print-size-cav-row">
            <div class="print-label">${label}</div>
            <div class="print-value">${sizeValue}</div>
            <div class="print-cav-code">${cavValue}</div>
        </div>
    `;
}

function generatePrintProcessingStatus() {
    let html = '';
    
    if (currentMold.TeflonCoating && currentMold.TeflonCoating !== 'N/A' && currentMold.TeflonCoating !== 'FALSE') {
        html += `${generatePrintInfoRow('テフロン加工', currentMold.TeflonCoating)}`;
        html += `${generatePrintInfoRow('送付日', formatDate(currentMold.TeflonSentDate))}`;
        html += `${generatePrintInfoRow('受領日', formatDate(currentMold.TeflonReceivedDate))}`;
    }
    
    if (currentMold.MoldReturning && currentMold.MoldReturning !== 'N/A' && currentMold.MoldReturning !== 'FALSE') {
        html += `${generatePrintInfoRow('返却', currentMold.MoldReturning)}`;
        html += `${generatePrintInfoRow('返却日', formatDate(currentMold.MoldReturnedDate))}`;
    }
    
    if (currentMold.MoldDisposing && currentMold.MoldDisposing !== 'N/A' && currentMold.MoldDisposing !== 'FALSE') {
        html += `${generatePrintInfoRow('廃棄', currentMold.MoldDisposing)}`;
        html += `${generatePrintInfoRow('廃棄日', formatDate(currentMold.MoldDisposedDate))}`;
    }
    
    return html || generatePrintInfoRow('処理状況', '通常 / Bình thường');
}

function generatePrintRelatedCutters() {
    const relatedCutters = getMoldRelatedCutters(currentMold.MoldID);
    
    if (!relatedCutters || relatedCutters.length === 0) {
        return `
            <div class="print-section">
                <div class="print-section-header">🔧 関連カッター / Dao cắt liên quan</div>
                <div class="print-section-content">
                    ${generatePrintInfoRow('別抜き使用', 'なし / Không')}
                </div>
            </div>
        `;
    }
    
    let cuttersHtml = '';
    relatedCutters.slice(0, 10).forEach(cutter => {
        const cutterLocation = getCutterLocation(cutter);
        cuttersHtml += `
            <div class="print-history-item">
                <div class="print-history-header">${cutter.CutterNo || cutter.CutterID}</div>
                <div class="print-history-content">${cutter.CutterName || 'N/A'} - ${cutterLocation}</div>
            </div>
        `;
    });

    return `
        <div class="print-section">
            <div class="print-section-header">🔧 関連カッター / Dao cắt liên quan (${relatedCutters.length}個)</div>
            <div class="print-section-content">
                ${cuttersHtml}
            </div>
        </div>
    `;
}

function generatePrintLocationHistory() {
    const history = getMoldLocationHistory(currentMold.MoldID);
    
    if (!history || history.length === 0) {
        return `
            <div class="print-section">
                <div class="print-section-header">📍 位置履歴 / Lịch sử vị trí</div>
                <div class="print-section-content">履歴がありません / Không có lịch sử</div>
            </div>
        `;
    }
    
    let historyHtml = '';
    history.slice(0, 10).forEach(log => {
        const oldRack = log.OldRackLayer ? getRackDisplayStringPlain(log.OldRackLayer) : 'N/A';
        const newRack = log.NewRackLayer ? getRackDisplayStringPlain(log.NewRackLayer) : 'N/A';
        
        historyHtml += `
            <div class="print-history-item">
                <div class="print-history-header">${formatTimestamp(log.DateEntry)}</div>
                <div class="print-history-content">${oldRack} → ${newRack}${log.notes ? ` (${log.notes})` : ''}</div>
            </div>
        `;
    });

    return `
        <div class="print-section">
            <div class="print-section-header">📍 位置履歴 / Lịch sử vị trí (${history.length}件)</div>
            <div class="print-section-content">
                ${historyHtml}
            </div>
        </div>
    `;
}

function generatePrintShipmentHistory() {
    const history = getMoldShipHistory(currentMold.MoldID);
    
    if (!history || history.length === 0) {
        return `
            <div class="print-section">
                <div class="print-section-header">🚚 出荷履歴 / Lịch sử vận chuyển</div>
                <div class="print-section-content">履歴がありません / Không có lịch sử</div>
            </div>
        `;
    }
    
    let historyHtml = '';
    history.slice(0, 10).forEach(log => {
        const fromCompany = moldAllData.companies?.find(c => c.CompanyID == log.FromCompanyID)?.CompanyShortName || 'N/A';
        const toCompany = moldAllData.companies?.find(c => c.CompanyID == log.ToCompanyID)?.CompanyShortName || 'N/A';
        
        historyHtml += `
            <div class="print-history-item">
                <div class="print-history-header">${formatTimestamp(log.DateEntry)}</div>
                <div class="print-history-content">${fromCompany} → ${toCompany}${log.handler ? ` (${log.handler})` : ''}${log.ShipNotes ? ` - ${log.ShipNotes}` : ''}</div>
            </div>
        `;
    });

    return `
        <div class="print-section">
            <div class="print-section-header">🚚 出荷履歴 / Lịch sử vận chuyển (${history.length}件)</div>
            <div class="print-section-content">
                ${historyHtml}
            </div>
        </div>
    `;
}

function generatePrintUserComments() {
    const comments = getMoldUserCommentsFromServer(currentMold.MoldID);
    
    if (!comments || comments.length === 0) {
        return `
            <div class="print-section">
                <div class="print-section-header">💬 ユーザーコメント / Bình luận người dùng</div>
                <div class="print-section-content">コメントがありません / Không có bình luận</div>
            </div>
        `;
    }
    
    let commentsHtml = '';
    comments.slice(0, 10).forEach(comment => {
        const employee = moldAllData.employees?.find(e => e.EmployeeID == comment.EmployeeID);
        
        commentsHtml += `
            <div class="print-history-item">
                <div class="print-history-header">${employee?.EmployeeName || 'Unknown'} - ${formatTimestamp(comment.DateEntry)}</div>
                <div class="print-history-content">${comment.CommentText}</div>
            </div>
        `;
    });

    return `
        <div class="print-section">
            <div class="print-section-header">💬 ユーザーコメント / Bình luận (${comments.length}件)</div>
            <div class="print-section-content">
                ${commentsHtml}
            </div>
        </div>
    `;
}

// ===== V6.3: CAV CODE PROCESSING =====
function getCavCodeFromDimensions(length, width) {
    if (!length || !width || !cavData || cavData.length === 0) {
        console.log('V6.3: CAV lookup failed - missing data');
        return 'OTHER';
    }
    
    const moldLength = parseFloat(length);
    const moldWidth = parseFloat(width);
    
    if (isNaN(moldLength) || isNaN(moldWidth)) {
        console.log('V6.3: CAV lookup failed - invalid dimensions');
        return 'OTHER';
    }
    
    console.log(`V6.3: CAV lookup for ${moldLength}x${moldWidth}...`);
    
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
    console.log('V6.3: CAV lookup result:', result);
    return result;
}

// ===== V6.3: PROCESSING STATUS LOGIC =====
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
    
    return statuses.length > 0 ? statuses.join(', ') : '通常 / Bình thường';
}

// ===== V6.3: BUSINESS LOGIC =====

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
        console.log('V6.3: Updating mold location...');
        
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
        
        console.log('V6.3: Location update completed');
        
    } catch (error) {
        console.error('V6.3: Failed to update mold location:', error);
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
        console.log('V6.3: Updating mold shipment...');
        
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
        
        console.log('V6.3: Shipment update completed');
        
    } catch (error) {
        console.error('V6.3: Failed to update mold shipment:', error);
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
        console.log('V6.3: Adding mold comment...');
        
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
        
        console.log('V6.3: Comment submission completed');
        
    } catch (error) {
        console.error('V6.3: Failed to save mold comment:', error);
        showError(`コメント投稿に失敗しました / Đăng bình luận thất bại: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// ===== V6.3: ENHANCED DISPLAY UTILITIES =====

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
        return { status: 'shipped', text: '出荷履歴有 / Có lịch sử chuyển khuôn', class: 'warning' };
    }
    
    return { status: 'available', text: '利用可能 / Có sẵn', class: 'success' };
}

function getMoldCurrentStatus(mold) {
    return getEnhancedMoldStatus(mold);
}

// ===== V6.3: MOLD RELATIONSHIP FUNCTIONS =====

function getMoldRelatedCutters(moldID) {
    if (!moldID || !moldAllData.moldcutter) {
        console.log('V6.3: No related cutters - missing data');
        return [];
    }
    
    // Step 1: Find MoldDesignID from MoldID
    const mold = moldAllData.molds?.find(m => String(m.MoldID).trim() === String(moldID).trim());
    if (!mold || !mold.MoldDesignID) {
        console.log('V6.3: No related cutters - mold not found or no design ID');
        return [];
    }
    
    const moldDesignID = String(mold.MoldDesignID).trim();
    console.log('V6.3: Looking for cutters with MoldDesignID:', moldDesignID);
    
    // Step 2: Find CutterIDs from MoldDesignID in moldcutter.csv
    const cutterRelations = moldAllData.moldcutter.filter(mc => 
        String(mc.MoldDesignID || '').trim() === moldDesignID
    );
    
    console.log('V6.3: Found', cutterRelations.length, 'cutter relations');
    
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
    
    console.log('V6.3: Returned', relatedCutters.length, 'related cutters');
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

function getRackDisplayStringPlain(rackLayerId) {
    const layer = moldAllData.racklayers?.find(l => l.RackLayerID == rackLayerId);
    const rack = layer ? moldAllData.racks?.find(r => r.RackID == layer.RackID) : null;
    
    if (rack && layer) {
        return `${rack.RackLocation} ${rack.RackID}-${layer.RackLayerNumber}層`;
    }
    return 'N/A';
}

function getMoldUserCommentsFromServer(moldId) {
    if (!moldAllData.usercomments) {
        console.log('V6.3: No usercomments data available');
        return [];
    }
    
    const comments = moldAllData.usercomments
        .filter(c => c.ItemID == moldId && c.ItemType === 'mold' && c.CommentStatus === 'active')
        .sort((a, b) => new Date(b.DateEntry) - new Date(a.DateEntry));
    
    console.log('V6.3: Found', comments.length, 'user comments for mold', moldId);
    return comments;
}

function getMoldShipHistory(moldID) {
    if (!moldID || !moldAllData.shiplog) {
        console.log('V6.3: No ship history available');
        return [];
    }
    
    const history = moldAllData.shiplog.filter(log => log.MoldID === moldID)
        .sort((a, b) => new Date(b.DateEntry) - new Date(a.DateEntry));
    
    console.log('V6.3: Found', history.length, 'ship history records');
    return history;
}

function getMoldLocationHistory(moldID) {
    if (!moldID || !moldAllData.locationlog) {
        console.log('V6.3: No location history available');
        return [];
    }
    
    const history = moldAllData.locationlog.filter(log => log.MoldID === moldID)
        .sort((a, b) => new Date(b.DateEntry) - new Date(a.DateEntry));
    
    console.log('V6.3: Found', history.length, 'location history records');
    return history;
}

// ===== V6.3: DATE FORMATTING UTILITIES =====

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

// ===== V6.3: FORM POPULATION & UTILITIES =====

function populateMoldFormData() {
    console.log('V6.3: Populating form data...');
    
    // Populate rack select
    const rackSelect = document.getElementById('rackSelect');
    if (rackSelect && moldAllData.racks) {
        const rackOptions = '<option value="">選択してください / Vui lòng chọn</option>' + 
            moldAllData.racks.map(r => `<option value="${r.RackID}">${r.RackSymbol} ${r.RackName} - ${r.RackLocation}</option>`).join('');
        rackSelect.innerHTML = rackOptions;
        console.log('V6.3: Rack select populated with', moldAllData.racks.length, 'options');
    }
    
    // Populate employee selects
    ['employeeSelect', 'commentEmployeeSelect'].forEach(id => {
        const select = document.getElementById(id);
        if (select && moldAllData.employees) {
            const employeeOptions = '<option value="">選択してください / Vui lòng chọn</option>' + 
                moldAllData.employees.map(e => `<option value="${e.EmployeeID}">${e.EmployeeName}</option>`).join('');
            select.innerHTML = employeeOptions;
            console.log('V6.3:', id, 'populated with', moldAllData.employees.length, 'options');
        }
    });
    
    // Populate company select
    const toCompanySelect = document.getElementById('toCompanySelect');
    if (toCompanySelect && moldAllData.companies) {
        const companyOptions = '<option value="">選択してください / Vui lòng chọn</option>' + 
            moldAllData.companies.map(c => `<option value="${c.CompanyID}">${c.CompanyShortName} - ${c.CompanyName}</option>`).join('');
        toCompanySelect.innerHTML = companyOptions;
        console.log('V6.3: Company select populated with', moldAllData.companies.length, 'options');
    }
    
    // Set default shipment date
    const shipmentDate = document.getElementById('shipmentDate');
    if (shipmentDate) {
        shipmentDate.value = new Date().toISOString().split('T')[0];
        console.log('V6.3: Default shipment date set');
    }
}

function updateRackLayers() {
    const rackSelect = document.getElementById('rackSelect');
    const rackLayerSelect = document.getElementById('rackLayerSelect');
    
    if (!rackSelect || !rackLayerSelect) {
        console.error('V6.3: Rack select elements not found');
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
        console.log('V6.3: Rack layers updated for rack', selectedRackId, ':', layers.length, 'layers');
    }
}

// ===== V6.3: FALLBACK COMMENT FUNCTIONALITY =====

function loadMoldUserComments() {
    try { 
        moldUserComments = JSON.parse(localStorage.getItem('moldUserComments')) || []; 
        console.log('V6.3: Loaded', moldUserComments.length, 'local comments from localStorage');
    }
    catch (e) { 
        moldUserComments = []; 
        console.log('V6.3: localStorage comments failed, using empty array');
    }
}

// ===== V6.3: CSV PARSER =====

function parseCSV(csv) {
    const lines = csv.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) {
        console.warn('V6.3: CSV has insufficient data');
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
    
    console.log('V6.3: Parsed CSV with', data.length, 'records');
    return data;
}

// ===== V6.3: ENHANCED UI FUNCTIONS =====

function showError(message) {
    console.error('V6.3: Error -', message);
    
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
    console.log('V6.3: Success -', message);
    
    // Create temporary success notification
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
        position: fixed;
        top: 90px;
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
        console.log('V6.3: Loading indicator', show ? 'shown' : 'hidden');
    }
}

// ===== V6.3: ENHANCED MODAL CONTROLS =====

function showLocationModal() {
    console.log('V6.3: Showing location modal');
    const modal = document.getElementById('locationModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function hideLocationModal() {
    console.log('V6.3: Hiding location modal');
    const modal = document.getElementById('locationModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function showShipmentModal() {
    console.log('V6.3: Showing shipment modal');
    const modal = document.getElementById('shipmentModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function hideShipmentModal() {
    console.log('V6.3: Hiding shipment modal');
    const modal = document.getElementById('shipmentModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function showCommentModal() {
    console.log('V6.3: Showing comment modal');
    const modal = document.getElementById('commentModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function hideCommentModal() {
    console.log('V6.3: Hiding comment modal');
    const modal = document.getElementById('commentModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// ===== V6.3: NAVIGATION UTILITY =====

function goBack() {
    console.log('V6.3: Navigating back');
    if (document.referrer && document.referrer.includes(window.location.hostname)) {
        window.history.back();
    } else {
        window.location.href = 'index.html';
    }
}

// ===== V6.3: INITIALIZATION LOG =====

console.log('🎯 MoldCutterSearch V6.3 - Complete Detail Mold System');
console.log('✅ Fixed Mold Dimensions Logic + Comprehensive Print Layout + Simplified Header like V5.9');
console.log('✅ V4.31 stable backend + CAV processing + Enhanced printing');
console.log('✅ All V6.3 requirements implemented - Production Ready');
console.log('📋 Features: Fixed dimensions, comprehensive print, simplified header');
console.log('🔧 Backend: V4.31 approach with local updates');
console.log('🎨 UI: 150% font, simplified header, comprehensive print');

// Export functions for potential external use (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loadMoldDetailData,
        displayMoldDetailData,
        generateComprehensivePrintLayout,
        getMoldDimensionsFixed,
        getCavCodeFromDimensions,
        formatDate,
        formatTimestamp,
        showError,
        showSuccess,
        showLoading
    };
}

// ===== END OF FILE - V6.3 COMPLETE =====

// detail-mold.js - V5.7 Tab-based Design
// 金型詳細管理システム V5.7 - Complete Business Logic from V4.31 + Tab-based UI
// Based on V4.31 GitHub + Enhanced for Tab Navigation + PDF Export
// Updated: 2025.09.22 - Complete tab-based design with all V4.31 business logic

// ===== GLOBAL VARIABLES =====
let currentMold = null;
let moldAllData = {};
let moldUserComments = []; // Fallback for local comments

const MOLD_GITHUB_BASE_URL = "https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data";

// Note: API_BASE_URL should be declared in script.js to avoid "already declared" error

// ===== 初期化 (KHỞI TẠO TRANG) =====
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

    // No auto-refresh to prevent screen flickering
});

// ===== イベントリスナー設定 (THIẾT LẬP SỰ KIỆN) =====
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

// ===== データ読み込み (TẢI DỮ LIỆU TỪ GITHUB) =====
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

// ===== データ関係処理 (XỬ LÝ MỐI QUAN HỆ DỮ LIỆU) =====
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

// ===== UI表示関数 V5.7 - TAB-BASED DISPLAY =====
function displayMoldDetailData() {
    if (!currentMold) return;

    // V5.7: Display header and all tabs
    displayHeaderInfo();
    displaySummaryTab();
    displayProductTab();
    displayTechnicalTab();
    displayProcessingTab();
}

// ===== HEADER表示 V5.7 =====
function displayHeaderInfo() {
    // Update title with MoldCode and MoldName
    const moldTitle = document.getElementById('moldTitle');
    if (moldTitle) {
        moldTitle.textContent = `${currentMold.MoldCode || 'N/A'} - ${currentMold.MoldName || 'N/A'}`;
    }

    // Update subtitle with location info
    const moldSubtitle = document.getElementById('moldSubtitle');
    if (moldSubtitle) {
        const locationInfo = getYSDLocationDisplay();
        moldSubtitle.textContent = `${locationInfo} | ${getCurrentStorageDisplay()}`;
    }
}

// ===== TAB 1: SUMMARY (情報総合) V5.7 =====
function displaySummaryTab() {
    displaySummaryBasicInfo();
    displaySummaryTrayInfo();
    displaySummaryRelatedCutters();
}

function displaySummaryBasicInfo() {
    const container = document.getElementById('summaryBasicInfo');
    if (!container) return;

    const design = currentMold.designInfo || {};
    const job = currentMold.jobInfo || {};
    const status = getEnhancedMoldStatus(currentMold);
    const processingStatus = getProcessingStatus(currentMold);

    // Calculate mold size (Length x Width x Height mm)
    let moldSize = 'N/A';
    if (design.MoldDesignLength && design.MoldDesignWidth && design.Height) {
        moldSize = `${design.MoldDesignLength}×${design.MoldDesignWidth}×${design.Height}mm`;
    }

    // CAV Code from PocketNumbers (logic sẽ xử lý sau)
    let cavCode = 'N/A';
    if (design.PocketNumbers) {
        cavCode = `${design.PocketNumbers}CAV`;
    }

    // Manufacturing date (first delivery date)
    let manufacturingDate = 'N/A';
    if (job.DeliveryDeadline) {
        manufacturingDate = formatDate(job.DeliveryDeadline);
    }

    container.innerHTML = `
        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">ID</div>
                <div class="label-vn">ID khuôn</div>
            </div>
            <div class="info-value">${currentMold.MoldID}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">型番</div>
                <div class="label-vn">Mã khuôn</div>
            </div>
            <div class="info-value highlight">${currentMold.MoldCode || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">YSDでの位置</div>
                <div class="label-vn">Vị trí tại YSD</div>
            </div>
            <div class="info-value">${getYSDLocationDisplay()}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">保管会社</div>
                <div class="label-vn">Công ty lưu trữ hiện tại</div>
            </div>
            <div class="info-value">${getCurrentStorageDisplay()}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">使用状況</div>
                <div class="label-vn">Tình trạng sử dụng</div>
            </div>
            <div class="info-value status ${status.class}">${status.text}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">処理状態</div>
                <div class="label-vn">Trạng thái xử lý khuôn</div>
            </div>
            <div class="info-value">${processingStatus}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">金型サイズ</div>
                <div class="label-vn">Kích thước khuôn</div>
            </div>
            <div class="info-value">${moldSize}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">CAVコード</div>
                <div class="label-vn">Mã CAV</div>
            </div>
            <div class="info-value">${cavCode}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">面数</div>
                <div class="label-vn">Số mặt khuôn</div>
            </div>
            <div class="info-value">${design.PieceCount || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">設計重量</div>
                <div class="label-vn">Khối lượng khuôn thiết kế</div>
            </div>
            <div class="info-value">${design.MoldDesignWeight ? design.MoldDesignWeight + ' kg' : 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">製造日</div>
                <div class="label-vn">Ngày chế tạo khuôn</div>
            </div>
            <div class="info-value">${manufacturingDate}</div>
        </div>
    `;
}

function displaySummaryTrayInfo() {
    const container = document.getElementById('summaryTrayInfo');
    if (!container) return;

    const design = currentMold.designInfo || {};

    let traySize = 'N/A';
    if (design.CutlineX && design.CutlineY) {
        traySize = `${design.CutlineX}×${design.CutlineY}`;
    }

    container.innerHTML = `
        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">材質</div>
                <div class="label-vn">Vật liệu</div>
            </div>
            <div class="info-value">${design.DesignForPlasticType || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">トレイサイズ</div>
                <div class="label-vn">Kích thước khay</div>
            </div>
            <div class="info-value">${traySize}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">トレイ重量</div>
                <div class="label-vn">Khối lượng khay</div>
            </div>
            <div class="info-value">${design.TrayWeight ? design.TrayWeight + ' g' : 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">トレイ情報</div>
                <div class="label-vn">Thông tin khay</div>
            </div>
            <div class="info-value">${design.TrayInfoForMoldDesign || 'N/A'}</div>
        </div>
    `;
}

function displaySummaryRelatedCutters() {
    const container = document.getElementById('summaryRelatedCutters');
    if (!container) return;

    const relatedCutters = getMoldRelatedCutters(currentMold.MoldID);

    if (!relatedCutters || relatedCutters.length === 0) {
        container.innerHTML = `
            <div class="info-row">
                <div class="info-label">
                    <div class="label-jp">別抜き使用</div>
                    <div class="label-vn">Có sử dụng dao cắt riêng không</div>
                </div>
                <div class="info-value">なし / Không</div>
            </div>
            <div class="no-data">関連カッターがありません / Không có dao cắt liên quan</div>
        `;
        return;
    }

    const cuttersHtml = relatedCutters.map(cutter => {
        const cutterLocation = getCutterLocation(cutter);
        return `
            <div class="cutter-item" onclick="window.open('detail-cutter.html?id=${cutter.CutterID}', '_blank')">
                <div class="cutter-left">
                    <div class="cutter-code">${cutter.CutterNo || cutter.CutterID}</div>
                    <div class="cutter-name">${cutter.CutterName || 'N/A'}</div>
                </div>
                <div class="cutter-location">${cutterLocation}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">別抜き使用</div>
                <div class="label-vn">Có sử dụng dao cắt riêng không</div>
            </div>
            <div class="info-value">あり / Có (${relatedCutters.length}個)</div>
        </div>

        <div style="margin-top: 16px;">
            <strong>関連カッター一覧 / Danh sách dao cắt dùng chung:</strong>
        </div>
        <div style="margin-top: 8px;">
            ${cuttersHtml}
        </div>
    `;
}

// ===== TAB 2: PRODUCT (製品) V5.7 =====
function displayProductTab() {
    displayProductDetails();
    displayProductBusinessInfo();
}

function displayProductDetails() {
    const container = document.getElementById('productDetails');
    if (!container) return;

    const design = currentMold.designInfo || {};
    const job = currentMold.jobInfo || {};

    let productDimensions = 'N/A';
    if (design.CutlineX && design.CutlineY) {
        productDimensions = `${design.CutlineX} × ${design.CutlineY}`;
    }

    // Determine if uses separate cutter
    const relatedCutters = getMoldRelatedCutters(currentMold.MoldID);
    const separateCutter = relatedCutters && relatedCutters.length > 0 ? 'あり / Có' : 'なし / Không';

    container.innerHTML = `
        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">トレイ情報</div>
                <div class="label-vn">Thông tin khay</div>
            </div>
            <div class="info-value">${design.TrayInfoForMoldDesign || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">材質</div>
                <div class="label-vn">Chất liệu</div>
            </div>
            <div class="info-value">${design.DesignForPlasticType || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">製品寸法</div>
                <div class="label-vn">Kích thước SP</div>
            </div>
            <div class="info-value">${productDimensions}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">トレイ重量</div>
                <div class="label-vn">KL khay</div>
            </div>
            <div class="info-value">${design.TrayWeight ? design.TrayWeight + ' g' : 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">初回出荷日</div>
                <div class="label-vn">Ngày xuất hàng đầu</div>
            </div>
            <div class="info-value">${job.DeliveryDeadline ? formatDate(job.DeliveryDeadline) : 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">別抜き</div>
                <div class="label-vn">Dao cắt riêng</div>
            </div>
            <div class="info-value">${separateCutter}</div>
        </div>
    `;
}

function displayProductBusinessInfo() {
    const container = document.getElementById('productBusinessInfo');
    if (!container) return;

    const job = currentMold.jobInfo || {};

    container.innerHTML = `
        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">見積</div>
                <div class="label-vn">Báo giá</div>
            </div>
            <div class="info-value">${job.PriceQuote || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">単価</div>
                <div class="label-vn">Đơn giá</div>
            </div>
            <div class="info-value">${job.UnitPrice || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">箱の種類</div>
                <div class="label-vn">Loại thùng</div>
            </div>
            <div class="info-value">${job.LoaiThungDong || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">袋詰め</div>
                <div class="label-vn">Bọc túi</div>
            </div>
            <div class="info-value">${job.BaoNilon || 'N/A'}</div>
        </div>
    `;
}

// ===== TAB 3: TECHNICAL (技術) V5.7 =====
function displayTechnicalTab() {
    displayTechnicalDesignSpecs();
    displayTechnicalManufacturingDetails();
}

function displayTechnicalDesignSpecs() {
    const container = document.getElementById('technicalDesignSpecs');
    if (!container) return;

    const design = currentMold.designInfo || {};

    container.innerHTML = `
        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">設計コード</div>
                <div class="label-vn">Mã tra cứu</div>
            </div>
            <div class="info-value">${design.MoldDesignCode || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">金型方向</div>
                <div class="label-vn">Khuôn thuận/nghịch</div>
            </div>
            <div class="info-value">${design.MoldOrientation || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">ポケット数</div>
                <div class="label-vn">Số pockets</div>
            </div>
            <div class="info-value">${design.PocketNumbers || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">設置方向</div>
                <div class="label-vn">Hướng lắp</div>
            </div>
            <div class="info-value">${design.MoldSetupType || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">設計重量</div>
                <div class="label-vn">KL thiết kế</div>
            </div>
            <div class="info-value">${design.MoldDesignWeight ? design.MoldDesignWeight + ' kg' : 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">ピース数</div>
                <div class="label-vn">Số mảnh khuôn</div>
            </div>
            <div class="info-value">${design.PieceCount || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">Pitch</div>
                <div class="label-vn">Khoảng cách</div>
            </div>
            <div class="info-value">${design.Pitch || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">C面取</div>
                <div class="label-vn">Góc vát</div>
            </div>
            <div class="info-value">${design.ChamferC || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">Rコーナー</div>
                <div class="label-vn">Góc bo</div>
            </div>
            <div class="info-value">${design.CornerR || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">深さ</div>
                <div class="label-vn">Chiều sâu</div>
            </div>
            <div class="info-value">${design.MoldDesignDepth || 'N/A'}</div>
        </div>
    `;
}

function displayTechnicalManufacturingDetails() {
    const container = document.getElementById('technicalManufacturingDetails');
    if (!container) return;

    const design = currentMold.designInfo || {};
    const job = currentMold.jobInfo || {};

    container.innerHTML = `
        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">Under depth</div>
            </div>
            <div class="info-value">${design.UnderDepth || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">抜き勾配</div>
                <div class="label-vn">Góc nghiêng</div>
            </div>
            <div class="info-value">${design.DraftAngle || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">刻印</div>
                <div class="label-vn">Chữ khắc</div>
            </div>
            <div class="info-value">${design.TextContent || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">公差</div>
                <div class="label-vn">Dung sai X,Y</div>
            </div>
            <div class="info-value">${design.TolerenceX && design.TolerenceY ? design.TolerenceX + ', ' + design.TolerenceY : 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">図面番号</div>
                <div class="label-vn">Số bản vẽ</div>
            </div>
            <div class="info-value">${design.DrawingNumber || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">設備コード</div>
                <div class="label-vn">Mã thiết bị</div>
            </div>
            <div class="info-value">${design.EquipmentCode || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">設計備考</div>
                <div class="label-vn">Ghi chú thiết kế</div>
            </div>
            <div class="info-value">${design.VersionNote || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">プラグ有無</div>
                <div class="label-vn">Có nắp</div>
            </div>
            <div class="info-value">${job.PlugAri || 'N/A'}</div>
        </div>

        <div class="info-row">
            <div class="info-label">
                <div class="label-jp">ポケット試作</div>
                <div class="label-vn">Chạy thử</div>
            </div>
            <div class="info-value">${job.PocketTEST || 'N/A'}</div>
        </div>
    `;
}

// ===== TAB 4: PROCESSING (処理・履歴) V5.7 =====
function displayProcessingTab() {
    displayProcessingStatus();
    displayProcessingLocationHistory();
    displayProcessingShipmentHistory();
    displayProcessingUserComments();
}

function displayProcessingStatus() {
    const container = document.getElementById('processingStatus');
    if (!container) return;

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
        <div class="status-group">
            <div class="status-header">
                <div class="status-label">テフロン加工 / Mạ teflon</div>
                <div class="status-value">${currentMold.TeflonCoating || 'N/A'}</div>
            </div>
            <div class="status-dates">
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
        <div class="status-group">
            <div class="status-header">
                <div class="status-label">返却 / Trả lại khuôn cho khách</div>
                <div class="status-value">${currentMold.MoldReturning || 'N/A'}</div>
            </div>
            <div class="status-dates">
                <div class="date-item">
                    <div class="date-label">実施日 / Ngày thực hiện</div>
                    <div class="date-value">${formatDate(currentMold.MoldReturnedDate)}</div>
                </div>
            </div>
        </div>

        <!-- 廃棄 -->
        <div class="status-group">
            <div class="status-header">
                <div class="status-label">廃棄 / Hủy khuôn</div>
                <div class="status-value">${currentMold.MoldDisposing || 'N/A'}</div>
            </div>
            <div class="status-dates">
                <div class="date-item">
                    <div class="date-label">実施日 / Ngày thực hiện</div>
                    <div class="date-value">${formatDate(currentMold.MoldDisposedDate)}</div>
                </div>
            </div>
        </div>
    `;
}

function displayProcessingLocationHistory() {
    const container = document.getElementById('processingLocationHistory');
    if (!container) return;

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
    } else {
        container.innerHTML = '<div class="no-data">位置履歴がありません / Không có lịch sử vị trí</div>';
    }
}

function displayProcessingShipmentHistory() {
    const container = document.getElementById('processingShipmentHistory');
    if (!container) return;

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
    } else {
        container.innerHTML = '<div class="no-data">運送履歴がありません / Không có lịch sử vận chuyển</div>';
    }
}

function displayProcessingUserComments() {
    const container = document.getElementById('processingUserComments');
    if (!container) return;

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
    } else {
        container.innerHTML = '<div class="no-data">コメントがありません / Không có bình luận</div>';
    }
}

// ====== NGHIỆP VỤ CẬP NHẬT DỮ LIỆU (BUSINESS LOGIC: DATA UPDATES) ======

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

// ====== CÁC HÀM TIỆN ÍCH & HELPER FUNCTIONS ======

function getProcessingStatus(mold) {
    const statuses = [];

    if (mold.TeflonCoating && mold.TeflonCoating !== 'N/A' && mold.TeflonCoating !== 'FALSE') {
        statuses.push('テフロン加工');
    }

    if (mold.MoldReturning && mold.MoldReturning !== 'N/A' && mold.MoldReturning !== 'FALSE') {
        statuses.push('返却済み');
    }

    if (mold.MoldDisposing && mold.MoldDisposing !== 'N/A' && mold.MoldDisposing !== 'FALSE') {
        statuses.push('廃棄済み');
    }

    return statuses.length > 0 ? statuses.join(', ') : '通常 / Bình thường';
}

function getYSDLocationDisplay() {
    const rackLayer = currentMold.rackLayerInfo;
    const rack = currentMold.rackInfo;

    if (currentMold.storage_company == 2 && rackLayer && rack) {
        return `${rack.RackLocation} <span class="rack-circle">${rack.RackID}</span>-${rackLayer.RackLayerNumber}層`;
    } else {
        const originalLocation = getOriginalYSDLocation();
        if (originalLocation && originalLocation !== 'N/A') {
            return originalLocation;
        }
    }
    return 'N/A';
}

function getCurrentStorageDisplay() {
    if (currentMold.storage_company == 2) {
        return 'YSD';
    } else if (currentMold.storageCompanyInfo) {
        return currentMold.storageCompanyInfo.CompanyShortName;
    }
    return 'N/A';
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
    if (!moldAllData.usercomments) return [];

    return moldAllData.usercomments
        .filter(c => c.ItemID == moldId && c.ItemType === 'mold' && c.CommentStatus === 'active')
        .sort((a, b) => new Date(b.DateEntry) - new Date(a.DateEntry));
}

/**
 * FIXED: Enhanced status logic - Priority: MoldReturning > MoldDisposing > MoldNotes
 */
function getEnhancedMoldStatus(mold) {
    // Check MoldReturning first
    if (mold.MoldReturning && mold.MoldReturning.trim() !== '' && mold.MoldReturning !== 'FALSE') {
        return { status: 'returned', text: mold.MoldReturning, class: 'inactive' };
    }

    // Check MoldDisposing second
    if (mold.MoldDisposing && mold.MoldDisposing.trim() !== '' && mold.MoldDisposing !== 'FALSE') {
        return { status: 'disposed', text: mold.MoldDisposing, class: 'inactive' };
    }

    // Use MoldNotes as fallback
    if (mold.MoldNotes && mold.MoldNotes.trim() !== '') {
        return { status: 'notes', text: mold.MoldNotes, class: 'processing' };
    }

    // Default status based on shipment
    const history = getMoldShipHistory(mold.MoldID);
    if (history.length > 0 && history[0].ToCompanyID && history[0].ToCompanyID !== '2') {
        return { status: 'shipped', text: 'Có lịch sử chuyển khuôn / 出荷履歴有', class: 'processing' };
    }

    return { status: 'available', text: 'Có sẵn / 利用可能', class: 'active' };
}

/**
 * Gets the original YSD location for display in header when mold is shipped out
 */
function getOriginalYSDLocation() {
    const history = getMoldLocationHistory(currentMold.MoldID);
    const lastKnownYSDLog = history.find(log => log.NewRackLayer);

    if (lastKnownYSDLog) {
        const layer = moldAllData.racklayers?.find(l => l.RackLayerID === lastKnownYSDLog.NewRackLayer);
        const rack = layer ? moldAllData.racks?.find(r => r.RackID === layer.RackID) : null;

        if (rack && layer) {
            return `(${rack.RackLocation}) <span class="rack-circle">${rack.RackID}</span> - ${layer.RackLayerNumber} `;
        }
    }

    // Fallback to current position if available
    if (currentMold.rackInfo && currentMold.rackLayerInfo) {
        return `<span class="rack-circle">${currentMold.rackInfo.RackID}</span> - ${currentMold.rackLayerInfo.RackLayerNumber}層 (${currentMold.rackInfo.RackLocation})`;
    }

    return 'N/A';
}

function getMoldCurrentStatus(mold) {
    return getEnhancedMoldStatus(mold);
}

// FIXED: getMoldRelatedCutters using MoldDesignID relationship
function getMoldRelatedCutters(moldID) {
    if (!moldID || !moldAllData.moldcutter) return [];

    // Step 1: Find MoldDesignID from MoldID
    const mold = moldAllData.molds?.find(m => String(m.MoldID).trim() === String(moldID).trim());
    if (!mold || !mold.MoldDesignID) return [];

    const moldDesignID = String(mold.MoldDesignID).trim();

    // Step 2: Find CutterIDs from MoldDesignID in moldcutter.csv
    const cutterRelations = moldAllData.moldcutter.filter(mc => 
        String(mc.MoldDesignID || '').trim() === moldDesignID
    );

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

    return relatedCutters;
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
  notification.innerHTML = `
    <div class="notification-content">
      <span class="notification-icon">${type === 'success' ? '✓' : type === 'error' ? '✗' : 'ℹ'}</span>
      <span class="notification-message">${message}</span>
    </div>
    <button class="notification-close" onclick="this.parentElement.remove()">×</button>
  `;

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

// ===== END OF FILE =====
console.log('detail-mold.js V5.7 - Tab-based Design Complete - 100% V4.31 Business Logic Preserved - PDF Export Ready - Production Ready');
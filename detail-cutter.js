// detail-cutter.js V6.9 - Completely standalone, no conflicts with script.js
// Orange theme + V6.6 location logic + Namespaced architecture + Production ready
// 2025.09.24 - Final conflict-free version using CutterApp namespace

(() => {
    'use strict';
    
    console.log('V6.9: Initializing CutterApp...');
    
    // ===== V6.9: CUTTERAPP NAMESPACE - NO GLOBAL CONFLICTS =====
    window.CutterApp = {
        // V6.9: Private data
        currentCutter: null,
        allData: {},
        userComments: [],
        
        // V6.9: Private constants - no conflict with script.js
        GITHUB_BASE_URL: "https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data",
        CUTTER_API_ENDPOINT: "https://script.google.com/macros/s/AKfycbwK5RKP3GKIHRjrRKjTjPZWrYkOYx3PZ_5JZr6O6HWWaLhNrVJEm4HxO5EfOZw/exec",
        
        // ===== V6.9: PUBLIC METHODS =====
        
        async initialize(cutterId) {
            console.log('V6.9: CutterApp.initialize called with ID:', cutterId);
            
            try {
                this.showLoading(true);
                
                // Setup event listeners
                this._setupEventListeners();
                
                // Setup tab navigation
                this._setupTabNavigation();
                
                // Load data
                await this._loadCutterData(cutterId);
                
                // Setup form data
                this._populateFormData();
                
                console.log('V6.9: CutterApp initialization complete');
                
            } catch (error) {
                console.error('V6.9: CutterApp initialization failed:', error);
                this.showError(`初期化に失敗しました: ${error.message}`);
            } finally {
                this.showLoading(false);
            }
        },
        
        async reloadData() {
            console.log('V6.9: CutterApp.reloadData called');
            
            if (!this.currentCutter) {
                this.showError('リロードするデータがありません');
                return;
            }
            
            try {
                this.showLoading(true);
                
                const filesToReload = ['locationlog.csv', 'shiplog.csv', 'cutters.csv', 'usercomments.csv'];
               
                for (const file of filesToReload) {
                    try {
                        const response = await fetch(`${this.GITHUB_BASE_URL}/${file}?t=${Date.now()}`);
                        
                        if (response.ok) {
                            const csvText = await response.text();
                            const data = this._parseCSV(csvText);
                            const key = file.replace('.csv', '');
                            this.allData[key] = data;
                            console.log(`V6.9: Reloaded ${file}: ${data.length} records`);
                        }
                    } catch (error) {
                        console.warn(`V6.9: Error reloading ${file}:`, error);
                    }
                }
                
                this._processDataRelationships();
                this.currentCutter = this.allData.cutters.find(item => item.CutterID === this.currentCutter.CutterID);
               
                if (this.currentCutter) {
                    this._displayCutterData();
                    this.showSuccess('データが正常に更新されました');
                }
            } catch (error) {
                console.error('V6.9: Error reloading data:', error);
                this.showError('データ更新に失敗しました: ' + error.message);
            } finally {
                this.showLoading(false);
            }
        },
        
        printReport() {
            console.log('V6.9: CutterApp.printReport called');
            
            try {
                this._preparePrintLayout();
                setTimeout(() => {
                    try {
                        window.print();
                    } catch (printError) {
                        console.error('V6.9: Print error:', printError);
                        this.showError('印刷に失敗しました');
                    }
                }, 500);
            } catch (error) {
                console.error('V6.9: Print report error:', error);
                this.showError('印刷機能でエラーが発生しました');
                // Fallback to basic print
                try {
                    window.print();
                } catch (fallbackError) {
                    console.error('V6.9: Fallback print also failed:', fallbackError);
                }
            }
        },
        
        // ===== V6.9: MODAL CONTROLS =====
        
        showLocationModal() {
            try {
                console.log('V6.9: Showing location modal...');
                document.getElementById('locationModal').style.display = 'block';
            } catch (error) {
                console.error('V6.9: Error showing location modal:', error);
                this.showError('モーダルの表示に失敗しました');
            }
        },
        
        hideLocationModal() {
            try {
                document.getElementById('locationModal').style.display = 'none';
            } catch (error) {
                console.error('V6.9: Error hiding location modal:', error);
            }
        },
        
        showShipmentModal() {
            try {
                console.log('V6.9: Showing shipment modal...');
                document.getElementById('shipmentModal').style.display = 'block';
            } catch (error) {
                console.error('V6.9: Error showing shipment modal:', error);
                this.showError('モーダルの表示に失敗しました');
            }
        },
        
        hideShipmentModal() {
            try {
                document.getElementById('shipmentModal').style.display = 'none';
            } catch (error) {
                console.error('V6.9: Error hiding shipment modal:', error);
            }
        },
        
        showCommentModal() {
            try {
                console.log('V6.9: Showing comment modal...');
                document.getElementById('commentModal').style.display = 'block';
            } catch (error) {
                console.error('V6.9: Error showing comment modal:', error);
                this.showError('モーダルの表示に失敗しました');
            }
        },
        
        hideCommentModal() {
            try {
                document.getElementById('commentModal').style.display = 'none';
            } catch (error) {
                console.error('V6.9: Error hiding comment modal:', error);
            }
        },
        
        // ===== V6.9: UI UTILITIES =====
        
        showError(message) {
            try {
                console.error('V6.9: Error -', message);
                
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
            } catch (error) {
                console.error('V6.9: Error in showError:', error);
                alert(message);
            }
        },
        
        showSuccess(message) {
            try {
                console.log('V6.9: Success -', message);
                
                const successDiv = document.createElement('div');
                successDiv.style.cssText = `
                    position: fixed;
                    top: 130px;
                    left: 15px;
                    right: 15px;
                    background: #fff7ed;
                    color: #9a3412;
                    padding: 12px;
                    border-radius: 6px;
                    z-index: 9999;
                    border-left: 4px solid #ea580c;
                    font-size: 14px;
                    text-align: center;
                    box-shadow: 0 3px 10px rgba(0,0,0,0.15);
                `;
                successDiv.textContent = message;
                document.body.appendChild(successDiv);
                
                setTimeout(() => {
                    try {
                        if (successDiv.parentNode) {
                            successDiv.parentNode.removeChild(successDiv);
                        }
                    } catch (removeError) {
                        console.warn('V6.9: Error removing success message:', removeError);
                    }
                }, 3000);
            } catch (error) {
                console.error('V6.9: Error in showSuccess:', error);
            }
        },
        
        showLoading(show) {
            try {
                const loading = document.getElementById('loadingIndicator');
                if (loading) {
                    loading.style.display = show ? 'flex' : 'none';
                    console.log('V6.9: Loading indicator', show ? 'shown' : 'hidden');
                }
            } catch (error) {
                console.error('V6.9: Error in showLoading:', error);
            }
        },
        
        // ===== V6.9: PRIVATE METHODS =====
        
        async _loadCutterData(cutterId) {
            console.log('V6.9: Loading cutter data for ID:', cutterId);
            
            const dataFiles = [
                'cutters.csv', 'molds.csv', 'customers.csv', 'molddesign.csv',
                'moldcutter.csv', 'shiplog.csv', 'locationlog.csv', 'employees.csv',
                'racklayers.csv', 'racks.csv', 'companies.csv', 'jobs.csv', 'usercomments.csv'
            ];
            
            try {
                // Load all data files
                const promises = dataFiles.map(async file => {
                    try {
                        const url = `${this.GITHUB_BASE_URL}/${file}?t=${Date.now()}`;
                        const response = await fetch(url);
                        if (response.ok) {
                            const csvText = await response.text();
                            return { file, data: this._parseCSV(csvText) };
                        }
                        console.warn(`V6.9: Failed to load ${file}`);
                        return { file, data: [] };
                    } catch (error) {
                        console.warn(`V6.9: Error loading ${file}:`, error);
                        return { file, data: [] };
                    }
                });
                
                const results = await Promise.all(promises);
                
                // Store data
                results.forEach(({ file, data }) => {
                    const key = file.replace('.csv', '');
                    this.allData[key] = data;
                    console.log(`V6.9: Loaded ${key}: ${data.length} records`);
                });
                
                // Process relationships
                this._processDataRelationships();
                
                // Find current cutter
                this.currentCutter = this.allData.cutters?.find(item => item.CutterID === cutterId);
                
                if (this.currentCutter) {
                    console.log('V6.9: Current cutter found:', this.currentCutter.CutterNo || this.currentCutter.CutterID);
                    this._displayCutterData();
                } else {
                    throw new Error(`抜型が見つかりません / Không tìm thấy dao cắt ID: ${cutterId}`);
                }
                
            } catch (error) {
                console.error('V6.9: Error loading cutter data:', error);
                throw error;
            }
        },
        
        _processDataRelationships() {
            console.log('V6.9: Processing data relationships...');
            
            if (!this.allData.cutters) {
                console.warn('V6.9: No cutters data to process');
                return;
            }
            
            // Create lookup maps
            const customerMap = new Map(this.allData.customers?.map(c => [c.CustomerID, c]) || []);
            const companyMap = new Map(this.allData.companies?.map(c => [c.CompanyID, c]) || []);
            const rackMap = new Map(this.allData.racks?.map(r => [r.RackID, r]) || []);
            const rackLayerMap = new Map(this.allData.racklayers?.map(l => [l.RackLayerID, l]) || []);
            
            // Enhance cutters with relationship data
            this.allData.cutters = this.allData.cutters.map(cutter => {
                const customer = customerMap.get(cutter.CustomerID);
                const storageCompany = companyMap.get(cutter.storage_company);
                const rackLayer = rackLayerMap.get(cutter.RackLayerID);
                const rack = rackLayer ? rackMap.get(rackLayer.RackID) : null;
                
                return {
                    ...cutter,
                    customerInfo: customer,
                    storageCompanyInfo: storageCompany,
                    rackLayerInfo: rackLayer,
                    rackInfo: rack,
                    relatedMolds: this._getRelatedMolds(cutter.CutterID),
                    shipHistory: this._getShipHistory(cutter.CutterID),
                    locationHistory: this._getLocationHistory(cutter.CutterID),
                    currentStatus: this._getCurrentStatus(cutter),
                    itemType: 'cutter'
                };
            });
            
            console.log('V6.9: Data relationships processed');
        },
        
        _setupTabNavigation() {
            console.log('V6.9: Setting up tab navigation...');
            
            const tabLinks = document.querySelectorAll('.tab-link');
            const tabPanes = document.querySelectorAll('.tab-pane');

            tabLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    
                    const targetTab = link.getAttribute('data-tab');
                    console.log('V6.9: Tab clicked:', targetTab);
                    
                    // Remove active class from all tabs and panes
                    tabLinks.forEach(l => l.classList.remove('active'));
                    tabPanes.forEach(p => p.classList.remove('active'));
                    
                    // Add active class to clicked tab
                    link.classList.add('active');
                    
                    // Show corresponding pane
                    const targetPane = document.getElementById(targetTab);
                    if (targetPane) {
                        targetPane.classList.add('active');
                        
                        // Load tab content
                        if (this.currentCutter) {
                            this._loadTabContent(targetTab);
                        }
                    }
                });
            });
        },
        
        _setupEventListeners() {
            console.log('V6.9: Setting up event listeners...');
            
            // Header action buttons
            const locationBtn = document.getElementById('showLocationBtn');
            const shipmentBtn = document.getElementById('showShipmentBtn');
            const commentBtn = document.getElementById('showCommentBtn');
            
            if (locationBtn) {
                locationBtn.addEventListener('click', () => this.showLocationModal());
            }
            
            if (shipmentBtn) {
                shipmentBtn.addEventListener('click', () => this.showShipmentModal());
            }
            
            if (commentBtn) {
                commentBtn.addEventListener('click', () => this.showCommentModal());
            }
            
            // Form submissions
            const locationForm = document.getElementById('locationForm');
            if (locationForm) {
                locationForm.addEventListener('submit', (e) => this._handleLocationUpdate(e));
            }
            
            const shipmentForm = document.getElementById('shipmentForm');
            if (shipmentForm) {
                shipmentForm.addEventListener('submit', (e) => this._handleShipmentUpdate(e));
            }
            
            const commentForm = document.getElementById('commentForm');
            if (commentForm) {
                commentForm.addEventListener('submit', (e) => this._handleCommentSubmit(e));
            }
            
            // Rack selection change
            const rackSelect = document.getElementById('rackSelect');
            if (rackSelect) {
                rackSelect.addEventListener('change', () => this._updateRackLayers());
            }
        },
        
        _displayCutterData() {
            console.log('V6.9: Displaying cutter data...');
            
            if (!this.currentCutter) {
                console.error('V6.9: No current cutter data');
                return;
            }
            
            // Update header
            this._updateHeader();
            
            // Load default tab content (Summary)
            this._loadTabContent('summary');
            
            console.log('V6.9: Cutter data display complete');
        },
        
        _updateHeader() {
            console.log('V6.9: Updating header...');
            
            // Update title
            const cutterTitle = document.getElementById('cutterTitle');
            if (cutterTitle) {
                cutterTitle.textContent = this.currentCutter.CutterNo || this.currentCutter.CutterID;
            }
            
            // Update location with V6.6 logic
            const locationElement = document.getElementById('cutterLocation');
            if (locationElement) {
                let locationText = '';
                let rackDisplayText = '';
                
                // Get rack info
                if (this.currentCutter.rackInfo && this.currentCutter.rackLayerInfo) {
                    rackDisplayText = ` <span class="rack-circle">${this.currentCutter.rackInfo.RackID}</span>-${this.currentCutter.rackLayerInfo.RackLayerNumber}層`;
                }
                
                // V6.6 location logic
                if (this.currentCutter.storageCompanyInfo && this.currentCutter.storageCompanyInfo.CompanyShortName) {
                    locationText = `現在位置: ${this.currentCutter.storageCompanyInfo.CompanyShortName}${rackDisplayText}`;
                } else if (this.currentCutter.RackLayerID && rackDisplayText) {
                    locationText = `その他${rackDisplayText}`;
                } else {
                    locationText = `位置不明`;
                }
                
                locationElement.innerHTML = locationText;
            }
        },
        
        _loadTabContent(tabName) {
            console.log('V6.9: Loading tab content:', tabName);
            
            switch(tabName) {
                case 'summary':
                    this._loadSummaryTab();
                    break;
                case 'technical':
                    this._loadTechnicalTab();
                    break;
                case 'cutting':
                    this._loadCuttingTab();
                    break;
                case 'processing':
                    this._loadProcessingTab();
                    break;
                default:
                    console.warn('V6.9: Unknown tab:', tabName);
            }
        },
        
        _loadSummaryTab() {
            console.log('V6.9: Loading summary tab...');
            
            this._loadSummaryBasicInfo();
            this._loadSummaryDimensionInfo();
            this._loadSummaryRelatedMolds();
        },
        
        _loadSummaryBasicInfo() {
            const container = document.getElementById('summaryBasicInfo');
            if (!container) return;
            
            const status = this._getCurrentStatus(this.currentCutter);
            const processingStatus = this._getProcessingStatus(this.currentCutter);
            
            // YSD Position logic
            let ysdPositionText = '';
            if (this.currentCutter.rackInfo && this.currentCutter.rackLayerInfo) {
                ysdPositionText = `${this.currentCutter.rackInfo.RackLocation} ${this.currentCutter.rackInfo.RackID}-${this.currentCutter.rackLayerInfo.RackLayerNumber}層`;
            } else {
                const ysdFromHistory = this._getYSDLocationFromHistory();
                ysdPositionText = ysdFromHistory || '不明';
            }
            
            // Storage company logic
            let storageCompanyText = '';
            if (this.currentCutter.storageCompanyInfo && this.currentCutter.storageCompanyInfo.CompanyShortName) {
                storageCompanyText = this.currentCutter.storageCompanyInfo.CompanyShortName;
            } else if (this.currentCutter.storage_company == 2) {
                storageCompanyText = '(株)ヨシダパッケージ';
            } else {
                storageCompanyText = '不明';
            }

            container.innerHTML = `
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">ID</div>
                        <div class="label-vn">ID dao cắt</div>
                    </div>
                    <div class="info-value-compact">${this.currentCutter.CutterID}</div>
                </div>
                
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">抜型番号</div>
                        <div class="label-vn">Số dao cắt</div>
                    </div>
                    <div class="info-value-compact highlight">${this.currentCutter.CutterNo || 'N/A'}</div>
                </div>
                
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">抜型名</div>
                        <div class="label-vn">Tên dao cắt</div>
                    </div>
                    <div class="info-value-compact">${this.currentCutter.CutterName || 'N/A'}</div>
                </div>
                
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">YSDでの位置</div>
                        <div class="label-vn">Vị trí tại YSD</div>
                    </div>
                    <div class="info-value-compact">${ysdPositionText}</div>
                </div>
                
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">保管会社</div>
                        <div class="label-vn">Công ty lưu trữ</div>
                    </div>
                    <div class="info-value-compact">${storageCompanyText}</div>
                </div>
                
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">使用状況</div>
                        <div class="label-vn">Tình trạng</div>
                    </div>
                    <div class="info-value-compact ${status.class}">${status.text}</div>
                </div>
                
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">処理状態</div>
                        <div class="label-vn">Xử lý</div>
                    </div>
                    <div class="info-value-compact">${processingStatus}</div>
                </div>
                
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">顧客</div>
                        <div class="label-vn">Khách hàng</div>
                    </div>
                    <div class="info-value-compact">${this.currentCutter.customerInfo?.CustomerName || 'N/A'}</div>
                </div>
                
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">データ入力日</div>
                        <div class="label-vn">Ngày nhập</div>
                    </div>
                    <div class="info-value-compact">${this.currentCutter.CutterEntry ? this._formatDate(this.currentCutter.CutterEntry) : 'N/A'}</div>
                </div>
            `;
        },
        
        _loadSummaryDimensionInfo() {
            const container = document.getElementById('summaryDimensionInfo');
            if (!container) return;
            
            const cutterDimensions = this._getCutterDimensions(this.currentCutter);
            const bladeCount = this.currentCutter.BladeCount || 'N/A';
            const bladeStatus = this.currentCutter.BladeStatus || 'N/A';

            container.innerHTML = `
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">抜型寸法</div>
                        <div class="label-vn">Kích thước</div>
                    </div>
                    <div class="info-value-compact highlight">${cutterDimensions}</div>
                </div>
                
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">刃数</div>
                        <div class="label-vn">Số lưỡi</div>
                    </div>
                    <div class="info-value-compact">${bladeCount}</div>
                </div>
                
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">厚さ</div>
                        <div class="label-vn">Độ dày</div>
                    </div>
                    <div class="info-value-compact">${this.currentCutter.CutterThickness ? this.currentCutter.CutterThickness + ' mm' : 'N/A'}</div>
                </div>
                
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">重量</div>
                        <div class="label-vn">Khối lượng</div>
                    </div>
                    <div class="info-value-compact">${this.currentCutter.CutterWeight ? this.currentCutter.CutterWeight + ' kg' : 'N/A'}</div>
                </div>
                
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">刃の状態</div>
                        <div class="label-vn">Tình trạng lưỡi</div>
                    </div>
                    <div class="info-value-compact">${bladeStatus}</div>
                </div>
            `;
        },
        
        _loadSummaryRelatedMolds() {
            const container = document.getElementById('summaryRelatedMolds');
            if (!container) return;
            
            const relatedMolds = this._getRelatedMolds(this.currentCutter.CutterID);
            
            if (!relatedMolds || relatedMolds.length === 0) {
                container.innerHTML = `
                    <div class="info-row-compact">
                        <div class="info-label-compact">
                            <div class="label-jp">関連金型</div>
                            <div class="label-vn">Khuôn liên quan</div>
                        </div>
                        <div class="info-value-compact">なし</div>
                    </div>
                    <div class="no-data">関連金型がありません</div>
                `;
                return;
            }

            const moldsHtml = relatedMolds.map(mold => {
                const moldLocation = this._getMoldLocation(mold);
                return `
                    <div class="mold-item" onclick="window.open('detail-mold.html?id=${mold.MoldID}', '_blank')">
                        <div>
                            <div class="mold-code">${mold.MoldCode || mold.MoldID}</div>
                            <div class="mold-name">${mold.MoldName || 'N/A'}</div>
                        </div>
                        <div class="mold-location">${moldLocation}</div>
                    </div>
                `;
            }).join('');

            container.innerHTML = `
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">関連金型</div>
                        <div class="label-vn">Khuôn liên quan</div>
                    </div>
                    <div class="info-value-compact highlight">あり (${relatedMolds.length}個)</div>
                </div>
                
                <div style="margin-top: 15px;">
                    <strong>関連金型一覧:</strong>
                </div>
                <div style="margin-top: 10px;">
                    ${moldsHtml}
                </div>
            `;
        },
        
        _loadTechnicalTab() {
            const container = document.getElementById('technicalInfo');
            if (!container) return;
            
            const cutterDimensions = this._getCutterDimensions(this.currentCutter);

            container.innerHTML = `
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">抜型番号</div>
                        <div class="label-vn">Số dao cắt</div>
                    </div>
                    <div class="info-value-compact">${this.currentCutter.CutterNo || 'N/A'}</div>
                </div>
                
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">抜型寸法</div>
                        <div class="label-vn">Kích thước</div>
                    </div>
                    <div class="info-value-compact highlight">${cutterDimensions}</div>
                </div>
                
                <div class="technical-2-column">
                    <div class="tech-column">
                        <div class="tech-row">
                            <div class="tech-label">刃数</div>
                            <div class="tech-value">${this.currentCutter.BladeCount || 'N/A'}</div>
                        </div>
                        
                        <div class="tech-row">
                            <div class="tech-label">厚さ</div>
                            <div class="tech-value">${this.currentCutter.CutterThickness ? this.currentCutter.CutterThickness + 'mm' : 'N/A'}</div>
                        </div>
                        
                        <div class="tech-row">
                            <div class="tech-label">重量</div>
                            <div class="tech-value">${this.currentCutter.CutterWeight ? this.currentCutter.CutterWeight + 'kg' : 'N/A'}</div>
                        </div>
                        
                        <div class="tech-row">
                            <div class="tech-label">状態</div>
                            <div class="tech-value">${this.currentCutter.BladeStatus || 'N/A'}</div>
                        </div>
                        
                        <div class="tech-row">
                            <div class="tech-label">材質</div>
                            <div class="tech-value">${this.currentCutter.CutterMaterial || 'N/A'}</div>
                        </div>
                    </div>
                    
                    <div class="tech-column">
                        <div class="tech-row">
                            <div class="tech-label">高さ</div>
                            <div class="tech-value">${this.currentCutter.CutterHeight ? this.currentCutter.CutterHeight + 'mm' : 'N/A'}</div>
                        </div>
                        
                        <div class="tech-row">
                            <div class="tech-label">硬度</div>
                            <div class="tech-value">${this.currentCutter.Hardness || 'N/A'}</div>
                        </div>
                        
                        <div class="tech-row">
                            <div class="tech-label">角度</div>
                            <div class="tech-value">${this.currentCutter.CutterAngle || 'N/A'}</div>
                        </div>
                        
                        <div class="tech-row">
                            <div class="tech-label">公差</div>
                            <div class="tech-value">${this.currentCutter.Tolerance || 'N/A'}</div>
                        </div>
                        
                        <div class="tech-row">
                            <div class="tech-label">製造日</div>
                            <div class="tech-value">${this.currentCutter.ManufactureDate ? this._formatDate(this.currentCutter.ManufactureDate) : 'N/A'}</div>
                        </div>
                    </div>
                </div>
                
                <div class="tech-row-full">
                    <div class="info-label-compact">
                        <div class="label-jp">備考</div>
                        <div class="label-vn">Ghi chú</div>
                    </div>
                    <div class="info-value-compact">${this.currentCutter.CutterNotes || 'N/A'}</div>
                </div>
            `;
        },
        
        _loadCuttingTab() {
            const container = document.getElementById('cuttingInfo');
            if (!container) return;

            container.innerHTML = `
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">切断能力</div>
                        <div class="label-vn">Khả năng cắt</div>
                    </div>
                    <div class="info-value-compact">${this.currentCutter.CuttingCapability || 'N/A'}</div>
                </div>
                
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">最大厚さ</div>
                        <div class="label-vn">Độ dày tối đa</div>
                    </div>
                    <div class="info-value-compact">${this.currentCutter.MaxThickness ? this.currentCutter.MaxThickness + ' mm' : 'N/A'}</div>
                </div>
                
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">推奨圧力</div>
                        <div class="label-vn">Áp lực khuyến nghị</div>
                    </div>
                    <div class="info-value-compact">${this.currentCutter.RecommendedPressure ? this.currentCutter.RecommendedPressure + ' kg/cm²' : 'N/A'}</div>
                </div>
                
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">刃の形状</div>
                        <div class="label-vn">Hình dạng lưỡi</div>
                    </div>
                    <div class="info-value-compact">${this.currentCutter.BladeShape || 'N/A'}</div>
                </div>
                
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">切断精度</div>
                        <div class="label-vn">Độ chính xác</div>
                    </div>
                    <div class="info-value-compact">${this.currentCutter.CuttingAccuracy || 'N/A'}</div>
                </div>
                
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">適用材料</div>
                        <div class="label-vn">Vật liệu áp dụng</div>
                    </div>
                    <div class="info-value-compact">${this.currentCutter.ApplicableMaterials || 'N/A'}</div>
                </div>
                
                <div class="info-row-compact">
                    <div class="info-label-compact">
                        <div class="label-jp">使用条件</div>
                        <div class="label-vn">Điều kiện sử dụng</div>
                    </div>
                    <div class="info-value-compact">${this.currentCutter.UsageConditions || 'N/A'}</div>
                </div>
            `;
        },
        
        _loadProcessingTab() {
            console.log('V6.9: Loading processing tab...');
            
            this._loadProcessingStatus();
            this._loadProcessingLocationHistory(); 
            this._loadProcessingShipmentHistory();
            this._loadProcessingUserComments();
        },
        
        _loadProcessingStatus() {
            const container = document.getElementById('processingStatus');
            if (!container) return;

            container.innerHTML = `
                <!-- 返却 -->
                <div class="status-section">
                    <div class="status-header">
                        <div class="status-title">返却 / Trả lại dao</div>
                        <div class="status-value">${this.currentCutter.CutterReturning || 'N/A'}</div>
                    </div>
                    <div class="date-row">
                        <div class="date-item">
                            <div class="date-label">実施日</div>
                            <div class="date-value">${this._formatDate(this.currentCutter.CutterReturnedDate)}</div>
                        </div>
                    </div>
                </div>

                <!-- 廃棄 -->
                <div class="status-section">
                    <div class="status-header">
                        <div class="status-title">廃棄 / Hủy dao</div>
                        <div class="status-value">${this.currentCutter.CutterDisposing || 'N/A'}</div>
                    </div>
                    <div class="date-row">
                        <div class="date-item">
                            <div class="date-label">実施日</div>
                            <div class="date-value">${this._formatDate(this.currentCutter.CutterDisposedDate)}</div>
                        </div>
                    </div>
                </div>
                
                <!-- メンテナンス -->
                <div class="status-section">
                    <div class="status-header">
                        <div class="status-title">刃のメンテナンス / Bảo trì lưỡi</div>
                        <div class="status-value">${this.currentCutter.BladeMaintenanceStatus || 'N/A'}</div>
                    </div>
                    <div class="date-row">
                        <div class="date-item">
                            <div class="date-label">最終点検日</div>
                            <div class="date-value">${this._formatDate(this.currentCutter.LastInspectionDate)}</div>
                        </div>
                        <div class="date-item">
                            <div class="date-label">次回予定</div>
                            <div class="date-value">${this._formatDate(this.currentCutter.NextMaintenanceDate)}</div>
                        </div>
                    </div>
                </div>
            `;
        },
        
        _loadProcessingLocationHistory() {
            const container = document.getElementById('processingLocationHistory');
            if (!container) return;
            
            const history = this._getLocationHistory(this.currentCutter.CutterID);
            
            if (history && history.length > 0) {
                const historyHtml = history.slice(0, 10).map(log => {
                    const oldRack = log.OldRackLayer ? this._getRackDisplayString(log.OldRackLayer) : 'N/A';
                    const newRank = log.NewRackLayer ? this._getRackDisplayString(log.NewRackLayer) : 'N/A';
                    
                    return `
                        <div class="history-item">
                            <div class="history-header">
                                <div class="history-title">位置変更</div>
                                <div class="history-date">${this._formatTimestamp(log.DateEntry)}</div>
                            </div>
                            <div class="history-content">
                                <div class="location-change">${oldRack} → ${newRank}</div>
                                ${log.notes ? `<div class="history-notes">備考: ${log.notes}</div>` : ''}
                            </div>
                        </div>
                    `;
                }).join('');
                
                container.innerHTML = historyHtml;
            } else {
                container.innerHTML = '<div class="no-data">位置履歴がありません</div>';
            }
        },
        
        _loadProcessingShipmentHistory() {
            const container = document.getElementById('processingShipmentHistory');
            if (!container) return;
            
            const history = this._getShipHistory(this.currentCutter.CutterID);
            
            if (history && history.length > 0) {
                const historyHtml = history.slice(0, 10).map(log => {
                    const fromCompany = this.allData.companies?.find(c => c.CompanyID == log.FromCompanyID)?.CompanyShortName || 'N/A';
                    const toCompany = this.allData.companies?.find(c => c.CompanyID == log.ToCompanyID)?.CompanyShortName || 'N/A';
                    
                    return `
                        <div class="history-item">
                            <div class="history-header">
                                <div class="history-title">運送</div>
                                <div class="history-date">${this._formatTimestamp(log.DateEntry)}</div>
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
                container.innerHTML = '<div class="no-data">運送履歴がありません</div>';
            }
        },
        
        _loadProcessingUserComments() {
            const container = document.getElementById('processingUserComments');
            if (!container) return;
            
            const comments = this._getUserComments(this.currentCutter.CutterID);
            
            if (comments && comments.length > 0) {
                const commentsHtml = comments.slice(0, 10).map(comment => {
                    const employee = this.allData.employees?.find(e => e.EmployeeID == comment.EmployeeID);
                    
                    return `
                        <div class="comment-item">
                            <div class="comment-header">
                                <div class="comment-author">${employee?.EmployeeName || 'Unknown'}</div>
                                <div class="comment-date">${this._formatTimestamp(comment.DateEntry)}</div>
                            </div>
                            <div class="comment-text">${comment.CommentText}</div>
                        </div>
                    `;
                }).join('');
                
                container.innerHTML = commentsHtml;
            } else {
                container.innerHTML = '<div class="no-data">コメントがありません</div>';
            }
        },
        
        // ===== V6.9: BUSINESS LOGIC METHODS =====
        
        async _handleLocationUpdate(event) {
            event.preventDefault();
            console.log('V6.9: Handling location update...');
            
            const rackLayerSelect = document.getElementById('rackLayerSelect');
            const employeeSelect = document.getElementById('employeeSelect');
            const locationNotes = document.getElementById('locationNotes');
            
            if (!rackLayerSelect.value || !employeeSelect.value) {
                this.showError('必要な項目を入力してください');
                return;
            }
            
            try {
                this.showLoading(true);
                
                const newLocationEntry = {
                    LocationLogID: String(Date.now()),
                    OldRackLayer: this.currentCutter.RackLayerID || '',
                    NewRackLayer: rackLayerSelect.value,
                    MoldID: '',
                    CutterID: this.currentCutter.CutterID,
                    DateEntry: new Date().toISOString(),
                    notes: locationNotes.value.trim()
                };
                
                await this._updateDataToGitHub('locationlog', newLocationEntry);
                
                // Update local data
                if (!this.allData.locationlog) this.allData.locationlog = [];
                this.allData.locationlog.unshift(newLocationEntry);
                
                // Update current cutter
                this.currentCutter.RackLayerID = rackLayerSelect.value;
                this.currentCutter.storage_company = '2';
                
                // Reprocess and refresh
                this._processDataRelationships();
                this.currentCutter = this.allData.cutters.find(item => item.CutterID === this.currentCutter.CutterID);
                this._displayCutterData();
                
                this.hideLocationModal();
                this.showSuccess('位置が正常に更新されました');
                
                // Clear form
                rackLayerSelect.value = '';
                employeeSelect.value = '';
                locationNotes.value = '';
                
            } catch (error) {
                console.error('V6.9: Failed to update location:', error);
                this.showError(`位置更新に失敗しました: ${error.message}`);
            } finally {
                this.showLoading(false);
            }
        },
        
        async _handleShipmentUpdate(event) {
            event.preventDefault();
            console.log('V6.9: Handling shipment update...');
            
            const toCoSelect = document.getElementById('toCompanySelect');
            const shipmentDate = document.getElementById('shipmentDate');
            const handler = document.getElementById('handler');
            const shipmentNotes = document.getElementById('shipmentNotes');
            
            if (!toCoSelect.value) {
                this.showError('出荷先を選択してください');
                return;
            }
            
            try {
                this.showLoading(true);
                
                const newShipEntry = {
                    ShipID: String(Date.now()),
                    MoldID: '',
                    CutterID: this.currentCutter.CutterID,
                    FromCompanyID: '2',
                    ToCompanyID: toCoSelect.value,
                    ShipDate: shipmentDate.value,
                    handler: handler.value.trim(),
                    ShipNotes: shipmentNotes.value.trim(),
                    DateEntry: new Date().toISOString()
                };
                
                await this._updateDataToGitHub('shiplog', newShipEntry);
                
                if (!this.allData.shiplog) this.allData.shiplog = [];
                this.allData.shiplog.unshift(newShipEntry);
                
                this.currentCutter.storage_company = toCoSelect.value;
                if (toCoSelect.value !== '2') {
                    this.currentCutter.RackLayerID = '';
                }
                
                this._processDataRelationships();
                this.currentCutter = this.allData.cutters.find(item => item.CutterID === this.currentCutter.CutterID);
                this._displayCutterData();
                
                this.hideShipmentModal();
                this.showSuccess('出荷情報が正常に登録されました');
                
                // Clear form
                toCoSelect.value = '';
                shipmentDate.value = '';
                handler.value = '';
                shipmentNotes.value = '';
                
            } catch (error) {
                console.error('V6.9: Failed to update shipment:', error);
                this.showError(`出荷登録に失敗しました: ${error.message}`);
            } finally {
                this.showLoading(false);
            }
        },
        
        async _handleCommentSubmit(event) {
            event.preventDefault();
            console.log('V6.9: Handling comment submit...');
            
            const commentText = document.getElementById('commentText');
            const commentEmployeeSelect = document.getElementById('commentEmployeeSelect');
            
            if (!commentText.value.trim() || !commentEmployeeSelect.value) {
                this.showError('コメントと担当者を入力してください');
                return;
            }
            
            try {
                this.showLoading(true);
                
                const newCommentEntry = {
                    UserCommentID: String(Date.now()),
                    ItemID: this.currentCutter.CutterID,
                    ItemType: 'cutter',
                    CommentText: commentText.value.trim(),
                    EmployeeID: commentEmployeeSelect.value,
                    DateEntry: new Date().toISOString(),
                    CommentStatus: 'active'
                };
                
                await this._updateDataToGitHub('usercomments', newCommentEntry);
                
                if (!this.allData.usercomments) this.allData.usercomments = [];
                this.allData.usercomments.unshift(newCommentEntry);
                
                // Refresh comments display
                this._loadProcessingUserComments();
                
                this.hideCommentModal();
                this.showSuccess('コメントが正常に投稿されました');
                
                // Clear form
                commentText.value = '';
                commentEmployeeSelect.value = '';
                
            } catch (error) {
                console.error('V6.9: Failed to save comment:', error);
                this.showError(`コメント投稿に失敗しました: ${error.message}`);
            } finally {
                this.showLoading(false);
            }
        },
        
        async _updateDataToGitHub(tableName, data) {
            console.log('V6.9: Updating to GitHub:', tableName, data);
            
            const payload = {
                action: 'addRow',
                table: tableName,
                data: data,
                timestamp: new Date().toISOString()
            };

            try {
                const response = await fetch(this.CUTTER_API_ENDPOINT, {
                    method: 'POST',
                    mode: 'cors',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
                }

                const result = await response.json();
                
                if (result.error) {
                    throw new Error(result.error);
                }

                console.log('V6.9: GitHub update success:', result);
                return result;

            } catch (error) {
                console.error('V6.9: GitHub update error:', error);
                throw error;
            }
        },
        
        // ===== V6.9: UTILITY METHODS =====
        
        _getCutterDimensions(cutter) {
            let length = cutter.CutterLength || cutter.Length;
            let width = cutter.CutterWidth || cutter.Width; 
            let height = cutter.CutterHeight || cutter.Height;
            
            if (length && width) {
                if (height) {
                    return `${length}×${width}×${height} mm`;
                } else {
                    return `${length}×${width} mm`;
                }
            }
            return 'データなし';
        },
        
        _getCurrentStatus(cutter) {
            if (cutter.CutterReturning && cutter.CutterReturning !== 'FALSE' && cutter.CutterReturning !== 'N/A') {
                return { status: 'returned', text: cutter.CutterReturning, class: 'danger' };
            }
            
            if (cutter.CutterDisposing && cutter.CutterDisposing !== 'FALSE' && cutter.CutterDisposing !== 'N/A') {
                return { status: 'disposed', text: cutter.CutterDisposing, class: 'danger' };
            }
            
            if (cutter.BladeStatus) {
                if (cutter.BladeStatus.includes('不良') || cutter.BladeStatus.includes('破損')) {
                    return { status: 'damaged', text: cutter.BladeStatus, class: 'danger' };
                } else if (cutter.BladeStatus.includes('要交換') || cutter.BladeStatus.includes('摩耗')) {
                    return { status: 'maintenance', text: cutter.BladeStatus, class: 'warning' };
                } else if (cutter.BladeStatus.includes('良好') || cutter.BladeStatus.includes('正常')) {
                    return { status: 'good', text: cutter.BladeStatus, class: 'success' };
                } else {
                    return { status: 'status', text: cutter.BladeStatus, class: 'warning' };
                }
            }
            
            return { status: 'available', text: '利用可能', class: 'success' };
        },
        
        _getProcessingStatus(cutter) {
            const statuses = [];
            
            if (cutter.CutterReturning && cutter.CutterReturning !== 'N/A' && cutter.CutterReturning !== 'FALSE') {
                statuses.push('返却済み');
            }
            
            if (cutter.CutterDisposing && cutter.CutterDisposing !== 'N/A' && cutter.CutterDisposing !== 'FALSE') {
                statuses.push('廃棄済み');
            }
            
            if (cutter.BladeMaintenanceStatus && cutter.BladeMaintenanceStatus !== 'N/A' && cutter.BladeMaintenanceStatus !== 'FALSE') {
                statuses.push('メンテナンス中');
            }
            
            return statuses.length > 0 ? statuses.join(', ') : '通常';
        },
        
        _getRelatedMolds(cutterID) {
            if (!cutterID || !this.allData.moldcutter) return [];
            
            const moldRelations = this.allData.moldcutter.filter(mc => 
                String(mc.CutterID || '').trim() === String(cutterID).trim()
            );
            
            const moldDesignIDs = [...new Set(moldRelations.map(rel => String(rel.MoldDesignID || '').trim()).filter(id => id))];
            
            const relatedMolds = [];
            if (this.allData.molds) {
                for (const moldDesignID of moldDesignIDs) {
                    const moldsWithDesignID = this.allData.molds.filter(m => 
                        String(m.MoldDesignID || '').trim() === moldDesignID
                    );
                    relatedMolds.push(...moldsWithDesignID);
                }
            }
            
            return relatedMolds;
        },
        
        _getMoldLocation(mold) {
            if (!mold?.RackLayerID) return 'N/A';
            
            const layer = this.allData.racklayers?.find(l => l.RackLayerID == mold.RackLayerID);
            const rack = layer ? this.allData.racks?.find(r => r.RackID == layer.RackID) : null;
            
            if (rack && layer) {
                return `${rack.RackLocation} ${rack.RackID}-${layer.RackLayerNumber}`;
            }
            return 'N/A';
        },
        
        _getShipHistory(cutterID) {
            if (!cutterID || !this.allData.shiplog) return [];
            
            return this.allData.shiplog.filter(log => log.CutterID === cutterID)
                .sort((a, b) => new Date(b.DateEntry) - new Date(a.DateEntry));
        },
        
        _getLocationHistory(cutterID) {
            if (!cutterID || !this.allData.locationlog) return [];
            
            return this.allData.locationlog.filter(log => log.CutterID === cutterID)
                .sort((a, b) => new Date(b.DateEntry) - new Date(a.DateEntry));
        },
        
        _getUserComments(cutterID) {
            if (!this.allData.usercomments) return [];
            
            return this.allData.usercomments
                .filter(c => c.ItemID == cutterID && c.ItemType === 'cutter' && c.CommentStatus === 'active')
                .sort((a, b) => new Date(b.DateEntry) - new Date(a.DateEntry));
        },
        
        _getRackDisplayString(rackLayerId) {
            const layer = this.allData.racklayers?.find(l => l.RackLayerID == rackLayerId);
            const rack = layer ? this.allData.racks?.find(r => r.RackID == layer.RackID) : null;
            
            if (rack && layer) {
                return `${rack.RackLocation} <span class="rack-circle">${rack.RackID}</span>-${layer.RackLayerNumber}層`;
            }
            return 'N/A';
        },
        
        _getYSDLocationFromHistory() {
            const history = this._getLocationHistory(this.currentCutter.CutterID);
            
            for (let log of history) {
                if (log.NewRackLayer) {
                    const layer = this.allData.racklayers?.find(l => l.RackLayerID === log.NewRackLayer);
                    const rack = layer ? this.allData.racks?.find(r => r.RackID === layer.RackID) : null;
                    
                    if (rack && layer) {
                        return `${rack.RackLocation} ${rack.RackID}-${layer.RackLayerNumber}層`;
                    }
                }
            }
            
            return null;
        },
        
        _formatDate(dateString) {
            if (!dateString) return '';
            try {
                const date = new Date(dateString);
                if (isNaN(date.getTime())) return dateString;
                return date.toLocaleDateString('ja-JP');
            } catch { 
                return dateString; 
            }
        },
        
        _formatTimestamp(dateString) {
            if (!dateString) return '';
            try {
                const date = new Date(dateString);
                if (isNaN(date.getTime())) return dateString;
                
                return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            } catch (e) { 
                return dateString; 
            }
        },
        
        _parseCSV(csv) {
            const lines = csv.split('\n').filter(line => line.trim() !== '');
            if (lines.length < 2) return [];
            
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
            
            return data;
        },
        
        _populateFormData() {
            console.log('V6.9: Populating form data...');
            
            // Populate rack select
            const rackSelect = document.getElementById('rackSelect');
            if (rackSelect && this.allData.racks) {
                const rackOptions = '<option value="">選択してください</option>' + 
                    this.allData.racks.map(r => `<option value="${r.RackID}">${r.RackSymbol} ${r.RackName} - ${r.RackLocation}</option>`).join('');
                rackSelect.innerHTML = rackOptions;
            }
            
            // Populate employee selects
            ['employeeSelect', 'commentEmployeeSelect'].forEach(id => {
                const select = document.getElementById(id);
                if (select && this.allData.employees) {
                    const employeeOptions = '<option value="">選択してください</option>' + 
                        this.allData.employees.map(e => `<option value="${e.EmployeeID}">${e.EmployeeName}</option>`).join('');
                    select.innerHTML = employeeOptions;
                }
            });
            
            // Populate company select
            const toCompanySelect = document.getElementById('toCompanySelect');
            if (toCompanySelect && this.allData.companies) {
                const companyOptions = '<option value="">選択してください</option>' + 
                    this.allData.companies.map(c => `<option value="${c.CompanyID}">${c.CompanyShortName} - ${c.CompanyName}</option>`).join('');
                toCompanySelect.innerHTML = companyOptions;
            }
            
            // Set default shipment date
            const shipmentDate = document.getElementById('shipmentDate');
            if (shipmentDate) {
                shipmentDate.value = new Date().toISOString().split('T')[0];
            }
        },
        
        _updateRackLayers() {
            const rackSelect = document.getElementById('rackSelect');
            const rackLayerSelect = document.getElementById('rackLayerSelect');
            
            if (!rackSelect || !rackLayerSelect) return;
            
            const selectedRackId = rackSelect.value;
            rackLayerSelect.innerHTML = '<option value="">選択してください</option>';
            
            if (selectedRackId && this.allData.racklayers) {
                const layers = this.allData.racklayers.filter(layer => layer.RackID === selectedRackId);
                const layerOptions = layers.map(l => 
                    `<option value="${l.RackLayerID}">${l.RackLayerNumber}${l.RackLayerNotes ? ` - ${l.RackLayerNotes}` : ''}</option>`
                ).join('');
                rackLayerSelect.innerHTML += layerOptions;
            }
        },
        
        _preparePrintLayout() {
            console.log('V6.9: Preparing print layout...');
            
            if (!this.currentCutter) return;
            
            const printContainer = document.getElementById('printOnlyContent');
            if (!printContainer) return;
            
            const cutterDimensions = this._getCutterDimensions(this.currentCutter);
            const status = this._getCurrentStatus(this.currentCutter);
            
            // Current location info
            let currentLocationText = '';
            if (this.currentCutter.storageCompanyInfo && this.currentCutter.storageCompanyInfo.CompanyShortName) {
                currentLocationText = `現在位置: ${this.currentCutter.storageCompanyInfo.CompanyShortName}`;
            } else if (this.currentCutter.RackLayerID && this.currentCutter.rackInfo && this.currentCutter.rackLayerInfo) {
                currentLocationText = `その他 ${this.currentCutter.rackInfo.RackID}-${this.currentCutter.rackLayerInfo.RackLayerNumber}層`;
            } else {
                currentLocationText = '位置不明';
            }

            printContainer.innerHTML = `
                <div class="print-container">
                    <div class="print-header">
                        <div class="print-title">抜型詳細情報 - ${this.currentCutter.CutterNo || 'N/A'}</div>
                        <div class="print-subtitle">
                            印刷日時: ${new Date().toLocaleString('ja-JP')} | 
                            ID: ${this.currentCutter.CutterID} | 
                            ${currentLocationText}
                        </div>
                    </div>

                    <div class="print-section">
                        <div class="print-section-header">基本情報</div>
                        <div class="print-section-content">
                            <div class="print-grid">
                                <div class="print-field">
                                    <div class="print-label">抜型番号:</div>
                                    <div class="print-value highlight">${this.currentCutter.CutterNo || 'N/A'}</div>
                                </div>
                                <div class="print-field">
                                    <div class="print-label">ID:</div>
                                    <div class="print-value">${this.currentCutter.CutterID}</div>
                                </div>
                            </div>
                            
                            <div class="print-grid">
                                <div class="print-field">
                                    <div class="print-label">寸法:</div>
                                    <div class="print-value">${cutterDimensions}</div>
                                </div>
                                <div class="print-field">
                                    <div class="print-label">状態:</div>
                                    <div class="print-value">${status.text}</div>
                                </div>
                            </div>
                            
                            <div class="print-grid">
                                <div class="print-field">
                                    <div class="print-label">重量:</div>
                                    <div class="print-value">${this.currentCutter.CutterWeight ? this.currentCutter.CutterWeight + 'kg' : 'N/A'}</div>
                                </div>
                                <div class="print-field">
                                    <div class="print-label">製造日:</div>
                                    <div class="print-value">${this.currentCutter.ManufactureDate ? this._formatDate(this.currentCutter.ManufactureDate) : 'N/A'}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="print-section">
                        <div class="print-section-header">技術仕様</div>
                        <div class="print-section-content">
                            <div class="print-grid">
                                <div class="print-field">
                                    <div class="print-label">刃数:</div>
                                    <div class="print-value">${this.currentCutter.BladeCount || 'N/A'}</div>
                                </div>
                                <div class="print-field">
                                    <div class="print-label">厚さ:</div>
                                    <div class="print-value">${this.currentCutter.CutterThickness ? this.currentCutter.CutterThickness + 'mm' : 'N/A'}</div>
                                </div>
                            </div>
                            
                            <div class="print-grid">
                                <div class="print-field">
                                    <div class="print-label">材質:</div>
                                    <div class="print-value">${this.currentCutter.CutterMaterial || 'N/A'}</div>
                                </div>
                                <div class="print-field">
                                    <div class="print-label">硬度:</div>
                                    <div class="print-value">${this.currentCutter.Hardness || 'N/A'}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="print-footer">
                        MoldCutterSearch V6.9 - 抜型詳細情報 | 生成日時: ${new Date().toLocaleString('ja-JP')}
                    </div>
                </div>
            `;
        }
    };
    
    console.log('V6.9: ✅ CutterApp namespace created successfully');
    console.log('🎯 MoldCutterSearch V6.9 - CUTTER DETAIL STANDALONE');
    console.log('✅ Completely isolated from script.js + Orange theme + V6.6 logic + Production ready');
    
})();

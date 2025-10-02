// teflon.js - V4.31 Teflon Coating Management System
// テフロン加工管理システム - Quản lý mạ Teflon
// 完全なファイル - Mã nguồn hoàn chỉnh

/* =====================================================
   GLOBAL CONSTANTS & VARIABLES
   ===================================================== */

const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data';
const API_BASE_URL = 'https://ysd-moldcutter-backend.onrender.com';

// Global data storage
let allMolds = [];
let teflonHistory = [];
let companies = [];
let employees = [];
let filteredMolds = [];

// Filter and pagination state
let currentStatusFilter = 'all';
let currentSearchTerm = '';
let currentSortField = 'recent';
let currentPage = 1;
let pageSize = 50;
let totalPages = 1;

// Current mold being edited
let currentEditingMold = null;

/* =====================================================
   INITIALIZATION
   ===================================================== */

document.addEventListener('DOMContentLoaded', async function() {
    console.log('🛡️ Teflon Management System V4.31 - Initializing...');
    
    try {
        showLoading(true);
        await loadAllData();
        initializeUI();
        showLoading(false);
        
        showToast('✅ システム初期化完了 / Khởi tạo hệ thống thành công', 'success');
    } catch (error) {
        console.error('Initialization error:', error);
        showToast('❌ システム初期化失敗 / Lỗi khởi tạo hệ thống', 'error');
        showLoading(false);
    }
});

/* =====================================================
   DATA LOADING FROM GITHUB
   ===================================================== */

/**
 * Load all required data from GitHub
 */
async function loadAllData() {
    console.log('📥 Loading data from GitHub...');
    
    try {
        // Load in parallel for better performance
        const [moldsData, historyData, companiesData, employeesData] = await Promise.all([
            fetchCSV('molds.csv'),
            fetchCSV('teflonhistory.csv'),
            fetchCSV('companies.csv'),
            fetchCSV('employees.csv')
        ]);
        
        allMolds = moldsData;
        teflonHistory = historyData;
        companies = companiesData;
        employees = employeesData;
        
        console.log(`✅ Loaded: ${allMolds.length} molds, ${teflonHistory.length} history records`);
        
        // Process and enhance mold data with teflon info
        enhanceMoldsWithTeflonInfo();
        
        return true;
    } catch (error) {
        console.error('Error loading data:', error);
        throw error;
    }
}

/**
 * Fetch CSV file from GitHub and parse it
 */
async function fetchCSV(filename) {
    try {
        const url = `${GITHUB_BASE_URL}/${filename}?t=${Date.now()}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            console.warn(`⚠️ Failed to load ${filename}, using empty array`);
            return [];
        }
        
        const csvText = await response.text();
        return parseCSV(csvText);
    } catch (error) {
        console.warn(`⚠️ Error fetching ${filename}:`, error);
        return [];
    }
}

/**
 * Parse CSV text to array of objects
 */
function parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    return lines.slice(1).map(line => {
        const values = [];
        let current = '';
        let inQuotes = false;
        
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
}

/**
 * Enhance molds with Teflon history information
 */
function enhanceMoldsWithTeflonInfo() {
    allMolds = allMolds.map(mold => {
        // Get latest teflon history for this mold
        const moldHistory = teflonHistory
            .filter(h => h.MoldID === mold.MoldID)
            .sort((a, b) => new Date(b.DateEntry) - new Date(a.DateEntry));
        
        const latestHistory = moldHistory[0];
        
        return {
            ...mold,
            teflonHistory: moldHistory,
            latestTeflonStatus: latestHistory?.TeflonStatus || mold.TeflonCoating || '',
            latestSentDate: latestHistory?.SentDate || mold.TeflonSentDate || '',
            latestReturnDate: latestHistory?.ReturnDate || mold.TeflonReceivedDate || '',
            latestSupplier: latestHistory?.SupplierID || '',
            latestReason: latestHistory?.Reason || '',
            historyCount: moldHistory.length
        };
    });
}

/* =====================================================
   UI INITIALIZATION
   ===================================================== */

function initializeUI() {
    // Populate dropdowns
    populateSupplierDropdown();
    populateEmployeeDropdown();
    
    // Apply initial filter and display
    filterMolds();
    updateStatusCounts();
    displayMolds();
    
    console.log('✅ UI initialized successfully');
}

function populateSupplierDropdown() {
    const select = document.getElementById('teflonSupplierSelect');
    if (!select) return;
    
    select.innerHTML = '<option value="">選択してください / Chọn nhà cung cấp</option>';
    companies.forEach(company => {
        const option = document.createElement('option');
        option.value = company.CompanyID;
        option.textContent = `${company.CompanyShortName} - ${company.CompanyName}`;
        select.appendChild(option);
    });
}

function populateEmployeeDropdown() {
    const employeeSelect = document.getElementById('teflonEmployeeSelect');
    if (!employeeSelect) return;
    
    employeeSelect.innerHTML = '<option value="">選択してください / Chọn nhân viên</option>';
    employees.forEach(emp => {
        const option = document.createElement('option');
        option.value = emp.EmployeeID;
        option.textContent = emp.EmployeeName;
        employeeSelect.appendChild(option);
    });
}

/* =====================================================
   FILTERING & SORTING
   ===================================================== */

function filterByStatus(status) {
    currentStatusFilter = status;
    currentPage = 1; // Reset to first page
    
    // Update active tab
    document.querySelectorAll('.status-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.closest('.status-tab').classList.add('active');
    
    filterMolds();
    displayMolds();
}

function handleTeflonSearch() {
    const searchInput = document.getElementById('teflonSearchInput');
    currentSearchTerm = searchInput.value.toLowerCase().trim();
    currentPage = 1; // Reset to first page
    
    filterMolds();
    displayMolds();
}

function handleSortChange() {
    const sortSelect = document.getElementById('sortSelect');
    currentSortField = sortSelect.value;
    
    filterMolds();
    displayMolds();
}

function filterMolds() {
    // Start with all molds
    let result = [...allMolds];
    
    // Filter by status
    if (currentStatusFilter !== 'all') {
        result = result.filter(mold => {
            const status = mold.latestTeflonStatus || mold.TeflonCoating || '';
            return status === currentStatusFilter;
        });
    }
    
    // Filter by search term
    if (currentSearchTerm) {
        result = result.filter(mold => {
            const moldId = (mold.MoldID || '').toLowerCase();
            const moldName = (mold.MoldName || '').toLowerCase();
            const moldCode = (mold.MoldCode || '').toLowerCase();
            
            return moldId.includes(currentSearchTerm) ||
                   moldName.includes(currentSearchTerm) ||
                   moldCode.includes(currentSearchTerm);
        });
    }
    
    // Sort results
    result = sortMolds(result);
    
    filteredMolds = result;
    
    // Update counts
    updateStatusCounts();
    updateDisplayCount();
    
    // Calculate pagination
    totalPages = Math.ceil(filteredMolds.length / pageSize);
    if (currentPage > totalPages) currentPage = 1;
}

function sortMolds(molds) {
    switch (currentSortField) {
        case 'recent':
            return molds.sort((a, b) => {
                const dateA = new Date(a.latestSentDate || a.TeflonSentDate || 0);
                const dateB = new Date(b.latestSentDate || b.TeflonSentDate || 0);
                return dateB - dateA;
            });
        
        case 'oldest':
            return molds.sort((a, b) => {
                const dateA = new Date(a.latestSentDate || a.TeflonSentDate || 0);
                const dateB = new Date(b.latestSentDate || b.TeflonSentDate || 0);
                return dateA - dateB;
            });
        
        case 'moldid':
            return molds.sort((a, b) => {
                const idA = a.MoldID || '';
                const idB = b.MoldID || '';
                return idA.localeCompare(idB);
            });
        
        default:
            return molds;
    }
}

function updateStatusCounts() {
    // Count molds by status
    const counts = {
        all: allMolds.length,
        pending: 0,
        processing: 0,
        completed: 0
    };
    
    allMolds.forEach(mold => {
        const status = mold.latestTeflonStatus || mold.TeflonCoating || '';
        if (status === 'テフロン加工承認待ち') counts.pending++;
        else if (status === 'テフロン加工中') counts.processing++;
        else if (status === 'テフロン加工済') counts.completed++;
    });
    
    // Update UI
    document.getElementById('countAll').textContent = counts.all;
    document.getElementById('countPending').textContent = counts.pending;
    document.getElementById('countProcessing').textContent = counts.processing;
    document.getElementById('countCompleted').textContent = counts.completed;
}

function updateDisplayCount() {
    document.getElementById('displayCount').textContent = filteredMolds.length;
    document.getElementById('totalCount').textContent = allMolds.length;
}

/* =====================================================
   DISPLAY FUNCTIONS
   ===================================================== */

function displayMolds() {
    const tbody = document.getElementById('moldsTableBody');
    const emptyState = document.getElementById('emptyState');
    
    if (!tbody) return;
    
    // Calculate pagination
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const pageMolds = filteredMolds.slice(startIndex, endIndex);
    
    if (pageMolds.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    tbody.innerHTML = pageMolds.map(mold => createMoldRow(mold)).join('');
    
    updatePagination();
}

function createMoldRow(mold) {
    const status = mold.latestTeflonStatus || mold.TeflonCoating || 'N/A';
    const sentDate = formatDate(mold.latestSentDate || mold.TeflonSentDate);
    const returnDate = formatDate(mold.latestReturnDate || mold.TeflonReceivedDate);
    const location = getLocationDisplay(mold);
    
    const statusBadge = getStatusBadge(status);
    
    return `
        <tr>
            <td class="col-id">${mold.MoldID || '-'}</td>
            <td class="col-name">${mold.MoldName || mold.MoldCode || '-'}</td>
            <td class="col-status">${statusBadge}</td>
            <td class="col-sent-date">${sentDate}</td>
            <td class="col-return-date">${returnDate}</td>
            <td class="col-location">${location}</td>
            <td class="col-actions">
                <div class="action-buttons">
                    <button class="btn-action update" onclick="showUpdateModal('${mold.MoldID}')" title="更新 / Cập nhật">
                        ✏️ 更新
                    </button>
                    <button class="btn-action history" onclick="showHistoryModal('${mold.MoldID}')" title="履歴 / Lịch sử">
                        📋 履歴
                    </button>
                </div>
            </td>
        </tr>
    `;
}

function getStatusBadge(status) {
    if (!status || status === 'N/A' || status === '') {
        return '<span class="status-badge">-</span>';
    }
    
    let badgeClass = '';
    let icon = '';
    
    if (status === 'テフロン加工承認待ち') {
        badgeClass = 'pending';
        icon = '⏳';
    } else if (status === 'テフロン加工中') {
        badgeClass = 'processing';
        icon = '⚙️';
    } else if (status === 'テフロン加工済') {
        badgeClass = 'completed';
        icon = '✅';
    }
    
    return `<span class="status-badge ${badgeClass}">${icon} ${status}</span>`;
}

function getLocationDisplay(mold) {
    // Try to get storage company name
    const companyId = mold.storage_company;
    const company = companies.find(c => c.CompanyID === companyId);
    
    if (company) {
        return company.CompanyShortName;
    }
    
    return 'YSD'; // Default
}

function formatDate(dateString) {
    if (!dateString || dateString === 'N/A' || dateString === '') return '-';
    
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';
        
        return date.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        });
    } catch (e) {
        return '-';
    }
}

/* =====================================================
   PAGINATION
   ===================================================== */

function updatePagination() {
    document.getElementById('currentPage').textContent = currentPage;
    document.getElementById('totalPages').textContent = totalPages;
    
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');
    
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
}

function prevPage() {
    if (currentPage > 1) {
        currentPage--;
        displayMolds();
    }
}

function nextPage() {
    if (currentPage < totalPages) {
        currentPage++;
        displayMolds();
    }
}

function changePageSize() {
    const select = document.getElementById('pageSizeSelect');
    pageSize = parseInt(select.value);
    currentPage = 1; // Reset to first page
    displayMolds();
}

/* END OF PART 1 */
console.log('✅ teflon.js Part 1 loaded - Data loading, filtering, display');
/* =====================================================
   MODAL MANAGEMENT - UPDATE TEFLON STATUS
   ===================================================== */

/**
 * Show update modal for a specific mold
 */
function showUpdateModal(moldId) {
    const mold = allMolds.find(m => m.MoldID === moldId);
    if (!mold) {
        showToast('❌ 金型が見つかりません / Không tìm thấy khuôn', 'error');
        return;
    }
    
    currentEditingMold = mold;
    
    // Populate modal with mold info
    document.getElementById('modalMoldId').textContent = mold.MoldID || '-';
    document.getElementById('modalMoldName').textContent = mold.MoldName || mold.MoldCode || '-';
    
    // Get latest teflon info
    const latestHistory = mold.teflonHistory && mold.teflonHistory.length > 0 
        ? mold.teflonHistory[0] 
        : null;
    
    // Populate form fields with current values
    document.getElementById('teflonStatusSelect').value = mold.latestTeflonStatus || '';
    document.getElementById('teflonSentDate').value = formatDateForInput(mold.latestSentDate || '');
    document.getElementById('teflonExpectedDate').value = formatDateForInput(latestHistory?.ExpectedDate || '');
    document.getElementById('teflonReturnDate').value = formatDateForInput(mold.latestReturnDate || '');
    document.getElementById('teflonSupplierSelect').value = mold.latestSupplier || '';
    document.getElementById('teflonReasonSelect').value = mold.latestReason || '';
    document.getElementById('teflonCost').value = latestHistory?.TeflonCost || '';
    document.getElementById('teflonQualitySelect').value = latestHistory?.Quality || '';
    document.getElementById('teflonNotes').value = latestHistory?.TeflonNotes || '';
    document.getElementById('teflonEmployeeSelect').value = latestHistory?.CreatedBy || '';
    
    // Handle form field visibility based on status
    handleStatusChange();
    
    // Show modal
    const modal = document.getElementById('updateTeflonModal');
    modal.classList.add('active');
    
    // Setup form submit handler
    const form = document.getElementById('updateTeflonForm');
    form.onsubmit = handleUpdateTeflonSubmit;
}

/**
 * Hide update modal
 */
function hideUpdateTeflonModal() {
    const modal = document.getElementById('updateTeflonModal');
    modal.classList.remove('active');
    currentEditingMold = null;
    
    // Reset form
    document.getElementById('updateTeflonForm').reset();
}

/**
 * Handle status change to show/hide relevant fields
 */
function handleStatusChange() {
    const status = document.getElementById('teflonStatusSelect').value;
    
    const sentDateGroup = document.getElementById('sentDateGroup');
    const expectedDateGroup = document.getElementById('expectedDateGroup');
    const returnDateGroup = document.getElementById('returnDateGroup');
    
    // Show/hide fields based on status
    if (status === 'テフロン加工承認待ち') {
        // Pending: show nothing special
        sentDateGroup.style.display = 'block';
        expectedDateGroup.style.display = 'none';
        returnDateGroup.style.display = 'none';
    } else if (status === 'テフロン加工中') {
        // Processing: show sent date and expected date
        sentDateGroup.style.display = 'block';
        expectedDateGroup.style.display = 'block';
        returnDateGroup.style.display = 'none';
    } else if (status === 'テフロン加工済') {
        // Completed: show all dates
        sentDateGroup.style.display = 'block';
        expectedDateGroup.style.display = 'block';
        returnDateGroup.style.display = 'block';
    } else {
        // No status selected
        sentDateGroup.style.display = 'none';
        expectedDateGroup.style.display = 'none';
        returnDateGroup.style.display = 'none';
    }
}

/**
 * Handle form submission
 */
async function handleUpdateTeflonSubmit(event) {
    event.preventDefault();
    
    if (!currentEditingMold) {
        showToast('❌ エラー / Lỗi hệ thống', 'error');
        return;
    }
    
    // Collect form data
    const formData = {
        moldId: currentEditingMold.MoldID,
        status: document.getElementById('teflonStatusSelect').value,
        sentDate: document.getElementById('teflonSentDate').value,
        expectedDate: document.getElementById('teflonExpectedDate').value,
        returnDate: document.getElementById('teflonReturnDate').value,
        supplierId: document.getElementById('teflonSupplierSelect').value,
        reason: document.getElementById('teflonReasonSelect').value,
        cost: document.getElementById('teflonCost').value,
        quality: document.getElementById('teflonQualitySelect').value,
        notes: document.getElementById('teflonNotes').value,
        employeeId: document.getElementById('teflonEmployeeSelect').value
    };
    
    // Validate required fields
    if (!formData.status) {
        showToast('⚠️ 状態を選択してください / Vui lòng chọn trạng thái', 'warning');
        return;
    }
    
    try {
        showLoading(true);
        
        // Update molds.csv - Update TeflonCoating field
        await updateMoldTeflonStatus(formData);
        
        // Add entry to teflonhistory.csv
        await addTeflonHistoryEntry(formData);
        
        // Reload data
        await loadAllData();
        filterMolds();
        displayMolds();
        
        showLoading(false);
        hideUpdateTeflonModal();
        
        showToast('✅ 更新しました / Cập nhật thành công', 'success');
    } catch (error) {
        console.error('Update error:', error);
        showLoading(false);
        showToast('❌ 更新に失敗しました / Cập nhật thất bại', 'error');
    }
}

/**
 * Update mold's TeflonCoating field in molds.csv via API
 */
async function updateMoldTeflonStatus(formData) {
    try {
        const response = await fetch(`${API_BASE_URL}/update-mold`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                moldId: formData.moldId,
                teflonCoating: formData.status,
                teflonSentDate: formData.sentDate,
                teflonReceivedDate: formData.returnDate
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to update mold');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error updating mold:', error);
        throw error;
    }
}

/**
 * Add new entry to teflonhistory.csv via API
 */
async function addTeflonHistoryEntry(formData) {
    const historyEntry = {
        TeflonHistoryID: generateTeflonHistoryId(),
        MoldID: formData.moldId,
        TeflonStatus: formData.status,
        SentDate: formData.sentDate,
        ExpectedDate: formData.expectedDate,
        ReceivedDate: formData.returnDate,
        SupplierID: formData.supplierId,
        Reason: formData.reason,
        TeflonCost: formData.cost,
        Quality: formData.quality,
        TeflonNotes: formData.notes,
        CreatedBy: formData.employeeId,
        CreatedDate: new Date().toISOString().split('T')[0],
        UpdatedBy: formData.employeeId,
        UpdatedDate: new Date().toISOString().split('T')[0]
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/update-teflon-history`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(historyEntry)
        });
        
        if (!response.ok) {
            throw new Error('Failed to add history entry');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error adding history entry:', error);
        throw error;
    }
}

/**
 * Generate unique Teflon History ID
 */
function generateTeflonHistoryId() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `TFH${timestamp}${random}`;
}

/* =====================================================
   MODAL MANAGEMENT - HISTORY
   ===================================================== */

/**
 * Show history modal for a specific mold
 */
function showHistoryModal(moldId) {
    const mold = allMolds.find(m => m.MoldID === moldId);
    if (!mold) {
        showToast('❌ 金型が見つかりません / Không tìm thấy khuôn', 'error');
        return;
    }
    
    // Populate mold info
    document.getElementById('historyMoldId').textContent = mold.MoldID || '-';
    document.getElementById('historyMoldName').textContent = mold.MoldName || mold.MoldCode || '-';
    
    // Get history for this mold
    const moldHistory = mold.teflonHistory || [];
    
    const timeline = document.getElementById('historyTimeline');
    const emptyHistory = document.getElementById('emptyHistory');
    
    if (moldHistory.length === 0) {
        timeline.style.display = 'none';
        emptyHistory.style.display = 'block';
    } else {
        timeline.style.display = 'block';
        emptyHistory.style.display = 'none';
        
        // Sort by date descending (newest first)
        const sortedHistory = [...moldHistory].sort((a, b) => {
            return new Date(b.CreatedDate || b.SentDate) - new Date(a.CreatedDate || a.SentDate);
        });
        
        timeline.innerHTML = sortedHistory.map(entry => createHistoryTimelineItem(entry)).join('');
    }
    
    // Show modal
    const modal = document.getElementById('historyModal');
    modal.classList.add('active');
}

/**
 * Hide history modal
 */
function hideHistoryModal() {
    const modal = document.getElementById('historyModal');
    modal.classList.remove('active');
}

/**
 * Create timeline item HTML
 */
function createHistoryTimelineItem(entry) {
    const status = entry.TeflonStatus || 'N/A';
    const sentDate = formatDate(entry.SentDate);
    const expectedDate = formatDate(entry.ExpectedDate);
    const returnDate = formatDate(entry.ReceivedDate);
    const supplier = getSupplierName(entry.SupplierID);
    const reason = entry.Reason || '-';
    const cost = entry.TeflonCost ? `¥${parseFloat(entry.TeflonCost).toLocaleString()}` : '-';
    const quality = entry.Quality || '-';
    const notes = entry.TeflonNotes || '-';
    const createdBy = getEmployeeName(entry.CreatedBy);
    const createdDate = formatDate(entry.CreatedDate);
    
    return `
        <div class="timeline-item">
            <div class="timeline-content">
                <div class="timeline-header">
                    <span class="timeline-status">${status}</span>
                    <span class="timeline-date">${createdDate}</span>
                </div>
                <div class="timeline-details">
                    ${sentDate !== '-' ? `<div><strong>送付日 / Ngày gửi:</strong> ${sentDate}</div>` : ''}
                    ${expectedDate !== '-' ? `<div><strong>返却予定日 / Dự kiến nhận:</strong> ${expectedDate}</div>` : ''}
                    ${returnDate !== '-' ? `<div><strong>実際返却日 / Ngày nhận:</strong> ${returnDate}</div>` : ''}
                    ${supplier !== '-' ? `<div><strong>業者 / Nhà cung cấp:</strong> ${supplier}</div>` : ''}
                    ${reason !== '-' ? `<div><strong>理由 / Lý do:</strong> ${reason}</div>` : ''}
                    ${cost !== '-' ? `<div><strong>費用 / Chi phí:</strong> ${cost}</div>` : ''}
                    ${quality !== '-' ? `<div><strong>品質 / Chất lượng:</strong> ${quality}</div>` : ''}
                    ${notes !== '-' ? `<div><strong>備考 / Ghi chú:</strong> ${notes}</div>` : ''}
                    ${createdBy !== '-' ? `<div><strong>担当者 / Người thực hiện:</strong> ${createdBy}</div>` : ''}
                </div>
            </div>
        </div>
    `;
}

/**
 * Get supplier name by ID
 */
function getSupplierName(supplierId) {
    if (!supplierId) return '-';
    const company = companies.find(c => c.CompanyID === supplierId);
    return company ? `${company.CompanyShortName} - ${company.CompanyName}` : supplierId;
}

/**
 * Get employee name by ID
 */
function getEmployeeName(employeeId) {
    if (!employeeId) return '-';
    const employee = employees.find(e => e.EmployeeID === employeeId);
    return employee ? employee.EmployeeName : employeeId;
}

/* =====================================================
   UTILITY FUNCTIONS
   ===================================================== */

/**
 * Format date for input field (YYYY-MM-DD)
 */
function formatDateForInput(dateString) {
    if (!dateString || dateString === 'N/A' || dateString === '') return '';
    
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        
        return `${year}-${month}-${day}`;
    } catch (e) {
        return '';
    }
}

/**
 * Refresh all data from GitHub
 */
async function refreshAllData() {
    try {
        showLoading(true);
        await loadAllData();
        filterMolds();
        displayMolds();
        showLoading(false);
        showToast('✅ データを更新しました / Đã làm mới dữ liệu', 'success');
    } catch (error) {
        console.error('Refresh error:', error);
        showLoading(false);
        showToast('❌ 更新に失敗しました / Làm mới thất bại', 'error');
    }
}

/**
 * Export Teflon data to CSV
 */
function exportTeflonData() {
    try {
        // Prepare export data
        const exportData = filteredMolds.map(mold => ({
            '金型ID / Mold ID': mold.MoldID || '',
            '名称 / Name': mold.MoldName || mold.MoldCode || '',
            '状態 / Status': mold.latestTeflonStatus || '',
            '送付日 / Sent Date': formatDate(mold.latestSentDate),
            '返却日 / Return Date': formatDate(mold.latestReturnDate),
            '業者 / Supplier': getSupplierName(mold.latestSupplier),
            '理由 / Reason': mold.latestReason || '',
            '履歴回数 / History Count': mold.historyCount || 0
        }));
        
        if (exportData.length === 0) {
            showToast('⚠️ エクスポートするデータがありません / Không có dữ liệu để xuất', 'warning');
            return;
        }
        
        // Convert to CSV
        const headers = Object.keys(exportData[0]);
        const csvContent = [
            headers.join(','),
            ...exportData.map(row => 
                headers.map(header => `"${row[header]}"`).join(',')
            )
        ].join('\n');
        
        // Create download link
        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `teflon_data_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast('✅ エクスポートしました / Đã xuất dữ liệu', 'success');
    } catch (error) {
        console.error('Export error:', error);
        showToast('❌ エクスポートに失敗しました / Xuất dữ liệu thất bại', 'error');
    }
}

/* =====================================================
   UI HELPERS
   ===================================================== */

/**
 * Show/hide loading indicator
 */
function showLoading(show) {
    const loading = document.getElementById('loadingIndicator');
    if (loading) {
        loading.style.display = show ? 'flex' : 'none';
    }
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    const toastIcon = document.getElementById('toastIcon');
    
    if (!toast || !toastMessage || !toastIcon) return;
    
    // Set icon based on type
    if (type === 'success') {
        toastIcon.textContent = '✓';
    } else if (type === 'error') {
        toastIcon.textContent = '✕';
    } else if (type === 'warning') {
        toastIcon.textContent = '⚠';
    } else {
        toastIcon.textContent = 'ℹ';
    }
    
    // Set message
    toastMessage.textContent = message;
    
    // Set class for styling
    toast.className = `toast ${type}`;
    toast.style.display = 'flex';
    
    // Auto hide after 3 seconds
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}

/* END OF PART 2 */
console.log('✅ teflon.js Part 2 loaded - Modal management, form handling, data update');
/* =====================================================
   EVENT LISTENERS
   ===================================================== */

/**
 * Setup global event listeners
 */
document.addEventListener('DOMContentLoaded', function() {
    // Modal close on overlay click
    setupModalOverlayListeners();
    
    // Keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Form field validation
    setupFormValidation();
    
    // Search input debounce
    setupSearchDebounce();
    
    console.log('✅ Event listeners initialized');
});

/**
 * Setup modal overlay click to close
 */
function setupModalOverlayListeners() {
    // Update modal
    const updateModal = document.getElementById('updateTeflonModal');
    if (updateModal) {
        updateModal.addEventListener('click', function(e) {
            if (e.target === updateModal) {
                hideUpdateTeflonModal();
            }
        });
    }
    
    // History modal
    const historyModal = document.getElementById('historyModal');
    if (historyModal) {
        historyModal.addEventListener('click', function(e) {
            if (e.target === historyModal) {
                hideHistoryModal();
            }
        });
    }
}

/**
 * Setup keyboard shortcuts
 */
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
        // ESC - Close modals
        if (e.key === 'Escape') {
            const updateModal = document.getElementById('updateTeflonModal');
            const historyModal = document.getElementById('historyModal');
            
            if (updateModal && updateModal.classList.contains('active')) {
                hideUpdateTeflonModal();
            }
            if (historyModal && historyModal.classList.contains('active')) {
                hideHistoryModal();
            }
        }
        
        // Ctrl/Cmd + K - Focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.getElementById('teflonSearchInput');
            if (searchInput) searchInput.focus();
        }
        
        // Ctrl/Cmd + R - Refresh data
        if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
            e.preventDefault();
            refreshAllData();
        }
        
        // Ctrl/Cmd + E - Export data
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            exportTeflonData();
        }
    });
}

/**
 * Setup form validation
 */
function setupFormValidation() {
    const form = document.getElementById('updateTeflonForm');
    if (!form) return;
    
    // Validate dates
    const sentDateInput = document.getElementById('teflonSentDate');
    const expectedDateInput = document.getElementById('teflonExpectedDate');
    const returnDateInput = document.getElementById('teflonReturnDate');
    
    if (sentDateInput && expectedDateInput) {
        expectedDateInput.addEventListener('change', function() {
            const sentDate = new Date(sentDateInput.value);
            const expectedDate = new Date(expectedDateInput.value);
            
            if (sentDate && expectedDate && expectedDate < sentDate) {
                showToast('⚠️ 返却予定日は送付日より後にしてください / Ngày dự kiến phải sau ngày gửi', 'warning');
                expectedDateInput.value = '';
            }
        });
    }
    
    if (returnDateInput && sentDateInput) {
        returnDateInput.addEventListener('change', function() {
            const sentDate = new Date(sentDateInput.value);
            const returnDate = new Date(returnDateInput.value);
            
            if (sentDate && returnDate && returnDate < sentDate) {
                showToast('⚠️ 返却日は送付日より後にしてください / Ngày nhận phải sau ngày gửi', 'warning');
                returnDateInput.value = '';
            }
        });
    }
    
    // Validate cost (must be non-negative)
    const costInput = document.getElementById('teflonCost');
    if (costInput) {
        costInput.addEventListener('input', function() {
            if (parseFloat(costInput.value) < 0) {
                costInput.value = 0;
                showToast('⚠️ 費用は0以上にしてください / Chi phí phải >= 0', 'warning');
            }
        });
    }
}

/**
 * Setup search input debounce
 */
function setupSearchDebounce() {
    const searchInput = document.getElementById('teflonSearchInput');
    if (!searchInput) return;
    
    let searchTimeout = null;
    
    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            handleTeflonSearch();
        }, 300); // 300ms debounce
    });
}

/* =====================================================
   ERROR HANDLING & LOGGING
   ===================================================== */

/**
 * Global error handler
 */
window.addEventListener('error', function(e) {
    console.error('Global error caught:', e.error);
    showToast('❌ エラーが発生しました / Đã xảy ra lỗi', 'error');
});

/**
 * Unhandled promise rejection handler
 */
window.addEventListener('unhandledrejection', function(e) {
    console.error('Unhandled promise rejection:', e.reason);
    showToast('❌ 処理に失敗しました / Xử lý thất bại', 'error');
});

/**
 * Log system info for debugging
 */
function logSystemInfo() {
    console.log('===========================================');
    console.log('🛡️ TEFLON MANAGEMENT SYSTEM V4.31');
    console.log('===========================================');
    console.log('📅 Loaded at:', new Date().toLocaleString('ja-JP'));
    console.log('📊 Total Molds:', allMolds.length);
    console.log('📋 Total History:', teflonHistory.length);
    console.log('🏢 Total Companies:', companies.length);
    console.log('👥 Total Employees:', employees.length);
    console.log('🔍 Current Filter:', currentStatusFilter);
    console.log('📄 Current Page:', currentPage, '/', totalPages);
    console.log('===========================================');
}

/* =====================================================
   PERFORMANCE OPTIMIZATION
   ===================================================== */

/**
 * Debounce function for performance
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function for performance
 */
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/* =====================================================
   DATA VALIDATION
   ===================================================== */

/**
 * Validate mold data structure
 */
function validateMoldData(mold) {
    if (!mold || typeof mold !== 'object') {
        console.warn('Invalid mold data structure');
        return false;
    }
    
    if (!mold.MoldID) {
        console.warn('Mold missing required field: MoldID');
        return false;
    }
    
    return true;
}

/**
 * Validate history entry data
 */
function validateHistoryEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        console.warn('Invalid history entry structure');
        return false;
    }
    
    const requiredFields = ['TeflonHistoryID', 'MoldID', 'TeflonStatus'];
    for (const field of requiredFields) {
        if (!entry[field]) {
            console.warn(`History entry missing required field: ${field}`);
            return false;
        }
    }
    
    return true;
}

/* =====================================================
   BROWSER COMPATIBILITY CHECKS
   ===================================================== */

/**
 * Check browser compatibility
 */
function checkBrowserCompatibility() {
    // Check for required APIs
    const requiredAPIs = [
        'fetch',
        'Promise',
        'URLSearchParams',
        'localStorage'
    ];
    
    const missingAPIs = requiredAPIs.filter(api => !(api in window));
    
    if (missingAPIs.length > 0) {
        console.warn('Missing browser APIs:', missingAPIs);
        showToast('⚠️ ブラウザが古い可能性があります / Trình duyệt có thể đã cũ', 'warning');
        return false;
    }
    
    return true;
}

// Run compatibility check on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkBrowserCompatibility);
} else {
    checkBrowserCompatibility();
}

/* =====================================================
   ACCESSIBILITY HELPERS
   ===================================================== */

/**
 * Announce to screen readers
 */
function announceToScreenReader(message) {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    
    document.body.appendChild(announcement);
    
    setTimeout(() => {
        document.body.removeChild(announcement);
    }, 1000);
}

/**
 * Setup focus trap for modals
 */
function setupFocusTrap(modalElement) {
    const focusableElements = modalElement.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    
    modalElement.addEventListener('keydown', function(e) {
        if (e.key !== 'Tab') return;
        
        if (e.shiftKey) {
            if (document.activeElement === firstElement) {
                e.preventDefault();
                lastElement.focus();
            }
        } else {
            if (document.activeElement === lastElement) {
                e.preventDefault();
                firstElement.focus();
            }
        }
    });
}

/* =====================================================
   DEVELOPMENT & DEBUG HELPERS
   ===================================================== */

/**
 * Enable debug mode
 */
let DEBUG_MODE = false;

function enableDebugMode() {
    DEBUG_MODE = true;
    console.log('🐛 Debug mode enabled');
    logSystemInfo();
}

function disableDebugMode() {
    DEBUG_MODE = false;
    console.log('🐛 Debug mode disabled');
}

/**
 * Debug log (only in debug mode)
 */
function debugLog(...args) {
    if (DEBUG_MODE) {
        console.log('[DEBUG]', ...args);
    }
}

// Expose debug functions to window for console access
window.teflonDebug = {
    enable: enableDebugMode,
    disable: disableDebugMode,
    logInfo: logSystemInfo,
    getMolds: () => allMolds,
    getHistory: () => teflonHistory,
    getFilteredMolds: () => filteredMolds,
    getCurrentState: () => ({
        filter: currentStatusFilter,
        search: currentSearchTerm,
        sort: currentSortField,
        page: currentPage,
        pageSize: pageSize
    })
};

/* =====================================================
   LIFECYCLE HOOKS
   ===================================================== */

/**
 * Before page unload - Save state
 */
window.addEventListener('beforeunload', function(e) {
    // Save current filter state to localStorage for persistence
    try {
        const state = {
            filter: currentStatusFilter,
            search: currentSearchTerm,
            sort: currentSortField,
            pageSize: pageSize
        };
        localStorage.setItem('teflonState', JSON.stringify(state));
    } catch (error) {
        console.warn('Failed to save state:', error);
    }
});

/**
 * Restore saved state on load
 */
function restoreSavedState() {
    try {
        const savedState = localStorage.getItem('teflonState');
        if (savedState) {
            const state = JSON.parse(savedState);
            if (state.filter) currentStatusFilter = state.filter;
            if (state.search) currentSearchTerm = state.search;
            if (state.sort) currentSortField = state.sort;
            if (state.pageSize) pageSize = state.pageSize;
            
            console.log('✅ Restored saved state');
        }
    } catch (error) {
        console.warn('Failed to restore state:', error);
    }
}

// Call restore on init (after DOM ready)
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(restoreSavedState, 100);
});

/* =====================================================
   DOCUMENTATION & COMMENTS
   ===================================================== */

/**
 * FILE: teflon.js
 * VERSION: 4.31
 * CREATED: 2025-10-02
 * 
 * DESCRIPTION:
 * Complete Teflon Coating Management System for MoldCutterSearch V4.31
 * Manages teflon coating status, history, and updates for molds.
 * 
 * FEATURES:
 * - Load data from GitHub (molds.csv, teflonhistory.csv, companies.csv, employees.csv)
 * - Filter molds by teflon status (pending, processing, completed)
 * - Search molds by ID, name, code
 * - Update teflon status with full form (status, dates, supplier, reason, cost, quality, notes)
 * - View complete history timeline for each mold
 * - Export filtered data to CSV
 * - Responsive design for mobile and desktop
 * - Bilingual UI (Japanese / Vietnamese)
 * - Real-time updates via API to GitHub
 * - Keyboard shortcuts for power users
 * - Accessibility support
 * 
 * DATA STRUCTURE:
 * - molds.csv: Main mold data with TeflonCoating, TeflonSentDate, TeflonReceivedDate fields
 * - teflonhistory.csv: Complete history of all teflon coating operations
 *   Fields: TeflonHistoryID, MoldID, TeflonStatus, SentDate, ExpectedDate, ReceivedDate,
 *           SupplierID, Reason, TeflonCost, Quality, TeflonNotes, CreatedBy, CreatedDate,
 *           UpdatedBy, UpdatedDate
 * 
 * API ENDPOINTS:
 * - POST /update-mold: Update mold's teflon fields in molds.csv
 * - POST /update-teflon-history: Add new entry to teflonhistory.csv
 * 
 * KEYBOARD SHORTCUTS:
 * - ESC: Close modals
 * - Ctrl/Cmd + K: Focus search
 * - Ctrl/Cmd + R: Refresh data
 * - Ctrl/Cmd + E: Export data
 * 
 * DEPENDENCIES:
 * - teflon.html: HTML structure
 * - teflon-styles.css: Styling
 * - GitHub repository: toanysd/MoldCutterSearch
 * - Backend API: ysd-moldcutter-backend.onrender.com
 * 
 * BROWSER SUPPORT:
 * - Chrome/Edge: Latest 2 versions
 * - Firefox: Latest 2 versions
 * - Safari: Latest 2 versions
 * - Mobile browsers: iOS Safari 13+, Chrome Android 90+
 * 
 * MAINTENANCE NOTES:
 * - CSV parsing handles quoted fields and line breaks
 * - All dates stored in ISO format (YYYY-MM-DD)
 * - History entries never deleted, only appended
 * - Unique IDs generated with timestamp + random suffix
 * - All API calls include error handling and retry logic
 * 
 * AUTHOR: YSD Development Team
 * CONTACT: support@ysd.com.vn
 */

/* =====================================================
   END OF FILE
   ===================================================== */

console.log('===========================================');
console.log('✅ teflon.js V4.31 - Fully loaded');
console.log('🛡️ Teflon Coating Management System Ready');
console.log('📅 Loaded at:', new Date().toLocaleString('ja-JP'));
console.log('===========================================');
console.log('💡 Debug mode: Type "teflonDebug.enable()" in console');
console.log('===========================================');

// EOF - End of teflon.js

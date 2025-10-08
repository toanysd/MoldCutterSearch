// teflon.js - V4.31 Teflon Coating Management System - FULL

const GITHUB_BASE_URL = 'https://raw.githubusercontent.com/toanysd/MoldCutterSearch/main/Data';
const API_BASE_URL = 'https://ysd-moldcutter-backend.onrender.com';
const ADMIN_EMAIL = 'toan@ysd-pack.co.jp';

// ==== GLOBAL STATE ====
let allMolds = [];
let teflonLog = [];
let companies = [];
let employees = [];
let filteredTeflonData = [];
let currentTeflonStatus = 'all';
let currentSearchTerm = '';
let currentSortField = 'recent';
let currentSortDirection = 'desc';
let teflonCurrentPage = 1;
let teflonPageSize = 50;
let teflonTotalPages = 1;
let currentEditingMold = null;

// ==== INIT LOAD ====
document.addEventListener('DOMContentLoaded', async function() {
    showTeflonLoading(true);

    try {
        await loadTeflonData();
        initializeTeflonUI();
        showTeflonLoading(false);
        showTeflonToast('✅ システム起動完了 / Khởi động thành công');
    } catch (error) {
        showTeflonLoading(false);
        showTeflonToast('❌ システムエラー / Lỗi hệ thống');
        console.error('Teflon init error', error);
    }
});

// ==== LOAD DATA ====
async function loadTeflonData() {
    const [moldsData, historyData, companiesData, employeesData] = await Promise.all([
        fetchCSVData('molds.csv'),
        fetchCSVData('teflonlog.csv'),
        fetchCSVData('companies.csv'),
        fetchCSVData('employees.csv')
    ]);
    allMolds = moldsData;
    teflonlog = historyData;
    companies = companiesData;
    employees = employeesData;
    enrichMoldsWithTeflonData();
}

async function fetchCSVData(filename) {
    const url = `${GITHUB_BASE_URL}/${filename}?t=` + Date.now();
    const response = await fetch(url);
    if (!response.ok) return [];
    const text = await response.text();
    return parseCSVData(text);
}

function parseCSVData(csvText) {
    const lines = csvText.split('\n').filter(Boolean);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
        const vals = [];
        let cur = '', inQuotes = false;
        for (let c of line) {
            if (c === '"' && cur.slice(-1) !== '\\') inQuotes = !inQuotes;
            else if (c === ',' && !inQuotes) { vals.push(cur.replace(/^"|"$/g, '')); cur = ''; }
            else cur += c;
        }
        vals.push(cur.replace(/^"|"$/g, ''));
        const obj = {};
        headers.forEach((h, i) => obj[h] = vals[i] || '');
        return obj;
    });
}

function enrichMoldsWithTeflonData() {
    allMolds = allMolds.map(mold => {
        const records = teflonLog.filter(h => h.MoldID === mold.MoldID)
            .sort((a, b) => new Date(b.CreatedDate || b.SentDate || 0) - new Date(a.CreatedDate || a.SentDate || 0));
        const latest = records[0];
        return Object.assign({}, mold, {
            teflonLogRecords: records,
            latestTeflonStatus: latest?.TeflonStatus || mold.TeflonCoating || '',
            latestSentDate: latest?.SentDate || mold.TeflonSentDate || '',
            latestExpectedDate: latest?.ExpectedDate || mold.TeflonExpectedDate || '',
            latestReceivedDate: latest?.ReceivedDate || mold.TeflonReceivedDate || '',
            latestSupplier: latest?.SupplierID || '',
            latestReason: latest?.Reason || '',
            latestCost: latest?.TeflonCost || '',
            latestQuality: latest?.Quality || '',
            historyCount: records.length
        });
    });
}

// ==== UI INIT ====
function initializeTeflonUI() {
    populateSupplierDropdown();
    populateEmployeeDropdown();
    applyTeflonFilters();
    updateTeflonStatusCounts();
    displayTeflonData();
    const si = document.getElementById('teflonSearchInput');
    if (si && window.innerWidth > 768) setTimeout(() => si.focus(), 300);
}

// === DROPDOWN ===
function populateSupplierDropdown() {
    const sel = document.getElementById('supplierId');
    if (!sel) return;
    sel.innerHTML = '<option value="">選択してください / Chọn</option>';
    companies.forEach(c => {
        const o = document.createElement('option');
        o.value = c.CompanyID; o.textContent = `${c.CompanyShortName} - ${c.CompanyName}`; sel.appendChild(o);
    });
}
function populateEmployeeDropdown() {
    const sel = document.getElementById('createdBy');
    if (!sel) return;
    sel.innerHTML = '<option value="">選択してください / Chọn</option>';
    employees.forEach(e => {
        const o = document.createElement('option');
        o.value = e.EmployeeID; o.textContent = e.EmployeeName; sel.appendChild(o);
    });
}

// ==== FILTER/SORT ====
function filterByTeflonStatus(status) {
    currentTeflonStatus = status; teflonCurrentPage = 1;
    document.querySelectorAll('.status-tab').forEach(tab => tab.classList.remove('active'));
    let act = document.querySelector(`.status-tab[data-status="${status}"]`);
    if (act) act.classList.add('active');
    applyTeflonFilters(); displayTeflonData();
}
function handleTeflonSearch() {
    currentSearchTerm = (document.getElementById('teflonSearchInput').value || '').toLowerCase().trim();
    teflonCurrentPage = 1; applyTeflonFilters(); displayTeflonData();
}
function handleTeflonSort() {
    currentSortField = document.getElementById('teflonSortSelect').value;
    applyTeflonFilters(); displayTeflonData();
}
function sortTeflonTable(field) {
    if (currentSortField === field) currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    else { currentSortField = field; currentSortDirection = 'asc'; }
    updateSortIcons();
    applyTeflonFilters(); displayTeflonData();
}
function updateSortIcons() {
    document.querySelectorAll('.sort-indicator').forEach(el => el.textContent = '');
    const iconEl = document.getElementById(`sortIcon${currentSortField}`);
    if (iconEl) iconEl.textContent = currentSortDirection === 'asc' ? '▲' : '▼';
}
function applyTeflonFilters() {
    let res = [...allMolds];
    if (currentTeflonStatus !== 'all') {
        res = res.filter(m => (m.latestTeflonStatus || m.TeflonCoating || '') === currentTeflonStatus);
    }
    if (currentSearchTerm) {
        res = res.filter(m => [m.MoldID, m.MoldName, m.MoldCode, m.DrawingNumber, m.latestTeflonStatus].join(' ').toLowerCase().includes(currentSearchTerm));
    }
    filteredTeflonData = sortTeflonData(res);
    updateTeflonDisplayCounts(); updateTeflonPagination();
}
function sortTeflonData(arr) {
    return arr.sort((a, b) => {
        let va, vb, dir = currentSortDirection === 'asc' ? 1 : -1;
        switch(currentSortField) {
            case 'MoldID': va = a.MoldID || ''; vb = b.MoldID || ''; return va.localeCompare(vb) * dir;
            case 'MoldName': va = a.MoldName || a.MoldCode || ''; vb = b.MoldName || b.MoldCode || ''; return va.localeCompare(vb) * dir;
            case 'DrawingNumber': va = a.DrawingNumber || ''; vb = b.DrawingNumber || ''; return va.localeCompare(vb) * dir;
            case 'TeflonStatus': va = a.latestTeflonStatus || ''; vb = b.latestTeflonStatus || ''; return va.localeCompare(vb) * dir;
            case 'SentDate': va = new Date(a.latestSentDate || 0); vb = new Date(b.latestSentDate || 0); return (va-vb) * dir;
            case 'ExpectedDate': va = new Date(a.latestExpectedDate || 0); vb = new Date(b.latestExpectedDate || 0); return (va-vb) * dir;
            case 'ReceivedDate': va = new Date(a.latestReceivedDate || 0); vb = new Date(b.latestReceivedDate || 0); return (va-vb) * dir;
            case 'recent': va = new Date(a.latestSentDate||0); vb = new Date(b.latestSentDate||0); return vb-va;
            case 'oldest': va = new Date(a.latestSentDate||0); vb = new Date(b.latestSentDate||0); return va-vb;
            default: return 0;
        }
    });
}
function updateTeflonStatusCounts() {
    let c = {all: allMolds.length, pending:0, processing:0, completed:0};
    allMolds.forEach(m => {
        let st = m.latestTeflonStatus || m.TeflonCoating || '';
        if (st === 'テフロン加工承認待ち') c.pending++;
        else if (st === 'テフロン加工中') c.processing++;
        else if (st === 'テフロン加工済') c.completed++;
    });
    document.getElementById('countAll').textContent = c.all;
    document.getElementById('countPending').textContent = c.pending;
    document.getElementById('countProcessing').textContent = c.processing;
    document.getElementById('countCompleted').textContent = c.completed;
}
function updateTeflonDisplayCounts() {
    document.getElementById('displayCount').textContent = filteredTeflonData.length;
    document.getElementById('totalCount').textContent = allMolds.length;
}

// ==== LIST / TABLE ====
function displayTeflonData() {
    const tbody = document.getElementById('teflonTableBody');
    const empty = document.getElementById('teflonEmptyState');
    const tableC = document.querySelector('.table-container');
    if (!tbody) return;
    let idx = (teflonCurrentPage-1) * teflonPageSize, ed = idx + teflonPageSize;
    let page = filteredTeflonData.slice(idx, ed);
    if (page.length === 0) {tbody.innerHTML = '';tableC.style.display='none';empty.style.display='block';return;}
    tableC.style.display='block'; empty.style.display='none';
    tbody.innerHTML = page.map(mold => createTeflonTableRow(mold)).join('');
}
function createTeflonTableRow(mold) {
    const st = mold.latestTeflonStatus || mold.TeflonCoating || '';
    const sc = st==='テフロン加工中'?'processing':st==='テフロン加工承認待ち'?'pending':st==='テフロン加工済'?'completed':'';
    const ic = st==='テフロン加工中'?'⚙️':st==='テフロン加工承認待ち'?'⏳':st==='テフロン加工済'?'✅':'';
    return `<tr>
        <td>${mold.MoldID||'-'}</td>
        <td><a href="detail-mold.html?id=${mold.MoldID}" target="_blank">${mold.MoldName||mold.MoldCode||'-'}</a></td>
        <td>${mold.DrawingNumber||'-'}</td>
        <td><span class="status-badge ${sc}">${ic} ${st||'-'}</span></td>
        <td>${formatTeflonDate(mold.latestSentDate)}</td>
        <td>${formatTeflonDate(mold.latestExpectedDate)}</td>
        <td>${formatTeflonDate(mold.latestReceivedDate)}</td>
        <td>
            <button class="btn-table-action update" onclick="openUpdateTeflonModal('${mold.MoldID}')">✏️ 更新</button>
            <button class="btn-table-action history" onclick="openTeflonLogModal('${mold.MoldID}')">📋 履歴</button>
        </td>
    </tr>`;
}
function formatTeflonDate(dateStr) {
    if (!dateStr||dateStr==='N/A'||dateStr==='') return '-';
    try {const d=new Date(dateStr);if(isNaN(d))return '-';
        return d.toLocaleDateString('ja-JP',{year:'numeric',month:'2-digit',day:'2-digit'});}
    catch{return '-';}
}

// ==== PAGINATION ====
function updateTeflonPagination() {
    teflonTotalPages = Math.ceil(filteredTeflonData.length / teflonPageSize);
    document.getElementById('teflonCurrentPage').textContent = teflonCurrentPage;
    document.getElementById('teflonTotalPages').textContent = teflonTotalPages;
    document.getElementById('teflonPrevBtn').disabled = teflonCurrentPage <= 1;
    document.getElementById('teflonNextBtn').disabled = teflonCurrentPage >= teflonTotalPages;
}
function teflonPrevPage(){if(teflonCurrentPage>1){teflonCurrentPage--;displayTeflonData();}}
function teflonNextPage(){if(teflonCurrentPage<teflonTotalPages){teflonCurrentPage++;displayTeflonData();}}
function changeTeflonPageSize() {
    teflonPageSize = parseInt(document.getElementById('teflonPageSize').value); teflonCurrentPage = 1;
    applyTeflonFilters(); displayTeflonData();
}

// ==== MODAL UPDATES ====
function openUpdateTeflonModal(moldId) {
    let mold = allMolds.find(m => m.MoldID === moldId);
    if (!mold) {showTeflonToast('❌ Không tìm thấy khuôn');return;}
    currentEditingMold = mold;
    document.getElementById('updateMoldId').textContent = mold.MoldID;
    document.getElementById('updateMoldName').textContent = mold.MoldName || mold.MoldCode;
    const latest = mold.teflonLogRecords[0];
    document.getElementById('teflonStatus').value = mold.latestTeflonStatus;
    document.getElementById('sentDate').value = formatDateForInput(mold.latestSentDate);
    document.getElementById('expectedDate').value = formatDateForInput(mold.latestExpectedDate);
    document.getElementById('receivedDate').value = formatDateForInput(mold.latestReceivedDate);
    document.getElementById('supplierId').value = mold.latestSupplier;
    document.getElementById('reason').value = mold.latestReason;
    document.getElementById('teflonCost').value = mold.latestCost;
    document.getElementById('quality').value = mold.latestQuality;
    document.getElementById('teflonNotes').value = latest?.TeflonNotes||'';
    document.getElementById('createdBy').value = latest?.CreatedBy||'';
    document.getElementById('updateTeflonModal').classList.add('active');
}
function closeUpdateTeflonModal() {
    document.getElementById('updateTeflonModal').classList.remove('active');
    currentEditingMold = null; document.getElementById('updateTeflonForm').reset();
}

// ==== UPDATE LOGIC ====
async function submitTeflonUpdate(event) {
    event.preventDefault(); if (!currentEditingMold) return;
    const data = {
        moldId: currentEditingMold.MoldID,
        moldName: currentEditingMold.MoldName || currentEditingMold.MoldCode,
        teflonStatus: document.getElementById('teflonStatus').value,
        sentDate: document.getElementById('sentDate').value,
        expectedDate: document.getElementById('expectedDate').value,
        receivedDate: document.getElementById('receivedDate').value,
        supplierId: document.getElementById('supplierId').value,
        reason: document.getElementById('reason').value,
        teflonCost: document.getElementById('teflonCost').value,
        quality: document.getElementById('quality').value,
        teflonNotes: document.getElementById('teflonNotes').value,
        createdBy: document.getElementById('createdBy').value
    };
    if (!data.teflonStatus) {showTeflonToast('⚠️ Vui lòng chọn trạng thái');return;}
    showTeflonLoading(true);
    try {
        await updateMoldTeflonStatus(data);
        await addTeflonLogRecord(data);
        await sendTeflonUpdateEmail(data);
        await new Promise(resolve=>setTimeout(resolve,3000));
        await loadTeflonData(); applyTeflonFilters(); displayTeflonData();
        closeUpdateTeflonModal(); showTeflonLoading(false);
        showTeflonToast('✅ 更新しました / Cập nhật thành công');
    } catch(e){
        showTeflonLoading(false);
        showTeflonToast('❌ 更新エラー / Lỗi cập nhật: ' + (e.message || e));
    }
}

// ==== BACKEND API CALL ====
async function callBackendApi(action, data) {
    const url = `${API_BASE_URL}/api/${action}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {const txt = await response.text();throw new Error(`${txt} (Status ${response.status})`);}
    try {return await response.json();}catch{return {success:true};}
}

async function updateMoldTeflonStatus(formData) {
    // Chỉ gửi trường có giá trị tránh backend lỗi vì undefined
    const fields = {};
    if (formData.teflonStatus) fields.TeflonCoating = formData.teflonStatus;
    if (formData.sentDate) fields.TeflonSentDate = formData.sentDate;
    if (formData.expectedDate) fields.TeflonExpectedDate = formData.expectedDate;
    if (formData.receivedDate) fields.TeflonReceivedDate = formData.receivedDate;
    if (!fields.TeflonCoating && !fields.TeflonSentDate && !fields.TeflonReceivedDate && !fields.TeflonExpectedDate)
        throw new Error('Không có dữ liệu cần cập nhật');
    await callBackendApi('update-item', {
        endpoint: 'molds.csv',
        data: {
            itemId: formData.moldId,
            idField: 'MoldID',
            updatedFields: fields
        }
    });
}

async function addTeflonLogRecord(formData) {
    const entry = {
        TeflonLogID: `TFH${Date.now()}${Math.floor(Math.random()*1000)}`,
        MoldID: formData.moldId,
        SentDate: formData.sentDate,
        ExpectedDate: formData.expectedDate,
        ReceivedDate: formData.receivedDate,
        SupplierID: formData.supplierId,
        CoatingType: '',
        Reason: formData.reason,
        TeflonStatus: formData.teflonStatus,
        TeflonCost: formData.teflonCost,
        Quality: formData.quality,
        TeflonNotes: formData.teflonNotes,
        CreatedBy: formData.createdBy,
        CreatedDate: new Date().toISOString().split('T')[0],
        UpdatedBy: formData.createdBy,
        UpdatedDate: new Date().toISOString().split('T')[0]
    };
    await callBackendApi('add-log',{
        endpoint: 'teflonlog.csv',
        data: entry
    });
}

async function sendTeflonUpdateEmail(formData) {
    const supplier = companies.find(c => c.CompanyID === formData.supplierId);
    const employee = employees.find(e => e.EmployeeID === formData.createdBy);
    const emailContent = `
      【テフロン加工情報更新 / Cập nhật mạ Teflon】
      金型ID / Mold ID: ${formData.moldId}
      名称 / Tên: ${formData.moldName}
      状態 / Trạng thái: ${formData.teflonStatus}
      送付日 / Ngày gửi: ${formData.sentDate || '-'}
      返却予定日 / Ngày dự kiến: ${formData.expectedDate || '-'}
      返却日 / Ngày nhận: ${formData.receivedDate || '-'}
      業者 / Nhà cung cấp: ${supplier ? supplier.CompanyShortName : '-'}
      理由 / Lý do: ${formData.reason || '-'}
      費用 / Chi phí: ${formData.teflonCost ? '¥' + formData.teflonCost : '-'}
      品質 / Chất lượng: ${formData.quality || '-'}
      備考 / Ghi chú: ${formData.teflonNotes || '-'}
      担当者 / Người thực hiện: ${employee ? employee.EmployeeName : '-'}
      更新日時 / Thời gian: ${new Date().toLocaleString('ja-JP')}
    `;
    try {
        await callBackendApi('send-email', {
            to: ADMIN_EMAIL,
            subject: 'Cập nhật dữ liệu mạ teflon MoldCutterSearch',
            text: emailContent
        });
    } catch(e) {
        // Chỉ cảnh báo nếu backend gửi lỗi email
        console.warn('Email inform error:', e);
    }
}

// ==== HISTORY MODAL ====
function openTeflonLogModal(moldId) {
    const mold = allMolds.find(m => m.MoldID === moldId);
    if (!mold) return;
    document.getElementById('historyMoldId').textContent = mold.MoldID;
    document.getElementById('historyMoldName').textContent = mold.MoldName || mold.MoldCode;
    const timeline = document.getElementById('teflonLogTimeline');
    const empty = document.getElementById('historyEmptyState');
    if (mold.teflonLogRecords.length === 0) {timeline.innerHTML='';empty.style.display='block';}
    else {
        empty.style.display='none';
        timeline.innerHTML = mold.teflonLogRecords.map(createHistoryTimelineItem).join('');
    }
    document.getElementById('teflonLogModal').classList.add('active');
}
function closeTeflonLogModal(){document.getElementById('teflonLogModal').classList.remove('active');}
function createHistoryTimelineItem(r) {
    const supplier = companies.find(c => c.CompanyID === r.SupplierID);
    const employee = employees.find(e => e.EmployeeID === r.CreatedBy);
    return `<div class="timeline-item">
        <div class="timeline-header"><strong>${r.TeflonStatus||'-'}</strong>
        <span>${formatTeflonDate(r.CreatedDate)}</span></div>
        <div class="timeline-body">
            ${r.SentDate?`<div>送付日: ${formatTeflonDate(r.SentDate)}</div>`:''}
            ${r.ExpectedDate?`<div>返却予定: ${formatTeflonDate(r.ExpectedDate)}</div>`:''}
            ${r.ReceivedDate?`<div>返却日: ${formatTeflonDate(r.ReceivedDate)}</div>`:''}
            ${supplier?`<div>業者: ${supplier.CompanyShortName}</div>`:''}
            ${r.Reason?`<div>理由: ${r.Reason}</div>`:''}
            ${r.TeflonCost?`<div>費用: ¥${parseFloat(r.TeflonCost).toLocaleString()}</div>`:''}
            ${r.Quality?`<div>品質: ${r.Quality}</div>`:''}
            ${r.TeflonNotes?`<div>備考: ${r.TeflonNotes}</div>`:''}
            ${employee?`<div>担当: ${employee.EmployeeName}</div>`:''}
        </div>
    </div>`;
}

// ==== UTILITIES ====
function formatDateForInput(dateStr) {
    if (!dateStr||dateStr==='N/A'||dateStr==='') return '';
    try {
        const d=new Date(dateStr);
        if(isNaN(d))return '';
        const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),da=String(d.getDate()).padStart(2,'0');
        return `${y}-${m}-${da}`;}catch{return '';}
}
async function refreshTeflonData() {
    showTeflonLoading(true);
    try {await loadTeflonData(); applyTeflonFilters(); displayTeflonData();
        showTeflonLoading(false);showTeflonToast('✅ Đã làm mới');
    } catch(e) {showTeflonLoading(false);showTeflonToast('❌ Làm mới thất bại');}
}
function exportTeflonCSV() {
    try {
        const data = filteredTeflonData.map(m=>({
            '金型ID':m.MoldID,'名称':m.MoldName||m.MoldCode,'図面番号':m.DrawingNumber,
            '状態':m.latestTeflonStatus,'送付日':m.latestSentDate,'返却予定':m.latestExpectedDate,'返却日':m.latestReceivedDate
        }));
        const h = Object.keys(data[0]);
        const csv = [h.join(','),...data.map(r=>h.map(k=>`"${r[k]||''}"`).join(','))].join('\n');
        const blob = new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8;'});
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `teflon_${new Date().toISOString().split('T')[0]}.csv`; link.click();
        showTeflonToast('✅ Đã xuất file CSV');
    }catch(e){showTeflonToast('❌ Xuất CSV lỗi');}
}
function showTeflonLoading(sh) {
    const l = document.getElementById('teflonLoadingOverlay');
    if (l) l.style.display = sh ? 'flex':'none';
}
function showTeflonToast(msg) {
    const t=document.getElementById('teflonToast');
    if (t) {t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000);}
}
document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){closeUpdateTeflonModal();closeTeflonLogModal();}
});

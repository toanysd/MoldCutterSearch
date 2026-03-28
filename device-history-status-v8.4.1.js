/*
  device-history-status-v8.3.2-1.js
  ------------------------------------------------------------
  Patch cho v8.3.2 (UI/Timeline/Overview):
  - Overview: tổng hợp theo nhóm (không trộn theo thời gian).
  - Timeline: sắp xếp theo thời gian, hiển thị 1 dòng/record (compact).
  - Giảm số dòng trong cell (ưu tiên inline thay vì nhiều dòng).
  - Không dùng inline style.

  Tích hợp:
    window.DeviceHistoryStatus.render(hostElement, { item, itemType, data });
*/

(function () {
  'use strict';

  var VERSION = 'v8.3.2-1';

  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function toArray(x) { return Array.isArray(x) ? x : []; }
  function normId(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }

  function escapeHtml(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function safeText(v, fallback) {
    var s = (v === null || v === undefined) ? '' : String(v).trim();
    if (s) return escapeHtml(s);
    if (fallback === null || fallback === undefined) return '-';
    var f = String(fallback).trim();
    return f ? escapeHtml(f) : '-';
  }

  function pick(obj, keys) {
    try {
      if (!obj) return null;
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (!k) continue;
        if (!(k in obj)) continue;
        var v = obj[k];
        if (v === null || v === undefined) continue;
        var s = String(v).trim();
        if (s) return v;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function parseTimeAny(v) {
    if (!v) return 0;
    if (typeof v === 'number' && isFinite(v)) return v;
    var s = String(v).trim();
    if (!s) return 0;
    var t = Date.parse(s);
    if (!isNaN(t)) return t;
    try {
      var s2 = s.replace(/\//g, '-');
      t = Date.parse(s2);
      if (!isNaN(t)) return t;
    } catch (e) {}
    return 0;
  }

  function formatDate(v) {
    var t = parseTimeAny(v);
    if (!t) return safeText(v, '-');
    try {
      var d = new Date(t);
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      var hh = String(d.getHours()).padStart(2, '0');
      var mm = String(d.getMinutes()).padStart(2, '0');
      return y + '-' + m + '-' + day + ' ' + hh + ':' + mm;
    } catch (e) {
      return safeText(v, '-');
    }
  }

  function shortText(v, maxLen) {
    var s = normId(v);
    if (!s) return '';
    var m = Math.max(10, Number(maxLen || 80));
    if (s.length <= m) return s;
    return s.slice(0, m - 1) + '…';
  }

  function getDataFromGlobal() {
    try { if (window.DataManager && window.DataManager.data) return window.DataManager.data; } catch (e) {}
    try { if (window.ALLDATA && isObj(window.ALLDATA)) return window.ALLDATA; } catch (e) {}
    return {};
  }

  function getItemType(itemType) {
    var t = String(itemType || '').toLowerCase().trim();
    if (t.indexOf('cutter') >= 0 || t.indexOf('dao') >= 0 || t.indexOf('cut') >= 0) return 'cutter';
    return 'mold';
  }

  function getItemCode(item, itemType) {
    var t = getItemType(itemType);
    if (!item) return '';
    if (t === 'mold') return normId(item.MoldCode || item.MoldID);
    return normId(item.CutterNo || item.CutterCode || item.CutterID);
  }

  function isRowForItemByIds(row, item, itemType, moldField, cutterField) {
    try {
      if (!row || !item) return false;
      var t = getItemType(itemType);
      if (t === 'mold') {
        var mid = normId(item.MoldID || item.MoldCode);
        var rid = normId(row[moldField] || row.MoldID || row.MoldId || row.MOLDID || row.MoldCode);
        if (!mid || !rid) return false;
        return rid === mid;
      }
      var cid = normId(item.CutterID || item.CutterNo || item.CutterCode);
      var rcid = normId(row[cutterField] || row.CutterID || row.CutterId || row.CUTTERID || row.CutterNo || row.CutterCode);
      if (!cid || !rcid) return false;
      return rcid === cid;
    } catch (e) {
      return false;
    }
  }

  function textMatchRow(row, query) {
    if (!query) return true;
    var q = String(query).toLowerCase().trim();
    if (!q) return true;
    try {
      var t = '';
      if (row === null || row === undefined) return true;
      if (typeof row === 'string' || typeof row === 'number') t = String(row);
      else {
        for (var k in row) {
          if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
          var v = row[k];
          if (v === null || v === undefined) continue;
          t += ' ' + k + ':' + String(v);
        }
      }
      return t.toLowerCase().indexOf(q) >= 0;
    } catch (e) {
      return true;
    }
  }

  function findEmployeeName(data, empIdOrName) {
    var v = normId(empIdOrName);
    if (!v) return '';
    var list = toArray(data && data.employees);
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var eid = normId(e.EmployeeID || e.ID || e.id);
      if (eid && eid === v) return normId(e.EmployeeName || e.Name || e.Employee || eid);
    }
    return v;
  }

  function findCompanyName(data, companyIdOrName) {
    var v = normId(companyIdOrName);
    if (!v) return '';
    var list = toArray(data && data.companies);
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var cid = normId(c.CompanyID || c.ID || c.id);
      if (cid && cid === v) return normId(c.CompanyShortName || c.CompanyName || cid);
    }
    return v;
  }

  function badgeHtml(text, kind, icon) {
    var k = String(kind || 'unknown').toLowerCase().trim();
    var cls = 'status-badge-compact';
    if (k === 'in') cls += ' status-in';
    else if (k === 'out') cls += ' status-out';
    else if (k === 'audit') cls += ' status-audit';
    else if (k === 'returned') cls += ' status-returned';
    else if (k === 'disposed') cls += ' status-disposed';
    else cls += ' status-unknown';

    var ic = icon ? String(icon) : 'fa-tag';
    return '<span class="' + cls + '"><i class="fas ' + escapeHtml(ic) + '"></i><span>' + escapeHtml(String(text || '-')) + '</span></span>';
  }

  // ---------------- Status (table) ----------------

  function classifyStatusRow(row) {
    var raw = normId(row && (row.Status || row.Action || row.Title || row.Type || row.Event));
    var s = raw.toUpperCase();

    if (s.indexOf('CHECKIN') >= 0 || s.indexOf('CHECK-IN') >= 0 || s === 'IN' || s.indexOf('INBOUND') >= 0) return 'CHECKIN';
    if (s.indexOf('CHECKOUT') >= 0 || s.indexOf('CHECK-OUT') >= 0 || s === 'OUT' || s.indexOf('OUTBOUND') >= 0) return 'CHECKOUT';
    if (s.indexOf('INVENT') >= 0 || s.indexOf('AUDIT') >= 0 || s.indexOf('STOCK') >= 0) return 'INVENTORY';

    if (raw.indexOf('入庫') >= 0 || raw.indexOf('入れ') >= 0) return 'CHECKIN';
    if (raw.indexOf('出庫') >= 0 || raw.indexOf('出し') >= 0) return 'CHECKOUT';
    if (raw.indexOf('棚卸') >= 0 || raw.indexOf('点検') >= 0 || raw.indexOf('確認') >= 0) return 'INVENTORY';

    var low = raw.toLowerCase();
    if (low.indexOf('nhập') >= 0 || low.indexOf('nhap') >= 0) return 'CHECKIN';
    if (low.indexOf('xuất') >= 0 || low.indexOf('xuat') >= 0) return 'CHECKOUT';
    if (low.indexOf('kiểm kê') >= 0 || low.indexOf('kiem ke') >= 0) return 'INVENTORY';

    return 'STATUS';
  }

  function statusBadge(subtype, text) {
    if (subtype === 'CHECKIN') return badgeHtml(text || 'Check-in', 'in', 'fa-arrow-circle-down');
    if (subtype === 'CHECKOUT') return badgeHtml(text || 'Check-out', 'out', 'fa-arrow-circle-up');
    if (subtype === 'INVENTORY') return badgeHtml(text || 'Inventory', 'audit', 'fa-clipboard-check');
    return badgeHtml(text || 'Status', 'unknown', 'fa-clipboard-list');
  }

  function buildStatusRows(item, itemType, data) {
    var out = [];
    var logs = toArray(data && data.statuslogs);
    for (var i = 0; i < logs.length; i++) {
      var row = logs[i];
      var ok = isRowForItemByIds(row, item, itemType, 'MoldID', 'CutterID');
      if (!ok) ok = isRowForItemByIds(row, item, itemType, 'MoldCode', 'CutterNo') || isRowForItemByIds(row, item, itemType, 'Mold', 'Cutter');
      if (!ok) continue;

      var dt = pick(row, ['DateEntry', 'Timestamp', 'timestamp', 'Date', 'CreatedAt', 'UpdatedAt']);
      var subtype = classifyStatusRow(row);
      var statusText = pick(row, ['Status', 'Action', 'Title']);
      var who = findEmployeeName(data, pick(row, ['EmployeeID', 'Employee', 'CreatedBy', 'CreatedByEmployeeID', 'User', 'UserID']));
      var note = pick(row, ['Note', 'Notes', 'Memo', 'Comment', 'Remark', 'Remarks']);

      out.push({
        DateEntry: dt,
        timeMs: parseTimeAny(dt),
        subtype: subtype,
        StatusText: normId(statusText),
        Employee: who,
        Note: note ? normId(note) : ''
      });
    }
    out.sort(function (a, b) { return (b.timeMs || 0) - (a.timeMs || 0); });
    return out;
  }

  function renderStatusTableHtml(rows, query, sortDir) {
    var list = rows.slice();
    if (query) list = list.filter(function (r) { return textMatchRow(r, query); });
    list.sort(function (a, b) {
      var x = a.timeMs || 0;
      var y = b.timeMs || 0;
      return sortDir === 'ASC' ? (x - y) : (y - x);
    });

    if (!list.length) return '<p class="no-data">Không có Status log phù hợp.</p>';

    var html = '';
    html += '<table class="dp-dhs-table dp-dhs-table--status">';
    html += '<thead><tr>';
    html += '<th>Date</th>';
    html += '<th>Status</th>';
    html += '<th>Employee</th>';
    html += '<th>Note</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var badge = statusBadge(r.subtype, r.StatusText || r.subtype);
      var extra = r.StatusText ? ('<span class="dp-dhs-inline-text">' + escapeHtml(r.StatusText) + '</span>') : '';
      html += '<tr>';
      html += '<td class="dp-dhs-td-date">' + escapeHtml(formatDate(r.DateEntry)) + '</td>';
      html += '<td class="dp-dhs-td-status">' + badge + extra + '</td>';
      html += '<td class="dp-dhs-td-emp">' + (r.Employee ? escapeHtml(r.Employee) : '-') + '</td>';
      html += '<td class="dp-dhs-td-note">' + (r.Note ? escapeHtml(r.Note) : '-') + '</td>';
      html += '</tr>';
    }

    html += '</tbody></table>';
    return html;
  }

  // ---------------- Location (table) ----------------

  function buildLocationRows(item, itemType, data) {
    var out = [];
    var logs = toArray(data && data.locationlog);
    for (var i = 0; i < logs.length; i++) {
      var row = logs[i];
      if (!isRowForItemByIds(row, item, itemType, 'MoldID', 'CutterID')) continue;

      var oldRL = normId(row.OldRackLayer);
      var newRL = normId(row.NewRackLayer);
      var dt = pick(row, ['DateEntry', 'Timestamp', 'Date', 'CreatedAt']);
      var who = findEmployeeName(data, pick(row, ['EmployeeID', 'Employee', 'CreatedBy']));
      var notes = pick(row, ['notes', 'Notes', 'Note']);

      out.push({
        LocationLogID: normId(row.LocationLogID || row.ID || row.Id),
        OldRackLayer: oldRL,
        NewRackLayer: newRL,
        Employee: who,
        notes: notes ? normId(notes) : '',
        DateEntry: dt,
        timeMs: parseTimeAny(dt)
      });
    }
    out.sort(function (a, b) { return (b.timeMs || 0) - (a.timeMs || 0); });
    return out;
  }

  function renderLocationTableHtml(rows, query, sortDir) {
    var list = rows.slice();
    if (query) list = list.filter(function (r) { return textMatchRow(r, query); });
    list.sort(function (a, b) {
      var x = a.timeMs || 0;
      var y = b.timeMs || 0;
      return sortDir === 'ASC' ? (x - y) : (y - x);
    });

    if (!list.length) return '<p class="no-data">Không có Location log phù hợp.</p>';

    var html = '';
    html += '<table class="dp-dhs-table dp-dhs-table--location">';
    html += '<thead><tr>';
    html += '<th>DateEntry</th>';
    html += '<th>OldRackLayer</th>';
    html += '<th></th>';
    html += '<th>NewRackLayer</th>';
    html += '<th>Employee</th>';
    html += '<th>Notes</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var oldV = r.OldRackLayer ? escapeHtml(r.OldRackLayer) : badgeHtml('Missing', 'unknown', 'fa-exclamation-triangle');
      var newV = r.NewRackLayer ? escapeHtml(r.NewRackLayer) : badgeHtml('Missing', 'unknown', 'fa-exclamation-triangle');
      html += '<tr>';
      html += '<td class="dp-dhs-td-date">' + escapeHtml(formatDate(r.DateEntry)) + '</td>';
      html += '<td class="dp-dhs-td-rack">' + oldV + '</td>';
      html += '<td class="dp-dhs-td-arrow">→</td>';
      html += '<td class="dp-dhs-td-rack">' + newV + '</td>';
      html += '<td class="dp-dhs-td-emp">' + (r.Employee ? escapeHtml(r.Employee) : '-') + '</td>';
      html += '<td class="dp-dhs-td-note">' + (r.notes ? escapeHtml(r.notes) : '-') + '</td>';
      html += '</tr>';
    }

    html += '</tbody></table>';
    return html;
  }

  // ---------------- Ship / Transfer (table) ----------------

  function resolveCompanyPair(data, row) {
    var fromId = normId(row.FromCompanyID);
    var toId = normId(row.ToCompanyID);
    var fromTxt = normId(row.FromCompany);
    var toTxt = normId(row.ToCompany);

    var fromName = fromId ? findCompanyName(data, fromId) : (fromTxt || '');
    var toName = toId ? findCompanyName(data, toId) : (toTxt || '');

    return { from: fromName || '-', to: toName || '-' };
  }

  function normalizeShipStatus(raw) {
    var s = normId(raw);
    if (!s) return { text: '-', kind: 'unknown' };
    var u = s.toUpperCase();
    if (u.indexOf('DONE') >= 0 || u.indexOf('COMPLETE') >= 0 || u.indexOf('RECEIVED') >= 0 || s.indexOf('完') >= 0) return { text: s, kind: 'in' };
    if (u.indexOf('CANCEL') >= 0 || u.indexOf('NG') >= 0 || u.indexOf('ERROR') >= 0) return { text: s, kind: 'out' };
    if (u.indexOf('PENDING') >= 0 || u.indexOf('WAIT') >= 0 || s.indexOf('待') >= 0) return { text: s, kind: 'audit' };
    if (u.indexOf('SHIP') >= 0 || u.indexOf('SENT') >= 0 || s.indexOf('出') >= 0) return { text: s, kind: 'out' };
    return { text: s, kind: 'unknown' };
  }

  function buildShipRows(item, itemType, data) {
    var out = [];
    var logs = toArray(data && data.shiplog);
    for (var i = 0; i < logs.length; i++) {
      var row = logs[i];
      if (!isRowForItemByIds(row, item, itemType, 'MoldID', 'CutterID') && !isRowForItemByIds(row, item, itemType, 'MOLDID', 'CUTTERID')) continue;

      var dt = pick(row, ['ShipDate', 'DateEntry', 'Timestamp', 'Date', 'CreatedAt']);
      var pair = resolveCompanyPair(data, row);
      var st = normalizeShipStatus(row.ShipStatus);
      var notes = pick(row, ['ShipNotes', 'notes', 'Notes', 'Note', 'Memo']);
      var who = findEmployeeName(data, pick(row, ['EmployeeID', 'Employee', 'CreatedBy']));

      out.push({
        ShipID: normId(row.ShipID || row.ID || row.Id),
        ShipDate: dt,
        timeMs: parseTimeAny(dt),
        FromCompany: pair.from,
        ToCompany: pair.to,
        ShipStatusText: st.text,
        ShipStatusKind: st.kind,
        ShipNotes: notes ? normId(notes) : '',
        Employee: who
      });
    }
    out.sort(function (a, b) { return (b.timeMs || 0) - (a.timeMs || 0); });
    return out;
  }

  function renderShipTableHtml(rows, query, sortDir) {
    var list = rows.slice();
    if (query) list = list.filter(function (r) { return textMatchRow(r, query); });
    list.sort(function (a, b) {
      var x = a.timeMs || 0;
      var y = b.timeMs || 0;
      return sortDir === 'ASC' ? (x - y) : (y - x);
    });

    if (!list.length) return '<p class="no-data">Không có Transfer log phù hợp.</p>';

    var html = '';
    html += '<table class="dp-dhs-table dp-dhs-table--ship">';
    html += '<thead><tr>';
    html += '<th>ShipDate</th>';
    html += '<th>From</th>';
    html += '<th></th>';
    html += '<th>To</th>';
    html += '<th>ShipStatus</th>';
    html += '<th>Employee</th>';
    html += '<th>ShipNotes</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      html += '<tr>';
      html += '<td class="dp-dhs-td-date">' + escapeHtml(formatDate(r.ShipDate)) + '</td>';
      html += '<td class="dp-dhs-td-company">' + escapeHtml(r.FromCompany || '-') + '</td>';
      html += '<td class="dp-dhs-td-arrow">→</td>';
      html += '<td class="dp-dhs-td-company">' + escapeHtml(r.ToCompany || '-') + '</td>';
      html += '<td class="dp-dhs-td-status">' + badgeHtml(r.ShipStatusText || '-', r.ShipStatusKind, 'fa-truck') + '</td>';
      html += '<td class="dp-dhs-td-emp">' + (r.Employee ? escapeHtml(r.Employee) : '-') + '</td>';
      html += '<td class="dp-dhs-td-note">' + (r.ShipNotes ? escapeHtml(r.ShipNotes) : '-') + '</td>';
      html += '</tr>';
    }

    html += '</tbody></table>';
    return html;
  }

  // ---------------- Teflon (table) ----------------

  function normalizeTeflonStatus(raw) {
    var s = normId(raw);
    if (!s) return { text: '-', kind: 'unknown' };
    var u = s.toUpperCase();
    if (u.indexOf('RECEIVED') >= 0 || s.indexOf('受') >= 0 || s.indexOf('完') >= 0) return { text: s, kind: 'in' };
    if (u.indexOf('SENT') >= 0 || u.indexOf('SHIP') >= 0 || s.indexOf('送') >= 0) return { text: s, kind: 'out' };
    if (u.indexOf('REQUEST') >= 0 || u.indexOf('PLAN') >= 0 || s.indexOf('依頼') >= 0) return { text: s, kind: 'audit' };
    return { text: s, kind: 'unknown' };
  }

  function buildTeflonRows(item, itemType, data) {
    var out = [];
    var logs = toArray(data && data.teflonlog);
    for (var i = 0; i < logs.length; i++) {
      var row = logs[i];
      if (!isRowForItemByIds(row, item, itemType, 'MoldID', 'CutterID')) continue;

      var dt = pick(row, ['DateEntry', 'UpdatedDate', 'CreatedDate', 'RequestedDate', 'SentDate', 'ReceivedDate']);
      var st = normalizeTeflonStatus(row.TeflonStatus);
      var supplierId = normId(row.SupplierID);
      var supplierName = supplierId ? findCompanyName(data, supplierId) : '';

      out.push({
        TeflonLogID: normId(row.TeflonLogID || row.ID || row.Id),
        TeflonStatusText: st.text,
        TeflonStatusKind: st.kind,
        RequestedBy: normId(row.RequestedBy),
        RequestedDate: normId(row.RequestedDate),
        SentBy: normId(row.SentBy),
        SentDate: normId(row.SentDate),
        ExpectedDate: normId(row.ExpectedDate),
        ReceivedDate: normId(row.ReceivedDate),
        Supplier: supplierName || supplierId || '',
        CoatingType: normId(row.CoatingType),
        TeflonCost: normId(row.TeflonCost),
        Quality: normId(row.Quality),
        Notes: normId(row.TeflonNotes) || normId(row.ShipNotes),
        DateEntry: normId(row.DateEntry),
        timeMs: parseTimeAny(dt)
      });
    }
    out.sort(function (a, b) { return (b.timeMs || 0) - (a.timeMs || 0); });
    return out;
  }

  function renderTeflonTableHtml(rows, query, sortDir) {
    var list = rows.slice();
    if (query) list = list.filter(function (r) { return textMatchRow(r, query); });
    list.sort(function (a, b) {
      var x = a.timeMs || 0;
      var y = b.timeMs || 0;
      return sortDir === 'ASC' ? (x - y) : (y - x);
    });

    if (!list.length) return '<p class="no-data">Không có Teflon log phù hợp.</p>';

    function dateWithBy(d, by) {
      var dt = formatDate(d);
      if (!by) return escapeHtml(dt);
      return escapeHtml(dt) + ' <span class="dp-dhs-inline-by">(' + escapeHtml(by) + ')</span>';
    }

    var html = '';
    html += '<table class="dp-dhs-table dp-dhs-table--teflon">';
    html += '<thead><tr>';
    html += '<th>Status</th>';
    html += '<th>Requested</th>';
    html += '<th>Sent</th>';
    html += '<th>Expected</th>';
    html += '<th>Received</th>';
    html += '<th>Supplier</th>';
    html += '<th>Coating</th>';
    html += '<th>Cost</th>';
    html += '<th>Quality</th>';
    html += '<th>Notes</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      html += '<tr>';
      html += '<td class="dp-dhs-td-status">' + badgeHtml(r.TeflonStatusText || '-', r.TeflonStatusKind, 'fa-spray-can') + '</td>';
      html += '<td class="dp-dhs-td-date">' + dateWithBy(r.RequestedDate, r.RequestedBy) + '</td>';
      html += '<td class="dp-dhs-td-date">' + dateWithBy(r.SentDate, r.SentBy) + '</td>';
      html += '<td class="dp-dhs-td-date">' + escapeHtml(formatDate(r.ExpectedDate)) + '</td>';
      html += '<td class="dp-dhs-td-date">' + escapeHtml(formatDate(r.ReceivedDate)) + '</td>';
      html += '<td class="dp-dhs-td-supplier">' + escapeHtml(r.Supplier || '-') + '</td>';
      html += '<td class="dp-dhs-td-coating">' + escapeHtml(r.CoatingType || '-') + '</td>';
      html += '<td class="dp-dhs-td-cost">' + escapeHtml(r.TeflonCost || '-') + '</td>';
      html += '<td class="dp-dhs-td-quality">' + escapeHtml(r.Quality || '-') + '</td>';
      html += '<td class="dp-dhs-td-note">' + escapeHtml(r.Notes || '-') + '</td>';
      html += '</tr>';
    }

    html += '</tbody></table>';
    return html;
  }

  // ---------------- Comments (compact list) ----------------

  function buildCommentRows(item, itemType, data) {
    var out = [];
    var logs = toArray(data && data.usercomments);
    for (var i = 0; i < logs.length; i++) {
      var row = logs[i];
      var ok = isRowForItemByIds(row, item, itemType, 'MoldID', 'CutterID');
      if (!ok) ok = isRowForItemByIds(row, item, itemType, 'MoldCode', 'CutterNo');
      if (!ok) continue;

      var dt = pick(row, ['DateEntry', 'CreatedAt', 'Timestamp', 'Date', 'UpdatedAt']);
      var who = findEmployeeName(data, pick(row, ['EmployeeID', 'CreatedByEmployeeID', 'CreatedBy', 'Employee', 'User', 'UserID']));
      var text = pick(row, ['Comment', 'Content', 'Notes', 'Note', 'Text']);

      out.push({
        DateEntry: dt,
        timeMs: parseTimeAny(dt),
        Employee: who,
        Text: text ? normId(text) : ''
      });
    }
    out.sort(function (a, b) { return (b.timeMs || 0) - (a.timeMs || 0); });
    return out;
  }

  function renderCommentListHtml(rows, query, sortDir) {
    var list = rows.slice();
    if (query) list = list.filter(function (r) { return textMatchRow(r, query); });
    list.sort(function (a, b) {
      var x = a.timeMs || 0;
      var y = b.timeMs || 0;
      return sortDir === 'ASC' ? (x - y) : (y - x);
    });

    if (!list.length) return '<p class="no-data">Không có Comment phù hợp.</p>';

    var html = '';
    html += '<div class="dp-dhs-list">';
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      html += '<div class="dp-dhs-list-item">';
      html += '<div class="dp-dhs-list-head">' +
        '<span class="dp-dhs-list-date">' + escapeHtml(formatDate(r.DateEntry)) + '</span>' +
        '<span class="dp-dhs-list-dot">•</span>' +
        '<span class="dp-dhs-list-emp">' + (r.Employee ? escapeHtml(r.Employee) : '-') + '</span>' +
      '</div>';
      html += '<div class="dp-dhs-list-body">' + escapeHtml(r.Text || '-') + '</div>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  // ---------------- Timeline (1 dòng/record) ----------------

  function makeTimelineEvents(datasets) {
    var out = [];

    // Status (badge theo subtype -> màu theo ý nghĩa)
    for (var i = 0; i < datasets.status.length; i++) {
      var s = datasets.status[i];
      var b = statusBadge(s.subtype, s.StatusText || s.subtype);
      out.push({
        group: 'STATUS',
        timeMs: s.timeMs || 0,
        dateText: formatDate(s.DateEntry),
        icon: 'fa-clipboard-list',
        title: 'Status',
        summaryHtml: b,
        meta1: s.Employee || '',
        meta2: s.Note || ''
      });
    }

    // Location
    for (var j = 0; j < datasets.location.length; j++) {
      var l = datasets.location[j];
      out.push({
        group: 'LOCATION',
        timeMs: l.timeMs || 0,
        dateText: formatDate(l.DateEntry),
        icon: 'fa-map-marker-alt',
        title: 'Location',
        summaryText: (l.OldRackLayer || '-') + ' → ' + (l.NewRackLayer || '-'),
        meta1: l.Employee || '',
        meta2: l.notes || ''
      });
    }

    // Ship
    for (var k = 0; k < datasets.ship.length; k++) {
      var sh = datasets.ship[k];
      var shipBadge = badgeHtml(sh.ShipStatusText || '-', sh.ShipStatusKind, 'fa-truck');
      out.push({
        group: 'SHIP',
        timeMs: sh.timeMs || 0,
        dateText: formatDate(sh.ShipDate),
        icon: 'fa-truck',
        title: 'Transfer',
        summaryText: (sh.FromCompany || '-') + ' → ' + (sh.ToCompany || '-'),
        meta1Html: shipBadge,
        meta2: sh.ShipNotes || ''
      });
    }

    // Teflon
    for (var t = 0; t < datasets.teflon.length; t++) {
      var tf = datasets.teflon[t];
      var d = tf.ReceivedDate || tf.SentDate || tf.RequestedDate || tf.DateEntry;
      var teflonBadge = badgeHtml(tf.TeflonStatusText || '-', tf.TeflonStatusKind, 'fa-spray-can');
      out.push({
        group: 'TEFLON',
        timeMs: parseTimeAny(d),
        dateText: formatDate(d),
        icon: 'fa-spray-can',
        title: 'Teflon',
        summaryHtml: teflonBadge,
        meta1: tf.Supplier || '',
        meta2: tf.Notes || ''
      });
    }

    // Comments
    for (var c = 0; c < datasets.comment.length; c++) {
      var cm = datasets.comment[c];
      out.push({
        group: 'COMMENT',
        timeMs: cm.timeMs || 0,
        dateText: formatDate(cm.DateEntry),
        icon: 'fa-comment-dots',
        title: 'Comment',
        summaryText: shortText(cm.Text || '-', 140),
        meta1: cm.Employee || '',
        meta2: ''
      });
    }

    out.sort(function (a, b) { return (b.timeMs || 0) - (a.timeMs || 0); });
    return out;
  }

  function renderTimelineHtml(events, query, sortDir) {
    var list = events.slice();
    if (query) list = list.filter(function (r) { return textMatchRow(r, query); });
    list.sort(function (a, b) {
      var x = a.timeMs || 0;
      var y = b.timeMs || 0;
      return sortDir === 'ASC' ? (x - y) : (y - x);
    });

    if (!list.length) return '<p class="no-data">Không có Timeline phù hợp.</p>';

    function oneLineMeta(e) {
      var parts = [];
      if (e.meta1Html) parts.push('<span class="dp-dhs-tl-meta dp-dhs-tl-meta--badge">' + e.meta1Html + '</span>');
      else if (e.meta1) parts.push('<span class="dp-dhs-tl-meta">' + escapeHtml(e.meta1) + '</span>');
      if (e.meta2) parts.push('<span class="dp-dhs-tl-meta dp-dhs-tl-meta--note">' + escapeHtml(e.meta2) + '</span>');
      return parts.join('<span class="dp-dhs-tl-sep">•</span>');
    }

    var parts = [];
    parts.push('<div class="history-timeline dp-dhs-timeline">');

    for (var i = 0; i < list.length; i++) {
      var e = list[i];

      var summaryHtml = e.summaryHtml
        ? e.summaryHtml
        : ('<span class="dp-dhs-tl-text">' + escapeHtml(e.summaryText || '-') + '</span>');

      var metaHtml = oneLineMeta(e);

      parts.push(
        '<div class="timeline-item" data-type="' + escapeHtml(e.group) + '">' +
          '<div class="timeline-icon"><i class="fas ' + escapeHtml(e.icon) + '"></i></div>' +
          '<div class="timeline-content">' +
            '<div class="timeline-header">' +
              '<span class="timeline-type">' + escapeHtml(e.title) + '</span>' +
              '<span class="timeline-date">' + escapeHtml(e.dateText) + '</span>' +
            '</div>' +
            '<div class="timeline-body">' +
              '<div class="dp-dhs-tl-inline">' +
                '<span class="dp-dhs-tl-summary">' + summaryHtml + '</span>' +
                (metaHtml ? ('<span class="dp-dhs-tl-sep">•</span><span class="dp-dhs-tl-meta-wrap">' + metaHtml + '</span>') : '') +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }

    parts.push('</div>');
    return parts.join('');
  }

  // ---------------- Overview: tổng hợp theo nhóm ----------------

  function getLatest(list, timeField) {
    var best = null;
    var bestMs = 0;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      var ms = r[timeField] || r.timeMs || 0;
      if (!best || ms > bestMs) {
        best = r;
        bestMs = ms;
      }
    }
    return { row: best, ms: bestMs };
  }

  function renderOverviewHtml(state) {
    var ds = state.datasets;

    var latestStatus = getLatest(ds.status, 'timeMs');
    var latestLoc = getLatest(ds.location, 'timeMs');
    var latestShip = getLatest(ds.ship, 'timeMs');
    var latestTef = getLatest(ds.teflon, 'timeMs');
    var latestCmt = getLatest(ds.comment, 'timeMs');

    function card(title, count, lastMs, icon) {
      var lastText = lastMs ? formatDate(new Date(lastMs).toISOString()) : '-';
      return (
        '<div class="dp-dhs-card">' +
          '<div class="dp-dhs-card-head">' +
            '<i class="fas ' + escapeHtml(icon) + '"></i>' +
            '<span class="dp-dhs-card-title">' + escapeHtml(title) + '</span>' +
          '</div>' +
          '<div class="dp-dhs-card-main">' +
            '<span class="dp-dhs-card-count">' + escapeHtml(String(count)) + '</span>' +
            '<span class="dp-dhs-card-last">' + escapeHtml(lastText) + '</span>' +
          '</div>' +
        '</div>'
      );
    }

    var html = '';
    html += '<div class="dp-dhs-overview">';

    html += '<div class="dp-dhs-cards">';
    html += card('Status', ds.status.length, latestStatus.ms, 'fa-clipboard-list');
    html += card('Location', ds.location.length, latestLoc.ms, 'fa-map-marker-alt');
    html += card('Transfer', ds.ship.length, latestShip.ms, 'fa-truck');
    html += card('Teflon', ds.teflon.length, latestTef.ms, 'fa-spray-can');
    html += card('Comments', ds.comment.length, latestCmt.ms, 'fa-comment-dots');
    html += '</div>';

    // Bảng tổng hợp theo nhóm (1 dòng/nhóm)
    html += '<div class="modal-section">';
    html += '<div class="section-header"><i class="fas fa-layer-group"></i><span>Tổng hợp theo nhóm</span></div>';

    html += '<table class="dp-dhs-table dp-dhs-table--overview">';
    html += '<thead><tr>';
    html += '<th>Group</th>';
    html += '<th>Count</th>';
    html += '<th>Last date</th>';
    html += '<th>Last detail</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    // Status row
    var stRow = latestStatus.row;
    var stDetail = stRow ? (statusBadge(stRow.subtype, stRow.StatusText || stRow.subtype) + (stRow.Employee ? (' <span class="dp-dhs-inline-muted">• ' + escapeHtml(stRow.Employee) + '</span>') : '') + (stRow.Note ? (' <span class="dp-dhs-inline-muted">• ' + escapeHtml(shortText(stRow.Note, 90)) + '</span>') : '')) : '-';
    html += '<tr>';
    html += '<td class="dp-dhs-td-group"><i class="fas fa-clipboard-list"></i> Status</td>';
    html += '<td class="dp-dhs-td-count">' + escapeHtml(String(ds.status.length)) + '</td>';
    html += '<td class="dp-dhs-td-date">' + escapeHtml(latestStatus.ms ? formatDate(new Date(latestStatus.ms).toISOString()) : '-') + '</td>';
    html += '<td class="dp-dhs-td-detail">' + stDetail + '</td>';
    html += '</tr>';

    // Location row
    var lRow = latestLoc.row;
    var lDetail = lRow ? (escapeHtml((lRow.OldRackLayer || '-') + ' → ' + (lRow.NewRackLayer || '-')) + (lRow.Employee ? (' <span class="dp-dhs-inline-muted">• ' + escapeHtml(lRow.Employee) + '</span>') : '') + (lRow.notes ? (' <span class="dp-dhs-inline-muted">• ' + escapeHtml(shortText(lRow.notes, 90)) + '</span>') : '')) : '-';
    html += '<tr>';
    html += '<td class="dp-dhs-td-group"><i class="fas fa-map-marker-alt"></i> Location</td>';
    html += '<td class="dp-dhs-td-count">' + escapeHtml(String(ds.location.length)) + '</td>';
    html += '<td class="dp-dhs-td-date">' + escapeHtml(latestLoc.ms ? formatDate(new Date(latestLoc.ms).toISOString()) : '-') + '</td>';
    html += '<td class="dp-dhs-td-detail">' + lDetail + '</td>';
    html += '</tr>';

    // Ship row
    var shRow = latestShip.row;
    var shDetail = shRow ? (escapeHtml((shRow.FromCompany || '-') + ' → ' + (shRow.ToCompany || '-')) + ' ' + badgeHtml(shRow.ShipStatusText || '-', shRow.ShipStatusKind, 'fa-truck') + (shRow.ShipNotes ? (' <span class="dp-dhs-inline-muted">• ' + escapeHtml(shortText(shRow.ShipNotes, 90)) + '</span>') : '')) : '-';
    html += '<tr>';
    html += '<td class="dp-dhs-td-group"><i class="fas fa-truck"></i> Transfer</td>';
    html += '<td class="dp-dhs-td-count">' + escapeHtml(String(ds.ship.length)) + '</td>';
    html += '<td class="dp-dhs-td-date">' + escapeHtml(latestShip.ms ? formatDate(new Date(latestShip.ms).toISOString()) : '-') + '</td>';
    html += '<td class="dp-dhs-td-detail">' + shDetail + '</td>';
    html += '</tr>';

    // Teflon row
    var tfRow = latestTef.row;
    var tfDetail = tfRow ? (badgeHtml(tfRow.TeflonStatusText || '-', tfRow.TeflonStatusKind, 'fa-spray-can') + (tfRow.Supplier ? (' <span class="dp-dhs-inline-muted">• ' + escapeHtml(tfRow.Supplier) + '</span>') : '') + (tfRow.Notes ? (' <span class="dp-dhs-inline-muted">• ' + escapeHtml(shortText(tfRow.Notes, 90)) + '</span>') : '')) : '-';
    html += '<tr>';
    html += '<td class="dp-dhs-td-group"><i class="fas fa-spray-can"></i> Teflon</td>';
    html += '<td class="dp-dhs-td-count">' + escapeHtml(String(ds.teflon.length)) + '</td>';
    html += '<td class="dp-dhs-td-date">' + escapeHtml(latestTef.ms ? formatDate(new Date(latestTef.ms).toISOString()) : '-') + '</td>';
    html += '<td class="dp-dhs-td-detail">' + tfDetail + '</td>';
    html += '</tr>';

    // Comment row
    var cRow = latestCmt.row;
    var cDetail = cRow ? (escapeHtml(shortText(cRow.Text || '-', 120)) + (cRow.Employee ? (' <span class="dp-dhs-inline-muted">• ' + escapeHtml(cRow.Employee) + '</span>') : '')) : '-';
    html += '<tr>';
    html += '<td class="dp-dhs-td-group"><i class="fas fa-comment-dots"></i> Comments</td>';
    html += '<td class="dp-dhs-td-count">' + escapeHtml(String(ds.comment.length)) + '</td>';
    html += '<td class="dp-dhs-td-date">' + escapeHtml(latestCmt.ms ? formatDate(new Date(latestCmt.ms).toISOString()) : '-') + '</td>';
    html += '<td class="dp-dhs-td-detail">' + cDetail + '</td>';
    html += '</tr>';

    html += '</tbody></table>';
    html += '</div>';

    html += '</div>';
    return html;
  }

  // ---------------- UI skeleton ----------------

  function buildToolbarHtml(state) {
    var g = state.group || 'OVERVIEW';

    function chip(label, key, icon) {
      var cls = 'dp-dhs-chip' + (g === key ? ' active' : '');
      return '<button type="button" class="' + cls + '" data-dhs-group="' + escapeHtml(key) + '">' +
        '<i class="fas ' + escapeHtml(icon) + '"></i>' +
        '<span>' + escapeHtml(label) + '</span>' +
      '</button>';
    }

    return (
      '<div class="dp-dhs-toolbar">' +
        chip('Overview', 'OVERVIEW', 'fa-layer-group') +
        chip('Timeline', 'TIMELINE', 'fa-stream') +
        chip('Status', 'STATUS', 'fa-clipboard-list') +
        chip('Location', 'LOCATION', 'fa-map-marker-alt') +
        chip('Transfer', 'SHIP', 'fa-truck') +
        chip('Teflon', 'TEFLON', 'fa-spray-can') +
        chip('Comments', 'COMMENT', 'fa-comment-dots') +
        '<span class="dp-dhs-sep" aria-hidden="true"></span>' +
        '<select class="dp-dhs-select" title="Sắp xếp">' +
          '<option value="DESC"' + (state.sortDir === 'DESC' ? ' selected' : '') + '>Mới nhất</option>' +
          '<option value="ASC"' + (state.sortDir === 'ASC' ? ' selected' : '') + '>Cũ nhất</option>' +
        '</select>' +
        '<input class="dp-dhs-search" type="text" value="' + escapeHtml(state.query || '') + '" placeholder="Tìm: racklayer, company, status, note..." />' +
      '</div>'
    );
  }

  function renderGroupBody(state) {
    var q = state.query || '';
    var dir = state.sortDir || 'DESC';

    if (state.group === 'OVERVIEW') {
      return renderOverviewHtml(state);
    }

    if (state.group === 'TIMELINE') {
      return '<div class="modal-section">' +
        '<div class="section-header"><i class="fas fa-stream"></i><span>Timeline</span></div>' +
        renderTimelineHtml(state.timeline, q, dir) +
      '</div>';
    }

    if (state.group === 'STATUS') {
      return '<div class="modal-section">' +
        '<div class="section-header"><i class="fas fa-clipboard-list"></i><span>Status</span></div>' +
        renderStatusTableHtml(state.datasets.status, q, dir) +
      '</div>';
    }

    if (state.group === 'LOCATION') {
      return '<div class="modal-section">' +
        '<div class="section-header"><i class="fas fa-map-marker-alt"></i><span>Location (Old → New)</span></div>' +
        renderLocationTableHtml(state.datasets.location, q, dir) +
      '</div>';
    }

    if (state.group === 'SHIP') {
      return '<div class="modal-section">' +
        '<div class="section-header"><i class="fas fa-truck"></i><span>Transfer</span></div>' +
        renderShipTableHtml(state.datasets.ship, q, dir) +
      '</div>';
    }

    if (state.group === 'TEFLON') {
      return '<div class="modal-section">' +
        '<div class="section-header"><i class="fas fa-spray-can"></i><span>Teflon</span></div>' +
        renderTeflonTableHtml(state.datasets.teflon, q, dir) +
      '</div>';
    }

    if (state.group === 'COMMENT') {
      return '<div class="modal-section">' +
        '<div class="section-header"><i class="fas fa-comment-dots"></i><span>Comments</span></div>' +
        renderCommentListHtml(state.datasets.comment, q, dir) +
      '</div>';
    }

    return '<p class="no-data">Tab không hỗ trợ.</p>';
  }

  function applyStateRender(state) {
    if (!state || !state.host) return;

    var body = state.host.querySelector('.dp-dhs-body');
    if (!body) return;

    body.innerHTML = renderGroupBody(state);

    var chips = state.host.querySelectorAll('[data-dhs-group]');
    chips.forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-dhs-group') === state.group);
    });

    var countEl = state.host.querySelector('.dp-dhs-count');
    if (countEl) {
      var total = 0;
      if (state.group === 'OVERVIEW') total = state.timeline.length;
      else if (state.group === 'TIMELINE') total = state.timeline.length;
      else if (state.group === 'STATUS') total = state.datasets.status.length;
      else if (state.group === 'LOCATION') total = state.datasets.location.length;
      else if (state.group === 'SHIP') total = state.datasets.ship.length;
      else if (state.group === 'TEFLON') total = state.datasets.teflon.length;
      else if (state.group === 'COMMENT') total = state.datasets.comment.length;
      countEl.textContent = String(total);
    }
  }

  function bindUI(state) {
    var host = state.host;
    if (!host) return;

    var chips = host.querySelectorAll('[data-dhs-group]');
    chips.forEach(function (btn) {
      if (btn.dataset.dpDhsBound) return;
      btn.dataset.dpDhsBound = '1';
      btn.addEventListener('click', function () {
        state.group = btn.getAttribute('data-dhs-group') || 'OVERVIEW';
        applyStateRender(state);
      });
    });

    var search = host.querySelector('.dp-dhs-search');
    if (search && !search.dataset.dpDhsBound) {
      search.dataset.dpDhsBound = '1';
      search.addEventListener('input', function () {
        state.query = search.value || '';
        applyStateRender(state);
      });
    }

    var sel = host.querySelector('.dp-dhs-select');
    if (sel && !sel.dataset.dpDhsBound) {
      sel.dataset.dpDhsBound = '1';
      sel.addEventListener('change', function () {
        state.sortDir = sel.value === 'ASC' ? 'ASC' : 'DESC';
        applyStateRender(state);
      });
    }
  }

  function render(hostEl, opts) {
    var host = hostEl;
    if (!host) return;

    var o = isObj(opts) ? opts : {};
    var item = o.item || null;
    var itemType = getItemType(o.itemType || (item && item.type) || 'mold');
    var data = o.data || getDataFromGlobal();

    if (!item) {
      host.innerHTML = '<div class="modal-section"><div class="section-header"><i class="fas fa-history"></i><span>Lịch sử trạng thái thiết bị</span></div><p class="no-data">Không có thiết bị để hiển thị lịch sử.</p></div>';
      return;
    }

    var datasets = {
      status: buildStatusRows(item, itemType, data),
      location: buildLocationRows(item, itemType, data),
      ship: buildShipRows(item, itemType, data),
      teflon: buildTeflonRows(item, itemType, data),
      comment: buildCommentRows(item, itemType, data)
    };

    var state = {
      host: host,
      group: 'OVERVIEW',
      query: '',
      sortDir: 'DESC',
      datasets: datasets,
      timeline: []
    };

    state.timeline = makeTimelineEvents(datasets);

    var code = getItemCode(item, itemType);

    host.innerHTML = (
      '<div class="modal-section dp-dhs">' +
        '<div class="section-header">' +
          '<i class="fas fa-history"></i>' +
          '<span>Lịch sử trạng thái thiết bị</span>' +
          '<span class="dp-dhs-count">0</span>' +
        '</div>' +
        '<div class="info-message">Thiết bị: <b>' + escapeHtml(code || '-') + '</b>. Overview tổng hợp theo nhóm, Timeline theo thời gian.</div>' +
        buildToolbarHtml(state) +
        '<div class="dp-dhs-body"></div>' +
      '</div>'
    );

    bindUI(state);
    applyStateRender(state);
  }

  window.DeviceHistoryStatus = {
    VERSION: VERSION,
    render: render
  };

})();

/*!
 * inventory-audit-center-r1.0.0.js
 * 棚卸センター | Trung tâm kiểm kê
 *
 * CSS extracted:
 * - This JS auto-loads inventory-audit-center-r1.0.0.css via <link rel="stylesheet">
 *
 * Backward compatible:
 * - Intercepts #inv-history-btn click (capture-phase) to open this center without changing InventoryManager.
 *
 * Requires (optional but supported):
 * - window.DataManager.loadAllData(), window.DataManager.getAllItems()
 * - window.SelectionManager (SelectionState)
 * - window.UIRenderer (for refreshing cards)
 * - window.HistoryView (optional: open unified history)
 */

(function () {
  "use strict";

  const InventoryAuditCenter = {
    version: "r1.0.0",
    state: {
      initialized: false,
      open: false,

      // Polling (soft realtime)
      pollingTimer: null,
      pollingIntervalMs: 30 * 1000,

      // Storage keys
      storageSessionsKey: "iac.sessions.v1",
      storageActiveSessionKey: "iac.activeSession.v1",
      storageDeviceKey: "iac.deviceId.v1",

      // Current UI state
      dateKey: null, // YYYY-MM-DD
      filter: {
        rackLayerId: "",
        status: "all", // all | audited | unaudited
        keyword: "",
        employeeId: "",
        sessionId: "",
      },

      // Cached computed
      computed: {
        allItems: [],
        auditSet: new Set(), // `${type}:${id}`
        auditLogsByItem: new Map(), // key -> latest audit log
        employees: [],
        racklayers: [],
        sessions: [],
        activeSession: null,
      },

      els: {},

      // CSS
      cssFileName: "inventory-audit-center-r1.0.0.css",
      cssLinkId: "iac-css-link",
    },

    // ---------------------------
    // Init / Boot
    // ---------------------------
    init() {
      if (this.state.initialized) return;

      this._ensureDeviceId();
      this._ensureCssLoaded();
      this._createModalOnce();
      this._cacheEls();
      this._bindGlobalTriggers();
      this._bindInsideEvents();

      // Restore active session (if exists)
      this.state.computed.activeSession = this._loadActiveSession();
      this._syncBannerFromActiveSession();

      // Default dateKey = today (local)
      this.state.dateKey = this._todayKey();
      this.state.filter.sessionId = this.state.computed.activeSession?.sessionId || "";
      this.state.filter.employeeId = this.state.computed.activeSession?.employeeId || "";

      this.state.initialized = true;

      // Auto refresh on startup (silent)
      setTimeout(() => {
        this._safeRefreshData(false).catch(() => {});
      }, 300);
    },

    open(options = {}) {
      this.init();

      // Apply optional filters
      if (options.dateKey) this.state.dateKey = options.dateKey;
      if (options.sessionId !== undefined) this.state.filter.sessionId = options.sessionId;
      if (options.employeeId !== undefined) this.state.filter.employeeId = options.employeeId;

      // Show
      const root = this.state.els.root;
      if (root) root.classList.add("iac-open");
      this.state.open = true;

      // Ensure date input reflects state
      if (this.state.els.setupDate) this.state.els.setupDate.value = this.state.dateKey;

      // Load + render
      this._safeRefreshData(true).catch((err) => {
        console.warn("[IAC] open refresh failed:", err);
      });

      // Start polling
      this._startPolling();
    },

    close() {
      const root = this.state.els.root;
      if (root) root.classList.remove("iac-open");
      this.state.open = false;
      this._stopPolling();
    },

    cleanup() {
      this._stopPolling();
      // Keep DOM to preserve backward compatibility; no hard remove.
    },

    // ---------------------------
    // Session
    // ---------------------------
    startSession() {
      const dateKey = this.state.els.setupDate?.value || this.state.dateKey || this._todayKey();
      const employeeId = (this.state.els.setupEmployee?.value || "").trim();
      if (!employeeId) {
        this._toast("担当者を選択してください | Vui lòng chọn nhân viên", "warning");
        return;
      }

      const emp = this._getEmployees().find((e) => String(e.EmployeeID).trim() === String(employeeId).trim());
      const employeeName = emp?.EmployeeName || emp?.Name || String(employeeId);

      const sessions = this._loadSessions();
      const seq = this._nextSessionSeqForDate(sessions, dateKey);
      const suggestedName = this._suggestSessionName(dateKey, seq, employeeName);

      const nameRaw = (this.state.els.setupSessionName?.value || "").trim();
      const sessionName = nameRaw || suggestedName;

      const note = (this.state.els.setupNote?.value || "").trim();

      const sessionId = this._buildSessionId(dateKey, seq);
      const nowIso = new Date().toISOString();

      const newSession = {
        sessionId,
        dateKey,
        seq,
        name: sessionName,
        employeeId: String(employeeId),
        employeeName: String(employeeName),
        note,
        createdAt: nowIso,
        closedAt: "",
        locked: false,
        deviceId: this._getDeviceId(),
      };

      // Persist
      sessions.push(newSession);
      this._saveSessions(sessions);
      this._saveActiveSession(newSession);

      this.state.computed.activeSession = newSession;
      this.state.filter.sessionId = sessionId;
      this.state.filter.employeeId = String(employeeId);
      this.state.dateKey = dateKey;

      // Sync UI
      this._syncBannerFromActiveSession();
      this._toast("セッション開始 | Bắt đầu phiên kiểm kê", "success");

      // Refresh view
      this._safeRefreshData(true).catch(() => {});
    },

    endSession() {
      const active = this.state.computed.activeSession;
      if (!active) {
        this._toast("アクティブなセッションなし | Chưa có phiên đang hoạt động", "info");
        return;
      }
      if (!confirm("セッションを終了しますか？\nBạn muốn kết thúc phiên kiểm kê?")) return;

      const sessions = this._loadSessions();
      const idx = sessions.findIndex((s) => s.sessionId === active.sessionId);
      if (idx >= 0) {
        sessions[idx] = {
          ...sessions[idx],
          closedAt: new Date().toISOString(),
        };
        this._saveSessions(sessions);
      }
      this._clearActiveSession();
      this.state.computed.activeSession = null;
      this.state.filter.sessionId = "";
      this._syncBannerFromActiveSession();
      this._toast("セッション終了 | Đã kết thúc phiên", "success");
      this._safeRefreshData(true).catch(() => {});
    },

    toggleSessionLock() {
      const active = this.state.computed.activeSession;
      if (!active) {
        this._toast("アクティブなセッションなし | Chưa có phiên đang hoạt động", "info");
        return;
      }
      const sessions = this._loadSessions();
      const idx = sessions.findIndex((s) => s.sessionId === active.sessionId);
      if (idx < 0) return;

      const nextLocked = !sessions[idx].locked;
      sessions[idx] = { ...sessions[idx], locked: nextLocked };
      this._saveSessions(sessions);

      const updated = sessions[idx];
      this._saveActiveSession(updated);
      this.state.computed.activeSession = updated;

      this._syncBannerFromActiveSession();
      this._toast(nextLocked ? "ロックON | Khoá" : "ロックOFF | Mở khoá", "success");
    },

    // ---------------------------
    // Audit action (batch)
    // ---------------------------
    async auditSelectedNow() {
      const active = this.state.computed.activeSession;
      if (!active) {
        this._toast("先にセッション開始 | Hãy bắt đầu phiên trước", "warning");
        return;
      }
      if (active.locked) {
        this._toast("セッションがロック中 | Phiên đang bị khoá", "warning");
        return;
      }

      const selected = this._getSelectedItems();
      if (!selected.length) {
        this._toast("未選択 | Chưa chọn mục nào", "warning");
        return;
      }

      if (!confirm(`選択 ${selected.length} 件を棚卸しますか？\nKiểm kê ${selected.length} mục đã chọn?`)) return;

      // Build logs using existing field names used by system (statuslogs.csv)
      const nowIso = new Date().toISOString();
      const auditDate = nowIso.split("T")[0] || this._todayKey();
      const employeeId = String(active.employeeId || "");

      const notes = this._buildAuditNotes(active);

      const statusLogs = selected.map((it) => {
        const type = (it.type || it.itemType || "").toLowerCase() === "cutter" ? "cutter" : "mold";
        const id = String(it.id ?? it.itemId ?? it.MoldID ?? it.CutterID ?? "").trim();

        return {
          Status: "AUDIT",
          Timestamp: nowIso,
          EmployeeID: employeeId,
          Notes: notes,
          AuditDate: auditDate,
          AuditType: "AUDIT",
          ItemType: type.toUpperCase(), // "MOLD"/"CUTTER"
          MoldID: type === "mold" ? id : "",
          CutterID: type === "cutter" ? id : "",
          DestinationID: "",
        };
      });

      this._setBusy(true, `送信中... | Đang gửi... (${selected.length})`);

      try {
        await this._sendAuditBatch(statusLogs);

        if (window.SelectionManager && typeof window.SelectionManager.clear === "function") {
          window.SelectionManager.clear();
        }

        await this._safeRefreshData(true);

        // notify UIRenderer badges
        const itemsForEvent = statusLogs
          .map((r) => {
            const itemType = (r.ItemType || "").toLowerCase() === "cutter" ? "cutter" : "mold";
            const itemId = itemType === "mold" ? String(r.MoldID || "").trim() : String(r.CutterID || "").trim();
            return { itemId, itemType };
          })
          .filter((x) => x.itemId);

        document.dispatchEvent(
          new CustomEvent("inventorybulkAuditCompleted", {
            detail: {
              items: itemsForEvent,
              date: nowIso,
              count: itemsForEvent.length,
              failedCount: 0,
              source: "inventory-audit-center",
            },
          })
        );

        document.dispatchEvent(
          new CustomEvent("inventoryrefreshBadges", { detail: { source: "inventory-audit-center" } })
        );

        this._toast(`完了 | Hoàn tất: ${itemsForEvent.length}`, "success");
      } catch (err) {
        console.error("[IAC] auditSelectedNow failed:", err);
        this._toast(`失敗 | Thất bại: ${err?.message || err}`, "error");
      } finally {
        this._setBusy(false);
      }
    },

    // ---------------------------
    // Export / Mail
    // ---------------------------
    exportCsv() {
      const rows = this._buildTableRows();
      if (!rows.length) {
        this._toast("データなし | Không có dữ liệu", "info");
        return;
      }

      const BOM = "\uFEFF";
      const header = [
        "Date",
        "SessionID",
        "SessionName",
        "EmployeeID",
        "EmployeeName",
        "ItemType",
        "ItemID",
        "ItemCode",
        "ItemName",
        "RackLayerID",
        "Status",
        "LastAuditTimestamp",
        "Notes",
      ];

      const lines = [header.join(",")];

      rows.forEach((r) => {
        const safe = (v) => {
          const s = v == null ? "" : String(v);
          const escaped = s.replace(/"/g, '""');
          return `"${escaped}"`;
        };
        lines.push(
          [
            r.dateKey,
            r.sessionId,
            r.sessionName,
            r.employeeId,
            r.employeeName,
            r.itemType,
            r.itemId,
            r.itemCode,
            r.itemName,
            r.rackLayerId,
            r.status,
            r.lastAuditTimestamp,
            r.notes,
          ]
            .map(safe)
            .join(",")
        );
      });

      const csv = BOM + lines.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      a.href = url;
      a.download = `inventory-audit-center_${this.state.dateKey || stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this._toast("CSV出力 | Xuất CSV", "success");
    },

    sendMail() {
      const summary = this._buildSummary();
      const subject = encodeURIComponent(`棚卸報告 | Báo cáo kiểm kê (${this.state.dateKey || this._todayKey()})`);
      const body = encodeURIComponent(summary);
      window.location.href = `mailto:?subject=${subject}&body=${body}`;
    },

    // ---------------------------
    // UI Render
    // ---------------------------
    async refresh() {
      await this._safeRefreshData(true);
      this._toast("更新完了 | Đã cập nhật", "success");
    },

    // ---------------------------
    // Internals: Data refresh & compute
    // ---------------------------
    async _safeRefreshData(render = true) {
      if (window.DataManager && typeof window.DataManager.loadAllData === "function") {
        try {
          await window.DataManager.loadAllData();
        } catch (e) {
          console.warn("[IAC] DataManager.loadAllData failed:", e);
        }
      }

      // Cache masters
      this.state.computed.employees = this._getEmployees();
      this.state.computed.racklayers = this._getRackLayers();
      this.state.computed.sessions = this._loadSessions();
      this.state.computed.activeSession = this._loadActiveSession();

      // Sync dateKey from UI
      if (this.state.els.setupDate) {
        const inputDate = (this.state.els.setupDate.value || "").trim();
        if (inputDate) this.state.dateKey = inputDate;
      } else {
        this.state.dateKey = this.state.dateKey || this._todayKey();
      }

      // Rebuild items list
      this.state.computed.allItems = this._getAllItems();

      // Compute audits
      this._rebuildAuditCaches();

      if (render) {
        this._renderSetupArea();
        this._renderStats();
        this._renderTable();
      }
    },

    _rebuildAuditCaches() {
      const dateKey = this.state.dateKey || this._todayKey();
      const logs = this._getStatusLogs();

      const auditSet = new Set();
      const auditLogsByItem = new Map();

      for (const row of logs) {
        const status = String(row?.Status || "").toLowerCase();
        const auditType = String(row?.AuditType || "").toLowerCase();
        const isAudit = status.includes("audit") || auditType.includes("audit");
        if (!isAudit) continue;

        const ts = String(row?.Timestamp || "").trim();
        const ad = String(row?.AuditDate || "").trim();
        const key = (ad || (ts.includes("T") ? ts.split("T")[0] : ts.split(" ")[0] || "") || "").trim();
        if (!key || key !== dateKey) continue;

        const moldId = String(row?.MoldID || "").trim();
        const cutterId = String(row?.CutterID || "").trim();

        let itemType = "mold";
        let itemId = moldId;
        if (!itemId && cutterId) {
          itemType = "cutter";
          itemId = cutterId;
        }
        if (!itemId) continue;

        const k = `${itemType}:${itemId}`;
        auditSet.add(k);

        const prev = auditLogsByItem.get(k);
        if (!prev) {
          auditLogsByItem.set(k, row);
        } else {
          const prevTs = new Date(prev?.Timestamp || 0).getTime();
          const curTs = new Date(ts || 0).getTime();
          if (curTs >= prevTs) auditLogsByItem.set(k, row);
        }
      }

      this.state.computed.auditSet = auditSet;
      this.state.computed.auditLogsByItem = auditLogsByItem;
    },

    _buildTableRows() {
      const dateKey = this.state.dateKey || this._todayKey();

      const kw = (this.state.filter.keyword || "").trim().toLowerCase();
      const rackLayerId = (this.state.filter.rackLayerId || "").trim();
      const statusFilter = (this.state.filter.status || "all").trim();
      const employeeIdFilter = (this.state.filter.employeeId || "").trim();
      const sessionIdFilter = (this.state.filter.sessionId || "").trim();

      const sessions = this.state.computed.sessions || [];
      const sessionMap = new Map(sessions.map((s) => [s.sessionId, s]));

      const active = this.state.computed.activeSession;

      const allItems = Array.isArray(this.state.computed.allItems) ? this.state.computed.allItems : [];
      const rows = [];

      for (const item of allItems) {
        const itemType = (item?.itemType || item?.type || "mold").toLowerCase() === "cutter" ? "cutter" : "mold";

        const itemId = String(
          itemType === "mold"
            ? (item?.MoldID ?? item?.MoldCode ?? "")
            : (item?.CutterID ?? item?.CutterNo ?? "")
        ).trim();
        if (!itemId) continue;

        const key = `${itemType}:${itemId}`;
        const audited = this.state.computed.auditSet?.has(key);

        const itemRackLayerId = String(
          item?.rackLayerInfo?.RackLayerID ?? item?.currentRackLayer ?? item?.RackLayerID ?? ""
        ).trim();
        if (rackLayerId && itemRackLayerId !== String(rackLayerId)) continue;

        if (statusFilter === "audited" && !audited) continue;
        if (statusFilter === "unaudited" && audited) continue;

        const latestAuditLog = this.state.computed.auditLogsByItem?.get(key) || null;
        const lastAuditTimestamp = latestAuditLog?.Timestamp ? String(latestAuditLog.Timestamp) : "";
        const notes = latestAuditLog?.Notes ? String(latestAuditLog.Notes) : "";
        const logEmployeeId = latestAuditLog?.EmployeeID ? String(latestAuditLog.EmployeeID).trim() : "";

        if (employeeIdFilter) {
          if (!audited) continue;
          if (logEmployeeId !== String(employeeIdFilter)) continue;
        }

        const logSessionId = this._extractSessionIdFromNotes(notes);
        if (sessionIdFilter) {
          if (!audited) continue;
          if (logSessionId !== String(sessionIdFilter)) continue;
        }

        const itemCode = String(item?.displayCode ?? item?.MoldCode ?? item?.CutterNo ?? itemId).trim();
        const itemName = String(item?.displayName ?? item?.MoldName ?? item?.CutterName ?? "").trim();
        const rackLabel = String(item?.displayLocation ?? itemRackLayerId ?? "").trim();

        if (kw) {
          const hay = `${itemId} ${itemCode} ${itemName} ${rackLabel}`.toLowerCase();
          if (!hay.includes(kw)) continue;
        }

        const sessionId = logSessionId || (active?.sessionId || "");
        const sessionObj = sessionMap.get(sessionId);
        const sessionName = sessionObj?.name || "";
        const employeeId = logEmployeeId || (active?.employeeId || "");
        const employeeName = this._employeeNameById(employeeId) || sessionObj?.employeeName || "";

        rows.push({
          dateKey,
          audited,
          status: audited ? "AUDITED" : "UNAUDITED",
          itemType,
          itemId,
          itemCode,
          itemName,
          rackLayerId: itemRackLayerId,
          lastAuditTimestamp,
          notes,
          sessionId,
          sessionName,
          employeeId,
          employeeName,
        });
      }

      rows.sort((a, b) => {
        if (a.audited !== b.audited) return a.audited ? 1 : -1;
        const ra = String(a.rackLayerId || "");
        const rb = String(b.rackLayerId || "");
        const rc = ra.localeCompare(rb, undefined, { numeric: true });
        if (rc !== 0) return rc;
        return String(a.itemCode || "").localeCompare(String(b.itemCode || ""), undefined, { numeric: true });
      });

      return rows;
    },

    _renderSetupArea() {
      // Populate employees
      const empSel = this.state.els.setupEmployee;
      if (empSel) {
        const employees = this._getEmployees();
        const current = String(this.state.filter.employeeId || this.state.computed.activeSession?.employeeId || "");
        let html = `<option value="">-- 担当者 / Nhân viên --</option>`;
        for (const e of employees) {
          const id = String(e.EmployeeID ?? "").trim();
          const name = String(e.EmployeeName ?? e.Name ?? id).trim();
          const selected = id && id === current ? "selected" : "";
          html += `<option value="${this._esc(id)}" ${selected}>${this._esc(name)} (${this._esc(id)})</option>`;
        }
        empSel.innerHTML = html;
      }

      // Populate sessions dropdown (date-scoped)
      const sesSel = this.state.els.filterSession;
      if (sesSel) {
        const dateKey = this.state.dateKey || this._todayKey();
        const sessions = (this._loadSessions() || []).filter((s) => String(s.dateKey) === String(dateKey));
        const current = String(this.state.filter.sessionId || this.state.computed.activeSession?.sessionId || "");
        let html = `<option value="">-- 全セッション / Tất cả phiên --</option>`;
        for (const s of sessions) {
          const sid = String(s.sessionId);
          const label = `${s.seq}. ${s.name || sid} (${s.employeeName || s.employeeId || "-"})`;
          const selected = sid === current ? "selected" : "";
          html += `<option value="${this._esc(sid)}" ${selected}>${this._esc(label)}</option>`;
        }
        sesSel.innerHTML = html;
      }

      // Populate RackLayer dropdown
      const rlSel = this.state.els.filterRackLayer;
      if (rlSel) {
        const racklayers = this._getRackLayers();
        const current = String(this.state.filter.rackLayerId || "");
        let html = `<option value="">-- 全部 / Tất cả --</option>`;
        const list = racklayers
          .map((r) => ({
            RackLayerID: String(r.RackLayerID ?? "").trim(),
            RackID: String(r.RackID ?? "").trim(),
            RackLayerNumber: String(r.RackLayerNumber ?? "").trim(),
          }))
          .filter((x) => x.RackLayerID)
          .sort((a, b) => {
            const ra = parseInt(a.RackID || "9999", 10);
            const rb = parseInt(b.RackID || "9999", 10);
            if (ra !== rb) return ra - rb;
            const la = parseInt(a.RackLayerNumber || "9999", 10);
            const lb = parseInt(b.RackLayerNumber || "9999", 10);
            return la - lb;
          });

        for (const x of list) {
          const label = `G${x.RackID}-T${x.RackLayerNumber} (${x.RackLayerID})`;
          const selected = x.RackLayerID === current ? "selected" : "";
          html += `<option value="${this._esc(x.RackLayerID)}" ${selected}>${this._esc(label)}</option>`;
        }
        rlSel.innerHTML = html;
      }

      // Suggest session name
      const sesName = this.state.els.setupSessionName;
      if (sesName) {
        const sessions = this._loadSessions();
        const seq = this._nextSessionSeqForDate(sessions, this.state.dateKey || this._todayKey());
        const empName = this._employeeNameById(this.state.els.setupEmployee?.value || "") || "";
        const suggested = this._suggestSessionName(this.state.dateKey || this._todayKey(), seq, empName);
        if (!sesName.value.trim()) sesName.value = suggested;
      }

      // Active session controls
      this._syncBannerFromActiveSession();
    },

    _renderStats() {
      const rows = this._buildTableRows();
      const total = rows.length;
      const audited = rows.filter((r) => r.audited).length;
      const unaudited = total - audited;

      if (this.state.els.statTotal) this.state.els.statTotal.textContent = String(total);
      if (this.state.els.statAudited) this.state.els.statAudited.textContent = String(audited);
      if (this.state.els.statUnaudited) this.state.els.statUnaudited.textContent = String(unaudited);

      const dateKey = this.state.dateKey || this._todayKey();
      const session = this.state.computed.activeSession;
      const sessionText = session ? `${session.name || session.sessionId}` : "-";
      if (this.state.els.summary) {
        this.state.els.summary.innerHTML =
          `<div><span class="iac-label-ja">日付</span><span class="iac-label-vi">Ngày</span>: <b>${this._esc(dateKey)}</b></div>` +
          `<div><span class="iac-label-ja">セッション</span><span class="iac-label-vi">Phiên</span>: ${this._esc(sessionText)}</div>`;
      }
    },

    _renderTable() {
      const tbody = this.state.els.tableBody;
      if (!tbody) return;

      const rows = this._buildTableRows();
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="iac-empty">データなし | Không có dữ liệu</td></tr>`;
        return;
      }

      let html = "";
      rows.slice(0, 500).forEach((r, idx) => {
        const statusClass = r.audited ? "iac-status-audited" : "iac-status-unaudited";
        const statusText = r.audited ? "棚卸済 | Đã KK" : "未棚卸 | Chưa KK";
        const itemTypeLabel = r.itemType === "cutter" ? "Cutter" : "Mold";
        const ts = r.lastAuditTimestamp ? this._formatDateTime(r.lastAuditTimestamp) : "-";
        html += `
          <tr class="iac-row ${r.audited ? "is-audited" : "is-unaudited"}"
              data-itemtype="${this._esc(r.itemType)}"
              data-itemid="${this._esc(r.itemId)}">
            <td class="iac-col-no">${idx + 1}</td>
            <td class="iac-col-status"><span class="iac-pill ${statusClass}">${this._esc(statusText)}</span></td>
            <td class="iac-col-item">
              <div class="iac-item-main">
                <button class="iac-linkbtn" type="button" data-open-detail="1">
                  ${this._esc(itemTypeLabel)}: ${this._esc(r.itemCode || r.itemId)}
                </button>
              </div>
              <div class="iac-item-sub">${this._esc(r.itemName || "-")}</div>
            </td>
            <td class="iac-col-loc">${this._esc(r.rackLayerId || "-")}</td>
            <td class="iac-col-emp">${this._esc(r.employeeName || "-")}</td>
            <td class="iac-col-time">${this._esc(ts)}</td>
            <td class="iac-col-session">${this._esc(r.sessionName || "-")}</td>
          </tr>
        `;
      });

      if (rows.length > 500) {
        html += `<tr><td colspan="7" class="iac-note">表示制限: 500件まで | Giới hạn hiển thị: 500</td></tr>`;
      }
      tbody.innerHTML = html;
    },

    _syncBannerFromActiveSession() {
      const banner = this.state.els.sessionBanner;
      const mini = this.state.els.miniPanel;

      const active = this.state.computed.activeSession;

      if (banner) {
        if (!active) {
          banner.classList.add("hidden");
        } else {
          banner.classList.remove("hidden");
          const lock = active.locked ? "🔒" : "🔓";
          banner.innerHTML = `
            <div class="iac-session-line">
              <span class="iac-badge">${lock}</span>
              <span class="iac-session-title">
                <span class="ja">稼働中</span><span class="vi">Đang chạy</span>:
                <b>${this._esc(active.name || active.sessionId)}</b>
              </span>
              <span class="iac-session-meta">${this._esc(active.employeeName || active.employeeId || "")}</span>
            </div>
          `;
        }
      }

      if (mini) {
        if (!active) {
          mini.classList.add("hidden");
        } else {
          mini.classList.remove("hidden");
          const lock = active.locked ? "ロック中 | Khoá" : "入力可 | Cho phép";
          mini.querySelector("#iac-mini-session") &&
            (mini.querySelector("#iac-mini-session").textContent = active.name || active.sessionId);
          mini.querySelector("#iac-mini-emp") &&
            (mini.querySelector("#iac-mini-emp").textContent = active.employeeName || active.employeeId || "-");
          mini.querySelector("#iac-mini-lock") && (mini.querySelector("#iac-mini-lock").textContent = lock);
        }
      }
    },

    // ---------------------------
    // Triggers / Events
    // ---------------------------
    _bindGlobalTriggers() {
      // Backward compatibility: intercept Inventory Settings History button
      document.addEventListener(
        "click",
        (e) => {
          const btn = e.target && e.target.closest ? e.target.closest("#inv-history-btn") : null;
          if (btn) {
            e.preventDefault();
            e.stopPropagation();
            this.open({ preset: "audit" });
            return;
          }

          const generic = e.target && e.target.closest ? e.target.closest("[data-inventory-audit-center-trigger]") : null;
          if (generic) {
            e.preventDefault();
            this.open({});
          }
        },
        true
      );
    },

    _bindInsideEvents() {
      this.state.els.closeBtn?.addEventListener("click", () => this.close());
      this.state.els.backdrop?.addEventListener("click", () => this.close());

      this._attachSwipeToClose(this.state.els.header, this.state.els.dialog, () => this.close());

      this.state.els.setupDate?.addEventListener("change", () => {
        this.state.dateKey = this.state.els.setupDate.value || this._todayKey();
        this.state.filter.sessionId = "";
        this._safeRefreshData(true).catch(() => {});
      });

      this.state.els.setupEmployee?.addEventListener("change", () => {
        this.state.filter.employeeId = this.state.els.setupEmployee.value || "";
        const sessions = this._loadSessions();
        const seq = this._nextSessionSeqForDate(sessions, this.state.dateKey || this._todayKey());
        const empName = this._employeeNameById(this.state.filter.employeeId) || "";
        const suggested = this._suggestSessionName(this.state.dateKey || this._todayKey(), seq, empName);
        if (this.state.els.setupSessionName) this.state.els.setupSessionName.value = suggested;
        this._safeRefreshData(true).catch(() => {});
      });

      this.state.els.filterRackLayer?.addEventListener("change", () => {
        this.state.filter.rackLayerId = this.state.els.filterRackLayer.value || "";
        this._renderStats();
        this._renderTable();
      });

      this.state.els.filterStatus?.addEventListener("change", () => {
        this.state.filter.status = this.state.els.filterStatus.value || "all";
        this._renderStats();
        this._renderTable();
      });

      this.state.els.filterKeyword?.addEventListener(
        "input",
        this._debounce(() => {
          this.state.filter.keyword = this.state.els.filterKeyword.value || "";
          this._renderStats();
          this._renderTable();
        }, 250)
      );

      this.state.els.filterSession?.addEventListener("change", () => {
        this.state.filter.sessionId = this.state.els.filterSession.value || "";
        this._renderStats();
        this._renderTable();
      });

      this.state.els.btnRefresh?.addEventListener("click", () => this.refresh());
      this.state.els.btnStartSession?.addEventListener("click", () => this.startSession());
      this.state.els.btnEndSession?.addEventListener("click", () => this.endSession());
      this.state.els.btnLock?.addEventListener("click", () => this.toggleSessionLock());
      this.state.els.btnCsv?.addEventListener("click", () => this.exportCsv());
      this.state.els.btnMail?.addEventListener("click", () => this.sendMail());
      this.state.els.btnOpenHistoryView?.addEventListener("click", () => {
        if (window.HistoryView && typeof window.HistoryView.open === "function") {
          this.close();
          window.HistoryView.open("audit");
        } else {
          this._toast("HistoryView未ロード | HistoryView chưa sẵn sàng", "warning");
        }
      });

      this.state.els.tableBody?.addEventListener("click", (e) => {
        const openBtn = e.target && e.target.closest ? e.target.closest("[data-open-detail='1']") : null;
        if (!openBtn) return;

        const tr = e.target.closest("tr[data-itemtype][data-itemid]");
        if (!tr) return;

        const itemType =
          String(tr.getAttribute("data-itemtype") || "mold").toLowerCase() === "cutter" ? "cutter" : "mold";
        const itemId = String(tr.getAttribute("data-itemid") || "").trim();
        if (!itemId) return;

        this._openItemDetail(itemType, itemId);
      });

      const mini = this.state.els.miniPanel;
      if (mini) {
        mini.querySelector("#iac-mini-open")?.addEventListener("click", () => this.open({}));
        mini.querySelector("#iac-mini-audit")?.addEventListener("click", () => this.auditSelectedNow());
        mini.querySelector("#iac-mini-toggle-select")?.addEventListener("click", () => this._toggleSelectionMode());
        mini.querySelector("#iac-mini-end")?.addEventListener("click", () => this.endSession());
      }
    },

    _toggleSelectionMode() {
      if (!window.SelectionManager || typeof window.SelectionManager.setMode !== "function") {
        this._toast("SelectionManager未対応 | Không hỗ trợ Selection", "warning");
        return;
      }
      const enabled = !!window.SelectionState?.active;
      window.SelectionManager.setMode(!enabled);
      this._toast(!enabled ? "選択ON | Bật chọn" : "選択OFF | Tắt chọn", "success");
    },

    _openItemDetail(itemType, itemId) {
      const dm = window.DataManager?.data;
      if (!dm) {
        this._toast("Data未ロード | Dữ liệu chưa sẵn sàng", "warning");
        return;
      }

      let item = null;
      if (itemType === "mold") {
        item = (dm.molds || []).find((m) => String(m.MoldID).trim() === String(itemId).trim()) || null;
      } else {
        item = (dm.cutters || []).find((c) => String(c.CutterID).trim() === String(itemId).trim()) || null;
      }

      if (window.MobileDetailModal && typeof window.MobileDetailModal.show === "function" && item) {
        window.MobileDetailModal.show(item, itemType);
        return;
      }

      if (item) {
        document.dispatchEvent(new CustomEvent("showMobileDetail", { detail: { item, type: itemType } }));
      } else {
        this._toast("アイテム未発見 | Không tìm thấy", "warning");
      }
    },

    // ---------------------------
    // Networking
    // ---------------------------
    async _sendAuditBatch(statusLogs) {
      if (window.InventoryManager && typeof window.InventoryManager.sendBulkAuditToServer === "function") {
        return await window.InventoryManager.sendBulkAuditToServer(statusLogs);
      }

      const res = await fetch("/api/audit-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusLogs }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${t || "audit-batch failed"}`);
      }
      return await res.json().catch(() => ({}));
    },

    // ---------------------------
    // DOM: modal creation
    // ---------------------------
    _createModalOnce() {
      if (document.getElementById("iac-root")) return;

      const html = `
        <div id="iac-root" class="iac-root" aria-hidden="true">
          <div class="iac-backdrop" id="iac-backdrop"></div>
          <div class="iac-dialog" id="iac-dialog" role="dialog" aria-modal="true">
            <div class="iac-header" id="iac-header">
              <div class="iac-title">
                <div class="ja">棚卸センター</div>
                <div class="vi">Trung tâm kiểm kê</div>
              </div>
              <button class="iac-close" id="iac-close-btn" type="button" aria-label="Close">&times;</button>
            </div>

            <div class="iac-body">
              <div class="iac-topbar">
                <div class="iac-summary" id="iac-summary"></div>
                <div class="iac-actions">
                  <button class="iac-btn iac-btn-secondary" id="iac-open-historyview" type="button">統合履歴 | Lịch sử</button>
                  <button class="iac-btn iac-btn-secondary" id="iac-refresh-btn" type="button">更新 | Cập nhật</button>
                </div>
              </div>

              <div id="iac-session-banner" class="iac-session-banner hidden"></div>

              <div class="iac-grid">
                <div class="iac-card">
                  <div class="iac-card-title">
                    <span class="ja">セッション設定</span>
                    <span class="vi">Thiết lập phiên</span>
                  </div>

                  <div class="iac-form">
                    <div class="iac-field">
                      <label><span class="ja">日付</span><span class="vi">Ngày</span></label>
                      <input id="iac-setup-date" type="date" class="iac-input"/>
                    </div>

                    <div class="iac-field">
                      <label><span class="ja">担当者</span><span class="vi">Nhân viên</span> <span class="iac-req">*</span></label>
                      <select id="iac-setup-employee" class="iac-select"></select>
                    </div>

                    <div class="iac-field">
                      <label><span class="ja">セッション名</span><span class="vi">Tên phiên</span></label>
                      <input id="iac-setup-session-name" type="text" class="iac-input" placeholder="例: 2026-01-02 #1 - Tanaka"/>
                      <div class="iac-help">NotesにSESSION IDを埋め込み、既存ログ互換を維持 | Ghi vào Notes để tương thích log</div>
                    </div>

                    <div class="iac-field">
                      <label><span class="ja">メモ</span><span class="vi">Ghi chú</span></label>
                      <textarea id="iac-setup-note" class="iac-textarea" rows="2" placeholder="任意 | Tuỳ chọn"></textarea>
                    </div>

                    <div class="iac-rowbtns">
                      <button class="iac-btn iac-btn-primary" id="iac-start-session" type="button">開始 | Bắt đầu</button>
                      <button class="iac-btn iac-btn-warning" id="iac-lock-session" type="button">ロック | Khoá</button>
                      <button class="iac-btn iac-btn-danger" id="iac-end-session" type="button">終了 | Kết thúc</button>
                    </div>
                  </div>
                </div>

                <div class="iac-card">
                  <div class="iac-card-title">
                    <span class="ja">本日の状況</span>
                    <span class="vi">Tình trạng theo ngày</span>
                  </div>

                  <div class="iac-stats">
                    <div class="iac-stat">
                      <div class="iac-stat-label">TOTAL</div>
                      <div class="iac-stat-value" id="iac-stat-total">0</div>
                    </div>
                    <div class="iac-stat">
                      <div class="iac-stat-label">AUDITED</div>
                      <div class="iac-stat-value" id="iac-stat-audited">0</div>
                    </div>
                    <div class="iac-stat">
                      <div class="iac-stat-label">UNAUDITED</div>
                      <div class="iac-stat-value" id="iac-stat-unaudited">0</div>
                    </div>
                  </div>

                  <div class="iac-filters">
                    <div class="iac-field">
                      <label><span class="ja">セッション</span><span class="vi">Phiên</span></label>
                      <select id="iac-filter-session" class="iac-select"></select>
                    </div>

                    <div class="iac-field">
                      <label><span class="ja">棚</span><span class="vi">Vị trí</span></label>
                      <select id="iac-filter-racklayer" class="iac-select"></select>
                    </div>

                    <div class="iac-field">
                      <label><span class="ja">状態</span><span class="vi">Trạng thái</span></label>
                      <select id="iac-filter-status" class="iac-select">
                        <option value="all">全部 | Tất cả</option>
                        <option value="unaudited">未棚卸 | Chưa KK</option>
                        <option value="audited">棚卸済 | Đã KK</option>
                      </select>
                    </div>

                    <div class="iac-field iac-field-wide">
                      <label><span class="ja">検索</span><span class="vi">Tìm</span></label>
                      <input id="iac-filter-keyword" class="iac-input" type="text" placeholder="ID / Code / Name / RackLayerID"/>
                    </div>
                  </div>

                  <div class="iac-tablewrap">
                    <table class="iac-table">
                      <thead>
                        <tr>
                          <th style="width:44px;">#</th>
                          <th style="width:120px;">状態 | Status</th>
                          <th>Item</th>
                          <th style="width:130px;">RackLayerID</th>
                          <th style="width:130px;">担当 | NV</th>
                          <th style="width:150px;">時刻 | Time</th>
                          <th style="width:150px;">Session</th>
                        </tr>
                      </thead>
                      <tbody id="iac-table-body"></tbody>
                    </table>
                  </div>

                  <div class="iac-footnote">
                    <span class="ja">※ 未棚卸を優先表示</span>
                    <span class="vi">※ Ưu tiên hiển thị “Chưa kiểm kê”</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="iac-footer">
              <button class="iac-btn iac-btn-secondary" id="iac-cancel-btn" type="button">閉じる | Đóng</button>
              <button class="iac-btn iac-btn-secondary" id="iac-csv-btn" type="button">CSV</button>
              <button class="iac-btn iac-btn-secondary" id="iac-mail-btn" type="button">Mail</button>
              <button class="iac-btn iac-btn-primary" id="iac-audit-selected-btn" type="button">選択を棚卸 | Kiểm kê mục đã chọn</button>
            </div>

            <div class="iac-busy hidden" id="iac-busy">
              <div class="iac-spinner"></div>
              <div class="iac-busy-text" id="iac-busy-text">...</div>
            </div>
          </div>
        </div>

        <div id="iac-mini" class="iac-mini hidden">
          <div class="iac-mini-head">
            <div class="iac-mini-title">棚卸 | Kiểm kê</div>
            <button class="iac-mini-open" id="iac-mini-open" type="button" title="Open">⤢</button>
          </div>
          <div class="iac-mini-body">
            <div class="iac-mini-row"><span class="k">Session</span><span class="v" id="iac-mini-session">-</span></div>
            <div class="iac-mini-row"><span class="k">NV</span><span class="v" id="iac-mini-emp">-</span></div>
            <div class="iac-mini-row"><span class="k">状態</span><span class="v" id="iac-mini-lock">-</span></div>
            <div class="iac-mini-actions">
              <button class="iac-btn iac-btn-secondary iac-btn-mini" id="iac-mini-toggle-select" type="button">選択ON/OFF</button>
              <button class="iac-btn iac-btn-primary iac-btn-mini" id="iac-mini-audit" type="button">棚卸</button>
              <button class="iac-btn iac-btn-danger iac-btn-mini" id="iac-mini-end" type="button">終了</button>
            </div>
          </div>
        </div>

        <div id="iac-toast-wrap" class="iac-toast-wrap"></div>
      `;

      const host = document.createElement("div");
      host.innerHTML = html.trim();
      document.body.appendChild(host.firstElementChild);

      const mini = host.querySelector("#iac-mini");
      const toastWrap = host.querySelector("#iac-toast-wrap");
      if (mini) document.body.appendChild(mini);
      if (toastWrap) document.body.appendChild(toastWrap);
    },

    _cacheEls() {
      const $ = (id) => document.getElementById(id);

      this.state.els.root = $("iac-root");
      this.state.els.dialog = $("iac-dialog");
      this.state.els.backdrop = $("iac-backdrop");
      this.state.els.header = $("iac-header");
      this.state.els.closeBtn = $("iac-close-btn");

      this.state.els.summary = $("iac-summary");
      this.state.els.btnRefresh = $("iac-refresh-btn");
      this.state.els.btnOpenHistoryView = $("iac-open-historyview");

      this.state.els.sessionBanner = $("iac-session-banner");

      this.state.els.setupDate = $("iac-setup-date");
      this.state.els.setupEmployee = $("iac-setup-employee");
      this.state.els.setupSessionName = $("iac-setup-session-name");
      this.state.els.setupNote = $("iac-setup-note");
      this.state.els.btnStartSession = $("iac-start-session");
      this.state.els.btnEndSession = $("iac-end-session");
      this.state.els.btnLock = $("iac-lock-session");

      this.state.els.statTotal = $("iac-stat-total");
      this.state.els.statAudited = $("iac-stat-audited");
      this.state.els.statUnaudited = $("iac-stat-unaudited");

      this.state.els.filterSession = $("iac-filter-session");
      this.state.els.filterRackLayer = $("iac-filter-racklayer");
      this.state.els.filterStatus = $("iac-filter-status");
      this.state.els.filterKeyword = $("iac-filter-keyword");

      this.state.els.tableBody = $("iac-table-body");

      this.state.els.btnCancel = $("iac-cancel-btn");
      this.state.els.btnCsv = $("iac-csv-btn");
      this.state.els.btnMail = $("iac-mail-btn");
      this.state.els.btnAuditSelected = $("iac-audit-selected-btn");

      this.state.els.busy = $("iac-busy");
      this.state.els.busyText = $("iac-busy-text");

      this.state.els.miniPanel = $("iac-mini");

      this.state.els.btnCancel?.addEventListener("click", () => this.close());
      this.state.els.btnCsv?.addEventListener("click", () => this.exportCsv());
      this.state.els.btnMail?.addEventListener("click", () => this.sendMail());
      this.state.els.btnAuditSelected?.addEventListener("click", () => this.auditSelectedNow());
    },

    // ---------------------------
    // CSS loader (NEW)
    // ---------------------------
    _ensureCssLoaded() {
      // If already linked (by id)
      if (document.getElementById(this.state.cssLinkId)) return;

      const fileName = this.state.cssFileName;

      // If already linked (by href match)
      const links = Array.from(document.querySelectorAll("link[rel='stylesheet']"));
      const found = links.some((l) => {
        const href = (l.getAttribute("href") || "").trim();
        return href === fileName || href.endsWith("/" + fileName) || href.includes(fileName);
      });
      if (found) return;

      const link = document.createElement("link");
      link.id = this.state.cssLinkId;
      link.rel = "stylesheet";
      link.href = fileName;
      document.head.appendChild(link);
    },

    // ---------------------------
    // Polling
    // ---------------------------
    _startPolling() {
      this._stopPolling();
      if (!this.state.open) return;

      this.state.pollingTimer = setInterval(() => {
        this._safeRefreshData(true).catch(() => {});
      }, this.state.pollingIntervalMs);
    },

    _stopPolling() {
      if (this.state.pollingTimer) clearInterval(this.state.pollingTimer);
      this.state.pollingTimer = null;
    },

    // ---------------------------
    // Helpers: Data accessors
    // ---------------------------
    _getEmployees() {
      return Array.isArray(window.DataManager?.data?.employees) ? window.DataManager.data.employees : [];
    },

    _getRackLayers() {
      return Array.isArray(window.DataManager?.data?.racklayers) ? window.DataManager.data.racklayers : [];
    },

    _getStatusLogs() {
      return Array.isArray(window.DataManager?.data?.statuslogs) ? window.DataManager.data.statuslogs : [];
    },

    _getAllItems() {
      if (window.DataManager && typeof window.DataManager.getAllItems === "function") {
        const items = window.DataManager.getAllItems();
        return Array.isArray(items) ? items : [];
      }

      const dm = window.DataManager?.data;
      const molds = Array.isArray(dm?.molds) ? dm.molds.map((m) => ({ ...m, itemType: "mold" })) : [];
      const cutters = Array.isArray(dm?.cutters) ? dm.cutters.map((c) => ({ ...c, itemType: "cutter" })) : [];
      return molds.concat(cutters);
    },

    _getSelectedItems() {
      if (window.SelectionManager && typeof window.SelectionManager.getSelectedItems === "function") {
        const items = window.SelectionManager.getSelectedItems();
        return Array.isArray(items) ? items : [];
      }
      const arr = Array.isArray(window.SelectionState?.items) ? window.SelectionState.items : [];
      return arr.map((x) => ({ id: x.id, type: x.type }));
    },

    // ---------------------------
    // Storage: sessions
    // ---------------------------
    _loadSessions() {
      try {
        const raw = localStorage.getItem(this.state.storageSessionsKey);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        console.warn("[IAC] loadSessions failed:", e);
        return [];
      }
    },

    _saveSessions(sessions) {
      try {
        localStorage.setItem(
          this.state.storageSessionsKey,
          JSON.stringify(Array.isArray(sessions) ? sessions : [])
        );
      } catch (e) {
        console.warn("[IAC] saveSessions failed:", e);
      }
    },

    _loadActiveSession() {
      try {
        const raw = localStorage.getItem(this.state.storageActiveSessionKey);
        if (!raw) return null;
        const s = JSON.parse(raw);
        if (!s || !s.sessionId) return null;
        return s;
      } catch (e) {
        return null;
      }
    },

    _saveActiveSession(session) {
      try {
        localStorage.setItem(this.state.storageActiveSessionKey, JSON.stringify(session || null));
      } catch (e) {}
    },

    _clearActiveSession() {
      try {
        localStorage.removeItem(this.state.storageActiveSessionKey);
      } catch (e) {}
    },

    _nextSessionSeqForDate(sessions, dateKey) {
      const list = (Array.isArray(sessions) ? sessions : []).filter((s) => String(s.dateKey) === String(dateKey));
      const maxSeq = list.reduce((m, s) => Math.max(m, parseInt(s.seq || 0, 10) || 0), 0);
      return maxSeq + 1;
    },

    _buildSessionId(dateKey, seq) {
      const n = String(seq).padStart(2, "0");
      return `S-${dateKey}-${n}`;
    },

    _suggestSessionName(dateKey, seq, employeeName) {
      const emp = (employeeName || "").trim();
      const n = String(seq);
      return emp ? `${dateKey} #${n} - ${emp}` : `${dateKey} #${n}`;
    },

    _buildAuditNotes(activeSession) {
      const sid = activeSession?.sessionId || "";
      const sname = activeSession?.name || "";
      const note = activeSession?.note || "";
      const parts = [
        "棚卸|Kiểm kê",
        sid ? `SESSION:${sid}` : "",
        sname ? `NAME:${sname}` : "",
        note ? `NOTE:${note}` : "",
      ].filter(Boolean);
      return parts.join(" ; ");
    },

    _extractSessionIdFromNotes(notes) {
      if (!notes) return "";
      const s = String(notes);
      const m = s.match(/SESSION:([A-Za-z0-9\-_]+)/);
      return m ? String(m[1]) : "";
    },

    // ---------------------------
    // Helpers: UX
    // ---------------------------
    _setBusy(on, text) {
      const busy = this.state.els.busy;
      const busyText = this.state.els.busyText;
      if (!busy) return;
      if (on) {
        if (busyText) busyText.textContent = text || "処理中... | Đang xử lý...";
        busy.classList.remove("hidden");
      } else {
        busy.classList.add("hidden");
      }
    },

    _toast(message, type = "info", timeout = 3000) {
      const wrap = document.getElementById("iac-toast-wrap");
      if (!wrap) return;

      const el = document.createElement("div");
      el.className = `iac-toast ${type}`;
      el.textContent = String(message || "");
      wrap.appendChild(el);

      setTimeout(() => {
        el.style.opacity = "0";
        el.style.transform = "translateY(-4px)";
        el.style.transition = "all 220ms ease";
        setTimeout(() => el.remove(), 250);
      }, timeout);
    },

    _buildSummary() {
      const rows = this._buildTableRows();
      const total = rows.length;
      const audited = rows.filter((r) => r.audited).length;
      const unaudited = total - audited;

      const session = this.state.computed.activeSession;
      const s = session ? `${session.name || session.sessionId} (${session.employeeName || session.employeeId || "-"})` : "-";

      return [
        `日付/Ngày: ${this.state.dateKey || this._todayKey()}`,
        `セッション/Phiên: ${s}`,
        `TOTAL: ${total}`,
        `AUDITED(棚卸済): ${audited}`,
        `UNAUDITED(未棚卸): ${unaudited}`,
        "",
        "※ NotesにSESSION:xxxを埋め込み済 | Đã ghi SESSION vào Notes để lọc",
      ].join("\n");
    },

    _formatDateTime(dateStr) {
      if (!dateStr) return "-";
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mm = String(d.getMinutes()).padStart(2, "0");
      return `${y}-${m}-${day} ${hh}:${mm}`;
    },

    _todayKey() {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    },

    _employeeNameById(employeeId) {
      const id = String(employeeId || "").trim();
      if (!id) return "";
      const emp = this._getEmployees().find((e) => String(e.EmployeeID).trim() === id);
      return emp ? String(emp.EmployeeName || emp.Name || id) : "";
    },

    _esc(s) {
      return String(s == null ? "" : s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    },

    _debounce(fn, wait) {
      let t = null;
      return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
      };
    },

    _attachSwipeToClose(headerEl, modalEl, onClose) {
      if (!headerEl || !modalEl || !("ontouchstart" in window)) return;

      let startY = 0;
      let currentY = 0;
      let dragging = false;

      const reset = () => {
        dragging = false;
        modalEl.style.transform = "translate(-50%, -50%)";
        modalEl.style.opacity = "1";
      };

      const onTouchStart = (e) => {
        if (!e.touches || e.touches.length !== 1) return;
        startY = e.touches[0].clientY;
        currentY = startY;
        dragging = true;
      };

      const onTouchMove = (e) => {
        if (!dragging) return;
        const y = e.touches[0].clientY;
        const dy = y - startY;
        if (dy < 0) return;
        currentY = y;
        const translateY = Math.min(dy, 140);
        const opacity = 1 - Math.min(dy / 320, 0.5);
        modalEl.style.transform = `translate(-50%, calc(-50% + ${translateY}px))`;
        modalEl.style.opacity = String(opacity);
      };

      const onTouchEnd = () => {
        if (!dragging) return;
        const dy = currentY - startY;
        if (dy > 100) {
          reset();
          if (typeof onClose === "function") onClose();
        } else {
          reset();
        }
      };

      headerEl.addEventListener("touchstart", onTouchStart, { passive: true });
      headerEl.addEventListener("touchmove", onTouchMove, { passive: true });
      headerEl.addEventListener("touchend", onTouchEnd);
      headerEl.addEventListener("touchcancel", reset);
    },

    // ---------------------------
    // Device ID
    // ---------------------------
    _ensureDeviceId() {
      const existing = this._getDeviceId();
      if (existing) return;
      const id = `D-${Math.random().toString(16).slice(2)}-${Date.now().toString(16)}`;
      try {
        localStorage.setItem(this.state.storageDeviceKey, id);
      } catch (e) {}
    },

    _getDeviceId() {
      try {
        return localStorage.getItem(this.state.storageDeviceKey) || "";
      } catch (e) {
        return "";
      }
    },
  };

  // Export global
  window.InventoryAuditCenter = InventoryAuditCenter;

  // Auto-init
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => InventoryAuditCenter.init(), { once: true });
  } else {
    InventoryAuditCenter.init();
  }
})();

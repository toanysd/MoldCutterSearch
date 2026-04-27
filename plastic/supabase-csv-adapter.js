/**
 * supabase-csv-adapter.js
 * Proxy giả lập môi trường Supabase Client để giúp các module Plastic V2
 * giao tiếp trực tiếp với hệ thống Local CSV (window.DataManager & /api/csv/upsert)
 * mà không cần phải chỉnh sửa dòng logic nào của file UI.
 */

class SupabaseCSVAdapter {
    from(tableName) {
        return new CSVQueryBuilder(tableName);
    }
}

class CSVQueryBuilder {
    constructor(tableName) {
        this.tableName = tableName;
        this.queryType = 'select'; // select, insert, update 
        this._payload = null;
        this._eqs = [];
        this._orders = [];
        this._limit = null;
    }

    select(columns) {
        this.queryType = 'select';
        return this; // mock chain
    }

    insert(data) {
        this.queryType = 'insert';
        this._payload = data;
        return this;
    }

    update(data) {
        this.queryType = 'update';
        this._payload = data;
        return this;
    }

    eq(field, value) {
        this._eqs.push({ field, value });
        return this;
    }

    order(field, opts = { ascending: true }) {
        this._orders.push({ field, opts });
        return this;
    }

    limit(count) {
        this._limit = count;
        return this;
    }

    // Biến đối tượng query thành Thenable để bắt Promise (await supabase.from...)
    then(resolve, reject) {
        this.execute().then(resolve).catch(reject);
    }

    async execute() {
        if (!window.DataManager) {
            console.error('[CSVAdapter] DataManager không khả dụng.');
            return { data: null, error: { message: "Hệ thống DataManager chưa tải xong." } };
        }

        // ===================================
        // 1. SELECT LOGIC
        // ===================================
        if (this.queryType === 'select') {
            let allData = window.DataManager.data;
            let tableData = allData[this.tableName];
            if (!tableData) return { data: [], error: null };
            
            let res = [...tableData];

            // Áp dụng bộ lọc eq
            for (let eq of this._eqs) {
                res = res.filter(r => String(r[eq.field]) === String(eq.value));
            }

            // Áp dụng sắp xếp nhiều tầng
            // Duyệt ngược mảng orders vì order đầu tiên có mức độ ưu tiên cao nhất
            for (let i = this._orders.length - 1; i >= 0; i--) {
                let ord = this._orders[i];
                let asc = ord.opts.ascending !== false;
                res.sort((a, b) => {
                    let av = a[ord.field];
                    let bv = b[ord.field];
                    if (av === bv) return 0;
                    if (av == null && bv != null) return asc ? -1 : 1;
                    if (bv == null && av != null) return asc ? 1 : -1;
                    if (typeof av === 'number' && typeof bv === 'number') {
                        return asc ? av - bv : bv - av;
                    }
                    let cmp = String(av).localeCompare(String(bv), 'ja');
                    return asc ? cmp : -cmp;
                });
            }

            // Chọn số lượng
            if (this._limit != null && res.length > this._limit) {
                res = res.slice(0, this._limit);
            }

            return { data: res, error: null };
        }

        // ===================================
        // 2. INSERT LOGIC
        // ===================================
        else if (this.queryType === 'insert') {
            let isArray = Array.isArray(this._payload);
            let items = isArray ? this._payload : [this._payload];
            let results = [];
            let errs = [];

            let idField = this._getIdField();
            let now = new Date().toISOString();

            for (let item of items) {
                let reqData = { ...item };
                
                // Tự sinh UUID nếu thiếu
                if (!reqData[idField]) {
                    reqData[idField] = this._generateUUID(this.tableName);
                }
                
                // Bổ sung timestamp mặc định
                if (!reqData.created_at) reqData.created_at = now;
                if (!reqData.updated_at) reqData.updated_at = now;

                try {
                    let res = await fetch('/api/csv/upsert', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            filename: this.tableName + '.csv',
                            idField: idField,
                            idValue: reqData[idField],
                            mode: 'insert',
                            updates: reqData
                        })
                    });
                    let json = await res.json();
                    if (!res.ok || !json.success) errs.push(json.error || `Lỗi ghi file ${this.tableName}`);
                    else results.push(reqData);
                } catch (err) {
                    errs.push(err.message);
                }
            }

            // Đồng bộ bộ đệm App
            if (window.App && window.App.triggerDataUpdate) window.App.triggerDataUpdate();

            if (errs.length > 0) return { data: null, error: { message: errs.join(', ') } };
            return { data: isArray ? results : results, error: null }; 
            // supabase trả về mảng kết quả luôn ở insert().select()
        }

        // ===================================
        // 3. UPDATE LOGIC
        // ===================================
        else if (this.queryType === 'update') {
            let reqData = { ...this._payload };
            let eqs = this._eqs;
            
            // Tìm idField để update thông qua .eq()
            let idField = eqs[0] ? eqs[0].field : this._getIdField();
            let idVal   = eqs[0] ? eqs[0].value : reqData[idField];

            if (!idVal) {
                return { data: null, error: { message: 'Không thể xác định idValue cho lệnh update' }};
            }

            reqData[idField] = idVal;
            reqData.updated_at = reqData.updated_at || new Date().toISOString();

            try {
                let res = await fetch('/api/csv/upsert', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: this.tableName + '.csv',
                        idField: idField,
                        idValue: idVal,
                        mode: 'update',
                        updates: reqData
                    })
                });
                let json = await res.json();
                if (window.App && window.App.triggerDataUpdate) window.App.triggerDataUpdate();
                if (!res.ok || !json.success) return { data: null, error: { message: json.error || 'Lỗi mạng khi update' } };
                return { data: [reqData], error: null };
            } catch (err) {
                return { data: null, error: { message: err.message } };
            }
        }
    }

    _getIdField() {
        const tb = this.tableName;
        if (tb === 'plastic_master') return 'plastic_id';
        if (tb === 'plastic_manufacturer_map') return 'manufacturer_map_id';
        if (tb === 'plastic_supplier') return 'supplier_id';
        if (tb === 'plastic_manufacturer_grade') return 'grade_id';
        if (tb === 'plastic_pricing') return 'pricing_id';
        if (tb === 'plastic_receipt') return 'receipt_id';
        if (tb === 'plastic_receipt_roll') return 'receipt_roll_id';
        if (tb === 'plastic_adjustment_log') return 'adjustment_log_id';
        if (tb === 'plastic_usage_plan') return 'usage_plan_id';
        if (tb === 'plastic_usage_plan_roll') return 'usage_plan_roll_id';
        if (tb === 'plastic_usage_actual') return 'usage_actual_id';
        if (tb === 'plastic_inventory_snapshot') return 'inventory_snapshot_id';
        if (tb === 'plastic_inventory_count_line') return 'inventory_count_line_id';
        return 'id';
    }

    _generateUUID(tablePrefix) {
        return crypto.randomUUID ? crypto.randomUUID() :
            'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
    }
}

window.SupabaseCSVAdapter = SupabaseCSVAdapter;

/**
 * Database Operations & Management Tools Page
 * ============================================
 * Provides user interface for creating/restoring backups, database vacuum compaction,
 * orphaned entity cleanup, and CSV/JSON table import/export.
 */

import { adminFetch, showToast, state } from '../admin.js';

// Localized translations
const dbTranslations = {
    en: {
        title: "Database Control Center",
        desc: "Perform operations like manual database backups, online restoration, defragmentation compaction, data imports/exports, and data integrity cleaning.",
        backups: "SQLite Backups",
        createBackup: "Create Backup",
        restore: "Restore",
        delete: "Delete",
        filename: "Backup Filename",
        size: "File Size",
        date: "Created Date",
        actions: "Actions",
        compaction: "SQLite Compaction & VACUUM",
        compactionDesc: "Defragments the database file, reorganizes storage pages, and reclaims free space to optimize query execution speeds.",
        runVacuum: "Execute Compaction",
        cleanup: "Orphaned Entity Cleanup",
        cleanupDesc: "Identifies and removes product variants and store offers that have no valid parent relationships in the database.",
        runCleanup: "Clean Database Integrity",
        importExport: "Bulk Table Import & Export",
        tableSelect: "Target Table",
        formatSelect: "File Format",
        strategySelect: "Import Strategy",
        upsertOpt: "Upsert (Insert / Update on Conflict)",
        replaceOpt: "Replace (Truncate Table First)",
        exportBtn: "Export Table data",
        importBtn: "Import Data File",
        selectFile: "Select CSV or JSON File",
        restrictedSuperAdmin: "Restricted to Super Administrators",
        confirmRestore: "Are you sure you want to restore the database? This will overwrite the active database state online.",
        confirmDelete: "Are you sure you want to delete this backup file?",
        noBackups: "No backups available.",
        successBackup: "Database backup created successfully.",
        successRestore: "Database successfully restored.",
        successDelete: "Backup file deleted successfully.",
        successVacuum: "Database vacuum completed successfully.",
        successCleanup: "Orphaned entities cleaned up successfully.",
        successImport: "Table data imported successfully.",
        failedLoad: "Failed to load database status and backup files registry."
    },
    ar: {
        title: "مركز إدارة قاعدة البيانات",
        desc: "تنفيذ عمليات مثل النسخ الاحتياطي اليدوي لقاعدة البيانات، والاستعادة الفورية، وإعادة تنظيم الصفحات والمساحات (VACUUM)، وتصدير/استيراد البيانات، وتنظيف البنية التحتية للبيانات.",
        backups: "النسخ الاحتياطية لـ SQLite",
        createBackup: "إنشاء نسخة احتياطية",
        restore: "استعادة",
        delete: "حذف",
        filename: "اسم ملف النسخة الاحتياطية",
        size: "حجم الملف",
        date: "تاريخ الإنشاء",
        actions: "الإجراءات",
        compaction: "ضغط وتقليص SQLite (VACUUM)",
        compactionDesc: "إزالة التجزئة لملف قاعدة البيانات، وإعادة تنظيم صفحات التخزين، واسترجاع المساحة الحرة لتحسين سرعة معالجة الاستعلامات.",
        runVacuum: "تشغيل عملية التقليص",
        cleanup: "تنظيف الكيانات اليتيمة",
        cleanupDesc: "تحديد وحذف الأنواع الفرعية وعروض المتاجر التي ليس لها علاقات أب صالحة في قاعدة البيانات.",
        runCleanup: "تنظيف سلامة البيانات",
        importExport: "استيراد وتصدير الجداول بالجملة",
        tableSelect: "الجدول المستهدف",
        formatSelect: "صيغة الملف",
        strategySelect: "استراتيجية الاستيراد",
        upsertOpt: "تحديث/إدراج (إدخال أو تعديل عند التعارض)",
        replaceOpt: "استبدال (تفريع الجدول أولاً)",
        exportBtn: "تصدير بيانات الجدول",
        importBtn: "استيراد ملف البيانات",
        selectFile: "اختر ملف CSV أو JSON",
        restrictedSuperAdmin: "مقتصر على المشرفين الرئيسيين (Super Admin)",
        confirmRestore: "هل أنت متأكد من رغبتك في استعادة قاعدة البيانات؟ سيؤدي ذلك إلى الكتابة فوق حالة قاعدة البيانات النشطة حالياً.",
        confirmDelete: "هل أنت متأكد من رغبتك في حذف هذا الملف الاحتياطي؟",
        noBackups: "لا توجد نسخ احتياطية متاحة.",
        successBackup: "تم إنشاء النسخة الاحتياطية لقاعدة البيانات بنجاح.",
        successRestore: "تمت استعادة قاعدة البيانات بنجاح.",
        successDelete: "تم حذف ملف النسخة الاحتياطية بنجاح.",
        successVacuum: "اكتمل تقليص قاعدة البيانات بنجاح.",
        successCleanup: "تم تنظيف الكيانات اليتيمة بنجاح.",
        successImport: "تم استيراد بيانات الجدول بنجاح.",
        failedLoad: "فشل تحميل سجل النسخ الاحتياطية وحالة قاعدة البيانات."
    }
};

function st(key) {
    const lang = state.lang || 'en';
    return (dbTranslations[lang] && dbTranslations[lang][key]) || dbTranslations.en[key] || key;
}

export async function render(container) {
    const isSuperAdmin = state.user && state.user.role === 'super_admin';

    container.innerHTML = `
        <style>
            .db-grid {
                display: grid;
                grid-template-columns: 2fr 1fr;
                gap: 24px;
                margin-top: 24px;
            }
            @media (max-width: 900px) {
                .db-grid {
                    grid-template-columns: 1fr;
                }
            }
            .operation-panel {
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            .log-box-db {
                background: rgba(0, 0, 0, 0.4);
                border: 1px solid var(--border-base);
                border-radius: var(--radius-md);
                padding: 14px;
                font-family: var(--font-mono);
                font-size: 11px;
                color: #e2e8f0;
                min-height: 80px;
                max-height: 180px;
                overflow-y: auto;
                white-space: pre-wrap;
            }
            .import-drag-area {
                border: 2px dashed rgba(255, 255, 255, 0.15);
                border-radius: var(--radius-md);
                padding: 24px;
                text-align: center;
                cursor: pointer;
                background: rgba(255, 255, 255, 0.01);
                transition: border-color 0.2s ease, background 0.2s ease;
            }
            .import-drag-area:hover {
                border-color: var(--primary);
                background: rgba(99, 102, 241, 0.03);
            }
            .file-selected-info {
                font-size: 12px;
                font-weight: 500;
                color: var(--success);
                margin-top: 8px;
                display: none;
            }
        </style>

        <div>
            <h1 style="font-size: 24px; font-weight: 700; background: linear-gradient(to right, #fff, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                ${st('title')}
            </h1>
            <p style="font-size: 13px; color: var(--text-secondary);">${st('desc')}</p>

            <div class="db-grid">
                <!-- Left Panel: Backups Listing & Tools -->
                <div class="operation-panel">
                    <!-- SQLite Backups Registry -->
                    <div class="card">
                        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                            <div class="card-title"><i class="fa-solid fa-cloud-arrow-up"></i> ${st('backups')}</div>
                            <button id="create-backup-btn" class="btn btn-primary btn-sm">
                                <i class="fa-solid fa-plus"></i> ${st('createBackup')}
                            </button>
                        </div>
                        <div class="table-wrapper">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>${st('filename')}</th>
                                        <th>${st('size')}</th>
                                        <th>${st('date')}</th>
                                        <th style="text-align: center; width: 160px;">${st('actions')}</th>
                                    </tr>
                                </thead>
                                <tbody id="backups-tbody">
                                    <tr>
                                        <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 24px;">Loading backups...</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- Import / Export Panel -->
                    <div class="card">
                        <div class="card-header">
                            <div class="card-title"><i class="fa-solid fa-file-csv"></i> ${st('importExport')}</div>
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                            <div class="form-group">
                                <label class="form-label">${st('tableSelect')}</label>
                                <select id="db-table-select" class="form-control">
                                    <option value="categories">categories (الأقسام)</option>
                                    <option value="subcategories">subcategories (الأقسام الفرعية)</option>
                                    <option value="brands">brands (العلامات التجارية)</option>
                                    <option value="products">products (المنتجات)</option>
                                    <option value="stores">stores (المتاجر)</option>
                                    <option value="store_offers">store_offers (عروض المتاجر)</option>
                                    <option value="product_attributes">product_attributes (تعريفات الخواص)</option>
                                    <option value="product_attribute_values">product_attribute_values (قيم الخواص)</option>
                                    <option value="category_keywords">category_keywords (الكلمات الدلالية)</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label class="form-label">${st('formatSelect')}</label>
                                <select id="db-format-select" class="form-control">
                                    <option value="json">JSON format</option>
                                    <option value="csv">CSV (Comma Separated)</option>
                                </select>
                            </div>
                        </div>

                        <div style="display: flex; gap: 12px; margin-bottom: 24px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 16px;">
                            <button id="export-table-btn" class="btn" style="flex-grow: 1;">
                                <i class="fa-solid fa-download"></i> ${st('exportBtn')}
                            </button>
                        </div>

                        <!-- Import Data Section -->
                        <div style="display: flex; flex-direction: column; gap: 16px;">
                            <div class="form-group">
                                <label class="form-label">${st('strategySelect')}</label>
                                <select id="db-import-strategy" class="form-control" style="max-width: 300px;">
                                    <option value="upsert">${st('upsertOpt')}</option>
                                    <option value="replace">${st('replaceOpt')}</option>
                                </select>
                            </div>

                            <div class="import-drag-area" id="import-drag-box">
                                <i class="fa-solid fa-file-arrow-up" style="font-size: 32px; color: var(--text-secondary); margin-bottom: 8px;"></i>
                                <div style="font-size: 13px; font-weight: 600;">${st('selectFile')}</div>
                                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">Supports .csv and .json files matching header columns</div>
                                <input type="file" id="import-file-input" style="display: none;" accept=".csv,.json">
                                <div class="file-selected-info" id="file-info-label"></div>
                            </div>

                            <button id="import-table-btn" class="btn btn-primary" disabled>
                                <i class="fa-solid fa-upload"></i> ${st('importBtn')}
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Right Panel: Compaction & Cleanup Diagnostics -->
                <div style="display: flex; flex-direction: column; gap: 24px;">
                    <!-- Database Optimization Compaction -->
                    <div class="card">
                        <div class="card-header">
                            <div class="card-title"><i class="fa-solid fa-compress"></i> ${st('compaction')}</div>
                        </div>
                        <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.4;">
                            ${st('compactionDesc')}
                        </p>
                        <button id="run-vacuum-btn" class="btn btn-success" style="width: 100%;">
                            <i class="fa-solid fa-play"></i> <span>${st('runVacuum')}</span>
                        </button>
                        <div style="margin-top: 14px;">
                            <div class="log-box-db" id="vacuum-log-box">Logs will display here...</div>
                        </div>
                    </div>

                    <!-- Database Integrity Cleanup -->
                    <div class="card">
                        <div class="card-header">
                            <div class="card-title"><i class="fa-solid fa-broom"></i> ${st('cleanup')}</div>
                        </div>
                        <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.4;">
                            ${st('cleanupDesc')}
                        </p>
                        <button id="run-cleanup-btn" class="btn btn-warning" style="width: 100%;">
                            <i class="fa-solid fa-shield"></i> <span>${st('runCleanup')}</span>
                        </button>
                        <div style="margin-top: 14px;">
                            <div class="log-box-db" id="cleanup-log-box">Logs will display here...</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Bind Basic Button Events
    document.getElementById('create-backup-btn').addEventListener('click', createBackup);
    document.getElementById('run-vacuum-btn').addEventListener('click', runVacuum);
    document.getElementById('run-cleanup-btn').addEventListener('click', runCleanup);
    document.getElementById('export-table-btn').addEventListener('click', exportTable);

    // Bind File Selector Import
    const dragBox = document.getElementById('import-drag-box');
    const fileInput = document.getElementById('import-file-input');
    const importBtn = document.getElementById('import-table-btn');

    dragBox.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (file) {
            const label = document.getElementById('file-info-label');
            label.textContent = `Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            label.style.display = 'block';
            importBtn.disabled = false;

            // Auto-detect format by extension
            const ext = file.name.split('.').pop().toLowerCase();
            const formatSelect = document.getElementById('db-format-select');
            if (ext === 'csv') {
                formatSelect.value = 'csv';
            } else if (ext === 'json') {
                formatSelect.value = 'json';
            }
        }
    });

    importBtn.addEventListener('click', importTableData);

    // Load Backups
    await loadBackupsList();
}

async function loadBackupsList() {
    const tbody = document.getElementById('backups-tbody');
    if (!tbody) return;

    try {
        const res = await adminFetch('/api/admin/database/backups');
        if (!res || !res.backups || res.backups.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: var(--text-secondary); padding: 24px;">
                        ${st('noBackups')}
                    </td>
                </tr>
            `;
            return;
        }

        const isSuperAdmin = state.user && state.user.role === 'super_admin';

        tbody.innerHTML = res.backups.map(b => {
            const date = new Date(b.createdAt);
            const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const sizeMb = (b.sizeBytes / 1024 / 1024).toFixed(2);

            return `
                <tr>
                    <td style="font-weight: 600; color: var(--text-primary); font-family: var(--font-mono); font-size: 12px;">
                        ${b.filename}
                    </td>
                    <td style="font-family: var(--font-mono); font-size: 12px;">
                        ${sizeMb} MB
                    </td>
                    <td style="font-size: 11px; color: var(--text-secondary);">
                        ${dateStr}
                    </td>
                    <td style="text-align: center;">
                        <button class="btn btn-sm restore-backup-btn" data-filename="${b.filename}" ${!isSuperAdmin ? 'disabled title="' + st('restrictedSuperAdmin') + '" style="opacity: 0.5; pointer-events: none;"' : ''}>
                            <i class="fa-solid fa-rotate-left"></i> <span>${st('restore')}</span>
                        </button>
                        <button class="btn btn-sm btn-danger delete-backup-btn" data-filename="${b.filename}" ${!isSuperAdmin ? 'disabled title="' + st('restrictedSuperAdmin') + '" style="opacity: 0.5; pointer-events: none;"' : ''} style="margin-left: 6px; padding: 4px 8px;">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Bind Action Events
        tbody.querySelectorAll('.restore-backup-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const filename = btn.dataset.filename;
                restoreBackup(filename);
            });
        });

        tbody.querySelectorAll('.delete-backup-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const filename = btn.dataset.filename;
                deleteBackup(filename);
            });
        });

    } catch (err) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--danger); padding: 24px;">
                    ${st('failedLoad')}: ${err.message}
                </td>
            </tr>
        `;
    }
}

async function createBackup() {
    const btn = document.getElementById('create-backup-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;

    try {
        const res = await adminFetch('/api/admin/database/backups', { method: 'POST' });
        if (res.success) {
            showToast(st('successBackup'), 'success');
            await loadBackupsList();
        }
    } catch (err) {
        showToast(err.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function restoreBackup(filename) {
    if (!confirm(st('confirmRestore'))) return;

    try {
        const res = await adminFetch(`/api/admin/database/backups/${filename}/restore`, {
            method: 'POST'
        });
        if (res.success) {
            showToast(st('successRestore'), 'success');
            await loadBackupsList();
        }
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function deleteBackup(filename) {
    if (!confirm(st('confirmDelete'))) return;

    try {
        const res = await adminFetch(`/api/admin/database/backups/${filename}`, {
            method: 'DELETE'
        });
        if (res.success) {
            showToast(st('successDelete'), 'success');
            await loadBackupsList();
        }
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function runVacuum() {
    const btn = document.getElementById('run-vacuum-btn');
    const logBox = document.getElementById('vacuum-log-box');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Optimizing...`;
    logBox.textContent = `Running vacuum compaction online...\nThis might take a few seconds...`;

    try {
        const res = await adminFetch('/api/admin/database/vacuum', { method: 'POST' });
        if (res.success) {
            showToast(st('successVacuum'), 'success');
            const stats = res.stats;
            logBox.textContent = `[VACUUM COMPACTION STATS]\n` +
                                 `File Size Before: ${stats.sizeBeforeMb} MB\n` +
                                 `File Size After:  ${stats.sizeAfterMb} MB\n` +
                                 `Space Savings:    ${stats.savingsMb} MB\n` +
                                 `Compaction Completed Successfully!`;
        }
    } catch (err) {
        logBox.textContent = `Error running compaction:\n${err.message}`;
        showToast(err.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

async function runCleanup() {
    const btn = document.getElementById('run-cleanup-btn');
    const logBox = document.getElementById('cleanup-log-box');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Cleaning...`;
    logBox.textContent = `Detecting and deleting orphaned rows in product_variants and store_offers tables...`;

    try {
        const res = await adminFetch('/api/admin/database/cleanup', { method: 'POST' });
        if (res.success) {
            showToast(st('successCleanup'), 'success');
            const stats = res.stats;
            logBox.textContent = `[DATA INTEGRITY CLEANUP REPORT]\n` +
                                 `Deleted Orphaned Variants: ${stats.deletedVariants}\n` +
                                 `Deleted Orphaned Offers:   ${stats.deletedOffers}\n` +
                                 `All database relations verified. Data is clean!`;
        }
    } catch (err) {
        logBox.textContent = `Error running cleanup:\n${err.message}`;
        showToast(err.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function exportTable() {
    const table = document.getElementById('db-table-select').value;
    const format = document.getElementById('db-format-select').value;

    // Use native browser redirection to download tables directly
    const exportUrl = `/api/admin/database/export/${table}?format=${format}`;
    window.location.href = exportUrl;
}

async function importTableData() {
    const fileInput = document.getElementById('import-file-input');
    const table = document.getElementById('db-table-select').value;
    const format = document.getElementById('db-format-select').value;
    const strategy = document.getElementById('db-import-strategy').value;
    const importBtn = document.getElementById('import-table-btn');

    const file = fileInput.files[0];
    if (!file) return;

    const originalText = importBtn.innerHTML;
    importBtn.disabled = true;
    importBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Importing...`;

    const reader = new FileReader();
    reader.onload = async (e) => {
        const rawData = e.target.result;
        try {
            const res = await adminFetch(`/api/admin/database/import/${table}`, {
                method: 'POST',
                body: {
                    rawData,
                    format,
                    strategy
                }
            });

            if (res.success) {
                showToast(st('successImport'), 'success');
                alert(res.message);
                // Clear file input
                fileInput.value = '';
                document.getElementById('file-info-label').style.display = 'none';
            }
        } catch (err) {
            showToast(err.message, 'danger');
        } finally {
            importBtn.disabled = false;
            importBtn.innerHTML = originalText;
        }
    };

    reader.onerror = () => {
        showToast('Failed to read file', 'danger');
        importBtn.disabled = false;
        importBtn.innerHTML = originalText;
    };

    reader.readAsText(file);
}

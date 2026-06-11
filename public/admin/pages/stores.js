/**
 * Stores Registry Management Page
 * ==============================
 * Handles viewing store metrics, toggling is_enabled states, editing priorities,
 * and configuring metadata within a glassmorphic modal interface.
 */

import { adminFetch, showToast, state } from '../admin.js';

// Localized translations for the stores registry
const storeTranslations = {
    en: {
        title: "Store Registry",
        desc: "Monitor active stores, configure scraper concurrency priority, update metadata configurations, or temporarily enable/disable stores from query results.",
        variantsCount: "Variants",
        offersCount: "Offers",
        priority: "Scraper Priority",
        status: "Scrape Status",
        lastScraped: "Last Scraped",
        editStore: "Configure Store",
        saveBtn: "Save Settings",
        cancelBtn: "Cancel",
        storeName: "Store Name",
        website: "Website URL",
        logoUrl: "Logo URL",
        metadata: "Metadata (JSON format)",
        enabled: "Enabled",
        disabled: "Disabled",
        invalidJson: "Invalid JSON format",
        successToggle: "Store status toggled successfully",
        successUpdate: "Store settings updated successfully",
        errorToggle: "Failed to toggle store status",
        errorUpdate: "Failed to update store settings"
    },
    ar: {
        title: "سجل المتاجر",
        desc: "مراقبة المتاجر النشطة، وتكوين أولوية التزامن للمكشطة، وتحديث بيانات التكوين الإضافية، أو تمكين/تعطيل المتاجر مؤقتاً من نتائج البحث.",
        variantsCount: "الأنواع",
        offersCount: "العروض",
        priority: "أولوية المكشطة",
        status: "حالة المزامنة",
        lastScraped: "آخر مزامنة",
        editStore: "إعدادات المتجر",
        saveBtn: "حفظ الإعدادات",
        cancelBtn: "إلغاء",
        storeName: "اسم المتجر",
        website: "رابط الموقع الالكتروني",
        logoUrl: "رابط شعار المتجر",
        metadata: "البيانات الإضافية (بصيغة JSON)",
        enabled: "مُمكّن",
        disabled: "مُعطّل",
        invalidJson: "صيغة JSON غير صحيحة",
        successToggle: "تم تغيير حالة المتجر بنجاح",
        successUpdate: "تم تحديث إعدادات المتجر بنجاح",
        errorToggle: "فشل تغيير حالة المتجر",
        errorUpdate: "فشل تحديث إعدادات المتجر"
    }
};

function st(key) {
    const lang = state.lang || 'en';
    return (storeTranslations[lang] && storeTranslations[lang][key]) || storeTranslations.en[key] || key;
}

let activeStoreToEdit = null;

export async function render(container) {
    container.innerHTML = `
        <style>
            .stores-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                gap: 20px;
                margin-top: 24px;
            }
            .store-card {
                background: rgba(255, 255, 255, 0.03);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 16px;
                padding: 20px;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                position: relative;
                transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
            }
            .store-card:hover {
                transform: translateY(-2px);
                border-color: rgba(99, 102, 241, 0.3);
                box-shadow: 0 10px 20px -10px rgba(99, 102, 241, 0.2);
            }
            .store-card.disabled-store {
                opacity: 0.65;
                border-color: rgba(255, 255, 255, 0.03);
            }
            .store-header {
                display: flex;
                align-items: center;
                gap: 12px;
                margin-bottom: 16px;
            }
            .store-logo {
                width: 48px;
                height: 48px;
                border-radius: 10px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                object-fit: contain;
                padding: 4px;
            }
            .store-info {
                flex-grow: 1;
            }
            .store-title {
                font-size: 16px;
                font-weight: 600;
                color: var(--text-primary);
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .store-link {
                font-size: 11px;
                color: var(--primary-light);
                text-decoration: none;
                display: inline-flex;
                align-items: center;
                gap: 4px;
                margin-top: 2px;
            }
            .store-link:hover {
                text-decoration: underline;
            }
            .store-switch-container {
                position: absolute;
                top: 20px;
                right: 20px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .switch-label {
                font-size: 11px;
                font-weight: 500;
            }
            /* Custom Switch Toggle */
            .toggle-switch {
                position: relative;
                display: inline-block;
                width: 36px;
                height: 20px;
            }
            .toggle-switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .toggle-slider {
                position: absolute;
                cursor: pointer;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background-color: rgba(255, 255, 255, 0.1);
                transition: .3s;
                border-radius: 34px;
                border: 1px solid rgba(255, 255, 255, 0.08);
            }
            .toggle-slider:before {
                position: absolute;
                content: "";
                height: 12px;
                width: 12px;
                left: 3px;
                bottom: 3px;
                background-color: #94a3b8;
                transition: .3s;
                border-radius: 50%;
            }
            input:checked + .toggle-slider {
                background-color: var(--primary);
                border-color: rgba(99, 102, 241, 0.4);
            }
            input:checked + .toggle-slider:before {
                transform: translateX(16px);
                background-color: #fff;
            }
            .store-stats {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
                background: rgba(0, 0, 0, 0.15);
                border-radius: 10px;
                padding: 12px;
                margin-bottom: 16px;
                font-size: 12px;
                border: 1px solid rgba(255, 255, 255, 0.02);
            }
            .stat-box {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            .stat-lbl {
                color: var(--text-secondary);
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .stat-val {
                font-weight: 600;
                font-family: var(--font-mono);
                color: var(--text-primary);
            }
            .store-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-top: 12px;
                border-top: 1px solid rgba(255, 255, 255, 0.05);
                font-size: 11px;
            }
            .diagnostic-info {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            .diagnostic-time {
                color: var(--text-secondary);
            }
            .priority-badge {
                background: rgba(99, 102, 241, 0.1);
                color: var(--primary-light);
                padding: 2px 8px;
                border-radius: 12px;
                font-family: var(--font-mono);
                font-weight: 600;
                border: 1px solid rgba(99, 102, 241, 0.15);
            }

            /* Glass Modal Styles */
            .glass-modal-backdrop {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0, 0, 0, 0.6);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.25s ease;
            }
            .glass-modal-backdrop.open {
                opacity: 1;
                pointer-events: auto;
            }
            .glass-modal {
                background: rgba(23, 27, 41, 0.85);
                backdrop-filter: blur(25px);
                -webkit-backdrop-filter: blur(25px);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 20px;
                width: 90%;
                max-width: 500px;
                box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5);
                transform: scale(0.95);
                transition: transform 0.25s ease;
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            .glass-modal-backdrop.open .glass-modal {
                transform: scale(1);
            }
            .modal-header {
                padding: 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .modal-title {
                font-size: 18px;
                font-weight: 700;
                color: #fff;
            }
            .modal-close {
                background: none;
                border: none;
                color: var(--text-secondary);
                cursor: pointer;
                font-size: 18px;
            }
            .modal-close:hover {
                color: #fff;
            }
            .modal-body {
                padding: 20px;
                display: flex;
                flex-direction: column;
                gap: 16px;
                max-height: 70vh;
                overflow-y: auto;
            }
            .modal-footer {
                padding: 20px;
                border-top: 1px solid rgba(255, 255, 255, 0.06);
                display: flex;
                justify-content: flex-end;
                gap: 12px;
            }
            .form-group {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .form-label {
                font-size: 12px;
                font-weight: 500;
                color: var(--text-secondary);
            }
            .form-control {
                background: rgba(255, 255, 255, 0.04);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 8px;
                padding: 8px 12px;
                color: #fff;
                font-size: 13px;
                transition: border-color 0.2s ease;
            }
            .form-control:focus {
                outline: none;
                border-color: var(--primary);
            }
            textarea.form-control {
                min-height: 100px;
                font-family: var(--font-mono);
                font-size: 11px;
            }
        </style>

        <div>
            <h1 style="font-size: 24px; font-weight: 700; background: linear-gradient(to right, #fff, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                ${st('title')}
            </h1>
            <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 24px;">${st('desc')}</p>

            <div class="stores-grid" id="stores-container">
                <!-- Loaded dynamically -->
                <div style="grid-column: 1/-1; text-align: center; color: var(--text-secondary); padding: 50px;">
                    <i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 12px;"></i>
                    <p>${state.lang === 'ar' ? 'جاري تحميل المتاجر...' : 'Loading stores...'}</p>
                </div>
            </div>
        </div>

        <!-- Glass Modal Backdrop -->
        <div class="glass-modal-backdrop" id="edit-store-modal-backdrop">
            <div class="glass-modal">
                <div class="modal-header">
                    <div class="modal-title">${st('editStore')}</div>
                    <button class="modal-close" id="modal-close-btn">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label class="form-label">${st('storeName')}</label>
                        <input type="text" id="edit-name" class="form-control" placeholder="Sigma Computer">
                    </div>
                    <div class="form-group">
                        <label class="form-label">${st('website')}</label>
                        <input type="text" id="edit-website" class="form-control" placeholder="https://...">
                    </div>
                    <div class="form-group">
                        <label class="form-label">${st('logoUrl')}</label>
                        <input type="text" id="edit-logo" class="form-control" placeholder="https://...">
                    </div>
                    <div class="form-group">
                        <label class="form-label">${st('priority')} (1 - 10)</label>
                        <input type="number" id="edit-priority" class="form-control" min="1" max="10" placeholder="5">
                    </div>
                    <div class="form-group">
                        <label class="form-label">${st('metadata')}</label>
                        <textarea id="edit-metadata" class="form-control" placeholder='{ "region": "Egypt" }'></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn" id="modal-cancel-btn">${st('cancelBtn')}</button>
                    <button class="btn btn-primary" id="modal-save-btn">${st('saveBtn')}</button>
                </div>
            </div>
        </div>
    `;

    // Modal Events
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
    document.getElementById('modal-cancel-btn').addEventListener('click', closeModal);
    document.getElementById('modal-save-btn').addEventListener('click', saveStoreSettings);

    // Initial Fetch
    await loadStoresData();
}

async function loadStoresData() {
    const grid = document.getElementById('stores-container');
    if (!grid) return;

    try {
        const response = await adminFetch('/api/admin/stores');
        if (!response || !response.stores) return;

        const stores = response.stores;
        let html = '';

        stores.forEach(store => {
            const isEnabled = store.is_enabled !== 0;
            const cardClass = isEnabled ? 'store-card' : 'store-card disabled-store';
            
            // Format status badge
            let statusBadge = '';
            const status = store.last_scrape_status || 'never';
            if (status === 'success') {
                statusBadge = `<span class="badge badge-success">${state.lang === 'ar' ? 'ناجح' : 'Success'}</span>`;
            } else if (status === 'failed') {
                statusBadge = `<span class="badge badge-danger" title="${escapeHtml(store.scrape_error_log || '')}"><i class="fa-solid fa-triangle-exclamation"></i> ${state.lang === 'ar' ? 'فشل' : 'Failed'}</span>`;
            } else if (status === 'empty') {
                statusBadge = `<span class="badge badge-warning">${state.lang === 'ar' ? 'فارغ' : 'Empty'}</span>`;
            } else {
                statusBadge = `<span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-muted);">${state.lang === 'ar' ? 'لم يعمل' : 'Never'}</span>`;
            }

            // Format date
            let scrapeDate = '—';
            if (store.last_scrape_at) {
                const date = new Date(store.last_scrape_at);
                scrapeDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            html += `
                <div class="${cardClass}" data-id="${store.id}">
                    <div class="store-switch-container">
                        <span class="switch-label" style="color: ${isEnabled ? 'var(--success)' : 'var(--text-secondary)'}">
                            ${isEnabled ? st('enabled') : st('disabled')}
                        </span>
                        <label class="toggle-switch">
                            <input type="checkbox" class="toggle-store-chk" data-id="${store.id}" ${isEnabled ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                        </label>
                    </div>

                    <div class="store-header">
                        <div class="store-logo">
                            ${store.logo_url ? `<img src="${store.logo_url}" style="width: 100%; height: 100%; object-fit: contain;">` : '<i class="fa-solid fa-store"></i>'}
                        </div>
                        <div class="store-info">
                            <div class="store-title">${store.name}</div>
                            ${store.website ? `<a href="${store.website}" target="_blank" class="store-link"><i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 8px;"></i> Visit</a>` : ''}
                        </div>
                    </div>

                    <div class="store-stats">
                        <div class="stat-box">
                            <div class="stat-lbl">${st('variantsCount')}</div>
                            <div class="stat-val">${(store.variant_count || 0).toLocaleString()}</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-lbl">${st('offersCount')}</div>
                            <div class="stat-val">${(store.offer_count || 0).toLocaleString()}</div>
                        </div>
                    </div>

                    <div class="store-footer">
                        <div class="diagnostic-info">
                            <div>${st('status')}: ${statusBadge}</div>
                            <div class="diagnostic-time">${st('lastScraped')}: ${scrapeDate}</div>
                        </div>
                        <div>
                            <span class="priority-badge" title="${st('priority')}">P${store.priority}</span>
                            <button class="btn btn-sm edit-store-btn" data-store='${JSON.stringify(store).replace(/'/g, "&apos;")}' style="margin-left: 6px; padding: 4px 8px;">
                                <i class="fa-solid fa-sliders"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;

        // Bind Toggle Events
        grid.querySelectorAll('.toggle-store-chk').forEach(chk => {
            chk.addEventListener('change', async (e) => {
                const id = chk.dataset.id;
                const checked = chk.checked;
                await toggleStoreState(id, checked, chk);
            });
        });

        // Bind Edit Events
        grid.querySelectorAll('.edit-store-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const store = JSON.parse(btn.dataset.store);
                openEditModal(store);
            });
        });

    } catch (err) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; color: var(--danger); padding: 50px;">
                <i class="fa-solid fa-circle-exclamation" style="font-size: 24px; margin-bottom: 12px;"></i>
                <p>Failed to load stores registry data.</p>
                <p style="font-size: 11px; margin-top: 4px;">${err.message}</p>
            </div>
        `;
    }
}

async function toggleStoreState(id, isEnabled, checkbox) {
    try {
        const res = await adminFetch(`/api/admin/stores/${id}/toggle`, {
            method: 'PUT',
            body: { is_enabled: isEnabled }
        });

        if (res.success) {
            showToast(st('successToggle'), 'success');
            // Refresh counts and card styling
            await loadStoresData();
        } else {
            checkbox.checked = !isEnabled; // Revert checkbox
            showToast(st('errorToggle'), 'danger');
        }
    } catch (err) {
        checkbox.checked = !isEnabled; // Revert checkbox
        showToast(err.message, 'danger');
    }
}

function openEditModal(store) {
    activeStoreToEdit = store;
    document.getElementById('edit-name').value = store.name || '';
    document.getElementById('edit-website').value = store.website || '';
    document.getElementById('edit-logo').value = store.logo_url || '';
    document.getElementById('edit-priority').value = store.priority || 5;
    
    let metadataStr = '';
    if (store.metadata) {
        try {
            // Pretty print metadata if valid JSON
            metadataStr = JSON.stringify(JSON.parse(store.metadata), null, 2);
        } catch (e) {
            metadataStr = store.metadata;
        }
    }
    document.getElementById('edit-metadata').value = metadataStr;

    const modal = document.getElementById('edit-store-modal-backdrop');
    modal.classList.add('open');
}

function closeModal() {
    const modal = document.getElementById('edit-store-modal-backdrop');
    modal.classList.remove('open');
    activeStoreToEdit = null;
}

async function saveStoreSettings() {
    if (!activeStoreToEdit) return;

    const name = document.getElementById('edit-name').value.trim();
    const website = document.getElementById('edit-website').value.trim();
    const logoUrl = document.getElementById('edit-logo').value.trim();
    const priority = parseInt(document.getElementById('edit-priority').value, 10);
    const metadataStr = document.getElementById('edit-metadata').value.trim();

    if (!name) {
        showToast('Store name is required', 'danger');
        return;
    }

    if (metadataStr) {
        try {
            JSON.parse(metadataStr);
        } catch (e) {
            showToast(st('invalidJson'), 'danger');
            return;
        }
    }

    const saveBtn = document.getElementById('modal-save-btn');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

    try {
        const res = await adminFetch(`/api/admin/stores/${activeStoreToEdit.id}`, {
            method: 'PUT',
            body: {
                name,
                website,
                logo_url: logoUrl,
                priority,
                metadata: metadataStr ? JSON.stringify(JSON.parse(metadataStr)) : ''
            }
        });

        if (res.success) {
            showToast(st('successUpdate'), 'success');
            closeModal();
            await loadStoresData();
        } else {
            showToast(st('errorUpdate'), 'danger');
        }
    } catch (err) {
        showToast(err.message, 'danger');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

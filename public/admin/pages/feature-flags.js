/**
 * Feature Flags & Dynamic Configurations Page
 * ===========================================
 * Provides a premium interface for toggling feature flags (with header/IP targeting),
 * hot-swapping ranking formulas (with manual Recalculate trigger), and cache eviction.
 */

import { adminFetch, showToast, state } from '../admin.js';

// Localized translation terms
const translations = {
    en: {
        title: "Dynamic Configs & Flags",
        desc: "Staged rollouts, Dynamic IP/Header targeting, Ranking weight tuning, and In-memory cache invalidation tools.",
        tabFlags: "Feature Flags",
        tabFormulas: "Ranking Formulas",
        tabCache: "Cache Manager",
        
        // Feature Flags
        flagKey: "Flag Key",
        flagDesc: "Description",
        flagStatus: "Global Status",
        flagRules: "Targeting Rules",
        active: "Active",
        inactive: "Inactive",
        addFlag: "Create Feature Flag",
        editRules: "Edit Rules",
        deleteFlag: "Delete Flag",
        saveRules: "Save Targeting Rules",
        localOnlyRule: "Allow Localhost / Local loopback requests only",
        headerRule: "Match request HTTP Header",
        headerName: "Header Name",
        headerVal: "Expected Value",
        
        // Ranking Formulas
        formulaVersion: "Version",
        formulaName: "Formula Name",
        formulaWeights: "Tuning Weights",
        formulaActive: "Is Active",
        formulaDesc: "Formula Scope",
        formulaActions: "Actions",
        activateBtn: "Activate Version",
        recalculateBtn: "Recalculate Ranks Now",
        recalcProcessing: "Recalculating scores...",
        addFormula: "New Ranking Formula",
        editWeights: "Edit weights",
        weightPrice: "Price Competitiveness",
        weightDiscount: "Discount Strength",
        weightStores: "Store Coverage",
        weightPop: "Popularity / Telemetry",
        weightSpec: "Specifications Rating",
        sumWeights: "Total Weight Sum",

        // Cache Manager
        cacheStats: "Cache Telemetry stats",
        totalKeys: "Total keys cached",
        activeKeys: "Active entries",
        expiredKeys: "Expired entries",
        cacheKeysRegistry: "Cache Keys Registry",
        searchKeys: "Search cached keys...",
        evictKey: "Evict",
        flushPattern: "Invalidate Pattern",
        clearCache: "Clear Cache entirely",
        regexLabel: "Regex Pattern (e.g. ^prod: or ^cat:)",
        emptyCache: "No active entries in memory cache.",
        
        // System Feedback
        confirmDeleteFlag: "Are you sure you want to delete this feature flag? This action is permanent.",
        confirmDeleteFormula: "Are you sure you want to delete this ranking version configuration?",
        confirmClearCache: "Are you sure you want to clear the entire memory cache?",
        restrictedSuperAdmin: "Restricted to Super Administrators",
        successSave: "Configuration saved successfully.",
        successDelete: "Configuration deleted successfully.",
        successRecalc: "Ranking scores recalculation enqueued successfully.",
        successCacheCleared: "Memory cache cleared successfully.",
        successEvict: "Cache entry evicted successfully."
    },
    ar: {
        title: "التكوين الديناميكي وأعلام الميزات",
        desc: "النشاط التدريجي، استهداف العناوين/المتصفح الديناميكي، تعديل أوزان الترتيب، وإدارة إفراغ الذاكرة المؤقتة.",
        tabFlags: "أعلام الميزات",
        tabFormulas: "معادلات الترتيب",
        tabCache: "إدارة الكاش",
        
        // Feature Flags
        flagKey: "مفتاح الميزة",
        flagDesc: "الوصف",
        flagStatus: "الحالة العامة",
        flagRules: "قواعد الاستهداف",
        active: "نشط",
        inactive: "غير نشط",
        addFlag: "إنشاء علم ميزة جديد",
        editRules: "تعديل قواعد الاستهداف",
        deleteFlag: "حذف الميزة",
        saveRules: "حفظ القواعد",
        localOnlyRule: "السماح لطلبات المضيف المحلي (Localhost) فقط",
        headerRule: "مطابقة عنوان طلب HTTP",
        headerName: "اسم ترويسة الطلب (Header)",
        headerVal: "القيمة المتوقعة",
        
        // Ranking Formulas
        formulaVersion: "الإصدار",
        formulaName: "اسم المعادلة",
        formulaWeights: "أوزان التعديل",
        formulaActive: "نشط حالياً",
        formulaDesc: "نطاق المعادلة",
        formulaActions: "الإجراءات",
        activateBtn: "تفعيل هذا الإصدار",
        recalculateBtn: "إعادة حساب الترتيب الآن",
        recalcProcessing: "جاري إعادة حساب الترتيب...",
        addFormula: "معادلة ترتيب جديدة",
        editWeights: "تعديل الأوزان",
        weightPrice: "تنافسية الأسعار",
        weightDiscount: "نسبة الخصم",
        weightStores: "تغطية المتاجر",
        weightPop: "التفاعل والشهرة",
        weightSpec: "تقييم المواصفات",
        sumWeights: "مجموع الأوزان",

        // Cache Manager
        cacheStats: "إحصائيات الذاكرة المؤقتة",
        totalKeys: "مجموع الكاش المخزن",
        activeKeys: "السجلات النشطة",
        expiredKeys: "السجلات منتهية الصلاحية",
        cacheKeysRegistry: "سجل مفاتيح الكاش (Cache Keys)",
        searchKeys: "ابحث في مفاتيح الكاش...",
        evictKey: "إزالة",
        flushPattern: "إفراغ نمط محدد",
        clearCache: "مسح الكاش بالكامل",
        regexLabel: "تعبيرات نمطية Regex (مثال: ^prod: أو ^cat:)",
        emptyCache: "لا توجد سجلات حالية في الذاكرة المؤقتة.",
        
        // System Feedback
        confirmDeleteFlag: "هل أنت متأكد من رغبتك في حذف علم الميزة هذا؟ هذا الإجراء نهائي.",
        confirmDeleteFormula: "هل أنت متأكد من رغبتك في حذف إعدادات إصدار الترتيب هذا؟",
        confirmClearCache: "هل أنت متأكد من مسح جميع بيانات الذاكرة المؤقتة؟",
        restrictedSuperAdmin: "مقتصر على المشرفين الرئيسيين (Super Admin)",
        successSave: "تم حفظ الإعدادات بنجاح.",
        successDelete: "تم حذف الإعدادات بنجاح.",
        successRecalc: "تم إدراج مهمة إعادة حساب الترتيب في الخلفية بنجاح.",
        successCacheCleared: "تم تفريغ الذاكرة المؤقتة بالكامل بنجاح.",
        successEvict: "تمت إزالة مفتاح الكاش بنجاح."
    }
};

function st(key) {
    const lang = state.lang || 'en';
    return (translations[lang] && translations[lang][key]) || translations.en[key] || key;
}

let activeTab = 'flags'; // 'flags' | 'formulas' | 'cache'

export async function render(container) {
    container.innerHTML = `
        <style>
            .config-tabs {
                display: flex;
                gap: 8px;
                margin-top: 20px;
                margin-bottom: 24px;
                border-bottom: 1px solid var(--border-base);
                padding-bottom: 1px;
            }
            .config-tab-btn {
                background: none;
                border: none;
                border-bottom: 2px solid transparent;
                padding: 10px 18px;
                color: var(--text-secondary);
                font-weight: 600;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .config-tab-btn:hover {
                color: var(--text-primary);
            }
            .config-tab-btn.active {
                color: var(--primary);
                border-bottom-color: var(--primary);
            }
            .panel-wrapper {
                min-height: 350px;
            }
            .grid-config {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
            }
            @media(max-width: 900px) {
                .grid-config {
                    grid-template-columns: 1fr;
                }
            }
            .slider-group {
                background: rgba(255, 255, 255, 0.01);
                border: 1px solid rgba(255, 255, 255, 0.04);
                border-radius: var(--radius-sm);
                padding: 12px;
                margin-bottom: 10px;
            }
            .slider-header {
                display: flex;
                justify-content: space-between;
                font-size: 12px;
                font-weight: 600;
                margin-bottom: 6px;
            }
            .slider-header span.pct {
                color: var(--primary-light);
            }
            .rule-card {
                background: rgba(0, 0, 0, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: var(--radius-sm);
                padding: 10px 14px;
                font-size: 12px;
                margin-top: 8px;
            }
            .flag-card {
                transition: transform 0.2s ease, border-color 0.2s ease;
            }
            .flag-card:hover {
                border-color: rgba(255, 255, 255, 0.15);
                transform: translateY(-2px);
            }
            .cache-grid {
                display: grid;
                grid-template-columns: 1fr 2fr;
                gap: 24px;
            }
            @media(max-width: 900px) {
                .cache-grid {
                    grid-template-columns: 1fr;
                }
            }
        </style>

        <div>
            <h1 style="font-size: 24px; font-weight: 700; background: linear-gradient(to right, #fff, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                ${st('title')}
            </h1>
            <p style="font-size: 13px; color: var(--text-secondary);">${st('desc')}</p>

            <div class="config-tabs">
                <button class="config-tab-btn ${activeTab === 'flags' ? 'active' : ''}" data-tab="flags">
                    <i class="fa-solid fa-flag"></i> ${st('tabFlags')}
                </button>
                <button class="config-tab-btn ${activeTab === 'formulas' ? 'active' : ''}" data-tab="formulas">
                    <i class="fa-solid fa-scale-balanced"></i> ${st('tabFormulas')}
                </button>
                <button class="config-tab-btn ${activeTab === 'cache' ? 'active' : ''}" data-tab="cache">
                    <i class="fa-solid fa-server"></i> ${st('tabCache')}
                </button>
            </div>

            <div class="panel-wrapper" id="tab-panel-container">
                <!-- Live Panel injection -->
            </div>
        </div>

        <!-- Modals and Overlay placeholders -->
        <div id="config-modal-outlet"></div>
    `;

    // Bind tab clicks
    container.querySelectorAll('.config-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            activeTab = btn.dataset.tab;
            container.querySelectorAll('.config-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderActiveTabPanel();
        });
    });

    // Render initial active tab
    await renderActiveTabPanel();
}

async function renderActiveTabPanel() {
    const container = document.getElementById('tab-panel-container');
    if (!container) return;

    container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>`;

    try {
        if (activeTab === 'flags') {
            await renderFlagsTab(container);
        } else if (activeTab === 'formulas') {
            await renderFormulasTab(container);
        } else if (activeTab === 'cache') {
            await renderCacheTab(container);
        }
    } catch (err) {
        container.innerHTML = `
            <div class="card" style="text-align: center; padding: 40px; color: var(--danger);">
                <i class="fa-solid fa-circle-exclamation fa-2x"></i>
                <p style="margin-top: 12px;">Failed to load panel data: ${err.message}</p>
            </div>
        `;
    }
}

// ═══════════════════════════════════════════════════
// FEATURE FLAGS TAB
// ═══════════════════════════════════════════════════

async function renderFlagsTab(container) {
    const res = await adminFetch('/api/admin/feature-flags');
    const flags = res.flags || [];

    const isSuperAdmin = state.user && state.user.role === 'super_admin';

    container.innerHTML = `
        <div style="margin-bottom: 16px; display: flex; justify-content: flex-end;">
            <button id="add-flag-btn" class="btn btn-primary btn-sm">
                <i class="fa-solid fa-plus"></i> ${st('addFlag')}
            </button>
        </div>
        <div class="grid-config" style="grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));">
            ${flags.map(f => {
                const isEnabled = f.is_enabled === 1;
                const rules = JSON.parse(f.rules_json || '{}');
                let ruleDesc = "None (Global)";
                if (rules.allowLocalOnly) {
                    ruleDesc = "Localhost Only";
                } else if (rules.headerName && rules.headerValue) {
                    ruleDesc = `Header Match: ${rules.headerName} = "${rules.headerValue}"`;
                }

                return `
                    <div class="card flag-card" style="display: flex; flex-direction: column; justify-content: space-between;">
                        <div>
                            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                                <span style="font-family: var(--font-mono); font-size: 13px; font-weight: 700; color: var(--primary-light);">
                                    ${f.key}
                                </span>
                                <div class="form-check form-switch">
                                    <input class="form-check-input flag-toggle-switch" type="checkbox" data-key="${f.key}" ${isEnabled ? 'checked' : ''}>
                                </div>
                            </div>
                            <p style="font-size: 12px; color: var(--text-secondary); min-height: 36px; margin-bottom: 12px;">
                                ${f.description || 'No description provided.'}
                            </p>
                            <div class="rule-card">
                                <strong style="color: var(--text-primary);"><i class="fa-solid fa-filter"></i> Rules:</strong> ${ruleDesc}
                            </div>
                        </div>
                        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;">
                            <button class="btn btn-sm edit-rules-btn" data-key="${f.key}">
                                <i class="fa-solid fa-sliders"></i> ${st('editRules')}
                            </button>
                            <button class="btn btn-sm btn-danger delete-flag-btn" data-key="${f.key}" ${!isSuperAdmin ? 'disabled title="' + st('restrictedSuperAdmin') + '" style="opacity: 0.5; pointer-events: none;"' : ''}>
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    // Bind toggles
    container.querySelectorAll('.flag-toggle-switch').forEach(sw => {
        sw.addEventListener('change', async () => {
            const key = sw.dataset.key;
            const checked = sw.checked;
            // Get original rules
            const originalFlag = flags.find(f => f.key === key);
            const originalRules = JSON.parse(originalFlag ? originalFlag.rules_json : '{}');
            
            try {
                await adminFetch(`/api/admin/feature-flags/${key}`, {
                    method: 'PUT',
                    body: {
                        is_enabled: checked,
                        rules: originalRules
                    }
                });
                showToast(st('successSave'), 'success');
            } catch (err) {
                sw.checked = !checked; // revert
                showToast(err.message, 'danger');
            }
        });
    });

    // Bind Edit Rules button
    container.querySelectorAll('.edit-rules-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.key;
            const flag = flags.find(f => f.key === key);
            openRulesModal(flag);
        });
    });

    // Bind Delete flag button
    container.querySelectorAll('.delete-flag-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.key;
            deleteFeatureFlag(key);
        });
    });

    // Bind Add flag button
    document.getElementById('add-flag-btn').addEventListener('click', openAddFlagModal);
}

function openRulesModal(flag) {
    const modalOutlet = document.getElementById('config-modal-outlet');
    const rules = JSON.parse(flag.rules_json || '{}');

    modalOutlet.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal" style="max-width: 500px; display: block;">
            <div class="modal-header">
                <h3>${st('editRules')}: ${flag.key}</h3>
                <button class="modal-close-x"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="rule-local-only" ${rules.allowLocalOnly ? 'checked' : ''} style="width: 16px; height: 16px; margin: 0;">
                        <label for="rule-local-only" class="form-label" style="margin: 0; cursor: pointer;">${st('localOnlyRule')}</label>
                    </div>
                </div>

                <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.08); margin: 16px 0;">

                <h4>${st('headerRule')}</h4>
                <div class="form-group" style="margin-top: 8px;">
                    <label class="form-label">${st('headerName')}</label>
                    <input type="text" id="rule-header-name" class="form-control" placeholder="e.g. x-enable-beta" value="${rules.headerName || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">${st('headerVal')}</label>
                    <input type="text" id="rule-header-value" class="form-control" placeholder="e.g. true" value="${rules.headerValue || ''}">
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary modal-close-btn">Cancel</button>
                <button class="btn btn-primary" id="save-rules-btn">${st('saveRules')}</button>
            </div>
        </div>
    `;

    const closeModal = () => modalOutlet.innerHTML = '';
    modalOutlet.querySelector('.modal-close-x').addEventListener('click', closeModal);
    modalOutlet.querySelector('.modal-close-btn').addEventListener('click', closeModal);

    modalOutlet.querySelector('#save-rules-btn').addEventListener('click', async () => {
        const allowLocalOnly = modalOutlet.querySelector('#rule-local-only').checked;
        const headerName = modalOutlet.querySelector('#rule-header-name').value.trim();
        const headerValue = modalOutlet.querySelector('#rule-header-value').value.trim();

        const newRules = {};
        if (allowLocalOnly) newRules.allowLocalOnly = true;
        if (headerName && headerValue) {
            newRules.headerName = headerName;
            newRules.headerValue = headerValue;
        }

        try {
            await adminFetch(`/api/admin/feature-flags/${flag.key}`, {
                method: 'PUT',
                body: {
                    is_enabled: flag.is_enabled === 1,
                    rules: newRules
                }
            });
            showToast(st('successSave'), 'success');
            closeModal();
            await renderActiveTabPanel();
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });
}

function openAddFlagModal() {
    const modalOutlet = document.getElementById('config-modal-outlet');
    modalOutlet.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal" style="max-width: 500px; display: block;">
            <div class="modal-header">
                <h3>${st('addFlag')}</h3>
                <button class="modal-close-x"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">${st('flagKey')}</label>
                    <input type="text" id="new-flag-key" class="form-control" placeholder="e.g. enable_beta_filters" required>
                </div>
                <div class="form-group">
                    <label class="form-label">${st('flagDesc')}</label>
                    <textarea id="new-flag-desc" class="form-control" rows="3" placeholder="Explain the purpose of this flag..."></textarea>
                </div>
                <div class="form-group">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <input type="checkbox" id="new-flag-enabled" style="width: 16px; height: 16px; margin: 0;">
                        <label for="new-flag-enabled" class="form-label" style="margin: 0; cursor: pointer;">Enable Globally on Creation</label>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary modal-close-btn">Cancel</button>
                <button class="btn btn-primary" id="create-flag-btn">Create</button>
            </div>
        </div>
    `;

    const closeModal = () => modalOutlet.innerHTML = '';
    modalOutlet.querySelector('.modal-close-x').addEventListener('click', closeModal);
    modalOutlet.querySelector('.modal-close-btn').addEventListener('click', closeModal);

    modalOutlet.querySelector('#create-flag-btn').addEventListener('click', async () => {
        const key = modalOutlet.querySelector('#new-flag-key').value.trim();
        const description = modalOutlet.querySelector('#new-flag-desc').value.trim();
        const isEnabled = modalOutlet.querySelector('#new-flag-enabled').checked;

        if (!key) {
            showToast('Flag key is required', 'danger');
            return;
        }

        try {
            await adminFetch('/api/admin/feature-flags', {
                method: 'POST',
                body: { key, description, isEnabled, rules: {} }
            });
            showToast(st('successSave'), 'success');
            closeModal();
            await renderActiveTabPanel();
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });
}

async function deleteFeatureFlag(key) {
    if (!confirm(st('confirmDeleteFlag'))) return;

    try {
        await adminFetch(`/api/admin/feature-flags/${key}`, { method: 'DELETE' });
        showToast(st('successDelete'), 'success');
        await renderActiveTabPanel();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

// ═══════════════════════════════════════════════════
// RANKING FORMULAS TAB
// ═══════════════════════════════════════════════════

async function renderFormulasTab(container) {
    const res = await adminFetch('/api/admin/ranking-formulas');
    const formulas = res.formulas || [];

    const isSuperAdmin = state.user && state.user.role === 'super_admin';

    container.innerHTML = `
        <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <button id="recalc-ranks-btn" class="btn btn-warning">
                <i class="fa-solid fa-calculator"></i> <span>${st('recalculateBtn')}</span>
            </button>
            <button id="add-formula-btn" class="btn btn-primary btn-sm">
                <i class="fa-solid fa-plus"></i> ${st('addFormula')}
            </button>
        </div>

        <div class="grid-config" style="grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));">
            ${formulas.map(form => {
                const isActive = form.is_active === 1;
                const w = form.weights || {};

                return `
                    <div class="card" style="border: ${isActive ? '2px solid var(--success)' : '1px solid var(--border-base)'}; display: flex; flex-direction: column; justify-content: space-between; position: relative;">
                        ${isActive ? `<span style="position: absolute; top: -10px; right: 12px; background: var(--success); color: #000; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 4px;">ACTIVE</span>` : ''}
                        <div>
                            <div style="font-family: var(--font-mono); font-size: 14px; font-weight: 700; color: #fff; margin-bottom: 4px;">
                                ${form.version_id} — ${form.formula_name}
                            </div>
                            <p style="font-size: 11px; color: var(--text-secondary); margin-bottom: 14px; line-height: 1.3;">
                                ${form.description || 'No description.'}
                            </p>

                            <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px;">
                                ${renderWeightBar(st('weightPrice'), w.price)}
                                ${renderWeightBar(st('weightDiscount'), w.discount)}
                                ${renderWeightBar(st('weightStores'), w.stores)}
                                ${renderWeightBar(st('weightPop'), w.pop)}
                                ${renderWeightBar(st('weightSpec'), w.spec)}
                            </div>
                        </div>

                        <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;">
                            <button class="btn btn-sm edit-weights-btn" data-id="${form.version_id}">
                                <i class="fa-solid fa-pen-to-square"></i> ${st('editWeights')}
                            </button>
                            ${!isActive ? `
                                <button class="btn btn-sm btn-success activate-formula-btn" data-id="${form.version_id}">
                                    <i class="fa-solid fa-check"></i> ${st('activateBtn')}
                                </button>
                                <button class="btn btn-sm btn-danger delete-formula-btn" data-id="${form.version_id}" ${!isSuperAdmin ? 'disabled title="' + st('restrictedSuperAdmin') + '" style="opacity: 0.5; pointer-events: none;"' : ''}>
                                    <i class="fa-solid fa-trash-can"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    function renderWeightBar(label, val = 0) {
        const percent = Math.round(val * 100);
        return `
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 11px;">
                <span style="color: var(--text-secondary);">${label}</span>
                <span style="font-family: var(--font-mono); font-weight: 600; color: #fff;">${percent}%</span>
            </div>
            <div style="width: 100%; height: 5px; background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden; margin-top: 2px;">
                <div style="width: ${percent}%; height: 100%; background: linear-gradient(to right, var(--primary), var(--primary-light)); border-radius: 3px;"></div>
            </div>
        `;
    }

    // Bind triggers
    container.querySelectorAll('.activate-formula-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            try {
                await adminFetch(`/api/admin/ranking-formulas/${id}/activate`, { method: 'PUT' });
                showToast(st('successSave'), 'success');
                await renderActiveTabPanel();
            } catch (err) {
                showToast(err.message, 'danger');
            }
        });
    });

    container.querySelectorAll('.delete-formula-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            if (!confirm(st('confirmDeleteFormula'))) return;
            try {
                await adminFetch(`/api/admin/ranking-formulas/${id}`, { method: 'DELETE' });
                showToast(st('successDelete'), 'success');
                await renderActiveTabPanel();
            } catch (err) {
                showToast(err.message, 'danger');
            }
        });
    });

    container.querySelectorAll('.edit-weights-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const formula = formulas.find(f => f.version_id === id);
            openFormulaModal(formula);
        });
    });

    document.getElementById('add-formula-btn').addEventListener('click', () => openFormulaModal());
    document.getElementById('recalc-ranks-btn').addEventListener('click', triggerRecalculate);
}

function openFormulaModal(formula = null) {
    const isEdit = !!formula;
    const weights = formula ? formula.weights : { price: 0.25, discount: 0.20, stores: 0.15, pop: 0.20, spec: 0.20 };

    const modalOutlet = document.getElementById('config-modal-outlet');
    modalOutlet.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal" style="max-width: 500px; display: block;">
            <div class="modal-header">
                <h3>${isEdit ? 'Modify weights' : st('addFormula')}</h3>
                <button class="modal-close-x"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">${st('formulaVersion')} ID</label>
                    <input type="text" id="form-version-id" class="form-control" placeholder="e.g. v3" value="${formula ? formula.version_id : ''}" ${isEdit ? 'disabled' : 'required'}>
                </div>
                <div class="form-group">
                    <label class="form-label">${st('formulaName')}</label>
                    <input type="text" id="form-name" class="form-control" placeholder="e.g. component_premium" value="${formula ? formula.formula_name : ''}" required>
                </div>
                <div class="form-group">
                    <label class="form-label">${st('flagDesc')}</label>
                    <input type="text" id="form-desc" class="form-control" placeholder="Context or goal..." value="${formula ? formula.description : ''}">
                </div>

                <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.08); margin: 16px 0;">

                <h4>Weights Allocation</h4>
                <p style="font-size: 11px; color: var(--text-secondary); margin-bottom: 12px;">Ensure these coefficients map priorities (values 0.0 to 1.0).</p>

                ${renderSliderInput('price', st('weightPrice'), weights.price)}
                ${renderSliderInput('discount', st('weightDiscount'), weights.discount)}
                ${renderSliderInput('stores', st('weightStores'), weights.stores)}
                ${renderSliderInput('pop', st('weightPop'), weights.pop)}
                ${renderSliderInput('spec', st('weightSpec'), weights.spec)}

                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px; padding: 10px; background: rgba(0,0,0,0.2); border-radius: 4px;">
                    <span style="font-size: 12px; font-weight: 600;">${st('sumWeights')}</span>
                    <span id="weight-total-label" style="font-family: var(--font-mono); font-weight: 700; color: var(--success);">100%</span>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary modal-close-btn">Cancel</button>
                <button class="btn btn-primary" id="save-formula-btn">Save Formula</button>
            </div>
        </div>
    `;

    function renderSliderInput(key, label, val = 0.2) {
        return `
            <div class="slider-group">
                <div class="slider-header">
                    <span>${label}</span>
                    <span class="pct" id="val-label-${key}">${Math.round(val * 100)}%</span>
                </div>
                <input type="range" class="form-range weight-slider" data-key="${key}" min="0" max="1" step="0.01" value="${val}" style="width: 100%; accent-color: var(--primary);">
            </div>
        `;
    }

    const closeModal = () => modalOutlet.innerHTML = '';
    modalOutlet.querySelector('.modal-close-x').addEventListener('click', closeModal);
    modalOutlet.querySelector('.modal-close-btn').addEventListener('click', closeModal);

    const updateSlidersTotal = () => {
        let sum = 0;
        modalOutlet.querySelectorAll('.weight-slider').forEach(sl => {
            sum += parseFloat(sl.value);
        });
        const label = modalOutlet.querySelector('#weight-total-label');
        const pctSum = Math.round(sum * 100);
        label.textContent = `${pctSum}%`;
        if (Math.abs(sum - 1.0) < 0.005) {
            label.style.color = 'var(--success)';
        } else {
            label.style.color = 'var(--warning)';
        }
    };

    modalOutlet.querySelectorAll('.weight-slider').forEach(sl => {
        sl.addEventListener('input', () => {
            const key = sl.dataset.key;
            modalOutlet.querySelector(`#val-label-${key}`).textContent = `${Math.round(sl.value * 100)}%`;
            updateSlidersTotal();
        });
    });

    updateSlidersTotal();

    modalOutlet.querySelector('#save-formula-btn').addEventListener('click', async () => {
        const version_id = modalOutlet.querySelector('#form-version-id').value.trim();
        const formula_name = modalOutlet.querySelector('#form-name').value.trim();
        const description = modalOutlet.querySelector('#form-desc').value.trim();

        if (!version_id || !formula_name) {
            showToast('Version ID and Formula Name are required', 'danger');
            return;
        }

        const weightsObj = {};
        modalOutlet.querySelectorAll('.weight-slider').forEach(sl => {
            weightsObj[sl.dataset.key] = parseFloat(sl.value);
        });

        try {
            await adminFetch('/api/admin/ranking-formulas', {
                method: 'POST',
                body: { version_id, formula_name, description, weights: weightsObj }
            });
            showToast(st('successSave'), 'success');
            closeModal();
            await renderActiveTabPanel();
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });
}

async function triggerRecalculate() {
    const btn = document.getElementById('recalc-ranks-btn');
    if (!btn) return;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${st('recalcProcessing')}`;

    try {
        await adminFetch('/api/admin/recalculate-ranks', { method: 'POST' });
        showToast(st('successRecalc'), 'success');
    } catch (err) {
        showToast(err.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ═══════════════════════════════════════════════════
// CACHE MANAGER TAB
// ═══════════════════════════════════════════════════

async function renderCacheTab(container) {
    const res = await adminFetch('/api/admin/cache');
    const stats = res.stats || { totalEntries: 0, activeKeys: 0, expiredKeys: 0 };
    const keys = res.keys || [];

    container.innerHTML = `
        <div class="cache-grid">
            <!-- Left Pane: Stats & Invalidation Commands -->
            <div style="display: flex; flex-direction: column; gap: 20px;">
                <!-- Telemetry Stats Card -->
                <div class="card">
                    <div class="card-header">
                        <div class="card-title"><i class="fa-solid fa-microchip"></i> ${st('cacheStats')}</div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 8px;">
                        <div style="display: flex; justify-content: space-between; font-size: 13px;">
                            <span style="color: var(--text-secondary);">${st('totalKeys')}</span>
                            <strong style="color:#fff;">${stats.totalEntries}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 13px;">
                            <span style="color: var(--text-secondary);">${st('activeKeys')}</span>
                            <strong style="color: var(--success);">${stats.activeKeys}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 13px;">
                            <span style="color: var(--text-secondary);">${st('expiredKeys')}</span>
                            <strong style="color: var(--warning);">${stats.expiredKeys}</strong>
                        </div>
                    </div>
                </div>

                <!-- Eviction Tools Card -->
                <div class="card">
                    <div class="card-header">
                        <div class="card-title"><i class="fa-solid fa-broom"></i> Eviction Controls</div>
                    </div>
                    
                    <div class="form-group" style="margin-top: 10px;">
                        <label class="form-label">${st('regexLabel')}</label>
                        <input type="text" id="cache-pattern-input" class="form-control" placeholder="e.g. ^prod:.*">
                    </div>
                    
                    <button id="flush-pattern-btn" class="btn" style="width: 100%; margin-bottom: 14px;">
                        <i class="fa-solid fa-fire"></i> ${st('flushPattern')}
                    </button>
                    
                    <button id="clear-cache-entirely-btn" class="btn btn-danger" style="width: 100%;">
                        <i class="fa-solid fa-trash-can"></i> ${st('clearCache')}
                    </button>
                </div>
            </div>

            <!-- Right Pane: Active Keys Registry Table -->
            <div class="card">
                <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <div class="card-title"><i class="fa-solid fa-list-ul"></i> ${st('cacheKeysRegistry')}</div>
                </div>
                <div style="margin-bottom: 12px;">
                    <input type="text" id="cache-registry-search" class="form-control" placeholder="${st('searchKeys')}">
                </div>
                <div class="table-wrapper" style="max-height: 380px; overflow-y: auto;">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Key</th>
                                <th style="width: 90px; text-align: center;">TTL (s)</th>
                                <th style="width: 80px; text-align: center;">Size</th>
                                <th style="width: 80px; text-align: center;">Action</th>
                            </tr>
                        </thead>
                        <tbody id="cache-keys-tbody">
                            ${keys.length === 0 ? `
                                <tr>
                                    <td colspan="4" style="text-align: center; color: var(--text-secondary); padding: 30px;">
                                        ${st('emptyCache')}
                                    </td>
                                </tr>
                            ` : keys.map(k => `
                                <tr class="cache-row-item" data-key="${k.key}">
                                    <td style="font-family: var(--font-mono); font-size: 11px; font-weight: 600; color: #fff; word-break: break-all;">
                                        ${k.key}
                                    </td>
                                    <td style="text-align: center; font-family: var(--font-mono); font-size: 11px; color: var(--primary-light);">
                                        ${k.expiresInSeconds}s
                                    </td>
                                    <td style="text-align: center; font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary);">
                                        ${formatBytes(k.sizeBytes)}
                                    </td>
                                    <td style="text-align: center;">
                                        <button class="btn btn-sm btn-danger evict-single-key-btn" data-key="${k.key}" style="padding: 2px 6px; font-size: 10px;">
                                            ${st('evictKey')}
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // Bind Registry Search
    const searchInput = document.getElementById('cache-registry-search');
    const tbody = document.getElementById('cache-keys-tbody');
    if (searchInput && tbody) {
        searchInput.addEventListener('input', () => {
            const query = searchInput.value.toLowerCase().trim();
            tbody.querySelectorAll('.cache-row-item').forEach(row => {
                const key = row.dataset.key.toLowerCase();
                if (key.includes(query)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }

    // Bind Individual Eviction
    container.querySelectorAll('.evict-single-key-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const key = btn.dataset.key;
            try {
                await adminFetch('/api/admin/cache', {
                    method: 'DELETE',
                    body: { key }
                });
                showToast(st('successEvict'), 'success');
                await renderActiveTabPanel();
            } catch (err) {
                showToast(err.message, 'danger');
            }
        });
    });

    // Bind Flush Pattern
    document.getElementById('flush-pattern-btn').addEventListener('click', async () => {
        const input = document.getElementById('cache-pattern-input');
        const pattern = input.value.trim();
        if (!pattern) {
            showToast('Pattern regex is required', 'danger');
            return;
        }

        try {
            const res = await adminFetch('/api/admin/cache', {
                method: 'DELETE',
                body: { pattern }
            });
            showToast(res.message, 'success');
            input.value = '';
            await renderActiveTabPanel();
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });

    // Bind Clear All Cache
    document.getElementById('clear-cache-entirely-btn').addEventListener('click', async () => {
        if (!confirm(st('confirmClearCache'))) return;

        try {
            const res = await adminFetch('/api/admin/cache', {
                method: 'DELETE',
                body: { all: true }
            });
            showToast(res.message, 'success');
            await renderActiveTabPanel();
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });
}

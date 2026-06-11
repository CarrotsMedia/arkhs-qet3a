/**
 * Product Details & Editor Page (Phase 4 Component)
 * =================================================
 * Provides full tabbed inspection, basic info edits, specs/attributes management,
 * store offers, ranking overrides, and price history chart integration.
 */

import { adminFetch, showToast, state, t, navigate } from '../admin.js';

let productData = null;
let attributeDefs = [];
let brands = [];
let categories = [];
let subcategories = [];
let activeTab = 'basic-info';

const isViewer = () => state.user?.role === 'viewer';
const isEditor = () => state.user?.role === 'editor' || state.user?.role === 'super_admin';

/**
 * Render detail view for a specific product ID
 */
export async function render(container, productId) {
    const isRtl = state.lang === 'ar';
    
    // Show spinner while loading
    container.innerHTML = `
        <div style="text-align: center; padding: 100px;">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 32px; color: var(--primary); margin-bottom: 12px;"></i>
            <div>${isRtl ? 'جاري تحميل تفاصيل المنتج...' : 'Loading product details...'}</div>
        </div>
    `;

    try {
        // Load product details
        const res = await adminFetch(`/api/admin/products/${productId}`);
        if (!res.success || !res.product) {
            throw new Error(res.message || (isRtl ? 'تعذر العثور على المنتج' : 'Product not found'));
        }
        productData = res.product;

        // Load brands, categories, and attribute definitions for subcategory
        const [brandsRes, categoriesRes, attrsRes] = await Promise.all([
            adminFetch('/api/admin/brands'),
            adminFetch('/api/admin/categories'),
            adminFetch(`/api/admin/products/attributes/${productData.subcategory_id}`)
        ]);

        if (brandsRes.success) brands = brandsRes.brands || [];
        if (categoriesRes.success) categories = categoriesRes.categories || [];
        if (attrsRes.success) attributeDefs = attrsRes.attributes || [];

        // If category is selected, pre-load subcategories list for selection dropdown
        if (productData.category_id) {
            const subcatRes = await adminFetch(`/api/admin/categories/${productData.category_id}/subcategories`);
            if (subcatRes.success) subcategories = subcatRes.subcategories || [];
        }

        renderLayout(container);
        setupTabs();
        setupFormEvents();
        renderPriceHistoryChart();
    } catch (err) {
        showToast(err.message, 'danger');
        container.innerHTML = `
            <div class="card" style="text-align: center; padding: 40px; border-color: var(--danger);">
                <i class="fa-solid fa-triangle-exclamation" style="font-size: 40px; color: var(--danger); margin-bottom: 16px;"></i>
                <h2>${isRtl ? 'فشل تحميل المنتج' : 'Failed to load product details'}</h2>
                <p style="color: var(--text-secondary); margin-top: 8px;">${err.message}</p>
                <div style="margin-top: 24px;">
                    <a href="#/products" class="btn"><i class="fa-solid fa-arrow-left"></i> ${isRtl ? 'العودة للمنتجات' : 'Back to Products'}</a>
                </div>
            </div>
        `;
    }
}

/**
 * Render details page structural layout
 */
function renderLayout(container) {
    const isRtl = state.lang === 'ar';
    const p = productData;
    
    // Status flags
    const isSoftDeleted = p.is_deleted === 1 || p.is_deleted === true;
    const isFeatured = p.is_featured === 1 || p.is_featured === true;
    const isTrending = p.is_trending === 1 || p.is_trending === true;
    
    container.innerHTML = `
        <style>
            .detail-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 16px;
                margin-bottom: 24px;
            }
            .header-info-group {
                display: flex;
                align-items: center;
                gap: 16px;
            }
            .header-img-wrapper {
                width: 60px;
                height: 60px;
                border-radius: var(--radius-md);
                border: 1px solid var(--border-bright);
                background: rgba(255,255,255,0.03);
                overflow: hidden;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .header-img-wrapper img {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            .header-names {
                display: flex;
                flex-direction: column;
                gap: 2px;
            }
            .header-title-en {
                font-size: 20px;
                font-weight: 700;
                color: var(--text-primary);
            }
            .header-title-ar {
                font-size: 15px;
                color: var(--text-secondary);
                font-family: 'Noto Kufi Arabic', sans-serif;
            }
            .tabs-nav {
                display: flex;
                gap: 8px;
                border-bottom: 1px solid var(--border-base);
                margin-bottom: 24px;
                overflow-x: auto;
            }
            .tab-btn {
                background: none;
                border: none;
                border-bottom: 2px solid transparent;
                color: var(--text-secondary);
                padding: 10px 18px;
                cursor: pointer;
                font-family: var(--font-main);
                font-size: 14px;
                font-weight: 600;
                transition: all var(--transition-fast);
                white-space: nowrap;
            }
            .tab-btn:hover {
                color: var(--text-primary);
            }
            .tab-btn.active {
                color: var(--primary-light);
                border-bottom-color: var(--primary);
            }
            .tab-pane {
                display: none;
            }
            .tab-pane.active {
                display: block;
                animation: tabFade 0.25s ease-out forwards;
            }
            @keyframes tabFade {
                from { opacity: 0; transform: translateY(4px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .grid-form-cols {
                display: grid;
                grid-template-columns: 2fr 1fr;
                gap: 24px;
            }
            @media (max-width: 900px) {
                .grid-form-cols {
                    grid-template-columns: 1fr;
                }
            }
            .form-grid-inner {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px;
            }
            @media (max-width: 600px) {
                .form-grid-inner {
                    grid-template-columns: 1fr;
                }
            }
            .switch-container {
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: rgba(255,255,255,0.02);
                border: 1px solid var(--border-base);
                border-radius: var(--radius-md);
                padding: 12px 16px;
            }
            .switch {
                position: relative;
                display: inline-block;
                width: 44px;
                height: 24px;
            }
            .switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .slider {
                position: absolute;
                cursor: pointer;
                inset: 0;
                background-color: rgba(255,255,255,0.1);
                transition: .2s;
                border-radius: 24px;
                border: 1px solid var(--border-base);
            }
            .slider:before {
                position: absolute;
                content: "";
                height: 16px;
                width: 16px;
                left: 3px;
                bottom: 3px;
                background-color: var(--text-secondary);
                transition: .2s;
                border-radius: 50%;
            }
            input:checked + .slider {
                background-color: var(--primary);
                border-color: var(--primary-light);
            }
            input:checked + .slider:before {
                transform: translateX(20px);
                background-color: #fff;
            }
            .variant-accordion-item {
                background: var(--bg-card);
                border: 1px solid var(--border-base);
                border-radius: var(--radius-lg);
                margin-bottom: 12px;
                overflow: hidden;
            }
            .variant-header {
                padding: 16px 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                cursor: pointer;
                background: rgba(255,255,255,0.01);
                transition: background var(--transition-fast);
            }
            .variant-header:hover {
                background: rgba(255,255,255,0.03);
            }
            .variant-title-group {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .variant-sku {
                font-family: var(--font-mono);
                font-weight: 600;
                font-size: 13px;
            }
            .variant-specs-summary {
                font-size: 11px;
                color: var(--text-secondary);
            }
            .variant-body {
                padding: 20px;
                border-top: 1px solid var(--border-base);
                display: none;
            }
            .variant-body.open {
                display: block;
            }
            .specs-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
                gap: 16px;
                margin-bottom: 20px;
            }
            .offer-row:hover td {
                background: rgba(16, 185, 129, 0.02) !important;
            }
            .rank-box {
                background: rgba(99, 102, 241, 0.05);
                border: 1px solid var(--border-glow);
                border-radius: var(--radius-lg);
                padding: 20px;
                margin-bottom: 24px;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .rank-item {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
        </style>

        <!-- Back & Title Header -->
        <div class="detail-header">
            <div class="header-info-group">
                <a href="#/products" class="btn" style="padding: 10px 14px;"><i class="fa-solid fa-arrow-${isRtl ? 'right' : 'left'}"></i></a>
                <div class="header-img-wrapper">
                    ${p.image_url 
                        ? `<img src="${p.image_url}" alt="${p.name_en}">`
                        : `<i class="fa-solid fa-box-open" style="font-size: 24px; color: var(--text-muted);"></i>`
                    }
                </div>
                <div class="header-names">
                    <div class="header-title-en">${p.name_en || ''}</div>
                    <div class="header-title-ar">${p.name_ar || ''}</div>
                </div>
            </div>

            <!-- Page actions -->
            <div style="display: flex; gap: 8px;">
                ${isSoftDeleted 
                    ? `<button id="btn-header-restore" class="btn btn-success" ${isViewer() ? 'disabled' : ''}><i class="fa-solid fa-trash-arrow-up"></i> ${isRtl ? 'استعادة المنتج' : 'Restore Product'}</button>`
                    : `<button id="btn-header-delete" class="btn btn-danger" ${isViewer() ? 'disabled' : ''}><i class="fa-solid fa-trash-can"></i> ${isRtl ? 'حذف مؤقت' : 'Soft Delete'}</button>`
                }
            </div>
        </div>

        <!-- Navigation Tabs -->
        <nav class="tabs-nav">
            <button class="tab-btn active" data-tab="basic-info"><i class="fa-solid fa-circle-info"></i> ${isRtl ? 'البيانات الأساسية' : 'Basic Information'}</button>
            <button class="tab-btn" data-tab="specs-tab"><i class="fa-solid fa-sliders"></i> ${isRtl ? 'المواصفات والخصائص' : 'Specs & Attributes'}</button>
            <button class="tab-btn" data-tab="offers-tab"><i class="fa-solid fa-store"></i> ${isRtl ? 'العروض المتوفرة' : 'Store Offers'} (${p.variants.reduce((acc, v) => acc + (v.offers?.length || 0), 0)})</button>
            <button class="tab-btn" data-tab="ranking-tab"><i class="fa-solid fa-chart-line"></i> ${isRtl ? 'الترتيب والتسعير' : 'Rank & Price History'}</button>
        </nav>

        <!-- TAB 1: BASIC INFO -->
        <div id="pane-basic-info" class="tab-pane active">
            <div class="grid-form-cols">
                <!-- Main Details Card -->
                <div class="card">
                    <div class="card-header">
                        <div class="card-title">${isRtl ? 'بيانات التعريف الثنائية' : 'Bilingual Metadata Editor'}</div>
                    </div>
                    
                    <form id="product-basic-form" onsubmit="return false;">
                        <div class="form-grid-inner">
                            <div class="form-group">
                                <label class="form-label">${isRtl ? 'الاسم بالإنجليزية' : 'Product Name (English)'} *</label>
                                <input type="text" id="edit-name-en" class="form-input" value="${p.name_en || ''}" required ${isViewer() ? 'disabled' : ''}>
                            </div>
                            <div class="form-group">
                                <label class="form-label">${isRtl ? 'الاسم بالعربية' : 'Product Name (Arabic)'} *</label>
                                <input type="text" id="edit-name-ar" class="form-input" value="${p.name_ar || ''}" required ${isViewer() ? 'disabled' : ''} style="text-align: right; direction: rtl;">
                            </div>
                        </div>

                        <div class="form-group" style="margin-top: 12px;">
                            <label class="form-label">${isRtl ? 'الوصف بالإنجليزية' : 'Description (English)'}</label>
                            <textarea id="edit-desc-en" class="form-input" rows="4" style="height: auto; resize: vertical;" ${isViewer() ? 'disabled' : ''}>${p.description_en || ''}</textarea>
                        </div>
                        <div class="form-group">
                            <label class="form-label">${isRtl ? 'الوصف بالعربية' : 'Description (Arabic)'}</label>
                            <textarea id="edit-desc-ar" class="form-input" rows="4" style="height: auto; resize: vertical; text-align: right; direction: rtl;" ${isViewer() ? 'disabled' : ''}>${p.description_ar || ''}</textarea>
                        </div>

                        <div class="form-group">
                            <label class="form-label">${isRtl ? 'رابط الصورة' : 'Image URL'}</label>
                            <input type="text" id="edit-image-url" class="form-input" value="${p.image_url || ''}" ${isViewer() ? 'disabled' : ''}>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">${isRtl ? 'ملاحظات المشرف' : 'Admin Notes (Internal)'}</label>
                            <textarea id="edit-admin-notes" class="form-input" rows="2" style="height: auto; resize: vertical;" placeholder="${isRtl ? 'أضف ملاحظات إدارية داخلية هنا...' : 'Add private staff notes here...'}" ${isViewer() ? 'disabled' : ''}>${p.admin_notes || ''}</textarea>
                        </div>

                        <div style="margin-top: 24px; display: flex; justify-content: flex-end;">
                            <button type="submit" id="btn-save-basic" class="btn btn-primary" ${isViewer() ? 'disabled' : ''}><i class="fa-solid fa-floppy-disk"></i> ${isRtl ? 'حفظ التعديلات' : 'Save Changes'}</button>
                        </div>
                    </form>
                </div>

                <!-- Side Panel (Classification & Status Toggles) -->
                <div style="display:flex; flex-direction:column; gap:20px;">
                    <div class="card">
                        <div class="card-header">
                            <div class="card-title">${isRtl ? 'التصنيف' : 'Classification'}</div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">${isRtl ? 'العلامة التجارية' : 'Brand'}</label>
                            <select id="edit-brand" class="form-input" required ${isViewer() ? 'disabled' : ''}>
                                ${brands.map(b => `<option value="${b.id}" ${p.brand_id == b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label">${isRtl ? 'القسم الرئيسي' : 'Category'}</label>
                            <select id="edit-category" class="form-input" required ${isViewer() ? 'disabled' : ''}>
                                ${categories.map(c => `<option value="${c.id}" ${p.category_id == c.id ? 'selected' : ''}>${isRtl ? c.name_ar || c.name : c.name || c.name_ar}</option>`).join('')}
                            </select>
                        </div>

                        <div class="form-group">
                            <label class="form-label">${isRtl ? 'القسم الفرعي' : 'Subcategory'}</label>
                            <select id="edit-subcategory" class="form-input" required ${isViewer() ? 'disabled' : ''}>
                                ${subcategories.map(s => `<option value="${s.id}" ${p.subcategory_id == s.id ? 'selected' : ''}>${isRtl ? s.name_ar || s.name : s.name || s.name_ar}</option>`).join('')}
                            </select>
                        </div>
                    </div>

                    <div class="card">
                        <div class="card-header">
                            <div class="card-title">${isRtl ? 'الحالة والترويج' : 'Status & Curation'}</div>
                        </div>

                        <div style="display:flex; flex-direction:column; gap:12px;">
                            <div class="switch-container">
                                <div>
                                    <div style="font-size:13px; font-weight:600;">${isRtl ? 'منتج مميز' : 'Featured Product'}</div>
                                    <div style="font-size:11px; color:var(--text-muted);">${isRtl ? 'عرض في واجهة المنتجات المميزة' : 'Feature on client discovery lists'}</div>
                                </div>
                                <label class="switch">
                                    <input type="checkbox" id="edit-featured" ${isFeatured ? 'checked' : ''} ${isViewer() ? 'disabled' : ''}>
                                    <span class="slider"></span>
                                </label>
                            </div>

                            <div class="switch-container">
                                <div>
                                    <div style="font-size:13px; font-weight:600;">${isRtl ? 'منتج رائج' : 'Trending Product'}</div>
                                    <div style="font-size:11px; color:var(--text-muted);">${isRtl ? 'إبراز المنتج كأكثر طلباً ورواجاً' : 'Highlight as high-velocity trending item'}</div>
                                </div>
                                <label class="switch">
                                    <input type="checkbox" id="edit-trending" ${isTrending ? 'checked' : ''} ${isViewer() ? 'disabled' : ''}>
                                    <span class="slider"></span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- Image Preview -->
                    <div class="card" style="align-items: center; justify-content: center; min-height: 180px;">
                        ${p.image_url 
                            ? `<img id="preview-img-box" src="${p.image_url}" style="max-height: 160px; max-width: 100%; object-fit: contain;" alt="Preview">`
                            : `<i class="fa-solid fa-image" style="font-size: 48px; color: var(--text-muted);"></i>`
                        }
                    </div>
                </div>
            </div>
        </div>

        <!-- TAB 2: VARIANTS & SPECIFICATIONS -->
        <div id="pane-specs-tab" class="tab-pane">
            <!-- Create New Variant Form Card -->
            <div class="card" style="margin-bottom: 20px; border: 1px dashed var(--border-glow); background: rgba(255,255,255,0.01);">
                <div style="display: flex; justify-content: space-between; align-items: center; cursor: pointer;" id="toggle-new-variant-form">
                    <div style="font-weight: 700; font-size: 14px; color: var(--primary-light);">
                        <i class="fa-solid fa-plus-circle"></i> <span>${isRtl ? 'إنشاء موديل (Variant) جديد للمنتج' : 'Create New Product Variant'}</span>
                    </div>
                    <i class="fa-solid fa-chevron-down new-var-arrow" style="transition: transform 0.2s;"></i>
                </div>
                <div id="new-variant-form-body" style="display: none; padding-top: 16px; margin-top: 12px; border-top: 1px dashed var(--border-base);">
                    <form id="new-variant-form" onsubmit="return false;">
                        <div class="specs-grid">
                            <div class="form-group">
                                <label class="form-label">${isRtl ? 'رمز SKU الكود *' : 'SKU Code *'}</label>
                                <input type="text" id="new-var-sku" class="form-input" required placeholder="e.g. I15PM-256-BLK">
                            </div>
                            <div class="form-group">
                                <label class="form-label">${isRtl ? 'سعة التخزين (جيجابايت)' : 'Storage (GB)'}</label>
                                <input type="number" id="new-var-storage" class="form-input" placeholder="e.g. 256">
                            </div>
                            <div class="form-group">
                                <label class="form-label">${isRtl ? 'الذاكرة العشوائية (رام)' : 'RAM (GB)'}</label>
                                <input type="number" id="new-var-ram" class="form-input" placeholder="e.g. 8">
                            </div>
                            <div class="form-group">
                                <label class="form-label">${isRtl ? 'اللون (بالإنجليزية)' : 'Color (English)'}</label>
                                <input type="text" id="new-var-color-en" class="form-input" placeholder="e.g. Black Titanium">
                            </div>
                            <div class="form-group">
                                <label class="form-label">${isRtl ? 'اللون (بالعربية)' : 'Color (Arabic)'}</label>
                                <input type="text" id="new-var-color-ar" class="form-input" placeholder="e.g. تيتانيوم أسود">
                            </div>
                            <div class="form-group">
                                <label class="form-label">${isRtl ? 'شبكة الاتصال' : 'Network Gen'}</label>
                                <input type="text" id="new-var-network" class="form-input" placeholder="e.g. 5G">
                            </div>
                            <div class="form-group">
                                <label class="form-label">${isRtl ? 'المنطقة / الإصدار' : 'Region / Version'}</label>
                                <input type="text" id="new-var-region" class="form-input" placeholder="e.g. Global">
                            </div>
                        </div>
                        <div style="display: flex; justify-content: flex-end; margin-top: 12px;">
                            <button type="button" id="btn-create-variant" class="btn btn-success" ${isViewer() ? 'disabled' : ''}>
                                <i class="fa-solid fa-plus"></i> ${isRtl ? 'إضافة الموديل الجديد' : 'Add New Variant'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <div class="card" style="margin-bottom: 20px;">
                <div class="card-header">
                    <div class="card-title"><i class="fa-solid fa-cubes"></i> <span>${isRtl ? 'موديلات المنتج والخصائص الفنية' : 'Product Variants & Technical Specs'}</span></div>
                </div>
                
                <p style="color: var(--text-secondary); font-size:13px; margin-bottom: 20px;">
                    ${isRtl 
                        ? 'تتشارك العروض المختلفة في عائلة المنتج، ولكن كل موديل (مثال: سعات تخزين مختلفة) يمتلك سمات وخصائص ومواصفات فنية مستقلة.' 
                        : 'Different store offers map to specific product variants. Select a variant below to edit its granular specification attributes.'
                    }
                </p>

                <div id="variants-accordion-list">
                    ${p.variants.map((v, index) => {
                        // Render Accordion Item
                        // Attributes matching definitions
                        const attrMap = {};
                        (v.attributes || []).forEach(a => {
                            attrMap[a.attribute_id] = a.value;
                        });

                        const specsSummaryArray = [
                            v.storage_gb ? `${v.storage_gb}GB` : '',
                            v.ram_gb ? `${v.ram_gb}GB RAM` : '',
                            (v.color_en && v.color_en.toLowerCase() !== 'standard' && v.color_en !== 'قياسي') ? v.color_en : ''
                        ].filter(Boolean);
                        const specsSummary = specsSummaryArray.length > 0 ? ` (${specsSummaryArray.join(', ')})` : '';

                        return `
                            <div class="variant-accordion-item">
                                <div class="variant-header" data-index="${index}">
                                    <div class="variant-title-group">
                                        <i class="fa-solid fa-chevron-down accordion-arrow" style="transition: transform 0.2s;"></i>
                                        <div>
                                            <span class="variant-sku">${v.sku || `Variant #${v.id}`}</span>
                                            <span class="variant-specs-summary" style="margin-inline-start: 8px; font-size: 11px; color: var(--text-secondary);">
                                                ${specsSummary}
                                            </span>
                                        </div>
                                    </div>
                                    <span class="badge badge-info" style="font-family: var(--font-mono);">${v.offers?.length || 0} ${isRtl ? 'عروض' : 'offers'}</span>
                                </div>
                                
                                <div id="variant-body-${index}" class="variant-body ${index === 0 ? 'open' : ''}">
                                    <form class="variant-specs-form" data-variant-id="${v.id}" onsubmit="return false;">
                                        <!-- Core specs fields -->
                                        <div style="font-weight: 600; margin-bottom: 12px; border-bottom: 1px solid var(--border-base); padding-bottom: 8px; color: var(--primary-light);">
                                            ${isRtl ? 'المواصفات الأساسية للموديل' : 'Core Variant Specifications'}
                                        </div>
                                        <div class="specs-grid" style="margin-bottom: 20px;">
                                            <div class="form-group">
                                                <label class="form-label">${isRtl ? 'رمز SKU الكود' : 'SKU Code'} *</label>
                                                <input type="text" class="form-input core-spec-sku" value="${v.sku || ''}" required ${isViewer() ? 'disabled' : ''}>
                                            </div>
                                            <div class="form-group">
                                                <label class="form-label">${isRtl ? 'سعة التخزين (جيجابايت)' : 'Storage (GB)'}</label>
                                                <input type="number" class="form-input core-spec-storage" value="${v.storage_gb || ''}" ${isViewer() ? 'disabled' : ''}>
                                            </div>
                                            <div class="form-group">
                                                <label class="form-label">${isRtl ? 'الذاكرة العشوائية (رام)' : 'RAM (GB)'}</label>
                                                <input type="number" class="form-input core-spec-ram" value="${v.ram_gb || ''}" ${isViewer() ? 'disabled' : ''}>
                                            </div>
                                            <div class="form-group">
                                                <label class="form-label">${isRtl ? 'اللون (بالإنجليزية)' : 'Color (English)'}</label>
                                                <input type="text" class="form-input core-spec-color-en" value="${v.color_en || ''}" ${isViewer() ? 'disabled' : ''}>
                                            </div>
                                            <div class="form-group">
                                                <label class="form-label">${isRtl ? 'اللون (بالعربية)' : 'Color (Arabic)'}</label>
                                                <input type="text" class="form-input core-spec-color-ar" value="${v.color_ar || ''}" ${isViewer() ? 'disabled' : ''}>
                                            </div>
                                            <div class="form-group">
                                                <label class="form-label">${isRtl ? 'شبكة الاتصال' : 'Network Gen'}</label>
                                                <input type="text" class="form-input core-spec-network" value="${v.network_gen || ''}" placeholder="e.g. 5G" ${isViewer() ? 'disabled' : ''}>
                                            </div>
                                            <div class="form-group">
                                                <label class="form-label">${isRtl ? 'المنطقة / الإصدار' : 'Region / Version'}</label>
                                                <input type="text" class="form-input core-spec-region" value="${v.region_version || ''}" placeholder="e.g. Global" ${isViewer() ? 'disabled' : ''}>
                                            </div>
                                        </div>

                                        <div style="font-weight: 600; margin-bottom: 12px; border-bottom: 1px solid var(--border-base); padding-bottom: 8px; color: var(--primary-light);">
                                            ${isRtl ? 'الخصائص الفنية الأخرى' : 'Other Subcategory Attributes'}
                                        </div>
                                        
                                        <div class="specs-grid">
                                            ${attributeDefs.length === 0 
                                                ? `<div style="grid-column: 1/-1; color: var(--text-muted); text-align:center; padding:10px;">${isRtl ? 'لا توجد مواصفات معرفة لهذا القسم الفرعي.' : 'No specification attributes configured for this subcategory.'}</div>`
                                                : attributeDefs.map(def => {
                                                    const currentVal = attrMap[def.id] || '';
                                                    return `
                                                        <div class="form-group">
                                                            <label class="form-label">${isRtl ? def.name_ar || def.name_en : def.name_en || def.name_ar} ${def.unit ? `(${def.unit})` : ''}</label>
                                                            <input type="text" class="form-input spec-input-field" data-attribute-id="${def.id}" value="${currentVal}" placeholder="${def.value_type || 'text'}" ${isViewer() ? 'disabled' : ''}>
                                                        </div>
                                                    `;
                                                }).join('')
                                            }
                                        </div>
                                        
                                        <div style="display:flex; justify-content: space-between; gap: 8px; margin-top: 16px;">
                                            <button type="button" class="btn btn-danger btn-delete-variant" data-variant-id="${v.id}" ${isViewer() ? 'disabled' : ''}><i class="fa-solid fa-trash-can"></i> ${isRtl ? 'حذف الموديل' : 'Delete Variant'}</button>
                                            <button type="button" class="btn btn-primary btn-save-specs" data-variant-id="${v.id}" ${isViewer() ? 'disabled' : ''}><i class="fa-solid fa-floppy-disk"></i> ${isRtl ? 'حفظ المواصفات والخصائص' : 'Save Specs & Attributes'}</button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>

        <!-- TAB 3: OFFERS -->
        <div id="pane-offers-tab" class="tab-pane">
            <div class="card">
                <div class="card-header">
                    <div class="card-title"><i class="fa-solid fa-shop"></i> <span>${isRtl ? 'العروض المجمعة' : 'Consolidated Offers'}</span></div>
                </div>

                <div class="table-wrapper">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>${isRtl ? 'المتجر' : 'Store'}</th>
                                <th>${isRtl ? 'الموديل المربوط' : 'Linked Variant'}</th>
                                <th>${isRtl ? 'العنوان الأصلي' : 'Scraped Title'}</th>
                                <th style="text-align: right;">${isRtl ? 'السعر الحالي' : 'Price'}</th>
                                <th style="text-align: right;">${isRtl ? 'السعر الأصلي' : 'List Price'}</th>
                                <th style="text-align: center;">${isRtl ? 'الخصم' : 'Discount'}</th>
                                <th>${isRtl ? 'التوفر' : 'Availability'}</th>
                                <th style="text-align: center;">${isRtl ? 'الحالة' : 'Status'}</th>
                                <th>${isRtl ? 'آخر تحديث' : 'Last Scraped'}</th>
                                <th style="text-align: center;">${isRtl ? 'إجراءات' : 'Inspect'}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${p.variants.flatMap(v => (v.offers || []).map(o => ({ ...o, variant_sku: v.sku }))).length === 0
                                ? `<tr><td colspan="10" style="text-align:center; padding: 40px; color: var(--text-secondary);"><i class="fa-solid fa-circle-info"></i> ${isRtl ? 'لا توجد عروض أسعار متوفرة حالياً.' : 'No offers found.'}</td></tr>`
                                : p.variants.flatMap(v => (v.offers || []).map(o => ({ ...o, variant_sku: v.sku }))).sort((a,b) => a.price_egp - b.price_egp).map(o => {
                                    // Generate options HTML for the variant linking select dropdown
                                    const variantOptionsHtml = p.variants.map(vOpt => {
                                        const specsArray = [
                                            vOpt.storage_gb ? `${vOpt.storage_gb}GB` : '',
                                            vOpt.ram_gb ? `${vOpt.ram_gb}GB` : '',
                                            (vOpt.color_en && vOpt.color_en.toLowerCase() !== 'standard') ? vOpt.color_en : ''
                                        ].filter(Boolean);
                                        const specsStr = specsArray.length > 0 ? ` (${specsArray.join(' / ')})` : '';
                                        return `
                                            <option value="${vOpt.id}" ${o.variant_id === vOpt.id ? 'selected' : ''}>
                                                ${vOpt.sku}${specsStr}
                                            </option>
                                        `;
                                    }).join('');

                                    return `
                                    <tr class="offer-row" style="${!o.is_active ? 'opacity: 0.6; background: rgba(0,0,0,0.05);' : ''}">
                                        <td style="font-weight: 600; color: var(--primary-light);">${o.store_name}</td>
                                        <td>
                                            <select class="form-input select-link-variant" data-offer-id="${o.id}" style="padding: 4px 8px; font-size: 12px; width: 100%; min-width: 150px; height: 32px;" ${isViewer() ? 'disabled' : ''}>
                                                ${variantOptionsHtml}
                                                <option value="null" ${o.variant_id === null ? 'selected' : ''}>${isRtl ? 'غير مرتبط (حذف الربط)' : 'Unlinked (Remove Link)'}</option>
                                            </select>
                                        </td>
                                        <td style="max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${o.raw_title}">${o.raw_title}</td>
                                        <td style="text-align: right; font-weight: 600; font-family: var(--font-mono);">${o.price_egp.toLocaleString()} ${isRtl ? 'ج.م' : 'EGP'}</td>
                                        <td style="text-align: right; color: var(--text-secondary); font-family: var(--font-mono);">${o.original_price_egp ? o.original_price_egp.toLocaleString() + ' ' + (isRtl ? 'ج.م' : 'EGP') : '-'}</td>
                                        <td style="text-align: center;">
                                            ${o.discount_pct ? `<span class="badge badge-danger">${o.discount_pct}% OFF</span>` : '-'}
                                        </td>
                                        <td>
                                            <span class="badge ${o.availability === 'in_stock' ? 'badge-success' : 'badge-warning'}">
                                                ${o.availability === 'in_stock' ? (isRtl ? 'متوفر' : 'In Stock') : (isRtl ? 'غير متوفر' : 'Out of Stock')}
                                            </span>
                                        </td>
                                        <td style="text-align: center;">
                                            <label class="switch" style="transform: scale(0.85); display: inline-block; margin: 0; vertical-align: middle;">
                                                <input type="checkbox" class="offer-active-toggle" data-offer-id="${o.id}" ${o.is_active ? 'checked' : ''} ${isViewer() ? 'disabled' : ''}>
                                                <span class="slider"></span>
                                            </label>
                                        </td>
                                        <td style="font-size: 11px; color: var(--text-muted);">${o.scraped_at ? new Date(o.scraped_at).toLocaleString(state.lang) : '-'}</td>
                                        <td style="text-align: center;">
                                            <div style="display: flex; gap: 4px; justify-content: center;">
                                                <button class="btn btn-edit-offer-url" data-offer-id="${o.id}" data-current-url="${o.product_url}" style="padding: 4px 8px; font-size:11px;" title="${isRtl ? 'تعديل الرابط' : 'Edit Link'}" ${isViewer() ? 'disabled' : ''}>
                                                    <i class="fa-solid fa-pencil"></i>
                                                </button>
                                                <a href="${o.product_url}" target="_blank" class="btn" style="padding: 4px 8px; font-size:11px;" title="${isRtl ? 'زيارة رابط المتجر' : 'Visit original store link'}">
                                                    <i class="fa-solid fa-up-right-from-square"></i>
                                                </a>
                                                <button class="btn btn-danger btn-delete-offer" data-offer-id="${o.id}" style="padding: 4px 8px; font-size:11px;" title="${isRtl ? 'حذف العرض' : 'Delete Offer'}" ${isViewer() ? 'disabled' : ''}>
                                                    <i class="fa-solid fa-trash-can"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                    `;
                                }).join('')
                            }
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- TAB 4: RANKING & ANALYTICS -->
        <div id="pane-ranking-tab" class="tab-pane">
            <!-- Rank Override Card -->
            <div class="rank-box">
                <div class="rank-item">
                    <div style="font-size: 11px; text-transform: uppercase; color: var(--text-secondary); letter-spacing: 0.05em;">
                        ${isRtl ? 'نقاط الترتيب الحالية' : 'Current Ranking Score'}
                    </div>
                    <div style="font-size: 32px; font-weight: 800; color: var(--primary-light); font-family: var(--font-mono);">
                        ${p.ranking_score ? p.ranking_score.toFixed(2) : '0.00'}
                    </div>
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
                        ${isRtl ? '* تُحسب النقاط تلقائياً بناءً على العروض والمشاهدات والتفضيل، أو تفرض يدوياً.' : '* Score is updated by cron formula or manual administrator overrides.'}
                    </div>
                </div>

                <div style="display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label class="form-label">${isRtl ? 'فرض رتبة يدوية' : 'Manual Rank Override'}</label>
                        <input type="number" id="edit-rank-override" class="form-input" style="width: 160px;" placeholder="e.g. 50.5" step="0.01" value="${p.manual_rank_override !== null ? p.manual_rank_override : ''}" ${isViewer() ? 'disabled' : ''}>
                    </div>
                    <button id="btn-save-rank" class="btn btn-primary" ${isViewer() ? 'disabled' : ''} style="height: 42px;"><i class="fa-solid fa-circle-check"></i> ${isRtl ? 'تطبيق الفرض' : 'Apply Override'}</button>
                </div>
            </div>

            <!-- Price History Chart Card -->
            <div class="card">
                <div class="card-header">
                    <div class="card-title"><i class="fa-solid fa-chart-line"></i> <span>${isRtl ? 'مخطط تقلب الأسعار التاريخي' : 'Historical Price Fluctuations'}</span></div>
                </div>
                <div class="chart-container">
                    <canvas id="priceHistoryChart"></canvas>
                </div>
                <div id="no-chart-msg" class="hidden" style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <i class="fa-solid fa-chart-area" style="font-size: 32px; margin-bottom: 12px; opacity:0.5;"></i>
                    <div>${isRtl ? 'لا تتوفر سجلات أسعار تاريخية كافية لرسم المخطط.' : 'No historical price data points available for this product family.'}</div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Handle Tab switching logic
 */
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    const panes = document.querySelectorAll('.tab-pane');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            activeTab = target;

            tabs.forEach(t => t.classList.remove('active'));
            panes.forEach(p => p.classList.remove('active'));

            tab.classList.add('active');
            document.getElementById(`pane-${target}`).classList.add('active');
        });
    });

    // Accordion Toggle for Specs Tab
    const accordions = document.querySelectorAll('.variant-header');
    accordions.forEach(header => {
        header.addEventListener('click', () => {
            const idx = header.dataset.index;
            const body = document.getElementById(`variant-body-${idx}`);
            const arrow = header.querySelector('.accordion-arrow');

            const isOpen = body.classList.contains('open');

            // Close all others
            document.querySelectorAll('.variant-body').forEach(b => b.classList.remove('open'));
            document.querySelectorAll('.accordion-arrow').forEach(a => a.style.transform = 'rotate(0deg)');

            if (!isOpen) {
                body.classList.add('open');
                arrow.style.transform = 'rotate(180deg)';
            }
        });
    });
}

/**
 * Setup events for saving details & editing subcategories
 */
function setupFormEvents() {
    const isRtl = state.lang === 'ar';
    const p = productData;

    // Handle Category change to dynamically reload subcategory dropdown
    document.getElementById('edit-category').addEventListener('change', async (e) => {
        const catId = e.target.value;
        const subcatSelect = document.getElementById('edit-subcategory');
        subcatSelect.innerHTML = `<option value="">${isRtl ? 'جاري التحميل...' : 'Loading...'}</option>`;

        try {
            const res = await adminFetch(`/api/admin/categories/${catId}/subcategories`);
            if (res.success) {
                const subcats = res.subcategories || [];
                subcatSelect.innerHTML = subcats.map(s => `<option value="${s.id}">${isRtl ? s.name_ar || s.name : s.name || s.name_ar}</option>`).join('');
            }
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });

    // Save Basic Info Form
    document.getElementById('btn-save-basic').addEventListener('click', async (e) => {
        if (isViewer()) return;

        const nameEn = document.getElementById('edit-name-en').value.trim();
        const nameAr = document.getElementById('edit-name-ar').value.trim();
        const descEn = document.getElementById('edit-desc-en').value.trim();
        const descAr = document.getElementById('edit-desc-ar').value.trim();
        const imageUrl = document.getElementById('edit-image-url').value.trim();
        const adminNotes = document.getElementById('edit-admin-notes').value.trim();
        
        const brandId = parseInt(document.getElementById('edit-brand').value, 10);
        const subcatId = parseInt(document.getElementById('edit-subcategory').value, 10);
        
        const isFeatured = document.getElementById('edit-featured').checked;
        const isTrending = document.getElementById('edit-trending').checked;

        if (!nameEn || !nameAr) {
            showToast(isRtl ? 'الاسم بالإنجليزية والاسم بالعربية مطلوبان' : 'English name and Arabic name are required', 'warning');
            return;
        }

        try {
            const res = await adminFetch(`/api/admin/products/${p.id}`, {
                method: 'PUT',
                body: {
                    name_en: nameEn,
                    name_ar: nameAr,
                    description_en: descEn,
                    description_ar: descAr,
                    brand_id: brandId,
                    subcategory_id: subcatId,
                    image_url: imageUrl,
                    admin_notes: adminNotes,
                    is_featured: isFeatured,
                    is_trending: isTrending
                }
            });

            if (res.success) {
                showToast(isRtl ? 'تم حفظ التعديلات بنجاح' : 'Product basic information saved successfully', 'success');
                // Refresh title and image preview
                const titleEn = document.querySelector('.header-title-en');
                const titleAr = document.querySelector('.header-title-ar');
                const imgWrap = document.querySelector('.header-img-wrapper');
                const previewImgBox = document.getElementById('preview-img-box');

                if (titleEn) titleEn.textContent = nameEn;
                if (titleAr) titleAr.textContent = nameAr;
                if (imgWrap && imageUrl) {
                    imgWrap.innerHTML = `<img src="${imageUrl}" alt="${nameEn}">`;
                }
                if (previewImgBox) {
                    if (imageUrl) {
                        previewImgBox.src = imageUrl;
                        previewImgBox.parentNode.innerHTML = `<img id="preview-img-box" src="${imageUrl}" style="max-height: 160px; max-width: 100%; object-fit: contain;" alt="Preview">`;
                    }
                }
                
                // Update local model
                productData = res.product;
            }
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });

    // Toggle Create Variant Form
    const toggleBtn = document.getElementById('toggle-new-variant-form');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const body = document.getElementById('new-variant-form-body');
            const arrow = toggleBtn.querySelector('.new-var-arrow');
            const isOpen = body.style.display === 'block';
            body.style.display = isOpen ? 'none' : 'block';
            arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
        });
    }

    // Create New Variant Submit
    const btnCreateVar = document.getElementById('btn-create-variant');
    if (btnCreateVar) {
        btnCreateVar.addEventListener('click', async () => {
            if (isViewer()) return;
            const sku = document.getElementById('new-var-sku').value.trim();
            const storage = document.getElementById('new-var-storage').value;
            const ram = document.getElementById('new-var-ram').value;
            const colorEn = document.getElementById('new-var-color-en').value.trim();
            const colorAr = document.getElementById('new-var-color-ar').value.trim();
            const network = document.getElementById('new-var-network').value.trim();
            const region = document.getElementById('new-var-region').value.trim();

            if (!sku) {
                showToast(isRtl ? 'حقل رمز SKU مطلوب' : 'SKU Code is required', 'warning');
                return;
            }

            try {
                const res = await adminFetch(`/api/admin/products/${p.id}/variants`, {
                    method: 'POST',
                    body: {
                        sku,
                        storage_gb: storage ? parseInt(storage, 10) : null,
                        ram_gb: ram ? parseInt(ram, 10) : null,
                        color_en: colorEn || null,
                        color_ar: colorAr || null,
                        network_gen: network || null,
                        region_version: region || null
                    }
                });

                if (res.success) {
                    showToast(isRtl ? 'تم إضافة الموديل الجديد بنجاح' : 'New variant created successfully', 'success');
                    navigate(window.location.hash, true);
                }
            } catch (err) {
                showToast(err.message, 'danger');
            }
        });
    }

    // Save Variant Specifications & Custom Attributes
    document.querySelectorAll('.btn-save-specs').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (isViewer()) return;
            const btnEl = e.currentTarget;
            const variantId = parseInt(btnEl.dataset.variantId, 10);
            const form = btnEl.closest('.variant-specs-form');
            
            // Collect core specs
            const sku = form.querySelector('.core-spec-sku').value.trim();
            const storage = form.querySelector('.core-spec-storage').value;
            const ram = form.querySelector('.core-spec-ram').value;
            const colorEn = form.querySelector('.core-spec-color-en').value.trim();
            const colorAr = form.querySelector('.core-spec-color-ar').value.trim();
            const network = form.querySelector('.core-spec-network').value.trim();
            const region = form.querySelector('.core-spec-region').value.trim();

            if (!sku) {
                showToast(isRtl ? 'رمز SKU مطلوب' : 'SKU is required', 'warning');
                return;
            }

            // Build attributes payload
            const attributes = [];
            form.querySelectorAll('.spec-input-field').forEach(input => {
                const attrId = parseInt(input.dataset.attributeId, 10);
                const value = input.value.trim();
                
                attributes.push({
                    attribute_id: attrId,
                    value: value
                });
            });

            try {
                // Save core specs first
                const resSpecs = await adminFetch(`/api/admin/products/${p.id}/variants/${variantId}`, {
                    method: 'PUT',
                    body: {
                        sku,
                        storage_gb: storage ? parseInt(storage, 10) : null,
                        ram_gb: ram ? parseInt(ram, 10) : null,
                        color_en: colorEn || null,
                        color_ar: colorAr || null,
                        network_gen: network || null,
                        region_version: region || null
                    }
                });

                if (!resSpecs.success) {
                    throw new Error(resSpecs.message || 'Failed to save core specs');
                }

                // Save custom attributes
                const resAttrs = await adminFetch(`/api/admin/products/${p.id}/variants/${variantId}/attributes`, {
                    method: 'PUT',
                    body: { attributes }
                });
                
                if (resAttrs.success) {
                    showToast(isRtl ? 'تم تحديث مواصفات وخصائص الموديل بنجاح' : 'Variant specs and attributes saved successfully', 'success');
                    // Reload to update accordion titles
                    navigate(window.location.hash, true);
                }
            } catch (err) {
                showToast(err.message, 'danger');
            }
        });
    });

    // Delete Variant Button Click
    document.querySelectorAll('.btn-delete-variant').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (isViewer()) return;
            const variantId = parseInt(e.currentTarget.dataset.variantId, 10);
            
            const confirmMsg = isRtl
                ? 'هل أنت متأكد من حذف هذا الموديل؟ سيتم إلغاء ربط جميع العروض المرتبطة به وحذفها مؤقتاً.'
                : 'Are you sure you want to delete this variant? This will unlink and soft-delete all offers mapped to it.';
                
            if (!confirm(confirmMsg)) return;

            try {
                const res = await adminFetch(`/api/admin/products/${p.id}/variants/${variantId}`, {
                    method: 'DELETE'
                });

                if (res.success) {
                    showToast(isRtl ? 'تم حذف الموديل بنجاح' : 'Variant deleted successfully', 'success');
                    navigate(window.location.hash, true);
                }
            } catch (err) {
                showToast(err.message, 'danger');
            }
        });
    });

    // Dropdown change to link/unlink variant for offer
    document.querySelectorAll('.select-link-variant').forEach(select => {
        select.addEventListener('change', async (e) => {
            if (isViewer()) return;
            const offerId = parseInt(e.currentTarget.dataset.offerId, 10);
            const val = e.currentTarget.value;
            const variantId = val === 'null' ? null : parseInt(val, 10);

            try {
                const res = await adminFetch(`/api/admin/offers/${offerId}`, {
                    method: 'PUT',
                    body: { variant_id: variantId }
                });

                if (res.success) {
                    showToast(isRtl ? 'تم تحديث ربط الموديل بالعرض بنجاح' : 'Offer variant link updated successfully', 'success');
                    // Reload details
                    navigate(window.location.hash, true);
                }
            } catch (err) {
                showToast(err.message, 'danger');
                navigate(window.location.hash, true);
            }
        });
    });

    // Toggle active status for offer
    document.querySelectorAll('.offer-active-toggle').forEach(toggle => {
        toggle.addEventListener('change', async (e) => {
            if (isViewer()) return;
            const offerId = parseInt(e.currentTarget.dataset.offerId, 10);
            const isActive = e.currentTarget.checked;

            try {
                const res = await adminFetch(`/api/admin/offers/${offerId}`, {
                    method: 'PUT',
                    body: { is_active: isActive }
                });

                if (res.success) {
                    showToast(isRtl ? 'تم تحديث حالة العرض بنجاح' : 'Offer active status updated successfully', 'success');
                    const row = e.currentTarget.closest('tr');
                    if (row) {
                        row.style.opacity = isActive ? '1' : '0.6';
                        row.style.background = isActive ? 'none' : 'rgba(0,0,0,0.05)';
                    }
                }
            } catch (err) {
                showToast(err.message, 'danger');
                e.currentTarget.checked = !isActive; // revert checkbox
            }
        });
    });

    // Soft-delete store offer
    document.querySelectorAll('.btn-delete-offer').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (isViewer()) return;
            const offerId = parseInt(e.currentTarget.dataset.offerId, 10);
            
            const confirmMsg = isRtl
                ? 'هل أنت متأكد من حذف هذا العرض مؤقتاً؟'
                : 'Are you sure you want to soft delete this offer?';
                
            if (!confirm(confirmMsg)) return;

            try {
                const res = await adminFetch(`/api/admin/offers/${offerId}`, {
                    method: 'DELETE'
                });

                if (res.success) {
                    showToast(isRtl ? 'تم حذف العرض مؤقتاً بنجاح' : 'Offer soft-deleted successfully', 'success');
                    navigate(window.location.hash, true);
                }
            } catch (err) {
                showToast(err.message, 'danger');
            }
        });
    });

    // Save Rank Override Button
    document.getElementById('btn-save-rank').addEventListener('click', async () => {
        if (isViewer()) return;
        const overrideVal = document.getElementById('edit-rank-override').value;

        try {
            const res = await adminFetch(`/api/admin/products/${p.id}/rank-override`, {
                method: 'PUT',
                body: { manual_rank_override: overrideVal }
            });
            if (res.success) {
                showToast(isRtl ? 'تم تحديث فرض الرتبة بنجاح' : 'Rank override applied successfully', 'success');
                // Update local model score
                productData = res.product;
                const scoreDisplay = document.querySelector('.rank-box .rank-score');
                if (scoreDisplay) {
                    scoreDisplay.textContent = res.product.ranking_score ? res.product.ranking_score.toFixed(2) : '0.00';
                }
            }
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });

    // Quick delete from header
    const deleteBtn = document.getElementById('btn-header-delete');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', async () => {
            if (isViewer()) return;
            const confirmMsg = isRtl
                ? 'هل أنت متأكد من حذف هذا المنتج مؤقتاً؟'
                : 'Are you sure you want to soft delete this product?';
            if (!confirm(confirmMsg)) return;

            try {
                const res = await adminFetch(`/api/admin/products/${p.id}/soft-delete`, { method: 'POST' });
                if (res.success) {
                    showToast(isRtl ? 'تم حذف المنتج مؤقتاً' : 'Product soft-deleted successfully', 'success');
                    window.location.hash = '#/products';
                }
            } catch (err) {
                showToast(err.message, 'danger');
            }
        });
    }

    // Quick restore from header
    const restoreBtn = document.getElementById('btn-header-restore');
    if (restoreBtn) {
        restoreBtn.addEventListener('click', async () => {
            if (isViewer()) return;
            try {
                const res = await adminFetch(`/api/admin/products/${p.id}/restore`, { method: 'POST' });
                if (res.success) {
                    showToast(isRtl ? 'تم استعادة المنتج بنجاح' : 'Product restored successfully', 'success');
                    window.location.hash = '#/products';
                }
            } catch (err) {
                showToast(err.message, 'danger');
            }
        });
    }

    // Edit Offer URL Button Click
    document.querySelectorAll('.btn-edit-offer-url').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (isViewer()) return;
            const btnEl = e.currentTarget;
            const offerId = parseInt(btnEl.dataset.offerId, 10);
            const currentUrl = btnEl.dataset.currentUrl;

            const newUrl = prompt(
                isRtl ? 'أدخل رابط المتجر الجديد للمنتج:' : 'Enter the new store link for the product:',
                currentUrl
            );

            if (newUrl === null) return; // User cancelled
            const trimmedUrl = newUrl.trim();
            if (!trimmedUrl) {
                showToast(isRtl ? 'الرابط لا يمكن أن يكون فارغاً' : 'URL cannot be empty', 'warning');
                return;
            }

            try {
                const res = await adminFetch(`/api/admin/offers/${offerId}/url`, {
                    method: 'PUT',
                    body: { productUrl: trimmedUrl }
                });

                if (res.success) {
                    showToast(isRtl ? 'تم تحديث رابط المنتج بنجاح' : 'Product link updated successfully', 'success');
                    // Reload product details to update the table
                    navigate(window.location.hash, true);
                }
            } catch (err) {
                showToast(err.message, 'danger');
            }
        });
    });
}

/**
 * Draw Chart.js Line Chart for Price history points
 */
function renderPriceHistoryChart() {
    const isRtl = state.lang === 'ar';
    const canvas = document.getElementById('priceHistoryChart');
    const emptyMsg = document.getElementById('no-chart-msg');
    
    if (!canvas) return;

    const history = productData.price_history || [];
    
    if (history.length === 0) {
        canvas.style.display = 'none';
        emptyMsg.classList.remove('hidden');
        return;
    }

    canvas.style.display = 'block';
    emptyMsg.classList.add('hidden');

    // Group history points by Variant SKU/ID
    const datasetsMap = {};
    history.forEach(pt => {
        const key = pt.variant_sku || `Variant #${pt.variant_id}`;
        if (!datasetsMap[key]) {
            datasetsMap[key] = [];
        }
        datasetsMap[key].push({
            x: new Date(pt.recorded_at),
            y: pt.price_egp,
            store: pt.store_name
        });
    });

    // Select color palette for lines
    const colors = [
        'rgb(99, 102, 241)', // Primary
        'rgb(168, 85, 247)', // Secondary
        'rgb(6, 182, 212)',  // Info
        'rgb(16, 185, 129)',  // Success
        'rgb(245, 158, 11)'   // Warning
    ];

    let colorIdx = 0;
    const datasets = Object.keys(datasetsMap).map(key => {
        const data = datasetsMap[key].sort((a,b) => a.x - b.x);
        const lineColor = colors[colorIdx % colors.length];
        colorIdx++;

        return {
            label: key,
            data: data.map(d => ({ x: d.x.toLocaleDateString(state.lang), y: d.y })),
            borderColor: lineColor,
            backgroundColor: lineColor.replace('rgb', 'rgba').replace(')', ', 0.1)'),
            tension: 0.15,
            fill: false,
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6
        };
    });

    // Extract all unique dates to form label axis
    const uniqueLabelsSet = new Set();
    history.forEach(pt => {
        uniqueLabelsSet.add(new Date(pt.recorded_at).toLocaleDateString(state.lang));
    });
    const labels = Array.from(uniqueLabelsSet).sort((a,b) => new Date(a) - new Date(b));

    // Destroy existing chart instances if active to prevent redraw bugs
    if (window.activePriceChart) {
        window.activePriceChart.destroy();
    }

    // Initialize Chart.js
    window.activePriceChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: '#94a3b8',
                        font: { family: 'Outfit' }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y.toLocaleString() + ' EGP';
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: '#627288', font: { family: 'Outfit', size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: '#627288', font: { family: 'Outfit', size: 10 } }
                }
            }
        }
    });
}

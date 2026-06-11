/**
 * Products & Details Management Page (Phase 4)
 * ============================================
 * Provides advanced product search (FTS5), dynamic filtering, status overrides,
 * bulk actions (delete, restore, reclassify), and links to single-product edits.
 */

import { adminFetch, showToast, state, t } from '../admin.js';
import { render as renderProductDetail } from './product-detail.js';

// Page-level states
let brands = [];
let categories = [];
let subcategories = [];
let products = [];
let pagination = { currentPage: 1, totalPages: 1, totalItems: 0 };
let selectedIds = new Set();

// Active Filters
let activeFilters = {
    search: '',
    brand_id: '',
    category_id: '',
    subcategory_id: '',
    stock_status: 'all',
    min_price: '',
    max_price: '',
    is_featured: '',
    is_trending: '',
    is_deleted: 'false', // Default: show active products only
    sort: 'ranking_score',
    page: 1,
    limit: 20
};

const isViewer = () => state.user?.role === 'viewer';
const isEditor = () => state.user?.role === 'editor' || state.user?.role === 'super_admin';
const isSuperAdmin = () => state.user?.role === 'super_admin';

/**
 * Main render function called by SPA Router.
 * Handles delegating to Detail View if parameters are present.
 */
export async function render(container, action, productId) {
    const isRtl = state.lang === 'ar';
    
    // If routing to edit/details
    if ((action === 'edit' || action === 'detail') && productId) {
        // Render detail view
        container.innerHTML = `<div id="product-detail-container"></div>`;
        const detailContainer = document.getElementById('product-detail-container');
        await renderProductDetail(detailContainer, productId);
        return;
    }

    // Otherwise, render list view
    selectedIds.clear();
    await initData();
    renderListLayout(container);
    await fetchProducts();
}

/**
 * Initialize brand and category filter lists
 */
async function initData() {
    try {
        const [brandsRes, categoriesRes] = await Promise.all([
            adminFetch('/api/admin/brands'),
            adminFetch('/api/admin/categories')
        ]);
        
        if (brandsRes.success) brands = brandsRes.brands || [];
        if (categoriesRes.success) categories = categoriesRes.categories || [];
    } catch (err) {
        showToast(state.lang === 'ar' ? 'فشل تحميل بيانات التصفية' : 'Failed to load filter reference data', 'danger');
        console.error(err);
    }
}

/**
 * Fetch products list from API based on current filters
 */
async function fetchProducts() {
    const tableBody = document.getElementById('products-table-body');
    const paginationEl = document.getElementById('products-pagination');
    const totalCountEl = document.getElementById('total-products-count');
    
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 40px;">
                    <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 24px; color: var(--primary); margin-bottom: 8px;"></i>
                    <div>${state.lang === 'ar' ? 'جاري تحميل المنتجات...' : 'Loading products...'}</div>
                </td>
            </tr>
        `;
    }

    try {
        // Build query string
        const queryParams = new URLSearchParams();
        for (const [key, val] of Object.entries(activeFilters)) {
            if (val !== undefined && val !== null && val !== '') {
                queryParams.append(key, val);
            }
        }

        const res = await adminFetch(`/api/admin/products?${queryParams.toString()}`);
        if (res.success) {
            products = res.products || [];
            pagination = res.pagination || { currentPage: 1, totalPages: 1, totalItems: 0 };
            
            // Reset selected list
            selectedIds.clear();
            updateBulkActionBar();

            if (totalCountEl) totalCountEl.textContent = pagination.totalItems;
            
            renderTableData();
            renderPaginationControls(paginationEl);
        }
    } catch (err) {
        showToast(state.lang === 'ar' ? 'فشل تحميل المنتجات' : 'Failed to fetch products', 'danger');
        if (tableBody) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 40px; color: var(--danger);">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 24px; margin-bottom: 8px;"></i>
                        <div>${err.message || (state.lang === 'ar' ? 'حدث خطأ أثناء الاتصال بالخادم' : 'Error contacting server')}</div>
                    </td>
                </tr>
            `;
        }
    }
}

/**
 * Render the frame of the product list page
 */
function renderListLayout(container) {
    const isRtl = state.lang === 'ar';
    
    container.innerHTML = `
        <style>
            .products-page-layout {
                display: flex;
                flex-direction: column;
                gap: 24px;
            }
            .page-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 16px;
            }
            .page-title-section {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .page-title {
                font-size: 24px;
                font-weight: 700;
                background: linear-gradient(to right, #fff, #94a3b8);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            .page-subtitle {
                font-size: 13px;
                color: var(--text-secondary);
            }
            .filter-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 16px;
            }
            .filter-actions {
                display: flex;
                justify-content: flex-end;
                gap: 12px;
                margin-top: 16px;
                border-top: 1px solid rgba(255,255,255,0.04);
                padding-top: 16px;
            }
            .product-thumb {
                width: 44px;
                height: 44px;
                border-radius: var(--radius-sm);
                object-fit: cover;
                background: rgba(255,255,255,0.03);
                border: 1px solid var(--border-base);
            }
            .product-meta-cell {
                display: flex;
                flex-direction: column;
                gap: 4px;
                max-width: 320px;
            }
            .product-name-en {
                font-size: 14px;
                font-weight: 600;
                color: var(--text-primary);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .product-name-ar {
                font-size: 12px;
                color: var(--text-muted);
                font-family: 'Noto Kufi Arabic', sans-serif;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .product-slug {
                font-size: 11px;
                color: var(--text-muted);
                font-family: var(--font-mono);
            }
            .rank-cell {
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                gap: 2px;
            }
            .rank-score {
                font-family: var(--font-mono);
                font-weight: 600;
                color: var(--primary-light);
            }
            .rank-override-badge {
                font-size: 10px;
                background: rgba(168, 85, 247, 0.15);
                color: var(--secondary);
                border: 1px solid rgba(168, 85, 247, 0.25);
                padding: 1px 4px;
                border-radius: 4px;
                margin-top: 2px;
            }
            /* Floating bulk actions bar */
            .bulk-action-bar {
                position: fixed;
                bottom: 24px;
                left: 50%;
                transform: translateX(-50%) translateY(100px);
                background: rgba(15, 23, 42, 0.85);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border: 1px solid var(--primary);
                box-shadow: 0 10px 30px rgba(99, 102, 241, 0.25);
                border-radius: var(--radius-xl);
                padding: 14px 24px;
                display: flex;
                align-items: center;
                gap: 20px;
                z-index: 1000;
                transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            }
            .bulk-action-bar.visible {
                transform: translateX(-50%) translateY(0);
            }
            .bulk-count {
                font-size: 13px;
                font-weight: 600;
                color: var(--text-primary);
            }
            .bulk-actions-group {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .select-inline-wrapper {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .cell-badge-container {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
            }
        </style>

        <div class="products-page-layout">
            <!-- Header Section -->
            <div class="page-header">
                <div class="page-title-section">
                    <h1 class="page-title">${isRtl ? 'وحدة إدارة المنتجات' : 'Product Management Console'}</h1>
                    <p class="page-subtitle">
                        ${isRtl ? 'إدارة محتويات وتصنيفات وأولويات المنتجات وإجراء تعديلات جماعية.' : 'Manage product listings, details, manual ranks, categories, and bulk operations.'}
                        (<span id="total-products-count">0</span> ${isRtl ? 'منتج إجمالاً' : 'products total'})
                    </p>
                </div>
            </div>

            <!-- Advanced Filters Card -->
            <div class="card">
                <div class="card-header">
                    <div class="card-title">
                        <i class="fa-solid fa-filter"></i>
                        <span>${isRtl ? 'أدوات التصفية المتقدمة' : 'Advanced Filters'}</span>
                    </div>
                </div>
                
                <div class="filter-grid">
                    <!-- FTS5 Search -->
                    <div class="form-group">
                        <label class="form-label">${isRtl ? 'بحث النص الكامل' : 'FTS Search'}</label>
                        <div class="input-wrapper">
                            <i class="fa-solid fa-search input-icon"></i>
                            <input type="text" id="filter-search" class="form-input" placeholder="${isRtl ? 'ابحث بالاسم، الموديل...' : 'Search name, SKU, details...'}" value="${activeFilters.search}">
                        </div>
                    </div>

                    <!-- Category Filter -->
                    <div class="form-group">
                        <label class="form-label">${isRtl ? 'القسم الرئيسي' : 'Category'}</label>
                        <select id="filter-category" class="form-input" style="padding-left: 12px; padding-right: 12px;">
                            <option value="">${isRtl ? 'كل الأقسام' : 'All Categories'}</option>
                            ${categories.map(c => `<option value="${c.id}" ${activeFilters.category_id == c.id ? 'selected' : ''}>${isRtl ? c.name_ar || c.name : c.name || c.name_ar}</option>`).join('')}
                        </select>
                    </div>

                    <!-- Subcategory Filter -->
                    <div class="form-group">
                        <label class="form-label">${isRtl ? 'القسم الفرعي' : 'Subcategory'}</label>
                        <select id="filter-subcategory" class="form-input" style="padding-left: 12px; padding-right: 12px;" ${!activeFilters.category_id ? 'disabled' : ''}>
                            <option value="">${isRtl ? 'كل الأقسام الفرعية' : 'All Subcategories'}</option>
                        </select>
                    </div>

                    <!-- Brand Filter -->
                    <div class="form-group">
                        <label class="form-label">${isRtl ? 'العلامة التجارية' : 'Brand'}</label>
                        <select id="filter-brand" class="form-input" style="padding-left: 12px; padding-right: 12px;">
                            <option value="">${isRtl ? 'كل العلامات' : 'All Brands'}</option>
                            ${brands.map(b => `<option value="${b.id}" ${activeFilters.brand_id == b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
                        </select>
                    </div>

                    <!-- Stock Status Filter -->
                    <div class="form-group">
                        <label class="form-label">${isRtl ? 'حالة التوفر' : 'Stock Status'}</label>
                        <select id="filter-stock" class="form-input" style="padding-left: 12px; padding-right: 12px;">
                            <option value="all" ${activeFilters.stock_status === 'all' ? 'selected' : ''}>${isRtl ? 'الجميع' : 'All Stock States'}</option>
                            <option value="in_stock" ${activeFilters.stock_status === 'in_stock' ? 'selected' : ''}>${isRtl ? 'متوفر في المخزن' : 'In Stock'}</option>
                            <option value="out_of_stock" ${activeFilters.stock_status === 'out_of_stock' ? 'selected' : ''}>${isRtl ? 'غير متوفر' : 'Out of Stock'}</option>
                        </select>
                    </div>

                    <!-- Featured Filter -->
                    <div class="form-group">
                        <label class="form-label">${isRtl ? 'منتجات مميزة' : 'Featured'}</label>
                        <select id="filter-featured" class="form-input" style="padding-left: 12px; padding-right: 12px;">
                            <option value="" ${activeFilters.is_featured === '' ? 'selected' : ''}>${isRtl ? 'الكل' : 'All'}</option>
                            <option value="true" ${activeFilters.is_featured === 'true' ? 'selected' : ''}>${isRtl ? 'مميز فقط' : 'Featured Only'}</option>
                            <option value="false" ${activeFilters.is_featured === 'false' ? 'selected' : ''}>${isRtl ? 'غير مميز' : 'Standard'}</option>
                        </select>
                    </div>

                    <!-- Trending Filter -->
                    <div class="form-group">
                        <label class="form-label">${isRtl ? 'المنتجات الرائجة' : 'Trending'}</label>
                        <select id="filter-trending" class="form-input" style="padding-left: 12px; padding-right: 12px;">
                            <option value="" ${activeFilters.is_trending === '' ? 'selected' : ''}>${isRtl ? 'الكل' : 'All'}</option>
                            <option value="true" ${activeFilters.is_trending === 'true' ? 'selected' : ''}>${isRtl ? 'رائج فقط' : 'Trending Only'}</option>
                            <option value="false" ${activeFilters.is_trending === 'false' ? 'selected' : ''}>${isRtl ? 'غير رائج' : 'Standard'}</option>
                        </select>
                    </div>

                    <!-- Deleted/Archived Filter -->
                    <div class="form-group">
                        <label class="form-label">${isRtl ? 'حالة الحذف' : 'Archived / Deleted'}</label>
                        <select id="filter-deleted" class="form-input" style="padding-left: 12px; padding-right: 12px;">
                            <option value="false" ${activeFilters.is_deleted === 'false' ? 'selected' : ''}>${isRtl ? 'النشطة فقط' : 'Active Only'}</option>
                            <option value="true" ${activeFilters.is_deleted === 'true' ? 'selected' : ''}>${isRtl ? 'المحذوفة مؤقتاً' : 'Soft-Deleted Only'}</option>
                            <option value="all" ${activeFilters.is_deleted === 'all' ? 'selected' : ''}>${isRtl ? 'الكل (نشط ومحذوف)' : 'All Records'}</option>
                        </select>
                    </div>

                    <!-- Price Min -->
                    <div class="form-group">
                        <label class="form-label">${isRtl ? 'السعر الأدنى (ج.م)' : 'Min Price (EGP)'}</label>
                        <input type="number" id="filter-min-price" class="form-input" placeholder="0" value="${activeFilters.min_price}">
                    </div>

                    <!-- Price Max -->
                    <div class="form-group">
                        <label class="form-label">${isRtl ? 'السعر الأقصى (ج.م)' : 'Max Price (EGP)'}</label>
                        <input type="number" id="filter-max-price" class="form-input" placeholder="150000" value="${activeFilters.max_price}">
                    </div>

                    <!-- Sort Fields -->
                    <div class="form-group">
                        <label class="form-label">${isRtl ? 'ترتيب حسب' : 'Sort By'}</label>
                        <select id="filter-sort" class="form-input" style="padding-left: 12px; padding-right: 12px;">
                            <option value="ranking_score" ${activeFilters.sort === 'ranking_score' ? 'selected' : ''}>${isRtl ? 'نقاط الترتيب' : 'Ranking Score'}</option>
                            <option value="name_en" ${activeFilters.sort === 'name_en' ? 'selected' : ''}>${isRtl ? 'الاسم بالإنجليزية' : 'English Name'}</option>
                            <option value="name_ar" ${activeFilters.sort === 'name_ar' ? 'selected' : ''}>${isRtl ? 'الاسم بالعربية' : 'Arabic Name'}</option>
                            <option value="view_count" ${activeFilters.sort === 'view_count' ? 'selected' : ''}>${isRtl ? 'عدد المشاهدات' : 'Views Count'}</option>
                        </select>
                    </div>
                </div>

                <div class="filter-actions">
                    <button id="btn-reset-filters" class="btn"><i class="fa-solid fa-arrow-rotate-left"></i> ${isRtl ? 'إعادة ضبط' : 'Reset'}</button>
                    <button id="btn-apply-filters" class="btn btn-primary"><i class="fa-solid fa-magnifying-glass"></i> ${isRtl ? 'تطبيق التصفية' : 'Search'}</button>
                </div>
            </div>

            <!-- Products Listing Card -->
            <div class="card">
                <div class="table-wrapper">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th style="width: 40px; text-align: center;">
                                    <input type="checkbox" id="check-all-products" ${isViewer() ? 'disabled' : ''}>
                                </th>
                                <th style="width: 60px;">${isRtl ? 'صورة' : 'Image'}</th>
                                <th>${isRtl ? 'تفاصيل المنتج' : 'Product Details'}</th>
                                <th>${isRtl ? 'التصنيف / العلامة' : 'Category / Brand'}</th>
                                <th style="text-align: center;">${isRtl ? 'إحصائيات' : 'Stats'}</th>
                                <th>${isRtl ? 'نطاق الأسعار' : 'Price Range'}</th>
                                <th>${isRtl ? 'الترتيب' : 'Rank'}</th>
                                <th>${isRtl ? 'الحالة' : 'Status'}</th>
                                <th style="text-align: center; width: 150px;">${isRtl ? 'إجراءات' : 'Actions'}</th>
                            </tr>
                        </thead>
                        <tbody id="products-table-body">
                            <!-- Populated dynamically -->
                        </tbody>
                    </table>
                </div>

                <!-- Pagination area -->
                <div id="products-pagination" class="pagination">
                    <!-- Populated dynamically -->
                </div>
            </div>
        </div>

        <!-- Floating Bulk Action Bar -->
        <div id="bulk-action-bar" class="bulk-action-bar">
            <span class="bulk-count"><span id="bulk-selected-count">0</span> ${isRtl ? 'محددة' : 'selected'}</span>
            <div class="bulk-actions-group">
                <div class="select-inline-wrapper">
                    <select id="bulk-move-subcategory" class="form-input" style="padding: 6px 12px; font-size: 12px; width: 180px;">
                        <option value="">${isRtl ? 'انقل للقسم الفرعي...' : 'Move to Subcategory...'}</option>
                        ${categories.map(c => `
                            <optgroup label="${isRtl ? c.name_ar || c.name : c.name || c.name_ar}">
                                <!-- Will populate dynamically or list categories -->
                            </optgroup>
                        `).join('')}
                    </select>
                    <button id="btn-bulk-move" class="btn btn-success" style="padding: 6px 14px; font-size: 12px;"><i class="fa-solid fa-arrows-up-down-left-right"></i> ${isRtl ? 'نقل' : 'Move'}</button>
                </div>
                <div style="width: 1px; height: 20px; background: rgba(255,255,255,0.1);"></div>
                <button id="btn-bulk-delete" class="btn btn-danger" style="padding: 6px 14px; font-size: 12px;"><i class="fa-solid fa-trash-can"></i> ${isRtl ? 'حذف مؤقت' : 'Soft Delete'}</button>
                <button id="btn-bulk-restore" class="btn btn-primary" style="padding: 6px 14px; font-size: 12px;"><i class="fa-solid fa-trash-arrow-up"></i> ${isRtl ? 'إستعادة' : 'Restore'}</button>
            </div>
        </div>
    `;

    // Populate Subcategories if category filter is active
    if (activeFilters.category_id) {
        updateSubcategoriesFilter(activeFilters.category_id);
    }

    // Populate bulk subcategories options
    populateBulkSubcategories();

    // Wire up events
    setupEvents();
}

/**
 * Setup DOM event listeners
 */
function setupEvents() {
    const isRtl = state.lang === 'ar';

    // Filter selectors
    document.getElementById('filter-category').addEventListener('change', async (e) => {
        const catId = e.target.value;
        activeFilters.category_id = catId;
        activeFilters.subcategory_id = ''; // Reset subcat
        
        const subcatSelect = document.getElementById('filter-subcategory');
        if (catId) {
            subcatSelect.disabled = false;
            await updateSubcategoriesFilter(catId);
        } else {
            subcatSelect.disabled = true;
            subcatSelect.innerHTML = `<option value="">${isRtl ? 'كل الأقسام الفرعية' : 'All Subcategories'}</option>`;
        }
    });

    // Apply filters
    document.getElementById('btn-apply-filters').addEventListener('click', () => {
        activeFilters.search = document.getElementById('filter-search').value;
        activeFilters.brand_id = document.getElementById('filter-brand').value;
        activeFilters.subcategory_id = document.getElementById('filter-subcategory').value;
        activeFilters.stock_status = document.getElementById('filter-stock').value;
        activeFilters.min_price = document.getElementById('filter-min-price').value;
        activeFilters.max_price = document.getElementById('filter-max-price').value;
        activeFilters.is_featured = document.getElementById('filter-featured').value;
        activeFilters.is_trending = document.getElementById('filter-trending').value;
        activeFilters.is_deleted = document.getElementById('filter-deleted').value;
        activeFilters.sort = document.getElementById('filter-sort').value;
        activeFilters.page = 1; // reset page
        
        fetchProducts();
    });

    // Reset filters
    document.getElementById('btn-reset-filters').addEventListener('click', () => {
        activeFilters = {
            search: '',
            brand_id: '',
            category_id: '',
            subcategory_id: '',
            stock_status: 'all',
            min_price: '',
            max_price: '',
            is_featured: '',
            is_trending: '',
            is_deleted: 'false',
            sort: 'ranking_score',
            page: 1,
            limit: 20
        };
        
        // Re-render structural layout to reset selections
        renderListLayout(document.getElementById('app-content'));
        fetchProducts();
    });

    // Check All Checkbox
    const checkAll = document.getElementById('check-all-products');
    if (checkAll) {
        checkAll.addEventListener('change', (e) => {
            const checked = e.target.checked;
            const itemChecks = document.querySelectorAll('.product-row-checkbox');
            
            itemChecks.forEach(cb => {
                cb.checked = checked;
                const id = parseInt(cb.dataset.id, 10);
                if (checked) {
                    selectedIds.add(id);
                } else {
                    selectedIds.delete(id);
                }
            });
            updateBulkActionBar();
        });
    }

    // Bulk Delete
    document.getElementById('btn-bulk-delete').addEventListener('click', async () => {
        if (isViewer()) return;
        if (selectedIds.size === 0) return;
        
        const confirmMsg = isRtl 
            ? `هل أنت متأكد من حذف ${selectedIds.size} منتجات مؤقتاً؟`
            : `Are you sure you want to soft delete ${selectedIds.size} products?`;
            
        if (!confirm(confirmMsg)) return;

        try {
            const res = await adminFetch('/api/admin/products/bulk', {
                method: 'POST',
                body: {
                    action: 'delete',
                    ids: Array.from(selectedIds)
                }
            });
            if (res.success) {
                showToast(isRtl ? 'تم حذف المنتجات المحددة مؤقتاً بنجاح' : 'Selected products soft-deleted successfully', 'success');
                selectedIds.clear();
                fetchProducts();
            }
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });

    // Bulk Restore
    document.getElementById('btn-bulk-restore').addEventListener('click', async () => {
        if (isViewer()) return;
        if (selectedIds.size === 0) return;
        
        try {
            const res = await adminFetch('/api/admin/products/bulk', {
                method: 'POST',
                body: {
                    action: 'restore',
                    ids: Array.from(selectedIds)
                }
            });
            if (res.success) {
                showToast(isRtl ? 'تم استعادة المنتجات المحددة بنجاح' : 'Selected products restored successfully', 'success');
                selectedIds.clear();
                fetchProducts();
            }
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });

    // Bulk Move Subcategory
    document.getElementById('btn-bulk-move').addEventListener('click', async () => {
        if (isViewer()) return;
        if (selectedIds.size === 0) return;
        
        const subcatId = document.getElementById('bulk-move-subcategory').value;
        if (!subcatId) {
            showToast(isRtl ? 'يرجى اختيار القسم الفرعي المستهدف أولاً' : 'Please select target subcategory first', 'warning');
            return;
        }

        const confirmMsg = isRtl 
            ? `هل تريد نقل ${selectedIds.size} منتجات إلى القسم المحدد؟`
            : `Are you sure you want to move ${selectedIds.size} products to the selected subcategory?`;
            
        if (!confirm(confirmMsg)) return;

        try {
            const res = await adminFetch('/api/admin/products/bulk', {
                method: 'POST',
                body: {
                    action: 'move',
                    ids: Array.from(selectedIds),
                    subcategoryId: parseInt(subcatId, 10)
                }
            });
            if (res.success) {
                showToast(isRtl ? 'تم نقل المنتجات المحددة بنجاح' : 'Selected products moved successfully', 'success');
                selectedIds.clear();
                fetchProducts();
            }
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });
}

/**
 * Fetch and load subcategories list for filter dropdown
 */
async function updateSubcategoriesFilter(categoryId) {
    const isRtl = state.lang === 'ar';
    const subcatSelect = document.getElementById('filter-subcategory');
    
    subcatSelect.innerHTML = `<option value="">${isRtl ? 'جاري التحميل...' : 'Loading subcategories...'}</option>`;
    
    try {
        const res = await adminFetch(`/api/admin/categories/${categoryId}/subcategories`);
        if (res.success) {
            const subcats = res.subcategories || [];
            let options = `<option value="">${isRtl ? 'كل الأقسام الفرعية' : 'All Subcategories'}</option>`;
            
            subcats.forEach(s => {
                options += `<option value="${s.id}" ${activeFilters.subcategory_id == s.id ? 'selected' : ''}>${isRtl ? s.name_ar || s.name : s.name || s.name_ar}</option>`;
            });
            
            subcatSelect.innerHTML = options;
        }
    } catch (err) {
        console.error(err);
        subcatSelect.innerHTML = `<option value="">${isRtl ? 'فشل تحميل الأقسام الفرعية' : 'Error loading subcategories'}</option>`;
    }
}

/**
 * Populates options inside bulk-move dropdown optgroups dynamically
 */
async function populateBulkSubcategories() {
    const isRtl = state.lang === 'ar';
    const select = document.getElementById('bulk-move-subcategory');
    if (!select) return;

    try {
        select.innerHTML = `<option value="">${isRtl ? 'انقل للقسم الفرعي...' : 'Move to Subcategory...'}</option>`;
        
        for (const cat of categories) {
            const res = await adminFetch(`/api/admin/categories/${cat.id}/subcategories`);
            if (res.success && res.subcategories?.length > 0) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = isRtl ? cat.name_ar || cat.name : cat.name || cat.name_ar;
                
                res.subcategories.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.textContent = isRtl ? s.name_ar || s.name : s.name || s.name_ar;
                    optgroup.appendChild(opt);
                });
                select.appendChild(optgroup);
            }
        }
    } catch (err) {
        console.error('Failed to populate bulk move categories:', err);
    }
}

/**
 * Updates floating action bar visibility and checkbox states
 */
function updateBulkActionBar() {
    const bar = document.getElementById('bulk-action-bar');
    const countEl = document.getElementById('bulk-selected-count');
    
    if (!bar) return;

    if (selectedIds.size > 0 && !isViewer()) {
        if (countEl) countEl.textContent = selectedIds.size;
        bar.classList.add('visible');
    } else {
        bar.classList.remove('visible');
    }
}

/**
 * Renders raw rows of fetched products
 */
function renderTableData() {
    const isRtl = state.lang === 'ar';
    const tbody = document.getElementById('products-table-body');
    if (!tbody) return;

    if (products.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 60px; color: var(--text-secondary);">
                    <i class="fa-solid fa-box-open" style="font-size: 40px; margin-bottom: 12px; opacity: 0.5;"></i>
                    <div>${isRtl ? 'لم يتم العثور على أي منتجات تطابق شروط التصفية.' : 'No products found matching the criteria.'}</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = products.map(p => {
        const isChecked = selectedIds.has(p.id);
        const nameText = isRtl ? p.name_ar || p.name_en : p.name_en || p.name_ar;
        const subNameText = isRtl ? p.name_en : p.name_ar;
        
        // Status checks
        const isSoftDeleted = p.is_deleted === 1 || p.is_deleted === true;
        const isFeatured = p.is_featured === 1 || p.is_featured === true;
        const isTrending = p.is_trending === 1 || p.is_trending === true;
        
        // Price Formatting
        let priceRangeText = '-';
        if (p.min_price_egp !== null && p.min_price_egp !== undefined) {
            if (p.min_price_egp === p.max_price_egp) {
                priceRangeText = `${p.min_price_egp.toLocaleString()} ${isRtl ? 'ج.م' : 'EGP'}`;
            } else {
                priceRangeText = `${p.min_price_egp.toLocaleString()} - ${p.max_price_egp.toLocaleString()} ${isRtl ? 'ج.م' : 'EGP'}`;
            }
        }

        // Rank Display
        const hasRankOverride = p.manual_rank_override !== null && p.manual_rank_override !== undefined;
        
        return `
            <tr class="${isSoftDeleted ? 'soft-deleted-row' : ''}" style="${isSoftDeleted ? 'opacity: 0.6; background: rgba(239, 68, 68, 0.02);' : ''}">
                <td style="text-align: center; vertical-align: middle;">
                    <input type="checkbox" class="product-row-checkbox" data-id="${p.id}" ${isChecked ? 'checked' : ''} ${isViewer() ? 'disabled' : ''}>
                </td>
                <td style="vertical-align: middle;">
                    ${p.image_url 
                        ? `<img src="${p.image_url}" class="product-thumb" alt="${nameText}" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2244%22 height=%2244%22 viewBox=%220%200%2024%2024%22 fill=%22none%22 stroke=%22%232a3554%22 stroke-width=%221%22><rect width=%2222%22 height=%2222%22 x=%221%22 y=%221%22 rx=%223%22/><text x=%2250%%22 y=%2250%%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23475569%22 font-size=%228%22>No Img</text></svg>'">` 
                        : `<div class="product-thumb" style="display:flex; align-items:center; justify-content:center; color: var(--text-muted);"><i class="fa-solid fa-image"></i></div>`
                    }
                </td>
                <td style="vertical-align: middle;">
                    <div class="product-meta-cell">
                        <div class="product-name-en" title="${nameText}">${nameText}</div>
                        <div class="product-name-ar" title="${subNameText}">${subNameText}</div>
                        <div class="product-slug">ID: ${p.id} | ${p.slug}</div>
                    </div>
                </td>
                <td style="vertical-align: middle;">
                    <div style="font-weight: 600; color: var(--text-primary);">${p.brand_name || '-'}</div>
                    <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                        ${p.category_name || '-'} &gt; ${p.subcategory_name || '-'}
                    </div>
                </td>
                <td style="text-align: center; vertical-align: middle;">
                    <div style="font-size: 13px; font-weight: 600;" title="${isRtl ? 'الموديلات / العروض النشطة' : 'Variants / Active Offers'}">
                        <i class="fa-solid fa-tags" style="color: var(--text-muted); font-size: 11px; margin-inline-end: 4px;"></i>
                        <span>${p.variant_count || 0}</span> / <span style="color: var(--success);">${p.offer_count || 0}</span>
                    </div>
                    <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">
                        <i class="fa-solid fa-eye" style="font-size: 9px; margin-inline-end: 2px;"></i> ${p.view_count || 0}
                    </div>
                </td>
                <td style="vertical-align: middle; font-weight: 600; color: var(--text-primary); font-family: var(--font-mono);">
                    ${priceRangeText}
                </td>
                <td style="vertical-align: middle;">
                    <div class="rank-cell">
                        <span class="rank-score">${p.ranking_score ? p.ranking_score.toFixed(1) : '0.0'}</span>
                        ${hasRankOverride ? `<span class="rank-override-badge" title="${isRtl ? 'تجاوز رتبة يدوي' : 'Manual Override'}"><i class="fa-solid fa-user-pen"></i> Override</span>` : ''}
                    </div>
                </td>
                <td style="vertical-align: middle;">
                    <div class="cell-badge-container">
                        ${isSoftDeleted ? `<span class="badge badge-danger">${isRtl ? 'محذوف' : 'Deleted'}</span>` : ''}
                        ${isFeatured ? `<span class="badge badge-success" style="background: rgba(16,185,129,0.1); border-color: var(--success);"><i class="fa-solid fa-star" style="margin-inline-end: 3px;"></i>${isRtl ? 'مميز' : 'Featured'}</span>` : ''}
                        ${isTrending ? `<span class="badge badge-info"><i class="fa-solid fa-fire" style="margin-inline-end: 3px;"></i>${isRtl ? 'رائج' : 'Trending'}</span>` : ''}
                        ${(!isSoftDeleted && !isFeatured && !isTrending) ? `<span class="badge badge-warning" style="background: rgba(98,114,136,0.1); border-color: var(--text-muted); color: var(--text-secondary);">${isRtl ? 'قياسي' : 'Standard'}</span>` : ''}
                    </div>
                </td>
                <td style="vertical-align: middle; text-align: center;">
                    <div style="display: inline-flex; gap: 6px;">
                        <!-- Edit Button -->
                        <a href="#/products/edit/${p.id}" class="btn" style="padding: 6px 10px; font-size: 11px;" title="${isRtl ? 'تعديل وتفاصيل' : 'Edit & Details'}">
                            <i class="fa-solid fa-pencil"></i>
                        </a>

                        <!-- Quick Toggle Featured -->
                        <button class="btn btn-toggle-featured" data-id="${p.id}" data-featured="${isFeatured}" style="padding: 6px 10px; font-size: 11px; ${isFeatured ? 'color: var(--warning); border-color: var(--warning); background: rgba(245,158,11,0.05);' : ''}" title="${isRtl ? 'تمييز المنتج' : 'Toggle Featured'}" ${isViewer() ? 'disabled' : ''}>
                            <i class="fa-${isFeatured ? 'solid' : 'regular'} fa-star"></i>
                        </button>

                        <!-- Delete / Restore Quick Button -->
                        ${isSoftDeleted 
                            ? `<button class="btn btn-success btn-quick-restore" data-id="${p.id}" style="padding: 6px 10px; font-size: 11px;" title="${isRtl ? 'استعادة' : 'Restore Product'}" ${isViewer() ? 'disabled' : ''}>
                                 <i class="fa-solid fa-trash-arrow-up"></i>
                               </button>`
                            : `<button class="btn btn-danger btn-quick-delete" data-id="${p.id}" style="padding: 6px 10px; font-size: 11px;" title="${isRtl ? 'حذف مؤقت' : 'Soft Delete'}" ${isViewer() ? 'disabled' : ''}>
                                 <i class="fa-solid fa-trash-can"></i>
                               </button>`
                        }
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    // Wire up checkbox events
    document.querySelectorAll('.product-row-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const id = parseInt(e.target.dataset.id, 10);
            if (e.target.checked) {
                selectedIds.add(id);
            } else {
                selectedIds.delete(id);
            }
            
            // Check if all row checkboxes are selected to update the header
            const allCheckboxes = document.querySelectorAll('.product-row-checkbox');
            const checkedCheckboxes = document.querySelectorAll('.product-row-checkbox:checked');
            const checkAll = document.getElementById('check-all-products');
            if (checkAll) {
                checkAll.checked = allCheckboxes.length > 0 && allCheckboxes.length === checkedCheckboxes.length;
            }
            
            updateBulkActionBar();
        });
    });

    // Wire up Quick Toggle Featured
    document.querySelectorAll('.btn-toggle-featured').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (isViewer()) return;
            const btnEl = e.currentTarget;
            const id = parseInt(btnEl.dataset.id, 10);
            const currentFeatured = btnEl.dataset.featured === 'true';
            
            try {
                // In AdminProductService, updateProduct handles toggles
                const res = await adminFetch(`/api/admin/products/${id}`, {
                    method: 'PUT',
                    body: {
                        is_featured: !currentFeatured,
                        name_en: products.find(p => p.id === id).name_en, // required fields
                        name_ar: products.find(p => p.id === id).name_ar, // required fields
                        brand_id: products.find(p => p.id === id).brand_id, // required fields
                        subcategory_id: products.find(p => p.id === id).subcategory_id // required fields
                    }
                });
                
                if (res.success) {
                    showToast(isRtl ? 'تم تحديث حالة تمييز المنتج' : 'Product featured status updated', 'success');
                    fetchProducts();
                }
            } catch (err) {
                showToast(err.message, 'danger');
            }
        });
    });

    // Wire up Quick Delete
    document.querySelectorAll('.btn-quick-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (isViewer()) return;
            const id = parseInt(e.currentTarget.dataset.id, 10);
            
            const confirmMsg = isRtl
                ? 'هل أنت متأكد من حذف هذا المنتج مؤقتاً؟'
                : 'Are you sure you want to soft delete this product?';
                
            if (!confirm(confirmMsg)) return;

            try {
                const res = await adminFetch(`/api/admin/products/${id}/soft-delete`, { method: 'POST' });
                if (res.success) {
                    showToast(isRtl ? 'تم حذف المنتج مؤقتاً' : 'Product soft-deleted successfully', 'success');
                    fetchProducts();
                }
            } catch (err) {
                showToast(err.message, 'danger');
            }
        });
    });

    // Wire up Quick Restore
    document.querySelectorAll('.btn-quick-restore').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (isViewer()) return;
            const id = parseInt(e.currentTarget.dataset.id, 10);
            
            try {
                const res = await adminFetch(`/api/admin/products/${id}/restore`, { method: 'POST' });
                if (res.success) {
                    showToast(isRtl ? 'تم استعادة المنتج بنجاح' : 'Product restored successfully', 'success');
                    fetchProducts();
                }
            } catch (err) {
                showToast(err.message, 'danger');
            }
        });
    });
}

/**
 * Render pagination numbers and controls
 */
function renderPaginationControls(el) {
    if (!el) return;
    const isRtl = state.lang === 'ar';

    const cur = pagination.currentPage;
    const total = pagination.totalPages;
    const totalItems = pagination.totalItems;

    if (total <= 1) {
        el.innerHTML = `
            <div class="pagination-info">
                ${isRtl ? `عرض ${totalItems} منتج` : `Showing ${totalItems} products`}
            </div>
            <div></div>
        `;
        return;
    }

    // Generate pagination pages buttons
    let buttonsHtml = '';
    const maxPageButtons = 5;
    let startPage = Math.max(1, cur - 2);
    let endPage = Math.min(total, startPage + maxPageButtons - 1);
    
    if (endPage - startPage < maxPageButtons - 1) {
        startPage = Math.max(1, endPage - maxPageButtons + 1);
    }

    // Prev Button
    buttonsHtml += `
        <button class="btn btn-page" data-page="${cur - 1}" ${cur === 1 ? 'disabled' : ''} style="padding: 6px 12px;">
            <i class="fa-solid fa-chevron-${isRtl ? 'right' : 'left'}"></i>
        </button>
    `;

    if (startPage > 1) {
        buttonsHtml += `<button class="btn btn-page" data-page="1" style="padding: 6px 12px;">1</button>`;
        if (startPage > 2) {
            buttonsHtml += `<span style="color: var(--text-muted); align-self: center; padding: 0 4px;">...</span>`;
        }
    }

    for (let p = startPage; p <= endPage; p++) {
        buttonsHtml += `
            <button class="btn btn-page ${p === cur ? 'btn-primary' : ''}" data-page="${p}" style="padding: 6px 12px; ${p === cur ? 'border:none;' : ''}">
                ${p}
            </button>
        `;
    }

    if (endPage < total) {
        if (endPage < total - 1) {
            buttonsHtml += `<span style="color: var(--text-muted); align-self: center; padding: 0 4px;">...</span>`;
        }
        buttonsHtml += `<button class="btn btn-page" data-page="${total}" style="padding: 6px 12px;">${total}</button>`;
    }

    // Next Button
    buttonsHtml += `
        <button class="btn btn-page" data-page="${cur + 1}" ${cur === total ? 'disabled' : ''} style="padding: 6px 12px;">
            <i class="fa-solid fa-chevron-${isRtl ? 'left' : 'right'}"></i>
        </button>
    `;

    // Render Info & Controls
    const startIdx = (cur - 1) * activeFilters.limit + 1;
    const endIdx = Math.min(cur * activeFilters.limit, totalItems);

    el.innerHTML = `
        <div class="pagination-info">
            ${isRtl 
                ? `عرض <strong>${startIdx}</strong> إلى <strong>${endIdx}</strong> من إجمالي <strong>${totalItems}</strong> منتج`
                : `Showing <strong>${startIdx}</strong> - <strong>${endIdx}</strong> of <strong>${totalItems}</strong> products`
            }
        </div>
        <div class="pagination-controls">
            ${buttonsHtml}
        </div>
    `;

    // Bind page change events
    el.querySelectorAll('.btn-page').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const pageNum = parseInt(e.currentTarget.dataset.page, 10);
            if (pageNum >= 1 && pageNum <= total && pageNum !== cur) {
                activeFilters.page = pageNum;
                fetchProducts();
            }
        });
    });
}

/**
 * Categories & Subcategories Management Page
 * ==========================================
 * Provides complete hierarchical CRUD, custom sorting reorder controls,
 * auto-classification keywords management, and async product reclassification.
 */

import { adminFetch, showToast, state, t } from '../admin.js';

// Page-level states
let categoriesData = [];
let subcategoriesMap = {}; // categoryId -> subcategories array
let selectedCategoryId = null;
let keywordsData = [];
let keywordSearchQuery = '';

const isViewer = () => state.user?.role === 'viewer';
const isEditor = () => state.user?.role === 'editor' || state.user?.role === 'super_admin';
const isSuperAdmin = () => state.user?.role === 'super_admin';

// Helper to generate slug from name
function slugify(text) {
    return text.toString().toLowerCase()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
        .replace(/\-\-+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start
        .replace(/-+$/, '');            // Trim - from end
}

export async function render(container) {
    // 1. Draw page layout structural skeleton and custom styling
    const isRtl = state.lang === 'ar';
    
    container.innerHTML = `
        <style>
        .category-page-layout {
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
        .header-actions {
            display: flex;
            gap: 12px;
        }
        .cols-grid {
            display: grid;
            grid-template-columns: 1.25fr 0.75fr;
            gap: 24px;
        }
        @media (max-width: 1100px) {
            .cols-grid {
                grid-template-columns: 1fr;
            }
        }
        .categories-tree {
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .category-node {
            background: var(--bg-card);
            border: 1px solid var(--border-base);
            border-radius: var(--radius-lg);
            overflow: hidden;
            transition: all var(--transition-base);
        }
        .category-node:hover {
            border-color: var(--border-bright);
        }
        .category-node.selected {
            border-color: var(--primary);
            box-shadow: 0 0 15px var(--primary-glow);
            background: rgba(99, 102, 241, 0.05);
        }
        .category-node-header {
            padding: 16px 20px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            cursor: pointer;
            user-select: none;
        }
        .category-info {
            display: flex;
            align-items: center;
            gap: 14px;
            min-width: 0;
        }
        .category-icon {
            font-size: 20px;
            width: 38px;
            height: 38px;
            border-radius: var(--radius-md);
            background: rgba(255, 255, 255, 0.04);
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid var(--border-base);
            flex-shrink: 0;
        }
        .category-names {
            display: flex;
            flex-direction: column;
            min-width: 0;
        }
        .category-name-en {
            font-size: 14px;
            font-weight: 600;
            color: var(--text-primary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .category-name-ar {
            font-size: 12px;
            color: var(--text-muted);
            font-family: 'Noto Kufi Arabic', sans-serif;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .node-actions {
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .action-icon-btn {
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--border-base);
            color: var(--text-secondary);
            cursor: pointer;
            width: 30px;
            height: 30px;
            border-radius: var(--radius-sm);
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all var(--transition-fast);
        }
        .action-icon-btn:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: var(--border-bright);
            color: var(--text-primary);
            transform: translateY(-1px);
        }
        .action-icon-btn.btn-delete:hover {
            background: rgba(239, 68, 68, 0.1);
            border-color: rgba(239, 68, 68, 0.3);
            color: var(--danger);
        }
        .action-icon-btn:disabled {
            opacity: 0.25;
            cursor: not-allowed;
            background: rgba(0, 0, 0, 0.1) !important;
            border-color: var(--border-base) !important;
            color: var(--text-muted) !important;
            transform: none !important;
        }
        .subcategories-list {
            border-top: 1px solid var(--border-base);
            padding: 12px 16px 16px 52px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            background: rgba(0, 0, 0, 0.15);
        }
        [dir="rtl"] .subcategories-list {
            padding: 12px 52px 16px 16px;
        }
        .subcategory-node {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 14px;
            background: rgba(255, 255, 255, 0.01);
            border: 1px solid rgba(255, 255, 255, 0.03);
            border-radius: var(--radius-md);
            transition: all var(--transition-fast);
        }
        .subcategory-node:hover {
            background: rgba(255, 255, 255, 0.03);
            border-color: rgba(255, 255, 255, 0.08);
        }
        .subcategory-info {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 13px;
            min-width: 0;
        }
        .subcategory-icon {
            font-size: 14px;
            color: var(--text-secondary);
        }
        .subcategory-name {
            font-weight: 500;
            color: var(--text-primary);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .keyword-list-container {
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 400px;
            overflow-y: auto;
            margin-top: 16px;
            padding-right: 6px;
        }
        [dir="rtl"] .keyword-list-container {
            padding-right: 0;
            padding-left: 6px;
        }
        .keyword-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--border-base);
            border-radius: var(--radius-sm);
            font-size: 13px;
        }
        .keyword-text {
            font-weight: 600;
            color: var(--text-primary);
        }
        .keyword-weight {
            font-family: var(--font-mono);
            font-size: 11px;
            color: var(--primary-light);
            background: rgba(99, 102, 241, 0.08);
            padding: 2px 6px;
            border-radius: 4px;
        }
        .keyword-mapping {
            font-size: 11px;
            color: var(--text-secondary);
        }
        .badge-count {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border-base);
            color: var(--text-secondary);
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 12px;
            font-weight: 500;
        }
        .badge-count.products {
            color: var(--primary-light);
            background: rgba(99, 102, 241, 0.05);
            border-color: rgba(99, 102, 241, 0.15);
        }
        </style>

        <div class="category-page-layout">
            <div class="page-header">
                <div>
                    <h1 class="page-title">${isRtl ? 'إدارة الأقسام والتصنيفات' : 'Category & Subcategory Management'}</h1>
                    <p class="page-subtitle">${isRtl ? 'تهيئة هيكلية الأقسام وتصنيفاتها وقواعد الكلمات الدلالية المرتبطة بها.' : 'Configure product classifications, tree hierarchies, and keyword mapping engines.'}</p>
                </div>
                <div class="header-actions">
                    ${!isViewer() ? `
                        <button id="btn-add-category" class="btn btn-primary"><i class="fa-solid fa-plus"></i> <span>${isRtl ? 'إضافة قسم رئيسي' : 'Add Category'}</span></button>
                    ` : ''}
                    ${isSuperAdmin() ? `
                        <button id="btn-reclassify" class="btn btn-danger"><i class="fa-solid fa-wand-magic-sparkles"></i> <span>${isRtl ? 'إعادة تصنيف المنتجات' : 'Reclassify Products'}</span></button>
                    ` : ''}
                </div>
            </div>

            <div class="cols-grid">
                <!-- Left: Categories Tree Card -->
                <div class="col-tree">
                    <div class="card">
                        <div class="card-header">
                            <div class="card-title"><i class="fa-solid fa-folder-tree"></i> <span>${isRtl ? 'شجرة الأقسام' : 'Categories Tree'}</span></div>
                            <div class="card-subtitle">${isRtl ? 'ترتيب وتعديل هيكلية الأقسام الرئيسية والفرعية' : 'Manage category ordering and hierarchy'}</div>
                        </div>
                        <div class="categories-tree" id="categories-tree-container">
                            <!-- Dynamically loaded -->
                            <div style="text-align: center; color: var(--text-muted); padding: 40px;">
                                <i class="fa-solid fa-spinner fa-spin" style="font-size: 24px; margin-bottom: 12px;"></i>
                                <p>Loading categories tree...</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Right: Keywords Panel -->
                <div class="col-keywords" id="keywords-panel-container">
                    <div class="card">
                        <div class="card-header">
                            <div class="card-title"><i class="fa-solid fa-tags"></i> <span>${isRtl ? 'محرك التصنيف التلقائي' : 'Auto-Classification Engine'}</span></div>
                            <div class="card-subtitle">${isRtl ? 'اختر قسماً من اليسار لإدارة الكلمات المفتاحية ومطابقة المنتجات' : 'Select a category to manage classification mapping rules'}</div>
                        </div>
                        <div style="text-align: center; padding: 60px 20px; color: var(--text-muted);">
                            <i class="fa-solid fa-tags" style="font-size: 40px; margin-bottom: 16px; opacity: 0.3;"></i>
                            <p>${isRtl ? 'الرجاء اختيار قسم من القائمة لإدارة الكلمات المفتاحية التلقائية.' : 'Select a category from the tree to view and manage its auto-classification mapping rules.'}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // 2. Load all categories and subcategories
    await loadInitialData();

    // 3. Bind events
    bindGlobalButtons();

    // 4. Render initial categories tree
    renderCategoriesTree();

    // 5. Check if there is a running reclassification job
    pollRunningJobs();
}

async function loadInitialData() {
    try {
        const res = await adminFetch('/api/admin/categories');
        categoriesData = res.categories || [];
        
        // Fetch subcategories for each category
        for (const cat of categoriesData) {
            try {
                const subRes = await adminFetch(`/api/admin/categories/${cat.id}/subcategories`);
                subcategoriesMap[cat.id] = subRes.subcategories || [];
            } catch (err) {
                console.error(`Failed to fetch subcategories for category ${cat.id}:`, err);
                subcategoriesMap[cat.id] = [];
            }
        }
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

function bindGlobalButtons() {
    const isRtl = state.lang === 'ar';

    const addCatBtn = document.getElementById('btn-add-category');
    if (addCatBtn) {
        addCatBtn.addEventListener('click', () => {
            openFormModal({
                title: isRtl ? 'إضافة قسم رئيسي جديد' : 'Create New Category',
                submitLabel: isRtl ? 'إضافة' : 'Create',
                fields: [
                    { name: 'name', label: isRtl ? 'اسم القسم (إنجليزي)' : 'Category Name (English)', required: true, value: '' },
                    { name: 'name_ar', label: isRtl ? 'اسم القسم (عربي)' : 'Category Name (Arabic)', required: false, value: '' },
                    { name: 'slug', label: isRtl ? 'المعرف اللطيف (Slug)' : 'Slug', required: true, value: '' },
                    { name: 'icon', label: isRtl ? 'الأيقونة (رمز تعبيري أو كلاس FA)' : 'Icon (Emoji or FA class)', required: false, value: '📦' },
                    { name: 'seo_title', label: isRtl ? 'عنوان SEO' : 'SEO Title', required: false, value: '' },
                    { name: 'seo_description', label: isRtl ? 'وصف SEO' : 'SEO Description', required: false, value: '' }
                ],
                onSubmit: async (data) => {
                    const res = await adminFetch('/api/admin/categories', {
                        method: 'POST',
                        body: data
                    });
                    showToast(isRtl ? 'تم إضافة القسم بنجاح' : 'Category created successfully', 'success');
                    await loadInitialData();
                    renderCategoriesTree();
                }
            });

            // Auto-slug listener inside modal
            const form = document.getElementById('modal-form');
            if (form) {
                const nameInput = form.elements['name'];
                const slugInput = form.elements['slug'];
                if (nameInput && slugInput) {
                    nameInput.addEventListener('input', (e) => {
                        slugInput.value = slugify(e.target.value);
                    });
                }
            }
        });
    }

    const reclassifyBtn = document.getElementById('btn-reclassify');
    if (reclassifyBtn) {
        reclassifyBtn.addEventListener('click', () => {
            openConfirmModal({
                title: isRtl ? 'تأكيد إعادة تصنيف المنتجات' : 'Reclassify Products Confirmation',
                message: isRtl 
                    ? 'تحذير: ستقوم هذه العملية بمسح كافة تصنيفات المنتجات الحالية وإعادة تعيينها وفقاً لقواعد الكلمات الدلالية الحالية في الخلفية. قد تستغرق العملية عدة دقائق وستقوم تلقائياً بتحديث فصائل المنتجات وتفريغ ذاكرة الكاش.'
                    : 'Warning: This will start a background worker to scan all scraped products and re-assign their category/subcategory according to current classification keywords mapping rules. This process may take a few minutes and will clear caches automatically.',
                confirmLabel: isRtl ? 'بدء العملية' : 'Start Reclassification',
                confirmClass: 'btn-danger',
                onConfirm: async () => {
                    const res = await adminFetch('/api/admin/categories/reclassify', { method: 'POST' });
                    showToast(res.message || 'Job enqueued successfully', 'success');
                    pollRunningJobs();
                }
            });
        });
    }
}

// Check job queue for reclassify jobs to disable/enable button and show status
async function pollRunningJobs() {
    try {
        const dashboardData = await adminFetch('/api/admin/dashboard');
        const jobs = dashboardData.queue?.recentJobs || [];
        const activeReclassifyJob = jobs.find(j => j.job_type === 'reclassify_products' && (j.status === 'pending' || j.status === 'processing'));

        const reclassifyBtn = document.getElementById('btn-reclassify');
        if (reclassifyBtn) {
            if (activeReclassifyJob) {
                reclassifyBtn.disabled = true;
                reclassifyBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>${state.lang === 'ar' ? 'جاري إعادة التصنيف...' : 'Reclassifying...'}</span>`;
                
                // Poll again in 5 seconds
                setTimeout(pollRunningJobs, 5000);
            } else {
                reclassifyBtn.disabled = false;
                reclassifyBtn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> <span>${state.lang === 'ar' ? 'إعادة تصنيف المنتجات' : 'Reclassify Products'}</span>`;
            }
        }
    } catch (e) {
        console.error('Error polling jobs:', e);
    }
}

function renderCategoriesTree() {
    const container = document.getElementById('categories-tree-container');
    if (!container) return;

    if (categoriesData.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: var(--text-secondary); padding: 40px;">
                <i class="fa-solid fa-circle-info" style="font-size: 28px; margin-bottom: 12px; color: var(--text-muted);"></i>
                <p>${state.lang === 'ar' ? 'لم يتم العثور على أقسام رئيسية.' : 'No categories found.'}</p>
            </div>
        `;
        return;
    }

    const isRtl = state.lang === 'ar';

    container.innerHTML = categoriesData.map((cat, index) => {
        const subcategories = subcategoriesMap[cat.id] || [];
        const isSelected = selectedCategoryId === cat.id;

        return `
            <div class="category-node ${isSelected ? 'selected' : ''}" data-id="${cat.id}">
                <div class="category-node-header" onclick="window.selectCategory(${cat.id})">
                    <div class="category-info">
                        <div class="category-icon">${cat.icon || '📦'}</div>
                        <div class="category-names">
                            <span class="category-name-en">${cat.name}</span>
                            ${cat.name_ar ? `<span class="category-name-ar">${cat.name_ar}</span>` : ''}
                        </div>
                        <div style="display: flex; gap: 6px; margin-left: 10px;">
                            <span class="badge-count" title="${isRtl ? 'تصنيفات فرعية' : 'Subcategories'}">${subcategories.length}</span>
                            <span class="badge-count products" title="${isRtl ? 'إجمالي المنتجات' : 'Total Products'}">${cat.product_count || 0} ${isRtl ? 'منتج' : 'prods'}</span>
                            ${cat.is_active === 0 ? `<span class="badge badge-danger">${isRtl ? 'معطل' : 'Disabled'}</span>` : ''}
                        </div>
                    </div>
                    
                    <div class="node-actions" onclick="event.stopPropagation()">
                        <!-- Reorder controls -->
                        ${isEditor() ? `
                            <button class="action-icon-btn" onclick="window.reorderCat(${cat.id}, 'up')" ${index === 0 ? 'disabled' : ''} title="${isRtl ? 'نقل لأعلى' : 'Move Up'}">
                                <i class="fa-solid fa-arrow-up"></i>
                            </button>
                            <button class="action-icon-btn" onclick="window.reorderCat(${cat.id}, 'down')" ${index === categoriesData.length - 1 ? 'disabled' : ''} title="${isRtl ? 'نقل لأسفل' : 'Move Down'}">
                                <i class="fa-solid fa-arrow-down"></i>
                            </button>
                            <button class="action-icon-btn" onclick="window.addSubcategory(${cat.id})" title="${isRtl ? 'إضافة قسم فرعي' : 'Add Subcategory'}">
                                <i class="fa-solid fa-plus"></i>
                            </button>
                            <button class="action-icon-btn" onclick="window.editCategory(${cat.id})" title="${isRtl ? 'تعديل القسم' : 'Edit Category'}">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                        ` : ''}
                        ${isSuperAdmin() ? `
                            <button class="action-icon-btn btn-delete" onclick="window.deleteCategory(${cat.id})" ${cat.product_count > 0 ? 'disabled' : ''} title="${isRtl ? 'تعطيل القسم' : 'Deactivate Category'}">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        ` : ''}
                        <button class="action-icon-btn" style="${isSelected ? 'background: var(--primary); color: white;' : ''}" onclick="window.selectCategory(${cat.id})" title="${isRtl ? 'الكلمات المفتاحية' : 'Auto Keywords'}">
                            <i class="fa-solid fa-tags"></i>
                        </button>
                    </div>
                </div>

                <!-- Subcategories nested container -->
                ${subcategories.length > 0 ? `
                    <div class="subcategories-list">
                        ${subcategories.map((sub, subIdx) => `
                            <div class="subcategory-node">
                                <div class="subcategory-info">
                                    <div class="subcategory-icon">${sub.icon || '📁'}</div>
                                    <div class="subcategory-name" title="${sub.slug}">${sub.name}</div>
                                    <span class="badge-count products" style="font-size: 10px; padding: 1px 6px;">${sub.product_count || 0} ${isRtl ? 'منتج' : 'prods'}</span>
                                    ${sub.is_active === 0 ? `<span class="badge badge-danger" style="font-size: 9px; padding: 1px 4px;">${isRtl ? 'معطل' : 'Disabled'}</span>` : ''}
                                </div>
                                <div class="node-actions">
                                    ${isEditor() ? `
                                        <button class="action-icon-btn" style="width: 26px; height: 26px; font-size: 11px;" onclick="window.reorderSub(${cat.id}, ${sub.id}, 'up')" ${subIdx === 0 ? 'disabled' : ''}>
                                            <i class="fa-solid fa-arrow-up"></i>
                                        </button>
                                        <button class="action-icon-btn" style="width: 26px; height: 26px; font-size: 11px;" onclick="window.reorderSub(${cat.id}, ${sub.id}, 'down')" ${subIdx === subcategories.length - 1 ? 'disabled' : ''}>
                                            <i class="fa-solid fa-arrow-down"></i>
                                        </button>
                                        <button class="action-icon-btn" style="width: 26px; height: 26px; font-size: 11px;" onclick="window.editSubcategory(${cat.id}, ${sub.id})">
                                            <i class="fa-solid fa-pen-to-square"></i>
                                        </button>
                                    ` : ''}
                                    ${isSuperAdmin() ? `
                                        <button class="action-icon-btn btn-delete" style="width: 26px; height: 26px; font-size: 11px;" onclick="window.deleteSubcategory(${cat.id}, ${sub.id})" ${sub.product_count > 0 ? 'disabled' : ''}>
                                            <i class="fa-solid fa-trash-can"></i>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

// Expose actions to window for ease of binding with dynamic HTML strings
window.selectCategory = async (catId) => {
    selectedCategoryId = catId;
    
    // Highlight active in UI immediately
    document.querySelectorAll('.category-node').forEach(node => {
        if (parseInt(node.dataset.id) === catId) {
            node.classList.add('selected');
        } else {
            node.classList.remove('selected');
        }
    });

    const category = categoriesData.find(c => c.id === catId);
    if (!category) return;

    // Show spinner in panel
    const panel = document.getElementById('keywords-panel-container');
    panel.innerHTML = `
        <div class="card">
            <div class="card-header">
                <div class="card-title"><i class="fa-solid fa-spinner fa-spin"></i> <span>${state.lang === 'ar' ? 'جاري تحميل الكلمات المفتاحية...' : 'Loading Keywords...'}</span></div>
            </div>
        </div>
    `;

    try {
        const res = await adminFetch(`/api/admin/categories/${catId}/keywords`);
        keywordsData = res.keywords || [];
        renderKeywordsPanel(category);
    } catch (err) {
        showToast(err.message, 'danger');
    }
};

window.reorderCat = async (catId, direction) => {
    const index = categoriesData.findIndex(c => c.id === catId);
    if (index === -1) return;

    if (direction === 'up' && index > 0) {
        const temp = categoriesData[index];
        categoriesData[index] = categoriesData[index - 1];
        categoriesData[index - 1] = temp;
    } else if (direction === 'down' && index < categoriesData.length - 1) {
        const temp = categoriesData[index];
        categoriesData[index] = categoriesData[index + 1];
        categoriesData[index + 1] = temp;
    }

    try {
        const ids = categoriesData.map(c => c.id);
        await adminFetch('/api/admin/categories/reorder', {
            method: 'PUT',
            body: { ids }
        });
        showToast(state.lang === 'ar' ? 'تم تحديث الترتيب' : 'Category order updated', 'success');
        renderCategoriesTree();
    } catch (err) {
        showToast(err.message, 'danger');
        await loadInitialData();
        renderCategoriesTree();
    }
};

window.reorderSub = async (catId, subId, direction) => {
    const subList = subcategoriesMap[catId];
    if (!subList) return;

    const index = subList.findIndex(s => s.id === subId);
    if (index === -1) return;

    if (direction === 'up' && index > 0) {
        const temp = subList[index];
        subList[index] = subList[index - 1];
        subList[index - 1] = temp;
    } else if (direction === 'down' && index < subList.length - 1) {
        const temp = subList[index];
        subList[index] = subList[index + 1];
        subList[index + 1] = temp;
    }

    try {
        const ids = subList.map(s => s.id);
        await adminFetch('/api/admin/subcategories/reorder', {
            method: 'PUT',
            body: { ids }
        });
        showToast(state.lang === 'ar' ? 'تم تحديث ترتيب التصنيف الفرعي' : 'Subcategory order updated', 'success');
        renderCategoriesTree();
    } catch (err) {
        showToast(err.message, 'danger');
        await loadInitialData();
        renderCategoriesTree();
    }
};

window.editCategory = (catId) => {
    const cat = categoriesData.find(c => c.id === catId);
    if (!cat) return;

    const isRtl = state.lang === 'ar';

    openFormModal({
        title: isRtl ? `تعديل القسم: ${cat.name}` : `Edit Category: ${cat.name}`,
        submitLabel: isRtl ? 'حفظ التغييرات' : 'Save Changes',
        fields: [
            { name: 'name', label: isRtl ? 'اسم القسم (إنجليزي)' : 'Category Name (English)', required: true, value: cat.name },
            { name: 'name_ar', label: isRtl ? 'اسم القسم (عربي)' : 'Category Name (Arabic)', required: false, value: cat.name_ar || '' },
            { name: 'slug', label: isRtl ? 'المعرف اللطيف (Slug)' : 'Slug', required: true, value: cat.slug },
            { name: 'icon', label: isRtl ? 'الأيقونة' : 'Icon', required: false, value: cat.icon || '📦' },
            { name: 'seo_title', label: isRtl ? 'عنوان SEO' : 'SEO Title', required: false, value: cat.seo_title || '' },
            { name: 'seo_description', label: isRtl ? 'وصف SEO' : 'SEO Description', required: false, value: cat.seo_description || '' },
            { 
                name: 'is_active', 
                label: isRtl ? 'الحالة' : 'Status', 
                type: 'select', 
                required: true, 
                value: String(cat.is_active),
                options: [
                    { value: '1', label: isRtl ? 'نشط' : 'Active' },
                    { value: '0', label: isRtl ? 'معطل' : 'Disabled' }
                ]
            }
        ],
        onSubmit: async (data) => {
            // Convert state to number
            data.is_active = parseInt(data.is_active);
            await adminFetch(`/api/admin/categories/${catId}`, {
                method: 'PUT',
                body: data
            });
            showToast(isRtl ? 'تم حفظ التعديلات' : 'Category updated successfully', 'success');
            await loadInitialData();
            renderCategoriesTree();
            
            // If the currently open keywords panel is this category, reload details
            if (selectedCategoryId === catId) {
                window.selectCategory(catId);
            }
        }
    });

    // Auto-slug listener inside modal
    const form = document.getElementById('modal-form');
    if (form) {
        const nameInput = form.elements['name'];
        const slugInput = form.elements['slug'];
        if (nameInput && slugInput) {
            nameInput.addEventListener('input', (e) => {
                slugInput.value = slugify(e.target.value);
            });
        }
    }
};

window.deleteCategory = (catId) => {
    const cat = categoriesData.find(c => c.id === catId);
    if (!cat) return;

    const isRtl = state.lang === 'ar';

    openConfirmModal({
        title: isRtl ? 'تعطيل القسم الرئيسي' : 'Deactivate Category',
        message: isRtl 
            ? `هل أنت متأكد من رغبتك في تعطيل القسم الرئيسي "${cat.name}"؟ لن يظهر هذا القسم للعامة في الموقع.` 
            : `Are you sure you want to deactivate the category "${cat.name}"? It will no longer be visible on the public frontend.`,
        confirmLabel: isRtl ? 'تعطيل' : 'Deactivate',
        confirmClass: 'btn-danger',
        onConfirm: async () => {
            await adminFetch(`/api/admin/categories/${catId}`, { method: 'DELETE' });
            showToast(isRtl ? 'تم تعطيل القسم بنجاح' : 'Category deactivated successfully', 'success');
            await loadInitialData();
            renderCategoriesTree();
            if (selectedCategoryId === catId) {
                selectedCategoryId = null;
                document.getElementById('keywords-panel-container').innerHTML = `
                    <div class="card">
                        <div style="text-align: center; padding: 60px 20px; color: var(--text-muted);">
                            <i class="fa-solid fa-tags" style="font-size: 40px; margin-bottom: 16px; opacity: 0.3;"></i>
                            <p>${isRtl ? 'الرجاء اختيار قسم من القائمة لإدارة الكلمات المفتاحية التلقائية.' : 'Select a category from the tree to view and manage its auto-classification mapping rules.'}</p>
                        </div>
                    </div>
                `;
            }
        }
    });
};

window.addSubcategory = (catId) => {
    const cat = categoriesData.find(c => c.id === catId);
    if (!cat) return;

    const isRtl = state.lang === 'ar';

    openFormModal({
        title: isRtl ? `إضافة تصنيف فرعي تحت: ${cat.name}` : `Add Subcategory under: ${cat.name}`,
        submitLabel: isRtl ? 'إضافة' : 'Add',
        fields: [
            { name: 'name', label: isRtl ? 'اسم التصنيف الفرعي' : 'Subcategory Name', required: true, value: '' },
            { name: 'slug', label: isRtl ? 'المعرف اللطيف (Slug)' : 'Slug', required: true, value: '' },
            { name: 'icon', label: isRtl ? 'الأيقونة' : 'Icon', required: false, value: '📁' },
            { name: 'seo_title', label: isRtl ? 'عنوان SEO' : 'SEO Title', required: false, value: '' },
            { name: 'seo_description', label: isRtl ? 'وصف SEO' : 'SEO Description', required: false, value: '' }
        ],
        onSubmit: async (data) => {
            await adminFetch(`/api/admin/categories/${catId}/subcategories`, {
                method: 'POST',
                body: data
            });
            showToast(isRtl ? 'تم إضافة التصنيف الفرعي بنجاح' : 'Subcategory added successfully', 'success');
            await loadInitialData();
            renderCategoriesTree();
        }
    });

    // Auto-slug listener inside modal
    const form = document.getElementById('modal-form');
    if (form) {
        const nameInput = form.elements['name'];
        const slugInput = form.elements['slug'];
        if (nameInput && slugInput) {
            nameInput.addEventListener('input', (e) => {
                slugInput.value = slugify(e.target.value);
            });
        }
    }
};

window.editSubcategory = (catId, subId) => {
    const subList = subcategoriesMap[catId] || [];
    const sub = subList.find(s => s.id === subId);
    if (!sub) return;

    const isRtl = state.lang === 'ar';

    openFormModal({
        title: isRtl ? `تعديل التصنيف الفرعي: ${sub.name}` : `Edit Subcategory: ${sub.name}`,
        submitLabel: isRtl ? 'حفظ التغييرات' : 'Save Changes',
        fields: [
            { name: 'name', label: isRtl ? 'الاسم' : 'Name', required: true, value: sub.name },
            { name: 'slug', label: isRtl ? 'المعرف اللطيف (Slug)' : 'Slug', required: true, value: sub.slug },
            { name: 'icon', label: isRtl ? 'الأيقونة' : 'Icon', required: false, value: sub.icon || '📁' },
            { name: 'seo_title', label: isRtl ? 'عنوان SEO' : 'SEO Title', required: false, value: sub.seo_title || '' },
            { name: 'seo_description', label: isRtl ? 'وصف SEO' : 'SEO Description', required: false, value: sub.seo_description || '' },
            { 
                name: 'is_active', 
                label: isRtl ? 'الحالة' : 'Status', 
                type: 'select', 
                required: true, 
                value: String(sub.is_active),
                options: [
                    { value: '1', label: isRtl ? 'نشط' : 'Active' },
                    { value: '0', label: isRtl ? 'معطل' : 'Disabled' }
                ]
            }
        ],
        onSubmit: async (data) => {
            data.is_active = parseInt(data.is_active);
            await adminFetch(`/api/admin/subcategories/${subId}`, {
                method: 'PUT',
                body: data
            });
            showToast(isRtl ? 'تم تعديل التصنيف الفرعي بنجاح' : 'Subcategory updated successfully', 'success');
            await loadInitialData();
            renderCategoriesTree();
        }
    });

    // Auto-slug listener inside modal
    const form = document.getElementById('modal-form');
    if (form) {
        const nameInput = form.elements['name'];
        const slugInput = form.elements['slug'];
        if (nameInput && slugInput) {
            nameInput.addEventListener('input', (e) => {
                slugInput.value = slugify(e.target.value);
            });
        }
    }
};

window.deleteSubcategory = (catId, subId) => {
    const subList = subcategoriesMap[catId] || [];
    const sub = subList.find(s => s.id === subId);
    if (!sub) return;

    const isRtl = state.lang === 'ar';

    openConfirmModal({
        title: isRtl ? 'تعطيل التصنيف الفرعي' : 'Deactivate Subcategory',
        message: isRtl 
            ? `هل أنت متأكد من رغبتك في تعطيل التصنيف الفرعي "${sub.name}"؟` 
            : `Are you sure you want to deactivate the subcategory "${sub.name}"?`,
        confirmLabel: isRtl ? 'تعطيل' : 'Deactivate',
        confirmClass: 'btn-danger',
        onConfirm: async () => {
            await adminFetch(`/api/admin/subcategories/${subId}`, { method: 'DELETE' });
            showToast(isRtl ? 'تم تعطيل التصنيف الفرعي بنجاح' : 'Subcategory deactivated successfully', 'success');
            await loadInitialData();
            renderCategoriesTree();
        }
    });
};

function renderKeywordsPanel(category) {
    const container = document.getElementById('keywords-panel-container');
    if (!container) return;

    const isRtl = state.lang === 'ar';
    const subcategories = subcategoriesMap[category.id] || [];

    // Filter keywords by search
    const filteredKeywords = keywordsData.filter(kw => {
        if (!keywordSearchQuery) return true;
        return kw.keyword.toLowerCase().includes(keywordSearchQuery.toLowerCase());
    });

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <div class="card-title">
                    <i class="fa-solid fa-tags"></i> 
                    <span>${isRtl ? `الكلمات المفتاحية: ${category.name}` : `Keywords: ${category.name}`}</span>
                </div>
                <span class="badge-count">${keywordsData.length}</span>
            </div>

            <!-- Form to Add Keyword (only if editor+) -->
            ${isEditor() ? `
                <form id="add-keyword-form" style="margin-bottom: 20px; display: flex; flex-direction: column; gap: 12px; padding: 12px; background: rgba(0, 0, 0, 0.2); border: 1px solid var(--border-base); border-radius: var(--radius-md);">
                    <div style="font-weight: 600; font-size: 12px; text-transform: uppercase; color: var(--text-secondary);">${isRtl ? 'إضافة مطابقة كلمات مفتاحية جديدة' : 'Add Auto-Classification Rule'}</div>
                    
                    <div style="display: flex; gap: 8px;">
                        <div class="form-group" style="margin-bottom: 0; flex: 1;">
                            <input type="text" name="keyword" placeholder="${isRtl ? 'مثال: rtx 4090' : 'e.g. core i7'}" class="form-input" style="padding-left: 12px; padding-right: 12px;" required>
                        </div>
                        <div class="form-group" style="margin-bottom: 0; width: 80px;">
                            <input type="number" name="weight" placeholder="1" value="1.0" step="0.1" class="form-input" style="padding-left: 10px; padding-right: 10px;" required title="${isRtl ? 'الوزن النسبي للمطابقة' : 'Rule weight multiplier'}">
                        </div>
                    </div>

                    <div style="display: flex; gap: 8px; align-items: center;">
                        <div class="form-group" style="margin-bottom: 0; flex: 1;">
                            <select name="subcategory_id" class="form-input" style="padding-left: 12px; padding-right: 12px;">
                                <option value="">-- ${isRtl ? 'ربط بالقسم الرئيسي مباشرة' : 'Direct Category Mapping'} --</option>
                                ${subcategories.map(sub => `
                                    <option value="${sub.id}">${sub.name}</option>
                                `).join('')}
                            </select>
                        </div>
                        <button type="submit" class="btn btn-primary" style="height: 38px;"><i class="fa-solid fa-plus"></i></button>
                    </div>
                </form>
            ` : ''}

            <!-- Keywords List -->
            <div>
                <!-- Search filter -->
                <div class="input-wrapper" style="margin-bottom: 12px;">
                    <i class="fa-solid fa-magnifying-glass input-icon"></i>
                    <input type="text" id="keyword-search" value="${keywordSearchQuery}" placeholder="${isRtl ? 'البحث في القواعد...' : 'Search keyword rules...'}" class="form-input">
                </div>

                <div class="keyword-list-container" id="keyword-list-body">
                    ${filteredKeywords.length === 0 ? `
                        <div style="text-align: center; color: var(--text-muted); padding: 24px;">
                            <p>${isRtl ? 'لا توجد كلمات مفتاحية تطابق البحث.' : 'No keywords found.'}</p>
                        </div>
                    ` : filteredKeywords.map(kw => `
                        <div class="keyword-item">
                            <div>
                                <span class="keyword-text" title="ID: ${kw.id}">${kw.keyword}</span>
                                <span class="keyword-weight" title="${isRtl ? 'الوزن' : 'Weight'}">w:${kw.weight}</span>
                                <div class="keyword-mapping">
                                    <i class="fa-solid fa-arrow-turn-up" style="transform: rotate(90deg); margin-right: 4px; font-size: 9px; opacity: 0.5;"></i>
                                    <span>${kw.subcategory_name ? kw.subcategory_name : (isRtl ? 'القسم الرئيسي مباشرة' : 'Direct Category')}</span>
                                </div>
                            </div>
                            ${isEditor() ? `
                                <button class="action-icon-btn btn-delete" onclick="window.deleteKeyword(${kw.id}, ${category.id})" title="${isRtl ? 'حذف القاعدة' : 'Delete rule'}">
                                    <i class="fa-solid fa-trash-can" style="font-size: 11px;"></i>
                                </button>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    // Bind add form
    const form = document.getElementById('add-keyword-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const data = {
                keyword: form.elements['keyword'].value.trim(),
                weight: parseFloat(form.elements['weight'].value) || 1,
                category_id: category.id,
                subcategory_id: form.elements['subcategory_id'].value ? parseInt(form.elements['subcategory_id'].value) : null
            };

            try {
                await adminFetch('/api/admin/categories/keywords', {
                    method: 'POST',
                    body: data
                });
                showToast(isRtl ? 'تم إضافة الكلمة المفتاحية' : 'Keyword mapping added successfully', 'success');
                // Reload keywords
                window.selectCategory(category.id);
            } catch (err) {
                showToast(err.message, 'danger');
            }
        });
    }

    // Bind search input
    const searchInput = document.getElementById('keyword-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            keywordSearchQuery = e.target.value;
            // Immediate soft-refresh of the keyword list items only (to keep input cursor focus)
            const listBody = document.getElementById('keyword-list-body');
            if (listBody) {
                const refreshedFiltered = keywordsData.filter(kw => {
                    if (!keywordSearchQuery) return true;
                    return kw.keyword.toLowerCase().includes(keywordSearchQuery.toLowerCase());
                });

                if (refreshedFiltered.length === 0) {
                    listBody.innerHTML = `
                        <div style="text-align: center; color: var(--text-muted); padding: 24px;">
                            <p>${isRtl ? 'لا توجد كلمات مفتاحية تطابق البحث.' : 'No keywords found.'}</p>
                        </div>
                    `;
                } else {
                    listBody.innerHTML = refreshedFiltered.map(kw => `
                        <div class="keyword-item">
                            <div>
                                <span class="keyword-text" title="ID: ${kw.id}">${kw.keyword}</span>
                                <span class="keyword-weight" title="${isRtl ? 'الوزن' : 'Weight'}">w:${kw.weight}</span>
                                <div class="keyword-mapping">
                                    <i class="fa-solid fa-arrow-turn-up" style="transform: rotate(90deg); margin-right: 4px; font-size: 9px; opacity: 0.5;"></i>
                                    <span>${kw.subcategory_name ? kw.subcategory_name : (isRtl ? 'القسم الرئيسي مباشرة' : 'Direct Category')}</span>
                                </div>
                            </div>
                            ${isEditor() ? `
                                <button class="action-icon-btn btn-delete" onclick="window.deleteKeyword(${kw.id}, ${category.id})">
                                    <i class="fa-solid fa-trash-can" style="font-size: 11px;"></i>
                                </button>
                            ` : ''}
                        </div>
                    `).join('');
                }
            }
        });
    }
}

window.deleteKeyword = async (kwId, catId) => {
    const isRtl = state.lang === 'ar';
    try {
        await adminFetch(`/api/admin/keywords/${kwId}`, { method: 'DELETE' });
        showToast(isRtl ? 'تم حذف القاعدة بنجاح' : 'Keyword mapping deleted successfully', 'success');
        window.selectCategory(catId);
    } catch (err) {
        showToast(err.message, 'danger');
    }
};

// Reusable modal and confirmation dialogs
function openFormModal({ title, fields, submitLabel = 'Save', onSubmit }) {
    const existingModal = document.getElementById('admin-form-modal');
    if (existingModal) existingModal.remove();

    const portal = document.createElement('div');
    portal.id = 'admin-form-modal';
    portal.className = 'modal-portal';
    
    const isRtl = state.lang === 'ar';

    portal.innerHTML = `
        <div class="modal-box" style="max-width: 450px;">
            <div class="modal-header">
                <h3 class="modal-title">${title}</h3>
                <span class="modal-close" id="modal-btn-close"><i class="fa-solid fa-xmark"></i></span>
            </div>
            <form id="modal-form">
                <div class="modal-body">
                    ${fields.map(field => {
                        if (field.type === 'select') {
                            return `
                                <div class="form-group">
                                    <label class="form-label">${field.label} ${field.required ? '*' : ''}</label>
                                    <select name="${field.name}" class="form-input" style="padding-left: 12px; padding-right: 12px;" ${field.required ? 'required' : ''}>
                                        ${field.options.map(opt => `
                                            <option value="${opt.value}" ${opt.value === field.value ? 'selected' : ''}>${opt.label}</option>
                                        `).join('')}
                                    </select>
                                </div>
                            `;
                        }
                        return `
                            <div class="form-group">
                                <label class="form-label">${field.label} ${field.required ? '*' : ''}</label>
                                <div class="input-wrapper">
                                    <input type="${field.type || 'text'}" name="${field.name}" value="${field.value || ''}" class="form-input" style="padding-left: 12px; padding-right: 12px;" ${field.required ? 'required' : ''} ${field.readonly ? 'readonly' : ''} step="${field.step || 'any'}">
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn" id="modal-btn-cancel">${isRtl ? 'إلغاء' : 'Cancel'}</button>
                    <button type="submit" class="btn btn-primary" id="modal-btn-submit">${submitLabel}</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(portal);

    const closeModal = () => {
        portal.classList.add('hide');
        setTimeout(() => portal.remove(), 200);
    };

    portal.querySelector('#modal-btn-close').addEventListener('click', closeModal);
    portal.querySelector('#modal-btn-cancel').addEventListener('click', closeModal);

    portal.querySelector('#modal-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const data = {};
        for (const [key, value] of formData.entries()) {
            data[key] = value;
        }
        
        const submitBtn = portal.querySelector('#modal-btn-submit');
        const origText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

        try {
            await onSubmit(data);
            closeModal();
        } catch (err) {
            showToast(err.message, 'danger');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origText;
        }
    });
}

function openConfirmModal({ title, message, confirmLabel = 'Confirm', confirmClass = 'btn-danger', onConfirm }) {
    const existingModal = document.getElementById('admin-confirm-modal');
    if (existingModal) existingModal.remove();

    const portal = document.createElement('div');
    portal.id = 'admin-confirm-modal';
    portal.className = 'modal-portal';
    
    const isRtl = state.lang === 'ar';

    portal.innerHTML = `
        <div class="modal-box" style="max-width: 400px;">
            <div class="modal-header">
                <h3 class="modal-title">${title}</h3>
                <span class="modal-close" id="confirm-btn-close"><i class="fa-solid fa-xmark"></i></span>
            </div>
            <div class="modal-body">
                <p style="font-size: 14px; color: var(--text-secondary); line-height: 1.6;">${message}</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn" id="confirm-btn-cancel">${isRtl ? 'إلغاء' : 'Cancel'}</button>
                <button type="button" class="btn ${confirmClass}" id="confirm-btn-submit">${confirmLabel}</button>
            </div>
        </div>
    `;

    document.body.appendChild(portal);

    const closeModal = () => {
        portal.classList.add('hide');
        setTimeout(() => portal.remove(), 200);
    };

    portal.querySelector('#confirm-btn-close').addEventListener('click', closeModal);
    portal.querySelector('#confirm-btn-cancel').addEventListener('click', closeModal);

    portal.querySelector('#confirm-btn-submit').addEventListener('click', async () => {
        const submitBtn = portal.querySelector('#confirm-btn-submit');
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;

        try {
            await onConfirm();
            closeModal();
        } catch (err) {
            showToast(err.message, 'danger');
            submitBtn.disabled = false;
            submitBtn.innerHTML = confirmLabel;
        }
    });
}

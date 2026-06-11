/**
 * Product Merge Control Center Page (Phase 5)
 * ===========================================
 * Side-by-side comparison workspace, autocomplete search, 
 * fuzzy-match duplicate identification, and safe merges.
 */

import { adminFetch, showToast, state, t } from '../admin.js';

// Page-level state
let activeTab = 'candidates'; // 'candidates', 'workspace', 'history'
let threshold = 0.70;
let candidates = [];
let mergeHistory = [];
let sourceProduct = null;
let targetProduct = null;
let mergePreviewData = null;

// Autocomplete states
let searchResultsSource = [];
let searchResultsTarget = [];
let searchTimeout = null;

const isViewer = () => state.user?.role === 'viewer';
const isEditor = () => state.user?.role === 'editor' || state.user?.role === 'super_admin';
const isSuperAdmin = () => state.user?.role === 'super_admin';

export async function render(container) {
    renderLayout(container);
    setupEventListeners(container);
    await loadTabData(container);
}

function renderLayout(container) {
    const isRtl = state.lang === 'ar';
    
    container.innerHTML = `
        <style>
            .merge-page-container {
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
            .page-title-group {
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
            
            /* Tabs */
            .tabs-nav {
                display: flex;
                gap: 8px;
                border-bottom: 1px solid var(--border-base);
                padding-bottom: 8px;
            }
            .tab-btn {
                background: none;
                border: none;
                padding: 10px 20px;
                color: var(--text-secondary);
                font-family: var(--font-main);
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                border-radius: var(--radius-md);
                transition: all var(--transition-fast);
                display: inline-flex;
                align-items: center;
                gap: 8px;
            }
            .tab-btn:hover {
                color: var(--text-primary);
                background: rgba(255, 255, 255, 0.03);
            }
            .tab-btn.active {
                color: var(--primary-light);
                background: rgba(99, 102, 241, 0.1);
            }

            /* Candidates list */
            .threshold-control {
                background: var(--bg-card);
                border: 1px solid var(--border-base);
                border-radius: var(--radius-lg);
                padding: 16px 20px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 16px;
                margin-bottom: 16px;
            }
            .slider-group {
                display: flex;
                align-items: center;
                gap: 12px;
                flex-grow: 1;
                max-width: 500px;
            }
            .slider-group input[type="range"] {
                flex-grow: 1;
                accent-color: var(--primary);
                height: 6px;
                border-radius: 3px;
                background: rgba(255, 255, 255, 0.1);
                border: none;
                outline: none;
            }
            .candidates-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 16px;
            }
            .candidate-card {
                background: var(--bg-card);
                border: 1px solid var(--border-base);
                border-radius: var(--radius-lg);
                padding: 20px;
                display: grid;
                grid-template-columns: 1fr 50px 1fr auto;
                align-items: center;
                gap: 20px;
                transition: border-color var(--transition-fast);
            }
            .candidate-card:hover {
                border-color: var(--border-bright);
            }
            @media (max-width: 900px) {
                .candidate-card {
                    grid-template-columns: 1fr;
                    text-align: center;
                }
                .candidate-arrow {
                    transform: rotate(90deg);
                }
            }
            .product-mini-profile {
                display: flex;
                align-items: center;
                gap: 16px;
                text-align: left;
            }
            [dir="rtl"] .product-mini-profile {
                text-align: right;
            }
            .product-mini-img {
                width: 54px;
                height: 54px;
                border-radius: var(--radius-md);
                object-fit: cover;
                background: #0f172a;
                border: 1px solid var(--border-base);
                padding: 4px;
            }
            .product-mini-info {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .product-mini-name {
                font-weight: 600;
                font-size: 15px;
                color: var(--text-primary);
            }
            .product-mini-meta {
                font-size: 12px;
                color: var(--text-secondary);
            }
            .confidence-badge {
                padding: 4px 10px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 700;
                display: inline-flex;
                align-items: center;
                gap: 4px;
            }
            .confidence-high {
                background: rgba(16, 185, 129, 0.15);
                color: #10b981;
                border: 1px solid rgba(16, 185, 129, 0.3);
            }
            .confidence-medium {
                background: rgba(245, 158, 11, 0.15);
                color: #f59e0b;
                border: 1px solid rgba(245, 158, 11, 0.3);
            }

            /* Workspace */
            .workspace-selection {
                display: grid;
                grid-template-columns: 1fr auto 1fr;
                gap: 20px;
                align-items: flex-start;
                margin-bottom: 24px;
            }
            @media (max-width: 768px) {
                .workspace-selection {
                    grid-template-columns: 1fr;
                }
                .swap-btn-container {
                    transform: rotate(90deg);
                    margin: 10px 0;
                }
            }
            .autocomplete-container {
                position: relative;
            }
            .autocomplete-suggestions {
                position: absolute;
                top: 100%;
                left: 0;
                right: 0;
                background: var(--bg-surface-opaque);
                border: 1px solid var(--border-bright);
                border-radius: var(--radius-md);
                margin-top: 4px;
                z-index: 100;
                max-height: 250px;
                overflow-y: auto;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
            }
            .suggestion-item {
                padding: 10px 14px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 12px;
                transition: background var(--transition-fast);
            }
            .suggestion-item:hover {
                background: rgba(255, 255, 255, 0.05);
            }
            .suggestion-img {
                width: 32px;
                height: 32px;
                border-radius: var(--radius-sm);
                object-fit: cover;
            }
            .suggestion-text {
                display: flex;
                flex-direction: column;
            }
            .suggestion-name {
                font-size: 13px;
                font-weight: 600;
            }
            .suggestion-meta {
                font-size: 11px;
                color: var(--text-secondary);
            }

            /* Comparison Workspace columns */
            .comparison-columns {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 24px;
                margin-bottom: 24px;
            }
            @media (max-width: 900px) {
                .comparison-columns {
                    grid-template-columns: 1fr;
                }
            }
            .comparison-col-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding-bottom: 12px;
                border-bottom: 2px solid var(--border-base);
                margin-bottom: 16px;
            }
            .role-badge {
                font-size: 11px;
                padding: 2px 8px;
                border-radius: 4px;
                font-weight: 600;
            }
            .badge-source {
                background: rgba(239, 68, 68, 0.15);
                color: #ef4444;
                border: 1px solid rgba(239, 68, 68, 0.2);
            }
            .badge-target {
                background: rgba(16, 185, 129, 0.15);
                color: #10b981;
                border: 1px solid rgba(16, 185, 129, 0.2);
            }
            .product-card-detail {
                background: var(--bg-card);
                border: 1px solid var(--border-base);
                border-radius: var(--radius-lg);
                padding: 24px;
                display: flex;
                flex-direction: column;
                gap: 20px;
            }
            .detail-row {
                display: grid;
                grid-template-columns: 100px 1fr;
                gap: 12px;
                font-size: 14px;
            }
            .detail-label {
                color: var(--text-secondary);
                font-weight: 600;
            }
            .detail-value {
                color: var(--text-primary);
            }
            .variants-list {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .variant-row {
                background: rgba(255,255,255,0.02);
                border: 1px solid var(--border-base);
                border-radius: var(--radius-md);
                padding: 12px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 8px;
            }
            .variant-specs {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .variant-badge {
                font-size: 11px;
                padding: 2px 6px;
                border-radius: 4px;
                background: rgba(255,255,255,0.07);
                color: var(--text-secondary);
            }
            .offer-badge {
                background: rgba(99, 102, 241, 0.15);
                color: var(--primary-light);
            }

            /* Preview panel */
            .preview-card {
                background: rgba(99, 102, 241, 0.04);
                border: 1px solid rgba(99, 102, 241, 0.2);
                box-shadow: 0 0 20px rgba(99, 102, 241, 0.05);
                border-radius: var(--radius-lg);
                padding: 24px;
                margin-bottom: 24px;
            }
            .preview-title {
                font-size: 16px;
                font-weight: 700;
                color: var(--primary-light);
                margin-bottom: 16px;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .preview-steps {
                display: flex;
                flex-direction: column;
                gap: 12px;
                font-size: 14px;
            }
            .preview-step {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            .preview-step-icon {
                font-size: 16px;
                width: 24px;
                height: 24px;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            /* Table Styles */
            .history-table {
                width: 100%;
                border-collapse: collapse;
                text-align: left;
            }
            [dir="rtl"] .history-table {
                text-align: right;
            }
            .history-table th {
                padding: 14px 16px;
                color: var(--text-secondary);
                font-weight: 600;
                font-size: 13px;
                border-bottom: 2px solid var(--border-base);
            }
            .history-table td {
                padding: 14px 16px;
                border-bottom: 1px solid var(--border-base);
                font-size: 13.5px;
            }
            .status-badge {
                padding: 3px 8px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                display: inline-block;
            }
            .status-badge.merged {
                background: rgba(16, 185, 129, 0.15);
                color: #10b981;
            }
            .status-badge.unmerged {
                background: rgba(239, 68, 68, 0.15);
                color: #ef4444;
            }
        </style>

        <div class="merge-page-container">
            <div class="page-header">
                <div class="page-title-group">
                    <h1 class="page-title">${isRtl ? 'مركز دمج وتكرار المنتجات' : 'Product Merge Control Center'}</h1>
                    <p class="page-subtitle">${isRtl ? 'الكشف الذكي وتوحيد المنتجات المكررة مع إمكانية التراجع الآمن' : 'Smart duplicate family detection, side-by-side spec compare, and safe merges.'}</p>
                </div>
            </div>

            <!-- Tabs Navigation -->
            <div class="tabs-nav">
                <button class="tab-btn ${activeTab === 'candidates' ? 'active' : ''}" data-tab="candidates">
                    <i class="fa-solid fa-wand-magic-sparkles"></i>
                    <span>${isRtl ? 'التكرارات المقترحة' : 'Fuzzy Candidates'}</span>
                </button>
                <button class="tab-btn ${activeTab === 'workspace' ? 'active' : ''}" data-tab="workspace">
                    <i class="fa-solid fa-code-compare"></i>
                    <span>${isRtl ? 'مساحة العمل والدمج اليدوي' : 'Merge Workspace'}</span>
                </button>
                <button class="tab-btn ${activeTab === 'history' ? 'active' : ''}" data-tab="history">
                    <i class="fa-solid fa-clock-rotate-left"></i>
                    <span>${isRtl ? 'سجل العمليات' : 'Merge History'}</span>
                </button>
            </div>

            <!-- Tab Content Dynamic Mount -->
            <div id="tab-content-container"></div>
        </div>
    `;
}

function setupEventListeners(container) {
    const tabBtns = container.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeTab = btn.dataset.tab;
            await loadTabData(container);
        });
    });
}

async function loadTabData(container) {
    const tabContainer = container.querySelector('#tab-content-container');
    if (!tabContainer) return;

    if (activeTab === 'candidates') {
        renderCandidatesTab(tabContainer);
        await fetchCandidates(tabContainer);
    } else if (activeTab === 'workspace') {
        renderWorkspaceTab(tabContainer);
    } else if (activeTab === 'history') {
        renderHistoryTab(tabContainer);
        await fetchHistory(tabContainer);
    }
}

// ═══════════════════════════════════════════════════
// Tab 1: Candidates View
// ═══════════════════════════════════════════════════

function renderCandidatesTab(container) {
    const isRtl = state.lang === 'ar';
    container.innerHTML = `
        <div class="threshold-control">
            <div class="slider-group">
                <label for="threshold-slider" style="font-size: 14px; font-weight: 600; min-width: 140px;">
                    ${isRtl ? 'الحد الأدنى للمطابقة' : 'Similarity Threshold'}: 
                    <span id="threshold-val" style="color: var(--primary-light); font-family: var(--font-mono);">${Math.round(threshold * 100)}%</span>
                </label>
                <input type="range" id="threshold-slider" min="50" max="95" step="5" value="${Math.round(threshold * 100)}">
            </div>
            <button id="refresh-candidates-btn" class="btn btn-secondary">
                <i class="fa-solid fa-arrows-rotate"></i> ${isRtl ? 'تحديث الفحص' : 'Re-scan'}
            </button>
        </div>

        <div id="candidates-list-container">
            <div style="text-align: center; padding: 60px;">
                <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 28px; color: var(--primary); margin-bottom: 12px;"></i>
                <div>${isRtl ? 'جاري فحص قاعدة البيانات بحثاً عن تكرارات...' : 'Scanning database for candidates...'}</div>
            </div>
        </div>
    `;

    const slider = container.querySelector('#threshold-slider');
    const valSpan = container.querySelector('#threshold-val');
    slider.addEventListener('input', (e) => {
        threshold = parseFloat(e.target.value) / 100;
        if (valSpan) valSpan.textContent = `${e.target.value}%`;
    });

    slider.addEventListener('change', async () => {
        await fetchCandidates(container);
    });

    container.querySelector('#refresh-candidates-btn').addEventListener('click', async () => {
        await fetchCandidates(container);
    });
}

async function fetchCandidates(container) {
    const listContainer = container.querySelector('#candidates-list-container');
    if (!listContainer) return;

    try {
        const res = await adminFetch(`/api/admin/merge/candidates?threshold=${threshold}`);
        candidates = res.candidates || [];
        renderCandidatesList(listContainer);
    } catch (err) {
        showToast(err.message, 'danger');
        listContainer.innerHTML = `
            <div class="card" style="text-align: center; padding: 40px; color: var(--danger);">
                <i class="fa-solid fa-circle-exclamation" style="font-size: 36px; margin-bottom: 12px;"></i>
                <div>${state.lang === 'ar' ? 'فشل فحص التكرارات المقترحة' : 'Failed to scan duplicates'}</div>
            </div>
        `;
    }
}

function renderCandidatesList(container) {
    const isRtl = state.lang === 'ar';
    if (candidates.length === 0) {
        container.innerHTML = `
            <div class="card" style="text-align: center; padding: 60px 20px;">
                <i class="fa-solid fa-circle-check" style="font-size: 48px; color: var(--success); margin-bottom: 16px; filter: drop-shadow(0 0 10px var(--success-glow));"></i>
                <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">${isRtl ? 'قاعدة البيانات نظيفة!' : 'Database is clean!'}</h3>
                <p style="color: var(--text-secondary); font-size: 13px;">${isRtl ? 'لم يتم العثور على عائلات منتجات مكررة بالحد المحدد.' : 'No duplicate product families found matching the current threshold.'}</p>
            </div>
        `;
        return;
    }

    let html = `<div class="candidates-grid">`;
    candidates.forEach((pair, idx) => {
        const scorePct = Math.round(pair.score * 100);
        const badgeClass = pair.score >= 0.85 ? 'confidence-high' : 'confidence-medium';
        const starIcon = pair.score >= 0.85 ? 'fa-star' : 'fa-star-half-stroke';

        html += `
            <div class="candidate-card">
                <div class="product-mini-profile">
                    <img class="product-mini-img" src="${pair.family1.image_url || '/assets/placeholder-product.png'}" onerror="this.src='/assets/placeholder-product.png'">
                    <div class="product-mini-info">
                        <span class="product-mini-name">${isRtl ? (pair.family1.name_ar || pair.family1.name_en) : pair.family1.name_en}</span>
                        <span class="product-mini-meta">ID: ${pair.family1.id} | ${pair.family1.brand_name || 'Generic'} | ${pair.family1.subcategory_name}</span>
                    </div>
                </div>

                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;">
                    <div class="confidence-badge ${badgeClass}">
                        <i class="fa-solid ${starIcon}"></i> ${scorePct}%
                    </div>
                    <i class="fa-solid fa-arrow-right-arrow-left candidate-arrow" style="color: var(--text-muted); font-size: 14px;"></i>
                </div>

                <div class="product-mini-profile">
                    <img class="product-mini-img" src="${pair.family2.image_url || '/assets/placeholder-product.png'}" onerror="this.src='/assets/placeholder-product.png'">
                    <div class="product-mini-info">
                        <span class="product-mini-name">${isRtl ? (pair.family2.name_ar || pair.family2.name_en) : pair.family2.name_en}</span>
                        <span class="product-mini-meta">ID: ${pair.family2.id} | ${pair.family2.brand_name || 'Generic'} | ${pair.family2.subcategory_name}</span>
                    </div>
                </div>

                <button class="btn btn-primary start-merge-pair-btn" data-id1="${pair.family1.id}" data-id2="${pair.family2.id}" style="height: 38px;">
                    <i class="fa-solid fa-code-compare"></i> ${isRtl ? 'مراجعة ودمج' : 'Compare & Merge'}
                </button>
            </div>
        `;
    });
    html += `</div>`;
    container.innerHTML = html;

    container.querySelectorAll('.start-merge-pair-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id1 = parseInt(btn.dataset.id1, 10);
            const id2 = parseInt(btn.dataset.id2, 10);
            
            // Switch tabs
            activeTab = 'workspace';
            const pageContainer = container.closest('.merge-page-container');
            pageContainer.querySelectorAll('.tab-btn').forEach(b => {
                b.classList.remove('active');
                if (b.dataset.tab === 'workspace') b.classList.add('active');
            });

            renderWorkspaceTab(pageContainer.querySelector('#tab-content-container'));
            await loadProductsIntoWorkspace(id1, id2, pageContainer.querySelector('#tab-content-container'));
        });
    });
}

// ═══════════════════════════════════════════════════
// Tab 2: Merge Workspace
// ═══════════════════════════════════════════════════

function renderWorkspaceTab(container) {
    const isRtl = state.lang === 'ar';
    container.innerHTML = `
        <div class="card" style="margin-bottom: 24px;">
            <div class="workspace-selection">
                <div class="autocomplete-container">
                    <label class="form-label" style="font-weight: 600; margin-bottom: 6px; display: block;">
                        ${isRtl ? 'المنتج المكرر (المصدر) — سيتم حذفه' : 'Source Product (Duplicate) — will be deleted'}
                    </label>
                    <div style="position: relative;">
                        <input type="text" id="source-search-input" class="form-control" placeholder="${isRtl ? 'ابحث باسم المنتج أو المعرف...' : 'Search product family name or ID...'}" style="padding-left: 36px; padding-right: 36px;">
                        <i class="fa-solid fa-search" style="position: absolute; top: 12px; left: 12px; color: var(--text-muted);"></i>
                        <i class="fa-solid fa-circle-xmark clear-search-icon" id="clear-source-btn" style="position: absolute; top: 12px; right: 12px; color: var(--text-muted); cursor: pointer; display: none;"></i>
                    </div>
                    <div class="autocomplete-suggestions" id="source-suggestions" style="display: none;"></div>
                </div>

                <div class="swap-btn-container" style="display: flex; align-items: center; justify-content: center; height: 66px;">
                    <button class="btn btn-secondary" id="swap-slots-btn" title="${isRtl ? 'تبديل الخانات' : 'Swap Slots'}" style="border-radius: 50%; width: 42px; height: 42px; padding: 0; display: flex; align-items: center; justify-content: center;">
                        <i class="fa-solid fa-arrow-right-arrow-left"></i>
                    </button>
                </div>

                <div class="autocomplete-container">
                    <label class="form-label" style="font-weight: 600; margin-bottom: 6px; display: block;">
                        ${isRtl ? 'المنتج الرئيسي (الهدف) — سيتم الإبقاء عليه' : 'Target Product (Master) — will be kept'}
                    </label>
                    <div style="position: relative;">
                        <input type="text" id="target-search-input" class="form-control" placeholder="${isRtl ? 'ابحث باسم المنتج أو المعرف...' : 'Search product family name or ID...'}" style="padding-left: 36px; padding-right: 36px;">
                        <i class="fa-solid fa-search" style="position: absolute; top: 12px; left: 12px; color: var(--text-muted);"></i>
                        <i class="fa-solid fa-circle-xmark clear-search-icon" id="clear-target-btn" style="position: absolute; top: 12px; right: 12px; color: var(--text-muted); cursor: pointer; display: none;"></i>
                    </div>
                    <div class="autocomplete-suggestions" id="target-suggestions" style="display: none;"></div>
                </div>
            </div>
        </div>

        <div id="workspace-comparison-area">
            <div class="card" style="text-align: center; padding: 60px 40px; border-style: dashed; border-color: var(--border-bright);">
                <i class="fa-solid fa-code-merge" style="font-size: 48px; color: var(--text-muted); margin-bottom: 16px;"></i>
                <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">${isRtl ? 'مقارنة المنتجات اليدوية' : 'Compare Products'}</h3>
                <p style="color: var(--text-secondary); max-width: 500px; margin: 0 auto;">${isRtl ? 'اختر منتجين أعلاه لمقارنة مواصفاتهم وأسعارهم ومعاينة التغييرات قبل الدمج.' : 'Select a source and target product family above to review their variants, offers, and preview merge outputs.'}</p>
            </div>
        </div>
    `;

    setupWorkspaceSearch(container);
}

function setupWorkspaceSearch(container) {
    const sourceInput = container.querySelector('#source-search-input');
    const targetInput = container.querySelector('#target-search-input');
    const sourceSug = container.querySelector('#source-suggestions');
    const targetSug = container.querySelector('#target-suggestions');

    const handleSearch = (input, sugEl, isSource) => {
        input.addEventListener('input', () => {
            const query = input.value.trim();
            if (query.length < 2) {
                sugEl.style.display = 'none';
                return;
            }

            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(async () => {
                try {
                    const res = await adminFetch(`/api/admin/products?search=${encodeURIComponent(query)}&limit=8`);
                    const productsList = res.products || [];
                    
                    if (productsList.length === 0) {
                        sugEl.innerHTML = `<div style="padding: 12px; color: var(--text-secondary); font-size: 13px;">${state.lang === 'ar' ? 'لا توجد نتائج' : 'No results found'}</div>`;
                    } else {
                        sugEl.innerHTML = productsList.map(p => `
                            <div class="suggestion-item" data-id="${p.id}">
                                <img class="suggestion-img" src="${p.image_url || '/assets/placeholder-product.png'}" onerror="this.src='/assets/placeholder-product.png'">
                                <div class="suggestion-text">
                                    <span class="suggestion-name">${state.lang === 'ar' ? (p.name_ar || p.name_en) : p.name_en}</span>
                                    <span class="suggestion-meta">ID: ${p.id} | ${p.brand_name || 'Generic'} | ${p.subcategory_name}</span>
                                </div>
                            </div>
                        `).join('');

                        sugEl.querySelectorAll('.suggestion-item').forEach(item => {
                            item.addEventListener('click', async () => {
                                const id = parseInt(item.dataset.id, 10);
                                sugEl.style.display = 'none';
                                if (isSource) {
                                    await selectProductSlot(id, true, container);
                                } else {
                                    await selectProductSlot(id, false, container);
                                }
                            });
                        });
                    }
                    sugEl.style.display = 'block';
                } catch (err) {
                    console.error(err);
                }
            }, 300);
        });
    };

    handleSearch(sourceInput, sourceSug, true);
    handleSearch(targetInput, targetSug, false);

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
        if (!sourceInput.contains(e.target) && !sourceSug.contains(e.target)) sourceSug.style.display = 'none';
        if (!targetInput.contains(e.target) && !targetSug.contains(e.target)) targetSug.style.display = 'none';
    });

    // Clear buttons
    const clearSource = container.querySelector('#clear-source-btn');
    const clearTarget = container.querySelector('#clear-target-btn');

    clearSource.addEventListener('click', () => {
        sourceProduct = null;
        sourceInput.value = '';
        clearSource.style.display = 'none';
        triggerComparisonRefresh(container);
    });

    clearTarget.addEventListener('click', () => {
        targetProduct = null;
        targetInput.value = '';
        clearTarget.style.display = 'none';
        triggerComparisonRefresh(container);
    });

    // Swap button
    container.querySelector('#swap-slots-btn').addEventListener('click', () => {
        if (!sourceProduct && !targetProduct) return;
        const temp = sourceProduct;
        sourceProduct = targetProduct;
        targetProduct = temp;

        sourceInput.value = sourceProduct ? (state.lang === 'ar' ? (sourceProduct.name_ar || sourceProduct.name_en) : sourceProduct.name_en) : '';
        targetInput.value = targetProduct ? (state.lang === 'ar' ? (targetProduct.name_ar || targetProduct.name_en) : targetProduct.name_en) : '';

        clearSource.style.display = sourceProduct ? 'block' : 'none';
        clearTarget.style.display = targetProduct ? 'block' : 'none';

        triggerComparisonRefresh(container);
    });
}

async function selectProductSlot(id, isSource, container) {
    try {
        const res = await adminFetch(`/api/admin/merge/compare?ids=${id}`);
        const product = res.comparison?.[0];
        if (!product) throw new Error('Product not found');

        const input = container.querySelector(isSource ? '#source-search-input' : '#target-search-input');
        const clearBtn = container.querySelector(isSource ? '#clear-source-btn' : '#clear-target-btn');

        if (isSource) {
            sourceProduct = product;
        } else {
            targetProduct = product;
        }

        input.value = state.lang === 'ar' ? (product.name_ar || product.name_en) : product.name_en;
        clearBtn.style.display = 'block';

        await triggerComparisonRefresh(container);
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function loadProductsIntoWorkspace(id1, id2, container) {
    await selectProductSlot(id1, true, container);
    await selectProductSlot(id2, false, container);
}

async function triggerComparisonRefresh(container) {
    const workspaceArea = container.querySelector('#workspace-comparison-area');
    if (!workspaceArea) return;

    if (!sourceProduct || !targetProduct) {
        workspaceArea.innerHTML = `
            <div class="card" style="text-align: center; padding: 60px 40px; border-style: dashed; border-color: var(--border-bright);">
                <i class="fa-solid fa-code-merge" style="font-size: 48px; color: var(--text-muted); margin-bottom: 16px;"></i>
                <h3 style="font-size: 18px; font-weight: 600; margin-bottom: 8px;">${state.lang === 'ar' ? 'مقارنة المنتجات اليدوية' : 'Compare Products'}</h3>
                <p style="color: var(--text-secondary); max-width: 500px; margin: 0 auto;">${state.lang === 'ar' ? 'اختر منتجين أعلاه لمقارنة مواصفاتهم وأسعارهم ومعاينة التغييرات قبل الدمج.' : 'Select a source and target product family above to review their variants, offers, and preview merge outputs.'}</p>
            </div>
        `;
        return;
    }

    workspaceArea.innerHTML = `
        <div style="text-align: center; padding: 40px;">
            <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 24px; color: var(--primary); margin-bottom: 8px;"></i>
            <div>${state.lang === 'ar' ? 'جاري تحميل وتحديث المقارنة...' : 'Generating side-by-side comparison...'}</div>
        </div>
    `;

    try {
        // Load comparison details and previews
        const [compRes, previewRes] = await Promise.all([
            adminFetch(`/api/admin/merge/compare?ids=${sourceProduct.id},${targetProduct.id}`),
            adminFetch(`/api/admin/merge/preview?sourceId=${sourceProduct.id}&targetId=${targetProduct.id}`)
        ]);

        if (compRes.success) {
            sourceProduct = compRes.comparison.find(p => p.id === sourceProduct.id);
            targetProduct = compRes.comparison.find(p => p.id === targetProduct.id);
        }

        if (previewRes.success) {
            mergePreviewData = previewRes.preview;
        }

        renderComparisonWorkspace(workspaceArea);
    } catch (err) {
        showToast(err.message, 'danger');
        workspaceArea.innerHTML = `
            <div class="card" style="text-align: center; padding: 40px; color: var(--danger);">
                <i class="fa-solid fa-circle-exclamation" style="font-size: 32px; margin-bottom: 12px;"></i>
                <div>${state.lang === 'ar' ? 'حدث خطأ أثناء تحميل المقارنة' : 'Failed to generate comparison details'}</div>
            </div>
        `;
    }
}

function renderComparisonWorkspace(container) {
    const isRtl = state.lang === 'ar';
    const sName = isRtl ? (sourceProduct.name_ar || sourceProduct.name_en) : sourceProduct.name_en;
    const tName = isRtl ? (targetProduct.name_ar || targetProduct.name_en) : targetProduct.name_en;

    // Draw workspace layout
    container.innerHTML = `
        <!-- Side by Side Columns -->
        <div class="comparison-columns">
            <!-- Source family -->
            <div>
                <div class="comparison-col-header">
                    <h3 style="font-weight: 700; font-size: 16px;"><i class="fa-solid fa-trash-can" style="color: var(--danger);"></i> ${isRtl ? 'المنتج المراد دمجه (المصدر)' : 'Source (To Be Deleted)'}</h3>
                    <span class="role-badge badge-source">${isRtl ? 'مكرر' : 'DUPLICATE'}</span>
                </div>
                <div class="product-card-detail">
                    <div style="display: flex; justify-content: center; background: rgba(0,0,0,0.2); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-base);">
                        <img src="${sourceProduct.image_url || '/assets/placeholder-product.png'}" onerror="this.src='/assets/placeholder-product.png'" style="max-height: 120px; object-fit: contain;">
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${isRtl ? 'الاسم' : 'Name'}</span>
                        <span class="detail-value" style="font-weight: 600;">${sName}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${isRtl ? 'القسم الفرعي' : 'Subcat'}</span>
                        <span class="detail-value">${sourceProduct.subcategory_name}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${isRtl ? 'البراند' : 'Brand'}</span>
                        <span class="detail-value">${sourceProduct.brand_name || 'Generic'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${isRtl ? 'الوصف' : 'Description'}</span>
                        <span class="detail-value" style="font-size: 12px; max-height: 80px; overflow-y: auto;">
                            ${isRtl ? (sourceProduct.description_ar || sourceProduct.description_en || 'لا يوجد') : (sourceProduct.description_en || 'No description')}
                        </span>
                    </div>
                    <div>
                        <h4 style="font-size: 13px; font-weight: 700; color: var(--text-secondary); margin-bottom: 10px;">
                            ${isRtl ? 'الإصدارات والأسعار' : 'Variants & Live Offers'} (${sourceProduct.variants.length})
                        </h4>
                        <div class="variants-list">
                            ${sourceProduct.variants.map(v => {
                                const totalOffers = v.offers.length;
                                const cheapestPrice = totalOffers > 0 ? Math.min(...v.offers.map(o => o.price_egp)) : null;
                                return `
                                    <div class="variant-row">
                                        <div class="variant-specs">
                                            <span style="font-weight: 600; font-size: 13px;">${v.storage_gb ? v.storage_gb + 'GB' : ''} ${v.ram_gb ? v.ram_gb + 'GB RAM' : ''} ${v.network_gen || ''}</span>
                                            <span style="font-size: 11px; color: var(--text-muted);">${isRtl ? (v.color_ar || v.color_en) : v.color_en} (${v.region_version || ''})</span>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <span class="variant-badge offer-badge"><i class="fa-solid fa-tag"></i> ${totalOffers} ${isRtl ? 'عرض' : 'offers'}</span>
                                            ${cheapestPrice ? `<span class="variant-badge" style="background: rgba(16, 185, 129, 0.1); color:#10b981; font-weight:700;">${cheapestPrice.toLocaleString()} EGP</span>` : ''}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Target family -->
            <div>
                <div class="comparison-col-header">
                    <h3 style="font-weight: 700; font-size: 16px;"><i class="fa-solid fa-square-check" style="color: var(--success);"></i> ${isRtl ? 'المنتج الرئيسي المحتفظ به (الهدف)' : 'Target (Master to Keep)'}</h3>
                    <span class="role-badge badge-target">${isRtl ? 'أساسي' : 'MASTER'}</span>
                </div>
                <div class="product-card-detail">
                    <div style="display: flex; justify-content: center; background: rgba(0,0,0,0.2); padding: 12px; border-radius: var(--radius-md); border: 1px solid var(--border-base);">
                        <img src="${targetProduct.image_url || '/assets/placeholder-product.png'}" onerror="this.src='/assets/placeholder-product.png'" style="max-height: 120px; object-fit: contain;">
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${isRtl ? 'الاسم' : 'Name'}</span>
                        <span class="detail-value" style="font-weight: 600;">${tName}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${isRtl ? 'القسم الفرعي' : 'Subcat'}</span>
                        <span class="detail-value">${targetProduct.subcategory_name}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${isRtl ? 'البراند' : 'Brand'}</span>
                        <span class="detail-value">${targetProduct.brand_name || 'Generic'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${isRtl ? 'الوصف' : 'Description'}</span>
                        <span class="detail-value" style="font-size: 12px; max-height: 80px; overflow-y: auto;">
                            ${isRtl ? (targetProduct.description_ar || targetProduct.description_en || 'لا يوجد') : (targetProduct.description_en || 'No description')}
                        </span>
                    </div>
                    <div>
                        <h4 style="font-size: 13px; font-weight: 700; color: var(--text-secondary); margin-bottom: 10px;">
                            ${isRtl ? 'الإصدارات والأسعار' : 'Variants & Live Offers'} (${targetProduct.variants.length})
                        </h4>
                        <div class="variants-list">
                            ${targetProduct.variants.map(v => {
                                const totalOffers = v.offers.length;
                                const cheapestPrice = totalOffers > 0 ? Math.min(...v.offers.map(o => o.price_egp)) : null;
                                return `
                                    <div class="variant-row">
                                        <div class="variant-specs">
                                            <span style="font-weight: 600; font-size: 13px;">${v.storage_gb ? v.storage_gb + 'GB' : ''} ${v.ram_gb ? v.ram_gb + 'GB RAM' : ''} ${v.network_gen || ''}</span>
                                            <span style="font-size: 11px; color: var(--text-muted);">${isRtl ? (v.color_ar || v.color_en) : v.color_en} (${v.region_version || ''})</span>
                                        </div>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <span class="variant-badge offer-badge"><i class="fa-solid fa-tag"></i> ${totalOffers} ${isRtl ? 'عرض' : 'offers'}</span>
                                            ${cheapestPrice ? `<span class="variant-badge" style="background: rgba(16, 185, 129, 0.1); color:#10b981; font-weight:700;">${cheapestPrice.toLocaleString()} EGP</span>` : ''}
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Preview Resolution Map -->
        ${renderPreviewPanel()}

        <!-- Form trigger controls -->
        <div style="display: flex; justify-content: flex-end; gap: 12px;">
            <button id="cancel-merge-btn" class="btn btn-secondary">${isRtl ? 'إلغاء' : 'Cancel'}</button>
            <button id="execute-merge-btn" class="btn btn-primary" ${isViewer() ? 'disabled' : ''}>
                <i class="fa-solid fa-shuffle"></i> ${isRtl ? 'تأكيد دمج المنتجات' : 'Execute Safe Merge'}
            </button>
        </div>
    `;

    // Cancel triggers clear
    container.querySelector('#cancel-merge-btn').addEventListener('click', () => {
        sourceProduct = null;
        targetProduct = null;
        triggerComparisonRefresh(container.closest('.merge-page-container'));
        
        // Clear input values
        const root = container.closest('.merge-page-container');
        root.querySelector('#source-search-input').value = '';
        root.querySelector('#target-search-input').value = '';
        root.querySelector('#clear-source-btn').style.display = 'none';
        root.querySelector('#clear-target-btn').style.display = 'none';
    });

    // Execute Merge trigger
    const executeBtn = container.querySelector('#execute-merge-btn');
    if (executeBtn) {
        executeBtn.addEventListener('click', async () => {
            if (isViewer()) {
                showToast(isRtl ? 'حساب المشاهد لا يمكنه الدمج' : 'Viewer role has read-only access', 'warning');
                return;
            }

            const confirmed = confirm(isRtl 
                ? `تحذير: هل أنت متأكد من دمج "${sName}" بالكامل في "${tName}"؟\n\nستُنقل جميع الأسعار والإصدارات، وسيُحذف المصدر حذفا مؤقتا مع الاحتفاظ بلقطة استرجاع.` 
                : `WARNING: Are you sure you want to merge "${sName}" into "${tName}"?\n\nAll offers and variants will be consolidated, and the source product will be soft-deleted. An undo rollback snapshot will be saved.`
            );

            if (!confirmed) return;

            executeBtn.disabled = true;
            executeBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> ${isRtl ? 'جاري الدمج...' : 'Merging...'}`;

            try {
                const res = await adminFetch('/api/admin/merge/execute', {
                    method: 'POST',
                    body: {
                        sourceId: sourceProduct.id,
                        targetId: targetProduct.id
                    }
                });

                if (res.success) {
                    showToast(isRtl ? 'تم دمج المنتجات بنجاح!' : 'Products merged successfully!', 'success');
                    
                    // Reset slots
                    sourceProduct = null;
                    targetProduct = null;
                    
                    // Reset inputs
                    const root = container.closest('.merge-page-container');
                    root.querySelector('#source-search-input').value = '';
                    root.querySelector('#target-search-input').value = '';
                    root.querySelector('#clear-source-btn').style.display = 'none';
                    root.querySelector('#clear-target-btn').style.display = 'none';

                    // Re-route to history tab
                    activeTab = 'history';
                    root.querySelectorAll('.tab-btn').forEach(b => {
                        b.classList.remove('active');
                        if (b.dataset.tab === 'history') b.classList.add('active');
                    });
                    await loadTabData(root);
                }
            } catch (err) {
                showToast(err.message, 'danger');
                executeBtn.disabled = false;
                executeBtn.innerHTML = `<i class="fa-solid fa-shuffle"></i> ${isRtl ? 'تأكيد دمج المنتجات' : 'Execute Safe Merge'}`;
            }
        });
    }
}

function renderPreviewPanel() {
    if (!mergePreviewData) return '';
    const isRtl = state.lang === 'ar';

    let stepsHtml = '';
    
    // Family soft-delete preview
    stepsHtml += `
        <div class="preview-step">
            <span class="preview-step-icon" style="color: var(--danger);"><i class="fa-solid fa-trash-can-slash"></i></span>
            <span>${isRtl 
                ? `سيتم وسم منتج <strong>${sourceProduct.name_en}</strong> كـ "محذوف" (is_deleted = 1)` 
                : `Product family <strong>${sourceProduct.name_en}</strong> will be soft-deleted.`}</span>
        </div>
    `;

    // Variants resolution previews
    mergePreviewData.variantsPreview.forEach(vp => {
        if (vp.action === 'merge_offers') {
            stepsHtml += `
                <div class="preview-step">
                    <span class="preview-step-icon" style="color: var(--warning);"><i class="fa-solid fa-code-merge"></i></span>
                    <span>${isRtl 
                        ? `تطابق إصدار <code>${vp.sourceVariant.sku}</code>: ستُنقل عروض الأسعار (${vp.offersCount}) للإصدار الرئيسي <code>${vp.targetVariant.sku}</code> مع الاحتفاظ بالأرخص.` 
                        : `Variant conflict <code>${vp.sourceVariant.sku}</code> matches master: ${vp.offersCount} offer(s) will be merged, keeping cheapest price.`}</span>
                </div>
            `;
        } else {
            stepsHtml += `
                <div class="preview-step">
                    <span class="preview-step-icon" style="color: var(--success);"><i class="fa-solid fa-circle-arrow-right"></i></span>
                    <span>${isRtl 
                        ? `إصدار فريد <code>${vp.sourceVariant.sku}</code>: سيُنقل بالكامل مع توليد SKU جديد تحت العائلة الرئيسية: <code>${vp.newSku}</code>` 
                        : `Unique variant <code>${vp.sourceVariant.sku}</code>: will be moved and updated to new master SKU: <code>${vp.newSku}</code>`}</span>
                </div>
            `;
        }
    });

    // FTS Index / Rank override preview
    stepsHtml += `
        <div class="preview-step">
            <span class="preview-step-icon" style="color: var(--info);"><i class="fa-solid fa-bolt-lightning"></i></span>
            <span>${isRtl 
                ? `سيتم تحديث روابط المنتجات الخام (Raw Products) وإعادة بناء فهارس البحث وتفريغ الكاش لتحديث واجهة المستخدم للزوار.` 
                : `Raw product references will be re-routed. FTS5 index, caches, and ranking scores will be invalidated.`}</span>
        </div>
    `;

    return `
        <div class="preview-card">
            <div class="preview-title">
                <i class="fa-solid fa-magnifying-glass-chart"></i>
                <span>${isRtl ? 'معاينة خريطة دمج الإصدارات والأسعار' : 'Safe Consolidation Preview & SKU Resolutions'}</span>
            </div>
            <div class="preview-steps">
                ${stepsHtml}
            </div>
        </div>
    `;
}

// ═══════════════════════════════════════════════════
// Tab 3: History View
// ═══════════════════════════════════════════════════

function renderHistoryTab(container) {
    const isRtl = state.lang === 'ar';
    container.innerHTML = `
        <div class="card" style="padding: 0; overflow: hidden;">
            <div style="overflow-x: auto;">
                <table class="history-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>${isRtl ? 'المنتج الرئيسي' : 'Master Family'}</th>
                            <th>${isRtl ? 'المنتج المدمج (المحذوف)' : 'Merged Family'}</th>
                            <th>${isRtl ? 'المشرف' : 'Executed By'}</th>
                            <th>${isRtl ? 'المطابقة' : 'Confidence'}</th>
                            <th>${isRtl ? 'التاريخ' : 'Date'}</th>
                            <th>${isRtl ? 'الحالة' : 'Status'}</th>
                            <th style="text-align: right;">${isRtl ? 'الإجراءات' : 'Actions'}</th>
                        </tr>
                    </thead>
                    <tbody id="history-table-body">
                        <tr>
                            <td colspan="8" style="text-align: center; padding: 40px;">
                                <i class="fa-solid fa-circle-notch fa-spin" style="font-size: 24px; color: var(--primary); margin-bottom: 8px;"></i>
                                <div>${isRtl ? 'جاري تحميل سجل عمليات الدمج...' : 'Loading history log...'}</div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

async function fetchHistory(container) {
    const body = container.querySelector('#history-table-body');
    if (!body) return;

    try {
        const res = await adminFetch('/api/admin/merge/history');
        mergeHistory = res.history || [];
        renderHistoryTable(body);
    } catch (err) {
        showToast(err.message, 'danger');
        body.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: var(--danger);">
                    <i class="fa-solid fa-circle-exclamation" style="font-size: 24px; margin-bottom: 8px;"></i>
                    <div>${state.lang === 'ar' ? 'فشل تحميل السجل' : 'Failed to load merge history'}</div>
                </td>
            </tr>
        `;
    }
}

function renderHistoryTable(tbody) {
    const isRtl = state.lang === 'ar';
    if (mergeHistory.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    ${isRtl ? 'لا توجد عمليات دمج سابقة مسجلة.' : 'No historical merge events logged.'}
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = mergeHistory.map(row => {
        const isMerged = row.status === 'merged';
        const badgeClass = isMerged ? 'merged' : 'unmerged';
        const label = isMerged 
            ? (isRtl ? 'مدمج' : 'MERGED') 
            : (isRtl ? 'ملغي' : 'ROLLED BACK');
            
        const dateStr = new Date(row.created_at).toLocaleString(isRtl ? 'ar-EG' : 'en-US');
        
        let actionBtn = '';
        if (isMerged) {
            if (isSuperAdmin()) {
                actionBtn = `
                    <button class="btn btn-danger rollback-merge-btn" data-id="${row.id}" style="padding: 4px 8px; font-size: 11px; height: 28px;">
                        <i class="fa-solid fa-rotate-left"></i> ${isRtl ? 'إلغاء الدمج' : 'Rollback'}
                    </button>
                `;
            } else {
                actionBtn = `
                    <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px; height: 28px; opacity: 0.5; cursor: not-allowed;" title="${isRtl ? 'مطلوب صلاحية المشرف العام' : 'Super Admin role required'}" disabled>
                        <i class="fa-solid fa-lock"></i> ${isRtl ? 'إلغاء الدمج' : 'Rollback'}
                    </button>
                `;
            }
        } else {
            actionBtn = `<span style="font-size: 11px; color: var(--text-muted);">${row.unmerged_at ? new Date(row.unmerged_at).toLocaleDateString() : ''}</span>`;
        }

        return `
            <tr>
                <td>${row.id}</td>
                <td><strong style="color:var(--primary-light);">${row.master_name || 'Family ' + row.master_family_id}</strong></td>
                <td style="text-decoration: ${isMerged ? 'none' : 'line-through'};">${row.merged_name || 'Family ' + row.merged_family_id}</td>
                <td>${row.merged_by_name || 'Admin'}</td>
                <td style="font-family: var(--font-mono);">${Math.round((row.confidence_score || 0) * 100)}%</td>
                <td style="font-size: 12px; color:var(--text-secondary);">${dateStr}</td>
                <td><span class="status-badge ${badgeClass}">${label}</span></td>
                <td style="text-align: right;">${actionBtn}</td>
            </tr>
        `;
    }).join('');

    tbody.querySelectorAll('.rollback-merge-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = parseInt(btn.dataset.id, 10);
            const confirmed = confirm(isRtl
                ? 'تحذير: هل أنت متأكد من التراجع عن هذه العملية؟\n\nسيتم إعادة إنشاء العائلة والنسخ الفرعية والعروض الأصلية بالكامل.'
                : 'WARNING: Are you sure you want to rollback this merge operation?\n\nThis will recreate the source family and variants, re-routing all its original offers and raw products back to their original state.'
            );

            if (!confirmed) return;

            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i>`;

            try {
                const res = await adminFetch(`/api/admin/merge/unmerge/${id}`, {
                    method: 'POST'
                });

                if (res.success) {
                    showToast(isRtl ? 'تم التراجع عن الدمج بنجاح!' : 'Merge rollback completed successfully!', 'success');
                    await fetchHistory(tbody.closest('.merge-page-container'));
                }
            } catch (err) {
                showToast(err.message, 'danger');
                btn.disabled = false;
                btn.innerHTML = `<i class="fa-solid fa-rotate-left"></i> ${isRtl ? 'إلغاء الدمج' : 'Rollback'}`;
            }
        });
    });
}

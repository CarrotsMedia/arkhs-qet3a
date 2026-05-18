document.addEventListener('DOMContentLoaded', () => {
    // --- DOM ---
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const categoryNavInner = document.getElementById('categoryNavInner');
    const menuToggle = document.getElementById('menuToggle');
    const drawerOverlay = document.getElementById('drawerOverlay');
    const categoryDrawer = document.getElementById('categoryDrawer');
    const drawerClose = document.getElementById('drawerClose');
    const drawerBody = document.getElementById('drawerBody');
    const logoText = document.getElementById('logoText');
    const homepageSections = document.getElementById('homepageSections');
    const browseView = document.getElementById('browseView');
    const breadcrumbsBar = document.getElementById('breadcrumbsBar');
    const breadcrumbs = document.getElementById('breadcrumbs');
    const categoriesGrid = document.getElementById('categoriesGrid');
    const featuredGrid = document.getElementById('featuredGrid');
    const dealsGrid = document.getElementById('dealsGrid');
    const recentGrid = document.getElementById('recentGrid');
    const savingsGrid = document.getElementById('savingsGrid');
    const productsGrid = document.getElementById('productsGrid');
    const resultText = document.getElementById('resultText');
    const subcategoryChips = document.getElementById('subcategoryChips');
    const loader = document.getElementById('loader');
    const sortSelect = document.getElementById('sortSelect');
    const inStockToggle = document.getElementById('inStockToggle');
    const inStockWrapper = document.getElementById('inStockWrapper');
    const modal = document.getElementById('priceModal');
    const modalBody = document.getElementById('modalBody');
    const closeBtn = document.getElementById('modalCloseBtn');

    // State
    let categoryTree = [];
    let currentProducts = [];
    window.currentLang = localStorage.getItem('siteLang') || 'en';
    window.currentSearchQuery = null;
    window.currentCategorySlug = null;

    // --- Init ---

    async function init() {
        applyLang(window.currentLang);
        document.getElementById('lang-en').addEventListener('click', () => setLang('en'));
        document.getElementById('lang-ar').addEventListener('click', () => setLang('ar'));
        await fetchCategoryTree();
        showHome();
        setupEvents();
    }

    function setLang(lang) {
        if (window.currentLang === lang) return;
        window.currentLang = lang;
        localStorage.setItem('siteLang', lang);
        applyLang(lang);
        if (window.currentSearchQuery) handleSearch(window.currentSearchQuery);
        else if (window.currentCategorySlug) browseCategory(window.currentCategorySlug);
        else showHome();
    }

    function applyLang(lang) {
        document.querySelectorAll('.lang-btn').forEach(b => b.classList.toggle('active', b.id === `lang-${lang}`));
        if (lang === 'ar') document.documentElement.setAttribute('dir', 'rtl');
        else document.documentElement.removeAttribute('dir');

        const t = translations[lang];
        const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
        set('heroTitle', ''); // handled with innerHTML
        set('heroSubtitle', t.heroSubtitle);
        set('catSectionTitle', t.shopByCategory);
        set('savingsSectionTitle', t.biggestSavings);
        set('savingsDesc', t.savingsDesc);
        set('featuredSectionTitle', t.featured);
        set('dealsSectionTitle', t.bestDeals);
        set('recentSectionTitle', t.recentlyAdded);
        set('statProductsLabel', t.products);
        set('statStoresLabel', t.stores);
        set('statCategoriesLabel', t.categories);
        set('statSyncLabel', t.lastSync);

        const heroEl = document.getElementById('heroTitle');
        if (heroEl) heroEl.innerHTML = t.heroTitle;

        const si = document.getElementById('searchInput');
        if (si) si.placeholder = t.searchPlaceholder;
        const sb = document.getElementById('searchBtn');
        if (sb) sb.textContent = t.searchBtn;
    }

    const translations = {
        en: {
            heroTitle: 'Compare Prices Across<br><span class="hero-highlight">Egypt\'s Top Stores</span>',
            heroSubtitle: 'Find the best deals on phones, laptops, and electronics from 13+ stores',
            searchPlaceholder: 'Search for any product... e.g. iPhone 16, Samsung S25',
            searchBtn: 'Search',
            shopByCategory: 'Shop by Category',
            biggestSavings: 'Biggest Price Differences',
            savingsDesc: 'Products where you can save the most by choosing the right store',
            featured: 'Featured Products',
            bestDeals: 'Best Deals',
            recentlyAdded: 'Recently Added',
            products: 'Products',
            stores: 'Stores',
            categories: 'Categories',
            lastSync: 'Last Sync',
            from: 'from',
            store: 'store',
            storesPlural: 'stores',
            inStock: 'In Stock',
            outOfStock: 'Out of Stock',
            bestPrice: 'BEST PRICE',
            viewDeal: 'Visit Store',
            compareAcross: 'Compare prices across',
            storesBelow: 'stores below',
            priceHistory: 'Price History',
            save: 'Save',
            noDesc: 'No description available',
            searchResults: 'Search results for',
        },
        ar: {
            heroTitle: 'قارن الأسعار عبر<br><span class="hero-highlight">أفضل متاجر مصر</span>',
            heroSubtitle: 'اعثر على أفضل الأسعار للموبايلات واللابتوبات والإلكترونيات من ١٣+ متجر',
            searchPlaceholder: 'ابحث عن أي منتج... مثال: ايفون ١٦، سامسونج S25',
            searchBtn: 'بحث',
            shopByCategory: 'تسوق حسب الفئة',
            biggestSavings: 'أكبر فروقات الأسعار',
            savingsDesc: 'المنتجات التي يمكنك توفير أكبر قدر من المال عند اختيار المتجر المناسب',
            featured: 'منتجات مميزة',
            bestDeals: 'أفضل العروض',
            recentlyAdded: 'أضيف مؤخراً',
            products: 'منتج',
            stores: 'متجر',
            categories: 'فئة',
            lastSync: 'آخر تحديث',
            from: 'من',
            store: 'متجر',
            storesPlural: 'متاجر',
            inStock: 'متوفر',
            outOfStock: 'غير متوفر',
            bestPrice: 'أفضل سعر',
            viewDeal: 'زيارة المتجر',
            compareAcross: 'قارن الأسعار عبر',
            storesBelow: 'متاجر أدناه',
            priceHistory: 'تاريخ الأسعار',
            save: 'وفّر',
            noDesc: 'لا يوجد وصف متاح',
            searchResults: 'نتائج البحث عن',
        }
    };

    function t(key) { return translations[window.currentLang][key] || translations.en[key] || key; }

    function setupEvents() {
        logoText.addEventListener('click', showHome);
        searchBtn.addEventListener('click', () => handleSearch(searchInput.value));
        searchInput.addEventListener('keypress', e => { if (e.key === 'Enter') handleSearch(searchInput.value); });
        menuToggle.addEventListener('click', openDrawer);
        drawerClose.addEventListener('click', closeDrawer);
        drawerOverlay.addEventListener('click', closeDrawer);
        closeBtn.addEventListener('click', closeModal);
        window.addEventListener('click', e => { if (e.target === modal) closeModal(); });
        window.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
    }

    // --- Navigation ---
    function showHome() {
        homepageSections.style.display = 'block';
        browseView.style.display = 'none';
        searchInput.value = '';
        window.currentSearchQuery = null;
        window.currentCategorySlug = null;
        fetchStats();
        fetchFeaturedCategories();
        fetchTopSavings();
        fetchFeaturedProducts();
        fetchDeals();
        fetchRecent();
    }

    async function handleSearch(query) {
        if (!query.trim()) return;
        window.currentSearchQuery = query;
        window.currentCategorySlug = null;
        homepageSections.style.display = 'none';
        browseView.style.display = 'block';
        breadcrumbsBar.style.display = 'none';
        subcategoryChips.style.display = 'none';
        inStockWrapper.style.display = 'none';
        document.getElementById('brandFilters').style.display = 'none';
        resultText.textContent = `${t('searchResults')} "${query}"`;
        productsGrid.innerHTML = '';
        loader.style.display = 'block';
        try {
            const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=52`);
            const data = await res.json();
            loader.style.display = 'none';
            renderProducts(productsGrid, data.products || []);
        } catch (e) {
            loader.style.display = 'none';
            productsGrid.innerHTML = `<div class="empty-state"><span class="emoji">❌</span><p>Error searching.</p></div>`;
        }
    }

    async function browseCategory(slug, selectedBrand = null) {
        window.currentCategorySlug = slug;
        window.currentSearchQuery = null;
        homepageSections.style.display = 'none';
        browseView.style.display = 'block';
        productsGrid.innerHTML = '';
        loader.style.display = 'block';
        subcategoryChips.style.display = 'none';
        const bf = document.getElementById('brandFilters');
        if (!selectedBrand) { bf.style.display = 'none'; bf.innerHTML = ''; }
        try {
            let url = `/api/categories/${slug}/products?limit=52`;
            if (selectedBrand) url += `&brand=${encodeURIComponent(selectedBrand)}`;
            const res = await fetch(url);
            const data = await res.json();
            loader.style.display = 'none';
            resultText.textContent = `${data.category.icon} ${data.category.name}`;
            renderBreadcrumbs(data.breadcrumbs);
            renderProducts(productsGrid, data.products || []);
            const catInfo = categoryTree.find(c => c.slug === slug);
            if (catInfo && catInfo.subcategories && catInfo.subcategories.length > 0) renderSubcategoryChips(catInfo.subcategories, slug);
            fetchAndRenderBrandFilters(slug, false, selectedBrand);
        } catch (e) {
            loader.style.display = 'none';
            productsGrid.innerHTML = `<div class="empty-state"><span class="emoji">❌</span><p>Error loading category.</p></div>`;
        }
    }

    async function browseSubcategory(subSlug, selectedBrand = null) {
        homepageSections.style.display = 'none';
        browseView.style.display = 'block';
        productsGrid.innerHTML = '';
        loader.style.display = 'block';
        const bf = document.getElementById('brandFilters');
        if (!selectedBrand) { bf.style.display = 'none'; bf.innerHTML = ''; }
        try {
            let url = `/api/subcategories/${subSlug}/products?limit=52`;
            if (selectedBrand) url += `&brand=${encodeURIComponent(selectedBrand)}`;
            const res = await fetch(url);
            const data = await res.json();
            loader.style.display = 'none';
            resultText.textContent = `${data.subcategory.icon} ${data.subcategory.name}`;
            renderBreadcrumbs(data.breadcrumbs);
            renderProducts(productsGrid, data.products || []);
            fetchAndRenderBrandFilters(subSlug, true, selectedBrand);
        } catch (e) { loader.style.display = 'none'; }
    }

    async function fetchAndRenderBrandFilters(slug, isSub = true, activeBrand = null) {
        const container = document.getElementById('brandFilters');
        try {
            const url = isSub ? `/api/filters/sub/${slug}` : `/api/filters/${slug}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data && data.brands && data.brands.length > 0) {
                container.style.display = 'flex';
                container.innerHTML = '';
                const allChip = document.createElement('div');
                allChip.className = `brand-chip ${!activeBrand ? 'active' : ''}`;
                allChip.textContent = 'All';
                allChip.addEventListener('click', () => isSub ? browseSubcategory(slug) : browseCategory(slug));
                container.appendChild(allChip);
                data.brands.forEach(b => {
                    const chip = document.createElement('div');
                    const isActive = activeBrand && activeBrand.toLowerCase() === b.name.toLowerCase();
                    chip.className = `brand-chip ${isActive ? 'active' : ''}`;
                    chip.innerHTML = `${b.name} <span class="count">${b.count}</span>`;
                    chip.addEventListener('click', () => {
                        const nb = isActive ? null : b.name;
                        isSub ? browseSubcategory(slug, nb) : browseCategory(slug, nb);
                    });
                    container.appendChild(chip);
                });
            } else { container.style.display = 'none'; }
        } catch (e) { container.style.display = 'none'; }
    }

    // --- Renderers ---
    function renderBreadcrumbs(crumbs) {
        if (!crumbs || crumbs.length === 0) { breadcrumbsBar.style.display = 'none'; return; }
        breadcrumbsBar.style.display = 'block';
        breadcrumbs.innerHTML = '';
        crumbs.forEach((crumb, idx) => {
            const span = document.createElement('span');
            span.className = 'breadcrumb-item';
            span.innerHTML = `${crumb.icon ? crumb.icon + ' ' : ''}${crumb.name}`;
            span.addEventListener('click', () => {
                if (crumb.slug === '/') showHome();
                else if (crumb.slug.split('/').length === 3) browseCategory(crumb.slug.split('/').pop());
                else browseSubcategory(crumb.slug.split('/').pop());
            });
            breadcrumbs.appendChild(span);
            if (idx < crumbs.length - 1) {
                const sep = document.createElement('span');
                sep.className = 'breadcrumb-separator';
                sep.textContent = ' / ';
                breadcrumbs.appendChild(sep);
            }
        });
    }

    function renderSubcategoryChips(subs, parentSlug) {
        subcategoryChips.style.display = 'flex';
        subcategoryChips.innerHTML = '';
        subs.forEach(sub => {
            const chip = document.createElement('div');
            chip.className = 'chip';
            chip.textContent = `${sub.icon} ${sub.name}`;
            chip.addEventListener('click', () => browseSubcategory(sub.slug));
            subcategoryChips.appendChild(chip);
        });
    }

    function renderProducts(container, products) {
        container.innerHTML = '';
        if (!products || products.length === 0) {
            container.innerHTML = `<div class="empty-state"><span class="emoji">📭</span><p>No products found.</p></div>`;
            return;
        }
        if (container === productsGrid) currentProducts = products;

        products.forEach(p => {
            const card = document.createElement('div');
            card.className = 'product-card';

            const offers = p.offers || [];
            const inStockOffers = offers.filter(o => o.availability === 'in_stock');
            const prices = inStockOffers.length > 0 ? inStockOffers.map(o => o.price_egp) : offers.map(o => o.price_egp);
            const minPrice = prices.length > 0 ? Math.min(...prices) : null;
            const maxPrice = prices.length > 0 ? Math.max(...prices) : null;
            const storeCount = offers.length;
            const hasStock = offers.some(o => o.availability === 'in_stock');
            const displayName = window.currentLang === 'ar' ? (p.name_ar || p.name_en || p.merged_name) : (p.name_en || p.name_ar || p.merged_name);
            const savings = (maxPrice && minPrice && storeCount > 1) ? maxPrice - minPrice : 0;

            let priceRangeHtml = '';
            if (storeCount > 1 && minPrice !== maxPrice) {
                priceRangeHtml = `<div class="price-range">${formatPrice(minPrice)} — ${formatPrice(maxPrice)}</div>`;
            }

            let savingsHtml = '';
            if (savings > 100) {
                savingsHtml = `<span class="savings-badge">${t('save')} ${formatPrice(savings)}</span>`;
            }

            card.innerHTML = `
                <div class="card-image-container">
                    <span class="stock-badge ${hasStock ? 'in-stock' : 'out-of-stock'}">
                        ${hasStock ? t('inStock') : t('outOfStock')}
                    </span>
                    <img src="${p.image_url || ''}" alt="${displayName}" class="product-image" onerror="this.style.display='none'" loading="lazy">
                </div>
                <div class="card-body">
                    ${p.brand ? `<div class="card-brand">${p.brand}</div>` : ''}
                    <div class="card-title">${displayName}</div>
                    <div class="card-meta">
                        <div class="price-area">
                            <span class="price-from">${t('from')}</span>
                            ${minPrice ? `<span class="card-price">${formatPrice(minPrice)} <span class="currency">EGP</span></span>` : '<span class="card-price">N/A</span>'}
                            ${priceRangeHtml}
                        </div>
                        <div class="card-stores">
                            <span class="store-count">${storeCount} ${storeCount === 1 ? t('store') : t('storesPlural')}</span>
                            ${savingsHtml}
                        </div>
                    </div>
                </div>
            `;
            card.addEventListener('click', () => openProductDetail(p));
            container.appendChild(card);
        });
    }

    // --- Modal Detail ---
    async function openProductDetail(p) {
        // Show loader inside the modal immediately while fetching fresh comparison data
        modalBody.innerHTML = `
            <div class="loader-container">
                <div class="spinner"></div>
                <p>Loading merchant offers...</p>
            </div>
        `;
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';

        let activeProduct = p;
        try {
            const res = await fetch(`/api/products/${p.product_id}`);
            const data = await res.json();
            if (data && !data.error) {
                activeProduct = data;
            }
        } catch (e) {
            console.error('Failed to fetch fresh product comparisons, using local data', e);
        }

        const offers = activeProduct.offers || [];
        const sorted = [...offers].sort((a, b) => {
            if (a.availability === 'in_stock' && b.availability !== 'in_stock') return -1;
            if (a.availability !== 'in_stock' && b.availability === 'in_stock') return 1;
            return a.price_egp - b.price_egp;
        });
        const minPrice = sorted.length > 0 ? sorted[0].price_egp : null;
        const storeCount = sorted.length;

        let offersHtml = '';
        sorted.forEach((o, i) => {
            const isBest = i === 0 && o.availability === 'in_stock';
            const stockClass = o.availability === 'in_stock' ? 'in' : 'out';
            const stockText = o.availability === 'in_stock' ? t('inStock') : t('outOfStock');
            offersHtml += `
                <div class="merchant-row ${isBest ? 'best-deal' : ''}">
                    <div class="merchant-info">
                        <div class="merchant-name">${o.store_name}</div>
                        <div class="merchant-stock ${stockClass}">${stockText}</div>
                    </div>
                    <div class="merchant-actions">
                        ${o.original_price_egp ? `<span class="merchant-original">${formatPrice(o.original_price_egp)}</span>` : ''}
                        <div class="merchant-price">${formatPrice(o.price_egp)} EGP</div>
                        <a href="${o.url}" target="_blank" rel="noopener" class="merchant-buy-btn">${t('viewDeal')}</a>
                    </div>
                </div>
            `;
        });

        const displayName = window.currentLang === 'ar' ? (activeProduct.name_ar || activeProduct.name_en || activeProduct.merged_name) : (activeProduct.name_en || activeProduct.name_ar || activeProduct.merged_name);
        const desc = window.currentLang === 'ar' ? (activeProduct.description_ar || activeProduct.description_en || t('noDesc')) : (activeProduct.description_en || activeProduct.description_ar || t('noDesc'));

        modalBody.innerHTML = `
            <div class="product-detail-view">
                <div class="product-detail-img">
                    <img src="${activeProduct.image_url || ''}" alt="${displayName}" onerror="this.style.display='none'">
                </div>
                <div class="product-detail-info">
                    ${activeProduct.brand ? `<div class="product-detail-brand">${activeProduct.brand}</div>` : ''}
                    <h2 class="product-detail-title" ${window.currentLang === 'ar' ? 'dir="rtl"' : ''}>${displayName}</h2>
                    <p class="product-detail-desc" ${window.currentLang === 'ar' ? 'dir="rtl"' : ''}>${desc}</p>
                    <div class="product-detail-price-row">
                        <div class="product-detail-price">${minPrice ? formatPrice(minPrice) + ' EGP' : 'N/A'}</div>
                        <span class="product-detail-price-label">${t('from')} ${storeCount} ${storeCount === 1 ? t('store') : t('storesPlural')}</span>
                    </div>
                    <h3 class="compare-heading">📊 ${t('compareAcross')} ${storeCount} ${t('storesBelow')}</h3>
                    <div class="merchant-list">${offersHtml}</div>
                </div>
            </div>
            <div class="price-history-section">
                <h3>📈 ${t('priceHistory')}</h3>
                <div style="height:250px;"><canvas id="priceChart"></canvas></div>
            </div>
        `;

        fetchPriceHistory(activeProduct.product_id);
    }

    async function fetchPriceHistory(productId) {
        try {
            const res = await fetch(`/api/products/${productId}/history`);
            const data = await res.json();
            if (window.priceChartInstance) window.priceChartInstance.destroy();
            const ctx = document.getElementById('priceChart').getContext('2d');
            const datasets = [];
            const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
            let ci = 0;
            const allDates = new Set();
            for (const store in data) data[store].forEach(pt => allDates.add(pt.date.split(' ')[0]));
            const labels = Array.from(allDates).sort();
            for (const store in data) {
                const sd = [];
                labels.forEach(l => { const pt = data[store].find(p => p.date.startsWith(l)); sd.push(pt ? pt.price : null); });
                datasets.push({ label: store, data: sd, borderColor: colors[ci % colors.length], backgroundColor: colors[ci % colors.length], tension: 0.3, fill: false, spanGaps: true, pointRadius: 3, borderWidth: 2 });
                ci++;
            }
            window.priceChartInstance = new Chart(ctx, {
                type: 'line', data: { labels, datasets },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: false, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#475569', callback: v => v + ' EGP' } },
                        x: { grid: { color: 'rgba(0,0,0,0.03)' }, ticks: { color: '#475569', maxTicksLimit: 8 } }
                    },
                    plugins: {
                        legend: { position: 'bottom', labels: { color: '#475569', padding: 15 } },
                        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${new Intl.NumberFormat('en-EG').format(ctx.parsed.y)} EGP` } }
                    }
                }
            });
        } catch (e) { console.error('Failed to load price history', e); }
    }

    function closeModal() { modal.classList.remove('show'); document.body.style.overflow = ''; }

    // --- API Fetchers ---
    async function fetchCategoryTree() {
        try {
            const res = await fetch('/api/categories/tree');
            categoryTree = await res.json();
            renderCategoryNav();
        } catch (e) { console.error('Error fetching tree', e); }
    }

    function renderCategoryNav() {
        categoryNavInner.innerHTML = '';
        drawerBody.innerHTML = '';
        categoryTree.forEach(cat => {
            const a = document.createElement('a');
            a.className = 'nav-item';
            a.innerHTML = `<span>${cat.icon}</span> ${cat.name}`;
            a.addEventListener('click', () => browseCategory(cat.slug));
            categoryNavInner.appendChild(a);
            const d = document.createElement('a');
            d.className = 'drawer-item';
            d.innerHTML = `${cat.icon} ${cat.name}`;
            d.addEventListener('click', () => { closeDrawer(); browseCategory(cat.slug); });
            drawerBody.appendChild(d);
        });
    }

    async function fetchStats() {
        try {
            const res = await fetch('/api/stats');
            const s = await res.json();
            document.getElementById('statProducts').textContent = s.totalProducts ? s.totalProducts.toLocaleString() : '—';
            document.getElementById('statStores').textContent = s.totalStores || '—';
            document.getElementById('statCategories').textContent = s.totalCategories || '—';
            document.getElementById('statSync').textContent = s.lastSync ? new Date(s.lastSync).toLocaleDateString() : '—';
        } catch (e) {}
    }

    async function fetchFeaturedCategories() {
        try {
            const res = await fetch('/api/categories');
            const cats = await res.json();
            categoriesGrid.innerHTML = '';
            cats.slice(0, 12).forEach(c => {
                const div = document.createElement('div');
                div.className = 'cat-card';
                div.innerHTML = `<div class="cat-icon">${c.icon}</div><div class="cat-name">${c.name}</div>`;
                div.addEventListener('click', () => browseCategory(c.slug));
                categoriesGrid.appendChild(div);
            });
        } catch (e) {}
    }

    async function fetchTopSavings() {
        try {
            const res = await fetch('/api/top-savings?limit=8');
            const data = await res.json();
            renderProducts(savingsGrid, data);
        } catch (e) {}
    }

    async function fetchFeaturedProducts() {
        try { const res = await fetch('/api/featured'); renderProducts(featuredGrid, await res.json()); } catch (e) {}
    }

    async function fetchDeals() {
        try { const res = await fetch('/api/deals'); renderProducts(dealsGrid, await res.json()); } catch (e) {}
    }

    async function fetchRecent() {
        try { const res = await fetch('/api/recent'); renderProducts(recentGrid, await res.json()); } catch (e) {}
    }

    // --- Utils ---
    function openDrawer() { categoryDrawer.classList.add('open'); drawerOverlay.style.display = 'block'; }
    function closeDrawer() { categoryDrawer.classList.remove('open'); drawerOverlay.style.display = 'none'; }
    function formatPrice(price) { if (!price) return 'N/A'; return new Intl.NumberFormat('en-EG').format(price); }

    // --- Start ---
    init();
});

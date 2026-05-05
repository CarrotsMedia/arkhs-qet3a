document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const productsGrid = document.getElementById('productsGrid');
    const resultText = document.getElementById('resultText');
    const loader = document.getElementById('loader');

    // Modal elements
    const modal = document.getElementById('priceModal');
    const closeBtn = document.querySelector('.close-btn');
    const modalBody = document.getElementById('modalBody');

    // Store current search results for modal navigation
    let fetchedProducts = [];
    let currentProducts = [];
    let isShowingSuggestions = true;
    let currentQuery = '';
    let currentPage = 1;
    let totalSearchCount = 0;

    const paginationContainer = document.getElementById('pagination');

    const inStockToggle = document.getElementById('inStockToggle');
    const inStockWrapper = document.getElementById('inStockWrapper');

    // Category elements
    const categoriesSection = document.getElementById('categoriesSection');
    const categoriesGrid = document.getElementById('categoriesGrid');
    const backToCategories = document.getElementById('backToCategories');
    const backToCategoriesBtn = document.getElementById('backToCategoriesBtn');
    const currentCategoryName = document.getElementById('currentCategoryName');

    let isBrowsingCategory = false;
    let currentBrowseCategory = '';
    let currentBrowsePage = 1;

    inStockToggle.addEventListener('change', () => {
        if (fetchedProducts.length === 0) return;
        applyFiltersAndRender();
    });

    const applyFiltersAndRender = () => {
        let toRender = fetchedProducts;
        if (!isShowingSuggestions && inStockToggle.checked) {
            toRender = fetchedProducts.filter(p => p.has_stock === true);
        }
        if (!isShowingSuggestions && searchInput.value) {
            if (totalSearchCount > 0) {
                resultText.textContent = `Showing ${toRender.length} of ${totalSearchCount} grouped products for "${searchInput.value}"`;
            } else {
                resultText.textContent = `Found ${toRender.length} grouped products for "${searchInput.value}"`;
            }
        }
        renderProducts(toRender, isShowingSuggestions);
    };

    // ───── Helpers ─────
    const fixImageUrl = (url) => {
        if (!url) return null;
        if (url.startsWith('/_next/')) return `https://sigma-computer.com${url}`;
        return url;
    };

    const formatPrice = (price) => {
        if (!price || price >= 999999) return 'Check site';
        return new Intl.NumberFormat('en-EG').format(price);
    };

    // ───── STEP 0: Load Suggestions ─────
    const fetchSuggestions = async () => {
        try {
            const response = await fetch('/api/suggestions');
            const data = await response.json();

            const formatted = data.map(p => ({
                product_id: p.product_id,
                merged_name: p.merged_name,
                image_url: fixImageUrl(p.image_url),
                has_stock: p.has_stock,
                offers: p.offers || []
            }));
            fetchedProducts = formatted;
            isShowingSuggestions = true;
            isBrowsingCategory = false;
            // Show categories, hide back bar
            categoriesSection.style.display = '';
            backToCategories.style.display = 'none';
            applyFiltersAndRender();
            renderPagination(1, 1); // Hide pagination for suggestions
        } catch (error) {
            console.error('Error fetching suggestions:', error);
        }
    };

    // ───── STEP 0.5: Load DB Stats ─────
    const fetchStats = async () => {
        try {
            const response = await fetch('/api/stats');
            const data = await response.json();
            const dbStatsEl = document.getElementById('dbStats');
            if (dbStatsEl) {
                let dateStr = "Unknown";
                if (data.lastSync) {
                    dateStr = new Date(data.lastSync).toLocaleString();
                }
                const count = (data.totalProducts || 0).toLocaleString();
                dbStatsEl.innerHTML = `📦 <strong>${count}</strong> products indexed | 🕒 Last synced: <strong>${dateStr}</strong>`;
            }
        } catch (e) {
            console.log("Could not load stats", e);
        }
    };

    // ───── STEP 1: Live Search → Product Cards ─────
    const fetchLiveSearch = async (query, page = 1) => {
        if (!query.trim()) return;

        currentQuery = query;
        currentPage = page;
        isBrowsingCategory = false;

        productsGrid.innerHTML = '';
        inStockWrapper.style.display = 'none';
        paginationContainer.style.display = 'none';
        categoriesSection.style.display = 'none';
        backToCategories.style.display = 'none';
        resultText.textContent = `Searching live for "${query}" (Page ${page})…`;
        loader.style.display = 'block';
        searchBtn.disabled = true;
        searchBtn.textContent = '⏳ Searching…';

        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&page=${page}&limit=50`);
            const data = await response.json();

            loader.style.display = 'none';
            searchBtn.disabled = false;
            searchBtn.textContent = '🔍 Search Now';

            if (!data.products || data.count === 0) {
                resultText.textContent = `No results found for "${query}"`;
                productsGrid.innerHTML = `
                    <div class="empty-state">
                        <span class="emoji">🔍</span>
                        <p style="font-size:1.1rem; margin-bottom:0.5rem;">No products found for "<strong>${query}</strong>"</p>
                        <p style="font-size:0.85rem;">Try a different term like "RTX 4070" or "Core i5"</p>
                    </div>`;
                return;
            }
            totalSearchCount = data.count || 0;
            fetchedProducts = data.products || [];
            isShowingSuggestions = false;
            inStockWrapper.style.display = 'inline-flex';
            applyFiltersAndRender();
            renderPagination(data.page || 1, data.totalPages || 1);
        } catch (error) {
            console.error('Error fetching live search:', error);
            loader.style.display = 'none';
            searchBtn.disabled = false;
            searchBtn.textContent = '🔍 Search Now';
            productsGrid.innerHTML = `
                <div class="empty-state">
                    <span class="emoji">⚠️</span>
                    <p>Error loading products. Please try again.</p>
                </div>`;
        }
    };

    // ───── Render Pagination ─────
    const renderPagination = (page, totalPages) => {
        if (totalPages <= 1 || isShowingSuggestions) {
            paginationContainer.style.display = 'none';
            return;
        }
        paginationContainer.style.display = 'flex';
        paginationContainer.innerHTML = '';

        const prevBtn = document.createElement('button');
        prevBtn.textContent = '← Previous';
        prevBtn.className = 'pagination-btn';
        prevBtn.disabled = page <= 1;
        prevBtn.addEventListener('click', () => {
            fetchLiveSearch(currentQuery, page - 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        const pageInfo = document.createElement('span');
        pageInfo.className = 'pagination-info';
        pageInfo.textContent = `Page ${page} of ${totalPages}`;

        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Next →';
        nextBtn.className = 'pagination-btn';
        nextBtn.disabled = page >= totalPages;
        nextBtn.addEventListener('click', () => {
            fetchLiveSearch(currentQuery, page + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        paginationContainer.appendChild(prevBtn);
        paginationContainer.appendChild(pageInfo);
        paginationContainer.appendChild(nextBtn);
    };

    // ───── Render Product Cards ─────
    const renderProducts = (products, isSuggestion) => {
        productsGrid.innerHTML = '';
        currentProducts = products;

        if (!products || products.length === 0) {
            productsGrid.innerHTML = `
                <div class="empty-state">
                    <p>No products found.</p>
                </div>`;
            return;
        }

        products.forEach((p, index) => {
            const card = document.createElement('div');
            card.className = 'product-card';
            card.style.animationDelay = `${index * 0.06}s`;

            const lowestPrice = p.offers.reduce((min, o) => o.price_egp < min ? o.price_egp : min, p.offers[0].price_egp);
            const imageUrl = fixImageUrl(p.image_url);
            const storeCount = p.offers ? p.offers.length : 0;

            const imageHTML = imageUrl
                ? `<img src="${imageUrl}" alt="${p.merged_name}" class="product-image" loading="lazy" onerror="this.style.display='none'; this.parentElement.innerHTML='<div class=\\'product-image\\' style=\\'display:flex;align-items:center;justify-content:center;font-size:3rem;height:200px;\\'>📦</div>'">`
                : `<div class="product-image" style="display:flex;align-items:center;justify-content:center;font-size:3rem;height:200px;">📦</div>`;

            // Determine stock status
            const hasStock = p.has_stock || p.offers?.some(o => o.availability === 'in_stock');
            const stockBadge = isSuggestion ? '' :
                `<span class="stock-badge ${hasStock ? 'in-stock' : 'out-of-stock'}">${hasStock ? 'In Stock ✅' : 'Out of Stock'}</span>`;

            card.innerHTML = `
                <div class="card-image-container">
                    ${stockBadge}
                    ${imageHTML}
                </div>
                <div class="card-body">
                    <div class="card-title">${p.merged_name}</div>
                    <div class="card-meta">
                        <span class="card-stores">${isSuggestion ? 'From Database' : `${storeCount} ${storeCount === 1 ? 'store' : 'stores'}`}</span>
                        <span class="card-price">${formatPrice(lowestPrice)} <span class="currency">EGP</span></span>
                    </div>
                    <button class="card-btn">${isSuggestion ? '🔍 Search Live' : '📋 View Details'}</button>
                </div>
            `;

            // Card click action
            const btn = card.querySelector('.card-btn');
            if (isSuggestion) {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const shortName = p.merged_name.split(' ').slice(0, 4).join(' ');
                    searchInput.value = shortName;
                    fetchLiveSearch(shortName);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });
            } else {
                // Click anywhere on card opens detail
                card.addEventListener('click', () => openProductDetail(index));
            }

            productsGrid.appendChild(card);
        });
    };

    // ───── STEP 2: Product Detail View (Modal) ─────
    const openProductDetail = (productIndex) => {
        const p = currentProducts[productIndex];
        if (!p) return;

        const lowestPrice = p.offers.reduce((min, o) => o.price_egp < min ? o.price_egp : min, p.offers[0].price_egp);
        const imageUrl = fixImageUrl(p.image_url);
        const storeCount = p.offers.length;
        const hasStock = p.has_stock || p.offers.some(o => o.availability === 'in_stock');
        const inStockCount = p.offers.filter(o => o.availability === 'in_stock').length;

        modalBody.innerHTML = `
            <div class="product-detail-view">
                <div class="product-detail-img">
                    ${imageUrl
                ? `<img src="${imageUrl}" alt="${p.merged_name}" onerror="this.style.display='none'">`
                : '<div style="font-size:4rem;">📦</div>'}
                </div>
                <div class="product-detail-info">
                    <h2 class="product-detail-title">${p.merged_name}</h2>
                    <div class="product-detail-price">${formatPrice(lowestPrice)} EGP</div>
                    <div class="product-detail-stock ${hasStock ? 'in-stock' : 'out-of-stock'}">
                        ${hasStock
                ? `In Stock — Available in ${inStockCount} of ${storeCount} ${storeCount === 1 ? 'store' : 'stores'} ✅`
                : `Out of Stock across all ${storeCount} ${storeCount === 1 ? 'store' : 'stores'} 🔴`}
                    </div>
                    <p class="product-detail-desc">
                        ${hasStock
                ? `This product is currently available. Click the button below to compare prices from cheapest to most expensive across all <strong>${storeCount}</strong> ${storeCount === 1 ? 'source' : 'sources'}.`
                : `This product is currently out of stock. You can still check the listed prices for reference.`}
                    </p>
                    <button class="cheapest-btn" id="showMerchantsBtn">
                        🛒 Compare Prices — Find Cheapest
                    </button>
                </div>
            </div>
            <div class="product-history-container">
                <h3 class="history-title">Price History</h3>
                <div class="chart-wrapper">
                    <canvas id="priceHistoryChart"></canvas>
                </div>
            </div>
        `;

        document.getElementById('showMerchantsBtn').addEventListener('click', () => {
            showMerchants(productIndex);
        });

        renderPriceHistoryChart(p.product_id);
        openModal();
    };

    // ───── Render Price History Chart ─────
    let currentChart = null;

    const renderPriceHistoryChart = async (productId) => {
        const canvas = document.getElementById('priceHistoryChart');
        if (!canvas || !productId) return;

        // Reset chart
        if (currentChart) {
            currentChart.destroy();
            currentChart = null;
        }

        try {
            const response = await fetch(`/api/history/${productId}`);
            const data = await response.json();

            if (Object.keys(data).length === 0) {
                canvas.parentElement.innerHTML = '<p style="text-align:center; color: #777;">No price history available.</p>';
                return;
            }

            // Colors for different stores
            const colors = {
                'Sigma Computer': '#059669', // green
                'البدر جروب': '#cc0c39', // red
                'Compumarts': '#007185', // blue
                'Maximum Hardware': '#f3a847' // orange
            };

            const datasets = [];
            const allDates = new Set();

            // First pass to collect all dates for x-axis
            for (const [store, points] of Object.entries(data)) {
                points.forEach(pt => allDates.add(pt.date.split(' ')[0])); // just the date part
            }

            // Sort dates chronologically
            let sortedDates = Array.from(allDates).sort();

            // If only one date exists, add another date to force a line to be drawn
            if (sortedDates.length === 1) {
                const today = new Date().toISOString().split('T')[0];
                if (sortedDates[0] !== today) {
                    sortedDates.push(today);
                } else {
                    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
                    sortedDates.unshift(yesterday);
                }
            }

            for (const [store, points] of Object.entries(data)) {
                const color = colors[store] || '#' + Math.floor(Math.random() * 16777215).toString(16);

                // Map points to the sorted dates timeline
                let lastKnownPrice = null;
                const dataPoints = sortedDates.map(date => {
                    // Get the latest price for this date
                    const dailyPoints = points.filter(pt => pt.date.startsWith(date));
                    if (dailyPoints.length > 0) {
                        lastKnownPrice = dailyPoints[dailyPoints.length - 1].price;
                        return lastKnownPrice;
                    }
                    return lastKnownPrice; // carry forward so horizontal line is drawn
                });

                datasets.push({
                    label: store,
                    data: dataPoints,
                    borderColor: color,
                    backgroundColor: color,
                    tension: 0.1,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    borderWidth: 2,
                    spanGaps: true
                });
            }

            currentChart = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: sortedDates,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top' },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    return context.dataset.label + ': ' + new Intl.NumberFormat('en-EG').format(context.parsed.y) + ' EGP';
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: false,
                            grace: '10%', // Adds padding to top/bottom
                            title: { display: true, text: 'Price (EGP)' },
                            ticks: {
                                callback: function (value) {
                                    return new Intl.NumberFormat('en-EG').format(value);
                                }
                            }
                        },
                        x: {
                            title: { display: true, text: 'Date' }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Failed to render chart:', error);
            canvas.parentElement.innerHTML = '<p style="text-align:center; color: #777;">Failed to load price history.</p>';
        }
    };

    // ───── STEP 3: Merchants Price List (Modal) ─────
    const showMerchants = (productIndex) => {
        const p = currentProducts[productIndex];
        if (!p) return;

        // Sort offers by price ascending
        const sorted = [...p.offers].sort((a, b) => a.price_egp - b.price_egp);

        let rowsHTML = '';
        sorted.forEach((offer, i) => {
            const isBest = i === 0;
            const storeName = offer.store_name || offer.store_slug || 'Unknown';
            const isInStock = offer.availability === 'in_stock';
            const isDisabled = !isInStock;

            rowsHTML += `
                <div class="merchant-row ${isBest ? 'best-deal' : ''}" ${isDisabled ? 'style="opacity:0.6;"' : ''}>
                    <div class="merchant-info">
                        <div class="merchant-name">${storeName}</div>
                        <span class="merchant-stock" style="color: ${isInStock ? 'var(--green)' : 'var(--red)'}">
                            ${isInStock ? '● In Stock' : '○ Out of Stock'}
                        </span>
                    </div>
                    <div class="merchant-price">${formatPrice(offer.price_egp)} EGP</div>
                    <div class="merchant-actions">
                        <a href="${offer.url}" target="_blank" rel="noopener" class="merchant-buy-btn ${isDisabled ? 'disabled' : ''}">
                            ${isBest && isInStock ? '🛒 Buy Now' : isInStock ? 'Visit Store →' : 'View Page'}
                        </a>
                    </div>
                </div>
            `;
        });

        modalBody.innerHTML = `
            <div>
                <h3 class="merchants-title">Price Comparison — ${sorted.length} Stores</h3>
                <div class="merchant-list">
                    ${rowsHTML}
                </div>
                <button class="back-btn" id="backToDetailBtn">← Back to Product</button>
            </div>
        `;

        document.getElementById('backToDetailBtn').addEventListener('click', () => {
            openProductDetail(productIndex);
        });
    };

    // ───── Modal Controls ─────
    const openModal = () => {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    };

    const closeModal = () => {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    };

    closeBtn.addEventListener('click', closeModal);
    window.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
    });

    // ───── Categories: Load & Render ─────
    const fetchCategories = async () => {
        try {
            const response = await fetch('/api/categories');
            const data = await response.json();
            renderCategories(data);
        } catch (error) {
            console.error('Error fetching categories:', error);
            categoriesSection.style.display = 'none';
        }
    };

    const renderCategories = (categories) => {
        categoriesGrid.innerHTML = '';
        if (!categories || categories.length === 0) {
            categoriesSection.style.display = 'none';
            return;
        }

        categories.forEach((cat, index) => {
            const card = document.createElement('div');
            card.className = 'category-card';
            card.style.animationDelay = `${index * 0.04}s`;
            card.innerHTML = `
                <span class="category-icon">${cat.icon}</span>
                <span class="category-name">${cat.name}</span>
                <span class="category-count">${cat.count.toLocaleString()} products</span>
            `;
            card.addEventListener('click', () => browseCategory(cat.name, cat.icon));
            categoriesGrid.appendChild(card);
        });
    };

    const browseCategory = async (categoryName, icon, page = 1) => {
        currentBrowseCategory = categoryName;
        currentBrowsePage = page;
        isBrowsingCategory = true;
        isShowingSuggestions = false;

        // UI state
        categoriesSection.style.display = 'none';
        backToCategories.style.display = 'flex';
        currentCategoryName.textContent = `${icon || '📁'} ${categoryName}`;
        productsGrid.innerHTML = '';
        inStockWrapper.style.display = 'none';
        paginationContainer.style.display = 'none';
        resultText.textContent = `Loading ${categoryName}…`;
        loader.style.display = 'block';

        try {
            const response = await fetch(`/api/browse?category=${encodeURIComponent(categoryName)}&page=${page}&limit=52`);
            const data = await response.json();

            loader.style.display = 'none';

            if (!data.products || data.count === 0) {
                resultText.textContent = `No products in "${categoryName}"`;
                productsGrid.innerHTML = `
                    <div class="empty-state">
                        <span class="emoji">📭</span>
                        <p>No products found in this category</p>
                    </div>`;
                return;
            }

            totalSearchCount = data.count || 0;
            fetchedProducts = data.products || [];
            inStockWrapper.style.display = 'inline-flex';
            resultText.textContent = `${icon || '📁'} ${categoryName} — ${data.count} products`;
            applyFiltersAndRender();

            // Render browse pagination
            if (data.totalPages > 1) {
                renderBrowsePagination(data.page, data.totalPages, categoryName, icon);
            }
        } catch (error) {
            console.error('Error browsing category:', error);
            loader.style.display = 'none';
            productsGrid.innerHTML = `
                <div class="empty-state">
                    <span class="emoji">⚠️</span>
                    <p>Error loading category. Please try again.</p>
                </div>`;
        }
    };

    const renderBrowsePagination = (page, totalPages, categoryName, icon) => {
        paginationContainer.style.display = 'flex';
        paginationContainer.innerHTML = '';

        const prevBtn = document.createElement('button');
        prevBtn.textContent = '← Previous';
        prevBtn.className = 'pagination-btn';
        prevBtn.disabled = page <= 1;
        prevBtn.addEventListener('click', () => {
            browseCategory(categoryName, icon, page - 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        const pageInfo = document.createElement('span');
        pageInfo.className = 'pagination-info';
        pageInfo.textContent = `Page ${page} of ${totalPages}`;

        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Next →';
        nextBtn.className = 'pagination-btn';
        nextBtn.disabled = page >= totalPages;
        nextBtn.addEventListener('click', () => {
            browseCategory(categoryName, icon, page + 1);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });

        paginationContainer.appendChild(prevBtn);
        paginationContainer.appendChild(pageInfo);
        paginationContainer.appendChild(nextBtn);
    };

    // Back to categories button
    backToCategoriesBtn.addEventListener('click', () => {
        isBrowsingCategory = false;
        backToCategories.style.display = 'none';
        categoriesSection.style.display = '';
        productsGrid.innerHTML = '';
        paginationContainer.style.display = 'none';
        inStockWrapper.style.display = 'none';
        resultText.textContent = 'Popular Suggestions';
        searchInput.value = '';
        fetchSuggestions();
    });

    // ───── Event Listeners ─────
    searchBtn.addEventListener('click', () => fetchLiveSearch(searchInput.value, 1));
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') fetchLiveSearch(searchInput.value, 1);
    });

    // Start with categories, suggestions and stats
    fetchCategories();
    fetchSuggestions();
    fetchStats();
});

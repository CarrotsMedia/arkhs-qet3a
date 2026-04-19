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
    let currentProducts = [];

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
                merged_name: p.name,
                image_url: fixImageUrl(p.image_url),
                offers: [{ price_egp: p.price_egp, store_name: 'Database', store_slug: 'db', url: '#' }]
            }));
            
            renderProducts(formatted, true);
        } catch (error) {
            console.error('Error fetching suggestions:', error);
        }
    };

    // ───── STEP 1: Live Search → Product Cards ─────
    const fetchLiveSearch = async (query) => {
        if (!query.trim()) return;
        
        productsGrid.innerHTML = '';
        resultText.textContent = `Searching live for "${query}"…`;
        loader.style.display = 'block';
        searchBtn.disabled = true;
        searchBtn.textContent = '⏳ Searching…';

        try {
            const response = await fetch(`/api/search-live?q=${encodeURIComponent(query)}`);
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

            currentProducts = data.products;
            resultText.textContent = `Found ${data.count} grouped products for "${query}"`;
            renderProducts(data.products, false);
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
        `;

        document.getElementById('showMerchantsBtn').addEventListener('click', () => {
            showMerchants(productIndex);
        });

        openModal();
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

    // ───── Event Listeners ─────
    searchBtn.addEventListener('click', () => fetchLiveSearch(searchInput.value));
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') fetchLiveSearch(searchInput.value);
    });

    // Start with suggestions
    fetchSuggestions();
});

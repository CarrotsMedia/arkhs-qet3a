/**
 * Discovery Service
 * =================
 * Provides homepage intelligence: price-drop detection, deals-of-the-day,
 * activity-based trending, and featured curation.
 *
 * All heavy analytics are pre-computed via refreshDiscoveryCache() which runs
 * on server startup and every 6 hours via cron.
 */

class DiscoveryService {
    constructor(db) {
        this.db = db;
    }

    /**
     * Shared base SQL that returns formatted product family rows
     * (mirrors ProductService.baseProductSQL)
     */
    get baseProductSQL() {
        return `
            SELECT 
                pf.id as product_id,
                COALESCE(pf.name_en, pf.name_ar) as name,
                pf.name_en as name_en,
                pf.name_ar as name_ar,
                pf.image_url as image_url,
                pf.description_en as description_en,
                pf.description_ar as description_ar,
                b.name as brand,
                c.slug as category_slug,
                sc.slug as subcategory_slug,
                so.price_egp,
                so.original_price_egp,
                so.discount_pct,
                so.availability,
                so.product_url,
                s.name as store_name,
                s.slug as store_slug
            FROM product_families pf
            JOIN product_variants pv ON pv.family_id = pf.id
            JOIN store_offers so ON so.variant_id = pv.id AND so.is_active = 1
            JOIN stores s ON so.store_id = s.id AND s.is_enabled = 1
            LEFT JOIN brands b ON pf.brand_id = b.id
            LEFT JOIN subcategories sc ON pf.subcategory_id = sc.id
            LEFT JOIN categories c ON sc.category_id = c.id
        `;
    }

    /**
     * Format raw DB rows into grouped family objects with offers
     * (same logic as ProductService.formatProducts)
     */
    async formatProducts(rows) {
        const grouped = new Map();
        for (const r of rows) {
            if (!grouped.has(r.product_id)) {
                grouped.set(r.product_id, {
                    product_id: r.product_id,
                    merged_name: r.name,
                    image_url: r.image_url,
                    brand: r.brand || null,
                    name_ar: r.name_ar || null,
                    name_en: r.name_en || null,
                    description_ar: r.description_ar || null,
                    description_en: r.description_en || null,
                    category_slug: r.category_slug || null,
                    subcategory_slug: r.subcategory_slug || null,
                    has_stock: false,
                    offers: []
                });
            }
            const group = grouped.get(r.product_id);

            if (r.price_egp) {
                let finalUrl = r.product_url || '#';
                if (r.store_slug === 'amazon' && finalUrl !== '#') {
                    const tag = 'dwrlycrts-21';
                    if (finalUrl.includes('?')) {
                        if (!finalUrl.match(/[?&]tag=/)) {
                            finalUrl += `&tag=${tag}`;
                        } else {
                            finalUrl = finalUrl.replace(/([?&])tag=[^&]+/, `$1tag=${tag}`);
                        }
                    } else {
                        finalUrl += `?tag=${tag}`;
                    }
                }

                const existingOffer = group.offers.find(o => o.store_slug === r.store_slug);
                if (!existingOffer) {
                    group.offers.push({
                        store_slug: r.store_slug || 'unknown',
                        store_name: r.store_name || 'Unknown Store',
                        price_egp: r.price_egp,
                        original_price_egp: r.original_price_egp || null,
                        discount_pct: r.discount_pct || null,
                        url: finalUrl,
                        availability: r.availability || 'unknown'
                    });
                } else if (r.price_egp < existingOffer.price_egp) {
                    existingOffer.price_egp = r.price_egp;
                    existingOffer.original_price_egp = r.original_price_egp || null;
                    existingOffer.discount_pct = r.discount_pct || null;
                    existingOffer.url = finalUrl;
                    existingOffer.availability = r.availability || 'unknown';
                }

                if (r.availability === 'in_stock') {
                    group.has_stock = true;
                }
            }
        }

        const results = Array.from(grouped.values());
        results.forEach(g => {
            g.offers.sort((a, b) => {
                if (a.availability === 'in_stock' && b.availability !== 'in_stock') return -1;
                if (a.availability !== 'in_stock' && b.availability === 'in_stock') return 1;
                return a.price_egp - b.price_egp;
            });
        });

        return results;
    }

    // ═══════════════════════════════════════════════════
    // 1. PRICE DROPS — 30-day average comparison
    // ═══════════════════════════════════════════════════

    /**
     * Finds products whose current cheapest in-stock offer is significantly
     * below their 30-day average price from price_history.
     *
     * @param {number} limit - Max products to return
     * @param {number} daysWindow - Lookback window in days (default 30)
     * @param {number} dropThresholdPct - Min % drop to qualify (default 15)
     */
    async getPriceDrops(limit = 12, daysWindow = 30, dropThresholdPct = 15) {
        try {
            // Step 1: Get current cheapest in-stock price per family
            // Step 2: Get 30-day average price per family from price_history
            // Step 3: Compare and filter for significant drops
            const rows = await this.db.prepare(`
                WITH current_prices AS (
                    SELECT 
                        pv.family_id,
                        MIN(so.price_egp) as current_price,
                        COUNT(DISTINCT so.store_id) as store_count
                    FROM store_offers so
                    JOIN product_variants pv ON so.variant_id = pv.id
                    WHERE so.is_active = 1
                      AND so.availability = 'in_stock'
                      AND so.price_egp > 500
                    GROUP BY pv.family_id
                ),
                avg_prices AS (
                    SELECT 
                        pv.family_id,
                        AVG(ph.price_egp) as avg_price,
                        MIN(ph.price_egp) as lowest_ever
                    FROM price_history ph
                    JOIN product_variants pv ON ph.variant_id = pv.id
                    WHERE ph.variant_id IS NOT NULL
                      AND ph.recorded_at >= datetime('now', '-' || ? || ' days')
                      AND ph.price_egp > 500
                    GROUP BY pv.family_id
                    HAVING COUNT(*) >= 3
                )
                SELECT 
                    cp.family_id,
                    cp.current_price,
                    cp.store_count,
                    ap.avg_price,
                    ap.lowest_ever,
                    ROUND(((ap.avg_price - cp.current_price) / ap.avg_price) * 100, 1) as drop_pct
                FROM current_prices cp
                JOIN avg_prices ap ON cp.family_id = ap.family_id
                WHERE ap.avg_price > 0
                  AND ((ap.avg_price - cp.current_price) / ap.avg_price) * 100 >= ?
                  AND ((ap.avg_price - cp.current_price) / ap.avg_price) * 100 <= 85
                  AND cp.current_price > 500
                  AND ap.avg_price < cp.current_price * 5
                ORDER BY drop_pct DESC
                LIMIT ?
            `).all(daysWindow, dropThresholdPct, limit);

            if (!rows || rows.length === 0) return [];

            // Fetch full product data for these families
            const familyIds = rows.map(r => r.family_id);
            const placeholders = familyIds.map(() => '?').join(',');
            const detailRows = await this.db.prepare(`
                ${this.baseProductSQL}
                WHERE pf.id IN (${placeholders})
            `).all(...familyIds);

            const products = await this.formatProducts(detailRows);

            // Annotate products with drop metadata
            const dropMap = {};
            rows.forEach(r => {
                dropMap[r.family_id] = {
                    drop_pct: r.drop_pct,
                    current_price: r.current_price,
                    avg_30d_price: Math.round(r.avg_price),
                    lowest_ever: r.lowest_ever,
                    store_count: r.store_count
                };
            });

            products.forEach(p => {
                const info = dropMap[p.product_id];
                if (info) {
                    p.drop_pct = info.drop_pct;
                    p.current_price = info.current_price;
                    p.avg_30d_price = info.avg_30d_price;
                    p.lowest_ever = info.lowest_ever;
                }
            });

            // Sort by drop percentage descending
            products.sort((a, b) => (b.drop_pct || 0) - (a.drop_pct || 0));

            return products.slice(0, limit);
        } catch (e) {
            console.error('getPriceDrops error:', e);
            return [];
        }
    }

    // ═══════════════════════════════════════════════════
    // 2. DEALS OF THE DAY — sanitized discounts
    // ═══════════════════════════════════════════════════

    /**
     * Returns products with legitimate discount percentages.
     * Filters out garbage data (100% discount, 1 EGP prices, etc.)
     */
    async getDealsOfTheDay(limit = 12) {
        try {
            const rows = await this.db.prepare(`
                SELECT 
                    pv.family_id,
                    MIN(so.price_egp) as best_price,
                    MAX(so.original_price_egp) as original_price,
                    ROUND(((MAX(so.original_price_egp) - MIN(so.price_egp)) / MAX(so.original_price_egp)) * 100, 1) as real_discount_pct,
                    (MAX(so.original_price_egp) - MIN(so.price_egp)) as savings_egp,
                    COUNT(DISTINCT so.store_id) as store_count
                FROM store_offers so
                JOIN product_variants pv ON so.variant_id = pv.id
                WHERE so.is_active = 1
                  AND so.availability = 'in_stock'
                  AND so.price_egp > 100
                  AND so.original_price_egp > 500
                  AND so.original_price_egp > so.price_egp
                  AND so.discount_pct BETWEEN 5 AND 80
                GROUP BY pv.family_id
                HAVING ROUND(((MAX(so.original_price_egp) - MIN(so.price_egp)) / MAX(so.original_price_egp)) * 100, 1) BETWEEN 5 AND 80
                ORDER BY savings_egp DESC
                LIMIT ?
            `).all(limit);

            if (!rows || rows.length === 0) return [];

            const familyIds = rows.map(r => r.family_id);
            const placeholders = familyIds.map(() => '?').join(',');
            const detailRows = await this.db.prepare(`
                ${this.baseProductSQL}
                WHERE pf.id IN (${placeholders})
            `).all(...familyIds);

            const products = await this.formatProducts(detailRows);

            // Annotate with deal metadata
            const dealMap = {};
            rows.forEach(r => {
                dealMap[r.family_id] = {
                    deal_discount_pct: r.real_discount_pct,
                    deal_savings_egp: r.savings_egp,
                    deal_original_price: r.original_price,
                    deal_best_price: r.best_price
                };
            });

            products.forEach(p => {
                const info = dealMap[p.product_id];
                if (info) {
                    p.deal_discount_pct = info.deal_discount_pct;
                    p.deal_savings_egp = info.deal_savings_egp;
                    p.deal_original_price = info.deal_original_price;
                    p.deal_best_price = info.deal_best_price;
                }
            });

            // Sort by absolute savings
            products.sort((a, b) => (b.deal_savings_egp || 0) - (a.deal_savings_egp || 0));

            return products.slice(0, limit);
        } catch (e) {
            console.error('getDealsOfTheDay error:', e);
            return [];
        }
    }

    // ═══════════════════════════════════════════════════
    // 3. TRENDING — price-activity based ranking
    // ═══════════════════════════════════════════════════

    /**
     * Ranks products by how many price-change events they've had in the
     * last N days. Products being actively tracked across multiple stores
     * with frequent price movements are "trending".
     */
    async getTrendingByActivity(limit = 12, daysWindow = 7) {
        try {
            const rows = await this.db.prepare(`
                SELECT 
                    pv.family_id,
                    COUNT(DISTINCT ph.id) as price_events,
                    COUNT(DISTINCT ph.store_id) as active_stores,
                    COUNT(DISTINCT DATE(ph.recorded_at)) as active_days,
                    (COUNT(DISTINCT ph.id) * COUNT(DISTINCT ph.store_id)) as activity_score
                FROM price_history ph
                JOIN product_variants pv ON ph.variant_id = pv.id
                WHERE ph.variant_id IS NOT NULL
                  AND ph.recorded_at >= datetime('now', '-' || ? || ' days')
                  AND ph.price_egp > 100
                GROUP BY pv.family_id
                HAVING COUNT(DISTINCT ph.id) >= 3
                ORDER BY activity_score DESC
                LIMIT ?
            `).all(daysWindow, limit);

            if (!rows || rows.length === 0) {
                // Fallback: use product_id from price_history directly (older records may lack variant_id)
                return await this._getTrendingFallback(limit);
            }

            const familyIds = rows.map(r => r.family_id);
            const placeholders = familyIds.map(() => '?').join(',');
            const detailRows = await this.db.prepare(`
                ${this.baseProductSQL}
                WHERE pf.id IN (${placeholders})
            `).all(...familyIds);

            const products = await this.formatProducts(detailRows);

            // Annotate with trending metadata
            const trendMap = {};
            rows.forEach(r => {
                trendMap[r.family_id] = {
                    activity_score: r.activity_score,
                    price_events: r.price_events,
                    active_stores: r.active_stores,
                    active_days: r.active_days
                };
            });

            products.forEach(p => {
                const info = trendMap[p.product_id];
                if (info) {
                    p.activity_score = info.activity_score;
                    p.price_events = info.price_events;
                    p.active_stores = info.active_stores;
                }
            });

            products.sort((a, b) => (b.activity_score || 0) - (a.activity_score || 0));

            return products.slice(0, limit);
        } catch (e) {
            console.error('getTrendingByActivity error:', e);
            return await this._getTrendingFallback(limit);
        }
    }

    /**
     * Fallback trending: use product_id from price_history for records
     * that may not have variant_id set.
     */
    async _getTrendingFallback(limit = 12) {
        try {
            // Fall back to newest products with active offers
            const rows = await this.db.prepare(`
                ${this.baseProductSQL}
                WHERE pf.image_url IS NOT NULL
                  AND so.price_egp IS NOT NULL
                  AND so.price_egp > 100
                  AND so.availability = 'in_stock'
                ORDER BY pf.updated_at DESC
                LIMIT ?
            `).all(limit * 3);

            return await this.formatProducts(rows).slice(0, limit);
        } catch (e) {
            console.error('_getTrendingFallback error:', e);
            return [];
        }
    }

    // ═══════════════════════════════════════════════════
    // 4. FEATURED / EDITOR'S PICKS — curated multi-store
    // ═══════════════════════════════════════════════════

    /**
     * Curated featured products: items available in ≥2 stores, in stock, 
     * with images. Sorted by store coverage (most stores = most interesting
     * for comparison).
     */
    async getFeaturedCurated(limit = 12) {
        try {
            const rows = await this.db.prepare(`
                SELECT 
                    pv.family_id,
                    COUNT(DISTINCT so.store_id) as store_count,
                    MIN(so.price_egp) as min_price
                FROM store_offers so
                JOIN product_variants pv ON so.variant_id = pv.id
                JOIN product_families pf ON pv.family_id = pf.id
                WHERE so.is_active = 1
                  AND so.availability = 'in_stock'
                  AND so.price_egp > 100
                  AND pf.image_url IS NOT NULL
                GROUP BY pv.family_id
                HAVING COUNT(DISTINCT so.store_id) >= 2
                ORDER BY store_count DESC, min_price ASC
                LIMIT ?
            `).all(limit);

            if (!rows || rows.length === 0) return [];

            const familyIds = rows.map(r => r.family_id);
            const placeholders = familyIds.map(() => '?').join(',');
            const detailRows = await this.db.prepare(`
                ${this.baseProductSQL}
                WHERE pf.id IN (${placeholders})
            `).all(...familyIds);

            const products = await this.formatProducts(detailRows);

            // Preserve the store_count order
            const orderMap = {};
            rows.forEach((r, i) => { orderMap[r.family_id] = i; });
            products.sort((a, b) => (orderMap[a.product_id] ?? 999) - (orderMap[b.product_id] ?? 999));

            return products.slice(0, limit);
        } catch (e) {
            console.error('getFeaturedCurated error:', e);
            return [];
        }
    }

    // ═══════════════════════════════════════════════════
    // 5. CACHE REFRESH — precompute discovery metrics
    // ═══════════════════════════════════════════════════

    /**
     * Pre-computes trending and featured flags on product_families.
     * Called on startup and every 6 hours via cron.
     */
    async refreshDiscoveryCache() {
        try {
            console.log('🔄 Refreshing discovery cache...');
            const startTime = Date.now();

            // Reset all flags
            await this.db.prepare(`UPDATE product_families SET is_trending = 0, is_featured = 0, view_count = 0`).run();

            // Mark trending (top 50 by activity score)
            const trendingRows = await this.db.prepare(`
                SELECT pv.family_id, 
                       (COUNT(DISTINCT ph.id) * COUNT(DISTINCT ph.store_id)) as score
                FROM price_history ph
                JOIN product_variants pv ON ph.variant_id = pv.id
                WHERE ph.variant_id IS NOT NULL
                  AND ph.recorded_at >= datetime('now', '-7 days')
                  AND ph.price_egp > 100
                GROUP BY pv.family_id
                HAVING COUNT(DISTINCT ph.id) >= 3
                ORDER BY score DESC
                LIMIT 50
            `).all();

            if (trendingRows.length > 0) {
                const updateTrending = await this.db.prepare(`UPDATE product_families SET is_trending = 1, view_count = ? WHERE id = ?`);
                const trendingTx = this.db.transaction(async (rows) => {
                    for (const row of rows) {
                        await updateTrending.run(row.score, row.family_id);
                    }
                });
                await trendingTx(trendingRows);
            }

            // Mark featured (top 50 by store coverage)
            const featuredRows = await this.db.prepare(`
                SELECT pv.family_id, COUNT(DISTINCT so.store_id) as store_count
                FROM store_offers so
                JOIN product_variants pv ON so.variant_id = pv.id
                JOIN product_families pf ON pv.family_id = pf.id
                WHERE so.is_active = 1
                  AND so.availability = 'in_stock'
                  AND so.price_egp > 100
                  AND pf.image_url IS NOT NULL
                GROUP BY pv.family_id
                HAVING COUNT(DISTINCT so.store_id) >= 2
                ORDER BY store_count DESC
                LIMIT 50
            `).all();

            if (featuredRows.length > 0) {
                const updateFeatured = this.db.prepare(`UPDATE product_families SET is_featured = 1 WHERE id = ?`);
                const featuredTx = this.db.transaction(async (rows) => {
                    for (const row of rows) {
                        await updateFeatured.run(row.family_id);
                    }
                });
                await featuredTx(featuredRows);
            }

            const elapsed = Date.now() - startTime;
            console.log(`✅ Discovery cache refreshed in ${elapsed}ms — ${trendingRows.length} trending, ${featuredRows.length} featured`);

            return {
                trending: trendingRows.length,
                featured: featuredRows.length,
                elapsed_ms: elapsed
            };
        } catch (e) {
            console.error('❌ Discovery cache refresh failed:', e);
            return { error: e.message };
        }
    }
}

module.exports = DiscoveryService;

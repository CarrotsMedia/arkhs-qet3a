/**
 * Product Service (Refactored)
 * ============================
 * Handles product queries: FTS5 search, browse, featured, trending, recently added.
 * Fully optimized to query the normalized Family -> Variant -> Offer schema.
 */

class ProductService {
    constructor(db) {
        this.db = db;
    }

    /**
     * Format raw DB rows into grouped family objects with offers
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
                    ranking_score: r.ranking_score || 0,
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

                // Add to offers if not already present from another variant (keep cheapest)
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
                    // Update to cheaper offer
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

        // Sort offers: in-stock first, then cheapest
        results.forEach(g => {
            g.offers.sort((a, b) => {
                if (a.availability === 'in_stock' && b.availability !== 'in_stock') return -1;
                if (a.availability !== 'in_stock' && b.availability === 'in_stock') return 1;
                return a.price_egp - b.price_egp;
            });
        });

        // Sort products: in-stock first, then cheapest
        results.sort((a, b) => {
            if (a.has_stock && !b.has_stock) return -1;
            if (!a.has_stock && b.has_stock) return 1;
            const priceA = a.offers[0] ? a.offers[0].price_egp : 9999999;
            const priceB = b.offers[0] ? b.offers[0].price_egp : 9999999;
            return priceA - priceB;
        });

        return results;
    }

    /**
     * Paginate an array of products
     */
    async paginate(products, page = 1, limit = 52) {
        const totalItems = products.length;
        const totalPages = Math.ceil(totalItems / limit);
        const offset = (page - 1) * limit;
        const paginatedProducts = products.slice(offset, offset + limit);

        return {
            products: paginatedProducts,
            count: totalItems,
            page,
            totalPages
        };
    }

    /**
     * Base SQL for product families with joins to variants and active offers
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
                pf.ranking_score as ranking_score,
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
     * Helper to build dynamic filter SQL queries on product_families and variants.
     * Supports both standard filters and dynamic specifications filters.
     */
    async buildFilteredProductSQL(baseConditions, baseParams, filters) {
        // Find all filterable attributes to distinguish dynamic filters
        const attrDefs = await this.db.prepare(`SELECT slug, id FROM attribute_definitions WHERE is_filterable = 1`).all();
        const attrMap = new Map(attrDefs.map(a => [a.slug, a.id]));

        let sqlJoins = '';
        const joinParams = [];
        const conditions = [...baseConditions];
        const params = [];

        // Dynamic attribute joins and filters
        let joinCounter = 0;
        for (const [key, val] of Object.entries(filters)) {
            if (attrMap.has(key) && val) {
                const attrId = attrMap.get(key);
                const values = Array.isArray(val)
                    ? val.map(String)
                    : String(val).split(',').map(s => s.trim()).filter(s => s.length > 0);

                if (values.length > 0) {
                    joinCounter++;
                    sqlJoins += ` JOIN variant_attributes va${joinCounter} ON va${joinCounter}.variant_id = pv.id AND va${joinCounter}.attribute_id = ?`;
                    joinParams.push(attrId);

                    const placeholders = values.map(() => '?').join(',');
                    conditions.push(`va${joinCounter}.value IN (${placeholders})`);
                    params.push(...values);
                }
            }
        }

        // Standard brand filters
        if (filters.brand) {
            const brands = Array.isArray(filters.brand)
                ? filters.brand
                : String(filters.brand).split(',').map(b => b.trim());
            const placeholders = brands.map(() => '?').join(',');
            
            const brandRows = await this.db.prepare(`
                SELECT id FROM brands 
                WHERE LOWER(name_en) IN (${placeholders}) 
                   OR LOWER(name_ar) IN (${placeholders})
            `).all(...brands.map(b => b.toLowerCase()), ...brands.map(b => b.toLowerCase()));

            if (brandRows.length > 0) {
                const brandIds = brandRows.map(r => r.id);
                const idPlaceholders = brandIds.map(() => '?').join(',');
                conditions.push(`pf.brand_id IN (${idPlaceholders})`);
                params.push(...brandIds);
            } else {
                conditions.push(`pf.brand_id = -1`); // Force empty result
            }
        }

        if (filters.min_price) {
            conditions.push(`so.price_egp >= ?`);
            params.push(filters.min_price);
        }
        if (filters.max_price) {
            conditions.push(`so.price_egp <= ?`);
            params.push(filters.max_price);
        }
        if (filters.in_stock) {
            conditions.push(`so.availability = 'in_stock'`);
        }

        const sql = this.baseProductSQL + sqlJoins + ' WHERE ' + conditions.join(' AND ') + ` ORDER BY pf.id LIMIT 3000`;
        const finalParams = [...joinParams, ...baseParams, ...params];

        return { sql, params: finalParams };
    }

    /**
     * Search products by query terms using SQLite FTS5 index
     */
    async search(query, page = 1, limit = 52, sort = 'smart_rank', filters = {}) {
        const terms = query.trim().split(/\s+/).filter(t => t.length > 0);
        if (terms.length === 0) return { count: 0, products: [], page: 1, totalPages: 0 };

        // Prefix match for terms
        const ftsQuery = terms.map(term => {
            const escaped = term.replace(/"/g, '""');
            return `"${escaped}"*`;
        }).join(' AND ');

        // Find matching family IDs first
        const matchingFamilies = await this.db.prepare(`
            SELECT family_id 
            FROM product_search_idx 
            WHERE product_search_idx MATCH ?
            LIMIT 1000
        `).all(ftsQuery);

        if (matchingFamilies.length === 0) {
            return { count: 0, products: [], page: 1, totalPages: 0 };
        }

        const familyIds = matchingFamilies.map(f => f.family_id);
        const placeholders = familyIds.map(() => '?').join(',');

        const baseConditions = [`pf.id IN (${placeholders})`];
        const baseParams = [...familyIds];

        const { sql, params } = await this.buildFilteredProductSQL(baseConditions, baseParams, filters);

        const rows = await this.db.prepare(sql).all(...params);
        let unified = await this.formatProducts(rows);
        unified = unified.filter(p => p.offers && p.offers.length > 0);

        // Apply sorting
        unified = await this.sortProducts(unified, sort);

        return await this.paginate(unified, page, limit);
    }

    /**
     * Browse products by category
     */
    async browseByCategory(categoryId, page = 1, limit = 52, sort = 'smart_rank', filters = {}) {
        const baseConditions = ['sc.category_id = ?'];
        const baseParams = [categoryId];

        if (filters.subcategory_id) {
            baseConditions.push('pf.subcategory_id = ?');
            baseParams.push(filters.subcategory_id);
        }

        const { sql, params } = await this.buildFilteredProductSQL(baseConditions, baseParams, filters);

        const rows = await this.db.prepare(sql).all(...params);
        let unified = await this.formatProducts(rows);
        unified = unified.filter(p => p.offers && p.offers.length > 0);

        // Apply sorting
        unified = await this.sortProducts(unified, sort);

        return await this.paginate(unified, page, limit);
    }

    /**
     * Browse products by subcategory
     */
    async browseBySubcategory(subcategoryId, page = 1, limit = 52, sort = 'smart_rank', filters = {}) {
        const baseConditions = ['pf.subcategory_id = ?'];
        const baseParams = [subcategoryId];

        const { sql, params } = await this.buildFilteredProductSQL(baseConditions, baseParams, filters);

        const rows = await this.db.prepare(sql).all(...params);
        let unified = await this.formatProducts(rows);
        unified = unified.filter(p => p.offers && p.offers.length > 0);

        // Apply sorting
        unified = await this.sortProducts(unified, sort);

        return await this.paginate(unified, page, limit);
    }

    /**
     * Sort products by given criteria
     */
    async sortProducts(products, sort) {
        switch (sort) {
            case 'smart_rank':
                return products.sort((a, b) => {
                    // Sort in-stock products first, then by smart_rank descending
                    if (a.has_stock && !b.has_stock) return -1;
                    if (!a.has_stock && b.has_stock) return 1;
                    return (b.ranking_score || 0) - (a.ranking_score || 0);
                });
            case 'price_asc':
                return products.sort((a, b) => {
                    const pa = a.offers[0]?.price_egp || 9999999;
                    const pb = b.offers[0]?.price_egp || 9999999;
                    return pa - pb;
                });
            case 'price_desc':
                return products.sort((a, b) => {
                    const pa = a.offers[0]?.price_egp || 0;
                    const pb = b.offers[0]?.price_egp || 0;
                    return pb - pa;
                });
            case 'name_asc':
                return products.sort((a, b) => a.merged_name.localeCompare(b.merged_name));
            case 'name_desc':
                return products.sort((a, b) => b.merged_name.localeCompare(a.merged_name));
            case 'newest':
                return products.sort((a, b) => b.product_id - a.product_id);
            default:
                // default to smart_rank if unrecognized
                return products.sort((a, b) => {
                    if (a.has_stock && !b.has_stock) return -1;
                    if (!a.has_stock && b.has_stock) return 1;
                    return (b.ranking_score || 0) - (a.ranking_score || 0);
                });
        }
    }

    /**
     * Get random suggestions for homepage
     */
    async getSuggestions(limit = 8) {
        const rows = await this.db.prepare(`
            ${this.baseProductSQL}
            WHERE pf.image_url IS NOT NULL
              AND so.price_egp IS NOT NULL
              AND pf.id IN (
                  SELECT id FROM product_families ORDER BY RANDOM() LIMIT ?
              )
        `).all(limit * 3);

        return (await this.formatProducts(rows)).slice(0, limit);
    }

    /**
     * Get featured products (marked as featured in DB)
     */
    async getFeaturedProducts(limit = 12) {
        const rows = await this.db.prepare(`
            ${this.baseProductSQL}
            WHERE pf.image_url IS NOT NULL
              AND so.price_egp IS NOT NULL
              AND so.availability = 'in_stock'
              AND pf.is_featured = 1
            ORDER BY pf.updated_at DESC
            LIMIT ?
        `).all(limit * 3);

        let products = await this.formatProducts(rows);
        if (products.length < limit) {
            const fill = await this.db.prepare(`
                ${this.baseProductSQL}
                WHERE pf.image_url IS NOT NULL
                  AND so.price_egp IS NOT NULL
                  AND so.availability = 'in_stock'
                  AND pf.id IN (SELECT id FROM product_families ORDER BY RANDOM() LIMIT ?)
            `).all(limit * 3);
            const extra = await this.formatProducts(fill);
            const existingIds = new Set(products.map(p => p.product_id));
            for (const p of extra) {
                if (!existingIds.has(p.product_id)) {
                    products.push(p);
                    if (products.length >= limit) break;
                }
            }
        }
        return products.slice(0, limit);
    }

    /**
     * Get trending products (most price changes recently)
     */
    async getTrendingProducts(limit = 8) {
        const rows = await this.db.prepare(`
            ${this.baseProductSQL}
            WHERE pf.image_url IS NOT NULL
              AND so.price_egp IS NOT NULL
              AND so.availability = 'in_stock'
              AND pf.is_trending = 1
            ORDER BY pf.updated_at DESC
            LIMIT ?
        `).all(limit * 3);

        let products = await this.formatProducts(rows);
        if (products.length < limit) {
            const fill = await this.db.prepare(`
                ${this.baseProductSQL}
                WHERE pf.image_url IS NOT NULL
                  AND so.price_egp IS NOT NULL
                  AND so.availability = 'in_stock'
                ORDER BY pf.updated_at DESC
                LIMIT ?
            `).all(limit * 3);
            const extra = await this.formatProducts(fill);
            const existingIds = new Set(products.map(p => p.product_id));
            for (const p of extra) {
                if (!existingIds.has(p.product_id)) {
                    products.push(p);
                    if (products.length >= limit) break;
                }
            }
        }
        return products.slice(0, limit);
    }

    /**
     * Get best deals (highest discount percentage)
     */
    async getBestDeals(limit = 8) {
        const rows = await this.db.prepare(`
            ${this.baseProductSQL}
            WHERE pf.image_url IS NOT NULL
              AND so.price_egp IS NOT NULL
              AND so.availability = 'in_stock'
              AND so.discount_pct IS NOT NULL
              AND so.discount_pct > 5
            ORDER BY so.discount_pct DESC
            LIMIT ?
        `).all(limit * 3);

        return (await this.formatProducts(rows)).slice(0, limit);
    }

    /**
     * Get recently added products
     */
    async getRecentlyAdded(limit = 8) {
        const rows = await this.db.prepare(`
            ${this.baseProductSQL}
            WHERE pf.image_url IS NOT NULL
              AND so.price_egp IS NOT NULL
            ORDER BY pf.created_at DESC
            LIMIT ?
        `).all(limit * 3);

        return (await this.formatProducts(rows)).slice(0, limit);
    }

    /**
     * Get available brands for a category
     */
    async getBrandsForCategory(categoryId) {
        return await this.db.prepare(`
            SELECT DISTINCT b.name as brand, COUNT(DISTINCT pf.id) as count
            FROM product_families pf
            JOIN brands b ON pf.brand_id = b.id
            JOIN subcategories sc ON pf.subcategory_id = sc.id
            WHERE sc.category_id = ? AND b.name IS NOT NULL AND b.name != ''
            GROUP BY LOWER(b.name)
            ORDER BY count DESC
            LIMIT 50
        `).all(categoryId);
    }

    /**
     * Get price range for a category
     */
    async getPriceRange(categoryId) {
        return await this.db.prepare(`
            SELECT MIN(so.price_egp) as min_price, MAX(so.price_egp) as max_price
            FROM store_offers so
            JOIN product_variants pv ON so.variant_id = pv.id
            JOIN product_families pf ON pv.family_id = pf.id
            JOIN subcategories sc ON pf.subcategory_id = sc.id
            WHERE sc.category_id = ? AND so.price_egp > 0 AND so.is_active = 1
        `).get(categoryId);
    }

    /**
     * Get active store offers for a specific variant
     */
    async getVariantOffers(variantId) {
        const offers = await this.db.prepare(`
            SELECT 
                so.id as offer_id,
                so.variant_id,
                so.price_egp,
                so.original_price_egp,
                so.discount_pct,
                so.availability,
                so.product_url,
                s.name as store_name,
                s.slug as store_slug
            FROM store_offers so
            JOIN stores s ON so.store_id = s.id
            WHERE so.variant_id = ? AND so.is_active = 1
        `).all(variantId);

        return offers.map(o => {
            let finalUrl = o.product_url || '#';
            if (o.store_slug === 'amazon' && finalUrl !== '#') {
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
            return {
                store_slug: o.store_slug,
                store_name: o.store_name,
                price_egp: o.price_egp,
                original_price_egp: o.original_price_egp,
                discount_pct: o.discount_pct,
                url: finalUrl,
                availability: o.availability
            };
        }).sort((a, b) => {
            if (a.availability === 'in_stock' && b.availability !== 'in_stock') return -1;
            if (a.availability !== 'in_stock' && b.availability === 'in_stock') return 1;
            return a.price_egp - b.price_egp;
        });
    }

    /**
     * Get price history for a specific variant
     */
    async getVariantPriceHistory(variantId) {
        const rows = await this.db.prepare(`
            SELECT ph.price_egp, ph.recorded_at, s.name as store_name
            FROM price_history ph
            JOIN stores s ON ph.store_id = s.id
            WHERE ph.variant_id = ?
            ORDER BY ph.recorded_at ASC
        `).all(variantId);

        const historyByStore = {};
        for (const row of rows) {
            if (!historyByStore[row.store_name]) {
                historyByStore[row.store_name] = [];
            }
            historyByStore[row.store_name].push({
                price: row.price_egp,
                date: row.recorded_at
            });
        }
        return historyByStore;
    }

    /**
     * Get a single product family detail, including its variant matrix and store offers
     */
    async getProductDetail(productId) {
        // Fetch family details
        const family = await this.db.prepare(`
            SELECT 
                pf.id as product_id,
                pf.name_en as name_en,
                pf.name_ar as name_ar,
                COALESCE(pf.name_en, pf.name_ar) as name,
                COALESCE(pf.name_en, pf.name_ar) as merged_name,
                pf.image_url as image_url,
                pf.description_en as description_en,
                pf.description_ar as description_ar,
                b.name as brand
            FROM product_families pf
            LEFT JOIN brands b ON pf.brand_id = b.id
            WHERE pf.id = ?
        `).get(productId);

        if (!family) return null;

        // Fetch variants under this family
        const variants = await this.db.prepare(`
            SELECT 
                pv.id as variant_id,
                pv.storage_gb,
                pv.ram_gb,
                pv.network_gen,
                pv.color_en,
                pv.color_ar,
                pv.sku
            FROM product_variants pv
            WHERE pv.family_id = ?
        `).all(productId);

        // Fetch all offers for these variants
        const offers = await this.db.prepare(`
            SELECT 
                so.variant_id,
                so.price_egp,
                so.original_price_egp,
                so.discount_pct,
                so.availability,
                so.product_url,
                s.name as store_name,
                s.slug as store_slug,
                s.logo_url as store_logo
            FROM store_offers so
            JOIN stores s ON so.store_id = s.id
            WHERE so.variant_id IN (SELECT id FROM product_variants WHERE family_id = ?)
              AND so.is_active = 1
        `).all(productId);

        // Format offers with affiliate tag if needed
        const formattedOffers = offers.map(o => {
            let finalUrl = o.product_url || '#';
            if (o.store_slug === 'amazon' && finalUrl !== '#') {
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
            return {
                variant_id: o.variant_id,
                store_slug: o.store_slug,
                store_name: o.store_name,
                store_logo: o.store_logo,
                price_egp: o.price_egp,
                original_price_egp: o.original_price_egp,
                discount_pct: o.discount_pct,
                url: finalUrl,
                availability: o.availability
            };
        });

        // Group offers by variant_id
        const offersByVariant = {};
        formattedOffers.forEach(o => {
            if (!offersByVariant[o.variant_id]) {
                offersByVariant[o.variant_id] = [];
            }
            offersByVariant[o.variant_id].push(o);
        });

        // Attach offers to variants
        variants.forEach(v => {
            v.offers = offersByVariant[v.variant_id] || [];
            v.offers.sort((a, b) => {
                if (a.availability === 'in_stock' && b.availability !== 'in_stock') return -1;
                if (a.availability !== 'in_stock' && b.availability === 'in_stock') return 1;
                return a.price_egp - b.price_egp;
            });
        });

        // Add default/cheapest offers directly on the family object for backward compatibility
        let allOffers = [];
        variants.forEach(v => {
            allOffers = allOffers.concat(v.offers);
        });
        
        allOffers.sort((a, b) => {
            if (a.availability === 'in_stock' && b.availability !== 'in_stock') return -1;
            if (a.availability !== 'in_stock' && b.availability === 'in_stock') return 1;
            return a.price_egp - b.price_egp;
        });

        family.offers = allOffers;
        family.variants = variants;
        
        return family;
    }

    /**
     * Get products with the biggest price savings
     */
    async getTopSavings(limit = 8) {
        const rows = await this.db.prepare(`
            SELECT 
                pv.family_id as pid,
                MIN(so.price_egp) as min_price,
                MAX(so.price_egp) as max_price,
                (MAX(so.price_egp) - MIN(so.price_egp)) as savings,
                COUNT(DISTINCT so.store_id) as store_count
            FROM store_offers so
            JOIN product_variants pv ON so.variant_id = pv.id
            WHERE so.price_egp > 0
              AND so.availability = 'in_stock'
              AND so.is_active = 1
            GROUP BY pv.family_id
            HAVING COUNT(DISTINCT so.store_id) >= 2 AND (MAX(so.price_egp) - MIN(so.price_egp)) > 0
            ORDER BY savings DESC
            LIMIT ?
        `).all(limit);

        if (!rows || rows.length === 0) return [];

        const familyIds = rows.map(r => r.pid);
        const placeholders = familyIds.map(() => '?').join(',');
        const detailRows = await this.db.prepare(`
            ${this.baseProductSQL}
            WHERE pf.id IN (${placeholders})
        `).all(...familyIds);

        const products = await this.formatProducts(detailRows);

        const savingsMap = {};
        rows.forEach(r => { savingsMap[r.pid] = { savings: r.savings, min_price: r.min_price, max_price: r.max_price }; });
        products.forEach(p => {
            const info = savingsMap[p.product_id];
            if (info) {
                p.savings = info.savings;
                p.min_price = info.min_price;
                p.max_price = info.max_price;
            }
        });

        products.sort((a, b) => (b.savings || 0) - (a.savings || 0));

        return products.slice(0, limit);
    }

    /**
     * Get database stats
     */
    async getStats() {
        const prodCount = (await this.db.prepare(`SELECT COUNT(*) as c FROM product_families`).get()).c;
        const lastSync = (await this.db.prepare(`SELECT MAX(scraped_at) as m FROM store_offers`).get()).m;
        const catCount = (await this.db.prepare(`SELECT COUNT(*) as c FROM categories WHERE is_active = 1`).get()).c;
        const storeCount = (await this.db.prepare(`SELECT COUNT(*) as c FROM stores`).get()).c;

        return {
            totalProducts: prodCount,
            lastSync: lastSync,
            totalCategories: catCount,
            totalStores: storeCount
        };
    }

    /**
     * Get price history for a product family
     */
    async getPriceHistory(productId) {
        const rows = await this.db.prepare(`
            SELECT ph.price_egp, ph.recorded_at, s.name as store_name
            FROM price_history ph
            JOIN product_variants pv ON ph.variant_id = pv.id
            JOIN stores s ON ph.store_id = s.id
            WHERE pv.family_id = ?
            ORDER BY ph.recorded_at ASC
        `).all(productId);

        const historyByStore = {};
        for (const row of rows) {
            if (!historyByStore[row.store_name]) {
                historyByStore[row.store_name] = [];
            }
            historyByStore[row.store_name].push({
                price: row.price_egp,
                date: row.recorded_at
            });
        }
        return historyByStore;
    }

    /**
     * Get comparison matrix for multiple product family IDs
     */
    async getComparison(productIds) {
        if (!productIds || productIds.length === 0) {
            return { attributes: [], products: [] };
        }

        // 1. Fetch product families
        const placeholders = productIds.map(() => '?').join(',');
        const families = await this.db.prepare(`
            SELECT pf.id, pf.brand_id, pf.name_en, pf.name_ar, pf.image_url,
                   b.name as brand_name,
                   sc.name as subcategory_name
            FROM product_families pf
            LEFT JOIN brands b ON pf.brand_id = b.id
            LEFT JOIN subcategories sc ON pf.subcategory_id = sc.id
            WHERE pf.id IN (${placeholders})
        `).all(productIds);

        // 2. Fetch all variants for these families
        const variants = await this.db.prepare(`
            SELECT pv.id as variant_id, pv.family_id, pv.sku,
                   pv.storage_gb, pv.ram_gb, pv.network_gen, pv.color_en, pv.color_ar, pv.image_url
            FROM product_variants pv
            WHERE pv.family_id IN (${placeholders})
        `).all(productIds);

        // Get variant IDs
        const variantIds = variants.map(v => v.variant_id);
        if (variantIds.length === 0) {
            return { attributes: [], products: [] };
        }

        // 3. Fetch variant offer prices
        const varPlaceholders = variantIds.map(() => '?').join(',');
        const offers = await this.db.prepare(`
            SELECT so.variant_id, MIN(so.price_egp) as price, MIN(so.original_price_egp) as original_price,
                   COUNT(so.id) as offer_count,
                   SUM(CASE WHEN so.availability = 'in_stock' THEN 1 ELSE 0 END) as in_stock_count
            FROM store_offers so
            WHERE so.variant_id IN (${varPlaceholders}) AND so.is_active = 1
            GROUP BY so.variant_id
        `).all(variantIds);

        const offersMap = {};
        for (const o of offers) {
            offersMap[o.variant_id] = {
                price: o.price,
                original_price: o.original_price,
                offer_count: o.offer_count,
                in_stock: o.in_stock_count > 0
            };
        }

        // 4. Fetch variant attributes
        const attributes = await this.db.prepare(`
            SELECT va.variant_id, va.value, ad.slug as attr_slug, ad.name_en, ad.name_ar, ad.unit, ad.sort_order
            FROM variant_attributes va
            JOIN attribute_definitions ad ON va.attribute_id = ad.id
            WHERE va.variant_id IN (${varPlaceholders})
        `).all(variantIds);

        // Group attributes by variant_id and compile all unique attribute metadata
        const attrMeta = {};
        const varAttrs = {};
        for (const a of attributes) {
            if (!attrMeta[a.attr_slug]) {
                attrMeta[a.attr_slug] = {
                    slug: a.attr_slug,
                    name_en: a.name_en,
                    name_ar: a.name_ar,
                    unit: a.unit || '',
                    sort_order: a.sort_order || 0
                };
            }
            if (!varAttrs[a.variant_id]) {
                varAttrs[a.variant_id] = {};
            }
            varAttrs[a.variant_id][a.attr_slug] = a.value + (a.unit ? ' ' + a.unit : '');
        }

        // Format the products and compile variant options
        const productsList = families.map(f => {
            const familyVariants = variants.filter(v => v.family_id === f.id).map(v => {
                const offerInfo = offersMap[v.variant_id] || { price: null, original_price: null, offer_count: 0, in_stock: false };
                
                // Construct a user-friendly name if not present
                let displayName = v.variant_name;
                if (!displayName) {
                    const specs = [];
                    if (v.storage_gb) specs.push(`${v.storage_gb}GB`);
                    if (v.ram_gb) specs.push(`${v.ram_gb}GB RAM`);
                    if (v.network_gen && v.network_gen !== '4G') specs.push(v.network_gen);
                    if (v.color_en && v.color_en !== 'Standard') specs.push(v.color_en);
                    displayName = specs.length > 0 ? specs.join(' / ') : 'Standard Config';
                }

                return {
                    variant_id: v.variant_id,
                    name: displayName,
                    price: offerInfo.price,
                    original_price: offerInfo.original_price,
                    offer_count: offerInfo.offer_count,
                    in_stock: offerInfo.in_stock,
                    specs: varAttrs[v.variant_id] || {}
                };
            });

            // Calculate family overall price range
            const activePrices = familyVariants.map(v => v.price).filter(p => p !== null);
            const minPrice = activePrices.length > 0 ? Math.min(...activePrices) : null;
            const maxPrice = activePrices.length > 0 ? Math.max(...activePrices) : null;
            const totalOffers = familyVariants.reduce((sum, v) => sum + v.offer_count, 0);

            return {
                id: f.id,
                brand: f.brand_name || 'Generic',
                name_en: f.name_en,
                name_ar: f.name_ar,
                image_url: f.image_url,
                price_range: minPrice ? { min: minPrice, max: maxPrice } : null,
                store_count: totalOffers,
                variants: familyVariants
            };
        });

        // Sort unique attributes by sort_order
        const attributesList = Object.values(attrMeta).sort((a, b) => a.sort_order - b.sort_order);

        return {
            attributes: attributesList,
            products: productsList
        };
    }
}

module.exports = ProductService;

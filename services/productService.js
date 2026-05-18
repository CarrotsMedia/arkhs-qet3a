/**
 * Product Service
 * ================
 * Handles product queries: search, browse, featured, trending, recently added.
 * Separated from server.js for modular architecture.
 */

class ProductService {
    constructor(db) {
        this.db = db;
    }

    /**
     * Format raw DB rows into grouped product objects with offers
     */
    formatProducts(rows) {
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

                group.offers.push({
                    store_slug: r.store_slug || 'unknown',
                    store_name: r.store_name || 'Unknown Store',
                    price_egp: r.price_egp,
                    url: finalUrl,
                    availability: r.availability || 'unknown'
                });
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
    paginate(products, page = 1, limit = 52) {
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
     * Base SQL for product queries with joins
     */
    get baseProductSQL() {
        return `
            SELECT COALESCE(p.merged_product_id, p.id) as product_id,
                   master_p.name as name,
                   master_p.image_url as image_url,
                   master_p.brand as brand,
                   master_p.name_ar as name_ar,
                   master_p.name_en as name_en,
                   master_p.description_ar as description_ar,
                   master_p.description_en as description_en,
                   pr.price_egp, pr.availability, pr.product_url,
                   s.name as store_name, s.slug as store_slug,
                   c.slug as category_slug,
                   sc.slug as subcategory_slug
            FROM products p
            JOIN products master_p ON master_p.id = COALESCE(p.merged_product_id, p.id)
            LEFT JOIN prices pr ON pr.product_id = p.id
            LEFT JOIN stores s ON pr.store_id = s.id
            LEFT JOIN categories c ON master_p.category_id = c.id
            LEFT JOIN subcategories sc ON master_p.subcategory_id = sc.id
        `;
    }

    /**
     * Search products by query terms
     */
    search(query, page = 1, limit = 52) {
        const terms = query.trim().split(/\s+/).filter(t => t.length > 0);
        if (terms.length === 0) return { count: 0, products: [], page: 1, totalPages: 0 };

        let sql = this.baseProductSQL + ` WHERE 1=1`;
        const params = [];
        terms.forEach(term => {
            sql += ` AND (p.name LIKE ? OR master_p.name_ar LIKE ? OR master_p.name_en LIKE ? OR master_p.description_ar LIKE ? OR master_p.description_en LIKE ?)`;
            params.push(`%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`, `%${term}%`);
        });
        sql += ` ORDER BY p.id LIMIT 2000`;

        const rows = this.db.prepare(sql).all(...params);
        const unified = this.formatProducts(rows);
        const withOffers = unified.filter(p => p.offers && p.offers.length > 0);

        return this.paginate(withOffers, page, limit);
    }

    /**
     * Browse products by category (using new category system)
     */
    browseByCategory(categoryId, page = 1, limit = 52, sort = 'price_asc', filters = {}) {
        let sql = this.baseProductSQL + ` WHERE p.category_id = ?`;
        const params = [categoryId];

        // Subcategory filter
        if (filters.subcategory_id) {
            sql += ` AND p.subcategory_id = ?`;
            params.push(filters.subcategory_id);
        }

        // Brand filter
        if (filters.brand) {
            sql += ` AND LOWER(p.brand) = LOWER(?)`;
            params.push(filters.brand);
        }

        // Price range filter
        if (filters.min_price) {
            sql += ` AND pr.price_egp >= ?`;
            params.push(filters.min_price);
        }
        if (filters.max_price) {
            sql += ` AND pr.price_egp <= ?`;
            params.push(filters.max_price);
        }

        // In-stock filter
        if (filters.in_stock) {
            sql += ` AND pr.availability = 'in_stock'`;
        }

        sql += ` ORDER BY p.id LIMIT 3000`;

        const rows = this.db.prepare(sql).all(...params);
        let unified = this.formatProducts(rows);
        unified = unified.filter(p => p.offers && p.offers.length > 0);

        // Apply sorting
        unified = this.sortProducts(unified, sort);

        return this.paginate(unified, page, limit);
    }

    /**
     * Browse products by subcategory
     */
    browseBySubcategory(subcategoryId, page = 1, limit = 52, sort = 'price_asc', filters = {}) {
        let sql = this.baseProductSQL + ` WHERE p.subcategory_id = ?`;
        const params = [subcategoryId];

        if (filters.brand) {
            sql += ` AND LOWER(p.brand) = LOWER(?)`;
            params.push(filters.brand);
        }
        if (filters.min_price) {
            sql += ` AND pr.price_egp >= ?`;
            params.push(filters.min_price);
        }
        if (filters.max_price) {
            sql += ` AND pr.price_egp <= ?`;
            params.push(filters.max_price);
        }
        if (filters.in_stock) {
            sql += ` AND pr.availability = 'in_stock'`;
        }

        sql += ` ORDER BY p.id LIMIT 3000`;

        const rows = this.db.prepare(sql).all(...params);
        let unified = this.formatProducts(rows);
        unified = unified.filter(p => p.offers && p.offers.length > 0);
        unified = this.sortProducts(unified, sort);

        return this.paginate(unified, page, limit);
    }

    /**
     * Sort products by given criteria
     */
    sortProducts(products, sort) {
        switch (sort) {
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
                return products; // Already ordered by id desc if needed
            default:
                return products;
        }
    }

    /**
     * Get random suggestions for homepage
     */
    getSuggestions(limit = 8) {
        const rows = this.db.prepare(`
            ${this.baseProductSQL}
            WHERE p.image_url IS NOT NULL
              AND pr.price_egp IS NOT NULL
              AND p.id IN (
                  SELECT id FROM products ORDER BY RANDOM() LIMIT ?
              )
        `).all(limit);

        return this.formatProducts(rows);
    }

    /**
     * Get featured products (marked as featured in DB)
     */
    getFeaturedProducts(limit = 12) {
        const rows = this.db.prepare(`
            ${this.baseProductSQL}
            WHERE p.image_url IS NOT NULL
              AND pr.price_egp IS NOT NULL
              AND pr.availability = 'in_stock'
              AND p.is_featured = 1
            ORDER BY p.updated_at DESC
            LIMIT ?
        `).all(limit * 3);

        let products = this.formatProducts(rows);
        // If not enough featured, fill with random in-stock products
        if (products.length < limit) {
            const fill = this.db.prepare(`
                ${this.baseProductSQL}
                WHERE p.image_url IS NOT NULL
                  AND pr.price_egp IS NOT NULL
                  AND pr.availability = 'in_stock'
                  AND p.id IN (SELECT id FROM products ORDER BY RANDOM() LIMIT ?)
            `).all(limit * 3);
            const extra = this.formatProducts(fill);
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
    getTrendingProducts(limit = 8) {
        const rows = this.db.prepare(`
            ${this.baseProductSQL}
            WHERE p.image_url IS NOT NULL
              AND pr.price_egp IS NOT NULL
              AND pr.availability = 'in_stock'
              AND p.is_trending = 1
            ORDER BY p.updated_at DESC
            LIMIT ?
        `).all(limit * 3);

        let products = this.formatProducts(rows);
        if (products.length < limit) {
            const fill = this.db.prepare(`
                ${this.baseProductSQL}
                WHERE p.image_url IS NOT NULL
                  AND pr.price_egp IS NOT NULL
                  AND pr.availability = 'in_stock'
                ORDER BY p.updated_at DESC
                LIMIT ?
            `).all(limit * 3);
            const extra = this.formatProducts(fill);
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
    getBestDeals(limit = 8) {
        const rows = this.db.prepare(`
            ${this.baseProductSQL}
            WHERE p.image_url IS NOT NULL
              AND pr.price_egp IS NOT NULL
              AND pr.availability = 'in_stock'
              AND pr.discount_pct IS NOT NULL
              AND pr.discount_pct > 5
            ORDER BY pr.discount_pct DESC
            LIMIT ?
        `).all(limit * 3);

        return this.formatProducts(rows).slice(0, limit);
    }

    /**
     * Get recently added products
     */
    getRecentlyAdded(limit = 8) {
        const rows = this.db.prepare(`
            ${this.baseProductSQL}
            WHERE p.image_url IS NOT NULL
              AND pr.price_egp IS NOT NULL
            ORDER BY p.created_at DESC
            LIMIT ?
        `).all(limit * 3);

        return this.formatProducts(rows).slice(0, limit);
    }

    /**
     * Get available brands for a category
     */
    getBrandsForCategory(categoryId) {
        return this.db.prepare(`
            SELECT DISTINCT p.brand, COUNT(DISTINCT COALESCE(p.merged_product_id, p.id)) as count
            FROM products p
            WHERE p.category_id = ? AND p.brand IS NOT NULL AND p.brand != ''
            GROUP BY LOWER(p.brand)
            ORDER BY count DESC
            LIMIT 50
        `).all(categoryId);
    }

    /**
     * Get price range for a category
     */
    getPriceRange(categoryId) {
        return this.db.prepare(`
            SELECT MIN(pr.price_egp) as min_price, MAX(pr.price_egp) as max_price
            FROM prices pr
            JOIN products p ON pr.product_id = p.id
            WHERE p.category_id = ? AND pr.price_egp > 0
        `).get(categoryId);
    }

    /**
     * Get a single product with all its store prices
     */
    getProductDetail(productId) {
        const rows = this.db.prepare(`
            ${this.baseProductSQL}
            WHERE COALESCE(p.merged_product_id, p.id) = ?
        `).all(productId);

        if (!rows || rows.length === 0) return null;

        const products = this.formatProducts(rows);
        return products.length > 0 ? products[0] : null;
    }

    /**
     * Get products with the biggest price savings (difference between max and min store price)
     */
    getTopSavings(limit = 8) {
        const rows = this.db.prepare(`
            SELECT COALESCE(p.merged_product_id, p.id) as pid,
                   MIN(pr.price_egp) as min_price,
                   MAX(pr.price_egp) as max_price,
                   (MAX(pr.price_egp) - MIN(pr.price_egp)) as savings,
                   COUNT(DISTINCT pr.store_id) as store_count
            FROM products p
            JOIN prices pr ON pr.product_id = p.id
            WHERE pr.price_egp > 0
              AND pr.availability = 'in_stock'
            GROUP BY COALESCE(p.merged_product_id, p.id)
            HAVING store_count >= 2 AND savings > 0
            ORDER BY savings DESC
            LIMIT ?
        `).all(limit);

        if (!rows || rows.length === 0) return [];

        // Fetch full product details for these IDs
        const productIds = rows.map(r => r.pid);
        const placeholders = productIds.map(() => '?').join(',');
        const detailRows = this.db.prepare(`
            ${this.baseProductSQL}
            WHERE COALESCE(p.merged_product_id, p.id) IN (${placeholders})
        `).all(...productIds);

        const products = this.formatProducts(detailRows);

        // Attach savings info
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

        // Sort by savings descending
        products.sort((a, b) => (b.savings || 0) - (a.savings || 0));

        return products.slice(0, limit);
    }

    /**
     * Get DB stats
     */
    getStats() {
        const prodCount = this.db.prepare(`SELECT COUNT(DISTINCT COALESCE(merged_product_id, id)) as c FROM products`).get().c;
        const lastSync = this.db.prepare(`SELECT MAX(scraped_at) as m FROM prices`).get().m;
        const catCount = this.db.prepare(`SELECT COUNT(*) as c FROM categories WHERE is_active = 1`).get().c;
        const storeCount = this.db.prepare(`SELECT COUNT(*) as c FROM stores`).get().c;

        return {
            totalProducts: prodCount,
            lastSync: lastSync,
            totalCategories: catCount,
            totalStores: storeCount
        };
    }

    /**
     * Get price history for a product
     */
    getPriceHistory(productId) {
        const rows = this.db.prepare(`
            SELECT ph.price_egp, ph.recorded_at, s.name as store_name
            FROM price_history ph
            JOIN products p ON ph.product_id = p.id
            JOIN stores s ON ph.store_id = s.id
            WHERE COALESCE(p.merged_product_id, p.id) = ?
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
}

module.exports = ProductService;

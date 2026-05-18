/**
 * Filter Service
 * ===============
 * Provides dynamic filter options based on category attributes.
 * Different categories show different filter sets.
 */

class FilterService {
    constructor(db) {
        this.db = db;
    }

    /**
     * Get available filters for a category
     * Returns attribute definitions + available values + brands + price range
     */
    getFiltersForCategory(categorySlug) {
        const category = this.db.prepare(
            `SELECT id FROM categories WHERE slug = ?`
        ).get(categorySlug);

        if (!category) return null;

        // Get attribute definitions for this category
        const attributes = this.db.prepare(`
            SELECT pa.id, pa.slug, pa.name, pa.attribute_type, pa.filterable
            FROM product_attributes pa
            WHERE pa.category_id = ? AND pa.filterable = 1
            ORDER BY pa.sort_order ASC
        `).all(category.id);

        // Get distinct values for each attribute
        const enrichedAttributes = attributes.map(attr => {
            const values = this.db.prepare(`
                SELECT DISTINCT pav.value, COUNT(*) as count
                FROM product_attribute_values pav
                WHERE pav.attribute_id = ?
                GROUP BY pav.value
                ORDER BY count DESC
                LIMIT 30
            `).all(attr.id);

            return {
                ...attr,
                values: values.map(v => v.value),
                counts: values
            };
        });

        // Get brands
        const brands = this.db.prepare(`
            SELECT DISTINCT p.brand, COUNT(*) as count
            FROM products p
            WHERE p.category_id = ? AND p.brand IS NOT NULL AND p.brand != ''
            GROUP BY LOWER(p.brand)
            ORDER BY count DESC
            LIMIT 50
        `).all(category.id);

        // Get price range
        const priceRange = this.db.prepare(`
            SELECT MIN(pr.price_egp) as min_price, MAX(pr.price_egp) as max_price
            FROM prices pr
            JOIN products p ON pr.product_id = p.id
            WHERE p.category_id = ? AND pr.price_egp > 0
        `).get(category.id);

        // Get stores
        const stores = this.db.prepare(`
            SELECT DISTINCT s.slug, s.name, COUNT(*) as count
            FROM stores s
            JOIN prices pr ON pr.store_id = s.id
            JOIN products p ON pr.product_id = p.id
            WHERE p.category_id = ?
            GROUP BY s.id
            ORDER BY count DESC
        `).all(category.id);

        return {
            category_id: category.id,
            attributes: enrichedAttributes,
            brands: brands.map(b => ({ name: b.brand, count: b.count })),
            price_range: priceRange || { min_price: 0, max_price: 100000 },
            stores: stores.map(s => ({ slug: s.slug, name: s.name, count: s.count }))
        };
    }

    /**
     * Get filters for a subcategory
     */
    getFiltersForSubcategory(subcategorySlug) {
        const sub = this.db.prepare(
            `SELECT id, category_id FROM subcategories WHERE slug = ?`
        ).get(subcategorySlug);

        if (!sub) return null;

        // Get attributes specific to this subcategory
        const attributes = this.db.prepare(`
            SELECT pa.id, pa.slug, pa.name, pa.attribute_type, pa.filterable
            FROM product_attributes pa
            WHERE (pa.subcategory_id = ? OR (pa.category_id = ? AND pa.subcategory_id IS NULL))
              AND pa.filterable = 1
            ORDER BY pa.sort_order ASC
        `).all(sub.id, sub.category_id);

        const enrichedAttributes = attributes.map(attr => {
            const values = this.db.prepare(`
                SELECT DISTINCT pav.value, COUNT(*) as count
                FROM product_attribute_values pav
                JOIN products p ON pav.product_id = p.id
                WHERE pav.attribute_id = ? AND p.subcategory_id = ?
                GROUP BY pav.value
                ORDER BY count DESC
                LIMIT 30
            `).all(attr.id, sub.id);

            return {
                ...attr,
                values: values.map(v => v.value),
                counts: values
            };
        });

        const brands = this.db.prepare(`
            SELECT DISTINCT p.brand, COUNT(*) as count
            FROM products p
            WHERE p.subcategory_id = ? AND p.brand IS NOT NULL AND p.brand != ''
            GROUP BY LOWER(p.brand)
            ORDER BY count DESC
            LIMIT 50
        `).all(sub.id);

        const priceRange = this.db.prepare(`
            SELECT MIN(pr.price_egp) as min_price, MAX(pr.price_egp) as max_price
            FROM prices pr
            JOIN products p ON pr.product_id = p.id
            WHERE p.subcategory_id = ? AND pr.price_egp > 0
        `).get(sub.id);

        return {
            subcategory_id: sub.id,
            category_id: sub.category_id,
            attributes: enrichedAttributes,
            brands: brands.map(b => ({ name: b.brand, count: b.count })),
            price_range: priceRange || { min_price: 0, max_price: 100000 }
        };
    }
}

module.exports = FilterService;

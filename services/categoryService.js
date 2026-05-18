/**
 * Category Service
 * ================
 * Handles all category-related database queries and business logic.
 * Categories are loaded from the database (seeded from config/categories.json).
 */

class CategoryService {
    constructor(db) {
        this.db = db;
    }

    /**
     * Get all top-level categories with product counts
     */
    getAllCategories() {
        const categories = this.db.prepare(`
            SELECT c.id, c.slug, c.name, c.name_ar, c.icon, c.banner_image,
                   c.seo_title, c.seo_description, c.sort_order
            FROM categories c
            WHERE c.is_active = 1
            ORDER BY c.sort_order ASC
        `).all();

        // Get product counts per category
        return categories.map(cat => {
            const countRow = this.db.prepare(`
                SELECT COUNT(DISTINCT p.id) as cnt
                FROM products p
                WHERE p.category_id = ?
            `).get(cat.id);

            return {
                ...cat,
                count: countRow ? countRow.cnt : 0
            };
        });
    }

    /**
     * Get a single category by slug with its subcategories
     */
    getCategoryBySlug(slug) {
        const category = this.db.prepare(`
            SELECT c.id, c.slug, c.name, c.name_ar, c.icon, c.banner_image,
                   c.seo_title, c.seo_description
            FROM categories c
            WHERE c.slug = ? AND c.is_active = 1
        `).get(slug);

        if (!category) return null;

        // Get subcategories (top-level only, no nested)
        const subcategories = this.db.prepare(`
            SELECT s.id, s.slug, s.name, s.icon, s.parent_id
            FROM subcategories s
            WHERE s.category_id = ? AND s.parent_id IS NULL AND s.is_active = 1
            ORDER BY s.sort_order ASC
        `).all(category.id);

        // Add counts and nested children to each subcategory
        const enrichedSubs = subcategories.map(sub => {
            const countRow = this.db.prepare(`
                SELECT COUNT(DISTINCT p.id) as cnt
                FROM products p
                WHERE p.subcategory_id = ?
            `).get(sub.id);

            const children = this.db.prepare(`
                SELECT s2.id, s2.slug, s2.name, s2.icon
                FROM subcategories s2
                WHERE s2.parent_id = ? AND s2.is_active = 1
                ORDER BY s2.sort_order ASC
            `).all(sub.id);

            return {
                ...sub,
                count: countRow ? countRow.cnt : 0,
                children: children
            };
        });

        // Total count for this category
        const totalRow = this.db.prepare(`
            SELECT COUNT(DISTINCT p.id) as cnt FROM products p WHERE p.category_id = ?
        `).get(category.id);

        return {
            ...category,
            count: totalRow ? totalRow.cnt : 0,
            subcategories: enrichedSubs
        };
    }

    /**
     * Get subcategory by slug
     */
    getSubcategoryBySlug(slug) {
        const sub = this.db.prepare(`
            SELECT s.id, s.slug, s.name, s.icon, s.category_id, s.parent_id,
                   s.seo_title, s.seo_description
            FROM subcategories s
            WHERE s.slug = ? AND s.is_active = 1
        `).get(slug);

        if (!sub) return null;

        // Get parent category
        const category = this.db.prepare(`
            SELECT c.id, c.slug, c.name, c.icon FROM categories c WHERE c.id = ?
        `).get(sub.category_id);

        // Get parent subcategory if nested
        let parent = null;
        if (sub.parent_id) {
            parent = this.db.prepare(`
                SELECT s2.id, s2.slug, s2.name, s2.icon FROM subcategories s2 WHERE s2.id = ?
            `).get(sub.parent_id);
        }

        // Get children
        const children = this.db.prepare(`
            SELECT s2.id, s2.slug, s2.name, s2.icon
            FROM subcategories s2
            WHERE s2.parent_id = ? AND s2.is_active = 1
            ORDER BY s2.sort_order ASC
        `).all(sub.id);

        const countRow = this.db.prepare(`
            SELECT COUNT(DISTINCT p.id) as cnt FROM products p WHERE p.subcategory_id = ?
        `).get(sub.id);

        return {
            ...sub,
            category,
            parent,
            children,
            count: countRow ? countRow.cnt : 0
        };
    }

    /**
     * Build breadcrumb trail for a category/subcategory
     */
    getBreadcrumbs(categorySlug, subcategorySlug = null) {
        const crumbs = [{ name: 'Home', slug: '/', icon: '🏠' }];

        const cat = this.db.prepare(
            `SELECT id, slug, name, icon FROM categories WHERE slug = ?`
        ).get(categorySlug);

        if (!cat) return crumbs;
        crumbs.push({ name: cat.name, slug: `/category/${cat.slug}`, icon: cat.icon });

        if (subcategorySlug) {
            const sub = this.db.prepare(
                `SELECT id, slug, name, icon, parent_id FROM subcategories WHERE slug = ?`
            ).get(subcategorySlug);

            if (sub) {
                // If nested, add parent first
                if (sub.parent_id) {
                    const parent = this.db.prepare(
                        `SELECT slug, name, icon FROM subcategories WHERE id = ?`
                    ).get(sub.parent_id);
                    if (parent) {
                        crumbs.push({
                            name: parent.name,
                            slug: `/category/${cat.slug}/${parent.slug}`,
                            icon: parent.icon
                        });
                    }
                }
                crumbs.push({
                    name: sub.name,
                    slug: `/category/${cat.slug}/${sub.slug}`,
                    icon: sub.icon
                });
            }
        }

        return crumbs;
    }

    /**
     * Get featured categories for homepage (top N with most products)
     */
    getFeaturedCategories(limit = 6) {
        return this.db.prepare(`
            SELECT c.id, c.slug, c.name, c.icon, c.banner_image,
                   COUNT(DISTINCT p.id) as count
            FROM categories c
            LEFT JOIN products p ON p.category_id = c.id
            WHERE c.is_active = 1
            GROUP BY c.id
            HAVING count > 0
            ORDER BY count DESC
            LIMIT ?
        `).all(limit);
    }

    /**
     * Get category tree (full hierarchy for navigation menu)
     */
    getCategoryTree() {
        const categories = this.db.prepare(`
            SELECT c.id, c.slug, c.name, c.icon
            FROM categories c
            WHERE c.is_active = 1
            ORDER BY c.sort_order ASC
        `).all();

        return categories.map(cat => {
            const subs = this.db.prepare(`
                SELECT s.id, s.slug, s.name, s.icon
                FROM subcategories s
                WHERE s.category_id = ? AND s.parent_id IS NULL AND s.is_active = 1
                ORDER BY s.sort_order ASC
            `).all(cat.id);

            const enrichedSubs = subs.map(sub => {
                const children = this.db.prepare(`
                    SELECT s2.id, s2.slug, s2.name, s2.icon
                    FROM subcategories s2
                    WHERE s2.parent_id = ? AND s2.is_active = 1
                    ORDER BY s2.sort_order ASC
                `).all(sub.id);
                return { ...sub, children };
            });

            return { ...cat, subcategories: enrichedSubs };
        });
    }
}

module.exports = CategoryService;

/**
 * Admin Category Service
 * ======================
 * Handles administration tasks for categories, subcategories, and auto-classification keywords.
 */

const { ValidationError, NotFoundError } = require('../utils/errors');

class AdminCategoryService {
    constructor(db) {
        this.db = db;
        this.initIndexes();
    }

    /**
     * Create indexes on category keywords for optimal queries
     */
    async initIndexes() {
        try {
            await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_cat_keywords_cat ON category_keywords (category_id)').run();
            await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_cat_keywords_subcat ON category_keywords (subcategory_id)').run();
        } catch (err) {
            console.error('Error creating category_keywords indexes:', err);
        }
    }

    /**
     * Get all categories with stats (subcategories, keywords, products)
     */
    async getCategories() {
        return await this.db.prepare(`
            SELECT c.id, c.slug, c.name, c.name_ar, c.icon, c.banner_image, 
                   c.seo_title, c.seo_description, c.sort_order, c.is_active,
                   (SELECT COUNT(*) FROM subcategories s WHERE s.category_id = c.id) as subcategory_count,
                   (SELECT COUNT(*) FROM category_keywords ck WHERE ck.category_id = c.id) as keyword_count,
                   (SELECT COUNT(DISTINCT pf.id) 
                    FROM product_families pf 
                    JOIN subcategories s ON pf.subcategory_id = s.id 
                    WHERE s.category_id = c.id) as product_count
            FROM categories c
            ORDER BY c.sort_order ASC
        `).all();
    }

    /**
     * Get a single category by ID
     */
    async getCategoryById(id) {
        const category = await this.db.prepare(`
            SELECT id, slug, name, name_ar, icon, banner_image, 
                   seo_title, seo_description, sort_order, is_active
            FROM categories
            WHERE id = ?
        `).get(id);

        if (!category) {
            throw new NotFoundError(`Category with ID ${id} not found`);
        }
        return category;
    }

    /**
     * Create a new category
     */
    async createCategory(data) {
        const { slug, name, name_ar, icon, banner_image, seo_title, seo_description } = data;
        
        if (!name || !slug) {
            throw new ValidationError('Name and Slug are required');
        }

        // Validate slug uniqueness
        const existing = await this.db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
        if (existing) {
            throw new ValidationError(`Category slug "${slug}" already exists`);
        }

        // Get next sort order
        const maxSort = await this.db.prepare('SELECT MAX(sort_order) as max_sort FROM categories').get();
        const sortOrder = (maxSort && maxSort.max_sort !== null) ? maxSort.max_sort + 1 : 0;

        const info = await this.db.prepare(`
            INSERT INTO categories (slug, name, name_ar, icon, banner_image, seo_title, seo_description, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(slug, name, name_ar || null, icon || '📦', banner_image || null, seo_title || null, seo_description || null, sortOrder);

        return await this.getCategoryById(info.lastInsertRowid);
    }

    /**
     * Update an existing category
     */
    async updateCategory(id, data) {
        const category = await this.getCategoryById(id);
        const { slug, name, name_ar, icon, banner_image, seo_title, seo_description, is_active } = data;

        if (!name || !slug) {
            throw new ValidationError('Name and Slug are required');
        }

        // Validate slug uniqueness (exclude current)
        const existing = await this.db.prepare('SELECT id FROM categories WHERE slug = ? AND id != ?').get(slug, id);
        if (existing) {
            throw new ValidationError(`Category slug "${slug}" already exists`);
        }

        // If trying to deactivate (is_active = 0), check for active products
        if (is_active === 0 || is_active === false) {
            const productCount = await this.db.prepare(`
                SELECT COUNT(DISTINCT pf.id) as count 
                FROM product_families pf 
                JOIN subcategories s ON pf.subcategory_id = s.id 
                WHERE s.category_id = ?
            `).get(id).count;

            if (productCount > 0) {
                throw new ValidationError(`Cannot deactivate category: It contains ${productCount} active products. Reclassify them first.`);
            }
        }

        await this.db.prepare(`
            UPDATE categories 
            SET slug = ?, name = ?, name_ar = ?, icon = ?, banner_image = ?, seo_title = ?, seo_description = ?, is_active = COALESCE(?, is_active)
            WHERE id = ?
        `).run(
            slug, 
            name, 
            name_ar || null, 
            icon || '📦', 
            banner_image || null, 
            seo_title || null, 
            seo_description || null, 
            (is_active !== undefined ? (is_active ? 1 : 0) : null),
            id
        );

        return await this.getCategoryById(id);
    }

    /**
     * Soft delete a category
     */
    async deleteCategory(id) {
        // Soft delete sets is_active = 0
        return await this.updateCategory(id, { slug: await this.getCategoryById(id).slug, name: await this.getCategoryById(id).name, is_active: 0 });
    }

    /**
     * Reorder categories
     */
    async reorderCategories(ids) {
        if (!Array.isArray(ids)) {
            throw new ValidationError('IDs must be an array');
        }

        const update = this.db.prepare('UPDATE categories SET sort_order = ? WHERE id = ?');
        const transaction = this.db.transaction(async (idList) => {
            for (let index = 0; index < idList.length; index++) {
                const id = idList[index];
                await update.run(index, id);
            }
        });

        await transaction(ids);
        return true;
    }

    /**
     * Get subcategories for a category
     */
    async getSubcategories(categoryId) {
        // Ensure category exists
        await this.getCategoryById(categoryId);

        return await this.db.prepare(`
            SELECT s.id, s.slug, s.name, s.icon, s.category_id, s.parent_id, 
                   s.seo_title, s.seo_description, s.sort_order, s.is_active,
                   (SELECT COUNT(DISTINCT pf.id) FROM product_families pf WHERE pf.subcategory_id = s.id) as product_count
            FROM subcategories s
            WHERE s.category_id = ?
            ORDER BY s.sort_order ASC
        `).all(categoryId);
    }

    /**
     * Get a single subcategory by ID
     */
    async getSubcategoryById(id) {
        const subcategory = await this.db.prepare(`
            SELECT id, slug, name, icon, category_id, parent_id, 
                   seo_title, seo_description, sort_order, is_active
            FROM subcategories
            WHERE id = ?
        `).get(id);

        if (!subcategory) {
            throw new NotFoundError(`Subcategory with ID ${id} not found`);
        }
        return subcategory;
    }

    /**
     * Create a new subcategory
     */
    async createSubcategory(categoryId, data) {
        await this.getCategoryById(categoryId);
        const { slug, name, icon, parent_id, seo_title, seo_description } = data;

        if (!name || !slug) {
            throw new ValidationError('Name and Slug are required');
        }

        // Validate slug uniqueness
        const existing = await this.db.prepare('SELECT id FROM subcategories WHERE slug = ?').get(slug);
        if (existing) {
            throw new ValidationError(`Subcategory slug "${slug}" already exists`);
        }

        // Get next sort order for this category
        const maxSort = await this.db.prepare('SELECT MAX(sort_order) as max_sort FROM subcategories WHERE category_id = ?').get(categoryId);
        const sortOrder = (maxSort && maxSort.max_sort !== null) ? maxSort.max_sort + 1 : 0;

        const info = await this.db.prepare(`
            INSERT INTO subcategories (slug, name, icon, category_id, parent_id, seo_title, seo_description, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).run(slug, name, icon || '📦', categoryId, parent_id || null, seo_title || null, seo_description || null, sortOrder);

        return await this.getSubcategoryById(info.lastInsertRowid);
    }

    /**
     * Update an existing subcategory
     */
    async updateSubcategory(id, data) {
        const subcategory = await this.getSubcategoryById(id);
        const { slug, name, icon, parent_id, seo_title, seo_description, is_active } = data;

        if (!name || !slug) {
            throw new ValidationError('Name and Slug are required');
        }

        // Validate slug uniqueness (exclude current)
        const existing = await this.db.prepare('SELECT id FROM subcategories WHERE slug = ? AND id != ?').get(slug, id);
        if (existing) {
            throw new ValidationError(`Subcategory slug "${slug}" already exists`);
        }

        // If deactivating, check for active products
        if (is_active === 0 || is_active === false) {
            const productCount = await this.db.prepare(`
                SELECT COUNT(DISTINCT id) as count 
                FROM product_families 
                WHERE subcategory_id = ?
            `).get(id).count;

            if (productCount > 0) {
                throw new ValidationError(`Cannot deactivate subcategory: It contains ${productCount} active products. Reclassify them first.`);
            }
        }

        await this.db.prepare(`
            UPDATE subcategories 
            SET slug = ?, name = ?, icon = ?, parent_id = ?, seo_title = ?, seo_description = ?, is_active = COALESCE(?, is_active)
            WHERE id = ?
        `).run(
            slug, 
            name, 
            icon || '📦', 
            parent_id || null, 
            seo_title || null, 
            seo_description || null, 
            (is_active !== undefined ? (is_active ? 1 : 0) : null),
            id
        );

        return await this.getSubcategoryById(id);
    }

    /**
     * Soft delete a subcategory
     */
    async deleteSubcategory(id) {
        return await this.updateSubcategory(id, { slug: await this.getSubcategoryById(id).slug, name: await this.getSubcategoryById(id).name, is_active: 0 });
    }

    /**
     * Reorder subcategories
     */
    async reorderSubcategories(ids) {
        if (!Array.isArray(ids)) {
            throw new ValidationError('IDs must be an array');
        }

        const update = this.db.prepare('UPDATE subcategories SET sort_order = ? WHERE id = ?');
        const transaction = this.db.transaction(async (idList) => {
            for (let index = 0; index < idList.length; index++) {
                const id = idList[index];
                await update.run(index, id);
            }
        });

        await transaction(ids);
        return true;
    }

    /**
     * Get all keywords for a category, optionally filtered by subcategory
     */
    async getKeywords(categoryId) {
        await this.getCategoryById(categoryId);

        return await this.db.prepare(`
            SELECT ck.id, ck.keyword, ck.category_id, ck.subcategory_id, ck.weight,
                   s.name as subcategory_name
            FROM category_keywords ck
            LEFT JOIN subcategories s ON ck.subcategory_id = s.id
            WHERE ck.category_id = ?
            ORDER BY ck.keyword ASC
        `).all(categoryId);
    }

    /**
     * Add a classification keyword
     */
    async addKeyword(data) {
        const { keyword, category_id, subcategory_id, weight } = data;

        if (!keyword || !category_id) {
            throw new ValidationError('Keyword and Category ID are required');
        }

        await this.getCategoryById(category_id);
        if (subcategory_id) {
            await this.getSubcategoryById(subcategory_id);
        }

        // Check if keyword mapping already exists
        const existing = await this.db.prepare(`
            SELECT id FROM category_keywords 
            WHERE keyword = ? AND category_id = ? AND (subcategory_id = ? OR (subcategory_id IS NULL AND ? IS NULL))
        `).get(
            keyword, 
            category_id, 
            subcategory_id || null, 
            subcategory_id || null
        );

        if (existing) {
            throw new ValidationError(`Keyword "${keyword}" is already mapped to this category/subcategory`);
        }

        const info = await this.db.prepare(`
            INSERT INTO category_keywords (keyword, category_id, subcategory_id, weight)
            VALUES (?, ?, ?, ?)
        `).run(keyword, category_id, subcategory_id || null, weight !== undefined ? weight : 1);

        return await this.db.prepare(`
            SELECT ck.id, ck.keyword, ck.category_id, ck.subcategory_id, ck.weight,
                   s.name as subcategory_name
            FROM category_keywords ck
            LEFT JOIN subcategories s ON ck.subcategory_id = s.id
            WHERE ck.id = ?
        `).get(info.lastInsertRowid);
    }

    /**
     * Delete a classification keyword
     */
    async deleteKeyword(id) {
        const existing = await this.db.prepare('SELECT id FROM category_keywords WHERE id = ?').get(id);
        if (!existing) {
            throw new NotFoundError(`Keyword with ID ${id} not found`);
        }

        await this.db.prepare('DELETE FROM category_keywords WHERE id = ?').run(id);
        return true;
    }
}

module.exports = AdminCategoryService;

/**
 * Admin Product Service
 * =====================
 * Handles administration tasks for product families, variants, attributes, and offers.
 */

const { ValidationError, NotFoundError } = require('../utils/errors');

class AdminProductService {
    constructor(db) {
        this.db = db;
        this.migrateSoftDelete();
        this.initIndexes();
    }

    /**
     * Safely migrate store_offers to support soft delete and nullable variant_id
     */
    async migrateSoftDelete() {
        // Ensure columns is_deleted and deleted_at exist
        const columns = await this.db.prepare("PRAGMA table_info(store_offers)").all();
        const hasIsDeleted = columns.some(c => c.name === 'is_deleted');
        const hasDeletedAt = columns.some(c => c.name === 'deleted_at');

        if (!hasIsDeleted) {
            await this.db.prepare("ALTER TABLE store_offers ADD COLUMN is_deleted INTEGER DEFAULT 0").run();
        }
        if (!hasDeletedAt) {
            await this.db.prepare("ALTER TABLE store_offers ADD COLUMN deleted_at TEXT").run();
        }

        // Recheck columns to get updated schema state
        const updatedColumns = await this.db.prepare("PRAGMA table_info(store_offers)").all();
        const variantIdCol = updatedColumns.find(c => c.name === 'variant_id');

        if (variantIdCol && variantIdCol.notnull === 1) {
            console.log('Migrating store_offers table to make variant_id nullable...');
            
            // Recreate table in a transaction to remove NOT NULL from variant_id
            await this.db.transaction(async () => {
                // Drop existing indexes
                await this.db.prepare("DROP INDEX IF EXISTS idx_so_variant").run();
                await this.db.prepare("DROP INDEX IF EXISTS idx_so_active_offers").run();

                // Create new table with variant_id nullable
                await this.db.prepare(`
                    CREATE TABLE store_offers_new (
                        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                        variant_id          INTEGER, -- Nullable!
                        store_id            INTEGER NOT NULL,
                        raw_title           TEXT NOT NULL,
                        price_egp           REAL NOT NULL,
                        original_price_egp  REAL,
                        discount_pct        REAL,
                        availability        TEXT DEFAULT 'in_stock',
                        product_url         TEXT,
                        image_url           TEXT,
                        scraped_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
                        is_active           INTEGER DEFAULT 1,
                        is_deleted          INTEGER DEFAULT 0,
                        deleted_at          TEXT,
                        UNIQUE (variant_id, store_id),
                        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE SET NULL,
                        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
                    )
                `).run();

                // Copy data
                await this.db.prepare(`
                    INSERT INTO store_offers_new (
                        id, variant_id, store_id, raw_title, price_egp, original_price_egp,
                        discount_pct, availability, product_url, image_url, scraped_at,
                        is_active, is_deleted, deleted_at
                    )
                    SELECT 
                        id, variant_id, store_id, raw_title, price_egp, original_price_egp,
                        discount_pct, availability, product_url, image_url, scraped_at,
                        is_active, COALESCE(is_deleted, 0), deleted_at
                    FROM store_offers
                `).run();

                // Drop old table
                await this.db.prepare("DROP TABLE store_offers").run();

                // Rename new table to original
                await this.db.prepare("ALTER TABLE store_offers_new RENAME TO store_offers").run();
            })();
            console.log('Migration completed successfully.');
        }
    }

    /**
     * Create indexes on product tables for optimal performance if they don't exist
     */
    async initIndexes() {
        try {
            await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_pv_family ON product_variants (family_id)').run();
            await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_so_variant ON store_offers (variant_id)').run();
            await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_pf_deleted ON product_families (is_deleted)').run();
            
            // Optimized partial index for active/non-deleted offers
            await this.db.prepare(`
                CREATE INDEX IF NOT EXISTS idx_so_active_offers 
                ON store_offers (variant_id) 
                WHERE is_deleted = 0
            `).run();

            await this.db.prepare('CREATE INDEX IF NOT EXISTS idx_pv_sku ON product_variants (sku)').run();

            // Unique index using expressions to handle SQLite NULL behavior
            await this.db.prepare(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_variant_composite_nonnull 
                ON product_variants (
                    family_id,
                    COALESCE(storage_gb, -1),
                    COALESCE(ram_gb, -1),
                    COALESCE(color_en, ''),
                    COALESCE(network_gen, ''),
                    COALESCE(region_version, '')
                )
            `).run();

            await this.db.prepare(`
                CREATE UNIQUE INDEX IF NOT EXISTS idx_variant_sku_unique 
                ON product_variants (sku)
            `).run();

        } catch (err) {
            console.error('Error creating product performance indexes:', err);
        }
    }

    /**
     * Get paginated products list with advanced filters
     */
    async getProducts(filters = {}, page = 1, limit = 20) {
        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 20;
        const offset = (pageNum - 1) * limitNum;

        const conditions = [];
        const params = [];

        // Deleted filter
        if (filters.is_deleted !== undefined && filters.is_deleted !== 'all') {
            const isDel = (filters.is_deleted === 'true' || filters.is_deleted === '1' || filters.is_deleted === 1 || filters.is_deleted === true) ? 1 : 0;
            conditions.push('pf.is_deleted = ?');
            params.push(isDel);
        } else if (filters.is_deleted === 'all') {
            // Show all (deleted and non-deleted)
        } else {
            // Default: do not show deleted products
            conditions.push('pf.is_deleted = 0');
        }

        // Brand filter
        if (filters.brand_id) {
            conditions.push('pf.brand_id = ?');
            params.push(parseInt(filters.brand_id, 10));
        }

        // Category filter
        if (filters.category_id) {
            conditions.push('s.category_id = ?');
            params.push(parseInt(filters.category_id, 10));
        }

        // Subcategory filter
        if (filters.subcategory_id) {
            conditions.push('pf.subcategory_id = ?');
            params.push(parseInt(filters.subcategory_id, 10));
        }

        // Featured filter
        if (filters.is_featured !== undefined && filters.is_featured !== '') {
            const isFeat = (filters.is_featured === 'true' || filters.is_featured === '1' || filters.is_featured === 1 || filters.is_featured === true) ? 1 : 0;
            conditions.push('pf.is_featured = ?');
            params.push(isFeat);
        }

        // Trending filter
        if (filters.is_trending !== undefined && filters.is_trending !== '') {
            const isTrend = (filters.is_trending === 'true' || filters.is_trending === '1' || filters.is_trending === 1 || filters.is_trending === true) ? 1 : 0;
            conditions.push('pf.is_trending = ?');
            params.push(isTrend);
        }

        // Stock status filter
        if (filters.stock_status && filters.stock_status !== 'all') {
            if (filters.stock_status === 'in_stock') {
                conditions.push(`pf.id IN (
                    SELECT DISTINCT pv.family_id 
                    FROM product_variants pv 
                    JOIN store_offers so ON so.variant_id = pv.id AND so.is_active = 1 
                    WHERE so.availability = 'in_stock'
                )`);
            } else if (filters.stock_status === 'out_of_stock') {
                conditions.push(`pf.id NOT IN (
                    SELECT DISTINCT pv.family_id 
                    FROM product_variants pv 
                    JOIN store_offers so ON so.variant_id = pv.id AND so.is_active = 1 
                    WHERE so.availability = 'in_stock'
                )`);
            }
        }

        // Price range filter
        if (filters.min_price) {
            conditions.push(`pf.id IN (
                SELECT DISTINCT pv.family_id 
                FROM product_variants pv 
                JOIN store_offers so ON so.variant_id = pv.id AND so.is_active = 1 
                WHERE so.price_egp >= ?
            )`);
            params.push(parseFloat(filters.min_price));
        }
        if (filters.max_price) {
            conditions.push(`pf.id IN (
                SELECT DISTINCT pv.family_id 
                FROM product_variants pv 
                JOIN store_offers so ON so.variant_id = pv.id AND so.is_active = 1 
                WHERE so.price_egp <= ?
            )`);
            params.push(parseFloat(filters.max_price));
        }

        // Search filter using FTS5 (against product_search_idx)
        if (filters.search && filters.search.trim().length > 0) {
            const terms = filters.search.trim().split(/\s+/).filter(t => t.length > 0);
            if (terms.length > 0) {
                const ftsQuery = terms.map(term => `"${term.replace(/"/g, '""')}"*`).join(' AND ');
                conditions.push(`pf.id IN (SELECT family_id FROM product_search_idx WHERE product_search_idx MATCH ?)`);
                params.push(ftsQuery);
            }
        }

        const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

        // Count query
        const countQuery = `
            SELECT COUNT(*) as count 
            FROM product_families pf
            LEFT JOIN brands b ON pf.brand_id = b.id
            LEFT JOIN subcategories s ON pf.subcategory_id = s.id
            LEFT JOIN categories c ON s.category_id = c.id
            ${whereClause}
        `;
        const totalCount = this.db.prepare(countQuery).get(...params).count;

        // Sort order
        let orderBy = 'ORDER BY pf.id DESC';
        if (filters.sort) {
            switch (filters.sort) {
                case 'ranking_score':
                    orderBy = 'ORDER BY pf.ranking_score DESC, pf.id DESC';
                    break;
                case 'name_en':
                    orderBy = 'ORDER BY pf.name_en ASC';
                    break;
                case 'name_ar':
                    orderBy = 'ORDER BY pf.name_ar ASC';
                    break;
                case 'view_count':
                    orderBy = 'ORDER BY pf.view_count DESC, pf.id DESC';
                    break;
            }
        }

        // Data query
        const dataQuery = `
            SELECT 
                pf.id, pf.slug, pf.name_en, pf.name_ar, pf.image_url, 
                pf.is_featured, pf.is_trending, pf.view_count, pf.ranking_score, 
                pf.is_deleted, pf.deleted_at, pf.admin_notes, pf.manual_rank_override,
                b.name as brand_name,
                s.name as subcategory_name,
                c.name as category_name,
                (SELECT COUNT(*) FROM product_variants pv WHERE pv.family_id = pf.id) as variant_count,
                (SELECT COUNT(*) FROM store_offers so JOIN product_variants pv ON so.variant_id = pv.id WHERE pv.family_id = pf.id AND so.is_active = 1) as offer_count,
                (SELECT MIN(so.price_egp) FROM store_offers so JOIN product_variants pv ON so.variant_id = pv.id WHERE pv.family_id = pf.id AND so.is_active = 1) as min_price_egp,
                (SELECT MAX(so.price_egp) FROM store_offers so JOIN product_variants pv ON so.variant_id = pv.id WHERE pv.family_id = pf.id AND so.is_active = 1) as max_price_egp
            FROM product_families pf
            LEFT JOIN brands b ON pf.brand_id = b.id
            LEFT JOIN subcategories s ON pf.subcategory_id = s.id
            LEFT JOIN categories c ON s.category_id = c.id
            ${whereClause}
            ${orderBy}
            LIMIT ? OFFSET ?
        `;

        const products = this.db.prepare(dataQuery).all(...params, limitNum, offset);
        const totalPages = Math.ceil(totalCount / limitNum);

        return {
            products,
            pagination: {
                totalItems: totalCount,
                totalPages,
                currentPage: pageNum,
                limit: limitNum
            }
        };
    }

    /**
     * Get single product family detailed view with variants, attributes, and offers
     */
    async getProductById(id) {
        const product = await this.db.prepare(`
            SELECT 
                pf.id, pf.slug, pf.brand_id, pf.subcategory_id, pf.name_en, pf.name_ar, 
                pf.description_en, pf.description_ar, pf.image_url, 
                pf.is_featured, pf.is_trending, pf.view_count, pf.ranking_score, 
                pf.is_deleted, pf.deleted_at, pf.admin_notes, pf.manual_rank_override,
                b.name as brand_name,
                s.name as subcategory_name,
                s.category_id,
                c.name as category_name
            FROM product_families pf
            LEFT JOIN brands b ON pf.brand_id = b.id
            LEFT JOIN subcategories s ON pf.subcategory_id = s.id
            LEFT JOIN categories c ON s.category_id = c.id
            WHERE pf.id = ?
        `).get(id);

        if (!product) {
            throw new NotFoundError(`Product with ID ${id} not found`);
        }

        // Fetch variants
        const variants = await this.db.prepare(`
            SELECT id, sku, storage_gb, ram_gb, network_gen, color_en, color_ar, region_version, specs_json, image_url, created_at, updated_at
            FROM product_variants
            WHERE family_id = ?
        `).all(id);

        // For each variant, fetch attributes and active offers
        for (const variant of variants) {
            try {
                variant.specs = variant.specs_json ? JSON.parse(variant.specs_json) : {};
            } catch (e) {
                variant.specs = {};
            }

            variant.attributes = await this.db.prepare(`
                SELECT va.attribute_id, ad.slug, ad.name_en, ad.name_ar, va.value, ad.unit
                FROM variant_attributes va
                JOIN attribute_definitions ad ON va.attribute_id = ad.id
                WHERE va.variant_id = ?
            `).all(variant.id);

            variant.offers = await this.db.prepare(`
                SELECT so.id, so.store_id, so.variant_id, so.raw_title, so.price_egp, so.original_price_egp, so.discount_pct, so.availability, so.product_url, so.image_url, so.scraped_at, so.is_active, so.is_deleted,
                       s.name as store_name, s.slug as store_slug
                FROM store_offers so
                JOIN stores s ON so.store_id = s.id
                WHERE so.variant_id = ? AND (so.is_deleted = 0 OR so.is_deleted IS NULL)
                ORDER BY so.price_egp ASC
            `).all(variant.id);
        }

        // Fetch price history
        const priceHistory = await this.db.prepare(`
            SELECT ph.id, ph.variant_id, ph.store_id, ph.price_egp, ph.recorded_at,
                   s.name as store_name, s.slug as store_slug,
                   pv.sku as variant_sku
            FROM price_history ph
            JOIN stores s ON ph.store_id = s.id
            JOIN product_variants pv ON ph.variant_id = pv.id
            WHERE pv.family_id = ?
            ORDER BY ph.recorded_at ASC
        `).all(id);

        product.variants = variants;
        product.price_history = priceHistory;

        return product;
    }

    /**
     * Update product family details
     */
    async updateProduct(id, data) {
        const product = await this.getProductById(id); // throws NotFoundError if not exists
        
        const { name_en, name_ar, description_en, description_ar, brand_id, subcategory_id, image_url, admin_notes, is_featured, is_trending } = data;

        if (!name_en || !name_ar) {
            throw new ValidationError('Name (English) and Name (Arabic) are required');
        }

        // Validate brand exists
        if (brand_id) {
            const brandExists = await this.db.prepare('SELECT id FROM brands WHERE id = ?').get(brand_id);
            if (!brandExists) {
                throw new ValidationError(`Brand with ID ${brand_id} does not exist`);
            }
        } else {
            throw new ValidationError('Brand is required');
        }

        // Validate subcategory exists
        if (subcategory_id) {
            const subcatExists = await this.db.prepare('SELECT id FROM subcategories WHERE id = ?').get(subcategory_id);
            if (!subcatExists) {
                throw new ValidationError(`Subcategory with ID ${subcategory_id} does not exist`);
            }
        } else {
            throw new ValidationError('Subcategory is required');
        }

        await this.db.prepare(`
            UPDATE product_families
            SET name_en = ?,
                name_ar = ?,
                description_en = ?,
                description_ar = ?,
                brand_id = ?,
                subcategory_id = ?,
                image_url = ?,
                admin_notes = ?,
                is_featured = ?,
                is_trending = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            name_en,
            name_ar,
            description_en || null,
            description_ar || null,
            brand_id,
            subcategory_id,
            image_url || null,
            admin_notes || null,
            is_featured !== undefined ? (is_featured ? 1 : 0) : product.is_featured,
            is_trending !== undefined ? (is_trending ? 1 : 0) : product.is_trending,
            id
        );

        return await this.getProductById(id);
    }

    /**
     * Update variant attributes
     */
    async updateVariantAttributes(variantId, attributes) {
        const variant = await this.db.prepare('SELECT id FROM product_variants WHERE id = ?').get(variantId);
        if (!variant) {
            throw new NotFoundError(`Variant with ID ${variantId} not found`);
        }

        if (!Array.isArray(attributes)) {
            throw new ValidationError('Attributes must be an array');
        }

        const deleteStmt = this.db.prepare('DELETE FROM variant_attributes WHERE variant_id = ?');
        const insertStmt = this.db.prepare('INSERT INTO variant_attributes (variant_id, attribute_id, value) VALUES (?, ?, ?)');

        await this.db.transaction(async () => {
            deleteStmt.run(variantId);
            for (const attr of attributes) {
                if (attr.attribute_id && attr.value !== undefined && attr.value !== null && attr.value !== '') {
                    // Check if attribute definition exists
                    const exists = await this.db.prepare('SELECT id FROM attribute_definitions WHERE id = ?').get(attr.attribute_id);
                    if (exists) {
                        insertStmt.run(variantId, attr.attribute_id, String(attr.value));
                    }
                }
            }
        })();

        return true;
    }

    /**
     * Soft delete a product
     */
    async softDeleteProduct(id) {
        const product = await this.db.prepare('SELECT id FROM product_families WHERE id = ?').get(id);
        if (!product) {
            throw new NotFoundError(`Product with ID ${id} not found`);
        }

        await this.db.prepare(`
            UPDATE product_families
            SET is_deleted = 1,
                deleted_at = ?
            WHERE id = ?
        `).run(new Date().toISOString(), id);

        return true;
    }

    /**
     * Restore a soft-deleted product
     */
    async restoreProduct(id) {
        const product = await this.db.prepare('SELECT id FROM product_families WHERE id = ?').get(id);
        if (!product) {
            throw new NotFoundError(`Product with ID ${id} not found`);
        }

        await this.db.prepare(`
            UPDATE product_families
            SET is_deleted = 0,
                deleted_at = NULL
            WHERE id = ?
        `).run(id);

        return true;
    }

    /**
     * Update manual ranking override value
     */
    async updateRankOverride(id, manual_rank_override) {
        const product = await this.db.prepare('SELECT id FROM product_families WHERE id = ?').get(id);
        if (!product) {
            throw new NotFoundError(`Product with ID ${id} not found`);
        }

        let overrideVal = null;
        if (manual_rank_override !== undefined && manual_rank_override !== null && manual_rank_override !== '') {
            overrideVal = parseFloat(manual_rank_override);
            if (isNaN(overrideVal)) {
                throw new ValidationError('Rank override must be a valid number');
            }
        }

        await this.db.prepare(`
            UPDATE product_families
            SET manual_rank_override = ?,
                ranking_score = CASE WHEN ? IS NOT NULL THEN ? ELSE ranking_score END
            WHERE id = ?
        `).run(overrideVal, overrideVal, overrideVal, id);

        return await this.getProductById(id);
    }

    /**
     * Bulk soft delete products
     */
    async bulkDelete(ids) {
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new ValidationError('IDs must be a non-empty array');
        }

        const stmt = await this.db.prepare(`
            UPDATE product_families
            SET is_deleted = 1,
                deleted_at = ?
            WHERE id = ?
        `);

        const deletedAt = new Date().toISOString();
        await this.db.transaction(async () => {
            for (const id of ids) {
                stmt.run(deletedAt, id);
            }
        })();

        return true;
    }

    /**
     * Bulk restore products
     */
    async bulkRestore(ids) {
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new ValidationError('IDs must be a non-empty array');
        }

        const stmt = this.db.prepare(`
            UPDATE product_families
            SET is_deleted = 0,
                deleted_at = NULL
            WHERE id = ?
        `);

        await this.db.transaction(async () => {
            for (const id of ids) {
                stmt.run(id);
            }
        })();

        return true;
    }

    /**
     * Bulk move products to a different subcategory
     */
    async bulkMoveCategory(ids, subcategoryId) {
        if (!Array.isArray(ids) || ids.length === 0) {
            throw new ValidationError('IDs must be a non-empty array');
        }

        // Validate subcategory exists
        const subcat = this.db.prepare('SELECT id FROM subcategories WHERE id = ?').get(subcategoryId);
        if (!subcat) {
            throw new ValidationError(`Subcategory with ID ${subcategoryId} does not exist`);
        }

        const stmt = this.db.prepare(`
            UPDATE product_families
            SET subcategory_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);

        await this.db.transaction(async () => {
            for (const id of ids) {
                stmt.run(subcategoryId, id);
            }
        })();

        return true;
    }

    /**
     * Get attribute definitions for a subcategory
     */
    async getAttributeDefinitions(subcategoryId) {
        return this.db.prepare(`
            SELECT ad.id, ad.slug, ad.name_en, ad.name_ar, ad.value_type, ad.unit,
                   sa.is_required, sa.display_style
            FROM attribute_definitions ad
            JOIN subcategory_attributes sa ON sa.attribute_id = ad.id
            WHERE sa.subcategory_id = ?
            ORDER BY ad.sort_order ASC, ad.name_en ASC
        `).all(subcategoryId);
    }

    /**
     * Get list of all brands sorted by name
     */
    async getBrands() {
        return await this.db.prepare('SELECT id, name, slug FROM brands ORDER BY name ASC').all();
    }

    /**
     * Update a store offer's destination URL
     * @param {number} offerId
     * @param {string} productUrl
     */
    async updateOfferUrl(offerId, productUrl) {
        if (!productUrl) {
            throw new ValidationError('Product URL is required');
        }

        const offer = await this.db.prepare('SELECT id FROM store_offers WHERE id = ?').get(offerId);
        if (!offer) {
            throw new NotFoundError(`Offer with ID ${offerId} not found`);
        }

        await this.db.prepare(`
            UPDATE store_offers
            SET product_url = ?
            WHERE id = ?
        `).run(productUrl, offerId);

        return true;
    }

    /**
     * Check if a product family belongs to the smartphones subcategory
     */
    async isSmartphoneFamily(familyId) {
        const family = await this.db.prepare('SELECT subcategory_id FROM product_families WHERE id = ?').get(familyId);
        if (!family) return false;
        const subcat = await this.db.prepare('SELECT slug FROM subcategories WHERE id = ?').get(family.subcategory_id);
        return subcat && subcat.slug === 'smartphones';
    }

    /**
     * Create a new variant with uniqueness validations
     */
    async createVariant(familyId, data) {
        const { sku, storage_gb, ram_gb, color_en, color_ar, network_gen, region_version } = data;
        if (!sku) {
            throw new ValidationError('SKU is required');
        }

        // Validate smartphone specs
        if (await this.isSmartphoneFamily(familyId)) {
            const parsedStorage = storage_gb ? parseInt(storage_gb, 10) : null;
            const parsedRam = ram_gb ? parseInt(ram_gb, 10) : null;
            if (parsedStorage === null || isNaN(parsedStorage) || parsedStorage <= 0) {
                throw new ValidationError('Smartphones must have a valid Storage (GB) specification.');
            }
            if (parsedRam === null || isNaN(parsedRam) || parsedRam <= 0) {
                throw new ValidationError('Smartphones must have a valid RAM (GB) specification.');
            }
        }

        // SKU global uniqueness check
        const skuExists = await this.db.prepare('SELECT id FROM product_variants WHERE sku = ?').get(sku);
        if (skuExists) {
            throw new ValidationError(`SKU "${sku}" is already in use by another variant.`);
        }

        // Composite spec uniqueness check
        const compositeExists = await this.db.prepare(`
            SELECT id FROM product_variants
            WHERE family_id = ? 
              AND COALESCE(storage_gb, -1) = ? 
              AND COALESCE(ram_gb, -1) = ? 
              AND COALESCE(color_en, '') = ? 
              AND COALESCE(network_gen, '') = ? 
              AND COALESCE(region_version, '') = ?
        `).get(
            familyId, 
            storage_gb ? parseInt(storage_gb, 10) : -1, 
            ram_gb ? parseInt(ram_gb, 10) : -1, 
            color_en || '', 
            network_gen || '', 
            region_version || ''
        );

        if (compositeExists) {
            throw new ValidationError('A variant with the identical specifications already exists for this product.');
        }

        try {
            const result = await this.db.prepare(`
                INSERT INTO product_variants (
                    family_id, sku, storage_gb, ram_gb, color_en, color_ar, network_gen, region_version, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(
                familyId,
                sku,
                storage_gb ? parseInt(storage_gb, 10) : null,
                ram_gb ? parseInt(ram_gb, 10) : null,
                color_en || null,
                color_ar || null,
                network_gen || null,
                region_version || null
            );

            return result.lastInsertRowid;
        } catch (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                throw new ValidationError('A variant with this SKU or identical specifications already exists (DB Enforced).');
            }
            throw err;
        }
    }

    /**
     * Update variant details (specs)
     */
    async updateVariant(familyId, variantId, data) {
        const { sku, storage_gb, ram_gb, color_en, color_ar, network_gen, region_version } = data;
        if (!sku) {
            throw new ValidationError('SKU is required');
        }

        // Validate smartphone specs
        if (await this.isSmartphoneFamily(familyId)) {
            const parsedStorage = storage_gb ? parseInt(storage_gb, 10) : null;
            const parsedRam = ram_gb ? parseInt(ram_gb, 10) : null;
            if (parsedStorage === null || isNaN(parsedStorage) || parsedStorage <= 0) {
                throw new ValidationError('Smartphones must have a valid Storage (GB) specification.');
            }
            if (parsedRam === null || isNaN(parsedRam) || parsedRam <= 0) {
                throw new ValidationError('Smartphones must have a valid RAM (GB) specification.');
            }
        }

        // SKU global uniqueness check
        const skuExists = await this.db.prepare('SELECT id FROM product_variants WHERE sku = ? AND id != ?').get(sku, variantId);
        if (skuExists) {
            throw new ValidationError(`SKU "${sku}" is already in use by another variant.`);
        }

        // Composite spec uniqueness check
        const compositeExists = await this.db.prepare(`
            SELECT id FROM product_variants
            WHERE family_id = ? 
              AND COALESCE(storage_gb, -1) = ? 
              AND COALESCE(ram_gb, -1) = ? 
              AND COALESCE(color_en, '') = ?
              AND COALESCE(network_gen, '') = ?
              AND COALESCE(region_version, '') = ?
              AND id != ?
        `).get(
            familyId, 
            storage_gb ? parseInt(storage_gb, 10) : -1, 
            ram_gb ? parseInt(ram_gb, 10) : -1, 
            color_en || '',
            network_gen || '',
            region_version || '',
            variantId
        );

        if (compositeExists) {
            throw new ValidationError('A variant with the identical specifications already exists.');
        }

        try {
            const result = await this.db.prepare(`
                UPDATE product_variants
                SET sku = ?,
                    storage_gb = ?,
                    ram_gb = ?,
                    color_en = ?,
                    color_ar = ?,
                    network_gen = ?,
                    region_version = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ? AND family_id = ?
            `).run(
                sku,
                storage_gb ? parseInt(storage_gb, 10) : null,
                ram_gb ? parseInt(ram_gb, 10) : null,
                color_en || null,
                color_ar || null,
                network_gen || null,
                region_version || null,
                variantId,
                familyId
            );

            if (result.changes === 0) {
                throw new NotFoundError(`Variant with ID ${variantId} not found`);
            }

            return true;
        } catch (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                throw new ValidationError('A variant with this SKU or identical specifications already exists (DB Enforced).');
            }
            throw err;
        }
    }

    /**
     * Delete a variant and soft-delete its offers
     */
    async deleteVariant(familyId, variantId) {
        // Run as transaction
        const deleteTx = this.db.transaction(async () => {
            // Soft-delete and unlink all offers linked to this variant
            await this.db.prepare(`
                UPDATE store_offers 
                SET variant_id = NULL, is_active = 0, is_deleted = 1, deleted_at = CURRENT_TIMESTAMP
                WHERE variant_id = ?
            `).run(variantId);

            // Unlink price history records
            await this.db.prepare(`
                UPDATE price_history
                SET variant_id = NULL
                WHERE variant_id = ?
            `).run(variantId);

            // Clean up variant specifications attributes
            await this.db.prepare('DELETE FROM variant_attributes WHERE variant_id = ?').run(variantId);

            // Delete the variant
            const result = await this.db.prepare('DELETE FROM product_variants WHERE id = ? AND family_id = ?').run(variantId, familyId);
            if (result.changes === 0) {
                throw new NotFoundError(`Variant with ID ${variantId} not found under family ${familyId}`);
            }
        });
        
        await deleteTx();
        return true;
    }

    /**
     * Update store offer attributes with whitelisting, NaN checks, and FK checks
     */
    async updateOffer(offerId, data) {
        const allowedFields = ['variant_id', 'is_active', 'product_url'];
        const fields = [];
        const params = [];

        // Whitelist validation
        for (const key of Object.keys(data)) {
            if (!allowedFields.includes(key)) {
                throw new ValidationError(`Update of field "${key}" is not allowed.`);
            }
        }

        if (data.variant_id !== undefined) {
            if (data.variant_id === null || data.variant_id === 'null' || data.variant_id === '') {
                fields.push('variant_id = ?');
                params.push(null);
            } else {
                const parsedId = parseInt(data.variant_id, 10);
                if (isNaN(parsedId) || !Number.isInteger(parsedId)) {
                    throw new ValidationError('Invalid variant ID: must be a valid integer.');
                }
                
                // FK existence verification
                const variantExists = await this.db.prepare('SELECT id FROM product_variants WHERE id = ?').get(parsedId);
                if (!variantExists) {
                    throw new ValidationError(`Variant with ID ${parsedId} does not exist.`);
                }

                fields.push('variant_id = ?');
                params.push(parsedId);
            }
        }
        if (data.is_active !== undefined) {
            fields.push('is_active = ?');
            params.push(data.is_active ? 1 : 0);
        }
        if (data.product_url !== undefined) {
            fields.push('product_url = ?');
            params.push(data.product_url);
        }

        if (fields.length === 0) return true;

        params.push(offerId);

        const result = await this.db.prepare(`
            UPDATE store_offers
            SET ${fields.join(', ')}
            WHERE id = ?
        `).run(...params);

        if (result.changes === 0) {
            throw new NotFoundError(`Offer with ID ${offerId} not found`);
        }

        return true;
    }

    /**
     * Soft-delete a store offer
     */
    async deleteOffer(offerId) {
        const result = await this.db.prepare(`
            UPDATE store_offers 
            SET is_deleted = 1, is_active = 0, deleted_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(offerId);

        if (result.changes === 0) {
            throw new NotFoundError(`Offer with ID ${offerId} not found`);
        }
        return true;
    }
}

module.exports = AdminProductService;

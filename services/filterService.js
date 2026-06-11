/**
 * Filter Service (Refactored for Phase 7)
 * ========================================
 * Provides faceted filtering counts and dynamic option discovery
 * for categories and subcategories using the normalized variant schema.
 */

class FilterService {
    constructor(db) {
        this.db = db;
    }

    /**
     * Get dynamic attributes defined for a subcategory
     */
    async getAttributesForSubcategory(subcategoryId) {
        return await this.db.prepare(`
            SELECT ad.id, ad.slug, ad.name_en, ad.name_ar, ad.value_type, ad.unit, sa.display_style
            FROM subcategory_attributes sa
            JOIN attribute_definitions ad ON sa.attribute_id = ad.id
            WHERE sa.subcategory_id = ?
            ORDER BY ad.sort_order ASC
        `).all(subcategoryId);
    }

    /**
     * Get faceted filters for a subcategory based on active filter selections
     * Implements the "All-But-Itself" rule for counts.
     */
    async getFacetedFilters(subcategoryId, activeFilters = {}) {
        // 1. Fetch attributes linked to this subcategory
        const attributes = await this.getAttributesForSubcategory(subcategoryId);
        const attributeMap = new Map(attributes.map(a => [a.slug, a]));

        // 2. Identify active dynamic attribute filters
        const activeAttrFilters = {};
        for (const [key, val] of Object.entries(activeFilters)) {
            if (attributeMap.has(key) && val) {
                // Ensure value is normalized as an array of strings
                const vals = Array.isArray(val) 
                    ? val.map(String) 
                    : String(val).split(',').map(s => s.trim()).filter(s => s.length > 0);
                if (vals.length > 0) {
                    activeAttrFilters[key] = {
                        attr: attributeMap.get(key),
                        values: vals
                    };
                }
            }
        }

        // 3. Compute Facets for each dynamic attribute
        const facetedAttributes = await Promise.all(attributes.map(async (attr) => {
            // Get all possible values for this attribute in this subcategory
            const possibleValuesRows = await this.db.prepare(`
                SELECT DISTINCT va.value
                FROM variant_attributes va
                JOIN product_variants pv ON va.variant_id = pv.id
                JOIN product_families pf ON pv.family_id = pf.id
                WHERE pf.subcategory_id = ? AND va.attribute_id = ?
                ORDER BY va.value ASC
            `).all(subcategoryId, attr.id);
            const possibleValues = possibleValuesRows.map(r => r.value);

            // Compute counts for each value using the "All-But-Itself" rule
            const optionCounts = {};
            
            // Build base query applying all active filters EXCEPT this attribute's filter
            let sql = `
                SELECT va.value, COUNT(DISTINCT pv.id) as count
                FROM product_variants pv
                JOIN product_families pf ON pv.family_id = pf.id
                JOIN store_offers so ON so.variant_id = pv.id AND so.is_active = 1
                JOIN stores s ON so.store_id = s.id AND s.is_enabled = 1
                JOIN variant_attributes va ON va.variant_id = pv.id AND va.attribute_id = ?
            `;
            const params = [attr.id];

            // Join other active dynamic filters (EXCLUDING itself)
            let joinCounter = 0;
            for (const [otherSlug, filterInfo] of Object.entries(activeAttrFilters)) {
                if (otherSlug !== attr.slug) {
                    joinCounter++;
                    sql += `
                        JOIN variant_attributes va${joinCounter} 
                          ON va${joinCounter}.variant_id = pv.id 
                         AND va${joinCounter}.attribute_id = ?
                    `;
                    params.push(filterInfo.attr.id);
                }
            }

            // Apply standard filters
            sql += ` WHERE pf.subcategory_id = ?`;
            params.push(subcategoryId);

            if (activeFilters.brand) {
                const brands = Array.isArray(activeFilters.brand) 
                    ? activeFilters.brand 
                    : String(activeFilters.brand).split(',').map(b => b.trim());
                const placeholders = brands.map(() => '?').join(',');
                // Lookup brand ids
                const brandRows = await this.db.prepare(`SELECT id FROM brands WHERE LOWER(name_en) IN (${placeholders}) OR LOWER(name_ar) IN (${placeholders})`).all(...brands.map(b => b.toLowerCase()), ...brands.map(b => b.toLowerCase()));
                if (brandRows.length > 0) {
                    const brandPlaceholders = brandRows.map(() => '?').join(',');
                    sql += ` AND pf.brand_id IN (${brandPlaceholders})`;
                    params.push(...brandRows.map(r => r.id));
                }
            }

            if (activeFilters.min_price) {
                sql += ` AND so.price_egp >= ?`;
                params.push(activeFilters.min_price);
            }
            if (activeFilters.max_price) {
                sql += ` AND so.price_egp <= ?`;
                params.push(activeFilters.max_price);
            }
            if (activeFilters.in_stock) {
                sql += ` AND so.availability = 'in_stock'`;
            }

            // Apply other active dynamic filters values (EXCLUDING itself)
            joinCounter = 0;
            for (const [otherSlug, filterInfo] of Object.entries(activeAttrFilters)) {
                if (otherSlug !== attr.slug) {
                    joinCounter++;
                    const valPlaceholders = filterInfo.values.map(() => '?').join(',');
                    sql += ` AND va${joinCounter}.value IN (${valPlaceholders})`;
                    params.push(...filterInfo.values);
                }
            }

            sql += ` GROUP BY va.value`;

            try {
                const rows = await this.db.prepare(sql).all(...params);
                for (const row of rows) {
                    optionCounts[row.value] = row.count;
                }
            } catch (e) {
                console.error(`Faceted count query failed for ${attr.slug}:`, e.message);
            }

            // Map possible options with their counts and disabled state
            const options = possibleValues.map(val => {
                const count = optionCounts[val] || 0;
                const isSelected = activeAttrFilters[attr.slug]?.values.includes(val) || false;
                return {
                    value: val,
                    count,
                    selected: isSelected,
                    disabled: count === 0 && !isSelected
                };
            });

            return {
                slug: attr.slug,
                name_en: attr.name_en,
                name_ar: attr.name_ar,
                display_style: attr.display_style,
                unit: attr.unit,
                options
            };
        }));

        // 4. Compute Faceted Brands count
        const brandOptions = [];
        try {
            // Get all possible brands for this subcategory
            const possibleBrands = await this.db.prepare(`
                SELECT DISTINCT b.id, b.name_en, b.name_ar
                FROM brands b
                JOIN product_families pf ON pf.brand_id = b.id
                WHERE pf.subcategory_id = ?
                ORDER BY b.name_en ASC
            `).all(subcategoryId);

            let brandSql = `
                SELECT pf.brand_id, COUNT(DISTINCT pv.id) as count
                FROM product_variants pv
                JOIN product_families pf ON pv.family_id = pf.id
                JOIN store_offers so ON so.variant_id = pv.id AND so.is_active = 1
                JOIN stores s ON so.store_id = s.id AND s.is_enabled = 1
            `;
            const brandParams = [];

            // Join all active dynamic filters
            let joinCounter = 0;
            for (const [slug, filterInfo] of Object.entries(activeAttrFilters)) {
                joinCounter++;
                brandSql += `
                    JOIN variant_attributes va${joinCounter} 
                      ON va${joinCounter}.variant_id = pv.id 
                     AND va${joinCounter}.attribute_id = ?
                `;
                brandParams.push(filterInfo.attr.id);
            }

            brandSql += ` WHERE pf.subcategory_id = ?`;
            brandParams.push(subcategoryId);

            if (activeFilters.min_price) {
                brandSql += ` AND so.price_egp >= ?`;
                brandParams.push(activeFilters.min_price);
            }
            if (activeFilters.max_price) {
                brandSql += ` AND so.price_egp <= ?`;
                brandParams.push(activeFilters.max_price);
            }
            if (activeFilters.in_stock) {
                brandSql += ` AND so.availability = 'in_stock'`;
            }

            // Apply active dynamic filters values
            joinCounter = 0;
            for (const [slug, filterInfo] of Object.entries(activeAttrFilters)) {
                joinCounter++;
                const valPlaceholders = filterInfo.values.map(() => '?').join(',');
                brandSql += ` AND va${joinCounter}.value IN (${valPlaceholders})`;
                brandParams.push(...filterInfo.values);
            }

            brandSql += ` GROUP BY pf.brand_id`;

            const brandCounts = {};
            const rows = this.db.prepare(brandSql).all(...brandParams);
            for (const row of rows) {
                brandCounts[row.brand_id] = row.count;
            }

            const activeBrands = activeFilters.brand 
                ? (Array.isArray(activeFilters.brand) ? activeFilters.brand : String(activeFilters.brand).split(',').map(b => b.trim().toLowerCase()))
                : [];

            for (const b of possibleBrands) {
                const count = brandCounts[b.id] || 0;
                const isSelected = activeBrands.includes(b.name_en.toLowerCase()) || activeBrands.includes(b.name_ar.toLowerCase());
                brandOptions.push({
                    name_en: b.name_en,
                    name_ar: b.name_ar,
                    count,
                    selected: isSelected,
                    disabled: count === 0 && !isSelected
                });
            }
        } catch (e) {
            console.error('Faceted brand query failed:', e.message);
        }

        // 5. Get absolute Min and Max Price ranges for subcategory
        let priceRange = { min_price: 0, max_price: 100000 };
        try {
            const row = await this.db.prepare(`
                SELECT MIN(so.price_egp) as min_price, MAX(so.price_egp) as max_price
                FROM store_offers so
                JOIN product_variants pv ON so.variant_id = pv.id
                JOIN product_families pf ON pv.family_id = pf.id
                JOIN stores s ON so.store_id = s.id AND s.is_enabled = 1
                WHERE pf.subcategory_id = ? AND so.is_active = 1
            `).get(subcategoryId);
            if (row && row.min_price !== null) {
                priceRange = { min_price: row.min_price, max_price: row.max_price };
            }
        } catch (e) {
            console.error('Price range query failed:', e.message);
        }

        return {
            attributes: facetedAttributes,
            brands: brandOptions,
            price_range: priceRange
        };
    }
}

module.exports = FilterService;

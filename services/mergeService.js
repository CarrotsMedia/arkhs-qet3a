/**
 * Merge Service
 * =============
 * Handles candidate duplicate detection (fuzzy string matching with inverted index),
 * side-by-side comparisons, merge executions, and merge rollbacks (unmerges).
 */

const { ValidationError, NotFoundError } = require('../utils/errors');

class MergeService {
    constructor(db) {
        this.db = db;
        this.initializeTables();
    }

    /**
     * Create the merge history table if it does not exist
     */
    async initializeTables() {
        try {
            await this.db.exec(`
                CREATE TABLE IF NOT EXISTS merge_history (
                    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
                    master_family_id    INTEGER NOT NULL,
                    merged_family_id    INTEGER NOT NULL,
                    merged_by           INTEGER REFERENCES admin_users(id),
                    confidence_score    REAL,
                    merge_data          TEXT, -- JSON snapshot of merged family details
                    status              TEXT DEFAULT 'merged', -- 'merged', 'unmerged'
                    created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
                    unmerged_at         TEXT
                );
            `);
        } catch (err) {
            console.error('Error creating merge_history table:', err);
        }
    }

    // ═══════════════════════════════════════════════════
    // Text Normalization & NLP Helpers
    // ═══════════════════════════════════════════════════

    async cleanArabicNumbers(text) {
        if (!text) return '';
        const arabicToEnglish = {
            '٠':'0', '١':'1', '٢':'2', '٣':'3', '٤':'4', '٥':'5', '٦':'6', '٧':'7', '٨':'8', '٩':'9'
        };
        let res = text;
        for (const [ar, en] of Object.entries(arabicToEnglish)) {
            res = res.replaceAll(ar, en);
        }
        return res;
    }

    async normalizeArabicLetters(text) {
        if (!text) return '';
        return text
            .replace(/[أإآا]/g, 'ا')
            .replace(/[ةه]/g, 'ه')
            .replace(/[ىي]/g, 'ى');
    }

    async getNameWords(name) {
        if (!name) return new Set();
        const clean = await this.normalizeArabicLetters(await this.cleanArabicNumbers(name.toLowerCase()));
        const words = clean.match(/[a-z0-9\u0600-\u06FF]{2,}/g) || [];
        
        const brands = new Set([
            'samsung', 'apple', 'xiaomi', 'oppo', 'realme', 'vivo', 'infinix', 'tecno', 'honor', 'huawei', 'nothing', 'oneplus',
            'سامسونج', 'ابل', 'شاومي', 'اوبو', 'ريلمي', 'فيفو', 'انفينيكس', 'تكنو', 'هونر', 'هواوي'
        ]);
        const fillers = new Set([
            'phone', 'mobile', 'tablet', 'smart', 'watch', 'dual', 'sim', 'hifi', 'stereo', 'wifi', 'cellular',
            'with', 'and', 'for', 'the', 'gb', 'tb', 'ram', '4g', '5g'
        ]);

        return new Set(words.filter(w => !brands.has(w) && !fillers.has(w)));
    }

    async levenshteinDistance(s1, s2) {
        if (s1.length < s2.length) {
            return await this.levenshteinDistance(s2, s1);
        }
        if (s2.length === 0) {
            return s1.length;
        }

        let previousRow = Array.from({ length: s2.length + 1 }, (_, i) => i);
        for (let i = 0; i < s1.length; i++) {
            const currentRow = [i + 1];
            for (let j = 0; j < s2.length; j++) {
                const insertions = previousRow[j + 1] + 1;
                const deletions = currentRow[j] + 1;
                const substitutions = previousRow[j] + (s1[i] !== s2[j] ? 1 : 0);
                currentRow.push(Math.min(insertions, deletions, substitutions));
            }
            previousRow = currentRow;
        }
        return previousRow[previousRow.length - 1];
    }

    async calculateSimilarity(pf1, pf2, threshold = 0.70) {
        // Must be in same subcategory
        if (pf1.subcategory_id !== pf2.subcategory_id) return 0;
        
        // Brand mismatch check: if both have explicit non-null brands and they differ, score = 0
        if (pf1.brand_id && pf2.brand_id && pf1.brand_id !== pf2.brand_id) {
            return 0;
        }

        const n1 = (pf1.name_en || '').toLowerCase();
        const n2 = (pf2.name_en || '').toLowerCase();

        if (!n1 || !n2) return 0;

        const tokens1 = pf1.tokenSet || await this.getNameWords(n1);
        const tokens2 = pf2.tokenSet || await this.getNameWords(n2);

        let tokenSim = 0;
        if (tokens1.size > 0 && tokens2.size > 0) {
            const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
            const union = new Set([...tokens1, ...tokens2]);
            tokenSim = intersection.size / union.size;
        }

        // Pruning check: if even with maximum possible Levenshtein similarity (1.0),
        // the total similarity cannot reach threshold, skip levenshtein
        const maxPossibleScore = 0.4 * 1.0 + 0.6 * tokenSim;
        if (maxPossibleScore < threshold) {
            return 0;
        }

        // Levenshtein similarity
        const levDist = await this.levenshteinDistance(n1, n2);
        const maxLen = Math.max(n1.length, n2.length);
        const levSim = maxLen > 0 ? 1.0 - (levDist / maxLen) : 0;

        if (tokens1.size === 0 || tokens2.size === 0) {
            return levSim * 0.4; // Fallback to Levenshtein only
        }

        // Weighted combination: 40% Levenshtein, 60% Token Overlap
        return 0.4 * levSim + 0.6 * tokenSim;
    }

    // ═══════════════════════════════════════════════════
    // Core API Operations
    // ═══════════════════════════════════════════════════

    /**
     * Finds potential duplicate product family candidates using an inverted token index
     * for speed, pre-filtering by subcategory and brand.
     */
    async getCandidates(filters = {}, limit = 50) {
        const threshold = parseFloat(filters.threshold) || 0.70;
        
        // Get all active product families
        let sql = `
            SELECT pf.id, pf.name_en, pf.name_ar, pf.brand_id, pf.subcategory_id, pf.image_url,
                   b.name as brand_name, s.name as subcategory_name
            FROM product_families pf
            LEFT JOIN brands b ON pf.brand_id = b.id
            LEFT JOIN subcategories s ON pf.subcategory_id = s.id
            WHERE pf.is_deleted = 0
        `;
        const params = [];
        if (filters.subcategory_id) {
            sql += ` AND pf.subcategory_id = ?`;
            params.push(filters.subcategory_id);
        }
        if (filters.brand_id) {
            sql += ` AND pf.brand_id = ?`;
            params.push(filters.brand_id);
        }

        const families = this.db.prepare(sql).all(...params);

        // Group families by subcategory
        const subcatGroups = {};
        for (const fam of families) {
            if (!subcatGroups[fam.subcategory_id]) {
                subcatGroups[fam.subcategory_id] = [];
            }
            // Pre-calculate token sets for speed
            fam.tokenSet = await this.getNameWords(fam.name_en);
            subcatGroups[fam.subcategory_id].push(fam);
        }

        const candidatePairs = [];

        // Compare within each subcategory group
        for (const [subcatId, group] of Object.entries(subcatGroups)) {
            // Build inverted index for this group: word -> list of family objects
            const invertedIndex = {};
            for (const fam of group) {
                for (const word of fam.tokenSet) {
                    if (!invertedIndex[word]) {
                        invertedIndex[word] = [];
                    }
                    invertedIndex[word].push(fam);
                }
            }

            // To avoid double comparison (A, B) and (B, A), track compared pairs
            const compared = new Set();

            for (const pf1 of group) {
                // Find potential candidates sharing at least one word token
                const potentialMatches = new Set();
                for (const word of pf1.tokenSet) {
                    const matchedFams = invertedIndex[word] || [];
                    for (const pf2 of matchedFams) {
                        if (pf2.id > pf1.id) { // Ensure consistent order & avoid self-comparison
                            potentialMatches.add(pf2);
                        }
                    }
                }

                // If no tokens or small group size, fall back to comparing all in group
                const matchesToTest = (pf1.tokenSet.size === 0 || group.length < 20) 
                    ? group.filter(pf2 => pf2.id > pf1.id) 
                    : Array.from(potentialMatches);

                for (const pf2 of matchesToTest) {
                    const pairKey = `${pf1.id}-${pf2.id}`;
                    if (compared.has(pairKey)) continue;
                    compared.add(pairKey);

                    const score = await this.calculateSimilarity(pf1, pf2, threshold);
                    if (score >= threshold) {
                        // Gather extra details like variant/offer counts for display
                        candidatePairs.push({
                            score,
                            family1: {
                                id: pf1.id,
                                name_en: pf1.name_en,
                                name_ar: pf1.name_ar,
                                brand_name: pf1.brand_name,
                                subcategory_name: pf1.subcategory_name,
                                image_url: pf1.image_url
                            },
                            family2: {
                                id: pf2.id,
                                name_en: pf2.name_en,
                                name_ar: pf2.name_ar,
                                brand_name: pf2.brand_name,
                                subcategory_name: pf2.subcategory_name,
                                image_url: pf2.image_url
                            }
                        });
                    }
                }
            }
        }

        // Sort candidates by score descending
        candidatePairs.sort((a, b) => b.score - a.score);

        return candidatePairs.slice(0, limit);
    }

    /**
     * Loads 2+ families side-by-side including all variants, attributes, and active offers
     */
    async compareProducts(ids) {
        if (!Array.isArray(ids) || ids.length < 2) {
            throw new ValidationError('At least two product family IDs are required for comparison');
        }

        const placeholders = ids.map(() => '?').join(',');
        const families = await this.db.prepare(`
            SELECT pf.id, pf.slug, pf.name_en, pf.name_ar, pf.description_en, pf.description_ar,
                   pf.image_url, pf.brand_id, pf.subcategory_id, pf.is_featured, pf.is_trending,
                   b.name as brand_name, s.name as subcategory_name
            FROM product_families pf
            LEFT JOIN brands b ON pf.brand_id = b.id
            LEFT JOIN subcategories s ON pf.subcategory_id = s.id
            WHERE pf.id IN (${placeholders}) AND pf.is_deleted = 0
        `).all(...ids);

        const results = [];
        for (const fam of families) {
            // Load variants
            const variants = await this.db.prepare(`
                SELECT id, sku, storage_gb, ram_gb, network_gen, color_en, color_ar, region_version, image_url, confidence_score
                FROM product_variants
                WHERE family_id = ?
            `).all(fam.id);

            for (const v of variants) {
                // Load attributes for this variant
                v.attributes = await this.db.prepare(`
                    SELECT ad.slug, ad.name_en, ad.name_ar, va.value
                    FROM variant_attributes va
                    JOIN attribute_definitions ad ON va.attribute_id = ad.id
                    WHERE va.variant_id = ?
                `).all(v.id);

                // Load active store offers
                v.offers = await this.db.prepare(`
                    SELECT so.id, so.store_id, st.name as store_name, st.slug as store_slug,
                           so.price_egp, so.original_price_egp, so.discount_pct, so.availability, so.product_url, so.scraped_at,
                           so.color_en, so.color_ar, so.confidence_score
                    FROM store_offers so
                    JOIN stores st ON so.store_id = st.id
                    WHERE so.variant_id = ? AND so.is_active = 1
                `).all(v.id);
            }

            fam.variants = variants;
            results.push(fam);
        }

        return results;
    }

    /**
     * Preview merge results (A -> B) without writing to db
     */
    async previewMerge(sourceId, targetId) {
        if (sourceId === targetId) {
            throw new ValidationError('Source and target product families must be different');
        }

        const [source, target] = await this.compareProducts([sourceId, targetId]);
        if (!source) throw new NotFoundError(`Source product family ${sourceId} not found`);
        if (!target) throw new NotFoundError(`Target product family ${targetId} not found`);

        const mergedVariants = [];
        
        // Match source variants with target variants
        for (const sv of source.variants) {
            // Predict if it merges into an existing variant or moves as a new one
            // A variant matches if storage, ram, network generation, and region version are identical.
            const matchedTv = target.variants.find(tv => 
                tv.storage_gb === sv.storage_gb &&
                tv.ram_gb === sv.ram_gb &&
                String(tv.network_gen || '').toLowerCase() === String(sv.network_gen || '').toLowerCase() &&
                String(tv.region_version || '').toLowerCase() === String(sv.region_version || '').toLowerCase()
            );

            if (matchedTv) {
                // Variant already exists under target: offers will be merged
                mergedVariants.push({
                    action: 'merge_offers',
                    sourceVariant: { id: sv.id, sku: sv.sku },
                    targetVariant: { id: matchedTv.id, sku: matchedTv.sku },
                    offersCount: sv.offers.length
                });
            } else {
                // Variant does not exist: it will be moved & SKU updated
                const skuParts = [
                    `VAR-${target.id}`,
                    sv.storage_gb || 0,
                    sv.ram_gb || 0,
                    sv.network_gen || 'unknown'
                ];
                if (sv.region_version && sv.region_version.toLowerCase() !== 'international') {
                    skuParts.push(sv.region_version.toLowerCase().replace(/\s+/g, '-'));
                }
                const newSku = skuParts.join('-');
                mergedVariants.push({
                    action: 'move_variant',
                    sourceVariant: { id: sv.id, sku: sv.sku },
                    newSku,
                    offersCount: sv.offers.length
                });
            }
        }

        return {
            sourceFamily: { id: source.id, name_en: source.name_en, slug: source.slug },
            targetFamily: { id: target.id, name_en: target.name_en, slug: target.slug },
            variantsPreview: mergedVariants
        };
    }

    /**
     * Executes safe product merge: moves variants, handles SKU conflicts,
     * stores full undo snapshot in merge_history, and soft-deletes source family.
     */
    async executeMerge(sourceId, targetId, adminId) {
        if (sourceId === targetId) {
            throw new ValidationError('Source and target product families must be different');
        }

        // 1. Gather all info for snapshot
        const sourceFam = await this.db.prepare('SELECT * FROM product_families WHERE id = ?').get(sourceId);
        const targetFam = await this.db.prepare('SELECT * FROM product_families WHERE id = ?').get(targetId);

        if (!sourceFam || sourceFam.is_deleted) {
            throw new NotFoundError(`Active source product family ${sourceId} not found`);
        }
        if (!targetFam || targetFam.is_deleted) {
            throw new NotFoundError(`Active target product family ${targetId} not found`);
        }

        const sourceVariants = await this.db.prepare('SELECT * FROM product_variants WHERE family_id = ?').all(sourceId);
        const sourceVariantsData = [];

        for (const sv of sourceVariants) {
            const offers = await this.db.prepare('SELECT * FROM store_offers WHERE variant_id = ?').all(sv.id);
            const attrs = await this.db.prepare('SELECT * FROM variant_attributes WHERE variant_id = ?').all(sv.id);
            const priceHist = await this.db.prepare('SELECT * FROM price_history WHERE variant_id = ?').all(sv.id);
            sourceVariantsData.push({
                variant: sv,
                offers,
                attributes: attrs,
                price_history: priceHist
            });
        }

        // Gather raw product references
        const rawProducts = await this.db.prepare('SELECT id, merged_product_id FROM products WHERE merged_product_id = ?').all(sourceId);

        const mergeSnapshot = {
            source_family: sourceFam,
            variants_data: sourceVariantsData,
            raw_products: rawProducts,
            target_offers_moved: [],
            target_attributes_inserted: []
        };

        // Calculate confidence score (similarity score)
        const confidenceScore = await this.calculateSimilarity(sourceFam, targetFam);

        // 2. Perform merge in a safe database transaction
        const mergeTx = this.db.transaction(async () => {
            const targetVariants = await this.db.prepare('SELECT * FROM product_variants WHERE family_id = ?').all(targetId);

            for (const svData of sourceVariantsData) {
                const sv = svData.variant;

                // Look for conflicting target variant
                const matchedTv = targetVariants.find(tv => 
                    tv.storage_gb === sv.storage_gb &&
                    tv.ram_gb === sv.ram_gb &&
                    String(tv.network_gen || '').toLowerCase() === String(sv.network_gen || '').toLowerCase() &&
                    String(tv.region_version || '').toLowerCase() === String(sv.region_version || '').toLowerCase()
                );

                if (matchedTv) {
                    // SKU/Config Conflict: Merge Variant into Existing Target Variant
                    const targetVariantId = matchedTv.id;

                    // Update variant confidence score to the maximum of target and source
                    const maxConfidence = Math.max(matchedTv.confidence_score || 0, sv.confidence_score || 0);
                    await this.db.prepare('UPDATE product_variants SET confidence_score = ? WHERE id = ?').run(maxConfidence, targetVariantId);

                    // A. Move active store offers
                    for (const offer of svData.offers) {
                        // Check if target variant already has an offer from this store and with the same color
                        const existingTargetOffer = await this.db.prepare(`
                            SELECT * FROM store_offers 
                            WHERE variant_id = ? AND store_id = ? AND COALESCE(color_en, '') = COALESCE(?, '')
                        `).get(targetVariantId, offer.store_id, offer.color_en);

                        if (existingTargetOffer) {
                            if (offer.price_egp < existingTargetOffer.price_egp) {
                                // Cheaper source offer: Move target offer to source variant (deactivated) and move cheaper source offer to target variant.
                                // We delete the target offer first to avoid violating the UNIQUE constraint,
                                // then update the source offer to targetVariantId, then re-insert the target offer on the source variant (sv.id).
                                await this.db.prepare('DELETE FROM store_offers WHERE id = ?').run(existingTargetOffer.id);
                                await this.db.prepare('UPDATE store_offers SET variant_id = ? WHERE id = ?').run(targetVariantId, offer.id);
                                await this.db.prepare(`
                                    INSERT INTO store_offers (id, variant_id, store_id, raw_title, price_egp, original_price_egp, discount_pct, availability, product_url, image_url, scraped_at, is_active, color_en, color_ar, confidence_score)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                `).run(
                                    existingTargetOffer.id, sv.id, existingTargetOffer.store_id, existingTargetOffer.raw_title,
                                    existingTargetOffer.price_egp, existingTargetOffer.original_price_egp, existingTargetOffer.discount_pct,
                                    existingTargetOffer.availability, existingTargetOffer.product_url, existingTargetOffer.image_url,
                                    existingTargetOffer.scraped_at, 0, existingTargetOffer.color_en, existingTargetOffer.color_ar, existingTargetOffer.confidence_score
                                );

                                mergeSnapshot.target_offers_moved.push({
                                    offer_id: existingTargetOffer.id,
                                    original_variant_id: targetVariantId,
                                    new_variant_id: sv.id,
                                    offer_data: existingTargetOffer
                                });
                            } else {
                                // Target offer is cheaper: Keep target offer on target variant, deactivate the source offer on the source variant
                                await this.db.prepare('UPDATE store_offers SET is_active = 0 WHERE id = ?').run(offer.id);
                            }
                        } else {
                            // Move offer to target variant
                            await this.db.prepare('UPDATE store_offers SET variant_id = ? WHERE id = ?').run(targetVariantId, offer.id);
                        }
                    }

                    // B. Move price history
                    await this.db.prepare('UPDATE price_history SET variant_id = ? WHERE variant_id = ?').run(targetVariantId, sv.id);

                    // C. Move unique attributes
                    for (const attr of svData.attributes) {
                        const targetAttrExists = await this.db.prepare(`
                            SELECT 1 FROM variant_attributes WHERE variant_id = ? AND attribute_id = ?
                        `).get(targetVariantId, attr.attribute_id);

                        if (!targetAttrExists) {
                            await this.db.prepare(`
                                INSERT INTO variant_attributes (variant_id, attribute_id, value)
                                VALUES (?, ?, ?)
                            `).run(targetVariantId, attr.attribute_id, attr.value);

                            mergeSnapshot.target_attributes_inserted.push({
                                variant_id: targetVariantId,
                                attribute_id: attr.attribute_id
                            });
                        }
                    }

                    // D. We DO NOT delete the source variant or its attributes!
                    // This prevents cascading deletes and allows simple rollbacks.

                } else {
                    // No conflict: Move Variant and update SKU
                    const skuParts = [
                        `VAR-${targetId}`,
                        sv.storage_gb || 0,
                        sv.ram_gb || 0,
                        sv.network_gen || 'unknown'
                    ];
                    if (sv.region_version && sv.region_version.toLowerCase() !== 'international') {
                        skuParts.push(sv.region_version.toLowerCase().replace(/\s+/g, '-'));
                    }
                    const newSku = skuParts.join('-');
                    await this.db.prepare(`
                        UPDATE product_variants 
                        SET family_id = ?, sku = ? 
                        WHERE id = ?
                    `).run(targetId, newSku, sv.id);
                }
            }

            // 3. Update raw product references
            await this.db.prepare('UPDATE products SET merged_product_id = ? WHERE merged_product_id = ?').run(targetId, sourceId);

            // 4. Soft delete source family
            await this.db.prepare(`
                UPDATE product_families 
                SET is_deleted = 1, deleted_at = datetime('now'), admin_notes = ?
                WHERE id = ?
            `).run(`Merged into family ${targetId} (${targetFam.name_en})`, sourceId);

            // 5. Store history log
            const insertHistory = await this.db.prepare(`
                INSERT INTO merge_history (master_family_id, merged_family_id, merged_by, confidence_score, merge_data)
                VALUES (?, ?, ?, ?, ?)
            `);
            const info = await insertHistory.run(targetId, sourceId, adminId, confidenceScore, JSON.stringify(mergeSnapshot));
            
            return info.lastInsertRowid;
        });

        const historyId = await mergeTx();

        // 6. Invalidate caches (category tree, discovery page, FTS search)
        // Caches will be cleared on the next refresh/invalidation cycle
        
        return {
            success: true,
            merge_history_id: historyId,
            message: `Successfully merged product family ${sourceId} into ${targetId}`
        };
    }

    /**
     * Restores a soft-deleted family and moves all its original variants/offers back from the target family.
     * Restricted to super_admin.
     */
    async executeUnmerge(historyId) {
        const record = this.db.prepare('SELECT * FROM merge_history WHERE id = ?').get(historyId);
        if (!record) {
            throw new NotFoundError(`Merge history record ${historyId} not found`);
        }
        if (record.status === 'unmerged') {
            throw new ValidationError('This merge operation has already been undone');
        }

        const snapshot = JSON.parse(record.merge_data);
        const sourceFam = snapshot.source_family;
        const targetId = record.master_family_id;
        const sourceId = record.merged_family_id;

        // Verify target family exists
        const targetExists = this.db.prepare('SELECT 1 FROM product_families WHERE id = ?').get(targetId);
        if (!targetExists) {
            throw new ValidationError('Target product family no longer exists, cannot undo merge cleanly');
        }

        const rollbackTx = this.db.transaction(async () => {
            // 1. Restore the source family
            this.db.prepare(`
                UPDATE product_families 
                SET is_deleted = 0, deleted_at = NULL, admin_notes = NULL
                WHERE id = ?
            `).run(sourceId);

            // 2. Step 1: Temporarily delete moved target offers from their relocated places to free up source variants
            if (snapshot.target_offers_moved && Array.isArray(snapshot.target_offers_moved)) {
                for (const tom of snapshot.target_offers_moved) {
                    await this.db.prepare('DELETE FROM store_offers WHERE id = ?').run(tom.offer_id);
                }
            }

            // 3. Step 2: Restore variants, source offers, and price history
            for (const svData of snapshot.variants_data) {
                const origVar = svData.variant;

                // Check if this variant is currently attached to target family
                // (which means it was simply moved, not kept under source)
                const movedVar = await this.db.prepare(`
                    SELECT id FROM product_variants WHERE id = ? AND family_id = ?
                `).get(origVar.id, targetId);

                if (movedVar) {
                    // Move it back
                    await this.db.prepare(`
                        UPDATE product_variants 
                        SET family_id = ?, sku = ? 
                        WHERE id = ?
                    `).run(sourceId, origVar.sku, origVar.id);
                } else {
                    // Conflicting Variant: It was kept on source family.
                    // A. Restore original offers of the source variant
                    for (const offer of svData.offers) {
                        const currentOffer = await this.db.prepare('SELECT id FROM store_offers WHERE id = ?').get(offer.id);
                        if (currentOffer) {
                            // Move back to source variant and restore active status
                            this.db.prepare('UPDATE store_offers SET variant_id = ?, is_active = ? WHERE id = ?')
                                .run(origVar.id, offer.is_active, offer.id);
                        }
                    }

                    // B. Move price history back
                    for (const ph of svData.price_history) {
                        await this.db.prepare(`
                            UPDATE price_history 
                            SET variant_id = ? 
                            WHERE id = ?
                        `).run(origVar.id, ph.id);
                    }
                }
            }

            // 4. Step 3: Re-insert target offers on their original target variants (now that source offers have been moved away)
            if (snapshot.target_offers_moved && Array.isArray(snapshot.target_offers_moved)) {
                for (const tom of snapshot.target_offers_moved) {
                    const od = tom.offer_data;
                    await this.db.prepare(`
                        INSERT INTO store_offers (id, variant_id, store_id, raw_title, price_egp, original_price_egp, discount_pct, availability, product_url, image_url, scraped_at, is_active, color_en, color_ar, confidence_score)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        od.id, tom.original_variant_id, od.store_id, od.raw_title,
                        od.price_egp, od.original_price_egp, od.discount_pct,
                        od.availability, od.product_url, od.image_url,
                        od.scraped_at, od.is_active, od.color_en, od.color_ar, od.confidence_score
                    );
                }
            }

            // 4. Remove attributes that were copied to target variants
            if (snapshot.target_attributes_inserted && Array.isArray(snapshot.target_attributes_inserted)) {
                for (const attr of snapshot.target_attributes_inserted) {
                    this.db.prepare('DELETE FROM variant_attributes WHERE variant_id = ? AND attribute_id = ?')
                        .run(attr.variant_id, attr.attribute_id);
                }
            }

            // 5. Restore raw products references
            for (const rp of snapshot.raw_products) {
                await this.db.prepare('UPDATE products SET merged_product_id = ? WHERE id = ?').run(sourceId, rp.id);
            }

            // 6. Update history log status
            await this.db.prepare(`
                UPDATE merge_history 
                SET status = 'unmerged', unmerged_at = datetime('now') 
                WHERE id = ?
            `).run(historyId);
        });

        await rollbackTx();

        return {
            success: true,
            message: `Successfully unmerged product family ${sourceId} from ${targetId}`
        };
    }

    /**
     * Get merge history logs with admin names
     */
    async getHistory() {
        return await this.db.prepare(`
            SELECT mh.id, mh.master_family_id, mh.merged_family_id, mh.confidence_score, 
                   mh.status, mh.created_at, mh.unmerged_at,
                   au.display_name as merged_by_name,
                   pf1.name_en as master_name,
                   pf2.name_en as merged_name
            FROM merge_history mh
            LEFT JOIN admin_users au ON mh.merged_by = au.id
            LEFT JOIN product_families pf1 ON mh.master_family_id = pf1.id
            LEFT JOIN product_families pf2 ON mh.merged_family_id = pf2.id
            ORDER BY mh.id DESC
        `).all();
    }
}

module.exports = MergeService;

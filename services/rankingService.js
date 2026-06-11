const crypto = require('crypto');

class RankingService {
    constructor(db, rankingVersionService = null) {
        this.db = db;
        this.rankingVersionService = rankingVersionService;
    }

    /**
     * Hash client IP address for privacy using SHA-256
     */
    async hashIp(ip) {
        if (!ip) return 'unknown';
        return crypto.createHash('sha256').update(ip).digest('hex');
    }

    /**
     * Record a telemetry event with anti-spam check (24-hour IP debounce)
     */
    async recordTelemetry(familyId, eventType, req) {
        try {
            const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            const ipHash = await this.hashIp(ip);
            const userAgent = req.headers['user-agent'] || 'unknown';

            // Anti-spam check: Did this IP hash perform this event on this product in the last 24 hours?
            const recent = await this.db.prepare(`
                SELECT COUNT(*) as count 
                FROM product_telemetry 
                WHERE ip_hash = ? AND family_id = ? AND event_type = ? 
                  AND created_at > datetime('now', '-24 hours')
            `).get(ipHash, familyId, eventType);

            if (recent && recent.count > 0) {
                // Ignore spam clicks / views to prevent DB bloat
                return { success: true, status: 'ignored' };
            }

            // Insert new telemetry event
            await this.db.prepare(`
                INSERT INTO product_telemetry (family_id, event_type, ip_hash, user_agent)
                VALUES (?, ?, ?, ?)
            `).run(familyId, eventType, ipHash, userAgent);

            return { success: true, status: 'recorded' };
        } catch (e) {
            console.error('Error in recordTelemetry:', e);
            return { success: false, error: e.message };
        }
    }

    /**
     * Recalculate ranking_score for all product families
     */
    async recalculateRanks() {
        console.log('[RankingEngine] Starting product rank recalculation...');
        const startTime = Date.now();

        try {
            // 1. Fetch subcategory max prices to normalize pricing if needed
            const subcatMaxPricesRows = await this.db.prepare(`
                SELECT pf.subcategory_id, MAX(so.price_egp) as max_price
                FROM store_offers so
                JOIN product_variants pv ON so.variant_id = pv.id AND so.is_active = 1
                JOIN product_families pf ON pv.family_id = pf.id
                JOIN stores s ON so.store_id = s.id AND s.is_enabled = 1
                GROUP BY pf.subcategory_id
            `).all();

            const subcatMaxPrices = {};
            for (const r of subcatMaxPricesRows) {
                subcatMaxPrices[r.subcategory_id] = r.max_price || 1.0;
            }

            // 2. Fetch subcategory metadata (slugs) for spec-specific scoring rules
            const subcategoriesRows = await this.db.prepare(`SELECT id, slug FROM subcategories`).all();
            const subcatSlugs = {};
            for (const s of subcategoriesRows) {
                subcatSlugs[s.id] = s.slug.toLowerCase();
            }

            // 3. Fetch aggregated specifications per family from product_variants
            const specsRows = await this.db.prepare(`
                SELECT 
                    family_id,
                    MAX(ram_gb) as max_ram,
                    MAX(storage_gb) as max_storage,
                    MAX(CASE WHEN network_gen = '5G' THEN 1 ELSE 0 END) as is_5g
                FROM product_variants
                GROUP BY family_id
            `).all();

            const familySpecs = {};
            for (const s of specsRows) {
                familySpecs[s.family_id] = {
                    ram: s.max_ram || 0,
                    storage: s.max_storage || 0,
                    is_5g: !!s.is_5g
                };
            }

            // 4. Fetch telemetry counts per family
            const telemetryRows = await this.db.prepare(`
                SELECT 
                    family_id,
                    SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) as views,
                    SUM(CASE WHEN event_type = 'click_offer' THEN 1 ELSE 0 END) as clicks,
                    SUM(CASE WHEN event_type = 'compare' THEN 1 ELSE 0 END) as compares
                FROM product_telemetry
                GROUP BY family_id
            `).all();

            const familyTelemetry = {};
            for (const t of telemetryRows) {
                familyTelemetry[t.family_id] = {
                    views: t.views || 0,
                    clicks: t.clicks || 0,
                    compares: t.compares || 0
                };
            }

            // 5. Query all product families with pricing summaries
            const families = await this.db.prepare(`
                SELECT 
                    pf.id as family_id,
                    pf.subcategory_id,
                    MIN(so.price_egp) as min_price,
                    AVG(so.price_egp) as avg_price,
                    MAX(so.discount_pct) as max_discount,
                    COUNT(DISTINCT so.store_id) as store_count
                FROM product_families pf
                JOIN product_variants pv ON pv.family_id = pf.id
                JOIN store_offers so ON so.variant_id = pv.id AND so.is_active = 1
                JOIN stores s ON so.store_id = s.id AND s.is_enabled = 1
                GROUP BY pf.id
            `).all();

            // Get active ranking weights
            let weights = { price: 0.25, discount: 0.20, stores: 0.15, pop: 0.20, spec: 0.20 };
            if (this.rankingVersionService) {
                const activeFormula = await this.rankingVersionService.getActiveFormula();
                if (activeFormula && activeFormula.weights) {
                    weights = activeFormula.weights;
                    console.log(`[RankingEngine] Using active ranking version: ${activeFormula.version_id} (${activeFormula.formula_name})`);
                }
            }

            console.log(`[RankingEngine] Processing ranking score for ${families.length} families...`);

            const updates = [];

            for (const f of families) {
                const subcatId = f.subcategory_id;
                const minPrice = f.min_price || 0;
                const avgPrice = f.avg_price || 0;
                const maxDiscount = f.max_discount || 0;
                const storeCount = f.store_count || 0;

                // A. Price Competitiveness (25% default)
                // How much cheaper is the lowest offer compared to the average market price?
                let sPriceComp = 0.0;
                if (avgPrice > minPrice && avgPrice > 0) {
                    sPriceComp = (avgPrice - minPrice) / avgPrice; // e.g. 0.15 if lowest is 15% below average
                }
                // Cap between 0 and 1
                sPriceComp = Math.max(0.0, Math.min(1.0, sPriceComp));

                // B. Discount Strength (20% default)
                let sDiscount = maxDiscount / 100.0;
                sDiscount = Math.max(0.0, Math.min(1.0, sDiscount));

                // C. Store Coverage (15% default)
                // Higher store count means higher reliability and choice
                let sStoreCoverage = Math.min(1.0, storeCount / 4.0);

                // D. Popularity & Engagement (20% default)
                const tel = familyTelemetry[f.family_id] || { views: 0, clicks: 0, compares: 0 };
                // Engagement score: views + 3 * clicks + 5 * compares
                const engagement = (tel.views * 1) + (tel.clicks * 3) + (tel.compares * 5);
                // Log scale normalization: log10(1 + engagement) scaled against log10(1000) = 3
                let sPopularity = Math.log10(1 + engagement) / 3.0;
                sPopularity = Math.max(0.0, Math.min(1.0, sPopularity));

                // E. Specification Quality (20% default)
                const spec = familySpecs[f.family_id] || { ram: 0, storage: 0, is_5g: false };
                const subcatSlug = subcatSlugs[subcatId] || '';
                let sSpec = 0.5; // default fallback

                if (subcatSlug === 'smartphones' || subcatSlug === 'phones' || subcatSlug === 'tablets') {
                    // Mobile scoring: RAM (up to 16GB) & Storage (up to 512GB) & 5G support
                    const val = (spec.ram * 6) + (spec.storage * 0.1) + (spec.is_5g ? 20 : 0);
                    sSpec = Math.min(1.0, val / 120.0);
                } else if (subcatSlug === 'laptops') {
                    // Laptop scoring: RAM (up to 32GB) & Storage (up to 1TB)
                    const val = (spec.ram * 6) + (spec.storage * 0.05);
                    sSpec = Math.min(1.0, val / 200.0);
                } else if (subcatSlug === 'processors' || subcatSlug === 'gpu') {
                    // PC components default higher baseline if cataloged
                    sSpec = 0.7;
                }

                // Final weighted score aggregation (0 to 100) using active formula weights
                const finalScore = (
                    (sPriceComp * (weights.price ?? 0.25)) +
                    (sDiscount * (weights.discount ?? 0.20)) +
                    (sStoreCoverage * (weights.stores ?? 0.15)) +
                    (sPopularity * (weights.pop ?? 0.20)) +
                    (sSpec * (weights.spec ?? 0.20))
                ) * 100.0;

                updates.push({
                    family_id: f.family_id,
                    score: Math.round(finalScore * 10) / 10 // round to 1 decimal place
                });
            }

            // 6. Bulk update product_families in transaction chunks (size: 500)
            const updateStmt = this.db.prepare(`
                UPDATE product_families 
                SET ranking_score = ? 
                WHERE id = ?
            `);

            const chunkSize = 500;
            for (let i = 0; i < updates.length; i += chunkSize) {
                const chunk = updates.slice(i, i + chunkSize);
                await this.db.transaction(async () => {
                    for (const item of chunk) {
                        await updateStmt.run(item.score, item.family_id);
                    }
                })();
            }

            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`[RankingEngine] Successfully updated scores for ${updates.length} families in ${duration}s.`);
            return { success: true, count: updates.length, duration_seconds: duration };
        } catch (e) {
            console.error('[RankingEngine] Ranking calculation failed:', e);
            return { success: false, error: e.message };
        }
    }
}

module.exports = RankingService;

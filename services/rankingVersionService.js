/**
 * Ranking Versioning Service
 * ==========================
 * Manages versioned ranking formula configurations in SQLite,
 * facilitating hot-swaps, rollbacks, and A/B test routing.
 */

class RankingVersionService {
    constructor(db) {
        this.db = db;
        this.initializeTable();
    }

    async initializeTable() {
        await this.db.prepare(`
            CREATE TABLE IF NOT EXISTS ranking_versions (
                version_id TEXT PRIMARY KEY,
                formula_name TEXT NOT NULL,
                weights TEXT NOT NULL, -- JSON object string
                is_active INTEGER DEFAULT 0,
                description TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `).run();

        // Seed defaults
        const defaults = [
            {
                version_id: 'v1',
                formula_name: 'baseline',
                weights: JSON.stringify({
                    price: 0.25,
                    discount: 0.20,
                    stores: 0.15,
                    pop: 0.20,
                    spec: 0.20
                }),
                is_active: 1,
                description: 'Original baseline formula (balanced metrics)'
            },
            {
                version_id: 'v2',
                formula_name: 'deals_heavy',
                weights: JSON.stringify({
                    price: 0.15,
                    discount: 0.40,
                    stores: 0.10,
                    pop: 0.15,
                    spec: 0.20
                }),
                is_active: 0,
                description: 'Experimental deals-heavy formula focusing on high discount rates'
            }
        ];

        const insert = this.db.prepare(`
            INSERT OR IGNORE INTO ranking_versions (version_id, formula_name, weights, is_active, description)
            VALUES (?, ?, ?, ?, ?)
        `);

        for (const item of defaults) {
            await insert.run(item.version_id, item.formula_name, item.weights, item.is_active, item.description);
        }
    }

    /**
     * Get the active formula config
     */
    async getActiveFormula() {
        const row = await this.db.prepare('SELECT * FROM ranking_versions WHERE is_active = 1').get();
        if (!row) {
            // Safe fallback
            return {
                version_id: 'v1',
                formula_name: 'baseline',
                weights: { price: 0.25, discount: 0.20, stores: 0.15, pop: 0.20, spec: 0.20 }
            };
        }
        return {
            ...row,
            weights: JSON.parse(row.weights)
        };
    }

    /**
     * Set the active formula config
     */
    async setActiveFormula(versionId) {
        await this.db.transaction(async () => {
            // Set all to inactive
            await this.db.prepare('UPDATE ranking_versions SET is_active = 0').run();
            // Set active target
            const result = await this.db.prepare('UPDATE ranking_versions SET is_active = 1 WHERE version_id = ?').run(versionId);
            if (result.changes === 0) {
                throw new Error(`Ranking version not found: ${versionId}`);
            }
        })();

        return await this.getActiveFormula();
    }

    /**
     * Get all ranking formula configurations
     */
    async getAllFormulas() {
        const rows = await this.db.prepare('SELECT * FROM ranking_versions ORDER BY version_id ASC').all();
        return rows.map(r => ({
            ...r,
            weights: JSON.parse(r.weights)
        }));
    }

    /**
     * Compute ranking score given weights and raw metrics (priceComp, discount, storeCoverage, popularity, specScore)
     */
    async calculateScore(weights, metrics) {
        const priceCompVal = (metrics.priceComp || 0) * (weights.price || 0.25);
        const discountVal = (metrics.discount || 0) * (weights.discount || 0.20);
        const storesVal = (metrics.storeCoverage || 0) * (weights.stores || 0.15);
        const popularityVal = (metrics.popularity || 0) * (weights.pop || 0.20);
        const specVal = (metrics.specScore || 0) * (weights.spec || 0.20);

        const score = (priceCompVal + discountVal + storesVal + popularityVal + specVal) * 100.0;
        return Math.round(score * 10) / 10;
    }
}

module.exports = RankingVersionService;

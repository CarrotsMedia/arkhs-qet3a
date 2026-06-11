/**
 * Feature Flag Service
 * ====================
 * Provides dynamic feature toggles stored in SQLite with runtime rules parsing.
 */

class FeatureFlagService {
    constructor(db) {
        this.db = db;
        this.initializeTable();
    }

    /**
     * Set up feature_flags table and seed default flags
     */
    async initializeTable() {
        await this.db.prepare(`
            CREATE TABLE IF NOT EXISTS feature_flags (
                key TEXT PRIMARY KEY,
                is_enabled INTEGER DEFAULT 0,
                rules_json TEXT,
                description TEXT,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `).run();

        // Seed defaults
        const defaults = [
            {
                key: 'enable_new_ranking',
                is_enabled: 0,
                rules_json: '{}',
                description: 'Toggles experimental formula V2 for smart ranking'
            },
            {
                key: 'enable_new_search',
                is_enabled: 0,
                rules_json: '{}',
                description: 'Switches search engine logic or experimental relevance weights'
            },
            {
                key: 'enable_compare_v2',
                is_enabled: 1,
                rules_json: '{}',
                description: 'Enables advanced side-by-side comparison layout features'
            }
        ];

        const insert = await this.db.prepare(`
            INSERT OR IGNORE INTO feature_flags (key, is_enabled, rules_json, description)
            VALUES (?, ?, ?, ?)
        `);

        for (const flag of defaults) {
            await insert.run(flag.key, flag.is_enabled, flag.rules_json, flag.description);
        }
    }

    /**
     * Check if a feature flag is active for a given request
     * @param {string} key 
     * @param {object} req - Express request object for header/subnet rules matching (optional)
     */
    async isEnabled(key, req = null) {
        try {
            const flag = await this.db.prepare('SELECT is_enabled, rules_json FROM feature_flags WHERE key = ?').get(key);
            if (!flag) return false;

            // If flag is explicitly enabled globally
            if (flag.is_enabled === 1) {
                return true;
            }

            // Parse target override rules
            if (flag.rules_json && req) {
                const rules = JSON.parse(flag.rules_json);

                // Rule: Match header (e.g. x-enable-beta = true)
                if (rules.headerName && rules.headerValue) {
                    const reqVal = req.headers[rules.headerName.toLowerCase()];
                    if (reqVal === rules.headerValue) {
                        return true;
                    }
                }

                // Rule: Match IP Subnet or local loops
                if (rules.allowLocalOnly && req) {
                    const ip = req.ip || req.socket.remoteAddress || '';
                    if (ip === '127.0.0.1' || ip === '::1' || ip.includes('localhost')) {
                        return true;
                    }
                }
            }

            return false;
        } catch (e) {
            console.error(`Error checking feature flag ${key}:`, e);
            return false;
        }
    }

    /**
     * Toggle flag state
     */
    async setFlag(key, isEnabled, rules = null) {
        const rulesStr = rules ? JSON.stringify(rules) : '{}';
        await this.db.prepare(`
            UPDATE feature_flags 
            SET is_enabled = ?, rules_json = ?, updated_at = CURRENT_TIMESTAMP
            WHERE key = ?
        `).run(isEnabled ? 1 : 0, rulesStr, key);

        return { key, isEnabled, rules };
    }

    /**
     * Retrieve all flags for dashboard inspection
     */
    async getAllFlags() {
        return await this.db.prepare('SELECT * FROM feature_flags').all();
    }
}

module.exports = FeatureFlagService;

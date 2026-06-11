/**
 * Admin Store Service
 * ===================
 * Handles administration tasks for stores, query health metrics, and trigger/monitor scraper executions.
 */

const { ValidationError, NotFoundError } = require('../utils/errors');
const fs = require('fs');
const path = require('path');

class AdminStoreService {
    constructor(db, cacheService = null) {
        this.db = db;
        this.cacheService = cacheService;
        this.initializeStoreColumns();
    }

    /**
     * Dynamically executes migrations to add columns to the stores table if they do not exist
     */
    async initializeStoreColumns() {
        try {
            const columns = await this.db.prepare("PRAGMA table_info(stores)").all();
            const columnNames = columns.map(c => c.name);

            if (!columnNames.includes('is_enabled')) {
                await this.db.prepare("ALTER TABLE stores ADD COLUMN is_enabled INTEGER DEFAULT 1").run();
            }
            if (!columnNames.includes('priority')) {
                await this.db.prepare("ALTER TABLE stores ADD COLUMN priority INTEGER DEFAULT 5").run();
            }
            if (!columnNames.includes('last_scrape_at')) {
                await this.db.prepare("ALTER TABLE stores ADD COLUMN last_scrape_at TEXT").run();
            }
            if (!columnNames.includes('last_scrape_status')) {
                await this.db.prepare("ALTER TABLE stores ADD COLUMN last_scrape_status TEXT").run();
            }
            if (!columnNames.includes('scrape_error_log')) {
                await this.db.prepare("ALTER TABLE stores ADD COLUMN scrape_error_log TEXT").run();
            }
            if (!columnNames.includes('metadata')) {
                await this.db.prepare("ALTER TABLE stores ADD COLUMN metadata TEXT DEFAULT ''").run();
            }

            // Sync initial health states from output/sync_report.json
            await this.syncStoresHealthFromReport();
        } catch (err) {
            console.error('Error during store columns initialization:', err);
        }
    }

    /**
     * Parse sync_report.json and update stores table columns for diagnostic tracking
     */
    async syncStoresHealthFromReport() {
        try {
            const reportPath = path.join(__dirname, '../output/sync_report.json');
            if (fs.existsSync(reportPath)) {
                const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
                if (report && report.stores) {
                    const updateStmt = await this.db.prepare(`
                        UPDATE stores
                        SET last_scrape_at = ?,
                            last_scrape_status = ?,
                            scrape_error_log = ?
                        WHERE slug = ?
                    `);
                    await this.db.transaction(async () => {
                        for (const [slug, data] of Object.entries(report.stores)) {
                            await updateStmt.run(
                                data.completed_at || null,
                                data.status || null,
                                data.error || null,
                                slug
                            );
                        }
                    })();
                }
            }
        } catch (err) {
            console.error('Failed to sync store scrape health from report:', err);
        }
    }

    /**
     * Retrieves all stores along with variant and offer counts
     */
    async getStores() {
        return this.db.prepare(`
            SELECT s.id, s.slug, s.name, s.website, s.logo_url, s.is_enabled, s.priority, s.last_scrape_at, s.last_scrape_status, s.scrape_error_log, s.metadata,
                   (SELECT COUNT(DISTINCT so.variant_id) FROM store_offers so WHERE so.store_id = s.id AND so.is_deleted = 0) as variant_count,
                   (SELECT COUNT(*) FROM store_offers so WHERE so.store_id = s.id AND so.is_deleted = 0) as offer_count,
                   (SELECT COUNT(DISTINCT so.variant_id) FROM store_offers so WHERE so.store_id = s.id AND so.is_deleted = 0) as product_count
            FROM stores s
            ORDER BY s.priority DESC, s.id ASC
        `).all();
    }

    /**
     * Get a single store by ID
     */
    async getStoreById(id) {
        const store = await this.db.prepare(`
            SELECT s.id, s.slug, s.name, s.website, s.logo_url, s.is_enabled, s.priority, s.last_scrape_at, s.last_scrape_status, s.scrape_error_log, s.metadata,
                   (SELECT COUNT(DISTINCT so.variant_id) FROM store_offers so WHERE so.store_id = s.id AND so.is_deleted = 0) as variant_count,
                   (SELECT COUNT(*) FROM store_offers so WHERE so.store_id = s.id AND so.is_deleted = 0) as offer_count,
                   (SELECT COUNT(DISTINCT so.variant_id) FROM store_offers so WHERE so.store_id = s.id AND so.is_deleted = 0) as product_count
            FROM stores s
            WHERE s.id = ?
        `).get(id);

        if (!store) {
            throw new NotFoundError(`Store with ID ${id} not found`);
        }
        return store;
    }

    /**
     * Updates details, priority, metadata of a store
     */
    async updateStore(id, data) {
        const store = await this.getStoreById(id);
        const { name, website, logo_url, priority, metadata } = data;

        if (!name) {
            throw new ValidationError('Store name is required');
        }

        const priorityVal = priority !== undefined ? parseInt(priority, 10) : 5;
        if (isNaN(priorityVal)) {
            throw new ValidationError('Priority must be a valid integer');
        }

        // Optional metadata validation (ensure valid JSON or empty string)
        if (metadata) {
            try {
                JSON.parse(metadata);
            } catch (e) {
                throw new ValidationError('Metadata must be a valid JSON string');
            }
        }

        await this.db.prepare(`
            UPDATE stores
            SET name = ?, website = ?, logo_url = ?, priority = ?, metadata = ?
            WHERE id = ?
        `).run(name, website || null, logo_url || null, priorityVal, metadata || '', id);

        if (this.cacheService) {
            try {
                this.cacheService.clearAll();
            } catch (e) {
                console.error('Error clearing cache:', e);
            }
        }

        return await this.getStoreById(id);
    }

    /**
     * Changes is_enabled status of a store and invalidates cache
     */
    async toggleStore(id, isEnabled) {
        await this.getStoreById(id); // Assert existence
        const enabledVal = isEnabled ? 1 : 0;

        await this.db.prepare(`
            UPDATE stores SET is_enabled = ? WHERE id = ?
        `).run(enabledVal, id);

        if (this.cacheService) {
            try {
                this.cacheService.clearAll();
            } catch (e) {
                console.error('Error clearing cache:', e);
            }
        }

        return await this.getStoreById(id);
    }

    /**
     * Parses and returns structured stats from output/sync_report.json and database status indicators
     */
    async getScraperHealth() {
        const reportPath = path.join(__dirname, '../output/sync_report.json');
        let report = { stores: {} };
        if (fs.existsSync(reportPath)) {
            try {
                const data = fs.readFileSync(reportPath, 'utf8');
                report = JSON.parse(data);
            } catch (e) {
                report = { error: 'Failed to parse sync report', stores: {} };
            }
        } else {
            report = {
                message: 'No scraper run has completed yet.',
                stores: {}
            };
        }

        // Scan for active progress files
        const outputDir = path.join(__dirname, '../output');
        if (fs.existsSync(outputDir)) {
            try {
                const files = fs.readdirSync(outputDir);
                files.forEach(file => {
                    if (file.startsWith('progress_') && file.endsWith('.json')) {
                        try {
                            const slug = file.replace('progress_', '').replace('.json', '');
                            const progressPath = path.join(outputDir, file);
                            const progressData = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
                            
                            if (!report.stores[slug]) {
                                report.stores[slug] = { store_slug: slug };
                            }
                            report.stores[slug].status = 'running';
                            report.stores[slug].progress = progressData;
                        } catch (e) {
                            // ignore malformed progress files
                        }
                    }
                });
            } catch (e) {
                // ignore directory read errors
            }
        }

        return report;
    }
}

module.exports = AdminStoreService;

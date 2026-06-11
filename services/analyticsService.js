/**
 * Analytics & Telemetry Service
 * =============================
 * Handles search and filter telemetry persistence by subscribing to system events.
 * Provides rich aggregation functions for traffic metrics, latency performance, and diagnostics.
 */

class AnalyticsService {
    constructor(db, eventSystem = null, apiStats = null) {
        this.db = db;
        this.eventSystem = eventSystem;
        this.apiStats = apiStats || { totalRequests: 0, totalDuration: 0, avgResponseTime: 0, statusCodes: {}, recentLatencies: [] };
        
        this.initializeTables();
        if (this.eventSystem) {
            this.registerSubscribers();
        }
    }

    /**
     * Set up search and filter telemetry logging tables in SQLite
     */
    async initializeTables() {
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS search_telemetry (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                query           TEXT NOT NULL,
                ip_hash         TEXT NOT NULL,
                user_agent      TEXT NOT NULL,
                results_count   INTEGER DEFAULT 0,
                created_at      TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS filter_telemetry (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                filters_json    TEXT NOT NULL,
                ip_hash         TEXT NOT NULL,
                user_agent      TEXT NOT NULL,
                created_at      TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_search_created ON search_telemetry (created_at);
            CREATE INDEX IF NOT EXISTS idx_filter_created ON filter_telemetry (created_at);
        `);
    }

    /**
     * Subscribe to express application-wide events for automated logging
     */
    async registerSubscribers() {
        // Subscribe to search events
        this.eventSystem.on('SEARCH_EXECUTED', async (event) => {
            try {
                await this.db.prepare(`
                    INSERT INTO search_telemetry (query, ip_hash, user_agent, results_count, created_at)
                    VALUES (?, ?, ?, ?, ?)
                `).run(
                    event.payload.query,
                    event.actor.ipHash,
                    event.actor.userAgent,
                    event.payload.resultsCount || 0,
                    event.timestamp
                );
            } catch (err) {
                console.error('[AnalyticsService] Failed to record search event:', err);
            }
        });

        // Subscribe to filter events
        this.eventSystem.on('FILTER_APPLIED', async (event) => {
            try {
                await this.db.prepare(`
                    INSERT INTO filter_telemetry (filters_json, ip_hash, user_agent, created_at)
                    VALUES (?, ?, ?, ?)
                `).run(
                    JSON.stringify(event.payload.filters || {}),
                    event.actor.ipHash,
                    event.actor.userAgent,
                    event.timestamp
                );
            } catch (err) {
                console.error('[AnalyticsService] Failed to record filter event:', err);
            }
        });
    }

    /**
     * Aggregates general event counters and current user activity
     */
    async getOverviewMetrics() {
        const views = await this.db.prepare("SELECT COUNT(*) as count FROM product_telemetry WHERE event_type = 'view'").get().count;
        const clicks = await this.db.prepare("SELECT COUNT(*) as count FROM product_telemetry WHERE event_type = 'click_offer'").get().count;
        const compares = await this.db.prepare("SELECT COUNT(*) as count FROM product_telemetry WHERE event_type = 'compare'").get().count;
        const searches = await this.db.prepare("SELECT COUNT(*) as count FROM search_telemetry").get().count;
        
        // Count distinct active IPs in the last 24 hours
        const activeUsers = await this.db.prepare(`
            SELECT COUNT(DISTINCT ip_hash) as count FROM (
                SELECT ip_hash FROM product_telemetry WHERE created_at > datetime('now', '-24 hours')
                UNION
                SELECT ip_hash FROM search_telemetry WHERE created_at > datetime('now', '-24 hours')
            )
        `).get().count;

        return {
            views,
            clicks,
            compares,
            searches,
            activeUsers
        };
    }

    /**
     * Daily event timeline details for trend graphs
     */
    async getDailyTelemetrySummary(days = 14) {
        const rows = await this.db.prepare(`
            SELECT 
                d.date, 
                COALESCE(t.views, 0) as views, 
                COALESCE(t.clicks, 0) as clicks, 
                COALESCE(t.compares, 0) as compares,
                COALESCE(s.searches, 0) as searches
            FROM (
                SELECT date(created_at) as date FROM product_telemetry WHERE created_at > datetime('now', ?)
                UNION
                SELECT date(created_at) as date FROM search_telemetry WHERE created_at > datetime('now', ?)
            ) d
            LEFT JOIN (
                SELECT date(created_at) as date,
                       SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) as views,
                       SUM(CASE WHEN event_type = 'click_offer' THEN 1 ELSE 0 END) as clicks,
                       SUM(CASE WHEN event_type = 'compare' THEN 1 ELSE 0 END) as compares
                FROM product_telemetry
                GROUP BY date
            ) t ON d.date = t.date
            LEFT JOIN (
                SELECT date(created_at) as date, COUNT(*) as searches
                FROM search_telemetry
                GROUP BY date
            ) s ON d.date = s.date
            WHERE d.date IS NOT NULL
            ORDER BY d.date ASC
        `).all(`-${days} days`, `-${days} days`);

        return rows;
    }

    /**
     * Lists the most viewed product families
     */
    async getTopProducts(limit = 10) {
        return await this.db.prepare(`
            SELECT pf.id, pf.name_en as name, c.name as category, COUNT(pt.id) as views
            FROM product_telemetry pt
            JOIN product_families pf ON pt.family_id = pf.id
            JOIN subcategories sc ON pf.subcategory_id = sc.id
            JOIN categories c ON sc.category_id = c.id
            WHERE pt.event_type = 'view'
            GROUP BY pf.id
            ORDER BY views DESC
            LIMIT ?
        `).all(limit);
    }

    /**
     * Lists the most clicked storefront offers
     */
    async getTopClickedOffers(limit = 10) {
        return await this.db.prepare(`
            SELECT pf.name_en as product_name, s.name as store_name, COUNT(pt.id) as clicks
            FROM product_telemetry pt
            JOIN product_families pf ON pt.family_id = pf.id
            JOIN product_variants pv ON pv.family_id = pf.id
            JOIN store_offers so ON so.variant_id = pv.id
            JOIN stores s ON so.store_id = s.id
            WHERE pt.event_type = 'click_offer'
            GROUP BY pf.id, s.id
            ORDER BY clicks DESC
            LIMIT ?
        `).all(limit);
    }

    /**
     * Lists top search queries and their success statistics
     */
    async getTopSearchQueries(limit = 10) {
        return await this.db.prepare(`
            SELECT query, COUNT(*) as count, ROUND(AVG(results_count), 1) as avg_results
            FROM search_telemetry
            GROUP BY query
            ORDER BY count DESC
            LIMIT ?
        `).all(limit);
    }

    /**
     * Pulls system latencies metrics from express request records
     */
    async getApiLatencyStats() {
        const stats = this.apiStats;
        const total = stats.totalRequests || 0;
        const avg = Math.round(stats.totalDuration / (total || 1));
        
        return {
            totalRequests: total,
            avgResponseTimeMs: avg,
            statusCodes: stats.statusCodes || {},
            recentRequests: stats.recentLatencies || []
        };
    }

    /**
     * Lists recent system warnings and diagnostics (failed scraper runs, failed background tasks)
     */
    async getSystemErrors(limit = 10) {
        // Retrieve failed jobs from queue
        const failedJobs = await this.db.prepare(`
            SELECT id, job_type, error, duration_ms, created_at
            FROM job_queue
            WHERE status = 'failed'
            ORDER BY id DESC
            LIMIT ?
        `).all(limit);

        return {
            failedJobs
        };
    }
}

module.exports = AnalyticsService;

/**
 * Admin Store Routes
 * ==================
 * Handles HTTP requests for managing stores, editing store priorities, toggling store visibility,
 * and triggering/monitoring manual scraper sync executions.
 */

const express = require('express');
const { requireRole } = require('../middleware/adminAuth');
const { ValidationError } = require('../utils/errors');
const fs = require('fs');
const path = require('path');

function createStoreRoutes(adminStoreService, queueService, cacheService) {
    const router = express.Router();

    /**
     * GET /api/admin/stores
     * Lists all stores with counts and migration fields (viewer+)
     */
    router.get('/stores', async (req, res, next) => {
        try {
            const stores = await adminStoreService.getStores();
            res.json({ success: true, stores });
        } catch (err) {
            next(err);
        }
    });

    /**
     * PUT /api/admin/stores/:id
     * Update store details (editor+)
     */
    router.put('/stores/:id', requireRole('editor'), async (req, res, next) => {
        try {
            const store = await adminStoreService.updateStore(parseInt(req.params.id, 10), req.body);
            res.json({ success: true, store });
        } catch (err) {
            next(err);
        }
    });

    /**
     * PUT /api/admin/stores/:id/toggle
     * Toggle status (editor+)
     */
    router.put('/stores/:id/toggle', requireRole('editor'), async (req, res, next) => {
        try {
            const { is_enabled } = req.body;
            if (is_enabled === undefined) {
                throw new ValidationError('is_enabled state is required');
            }
            const store = await adminStoreService.toggleStore(parseInt(req.params.id, 10), !!is_enabled);
            res.json({ success: true, store });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/scrapers/run
     * Trigger all scrapers (editor+)
     */
    router.post('/scrapers/run', requireRole('editor'), async (req, res, next) => {
        try {
            const job = await queueService.enqueue('run_scraper_sync', {});
            res.json({ success: true, message: 'All scrapers run enqueued', job });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/scrapers/run/:storeSlug
     * Trigger a single store scraper (editor+)
     */
    router.post('/scrapers/run/:storeSlug', requireRole('editor'), async (req, res, next) => {
        try {
            const storeSlug = req.params.storeSlug;
            // Validate that the store slug exists in database
            const db = adminStoreService.db;
            const storeExists = await db.prepare('SELECT id FROM stores WHERE slug = ?').get(storeSlug);
            if (!storeExists) {
                throw new ValidationError(`Store slug "${storeSlug}" does not exist in registry.`);
            }

            const job = await queueService.enqueue('run_scraper_single', { store: storeSlug });
            res.json({ success: true, message: `Scraper run for ${storeSlug} enqueued`, job });
        } catch (err) {
            next(err);
        }
    });

    /**
     * GET /api/admin/scrapers/status
     * Check running/completed scraper jobs in queue and active runs (viewer+)
     */
    router.get('/scrapers/status', async (req, res, next) => {
        try {
            const health = await adminStoreService.getScraperHealth();
            res.json({ success: true, ...health });
        } catch (err) {
            next(err);
        }
    });

    /**
     * GET /api/admin/scrapers/logs
     * Read recent scraper log details (viewer+)
     */
    router.get('/scrapers/logs', async (req, res, next) => {
        try {
            const logPath = path.join(__dirname, '../output/sync.log');
            let logs = '';
            if (fs.existsSync(logPath)) {
                logs = fs.readFileSync(logPath, 'utf8');
            } else {
                // If sync.log doesn't exist, we fallback to formatting health report info
                const health = await adminStoreService.getScraperHealth();
                let summary = `[SYSTEM LOG SUMMARY]\n`;
                summary += `Last sync completed: ${health.last_sync_completed || 'never'}\n`;
                summary += `Total scrapers run: ${health.scrapers_run_count || 0}\n`;
                summary += `Success count: ${health.success_count || 0}\n`;
                summary += `Failure count: ${health.failure_count || 0}\n`;
                summary += `Products scraped: ${health.total_products_scraped || 0}\n\n`;

                if (health.stores) {
                    summary += `[STORE LOGS]\n`;
                    for (const [slug, store] of Object.entries(health.stores)) {
                        summary += `${store.status === 'success' ? '✔' : '❌'} ${slug.toUpperCase()}: ${store.status.toUpperCase()} (${store.products_scraped || 0} scraped, took ${store.duration_seconds || 0}s)\n`;
                        if (store.error) {
                            summary += `   └─ ERROR: ${store.error}\n`;
                        }
                    }
                }
                logs = summary;
            }
            res.json({ success: true, logs });
        } catch (err) {
            next(err);
        }
    });

    return router;
}

module.exports = createStoreRoutes;

/**
 * Admin Analytics & System Telemetry Routes
 * =========================================
 * Exposes endpoints for tracking app metrics, top searches, API latencies, and background worker errors.
 */

const express = require('express');

function createAnalyticsRoutes(analyticsService) {
    const router = express.Router();

    /**
     * GET /api/admin/analytics/overview
     * Returns overall telemetry stats and daily summary counters (viewer+)
     */
    router.get('/analytics/overview', async (req, res, next) => {
        try {
            const metrics = await analyticsService.getOverviewMetrics();
            const days = req.query.days ? parseInt(req.query.days) : 14;
            const summary = await analyticsService.getDailyTelemetrySummary(days);
            res.json({ success: true, metrics, summary });
        } catch (err) {
            next(err);
        }
    });

    /**
     * GET /api/admin/analytics/top-entities
     * Returns top viewed products, clicked offers, and search queries (viewer+)
     */
    router.get('/analytics/top-entities', async (req, res, next) => {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit) : 10;
            const products = await analyticsService.getTopProducts(limit);
            const offers = await analyticsService.getTopClickedOffers(limit);
            const searches = await analyticsService.getTopSearchQueries(limit);

            res.json({ success: true, products, offers, searches });
        } catch (err) {
            next(err);
        }
    });

    /**
     * GET /api/admin/analytics/performance
     * Returns API latencies, response status counts, and trace log items (viewer+)
     */
    router.get('/analytics/performance', async (req, res, next) => {
        try {
            const performance = await analyticsService.getApiLatencyStats();
            res.json({ success: true, performance });
        } catch (err) {
            next(err);
        }
    });

    /**
     * GET /api/admin/analytics/errors
     * Returns system diagnostics report and failed queue jobs (viewer+)
     */
    router.get('/analytics/errors', async (req, res, next) => {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit) : 10;
            const diagnostics = await analyticsService.getSystemErrors(limit);
            res.json({ success: true, diagnostics });
        } catch (err) {
            next(err);
        }
    });

    return router;
}

module.exports = createAnalyticsRoutes;

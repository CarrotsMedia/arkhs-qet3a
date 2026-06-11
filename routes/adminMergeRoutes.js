/**
 * Admin Merge Routes
 * ==================
 * Exposes API endpoints for candidate duplicate detection, side-by-side comparison,
 * previewing, executing merges, and unmerging previously merged product families.
 */

const express = require('express');
const { requireRole } = require('../middleware/adminAuth');
const { ValidationError } = require('../utils/errors');

function createMergeRoutes(mergeService, cacheService) {
    const router = express.Router();

    /**
     * GET /api/admin/merge/candidates
     * Retrieve potential duplicate candidates (viewer+)
     */
    router.get('/merge/candidates', async (req, res, next) => {
        try {
            const threshold = req.query.threshold ? parseFloat(req.query.threshold) : undefined;
            const limit = req.query.limit ? parseInt(req.query.limit, 10) : undefined;

            const candidates = mergeService.getCandidates({ threshold }, limit);
            res.json({ success: true, candidates });
        } catch (err) {
            next(err);
        }
    });

    /**
     * GET /api/admin/merge/compare
     * Side-by-side comparison of 2 or more product families (viewer+)
     */
    router.get('/merge/compare', async (req, res, next) => {
        try {
            const { ids } = req.query;
            if (!ids) {
                throw new ValidationError('Query parameter "ids" (comma-separated) is required');
            }

            const idArray = ids.split(',').map(id => parseInt(id, 10)).filter(id => !isNaN(id));
            if (idArray.length < 2) {
                throw new ValidationError('At least two valid family IDs are required for comparison');
            }

            const comparison = mergeService.compareProducts(idArray);
            res.json({ success: true, comparison });
        } catch (err) {
            next(err);
        }
    });

    /**
     * GET /api/admin/merge/preview
     * Preview variant resolution and SKU mapping before executing merge (viewer+)
     */
    router.get('/merge/preview', async (req, res, next) => {
        try {
            const sourceId = parseInt(req.query.sourceId, 10);
            const targetId = parseInt(req.query.targetId, 10);

            if (isNaN(sourceId) || isNaN(targetId)) {
                throw new ValidationError('sourceId and targetId query parameters are required and must be numbers');
            }

            const preview = mergeService.previewMerge(sourceId, targetId);
            res.json({ success: true, preview });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/merge/execute
     * Merge source product family into target family (editor+)
     */
    router.post('/merge/execute', requireRole('editor'), async (req, res, next) => {
        try {
            const sourceId = parseInt(req.body.sourceId, 10);
            const targetId = parseInt(req.body.targetId, 10);

            if (isNaN(sourceId) || isNaN(targetId)) {
                throw new ValidationError('sourceId and targetId are required and must be numbers');
            }

            const adminId = req.admin.id;
            const result = mergeService.executeMerge(sourceId, targetId, adminId);

            // Invalidate products, categories and discovery caches
            cacheService.clearAll();

            res.json(result);
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/merge/unmerge/:id
     * Rollback a previous merge operation (super_admin only)
     */
    router.post('/merge/unmerge/:id', requireRole('super_admin'), async (req, res, next) => {
        try {
            const historyId = parseInt(req.params.id, 10);
            if (isNaN(historyId)) {
                throw new ValidationError('Invalid merge history ID');
            }

            const result = mergeService.executeUnmerge(historyId);

            // Invalidate caches
            cacheService.clearAll();

            res.json(result);
        } catch (err) {
            next(err);
        }
    });

    /**
     * GET /api/admin/merge/history
     * Get list of historical merge events (viewer+)
     */
    router.get('/merge/history', async (req, res, next) => {
        try {
            const history = mergeService.getHistory();
            res.json({ success: true, history });
        } catch (err) {
            next(err);
        }
    });

    return router;
}

module.exports = createMergeRoutes;

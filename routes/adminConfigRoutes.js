/**
 * Admin Configuration, Feature Flags & Cache Routes
 * =================================================
 * Mounts endpoints for managing feature flags (and target override rules),
 * hot-swapping ranking formulas, and cache inspection/eviction.
 */

const express = require('express');
const { requireRole } = require('../middleware/adminAuth');
const { ValidationError } = require('../utils/errors');

function createConfigRoutes(featureFlagService, rankingVersionService, cacheService, queueService) {
    const router = express.Router();

    // ═══════════════════════════════════════════════════
    // Feature Flags Endpoints
    // ═══════════════════════════════════════════════════

    /**
     * GET /api/admin/feature-flags
     * List all registered feature flags (viewer+)
     */
    router.get('/feature-flags', async (req, res, next) => {
        try {
            const flags = await featureFlagService.getAllFlags();
            res.json({ success: true, flags });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/feature-flags
     * Register a new feature flag (editor+)
     */
    router.post('/feature-flags', requireRole('editor'), async (req, res, next) => {
        try {
            const { key, description, isEnabled, rules } = req.body;
            if (!key || typeof key !== 'string') {
                throw new ValidationError('Feature flag key is required and must be a string');
            }

            // Check if already exists
            const existing = await featureFlagService.db.prepare('SELECT key FROM feature_flags WHERE key = ?').get(key);
            if (existing) {
                throw new ValidationError(`Feature flag with key "${key}" already exists`);
            }

            const rulesStr = rules ? JSON.stringify(rules) : '{}';
            await featureFlagService.db.prepare(`
                INSERT INTO feature_flags (key, is_enabled, rules_json, description)
                VALUES (?, ?, ?, ?)
            `).run(key, isEnabled ? 1 : 0, rulesStr, description || '');

            res.status(201).json({
                success: true,
                message: `Feature flag "${key}" created successfully`,
                flag: { key, is_enabled: isEnabled ? 1 : 0, rules_json: rulesStr, description }
            });
        } catch (err) {
            next(err);
        }
    });

    /**
     * PUT /api/admin/feature-flags/:key
     * Update feature flag toggle state and target override rules (editor+)
     */
    router.put('/feature-flags/:key', requireRole('editor'), async (req, res, next) => {
        try {
            const key = req.params.key;
            const { is_enabled, rules } = req.body;

            const existing = await featureFlagService.db.prepare('SELECT key FROM feature_flags WHERE key = ?').get(key);
            if (!existing) {
                throw new ValidationError(`Feature flag "${key}" not found`);
            }

            // rules can be an object or a string
            const rulesObj = typeof rules === 'string' ? JSON.parse(rules) : (rules || {});

            await featureFlagService.setFlag(key, !!is_enabled, rulesObj);

            res.json({
                success: true,
                message: `Feature flag "${key}" updated successfully`
            });
        } catch (err) {
            next(err);
        }
    });

    /**
     * DELETE /api/admin/feature-flags/:key
     * Delete a feature flag (super_admin only)
     */
    router.delete('/feature-flags/:key', requireRole('super_admin'), async (req, res, next) => {
        try {
            const key = req.params.key;
            const result = await featureFlagService.db.prepare('DELETE FROM feature_flags WHERE key = ?').run(key);

            if (result.changes === 0) {
                throw new ValidationError(`Feature flag "${key}" not found`);
            }

            res.json({ success: true, message: `Feature flag "${key}" deleted successfully` });
        } catch (err) {
            next(err);
        }
    });

    // ═══════════════════════════════════════════════════
    // Ranking Formula Endpoints
    // ═══════════════════════════════════════════════════

    /**
     * GET /api/admin/ranking-formulas
     * List all formula configurations (viewer+)
     */
    router.get('/ranking-formulas', async (req, res, next) => {
        try {
            const formulas = await rankingVersionService.getAllFormulas();
            res.json({ success: true, formulas });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/ranking-formulas
     * Create or update a ranking formula weights configuration (editor+)
     */
    router.post('/ranking-formulas', requireRole('editor'), async (req, res, next) => {
        try {
            const { version_id, formula_name, weights, description } = req.body;

            if (!version_id || typeof version_id !== 'string') {
                throw new ValidationError('Version ID is required');
            }
            if (!formula_name || typeof formula_name !== 'string') {
                throw new ValidationError('Formula Name is required');
            }
            if (!weights || typeof weights !== 'object') {
                throw new ValidationError('Weights weights object is required');
            }

            // Validate weight metrics
            const requiredWeights = ['price', 'discount', 'stores', 'pop', 'spec'];
            for (const key of requiredWeights) {
                if (weights[key] === undefined || typeof weights[key] !== 'number' || weights[key] < 0 || weights[key] > 1) {
                    throw new ValidationError(`Weight "${key}" must be a number between 0 and 1`);
                }
            }

            const weightsStr = JSON.stringify(weights);

            // Insert or replace configuration
            await rankingVersionService.db.prepare(`
                INSERT INTO ranking_versions (version_id, formula_name, weights, is_active, description)
                VALUES (?, ?, ?, 0, ?)
                ON CONFLICT(version_id) DO UPDATE SET
                    formula_name = excluded.formula_name,
                    weights = excluded.weights,
                    description = excluded.description
            `).run(version_id, formula_name, weightsStr, description || '');

            res.json({
                success: true,
                message: `Ranking formula version "${version_id}" saved successfully`,
                formula: { version_id, formula_name, weights, description }
            });
        } catch (err) {
            next(err);
        }
    });

    /**
     * PUT /api/admin/ranking-formulas/:versionId/activate
     * Set a selected ranking formula version active (editor+)
     */
    router.put('/ranking-formulas/:versionId/activate', requireRole('editor'), async (req, res, next) => {
        try {
            const versionId = req.params.versionId;
            const updated = await rankingVersionService.setActiveFormula(versionId);

            res.json({
                success: true,
                message: `Ranking version "${versionId}" activated successfully.`,
                formula: updated
            });
        } catch (err) {
            next(err);
        }
    });

    /**
     * DELETE /api/admin/ranking-formulas/:versionId
     * Delete a ranking version config (super_admin only)
     */
    router.delete('/ranking-formulas/:versionId', requireRole('super_admin'), async (req, res, next) => {
        try {
            const versionId = req.params.versionId;

            // Check if active
            const target = await rankingVersionService.db.prepare('SELECT is_active FROM ranking_versions WHERE version_id = ?').get(versionId);
            if (!target) {
                throw new ValidationError(`Ranking version "${versionId}" not found`);
            }
            if (target.is_active === 1) {
                throw new ValidationError(`Cannot delete the active ranking version "${versionId}"`);
            }

            await rankingVersionService.db.prepare('DELETE FROM ranking_versions WHERE version_id = ?').run(versionId);
            res.json({ success: true, message: `Ranking version "${versionId}" deleted successfully` });
        } catch (err) {
            next(err);
        }
    });

    // ═══════════════════════════════════════════════════
    // Cache Management Endpoints
    // ═══════════════════════════════════════════════════

    /**
     * GET /api/admin/cache
     * Get statistics of memory cache and active keys registry (viewer+)
     */
    router.get('/cache', async (req, res, next) => {
        try {
            const stats = cacheService.getCacheStats();
            const keys = cacheService.getCacheKeys();
            res.json({ success: true, stats, keys });
        } catch (err) {
            next(err);
        }
    });

    /**
     * DELETE /api/admin/cache
     * Flush cache registry (flush all, single key, or regex pattern) (editor+)
     */
    router.delete('/cache', requireRole('editor'), async (req, res, next) => {
        try {
            const { key, pattern, all } = req.body;

            if (all === true) {
                cacheService.clearAll();
                return res.json({ success: true, message: 'Memory cache completely cleared' });
            }

            if (key) {
                const deleted = cacheService.delete(key);
                if (!deleted) {
                    throw new ValidationError(`Cache key "${key}" not found or already evicted`);
                }
                return res.json({ success: true, message: `Cache key "${key}" deleted successfully` });
            }

            if (pattern) {
                const count = cacheService.invalidatePattern(pattern);
                return res.json({ success: true, message: `Cache invalidation completed. Evicted ${count} matching keys.` });
            }

            throw new ValidationError('Must specify "all: true", "key", or "pattern" in the body');
        } catch (err) {
            next(err);
        }
    });

    return router;
}

module.exports = createConfigRoutes;

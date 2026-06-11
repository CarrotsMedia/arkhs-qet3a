/**
 * Admin Category Routes
 * =====================
 * Handles HTTP requests for managing categories, subcategories, keywords, and triggering reclassification.
 */

const express = require('express');
const { requireRole } = require('../middleware/adminAuth');
const { ValidationError } = require('../utils/errors');

function createCategoryRoutes(adminCategoryService, queueService, cacheService) {
    const router = express.Router();

    /**
     * GET /api/admin/categories
     * Lists all categories with metadata and product/subcategory counts (viewer+)
     */
    router.get('/categories', async (req, res, next) => {
        try {
            const categories = await adminCategoryService.getCategories();
            res.json({ success: true, categories });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/categories
     * Create a new top-level category (editor+)
     */
    router.post('/categories', requireRole('editor'), async (req, res, next) => {
        try {
            const category = await adminCategoryService.createCategory(req.body);
            cacheService.invalidatePattern('categories:*');
            res.json({ success: true, category });
        } catch (err) {
            next(err);
        }
    });

    /**
     * PUT /api/admin/categories/:id
     * Update category details (editor+)
     */
    router.put('/categories/:id', requireRole('editor'), async (req, res, next) => {
        try {
            const category = await adminCategoryService.updateCategory(parseInt(req.params.id), req.body);
            cacheService.invalidatePattern('categories:*');
            cacheService.invalidatePattern('discovery:*');
            res.json({ success: true, category });
        } catch (err) {
            next(err);
        }
    });

    /**
     * DELETE /api/admin/categories/:id
     * Soft-delete/deactivate a category (super_admin only)
     */
    router.delete('/categories/:id', requireRole('super_admin'), async (req, res, next) => {
        try {
            await adminCategoryService.deleteCategory(parseInt(req.params.id));
            cacheService.invalidatePattern('categories:*');
            cacheService.invalidatePattern('discovery:*');
            res.json({ success: true, message: 'Category deactivated successfully' });
        } catch (err) {
            next(err);
        }
    });

    /**
     * PUT /api/admin/categories/reorder
     * Reorder top-level categories (editor+)
     */
    router.put('/categories/reorder', requireRole('editor'), async (req, res, next) => {
        try {
            const { ids } = req.body;
            if (!ids || !Array.isArray(ids)) {
                throw new ValidationError('An array of IDs is required');
            }
            await adminCategoryService.reorderCategories(ids);
            cacheService.invalidatePattern('categories:*');
            res.json({ success: true, message: 'Categories reordered successfully' });
        } catch (err) {
            next(err);
        }
    });

    /**
     * GET /api/admin/categories/:id/subcategories
     * Lists subcategories under a specific category (viewer+)
     */
    router.get('/categories/:id/subcategories', async (req, res, next) => {
        try {
            const subcategories = await adminCategoryService.getSubcategories(parseInt(req.params.id));
            res.json({ success: true, subcategories });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/categories/:id/subcategories
     * Create a subcategory under a category (editor+)
     */
    router.post('/categories/:id/subcategories', requireRole('editor'), async (req, res, next) => {
        try {
            const subcategory = await adminCategoryService.createSubcategory(parseInt(req.params.id), req.body);
            cacheService.invalidatePattern('categories:*');
            res.json({ success: true, subcategory });
        } catch (err) {
            next(err);
        }
    });

    /**
     * PUT /api/admin/subcategories/:id
     * Update subcategory details (editor+)
     */
    router.put('/subcategories/:id', requireRole('editor'), async (req, res, next) => {
        try {
            const subcategory = await adminCategoryService.updateSubcategory(parseInt(req.params.id), req.body);
            cacheService.invalidatePattern('categories:*');
            cacheService.invalidatePattern('discovery:*');
            res.json({ success: true, subcategory });
        } catch (err) {
            next(err);
        }
    });

    /**
     * DELETE /api/admin/subcategories/:id
     * Soft-delete/deactivate a subcategory (super_admin only)
     */
    router.delete('/subcategories/:id', requireRole('super_admin'), async (req, res, next) => {
        try {
            await adminCategoryService.deleteSubcategory(parseInt(req.params.id));
            cacheService.invalidatePattern('categories:*');
            cacheService.invalidatePattern('discovery:*');
            res.json({ success: true, message: 'Subcategory deactivated successfully' });
        } catch (err) {
            next(err);
        }
    });

    /**
     * PUT /api/admin/subcategories/reorder
     * Reorder subcategories (editor+)
     */
    router.put('/subcategories/reorder', requireRole('editor'), async (req, res, next) => {
        try {
            const { ids } = req.body;
            if (!ids || !Array.isArray(ids)) {
                throw new ValidationError('An array of IDs is required');
            }
            await adminCategoryService.reorderSubcategories(ids);
            cacheService.invalidatePattern('categories:*');
            res.json({ success: true, message: 'Subcategories reordered successfully' });
        } catch (err) {
            next(err);
        }
    });

    /**
     * GET /api/admin/categories/:id/keywords
     * Lists classification keywords mapped under a specific category (viewer+)
     */
    router.get('/categories/:id/keywords', async (req, res, next) => {
        try {
            const keywords = await adminCategoryService.getKeywords(parseInt(req.params.id));
            res.json({ success: true, keywords });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/categories/keywords
     * Add a classification keyword mapping (editor+)
     */
    router.post('/categories/keywords', requireRole('editor'), async (req, res, next) => {
        try {
            const keyword = await adminCategoryService.addKeyword(req.body);
            res.json({ success: true, keyword });
        } catch (err) {
            next(err);
        }
    });

    /**
     * DELETE /api/admin/keywords/:id
     * Remove a classification keyword mapping (editor+)
     */
    router.delete('/keywords/:id', requireRole('editor'), async (req, res, next) => {
        try {
            await adminCategoryService.deleteKeyword(parseInt(req.params.id));
            res.json({ success: true, message: 'Keyword deleted successfully' });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/categories/reclassify
     * Triggers a background job to run the product classification script (super_admin only)
     */
    router.post('/categories/reclassify', requireRole('super_admin'), async (req, res, next) => {
        try {
            const job = await queueService.enqueue('reclassify_products', {});
            res.json({ 
                success: true, 
                message: 'Product reclassification background job enqueued', 
                job 
            });
        } catch (err) {
            next(err);
        }
    });

    return router;
}

module.exports = createCategoryRoutes;

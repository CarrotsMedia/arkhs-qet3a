/**
 * Admin Product Routes
 * ====================
 * Handles HTTP requests for managing products, variants, specs, rank overrides, and bulk moves/deletions.
 */

const express = require('express');
const { requireRole } = require('../middleware/adminAuth');
const { ValidationError } = require('../utils/errors');

function createProductRoutes(adminProductService, cacheService) {
    const router = express.Router();

    /**
     * GET /api/admin/brands
     * Get list of all brands (viewer+)
     */
    router.get('/brands', async (req, res, next) => {
        try {
            const brands = await adminProductService.getBrands();
            res.json({ success: true, brands });
        } catch (err) {
            next(err);
        }
    });

    /**
     * GET /api/admin/products/attributes/:subcategoryId
     * Get attribute definitions for a subcategory (viewer+)
     */
    router.get('/products/attributes/:subcategoryId', async (req, res, next) => {
        try {
            const subcategoryId = parseInt(req.params.subcategoryId, 10);
            if (isNaN(subcategoryId)) {
                throw new ValidationError('Invalid subcategory ID');
            }
            const attributes = await adminProductService.getAttributeDefinitions(subcategoryId);
            res.json({ success: true, attributes });
        } catch (err) {
            next(err);
        }
    });

    /**
     * GET /api/admin/products
     * Paginated products list with advanced filters (viewer+)
     */
    router.get('/products', async (req, res, next) => {
        try {
            const {
                brand_id,
                category_id,
                subcategory_id,
                is_deleted,
                stock_status,
                min_price,
                max_price,
                search,
                is_featured,
                is_trending,
                sort,
                page,
                limit
            } = req.query;

            const filters = {
                brand_id: brand_id ? parseInt(brand_id, 10) : undefined,
                category_id: category_id ? parseInt(category_id, 10) : undefined,
                subcategory_id: subcategory_id ? parseInt(subcategory_id, 10) : undefined,
                is_deleted: is_deleted !== undefined ? is_deleted : undefined,
                stock_status: stock_status || undefined,
                min_price: min_price ? parseFloat(min_price) : undefined,
                max_price: max_price ? parseFloat(max_price) : undefined,
                search: search || undefined,
                is_featured: is_featured !== undefined ? is_featured : undefined,
                is_trending: is_trending !== undefined ? is_trending : undefined,
                sort: sort || undefined
            };

            const result = await adminProductService.getProducts(filters, page, limit);
            res.json({
                success: true,
                products: result.products,
                pagination: result.pagination
            });
        } catch (err) {
            next(err);
        }
    });

    /**
     * GET /api/admin/products/:id
     * Get details of a single product family including variants, specs, and offers (viewer+)
     */
    router.get('/products/:id', async (req, res, next) => {
        try {
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                throw new ValidationError('Invalid product ID');
            }
            const product = await adminProductService.getProductById(id);
            res.json({ success: true, product });
        } catch (err) {
            next(err);
        }
    });

    /**
     * PUT /api/admin/products/:id
     * Update product details (editor+)
     */
    router.put('/products/:id', requireRole('editor'), async (req, res, next) => {
        try {
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                throw new ValidationError('Invalid product ID');
            }
            const product = await adminProductService.updateProduct(id, req.body);
            
            // Invalidate product and discovery cache
            cacheService.invalidatePattern('products:*');
            cacheService.invalidatePattern('discovery:*');
            
            res.json({ success: true, product });
        } catch (err) {
            next(err);
        }
    });

    /**
     * PUT /api/admin/products/:id/variants/:variantId/attributes
     * Update specification attributes for a variant (editor+)
     */
    router.put('/products/:id/variants/:variantId/attributes', requireRole('editor'), async (req, res, next) => {
        try {
            const id = parseInt(req.params.id, 10);
            const variantId = parseInt(req.params.variantId, 10);
            if (isNaN(id) || isNaN(variantId)) {
                throw new ValidationError('Invalid product or variant ID');
            }
            const { attributes } = req.body;
            if (!attributes || !Array.isArray(attributes)) {
                throw new ValidationError('Attributes array is required');
            }

            await adminProductService.updateVariantAttributes(variantId, attributes);
            
            // Invalidate product cache
            cacheService.invalidatePattern('products:*');
            cacheService.invalidatePattern('discovery:*');

            res.json({ success: true, message: 'Variant specifications updated successfully' });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/products/:id/soft-delete
     * Soft-delete a product family (editor+)
     */
    router.post('/products/:id/soft-delete', requireRole('editor'), async (req, res, next) => {
        try {
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                throw new ValidationError('Invalid product ID');
            }
            await adminProductService.softDeleteProduct(id);

            // Invalidate cache
            cacheService.invalidatePattern('products:*');
            cacheService.invalidatePattern('discovery:*');

            res.json({ success: true, message: 'Product soft-deleted successfully' });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/products/:id/restore
     * Restore a soft-deleted product family (editor+)
     */
    router.post('/products/:id/restore', requireRole('editor'), async (req, res, next) => {
        try {
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                throw new ValidationError('Invalid product ID');
            }
            await adminProductService.restoreProduct(id);

            // Invalidate cache
            cacheService.invalidatePattern('products:*');
            cacheService.invalidatePattern('discovery:*');

            res.json({ success: true, message: 'Product restored successfully' });
        } catch (err) {
            next(err);
        }
    });

    /**
     * PUT /api/admin/products/:id/rank-override
     * Override product's manual rank (editor+)
     */
    router.put('/products/:id/rank-override', requireRole('editor'), async (req, res, next) => {
        try {
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                throw new ValidationError('Invalid product ID');
            }
            const { manual_rank_override } = req.body;
            const product = await adminProductService.updateRankOverride(id, manual_rank_override);

            // Invalidate cache
            cacheService.invalidatePattern('products:*');
            cacheService.invalidatePattern('discovery:*');

            res.json({ success: true, product });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/products/bulk
     * Perform bulk actions on multiple products (editor+)
     */
    router.post('/products/bulk', requireRole('editor'), async (req, res, next) => {
        try {
            const { action, ids, subcategoryId } = req.body;
            if (!ids || !Array.isArray(ids) || ids.length === 0) {
                throw new ValidationError('An array of product IDs is required');
            }

            if (ids.length > 100) {
                throw new ValidationError('Bulk actions are limited to a maximum of 100 items per request');
            }

            switch (action) {
                case 'delete':
                    await adminProductService.bulkDelete(ids);
                    break;
                case 'restore':
                    await adminProductService.bulkRestore(ids);
                    break;
                case 'move':
                    if (!subcategoryId) {
                        throw new ValidationError('subcategoryId is required for move action');
                    }
                    await adminProductService.bulkMoveCategory(ids, parseInt(subcategoryId, 10));
                    break;
                default:
                    throw new ValidationError(`Unknown bulk action: ${action}`);
            }

            // Invalidate cache
            cacheService.invalidatePattern('products:*');
            cacheService.invalidatePattern('discovery:*');

            res.json({ success: true, message: `Bulk operation '${action}' executed successfully on ${ids.length} items` });
        } catch (err) {
            next(err);
        }
    });

    /**
     * PUT /api/admin/offers/:offerId/url
     * Update a store offer's URL (editor+)
     */
    router.put('/offers/:offerId/url', requireRole('editor'), async (req, res, next) => {
        try {
            const offerId = parseInt(req.params.offerId, 10);
            if (isNaN(offerId)) {
                throw new ValidationError('Invalid offer ID');
            }
            const { productUrl } = req.body;
            await adminProductService.updateOfferUrl(offerId, productUrl);
            
            // Invalidate cache
            cacheService.invalidatePattern('products:*');
            cacheService.invalidatePattern('discovery:*');

            res.json({ success: true, message: 'Offer URL updated successfully' });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/products/:id/variants
     * Create a new variant for product (editor+)
     */
    router.post('/products/:id/variants', requireRole('editor'), async (req, res, next) => {
        try {
            const familyId = parseInt(req.params.id, 10);
            if (isNaN(familyId)) {
                throw new ValidationError('Invalid product ID');
            }
            const variantId = await adminProductService.createVariant(familyId, req.body);
            cacheService.invalidatePattern('products:*');
            cacheService.invalidatePattern('discovery:*');
            res.json({ success: true, message: 'Variant created successfully', variantId });
        } catch (err) {
            next(err);
        }
    });

    /**
     * PUT /api/admin/products/:id/variants/:variantId
     * Update variant specs (editor+)
     */
    router.put('/products/:id/variants/:variantId', requireRole('editor'), async (req, res, next) => {
        try {
            const familyId = parseInt(req.params.id, 10);
            const variantId = parseInt(req.params.variantId, 10);
            if (isNaN(familyId) || isNaN(variantId)) {
                throw new ValidationError('Invalid product or variant ID');
            }
            await adminProductService.updateVariant(familyId, variantId, req.body);
            cacheService.invalidatePattern('products:*');
            cacheService.invalidatePattern('discovery:*');
            res.json({ success: true, message: 'Variant specifications updated successfully' });
        } catch (err) {
            next(err);
        }
    });

    /**
     * DELETE /api/admin/products/:id/variants/:variantId
     * Delete variant and soft-delete linked offers (editor+)
     */
    router.delete('/products/:id/variants/:variantId', requireRole('editor'), async (req, res, next) => {
        try {
            const familyId = parseInt(req.params.id, 10);
            const variantId = parseInt(req.params.variantId, 10);
            if (isNaN(familyId) || isNaN(variantId)) {
                throw new ValidationError('Invalid product or variant ID');
            }
            await adminProductService.deleteVariant(familyId, variantId);
            cacheService.invalidatePattern('products:*');
            cacheService.invalidatePattern('discovery:*');
            res.json({ success: true, message: 'Variant deleted successfully' });
        } catch (err) {
            next(err);
        }
    });

    /**
     * PUT /api/admin/offers/:offerId
     * Update store offer attributes (editor+)
     */
    router.put('/offers/:offerId', requireRole('editor'), async (req, res, next) => {
        try {
            const offerId = parseInt(req.params.offerId, 10);
            if (isNaN(offerId)) {
                throw new ValidationError('Invalid offer ID');
            }
            await adminProductService.updateOffer(offerId, req.body);
            cacheService.invalidatePattern('products:*');
            cacheService.invalidatePattern('discovery:*');
            res.json({ success: true, message: 'Offer updated successfully' });
        } catch (err) {
            next(err);
        }
    });

    /**
     * DELETE /api/admin/offers/:offerId
     * Soft-delete a store offer (editor+)
     */
    router.delete('/offers/:offerId', requireRole('editor'), async (req, res, next) => {
        try {
            const offerId = parseInt(req.params.offerId, 10);
            if (isNaN(offerId)) {
                throw new ValidationError('Invalid offer ID');
            }
            await adminProductService.deleteOffer(offerId);
            cacheService.invalidatePattern('products:*');
            cacheService.invalidatePattern('discovery:*');
            res.json({ success: true, message: 'Offer soft-deleted successfully' });
        } catch (err) {
            next(err);
        }
    });

    return router;
}

module.exports = createProductRoutes;

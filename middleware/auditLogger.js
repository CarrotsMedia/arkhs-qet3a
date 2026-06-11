/**
 * Admin Audit Logger Middleware
 * =============================
 * Automatically logs successful state-changing admin actions to the database.
 */

/**
 * Helper to parse resource type and resource ID from path
 * Example: /api/admin/products/123 -> { resourceType: 'product', resourceId: '123' }
 */
function parseResource(path) {
    const parts = path.split('/').filter(Boolean);
    // Path structure: api, admin, [resourceType], [resourceId/action], ...
    if (parts.length >= 3 && parts[0] === 'api' && parts[1] === 'admin') {
        const resourceType = parts[2];
        const resourceId = parts[3] || null;
        
        // Singularize common resource types for clean logging
        const singularMap = {
            products: 'product',
            categories: 'category',
            subcategories: 'subcategory',
            stores: 'store',
            users: 'user',
            'ranking-versions': 'ranking_formula',
            'feature-flags': 'feature_flag'
        };

        return {
            resourceType: singularMap[resourceType] || resourceType,
            resourceId: resourceId
        };
    }
    return { resourceType: null, resourceId: null };
}

/**
 * Helper to sanitize request body (remove passwords and sensitive config keys)
 */
function sanitizeBody(body) {
    if (!body || typeof body !== 'object') return body;
    
    const sanitized = { ...body };
    const sensitiveKeys = ['password', 'currentPassword', 'newPassword', 'salt', 'token', 'secret'];
    
    for (const key of sensitiveKeys) {
        if (key in sanitized) {
            sanitized[key] = '[REDACTED]';
        }
    }
    return sanitized;
}

/**
 * Creates audit logging middleware.
 * @param {AuthService} authService 
 */
function auditLogger(authService) {
    return (req, res, next) => {
        // Only log state-changing methods
        const stateChangingMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
        if (!stateChangingMethods.includes(req.method)) {
            return next();
        }

        // We capture metadata before the request runs (in case it modifies req.params/body)
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const { resourceType, resourceId } = parseResource(req.originalUrl || req.url);
        const action = `${req.method} ${req.originalUrl || req.url}`;
        const details = {
            query: req.query,
            body: sanitizeBody(req.body)
        };

        // Listen for request completion
        res.on('finish', () => {
            // Only log successful actions (status code < 400)
            if (res.statusCode < 400 && req.admin) {
                try {
                    authService.logAction(
                        req.admin.id,
                        action,
                        resourceType,
                        resourceId,
                        details,
                        ipAddress
                    );
                } catch (err) {
                    console.error('Failed to write admin audit log:', err);
                }
            }
        });

        next();
    };
}

module.exports = auditLogger;

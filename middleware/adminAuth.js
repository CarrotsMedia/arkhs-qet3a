/**
 * Admin Authentication and Authorization Middleware
 * =================================================
 * Verifies admin sessions, checks role hierarchy, and implements CSRF protection.
 */

const { AuthenticationError, AuthorizationError, ValidationError } = require('../utils/errors');
const crypto = require('crypto');

// Utility to parse cookies manually (avoiding strict dependency on cookie-parser)
function parseCookies(cookieHeader) {
    const list = {};
    if (!cookieHeader) return list;
    cookieHeader.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        const key = parts.shift().trim();
        if (key) {
            list[key] = decodeURIComponent(parts.join('='));
        }
    });
    return list;
}

/**
 * Creates session loading middleware.
 * Should be mounted early on all admin-related routes.
 */
function adminSession(authService) {
    return (req, res, next) => {
        try {
            const cookies = parseCookies(req.headers.cookie);
            const sid = cookies.admin_sid;

            if (sid) {
                const admin = authService.validateSession(sid);
                if (admin) {
                    req.admin = admin;
                    req.sessionToken = sid;
                }
            }
            next();
        } catch (err) {
            next(err);
        }
    };
}

/**
 * Middleware to require a valid authenticated admin user.
 */
function requireAuth(req, res, next) {
    if (!req.admin) {
        return next(new AuthenticationError('Authentication required. Please log in.'));
    }
    next();
}

const ROLE_HIERARCHY = {
    super_admin: 3,
    editor: 2,
    viewer: 1
};

function hasRole(userRole, requiredRole) {
    const userLevel = ROLE_HIERARCHY[userRole] || 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
    return userLevel >= requiredLevel;
}

/**
 * Middleware to require a minimum role level.
 * @param {string} requiredRole - 'super_admin', 'editor', or 'viewer'
 */
function requireRole(requiredRole) {
    return (req, res, next) => {
        if (!req.admin) {
            return next(new AuthenticationError('Authentication required.'));
        }
        if (!hasRole(req.admin.role, requiredRole)) {
            return next(new AuthorizationError(`Requires minimum role: ${requiredRole}`));
        }
        next();
    };
}

/**
 * CSRF Protection Middleware (Double-Submit Cookie Pattern)
 * JS frontend reads 'XSRF-TOKEN' cookie and sends it back in 'x-xsrf-token' header.
 */
function csrfProtection(req, res, next) {
    // 1. Safe methods and login endpoint do not require validation
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method) || req.path === '/login') {
        const cookies = parseCookies(req.headers.cookie);
        let csrfToken = cookies['XSRF-TOKEN'];

        // Generate token if not exists
        if (!csrfToken) {
            csrfToken = crypto.randomBytes(24).toString('hex');
            // HttpOnly = false, so javascript can read it to send in headers
            res.cookie('XSRF-TOKEN', csrfToken, {
                path: '/',
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax'
            });
        }
        return next();
    }

    // 2. State-changing methods require validation
    const cookies = parseCookies(req.headers.cookie);
    const cookieToken = cookies['XSRF-TOKEN'];
    const headerToken = req.headers['x-xsrf-token'];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        return next(new ValidationError('CSRF token validation failed', {
            cookieTokenPresent: !!cookieToken,
            headerTokenPresent: !!headerToken
        }));
    }

    next();
}

module.exports = {
    adminSession,
    requireAuth,
    requireRole,
    csrfProtection
};

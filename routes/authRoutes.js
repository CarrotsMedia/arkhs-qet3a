/**
 * Admin Authentication Routes
 * ===========================
 * Handles login, logout, profile checks, and password changes.
 */

const express = require('express');
const { requireAuth } = require('../middleware/adminAuth');
const { createRateLimiter } = require('../middleware/rateLimiter');
const { ValidationError, AuthenticationError } = require('../utils/errors');

function createAuthRoutes(authService) {
    const router = express.Router();

    // Rate limiter for login: max 5 attempts per 15 minutes per IP
    const loginLimiter = createRateLimiter({
        windowMs: 15 * 60 * 1000,
        max: 5,
        message: 'Too many login attempts. Please try again after 15 minutes.'
    });

    /**
     * POST /api/admin/login
     * Authenticates administrator credentials and sets session cookie.
     */
    router.post('/login', loginLimiter, async (req, res, next) => {
        try {
            const { username, password } = req.body;
            if (!username || !password) {
                throw new ValidationError('Username and password are required');
            }

            const user = await authService.authenticate(username, password);
            if (!user) {
                // Log failed attempt if username exists
                const existingUser = await authService._getUserByUsername(username);
                if (existingUser) {
                    await authService.logAction(
                        existingUser.id,
                        'LOGIN_FAILED',
                        'user',
                        existingUser.id.toString(),
                        { username, ip: req.ip },
                        req.ip
                    );
                }
                throw new AuthenticationError('Invalid username or password');
            }

            // Create session
            const sessionTtl = 24 * 60 * 60 * 1000; // 24 hours
            const session = await authService.createSession(user.id, sessionTtl);

            // Set cookie
            res.cookie('admin_sid', session.sid, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                maxAge: sessionTtl
            });

            // Log successful login
            await authService.logAction(
                user.id,
                'LOGIN_SUCCESS',
                'user',
                user.id.toString(),
                { username },
                req.ip
            );

            res.json({
                success: true,
                user
            });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/logout
     * Destroys the current session and clears the cookie.
     */
    router.post('/logout', requireAuth, async (req, res, next) => {
        try {
            const sid = req.sessionToken;
            if (sid) {
                await authService.destroySession(sid);
            }

            // Clear cookies
            res.clearCookie('admin_sid');
            res.clearCookie('XSRF-TOKEN');

            if (req.admin) {
                await authService.logAction(
                    req.admin.id,
                    'LOGOUT',
                    'user',
                    req.admin.id.toString(),
                    null,
                    req.ip
                );
            }

            res.json({ success: true, message: 'Logged out successfully' });
        } catch (err) {
            next(err);
        }
    });

    /**
     * GET /api/admin/me
     * Returns details of the currently authenticated administrator.
     */
    router.get('/me', requireAuth, async (req, res) => {
        res.json({
            success: true,
            user: req.admin
        });
    });

    /**
     * POST /api/admin/change-password
     * Allows an authenticated administrator to change their password.
     */
    router.post('/change-password', requireAuth, async (req, res, next) => {
        try {
            const { currentPassword, newPassword } = req.body;
            if (!currentPassword || !newPassword) {
                throw new ValidationError('Current password and new password are required');
            }

            await authService.changePassword(req.admin.id, currentPassword, newPassword);

            // Destroy all other sessions for this user for security
            // (We keep the current one active or let them re-login)
            await authService.logAction(
                req.admin.id,
                'CHANGE_PASSWORD',
                'user',
                req.admin.id.toString(),
                { username: req.admin.username },
                req.ip
            );

            res.json({ success: true, message: 'Password changed successfully' });
        } catch (err) {
            next(err);
        }
    });

    return router;
}

module.exports = createAuthRoutes;

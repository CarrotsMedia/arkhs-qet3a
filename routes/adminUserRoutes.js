/**
 * Admin Users & RBAC Management Routes
 * ====================================
 * Mounts endpoints for listing users, creating admin accounts, editing roles,
 * toggling active status, and retrieving audit logs.
 */

const express = require('express');
const { requireRole } = require('../middleware/adminAuth');
const { ValidationError, UnauthorizedError } = require('../utils/errors');

function createAdminUserRoutes(authService) {
    const router = express.Router();

    // ═══════════════════════════════════════════════════
    // User & RBAC Management
    // ═══════════════════════════════════════════════════

    /**
     * GET /api/admin/users
     * Retrieve list of all administrators (viewer+)
     */
    router.get('/users', async (req, res, next) => {
        try {
            const users = await authService.getAllUsers();
            res.json({ success: true, users });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/users
     * Create a new administrator account (super_admin only)
     */
    router.post('/users', requireRole('super_admin'), async (req, res, next) => {
        try {
            const { username, password, role, display_name } = req.body;

            if (!username || !password || !role) {
                throw new ValidationError('Username, password and role are required');
            }

            const existing = await authService._getUserByUsername(username);
            if (existing) {
                throw new ValidationError(`Username "${username}" is already taken`);
            }

            const newUser = await authService.createUser(username, password, role, display_name);
            res.status(201).json({
                success: true,
                message: `Administrator "${username}" created successfully`,
                user: newUser
            });
        } catch (err) {
            next(err);
        }
    });

    /**
     * PUT /api/admin/users/:id
     * Update administrator details: display name, role, active status (super_admin only)
     */
    router.put('/users/:id', requireRole('super_admin'), async (req, res, next) => {
        try {
            const targetId = parseInt(req.params.id);
            const { display_name, role, is_active } = req.body;

            if (isNaN(targetId)) {
                throw new ValidationError('Invalid user ID');
            }

            // Self-action check: Cannot deactivate or change own role
            if (targetId === req.admin.id) {
                if (is_active !== undefined && !is_active) {
                    throw new ValidationError('Lockout Protection: You cannot disable your own administrator account');
                }
                if (role !== undefined && role !== req.admin.role) {
                    throw new ValidationError('Lockout Protection: You cannot change your own administrator role');
                }
            }

            const updated = await authService.updateUser(targetId, {
                display_name,
                role,
                is_active
            });

            res.json({
                success: true,
                message: `User details updated successfully`,
                user: updated
            });
        } catch (err) {
            next(err);
        }
    });

    /**
     * DELETE /api/admin/users/:id
     * Delete an administrator account (super_admin only)
     */
    router.delete('/users/:id', requireRole('super_admin'), async (req, res, next) => {
        try {
            const targetId = parseInt(req.params.id);

            if (isNaN(targetId)) {
                throw new ValidationError('Invalid user ID');
            }

            // Prevent self-deletion
            if (targetId === req.admin.id) {
                throw new ValidationError('Lockout Protection: You cannot delete your own administrator account');
            }

            const deleted = await authService.deleteUser(targetId);
            if (!deleted) {
                throw new ValidationError('User account not found or already deleted');
            }

            res.json({
                success: true,
                message: 'Administrator account deleted successfully'
            });
        } catch (err) {
            next(err);
        }
    });

    // ═══════════════════════════════════════════════════
    // Audit Logs Retrieval
    // ═══════════════════════════════════════════════════

    /**
     * GET /api/admin/audit-logs
     * Paginated retrieval of recent administrative state-changing logs (viewer+)
     */
    router.get('/audit-logs', async (req, res, next) => {
        try {
            const limit = req.query.limit ? parseInt(req.query.limit) : 50;
            const offset = req.query.offset ? parseInt(req.query.offset) : 0;

            const logs = await authService.getAuditLog(limit, offset);
            res.json({ success: true, logs });
        } catch (err) {
            next(err);
        }
    });

    return router;
}

module.exports = createAdminUserRoutes;

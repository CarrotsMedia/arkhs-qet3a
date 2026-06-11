/**
 * Admin Database Routes
 * =====================
 * Mounts endpoints for triggering backups, restores, deletion, SQLite compaction,
 * entity cleanup, and bulk CSV/JSON imports/exports.
 */

const express = require('express');
const { requireRole } = require('../middleware/adminAuth');
const { ValidationError } = require('../utils/errors');

function createDbRoutes(adminDbService) {
    const router = express.Router();

    /**
     * GET /api/admin/database/backups
     * Lists all database backup files in backups/ directory (viewer+)
     */
    router.get('/database/backups', async (req, res, next) => {
        try {
            const backups = await adminDbService.listBackups();
            res.json({ success: true, backups });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/database/backups
     * Triggers a new asynchronous database backup file (editor+)
     */
    router.post('/database/backups', requireRole('editor'), async (req, res, next) => {
        try {
            const backup = await adminDbService.backupDatabase();
            res.json({ success: true, message: 'Backup created successfully', backup });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/database/backups/:filename/restore
     * Restores database from a selected backup file online (super_admin only)
     */
    router.post('/database/backups/:filename/restore', requireRole('super_admin'), async (req, res, next) => {
        try {
            const result = await adminDbService.restoreDatabase(req.params.filename);
            res.json({ success: true, message: result.message });
        } catch (err) {
            next(err);
        }
    });

    /**
     * DELETE /api/admin/database/backups/:filename
     * Deletes a backup file from directory (super_admin only)
     */
    router.delete('/database/backups/:filename', requireRole('super_admin'), async (req, res, next) => {
        try {
            await adminDbService.deleteBackup(req.params.filename);
            res.json({ success: true, message: 'Backup deleted successfully' });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/database/vacuum
     * Compacts database and runs SQLite defragmentation (editor+)
     */
    router.post('/database/vacuum', requireRole('editor'), async (req, res, next) => {
        try {
            const stats = await adminDbService.vacuumDatabase();
            res.json({ success: true, message: 'Database vacuum completed successfully', stats });
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/database/cleanup
     * Deletes orphaned product variants and store offers (editor+)
     */
    router.post('/database/cleanup', requireRole('editor'), async (req, res, next) => {
        try {
            const stats = await adminDbService.cleanupOrphans();
            res.json({ 
                success: true, 
                message: `Cleaned up ${stats.deletedVariants} orphaned variants and ${stats.deletedOffers} orphaned offers.`,
                stats 
            });
        } catch (err) {
            next(err);
        }
    });

    /**
     * GET /api/admin/database/export/:table
     * Export database table in CSV or JSON format (viewer+)
     */
    router.get('/database/export/:table', async (req, res, next) => {
        try {
            const format = req.query.format || 'json';
            const table = req.params.table;

            const content = await adminDbService.exportTable(table, format);

            if (format === 'csv') {
                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', `attachment; filename=export_${table}.csv`);
                return res.send(content);
            } else {
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Content-Disposition', `attachment; filename=export_${table}.json`);
                return res.send(content);
            }
        } catch (err) {
            next(err);
        }
    });

    /**
     * POST /api/admin/database/import/:table
     * Import a CSV or JSON payload into the database table (editor+)
     */
    router.post('/database/import/:table', requireRole('editor'), async (req, res, next) => {
        try {
            const table = req.params.table;
            const { rawData, format, strategy } = req.body;

            if (!rawData) {
                throw new ValidationError('Import data (rawData) is required');
            }

            const count = await adminDbService.importTable(table, rawData, format || 'json', strategy || 'upsert');
            res.json({ success: true, message: `Successfully imported ${count} rows into table ${table}.` });
        } catch (err) {
            next(err);
        }
    });

    return router;
}

module.exports = createDbRoutes;

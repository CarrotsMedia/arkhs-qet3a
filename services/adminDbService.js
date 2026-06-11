/**
 * Admin Database Service
 * ======================
 * Handles administrative functions for database backups, restores, compaction,
 * orphaned cleanup, and CSV/JSON imports and exports.
 */

const { ValidationError, NotFoundError } = require('../utils/errors');
const fs = require('fs');
const path = require('path');
const Database = require('./db');

class AdminDbService {
    constructor(db) {
        this.db = db;
        this.backupsDir = path.join(__dirname, '../backups');
        this.ensureBackupsDirectory();
    }

    /**
     * Create the backups directory if it does not exist
     */
    async ensureBackupsDirectory() {
        if (!fs.existsSync(this.backupsDir)) {
            fs.mkdirSync(this.backupsDir, { recursive: true });
        }
    }

    /**
     * Get path of the main active database file
     */
    async getActiveDbPath() {
        try {
            const dbList = this.db.pragma('database_list');
            if (dbList && dbList.length > 0 && dbList[0].file) {
                return dbList[0].file;
            }
        } catch (err) {
            console.error('Failed to get database list pragma:', err);
        }
        return path.resolve(__dirname, '../database.db');
    }

    /**
     * Asynchronously backs up the database to backups/ folder
     */
    async backupDatabase() {
        const pad = (n) => String(n).padStart(2, '0');
        const date = new Date();
        const timestamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
        const filename = `backup_${timestamp}.db`;
        const backupPath = path.join(this.backupsDir, filename);

        // Run backup asynchronously using better-sqlite3 backup API
        await this.db.backup(backupPath);

        const stat = fs.statSync(backupPath);
        return {
            filename,
            sizeBytes: stat.size,
            createdAt: stat.birthtime || stat.mtime
        };
    }

    /**
     * Lists all backup files in backups/ directory
     */
    async listBackups() {
        await this.ensureBackupsDirectory();
        const files = fs.readdirSync(this.backupsDir);
        const backups = [];

        files.forEach(file => {
            if (file.startsWith('backup_') && file.endsWith('.db')) {
                const filePath = path.join(this.backupsDir, file);
                try {
                    const stat = fs.statSync(filePath);
                    backups.push({
                        filename: file,
                        sizeBytes: stat.size,
                        createdAt: stat.birthtime || stat.mtime
                    });
                } catch (e) {
                    // Ignore inaccessible files
                }
            }
        });

        // Sort backups by date descending
        return backups.sort((a, b) => b.createdAt - a.createdAt);
    }

    /**
     * Restores database from a selected backup file
     */
    async restoreDatabase(filename) {
        // Sanitize filename to avoid path traversal
        const cleanFilename = path.basename(filename);
        const backupPath = path.join(this.backupsDir, cleanFilename);

        if (!fs.existsSync(backupPath)) {
            throw new NotFoundError(`Backup file "${cleanFilename}" not found`);
        }

        const activeDbPath = await this.getActiveDbPath();

        // Open backup DB in read-only mode and backup online into main active DB
        let backupDb;
        try {
            backupDb = new Database(backupPath, { readonly: true, timeout: 10000 });
            await backupDb.backup(activeDbPath);
            return { success: true, message: `Database successfully restored from ${cleanFilename}` };
        } catch (err) {
            console.error('Database restore failed:', err);
            throw new ValidationError(`Database restore failed: ${err.message}`);
        } finally {
            if (backupDb) {
                backupDb.close();
            }
        }
    }

    /**
     * Deletes a backup file from backups/ folder
     */
    async deleteBackup(filename) {
        const cleanFilename = path.basename(filename);
        const backupPath = path.join(this.backupsDir, cleanFilename);

        if (!fs.existsSync(backupPath)) {
            throw new NotFoundError(`Backup file "${cleanFilename}" not found`);
        }

        fs.unlinkSync(backupPath);
        return { success: true };
    }

    /**
     * Triggers database VACUUM compaction to release unused pages
     */
    async vacuumDatabase() {
        const activeDbPath = await this.getActiveDbPath();
        let sizeBefore = 0;
        const isPostgres = activeDbPath.startsWith('postgres') || activeDbPath.includes('localhost');
        
        try {
            if (isPostgres) {
                const row = await this.db.prepare("SELECT pg_database_size(current_database()) AS size").get();
                sizeBefore = parseInt(row.size, 10);
            } else {
                sizeBefore = fs.statSync(activeDbPath).size;
            }
        } catch (e) {
            console.error('Error getting size before vacuum:', e);
        }

        // Run VACUUM
        await this.db.prepare('VACUUM').run();

        let sizeAfter = 0;
        try {
            if (isPostgres) {
                const row = await this.db.prepare("SELECT pg_database_size(current_database()) AS size").get();
                sizeAfter = parseInt(row.size, 10);
            } else {
                sizeAfter = fs.statSync(activeDbPath).size;
            }
        } catch (e) {
            console.error('Error getting size after vacuum:', e);
        }

        const sizeBeforeMb = (sizeBefore / 1024 / 1024).toFixed(2);
        const sizeAfterMb = (sizeAfter / 1024 / 1024).toFixed(2);
        const savingsMb = ((sizeBefore - sizeAfter) / 1024 / 1024).toFixed(2);

        return {
            sizeBeforeMb,
            sizeAfterMb,
            savingsMb
        };
    }

    /**
     * Cleans up orphaned product variants and store offers
     */
    async cleanupOrphans() {
        const runCleanup = this.db.transaction(async () => {
            const variantsResult = await this.db.prepare(`
                DELETE FROM product_variants 
                WHERE family_id NOT IN (SELECT id FROM product_families)
            `).run();

            const offersResult = await this.db.prepare(`
                DELETE FROM store_offers 
                WHERE variant_id NOT IN (SELECT id FROM product_variants)
                  AND variant_id IS NOT NULL
            `).run();

            return {
                deletedVariants: variantsResult.changes,
                deletedOffers: offersResult.changes
            };
        });

        return await runCleanup();
    }

    /**
     * Export a table as CSV or JSON format
     */
    async exportTable(tableName, format = 'json') {
        const allowedTables = [
            'categories', 'subcategories', 'brands', 'products', 'stores',
            'store_offers', 'product_attributes', 'product_attribute_values',
            'category_keywords'
        ];
        if (!allowedTables.includes(tableName)) {
            throw new ValidationError(`Table "${tableName}" is not allowed for export`);
        }

        const rows = await this.db.prepare(`SELECT * FROM ${tableName}`).all();

        if (format === 'csv') {
            return await this.formatCSV(rows);
        } else {
            return JSON.stringify(rows, null, 2);
        }
    }

    /**
     * Import a CSV or JSON payload into target table
     */
    async importTable(tableName, rawData, format = 'json', strategy = 'upsert') {
        let rows = [];

        if (format === 'csv') {
            rows = await this.parseCSV(rawData);
        } else {
            try {
                rows = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
            } catch (e) {
                throw new ValidationError('Invalid JSON payload provided');
            }
        }

        if (!Array.isArray(rows) || rows.length === 0) {
            throw new ValidationError('Import data is empty or not a valid list');
        }

        const allowedTables = [
            'categories', 'subcategories', 'brands', 'products', 'stores',
            'store_offers', 'product_attributes', 'product_attribute_values',
            'category_keywords'
        ];
        if (!allowedTables.includes(tableName)) {
            throw new ValidationError(`Table "${tableName}" is not allowed for import`);
        }

        const runImport = this.db.transaction(async () => {
            if (strategy === 'replace') {
                await this.db.prepare(`DELETE FROM ${tableName}`).run();
            }

            // Get database columns
            const columns = await this.db.prepare(`PRAGMA table_info(${tableName})`).all().map(c => c.name);
            const headers = Object.keys(rows[0]).filter(k => columns.includes(k));

            if (headers.length === 0) {
                throw new ValidationError(`Headers do not match any columns in table "${tableName}"`);
            }

            const placeholders = headers.map(() => '?').join(',');
            
            // Build PostgreSQL-compatible insert/upsert query
            let sql = `INSERT INTO ${tableName} (${headers.join(',')}) VALUES (${placeholders})`;
            
            if (headers.includes('id')) {
                const updateSet = headers.filter(h => h !== 'id').map(h => `${h} = EXCLUDED.${h}`).join(', ');
                if (updateSet) {
                    sql += ` ON CONFLICT (id) DO UPDATE SET ${updateSet}`;
                } else {
                    sql += ` ON CONFLICT (id) DO NOTHING`;
                }
            } else {
                let conflictTarget = 'id';
                if (tableName === 'store_offers') conflictTarget = 'variant_id, store_id';
                else if (tableName === 'product_attribute_values') conflictTarget = 'product_id, attribute_id';
                else if (tableName === 'product_attributes') conflictTarget = 'slug, category_id';
                
                const updateSet = headers.map(h => `${h} = EXCLUDED.${h}`).join(', ');
                if (updateSet) {
                    sql += ` ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateSet}`;
                } else {
                    sql += ` ON CONFLICT (${conflictTarget}) DO NOTHING`;
                }
            }

            const stmt = this.db.prepare(sql);

            let count = 0;
            for (const row of rows) {
                const values = headers.map(h => {
                    const val = row[h];
                    if (val === '' || val === undefined) return null;
                    return val;
                });
                const res = stmt.run(...values);
                if (res.changes > 0) {
                    count++;
                }
            }
            return count;
        });

        return await runImport();
    }

    /**
     * CSV Formatting Utility
     */
    async formatCSV(rows) {
        if (rows.length === 0) return '';
        const headers = Object.keys(rows[0]);
        const csvRows = [headers.join(',')];

        for (const row of rows) {
            const values = headers.map(header => {
                const val = row[header];
                if (val === null || val === undefined) return '';
                const str = String(val);
                if (/[",\r\n]/.test(str)) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            });
            csvRows.push(values.join(','));
        }

        return csvRows.join('\n');
    }

    /**
     * CSV Parser Utility
     */
    async parseCSV(csvText) {
        const lines = [];
        let row = [];
        let insideQuote = false;
        let entry = '';

        for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            const next = csvText[i + 1];

            if (char === '"') {
                if (insideQuote && next === '"') {
                    entry += '"';
                    i++;
                } else {
                    insideQuote = !insideQuote;
                }
            } else if (char === ',' && !insideQuote) {
                row.push(entry);
                entry = '';
            } else if ((char === '\r' || char === '\n') && !insideQuote) {
                if (char === '\r' && next === '\n') i++;
                row.push(entry);
                lines.push(row);
                row = [];
                entry = '';
            } else {
                entry += char;
            }
        }

        if (entry || row.length > 0) {
            row.push(entry);
            lines.push(row);
        }

        if (lines.length === 0) return [];
        const headers = lines[0].map(h => h.trim());
        const data = [];

        for (let i = 1; i < lines.length; i++) {
            const values = lines[i];
            if (values.length === 1 && values[0] === '') continue; // skip blank lines
            const item = {};
            headers.forEach((h, idx) => {
                item[h] = values[idx] !== undefined ? values[idx] : null;
            });
            data.push(item);
        }

        return data;
    }
}

module.exports = AdminDbService;

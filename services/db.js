const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://arkhsly_admin:arkhsly_secure_pass@localhost:5432/arkhsly_db'
});

const transactionStorage = new AsyncLocalStorage();
const tablesWithoutId = ['admin_sessions', 'variant_attributes', 'subcategory_attributes', 'canonical_spec_registry', 'feature_flags', 'ranking_versions', 'analytics_daily_summary', 'product_search_idx'];

function translateFtsQuery(query) {
    if (typeof query !== 'string') return query;
    // Check if it looks like an SQLite FTS MATCH query (contains " and *)
    if (query.includes('"') && query.includes('*')) {
        let cleaned = query.replace(/"/g, '');
        cleaned = cleaned.replace(/\*/g, ':*');
        cleaned = cleaned.replace(/\s+and\s+/gi, ' & ');
        cleaned = cleaned.replace(/\s+or\s+/gi, ' | ');
        return cleaned;
    }
    return query;
}

function translateSql(sql) {
    let rewritten = sql;

    // Translate PRAGMA table_info(table_name) to Postgres information_schema query
    const pragmaMatch = rewritten.match(/PRAGMA\s+table_info\((['"]?)(\w+)\1\)/i);
    if (pragmaMatch) {
        const tableName = pragmaMatch[2];
        rewritten = `
            SELECT 
                ordinal_position AS cid,
                column_name AS name,
                data_type AS type,
                CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END AS notnull,
                column_default AS dflt_value,
                0 AS pk
            FROM information_schema.columns 
            WHERE LOWER(table_name) = '${tableName.toLowerCase()}' 
            ORDER BY ordinal_position
        `;
    }

    // Translate INTEGER PRIMARY KEY AUTOINCREMENT to SERIAL PRIMARY KEY
    rewritten = rewritten.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');

    // Translate SQLite FTS MATCH syntax to PostgreSQL FTS syntax
    rewritten = rewritten.replace(/product_search_idx\s+MATCH\s+\?/gi, "search_vector @@ to_tsquery('simple', ?)");
    
    // Replace SQLite datetime('now') and datetime('now', 'localtime') with PostgreSQL CURRENT_TIMESTAMP
    rewritten = rewritten.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');
    rewritten = rewritten.replace(/datetime\("now"\)/gi, 'CURRENT_TIMESTAMP');
    rewritten = rewritten.replace(/datetime\('now',\s*'localtime'\)/gi, 'CURRENT_TIMESTAMP');
    
    // Replace SQLite datetime('now', '-24 hours') or datetime('now', ?) with Postgres equivalents
    rewritten = rewritten.replace(/datetime\('now',\s*'\s*([^']+)\s*'\)/gi, "CURRENT_TIMESTAMP + CAST('$1' AS INTERVAL)");
    rewritten = rewritten.replace(/datetime\('now',\s*(\?)\)/gi, "CURRENT_TIMESTAMP + CAST($1 AS INTERVAL)");
    
    // Replace SQLite date(column) or DATE(column) with column::date
    rewritten = rewritten.replace(/date\(([\w\.]+)\)/gi, '$1::date');
    
    // Replace SQLite strftime('%Y-%m-%d', column) with to_char(column, 'YYYY-MM-DD')
    rewritten = rewritten.replace(/strftime\(\s*['"]%Y-%m-%d['"]\s*,\s*([\w\.]+)\s*\)/gi, "to_char($1, 'YYYY-MM-DD')");
    
    // Translate INSERT OR IGNORE INTO to INSERT INTO ... ON CONFLICT DO NOTHING
    if (rewritten.toUpperCase().includes('INSERT OR IGNORE INTO')) {
        rewritten = rewritten.replace(/INSERT OR IGNORE INTO/gi, 'INSERT INTO');
        if (!rewritten.toUpperCase().includes('ON CONFLICT')) {
            rewritten += ' ON CONFLICT DO NOTHING';
        }
    }

    // Replace SQLite RANDOM() with RANDOM()
    // (both SQLite and PostgreSQL use RANDOM())
    
    // Fix ROUND(expr, N) for PostgreSQL: first arg must be numeric, not double precision
    rewritten = rewritten.replace(/ROUND\(([^,]+),\s*(\d+)\)/gi, 'ROUND(($1)::numeric, $2)');
    
    // Append RETURNING id to INSERT statements to emulate lastInsertRowid behavior
    const isInsert = rewritten.trim().toUpperCase().startsWith('INSERT');
    const hasReturning = rewritten.toUpperCase().includes('RETURNING');
    const hasTableWithoutId = tablesWithoutId.some(table => rewritten.toLowerCase().includes(table.toLowerCase()));
    
    if (isInsert && !hasReturning && !hasTableWithoutId) {
        rewritten += ' RETURNING id';
    }
    
    // Translate parameter placeholders from ? to $1, $2, ...
    let index = 1;
    rewritten = rewritten.replace(/\?/g, () => `$${index++}`);
    
    return rewritten;
}

class Statement {
    constructor(sql) {
        this.originalSql = sql;
        this.sql = translateSql(sql);
    }
    
    async _execute(params) {
        // If there's an array passed as params array, flatten it if it is single array parameter nested
        let flatParams = params;
        if (params.length === 1 && Array.isArray(params[0])) {
            flatParams = params[0];
        }

        // Translate FTS search query parameters if original SQL contains MATCH
        if (this.originalSql.toUpperCase().includes('MATCH')) {
            flatParams = flatParams.map(translateFtsQuery);
        }
        
        const client = transactionStorage.getStore() || pool;
        return await client.query(this.sql, flatParams);
    }
    
    async all(...params) {
        const res = await this._execute(params);
        return res.rows;
    }
    
    async get(...params) {
        const res = await this._execute(params);
        return res.rows[0] || null;
    }
    
    async run(...params) {
        const res = await this._execute(params);
        const lastInsertRowid = res.rows[0] ? (res.rows[0].id || res.rows[0].lastinsertrowid || null) : null;
        return {
            changes: res.rowCount,
            lastInsertRowid
        };
    }
}

class Database {
    constructor(connectionStringOrPath) {
        this.path = connectionStringOrPath;
    }
    
    pragma(sql) {
        if (sql === 'database_list') {
            return [{ file: 'postgres://localhost/arkhsly_db' }];
        }
        // Ignored for SQLite compatibility
    }
    
    async exec(sql) {
        const rewritten = translateSql(sql);
        const client = transactionStorage.getStore() || pool;
        await client.query(rewritten);
    }
    
    prepare(sql) {
        return new Statement(sql);
    }
    
    transaction(fn) {
        return (...args) => {
            return pool.connect().then(async (client) => {
                try {
                    await client.query('BEGIN');
                    const result = await transactionStorage.run(client, () => fn(...args));
                    await client.query('COMMIT');
                    return result;
                } catch (e) {
                    await client.query('ROLLBACK');
                    throw e;
                } finally {
                    client.release();
                }
            });
        };
    }
    
    async backup(targetPath) {
        if (this.path) {
            // Restore mode: restore this.path (which is the backup file) into PostgreSQL
            const containerPath = '/tmp/restore.sql';
            try {
                // 1. Copy from host to container
                await execPromise(`docker cp "${this.path}" arkhsly-postgres:${containerPath}`);
                // 2. Execute psql to restore
                await execPromise(`docker exec arkhsly-postgres psql -U arkhsly_admin -d arkhsly_db -f ${containerPath}`);
                // 3. Clean up container temp file
                await execPromise(`docker exec arkhsly-postgres rm ${containerPath}`);
            } catch (err) {
                console.error('Postgres restore failed:', err);
                throw err;
            }
        } else {
            // Backup mode: backup PostgreSQL database to targetPath
            const containerPath = '/tmp/backup.sql';
            try {
                // 1. Run pg_dump inside container
                await execPromise(`docker exec arkhsly-postgres pg_dump -U arkhsly_admin -d arkhsly_db -F p -f ${containerPath}`);
                // 2. Copy from container to host targetPath
                await execPromise(`docker cp arkhsly-postgres:${containerPath} "${targetPath}"`);
                // 3. Clean up container temp file
                await execPromise(`docker exec arkhsly-postgres rm ${containerPath}`);
            } catch (err) {
                console.error('Postgres backup failed:', err);
                throw err;
            }
        }
    }
    
    async close() {
        await pool.end();
    }
}

// Export a factory function matching Database constructor
function DatabaseFactory(connectionStringOrPath) {
    return new Database(connectionStringOrPath);
}

module.exports = DatabaseFactory;

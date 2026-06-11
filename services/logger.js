/**
 * Structured Logger
 * =================
 * Outputs clean, structured JSON logs in production, and human-readable text in development.
 */

class Logger {
    constructor() {
        this.isProduction = process.env.NODE_ENV === 'production';
    }

    /**
     * Log info
     */
    info(message, meta = {}) {
        if (this.isProduction) {
            console.log(JSON.stringify({
                timestamp: new Date().toISOString(),
                level: 'info',
                message,
                ...meta
            }));
        } else {
            console.log(`\x1b[32m[INFO]\x1b[0m ${message}`, Object.keys(meta).length ? meta : '');
        }
    }

    /**
     * Log warning
     */
    warn(message, meta = {}) {
        if (this.isProduction) {
            console.warn(JSON.stringify({
                timestamp: new Date().toISOString(),
                level: 'warn',
                message,
                ...meta
            }));
        } else {
            console.warn(`\x1b[33m[WARN]\x1b[0m ${message}`, Object.keys(meta).length ? meta : '');
        }
    }

    /**
     * Log error
     */
    error(message, error, meta = {}) {
        const errorDetail = {
            message: error?.message || String(error),
            stack: error?.stack
        };

        if (this.isProduction) {
            console.error(JSON.stringify({
                timestamp: new Date().toISOString(),
                level: 'error',
                message,
                error: errorDetail,
                ...meta
            }));
        } else {
            console.error(`\x1b[31m[ERROR]\x1b[0m ${message}\n`, error?.stack || error || '');
        }
    }

    /**
     * Log slow DB queries or slow HTTP requests
     */
    slowQuery(sql, durationMs, params = []) {
        if (this.isProduction) {
            console.warn(JSON.stringify({
                timestamp: new Date().toISOString(),
                level: 'slow_query',
                sql,
                durationMs,
                params
            }));
        } else {
            console.warn(`\x1b[35m[SLOW QUERY]\x1b[0m (${durationMs}ms): ${sql}`, params.length ? params : '');
        }
    }
}

module.exports = new Logger();

/**
 * Centralized Error Taxonomy
 * ==========================
 * Contains standard error types for the platform and global Express middleware
 * to format, log, and sanitize error responses.
 */

class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = true; // Indicates whether this is a predicted system error vs random crash
        Error.captureStackTrace(this, this.constructor);
    }
}

class DatabaseError extends AppError {
    constructor(message, details = null) {
        super(message, 500, 'DB_ERROR', details);
    }
}

class ValidationError extends AppError {
    constructor(message, details = null) {
        super(message, 400, 'VALIDATION_ERROR', details);
    }
}

class NotFoundError extends AppError {
    constructor(message, details = null) {
        super(message, 404, 'NOT_FOUND_ERROR', details);
    }
}

class ScraperError extends AppError {
    constructor(message, details = null) {
        super(message, 502, 'SCRAPER_ERROR', details);
    }
}

class MergeError extends AppError {
    constructor(message, details = null) {
        super(message, 500, 'MERGE_ERROR', details);
    }
}

class CacheError extends AppError {
    constructor(message, details = null) {
        super(message, 500, 'CACHE_ERROR', details);
    }
}

class AuthenticationError extends AppError {
    constructor(message = 'Authentication required', details = null) {
        super(message, 401, 'AUTH_ERROR', details);
    }
}

class AuthorizationError extends AppError {
    constructor(message = 'Permission denied', details = null) {
        super(message, 403, 'FORBIDDEN_ERROR', details);
    }
}

/**
 * Global Express Error Handling Middleware
 */
function errorHandler(logger) {
    return (err, req, res, next) => {
        err.statusCode = err.statusCode || 500;
        err.code = err.code || 'INTERNAL_ERROR';

        const isProduction = process.env.NODE_ENV === 'production';

        // Log structured JSON error
        const logMetadata = {
            code: err.code,
            statusCode: err.statusCode,
            url: req.originalUrl,
            method: req.method,
            ip: req.ip,
            details: err.details,
            isOperational: err.isOperational || false
        };

        if (logger && typeof logger.error === 'function') {
            logger.error(`[${err.code}] ${err.message}`, err, logMetadata);
        } else {
            console.error(JSON.stringify({
                timestamp: new Date().toISOString(),
                level: 'error',
                message: `[${err.code}] ${err.message}`,
                stack: err.stack,
                ...logMetadata
            }));
        }

        // Send sanitized response to client
        res.status(err.statusCode).json({
            error: {
                message: err.isOperational || !isProduction ? err.message : 'An internal server error occurred',
                code: err.code,
                statusCode: err.statusCode,
                details: err.details,
                ...(isProduction ? {} : { stack: err.stack })
            }
        });
    };
}

module.exports = {
    AppError,
    DatabaseError,
    ValidationError,
    NotFoundError,
    ScraperError,
    MergeError,
    CacheError,
    AuthenticationError,
    AuthorizationError,
    errorHandler
};

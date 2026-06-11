/**
 * In-Memory Sliding Window Rate Limiter
 * =====================================
 * Prevents brute force and abuse on sensitive endpoints (e.g., login).
 */

const { AppError } = require('../utils/errors');

class RateLimiter {
    constructor(windowMs = 15 * 60 * 1000, max = 5, message = 'Too many requests, please try again later.') {
        this.windowMs = windowMs;
        this.max = max;
        this.message = message;
        this.requests = new Map(); // IP -> Array of timestamps

        // Periodically prune expired entries to avoid memory leaks
        this.pruneInterval = setInterval(() => this.prune(), 5 * 60 * 1000);
        // Unref so the event loop can exit if the server stops
        if (this.pruneInterval.unref) {
            this.pruneInterval.unref();
        }
    }

    middleware() {
        return (req, res, next) => {
            const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            const now = Date.now();

            if (!this.requests.has(ip)) {
                this.requests.set(ip, []);
            }

            const timestamps = this.requests.get(ip);

            // Filter out timestamps older than the sliding window
            const cutoff = now - this.windowMs;
            const activeTimestamps = timestamps.filter(time => time > cutoff);
            
            this.requests.set(ip, activeTimestamps);

            if (activeTimestamps.length >= this.max) {
                // Return 429 Too Many Requests
                const retryAfter = Math.ceil((activeTimestamps[0] + this.windowMs - now) / 1000);
                res.setHeader('Retry-After', retryAfter);
                return next(new AppError(this.message, 429, 'RATE_LIMIT_EXCEEDED', { retryAfterSeconds: retryAfter }));
            }

            // Record this request
            activeTimestamps.push(now);
            next();
        };
    }

    prune() {
        const now = Date.now();
        const cutoff = now - this.windowMs;

        for (const [ip, timestamps] of this.requests.entries()) {
            const active = timestamps.filter(time => time > cutoff);
            if (active.length === 0) {
                this.requests.delete(ip);
            } else {
                this.requests.set(ip, active);
            }
        }
    }
}

/**
 * Factory function to create rate limiting middlewares
 */
function createRateLimiter(options = {}) {
    const limiter = new RateLimiter(options.windowMs, options.max, options.message);
    return limiter.middleware();
}

module.exports = {
    createRateLimiter,
    RateLimiter
};

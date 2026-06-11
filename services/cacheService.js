/**
 * Cache Management & Invalidation Service
 * =======================================
 * Implements high-performance in-memory caching with TTL (Time To Live)
 * and targeted, incremental invalidation strategies.
 */

class CacheService {
    constructor(logger = null) {
        this.cache = new Map();
        this.logger = logger;
        
        // Start automatic expired cache eviction loop every 30 seconds
        this.evictionInterval = setInterval(() => this.evictExpired(), 30000);
    }

    /**
     * Get value from cache
     */
    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;

        const isExpired = Date.now() > item.expiresAt;
        if (isExpired) {
            this.cache.delete(key);
            return null;
        }

        return item.value;
    }

    /**
     * Set cache entry with TTL
     */
    set(key, value, ttlSeconds = 300) {
        const expiresAt = Date.now() + (ttlSeconds * 1000);
        this.cache.set(key, { value, expiresAt });
    }

    /**
     * Evict expired items from memory
     */
    evictExpired() {
        const now = Date.now();
        let count = 0;
        for (const [key, item] of this.cache.entries()) {
            if (now > item.expiresAt) {
                this.cache.delete(key);
                count++;
            }
        }
        if (count > 0 && this.logger) {
            this.logger.info(`Evicted ${count} expired cache entries.`);
        }
    }

    /**
     * Delete a specific key
     */
    delete(key) {
        return this.cache.delete(key);
    }

    /**
     * Invalidate all keys matching a prefix or regular expression
     */
    invalidatePattern(pattern) {
        const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
        let count = 0;
        for (const key of this.cache.keys()) {
            if (regex.test(key)) {
                this.cache.delete(key);
                count++;
            }
        }
        if (this.logger && count > 0) {
            this.logger.info(`Pattern invalidation matched "${pattern}": cleared ${count} keys.`);
        }
        return count;
    }

    /**
     * Incremental invalidation: Specific product details or stats updated
     */
    invalidateProduct(productId) {
        // Clear specific details and comparisons cache
        this.delete(`prod:${productId}`);
        this.invalidatePattern(`prod:.*compare.*`);
        this.delete('stats');
    }

    /**
     * Incremental invalidation: Category configuration updated
     */
    invalidateCategory(categorySlug) {
        this.delete('categories:tree');
        this.delete('categories:all');
        this.invalidatePattern(`cat:${categorySlug}`);
    }

    /**
     * Clear all caches
     */
    clearAll() {
        this.cache.clear();
        if (this.logger) this.logger.info('Cache cleared entirely.');
    }

    /**
     * Get statistics of memory cache for dashboard telemetry
     */
    getCacheStats() {
        const now = Date.now();
        let activeKeys = 0;
        let expiredKeys = 0;
        
        for (const item of this.cache.values()) {
            if (now > item.expiresAt) {
                expiredKeys++;
            } else {
                activeKeys++;
            }
        }

        return {
            totalEntries: this.cache.size,
            activeKeys,
            expiredKeys
        };
    }

    /**
     * Get details of all active cache keys (key, expiresInSeconds, sizeBytes)
     */
    getCacheKeys() {
        const now = Date.now();
        return Array.from(this.cache.entries()).map(([key, item]) => {
            const size = typeof item.value === 'object' ? JSON.stringify(item.value).length : String(item.value).length;
            return {
                key,
                expiresInSeconds: Math.max(0, Math.round((item.expiresAt - now) / 1000)),
                sizeBytes: size
            };
        });
    }

    close() {
        if (this.evictionInterval) {
            clearInterval(this.evictionInterval);
        }
    }
}

module.exports = CacheService;

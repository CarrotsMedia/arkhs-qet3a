const express = require('express');
const crypto = require('crypto');
const Database = require('./services/db');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { exec } = require('child_process');
const fs = require('fs');

// Core Infrastructure & Utilities
const logger = require('./services/logger');
const { errorHandler, AppError, ValidationError, NotFoundError, DatabaseError } = require('./utils/errors');
const EventSystem = require('./services/eventSystem');
const FeatureFlagService = require('./services/featureFlagService');
const RankingVersionService = require('./services/rankingVersionService');
const QueueService = require('./services/queueService');
const CacheService = require('./services/cacheService');
const BackgroundWorker = require('./workers/worker');

// Business Services
const CategoryService = require('./services/categoryService');
const ProductService = require('./services/productService');
const FilterService = require('./services/filterService');
const DiscoveryService = require('./services/discoveryService');
const RankingService = require('./services/rankingService');
const AuthService = require('./services/authService');
const { adminSession, requireAuth, csrfProtection } = require('./middleware/adminAuth');
const auditLogger = require('./middleware/auditLogger');
const createAuthRoutes = require('./routes/authRoutes');
const AdminCategoryService = require('./services/adminCategoryService');
const createCategoryRoutes = require('./routes/adminCategoryRoutes');
const AdminProductService = require('./services/adminProductService');
const createProductRoutes = require('./routes/adminProductRoutes');
const MergeService = require('./services/mergeService');
const createMergeRoutes = require('./routes/adminMergeRoutes');
const AdminStoreService = require('./services/adminStoreService');
const createStoreRoutes = require('./routes/adminStoreRoutes');
const AdminDbService = require('./services/adminDbService');
const createDbRoutes = require('./routes/adminDbRoutes');
const createConfigRoutes = require('./routes/adminConfigRoutes');
const AnalyticsService = require('./services/analyticsService');
const createAnalyticsRoutes = require('./routes/adminAnalyticsRoutes');
const createAdminUserRoutes = require('./routes/adminUserRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware & Telemetry Latency Tracking
const apiStats = {
    totalRequests: 0,
    totalDuration: 0,
    avgResponseTime: 0,
    statusCodes: {},
    recentLatencies: [] // tracks the last 100 requests
};

app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        apiStats.totalRequests++;
        apiStats.totalDuration += duration;
        apiStats.avgResponseTime = apiStats.totalDuration / apiStats.totalRequests;
        
        apiStats.statusCodes[res.statusCode] = (apiStats.statusCodes[res.statusCode] || 0) + 1;
        
        apiStats.recentLatencies.push({
            url: req.originalUrl,
            method: req.method,
            duration,
            timestamp: new Date().toISOString()
        });
        if (apiStats.recentLatencies.length > 100) {
            apiStats.recentLatencies.shift();
        }
    });
    next();
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to Database
const dbPath = path.resolve(__dirname, 'database.db');
let db;
let categoryService, productService, filterService, discoveryService, rankingService;
let eventSystem, featureFlagService, rankingVersionService, queueService, cacheService, backgroundWorker, authService, adminCategoryService, adminProductService, mergeService, adminStoreService, adminDbService, analyticsService;

function connectDB() {
    try {
        db = new Database(dbPath, { readonly: false, fileMustExist: true });
        db.pragma('foreign_keys = OFF');
        logger.info('Connected to the SQLite database.');
        
        // Initialize Core Services
        eventSystem = new EventSystem(logger);
        featureFlagService = new FeatureFlagService(db);
        rankingVersionService = new RankingVersionService(db);
        queueService = new QueueService(db);
        cacheService = new CacheService(logger);
        authService = new AuthService(db);
        adminCategoryService = new AdminCategoryService(db);
        adminProductService = new AdminProductService(db);
        mergeService = new MergeService(db);
        adminStoreService = new AdminStoreService(db, cacheService);
        adminDbService = new AdminDbService(db);
        analyticsService = new AnalyticsService(db, eventSystem, apiStats);

        // Initialize Business Services
        categoryService = new CategoryService(db);
        productService = new ProductService(db);
        filterService = new FilterService(db);
        discoveryService = new DiscoveryService(db);
        rankingService = new RankingService(db, rankingVersionService);

        // Initialize and Start Background Worker
        backgroundWorker = new BackgroundWorker(
            queueService,
            { rankingService, discoveryService, cacheService },
            logger
        );
        backgroundWorker.start();

        return true;
    } catch (err) {
        logger.error('Error connecting to database:', err);
        return false;
    }
}

// Try connecting with retries (gives db_schema.py time to create the DB)
function connectWithRetry(maxRetries = 15, intervalMs = 2000) {
    let attempt = 0;
    return new Promise((resolve, reject) => {
        const tryConnect = () => {
            attempt++;
            if (connectDB()) {
                resolve();
            } else if (attempt < maxRetries) {
                console.log(`Retrying DB connection in ${intervalMs/1000}s... (attempt ${attempt}/${maxRetries})`);
                setTimeout(tryConnect, intervalMs);
            } else {
                reject(new Error('Failed to connect to database after maximum retries'));
            }
        };
        tryConnect();
    });
}

// ═══════════════════════════════════════════════════
// Daily Sync Cron Job
// ═══════════════════════════════════════════════════

// Run every day at 3:00 AM by enqueuing a background job
cron.schedule('0 3 * * *', async () => {
    logger.info('⏰ Scheduled: Enqueuing daily store sync job...');
    await queueService.enqueue('run_scraper_sync');
});

// ═══════════════════════════════════════════════════
// API Endpoints — Categories (new system)
// ═══════════════════════════════════════════════════

// GET /api/categories — list all categories from database
app.get('/api/categories', async (req, res) => {
    try {
        const cacheKey = 'categories:all';
        let categories = cacheService.get(cacheKey);
        if (!categories) {
            categories = await categoryService.getAllCategories();
            cacheService.set(cacheKey, categories, 600); // 10 minutes TTL
        }
        res.json(categories || []);
    } catch (err) {
        logger.error('Categories error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/categories/tree — full category navigation tree
app.get('/api/categories/tree', async (req, res) => {
    try {
        const cacheKey = 'categories:tree';
        let tree = cacheService.get(cacheKey);
        if (!tree) {
            tree = await categoryService.getCategoryTree();
            cacheService.set(cacheKey, tree, 600); // 10 minutes TTL
        }
        res.json(tree);
    } catch (err) {
        logger.error('Category tree error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/categories/:slug — single category with subcategories
app.get('/api/categories/:slug', async (req, res) => {
    try {
        const category = await categoryService.getCategoryBySlug(req.params.slug);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        res.json(category);
    } catch (err) {
        console.error('Category detail error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Helper to generate MD5 hash-based cache keys
function getCacheKey(prefix, params, query) {
    const sortedQuery = {};
    Object.keys(query).sort().forEach(key => {
        if (query[key] !== undefined && query[key] !== null) {
            sortedQuery[key] = query[key];
        }
    });
    const hash = crypto.createHash('md5').update(JSON.stringify({ params, query: sortedQuery })).digest('hex');
    return `${prefix}:${hash}`;
}

// GET /api/categories/:slug/products — products in a category with unified filters
app.get('/api/categories/:slug/products', async (req, res) => {
    try {
        const cacheKey = getCacheKey('products:cat:' + req.params.slug, req.params, req.query);
        const cached = cacheService.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const category = await categoryService.getCategoryBySlug(req.params.slug);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 52;
        const sort = req.query.sort || 'smart_rank';
        const filters = {
            subcategory_id: req.query.subcategory_id ? parseInt(req.query.subcategory_id) : null,
            brand: req.query.brand || null,
            min_price: req.query.min_price ? parseFloat(req.query.min_price) : null,
            max_price: req.query.max_price ? parseFloat(req.query.max_price) : null,
            in_stock: req.query.in_stock === 'true',
            min_stores: req.query.min_stores ? parseInt(req.query.min_stores) : null
        };

        const result = await productService.browseByCategory(category.id, page, limit, sort, filters);

        // Fetch category-level facets dynamically (subcategories, brands, price range)
        const facets = await filterService.getFiltersForCategory(req.params.slug, filters);
        result.facets = facets;

        // Add breadcrumbs and category metadata
        result.breadcrumbs = await categoryService.getBreadcrumbs(req.params.slug);
        result.category = { name: category.name, slug: category.slug, icon: category.icon, seo_title: category.seo_title, seo_description: category.seo_description };

        // Save to cache
        cacheService.set(cacheKey, result, 600); // 10 minutes TTL

        // Telemetry dispatch
        let hasFilters = false;
        if (filters.brand || filters.min_price || filters.max_price || filters.in_stock || filters.subcategory_id || filters.min_stores) {
            hasFilters = true;
        }
        if (hasFilters) {
            const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            const ipHash = await rankingService.hashIp(ip);
            const userAgent = req.headers['user-agent'] || 'unknown';
            eventSystem.dispatch('FILTER_APPLIED', { ipHash, userAgent }, { filters });
        }

        res.json(result);
    } catch (err) {
        console.error('Category products error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/subcategories/:slug/products — subcategory products with dynamic facets
app.get('/api/subcategories/:slug/products', async (req, res) => {
    try {
        const cacheKey = getCacheKey('products:sub:' + req.params.slug, req.params, req.query);
        const cached = cacheService.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        const sub = await categoryService.getSubcategoryBySlug(req.params.slug);
        if (!sub) {
            return res.status(404).json({ error: 'Subcategory not found' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 52;
        const sort = req.query.sort || 'smart_rank';
        const filters = {
            brand: req.query.brand || null,
            min_price: req.query.min_price ? parseFloat(req.query.min_price) : null,
            max_price: req.query.max_price ? parseFloat(req.query.max_price) : null,
            in_stock: req.query.in_stock === 'true',
            min_stores: req.query.min_stores ? parseInt(req.query.min_stores) : null
        };

        // Extract dynamic attribute filters
        for (const [key, val] of Object.entries(req.query)) {
            if (!['page', 'limit', 'sort', 'brand', 'min_price', 'max_price', 'in_stock', 'min_stores'].includes(key)) {
                filters[key] = val;
            }
        }

        const result = await productService.browseBySubcategory(sub.id, page, limit, sort, filters);

        // Fetch dynamic faceted filters (brands, price, attributes from DB)
        const facets = await filterService.getFacetedFilters(sub.id, filters);
        result.facets = facets;

        const catSlug = sub.category ? sub.category.slug : '';
        result.breadcrumbs = await categoryService.getBreadcrumbs(catSlug, req.params.slug);
        result.subcategory = { name: sub.name, slug: sub.slug, icon: sub.icon };
        result.category = sub.category;

        // Save to cache
        cacheService.set(cacheKey, result, 600); // 10 minutes TTL

        // Telemetry dispatch
        let hasFilters = false;
        if (filters.brand || filters.min_price || filters.max_price || filters.in_stock || filters.min_stores) {
            hasFilters = true;
        }
        for (const key of Object.keys(req.query)) {
            if (!['page', 'limit', 'sort', 'brand', 'min_price', 'max_price', 'in_stock', 'min_stores'].includes(key)) {
                hasFilters = true;
            }
        }
        if (hasFilters) {
            const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            const ipHash = await rankingService.hashIp(ip);
            const userAgent = req.headers['user-agent'] || 'unknown';
            eventSystem.dispatch('FILTER_APPLIED', { ipHash, userAgent }, { filters });
        }

        res.json(result);
    } catch (err) {
        console.error('Subcategory products error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/filters/:categorySlug — legacy category filters (with hash caching)
app.get('/api/filters/:categorySlug', async (req, res) => {
    try {
        const filters = {
            subcategory_id: req.query.subcategory_id ? parseInt(req.query.subcategory_id) : null,
            brand: req.query.brand || null,
            min_price: req.query.min_price ? parseFloat(req.query.min_price) : null,
            max_price: req.query.max_price ? parseFloat(req.query.max_price) : null,
            in_stock: req.query.in_stock === 'true',
            min_stores: req.query.min_stores ? parseInt(req.query.min_stores) : null
        };
        const cacheKey = getCacheKey('filters:cat:' + req.params.categorySlug, req.params, filters);
        const cached = cacheService.get(cacheKey);
        if (cached) return res.json(cached);

        const result = await filterService.getFiltersForCategory(req.params.categorySlug, filters);
        if (!result) {
            return res.status(404).json({ error: 'Category not found' });
        }
        cacheService.set(cacheKey, result, 600);
        res.json(result);
    } catch (err) {
        console.error('Filters error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/filters/sub/:subcategorySlug — legacy subcategory filters (with hash caching)
app.get('/api/filters/sub/:subcategorySlug', async (req, res) => {
    try {
        const filters = {
            brand: req.query.brand || null,
            min_price: req.query.min_price ? parseFloat(req.query.min_price) : null,
            max_price: req.query.max_price ? parseFloat(req.query.max_price) : null,
            in_stock: req.query.in_stock === 'true',
            min_stores: req.query.min_stores ? parseInt(req.query.min_stores) : null
        };
        for (const [key, val] of Object.entries(req.query)) {
            if (!['page', 'limit', 'sort', 'brand', 'min_price', 'max_price', 'in_stock', 'min_stores'].includes(key)) {
                filters[key] = val;
            }
        }
        const cacheKey = getCacheKey('filters:sub:' + req.params.subcategorySlug, req.params, filters);
        const cached = cacheService.get(cacheKey);
        if (cached) return res.json(cached);

        const result = await filterService.getFiltersForSubcategory(req.params.subcategorySlug, filters);
        if (!result) {
            return res.status(404).json({ error: 'Subcategory not found' });
        }
        cacheService.set(cacheKey, result, 600);
        res.json(result);
    } catch (err) {
        console.error('Subcategory filters error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════
// API Endpoints — Products
// ═══════════════════════════════════════════════════

// GET /api/top-savings — products with biggest price difference across stores
// IMPORTANT: This must come BEFORE /api/products/:id to avoid route conflicts
app.get('/api/top-savings', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 8;
        res.json(await productService.getTopSavings(limit));
    } catch (err) {
        console.error('Top savings error:', err);
        res.json([]);
    }
});

// GET /api/stores — list all stores with product counts
app.get('/api/stores', async (req, res) => {
    try {
        const rows = await db.prepare(`
            SELECT s.id, s.slug, s.name, s.website, s.logo_url,
                   COUNT(DISTINCT so.variant_id) as product_count
            FROM stores s
            LEFT JOIN store_offers so ON so.store_id = s.id AND so.is_active = 1
            GROUP BY s.id
            ORDER BY product_count DESC
        `).all();
        res.json(rows);
    } catch (err) {
        console.error('Stores error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/products/compare — compare multiple product families
app.get('/api/products/compare', async (req, res) => {
    try {
        const idsStr = req.query.ids;
        if (!idsStr) {
            return res.json({ attributes: [], products: [] });
        }
        
        // Feature Flag Rule matching for Compare V2
        const compareV2 = await featureFlagService.isEnabled('enable_compare_v2', req);
        
        const ids = idsStr.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        const result = await productService.getComparison(ids);
        
        // Dynamic payload addition depending on feature flag
        result.compareVersion = compareV2 ? 'v2' : 'v1';

        // Dispatch COMPARE_STARTED event asynchronously
        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const ipHash = await rankingService.hashIp(ip);
        const userAgent = req.headers['user-agent'] || 'unknown';
        
        eventSystem.dispatch('COMPARE_STARTED', { ipHash, userAgent }, { productIds: ids });

        res.json(result);
    } catch (err) {
        logger.error('Product comparison error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/products/:id — single product with all store prices
app.get('/api/products/:id', async (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        if (isNaN(productId)) {
            return res.status(400).json({ error: 'Invalid product ID' });
        }

        const cacheKey = `prod:${productId}`;
        let product = cacheService.get(cacheKey);
        if (!product) {
            product = await productService.getProductDetail(productId);
            if (!product) {
                return res.status(404).json({ error: 'Product not found' });
            }
            cacheService.set(cacheKey, product, 300); // Cache for 5 minutes
        }

        // Dispatch PRODUCT_VIEWED event asynchronously
        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const ipHash = await rankingService.hashIp(ip);
        const userAgent = req.headers['user-agent'] || 'unknown';

        eventSystem.dispatch('PRODUCT_VIEWED', { ipHash, userAgent }, { familyId: productId });

        res.json(product);
    } catch (err) {
        logger.error('Product detail error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/products/:id/history — price history
app.get('/api/products/:id/history', async (req, res) => {
    try {
        res.json(await productService.getPriceHistory(req.params.id));
    } catch (err) {
        console.error('Price history error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/variants/:id/offers — active offers for a specific variant
app.get('/api/variants/:id/offers', async (req, res) => {
    try {
        const variantId = parseInt(req.params.id);
        if (isNaN(variantId)) {
            return res.status(400).json({ error: 'Invalid variant ID' });
        }
        const offers = await productService.getVariantOffers(variantId);
        res.json(offers);
    } catch (err) {
        console.error('Variant offers error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/variants/:id/history — price history for a specific variant
app.get('/api/variants/:id/history', async (req, res) => {
    try {
        const variantId = parseInt(req.params.id);
        if (isNaN(variantId)) {
            return res.status(400).json({ error: 'Invalid variant ID' });
        }
        const history = await productService.getVariantPriceHistory(variantId);
        res.json(history);
    } catch (err) {
        console.error('Variant history error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/stats
app.get('/api/stats', async (req, res) => {
    try {
        res.json(await productService.getStats());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/suggestions
app.get('/api/suggestions', async (req, res) => {
    try {
        res.json(await productService.getSuggestions());
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// GET /api/featured — featured products for homepage
app.get('/api/featured', async (req, res) => {
    try {
        res.json(await productService.getFeaturedProducts(12));
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// GET /api/trending — trending products (powered by DiscoveryService)
app.get('/api/trending', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 8;
        res.json(await discoveryService.getTrendingByActivity(limit));
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// GET /api/deals — best deals (powered by DiscoveryService)
app.get('/api/deals', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 8;
        res.json(await discoveryService.getDealsOfTheDay(limit));
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// GET /api/price-drops — products with significant price drops vs 30-day average
app.get('/api/price-drops', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 12;
        const days = parseInt(req.query.days) || 30;
        const threshold = parseInt(req.query.threshold) || 15;
        res.json(await discoveryService.getPriceDrops(limit, days, threshold));
    } catch (err) {
        console.error('Price drops error:', err);
        res.json([]);
    }
});

// GET /api/deals-of-the-day — sanitized deals with real discounts
app.get('/api/deals-of-the-day', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 12;
        res.json(await discoveryService.getDealsOfTheDay(limit));
    } catch (err) {
        console.error('Deals of the day error:', err);
        res.json([]);
    }
});

// GET /api/featured-curated — editor's picks based on store coverage
app.get('/api/featured-curated', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 12;
        res.json(await discoveryService.getFeaturedCurated(limit));
    } catch (err) {
        console.error('Featured curated error:', err);
        res.json([]);
    }
});

// GET /api/recent — recently added
app.get('/api/recent', async (req, res) => {
    try {
        res.json(await productService.getRecentlyAdded(8));
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// GET /api/search
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 52;
        const sort = req.query.sort || 'smart_rank';
        const filters = {
            brand: req.query.brand || null,
            min_price: req.query.min_price ? parseFloat(req.query.min_price) : null,
            max_price: req.query.max_price ? parseFloat(req.query.max_price) : null,
            in_stock: req.query.in_stock === 'true'
        };

        // Extract dynamic attribute filters
        let hasFilters = false;
        for (const [key, val] of Object.entries(req.query)) {
            if (!['page', 'limit', 'sort', 'brand', 'min_price', 'max_price', 'in_stock', 'q'].includes(key)) {
                filters[key] = val;
                hasFilters = true;
            }
        }
        if (filters.brand || filters.min_price || filters.max_price || filters.in_stock) {
            hasFilters = true;
        }

        const result = await productService.search(query, page, limit, sort, filters);

        // Dispatch events
        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const ipHash = await rankingService.hashIp(ip);
        const userAgent = req.headers['user-agent'] || 'unknown';

        eventSystem.dispatch('SEARCH_EXECUTED', { ipHash, userAgent }, { query, resultsCount: result.total || 0 });
        if (hasFilters) {
            eventSystem.dispatch('FILTER_APPLIED', { ipHash, userAgent }, { filters });
        }

        res.json(result);
    } catch (err) {
        logger.error('Search error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/history/:id
app.get('/api/history/:id', async (req, res) => {
    try {
        res.json(await productService.getPriceHistory(req.params.id));
    } catch (err) {
        logger.error('History error:', err);
        res.status(500).json({ error: err.message });
    }
});

// (Legacy endpoints and fallback category maps removed to sanitize architecture)

// GET /api/scraper-health — Get status and metrics of all scraper runs
app.get('/api/scraper-health', async (req, res) => {
    try {
        const reportPath = path.join(__dirname, 'output', 'sync_report.json');
        let report = { stores: {} };
        if (fs.existsSync(reportPath)) {
            const data = fs.readFileSync(reportPath, 'utf8');
            report = JSON.parse(data);
        } else {
            report = {
                message: 'No scraper run has completed yet.',
                stores: {}
            };
        }

        // Scan for active progress files
        const outputDir = path.join(__dirname, 'output');
        if (fs.existsSync(outputDir)) {
            const files = fs.readdirSync(outputDir);
            files.forEach(file => {
                if (file.startsWith('progress_') && file.endsWith('.json')) {
                    try {
                        const slug = file.replace('progress_', '').replace('.json', '');
                        const progressPath = path.join(outputDir, file);
                        const progressData = JSON.parse(fs.readFileSync(progressPath, 'utf8'));
                        
                        // Merge or override the store status in the report
                        if (!report.stores[slug]) {
                            report.stores[slug] = { store_slug: slug };
                        }
                        report.stores[slug].status = 'running';
                        report.stores[slug].progress = progressData;
                    } catch (e) {
                        // ignore malformed progress files
                    }
                }
            });
        }

        res.json(report);
    } catch (err) {
        logger.error('Scraper health API error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/telemetry — record telemetry event (clicks, views, comparisons)
app.post('/api/telemetry', async (req, res) => {
    try {
        const { familyId, eventType } = req.body;
        if (!familyId || !eventType) {
            return res.status(400).json({ error: 'familyId and eventType are required' });
        }
        const result = await rankingService.recordTelemetry(parseInt(familyId), eventType, req);
        
        // Dispatch to eventSystem as well if recorded successfully
        if (result && result.success && result.status === 'recorded') {
            const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            const ipHash = await rankingService.hashIp(ip);
            const userAgent = req.headers['user-agent'] || 'unknown';

            let mappedEvent = null;
            if (eventType === 'view') mappedEvent = 'PRODUCT_VIEWED';
            else if (eventType === 'click_offer') mappedEvent = 'PRODUCT_CLICKED';
            else if (eventType === 'compare') mappedEvent = 'COMPARE_STARTED';

            if (mappedEvent) {
                eventSystem.dispatch(
                    mappedEvent, 
                    { ipHash, userAgent }, 
                    mappedEvent === 'COMPARE_STARTED' 
                        ? { productIds: [parseInt(familyId)] } 
                        : { familyId: parseInt(familyId) }
                );
            }
        }
        res.json(result);
    } catch (err) {
        logger.error('Telemetry error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════
// Admin Authentication & Security Middlewares
// ═══════════════════════════════════════════════════

// Parse admin session from cookies
app.use('/api/admin', (req, res, next) => adminSession(authService)(req, res, next));

// Double-submit cookie CSRF protection
app.use('/api/admin', csrfProtection);

// Audit logging for state-changing admin actions
app.use('/api/admin', (req, res, next) => auditLogger(authService)(req, res, next));

// Mount auth routes (login, logout, me, change-password)
app.use('/api/admin', async (req, res, next) => {
    const router = createAuthRoutes(authService);
    router(req, res, next);
});

// Require authentication for all subsequent admin routes
app.use('/api/admin', requireAuth);

// Mount Category Admin Routes
app.use('/api/admin', async (req, res, next) => {
    const router = createCategoryRoutes(adminCategoryService, queueService, cacheService);
    router(req, res, next);
});

// Mount Product Admin Routes
app.use('/api/admin', async (req, res, next) => {
    const router = createProductRoutes(adminProductService, cacheService);
    router(req, res, next);
});

// Mount Merge Admin Routes
app.use('/api/admin', async (req, res, next) => {
    const router = createMergeRoutes(mergeService, cacheService);
    router(req, res, next);
});

// Mount Store Admin Routes
app.use('/api/admin', async (req, res, next) => {
    const router = createStoreRoutes(adminStoreService, queueService, cacheService);
    router(req, res, next);
});

// Mount Database Admin Routes
app.use('/api/admin', async (req, res, next) => {
    const router = createDbRoutes(adminDbService);
    router(req, res, next);
});

// Mount Config, Feature Flags & Cache Admin Routes
app.use('/api/admin', async (req, res, next) => {
    const router = createConfigRoutes(featureFlagService, rankingVersionService, cacheService, queueService);
    router(req, res, next);
});

// Mount Analytics & System Telemetry Admin Routes
app.use('/api/admin', async (req, res, next) => {
    const router = createAnalyticsRoutes(analyticsService);
    router(req, res, next);
});

// Mount User & RBAC Admin Routes
app.use('/api/admin', async (req, res, next) => {
    const router = createAdminUserRoutes(authService);
    router(req, res, next);
});

// POST /api/admin/recalculate-ranks — manual ranking trigger (enqueues background job)
app.post('/api/admin/recalculate-ranks', async (req, res) => {
    try {
        const job = await queueService.enqueue('recalculate_ranks');
        res.json({ success: true, message: 'Recalculation enqueued', job });
    } catch (err) {
        logger.error('Recalculate ranks trigger error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/scrapers/run — manual scraper trigger (enqueues background job)
app.post('/api/admin/scrapers/run', async (req, res) => {
    try {
        const { store } = req.body;
        const payload = store ? { store } : {};
        const job = await queueService.enqueue('run_scraper_sync', payload);
        res.json({ 
            success: true, 
            message: store ? `Scraper run for ${store} enqueued` : 'All scrapers run enqueued', 
            job 
        });
    } catch (err) {
        logger.error('Scraper sync trigger error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/dashboard — aggregates system, queue, database and integrity metrics
app.get('/api/admin/dashboard', async (req, res) => {
    try {
        // 1. System Metrics
        const mem = process.memoryUsage();
        const systemMetrics = {
            uptime: Math.round(process.uptime()),
            memory: {
                rss: Math.round(mem.rss / 1024 / 1024),
                heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
                heapUsed: Math.round(mem.heapUsed / 1024 / 1024)
            },
            apiStats: {
                totalRequests: apiStats.totalRequests,
                avgResponseTimeMs: Math.round(apiStats.avgResponseTime),
                statusCodes: apiStats.statusCodes,
                recentRequests: apiStats.recentLatencies
            }
        };

        // 2. Queue Stats
        const queueStats = await queueService.getQueueStats();
        const recentJobs = await queueService.getRecentJobs(15);

        // 3. SQLite Diagnostics
        const dbStats = {};
        if (fs.existsSync(dbPath)) {
            const stat = fs.statSync(dbPath);
            dbStats.dbSizeMb = (stat.size / 1024 / 1024).toFixed(2);
            
            // Check WAL journal mode
            try {
                const journalMode = await db.prepare('PRAGMA journal_mode').get();
                dbStats.journalMode = journalMode ? journalMode.journal_mode : 'unknown';
            } catch (e) {
                dbStats.journalMode = 'error';
            }

            // Check WAL file size
            const walPath = dbPath + '-wal';
            if (fs.existsSync(walPath)) {
                const walStat = fs.statSync(walPath);
                dbStats.walSizeMb = (walStat.size / 1024 / 1024).toFixed(2);
            } else {
                dbStats.walSizeMb = '0.00';
            }
        }

        // 4. Data Integrity Anomalies Checks
        const integrity = {};
        try {
            integrity.totalFamilies = await db.prepare('SELECT COUNT(*) as count FROM product_families').get().count;
            integrity.totalVariants = await db.prepare('SELECT COUNT(*) as count FROM product_variants').get().count;
            integrity.totalOffers = await db.prepare('SELECT COUNT(*) as count FROM store_offers').get().count;
            integrity.activeOffers = await db.prepare('SELECT COUNT(*) as count FROM store_offers WHERE is_active = 1').get().count;
            integrity.inactiveOffers = await db.prepare('SELECT COUNT(*) as count FROM store_offers WHERE is_active = 0').get().count;
            integrity.activeStores = await db.prepare('SELECT COUNT(*) as count FROM stores').get().count;
            
            // Orphan variants: variant whose family_id does not exist in product_families
            integrity.orphanVariants = await db.prepare(`
                SELECT COUNT(*) as count FROM product_variants 
                WHERE family_id NOT IN (SELECT id FROM product_families)
            `).get().count;

            // Orphan offers: offers whose variant_id does not exist in product_variants
            integrity.orphanOffers = await db.prepare(`
                SELECT COUNT(*) as count FROM store_offers 
                WHERE variant_id NOT IN (SELECT id FROM product_variants)
            `).get().count;

            // Product families with no active offers
            integrity.familiesWithNoOffers = await db.prepare(`
                SELECT COUNT(*) as count FROM product_families 
                WHERE id NOT IN (
                    SELECT DISTINCT pv.family_id 
                    FROM product_variants pv 
                    JOIN store_offers so ON so.variant_id = pv.id AND so.is_active = 1
                )
            `).get().count;
        } catch (e) {
            logger.error('Integrity checks failed:', e);
            integrity.error = e.message;
        }

        // 5. Scraper Health
        let scraperHealth = null;
        try {
            const reportPath = path.join(__dirname, 'output', 'sync_report.json');
            if (fs.existsSync(reportPath)) {
                scraperHealth = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
            }
        } catch (e) {
            // ignore
        }

        // 6. Cache Stats
        const cacheStats = cacheService.getCacheStats();

        res.json({
            system: systemMetrics,
            queue: {
                stats: queueStats,
                recentJobs
            },
            database: dbStats,
            integrity,
            scraperHealth,
            cache: cacheStats
        });
    } catch (err) {
        logger.error('Admin dashboard retrieval failed:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/feature-flags — retrieves all feature flags
app.get('/api/admin/feature-flags', async (req, res) => {
    try {
        const flags = await featureFlagService.getAllFlags();
        res.json(flags);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/feature-flags — toggles or updates feature flags
app.post('/api/admin/feature-flags', async (req, res) => {
    try {
        const { key, isEnabled, rules } = req.body;
        if (!key) {
            return res.status(400).json({ error: 'Key is required' });
        }
        const result = await featureFlagService.setFlag(key, isEnabled === true || isEnabled === 1, rules);
        res.json({ success: true, flag: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/ranking-versions — retrieves all formula configurations
app.get('/api/admin/ranking-versions', async (req, res) => {
    try {
        const versions = await rankingVersionService.getAllFormulas();
        res.json(versions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/ranking-versions — sets active ranking formula
app.post('/api/admin/ranking-versions', async (req, res) => {
    try {
        const { versionId } = req.body;
        if (!versionId) {
            return res.status(400).json({ error: 'versionId is required' });
        }
        const result = await rankingVersionService.setActiveFormula(versionId);
        res.json({ success: true, activeFormula: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/queue/run — manual queue trigger
app.post('/api/admin/queue/run', async (req, res) => {
    try {
        const { jobType, payload } = req.body;
        if (!jobType) {
            return res.status(400).json({ error: 'jobType is required' });
        }
        const job = await queueService.enqueue(jobType, payload || {});
        res.json({ success: true, job });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════
// SPA Fallback — serve index.html for client-side routes
// ═══════════════════════════════════════════════════
app.get('/admin.html', async (req, res) => {
    res.redirect('/admin/');
});

app.get('/admin/*', async (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('/category/*', async (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/product/*', async (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global Error Handling Middleware
app.use(errorHandler(logger));

// ═══════════════════════════════════════════════════
// Start Server
// ═══════════════════════════════════════════════════
connectWithRetry()
    .then(() => {
        logger.info('Starting Container');

        // Enqueue ranking and cache updates in background every 6 hours
        cron.schedule('0 */6 * * *', async () => {
            logger.info('⏰ Scheduled: Enqueuing ranking recalculation and discovery cache rebuild...');
            await queueService.enqueue('recalculate_ranks');
            await queueService.enqueue('rebuild_discovery_cache');
        });

        app.listen(PORT, () => {
            logger.info(`Server is running on http://localhost:${PORT}`);

            // ── Launch Next.js Frontend Dev Server ──
            const frontendDir = path.join(__dirname, 'frontend');
            if (fs.existsSync(frontendDir)) {
                const isWin = process.platform === 'win32';
                const npmCmd = isWin ? 'npm.cmd' : 'npm';
                const { spawn } = require('child_process');

                const frontend = spawn(npmCmd, ['run', 'dev'], {
                    cwd: frontendDir,
                    stdio: ['ignore', 'pipe', 'pipe'],
                    env: { ...process.env, PORT: '3001' },
                    shell: true
                });

                frontend.stdout.on('data', (data) => {
                    const lines = data.toString().trim().split('\n');
                    lines.forEach(line => logger.info(`[Frontend] ${line}`));
                });

                frontend.stderr.on('data', (data) => {
                    const lines = data.toString().trim().split('\n');
                    lines.forEach(line => logger.warn(`[Frontend] ${line}`));
                });

                frontend.on('close', (code) => {
                    if (code !== null && code !== 0) {
                        logger.error(`[Frontend] Next.js exited with code ${code}`);
                    }
                });

                // Clean up on shutdown
                const cleanup = () => {
                    if (!frontend.killed) frontend.kill();
                    process.exit(0);
                };
                process.on('SIGINT', cleanup);
                process.on('SIGTERM', cleanup);

                logger.info('[Frontend] Next.js dev server starting on http://localhost:3001');
            } else {
                logger.warn('[Frontend] frontend/ directory not found — skipping Next.js startup');
            }

            // Enqueue initial ranks recalculation and discovery cache update in background worker
            setTimeout(async () => {
                logger.info('Startup: Enqueuing initial ranking and cache jobs...');
                await queueService.enqueue('recalculate_ranks');
                await queueService.enqueue('rebuild_discovery_cache');
            }, 2000);
        });
    })
    .catch((err) => {
        logger.error('Fatal initialization error:', err);
        process.exit(1);
    });


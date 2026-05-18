const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { exec } = require('child_process');

// Services
const CategoryService = require('./services/categoryService');
const ProductService = require('./services/productService');
const FilterService = require('./services/filterService');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to Database
const dbPath = path.resolve(__dirname, 'pc_parts.db');
let db;
let categoryService, productService, filterService;

function connectDB() {
    try {
        db = new Database(dbPath, { readonly: false, fileMustExist: true });
        console.log('Connected to the SQLite database.');
        // Initialize services
        categoryService = new CategoryService(db);
        productService = new ProductService(db);
        filterService = new FilterService(db);
        return true;
    } catch (err) {
        console.error('Error connecting to database:', err.message);
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

// Run every day at 3:00 AM
cron.schedule('0 3 * * *', () => {
    console.log('⏰ Running daily store sync via sync_all.py...');
    // We run the python script. Assumes 'py' works, fallbacks to 'python' or 'python3' based on OS,
    // Since we are running from JS, let's just use 'python' assuming it's in PATH or 'py' for win.
    const syncCmd = process.platform === 'win32' ? 'py sync_all.py' : 'python3 sync_all.py';
    exec(syncCmd, { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
            console.error(`❌ Sync error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.error(`⚠️ Sync stderr: ${stderr}`);
        }
        console.log(`✅ Sync completed: \n${stdout}`);
    });
});

// ═══════════════════════════════════════════════════
// Legacy CATEGORY_MAP — kept ONLY as temporary fallback
// for the /api/browse endpoint backward compatibility
// ═══════════════════════════════════════════════════

const LEGACY_CATEGORY_MAP = {
    'Laptops': ['GAMING LAPTOP', 'CONSUMER LAPTOP', 'USED LAPTOP', 'laptops', 'Entry & Mid Gaming Laptop'],
    'Graphics Cards': ['GRAPHIC CARDS', 'gpu', 'GRAPHIC CARD HOLDER'],
    'Processors': ['Computer Processors', 'processors', 'Ryzen 3000 Series (Zen 2)', 'Ryzen 5000 Series (Zen 3)', 'Ryzen 9000 Series (Zen 5)'],
    'Motherboards': ['Motherboards', 'motherboards'],
    'RAM & Memory': ['RAM', 'Memory Cards'],
    'Storage': ['storage', 'SSD', 'External Hard', 'HDD', 'USB Flash Drives', 'SSD Housing'],
    'Cases': ['cases', 'COMPUTER CASE', 'CASE Accessories'],
    'Power Supplies': ['Computer Power Supplies', 'psu', 'Power Supply', 'UPS', 'Power Strip', 'Power Inverter', 'Power Station'],
    'Cooling': ['coolers', 'Liquid Cooler', 'AIR COOLER', 'COMPUTER FAN', 'Cooling Kit', 'THERMAL PASTE', 'Thermal pad', 'Thermal Pad', 'Contact Frame', 'CPU Contact Frame', 'liq'],
    'Monitors': ['Monitors', 'monitors', 'Gaming Monitor', 'Monitor Arm', 'Monitor Mount', 'mount'],
    'Keyboards & Mice': ['Keyboards', 'Keyboard (Office/Mechanical/Gaming)', 'Mouse', 'MOUSE PAD', 'Wrist Rests'],
    'Audio': ['Headphones', 'SPEAKERS', 'Earphone', 'EARBUDS', 'Headset', 'Headsets (Gaming/Wireless/Studio)', 'HEADPHONE STAND', 'Microphones', 'MIC STAND', 'MIC ARM'],
    'Networking': ['ROUTERS', 'SWITCHES', 'Network', 'PCI ADAPTERS', 'USB ADAPTERS', 'MIFI'],
    'Gaming': ['Game Controllers', 'Gaming Chairs', 'Racing Wheel', 'gaming controller', 'Desks', 'Stream Deck', 'Handheld', 'PlayStation', 'Video Game Console Accessories'],
    'Cables & Adapters': ['Cables & Converters', 'Chargers', 'Desktop Charger', 'Car charger', 'Power Bank'],
    'Cameras & Streaming': ['Webcams', 'HD Cameras', 'Wireless Cameras', 'IP Cameras', 'Capture Card', 'Green Screen', 'Ring Light', 'LIGHT STRIP', 'PROJECTOR', 'NVR'],
    'PC Bundles': ['PC Bundles', 'Accessory Bundles', 'Pre-Build PC', 'USED PC', 'All-in-One PCs'],
    'Laptop Accessories': ['Laptop Bags', 'Laptop Battery', 'STAND LAPTOP', 'Cooling Pad', 'Screen Protectors'],
};

const LEGACY_CATEGORY_ICONS = {
    'Laptops': '💻', 'Graphics Cards': '🎮', 'Processors': '⚡',
    'Motherboards': '🔧', 'RAM & Memory': '🧩', 'Storage': '💾',
    'Cases': '🖥️', 'Power Supplies': '🔌', 'Cooling': '❄️',
    'Monitors': '🖥️', 'Keyboards & Mice': '⌨️', 'Audio': '🎧',
    'Networking': '🌐', 'Gaming': '🕹️', 'Cables & Adapters': '🔗',
    'Cameras & Streaming': '📷', 'PC Bundles': '📦',
    'Laptop Accessories': '🎒', 'Other': '📎',
};

// ═══════════════════════════════════════════════════
// API Endpoints — Categories (new system)
// ═══════════════════════════════════════════════════

// GET /api/categories — list all categories from database
app.get('/api/categories', (req, res) => {
    try {
        const categories = categoryService.getAllCategories();

        // If no DB categories yet, fall back to legacy
        if (!categories || categories.length === 0) {
            return res.json(getLegacyCategories());
        }

        res.json(categories);
    } catch (err) {
        console.error('Categories error:', err);
        // Fallback to legacy on any error
        try {
            res.json(getLegacyCategories());
        } catch (e) {
            res.status(500).json({ error: err.message });
        }
    }
});

// GET /api/categories/tree — full category navigation tree
app.get('/api/categories/tree', (req, res) => {
    try {
        res.json(categoryService.getCategoryTree());
    } catch (err) {
        console.error('Category tree error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/categories/:slug — single category with subcategories
app.get('/api/categories/:slug', (req, res) => {
    try {
        const category = categoryService.getCategoryBySlug(req.params.slug);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        res.json(category);
    } catch (err) {
        console.error('Category detail error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/categories/:slug/products — products in a category with filters
app.get('/api/categories/:slug/products', (req, res) => {
    try {
        const category = categoryService.getCategoryBySlug(req.params.slug);
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 52;
        const sort = req.query.sort || 'price_asc';
        const filters = {
            subcategory_id: req.query.subcategory_id ? parseInt(req.query.subcategory_id) : null,
            brand: req.query.brand || null,
            min_price: req.query.min_price ? parseFloat(req.query.min_price) : null,
            max_price: req.query.max_price ? parseFloat(req.query.max_price) : null,
            in_stock: req.query.in_stock === 'true'
        };

        const result = productService.browseByCategory(category.id, page, limit, sort, filters);

        // Add breadcrumbs
        result.breadcrumbs = categoryService.getBreadcrumbs(req.params.slug);
        result.category = { name: category.name, slug: category.slug, icon: category.icon, seo_title: category.seo_title, seo_description: category.seo_description };

        res.json(result);
    } catch (err) {
        console.error('Category products error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/subcategories/:slug/products
app.get('/api/subcategories/:slug/products', (req, res) => {
    try {
        const sub = categoryService.getSubcategoryBySlug(req.params.slug);
        if (!sub) {
            return res.status(404).json({ error: 'Subcategory not found' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 52;
        const sort = req.query.sort || 'price_asc';
        const filters = {
            brand: req.query.brand || null,
            min_price: req.query.min_price ? parseFloat(req.query.min_price) : null,
            max_price: req.query.max_price ? parseFloat(req.query.max_price) : null,
            in_stock: req.query.in_stock === 'true'
        };

        const result = productService.browseBySubcategory(sub.id, page, limit, sort, filters);

        const catSlug = sub.category ? sub.category.slug : '';
        result.breadcrumbs = categoryService.getBreadcrumbs(catSlug, req.params.slug);
        result.subcategory = { name: sub.name, slug: sub.slug, icon: sub.icon };
        result.category = sub.category;

        res.json(result);
    } catch (err) {
        console.error('Subcategory products error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/filters/:categorySlug — dynamic filters for a category
app.get('/api/filters/:categorySlug', (req, res) => {
    try {
        const filters = filterService.getFiltersForCategory(req.params.categorySlug);
        if (!filters) {
            return res.status(404).json({ error: 'Category not found' });
        }
        res.json(filters);
    } catch (err) {
        console.error('Filters error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/filters/sub/:subcategorySlug — dynamic filters for a subcategory
app.get('/api/filters/sub/:subcategorySlug', (req, res) => {
    try {
        const filters = filterService.getFiltersForSubcategory(req.params.subcategorySlug);
        if (!filters) {
            return res.status(404).json({ error: 'Subcategory not found' });
        }
        res.json(filters);
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
app.get('/api/top-savings', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 8;
        res.json(productService.getTopSavings(limit));
    } catch (err) {
        console.error('Top savings error:', err);
        res.json([]);
    }
});

// GET /api/stores — list all stores with product counts
app.get('/api/stores', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT s.id, s.slug, s.name, s.website, s.logo_url,
                   COUNT(DISTINCT pr.product_id) as product_count
            FROM stores s
            LEFT JOIN prices pr ON pr.store_id = s.id
            GROUP BY s.id
            ORDER BY product_count DESC
        `).all();
        res.json(rows);
    } catch (err) {
        console.error('Stores error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/products/:id — single product with all store prices
app.get('/api/products/:id', (req, res) => {
    try {
        const productId = parseInt(req.params.id);
        if (isNaN(productId)) {
            return res.status(400).json({ error: 'Invalid product ID' });
        }
        const product = productService.getProductDetail(productId);
        if (!product) {
            return res.status(404).json({ error: 'Product not found' });
        }
        res.json(product);
    } catch (err) {
        console.error('Product detail error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/products/:id/history — price history
app.get('/api/products/:id/history', (req, res) => {
    try {
        res.json(productService.getPriceHistory(req.params.id));
    } catch (err) {
        console.error('Price history error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/stats
app.get('/api/stats', (req, res) => {
    try {
        res.json(productService.getStats());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/suggestions
app.get('/api/suggestions', (req, res) => {
    try {
        res.json(productService.getSuggestions());
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// GET /api/featured — featured products for homepage
app.get('/api/featured', (req, res) => {
    try {
        res.json(productService.getFeaturedProducts(12));
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// GET /api/trending — trending products
app.get('/api/trending', (req, res) => {
    try {
        res.json(productService.getTrendingProducts(8));
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// GET /api/deals — best deals
app.get('/api/deals', (req, res) => {
    try {
        res.json(productService.getBestDeals(8));
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// GET /api/recent — recently added
app.get('/api/recent', (req, res) => {
    try {
        res.json(productService.getRecentlyAdded(8));
    } catch (err) {
        console.error(err);
        res.json([]);
    }
});

// GET /api/search
app.get('/api/search', (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 52;
        const result = productService.search(query, page, limit);
        res.json(result);
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/history/:id
app.get('/api/history/:id', (req, res) => {
    try {
        res.json(productService.getPriceHistory(req.params.id));
    } catch (err) {
        console.error('History error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════
// Legacy Endpoints (backward compatibility)
// ═══════════════════════════════════════════════════

// GET /api/browse?category=Laptops&page=1&limit=52
app.get('/api/browse', (req, res) => {
    const categoryName = req.query.category;
    if (!categoryName) {
        return res.status(400).json({ error: 'Category is required' });
    }

    try {
        // First try new category system by slug
        const catBySlug = categoryService.getCategoryBySlug(categoryName.toLowerCase().replace(/\s+/g, '-'));
        if (catBySlug) {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 52;
            const result = productService.browseByCategory(catBySlug.id, page, limit);
            result.category = categoryName;
            return res.json(result);
        }

        // Fallback to legacy raw category matching
        const rawCats = LEGACY_CATEGORY_MAP[categoryName] || [categoryName];
        const placeholders = rawCats.map(() => '?').join(',');
        const sql = `
            SELECT p.id as product_id, p.name, p.image_url,
                   pr.price_egp, pr.availability, pr.product_url,
                   s.name as store_name, s.slug as store_slug
            FROM products p
            LEFT JOIN prices pr ON pr.product_id = p.id
            LEFT JOIN stores s ON pr.store_id = s.id
            WHERE p.category IN (${placeholders})
            ORDER BY p.id
            LIMIT 2000
        `;

        const rows = db.prepare(sql).all(...rawCats);
        const unified = productService.formatProducts(rows);
        const productsWithOffers = unified.filter(p => p.offers && p.offers.length > 0);

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 52;
        const paginated = productService.paginate(productsWithOffers, page, limit);

        res.json({ category: categoryName, ...paginated });
    } catch (err) {
        console.error('Browse error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Legacy helper
function getLegacyCategories() {
    const rows = db.prepare(`
        SELECT category, COUNT(*) as cnt
        FROM products
        WHERE category IS NOT NULL AND category != ''
        GROUP BY category
    `).all();

    const CATEGORY_MAP_REVERSE = {};
    for (const [norm, raws] of Object.entries(LEGACY_CATEGORY_MAP)) {
        for (const raw of raws) {
            CATEGORY_MAP_REVERSE[raw] = norm;
        }
    }

    const catCounts = {};
    for (const row of rows) {
        const norm = CATEGORY_MAP_REVERSE[row.category] || CATEGORY_MAP_REVERSE[row.category.trim()] || 'Other';
        catCounts[norm] = (catCounts[norm] || 0) + row.cnt;
    }

    return Object.entries(catCounts)
        .map(([name, count]) => ({
            name,
            slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-'),
            count,
            icon: LEGACY_CATEGORY_ICONS[name] || '📎'
        }))
        .sort((a, b) => b.count - a.count);
}

// ═══════════════════════════════════════════════════
// SPA Fallback — serve index.html for client-side routes
// ═══════════════════════════════════════════════════
app.get('/category/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/product/*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ═══════════════════════════════════════════════════
// Start Server
// ═══════════════════════════════════════════════════
connectWithRetry()
    .then(() => {
        console.log('Starting Container');
        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    })
    .catch((err) => {
        console.error(err.message);
        process.exit(1);
    });

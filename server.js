const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to Database
const dbPath = path.resolve(__dirname, 'pc_parts.db');
let db;
try {
    // Open in readwrite so we don't break if sync writes (though better-sqlite3 handles concurrent reads well)
    db = new Database(dbPath, { readonly: true });
    console.log('Connected to the SQLite database.');
} catch (err) {
    console.error('Error connecting to database:', err.message);
    process.exit(1);
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
// Helpers
// ═══════════════════════════════════════════════════

function formatProducts(rows) {
    // Group them by product ID since we get one row per price
    const grouped = new Map();
    for (const r of rows) {
        if (!grouped.has(r.product_id)) {
            grouped.set(r.product_id, {
                product_id: r.product_id,
                merged_name: r.name,
                image_url: r.image_url,
                has_stock: false,
                offers: []
            });
        }
        const group = grouped.get(r.product_id);

        if (r.price_egp) {
            group.offers.push({
                store_slug: r.store_slug || 'unknown',
                store_name: r.store_name || 'Unknown Store',
                price_egp: r.price_egp,
                url: r.product_url || '#',
                availability: r.availability || 'unknown'
            });
            if (r.availability === 'in_stock') {
                group.has_stock = true;
            }
        }
    }

    const results = Array.from(grouped.values());

    // Sort offers within groups: mostly in stock, then cheapest
    results.forEach(g => {
        g.offers.sort((a, b) => {
            if (a.availability === 'in_stock' && b.availability !== 'in_stock') return -1;
            if (a.availability !== 'in_stock' && b.availability === 'in_stock') return 1;
            return a.price_egp - b.price_egp;
        });
    });

    // Sort overall results: mostly in stock, then cheapest starting offer
    results.sort((a, b) => {
        if (a.has_stock && !b.has_stock) return -1;
        if (!a.has_stock && b.has_stock) return 1;
        const priceA = a.offers[0] ? a.offers[0].price_egp : 9999999;
        const priceB = b.offers[0] ? b.offers[0].price_egp : 9999999;
        return priceA - priceB;
    });

    return results;
}

// ═══════════════════════════════════════════════════
// API Endpoints
// ═══════════════════════════════════════════════════

// GET /api/stats
app.get('/api/stats', (req, res) => {
    try {
        const prodCount = db.prepare(`SELECT COUNT(*) as c FROM products`).get().c;
        const lastSync = db.prepare(`SELECT MAX(scraped_at) as m FROM prices`).get().m;
        res.json({
            totalProducts: prodCount,
            lastSync: lastSync
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/suggestions
app.get('/api/suggestions', (req, res) => {
    try {
        // Fetch 8 random products that actually have prices
        const rows = db.prepare(`
            SELECT p.id as product_id, p.name, p.image_url, 
                   pr.price_egp, pr.availability, pr.product_url,
                   s.name as store_name, s.slug as store_slug
            FROM products p
            JOIN prices pr ON pr.product_id = p.id
            JOIN stores s ON pr.store_id = s.id
            WHERE p.image_url IS NOT NULL 
              AND pr.price_egp IS NOT NULL
              AND p.id IN (
                  SELECT id FROM products ORDER BY RANDOM() LIMIT 8
              )
        `).all();

        res.json(formatProducts(rows));
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
        const terms = query.trim().split(/\s+/).filter(t => t.length > 0);

        if (terms.length === 0) {
            return res.json({ count: 0, products: [] });
        }

        let sql = `
            SELECT p.id as product_id, p.name, p.image_url, 
                   pr.price_egp, pr.availability, pr.product_url,
                   s.name as store_name, s.slug as store_slug
            FROM products p
            LEFT JOIN prices pr ON pr.product_id = p.id
            LEFT JOIN stores s ON pr.store_id = s.id
            WHERE 1=1
        `;

        const params = [];
        terms.forEach(term => {
            sql += ` AND p.name LIKE ?`;
            params.push(`%${term}%`);
        });

        sql += ` ORDER BY p.id LIMIT 1000`;

        const rows = db.prepare(sql).all(...params);
        const unified = formatProducts(rows);

        // Filter out unified products that have 0 offers (should be rare)
        const productsWithOffers = unified.filter(p => p.offers && p.offers.length > 0);

        // In-memory pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 52;
        const totalItems = productsWithOffers.length;
        const totalPages = Math.ceil(totalItems / limit);
        const offset = (page - 1) * limit;

        const paginatedProducts = productsWithOffers.slice(offset, offset + limit);

        res.json({
            count: totalItems,
            page: page,
            totalPages: totalPages,
            products: paginatedProducts
        });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/history/:id
app.get('/api/history/:id', (req, res) => {
    try {
        const productId = req.params.id;
        const rows = db.prepare(`
            SELECT ph.price_egp, ph.recorded_at, s.name as store_name
            FROM price_history ph
            JOIN stores s ON ph.store_id = s.id
            WHERE ph.product_id = ?
            ORDER BY ph.recorded_at ASC
        `).all(productId);

        // Group by store for easier charting
        const historyByStore = {};
        for (const row of rows) {
            if (!historyByStore[row.store_name]) {
                historyByStore[row.store_name] = [];
            }
            historyByStore[row.store_name].push({
                price: row.price_egp,
                date: row.recorded_at
            });
        }

        res.json(historyByStore);
    } catch (err) {
        console.error('History error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const os = require('os');

const execPromise = util.promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;

// Auto-detect Python command: 'py' on Windows, 'python3' on Linux/Mac (Railway)
const PYTHON_CMD = os.platform() === 'win32' ? 'py' : 'python3';
console.log(`Platform: ${os.platform()}, Python command: ${PYTHON_CMD}`);

// Search lock to prevent duplicate concurrent requests
const activeSearches = new Map();
const SCRAPER_TIMEOUT = 90000; // 90 seconds max

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Connect to Database for suggestions
const dbPath = path.resolve(__dirname, 'pc_parts.db');
let db;
try {
    db = new Database(dbPath, { readonly: true });
    console.log('Connected to the SQLite database.');
} catch (err) {
    console.error('Error connecting to database:', err.message);
    process.exit(1);
}

// ═══════════════════════════════════════════════════
// Improved Product Grouping Algorithm
// ═══════════════════════════════════════════════════

const FLUFF_WORDS = new Set([
    'vga', 'oc', 'edition', 'gaming', 'rgb', 'dual', 'windforce', 'tuf', 'rog',
    'strix', 'eagle', 'vision', 'aero', 'card', 'graphic', 'graphics', 'video',
    'motherboard', 'processor', 'box', 'geforce', 'nvidia', 'radeon',
    'with', 'the', 'and', 'for', 'features', 'support', 'memory', 'pcie',
    'displayport', 'hdmi', 'cooling', 'fan', 'fans', 'design', 'slot',
    'boost', 'clock', 'speed', 'technology', 'new', 'gen', 'generation',
    'desktop', 'white', 'black'
]);

const MODEL_SUFFIXES = new Set(['ti', 'super', 'xt', 'xtx', 'pro', 'ultra', 'max']);

function extractModelTokens(name) {
    let lower = name.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
    let words = lower.split(/\s+/).filter(w => w.length > 0);
    let brand = '';
    let modelNumbers = [];
    let modelSuffixes = [];
    let significantWords = [];

    const brands = ['msi', 'gigabyte', 'asus', 'zotac', 'pny', 'inno3d', 'palit', 'evga', 'sapphire', 'xfx', 'asrock', 'galax', 'colorful'];
    for (let w of words) {
        if (brands.includes(w)) { brand = w; break; }
    }

    for (let w of words) {
        if (FLUFF_WORDS.has(w) || brands.includes(w)) continue;
        if (/^\d+$/.test(w)) {
            modelNumbers.push(w);
        } else if (MODEL_SUFFIXES.has(w)) {
            modelSuffixes.push(w);
        } else if (w.length > 2) {
            significantWords.push(w);
        }
    }

    return { brand, modelNumbers, modelSuffixes, significantWords };
}

function areProductsSimilar(name1, name2) {
    const t1 = extractModelTokens(name1);
    const t2 = extractModelTokens(name2);

    const mainModels1 = t1.modelNumbers.filter(n => n.length >= 4);
    const mainModels2 = t2.modelNumbers.filter(n => n.length >= 4);

    if (mainModels1.length === 0 || mainModels2.length === 0) {
        const anyMatch = t1.modelNumbers.some(n => t2.modelNumbers.includes(n));
        if (!anyMatch && t1.modelNumbers.length > 0 && t2.modelNumbers.length > 0) return false;
    } else {
        const mainMatch = mainModels1.some(n => mainModels2.includes(n));
        if (!mainMatch) return false;
    }

    const suf1 = t1.modelSuffixes.sort().join(',');
    const suf2 = t2.modelSuffixes.sort().join(',');
    if (suf1 !== suf2) return false;

    const memSizes = ['8', '12', '16', '24', '32'];
    const mem1 = t1.modelNumbers.filter(n => memSizes.includes(n));
    const mem2 = t2.modelNumbers.filter(n => memSizes.includes(n));
    if (mem1.length > 0 && mem2.length > 0) {
        const memMatch = mem1.some(n => mem2.includes(n));
        if (!memMatch) return false;
    }

    const categoryWords = ['rtx', 'gtx', 'ddr4', 'ddr5', 'ssd', 'hdd', 'nvme', 'laptop', 'monitor'];
    const cat1 = name1.toLowerCase().split(/\s+/).filter(w => categoryWords.includes(w));
    const cat2 = name2.toLowerCase().split(/\s+/).filter(w => categoryWords.includes(w));
    if (cat1.length > 0 && cat2.length > 0) {
        const catMatch = cat1.some(w => cat2.includes(w));
        if (!catMatch) return false;
    }

    return true;
}

function buildOffer(p) {
    return {
        store_slug: p.store_slug || p.source || 'unknown',
        store_name: p.store_name || (p.source === 'elbadr' ? 'El Badr Group' : 'Sigma Computer'),
        price_egp: p.price_egp,
        url: p.product_url || p.specs?.url || '',
        availability: p.availability || 'unknown'
    };
}

function groupProducts(products) {
    let groups = [];
    for (let p of products) {
        if (!p.price_egp) continue;
        let added = false;
        for (let g of groups) {
            if (areProductsSimilar(p.name, g.merged_name)) {
                g.offers.push(buildOffer(p));
                if (p.availability === 'in_stock') g.has_stock = true;
                added = true;
                break;
            }
        }
        if (!added) {
            groups.push({
                merged_name: p.name,
                image_url: p.image_url,
                has_stock: p.availability === 'in_stock',
                offers: [buildOffer(p)]
            });
        }
    }

    groups.forEach(g => {
        g.offers.sort((a, b) => {
            if (a.availability === 'in_stock' && b.availability !== 'in_stock') return -1;
            if (a.availability !== 'in_stock' && b.availability === 'in_stock') return 1;
            return a.price_egp - b.price_egp;
        });
    });
    groups.sort((a, b) => {
        if (a.has_stock && !b.has_stock) return -1;
        if (!a.has_stock && b.has_stock) return 1;
        return a.offers[0].price_egp - b.offers[0].price_egp;
    });
    return groups;
}

// ═══════════════════════════════════════════════════
// API Endpoints
// ═══════════════════════════════════════════════════

// GET /api/suggestions
app.get('/api/suggestions', (req, res) => {
    try {
        const rows = db.prepare(`
            SELECT DISTINCT p.name, p.image_url, pr.price_egp 
            FROM products p
            JOIN prices pr ON pr.product_id = p.id
            WHERE p.image_url IS NOT NULL AND pr.price_egp IS NOT NULL
            ORDER BY RANDOM() LIMIT 8
        `).all();
        res.json(rows);
    } catch(err) {
        res.json([]);
    }
});

// GET /api/search-live
app.get('/api/search-live', async (req, res) => {
    const query = req.query.q;
    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    const queryKey = query.trim().toLowerCase();

    // If same search is already running, wait for it instead of spawning duplicates
    if (activeSearches.has(queryKey)) {
        console.log(`Reusing active search for: ${query}`);
        try {
            const result = await activeSearches.get(queryKey);
            return res.json(result);
        } catch (err) {
            return res.status(500).json({ error: 'Search failed' });
        }
    }

    console.log(`Live Search initiated for: ${query}`);
    const querySafe = query.replace(/"/g, '\\"');
    const queryFileFormat = query.replace(/ /g, '_');

    const searchPromise = (async () => {
        try {
            // Run both scrapers concurrently with timeout
            const p1 = execPromise(`${PYTHON_CMD} scraper.py --search "${querySafe}"`, { timeout: SCRAPER_TIMEOUT });
            const p2 = execPromise(`${PYTHON_CMD} elbadr_scraper.py --search "${querySafe}"`, { timeout: SCRAPER_TIMEOUT });

            const results = await Promise.allSettled([p1, p2]);

            for (let r of results) {
                if (r.status === 'rejected') {
                    console.error('Scraper failed:', r.reason?.message || r.reason);
                }
            }

            let allProducts = [];

            // Read Sigma Output
            try {
                const sigmaPath = path.join(__dirname, 'output', `search_${queryFileFormat}.json`);
                const sigmaData = await fs.readFile(sigmaPath, 'utf-8');
                const parsed = JSON.parse(sigmaData);
                if (parsed.products) {
                    allProducts.push(...parsed.products.map(p => ({ ...p, source: 'sigma', store_name: 'Sigma Computer', store_slug: 'sigma' })));
                }
                await fs.unlink(sigmaPath).catch(() => {});
            } catch (e) {
                console.error('Failed to read Sigma results:', e.message);
            }

            // Read Elbadr Output
            try {
                const elbadrPath = path.join(__dirname, 'output', `elbadr_search_${queryFileFormat}.json`);
                const elbadrData = await fs.readFile(elbadrPath, 'utf-8');
                const parsed = JSON.parse(elbadrData);
                if (parsed.products) {
                    allProducts.push(...parsed.products.map(p => ({ ...p, source: 'elbadr', store_name: 'El Badr Group', store_slug: 'elbadr' })));
                }
                await fs.unlink(elbadrPath).catch(() => {});
            } catch (e) {
                console.error('Failed to read Elbadr results:', e.message);
            }

            const unified = groupProducts(allProducts);
            return { count: unified.length, products: unified };
        } finally {
            activeSearches.delete(queryKey);
        }
    })();

    activeSearches.set(queryKey, searchPromise);

    try {
        const result = await searchPromise;
        res.json(result);
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

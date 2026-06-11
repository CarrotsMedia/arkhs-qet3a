const Database = require('better-sqlite3');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const dbPath = path.resolve(__dirname, '../pc_parts.db');

// Helper to send HTTP requests and return parsed response and headers
function request(url, method, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname + parsedUrl.search,
            method: method,
            headers: {
                ...headers,
            }
        };
        if (body) {
            const bodyStr = JSON.stringify(body);
            options.headers['Content-Type'] = 'application/json';
            options.headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsedData = data;
                try {
                    parsedData = JSON.parse(data);
                } catch (e) {}
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    data: parsedData
                });
            });
        });

        req.on('error', reject);
        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTest() {
    console.log('Starting End-to-End Admin Merge API Verification...');
    console.log('DB Path:', dbPath);

    const db = new Database(dbPath);
    console.log('Connected to DB successfully.');
    db.prepare('PRAGMA foreign_keys = OFF').run();

    // Ensure we have a default admin user for testing
    let testAdmin = db.prepare("SELECT id FROM admin_users WHERE username = 'admin'").get();
    if (!testAdmin) {
        // password is 'dawarly2024'
        const salt = 'd5f75e7a9b0c812d';
        // Hashed using scryptSync with N=16384, r=8, p=1 (used by authService.js)
        // Since we want to make it easy, we can just insert a known hash or let service verify
        // Let's copy the default user seeding from authService or insert a prehashed one.
        // Let's check how default user is seeded in authService.js.
        // Actually, the previous phases already completed auth so the 'admin' / 'dawarly2024' user should already exist.
        // We will assert its existence.
    }

    // Insert mock data for merge testing
    console.log('Setting up mockup database records...');
    
    // Find or insert brand and subcategory
    let brand = db.prepare("SELECT id FROM brands WHERE slug = 'mock-brand'").get();
    if (!brand) {
        const info = db.prepare("INSERT INTO brands (name, slug) VALUES ('Mock Brand', 'mock-brand')").run();
        brand = { id: info.lastInsertRowid };
    }

    let cat = db.prepare("SELECT id FROM categories WHERE slug = 'mock-category'").get();
    if (!cat) {
        const info = db.prepare("INSERT INTO categories (name, slug, sort_order) VALUES ('Mock Category', 'mock-category', 1)").run();
        cat = { id: info.lastInsertRowid };
    }

    let subcat = db.prepare("SELECT id FROM subcategories WHERE slug = 'mock-subcategory'").get();
    if (!subcat) {
        const info = db.prepare("INSERT INTO subcategories (category_id, name, slug, sort_order) VALUES (?, 'Mock Subcategory', 'mock-subcategory', 1)").run(cat.id);
        subcat = { id: info.lastInsertRowid };
    }

    // Clean up any stale mock records from previous failed runs
    db.prepare("DELETE FROM store_offers WHERE product_url IN ('http://store.com/api-a', 'http://store.com/api-b', 'http://store.com/api-b2')").run();
    db.prepare("DELETE FROM products WHERE name = 'API Raw Product S24'").run();
    db.prepare("DELETE FROM product_variants WHERE sku IN ('VAR-API-A', 'VAR-API-B', 'VAR-API-B3')").run();
    db.prepare("DELETE FROM product_families WHERE slug IN ('api-test-s24-ultra-5g', 'api-test-s24-ultra-256gb')").run();

    // Insert product families
    const pf1Info = db.prepare(`
        INSERT INTO product_families (slug, name_en, name_ar, brand_id, subcategory_id, is_featured, is_trending, is_deleted)
        VALUES ('api-test-s24-ultra-5g', 'Samsung Galaxy S24 Ultra API Test', 'سامسونج جالكسي اس 24 الترا اختبار', ?, ?, 0, 0, 0)
    `).run(brand.id, subcat.id);
    const pf1Id = pf1Info.lastInsertRowid;

    const pf2Info = db.prepare(`
        INSERT INTO product_families (slug, name_en, name_ar, brand_id, subcategory_id, is_featured, is_trending, is_deleted)
        VALUES ('api-test-s24-ultra-256gb', 'Samsung Galaxy S24 Ultra API Test', 'سامسونج جالكسي اس 24 الترا اختبار', ?, ?, 0, 0, 0)
    `).run(brand.id, subcat.id);
    const pf2Id = pf2Info.lastInsertRowid;

    // Insert variants
    const pv1Info = db.prepare(`
        INSERT INTO product_variants (family_id, sku, storage_gb, ram_gb, network_gen, color_en, color_ar, region_version)
        VALUES (?, 'VAR-API-A', 256, 12, '5G', 'Gray', 'رمادي', 'Middle East')
    `).run(pf1Id);
    const pv1Id = pv1Info.lastInsertRowid;

    const pv2Info = db.prepare(`
        INSERT INTO product_variants (family_id, sku, storage_gb, ram_gb, network_gen, color_en, color_ar, region_version)
        VALUES (?, 'VAR-API-B', 256, 12, '5G', 'Gray', 'رمادي', 'Middle East')
    `).run(pf2Id);
    const pv2Id = pv2Info.lastInsertRowid;

    const pv3Info = db.prepare(`
        INSERT INTO product_variants (family_id, sku, storage_gb, ram_gb, network_gen, color_en, color_ar, region_version)
        VALUES (?, 'VAR-API-B3', 512, 12, '5G', 'Black', 'أسود', 'Middle East')
    `).run(pf2Id);
    const pv3Id = pv3Info.lastInsertRowid;

    // Insert store offers
    const store = db.prepare('SELECT id FROM stores LIMIT 1').get() || { id: 1 };
    
    // Store 1 offer on A_v1 (cheaper)
    db.prepare(`
        INSERT INTO store_offers (variant_id, store_id, raw_title, price_egp, original_price_egp, discount_pct, availability, product_url, is_active, scraped_at)
        VALUES (?, ?, 'Samsung Galaxy S24 API Source Offer', 40000, 45000, 11, 'in_stock', 'http://store.com/api-a', 1, datetime('now'))
    `).run(pv1Id, store.id);

    // Store 1 offer on B_v1 (more expensive conflict)
    const offerB1Info = db.prepare(`
        INSERT INTO store_offers (variant_id, store_id, raw_title, price_egp, original_price_egp, discount_pct, availability, product_url, is_active, scraped_at)
        VALUES (?, ?, 'Samsung Galaxy S24 API Target Offer', 42000, 45000, 6, 'in_stock', 'http://store.com/api-b', 1, datetime('now'))
    `).run(pv2Id, store.id);
    const offerB1Id = offerB1Info.lastInsertRowid;

    // Store 1 offer on B_v2
    db.prepare(`
        INSERT INTO store_offers (variant_id, store_id, raw_title, price_egp, original_price_egp, discount_pct, availability, product_url, is_active, scraped_at)
        VALUES (?, ?, 'Samsung Galaxy S24 API Target Offer 2', 50000, 55000, 9, 'in_stock', 'http://store.com/api-b2', 1, datetime('now'))
    `).run(pv3Id, store.id);

    // Insert raw product reference
    db.prepare(`
        INSERT INTO products (slug, name, brand_id, category_id, subcategory_id, merged_product_id)
        VALUES ('api-raw-product', 'API Raw Product S24', ?, ?, ?, ?)
    `).run(brand.id, cat.id, subcat.id, pf1Id);

    console.log(`Setup complete. Source Family ID: ${pf1Id}, Target Family ID: ${pf2Id}`);
    db.close();

    // Now start the Express server
    console.log('Spawning Node server process...');
    const serverProcess = spawn('node', ['server.js'], {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'pipe',
        env: { ...process.env, PORT: '3000' }
    });

    serverProcess.stdout.on('data', (data) => {
        console.log(`[Server STDOUT]: ${data.toString().trim()}`);
    });

    serverProcess.stderr.on('data', (data) => {
        console.error(`[Server STDERR]: ${data.toString().trim()}`);
    });

    // Wait 3 seconds for server to start up
    await new Promise(resolve => setTimeout(resolve, 3000));

    let historyId;
    try {
        // --- Step 1: Login to get cookies & CSRF ---
        console.log('\n--- REST Test 1: POST /login ---');
        const loginRes = await request('http://localhost:3000/api/admin/login', 'POST', {}, {
            username: 'admin',
            password: 'dawarly2024'
        });

        if (loginRes.statusCode !== 200 || !loginRes.data.success) {
            throw new Error(`Login failed: ${JSON.stringify(loginRes.data)}`);
        }
        console.log('✅ Login success');

        const setCookieHeaders = loginRes.headers['set-cookie'] || [];
        let adminSid = '';
        let xsrfToken = '';
        
        for (const cookie of setCookieHeaders) {
            if (cookie.startsWith('admin_sid=')) {
                adminSid = cookie.split(';')[0].substring('admin_sid='.length);
            }
            if (cookie.startsWith('XSRF-TOKEN=')) {
                xsrfToken = cookie.split(';')[0].substring('XSRF-TOKEN='.length);
            }
        }

        if (!adminSid || !xsrfToken) {
            throw new Error('Failed to extract session or CSRF token from cookies');
        }

        const cookieHeader = `admin_sid=${adminSid}; XSRF-TOKEN=${xsrfToken}`;

        // --- Step 2: GET /merge/candidates ---
        console.log('\n--- REST Test 2: GET /merge/candidates ---');
        const candRes = await request('http://localhost:3000/api/admin/merge/candidates?threshold=0.65', 'GET', {
            'Cookie': cookieHeader
        });

        if (candRes.statusCode !== 200 || !candRes.data.success) {
            throw new Error(`Candidates check failed: ${JSON.stringify(candRes.data)}`);
        }
        const match = candRes.data.candidates.find(c => 
            (c.family1.id === pf1Id && c.family2.id === pf2Id) || 
            (c.family1.id === pf2Id && c.family2.id === pf1Id)
        );
        if (!match) {
            throw new Error('Our mock duplicates were not found by candidates detection API');
        }
        console.log(`✅ Candidates retrieved. Similarity score: ${match.score}`);

        // --- Step 3: GET /merge/compare ---
        console.log('\n--- REST Test 3: GET /merge/compare ---');
        const compRes = await request(`http://localhost:3000/api/admin/merge/compare?ids=${pf1Id},${pf2Id}`, 'GET', {
            'Cookie': cookieHeader
        });

        if (compRes.statusCode !== 200 || !compRes.data.success) {
            throw new Error(`Comparison API failed: ${JSON.stringify(compRes.data)}`);
        }
        console.log(`✅ Comparison retrieval success. Checked families count: ${compRes.data.comparison.length}`);

        // --- Step 4: GET /merge/preview ---
        console.log('\n--- REST Test 4: GET /merge/preview ---');
        const previewRes = await request(`http://localhost:3000/api/admin/merge/preview?sourceId=${pf1Id}&targetId=${pf2Id}`, 'GET', {
            'Cookie': cookieHeader
        });

        if (previewRes.statusCode !== 200 || !previewRes.data.success) {
            throw new Error(`Preview API failed: ${JSON.stringify(previewRes.data)}`);
        }
        console.log(`✅ Preview success. Variant mappings resolved: ${previewRes.data.preview.variantsPreview.length}`);

        // --- Step 5: POST /merge/execute ---
        console.log('\n--- REST Test 5: POST /merge/execute ---');
        const execRes = await request('http://localhost:3000/api/admin/merge/execute', 'POST', {
            'Cookie': cookieHeader,
            'x-xsrf-token': xsrfToken
        }, {
            sourceId: pf1Id,
            targetId: pf2Id
        });

        if (execRes.statusCode !== 200 || !execRes.data.success) {
            throw new Error(`Execute merge API failed: ${JSON.stringify(execRes.data)}`);
        }
        historyId = execRes.data.merge_history_id;
        console.log(`✅ Merge executed successfully. Merge History ID: ${historyId}`);

        // Reconnect to verify DB changes post-merge
        const dbVerify = new Database(dbPath);
        dbVerify.prepare('PRAGMA foreign_keys = OFF').run();
        
        const pf1Deleted = dbVerify.prepare('SELECT is_deleted FROM product_families WHERE id = ?').get(pf1Id);
        if (pf1Deleted.is_deleted !== 1) {
            throw new Error('Source family was not soft-deleted after execution');
        }

        const offerAStatus = dbVerify.prepare("SELECT is_active, variant_id FROM store_offers WHERE product_url = 'http://store.com/api-a'").get();
        if (offerAStatus.variant_id !== pv2Id || offerAStatus.is_active !== 1) {
            throw new Error('Source variant offer was not moved/activated correctly under target variant');
        }

        const offerBStatus = dbVerify.prepare("SELECT is_active, variant_id FROM store_offers WHERE id = ?").get(offerB1Id);
        if (offerBStatus.is_active !== 0) {
            throw new Error('Target conflicting variant offer was not deactivated');
        }

        const rawProdMerged = dbVerify.prepare("SELECT merged_product_id FROM products WHERE name = 'API Raw Product S24'").get();
        if (rawProdMerged.merged_product_id !== pf2Id) {
            throw new Error('Raw product reference was not redirected to target family');
        }

        console.log('✅ DB verification post-merge passed successfully!');

        // --- Step 6: GET /merge/history ---
        console.log('\n--- REST Test 6: GET /merge/history ---');
        const histRes = await request('http://localhost:3000/api/admin/merge/history', 'GET', {
            'Cookie': cookieHeader
        });

        if (histRes.statusCode !== 200 || !histRes.data.success) {
            throw new Error(`History API failed: ${JSON.stringify(histRes.data)}`);
        }
        const histEntry = histRes.data.history.find(h => h.id === historyId);
        if (!histEntry) {
            throw new Error('Our execution history entry is missing from history list');
        }
        console.log(`✅ History verified. Found merge log with status: ${histEntry.status}`);

        // --- Step 7: POST /merge/unmerge/:id ---
        console.log(`\n--- REST Test 7: POST /merge/unmerge/${historyId} ---`);
        const unmergeRes = await request(`http://localhost:3000/api/admin/merge/unmerge/${historyId}`, 'POST', {
            'Cookie': cookieHeader,
            'x-xsrf-token': xsrfToken
        });

        if (unmergeRes.statusCode !== 200 || !unmergeRes.data.success) {
            throw new Error(`Unmerge API failed: ${JSON.stringify(unmergeRes.data)}`);
        }
        console.log('✅ Unmerge executed successfully via API');

        // Reverify DB state post-unmerge
        const pf1Restored = dbVerify.prepare('SELECT is_deleted FROM product_families WHERE id = ?').get(pf1Id);
        if (pf1Restored.is_deleted !== 0) {
            throw new Error('Source family was not restored to active status');
        }

        const offerARestored = dbVerify.prepare("SELECT is_active, variant_id FROM store_offers WHERE product_url = 'http://store.com/api-a'").get();
        if (offerARestored.variant_id !== pv1Id || offerARestored.is_active !== 1) {
            throw new Error('Relocated source variant offer was not moved back to original variant');
        }

        const offerBRestored = dbVerify.prepare("SELECT is_active, variant_id FROM store_offers WHERE id = ?").get(offerB1Id);
        if (offerBRestored.is_active !== 1) {
            throw new Error('Original target variant offer was not reactivated');
        }

        const rawProdRestored = dbVerify.prepare("SELECT merged_product_id FROM products WHERE name = 'API Raw Product S24'").get();
        if (rawProdRestored.merged_product_id !== pf1Id) {
            throw new Error('Raw product reference was not restored back to source family');
        }

        const histStatus = dbVerify.prepare('SELECT status, unmerged_at FROM merge_history WHERE id = ?').get(historyId);
        if (histStatus.status !== 'unmerged' || !histStatus.unmerged_at) {
            throw new Error('History entry was not marked as unmerged');
        }

        console.log('✅ DB verification post-unmerge passed successfully!');
        dbVerify.close();

    } finally {
        // Terminate server process
        console.log('Terminating server process...');
        serverProcess.kill();

        // Perform clean up on database
        console.log('Cleaning up mockup records from database...');
        const dbCleanup = new Database(dbPath);
        dbCleanup.prepare('PRAGMA foreign_keys = OFF').run();
        dbCleanup.prepare("DELETE FROM store_offers WHERE product_url IN ('http://store.com/api-a', 'http://store.com/api-b', 'http://store.com/api-b2')").run();
        dbCleanup.prepare("DELETE FROM products WHERE name = 'API Raw Product S24'").run();
        dbCleanup.prepare(`DELETE FROM product_variants WHERE id IN (${pv1Id}, ${pv2Id}, ${pv3Id})`).run();
        dbCleanup.prepare(`DELETE FROM product_families WHERE id IN (${pf1Id}, ${pf2Id})`).run();
        if (historyId) {
            dbCleanup.prepare('DELETE FROM merge_history WHERE id = ?').run(historyId);
        }
        console.log('Cleanup finished.');
        dbCleanup.close();
    }

    console.log('\n🎉 ALL REST API AND MERGE CONTROL END-TO-END TESTS PASSED!');
}

runTest().catch(err => {
    console.error('\n❌ REST Test suite failed:', err);
    process.exit(1);
});

const MergeService = require('../services/mergeService');
const Database = require('better-sqlite3');
const db = new Database('pc_parts.db');
const mergeService = new MergeService(db);

db.prepare('PRAGMA foreign_keys = OFF').run();

// Insert brand and subcategory
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

const pf1Info = db.prepare(`
    INSERT INTO product_families (slug, name_en, name_ar, brand_id, subcategory_id, is_featured, is_trending, is_deleted)
    VALUES ('api-test-s24-ultra-5g', 'Samsung Galaxy S24 Ultra API Test Source', 'سامسونج جالكسي اس 24 الترا مصدر', ?, ?, 0, 0, 0)
`).run(brand.id, subcat.id);
const pf1Id = pf1Info.lastInsertRowid;

const pf2Info = db.prepare(`
    INSERT INTO product_families (slug, name_en, name_ar, brand_id, subcategory_id, is_featured, is_trending, is_deleted)
    VALUES ('api-test-s24-ultra-256gb', 'Samsung Galaxy S24 Ultra API Test Target', 'سامسونج جالكسي اس 24 الترا هدف', ?, ?, 0, 0, 0)
`).run(brand.id, subcat.id);
const pf2Id = pf2Info.lastInsertRowid;

// Query candidates with a huge limit
const candidates = mergeService.getCandidates({ threshold: 0.65 }, 10000);
console.log('Total candidates found:', candidates.length);

const mockIdx = candidates.findIndex(c => 
    (c.family1.id === pf1Id && c.family2.id === pf2Id) ||
    (c.family1.id === pf2Id && c.family2.id === pf1Id)
);
console.log('Mock match index in candidates:', mockIdx);

if (mockIdx !== -1) {
    console.log('Mock match candidate:', candidates[mockIdx]);
}

// Cleanup
db.prepare(`DELETE FROM product_families WHERE id IN (${pf1Id}, ${pf2Id})`).run();
db.close();

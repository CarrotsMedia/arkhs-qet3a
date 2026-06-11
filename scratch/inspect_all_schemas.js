const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'pc_parts.db');
const db = new Database(dbPath);

const tables = [
    'categories',
    'subcategories',
    'brands',
    'stores',
    'product_families',
    'product_variants',
    'store_offers',
    'price_history',
    'attribute_definitions',
    'subcategory_attributes',
    'variant_attributes',
    'merge_candidates',
    'product_telemetry',
    'feature_flags',
    'ranking_versions',
    'job_queue'
];

console.log('=== DETAILED SCHEMAS ===');
for (const table of tables) {
    try {
        const schema = db.prepare(`PRAGMA table_info(${table})`).all();
        console.log(`\nTable: ${table}`);
        schema.forEach(c => {
            console.log(`  - ${c.name} (${c.type}) ${c.notnull ? 'NOT NULL' : ''} ${c.pk ? 'PK' : ''}`);
        });
    } catch (e) {
        console.log(`\nTable ${table} failed: ${e.message}`);
    }
}

db.close();

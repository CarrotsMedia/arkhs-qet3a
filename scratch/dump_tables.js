const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'pc_parts.db');
const db = new Database(dbPath);

const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all();
console.log('Tables in database:', tables.map(t => t.name));

console.log('\n--- Details of attribute/filter tables ---');
for (const table of ['attribute_definitions', 'subcategory_attributes', 'variant_attributes', 'product_attributes', 'product_attribute_values']) {
    try {
        const schema = db.prepare(`PRAGMA table_info(${table})`).all();
        console.log(`Schema for ${table}:`, schema.map(c => ({ name: c.name, type: c.type, notnull: c.notnull })));
    } catch (e) {
        console.log(`Table ${table} does not exist or failed:`, e.message);
    }
}

db.close();

const Database = require('c:/Users/PC-3/Downloads/store/node_modules/better-sqlite3');
const db = new Database('c:/Users/PC-3/Downloads/store/pc_parts.db');

console.log('--- products schema ---');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='products'").get().sql);

console.log('\n--- product_families schema ---');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='product_families'").get().sql);

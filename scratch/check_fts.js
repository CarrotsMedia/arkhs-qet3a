const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'pc_parts.db'));
try {
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'product_search_idx'").get();
    console.log('product_search_idx SQL:', row ? row.sql : 'Not found');
    const triggers = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql LIKE '%product_search_idx%'").all();
    console.log('Triggers:', triggers);
} catch (e) {
    console.error(e);
}
db.close();

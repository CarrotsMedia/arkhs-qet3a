const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'pc_parts.db'));
const rows = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name IN ('store_offers', 'price_history')").all();
console.log(JSON.stringify(rows, null, 2));
db.close();

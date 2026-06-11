const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'pc_parts.db');
const db = new Database(dbPath);

const infoSc = db.prepare(`PRAGMA table_info(subcategories)`).all();
console.log('subcategories columns:', infoSc.map(c => c.name));

const infoC = db.prepare(`PRAGMA table_info(categories)`).all();
console.log('categories columns:', infoC.map(c => c.name));

const sampleSc = db.prepare(`SELECT * FROM subcategories LIMIT 5`).all();
console.log('subcategories samples:', sampleSc);

db.close();

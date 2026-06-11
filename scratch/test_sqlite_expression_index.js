const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbFile = path.join(__dirname, 'test_expression_index.db');
if (fs.existsSync(dbFile)) {
    fs.unlinkSync(dbFile);
}

const db = new Database(dbFile);

// Create table
db.exec(`
    CREATE TABLE product_variants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        family_id INTEGER NOT NULL,
        storage_gb INTEGER,
        ram_gb INTEGER,
        color_en TEXT
    );
`);

// Create expression index
db.exec(`
    CREATE UNIQUE INDEX idx_variant_composite_nonnull 
    ON product_variants (
        family_id,
        COALESCE(storage_gb, -1),
        COALESCE(ram_gb, -1),
        COALESCE(color_en, '')
    );
`);

console.log('Inserting first variant (NULL storage)...');
db.prepare('INSERT INTO product_variants (family_id, storage_gb, ram_gb, color_en) VALUES (?, ?, ?, ?)').run(1, null, 8, 'Black');

console.log('Inserting second variant (NULL storage, DIFFERENT color)...');
db.prepare('INSERT INTO product_variants (family_id, storage_gb, ram_gb, color_en) VALUES (?, ?, ?, ?)').run(1, null, 8, 'White');

console.log('Inserting third variant (duplicate of first, should fail)...');
try {
    db.prepare('INSERT INTO product_variants (family_id, storage_gb, ram_gb, color_en) VALUES (?, ?, ?, ?)').run(1, null, 8, 'Black');
    console.log('ERROR: Insertion of duplicate succeeded!');
} catch (e) {
    console.log('SUCCESS: Duplicate insertion failed as expected:', e.message);
}

db.close();
fs.unlinkSync(dbFile);
console.log('Test completed.');

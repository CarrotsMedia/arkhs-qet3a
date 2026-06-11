const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbFile = path.join(__dirname, 'test_nullable_unique.db');
if (fs.existsSync(dbFile)) {
    fs.unlinkSync(dbFile);
}

const db = new Database(dbFile);

// Create table
db.exec(`
    CREATE TABLE store_offers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        variant_id INTEGER,
        store_id INTEGER NOT NULL,
        raw_title TEXT NOT NULL,
        UNIQUE (variant_id, store_id)
    );
`);

console.log('Inserting first offer (variant_id = 1, store_id = 1)...');
db.prepare('INSERT INTO store_offers (variant_id, store_id, raw_title) VALUES (?, ?, ?)').run(1, 1, 'Offer 1');

console.log('Inserting second offer with same variant and store (should fail)...');
try {
    db.prepare('INSERT INTO store_offers (variant_id, store_id, raw_title) VALUES (?, ?, ?)').run(1, 1, 'Offer 2');
    console.log('ERROR: Unique constraint did not catch it!');
} catch (e) {
    console.log('SUCCESS: Unique constraint caught duplicate:', e.message);
}

console.log('Inserting third offer (variant_id = NULL, store_id = 1)...');
db.prepare('INSERT INTO store_offers (variant_id, store_id, raw_title) VALUES (?, ?, ?)').run(null, 1, 'Unlinked Offer 3');

console.log('Inserting fourth offer (variant_id = NULL, store_id = 1) (should succeed!)...');
try {
    db.prepare('INSERT INTO store_offers (variant_id, store_id, raw_title) VALUES (?, ?, ?)').run(null, 1, 'Unlinked Offer 4');
    console.log('SUCCESS: Allowed multiple NULL variant_id rows under UNIQUE constraint!');
} catch (e) {
    console.log('ERROR: Failed to insert multiple NULLs:', e.message);
}

db.close();
fs.unlinkSync(dbFile);
console.log('Test completed.');

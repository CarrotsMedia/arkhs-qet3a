const Database = require('better-sqlite3');
const path = require('path');
const AdminProductService = require('../services/adminProductService');

const dbPath = path.resolve(__dirname, '../pc_parts.db');
const db = new Database(dbPath, { readonly: false });

const adminProductService = new AdminProductService(db);

try {
    // 1. Get a random offer
    const offer = db.prepare('SELECT id, raw_title, product_url FROM store_offers LIMIT 1').get();
    if (!offer) {
        console.log('No offers found in database.');
        process.exit(0);
    }
    console.log(`Original offer details: ID: ${offer.id}, Title: ${offer.raw_title}`);
    console.log(`Original URL: ${offer.product_url}`);

    // 2. Perform database update
    const testUrl = 'http://test-url.com/' + Math.random().toString(36).substring(7);
    adminProductService.updateOfferUrl(offer.id, testUrl);
    console.log(`Updated URL to: ${testUrl}`);

    // 3. Verify in DB
    const updatedOffer = db.prepare('SELECT product_url FROM store_offers WHERE id = ?').get(offer.id);
    console.log(`Verified DB URL: ${updatedOffer.product_url}`);

    if (updatedOffer.product_url === testUrl) {
        console.log('🎉 DB helper verification successful!');
    } else {
        console.error('❌ DB verification failed!');
    }

    // 4. Restore original URL
    adminProductService.updateOfferUrl(offer.id, offer.product_url);
    console.log('Restored original URL.');

} catch (err) {
    console.error('Error during test execution:', err);
} finally {
    db.close();
}

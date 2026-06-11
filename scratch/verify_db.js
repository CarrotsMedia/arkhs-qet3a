const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'pc_parts.db');
console.log('Connecting to database:', dbPath);

const db = new Database(dbPath, { verbose: console.log });
db.pragma('journal_mode = WAL');

try {
    // 1. Check family count
    const familyCount = db.prepare('SELECT COUNT(*) as cnt FROM product_families').get();
    console.log('Total Product Families:', familyCount.cnt);

    // 2. Check variant count
    const variantCount = db.prepare('SELECT COUNT(*) as cnt FROM product_variants').get();
    console.log('Total Product Variants:', variantCount.cnt);

    // 3. Check offers count
    // 4. Test Multi-Variant Smartphone Families
    console.log('--- Finding Mobile Families with Storage Options ---');
    const multiVariantMobiles = db.prepare(`
        SELECT pf.id, pf.name_en, COUNT(pv.id) as variant_count
        FROM product_families pf
        JOIN product_variants pv ON pv.family_id = pf.id
        WHERE pv.storage_gb IS NOT NULL OR pv.ram_gb IS NOT NULL
        GROUP BY pf.id
        HAVING variant_count > 1
        LIMIT 5
    `).all();
    console.log('Mobiles with multiple variants:', multiVariantMobiles);

    // 5. Test detailed family view for one of them
    if (multiVariantMobiles.length > 0) {
        const familyId = multiVariantMobiles[0].id;
        console.log(`--- Fetching details for Family ID: ${familyId} ---`);
        
        const family = db.prepare('SELECT * FROM product_families WHERE id = ?').get(familyId);
        console.log('Family:', family);

        const variants = db.prepare('SELECT * FROM product_variants WHERE family_id = ?').all(familyId);
        console.log(`Variants (${variants.length}):`, variants);

        for (const variant of variants) {
            const offers = db.prepare(`
                SELECT so.*, s.name as store_name
                FROM store_offers so
                JOIN stores s ON so.store_id = s.id
                WHERE so.variant_id = ?
            `).all(variant.id);
            console.log(`Offers for variant ${variant.id} (${offers.length}):`, offers.map(o => ({ store: o.store_name, price: o.price_egp, title: o.raw_title })));
        }
    }
} catch (err) {
    console.error('Verification failed:', err);
} finally {
    db.close();
}

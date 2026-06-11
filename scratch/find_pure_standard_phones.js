const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'pc_parts.db'));

const phonePureStandard = db.prepare(`
    SELECT pv.family_id, pf.name_en, pf.name_ar, pv.sku, (
        SELECT COUNT(*) FROM store_offers WHERE variant_id = pv.id
    ) as offer_count
    FROM product_variants pv
    JOIN product_families pf ON pv.family_id = pf.id
    JOIN subcategories sc ON pf.subcategory_id = sc.id
    WHERE sc.slug = 'smartphones'
      AND pv.storage_gb IS NULL 
      AND pv.ram_gb IS NULL 
      AND (pv.color_en IS NULL OR pv.color_en = 'Standard')
    GROUP BY pv.family_id
    HAVING COUNT(*) = 1
    LIMIT 10
`).all();

console.log('Pure standard phone families:', JSON.stringify(phonePureStandard, null, 2));

db.close();

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'pc_parts.db'));
const query = `
    SELECT 
        pv.id as variant_id, 
        pv.sku, 
        pv.color_en,
        pf.id as family_id, 
        pf.name_en as family_name, 
        (SELECT COUNT(*) FROM store_offers WHERE variant_id = pv.id) as offer_count,
        (SELECT COUNT(*) FROM product_variants WHERE family_id = pf.id) as total_variants_in_family
    FROM product_variants pv
    JOIN product_families pf ON pv.family_id = pf.id
    JOIN subcategories sc ON pf.subcategory_id = sc.id
    WHERE sc.slug = 'smartphones'
      AND pv.storage_gb IS NULL 
      AND pv.ram_gb IS NULL 
      AND (pv.color_en IS NULL OR pv.color_en = 'Standard')
    LIMIT 20
`;

const rows = db.prepare(query).all();
console.log('Sample of standard variants in smartphones:', JSON.stringify(rows, null, 2));

// Let's also check how many of the 158 have active offers or any offers at all
const stats = db.prepare(`
    SELECT 
        COUNT(CASE WHEN offer_count > 0 THEN 1 END) as standard_with_offers,
        COUNT(CASE WHEN offer_count = 0 THEN 1 END) as standard_without_offers
    FROM (
        SELECT pv.id, (SELECT COUNT(*) FROM store_offers WHERE variant_id = pv.id) as offer_count
        FROM product_variants pv
        JOIN product_families pf ON pv.family_id = pf.id
        JOIN subcategories sc ON pf.subcategory_id = sc.id
        WHERE sc.slug = 'smartphones'
          AND pv.storage_gb IS NULL 
          AND pv.ram_gb IS NULL 
          AND (pv.color_en IS NULL OR pv.color_en = 'Standard')
    )
`).get();

console.log('Stats of standard variants in smartphones:', stats);
db.close();

const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'pc_parts.db'));
const query = `
    SELECT 
        pv.id as variant_id, 
        pf.name_en as family_name,
        so.raw_title,
        so.price_egp
    FROM product_variants pv
    JOIN product_families pf ON pv.family_id = pf.id
    JOIN subcategories sc ON pf.subcategory_id = sc.id
    JOIN store_offers so ON so.variant_id = pv.id
    WHERE sc.slug = 'smartphones'
      AND pv.storage_gb IS NULL 
      AND pv.ram_gb IS NULL 
      AND (pv.color_en IS NULL OR pv.color_en = 'Standard')
    LIMIT 40
`;

const rows = db.prepare(query).all();
console.log('Sample raw titles for standard smartphone variant offers:');
rows.forEach(r => {
    console.log(`- [Variant ${r.variant_id}] Family: "${r.family_name}" | Offer Title: "${r.raw_title}"`);
});

db.close();

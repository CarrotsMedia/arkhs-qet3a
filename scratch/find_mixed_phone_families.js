const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'pc_parts.db'));

const phoneMixed = db.prepare(`
    SELECT pv.family_id, pf.name_en, COUNT(*) as total_variants,
           SUM(CASE WHEN pv.storage_gb IS NULL AND pv.ram_gb IS NULL AND (pv.color_en IS NULL OR pv.color_en = 'Standard') THEN 1 ELSE 0 END) as standard_count
    FROM product_variants pv
    JOIN product_families pf ON pv.family_id = pf.id
    JOIN subcategories sc ON pf.subcategory_id = sc.id
    WHERE sc.slug = 'smartphones'
    GROUP BY pv.family_id
    HAVING standard_count > 0 AND (total_variants - standard_count) > 0
`).all();

console.log('Mixed phone families count:', phoneMixed.length);
console.log('Mixed phone families:', JSON.stringify(phoneMixed.slice(0, 10), null, 2));

db.close();

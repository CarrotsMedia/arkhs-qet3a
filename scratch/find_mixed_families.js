const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'pc_parts.db'));

// Find product families that have both standard and non-standard variants
const query = `
    SELECT pv.family_id, pf.name_en, sc.slug as subcategory_slug, COUNT(*) as total_variants,
           SUM(CASE WHEN pv.storage_gb IS NULL AND pv.ram_gb IS NULL AND (pv.color_en IS NULL OR pv.color_en = 'Standard') THEN 1 ELSE 0 END) as standard_count
    FROM product_variants pv
    JOIN product_families pf ON pv.family_id = pf.id
    JOIN subcategories sc ON pf.subcategory_id = sc.id
    GROUP BY pv.family_id
    HAVING standard_count > 0 AND (total_variants - standard_count) > 0
    LIMIT 10
`;
const rows = db.prepare(query).all();
console.log('Mixed families (both standard and non-standard variants):');
console.log(JSON.stringify(rows, null, 2));

db.close();

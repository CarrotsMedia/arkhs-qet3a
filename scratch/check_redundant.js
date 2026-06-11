const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'pc_parts.db'));

const query = `
    SELECT pv.id as standard_variant_id, pv.family_id, pf.name_en, sc.slug as subcategory_slug, (
        SELECT MIN(pv2.id) 
        FROM product_variants pv2 
        WHERE pv2.family_id = pv.family_id 
          AND NOT (pv2.storage_gb IS NULL AND pv2.ram_gb IS NULL AND (pv2.color_en IS NULL OR pv2.color_en = 'Standard'))
    ) as target_variant_id
    FROM product_variants pv
    JOIN product_families pf ON pv.family_id = pf.id
    JOIN subcategories sc ON pf.subcategory_id = sc.id
    WHERE pv.storage_gb IS NULL 
      AND pv.ram_gb IS NULL 
      AND (pv.color_en IS NULL OR pv.color_en = 'Standard')
      AND target_variant_id IS NOT NULL
`;

const rows = db.prepare(query).all();
console.log('Total redundant standard variants found:', rows.length);
console.log('First 5 entries:', JSON.stringify(rows.slice(0, 5), null, 2));

db.close();

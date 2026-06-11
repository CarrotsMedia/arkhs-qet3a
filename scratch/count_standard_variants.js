const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'pc_parts.db'));
const row = db.prepare("SELECT COUNT(*) as count FROM product_variants WHERE storage_gb IS NULL AND ram_gb IS NULL AND (color_en IS NULL OR color_en = 'Standard')").get();
console.log('Count of standard variants:', row.count);

// Let's also see if they belong to smartphones
const phoneCount = db.prepare(`
    SELECT COUNT(*) as count 
    FROM product_variants pv
    JOIN product_families pf ON pv.family_id = pf.id
    JOIN subcategories sc ON pf.subcategory_id = sc.id
    WHERE sc.slug = 'smartphones'
      AND pv.storage_gb IS NULL 
      AND pv.ram_gb IS NULL 
      AND (pv.color_en IS NULL OR pv.color_en = 'Standard')
`).get();
console.log('Count of standard variants in smartphones:', phoneCount.count);

db.close();

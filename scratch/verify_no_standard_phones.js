const Database = require('better-sqlite3');
const path = require('path');
const AdminProductService = require('../services/adminProductService');

const db = new Database(path.join(__dirname, '..', 'pc_parts.db'));
const service = new AdminProductService(db);

console.log('=== STARTING STANDARD SMARTPHONE VARIANT VERIFICATION ===');

try {
    // 1. Verify 0 standard variants exist under smartphones
    const standardCount = db.prepare(`
        SELECT COUNT(*) as count
        FROM product_variants pv
        JOIN product_families pf ON pv.family_id = pf.id
        JOIN subcategories sc ON pf.subcategory_id = sc.id
        WHERE sc.slug = 'smartphones'
          AND (pv.storage_gb IS NULL OR pv.ram_gb IS NULL)
    `).get().count;

    console.log(`- Standard variants currently in smartphones subcategory: ${standardCount}`);
    if (standardCount === 0) {
        console.log('SUCCESS: 0 standard smartphone variants exist in the database!');
    } else {
        console.error('FAILURE: Standard smartphone variants still exist in the database!');
    }

    // 2. Find a smartphone family and a non-smartphone family to test validation
    const smartphoneFamily = db.prepare(`
        SELECT pf.id 
        FROM product_families pf
        JOIN subcategories sc ON pf.subcategory_id = sc.id
        WHERE sc.slug = 'smartphones'
        LIMIT 1
    `).get();

    const accessoryFamily = db.prepare(`
        SELECT pf.id 
        FROM product_families pf
        JOIN subcategories sc ON pf.subcategory_id = sc.id
        WHERE sc.slug != 'smartphones'
        LIMIT 1
    `).get();

    if (!smartphoneFamily) {
        console.warn('Warning: No smartphone family found in database to test validations.');
    } else {
        console.log(`- Testing validations on smartphone family ID: ${smartphoneFamily.id}`);
        
        // Test: Creating variant without storage_gb
        try {
            service.createVariant(smartphoneFamily.id, {
                sku: 'TEST-PHONE-ERR-1',
                ram_gb: 8,
                storage_gb: null,
                color_en: 'Black'
            });
            console.error('FAILURE: Allowed creating a smartphone variant without storage_gb!');
        } catch (err) {
            if (err.message.includes('Storage (GB)')) {
                console.log('SUCCESS: Prevented smartphone variant without storage_gb: ' + err.message);
            } else {
                console.error('FAILURE: Threw unexpected error: ' + err.message);
            }
        }

        // Test: Creating variant without ram_gb
        try {
            service.createVariant(smartphoneFamily.id, {
                sku: 'TEST-PHONE-ERR-2',
                ram_gb: null,
                storage_gb: 128,
                color_en: 'Black'
            });
            console.error('FAILURE: Allowed creating a smartphone variant without ram_gb!');
        } catch (err) {
            if (err.message.includes('RAM (GB)')) {
                console.log('SUCCESS: Prevented smartphone variant without ram_gb: ' + err.message);
            } else {
                console.error('FAILURE: Threw unexpected error: ' + err.message);
            }
        }
    }

    if (!accessoryFamily) {
        console.warn('Warning: No non-smartphone family found in database to test validations.');
    } else {
        console.log(`- Testing validations on non-smartphone family ID: ${accessoryFamily.id}`);

        // Test: Creating standard variant on non-smartphone (should succeed)
        db.transaction(() => {
            try {
                const varId = service.createVariant(accessoryFamily.id, {
                    sku: 'TEST-ACC-OK-1',
                    ram_gb: null,
                    storage_gb: null,
                    color_en: 'Standard'
                });
                console.log(`SUCCESS: Allowed standard variant for non-smartphone category (ID: ${varId})`);
                
                // Clean up the test variant
                db.prepare('DELETE FROM product_variants WHERE id = ?').run(varId);
            } catch (err) {
                console.error('FAILURE: Prevented standard variant for non-smartphone: ' + err.message);
            }
        })();
    }

} catch (err) {
    console.error('Test execution failed:', err);
} finally {
    db.close();
}
console.log('=== VERIFICATION COMPLETED ===');

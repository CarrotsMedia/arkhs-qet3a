const Database = require('better-sqlite3');
const path = require('path');
const AdminProductService = require('../services/adminProductService');

const dbPath = path.resolve(__dirname, '..', 'pc_parts.db');
const db = new Database(dbPath);
// Enable foreign keys for validation
db.pragma('foreign_keys = OFF'); 

const service = new AdminProductService(db);

async function runTests() {
    console.log('=== STARTING SERVICE LAYER TESTS ===');
    
    // 1. Create a dummy brand, category, subcategory and product family
    db.prepare("INSERT OR IGNORE INTO brands (id, name, slug) VALUES (9999, 'Test Brand', 'test-brand')").run();
    db.prepare("INSERT OR IGNORE INTO categories (id, slug, name) VALUES (9999, 'test-cat', 'Test Cat')").run();
    db.prepare("INSERT OR IGNORE INTO subcategories (id, slug, name, category_id) VALUES (9999, 'test-subcat', 'Test Subcat', 9999)").run();
    db.prepare("INSERT OR IGNORE INTO product_families (id, slug, brand_id, subcategory_id, name_en, name_ar) VALUES (9999, 'test-product', 9999, 9999, 'Test Product', 'منتج تجريبي')").run();
    
    // Clean potential leftover test variants/offers
    db.prepare("DELETE FROM store_offers WHERE variant_id IN (SELECT id FROM product_variants WHERE family_id = 9999)").run();
    db.prepare("DELETE FROM product_variants WHERE family_id = 9999").run();
    db.prepare("DELETE FROM store_offers WHERE id = 9999").run();
    db.prepare("DELETE FROM stores WHERE id = 9999").run();

    db.prepare("INSERT OR IGNORE INTO stores (id, slug, name) VALUES (9999, 'test-store', 'Test Store')").run();

    try {
        // Test 1: Create variant with NULL fields
        console.log('\n--- Test 1: Creating Variant 1 with NULL storage and RAM ---');
        const v1Id = service.createVariant(9999, {
            sku: 'TEST-SKU-1',
            storage_gb: null,
            ram_gb: null,
            color_en: 'Red',
            color_ar: 'أحمر',
            network_gen: '5G',
            region_version: 'Global'
        });
        console.log('Successfully created Variant 1 with ID:', v1Id);

        // Test 2: Attempt duplicate SKU
        console.log('\n--- Test 2: Attempting to create duplicate SKU ---');
        try {
            service.createVariant(9999, {
                sku: 'TEST-SKU-1',
                storage_gb: 256,
                ram_gb: 8,
                color_en: 'Blue'
            });
            console.log('FAIL: Allowed duplicate SKU!');
        } catch (e) {
            console.log('SUCCESS: Duplicate SKU prevented:', e.message);
        }

        // Test 3: Attempt duplicate composite specs (specifically with NULLs)
        console.log('\n--- Test 3: Attempting to create duplicate composite specs with NULLs ---');
        try {
            service.createVariant(9999, {
                sku: 'TEST-SKU-2',
                storage_gb: null,
                ram_gb: null,
                color_en: 'Red',
                network_gen: '5G',
                region_version: 'Global'
            });
            console.log('FAIL: Allowed duplicate composite specs with NULLs!');
        } catch (e) {
            console.log('SUCCESS: Duplicate composite specs prevented:', e.message);
        }

        // Test 4: Link offer to Variant 1
        console.log('\n--- Test 4: Linking offer to Variant 1 ---');
        db.prepare(`
            INSERT INTO store_offers (id, variant_id, store_id, raw_title, price_egp, is_active, is_deleted)
            VALUES (9999, ?, 9999, 'Test Offer Title', 15000, 1, 0)
        `).run(v1Id);
        
        const offerBefore = db.prepare("SELECT * FROM store_offers WHERE id = 9999").get();
        console.log('Offer inserted linked to variant_id:', offerBefore.variant_id);

        // Test 5: updateOffer validations (NaN check & non-existent variant check)
        console.log('\n--- Test 5: Testing updateOffer input validations ---');
        try {
            service.updateOffer(9999, { variant_id: 'abc' });
            console.log('FAIL: Allowed NaN variant_id in updateOffer!');
        } catch (e) {
            console.log('SUCCESS: Prevented NaN variant_id in updateOffer:', e.message);
        }

        try {
            service.updateOffer(9999, { variant_id: 888888 });
            console.log('FAIL: Allowed non-existent variant_id in updateOffer!');
        } catch (e) {
            console.log('SUCCESS: Prevented non-existent variant_id in updateOffer:', e.message);
        }

        // Test 6: Unlink offer (set variant_id to null) via updateOffer
        console.log('\n--- Test 6: Unlinking offer (setting variant_id = null) ---');
        service.updateOffer(9999, { variant_id: null });
        const offerAfterUnlink = db.prepare("SELECT variant_id FROM store_offers WHERE id = 9999").get();
        console.log('Offer variant_id after unlinking:', offerAfterUnlink.variant_id); // should be null

        // Relink it for deletion tests
        service.updateOffer(9999, { variant_id: v1Id });

        // Test 7: Delete variant and check soft-delete cascade
        console.log('\n--- Test 7: Deleting variant and checking soft-delete on linked offers ---');
        service.deleteVariant(9999, v1Id);
        
        const deletedVariant = db.prepare("SELECT id FROM product_variants WHERE id = ?").get(v1Id);
        console.log('Is variant deleted from product_variants?', !deletedVariant);

        const offerAfterDeletion = db.prepare("SELECT variant_id, is_active, is_deleted, deleted_at FROM store_offers WHERE id = 9999").get();
        console.log('After variant deletion, offer variant_id:', offerAfterDeletion.variant_id); // should be null
        console.log('After variant deletion, offer is_active:', offerAfterDeletion.is_active);   // should be 0
        console.log('After variant deletion, offer is_deleted:', offerAfterDeletion.is_deleted); // should be 1
        console.log('After variant deletion, offer deleted_at:', offerAfterDeletion.deleted_at); // should be a timestamp
        
        if (offerAfterDeletion.variant_id === null && offerAfterDeletion.is_active === 0 && offerAfterDeletion.is_deleted === 1 && offerAfterDeletion.deleted_at) {
            console.log('SUCCESS: Variant soft-delete unlinking verified successfully!');
        } else {
            console.log('FAIL: Variant soft-delete unlinking values are incorrect:', offerAfterDeletion);
        }

    } finally {
        // Cleanup all dummy records
        console.log('\n--- Cleaning up dummy records ---');
        db.prepare("DELETE FROM store_offers WHERE id = 9999").run();
        db.prepare("DELETE FROM store_offers WHERE variant_id IN (SELECT id FROM product_variants WHERE family_id = 9999)").run();
        db.prepare("DELETE FROM product_variants WHERE family_id = 9999").run();
        db.prepare("DELETE FROM product_families WHERE id = 9999").run();
        db.prepare("DELETE FROM subcategories WHERE id = 9999").run();
        db.prepare("DELETE FROM categories WHERE id = 9999").run();
        db.prepare("DELETE FROM brands WHERE id = 9999").run();
        db.prepare("DELETE FROM stores WHERE id = 9999").run();
        db.close();
    }
    
    console.log('\n=== ALL TESTS FINISHED ===');
}

runTests().catch(err => {
    console.error('Test run failed with error:', err);
});

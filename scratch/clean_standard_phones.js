const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'pc_parts.db'));

console.log('Starting cleanup of standard variants under smartphones subcategory...');

try {
    db.transaction(() => {
        // 1. Find all target variant IDs
        const targetVariants = db.prepare(`
            SELECT pv.id
            FROM product_variants pv
            JOIN product_families pf ON pv.family_id = pf.id
            JOIN subcategories sc ON pf.subcategory_id = sc.id
            WHERE sc.slug = 'smartphones'
              AND (pv.storage_gb IS NULL OR pv.ram_gb IS NULL)
        `).all();

        const variantIds = targetVariants.map(v => v.id);
        console.log(`Found ${variantIds.length} standard smartphone variants to delete.`);

        if (variantIds.length === 0) {
            console.log('No standard smartphone variants found to delete.');
            return;
        }

        // We will process deletion in chunks or directly since SQLite can handle it easily
        // Convert to comma-separated list of IDs for IN clauses
        // To be safe against SQL limits if there are many, we can run queries for each ID or in batches.
        // Let's do it in batches of 500.
        const batchSize = 500;
        let totalOffersDeleted = 0;
        let totalHistoryDeleted = 0;
        let totalAttributesDeleted = 0;
        let totalVariantsDeleted = 0;

        for (let i = 0; i < variantIds.length; i += batchSize) {
            const batch = variantIds.slice(i, i + batchSize);
            const placeholders = batch.map(() => '?').join(',');

            // Delete store offers
            const offersRes = db.prepare(`
                DELETE FROM store_offers 
                WHERE variant_id IN (${placeholders})
            `).run(...batch);
            totalOffersDeleted += offersRes.changes;

            // Delete price history
            const historyRes = db.prepare(`
                DELETE FROM price_history 
                WHERE variant_id IN (${placeholders})
            `).run(...batch);
            totalHistoryDeleted += historyRes.changes;

            // Delete variant attributes
            const attrsRes = db.prepare(`
                DELETE FROM variant_attributes 
                WHERE variant_id IN (${placeholders})
            `).run(...batch);
            totalAttributesDeleted += attrsRes.changes;

            // Delete variants
            const variantsRes = db.prepare(`
                DELETE FROM product_variants 
                WHERE id IN (${placeholders})
            `).run(...batch);
            totalVariantsDeleted += variantsRes.changes;
        }

        console.log('Cleanup completed successfully:');
        console.log(`- Deleted ${totalVariantsDeleted} standard smartphone variants`);
        console.log(`- Deleted ${totalOffersDeleted} associated store offers`);
        console.log(`- Deleted ${totalHistoryDeleted} associated price history logs`);
        console.log(`- Deleted ${totalAttributesDeleted} associated variant attributes`);
    })();
} catch (err) {
    console.error('Migration failed:', err);
} finally {
    db.close();
}

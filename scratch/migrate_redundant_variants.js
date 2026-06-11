const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'pc_parts.db'));

const runMigration = () => {
    const query = `
        SELECT pv.id as standard_variant_id, pv.family_id, (
            SELECT MIN(pv2.id) 
            FROM product_variants pv2 
            WHERE pv2.family_id = pv.family_id 
              AND NOT (pv2.storage_gb IS NULL AND pv2.ram_gb IS NULL AND (pv2.color_en IS NULL OR pv2.color_en = 'Standard'))
        ) as target_variant_id
        FROM product_variants pv
        WHERE pv.storage_gb IS NULL 
          AND pv.ram_gb IS NULL 
          AND (pv.color_en IS NULL OR pv.color_en = 'Standard')
          AND target_variant_id IS NOT NULL;
    `;

    const redundant = db.prepare(query).all();
    console.log(`Found ${redundant.length} redundant standard variants.`);

    if (redundant.length === 0) {
        db.close();
        return;
    }

    db.transaction(() => {
        let movedOffersCount = 0;
        let deletedVariantsCount = 0;

        for (const row of redundant) {
            const { standard_variant_id, target_variant_id } = row;

            // 1. Move store offers to target variant
            // To avoid UNIQUE (variant_id, store_id) violation, we check if target variant already has an offer from this store.
            // If it does, we delete the redundant standard offer. Otherwise, we update the variant_id link.
            const standardOffers = db.prepare('SELECT id, store_id FROM store_offers WHERE variant_id = ?').all(standard_variant_id);
            for (const offer of standardOffers) {
                const targetOfferExists = db.prepare('SELECT id FROM store_offers WHERE variant_id = ? AND store_id = ?').get(target_variant_id, offer.store_id);
                if (targetOfferExists) {
                    // Duplicate offer for target variant: delete standard offer
                    db.prepare('DELETE FROM store_offers WHERE id = ?').run(offer.id);
                } else {
                    // Update offer link
                    db.prepare('UPDATE store_offers SET variant_id = ? WHERE id = ?').run(target_variant_id, offer.id);
                }
                movedOffersCount++;
            }

            // 2. Move price history entries
            db.prepare('UPDATE price_history SET variant_id = ? WHERE variant_id = ?').run(target_variant_id, standard_variant_id);

            // 3. Delete variant attributes
            db.prepare('DELETE FROM variant_attributes WHERE variant_id = ?').run(standard_variant_id);

            // 4. Delete standard variant
            db.prepare('DELETE FROM product_variants WHERE id = ?').run(standard_variant_id);
            deletedVariantsCount++;
        }

        console.log(`Successfully migrated ${movedOffersCount} offers and deleted ${deletedVariantsCount} redundant standard variants.`);
    })();

    db.close();
};

runMigration();

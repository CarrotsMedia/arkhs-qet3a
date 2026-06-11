#!/usr/bin/env python3
"""
Reclassify Products Script
==========================
Queries all products in the database, recalculates their category and subcategory
assignments using the updated `category_keywords` table rules, and updates the products.
"""

import sys
from pathlib import Path

# Add project root to sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from db_schema import classify_product, get_db_connection

def reclassify_all_products():
    print("Connecting to PostgreSQL database...")
    conn = get_db_connection()
    cur = conn.cursor()

    # Query all products
    cur.execute("SELECT id, name, category, category_id, subcategory_id FROM products")
    products = cur.fetchall()
    
    total = len(products)
    print(f"Analyzing {total} products for reclassification...")
    
    updated = 0
    changed = 0

    # Cache subcategories name/slug for friendly logging
    cur.execute("SELECT id, name FROM subcategories")
    subcat_names = {row[0]: row[1] for row in cur.fetchall()}
    
    # We do updates in a single transaction
    try:
        for p_id, p_name, raw_category, old_cat_id, old_subcat_id in products:
            new_cat_id, new_subcat_id = classify_product(p_name, raw_category, conn)
            
            # If classification differs, update it
            if new_cat_id != old_cat_id or new_subcat_id != old_subcat_id:
                cur.execute(
                    "UPDATE products SET category_id = ?, subcategory_id = ? WHERE id = ?",
                    (new_cat_id, new_subcat_id, p_id)
                )
                changed += 1
                
                # Friendly log sample (limit output logs to first 50 modifications)
                if changed <= 50:
                    old_name = subcat_names.get(old_subcat_id, "None")
                    new_name = subcat_names.get(new_subcat_id, "None")
                    print(f"  [CHANGE] ID {p_id}: '{p_name[:40]}...' -> moved from '{old_name}' to '{new_name}'")
                elif changed == 51:
                    print("  ... more changes omitted from log output ...")

            updated += 1
            if updated % 1000 == 0:
                print(f"  Processed {updated}/{total} products...")
                
        conn.commit()
        print(f"\n[SUCCESS] Reclassification complete!")
        print(f"  - Total Products Scanned: {total}")
        print(f"  - Total Reclassified: {changed}")
        
    except Exception as e:
        conn.rollback()
        print(f"Error during reclassification transaction: {e}")
        conn.close()
        sys.exit(1)
        
    conn.close()

if __name__ == "__main__":
    reclassify_all_products()

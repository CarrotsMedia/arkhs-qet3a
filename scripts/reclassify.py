import sys
import os

# Add parent directory to path so we can import db_schema
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import sqlite3
from db_schema import classify_product

DB_PATH = "../pc_parts.db"

def reclassify_all():
    print("Connecting to database...")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # Get all products that have no category_id
    cur.execute("SELECT id, name, category FROM products WHERE category_id IS NULL")
    products = cur.fetchall()
    
    print(f"Found {len(products)} products that need classification.")
    
    updated = 0
    for p_id, p_name, p_cat in products:
        cat_id, subcat_id = classify_product(p_name, p_cat or "", conn)
        if cat_id or subcat_id:
            cur.execute(
                "UPDATE products SET category_id = ?, subcategory_id = ? WHERE id = ?",
                (cat_id, subcat_id, p_id)
            )
            updated += 1
            if updated % 1000 == 0:
                print(f"Updated {updated} products...")
                
    conn.commit()
    conn.close()
    print(f"Successfully re-classified {updated} out of {len(products)} products!")

if __name__ == "__main__":
    reclassify_all()

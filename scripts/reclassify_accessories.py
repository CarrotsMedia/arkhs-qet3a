import sqlite3
import sys
from pathlib import Path

# Add parent directory to sys.path so we can import db_schema
sys.path.append(str(Path(__file__).resolve().parent.parent))
from db_schema import classify_product

DB_PATH = Path(__file__).resolve().parent.parent / "pc_parts.db"

def reclassify():
    print(f"Reclassifying products in {DB_PATH} using the new rules...")
    
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # Select all products
    cur.execute("SELECT id, name, category, category_id, subcategory_id FROM products")
    rows = cur.fetchall()
    
    print(f"Loaded {len(rows)} products from DB.")
    
    updated = 0
    phone_before = 0
    phone_after = 0
    acc_after = 0
    
    for pid, name, raw_cat, old_cat_id, old_subcat_id in rows:
        if old_subcat_id == 1:
            phone_before += 1
            
        new_cat_id, new_subcat_id = classify_product(name, raw_cat or "", conn)
        
        # If classification changed, update it!
        if (new_cat_id != old_cat_id) or (new_subcat_id != old_subcat_id):
            cur.execute("""
                UPDATE products 
                SET category_id = ?, subcategory_id = ? 
                WHERE id = ?
            """, (new_cat_id, new_subcat_id, pid))
            updated += 1
            
    # Commit changes before checking counts
    conn.commit()
    
    # Calculate exact counts of subcategories now
    cur.execute("SELECT COUNT(*) FROM products WHERE subcategory_id = 1")
    phone_after = cur.fetchone()[0]
    
    cur.execute("""
        SELECT COUNT(*) 
        FROM products p
        JOIN subcategories s ON p.subcategory_id = s.id
        WHERE s.slug = 'phone-accessories'
    """)
    acc_after = cur.fetchone()[0]
    
    conn.close()
    
    print("\nReclassification Summary:")
    print(f"  - Total products evaluated: {len(rows)}")
    print(f"  - Total products updated in DB: {updated}")
    print(f"  - Smartphones count BEFORE: {phone_before}")
    print(f"  - Smartphones count AFTER: {phone_after}")
    print(f"  - Phone Accessories count AFTER: {acc_after}")

if __name__ == "__main__":
    reclassify()

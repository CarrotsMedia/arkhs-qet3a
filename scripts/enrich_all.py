import sqlite3
import sys
from pathlib import Path

# Add parent directory to path to enable importing scripts
sys.path.append(str(Path(__file__).resolve().parent.parent))

from scripts.enrich_utils import generate_bilingual_data

DB_PATH = Path(__file__).resolve().parent.parent / "pc_parts.db"

def main():
    print("=" * 60)
    print("Starting Premium Bilingual Database Backfill & Enrichment")
    print("=" * 60)
    
    if not DB_PATH.exists():
        print(f"Error: Database not found at {DB_PATH}")
        return
        
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # 1. First ensure the columns exist in products table (in case they don't yet in some DB)
    columns = [
        ("name_ar", "TEXT"),
        ("name_en", "TEXT"),
        ("description_ar", "TEXT"),
        ("description_en", "TEXT")
    ]
    for col_name, col_type in columns:
        try:
            cur.execute(f"ALTER TABLE products ADD COLUMN {col_name} {col_type}")
            conn.commit()
            print(f"Added missing column '{col_name}' successfully.")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                pass
            else:
                raise e

    # 2. Cache subcategory slugs
    cur.execute("SELECT id, slug FROM subcategories")
    subcat_map = {row[0]: row[1] for row in cur.fetchall()}
    print(f"Cached {len(subcat_map)} subcategories.")
    
    # 3. Fetch all products
    cur.execute("SELECT id, name, brand, subcategory_id FROM products")
    products = cur.fetchall()
    total_products = len(products)
    print(f"Loaded {total_products} products for backfilling.")
    
    # 4. Process and prepare updates
    updates = []
    skipped = 0
    for idx, (pid, name, brand, subcat_id) in enumerate(products):
        subcat_slug = subcat_map.get(subcat_id, "other")
        
        try:
            name_en, name_ar, desc_en, desc_ar = generate_bilingual_data(name, brand, subcat_slug)
            updates.append((name_en, name_ar, desc_en, desc_ar, pid))
        except Exception as e:
            skipped += 1
            continue
            
    print(f"Processed features for all products. Ready to commit {len(updates)} records (Skipped: {skipped}).")
    
    # 5. Execute batch updates under a single transaction
    print("Writing updates to the database in a single fast transaction...")
    try:
        cur.execute("BEGIN TRANSACTION")
        cur.executemany("""
            UPDATE products 
            SET name_en = ?, name_ar = ?, description_en = ?, description_ar = ?
            WHERE id = ?
        """, updates)
        conn.commit()
        print(f"[SUCCESS] Successfully backfilled and enriched {len(updates)} products in SQLite!")
    except Exception as e:
        conn.rollback()
        print(f"[ERROR] Failed to run batch update transaction: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    main()

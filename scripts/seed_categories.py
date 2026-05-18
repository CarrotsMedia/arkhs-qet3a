import json
import sqlite3
from pathlib import Path

DB_PATH = "../pc_parts.db"
CONFIG_PATH = "../config/categories.json"

def seed_categories():
    print(f"Loading categories from {CONFIG_PATH} into {DB_PATH}...")
    
    config = json.loads(Path(CONFIG_PATH).read_text(encoding="utf-8"))
    
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # 1. Clear existing definitions just in case (optional, but good for clean seeding)
    # Actually, let's just use INSERT OR IGNORE / ON CONFLICT DO UPDATE
    
    for cat in config.get("categories", []):
        # Insert Category
        cur.execute("""
            INSERT INTO categories (slug, name, name_ar, icon, seo_title, seo_description, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(slug) DO UPDATE SET
                name=excluded.name,
                name_ar=excluded.name_ar,
                icon=excluded.icon,
                seo_title=excluded.seo_title,
                seo_description=excluded.seo_description,
                sort_order=excluded.sort_order
        """, (
            cat.get("slug"), cat.get("name"), cat.get("name_ar"), 
            cat.get("icon", "📦"), cat.get("seo_title"), 
            cat.get("seo_description"), cat.get("sort_order", 0)
        ))
        
        # Get category_id
        cur.execute("SELECT id FROM categories WHERE slug = ?", (cat.get("slug"),))
        cat_id = cur.fetchone()[0]
        
        # Insert Subcategories
        sub_sort = 0
        for sub in cat.get("subcategories", []):
            cur.execute("""
                INSERT INTO subcategories (slug, name, icon, category_id, sort_order)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(slug) DO UPDATE SET
                    name=excluded.name,
                    icon=excluded.icon,
                    category_id=excluded.category_id,
                    sort_order=excluded.sort_order
            """, (
                sub.get("slug"), sub.get("name"), sub.get("icon", "📦"), 
                cat_id, sub_sort
            ))
            sub_sort += 1
            
            # Get subcategory_id
            cur.execute("SELECT id FROM subcategories WHERE slug = ?", (sub.get("slug"),))
            sub_id = cur.fetchone()[0]
            
            # Insert Keywords for auto-classification
            for kw in sub.get("keywords", []):
                cur.execute("""
                    INSERT INTO category_keywords (keyword, category_id, subcategory_id)
                    SELECT ?, ?, ?
                    WHERE NOT EXISTS (
                        SELECT 1 FROM category_keywords WHERE keyword = ? AND category_id = ? AND subcategory_id = ?
                    )
                """, (kw.lower(), cat_id, sub_id, kw.lower(), cat_id, sub_id))

    conn.commit()
    conn.close()
    print("Successfully seeded categories!")

if __name__ == "__main__":
    seed_categories()

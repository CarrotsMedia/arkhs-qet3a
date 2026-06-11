"""
DB Loader
=========
Handles loading scraped JSON output into the SQLite database.
Wraps extraction, category auto-classification, brand normalization, 
and bilingual enrichment in a single database transaction.
"""

import json
from pathlib import Path
from db_schema import (
    UPSERT_PRODUCT_SQL,
    UPSERT_PRICE_SQL,
    INSERT_PRICE_HISTORY_SQL,
    normalize_brand,
    classify_product,
    get_db_connection
)
from scripts.enrich_utils import enrich_product_record

def load_scraper_output(json_file: str, store_slug: str, db_path: str = "database.db") -> int:
    """
    Loads JSON data from scrapers into the PostgreSQL database.
    Returns the number of products successfully loaded/updated.
    """
    path = Path(json_file)
    if not path.exists():
        print(f"Error: Scraper output file not found: {json_file}")
        return 0

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"Error reading JSON file {json_file}: {e}")
        return 0

    products = data.get("products", [])
    if not products:
        print(f"No products found in {json_file}")
        return 0

    conn = get_db_connection()
    cur = conn.cursor()

    # Get store ID
    cur.execute("SELECT id FROM stores WHERE slug = ?", (store_slug,))
    store_row = cur.fetchone()
    if not store_row:
        conn.close()
        raise ValueError(f"Store '{store_slug}' not found in DB")
    store_id = store_row[0]

    inserted = 0
    for p in products:
        if not p.get("name") or not p.get("id"):
            continue

        try:
            # Upsert Product
            cur.execute(UPSERT_PRODUCT_SQL, (
                p["id"],
                p["name"],
                normalize_brand(p.get("brand"), p["name"]),
                p.get("category"),
                json.dumps(p.get("specs", {})) if p.get("specs") else '{}',
                p.get("image_url"),
            ))
            product_id = cur.fetchone()[0]

            # Auto-classify into category hierarchy
            cat_id, subcat_id = classify_product(p["name"], p.get("category", ""), conn)
            if cat_id or subcat_id:
                cur.execute(
                    "UPDATE products SET category_id = ?, subcategory_id = ? WHERE id = ?",
                    (cat_id, subcat_id, product_id)
                )

            # Automatically translate and enrich the product record bilingually
            try:
                enrich_product_record(conn, product_id)
            except Exception as e:
                # Fallback in case of any enrichment issues to not crash the ingestion
                pass

            # Upsert Price
            if p.get("price_egp"):
                # Some scrapers return the URL in specs, others directly in 'product_url'
                url = p.get("product_url")
                if not url and p.get("specs") and "url" in p.get("specs"):
                    url = p.get("specs").get("url")

                cur.execute(UPSERT_PRICE_SQL, (
                    product_id,
                    store_id,
                    p["price_egp"],
                    p.get("original_price_egp"),
                    p.get("discount_pct"),
                    p.get("availability", "in_stock"),
                    url,
                ))
                
                # Save Price History
                cur.execute(INSERT_PRICE_HISTORY_SQL, (
                    product_id, store_id, p["price_egp"]
                ))
                inserted += 1
        except Exception as e:
            print(f"Failed to load product '{p.get('name')}': {e}")
            continue

    conn.commit()
    conn.close()
    print(f"[SUCCESS] Loaded {inserted} products from '{json_file}' into DB")
    return inserted

import json
import sqlite3
from pathlib import Path

# ==========================================
# Schema Definitions for SQLite
# ==========================================

CREATE_TABLES_SQL = """
-- ──────────────────────────────────────────────
-- Products
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    brand           TEXT,
    category        TEXT,
    specs           TEXT DEFAULT '{}',
    image_url       TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────────
-- Stores
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stores (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slug        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    website     TEXT,
    logo_url    TEXT
);

-- Add base stores
INSERT INTO stores (slug, name, website) VALUES
    ('sigma', 'Sigma Computer', 'https://sigma-computer.com'),
    ('badr-group', 'البدر جروب', 'https://badrgroup.com')
ON CONFLICT (slug) DO NOTHING;

-- ──────────────────────────────────────────────
-- Prices (latest snapshot per store)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prices (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id          INTEGER REFERENCES products(id) ON DELETE CASCADE,
    store_id            INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    price_egp           REAL,
    original_price_egp  REAL,
    discount_pct        REAL,
    availability        TEXT DEFAULT 'in_stock',
    product_url         TEXT,
    scraped_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE (product_id, store_id)
);

-- ──────────────────────────────────────────────
-- Price History
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER REFERENCES products(id) ON DELETE CASCADE,
    store_id    INTEGER REFERENCES stores(id) ON DELETE CASCADE,
    price_egp   REAL,
    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────────
-- Indexes
-- ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_name   ON products (name);
CREATE INDEX IF NOT EXISTS idx_products_cat    ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_brand  ON products (brand);
CREATE INDEX IF NOT EXISTS idx_prices_product  ON prices (product_id);
CREATE INDEX IF NOT EXISTS idx_prices_store    ON prices (store_id);
CREATE INDEX IF NOT EXISTS idx_prices_price    ON prices (price_egp);

-- ──────────────────────────────────────────────
-- View: Cheapest prices per product
-- ──────────────────────────────────────────────
CREATE VIEW IF NOT EXISTS cheapest_prices AS
SELECT
    p.id,
    p.slug,
    p.name,
    p.brand,
    p.category,
    p.specs,
    p.image_url,
    MIN(pr.price_egp) AS min_price_egp,
    COUNT(pr.store_id) AS store_count
FROM products p
LEFT JOIN prices pr ON pr.product_id = p.id
    AND pr.availability = 'in_stock'
GROUP BY p.id;

-- ──────────────────────────────────────────────
-- View: Product with all prices from all stores
-- ──────────────────────────────────────────────
CREATE VIEW IF NOT EXISTS product_all_prices AS
SELECT
    p.id AS product_id,
    p.name,
    p.brand,
    p.category,
    s.name AS store_name,
    s.slug AS store_slug,
    pr.price_egp,
    pr.original_price_egp,
    pr.discount_pct,
    pr.availability,
    pr.product_url,
    pr.scraped_at
FROM products p
JOIN prices pr ON pr.product_id = p.id
JOIN stores s  ON pr.store_id  = s.id
ORDER BY p.id, pr.price_egp;
"""

# ==========================================
# Queries
# ==========================================
UPSERT_PRODUCT_SQL = """
INSERT INTO products (slug, name, brand, category, specs, image_url)
VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT (slug) DO UPDATE SET
    name      = excluded.name,
    brand     = excluded.brand,
    specs     = excluded.specs,
    image_url = excluded.image_url,
    updated_at = CURRENT_TIMESTAMP
RETURNING id;
"""

UPSERT_PRICE_SQL = """
INSERT INTO prices (product_id, store_id, price_egp, original_price_egp, discount_pct, availability, product_url)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT (product_id, store_id) DO UPDATE SET
    price_egp          = excluded.price_egp,
    original_price_egp = excluded.original_price_egp,
    discount_pct       = excluded.discount_pct,
    availability       = excluded.availability,
    product_url        = excluded.product_url,
    scraped_at         = CURRENT_TIMESTAMP;
"""

INSERT_PRICE_HISTORY_SQL = """
INSERT INTO price_history (product_id, store_id, price_egp)
VALUES (?, ?, ?);
"""

# ==========================================
# Database Loader Function
# ==========================================
def init_db(db_path: str = "pc_parts.db"):
    """Creates tables if they don't exist."""
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.executescript(CREATE_TABLES_SQL)
    conn.commit()
    conn.close()
    print(f"[SUCCESS] Database {db_path} Initialized")

def load_scraper_output(json_file: str, store_slug: str, db_path: str = "pc_parts.db"):
    """Loads JSON data from scrapers into the SQLite database."""
    path = Path(json_file)
    if not path.exists():
        print(f"Error: {json_file} not found.")
        return

    data = json.loads(path.read_text(encoding="utf-8"))
    products = data.get("products", [])

    conn = sqlite3.connect(db_path)
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

        # Upsert Product
        cur.execute(UPSERT_PRODUCT_SQL, (
            p["id"],
            p["name"],
            p.get("brand"),
            p.get("category"),
            json.dumps(p.get("specs", {})) if p.get("specs") else '{}',
            p.get("image_url"),
        ))
        product_id = cur.fetchone()[0]

        # Upsert Price
        if p.get("price_egp"):
            cur.execute(UPSERT_PRICE_SQL, (
                product_id,
                store_id,
                p["price_egp"],
                p.get("original_price_egp"),
                p.get("discount_pct"),
                p.get("availability", "in_stock"),
                p.get("specs", {}).get("url") if p.get("specs") and "url" in p.get("specs") else None,
            ))
            
            # Save Price History
            cur.execute(INSERT_PRICE_HISTORY_SQL, (
                product_id, store_id, p["price_egp"]
            ))
            inserted += 1

    conn.commit()
    conn.close()
    print(f"[SUCCESS] Loaded {inserted} products from '{json_file}' into DB")


if __name__ == "__main__":
    init_db()
    
    # Check if there are generated JSON lists to preload the DB
    sigma_json = Path("output/search_rtx_4070.json")
    if sigma_json.exists():
        load_scraper_output(str(sigma_json), "sigma")
        
    elbadr_json = Path("output/elbadr_search_4070.json")
    if elbadr_json.exists():
        load_scraper_output(str(elbadr_json), "badr-group")

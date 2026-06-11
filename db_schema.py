import json
import os
import psycopg2
import psycopg2.extras
from pathlib import Path
from dotenv import load_dotenv
from scripts.enrich_utils import enrich_product_record

# Load env variables
load_dotenv(Path(__file__).resolve().parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://arkhsly_admin:arkhsly_secure_pass@localhost:5432/arkhsly_db")

class PgCursorWrapper:
    def __init__(self, pg_cur):
        self.pg_cur = pg_cur

    def execute(self, sql, params=None):
        if sql.strip().upper().startswith("PRAGMA"):
            return self
        sql_translated = sql.replace('?', '%s')
        self.pg_cur.execute(sql_translated, params)
        return self

    def fetchone(self):
        try:
            return self.pg_cur.fetchone()
        except Exception:
            return None

    def fetchall(self):
        try:
            return self.pg_cur.fetchall()
        except Exception:
            return []

    def executescript(self, sql_script):
        for statement in sql_script.split(';'):
            cleaned = statement.strip()
            if cleaned:
                cleaned = cleaned.replace("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY")
                cleaned = cleaned.replace("DATETIME DEFAULT CURRENT_TIMESTAMP", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
                cleaned = cleaned.replace("ON CONFLICT (slug) DO NOTHING", "ON CONFLICT DO NOTHING")
                try:
                    self.execute(cleaned)
                except Exception:
                    pass

class PgConnWrapper:
    def __init__(self, pg_conn):
        self.pg_conn = pg_conn
        self._row_factory = None

    @property
    def row_factory(self):
        return self._row_factory

    @row_factory.setter
    def row_factory(self, factory):
        self._row_factory = factory

    def cursor(self):
        cur = self.pg_conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        return PgCursorWrapper(cur)

    def execute(self, sql, params=None):
        cur = self.cursor()
        cur.execute(sql, params)
        return cur

    def commit(self):
        self.pg_conn.commit()

    def close(self):
        self.pg_conn.close()

def get_db_connection():
    conn_str = DATABASE_URL
    if conn_str.startswith("postgres://"):
        conn_str = conn_str.replace("postgres://", "postgresql://", 1)
    conn = psycopg2.connect(conn_str)
    return PgConnWrapper(conn)

# ==========================================
# Schema Definitions for SQLite
# ==========================================

CREATE_TABLES_SQL = """
-- ──────────────────────────────────────────────
-- Categories (top-level: Electronics, Fashion, etc.)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    name_ar         TEXT,
    icon            TEXT DEFAULT '📦',
    banner_image    TEXT,
    seo_title       TEXT,
    seo_description TEXT,
    sort_order      INTEGER DEFAULT 0,
    is_active       INTEGER DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────────
-- Subcategories (can nest: parent_id for multi-level)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subcategories (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    icon            TEXT DEFAULT '📦',
    category_id     INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    parent_id       INTEGER REFERENCES subcategories(id) ON DELETE CASCADE,
    seo_title       TEXT,
    seo_description TEXT,
    sort_order      INTEGER DEFAULT 0,
    is_active       INTEGER DEFAULT 1,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────────
-- Brands (normalized)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    logo_url        TEXT,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────────
-- Products
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    slug              TEXT UNIQUE NOT NULL,
    name              TEXT NOT NULL,
    name_ar           TEXT,
    name_en           TEXT,
    description_ar    TEXT,
    description_en    TEXT,
    brand             TEXT,
    brand_id          INTEGER REFERENCES brands(id),
    category          TEXT,
    category_id       INTEGER REFERENCES categories(id),
    subcategory_id    INTEGER REFERENCES subcategories(id),
    merged_product_id INTEGER REFERENCES product_families(id),
    specs             TEXT DEFAULT '{}',
    image_url         TEXT,
    is_featured       INTEGER DEFAULT 0,
    is_trending       INTEGER DEFAULT 0,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
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
    ('badr-group', 'البدر جروب', 'https://badrgroup.com'),
    ('compumarts', 'Compumarts', 'https://www.compumarts.com'),
    ('noon', 'Noon', 'https://www.noon.com/egypt-en/'),
    ('amazon', 'Amazon', 'https://www.amazon.eg'),
    ('maximum-hardware', 'Maximum Hardware', 'https://maximumhardware.store'),
    ('btech', 'B.TECH', 'https://btech.com'),
    ('dubaiphone', 'Dubai Phone', 'https://www.dubaiphone.net'),
    ('dream2000', 'Dream 2000', 'https://dream2000.com'),
    ('alsheikhstores', 'Al Sheikh Stores', 'https://alsheikhstores.com'),
    ('rayashop', 'Raya Shop', 'https://www.rayashop.com'),
    ('2b', '2B', 'https://2b.com.eg'),
    ('jumia', 'Jumia', 'https://www.jumia.com.eg')
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
-- Product Attributes (definitions per category)
-- e.g. "RAM", "Screen Size" for Electronics
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_attributes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slug            TEXT NOT NULL,
    name            TEXT NOT NULL,
    attribute_type  TEXT DEFAULT 'text',
    category_id     INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    subcategory_id  INTEGER REFERENCES subcategories(id) ON DELETE CASCADE,
    filterable      INTEGER DEFAULT 1,
    sort_order      INTEGER DEFAULT 0,
    UNIQUE(slug, category_id)
);

-- ──────────────────────────────────────────────
-- Product Attribute Values (actual values per product)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_attribute_values (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id      INTEGER REFERENCES products(id) ON DELETE CASCADE,
    attribute_id    INTEGER REFERENCES product_attributes(id) ON DELETE CASCADE,
    value           TEXT NOT NULL,
    UNIQUE(product_id, attribute_id)
);

-- ──────────────────────────────────────────────
-- Category keyword mappings (for auto-classification)
-- ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS category_keywords (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword         TEXT NOT NULL,
    category_id     INTEGER REFERENCES categories(id) ON DELETE CASCADE,
    subcategory_id  INTEGER REFERENCES subcategories(id),
    weight          INTEGER DEFAULT 1
);

-- ──────────────────────────────────────────────
-- Indexes
-- ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_name      ON products (name);
CREATE INDEX IF NOT EXISTS idx_products_cat       ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_cat_id    ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_subcat_id ON products (subcategory_id);
CREATE INDEX IF NOT EXISTS idx_products_brand     ON products (brand);
CREATE INDEX IF NOT EXISTS idx_products_brand_id  ON products (brand_id);
CREATE INDEX IF NOT EXISTS idx_products_featured  ON products (is_featured);
CREATE INDEX IF NOT EXISTS idx_products_trending  ON products (is_trending);
CREATE INDEX IF NOT EXISTS idx_prices_product     ON prices (product_id);
CREATE INDEX IF NOT EXISTS idx_prices_store       ON prices (store_id);
CREATE INDEX IF NOT EXISTS idx_prices_price       ON prices (price_egp);
CREATE INDEX IF NOT EXISTS idx_subcategories_cat  ON subcategories (category_id);
CREATE INDEX IF NOT EXISTS idx_subcategories_parent ON subcategories (parent_id);
CREATE INDEX IF NOT EXISTS idx_attr_values_product ON product_attribute_values (product_id);
CREATE INDEX IF NOT EXISTS idx_attr_values_attr   ON product_attribute_values (attribute_id);
CREATE INDEX IF NOT EXISTS idx_cat_keywords       ON category_keywords (keyword);

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
# CATEGORY_MAP — Fallback normalizer
# Maps raw scraper categories → normalized subcategory slugs
# Used ONLY during data import, NOT by frontend
# ==========================================

CATEGORY_MAP = {
    # Laptops
    'GAMING LAPTOP': 'laptops', 'CONSUMER LAPTOP': 'laptops', 'USED LAPTOP': 'laptops',
    'laptops': 'laptops', 'Entry & Mid Gaming Laptop': 'laptops',
    # Graphics Cards
    'GRAPHIC CARDS': 'graphics-cards', 'gpu': 'graphics-cards', 'GRAPHIC CARD HOLDER': 'graphics-cards',
    # Processors
    'Computer Processors': 'processors', 'processors': 'processors',
    'Ryzen 3000 Series (Zen 2)': 'processors', 'Ryzen 5000 Series (Zen 3)': 'processors',
    'Ryzen 9000 Series (Zen 5)': 'processors',
    # Motherboards
    'Motherboards': 'motherboards', 'motherboards': 'motherboards',
    # RAM & Memory
    'RAM': 'ram-memory', 'Memory Cards': 'ram-memory',
    # Storage
    'storage': 'storage', 'SSD': 'storage', 'External Hard': 'storage',
    'HDD': 'storage', 'USB Flash Drives': 'storage', 'SSD Housing': 'storage',
    # Cases
    'cases': 'cases', 'COMPUTER CASE': 'cases', 'CASE Accessories': 'cases',
    # Power Supplies
    'Computer Power Supplies': 'power-supplies', 'psu': 'power-supplies',
    'Power Supply': 'power-supplies', 'UPS': 'power-supplies',
    'Power Strip': 'power-supplies', 'Power Inverter': 'power-supplies',
    'Power Station': 'power-supplies',
    # Cooling
    'coolers': 'cooling', 'Liquid Cooler': 'cooling', 'AIR COOLER': 'cooling',
    'COMPUTER FAN': 'cooling', 'Cooling Kit': 'cooling', 'THERMAL PASTE': 'cooling',
    'Thermal pad': 'cooling', 'Thermal Pad': 'cooling', 'Contact Frame': 'cooling',
    'CPU Contact Frame': 'cooling', 'liq': 'cooling',
    # Monitors
    'Monitors': 'monitors', 'monitors': 'monitors', 'Gaming Monitor': 'monitors',
    'Monitor Arm': 'monitors', 'Monitor Mount': 'monitors', 'mount': 'monitors',
    # Keyboards & Mice
    'Keyboards': 'keyboards-mice', 'Keyboard (Office/Mechanical/Gaming)': 'keyboards-mice',
    'Mouse': 'keyboards-mice', 'MOUSE PAD': 'keyboards-mice', 'Wrist Rests': 'keyboards-mice',
    # Audio
    'Headphones': 'audio', 'SPEAKERS': 'audio', 'Earphone': 'audio',
    'EARBUDS': 'audio', 'Headset': 'audio', 'Headsets (Gaming/Wireless/Studio)': 'audio',
    'HEADPHONE STAND': 'audio', 'Microphones': 'audio', 'MIC STAND': 'audio', 'MIC ARM': 'audio',
    # Networking
    'ROUTERS': 'networking', 'SWITCHES': 'networking', 'Network': 'networking',
    'PCI ADAPTERS': 'networking', 'USB ADAPTERS': 'networking', 'MIFI': 'networking',
    # Gaming Accessories
    'Game Controllers': 'gaming-accessories', 'Gaming Chairs': 'gaming-accessories',
    'Racing Wheel': 'gaming-accessories', 'gaming controller': 'gaming-accessories',
    'Desks': 'desks', 'Stream Deck': 'gaming-accessories', 'Handheld': 'gaming-accessories',
    'PlayStation': 'gaming-accessories', 'Video Game Console Accessories': 'gaming-accessories',
    # Cables & Adapters
    'Cables & Converters': 'cables-adapters', 'Chargers': 'cables-adapters',
    'Desktop Charger': 'cables-adapters', 'Car charger': 'cables-adapters',
    'Power Bank': 'cables-adapters',
    # Cameras & Streaming
    'Webcams': 'cameras-streaming', 'HD Cameras': 'cameras-streaming',
    'Wireless Cameras': 'cameras-streaming', 'IP Cameras': 'cameras-streaming',
    'Capture Card': 'cameras-streaming', 'Green Screen': 'cameras-streaming',
    'Ring Light': 'cameras-streaming', 'LIGHT STRIP': 'cameras-streaming',
    'PROJECTOR': 'cameras-streaming', 'NVR': 'cameras-streaming',
    # PC Bundles
    'PC Bundles': 'pc-bundles', 'Accessory Bundles': 'pc-bundles',
    'Pre-Build PC': 'pc-bundles', 'USED PC': 'pc-bundles', 'All-in-One PCs': 'pc-bundles',
    # Laptop Accessories
    'Laptop Bags': 'laptop-accessories', 'Laptop Battery': 'laptop-accessories',
    'STAND LAPTOP': 'laptop-accessories', 'Cooling Pad': 'laptop-accessories',
    'Screen Protectors': 'laptop-accessories',
    # New marketplace categories
    'mobile phones': 'smartphones', 'fridge': 'refrigerators',
    'mobiles': 'smartphones', 'موبايلات': 'smartphones', 'phones': 'smartphones',
    'tablets': 'tablets', 'تابلت': 'tablets', 'smartphones': 'smartphones',
    'search_result': None,  # Will be auto-classified
}


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
# Auto-Classification Engine & Brand Normalization
# ==========================================
BRAND_NORMALIZATION_MAP = {
    'samsung': 'Samsung', 'سامسونج': 'Samsung',
    'apple': 'Apple', 'ابل': 'Apple', 'أبل': 'Apple', 'iphone': 'Apple',
    'xiaomi': 'Xiaomi', 'شاومى': 'Xiaomi', 'شاومي': 'Xiaomi', 'redmi': 'Xiaomi',
    'oppo': 'Oppo', 'اوبو': 'Oppo', 'أوبو': 'Oppo',
    'realme': 'Realme', 'ريلمي': 'Realme', 'ريلمى': 'Realme',
    'infinix': 'Infinix', 'انفنيكس': 'Infinix', 'أنفنيكس': 'Infinix', 'انفنكس': 'Infinix',
    'honor': 'Honor', 'هونر': 'Honor',
    'vivo': 'Vivo', 'فيفو': 'Vivo',
    'nokia': 'Nokia', 'نوكيا': 'Nokia',
    'tecno': 'Tecno', 'تكنو': 'Tecno', 'tecno-ar': 'Tecno',
    'motorola': 'Motorola', 'موتورولا': 'Motorola', 'موتوريلا': 'Motorola',
    'nothing': 'Nothing', 'نوثينج': 'Nothing',
    'huawei': 'Huawei', 'هواوي': 'Huawei', 'هواوى': 'Huawei',
}

GENERIC_BRANDS = {'generic', 'unknown', 'موبيلات', 'mobile phones', 'tab/mac', 'smart watches', 'audio', 'gaming', 'accessories', ''}

def normalize_brand(raw_brand: str, title: str) -> str:
    brand_lower = raw_brand.strip().lower() if raw_brand else ""
    title_lower = title.strip().lower() if title else ""
    
    # 1. Normalize based on raw brand
    if brand_lower in BRAND_NORMALIZATION_MAP:
        return BRAND_NORMALIZATION_MAP[brand_lower]
        
    # 2. Try title matching
    for kw, normalized in BRAND_NORMALIZATION_MAP.items():
        if kw in title_lower:
            return normalized
            
    # 3. Fallback to raw brand titlecase if not generic
    if raw_brand and raw_brand.strip():
        if brand_lower not in GENERIC_BRANDS:
            return raw_brand.strip().title()
            
    return "Generic"

def classify_product(product_name: str, raw_category: str, db_conn=None):
    """
    Classify a product into category/subcategory using:
    1. CATEGORY_MAP fallback for known raw categories
    2. Keyword matching against product title
    Returns (category_id, subcategory_id) or (None, None)
    """
    if not db_conn:
        return None, None

    name_lower = product_name.lower() if product_name else ""
    if not name_lower:
        return None, None

    # Step 1: Try CATEGORY_MAP
    subcat_slug = CATEGORY_MAP.get(raw_category)
    if subcat_slug:
        row = db_conn.execute(
            "SELECT id, category_id FROM subcategories WHERE slug = ?", (subcat_slug,)
        ).fetchone()
        if row:
            cat_id, subcat_id = row[1], row[0]
            # Override for smartphones accessories
            if subcat_slug == 'smartphones':
                accessory_keywords = {
                    'case', 'cover', 'glass', 'protector', 'holder', 'ring light', 'stand',
                    'charger', 'cable', 'power bank', 'headset', 'earphone', 'earbud', 'airpod',
                    'جراب', 'شاحن', 'لاصقة', 'لاصقه', 'كابل', 'سماعة', 'سماعه', 'سماعات', 'حامل', 'اسكرينة', 'اسكرينه'
                }
                if any(kw in name_lower for kw in accessory_keywords):
                    acc_row = db_conn.execute("SELECT id, category_id FROM subcategories WHERE slug = 'phone-accessories'").fetchone()
                    if acc_row:
                        return acc_row[1], acc_row[0]
            return cat_id, subcat_id

    # Step 2: Keyword matching on product name
    rows = db_conn.execute(
        "SELECT ck.category_id, ck.subcategory_id, ck.keyword, ck.weight FROM category_keywords ck"
    ).fetchall()

    scores = {}  # (cat_id, subcat_id) -> score
    for cat_id, subcat_id, keyword, weight in rows:
        if keyword.lower() in name_lower:
            key = (cat_id, subcat_id)
            scores[key] = scores.get(key, 0) + weight

    if scores:
        best = max(scores, key=scores.get)
        best_cat_id, best_subcat_id = best[0], best[1]
        
        # Override for smartphones accessories
        subcat_row = db_conn.execute("SELECT slug FROM subcategories WHERE id = ?", (best_subcat_id,)).fetchone()
        if subcat_row and subcat_row[0] == 'smartphones':
            accessory_keywords = {
                'case', 'cover', 'glass', 'protector', 'holder', 'ring light', 'stand',
                'charger', 'cable', 'power bank', 'headset', 'earphone', 'earbud', 'airpod',
                'جراب', 'شاحن', 'لاصقة', 'لاصقه', 'كابل', 'سماعة', 'سماعه', 'سماعات', 'حامل', 'اسكرينة', 'اسكرينه'
            }
            if any(kw in name_lower for kw in accessory_keywords):
                acc_row = db_conn.execute("SELECT id, category_id FROM subcategories WHERE slug = 'phone-accessories'").fetchone()
                if acc_row:
                    return acc_row[1], acc_row[0]
                    
        return best_cat_id, best_subcat_id

    return None, None


# ==========================================
# Database Loader Function
# ==========================================
def init_db(db_path: str = "database.db"):
    """Creates tables if they don't exist in PostgreSQL."""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.executescript(CREATE_TABLES_SQL)
    conn.commit()
    conn.close()
    print("[SUCCESS] PostgreSQL Database Initialized")

def load_scraper_output(json_file: str, store_slug: str, db_path: str = "database.db"):
    """Loads JSON data from scrapers into the SQLite database. (Delegates to scrapers.db_loader)"""
    from scrapers.db_loader import load_scraper_output as loader
    return loader(json_file, store_slug, db_path)



if __name__ == "__main__":
    init_db()
    
    # Check if there are generated JSON lists to preload the DB
    sigma_json = Path("output/search_rtx_4070.json")
    if sigma_json.exists():
        load_scraper_output(str(sigma_json), "sigma")
        
    elbadr_json = Path("output/elbadr_search_4070.json")
    if elbadr_json.exists():
        load_scraper_output(str(elbadr_json), "badr-group")
        
    compumarts_json = Path("output/compumarts_all_products.json")
    if compumarts_json.exists():
        load_scraper_output(str(compumarts_json), "compumarts")

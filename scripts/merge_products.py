import sqlite3
import re
import sys
from pathlib import Path

# Add parent directory to sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent))

DB_PATH = Path(__file__).resolve().parent.parent / "pc_parts.db"

TRANSLATION_MAP = {
    'ايفون': 'iphone',
    'برو': 'pro',
    'ماكس': 'max',
    'بلس': 'plus',
    'الترا': 'ultra',
    'ميني': 'mini',
    'جالاكسي': 'galaxy',
    'جالكسي': 'galaxy',
    'نوت': 'note',
    'رينو': 'reno',
    'بوكو': 'poco',
    'ريدمي': 'redmi',
    'لايت': 'lite',
    'سبارك': 'spark',
    'هوت': 'hot',
    'ماجيك': 'magic',
    'موتو': 'moto',
    'ايباد': 'ipad',
    'تاب': 'tab',
    'في': 'v',
    'واي': 'y',
    'ايه': 'a',
    'سي': 'c',
    'اكس': 'x',
}

def clean_arabic_numbers(text: str) -> str:
    arabic_to_english = {
        '٠':'0', '١':'1', '٢':'2', '٣':'3', '٤':'4', '٥':'5', '٦':'6', '٧':'7', '٨':'8', '٩':'9'
    }
    for ar, en in arabic_to_english.items():
        text = text.replace(ar, en)
    return text

def parse_product_features(name: str, brand: str):
    name_lower = clean_arabic_numbers(name.lower())
    
    # Standardize multiple spaces
    name_lower = re.sub(r'\s+', ' ', name_lower)
    
    # 0. Strip network terms like 5g, 4g, 3g, lte so they don't interfere
    name_lower = re.sub(r'\b(?:5g|4g|3g|lte)\b', ' ', name_lower)
    name_lower = re.sub(r'\s+', ' ', name_lower)
    
    # 1. Extract RAM first (Common values: 1, 2, 3, 4, 6, 8, 12, 16, 18, 24, 32, 64)
    ram = None
    ram_match_a = re.search(r'\b(1|2|3|4|6|8|12|16|18|24|32|64)\s*(?:gb\s*ram|جيجا\s*رام|جيجابايت\s*رام|رام|ram)', name_lower)
    ram_match_b = re.search(r'\b(?:رامات|رام|ram)\s*(1|2|3|4|6|8|12|16|18|24|32|64)\b', name_lower)
    
    if ram_match_a:
        ram = ram_match_a.group(1) + "ram"
        name_lower = name_lower.replace(ram_match_a.group(0), ' ')
    elif ram_match_b:
        ram = ram_match_b.group(1) + "ram"
        name_lower = name_lower.replace(ram_match_b.group(0), ' ')
        
    # 2. Extract Storage (GB/TB)
    storage = None
    tb_match = re.search(r'\b(1|2)\s*(?:tb|تيرابايت|تيرا)', name_lower)
    if tb_match:
        storage = tb_match.group(1) + "tb"
        name_lower = name_lower.replace(tb_match.group(0), ' ')
    else:
        gb_match = re.search(r'\b(8|16|32|64|128|256|512)\s*(?:gb|جيجا|جيجابايت|g)\b', name_lower)
        if gb_match:
            storage = gb_match.group(1) + "gb"
            name_lower = name_lower.replace(gb_match.group(0), ' ')
            
    # 3. Strip out common terms
    words_to_strip = [
        'ثنائي الشريحة', 'بشريحتي اتصال', 'بشريحتين', 'شريحتين', 'اتصال', 'مع فيس تايم', 'فيس تايم',
        'موبايل', 'هاتف', 'تلفون', 'ذكي', 'جديد', 'نسخة', 'ضمان', 'الجيل الرابع', 'الجيل الخامس', 'شبكة', 'يدعم',
        'dual sim', 'sim', '4g', '5g', 'lte', 'mobile', 'phone', 'smartphone', 'with facetime', 'facetime',
        'awesome', 'color', 'black', 'white', 'blue', 'green', 'grey', 'gray', 'silver', 'gold', 'navy',
        'اسود', 'ابيض', 'ازرق', 'اخضر', 'رمادي', 'فضي', 'ذهبي', 'كحلي',
        'سعة', 'ذاكرة', 'عشوائية', 'جيجابايت', 'جيجا', 'تيرابايت', 'تيرا', 'رام', 'gb', 'tb', 'ram'
    ]
    
    model_str = name_lower
    brand_lower = brand.lower() if brand else ""
    if brand_lower:
        model_str = model_str.replace(brand_lower, "")
        
    for w in words_to_strip:
        model_str = model_str.replace(w, ' ')
        
    # Clean punctuation
    model_str = re.sub(r'[–\-\—\+\,\.\:\(\)\[\]\/\|]', ' ', model_str)
    
    # Translate Arabic core model terms to English
    tokens = model_str.split()
    translated_tokens = []
    for token in tokens:
        translated_tokens.append(TRANSLATION_MAP.get(token, token))
        
    # Alphanumeric only
    cleaned_tokens = [re.sub(r'\W+', '', t) for t in translated_tokens]
    cleaned_tokens = [t for t in cleaned_tokens if t]
    
    model_key = " ".join(cleaned_tokens)
    return storage, ram, model_key

def merge():
    print(f"Connecting to database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # 1. Add merged_product_id column if not exists
    print("Checking database schema for merged_product_id column...")
    try:
        cur.execute("ALTER TABLE products ADD COLUMN merged_product_id INTEGER REFERENCES products(id)")
        conn.commit()
        print("Successfully added 'merged_product_id' column to 'products' table.")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("'merged_product_id' column already exists in 'products' table. Proceeding...")
        else:
            raise e
            
    # Reset all merged_product_id to NULL before re-merging
    print("Resetting existing product merging linkages...")
    cur.execute("UPDATE products SET merged_product_id = NULL")
    conn.commit()
    
    # 2. Query all products from database
    print("Fetching all products for grouping analysis...")
    cur.execute("SELECT id, name, brand, subcategory_id, image_url FROM products")
    rows = cur.fetchall()
    print(f"Loaded {len(rows)} products.")
    
    # Group products by key
    groups = {} # (sub_id, brand, storage, ram, model_key) -> [list of product tuples]
    for pid, name, brand, sub_id, img_url in rows:
        # Standardize brand name
        brand_normalized = brand or "Generic"
        storage, ram, model_key = parse_product_features(name, brand_normalized)
        
        # We only group if the model key is not empty
        if not model_key:
            model_key = f"unclassified_product_{pid}"
            
        key = (sub_id, brand_normalized.lower(), storage, ram, model_key)
        if key not in groups:
            groups[key] = []
        groups[key].append((pid, name, img_url))
        
    print(f"Grouping complete. Total groups formed: {len(groups)}")
    
    # Apply merging linkage
    print("Writing merged linkages to database...")
    merged_groups_count = 0
    total_linked_products = 0
    
    for key, products in groups.items():
        if len(products) > 1:
            merged_groups_count += 1
            total_linked_products += len(products)
            
            # Select the best "master" product inside this group
            # Criteria: must have image_url if possible, then choose the one with the longest name
            sorted_products = sorted(
                products, 
                key=lambda p: (1 if p[2] else 0, len(p[1])), 
                reverse=True
            )
            master_id = sorted_products[0][0]
            
            # Set merged_product_id = master_id for all products in the group
            for pid, name, _ in products:
                cur.execute("UPDATE products SET merged_product_id = ? WHERE id = ?", (master_id, pid))
        else:
            # Single product group, keep merged_product_id as NULL
            pass
            
    conn.commit()
    conn.close()
    
    print("\nMerging Execution Summary:")
    print(f"  - Total Products Analysed: {len(rows)}")
    print(f"  - Total Unique Groups formed: {len(groups)}")
    print(f"  - Total Merged Groups (with >1 stores): {merged_groups_count}")
    print(f"  - Total Products linked under Master records: {total_linked_products}")
    print("Done!")

if __name__ == "__main__":
    merge()

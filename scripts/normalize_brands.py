import sqlite3

DB_PATH = "pc_parts.db"

BRAND_NORMALIZATION_MAP = {
    # Samsung
    'samsung': 'Samsung', 'سامسونج': 'Samsung',
    # Apple
    'apple': 'Apple', 'ابل': 'Apple', 'أبل': 'Apple', 'iphone': 'Apple',
    # Xiaomi
    'xiaomi': 'Xiaomi', 'شاومى': 'Xiaomi', 'شاومي': 'Xiaomi', 'redmi': 'Xiaomi',
    # Oppo
    'oppo': 'Oppo', 'اوبو': 'Oppo', 'أوبو': 'Oppo',
    # Realme
    'realme': 'Realme', 'ريلمي': 'Realme', 'ريلمى': 'Realme',
    # Infinix
    'infinix': 'Infinix', 'انفنيكس': 'Infinix', 'أنفنيكس': 'Infinix', 'انفنكس': 'Infinix',
    # Honor
    'honor': 'Honor', 'هونر': 'Honor',
    # Vivo
    'vivo': 'Vivo', 'فيفو': 'Vivo',
    # Nokia
    'nokia': 'Nokia', 'نوكيا': 'Nokia',
    # Tecno
    'tecno': 'Tecno', 'تكنو': 'Tecno', 'tecno-ar': 'Tecno',
    # Motorola
    'motorola': 'Motorola', 'موتورولا': 'Motorola', 'موتوريلا': 'Motorola',
    # Nothing
    'nothing': 'Nothing', 'نوثينج': 'Nothing',
    # Huawei
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

def run_normalization():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    cur.execute("SELECT id, name, brand FROM products WHERE category_id = 1 OR subcategory_id = 1")
    rows = cur.fetchall()
    
    print(f"Normalizing brands for {len(rows)} products...")
    
    updated = 0
    for pid, name, brand in rows:
        normalized = normalize_brand(brand, name)
        if normalized != brand:
            cur.execute("UPDATE products SET brand = ? WHERE id = ?", (normalized, pid))
            updated += 1
            
    conn.commit()
    conn.close()
    print(f"Successfully normalized {updated} brand names!")

if __name__ == "__main__":
    run_normalization()

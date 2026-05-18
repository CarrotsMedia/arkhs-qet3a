import sqlite3
import re
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "pc_parts.db"

ARABIC_BRANDS = {
    'samsung': 'سامسونج',
    'apple': 'ابل',
    'xiaomi': 'شاومي',
    'oppo': 'اوبو',
    'realme': 'ريلمي',
    'vivo': 'فيفو',
    'infinix': 'انفينيكس',
    'tecno': 'تكنو',
    'motorola': 'موتورولا',
    'nokia': 'نوكيا',
    'honor': 'هونر',
    'huawei': 'هواوي',
    'nothing': 'نثنج',
    'oneplus': 'ون بلس',
    'google': 'جوجل',
}

ARABIC_MODEL_TERMS = {
    'galaxy': 'جالاكسي',
    'iphone': 'ايفون',
    'reno': 'رينو',
    'redmi': 'ريدمي',
    'spark': 'سبارك',
    'hot': 'هوت',
    'magic': 'ماجيك',
    'note': 'نوت',
    'pro': 'برو',
    'max': 'ماكس',
    'plus': 'بلس',
    'ultra': 'الترا',
    'lite': 'لايت',
    'fe': 'إف إي',
    'play': 'بلاي',
    'neo': 'نيو',
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
    name_lower = re.sub(r'\s+', ' ', name_lower)
    
    # Extract network (5G/4G)
    network = "4G"
    if "5g" in name_lower:
        network = "5G"
        
    name_lower = re.sub(r'\b(?:5g|4g|3g|lte)\b', ' ', name_lower)
    name_lower = re.sub(r'\s+', ' ', name_lower)
    
    # 1. Extract RAM
    ram = None
    ram_match_a = re.search(r'\b(1|2|3|4|6|8|12|16|18|24|32|64)\s*(?:gb\s*ram|جيجا\s*رام|جيجابايت\s*رام|رام|ram)', name_lower)
    ram_match_b = re.search(r'\b(?:رامات|رام|ram)\s*(1|2|3|4|6|8|12|16|18|24|32|64)\b', name_lower)
    if ram_match_a:
        ram = ram_match_a.group(1)
        name_lower = name_lower.replace(ram_match_a.group(0), ' ')
    elif ram_match_b:
        ram = ram_match_b.group(1)
        name_lower = name_lower.replace(ram_match_b.group(0), ' ')
        
    # 2. Extract Storage
    storage = None
    tb_match = re.search(r'\b(1|2)\s*(?:tb|تيرابايت|تيرا)', name_lower)
    if tb_match:
        storage = tb_match.group(1) + "TB"
        name_lower = name_lower.replace(tb_match.group(0), ' ')
    else:
        gb_match = re.search(r'\b(8|16|32|64|128|256|512)\s*(?:gb|جيجا|جيجابايت|g)\b', name_lower)
        if gb_match:
            storage = gb_match.group(1) + "GB"
            name_lower = name_lower.replace(gb_match.group(0), ' ')
            
    # 3. Model Key
    words_to_strip = [
        'ثنائي الشريحة', 'بشريحتي اتصال', 'بشريحتين', 'شريحتين', 'اتصال', 'مع فيس تايم', 'فيس تايم',
        'موبايل', 'هاتف', 'تلفون', 'ذكي', 'جديد', 'نسخة', 'ضمان', 'الجيل الرابع', 'الجيل الخامس', 'شبكة', 'يدعم',
        'dual sim', 'sim', 'mobile', 'phone', 'smartphone', 'with facetime', 'facetime',
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
        
    model_str = re.sub(r'[–\-\—\+\,\.\:\(\)\[\]\/\|]', ' ', model_str)
    
    # Translate
    tokens = model_str.split()
    translated_tokens = []
    arabic_model_tokens = []
    for token in tokens:
        # Translate to English standard
        en_token = token
        for k, v in ARABIC_MODEL_TERMS.items():
            if token == v:
                en_token = k
                break
        translated_tokens.append(en_token.capitalize())
        
        # Translate to Arabic standard
        ar_token = ARABIC_MODEL_TERMS.get(en_token.lower(), en_token)
        arabic_model_tokens.append(ar_token)
        
    # Alphanumeric only
    cleaned_tokens_en = [re.sub(r'\W+', '', t) for t in translated_tokens]
    cleaned_tokens_en = [t for t in cleaned_tokens_en if t]
    model_name_en = " ".join(cleaned_tokens_en)
    
    cleaned_tokens_ar = [re.sub(r'\W+', '', t) for t in arabic_model_tokens]
    cleaned_tokens_ar = [t for t in cleaned_tokens_ar if t]
    model_name_ar = " ".join(cleaned_tokens_ar)
    
    return storage, ram, model_name_en, model_name_ar, network

def enrich():
    print(f"Connecting to database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # 1. Add columns if they do not exist
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
            print(f"Added column '{col_name}' successfully.")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e).lower():
                print(f"Column '{col_name}' already exists. Skipping...")
            else:
                raise e
                
    # 2. Select actual smartphone products
    print("Selecting smartphone products from database...")
    cur.execute("""
        SELECT id, name, brand 
        FROM products 
        WHERE subcategory_id = 1 
          AND LOWER(brand) IN ('samsung', 'apple', 'xiaomi', 'oppo', 'realme', 'vivo', 'infinix', 'tecno', 'honor', 'huawei', 'nokia', 'motorola', 'google', 'oneplus', 'nothing')
    """)
    rows = cur.fetchall()
    print(f"Loaded {len(rows)} smartphone products for enrichment.")
    
    updated_count = 0
    for pid, name, brand in rows:
        storage, ram, model_en, model_ar, net = parse_product_features(name, brand)
        
        # Determine brand names
        brand_en = brand or "Generic"
        brand_ar = ARABIC_BRANDS.get(brand_en.lower(), brand_en)
        
        # Construct English Name
        details_en = []
        if storage: details_en.append(storage)
        if ram: details_en.append(f"{ram}GB RAM")
        if net: details_en.append(net)
        name_en = f"{brand_en} {model_en} ({', '.join(details_en)})" if details_en else f"{brand_en} {model_en}"
        
        # Construct Arabic Name
        details_ar = []
        if storage: details_ar.append(storage.replace("GB", " جيجابايت").replace("TB", " تيرابايت"))
        if ram: details_ar.append(f"{ram} جيجا رام")
        if net: details_ar.append(net)
        name_ar = f"{brand_ar} {model_ar} ({'، '.join(details_ar)})" if details_ar else f"{brand_ar} {model_ar}"
        
        # Generate descriptions
        desc_en = f"The {brand_en} {model_en} is a high-performance smartphone engineered for an exceptional user experience. "
        if ram or storage:
            desc_en += f"It features "
            parts = []
            if storage: parts.append(f"{storage} of lightning-fast storage")
            if ram: parts.append(f"{ram}GB of high-speed RAM for seamless multitasking")
            desc_en += " and ".join(parts) + ". "
        desc_en += f"Equipped with {net} connectivity, a magnificent screen, and premium camera capabilities, it is the perfect daily companion."
        
        desc_ar = f"يعتبر هاتف {brand_ar} {model_ar} هاتفاً ذكياً عالي الأداء مصمماً لتقديم تجربة مستخدم استثنائية. "
        if ram or storage:
            desc_ar += f"يأتي الهاتف بـ "
            parts = []
            if storage: parts.append(f"مساحة تخزين فائقة السرعة تبلغ {storage.replace('GB', ' جيجابايت').replace('TB', ' تيرابايت')}")
            if ram: parts.append(f"ذاكرة عشوائية {ram} جيجا رام لتعدد مهام سلس ودون أي تباطؤ")
            desc_ar += " و ".join(parts) + ". "
        desc_ar += f"يدعم الهاتف شبكات {net}، ويتميز بشاشة رائعة وتصميم متطور مع كاميرات ممتازة، مما يجعله الخيار الأمثل للاستخدام اليومي."

        # Save to database
        cur.execute("""
            UPDATE products 
            SET name_ar = ?, name_en = ?, description_ar = ?, description_en = ? 
            WHERE id = ?
        """, (name_ar, name_en, desc_ar, desc_en, pid))
        updated_count += 1
        
    conn.commit()
    conn.close()
    print(f"\nEnrichment Complete: Successfully enriched {updated_count} phone products with Arabic and English names and descriptions!")

if __name__ == "__main__":
    enrich()

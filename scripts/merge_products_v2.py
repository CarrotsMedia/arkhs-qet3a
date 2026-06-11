import re
import json
import sys
from pathlib import Path
from datetime import datetime

# Add parent directory to sys.path
sys.path.append(str(Path(__file__).resolve().parent.parent))

# ==============================================================================
# 1. Normalization maps and patterns
# ==============================================================================

ARABIC_BRANDS = {
    'samsung': 'سامسونج', 'apple': 'أبل', 'xiaomi': 'شاومي', 'oppo': 'أوبو',
    'realme': 'ريلمي', 'vivo': 'فيفو', 'infinix': 'انفينيكس', 'tecno': 'تكنو',
    'motorola': 'موتورولا', 'nokia': 'نوكيا', 'honor': 'هونر', 'huawei': 'هواوي',
    'nothing': 'نثنج', 'oneplus': 'ون بلس', 'google': 'جوجل', 'asus': 'أسوس',
    'generic': 'عام'
}

ACCESSORY_BLACKLIST = {
    'case', 'cover', 'glass', 'protector', 'holder', 'stand', 'cable', 'charger',
    'power bank', 'powerbank', 'earbud', 'earbuds', 'headset', 'airpod', 'airpods',
    'buds', 'strap', 'band', 'mount', 'plug', 'adapter', 'stylus', 'pen',
    'screen guard', 'lens protector', 'ring light', 'tripod', 'selfie stick',
    'جراب', 'لاصقة', 'لاصقه', 'شاحن', 'كابل', 'وصلة', 'وصله', 'حامل', 'سماعة',
    'سماعه', 'سماعات', 'باور بانك', 'باوربانك', 'اسكرينة', 'اسكرينه', 'لاصق حماية',
    'سوار', 'حزام شاشة', 'عدسة حماية', 'قلم لمس', 'عدسه حمايه', 'حمايه شاشه'
}

COLOR_MAP = [
    ("black", "أسود", ["black", "dark", "obsidian", "اسود", "أسود"]),
    ("white", "أبيض", ["white", "clear", "snow", "ceramic white", "ابيض", "أبيض"]),
    ("blue", "أزرق", ["blue", "navy", "ocean", "indigo", "ازرق", "أزرق"]),
    ("green", "أخضر", ["green", "mint", "emerald", "forest", "اخضر", "أخضر"]),
    ("silver", "فضي", ["silver", "platinum", "فضي", "فضى"]),
    ("gold", "ذهبي", ["gold", "golden", "champagne", "ذهبي", "ذهبى"]),
    ("gray", "رمادي", ["gray", "grey", "titanium gray", "titanium grey", "رمادي", "رمادى"]),
    ("titanium", "تيتانيوم", ["titanium", "تيتانيوم"]),
    ("purple", "بنفسجي", ["purple", "violet", "amethyst", "بنفسجي", "بنفسجى"]),
    ("red", "أحمر", ["red", "scarlet", "ruby", "احمر", "أحمر"]),
]

# ==============================================================================
# 2. Text Normalization and NLP Helpers
# ==============================================================================

def clean_arabic_numbers(text: str) -> str:
    arabic_to_english = {
        '٠':'0', '١':'1', '٢':'2', '٣':'3', '٤':'4', '٥':'5', '٦':'6', '٧':'7', '٨':'8', '٩':'9'
    }
    for ar, en in arabic_to_english.items():
        text = text.replace(ar, en)
    return text

def normalize_arabic_letters(text: str) -> str:
    text = re.sub(r'[أإآا]', 'ا', text)
    text = re.sub(r'[ةه]', 'ه', text)
    text = re.sub(r'[ىي]', 'ى', text)
    return text

def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'[\s-]+', '-', text)
    return text

def levenshtein_distance(s1: str, s2: str) -> int:
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)
    
    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row
        
    return previous_row[-1]

def token_similarity(s1: str, s2: str) -> float:
    t1 = set(normalize_arabic_letters(s1.lower()).split())
    t2 = set(normalize_arabic_letters(s2.lower()).split())
    fillers = {'مع', 'في', 'من', 'و', 'ال', 'بـ', 'بشريحة', 'شريحة', 'بشريحتين', 'شريحتين', 'sim', 'dual', 'with', 'phone', 'mobile'}
    t1 = t1 - fillers
    t2 = t2 - fillers
    if not t1 or not t2:
        return 0.0
    intersection = t1.intersection(t2)
    union = t1.union(t2)
    return len(intersection) / len(union)

def calculate_weighted_similarity(p1: dict, p2: dict) -> float:
    if p1.get('brand_id') != p2.get('brand_id'):
        return 0.0
        
    n1 = p1.get('name_en', '').lower()
    n2 = p2.get('name_en', '').lower()
    
    lev_dist = levenshtein_distance(n1, n2)
    max_len = max(len(n1), len(n2))
    lev_sim = 1.0 - (lev_dist / max_len) if max_len > 0 else 0.0
    
    tok_sim = token_similarity(n1, n2)
    text_score = 0.4 * lev_sim + 0.6 * tok_sim
    
    storage_score = 1.0
    if p1.get('storage_gb') is not None and p2.get('storage_gb') is not None:
        storage_score = 1.0 if p1['storage_gb'] == p2['storage_gb'] else 0.0
        
    ram_score = 1.0
    if p1.get('ram_gb') is not None and p2.get('ram_gb') is not None:
        ram_score = 1.0 if p1['ram_gb'] == p2['ram_gb'] else 0.0
        
    network_score = 1.0
    if p1.get('network_gen') and p2.get('network_gen'):
        network_score = 1.0 if p1['network_gen'] == p2['network_gen'] else 0.0
        
    final_score = (
        0.20 * 1.0 +
        0.35 * text_score +
        0.20 * storage_score +
        0.15 * ram_score +
        0.10 * network_score
    )
    return final_score

# ==============================================================================
# 3. Extraction Engine
# ==============================================================================

def extract_product_attributes(name: str):
    name_clean = clean_arabic_numbers(name.lower())
    
    network = "4G"
    if "5g" in name_clean:
        network = "5G"
        
    ram = None
    ram_match_a = re.search(r'\b(1|2|3|4|6|8|12|16|18|24|32|64)\s*(?:gb\s*ram|ram|جيجا\s*رام|رام)', name_clean)
    ram_match_b = re.search(r'\b(?:رامات|رام|ram)\s*(1|2|3|4|6|8|12|16|18|24|32|64)\b', name_clean)
    if ram_match_a:
        ram = int(ram_match_a.group(1))
    elif ram_match_b:
        ram = int(ram_match_b.group(1))
        
    storage = None
    tb_match = re.search(r'\b(1|2)\s*(?:tb|تيرابايت|تيرا)', name_clean)
    if tb_match:
        storage = int(tb_match.group(1)) * 1024
    else:
        gb_match = re.search(r'\b(8|16|32|64|128|256|512)\s*(?:gb|جيجا|جيجابايت|g)\b', name_clean)
        if gb_match:
            storage = int(gb_match.group(1))
            
    color_en, color_ar = "Standard", "قياسي"
    for en, ar, keywords in COLOR_MAP:
        if any(kw in name_clean for kw in keywords):
            color_en, color_ar = en.title(), ar
            break
            
    region = "International"
    if any(kw in name_clean for kw in ["middle east", "الشرق الاوسط", "local"]):
        region = "MEA"
    elif "global" in name_clean:
        region = "Global"
    elif "japan" in name_clean:
        region = "Japan"
        
    return {
        'storage_gb': storage,
        'ram_gb': ram,
        'network_gen': network,
        'color_en': color_en,
        'color_ar': color_ar,
        'region_version': region
    }

def clean_family_name(name: str) -> str:
    n = name
    n = re.sub(r'\b\d+(?:GB|TB|gb|tb|g|G)\b.*', '', n)
    n = re.sub(r'\b(?:ram|RAM|ramat|RAMAT|5G|4G|5g|4g|Dual SIM|dual sim)\b.*', '', n)
    n = re.sub(r'[\(\),;\-\+]+$', '', n)
    return n.strip()

def get_name_words(name: str) -> set:
    n_clean = clean_arabic_numbers(name.lower())
    n_clean = normalize_arabic_letters(n_clean)
    words = set(re.findall(r'\b[a-z0-9\u0600-\u06FF]{2,}\b', n_clean))
    # Exclude common brands and generic terms from candidates
    brands = {'samsung', 'apple', 'xiaomi', 'oppo', 'realme', 'vivo', 'infinix', 'tecno', 'honor', 'huawei', 'nothing', 'oneplus',
               'سامسونج', 'ابل', 'شاومي', 'اوبو', 'ريلمي', 'فيفو', 'انفينيكس', 'تكنو', 'هونر', 'هواوي'}
    fillers = {'phone', 'mobile', 'tablet', 'smart', 'watch', 'dual', 'sim', 'hifi', 'stereo', 'wifi', 'cellular'}
    return words - brands - fillers

# ==============================================================================
# 4. Core Merge and Variant Processing Pipeline
# ==============================================================================

def process_merge_pipeline():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Connecting to database...")
    from db_schema import get_db_connection
    conn = get_db_connection()
    cur = conn.cursor()
    
    # Cache subcategory mapping details
    cur.execute("SELECT id, slug FROM subcategories")
    subcats = {row['slug']: row['id'] for row in cur.fetchall()}
    smartphone_subcat_id = subcats.get('smartphones', 1)
    accessories_subcat_id = subcats.get('phone-accessories', 34)
    
    # Cache attribute definitions details for variant filtering
    cur.execute("SELECT id, slug FROM attribute_definitions")
    attr_defs = {row['slug']: row['id'] for row in cur.fetchall()}
    ram_attr_id = attr_defs.get('ram_gb')
    storage_attr_id = attr_defs.get('storage_gb')
    network_attr_id = attr_defs.get('network_generation')
    color_attr_id = attr_defs.get('color')
    
    # --- OPTIMIZATION: LOAD ALL FAMILIES IN MEMORY FOR FAST MATCHING ---
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Pre-indexing product families in memory...")
    cur.execute("""
        SELECT id, slug, name_en, name_ar, brand_id, subcategory_id
        FROM product_families
    """)
    families_rows = cur.fetchall()
    
    # Structure: (brand_id, subcategory_id) -> list of family dicts
    family_index = {}
    for r in families_rows:
        key = (r['brand_id'], r['subcategory_id'])
        if key not in family_index:
            family_index[key] = []
        
        name_en = r['name_en']
        family_index[key].append({
            'id': r['id'],
            'slug': r['slug'],
            'name_en': name_en,
            'name_ar': r['name_ar'],
            'brand_id': r['brand_id'],
            'subcategory_id': r['subcategory_id'],
            'word_tokens': get_name_words(name_en)
        })
        
    # Query all raw products that need sorting
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Loading raw products...")
    cur.execute("""
        SELECT id, name, brand, brand_id, subcategory_id, image_url, name_en, name_ar, description_en, description_ar
        FROM products
    """)
    raw_products = cur.fetchall()
    print(f"Found {len(raw_products)} raw products in database.")
    
    merged_count = 0
    new_families_created = 0
    variants_mapped = 0
    offers_linked = 0
    accessories_separated = 0
    
    # Process products and commit in chunks to avoid blocking SQLite DB
    chunk_size = 500
    total_processed = 0
    
    for p in raw_products:
        p_name = p['name']
        p_brand = p['brand']
        p_brand_id = p['brand_id']
        p_subcat_id = p['subcategory_id']
        p_img = p['image_url']
        
        # 1. Accessory Separation Logic
        is_accessory = False
        name_lower = p_name.lower()
        if any(kw in name_lower for kw in ACCESSORY_BLACKLIST):
            is_accessory = True
            
        actual_subcat_id = p_subcat_id
        if is_accessory and p_subcat_id == smartphone_subcat_id:
            actual_subcat_id = accessories_subcat_id
            accessories_separated += 1
            cur.execute("UPDATE products SET subcategory_id = ? WHERE id = ?", (accessories_subcat_id, p['id']))
            
        if not actual_subcat_id:
            actual_subcat_id = smartphone_subcat_id
            
        # Resolve brand_id
        actual_brand_id = p_brand_id
        if not actual_brand_id and p_brand:
            bslug = slugify(p_brand) or "generic"
            cur.execute("SELECT id FROM brands WHERE slug = ?", (bslug,))
            brow = cur.fetchone()
            if brow:
                actual_brand_id = brow['id']
            else:
                brand_ar = ARABIC_BRANDS.get(bslug, p_brand)
                cur.execute("INSERT INTO brands (slug, name_en, name_ar, name) VALUES (?, ?, ?, ?) RETURNING id",
                            (bslug, p_brand, brand_ar, p_brand))
                actual_brand_id = cur.fetchone()[0]
        elif not actual_brand_id:
            cur.execute("SELECT id FROM brands WHERE slug = 'generic'")
            actual_brand_id = cur.fetchone()[0]
            
        # 2. Extract specific variant traits
        traits = extract_product_attributes(p_name)
        
        # 3. Core Matcher: Pruned candidates using Word Tokens Intersection
        search_name_en = clean_family_name(p['name_en'] or p_name)
        search_payload = {
            'brand_id': actual_brand_id,
            'name_en': search_name_en,
            'storage_gb': traits['storage_gb'],
            'ram_gb': traits['ram_gb'],
            'network_gen': traits['network_gen']
        }
        
        search_words = get_name_words(search_name_en)
        
        # Look up preloaded index
        index_key = (actual_brand_id, actual_subcat_id)
        candidates = family_index.get(index_key, [])
        
        best_match_family = None
        best_score = 0.0
        
        # Filter families: only keep families sharing at least one word, or check all if brand has few families
        filtered_candidates = candidates
        if len(candidates) > 10 and len(search_words) > 0:
            filtered_candidates = [
                c for c in candidates 
                if len(search_words.intersection(c['word_tokens'])) > 0
            ]
            # Fallback to full check if no intersection found
            if not filtered_candidates:
                filtered_candidates = candidates
                
        for fam in filtered_candidates:
            fam_payload = {
                'brand_id': fam['brand_id'],
                'name_en': fam['name_en'],
                'storage_gb': traits['storage_gb'],
                'ram_gb': traits['ram_gb'],
                'network_gen': traits['network_gen']
            }
            score = calculate_weighted_similarity(search_payload, fam_payload)
            if score > best_score:
                best_score = score
                best_match_family = fam
                
        # 4. Apply Merge Decision Tree
        family_id = None
        
        if best_score >= 0.85 and best_match_family:
            family_id = best_match_family['id']
            merged_count += 1
        elif best_score >= 0.65 and best_match_family:
            family_id = best_match_family['id']
            cur.execute("""
                INSERT INTO merge_candidates (raw_title, matched_family_id, similarity_score, status)
                VALUES (?, ?, ?, 'pending')
            """, (p_name, family_id, best_score))
            merged_count += 1
        else:
            # Low match score: Create a new family!
            name_en_clean = clean_family_name(p['name_en'] or p_name)
            name_ar_clean = clean_family_name(p['name_ar'] or p_name)
            family_slug = slugify(name_en_clean) or f"family-gen-{p['id']}"
            
            # Avoid slug conflicts
            cur.execute("SELECT id FROM product_families WHERE slug = ?", (family_slug,))
            if cur.fetchone():
                family_slug += f"-{p['id']}"
                
            cur.execute("""
                INSERT INTO product_families (slug, brand_id, subcategory_id, name_en, name_ar, description_en, description_ar, image_url)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
            """, (family_slug, actual_brand_id, actual_subcat_id, name_en_clean, name_ar_clean, p['description_en'], p['description_ar'], p_img))
            family_id = cur.fetchone()[0]
            new_families_created += 1
            
            # Add new family to memory index to match subsequent items in this run!
            new_fam_data = {
                'id': family_id,
                'slug': family_slug,
                'name_en': name_en_clean,
                'name_ar': name_ar_clean,
                'brand_id': actual_brand_id,
                'subcategory_id': actual_subcat_id,
                'word_tokens': get_name_words(name_en_clean)
            }
            if index_key not in family_index:
                family_index[index_key] = []
            family_index[index_key].append(new_fam_data)
            
        # 5. Handle Variant mapping under selected family
        if actual_subcat_id == smartphone_subcat_id and (traits['storage_gb'] is None or traits['ram_gb'] is None):
            # Skip creating standard variant and offers for smartphones because they are useless/valueless
            total_processed += 1
            continue

        sku = f"VAR-{family_id}-{traits['storage_gb'] or 0}-{traits['ram_gb'] or 0}-{traits['network_gen']}-{slugify(traits['color_en'])}"
        
        cur.execute("""
            INSERT INTO product_variants (family_id, sku, storage_gb, ram_gb, network_gen, color_en, color_ar, region_version, image_url)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(sku) DO UPDATE SET
                image_url = COALESCE(excluded.image_url, product_variants.image_url)
            RETURNING id
        """, (family_id, sku, traits['storage_gb'], traits['ram_gb'], traits['network_gen'], traits['color_en'], traits['color_ar'], traits['region_version'], p_img))
        variant_id = cur.fetchone()[0]
        variants_mapped += 1
        
        # Populate variant_attributes table for dynamic filtering support
        if traits['ram_gb'] is not None and ram_attr_id:
            cur.execute("""
                INSERT INTO variant_attributes (variant_id, attribute_id, value)
                VALUES (?, ?, ?)
                ON CONFLICT(variant_id, attribute_id) DO UPDATE SET value = excluded.value
            """, (variant_id, ram_attr_id, str(traits['ram_gb'])))
            
        if traits['storage_gb'] is not None and storage_attr_id:
            cur.execute("""
                INSERT INTO variant_attributes (variant_id, attribute_id, value)
                VALUES (?, ?, ?)
                ON CONFLICT(variant_id, attribute_id) DO UPDATE SET value = excluded.value
            """, (variant_id, storage_attr_id, str(traits['storage_gb'])))
            
        if traits['network_gen'] is not None and network_attr_id:
            cur.execute("""
                INSERT INTO variant_attributes (variant_id, attribute_id, value)
                VALUES (?, ?, ?)
                ON CONFLICT(variant_id, attribute_id) DO UPDATE SET value = excluded.value
            """, (variant_id, network_attr_id, str(traits['network_gen'])))
            
        if traits['color_en'] is not None and color_attr_id:
            cur.execute("""
                INSERT INTO variant_attributes (variant_id, attribute_id, value)
                VALUES (?, ?, ?)
                ON CONFLICT(variant_id, attribute_id) DO UPDATE SET value = excluded.value
            """, (variant_id, color_attr_id, str(traits['color_en'])))
        
        # Update raw product record with master linkages
        cur.execute("UPDATE products SET merged_product_id = ? WHERE id = ?", (family_id, p['id']))
        
        # 6. Map Store Offer details
        cur.execute("""
            SELECT store_id, price_egp, original_price_egp, discount_pct, availability, product_url, scraped_at
            FROM prices
            WHERE product_id = ?
        """, (p['id'],))
        prices = cur.fetchall()
        
        for pr in prices:
            cur.execute("""
                INSERT INTO store_offers (variant_id, store_id, raw_title, price_egp, original_price_egp, discount_pct, availability, product_url, image_url, scraped_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(variant_id, store_id) DO UPDATE SET
                    price_egp = excluded.price_egp,
                    original_price_egp = excluded.original_price_egp,
                    discount_pct = excluded.discount_pct,
                    availability = excluded.availability,
                    product_url = excluded.product_url,
                    scraped_at = excluded.scraped_at
            """, (variant_id, pr['store_id'], p_name, pr['price_egp'], pr['original_price_egp'], pr['discount_pct'], pr['availability'], pr['product_url'], p_img, pr['scraped_at']))
            
            cur.execute("""
                INSERT INTO price_history (variant_id, store_id, price_egp, recorded_at)
                VALUES (?, ?, ?, ?)
            """, (variant_id, pr['store_id'], pr['price_egp'], pr['scraped_at']))
            offers_linked += 1
            
        total_processed += 1
        
        # Commit periodically to keep SQLite lock times minimal and let server requests in
        if total_processed % chunk_size == 0:
            conn.commit()
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Processed {total_processed}/{len(raw_products)} items and committed batch...")
            
    conn.commit()
    conn.close()
    
    print("\n==============================================================================")
    print("Weighted Merge Execution Complete Summary:")
    print(f"  - Raw Listings Analysed: {len(raw_products)}")
    print(f"  - Accessories Separated: {accessories_separated}")
    print(f"  - Products Grouped/Merged: {merged_count}")
    print(f"  - Standalone Families Created: {new_families_created}")
    print(f"  - Variants Generated: {variants_mapped}")
    print(f"  - Active Store Offers Linkages: {offers_linked}")
    print("==============================================================================\n")

if __name__ == "__main__":
    process_merge_pipeline()

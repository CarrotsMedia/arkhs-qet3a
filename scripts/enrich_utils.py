import re
import json
from pathlib import Path

ARABIC_BRANDS = {
    'samsung': 'سامسونج', 'apple': 'أبل', 'xiaomi': 'شاومي', 'oppo': 'أوبو',
    'realme': 'ريلمي', 'vivo': 'فيفو', 'infinix': 'انفينيكس', 'tecno': 'تكنو',
    'motorola': 'موتورولا', 'nokia': 'نوكيا', 'honor': 'هونر', 'huawei': 'هواوي',
    'nothing': 'نثنج', 'oneplus': 'ون بلس', 'google': 'جوجل', 'asus': 'أسوس',
    'gigabyte': 'جيجابايت', 'msi': 'إم إس آي', 'intel': 'إنتل', 'amd': 'إيه إم دي',
    'nvidia': 'نيفيديا', 'corsair': 'كورسير', 'kingston': 'كينجستون', 'dell': 'ديل',
    'hp': 'إتش بي', 'lenovo': 'لينوفو', 'acer': 'أيسر', 'lg': 'إل جي', 'sony': 'سوني',
    'logitech': 'لوجيتيك', 'razer': 'ريزر', 'hyperx': 'هايبر إكس', 'redragon': 'ريدراجون',
    'crucial': 'كروشيال', 'adata': 'أداتا', 'wd': 'ويسترن ديجيتال', 'western digital': 'ويسترن ديجيتال',
    'seagate': 'سيجيت', 'sandisk': 'سان ديسك', 'toshiba': 'توشيبا', 'philips': 'فيليبس',
    'panasonic': 'باناسونيك', 'sharp': 'شارب', 'carrier': 'كاريير', 'gree': 'جري',
    'tornado': 'تورنادو', 'unionaire': 'يونيون إير', 'fresh': 'فريش', 'generic': 'عام'
}

TRANSLATION_MAP = {
    'pro': 'برو', 'max': 'ماكس', 'plus': 'بلس', 'ultra': 'الترا', 'lite': 'لايت',
    'mini': 'ميني', 'super': 'سوبر', 'ti': 'تي آي', 'wifi': 'واي فاي', 'wireless': 'لاسلكي',
    'black': 'أسود', 'white': 'أبيض', 'silver': 'فضي', 'gold': 'ذهبي', 'grey': 'رمادي', 'gray': 'رمادي'
}

SUBCAT_AR_MAP = {
    'smartphones': 'هاتف ذكي', 'laptops': 'لاب توب', 'monitors': 'شاشة عرض',
    'graphics-cards': 'كارت شاشة', 'motherboards': 'لوحة أم', 'processors': 'معالج',
    'ram-memory': 'ذاكرة عشوائية (رام)', 'storage': 'هارد ديسك', 'cases': 'كيسة كمبيوتر',
    'power-supplies': 'مزود طاقة (باور سبلاي)', 'cooling': 'تبريد كمبيوتر',
    'keyboards-mice': 'لوحة مفاتيح وماوس', 'audio': 'سماعة', 'gaming-accessories': 'اكسسوار ألعاب',
    'cables-adapters': 'كابل ومحول', 'networking': 'جهاز شبكة', 'cameras-streaming': 'كاميرا وبث',
    'laptop-accessories': 'ملحقات لاب توب', 'phone-accessories': 'اكسسوار موبايل',
    'smart-watches': 'ساعة ذكية', 'refrigerators': 'ثلاجة', 'washing-machines': 'غسالة',
    'air-conditioners': 'تكييف', 'tablets': 'تابلت لوحي', 'tvs': 'شاشة تلفزيون',
    'desks': 'مكتب', 'bags': 'شنطة', 'watches': 'ساعة', 'perfumes': 'عطر'
}

def clean_unicode(text: str) -> str:
    if not text:
        return ""
    # Clean weird diamonds with question marks and other common parser encoding issues
    text = text.replace("\ufffd", " ").replace("\u00a0", " ")
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def parse_product_specs(name: str, subcat_slug: str):
    name_lower = name.lower()
    specs = {}
    
    # 1. Screen size
    screen_match = re.search(r'\b(\d+(?:\.\d+)?)\s*(?:inch|”|\"|-inch| بوصة)\b', name_lower)
    if screen_match:
        specs['screen_size'] = screen_match.group(1)
        
    # 2. Refresh rate
    hz_match = re.search(r'\b(\d+)\s*(?:hz|هرتز)\b', name_lower)
    if hz_match:
        specs['refresh_rate'] = hz_match.group(1)
        
    # 3. RAM
    ram_match = re.search(r'\b(4|6|8|12|16|24|32|48|64|96|128)\s*(?:gb|g)\s*(?:ddr[45]\s*)?(?:ram|رام|عشوائية)?\b', name_lower)
    if ram_match:
        specs['ram'] = f"{ram_match.group(1)}GB"
        
    # 4. Storage
    tb_match = re.search(r'\b(1|2|4)\s*(?:tb|تيرابايت|تيرا)\b', name_lower)
    if tb_match:
        specs['storage'] = f"{tb_match.group(1)}TB"
    else:
        storage_match = re.search(r'\b(120|128|240|256|480|512|960)\s*(?:gb|جيجا|جيجابايت|g)\b', name_lower)
        if storage_match:
            specs['storage'] = f"{storage_match.group(1)}GB"
            
    # 5. CPU
    intel_match = re.search(r'\b(core\s+i[3579]|ci[3579]|i[3579])-?(\d+\w*)\b', name_lower)
    if intel_match:
        specs['cpu'] = f"Intel Core {intel_match.group(1).replace('ci', 'i').replace('core ', '')}-{intel_match.group(2).upper()}"
    else:
        ryzen_match = re.search(r'\b(ryzen\s+[3579]\s+\d+\w*|ryzen\s+[3579])\b', name_lower)
        if ryzen_match:
            specs['cpu'] = f"AMD {ryzen_match.group(1).title()}"
            
    # 6. GPU
    gpu_match = re.search(r'\b(rtx\s*\d{4}(?:\s*ti|\s*super)?|gtx\s*\d{4}(?:\s*ti)?|rx\s*\d{4}(?:\s*xt)?|geforce|radeon)\b', name_lower)
    if gpu_match:
        specs['gpu'] = gpu_match.group(1).upper()
        
    return specs

def generate_bilingual_data(name: str, brand: str, subcat_slug: str):
    raw_name = clean_unicode(name)
    brand_en = brand if brand else "Generic"
    brand_lower = brand_en.lower()
    brand_ar = ARABIC_BRANDS.get(brand_lower, brand_en)
    
    # Parse specs
    specs = parse_product_specs(raw_name, subcat_slug)
    
    # Build beautiful English standard name (name_en)
    # Start by extracting the model from the name (words that are not brand or generic terms)
    words = raw_name.split()
    model_words = []
    
    generic_terms = {
        'laptop', 'laptops', 'gaming', 'monitor', 'monitors', 'graphics', 'card', 'cards',
        'gpu', 'processor', 'processors', 'cpu', 'motherboard', 'motherboards', 'ram', 'memory',
        'ssd', 'hdd', 'storage', 'case', 'cases', 'power', 'supply', 'supplies', 'psu', 'cooler',
        'coolers', 'cooling', 'liquid', 'air', 'fan', 'fans', 'keyboard', 'keyboards', 'mouse',
        'mice', 'headphone', 'headphones', 'headset', 'earbud', 'earbuds', 'airpods', 'speakers',
        'microphone', 'cable', 'cables', 'adapter', 'adapters', 'charger', 'chargers', 'powerbank',
        'router', 'routers', 'switch', 'webcam', 'webcams', 'tablet', 'tablets', 'watch', 'watches',
        'smartwatch', 'tv', 'tvs', 'television', 'desk', 'desks', 'bag', 'bags', 'perfume', 'perfumes',
        'accessories', 'accessory', 'phone', 'phones', 'smartphone', 'smartphones'
    }
    
    for w in words:
        w_clean = re.sub(r'\W+', '', w).lower()
        # Skip spec-like terms from model name
        if 'inch' in w_clean or '"' in w or '”' in w or '’' in w:
            continue
        if 'hz' in w_clean:
            continue
        if 'gb' in w_clean or 'tb' in w_clean or w_clean.endswith('g'):
            if re.search(r'\d+', w_clean):
                continue
        if 'i3' in w_clean or 'i5' in w_clean or 'i7' in w_clean or 'i9' in w_clean or 'ryzen' in w_clean or 'intel' in w_clean or 'amd' in w_clean or 'core' in w_clean:
            continue
        if w_clean in {'win11', 'windows', 'win10', 'backpack', 'gray', 'grey', 'black', 'white', 'silver', 'gold', 'red', 'blue', 'green'}:
            continue
        if 'rtx' in w_clean or 'gtx' in w_clean or 'rx' in w_clean or 'radeon' in w_clean or 'geforce' in w_clean:
            continue
            
        # Check if this token is a numeric part of CPU, GPU, or other specs already parsed
        is_duplicate_spec = False
        for spec_val in specs.values():
            if w_clean in spec_val.lower():
                if w_clean.isdigit() or w_clean == spec_val.lower():
                    is_duplicate_spec = True
                    break
        if is_duplicate_spec:
            continue
            
        if w_clean != brand_lower and w_clean not in generic_terms and not w.startswith('-') and not w.startswith('—') and not w.startswith('–'):
            model_words.append(w)
            
    # Combine model words
    model_str = " ".join(model_words[:5])
    model_str = re.sub(r'[,;\-\s]+$', '', model_str)
    
    # If the model turns out to be empty, fall back to a cleaned version of the raw name
    if not model_str:
        model_str = raw_name
        
    # Translate model adjectives to Arabic
    model_tokens = model_str.split()
    translated_tokens = []
    for token in model_tokens:
        token_lower = token.lower()
        if token_lower in TRANSLATION_MAP:
            translated_tokens.append(TRANSLATION_MAP[token_lower])
        else:
            translated_tokens.append(token)
    translated_model = " ".join(translated_tokens)
    
    # 1. Build standardized English Name
    details_en = []
    if 'screen_size' in specs: details_en.append(f"{specs['screen_size']}-inch")
    if 'refresh_rate' in specs: details_en.append(f"{specs['refresh_rate']}Hz")
    if 'cpu' in specs: details_en.append(specs['cpu'])
    if 'ram' in specs: details_en.append(f"{specs['ram']} RAM")
    if 'storage' in specs: details_en.append(specs['storage'])
    if 'gpu' in specs: details_en.append(specs['gpu'])
    
    subcat_en = subcat_slug.replace('-', ' ').title()
    if subcat_slug == 'ram-memory': subcat_en = 'RAM'
    elif subcat_slug == 'tvs': subcat_en = 'TV'
    
    if details_en:
        name_en = f"{brand_en} {model_str} {subcat_en} ({', '.join(details_en)})"
    else:
        name_en = f"{brand_en} {model_str} {subcat_en}"
        
    # 2. Build standardized Arabic Name
    type_ar = SUBCAT_AR_MAP.get(subcat_slug, 'منتج')
    details_ar = []
    if 'screen_size' in specs: details_ar.append(f"شاشة {specs['screen_size']} بوصة")
    if 'refresh_rate' in specs: details_ar.append(f"{specs['refresh_rate']} هرتز")
    if 'cpu' in specs: details_ar.append(f"معالج {specs['cpu']}")
    if 'ram' in specs: details_ar.append(f"رام {specs['ram']}")
    if 'storage' in specs: details_ar.append(f"هارد {specs['storage']}")
    if 'gpu' in specs: details_ar.append(f"كارت شاشة {specs['gpu']}")
    
    if details_ar:
        name_ar = f"{type_ar} {brand_ar} {translated_model} ({'، '.join(details_ar)})"
    else:
        name_ar = f"{type_ar} {brand_ar} {translated_model}"
        
    # 3. Generate Bilingual Descriptions
    # Fallbacks
    desc_en = f"The {brand_en} {model_str} is a premium {subcat_en.lower()} designed to deliver exceptional reliability and top-tier performance. Features a robust design and advanced features, making it the perfect choice for demanding modern use."
    desc_ar = f"يعتبر {name_ar} خياراً ممتازاً فائق الأداء مصمماً لتقديم تجربة استخدام استثنائية وموثوقية عالية. يتميز بتصميمه المتين وميزاته المتقدمة، مما يجعله الخيار المثالي للاستخدام العصري المتقدم."
    
    # Specific Templates
    if subcat_slug == 'laptops':
        cpu = specs.get('cpu', 'high-performance processor')
        ram = specs.get('ram', 'high-speed memory')
        storage = specs.get('storage', 'fast solid-state storage')
        gpu = specs.get('gpu', 'premium graphics')
        screen = f"a vibrant {specs.get('screen_size')}-inch screen" if 'screen_size' in specs else "a stunning high-resolution display"
        hz = f" with a smooth {specs.get('refresh_rate')}Hz refresh rate" if 'refresh_rate' in specs else ""
        
        desc_en = f"The {brand_en} {model_str} laptop features {screen}{hz}, powered by an advanced {cpu} and {gpu} to deliver top-tier gaming and workstation performance. Equipped with {ram} for seamless multitasking and {storage} for ultra-fast load times, it is the ultimate portable powerhouse for gamers and professionals alike."
        
        screen_ar = f"شاشة نابضة بالحياة بحجم {specs.get('screen_size')} بوصة" if 'screen_size' in specs else "شاشة عرض مذهلة عالية الدقة"
        hz_ar = f" بمعدل تحديث سلس يبلغ {specs.get('refresh_rate')} هرتز" if 'refresh_rate' in specs else ""
        cpu_ar = specs.get('cpu', 'معالج قوي')
        gpu_ar = specs.get('gpu', 'كارت شاشة متطور')
        ram_ar = f"ذاكرة عشوائية (رام) بسعة {specs.get('ram')}" if 'ram' in specs else "ذاكرة عشوائية سريعة"
        storage_ar = f"مساحة تخزين فائقة السرعة بسعة {specs.get('storage')}" if 'storage' in specs else "مساحة تخزين سريعة"
        
        desc_ar = f"يتميز لابتوب {brand_ar} {translated_model} بـ {screen_ar}{hz_ar}، وهو مدعوم بمعالج {cpu_ar} وكارت شاشة {gpu_ar} لتقديم أداء استثنائي للألعاب والتطبيقات الاحترافية. يأتي مجهزاً بـ {ram_ar} لتعدد مهام سلس ودون أي تباطؤ، مع {storage_ar} لسرعة تحميل فائقة، مما يجعله الخيار المحمول الأقوى للاعبين والمحترفين."
        
    elif subcat_slug == 'monitors':
        screen = f"a {specs.get('screen_size')}-inch" if 'screen_size' in specs else "a high-performance"
        hz = f" {specs.get('refresh_rate')}Hz" if 'refresh_rate' in specs else ""
        
        desc_en = f"Immerse yourself in spectacular visuals with this {brand_en} monitor, featuring {screen} display{hz}. Engineered for crisp color reproduction and fluid motion, it provides a highly responsive experience for competitive gaming, movie watching, and creative workflow."
        
        screen_ar = f"بحجم {specs.get('screen_size')} بوصة" if 'screen_size' in specs else "عالية الأداء"
        hz_ar = f" بمعدل تحديث {specs.get('refresh_rate')} هرتز" if 'refresh_rate' in specs else ""
        
        desc_ar = f"انغمس في مرئيات مذهلة مع شاشة {brand_ar} {translated_model} المميزة {screen_ar}{hz_ar}. تم تصميم الشاشة لتقديم إعادة إنتاج دقيقة للألوان وحركة فائقة السلاسة، مما يضمن تجربة لعب ومشاهدة وإنتاج محتوى تفاعلية وممتازة."

    elif subcat_slug == 'graphics-cards':
        gpu = specs.get('gpu', 'graphics processor')
        desc_en = f"Elevate your PC's visual capabilities with the {brand_en} {gpu} graphics card. Built for extreme gaming performance, it features advanced cooling solutions, high frame rates, and support for real-time ray tracing, giving you the competitive edge in all modern titles."
        desc_ar = f"ارتقِ بقدرات جهاز الكمبيوتر البصرية الخاصة بك مع كارت شاشة {brand_ar} {gpu}. صُمم الكارت ليقدم أداء ألعاب خارق، ويتميز بأنظمة تبريد متطورة، ومعدلات إطارات مرتفعة، ودعم لتقنية تتبع الأشعة في الوقت الفعلي، مما يمنحك تفوقاً تنافسياً في جميع الألعاب الحديثة."

    elif subcat_slug == 'processors':
        cpu = specs.get('cpu', 'processor')
        desc_en = f"Experience lightning-fast processing power with the {brand_en} {cpu} CPU. Designed for advanced computing, heavy multitasking, and seamless gaming, it provides next-gen efficiency and speed to tackle demanding workloads effortlessly."
        cpu_ar = specs.get('cpu', 'معالج')
        desc_ar = f"اختبر قوة معالجة فائقة السرعة مع بروسيسور {brand_ar} {cpu_ar}. صُمم هذا المعالج للعمليات الحسابية المتقدمة وتعدد المهام المكثف وألعاب الكمبيوتر السلسة، مما يوفر كفاءة وسرعة من الجيل القادم للتعامل مع الأحمال الثقيلة دون جهد."

    elif subcat_slug == 'ram-memory':
        ram = specs.get('ram', 'high-performance memory')
        desc_en = f"Boost your system responsiveness and eliminate bottlenecks with {brand_en} {ram} RAM. Featuring high frequencies and optimized latency, this memory module ensures snappy multitasking, smooth gaming, and fast data transfer speeds."
        desc_ar = f"عزز استجابة نظامك وتخلص من أي بطء مع رامات {brand_ar} بسعة {ram}. بفضل الترددات العالية وزمن الاستجابة المحسن، تضمن وحدة الذاكرة هذه تعدد مهام سريع، وألعاب سلسة، وسرعات نقل بيانات فائقة."

    elif subcat_slug == 'storage':
        storage = specs.get('storage', 'high-speed storage')
        desc_en = f"Store more and load faster with {brand_en} {storage} storage. Delivering exceptional read and write speeds, this drive dramatically accelerates boot times, application launches, and massive file transfers."
        desc_ar = f"خزّن المزيد وحمّل أسرع مع هارد {brand_ar} بسعة {storage}. يقدم الهارد سرعات قراءة وكتابة استثنائية، مما يسرع أوقات إقلاع النظام وتشغيل التطبيقات ونقل الملفات الضخمة بشكل مذهل."

    elif subcat_slug == 'smartphones':
        storage = specs.get('storage', 'high capacity storage')
        ram = specs.get('ram', 'ample RAM')
        desc_en = f"The {brand_en} {model_str} smartphone features {ram} and {storage}, designed for an exceptional mobile experience. Equipped with premium camera capabilities, a brilliant display, and a long-lasting battery, it is the perfect daily companion."
        desc_ar = f"يأتي هاتف {brand_ar} {translated_model} الذكي بـ {ram} و {storage}، وهو مصمم لتقديم تجربة هاتف محمول استثنائية. مجهز بكاميرات ممتازة، شاشة عرض رائعة، وبطارية تدوم طويلاً، مما يجعله الخيار الأمثل للاستخدام اليومي."

    return clean_unicode(name_en), clean_unicode(name_ar), clean_unicode(desc_en), clean_unicode(desc_ar)

def enrich_product_record(conn, product_id: int):
    """Enriches a single product record in the database by ID."""
    cur = conn.cursor()
    cur.execute("""
        SELECT p.name, p.brand, s.slug 
        FROM products p
        LEFT JOIN subcategories s ON p.subcategory_id = s.id
        WHERE p.id = ?
    """, (product_id,))
    row = cur.fetchone()
    if not row:
        return False
        
    raw_name, brand, subcat_slug = row
    if not subcat_slug:
        subcat_slug = "other"
        
    name_en, name_ar, desc_en, desc_ar = generate_bilingual_data(raw_name, brand, subcat_slug)
    
    cur.execute("""
        UPDATE products 
        SET name_en = ?, name_ar = ?, description_en = ?, description_ar = ?
        WHERE id = ?
    """, (name_en, name_ar, desc_en, desc_ar, product_id))
    conn.commit()
    return True

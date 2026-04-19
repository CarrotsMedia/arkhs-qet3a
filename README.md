# Sigma Computer Scraper 🖥️

سكرابر بيجيب المنتجات والأسعار من موقع sigma-computer.com

## التركيب

```bash
pip install -r requirements.txt
playwright install chromium
```

## الاستخدام

### بحث عن منتج معين
```bash
python scraper.py --search "rtx 4070"
python scraper.py --search "i7 14700k"
```

### سكرب category كاملة
```bash
python scraper.py --category processors
python scraper.py --category gpu ram
```

### سكرب كل الموقع
```bash
python scraper.py --all
```

### مع مواصفات تفصيلية (أبطأ)
```bash
python scraper.py --category processors --details
```

## الـ Categories المتاحة
| الاسم | المنتجات |
|-------|---------|
| `processors` | معالجات CPU |
| `gpu` | كروت شاشة |
| `ram` | رامات |
| `motherboards` | مازربوردات |
| `ssd` | هاردات SSD |
| `hdd` | هاردات HDD |
| `psu` | باور سبلاي |
| `cases` | كيسات |
| `cooling` | تبريد |
| `monitors` | شاشات |

## Output
الملفات بتتحفظ في `output/` بصيغة JSON:
```
output/
├── category_processors.json
├── category_gpu.json
└── sigma_all_products.json
```

## إدخال البيانات في قاعدة البيانات
```python
from db_schema import load_scraper_output

load_scraper_output(
    json_file="output/category_processors.json",
    db_url="postgresql://user:pass@localhost/pcprices",
    store_slug="sigma"
)
```

## ملاحظات مهمة
- الموقع عنده WAF — لازم Playwright (مش requests عادية)
- خليك محترم مع الموقع: delay بين كل request
- اشتغّل مرة كل 6 ساعات بالـ cron job

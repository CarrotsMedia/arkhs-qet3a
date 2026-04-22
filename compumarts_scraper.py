"""
Compumarts Scraper
==================
Fetches products and prices from compumarts.com using their native Shopify JSON API.
This is blazingly fast and does not require Playwright.

Usage:
    python compumarts_scraper.py --search "rtx 4070"
    python compumarts_scraper.py --all
"""

import asyncio
import json
import logging
import ssl
import urllib.request
import urllib.parse
from dataclasses import dataclass, asdict
from datetime import datetime, UTC
from pathlib import Path
from typing import Optional

# ──────────────────────────────────────────────
# Config
# ──────────────────────────────────────────────
BASE_URL = "https://www.compumarts.com"

OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("compumarts")


# ──────────────────────────────────────────────
# Data model
# ──────────────────────────────────────────────
@dataclass
class Product:
    id: str                      # slug من الـ URL
    name: str
    price_egp: Optional[float]   # None لو out-of-stock
    original_price_egp: Optional[float]  # لو فيه خصم
    discount_pct: Optional[float]
    availability: str            # "in_stock" / "out_of_stock"
    category: str
    brand: str
    image_url: str
    product_url: str
    specs: dict                  # مواصفات إضافية
    source: str = "compumarts"
    scraped_at: str = ""

    def __post_init__(self):
        self.scraped_at = datetime.now(UTC).isoformat()


# ──────────────────────────────────────────────
# Fetchers
# ──────────────────────────────────────────────
def fetch_json(url: str) -> dict:
    """Synchronous fetch of JSON data using urllib"""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(
        url, 
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json'
        }
    )
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=30) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        log.error(f"Error fetching JSON from {url}: {e}")
        return {}


def parse_shopify_product(p: dict, is_suggest_api: bool = False) -> Optional[Product]:
    """Parses Shopify product dict into Product dataclass"""
    try:
        if is_suggest_api:
            # Format from search/suggest.json
            name = p.get('title', '')
            product_url = BASE_URL + p.get('url', '')
            slug = product_url.split('?')[0].rstrip('/').split('/')[-1]
            image_url = p.get('image', '')
            if image_url and not image_url.startswith('http'):
                image_url = 'https:' + image_url
            
            price_str = p.get('price', '0')
            price = float(price_str) if price_str else None
            
            orig_price_str = p.get('compare_at_price', '0')
            orig_price = float(orig_price_str) if orig_price_str else None
            
            availability = "in_stock" if p.get('available', True) else "out_of_stock"
            brand = p.get('vendor', name.split()[0] if name else "Unknown")
            category = "Search Result"

        else:
            # Format from products.json
            name = p.get('title', '')
            slug = p.get('handle', '')
            product_url = f"{BASE_URL}/products/{slug}"
            
            images = p.get('images', [])
            image_url = images[0].get('src', '') if images else ''
            
            brand = p.get('vendor', name.split()[0] if name else "Unknown")
            category = p.get('product_type', 'Uncategorized')
            
            variants = p.get('variants', [])
            price = None
            orig_price = None
            availability = "out_of_stock"
            
            if variants:
                first_var = variants[0]
                price = float(first_var.get('price', 0) or 0)
                orig_price = float(first_var.get('compare_at_price', 0) or 0)
                if first_var.get('available'):
                    availability = "in_stock"
            
            if price == 0:
                price = None

        if not name or price == 1.0: # Some sites use 1.0 as a placeholder for OOS/Call us
             if price == 1.0:
                 availability = "out_of_stock"

        discount = None
        if price and orig_price and orig_price > price:
            discount = round((1 - price / orig_price) * 100, 1)

        return Product(
            id=slug,
            name=name,
            price_egp=price,
            original_price_egp=orig_price if orig_price and orig_price > (price or 0) else None,
            discount_pct=discount,
            availability=availability,
            category=category,
            brand=brand,
            image_url=image_url,
            product_url=product_url,
            specs={},
        )
    except Exception as e:
        log.debug(f"Error parsing product: {e}")
        return None


async def scrape_all(max_pages: int = 50) -> list[Product]:
    """Scrapes all products using products.json"""
    products: list[Product] = []
    page = 1
    
    while page <= max_pages:
        url = f"{BASE_URL}/products.json?limit=250&page={page}"
        log.info(f"Fetching all products — page {page}")
        
        data = await asyncio.to_thread(fetch_json, url)
        items = data.get('products', [])
        
        if not items:
            log.info("No more products found, stopping.")
            break
            
        log.info(f"Found {len(items)} products on page {page}")
        
        for item in items:
            product = parse_shopify_product(item, is_suggest_api=False)
            if product:
                products.append(product)
                
        page += 1
        await asyncio.sleep(1) # Be nice to the API
        
    return products


async def search_products(query: str) -> list[Product]:
    """Searches products using search/suggest.json"""
    log.info(f"Searching '{query}'")
    # Shopify suggest API usually limits to 10 products max, but we can try to ask for more.
    # To get all pages of search, we would normally use the storefront API or HTML parsing.
    # Since we want it fast and it's mostly for live top results, 10-20 is fine.
    encoded_query = urllib.parse.quote_plus(query)
    url = f"{BASE_URL}/search/suggest.json?q={encoded_query}&resources[type]=product&resources[limit]=52"
    
    data = await asyncio.to_thread(fetch_json, url)
    items = data.get('resources', {}).get('results', {}).get('products', [])
    
    products: list[Product] = []
    log.info(f"Found {len(items)} products for query '{query}'")
    
    for item in items:
        product = parse_shopify_product(item, is_suggest_api=True)
        if product:
            products.append(product)
            
    return products


# ──────────────────────────────────────────────
# Save output
# ──────────────────────────────────────────────
def save_results(products: list[Product], filename: str):
    """Saves results to JSON"""
    data = {
        "scraped_at": datetime.now(UTC).isoformat(),
        "source": "compumarts",
        "total": len(products),
        "products": [asdict(p) for p in products],
    }
    out_path = OUTPUT_DIR / filename
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info(f"Saved {len(products)} products → {out_path}")
    return out_path


# ──────────────────────────────────────────────
# Entry point
# ──────────────────────────────────────────────
async def run(mode: str, query: str = ""):
    all_products: list[Product] = []

    if mode == "search":
        products = await search_products(query)
        all_products.extend(products)
        save_results(products, f"compumarts_search_{query.replace(' ', '_')}.json")

    elif mode == "all":
        products = await scrape_all()
        all_products.extend(products)
        save_results(products, "compumarts_all_products.json")

    return all_products


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Compumarts Fast API Scraper")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--search", metavar="QUERY", help="ابحث عن منتج معين")
    group.add_argument("--all", action="store_true", help="سكرب كل المنتجات")

    args = parser.parse_args()

    if args.search:
        asyncio.run(run("search", query=args.search))
    elif args.all:
        asyncio.run(run("all"))

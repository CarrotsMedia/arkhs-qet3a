import asyncio
import json
import logging
import re
from dataclasses import dataclass, asdict
from datetime import datetime, UTC
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin

from playwright.async_api import async_playwright, Page, Browser

# Config
BASE_URL = "https://www.dubaiphone.net/ar"
MOBILE_CATEGORY_URL = "https://www.dubaiphone.net/ar/category/all/mobiles-all-2/"

OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("dubaiphone")

@dataclass
class Product:
    id: str
    name: str
    price_egp: Optional[float]
    original_price_egp: Optional[float]
    discount_pct: Optional[float]
    availability: str
    category: str
    brand: str
    image_url: str
    product_url: str
    specs: dict
    source: str = "dubaiphone"
    scraped_at: str = ""

    def __post_init__(self):
        self.scraped_at = datetime.now(UTC).isoformat()

def parse_price(text: str) -> Optional[float]:
    if not text:
        return None
    # Find all digits, potentially with commas or dots
    # "6,199" -> "6199"
    cleaned = re.sub(r"[^\d.]", "", text.replace(",", ""))
    try:
        val = float(cleaned)
        return val if val > 0 else None
    except ValueError:
        return None

async def make_browser(pw) -> Browser:
    return await pw.chromium.launch(headless=True, args=[
        "--no-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage"
    ])

async def parse_product_card(card) -> Optional[Product]:
    try:
        # Title and URL
        title_el = await card.query_selector('a.line-clamp-2')
        if not title_el: return None
        name = (await title_el.inner_text()).strip()
        href = await title_el.get_attribute("href") or ""
        product_url = urljoin(BASE_URL, href)
        
        # ID from URL or class
        class_name = await card.get_attribute("class") or ""
        post_id_match = re.search(r'post-(\d+)', class_name)
        if post_id_match:
            product_id = post_id_match.group(1)
        else:
            product_id = product_url.strip('/').split('/')[-1]

        # Price
        # Look for font-extrabold span which contains the main price
        price_el = await card.query_selector('span.font-extrabold')
        price_text = await price_el.inner_text() if price_el else ""
        price = parse_price(price_text)
        
        # Check if out of stock
        # WooCommerce typically uses 'instock' and 'outofstock' classes
        availability = "in_stock" if "instock" in class_name else "out_of_stock"
        if "outofstock" in class_name:
            availability = "out_of_stock"

        # Image
        img_el = await card.query_selector('img')
        image_url = await img_el.get_attribute("src") if img_el else ""
        if not image_url or image_url.endswith('.svg') or "data:image" in image_url:
            # Try to get data-src if lazy loaded
            data_src = await img_el.get_attribute("data-src")
            if data_src:
                image_url = data_src

        # Brand from classes or title
        brand = "Unknown"
        # product_cat-xiaomi
        brand_match = re.search(r'product_cat-([a-zA-Z0-9-]+)', class_name)
        if brand_match:
            brand_cat = brand_match.group(1)
            if brand_cat != "installment-offer" and brand_cat != "mobiles-all-2":
                brand = brand_cat.capitalize()

        return Product(
            id=product_id,
            name=name,
            price_egp=price,
            original_price_egp=None,
            discount_pct=None,
            availability=availability,
            category="mobiles",
            brand=brand,
            image_url=image_url,
            product_url=product_url,
            specs={},
        )
    except Exception as e:
        log.debug(f"Error parsing card: {e}")
        return None

async def scrape_dubaiphone(max_items=100) -> list[Product]:
    async with async_playwright() as pw:
        browser = await make_browser(pw)
        context = await browser.new_context(
            viewport={"width": 1366, "height": 768},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
        page = await context.new_page()
        products = []
        seen_ids = set()

        try:
            page_num = 1
            while len(products) < max_items:
                current_url = f"{MOBILE_CATEGORY_URL}page/{page_num}/" if page_num > 1 else MOBILE_CATEGORY_URL
                log.info(f"Navigating to {current_url}")
                
                response = await page.goto(current_url, wait_until="domcontentloaded", timeout=60000)
                await asyncio.sleep(3)

                # Check if we got a 404 or redirected back to page 1
                if response and response.status == 404:
                    log.info("Reached end of pagination.")
                    break

                cards = await page.query_selector_all('article.nf-product-card')
                if not cards:
                    log.info("No more products found on this page.")
                    break
                
                for card in cards:
                    p = await parse_product_card(card)
                    if p and p.id not in seen_ids:
                        products.append(p)
                        seen_ids.add(p.id)
                
                log.info(f"Scraped {len(products)} products so far...")
                
                if len(products) >= max_items:
                    break

                page_num += 1
                
        except Exception as e:
            log.error(f"Scraping error: {e}")
        finally:
            await browser.close()
            
        return products

def save_results(products: list[Product], filename: str):
    data = {
        "scraped_at": datetime.now(UTC).isoformat(),
        "source": "dubaiphone",
        "total": len(products),
        "products": [asdict(p) for p in products],
    }
    out_path = OUTPUT_DIR / filename
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info(f"Saved {len(products)} products → {out_path}")

if __name__ == "__main__":
    products = asyncio.run(scrape_dubaiphone(max_items=200))
    save_results(products, "dubaiphone_mobiles.json")

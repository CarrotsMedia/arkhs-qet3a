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
BASE_URL = "https://alsheikhstores.com/"
MOBILE_CATEGORY_URL = "https://alsheikhstores.com/ar/product-category/%d9%85%d9%88%d8%a8%d9%8a%d9%84%d8%a7%d8%aa/"

OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("alsheikh")

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
    source: str = "alsheikhstores"
    scraped_at: str = ""

    def __post_init__(self):
        self.scraped_at = datetime.now(UTC).isoformat()

def parse_price(text: str) -> Optional[float]:
    if not text:
        return None
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
        class_name = await card.get_attribute("class") or ""
        
        # URL and Title
        link_el = await card.query_selector('a.woocommerce-LoopProduct-link')
        if not link_el: return None
        href = await link_el.get_attribute("href") or ""
        product_url = urljoin(BASE_URL, href)
        
        title_el = await card.query_selector('h2.woocommerce-loop-product__title')
        if not title_el: return None
        # Remove the brand span from title if it exists
        brand_span = await title_el.query_selector('.codevz-product-category-after-title')
        brand = "Unknown"
        if brand_span:
            brand = (await brand_span.inner_text()).strip()
            # We can evaluate to get the actual h2 text excluding the span
        name = await title_el.evaluate("el => { let clone = el.cloneNode(true); let span = clone.querySelector('span'); if(span) span.remove(); return clone.textContent.trim(); }")

        # ID
        post_id_match = re.search(r'post-(\d+)', class_name)
        product_id = post_id_match.group(1) if post_id_match else product_url.strip('/').split('/')[-1]

        # Price
        price_el = await card.query_selector('span.price')
        price = None
        orig_price = None
        
        if price_el:
            ins_el = await price_el.query_selector('ins .woocommerce-Price-amount')
            del_el = await price_el.query_selector('del .woocommerce-Price-amount')
            
            if ins_el and del_el:
                price = parse_price(await ins_el.inner_text())
                orig_price = parse_price(await del_el.inner_text())
            else:
                amount_el = await price_el.query_selector('.woocommerce-Price-amount')
                if amount_el:
                    price = parse_price(await amount_el.inner_text())

        # Availability
        availability = "in_stock" if "instock" in class_name else "out_of_stock"

        # Image
        img_el = await card.query_selector('img.attachment-woocommerce_thumbnail')
        image_url = ""
        if img_el:
            image_url = await img_el.get_attribute("data-src") or await img_el.get_attribute("src") or ""
            if image_url.startswith("data:image"):
                image_url = await img_el.get_attribute("data-lazy-src") or ""

        return Product(
            id=product_id,
            name=name,
            price_egp=price,
            original_price_egp=orig_price,
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

async def scrape_alsheikh(max_items=100) -> list[Product]:
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

                if response and response.status == 404:
                    log.info("Reached end of pagination (404).")
                    break

                cards = await page.query_selector_all('li.product.type-product')
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
        "source": "alsheikhstores",
        "total": len(products),
        "products": [asdict(p) for p in products],
    }
    out_path = OUTPUT_DIR / filename
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info(f"Saved {len(products)} products → {out_path}")

if __name__ == "__main__":
    products = asyncio.run(scrape_alsheikh(max_items=200))
    save_results(products, "alsheikhstores_mobiles.json")

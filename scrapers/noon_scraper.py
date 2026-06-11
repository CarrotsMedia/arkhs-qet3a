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
BASE_URL = "https://www.noon.com"
MOBILE_CATEGORY_URL = "https://www.noon.com/egypt-ar/mobiles/"

OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("noon")

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
    source: str = "noon"
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
    return await pw.chromium.launch(headless=False, args=[
        "--no-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage"
    ])

async def parse_product_card(card) -> Optional[Product]:
    try:
        # Link and ID
        link_el = await card.query_selector("a")
        if not link_el: return None
            
        href = await link_el.get_attribute("href") or ""
        product_url = f"{BASE_URL}{href}" if href.startswith("/") else href
        
        # ID
        match = re.search(r'/([^/]+)/p/?', href)
        product_id = match.group(1) if match else href.split('/')[-2] if len(href.split('/')) > 2 else ""
        
        # Title
        title_el = await card.query_selector('[data-qa="plp-product-box-name"]')
        if not title_el: return None
        name = (await title_el.inner_text()).strip()

        # Price
        price_el = await card.query_selector('[data-qa="plp-product-box-price"] strong, strong[class*="amount"]')
        price_text = await price_el.inner_text() if price_el else ""
        price = parse_price(price_text)

        # Original Price
        orig_price_el = await card.query_selector('span[class*="oldPrice"], .strikeThrough')
        orig_price_text = await orig_price_el.inner_text() if orig_price_el else ""
        orig_price = parse_price(orig_price_text)

        discount = None
        if price and orig_price and orig_price > price:
            discount = round((1 - price / orig_price) * 100, 1)

        # Image
        img_els = await card.query_selector_all("img")
        image_url = ""
        for img in img_els:
            src = await img.get_attribute("src") or ""
            if src and "media-placeholder" not in src:
                image_url = src
                break
        if not image_url and img_els:
            image_url = await img_els[0].get_attribute("src") or ""
             
        # Brand
        brand = name.split()[0] if name else "Unknown"

        # Availability
        availability = "in_stock" if price else "out_of_stock"

        return Product(
            id=product_id,
            name=name,
            price_egp=price,
            original_price_egp=orig_price,
            discount_pct=discount,
            availability=availability,
            category="mobiles",
            brand=brand,
            image_url=image_url,
            product_url=product_url,
            specs={"noon_id": product_id}
        )
    except Exception as e:
        log.debug(f"Error parsing Noon card: {e}")
        return None

async def scrape_noon(max_items=100) -> list[Product]:
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
                current_url = f"{MOBILE_CATEGORY_URL}?limit=50&page={page_num}" if page_num > 1 else MOBILE_CATEGORY_URL
                log.info(f"Navigating to {current_url}")
                
                await page.goto(current_url, wait_until="domcontentloaded", timeout=60000)
                await asyncio.sleep(5)

                cards = await page.query_selector_all('div[data-qa="plp-product-box"]')
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
        "source": "noon",
        "total": len(products),
        "products": [asdict(p) for p in products],
    }
    out_path = OUTPUT_DIR / filename
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info(f"Saved {len(products)} products → {out_path}")

if __name__ == "__main__":
    products = asyncio.run(scrape_noon(max_items=200))
    save_results(products, "noon_mobiles.json")

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
BASE_URL = "https://dream2000.com/"
MOBILE_CATEGORY_URL = "https://dream2000.com/mobiles.html"

OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("dream2000")

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
    source: str = "dream2000"
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
        # Title and URL
        title_el = await card.query_selector('.product-item-link')
        if not title_el: return None
        name = (await title_el.inner_text()).strip()
        href = await title_el.get_attribute("href") or ""
        product_url = urljoin(BASE_URL, href)
        
        # ID from price box
        price_box = await card.query_selector('.price-box')
        product_id = ""
        if price_box:
            product_id = await price_box.get_attribute("data-product-id") or ""
        if not product_id:
            product_id = product_url.strip('/').split('/')[-1].replace('.html', '')

        # Price
        price_el = await card.query_selector('[data-price-type="finalPrice"] .price')
        price_text = await price_el.inner_text() if price_el else ""
        price = parse_price(price_text)
        
        # Original Price
        old_price_el = await card.query_selector('[data-price-type="oldPrice"] .price')
        old_price_text = await old_price_el.inner_text() if old_price_el else ""
        original_price = parse_price(old_price_text)

        # Availability
        button = await card.query_selector('button.tocart')
        availability = "in_stock" if button else "out_of_stock"
        
        # If there's an explicit out of stock element
        out_of_stock_el = await card.query_selector('.stock.unavailable')
        if out_of_stock_el:
            availability = "out_of_stock"

        # Image
        img_el = await card.query_selector('.product-image-photo')
        image_url = ""
        if img_el:
            image_url = await img_el.get_attribute("data-original") or await img_el.get_attribute("src") or ""

        # Brand
        brand_el = await card.query_selector('.ox-product-grid__category-link')
        brand = (await brand_el.inner_text()).strip() if brand_el else "Unknown"

        return Product(
            id=product_id,
            name=name,
            price_egp=price,
            original_price_egp=original_price,
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

async def scrape_dream2000(max_items=100) -> list[Product]:
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
                current_url = f"{MOBILE_CATEGORY_URL}?p={page_num}" if page_num > 1 else MOBILE_CATEGORY_URL
                log.info(f"Navigating to {current_url}")
                
                response = await page.goto(current_url, wait_until="domcontentloaded", timeout=60000)
                await asyncio.sleep(3)

                if response and response.status == 404:
                    log.info("Reached end of pagination (404).")
                    break

                cards = await page.query_selector_all('.product-item')
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

                # Check if there is a next page
                next_page_link = await page.query_selector('a.action.next, li.pages-item-next a')
                if not next_page_link:
                    log.info("No next page link found.")
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
        "source": "dream2000",
        "total": len(products),
        "products": [asdict(p) for p in products],
    }
    out_path = OUTPUT_DIR / filename
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info(f"Saved {len(products)} products → {out_path}")

if __name__ == "__main__":
    products = asyncio.run(scrape_dream2000(max_items=200))
    save_results(products, "dream2000_mobiles.json")

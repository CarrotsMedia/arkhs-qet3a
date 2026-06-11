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
BASE_URL = "https://beta.btech.com/en"
MOBILE_CATEGORY_URL = "https://beta.btech.com/en/c/mobiles-tablets"

OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("btech")

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
    source: str = "btech"
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
        title_el = await card.query_selector('[data-testid="product-card-title"]')
        if not title_el: return None
        name = (await title_el.inner_text()).strip()

        link_el = await card.query_selector('[data-testid="product-card-link"]')
        href = await link_el.get_attribute("href") if link_el else ""
        product_url = urljoin(BASE_URL, href)
        
        # ID is offering_id from URL or slug
        product_id = href.split("offering_id=")[-1] if "offering_id=" in href else name.replace(" ", "-").lower()

        price_el = await card.query_selector('[data-testid="current-price"]')
        price = parse_price(await price_el.inner_text()) if price_el else None
        
        # Check if out of stock
        out_of_stock = await card.query_selector('text="Out of stock"')
        availability = "out_of_stock" if out_of_stock or not price else "in_stock"

        img_el = await card.query_selector('[data-testid="product-card-thumbnail"] img')
        image_url = await img_el.get_attribute("src") if img_el else ""

        brand_el = await card.query_selector("h4")
        brand = (await brand_el.inner_text()).strip() if brand_el else "Unknown"

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

async def scrape_btech(max_items=100) -> list[Product]:
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
            log.info(f"Navigating to {MOBILE_CATEGORY_URL}")
            await page.goto(MOBILE_CATEGORY_URL, wait_until="domcontentloaded", timeout=60000)
            await asyncio.sleep(5)
            
            # Scroll down to load more products
            last_height = 0
            retries = 0
            while len(products) < max_items and retries < 3:
                cards = await page.query_selector_all('[data-testid="product-card"]')
                
                for card in cards:
                    p = await parse_product_card(card)
                    if p and p.id not in seen_ids:
                        products.append(p)
                        seen_ids.add(p.id)
                
                log.info(f"Scraped {len(products)} products so far...")
                
                # Scroll
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(3)
                
                new_height = await page.evaluate("document.body.scrollHeight")
                if new_height == last_height:
                    retries += 1
                else:
                    retries = 0
                last_height = new_height
                
        except Exception as e:
            log.error(f"Scraping error: {e}")
        finally:
            await browser.close()
            
        return products

def save_results(products: list[Product], filename: str):
    data = {
        "scraped_at": datetime.now(UTC).isoformat(),
        "source": "btech",
        "total": len(products),
        "products": [asdict(p) for p in products],
    }
    out_path = OUTPUT_DIR / filename
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info(f"Saved {len(products)} products → {out_path}")

if __name__ == "__main__":
    products = asyncio.run(scrape_btech(max_items=200))
    save_results(products, "btech_mobiles.json")

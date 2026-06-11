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
BASE_URL = "https://www.rayashop.com"
MOBILE_CATEGORY_URL = "https://www.rayashop.com/ar/smartphones"

OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("raya")

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
    source: str = "rayashop"
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
        title_el = await card.query_selector('p.name')
        if not title_el:
            # Fallback
            title_el = await card.query_selector('a p')
        if not title_el: return None
        name = (await title_el.inner_text()).strip()

        link_el = await card.query_selector('a[href]')
        if not link_el: return None
        href = await link_el.get_attribute("href") or ""
        product_url = urljoin(BASE_URL, href)
        
        # ID is usually the last number in URL or slug
        # /ar/samsung-galaxy-a17-...-259654
        product_id = href.split("-")[-1] if "-" in href else href.split("/")[-1]
        
        # Price
        price_el = await card.query_selector('span.text-primary-500')
        price_text = await price_el.inner_text() if price_el else ""
        price = parse_price(price_text)

        # Original price
        orig_price_el = await card.query_selector('span.line-through')
        orig_price_text = await orig_price_el.inner_text() if orig_price_el else ""
        original_price = parse_price(orig_price_text)

        # Discount
        discount = None
        if price and original_price and original_price > price:
            discount = round((1 - price / original_price) * 100, 1)

        # Image
        img_el = await card.query_selector('img.ProductCard__Thumb')
        image_url = ""
        if img_el:
            image_url = await img_el.get_attribute("src") or ""
            # Nuxt lazyload check
            if not image_url or image_url.startswith("data:image"):
                image_url = await img_el.get_attribute("data-src") or ""

        # Brand from name (first word)
        brand = name.split()[0] if name else "Unknown"

        # Availability
        availability = "in_stock"
        # Check if there is out of stock text
        card_text = await card.inner_text()
        if "نفدت" in card_text or "غير متوفر" in card_text or "out of stock" in card_text.lower():
            availability = "out_of_stock"

        return Product(
            id=product_id,
            name=name,
            price_egp=price,
            original_price_egp=original_price,
            discount_pct=discount,
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

async def scrape_raya(max_items=100) -> list[Product]:
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

            # Click "Load More" repeatedly until we reach max_items or no more button
            retries = 0
            while len(products) < max_items and retries < 10:
                cards = await page.query_selector_all('article.ProductCard')
                for card in cards:
                    p = await parse_product_card(card)
                    if p and p.id not in seen_ids:
                        products.append(p)
                        seen_ids.add(p.id)
                
                log.info(f"Scraped {len(products)} products so far...")
                
                if len(products) >= max_items:
                    break

                # Scroll down a bit to ensure the button is in view
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(2)

                # Look for "تحميل المزيد" or "Load more" button
                load_more = await page.query_selector('span.AppButton__text:has-text("تحميل المزيد")')
                if not load_more:
                    # Let's try finding by class
                    load_more = await page.query_selector('button:has-text("تحميل المزيد")')
                
                if load_more:
                    log.info("Clicking Load More button...")
                    try:
                        await load_more.click(timeout=5000)
                        await asyncio.sleep(3)
                        retries = 0
                    except Exception as e:
                        log.warning(f"Failed to click load more: {e}")
                        retries += 1
                else:
                    log.info("No more load more button found.")
                    break
                
        except Exception as e:
            log.error(f"Scraping error: {e}")
        finally:
            await browser.close()
            
        return products

def save_results(products: list[Product], filename: str):
    data = {
        "scraped_at": datetime.now(UTC).isoformat(),
        "source": "rayashop",
        "total": len(products),
        "products": [asdict(p) for p in products],
    }
    out_path = OUTPUT_DIR / filename
    out_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info(f"Saved {len(products)} products → {out_path}")

if __name__ == "__main__":
    products = asyncio.run(scrape_raya(max_items=200))
    save_results(products, "rayashop_mobiles.json")

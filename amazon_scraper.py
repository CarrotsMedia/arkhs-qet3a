import asyncio
import json
import logging
import argparse
import re
from typing import Optional
from dataclasses import dataclass, asdict
from datetime import datetime, UTC
from pathlib import Path

from playwright.async_api import async_playwright, Page, TimeoutError as PwTimeout

# ──────────────────────────────────────────────
# Settings
# ──────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger(__name__)

BASE_URL = "https://www.amazon.eg"
# Force English version to keep selectors consistent
SEARCH_URL_TEMPLATE = "https://www.amazon.eg/s?k={query}&i=electronics&language=en_AE"

OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

# ──────────────────────────────────────────────
# Models
# ──────────────────────────────────────────────
@dataclass
class Product:
    id: str           # ASIN
    name: str         
    price_egp: float  
    original_price_egp: Optional[float] 
    discount_pct: Optional[float]
    availability: str # "in_stock" or "out_of_stock"
    category: Optional[str]
    brand: Optional[str]
    specs: dict
    image_url: str

def parse_price(text: str) -> Optional[float]:
    if not text:
        return None
    # Remove EGP, commas, etc.
    clean_text = re.sub(r"[^\d.]", "", text)
    try:
        return float(clean_text)
    except ValueError:
        return None

class AmazonScraper:
    def __init__(self):
        self.products: list[Product] = []
        self.scraped_at = datetime.now(UTC).isoformat()

    async def init_browser(self, pw):
        # We use a real-looking user agent
        return await pw.chromium.launch(headless=True)

    async def get_page(self, browser):
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080},
            extra_http_headers={
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Referer": "https://www.google.com/"
            }
        )
        page = await context.new_page()
        # Abort images to speed up, but Amazon sometimes breaks if too many things are aborted
        # Let's keep it simple for now
        return page

    async def parse_product_card(self, card, category: str) -> Optional[Product]:
        try:
            # ASIN
            asin = await card.get_attribute("data-asin")
            if not asin:
                return None

            # Title - Using a more flexible selector
            title_el = await card.query_selector("h2 span")
            if not title_el:
                # Try fallback
                title_el = await card.query_selector("span.a-size-base-plus, span.a-size-medium")
                
            if not title_el:
                return None
            name = (await title_el.inner_text()).strip()

            # Link
            link_el = await card.query_selector("a.a-link-normal")
            href = await link_el.get_attribute("href") if link_el else ""
            product_url = f"{BASE_URL}{href}" if href.startswith("/") else href

            # Price
            price_el = await card.query_selector("span.a-price span.a-offscreen")
            price = None
            if price_el:
                price = parse_price(await price_el.inner_text())
            
            if not price:
                # Fallback to whole/fraction
                whole = await card.query_selector("span.a-price-whole")
                fraction = await card.query_selector("span.a-price-fraction")
                if whole:
                    whole_text = (await whole.inner_text()).replace(",", "").replace(".", "").strip()
                    frac_text = (await fraction.inner_text()).strip() if fraction else "00"
                    price = parse_price(f"{whole_text}.{frac_text}")

            if not price:
                return None

            # Original Price
            orig_price = None
            strike_el = await card.query_selector("span.a-price.a-text-price span.a-offscreen")
            if strike_el:
                orig_price = parse_price(await strike_el.inner_text())

            discount = None
            if price and orig_price and orig_price > price:
                discount = round((1 - price / orig_price) * 100, 1)

            # Image
            img_el = await card.query_selector("img.s-image")
            image_url = (await img_el.get_attribute("src") or "") if img_el else ""

            # Availability
            avail_text = (await card.inner_text()).lower()
            if "currently unavailable" in avail_text or "out of stock" in avail_text:
                availability = "out_of_stock"
            else:
                availability = "in_stock"

            brand = name.split()[0] if name else "Unknown"

            return Product(
                id=asin,
                name=name,
                price_egp=price,
                original_price_egp=orig_price,
                discount_pct=discount,
                availability=availability,
                category=category,
                brand=brand,
                specs={"url": product_url, "asin": asin},
                image_url=image_url
            )
        except Exception as e:
            log.debug(f"Error parsing Amazon card: {e}")
            return None

    async def search_products(self, page: Page, query: str, max_pages: int = 1):
        url = SEARCH_URL_TEMPLATE.format(query=query.replace(" ", "+"))
        log.info(f"Searching Amazon EG for: '{query}'")

        try:
            # Use domcontentloaded instead of networkidle
            await page.goto(url, wait_until="domcontentloaded", timeout=45000)
            await asyncio.sleep(3) # Wait a bit for dynamic content
        except PwTimeout:
            log.warning("Timeout reached during navigation. Attempting to parse anyway.")
            return

        # Handle possible "Bot Check" or "Cookies"
        if "To discuss automated access to Amazon data please contact" in await page.content():
            log.error("Amazon blocked us with a bot check page!")
            return

        cards = await page.query_selector_all('div[data-component-type="s-search-result"]')
        log.info(f"Found {len(cards)} result cards.")

        for card in cards:
            product = await self.parse_product_card(card, "search_result")
            if product:
                # Basic strict check: does the name contain at least one part of the query?
                # This helps filter out random accessories Amazon injects
                query_parts = query.lower().split()
                if any(part in product.name.lower() for part in query_parts):
                    self.products.append(product)

    def save_json(self, filename: str):
        filepath = OUTPUT_DIR / filename
        data = {
            "store": "amazon",
            "scraped_at": self.scraped_at,
            "total_products": len(self.products),
            "products": [asdict(p) for p in self.products]
        }
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        log.info(f"Saved {len(self.products)} products \u2192 {filepath}")


async def main():
    parser = argparse.ArgumentParser(description="Amazon Egypt Scraper Prototype")
    parser.add_argument("--search", type=str, required=True, help="Search query")
    
    args = parser.parse_args()
    
    scraper = AmazonScraper()

    async with async_playwright() as pw:
        browser = await scraper.init_browser(pw)
        page = await scraper.get_page(browser)

        await scraper.search_products(page, args.search)
        
        safe_query = re.sub(r"[^\w]", "_", args.search.lower())
        scraper.save_json(f"amazon_search_{safe_query}.json")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

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

BASE_URL = "https://www.noon.com"
SEARCH_URL_TEMPLATE = "https://www.noon.com/egypt-en/search/?q={query}"

OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

# ──────────────────────────────────────────────
# Models
# ──────────────────────────────────────────────
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

def parse_price(text: str) -> Optional[float]:
    if not text:
        return None
    # Remove EGP, commas, etc.
    clean_text = re.sub(r"[^\d.]", "", text)
    try:
        return float(clean_text)
    except ValueError:
        return None

class NoonScraper:
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
            }
        )
        return await context.new_page()

    async def parse_product_card(self, card, category: str) -> Optional[Product]:
        try:
            # We need to find the link to get the ID and URL
            link_el = await card.query_selector("a")
            if not link_el:
                return None
                
            href = await link_el.get_attribute("href") or ""
            product_url = f"{BASE_URL}{href}" if href.startswith("/") else href
            
            # Noon URLs typically end with the ID, e.g. /laptop-x/N12345678A/p/
            match = re.search(r'/([^/]+)/p/?', href)
            product_id = match.group(1) if match else href.split('/')[-2] if len(href.split('/')) > 2 else ""
            
            # Title
            title_el = await card.query_selector('div[data-qa="product-name"]')
            if not title_el:
                 return None
            name = (await title_el.inner_text()).strip()

            # Price
            price_el = await card.query_selector('strong.amount')
            price = None
            if price_el:
                price = parse_price(await price_el.inner_text())

            # Original Price
            orig_price_el = await card.query_selector('div.oldPrice')
            orig_price = None
            if orig_price_el:
                orig_price = parse_price(await orig_price_el.inner_text())

            discount = None
            if price and orig_price and orig_price > price:
                discount = round((1 - price / orig_price) * 100, 1)

            # Image
            # Noon usually lazy loads images or uses specific classes. Let's try to find an img tag.
            img_el = await card.query_selector("img")
            image_url = ""
            if img_el:
                 image_url = await img_el.get_attribute("src") or ""
                 
            # Brand is usually the first word or part of the name
            brand = name.split()[0] if name else "Unknown"

            # Check Availability
            availability = "in_stock" if price else "out_of_stock"

            return Product(
                id=product_id,
                name=name,
                price_egp=price,
                original_price_egp=orig_price,
                discount_pct=discount,
                availability=availability,
                category=category,
                brand=brand,
                image_url=image_url,
                product_url=product_url,
                specs={"noon_id": product_id}
            )
        except Exception as e:
            log.debug(f"Error parsing Noon card: {e}")
            return None

    async def search_products(self, page: Page, query: str):
        url = SEARCH_URL_TEMPLATE.format(query=query.replace(" ", "%20"))
        log.info(f"Searching Noon EG for: '{query}'")

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=45000)
            # Wait for product grid wrapper
            await page.wait_for_selector('span.productContainer', timeout=15000)
            await asyncio.sleep(2) # Give it time to render dynamic content
        except PwTimeout:
            log.warning("Timeout reached. The page might not have loaded correctly or there are no results.")

        # Noon wraps products in a span with class productContainer
        cards = await page.query_selector_all('span.productContainer')
        log.info(f"Found {len(cards)} result cards for '{query}'.")

        added_count = 0
        for card in cards:
            product = await self.parse_product_card(card, "search_result")
            if product and product.price_egp:
                # Basic strict check to avoid irrelevant items
                query_parts = query.lower().split()
                if any(part in product.name.lower() for part in query_parts):
                    self.products.append(product)
                    added_count += 1
        
        log.info(f"Added {added_count} valid products for '{query}'.")

    def save_json(self, filename: str):
        filepath = OUTPUT_DIR / filename
        data = {
            "store": "noon",
            "scraped_at": self.scraped_at,
            "total_products": len(self.products),
            "products": [asdict(p) for p in self.products]
        }
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        log.info(f"Saved {len(self.products)} products \u2192 {filepath}")

async def main():
    parser = argparse.ArgumentParser(description="Noon Egypt Scraper")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--search", type=str, help="Search query")
    group.add_argument("--all", action="store_true", help="Scrape predefined categories")
    
    args = parser.parse_args()
    
    scraper = NoonScraper()

    async with async_playwright() as pw:
        browser = await scraper.init_browser(pw)
        page = await scraper.get_page(browser)

        if args.search:
            await scraper.search_products(page, args.search)
            safe_query = re.sub(r"[^\w]", "_", args.search.lower())
            scraper.save_json(f"noon_search_{safe_query}.json")
            
        elif args.all:
            keywords = ["laptop", "processor", "graphics card", "motherboard", "ssd", "monitor", "ram"]
            for keyword in keywords:
                await scraper.search_products(page, keyword)
                await asyncio.sleep(3) # Pause between searches to avoid rate limiting
            scraper.save_json("noon_all_products.json")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())

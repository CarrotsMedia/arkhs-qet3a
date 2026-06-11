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
# إعدادات اللوج والمسارات
# ──────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger(__name__)

BASE_URL = "https://maximumhardware.store"
OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

# أقسام Maximum Hardware الرئيسية
CATEGORIES = {
    "processors": "processors",
    "motherboards": "motherboards",
    "ram": "ram-memory",
    "gpu": "vga",
    "cases": "cases",
    "coolers": "cooling",
    "storage": "hard-disks",
    "psu": "power-supplies",
    "monitors": "monitors",
    "laptops": "laptops",
}

# ──────────────────────────────────────────────
# Models
# ──────────────────────────────────────────────
@dataclass
class Product:
    id: str           # slug
    name: str         
    price_egp: float  
    original_price_egp: Optional[float] 
    discount_pct: Optional[float]
    availability: str # "in_stock" أو "out_of_stock"
    category: Optional[str]
    brand: Optional[str]
    specs: dict
    image_url: str

def parse_price(text: str) -> Optional[float]:
    if not text:
        return None
    matches = re.findall(r"[\d,]+\.?\d*", text)
    if matches:
        return float(matches[0].replace(",", ""))
    return None

class MaximumScraper:
    def __init__(self):
        self.products: list[Product] = []
        self.scraped_at = datetime.now(UTC).isoformat()

    async def init_browser(self, pw):
        return await pw.chromium.launch(headless=True)

    async def get_page(self, browser):
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
            viewport={"width": 1920, "height": 1080}
        )
        page = await context.new_page()
        # تقليل وقت التحميل بمنع الصور والخطوط
        await page.route(
            "**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf}",
            lambda route: route.abort()
        )
        return page

    async def parse_product_card(self, card, category: str) -> Optional[Product]:
        try:
            # اسم المنتج والرابط
            name_el = await card.query_selector(".name a")
            name = (await name_el.inner_text()).strip() if name_el else ""
            href = await name_el.get_attribute("href") if name_el else ""
            if not name or not href:
                return None
            
            product_url = href if href.startswith("http") else f"{BASE_URL}{href}"
            slug = product_url.rstrip("/").split("/")[-1]

            # الأسعار
            price_new_el = await card.query_selector(".price-new")
            price_old_el = await card.query_selector(".price-old")
            price_normal_el = await card.query_selector(".price")

            if price_new_el:
                price = parse_price(await price_new_el.inner_text())
                orig_price = parse_price(await price_old_el.inner_text() if price_old_el else "")
            else:
                raw_price = await price_normal_el.inner_text() if price_normal_el else ""
                price = parse_price(raw_price.split("Ex Tax")[0])
                orig_price = None

            if not price:
                return None

            discount = None
            if price and orig_price and orig_price > price:
                discount = round((1 - price / orig_price) * 100, 1)

            # الصورة
            img_el = await card.query_selector(".product-img img, .image img")
            image_url = (await img_el.get_attribute("src") or "") if img_el else ""

            # Availability
            # في موقع البدر عادة ما يكتبون "Out Of Stock" كزرار لو خلصان
            cart_btn = await card.query_selector(".cart-group .btn-cart .btn-text")
            btn_text = (await cart_btn.inner_text()).strip().lower() if cart_btn else ""
            card_text = (await card.inner_text()).lower()
            if "out of stock" in btn_text or btn_text == "" or "coming soon" in card_text or price == 1.0:
                availability = "out_of_stock"
            else:
                availability = "in_stock"

            brand = name.split()[0] if name else "Unknown"

            return Product(
                id=slug,
                name=name,
                price_egp=price,
                original_price_egp=orig_price,
                discount_pct=discount,
                availability=availability,
                category=category,
                brand=brand,
                specs={"url": product_url},
                image_url=image_url
            )
        except Exception as e:
            log.debug(f"Error parsing card: {e}")
            return None

    async def scrape_url(self, page: Page, base_url: str, category_name: str, max_pages: int = 5):
        page_num = 1
        while page_num <= max_pages:
            url = f"{base_url}&page={page_num}" if "?" in base_url else f"{base_url}?page={page_num}"
            log.info(f"Targeting '{category_name}' — page {page_num}")

            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=25000)
                await asyncio.sleep(1)
            except PwTimeout:
                log.warning("Timeout reached.")
                break

            cards = await page.query_selector_all(".product-layout")
            if not cards:
                break

            for card in cards:
                product = await self.parse_product_card(card, category_name)
                if product:
                    self.products.append(product)

            # الانتقال للصفحة التالية
            next_btn = await page.query_selector("ul.pagination li a:text('>')")
            if not next_btn:
                break

            page_num += 1

    async def search_products(self, page: Page, query: str, max_pages: int = 50):
        search_url = f"{BASE_URL}/index.php?route=product/search&search={query.replace(' ', '%20')}"
        await self.scrape_url(page, search_url, "search", max_pages)

    async def scrape_category(self, page: Page, category_key: str, max_pages: int = 50):
        slug = CATEGORIES.get(category_key)
        if not slug:
            return
        cat_url = f"{BASE_URL}/{slug}"
        await self.scrape_url(page, cat_url, category_key, max_pages)

    def save_json(self, filename: str):
        filepath = OUTPUT_DIR / filename
        data = {
            "store": "maximumhardware",
            "scraped_at": self.scraped_at,
            "total_products": len(self.products),
            "products": [asdict(p) for p in self.products]
        }
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        log.info(f"Saved {len(self.products)} products → {filepath}")


async def main():
    parser = argparse.ArgumentParser(description="Maximum Hardware Web Scraper")
    parser.add_argument("--search", type=str, help="Search for a specific product")
    parser.add_argument("--category", type=str, choices=list(CATEGORIES.keys()), help="Scrape entirely a category")
    parser.add_argument("--pages", type=int, default=50, help="Max pages to scrape per action")
    parser.add_argument("--all", action="store_true", help="Scrape all main categories")

    args = parser.parse_args()
    if not (args.search or args.category or args.all):
        parser.print_help()
        return

    scraper = MaximumScraper()

    async with async_playwright() as pw:
        browser = await scraper.init_browser(pw)
        page = await scraper.get_page(browser)

        if args.search:
            await scraper.search_products(page, args.search, args.pages)
            scraper.save_json(f"maximum_search_{args.search.replace(' ', '_')}.json")
            return

        if args.category:
            await scraper.scrape_category(page, args.category, args.pages)
            scraper.save_json(f"maximum_cat_{args.category}.json")
            return

        if args.all:
            for cat in CATEGORIES.keys():
                await scraper.scrape_category(page, cat, args.pages)
            scraper.save_json("maximum_all_products.json")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())

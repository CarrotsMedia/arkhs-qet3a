"""
Sigma Computer Scraper
======================
بيسكرب المنتجات والأسعار من sigma-computer.com
يستخدم Playwright عشان الموقع محتاج browser حقيقي (WAF protection + Next.js RSC)

الموقع اتحدث وبيستخدم:
  - Next.js مع React Server Components
  - Chakra UI للـ pagination
  - URL structure: /en/search?filters={"category_id":["UUID"]}
  - Product links: /en/item?id=SLUG

الاستخدام:
    python scraper.py --category hardware_components
    python scraper.py --search "rtx 4070"
    python scraper.py --all
"""

import asyncio
import json
import logging
import re
from dataclasses import dataclass, asdict
from datetime import datetime, UTC
from pathlib import Path
from typing import Optional
from urllib.parse import quote

from playwright.async_api import async_playwright, Page, Browser, TimeoutError as PwTimeout

# ──────────────────────────────────────────────
# Config
# ──────────────────────────────────────────────
BASE_URL = "https://sigma-computer.com/en"

# Categories with their UUIDs (updated April 2026)
CATEGORIES = {
    "hardware_components": "9f5039af-f5d2-4396-9ba2-8ac40277c373",
    "laptops":             "9f5039de-5c80-46f3-9fe4-6e8f94189b8c",
    "storage":             "9f5039ed-8dd4-4a9b-a8ce-caf20ed29436",
    "monitor":             "9f503a01-79d7-4a25-b3f3-63b0fd5b3094",
    "accessories":         "9f503a0f-5b3e-4efe-8722-ffbafc51114c",
    "desktop":             "9f503a1d-8d45-4d97-ad76-c068afaa39db",
    "network":             "9f503a27-0c58-45a9-bc20-5690b23fcc6f",
    "gaming_console":      "9f503a2c-77cc-48bf-a5c4-76030655fce2",
    "mobile_accessories":  "9f503a39-d26f-4b30-8008-1a5c6402ae40",
    "home_office":         "9f503a53-6867-4fe3-a6ff-cef657dac290",
    "batteries":           "9f503a5f-8301-4724-a46b-7ec02976b108",
    "content_creation":    "9f732b3d-d6a4-44d8-9a2b-cdc0e329b3d5",
    "bundles":             "9f83a3f5-420b-424c-a522-6f8eeee34fc6",
    "combos":              "9f83a60e-cb2d-461f-bc27-e4a2070b9d30",
    "other":               "9f758570-6716-42cc-ae44-b82779404469",
    "sigma_merch":         "a1988c0b-ea9f-4da0-9d7d-2ce41058b6f6",
}

OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("sigma")


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
    source: str = "sigma"
    scraped_at: str = ""

    def __post_init__(self):
        self.scraped_at = datetime.now(UTC).isoformat()


# ──────────────────────────────────────────────
# Browser helpers
# ──────────────────────────────────────────────
async def make_browser(pw) -> Browser:
    """بيعمل browser بـ settings تقلل احتمالية الـ block"""
    return await pw.chromium.launch(
        headless=True,
        args=[
            "--no-sandbox",
            "--disable-blink-features=AutomationControlled",
            "--disable-dev-shm-usage",
        ],
    )


async def make_page(browser: Browser) -> Page:
    """Page مع user-agent حقيقي وبدون علامات automation"""
    context = await browser.new_context(
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        viewport={"width": 1366, "height": 768},
        locale="en-US",
    )
    # إخفاء علامات Playwright
    await context.add_init_script("""
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        window.chrome = { runtime: {} };
    """)
    page = await context.new_page()
    # block الصور والفونتات عشان يسرّع
    await page.route(
        "**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf}",
        lambda route: route.abort()
    )
    return page


# ──────────────────────────────────────────────
# Parsers
# ──────────────────────────────────────────────
def parse_price(text: str) -> Optional[float]:
    """بيحوّل '12500 EGP' أو 'EGP 12,500.00' لـ 12500.0"""
    if not text:
        return None
    cleaned = re.sub(r"[^\d.]", "", text.replace(",", ""))
    try:
        val = float(cleaned)
        return val if val > 0 else None
    except ValueError:
        return None


def build_category_url(category_uuid: str, page_num: int = 1) -> str:
    """بيبني URL صفحة الـ category بالفورمات الجديد"""
    filters = json.dumps({"category_id": [category_uuid]})
    return f"{BASE_URL}/search?filters={quote(filters)}&page={page_num}"


async def parse_product_card(card, category: str) -> Optional[Product]:
    """بيحلل card واحدة من صفحة القائمة — الشكل الجديد (Chakra UI + Tailwind)"""
    try:
        # اسم المنتج — الـ tooltip trigger link
        name_el = await card.query_selector(
            "a.chakra-tooltip__trigger, "
            "a[id*='tooltip'][id*='trigger'], "
            "a.line-clamp-2"
        )
        name = (await name_el.inner_text()).strip() if name_el else ""
        if not name:
            # fallback: أي link فيه النص
            name_el = await card.query_selector("a[href*='/item']")
            name = (await name_el.inner_text()).strip() if name_el else ""
        if not name:
            return None

        # الـ URL — product link
        link_el = await card.query_selector(
            "a[href*='/item?id='], "
            "a[href*='/item/'], "
            "a.chakra-tooltip__trigger"
        )
        href = await link_el.get_attribute("href") if link_el else ""
        if not href:
            return None

        if href.startswith("http"):
            product_url = href
        elif href.startswith("/"):
            product_url = f"https://sigma-computer.com{href}"
        else:
            product_url = f"{BASE_URL}/{href}"

        # ID من الـ URL — extract slug from ?id=SLUG
        if "id=" in href:
            slug = href.split("id=")[-1].split("&")[0]
        else:
            slug = href.rstrip("/").split("/")[-1]

        # السعر الحالي — p tag with EGP
        price = None
        price_els = await card.query_selector_all("p")
        for pel in price_els:
            text = (await pel.inner_text()).strip()
            if "EGP" in text:
                # Check if it's a strikethrough (original price)
                classes = await pel.get_attribute("class") or ""
                if "line-through" not in classes:
                    price = parse_price(text)
                    break

        # السعر الأصلي (لو فيه خصم) — line-through style
        orig_price = None
        for pel in price_els:
            text = (await pel.inner_text()).strip()
            classes = await pel.get_attribute("class") or ""
            if "EGP" in text and "line-through" in classes:
                orig_price = parse_price(text)
                break

        # نسبة الخصم
        discount = None
        if price and orig_price and orig_price > price:
            discount = round((1 - price / orig_price) * 100, 1)

        # الصورة
        img_el = await card.query_selector("img[src*='product'], img[alt], img")
        image_url = ""
        if img_el:
            src = await img_el.get_attribute("src") or ""
            if src.startswith("/"):
                image_url = f"https://sigma-computer.com{src}"
            elif src.startswith("http"):
                image_url = src
            else:
                image_url = src

        # الـ availability
        card_text = (await card.inner_text()).lower()
        # Check for out of stock button (disabled Add to Cart)
        oos_btn = await card.query_selector(
            "button[disabled], "
            "button.bg-sigma-gray-disabled, "
            "[class*='disabled']"
        )
        if oos_btn or "coming soon" in card_text or "out of stock" in card_text or price == 1.0:
            availability = "out_of_stock"
        else:
            availability = "in_stock"

        # Brand من الاسم (أول كلمة عادةً)
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
            image_url=image_url,
            product_url=product_url,
            specs={},
        )
    except Exception as e:
        log.debug(f"Error parsing card: {e}")
        return None


async def scrape_product_details(page: Page, product: Product) -> Product:
    """
    بيفتح صفحة المنتج ويجيب المواصفات التفصيلية.
    بيتسمى بعد ما نجمع القائمة عشان نتعمق في المنتجات المهمة.
    """
    try:
        await page.goto(product.product_url, wait_until="domcontentloaded", timeout=20000)
        await page.wait_for_load_state("networkidle", timeout=10000)

        specs = {}

        # جداول المواصفات (شكل شائع في مواقع التجارة الإلكترونية)
        rows = await page.query_selector_all(
            "table.specifications tr, .product-specs tr, "
            ".product-attributes tr, .woocommerce-product-attributes tr"
        )
        for row in rows:
            cells = await row.query_selector_all("th, td")
            if len(cells) >= 2:
                key = (await cells[0].inner_text()).strip().lower().replace(" ", "_")
                val = (await cells[1].inner_text()).strip()
                if key and val:
                    specs[key] = val

        # لو ما لقيناش جدول، نحاول الـ description
        if not specs:
            desc_el = await page.query_selector(".product-description, .woocommerce-product-details__short-description")
            if desc_el:
                specs["description"] = (await desc_el.inner_text()).strip()[:500]

        product.specs = specs

    except PwTimeout:
        log.warning(f"Timeout on product details: {product.name}")
    except Exception as e:
        log.debug(f"Error fetching product details: {e}")

    return product


# ──────────────────────────────────────────────
# Main scraper
# ──────────────────────────────────────────────
async def scrape_category(
    page: Page,
    category_name: str,
    max_pages: int = 100,
    fetch_details: bool = False,
) -> list[Product]:
    """
    بيسكرب كل صفحات category معينة

    Args:
        page: Playwright page
        category_name: اسم الـ category (من CATEGORIES dict)
        max_pages: أقصى عدد صفحات (حماية من infinite loops)
        fetch_details: لو True بيجيب تفاصيل كل منتج (أبطأ)
    """
    category_uuid = CATEGORIES.get(category_name)
    if not category_uuid:
        log.error(f"Unknown category: {category_name}")
        return []

    products: list[Product] = []
    page_num = 1

    while page_num <= max_pages:
        url = build_category_url(category_uuid, page_num)
        log.info(f"Scraping {category_name} — page {page_num}: {url}")

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            # Wait for products grid to load
            try:
                await page.wait_for_selector(
                    ".grid, [class*='grid-cols']",
                    timeout=10000
                )
            except PwTimeout:
                log.warning(f"Grid not found on page {page_num}, trying to wait more...")
            await asyncio.sleep(2)
        except PwTimeout:
            log.warning(f"Timeout loading page {page_num}, stopping")
            break

        # ابحث عن الـ product cards
        # الشكل الجديد: div cards inside a grid container
        cards = await page.query_selector_all(
            ".grid > div.flex.flex-col, "
            ".grid > div[class*='border'], "
            ".grid > div[class*='rounded']"
        )

        # Fallback: broader selector
        if not cards:
            grid = await page.query_selector(".grid[class*='grid-cols']")
            if grid:
                cards = await grid.query_selector_all(":scope > div")

        if not cards:
            log.info(f"No products found on page {page_num}, stopping. Dumping HTML to debug.html")
            html = await page.content()
            Path("debug.html").write_text(html, encoding="utf-8")
            break

        log.info(f"Found {len(cards)} products on page {page_num}")

        for card in cards:
            product = await parse_product_card(card, category_name)
            if product:
                if fetch_details:
                    product = await scrape_product_details(page, product)
                    # ارجع للقائمة بعد ما فتحنا صفحة المنتج
                    await page.go_back()
                products.append(product)

        # هل فيه صفحة تانية؟
        # نستخدم URL navigation مباشرة (أسرع وأكثر استقراراً من click)
        # لو عدد المنتجات في الصفحة < 16 يبقى دي آخر صفحة
        if len(cards) < 16:
            log.info(f"Found less than 16 products ({len(cards)}), likely last page")
            break

        page_num += 1
        await asyncio.sleep(1.5)  # delay محترم بين الصفحات

    return products


async def search_products(page: Page, query: str, max_pages: int = 50) -> list[Product]:
    """بيبحث في الموقع ويرجع النتايج"""
    products: list[Product] = []
    page_num = 1

    while page_num <= max_pages:
        url = f"{BASE_URL}/search?q={query.replace(' ', '%20')}&page={page_num}"
        log.info(f"Searching '{query}' — page {page_num}")

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=25000)
            try:
                await page.wait_for_selector(
                    ".grid, [class*='grid-cols']",
                    timeout=10000
                )
            except PwTimeout:
                pass
            await asyncio.sleep(2)
        except PwTimeout:
            break

        # Same card selectors as category pages
        cards = await page.query_selector_all(
            ".grid > div.flex.flex-col, "
            ".grid > div[class*='border'], "
            ".grid > div[class*='rounded']"
        )

        if not cards:
            grid = await page.query_selector(".grid[class*='grid-cols']")
            if grid:
                cards = await grid.query_selector_all(":scope > div")

        if not cards:
            break

        for card in cards:
            product = await parse_product_card(card, "search")
            if product:
                products.append(product)

        # Pagination — URL-based
        if len(cards) < 16:
            break

        page_num += 1
        await asyncio.sleep(1.5)

    return products


# ──────────────────────────────────────────────
# Save output
# ──────────────────────────────────────────────
def save_results(products: list[Product], filename: str):
    """بيحفظ النتايج في JSON"""
    data = {
        "scraped_at": datetime.now(UTC).isoformat(),
        "source": "sigma-computer.com",
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
async def run(mode: str, query: str = "", categories: list[str] = None, fetch_details: bool = False):
    async with async_playwright() as pw:
        browser = await make_browser(pw)
        page = await make_page(browser)

        all_products: list[Product] = []

        try:
            if mode == "search":
                products = await search_products(page, query)
                all_products.extend(products)
                save_results(products, f"search_{query.replace(' ', '_')}.json")

            elif mode == "category":
                for cat in categories:
                    products = await scrape_category(page, cat, fetch_details=fetch_details)
                    all_products.extend(products)
                    save_results(products, f"category_{cat}.json")

            elif mode == "all":
                for cat_name in CATEGORIES:
                    products = await scrape_category(page, cat_name, fetch_details=fetch_details)
                    all_products.extend(products)
                    save_results(products, f"category_{cat_name}.json")

            # ملف شامل بكل المنتجات
            if len(all_products) > 0:
                save_results(all_products, "sigma_all_products.json")

        finally:
            await browser.close()

    return all_products


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Sigma Computer Scraper")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--search", metavar="QUERY", help="ابحث عن منتج معين")
    group.add_argument("--category", metavar="CAT", nargs="+",
                       choices=list(CATEGORIES.keys()),
                       help=f"سكرب category معينة: {', '.join(CATEGORIES.keys())}")
    group.add_argument("--all", action="store_true", help="سكرب كل الـ categories")
    parser.add_argument("--details", action="store_true",
                        help="اجيب مواصفات تفصيلية لكل منتج (أبطأ)")

    args = parser.parse_args()

    if args.search:
        asyncio.run(run("search", query=args.search, fetch_details=args.details))
    elif args.category:
        asyncio.run(run("category", categories=args.category, fetch_details=args.details))
    elif args.all:
        asyncio.run(run("all", fetch_details=args.details))

"""
Sigma Computer Scraper
======================
بيسكرب المنتجات والأسعار من sigma-computer.com
يستخدم Playwright عشان الموقع محتاج browser حقيقي (WAF protection)

الاستخدام:
    python scraper.py --category processors
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

from playwright.async_api import async_playwright, Page, Browser, TimeoutError as PwTimeout

# ──────────────────────────────────────────────
# Config
# ──────────────────────────────────────────────
BASE_URL = "https://sigma-computer.com/en"

# categories على الموقع
CATEGORIES = {
    "processors":    "/category/processors",
    "motherboards":  "/category/motherboards",
    "ram":           "/category/ram",
    "gpu":           "/category/graphic-cards",
    "ssd":           "/category/solid-state-drives",
    "hdd":           "/category/hard-drives",
    "psu":           "/category/power-supplies",
    "cases":         "/category/cases",
    "cooling":       "/category/cpu-coolers",
    "monitors":      "/category/monitors",
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
            "Chrome/122.0.0.0 Safari/537.36"
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
    """بيحوّل 'EGP 12,500.00' لـ 12500.0"""
    if not text:
        return None
    cleaned = re.sub(r"[^\d.]", "", text.replace(",", ""))
    try:
        return float(cleaned)
    except ValueError:
        return None


async def parse_product_card(card, category: str) -> Optional[Product]:
    """بيحلل card واحدة من صفحة القائمة"""
    try:
        # اسم المنتج
        name_el = await card.query_selector(".product-title, h2.name, .product-name, a.product-title, a[id^='tooltip']")
        name = (await name_el.inner_text()).strip() if name_el else ""
        if not name:
            return None

        # الـ URL
        link_el = await card.query_selector("a[href*='/product/'], a.product-title, h2.name a, a[id^='tooltip'], a")
        href = await link_el.get_attribute("href") if link_el else ""
        if href.startswith("http"):
            product_url = href
        elif href.startswith("/"):
            product_url = f"https://sigma-computer.com{href}"
        else:
            product_url = f"{BASE_URL}/{href}"

        # ID من الـ URL slug
        slug = product_url.rstrip("/").split("/")[-1]

        # السعر الحالي
        price_el = await card.query_selector(".price ins .amount, .price .amount, .price-box .price, span.price, p.text-sigma-blue-600, p:has-text('EGP')")
        price = parse_price(await price_el.inner_text() if price_el else "")

        # السعر الأصلي (لو فيه خصم)
        orig_el = await card.query_selector(".price del .amount, .regular-price .amount, p.line-through")
        orig_price = parse_price(await orig_el.inner_text() if orig_el else "")

        # نسبة الخصم
        discount = None
        if price and orig_price and orig_price > price:
            discount = round((1 - price / orig_price) * 100, 1)

        # الصورة
        img_el = await card.query_selector("img.product-image, .product-img img, img[src*='product'], img[alt]")
        image_url = (await img_el.get_attribute("src") or "") if img_el else ""

        # الـ availability
        oos_el = await card.query_selector(".out-of-stock, .sold-out, [class*='unavailable']")
        availability = "out_of_stock" if oos_el else "in_stock"

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
    max_pages: int = 10,
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
    path = CATEGORIES.get(category_name, f"/category/{category_name}")
    products: list[Product] = []
    page_num = 1

    while page_num <= max_pages:
        url = f"{BASE_URL}{path}?page={page_num}"
        log.info(f"Scraping {category_name} — page {page_num}: {url}")

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=25000)
            await page.wait_for_load_state("networkidle", timeout=15000)
            # انتظر شوية عشان الـ JS يحمل
            await asyncio.sleep(1.5)
        except PwTimeout:
            log.warning(f"Timeout loading page {page_num}, stopping")
            break

        # ابحث عن الـ product cards بأشكالها المختلفة
        cards = await page.query_selector_all(
            ".product-item, .product-card, "
            "li.product, article.product, "
            ".woocommerce-loop-product, "
            "[class*='product-grid'] .item"
        )

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
        next_btn = await page.query_selector(
            "a.next, .pagination .next a, [aria-label='Next page'], "
            "a[rel='next'], .page-numbers.next"
        )
        if not next_btn:
            log.info("No next page, done with category")
            break

        page_num += 1
        await asyncio.sleep(2)  # delay محترم بين الصفحات

    return products


async def search_products(page: Page, query: str, max_pages: int = 5) -> list[Product]:
    """بيبحث في الموقع ويرجع النتايج"""
    products: list[Product] = []
    page_num = 1

    while page_num <= max_pages:
        url = f"{BASE_URL}/search?q={query.replace(' ', '%20')}&page={page_num}"
        log.info(f"Searching '{query}' — page {page_num}")

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=25000)
            await page.wait_for_load_state("networkidle", timeout=15000)
            await asyncio.sleep(1.5)
        except PwTimeout:
            break

        cards = await page.query_selector_all(
            ".product-item, .product-card, li.product, "
            "article.product, .woocommerce-loop-product, "
            "div.flex.flex-col.gap-1.py-3, "
            "div[class*='hover:border-sigma-blue-400']"
        )

        if not cards:
            break

        for card in cards:
            product = await parse_product_card(card, "search")
            if product:
                products.append(product)

        next_btn = await page.query_selector("a.next, .pagination .next a, a[rel='next']")
        if not next_btn:
            break

        page_num += 1
        await asyncio.sleep(2)

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

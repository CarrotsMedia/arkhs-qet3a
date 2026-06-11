"""
Base Scraper
============
Shared base class for all Dawarly store scrapers.
Provides common browser setup, retry logic, data models, 
timing/error tracking, and result saving.

All store-specific scrapers inherit from this and implement run().
"""

import asyncio
import json
import logging
import re
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict, field
from datetime import datetime, UTC
from pathlib import Path
from typing import Optional

from playwright.async_api import async_playwright, Page, Browser, BrowserContext, TimeoutError as PwTimeout

# ──────────────────────────────────────────────
# Config
# ──────────────────────────────────────────────
OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)


# ──────────────────────────────────────────────
# Product Data Model (shared across all scrapers)
# ──────────────────────────────────────────────
@dataclass
class Product:
    id: str                      # Unique product ID (ASIN, slug, SKU, etc.)
    name: str
    price_egp: Optional[float]
    original_price_egp: Optional[float]
    discount_pct: Optional[float]
    availability: str            # "in_stock" / "out_of_stock"
    category: str
    brand: str
    image_url: str
    product_url: str
    specs: dict = field(default_factory=dict)
    source: str = ""
    scraped_at: str = ""

    def __post_init__(self):
        self.scraped_at = datetime.now(UTC).isoformat()


# ──────────────────────────────────────────────
# Price parser (shared)
# ──────────────────────────────────────────────
def parse_price(text: str) -> Optional[float]:
    """Converts '12,500 EGP' or 'EGP 12500.00' to 12500.0"""
    if not text:
        return None
    cleaned = re.sub(r"[^\d.]", "", text.replace(",", ""))
    try:
        val = float(cleaned)
        return val if val > 0 else None
    except ValueError:
        return None


# ──────────────────────────────────────────────
# Base Scraper
# ──────────────────────────────────────────────
class BaseScraper(ABC):
    """
    Abstract base class for all store scrapers.
    
    Usage:
        class MyScraper(BaseScraper):
            store_slug = "my-store"
            store_name = "My Store"
            
            async def run(self, page):
                # scrape products
                self.products.append(Product(...))
    """

    store_slug: str = ""
    store_name: str = ""
    
    # Configurable settings
    max_retries: int = 3
    retry_delay: float = 2.0
    page_delay: float = 1.5
    navigation_timeout: int = 30000

    def __init__(self):
        self.products: list[Product] = []
        self.errors: list[str] = []
        self.start_time: float = 0
        self.end_time: float = 0
        self.pages_scraped: int = 0
        self.log = logging.getLogger(self.store_slug or self.__class__.__name__)

    # ── Browser Setup ──

    async def make_browser(self, pw) -> Browser:
        """Create browser with anti-detection settings."""
        return await pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
            ],
        )

    async def make_context(self, browser: Browser) -> BrowserContext:
        """Create browser context with realistic user agent and stealth scripts."""
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1366, "height": 768},
            locale="en-US",
            extra_http_headers={
                "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
                "Accept-Encoding": "gzip, deflate, br",
            }
        )
        # Hide Playwright automation markers
        await context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
        """)
        return context

    async def make_page(self, context: BrowserContext, block_media: bool = True) -> Page:
        """Create a page with optional media blocking for faster scraping."""
        page = await context.new_page()
        if block_media:
            await page.route(
                "**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,mp4,mp3}",
                lambda route: route.abort()
            )
        return page

    # ── Navigation with Retry ──

    async def retry_goto(
        self,
        page: Page,
        url: str,
        wait_until: str = "domcontentloaded",
        timeout: int = None,
        retries: int = None,
    ) -> bool:
        """
        Navigate to URL with retry logic.
        Returns True if successful, False if all retries failed.
        """
        timeout = timeout or self.navigation_timeout
        retries = retries or self.max_retries

        for attempt in range(1, retries + 1):
            try:
                await page.goto(url, wait_until=wait_until, timeout=timeout)
                return True
            except PwTimeout:
                self.log.warning(f"Timeout attempt {attempt}/{retries}: {url}")
                if attempt < retries:
                    await asyncio.sleep(self.retry_delay * attempt)
                else:
                    self.errors.append(f"Navigation timeout after {retries} retries: {url}")
                    return False
            except Exception as e:
                self.errors.append(f"Navigation error: {e}")
                if attempt < retries:
                    await asyncio.sleep(self.retry_delay)
                else:
                    return False
        return False

    # ── Abstract Method ──

    @abstractmethod
    async def run(self, page: Page) -> list[Product]:
        """
        Override this method in each store scraper.
        Should populate self.products and return the list.
        """
        pass

    # ── Execute (Entry Point) ──

    async def execute(self) -> dict:
        """
        Full scraper lifecycle:
        1. Launch browser
        2. Call run()
        3. Save results
        4. Return report
        """
        self.start_time = time.time()
        self.log.info(f"▶ Starting {self.store_name} scraper")

        try:
            async with async_playwright() as pw:
                browser = await self.make_browser(pw)
                context = await self.make_context(browser)
                page = await self.make_page(context)

                try:
                    await self.run(page)
                except Exception as e:
                    self.errors.append(f"Scraper crashed: {e}")
                    self.log.error(f"✗ {self.store_name} crashed: {e}")
                finally:
                    await browser.close()

        except Exception as e:
            self.errors.append(f"Browser launch failed: {e}")
            self.log.error(f"✗ Failed to launch browser for {self.store_name}: {e}")

        self.end_time = time.time()
        duration = round(self.end_time - self.start_time, 1)

        # Save output
        output_file = None
        if self.products:
            output_file = self.save_results()

        # Log summary
        status = "✔ SUCCESS" if not self.errors else f"⚠ PARTIAL ({len(self.errors)} errors)"
        if not self.products:
            status = "✗ FAILED" if self.errors else "⚠ EMPTY"

        self.log.info(
            f"{status}: {self.store_name} — "
            f"{len(self.products)} products, {self.pages_scraped} pages, "
            f"{duration}s"
        )

        return self.get_report(output_file)

    # ── Output ──

    def save_results(self, filename: str = None) -> str:
        """Save scraped products to JSON file."""
        if not filename:
            filename = f"{self.store_slug}_all_products.json"
        
        data = {
            "scraped_at": datetime.now(UTC).isoformat(),
            "source": self.store_slug,
            "total": len(self.products),
            "products": [asdict(p) for p in self.products],
        }
        out_path = OUTPUT_DIR / filename
        out_path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        self.log.info(f"Saved {len(self.products)} products → {out_path}")
        return str(out_path)

    def get_report(self, output_file: str = None) -> dict:
        """Generate a report dict for this scraper run."""
        duration = round(self.end_time - self.start_time, 1) if self.end_time else 0
        return {
            "store_slug": self.store_slug,
            "store_name": self.store_name,
            "status": "success" if self.products and not self.errors else (
                "partial" if self.products else "failed"
            ),
            "products_scraped": len(self.products),
            "pages_scraped": self.pages_scraped,
            "errors": self.errors[:10],  # Cap error messages
            "error_count": len(self.errors),
            "duration_seconds": duration,
            "output_file": output_file,
            "completed_at": datetime.now(UTC).isoformat(),
        }

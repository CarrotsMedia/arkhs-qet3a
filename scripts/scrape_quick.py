import asyncio
import sys
import os
import sqlite3
import json

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from amazon_scraper import AmazonScraper
from playwright.async_api import async_playwright
from db_schema import load_scraper_output, classify_product

DB_PATH = "../pc_parts.db"
KEYWORDS = ["iphone", "refrigerator", "t-shirt", "perfume", "smart watch"]

async def scrape_and_load():
    scraper = AmazonScraper()
    
    async with async_playwright() as pw:
        print("Launching browser...")
        browser = await scraper.init_browser(pw)
        page = await scraper.get_page(browser)
        
        for kw in KEYWORDS:
            print(f"Scraping Amazon EG for: '{kw}'")
            try:
                await scraper.search_products(page, kw)
                await asyncio.sleep(2) # Small delay
            except Exception as e:
                print(f"Error scraping {kw}: {e}")
                
        await browser.close()
        
    # Save the JSON file
    filename = "output/amazon_quick_scraped.json"
    scraper.save_json("../" + filename)
    
    # Load into Database
    print(f"Loading scraped products into database...")
    load_scraper_output("../" + filename, "amazon", db_path=DB_PATH)
    
    # Reclassify new products
    print("Reclassifying newly added products...")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    cur.execute("SELECT id, name, category FROM products WHERE category_id IS NULL")
    products = cur.fetchall()
    print(f"Found {len(products)} unclassified products.")
    
    updated = 0
    for p_id, p_name, p_cat in products:
        cat_id, subcat_id = classify_product(p_name, p_cat or "", conn)
        if cat_id or subcat_id:
            cur.execute(
                "UPDATE products SET category_id = ?, subcategory_id = ? WHERE id = ?",
                (cat_id, subcat_id, p_id)
            )
            updated += 1
            
    conn.commit()
    conn.close()
    print(f"Successfully reclassified {updated} products!")

if __name__ == "__main__":
    asyncio.run(scrape_and_load())

import subprocess
import time
import sys
from pathlib import Path
from datetime import datetime
from db_schema import load_scraper_output

def run_command(cmd, desc):
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] {desc} ...", flush=True)
    try:
        subprocess.run([sys.executable] + cmd, check=True)
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Success: {desc}")
        return True
    except subprocess.CalledProcessError as e:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Error: {desc} failed with exit code {e.returncode}")
        return False
    except Exception as e:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Error: {desc} failed with error {e}")
        return False

def main():
    print("=" * 60)
    print(f"Starting Mobile & Tablets Sync at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    start_time = time.time()
    
    scrapers = [
        ("scrapers/noon_scraper.py", "noon", "Scraping Noon Mobiles"),
        ("scrapers/amazon_scraper.py", "amazon", "Scraping Amazon Mobiles"),
        ("scrapers/btech_scraper.py", "btech", "Scraping B.TECH"),
        ("scrapers/dubaiphone_scraper.py", "dubaiphone", "Scraping Dubai Phone"),
        ("scrapers/dream2000_scraper.py", "dream2000", "Scraping Dream 2000"),
        ("scrapers/alsheikh_scraper.py", "alsheikhstores", "Scraping Al Sheikh Stores"),
        ("scrapers/raya_scraper.py", "rayashop", "Scraping Raya Shop"),
        ("scrapers/2b_scraper.py", "2b", "Scraping 2B"),
        ("scrapers/jumia_scraper.py", "jumia", "Scraping Jumia"),
    ]
    
    results = {}
    
    # Run scrapers
    for script, slug, desc in scrapers:
        if Path(script).exists():
            # Pass mobile specific flags if needed, for now just run the script
            # Assuming scripts are modified to default to mobiles or take no args for mobiles
            results[slug] = run_command([script, "--mobiles"], desc)
        else:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Skipping {desc}: {script} not found")
            results[slug] = False

    # Load data into DB
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Loading data into Database ...")
    
    for script, slug, desc in scrapers:
        file_path = Path(f"output/{slug}_mobiles.json")
        if results.get(slug) and file_path.exists():
            try:
                load_scraper_output(str(file_path), slug)
            except Exception as e:
                print(f"Failed to load {slug} data into DB: {e}")
        elif results.get(slug) and not file_path.exists():
            print(f"{slug} scraped finished but {file_path} not found.")

    # Clean up output directory
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Cleaning up temporary files ...")
    try:
        for script, slug, desc in scrapers:
            file_path = Path(f"output/{slug}_mobiles.json")
            if file_path.exists():
                file_path.unlink()
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Clean up complete.")
    except Exception as e:
        print(f"Note: Failed to clean up some files: {e}")

    elapsed = time.time() - start_time
    print("=" * 60)
    print(f"Sync Completed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} (Took {elapsed:.2f} seconds)")
    print("=" * 60)

    # Trigger product variant mapping and normalization pipeline
    print("\n🔄 Running product variants merge pipeline (merge_products_v2.py)...")
    try:
        from scripts.merge_products_v2 import process_merge_pipeline
        process_merge_pipeline()
        print("✔ Product variants merge pipeline completed successfully!")
    except Exception as e:
        print(f"✗ Product variants merge pipeline failed: {e}")

if __name__ == "__main__":
    main()

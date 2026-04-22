import subprocess
import time
import sys
from pathlib import Path
from datetime import datetime
from db_schema import load_scraper_output

def run_command(cmd, desc):
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] {desc} ...", flush=True)
    try:
        # Use simple Popen without timeout or pipe if we want to stream output natively,
        # but check_call with sys.executable is usually safer
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
    print(f"Starting Daily Sync for Dawarly at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    start_time = time.time()
    
    # 1. Scrape Sigma
    sigma_success = run_command(["scraper.py", "--all"], "Scraping Sigma Computer")
    
    # 2. Scrape El Badr
    elbadr_success = run_command(["elbadr_scraper.py", "--all"], "Scraping El Badr Group")
    
    # 3. Scrape Maximum Hardware
    max_success = run_command(["maximum_scraper.py", "--all"], "Scraping Maximum Hardware")
    
    # 4. Scrape Compumarts
    compumarts_success = run_command(["compumarts_scraper.py", "--all"], "Scraping Compumarts")
    
    # 5. Load data into DB
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Loading data into Database ...")
    
    sigma_file = Path("output/sigma_all_products.json")
    if sigma_success and sigma_file.exists():
        try:
            load_scraper_output(str(sigma_file), "sigma")
        except Exception as e:
            print(f"Failed to load Sigma data into DB: {e}")
    elif sigma_success and not sigma_file.exists():
        print(f"Sigma scraped finished but {sigma_file} not found.")
        
    elbadr_file = Path("output/elbadr_all_products.json")
    if elbadr_success and elbadr_file.exists():
        try:
            load_scraper_output(str(elbadr_file), "badr-group")
        except Exception as e:
            print(f"Failed to load El Badr data into DB: {e}")
    elif elbadr_success and not elbadr_file.exists():
        print(f"El Badr scraped finished but {elbadr_file} not found.")

    max_file = Path("output/maximum_all_products.json")
    if max_success and max_file.exists():
        try:
            load_scraper_output(str(max_file), "maximum-hardware")
        except Exception as e:
            print(f"Failed to load Maximum Hardware data into DB: {e}")
    elif max_success and not max_file.exists():
        print(f"Maximum Hardware scraped finished but {max_file} not found.")

    compumarts_file = Path("output/compumarts_all_products.json")
    if compumarts_success and compumarts_file.exists():
        try:
            load_scraper_output(str(compumarts_file), "compumarts")
        except Exception as e:
            print(f"Failed to load Compumarts data into DB: {e}")
    elif compumarts_success and not compumarts_file.exists():
        print(f"Compumarts scraped finished but {compumarts_file} not found.")

    # 5. Clean up output directory (optional, but good for space)
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Cleaning up temporary files ...")
    try:
        if sigma_file.exists(): sigma_file.unlink()
        if elbadr_file.exists(): elbadr_file.unlink()
        if max_file.exists(): max_file.unlink()
        if compumarts_file.exists(): compumarts_file.unlink()
        # Clean any category json files
        for f in Path("output").glob("category_*.json"):
            f.unlink()
        for f in Path("output").glob("elbadr_cat_*.json"):
            f.unlink()
        for f in Path("output").glob("maximum_cat_*.json"):
            f.unlink()
        for f in Path("output").glob("compumarts_cat_*.json"):
            f.unlink()
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Clean up complete.")
    except Exception as e:
        print(f"Note: Failed to clean up some files: {e}")

    elapsed = time.time() - start_time
    print("=" * 60)
    print(f"Sync Completed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} (Took {elapsed:.2f} seconds)")
    print("=" * 60)

if __name__ == "__main__":
    main()

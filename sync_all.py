#!/usr/bin/env python3
"""
Sync Orchestrator
=================
HARDENED scraper execution engine. Runs multiple scrapers with concurrent
subprocess control, monitors execution health, loads data into SQLite,
and generates a central health status report.

Usage:
    python sync_all.py                   # Run all scrapers (concurrency limit = 3)
    python sync_all.py --store sigma 2b  # Run specific store scrapers
    python sync_all.py --concurrency 4   # Run with 4 concurrent scraper slots
    python sync_all.py --no-cleanup      # Keep raw JSON output files
"""

import argparse
import asyncio
import json
import logging
import sys
import time
from datetime import datetime, UTC
from pathlib import Path
from scrapers.registry import get_scraper_config, get_all_store_slugs
from scrapers.db_loader import load_scraper_output
from scripts.merge_products_v2 import process_merge_pipeline

# Config Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (Orchestrator) %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("orchestrator")

REPORT_PATH = Path("output/sync_report.json")

def write_scraper_progress(store_slug: str, progress: dict):
    try:
        progress_path = Path("output") / f"progress_{store_slug}.json"
        progress_path.write_text(json.dumps(progress, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass

def delete_scraper_progress(store_slug: str):
    try:
        progress_path = Path("output") / f"progress_{store_slug}.json"
        if progress_path.exists():
            progress_path.unlink()
    except Exception:
        pass

async def run_single_scraper(store_slug: str, config: dict, semaphore: asyncio.Semaphore) -> dict:
    """Runs a single store scraper in a separate isolated subprocess with concurrency control."""
    async with semaphore:
        start_time = time.time()
        script = config["script"]
        args = config.get("args", [])
        output_file = config["output_file"]
        db_slug = config["db_slug"]

        # Write starting progress
        write_scraper_progress(store_slug, {
            "store_slug": store_slug,
            "status": "running",
            "products_scraped": 0,
            "processed_count": 0,
            "total_count": 1,
            "current_keyword": "Starting...",
            "percentage": 0,
            "updated_at": datetime.now(UTC).isoformat()
        })

        log.info(f"▶ Starting: {store_slug} (Running: python {script} {' '.join(args)})")
        
        status = "failed"
        error_msg = ""
        products_count = 0

        # Execute as a subprocess
        try:
            # We run python executable matching the system
            process = await asyncio.create_subprocess_exec(
                sys.executable,
                script,
                *args,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            exit_code = process.returncode

            duration = round(time.time() - start_time, 1)

            if exit_code == 0:
                # Scraper ran successfully, now verify its output file
                out_path = Path("output") / output_file
                if out_path.exists():
                    try:
                        # Inspect the output file to get product count
                        data = json.loads(out_path.read_text(encoding="utf-8"))
                        products_count = len(data.get("products", []))
                        status = "success" if products_count > 0 else "empty"
                        log.info(f"✔ Success: {store_slug} — Scraped {products_count} products in {duration}s")
                    except Exception as e:
                        error_msg = f"Failed to parse output JSON: {e}"
                        status = "failed"
                        log.error(f"✗ Error: {store_slug} — Invalid JSON output: {e}")
                else:
                    error_msg = f"Output file {output_file} not found."
                    status = "failed"
                    log.error(f"✗ Error: {store_slug} — Scraper completed but output file is missing")
            else:
                error_msg = stderr.decode(errors="ignore").strip() or f"Exit code {exit_code}"
                status = "failed"
                log.error(f"✗ Error: {store_slug} failed in {duration}s. Log:\n{error_msg[:300]}")

        except Exception as e:
            duration = round(time.time() - start_time, 1)
            error_msg = str(e)
            status = "failed"
            log.error(f"✗ Crash: {store_slug} orchestrator execution crashed: {e}")

        # If success, load into database immediately (transaction-isolated per store)
        loaded_count = 0
        if status == "success":
            log.info(f"💾 Ingesting data for {store_slug} into Database...")
            try:
                out_path = Path("output") / output_file
                loaded_count = load_scraper_output(str(out_path), db_slug)
            except Exception as e:
                error_msg = f"Database ingestion failure: {e}"
                status = "failed"
                log.error(f"✗ Ingestion failure for {store_slug}: {e}")

        # Clean up progress file
        delete_scraper_progress(store_slug)

        return {
            "store_slug": store_slug,
            "status": status,
            "products_scraped": products_count,
            "products_loaded": loaded_count,
            "duration_seconds": duration,
            "error": error_msg,
            "completed_at": datetime.now(UTC).isoformat()
        }


async def main_async():
    parser = argparse.ArgumentParser(description="Dawarly Scraper Orchestrator")
    parser.add_argument("--store", nargs="+", help="Specific store slug(s) to run")
    parser.add_argument("--concurrency", type=int, default=3, help="Max parallel scrapers to run")
    parser.add_argument("--no-cleanup", action="store_true", help="Do not delete raw scraper JSON output files")

    args = parser.parse_args()

    # Determine which stores to run
    stores_to_run = args.store
    if not stores_to_run:
        stores_to_run = get_all_store_slugs()

    # Verify stores exist in registry
    valid_stores = []
    for s in stores_to_run:
        try:
            get_scraper_config(s)
            valid_stores.append(s)
        except ValueError as e:
            log.error(e)

    if not valid_stores:
        log.error("No valid stores to run. Exiting.")
        sys.exit(1)

    log.info("=" * 60)
    log.info(f"Starting Scraper Sync (Concurrency Limit: {args.concurrency})")
    log.info(f"Stores to process: {', '.join(valid_stores)}")
    log.info("=" * 60)

    start_time = time.time()
    semaphore = asyncio.Semaphore(args.concurrency)
    
    # Run scrapers concurrently using the semaphore
    tasks = [
        run_single_scraper(store, get_scraper_config(store), semaphore)
        for store in valid_stores
    ]
    
    results = await asyncio.gather(*tasks)

    # Compile report
    end_time = time.time()
    total_duration = round(end_time - start_time, 1)

    # Load existing report to preserve history of unmodified stores
    report_data = {}
    if REPORT_PATH.exists():
        try:
            report_data = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass

    # Update reports
    store_statuses = report_data.get("stores", {})
    success_count = 0
    fail_count = 0
    total_scraped = 0
    total_loaded = 0

    for res in results:
        slug = res["store_slug"]
        store_statuses[slug] = res
        if res["status"] == "success":
            success_count += 1
            total_scraped += res["products_scraped"]
            total_loaded += res["products_loaded"]
        else:
            fail_count += 1

    # Keep track of global stats
    report_data.update({
        "last_sync_completed": datetime.now(UTC).isoformat(),
        "total_duration_seconds": total_duration,
        "scrapers_run_count": len(results),
        "success_count": success_count,
        "failure_count": fail_count,
        "total_products_scraped": total_scraped,
        "total_products_loaded": total_loaded,
        "stores": store_statuses
    })

    # Write report
    REPORT_PATH.parent.mkdir(exist_ok=True)
    REPORT_PATH.write_text(json.dumps(report_data, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info(f"✔ Sync Report written to {REPORT_PATH}")

    # ── Cleanup ──
    if not args.no_cleanup:
        log.info("🧹 Cleaning up raw scraper JSON files...")
        for res in results:
            if res["status"] == "success":
                cfg = get_scraper_config(res["store_slug"])
                file_path = Path("output") / cfg["output_file"]
                if file_path.exists():
                    file_path.unlink()
        
        # Cleanup miscellaneous category files
        for pattern in ["category_*.json", "elbadr_cat_*.json", "maximum_cat_*.json", "compumarts_cat_*.json"]:
            for f in Path("output").glob(pattern):
                try:
                    f.unlink()
                except Exception:
                    pass

    log.info("=" * 60)
    log.info(f"Sync Completed. Successful: {success_count}/{len(results)} | Duration: {total_duration}s")
    log.info("=" * 60)

    # Trigger product variant mapping and normalization pipeline
    log.info("🔄 Running product variants merge pipeline (merge_products_v2.py)...")
    try:
        process_merge_pipeline()
        log.info("✔ Product variants merge pipeline completed successfully!")
    except Exception as e:
        log.error(f"✗ Product variants merge pipeline failed: {e}")


if __name__ == "__main__":
    # Fix event loop policy on Windows to avoid 'Event loop is closed' warnings
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    asyncio.run(main_async())

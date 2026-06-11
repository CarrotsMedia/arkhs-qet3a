"""
Scraper Registry
================
Central mapping of store slugs to their scraper modules and output configurations.
Used by sync_all.py to orchestrate scraper runs.
"""

import sys
from pathlib import Path

# All scraper entries: store_slug → config
# Each entry defines:
#   - script: path to the scraper Python file (relative to project root)
#   - output_file: expected JSON output filename in output/
#   - args: CLI arguments to pass to the scraper script
#   - db_slug: store slug to use when loading into DB (usually same as key)
#   - parallel_group: scrapers in the same group run sequentially to avoid
#                     overwhelming the same site. Different groups run in parallel.

SCRAPER_REGISTRY = {
    # ── Group 1: API-based scrapers (fast, low risk) ──
    "sigma": {
        "script": "scrapers/scraper.py",
        "output_file": "sigma_all_products.json",
        "args": ["--all"],
        "db_slug": "sigma",
        "parallel_group": 1,
    },
    "badr-group": {
        "script": "scrapers/elbadr_scraper.py",
        "output_file": "elbadr_all_products.json",
        "args": ["--all"],
        "db_slug": "badr-group",
        "parallel_group": 1,
    },
    "compumarts": {
        "script": "scrapers/compumarts_scraper.py",
        "output_file": "compumarts_all_products.json",
        "args": ["--all"],
        "db_slug": "compumarts",
        "parallel_group": 1,
    },
    "maximum-hardware": {
        "script": "scrapers/maximum_scraper.py",
        "output_file": "maximum_all_products.json",
        "args": ["--all"],
        "db_slug": "maximum-hardware",
        "parallel_group": 1,
    },

    # ── Group 2: Egyptian e-commerce (Playwright, moderate risk) ──
    "noon": {
        "script": "scrapers/noon_scraper.py",
        "output_file": "noon_all_products.json",
        "args": ["--all"],
        "db_slug": "noon",
        "parallel_group": 2,
    },
    "jumia": {
        "script": "scrapers/jumia_scraper.py",
        "output_file": "jumia_all_products.json",
        "args": ["--all"],
        "db_slug": "jumia",
        "parallel_group": 2,
    },
    "btech": {
        "script": "scrapers/btech_scraper.py",
        "output_file": "btech_all_products.json",
        "args": ["--all"],
        "db_slug": "btech",
        "parallel_group": 2,
    },

    # ── Group 3: Phone/electronics stores (Playwright) ──
    "2b": {
        "script": "scrapers/twob_scraper.py",
        "output_file": "twob_all_products.json",
        "args": ["--all"],
        "db_slug": "2b",
        "parallel_group": 3,
    },
    "dream2000": {
        "script": "scrapers/dream2000_scraper.py",
        "output_file": "dream2000_all_products.json",
        "args": ["--all"],
        "db_slug": "dream2000",
        "parallel_group": 3,
    },
    "dubaiphone": {
        "script": "scrapers/dubaiphone_scraper.py",
        "output_file": "dubaiphone_all_products.json",
        "args": ["--all"],
        "db_slug": "dubaiphone",
        "parallel_group": 3,
    },
    "alsheikhstores": {
        "script": "scrapers/alsheikh_scraper.py",
        "output_file": "alsheikh_all_products.json",
        "args": ["--all"],
        "db_slug": "alsheikhstores",
        "parallel_group": 3,
    },
    "rayashop": {
        "script": "scrapers/raya_scraper.py",
        "output_file": "raya_all_products.json",
        "args": ["--all"],
        "db_slug": "rayashop",
        "parallel_group": 3,
    },

    # ── Group 4: Amazon (high anti-bot risk, always alone) ──
    "amazon": {
        "script": "scrapers/amazon_scraper.py",
        "output_file": "amazon_all_products.json",
        "args": ["--all"],
        "db_slug": "amazon",
        "parallel_group": 4,
    },
}


def get_scraper_config(store_slug: str) -> dict:
    """Get configuration for a specific store scraper."""
    config = SCRAPER_REGISTRY.get(store_slug)
    if not config:
        raise ValueError(f"Unknown store: '{store_slug}'. Available: {', '.join(SCRAPER_REGISTRY.keys())}")
    return config


def get_all_store_slugs() -> list[str]:
    """Return all registered store slugs."""
    return list(SCRAPER_REGISTRY.keys())


def get_groups() -> dict[int, list[str]]:
    """Group scrapers by parallel_group for batched execution."""
    groups: dict[int, list[str]] = {}
    for slug, config in SCRAPER_REGISTRY.items():
        group = config["parallel_group"]
        if group not in groups:
            groups[group] = []
        groups[group].append(slug)
    return dict(sorted(groups.items()))

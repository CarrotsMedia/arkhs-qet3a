# ⚡ Dawarly (دورلي) — Egypt's Price Comparison Engine

> **Compare prices across 13+ Egyptian stores — find the best deals on phones, laptops, electronics, and more.**

Dawarly is a modern, production-ready, full-stack price comparison platform. The architecture is split into a user-facing **Next.js (App Router)** customer storefront and a **Node.js/Express** backend API that powers administrative control, event-driven telemetry, and automated Python-based web crawlers.

---

## 📑 Table of Contents

- [Architecture & Tech Stack](#-architecture--tech-stack)
- [Project Structure](#-project-structure)
- [Database Architecture](#-database-architecture)
- [Environment Variables](#-environment-variables)
- [Getting Started](#-getting-started)
  - [1. Backend Setup](#1-backend-setup)
  - [2. Scraper Data Populate](#2-scraper-data-populate)
  - [3. Frontend Setup](#3-frontend-setup)
- [Development Workflow](#-development-workflow)
- [Production & Build Instructions](#-production--build-instructions)
  - [Manual Production Build](#manual-production-build)
  - [Docker Deployment](#docker-deployment)
- [Daily Sync (Cron)](#-daily-sync-cron)
- [Core Features](#-core-features)

---

## 🛠 Architecture & Tech Stack

### Customer Storefront (Frontend)
- **Framework:** Next.js 16 (App Router) + React 19
- **Architecture:** Server-Side Rendering (SSR) and React Server Components (RSC) to maximize SEO indexability.
- **Styling:** Tailwind CSS v4 + Lucide Icons.
- **Bilingual Interface:** Dual English/Arabic layouts with persistent local storage state and automated RTL (`dir="rtl"`) text wrapping.

### REST API & Administration (Backend)
- **Runtime:** Node.js 20 + Express.js.
- **Database:** PostgreSQL 15 (hosted via Docker Compose) with native Full Text Search (FTS) and GIN indexes.
- **Background Job Queue:** Asynchronous PostgreSQL-backed queue worker daemon to handle processor-intensive scrapers and ranking runs.
- **Telemetry System:** Decoupled event broker with structured schema validation (capturing product clicks, view telemetry, and search metrics).
- **Feature Flags:** Targeting rules engine to toggle feature versions based on headers or client IP.
- **Admin Console SPA:** A clean vanilla HTML/CSS/JS single-page application served statically from `/admin/`.

### Web Scrapers (Python)
- **Engine:** Playwright (headless Chromium) for dynamic SPA crawling.
- **Parsing:** BeautifulSoup4 + lxml.
- **Concurrency:** Asyncio and aiofiles for optimized async store requests.

---

## 📁 Project Structure

```
store/
├── server.js                  # Express API server (main backend entry point)
├── db_schema.py               # SQLite database setup, schema definitions, and loader
├── database.db                # Active SQLite database (Git-ignored)
├── package.json               # Backend Node.js dependencies
├── requirements.txt           # Python dependency manifest
├── Dockerfile                 # Multi-stage production Docker build
├── .gitignore                 # Standard repository ignores (.next/, node_modules/, dist/, etc.)
│
├── backups/                   # Database backup snapshots (Git-ignored)
├── config/
│   └── categories.json        # Global category hierarchy definitions
│
├── middleware/                # Security, audit logging, and telemetry filters
│   ├── adminAuth.js           # Session parser and CSRF guards
│   ├── auditLogger.js         # Audit logging for administrative actions
│   └── rateLimiter.js         # API rate limiting
│
├── routes/                    # API Route endpoints
│   ├── authRoutes.js          # /login, /logout, /me, /change-password
│   ├── adminAnalyticsRoutes.js # Telemetry views and latency trackers
│   ├── adminCategoryRoutes.js # Category/subcategory CRUD
│   ├── adminConfigRoutes.js   # Feature flags and formula weight controllers
│   ├── adminDbRoutes.js       # Backups management and DB cleaning
│   ├── adminProductRoutes.js  # Variant specs and manual rank overrides
│   └── adminStoreRoutes.js    # Store configurations and scraper run triggers
│
├── services/                  # Business & Infrastructure service layer
│   ├── cacheService.js        # TTL cache manager
│   ├── eventSystem.js         # analytical events dispatcher
│   ├── featureFlagService.js  # Runtime feature flag evaluator
│   ├── productService.js      # Search, browse, and details queries
│   ├── queueService.js        # SQLite-backed job queue manager
│   └── rankingService.js      # Smart Rank calculation
│
├── workers/                   # Background processors
│   └── worker.js              # Background queue polling worker daemon
│
├── public/                    # Production static folder
│   └── admin/                 # Admin SPA Dashboard console files
│
├── frontend/                  # Next.js App Router project (customer storefront)
│   ├── src/app/               # Pages, layouts, loading skeletons, and SEO routes
│   ├── src/components/        # Reusable React components (Header, Footer, ProductCard)
│   ├── next.config.mjs        # Next.js configurations
│   └── package.json           # Frontend dependency manifest
```

---

## 🔑 Environment Variables

### Backend Configuration (Root `.env` / Process Env)
| Name | Type | Default | Description |
|---|---|---|---|
| `PORT` | number | `3000` | Port for the Express backend server |
| `DATABASE_URL` | string | `postgres://arkhsly_admin:arkhsly_secure_pass@localhost:5432/arkhsly_db` | Connection string for PostgreSQL |

### Frontend Configuration (`frontend/.env.local`)
| Name | Type | Default | Description |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | string | `http://localhost:3000` | URL of the Express backend API server |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** v20+
- **Python** v3.10+
- **Docker & Docker Compose** (for PostgreSQL database container)

---

### 1. Backend Setup

From the root directory, install dependencies, spin up the database container, and perform migration:

```bash
# Install Node dependencies
npm install

# Set up Python virtual environment
python -m venv venv
venv\Scripts\activate      # On Windows
# source venv/bin/activate # On macOS/Linux

# Install Python crawler dependencies
pip install -r requirements.txt
python -m playwright install chromium

# Start PostgreSQL database service in background
docker-compose up -d

# Migrate SQLite database schema, constraints, data, and views to PostgreSQL
python scripts/migrate_sqlite_to_postgres.py

# Seed categories if database is clean (not required if migrated)
# cd scripts
# python seed_categories.py
# cd ..
```

---

### 2. Scraper Data Populate

Populate the database by running the web scrapers. This fetches product information from major online retailers:

```bash
# Run all scrapers (PC parts & marketplace items)
python sync_all.py

# Run only mobile store scrapers
python sync_mobiles.py

# (Optional) Run the smart merging script to deduplicate variants
python scripts/merge_products_v2.py
```

---

### 3. Frontend Setup

Move into the `frontend/` directory and install packages:

```bash
cd frontend
npm install
cd ..
```

---

## 💻 Development Workflow

Start the entire application (backend API + Next.js storefront) with a single command:

```bash
node server.js
```

This automatically launches:
- **Express API** server at `http://localhost:3000`
- **Next.js storefront** dev server at `http://localhost:3001` (spawned as a child process)
- **Admin SPA Dashboard** at `http://localhost:3000/admin/`

> **Note:** The Next.js frontend is auto-detected from the `frontend/` directory. If it's missing, only the backend starts.

**Trigger Background Jobs:** Log in to the Admin Dashboard (`http://localhost:3000/admin/`) to run crawlers, manage database backups, adjust feature flags, or recalculate smart ranks.

---

## 📦 Production & Build Instructions

### Manual Production Build

To build and compile the storefront for a production release:

```bash
# Build the Next.js application
cd frontend
npm run build
```

This compiles static routes, runs TypeScript validation checks, and optimizes asset compression.

To run the Next.js storefront in production:
```bash
npm run start # Runs on port 3000 by default (or set PORT env variable)
```

---

### Docker Deployment

The project contains a unified `Dockerfile` to build and deploy both the Node.js API and the Python crawler workers inside a single containerized runtime:

```bash
# Build the Docker image
docker build -t dawarly .

# Run the container
docker run -d -p 3000:3000 --name dawarly-instance dawarly
```

The Docker container runs database migrations, boots the Express API, and schedules background worker ticks.

---

## ⏰ Daily Sync (Cron)

The Express backend automatically manages a background synchronization queue via `node-cron`:
- **Scraper Crawls:** Automatically enqueued at **3:00 AM** daily.
- **Smart Rank Swaps:** Recalculates metrics and updates discovery cache every **6 hours** automatically.

You can inspect job execution states and durations live inside the Admin Console Queue page.

---

## ✨ Core Features

1. **Smart Product Merging:** Links similar models across stores (e.g. comparing iPhone 15 specs between Amazon and Noon) using model-key NLP matches.
2. **Dynamic Faceting:** Calculates attributes (e.g. RAM, Storage, Screen Size) dynamically per subcategory based on product variants.
3. **Structured Telemetry Logs:** Fully captures clicks, views, and search trends in compliance with Express response tracking.
4. **Structured Errors:** Decoupled errors system (`DatabaseError`, `ValidationError`) protecting the code tracing boundaries in production.

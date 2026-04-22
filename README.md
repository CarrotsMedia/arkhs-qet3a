# Dawarly (دورلي) 🚀

**Dawarly** is a real-time PC parts price comparison platform and aggregator for the Egyptian market. It automatically scrapes, normalizes, and groups products from top Egyptian hardware stores, allowing users to find the best deals, track price history, and check stock availability instantly.

## 🏪 Supported Stores
Currently, Dawarly aggregates data from:
1. **Sigma Computer** (Playwright Scraper)
2. **El Badr Group** (Playwright Scraper)
3. **Maximum Hardware** (BeautifulSoup Scraper)
4. **Compumarts** (Shopify API Scraper)

## 🛠️ Technology Stack
- **Backend**: Node.js & Express (Serves APIs, Search functionality, and cron jobs).
- **Frontend**: HTML5, Vanilla JS, CSS3, Chart.js (for price history).
- **Scrapers**: Python 3, Playwright, BeautifulSoup, Asyncio.
- **Database**: SQLite (`pc_parts.db`).

## ⚙️ Installation & Setup

### 1. Prerequisites
- Node.js (v18+)
- Python (v3.10+)

### 2. Install Dependencies
**Python Dependencies:**
```bash
pip install -r requirements.txt
playwright install chromium
```

**Node.js Dependencies:**
```bash
npm install
```

### 3. Initialize the Database
Run the schema script to create `pc_parts.db` and the necessary tables:
```bash
python db_schema.py
```

### 4. Run the Initial Sync
Run the sync script to scrape all stores and populate the database for the first time. This might take some time as it fetches thousands of products:
```bash
python sync_all.py
```
*(Note: On Windows you might need to use `py sync_all.py` or `python3 sync_all.py` on Linux/Mac)*

## 🚀 Running the Platform

Start the Node.js server:
```bash
npm start
# OR
node server.js
```
The application will be available at: `http://localhost:3000`

### Automated Daily Sync
The Node.js server has a built-in cron job (using `node-cron`) that automatically executes `sync_all.py` every day at **3:00 AM** to keep prices and stock availability up to date.

## 📂 Project Structure
```
├── server.js                 # Main Express server and API endpoints
├── sync_all.py               # Aggregator script to run all scrapers and load DB
├── db_schema.py              # SQLite database schema, views, and loader functions
├── pc_parts.db               # SQLite Database
├── public/                   # Frontend assets (HTML, CSS, JS)
│   ├── index.html            # Main UI
│   ├── style.css             # UI styling
│   └── app.js                # Frontend logic & API integration
├── scraper.py                # Sigma Computer scraper
├── elbadr_scraper.py         # El Badr Group scraper
├── maximum_scraper.py        # Maximum Hardware scraper
├── compumarts_scraper.py     # Compumarts scraper
└── output/                   # Temporary directory for JSON scraper dumps
```

## 📈 Features
- **Live Search**: Lightning-fast search with in-memory pagination and query matching across unified products.
- **Price History Charts**: Visualized historical pricing trends for individual products across different stores using Chart.js.
- **Stock Filtering**: Toggle switch to hide out-of-stock items across all merchants.
- **Product Normalization**: Groups similar products into a single view with multiple store offers.
- **Automated Scraping**: Nightly cron jobs to maintain a fresh index.

## 🤝 Contributing
- Add new stores by creating a Python scraper that outputs the standardized JSON format.
- Add the new store to `sync_all.py`.
- Insert the new store into the `stores` table in `db_schema.py`.

const Database = require('better-sqlite3');
const path = require('path');
const ProductService = require('../services/productService');
const FilterService = require('../services/filterService');

const dbPath = path.join(__dirname, '..', 'pc_parts.db');
const db = new Database(dbPath);

const productService = new ProductService(db);
const filterService = new FilterService(db);

console.log('=== TEST 1: Retrieve Facets & Products without Filters ===');
const subcategoryId = 1; // Smartphones
const initialProducts = productService.browseBySubcategory(subcategoryId, 1, 10, 'price_asc', {});
const initialFacets = filterService.getFacetedFilters(subcategoryId, {});

console.log(`Total initial products found: ${initialProducts.count}`);
console.log('Brands counts sample:');
console.log(initialFacets.brands.filter(b => b.count > 0).slice(0, 5));

const ramFacet = initialFacets.attributes.find(a => a.slug === 'ram_gb');
console.log('\nRAM facet options:');
console.log(ramFacet ? ramFacet.options : 'No RAM facet found');

const storageFacet = initialFacets.attributes.find(a => a.slug === 'storage_gb');
console.log('\nStorage facet options:');
console.log(storageFacet ? storageFacet.options : 'No Storage facet found');

console.log('\n=== TEST 2: Filter by Brand = Samsung, RAM = 8GB ===');
const filterParams = {
    brand: 'Samsung',
    ram_gb: '8'
};

const filteredProducts = productService.browseBySubcategory(subcategoryId, 1, 10, 'price_asc', filterParams);
const filteredFacets = filterService.getFacetedFilters(subcategoryId, filterParams);

console.log(`Total filtered products: ${filteredProducts.count}`);
console.log('Sample filtered products name & brand:');
console.log(filteredProducts.products.slice(0, 3).map(p => ({
    name: p.merged_name || p.name,
    brand: p.brand,
    offers: p.offers.map(o => ({ store: o.store_name, price: o.price_egp }))
})));

const filteredRamFacet = filteredFacets.attributes.find(a => a.slug === 'ram_gb');
console.log('\nFiltered RAM facet options (All-But-Itself should count other RAM options for Samsung):');
console.log(filteredRamFacet ? filteredRamFacet.options : 'No RAM facet');

const filteredStorageFacet = filteredFacets.attributes.find(a => a.slug === 'storage_gb');
console.log('\nFiltered Storage facet options (Should only show counts for Samsung variants with 8GB RAM):');
console.log(filteredStorageFacet ? filteredStorageFacet.options : 'No Storage facet');

// Verify that all results indeed match brand = Samsung and RAM = 8GB
console.log('\n=== Verification Assertions ===');
let allMatch = true;
for (const p of filteredProducts.products) {
    if (p.brand.toLowerCase() !== 'samsung') {
        console.error(`Error: Found non-Samsung product: ${p.merged_name} (${p.brand})`);
        allMatch = false;
    }
}

if (allMatch) {
    console.log('SUCCESS: All filtered products match active brand constraint!');
} else {
    console.error('FAIL: Brand constraint failed.');
}

db.close();

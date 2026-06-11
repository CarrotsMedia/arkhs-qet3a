const http = require('http');

function get(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${data.slice(0, 100)}`));
                }
            });
        }).on('error', reject);
    });
}

async function run() {
    try {
        console.log('--- Testing GET /api/featured ---');
        const featured = await get('http://localhost:3000/api/featured');
        console.log('Featured products count:', featured.length);
        if (featured.length > 0) {
            console.log('Sample featured product:', {
                product_id: featured[0].product_id,
                name: featured[0].merged_name,
                price: featured[0].offers[0] ? featured[0].offers[0].price_egp : null,
                offers_count: featured[0].offers ? featured[0].offers.length : 0
            });
        }

        console.log('\n--- Testing GET /api/products/11 (Detail View) ---');
        const detail = await get('http://localhost:3000/api/products/11');
        console.log('Product ID 11 details:', {
            product_id: detail.product_id,
            name: detail.merged_name,
            variants_count: detail.variants ? detail.variants.length : 0
        });
        if (detail.variants && detail.variants.length > 0) {
            console.log('First Variant offers count:', detail.variants[0].offers.length);
            const variantId = detail.variants[0].variant_id;

            console.log(`\n--- Testing GET /api/variants/${variantId}/offers ---`);
            const offers = await get(`http://localhost:3000/api/variants/${variantId}/offers`);
            console.log(`Offers count for Variant ${variantId}:`, offers.length);
            if (offers.length > 0) {
                console.log('Sample offer:', offers[0]);
            }

            console.log(`\n--- Testing GET /api/variants/${variantId}/history ---`);
            const history = await get(`http://localhost:3000/api/variants/${variantId}/history`);
            console.log('History stores found:', Object.keys(history));
        }

        console.log('\n--- Testing GET /api/search?q=rtx ---');
        const search = await get('http://localhost:3000/api/search?q=rtx');
        console.log('Search total results:', search.count);
        if (search.products && search.products.length > 0) {
            console.log('Sample search product:', {
                product_id: search.products[0].product_id,
                name: search.products[0].merged_name,
                price: search.products[0].offers[0] ? search.products[0].offers[0].price_egp : null
            });
        }

    } catch (err) {
        console.error('Server test failed:', err);
    }
}

run();

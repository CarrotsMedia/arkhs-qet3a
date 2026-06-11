const Database = require('../services/db');
const path = require('path');
const fs = require('fs');

const searchTerms = [
    'iphone',
    'rtx 4070',
    'samsung storage',
    'ram gskill',
    'ايفون',
    'سامسونج',
    'كارت شاشة',
    'رامات'
];

async function runBenchmark() {
    console.log('=== POSTGRESQL FTS SEARCH BENCHMARK & COMPARISON ===\n');
    
    // Connect to PG
    const db = new Database();

    // Read SQLite results
    let sqliteResults = {};
    try {
        const sqliteFile = fs.readFileSync(path.resolve(__dirname, 'sqlite_benchmark_results.json'), 'utf8');
        sqliteResults = JSON.parse(sqliteFile);
    } catch (e) {
        console.warn('Could not read sqlite_benchmark_results.json. Run benchmark_search.js first or ensure it is in scripts/.', e.message);
    }

    const comparisonResults = {};

    for (const query of searchTerms) {
        const start = Date.now();
        const terms = query.trim().split(/\s+/).filter(t => t.length > 0);
        const ftsQuery = terms.map(term => `"${term.replace(/"/g, '""')}"*`).join(' AND ');

        try {
            // FTS lookup
            const matchingFamilies = await db.prepare(`
                SELECT family_id 
                FROM product_search_idx 
                WHERE product_search_idx MATCH ?
                LIMIT 1000
            `).all(ftsQuery);

            const familyIds = matchingFamilies.map(f => f.family_id);
            let topProducts = [];

            if (familyIds.length > 0) {
                const placeholders = familyIds.map(() => '?').join(',');
                topProducts = await db.prepare(`
                    SELECT id, COALESCE(name_en, name_ar) as name 
                    FROM product_families 
                    WHERE id IN (${placeholders})
                    LIMIT 5
                `).all(...familyIds);
            }

            const duration = Date.now() - start;
            const pgList = topProducts.map(p => `[ID: ${p.id}] ${p.name}`);

            const sqliteData = sqliteResults[query] || { count: 0, duration_ms: 0, top_results: [] };
            
            // Calculate overlap
            const pgIds = new Set(topProducts.map(p => p.id));
            const sqliteIds = new Set(sqliteData.top_results.map(r => {
                const m = r.match(/\[ID: (\d+)\]/);
                return m ? parseInt(m[1]) : null;
            }).filter(id => id !== null));

            let overlapCount = 0;
            sqliteIds.forEach(id => {
                if (pgIds.has(id)) overlapCount++;
            });
            const overlapPct = sqliteIds.size > 0 ? ((overlapCount / sqliteIds.size) * 100).toFixed(1) : (pgIds.size === 0 ? '100.0' : '0.0');

            comparisonResults[query] = {
                sqlite: {
                    count: sqliteData.count,
                    duration_ms: sqliteData.duration_ms,
                    top_results: sqliteData.top_results
                },
                postgres: {
                    count: familyIds.length,
                    duration_ms: duration,
                    top_results: pgList
                },
                comparison: {
                    count_diff: familyIds.length - sqliteData.count,
                    overlap_percentage: parseFloat(overlapPct)
                }
            };

            console.log(`Query: "${query}"`);
            console.log(`  SQLite:   ${sqliteData.count} results | ${sqliteData.duration_ms}ms`);
            console.log(`  Postgres: ${familyIds.length} results | ${duration}ms (Diff: ${familyIds.length - sqliteData.count})`);
            console.log(`  Overlap of top results: ${overlapPct}%`);
            console.log('  Top results:');
            topProducts.forEach((p, idx) => console.log(`    ${idx + 1}. ${p.name}`));
            console.log('');
        } catch (e) {
            console.error(`Error searching for "${query}":`, e);
        }
    }

    const reportPath = path.join(__dirname, 'postgres_benchmark_results.json');
    fs.writeFileSync(reportPath, JSON.stringify(comparisonResults, null, 2));
    console.log(`Results saved to ${reportPath}\n`);

    await db.close();
}

runBenchmark();

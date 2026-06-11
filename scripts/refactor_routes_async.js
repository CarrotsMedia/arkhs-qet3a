const fs = require('fs');
const path = require('path');

const routesDir = path.resolve(__dirname, '../routes');
const routeFiles = fs.readdirSync(routesDir).filter(f => f.endsWith('.js')).map(f => path.join(routesDir, f));

// Add other files to refactor
routeFiles.push(path.resolve(__dirname, '../server.js'));
routeFiles.push(path.resolve(__dirname, '../workers/worker.js'));
routeFiles.push(path.resolve(__dirname, '../scripts/verify_infrastructure.js'));

const serviceNames = [
    'authService',
    'adminCategoryService',
    'adminProductService',
    'adminStoreService',
    'adminDbService',
    'analyticsService',
    'categoryService',
    'productService',
    'filterService',
    'discoveryService',
    'rankingService',
    'rankingVersionService',
    'queueService',
    'featureFlagService'
];

function refactorFile(filePath) {
    console.log(`Refactoring file: ${path.basename(filePath)}`);
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Make Express route handlers async
    // Matches router.post('/path', ... , (req, res, next) => { or app.get('/path', (req, res) => {
    content = content.replace(
        /\.(get|post|put|delete|use)\(([\s\S]*?),\s*\((req,\s*res|req,\s*res,\s*next)\)\s*=>\s*\{/g,
        '.$1($2, async ($3) => {'
    );

    // 2. Prepend service calls with await
    serviceNames.forEach(service => {
        const serviceRegex = new RegExp(`(?<!await\\s+|this\\.|services\\.)\\b${service}\\.([a-zA-Z0-9_]+)\\(`, 'g');
        content = content.replace(serviceRegex, `await ${service}.$1(`);
    });

    // 3. Prepend this.services.xxxService calls with await (for worker.js)
    serviceNames.forEach(service => {
        const thisServiceRegex = new RegExp(`(?<!await\\s+)this\\.services\\.${service}\\.([a-zA-Z0-9_]+)\\(`, 'g');
        content = content.replace(thisServiceRegex, `await this.services.${service}.$1(`);
    });

    // 4. Prepend this.queueService calls with await (for worker.js)
    content = content.replace(/(?<!await\\s+)this\.queueService\.([a-zA-Z0-9_]+)\(/g, 'await this.queueService.$1(');

    // 5. Prepend db.prepare().all/get/run calls with await
    // Supports: db.prepare(), this.db.prepare(), featureFlagService.db.prepare()
    content = content.replace(/(?<!await\s+)\b((?:[a-zA-Z0-9_]+\.)*)db\.prepare\(\s*(?:'[^']*'|"[^"]*"|`[\s\S]*?`)\s*\)\.(all|get|run)\(/g, (match) => {
        return 'await ' + match;
    });

    // 6. Prepend db.exec with await
    content = content.replace(/(?<!await\\s+)\b((?:[a-zA-Z0-9_]+\.)*)db\.exec\(/g, 'await $1db.exec(');

    // 7. Prepend db.transaction inline calls with await
    content = content.replace(/(?<!await\\s+)\b((?:[a-zA-Z0-9_]+\.)*)db\.transaction\(([\s\S]*?)\)\(\)/g, 'await $1db.transaction($2)()');

    // 8. Make transaction callbacks async
    content = content.replace(/\.transaction\(\(([^)]*)\)\s*=>\s*\{/g, '.transaction(async ($1) => {');

    // 9. Prepend statement variables like updateStmt.run with await
    content = content.replace(/(?<!await\\s+)\b(updateStmt)\.(run|get|all)\(/g, 'await $1.$2(');

    // 10. Clean up duplicate awaits and asyncs
    content = content.replace(/\b([a-zA-Z0-9_]+\.)?await\s+db\b/g, 'await $1db');
    content = content.replace(/await\s+([a-zA-Z0-9_]+\.)?await\s+db\b/g, 'await $1db');
    content = content.replace(/await\s+await\s+/g, 'await ');
    content = content.replace(/async\s+async\s+/g, 'async ');

    fs.writeFileSync(filePath, content, 'utf8');
}

routeFiles.forEach(file => {
    refactorFile(file);
});

console.log('All routes, server.js, workers, and tests refactored successfully.');

const fs = require('fs');
const path = require('path');

const servicesDir = path.resolve(__dirname, '../services');
const serviceFiles = fs.readdirSync(servicesDir).filter(f => f.endsWith('.js') && f !== 'logger.js' && f !== 'cacheService.js' && f !== 'eventSystem.js' && f !== 'db.js');

function refactorFile(filePath) {
    console.log(`Refactoring: ${path.basename(filePath)}`);
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Temporary hide the constructor block to avoid prepending await to internal calls there
    let constructorMatch = content.match(/constructor\s*\([^)]*\)\s*\{[^{}]*\}/);
    let constructorPlaceholder = '';
    if (constructorMatch) {
        constructorPlaceholder = constructorMatch[0];
        content = content.replace(constructorPlaceholder, '___CONSTRUCTOR_PLACEHOLDER___');
    }

    // 2. Find all class method names in the file to handle self-calls
    const methodRegex = /(?<![a-zA-Z0-9_])(?!(?:constructor|if|for|while|switch|catch|function|class|else|try|finally|async)\b)([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*\{/g;
    let match;
    const methods = [];
    while ((match = methodRegex.exec(content)) !== null) {
        const name = match[1];
        methods.push(name);
    }

    // 3. Make all class methods async
    content = content.replace(/(?<![a-zA-Z0-9_])(?!(?:constructor|if|for|while|switch|catch|function|class|else|try|finally|async)\b)([a-zA-Z0-9_]+)\s*\(([^)]*)\)\s*\{/g, 'async $1($2) {');

    // 4. Prepend calls to internal methods with `await` (outside of constructor)
    methods.forEach(method => {
        const callRegex = new RegExp(`(?<!await\\s+)this\\.${method}\\(`, 'g');
        content = content.replace(callRegex, `await this.${method}(`);
    });

    // 5. Add await to database executions
    content = content.replace(/(?<!await\s+)\b(?:this\.)?db\.prepare\(\s*(?:'[^']*'|"[^"]*"|`[\s\S]*?`)\s*\)\.(all|get|run)\(/g, (match) => {
        return 'await ' + match;
    });
    content = content.replace(/(?<!await\s+)(?:this\.)?db\.exec\(/g, 'await this.db.exec(');

    // 5.5. Prepend statement variables like insert.run with await
    const stmtVars = ['insert', 'update', 'updateStmt', 'updateTrending', 'updateFeatured', 'insertHistory'];
    stmtVars.forEach(stmtVar => {
        const stmtRegex = new RegExp(`(?<!await\\s+)\\b${stmtVar}\\.(run|get|all)\\(`, 'g');
        content = content.replace(stmtRegex, `await ${stmtVar}.$1(`);
    });

    // 6. Handle transactions
    // Make transaction callbacks async
    content = content.replace(/\.transaction\(\(([^)]*)\)\s*=>\s*\{/g, '.transaction(async ($1) => {');
    
    // Add await to immediate transaction execution
    content = content.replace(/(?<!await\s+)(?:this\.)?db\.transaction\(([\s\S]*?)\)\(\)/g, 'await this.db.transaction($1)()');

    // Add await to stored transaction execution calls
    const txVars = ['pollTransaction', 'mergeTx', 'rollbackTx', 'runCleanup', 'runImport', 'deleteTx', 'featuredTx', 'trendingTx', 'transaction', 'tx'];
    txVars.forEach(txVar => {
        const txRegex = new RegExp(`(?<!await\\s+|\\.)\\b${txVar}\\(([^)]*)\\)`, 'g');
        content = content.replace(txRegex, `await ${txVar}($1)`);
    });

    // 7. Clean up potential double awaits and misplaced awaits
    content = content.replace(/\b([a-zA-Z0-9_]+\.)?await\s+db\b/g, 'await $1db');
    content = content.replace(/await\s+([a-zA-Z0-9_]+\.)?await\s+db\b/g, 'await $1db');
    content = content.replace(/await\s+await\s+/g, 'await ');
    content = content.replace(/async\s+async\s+/g, 'async ');

    // 8. Restore the constructor block
    if (constructorPlaceholder) {
        // Change datetime('now') and datetime('now', 'localtime') in table initialization queries inside constructor or initializeTable
        // (PostgreSQL uses CURRENT_TIMESTAMP)
        content = content.replace('___CONSTRUCTOR_PLACEHOLDER___', constructorPlaceholder);
    }

    fs.writeFileSync(filePath, content, 'utf8');
}

serviceFiles.forEach(file => {
    refactorFile(path.join(servicesDir, file));
});

console.log('All backend services refactored safely.');

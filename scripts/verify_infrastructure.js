/**
 * System Infrastructure Verification Script
 * =========================================
 * Tests and verifies event dispatcher, background job queue, worker transactions,
 * ranking version rollbacks, cache management, and error taxonomy.
 */

const path = require('path');
const Database = require('../services/db');
const fs = require('fs');

const logger = require('../services/logger');
const EventSystem = require('../services/eventSystem');
const FeatureFlagService = require('../services/featureFlagService');
const RankingVersionService = require('../services/rankingVersionService');
const QueueService = require('../services/queueService');
const CacheService = require('../services/cacheService');
const BackgroundWorker = require('../workers/worker');
const RankingService = require('../services/rankingService');
const DiscoveryService = require('../services/discoveryService');
const { ValidationError, DatabaseError } = require('../utils/errors');

const dbPath = path.resolve(__dirname, '../database.db');

async function runVerification() {
    console.log('\n==================================================');
    console.log('🤖 STARTING DAWARLY INFRASTRUCTURE VERIFICATION');
    console.log('==================================================\n');

    let db;
    try {
        db = new Database(dbPath, { fileMustExist: true });
        console.log('✅ SQLite Connection: Success');
    } catch (e) {
        console.error('❌ Failed to connect to SQLite db:', e.message);
        process.exit(1);
    }

    const results = {
        eventSystem: false,
        featureFlags: false,
        rankingSwaps: false,
        jobQueue: false,
        errorTaxonomy: false
    };

    // ═══════════════════════════════════════════════════
    // 1. EVENT SYSTEM & SCHEMA VALIDATION
    // ═══════════════════════════════════════════════════
    console.log('\n[1/5] Testing Event System & Schema Validation...');
    try {
        const eventSystem = new EventSystem(logger);
        let eventReceived = null;

        // Register async listener
        eventSystem.on('PRODUCT_VIEWED', (event) => {
            eventReceived = event;
        });

        // Dispatch a valid event
        const actor = { ipHash: 'test-ip-hash', userAgent: 'test-ua' };
        eventSystem.dispatch('PRODUCT_VIEWED', actor, { familyId: 101 });

        // Wait a tick for nextTick emission
        await new Promise(resolve => process.nextTick(resolve));

        if (eventReceived && eventReceived.payload.familyId === 101 && eventReceived.actor.ipHash === 'test-ip-hash') {
            console.log('   ✅ Valid Event Dispatched & Received');
        } else {
            throw new Error('Event not received or mismatch');
        }

        // Dispatch an invalid event to test schema enforcement (should throw ValidationError)
        try {
            eventSystem.dispatch('PRODUCT_VIEWED', actor, {}); // missing familyId
            throw new Error('Should have failed schema validation');
        } catch (err) {
            if (err instanceof ValidationError) {
                console.log('   ✅ Schema validation successfully blocked invalid payload (ValidationError)');
            } else {
                throw err;
            }
        }

        results.eventSystem = true;
    } catch (err) {
        console.error('   ❌ Event System test failed:', err);
    }

    // ═══════════════════════════════════════════════════
    // 2. FEATURE FLAGS ENGINE
    // ═══════════════════════════════════════════════════
    console.log('\n[2/5] Testing Feature Flags Engine...');
    try {
        const featureFlagService = new FeatureFlagService(db);
        
        // Check default flag state
        const initialCompare = await featureFlagService.isEnabled('enable_compare_v2');
        console.log(`   Initial 'enable_compare_v2' state: ${initialCompare}`);

        // Set flag
        await featureFlagService.setFlag('enable_compare_v2', 0);
        const disabledCompare = await featureFlagService.isEnabled('enable_compare_v2');
        
        // Re-enable
        await featureFlagService.setFlag('enable_compare_v2', 1);
        const reenabledCompare = await featureFlagService.isEnabled('enable_compare_v2');

        if (disabledCompare === false && reenabledCompare === true) {
            console.log('   ✅ Feature flag toggle & persistence: Success');
        } else {
            throw new Error('Flag states did not match expectations');
        }

        // Test rule checking with mock request header overrides
        await featureFlagService.setFlag('enable_new_ranking', 0, { headerName: 'x-enable-beta', headerValue: 'true' });
        const reqWithoutHeader = { headers: {} };
        const reqWithHeader = { headers: { 'x-enable-beta': 'true' } };

        const resWithout = await featureFlagService.isEnabled('enable_new_ranking', reqWithoutHeader);
        const resWith = await featureFlagService.isEnabled('enable_new_ranking', reqWithHeader);

        if (resWithout === false && resWith === true) {
            console.log('   ✅ Request header routing rules parsed & matched successfully');
            results.featureFlags = true;
        } else {
            throw new Error('Rule matching failed');
        }
    } catch (err) {
        console.error('   ❌ Feature Flags test failed:', err);
    }

    // ═══════════════════════════════════════════════════
    // 3. RANKING WEIGHT SWAPPING & CALCULATIONS
    // ═══════════════════════════════════════════════════
    console.log('\n[3/5] Testing Ranking Version Swapping...');
    try {
        const rankingVersionService = new RankingVersionService(db);
        const rankingService = new RankingService(db, rankingVersionService);

        // Fetch active formula (should seed default baseline v1)
        const initialFormula = await rankingVersionService.getActiveFormula();
        console.log(`   Initial Active Formula: ${initialFormula.version_id} (${initialFormula.formula_name})`);

        // Swapping to experimental deals_heavy V2
        await rankingVersionService.setActiveFormula('v2');
        const updatedFormula = await rankingVersionService.getActiveFormula();
        console.log(`   Swapped Active Formula: ${updatedFormula.version_id} (${updatedFormula.formula_name})`);
        
        if (updatedFormula.version_id === 'v2' && updatedFormula.weights.discount === 0.40) {
            console.log('   ✅ Formula hot-swapping and active weights retrieved: Success');
        } else {
            throw new Error('Failed to update/retrieve active formula');
        }

        // Recalculate ranking scores under deals_heavy
        console.log('   Running ranking recalculation...');
        const recalcRes = await rankingService.recalculateRanks();
        console.log(`   Recalculation outcome: Success=${recalcRes.success}, Families=${recalcRes.count}, Duration=${recalcRes.duration_seconds}s`);

        if (recalcRes.success && recalcRes.count > 0) {
            console.log('   ✅ Calculation completed successfully with dynamic weights');
        } else {
            throw new Error('Recalculation failed or returned empty count');
        }

        // Revert active formula to baseline v1
        await rankingVersionService.setActiveFormula('v1');
        const revertedFormula = await rankingVersionService.getActiveFormula();
        console.log(`   Reverted back to: ${revertedFormula.version_id} (${revertedFormula.formula_name})`);

        if (revertedFormula.version_id === 'v1' && revertedFormula.weights.discount === 0.20) {
            console.log('   ✅ Rolled back to baseline formula successfully');
            results.rankingSwaps = true;
        } else {
            throw new Error('Failed to revert back to baseline weights');
        }
    } catch (err) {
        console.error('   ❌ Ranking Version Swaps test failed:', err);
    }

    // ═══════════════════════════════════════════════════
    // 4. TRANSACTION-SAFE JOB QUEUE & WORKERS
    // ═══════════════════════════════════════════════════
    console.log('\n[4/5] Testing Transaction-Safe Background Queue & Worker...');
    try {
        const queueService = new QueueService(db);
        const cacheService = new CacheService(logger);
        const discoveryService = new DiscoveryService(db);
        const rankingVersionService = new RankingVersionService(db);
        const rankingService = new RankingService(db, rankingVersionService);

        const worker = new BackgroundWorker(
            queueService,
            { rankingService, discoveryService, cacheService },
            logger
        );

        // Clear queue logs for testing
        await db.prepare('DELETE FROM job_queue').run();

        // Enqueue a background ranking recalculation job
        const job = await queueService.enqueue('recalculate_ranks');
        console.log(`   Enqueued job #${job.id} (${job.job_type}) - status: ${job.status}`);

        // Verify status in DB is pending
        const beforeTick = await db.prepare('SELECT status FROM job_queue WHERE id = ?').get(job.id);
        if (beforeTick.status !== 'pending') {
            throw new Error(`Expected pending status, got ${beforeTick.status}`);
        }

        // Tick the worker synchronously
        console.log('   Ticking worker loop...');
        await worker.tick();

        // Verify status is completed
        const afterTick = await db.prepare('SELECT status, duration_ms, error FROM job_queue WHERE id = ?').get(job.id);
        console.log(`   After worker execution status: ${afterTick.status}, duration: ${afterTick.duration_ms}ms`);

        if (afterTick.status === 'completed' && afterTick.duration_ms > 0) {
            console.log('   ✅ Queue Worker picked, processed, and marked job completed successfully');
            results.jobQueue = true;
        } else {
            throw new Error(`Job execution unsuccessful. Status: ${afterTick.status}, Error: ${afterTick.error}`);
        }

        // Clean up cache interval
        cacheService.close();
    } catch (err) {
        console.error('   ❌ Job Queue & Worker test failed:', err);
    }

    // ═══════════════════════════════════════════════════
    // 5. ERROR TAXONOMY
    // ═══════════════════════════════════════════════════
    console.log('\n[5/5] Testing Error Taxonomy Classification...');
    try {
        const error = new DatabaseError('SQLite transaction block aborted', { sql: 'INSERT INTO job_queue...', code: 'SQLITE_BUSY' });
        
        if (error.statusCode === 500 && error.code === 'DB_ERROR' && error.details.code === 'SQLITE_BUSY') {
            console.log('   ✅ DatabaseError inherits and maps correct taxonomies');
            results.errorTaxonomy = true;
        } else {
            throw new Error('Error structure mismatch');
        }
    } catch (err) {
        console.error('   ❌ Error Taxonomy test failed:', err);
    }

    // Close DB Connection
    db.close();

    // ═══════════════════════════════════════════════════
    // SUMMARY REPORT
    // ═══════════════════════════════════════════════════
    console.log('\n==================================================');
    console.log('📊 VERIFICATION SUMMARY');
    console.log('==================================================');
    console.log(`1. Event System & Validation:     ${results.eventSystem ? '🟢 PASS' : '🔴 FAIL'}`);
    console.log(`2. Feature Flags Override:        ${results.featureFlags ? '🟢 PASS' : '🔴 FAIL'}`);
    console.log(`3. Ranking Weight Rollbacks:      ${results.rankingSwaps ? '🟢 PASS' : '🔴 FAIL'}`);
    console.log(`4. Background Queue & Workers:    ${results.jobQueue ? '🟢 PASS' : '🔴 FAIL'}`);
    console.log(`5. Structured Error Taxonomy:     ${results.errorTaxonomy ? '🟢 PASS' : '🔴 FAIL'}`);
    console.log('==================================================\n');

    const allPassed = Object.values(results).every(v => v === true);
    if (allPassed) {
        console.log('🎉 ALL TELEMETRY AND ARCHITECTURE GOVERNANCE CHECKS PASSED SUCCESSFULLY!\n');
        process.exit(0);
    } else {
        console.error('⚠️ SOME TESTS ENCOUNTERED ANOMALIES AND FAILED.\n');
        process.exit(1);
    }
}

runVerification();

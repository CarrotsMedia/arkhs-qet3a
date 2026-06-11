/**
 * Background Queue Worker Runner
 * ==============================
 * Periodically polls the SQLite job queue and executes heavy tasks asynchronously.
 */

const { exec } = require('child_process');
const path = require('path');

class BackgroundWorker {
    constructor(queueService, services = {}, logger = null) {
        this.queueService = queueService;
        this.services = services; // category, product, discovery, ranking, etc.
        this.logger = logger;
        this.intervalId = null;
        this.isProcessing = false;
        this.pollIntervalMs = 3000; // Check every 3 seconds
    }

    /**
     * Start the worker loop
     */
    start() {
        if (this.intervalId) return;
        
        if (this.logger) {
            this.logger.info('Background worker started.');
        } else {
            console.log('Background worker started.');
        }

        this.intervalId = setInterval(() => this.tick(), this.pollIntervalMs);
    }

    /**
     * Stop the worker loop
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            if (this.logger) this.logger.info('Background worker stopped.');
        }
    }

    /**
     * Run a single polling cycle
     */
    async tick() {
        if (this.isProcessing) return; // Prevent concurrent executions on the same worker instance
        
        const job = await this.queueService.pollNextJob();
        if (!job) return;

        this.isProcessing = true;
        const startTime = Date.now();

        if (this.logger) {
            this.logger.info(`Starting job #${job.id} (${job.job_type})`);
        } else {
            console.log(`Starting job #${job.id} (${job.job_type})`);
        }

        try {
            await this.executeJob(job.job_type, job.payload);
            const durationMs = Date.now() - startTime;
            
            await this.queueService.completeJob(job.id, durationMs);
            
            if (this.logger) {
                this.logger.info(`Completed job #${job.id} (${job.job_type}) in ${durationMs}ms`);
            } else {
                console.log(`Completed job #${job.id} (${job.job_type}) in ${durationMs}ms`);
            }
        } catch (err) {
            const durationMs = Date.now() - startTime;
            const errorMsg = err.stack || err.message || String(err);
            
            await this.queueService.failJob(job.id, errorMsg, durationMs);

            if (this.logger) {
                this.logger.error(`Failed job #${job.id} (${job.job_type}) in ${durationMs}ms:`, err);
            } else {
                console.error(`Failed job #${job.id} (${job.job_type}) in ${durationMs}ms:`, err);
            }
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Map job type to corresponding handler
     */
    async executeJob(jobType, payload) {
        switch (jobType) {
            case 'recalculate_ranks':
                if (!this.services.rankingService) {
                    throw new Error('RankingService is not initialized on worker');
                }
                await this.services.rankingService.recalculateRanks();
                break;

            case 'rebuild_discovery_cache':
                if (!this.services.discoveryService) {
                    throw new Error('DiscoveryService is not initialized on worker');
                }
                await this.services.discoveryService.refreshDiscoveryCache();
                break;

            case 'run_scraper_sync':
            case 'run_scraper_single':
                await this.runScraperSync(payload);
                break;

            case 'aggregate_analytics':
                await this.runAnalyticsAggregation();
                break;

            case 'reclassify_products':
                await this.runReclassifyProducts();
                break;

            default:
                throw new Error(`Unsupported background job type: ${jobType}`);
        }
    }

    /**
     * Run reclassification and merge pipelines, clear cache, and enqueue next jobs
     */
    runReclassifyProducts() {
        return new Promise((resolve, reject) => {
            const reclassifyCmd = process.platform === 'win32' ? 'py scripts/reclassify.py' : 'python3 scripts/reclassify.py';
            const mergeCmd = process.platform === 'win32' ? 'py scripts/merge_products_v2.py' : 'python3 scripts/merge_products_v2.py';
            const projectRoot = path.resolve(__dirname, '..');

            if (this.logger) {
                this.logger.info(`Running child process: ${reclassifyCmd}`);
            }

            // Run reclassify
            exec(reclassifyCmd, { cwd: projectRoot }, (error, stdout, stderr) => {
                if (error) {
                    return reject(new Error(`Reclassification failed: ${error.message}. Stderr: ${stderr}`));
                }
                
                if (this.logger) {
                    this.logger.info(`Reclassification output: ${stdout}`);
                    this.logger.info(`Running child process: ${mergeCmd}`);
                }

                // Run merge products v2
                exec(mergeCmd, { cwd: projectRoot }, async (mergeError, mergeStdout, mergeStderr) => {
                    if (mergeError) {
                        return reject(new Error(`Product merging failed: ${mergeError.message}. Stderr: ${mergeStderr}`));
                    }

                    if (this.logger) {
                        this.logger.info(`Product merging output: ${mergeStdout}`);
                    }

                    // Clear the cache
                    if (this.services.cacheService) {
                        try {
                            this.services.cacheService.invalidatePattern('categories:');
                            this.services.cacheService.invalidatePattern('discovery:');
                            this.services.cacheService.clearAll();
                        } catch (cacheErr) {
                            if (this.logger) {
                                this.logger.error(`Error invalidating cache: ${cacheErr.message}`);
                            }
                        }
                    }

                    // Enqueue the ranks recalculation and discovery rebuild
                    try {
                        await this.queueService.enqueue('recalculate_ranks');
                        await this.queueService.enqueue('rebuild_discovery_cache');
                    } catch (queueErr) {
                        if (this.logger) {
                            this.logger.error(`Error enqueuing subsequent jobs: ${queueErr.message}`);
                        }
                    }

                    resolve(mergeStdout);
                });
            });
        });
    }

    /**
     * Trigger Python scraper sync in background child process
     */
    runScraperSync(payload) {
        return new Promise((resolve, reject) => {
            const syncCmd = process.platform === 'win32' ? 'py sync_all.py' : 'python3 sync_all.py';
            const projectRoot = path.resolve(__dirname, '..');
            
            let command = syncCmd;
            if (payload.store) {
                command += ` --store ${payload.store}`;
            }

            if (this.logger) {
                this.logger.info(`Running child process: ${command}`);
            }

            exec(command, { cwd: projectRoot }, async (error, stdout, stderr) => {
                if (error) {
                    return reject(new Error(`Sync execution failed: ${error.message}. Stderr: ${stderr}`));
                }

                // Update stores table columns from sync_report.json
                try {
                    const fs = require('fs');
                    const reportPath = path.join(projectRoot, 'output', 'sync_report.json');
                    if (fs.existsSync(reportPath)) {
                        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
                        if (report && report.stores) {
                            const db = this.queueService.db;
                            const updateStmt = await db.prepare(`
                                UPDATE stores
                                SET last_scrape_at = ?,
                                    last_scrape_status = ?,
                                    scrape_error_log = ?
                                WHERE slug = ?
                            `);
                            await db.transaction(async () => {
                                for (const [slug, data] of Object.entries(report.stores)) {
                                    await updateStmt.run(
                                        data.completed_at || null,
                                        data.status || null,
                                        data.error || null,
                                        slug
                                    );
                                }
                            })();
                        }
                    }
                } catch (dbErr) {
                    if (this.logger) {
                        this.logger.error(`Error updating stores schema after scrape: ${dbErr.message}`);
                    } else {
                        console.error(`Error updating stores schema after scrape: ${dbErr.message}`);
                    }
                }

                resolve(stdout);
            });
        });
    }

    /**
     * Compute telemetry aggregation metrics
     */
    async runAnalyticsAggregation() {
        const db = this.queueService.db;
        // Aggregates clicks, views, comparisons count grouped by day into an analytics table for dashboard
        await db.prepare(`
            CREATE TABLE IF NOT EXISTS analytics_daily_summary (
                date TEXT PRIMARY KEY,
                views INTEGER DEFAULT 0,
                clicks INTEGER DEFAULT 0,
                compares INTEGER DEFAULT 0
            )
        `).run();

        await db.prepare(`
            INSERT INTO analytics_daily_summary (date, views, clicks, compares)
            SELECT 
                strftime('%Y-%m-%d', created_at) as date,
                SUM(CASE WHEN event_type = 'view' THEN 1 ELSE 0 END) as views,
                SUM(CASE WHEN event_type = 'click_offer' THEN 1 ELSE 0 END) as clicks,
                SUM(CASE WHEN event_type = 'compare' THEN 1 ELSE 0 END) as compares
            FROM product_telemetry
            GROUP BY date
            ON CONFLICT (date) DO UPDATE SET
                views = EXCLUDED.views,
                clicks = EXCLUDED.clicks,
                compares = EXCLUDED.compares
        `).run();
    }
}

module.exports = BackgroundWorker;

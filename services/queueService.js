/**
 * SQLite-Backed Queue Service
 * ===========================
 * Handles job queuing, state updates, and transactional locking for background workers.
 */

class QueueService {
    constructor(db) {
        this.db = db;
        this.initializeTable();
    }

    async initializeTable() {
        await this.db.prepare(`
            CREATE TABLE IF NOT EXISTS job_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_type TEXT NOT NULL,
                payload TEXT DEFAULT '{}',
                status TEXT DEFAULT 'pending',
                error TEXT,
                duration_ms INTEGER,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            )
        `).run();
    }

    /**
     * Add a job to the queue
     */
    async enqueue(jobType, payload = {}) {
        const payloadStr = JSON.stringify(payload);
        const result = await this.db.prepare(`
            INSERT INTO job_queue (job_type, payload, status)
            VALUES (?, ?, 'pending')
        `).run(jobType, payloadStr);

        return {
            id: result.lastInsertRowid,
            job_type: jobType,
            payload,
            status: 'pending'
        };
    }

    /**
     * Poll the next pending job using transaction locking
     */
    async pollNextJob() {
        let job = null;

        // Run in an exclusive transaction block to ensure concurrent workers do not double-pick
        const pollTransaction = this.db.transaction(async () => {
            const candidate = await this.db.prepare(`
                SELECT * FROM job_queue 
                WHERE status = 'pending' 
                ORDER BY id ASC 
                LIMIT 1
            `).get();

            if (candidate) {
                await this.db.prepare(`
                    UPDATE job_queue 
                    SET status = 'processing', updated_at = datetime('now')
                    WHERE id = ?
                `).run(candidate.id);

                job = candidate;
                job.payload = JSON.parse(candidate.payload || '{}');
            }
        });

        await pollTransaction();
        return job;
    }

    /**
     * Mark job as completed
     */
    async completeJob(jobId, durationMs) {
        await this.db.prepare(`
            UPDATE job_queue
            SET status = 'completed', duration_ms = ?, updated_at = datetime('now')
            WHERE id = ?
        `).run(durationMs, jobId);
    }

    /**
     * Mark job as failed
     */
    async failJob(jobId, errorMessage, durationMs) {
        await this.db.prepare(`
            UPDATE job_queue
            SET status = 'failed', error = ?, duration_ms = ?, updated_at = datetime('now')
            WHERE id = ?
        `).run(errorMessage, durationMs, jobId);
    }

    /**
     * Get queue statistics summary
     */
    async getQueueStats() {
        const stats = await this.db.prepare(`
            SELECT status, COUNT(*) as count, AVG(duration_ms) as avg_duration
            FROM job_queue
            GROUP BY status
        `).all();

        const result = { pending: 0, processing: 0, completed: 0, failed: 0, avg_duration_ms: 0 };
        let totalDuration = 0;
        let durationCount = 0;

        for (const s of stats) {
            result[s.status] = s.count;
            if (s.avg_duration !== null) {
                totalDuration += s.avg_duration * s.count;
                durationCount += s.count;
            }
        }

        result.avg_duration_ms = durationCount > 0 ? Math.round(totalDuration / durationCount) : 0;
        return result;
    }

    /**
     * Get recent jobs
     */
    async getRecentJobs(limit = 20) {
        const rows = await this.db.prepare(`
            SELECT * FROM job_queue
            ORDER BY id DESC
            LIMIT ?
        `).all(limit);

        return rows.map(r => ({
            ...r,
            payload: JSON.parse(r.payload || '{}')
        }));
    }
}

module.exports = QueueService;

/**
 * Dashboard Page Module
 * =====================
 * Aggregates system telemetry, databases diagnostic info, queues, and integrity logs.
 */

import { adminFetch, showToast, t } from '../admin.js';

let latencyChart = null;

export async function render(container) {
    container.innerHTML = `
        <style>
            @keyframes pulse-live {
                0% { transform: scale(0.9); opacity: 0.6; }
                50% { transform: scale(1.1); opacity: 1; box-shadow: 0 0 10px var(--success); }
                100% { transform: scale(0.9); opacity: 0.6; }
            }
            .pulse-dot {
                animation: pulse-live 2s infinite ease-in-out;
            }
        </style>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <div>
                <h1 style="font-size: 24px; font-weight: 700; background: linear-gradient(to right, #fff, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                    Dashboard
                </h1>
                <p style="font-size: 13px; color: var(--text-secondary);">Live telemetry, databases diagnostics and background jobs console.</p>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-base); padding: 6px 12px; border-radius: 20px; font-size: 11px; color: var(--text-secondary);">
                    <span class="pulse-dot" style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: var(--success); box-shadow: 0 0 6px var(--success);"></span>
                    <span>Live Auto-Refresh (5s)</span>
                </div>
                <button id="refresh-dashboard-btn" class="btn"><i class="fa-solid fa-arrows-rotate"></i> <span>Refresh</span></button>
            </div>
        </div>

        <!-- KPI Metrics Grid -->
        <div class="metrics-row" id="kpi-grid">
            <!-- Loaded dynamically -->
            <div class="metric-card skeleton-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-line"></div></div>
            <div class="metric-card skeleton-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-line"></div></div>
            <div class="metric-card skeleton-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-line"></div></div>
            <div class="metric-card skeleton-card"><div class="skeleton skeleton-title"></div><div class="skeleton skeleton-line"></div></div>
        </div>

        <div class="dashboard-detail-grid">
            <!-- Left Panel: API Latency & Queue Jobs -->
            <div style="display: flex; flex-direction: column; gap: 24px;">
                <!-- API Latency Line Chart -->
                <div class="card">
                    <div class="card-header">
                        <div class="card-title"><i class="fa-solid fa-chart-line"></i> API Response Latency (Recent 100)</div>
                        <div class="card-subtitle">Real-time express response latencies in milliseconds</div>
                    </div>
                    <div class="chart-container">
                        <canvas id="api-latency-canvas"></canvas>
                    </div>
                </div>

                <!-- Job Queue Status -->
                <div class="card" style="flex-grow: 1;">
                    <div class="card-header">
                        <div class="card-title"><i class="fa-solid fa-cubes"></i> Background Job Queue</div>
                        <div>
                            <button id="trigger-recalc-btn" class="btn btn-success"><i class="fa-solid fa-calculator"></i> Recalculate Ranks</button>
                        </div>
                    </div>
                    <div class="table-wrapper">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Job Type</th>
                                    <th>Status</th>
                                    <th>Created At</th>
                                    <th>Finished At</th>
                                </tr>
                            </thead>
                            <tbody id="job-queue-tbody">
                                <tr>
                                    <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 24px;">Loading background queue...</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Right Panel: Databases, System Health & Scrapers -->
            <div style="display: flex; flex-direction: column; gap: 24px;">
                <!-- Database Diagnostics -->
                <div class="card">
                    <div class="card-header">
                        <div class="card-title"><i class="fa-solid fa-database"></i> SQLite Diagnostics</div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 14px;">
                        <div style="display: flex; justify-content: space-between; font-size: 13px;">
                            <span style="color: var(--text-secondary);">Database File Size:</span>
                            <span id="db-size-val" style="font-weight: 600; font-family: var(--font-mono);">0.00 MB</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 13px;">
                            <span style="color: var(--text-secondary);">WAL File Size:</span>
                            <span id="db-wal-val" style="font-weight: 600; font-family: var(--font-mono);">0.00 MB</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 13px;">
                            <span style="color: var(--text-secondary);">Journal Mode:</span>
                            <span id="db-journal-val" class="badge badge-info">WAL</span>
                        </div>
                    </div>
                </div>

                <!-- Data Integrity Anomalies -->
                <div class="card">
                    <div class="card-header">
                        <div class="card-title"><i class="fa-solid fa-circle-nodes"></i> Data Integrity Status</div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 14px; font-size: 13px;" id="integrity-block">
                        <!-- Loaded dynamically -->
                    </div>
                </div>

                <!-- System Resources -->
                <div class="card">
                    <div class="card-header">
                        <div class="card-title"><i class="fa-solid fa-microchip"></i> System Resources</div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 14px;">
                        <div style="display: flex; justify-content: space-between; font-size: 13px;">
                            <span style="color: var(--text-secondary);">Server Uptime:</span>
                            <span id="sys-uptime-val" style="font-weight: 600;">0s</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 13px;">
                            <span style="color: var(--text-secondary);">Memory Usage (RSS):</span>
                            <span id="sys-mem-val" style="font-weight: 600; font-family: var(--font-mono);">0 MB</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('refresh-dashboard-btn').addEventListener('click', loadDashboardData);
    document.getElementById('trigger-recalc-btn').addEventListener('click', triggerRecalculateRanks);

    // Initial load
    await loadDashboardData();

    // Set up auto-refresh every 5 seconds (self-cleaning if user navigates away)
    const refreshInterval = setInterval(async () => {
        // If the dashboard container is no longer in the DOM, clean up the interval
        if (!document.getElementById('kpi-grid')) {
            clearInterval(refreshInterval);
            return;
        }
        try {
            await loadDashboardData();
        } catch (e) {
            // Error handling is managed inside loadDashboardData
        }
    }, 5000);
}

async function loadDashboardData() {
    try {
        const data = await adminFetch('/api/admin/dashboard');
        
        // Guard if user has navigated away from the dashboard page
        if (!document.getElementById('kpi-grid')) return;
        
        // 1. Render KPI Row
        renderKPIs(data);
        
        // 2. Render Latency Chart
        renderLatencyChart(data.system.apiStats.recentRequests || []);
        
        // 3. Render Jobs list
        renderJobs(data.queue.recentJobs || []);
        
        // 4. Render Database & System Resources
        const dbSizeEl = document.getElementById('db-size-val');
        const dbWalEl = document.getElementById('db-wal-val');
        const dbJournalEl = document.getElementById('db-journal-val');
        const sysUptimeEl = document.getElementById('sys-uptime-val');
        const sysMemEl = document.getElementById('sys-mem-val');

        if (dbSizeEl) dbSizeEl.textContent = `${data.database.dbSizeMb} MB`;
        if (dbWalEl) dbWalEl.textContent = `${data.database.walSizeMb} MB`;
        if (dbJournalEl) dbJournalEl.textContent = (data.database.journalMode || 'WAL').toUpperCase();
        
        // Format uptime
        const uptimeSeconds = data.system.uptime;
        const uptimeFormatted = formatUptime(uptimeSeconds);
        if (sysUptimeEl) sysUptimeEl.textContent = uptimeFormatted;
        if (sysMemEl) sysMemEl.textContent = `${data.system.memory.rss} MB / ${data.system.memory.heapTotal} MB (Heap)`;

        // 5. Render Data Integrity Anomalies
        renderIntegrity(data.integrity || {});
        
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

function renderKPIs(data) {
    const kpiGrid = document.getElementById('kpi-grid');
    if (!kpiGrid) return;

    const totalProducts = data.integrity.totalFamilies || 0;
    const activeStores = data.integrity.activeStores || 0;
    const totalIntegrityAnomalies = (data.integrity.orphanVariants || 0) + (data.integrity.orphanOffers || 0);
    const avgResponseTime = Math.round(data.system.apiStats.avgResponseTimeMs || 0);

    // Cache hit calculation
    const cacheStats = data.cache || { hits: 0, misses: 0 };
    const cacheTotal = cacheStats.hits + cacheStats.misses;
    const cacheHitRate = cacheTotal > 0 ? Math.round((cacheStats.hits / cacheTotal) * 100) : 0;

    kpiGrid.innerHTML = `
        <!-- Card 1: Total Products -->
        <div class="metric-card">
            <div class="metric-icon-wrapper" style="background: rgba(99, 102, 241, 0.1); color: var(--primary-light);">
                <i class="fa-solid fa-boxes-stacked"></i>
            </div>
            <div class="metric-details">
                <div class="metric-title">Product Families</div>
                <div class="metric-value">${totalProducts.toLocaleString()}</div>
                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                    From <span style="color: var(--success); font-weight: 600;">${activeStores}</span> Active Stores
                </div>
            </div>
        </div>

        <!-- Card 2: Integrity Anomalies -->
        <div class="metric-card">
            <div class="metric-icon-wrapper" style="background: ${totalIntegrityAnomalies > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)'}; color: ${totalIntegrityAnomalies > 0 ? 'var(--danger)' : 'var(--success)'};">
                <i class="fa-solid fa-shield-circle-exclamation"></i>
            </div>
            <div class="metric-details">
                <div class="metric-title">Integrity Anomalies</div>
                <div class="metric-value" style="color: ${totalIntegrityAnomalies > 0 ? 'var(--danger)' : 'var(--text-primary)'};">${totalIntegrityAnomalies}</div>
                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                    Orphan database entities
                </div>
            </div>
        </div>

        <!-- Card 3: API Performance -->
        <div class="metric-card">
            <div class="metric-icon-wrapper" style="background: rgba(6, 182, 212, 0.1); color: var(--info);">
                <i class="fa-solid fa-gauge-high"></i>
            </div>
            <div class="metric-details">
                <div class="metric-title">Avg Latency</div>
                <div class="metric-value" style="font-family: var(--font-mono);">${avgResponseTime}ms</div>
                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                    Across ${data.system.apiStats.totalRequests.toLocaleString()} reqs
                </div>
            </div>
        </div>

        <!-- Card 4: Cache Hit Rate -->
        <div class="metric-card">
            <div class="metric-icon-wrapper" style="background: rgba(168, 85, 247, 0.1); color: var(--secondary);">
                <i class="fa-solid fa-bolt"></i>
            </div>
            <div class="metric-details">
                <div class="metric-title">Cache Hit Rate</div>
                <div class="metric-value" style="font-family: var(--font-mono);">${cacheHitRate}%</div>
                <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">
                    Hits: ${cacheStats.hits} | Size: ${cacheStats.keysCount} keys
                </div>
            </div>
        </div>
    `;
}

function renderLatencyChart(requests) {
    const canvas = document.getElementById('api-latency-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Destroy previous chart
    if (latencyChart) {
        latencyChart.destroy();
    }

    if (requests.length === 0) {
        // Draw empty text
        ctx.fillStyle = '#627288';
        ctx.font = '14px Outfit';
        ctx.textAlign = 'center';
        ctx.fillText('No requests tracked yet.', canvas.width / 2, canvas.height / 2);
        return;
    }

    const dataPoints = requests.slice(-50).map(r => r.duration);
    const labels = requests.slice(-50).map((r, i) => `${r.method} ${r.url.split('?')[0]}`);

    latencyChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Response Time (ms)',
                data: dataPoints,
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.05)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 2,
                pointHoverRadius: 5,
                pointBackgroundColor: '#818cf8'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: (tooltipItems) => tooltipItems[0].label
                    }
                }
            },
            scales: {
                x: { display: false },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#627288', font: { family: 'Outfit', size: 10 } }
                }
            }
        }
    });
}

function renderJobs(jobs) {
    const tbody = document.getElementById('job-queue-tbody');
    if (!tbody) return;

    if (jobs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 24px;">No background jobs found.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = jobs.map(job => {
        let badgeClass = 'badge-info';
        if (job.status === 'completed') badgeClass = 'badge-success';
        if (job.status === 'failed') badgeClass = 'badge-danger';
        if (job.status === 'pending') badgeClass = 'badge-warning';

        return `
            <tr>
                <td style="font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary);">${job.id}</td>
                <td style="font-weight: 600;">${job.job_type || job.jobType}</td>
                <td><span class="badge ${badgeClass}">${job.status}</span></td>
                <td style="font-size: 11px; color: var(--text-secondary);">${formatDate(job.created_at || job.createdAt)}</td>
                <td style="font-size: 11px; color: var(--text-secondary);">${job.finished_at || job.finishedAt ? formatDate(job.finished_at || job.finishedAt) : '-'}</td>
            </tr>
        `;
    }).join('');
}

function renderIntegrity(integrity) {
    const block = document.getElementById('integrity-block');
    if (!block) return;

    const items = [
        { label: 'Orphan Variants', val: integrity.orphanVariants, isAnomalous: integrity.orphanVariants > 0 },
        { label: 'Orphan Offers', val: integrity.orphanOffers, isAnomalous: integrity.orphanOffers > 0 },
        { label: 'Product Families with no Offers', val: integrity.familiesWithNoOffers, isAnomalous: integrity.familiesWithNoOffers > 0 },
        { label: 'Active / Inactive Store Offers', val: `${integrity.activeOffers || 0} / ${integrity.inactiveOffers || 0}`, isAnomalous: false }
    ];

    block.innerHTML = items.map(item => `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: var(--text-secondary);">${item.label}:</span>
            <span class="${item.isAnomalous ? 'badge badge-danger' : 'badge badge-success'}" style="${item.isAnomalous ? 'font-family: var(--font-mono);' : ''}">
                ${item.val}
            </span>
        </div>
    `).join('');
}

async function triggerRecalculateRanks() {
    const btn = document.getElementById('trigger-recalc-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Triggering...`;

    try {
        const res = await adminFetch('/api/admin/recalculate-ranks', { method: 'POST' });
        showToast(res.message || 'Rank recalculation job enqueued', 'success');
        await loadDashboardData();
    } catch (err) {
        showToast(err.message, 'danger');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Helpers
function formatUptime(seconds) {
    const d = Math.floor(seconds / (3600*24));
    const h = Math.floor(seconds % (3600*24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    
    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' ' + d.toLocaleDateString();
    } catch (e) {
        return dateStr;
    }
}

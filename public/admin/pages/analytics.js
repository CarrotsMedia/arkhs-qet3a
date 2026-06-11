/**
 * Analytics & System Telemetry Page
 * =================================
 * Displays overall platform metrics, interactive Chart.js graphs for daily trends,
 * top searched/viewed entities, API latency performance, and worker diagnostic error logs.
 */

import { adminFetch, showToast, state } from '../admin.js';

// Localized translation terms
const translations = {
    en: {
        title: "Analytics & System Telemetry",
        desc: "Monitor system health, database metrics, page-view logs, storefront search queries, and request latency speeds.",
        tabOverview: "Traffic Trends",
        tabTopLists: "Popular Entities",
        tabPerformance: "Latency & Performance",
        tabDiagnostics: "Queue & System Errors",

        // Metric Tiles
        views: "Product Views",
        clicks: "Offer Clicks",
        compares: "Comparisons Started",
        searches: "Search Queries",
        activeUsers: "Active Users (24h)",
        avgLatency: "Avg Latency",
        successRate: "Success Rate",

        // Table Headers
        productName: "Product Name",
        categoryName: "Category",
        viewsCount: "Views",
        storeName: "Target Store",
        clicksCount: "Clicks",
        searchQuery: "Search Query",
        searchesCount: "Total Searches",
        avgResults: "Avg Results Count",
        requestUrl: "Request URL",
        method: "Method",
        duration: "Latency (ms)",
        timestamp: "Timestamp",
        status: "HTTP Status",

        // Diagnostics
        jobId: "Job ID",
        jobType: "Background Task",
        errorDetails: "Error Trace",
        runDuration: "Duration",
        createdAt: "Execution Date",
        noErrors: "No failed background worker tasks detected.",
        noData: "No telemetry data collected yet.",

        // Charts
        trafficChartTitle: "Daily Traffic Telemetry (Last 14 Days)",
        statusChartTitle: "HTTP Status Code Distribution",
        latencyLabel: "Response Latency"
    },
    ar: {
        title: "التحليلات ومقاييس النظام",
        desc: "مراقبة صحة النظام، إحصائيات قاعدة البيانات، سجلات تصفح المنتجات، كلمات البحث، وسرعات معالجة الاستعلامات.",
        tabOverview: "مؤشرات حركة المرور",
        tabTopLists: "الكيانات الأكثر تفاعلاً",
        tabPerformance: "الأداء وسرعة الاستجابة",
        tabDiagnostics: "الأخطاء وتشخيص العمليات",

        // Metric Tiles
        views: "مشاهدات المنتجات",
        clicks: "نقرات العروض",
        compares: "المقارنات المفتوحة",
        searches: "عمليات البحث",
        activeUsers: "الزوار النشطين (24 ساعة)",
        avgLatency: "متوسط وقت الاستجابة",
        successRate: "نسبة النجاح",

        // Table Headers
        productName: "اسم المنتج",
        categoryName: "القسم",
        viewsCount: "المشاهدات",
        storeName: "المتجر المستهدف",
        clicksCount: "النقرات",
        searchQuery: "كلمة البحث",
        searchesCount: "إجمالي البحث",
        avgResults: "متوسط النتائج",
        requestUrl: "رابط الطلب URL",
        method: "الطريقة",
        duration: "وقت المعالجة (ملي ثانية)",
        timestamp: "تاريخ الطلب",
        status: "رمز الحالة HTTP",

        // Diagnostics
        jobId: "رقم المهمة",
        jobType: "العملية الخلفية",
        errorDetails: "تفاصيل الخطأ",
        runDuration: "المدة الزمنية",
        createdAt: "تاريخ التشغيل",
        noErrors: "لم يتم رصد أي فشل في العمليات الخلفية.",
        noData: "لا توجد بيانات مقاييس متاحة حالياً.",

        // Charts
        trafficChartTitle: "حركة المرور اليومية (آخر 14 يوماً)",
        statusChartTitle: "توزيع رموز استجابة HTTP",
        latencyLabel: "سرعة المعالجة"
    }
};

function st(key) {
    const lang = state.lang || 'en';
    return (translations[lang] && translations[lang][key]) || translations.en[key] || key;
}

let activeTab = 'overview'; // 'overview' | 'toplists' | 'performance' | 'diagnostics'
let trafficChartInstance = null;
let statusChartInstance = null;

export async function render(container) {
    container.innerHTML = `
        <style>
            .analytics-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
                gap: 16px;
                margin-top: 20px;
                margin-bottom: 24px;
            }
            .metric-tile {
                background: rgba(255, 255, 255, 0.03);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: var(--radius-md);
                padding: 16px 20px;
                display: flex;
                flex-direction: column;
                gap: 6px;
                position: relative;
                overflow: hidden;
            }
            .metric-tile::before {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                width: 4px;
                height: 100%;
                background: var(--primary);
            }
            .metric-tile.tile-success::before { background: var(--success); }
            .metric-tile.tile-warning::before { background: var(--warning); }
            .metric-tile.tile-info::before { background: var(--primary-light); }

            .metric-tile .label {
                font-size: 11px;
                font-weight: 600;
                color: var(--text-secondary);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .metric-tile .val {
                font-size: 22px;
                font-weight: 800;
                color: #fff;
                font-family: var(--font-mono);
            }

            .tab-nav-analytics {
                display: flex;
                gap: 8px;
                margin-bottom: 24px;
                border-bottom: 1px solid var(--border-base);
                padding-bottom: 1px;
            }
            .tab-btn-analytics {
                background: none;
                border: none;
                border-bottom: 2px solid transparent;
                padding: 10px 18px;
                color: var(--text-secondary);
                font-weight: 600;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .tab-btn-analytics:hover {
                color: var(--text-primary);
            }
            .tab-btn-analytics.active {
                color: var(--primary);
                border-bottom-color: var(--primary);
            }
            .chart-box {
                background: rgba(0, 0, 0, 0.2);
                border: 1px solid var(--border-base);
                border-radius: var(--radius-md);
                padding: 20px;
                margin-bottom: 24px;
            }
            .analytics-tab-panel {
                min-height: 350px;
            }
        </style>

        <div>
            <h1 style="font-size: 24px; font-weight: 700; background: linear-gradient(to right, #fff, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                ${st('title')}
            </h1>
            <p style="font-size: 13px; color: var(--text-secondary);">${st('desc')}</p>

            <!-- Metrics Overview Tiles -->
            <div class="analytics-grid" id="analytics-overview-tiles">
                <div class="metric-tile"><div class="label">Loading...</div><div class="val">--</div></div>
                <div class="metric-tile"><div class="label">Loading...</div><div class="val">--</div></div>
                <div class="metric-tile"><div class="label">Loading...</div><div class="val">--</div></div>
                <div class="metric-tile"><div class="label">Loading...</div><div class="val">--</div></div>
            </div>

            <!-- Tab Navigation -->
            <div class="tab-nav-analytics">
                <button class="tab-btn-analytics ${activeTab === 'overview' ? 'active' : ''}" data-tab="overview">
                    <i class="fa-solid fa-chart-line"></i> ${st('tabOverview')}
                </button>
                <button class="tab-btn-analytics ${activeTab === 'toplists' ? 'active' : ''}" data-tab="toplists">
                    <i class="fa-solid fa-fire"></i> ${st('tabTopLists')}
                </button>
                <button class="tab-btn-analytics ${activeTab === 'performance' ? 'active' : ''}" data-tab="performance">
                    <i class="fa-solid fa-gauge-high"></i> ${st('tabPerformance')}
                </button>
                <button class="tab-btn-analytics ${activeTab === 'diagnostics' ? 'active' : ''}" data-tab="diagnostics">
                    <i class="fa-solid fa-triangle-exclamation"></i> ${st('tabDiagnostics')}
                </button>
            </div>

            <!-- Dynamic Tab Content Panel -->
            <div class="analytics-tab-panel" id="analytics-tab-panel"></div>
        </div>
    `;

    // Bind Tabs
    container.querySelectorAll('.tab-btn-analytics').forEach(btn => {
        btn.addEventListener('click', () => {
            activeTab = btn.dataset.tab;
            container.querySelectorAll('.tab-btn-analytics').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderActiveTabPanel();
        });
    });

    // Initial Load
    await loadInitialData();
}

async function loadInitialData() {
    try {
        // Fetch overview metrics in parallel
        const [overviewRes, performanceRes] = await Promise.all([
            adminFetch('/api/admin/analytics/overview'),
            adminFetch('/api/admin/analytics/performance')
        ]);

        const m = overviewRes.metrics || { views: 0, clicks: 0, compares: 0, searches: 0, activeUsers: 0 };
        const p = performanceRes.performance || { totalRequests: 0, avgResponseTimeMs: 0, statusCodes: {} };

        // Render Overview Tiles
        const tilesContainer = document.getElementById('analytics-overview-tiles');
        if (tilesContainer) {
            // Calculate success rate: (HTTP 2xx & 3xx) / totalRequests
            let successRequests = 0;
            let totalRequests = p.totalRequests || 0;
            for (const [code, count] of Object.entries(p.statusCodes || {})) {
                if (parseInt(code) < 400) {
                    successRequests += count;
                }
            }
            const successRate = totalRequests > 0 ? Math.round((successRequests / totalRequests) * 100) : 100;

            tilesContainer.innerHTML = `
                <div class="metric-tile tile-info">
                    <div class="label">${st('views')}</div>
                    <div class="val">${m.views.toLocaleString()}</div>
                </div>
                <div class="metric-tile tile-success">
                    <div class="label">${st('clicks')}</div>
                    <div class="val">${m.clicks.toLocaleString()}</div>
                </div>
                <div class="metric-tile">
                    <div class="label">${st('searches')}</div>
                    <div class="val">${m.searches.toLocaleString()}</div>
                </div>
                <div class="metric-tile tile-info">
                    <div class="label">${st('activeUsers')}</div>
                    <div class="val">${m.activeUsers.toLocaleString()}</div>
                </div>
                <div class="metric-tile tile-warning">
                    <div class="label">${st('avgLatency')}</div>
                    <div class="val">${p.avgResponseTimeMs} ms</div>
                </div>
                <div class="metric-tile tile-success">
                    <div class="label">${st('successRate')}</div>
                    <div class="val">${successRate}%</div>
                </div>
            `;
        }

        // Render Active Tab Content
        await renderActiveTabPanel();

    } catch (err) {
        showToast('Failed to load metrics summary: ' + err.message, 'danger');
    }
}

async function renderActiveTabPanel() {
    const container = document.getElementById('analytics-tab-panel');
    if (!container) return;

    // Destroy existing charts to prevent canvas memory leaks
    if (trafficChartInstance) { trafficChartInstance.destroy(); trafficChartInstance = null; }
    if (statusChartInstance) { statusChartInstance.destroy(); statusChartInstance = null; }

    container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>`;

    try {
        if (activeTab === 'overview') {
            await renderOverviewTab(container);
        } else if (activeTab === 'toplists') {
            await renderTopListsTab(container);
        } else if (activeTab === 'performance') {
            await renderPerformanceTab(container);
        } else if (activeTab === 'diagnostics') {
            await renderDiagnosticsTab(container);
        }
    } catch (err) {
        container.innerHTML = `
            <div class="card" style="text-align: center; padding: 40px; color: var(--danger);">
                <i class="fa-solid fa-circle-exclamation fa-2x"></i>
                <p style="margin-top: 12px;">Failed to load panel data: ${err.message}</p>
            </div>
        `;
    }
}

// ═══════════════════════════════════════════════════
// OVERVIEW TRAFFIC TRENDS
// ═══════════════════════════════════════════════════

async function renderOverviewTab(container) {
    const res = await adminFetch('/api/admin/analytics/overview');
    const summary = res.summary || [];

    if (summary.length === 0) {
        container.innerHTML = `<div class="card" style="text-align: center; padding: 40px; color: var(--text-secondary);">${st('noData')}</div>`;
        return;
    }

    container.innerHTML = `
        <div class="chart-box">
            <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 16px; color:#fff;">
                <i class="fa-solid fa-chart-line"></i> ${st('trafficChartTitle')}
            </h3>
            <div style="position: relative; height: 320px; width: 100%;">
                <canvas id="traffic-canvas-chart"></canvas>
            </div>
        </div>
    `;

    // Setup Chart.js
    const ctx = document.getElementById('traffic-canvas-chart').getContext('2d');
    
    // Apply styling overrides for elegant dark-mode glass charts
    trafficChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: summary.map(s => {
                const d = new Date(s.date);
                return d.toLocaleDateString(state.lang === 'ar' ? 'ar-EG' : 'en-US', { month: 'short', day: 'numeric' });
            }),
            datasets: [
                {
                    label: st('views'),
                    data: summary.map(s => s.views),
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.08)',
                    fill: true,
                    tension: 0.35,
                    borderWidth: 2.5
                },
                {
                    label: st('clicks'),
                    data: summary.map(s => s.clicks),
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.05)',
                    fill: true,
                    tension: 0.35,
                    borderWidth: 2.5
                },
                {
                    label: st('searches'),
                    data: summary.map(s => s.searches),
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.03)',
                    fill: true,
                    tension: 0.35,
                    borderWidth: 2.5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#94a3b8', font: { family: 'Outfit', size: 12 } }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
                }
            }
        }
    });
}

// ═══════════════════════════════════════════════════
// POPULAR ENTITIES
// ═══════════════════════════════════════════════════

async function renderTopListsTab(container) {
    const res = await adminFetch('/api/admin/analytics/top-entities');
    const products = res.products || [];
    const offers = res.offers || [];
    const searches = res.searches || [];

    container.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">
            <!-- Top Viewed Products -->
            <div class="card">
                <div class="card-header">
                    <div class="card-title"><i class="fa-solid fa-eye"></i> Top Viewed Products</div>
                </div>
                <div class="table-wrapper">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>${st('productName')}</th>
                                <th>${st('categoryName')}</th>
                                <th style="text-align: center; width: 80px;">${st('viewsCount')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${products.length === 0 ? `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">No product views recorded.</td></tr>` : products.map(p => `
                                <tr>
                                    <td style="font-weight: 600; color:#fff;">${p.name}</td>
                                    <td style="font-size: 11px; color:var(--text-secondary);">${p.category}</td>
                                    <td style="text-align: center; font-weight: 700; color: var(--primary-light); font-family: var(--font-mono);">${p.views}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Top Clicked Offers -->
            <div class="card">
                <div class="card-header">
                    <div class="card-title"><i class="fa-solid fa-arrow-pointer"></i> Top Clicked Offers</div>
                </div>
                <div class="table-wrapper">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>${st('productName')}</th>
                                <th>${st('storeName')}</th>
                                <th style="text-align: center; width: 80px;">${st('clicksCount')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${offers.length === 0 ? `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">No offer clicks recorded.</td></tr>` : offers.map(o => `
                                <tr>
                                    <td style="font-weight: 600; color:#fff;">${o.product_name}</td>
                                    <td style="font-size: 11px; color:var(--text-secondary);">${o.store_name}</td>
                                    <td style="text-align: center; font-weight: 700; color: var(--success); font-family: var(--font-mono);">${o.clicks}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Top Search Queries -->
        <div class="card" style="margin-top: 24px;">
            <div class="card-header">
                <div class="card-title"><i class="fa-solid fa-magnifying-glass"></i> Top Search Queries</div>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>${st('searchQuery')}</th>
                            <th style="text-align: center; width: 140px;">${st('searchesCount')}</th>
                            <th style="text-align: center; width: 140px;">${st('avgResults')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${searches.length === 0 ? `<tr><td colspan="3" style="text-align:center; color:var(--text-muted);">No searches recorded.</td></tr>` : searches.map(s => `
                            <tr>
                                <td style="font-family: var(--font-mono); font-weight: 600; color:#fff;">"${s.query}"</td>
                                <td style="text-align: center; font-weight: 700; color: var(--primary-light); font-family: var(--font-mono);">${s.count}</td>
                                <td style="text-align: center; font-family: var(--font-mono); color: var(--text-secondary);">${s.avg_results} results</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// ═══════════════════════════════════════════════════
// LATENCY & PERFORMANCE TAB
// ═══════════════════════════════════════════════════

async function renderPerformanceTab(container) {
    const res = await adminFetch('/api/admin/analytics/performance');
    const perf = res.performance || { totalRequests: 0, avgResponseTimeMs: 0, statusCodes: {}, recentRequests: [] };

    const codes = Object.keys(perf.statusCodes || {});
    const counts = Object.values(perf.statusCodes || {});

    container.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 24px;">
            <!-- HTTP Status Code Pie Chart -->
            <div class="chart-box">
                <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 16px; color:#fff;">
                    <i class="fa-solid fa-chart-pie"></i> ${st('statusChartTitle')}
                </h3>
                <div style="position: relative; height: 260px; width: 100%;">
                    ${codes.length === 0 ? `<div style="text-align:center; padding: 40px; color:var(--text-secondary);">${st('noData')}</div>` : `<canvas id="status-canvas-chart"></canvas>`}
                </div>
            </div>

            <!-- Latency stats summaries -->
            <div style="display: flex; flex-direction: column; gap: 20px;">
                <div class="card">
                    <div class="card-header">
                        <div class="card-title"><i class="fa-solid fa-gauge-high"></i> Latency Breakdown</div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 8px;">
                        <div style="display: flex; justify-content: space-between; font-size: 13px;">
                            <span style="color: var(--text-secondary);">Total Logged Requests</span>
                            <strong style="color:#fff; font-family:var(--font-mono);">${perf.totalRequests.toLocaleString()}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 13px;">
                            <span style="color: var(--text-secondary);">Average Server Latency</span>
                            <strong style="color:var(--warning); font-family:var(--font-mono);">${perf.avgResponseTimeMs} ms</strong>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Latency Traces Table -->
        <div class="card">
            <div class="card-header">
                <div class="card-title"><i class="fa-solid fa-list"></i> Recent Request Latency Trace</div>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 80px;">${st('method')}</th>
                            <th>${st('requestUrl')}</th>
                            <th style="text-align: center; width: 120px;">${st('duration')}</th>
                            <th style="text-align: center; width: 180px;">${st('timestamp')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${perf.recentRequests.length === 0 ? `<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No trace records logged.</td></tr>` : perf.recentRequests.slice().reverse().map(r => {
                            const date = new Date(r.timestamp);
                            const timeStr = date.toLocaleTimeString() + ' ' + date.toLocaleDateString();
                            return `
                                <tr>
                                    <td>
                                        <span class="badge ${r.method === 'POST' ? 'badge-success' : r.method === 'DELETE' ? 'badge-danger' : 'badge-info'}" style="font-size: 9px; font-weight:700;">
                                            ${r.method}
                                        </span>
                                    </td>
                                    <td style="font-family: var(--font-mono); font-size: 11px; color:#fff; word-break: break-all;">
                                        ${r.url}
                                    </td>
                                    <td style="text-align: center; font-family: var(--font-mono); font-weight: 700; color: ${r.duration > 150 ? 'var(--danger)' : r.duration > 50 ? 'var(--warning)' : 'var(--success)'};">
                                        ${r.duration} ms
                                    </td>
                                    <td style="text-align: center; font-size: 11px; color: var(--text-secondary);">
                                        ${timeStr}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // Draw Status codes Pie Chart
    if (codes.length > 0) {
        const ctx = document.getElementById('status-canvas-chart').getContext('2d');
        
        // Define colors per HTTP class
        const colors = codes.map(code => {
            if (code.startsWith('2')) return '#10b981'; // 200/201 Green
            if (code.startsWith('3')) return '#3b82f6'; // 302 Blue
            if (code.startsWith('4')) return '#f59e0b'; // 400/401 Orange
            return '#ef4444'; // 500 Red
        });

        statusChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: codes,
                datasets: [{
                    data: counts,
                    backgroundColor: colors,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.08)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { color: '#94a3b8', font: { family: 'Outfit' } }
                    }
                }
            }
        });
    }
}

// ═══════════════════════════════════════════════════
// DIAGNOSTICS & SYSTEM ERRORS
// ═══════════════════════════════════════════════════

async function renderDiagnosticsTab(container) {
    const res = await adminFetch('/api/admin/analytics/errors');
    const diag = res.diagnostics || { failedJobs: [] };

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <div class="card-title"><i class="fa-solid fa-triangle-exclamation"></i> Failed Background Tasks</div>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 80px;">${st('jobId')}</th>
                            <th style="width: 160px;">${st('jobType')}</th>
                            <th>${st('errorDetails')}</th>
                            <th style="text-align: center; width: 100px;">${st('runDuration')}</th>
                            <th style="text-align: center; width: 160px;">${st('createdAt')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${diag.failedJobs.length === 0 ? `
                            <tr>
                                <td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 40px;">
                                    <i class="fa-solid fa-circle-check" style="color: var(--success); font-size: 24px; margin-bottom: 8px;"></i>
                                    <div>${st('noErrors')}</div>
                                </td>
                            </tr>
                        ` : diag.failedJobs.map(job => {
                            const date = new Date(job.created_at);
                            const dateStr = date.toLocaleTimeString() + ' ' + date.toLocaleDateString();
                            return `
                                <tr>
                                    <td style="font-family: var(--font-mono); font-size: 11px; font-weight: 700;">
                                        #${job.id}
                                    </td>
                                    <td>
                                        <span class="badge badge-danger" style="font-size: 9px; font-weight: 700;">
                                            ${job.job_type.toUpperCase()}
                                        </span>
                                    </td>
                                    <td style="font-family: var(--font-mono); font-size: 10px; color:#fff; white-space: pre-wrap; word-break: break-all; max-width: 400px; padding: 10px;">
                                        ${job.error}
                                    </td>
                                    <td style="text-align: center; font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary);">
                                        ${job.duration_ms ? (job.duration_ms / 1000).toFixed(1) + ' s' : '--'}
                                    </td>
                                    <td style="text-align: center; font-size: 11px; color: var(--text-secondary);">
                                        ${dateStr}
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

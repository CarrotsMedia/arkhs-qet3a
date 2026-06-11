/**
 * Stores & Scrapers Control Center Page
 * =====================================
 * Handles real-time monitoring of scrapers health, execution triggers,
 * and background queues logs.
 */

import { adminFetch, showToast, t, state } from '../admin.js';

// Arabic translations specifically for the scrapers control center
const scraperTranslations = {
    en: {
        scrapersTitle: "Stores & Scrapers Control Center",
        scrapersDesc: "Manage store scrapers, trigger manual synchronizations, and inspect extraction logs.",
        runAll: "Run All Scrapers",
        storeName: "Store Name",
        productsInDb: "Products in DB",
        scraperStatus: "Scraper Status",
        lastCompleted: "Last Completed",
        lastDuration: "Duration",
        actions: "Actions",
        runBtn: "Run",
        running: "Running...",
        pending: "Pending...",
        success: "Success",
        failed: "Failed",
        empty: "Empty",
        neverRun: "Never Run",
        queueStatus: "Queue Status",
        totalScrapers: "Total Scrapers",
        syncSuccess: "Successful Runs",
        syncFails: "Failures",
        recentLogs: "Latest Execution Logs",
        viewWebsite: "Visit Website",
        enqueued: "Job successfully enqueued",
        failedEnqueue: "Failed to trigger scraper",
        activeJobs: "Active Sync Jobs"
    },
    ar: {
        scrapersTitle: "مركز التحكم في المكشطات والمتاجر",
        scrapersDesc: "إدارة مكشطات المتاجر، وتشغيل عمليات التزامن يدوياً، ومعاينة سجلات الاستخراج.",
        runAll: "تشغيل جميع المكشطات",
        storeName: "اسم المتجر",
        productsInDb: "المنتجات بقاعدة البيانات",
        scraperStatus: "حالة المكشطة",
        lastCompleted: "آخر اكتمال",
        lastDuration: "المدة",
        actions: "الإجراءات",
        runBtn: "تشغيل",
        running: "جاري التشغيل...",
        pending: "قيد الانتظار...",
        success: "ناجح",
        failed: "فشل",
        empty: "فارغ",
        neverRun: "لم يتم تشغيله",
        queueStatus: "حالة الطابور",
        totalScrapers: "إجمالي المكشطات",
        syncSuccess: "عمليات ناجحة",
        syncFails: "عمليات فاشلة",
        recentLogs: "سجل عمليات التشغيل الأخيرة",
        viewWebsite: "زيارة الموقع",
        enqueued: "تم إدراج المهمة في طابور العمل بنجاح",
        failedEnqueue: "فشل تشغيل المكشطة",
        activeJobs: "مهام المزامنة النشطة"
    }
};

function st(key) {
    const lang = state.lang || 'en';
    return (scraperTranslations[lang] && scraperTranslations[lang][key]) || scraperTranslations.en[key] || key;
}

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
            .log-box {
                background: rgba(0, 0, 0, 0.4);
                border: 1px solid var(--border-base);
                border-radius: var(--radius-md);
                padding: 16px;
                font-family: var(--font-mono);
                font-size: 12px;
                color: #e2e8f0;
                max-height: 350px;
                overflow-y: auto;
                white-space: pre-wrap;
            }
        </style>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 16px;">
            <div>
                <h1 style="font-size: 24px; font-weight: 700; background: linear-gradient(to right, #fff, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                    ${st('scrapersTitle')}
                </h1>
                <p style="font-size: 13px; color: var(--text-secondary);">${st('scrapersDesc')}</p>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-base); padding: 6px 12px; border-radius: 20px; font-size: 11px; color: var(--text-secondary);">
                    <span class="pulse-dot" style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: var(--success); box-shadow: 0 0 6px var(--success);"></span>
                    <span>${state.lang === 'ar' ? 'تحديث تلقائي (5 ثوانٍ)' : 'Live Auto-Refresh (5s)'}</span>
                </div>
                <button id="run-all-scrapers-btn" class="btn btn-primary">
                    <i class="fa-solid fa-play"></i> <span>${st('runAll')}</span>
                </button>
            </div>
        </div>

        <!-- KPI Metrics Grid -->
        <div class="metrics-row" id="scraper-kpi-grid" style="margin-bottom: 24px;">
            <div class="metric-card">
                <div class="metric-icon-wrapper" style="background: rgba(99, 102, 241, 0.1); color: var(--primary);">
                    <i class="fa-solid fa-robot"></i>
                </div>
                <div class="metric-details">
                    <div class="metric-title">${st('totalScrapers')}</div>
                    <div class="metric-value" id="kpi-total-scrapers">0</div>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-icon-wrapper" style="background: rgba(16, 185, 129, 0.1); color: var(--success);">
                    <i class="fa-solid fa-circle-check"></i>
                </div>
                <div class="metric-details">
                    <div class="metric-title">${st('syncSuccess')}</div>
                    <div class="metric-value" id="kpi-success-scrapers" style="color: var(--success);">0</div>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-icon-wrapper" style="background: rgba(239, 68, 68, 0.1); color: var(--danger);">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                </div>
                <div class="metric-details">
                    <div class="metric-title">${st('syncFails')}</div>
                    <div class="metric-value" id="kpi-failed-scrapers" style="color: var(--danger);">0</div>
                </div>
            </div>
            <div class="metric-card">
                <div class="metric-icon-wrapper" style="background: rgba(245, 158, 11, 0.1); color: var(--warning);">
                    <i class="fa-solid fa-layer-group"></i>
                </div>
                <div class="metric-details">
                    <div class="metric-title">${st('activeJobs')}</div>
                    <div class="metric-value" id="kpi-active-jobs" style="color: var(--warning);">0</div>
                </div>
            </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 24px;">
            <!-- Scrapers List Table -->
            <div class="card">
                <div class="card-header">
                    <div class="card-title"><i class="fa-solid fa-server"></i> ${state.lang === 'ar' ? 'حالة مكشطات المتاجر' : 'Store Scrapers Registry'}</div>
                </div>
                <div class="table-wrapper">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>${st('storeName')}</th>
                                <th>${st('productsInDb')}</th>
                                <th>${st('scraperStatus')}</th>
                                <th>${st('lastCompleted')}</th>
                                <th>${st('lastDuration')}</th>
                                <th style="text-align: center; width: 140px;">${st('actions')}</th>
                            </tr>
                        </thead>
                        <tbody id="scrapers-table-body">
                            <tr>
                                <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">
                                    ${state.lang === 'ar' ? 'جاري تحميل المكشطات...' : 'Loading scraper registry...'}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Execution Logs -->
            <div class="card">
                <div class="card-header">
                    <div class="card-title"><i class="fa-solid fa-terminal"></i> ${st('recentLogs')}</div>
                </div>
                <div class="log-box" id="scrapers-log-box">
                    ${state.lang === 'ar' ? 'لا توجد سجلات تزامُن نشطة حالياً.' : 'No active synchronization logs available.'}
                </div>
            </div>
        </div>
    `;

    document.getElementById('run-all-scrapers-btn').addEventListener('click', () => triggerScraper(null));

    // Initial load
    await loadScrapersData();

    // Set up auto-refresh
    const refreshInterval = setInterval(async () => {
        if (!document.getElementById('scraper-kpi-grid')) {
            clearInterval(refreshInterval);
            return;
        }
        try {
            await loadScrapersData();
        } catch (e) {
            // Ignore
        }
    }, 5000);
}

async function loadScrapersData() {
    try {
        // Fetch stores list, scraper health report, and dashboard/queue stats in parallel
        const [storesData, health, dashboard] = await Promise.all([
            adminFetch('/api/admin/stores'),
            adminFetch('/api/admin/scrapers/status'),
            adminFetch('/api/admin/dashboard')
        ]);
        const stores = storesData.stores || [];

        const recentJobs = dashboard.queue.recentJobs || [];
        const runningJobs = recentJobs.filter(j => (j.job_type === 'run_scraper_sync' || j.job_type === 'run_scraper_single') && (j.status === 'pending' || j.status === 'processing'));

        // Update KPIs
        const totalScrapers = stores.length;
        let successRuns = 0;
        let failRuns = 0;

        if (health && health.stores) {
            Object.values(health.stores).forEach(s => {
                if (s.status === 'success') successRuns++;
                else if (s.status === 'failed') failRuns++;
            });
        }

        const totalEl = document.getElementById('kpi-total-scrapers');
        const successEl = document.getElementById('kpi-success-scrapers');
        const failedEl = document.getElementById('kpi-failed-scrapers');
        const activeEl = document.getElementById('kpi-active-jobs');

        if (!totalEl || !successEl || !failedEl || !activeEl) return;

        totalEl.textContent = totalScrapers;
        successEl.textContent = successRuns;
        failedEl.textContent = failRuns;
        activeEl.textContent = runningJobs.length;

        // Render Table Body
        const tbody = document.getElementById('scrapers-table-body');
        if (!tbody) return;

        let tableHtml = '';
        stores.forEach(store => {
            // Get stats from health report if available
            const hInfo = health.stores ? health.stores[store.slug] : null;
            const jobRunning = runningJobs.some(j => !j.payload.store || j.payload.store === store.slug) || (hInfo && hInfo.status === 'running');

            let statusBadge = '';
            let lastCompleted = '—';
            let lastDuration = '—';

            if (jobRunning) {
                let progText = '';
                let titleAttr = '';
                if (hInfo && hInfo.progress) {
                    const p = hInfo.progress;
                    if (p.percentage !== undefined) {
                        progText = ` (${p.percentage}%)`;
                    }
                    if (p.current_keyword) {
                        progText += ` - ${p.current_keyword}`;
                    }
                    titleAttr = `Scraped: ${p.products_scraped || 0} | Keyword: ${p.processed_count || 0}/${p.total_count || 0}`;
                }
                statusBadge = `<span class="badge badge-warning" title="${titleAttr}"><i class="fa-solid fa-spinner fa-spin" style="margin-right: 5px;"></i> ${st('running')}${progText}</span>`;
            } else if (hInfo) {
                if (hInfo.status === 'success') {
                    statusBadge = `<span class="badge badge-success">${st('success')}</span>`;
                } else if (hInfo.status === 'failed') {
                    statusBadge = `<span class="badge badge-danger">${st('failed')}</span>`;
                } else if (hInfo.status === 'empty') {
                    statusBadge = `<span class="badge badge-warning">${st('empty')}</span>`;
                } else {
                    statusBadge = `<span class="badge badge-info">${hInfo.status}</span>`;
                }

                if (hInfo.completed_at) {
                    const completedDate = new Date(hInfo.completed_at);
                    lastCompleted = state.lang === 'ar' 
                        ? completedDate.toLocaleDateString('ar-EG') + ' ' + completedDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
                        : completedDate.toLocaleDateString() + ' ' + completedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }
                if (hInfo.duration_seconds) {
                    lastDuration = `${hInfo.duration_seconds}s`;
                }
            } else {
                statusBadge = `<span class="badge" style="background: rgba(255,255,255,0.05); color: var(--text-muted);">${st('neverRun')}</span>`;
            }

            tableHtml += `
                <tr>
                    <td>
                        <div style="font-weight: 600; color: var(--text-primary);">${store.name}</div>
                        ${store.website ? `<a href="${store.website}" target="_blank" style="font-size: 11px; color: var(--primary-light); text-decoration: none;"><i class="fa-solid fa-link" style="font-size: 9px;"></i> ${st('viewWebsite')}</a>` : ''}
                    </td>
                    <td style="font-family: var(--font-mono); font-weight: 500;">
                        ${store.product_count.toLocaleString()}
                    </td>
                    <td>${statusBadge}</td>
                    <td>${lastCompleted}</td>
                    <td>${lastDuration}</td>
                    <td style="text-align: center;">
                        <button class="btn btn-sm run-single-btn" data-slug="${store.slug}" ${jobRunning ? 'disabled style="opacity: 0.5; pointer-events: none;"' : ''}>
                            <i class="fa-solid fa-play"></i> <span>${st('runBtn')}</span>
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = tableHtml;

        // Bind single run buttons
        tbody.querySelectorAll('.run-single-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const slug = btn.dataset.slug;
                triggerScraper(slug);
            });
        });

        // Render Logs Box
        const logBox = document.getElementById('scrapers-log-box');
        if (logBox) {
            try {
                const logsRes = await adminFetch('/api/admin/scrapers/logs');
                logBox.textContent = logsRes.logs || '';
            } catch (err) {
                logBox.textContent = 'Error loading logs: ' + err.message;
            }
        }

    } catch (err) {
        showToast(err.message, 'danger');
    }
}

async function triggerScraper(storeSlug) {
    try {
        const url = storeSlug ? `/api/admin/scrapers/run/${storeSlug}` : '/api/admin/scrapers/run';
        const res = await adminFetch(url, {
            method: 'POST'
        });

        if (res.success) {
            showToast(`${st('enqueued')}: #${res.job.id}`, 'success');
            await loadScrapersData();
        } else {
            showToast(st('failedEnqueue'), 'danger');
        }
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

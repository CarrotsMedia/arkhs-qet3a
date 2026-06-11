/**
 * Dawarly Admin Panel — Core SPA Framework
 * =======================================
 * Minimal, modular, zero-dependency SPA Router & State Controller.
 */

// Global Translations Dictionary (English & Arabic)
export const translations = {
    en: {
        appName: "Dawarly Operations",
        dashboard: "Dashboard",
        categories: "Categories",
        products: "Products",
        mergeCenter: "Merge Control",
        scrapers: "Scrapers & Status",
        stores: "Stores Registry",
        database: "Database Tools",
        featureFlags: "Feature Flags",
        analytics: "Analytics & Telemetry",
        settings: "Settings",
        logout: "Logout",
        systemOnline: "System Online",
        search: "Search...",
        loading: "Loading Dawarly Operations...",
        welcomeBack: "Welcome Back",
        role: "Role",
        langLabel: "العربية",
        viewSite: "View Site",
        unknownUser: "Administrator"
    },
    ar: {
        appName: "عمليات دورلي",
        dashboard: "لوحة التحكم",
        categories: "الأقسام",
        products: "المنتجات",
        mergeCenter: "دمج المنتجات",
        scrapers: "المكشطة والتحليلات",
        stores: "سجل المتاجر",
        database: "أدوات قاعدة البيانات",
        featureFlags: "أعلام الميزات",
        analytics: "التحليلات والمقاييس",
        settings: "الإعدادات",
        logout: "تسجيل الخروج",
        systemOnline: "النظام متصل",
        search: "بحث...",
        loading: "جاري تحميل العمليات...",
        welcomeBack: "مرحباً بك مجدداً",
        role: "الدور",
        langLabel: "English",
        viewSite: "معاينة الموقع",
        unknownUser: "المشرف"
    }
};

// Global App State
export const state = {
    user: null,
    lang: localStorage.getItem('admin_lang') || 'en',
    currentRoute: '',
    csrfToken: '',
    activeToastCount: 0
};

// Get translation key
export function t(key) {
    return translations[state.lang][key] || key;
}

// Set application language
export function setLanguage(lang) {
    state.lang = lang;
    localStorage.setItem('admin_lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    
    // Rerender layout structural items
    renderSidebar();
    renderTopbar();
    
    // Rerender current route content
    navigate(state.currentRoute, true);
}

// ═══════════════════════════════════════════════════
// Cookies & CSRF Helpers
// ═══════════════════════════════════════════════════

export function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

/**
 * Custom Fetch Wrapper for Admin APIs
 * Automatically sets CSRF token, handles JSON parsing, and redirects to login on 401.
 */
export async function adminFetch(url, options = {}) {
    options.headers = options.headers || {};
    
    // Automatically read XSRF-TOKEN from cookies and set in header for state-changing requests
    const xsrfToken = getCookie('XSRF-TOKEN');
    if (xsrfToken) {
        options.headers['x-xsrf-token'] = xsrfToken;
    }
    
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }
    
    options.credentials = 'include'; // Ensure cookies are sent

    try {
        const response = await fetch(url, options);
        
        if (response.status === 401) {
            // Unauthenticated — force clear state and route to login
            state.user = null;
            document.getElementById('app-container').classList.add('hidden');
            window.location.hash = '#/login';
            throw new Error('Session expired. Please log in again.');
        }

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error?.message || `API Error: ${response.statusText}`);
        }
        
        return data;
    } catch (err) {
        console.error(`adminFetch error on ${url}:`, err);
        throw err;
    }
}

// ═══════════════════════════════════════════════════
// Toast Notification Engine
// ═══════════════════════════════════════════════════

export function showToast(message, type = 'success', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const iconClass = {
        success: 'fa-circle-check',
        danger: 'fa-circle-exclamation',
        warning: 'fa-triangle-exclamation',
        info: 'fa-circle-info'
    }[type] || 'fa-bell';

    toast.innerHTML = `
        <i class="fa-solid ${iconClass} toast-icon"></i>
        <div class="toast-text">${message}</div>
    `;

    container.appendChild(toast);
    state.activeToastCount++;

    // Remove on click
    toast.addEventListener('click', () => {
        toast.classList.add('hide');
        setTimeout(() => {
            toast.remove();
            state.activeToastCount--;
        }, 200);
    });

    // Auto remove after duration
    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.add('hide');
            setTimeout(() => {
                toast.remove();
                state.activeToastCount--;
            }, 200);
        }
    }, duration);
}

// ═══════════════════════════════════════════════════
// Structural Rendering Functions
// ═══════════════════════════════════════════════════

function renderSidebar() {
    const sidebar = document.getElementById('sidebar-container');
    if (!sidebar || !state.user) return;

    const menuItems = [
        { route: '#/dashboard', icon: 'fa-chart-pie', label: t('dashboard') },
        { route: '#/categories', icon: 'fa-folder-tree', label: t('categories') },
        { route: '#/products', icon: 'fa-box-open', label: t('products') },
        { route: '#/merge', icon: 'fa-code-merge', label: t('mergeCenter') },
        { route: '#/scrapers', icon: 'fa-robot', label: t('scrapers') },
        { route: '#/stores', icon: 'fa-store', label: t('stores') },
        { route: '#/database', icon: 'fa-database', label: t('database') },
        { route: '#/feature-flags', icon: 'fa-flag', label: t('featureFlags') },
        { route: '#/analytics', icon: 'fa-chart-line', label: t('analytics') },
        { route: '#/settings', icon: 'fa-sliders', label: t('settings') }
    ];

    const currentHash = window.location.hash || '#/dashboard';

    sidebar.innerHTML = `
        <div class="sidebar-header">
            <div class="logo-icon"><i class="fa-solid fa-layer-group"></i></div>
            <div class="logo-title">${t('appName')}</div>
        </div>
        <nav class="sidebar-nav">
            ${menuItems.map(item => `
                <a href="${item.route}" class="nav-item ${currentHash.startsWith(item.route) ? 'active' : ''}">
                    <i class="fa-solid ${item.icon}"></i>
                    <span>${item.label}</span>
                </a>
            `).join('')}
        </nav>
        <div class="sidebar-footer">
            <div class="user-profile">
                <div class="avatar"><i class="fa-solid fa-user-gear"></i></div>
                <div class="user-info">
                    <div class="user-name">${state.user.display_name || state.user.username}</div>
                    <div class="user-role">${state.user.role.toUpperCase()}</div>
                </div>
                <div id="logout-button" class="logout-btn" title="${t('logout')}">
                    <i class="fa-solid fa-power-off"></i>
                </div>
            </div>
        </div>
    `;

    document.getElementById('logout-button').addEventListener('click', handleLogout);
}

function renderTopbar() {
    const topbar = document.getElementById('topbar-container');
    if (!topbar || !state.user) return;

    // Build breadcrumbs depending on currentRoute
    const pathParts = state.currentRoute.split('/').filter(Boolean);
    const breadcrumbsHtml = `
        <span class="breadcrumb-item"><i class="fa-solid fa-house-chimney"></i></span>
        <span class="breadcrumb-separator"><i class="fa-solid fa-chevron-right"></i></span>
        <span class="breadcrumb-item active">${t(pathParts[0]) || pathParts[0]}</span>
    `;

    topbar.innerHTML = `
        <div class="breadcrumbs">${breadcrumbsHtml}</div>
        <div class="topbar-controls">
            <button id="lang-toggle-btn" class="lang-toggle">${t('langLabel')}</button>
            <a href="/" target="_blank" class="btn"><i class="fa-solid fa-square-arrow-up-right"></i> <span>${t('viewSite')}</span></a>
            <div class="system-status">
                <div class="status-indicator"></div>
                <span>${t('systemOnline')}</span>
            </div>
        </div>
    `;

    document.getElementById('lang-toggle-btn').addEventListener('click', () => {
        setLanguage(state.lang === 'en' ? 'ar' : 'en');
    });
}

// Logout handler
async function handleLogout() {
    try {
        await adminFetch('/api/admin/logout', { method: 'POST' });
        showToast('Logged out successfully', 'info');
        state.user = null;
        document.getElementById('app-container').classList.add('hidden');
        window.location.hash = '#/login';
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

// ═══════════════════════════════════════════════════
// SPA Routing & Navigation Engine
// ═══════════════════════════════════════════════════

const routes = {
    'login': () => import('./pages/login.js'),
    'dashboard': () => import('./pages/dashboard.js'),
    'categories': () => import('./pages/categories.js'),
    'products': () => import('./pages/products.js'),
    'merge': () => import('./pages/merge.js'),
    'scrapers': () => import('./pages/scrapers.js'),
    'stores': () => import('./pages/stores.js'),
    'database': () => import('./pages/database.js'),
    'feature-flags': () => import('./pages/feature-flags.js'),
    'analytics': () => import('./pages/analytics.js'),
    'settings': () => import('./pages/settings.js')
};

export async function navigate(hash, forceRerender = false) {
    let cleanHash = hash.replace(/^#\/?/, '') || 'dashboard';
    
    // Handle parameterized routes (e.g. products/edit/1)
    const routeParts = cleanHash.split('/');
    const baseRoute = routeParts[0];

    if (state.currentRoute === cleanHash && !forceRerender) return;

    state.currentRoute = cleanHash;

    const loader = document.getElementById('global-loader');
    if (loader) loader.classList.remove('hidden');

    try {
        // If not logged in and not heading to login, check user session
        if (!state.user && baseRoute !== 'login') {
            try {
                const res = await adminFetch('/api/admin/me');
                if (res.success && res.user) {
                    state.user = res.user;
                    renderSidebar();
                    renderTopbar();
                    document.getElementById('app-container').classList.remove('hidden');
                } else {
                    window.location.hash = '#/login';
                    return;
                }
            } catch (err) {
                window.location.hash = '#/login';
                return;
            }
        }

        // Handle page rendering
        if (baseRoute === 'login') {
            document.getElementById('app-container').classList.add('hidden');
            const pageModule = await routes['login']();
            const outlet = document.body;
            
            // Check if login wrapper already exists in body
            let loginWrapper = document.getElementById('login-page-wrapper');
            if (!loginWrapper) {
                loginWrapper = document.createElement('div');
                loginWrapper.id = 'login-page-wrapper';
                loginWrapper.className = 'login-wrapper';
                document.body.appendChild(loginWrapper);
            }
            loginWrapper.classList.remove('hidden');
            
            // Render login page
            await pageModule.render(loginWrapper);
        } else {
            // Remove login wrapper if it exists
            const loginWrapper = document.getElementById('login-page-wrapper');
            if (loginWrapper) loginWrapper.classList.add('hidden');

            document.getElementById('app-container').classList.remove('hidden');
            
            // Load and render page module
            const loadModule = routes[baseRoute];
            if (!loadModule) {
                throw new Error(`Route "${baseRoute}" not found.`);
            }

            const pageModule = await loadModule();
            const outlet = document.getElementById('app-content');
            outlet.innerHTML = ''; // Clear previous content
            
            // Render sidebar highlights
            renderSidebar();
            renderTopbar();

            // Run rendering code for page
            await pageModule.render(outlet, ...routeParts.slice(1));
        }
    } catch (err) {
        console.error('Routing failed:', err);
        showToast(err.message, 'danger');
        
        // Render 404 / Error State in Main Content
        const outlet = document.getElementById('app-content');
        if (outlet && baseRoute !== 'login') {
            outlet.innerHTML = `
                <div class="card" style="text-align: center; padding: 50px;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 48px; color: var(--danger); margin-bottom: 20px;"></i>
                    <h2>Failed to load view</h2>
                    <p style="color: var(--text-secondary); margin-top: 10px;">${err.message}</p>
                    <button class="btn btn-primary" style="margin-top: 20px;" onclick="window.location.reload()">Reload Operations</button>
                </div>
            `;
        }
    } finally {
        if (loader) loader.classList.add('hidden');
    }
}

// ═══════════════════════════════════════════════════
// App Bootstrapping
// ═══════════════════════════════════════════════════

window.addEventListener('hashchange', () => {
    navigate(window.location.hash);
});

// App Startup Initializer
async function bootstrap() {
    // Set proper dir and lang
    setLanguage(state.lang);

    // Initial navigation
    await navigate(window.location.hash);
}

// Start application
document.addEventListener('DOMContentLoaded', bootstrap);

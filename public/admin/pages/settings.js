/**
 * Settings & Console Administration Page
 * =====================================
 * Handles personal profile password updates, user accounts CRUD,
 * Role-Based Access Control (RBAC) assignments, and dynamic Audit logs.
 */

import { adminFetch, showToast, state } from '../admin.js';

const settingsTranslations = {
    en: {
        title: "Console Settings & Administration",
        desc: "Manage personal security credentials, create or toggle administrator accounts, and inspect auditing trails.",
        tabProfile: "My Account",
        tabAdmins: "Console Administrators",
        tabAudit: "Audit Trail",

        // Profile Form
        currentPassword: "Current Password",
        newPassword: "New Password",
        confirmPassword: "Confirm New Password",
        changePasswordBtn: "Change Password",
        mismatchPassword: "New passwords do not match",

        // Admins Management
        addAdmin: "Create Administrator",
        username: "Username",
        displayName: "Display Name",
        role: "Access Role",
        status: "Active Status",
        actions: "Actions",
        lastLogin: "Last Login",
        created: "Created At",
        deleteUser: "Delete Account",
        selfLabel: "You",
        restrictedSuperAdmin: "Restricted to Super Administrators",
        confirmDeleteUser: "Are you sure you want to delete this administrator account? This action is permanent.",

        // Audit Trail
        auditTime: "Date & Time",
        auditActor: "Administrator",
        auditAction: "Action",
        auditResource: "Resource Target",
        auditIp: "Client IP",
        auditDetails: "Details Metadata",
        noAudits: "No administrative audit log entries found.",
        emptyUsers: "No administrator users found.",

        // System notifications
        successPassword: "Password updated successfully.",
        successCreateUser: "Administrator account created successfully.",
        successUpdateUser: "User details updated successfully.",
        successDeleteUser: "User account deleted successfully."
    },
    ar: {
        title: "إعدادات لوحة التحكم والإدارة",
        desc: "تحديث كلمات المرور الشخصية، وإدارة حسابات المشرفين، وتحديد الأدوار (RBAC)، ومراقبة سجل العمليات.",
        tabProfile: "حسابي الشخصي",
        tabAdmins: "مشرفي النظام",
        tabAudit: "سجل العمليات (Audit Trail)",

        // Profile Form
        currentPassword: "كلمة المرور الحالية",
        newPassword: "كلمة المرور الجديدة",
        confirmPassword: "تأكيد كلمة المرور الجديدة",
        changePasswordBtn: "تحديث كلمة المرور",
        mismatchPassword: "كلمات المرور الجديدة غير متطابقة",

        // Admins Management
        addAdmin: "إنشاء حساب مشرف جديد",
        username: "اسم المستخدم",
        displayName: "الاسم المعروض",
        role: "الدور والصلاحيات",
        status: "حالة الحساب",
        actions: "الإجراءات",
        lastLogin: "آخر دخول",
        created: "تاريخ الإنشاء",
        deleteUser: "حذف الحساب",
        selfLabel: "أنت",
        restrictedSuperAdmin: "مقتصر على المشرفين الرئيسيين (Super Admin)",
        confirmDeleteUser: "هل أنت متأكد من رغبتك في حذف حساب المشرف هذا؟ هذا الإجراء نهائي.",

        // Audit Trail
        auditTime: "التاريخ والوقت",
        auditActor: "المشرف",
        auditAction: "العملية المنفذة",
        auditResource: "الهدف والنوع",
        auditIp: "عنوان الـ IP",
        auditDetails: "بيانات تفصيلية",
        noAudits: "لا توجد سجلات عمليات مسجلة حالياً.",
        emptyUsers: "لا يوجد مشرفين مسجلين.",

        // System notifications
        successPassword: "تم تحديث كلمة المرور بنجاح.",
        successCreateUser: "تم إنشاء حساب المشرف بنجاح.",
        successUpdateUser: "تم تحديث بيانات المشرف بنجاح.",
        successDeleteUser: "تم حذف حساب المشرف بنجاح."
    }
};

function st(key) {
    const lang = state.lang || 'en';
    return (settingsTranslations[lang] && settingsTranslations[lang][key]) || settingsTranslations.en[key] || key;
}

let activeTab = 'profile'; // 'profile' | 'admins' | 'audit'

export async function render(container) {
    container.innerHTML = `
        <style>
            .settings-tabs {
                display: flex;
                gap: 8px;
                margin-top: 20px;
                margin-bottom: 24px;
                border-bottom: 1px solid var(--border-base);
                padding-bottom: 1px;
            }
            .settings-tab-btn {
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
            .settings-tab-btn:hover {
                color: var(--text-primary);
            }
            .settings-tab-btn.active {
                color: var(--primary);
                border-bottom-color: var(--primary);
            }
            .settings-panel {
                min-height: 350px;
            }
            .admins-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
                gap: 20px;
            }
            .user-card {
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid var(--border-base);
                border-radius: var(--radius-md);
                padding: 20px;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                position: relative;
                transition: transform 0.2s ease;
            }
            .user-card:hover {
                transform: translateY(-2px);
                border-color: rgba(255, 255, 255, 0.12);
            }
            .audit-row-expandable {
                cursor: pointer;
            }
            .audit-details-block {
                display: none;
                background: rgba(0, 0, 0, 0.4);
                border-radius: var(--radius-sm);
                padding: 12px;
                margin-top: 8px;
                font-family: var(--font-mono);
                font-size: 11px;
                white-space: pre-wrap;
                color: #e2e8f0;
                border: 1px solid rgba(255,255,255,0.05);
            }
        </style>

        <div>
            <h1 style="font-size: 24px; font-weight: 700; background: linear-gradient(to right, #fff, #94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                ${st('title')}
            </h1>
            <p style="font-size: 13px; color: var(--text-secondary);">${st('desc')}</p>

            <div class="settings-tabs">
                <button class="settings-tab-btn ${activeTab === 'profile' ? 'active' : ''}" data-tab="profile">
                    <i class="fa-solid fa-user-lock"></i> ${st('tabProfile')}
                </button>
                <button class="settings-tab-btn ${activeTab === 'admins' ? 'active' : ''}" data-tab="admins">
                    <i class="fa-solid fa-users-gear"></i> ${st('tabAdmins')}
                </button>
                <button class="settings-tab-btn ${activeTab === 'audit' ? 'active' : ''}" data-tab="audit">
                    <i class="fa-solid fa-clipboard-list"></i> ${st('tabAudit')}
                </button>
            </div>

            <div class="settings-panel" id="settings-panel-container">
                <!-- Panel content injected here -->
            </div>
        </div>

        <!-- Modals container -->
        <div id="settings-modal-outlet"></div>
    `;

    // Bind Tabs clicks
    container.querySelectorAll('.settings-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            activeTab = btn.dataset.tab;
            container.querySelectorAll('.settings-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderActiveTabPanel();
        });
    });

    // Render active tab panel
    await renderActiveTabPanel();
}

async function renderActiveTabPanel() {
    const container = document.getElementById('settings-panel-container');
    if (!container) return;

    container.innerHTML = `<div style="text-align: center; padding: 40px; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>`;

    try {
        if (activeTab === 'profile') {
            renderProfileTab(container);
        } else if (activeTab === 'admins') {
            await renderAdminsTab(container);
        } else if (activeTab === 'audit') {
            await renderAuditTab(container);
        }
    } catch (err) {
        container.innerHTML = `
            <div class="card" style="text-align: center; padding: 40px; color: var(--danger);">
                <i class="fa-solid fa-circle-exclamation fa-2x"></i>
                <p style="margin-top: 12px;">Failed to load settings data: ${err.message}</p>
            </div>
        `;
    }
}

// ═══════════════════════════════════════════════════
// TAB 1: MY ACCOUNT PROFILE
// ═══════════════════════════════════════════════════

function renderProfileTab(container) {
    container.innerHTML = `
        <div class="card" style="max-width: 480px;">
            <div class="card-header">
                <div class="card-title"><i class="fa-solid fa-key"></i> Security Credentials</div>
            </div>
            
            <form id="change-password-form" style="display: flex; flex-direction: column; gap: 16px;">
                <div class="form-group">
                    <label class="form-label">${st('currentPassword')}</label>
                    <input type="password" id="profile-current-password" class="form-control" required>
                </div>
                <div class="form-group">
                    <label class="form-label">${st('newPassword')}</label>
                    <input type="password" id="profile-new-password" class="form-control" minlength="6" required>
                </div>
                <div class="form-group">
                    <label class="form-label">${st('confirmPassword')}</label>
                    <input type="password" id="profile-confirm-password" class="form-control" minlength="6" required>
                </div>

                <button type="submit" class="btn btn-primary" style="margin-top: 8px;">
                    <i class="fa-solid fa-shield-halved"></i> ${st('changePasswordBtn')}
                </button>
            </form>
        </div>
    `;

    document.getElementById('change-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const currentPassword = document.getElementById('profile-current-password').value;
        const newPassword = document.getElementById('profile-new-password').value;
        const confirmPassword = document.getElementById('profile-confirm-password').value;

        if (newPassword !== confirmPassword) {
            showToast(st('mismatchPassword'), 'danger');
            return;
        }

        try {
            await adminFetch('/api/admin/change-password', {
                method: 'POST',
                body: { currentPassword, newPassword }
            });
            showToast(st('successPassword'), 'success');
            // Clear fields
            document.getElementById('profile-current-password').value = '';
            document.getElementById('profile-new-password').value = '';
            document.getElementById('profile-confirm-password').value = '';
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });
}

// ═══════════════════════════════════════════════════
// TAB 2: CONSOLE ADMINISTRATORS
// ═══════════════════════════════════════════════════

async function renderAdminsTab(container) {
    const res = await adminFetch('/api/admin/users');
    const users = res.users || [];

    const isSuperAdmin = state.user && state.user.role === 'super_admin';

    container.innerHTML = `
        <div style="margin-bottom: 16px; display: flex; justify-content: flex-end;">
            <button id="create-user-btn" class="btn btn-primary btn-sm" ${!isSuperAdmin ? 'disabled title="' + st('restrictedSuperAdmin') + '" style="opacity: 0.5;"' : ''}>
                <i class="fa-solid fa-plus"></i> ${st('addAdmin')}
            </button>
        </div>

        <div class="admins-grid">
            ${users.length === 0 ? `<div style="grid-column: 1/-1; text-align:center; color:var(--text-muted);">${st('emptyUsers')}</div>` : users.map(user => {
                const isSelf = state.user && state.user.id === user.id;
                const isUserActive = user.is_active === 1;

                return `
                    <div class="user-card" style="border: ${isSelf ? '1px solid var(--primary-light)' : '1px solid var(--border-base)'}">
                        ${isSelf ? `<span style="position: absolute; top: 12px; right: 12px; font-size: 10px; font-weight:700; background:var(--primary); color:#000; padding:2px 6px; border-radius:3px;">${st('selfLabel')}</span>` : ''}
                        
                        <div>
                            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 14px;">
                                <div style="font-size: 20px; color: var(--text-secondary);"><i class="fa-solid fa-user-circle"></i></div>
                                <div>
                                    <h3 style="font-size: 14px; font-weight: 700; color: #fff;">${user.display_name || user.username}</h3>
                                    <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary);">@${user.username}</span>
                                </div>
                            </div>

                            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px; margin-bottom: 16px;">
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="color: var(--text-secondary);">${st('role')}</span>
                                    <span class="badge ${user.role === 'super_admin' ? 'badge-success' : user.role === 'editor' ? 'badge-info' : 'badge-secondary'}" style="font-size:10px;">
                                        ${user.role.toUpperCase()}
                                    </span>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="color: var(--text-secondary);">${st('status')}</span>
                                    <div class="form-check form-switch" style="padding: 0; margin: 0; display: inline-flex; align-items: center;">
                                        <input class="form-check-input user-toggle-active" type="checkbox" data-id="${user.id}" ${isUserActive ? 'checked' : ''} ${!isSuperAdmin || isSelf ? 'disabled' : ''}>
                                    </div>
                                </div>
                                <div style="display: flex; justify-content: space-between;">
                                    <span style="color: var(--text-secondary);">${st('lastLogin')}</span>
                                    <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">
                                        ${user.last_login ? new Date(user.last_login).toLocaleString([], {hour: '2-digit', minute:'2-digit', month:'numeric', day:'numeric'}) : '--'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div style="display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 12px;">
                            ${isSuperAdmin ? `
                                <button class="btn btn-sm edit-user-btn" data-id="${user.id}">
                                    <i class="fa-solid fa-user-pen"></i> Edit
                                </button>
                                ${!isSelf ? `
                                    <button class="btn btn-sm btn-danger delete-user-btn" data-id="${user.id}">
                                        <i class="fa-solid fa-trash-can"></i>
                                    </button>
                                ` : ''}
                            ` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    // Bind Create Admin accounts
    if (isSuperAdmin) {
        document.getElementById('create-user-btn').addEventListener('click', openCreateAdminModal);

        // Bind Active Toggles
        container.querySelectorAll('.user-toggle-active').forEach(sw => {
            sw.addEventListener('change', async () => {
                const id = sw.dataset.id;
                const checked = sw.checked;
                try {
                    await adminFetch(`/api/admin/users/${id}`, {
                        method: 'PUT',
                        body: { is_active: checked }
                    });
                    showToast(st('successUpdateUser'), 'success');
                } catch (err) {
                    sw.checked = !checked;
                    showToast(err.message, 'danger');
                }
            });
        });

        // Bind Edit buttons
        container.querySelectorAll('.edit-user-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const user = users.find(u => u.id === parseInt(id));
                openEditUserModal(user);
            });
        });

        // Bind Delete buttons
        container.querySelectorAll('.delete-user-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                deleteUserAccount(id);
            });
        });
    }
}

function openCreateAdminModal() {
    const modalOutlet = document.getElementById('settings-modal-outlet');
    modalOutlet.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal" style="max-width: 500px; display: block;">
            <div class="modal-header">
                <h3>${st('addAdmin')}</h3>
                <button class="modal-close-x"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">${st('username')}</label>
                    <input type="text" id="new-user-username" class="form-control" placeholder="e.g. jdoe" required>
                </div>
                <div class="form-group">
                    <label class="form-label">${st('displayName')}</label>
                    <input type="text" id="new-user-displayname" class="form-control" placeholder="e.g. John Doe">
                </div>
                <div class="form-group">
                    <label class="form-label">Password</label>
                    <input type="password" id="new-user-password" class="form-control" minlength="6" required>
                </div>
                <div class="form-group">
                    <label class="form-label">${st('role')}</label>
                    <select id="new-user-role" class="form-control">
                        <option value="viewer">Viewer (Read-only)</option>
                        <option value="editor">Editor (Modify database, Scrapers)</option>
                        <option value="super_admin">Super Administrator (Full config access)</option>
                    </select>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary modal-close-btn">Cancel</button>
                <button class="btn btn-primary" id="save-new-user-btn">Create Account</button>
            </div>
        </div>
    `;

    const closeModal = () => modalOutlet.innerHTML = '';
    modalOutlet.querySelector('.modal-close-x').addEventListener('click', closeModal);
    modalOutlet.querySelector('.modal-close-btn').addEventListener('click', closeModal);

    modalOutlet.querySelector('#save-new-user-btn').addEventListener('click', async () => {
        const username = modalOutlet.querySelector('#new-user-username').value.trim();
        const display_name = modalOutlet.querySelector('#new-user-displayname').value.trim();
        const password = modalOutlet.querySelector('#new-user-password').value;
        const role = modalOutlet.querySelector('#new-user-role').value;

        if (!username || !password) {
            showToast('Username and Password are required', 'danger');
            return;
        }

        try {
            await adminFetch('/api/admin/users', {
                method: 'POST',
                body: { username, password, role, display_name }
            });
            showToast(st('successCreateUser'), 'success');
            closeModal();
            await renderActiveTabPanel();
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });
}

function openEditUserModal(user) {
    const isSelf = state.user && state.user.id === user.id;

    const modalOutlet = document.getElementById('settings-modal-outlet');
    modalOutlet.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal" style="max-width: 500px; display: block;">
            <div class="modal-header">
                <h3>Modify User details: @${user.username}</h3>
                <button class="modal-close-x"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label class="form-label">${st('displayName')}</label>
                    <input type="text" id="edit-user-displayname" class="form-control" value="${user.display_name || ''}">
                </div>
                <div class="form-group">
                    <label class="form-label">${st('role')}</label>
                    <select id="edit-user-role" class="form-control" ${isSelf ? 'disabled' : ''}>
                        <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>Viewer (Read-only)</option>
                        <option value="editor" ${user.role === 'editor' ? 'selected' : ''}>Editor (Modify database, Scrapers)</option>
                        <option value="super_admin" ${user.role === 'super_admin' ? 'selected' : ''}>Super Administrator (Full config access)</option>
                    </select>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary modal-close-btn">Cancel</button>
                <button class="btn btn-primary" id="save-edit-user-btn">Save details</button>
            </div>
        </div>
    `;

    const closeModal = () => modalOutlet.innerHTML = '';
    modalOutlet.querySelector('.modal-close-x').addEventListener('click', closeModal);
    modalOutlet.querySelector('.modal-close-btn').addEventListener('click', closeModal);

    modalOutlet.querySelector('#save-edit-user-btn').addEventListener('click', async () => {
        const display_name = modalOutlet.querySelector('#edit-user-displayname').value.trim();
        const role = modalOutlet.querySelector('#edit-user-role').value;

        try {
            await adminFetch(`/api/admin/users/${user.id}`, {
                method: 'PUT',
                body: { display_name, role }
            });
            showToast(st('successUpdateUser'), 'success');
            closeModal();
            await renderActiveTabPanel();
        } catch (err) {
            showToast(err.message, 'danger');
        }
    });
}

async function deleteUserAccount(id) {
    if (!confirm(st('confirmDeleteUser'))) return;

    try {
        await adminFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
        showToast(st('successDeleteUser'), 'success');
        await renderActiveTabPanel();
    } catch (err) {
        showToast(err.message, 'danger');
    }
}

// ═══════════════════════════════════════════════════
// TAB 3: AUDIT TRAIL LOGS
// ═══════════════════════════════════════════════════

async function renderAuditTab(container) {
    const res = await adminFetch('/api/admin/audit-logs?limit=50');
    const logs = res.logs || [];

    container.innerHTML = `
        <div class="card">
            <div class="card-header">
                <div class="card-title"><i class="fa-solid fa-list"></i> System Operations Audit Log</div>
            </div>
            
            <div class="table-wrapper" style="max-height: 480px; overflow-y: auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th style="width: 140px;">${st('auditTime')}</th>
                            <th style="width: 130px;">${st('auditActor')}</th>
                            <th>${st('auditAction')}</th>
                            <th style="width: 130px;">${st('auditResource')}</th>
                            <th style="width: 110px;">${st('auditIp')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${logs.length === 0 ? `
                            <tr>
                                <td colspan="5" style="text-align: center; color: var(--text-secondary); padding: 30px;">
                                    ${st('noAudits')}
                                </td>
                            </tr>
                        ` : logs.map(log => {
                            const date = new Date(log.created_at);
                            const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                            
                            // Parse detail JSON to display nicely inside details expanding block
                            let detailsHtml = '';
                            if (log.details) {
                                try {
                                    const parsed = JSON.parse(log.details);
                                    detailsHtml = JSON.stringify(parsed, null, 2);
                                } catch (e) {
                                    detailsHtml = log.details;
                                }
                            }

                            return `
                                <tr class="audit-row-expandable" data-id="${log.id}">
                                    <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary);">
                                        ${dateStr}
                                    </td>
                                    <td style="font-weight: 600; color: #fff;">
                                        ${log.display_name || log.username || 'System'}
                                    </td>
                                    <td style="font-family: var(--font-mono); font-size: 11px; color: var(--primary-light);">
                                        ${log.action}
                                    </td>
                                    <td>
                                        ${log.resource_type ? `
                                            <span class="badge badge-secondary" style="font-size: 9px; font-weight:700;">
                                                ${log.resource_type.toUpperCase()}
                                            </span>
                                            ${log.resource_id ? `<span style="font-family:var(--font-mono); font-size:10px; color:var(--text-secondary);">#${log.resource_id}</span>` : ''}
                                        ` : '--'}
                                    </td>
                                    <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary);">
                                        ${log.ip_address || '::1'}
                                    </td>
                                </tr>
                                ${log.details ? `
                                    <tr class="details-row" id="audit-details-row-${log.id}" style="display: none;">
                                        <td colspan="5" style="padding: 0 16px 12px;">
                                            <div class="audit-details-block">${detailsHtml}</div>
                                        </td>
                                    </tr>
                                ` : ''}
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // Bind expandable logic
    container.querySelectorAll('.audit-row-expandable').forEach(row => {
        row.addEventListener('click', () => {
            const id = row.dataset.id;
            const detailsRow = document.getElementById(`audit-details-row-${id}`);
            if (detailsRow) {
                const isHidden = detailsRow.style.display === 'none';
                detailsRow.style.display = isHidden ? 'table-row' : 'none';
                
                const block = detailsRow.querySelector('.audit-details-block');
                if (block) block.style.display = isHidden ? 'block' : 'none';
            }
        });
    });
}

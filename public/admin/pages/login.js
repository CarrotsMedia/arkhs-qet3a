/**
 * Login Page Module
 * =================
 * Renders and controls the operations console login screen.
 */

import { adminFetch, showToast, state, t } from '../admin.js';

export async function render(container) {
    // If user is already authenticated, redirect to dashboard immediately
    if (state.user) {
        window.location.hash = '#/dashboard';
        return;
    }

    container.innerHTML = `
        <div class="login-box">
            <div class="login-header">
                <div class="login-logo">
                    <i class="fa-solid fa-shield-halved" style="color: #ffffff;"></i>
                </div>
                <h2 class="login-title">${t('appName')}</h2>
                <p class="login-subtitle">Operations Management Console</p>
            </div>
            
            <form id="login-form">
                <div class="form-group">
                    <label class="form-label" for="username">Username</label>
                    <div class="input-wrapper">
                        <i class="fa-solid fa-user input-icon"></i>
                        <input class="form-input" type="text" id="username" name="username" placeholder="Username" required autocomplete="username">
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 24px;">
                    <label class="form-label" for="password">Password</label>
                    <div class="input-wrapper">
                        <i class="fa-solid fa-lock input-icon"></i>
                        <input class="form-input" type="password" id="password" name="password" placeholder="••••••••" required autocomplete="current-password">
                    </div>
                </div>

                <button type="submit" id="login-submit" class="btn btn-primary btn-block">
                    <span>Sign In</span>
                </button>
            </form>
        </div>
    `;

    const form = document.getElementById('login-form');
    form.addEventListener('submit', handleLoginSubmit);
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('login-submit');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');

    const originalHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.classList.add('btn-loading');
    submitBtn.innerHTML = `<div class="btn-loading-spinner"></div>`;

    try {
        const res = await adminFetch('/api/admin/login', {
            method: 'POST',
            body: {
                username: usernameInput.value,
                password: passwordInput.value
            }
        });

        if (res.success && res.user) {
            state.user = res.user;
            showToast(`${t('welcomeBack')}, ${res.user.display_name}!`, 'success');
            
            // Redirect to dashboard
            window.location.hash = '#/dashboard';
        }
    } catch (err) {
        showToast(err.message || 'Login failed', 'danger');
    } finally {
        submitBtn.disabled = false;
        submitBtn.classList.remove('btn-loading');
        submitBtn.innerHTML = originalHtml;
    }
}

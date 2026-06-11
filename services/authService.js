/**
 * Auth Service
 * ============
 * Handles admin authentication, password hashing, session management,
 * and role-based access control.
 *
 * Follows the existing service constructor pattern (takes `db` param).
 * Passwords are hashed with Node's built-in crypto.scryptSync (128-bit salt, 256-bit key).
 * Sessions are stored in SQLite for persistence across server restarts.
 */

const crypto = require('crypto');

// Role hierarchy: super_admin > editor > viewer
const ROLE_HIERARCHY = {
    super_admin: 3,
    editor: 2,
    viewer: 1
};

class AuthService {
    constructor(db) {
        this.db = db;
        this.initializeTables();
        this.seedDefaultAdmin();
    }

    // ═══════════════════════════════════════════════════
    // Schema Initialization
    // ═══════════════════════════════════════════════════

    async initializeTables() {
        await this.db.exec(`
            CREATE TABLE IF NOT EXISTS admin_users (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                username        TEXT UNIQUE NOT NULL,
                password_hash   TEXT NOT NULL,
                salt            TEXT NOT NULL,
                role            TEXT NOT NULL DEFAULT 'viewer',
                display_name    TEXT,
                is_active       INTEGER DEFAULT 1,
                last_login      TEXT,
                created_at      TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS admin_sessions (
                sid         TEXT PRIMARY KEY,
                admin_id    INTEGER NOT NULL REFERENCES admin_users(id),
                data        TEXT NOT NULL DEFAULT '{}',
                expires_at  INTEGER NOT NULL,
                created_at  TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS admin_audit_log (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_id        INTEGER REFERENCES admin_users(id),
                action          TEXT NOT NULL,
                resource_type   TEXT,
                resource_id     TEXT,
                details         TEXT,
                ip_address      TEXT,
                created_at      TEXT DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_expires ON admin_sessions (expires_at);
            CREATE INDEX IF NOT EXISTS idx_audit_admin ON admin_audit_log (admin_id);
            CREATE INDEX IF NOT EXISTS idx_audit_created ON admin_audit_log (created_at);
        `);
    }

    /**
     * Seed a default super_admin user if no admin users exist.
     * Default credentials: admin / dawarly2024
     */
    async seedDefaultAdmin() {
        const count = await this.db.prepare('SELECT COUNT(*) as count FROM admin_users').get().count;
        if (count === 0) {
            await this.createUser('admin', 'dawarly2024', 'super_admin', 'System Administrator');
            console.log('🔑 Default admin user created (admin / dawarly2024) — change this password immediately!');
        }
    }

    // ═══════════════════════════════════════════════════
    // Password Hashing
    // ═══════════════════════════════════════════════════

    /**
     * Hash a password using scryptSync with a random 128-bit salt.
     * Returns { hash, salt } as hex strings.
     */
    async hashPassword(password) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.scryptSync(password, salt, 32).toString('hex');
        return { hash, salt };
    }

    /**
     * Verify a password against stored hash and salt.
     */
    async verifyPassword(password, storedHash, storedSalt) {
        const hash = crypto.scryptSync(password, storedSalt, 32).toString('hex');
        return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
    }

    // ═══════════════════════════════════════════════════
    // User Management
    // ═══════════════════════════════════════════════════

    /**
     * Create a new admin user.
     * @returns The created user object (without password fields).
     */
    async createUser(username, password, role = 'viewer', displayName = null) {
        if (!username || !password) {
            throw new Error('Username and password are required');
        }
        if (!ROLE_HIERARCHY[role]) {
            throw new Error(`Invalid role: ${role}. Must be one of: ${Object.keys(ROLE_HIERARCHY).join(', ')}`);
        }
        if (password.length < 6) {
            throw new Error('Password must be at least 6 characters');
        }

        const { hash, salt } = await this.hashPassword(password);

        const result = await this.db.prepare(`
            INSERT INTO admin_users (username, password_hash, salt, role, display_name)
            VALUES (?, ?, ?, ?, ?)
        `).run(username, hash, salt, role, displayName || username);

        return await this.getUserById(result.lastInsertRowid);
    }

    /**
     * Get a user by ID (safe — no password fields).
     */
    async getUserById(id) {
        const user = await this.db.prepare(`
            SELECT id, username, role, display_name, is_active, last_login, created_at
            FROM admin_users WHERE id = ?
        `).get(id);
        return user || null;
    }

    /**
     * Get a user by username (internal — includes password fields).
     */
    async _getUserByUsername(username) {
        return await this.db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
    }

    /**
     * List all admin users (safe — no password fields).
     */
    async getAllUsers() {
        return await this.db.prepare(`
            SELECT id, username, role, display_name, is_active, last_login, created_at
            FROM admin_users ORDER BY id ASC
        `).all();
    }

    /**
     * Change a user's password.
     */
    async changePassword(userId, currentPassword, newPassword) {
        const user = await this.db.prepare('SELECT * FROM admin_users WHERE id = ?').get(userId);
        if (!user) throw new Error('User not found');

        if (!await this.verifyPassword(currentPassword, user.password_hash, user.salt)) {
            throw new Error('Current password is incorrect');
        }

        if (newPassword.length < 6) {
            throw new Error('New password must be at least 6 characters');
        }

        const { hash, salt } = await this.hashPassword(newPassword);
        await this.db.prepare('UPDATE admin_users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, userId);

        return true;
    }

    // ═══════════════════════════════════════════════════
    // Authentication
    // ═══════════════════════════════════════════════════

    /**
     * Authenticate admin credentials.
     * @returns User object (safe) or null if authentication fails.
     */
    async authenticate(username, password) {
        const user = await this._getUserByUsername(username);
        if (!user) return null;
        if (!user.is_active) return null;

        if (!await this.verifyPassword(password, user.password_hash, user.salt)) {
            return null;
        }

        // Update last_login
        this.db.prepare('UPDATE admin_users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id);

        return await this.getUserById(user.id);
    }

    // ═══════════════════════════════════════════════════
    // Session Management (SQLite-backed)
    // ═══════════════════════════════════════════════════

    /**
     * Create a new session.
     * @param {number} adminId - Admin user ID
     * @param {number} ttlMs - Session TTL in milliseconds (default 24h)
     * @returns {{ sid: string, expiresAt: number }}
     */
    async createSession(adminId, ttlMs = 24 * 60 * 60 * 1000) {
        const sid = crypto.randomBytes(32).toString('hex');
        const expiresAt = Date.now() + ttlMs;

        await this.db.prepare(`
            INSERT INTO admin_sessions (sid, admin_id, expires_at)
            VALUES (?, ?, ?)
        `).run(sid, adminId, expiresAt);

        return { sid, expiresAt };
    }

    /**
     * Validate a session and return the associated user.
     * Automatically cleans up expired sessions.
     * @returns User object or null if session is invalid/expired.
     */
    async validateSession(sid) {
        if (!sid) return null;

        const session = await this.db.prepare(`
            SELECT s.admin_id, s.expires_at, u.id, u.username, u.role, u.display_name, u.is_active
            FROM admin_sessions s
            JOIN admin_users u ON s.admin_id = u.id
            WHERE s.sid = ?
        `).get(sid);

        if (!session) return null;

        // Check expiry
        if (Date.now() > session.expires_at) {
            await this.destroySession(sid);
            return null;
        }

        // Check user is still active
        if (!session.is_active) {
            await this.destroySession(sid);
            return null;
        }

        return {
            id: session.id,
            username: session.username,
            role: session.role,
            display_name: session.display_name
        };
    }

    /**
     * Destroy a session (logout).
     */
    async destroySession(sid) {
        await this.db.prepare('DELETE FROM admin_sessions WHERE sid = ?').run(sid);
    }

    /**
     * Clean up all expired sessions.
     */
    async cleanupExpiredSessions() {
        const result = await this.db.prepare('DELETE FROM admin_sessions WHERE expires_at < ?').run(Date.now());
        return result.changes;
    }

    // ═══════════════════════════════════════════════════
    // Role Checking
    // ═══════════════════════════════════════════════════

    /**
     * Check if a user's role meets the minimum required role level.
     * @param {string} userRole - The user's current role
     * @param {string} requiredRole - The minimum role required
     * @returns {boolean}
     */
    async hasRole(userRole, requiredRole) {
        const userLevel = ROLE_HIERARCHY[userRole] || 0;
        const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
        return userLevel >= requiredLevel;
    }

    // ═══════════════════════════════════════════════════
    // Audit Logging
    // ═══════════════════════════════════════════════════

    /**
     * Log an admin action to the audit trail.
     */
    async logAction(adminId, action, resourceType = null, resourceId = null, details = null, ipAddress = null) {
        await this.db.prepare(`
            INSERT INTO admin_audit_log (admin_id, action, resource_type, resource_id, details, ip_address)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            adminId,
            action,
            resourceType,
            resourceId,
            details ? JSON.stringify(details) : null,
            ipAddress
        );
    }

    /**
     * Get recent audit log entries.
     */
    async getAuditLog(limit = 50, offset = 0) {
        return await this.db.prepare(`
            SELECT al.*, au.username, au.display_name
            FROM admin_audit_log al
            LEFT JOIN admin_users au ON al.admin_id = au.id
            ORDER BY al.created_at DESC
            LIMIT ? OFFSET ?
        `).all(limit, offset);
    }

    /**
     * Update an admin user profile (role, display_name, is_active status)
     */
    async updateUser(id, data = {}) {
        const fields = [];
        const values = [];

        if (data.role !== undefined) {
            if (!ROLE_HIERARCHY[data.role]) {
                throw new Error(`Invalid role: ${data.role}`);
            }
            fields.push('role = ?');
            values.push(data.role);
        }

        if (data.display_name !== undefined) {
            fields.push('display_name = ?');
            values.push(data.display_name);
        }

        if (data.is_active !== undefined) {
            fields.push('is_active = ?');
            values.push(data.is_active ? 1 : 0);
        }

        if (fields.length === 0) return await this.getUserById(id);

        values.push(id);
        await this.db.prepare(`
            UPDATE admin_users
            SET ${fields.join(', ')}
            WHERE id = ?
        `).run(...values);

        return await this.getUserById(id);
    }

    /**
     * Delete an admin user account
     */
    async deleteUser(id) {
        const result = await this.db.prepare('DELETE FROM admin_users WHERE id = ?').run(id);
        return result.changes > 0;
    }
}

module.exports = AuthService;

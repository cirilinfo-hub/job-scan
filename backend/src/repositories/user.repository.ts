import { RowDataPacket } from 'mysql2';
import { Executor, exec, one, pool, query } from '../config/db';

export interface UserRow extends RowDataPacket {
  id: number; email: string; password_hash: string; full_name: string; email_verified_at: Date | null;
  status: 'active' | 'suspended'; failed_logins: number; locked_until: Date | null; last_login_at: Date | null;
  theme: string; email_notifications: number; created_at: Date; deleted_at: Date | null;
}

export const userRepo = {
  byEmail: (email: string) => one<UserRow>('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL', [email]),
  byId: (id: number) => one<UserRow>('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [id]),
  async roles(id: number): Promise<string[]> {
    const rows = await query<{ code: string }>('SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?', [id]);
    return rows.map((r) => r.code);
  },
  async create(email: string, hash: string, fullName: string, db: Executor = pool): Promise<number> {
    const res = await exec('INSERT INTO users (email, password_hash, full_name) VALUES (?,?,?)', [email, hash, fullName], db);
    return res.insertId;
  },
  async assignRole(userId: number, code: string, db: Executor = pool) {
    await exec('INSERT IGNORE INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [userId, code], db);
  },
  async replaceRoles(userId: number, codes: string[], db: Executor) {
    await exec('DELETE FROM user_roles WHERE user_id = ?', [userId], db);
    for (const c of codes) await this.assignRole(userId, c, db);
  },
  recordFailedLogin: (id: number, lockMinutes: number | null) => exec(
    `UPDATE users SET failed_logins = failed_logins + 1, locked_until = IF(? IS NULL, locked_until, DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? MINUTE)) WHERE id = ?`,
    [lockMinutes, lockMinutes ?? 0, id]),
  recordLogin: (id: number) => exec('UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = UTC_TIMESTAMP(), last_active_at = UTC_TIMESTAMP() WHERE id = ?', [id]),
  setPassword: (id: number, hash: string, db: Executor = pool) => exec('UPDATE users SET password_hash = ?, failed_logins = 0, locked_until = NULL WHERE id = ?', [hash, id], db),
  markVerified: (id: number, db: Executor = pool) => exec('UPDATE users SET email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE id = ?', [id], db),
  updateAccount: (id: number, fullName: string, theme: string, emailNotifications: boolean) =>
    exec('UPDATE users SET full_name = ?, theme = ?, email_notifications = ? WHERE id = ?', [fullName, theme, emailNotifications ? 1 : 0, id]),
  softDelete: (id: number) => exec(`UPDATE users SET deleted_at = UTC_TIMESTAMP(), email = CONCAT('deleted+', id, '@deleted.invalid'), full_name = 'Deleted user' WHERE id = ?`, [id]),

  // Sessions
  createSession: (userId: number, familyId: string, tokenHash: string, ua: string | null, ip: string | null, expires: Date, db: Executor = pool) =>
    exec('INSERT INTO user_sessions (user_id, family_id, token_hash, user_agent, ip, expires_at) VALUES (?,?,?,?,?,?)', [userId, familyId, tokenHash, ua, ip, expires], db),
  sessionByHash: (hash: string) => one<RowDataPacket & { id: number; user_id: number; family_id: string; expires_at: Date; rotated_at: Date | null; revoked_at: Date | null }>('SELECT * FROM user_sessions WHERE token_hash = ?', [hash]),
  markRotated: (id: number, db: Executor = pool) => exec('UPDATE user_sessions SET rotated_at = UTC_TIMESTAMP() WHERE id = ? AND rotated_at IS NULL', [id], db),
  revokeFamily: (familyId: string) => exec('UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP() WHERE family_id = ? AND revoked_at IS NULL', [familyId]),
  revokeAll: (userId: number, db: Executor = pool) => exec('UPDATE user_sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL', [userId], db),
  listSessions: (userId: number) => query(
    `SELECT id, family_id, user_agent, ip, created_at, expires_at FROM user_sessions
     WHERE user_id = ? AND revoked_at IS NULL AND rotated_at IS NULL AND expires_at > UTC_TIMESTAMP() ORDER BY created_at DESC`, [userId]),
  async revokeSession(userId: number, sessionId: number) {
    const s = await one<{ family_id: string }>('SELECT family_id FROM user_sessions WHERE id = ? AND user_id = ?', [sessionId, userId]);
    if (!s) return false;
    await this.revokeFamily(s.family_id);
    return true;
  },

  // One-time tokens
  createToken: (userId: number, purpose: string, hash: string, expires: Date) =>
    exec('INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES (?,?,?,?)', [userId, purpose, hash, expires]),
  validToken: (hash: string, purpose: string) => one<RowDataPacket & { id: number; user_id: number }>(
    'SELECT id, user_id FROM auth_tokens WHERE token_hash = ? AND purpose = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()', [hash, purpose]),
  useToken: (id: number, db: Executor = pool) => exec('UPDATE auth_tokens SET used_at = UTC_TIMESTAMP() WHERE id = ? AND used_at IS NULL', [id], db),

  // Profile
  profile: (userId: number) => one('SELECT * FROM user_profiles WHERE user_id = ?', [userId]),
  async upsertProfile(userId: number, p: Record<string, string | number | null>) {
    const keys = Object.keys(p);
    const cols = ['user_id', ...keys].join(', ');
    const marks = ['?', ...keys.map(() => '?')].join(', ');
    const update = keys.length ? keys.map((k) => `${k} = VALUES(${k})`).join(', ') : 'user_id = user_id';
    await exec(`INSERT INTO user_profiles (${cols}) VALUES (${marks}) ON DUPLICATE KEY UPDATE ${update}`, [userId, ...keys.map((k) => p[k])]);
  },
  userSkills: (userId: number) => query<{ id: number; name: string; type: string; level: string | null }>(
    `SELECT s.id, s.name, s.type, us.level FROM user_skills us JOIN skills s ON s.id = us.skill_id WHERE us.user_id = ? ORDER BY s.name`, [userId]),
  async setUserSkills(userId: number, skillIds: number[], db: Executor) {
    await exec('DELETE FROM user_skills WHERE user_id = ?', [userId], db);
    for (const id of skillIds) await exec('INSERT IGNORE INTO user_skills (user_id, skill_id) VALUES (?,?)', [userId, id], db);
  },
};

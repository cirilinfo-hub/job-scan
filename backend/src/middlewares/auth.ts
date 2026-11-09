import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthUser } from '../utils/http';
import { forbidden, unauthorized } from '../utils/errors';
import { exec, one } from '../config/db';

declare module 'express-serve-static-core' {
  interface Request { user?: AuthUser }
}

export const ROLES = { SUPER_ADMIN: 'super_admin', ADMIN: 'admin', JOB_SEEKER: 'job_seeker' } as const;

/**
 * Verifies the access token, then re-reads status and roles so that suspension
 * and role changes take effect immediately rather than when the token expires.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  let sub: number;
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    sub = Number(payload.sub);
  } catch {
    throw unauthorized('Your session has expired.', 'TOKEN_EXPIRED');
  }
  const row = await one<{ id: number; email: string; status: string; roles: string | null; last_active_at: Date | null }>(
    `SELECT u.id, u.email, u.status, u.last_active_at,
            (SELECT GROUP_CONCAT(r.code) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles
     FROM users u WHERE u.id = ? AND u.deleted_at IS NULL`, [sub]);
  if (!row || row.status !== 'active') throw unauthorized('This account is not available.');
  req.user = { id: row.id, email: row.email, roles: row.roles ? row.roles.split(',') : [] };
  // Throttled to one write per five minutes per user; used for the admin "active users" metric.
  if (!row.last_active_at || Date.now() - row.last_active_at.getTime() > 300_000) {
    void exec('UPDATE users SET last_active_at = UTC_TIMESTAMP() WHERE id = ?', [row.id]).catch(() => undefined);
  }
  next();
}

export const requireRole = (...roles: string[]) => (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user) throw unauthorized();
  if (!req.user.roles.some((r) => roles.includes(r))) throw forbidden();
  next();
};

export const requireAdmin = requireRole(ROLES.ADMIN, ROLES.SUPER_ADMIN);
export const requireSuperAdmin = requireRole(ROLES.SUPER_ADMIN);

/** CSRF defence for cookie-authenticated routes: browsers cannot add this header cross-site without CORS approval. */
export function requireCsrfHeader(req: Request, _res: Response, next: NextFunction): void {
  if (req.headers['x-requested-with'] !== 'rolewise') throw forbidden('Missing request header.');
  next();
}

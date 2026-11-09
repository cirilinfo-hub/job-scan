import { Request, Response } from 'express';
import { z } from 'zod';
import { unauthorized, badRequest } from './errors';

/** Standard envelope: { success, data, meta? } and { success:false, error:{code,message,details?} }. */
export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>, status = 200): void {
  res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export const created = <T>(res: Response, data: T): void => ok(res, data, undefined, 201);

export interface AuthUser { id: number; email: string; roles: string[] }

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function idParam(req: Request, name = 'id'): number {
  const n = Number(req.params[name]);
  if (!Number.isSafeInteger(n) || n <= 0) throw badRequest(`Invalid ${name}.`);
  return n;
}

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export function pageMeta(page: number, pageSize: number, total: number) {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Escape user text for use inside a LIKE pattern. */
export const likeEscape = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

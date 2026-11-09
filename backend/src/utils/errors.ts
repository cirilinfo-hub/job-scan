export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (m: string, d?: unknown) => new AppError(400, 'BAD_REQUEST', m, d);
export const unauthorized = (m = 'Sign in to continue.', code = 'UNAUTHORIZED') => new AppError(401, code, m);
export const forbidden = (m = 'You do not have access to this.') => new AppError(403, 'FORBIDDEN', m);
export const notFound = (what = 'Item') => new AppError(404, 'NOT_FOUND', `${what} not found.`);
export const conflict = (m: string) => new AppError(409, 'CONFLICT', m);
export const aiUnavailable = (m = 'AI features are not configured on this server.') => new AppError(503, 'AI_UNAVAILABLE', m);
export const limitReached = (m: string) => new AppError(429, 'LIMIT_REACHED', m);

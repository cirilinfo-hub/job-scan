import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { MulterError } from 'multer';
import { ZodError, ZodType } from 'zod';
import { env } from '../config/env';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

/** Validates and replaces req.body; query validation is done with parseQuery so Express 5's read-only req.query is respected. */
export const validateBody = (schema: ZodType) => (req: Request, _res: Response, next: NextFunction): void => {
  req.body = schema.parse(req.body ?? {});
  next();
};

export const parseQuery = <T>(schema: ZodType<T>, req: Request): T => schema.parse(req.query);

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Some fields need attention.',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ success: false, error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooBig ? 413 : 400).json({
      success: false,
      error: { code: tooBig ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR', message: tooBig ? `Files must be ${env.MAX_UPLOAD_MB} MB or smaller.` : 'The upload could not be processed.' },
    });
    return;
  }
  const maybe = err as { type?: string; status?: number };
  if (maybe?.type === 'entity.parse.failed' || maybe?.type === 'entity.too.large') {
    res.status(maybe.status ?? 400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'The request body could not be read.' } });
    return;
  }
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' } });
}

const limiter = (windowMs: number, limit: number) =>
  rateLimit({
    windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false,
    skip: () => env.isTest,
    message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' } },
  });

export const apiLimiter = limiter(60_000, 300);
export const authLimiter = limiter(15 * 60_000, 30);
export const aiLimiter = limiter(60_000, 15);
export const uploadLimiter = limiter(60_000, 15);

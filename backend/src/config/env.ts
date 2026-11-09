import path from 'node:path';
import { z } from 'zod';

const bool = (fallback: boolean) =>
  z.string().optional().transform((v) => (v === undefined || v === '' ? fallback : v === 'true' || v === '1'));
const optionalStr = z.string().optional().transform((v) => (v ? v : undefined));
const optionalNum = z.string().optional().transform((v) => (v ? Number(v) : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  APP_URL: z.string().default('http://localhost:4200'),
  CORS_ORIGINS: z.string().default('http://localhost:4200'),
  TRUST_PROXY: z.coerce.number().default(0),
  SERVE_FRONTEND: bool(false),
  FRONTEND_DIST: z.string().default('../frontend/dist/frontend/browser'),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('rolewise'),
  DB_POOL_SIZE: z.coerce.number().default(10),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS: z.coerce.number().default(30),
  STORAGE_DIR: z.string().default('./storage'),
  MAX_UPLOAD_MB: z.coerce.number().default(5),
  AI_PROVIDER: z.enum(['none', 'anthropic', 'openai-compatible']).default('none'),
  AI_MODEL: optionalStr,
  ANTHROPIC_API_KEY: optionalStr,
  OPENAI_COMPAT_API_KEY: optionalStr,
  OPENAI_COMPAT_BASE_URL: z.string().default('https://api.openai.com/v1'),
  AI_COST_INPUT_PER_MTOK: optionalNum,
  AI_COST_OUTPUT_PER_MTOK: optionalNum,
  ADZUNA_APP_ID: optionalStr,
  ADZUNA_APP_KEY: optionalStr,
  ADZUNA_COUNTRY: z.string().default('gb'),
  SMTP_HOST: optionalStr,
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: optionalStr,
  SMTP_PASSWORD: optionalStr,
  SMTP_FROM: z.string().default('Rolewise <no-reply@example.com>'),
  SEED_ADMIN_EMAIL: optionalStr,
  SEED_ADMIN_PASSWORD: optionalStr,
  LOG_LEVEL: z.string().default('info'),
  SCHEDULER_ENABLED: bool(true),
  RETENTION_DAYS_DELETED: z.coerce.number().default(30),
  RETENTION_DAYS_LOGS: z.coerce.number().default(180),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${lines}`);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
  storageDir: path.resolve(parsed.data.STORAGE_DIR),
  maxUploadBytes: parsed.data.MAX_UPLOAD_MB * 1024 * 1024,
};

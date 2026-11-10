import path from 'node:path';
import fs from 'node:fs';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Express } from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { pool } from './config/db';
import { env } from './config/env';
import { openApiSpec } from './docs/openapi';
import { apiLimiter, errorHandler, notFoundHandler, requireFeature } from './middlewares/common';
import { settingsService } from './services/settings.service';
import { adminRoutes } from './routes/admin.routes';
import { authRoutes, userRoutes } from './routes/auth.routes';
import { coverLetterRoutes } from './routes/cover-letter.routes';
import { dashboardRoutes } from './routes/dashboard.routes';
import { interviewRoutes } from './routes/interview.routes';
import { jobRoutes, matchingRoutes } from './routes/job.routes';
import { linkedinRoutes } from './routes/linkedin.routes';
import { notificationRoutes } from './routes/notification.routes';
import { optimizerRoutes } from './routes/optimizer.routes';
import { builderRoutes, resumeRoutes } from './routes/resume.routes';
import { scannerRoutes } from './routes/scanner.routes';
import { trackerRoutes } from './routes/tracker.routes';
import { logger } from './utils/logger';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // Material and Angular inject component styles; company logos come from job sources over HTTPS.
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'https:'],
        'upgrade-insecure-requests': env.isProd ? [] : null,
      },
    },
    strictTransportSecurity: env.isProd,
  }));
  app.use(cors({ origin: env.corsOrigins, credentials: true, exposedHeaders: ['Content-Disposition'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'] }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' }, serializers: { req: (r) => ({ method: r.method, url: r.url?.split('?')[0] }), res: (r) => ({ statusCode: r.statusCode }) } }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'ok', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unavailable' });
    }
  });

  // Swagger UI needs inline scripts, so the docs route gets its own narrower policy.
  const docsCsp = helmet.contentSecurityPolicy({ useDefaults: true, directives: { 'script-src': ["'self'", "'unsafe-inline'"], 'style-src': ["'self'", "'unsafe-inline'"], 'upgrade-insecure-requests': null } });
  app.get('/api/v1/openapi.json', (_req, res) => { res.json(openApiSpec); });
  app.use('/api/v1/docs', docsCsp, swaggerUi.serve, swaggerUi.setup(openApiSpec));

  const v1 = express.Router();
  v1.use(apiLimiter);
  // Public, non-sensitive settings the app needs before sign-in.
  v1.get('/config', async (_req, res) => {
    const s = await settingsService.get<{ supportEmail?: string; announcement?: string }>('app_settings', {});
    res.json({ success: true, data: { features: await settingsService.get('feature_flags', {}), supportEmail: s.supportEmail ?? '', announcement: s.announcement ?? '' } });
  });
  v1.use('/auth', authRoutes);
  v1.use('/users', userRoutes);
  v1.use('/dashboard', dashboardRoutes);
  v1.use('/resumes', resumeRoutes);
  v1.use('/resume-scanner', scannerRoutes);
  v1.use('/resume-optimizer', optimizerRoutes);
  v1.use('/resume-builder', requireFeature('resume_builder'), builderRoutes);
  v1.use('/jobs', requireFeature('job_search'), jobRoutes);
  v1.use('/job-matching', requireFeature('job_search'), matchingRoutes);
  v1.use('/job-tracker', trackerRoutes);
  v1.use('/cover-letters', requireFeature('cover_letters'), coverLetterRoutes);
  v1.use('/linkedin', requireFeature('linkedin'), linkedinRoutes);
  v1.use('/interviews', requireFeature('interview_prep'), interviewRoutes);
  v1.use('/notifications', notificationRoutes);
  v1.use('/admin', adminRoutes);
  app.use('/api/v1', v1);
  app.use('/api', notFoundHandler);

  if (env.SERVE_FRONTEND) {
    const dist = env.frontendDist;
    if (fs.existsSync(path.join(dist, 'index.html'))) {
      app.use(express.static(dist, { index: false, maxAge: '1y', immutable: true }));
      app.get(/.*/, (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(dist, 'index.html')); });
    } else {
      logger.warn({ dist }, 'SERVE_FRONTEND is on but no build was found');
    }
  }
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

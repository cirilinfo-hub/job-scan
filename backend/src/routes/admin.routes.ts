import { Request, Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireAuth, requireSuperAdmin } from '../middlewares/auth';
import { validateBody } from '../middlewares/common';
import * as a from '../services/admin.service';
import { scoringRulesSchema } from '../services/ats/rules';
import { currentUser, idParam, ok, pageMeta } from '../utils/http';

const s = a.adminService;
const ip = (req: Request) => req.ip ?? null;
const days = z.object({ days: z.coerce.number().int().min(1).max(365).default(30) });
const skillsQ = z.object({ q: z.string().trim().max(80).optional(), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) });

export const adminRoutes = Router();
adminRoutes.use(requireAuth, requireAdmin);

adminRoutes.get('/overview', async (req, res) => ok(res, await s.overview(days.parse(req.query).days)));

adminRoutes.get('/users', async (req, res) => {
  const q = a.usersQuery.parse(req.query);
  const { items, total } = await s.users(q);
  ok(res, items, pageMeta(q.page, q.pageSize, total));
});
adminRoutes.patch('/users/:id', validateBody(a.userUpdate), async (req, res) => ok(res, await s.updateUser(currentUser(req), idParam(req), req.body, ip(req))));
adminRoutes.post('/users/:id/subscription', validateBody(a.assignPlanSchema), async (req, res) => {
  await s.assignPlan(currentUser(req), idParam(req), req.body.planId, req.body.endsAt ?? null, ip(req));
  ok(res, { assigned: true });
});
adminRoutes.get('/roles', async (_req, res) => ok(res, await s.roles()));

adminRoutes.get('/job-sources', async (_req, res) => ok(res, await s.sources()));
adminRoutes.patch('/job-sources/:id', validateBody(a.sourceUpdate), async (req, res) => { await s.updateSource(currentUser(req), idParam(req), req.body.isEnabled, ip(req)); ok(res, await s.sources()); });
adminRoutes.post('/job-sources/:id/sync', async (req, res) => ok(res, await s.syncSource(currentUser(req), idParam(req), ip(req))));

adminRoutes.get('/job-categories', async (_req, res) => ok(res, await s.categories()));
adminRoutes.post('/job-categories', validateBody(a.nameSchema), async (req, res) => ok(res, await s.saveCategory(currentUser(req), null, req.body, ip(req))));
adminRoutes.put('/job-categories/:id', validateBody(a.nameSchema), async (req, res) => ok(res, await s.saveCategory(currentUser(req), idParam(req), req.body, ip(req))));
adminRoutes.delete('/job-categories/:id', async (req, res) => { await s.removeCategory(currentUser(req), idParam(req), ip(req)); ok(res, { deleted: true }); });

adminRoutes.get('/skills', async (req, res) => {
  const q = skillsQ.parse(req.query);
  const { items, total } = await s.skills(q.q, q.page, q.pageSize);
  ok(res, items, pageMeta(q.page, q.pageSize, total));
});
adminRoutes.post('/skills', validateBody(a.skillSchema), async (req, res) => { await s.saveSkill(currentUser(req), null, req.body, ip(req)); ok(res, { saved: true }); });
adminRoutes.put('/skills/:id', validateBody(a.skillSchema), async (req, res) => { await s.saveSkill(currentUser(req), idParam(req), req.body, ip(req)); ok(res, { saved: true }); });
adminRoutes.delete('/skills/:id', async (req, res) => { await s.removeSkill(currentUser(req), idParam(req), ip(req)); ok(res, { deleted: true }); });

adminRoutes.get('/plans', async (_req, res) => ok(res, await s.plans()));
adminRoutes.post('/plans', requireSuperAdmin, validateBody(a.planSchema), async (req, res) => ok(res, await s.savePlan(currentUser(req), null, req.body, ip(req))));
adminRoutes.put('/plans/:id', requireSuperAdmin, validateBody(a.planSchema), async (req, res) => ok(res, await s.savePlan(currentUser(req), idParam(req), req.body, ip(req))));

adminRoutes.get('/features', async (_req, res) => ok(res, await s.features()));
adminRoutes.put('/features', requireSuperAdmin, validateBody(a.flagsSchema), async (req, res) => ok(res, await s.setFeatures(currentUser(req), req.body, ip(req))));

adminRoutes.get('/scoring-rules', async (_req, res) => ok(res, await s.scoring()));
adminRoutes.put('/scoring-rules', requireSuperAdmin, validateBody(scoringRulesSchema), async (req, res) => ok(res, await s.setScoring(currentUser(req), req.body, ip(req))));

adminRoutes.get('/ai', async (_req, res) => ok(res, await s.aiConfig()));
adminRoutes.put('/ai', requireSuperAdmin, validateBody(a.aiConfigSchema), async (req, res) => ok(res, await s.setAiConfig(currentUser(req), req.body, ip(req))));
adminRoutes.post('/ai/test', requireSuperAdmin, async (req, res) => ok(res, await s.aiTest(currentUser(req), ip(req))));

adminRoutes.get('/logs', async (req, res) => {
  const q = a.logsQuery.parse(req.query);
  const { items, total } = await s.logs(q);
  ok(res, items, pageMeta(q.page, q.pageSize, total));
});

adminRoutes.get('/settings', async (_req, res) => ok(res, await s.settings()));
adminRoutes.put('/settings', requireSuperAdmin, validateBody(a.settingsSchema), async (req, res) => ok(res, await s.setSettings(currentUser(req), req.body, ip(req))));

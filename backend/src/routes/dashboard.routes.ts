import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/auth';
import { dashboardService } from '../services/dashboard.service';
import { notificationService } from '../services/notification.service';
import { currentUser, ok } from '../utils/http';
import { badRequest } from '../utils/errors';

const q = z.object({
  days: z.coerce.number().int().min(1).max(730).optional(),
  from: z.coerce.date().optional(), to: z.coerce.date().optional(),
});

export const dashboardRoutes = Router();
dashboardRoutes.use(requireAuth);
dashboardRoutes.get('/', async (req, res) => {
  const p = q.parse(req.query);
  // A small margin, because MySQL rounds fractional seconds up: something saved just now can land a moment ahead.
  const to = p.to ? new Date(new Date(p.to).setUTCHours(23, 59, 59, 999)) : new Date(Date.now() + 60_000);
  const from = p.from ?? new Date(to.getTime() - (p.days ?? 30) * 864e5);
  if (from > to) throw badRequest('The start date must be before the end date.');
  const id = currentUser(req).id;
  await notificationService.generateThrottled(id);
  ok(res, { range: { from, to }, ...(await dashboardService.overview(id, { from, to })) });
});

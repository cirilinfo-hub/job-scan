import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/auth';
import { aiLimiter } from '../middlewares/common';
import { jobRepo, JobFilters } from '../repositories/job.repository';
import { jobService } from '../services/job.service';
import { matchingService } from '../services/matching.service';
import { currentUser, idParam, ok, pageMeta } from '../utils/http';

const csv = z.string().optional().transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined));
const num = z.coerce.number().min(0).optional();

const searchSchema = z.object({
  q: z.string().trim().max(200).optional(), title: z.string().trim().max(150).optional(), company: z.string().trim().max(150).optional(),
  location: z.string().trim().max(150).optional(), workMode: csv, employmentType: csv, level: csv,
  maxYears: num, minSalary: num, postedWithinDays: z.coerce.number().int().min(1).max(365).optional(), minScore: z.coerce.number().int().min(0).max(100).optional(),
  saved: z.enum(['true', 'false']).optional(), sort: z.enum(['recent', 'match', 'salary']).default('recent'),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

const VALID = {
  workMode: ['remote', 'hybrid', 'onsite', 'unknown'],
  employmentType: ['full_time', 'part_time', 'contract', 'internship', 'unknown'],
  level: ['intern', 'entry', 'mid', 'senior', 'lead', 'executive', 'unknown'],
};
const keep = (xs: string[] | undefined, allowed: string[]) => xs?.filter((x) => allowed.includes(x));

const search = async (req: Request, res: Response) => {
  const q = searchSchema.parse(req.query);
  const filters: JobFilters = {
    q: q.q, title: q.title, company: q.company, location: q.location, workModes: keep(q.workMode, VALID.workMode),
    employmentTypes: keep(q.employmentType, VALID.employmentType), levels: keep(q.level, VALID.level), maxYears: q.maxYears, minSalary: q.minSalary,
    postedWithinDays: q.postedWithinDays, minScore: q.minScore, savedOnly: q.saved === 'true', sort: q.sort,
  };
  const { items, total } = await jobService.search(currentUser(req).id, filters, q.page, q.pageSize);
  ok(res, items, pageMeta(q.page, q.pageSize, total));
};

export const jobRoutes = Router();
jobRoutes.use(requireAuth);
jobRoutes.get('/', search);
jobRoutes.get('/facets', async (_req, res) => ok(res, await jobRepo.facets()));
jobRoutes.get('/:id', async (req, res) => ok(res, await jobService.get(currentUser(req).id, idParam(req))));
jobRoutes.post('/:id/save', async (req, res) => { await jobService.setSaved(currentUser(req).id, idParam(req), true); ok(res, { saved: true }); });
jobRoutes.delete('/:id/save', async (req, res) => { await jobService.setSaved(currentUser(req).id, idParam(req), false); ok(res, { saved: false }); });

const matchQuery = z.object({ minScore: z.coerce.number().int().min(0).max(100).default(0), page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(50).default(12) });

export const matchingRoutes = Router();
matchingRoutes.use(requireAuth);
matchingRoutes.get('/', async (req, res) => {
  const q = matchQuery.parse(req.query);
  const { items, total, ...rest } = await matchingService.best(currentUser(req).id, q.minScore, q.page, q.pageSize);
  ok(res, { items, ...rest }, pageMeta(q.page, q.pageSize, total));
});
matchingRoutes.post('/refresh', async (req, res) => { await matchingService.ensureFresh(currentUser(req).id, true); ok(res, { refreshed: true }); });
matchingRoutes.post('/:id/ai-explain', aiLimiter, async (req, res) => ok(res, await matchingService.aiExplain(currentUser(req).id, idParam(req))));

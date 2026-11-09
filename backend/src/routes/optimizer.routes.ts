import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/auth';
import { aiLimiter, validateBody } from '../middlewares/common';
import { optimizerService as s } from '../services/optimizer.service';
import { currentUser, idParam, ok } from '../utils/http';
import { structuredResumeSchema } from '../validators/resume.validators';

const decideSchema = z.object({
  status: z.enum(['accepted', 'rejected']),
  finalText: z.string().trim().min(1).max(2000).optional(),
  confirmed: z.boolean().default(false),
  structured: structuredResumeSchema,
});
const rescoreSchema = z.object({ structured: structuredResumeSchema, scanId: z.number().int().positive() });
const saveSchema = z.object({
  structured: structuredResumeSchema, label: z.string().trim().max(150).nullable().optional(),
  asNew: z.boolean().default(false), title: z.string().trim().max(150).optional(),
});
const q = z.object({ scanId: z.coerce.number().int().positive().optional() });

const c = {
  load: async (req: Request, res: Response) => ok(res, await s.load(currentUser(req).id, idParam(req, 'resumeId'), q.parse(req.query).scanId)),
  ai: async (req: Request, res: Response) => ok(res, await s.generateAi(currentUser(req).id, idParam(req, 'resumeId'), q.parse(req.query).scanId)),
  decide: async (req: Request, res: Response) => ok(res, await s.decide(currentUser(req).id, idParam(req), req.body, req.body.structured)),
  rescore: async (req: Request, res: Response) => ok(res, await s.rescore(currentUser(req).id, req.body.structured, req.body.scanId)),
  save: async (req: Request, res: Response) => ok(res, await s.save(currentUser(req).id, idParam(req, 'resumeId'), req.body.structured, req.body.label ?? null, req.body.asNew, req.body.title)),
};

export const optimizerRoutes = Router();
optimizerRoutes.use(requireAuth);
optimizerRoutes.get('/resumes/:resumeId', c.load);
optimizerRoutes.post('/resumes/:resumeId/ai-suggestions', aiLimiter, c.ai);
optimizerRoutes.post('/resumes/:resumeId/save', validateBody(saveSchema), c.save);
optimizerRoutes.post('/suggestions/:id/decision', validateBody(decideSchema), c.decide);
optimizerRoutes.post('/rescore', validateBody(rescoreSchema), c.rescore);

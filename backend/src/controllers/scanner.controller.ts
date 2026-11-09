import { Request, Response } from 'express';
import { z } from 'zod';
import { scannerService, rulesNow } from '../services/scanner.service';
import { aiService } from '../services/ai.service';
import { currentUser, idParam, ok, created, pageMeta, paginationSchema } from '../utils/http';

export const scanSchema = z.object({
  resumeId: z.number().int().positive(),
  versionId: z.number().int().positive().optional(),
  company: z.string().trim().max(150).nullable().optional(),
  jobTitle: z.string().trim().min(2, 'Enter the job title.').max(150),
  jobDescription: z.string().trim().min(50, 'Paste the full job description (at least 50 characters).').max(50000),
  jobId: z.number().int().positive().nullable().optional(),
});
export const excludeSchema = z.object({ excluded: z.array(z.string().trim().max(100)).max(100) });

export const scannerController = {
  run: async (req: Request, res: Response) => created(res, await scannerService.run(currentUser(req).id, req.body)),
  list: async (req: Request, res: Response) => {
    const q = paginationSchema.parse(req.query);
    const { items, total } = await scannerService.list(currentUser(req).id, q.page, q.pageSize);
    ok(res, items, pageMeta(q.page, q.pageSize, total));
  },
  get: async (req: Request, res: Response) => ok(res, await scannerService.get(currentUser(req).id, idParam(req))),
  exclude: async (req: Request, res: Response) => ok(res, await scannerService.setExcluded(currentUser(req).id, idParam(req), req.body.excluded)),
  rescan: async (req: Request, res: Response) => created(res, await scannerService.rescan(currentUser(req).id, idParam(req))),
  remove: async (req: Request, res: Response) => { await scannerService.remove(currentUser(req).id, idParam(req)); ok(res, { deleted: true }); },
  rules: async (_req: Request, res: Response) => ok(res, await rulesNow()),
  aiKeywords: async (req: Request, res: Response) => ok(res, await scannerService.aiKeywords(currentUser(req).id, idParam(req))),
  aiStatus: async (_req: Request, res: Response) => { const s = await aiService.status(); ok(res, { available: s.available }); },
};

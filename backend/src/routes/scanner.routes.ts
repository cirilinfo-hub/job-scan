import { Router } from 'express';
import { excludeSchema, scanSchema, scannerController as c } from '../controllers/scanner.controller';
import { requireAuth } from '../middlewares/auth';
import { aiLimiter, validateBody } from '../middlewares/common';

export const scannerRoutes = Router();
scannerRoutes.use(requireAuth);
scannerRoutes.get('/rules', c.rules);
scannerRoutes.get('/ai-status', c.aiStatus);
scannerRoutes.get('/', c.list);
scannerRoutes.post('/', validateBody(scanSchema), c.run);
scannerRoutes.get('/:id', c.get);
scannerRoutes.delete('/:id', c.remove);
scannerRoutes.put('/:id/excluded-terms', validateBody(excludeSchema), c.exclude);
scannerRoutes.post('/:id/rescan', c.rescan);
scannerRoutes.post('/:id/ai-keywords', aiLimiter, c.aiKeywords);

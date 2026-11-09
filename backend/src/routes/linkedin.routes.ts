import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { aiLimiter, validateBody } from '../middlewares/common';
import { linkedinService as s, profileBody } from '../services/linkedin.service';
import { currentUser, ok } from '../utils/http';

export const linkedinRoutes = Router();
linkedinRoutes.use(requireAuth);
linkedinRoutes.get('/', async (req, res) => ok(res, await s.get(currentUser(req).id)));
linkedinRoutes.put('/', validateBody(profileBody), async (req, res) => ok(res, await s.save(currentUser(req).id, req.body)));
linkedinRoutes.post('/analyze', validateBody(profileBody), async (req, res) => ok(res, await s.analyze(currentUser(req).id, req.body)));
linkedinRoutes.post('/ai-suggestions', aiLimiter, async (req, res) => ok(res, await s.aiSuggest(currentUser(req).id)));

import { Router } from 'express';
import { requireAuth } from '../middlewares/auth';
import { aiLimiter, validateBody } from '../middlewares/common';
import { answerSchema, generateSchema, interviewService as s, questionsQuery, sessionSchema } from '../services/interview.service';
import { currentUser, idParam, ok, created } from '../utils/http';

export const interviewRoutes = Router();
interviewRoutes.use(requireAuth);
interviewRoutes.get('/guide', async (_req, res) => ok(res, { ...s.guide(), roleFamilies: await s.roleFamilies() }));
interviewRoutes.get('/questions', async (req, res) => ok(res, await s.questions(currentUser(req).id, questionsQuery.parse(req.query))));
interviewRoutes.post('/questions/generate', aiLimiter, validateBody(generateSchema), async (req, res) => created(res, await s.generate(currentUser(req).id, req.body)));
interviewRoutes.get('/sessions', async (req, res) => ok(res, await s.sessions(currentUser(req).id)));
interviewRoutes.post('/sessions', validateBody(sessionSchema), async (req, res) => created(res, await s.createSession(currentUser(req).id, req.body)));
interviewRoutes.get('/sessions/:id', async (req, res) => ok(res, await s.session(currentUser(req).id, idParam(req))));
interviewRoutes.delete('/sessions/:id', async (req, res) => { await s.removeSession(currentUser(req).id, idParam(req)); ok(res, { deleted: true }); });
interviewRoutes.post('/sessions/:id/complete', async (req, res) => ok(res, await s.complete(currentUser(req).id, idParam(req))));
interviewRoutes.put('/sessions/:id/answers/:answerId', validateBody(answerSchema), async (req, res) => ok(res, await s.answer(currentUser(req).id, idParam(req), idParam(req, 'answerId'), req.body.answer)));
interviewRoutes.post('/sessions/:id/answers/:answerId/ai-feedback', aiLimiter, async (req, res) => ok(res, await s.aiFeedback(currentUser(req).id, idParam(req), idParam(req, 'answerId'))));

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middlewares/auth';
import { notificationService as s } from '../services/notification.service';
import { currentUser, idParam, ok, pageMeta, paginationSchema } from '../utils/http';

const listQuery = paginationSchema.extend({ unread: z.enum(['true', 'false']).optional() });

export const notificationRoutes = Router();
notificationRoutes.use(requireAuth);
notificationRoutes.get('/', async (req, res) => {
  const q = listQuery.parse(req.query);
  const id = currentUser(req).id;
  await s.generateThrottled(id);
  const unread = q.unread === 'true';
  const [items, total, unreadCount] = await Promise.all([s.list(id, unread, q.pageSize, (q.page - 1) * q.pageSize), s.count(id, unread), s.count(id, true)]);
  ok(res, items, { ...pageMeta(q.page, q.pageSize, total), unreadCount });
});
notificationRoutes.get('/unread-count', async (req, res) => {
  const id = currentUser(req).id;
  await s.generateThrottled(id);
  ok(res, { count: await s.count(id, true) });
});
notificationRoutes.post('/read-all', async (req, res) => { await s.markAll(currentUser(req).id); ok(res, { read: true }); });
notificationRoutes.post('/:id/read', async (req, res) => { await s.markRead(currentUser(req).id, idParam(req)); ok(res, { read: true }); });
notificationRoutes.delete('/:id', async (req, res) => { await s.remove(currentUser(req).id, idParam(req)); ok(res, { deleted: true }); });

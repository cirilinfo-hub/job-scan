import { Router } from 'express';
import { authController as a, userController as u } from '../controllers/auth.controller';
import { requireAuth, requireCsrfHeader } from '../middlewares/auth';
import { authLimiter, validateBody } from '../middlewares/common';
import * as v from '../validators/auth.validators';

export const authRoutes = Router();
authRoutes.use(authLimiter);
authRoutes.post('/register', validateBody(v.registerSchema), a.register);
authRoutes.post('/login', validateBody(v.loginSchema), a.login);
authRoutes.post('/refresh', requireCsrfHeader, a.refresh);
authRoutes.post('/logout', requireCsrfHeader, a.logout);
authRoutes.post('/forgot-password', validateBody(v.forgotSchema), a.forgot);
authRoutes.post('/reset-password', validateBody(v.resetSchema), a.reset);
authRoutes.post('/verify-email', validateBody(v.verifySchema), a.verify);
authRoutes.post('/resend-verification', requireAuth, a.resend);

export const userRoutes = Router();
userRoutes.use(requireAuth);
userRoutes.get('/me', u.me);
userRoutes.put('/me', validateBody(v.accountSchema), u.updateAccount);
userRoutes.delete('/me', u.deleteAccount);
userRoutes.post('/me/password', validateBody(v.changePasswordSchema), u.changePassword);
userRoutes.get('/me/profile', u.profile);
userRoutes.put('/me/profile', validateBody(v.profileSchema), u.updateProfile);
userRoutes.get('/me/profile-completion', u.completion);
userRoutes.get('/me/sessions', u.sessions);
userRoutes.delete('/me/sessions/:id', u.revokeSession);
userRoutes.get('/skills', u.skills);

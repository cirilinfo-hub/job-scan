import { CookieOptions, Request, Response } from 'express';
import { env } from '../config/env';
import { authService, ClientInfo } from '../services/auth.service';
import { profileService } from '../services/profile.service';
import { userRepo } from '../repositories/user.repository';
import { currentUser, idParam, ok } from '../utils/http';
import { notFound } from '../utils/errors';

export const REFRESH_COOKIE = 'rw_refresh';
const cookieOpts = (): CookieOptions => ({
  httpOnly: true, secure: env.isProd, sameSite: 'strict', path: '/api/v1/auth', maxAge: env.REFRESH_TTL_DAYS * 864e5,
});
const client = (req: Request): ClientInfo => ({ userAgent: req.headers['user-agent'] ?? null, ip: req.ip ?? null });

function sendSession(res: Response, s: { user: unknown; accessToken: string; refreshToken: string }, status = 200) {
  res.cookie(REFRESH_COOKIE, s.refreshToken, cookieOpts());
  ok(res, { user: s.user, accessToken: s.accessToken }, undefined, status);
}

export const authController = {
  register: async (req: Request, res: Response) => sendSession(res, await authService.register(req.body.email, req.body.password, req.body.fullName, client(req)), 201),
  login: async (req: Request, res: Response) => sendSession(res, await authService.login(req.body.email, req.body.password, client(req))),
  refresh: async (req: Request, res: Response) => {
    try {
      sendSession(res, await authService.refresh(req.cookies?.[REFRESH_COOKIE], client(req)));
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
      throw err;
    }
  },
  logout: async (req: Request, res: Response) => {
    await authService.logout(req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    ok(res, { loggedOut: true });
  },
  forgot: async (req: Request, res: Response) => {
    await authService.forgotPassword(req.body.email);
    ok(res, { message: 'If an account exists for that email, a reset link is on its way.' });
  },
  reset: async (req: Request, res: Response) => { await authService.resetPassword(req.body.token, req.body.password); ok(res, { message: 'Your password has been reset. Please sign in.' }); },
  verify: async (req: Request, res: Response) => { await authService.verifyEmail(req.body.token); ok(res, { message: 'Your email is verified.' }); },
  resend: async (req: Request, res: Response) => { await authService.resendVerification(currentUser(req).id); ok(res, { message: 'If your email is unverified, a new link is on its way.' }); },
};

export const userController = {
  me: async (req: Request, res: Response) => {
    const u = await userRepo.byId(currentUser(req).id);
    if (!u) throw notFound('User');
    ok(res, await authService.publicUser(u));
  },
  updateAccount: async (req: Request, res: Response) => {
    const id = currentUser(req).id;
    await userRepo.updateAccount(id, req.body.fullName, req.body.theme, req.body.emailNotifications);
    ok(res, await authService.publicUser((await userRepo.byId(id))!));
  },
  changePassword: async (req: Request, res: Response) => {
    await authService.changePassword(currentUser(req).id, req.body.currentPassword, req.body.newPassword);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    ok(res, { message: 'Password changed. Please sign in again.' });
  },
  deleteAccount: async (req: Request, res: Response) => {
    const id = currentUser(req).id;
    await userRepo.revokeAll(id);
    await userRepo.softDelete(id);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    ok(res, { message: 'Your account has been deleted.' });
  },
  profile: async (req: Request, res: Response) => ok(res, await profileService.get(currentUser(req).id)),
  updateProfile: async (req: Request, res: Response) => ok(res, await profileService.update(currentUser(req).id, req.body)),
  completion: async (req: Request, res: Response) => ok(res, await profileService.completion(currentUser(req).id)),
  sessions: async (req: Request, res: Response) => ok(res, await userRepo.listSessions(currentUser(req).id)),
  revokeSession: async (req: Request, res: Response) => {
    if (!(await userRepo.revokeSession(currentUser(req).id, idParam(req)))) throw notFound('Session');
    ok(res, { revoked: true });
  },
  skills: async (req: Request, res: Response) => ok(res, await profileService.searchSkills(String(req.query.q ?? ''))),
};

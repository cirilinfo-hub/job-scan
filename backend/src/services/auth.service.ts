import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { tx } from '../config/db';
import { sendMail } from '../integrations/email/mailer';
import { userRepo, UserRow } from '../repositories/user.repository';
import { AppError, badRequest, conflict, unauthorized } from '../utils/errors';
import { logger } from '../utils/logger';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');
export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
// Compared against when an email is unknown, so timing doesn't reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

export interface ClientInfo { userAgent: string | null; ip: string | null }

function signAccess(user: { id: number; email: string }): string {
  return jwt.sign({ email: user.email }, env.JWT_SECRET, { subject: String(user.id), expiresIn: env.JWT_ACCESS_TTL as SignOptions['expiresIn'], algorithm: 'HS256' });
}

async function issueSession(userId: number, client: ClientInfo, familyId: string = crypto.randomUUID()) {
  const refresh = randomToken();
  await userRepo.createSession(userId, familyId, sha256(refresh), client.userAgent?.slice(0, 255) ?? null, client.ip, new Date(Date.now() + env.REFRESH_TTL_DAYS * 864e5));
  return refresh;
}

async function publicUser(u: UserRow) {
  return {
    id: u.id, email: u.email, fullName: u.full_name, emailVerified: !!u.email_verified_at,
    roles: await userRepo.roles(u.id), theme: u.theme, emailNotifications: !!u.email_notifications, createdAt: u.created_at,
  };
}

async function sendVerification(user: { id: number; email: string }) {
  const token = randomToken();
  await userRepo.createToken(user.id, 'verify_email', sha256(token), new Date(Date.now() + 48 * 36e5));
  await sendMail({ to: user.email, subject: 'Confirm your Rolewise email', text: `Confirm your email address:\n${env.APP_URL}/verify-email?token=${token}\n\nThis link expires in 48 hours.` });
}

export const authService = {
  publicUser,

  async register(email: string, password: string, fullName: string, client: ClientInfo) {
    if (await userRepo.byEmail(email)) throw conflict('An account with this email already exists. Try signing in instead.');
    const hash = await hashPassword(password);
    const id = await tx(async (db) => {
      const newId = await userRepo.create(email, hash, fullName, db);
      await userRepo.assignRole(newId, 'job_seeker', db);
      return newId;
    });
    await sendVerification({ id, email });
    const user = (await userRepo.byId(id))!;
    return { user: await publicUser(user), accessToken: signAccess(user), refreshToken: await issueSession(id, client) };
  },

  async login(email: string, password: string, client: ClientInfo) {
    const user = await userRepo.byEmail(email);
    const valid = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (user?.locked_until && user.locked_until > new Date()) {
      throw new AppError(423, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again in up to ${LOCK_MINUTES} minutes or reset your password.`);
    }
    if (!user || !valid) {
      if (user) await userRepo.recordFailedLogin(user.id, user.failed_logins + 1 >= MAX_FAILED ? LOCK_MINUTES : null);
      throw unauthorized('Email or password is incorrect.', 'INVALID_CREDENTIALS');
    }
    if (user.status !== 'active') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account has been suspended. Contact support for help.');
    await userRepo.recordLogin(user.id);
    return { user: await publicUser(user), accessToken: signAccess(user), refreshToken: await issueSession(user.id, client) };
  },

  /**
   * Rotates the refresh token. Presenting an already-rotated token means it was copied or replayed,
   * so its whole session family is revoked. A short grace window tolerates two tabs refreshing at once.
   */
  async refresh(token: string | undefined, client: ClientInfo) {
    if (!token) throw unauthorized('Sign in to continue.', 'NO_SESSION');
    const session = await userRepo.sessionByHash(sha256(token));
    if (!session || session.revoked_at || session.expires_at < new Date()) throw unauthorized('Sign in to continue.', 'NO_SESSION');
    if (session.rotated_at && Date.now() - session.rotated_at.getTime() > 10_000) {
      await userRepo.revokeFamily(session.family_id);
      logger.warn({ userId: session.user_id }, 'Refresh token reuse detected; session family revoked');
      throw unauthorized('Sign in to continue.', 'NO_SESSION');
    }
    const user = await userRepo.byId(session.user_id);
    if (!user || user.status !== 'active') throw unauthorized('This account is not available.', 'NO_SESSION');
    await userRepo.markRotated(session.id);
    return { user: await publicUser(user), accessToken: signAccess(user), refreshToken: await issueSession(user.id, client, session.family_id) };
  },

  async logout(token: string | undefined) {
    if (!token) return;
    const session = await userRepo.sessionByHash(sha256(token));
    if (session) await userRepo.revokeFamily(session.family_id);
  },

  async forgotPassword(email: string) {
    const user = await userRepo.byEmail(email);
    if (!user) return; // The response is identical, so this doesn't reveal which emails are registered.
    const token = randomToken();
    await userRepo.createToken(user.id, 'reset_password', sha256(token), new Date(Date.now() + 36e5));
    await sendMail({ to: user.email, subject: 'Reset your Rolewise password', text: `Reset your password:\n${env.APP_URL}/reset-password?token=${token}\n\nThis link expires in 1 hour. If you didn't ask for this, you can ignore this email.` });
  },

  async resetPassword(token: string, password: string) {
    const row = await userRepo.validToken(sha256(token), 'reset_password');
    if (!row) throw badRequest('This reset link is invalid or has expired. Request a new one.');
    const hash = await hashPassword(password);
    await tx(async (db) => {
      await userRepo.useToken(row.id, db);
      await userRepo.setPassword(row.user_id, hash, db);
      await userRepo.revokeAll(row.user_id, db);
    });
  },

  async verifyEmail(token: string) {
    const row = await userRepo.validToken(sha256(token), 'verify_email');
    if (!row) throw badRequest('This verification link is invalid or has expired. Request a new one from your profile.');
    await tx(async (db) => {
      await userRepo.useToken(row.id, db);
      await userRepo.markVerified(row.user_id, db);
    });
  },

  async resendVerification(userId: number) {
    const user = await userRepo.byId(userId);
    if (user && !user.email_verified_at) await sendVerification(user);
  },

  async changePassword(userId: number, current: string, next: string) {
    const user = await userRepo.byId(userId);
    if (!user || !(await bcrypt.compare(current, user.password_hash))) throw badRequest('Your current password is incorrect.');
    const hash = await hashPassword(next);
    await tx(async (db) => {
      await userRepo.setPassword(userId, hash, db);
      await userRepo.revokeAll(userId, db);
    });
  },
};

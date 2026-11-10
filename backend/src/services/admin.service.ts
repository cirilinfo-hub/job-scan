import { z } from 'zod';
import { exec, json, one, query, tx } from '../config/db';
import { env } from '../config/env';
import { getAiProvider } from '../integrations/ai/provider';
import { isEmailConfigured } from '../integrations/email/mailer';
import { getJobProvider } from '../integrations/jobs/provider';
import { userRepo } from '../repositories/user.repository';
import { badRequest, forbidden, notFound } from '../utils/errors';
import { AuthUser, likeEscape } from '../utils/http';
import { scoringRulesSchema } from './ats/rules';
import { normalize } from './ats/text';
import { catalogService } from './catalog.service';
import { jobService } from './job.service';
import { settingsService } from './settings.service';

export const usersQuery = z.object({
  q: z.string().trim().max(150).optional(), role: z.string().max(30).optional(), status: z.enum(['active', 'suspended']).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['created_at', 'last_active_at', 'full_name', 'email']).default('created_at'), dir: z.enum(['asc', 'desc']).default('desc'),
});
export const userUpdate = z.object({ status: z.enum(['active', 'suspended']).optional(), roles: z.array(z.enum(['super_admin', 'admin', 'job_seeker'])).min(1).optional() });
export const sourceUpdate = z.object({ isEnabled: z.boolean() });
export const nameSchema = z.object({ name: z.string().trim().min(1).max(80), isActive: z.boolean().default(true) });
export const skillSchema = z.object({ name: z.string().trim().min(1).max(80), type: z.enum(['hard', 'soft', 'tool', 'certification']), aliases: z.array(z.string().trim().min(1).max(80)).max(20).default([]), isActive: z.boolean().default(true) });
export const planSchema = z.object({
  code: z.string().trim().regex(/^[a-z0-9_-]+$/).max(30), name: z.string().trim().min(1).max(60), priceCents: z.number().int().min(0), currency: z.string().trim().length(3).toUpperCase().default('USD'),
  limits: z.record(z.string(), z.number().int()), isActive: z.boolean().default(true),
});
export const assignPlanSchema = z.object({ planId: z.number().int().positive(), endsAt: z.coerce.date().nullable().optional() });
export const flagsSchema = z.record(z.string(), z.boolean());
export const aiConfigSchema = z.object({ model: z.string().trim().max(80).nullable().optional() });
export const settingsSchema = z.object({ supportEmail: z.string().trim().max(254).optional(), announcement: z.string().trim().max(300).optional() });
export const logsQuery = z.object({
  level: z.enum(['info', 'warn', 'error']).optional(), action: z.string().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(30),
});

const c = async (sql: string, p: (string | number)[] = []) => (await one<{ c: number }>(sql, p))?.c ?? 0;

export async function audit(actor: AuthUser | null, action: string, target: string | null, detail?: unknown, ip?: string | null, level: 'info' | 'warn' | 'error' = 'info') {
  await exec('INSERT INTO audit_logs (actor_id, level, action, target, detail, ip) VALUES (?,?,?,?,CAST(? AS JSON),?)',
    [actor?.id ?? null, level, action, target, JSON.stringify(detail ?? null), ip ?? null]);
}

export const adminService = {
  async overview(days: number) {
    const [totalUsers, activeUsers, newUsers, uploads, scans, jobs, applications, ai, aiErrors, aiByFeature, signups, scansDaily] = await Promise.all([
      c('SELECT COUNT(*) c FROM users WHERE deleted_at IS NULL'),
      c('SELECT COUNT(*) c FROM users WHERE deleted_at IS NULL AND last_active_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)', [days]),
      c('SELECT COUNT(*) c FROM users WHERE deleted_at IS NULL AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)', [days]),
      c(`SELECT COUNT(*) c FROM resume_versions WHERE change_source = 'upload' AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)`, [days]),
      c('SELECT COUNT(*) c FROM resume_scans WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)', [days]),
      c('SELECT COUNT(*) c FROM jobs WHERE is_active = 1'),
      c('SELECT COUNT(*) c FROM application_status_history WHERE changed_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)', [days]),
      one<{ calls: number; input_tokens: number | null; output_tokens: number | null; cost: number | null }>(
        `SELECT COUNT(*) calls, SUM(input_tokens) input_tokens, SUM(output_tokens) output_tokens, SUM(cost_usd) cost FROM usage_logs WHERE is_ai = 1 AND status = 'ok' AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)`, [days]),
      c(`SELECT COUNT(*) c FROM usage_logs WHERE is_ai = 1 AND status = 'error' AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)`, [days]),
      query(`SELECT feature, COUNT(*) calls, SUM(cost_usd) cost FROM usage_logs WHERE is_ai = 1 AND status = 'ok' AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY) GROUP BY feature ORDER BY calls DESC`, [days]),
      query(`SELECT DATE_FORMAT(created_at, '%Y-%m-%d') day, COUNT(*) c FROM users WHERE deleted_at IS NULL AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY) GROUP BY day ORDER BY day`, [days]),
      query(`SELECT DATE_FORMAT(created_at, '%Y-%m-%d') day, COUNT(*) c FROM resume_scans WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY) GROUP BY day ORDER BY day`, [days]),
    ]);
    return {
      totalUsers, activeUsers, newUsers, uploads, scans, jobs, applications,
      ai: { calls: ai?.calls ?? 0, inputTokens: ai?.input_tokens ?? 0, outputTokens: ai?.output_tokens ?? 0, estimatedCostUsd: ai?.cost ?? null, errors: aiErrors, byFeature: aiByFeature },
      signups, scansDaily,
    };
  },

  async users(q: z.infer<typeof usersQuery>) {
    const clauses = ['u.deleted_at IS NULL'];
    const params: (string | number)[] = [];
    if (q.q) { clauses.push('(u.email LIKE ? OR u.full_name LIKE ?)'); params.push(likeEscape(q.q), likeEscape(q.q)); }
    if (q.status) { clauses.push('u.status = ?'); params.push(q.status); }
    if (q.role) { clauses.push('EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = ?)'); params.push(q.role); }
    const w = clauses.join(' AND ');
    // q.sort and q.dir are restricted to known values by the schema.
    const items = await query(
      `SELECT u.id, u.email, u.full_name, u.status, u.email_verified_at, u.last_active_at, u.created_at,
         (SELECT GROUP_CONCAT(r.code) FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS roles,
         (SELECT p.name FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id WHERE s.user_id = u.id AND s.status = 'active' ORDER BY s.started_at DESC LIMIT 1) AS plan
       FROM users u WHERE ${w} ORDER BY u.${q.sort} ${q.dir} LIMIT ? OFFSET ?`, [...params, q.pageSize, (q.page - 1) * q.pageSize]);
    return { items, total: await c(`SELECT COUNT(*) c FROM users u WHERE ${w}`, params) };
  },

  /** Role rules: only a super admin can grant or remove admin roles or touch a super admin; nobody can lock themselves out. */
  async updateUser(actor: AuthUser, id: number, b: z.infer<typeof userUpdate>, ip: string | null) {
    const target = await userRepo.byId(id);
    if (!target) throw notFound('User');
    const targetRoles = await userRepo.roles(id);
    const isSuper = actor.roles.includes('super_admin');
    const privileged = (roles: string[]) => roles.includes('admin') || roles.includes('super_admin');
    if (!isSuper && (privileged(targetRoles) || (b.roles && privileged(b.roles)))) throw forbidden('Only a super admin can change admin accounts or roles.');
    if (id === actor.id && (b.status === 'suspended' || (b.roles && !b.roles.includes('super_admin') && isSuper))) throw badRequest("You can't suspend yourself or remove your own super admin role.");
    await tx(async (db) => {
      if (b.status) await exec('UPDATE users SET status = ? WHERE id = ?', [b.status, id], db);
      if (b.roles) await userRepo.replaceRoles(id, b.roles, db);
      if (b.status === 'suspended') await userRepo.revokeAll(id, db);
    });
    await audit(actor, 'user.update', `user:${id}`, b, ip);
    return { id, ...b };
  },

  roles: () => query(`SELECT r.id, r.code, r.name, (SELECT COUNT(*) FROM user_roles ur WHERE ur.role_id = r.id) AS user_count FROM roles r ORDER BY r.id`),

  async sources() {
    const rows = await query<{ code: string; config: unknown }>(`SELECT s.*, (SELECT COUNT(*) FROM jobs j WHERE j.source_id = s.id AND j.is_active = 1) AS job_count FROM job_sources s ORDER BY s.name`);
    return rows.map((s) => ({ ...s, config: undefined, missingConfig: getJobProvider(s.code)?.missingConfig() ?? [], hasAdapter: !!getJobProvider(s.code) }));
  },
  async updateSource(actor: AuthUser, id: number, isEnabled: boolean, ip: string | null) {
    const res = await exec('UPDATE job_sources SET is_enabled = ? WHERE id = ?', [isEnabled ? 1 : 0, id]);
    if (!res.affectedRows) throw notFound('Job source');
    await audit(actor, 'source.update', `source:${id}`, { isEnabled }, ip);
  },
  async syncSource(actor: AuthUser, id: number, ip: string | null) {
    const s = await one<{ code: string }>('SELECT code FROM job_sources WHERE id = ?', [id]);
    if (!s) throw notFound('Job source');
    const out = await jobService.syncSource(s.code);
    await audit(actor, 'source.sync', `source:${id}`, out, ip);
    return out;
  },

  categories: () => query(`SELECT c.id, c.name, c.is_active, (SELECT COUNT(*) FROM jobs j WHERE j.category_id = c.id) AS job_count FROM job_categories c ORDER BY c.name`),
  async saveCategory(actor: AuthUser, id: number | null, b: z.infer<typeof nameSchema>, ip: string | null) {
    if (id) await exec('UPDATE job_categories SET name = ?, is_active = ? WHERE id = ?', [b.name, b.isActive ? 1 : 0, id]);
    else await exec('INSERT INTO job_categories (name, is_active) VALUES (?,?)', [b.name, b.isActive ? 1 : 0]);
    await audit(actor, 'category.save', id ? `category:${id}` : null, b, ip);
    return this.categories();
  },
  async removeCategory(actor: AuthUser, id: number, ip: string | null) {
    await exec('DELETE FROM job_categories WHERE id = ?', [id]);
    await audit(actor, 'category.delete', `category:${id}`, null, ip);
  },

  async skills(q: string | undefined, page: number, pageSize: number) {
    const w = q ? 'WHERE name LIKE ?' : '';
    const p = q ? [likeEscape(q)] : [];
    const items = await query<{ aliases: unknown }>(`SELECT id, name, type, aliases, is_active FROM skills ${w} ORDER BY name LIMIT ? OFFSET ?`, [...p, pageSize, (page - 1) * pageSize]);
    return { items: items.map((s) => ({ ...s, aliases: json<string[]>(s.aliases, []) })), total: await c(`SELECT COUNT(*) c FROM skills ${w}`, p) };
  },
  async saveSkill(actor: AuthUser, id: number | null, b: z.infer<typeof skillSchema>, ip: string | null) {
    const params = [b.name, normalize(b.name), b.type, JSON.stringify(b.aliases), b.isActive ? 1 : 0];
    if (id) await exec('UPDATE skills SET name = ?, normalized = ?, type = ?, aliases = CAST(? AS JSON), is_active = ? WHERE id = ?', [...params, id]);
    else await exec('INSERT INTO skills (name, normalized, type, aliases, is_active) VALUES (?,?,?,CAST(? AS JSON),?)', params);
    catalogService.clear();
    await audit(actor, 'skill.save', id ? `skill:${id}` : b.name, b, ip);
  },
  async removeSkill(actor: AuthUser, id: number, ip: string | null) {
    await exec('DELETE FROM skills WHERE id = ?', [id]);
    catalogService.clear();
    await audit(actor, 'skill.delete', `skill:${id}`, null, ip);
  },

  async plans() {
    const rows = await query<{ limits: unknown }>(`SELECT p.*, (SELECT COUNT(*) FROM subscriptions s WHERE s.plan_id = p.id AND s.status = 'active') AS subscribers FROM subscription_plans p ORDER BY p.price_cents`);
    return rows.map((p) => ({ ...p, limits: json(p.limits, {}) }));
  },
  async savePlan(actor: AuthUser, id: number | null, b: z.infer<typeof planSchema>, ip: string | null) {
    const params = [b.code, b.name, b.priceCents, b.currency, JSON.stringify(b.limits), b.isActive ? 1 : 0];
    if (id) await exec('UPDATE subscription_plans SET code = ?, name = ?, price_cents = ?, currency = ?, limits = CAST(? AS JSON), is_active = ? WHERE id = ?', [...params, id]);
    else await exec('INSERT INTO subscription_plans (code, name, price_cents, currency, limits, is_active) VALUES (?,?,?,?,CAST(? AS JSON),?)', params);
    await audit(actor, 'plan.save', id ? `plan:${id}` : b.code, b, ip);
    return this.plans();
  },
  /** Records a plan for a user by hand. No payment provider is connected, so this doesn't charge anyone. */
  async assignPlan(actor: AuthUser, userId: number, planId: number, endsAt: Date | null, ip: string | null) {
    if (!(await userRepo.byId(userId))) throw notFound('User');
    if (!(await one('SELECT id FROM subscription_plans WHERE id = ?', [planId]))) throw notFound('Plan');
    await tx(async (db) => {
      await exec(`UPDATE subscriptions SET status = 'cancelled', ends_at = UTC_TIMESTAMP() WHERE user_id = ? AND status = 'active'`, [userId], db);
      await exec('INSERT INTO subscriptions (user_id, plan_id, ends_at) VALUES (?,?,?)', [userId, planId, endsAt], db);
    });
    await audit(actor, 'subscription.assign', `user:${userId}`, { planId, endsAt }, ip);
  },

  features: () => settingsService.get<Record<string, boolean>>('feature_flags', {}),
  async setFeatures(actor: AuthUser, flags: Record<string, boolean>, ip: string | null) {
    await settingsService.set('feature_flags', flags);
    await audit(actor, 'features.update', null, flags, ip);
    return flags;
  },

  scoring: () => settingsService.get('scoring_rules', {}),
  async setScoring(actor: AuthUser, rules: z.infer<typeof scoringRulesSchema>, ip: string | null) {
    await settingsService.set('scoring_rules', rules);
    await audit(actor, 'scoring.update', null, rules, ip);
    return rules;
  },

  /** API keys stay in environment variables and are never returned; this reports only whether one is set. */
  async aiConfig() {
    const p = getAiProvider();
    const config = await settingsService.get<{ model?: string | null }>('ai_config', {});
    return {
      provider: p.name, configured: p.isConfigured(), enabled: await settingsService.feature('ai'), envModel: env.AI_MODEL ?? null, modelOverride: config.model ?? null,
      costTracking: env.AI_COST_INPUT_PER_MTOK !== undefined && env.AI_COST_OUTPUT_PER_MTOK !== undefined,
      emailConfigured: isEmailConfigured(),
      howToConfigure: 'Set AI_PROVIDER and the matching API key as server environment variables, then restart the app.',
    };
  },
  async setAiConfig(actor: AuthUser, b: z.infer<typeof aiConfigSchema>, ip: string | null) {
    await settingsService.set('ai_config', { model: b.model || null });
    await audit(actor, 'ai.config', null, b, ip);
    return this.aiConfig();
  },
  /** Sends a tiny real request to the configured provider and reports the actual outcome. */
  async aiTest(actor: AuthUser, ip: string | null) {
    const p = getAiProvider();
    if (!p.isConfigured()) return { ok: false, message: 'No AI provider is configured on this server.' };
    try {
      const model = (await settingsService.get<{ model?: string }>('ai_config', {})).model || undefined;
      const out = await p.complete({ system: 'Reply with the single word OK.', user: 'Connection test.', maxTokens: 64, model });
      await audit(actor, 'ai.test', null, { ok: true, model: out.model }, ip);
      return { ok: true, message: `Connected. ${out.model} responded.`, model: out.model };
    } catch (err) {
      await audit(actor, 'ai.test', null, { ok: false, message: (err as Error).message }, ip, 'warn');
      return { ok: false, message: (err as Error).message };
    }
  },

  async logs(q: z.infer<typeof logsQuery>) {
    const clauses: string[] = [];
    const params: (string | number)[] = [];
    if (q.level) { clauses.push('l.level = ?'); params.push(q.level); }
    if (q.action) { clauses.push('l.action LIKE ?'); params.push(likeEscape(q.action)); }
    const w = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const items = await query(`SELECT l.id, l.level, l.action, l.target, l.detail, l.ip, l.created_at, u.email AS actor FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id ${w} ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?`, [...params, q.pageSize, (q.page - 1) * q.pageSize]);
    return { items, total: await c(`SELECT COUNT(*) c FROM audit_logs l ${w}`, params) };
  },

  settings: () => settingsService.get<Record<string, unknown>>('app_settings', {}),
  async setSettings(actor: AuthUser, b: z.infer<typeof settingsSchema>, ip: string | null) {
    const merged = { ...(await this.settings()), ...b };
    await settingsService.set('app_settings', merged);
    await audit(actor, 'settings.update', null, b, ip);
    return merged;
  },
};

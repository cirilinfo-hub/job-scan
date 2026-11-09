import { exec, json, one } from '../config/db';

export interface UsageEntry {
  userId: number | null; feature: string; isAi?: boolean; provider?: string; model?: string;
  inputTokens?: number; outputTokens?: number; costUsd?: number | null; status?: 'ok' | 'error' | 'blocked';
}

export const usageRepo = {
  async log(e: UsageEntry): Promise<void> {
    await exec(
      `INSERT INTO usage_logs (user_id, feature, is_ai, provider, model, input_tokens, output_tokens, cost_usd, status) VALUES (?,?,?,?,?,?,?,?,?)`,
      [e.userId, e.feature, e.isAi ? 1 : 0, e.provider ?? null, e.model ?? null, e.inputTokens ?? null, e.outputTokens ?? null, e.costUsd ?? null, e.status ?? 'ok'],
    );
  },
  async monthlyCount(userId: number, feature: string): Promise<number> {
    const r = await one<{ c: number }>(
      `SELECT COUNT(*) c FROM usage_logs WHERE user_id = ? AND feature = ? AND status = 'ok' AND created_at >= DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-01')`, [userId, feature]);
    return r?.c ?? 0;
  },
  async monthlyAiCalls(userId: number): Promise<number> {
    const r = await one<{ c: number }>(
      `SELECT COUNT(*) c FROM usage_logs WHERE user_id = ? AND is_ai = 1 AND status = 'ok' AND created_at >= DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-01')`, [userId]);
    return r?.c ?? 0;
  },
  /** Active subscription's limits, or the free plan's when the user has none. A negative limit means unlimited. */
  async planLimits(userId: number): Promise<Record<string, number>> {
    const row = await one<{ limits: unknown }>(
      `SELECT p.limits FROM subscriptions s JOIN subscription_plans p ON p.id = s.plan_id
       WHERE s.user_id = ? AND s.status = 'active' AND (s.ends_at IS NULL OR s.ends_at > UTC_TIMESTAMP())
       ORDER BY s.started_at DESC LIMIT 1`, [userId])
      ?? await one<{ limits: unknown }>(`SELECT limits FROM subscription_plans WHERE code = 'free' LIMIT 1`);
    return json<Record<string, number>>(row?.limits, {});
  },
};

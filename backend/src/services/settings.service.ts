import { exec, json, one, query } from '../config/db';

const TTL_MS = 30_000;
const cache = new Map<string, { value: unknown; at: number }>();

export const settingsService = {
  async get<T>(key: string, fallback: T): Promise<T> {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T;
    const row = await one<{ setting_value: unknown }>('SELECT setting_value FROM system_settings WHERE setting_key = ?', [key]);
    const value = row ? json<T>(row.setting_value, fallback) : fallback;
    cache.set(key, { value, at: Date.now() });
    return value;
  },
  async set(key: string, value: unknown, description?: string): Promise<void> {
    await exec(
      `INSERT INTO system_settings (setting_key, setting_value, description) VALUES (?, CAST(? AS JSON), ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), description = COALESCE(VALUES(description), description)`,
      [key, JSON.stringify(value), description ?? null]);
    cache.delete(key);
  },
  async all() {
    return query<{ setting_key: string; setting_value: unknown; description: string | null; updated_at: Date }>('SELECT * FROM system_settings ORDER BY setting_key');
  },
  async feature(name: string): Promise<boolean> {
    const flags = await this.get<Record<string, boolean>>('feature_flags', {});
    return flags[name] !== false;
  },
  clearCache(): void { cache.clear(); },
};

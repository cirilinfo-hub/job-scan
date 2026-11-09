import { json, query } from '../config/db';
import { SkillEntry } from '../interfaces/resume';
import { normalize } from './ats/text';

let cache: { at: number; list: SkillEntry[] } | null = null;

export const catalogService = {
  async skills(): Promise<SkillEntry[]> {
    if (cache && Date.now() - cache.at < 300_000) return cache.list;
    const rows = await query<{ id: number; name: string; type: SkillEntry['type']; aliases: unknown }>('SELECT id, name, type, aliases FROM skills WHERE is_active = 1');
    const list = rows.map((r) => ({ id: r.id, name: r.name, type: r.type, terms: [...new Set([r.name, ...json<string[]>(r.aliases, [])].map(normalize))] }));
    cache = { at: Date.now(), list };
    return list;
  },
  clear() { cache = null; },
};

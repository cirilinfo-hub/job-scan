import { exec, one, pool } from '../config/db';
import { env } from '../config/env';
import { hashPassword } from '../services/auth.service';
import { DEFAULT_SCORING_RULES } from '../services/ats/rules';
import { normalize } from '../services/ats/text';
import { settingsService } from '../services/settings.service';
import { FEATURE_FLAGS, JOB_SOURCES, PLANS, QUESTIONS, SKILLS } from './seed-data';

/** Reference data only, and safe to re-run. It creates no sample users, resumes or jobs. */
export async function seedReference(): Promise<void> {
  for (const [code, name] of [['super_admin', 'Super Admin'], ['admin', 'Admin'], ['job_seeker', 'Job Seeker']]) {
    await exec('INSERT INTO roles (code, name) VALUES (?,?) ON DUPLICATE KEY UPDATE name = VALUES(name)', [code, name]);
  }
  for (const [name, type, aliases] of SKILLS) {
    await exec('INSERT INTO skills (name, normalized, type, aliases) VALUES (?,?,?,CAST(? AS JSON)) ON DUPLICATE KEY UPDATE id = id', [name, normalize(name), type, JSON.stringify(aliases ?? [])]);
  }
  for (const s of JOB_SOURCES) {
    await exec('INSERT INTO job_sources (code, name, homepage, attribution) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE name = VALUES(name), homepage = VALUES(homepage), attribution = VALUES(attribution)', [s.code, s.name, s.homepage, s.attribution]);
  }
  for (const p of PLANS) {
    await exec('INSERT INTO subscription_plans (code, name, price_cents, limits) VALUES (?,?,?,CAST(? AS JSON)) ON DUPLICATE KEY UPDATE id = id', [p.code, p.name, p.price, JSON.stringify(p.limits)]);
  }
  for (const [category, family, question, guidance, sample] of QUESTIONS) {
    const exists = await one('SELECT id FROM interview_questions WHERE user_id IS NULL AND question = ?', [question]);
    if (!exists) await exec(`INSERT INTO interview_questions (category, role_family, question, guidance, sample_answer, source) VALUES (?,?,?,?,?,'bank')`, [category, family, question, guidance, sample]);
  }
  const put = async (key: string, value: unknown, description: string) => {
    if (!(await one('SELECT setting_key FROM system_settings WHERE setting_key = ?', [key]))) await settingsService.set(key, value, description);
  };
  await put('scoring_rules', DEFAULT_SCORING_RULES, 'Weights and deductions used by the resume scanner');
  await put('feature_flags', FEATURE_FLAGS, 'Turns product features on or off');
  await put('ai_config', { model: null }, 'Optional model override; API keys live in environment variables');
  await put('app_settings', { supportEmail: '', announcement: '' }, 'General application settings');
}

/** Creates the first super admin from environment variables. It never overwrites an existing account's password. */
export async function seedAdmin(): Promise<void> {
  const { SEED_ADMIN_EMAIL: email, SEED_ADMIN_PASSWORD: password } = env;
  if (!email || !password) { console.log('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are not set; skipped creating a super admin.'); return; }
  const existing = await one<{ id: number }>('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
  const id = existing?.id ?? (await exec('INSERT INTO users (email, password_hash, full_name, email_verified_at) VALUES (?,?,?,UTC_TIMESTAMP())', [email.toLowerCase(), await hashPassword(password), 'Administrator'])).insertId;
  await exec(`INSERT IGNORE INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'super_admin'`, [id]);
  await exec(`INSERT IGNORE INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = 'job_seeker'`, [id]);
  console.log(`Super admin ready: ${email}`);
}

if (require.main === module) {
  seedReference().then(seedAdmin).then(() => { console.log('Seed complete.'); return pool.end(); }).catch((e) => { console.error(e); process.exit(1); });
}

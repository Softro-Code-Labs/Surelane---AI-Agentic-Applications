import { z } from 'zod';
import { decrypt } from './crypto';
import type { CandidateProfile } from './cv/parse';
import { one, q } from './db';

export type Settings = {
  agent_enabled: boolean; slot_morning: boolean; slot_midday: boolean; slot_evening: boolean; schedule_changed_at: Date;
  global_enabled: boolean; preferred_countries: string[]; preferred_locations: string[]; industries: string[];
  categories: string[]; extra_keywords: string[]; remote_pref: 'any' | 'remote' | 'hybrid' | 'onsite';
  min_score: number; max_post_age_days: number; custom_feeds: string[];
  email_enabled: boolean; email_recipient: string | null; email_mode: 'all' | 'strong'; email_no_results: 'summary' | 'silent';
  updated_at: Date;
};

export async function getSettings(): Promise<Settings> {
  return (await one<Settings>('SELECT * FROM settings WHERE id = 1'))!;
}

const list = z.array(z.string().trim().min(1).max(200)).max(50);
export const settingsPatch = z.object({
  agent_enabled: z.boolean(), slot_morning: z.boolean(), slot_midday: z.boolean(), slot_evening: z.boolean(),
  global_enabled: z.boolean(), preferred_countries: list, preferred_locations: list, industries: list, categories: list,
  extra_keywords: list, remote_pref: z.enum(['any', 'remote', 'hybrid', 'onsite']),
  min_score: z.number().int().min(45).max(95), max_post_age_days: z.number().int().min(1).max(90),
  custom_feeds: list, email_enabled: z.boolean(),
  email_recipient: z.string().trim().email().max(200).nullable(), email_mode: z.enum(['all', 'strong']),
  email_no_results: z.enum(['summary', 'silent']),
}).partial().strict();

const SCHEDULE_FIELDS = ['agent_enabled', 'slot_morning', 'slot_midday', 'slot_evening'];

export async function updateSettings(patch: z.infer<typeof settingsPatch>, now = new Date()): Promise<Settings> {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (!keys.length) return getSettings();
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  const params: unknown[] = [now, ...keys.map((k) => patch[k])];
  if (keys.some((k) => SCHEDULE_FIELDS.includes(k))) sets.push('schedule_changed_at = $1');
  sets.push('updated_at = $1');
  await q(`UPDATE settings SET ${sets.join(', ')} WHERE id = 1`, params);
  return getSettings();
}

export type CvRow = {
  file_name: string; mime: string; size_bytes: number; profile: CandidateProfile; profile_engine: string;
  profile_version: string; uploaded_at: Date;
};

export async function getCv(): Promise<CvRow | null> {
  return one<CvRow>('SELECT file_name, mime, size_bytes, profile, profile_engine, profile_version, uploaded_at FROM cv WHERE id = 1');
}

export async function getCvText(): Promise<string> {
  const row = await one<{ text_enc: Buffer }>('SELECT text_enc FROM cv WHERE id = 1');
  return row ? decrypt(row.text_enc).toString('utf8') : '';
}

/** The one definition of "this job may be recommended". Used by pages and email. */
export const RECOMMENDABLE = `
  j.status = 'active'
  AND (j.deadline IS NULL OR j.deadline >= now())
  AND (j.verified_at > now() - interval '72 hours' OR j.source = 'manual')
  AND j.tier IS NOT NULL`;

export const scopeSql = (s: Pick<Settings, 'global_enabled'>) => (s.global_enabled ? '' : `AND j.market <> 'international'`);

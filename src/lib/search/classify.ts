import { looksClosed } from '../sources/http';
import type { RawJob } from '../sources/types';

const LK = /\b(sri lanka|ceylon|colombo|kandy|galle|jaffna|gampaha|negombo|kurunegala|matara|ratnapura|batticaloa|kalutara|kegalle|puttalam|vavuniya|trincomalee|anuradhapura|badulla|moratuwa|malabe|nugegoda|dehiwala|kelaniya|katunayake|rajagiriya|kaduwela)\b/i;

export type Market = 'sri_lanka' | 'remote_lk' | 'international';

export function classify(j: RawJob): { market: Market; country: string | null; workMode: NonNullable<RawJob['workMode']>; slEligibility: 'yes' | 'no' | 'unknown' } {
  const workMode = j.workMode ?? 'unknown';
  const inLk = j.country === 'Sri Lanka' || LK.test(j.location);
  if (inLk && !(workMode === 'remote' && j.slEligibility === 'no')) {
    return { market: 'sri_lanka', country: 'Sri Lanka', workMode, slEligibility: 'yes' };
  }
  if (workMode === 'remote' && j.slEligibility === 'yes') {
    return { market: 'remote_lk', country: j.country ?? null, workMode, slEligibility: 'yes' };
  }
  return { market: 'international', country: j.country ?? (j.location.split(',').pop()?.trim() || null), workMode, slEligibility: j.slEligibility ?? 'unknown' };
}

export type FilterSettings = {
  local_enabled: boolean; global_enabled: boolean; max_post_age_days: number; remote_pref: string; preferred_countries: string[];
};

export type Rejection = { kind: 'expired' | 'closed' | 'outdated' | 'scope' | 'preference'; reason: string };

/** Decides whether a listing may enter the database at all. */
export function rejectReason(j: RawJob, market: Market, workMode: string, eligibility: string, s: FilterSettings, now: Date): Rejection | null {
  if (j.deadline && j.deadline < now) return { kind: 'expired', reason: 'Application deadline has passed' };
  if (looksClosed(`${j.title}\n${j.description.slice(0, 3000)}`)) return { kind: 'closed', reason: 'The listing says applications are closed' };
  const stillOpen = j.deadline && j.deadline >= now;
  if (!stillOpen && j.postedAt && now.getTime() - j.postedAt.getTime() > s.max_post_age_days * 86_400_000) {
    return { kind: 'outdated', reason: `Posted more than ${s.max_post_age_days} days ago with no later deadline` };
  }
  if (market === 'sri_lanka' && !s.local_enabled) return { kind: 'scope', reason: 'A job in Sri Lanka, and Local job opportunities are off' };
  if (market !== 'sri_lanka' && !s.global_enabled) return { kind: 'scope', reason: 'An international job, and Global job opportunities are off' };
  if (s.remote_pref !== 'any' && workMode !== 'unknown' && workMode !== s.remote_pref) {
    return { kind: 'preference', reason: `Not a ${s.remote_pref} role` };
  }
  if (market === 'international' && eligibility !== 'yes' && s.preferred_countries.length) {
    const hay = `${j.location} ${j.country ?? ''}`.toLowerCase();
    if (!s.preferred_countries.some((c) => hay.includes(c.toLowerCase()))) return { kind: 'preference', reason: 'Outside your preferred countries' };
  }
  return null;
}

import type { CandidateProfile } from './cv/parse';
import type { Settings } from './settings';

const unique = (xs: string[]) => [...new Map(xs.map((x) => [x.trim().toLowerCase(), x.trim()])).values()].filter(Boolean);

/** Roles to search for: your own keywords first, then the roles your CV points to. */
export function cvRoles(p: Pick<CandidateProfile, 'targetTitles'>, s: Pick<Settings, 'extra_keywords'>, max = 3): string[] {
  return unique([...s.extra_keywords, ...p.targetTitles.map((t) => t.replace(/[()|].*$/, ''))]).filter((t) => t.length > 2).slice(0, max);
}

export function cvSkills(p: Pick<CandidateProfile, 'skills'>, max = 3): string[] {
  return unique(p.skills).slice(0, max);
}

/** Sri Lanka's districts, as job sites name them in their location filters. */
export const DISTRICTS = [
  'Colombo', 'Gampaha', 'Kalutara', 'Kandy', 'Matale', 'Nuwara Eliya', 'Galle', 'Matara', 'Hambantota', 'Jaffna', 'Kilinochchi', 'Mannar', 'Vavuniya',
  'Mullaitivu', 'Batticaloa', 'Ampara', 'Trincomalee', 'Kurunegala', 'Puttalam', 'Anuradhapura', 'Polonnaruwa', 'Badulla', 'Monaragala', 'Ratnapura', 'Kegalle',
];

/** Your first preferred location, when it is a Sri Lankan district that job sites can filter by. */
export function cvDistrict(s: Pick<Settings, 'preferred_locations'>): string | null {
  for (const loc of s.preferred_locations) {
    const want = loc.trim().toLowerCase().replace(/moneragala/, 'monaragala');
    const hit = DISTRICTS.find((d) => d.toLowerCase() === want);
    if (hit) return hit;
  }
  return null;
}

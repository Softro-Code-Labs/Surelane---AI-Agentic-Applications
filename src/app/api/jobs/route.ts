import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth';
import { one } from '@/lib/db';
import { requirementLines, scoreJob } from '@/lib/match/score';
import { classify } from '@/lib/search/classify';
import { getCv, getSettings } from '@/lib/settings';
import { jobFingerprint, safeUrl } from '@/lib/text';

const body = z.object({
  url: z.string().trim().max(1000), title: z.string().trim().min(2).max(200), company: z.string().trim().min(1).max(200),
  location: z.string().trim().max(200).default('Sri Lanka'), description: z.string().trim().min(30).max(30000), deadline: z.string().optional(),
});

/** Saves a vacancy you found yourself, for example on LinkedIn, and scores it. */
export async function POST(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter the title, company and at least a few lines of the job description.' }, { status: 400 });
  const j = parsed.data;
  const url = safeUrl(j.url);
  if (!url) return NextResponse.json({ error: 'Enter the full link to the job, starting with https://' }, { status: 400 });
  const cv = await getCv();
  if (!cv) return NextResponse.json({ error: 'Upload your CV first, so this job can be scored.' }, { status: 409 });
  const deadline = j.deadline ? new Date(j.deadline) : null;
  const raw = { source: 'manual', sourceLabel: 'Added by you', url, title: j.title, company: j.company, location: j.location, description: j.description, deadline };
  const c = classify(raw);
  const m = scoreJob({ title: j.title, description: j.description, location: j.location, workMode: c.workMode }, cv.profile, await getSettings());
  const row = await one<{ id: string }>(
    `INSERT INTO jobs (fingerprint, source, source_label, url, sources, title, company, location, country, market, work_mode, sl_eligibility, deadline, description,
       requirements, verified_at, verify_method, score, tier, scored_by, matching_skills, missing_skills, mandatory_missing, explanation, suitability, profile_version, notified_at)
     VALUES ($1,'manual','Added by you',$2,'[]'::jsonb,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),'added_by_you',$13,$14,'rules',$15,$16,$17,$18,$19,$20,now())
     ON CONFLICT (fingerprint) DO UPDATE SET last_seen_at=now() RETURNING id`,
    [jobFingerprint({ title: j.title, company: j.company, location: j.location, workMode: c.workMode }), url, j.title, j.company, j.location, c.country, c.market, c.workMode, c.slEligibility,
      deadline, j.description, requirementLines(j.description).required, m.score, m.tier ?? 'Potential', m.matchingSkills, m.missingSkills, m.mandatoryMissing, m.explanation, m.suitability, cv.profile_version]);
  return NextResponse.json({ ok: true, id: row!.id });
}

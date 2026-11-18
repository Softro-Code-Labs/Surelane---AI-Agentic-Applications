import { q } from '../db';
import { safeUrl } from '../text';
import { feedSource, fixedSources } from './adapters';
import { careerPageSource, findersSource, type CareerPage } from './career';
import type { SourceAdapter, SourceContext } from './types';

/** Every source this configuration can use. */
export function buildSources(settings: { custom_feeds: string[] }, pages: CareerPage[] = []): SourceAdapter[] {
  const feeds = settings.custom_feeds.flatMap((feed) => (safeUrl(feed) ? [feedSource(safeUrl(feed)!)] : []));
  return [...fixedSources(), findersSource, ...pages.map(careerPageSource), ...feeds];
}

export async function enabledCareerPages(): Promise<CareerPage[]> {
  return q<CareerPage>(`SELECT id, company, url, default_location FROM career_pages WHERE enabled ORDER BY last_checked_at NULLS FIRST, id`);
}

/** Categories already used on the career pages list, A to Z, for the category dropdown. */
export async function existingCategories(): Promise<string[]> {
  const rows = await q<{ category: string }>(`SELECT DISTINCT category FROM career_pages WHERE category IS NOT NULL ORDER BY category`);
  return rows.map((r) => r.category);
}

export function liveContext(over: Partial<SourceContext> = {}): SourceContext {
  return {
    fetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: new Date(), keywords: [],
    settings: { local_enabled: true, global_enabled: true, custom_feeds: [] }, env: process.env, robotsCache: new Map(), ...over,
  };
}

export async function saveOutcome(id: string, o: { status: string; message: string; jobs: unknown[] }, at: Date) {
  await q(`UPDATE career_pages SET last_status=$2, last_message=$3, last_found=$4, last_checked_at=$5 WHERE id=$1`, [id, o.status, o.message, o.jobs.length, at]);
}

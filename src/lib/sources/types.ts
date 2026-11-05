export type RawJob = {
  source: string;
  sourceLabel: string;
  sourceJobId?: string | null;
  url: string;
  title: string;
  company: string;
  location: string;
  country?: string | null;
  workMode?: 'remote' | 'hybrid' | 'onsite' | 'unknown';
  /** Set when the source states eligibility explicitly. */
  slEligibility?: 'yes' | 'no' | 'unknown';
  employmentType?: string | null;
  category?: string | null;
  salary?: string | null;
  postedAt?: Date | null;
  deadline?: Date | null;
  description: string;
  companyInfo?: string | null;
};

export type SourceSettings = {
  global_enabled: boolean;
  custom_feeds: string[];
};

export type SourceContext = {
  fetch: typeof fetch;
  sleep: (ms: number) => Promise<void>;
  now: Date;
  keywords: string[];
  settings: SourceSettings;
  env: Record<string, string | undefined>;
  robotsCache: Map<string, Promise<{ isAllowed: (u: string, ua?: string) => boolean | undefined }>>;
  /** Replaces DNS lookups in tests. */
  resolveHost?: (host: string) => Promise<string[]>;
  /** Vacancies already stored, so their pages are not opened again. */
  knownJobs?: Map<string, unknown>;
  /** Shared limit on job pages opened during one search. */
  detailBudget?: { left: number };
};

export type VerifyState = 'active' | 'closed' | 'unknown';

export type SourceAdapter = {
  id: string;
  label: string;
  region: 'Sri Lanka' | 'Remote' | 'Company board' | 'Your feed';
  /** local = usable with Global off; global = only with Global on. */
  scope: 'local' | 'global';
  /** Most requests a day the provider asks for, if it sets a limit. */
  maxPerDay?: number;
  /** True when a response lists every open job, so absence means closed. */
  completeListing?: boolean;
  /** With completeListing: an empty result proves that every job has closed. */
  emptyMeansClosed?: boolean;
  careerPageId?: string;
  outcome?: { status: string; message: string; jobs: unknown[] };
  note: string;
  missingConfig?: (ctx: SourceContext) => string | null;
  search: (ctx: SourceContext) => Promise<RawJob[]>;
  /** Provider's own open/closed check, used in preference to a page check. */
  verify?: (ids: { id: number; sourceJobId: string | null; url: string }[], ctx: SourceContext) => Promise<Map<number, VerifyState>>;
};

export class SourceError extends Error {}
/** The source was deliberately left alone, which is not a failure. */
export class SourceSkip extends SourceError {}

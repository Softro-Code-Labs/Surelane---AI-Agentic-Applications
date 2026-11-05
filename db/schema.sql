-- Surelane schema. Safe to run repeatedly.
-- Retention classes:
--   KEPT UNTIL YOU DELETE THEM: users, settings, cv, applications, career_pages
--   ROLLING 30 DAYS: jobs, search_runs, search_run_sources, search_requests,
--                    search_results, notifications, ai_tasks, cleanup_runs

CREATE SEQUENCE IF NOT EXISTS cv_version_seq;

-- ── Kept until manually deleted ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),   -- single-owner app
  email text NOT NULL,
  name text,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  agent_enabled boolean NOT NULL DEFAULT true,
  slot_morning boolean NOT NULL DEFAULT true,
  slot_midday boolean NOT NULL DEFAULT true,
  slot_evening boolean NOT NULL DEFAULT true,
  schedule_changed_at timestamptz NOT NULL DEFAULT now(),
  global_enabled boolean NOT NULL DEFAULT false,
  preferred_countries text[] NOT NULL DEFAULT '{}',
  preferred_locations text[] NOT NULL DEFAULT '{}',
  industries text[] NOT NULL DEFAULT '{}',
  categories text[] NOT NULL DEFAULT '{}',
  extra_keywords text[] NOT NULL DEFAULT '{}',
  remote_pref text NOT NULL DEFAULT 'any' CHECK (remote_pref IN ('any','remote','hybrid','onsite')),
  min_score integer NOT NULL DEFAULT 50 CHECK (min_score BETWEEN 0 AND 100),
  max_post_age_days integer NOT NULL DEFAULT 30 CHECK (max_post_age_days BETWEEN 1 AND 90),
  custom_feeds text[] NOT NULL DEFAULT '{}',
  email_enabled boolean NOT NULL DEFAULT true,
  email_recipient text,
  email_mode text NOT NULL DEFAULT 'all' CHECK (email_mode IN ('all','strong')),
  email_no_results text NOT NULL DEFAULT 'summary' CHECK (email_no_results IN ('summary','silent')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS cv (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),   -- only one active CV can exist
  file_name text NOT NULL,
  mime text NOT NULL,
  size_bytes integer NOT NULL,
  file_enc bytea NOT NULL,                            -- AES-256-GCM
  text_enc bytea NOT NULL,                            -- AES-256-GCM
  profile jsonb NOT NULL,
  profile_engine text NOT NULL DEFAULT 'rules',
  profile_version bigint NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS applications (
  id bigserial PRIMARY KEY,
  job_id bigint,                                      -- FK added below; survives job deletion
  title text NOT NULL,
  company text,
  location text,
  url text,
  market text,
  deadline timestamptz,
  score integer,
  tier text,
  status text NOT NULL DEFAULT 'Saved'
    CHECK (status IN ('Saved','Interested','Applied','Interview','Shortlisted','Rejected','Offer Received')),
  notes text NOT NULL DEFAULT '',
  cover_letter text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Your list of company career pages. Results of checks are stored here, not in logs.
CREATE TABLE IF NOT EXISTS career_pages (
  id bigserial PRIMARY KEY,
  company text NOT NULL,
  url text NOT NULL UNIQUE,
  default_location text NOT NULL DEFAULT 'Sri Lanka',
  enabled boolean NOT NULL DEFAULT true,
  last_status text CHECK (last_status IN ('ok','no_jobs','needs_browser','not_allowed','error')),
  last_message text,
  last_found integer NOT NULL DEFAULT 0,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Older installs kept company boards as a settings list. Move them across once.
DO $$
DECLARE entry text; provider text; slug text;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'settings' AND column_name = 'company_boards') THEN
    FOR entry IN EXECUTE 'SELECT unnest(company_boards) FROM settings WHERE id = 1' LOOP
      provider := split_part(entry, ':', 1); slug := split_part(entry, ':', 2);
      INSERT INTO career_pages (company, url) VALUES (initcap(slug), CASE provider
        WHEN 'lever' THEN 'https://jobs.lever.co/' WHEN 'greenhouse' THEN 'https://boards.greenhouse.io/'
        WHEN 'ashby' THEN 'https://jobs.ashbyhq.com/' ELSE 'https://jobs.smartrecruiters.com/' END || slug)
      ON CONFLICT (url) DO NOTHING;
    END LOOP;
    ALTER TABLE settings DROP COLUMN company_boards;
  END IF;
END $$;

-- ── Rolling 30-day data ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id bigserial PRIMARY KEY,
  fingerprint text NOT NULL UNIQUE,                   -- duplicate detection across sources
  source text NOT NULL,
  source_label text NOT NULL,
  source_job_id text,
  url text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]',
  title text NOT NULL,
  company text NOT NULL,
  location text NOT NULL DEFAULT '',
  country text,
  market text NOT NULL CHECK (market IN ('sri_lanka','remote_lk','international')),
  work_mode text NOT NULL DEFAULT 'unknown' CHECK (work_mode IN ('remote','hybrid','onsite','unknown')),
  sl_eligibility text NOT NULL DEFAULT 'unknown' CHECK (sl_eligibility IN ('yes','no','unknown')),
  employment_type text,
  category text,
  salary text,
  posted_at timestamptz,
  deadline timestamptz,
  description text NOT NULL DEFAULT '',
  company_info text,
  requirements text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','closed','outdated')),
  status_reason text,
  verified_at timestamptz,
  verify_method text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),    -- retention clock
  score integer,
  tier text CHECK (tier IN ('Strong','Good','Potential')),
  scored_by text,
  matching_skills text[] NOT NULL DEFAULT '{}',
  missing_skills text[] NOT NULL DEFAULT '{}',
  mandatory_missing text[] NOT NULL DEFAULT '{}',
  explanation text,
  suitability text,
  profile_version bigint,
  notified_at timestamptz
);
CREATE INDEX IF NOT EXISTS jobs_last_seen_idx ON jobs (last_seen_at);
CREATE INDEX IF NOT EXISTS jobs_first_seen_idx ON jobs (first_seen_at);
CREATE INDEX IF NOT EXISTS jobs_active_score_idx ON jobs (status, score DESC);
CREATE INDEX IF NOT EXISTS jobs_unnotified_idx ON jobs (score DESC) WHERE notified_at IS NULL AND status = 'active';

DO $$ BEGIN
  ALTER TABLE applications ADD CONSTRAINT applications_job_fk
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS applications_job_unique ON applications (job_id) WHERE job_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS search_runs (
  id bigserial PRIMARY KEY,
  trigger text NOT NULL CHECK (trigger IN ('scheduled','manual')),
  slot_key text,
  slot_date date,
  status text NOT NULL CHECK (status IN ('running','completed','partial','failed','cancelled','skipped','missed')),
  mode text NOT NULL DEFAULT 'local',
  started_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  jobs_found integer NOT NULL DEFAULT 0,
  jobs_new integer NOT NULL DEFAULT 0,
  matches integer NOT NULL DEFAULT 0,
  strong integer NOT NULL DEFAULT 0,
  good integer NOT NULL DEFAULT 0,
  potential integer NOT NULL DEFAULT 0,
  filtered_outdated integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]',
  summary text
);
-- A slot can only ever be claimed once, however many triggers fire.
CREATE UNIQUE INDEX IF NOT EXISTS search_runs_slot_unique ON search_runs (slot_date, slot_key) WHERE slot_key IS NOT NULL;
-- Only one search may run at a time.
CREATE UNIQUE INDEX IF NOT EXISTS search_runs_one_running ON search_runs ((1)) WHERE status = 'running';
CREATE INDEX IF NOT EXISTS search_runs_started_idx ON search_runs (started_at);

CREATE TABLE IF NOT EXISTS search_run_sources (
  id bigserial PRIMARY KEY,
  run_id bigint NOT NULL REFERENCES search_runs(id) ON DELETE CASCADE,
  source text NOT NULL,
  label text NOT NULL,
  status text NOT NULL CHECK (status IN ('success','failed','skipped')),
  jobs_found integer NOT NULL DEFAULT 0,
  error text,
  duration_ms integer NOT NULL DEFAULT 0,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS run_sources_run_idx ON search_run_sources (run_id);
CREATE INDEX IF NOT EXISTS run_sources_checked_idx ON search_run_sources (checked_at);
CREATE INDEX IF NOT EXISTS run_sources_source_idx ON search_run_sources (source, checked_at DESC);

CREATE TABLE IF NOT EXISTS search_requests (
  id bigserial PRIMARY KEY,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','cancelled')),
  run_id bigint REFERENCES search_runs(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS search_requests_time_idx ON search_requests (requested_at);

CREATE TABLE IF NOT EXISTS search_results (
  run_id bigint NOT NULL REFERENCES search_runs(id) ON DELETE CASCADE,
  job_id bigint NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  is_new boolean NOT NULL DEFAULT false,
  score integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, job_id)
);
CREATE INDEX IF NOT EXISTS search_results_time_idx ON search_results (created_at);
CREATE INDEX IF NOT EXISTS search_results_job_idx ON search_results (job_id);

CREATE TABLE IF NOT EXISTS notifications (
  id bigserial PRIMARY KEY,
  run_id bigint REFERENCES search_runs(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('matches','no_results','test')),
  recipient text NOT NULL,
  subject text NOT NULL,
  job_count integer NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('sent','failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_time_idx ON notifications (created_at);

-- Temporary AI processing data.
CREATE TABLE IF NOT EXISTS ai_tasks (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('cv_profile','cover_letter','job_summary','cv_improve','career_recs')),
  job_id bigint REFERENCES jobs(id) ON DELETE CASCADE,
  profile_version bigint,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','done','failed')),
  engine text NOT NULL DEFAULT 'rules',
  result text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_tasks_time_idx ON ai_tasks (created_at);
CREATE INDEX IF NOT EXISTS ai_tasks_queue_idx ON ai_tasks (status, id) WHERE status = 'queued';

CREATE TABLE IF NOT EXISTS cleanup_runs (
  id bigserial PRIMARY KEY,
  status text NOT NULL CHECK (status IN ('running','completed','skipped','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  deleted jsonb NOT NULL DEFAULT '{}',
  total_deleted integer NOT NULL DEFAULT 0,
  note text
);
CREATE INDEX IF NOT EXISTS cleanup_runs_time_idx ON cleanup_runs (started_at);

-- Lifetime counters that must outlive the rows they count.
CREATE TABLE IF NOT EXISTS app_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);
INSERT INTO app_state (key, value) VALUES ('records_deleted_lifetime', '0') ON CONFLICT DO NOTHING;

-- Housekeeping for sign-in.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  key text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Supabase exposes the public schema over its REST API. This app connects
-- directly and never uses that API, so RLS with no policies closes it entirely.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','settings','cv','applications','career_pages','jobs','search_runs','search_run_sources',
    'search_requests','search_results','notifications','ai_tasks','cleanup_runs','app_state','sessions','login_attempts']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

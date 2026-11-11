# Surelane 🛣️

Your clear, safe lane to real jobs. Upload your CV once. Three times a day, Surelane searches permitted job sources, checks that each vacancy is still open, ranks it against your CV and emails you the new matches. It keeps running when your computer is off, and it costs nothing to run.

> New here? Start with **[SYSTEM-OVERVIEW.md](SYSTEM-OVERVIEW.md)**. It explains the whole project in plain words.

**Built with:** Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · Postgres (Supabase) · GitHub Actions · cron-job.org · Resend · Ollama (Qwen 3 1.7B) · Vercel

---

## Get it running

```bash
npm install
npm run db:migrate   # create the tables (needs DATABASE_URL)
npm run dev          # dashboard: http://localhost:3000
```

You need a `.env.local` file first (see [Settings](#settings-environment-variables)). **Never commit `.env` files.** They hold your database password, GitHub token and email key.

| Command | What it does |
|---|---|
| `npm run dev` | Start the dashboard locally |
| `npm run build` / `npm start` | Make and run a production build |
| `npm run db:migrate` | Create or update the tables from `db/schema.sql` |
| `npm run worker` | Run one search or cleanup, if one is due |
| `npm run worker:loop` | Keep the worker running on your own machine (no GitHub or cron-job.org needed) |
| `npm run sources:check` | Call every job source once, store nothing, print what came back |
| `npm run typecheck` | Check the TypeScript |
| `npm test` | Tests. Needs a throwaway Postgres in `TEST_DATABASE_URL` |

## Where things live

| I want to… | Look in |
|---|---|
| Change the dashboard pages | `src/app/(app)/` and `src/components/` |
| Change sign-in and first-account setup | `src/app/login/`, `src/app/setup/`, `src/lib/auth.ts` |
| Add or fix a job source | `src/lib/sources/` (`adapters.ts` for feeds and APIs, `career.ts` for career pages) |
| Change how jobs are scored | `src/lib/match/` |
| Change how a CV is read | `src/lib/cv/parse.ts` |
| Change the AI model or its prompts | `src/lib/ai/` |
| Change the search run | `src/lib/search/run.ts` and `src/worker/` |
| Change the job email | `src/lib/notify/email.ts` |
| Change the search times | `src/lib/schedule.ts` **and** `.github/workflows/agent.yml` (keep both in step) |
| Change the 30-day cleanup | `src/lib/cleanup.ts` |
| Change the "search these sites yourself" links | `src/lib/sites.ts` and `src/lib/linkedin.ts` |
| Change the tables | `db/schema.sql` |
| Change colours and fonts | `src/app/globals.css` (tokens at the top) |
| Change the logo | `src/components/brand.tsx` |

**No code needed** for search times, Local and Global switches, alert email, keywords, location, job age, appearance, career pages and feeds: use **Search setup** in the app.

## Settings (environment variables)

Set these in `.env.local` locally, in **Vercel** for the dashboard and in **GitHub › Settings › Secrets and variables › Actions** for the worker.

| Variable | Where | What it's for |
|---|---|---|
| `DATABASE_URL` | Vercel + GitHub secret | Supabase **Transaction pooler** string (port 6543). Not the direct one: it's IPv6 and GitHub can't reach it |
| `APP_SECRET` | Vercel + GitHub secret | Encrypts your CV and cover letter. **Lose it and you must upload your CV again** |
| `RESEND_API_KEY` | Vercel + GitHub secret | Sending email. **Needed in both:** GitHub sends job emails, Vercel sends the test email |
| `APP_URL` | Vercel + GitHub variable | Your Vercel address, for links in emails |
| `SETUP_CODE` | Vercel | Needed to create the one and only account |
| `CRON_SECRET` | Vercel | Password cron-job.org uses to wake the worker |
| `GITHUB_DISPATCH_TOKEN`, `GITHUB_REPO` | Vercel | Lets **Search now** start the worker. Fine-grained token, this repo only, **Actions: Read and write**. Repo as `your-name/your-repo` |
| `AI_PROVIDER` | Vercel + GitHub variable | `ollama` for free local AI, `gemini` for cloud AI, or leave out for the built-in engine |
| `OLLAMA_MODEL` | GitHub variable | Optional. Default `qwen3:1.7b` |
| `AI_MAX_JOBS_PER_RUN`, `AI_TIME_BUDGET_SECONDS` | GitHub variable | Optional AI caps. Default 12 jobs and 420 seconds |
| `EMAIL_FROM` | Vercel + GitHub variable | Optional. Only once you've verified your own domain in Resend |
| `JOOBLE_API_KEY`, `HIMALAYAS_API_KEY` | GitHub secret | Optional source keys |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Vercel + GitHub | Only with `AI_PROVIDER=gemini` |
| `DATABASE_CA_CERT` | Vercel + GitHub secret | Optional. Turns on full certificate checks for the database |

Make a secret with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`

## Going live (about 45 minutes)

You need free accounts on **GitHub, Vercel, Supabase, cron-job.org and Resend**. Don't add a card to GitHub: without one, going over the free allowance stops the runs instead of charging you. If any other service asks for a card at sign-up, stop.

1. **GitHub.** Put the code in a **private** repository. GitHub turns off schedules in public repos after 60 days of no activity.
2. **Supabase.** Create a project (Singapore is closest). Copy the **Transaction pooler** string and add your password. That's `DATABASE_URL`.
3. **Secrets.** Make `APP_SECRET`, `CRON_SECRET` and `SETUP_CODE` with the command above.
4. **Resend.** Sign up **with the email where you want job alerts**, then create a key with sending access. Until you verify a domain, Resend only delivers to that address.
5. **GitHub settings.** Add the secrets and variables from the table above. Create the `GITHUB_DISPATCH_TOKEN`.
6. **Vercel.** Import the repo, add its variables, deploy. Then put the address into GitHub as `APP_URL`.
7. **Tables.** Run **Actions › agent › Run workflow** and wait for the green tick.
8. **Exact timing.** In cron-job.org, create four jobs: `POST https://your-app.vercel.app/api/cron/tick`, header `Authorization: Bearer YOUR_CRON_SECRET`, time zone `Asia/Colombo`, at **08:00, 12:30, 17:00 and 03:00**.
9. **Sources.** Run **Actions › check-sources**. Do this **before relying on the agent**: it's the first real test of each source.

**Checklist**
- [ ] Account created with `SETUP_CODE`, CV uploaded and the profile looks right
- [ ] **Send alerts to** matches your Resend sign-up address, and **Send test email** arrives (check spam the first time)
- [ ] Local and Global switches set, and at least one search time on
- [ ] **Search now** finishes, and Search history shows each source as searched, skipped or failed with a reason
- [ ] check-sources run, and any failed source understood
- [ ] `.env.local` kept out of git and out of any zip you share

## Running it yourself instead

On an always-on machine with Postgres and Node 22:

```bash
npm ci && npm run db:migrate && npm run build
npm start              # the dashboard
npm run worker:loop    # searches and cleanup
```

**Search now** on the same machine is picked up within a minute. With more memory or a graphics card, a bigger open model such as `qwen3:8b` gives much better results.

## If something goes wrong

| What you see | What to do |
|---|---|
| **Missed** in Search history | Check cron-job.org is active and the GitHub workflow is enabled. A slot can start up to 2 hours late, then it's missed |
| A source shows **Failed** | Read the error in Search history. The provider may have changed its format |
| **Skipped: the site refused access from this server** | The site blocks cloud servers. Surelane respects that. Ask the site to allow GitHub Actions, or run the worker yourself |
| Nothing arrives by email | Check **Needs you** on Today, then Email under Search settings. Use **Send test email** and check spam |
| Test email works, job emails don't | `RESEND_API_KEY` is in Vercel but not GitHub. It must be in both |
| "Resend's test sender can only reach…" | **Send alerts to** doesn't match your Resend sign-up address. Change it, or verify a domain |
| **Queued** never finishes | `GITHUB_DISPATCH_TOKEN` or `GITHUB_REPO` is wrong. The search waits for the next trigger |
| "This page could not load" | Choose Try again. If it keeps happening, your Supabase project may be paused, so restore it. Check you used the pooler string |
| "No readable text in your CV" | It's a scanned image. Export a text PDF or DOCX |

## Good to know

- **Free limits.** Vercel Hobby is personal, non-commercial use. Supabase Free pauses a project after a quiet week; the daily runs should prevent that, but it isn't guaranteed. GitHub gives about 2,000 minutes a month: plan on about 1,150 with AI, about 500 without. Resend Free is 100 emails a day.
- **One owner only.** There's no public sign-up. The first account closes registration. Five wrong passwords lock that address for 15 minutes.
- **The database is a transaction pooler.** Use `BEGIN READ ONLY` or `SET LOCAL` inside a transaction, never a session-wide `SET`.
- **Search times live in two places:** `src/lib/schedule.ts` and the cron lines in `agent.yml`. Change one, change both.
- **Some sites are never read automatically**, such as LinkedIn, Indeed, Glassdoor and TopJobs.lk, because their terms or robots rules forbid it. **Search setup › Job sources** gives each reason. Don't add scraping for them; the app builds ready-made searches for the user to open instead.
- **The built-in engine must keep working on its own.** AI is an extra. If Ollama can't start, the search still runs and every result shows which engine scored it.
- **Design tokens only.** Every colour, in light and dark, comes from `src/app/globals.css` and meets WCAG AA. Colour never works alone: each state also has a word or an icon.
- **Test fakes** (`tests/e2e/fixture-worker.ts`, `tests/e2e/net-stub.cjs`, `tests/fake-resend.ts`) are for tests only. The app never imports them.
- **Upgrading from the Gmail version?** Add `RESEND_API_KEY` to GitHub and Vercel, redeploy, send a test email, then delete the old `SMTP_*` values and the Google app password. Your data and page addresses don't change.
- **Before selling it:** get a trademark search on the name, move off Vercel Hobby, add multi-user accounts and billing, take advice on Sri Lanka's Personal Data Protection Act (main parts due 1 January 2027), re-check every source's terms for commercial use, and verify your own email domain.

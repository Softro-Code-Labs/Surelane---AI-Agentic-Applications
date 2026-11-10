# Surelane

Your clear, safe lane to real jobs. Upload your CV once, and Surelane searches permitted job sources at 8:00 AM, 12:30 PM and 5:00 PM Sri Lanka time, checks that vacancies are still open, ranks them against your CV, and emails you the new ones. It keeps running when your computer is off.

It costs nothing to run. GitHub and cron-job.org are confirmed to work with no card. The pricing pages for Supabase, Vercel and Resend don't state a card rule outright, so if any of them asks for one at sign-up, stop rather than enter it. **Do not add a card to GitHub:** without one, going over the free allowance stops the runs instead of charging you.

## Find your way around

| Menu | What's there |
|---|---|
| Today | The next search, your three search times, what needs you, your best matches and your numbers. |
| Jobs | Every open match, with filters. **Add a job you found** is here too. |
| Applications | Saved jobs by stage, with notes, deadlines and cover letters. |
| You | My CV, Cover letter and Career insights. |
| Search setup | Search settings, Career pages, Job sources, Search history and Storage. |

On a phone, these five sit in a tab bar at the bottom, and you can add Surelane to your home screen from the browser menu. To choose light, dark or match your device, open **Search setup > Search settings > Appearance**.

## Already running the earlier version?

Replace the code, then move email from Gmail to Resend:

1. Follow step 4 to get a `RESEND_API_KEY`.
2. Add it to your GitHub secrets and to Vercel. It has to be in both: GitHub sends the job emails, and Vercel sends the test email.
3. Redeploy, and use **Send test email** to check it.
4. Delete the old `SMTP_*` values, and remove the app password from your Google account. Nothing uses them now.

Your database, your data, the sign-in and the page addresses don't change. The design and navigation are new, and every page keeps its old address, so saved links still work.

## What runs where

| Part | Service | Free limits to know about |
|---|---|---|
| Dashboard | Vercel Hobby | Personal, non-commercial use only. 1M function calls a month. If you exceed a limit you may have to wait up to 30 days. |
| Database and CV | Supabase Free | 500 MB database, 2 active projects. Paused after too little activity in a week. The agent's daily activity should prevent that, but Supabase does not guarantee it. |
| Searches | GitHub Actions, private repo | About 2,000 minutes a month ($12 of included compute at Linux rates). Runs stop, rather than bill you, if you use it all and have no card on file. |
| Exact timing | cron-job.org | Free. 30-second timeout. A job is switched off after more than 25 failures in a row. |
| Local AI | Ollama, inside GitHub's runner | Runs on 2 CPU cores, so it is slow. See Local AI below. |
| Email | Resend Free | 3,000 emails a month and 100 a day, far more than this app sends. Going over the limit stops sending, rather than charging you. |

The app has no public sign-up: the first account closes registration, and that account needs your `SETUP_CODE`.

## What it can search

**Local and Global.** **Search setup > Search settings** has two switches:

| Switch | What it searches |
|---|---|
| **Include Local Job Opportunities** | Jobs in Sri Lanka: Sri Lankan and government job sites, Sri Lanka searches on platforms that cover both (Himalayas, Jooble, Indeed and LinkedIn), and Sri Lankan jobs on your career pages and feeds. |
| **Include Global Job Opportunities** | Jobs with employers abroad: overseas roles, and international remote roles that people in Sri Lanka can apply for. Covers Jobicy, Remotive, Remote OK, and worldwide searches on Himalayas, Jooble and LinkedIn. |

Turn on either one or both. With both off, no searches run until you turn one back on, and Today, Jobs and the Search button say so. New installs start with Local on and Global off.

A job counts as local when it is in Sri Lanka, including a remote role an employer advertises for Sri Lanka only. A remote role with an employer abroad counts as global, even when it is open to people in Sri Lanka.

**Searched automatically:**

- **Local:** ITPro.lk (RSS), Jobpal.lk (its job feed, all fields) and the government vacancy feeds of Govjobs.lk and Govdoc Jobs.
- **Global:** Jobicy, Remotive and Remote OK.
- **Both, filtered by your switches:** Himalayas, Jooble (once you have a free key), the company career pages on your list, and RSS feeds you add.

**Not searched:** LinkedIn, Indeed, Glassdoor and these Sri Lankan sites: TopJobs.lk, ikman Jobs, XpressJobs, Rooster Jobs, JobMasters.lk, DreamJobs.lk, Observer Jobs, Finders.lk, Rakiya.lk, Agency.lk, BetterJobs.lk, Jobify.lk and LankaTalentHub, and the government sites GovernmentJobs.lk, GovHub Jobs and JobsLanka. Each one forbids automated reading in its terms, refuses automated tools, or offers no feed or API that permitted access could be confirmed for. **Search setup > Job sources** gives each site's reason. The agent never reports them as checked.

**Searching them yourself.** **Jobs** has a **Search more job sites with your CV** panel, so you don't have to type the same searches on every site:

- **LinkedIn:** up to 8 ready-made searches, built from your CV's target roles, top skills and experience level, and from your search settings (location, remote preference and how recent). With Local on they search Sri Lanka, and with Global on they search your preferred countries and worldwide remote jobs. With both on, the two groups are listed separately, and at least 3 of the 8 are global. The filters use the codes LinkedIn's own search page puts in its links. LinkedIn doesn't publish them, so if it renames one, that filter is ignored and the search still opens.
- **Government sites**, in their own group: Govjobs.lk, Govdoc Jobs, GovernmentJobs.lk, GovHub Jobs and JobsLanka. Government job titles rarely match private-sector CV wording, so each site also has a **Latest vacancies** link. GovernmentJobs.lk filters only by institution and Govdoc Jobs has no working search, so they get only that link.
- **International platforms:** Indeed, Glassdoor, Jooble, Himalayas, Jobicy, Remotive and Remote OK. Indeed, Jooble and Himalayas get Sri Lanka searches with Local on and worldwide searches with Global on. The others are global only. Jooble, Himalayas, Jobicy, Remotive and Remote OK are also searched automatically, but the links reach further back. Indeed and Glassdoor ask automated tools not to open their search pages, and Jooble and Himalayas refused the check, so those four links use each site's public address format and couldn't be tested. Remote OK searches by tag, so it gets links only for one-word skills such as React.
- Sri Lankan and government sites appear only with Local on.
- **Sri Lankan sites:** for each site, one button per top role or skill. Your preferred district and a remote-only preference are added where the site can filter by them. TopJobs.lk and Rooster Jobs have no search address that could be confirmed, so their buttons open the site's job list. Rakiya.lk's address comes from the site's own published search template, but it refuses automated tools, so that link couldn't be tested.

Surelane can't read these sites, so it can't score what they show. When a job looks good, copy its link, choose **Add a job you found**, and paste in the title, company, location and description. Surelane then scores it against your CV, and you can track it in Applications. Any LinkedIn job link works, including one copied from the address bar of a search page. Tracking codes are removed, and adding the same job twice opens the one you already have.

The checks behind these decisions were made in November 2026. A site can change its terms, so recheck them before any commercial use.

**Government jobs.** Jobs from Govjobs.lk and Govdoc Jobs are marked **Government**, and **Jobs** has a **Sector** filter to show only government or only private jobs. Govjobs.lk gives each vacancy's closing date. Govdoc Jobs doesn't, so check the date on the linked page. Both feeds hold only their newest posts, so use the site links on **Jobs** to look further back.

**Coverage warning:** ITPro.lk is IT-focused, Jobpal.lk covers every field but posts a few jobs a day, and the others are mostly remote roles. If your field is not IT, use the site searches on **Jobs**, and add Jooble and the career pages of employers you care about.

## Setup, about 45 minutes

You need free accounts on GitHub, Vercel, Supabase, cron-job.org and Resend.

### 1. Put the code on GitHub

Create a **private** repository, then upload this folder. Private matters: GitHub disables schedules in public repositories after 60 days of no activity.

### 2. Create the database

1. In Supabase, create a project. Singapore is the closest region.
2. Open **Connect**, choose **Transaction pooler** (port 6543), and copy the connection string. Do not use the direct connection: it is IPv6 and GitHub's runners cannot reach it.
3. Put your database password into the string. This is your `DATABASE_URL`.

### 3. Make three secret values

Run this three times, or use a password manager to generate long random strings:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

These are `APP_SECRET`, `CRON_SECRET` and `SETUP_CODE`. Save them. If you lose `APP_SECRET`, you need to upload your CV again.

### 4. Set up Resend

1. Sign up at [resend.com](https://resend.com) **with the email address where you want job alerts**. This matters: until you verify your own domain, Resend only delivers to the address on your account.
2. Open **API Keys** and create a key with **Sending access**. This is your `RESEND_API_KEY`. Save it somewhere safe.

That's all you need. Emails come from Resend's test sender, `onboarding@resend.dev`. It's a shared testing address, so check your spam folder the first time.

**Later, with your own domain:** add it under **Domains** in Resend, add the DNS records it gives you, and once it's verified, set `EMAIL_FROM` to something like `Surelane <alerts@yourdomain.com>`. You can then send to any address. A domain is a paid purchase, which is why the free setup leaves it out.

### 5. Add settings to GitHub

In your repository, open **Settings > Secrets and variables > Actions**.

Secrets: `DATABASE_URL`, `APP_SECRET`, `RESEND_API_KEY`.

Variables: `APP_URL` = your Vercel address (add this after step 7), `AI_PROVIDER` = `ollama` if you want local AI, or leave it out at first, and `EMAIL_FROM` only if you have verified a domain.

### 6. Allow Search now to start the worker

In GitHub, create a **fine-grained personal access token** for this repository only, with **Actions: Read and write**. This is your `GITHUB_DISPATCH_TOKEN`.

### 7. Deploy the dashboard

1. In Vercel, import the repository.
2. Add these environment variables: `DATABASE_URL`, `APP_SECRET`, `SETUP_CODE`, `CRON_SECRET`, `GITHUB_DISPATCH_TOKEN`, `GITHUB_REPO` (your-name/your-repo), `RESEND_API_KEY`, `APP_URL`, and `EMAIL_FROM` and `AI_PROVIDER` if you set them in step 5.
3. Deploy, then add the address to GitHub as the `APP_URL` variable.

### 8. Create the tables

In GitHub, open **Actions > agent > Run workflow**. This creates the tables. Wait for the green tick before opening the app.

### 9. Make the timing exact

GitHub's timer can run late, and in busy periods it can drop runs. cron-job.org keeps the times accurate. Create four jobs, each with:

- URL: `https://your-app.vercel.app/api/cron/tick`
- Method: `POST`
- Header: `Authorization: Bearer YOUR_CRON_SECRET`
- Time zone: `Asia/Colombo`
- Times: 08:00, 12:30, 17:00 and 03:00 (the last one is the daily cleanup)

### 10. Start using it

1. Open your Vercel address and create your account, using `SETUP_CODE`.
2. Upload your CV and check that the profile looks right.
3. In **Search setup > Search settings**, enter the email you used for Resend under **Send alerts to**, save, send a test email, and set your preferences.
4. Click **Search now**, and open **Search setup > Search history** when it finishes.

### 11. Confirm the live sources

In GitHub, run **Actions > check-sources**. It calls every source once and prints what came back. **Do this before relying on the agent.** The adapters were built from each provider's documentation in an environment that could not reach them, so this is their first real test. If one fails, Search history shows the error, and the other sources carry on.

### Optional

- **Jooble:** request a free key on its API page, then add the `JOOBLE_API_KEY` secret in GitHub. Check whether it returns useful Sri Lankan jobs for your field, because that could not be confirmed.

## Cover letters

Open **You > Cover letter** to save your own cover letter. Upload a PDF, DOCX or text file, or paste it, and edit it there any time. It's encrypted in your database like your CV, kept until you remove it, and left out of the 30-day cleanup. Template blanks such as `[Company Name]` or `[Position]` are fine: they're filled in for each job.

On any job, the **Cover letter** section then offers two choices:

- **Tailor my cover letter** starts from your own letter. With an AI model, it rewrites the letter for the job, keeping your tone, phrasing and facts, and invents nothing. Without one, the built-in engine keeps your letter as you wrote it. It fills the blanks, replaces the opening with one naming this role and company, and adds one line on the skills you share with the job.
- **Write a new one** writes a letter from your CV, as before.

Without a saved letter, cover letters are written from your CV. A tailored letter belongs to one version of your letter, so editing your letter makes the next one fresh. Before your letter reaches a cloud model such as Gemini, your email, phone number, links and name are removed; your name is put back in the result. Always read a letter before sending it.

## Company career pages

Open **Search setup > Career pages**, paste one link per line, and choose **Add and check**. Each link is checked straight away, then at every search time. You can list up to 100 companies. To name one yourself, write `Company name, https://link`.

The agent reads each page in this order:

1. **A hiring system.** Lever, Greenhouse, Ashby, SmartRecruiters, Workable and Recruitee have public job data, including when a company's own page embeds one of them. This is the most reliable route. Workable and Recruitee are less formally documented than the others.
2. **Structured job data** on the page, which often includes the closing date.
3. **Job links or headings** on a plain web page. This route is best effort: unusual layouts can be missed.

What each status means:

| Status | Meaning |
|---|---|
| Readable | Vacancies were found. |
| No vacancies found | The page was read, and nothing looked like a vacancy. |
| Cannot be read | Jobs load through scripts, or are posted as PDFs. Add the hiring-system link if there is one. |
| **Not allowed** | The company's robots.txt says no, its site refused access, or the page needs a sign-in or anti-bot check. The agent shows this straight after you add the page, does not read it, and does not try to get around it. |
| Check failed | A temporary problem, or a wrong link. It retries at the next search. |

The robots and access checks run again at every search, so a company that later allows access starts working by itself. The agent can't read a site's written terms of use, so a site could still forbid automated reading there. Check the terms of any site you depend on, above all before commercial use.

If a page doesn't state a location, jobs are marked with the location you chose, followed by "(assumed)". A job that disappears from a page it was found on is marked closed. An empty or unreadable page never closes anything.

Your list is kept until you delete it, and isn't part of the 30-day cleanup.

## Local AI (free and open source)

Set `AI_PROVIDER=ollama` as a GitHub variable and in Vercel. Each search then starts [Ollama](https://ollama.com) (MIT licence) on GitHub's runner, restores the model from cache, and uses it to:

- add a headline, summary and suggested job titles to your CV profile (facts always come from your CV itself)
- give a second opinion on your top matches, with a plain explanation
- write cover letters, tailor your own letter, summarise jobs, and suggest CV improvements and career paths.

The default model is **Qwen 3 1.7B** (`qwen3:1.7b`, about 1.4 GB). It is under the Apache 2.0 open-source licence, which allows any use, including commercial. It's clearly more capable than the earlier default (Gemma 3 1B), and still small enough for GitHub's free runner. Its thinking mode is switched off, because it is slow on 2 CPU cores and breaks the JSON the app expects.

**What it costs: nothing.** Every part is free:

| Part | Cost | Why there's no surprise bill |
|---|---|---|
| Ollama | Free (MIT licence) | Installed fresh on each run |
| Qwen 3 1.7B | Free (Apache 2.0) | Downloaded once from Ollama's free registry, then cached |
| Model cache | Free | It uses about 1.4 GB of GitHub's free 10 GB cache per repository |
| GitHub Actions minutes | Free within 2,000 a month | Plan on about 1,150 a month with AI, or about 500 without. With no card on GitHub, going over stops the runs instead of charging. |
| API keys | None needed | Nothing is sent outside your own GitHub runner and database |

**Speed and limits.** The runner has 2 CPU cores, so expect very roughly 20 to 60 seconds a job; this is an estimate, not a measurement. Each search reviews up to 12 top matches (`AI_MAX_JOBS_PER_RUN`) for at most 7 minutes (`AI_TIME_BUDGET_SECONDS`, default 420), then spends up to 4 minutes on queued cover letters and summaries. These caps keep minutes flat whichever model you use. A bigger model doesn't cost more; it just finishes fewer jobs within the same time.

**Quality.** A small model is a helpful second opinion, not an expert. Its score counts for half of a job's score, and the built-in score is the other half. Cover letters and summaries are clearly better than the built-in versions, but read them before sending.

**Other free, open-source models.** Set the `OLLAMA_MODEL` variable in GitHub to try one:

| Model | Licence | Size | Trade-off |
|---|---|---|---|
| `qwen3:1.7b` (default) | Apache 2.0 | 1.4 GB | Best balance on the free runner |
| `granite4:3b` | Apache 2.0 | 2.1 GB | Better writing, about twice as slow, so fewer jobs per search. A long cover letter may hit the 3-minute limit per request and fall back to the built-in version. |
| `phi4-mini` | MIT | 2.5 GB | Similar trade-off to Granite 4 3B |
| `gemma3:1b` (earlier default) | Gemma Terms (free, not open source) | 0.8 GB | Fastest, weakest |

**On your own computer.** If you run the worker yourself (see Running it yourself) on a machine with more memory or a graphics card, a larger open model such as `qwen3:8b` gives much better results. The computer must be on at search time.

If Ollama or the model can't start, the search still runs on the built-in engine, and every result shows which engine scored it.

**Built-in engine (no AI model):** the app works fully with `AI_PROVIDER` unset. Scoring, explanations, cover letters and summaries all come from rules, so they are plainer but free, instant and private.

**Gemini (optional, cloud, not open source):** off unless you set `AI_PROVIDER=gemini` and a `GEMINI_API_KEY`. Its free tier needs no card, and requests over the limit are refused, not charged. But it isn't open source, and Google's pricing page says free-tier content is **used to improve its products**. The app removes your name, email, phone and links first, but your experience and skills are still sent. The local model above is the recommended choice.

## How your rules work

**Schedule.** 8:00 AM, 12:30 PM and 5:00 PM Colombo time, each with its own switch. Times are fixed, because they also live in the GitHub workflow. A late trigger still runs for up to 2 hours. After that the slot shows as Missed in Search history. A slot can only run once a day, however many triggers arrive.

**Agent switch.** Off means no scheduled searches, no Search now, and no job emails. A search already running stops at its next step and sends nothing. Daily cleanup keeps running while the agent is off, because it is maintenance, not a search.

**Emails.** Sent only after scheduled searches. With Local and Global both on, one email holds two separate, labelled sections: **Local Job Opportunities (Sri Lanka)** and **Global Job Opportunities (International)**. Each section has its own list and its own limit of 25 jobs, so one can't crowd out the other. With only one switch on, the email has only that section. Jobs found by Search now go out with the next scheduled email. No job is emailed twice. If an email fails, its jobs wait for the next scheduled email, **Needs you** on Today says so, and the reason appears under Email in Search settings. Emails go through Resend, which lists 30-day data retention on its free plan. They carry job matches and skill notes, never your CV.

**Active vacancies.** A job is only recommended if all of these hold:
- Its deadline has not passed, and it isn't marked closed, filled or expired.
- It was posted within your age limit (30 days by default), unless a later deadline is given.
- Its source confirmed it within the last 3 days, by status check, employer board, listing page or live feed.

No method is perfect. A site can leave a filled job up, so a confirmed job could still be gone when you apply.

**30-day retention.** Runs daily at 3:00 AM Colombo time, using a rolling 30-day window from database timestamps. It deletes job listings, expired vacancy data, search results, search logs, temporary AI data and notification history. It never touches your CV, profile, account, settings or application tracker. If a search is running, cleanup waits for the next trigger. Saved jobs keep their own copy of the details, so they survive when the original job record is deleted.

One decision to check: job records age from **when they were last seen**, not first found. A vacancy still listed on day 40 is current data, and deleting it would make it look new and email you again. A job stops being kept 30 days after it stops appearing.

## Before you sell this

The free setup above is for one person's own use. Selling it needs more:

- **The name:** Surelane is a working name. A web search found no job product using it, but that isn't legal clearance. Have a trademark search done in your target markets, and check the domain names, before you print or launch anything.
- **Hosting:** Vercel Hobby is non-commercial only, so a paid plan or another host is needed.
- **Accounts:** the app has a single owner. Selling it needs multi-user accounts, billing and data separation.
- **Personal data:** the main parts of Sri Lanka's Personal Data Protection Act are due to start on 1 January 2027. CVs are personal data, so take legal advice.
- **Job sources:** re-read every source's terms for commercial use, and get permission where needed. Some of these allow personal use only, and page reading that suits one person may not suit a business.
- **Email:** verify your own domain in Resend, because the test sender only reaches your own address. The free plan's 100 emails a day would be shared by all your customers, so expect to need a paid plan. Pro was $20 a month for 50,000 emails when this was written.
- **AI:** use hosting with enough capacity for local AI.

## Running it yourself instead

On an always-on machine with Postgres and Node 22, set the values from `.env.example`, then:

```
npm ci && npm run db:migrate && npm run build
npm start                 # the dashboard
npm run worker:loop       # searches and cleanup, no GitHub or cron-job.org needed
```

Run Search now from the same machine and the worker picks it up within a minute.

## Development

```
TEST_DATABASE_URL=postgres://... npm test    # needs a real Postgres
npm run typecheck
```

`tests/e2e/fixture-worker.ts`, `tests/e2e/net-stub.cjs` and `tests/fake-resend.ts` use labelled fake listings, websites and email for testing only. The application never imports them.

### Design system

Every color, in light and dark, comes from the tokens in `src/app/globals.css`, and each text and background pair was measured for contrast. Use the tokens rather than new colors.

- **Color has one job each.** Blue is structure, green is safe, amber means look at this, and red means stop. A color never works alone: each state also has a word or an icon.
- **One typeface.** Overpass, the highway-sign lettering behind the logo.
- **The road is the signature.** The three stops on Today, the match meter (three chevrons for Strong, two for Good, one for Potential) and the stages in Applications all come from the logo's chevrons. Keep it to those places, so it stays special.
- **Flat and calm.** Rows with hairlines, 6px corners, no shadows.
- **Plain words.** Sentence case, no jargon, and no promise the app can't keep. Surelane checks that a listing is live, not that an employer is honest, and it says so.

Shared parts live in `src/components`: `ui.tsx` for layout and labels, `controls.tsx` for switches and buttons, `feedback.tsx` for messages and confirmations, and `brand.tsx` for the logo.

## If something goes wrong

| What you see | What to do |
|---|---|
| Missed in Search history | Check that cron-job.org is active and the GitHub workflow is enabled. |
| A source shows Failed | Read the error in Search history. A provider may have changed its format. |
| A source shows Skipped: "the site refused access from this server" | The site blocks cloud servers such as GitHub's, though it may work from a home connection (ITPro.lk currently does this). Surelane respects the block and doesn't try to get around it. To use that source, ask the site to allow GitHub Actions, or run the worker on your own computer (see Running it yourself). |
| Nothing arrives by email | Check **Needs you** on Today, then look under Email in Search settings for the reason. Use Send test email, and check your spam folder. |
| Send test email works, but job emails don't | `RESEND_API_KEY` is in Vercel but not in GitHub. It has to be in both. |
| Resend's test sender can only reach the email on your Resend account | **Send alerts to** doesn't match the address you signed up to Resend with. Change it, or verify a domain. |
| Queued never finishes | `GITHUB_DISPATCH_TOKEN` or `GITHUB_REPO` is wrong, so the search waits for the next trigger. |
| This page could not load | Choose Try again. If it keeps happening, your Supabase project may be paused, so restore it. Check you used the pooler string. |
| No readable text in your CV | It is a scanned image. Export a text PDF or DOCX. |

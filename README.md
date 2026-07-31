# Job Apply Automation (safe, human-in-the-loop)

A semi-automated job application assistant + a GitHub Pages status dashboard.

## Why it works this way (read this)

LinkedIn, Naukri, Indeed, Instahyre, Wellfound, etc. **prohibit bot automation** in
their Terms of Service and actively detect it. Fully automated "give creds → bot
applies everywhere" tools get accounts **banned** and often submit wrong answers to
employers. This tool avoids that:

- It opens jobs in **your own real, logged-in browser** (a persistent local profile).
  **No credentials are stored by this tool** — you log in yourself, once.
- It **safely pre-fills** obvious fields (name, email, phone, links).
- **You** review screening questions and click **Submit** yourself. Nothing is
  auto-submitted on your behalf.
- Every application is **logged** to `data/applications.json`.
- A static **dashboard** (`docs/`) shows the status, hosted free on GitHub Pages.

This keeps your accounts safe while automating the boring parts and tracking status.

## Setup

```bash
cd job-apply-automation
npm install            # installs Playwright + a Chromium browser
cp config.profile.example.json config.profile.json   # then edit it with your details
```

Put your resume at `resume/resume.pdf` (path is configurable). Your real
`config.profile.json` and `data/applications.json` are **git-ignored** so your
personal info never gets pushed to the public repo.

## Usage

### 1. Apply to a job (semi-automated)
```bash
npm run apply -- "https://job-url-here"
```
- A browser opens using your saved profile. **First time:** log into the site.
- It pre-fills common fields. You finish + submit. Then answer the terminal prompts
  (status, company, title, platform) to log it.

### 2. Log / update without a browser
```bash
node src/log.js add --company "Acme" --title "Backend Engineer" --platform naukri --url "https://..." --status applied
node src/log.js update <id> --status interview --notes "Call on Monday"
node src/log.js list
```

Statuses: `applied`, `interview`, `offer`, `rejected`, `skipped`, `ghosted`.

### 3. Update the dashboard
```bash
npm run build-dashboard
git add data docs && git commit -m "update applications" && git push
```

## Hosting on GitHub Pages (public repo)

The repo is **public** so free GitHub Pages works. Privacy is handled by
**anonymizing** the published data: `build-dashboard` strips company names, URLs
and notes, publishing only role/platform/status/dates to `docs/applications.json`.
Your raw log (`data/applications.json`) and `config.profile.json` stay git-ignored.

1. Create a public GitHub repo named **`job-application-tracker`** and push this folder.
2. Repo **Settings → Pages → Source: Deploy from branch**, branch `main`, folder `/docs`.
3. Your dashboard will be live at `https://<user>.github.io/job-application-tracker/`.

To show full details instead of anonymized data, set
`"dashboard": { "anonymize": false }` in `config.profile.json` (not recommended for
a public repo).

## Checking "applied jobs" status on platforms

Automated scraping of platforms' "applied jobs" pages is against their ToS and risks
bans, so this tool does **not** scrape them. Instead, when a recruiter responds or a
status changes, update it with `node src/log.js update <id> --status interview` and
rebuild the dashboard. This is safe and reliable.

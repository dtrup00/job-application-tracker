// src/apply.js
// Human-in-the-loop apply helper.
// - Opens a REAL persistent browser profile (you log in yourself, once).
// - Navigates to a job URL, tries to safely pre-fill known common fields.
// - Then PAUSES so YOU review + click the final Submit. Nothing is submitted for you.
// - After you confirm, it logs the application to data/applications.json.
//
// Usage:
//   node src/apply.js "https://job-url-here"
//   node src/apply.js "https://job-url-here" --company "Acme" --title "SWE" --platform linkedin

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PROFILE_DIR = path.join(ROOT, '.browser-profile');
const PROFILE_CONFIG = path.join(ROOT, 'config.profile.json');
const DATA_FILE = path.join(ROOT, 'data', 'applications.json');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      args[key] = val;
    } else {
      args._.push(a);
    }
  }
  return args;
}

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
}

function saveApplication(entry) {
  const db = loadJson(DATA_FILE, { applications: [] });
  db.applications.push(entry);
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

// Find the resume: configured path first, else first resume-like file in resume/.
function resolveResume(profile) {
  if (profile.resumePath) {
    const p = path.resolve(ROOT, profile.resumePath);
    if (fs.existsSync(p)) return p;
  }
  const dir = path.join(ROOT, 'resume');
  try {
    const exts = ['.pdf', '.docx', '.doc', '.rtf', '.odt', '.txt'];
    const files = fs.readdirSync(dir)
      .filter(f => !f.startsWith('.') && exts.includes(path.extname(f).toLowerCase()));
    if (files.length) return path.join(dir, files[0]);
  } catch { /* no resume dir */ }
  return null;
}

// Best-effort, SAFE pre-fill: only fills fields we can confidently match by
// common attributes. It never guesses screening-question answers.
async function safePrefill(page, profile) {
  const map = [
    { keys: ['email'], value: profile.email },
    { keys: ['phone', 'mobile', 'tel'], value: profile.phone },
    { keys: ['first name', 'firstname'], value: (profile.fullName || '').split(' ')[0] },
    { keys: ['last name', 'lastname'], value: (profile.fullName || '').split(' ').slice(1).join(' ') },
    { keys: ['full name', 'name'], value: profile.fullName },
    { keys: ['linkedin'], value: profile.linkedin },
    { keys: ['github'], value: profile.github },
    { keys: ['city', 'location'], value: profile.location },
    { keys: ['notice'], value: profile.noticePeriodDays },
    { keys: ['current company'], value: profile.currentCompany },
    { keys: ['current title', 'designation'], value: profile.currentTitle },
    { keys: ['experience', 'years'], value: profile.experienceYears },
    { keys: ['expected', 'ctc', 'salary'], value: profile.expectedCTC },
  ];

  const inputs = await page.$$('input:not([type=hidden]):not([type=file]):not([type=submit]), textarea');
  let filled = 0;
  for (const el of inputs) {
    try {
      const val = await el.inputValue().catch(() => '');
      if (val) continue; // don't overwrite anything already filled
      const label = (
        (await el.getAttribute('name')) + ' ' +
        (await el.getAttribute('id')) + ' ' +
        (await el.getAttribute('placeholder')) + ' ' +
        (await el.getAttribute('aria-label'))
      ).toLowerCase();
      const match = map.find(m => m.value && m.keys.some(k => label.includes(k)));
      if (match) {
        await el.fill(String(match.value)).catch(() => {});
        filled++;
      }
    } catch { /* ignore individual field errors */ }
  }
  return filled;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const jobUrl = args._[0];
  if (!jobUrl) {
    console.error('Usage: node src/apply.js "<job-url>" [--company X --title Y --platform Z]');
    process.exit(1);
  }

  const profile = loadJson(PROFILE_CONFIG, {});

  console.log('\nLaunching your persistent browser profile...');
  console.log('First run: log into the job sites manually. Your session is saved locally in .browser-profile (git-ignored).\n');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: null,
    args: ['--start-maximized'],
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.goto(jobUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});

  console.log('Attempting safe pre-fill of common fields (name/email/phone/etc)...');
  let filled = 0;
  try { filled = await safePrefill(page, profile); } catch {}
  console.log(`Pre-filled ~${filled} field(s). Review carefully.\n`);
  console.log('>>> NOW: finish the application in the browser and click Submit YOURSELF. <<<');
  const resumeAbs = resolveResume(profile);
  if (resumeAbs) {
    console.log(`Resume to upload: ${resumeAbs}`);
  } else {
    console.log('No resume found. Run `npm start` and upload one at http://localhost:4321');
  }

  const rl = readline.createInterface({ input, output });
  const status = (await rl.question('\nAfter submitting, type status [applied/skipped]: ')).trim() || 'applied';
  const company = args.company || (await rl.question('Company: ')).trim();
  const title = args.title || (await rl.question('Job title: ')).trim();
  const platform = args.platform || (await rl.question('Platform (linkedin/naukri/indeed/instahyre/wellfound/other): ')).trim();
  const notes = (await rl.question('Notes (optional): ')).trim();
  rl.close();

  const entry = {
    id: Date.now().toString(36),
    company,
    title,
    platform,
    url: jobUrl,
    status,               // applied | skipped | interview | offer | rejected
    appliedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes,
  };
  saveApplication(entry);
  console.log(`\nLogged: ${company} — ${title} [${status}]`);
  console.log('Run `npm run build-dashboard` then commit to update your GitHub Pages status page.\n');

  await context.close();
}

main().catch((e) => { console.error(e); process.exit(1); });

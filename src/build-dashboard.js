// src/build-dashboard.js
// Publishes an ANONYMIZED copy of data/applications.json into docs/ for the
// public GitHub Pages site. Sensitive fields (company, url, notes) are stripped
// unless you disable anonymization in config.profile.json -> dashboard.anonymize.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const src = path.join(ROOT, 'data', 'applications.json');
const dest = path.join(ROOT, 'docs', 'applications.json');
const cfgPath = path.join(ROOT, 'config.profile.json');

function loadJson(p, fb) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } }

const db = loadJson(src, { applications: [] });
const cfg = loadJson(cfgPath, {});
const anonymize = cfg.dashboard?.anonymize !== false; // default: anonymize ON
const publicFields = cfg.dashboard?.publicFields ||
  ['id', 'title', 'platform', 'status', 'appliedAt', 'updatedAt'];

let apps = db.applications || [];
if (anonymize) {
  apps = apps.map((a) => {
    const out = {};
    for (const f of publicFields) if (a[f] !== undefined) out[f] = a[f];
    return out;
  });
}

const output = { applications: apps, anonymized: anonymize, generatedAt: new Date().toISOString() };
fs.writeFileSync(dest, JSON.stringify(output, null, 2));
console.log(
  `Dashboard data written: ${dest}\n` +
  `  ${apps.length} applications • anonymized: ${anonymize}\n` +
  (anonymize ? `  public fields: ${publicFields.join(', ')}` : '  WARNING: publishing full details (company, url, notes)')
);

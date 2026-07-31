// src/log.js
// Add or update application records from the terminal (no browser).
//
// Add:    node src/log.js add --company "Acme" --title "SWE" --platform naukri --url "https://..." --status applied
// Update: node src/log.js update <id> --status interview --notes "call on Mon"
// List:   node src/log.js list

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_FILE = path.resolve(__dirname, '..', 'data', 'applications.json');
const VALID_STATUS = ['applied', 'skipped', 'interview', 'offer', 'rejected', 'ghosted'];

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      args[key] = val;
    } else args._.push(a);
  }
  return args;
}

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { applications: [] }; }
}
function save(db) { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
const db = load();

if (cmd === 'add') {
  if (args.status && !VALID_STATUS.includes(args.status)) {
    console.error(`Invalid status. Use: ${VALID_STATUS.join(', ')}`); process.exit(1);
  }
  const entry = {
    id: Date.now().toString(36),
    company: args.company || '',
    title: args.title || '',
    platform: args.platform || 'other',
    url: args.url || '',
    status: args.status || 'applied',
    appliedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    notes: args.notes || '',
  };
  db.applications.push(entry);
  save(db);
  console.log(`Added ${entry.id}: ${entry.company} — ${entry.title} [${entry.status}]`);
} else if (cmd === 'update') {
  const id = args._[1];
  const rec = db.applications.find(a => a.id === id);
  if (!rec) { console.error(`No record with id ${id}`); process.exit(1); }
  if (args.status) {
    if (!VALID_STATUS.includes(args.status)) { console.error(`Invalid status. Use: ${VALID_STATUS.join(', ')}`); process.exit(1); }
    rec.status = args.status;
  }
  if (args.notes !== undefined) rec.notes = args.notes === true ? '' : args.notes;
  rec.updatedAt = new Date().toISOString();
  save(db);
  console.log(`Updated ${id} -> ${rec.status}`);
} else if (cmd === 'list') {
  for (const a of db.applications) {
    console.log(`${a.id}\t[${a.status}]\t${a.platform}\t${a.company} — ${a.title}`);
  }
  console.log(`\nTotal: ${db.applications.length}`);
} else {
  console.log(`Commands:
  add --company X --title Y --platform Z --url URL --status applied
  update <id> --status interview --notes "..."
  list`);
}

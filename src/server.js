// src/server.js
// Local-only web app: upload your resume via the browser; it is saved into
// resume/ with the EXACT original filename and byte-for-byte identical content
// (no re-encoding), so ATS parsing is never affected.
//
// Run:  npm start   (then open http://localhost:4321)
//
// This runs ONLY on your machine. It is not, and cannot be, the public GitHub
// Pages site (Pages is static and cannot receive uploads).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RESUME_DIR = path.join(ROOT, 'resume');
const UPLOAD_PAGE = path.join(ROOT, 'src', 'upload.html');
const CFG = path.join(ROOT, 'config.profile.json');
const PORT = process.env.PORT || 4321;

const ALLOWED_EXT = new Set(['.pdf', '.doc', '.docx', '.rtf', '.txt', '.odt']);

if (!fs.existsSync(RESUME_DIR)) fs.mkdirSync(RESUME_DIR, { recursive: true });

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(body);
}

// Read the full raw request body into a single Buffer (needed for byte-exact multipart).
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Minimal multipart/form-data parser operating on raw bytes.
// Extracts the first file part's original filename + exact content bytes.
function parseMultipart(buffer, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!m) return null;
  const boundary = '--' + (m[1] || m[2]).trim();
  const boundaryBuf = Buffer.from(boundary);
  const parts = [];
  let start = buffer.indexOf(boundaryBuf);
  while (start !== -1) {
    const next = buffer.indexOf(boundaryBuf, start + boundaryBuf.length);
    if (next === -1) break;
    // part between this boundary and the next (skip the CRLF right after boundary)
    let partStart = start + boundaryBuf.length;
    if (buffer[partStart] === 0x0d && buffer[partStart + 1] === 0x0a) partStart += 2;
    // part ends 2 bytes (CRLF) before next boundary
    const partEnd = next - 2;
    if (partEnd > partStart) parts.push(buffer.slice(partStart, partEnd));
    start = next;
  }
  for (const part of parts) {
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd === -1) continue;
    const header = part.slice(0, headerEnd).toString('utf8');
    if (!/filename=/i.test(header)) continue;
    const fn = /filename="([^"]*)"/i.exec(header);
    const filename = fn ? fn[1] : '';
    if (!filename) continue;
    const content = part.slice(headerEnd + 4); // exact bytes, unchanged
    return { filename, content };
  }
  return null;
}

function updateResumePathInConfig(relPath) {
  try {
    const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
    cfg.resumePath = relPath;
    fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2));
  } catch { /* config may not exist yet; ignore */ }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/upload')) {
      return send(res, 200, fs.readFileSync(UPLOAD_PAGE), 'text/html; charset=utf-8');
    }

    if (req.method === 'GET' && req.url === '/api/current') {
      const files = fs.readdirSync(RESUME_DIR).filter(f => !f.startsWith('.'));
      const list = files.map(f => {
        const st = fs.statSync(path.join(RESUME_DIR, f));
        return { name: f, size: st.size, mtime: st.mtime.toISOString() };
      });
      return send(res, 200, JSON.stringify({ files: list }));
    }

    if (req.method === 'POST' && req.url === '/api/upload') {
      const raw = await readRawBody(req);
      const parsed = parseMultipart(raw, req.headers['content-type']);
      if (!parsed) return send(res, 400, JSON.stringify({ error: 'No file received.' }));

      // Keep the original filename exactly; only strip any path components for safety.
      const original = path.basename(parsed.filename);
      const ext = path.extname(original).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) {
        return send(res, 400, JSON.stringify({
          error: `Unsupported file type "${ext}". Allowed: ${[...ALLOWED_EXT].join(', ')}`
        }));
      }

      const dest = path.join(RESUME_DIR, original);
      // Write the exact bytes — no transformation, so format/ATS parsing is preserved.
      fs.writeFileSync(dest, parsed.content);

      updateResumePathInConfig(path.join('resume', original));

      return send(res, 200, JSON.stringify({
        ok: true,
        savedAs: original,
        size: parsed.content.length,
        path: `resume/${original}`,
      }));
    }

    send(res, 404, JSON.stringify({ error: 'Not found' }));
  } catch (e) {
    send(res, 500, JSON.stringify({ error: String(e && e.message || e) }));
  }
});

server.listen(PORT, () => {
  console.log(`\nResume upload app running (LOCAL ONLY): http://localhost:${PORT}`);
  console.log(`Files are saved into: ${RESUME_DIR}`);
  console.log('Original filename & format are preserved byte-for-byte.\n');
});

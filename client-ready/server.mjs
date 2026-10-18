import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.CLARITY_PORT || 3100);
const host = process.env.CLARITY_HOST || '127.0.0.1';
const routes = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['public/style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/sample.html', ['public/sample.html', 'text/html; charset=utf-8']],
  ['/sample.json', ['public/sample.json', 'application/json; charset=utf-8']],
  ['/handover.md', ['sales/sample-handover.md', 'text/plain; charset=utf-8']],
  ['/offer.md', ['sales/client-offer.md', 'text/plain; charset=utf-8']]
]);

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end('Method not allowed'); return; }
  let pathname;
  try {
    if (!req.url.startsWith('/') || req.url.startsWith('//')) throw new Error('Invalid request target');
    pathname = new URL(req.url, 'http://local').pathname;
  } catch { res.writeHead(400); res.end('Invalid request target'); return; }
  if (pathname === '/api/config') {
    const email = process.env.CLARITY_CONTACT_EMAIL ?? 'elsharuf107s@gmail.com';
    const safeEmail = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(email) ? email : null;
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(req.method === 'HEAD' ? '' : JSON.stringify({ contactEmail: safeEmail })); return;
  }
  if (pathname === '/api/health') {
    try {
      const sample = JSON.parse(await fs.readFile(path.join(root, 'public/sample.json'), 'utf8'));
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(req.method === 'HEAD' ? '' : JSON.stringify({ ok: true, sampleFiles: sample.summary.files, sampleComplete: sample.coverage.complete }));
    } catch { res.writeHead(503); res.end('Generate the sample report before startup; see README.'); }
    return;
  }
  const entry = routes.get(pathname);
  if (!entry) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const data = await fs.readFile(path.join(root, entry[0]));
    res.writeHead(200, { 'Content-Type': entry[1] }); res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('File not available; see README.'); }
});
server.listen(port, host, () => console.log(`Codebase Clarity demo listening on ${host}:${server.address().port}`));
server.on('error', error => { console.error(error.message); process.exitCode = 1; });

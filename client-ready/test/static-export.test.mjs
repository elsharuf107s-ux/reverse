import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const exporter = fileURLToPath(new URL('../scripts/export-static.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [exporter, ...args], { encoding: 'utf8' });

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clarity-static-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('exports only client-facing files and serves all local assets under a Pages subpath', async t => {
  const temp = await fixture(t);
  const out = path.join(temp, 'site');
  const result = run('--out', out, '--base', '/reverse/');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual((await fs.readdir(out)).sort(), [
    '.nojekyll', 'README.md', 'app.js', 'handover.md', 'index.html', 'offer.md', 'sample.html', 'sample.json', 'style.css'
  ].sort());
  const offer = await fs.readFile(path.join(out, 'offer.md'), 'utf8');
  assert.match(offer, /\$1,000 USD/);
  assert.match(offer, /Ervin Mosley/);
  assert.doesNotMatch(offer, /Internal launch notes|outsourcing budget/i);
  const handover = await fs.readFile(path.join(out, 'handover.md'), 'utf8');
  assert.match(handover, /AI-assisted/);
  assert.match(handover, /not a paid client engagement/);
  const readme = await fs.readFile(path.join(out, 'README.md'), 'utf8');
  assert.match(readme, /independent human QA pending/);
  assert.match(readme, /\/reverse\//);
  const sample = JSON.parse(await fs.readFile(path.join(out, 'sample.json'), 'utf8'));
  assert.ok(sample.summary.files > 0);

  const server = http.createServer(async (req, res) => {
    if (!req.url.startsWith('/reverse/')) { res.writeHead(404).end(); return; }
    const name = req.url.slice('/reverse/'.length) || 'index.html';
    if (!/^[\w.-]+$/.test(name)) { res.writeHead(404).end(); return; }
    try { res.end(await fs.readFile(path.join(out, name))); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/reverse/`;
  const landing = await fetch(base).then(res => res.text());
  for (const [, target] of landing.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(?:#|mailto:|https?:)/.test(target)) continue;
    const url = new URL(target, base);
    assert.ok(url.pathname.startsWith('/reverse/'), `${target} escaped hosting path`);
    assert.equal((await fetch(url)).status, 200, `${target} did not resolve`);
  }
  assert.match(landing, /id="contact-link"[^>]*href="mailto:elsharuf107s@gmail\.com\?subject=/);
  assert.doesNotMatch(landing, /id="contact-link"[^>]*\bhidden\b/);
});

test('the static client needs no API and retains the local brief download behavior', async t => {
  const temp = await fixture(t);
  const out = path.join(temp, 'site');
  assert.equal(run('--out', out, '--base', '/another/site/').status, 0);
  const script = await fs.readFile(path.join(out, 'app.js'), 'utf8');
  assert.doesNotMatch(script, /\/api\/|\bfetch\s*\(/);
  let submitted;
  let downloaded;
  const contact = { hidden: true };
  const status = {};
  const form = { addEventListener: (event, callback) => { assert.equal(event, 'submit'); submitted = callback; }, reportValidity: () => true };
  vm.runInNewContext(script, {
    document: {
      getElementById: id => ({ 'brief-form': form, 'contact-link': contact, 'form-status': status })[id],
      createElement: name => { assert.equal(name, 'a'); return { click() { downloaded = { href: this.href, name: this.download }; } }; }
    },
    FormData: class { get(key) { return { company: 'Example agency', size: 'Under 10,000', project: 'Authorized sample handover' }[key]; } },
    Blob,
    URL: { createObjectURL: () => 'blob:local-brief', revokeObjectURL: () => {} },
    setTimeout: callback => callback(),
    fetch: () => assert.fail('Static client must not call an API')
  });
  assert.equal(contact.hidden, false);
  assert.ok(contact.href.startsWith('mailto:elsharuf107s@gmail.com?subject='));
  let prevented = false;
  submitted({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(downloaded.href, 'blob:local-brief');
  assert.equal(downloaded.name, 'codebase-clarity-project-brief.txt');
  assert.match(status.textContent, /No message was sent/);
});

test('refuses existing output and bad arguments without replacing files', async t => {
  const temp = await fixture(t);
  const out = path.join(temp, 'site');
  assert.equal(run('--out', out).status, 0);
  const before = await fs.readFile(path.join(out, 'index.html'));
  await fs.writeFile(path.join(out, 'keep.txt'), 'owner file');
  const rerun = run('--out', out);
  assert.notEqual(rerun.status, 0);
  assert.match(rerun.stderr, /already exists/);
  assert.deepEqual(await fs.readFile(path.join(out, 'index.html')), before);
  assert.equal(await fs.readFile(path.join(out, 'keep.txt'), 'utf8'), 'owner file');
  const empty = path.join(temp, 'empty');
  await fs.mkdir(empty);
  assert.notEqual(run('--out', empty).status, 0);
  assert.deepEqual(await fs.readdir(empty), []);
  const symlink = path.join(temp, 'linked');
  await fs.symlink(out, symlink, 'dir');
  assert.notEqual(run('--out', symlink).status, 0);
  const invalid = path.join(temp, 'invalid');
  for (const base of ['https://example.com/reverse/', '/reverse/../', '/reverse/?test=1']) {
    assert.notEqual(run('--out', invalid, '--base', base).status, 0);
  }
  await assert.rejects(fs.access(invalid), { code: 'ENOENT' });
  assert.notEqual(run().status, 0);
});

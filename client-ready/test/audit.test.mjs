import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { audit } from '../lib/audit.mjs';
import { renderReport } from '../lib/report.mjs';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'clarity-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
async function write(root, name, content) {
  await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
  await fs.writeFile(path.join(root, name), content);
}

test('maps source, dependencies, import evidence, lock and CI without executing code', async t => {
  const root = await fixture(t);
  await write(root, 'package.json', JSON.stringify({ name: 'fixture', engines: { node: '>=24' }, main: 'index.js', scripts: { test: 'node --test', postinstall: 'touch SHOULD_NOT_EXIST' }, dependencies: { express: '^5.1.0', custom: 'https://user:secret@example.com/private' } }));
  await write(root, 'index.js', "import { answer } from './lib/answer.js';\nimport fs from 'node:fs';\nthrow new Error('Must not execute');\n");
  await write(root, 'lib/answer.js', 'export const answer = 42;\n');
  await write(root, 'test/answer.test.js', 'throw new Error("Do not execute");\n');
  await write(root, 'package-lock.json', '{}');
  await write(root, '.github/workflows/ci.yml', 'jobs: {}');
  const report = await audit(root, { name: 'Fixture' });
  assert.equal(report.summary.files, 3);
  assert.equal(report.summary.lines, 5);
  assert.equal(report.summary.testFiles, 1);
  assert.equal(report.summary.runtimeDependencies, 2);
  assert.equal(report.imports.find(i => i.specifier === './lib/answer.js').to, 'lib/answer.js');
  assert.equal(report.imports[0].line, 1);
  assert.equal(report.coverage.complete, true);
  assert.equal(report.findings.length, 0);
  assert.equal(report.manifests[0].dependencies[1].version, '(custom source; value omitted)');
  assert.ok(!JSON.stringify(report).includes('user:secret'));
  await assert.rejects(fs.access(path.join(root, 'SHOULD_NOT_EXIST')));
});

test('skips secrets, dependencies and symlinked source', async t => {
  const root = await fixture(t);
  await write(root, 'app.js', 'export const yes = true;');
  await write(root, '.env', 'PRIVATE_VALUE=never-share');
  await write(root, 'credentials.js', 'export const password = "never-share";');
  await write(root, 'node_modules/vendor/index.js', 'never-share');
  const outside = await fixture(t);
  await write(outside, 'external.js', 'never-share');
  await fs.symlink(path.join(outside, 'external.js'), path.join(root, 'linked.js'));
  await fs.symlink(outside, path.join(root, 'linked-dir'));
  const report = await audit(root);
  assert.deepEqual(report.files.map(f => f.path), ['app.js']);
  assert.equal(report.coverage.omissions.symlinks, 2);
  assert.equal(report.coverage.omissions.sensitiveNames, 2);
  assert.ok(!JSON.stringify(report).includes('never-share'));
});

test('reports line limits and invalid manifests as partial, not passing', async t => {
  const root = await fixture(t);
  await write(root, 'a.js', 'one\ntwo\nthree\n');
  await write(root, 'package.json', '{broken');
  const limited = await audit(root, { maxLines: 2 });
  assert.equal(limited.coverage.complete, false);
  assert.equal(limited.summary.files, 0);
  assert.ok(limited.findings.some(f => f.title === 'Inventory is partial'));
  const invalid = await audit(root);
  assert.equal(invalid.coverage.complete, false);
  assert.ok(invalid.coverage.warnings.some(w => w.includes('Could not parse package.json')));
});

test('escapes project and filename markup in shareable report', async t => {
  const root = await fixture(t);
  await write(root, 'evil<img src=x onerror=alert(1)>.js', 'export const a=1;');
  const report = await audit(root, { name: '</title><script>alert(1)</script>' });
  const html = renderReport(report);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img src=x'));
  assert.ok(html.includes('human review required'));
});

test('CLI creates portable reports and refuses to overwrite an existing directory', async t => {
  const root = await fixture(t);
  const outputParent = await fixture(t);
  const out = path.join(outputParent, 'report');
  await write(root, 'index.js', 'export const answer=42;');
  const result = await exec(process.execPath, [cli, 'audit', root, '--out', out, '--name', 'Client sample']);
  assert.match(result.stdout, /Within-limit JS\/TS static inventory: 1 source files/);
  const original = await fs.readFile(path.join(out, 'report.json'), 'utf8');
  assert.equal(JSON.parse(original).name, 'Client sample');
  await assert.rejects(exec(process.execPath, [cli, 'audit', root, '--out', out]));
  assert.equal(await fs.readFile(path.join(out, 'report.json'), 'utf8'), original);
  assert.equal((await fs.stat(out)).mode & 0o777, 0o700);
});

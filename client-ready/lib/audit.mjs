import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const SKIP = new Set(['node_modules', '.git', '.next', '.nuxt', '.cache', 'dist', 'build', 'coverage', 'vendor', 'analysis-output', 'targets']);
const SOURCE = /\.(?:[cm]?[jt]sx?)$/i;
const LOCKS = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb']);
const safeFile = name => !/(?:^\.env(?:\.|$)|^\.npmrc$|^\.pypirc$|(?:secret|credential|private[-_]?key)|\.(?:pem|key|p12|pfx)$)/i.test(name);
const isTest = name => /(?:^|\/)(?:__tests__|tests?|e2e)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(name);
const slash = name => name.split(path.sep).join('/');
const roleOf = name => isTest(name) ? 'Test' : /(?:^|\/)(?:routes?|controllers?|api)(?:\/|\.)/i.test(name) ? 'HTTP boundary (path hint)' : /(?:^|\/)(?:components?|pages?|views?)(?:\/|\.)/i.test(name) ? 'Interface (path hint)' : /(?:^|\/)(?:lib|utils?|services?)(?:\/|\.)/i.test(name) ? 'Shared logic (path hint)' : 'Source';

export async function audit(rootPath, { name = 'Project handover', maxFiles = 5000, maxLines = 25000 } = {}) {
  const root = await fs.realpath(rootPath);
  if (!(await fs.stat(root)).isDirectory()) throw new Error('Audit target must be a directory.');
  const candidates = [];
  const omissions = { ignoredDirectories: 0, symlinks: 0, sensitiveNames: 0, oversizedFiles: 0, unsupportedFiles: 0 };
  const warnings = [];
  let complete = true;
  let inspectedEntries = 0;
  let importLimitHit = false;
  async function walk(dir) {
    const entries = (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (++inspectedEntries > 50000) { complete = false; return; }
      const file = path.join(dir, entry.name);
      const rel = slash(path.relative(root, file));
      if (entry.isSymbolicLink()) { omissions.symlinks++; continue; }
      if (!safeFile(entry.name)) { omissions.sensitiveNames++; continue; }
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name) || (entry.name.startsWith('.') && entry.name !== '.github')) { omissions.ignoredDirectories++; continue; }
        await walk(file);
        if (!complete) return;
      } else if (entry.isFile()) {
        const eligible = SOURCE.test(rel) || entry.name === 'package.json' || LOCKS.has(entry.name) || rel.startsWith('.github/workflows/');
        if (!eligible) { omissions.unsupportedFiles++; continue; }
        if (candidates.length >= maxFiles) { complete = false; return; }
        candidates.push({ file, rel });
      }
    }
  }
  await walk(root);
  const files = [], manifests = [], imports = [], locks = [], ci = [];
  let lines = 0;
  for (const { file, rel } of candidates) {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) { omissions.symlinks++; continue; }
    if (stat.size > 2 * 1024 * 1024) { omissions.oversizedFiles++; complete = false; continue; }
    if (LOCKS.has(path.basename(file))) { locks.push(rel); continue; }
    if (rel.startsWith('.github/workflows/')) { ci.push(rel); continue; }
    const source = await fs.readFile(file, 'utf8');
    if (path.basename(file) === 'package.json') {
      try {
        const json = JSON.parse(source);
        if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error('Invalid manifest object');
        for (const key of ['scripts', 'dependencies', 'devDependencies']) {
          if (json[key] !== undefined && (!json[key] || typeof json[key] !== 'object' || Array.isArray(json[key]) || !Object.values(json[key]).every(v => typeof v === 'string'))) throw new Error('Invalid manifest field');
        }
        manifests.push({ path: rel, name: typeof json.name === 'string' ? json.name : '(unnamed)', scripts: Object.keys(json.scripts || {}), engines: typeof json.engines?.node === 'string' ? json.engines.node : null,
          entryPoints: [...new Set([json.main, json.module, json.types].filter(x => typeof x === 'string'))],
          dependencies: Object.entries(json.dependencies || {}).map(([name, version]) => ({ name, version: safeVersion(version), kind: 'runtime' })),
          devDependencies: Object.entries(json.devDependencies || {}).map(([name, version]) => ({ name, version: safeVersion(version), kind: 'development' })) });
      } catch { warnings.push(`Could not parse ${rel}.`); complete = false; }
      continue;
    }
    const count = source.length ? source.split(/\r\n|\r|\n/).length - (/\r?\n$/.test(source) ? 1 : 0) : 0;
    if (lines + count > maxLines) { complete = false; warnings.push(`Source line limit reached before ${rel}; request a larger-scope review.`); break; }
    lines += count;
    files.push({ path: rel, lines: count, bytes: stat.size, sha256: crypto.createHash('sha256').update(source).digest('hex'), role: roleOf(rel), test: isTest(rel) });
    // These lexical matches are navigation hints, not a parser or resolved runtime graph.
    const pattern = /\b(?:import\s+(?:[^;\n]*?\s+from\s*)?|export\s+[^;\n]*?\s+from\s*|require\s*\(\s*|import\s*\(\s*)['"]([^'"\n]+)['"]/g;
    let previousIndex = 0, matchLine = 1;
    for (const match of source.matchAll(pattern)) {
      if (imports.length >= 10000) { importLimitHit = true; complete = false; break; }
      matchLine += source.slice(previousIndex, match.index).split('\n').length - 1;
      previousIndex = match.index;
      const spec = match[1];
      if (!spec.startsWith('.') && !/^@?[A-Za-z0-9][\w./@-]*$/.test(spec)) continue;
      if (spec.startsWith('.') && !/^[\w./@ -]+$/.test(spec)) continue;
      imports.push({ from: rel, specifier: spec, line: matchLine, kind: spec.startsWith('.') ? 'local' : 'package-or-builtin' });
    }
  }
  if (importLimitHit) warnings.push('Import hint limit (10,000) reached. Import mapping is partial.');
  let headCommit = null;
  try {
    const { stdout } = await exec('git', ['-C', root, 'rev-parse', '--verify', 'HEAD^{commit}'], { timeout: 3000, maxBuffer: 1024 });
    if (/^[a-f0-9]{40,64}$/.test(stdout.trim())) headCommit = stdout.trim();
  } catch { /* Archives need not contain Git metadata. */ }
  const sourceFingerprint = crypto.createHash('sha256').update(JSON.stringify(files.map(f => [f.path, f.sha256]))).digest('hex');
  const paths = new Set(files.map(f => f.path));
  for (const edge of imports) {
    if (edge.kind !== 'local') { edge.to = null; continue; }
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(edge.from), edge.specifier));
    edge.to = [base, ...['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '/index.js', '/index.ts', '/index.tsx'].map(ext => base + ext)].find(x => paths.has(x)) || null;
  }
  const findings = [];
  const add = (priority, title, observation, action, evidence) => findings.push({ id: `F${String(findings.length + 1).padStart(2, '0')}`, priority, title, observation, action, evidence });
  if (!complete) add('Review first', 'Inventory is partial', 'A scan limit or unreadable manifest prevented complete coverage.', 'Review warnings and agree the remaining scope before drawing conclusions.', []);
  if (!manifests.length) add('Review first', 'No package manifest found', 'No readable package.json was inventoried in the scanned paths.', 'Confirm the project root and provide the intended build and runtime instructions.', []);
  for (const m of manifests) {
    const dir = path.posix.dirname(m.path);
    const lock = locks.some(l => path.posix.dirname(l) === dir || path.posix.dirname(l) === '.');
    if (!lock) add('Plan next', 'No lockfile found for this package', `No supported lockfile was inventoried alongside ${m.path} or at the review root.`, 'Confirm the workspace/package-manager strategy. Preserve an approved lockfile for repeatable installs.', [{ path: m.path, line: 1 }]);
    if (!m.scripts.some(s => /^(test|check)(?::|$)/i.test(s))) add('Review first', 'No test or check script declared', `${m.path} has no script named test/check or starting with test:/check:. Other verification may exist.`, 'Ask the owner for the actual verification command and record an observed run before release.', [{ path: m.path, line: 1 }]);
    if (!m.engines) add('Plan next', 'Node version is not declared', `${m.path} does not declare engines.node. Version pins may exist outside this scan.`, 'Confirm the supported Node version from CI or deployment and document it.', [{ path: m.path, line: 1 }]);
  }
  if (!files.some(f => f.test)) add('Review first', 'No conventionally named tests inventoried', 'No source paths matched test/spec filenames or test directories in this scan.', 'Locate external test suites or add a representative behavior test after agreeing scope.', []);
  if (!ci.length) add('Plan next', 'No GitHub workflow inventoried', 'No files were found under .github/workflows in this scan. Other CI systems are outside coverage.', 'Confirm the CI provider and capture its required checks and last known result.', []);
  const unresolved = imports.filter(i => i.kind === 'local' && !i.to);
  if (unresolved.length) add('Confirm context', 'Some local import hints did not resolve', `${unresolved.length} lexical import matches could not be mapped to an inventoried source path. Aliases, generated files, comments and unsupported extensions can explain this.`, 'Review these edges with the project configuration; this is not evidence of a broken build.', unresolved.slice(0, 8).map(i => ({ path: i.from, line: i.line })));
  return { schemaVersion: 1, name, generatedAt: new Date().toISOString(), revision: { headCommit, worktree: 'Working tree changes were not checked; HEAD is a reference, not proof of file identity.', sourceFingerprint }, coverage: { complete, mode: 'Read-only JS/TS static inventory; no project code executed', maxFiles, maxLines, omissions, warnings },
    summary: { files: files.length, lines, testFiles: files.filter(f => f.test).length, packages: manifests.length, runtimeDependencies: manifests.reduce((sum, m) => sum + m.dependencies.length, 0), importHints: imports.length },
    manifests, files, imports, locks, ci, findings,
    limitations: ['This automated draft requires human review before client delivery.', 'No application, test, build, dependency install, security scan or license review was executed.', 'Line counts include comments and blank lines. Generated code outside excluded directories may remain.', 'Import matches are lexical hints and can include comments or miss syntax, aliases and dynamic behavior.', 'Path-based role labels are hints, not confirmed architecture. No dependency version is certified current or vulnerable.', 'No secrets scanner was run. Sensitive filenames are skipped, but repository paths and package names can still be confidential. Review before sharing.'] };
}

function safeVersion(value) {
  if (typeof value !== 'string') return '(invalid declaration)';
  return /^[\d\s.vxX*<>=~^|+-]+$/.test(value) || /^workspace:[\w*~^.+-]+$/.test(value) ? value : '(custom source; value omitted)';
}

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { audit } from '../lib/audit.mjs';
import { renderReport } from '../lib/report.mjs';

const product = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repo = path.dirname(product);
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'clarity-sample-'));
try {
  // A bounded example of this public project's original application, excluding this new service.
  for (const name of ['server.mjs', 'package.json', 'public', 'scripts', '.github']) {
    await fs.cp(path.join(repo, name), path.join(temp, name), { recursive: true, dereference: false });
  }
  const report = await audit(temp, { name: 'REA Workbench — public application example' });
  report.coverage.warnings.push('Sample scope: original server.mjs, package.json, public/, scripts/ and .github/ from elsharuf107s-ux/reverse. This Codebase Clarity prototype is excluded. Shell and HTML files are outside the automated JS/TS source inventory; the separate technical handover discusses them. This is not a client engagement.');
  await fs.writeFile(path.join(product, 'public/sample.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(product, 'public/sample.html'), renderReport(report));
  console.log(`Public sample generated: ${report.summary.files} JS/TS source files, ${report.summary.lines} source lines.`);
} finally { await fs.rm(temp, { recursive: true, force: true }); }

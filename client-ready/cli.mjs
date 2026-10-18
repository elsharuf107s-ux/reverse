#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { audit } from './lib/audit.mjs';
import { renderReport } from './lib/report.mjs';

const [command, root, ...flags] = process.argv.slice(2);
if (command !== 'audit' || !root) {
  console.log('Usage: node client-ready/cli.mjs audit <directory> --out <new-output-directory> [--name "Project name"]');
  process.exit(command === '--help' ? 0 : 1);
}
try {
  const options = {};
  for (let i = 0; i < flags.length; i += 2) {
    if (!['--out', '--name'].includes(flags[i]) || !flags[i + 1]) throw new Error(`Invalid option: ${flags[i]}`);
    options[flags[i].slice(2)] = flags[i + 1];
  }
  if (!options.out) throw new Error('--out is required. Use a new directory to preserve previous reports.');
  const report = await audit(root, { name: options.name });
  const out = path.resolve(options.out);
  await fs.mkdir(out, { recursive: false, mode: 0o700 });
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  await fs.writeFile(path.join(out, 'index.html'), renderReport(report), { flag: 'wx', mode: 0o600 });
  console.log(`${report.coverage.complete ? 'Within-limit' : 'Partial'} JS/TS static inventory: ${report.summary.files} source files, ${report.summary.lines} lines. Human review required.`);
  console.log(`Report: ${path.join(out, 'index.html')}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const product = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const contactEmail = 'elsharuf107s@gmail.com';

function usage() {
  return 'Usage: node client-ready/scripts/export-static.mjs --out <new-directory> [--base /reverse/]';
}

function options(args) {
  const result = { base: '/reverse/' };
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!['--out', '--base'].includes(key) || !args[i + 1] || args[i + 1].startsWith('--')) {
      throw new Error(usage());
    }
    const name = key.slice(2);
    if (name === 'out' && result.out !== undefined || name === 'base' && result.baseSet) {
      throw new Error(`Repeated option ${key}. ${usage()}`);
    }
    result[name] = args[++i];
    if (name === 'base') result.baseSet = true;
  }
  if (!result.out) throw new Error(usage());
  if (!/^(?:\/[A-Za-z0-9._~-]+)*\/$/.test(result.base) || result.base.split('/').some(part => ['.', '..'].includes(part))) {
    throw new Error('--base must be an absolute URL directory such as /reverse/ or /, without traversal, query, or fragment.');
  }
  return { out: path.resolve(result.out), base: result.base };
}

function relativeLinks(html) {
  // Every exported document is at the same level; relative links work on Pages and local previews.
  return html.replace(/\b(href|src)=(['"])\/(?!\/)([^'"]*)\2/g, (_, attribute, quote, target) =>
    `${attribute}=${quote}./${target}${quote}`);
}

async function build({ out, base }) {
  // This allowlist deliberately excludes source, enquiries, prospect lists, and internal sales files.
  const sources = new Map([
    ['index.html', 'public/index.html'],
    ['style.css', 'public/style.css'],
    ['app.js', 'public/app.js'],
    ['sample.html', 'public/sample.html'],
    ['sample.json', 'public/sample.json'],
    ['offer.md', 'sales/client-offer.md'],
    ['handover.md', 'sales/sample-handover.md']
  ]);
  const files = new Map(await Promise.all([...sources].map(async ([target, source]) =>
    [target, await fs.readFile(path.join(product, source), 'utf8')])));

  for (const name of ['index.html', 'sample.html']) files.set(name, relativeLinks(files.get(name)));
  const mailto = `mailto:${contactEmail}?subject=${encodeURIComponent('Codebase Clarity — project scope')}`;
  const contactAnchor = /<a\b(?=[^>]*\bid="contact-link")[^>]*>/;
  if (!contactAnchor.test(files.get('index.html'))) throw new Error('Contact link missing; static export needs review.');
  files.set('index.html', files.get('index.html')
    .replace(contactAnchor, `<a id="contact-link" class="text-link" href="${mailto}">`)
    .replace('This demo downloads your brief locally. No enquiry is transmitted.',
      'The form downloads locally. Email Ervin Mosley separately to discuss scope.'));

  const configStart = files.get('app.js').indexOf("fetch('/api/config')");
  if (configStart < 0) throw new Error('Configuration code changed; static export needs review.');
  files.set('app.js', `${files.get('app.js').slice(0, configStart)}// Static hosting has no API. The public contact is also visible without JavaScript.\nconst contactLink = document.getElementById('contact-link');\ncontactLink.href = ${JSON.stringify(mailto)};\ncontactLink.hidden = false;\n`);
  if (/\bfetch\s*\(/.test(files.get('app.js')) || /(?:href|src)=["']\/(?!\/)/.test(files.get('index.html'))) {
    throw new Error('Unexpected network dependency or absolute asset path; static export needs review.');
  }

  files.set('README.md', `# Codebase Clarity\n\nA fixed-scope JavaScript/Node repository handover service offered by **Ervin Mosley**. The proposed price is **$1,000 USD** ($500 to start, $500 on delivery), subject to agreed scope, access, and delivery date. Read [the full offer](./offer.md).\n\nContact: [${contactEmail}](mailto:${contactEmail}). The project brief form downloads a text file locally; it does not send an enquiry or take payment. Use the email link to discuss a project.\n\n[The sample report](./sample.html), [sample JSON](./sample.json), and [handover notes](./handover.md) illustrate a public-repository review. They are AI-assisted drafts with independent human QA pending, not paid client work, testimonials, or guarantees of results. A static inventory does not establish runtime correctness or security.\n\n## Preview and build\n\nThese files need only a static web host. There are no packages to install and no API server, credentials, payment integration, or form submission endpoint. Relative links support the configured hosting path **${base}**, other subpaths, and a domain root.\n\nTo preview this folder, run \`python3 -m http.server 8080 --bind 127.0.0.1\` from this directory, then open \`http://127.0.0.1:8080/\`.\n\nTo regenerate from the source repository root, run \`node client-ready/scripts/export-static.mjs --out /tmp/codebase-clarity-public-new --base ${base}\`. Choose a fresh output directory each time; existing destinations are refused. Serve the contents of the generated directory at your chosen hosting path. The export command does not deploy or publish anything.\n`);
  files.set('.nojekyll', '');

  // mkdir is the exclusive reservation: even an existing empty directory or symlink is refused.
  await fs.mkdir(path.dirname(out), { recursive: true });
  try { await fs.mkdir(out); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Output already exists; choose a fresh directory: ${out}`);
    throw error;
  }
  for (const [name, data] of files) await fs.writeFile(path.join(out, name), data, { flag: 'wx' });
  console.log(`Exported ${files.size} public files to ${out}. Hosting path: ${base}. Nothing was deployed.`);
}

try { await build(options(process.argv.slice(2))); }
catch (error) { console.error(error.message); process.exitCode = 1; }

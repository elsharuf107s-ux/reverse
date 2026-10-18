# Codebase Clarity

A JavaScript/TypeScript codebase inventory tool and a **$1,000 USD codebase handover service** from **Ervin Mosley**. Contact: **elsharuf107s@gmail.com**.

The paid sprint combines an evidence-linked inventory with a reviewed architecture explanation, verification checklist, maintenance priorities and a 30-minute walkthrough. It covers one agreed JavaScript/Node repository up to 25,000 non-generated first-party source lines. The proposed fee is $500 to start and $500 on delivery, with a target of three business days after agreed scope, access and deposit. See [the full client offer](sales/client-offer.md).

This is a prototype and public-repository example. No client results, security certification or guaranteed income are claimed. The automated report is a draft; the paid service requires review and project-specific analysis.

## Run

Node 24 or later is required. This product has no external runtime packages and needs no dependency installation.

```sh
cd client-ready
npm start
```

The local demo listens on loopback port 3100. `CLARITY_HOST` and `CLARITY_PORT` override that. `CLARITY_CONTACT_EMAIL` overrides the business contact; set an empty string to hide it. It runs separately from the original REA Workbench.

The homepage serves the offer and sample report. Its brief form downloads a text file locally. It does not transmit an enquiry, take a payment, or book a meeting. The contact link opens the visitor's email application.

## Generate an inventory

From the checkout root:

```sh
node client-ready/cli.mjs audit /path/to/authorized/source \
  --out /path/to/new-report-directory --name 'Project handover'
```

The output directory's parent must already exist. The CLI creates a private new directory containing standalone `index.html` and `report.json`, refuses to overwrite prior output, and does not execute project code. The report can be filtered or printed to PDF.

Scope: JavaScript/TypeScript source, package manifests, lockfile names and GitHub workflow paths. Hidden directories other than `.github`, common dependency/build paths, symlinks and selected sensitive filenames are skipped. The report lists omissions, limits, warnings and partial coverage. Source line counts include comments/blanks; confirm commercial scope separately. Lexical import matches and path-based role labels are hints, not a parser or verified runtime architecture. HEAD is only a reference; file hashes identify the inventoried sources.

The tool does not run tests, inspect production behavior, verify dependency versions, scan vulnerabilities or certify licensing. Sensitive filenames are excluded, but paths and metadata can remain confidential. Review and redact the complete report before sharing it. Review a stable authorized source copy, without concurrent modifications.

## Example

```sh
cd client-ready
npm run sample
```

The included sample inventories selected original REA Workbench application files, excluding this product. Shell/HTML configuration is outside its automated JS/TS inventory. [The technical handover example](sales/sample-handover.md) adds an AI-assisted architecture explanation, source references, priorities and narrow current-instance validation evidence. Independent human QA is pending. This public example is not a paid client engagement.

## Tests

```sh
cd client-ready
npm test
npm run test:browser
```

Tests exercise meaningful filesystem inventory, non-execution, symlink/sensitive-name exclusions, partial coverage, HTML escaping, output preservation, static export and HTTP boundaries. The browser check uses `/usr/bin/chromium` or `CHROMIUM_PATH` and validates desktop/mobile layout, contact handling, brief generation and report filtering. Screenshots go in the parent's ignored `analysis-output/` directory. The download click is intercepted to inspect the generated brief; no inquiry is sent.

## Static publishing

```sh
node client-ready/scripts/export-static.mjs --out /tmp/clarity-public --base /reverse/
```

The exporter creates a fresh directory with relative asset URLs, a direct email contact, the sample, client-facing offer and technical handover. It excludes internal sales and contractor notes. Hosting and payment integration are separate operations; a static export does not establish a live deployment or a sale.

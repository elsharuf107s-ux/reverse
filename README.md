# Codebase Clarity

A fixed-scope JavaScript/Node repository handover service offered by **Ervin Mosley**. The proposed price is **$1,000 USD** ($500 to start, $500 on delivery), subject to agreed scope, access, and delivery date. Read [the full offer](./offer.md).

Contact: [elsharuf107s@gmail.com](mailto:elsharuf107s@gmail.com). The project brief form downloads a text file locally; it does not send an enquiry or take payment. Use the email link to discuss a project.

[The sample report](./sample.html), [sample JSON](./sample.json), and [handover notes](./handover.md) illustrate a public-repository review. They are AI-assisted drafts with independent human QA pending, not paid client work, testimonials, or guarantees of results. A static inventory does not establish runtime correctness or security.

## Preview and build

These files need only a static web host. There are no packages to install and no API server, credentials, payment integration, or form submission endpoint. Relative links support the configured hosting path **/reverse/**, other subpaths, and a domain root.

To preview this folder, run `python3 -m http.server 8080 --bind 127.0.0.1` from this directory, then open `http://127.0.0.1:8080/`.

To regenerate from the source repository root, run `node client-ready/scripts/export-static.mjs --out /tmp/codebase-clarity-public-new --base /reverse/`. Choose a fresh output directory each time; existing destinations are refused. Serve the contents of the generated directory at your chosen hosting path. The export command does not deploy or publish anything.

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const product = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'clarity-browser-'));
const output = path.resolve(product, '../analysis-output');
await fs.mkdir(output, { recursive: true });
const server = spawn(process.execPath, [path.join(product, 'server.mjs')], { env: { ...process.env, CLARITY_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
let browser, ws;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function listenFor(child, stream, pattern) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Process startup timeout')), 15000);
    let log = '';
    child.once('error', e => { clearTimeout(timeout); reject(e); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Process exited ${code}: ${log.slice(-500)}`)); });
    child[stream].on('data', chunk => { log += chunk; const match = log.match(pattern); if (match) { clearTimeout(timeout); resolve(match); } });
  });
}
try {
  const start = await listenFor(server, 'stdout', /127.0.0.1:(\d+)/);
  const base = `http://127.0.0.1:${start[1]}`;
  browser = spawn(process.env.CHROMIUM_PATH || '/usr/bin/chromium', ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const debug = await listenFor(browser, 'stderr', /DevTools listening on (ws:\/\/[^\s]+)/);
  const debugBase = debug[1].replace(/^ws:/, 'http:').split('/devtools/')[0];
  const pages = await fetch(`${debugBase}/json/list`).then(r => r.json());
  ws = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map(), exceptions = [];
  ws.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.exceptionThrown') exceptions.push(data.params.exceptionDetails.text);
    if (pending.has(data.id)) { const p = pending.get(data.id); pending.delete(data.id); clearTimeout(p.timer); data.error ? p.reject(new Error(JSON.stringify(data.error))) : p.resolve(data.result); }
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
    pending.set(n, { resolve, reject, timer }); ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  async function until(expression) {
    for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50); }
    throw new Error(`Browser condition timed out: ${expression}`);
  }
  async function navigate(url, ready) {
    await call('Page.navigate', { url });
    await until(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete' && (${ready})`);
  }
  await call('Page.enable'); await call('Runtime.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate(base + '/', 'document.getElementById("contact-link") && !document.getElementById("contact-link").hidden');
  assert.equal(await evaluate('document.title'), 'Codebase Clarity — Take over the code with a plan.');
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  assert.equal(await evaluate('document.getElementById("contact-link").getAttribute("href").startsWith("mailto:elsharuf107s@gmail.com")'), true);
  const desktop = await call('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(output, 'clarity-desktop.png'), Buffer.from(desktop.data, 'base64'));
  const brief = await evaluate(`(async()=>{const original=URL.createObjectURL;URL.createObjectURL=function(blob){window.briefBlob=blob;return original.call(URL,blob)};HTMLAnchorElement.prototype.click=function(){};document.getElementById('company').value='Demo agency';document.getElementById('project').value='Handover for the next maintainer';document.getElementById('brief-form').requestSubmit();return await window.briefBlob.text()})()`);
  assert.match(brief, /Agency: Demo agency/); assert.match(brief, /\$1,000 USD/);
  assert.match(await evaluate('document.getElementById("form-status").textContent'), /No message was sent/);
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true);
  await evaluate('scrollTo(0,0)');
  const mobile = await call('Page.captureScreenshot', { format: 'png' });
  await fs.writeFile(path.join(output, 'clarity-mobile.png'), Buffer.from(mobile.data, 'base64'));
  await navigate(base + '/sample.html', 'document.getElementById("file-filter") !== null');
  assert.ok(await evaluate('document.querySelectorAll("#files tbody tr").length') > 0);
  await evaluate(`const input=document.getElementById('file-filter');input.value='no-matching-file-123';input.dispatchEvent(new Event('input'));`);
  assert.equal(await evaluate('document.querySelectorAll("#files tbody tr:not([hidden])").length'), 0);
  assert.equal(exceptions.length, 0, `Browser exceptions: ${exceptions.join(', ')}`);
  console.log('Browser checks passed: desktop/mobile layouts, business contact, brief download, sample report filtering; no uncaught JS errors.');
  console.log(`Screenshots: ${output}/clarity-desktop.png and clarity-mobile.png`);
} finally {
  ws?.close(); browser?.kill(); server.kill();
  await delay(250);
  await fs.rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}

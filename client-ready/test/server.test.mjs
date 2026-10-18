import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

test('serves the offer and real sample, blocks arbitrary file access and writes', async t => {
  const server = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url))], { env: { ...process.env, CLARITY_PORT: '0', CLARITY_CONTACT_EMAIL: 'ervin@example.invalid' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => server.kill());
  const address = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Server did not start')), 5000);
    server.once('error', reject);
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    server.stdout.on('data', data => { const match = String(data).match(/127.0.0.1:(\d+)/); if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); } });
  });
  const landing = await fetch(address);
  assert.equal(landing.status, 200);
  assert.match(await landing.text(), /Ervin Mosley/);
  const health = await fetch(`${address}/api/health`).then(r => r.json());
  assert.equal(health.ok, true);
  assert.ok(health.sampleFiles > 0);
  const sample = await fetch(`${address}/sample.html`);
  assert.equal(sample.status, 200);
  assert.match(await sample.text(), /Maintenance priorities/);
  const offer = await fetch(`${address}/offer.md`).then(r => r.text());
  assert.match(offer, /\$1,000/);
  assert.ok(!offer.includes('Internal launch notes'));
  assert.equal((await fetch(`${address}/api/config`).then(r => r.json())).contactEmail, 'ervin@example.invalid');
  assert.equal((await fetch(`${address}/sales/outsourcing.md`)).status, 404);
  assert.equal((await fetch(`${address}/%2e%2e/package.json`)).status, 404);
  assert.equal((await fetch(`${address}/`, { method: 'POST', body: 'test' })).status, 405);
  const malformed = await new Promise((resolve, reject) => {
    const socket = net.connect(Number(new URL(address).port), '127.0.0.1');
    let response = '';
    socket.setTimeout(3000, () => socket.destroy(new Error('Socket timeout')));
    socket.on('connect', () => socket.write('GET //[ HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n'));
    socket.on('data', data => response += data);
    socket.on('end', () => resolve(response));
    socket.on('error', reject);
  });
  assert.match(malformed, /400 Bad Request/);
  assert.equal((await fetch(`${address}/api/health`)).status, 200);
});

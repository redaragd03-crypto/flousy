/* tests/probe-idb.js — quick IndexedDB probe in headless Chrome */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find((c) => existsSync(c));
const PORT = 9335;
const profile = join(process.env.TEMP || 'C:/Users/A&M/AppData/Local/Temp', 'flosy-probe-profile');

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-first-run', '--disable-gpu',
  '--user-data-dir', profile
], { stdio: ['ignore', 'pipe', 'pipe'] });

await sleep(3000);
let list;
try {
  list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
} catch (e) {
  console.error('devtools not up');
  process.exit(1);
}
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0;
const pend = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
});
const send = (method, params = {}) => new Promise((r) => {
  const id = ++seq;
  pend.set(id, r);
  ws.send(JSON.stringify({ id, method, params }));
  setTimeout(() => { if (pend.has(id)) { pend.delete(id); r(null); } }, 6000);
});
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:8123' });
await sleep(1500);
const origin = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
console.log('PAGE:', origin && origin.result ? origin.result.value : '?');

const expr = `new Promise(r => {
  const t0 = Date.now();
  const report = (s) => { console.log('[probe] ' + s); r(s); };
  try {
    const req = indexedDB.open('probe', 1);
    req.onupgradeneeded = () => { try { req.result.createObjectStore('s', { keyPath: 'id' }); } catch (e) { report('upgrade-err ' + e.message); } };
    req.onsuccess = () => report('open-ok in ' + (Date.now() - t0) + 'ms');
    req.onerror = () => report('open-err: ' + (req.error ? req.error.name : '?'));
    req.onblocked = () => report('blocked!');
    setTimeout(() => report('timeout after ' + (Date.now() - t0) + 'ms'), 4000);
  } catch (e) { report('threw: ' + e.message); }
})`;
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
console.log('RESULT:', r && r.result ? r.result.value : JSON.stringify(r));
ws.close();
chrome.kill('SIGTERM');

/* tests/smoke.js — headless Chrome smoke test via CDP (Node 22+ WebSocket)
   Usage: node tests/smoke.js [url]
   Requires: running static server (node server.js) and Chrome installed.
*/

import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const URL_TO_LOAD = process.argv[2] || 'http://127.0.0.1:8123';
const DEBUG_PORT = 9333;

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
];
import { existsSync } from 'node:fs';
const CHROME = CHROME_CANDIDATES.find((c) => existsSync(c));
if (!CHROME) {
  console.error('No Chrome/Edge found');
  process.exit(2);
}

const chrome = spawn(CHROME, [
  '--headless=new',
  `--remote-debugging-port=${DEBUG_PORT}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-gpu',
  '--user-data-dir',
  `${process.env.TEMP ? process.env.TEMP : 'C:/Users/A&M/AppData/Local/Temp'}/flosy-smoke-profile-${Date.now()}-${process.pid}`
], { stdio: ['ignore', 'pipe', 'pipe'] });

let chromeOut = '';
chrome.stderr.on('data', (d) => { chromeOut += d.toString(); });

async function getTargets() {
  for (let i = 0; i < 40; i++) {
    try {
      // wait for DevTools
      await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      let res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      let list = await res.json();
      let page = list.find((t) => t.type === 'page');
      if (!page) {
        // create a new tab pointing at the app
        res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(URL_TO_LOAD)}`, { method: 'PUT' });
        if (res.ok) {
          page = await res.json();
        } else {
          // some builds need GET
          res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(URL_TO_LOAD)}`);
          page = await res.json();
        }
      }
      if (page && page.webSocketDebuggerUrl) return page;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('DevTools not reachable');
}

let seq = 0;
const pending = new Map();
let ws;
const events = [];
const exceptions = [];
const logErrors = [];
const consoleErrors = [];
const consoleLogs = [];

function send(method, params = {}, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout ${method}`)); } }, timeoutMs);
  });
}

try {
  const target = await getTargets();
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      exceptions.push(msg.params.exceptionDetails?.exception?.description || JSON.stringify(msg.params.exceptionDetails));
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      logErrors.push(msg.params.entry.text);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a) => a.value || a.description || '').join(' ');
      if (msg.params.type === 'error') consoleErrors.push(text);
      if (text.includes('[flosy]')) consoleLogs.push(text);
    }
    if (msg.method) events.push(msg.method);
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Page.navigate', { url: URL_TO_LOAD }, 30000);
  await sleep(4500);

  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || 'unknown'));
    return r.result.value;
  };

  const results = {};

  // initial render
  results.origin = await evalJs('location.origin + location.pathname');
  results.title = await evalJs('document.title');
  results.theme = await evalJs('document.documentElement.getAttribute("data-theme")');
  results.icons = await evalJs('Object.keys(window.__flosyIcons || {}).length');
  results.sideNavLinks = await evalJs('document.querySelectorAll(".side-link").length');
  results.hash = await evalJs('location.hash');
  results.viewInnerLen = await evalJs('document.getElementById("view").innerHTML.length');
  results.viewChildren = await evalJs('document.getElementById("view").children.length');
  results.booted = await evalJs('!!(window.__flosy && window.__flosy.booted)');
  results.initError = await evalJs('window.__flosy ? (window.__flosy.initError || null) : "no-__flosy"');
  results.txCount = await evalJs('window.__flosy ? window.__flosy.ctx.state.transactions.length : -1');
  if (!results.booted) {
    // give async init more time
    for (let i = 0; i < 6 && !(await evalJs('!!(window.__flosy && window.__flosy.booted)')); i++) await sleep(1000);
    results.bootedAfterWait = await evalJs('!!(window.__flosy && window.__flosy.booted)');
    results.viewChildrenAfterWait = await evalJs('document.getElementById("view").children.length');
    results.initErrorAfterWait = await evalJs('window.__flosy ? (window.__flosy.initError || null) : "no-__flosy"');
    if (results.bootedAfterWait) {
      results.hero = await evalJs('!!document.querySelector(".hero")');
      results.qa = await evalJs('document.querySelectorAll(".qa").length');
      results.balanceText = await evalJs('document.querySelector(".hero-balance")?.textContent?.trim() || ""');
    } else {
      // deep probe: is IDB usable from this exact page?
      results.idbProbe = await evalJs(`new Promise(r => {
        const req = indexedDB.open('flosy-probe', 1);
        req.onsuccess = () => r('idb-ok stores=' + Array.from(req.result.objectStoreNames).join(','));
        req.onerror = () => r('idb-err ' + (req.error ? req.error.name : '?'));
        req.onblocked = () => r('idb-blocked');
        setTimeout(() => r('idb-timeout'), 3000);
      })`);
      results.databasesProbe = await evalJs(`new Promise(r => { try { indexedDB.databases().then(dbs => r(JSON.stringify(dbs)), () => r('databases-err')); } catch (e) { r('threw ' + e.message); } })`);
      results.stillBooted = await evalJs('!!(window.__flosy && window.__flosy.booted)');
    }
  }
  results.hero = await evalJs('!!document.querySelector(".hero")');
  results.qa = await evalJs('document.querySelectorAll(".qa").length');
  results.balanceText = await evalJs('document.querySelector(".hero-balance")?.textContent?.trim() || ""');
  results.errorCard = await evalJs(`document.querySelector('#view')?.textContent?.includes('تعذر فتح قاعدة البيانات') ? 'boot-error-card' : ''`);

  // seed regression: applySeed() exercises the bulkPut write path
  results.seedTxBefore = await evalJs('window.__flosy.ctx.state.transactions.length');
  results.seedErr = await evalJs(`(async () => { try { await window.__flosy.ctx.applySeed(); await window.__flosy.ctx.reload(); return null; } catch (e) { return String(e && e.message || e); } })()`);
  results.seedTxAfter = await evalJs('window.__flosy.ctx.state.transactions.length');
  // re-render dashboard so the hero reflects seeded data
  await evalJs(`new Promise(r => { location.hash = '#/operations'; setTimeout(() => { location.hash = ''; r(true); }, 200); })`);
  for (let i = 0; i < 12 && !(await evalJs('!!document.querySelector(".hb-value")')); i++) await sleep(250);
  results.balanceAfterSeed = await evalJs('document.querySelector(".hb-value")?.textContent?.trim() || ""');

  // navigate to each route and check a marker
  const routes = [
    { hash: '#/operations', marker: '.search-in', label: 'operations' },
    { hash: '#/accounts', marker: '.acct, .empty', label: 'accounts' },
    { hash: '#/budgets', marker: '.card', label: 'budgets' },
    { hash: '#/goals', marker: '.goal, .empty', label: 'goals' },
    { hash: '#/bills', marker: '.bill, .empty', label: 'bills' },
    { hash: '#/stats', marker: '.kpi, .empty', label: 'stats' },
    { hash: '#/reports', marker: '.print-area', label: 'reports' },
    { hash: '#/settings', marker: '.set-group', label: 'settings' }
  ];
  for (const r of routes) {
    await evalJs(`location.hash = ${JSON.stringify(r.hash)}`);
    for (let i = 0; i < 12 && !(await evalJs(`!!document.querySelector('${r.marker}')`)); i++) await sleep(250);
    results[`route:${r.label}`] = await evalJs(`!!document.querySelector('${r.marker}')`);
    results[`route:${r.label}:err`] = await evalJs('document.querySelector("#view .card h3")?.textContent?.includes("خطأ") || false');
  }

  // dashboard again
  await evalJs(`location.hash = '#/dashboard'`);
  await sleep(700);
  results.dashSummary = await evalJs('!!document.querySelector(".hero")');

  // open add-expense modal
  results.modal = await evalJs(`
    (async () => {
      document.getElementById('fab')?.click();
      await new Promise(r => setTimeout(r, 400));
      const items = document.querySelectorAll('.sheet-item');
      if (!items.length) return 'no-sheet';
      items[0].click();
      await new Promise(r => setTimeout(r, 500));
      return !!document.querySelector('.modal-panel .amount-wrap');
    })()
  `);

  console.log(JSON.stringify(results, null, 2));
  console.log('\nJS exceptions:', exceptions.length ? exceptions.slice(0, 5) : 'none');
  const realLogErrors = logErrors.filter((e) => !/favicon|manifest/i.test(e));
  console.log('Log errors:', realLogErrors.length ? realLogErrors.slice(0, 8) : 'none');
  console.log('Console errors:', consoleErrors.length ? consoleErrors.slice(0, 8) : 'none');
  console.log('Boot logs:', consoleLogs.length ? consoleLogs : '(none)');

  const failedRoutes = Object.entries(results).filter(([k, v]) => k.startsWith('route:') && k.endsWith(':err') && v === true);
  const missingRoutes = Object.entries(results).filter(([k, v]) => k.startsWith('route:') && !k.endsWith(':err') && v === false);
  let ok = true;
  if (exceptions.length) { ok = false; console.log('❌ JS exceptions found'); }
  else console.log('✅ no JS exceptions');
  if (missingRoutes.length) { ok = false; console.log('❌ routes missing marker:', missingRoutes.map(([k]) => k)); }
  else console.log('✅ all routes rendered markers');
  if (!results.hero) { ok = false; console.log('❌ dashboard hero missing'); }
  if (results.errorCard) { ok = false; console.log('❌ error card shown:', results.errorCard); }
  if (results.seedErr) { ok = false; console.log('❌ seed failed:', results.seedErr); }
  else if (!(results.seedTxAfter > results.seedTxBefore)) { ok = false; console.log('❌ seed did not add transactions:', results.seedTxBefore, '->', results.seedTxAfter); }
  else console.log(`✅ seed ok (${results.seedTxBefore} -> ${results.seedTxAfter} txs, hero="${results.balanceAfterSeed}")`);
  if (consoleErrors.length) { ok = false; console.log('❌ console errors found (see above)'); }

  console.log(ok ? '\nSMOKE TEST PASSED' : '\nSMOKE TEST FAILED');
  process.exitCode = ok ? 0 : 1;
} catch (err) {
  console.error('SMOKE ERROR:', err.message);
  console.error(chromeOut.slice(-2000));
  process.exitCode = 2;
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill('SIGTERM');
}

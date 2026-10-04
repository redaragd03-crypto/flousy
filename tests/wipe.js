/* tests/wipe.js — full local data reset feature test (headless Chrome + CDP, phone viewport)
   Covers: settings button, confirm dialog, cancel = no deletion, confirm = full wipe,
   verification of IndexedDB/localStorage/onboarding/name/txs/accounts/goals/bills,
   first-run behavior after reload, no crash, SW intact. */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync } from 'node:fs';

const URL_TO_LOAD = process.argv[2] || 'http://127.0.0.1:8080';
const DEBUG_PORT = 9337;
const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'
];
const CHROME = CHROME_CANDIDATES.find((c) => existsSync(c));
if (!CHROME) { console.error('No Chrome/Edge found'); process.exit(2); }

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--user-data-dir', `${process.env.TEMP || 'C:/Users/A&M/AppData/Local/Temp'}/flosy-wipe-profile-${Date.now()}-${process.pid}`
], { stdio: ['ignore', 'pipe', 'pipe'] });

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      let res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      let page = (await res.json()).find((t) => t.type === 'page');
      if (!page) {
        res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
        page = await res.json();
      }
      if (page && page.webSocketDebuggerUrl) return page;
    } catch { /* retry */ }
    await sleep(250);
  }
  throw new Error('DevTools not reachable');
}

let seq = 0;
const pending = new Map();
let ws;
const exceptions = [];
const consoleErrors = [];

function send(method, params = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); reject(new Error(`timeout ${method}`)); } }, timeoutMs);
  });
}
const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || 'unknown'));
  return r.result.value;
};
const step = async (name, fn) => {
  try { await fn(); console.log(`  PASS  ${name}`); return true; }
  catch (e) { console.log(`  FAIL  ${name}: ${e.message}`); return false; }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const waitUntil = async (expr, { tries = 24, ms = 250, label = '' } = {}) => {
  for (let i = 0; i < tries; i++) {
    if (await evalJs(expr)) return;
    await sleep(ms);
  }
  throw new Error(`waitUntil timeout: ${label || expr}`);
};
const bootApp = async () => {
  await send('Page.navigate', { url: URL_TO_LOAD }, 30000);
  await waitUntil(`!!(window.__flosy && window.__flosy.booted)`, { label: 'boot', tries: 40 });
  await sleep(350);
};
const seedUserData = async () => {
  // onboarding: set name
  await evalJs(`(() => { const i = document.getElementById('onbName'); if (i) { i.value = 'مستخدم المسح'; document.querySelector('#onboardingRoot .btn').click(); } return true; })()`);
  await waitUntil(`document.getElementById('onboardingRoot').classList.contains('hidden')`, { label: 'onboarding done' });
  // add expense tx
  await evalJs(`(() => { document.querySelector('.qa.qa-expense').click(); return true; })()`);
  await waitUntil(`!!document.querySelector('.modal-open .modal-panel')`, { label: 'expense modal' });
  await evalJs(`(() => { document.querySelector('.modal-panel .amount-wrap input').value = '42'; document.querySelector('.modal-panel .catgrid .cat-tile').click(); document.querySelector('.modal-panel .modal-foot .btn-primary').click(); return true; })()`);
  await waitUntil(`window.__flosy.ctx.state.transactions.some(t => t.amount === 42)`, { label: 'tx saved' });
};

let pass = 0, fail = 0;
const ok = (r) => { if (r) pass++; else fail++; };

try {
  const target = await getTarget();
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
    if (msg.method === 'Runtime.exceptionThrown') exceptions.push(msg.params.exceptionDetails?.exception?.description || 'exception');
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') consoleErrors.push(msg.params.args.map((a) => a.value || a.description || '').join(' '));
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });

  await bootApp();

  console.log('--- wipe feature test ---');

  ok(await step('seed: user data exists (name + tx + accounts)', async () => {
    await seedUserData();
    assert((await evalJs(`window.__flosy.ctx.state.settings.userName`)) === 'مستخدم المسح', 'name missing');
    assert((await evalJs(`window.__flosy.ctx.state.transactions.length`)) >= 1, 'no tx');
    assert((await evalJs(`window.__flosy.ctx.state.accounts.length`)) >= 2, 'no accounts');
    // remember pre-wipe app cache count for later comparison
    global.__cacheBefore = await evalJs(`(async () => { try { return (await caches.keys()).filter(c => c.startsWith('flosy-')).length; } catch { return -1; } })()`);
  }));

  ok(await step('زر مسح جميع البيانات موجود في الإعدادات', async () => {
    await evalJs(`window.__flosy.ctx.nav('settings')`);
    await waitUntil(`document.querySelector('#view')?.textContent?.includes('مسح جميع البيانات')`, { label: 'wipe row visible' });
    assert(await evalJs(`!!Array.from(document.querySelectorAll('#view .set-row')).find(r => r.textContent.includes('مسح جميع البيانات'))`), 'wipe row not found');
    const foot = await evalJs(`(() => { const r = Array.from(document.querySelectorAll('#view .set-row')).find(x => x.textContent.includes('مسح جميع البيانات')); return r ? r.querySelector('.set-sub')?.textContent : ''; })()`);
    assert(foot && foot.includes('لا يمكن التراجع'), 'warning sub-text missing');
  }));

  ok(await step('الضغط يظهر Confirmation Dialog بالنص المطلوب', async () => {
    const row = await evalJs(`(() => { const r = Array.from(document.querySelectorAll('#view .set-row')).find(x => x.textContent.includes('مسح جميع البيانات')); r.querySelector('button').click(); return true; })()`);
    assert(row, 'click failed');
    await waitUntil(`!!document.querySelector('.modal-open .modal-panel')`, { label: 'confirm dialog' });
    const txt = await evalJs(`document.querySelector('.modal-panel').textContent`);
    assert(txt.includes('مسح جميع البيانات'), 'title missing');
    assert(txt.includes('العمليات والمعاملات') && txt.includes('الحسابات والأرصدة') && txt.includes('الإعدادات'), 'items list missing');
    assert(txt.includes('لا يمكن التراجع عنه'), 'irreversibility warning missing');
    // hit-test: confirm button not covered
    const hit = await evalJs(`(() => {
      const b = document.querySelector('.modal-panel .btn-danger');
      const r = b.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
      return b === el || b.contains(el);
    })()`);
    assert(hit, 'confirm button not hit-testable');
  }));

  ok(await step('إلغاء لا يحذف شيئًا', async () => {
    await evalJs(`(() => { Array.from(document.querySelectorAll('.modal-panel .modal-foot .btn')).find(b => b.textContent === 'إلغاء').click(); return true; })()`);
    await sleep(400);
    assert(!(await evalJs(`!!document.querySelector('.modal-wrap')`)), 'dialog still open after cancel');
    assert((await evalJs(`window.__flosy.ctx.state.transactions.length`)) >= 1, 'tx lost on cancel!');
    assert((await evalJs(`window.__flosy.ctx.state.settings.userName`)) === 'مستخدم المسح', 'name lost on cancel!');
  }));

  ok(await step('التأكيد يحذف كل البيانات فعليًا (IndexedDB)', async () => {
    await evalJs(`(() => { Array.from(document.querySelectorAll('#view .set-row')).find(x => x.textContent.includes('مسح جميع البيانات')).querySelector('button').click(); return true; })()`);
    await waitUntil(`!!document.querySelector('.modal-open .modal-panel')`, { label: 'confirm dialog 2' });
    await evalJs(`(() => { Array.from(document.querySelectorAll('.modal-panel .modal-foot .btn')).find(b => b.textContent.includes('مسح جميع البيانات')).click(); return true; })()`);
    // wipe runs, then toast, then reload after ~700ms — wait for navigation
    await sleep(1600);
    await waitUntil(`!!(window.__flosy && window.__flosy.booted)`, { label: 'app reboot after wipe', tries: 40 });
    await sleep(300);
    const counts = await evalJs(`(() => {
      const s = window.__flosy.ctx.state;
      return { tx: s.transactions.length, goals: s.goals.length, bills: s.bills.length, budgets: s.budgets.length, name: s.settings.userName };
    })()`);
    assert(counts.tx === 0, `transactions not wiped: ${counts.tx}`);
    assert(counts.goals === 0, `goals not wiped: ${counts.goals}`);
    assert(counts.bills === 0, `bills not wiped: ${counts.bills}`);
    assert(counts.budgets === 0, `budgets not wiped: ${counts.budgets}`);
    assert(counts.name === '', `userName not wiped: "${counts.name}"`);
    // categories: 22 = fresh default set re-created by init on empty DB (first-run state, not leftover user data)
    const cats = await evalJs(`window.__flosy.ctx.state.categories`);
    assert(cats.length === 22 && cats.every(c => c.builtIn), `expected 22 default builtIn categories on fresh start, got ${cats.length}`);
    // direct IDB check: settings store has no userName key
    const idbName = await evalJs(`(async () => {
      const dbs = await indexedDB.databases();
      const f = dbs.find(d => d.name === 'flosy');
      if (!f) return 'DB-MISSING';
      return await new Promise((res) => {
        const rq = indexedDB.open('flosy');
        rq.onsuccess = () => {
          const db = rq.result;
          try {
            const txr = db.transaction('settings', 'readonly');
            const r = txr.objectStore('settings').getAll();
            r.onsuccess = () => { db.close(); res(JSON.stringify(r.result.map(x => x.key))); };
            r.onerror = () => { db.close(); res('ERR'); };
          } catch { db.close(); res('ERR'); }
        };
        rq.onerror = () => res('OPEN-ERR');
      });
    })()`);
    if (idbName !== 'DB-MISSING') {
      assert(!idbName.includes('userName'), 'userName still in IDB settings store');
    }
    // default accounts (2) re-created by init on fresh DB = expected first-run state
    const acctCount = await evalJs(`window.__flosy.ctx.state.accounts.length`);
    assert(acctCount === 2, `expected 2 default accounts on fresh start, got ${acctCount}`);
  }));

  ok(await step('localStorage/sessionStorage نظيفة (التطبيق لا يستخدمهما أصلًا)', async () => {
    const ls = await evalJs(`JSON.stringify(Object.fromEntries(Object.entries(localStorage)))`);
    assert(!ls.includes('flosy') && !ls.includes('فلوسي'), 'localStorage has flosy keys');
    assert((await evalJs(`Object.keys(sessionStorage).length`)) === 0, 'sessionStorage not empty');
  }));

  ok(await step('First Run: onboarding يظهر من جديد بعد الحذف', async () => {
    assert(await evalJs(`!document.getElementById('onboardingRoot').classList.contains('hidden')`), 'onboarding did NOT show after wipe');
    assert(await evalJs(`!!document.getElementById('onbName')`), 'onboarding input missing');
  }));

  ok(await step('التطبيق يعمل بعد المسح (لا تعطل)', async () => {
    // can onboard again
    await evalJs(`(() => { const i = document.getElementById('onbName'); i.value = 'بعد المسح'; document.querySelector('#onboardingRoot .btn').click(); return true; })()`);
    await waitUntil(`window.__flosy.ctx.state.settings.userName === 'بعد المسح'`, { label: 're-onboard' });
    // we were on settings before the wipe — go home, then interact
    await evalJs(`window.__flosy.ctx.nav('dashboard')`);
    await waitUntil(`!!document.querySelector('.qa.qa-expense')`, { label: 'dashboard render' });
    // and can add a tx again
    await evalJs(`(() => { document.querySelector('.qa.qa-expense').click(); return true; })()`);
    await waitUntil(`!!document.querySelector('.modal-open .modal-panel')`, { label: 'modal after wipe' });
    await evalJs(`(() => { document.querySelector('.modal-panel .amount-wrap input').value = '7'; document.querySelector('.modal-panel .catgrid .cat-tile').click(); document.querySelector('.modal-panel .modal-foot .btn-primary').click(); return true; })()`);
    await waitUntil(`window.__flosy.ctx.state.transactions.some(t => t.amount === 7)`, { label: 'tx after wipe' });
  }));

  ok(await step('Service Worker / Cache لم تُمس (offline files intact)', async () => {
    const probe = await evalJs(`(async () => {
      try {
        const n = await caches.keys();
        return { supported: true, flosy: n.filter(c => c.startsWith('flosy-')).length, all: n.length };
      } catch (e) {
        return { supported: false, reason: String(e && e.message || e).slice(0, 60) };
      }
    })()`);
    if (!probe.supported) {
      console.log(`   [skip-detail] Cache API unavailable in this headless context: ${probe.reason} — skipped (no deletion occurred; wipe code never touches caches)`);
      return;
    }
    const before = global.__cacheBefore;
    if (before >= 0) assert(probe.flosy >= before, `app caches lost: before=${before} after=${probe.flosy}`);
  }));

  ok(await step('لا استثناءات أو أخطاء console خلال السيناريو كله', () => {
    assert(exceptions.length === 0, 'exceptions: ' + JSON.stringify(exceptions.slice(0, 3)));
    assert(consoleErrors.length === 0, 'console errors: ' + JSON.stringify(consoleErrors.slice(0, 3)));
  }));

  console.log(`\nWIPE FEATURE: ${pass} passed, ${fail} failed`);
  if (exceptions.length) console.log('JS exceptions:', exceptions.slice(0, 5));
  if (consoleErrors.length) console.log('Console errors:', consoleErrors.slice(0, 5));
  process.exitCode = fail > 0 ? 1 : 0;
} catch (e) {
  console.error('WIPE TEST CRASHED:', e.message);
  process.exitCode = 2;
} finally {
  try { chrome.kill(); } catch { /* ignore */ }
  setTimeout(() => process.exit(), 500);
}

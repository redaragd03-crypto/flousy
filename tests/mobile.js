/* tests/mobile.js — mobile-user-scenario test (headless Chrome + CDP, mobile viewport + touch)
   Simulates the real user flow on a phone-sized screen:
   1) first run → onboarding asks for name → type name → دخول → dashboard
   2) reload → name persists, no onboarding again
   3) FAB → sheet → إضافة مصروف → modal opens → NO backdrop over panel (elementFromPoint)
   4) type amount, pick category, save → tx appears, no leftover overlay
   5) month prev/next buttons work (setMonth fix)
   6) إضافة دخل with yesterday's date → tx saved with correct date
   7) reopen app → name + data persist
   Usage: node tests/mobile.js [url]
*/
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { existsSync } from 'node:fs';

const URL_TO_LOAD = process.argv[2] || 'http://127.0.0.1:8123';
const DEBUG_PORT = 9334;
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
  '--user-data-dir', `${process.env.TEMP || 'C:/Users/A&M/AppData/Local/Temp'}/flosy-mobile-profile-${Date.now()}-${process.pid}`
], { stdio: ['ignore', 'pipe', 'pipe'] });

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      let res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
      let page = (await res.json()).find((t) => t.type === 'page');
      if (!page) {
        res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' }).catch(() =>
          fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent('about:blank')}`));
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
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    return true;
  } catch (e) {
    console.log(`  FAIL  ${name}: ${e.message}`);
    return false;
  }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const waitUntil = async (expr, { tries = 20, ms = 250, label = '' } = {}) => {
  for (let i = 0; i < tries; i++) {
    if (await evalJs(expr)) return;
    await sleep(ms);
  }
  throw new Error(`waitUntil timeout: ${label || expr}`);
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
    if (msg.method === 'Runtime.exceptionThrown') {
      exceptions.push(msg.params.exceptionDetails?.exception?.description || 'exception');
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      consoleErrors.push(msg.params.args.map((a) => a.value || a.description || '').join(' '));
    }
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');

  /* emulate a phone: 390x844, DPR 3, touch */
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });

  await send('Page.navigate', { url: URL_TO_LOAD }, 30000);
  await waitUntil(`!!(window.__flosy && window.__flosy.booted)`, { label: 'boot', tries: 40 });
  await sleep(400);

  console.log('--- mobile user scenario ---');

  ok(await step('onboarding shown on first run (no hardcoded name)', async () => {
    assert(await evalJs(`!document.getElementById('onboardingRoot').classList.contains('hidden')`), 'onboarding not visible');
    assert(await evalJs(`document.getElementById('onbName') instanceof HTMLInputElement`), 'name input missing');
  }));

  ok(await step('name input is focusable and typable', async () => {
    const focusable = await evalJs(`(document.getElementById('onbName').focus(), document.activeElement === document.getElementById('onbName'))`);
    assert(focusable, 'name input not focusable');
    await evalJs(`(document.getElementById('onbName').value = 'أحمد', document.getElementById('onbName').dispatchEvent(new Event('input', {bubbles:true})), true)`);
    assert((await evalJs(`document.getElementById('onbName').value`)) === 'أحمد', 'typing did not register');
  }));

  ok(await step('زر دخول → dashboard، الاسم محفوظ', async () => {
    await evalJs(`document.querySelector('#onboardingRoot .btn').click()`);
    await waitUntil(`document.getElementById('onboardingRoot').classList.contains('hidden')`, { label: 'onboarding closes' });
    assert((await evalJs(`window.__flosy.ctx.state.settings.userName`)) === 'أحمد', 'name not saved to settings');
  }));

  ok(await step('greeting uses the entered name', async () => {
    await waitUntil(`document.querySelector('#view .page-head h2') && document.querySelector('#view .page-head h2').textContent.includes('أحمد')`, { label: 'greeting' });
  }));

  ok(await step('reload → لا تظهر شاشة الاسم مرة أخرى (محمفوظة)', async () => {
    await send('Page.navigate', { url: URL_TO_LOAD }, 30000);
    await waitUntil(`!!(window.__flosy && window.__flosy.booted)`, { label: 'boot2', tries: 40 });
    await sleep(400);
    assert(await evalJs(`document.getElementById('onboardingRoot').classList.contains('hidden')`), 'onboarding showed again after save!');
    assert((await evalJs(`window.__flosy.ctx.state.settings.userName`)) === 'أحمد', 'name lost after reload');
  }));

  ok(await step('FAB → sheet قائمة الإضافة تفتح', async () => {
    await evalJs(`document.getElementById('fab').click()`);
    await waitUntil(`!!document.querySelector('.sheet-menu.open')`, { label: 'sheet opens' });
  }));

  ok(await step('sheet item: إضافة مصروف → modal يفتح', async () => {
    const items = await evalJs(`Array.from(document.querySelectorAll('.sheet-menu .sheet-item')).map(b => b.textContent)`);
    const btnIdx = await evalJs(`Array.from(document.querySelectorAll('.sheet-menu .sheet-item')).findIndex(b => b.textContent.includes('مصروف'))`);
    assert(btnIdx >= 0, 'add-expense item not found in: ' + JSON.stringify(items));
    await evalJs(`document.querySelectorAll('.sheet-menu .sheet-item')[${btnIdx}].click()`);
    await waitUntil(`!!document.querySelector('.modal-open .modal-panel')`, { label: 'modal opens' });
  }));

  ok(await step('MODAL LAYERING: amount input hit-testable (backdrop خلفه)', async () => {
    await sleep(600); // slide-up animation (0.32s) must finish before hit-testing
    // elementFromPoint at the amount input center must be the input (or inside it), NOT the backdrop
    const hit = await evalJs(`(() => {
      const inp = document.querySelector('.modal-panel .amount-wrap input');
      if (!inp) return { fail: 'no input' };
      const r = inp.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const el = document.elementFromPoint(cx, cy);
      return {
        ok: el === inp || inp.contains(el),
        rect: { top: Math.round(r.top), h: Math.round(r.height) },
        vh: innerHeight, vw: innerWidth,
        hit: el ? (el.tagName + '.' + String(el.className).slice(0, 30)) : 'null',
        panelTf: getComputedStyle(document.querySelector('.modal-panel')).transform.slice(0, 40),
        modals: document.querySelectorAll('.modal-wrap').length,
        inputs: document.querySelectorAll('.modal-panel .amount-wrap input').length,
        panels: document.querySelectorAll('.modal-panel').length,
        firstInputParentHtml: (inp.closest('.field')?.parentElement === inp.closest('.modal-body')?.firstElementChild)
      };
    })()`);
    if (typeof hit === 'object') assert(hit.ok, `input covered/hidden: ${JSON.stringify(hit)}`);
    else assert(hit, 'amount input is covered by another layer (backdrop over panel!)');
  }));

  ok(await step('MODAL LAYERING: save button hit-testable', async () => {
    const hit = await evalJs(`(() => {
      const btn = document.querySelector('.modal-panel .modal-foot .btn-primary');
      const r = btn.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return btn === el || btn.contains(el);
    })()`);
    assert(hit, 'save button covered by backdrop');
    // simulate a real user tap on the amount input (touch → click) and confirm focus
    const focused = await evalJs(`(() => {
      const inp = document.querySelector('.modal-panel .amount-wrap input');
      inp.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      inp.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      inp.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      inp.focus();
      return document.activeElement === inp;
    })()`);
    assert(focused, 'amount input cannot receive focus after tap');
  }));

  ok(await step('كتابة المبلغ + اختيار فئة + حفظ → العملية تظهر فورًا', async () => {
    await evalJs(`(document.querySelector('.modal-panel .amount-wrap input').value = '250', true)`);
    await evalJs(`document.querySelector('.modal-panel .catgrid .cat-tile').click()`);
    await evalJs(`document.querySelector('.modal-panel .modal-foot .btn-primary').click()`);
    await waitUntil(`window.__flosy.ctx.state.transactions.some(t => t.amount === 250 && t.type === 'expense')`, { label: 'tx in state' });
    // modal closed + no invisible overlay left on the page
    assert(!(await evalJs(`!!document.querySelector('.modal-wrap')`)), 'modal still in DOM after save');
    const hit = await evalJs(`(() => {
      const el = document.elementFromPoint(195, 400);
      return el && !el.closest('.modal-backdrop') && !el.closest('.modal-wrap');
    })()`);
    assert(hit, 'invisible overlay still covering the page after closing modal');
  }));

  ok(await step('dashboard balance reflects the expense (حسابات صحيحة)', async () => {
    await sleep(600); // animNumber
    const bal = await evalJs(`window.__flosy.ctx.totalBalance()`);
    assert(bal === -250, 'balance should be -250, got ' + bal);
  }));

  ok(await step('الشهر السابق / التالي (setMonth) يعملان', async () => {
    const label0 = await evalJs(`document.querySelector('.mp-label').textContent`);
    await evalJs(`document.querySelector('.month-pick button[aria-label="الشهر السابق"]').click()`);
    await waitUntil(`document.querySelector('.mp-label').textContent !== ${JSON.stringify(label0)}`, { label: 'label changes', tries: 12 });
    const label1 = await evalJs(`document.querySelector('.mp-label').textContent`);
    await evalJs(`document.querySelector('.month-pick button[aria-label="الشهر التالي"]').click()`);
    await waitUntil(`document.querySelector('.mp-label').textContent === ${JSON.stringify(label0)}`, { label: 'label returns', tries: 12 });
  }));

  ok(await step('إضافة دخل بتاريخ أمس (date prev works + correct date saved)', async () => {
    await evalJs(`document.getElementById('fab').click()`);
    await waitUntil(`!!document.querySelector('.sheet-menu.open')`, { label: 'sheet' });
    await evalJs(`(() => { const items = Array.from(document.querySelectorAll('.sheet-menu .sheet-item')); items.find(b => b.textContent.includes('دخل')).click(); return true; })()`);
    await waitUntil(`!!document.querySelector('.modal-open .modal-panel')`, { label: 'income modal' });
    await evalJs(`(document.querySelector('.modal-panel .amount-wrap input').value = '1000', true)`);
    await evalJs(`(() => { const d = document.querySelector('.modal-panel input[type=date]'); const t = new Date(); t.setDate(t.getDate() - 1); const p = n => (n<10?'0':'')+n; d.value = t.getFullYear()+'-'+p(t.getMonth()+1)+'-'+p(t.getDate()); return d.value; })()`);
    const dateVal = await evalJs(`document.querySelector('.modal-panel input[type=date]').value`);
    await evalJs(`document.querySelector('.modal-panel .catgrid .cat-tile').click()`);
    await evalJs(`document.querySelector('.modal-panel .modal-foot .btn-primary').click()`);
    await waitUntil(`window.__flosy.ctx.state.transactions.some(t => t.amount === 1000 && t.type === 'income')`, { label: 'income in state' });
    const savedDate = await evalJs(`window.__flosy.ctx.state.transactions.find(t => t.amount === 1000).date`);
    assert(savedDate === dateVal, `date saved as ${savedDate}, expected ${dateVal}`);
    const bal = await evalJs(`window.__flosy.ctx.totalBalance()`);
    assert(bal === 750, 'balance should be 750 after income, got ' + bal);
  }));

  ok(await step('إعادة تحميل → الاسم والبيانات تبقى (IndexedDB)', async () => {
    await send('Page.navigate', { url: URL_TO_LOAD }, 30000);
    await waitUntil(`!!(window.__flosy && window.__flosy.booted)`, { label: 'boot3', tries: 40 });
    assert((await evalJs(`window.__flosy.ctx.state.settings.userName`)) === 'أحمد', 'name lost');
    assert(await evalJs(`window.__flosy.ctx.state.transactions.some(t => t.amount === 250) && window.__flosy.ctx.state.transactions.some(t => t.amount === 1000)`), 'transactions lost after restart');
    assert(await evalJs(`document.getElementById('onboardingRoot').classList.contains('hidden')`), 'onboarding again?!');
  }));

  ok(await step('no JS exceptions / console errors during the whole scenario', () => {
    assert(exceptions.length === 0, 'exceptions: ' + JSON.stringify(exceptions.slice(0, 3)));
    assert(consoleErrors.length === 0, 'console errors: ' + JSON.stringify(consoleErrors.slice(0, 3)));
  }));

  console.log(`\nMOBILE SCENARIO: ${pass} passed, ${fail} failed`);
  if (exceptions.length) console.log('JS exceptions:', exceptions.slice(0, 5));
  if (consoleErrors.length) console.log('Console errors:', consoleErrors.slice(0, 5));
  process.exitCode = fail > 0 ? 1 : 0;
} catch (e) {
  console.error('MOBILE TEST CRASHED:', e.message);
  process.exitCode = 2;
} finally {
  try { chrome.kill(); } catch { /* ignore */ }
  setTimeout(() => process.exit(), 500);
}

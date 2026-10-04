/* main.js — bootstrap, routing, shell, notifications panel, PIN lock */

import { $, $$, h, clear, paintIcons, setDocTheme } from './utils/dom.js';
import { App } from './app.js';
import { initIcons } from './components/icons.js';
import { openSheet, toast, confirmDialog } from './components/ui.js';
import { showOnboarding } from './components/onboarding.js';
import { monthKeyOf, todayISO, relDayLabel, dayLabel } from './utils/dates.js';

initIcons();

const ctx = new App();
const view = $('#view');

const PAGES = {
  dashboard: () => import('./pages/dashboard.js'),
  operations: () => import('./pages/operations.js'),
  accounts: () => import('./pages/accounts.js'),
  budgets: () => import('./pages/budgets.js'),
  goals: () => import('./pages/goals.js'),
  bills: () => import('./pages/bills.js'),
  stats: () => import('./pages/stats.js'),
  reports: () => import('./pages/reports.js'),
  settings: () => import('./pages/settings.js')
};
const pageCache = {};

const TITLES = {
  dashboard: 'الرئيسية',
  operations: 'العمليات',
  accounts: 'الحسابات',
  budgets: 'الميزانيات',
  goals: 'أهدافي',
  bills: 'الالتزامات',
  stats: 'الإحصائيات',
  reports: 'التقارير',
  settings: 'الإعدادات'
};

const NAV = [
  { id: 'dashboard', label: 'الرئيسية', icon: 'home' },
  { id: 'operations', label: 'العمليات', icon: 'list' },
  { id: 'accounts', label: 'الحسابات', icon: 'wallet' },
  { id: 'budgets', label: 'الميزانيات', icon: 'filter' },
  { id: 'goals', label: 'الأهداف', icon: 'target' },
  { id: 'bills', label: 'الفواتير', icon: 'receipt' },
  { id: 'stats', label: 'الإحصائيات', icon: 'chart' },
  { id: 'reports', label: 'التقارير', icon: 'printer' },
  { id: 'settings', label: 'الإعدادات', icon: 'gear' }
];

/* ---------------- routing ---------------- */

function currentRoute() {
  const m = location.hash.match(/^#\/?([a-z]+)?/);
  const r = m && m[1];
  return PAGES[r] ? r : 'dashboard';
}

let routeToken = 0;
async function route() {
  const name = currentRoute();
  const token = ++routeToken;
  ctx.currentRoute = name;
  $('#pageTitle').textContent = TITLES[name] || 'فلوسي';
  updateNavActive(name);

  let mod = pageCache[name];
  if (!mod) {
    try { mod = await PAGES[name](); pageCache[name] = mod; }
    catch (err) {
      console.error('[flosy] page failed', err);
      clear(view);
      view.appendChild(h('div', { class: 'card' }, [
        h('h3', {}, 'حصل خطأ في تحميل الصفحة'),
        h('p', { style: 'color:var(--text-3);font-weight:600;font-size:13.5px;margin-top:6px' }, String(err && err.message || err)),
        h('button', { class: 'btn btn-primary', onclick: () => location.reload() }, 'إعادة تحميل')
      ]));
      return;
    }
  }
  if (token !== routeToken) return; // stale
  clear(view);
  try {
    mod.render(ctx, view);
  } catch (err) {
    console.error('[flosy] render failed', err);
    view.innerHTML = '<div class="card"><h3>خطأ في العرض</h3><p style="color:var(--text-3);font-size:13.5px;margin-top:6px">راجع سجل المتصفح (Console) للتفاصيل.</p></div>';
  }
  window.scrollTo({ top: 0 });
}

ctx.nav = (name) => { location.hash = `#/${name}`; };

ctx.setMonth = (key) => {
  ctx.uiMonth = key;
  route();
};

ctx.showOnboarding = () => showOnboarding(ctx);

ctx.refresh = function () {
  refreshShell();
  route();
  if (!ctx.state.settings.userName) showOnboarding(ctx);
};

window.addEventListener('hashchange', route);

/* ---------------- shell ---------------- */

function buildShell() {
  // desktop sidebar nav
  const sideNav = $('#sideNav');
  for (const item of NAV) {
    sideNav.appendChild(h('a', {
      class: 'side-link', href: `#/${item.id}`, 'data-route': item.id,
      'aria-label': item.label
    }, [
      h('span', { 'data-ic': item.icon, 'aria-hidden': 'true' }),
      h('span', {}, item.label),
      item.id === 'bills' ? h('span', { class: 'badge-count hidden', 'data-badge': 'bills' }, '0') : null
    ]));
  }

  // mobile bottom nav
  const bn = $('#bottomNav');
  const items = [
    { id: 'dashboard', label: 'الرئيسية', icon: 'home' },
    { id: 'operations', label: 'العمليات', icon: 'list' },
    { fab: true },
    { id: 'stats', label: 'الإحصائيات', icon: 'chart' },
    { id: 'more', label: 'المزيد', icon: 'dotsH' }
  ];
  for (const it of items) {
    if (it.fab) continue;
    const btn = h('button', { class: 'bn-item', 'data-bn': it.id, 'aria-label': it.label }, [
      h('span', { 'data-ic': it.icon, 'aria-hidden': 'true' }),
      h('span', {}, it.label),
      it.id === 'more' ? h('span', { class: 'bn-badge hidden', 'data-bn-badge': 'more' }, '0') : null
    ]);
    if (it.id === 'more') {
      btn.addEventListener('click', () => {
        openSheet([
          { emoji: '🏦', label: 'الحسابات', onClick: () => ctx.nav('accounts') },
          { emoji: '🧮', label: 'الميزانيات', onClick: () => ctx.nav('budgets') },
          { emoji: '🎯', label: 'الأهداف', onClick: () => ctx.nav('goals') },
          { emoji: '🧾', label: 'الفواتير والالتزامات', onClick: () => ctx.nav('bills') },
          { emoji: '📊', label: 'التقارير', onClick: () => ctx.nav('reports') },
          { emoji: '🔐', label: 'قفل التطبيق', onClick: () => ctx.lockApp() },
          { emoji: '⚙️', label: 'الإعدادات', onClick: () => ctx.nav('settings') }
        ]);
      });
    } else {
      btn.addEventListener('click', () => ctx.nav(it.id));
    }
    bn.appendChild(btn);
  }

  // sidebar profile → open settings (profile section)
  $('#sideProfile').addEventListener('click', () => ctx.nav('settings'));

  // FAB
  const fab = $('#fab');
  fab.addEventListener('click', (e) => {
    e.stopPropagation();
    openAddSheet();
  });
  $('#desktopAdd').addEventListener('click', () => openAddSheet());
}

function openAddSheet() {
  openSheet([
    { emoji: '💸', label: 'إضافة مصروف', sub: 'سجل مصروف جديد في 5 ثواني', onClick: () => addExpense() },
    { emoji: '💰', label: 'إضافة دخل', sub: 'راتب، عمل حر، أو أي دخل', onClick: () => addIncome() },
    { emoji: '🔄', label: 'تحويل بين الحسابات', sub: 'من حساب لآخر بدون ما يحسب مصروف', onClick: () => transfer() },
    { emoji: '🎯', label: 'هدف ادخار جديد', sub: 'حوط فلوس لحاجة معينة', onClick: () => goal() }
  ]);
}

let lazyModals = null;
function ensureModals() {
  if (!lazyModals) lazyModals = import('./components/modals.js');
  return lazyModals;
}
function addExpense() { ensureModals().then((m) => m.addTxModal(ctx, { type: 'expense' })); }
function addIncome() { ensureModals().then((m) => m.addTxModal(ctx, { type: 'income' })); }
function transfer() { ensureModals().then((m) => m.transferModal(ctx)); }
function goal() { ensureModals().then((m) => m.goalModal(ctx)); }

function updateNavActive(name) {
  $$('.side-link').forEach((a) => a.classList.toggle('active', a.dataset.route === name));
  $$('.bn-item').forEach((b) => {
    const id = b.dataset.bn;
    const active = id === name || (id === 'more' && ['accounts', 'budgets', 'goals', 'bills', 'reports'].includes(name));
    b.classList.toggle('active', active);
  });
}

function refreshShell() {
  // profile
  const st = ctx.state.settings;
  $('#sideName').textContent = st.userName || 'فلوسي';
  $('#sideAvatar').textContent = st.userEmoji || '🧑';
  // theme icon
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  $('#themeBtn').setAttribute('data-ic', dark ? 'sun' : 'moon');
  $('#themeBtn').dataset.painted = '';
  paintIcons($('#themeBtn'));
  // notification badges
  const unseen = ctx.unseenNotifs().length;
  const bellBadge = $('#bellBadge');
  if (unseen > 0 && st.notifications !== false) {
    bellBadge.classList.remove('hidden');
    bellBadge.textContent = String(unseen > 99 ? '99+' : unseen);
  } else bellBadge.classList.add('hidden');
  const dueBills = ctx.state.bills.filter((b) => !b.paid).length;
  const billsBadge = $('[data-badge="bills"]');
  if (billsBadge) {
    billsBadge.classList.toggle('hidden', dueBills === 0);
    billsBadge.textContent = String(dueBills);
  }
  const moreBadge = $('[data-bn-badge="more"]');
  if (moreBadge) {
    moreBadge.classList.toggle('hidden', dueBills === 0 && unseen === 0);
    moreBadge.textContent = String(Math.min(99, dueBills + unseen));
  }
}

/* ---------------- topbar actions ---------------- */

$('#themeBtn').addEventListener('click', async () => {
  const cur = document.documentElement.getAttribute('data-theme');
  await ctx.setSettings({ theme: cur === 'dark' ? 'light' : 'dark' });
  ctx.applyTheme();
  refreshShell();
});

let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvt = e;
  toast(' تقدر تثبت فلوسي كتطبيق على موبايلك من قائمة المتصفح 📲', { emoji: '📲', type: 'info', ms: 6000 });
});
window.addEventListener('appinstalled', () => {
  installEvt = null;
  toast('تم تثبيت فلوسي 🎉', { emoji: '🎉' });
});

/* global search */
$('#globalSearch').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const q = e.target.value.trim();
    ctx.opsFilter.q = q;
    ctx.nav('operations');
    e.target.value = '';
  }
});

/* ---------------- notifications panel ---------------- */

let panelOpen = false;
$('#bellBtn').addEventListener('click', () => {
  panelOpen = !panelOpen;
  const panel = $('#notifPanel');
  if (panelOpen) {
    renderNotifPanel();
    panel.classList.remove('hidden');
    requestAnimationFrame(() => panel.classList.add('open'));
  } else {
    panel.classList.remove('open');
    setTimeout(() => panel.classList.add('hidden'), 280);
    ctx.markAllSeen().then(refreshShell);
  }
});

document.addEventListener('click', (e) => {
  if (!panelOpen) return;
  const panel = $('#notifPanel');
  if (panel.contains(e.target) || e.target.closest('#bellBtn')) return;
  panelOpen = false;
  panel.classList.remove('open');
  setTimeout(() => panel.classList.add('hidden'), 280);
  ctx.markAllSeen().then(refreshShell);
});

function renderNotifPanel() {
  const panel = $('#notifPanel');
  clear(panel);
  const list = ctx.buildNotifs();
  const seen = new Set(ctx.state.settings.notifsSeen || []);
  panel.appendChild(h('div', { class: 'notif-head' }, [
    h('span', { style: 'font-size:20px' }, '🔔'),
    h('h3', {}, 'الإشعارات'),
    h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { await ctx.markAllSeen(); renderNotifPanel(); refreshShell(); } }, 'مسح الكل')
  ]));
  const box = h('div', { class: 'notif-list' });
  if (!list.length) {
    box.appendChild(h('div', { style: 'text-align:center;color:var(--text-3);font-weight:700;font-size:13.5px;padding:30px 0;line-height:2' }, [
      'مفيش إشعارات دلوقتي 🎉', h('br'), 'متابعين الميزانيات والفواتير والأهداف.'
    ]));
  } else {
    for (const n of list) {
      box.appendChild(h('div', { class: `notif-item ${n.level}${seen.has(n.id) ? ' seen' : ''}` }, [
        h('div', { class: 'em', 'aria-hidden': 'true' }, n.icon),
        h('div', {}, [h('h4', {}, n.title), h('p', {}, n.detail)])
      ]));
    }
  }
  panel.appendChild(box);
  paintIcons(panel);
}

/* ---------------- PIN lock screen ---------------- */

let pinBuf = '';
let pinLen = 4;

function lockApp() {
  ctx.unlocked = false;
  pinBuf = '';
  pinLen = Number(ctx.state.settings.pinLength) || 4;
  const screen = $('#pinScreen');
  paintDots();
  $('#pinErr').classList.add('hidden');
  screen.classList.remove('hidden');
  // block background scroll
  document.body.style.overflow = 'hidden';
}

function unlock() {
  ctx.unlocked = true;
  $('#pinScreen').classList.add('hidden');
  document.body.style.overflow = '';
  refreshShell();
  route();
}

function paintDots() {
  const dots = $('#pinDots');
  clear(dots);
  for (let i = 0; i < pinLen; i++) {
    dots.appendChild(h('span', { class: `pin-dot${i < pinBuf.length ? ' on' : ''}` }));
  }
}

function buildPad() {
  const pad = $('#pinPad');
  clear(pad);
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];
  for (const k of keys) {
    if (!k) { pad.appendChild(h('span')); continue; }
    const btn = h('button', { class: 'pin-key', 'aria-label': k === '⌫' ? 'مسح' : k }, k);
    btn.addEventListener('click', () => pinKey(k));
    pad.appendChild(btn);
  }
}

function pinKey(k) {
  if (k === '⌫') { pinBuf = pinBuf.slice(0, -1); paintDots(); return; }
  if (pinBuf.length >= pinLen) return;
  pinBuf += k;
  paintDots();
  if (pinBuf.length === pinLen) {
    setTimeout(checkPin, 180);
  }
}

async function checkPin() {
  const hash = await hashPin(pinBuf, ctx.state.settings.pinSalt || '');
  if (hash === ctx.state.settings.pinHash) {
    unlock();
  } else {
    pinBuf = '';
    paintDots();
    const err = $('#pinErr');
    err.classList.remove('hidden');
    err.style.animation = 'none';
    void err.offsetWidth;
    err.style.animation = '';
    setTimeout(() => err.classList.add('hidden'), 2200);
  }
}

document.addEventListener('keydown', (e) => {
  if ($('#pinScreen').classList.contains('hidden')) return;
  if (/^[0-9]$/.test(e.key)) pinKey(e.key);
  else if (e.key === 'Backspace') pinKey('⌫');
});

$('#pinForget').addEventListener('click', async () => {
  const ok = await confirmDialog({
    title: 'نسيت رمز PIN',
    message: 'لما تنسى الرمز، الطريقة الوحيدة هي إعادة ضبط القفل (هيتعطل PIN). البيانات مش هتتأثر. متابعة؟',
    confirmLabel: 'إعادة ضبط القفل', danger: true, emoji: '🔓'
  });
  if (ok) {
    await ctx.setSettings({ pinEnabled: false, pinHash: null, pinSalt: null });
    unlock();
    toast('اتعطى القفل — حط PIN جديد من الإعدادات', { emoji: '🔓', ms: 5000 });
  }
});

async function hashPin(pin, salt) {
  const text = `${salt}:${pin}`;
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch { /* fallback */ }
  const fnv = (str, seed) => {
    let x = seed >>> 0;
    for (let i = 0; i < str.length; i++) {
      x ^= str.charCodeAt(i);
      x = Math.imul(x, 0x01000193) >>> 0;
    }
    return x.toString(16).padStart(8, '0');
  };
  return fnv(text, 0x811c9dc5) + fnv(text.split('').reverse().join(''), 0x1000193);
}

ctx.lockApp = lockApp;

/* ---------------- boot ---------------- */

window.__flosy = { ctx };

(async function boot() {
  buildShell();
  buildPad();
  paintIcons(document);
  try {
    await ctx.init();
  } catch (err) {
    console.error('[flosy] init failed', err);
    window.__flosy.initError = String((err && err.message) || err);
    view.innerHTML = '<div class="card"><h3>تعذر فتح قاعدة البيانات</h3><p style="color:var(--text-3);font-size:13.5px">تأكد إن المتصفح شغال في وضع آمن (https أو localhost) وأن التخزين المحلي مسموح.</p></div>';
    return;
  }
  window.__flosy.booted = true;
  refreshShell();
  route();
  if (!ctx.state.settings.userName) {
    showOnboarding(ctx);
  }
  if (ctx.state.settings.pinEnabled && ctx.state.settings.pinHash) {
    lockApp();
  }

  // service worker
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('[flosy] SW register failed', e));
    });
  }
})();

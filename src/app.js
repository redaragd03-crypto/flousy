/* app.js — App core: state, persistence, theme, recurring, notifications */

import * as db from './database/db.js';
import { DEFAULT_SETTINGS, defaultAccounts, defaultCategories } from './database/defaults.js';
import { buildSeedData } from './services/seed.js';
import { generateDue } from './services/recurring.js';
import { totalBalance, accountBalances, monthTotals, todayExpense, dailyAverage, totals } from './services/finance.js';
import { buildNotifications } from './services/notifications.js';
import { monthKeyOf, todayISO, prevMonthKey, daysElapsedInCycle, cycleDays } from './utils/dates.js';
import { setDocTheme, $ } from './utils/dom.js';

export class App {
  constructor() {
    this.state = {
      transactions: [], accounts: [], categories: [],
      budgets: [], goals: [], bills: [], recurring: [], settings: { ...DEFAULT_SETTINGS }
    };
    this.uiMonth = monthKeyOf(todayISO(), 1);
    this.opsFilter = { q: '', type: 'all', cat: null, acct: null, from: null, to: null, min: null, max: null, sort: 'new' };
    this.statsPeriod = 'm3';
    this.reportPeriod = 'm1';
    this.customRange = null;
    this.unlocked = false;
    this.themeMq = null;
    this.currentRoute = 'dashboard';
  }

  /* ---------- init ---------- */
  async init() {
    await db.openDB();
    const data = await db.loadAll();
    const fresh = data.categories.length === 0;
    if (data.categories.length === 0) data.categories = defaultCategories();
    if (data.accounts.length === 0) data.accounts = defaultAccounts();
    data.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    if (fresh) {
      await db.bulkPut('categories', data.categories);
      await db.bulkPut('accounts', data.accounts);
    }
    this.state = data;
    await this.runRecurring();
    this.uiMonth = monthKeyOf(todayISO(), this.firstDay());
    this.applyTheme();
  }

  async reload() {
    const data = await db.loadAll();
    this.state = { ...this.state, ...data, settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) } };
    this.uiMonth = monthKeyOf(todayISO(), this.firstDay());
    await this.runRecurring();
  }

  /* ---------- accessors ---------- */
  currency() { return this.state.settings.currency || 'EGP'; }
  unit() {
    return { EGP: 'جنيه', USD: '$', EUR: '€', SAR: 'ر.س', AED: 'د.إ', GBP: '£' }[this.currency()] || this.currency();
  }
  firstDay() { return Number(this.state.settings.firstDayOfMonth) === 15 ? 15 : 1; }
  totalBalance() { return totalBalance(this.state.accounts, this.state.transactions); }
  balanceOf(id) {
    const bal = accountBalances(this.state.accounts, this.state.transactions);
    return bal.get(id) || 0;
  }
  /** Most used category of type in last 14 days (for quick access). */
  freqCat(type) {
    const since = new Date(Date.now() - 14 * 864e5);
    const sinceISO = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;
    const counts = new Map();
    for (const t of this.state.transactions) {
      if (t.type === type && t.date >= sinceISO && t.categoryId) {
        counts.set(t.categoryId, (counts.get(t.categoryId) || 0) + 1);
      }
    }
    let best = null;
    for (const [id, n] of counts) if (!best || n > best.n) best = { id, n };
    return best ? best.id : null;
  }

  /* ---------- mutations ---------- */
  async putTx(tx) { await db.put('transactions', tx); this.state.transactions = this.state.transactions.filter((t) => t.id !== tx.id); this.state.transactions.push(tx); }
  async delTx(id) { await db.del('transactions', id); this.state.transactions = this.state.transactions.filter((t) => t.id !== id); }

  async putAccount(a) { await db.put('accounts', a); const i = this.state.accounts.findIndex((x) => x.id === a.id); if (i > -1) this.state.accounts[i] = a; else this.state.accounts.push(a); }
  async delAccount(id) {
    await db.del('accounts', id);
    this.state.accounts = this.state.accounts.filter((x) => x.id !== id);
    if (this.state.settings.lastAccount === id) await this.setSettings({ lastAccount: null });
  }

  async putCategory(c) { await db.put('categories', c); const i = this.state.categories.findIndex((x) => x.id === c.id); if (i > -1) this.state.categories[i] = c; else this.state.categories.push(c); }
  async delCategory(id) { await db.del('categories', id); this.state.categories = this.state.categories.filter((x) => x.id !== id); }

  async putBudget(b) { await db.put('budgets', b); const i = this.state.budgets.findIndex((x) => x.id === b.id); if (i > -1) this.state.budgets[i] = b; else this.state.budgets.push(b); }
  async delBudget(id) { await db.del('budgets', id); this.state.budgets = this.state.budgets.filter((x) => x.id !== id); }

  async putGoal(g) { await db.put('goals', g); const i = this.state.goals.findIndex((x) => x.id === g.id); if (i > -1) this.state.goals[i] = g; else this.state.goals.push(g); }
  async delGoal(id) { await db.del('goals', id); this.state.goals = this.state.goals.filter((x) => x.id !== id); }

  async putBill(b) { await db.put('bills', b); const i = this.state.bills.findIndex((x) => x.id === b.id); if (i > -1) this.state.bills[i] = b; else this.state.bills.push(b); }
  async delBill(id) { await db.del('bills', id); this.state.bills = this.state.bills.filter((x) => x.id !== id); }

  async putRec(r) { await db.put('recurring', r); const i = this.state.recurring.findIndex((x) => x.id === r.id); if (i > -1) this.state.recurring[i] = r; else this.state.recurring.push(r); }
  async delRec(id) { await db.del('recurring', id); this.state.recurring = this.state.recurring.filter((x) => x.id !== id); }

  async setSettings(pairs) {
    await db.setSettings(pairs);
    Object.assign(this.state.settings, pairs);
  }

  /* ---------- theme ---------- */
  applyTheme() {
    const mode = this.state.settings.theme || 'auto';
    let dark = mode === 'dark';
    if (mode === 'auto') dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setDocTheme(dark ? 'dark' : 'light');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0C0D18' : '#4C46C7');
    if (this.themeMq) {
      this.themeMq.removeEventListener('change', this._themeFn);
      this.themeMq = null;
    }
    if (mode === 'auto') {
      this.themeMq = window.matchMedia('(prefers-color-scheme: dark)');
      this._themeFn = () => this.applyTheme();
      this.themeMq.addEventListener('change', this._themeFn);
    }
  }

  /* ---------- recurring generator ---------- */
  async runRecurring() {
    const { newTxs, updated } = generateDue(this.state.recurring, this.state.transactions);
    if (newTxs.length) {
      await db.bulkPut('transactions', newTxs);
      this.state.transactions.push(...newTxs);
      if (updated.length) {
        for (const r of updated) await this.putRec(r);
      }
      if (typeof window !== 'undefined') {
        import('./components/ui.js').then(({ toast }) =>
          toast(`تم توليد ${newTxs.length} مصروف متكرر`, { emoji: '🔁', type: 'info' }));
      }
    }
  }

  /* ---------- seed / reset ---------- */
  async applySeed() {
    const seed = buildSeedData();
    for (const a of seed.accounts) {
      if (!this.state.accounts.some((x) => x.id === a.id)) await this.putAccount(a);
    }
    await db.bulkPut('transactions', seed.transactions);
    this.state.transactions.push(...seed.transactions);
    for (const b of seed.budgets) await this.putBudget(b);
    for (const g of seed.goals) await this.putGoal(g);
    for (const b of seed.bills) await this.putBill(b);
    for (const r of seed.recurring) await this.putRec(r);
    await this.setSettings({ isSeed: true });
  }

  async resetAll() {
    await db.clearAll();
    const keep = this.state.settings;
    this.state = {
      transactions: [], accounts: defaultAccounts(), categories: defaultCategories(),
      budgets: [], goals: [], bills: [], recurring: [],
      settings: {
        ...DEFAULT_SETTINGS,
        userName: keep.userName || '',
        userEmoji: keep.userEmoji || '🧑',
        theme: keep.theme || 'auto',
        currency: keep.currency || 'EGP',
        pinEnabled: !!keep.pinEnabled,
        pinHash: keep.pinHash, pinSalt: keep.pinSalt, pinLength: keep.pinLength || 4
      }
    };
    await db.bulkPut('categories', this.state.categories);
    await db.bulkPut('accounts', this.state.accounts);
    await db.setSettings(this.state.settings);
    this.uiMonth = monthKeyOf(todayISO(), this.firstDay());
    this.applyTheme();
  }

  /** Full local wipe: every store + settings + user name. App returns to first-run state.
      Throws if verification finds leftover data. No network, no caches touched. */
  async wipeAllData() {
    await db.clearAll();
    const check = await db.loadAll();
    const leftover = Object.entries(check).some(([k, v]) =>
      Array.isArray(v) ? v.length > 0 : Object.keys(v || {}).length > 0);
    if (leftover) {
      const detail = Object.entries(check)
        .filter(([, v]) => Array.isArray(v) ? v.length > 0 : Object.keys(v || {}).length > 0)
        .map(([k]) => k).join(', ');
      throw new Error('wipe verification failed: data still present in ' + detail);
    }
    this.state = {
      transactions: [], accounts: [], categories: [], budgets: [], goals: [], bills: [], recurring: [],
      settings: { ...DEFAULT_SETTINGS }
    };
    this.uiMonth = monthKeyOf(todayISO(), this.firstDay());
  }

  /* ---------- notifications ---------- */
  buildNotifs() {
    const fd = this.firstDay();
    const mk = monthKeyOf(todayISO(), fd);
    const t = todayISO();
    const mTot = monthTotals(this.state.transactions, mk, fd);
    const prev = monthTotals(this.state.transactions, prevMonthKey(mk), fd);
    const elapsed = daysElapsedInCycle(mk, fd) || 1;
    const data = {
      transactions: this.state.transactions,
      accounts: this.state.accounts,
      budgets: this.state.budgets,
      bills: this.state.bills.map((b) => ({ ...b, dueISO: billDueOf(b, t) })),
      goals: this.state.goals,
      settings: this.state.settings,
      currency: this.currency(),
      lastMonthExpense: prev.expense,
      todayExpense: todayExpense(this.state.transactions),
      dailyAverage: dailyAverage(mTot.expense, elapsed)
    };
    return buildNotifications(data);
  }

  unseenNotifs() {
    if (this.state.settings.notifications === false) return [];
    const seen = new Set(this.state.settings.notifsSeen || []);
    return this.buildNotifs().filter((n) => !seen.has(n.id));
  }

  async markAllSeen() {
    const ids = this.buildNotifs().map((n) => n.id);
    const merged = [...new Set([...(this.state.settings.notifsSeen || []), ...ids])].slice(-100);
    await this.setSettings({ notifsSeen: merged });
  }
}

/** due ISO for a bill (used by notifications + bills page) */
export function billDueOf(b, todayISOstr) {
  const [y, m] = String(todayISOstr).slice(0, 7).split('-').map(Number);
  const t = new Date(y, m - 1, 1);
  const p2 = (n) => (n < 10 ? `0${n}` : String(n));
  let due = new Date(t.getFullYear(), t.getMonth(), b.dueDay || 1);
  const paidThisMonth = b.paid && b.paidDate && b.paidDate.slice(0, 7) === `${y}-${p2(m)}`;
  if (paidThisMonth) due = new Date(t.getFullYear(), t.getMonth() + 1, b.dueDay || 1);
  return `${due.getFullYear()}-${p2(due.getMonth() + 1)}-${p2(due.getDate())}`;
}

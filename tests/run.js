/* tests/run.js — unit tests for pure logic (run: node tests/run.js) */

import assert from 'node:assert/strict';
import { parseAmount, normalizeDigits, fmtMoney, fmtPct } from '../src/utils/format.js';
import {
  monthKeyOf, prevMonthKey, nextMonthKey, monthRange, daysBetween,
  addDays, addMonthsClamped, daysElapsedInCycle, cycleDays, weekRangeISO
} from '../src/utils/dates.js';
import {
  accountBalances, totalBalance, totals, monthTotals, balanceTrend,
  forecastEndOfMonth, savingsRate, compareExpenses, topOf, expenseByDay,
  todayExpense, accountStats
} from '../src/services/finance.js';
import { generateDue } from '../src/services/recurring.js';
import { buildNotifications } from '../src/services/notifications.js';
import { buildMonthAnalysis } from '../src/services/insights.js';
import { buildSeedData } from '../src/services/seed.js';
import { parseBackup, buildBackup, exportCSV } from '../src/services/exporters.js';

let passed = 0;
let failed = 0;
function t(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ❌ ${name}\n     ${err.message}`);
  }
}

console.log('format.js');
t('parseAmount basic', () => assert.equal(parseAmount('1250.50'), 1250.5));
t('parseAmount thousands comma', () => assert.equal(parseAmount('1,250'), 1250));
t('parseAmount ambiguous 1,25 => thousands', () => assert.equal(parseAmount('1,25'), 125));
t('parseAmount arabic digits', () => assert.equal(parseAmount('١٢٥٠٫٥'), 1250.5));
t('parseAmount mixed separators', () => assert.equal(parseAmount('1.250,50'), 1250.5));
t('parseAmount rejects negative', () => assert.equal(parseAmount('-5'), null));
t('parseAmount rejects zero', () => assert.equal(parseAmount('0'), null));
t('parseAmount rejects text', () => assert.equal(parseAmount('abc'), null));
t('parseAmount rejects huge', () => assert.equal(parseAmount('50000000000000000'), null));
t('parseAmount rounds float dust', () => assert.equal(parseAmount('0.10'), 0.1));
t('parseAmount currency symbol', () => assert.equal(parseAmount('150 جنيه'), 150));
t('normalizeDigits persian', () => assert.equal(normalizeDigits('۵۲'), '52'));
t('fmtMoney EGP', () => assert.ok(fmtMoney(12450, 'EGP').includes('12٬450')));
t('fmtPct', () => assert.ok(fmtPct(0.308).includes('31')));

console.log('dates.js');
t('monthKeyOf day1', () => assert.equal(monthKeyOf('2026-10-03', 1), '2026-10'));
t('monthKeyOf firstDay=15 (early month belongs to prev)', () => assert.equal(monthKeyOf('2026-10-03', 15), '2026-09'));
t('monthKeyOf firstDay=15 (late month)', () => assert.equal(monthKeyOf('2026-10-20', 15), '2026-10'));
t('prev/next month', () => {
  assert.equal(prevMonthKey('2026-10'), '2026-09');
  assert.equal(nextMonthKey('2026-12'), '2027-01');
});
t('monthRange firstDay=15', () => {
  const { start, end } = monthRange('2026-10', 15);
  assert.equal(start.getDate(), 15);
  assert.equal(end.getDate(), 15);
  assert.equal(end.getMonth(), 10); // November
});
t('cycleDays', () => {
  assert.equal(cycleDays('2026-10', 1), 31);
  assert.equal(cycleDays('2026-10', 15), 31);
});
t('daysBetween', () => assert.equal(daysBetween('2026-10-03', '2026-10-10'), 7));
t('addMonthsClamped', () => assert.equal(addMonthsClamped('2026-01-31', 1), '2026-02-28'));
t('weekRangeISO', () => {
  const w = weekRangeISO('2026-10-03'); // Saturday
  assert.equal(w.from, '2026-09-28');
  assert.equal(w.to, '2026-10-04');
});

console.log('finance.js');
const accounts = [
  { id: 'a1', openingBalance: 1000 },
  { id: 'a2', openingBalance: 0 }
];
const txs = [
  { id: 't1', type: 'income', amount: 500, accountId: 'a1', date: '2026-10-01' },
  { id: 't2', type: 'expense', amount: 200, accountId: 'a1', date: '2026-10-05' },
  { id: 't3', type: 'transfer', amount: 300, accountId: 'a1', toAccountId: 'a2', date: '2026-10-06' },
  { id: 't4', type: 'expense', amount: 50, accountId: 'a2', date: '2026-09-20' },
  { id: 'bad', type: 'expense', amount: -5, accountId: 'a1', date: '2026-10-01' } // invalid, ignored
];
t('accountBalances', () => {
  const bal = accountBalances(accounts, txs);
  assert.equal(bal.get('a1'), 1000 + 500 - 200 - 300);
  assert.equal(bal.get('a2'), 0 - 50 + 300);
});
t('totalBalance ignores transfers net', () => assert.equal(totalBalance(accounts, txs), 1250));
t('totals range', () => {
  const t = totals(txs, '2026-10-01', '2026-10-31');
  assert.equal(t.income, 500);
  assert.equal(t.expense, 200);
  assert.equal(t.transfers, 300);
  assert.equal(t.net, 300);
});
t('monthTotals firstDay=15', () => {
  // firstDay=15: cycle 2026-09 = 15 Sep .. 14 Oct → includes t4 (Sep 20) AND t2 (Oct 5)
  const m = monthTotals(txs, '2026-09', 15);
  assert.equal(m.expense, 250);
  // cycle 2026-10 starts Oct 15 → t1 (Oct 1) is NOT in it
  const m2 = monthTotals(txs, '2026-10', 15);
  assert.equal(m2.income, 0);
});
t('balanceTrend cumulative', () => {
  const out = balanceTrend(txs, accounts, ['2026-09', '2026-10'], 1);
  assert.equal(out[0].balance, 1000 - 50);
  assert.equal(out[1].balance, 1000 - 50 + 500 - 200);
});
t('forecast', () => assert.equal(forecastEndOfMonth(1000, 10, 30), 3000));
t('savingsRate', () => assert.ok(Math.abs(savingsRate(1000, 300) - 0.7) < 1e-9));
t('compareExpenses', () => assert.ok(Math.abs(compareExpenses(900, 1000) + 0.1) < 1e-9));
t('expenseByDay', () => {
  const m = expenseByDay(txs, '2026-10-01', '2026-10-31');
  assert.equal(m.get('2026-10-05'), 200);
});
t('topOf empty map', () => assert.equal(topOf(new Map()), null));
t('accountStats', () => {
  const st = accountStats(accounts, txs);
  assert.equal(st[0].txCount, 3); // t1,t2,t3
  assert.equal(st[1].txCount, 2); // t4,t3(to)
});
t('todayExpense ignores other days', () => {
  const te = todayExpense([{ id: 'x', type: 'expense', amount: 10, accountId: 'a1', date: '2000-01-01' }]);
  assert.equal(te, 0);
});

console.log('recurring.js');
t('generateDue monthly catches up', () => {
  const today = '2026-10-03';
  const rec = [{ id: 'r1', name: 'sub', amount: 100, frequency: 'monthly', nextDueDate: '2026-08-01', active: true, categoryId: 'c', accountId: 'a1' }];
  const { newTxs, updated } = generateDue(rec, [], today);
  // Aug 1, Sep 1 and Oct 1 are all due (Oct 1 <= today Oct 3)
  assert.equal(newTxs.length, 3);
  assert.equal(newTxs[0].date, '2026-08-01');
  assert.equal(newTxs[1].date, '2026-09-01');
  assert.equal(newTxs[2].date, '2026-10-01');
  assert.equal(updated[0].nextDueDate, '2026-11-01');
  assert.equal(newTxs[0].type, 'expense');
});
t('generateDue respects existing', () => {
  const today = '2026-10-03';
  const rec = [{ id: 'r1', name: 'sub', amount: 100, frequency: 'monthly', nextDueDate: '2026-09-01', active: true }];
  const { newTxs } = generateDue(rec, [{ id: 'x', recurringId: 'r1', date: '2026-09-01', type: 'expense', amount: 100 }], today);
  assert.equal(newTxs.length, 1); // only October
});
t('generateDue skips inactive', () => {
  const { newTxs } = generateDue([{ id: 'r1', amount: 1, frequency: 'daily', nextDueDate: '2026-01-01', active: false }], [], '2026-10-03');
  assert.equal(newTxs.length, 0);
});

console.log('notifications.js');
t('bill due soon warns', () => {
  const today = new Date();
  const due = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2);
  const p2 = (n) => (n < 10 ? `0${n}` : n);
  const dueISO = `${due.getFullYear()}-${p2(due.getMonth() + 1)}-${p2(due.getDate())}`;
  const out = buildNotifications({
    transactions: [], accounts: [], budgets: [],
    bills: [{ id: 'b1', name: 'Internet', amount: 350, dueISO }],
    goals: [], settings: { currency: 'EGP', firstDayOfMonth: 1 }, currency: 'EGP',
    lastMonthExpense: 0, todayExpense: 0, dailyAverage: 0
  });
  assert.ok(out.some((n) => n.id === 'bill-due-b1-' + dueISO));
});
t('budget over', () => {
  const out = buildNotifications({
    transactions: [{ id: 't', type: 'expense', amount: 3000, categoryId: 'cat-food', date: new Date().toISOString().slice(0, 10) }],
    accounts: [], budgets: [{ id: 'b1', categoryId: 'cat-food', amount: 2500 }],
    bills: [], goals: [], settings: { currency: 'EGP', firstDayOfMonth: 1 }, currency: 'EGP',
    lastMonthExpense: 0, todayExpense: 0, dailyAverage: 0
  });
  assert.ok(out.some((n) => n.id === 'budget-over-b1'));
});
t('goal 50%', () => {
  const out = buildNotifications({
    transactions: [], accounts: [], budgets: [], bills: [],
    goals: [{ id: 'g1', name: 'laptop', targetAmount: 1000, currentAmount: 500 }],
    settings: {}, currency: 'EGP', lastMonthExpense: 0, todayExpense: 0, dailyAverage: 0
  });
  assert.ok(out.some((n) => n.id === 'goal-50-g1'));
});

console.log('insights.js');
t('buildMonthAnalysis runs', () => {
  const out = buildMonthAnalysis({
    transactions: [
      { id: 'i1', type: 'income', amount: 18000, categoryId: 'cat-salary', accountId: 'a', date: '2026-10-01' },
      { id: 'e1', type: 'expense', amount: 1200, categoryId: 'cat-food', accountId: 'a', date: '2026-10-04' },
      { id: 'e2', type: 'expense', amount: 600, categoryId: 'cat-transport', accountId: 'a', date: '2026-10-05' }
    ],
    accounts: [{ id: 'a', openingBalance: 100 }],
    categories: [{ id: 'cat-food', name: 'طعام', emoji: '🍔' }, { id: 'cat-transport', name: 'مواصلات', emoji: '🚗' }],
    budgets: [],
    monthKey: '2026-10', lastMonthKey: '2026-09', firstDay: 1, currency: 'EGP'
  });
  assert.ok(Array.isArray(out.summary) && out.summary.length >= 5);
  assert.ok(Array.isArray(out.insights));
});

console.log('seed.js');
t('seed produces sane data', () => {
  const seed = buildSeedData();
  assert.ok(seed.transactions.length > 30);
  assert.equal(seed.accounts.length, 3);
  assert.ok(seed.transactions.every((t) => t.amount > 0 && t.date));
  assert.ok(seed.goals.length >= 2 && seed.bills.length >= 4 && seed.recurring.length >= 2);
  const types = new Set(seed.transactions.map((t) => t.type));
  assert.ok(types.has('income') && types.has('expense') && types.has('transfer'));
});

console.log('exporters.js');
t('backup roundtrip', () => {
  const data = buildBackup({
    transactions: [{ id: 't', type: 'expense', amount: 10, date: '2026-01-01', accountId: 'a', categoryId: 'c' }],
    accounts: [{ id: 'a', name: 'cash' }],
    categories: [{ id: 'c', name: 'food' }],
    budgets: [], goals: [], bills: [], recurring: [], settings: { currency: 'EGP' }
  });
  const res = parseBackup(JSON.stringify(data));
  assert.ok(res.ok, res.error);
  assert.equal(res.data.transactions[0].amount, 10);
});
t('parseBackup rejects foreign file', () => {
  const res = parseBackup(JSON.stringify({ app: 'other', data: {} }));
  assert.ok(!res.ok);
});
t('parseBackup rejects bad amount', () => {
  const bad = buildBackup({ transactions: [{ id: 't', type: 'expense', amount: -1, date: '2026-01-01' }], accounts: [], categories: [], budgets: [], goals: [], bills: [], recurring: [], settings: {} });
  const res = parseBackup(JSON.stringify(bad));
  assert.ok(!res.ok);
});
t('exportCSV escapes quotes', () => {
  const csv = exportCSV(
    [{ id: 't', type: 'expense', amount: 100, date: '2026-01-01', categoryId: 'c', accountId: 'a', description: 'مطعم, "حلو"' }],
    { categories: [{ id: 'c', name: 'طعام' }], accounts: [{ id: 'a', name: 'كاش' }], currency: 'EGP' }
  );
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"مطعم, ""حلو"""'));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

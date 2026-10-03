/* finance.js — pure money math for FLOUSY (no DOM, testable in Node) */

import { monthKeyOf, parseMonthKey, toISODate, todayISO } from '../utils/dates.js';

export const TX_TYPES = ['income', 'expense', 'transfer'];

export function isTx(t) {
  return t && typeof t.amount === 'number' && Number.isFinite(t.amount) && t.amount > 0 && typeof t.date === 'string';
}

/** Balance per account: opening + income - expense - transferOut + transferIn */
export function accountBalances(accounts, transactions) {
  const bal = new Map();
  for (const a of accounts) bal.set(a.id, Number(a.openingBalance) || 0);
  for (const t of transactions) {
    if (!isTx(t)) continue;
    if (t.type === 'income') {
      bal.set(t.accountId, (bal.get(t.accountId) || 0) + t.amount);
    } else if (t.type === 'expense') {
      bal.set(t.accountId, (bal.get(t.accountId) || 0) - t.amount);
    } else if (t.type === 'transfer') {
      bal.set(t.accountId, (bal.get(t.accountId) || 0) - t.amount);
      bal.set(t.toAccountId, (bal.get(t.toAccountId) || 0) + t.amount);
    }
  }
  for (const a of accounts) if (!bal.has(a.id)) bal.set(a.id, Number(a.openingBalance) || 0);
  return bal;
}

export function totalBalance(accounts, transactions) {
  const bal = accountBalances(accounts, transactions);
  let sum = 0;
  for (const a of accounts) sum += bal.get(a.id) || 0;
  return sum;
}

export function txsInRange(transactions, fromISO, toISO) {
  const f = fromISO || '0000-00-00';
  const t = toISO || '9999-12-31';
  return transactions.filter((x) => isTx(x) && x.date >= f && x.date <= t);
}

/** income/expense totals excluding transfers */
export function totals(transactions, fromISO, toISO) {
  let income = 0, expense = 0, transfers = 0;
  for (const t of transactions) {
    if (!isTx(t)) continue;
    if (fromISO && t.date < fromISO) continue;
    if (toISO && t.date > toISO) continue;
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
    else transfers += t.amount;
  }
  return { income, expense, net: income - expense, transfers };
}

export function monthTotals(transactions, monthKey, firstDay = 1) {
  const match = (d) => monthKeyOf(d, firstDay) === monthKey;
  let income = 0, expense = 0, transfers = 0;
  for (const t of transactions) {
    if (!isTx(t) || !match(t.date)) continue;
    if (t.type === 'income') income += t.amount;
    else if (t.type === 'expense') expense += t.amount;
    else transfers += t.amount;
  }
  return { income, expense, net: income - expense, transfers };
}

/** Map categoryId -> total (expenses only unless incomeIncluded) */
export function totalsByCategory(transactions, fromISO, toISO, { income = false } = {}) {
  const map = new Map();
  for (const t of transactions) {
    if (!isTx(t)) continue;
    if (fromISO && t.date < fromISO) continue;
    if (toISO && t.date > toISO) continue;
    if (t.type === 'expense' && t.categoryId) map.set(t.categoryId, (map.get(t.categoryId) || 0) + t.amount);
    else if (income && t.type === 'income' && t.categoryId) map.set(t.categoryId, (map.get(t.categoryId) || 0) + t.amount);
  }
  return map;
}

/** Map dayISO -> expense total */
export function expenseByDay(transactions, fromISO, toISO) {
  const map = new Map();
  for (const t of transactions) {
    if (!isTx(t) || t.type !== 'expense') continue;
    if (fromISO && t.date < fromISO) continue;
    if (toISO && t.date > toISO) continue;
    map.set(t.date, (map.get(t.date) || 0) + t.amount);
  }
  return map;
}

export function dailyAverage(totalExpense, days) {
  if (!days || days <= 0) return 0;
  return totalExpense / days;
}

export function savingsRate(income, expense) {
  if (income <= 0) return expense > 0 ? -1 : 0;
  return (income - expense) / income;
}

export function spendingRatio(income, expense) {
  if (income <= 0) return expense > 0 ? 1 : 0;
  return expense / income;
}

/** Projected end-of-month expense (pure linear estimate, not a guarantee). */
export function forecastEndOfMonth(expenseSoFar, daysElapsed, daysInMonth) {
  if (daysElapsed <= 0 || daysInMonth <= 0) return expenseSoFar || 0;
  return (expenseSoFar / daysElapsed) * daysInMonth;
}

/** Top item in a Map<id, total> */
export function topOf(map) {
  let best = null;
  for (const [k, v] of map) if (!best || v > best.total) best = { id: k, total: v };
  return best;
}

/**
 * Balance at end of each month key (cumulative across all time up to that month).
 * Single pass: O(n + m).
 * returns [{key, balance}]
 */
export function balanceTrend(transactions, accounts, monthKeys, firstDay = 1) {
  let opening = 0;
  for (const a of accounts || []) opening += Number(a.openingBalance) || 0;

  // net per cycle month
  const perMonth = new Map();
  let beforeFirst = 0;
  const first = monthKeys[0];
  for (const t of transactions || []) {
    if (!isTx(t)) continue;
    const k = monthKeyOf(t.date, firstDay);
    if (k === null) continue;
    const s = sign(t);
    if (k < first) beforeFirst += s;
    else perMonth.set(k, (perMonth.get(k) || 0) + s);
  }

  const out = [];
  let running = opening + beforeFirst;
  for (const key of monthKeys) {
    running += perMonth.get(key) || 0;
    out.push({ key, balance: running });
  }
  return out;
}

function sign(t) {
  if (t.type === 'income') return t.amount;
  if (t.type === 'expense') return -t.amount;
  return 0; // transfers net to zero overall
}

/** Total net change of all transactions up to (and including) the given cycle month. */
export function monthBalanceUpto(transactions, accounts, monthKey, firstDay = 1) {
  let opening = 0;
  for (const a of accounts || []) opening += Number(a.openingBalance) || 0;
  let net = 0;
  for (const t of transactions || []) {
    if (!isTx(t)) continue;
    const k = monthKeyOf(t.date, firstDay);
    if (k === null) continue;
    if (k <= monthKey) net += sign(t);
  }
  return opening + net;
}

/** Compare month A vs B: percent change of expense (null if B has none) */
export function compareExpenses(tA, tB) {
  if (tB <= 0) return null;
  return (tA - tB) / tB;
}

/** Account stats: {id, balance, txCount} */
export function accountStats(accounts, transactions) {
  const bal = accountBalances(accounts, transactions);
  const counts = new Map();
  for (const t of transactions) {
    if (!isTx(t)) continue;
    counts.set(t.accountId, (counts.get(t.accountId) || 0) + 1);
    if (t.type === 'transfer') counts.set(t.toAccountId, (counts.get(t.toAccountId) || 0) + 1);
  }
  return accounts.map((a) => ({
    account: a,
    balance: bal.get(a.id) || 0,
    txCount: counts.get(a.id) || 0
  }));
}

/** Today's total expense */
export function todayExpense(transactions) {
  const t = todayISO();
  let s = 0;
  for (const x of transactions) if (isTx(x) && x.type === 'expense' && x.date === t) s += x.amount;
  return s;
}

/* exporters.js — JSON backup, CSV export, print/PDF */

import { CURRENCIES } from '../utils/format.js';
import { todayISO } from '../utils/dates.js';

export const BACKUP_APP = 'flosy';
export const BACKUP_VERSION = 1;

/** Build the full export object. */
export function buildBackup(data) {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      transactions: data.transactions || [],
      accounts: data.accounts || [],
      categories: data.categories || [],
      budgets: data.budgets || [],
      goals: data.goals || [],
      bills: data.bills || [],
      recurring: data.recurring || [],
      settings: data.settings || {}
    }
  };
}

/** Download a text file. */
export function downloadFile(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function exportJSON(data) {
  const payload = JSON.stringify(buildBackup(data), null, 2);
  downloadFile(`flosy-backup-${todayISO().replace(/-/g, '')}.json`, payload);
}

/**
 * Parse + validate an import JSON.
 * returns { ok: true, data } | { ok: false, error }
 */
export function parseBackup(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return { ok: false, error: 'الملف ليس JSON صالحًا' };
  }
  const d = obj && obj.data;
  if (!obj || obj.app !== BACKUP_APP || !d || typeof d !== 'object') {
    return { ok: false, error: 'هذا الملف ليس نسخة احتياطية من فلووسي' };
  }
  const bad = (arr, fn, label) => {
    if (!Array.isArray(arr)) return `القسم ${label} غير صالح`;
    for (const x of arr) if (fn && !fn(x)) return `بيانات غير صالحة في ${label}`;
    return null;
  };
  const valid = (o) => o && typeof o === 'object';
  const check = (arr, label, req) => {
    const e = bad(arr, valid, label);
    if (e) return e;
    for (const x of arr) {
      for (const k of req) {
        if (x[k] === undefined || x[k] === null) return `حقل مفقود في ${label} (${k})`;
      }
    }
    return null;
  };
  let e;
  if ((e = check(d.transactions, 'العمليات', ['id', 'type', 'amount', 'date']))) return { ok: false, error: e };
  if ((e = check(d.accounts, 'الحسابات', ['id', 'name']))) return { ok: false, error: e };
  if ((e = check(d.categories, 'الفئات', ['id', 'name']))) return { ok: false, error: e };
  if ((e = check(d.budgets, 'الميزانيات', ['id', 'amount']))) return { ok: false, error: e };
  if ((e = check(d.goals, 'الأهداف', ['id', 'name', 'targetAmount']))) return { ok: false, error: e };
  if ((e = check(d.bills, 'الفواتير', ['id', 'name', 'amount']))) return { ok: false, error: e };
  if ((e = check(d.recurring, 'المصروفات المتكررة', ['id', 'name', 'amount']))) return { ok: false, error: e };

  // sanitize amounts
  for (const t of d.transactions) {
    t.amount = Number(t.amount);
    if (!Number.isFinite(t.amount) || t.amount < 0 || t.amount > 1e13) return { ok: false, error: 'مبلغ غير صالح في العمليات' };
  }
  if (d.settings && typeof d.settings !== 'object') return { ok: false, error: 'إعدادات غير صالحة' };

  return {
    ok: true,
    data: {
      transactions: d.transactions,
      accounts: d.accounts,
      categories: d.categories,
      budgets: d.budgets,
      goals: d.goals,
      bills: d.bills,
      recurring: d.recurring,
      settings: d.settings || {}
    }
  };
}

/** CSV export of transactions. */
export function exportCSV(txs, { categories, accounts, currency = 'EGP' }) {
  const catMap = new Map((categories || []).map((c) => [c.id, c]));
  const accMap = new Map((accounts || []).map((a) => [a.id, a]));
  const sym = CURRENCIES[currency]?.symbol || currency;
  const typeLabel = { income: 'دخل', expense: 'مصروف', transfer: 'تحويل' };

  const rows = [['التاريخ', 'النوع', 'الفئة', 'المبلغ', 'العملة', 'الحساب', 'إلى حساب', 'طريقة الدفع', 'الوصف', 'ملاحظات']];
  const sorted = [...txs].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  for (const t of sorted) {
    const cat = catMap.get(t.categoryId);
    const acc = accMap.get(t.accountId);
    const to = accMap.get(t.toAccountId);
    let amount = t.amount;
    if (t.type === 'expense') amount = -t.amount;
    rows.push([
      t.date,
      typeLabel[t.type] || t.type,
      cat ? cat.name : (t.type === 'transfer' ? '—' : 'أخرى'),
      String(Math.round(amount * 100) / 100),
      sym,
      acc ? acc.name : '—',
      to ? to.name : '—',
      t.paymentMethod || '—',
      t.description || '',
      t.notes || ''
    ]);
  }
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(',')).join('\r\n');
  // BOM so Excel reads Arabic correctly
  return '\uFEFF' + csv;
}

/** Trigger window.print for the report area (PDF via browser dialog). */
export function printReport() {
  window.print();
}

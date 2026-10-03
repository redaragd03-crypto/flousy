/* notifications.js — in-app notification generator (rule-based) */

import { monthTotals } from './finance.js';
import { daysBetween, relDayLabel, todayISO, monthKeyOf } from '../utils/dates.js';
import { fmtMoney, fmtPct } from '../utils/format.js';

/**
 * Build deterministic notification list.
 * data: { transactions, accounts, budgets, bills, goals, settings, currency }
 */
export function buildNotifications(data) {
  const out = [];
  const cur = data.currency || 'EGP';
  const firstDay = Number(data.settings?.firstDayOfMonth) || 1;
  const today = todayISO();
  const mk = monthKeyOf(today, firstDay);

  // ---- Bills due soon / overdue ----
  for (const b of data.bills || []) {
    if (!b || b.paid) continue;
    const due = b.dueISO;
    if (!due) continue;
    const diff = daysBetween(today, due);
    if (diff < 0) {
      out.push({
        id: `bill-over-${b.id}-${due}`,
        icon: '⚠️',
        level: 'error',
        title: `فاتورة متأخرة: ${b.name}`,
        detail: `فاتورة ${b.name} بقيمة ${fmtMoney(b.amount, cur)} متأخرة منذ ${Math.abs(diff)} يوم`
      });
    } else if (diff <= 3) {
      out.push({
        id: `bill-due-${b.id}-${due}`,
        icon: '⏰',
        level: 'warn',
        title: `فاتورة قادمة: ${b.name}`,
        detail: `موعد دفع ${b.name} ${relDayLabel(due)} — ${fmtMoney(b.amount, cur)}`
      });
    }
  }

  // ---- Budgets: near limit / exceeded ----
  const spent = new Map();
  for (const t of data.transactions || []) {
    if (t.type === 'expense' && monthKeyOf(t.date, firstDay) === mk && t.categoryId) {
      spent.set(t.categoryId, (spent.get(t.categoryId) || 0) + t.amount);
    }
  }
  const monthExp = [...spent.values()].reduce((a, b) => a + b, 0);

  for (const b of data.budgets || []) {
    if (!b || !b.amount) continue;
    const isTotal = !b.categoryId;
    const used = isTotal ? monthExp : spent.get(b.categoryId) || 0;
    if (used <= 0) continue;
    const ratio = used / b.amount;
    const label = isTotal ? 'الميزانية الشهرية' : b.label || 'الفئة';
    if (ratio >= 1) {
      out.push({
        id: `budget-over-${b.id}`,
        icon: '🔴',
        level: 'error',
        title: `تجاوزت ميزانية ${label}`,
        detail: `أنفقت ${fmtMoney(used, cur)} من ${fmtMoney(b.amount, cur)} (تجاوز ${fmtMoney(used - b.amount, cur)})`
      });
    } else if (ratio >= 0.9) {
      out.push({
        id: `budget-near-${b.id}`,
        icon: '⚠️',
        level: 'warn',
        title: `اقتربت من ميزانية ${label}`,
        detail: `استخدمت ${fmtPct(ratio)} من الميزانية المتبقية ${fmtMoney(b.amount - used, cur)}`
      });
    }
  }

  // ---- Month vs last month spending ----
  const m = monthTotals(data.transactions || [], mk, firstDay);
  if (m.expense > 0 && data.lastMonthExpense != null && data.lastMonthExpense > 0) {
    const diff = m.expense - data.lastMonthExpense;
    if (diff > 0.01) {
      const pct = data.lastMonthExpense > 0 ? diff / data.lastMonthExpense : 0;
      out.push({
        id: `spend-up-${mk}`,
        icon: '📈',
        level: 'warn',
        title: 'مصروفاتك أعلى من الشهر الماضي',
        detail: `أنفقت ${fmtMoney(m.expense, cur)} مقابل ${fmtMoney(data.lastMonthExpense, cur)} (زيادة ${fmtPct(pct)})`
      });
    } else if (diff < -0.01) {
      const pct = data.lastMonthExpense > 0 ? Math.abs(diff) / data.lastMonthExpense : 0;
      out.push({
        id: `spend-down-${mk}`,
        icon: '📉',
        level: 'info',
        title: 'مصروفاتك أقل من الشهر الماضي',
        detail: `وفرت ${fmtMoney(Math.abs(diff), cur)} عن الشهر الماضي (${fmtPct(pct)})`
      });
    }
  }

  // ---- Today's spending vs daily average ----
  if (data.todayExpense != null && data.dailyAverage != null && data.dailyAverage > 0 && data.todayExpense > data.dailyAverage * 1.25) {
    out.push({
      id: `today-hot-${today}`,
      icon: '🔥',
      level: 'warn',
      title: 'اليوم أنفقت أكثر من متوسطك اليومي',
      detail: `أنفقت اليوم ${fmtMoney(data.todayExpense, cur)} ومتوسطك اليومي ${fmtMoney(data.dailyAverage, cur)}`
    });
  }

  // ---- Goal milestones ----
  for (const g of data.goals || []) {
    if (!g || !g.targetAmount || g.targetAmount <= 0) continue;
    const r = (Number(g.currentAmount) || 0) / g.targetAmount;
    if (r >= 1) {
      out.push({
        id: `goal-done-${g.id}`,
        icon: '🎯',
        level: 'info',
        title: `مبروك! وصلت هدف ${g.name}`,
        detail: `كملت ادخار ${fmtMoney(g.targetAmount, cur)} للهدف «${g.name}»`
      });
    } else if (r >= 0.75) {
      out.push({
        id: `goal-75-${g.id}`,
        icon: '💪',
        level: 'info',
        title: `وصلت ${fmtPct(0.75)} من هدف ${g.name}`,
        detail: `فضل ${fmtMoney(g.targetAmount - (Number(g.currentAmount) || 0), cur)} وإنت لسه ماشي تمام`
      });
    } else if (r >= 0.5) {
      out.push({
        id: `goal-50-${g.id}`,
        icon: '🎉',
        level: 'info',
        title: `وصلت ${fmtPct(0.5)} من هدف ${g.name}`,
        detail: `وفرت ${fmtMoney(Number(g.currentAmount) || 0, cur)} من ${fmtMoney(g.targetAmount, cur)}`
      });
    }
  }

  return out;
}

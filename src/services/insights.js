/* insights.js — smart, rule-based analysis (no fake AI, pure local math) */

import {
  monthTotals, totalsByCategory, expenseByDay, dailyAverage,
  savingsRate, forecastEndOfMonth, compareExpenses, topOf, totalBalance
} from './finance.js';
import { cycleDays, daysElapsedInCycle, monthLabel, shortMonthLabel } from '../utils/dates.js';
import { fmtMoney, fmtNum, fmtPct, signedNum } from '../utils/format.js';

/**
 * Build the "تحليل هذا الشهر" block.
 * data: { transactions, accounts, categories, budgets, monthKey, firstDay, currency, lastMonthKey }
 * returns: { summary: [{label, value, cls}], insights: [{icon, text, tip}] }
 */
export function buildMonthAnalysis(data) {
  const cur = data.currency || 'EGP';
  const fd = Number(data.firstDay) || 1;
  const mk = data.monthKey;
  const m = monthTotals(data.transactions, mk, fd);
  const lastKey = data.lastMonthKey;
  const last = lastKey ? monthTotals(data.transactions, lastKey, fd) : null;

  const totalBal = totalBalance(data.accounts, data.transactions);
  const catMap = totalsByCategory(data.transactions, rangeFrom(mk, fd), null, {});
  const top = topOf(catMap);
  const topCat = top ? catById(data.categories, top.id) : null;

  const daysElapsed = daysElapsedInCycle(mk, fd);
  const daysInCycle = cycleDays(mk, fd);
  const avg = dailyAverage(m.expense, daysElapsed);
  const forecast = forecastEndOfMonth(m.expense, daysElapsed, daysInCycle);
  const sRate = savingsRate(m.income, m.expense);
  const cmp = last && last.expense > 0 ? compareExpenses(m.expense, last.expense) : null;

  const summary = [
    { label: 'الدخل', value: fmtMoney(m.income, cur), cls: 'income' },
    { label: 'الإنفاق', value: fmtMoney(m.expense, cur), cls: 'expense' },
    { label: 'الادخار', value: `${signedNum(m.net)} ${unit(cur)}`, cls: m.net >= 0 ? 'ok' : 'neg' },
    { label: 'نسبة الادخار', value: m.income > 0 ? fmtPct(sRate) : '—', cls: sRate >= 0.2 ? 'ok' : sRate < 0 ? 'neg' : '' },
    { label: 'متوسط الإنفاق اليومي', value: daysElapsed > 0 ? fmtMoney(avg, cur) : '—', cls: '' },
    { label: 'أكثر فئة إنفاقًا', value: topCat ? `${topCat.emoji} ${topCat.name}` : '—', cls: '' }
  ];

  const insights = [];

  if (m.income <= 0 && m.expense > 0) {
    insights.push({ icon: '📊', text: `<strong>محدش دخل ${shortMonthLabel(mk)}</strong> لسه — صرفت ${fmtMoney(m.expense, cur)} من رصيدك (${fmtMoney(totalBal, cur)} إجمالًا). راقب إنك مش بتسحب من مدخراتك.` });
  }

  if (topCat && m.expense > 0) {
    const share = top.total / m.expense;
    insights.push({
      icon: '🍽️',
      text: `<strong>${topCat.emoji} ${topCat.name}</strong> هي أكبر بند إنفاق: ${fmtMoney(top.total, cur)} (${fmtPct(share)} من مصروفاتك). لو قعدت على متنها، هتوفر ${fmtMoney(top.total * 0.2, cur)} كل شهر تقريبًا.`
    });
  }

  if (daysElapsed > 0 && daysElapsed < daysInCycle && m.expense > 0) {
    insights.push({
      icon: '🔮',
      text: `متوسط إنفاقك اليومي ${fmtMoney(avg, cur)}. <strong>تقديرًا</strong> لو استمريت بنفس المعدل، من المتوقع أن تنفق حوالي <strong>${fmtMoney(forecast, cur)}</strong> بنهاية الشهر. (هذا تقدير رياضي وليس ضمانًا.)`
    });
  }

  if (cmp != null) {
    if (cmp > 0.01) {
      insights.push({ icon: '📈', text: `مصروفاتك أعلى من الشهر الماضي بنسبة ${fmtPct(cmp)} (${fmtMoney(m.expense, cur)} مقابل ${fmtMoney(last.expense, cur)}).`, tip: true });
    } else if (cmp < -0.01) {
      insights.push({ icon: '📉', text: `أحسن من الشهر الماضي: صرف أقل بنسبة ${fmtPct(Math.abs(cmp))} ووفرت ${fmtMoney(Math.abs(m.expense - last.expense), cur)}. شغل نظيف. 💪` });
    } else {
      insights.push({ icon: '⚖️', text: `مصروفاتك شبه ثابتة عن الشهر الماضي (${fmtMoney(m.expense, cur)} مقابل ${fmtMoney(last.expense, cur)}).` });
    }
  }

  if (m.income > 0 && sRate >= 0.2) {
    insights.push({ icon: '🏆', text: `نسبة ادخارك ${fmtPct(sRate)} — نسبة ممتازة. الاستمرارية في الادخار أعلى من 20% بتفرق كتير على المدى الطويل.` });
  } else if (m.income > 0 && sRate < 0.1) {
    insights.push({ icon: '🧮', text: `نسبة ادخارك ${fmtPct(Math.max(0, sRate))} — أقل من 10%. جرّب تحدٍ بسيط: قفل ${fmtMoney(m.income * 0.1, cur)} في أول أسبوع من الشهر.`, tip: true });
  }

  // Budgets pressure
  const fd2 = fd;
  const spent = totalsByCategory(data.transactions, rangeFrom(mk, fd2), null, {});
  let overCount = 0, nearCount = 0;
  for (const b of data.budgets || []) {
    if (!b.amount) continue;
    const used = !b.categoryId ? m.expense : spent.get(b.categoryId) || 0;
    if (used <= 0) continue;
    if (used >= b.amount) overCount++;
    else if (used / b.amount >= 0.85) nearCount++;
  }
  if (overCount > 0) insights.push({ icon: '🚨', text: `عندك <strong>${overCount}</strong> بند تجاوز ميزانيته الشهرية — ارجع مراجعة بندين وابدأ بأعلى واحدة.` });
  else if (nearCount > 0) insights.push({ icon: '⚠️', text: `<strong>${nearCount}</strong> بند اقترب من سقف ميزانيته (85%+). قفلها لآخر الشهر أو اتوقع تفاجأ فيك.` });

  if (m.expense === 0 && m.income === 0) {
    insights.push({ icon: '🌱', text: `لسه مفيش عمليات في ${monthLabel(mk)}. سجّل أول مصروف أو أول دخل عشان نبدأ نحلل.` });
  }

  return { summary, insights };
}

/** Top spending day in the cycle month. */
export function topSpendingDay(transactions, monthKey, firstDay) {
  const from = rangeFrom(monthKey, firstDay);
  const map = expenseByDay(transactions, from, null);
  let best = null;
  for (const [d, v] of map) if (!best || v > best.total) best = { date: d, total: v };
  return best;
}

function rangeFrom(monthKey, firstDay) {
  const [y, m] = String(monthKey).split('-').map(Number);
  const s = new Date(y, m - 1, firstDay || 1);
  const p = (n) => (n < 10 ? `0${n}` : String(n));
  return `${s.getFullYear()}-${p(s.getMonth() + 1)}-${p(s.getDate())}`;
}

function catById(categories, id) {
  return (categories || []).find((c) => c.id === id) || null;
}

function unit(cur) {
  return { EGP: 'جنيه', USD: '$', EUR: '€', SAR: 'ر.س', AED: 'د.إ', GBP: '£' }[cur] || 'جنيه';
}

export { fmtNum };

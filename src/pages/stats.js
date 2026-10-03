/* pages/stats.js — الإحصائيات والرسوم البيانية */

import { h, clear, paintIcons } from '../utils/dom.js';
import {
  totals, totalsByCategory, expenseByDay, dailyAverage,
  balanceTrend, topOf, compareExpenses, savingsRate
} from '../services/finance.js';
import {
  lastMonthKeys, shortMonthLabel, monthLabel, todayISO, monthKeyOf,
  daysElapsedInCycle, dayLabel, monthRange
} from '../utils/dates.js';
import { fmtMoney, fmtPct, fmtNum } from '../utils/format.js';
import { buildMonthAnalysis, topSpendingDay } from '../services/insights.js';
import { donut, bars, line } from '../charts/charts.js';
import { emptyState } from '../components/ui.js';

const PERIODS = [
  { id: 'm1', label: 'هذا الشهر' },
  { id: 'm2', label: 'الشهر الماضي' },
  { id: 'm3', label: 'آخر 3 شهور' },
  { id: 'm6', label: 'آخر 6 شهور' },
  { id: 'y', label: 'هذا العام' },
  { id: 'all', label: 'كل البيانات' }
];

const p2 = (n) => (n < 10 ? `0${n}` : String(n));
const isoOf = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

export function render(ctx, view) {
  clear(view);
  const s = ctx.state;
  const cur = ctx.currency();
  const fd = ctx.firstDay();
  const p = ctx.statsPeriod || 'm3';

  /* period chips */
  view.appendChild(h('div', { class: 'filter-bar' }, PERIODS.map((opt) =>
    h('button', {
      class: `fchip${p === opt.id ? ' active' : ''}`, 'aria-pressed': String(p === opt.id),
      onclick: () => { ctx.statsPeriod = opt.id; render(ctx, view); }
    }, opt.label)
  )));

  const range = periodRange(p, fd);
  const t = totals(s.transactions, range.from, range.to);
  const saved = t.income - t.expense;

  if (!s.transactions.length) {
    view.appendChild(emptyState({
      emoji: '📊', title: 'لسه مفيش بيانات',
      text: 'سجل دخلك ومصروفاتك الأول، وبعدين عيش على الإحصائيات.',
      card: true
    }));
    paintIcons(view);
    return;
  }

  /* ---------- KPIs ---------- */
  const catMap = totalsByCategory(s.transactions, range.from, range.to);
  const top = topOf(catMap);
  const topCat = top ? catFind(ctx, top.id) : null;
  const topDay = topSpendingDay(s.transactions, periodStartMonth(p, fd), fd);
  const daysEl = periodDays(p, fd, range);
  const dAvg = dailyAverage(t.expense, daysEl);
  const sRate = savingsRate(t.income, t.expense);
  const lastKey = monthKeyOf(todayISO(), fd);
  const prev = prevPeriodRange(p, fd);
  const lastExpense = prev ? totals(s.transactions, prev.from, prev.to).expense : 0;
  const cmp = lastExpense > 0 ? compareExpenses(t.expense, lastExpense) : null;

  view.appendChild(h('div', { class: 'grid grid-2 stagger' }, [
    kpiBig('💰', 'إجمالي الدخل', fmtMoney(t.income, cur), 'income'),
    kpiBig('💸', 'إجمالي المصروف', fmtMoney(t.expense, cur), 'expense'),
    kpiBig('🏦', 'الادخار', `${saved >= 0 ? '+' : '−'}${fmtMoney(Math.abs(saved), cur)}`, saved >= 0 ? 'ok' : 'neg'),
    kpiBig('📈', 'نسبة الادخار', t.income > 0 ? fmtPct(sRate) : '—', '')
  ]));

  view.appendChild(h('div', { class: 'grid grid-2 stagger', style: 'margin-top:14px' }, [
    kpiSmall('🗓️', 'متوسط الإنفاق اليومي', dAvg > 0 ? fmtMoney(dAvg, cur) : '—', daysEl > 0 ? `خلال ${daysEl} يوم` : ''),
    kpiSmall('🏆', 'أعلى فئة إنفاق', topCat ? `${topCat.emoji} ${topCat.name}` : '—', topCat ? fmtMoney(top.total, cur) : ''),
    kpiSmall('🔥', 'أعلى يوم إنفاق', topDay ? dayLabel(topDay.date) : '—', topDay ? fmtMoney(topDay.total, cur) : ''),
    kpiSmall('🧾', 'عدد العمليات', fmtNum(countTxs(s.transactions, range.from, range.to)),
      cmp != null ? `${cmp < 0 ? 'أقل' : 'أكثر'} من الفترة السابقة بـ ${fmtPct(Math.abs(cmp))}` : '')
  ]));

  /* ---------- charts ---------- */
  const donutItems = [...catMap.entries()]
    .map(([id, v]) => {
      const c = catFind(ctx, id);
      return { label: c ? c.name : 'أخرى', value: v, color: c ? c.color : '#64748B', emoji: c ? c.emoji : '📦' };
    })
    .sort((a, b) => b.value - a.value);

  view.appendChild(makeChartCard('🍩', 'التوزيع حسب الفئة', (host) =>
    donut(host, donutItems, { currency: cur, centerLabel: 'إجمالي المصروف' })));

  view.appendChild(makeChartCard('📊', 'الدخل مقابل المصروف شهرًا بشهر', (host) =>
    bars(host, monthGroups(s.transactions, fd, 6), { currency: cur })));

  const months = lastMonthKeys(8, fd);
  view.appendChild(makeChartCard('🏦', 'تطور الرصيد (تراكمي)', (host) =>
    line(host, balanceTrend(s.transactions, s.accounts, months, fd).map((pt) => ({
      label: shortMonthLabel(pt.key), value: pt.balance
    })), { currency: cur, allowNegative: true })));

  view.appendChild(makeChartCard('📅', `المصروفات اليومية — ${monthLabel(lastKey, fd).split(' ')[0]}`, (host) =>
    dailyBars(host, s.transactions, fd, cur, lastKey)));

  view.appendChild(makeChartCard('⚖️', 'مقارنة المصروف بين الشهور', (host) =>
    bars(host, compareMonths(s.transactions, fd, 6), { currency: cur })));

  /* ---------- insights ---------- */
  const analysis = buildMonthAnalysis({
    transactions: s.transactions, accounts: s.accounts, categories: s.categories,
    budgets: s.budgets, monthKey: lastKey, lastMonthKey: lastMonthKeys(2, fd)[0], firstDay: fd, currency: cur
  });
  view.appendChild(h('section', { class: 'card', style: 'margin-top:14px' }, [
    h('div', { class: 'card-head' }, [
      h('span', { 'data-ic': 'spark', 'aria-hidden': 'true' }),
      h('h3', {}, 'تحليل ذكي (محلي 100% — بدون AI خارجي)')
    ]),
    ...analysis.insights.slice(0, 5).map((ins) =>
      h('div', { class: `insight${ins.tip ? ' tip' : ''}` }, [
        h('span', { class: 'em', 'aria-hidden': 'true' }, ins.icon),
        h('span', { html: ins.text })
      ])
    )
  ]));

  paintIcons(view);
}

/** Create a card with a chart host, drawn on next frame. */
function makeChartCard(icon, title, draw) {
  const host = h('div', { class: 'chart-box' });
  const card = h('section', { class: 'card', style: 'margin-top:14px' }, [
    h('div', { class: 'card-head' }, [
      h('span', { style: 'font-size:19px', 'aria-hidden': 'true' }, icon),
      h('h3', {}, title)
    ]),
    host
  ]);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try { draw(host); }
    catch (err) {
      console.error('[flosy chart]', err);
      host.innerHTML = '<div class="chart-empty">حدث خطأ في عرض الرسم</div>';
    }
  }));
  return card;
}

function dailyBars(host, txs, fd, cur, mk) {
  const { start, end } = monthRange(mk, fd);
  const days = Math.round((end - start) / 864e5);
  const byDay = expenseByDay(txs, isoOf(start), isoOf(end));
  const today = todayISO();
  const groups = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 864e5);
    const iso = isoOf(d);
    if (iso > today) break;
    groups.push({ label: String(d.getDate()), bars: [{ value: byDay.get(iso) || 0, color: 'var(--expense)', name: 'مصروف' }] });
  }
  if (!groups.length) { host.appendChild(h('div', { class: 'chart-empty' }, 'لسه مفيش مصروفات هذا الشهر')); return; }
  bars(host, groups, { currency: cur, valueLabel: false });
}

/* ---------- range helpers ---------- */

function periodRange(p, fd) {
  const now = new Date();
  const today = todayISO();
  switch (p) {
    case 'm1': { const mk = monthKeyOf(today, fd); const { start, end } = monthRange(mk, fd); return { from: isoOf(start), to: today >= isoOf(end) ? today : isoOf(end) }; }
    case 'm2': { const [mk] = lastMonthKeys(2, fd); const { start, end } = monthRange(mk, fd); return { from: isoOf(start), to: isoOf(new Date(end.getTime() - 864e5)) }; }
    case 'm3': { const [mk] = lastMonthKeys(3, fd); const { start } = monthRange(mk, fd); return { from: isoOf(start), to: today }; }
    case 'm6': { const [mk] = lastMonthKeys(6, fd); const { start } = monthRange(mk, fd); return { from: isoOf(start), to: today }; }
    case 'y': return { from: `${now.getFullYear()}-01-01`, to: today };
    case 'all':
    default: return { from: '0000-00-00', to: '9999-12-31' };
  }
}

function prevPeriodRange(p, fd) {
  switch (p) {
    case 'm1': { const [mk] = lastMonthKeys(2, fd); const { start, end } = monthRange(mk, fd); return { from: isoOf(start), to: isoOf(new Date(end.getTime() - 864e5)) }; }
    case 'm2': { const [mk] = lastMonthKeys(3, fd); const { start, end } = monthRange(mk, fd); return { from: isoOf(start), to: isoOf(new Date(end.getTime() - 864e5)) }; }
    case 'm3': { const keys = lastMonthKeys(6, fd); const { start } = monthRange(keys[0], fd); const { start: s2 } = monthRange(lastMonthKeys(3, fd)[0], fd); return { from: isoOf(start), to: isoOf(new Date(s2.getTime() - 864e5)) }; }
    case 'm6': { const keys = lastMonthKeys(12, fd); const { start } = monthRange(keys[0], fd); const { start: s2 } = monthRange(lastMonthKeys(6, fd)[0], fd); return { from: isoOf(start), to: isoOf(new Date(s2.getTime() - 864e5)) }; }
    case 'y': return { from: `${new Date().getFullYear() - 1}-01-01`, to: `${new Date().getFullYear() - 1}-12-31` };
    default: return null;
  }
}

function periodStartMonth(p, fd) {
  if (p === 'm2') return lastMonthKeys(2, fd)[0];
  return monthKeyOf(todayISO(), fd);
}

function periodDays(p, fd, range) {
  if (p === 'm1') return daysElapsedInCycle(monthKeyOf(todayISO(), fd), fd);
  const parse = (iso) => {
    if (!iso || iso < '0001-01-01' || iso > '9999-12-31') return null;
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };
  const a = parse(range.from), b = parse(range.to);
  if (!a || !b) return 0;
  return Math.max(1, Math.round((b - a) / 864e5) + 1);
}

function countTxs(txs, from, to) {
  let n = 0;
  for (const t of txs) if (t.date >= from && t.date <= to) n++;
  return n;
}

function catFind(ctx, id) {
  return ctx.state.categories.find((c) => c.id === id) || null;
}

/** income vs expense bars for last N months */
function monthGroups(txs, fd, n) {
  return lastMonthKeys(n, fd).map((k) => {
    const { start, end } = monthRange(k, fd);
    const t = totals(txs, isoOf(start), isoOf(new Date(end.getTime() - 864e5)));
    return {
      label: shortMonthLabel(k),
      bars: [
        { value: t.income, color: 'var(--income)', name: 'الدخل' },
        { value: t.expense, color: 'var(--expense)', name: 'المصروف' }
      ]
    };
  });
}

/** expense-only comparison per month */
function compareMonths(txs, fd, n) {
  return lastMonthKeys(n, fd).map((k) => {
    const { start, end } = monthRange(k, fd);
    const t = totals(txs, isoOf(start), isoOf(new Date(end.getTime() - 864e5)));
    return { label: shortMonthLabel(k), bars: [{ value: t.expense, color: 'var(--transfer)', name: 'مصروف' }] };
  });
}

function kpiBig(emoji, label, value, cls) {
  const bg = { income: 'var(--income-soft)', expense: 'var(--expense-soft)', ok: 'var(--income-soft)', neg: 'var(--expense-soft)' }[cls] || 'var(--primary-soft)';
  const vc = { expense: 'var(--expense)', neg: 'var(--expense)' }[cls] || '';
  return h('div', { class: 'kpi' }, [
    h('div', { class: 'kpi-ico', style: `background:${bg}`, 'aria-hidden': 'true' }, emoji),
    h('div', { class: 'kpi-label' }, label),
    h('div', { class: 'kpi-value num', style: vc ? `color:${vc}` : '' }, value)
  ]);
}

function kpiSmall(emoji, label, value, foot) {
  return h('div', { class: 'kpi' }, [
    h('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:8px' }, [
      h('span', { style: 'font-size:20px', 'aria-hidden': 'true' }, emoji),
      h('div', { class: 'kpi-label' }, label)
    ]),
    h('div', { class: 'kpi-value num', style: 'font-size:17px' }, value),
    foot ? h('div', { class: 'kpi-foot' }, foot) : null
  ]);
}

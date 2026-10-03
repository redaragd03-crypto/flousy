/* pages/reports.js — التقارير + تصدير CSV + PDF */

import { h, clear, paintIcons } from '../utils/dom.js';
import { totals, totalsByCategory, accountStats, topOf } from '../services/finance.js';
import { todayISO, monthKeyOf, monthRange, lastMonthKeys, dayLabel, shortMonthLabel, toISODate } from '../utils/dates.js';
import { fmtMoney, fmtPct, fmtNum } from '../utils/format.js';
import { exportCSV, printReport, downloadFile } from '../services/exporters.js';
import { toast } from '../components/ui.js';

const PERIODS = [
  { id: 'week', label: 'هذا الأسبوع' },
  { id: 'm1', label: 'هذا الشهر' },
  { id: 'm3', label: 'آخر 3 شهور' },
  { id: 'm6', label: 'آخر 6 شهور' },
  { id: 'year', label: 'هذا العام' },
  { id: 'custom', label: 'فترة مخصصة' }
];

export function render(ctx, view) {
  clear(view);
  const s = ctx.state;
  const cur = ctx.currency();
  const fd = ctx.firstDay();
  const p = ctx.reportPeriod || 'm1';

  const chips = h('div', { class: 'filter-bar' });
  for (const opt of PERIODS) {
    chips.appendChild(h('button', {
      class: `fchip${p === opt.id ? ' active' : ''}`,
      onclick: () => { ctx.reportPeriod = opt.id; ctx.customRange = null; render(ctx, view); }
    }, opt.label));
  }
  view.appendChild(chips);

  /* custom range */
  if (p === 'custom') {
    const from = h('input', { class: 'inp', type: 'date', value: ctx.customRange?.from || toISODate(new Date()) });
    const to = h('input', { class: 'inp', type: 'date', value: ctx.customRange?.to || todayISO() });
    view.appendChild(h('div', { class: 'card', style: 'display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end' }, [
      h('div', {}, [h('label', { style: 'display:block;font-size:12.5px;font-weight:800;color:var(--text-2);margin-bottom:5px' }, 'من تاريخ'), from]),
      h('div', {}, [h('label', { style: 'display:block;font-size:12.5px;font-weight:800;color:var(--text-2);margin-bottom:5px' }, 'إلى تاريخ'), to]),
      h('button', { class: 'btn btn-primary', onclick: () => { ctx.customRange = { from: from.value, to: to.value }; render(ctx, view); } }, 'تطبيق')
    ]));
  }

  const range = reportRange(p, fd, ctx.customRange);
  const t = totals(s.transactions, range.from, range.to);
  const catMap = totalsByCategory(s.transactions, range.from, range.to);
  const acctStats = accountStats(s.accounts, s.transactions);
  const top = topOf(catMap);
  const topCat = top ? s.categories.find((c) => c.id === top.id) : null;

  /* ---------- printable report area ---------- */
  const report = h('div', { class: 'print-area' });
  report.appendChild(h('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:10px;flex-wrap:wrap' }, [
    h('div', {}, [
      h('h2', { style: 'font-size:20px' }, `تقرير فلووسي — ${periodTitle(p, range)}`),
      h('div', { style: 'font-size:12.5px;color:var(--text-3);font-weight:700' }, `تاريخ التقرير: ${todayISO()} · العملة: ${cur}`)
    ]),
    h('div', { class: 'no-print', style: 'display:flex;gap:8px;flex-wrap:wrap' }, [
      h('button', {
        class: 'btn btn-ghost btn-sm',
        onclick: () => {
          exportCSVdoc(ctx, s, cur, range);
          toast('تم تصدير ملف CSV', { emoji: '📄' });
        }
      }, ['📤', 'تصدير CSV']),
      h('button', { class: 'btn btn-primary btn-sm', onclick: () => printReport() }, ['🖨️', 'تصدير PDF / طباعة'])
    ])
  ]));

  /* summary */
  report.appendChild(h('div', { class: 'grid grid-3', style: 'gap:10px;margin-bottom:14px' }, [
    sumCell('إجمالي الدخل', t.income, cur, true),
    sumCell('إجمالي المصروف', t.expense, cur, false),
    sumCell('الصافي', t.income - t.expense, cur, t.income - t.expense >= 0)
  ]));
  report.appendChild(h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px' }, [
    h('span', { class: 'chip-badge' }, `عدد العمليات: ${fmtNum(countTxs(s.transactions, range.from, range.to))}`),
    h('span', { class: 'chip-badge' }, t.income > 0 ? `نسبة الادخار: ${fmtPct((t.income - t.expense) / t.income)}` : '—'),
    topCat ? h('span', { class: 'chip-badge' }, `أعلى فئة: ${topCat.emoji} ${topCat.name} (${fmtPct(top.total / (t.expense || 1))})`) : null
  ]));

  /* by category */
  report.appendChild(h('h3', { style: 'font-size:15px;margin:16px 0 8px' }, 'المصروفات حسب الفئة'));
  const catRows = [...catMap.entries()]
    .map(([id, v]) => {
      const c = s.categories.find((x) => x.id === id);
      return { name: c ? `${c.emoji} ${c.name}` : 'أخرى', value: v, share: t.expense > 0 ? v / t.expense : 0 };
    })
    .sort((a, b) => b.value - a.value);
  const catBody = catRows.length
    ? catRows.map((r) => h('tr', {}, [
      h('td', {}, r.name),
      h('td', { class: 'amt neg' }, fmtMoney(r.value, cur)),
      h('td', { class: 'amt' }, fmtPct(r.share))
    ]))
    : [h('tr', {}, h('td', { colspan: 3, style: 'text-align:center;color:var(--text-3)' }, 'مفيش مصروفات في الفترة دي'))];
  report.appendChild(h('div', { class: 'tbl-wrap' }, [
    h('table', { class: 'tbl' }, [
      h('thead', {}, h('tr', {}, [h('th', {}, 'الفئة'), h('th', {}, 'المبلغ'), h('th', {}, 'النسبة')])),
      h('tbody', {}, catBody)
    ])
  ]));

  /* by account */
  report.appendChild(h('h3', { style: 'font-size:15px;margin:16px 0 8px' }, 'حركة الحسابات'));
  const acctBody = acctStats.length
    ? acctStats.map((st) => h('tr', {}, [
      h('td', {}, `${st.account.emoji || ''} ${st.account.name}`),
      h('td', { class: `amt ${rangeFlow(st, s, range.from, range.to) >= 0 ? 'pos' : 'neg'}` }, fmtMoney(rangeFlow(st, s, range.from, range.to), cur, { withUnit: false })),
      h('td', { class: `amt ${st.balance < 0 ? 'neg' : 'pos'}` }, fmtMoney(st.balance, cur, { withUnit: false })),
      h('td', { class: 'amt' }, String(st.txCount))
    ]))
    : [h('tr', {}, h('td', { colspan: 4, style: 'text-align:center;color:var(--text-3)' }, 'مفيش حسابات'))];
  report.appendChild(h('div', { class: 'tbl-wrap' }, [
    h('table', { class: 'tbl' }, [
      h('thead', {}, h('tr', {}, [h('th', {}, 'الحساب'), h('th', {}, 'رصيد الفترة'), h('th', {}, 'الرصيد الحالي'), h('th', {}, 'عدد العمليات')])),
      h('tbody', {}, acctBody)
    ])
  ]));

  /* top transactions */
  const topTxs = [...s.transactions]
    .filter((x) => x.date >= range.from && x.date <= range.to && x.type !== 'transfer')
    .sort((a, b) => b.amount - a.amount).slice(0, 10);
  if (topTxs.length) {
    report.appendChild(h('h3', { style: 'font-size:15px;margin:16px 0 8px' }, 'أكبر العمليات في الفترة'));
    report.appendChild(h('div', { class: 'tbl-wrap' }, [
      h('table', { class: 'tbl' }, [
        h('thead', {}, h('tr', {}, [h('th', {}, 'التاريخ'), h('th', {}, 'الوصف'), h('th', {}, 'النوع'), h('th', {}, 'المبلغ')])),
        h('tbody', {}, topTxs.map((tx) => {
          const c = s.categories.find((x) => x.id === tx.categoryId);
          return h('tr', {}, [
            h('td', {}, dayLabel(tx.date)),
            h('td', {}, tx.description || (c ? c.name : '—')),
            h('td', {}, tx.type === 'income' ? '💰 دخل' : '💸 مصروف'),
            h('td', { class: `amt ${tx.type === 'income' ? 'pos' : 'neg'}` }, fmtMoney(tx.amount, cur, { withUnit: false }))
          ]);
        }))
      ])
    ]));
  }

  view.appendChild(report);
  paintIcons(view);
}

function sumCell(label, value, cur, positive) {
  return h('div', { style: 'background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:13px 15px' }, [
    h('div', { style: 'font-size:12px;font-weight:800;color:var(--text-3)' }, label),
    h('div', { class: 'num', style: `font-size:19px;font-weight:800;margin-top:3px;color:${positive === null ? 'var(--text)' : positive ? 'var(--income)' : 'var(--expense)'}` },
      `${value >= 0 ? '' : '−'}${fmtMoney(Math.abs(value), cur, { withUnit: false })} ${ctxUnit(cur)}`)
  ]);
}

function ctxUnit(cur) { return { EGP: 'جنيه', USD: '$', EUR: '€', SAR: 'ر.س', AED: 'د.إ', GBP: '£' }[cur] || ''; }

function rangeFlow(st, s, from, to) {
  let f = 0;
  for (const t of s.transactions) {
    if (t.date < from || t.date > to) continue;
    if (t.type === 'income' && t.accountId === st.account.id) f += t.amount;
    else if (t.type === 'expense' && t.accountId === st.account.id) f -= t.amount;
    else if (t.type === 'transfer') {
      if (t.accountId === st.account.id) f -= t.amount;
      if (t.toAccountId === st.account.id) f += t.amount;
    }
  }
  return f;
}

function countTxs(txs, from, to) {
  let n = 0;
  for (const t of txs) if (t.date >= from && t.date <= to) n++;
  return n;
}

function exportCSVdoc(ctx, s, cur, range) {
  const txs = s.transactions.filter((t) => t.date >= range.from && t.date <= range.to);
  const csv = exportCSV(txs, { categories: s.categories, accounts: s.accounts, currency: cur });
  downloadFile(`flosy-report-${range.from}-${range.to}.csv`, csv, 'text/csv');
}

function reportRange(p, fd, custom) {
  const today = todayISO();
  const now = new Date();
  switch (p) {
    case 'week': {
      const d = new Date();
      const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
      return { from: toISODate(mon), to: today };
    }
    case 'm1': { const mk = monthKeyOf(today, fd); const { start, end } = monthRange(mk, fd); return { from: toISODate(start), to: today >= toISODate(end) ? today : toISODate(end) }; }
    case 'm3': { const [mk] = lastMonthKeys(3, fd); const { start } = monthRange(mk, fd); return { from: toISODate(start), to: today }; }
    case 'm6': { const [mk] = lastMonthKeys(6, fd); const { start } = monthRange(mk, fd); return { from: toISODate(start), to: today }; }
    case 'year': return { from: `${now.getFullYear()}-01-01`, to: today };
    case 'custom': return custom && custom.from ? { from: custom.from, to: custom.to || today } : { from: today, to: today };
    default: return { from: today, to: today };
  }
}

function periodTitle(p, range) {
  const t = { week: 'هذا الأسبوع', m1: 'هذا الشهر', m3: 'آخر 3 شهور', m6: 'آخر 6 شهور', year: 'هذا العام' }[p];
  if (t) return t;
  return `${range.from} → ${range.to}`;
}

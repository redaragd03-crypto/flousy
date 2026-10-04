/* pages/dashboard.js — الرئيسية */

import { h, clear, animNumber, setProgress, paintIcons } from '../utils/dom.js';
import { monthTotals, todayExpense, dailyAverage, topOf, totalsByCategory } from '../services/finance.js';
import {
  monthKeyOf, monthLabel, prevMonthKey, nextMonthKey, todayISO, relDayLabel,
  daysBetween, daysElapsedInCycle, cycleDays, dayLabel, parseISO
} from '../utils/dates.js';
import { fmtMoney, fmtPct, signedNum } from '../utils/format.js';
import { buildMonthAnalysis, topSpendingDay } from '../services/insights.js';
import { emptyState } from '../components/ui.js';
import { hbars } from '../charts/charts.js';
import { addTxModal, transferModal, goalModal, budgetModal } from '../components/modals.js';

export function render(ctx, view) {
  clear(view);
  const s = ctx.state;
  const cur = ctx.currency();
  const fd = ctx.firstDay();
  const mk = ctx.uiMonth;
  const nowMk = monthKeyOf(todayISO(), fd);
  const m = monthTotals(s.transactions, mk, fd);
  const hasAny = s.transactions.length > 0;

  /* ---------- greeting ---------- */
  view.appendChild(h('div', { class: 'page-head' }, [
    h('div', {}, [
      h('h2', { style: 'font-size:21px' }, s.settings.userName ? `أهلاً يا ${s.settings.userName} 👋` : 'أهلاً 👋'),
      h('div', { class: 'sub' }, 'خلينا نراجع فلوسك النهارده')
    ])
  ]));

  /* ---------- hero balance card ---------- */
  const bal = ctx.totalBalance();
  const balVal = h('span', { class: bal < 0 ? 'num hb-value neg' : 'num hb-value' });
  const hero = h('section', { class: 'hero', 'aria-label': 'الرصيد الحالي' }, [
    h('div', { class: 'hero-top' }, [
      h('div', { class: 'hero-label' }, [
        h('span', { 'data-ic': 'money', 'aria-hidden': 'true' }),
        h('span', {}, 'الرصيد الحالي')
      ]),
      h('div', { class: 'month-pick', role: 'group', 'aria-label': 'اختيار الشهر' }, [
        h('button', {
          'aria-label': 'الشهر السابق', onclick: () => { ctx.setMonth(prevMonthKey(mk)); }
        }, h('span', { 'data-ic': 'chevR' })),
        h('span', { class: 'mp-label' }, monthLabel(mk, fd)),
        h('button', {
          'aria-label': 'الشهر التالي', disabled: mk >= nowMk,
          onclick: () => { ctx.setMonth(nextMonthKey(mk)); }
        }, h('span', { 'data-ic': 'chevL' }))
      ])
    ]),
    h('div', { class: 'hero-balance' }, [
      balVal,
      h('span', { class: 'hb-unit' }, ctx.unit())
    ]),
    h('div', { class: `hero-delta${m.net < 0 ? ' neg' : ''}` }, [
      h('span', { 'aria-hidden': 'true' }, m.net >= 0 ? '📈' : '📉'),
      h('span', {}, `${m.net >= 0 ? '+' : '−'} ${fmtMoney(Math.abs(m.net), cur)} ${m.net >= 0 ? 'متبقي هذا الشهر' : 'عجز هذا الشهر'}`)
    ]),
    h('div', { class: 'hero-mini' }, [
      h('div', { class: 'hero-chip' }, [
        h('div', { class: 'hc-label' }, [h('span', { 'data-ic': 'chart', 'aria-hidden': 'true' }), h('span', {}, 'الدخل')]),
        h('div', { class: 'hc-value num' }, fmtMoney(m.income, cur, { withUnit: false }))
      ]),
      h('div', { class: 'hero-chip' }, [
        h('div', { class: 'hc-label' }, [h('span', { 'data-ic': 'branch', 'aria-hidden': 'true' }), h('span', {}, 'المصروف')]),
        h('div', { class: 'hc-value num' }, fmtMoney(m.expense, cur, { withUnit: false }))
      ])
    ])
  ]);
  view.appendChild(hero);

  animNumber(balVal, Math.round(bal * 100) / 100, {
    duration: 900,
    format: (n) => fmtMoney(Math.round(n * 100) / 100, cur, { withUnit: false })
  });

  /* ---------- quick actions ---------- */
  view.appendChild(h('div', { class: 'qa-grid stagger', style: 'margin:16px 0 6px' }, [
    h('button', { class: 'qa qa-expense', onclick: () => addTxModal(ctx, { type: 'expense' }) }, [
      h('span', { class: 'qa-ico', 'aria-hidden': 'true' }, '💸'), h('span', {}, 'مصروف')
    ]),
    h('button', { class: 'qa qa-income', onclick: () => addTxModal(ctx, { type: 'income' }) }, [
      h('span', { class: 'qa-ico', 'aria-hidden': 'true' }, '💰'), h('span', {}, 'دخل')
    ]),
    h('button', { class: 'qa qa-transfer', onclick: () => transferModal(ctx) }, [
      h('span', { class: 'qa-ico', 'aria-hidden': 'true' }, '🔄'), h('span', {}, 'تحويل')
    ]),
    h('button', { class: 'qa qa-goal', onclick: () => goalModal(ctx) }, [
      h('span', { class: 'qa-ico', 'aria-hidden': 'true' }, '🎯'), h('span', {}, 'هدف')
    ]),
    h('button', { class: 'qa qa-report', onclick: () => ctx.nav('reports') }, [
      h('span', { class: 'qa-ico', 'aria-hidden': 'true' }, '📊'), h('span', {}, 'تقرير')
    ])
  ]));

  if (!hasAny) {
    view.appendChild(h('div', {}, [
      emptyState({
        emoji: '👀',
        title: 'لسه مفيش عمليات',
        text: 'ابدأ بإضافة أول مصروف ليك، أو جرّب البيانات التجريبية من الإعدادات وعرّف شكل التطبيق لما يمتلئ بالبيانات.',
        actionLabel: 'إضافة أول مصروف',
        onAction: () => addTxModal(ctx, { type: 'expense' }),
        card: true
      })
    ]));
    paintIcons(view);
    return;
  }

  /* ---------- month summary ---------- */
  const totalBudget = (s.budgets || []).find((b) => !b.categoryId && b.amount > 0);
  const ratio = totalBudget ? m.expense / totalBudget.amount : (m.income > 0 ? m.expense / m.income : 0);
  let statusHtml = null;
  if (m.expense > 0) {
    let cls = 'ok', msg = '';
    if (totalBudget) {
      const left = totalBudget.amount - m.expense;
      if (m.expense >= totalBudget.amount) { cls = 'danger'; msg = `🔴 تجاوزت ميزانيتك الشهرية بـ ${fmtMoney(m.expense - totalBudget.amount, cur)}`; }
      else if (ratio >= 0.9) { cls = 'warn'; msg = `⚠️ قرييب أوي من الميزانية — فضل ${fmtMoney(left, cur)} بس`; }
      else if (ratio >= 0.75) { cls = 'warn'; msg = `⚠️ استهلكت ${fmtPct(ratio)} من ميزانيتك الشهرية`; }
      else { cls = 'ok'; msg = `🎯 ماشي تمام — مدفوع ${fmtPct(ratio)} من ميزانيتك الشهرية`; }
    } else {
      if (ratio >= 1) { cls = 'danger'; msg = '🔴 مصروفاتك اكتر من دخلك الشهر'; }
      else if (ratio >= 0.9) { cls = 'warn'; msg = `⚠️ صرفت ${fmtPct(ratio)} من دخلك — قفل على النسبة`; }
      else { cls = 'ok'; msg = `🎯 صرف ${fmtPct(ratio)} من الدخل فقط — هندام`; }
    }
    statusHtml = h('div', { class: `pill ${cls}`, style: 'font-size:13px;padding:6px 12px' }, msg);
  } else {
    statusHtml = h('div', { class: 'pill mute' }, m.income > 0 ? 'لسه مفيش إنفاق هذا الشهر' : 'مفيش نشاط هذا الشهر');
  }

  const prog = h('div', { class: `progress ${ratio >= 1 ? 'danger' : ratio >= 0.9 ? 'danger' : ratio >= 0.75 ? 'warn' : 'ok'}`, 'aria-hidden': 'true' }, h('i'));
  const savings = m.income - m.expense;

  view.appendChild(h('section', { class: 'card' }, [
    h('div', { class: 'card-head' }, [
      h('span', { 'data-ic': 'calendar', 'aria-hidden': 'true' }),
      h('h3', {}, `ملخص ${monthLabel(mk, fd)}`),
      h('span', { class: 'grow' }),
      h('button', { class: 'btn btn-sm btn-ghost', onclick: () => budgetModal(ctx, { categoryId: null, initial: totalBudget || null }) }, totalBudget ? 'تعديل الميزانية' : '+ ميزانية شهرية')
    ]),
    h('div', { class: 'grid grid-2', style: 'gap:10px' }, [
      kpi('💰', 'إجمالي الدخل', fmtMoney(m.income, cur), 'income'),
      kpi('💸', 'إجمالي المصروفات', fmtMoney(m.expense, cur), 'expense'),
      kpi('🏦', 'المدخرات', `${signedNum(savings)} ${ctx.unit()}`, savings >= 0 ? 'ok' : 'neg'),
      kpi('📊', 'نسبة الإنفاق', m.income > 0 || totalBudget ? fmtPct(ratio) : '—', '')
    ]),
    statusHtml ? h('div', { style: 'margin-top:12px;display:flex;justify-content:flex-start' }, statusHtml) : null,
    totalBudget || m.income > 0 ? h('div', { style: 'margin-top:10px' }, [
      h('div', { style: 'display:flex;justify-content:space-between;font-size:12px;font-weight:800;color:var(--text-3);margin-bottom:5px' }, [
        h('span', {}, totalBudget ? `من ${fmtMoney(totalBudget.amount, cur)}` : 'من الدخل'),
        h('span', { class: 'num' }, fmtPct(ratio))
      ]),
      prog
    ]) : null
  ]));

  /* ---------- budget alerts ---------- */
  const spent = totalsByCategory(s.transactions, rangeFrom(mk, fd), null);
  const over = [];
  for (const b of s.budgets || []) {
    if (!b.amount || !b.categoryId) continue;
    const used = spent.get(b.categoryId) || 0;
    if (used > b.amount) over.push({ b, used, over: used - b.amount });
  }
  if (over.length) {
    view.appendChild(h('section', { class: 'card', style: 'border-color:var(--danger-soft)' }, [
      h('div', { class: 'card-head' }, [h('span', { 'data-ic': 'alert', 'aria-hidden': 'true' }), h('h3', {}, 'تحذيرات الميزانية')]),
      ...over.slice(0, 4).map(({ b, used, over: ov }) =>
        h('div', { class: 'insight', style: 'background:var(--danger-soft);border-color:transparent' }, [
          h('span', { class: 'em' }, '🔴'),
          h('span', {}, [`لقد تجاوزت ميزانية <strong>${b.label}</strong> هذا الشهر بـ <strong>${fmtMoney(ov, cur)}</strong> (أنفقت ${fmtMoney(used, cur)}).`])
        ])
      )
    ]));
  }

  /* ---------- budgets progress (top) ---------- */
  const catBudgets = (s.budgets || []).filter((b) => b.categoryId && b.amount > 0).slice(0, 4);
  if (catBudgets.length) {
    const rows = catBudgets.map((b) => {
      const used = spent.get(b.categoryId) || 0;
      const r = used / b.amount;
      const cls = r >= 1 ? 'danger' : r >= 0.9 ? 'danger' : r >= 0.75 ? 'warn' : 'ok';
      const bar = h('div', { class: 'progress thin', 'aria-hidden': 'true' }, h('i'));
      return h('div', { class: 'hbar-row' }, [
        h('div', { class: 'hbar-label' }, [
          h('span', { class: 'em' }, catEmojiOf(ctx, b.categoryId)),
          h('span', { class: 'nm' }, b.label)
        ]),
        bar,
        h('div', { class: 'hbar-val', style: `color:${r >= 1 ? 'var(--danger)' : 'var(--text-2)'}` }, fmtPct(r))
      ]);
    });
    view.appendChild(h('section', { class: 'card' }, [
      h('div', { class: 'card-head' }, [
        h('span', { 'data-ic': 'filter', 'aria-hidden': 'true' }),
        h('h3', {}, 'الميزانيات'),
        h('span', { class: 'grow' }),
        h('a', { class: 'link-mini', href: '#/budgets', onclick: (e) => { e.preventDefault(); ctx.nav('budgets'); } }, 'إدارة الكل')
      ]),
      ...rows
    ]));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      catBudgets.forEach((b, i) => {
        const used = spent.get(b.categoryId) || 0;
        setProgress(rows[i].querySelector('.progress'), used / b.amount);
      });
    }));
  }

  /* ---------- upcoming bills ---------- */
  const today = todayISO();
  const dueSoon = (s.bills || [])
    .filter((b) => !b.paid && b.dueISO)
    .map((b) => ({ b, diff: daysBetween(today, b.dueISO) }))
    .filter((x) => x.diff >= -3 && x.diff <= 7)
    .sort((a, z) => a.diff - z.diff)
    .slice(0, 3);
  if (dueSoon.length) {
    view.appendChild(h('section', { class: 'card' }, [
      h('div', { class: 'card-head' }, [
        h('span', { 'data-ic': 'clock', 'aria-hidden': 'true' }),
        h('h3', {}, 'مستحقات قريبة'),
        h('span', { class: 'grow' }),
        h('a', { class: 'link-mini', href: '#/bills', onclick: (e) => { e.preventDefault(); ctx.nav('bills'); } }, 'الكل')
      ]),
      ...dueSoon.map(({ b, diff }) =>
        h('div', { style: 'display:flex;align-items:center;gap:10px;padding:8px 2px' }, [
          h('span', { style: 'font-size:22px' }, b.emoji || '🧾'),
          h('div', { style: 'flex:1;min-width:0' }, [
            h('div', { style: 'font-weight:800;font-size:14px' }, b.name),
            h('div', { style: 'font-size:12px;color:var(--text-3);font-weight:700' }, `يوم الاستحقاق ${relDayLabel(b.dueISO)}`)
          ]),
          h('div', { class: `pill ${diff < 0 ? 'danger' : diff <= 1 ? 'warn' : 'info'}` }, diff < 0 ? `متأخرة ${Math.abs(diff)} يوم` : relDayLabel(b.dueISO)),
          h('div', { class: 'num', style: 'font-weight:800;font-size:14px;min-width:70px;text-align:end' }, fmtMoney(b.amount, cur, { withUnit: false }))
        ])
      )
    ]));
  }

  /* ---------- top categories this month ---------- */
  const top = topOf(spent);
  if (top) {
    const items = [...spent.entries()]
      .map(([id, v]) => ({ id, label: catNameOf(ctx, id), value: v, color: catColorOf(ctx, id), emoji: catEmojiOf(ctx, id) }))
      .sort((a, b) => b.value - a.value);
    const host = h('div');
    view.appendChild(h('section', { class: 'card' }, [
      h('div', { class: 'card-head' }, [
        h('span', { 'data-ic': 'chart', 'aria-hidden': 'true' }),
        h('h3', {}, `أين تروح فلوسك في ${monthLabel(mk, fd).split(' ')[0]}`)
      ]),
      host
    ]));
    requestAnimationFrame(() => hbars(host, items, { currency: cur, maxItems: 5 }));
  }

  /* ---------- smart analysis ---------- */
  const analysis = buildMonthAnalysis({
    transactions: s.transactions, accounts: s.accounts, categories: s.categories,
    budgets: s.budgets, monthKey: mk, lastMonthKey: prevMonthKey(mk), firstDay: fd, currency: cur
  });
  const topDay = topSpendingDay(s.transactions, mk, fd);
  const dAvg = dailyAverage(m.expense, daysElapsedInCycle(mk, fd));
  view.appendChild(h('section', { class: 'card' }, [
    h('div', { class: 'card-head' }, [
      h('span', { 'data-ic': 'spark', 'aria-hidden': 'true' }),
      h('h3', {}, `تحليل ${monthLabel(mk, fd)}`),
      h('span', { class: 'grow' }),
      h('a', { class: 'link-mini', href: '#/stats', onclick: (e) => { e.preventDefault(); ctx.nav('stats'); } }, 'كل الإحصائيات')
    ]),
    h('div', { class: 'grid grid-2', style: 'gap:8px;margin-bottom:12px' }, [
      sumRow('أكثر فئة صرفًا', top ? `${top.emoji} ${top.label}` : '—'),
      sumRow('أعلى يوم إنفاق', topDay ? `${dayLabel(topDay.date)} · ${fmtMoney(topDay.total, cur, { withUnit: false })}` : '—'),
      sumRow('متوسط الإنفاق اليومي', dAvg > 0 ? fmtMoney(dAvg, cur) : '—'),
      sumRow('عدد العمليات', String(countOfMonth(s.transactions, mk, fd)))
    ]),
    ...analysis.insights.slice(0, 3).map((ins) =>
      h('div', { class: `insight${ins.tip ? ' tip' : ''}` }, [
        h('span', { class: 'em', 'aria-hidden': 'true' }, ins.icon),
        h('span', { html: ins.text })
      ])
    )
  ]));

  paintIcons(view);
}

/* ---------- helpers ---------- */

function kpi(emoji, label, value, cls) {
  const color = { income: 'var(--income-soft)', expense: 'var(--expense-soft)', ok: 'var(--income-soft)', neg: 'var(--expense-soft)' }[cls] || 'var(--primary-soft)';
  const vColor = { expense: 'var(--expense)', neg: 'var(--expense)' }[cls] || '';
  return h('div', { class: 'kpi' }, [
    h('div', { class: 'kpi-ico', style: `background:${color}`, 'aria-hidden': 'true' }, emoji),
    h('div', { class: 'kpi-label' }, label),
    h('div', { class: 'kpi-value num', style: vColor ? `color:${vColor}` : '' }, value)
  ]);
}

function sumRow(label, value) {
  return h('div', { style: 'background:var(--surface-2);border-radius:12px;padding:9px 12px' }, [
    h('div', { style: 'font-size:11.5px;font-weight:800;color:var(--text-3)' }, label),
    h('div', { style: 'font-size:14px;font-weight:800;margin-top:1px' }, value)
  ]);
}

function catNameOf(ctx, id) { const c = ctx.state.categories.find((x) => x.id === id); return c ? c.name : 'أخرى'; }
function catEmojiOf(ctx, id) { const c = ctx.state.categories.find((x) => x.id === id); return c ? c.emoji : '📦'; }
function catColorOf(ctx, id) { const c = ctx.state.categories.find((x) => x.id === id); return c ? c.color : '#64748B'; }

function rangeFrom(monthKey, firstDay) {
  const [y, mo] = String(monthKey).split('-').map(Number);
  const s = new Date(y, mo - 1, firstDay || 1);
  const p = (n) => (n < 10 ? `0${n}` : String(n));
  return `${s.getFullYear()}-${p(s.getMonth() + 1)}-${p(s.getDate())}`;
}

function countOfMonth(txs, monthKey, firstDay) {
  let n = 0;
  for (const t of txs) if (monthKeyOf(t.date, firstDay) === monthKey) n++;
  return n;
}

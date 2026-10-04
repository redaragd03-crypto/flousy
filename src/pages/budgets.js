/* pages/budgets.js — الميزانيات */

import { h, clear, setProgress, paintIcons } from '../utils/dom.js';
import { monthTotals, totalsByCategory } from '../services/finance.js';
import { monthKeyOf, monthLabel, todayISO, daysElapsedInCycle, cycleDays, monthRange, rangeToISO } from '../utils/dates.js';
import { fmtMoney, fmtPct } from '../utils/format.js';
import { emptyState, openModal } from '../components/ui.js';
import { budgetModal } from '../components/modals.js';

export function render(ctx, view) {
  clear(view);
  const s = ctx.state;
  const cur = ctx.currency();
  const fd = ctx.firstDay();
  const mk = ctx.uiMonth;
  const m = monthTotals(s.transactions, mk, fd);
  const { from } = rangeToISO(monthRange(mk, fd));
  const spent = totalsByCategory(s.transactions, from, null);
  const elapsed = daysElapsedInCycle(mk, fd);
  const total = cycleDays(mk, fd);

  view.appendChild(h('div', { class: 'page-head' }, [
    h('div', {}, [
      h('h2', {}, 'الميزانيات'),
      h('div', { class: 'sub' }, `ملخص ${monthLabel(mk, fd)}${elapsed > 0 ? ` · مر ${elapsed} من ${total} يوم` : ''}`)
    ])
  ]));

  /* ---------- monthly overall budget ---------- */
  const totalBudget = s.budgets.find((b) => !b.categoryId && b.amount > 0);
  const r = totalBudget ? m.expense / totalBudget.amount : 0;
  const state = !totalBudget ? null :
    m.expense >= totalBudget.amount ? { cls: 'danger', label: 'تجاوزت' } :
    r >= 0.9 ? { cls: 'danger', label: 'اتقريب أوي' } :
    r >= 0.75 ? { cls: 'warn', label: 'تحذير' } :
    r >= 0.5 ? { cls: 'warn', label: 'منتصف' } : { cls: 'ok', label: 'مطمئن' };

  const totalCard = h('section', { class: 'card', style: 'border-color:var(--primary-soft)' }, [
    h('div', { class: 'card-head' }, [
      h('span', { style: 'font-size:22px' }, '🧮'),
      h('h3', {}, 'الميزانية الشهرية العامة'),
      h('span', { class: 'grow' }),
      totalBudget ? h('span', { class: `pill ${state.cls}` }, state.label) : h('span', { class: 'pill mute' }, 'مش مفعلة')
    ]),
    totalBudget
      ? h('div', {}, [
          h('div', { style: 'display:flex;align-items:baseline;gap:10px;flex-wrap:wrap' }, [
            h('span', { class: 'num', style: 'font-size:28px;font-weight:800' }, fmtMoney(m.expense, cur, { withUnit: false })),
            h('span', { style: 'color:var(--text-3);font-weight:700' }, `من ${fmtMoney(totalBudget.amount, cur, { withUnit: false })}`),
            h('span', { style: 'flex:1' }),
            h('span', { class: 'num', style: `font-weight:800;font-size:14px;color:${state.cls === 'ok' ? 'var(--income)' : state.cls === 'warn' ? 'var(--warn)' : 'var(--danger)'}` },
              m.expense >= totalBudget.amount ? `تجاوز بـ ${fmtMoney(m.expense - totalBudget.amount, cur, { withUnit: false })}` : `متبقي ${fmtMoney(totalBudget.amount - m.expense, cur, { withUnit: false })}`)
          ]),
          (() => { const p = h('div', { class: `progress ${state.cls}`, style: 'margin-top:12px;height:12px' }, h('i')); return p; })(),
          thresholds(totalBudget.amount, cur),
          h('div', { style: 'margin-top:14px;text-align:center' }, [
            h('button', { class: 'btn btn-soft btn-sm', onclick: () => budgetModal(ctx, { categoryId: null, initial: totalBudget }) }, 'تعديل الميزانية')
          ])
        ])
      : emptyState({
          emoji: '🧮', title: 'حدد ميزانية شهرية',
          text: 'حط سقف شهري لإنفاقك ونقولك إمتى تدخل منطقة التحذير (50%، 75%، 90%) وإمتى تتجاوز.',
          actionLabel: 'ضبط الميزانية', onAction: () => budgetModal(ctx, { categoryId: null }), card: false
        })
  ]);
  view.appendChild(totalCard);
  requestAnimationFrame(() => {
    const p = totalCard.querySelector('.progress');
    if (p && totalBudget) setProgress(p, r);
  });

  /* ---------- category budgets ---------- */
  const catBudgets = s.budgets.filter((b) => b.categoryId && b.amount > 0);
  view.appendChild(h('div', { class: 'section-title' }, [
    h('span', { 'data-ic': 'filter', 'aria-hidden': 'true' }),
    h('h3', { style: 'font-size:16.5px;font-weight:800' }, 'ميزانيات الفئات'),
    h('span', { class: 'grow' }),
    h('button', { class: 'btn btn-sm btn-ghost', onclick: () => pickCategoryBudget(ctx) }, '+ ميزانية فئة')
  ]));

  if (!catBudgets.length) {
    view.appendChild(emptyState({
      emoji: '📂', title: 'لسه مفيش ميزانيات فئات',
      text: 'قسم ميزانيتك للبطون اللي يهمك: طعام، مواصلات، ترفيه...',
      actionLabel: 'إضافة ميزانية فئة', onAction: () => pickCategoryBudget(ctx), card: true
    }));
    paintIcons(view);
    return;
  }

  const catEmoji = (id) => { const c = s.categories.find((x) => x.id === id); return c ? c.emoji : '📦'; };
  const catColor = (id) => { const c = s.categories.find((x) => x.id === id); return c ? c.color : '#64748B'; };

  const box = h('div', { class: 'stagger' });
  for (const b of catBudgets) {
    const used = spent.get(b.categoryId) || 0;
    const ratio = used / b.amount;
    const cls = ratio >= 1 ? 'danger' : ratio >= 0.9 ? 'danger' : ratio >= 0.75 ? 'warn' : 'ok';
    const bar = h('div', { class: 'progress', 'aria-hidden': 'true' }, h('i'));
    const card = h('section', { class: 'card' }, [
      h('div', { class: 'card-head', style: 'margin-bottom:10px' }, [
        h('span', { style: 'font-size:21px' }, catEmoji(b.categoryId)),
        h('h3', { style: 'font-size:15px' }, b.label),
        h('span', { class: 'grow' }),
        ratio >= 1
          ? h('span', { class: 'pill danger' }, `تجاوزت بـ ${fmtMoney(used - b.amount, cur, { withUnit: false })}`)
          : ratio >= 0.9
            ? h('span', { class: 'pill warn' }, 'اقتربت من الحد')
            : h('span', { class: 'pill ok' }, `متبقي ${fmtMoney(b.amount - used, cur, { withUnit: false })}`)
      ]),
      h('div', { style: 'display:flex;justify-content:space-between;font-size:12.5px;font-weight:800;color:var(--text-3);margin-bottom:5px' }, [
        h('span', {}, `المصروف ${fmtMoney(used, cur, { withUnit: false })} من ${fmtMoney(b.amount, cur, { withUnit: false })}`),
        h('span', { class: 'num' }, fmtPct(ratio))
      ]),
      bar,
      h('div', { style: 'margin-top:12px;display:flex;gap:8px' }, [
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => budgetModal(ctx, { categoryId: b.categoryId, initial: b }) }, 'تعديل'),
        h('button', {
          class: 'btn btn-ghost btn-sm', style: 'color:var(--danger)',
          onclick: async () => { await ctx.delBudget(b.id); ctx.refresh(); }
        }, 'حذف')
      ])
    ]);
    box.appendChild(card);
    requestAnimationFrame(() => requestAnimationFrame(() => setProgress(bar, ratio, cls)));
  }
  view.appendChild(box);

  view.appendChild(h('p', { class: 'foot-note' },
    'الحالة: 🟢 مطمئن أقل من 75% · 🟡 تحذير من 75% · 🔴 تجاوز عند 100%. الميزانيات شهرية وبتتصفى تلقائيًا كل شهر جديد.'));
  paintIcons(view);
}

function thresholds(budget, cur) {
  return h('div', { style: 'display:flex;justify-content:space-between;margin-top:8px' },
    [0.5, 0.75, 0.9, 1].map((p) =>
      h('span', { style: 'font-size:10.5px;font-weight:800;color:var(--text-3)' }, `${fmtPct(p)} · ${fmtMoney(budget * p, cur, { withUnit: false })}`)
    ));
}

function pickCategoryBudget(ctx) {
  const cats = ctx.state.categories.filter((c) => c.type === 'expense');
  let api;
  api = openPick({
    items: cats.map((c) => ({ id: c.id, label: `${c.emoji} ${c.name}` })),
    onPick: (id) => {
      const existing = ctx.state.budgets.find((b) => b.categoryId === id);
      budgetModal(ctx, { categoryId: id, initial: existing || null });
    }
  });
}

function openPick({ items, onPick }) {
  let api;
  api = openModal({
    title: 'اختار الفئة',
    icon: '📂',
    body: () => h('div', {}, items.map((it) =>
      h('button', {
        class: 'sheet-item', style: 'width:100%',
        onclick: () => { api.close(); onPick(it.id); }
      }, it.label)
    )),
    foot: null
  });
  return api;
}

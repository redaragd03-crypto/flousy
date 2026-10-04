/* pages/bills.js — الفواتير والالتزامات + المصروفات المتكررة */

import { h, clear, paintIcons } from '../utils/dom.js';
import { todayISO, parseISO, toISODate, daysBetween, relDayLabel, dayLabel, addDays } from '../utils/dates.js';
import { fmtMoney, parseAmount } from '../utils/format.js';
import { emptyState, openModal, confirmDialog, toast } from '../components/ui.js';
import { billModal, recurringModal } from '../components/modals.js';
import { freqLabel } from '../services/recurring.js';

export function render(ctx, view) {
  clear(view);
  const s = ctx.state;
  const cur = ctx.currency();
  const today = todayISO();

  view.appendChild(h('div', { class: 'page-head' }, [
    h('div', {}, [
      h('h2', {}, 'الالتزامات'),
      h('div', { class: 'sub' }, 'فواتير واشتراكات لازم تدفعها في ميعادها')
    ]),
    h('button', { class: 'btn btn-primary', onclick: () => billModal(ctx) }, ['+', 'التزام جديد'])
  ]));

  /* ---------- bills ---------- */
  const bills = [...(s.bills || [])].map((b) => ({ b, due: billDueISO(b, today), diff: daysBetween(today, billDueISO(b, today)) }))
    .sort((a, z) => (a.b.paid ? 1 : 0) - (z.b.paid ? 1 : 0) || a.diff - z.diff);

  if (!bills.length) {
    view.appendChild(emptyState({
      emoji: '🧾', title: 'لسه مفيش التزامات',
      text: 'أضف فاتورة الكهرباء، الإيجار، الإنترنت... ونقولك قبل الموعد بيومين.',
      actionLabel: 'إضافة أول التزام', onAction: () => billModal(ctx), card: true
    }));
  } else {
    const unpaid = bills.filter((x) => !x.b.paid).length;
    const nextWeek = bills.filter((x) => !x.b.paid && x.diff >= 0 && x.diff <= 7).reduce((a, x) => a + x.b.amount, 0);
    view.appendChild(h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px' }, [
      h('span', { class: 'chip-badge' }, `${unpaid} مستحقة`),
      nextWeek > 0 ? h('span', { class: 'chip-badge', style: 'color:var(--warn);background:var(--warn-soft)' }, `‏${fmtMoney(nextWeek, cur)} في أول 7 أيام`) : null
    ]));
    view.appendChild(h('div', { class: 'stagger' },
      bills.map(({ b, due, diff }) => billCard(ctx, b, due, diff, cur, today))
    ));
  }

  /* ---------- recurring ---------- */
  view.appendChild(h('div', { class: 'section-title' }, [
    h('span', { 'data-ic': 'repeat', 'aria-hidden': 'true' }),
    h('h3', {}, 'المصروفات المتكررة'),
    h('span', { class: 'grow' }),
    h('button', { class: 'btn btn-sm btn-ghost', onclick: () => recurringModal(ctx) }, '+ متكرر')
  ]));

  const recs = s.recurring || [];
  if (!recs.length) {
    view.appendChild(h('div', { class: 'card' }, [
      h('p', { style: 'font-size:13.5px;color:var(--text-3);font-weight:600;text-align:center;padding:10px' },
        'مفيش مصروفات متكررة. أضف اشتراك شهري (نتفليكس، صالات، إنترنت) والتطبيق هيولّده تلقائيًا في ميعاده.')
    ]));
  } else {
    view.appendChild(h('div', { class: 'stagger' }, recs.map((r) => {
      const cat = s.categories.find((c) => c.id === r.categoryId);
      const nextISO = r.nextDueDate;
      const diff = nextISO ? daysBetween(today, nextISO) : null;
      return h('div', { class: 'rec' }, [
        h('div', { class: 'rec-ico', 'aria-hidden': 'true' }, cat ? cat.emoji : '🔁'),
        h('div', { style: 'min-width:0' }, [
          h('div', { class: 'rec-name' }, r.name),
          h('div', { class: 'rec-sub' },
            `${freqLabel(r.frequency)} · ${cat ? cat.name : '—'} · التالي: ${nextISO ? dayLabel(nextISO) : '—'}${diff != null && diff >= 0 && diff <= 14 ? ` (بعد ${diff === 0 ? 'يوم' : diff === 1 ? 'يوم' : diff + ' أيام'})` : ''}`)
        ]),
        h('div', { style: 'display:flex;flex-direction:column;align-items:end;gap:6px' }, [
          h('span', { class: 'rec-amt num' }, fmtMoney(r.amount, cur, { withUnit: false })),
          h('div', { style: 'display:flex;gap:5px' }, [
            h('button', {
              class: 'btn btn-sm', style: `min-height:28px;padding:2px 10px;font-size:11.5px;${r.active ? 'background:var(--income-soft);color:var(--income)' : 'background:var(--surface-2);color:var(--text-3)'}`,
              onclick: async () => { await ctx.putRec({ ...r, active: !r.active }); ctx.refresh(); toast(r.active ? 'أوقفنا التوليد' : 'عاد التوليد التلقائي', { emoji: r.active ? '⏸️' : '▶️' }); }
            }, r.active ? 'مفعّل' : 'موقوف'),
            h('button', { class: 'icon-btn', style: 'width:32px;height:32px', 'aria-label': 'تعديل', onclick: () => recurringModal(ctx, { initial: r }) }, h('span', { 'data-ic': 'edit' })),
            h('button', {
              class: 'icon-btn', style: 'width:32px;height:32px;color:var(--danger)', 'aria-label': 'حذف',
              onclick: async () => {
                const ok = await confirmDialog({ title: 'حذف المتكرر', message: `تحذف «${r.name}»؟`, confirmLabel: 'حذف', danger: true, emoji: '🗑️' });
                if (ok) { await ctx.delRec(r.id); ctx.refresh(); toast('تم الحذف', { emoji: '🗑️' }); }
              }
            }, h('span', { 'data-ic': 'trash' }))
          ])
        ])
      ]);
    })));
  }

  paintIcons(view);
}

function billCard(ctx, b, dueISO, diff, cur, today) {
  const state = b.paid ? 'paid' : diff < 0 ? 'overdue' : diff <= 2 ? 'soon' : 'ok';
  let dueLabel;
  if (b.paid) dueLabel = 'تم الدفع ✓';
  else if (diff < 0) dueLabel = `متأخرة منذ ${Math.abs(diff) === 1 ? 'يوم' : Math.abs(diff) === 2 ? 'يومين' : Math.abs(diff) + ' أيام'} (${dayLabel(dueISO)})`;
  else if (diff === 0) dueLabel = 'مستحقة اليوم!';
  else dueLabel = `موعد الدفع ${relDayLabel(dueISO)} (${dayLabel(dueISO)})`;

  const main = h('div', { style: 'min-width:0' }, [
    h('div', { class: 'bill-name' }, b.name),
    h('div', { class: 'bill-due' }, [
      h('span', { 'data-ic': 'clock', 'aria-hidden': 'true' }),
      h('span', {}, dueLabel)
    ])
  ]);
  const actions = h('div', { class: 'bill-actions' });
  main.appendChild(actions);

  const card = h('div', { class: `bill ${b.paid ? 'paid' : diff < 0 ? 'overdue' : ''}` }, [
    h('div', { class: 'bill-ico', 'aria-hidden': 'true' }, b.emoji || '🧾'),
    main,
    h('div', { class: 'bill-amt num' }, [
      fmtMoney(b.amount, cur, { withUnit: false }),
      h('span', { class: 'unit' }, ctx.unit())
    ])
  ]);

  if (b.paid) {
    actions.appendChild(h('button', {
      class: 'btn btn-ghost btn-sm',
      onclick: async () => {
        await ctx.putBill({ ...b, paid: false, paidDate: null });
        ctx.refresh();
        toast('رجّعناها لمستحقة (العملية نفسها لسه موجودة)', { emoji: '↩️', type: 'info' });
      }
    }, 'إلغاء الدفع'));
  } else {
    actions.appendChild(h('button', {
      class: `btn btn-sm ${state === 'overdue' ? 'btn-danger' : 'btn-soft'}`,
      onclick: () => payBill(ctx, b)
    }, 'دفع الآن'));
    actions.appendChild(h('button', {
      class: 'btn btn-ghost btn-sm', onclick: () => billModal(ctx, { initial: b })
    }, 'تعديل'));
  }
  return card;
}

function payBill(ctx, b) {
  const cur = ctx.currency();
  const s = ctx.state;
  const accts = s.accounts.filter((a) => a.active !== false);
  const acctSel = h('select', { class: 'inp' }, accts.map((a) =>
    h('option', { value: a.id, selected: a.id === (b.accountId || s.settings.lastAccount || accts[0]?.id) }, `${a.emoji} ${a.name}`)
  ));
  const descInp = h('input', { class: 'inp', value: `دفع ${b.name}`, maxlength: 80 });

  let api;
  api = openModal({
    title: `دفع «${b.name}»`,
    icon: b.emoji || '💳',
    body: () => h('div', {}, [
      h('div', { style: 'text-align:center;background:var(--surface-2);border-radius:16px;padding:14px;margin-bottom:14px' }, [
        h('div', { style: 'font-size:12.5px;font-weight:800;color:var(--text-3)' }, 'المبلغ'),
        h('div', { class: 'num', style: 'font-size:28px;font-weight:800' }, fmtMoney(b.amount, cur))
      ]),
      h('div', { class: 'field' }, [h('label', {}, 'الحساب'), acctSel]),
      h('div', { class: 'field' }, [h('label', {}, 'وصف العملية'), descInp])
    ]),
    foot: () => [h('button', {
      class: 'btn btn-primary btn-block',
      onclick: async () => {
        const accountId = acctSel.value || accts[0]?.id;
        if (!accountId) { toast('اختار حساب', { type: 'err', emoji: '⚠️' }); return; }
        if (ctx.balanceOf(accountId) < b.amount) {
          toast(`الرصيد في الحساب مش كافي (${fmtMoney(ctx.balanceOf(accountId), cur, { withUnit: false })} متاحة)`, { type: 'err', emoji: '⚠️' });
          return;
        }
        const ts = Date.now();
        await ctx.putTx({
          id: (crypto.randomUUID ? crypto.randomUUID() : `id-${ts}`),
          type: 'expense', amount: b.amount,
          categoryId: b.categoryId || 'cat-bills',
          accountId, date: todayISO(),
          description: descInp.value.trim() || `دفع ${b.name}`,
          notes: '', paymentMethod: 'card', recurringId: null,
          createdAt: ts, updatedAt: ts
        });
        await ctx.putBill({ ...b, paid: true, paidDate: todayISO() });
        await ctx.setSettings({ lastAccount: accountId });
        api.close();
        ctx.refresh();
        toast(`اتدفع ${b.name} بنجاح`, { emoji: '✅' });
      }
    }, 'تأكيد الدفع')]
  });
}

/** Next/last due ISO for a bill: accounts for paid state. */
export function billDueISO(b, today) {
  const t = parseISO(today) || new Date();
  let due = new Date(t.getFullYear(), t.getMonth(), b.dueDay || 1);
  const paidThisMonth = b.paid && b.paidDate && (() => {
    const p = parseISO(b.paidDate);
    return p && p.getMonth() === t.getMonth() && p.getFullYear() === t.getFullYear();
  })();
  if (paidThisMonth) {
    due = new Date(t.getFullYear(), t.getMonth() + 1, b.dueDay || 1);
  }
  // Note: JS auto-clamps e.g. Feb 31 -> Mar 2/3, which is fine for display.
  return toISODate(due);
}

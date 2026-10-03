/* pages/operations.js — سجل العمليات: بحث، فلاتر، ترتيب، Timeline */

import { h, clear, debounce, paintIcons, $ } from '../utils/dom.js';
import { groupLabel } from '../utils/dates.js';
import { normalizeDigits, fmtMoney, parseAmount } from '../utils/format.js';
import { emptyState, openModal, confirmDialog, toast } from '../components/ui.js';
import { addTxModal } from '../components/modals.js';

const PAGE = 80;

export function render(ctx, view) {
  clear(view);
  const f = ctx.opsFilter;
  const accts = ctx.state.accounts;
  const cats = ctx.state.categories;

  const qInp = h('input', {
    class: 'search-in', type: 'search',
    placeholder: 'ابحث: مطعم، راتب، Uber، كهرباء...',
    value: f.q, 'aria-label': 'بحث في العمليات'
  });
  qInp.addEventListener('input', debounce((e) => {
    f.q = e.target.value.trim();
    renderBody(ctx, view, f, { keepScroll: true });
  }, 220));

  view.appendChild(qInp);

  /* filter chips */
  const typeChips = [
    { id: 'all', label: 'الكل' },
    { id: 'expense', label: '💸 مصروف' },
    { id: 'income', label: '💰 دخل' },
    { id: 'transfer', label: '🔄 تحويل' }
  ];
  const chipsBox = h('div', { class: 'filter-bar', role: 'tablist' });
  const sortOpts = [
    { id: 'new', label: 'الأحدث' },
    { id: 'old', label: 'الأقدم' },
    { id: 'high', label: 'الأعلى' },
    { id: 'low', label: 'الأقل' }
  ];
  for (const t of typeChips.concat(sortOpts)) {
    const isType = typeChips.includes(t);
    const active = isType ? f.type === t.id : f.sort === t.id;
    chipsBox.appendChild(h('button', {
      class: `fchip${active ? ' active' : ''}`, 'aria-pressed': String(active),
      onclick: () => {
        if (isType) f.type = t.id;
        else f.sort = t.id;
        renderBody(ctx, view, f);
      }
    }, t.label));
  }

  const hasExtraFilters = !!(f.cat || f.acct || f.from || f.to || f.min || f.max);
  chipsBox.appendChild(h('button', {
    class: `fchip${hasExtraFilters ? ' active' : ''}`,
    onclick: () => openFiltersModal(ctx, f)
  }, [
    h('span', { 'data-ic': 'filter', 'aria-hidden': 'true' }),
    h('span', {}, hasExtraFilters ? 'الفلاتر مفعلة' : 'فلاتر')
  ]));

  view.appendChild(chipsBox);

  const body = h('div', { class: 'ops-body' });
  view.appendChild(body);
  renderBody(ctx, view, f, { bodyEl: body });
  paintIcons(view);
}

export function renderBody(ctx, view, f, { bodyEl = null } = {}) {
  const host = bodyEl || view.querySelector('.ops-body');
  if (!host) return;
  clear(host);
  const cur = ctx.currency();
  const accts = ctx.state.accounts;
  const cats = ctx.state.categories;

  const catName = (id) => { const c = cats.find((x) => x.id === id); return c ? c.name : ''; };
  const catEmoji = (id) => { const c = cats.find((x) => x.id === id); return c ? c.emoji : '📦'; };
  const catColor = (id) => { const c = cats.find((x) => x.id === id); return c ? c.color : '#64748B'; };
  const accName = (id) => { const a = accts.find((x) => x.id === id); return a ? a.name : '—'; };
  const accEmoji = (id) => { const a = accts.find((x) => x.id === id); return a ? a.emoji : '💳'; };

  /* ---- filter + sort ---- */
  let list = ctx.state.transactions.filter((t) => t.amount > 0 && t.date);
  if (f.type !== 'all') list = list.filter((t) => t.type === f.type);
  if (f.cat) list = list.filter((t) => t.categoryId === f.cat);
  if (f.acct) list = list.filter((t) => t.accountId === f.acct || t.toAccountId === f.acct);
  if (f.from) list = list.filter((t) => t.date >= f.from);
  if (f.to) list = list.filter((t) => t.date <= f.to);
  if (f.min != null) list = list.filter((t) => t.amount >= f.min);
  if (f.max != null) list = list.filter((t) => t.amount <= f.max);
  if (f.q) {
    const q = normalizeDigits(f.q).toLowerCase();
    list = list.filter((t) => {
      const hay = [t.description, t.notes, catName(t.categoryId), accName(t.accountId), accName(t.toAccountId)].filter(Boolean).join(' ');
      return normalizeDigits(hay).toLowerCase().includes(q);
    });
  }

  const sorters = {
    new: (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)),
    old: (a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : (a.createdAt || 0) - (b.createdAt || 0)),
    high: (a, b) => b.amount - a.amount || (a.date < b.date ? 1 : -1),
    low: (a, b) => a.amount - b.amount || (a.date < b.date ? 1 : -1)
  };
  list.sort(sorters[f.sort] || sorters.new);

  /* ---- totals of filtered ---- */
  let inc = 0, exp = 0;
  for (const t of list) { if (t.type === 'income') inc += t.amount; else if (t.type === 'expense') exp += t.amount; }

  if (!list.length) {
    host.appendChild(emptyState({
      emoji: f.q ? '🔍' : '🧾',
      title: f.q ? `مفيش نتائج عن «${f.q}»` : 'لسه مفيش عمليات',
      text: f.q ? 'جرب كلمة تانية، أو شيل بعض الفلاتر.' : 'ابدأ بإضافة أول مصروف ليك.',
      actionLabel: f.q ? null : 'إضافة أول مصروف',
      onAction: f.q ? undefined : () => addTxModal(ctx, { type: 'expense' }),
      card: true
    }));
    return;
  }

  /* ---- summary strip ---- */
  host.appendChild(h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px' }, [
    h('span', { class: 'chip-badge', style: 'font-size:12.5px' }, `${list.length.toLocaleString('en-US').replace(/,/g, '٬')} عملية`),
    inc ? h('span', { class: 'chip-badge', style: 'color:var(--income);background:var(--income-soft)' }, `↑ ${fmtMoney(inc, cur, { withUnit: false })} دخل`) : null,
    exp ? h('span', { class: 'chip-badge', style: 'color:var(--expense);background:var(--expense-soft)' }, `↓ ${fmtMoney(exp, cur, { withUnit: false })} مصروف`) : null
  ]));

  /* ---- group by date ---- */
  const shown = list.slice(0, PAGE);
  const groups = new Map();
  for (const t of shown) {
    const g = groupLabel(t.date);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
  }

  let shownCount = 0;
  for (const [label, items] of groups) {
    const gInc = items.filter((t) => t.type === 'income').reduce((a, b) => a + b.amount, 0);
    const gExp = items.filter((t) => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
    host.appendChild(h('div', { class: 'tx-group-label' }, [
      h('span', {}, label),
      h('span', { class: 'line', 'aria-hidden': 'true' }),
      h('span', { class: 'sum' }, gInc && gExp ? `+${fmtMoney(gInc, cur, { withUnit: false })} / −${fmtMoney(gExp, cur, { withUnit: false })}` : gInc ? `+${fmtMoney(gInc, cur, { withUnit: false })}` : gExp ? `−${fmtMoney(gExp, cur, { withUnit: false })}` : '')
    ]));
    const listEl = h('div', { class: 'tx-list' });
    for (const t of items) {
      shownCount++;
      listEl.appendChild(txRow(ctx, t, { catName, catEmoji, catColor, accName, accEmoji, cur }));
    }
    host.appendChild(listEl);
  }

  if (list.length > shownCount) {
    host.appendChild(h('div', { style: 'text-align:center;padding:14px' }, [
      h('button', {
        class: 'btn btn-ghost',
        onclick: () => { ctx.opsFilter.limit = (ctx.opsFilter.limit || PAGE) + PAGE; renderBody(ctx, view, f); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      }, `عرض المزيد (${list.length - shownCount} عملية)`)
    ]));
  }
}

function txRow(ctx, t, { catName, catEmoji, catColor, accName, accEmoji, cur }) {
  const isTransfer = t.type === 'transfer';
  const icon = isTransfer ? accEmoji(t.accountId) : catEmoji(t.categoryId);
  const title = t.description || (isTransfer ? 'تحويل بين الحسابات' : catName(t.categoryId));
  const sub = isTransfer
    ? `${accName(t.accountId)} ← ${accName(t.toAccountId)}`
    : `${accName(t.accountId)}${t.date ? '' : ''}`;
  const amtCls = t.type === 'income' ? 'income' : t.type === 'transfer' ? 'transfer' : 'expense';
  const sign = t.type === 'income' ? '+' : t.type === 'transfer' ? '' : '−';

  return h('div', {
    class: 'tx', role: 'button', tabindex: '0',
    'aria-label': `${t.type === 'income' ? 'دخل' : t.type === 'transfer' ? 'تحويل' : 'مصروف'} ${fmtMoney(t.amount, cur)} — ${title}`,
    onclick: () => txDetail(ctx, t),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); txDetail(ctx, t); } }
  }, [
    h('div', { class: 'tx-ico', style: `background:${isTransfer ? 'var(--transfer-soft)' : hexToSoft(catColor(t.categoryId))}`, 'aria-hidden': 'true' }, [
      icon,
      isTransfer ? h('span', { class: 'tx-dot', 'aria-hidden': 'true' }, '⇄') : null
    ]),
    h('div', { class: 'tx-main' }, [
      h('div', { class: 'tx-title' }, title || '—'),
      h('div', { class: 'tx-sub' }, sub)
    ]),
    h('div', { class: `tx-amount num ${amtCls}` }, [
      sign ? h('span', {}, sign + ' ') : null,
      fmtMoney(t.amount, cur, { withUnit: false }),
      h('span', { class: 'unit' }, ctx.unit())
    ])
  ]);
}

export function txDetail(ctx, t) {
  const cur = ctx.currency();
  const cats = ctx.state.categories;
  const accts = ctx.state.accounts;
  const cat = cats.find((c) => c.id === t.categoryId);
  const acc = accts.find((a) => a.id === t.accountId);
  const toAcc = accts.find((a) => a.id === t.toAccountId);
  const payLabel = { cash: 'نقدي', card: 'بطاقة', wallet: 'محفظة', transfer: 'تحويل', credit: 'آجل' }[t.paymentMethod] || '—';

  let api;
  api = openModal({
    title: t.type === 'income' ? 'تفاصيل الدخل' : t.type === 'transfer' ? 'تفاصيل التحويل' : 'تفاصيل المصروف',
    icon: t.type === 'transfer' ? '🔄' : (cat ? cat.emoji : '📦'),
    body: () => h('div', {}, [
      h('div', {
        style: 'text-align:center;padding:18px 0 20px;position:relative'
      }, [
        h('div', {
          style: `width:64px;height:64px;margin:0 auto 10px;border-radius:22px;display:grid;place-items:center;font-size:30px;background:${t.type === 'transfer' ? 'var(--transfer-soft)' : hexToSoft(cat ? cat.color : '#64748B')}`
        }, t.type === 'transfer' ? '🔄' : (cat ? cat.emoji : '📦')),
        h('div', { class: 'num', style: `font-size:34px;font-weight:800;color:${t.type === 'income' ? 'var(--income)' : t.type === 'transfer' ? 'var(--transfer)' : 'var(--text)'}` },
          `${t.type === 'income' ? '+' : t.type === 'transfer' ? '' : '−'}${fmtMoney(t.amount, cur, { withUnit: false })} ${ctx.unit()}`),
        h('div', { style: 'font-size:13px;color:var(--text-3);font-weight:700;margin-top:4px' }, t.description || (cat ? cat.name : ''))
      ]),
      h('div', { class: 'set-group' }, [
        row('الفئة', t.type === 'transfer' ? '—' : (cat ? `${cat.emoji} ${cat.name}` : '—')),
        row('الحساب', acc ? `${acc.emoji} ${acc.name}` : '—'),
        ...(t.type === 'transfer' ? [row('إلى', toAcc ? `${toAcc.emoji} ${toAcc.name}` : '—')] : []),
        row('التاريخ', new Date(t.date + 'T00:00:00').toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })),
        ...(t.type !== 'transfer' ? [row('طريقة الدفع', payLabel)] : []),
        ...(t.notes ? [row('ملاحظات', t.notes)] : []),
        ...(t.recurringId ? [row('مصروف متكرر', 'تولّد تلقائيًا من تكرار دوري')] : [])
      ])
    ]),
    foot: () => [
      h('button', { class: 'btn btn-ghost', style: 'flex:none;padding-inline:16px', onclick: async () => {
        const ok = await confirmDialog({ title: 'حذف العملية', message: 'متأكد إنك هتحذف العملية دي؟', confirmLabel: 'حذف', danger: true, emoji: '🗑️' });
        if (ok) { ctx.delTx(t.id); api.close(); ctx.refresh(); toast('تم حذف العملية', { emoji: '🗑️' }); }
      } }, 'حذف'),
      h('button', {
        class: 'btn btn-primary',
        onclick: () => { api.close(); addTxModal(ctx, { type: t.type === 'transfer' ? 'expense' : t.type, initial: t }); }
      }, 'تعديل')
    ]
  });
}

function row(label, value) {
  return h('div', { class: 'set-row' }, [
    h('div', { style: 'width:92px;flex:none;font-size:13px;font-weight:800;color:var(--text-3)' }, label),
    h('div', { style: 'font-size:14px;font-weight:700' }, String(value ?? '—'))
  ]);
}

/* ---------- filters modal ---------- */

export function openFiltersModal(ctx, f) {
  const cur = ctx.currency();
  const cats = ctx.state.categories;
  const accts = ctx.state.accounts;

  const catSel = h('select', { class: 'inp' }, [
    h('option', { value: '', selected: !f.cat }, 'كل الفئات'),
    ...cats.map((c) => h('option', { value: c.id, selected: f.cat === c.id }, `${c.emoji} ${c.name}`))
  ]);
  const acctSel = h('select', { class: 'inp' }, [
    h('option', { value: '', selected: !f.acct }, 'كل الحسابات'),
    ...accts.map((a) => h('option', { value: a.id, selected: f.acct === a.id }, `${a.emoji} ${a.name}`))
  ]);
  const fromInp = h('input', { class: 'inp', type: 'date', value: f.from || '' });
  const toInp = h('input', { class: 'inp', type: 'date', value: f.to || '' });
  const minInp = h('input', { class: 'inp', type: 'text', inputmode: 'decimal', value: f.min != null ? String(f.min) : '', placeholder: '0' });
  const maxInp = h('input', { class: 'inp', type: 'text', inputmode: 'decimal', value: f.max != null ? String(f.max) : '', placeholder: 'غير محدود' });

  let api;
  api = openModal({
    title: 'فلاتر العمليات',
    icon: '🧰',
    body: () => h('div', {}, [
      h('div', { class: 'field' }, [h('label', {}, 'الفئة'), catSel]),
      h('div', { class: 'field' }, [h('label', {}, 'الحساب'), acctSel]),
      h('div', { class: 'field' }, [
        h('label', {}, 'النطاق التاريخي'),
        h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' }, [
          h('div', { style: 'display:grid;gap:5px' }, [h('div', { style: 'font-size:12px;font-weight:700;color:var(--text-3)' }, 'من تاريخ'), fromInp]),
          h('div', { style: 'display:grid;gap:5px' }, [h('div', { style: 'font-size:12px;font-weight:700;color:var(--text-3)' }, 'إلى تاريخ'), toInp])
        ])
      ]),
      h('div', { class: 'field' }, [
        h('label', {}, 'المبلغ'),
        h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' }, [
          h('div', { style: 'display:grid;gap:5px' }, [h('div', { style: 'font-size:12px;font-weight:700;color:var(--text-3)' }, 'من مبلغ'), minInp]),
          h('div', { style: 'display:grid;gap:5px' }, [h('div', { style: 'font-size:12px;font-weight:700;color:var(--text-3)' }, 'إلى مبلغ'), maxInp])
        ])
      ])
    ]),
    foot: () => [
      h('button', {
        class: 'btn btn-ghost',
        onclick: () => {
          f.cat = f.acct = f.from = f.to = null; f.min = f.max = null;
          api.close(); ctx.refresh();
        }
      }, 'مسح الفلاتر'),
      h('button', {
        class: 'btn btn-primary',
        onclick: () => {
          f.cat = catSel.value || null;
          f.acct = acctSel.value || null;
          f.from = fromInp.value || null;
          f.to = toInp.value || null;
          f.min = parseAmount(minInp.value) ?? null;
          f.max = parseAmount(maxInp.value) ?? null;
          api.close(); ctx.refresh();
        }
      }, 'تطبيق')
    ]
  });
  return api;
}

/* ---------- shared helpers ---------- */

export function hexToSoft(hex, alpha = 0.13) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 'var(--primary-soft)';
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

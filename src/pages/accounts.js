/* pages/accounts.js — حساباتي */

import { h, clear, paintIcons } from '../utils/dom.js';
import { accountStats } from '../services/finance.js';
import { fmtMoney, fmtPct } from '../utils/format.js';
import { groupLabel } from '../utils/dates.js';
import { emptyState, openModal, confirmDialog, toast } from '../components/ui.js';
import { accountModal, transferModal } from '../components/modals.js';
import { hexToSoft } from './operations.js';

const TYPE_LABEL = { cash: 'نقدي', bank: 'حساب بنكي', card: 'بطاقة', wallet: 'محفظة', custom: 'مخصص' };

export function render(ctx, view) {
  clear(view);
  const s = ctx.state;
  const cur = ctx.currency();
  const stats = accountStats(s.accounts, s.transactions);
  const total = stats.reduce((a, b) => a + b.balance, 0);

  view.appendChild(h('div', { class: 'page-head' }, [
    h('div', {}, [
      h('h2', {}, 'حساباتي'),
      h('div', { class: 'sub' }, `الرصيد الإجمالي: ${fmtMoney(total, cur)}`)
    ]),
    h('button', { class: 'btn btn-primary', onclick: () => accountModal(ctx) }, ['+', 'حساب جديد'])
  ]));

  if (!s.accounts.length) {
    view.appendChild(emptyState({
      emoji: '🏦', title: 'لسه مفيش حسابات',
      text: 'أضف أول حساب (كاش، بنكي، محفظة) عشان نبدأ نوزع العمليات عليه.',
      actionLabel: 'إضافة حساب', onAction: () => accountModal(ctx), card: true
    }));
    paintIcons(view);
    return;
  }

  const list = h('div', { class: 'stagger' });
  for (const st of stats) {
    const a = st.account;
    const bal = st.balance;
    list.appendChild(h('div', {
      class: 'acct', role: 'button', tabindex: '0',
      'aria-label': `حساب ${a.name} — الرصيد ${fmtMoney(bal, cur)}`,
      onclick: () => accountDetail(ctx, a, st),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); accountDetail(ctx, a, st); } }
    }, [
      h('div', { class: 'acct-ico', style: `background:${hexToSoft(a.color)}`, 'aria-hidden': 'true' }, a.emoji || '💳'),
      h('div', {}, [
        h('div', { class: 'acct-name' }, a.name),
        h('div', { class: 'acct-sub' }, `${TYPE_LABEL[a.type] || 'مخصص'} · ${st.txCount} عملية`)
      ]),
      h('div', { class: `acct-balance num${bal < 0 ? ' neg' : ''}` }, [
        fmtMoney(bal, cur, { withUnit: false }),
        h('span', { class: 'unit' }, ctx.unit())
      ])
    ]));
  }
  view.appendChild(list);

  view.appendChild(h('div', { style: 'text-align:center;margin-top:18px' }, [
    h('button', { class: 'btn btn-ghost', onclick: () => transferModal(ctx) }, ['🔄', 'تحويل بين الحسابات'])
  ]));
  view.appendChild(h('p', { class: 'foot-note' },
    'الرصيد بيتحدث تلقائيًا مع كل عملية: الدخل بيزيد، والمصروف بينقص، والتحويل بيصل من حساب للتاني من غير ما يتحسب مصروف.'));
  paintIcons(view);
}

function accountDetail(ctx, acct, st) {
  const cur = ctx.currency();
  const s = ctx.state;
  const cats = s.categories;
  const total = s.transactions.filter((t) => t.accountId === acct.id || t.toAccountId === acct.id).length;
  const myTxs = s.transactions
    .filter((t) => t.accountId === acct.id || t.toAccountId === acct.id)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt || 0) - (a.createdAt || 0)))
    .slice(0, 25);

  const catName = (id) => { const c = cats.find((x) => x.id === id); return c ? `${c.emoji} ${c.name}` : '—'; };
  const accName = (id) => { const a = s.accounts.find((x) => x.id === id); return a ? a.name : '—'; };

  let api;
  api = openModal({
    title: `${acct.emoji} ${acct.name}`,
    icon: '👛',
    body: () => h('div', {}, [
      h('div', {
        style: 'text-align:center;padding:14px;background:var(--surface-2);border-radius:16px;margin-bottom:14px'
      }, [
        h('div', { style: 'font-size:12.5px;font-weight:800;color:var(--text-3)' }, 'الرصيد الحالي'),
        h('div', { class: 'num', style: `font-size:32px;font-weight:800;margin-top:2px;color:${st.balance < 0 ? 'var(--expense)' : 'var(--text)'}` },
          `${fmtMoney(st.balance, cur, { withUnit: false })} ${ctx.unit()}`),
        h('div', { style: 'font-size:12px;font-weight:700;color:var(--text-3);margin-top:4px' },
          `${total} عملية · ${TYPE_LABEL[acct.type] || 'مخصاص'}${Number(acct.openingBalance) ? ` · رصيد افتتاحي ${fmtMoney(acct.openingBalance, cur, { withUnit: false })}` : ''}`)
      ]),
      h('div', { style: 'font-size:13px;font-weight:800;color:var(--text-3);margin-bottom:6px' }, 'آخر العمليات'),
      ...myTxs.map((t) => {
        const isOut = t.accountId === acct.id;
        const sign = t.type === 'income' && isOut ? '+' : t.type === 'transfer' ? (isOut ? '−' : '+') : isOut ? '−' : '+';
        const color = t.type === 'income' && isOut ? 'var(--income)' : t.type === 'transfer' ? 'var(--transfer)' : 'var(--text)';
        return h('div', { style: 'display:flex;align-items:center;gap:10px;padding:8px 2px;border-bottom:1px dashed var(--border)' }, [
          h('span', { style: 'font-size:17px' }, t.type === 'transfer' ? '🔄' : (cats.find((c) => c.id === t.categoryId)?.emoji || '📦')),
          h('div', { style: 'flex:1;min-width:0' }, [
            h('div', { style: 'font-size:13.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' },
              t.description || catName(t.categoryId)),
            h('div', { style: 'font-size:11.5px;color:var(--text-3);font-weight:700' },
              t.type === 'transfer' ? (isOut ? `إلى ${accName(t.toAccountId)}` : `من ${accName(t.toAccountId)}`) : groupLabel(t.date))
          ]),
          h('span', { class: 'num', style: `font-weight:800;font-size:14px;color:${color}`, dir: 'ltr' },
            `${sign}${fmtMoney(t.amount, cur, { withUnit: false })}`)
        ]);
      }),
      myTxs.length === 0 ? h('div', { style: 'text-align:center;color:var(--text-3);font-weight:700;font-size:13px;padding:18px 0' }, 'مفيش عمليات على الحساب ده لسه') : null
    ]),
    foot: () => [
      h('button', {
        class: 'btn btn-ghost', style: 'flex:none;padding-inline:16px',
        onclick: async () => {
          const ok = await confirmDialog({
            title: 'حذف الحساب',
            message: `حذف «${acct.name}»؟ العمليات المرتبطة به هتتحفظ بس الحساب نفسه هيحذف.`,
            confirmLabel: 'حذف', danger: true, emoji: '🗑️'
          });
          if (ok) { ctx.delAccount(acct.id); api.close(); ctx.refresh(); toast('تم حذف الحساب', { emoji: '🗑️' }); }
        }
      }, 'حذف'),
      h('button', { class: 'btn btn-soft', onclick: () => { api.close(); accountModal(ctx, { initial: acct }); } }, 'تعديل')
    ]
  });
}

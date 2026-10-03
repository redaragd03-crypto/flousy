/* pages/goals.js — أهداف الادخار */

import { h, clear, setProgress, paintIcons } from '../utils/dom.js';
import { fmtMoney, fmtPct, parseAmount } from '../utils/format.js';
import { todayISO, daysBetween, dayLabel } from '../utils/dates.js';
import { emptyState, openModal, confirmDialog, toast } from '../components/ui.js';
import { goalModal, goalAddAmount } from '../components/modals.js';

export function render(ctx, view) {
  clear(view);
  const s = ctx.state;
  const cur = ctx.currency();
  const goals = [...(s.goals || [])].sort((a, b) => (b.currentAmount / (b.targetAmount || 1)) - (a.currentAmount / (a.targetAmount || 1)));

  const totalSaved = goals.reduce((a, g) => a + (Number(g.currentAmount) || 0), 0);
  const totalTarget = goals.reduce((a, g) => a + (Number(g.targetAmount) || 0), 0);

  view.appendChild(h('div', { class: 'page-head' }, [
    h('div', {}, [
      h('h2', {}, 'أهدافي'),
      h('div', { class: 'sub' }, totalTarget > 0 ? `وفرت ${fmtMoney(totalSaved, cur)} من ${fmtMoney(totalTarget, cur)} الإجمالي` : 'حط أهداف ادخارنا ونراقب تقدمك')
    ]),
    h('button', { class: 'btn btn-primary', onclick: () => goalModal(ctx) }, ['🎯', 'هدف جديد'])
  ]));

  if (!goals.length) {
    view.appendChild(emptyState({
      emoji: '🎯', title: 'لسه مفيش أهداف',
      text: 'مثال: لابتوب جديد بـ 30,000 جنيه، أو رحلة، أو حط 10% من دخلك كل شهر في هدف الطوارئ.',
      actionLabel: 'إنشاء أول هدف', onAction: () => goalModal(ctx), card: true
    }));
    paintIcons(view);
    return;
  }

  const box = h('div', { class: 'stagger' });
  for (const g of goals) {
    const saved = Number(g.currentAmount) || 0;
    const target = Number(g.targetAmount) || 0;
    const r = target > 0 ? saved / target : 0;
    const done = r >= 1;
    const remaining = Math.max(0, target - saved);
    const cls = done ? 'ok' : r >= 0.75 ? 'ok' : r >= 0.4 ? '' : 'warn';
    const bar = h('div', { class: 'progress', 'aria-hidden': 'true' }, h('i'));

    const deadlineTxt = g.deadline
      ? (() => {
          const d = daysBetween(todayISO(), g.deadline);
          if (d < 0) return `فات الموعد ${Math.abs(d)} يوم`;
          if (d === 0) return 'الموعد اليوم';
          return `الموعد ${dayLabel(g.deadline)}${d <= 60 ? ` (بعد ${d} يوم)` : ''}`;
        })()
      : 'مفيش موعد محدد';

    box.appendChild(h('section', { class: `goal${done ? ' done' : ''}` }, [
      h('div', { class: 'goal-top' }, [
        h('div', { class: 'goal-ico', 'aria-hidden': 'true' }, done ? '🏆' : (g.emoji || '🎯')),
        h('div', { style: 'flex:1;min-width:0' }, [
          h('div', { class: 'goal-name' }, g.name),
          h('div', { class: 'goal-meta' }, deadlineTxt)
        ]),
        done ? h('span', { class: 'pill ok' }, 'مكتمل') : h('span', { class: `pill ${r >= 0.75 ? 'ok' : 'info'}` }, fmtPct(r))
      ]),
      h('div', { class: 'goal-num' }, [
        h('span', { class: 'saved num' }, fmtMoney(saved, cur, { withUnit: false })),
        h('span', { class: 'of' }, `من ${fmtMoney(target, cur, { withUnit: false })} ${ctx.unit()}`)
      ]),
      bar,
      h('div', { style: 'font-size:12px;font-weight:700;color:var(--text-3);margin-top:6px' },
        done ? 'مبروك! كملت الهدف ده — حط هدف تاني؟' : `المتبقي: ${fmtMoney(remaining, cur)}`),
      h('div', { class: 'goal-actions' }, [
        h('button', { class: 'btn btn-soft btn-sm', style: 'flex:1', onclick: () => goalAddAmount(ctx, g) }, ['💪', 'أضفت اليوم']),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => goalModal(ctx, { initial: g }) }, 'تعديل'),
        h('button', {
          class: 'btn btn-ghost btn-sm', style: 'color:var(--danger)',
          onclick: async () => {
            const ok = await confirmDialog({ title: 'حذف الهدف', message: `تحذف هدف «${g.name}»؟`, confirmLabel: 'حذف', danger: true, emoji: '🗑️' });
            if (ok) { await ctx.delGoal(g.id); ctx.refresh(); toast('تم حذف الهدف', { emoji: '🗑️' }); }
          }
        }, 'حذف')
      ])
    ]));
    requestAnimationFrame(() => requestAnimationFrame(() => setProgress(bar, r, done ? 'ok' : cls)));
  }
  view.appendChild(box);
  paintIcons(view);
}

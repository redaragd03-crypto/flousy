/* modals.js — all input forms: income, expense, transfer, account, goal, budget, bill, recurring, category */

import { h, clear, paintIcons } from '../utils/dom.js';
import { openModal, confirmDialog, toast } from './ui.js';
import { parseAmount, fmtMoney, CURRENCIES } from '../utils/format.js';
import { todayISO } from '../utils/dates.js';
import {
  EXTRA_ACCOUNT_TYPES, ACCOUNT_ICONS, GOAL_ICONS, BILL_ICONS, PAYMENT_METHODS
} from '../database/defaults.js';
import { uid } from '../database/db.js';

/* ---------- field builders ---------- */

function field(label, control, hint) {
  return h('div', { class: 'field' }, [
    h('label', {}, label),
    control,
    hint ? h('div', { class: 'hint' }, hint) : null
  ]);
}

function textInput(value = '', { placeholder = '', type = 'text', maxlen = 80 } = {}) {
  const inp = h('input', { class: 'inp', type, value, placeholder, maxlength: maxlen, 'aria-label': placeholder });
  return inp;
}

function selectInput(options, value, placeholder) {
  const sel = h('select', { class: 'inp' }, [
    placeholder != null ? h('option', { value: '', disabled: true, selected: value === '' }, placeholder) : null,
    ...options.map((o) => h('option', { value: o.id, selected: o.id === value }, o.label))
  ]);
  return sel;
}

function dateInput(value = todayISO(), { max = '' } = {}) {
  return h('input', { class: 'inp', type: 'date', value, max });
}

/** Big amount input with unit + quick chips. */
function amountInput(value = '', { quicks = [], unit = 'جنيه' } = {}) {
  const wrap = h('div', { class: 'amount-wrap' });
  const inp = h('input', {
    type: 'text', inputmode: 'decimal', placeholder: '0',
    value, autocomplete: 'off', 'aria-label': 'المبلغ'
  });
  wrap.appendChild(inp);
  wrap.appendChild(h('span', { class: 'amount-unit' }, unit));
  const box = h('div');
  box.appendChild(field('المبلغ', wrap, null));
  if (quicks.length) {
    const q = h('div', { class: 'quick-amts' });
    for (const amt of quicks) {
      q.appendChild(h('button', { type: 'button', onclick: () => { inp.value = String(amt); } }, String(amt)));
    }
    box.appendChild(q);
  }
  return { box, get: () => parseAmount(inp.value), set: (v) => { inp.value = v == null ? '' : String(v); }, input: inp, wrap };
}

/** Emoji tile grid picker. */
function emojiPicker(emojis, value) {
  const grid = h('div', { class: 'icon-grid' });
  let sel = value || (emojis[0] || '');
  for (const e of emojis) {
    grid.appendChild(h('button', {
      type: 'button', class: `icon-opt${e === sel ? ' active' : ''}`,
      'aria-label': e, onclick: (ev) => {
        sel = e;
        clear(grid);
        for (const x of emojis) grid.appendChild(h('button', { type: 'button', class: `icon-opt${x === sel ? ' active' : ''}`, 'aria-label': x, onclick: () => {} }, x));
      }
    }, e));
  }
  return { el: grid, get: () => sel };
}

/** Color swatches. */
function colorPicker(colors, value) {
  let sel = value || colors[0];
  const box = h('div', { class: 'color-grid' });
  const paint = () => {
    clear(box);
    for (const c of colors) box.appendChild(h('button', {
      type: 'button', class: `color-opt${c === sel ? ' active' : ''}`, style: `background:${c}`, 'aria-label': c,
      onclick: () => { sel = c; paint(); }
    }));
  };
  paint();
  return { el: box, get: () => sel };
}

/** Single-emoji text input (for custom emoji). */
function emojiTextInput(value = '') {
  const inp = h('input', {
    class: 'inp', value, maxlength: 2, style: 'width:74px;text-align:center;font-size:20px',
    placeholder: '🙂', 'aria-label': 'أيقونة'
  });
  return inp;
}

/* ---------- shared options helpers ---------- */

function accountOptions(ctx) {
  return ctx.state.accounts
    .filter((a) => a.active !== false)
    .map((a) => ({ id: a.id, label: `${a.emoji || '💳'} ${a.name}` }));
}

function catOptions(ctx, type) {
  return ctx.state.categories
    .filter((c) => c.type === type)
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ar'))
    .map((c) => ({ id: c.id, label: `${c.emoji} ${c.name}` }));
}

function catEmoji(ctx, id) {
  const c = ctx.state.categories.find((x) => x.id === id);
  return c ? c : { name: 'أخرى', emoji: '📦' };
}

/* ================= add transaction (income / expense) ================= */

export function addTxModal(ctx, { type, initial = null } = {}) {
  const isExp = type === 'expense';
  const title = initial ? (isExp ? 'تعديل مصروف' : 'تعديل دخل') : (isExp ? 'إضافة مصروف' : 'إضافة دخل');
  const cur = ctx.currency();
  const lastCat = isExp ? (ctx.state.settings.lastCategory || ctx.freqCat(type)) : (ctx.state.settings.lastIncomeCategory || null);
  const cats = ctx.state.categories.filter((c) => c.type === type);
  if (lastCat) cats.unshift(...cats.splice(cats.findIndex((c) => c.id === lastCat), 1));

  let selCat = (initial && initial.categoryId && cats.some((c) => c.id === initial.categoryId)) ? initial.categoryId : (lastCat || (cats.find((c) => c.id.endsWith('other')) || cats.find((c) => c.id.endsWith('other-exp')) || cats[0] || {}).id || '');
  let selAcct = initial && initial.accountId ? initial.accountId : (ctx.state.settings.lastAccount || (ctx.state.accounts[0] || {}).id || '');
  let selPay = initial && initial.paymentMethod ? initial.paymentMethod : (ctx.state.settings.lastPayment || 'cash');

  const catsBox = h('div', { class: 'catgrid' });
  const paintCats = () => {
    clear(catsBox);
    for (const c of cats) {
      catsBox.appendChild(h('button', {
        type: 'button', class: `cat-tile${c.id === selCat ? ' active' : ''}`,
        'aria-label': c.name, 'aria-pressed': String(c.id === selCat),
        onclick: () => { selCat = c.id; paintCats(); }
      }, [h('span', { class: 'em' }, c.emoji), h('span', {}, c.name)]));
    }
    // custom category
    catsBox.appendChild(h('button', {
      type: 'button', class: 'cat-tile', style: 'border-style:dashed;color:var(--text-3)',
      onclick: () => openCategoryModal(ctx, { type, onPick: (id) => { selCat = id; paintCats(); api.bodyEl.querySelector('.catgrid') && (selCat = id, paintCats()); } })
    }, [h('span', { class: 'em' }, '➕'), h('span', {}, 'قالب جديد')]));
  };
  paintCats();

  const amt = amountInput(initial ? String(initial.amount) : '', {
    quicks: isExp ? [50, 100, 200, 500] : [],
    unit: CURRENCIES[cur]?.symbol || cur
  });
  const dateInp = dateInput(initial ? initial.date : todayISO());
  const acctSel = selectInput(accountOptions(ctx), selAcct);
  const descInp = textInput(initial ? (initial.description || '') : '', { placeholder: isExp ? 'مثال: مطعم، أوبر، فاتورة...' : 'مثال: راتب، مشروع حري' });
  const notesInp = h('textarea', { class: 'inp', maxlength: 300 }, initial ? (initial.notes || '') : '');
  notesInp.setAttribute('placeholder', 'ملاحظات اختيارية...');

  const payBox = h('div', { class: 'chips' });
  const paintPay = () => {
    clear(payBox);
    for (const p of PAYMENT_METHODS) {
      payBox.appendChild(h('button', {
        type: 'button', class: `chip${p.id === selPay ? ' active' : ''}`,
        onclick: () => { selPay = p.id; paintPay(); }
      }, p.label));
    }
  };
  paintPay();

  const details = h('details', { class: 'collapsible' }, [
    h('summary', {}, [h('span', { 'data-ic': 'chevL', 'aria-hidden': 'true' }), h('span', {}, 'تفاصيل إضافية (وصف، طريقة الدفع، ملاحظات)')]),
    h('div', { class: 'col-inner' }, [
      field('الوصف', descInp),
      field('طريقة الدفع', payBox),
      field('ملاحظات', notesInp)
    ])
  ]);

  let api;
  api = openModal({
    title,
    icon: isExp ? '💸' : '💰',
    body: () => h('div', {}, [
      amt.box,
      field('الفئة', catsBox),
      h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' }, [
        field('التاريخ', dateInp),
        field('الحساب', acctSel)
      ]),
      details
    ]),
    foot: () => {
      const save = () => {
        const amount = amt.get();
        if (amount == null) {
          amt.wrap.classList.add('invalid');
          amt.input.focus();
          toast('اكتب مبلغ صحيح أكبر من صفر', { type: 'err', emoji: '⚠️' });
          return;
        }
        if (!selCat) { toast('اختار الفئة', { type: 'err', emoji: '⚠️' }); return; }
        if (!acctSel.value) { toast('اختار الحساب', { type: 'err', emoji: '⚠️' }); return; }
        const date = dateInp.value || todayISO();
        const nowTs = Date.now();
        const tx = initial ? {
          ...initial,
          amount, categoryId: selCat, accountId: acctSel.value, date,
          description: descInp.value.trim(), notes: notesInp.value.trim(),
          paymentMethod: selPay, updatedAt: nowTs
        } : {
          id: uid(), type, amount, categoryId: selCat, accountId: acctSel.value, date,
          description: descInp.value.trim(), notes: notesInp.value.trim(),
          paymentMethod: selPay, recurringId: null, createdAt: nowTs, updatedAt: nowTs
        };
        ctx.putTx(tx);
        ctx.setSettings({
          lastAccount: acctSel.value,
          lastPayment: selPay,
          ...(isExp ? { lastCategory: selCat } : { lastIncomeCategory: selCat })
        });
        api.close();
        ctx.refresh();
        toast(initial ? (isExp ? 'تم تعديل المصروف' : 'تم تعديل الدخل') : (isExp ? 'اتسجل المصروف' : 'اتسجل الدخل'), { emoji: isExp ? '💸' : '💰' });
      };
      const btns = [h('button', { class: 'btn btn-primary btn-block', onclick: save }, initial ? 'حفظ التعديلات' : 'حفظ')];
      if (initial) {
        btns.push(h('button', {
          class: 'btn btn-danger', style: 'flex:none;padding-inline:16px',
          onclick: async () => {
            const ok = await confirmDialog({ title: 'حذف العملية', message: 'متأكد إنك هتحذف العملية دي؟ لا يمكن التراجع.', confirmLabel: 'حذف', danger: true, emoji: '🗑️' });
            if (ok) { ctx.delTx(initial.id); api.close(); ctx.refresh(); toast('تم حذف العملية', { emoji: '🗑️' }); }
          }
        }, 'حذف'));
      }
      return btns;
    }
  });

  setTimeout(() => amt.input.focus(), 80);
  return api;
}

/* ================= transfer ================= */

export function transferModal(ctx) {
  const cur = ctx.currency();
  const accts = ctx.state.accounts.filter((a) => a.active !== false);
  if (accts.length < 2) {
    toast('لازم يكون عندك حسابين على الأقل عشان التحويل', { type: 'err', emoji: '⚠️' });
    return;
  }
  const from = selectInput(accts.map((a) => ({ id: a.id, label: `${a.emoji} ${a.name}` })), ctx.state.settings.lastAccount || accts[0].id);
  const toSel = selectInput(accts.map((a) => ({ id: a.id, label: `${a.emoji} ${a.name}` })), accts.find((a) => a.id !== (from.value || accts[0].id))?.id || accts[1].id);

  from.addEventListener('change', () => {
    if (toSel.value === from.value) toSel.value = accts.find((a) => a.id !== from.value)?.id || '';
  });
  toSel.addEventListener('change', () => {
    if (from.value === toSel.value) from.value = accts.find((a) => a.id !== toSel.value)?.id || '';
  });

  const amt = amountInput('', { quicks: [100, 500, 1000, 5000], unit: CURRENCIES[cur]?.symbol || cur });
  const dateInp = dateInput(todayISO());
  const notesInp = textInput('', { placeholder: 'مثال: شحن محفظة' });

  let api;
  api = openModal({
    title: 'تحويل بين الحسابات',
    icon: '🔄',
    body: () => h('div', {}, [
      amt.box,
      field('من حساب', from),
      field('إلى حساب', toSel),
      h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' }, [
        field('التاريخ', dateInp),
        field('وصف (اختياري)', notesInp)
      ])
    ]),
    foot: () => [
      h('button', {
        class: 'btn btn-primary btn-block',
        onclick: () => {
          const amount = amt.get();
          if (amount == null) {
            amt.wrap.classList.add('invalid');
            toast('اكتب مبلغ صحيح أكبر من صفر', { type: 'err', emoji: '⚠️' });
            return;
          }
          if (!from.value || !toSel.value || from.value === toSel.value) {
            toast('اختار حسابين مختلفين', { type: 'err', emoji: '⚠️' });
            return;
          }
          const acc = ctx.state.accounts.find((a) => a.id === from.value);
          if ((ctx.balanceOf(from.value) || 0) < amount) {
            toast('الرصيد في الحساب الأول مش كافي للتحويل', { type: 'err', emoji: '⚠️' });
            return;
          }
          ctx.putTx({
            id: uid(), type: 'transfer', amount,
            accountId: from.value, toAccountId: toSel.value,
            date: dateInp.value || todayISO(),
            description: notesInp.value.trim() || 'تحويل بين الحسابات',
            notes: '', paymentMethod: 'transfer', recurringId: null,
            createdAt: Date.now(), updatedAt: Date.now()
          });
          api.close();
          ctx.refresh();
          toast('تم التحويل بنجاح', { emoji: '🔄' });
        }
      }, 'تحويل')
    ]
  });
  setTimeout(() => amt.input.focus(), 80);
  return api;
}

/* ================= custom category ================= */

export function openCategoryModal(ctx, { type = 'expense', onPick = null } = {}) {
  const emojis = type === 'expense'
    ? ['🍕', '🛍️', '🎪', '📺', '🐾', '☕', '🎧', '🚲', '⚽', '🧾', '💎', '📦', '🎯', '🪙', '💎', '🧴']
    : ['💼', '💻', '🏦', '📈', '🎁', '📦', '💰', '🧑‍💻', '🏪', '🌾', '📱', '💎'];
  const colors = ['#5B54D9', '#E11D48', '#16A34A', '#0284C7', '#D97706', '#9333EA', '#0D9488', '#DB2777', '#B45309', '#475569'];

  let api;
  api = openModal({
    title: type === 'expense' ? 'قالب مصروف جديد' : 'قالب دخل جديد',
    icon: '🏷️',
    body: () => {
      const nameInp = textInput('', { placeholder: 'اسم القالب (مثال: مقهى، تدريب)' });
      const emo = emojiPicker(emojis, type === 'expense' ? '🍕' : '💼');
      const col = colorPicker(colors, null);
      return h('div', {}, [
        field('الاسم', nameInp),
        field('الأيقونة', emo.el),
        field('اللون', col.el)
      ]);
    },
    foot: () => [h('button', {
      class: 'btn btn-primary btn-block',
      onclick: () => {
        const name = nameInp.value.trim().slice(0, 30);
        if (!name) { toast('اكتب اسم للقالب', { type: 'err', emoji: '⚠️' }); nameInp.focus(); return; }
        const c = { id: uid(), name, emoji: emo.get(), type, color: col.get(), builtIn: false };
        ctx.putCategory(c);
        api.close();
        ctx.refresh();
        toast('تم إضافة القالب', { emoji: '🏷️' });
        onPick && onPick(c.id);
      }
    }, 'إضافة القالب')]
  });
  return api;
}

/* ================= account ================= */

export function accountModal(ctx, { initial = null } = {}) {
  const typeBox = h('div', { class: 'chips' });
  let selType = initial ? initial.type : 'cash';
  const paintTypes = () => {
    clear(typeBox);
    for (const t of EXTRA_ACCOUNT_TYPES) {
      typeBox.appendChild(h('button', {
        type: 'button', class: `chip${t.type === selType ? ' active' : ''}`,
        onclick: () => { selType = t.type; paintTypes(); }
      }, [h('span', { class: 'em' }, t.emoji), h('span', {}, t.label)]));
    }
  };
  paintTypes();

  const nameInp = textInput(initial ? initial.name : '', { placeholder: 'مثال: كاش، بنكي، فودافون كاش' });
  const emo = emojiPicker(ACCOUNT_ICONS, initial ? (initial.emoji || '💵') : '💵');
  const col = colorPicker(['#16A34A', '#5B54D9', '#0284C7', '#EA580C', '#9333EA', '#0D9488', '#E11D48', '#D97706', '#475569', '#0EA5E9'], initial ? initial.color : '#16A34A');
  const openAmt = amountInput(initial ? String(initial.openingBalance || '') : '', { unit: CURRENCIES[ctx.currency()]?.symbol || 'جنيه' });

  let api;
  api = openModal({
    title: initial ? `تعديل حساب «${initial.name}»` : 'حساب جديد',
    icon: '🏦',
    body: () => h('div', {}, [
      field('اسم الحساب', nameInp),
      field('نوع الحساب', typeBox),
      field('الأيقونة', emo.el),
      field('اللون', col.el),
      ...(initial ? [] : [field('رصيد افتتاحي (اختياري)', openAmt.box, 'لو احتاج تبدأ برصيد معين')])
    ]),
    foot: () => {
      const save = () => {
        const name = nameInp.value.trim().slice(0, 40);
        if (!name) { toast('اكتب اسم للحساب', { type: 'err', emoji: '⚠️' }); nameInp.focus(); return; }
        if (ctx.state.accounts.some((a) => a.id !== (initial && initial.id) && a.name.trim().toLowerCase() === name.toLowerCase())) {
          toast('في حساب بنفس الاسم', { type: 'err', emoji: '⚠️' });
          return;
        }
        const opening = initial ? Number(initial.openingBalance) || 0 : (openAmt.get() || 0);
        const a = {
          id: initial ? initial.id : uid(),
          name,
          emoji: emo.get(),
          type: selType,
          color: col.get(),
          openingBalance: opening,
          active: true,
          createdAt: initial ? initial.createdAt : Date.now()
        };
        ctx.putAccount(a);
        api.close();
        ctx.refresh();
        toast(initial ? 'تم تعديل الحساب' : 'تم إضافة الحساب', { emoji: '🏦' });
      };
      const btns = [h('button', { class: 'btn btn-primary btn-block', onclick: save }, initial ? 'حفظ' : 'إضافة الحساب')];
      if (initial) {
        btns.push(h('button', {
          class: 'btn btn-danger', style: 'flex:none;padding-inline:16px',
          onclick: async () => {
            const ok = await confirmDialog({
              title: 'حذف الحساب',
              message: `حذف «${initial.name}»؟ العمليات المرتبطة به هتتحفظ بس الحساب نفسه هيحذف.`,
              confirmLabel: 'حذف', danger: true, emoji: '🗑️'
            });
            if (ok) { ctx.delAccount(initial.id); api.close(); ctx.refresh(); toast('تم حذف الحساب', { emoji: '🗑️' }); }
          }
        }, 'حذف'));
      }
      return btns;
    }
  });
  return api;
}

/* ================= goal ================= */

export function goalModal(ctx, { initial = null } = {}) {
  const nameInp = textInput(initial ? initial.name : '', { placeholder: 'مثال: لابتوب، زواج، سيارة' });
  const emo = emojiPicker(GOAL_ICONS, initial ? (initial.emoji || '🎯') : '🎯');
  const target = amountInput(initial ? String(initial.targetAmount) : '', { unit: CURRENCIES[ctx.currency()]?.symbol || 'جنيه' });
  const current = amountInput(initial ? String(initial.currentAmount || '') : '', { unit: CURRENCIES[ctx.currency()]?.symbol || 'جنيه' });
  const deadlineInp = dateInput(initial ? (initial.deadline || '') : '', { max: '' });

  let api;
  api = openModal({
    title: initial ? 'تعديل هدف' : 'هدف ادخار جديد',
    icon: '🎯',
    body: () => h('div', {}, [
      field('اسم الهدف', nameInp),
      field('الأيقونة', emo.el),
      target.box,
      field('اللي وفّرته لحد دلوقتي (اختياري)', current.box),
      field('الموعد المستهدف (اختياري)', deadlineInp)
    ]),
    foot: () => {
      const save = () => {
        const name = nameInp.value.trim().slice(0, 40);
        const t = target.get();
        const c = current.get() || 0;
        if (!name) { toast('اكتب اسم الهدف', { type: 'err', emoji: '⚠️' }); return; }
        if (t == null) { toast('اكتب المبلغ المطلوب صحيح', { type: 'err', emoji: '⚠️' }); return; }
        if (c > t) { toast('اللي وفّرته أكتر من الهدف نفسه', { type: 'err', emoji: '⚠️' }); return; }
        const g = {
          id: initial ? initial.id : uid(),
          name, emoji: emo.get(),
          targetAmount: t, currentAmount: c,
          deadline: deadlineInp.value || null,
          color: initial ? initial.color : '#5B54D9',
          createdAt: initial ? initial.createdAt : Date.now()
        };
        ctx.putGoal(g);
        api.close();
        ctx.refresh();
        toast(initial ? 'تم تعديل الهدف' : 'اتعمل الهدف — بالتوفيق', { emoji: '🎯' });
      };
      const btns = [h('button', { class: 'btn btn-primary btn-block', onclick: save }, initial ? 'حفظ' : 'إنشاء الهدف')];
      if (initial) {
        btns.push(h('button', {
          class: 'btn btn-danger', style: 'flex:none;padding-inline:16px',
          onclick: async () => {
            const ok = await confirmDialog({ title: 'حذف الهدف', message: `تحذف هدف «${initial.name}»؟`, confirmLabel: 'حذف', danger: true, emoji: '🗑️' });
            if (ok) { ctx.delGoal(initial.id); api.close(); ctx.refresh(); toast('تم حذف الهدف', { emoji: '🗑️' }); }
          }
        }, 'حذف'));
      }
      return btns;
    }
  });
  return api;
}

export function goalAddAmount(ctx, goal) {
  const amt = amountInput('', { quicks: [100, 500, 1000, 5000], unit: CURRENCIES[ctx.currency()]?.symbol || 'جنيه' });
  let api;
  api = openModal({
    title: `إضافة لهدف «${goal.name}»`,
    icon: goal.emoji || '🎯',
    body: () => h('div', {}, [amt.box]),
    foot: () => [h('button', {
      class: 'btn btn-primary btn-block',
      onclick: () => {
        const v = amt.get();
        if (v == null) { toast('اكتب مبلغ صحيح', { type: 'err', emoji: '⚠️' }); return; }
        const g = { ...goal, currentAmount: Math.min(goal.targetAmount, (Number(goal.currentAmount) || 0) + v) };
        ctx.putGoal(g);
        api.close();
        ctx.refresh();
        toast(g.currentAmount >= goal.targetAmount ? 'مبروك، كملت الهدف' : `اتضاف ${fmtMoney(v, ctx.currency())}`, { emoji: g.currentAmount >= goal.targetAmount ? '🏆' : '💪' });
      }
    }, 'إضافة المبلغ')]
  });
  setTimeout(() => amt.input.focus(), 80);
  return api;
}

/* ================= budget ================= */

export function budgetModal(ctx, { categoryId = null, initial = null } = {}) {
  const isTotal = !categoryId;
  const cat = categoryId ? catEmoji(ctx, categoryId) : null;
  const amt = amountInput(initial ? String(initial.amount) : '', { unit: CURRENCIES[ctx.currency()]?.symbol || 'جنيه' });

  let api;
  api = openModal({
    title: isTotal ? 'الميزانية الشهرية' : `ميزانية ${cat.emoji} ${cat.name}`,
    icon: isTotal ? '🧮' : cat.emoji,
    body: () => h('div', {}, [
      amt.box,
      h('div', { class: 'hint', style: 'margin-top:10px' }, isTotal
        ? 'سقف إنفاقك الإجمالي في الشهر. الواجهة هتوضح لك الحالة (مطمئن / تحذير / تجاوز) مع تقدم الشهر.'
        : `سقف إنفاقك الشهري على «${cat.name}». عند 90% بيطلع تنبيه، وعند التجاوز بيوضح المبلغ المتجاوز.`)
    ]),
    foot: () => {
      const save = () => {
        const amount = amt.get();
        if (amount == null) { toast('اكتب مبلغ الميزانية', { type: 'err', emoji: '⚠️' }); return; }
        const b = {
          id: isTotal ? 'bud-total' : `bud-${categoryId}`,
          categoryId, label: isTotal ? 'الميزانية الشهرية' : cat.name,
          amount, createdAt: Date.now()
        };
        ctx.putBudget(b);
        api.close();
        ctx.refresh();
        toast('تم حفظ الميزانية', { emoji: '🧮' });
      };
      const btns = [h('button', { class: 'btn btn-primary btn-block', onclick: save }, 'حفظ الميزانية')];
      if (initial) {
        btns.push(h('button', {
          class: 'btn btn-danger', style: 'flex:none;padding-inline:16px',
          onclick: async () => {
            const ok = await confirmDialog({ title: 'حذف الميزانية', message: 'تحذف ميزانية البند ده؟', confirmLabel: 'حذف', danger: true, emoji: '🗑️' });
            if (ok) { ctx.delBudget(initial.id); api.close(); ctx.refresh(); toast('تم حذف الميزانية', { emoji: '🗑️' }); }
          }
        }, 'حذف'));
      }
      return btns;
    }
  });
  setTimeout(() => amt.input.focus(), 80);
  return api;
}

/* ================= bill ================= */

const DAY_OPTS = Array.from({ length: 31 }, (_, i) => ({ id: String(i + 1), label: `يوم ${i + 1}` }));

export function billModal(ctx, { initial = null } = {}) {
  const nameInp = textInput(initial ? initial.name : '', { placeholder: 'مثال: إيجار، إنترنت، كهرباء' });
  const emo = emojiPicker(BILL_ICONS, initial ? (initial.emoji || '💡') : '💡');
  const amt = amountInput(initial ? String(initial.amount) : '', { unit: CURRENCIES[ctx.currency()]?.symbol || 'جنيه' });
  const daySel = selectInput(DAY_OPTS, initial ? String(initial.dueDay || 1) : '1');
  const acctSel = selectInput(accountOptions(ctx), initial ? (initial.accountId || (ctx.state.accounts[0] || {}).id) : ((ctx.state.accounts[0] || {}).id || ''));
  const catSel = selectInput(catOptions(ctx, 'expense'), initial ? (initial.categoryId || 'cat-bills') : 'cat-bills');

  let api;
  api = openModal({
    title: initial ? 'تعديل التزام' : 'التزام جديد (فاتورة أو التزام)',
    icon: '🧾',
    body: () => h('div', {}, [
      field('الاسم', nameInp),
      field('الأيقونة', emo.el),
      amt.box,
      h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' }, [
        field('يوم الاستحقاق من الشهر', daySel),
        field('الحساب', acctSel)
      ]),
      field('الفئة', catSel)
    ]),
    foot: () => {
      const save = () => {
        const name = nameInp.value.trim().slice(0, 40);
        const amount = amt.get();
        if (!name) { toast('اكتب اسم التزام', { type: 'err', emoji: '⚠️' }); return; }
        if (amount == null) { toast('اكتب مبلغ صحيح', { type: 'err', emoji: '⚠️' }); return; }
        const b = {
          id: initial ? initial.id : uid(),
          name, emoji: emo.get(), amount,
          dueDay: Number(daySel.value) || 1,
          accountId: acctSel.value || null,
          categoryId: catSel.value || null,
          paid: initial ? !!initial.paid : false,
          paidDate: initial && initial.paid ? initial.paidDate : null,
          recurring: false,
          createdAt: initial ? initial.createdAt : Date.now()
        };
        ctx.putBill(b);
        api.close();
        ctx.refresh();
        toast(initial ? 'تم تعديل التزام' : 'اتضاف التزام', { emoji: '🧾' });
      };
      const btns = [h('button', { class: 'btn btn-primary btn-block', onclick: save }, initial ? 'حفظ' : 'إضافة التزام')];
      if (initial) {
        btns.push(h('button', {
          class: 'btn btn-danger', style: 'flex:none;padding-inline:16px',
          onclick: async () => {
            const ok = await confirmDialog({ title: 'حذف التزام', message: `تحذف «${initial.name}»؟`, confirmLabel: 'حذف', danger: true, emoji: '🗑️' });
            if (ok) { ctx.delBill(initial.id); api.close(); ctx.refresh(); toast('تم الحذف', { emoji: '🗑️' }); }
          }
        }, 'حذف'));
      }
      return btns;
    }
  });
  return api;
}

/* ================= recurring ================= */

const FREQ_OPTS = [
  { id: 'monthly', label: 'شهريًا' },
  { id: 'weekly', label: 'أسبوعيًا' },
  { id: 'daily', label: 'يوميًا' },
  { id: 'yearly', label: 'سنويًا' }
];

export function recurringModal(ctx, { initial = null } = {}) {
  const nameInp = textInput(initial ? initial.name : '', { placeholder: 'مثال: اشتراك نتفليكس، صالات' });
  const amt = amountInput(initial ? String(initial.amount) : '', { unit: CURRENCIES[ctx.currency()]?.symbol || 'جنيه' });
  const freqSel = selectInput(FREQ_OPTS, initial ? initial.frequency : 'monthly');
  const catSel = selectInput(catOptions(ctx, 'expense'), initial ? (initial.categoryId || 'cat-other') : 'cat-other');
  const acctSel = selectInput(accountOptions(ctx), initial ? (initial.accountId || (ctx.state.accounts[0] || {}).id) : ((ctx.state.accounts[0] || {}).id || ''));

  let api;
  api = openModal({
    title: initial ? 'تعديل مصروف متكرر' : 'مصروف متكرر جديد',
    icon: '🔁',
    body: () => h('div', {}, [
      field('الاسم', nameInp),
      amt.box,
      h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' }, [
        field('التكرار', freqSel),
        field('الفئة', catSel)
      ]),
      field('الحساب', acctSel),
      h('div', { class: 'hint', style: 'margin-top:8px' }, 'التطبيق هيولّد العملية تلقائيًا في كل تاريخ استحقاق (تقدر توقف/تحذف أي وقت).')
    ]),
    foot: () => {
      const save = () => {
        const name = nameInp.value.trim().slice(0, 40);
        const amount = amt.get();
        if (!name) { toast('اكتب اسم للمصروف المتكرر', { type: 'err', emoji: '⚠️' }); return; }
        if (amount == null) { toast('اكتب مبلغ صحيح', { type: 'err', emoji: '⚠️' }); return; }
        const r = {
          id: initial ? initial.id : uid(),
          name, amount,
          frequency: freqSel.value || 'monthly',
          categoryId: catSel.value || null,
          accountId: acctSel.value || null,
          nextDueDate: initial ? initial.nextDueDate : todayISO(),
          active: true,
          createdAt: initial ? initial.createdAt : Date.now()
        };
        ctx.putRec(r);
        api.close();
        ctx.refresh();
        toast(initial ? 'تم التعديل' : 'اتضاف — هيظهر تلقائيًا عند الموعد', { emoji: '🔁' });
      };
      const btns = [h('button', { class: 'btn btn-primary btn-block', onclick: save }, initial ? 'حفظ' : 'إضافة')];
      if (initial) {
        btns.push(h('button', {
          class: 'btn btn-danger', style: 'flex:none;padding-inline:16px',
          onclick: async () => {
            const ok = await confirmDialog({ title: 'حذف المتكرر', message: `تحذف «${initial.name}»؟ العمليات اللي اتولدت قبلاً هتفضل كما هي.`, confirmLabel: 'حذف', danger: true, emoji: '🗑️' });
            if (ok) { ctx.delRec(initial.id); api.close(); ctx.refresh(); toast('تم الحذف', { emoji: '🗑️' }); }
          }
        }, 'حذف'));
      }
      return btns;
    }
  });
  return api;
}

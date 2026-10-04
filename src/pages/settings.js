/* pages/settings.js — الإعدادات، PIN، النسخ الاحتياطي */

import { h, clear, paintIcons } from '../utils/dom.js';
import { CURRENCIES, fmtNum } from '../utils/format.js';
import { todayISO } from '../utils/dates.js';
import { confirmDialog, openModal, toast } from '../components/ui.js';
import { exportJSON, parseBackup, downloadFile, buildBackup } from '../services/exporters.js';
import { buildSeedData } from '../services/seed.js';
import { DEFAULT_SETTINGS } from '../database/defaults.js';
import { loadAll, replaceAll, uid } from '../database/db.js';
import { checkForUpdate, getCurrentVersion, openDownloadUrl } from '../services/update-manager.js';

export function render(ctx, view) {
  clear(view);
  const s = ctx.state;
  const st = s.settings;
  const cur = st.currency || 'EGP';

  view.appendChild(h('div', { class: 'page-head' }, [
    h('h2', {}, 'الإعدادات')
  ]));

  /* ---------- profile ---------- */
  view.appendChild(h('div', { class: 'set-group' }, [
    h('div', { class: 'set-group-title' }, ['👤', 'الملف الشخصي']),
    h('button', { class: 'set-row click', onclick: () => profileModal(ctx) }, [
      h('span', { class: 'set-ico' }, st.userEmoji || '👤'),
      h('div', { class: 'set-main' }, [
        h('div', { class: 'set-label' }, st.userName || '—'),
        h('div', { class: 'set-sub' }, 'الاسم والأفيتر')
      ]),
      h('span', { class: 'ic chev', 'data-ic': 'chevL' })
    ])
  ]));

  /* ---------- appearance & locale ---------- */
  view.appendChild(h('div', { class: 'set-group', style: 'margin-top:14px' }, [
    h('div', { class: 'set-group-title' }, ['🎨', 'المظهر واللغة']),
    themeRow(ctx),
    h('div', { class: 'set-row' }, [
      h('span', { class: 'set-ico' }, '💱'),
      h('div', { class: 'set-main' }, [
        h('div', { class: 'set-label' }, 'العملة'),
        h('div', { class: 'set-sub' }, 'تظهر في كل الأرقام والتقارير')
      ]),
      h('select', {
        class: 'inp', style: 'width:130px',
        'aria-label': 'العملة',
        onchange: async (e) => {
          await ctx.setSettings({ currency: e.target.value });
          ctx.refresh();
          toast(`تم تغيير العملة إلى ${CURRENCIES[e.target.value]?.symbol || e.target.value}`, { emoji: '💱' });
        }
      }, Object.entries(CURRENCIES).map(([code, c]) => h('option', { value: code, selected: cur === code }, c.label)))
    ]),
    h('div', { class: 'set-row' }, [
      h('span', { class: 'set-ico' }, '📅'),
      h('div', { class: 'set-main' }, [
        h('div', { class: 'set-label' }, 'أول يوم في الشهر'),
        h('div', { class: 'set-sub' }, 'هل شهرك يبدأ من يوم 1 ولا يوم 15؟')
      ]),
      h('select', {
        class: 'inp', style: 'width:130px', 'aria-label': 'أول يوم في الشهر',
        onchange: async (e) => {
          await ctx.setSettings({ firstDayOfMonth: Number(e.target.value) });
          ctx.refresh();
          toast('تم تحديث بداية الشهر', { emoji: '📅' });
        }
      }, [
        h('option', { value: '1', selected: !st.firstDayOfMonth }, 'يوم 1'),
        h('option', { value: '15', selected: st.firstDayOfMonth === 15 }, 'يوم 15')
      ])
    ])
  ]));

  /* ---------- notifications & budget ---------- */
  view.appendChild(h('div', { class: 'set-group', style: 'margin-top:14px' }, [
    h('div', { class: 'set-group-title' }, ['🔔', 'التنبيهات والميزانية']),
    h('div', { class: 'set-row' }, [
      h('span', { class: 'set-ico' }, '🔔'),
      h('div', { class: 'set-main' }, [
        h('div', { class: 'set-label' }, 'إشعارات داخلية'),
        h('div', { class: 'set-sub' }, 'تنبيهات الميزانيات والفواتير والأهداف')
      ]),
      switchEl(st.notifications !== false, async (on) => {
        await ctx.setSettings({ notifications: on });
        ctx.refresh();
      })
    ]),
    h('button', { class: 'set-row click', onclick: () => ctx.nav('budgets') }, [
      h('span', { class: 'set-ico' }, '🧮'),
      h('div', { class: 'set-main' }, [
        h('div', { class: 'set-label' }, 'الميزانية الشهرية'),
        h('div', { class: 'set-sub' }, 'تحديد السقف والتوزيع على الفئات')
      ]),
      h('span', { class: 'ic chev', 'data-ic': 'chevL' })
    ])
  ]));

  /* ---------- security ---------- */
  view.appendChild(h('div', { class: 'set-group', style: 'margin-top:14px' }, [
    h('div', { class: 'set-group-title' }, ['🔐', 'الأمان']),
    h('div', { class: 'set-row' }, [
      h('span', { class: 'set-ico' }, '🔒'),
      h('div', { class: 'set-main' }, [
        h('div', { class: 'set-label' }, 'قفل التطبيق برمز PIN'),
        h('div', { class: 'set-sub' }, st.pinEnabled ? `مفعّل (${st.pinLength || 4} أرقام)` : 'معطل')
      ]),
      switchEl(!!st.pinEnabled, async (on) => {
        if (on) pinSetModal(ctx, () => { ctx.refresh(); });
        else {
          const ok = await confirmDialog({
            title: 'تعطيل قفل PIN', message: 'هيقفل PIN من غير ما يحذف الرمز. تقدر تعيده في أي وقت.',
            confirmLabel: 'تعطيل', emoji: '🔓'
          });
          if (ok) { await ctx.setSettings({ pinEnabled: false }); ctx.refresh(); }
        }
      })
    ]),
    st.pinEnabled ? h('div', { class: 'set-row' }, [
      h('span', { class: 'set-ico' }, '✏️'),
      h('div', { class: 'set-main' }, [
        h('div', { class: 'set-label' }, 'تغيير رمز PIN'),
        h('div', { class: 'set-sub' }, 'اكتب الرمز القديم والجديد')
      ]),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => pinChangeModal(ctx) }, 'تغيير')
    ]) : null,
    h('div', { class: 'set-row' }, [
      h('span', { class: 'set-ico' }, '⚠️'),
      h('div', { class: 'set-main' }, [
        h('div', { class: 'set-label' }, 'ملاحظة أمان'),
        h('div', { class: 'set-sub' }, 'رمز PIN يحجب الوصول للتطبيق محليًا، وليس تشفيرًا حقيقيًا للبيانات المخزنة.')
      ])
    ])
  ]));

  /* ---------- backup ---------- */
  const txCount = s.transactions.length;
  view.appendChild(h('div', { class: 'set-group', style: 'margin-top:14px' }, [
    h('div', { class: 'set-group-title' }, ['💾', 'النسخ الاحتياطي والبيانات']),
    h('div', { class: 'set-row' }, [
      h('span', { class: 'set-ico' }, '📤'),
      h('div', { class: 'set-main' }, [
        h('div', { class: 'set-label' }, 'تصدير البيانات (Export)'),
        h('div', { class: 'set-sub' }, `ملف JSON كامل (${fmtNum(txCount)} عملية + كل الإعدادات)`)
      ]),
      h('button', {
        class: 'btn btn-soft btn-sm',
        onclick: () => { exportJSON({ transactions: s.transactions, accounts: s.accounts, categories: s.categories, budgets: s.budgets, goals: s.goals, bills: s.bills, recurring: s.recurring, settings: st }); toast('تم تنزيل النسخة الاحتياطية', { emoji: '📤' }); }
      }, 'تصدير')
    ]),
    h('div', { class: 'set-row' }, [
      h('span', { class: 'set-ico' }, '📥'),
      h('div', { class: 'set-main' }, [
        h('div', { class: 'set-label' }, 'استرجاع البيانات (Import)'),
        h('div', { class: 'set-sub' }, 'استبدال البيانات الحالية من ملف نسخة سابقة')
      ]),
      importBtn(ctx)
    ]),
    h('div', { class: 'set-row' }, [
      h('span', { class: 'set-ico' }, '✨'),
      h('div', { class: 'set-main' }, [
        h('div', { class: 'set-label' }, 'بيانات تجريبية'),
        h('div', { class: 'set-sub' }, 'شوف شكل التطبيق مليان بيانات (راتب + مصروفات + أهداف + فواتير)')
      ]),
      h('button', {
        class: 'btn btn-ghost btn-sm',
        onclick: async () => {
          const ok = await confirmDialog({
            title: 'إضافة البيانات التجريبية',
            message: 'هتضيف بيانات تجريبية (3 شهور دخل ومصاريف وأهداف وفواتير) بجانب بياناتك الحالية. متابعة؟',
            confirmLabel: 'إضافة', emoji: '✨'
          });
          if (!ok) return;
          await ctx.applySeed();
          toast('اتضافت البيانات التجريبية', { emoji: '✨' });
        }
      }, 'إضافة')
    ])
  ]));

  /* ---------- updates ---------- */
  view.appendChild(h('div', { class: 'set-group', style: 'margin-top:14px' }, [
    h('div', { class: 'set-group-title' }, ['🔄', 'التحديثات']),
    h('div', { class: 'set-row' }, [
      h('span', { class: 'set-ico' }, '📱'),
      h('div', { class: 'set-main' }, [
        h('div', { class: 'set-label' }, 'الإصدار الحالي'),
        h('div', { class: 'set-sub' }, `v${getCurrentVersion().versionName} (${getCurrentVersion().versionCode})`)
      ])
    ]),
    h('div', { class: 'set-row' }, [
      h('span', { class: 'set-ico' }, '🔍'),
      h('div', { class: 'set-main' }, [
        h('div', { class: 'set-label' }, 'التحقق من التحديثات'),
        h('div', { class: 'set-sub' }, 'تحقق من وجود إصدار جديد من التطبيق')
      ]),
      h('button', { class: 'btn btn-soft btn-sm', onclick: () => checkUpdateManually(ctx) }, 'تحقق الآن')
    ])
  ]));

  /* ---------- danger zone: full data wipe ---------- */
  view.appendChild(h('div', { class: 'set-group danger-zone', style: 'margin-top:14px' }, [
    h('div', { class: 'set-group-title danger-title' }, ['⛔', 'منطقة خطرة']),
    h('div', { class: 'set-row' }, [
      h('span', { class: 'set-ico' }, '🗑️'),
      h('div', { class: 'set-main' }, [
        h('div', { class: 'set-label' }, 'مسح جميع البيانات'),
        h('div', { class: 'set-sub' }, 'يحذف جميع البيانات المحفوظة على هذا الجهاز ولا يمكن التراجع عن العملية.')
      ]),
      h('button', { class: 'btn btn-danger btn-sm', onclick: () => fullWipeDialog(ctx) }, 'مسح')
    ])
  ]));

  /* ---------- about ---------- */
  view.appendChild(h('div', { class: 'set-group', style: 'margin-top:14px' }, [
    h('div', { class: 'set-group-title' }, ['ℹ️', 'حول التطبيق']),
    h('div', { class: 'set-row' }, [
      h('span', { class: 'set-ico' }, '📱'),
      h('div', { class: 'set-main' }, [
        h('div', { class: 'set-label' }, 'فلوسي | FLOUSY v1.0'),
        h('div', { class: 'set-sub' }, 'تطبيق محلي 100% — بياناتك على جهازك (IndexedDB)، يعمل بدون إنترنت، PWA قابل للتثبيت.'),
        h('div', { class: 'set-sub', style: 'margin-top:4px' }, `آخر تحديث بيانات: ${todayISO()}`)
      ])
    ])
  ]));

  paintIcons(view);
}

/* ---------- helpers ---------- */

/** Full local data wipe: confirm -> wipe -> verify -> toast -> safe reload.
    After reload the app behaves like a fresh install (onboarding shows again). */
async function fullWipeDialog(ctx) {
  const ok = await confirmDialog({
    title: 'مسح جميع البيانات',
    icon: '⚠️',
    message: 'سيتم حذف جميع بيانات FLOUSY المحفوظة على هذا الجهاز.\n\nسيتم حذف:\n• العمليات\n• الحسابات والأرصدة\n• الفواتير\n• الأهداف\n• الميزانيات\n• التصنيفات\n• المتكررات\n• إعدادات المستخدم\n\nلا يمكن التراجع عن هذه العملية.',
    confirmLabel: 'مسح جميع البيانات',
    cancelLabel: 'إلغاء',
    danger: true,
    emoji: '⚠️'
  });
  if (!ok) return;
  try {
    await ctx.wipeAllData();
  } catch (err) {
    toast('حصل خطأ أثناء المسح: ' + (err && err.message || err), { type: 'err', emoji: '⚠️', ms: 6000 });
    return;
  }
  toast('تم حذف جميع البيانات بنجاح.', { emoji: '🗑️', ms: 1500 });
  setTimeout(() => location.reload(), 700);
}

function switchEl(on, onChange) {
  const sw = h('button', {
    class: `switch${on ? ' on' : ''}`, role: 'switch', 'aria-checked': String(on), 'aria-label': 'تبديل'
  });
  sw.addEventListener('click', () => {
    const next = !sw.classList.contains('on');
    sw.classList.toggle('on', next);
    sw.setAttribute('aria-checked', String(next));
    onChange(next);
  });
  return sw;
}

function themeRow(ctx) {
  const st = ctx.state.settings;
  const mode = st.theme || 'auto';
  const opts = [
    { id: 'light', label: '☀️ فاتح' },
    { id: 'dark', label: '🌙 داكن' },
    { id: 'auto', label: '⚙️ تلقائي' }
  ];
  return h('div', { class: 'set-row' }, [
    h('span', { class: 'set-ico' }, mode === 'dark' ? '🌙' : '☀️'),
    h('div', { class: 'set-main' }, [
      h('div', { class: 'set-label' }, 'السمة'),
      h('div', { class: 'set-sub' }, mode === 'auto' ? 'يتبع إعدادات النظام' : mode === 'dark' ? 'وضع ليلي' : 'وضع نهاري')
    ]),
    h('select', {
      class: 'inp', style: 'width:118px', 'aria-label': 'السمة',
      onchange: async (e) => {
        await ctx.setSettings({ theme: e.target.value });
        ctx.applyTheme();
        ctx.refresh();
      }
    }, opts.map((o) => h('option', { value: o.id, selected: mode === o.id }, o.label)))
  ]);
}

function importBtn(ctx) {
  const input = h('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
  input.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    let text;
    try { text = await file.text(); } catch { toast('تعذر قراءة الملف', { type: 'err', emoji: '⚠️' }); return; }
    const res = parseBackup(text);
    if (!res.ok) { toast(res.error || 'الملف غير صالح', { type: 'err', emoji: '⚠️', ms: 5000 }); return; }
    const n = res.data.transactions.length;
    const ok = await confirmDialog({
      title: 'استرجاع البيانات',
      message: `الملف بيعرض ${fmtNum(n)} عملية. استرجاعه هياخد نسخة احتياطية تلقائية من بياناتك الحالية قبل ما يستبدلها. متابعة؟`,
      confirmLabel: 'استرجاع', emoji: '📥'
    });
    if (!ok) { e.target.value = ''; return; }
    // auto safety backup of current data
    const s = ctx.state;
    downloadFile(`flosy-auto-backup-${todayISO()}.json`, JSON.stringify(buildBackup({
      transactions: s.transactions, accounts: s.accounts, categories: s.categories,
      budgets: s.budgets, goals: s.goals, bills: s.bills, recurring: s.recurring, settings: s.settings
    }), null, 2));
    try {
      await replaceAll(res.data);
      await ctx.reload();
      toast('تم استرجاع البيانات بنجاح', { emoji: '📥' });
    } catch (err) {
      console.error(err);
      toast('فشل الاسترجاع — البيانات الأصلية سليمة', { type: 'err', emoji: '⚠️', ms: 5000 });
    }
    e.target.value = '';
  });
  const btn = h('button', { class: 'btn btn-soft btn-sm', onclick: () => input.click() }, 'استيراد');
  btn.appendChild(input);
  return btn;
}

async function profileModal(ctx) {
  const st = ctx.state.settings;
  const nameInp = h('input', { class: 'inp', value: st.userName || '', maxlength: 30, 'aria-label': 'الاسم' });
  const emoInp = h('input', {
    class: 'inp', value: st.userEmoji || '🧑', maxlength: 2,
    style: 'width:80px;text-align:center;font-size:24px', 'aria-label': 'أفيتر'
  });
  let api;
  api = openModal({
    title: 'الملف الشخصي',
    icon: '👤',
    body: () => h('div', {}, [
      h('div', { class: 'field' }, [h('label', {}, 'اسمك'), nameInp]),
      h('div', { class: 'field' }, [h('label', {}, 'الأفيتر (إيموجي)'), emoInp])
    ]),
    foot: () => [h('button', {
      class: 'btn btn-primary btn-block',
      onclick: async () => {
        const name = nameInp.value.trim().slice(0, 30);
        await ctx.setSettings({ userName: name, userEmoji: emoInp.value.trim() || '🧑' });
        api.close();
        if (!name && ctx.showOnboarding) { ctx.showOnboarding(); return; }
        ctx.refresh();
        toast(`أهلًا ${name}`, { emoji: '👋' });
      }
    }, 'حفظ')]
  });
}

/* ---------- PIN ---------- */

async function hashPin(pin, salt) {
  const text = `${salt}:${pin}`;
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch { /* fallback below */ }
  // FNV-1a fallback (not cryptographic, only for non-secure contexts)
  const fnv = (str, seed) => {
    let x = seed >>> 0;
    for (let i = 0; i < str.length; i++) {
      x ^= str.charCodeAt(i);
      x = Math.imul(x, 0x01000193) >>> 0;
    }
    return x.toString(16).padStart(8, '0');
  };
  return fnv(text, 0x811c9dc5) + fnv(text.split('').reverse().join(''), 0x1000193);
}

function pinSetModal(ctx, onDone) {
  const lenSel = h('select', { class: 'inp' }, [
    h('option', { value: '4', selected: true }, '4 أرقام'),
    h('option', { value: '6' }, '6 أرقام')
  ]);
  const p1 = h('input', { class: 'inp inp-num', inputmode: 'numeric', autocomplete: 'off', maxlength: 6, 'aria-label': 'رمز PIN جديد' });
  const p2 = h('input', { class: 'inp inp-num', inputmode: 'numeric', autocomplete: 'off', maxlength: 6, 'aria-label': 'تأكيد رمز PIN' });
  for (const inp of [p1, p2]) inp.addEventListener('input', () => { inp.value = inp.value.replace(/[^\d]/g, ''); });

  let api;
  api = openModal({
    title: 'تعدين رمز PIN',
    icon: '🔐',
    body: () => h('div', {}, [
      h('div', { class: 'field' }, [h('label', {}, 'طول الرمز'), lenSel]),
      h('div', { class: 'field' }, [h('label', {}, 'الرمز الجديد'), p1]),
      h('div', { class: 'field' }, [h('label', {}, 'تأكيد الرمز'), p2]),
      h('div', { class: 'hint' }, 'رمز PIN يحجب التطبيق محليًا — مش تشفير حقيقي للبيانات.')
    ]),
    foot: () => [h('button', {
      class: 'btn btn-primary btn-block',
      onclick: async () => {
        const len = Number(lenSel.value);
        if (!/^\d{4,6}$/.test(p1.value)) { toast('اكتب رمز من 4 أو 6 أرقام', { type: 'err', emoji: '⚠️' }); return; }
        if (p1.value.length !== len) { toast(`الرمز لازم يكون ${len} أرقام بالظبط`, { type: 'err', emoji: '⚠️' }); return; }
        if (p1.value !== p2.value) { toast('الرمزين مش متطابقين', { type: 'err', emoji: '⚠️' }); return; }
        const salt = uid();
        const hash = await hashPin(p1.value, salt);
        await ctx.setSettings({ pinEnabled: true, pinHash: hash, pinSalt: salt, pinLength: len });
        api.close();
        toast('قفل PIN مفعّل — هيفتح التطبيق من دل برمزك', { emoji: '🔐', ms: 4500 });
        onDone && onDone();
        ctx.lockApp();
      }
    }, 'تفعيل القفل')]
  });
  setTimeout(() => p1.focus(), 80);
}

async function pinChangeModal(ctx) {
  const st = ctx.state.settings;
  const oldInp = h('input', { class: 'inp inp-num', inputmode: 'numeric', maxlength: 6, 'aria-label': 'الرمز القديم' });
  const newInp = h('input', { class: 'inp inp-num', inputmode: 'numeric', maxlength: 6, 'aria-label': 'الرمز الجديد' });
  for (const inp of [oldInp, newInp]) inp.addEventListener('input', () => { inp.value = inp.value.replace(/[^\d]/g, ''); });

  let api;
  api = openModal({
    title: 'تغيير رمز PIN',
    icon: '🔐',
    body: () => h('div', {}, [
      h('div', { class: 'field' }, [h('label', {}, 'الرمز القديم'), oldInp]),
      h('div', { class: 'field' }, [h('label', {}, 'الرمز الجديد (4 أو 6 أرقام)'), newInp])
    ]),
    foot: () => [h('button', {
      class: 'btn btn-primary btn-block',
      onclick: async () => {
        if (!st.pinHash) { toast('مفيش PIN محدد', { type: 'err', emoji: '⚠️' }); return; }
        const oldHash = await hashPin(oldInp.value, st.pinSalt || '');
        if (oldHash !== st.pinHash) { toast('الرمز القديم غلط', { type: 'err', emoji: '⚠️' }); return; }
        if (!/^\d{4,6}$/.test(newInp.value)) { toast('الرمز الجديد لازم 4 أو 6 أرقام', { type: 'err', emoji: '⚠️' }); return; }
        const salt = uid();
        const hash = await hashPin(newInp.value, salt);
        await ctx.setSettings({ pinHash: hash, pinSalt: salt, pinLength: newInp.value.length });
        api.close();
        toast('تم تغيير الرمز', { emoji: '🔐' });
        ctx.refresh();
      }
    }, 'تغيير')]
  });
  setTimeout(() => oldInp.focus(), 80);
}

/* ---------- update check ---------- */

async function checkUpdateManually(ctx) {
  toast('جاري التحقق من التحديثات...', { emoji: '🔍', ms: 2000 });
  
  const result = await checkForUpdate();
  
  if (!result.available) {
    if (result.reason === 'offline') {
      toast('لا يمكن التحقق من التحديثات — تأكد من اتصالك بالإنترنت', { type: 'err', emoji: '📡', ms: 4000 });
    } else if (result.reason === 'invalid') {
      toast('خطأ في قراءة معلومات التحديث', { type: 'err', emoji: '⚠️', ms: 4000 });
    } else {
      toast('أنت تستخدم أحدث إصدار', { emoji: '✅', ms: 3000 });
    }
    return;
  }
  
  // Update available
  showUpdateDialog(result);
}

function showUpdateDialog(updateInfo) {
  const mandatory = updateInfo.mandatory;
  const title = mandatory ? 'تحديث إجباري' : 'تحديث متوفر';
  const icon = mandatory ? '⚠️' : '🎉';
  
  let message = `إصدار جديد متوفر: v${updateInfo.latestVersionName} (${updateInfo.latestVersionCode})\n\n`;
  message += `الإصدار الحالي: v${updateInfo.currentVersionName} (${updateInfo.currentVersionCode})\n\n`;
  
  if (updateInfo.releaseNotes) {
    message += `ما الجديد:\n${updateInfo.releaseNotes}\n\n`;
  }
  
  if (mandatory) {
    message += '⚠️ هذا التحديث إجباري ويجب تثبيته للاستمرار في استخدام التطبيق.';
  }
  
  const updateNowBtn = h('button', {
    class: mandatory ? 'btn btn-primary btn-block' : 'btn btn-primary',
    style: mandatory ? '' : 'flex:1',
    onclick: () => {
      if (!updateInfo.downloadUrl) {
        toast('رابط التحديث غير متوفر', { type: 'err', emoji: '⚠️', ms: 3000 });
        return;
      }
      openDownloadUrl(updateInfo.downloadUrl);
      api.close();
      toast('جاري فتح صفحة التنزيل...', { emoji: '📥', ms: 3000 });
    }
  }, 'تحديث الآن');
  
  const laterBtn = mandatory ? null : h('button', {
    class: 'btn btn-ghost',
    style: 'flex:1',
    onclick: () => {
      api.close();
      toast('يمكنك التحديث لاحقًا من الإعدادات', { emoji: 'ℹ️', ms: 3000 });
    }
  }, 'لاحقًا');
  
  const footerContent = mandatory 
    ? [updateNowBtn] 
    : [h('div', { style: 'display:flex;gap:8px;width:100%' }, [laterBtn, updateNowBtn])];
  
  let api;
  api = openModal({
    title,
    icon,
    body: () => h('div', { style: 'white-space:pre-wrap' }, message),
    foot: () => footerContent,
    closable: !mandatory
  });
}

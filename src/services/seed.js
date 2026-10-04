/* seed.js — optional demo data to showcase the UI */

import { uid } from '../database/db.js';
import { todayISO, toISODate, addDays } from '../utils/dates.js';

/** Deterministic PRNG so seed amounts stay stable. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const between = (rnd, a, b) => a + rnd() * (b - a);
const money = (n) => Math.round(n / 5) * 5;

export function buildSeedData() {
  const now = new Date();
  const today = todayISO();
  const todayDay = now.getDate();
  const rnd = mulberry32(20260403);

  const accounts = [
    { id: 'acc-cash', name: 'نقدي', emoji: '💵', type: 'cash', color: '#16A34A', openingBalance: 1500, active: true, createdAt: Date.now() },
    { id: 'acc-bank', name: 'بنك CIB', emoji: '🏦', type: 'bank', color: '#5B54D9', openingBalance: 0, active: true, createdAt: Date.now() },
    { id: 'acc-vodafone', name: 'فودافون كاش', emoji: '📱', type: 'wallet', color: '#EA580C', openingBalance: 300, active: true, createdAt: Date.now() }
  ];

  const txs = [];
  const push = (o) => txs.push({
    id: uid(),
    type: 'expense',
    paymentMethod: 'cash',
    notes: '',
    recurringId: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...o
  });

  const months = [];
  for (let i = 2; i >= 0; i--) months.push(new Date(now.getFullYear(), now.getMonth() - i, 1));

  const FOOD_DESC = ['مطعم شاورما', 'بيتزا', 'فرن البلدي', 'كلل من الخارج', 'مقهى', 'سندوتشات', 'حلويات', 'غداء مكتب'];
  const TRANSPORT_DESC = ['ميترو', 'تاكسي', 'أوبر', 'بترول', 'المواصلات', 'كاروبس'];
  const SHOP_DESC = ['شراحي من الأونلاين', 'شراحي من السوبر ماركت', 'إكسسوارات', 'ألعاب'];
  const FUN_DESC = ['سينما', 'اشتراك جيمينج', 'مطعم مع صحابي', 'كونسرت'];
  const HEALTH_DESC = ['صيدلية', 'علاجه أسنان', 'تحاليل'];
  const CLOTHES_DESC = ['قماشي جديد', 'إكسسوارات', 'حذاء'];
  const HOME_DESC = ['صلاحات البيت', 'أدوات مطبخ', 'تنضيف'];

  months.forEach((mStart, idx) => {
    const y = mStart.getFullYear();
    const m = mStart.getMonth();
    const isCurrent = idx === 2;
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const lastDay = isCurrent ? todayDay : daysInMonth;

    // ---- income ----
    if (lastDay >= 1) {
      push({
        type: 'income', amount: 18000, categoryId: 'cat-salary', accountId: 'acc-bank',
        date: `${y}-${p2(m + 1)}-01`, description: 'الراتب الشهري', paymentMethod: 'transfer'
      });
    }
    if (!isCurrent || lastDay >= 18) {
      const fDay = Math.min(isCurrent ? Math.min(todayDay, 19) : 18, 28);
      if (fDay >= 1 && rnd() > 0.25) {
        push({
          type: 'income', amount: money(between(rnd, 1500, 3200)), categoryId: 'cat-freelance',
          accountId: pick(rnd, ['acc-cash', 'acc-bank']),
          date: `${y}-${p2(m + 1)}-${p2(Math.max(2, Math.floor(between(rnd, 12, fDay + 1))))}`,
          description: 'عمل حر — مشروع واجهة', paymentMethod: 'card'
        });
      }
    }
    if (idx === 1 && lastDay >= 22) {
      push({
        type: 'income', amount: 4500, categoryId: 'cat-project', accountId: 'acc-bank',
        date: `${y}-${p2(m + 1)}-22`, description: 'استلام مشروع صغير', paymentMethod: 'transfer'
      });
    }

    // ---- expenses for each day ----
    for (let d = 1; d <= lastDay; d++) {
      const date = `${y}-${p2(m + 1)}-${p2(d)}`;
      const dow = new Date(y, m, d).getDay();
      const weekend = dow === 5 || dow === 6;

      // food: nearly daily, cheaper on weekdays
      if (rnd() < (weekend ? 0.9 : 0.75)) {
        push({
          amount: money(between(rnd, 45, weekend ? 260 : 150)), categoryId: 'cat-food',
          accountId: pick(rnd, ['acc-cash', 'acc-vodafone']),
          date, description: pick(rnd, FOOD_DESC), paymentMethod: pick(rnd, ['cash', 'card', 'wallet'])
        });
      }
      // transport
      if (rnd() < 0.55 && d !== now.getDate()) {
        push({
          amount: money(between(rnd, 20, weekend ? 180 : 90)), categoryId: 'cat-transport',
          accountId: 'acc-cash', date, description: pick(rnd, TRANSPORT_DESC)
        });
      }
      // bills: fixed days
      if (d === 5) push({ amount: 350, categoryId: 'cat-bills', accountId: 'acc-bank', date, description: 'إنترنت — فاتورة شهرية', paymentMethod: 'card' });
      if (d === 15) push({ amount: 150, categoryId: 'cat-telecom', accountId: 'acc-vodafone', date, description: 'فابون موبايل', paymentMethod: 'wallet' });
      if (d === 20) push({ amount: money(between(rnd, 280, 460)), categoryId: 'cat-bills', accountId: 'acc-bank', date, description: 'الكهرباء', paymentMethod: 'card' });
      if (d === 25 && !isCurrent) push({ amount: 600, categoryId: 'cat-edu', accountId: 'acc-bank', date, description: 'دروس', paymentMethod: 'card' });

      // weekend extras
      if (weekend && rnd() < 0.5) {
        push({
          amount: money(between(rnd, 80, 320)), categoryId: 'cat-fun',
          accountId: pick(rnd, ['acc-cash', 'acc-vodafone']),
          date, description: pick(rnd, FUN_DESC)
        });
      }
      // occasional shopping / clothes / health / home
      if (rnd() < 0.18) push({ amount: money(between(rnd, 120, 500)), categoryId: 'cat-shopping', accountId: pick(rnd, ['acc-cash', 'acc-bank']), date, description: pick(rnd, SHOP_DESC), paymentMethod: 'card' });
      if (rnd() < 0.06) push({ amount: money(between(rnd, 150, 600)), categoryId: 'cat-clothes', accountId: 'acc-cash', date, description: pick(rnd, CLOTHES_DESC) });
      if (rnd() < 0.05) push({ amount: money(between(rnd, 80, 350)), categoryId: 'cat-health', accountId: pick(rnd, ['acc-cash', 'acc-bank']), date, description: pick(rnd, HEALTH_DESC) });
      if (rnd() < 0.04) push({ amount: money(between(rnd, 80, 260)), categoryId: 'cat-home', accountId: 'acc-cash', date, description: pick(rnd, HOME_DESC) });
      if (rnd() < 0.03) push({ amount: money(between(rnd, 50, 200)), categoryId: 'cat-sports', accountId: 'acc-vodafone', date, description: 'صالات' });
    }

    // ---- transfers ----
    if (lastDay >= 3) {
      const tDay = Math.min(lastDay, Math.max(2, Math.floor(between(rnd, 4, Math.max(5, lastDay)))));
      push({
        type: 'transfer', amount: money(between(rnd, 1000, 2500)),
        accountId: 'acc-cash', toAccountId: 'acc-bank',
        date: `${y}-${p2(m + 1)}-${p2(tDay)}`,
        description: 'تحويل نقدي للبنك'
      });
    }
    if (isCurrent && lastDay >= 2 && todayDay > 2) {
      push({
        type: 'transfer', amount: 500,
        accountId: 'acc-bank', toAccountId: 'acc-vodafone',
        date: addDays(today, -Math.max(1, Math.floor(between(rnd, 0, 2)))),
        description: 'شحن محفظة'
      });
    }
  });

  // a couple of guaranteed "today" items for the demo
  push({ amount: 150, categoryId: 'cat-food', accountId: 'acc-cash', date: today, description: 'مطعم — غداء' });
  if (todayDay >= 2) {
    push({ amount: 120, categoryId: 'cat-transport', accountId: 'acc-cash', date: addDays(today, -1), description: 'أوبر' });
  }

  const budgets = [
    { id: 'bud-total', categoryId: null, label: 'الميزانية الشهرية', amount: 8000, createdAt: Date.now() },
    { id: 'bud-food', categoryId: 'cat-food', label: 'طعام', amount: 2500, createdAt: Date.now() },
    { id: 'bud-transport', categoryId: 'cat-transport', label: 'مواصلات', amount: 800, createdAt: Date.now() },
    { id: 'bud-fun', categoryId: 'cat-fun', label: 'ترفيه', amount: 500, createdAt: Date.now() },
    { id: 'bud-shopping', categoryId: 'cat-shopping', label: 'مشتريات', amount: 1000, createdAt: Date.now() },
    { id: 'bud-bills', categoryId: 'cat-bills', label: 'فواتير', amount: 500, createdAt: Date.now() }
  ];

  const goals = [
    {
      id: uid(), name: 'لابتوب جديد', emoji: '💻', targetAmount: 30000, currentAmount: 12500,
      deadline: toISODate(new Date(now.getFullYear(), now.getMonth() + 6, 1)), createdAt: Date.now(), color: '#5B54D9'
    },
    {
      id: uid(), name: 'سفر إجازة', emoji: '✈️', targetAmount: 15000, currentAmount: 4200,
      deadline: toISODate(new Date(now.getFullYear(), now.getMonth() + 3, 1)), createdAt: Date.now(), color: '#0D9488'
    }
  ];

  const bills = [
    { id: uid(), name: 'الإيجار', emoji: '🏠', amount: 5000, dueDay: 5, categoryId: 'cat-home', accountId: 'acc-bank', paid: todayDay > 5, paidDate: todayDay > 5 ? `${todayISO().slice(0, 7)}-05` : null, recurring: false, createdAt: Date.now() },
    { id: uid(), name: 'الإنترنت', emoji: '📶', amount: 350, dueDay: 10, categoryId: 'cat-bills', accountId: 'acc-bank', paid: todayDay > 10, paidDate: todayDay > 10 ? `${todayISO().slice(0, 7)}-10` : null, recurring: false, createdAt: Date.now() },
    { id: uid(), name: 'الهاتف', emoji: '📞', amount: 150, dueDay: 15, categoryId: 'cat-telecom', accountId: 'acc-vodafone', paid: todayDay > 15, paidDate: todayDay > 15 ? `${todayISO().slice(0, 7)}-15` : null, recurring: false, createdAt: Date.now() },
    { id: uid(), name: 'الكهرباء', emoji: '💡', amount: 420, dueDay: 20, categoryId: 'cat-bills', accountId: 'acc-bank', paid: false, paidDate: null, recurring: false, createdAt: Date.now() },
    { id: uid(), name: 'الدروس', emoji: '🎓', amount: 600, dueDay: 25, categoryId: 'cat-edu', accountId: 'acc-bank', paid: false, paidDate: null, recurring: false, createdAt: Date.now() }
  ];

  const recurring = [
    { id: 'rec-netflix', name: 'اشتراك نتفليكس', emoji: '📺', amount: 160, frequency: 'monthly', categoryId: 'cat-fun', accountId: 'acc-vodafone', nextDueDate: toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 15)), active: true, createdAt: Date.now() },
    { id: 'rec-gym', name: 'صالات', emoji: '🏋️', amount: 300, frequency: 'monthly', categoryId: 'cat-sports', accountId: 'acc-vodafone', nextDueDate: toISODate(new Date(now.getFullYear(), now.getMonth(), 3)), active: true, createdAt: Date.now() }
  ];

  return { transactions: txs, accounts, budgets, goals, bills, recurring };
}

function p2(n) { return (n < 10 ? '0' : '') + n; }

/* defaults.js — default settings, categories, accounts for first run */

export const DEFAULT_SETTINGS = {
  userName: '',
  userEmoji: '🧑',
  currency: 'EGP',
  theme: 'auto',
  notifications: true,
  firstDayOfMonth: 1,
  pinEnabled: false,
  pinHash: null,
  pinSalt: null,
  pinLength: 4,
  isSeed: false,
  lastAccount: 'acc-cash',
  lastCategory: null,
  lastIncomeCategory: null,
  lastPayment: 'cash',
  notifsSeen: []
};

const PALETTE = [
  '#5B54D9', '#E11D48', '#16A34A', '#0284C7', '#D97706',
  '#9333EA', '#0D9488', '#DB2777', '#B45309', '#475569',
  '#7C3AED', '#059669', '#C026D3', '#EA580C', '#64748B'
];

const INCOME_CATS = [
  ['cat-salary', '💼', 'الراتب'],
  ['cat-freelance', '💻', 'العمل الحر'],
  ['cat-project', '🛒', 'مشروع'],
  ['cat-gift', '🎁', 'هدية'],
  ['cat-invest', '💰', 'استثمار'],
  ['cat-sell', '📦', 'بيع'],
  ['cat-income-other', '➕', 'أخرى']
];

const EXPENSE_CATS = [
  ['cat-food', '🍔', 'طعام'],
  ['cat-transport', '🚗', 'مواصلات'],
  ['cat-home', '🏠', 'منزل'],
  ['cat-shopping', '🛒', 'مشتريات'],
  ['cat-health', '💊', 'صحة'],
  ['cat-edu', '📚', 'تعليم'],
  ['cat-fun', '🎮', 'ترفيه'],
  ['cat-telecom', '📱', 'اتصالات'],
  ['cat-bills', '💡', 'فواتير'],
  ['cat-clothes', '👕', 'ملابس'],
  ['cat-sports', '🏋️', 'رياضة'],
  ['cat-travel', '✈️', 'سفر'],
  ['cat-gifts', '🎁', 'هدايا'],
  ['cat-invest-exp', '💰', 'استثمار'],
  ['cat-other', '📦', 'أخرى']
];

export function defaultCategories() {
  const out = [];
  let i = 0;
  for (const [id, emoji, name] of INCOME_CATS) {
    out.push({ id, emoji, name, type: 'income', color: PALETTE[i++ % PALETTE.length], builtIn: true });
  }
  i = 0;
  for (const [id, emoji, name] of EXPENSE_CATS) {
    out.push({ id, emoji, name, type: 'expense', color: PALETTE[i++ % PALETTE.length], builtIn: true });
  }
  return out;
}

export function defaultAccounts() {
  return [
    { id: 'acc-cash', name: 'نقدي', emoji: '💵', type: 'cash', color: '#16A34A', openingBalance: 0, active: true, createdAt: Date.now() },
    { id: 'acc-bank', name: 'حساب بنكي', emoji: '🏦', type: 'bank', color: '#5B54D9', openingBalance: 0, active: true, createdAt: Date.now() }
  ];
}

export const EXTRA_ACCOUNT_TYPES = [
  { type: 'cash', emoji: '💵', label: 'نقدي' },
  { type: 'bank', emoji: '🏦', label: 'حساب بنكي' },
  { type: 'card', emoji: '💳', label: 'بطاقة' },
  { type: 'wallet', emoji: '📱', label: 'محفظة إلكترونية' },
  { type: 'custom', emoji: '💎', label: 'حساب مخصص' }
];

export const ACCOUNT_ICONS = ['💵', '🏦', '💳', '📱', '💎', '🪙', '💰', '👛', '🏛️', '✋'];

export const GOAL_ICONS = ['🎯', '🚗', '💻', '📱', '✈️', '🏠', '🎓', '💍', '🎮', '⌚', '📷', '🛵', '🐕', '🎁', '🏖️', '💪'];

export const BILL_ICONS = ['💡', '📱', '🏠', '📞', '🎓', '💳', '📺', '🧾', '⚕️', '🖥️', '📶', '🔌'];

export const PAYMENT_METHODS = [
  { id: 'cash', label: 'نقدي' },
  { id: 'card', label: 'بطاقة' },
  { id: 'wallet', label: 'محفظة' },
  { id: 'transfer', label: 'تحويل' },
  { id: 'credit', label: 'آجل' }
];

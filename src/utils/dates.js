/* dates.js — date/time helpers for FLOUSY (all dates are local 'YYYY-MM-DD') */

const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
const AR_DAYS = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

export function pad2(n) { return n < 10 ? `0${n}` : String(n); }

export function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayISO() { return toISODate(new Date()); }

export function parseISO(s) {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** YYYY-MM from an ISO date */
export function monthKeyOf(isoOrDate, firstDay = 1) {
  let d;
  if (typeof isoOrDate === 'string') d = parseISO(isoOrDate);
  else if (isoOrDate instanceof Date) d = isoOrDate;
  else return null;
  if (!d) return null;
  if (firstDay > 1 && d.getDate() < firstDay) d = new Date(d.getFullYear(), d.getMonth() - 1, firstDay);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function monthKeyFrom(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }

export function parseMonthKey(key) {
  const [y, m] = String(key).split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1);
}

export function prevMonthKey(key) {
  const d = parseMonthKey(key);
  return monthKeyFrom(new Date(d.getFullYear(), d.getMonth() - 1, 1));
}
export function nextMonthKey(key) {
  const d = parseMonthKey(key);
  return monthKeyFrom(new Date(d.getFullYear(), d.getMonth() + 1, 1));
}

export function monthLabel(key, firstDay = 1) {
  const d = parseMonthKey(key);
  const name = AR_MONTHS[d.getMonth()];
  if (firstDay > 1) {
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    return `${name} ${d.getFullYear()}`;
  }
  return `${name} ${d.getFullYear()}`;
}

export function shortMonthLabel(key) {
  const d = parseMonthKey(key);
  return AR_MONTHS[d.getMonth()];
}

export function lastMonthKeys(n, firstDay = 1) {
  const t = monthKeyOf(todayISO(), firstDay);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = parseMonthKey(t);
    out.push(monthKeyFrom(new Date(d.getFullYear(), d.getMonth() - i, 1)));
  }
  return out;
}

/**
 * Range [start, endExclusive) for a cycle month key given firstDay (1 or 15).
 */
export function monthRange(key, firstDay = 1) {
  const d = parseMonthKey(key);
  const start = new Date(d.getFullYear(), d.getMonth(), firstDay);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, firstDay);
  return { start, end: end <= start ? new Date(d.getFullYear(), d.getMonth() + 1, 1) : end };
}

export function rangeToISO({ start, end }) {
  return { from: toISODate(start), to: toISODate(new Date(end.getTime() - 864e5)) };
}

/** Days elapsed within the current cycle up to today (inclusive). 0 if cycle hasn't started yet. */
export function daysElapsedInCycle(key, firstDay = 1) {
  const { start, end } = monthRange(key, firstDay);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today < start) return 0;
  if (today >= end) return Math.round((end - start) / 864e5);
  return Math.round((today - start) / 864e5) + 1;
}

export function cycleDays(key, firstDay = 1) {
  const { start, end } = monthRange(key, firstDay);
  return Math.round((end - start) / 864e5);
}

export function addDays(iso, n) {
  const d = parseISO(iso) || new Date();
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function addMonthsClamped(iso, n) {
  const d = parseISO(iso) || new Date();
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const maxDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, maxDay));
  return toISODate(target);
}

export function daysBetween(aISO, bISO) {
  const a = parseISO(aISO), b = parseISO(bISO);
  if (!a || !b) return 0;
  return Math.round((b - a) / 864e5);
}

export function isSameDay(aISO, bISO) { return String(aISO).slice(0, 10) === String(bISO).slice(0, 10); }

export function relDayLabel(iso, today = todayISO()) {
  const diff = daysBetween(today, iso);
  if (diff === 0) return 'اليوم';
  if (diff === 1) return 'غدًا';
  if (diff === -1) return 'أمس';
  if (diff > 1 && diff <= 14) return `بعد ${fmtSmall(diff)} ${diff === 2 ? 'يومين' : 'أيام'}`;
  if (diff < -1 && diff >= -14) return `قبل ${fmtSmall(-diff)} ${-diff === 2 ? 'يومين' : 'أيام'}`;
  return dayLabel(iso);
}

export function dayLabel(iso) {
  const d = parseISO(iso);
  if (!d) return '';
  return `${AR_DAYS[d.getDay()]} ${d.getDate()} ${AR_MONTHS[d.getMonth()]}`;
}

export function shortDayLabel(iso) {
  const d = parseISO(iso);
  if (!d) return '';
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]}`;
}

export function groupLabel(iso, today = todayISO()) {
  if (isSameDay(iso, today)) return 'اليوم';
  if (isSameDay(iso, addDays(today, -1))) return 'أمس';
  const d = parseISO(iso);
  if (!d) return '';
  return `${AR_DAYS[d.getDay()]} ${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtSmall(n) {
  if (n === 2) return '٢';
  return String(n).replace(/[0-9]/g, (c) => '٠١٢٣٤٥٦٧٨٩'[c]);
}

export const AR_MONTHS_ = AR_MONTHS;
export const AR_DAYS_ = AR_DAYS;

/** Week range (Mon–Sun) containing the date, or "this week" from today. */
export function weekRangeISO(anchorISO = todayISO()) {
  const d = parseISO(anchorISO) || new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  return { from: toISODate(mon), to: toISODate(sun) };
}

export function yearRangeISO(year) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function hoursAgoLabel(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'الآن';
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  const dd = Math.floor(h / 24);
  return `منذ ${dd} يوم`;
}

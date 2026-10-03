/* format.js — currency, numbers, amount parsing */

export const CURRENCIES = {
  EGP: { symbol: 'جنيه', label: 'جنيه مصري (EGP)' },
  USD: { symbol: '$', label: 'دولار أمريكي (USD)' },
  EUR: { symbol: '€', label: 'يورو (EUR)' },
  SAR: { symbol: 'ر.س', label: 'ريال سعودي (SAR)' },
  AED: { symbol: 'د.إ', label: 'درهم إماراتي (AED)' },
  GBP: { symbol: '£', label: 'جنيه إسترليني (GBP)' }
};

export function currencySymbol(code = 'EGP') {
  return (CURRENCIES[code] || CURRENCIES.EGP).symbol;
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/** Normalize Arabic/Persian digits to latin. */
export function normalizeDigits(str) {
  if (typeof str !== 'string') return '';
  let out = '';
  for (const ch of str) {
    const a = AR_DIGITS.indexOf(ch);
    if (a > -1) { out += String(a); continue; }
    const f = FA_DIGITS.indexOf(ch);
    if (f > -1) { out += String(f); continue; }
    out += ch;
  }
  return out;
}

/**
 * Parse an amount input. Accepts "1,250.50", "١٢٥٠٫٥", "2.500,50".
 * Returns a positive finite number, or null if invalid.
 * Rejects negatives, zero, non-numeric and absurdly large values.
 */
export function parseAmount(raw) {
  if (raw == null) return null;
  let s = normalizeDigits(String(raw)).trim();
  if (!s) return null;
  // Arabic decimal comma / thousands separators
  s = s.replace(/\u066B/g, '.').replace(/[\u064C\u066C]/g, ',');
  // Strip currency symbols and words
  s = s.replace(/[$€£]|\s*ج\.?\s*م?|\s*جنيه|ر\.س|د\.إ/g, '');
  s = s.replace(/[^\d.,-]/g, '');
  if (!s) return null;
  // Determine decimal separator
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) { s = s.replace(/\./g, '').replace(',', '.'); }
    else { s = s.replace(/,/g, ''); }
  } else if (lastComma > -1) {
    // Ambiguous single comma: "1,250" / "1,25" — treat as thousands separator
    // (the app displays thousands with a separator and decimals with a dot).
    s = s.replace(/,/g, '');
  }
  if (!/^[-+]?(\d+([.,]\d*)?|[.,]\d+)$/.test(s)) return null;
  s = s.replace(',', '.');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  if (n > 1e13) return null;
  // round to 2 decimals to avoid float dust
  return Math.round(n * 100) / 100;
}

/** Format a number with ar-EG grouping and Latin digits. */
export function fmtNum(n, { maxFrac = 2 } = {}) {
  if (n == null || !Number.isFinite(n)) return '0';
  const neg = n < 0;
  const abs = Math.abs(n);
  const needsFrac = abs % 1 > 0.004;
  const frac = needsFrac ? Math.min(maxFrac, 2) : 0;
  let s = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: frac,
    maximumFractionDigits: frac
  }).format(abs);
  s = s.replace(/,/g, '٬');
  return neg ? `−${s}` : s;
}

/** Format money: "12,450 جنيه" style */
export function fmtMoney(n, currency = 'EGP', { withUnit = true } = {}) {
  const sym = currencySymbol(currency);
  const num = fmtNum(n, { maxFrac: 2 });
  if (!withUnit) return num;
  return `${num} ${sym}`;
}

/** Compact money for chart axes: 5.5 ألف / 1.2 مليون */
export function fmtMoneyCompact(n, currency = 'EGP') {
  if (n == null || !Number.isFinite(n)) return '0';
  const a = Math.abs(n);
  let s;
  if (a >= 1e9) s = `${fmtNum(n / 1e9, { maxFrac: 1 })} مليار`;
  else if (a >= 1e6) s = `${fmtNum(n / 1e6, { maxFrac: 1 })} مليون`;
  else if (a >= 1e4) s = `${fmtNum(n / 1e3, { maxFrac: 1 })} ألف`;
  else s = fmtNum(n, { maxFrac: a % 1 > 0.5 ? 1 : 0 });
  return s;
}

export function fmtPct(ratio, { maxFrac = 0 } = {}) {
  if (ratio == null || !Number.isFinite(ratio)) return '—';
  return `${fmtNum(ratio * 100, { maxFrac })}٪`;
}

export function signedNum(n) {
  const s = fmtNum(Math.abs(n), { maxFrac: 2 });
  return n >= 0 ? `+${s}` : `−${s}`;
}

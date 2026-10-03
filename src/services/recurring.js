/* recurring.js — auto-generate transactions for due recurring expenses */

import { addDays, addMonthsClamped, todayISO } from '../utils/dates.js';
import { uid } from '../database/db.js';

const FREQ_ADD = {
  daily: (iso) => addDays(iso, 1),
  weekly: (iso) => addDays(iso, 7),
  monthly: (iso) => addMonthsClamped(iso, 1),
  yearly: (iso) => addMonthsClamped(iso, 12)
};

export function freqLabel(freq) {
  return { daily: 'يوميًا', weekly: 'أسبوعيًا', monthly: 'شهريًا', yearly: 'سنويًا' }[freq] || freq;
}

/**
 * For each active recurring, generate transactions for every missed due date up to today.
 * Returns { newTxs, updatedRecurring }
 */
export function generateDue(recurring, existingTx, today = todayISO()) {
  const newTxs = [];
  const updated = [];
  const existingKeys = new Set(existingTx.filter((t) => t.recurringId).map((t) => `${t.recurringId}|${t.date}`));

  for (const r of recurring) {
    if (!r || r.active === false) continue;
    let next = r.nextDueDate;
    if (!next) continue;
    const add = FREQ_ADD[r.frequency] || FREQ_ADD.monthly;
    let changed = false;
    let guard = 0;

    while (next <= today && guard < 400) {
      guard++;
      const key = `${r.id}|${next}`;
      if (!existingKeys.has(key)) {
        newTxs.push({
          id: uid(),
          type: 'expense',
          amount: Number(r.amount) || 0,
          categoryId: r.categoryId || null,
          accountId: r.accountId || null,
          date: next,
          description: r.name || 'مصروف متكرر',
          notes: r.name ? `مصروف متكرر — ${r.name}` : 'مصروف متكرر',
          paymentMethod: 'cash',
          recurringId: r.id,
          createdAt: Date.now(),
          updatedAt: Date.now()
        });
      }
      next = add(next);
      changed = true;
    }
    if (changed) updated.push({ ...r, nextDueDate: next });
  }
  return { newTxs, updated };
}

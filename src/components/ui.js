/* ui.js — modals, action sheets, toasts, empty states, confirm dialogs */

import { h, clear, $, $$, paintIcons } from '../utils/dom.js';

/* ---------------- Modals ---------------- */

let topModals = [];

/**
 * openModal({ title, icon?, body: Node|fn, foot: Node|fn, wide? })
 * returns { close }
 */
export function openModal({ title, icon, body, foot, wide = false, onOpen }) {
  const root = $('#modalsRoot');
  const backdrop = h('div', { class: 'modal-backdrop', role: 'presentation' });
  const panel = h('div', { class: `modal-panel${wide ? ' modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title });

  const head = h('div', { class: 'modal-head' }, [
    icon ? h('span', { class: 'modal-ico', 'aria-hidden': 'true' }, icon) : null,
    h('h2', {}, title || ''),
    h('button', { class: 'icon-btn modal-close', 'aria-label': 'إغلاق', onclick: close }, h('span', { 'data-ic': 'x' }))
  ]);

  const bodyEl = h('div', { class: 'modal-body' });
  bodyEl.appendChild(typeof body === 'function' ? body() : body);

  panel.appendChild(h('div', { class: 'modal-grab' }));
  panel.appendChild(head);
  panel.appendChild(bodyEl);
  if (foot) panel.appendChild(h('div', { class: 'modal-foot' }, typeof foot === 'function' ? foot() : foot));

  const wrap = h('div', { class: 'modal-wrap' });
  wrap.appendChild(backdrop);
  wrap.appendChild(panel);
  root.appendChild(wrap);

  backdrop.addEventListener('click', close);
  const onKey = (e) => { if (e.key === 'Escape' && topModals[topModals.length - 1] === api) close(); };
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';

  function close() {
    document.removeEventListener('keydown', onKey);
    const idx = topModals.indexOf(api);
    if (idx > -1) topModals.splice(idx, 1);
    wrap.remove();
    if (topModals.length === 0) document.body.style.overflow = '';
  }

  const api = { close, panel, bodyEl };
  topModals.push(api);

  requestAnimationFrame(() => wrap.classList.add('modal-open'));
  paintIcons(panel);
  onOpen && onOpen(api);
  return api;
}

export function closeTopModal() {
  const t = topModals[topModals.length - 1];
  if (t) t.close();
}

/* ---------------- Action sheet (FAB menu) ---------------- */

let sheetApi = null;

/**
 * items: [{ emoji, label, sub?, danger?, onClick }]
 * anchor: element to position near (defaults to FAB bottom-center)
 */
export function openSheet(items, anchor) {
  closeSheet();
  const back = h('div', { class: 'sheet-backdrop' });
  const menu = h('div', { class: 'sheet-menu', role: 'menu' });
  for (const it of items) {
    menu.appendChild(h('button', {
      class: `sheet-item${it.danger ? ' danger' : ''}`,
      role: 'menuitem',
      onclick: () => { closeSheet(); it.onClick && it.onClick(); }
    }, [
      it.emoji ? h('span', { class: 'em', 'aria-hidden': 'true' }, it.emoji) : null,
      h('span', {}, [it.label, it.sub ? h('span', { class: 'sub' }, it.sub) : null])
    ]));
  }
  document.body.appendChild(back);
  document.body.appendChild(menu);

  const fab = anchor || $('#fab');
  const rect = fab ? fab.getBoundingClientRect() : { left: 24, right: 24, top: window.innerHeight - 140, bottom: window.innerHeight - 80 };
  const mw = menu.offsetWidth || 230;
  const left = Math.max(10, Math.min(window.innerWidth - mw - 10, rect.left + rect.width / 2 - mw / 2));
  const top = Math.max(10, rect.top - 8);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;

  const fabEl = anchor ? fab : null;
  fabEl && fabEl.classList.add('open');

  function dismiss() {
    closeSheet();
  }
  back.addEventListener('click', dismiss);
  const onKey = (e) => e.key === 'Escape' && dismiss();
  document.addEventListener('keydown', onKey);

  requestAnimationFrame(() => menu.classList.add('open'));
  sheetApi = {
    close() {
      menu.remove();
      back.remove();
      document.removeEventListener('keydown', onKey);
      fabEl && fabEl.classList.remove('open');
      if (sheetApi === this) sheetApi = null;
    }
  };
  return sheetApi;
}

export function closeSheet() {
  if (sheetApi) sheetApi.close();
}

/* ---------------- Toasts ---------------- */

export function toast(msg, { type = 'ok', ms = 3200, emoji = '✅' } = {}) {
  const root = $('#toastsRoot');
  const t = h('div', { class: `toast ${type}`, role: 'status' }, [
    emoji ? h('span', { class: 'em', 'aria-hidden': 'true' }, emoji) : null,
    h('span', {}, msg)
  ]);
  root.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 260);
  }, ms);
}

/* ---------------- Confirm ---------------- */

export function confirmDialog({ title, message, confirmLabel = 'تأكيد', cancelLabel = 'إلغاء', danger = false, emoji = '⚠️' }) {
  return new Promise((resolve) => {
    const api = openModal({
      title,
      icon: emoji,
      body: () => h('p', { style: 'font-size:14.5px;color:var(--text-2);font-weight:600;line-height:1.9;white-space:pre-line' }, message),
      foot: () => [
        h('button', { class: `btn btn-ghost`, onclick: () => { api.close(); resolve(false); } }, cancelLabel),
        h('button', {
          class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`,
          onclick: () => { api.close(); resolve(true); }
        }, confirmLabel)
      ]
    });
    // focus confirm
    setTimeout(() => { const b = api.bodyEl.parentElement.querySelector('.btn-danger, .btn-primary'); b && b.focus(); }, 60);
  });
}

/* ---------------- Empty state ---------------- */

export function emptyState({ emoji = '👀', title = 'لسه مفيش بيانات', text = '', actionLabel, onAction, card = false }) {
  const box = card ? h('div', { class: 'card' }) : h('div');
  const inner = h('div', { class: 'empty' }, [
    h('div', { class: 'em', 'aria-hidden': 'true' }, emoji),
    h('h3', {}, title),
    text ? h('p', {}, text) : null,
    actionLabel ? h('button', { class: 'btn btn-primary', onclick: onAction }, `+ ${actionLabel}`) : null
  ]);
  box.appendChild(inner);
  return box;
}

/* ---------------- Small helpers ---------------- */

export function sectionTitle(title, { icon, sub, onMore, moreLabel } = {}) {
  return h('div', { class: 'section-title' }, [
    icon ? h('span', { 'data-ic': icon, 'aria-hidden': 'true' }) : null,
    h('h3', { style: 'font-size:16.5px;font-weight:800' }, title),
    sub ? h('span', { class: 'card-sub' }, sub) : null,
    h('span', { class: 'grow' }),
    onMore ? h('a', { class: 'link-mini', href: moreLabel ? '#' : null, onclick: (e) => { e.preventDefault(); onMore(); } }, moreLabel || 'عرض الكل') : null
  ]);
}

export function resetPaint(root) {
  paintIcons(root);
}

export { $$ };

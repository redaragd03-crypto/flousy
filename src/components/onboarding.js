/* components/onboarding.js — first-run name screen (no hardcoded user names) */

import { h, clear, paintIcons } from '../utils/dom.js';

/**
 * Shows a full-screen "enter your name" overlay.
 * Returns { close, el, input } or null if a name already exists.
 */
export function showOnboarding(ctx) {
  const root = document.getElementById('onboardingRoot');
  if (!root || ctx.state.settings.userName) return null;

  clear(root);
  const input = h('input', {
    id: 'onbName', class: 'inp', type: 'text', maxlength: 30,
    placeholder: 'اكتب اسمك هنا', autocomplete: 'off', 'aria-label': 'اسمك'
  });
  const err = h('div', { class: 'onb-err', role: 'alert' }, 'اكتب اسمك الأول عشان ندخل');
  err.classList.add('hidden');
  const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, 'دخول');

  const card = h('div', { class: 'onb-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'تعارف' }, [
    h('div', { class: 'onb-emoji', 'aria-hidden': 'true' }, '👋'),
    h('h1', { class: 'onb-title' }, 'أهلًا بك في فلوسي'),
    h('p', { class: 'onb-sub' }, 'قبل ما نبدأ، اكتب اسمك وبننادك بيه في كل مكان.'),
    h('div', { class: 'field', style: 'margin-top:18px' }, input),
    err,
    btn
  ]);
  root.appendChild(card);
  root.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  paintIcons(root);

  const finish = () => {
    root.classList.add('hidden');
    clear(root);
    document.body.style.overflow = '';
  };

  const submit = async () => {
    const name = input.value.trim().slice(0, 30);
    if (!name) {
      err.classList.remove('hidden');
      input.focus();
      return;
    }
    err.classList.add('hidden');
    btn.disabled = true;
    await ctx.setSettings({ userName: name });
    finish();
    ctx.refresh();
  };

  btn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });

  setTimeout(() => input.focus(), 60);
  return { close: finish, el: root, input };
}

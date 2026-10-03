/* dom.js — safe DOM helpers (no innerHTML with user data) */

const NS = 'http://www.w3.org/2000/svg';

/**
 * Create an element.
 * h('div', {class:'x', onclick:fn, 'data-id':'1'}, [children...])
 * children: string | number | Node | array
 */
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v; // only for trusted static markup
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'selected') el.selected = !!v;
      else if (k === 'disabled') el.disabled = !!v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && k !== 'list') { try { el[k] = v; } catch { el.setAttribute(k, String(v)); } }
      else el.setAttribute(k, String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  if (children == null) return;
  if (!Array.isArray(children)) children = [children];
  for (const c of children) {
    if (c == null || c === false) continue;
    el.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

/** Animate a number counter in an element. */
export function animNumber(el, to, { duration = 850, format = (n) => String(Math.round(n)), from = 0 } = {}) {
  if (!el) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || duration <= 0) { el.textContent = format(to); return; }
  const start = performance.now();
  const delta = to - from;
  function tick(now) {
    const p = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = format(from + delta * eased);
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = format(to);
  }
  requestAnimationFrame(tick);
}

/** Set a progress bar: <div class="progress"><i></i></div> */
export function setProgress(el, ratio, cls = '') {
  if (!el) return;
  const bar = el.querySelector('i') || el;
  const r = clamp(ratio || 0, 0, 10);
  el.classList.remove('ok', 'warn', 'danger');
  if (cls) el.classList.add(cls);
  requestAnimationFrame(() => { bar.style.width = `${Math.min(100, r * 100)}%`; });
}

/**
 * Paint all [data-ic] placeholders inside root with real SVG icons.
 * Icons are registered on window.__flosyIcons by components/icons.js.
 */
export function paintIcons(root = document) {
  const map = window.__flosyIcons;
  if (!map) return;
  $$('[data-ic]', root).forEach((el) => {
    const name = el.getAttribute('data-ic');
    if (el.dataset.painted === name) return;
    el.dataset.painted = name;
    while (el.firstChild) el.removeChild(el.firstChild);
    if (!map[name]) return;
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.appendChild(map[name].cloneNode(true));
    el.classList.add('ic');
    el.appendChild(svg);
  });
}

/** Build a standalone icon span (for dynamically generated content). */
export function iconSpan(name, cls = 'ic') {
  const map = window.__flosyIcons || {};
  const wrap = document.createElement('span');
  wrap.className = cls;
  if (map[name]) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.appendChild(map[name].cloneNode(true));
    wrap.appendChild(svg);
  }
  return wrap;
}

export function nextTick(fn) { return new Promise((r) => requestAnimationFrame(() => r(fn && fn()))); }

export function setDocTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
}

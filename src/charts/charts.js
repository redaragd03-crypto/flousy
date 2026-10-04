/* charts.js — lightweight SVG charts (donut, bars, line, hbars) */

import { h, clear } from '../utils/dom.js';
import { fmtMoney, fmtMoneyCompact, fmtPct, fmtNum } from '../utils/format.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

function emptyBox(parent, label = 'مفيش بيانات كافية لعرض الرسم') {
  clear(parent);
  parent.appendChild(h('div', { class: 'chart-empty' }, label));
}

/**
 * Donut chart.
 * items: [{label, value, color, emoji?}]
 */
export function donut(parent, items, { size = 210, thickness = 30, centerLabel = '', currency = 'EGP', maxItems = 6 } = {}) {
  clear(parent);
  const total = items.reduce((a, b) => a + b.value, 0);
  if (!items.length || total <= 0) return emptyBox(parent);

  const data = items.slice(0, maxItems);
  const rest = total - data.reduce((a, b) => a + b.value, 0);
  if (rest > 0.001) data.push({ label: 'باقي البنود', value: rest, color: '#9CA3AF', emoji: '' });

  const vb = 240;
  const r = (vb - thickness) / 2 - 4;
  const c = 2 * Math.PI * r;
  const svg = svgEl('svg', { viewBox: `0 0 ${vb} ${vb}`, width: '100%', style: `max-width:${size}px` });

  // track
  svg.appendChild(svgEl('circle', { cx: vb / 2, cy: vb / 2, r, fill: 'none', stroke: 'var(--surface-3)', 'stroke-width': thickness, class: 'donut-track' }));

  let offset = 0;
  const gap = data.length > 1 ? 2.2 : 0;
  data.forEach((d, i) => {
    const frac = d.value / total;
    const len = Math.max(0.5, frac * c - gap);
    const el = svgEl('circle', {
      cx: vb / 2, cy: vb / 2, r,
      fill: 'none',
      stroke: d.color || '#5B54D9',
      'stroke-width': thickness,
      'stroke-linecap': 'butt',
      'stroke-dasharray': `${len} ${c - len}`,
      'stroke-dashoffset': String(-offset),
      transform: `rotate(-90 ${vb / 2} ${vb / 2})`,
      class: 'donut-seg'
    });
    el.style.transition = 'stroke-dasharray 0.9s cubic-bezier(0.22,1,0.36,1)';
    const t = svgEl('title');
    t.textContent = `${d.label}: ${fmtMoney(d.value, currency)} (${fmtPct(frac)})`;
    el.appendChild(t);
    svg.appendChild(el);
    // animate from 0
    el.setAttribute('stroke-dasharray', `0 ${c}`);
    requestAnimationFrame(() => requestAnimationFrame(() => el.setAttribute('stroke-dasharray', `${len} ${c - len}`)));
    offset += frac * c;
  });

  if (centerLabel || true) {
    const label = svgEl('text', { x: vb / 2, y: vb / 2 - 8, 'text-anchor': 'middle', class: 'donut-center-label' });
    label.textContent = centerLabel || 'الإجمالي';
    svg.appendChild(label);
    const val = svgEl('text', { x: vb / 2, y: vb / 2 + 16, 'text-anchor': 'middle', class: 'donut-center-value' });
    val.textContent = fmtMoneyCompact(total, currency);
    svg.appendChild(val);
  }

  const wrap = h('div', { class: 'donut-wrap' });
  wrap.appendChild(svg);

  const legend = h('div', { class: 'legend' });
  for (const d of items.slice(0, 6)) {
    legend.appendChild(h('div', { class: 'legend-item' }, [
      h('span', { class: 'dot', style: `background:${d.color}` }),
      h('span', {}, `${d.emoji ? d.emoji + ' ' : ''}${d.label}`),
      h('span', { class: 'lv' }, [fmtMoney(d.value, currency), h('span', { class: 'lp' }, fmtPct(d.value / total))])
    ]));
  }
  wrap.appendChild(legend);
  parent.appendChild(wrap);
}

/**
 * Grouped bar chart (e.g. income vs expense per month).
 * groups: [{label, bars: [{value, color, name}]}]
 */
export function bars(parent, groups, { height = 230, currency = 'EGP', valueLabel = true } = {}) {
  clear(parent);
  const usable = groups.filter((g) => g.bars.some((b) => b.value > 0));
  if (!usable.length) return emptyBox(parent);

  const W = 720, H = height;
  const padL = 12, padR = 12, padT = 26, padB = 34;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const maxV = Math.max(...usable.flatMap((g) => g.bars.map((b) => b.value)));
  const nice = niceMax(maxV);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%' });

  // grid lines
  const ticks = 4;
  for (let i = 0; i <= ticks; i++) {
    const v = (nice / ticks) * i;
    const y = padT + plotH - (v / nice) * plotH;
    svg.appendChild(svgEl('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: 'var(--border)', 'stroke-width': 1, 'stroke-dasharray': i === 0 ? '0' : '3 5' }));
    const txt = svgEl('text', { x: W - padR, y: y - 5, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--text-3)', 'font-weight': 700 });
    txt.textContent = fmtMoneyCompact(v, currency);
    svg.appendChild(txt);
  }

  const gW = plotW / usable.length;
  const barW = Math.min(44, (gW * 0.62) / usable[0].bars.length);
  usable.forEach((g, gi) => {
    const cx = padL + gW * gi + gW / 2;
    const n = g.bars.length;
    const totalW = n * barW + (n - 1) * 6;
    g.bars.forEach((b, bi) => {
      const x = cx - totalW / 2 + bi * (barW + 6);
      const bh = nice > 0 ? (b.value / nice) * plotH : 0;
      const y = padT + plotH - bh;
      const rect = svgEl('rect', {
        x, y: padT + plotH, width: barW, height: 0,
        rx: 5, fill: b.color || 'var(--primary)'
      });
      rect.style.transition = `y 0.7s ${gi * 0.05}s cubic-bezier(0.22,1,0.36,1), height 0.7s ${gi * 0.05}s cubic-bezier(0.22,1,0.36,1)`;
      const t = svgEl('title');
      t.textContent = `${g.label} — ${b.name || ''}: ${fmtMoney(b.value, currency)}`;
      rect.appendChild(t);
      svg.appendChild(rect);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        rect.setAttribute('y', String(Math.max(padT + plotH - bh, padT + plotH - 1.5)));
        rect.setAttribute('height', String(Math.max(bh, b.value > 0 ? 2.5 : 0)));
      }));
      if (valueLabel && bh > 18) {
        const vl = svgEl('text', { x: x + barW / 2, y: y - 6, 'text-anchor': 'middle', 'font-size': 10.5, 'font-weight': 800, fill: 'var(--text-2)' });
        vl.textContent = fmtMoneyCompact(b.value, currency);
        svg.appendChild(vl);
      }
    });
    const lbl = svgEl('text', { x: cx, y: H - 10, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: 'var(--text-2)' });
    lbl.textContent = g.label;
    svg.appendChild(lbl);
  });

  parent.appendChild(svg);

  // legend
  const names = [...new Set(groups[0].bars.map((b) => b.name))];
  if (names.length > 1) {
    const legend = h('div', { class: 'legend', style: 'flex-direction:row;justify-content:center;gap:18px;min-width:0;margin-top:8px' });
    groups[0].bars.forEach((b) => {
      legend.appendChild(h('div', { class: 'legend-item', style: 'grid-template-columns:12px auto' }, [
        h('span', { class: 'dot', style: `background:${b.color}` }),
        h('span', {}, b.name)
      ]));
    });
    parent.appendChild(legend);
  }
}

/**
 * Line chart with area fill.
 * points: [{label, value}]
 */
export function line(parent, points, { height = 230, color = 'var(--primary)', currency = 'EGP', allowNegative = false } = {}) {
  clear(parent);
  if (!points.length) return emptyBox(parent);

  const W = 720, H = height;
  const padL = 14, padR = 14, padT = 24, padB = 32;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const vals = points.map((p) => p.value);
  const min = allowNegative ? Math.min(0, ...vals) : Math.min(0, ...vals);
  let maxV = Math.max(...vals, 0);
  const range = maxV - min;
  const nice = niceMax(Math.max(range, 1));
  const lo = min - (range < nice * 0.15 ? nice * 0.08 : 0);
  const hi = lo + nice + (range < nice * 0.15 ? nice * 0.1 : 0);

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%' });
  const gid = 'lg' + Math.random().toString(36).slice(2, 8);
  const defs = svgEl('defs');
  const grad = svgEl('linearGradient', { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.30 }));
  grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0.02 }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  const X = (i) => points.length === 1 ? W / 2 : padL + (plotW * i) / (points.length - 1);
  const Y = (v) => padT + plotH - ((v - lo) / (hi - lo)) * plotH;

  // zero line
  if (lo < 0 || allowNegative) {
    svg.appendChild(svgEl('line', { x1: padL, x2: W - padR, y1: Y(0), y2: Y(0), stroke: 'var(--border-2)', 'stroke-width': 1.2 }));
  } else {
    svg.appendChild(svgEl('line', { x1: padL, x2: W - padR, y1: padT + plotH, y2: padT + plotH, stroke: 'var(--border)', 'stroke-width': 1.2 }));
  }

  // y ticks (3)
  for (let i = 0; i <= 3; i++) {
    const v = lo + ((hi - lo) / 3) * i;
    const txt = svgEl('text', { x: W - padR, y: Y(v) - 5, 'text-anchor': 'end', 'font-size': 11, fill: 'var(--text-3)', 'font-weight': 700 });
    txt.textContent = fmtMoneyCompact(v, currency);
    svg.appendChild(txt);
  }

  const pts = points.map((p, i) => `${X(i)},${Y(p.value)}`).join(' ');
  const areaPath = `M ${padL},${Y(lo)} L ${points.map((p, i) => `${X(i)},${Y(p.value)}`).join(' L ')} L ${X(points.length - 1)},${Y(lo)} Z`;
  const area = svgEl('path', { d: areaPath, fill: `url(#${gid})`, stroke: 'none' });
  area.style.opacity = '0';
  area.style.transition = 'opacity 1s 0.25s';
  svg.appendChild(area);

  const path = svgEl('path', {
    d: 'M ' + points.map((p, i) => `${X(i)} ${Y(p.value)}`).join(' L '),
    fill: 'none', stroke: color, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round'
  });
  svg.appendChild(path);

  // animate
  requestAnimationFrame(() => {
    const len = path.getTotalLength();
    path.setAttribute('stroke-dasharray', String(len));
    path.setAttribute('stroke-dashoffset', String(len));
    path.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1)';
    path.setAttribute('stroke-dashoffset', '0');
    area.style.opacity = '1';
  });

  // dots + x labels
  points.forEach((p, i) => {
    const dot = svgEl('circle', { cx: X(i), cy: Y(p.value), r: 3.6, fill: color, stroke: 'var(--surface)', 'stroke-width': 1.6 });
    const t = svgEl('title');
    t.textContent = `${p.label}: ${fmtMoney(p.value, currency)}`;
    dot.appendChild(t);
    dot.style.opacity = '0';
    dot.style.transition = `opacity 0.3s ${0.5 + i * 0.03}s`;
    svg.appendChild(dot);
    requestAnimationFrame(() => requestAnimationFrame(() => { dot.style.opacity = '1'; }));

    if (points.length <= 12 || i % Math.ceil(points.length / 8) === 0 || i === points.length - 1) {
      const lbl = svgEl('text', { x: X(i), y: H - 8, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: 'var(--text-3)' });
      lbl.textContent = p.label;
      svg.appendChild(lbl);
    }
  });

  parent.appendChild(svg);
}

/**
 * Horizontal bars (top categories style).
 * items: [{label, value, color, emoji?}]
 */
export function hbars(parent, items, { currency = 'EGP', maxItems = 8 } = {}) {
  clear(parent);
  const data = [...items].sort((a, b) => b.value - a.value).slice(0, maxItems);
  if (!data.length) return emptyBox(parent);
  const total = data.reduce((a, b) => a + b.value, 0);
  const max = data[0].value || 1;

  const box = h('div', { class: 'hbars' });
  data.forEach((d, i) => {
    const row = h('div', { class: 'hbar-row' });
    row.appendChild(h('div', { class: 'hbar-label' }, [
      d.emoji ? h('span', { class: 'em' }, d.emoji) : null,
      h('span', { class: 'nm' }, d.label)
    ]));
    const track = h('div', { class: 'progress thin', style: 'background:var(--surface-3)' });
    const fill = document.createElement('i');
    fill.style.background = d.color || 'var(--primary)';
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(h('div', { class: 'hbar-val' }, `${fmtMoney(d.value, currency)}  ·  ${fmtPct(d.value / total)}`));
    box.appendChild(row);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fill.style.transition = `width 0.8s ${i * 0.06}s cubic-bezier(0.22,1,0.36,1)`;
      fill.style.width = `${(d.value / max) * 100}%`;
    }));
  });
  parent.appendChild(box);
}

function niceMax(v) {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const f = v / Math.pow(10, exp);
  let nf;
  if (f <= 1) nf = 1;
  else if (f <= 2) nf = 2;
  else if (f <= 2.5) nf = 2.5;
  else if (f <= 5) nf = 5;
  else nf = 10;
  return nf * Math.pow(10, exp);
}

export { fmtNum };

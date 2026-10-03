/* icons.js — minimal 24px stroke icon set, registered on window.__flosyIcons */

const DEFS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  list: '<line x1="9.5" y1="6" x2="21" y2="6"/><line x1="9.5" y1="12" x2="21" y2="12"/><line x1="9.5" y1="18" x2="21" y2="18"/><circle cx="4.8" cy="6" r="1.1"/><circle cx="4.8" cy="12" r="1.1"/><circle cx="4.8" cy="18" r="1.1"/>',
  wallet: '<rect x="2.5" y="6" width="19" height="13.5" rx="3"/><path d="M2.5 10.5h19"/><path d="M15.5 15.5h3"/>',
  chart: '<line x1="4" y1="20" x2="20" y2="20"/><line x1="8" y1="20" x2="8" y2="12.5"/><line x1="12" y1="20" x2="12" y2="6.5"/><line x1="16" y1="20" x2="16" y2="14.5"/>',
  gear: '<circle cx="12" cy="12" r="3.1"/><path d="M12 2.9v2.3M12 18.8v2.3M5 4.9l1.6 1.6M17.4 17.4 19 19M2.9 12h2.3M18.8 12h2.3M5 19.1l1.6-1.6M17.4 6.6 19 5"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  bell: '<path d="M6 9.5a6 6 0 1 1 12 0c0 4.8 1.8 5.8 1.8 5.8H4.2S6 14.3 6 9.5"/><path d="M10 19.5a2.1 2.1 0 0 0 4 0"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.6v2M12 19.4v2M4.7 4.7l1.4 1.4M17.9 17.9l1.4 1.4M2.6 12h2M19.4 12h2M4.7 19.3l1.4-1.4M17.9 6.1l1.4-1.4"/>',
  moon: '<path d="M20.5 14.2A8.6 8.6 0 1 1 9.8 3.5a7 7 0 0 0 10.7 10.7z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4.2-4.2"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6"/><circle cx="12" cy="12" r="0.8"/>',
  receipt: '<path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5L10 21l-2-1.5L6 21z"/><path d="M9.5 8.5h5M9.5 12h5"/>',
  repeat: '<path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3L20 9"/><path d="M20 4.5V9h-4.5"/><path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3L4 15"/><path d="M4 19.5V15h4.5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2.6"/><path d="M8 10.5V8a4 4 0 1 1 8 0v2.5"/>',
  x: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  trash: '<path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="m6.5 7 .9 13h9.2l.9-13"/><path d="M10 11v5M14 11v5"/>',
  edit: '<path d="M4 20h4.5L20 8.5a2.12 2.12 0 0 0-3-3L5.5 17z"/><path d="m14.5 7.5 3 3"/>',
  download: '<path d="M12 4v11"/><path d="m7.5 11.5 4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/>',
  upload: '<path d="M12 15V4"/><path d="m7.5 8 4.5-4.5L16.5 8"/><path d="M4.5 19.5h15"/>',
  chevL: '<path d="m14.5 6-6 6 6 6"/>',
  chevR: '<path d="m9.5 6 6 6-6 6"/>',
  chevD: '<path d="m6 9.5 6 6 6-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="m18.6 15.6.8 2.3 2.3.8-2.3.8-.8 2.3-.8-2.3-2.3-.8 2.3-.8z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  filter: '<path d="M4 6h16l-6.3 7.2V19l-3.4 2v-7.8z"/>',
  printer: '<path d="M7 8V3.5h10V8"/><rect x="4" y="8" width="16" height="8" rx="2"/><path d="M7 13.5h10v7H7z"/>',
  dots: '<circle cx="12" cy="5.5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="18.5" r="1.2"/>',
  dotsH: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
  alert: '<path d="M12 4.5 3 19.5h18z"/><line x1="12" y1="10" x2="12" y2="14.5"/><circle cx="12" cy="17" r="0.5"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M4 10h16M8.5 3.5v3M15.5 3.5v3"/>',
  money: '<circle cx="12" cy="12" r="8.5"/><path d="M9.3 9.6c.5-1 1.5-1.4 2.7-1.4 1.6 0 2.8.8 2.8 2s-1.2 1.6-2.8 1.9-2.8.9-2.8 2 .9 1.8 2.8 1.8c1.3 0 2.3-.4 2.8-1.4"/><path d="M12 6.8v10.8"/>',
  branch: '<circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="18" r="2.4"/><path d="M6 8.5v4a4 4 0 0 0 4 4h5.5"/><path d="m14.5 12.5 3.5 3.5-3.5 3.5"/>'
};

export function initIcons() {
  const out = {};
  for (const [name, markup] of Object.entries(DEFS)) {
    const doc = new DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${markup}</svg>`,
      'image/svg+xml'
    );
    out[name] = doc.documentElement;
  }
  window.__flosyIcons = out;
  return out;
}

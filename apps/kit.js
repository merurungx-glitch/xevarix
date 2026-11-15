/* XEVARIX — 標準アプリ用の部品（窓の中で読む）
   見た目は css/kit.css。ここは「組み立てる関数」。 */

export * from '../sys/util.js';
export { icon, iconHTML, appTile, batteryIcon } from '../sys/icons.js';
import { h, fill, clamp } from '../sys/util.js';
import { icon } from '../sys/icons.js';

/* 一覧の1行: row({icon, title, desc, right, onclick, danger}) */
export function row(o) {
  const tag = o.onclick ? 'button' : 'div';
  return h(tag, { class: 'k-row' + (o.danger ? ' danger' : '') + (o.col ? ' col' : ''), type: o.onclick ? 'button' : null, onclick: o.onclick || null },
    o.icon ? (typeof o.icon === 'string' ? icon(o.icon) : o.icon) : null,
    h('span', { class: 'k-rt' }, h('b', null, o.title), o.desc ? h('small', null, o.desc) : null),
    o.right != null ? h('span', { class: 'k-rr' }, o.right) : (o.onclick && !o.col ? h('span', { class: 'k-rr' }, icon('chevR')) : null),
    o.below || null);
}
export function group(title, ...rows) {
  const g = h('div', { class: 'k-group' }, rows);
  return title ? [h('div', { class: 'k-group-t' }, title), g] : g;
}
export const kv = (k, v) => h('div', { class: 'k-kv' }, h('span', null, k), h('span', null, v == null || v === '' ? '—' : v));

/* 切りかえスイッチ */
export function sw(value, onchange, label) {
  const b = h('button', { class: 'k-sw', type: 'button', role: 'switch', 'aria-checked': value ? 'true' : 'false', 'aria-label': label || null,
    onclick: e => { e.stopPropagation(); const v = b.getAttribute('aria-checked') !== 'true'; b.setAttribute('aria-checked', v ? 'true' : 'false'); onchange && onchange(v); } });
  b.set = v => b.setAttribute('aria-checked', v ? 'true' : 'false');
  return b;
}
/* えらぶボタンの列: seg([[値, 表示, アイコン]], いまの値, 変えたとき) */
export function seg(options, value, onchange) {
  const el = h('div', { class: 'seg', role: 'radiogroup' });
  const paint = v => fill(el, options.map(([val, label, ic]) => h('button', { type: 'button', role: 'radio', 'aria-checked': val === v ? 'true' : 'false', class: val === v ? 'on' : '', onclick: () => { paint(val); onchange && onchange(val); } }, ic ? icon(ic) : null, label)));
  paint(value); el.set = paint;
  return el;
}
export function select(options, value, onchange, cls = '') {
  const s = h('select', { class: 'field ' + cls, onchange: () => onchange && onchange(s.value) }, options.map(([val, label]) => h('option', { value: val, selected: String(val) === String(value) }, label)));
  s.value = value;
  return s;
}
export function slider({ min = 0, max = 1, step = .01, value = 0, oninput, onchange, label }) {
  return h('input', { type: 'range', min, max, step, value, 'aria-label': label || null, oninput: e => oninput && oninput(Number(e.target.value)), onchange: e => onchange && onchange(Number(e.target.value)) });
}
export function btn(label, onclick, { kind = '', ic, sm, title } = {}) {
  return h('button', { class: 'btn ' + kind + (sm ? ' sm' : ''), type: 'button', title: title || null, onclick }, ic ? icon(ic) : null, label);
}
export const ibtn = (ic, label, onclick, cls = '') => h('button', { class: 'ibtn ' + cls, type: 'button', title: label, 'aria-label': label, onclick }, icon(ic));
export function empty(ic, text, action) { return h('div', { class: 'k-empty' }, icon(ic), h('div', null, text), action || null); }
export function meter(v, kind = '') { return h('div', { class: 'k-meter ' + kind }, h('i', { style: { width: Math.round(clamp(v, 0, 1) * 100) + '%' } })); }
export const badge = (text, kind = '') => h('span', { class: 'k-badge ' + kind }, text);
export const note = (text, kind = '', ic = 'info') => h('div', { class: 'k-note ' + kind }, icon(kind === 'warn' ? 'warn' : ic), h('div', null, text));
export function card(title, ic, ...kids) { return h('div', { class: 'k-card' }, title ? h('h3', null, ic ? icon(ic) : null, title) : null, kids); }

/* タブ */
export function tabs(items, value, onchange) {
  const el = h('div', { class: 'k-tabs', role: 'tablist' });
  const paint = v => fill(el, items.map(([id, label, ic]) => h('button', { class: 'k-tab' + (id === v ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': id === v ? 'true' : 'false', onclick: () => { paint(id); onchange(id); } }, ic ? icon(ic) : null, label)));
  paint(value); el.set = paint;
  return el;
}

/* 左に目次・右に中身。items: [{id,label,icon} | {sec:'見出し'}]  render(id, 中身の箱) */
export function navLayout(root, items, render, initial) {
  const side = h('nav', { class: 'k-side' }), main = h('div', { class: 'k-main' });
  let cur = null;
  const go = (id, arg) => {
    cur = id;
    fill(side, items.map(it => it.sec ? h('div', { class: 'k-nav-sec' }, it.sec) : h('button', { class: 'k-nav' + (it.id === id ? ' on' : ''), type: 'button', onclick: () => go(it.id) }, icon(it.icon), it.label)));
    fill(main);
    try { render(id, main, arg); } catch (e) { console.error(e); fill(main, empty('warn', 'この画面を開けませんでした: ' + e.message)); }
    const on = side.querySelector('.k-nav.on'); on && on.scrollIntoView && on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  fill(root, h('div', { class: 'k-split' }, side, main));
  go(initial || items.find(i => i.id).id);
  return { go, get current() { return cur; } };
}
/* 中身の箱（スクロールする・幅をそろえる） */
export function page(...kids) { return h('div', { class: 'k-scroll' }, h('div', { class: 'k-pad k-col k-max' }, kids)); }

/* ── 小さなグラフ（canvas）──  lineChart(canvas, [数…], {min,max,color,fill,grid}) */
export function lineChart(cv, data, o = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1); const w = cv.clientWidth || 300, hh = cv.clientHeight || 120;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(hh * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hh);
  const cs = getComputedStyle(cv); const col = o.color || cs.getPropertyValue('--acc').trim() || '#38e6fd';
  const grid = cs.getPropertyValue('--stroke').trim() || 'rgba(150,195,255,.16)';
  const padB = o.labels ? 16 : 4, padT = 6; const H = hh - padB - padT;
  g.strokeStyle = grid; g.lineWidth = 1;
  for (let i = 0; i <= 2; i++) { const y = padT + H * i / 2 + .5; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  const series = Array.isArray(data[0]) ? data : [data]; const colors = o.colors || [col];
  series.forEach((d, si) => {
    const pts = d.filter(v => v != null); if (pts.length < 2) return;
    const min = o.min != null ? o.min : Math.min(...pts), max = o.max != null ? o.max : Math.max(...pts, min + 1e-9);
    const n = d.length; const X = i => (n === 1 ? w : i * w / (n - 1)), Y = v => padT + H - (clamp(v, min, max) - min) / (max - min || 1) * H;
    g.beginPath(); let started = false;
    d.forEach((v, i) => { if (v == null) return; if (!started) { g.moveTo(X(i), Y(v)); started = true; } else g.lineTo(X(i), Y(v)); });
    g.strokeStyle = colors[si % colors.length]; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
    if (o.fill !== false && si === 0) {
      const last = d.length - 1 - [...d].reverse().findIndex(v => v != null), first = d.findIndex(v => v != null);
      g.lineTo(X(last), padT + H); g.lineTo(X(first), padT + H); g.closePath();
      const gr = g.createLinearGradient(0, padT, 0, padT + H); gr.addColorStop(0, colors[0]); gr.addColorStop(1, 'transparent');
      g.globalAlpha = .22; g.fillStyle = gr; g.fill(); g.globalAlpha = 1;
    }
  });
  if (o.labels) { g.fillStyle = cs.getPropertyValue('--text-3').trim() || '#888'; g.font = '10px sans-serif'; g.textBaseline = 'bottom'; g.textAlign = 'left'; g.fillText(o.labels[0], 2, hh - 1); g.textAlign = 'right'; g.fillText(o.labels[1], w - 2, hh - 1); }
}
/* barChart(canvas, [{v, label, color}], {max}) */
export function barChart(cv, items, o = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1); const w = cv.clientWidth || 300, hh = cv.clientHeight || 120;
  cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr);
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hh);
  const cs = getComputedStyle(cv); const col = cs.getPropertyValue('--acc').trim() || '#38e6fd', txt = cs.getPropertyValue('--text-3').trim() || '#888';
  const n = items.length; if (!n) return; const max = o.max || Math.max(...items.map(i => i.v), 1e-9);
  const bw = Math.min(46, (w - 8) / n * .62), gap = (w - bw * n) / (n + 1), H = hh - 18;
  g.font = '10px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'bottom';
  items.forEach((it, i) => {
    const x = gap + i * (bw + gap), bh = Math.max(2, it.v / max * (H - 6));
    g.fillStyle = it.color || col; g.globalAlpha = it.dim ? .45 : 1;
    const r = Math.min(5, bw / 2); const y = H - bh;
    g.beginPath(); g.moveTo(x, H); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.lineTo(x + bw - r, y); g.quadraticCurveTo(x + bw, y, x + bw, y + r); g.lineTo(x + bw, H); g.closePath(); g.fill();
    g.globalAlpha = 1; g.fillStyle = txt; g.fillText(it.label || '', x + bw / 2, hh - 1);
  });
}

/* かんたんな Markdown（見出し・箇条書き・チェック・強調・コード）→ 要素。HTML はそのまま入れない */
export function md(src) {
  const root = h('div', { class: 'k-md' });
  const inline = (el, text) => {
    const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g; let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) el.append(text.slice(last, m.index));
      if (m[2]) el.append(h('b', null, m[2])); else if (m[3]) el.append(h('code', null, m[3])); else el.append(h('a', { href: m[5], target: '_blank', rel: 'noopener noreferrer' }, m[4]));
      last = re.lastIndex;
    }
    if (last < text.length) el.append(text.slice(last));
    return el;
  };
  const lines = String(src || '').replace(/\r/g, '').split('\n'); let list = null, pre = null;
  for (const ln of lines) {
    if (pre) { if (/^```/.test(ln)) { pre = null; } else pre.firstChild.append(ln + '\n'); continue; }
    if (/^```/.test(ln)) { pre = h('pre', null, h('code')); root.append(pre); list = null; continue; }
    let m;
    if ((m = /^(#{1,3})\s+(.*)$/.exec(ln))) { root.append(inline(h('h' + m[1].length), m[2])); list = null; }
    else if ((m = /^\s*[-*・]\s+\[( |x|X)\]\s+(.*)$/.exec(ln))) { if (!list || list.dataset.k !== 'check') { list = h('ul', { style: 'list-style:none;padding-left:.2em', data: { k: 'check' } }); root.append(list); } list.append(inline(h('li', null, h('input', { type: 'checkbox', checked: m[1] !== ' ', disabled: true })), m[2])); }
    else if ((m = /^\s*[-*・]\s+(.*)$/.exec(ln))) { if (!list || list.dataset.k !== 'ul') { list = h('ul', { data: { k: 'ul' } }); root.append(list); } list.append(inline(h('li'), m[1])); }
    else if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(ln))) { if (!list || list.tagName !== 'OL') { list = h('ol'); root.append(list); } list.append(inline(h('li'), m[1])); }
    else if (/^\s*(---|\*\*\*)\s*$/.test(ln)) { root.append(h('hr')); list = null; }
    else if (!ln.trim()) { list = null; }
    else { root.append(inline(h('p'), ln)); list = null; }
  }
  return root;
}

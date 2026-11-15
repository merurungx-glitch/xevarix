/* XEVARIX — 状態を持たない小さな道具。本体と、窓の中のアプリの両方から読む。 */

const SVGNS = 'http://www.w3.org/2000/svg';

/* 要素を作る: h('div', {class:'a', onclick(){}}, 子…) */
export function h(tag, props, ...kids) {
  const el = (tag === 'svg' || tag === 'path' || tag === 'circle' || tag === 'g')
    ? document.createElementNS(SVGNS, tag) : document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.setAttribute('class', v);
      else if (k === 'style') { if (typeof v === 'string') el.style.cssText = v; else for (const s in v) { if (s.startsWith('--')) el.style.setProperty(s, v[s]); else el.style[s] = v[s]; } }
      else if (k === 'data') { for (const d in v) if (v[d] != null) el.dataset[d] = v[d]; }
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (typeof v === 'boolean') { if (k in el) el[k] = v; else el.setAttribute(k, ''); }
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'tabIndex' || k === 'draggable') el[k] = v;
      else el.setAttribute(k, v);
    }
  }
  append(el, kids);
  return el;
}
export function append(el, kids) {
  for (const k of kids) {
    if (k == null || k === false || k === true) continue;
    if (Array.isArray(k)) append(el, k);
    else el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return el;
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
export function fill(el, ...kids) { clear(el); append(el, kids); return el; }

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const pad2 = n => String(n).padStart(2, '0');
let _uid = 0;
export const uid = (p = 'x') => p + Date.now().toString(36) + (++_uid).toString(36) + Math.floor(Math.random() * 1296).toString(36);
export const clone = v => (v == null ? v : (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v))));

export function debounce(fn, ms) {
  let t = 0;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => { t = 0; fn(...a); }, ms); };
  d.flush = (...a) => { clearTimeout(t); t = 0; fn(...a); };
  d.cancel = () => { clearTimeout(t); t = 0; };
  return d;
}
export function throttle(fn, ms) {
  let last = 0, t = 0, args = null;
  return (...a) => {
    const now = Date.now(); args = a;
    if (now - last >= ms) { last = now; fn(...a); }
    else if (!t) t = setTimeout(() => { t = 0; last = Date.now(); fn(...args); }, ms - (now - last));
  };
}

/* ── 表示用の整形 ── */
export function fmtBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  const u = ['KB', 'MB', 'GB', 'TB']; let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
  return (n >= 100 ? Math.round(n) : n.toFixed(1)) + ' ' + u[i];
}
export function fmtDur(ms, short) {
  let s = Math.max(0, Math.round(ms / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const hh = Math.floor(s / 3600); s -= hh * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  if (short) return (d ? d + '日' : '') + (hh ? hh + '時間' : '') + ((m || (!d && !hh)) ? m + '分' : '');
  const out = [];
  if (d) out.push(d + '日'); if (hh) out.push(hh + '時間'); if (m) out.push(m + '分');
  if (!d && !hh && (s || !m)) out.push(s + '秒');
  return out.join('');
}
export function fmtTimer(ms) {
  let s = Math.max(0, Math.ceil(ms / 1000));
  const hh = Math.floor(s / 3600); s -= hh * 3600; const m = Math.floor(s / 60); s -= m * 60;
  return (hh ? hh + ':' + pad2(m) : m) + ':' + pad2(s);
}
export function fmtClock(d = new Date(), h24 = true, sec = false) {
  let hh = d.getHours(); const m = pad2(d.getMinutes()), s = sec ? ':' + pad2(d.getSeconds()) : '';
  if (h24) return hh + ':' + m + s;
  const ap = hh < 12 ? '午前' : '午後'; hh = hh % 12 || 12;
  return ap + hh + ':' + m + s;
}
const WD = ['日', '月', '火', '水', '木', '金', '土'];
export const weekday = d => WD[d.getDay()];
export function fmtDate(d = new Date(), withYear = false) {
  return (withYear ? d.getFullYear() + '年' : '') + (d.getMonth() + 1) + '月' + d.getDate() + '日（' + WD[d.getDay()] + '）';
}
export function fmtStamp(t) { const d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + d.getHours() + ':' + pad2(d.getMinutes()); }
export function fmtRel(t) {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'たった今';
  if (s < 3600) return Math.round(s / 60) + '分前';
  if (s < 86400) return Math.round(s / 3600) + '時間前';
  if (s < 86400 * 7) return Math.round(s / 86400) + '日前';
  return fmtStamp(t);
}
export const dateKey = (d = new Date()) => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
export const pct = (v, digits = 0) => (v * 100).toFixed(digits) + '%';

/* ── 日本語の文字のゆれをそろえる（検索・AI 用） ── */
export const kataToHira = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
export function normJa(s) {
  return kataToHira(String(s ?? '').normalize('NFKC').toLowerCase()).replace(/[\s　]+/g, ' ').trim();
}

/* ── バイト列 ── */
export function bufToB64(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; const CH = 0x8000;
  for (let i = 0; i < b.length; i += CH) s += String.fromCharCode.apply(null, b.subarray(i, i + CH));
  return btoa(s);
}
export function b64ToBuf(b64) {
  const s = atob(b64); const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export const b64url = b64 => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const unb64url = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return s; };
export async function gzip(u8) {
  if (typeof CompressionStream !== 'function') return null;
  const cs = new CompressionStream('gzip');
  const out = new Response(new Blob([u8]).stream().pipeThrough(cs)).arrayBuffer();
  return new Uint8Array(await out);
}
export async function gunzip(u8) {
  const ds = new DecompressionStream('gzip');
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer());
}
export const utf8 = s => new TextEncoder().encode(s);
export const unutf8 = b => new TextDecoder().decode(b);

/* ファイルを保存させる（ブラウザのダウンロード） */
export function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.style.display = 'none';
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
/* ファイルを選ばせる */
export function pickFiles({ accept = '', multiple = false } = {}) {
  return new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept; i.multiple = multiple; i.style.display = 'none';
    i.onchange = () => { res([...i.files]); i.remove(); };
    i.oncancel = () => { res([]); i.remove(); };
    document.body.append(i); i.click();
  });
}

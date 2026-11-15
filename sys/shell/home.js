/* XEVARIX — ホーム（アプリとウィジェットを1つの並びに置いて、iPad のように自由に並べかえる）
   ・並びは設定の台帳 home.layout … 'a:<アプリのid>' と 'w:<ウィジェットのid>' の配列（XEVORA アカウントの同期の対象）。
     この端末に無いアプリ（ほかの端末で入れたもの）は描かないが、並びの中の場所は残す。
   ・編集に入る … 長押し（指でもマウスでも）でメニュー → そのまま動かすと編集になって持ち上がる／下の「ホームを編集」／右クリックのメニュー。
     編集中 … 持って動かす・「－」で外す・「＋ ウィジェット」で足す・「完了」か Esc か空いた所を押して終わる。
   ・PC はデスクトップの右の列、タブレットとスマホはホームの画面。どの形でも同じ並び（列の数だけが変わる）。 */

import { bus } from '../core.js';
import { h, fill } from '../util.js';
import { icon } from '../icons.js';
import { openLayer, menu, haptic, toast } from './ui.js';

let X = null, O = null, host = null, grid = null, scroller = null;
let editing = false, live = [], raf = 0, skipPaint = false, drag = null, lp = null;

const isW = k => typeof k === 'string' && k.startsWith('w:');
const idOf = k => k.slice(2);

/* ── 並び ── */
export function getLayout() {
  let l = X.reg.get('home.layout');
  if (!Array.isArray(l)) {      // 初めて：前の版のウィジェットの並び＋入れてあるアプリ
    l = [...(X.reg.get('home.widgets') || []).map(id => 'w:' + id), ...X.apps.installed().map(a => 'a:' + a.id)];
    X.reg.set('home.layout', l);
  }
  return l.filter(k => typeof k === 'string' && /^[aw]:./.test(k));
}
export function setLayout(l) { X.reg.set('home.layout', [...new Set(l)]); }
export const inHome = key => getLayout().includes(key);
export function addToHome(key, at = -1) {
  const l = getLayout().filter(k => k !== key);
  if (at < 0 || at > l.length) l.push(key); else l.splice(at, 0, key);
  setLayout(l);
}
export function removeFromHome(key) { setLayout(getLayout().filter(k => k !== key)); }

/* ── 描く ── */
function stopLive() { for (const w of live) { try { w.stop(); } catch { /* 片づけの失敗は無視 */ } } live = []; }
function paint() {
  raf = 0; if (!grid) return;
  if (drag) { cancelDrag(); }
  stopLive();
  const hidden = new Set(X.reg.get('apps.hidden') || []);
  const items = [];
  for (const key of getLayout()) {
    if (isW(key)) {
      const w = X.widgets && X.widgets.mount(idOf(key)); if (!w) continue;
      live.push(w);
      items.push(h('div', { class: 'xh-it xh-itw', data: { key, size: w.size }, oncontextmenu: e => { e.preventDefault(); if (!lpMenuOpen()) itemMenu(key, { x: e.clientX, y: e.clientY }); } },
        w.el, rmBadge(key, w.name)));
    } else {
      const a = X.apps.get(idOf(key));
      if (!a || !X.apps.isInstalled(a.id) || hidden.has(a.id)) continue;
      items.push(h('div', { class: 'xh-it', data: { key }, oncontextmenu: e => { e.preventDefault(); if (!lpMenuOpen()) itemMenu(key, { x: e.clientX, y: e.clientY }); } },
        h('button', { class: 'xh-app', type: 'button', 'aria-label': a.name, onclick: () => { haptic(); X.proc.spawn(a.id); } }, O.appTile(a), h('span', null, a.short || a.name)),
        rmBadge(key, a.name)));
    }
  }
  fill(grid, items);
  if (!items.length) grid.append(h('div', { class: 'xh-empty' }, 'ホームに何も置いていません。「ホームを編集」から足せます。'));
}
export function repaint() { if (skipPaint) { skipPaint = false; return; } if (!raf) raf = requestAnimationFrame(paint); }
function rmBadge(key, name) {
  return h('button', { class: 'xh-rm', type: 'button', tabIndex: -1, 'aria-label': name + ' をホームから外す',
    onclick: e => { e.stopPropagation(); e.preventDefault(); haptic(); removeFromHome(key); } }, icon('minus'));
}

/* ── 長押し・右クリックのメニュー ── */
function itemMenu(key, at) {
  if (isW(key)) {
    const d = X.widgets && X.widgets.DEFS[idOf(key)];
    return menu([
      { label: 'ホームを編集', icon: 'edit', fn: () => setEdit(true) },
      '-',
      { label: (d ? d.name : 'ウィジェット') + ' を外す', icon: 'minus', danger: true, fn: () => removeFromHome(key) },
    ], at);
  }
  const a = X.apps.get(idOf(key));
  return a ? O.appMenu(a, at) : null;
}
const lpMenuOpen = () => !!(lp && lp.ready);

/* ── 編集 ── */
export function setEdit(on) {
  on = !!on; if (editing === on) return;
  editing = on;
  host.dataset.edit = on ? '1' : '0';
  if (!on) { cancelArm(); if (drag) endDrag(); }
  bus.emit('home:edit', on);
}
export const isEditing = () => editing;

function gallery() {
  const used = new Set(getLayout().filter(isW).map(idOf));
  const defs = (X.widgets && X.widgets.DEFS) || {};
  const list = Object.keys(defs).filter(id => !used.has(id));
  let hd = null;
  const card = h('div', { class: 'xh-gal glass pop', role: 'dialog', 'aria-label': 'ウィジェットを足す' },
    h('div', { class: 'xh-gal-h' }, h('b', null, 'ウィジェットを足す'), h('button', { class: 'xw-btn', type: 'button', 'aria-label': '閉じる', onclick: () => hd.close() }, icon('close'))),
    list.length ? h('div', { class: 'xh-gal-l' }, list.map(id => h('button', { class: 'xh-gal-i', type: 'button', onclick: () => {
      addToHome('w:' + id, 0); hd.close(); haptic();
      if (scroller) scroller.scrollTo({ top: 0, behavior: 'smooth' });
      toast(defs[id].name + ' をホームのいちばん上に置きました。', 'ok');
    } }, h('span', { class: 'xh-gal-ic' }, icon(defs[id].icon)), h('span', { class: 'xh-gal-t' }, h('b', null, defs[id].name), h('small', null, (defs[id].size === 'w' ? '横長' : '小さめ') + (defs[id].desc ? '・' + defs[id].desc : '')))))) :
      h('p', { class: 'xh-gal-none' }, (X.widgets ? 'ウィジェットはすべて置いてあります。' : 'ウィジェットのしくみを読みこめていません。')));
  const wrap = h('div', { class: 'xh-galw' }, card);
  hd = openLayer(wrap, { key: 'home-gallery' });
  wrap.addEventListener('pointerdown', e => { if (e.target === wrap) hd.close(); });
}

/* ── 押す・長押し・持って動かす（指とマウスで同じ）── */
function onDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const it = e.target.closest('.xh-it');
  if (!it || it.parentNode !== grid || e.target.closest('.xh-rm') || drag) return;
  cancelArm();
  const st = { it, id: e.pointerId, x: e.clientX, y: e.clientY, t: 0, ready: editing, close: null };
  if (!editing) st.t = setTimeout(() => { st.t = 0; st.ready = true; haptic(14); it.dataset.lp = '1'; st.close = itemMenu(it.dataset.key, it); }, 480);
  lp = st;
  addEventListener('pointermove', onMove, true); addEventListener('pointerup', onUp, true); addEventListener('pointercancel', onUp, true);
}
function onMove(e) {
  if (drag) { if (e.pointerId === drag.id) { drag.x = e.clientX; drag.y = e.clientY; place(); reorder(); } return; }
  if (!lp || e.pointerId !== lp.id) return;
  const d = Math.abs(e.clientX - lp.x) + Math.abs(e.clientY - lp.y);
  if (!lp.ready) { if (d > 10) cancelArm(); return; }          // 長押しの前に動いた＝スクロール
  if (d > 6) { if (lp.close) lp.close(); if (!editing) setEdit(true); startDrag(lp.it, e); }
}
function onUp(e) {
  if (drag) { if (e.pointerId === drag.id) { if (e.type === 'pointerup') { drag.x = e.clientX; drag.y = e.clientY; reorder(true); } endDrag(); } return; }
  if (lp && e.pointerId === lp.id) { clearTimeout(lp.t); lp = null; unlisten(); }     // 長押しで開いたメニューはそのまま残す
}
function unlisten() { removeEventListener('pointermove', onMove, true); removeEventListener('pointerup', onUp, true); removeEventListener('pointercancel', onUp, true); }
function cancelArm() { if (lp) clearTimeout(lp.t); lp = null; if (!drag) unlisten(); }

function startDrag(it, e) {
  clearTimeout(lp && lp.t); lp = null;
  const r = it.getBoundingClientRect();
  const ghost = it.cloneNode(true);
  ghost.classList.add('xh-ghost'); ghost.removeAttribute('data-key');
  Object.assign(ghost.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  document.body.append(ghost);
  it.classList.add('ph');
  drag = { it, ghost, dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId, x: e.clientX, y: e.clientY, last: 0, raf: 0 };
  haptic(10);
  drag.raf = requestAnimationFrame(autoScroll);
}
function place() { drag.ghost.style.left = (drag.x - drag.dx) + 'px'; drag.ghost.style.top = (drag.y - drag.dy) + 'px'; }
/* 指の下の項目の前かうしろへ、持っている項目を差しこむ（並びが変わると grid が自然に流し直す） */
function reorder(force) {
  const now = performance.now(); if (!force && now - drag.last < 60) return;
  const t = document.elementFromPoint(drag.x, drag.y);
  const over = t && t.closest ? t.closest('.xh-it') : null;
  if (over && over.parentNode === grid && over !== drag.it) {
    const r = over.getBoundingClientRect();
    const before = drag.y < r.top + r.height * .2 || (drag.y < r.bottom - r.height * .2 && drag.x < r.left + r.width / 2);
    const ref = before ? over : over.nextSibling;
    if (ref !== drag.it && drag.it.nextSibling !== ref) { grid.insertBefore(drag.it, ref); drag.last = now; }
    return;
  }
  if (!over) {      // いちばん下の項目より下なら、最後へ
    const items = [...grid.children].filter(n => n.classList.contains('xh-it'));
    const lastEl = items[items.length - 1];
    if (lastEl && lastEl !== drag.it && drag.y > lastEl.getBoundingClientRect().bottom) { grid.append(drag.it); drag.last = now; }
  }
}
function autoScroll() {
  if (!drag) return;
  if (scroller) {
    const r = scroller.getBoundingClientRect(), edge = 56;
    let v = 0;
    if (drag.y < r.top + edge) v = -Math.ceil((r.top + edge - drag.y) / 4);
    else if (drag.y > r.bottom - edge) v = Math.ceil((drag.y - (r.bottom - edge)) / 4);
    if (v) { const before = scroller.scrollTop; scroller.scrollTop += v; if (scroller.scrollTop !== before) reorder(); }
  }
  drag.raf = requestAnimationFrame(autoScroll);
}
function endDrag() {
  const d = drag; drag = null; unlisten();
  cancelAnimationFrame(d.raf);
  const r = d.it.getBoundingClientRect();
  d.ghost.classList.add('drop');
  Object.assign(d.ghost.style, { left: r.left + 'px', top: r.top + 'px' });
  setTimeout(() => { d.ghost.remove(); d.it.classList.remove('ph'); }, 190);
  saveOrder();
}
function cancelDrag() { if (!drag) return; const d = drag; drag = null; unlisten(); cancelAnimationFrame(d.raf); d.ghost.remove(); d.it.classList.remove('ph'); }
/* 画面の並びを台帳へ。描いていない項目（この端末に無いアプリ）は、元の1つ前の項目のうしろに残す */
function saveOrder() {
  const shown = [...grid.children].filter(n => n.classList.contains('xh-it')).map(n => n.dataset.key);
  const old = getLayout(); const seen = new Set(shown); const out = [...shown];
  old.forEach((k, i) => {
    if (seen.has(k)) return;
    let j = i - 1; while (j >= 0 && !out.includes(old[j])) j--;
    out.splice(j < 0 ? 0 : out.indexOf(old[j]) + 1, 0, k);
  });
  if (JSON.stringify(out) !== JSON.stringify(old)) { skipPaint = true; setLayout(out); skipPaint = false; }
}

/* ── XEVARION（1回だけ、ホームへ）── パートナーのウィジェットをいちばん上、XEVARION をアプリの先頭に */
export function placeXevarion() {
  const l = getLayout().filter(k => k !== 'a:xevarion' && k !== 'w:mate');
  const first = l.findIndex(k => !isW(k));
  l.splice(first < 0 ? l.length : first, 0, 'a:xevarion');
  if (!X.widgets || X.widgets.DEFS.mate) l.unshift('w:mate');
  setLayout(l);
}

export function initHome(ctx, opts) {
  X = ctx; O = opts; host = opts.host; grid = opts.grid; scroller = opts.scroller;
  host.dataset.edit = '0';
  grid.addEventListener('pointerdown', onDown);
  /* 長押しのあとの指の動きでスクロールさせない（持ち上げたまま動かせるように） */
  grid.addEventListener('touchmove', e => { if (drag || (lp && lp.ready)) e.preventDefault(); }, { passive: false });
  /* 編集中は、項目を押してもアプリを開かない。長押しのあとの「押した」も捨てる */
  grid.addEventListener('click', e => {
    if (e.target.closest('.xh-rm')) return;
    const it = e.target.closest('.xh-it');
    if (it && it.dataset.lp) { delete it.dataset.lp; e.preventDefault(); e.stopPropagation(); return; }
    if (editing) { e.preventDefault(); e.stopPropagation(); if (!it) setEdit(false); }
  }, true);
  /* 編集中に、並びの外の空いた所を押したら終わる */
  scroller.addEventListener('click', e => { if (editing && !e.target.closest('.xh-it, .xh-tools, .xh-editbtn')) setEdit(false); });
  addEventListener('keydown', e => { if (editing && e.key === 'Escape') { e.preventDefault(); setEdit(false); } });
  bus.on('wm:focus', w => { if (w && editing) setEdit(false); });
  X.reg.watch('home.layout', repaint);
  X.reg.watch('apps.hidden', repaint);
  X.reg.watch('apps.web', repaint);
  X.reg.watch('apps.custom', repaint);
  bus.on('home:widgets', repaint);
  bus.on('apps:change', e => {
    if (e && e.type === 'install' && e.id && !inHome('a:' + e.id)) addToHome('a:' + e.id);      // 入れたアプリはホームの最後へ
    else if (e && e.type === 'uninstall' && e.id && inHome('a:' + e.id)) removeFromHome('a:' + e.id);
    else repaint();
  });
  paint();
  return { gallery, setEdit, isEditing, getLayout, setLayout, addToHome, removeFromHome, inHome, placeXevarion, repaint };
}

/* XEVARIX — 窓の管理（Window Manager）
   画面の形は3つ。同じ窓が、形に合わせてふるまいを変える。
     desktop … 重なる窓（動かす・大きさを変える・左右に寄せる・最大化・しまう）
     tablet  … ふつうは desktop と同じ動かせる窓（iPadOS 26 の「ウインドウ」。指でも動かせるよう、つかむ所を大きく）。
               設定の「タブレットの窓」（wm.tablet）を 'full' にすると、全画面＋左右に2つ並べる
     phone   … 全画面を1つずつ（切りかえはカードの一覧）
   free() … 窓を自由に動かせるか（desktop と、窓の形のタブレット）
   窓の中身（iframe）は proc が作って渡す。ここは「置き場所と見え方」だけを受けもつ。 */

import { bus, log } from './core.js';
import { h, clamp } from './util.js';
import { icon, appTile } from './icons.js';

const wins = new Map();
let stage = null, reg = null, previewEl = null;
let mode = 'desktop', activeId = null, space = 'main';
let zTop = 10, seq = 0, ovOn = false, pageHidden = false, locked = false;
const DOCK_RESERVE = 80, BAR_H = 38;
const RS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

const isSnap = w => w.state === 'snap-l' || w.state === 'snap-r';
const free = () => mode === 'desktop' || (mode === 'tablet' && (!reg || reg.get('wm.tablet') !== 'full'));
const boundsKey = id => (mode === 'desktop' ? id : 't:' + id);     // PC とタブレットで、窓の位置と大きさは別に覚える
function stageSize() { return { W: stage.clientWidth, H: stage.clientHeight }; }
function availH() { const { H } = stageSize(); return mode === 'desktop' ? Math.max(200, H - DOCK_RESERVE) : H; }

function computeMode() {
  const forced = reg && reg.get('wm.mode');
  if (forced && forced !== 'auto') return forced;
  const w = innerWidth, hh = innerHeight;
  const coarse = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
  if (w < 700 || Math.min(w, hh) < 500) return 'phone';
  if (coarse || w < 1000) return 'tablet';
  return 'desktop';
}

function effState(w) {
  if (free()) return w.state;
  if (mode === 'tablet' && isSnap(w)) return w.state;
  return 'max';
}
function rectOf(w) {
  const { W } = stageSize(); const H = availH(); const st = effState(w);
  if (st === 'max') return { x: 0, y: 0, w: W, h: H };
  if (st === 'snap-l') return { x: 0, y: 0, w: Math.floor(W / 2), h: H };
  if (st === 'snap-r') return { x: Math.floor(W / 2), y: 0, w: W - Math.floor(W / 2), h: H };
  return { x: w.x, y: w.y, w: Math.min(w.w, W), h: Math.min(w.h, H) };
}
function paint(w) {
  const r = rectOf(w);
  w.el.style.transform = 'translate3d(' + Math.round(r.x) + 'px,' + Math.round(r.y) + 'px,0)';
  w.el.style.width = Math.round(r.w) + 'px';
  w.el.style.height = Math.round(r.h) + 'px';
  w.el.dataset.state = effState(w);
  w.maxBtn && w.maxBtn.replaceChildren(icon(effState(w) === 'normal' ? 'max' : 'restore'));
}
function schedulePaint(w) { if (!w.raf) w.raf = requestAnimationFrame(() => { w.raf = 0; paint(w); }); }

function visOf(w) {
  if (pageHidden || locked) return 'hidden';
  if (w.min || w.space !== space) return 'hidden';
  if (w.id === activeId) return 'focus';
  if (free()) return 'visible';
  if (mode === 'tablet') { const a = wins.get(activeId); if (a && isSnap(a) && isSnap(w) && a.state !== w.state && w.z === pairZ(a)) return 'visible'; }
  return 'hidden';
}
/* タブレットの2分割：反対側に寄せた窓のうち、いちばん手前のもの */
function pairZ(a) {
  let z = -1;
  for (const w of wins.values()) if (w !== a && !w.min && w.space === space && isSnap(w) && w.state !== a.state) z = Math.max(z, w.z);
  return z;
}
function refresh() {
  let any = false;
  for (const w of wins.values()) {
    const v = visOf(w);
    if (w.vis !== v) { w.vis = v; w.el.dataset.vis = v; }
    w.el.dataset.focus = w.id === activeId ? '1' : '0';
    w.el.dataset.min = w.min ? '1' : '0';
    w.el.hidden = w.space !== space;
    if (!w.min && w.space === space) any = true;
  }
  document.body.dataset.home = any && activeId ? '0' : '1';
  bus.emit('wm:state', null);
}
function topWindow(except) {
  let best = null;
  for (const w of wins.values()) if (w.id !== except && !w.min && w.space === space && (!best || w.z > best.z)) best = w;
  return best;
}
function saveBounds(w) {
  if (!reg || !free() || !w.appId || w.multi) return;
  reg.update('wm.bounds', b => { b = b || {}; b[boundsKey(w.appId)] = { x: Math.round(w.x), y: Math.round(w.y), w: Math.round(w.w), h: Math.round(w.h), state: w.state }; return b; });
}

function showPreview(kind) {
  if (!kind) { if (previewEl) { previewEl.remove(); previewEl = null; } return; }
  const { W } = stageSize(); const H = availH();
  const r = kind === 'max' ? [6, 6, W - 12, H - 12] : kind === 'snap-l' ? [6, 6, W / 2 - 9, H - 12] : [W / 2 + 3, 6, W / 2 - 9, H - 12];
  if (!previewEl) { previewEl = h('div', { class: 'xw-snap-preview' }); stage.append(previewEl); }
  Object.assign(previewEl.style, { left: r[0] + 'px', top: r[1] + 'px', width: r[2] + 'px', height: r[3] + 'px' });
}

function dragMove(w, e) {
  if (!free() || e.button !== 0 || e.target.closest('.xw-btn') || ovOn) return;
  wm.focus(w.id);
  const bar = e.currentTarget, sx = e.clientX, sy = e.clientY, sr = stage.getBoundingClientRect();
  let ox = w.x, oy = w.y, moved = false, snapTo = null;
  const home = { x: w.x, y: w.y, was: w.state };      // 端へ寄せたとき、元の大きさに戻す場所として覚えておく
  try { bar.setPointerCapture(e.pointerId); } catch { /* 古い端末 */ }
  const move = ev => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (!moved) {
      if (Math.abs(dx) + Math.abs(dy) < 4) return;
      moved = true; stage.classList.add('dragging');
      if (w.state !== 'normal') {
        const r = rectOf(w); const ratio = clamp((sx - sr.left - r.x) / r.w, .1, .9);
        w.state = 'normal'; w.x = sx - sr.left - w.w * ratio; w.y = Math.max(0, sy - sr.top - 18); ox = w.x; oy = w.y;
      }
    }
    w.x = clamp(ox + dx, 90 - w.w, sr.width - 90);
    w.y = clamp(oy + dy, 0, Math.max(0, availH() - BAR_H));
    schedulePaint(w);
    const px = ev.clientX - sr.left, py = ev.clientY - sr.top;
    snapTo = py < 5 ? 'max' : px < 8 ? 'snap-l' : px > sr.width - 8 ? 'snap-r' : null;
    showPreview(snapTo);
  };
  const up = () => {
    bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); bar.removeEventListener('pointercancel', up);
    try { bar.releasePointerCapture(e.pointerId); } catch { /* すでに外れている */ }
    stage.classList.remove('dragging'); showPreview(null);
    if (!moved) return;
    if (snapTo) { w.state = snapTo; if (home.was === 'normal') { w.x = home.x; w.y = home.y; } else { const { W } = stageSize(); w.x = Math.max(8, (W - w.w) / 2); w.y = 24; } }
    paint(w); saveBounds(w); refresh();
  };
  bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
}

function dragResize(w, dir, e) {
  if (!free() || e.button !== 0 || w.state !== 'normal') return;
  e.preventDefault(); e.stopPropagation();
  wm.focus(w.id);
  const hEl = e.currentTarget, sx = e.clientX, sy = e.clientY, o = { x: w.x, y: w.y, w: w.w, h: w.h };
  const { W } = stageSize(); const H = availH();
  try { hEl.setPointerCapture(e.pointerId); } catch { /* 古い端末 */ }
  stage.classList.add('dragging');
  const move = ev => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (dir.includes('e')) w.w = clamp(o.w + dx, w.minW, W - o.x + 60);
    if (dir.includes('s')) w.h = clamp(o.h + dy, w.minH, H - o.y);
    if (dir.includes('w')) { const nw = clamp(o.w - dx, w.minW, o.x + o.w + 60); w.x = o.x + (o.w - nw); w.w = nw; }
    if (dir.includes('n')) { const nh = clamp(o.h - dy, w.minH, o.y + o.h); w.y = o.y + (o.h - nh); w.h = nh; }
    schedulePaint(w);
  };
  const up = () => {
    hEl.removeEventListener('pointermove', move); hEl.removeEventListener('pointerup', up); hEl.removeEventListener('pointercancel', up);
    try { hEl.releasePointerCapture(e.pointerId); } catch { /* すでに外れている */ }
    stage.classList.remove('dragging'); paint(w); saveBounds(w);
  };
  hEl.addEventListener('pointermove', move); hEl.addEventListener('pointerup', up); hEl.addEventListener('pointercancel', up);
}

function layoutOverview() {
  const list = [...wins.values()].filter(w => w.space === space).sort((a, b) => a.n - b.n);
  const { W, H } = stageSize(); const n = list.length; if (!n) return;
  const pad = mode === 'phone' ? 14 : 26, lab = 30;
  const usableH = H - (mode === 'desktop' ? DOCK_RESERVE : 0);
  let cols = clamp(Math.ceil(Math.sqrt(n * (W / usableH))), 1, n);
  if (mode === 'phone') cols = n === 1 ? 1 : 2;
  const rows = Math.ceil(n / cols);
  const cw = (W - pad * (cols + 1)) / cols, ch = (usableH - pad * (rows + 1)) / rows;
  list.forEach((w, i) => {
    const r = rectOf(w); const s = Math.min(cw / r.w, (ch - lab) / r.h, 1);
    const cx = pad + (i % cols) * (cw + pad) + (cw - r.w * s) / 2;
    const cy = pad + Math.floor(i / cols) * (ch + pad) + (ch - lab - r.h * s) / 2;
    w.el.style.setProperty('--ovt', 'translate3d(' + Math.round(cx) + 'px,' + Math.round(cy) + 'px,0) scale(' + s.toFixed(4) + ')');
    w.el.style.setProperty('--ovs', s.toFixed(4));
  });
}

export const wm = {
  init(opts) {
    stage = opts.stage; reg = opts.reg; space = (reg && reg.get('spaces.current')) || 'main';
    mode = computeMode(); document.body.dataset.mode = mode; document.body.dataset.home = '1'; document.body.dataset.wins = free() ? '1' : '0';
    let rt = 0;
    const onResize = () => { cancelAnimationFrame(rt); rt = requestAnimationFrame(() => wm.layout()); };
    addEventListener('resize', onResize); addEventListener('orientationchange', onResize);
    document.addEventListener('visibilitychange', () => { pageHidden = document.hidden; refresh(); });
    /* 別のサイトの中身（iframe）を押したときも、その窓を手前にする */
    addEventListener('blur', () => setTimeout(() => {
      const a = document.activeElement;
      if (a && a.tagName === 'IFRAME') { for (const w of wins.values()) if (w.frame === a && w.id !== activeId) { wm.focus(w.id, { keep: true }); break; } }
    }, 0));
    stage.addEventListener('pointerdown', e => { if (ovOn && e.target === stage) wm.overview(false); });
    reg && reg.watch('wm.mode', () => wm.layout());
    reg && reg.watch('wm.tablet', () => wm.layout());
    return wm;
  },
  get mode() { return mode; },
  /* 窓を自由に動かせる形か（PC と、窓の形のタブレット） */
  get free() { return free(); },
  get space() { return space; },
  get activeId() { return activeId; },
  get overviewOn() { return ovOn; },
  get locked() { return locked; },
  list() { return [...wins.values()]; },
  get(id) { return wins.get(id) || null; },
  active() { return wins.get(activeId) || null; },
  byPid(pid) { for (const w of wins.values()) if (w.pid === pid) return w; return null; },
  visibility(id) { const w = wins.get(id); return w ? visOf(w) : 'hidden'; },
  stageSize, availH,

  open({ pid, app, title, frame, multi }) {
    const id = 'w' + (++seq); const wd = (app && app.win) || {};
    const { W } = stageSize(); const H = availH();
    const saved = (!multi && reg && free() && (reg.get('wm.bounds') || {})[boundsKey(app.id)]) || null;
    const w = {
      id, pid, appId: app.id, app, title: title || app.name, frame, multi: !!multi, n: seq, space,
      minW: wd.minW || 300, minH: wd.minH || 220,
      w: clamp((saved && saved.w) || wd.w || 780, wd.minW || 300, Math.max(320, W - 24)),
      h: clamp((saved && saved.h) || wd.h || 540, wd.minH || 220, Math.max(240, H - 16)),
      state: (saved && saved.state) || (wd.max ? 'max' : 'normal'), min: false, vis: '', z: ++zTop,
    };
    const count = [...wins.values()].filter(x => x.space === space && !x.min).length;
    w.x = saved ? saved.x : Math.max(8, (W - w.w) / 2 + ((count % 6) - 1) * 26);
    w.y = saved ? saved.y : Math.max(8, (H - w.h) / 2.4 + ((count % 6) - 1) * 22);
    w.x = clamp(w.x, 90 - w.w, Math.max(0, W - 90)); w.y = clamp(w.y, 0, Math.max(0, H - BAR_H));
    if (w.w >= W - 24 && w.h >= H - 16) w.state = 'max';

    const btn = (cls, ic, label, fn) => h('button', { class: 'xw-btn ' + cls, type: 'button', title: label, 'aria-label': label, onclick: e => { e.stopPropagation(); fn(); } }, icon(ic));
    w.titleEl = h('span', { class: 'xw-title' }, w.title);
    w.maxBtn = btn('max', 'max', '最大化', () => wm.toggleMax(id));
    const bar = h('header', { class: 'xw-bar', onpointerdown: e => dragMove(w, e), ondblclick: e => { if (!e.target.closest('.xw-btn')) wm.toggleMax(id); } },
      appTile(app), w.titleEl,
      btn('min', 'min', 'しまう', () => wm.minimize(id)), w.maxBtn,
      btn('close', 'close', '閉じる', () => wm.requestClose(id)));
    w.body = h('div', { class: 'xw-body' }, h('div', { class: 'xw-ph' }, appTile(app), h('span', null, app.name)), frame);
    w.el = h('section', { class: 'xw opening', role: 'dialog', 'aria-label': w.title, data: { id, app: app.id }, style: { zIndex: w.z } },
      bar, w.body,
      RS.map(d => h('div', { class: 'xw-rs ' + d, onpointerdown: e => dragResize(w, d, e) })),
      h('div', { class: 'xw-ovl' }, h('span', { class: 'xw-ovl-t' }, appTile(app), h('b', null, w.title)),
        h('button', { class: 'xw-ovl-x', type: 'button', 'aria-label': '閉じる', onclick: e => { e.stopPropagation(); wm.requestClose(id); } }, icon('close'))));
    w.el.addEventListener('pointerdown', e => {
      if (ovOn) { e.preventDefault(); e.stopPropagation(); if (!e.target.closest('.xw-ovl-x')) { wm.overview(false); wm.focus(id); } return; }
      if (activeId !== id) wm.focus(id, { keep: true });
    }, true);
    wins.set(id, w);
    paint(w); stage.append(w.el);
    setTimeout(() => w.el.classList.remove('opening'), 320);
    if (ovOn) wm.overview(false);
    wm.focus(id);
    bus.emit('wm:open', { id, pid, appId: app.id });
    return id;
  },

  /* 「閉じる」は proc に頼む（プロセスを終わらせてから窓を消す） */
  requestClose(id) { const w = wins.get(id); if (w) bus.emit('wm:close-request', { id, pid: w.pid }); },

  destroy(id) {
    const w = wins.get(id); if (!w) return;
    wins.delete(id);
    w.el.classList.add('closing');
    const el = w.el; setTimeout(() => el.remove(), 180);
    if (activeId === id) { const t = topWindow(id); activeId = null; if (t && (free() || ovOn)) wm.focus(t.id); else refresh(); } else refresh();
    if (ovOn) { if (![...wins.values()].some(x => x.space === space)) wm.overview(false); else layoutOverview(); }
    bus.emit('wm:close', { id, pid: w.pid, appId: w.appId });
    if (!activeId) bus.emit('wm:focus', null);
  },

  focus(id, opt = {}) {
    const w = wins.get(id); if (!w) return;
    if (w.space !== space) wm.setSpace(w.space);
    w.min = false;
    if (activeId !== id || w.z !== zTop) { w.z = ++zTop; w.el.style.zIndex = w.z; }
    const changed = activeId !== id; activeId = id;
    refresh();
    if (!opt.keep) { try { w.frame.contentWindow && w.frame.contentWindow.focus(); } catch { /* 別サイトの中身 */ } }
    if (changed) bus.emit('wm:focus', { id, pid: w.pid, appId: w.appId });
  },

  minimize(id) {
    const w = wins.get(id); if (!w) return;
    w.min = true;
    if (activeId === id) { activeId = null; const t = free() ? topWindow(id) : null; if (t) return wm.focus(t.id); bus.emit('wm:focus', null); }
    refresh();
  },

  toggleMax(id) { const w = wins.get(id); if (!w || !free()) return; w.state = w.state === 'normal' ? 'max' : 'normal'; paint(w); saveBounds(w); refresh(); },
  snap(id, side) {
    const w = wins.get(id); if (!w || mode === 'phone') return;
    w.state = side === 'left' ? 'snap-l' : side === 'right' ? 'snap-r' : side === 'max' ? 'max' : 'normal';
    paint(w); saveBounds(w); refresh();
  },
  setTitle(id, title) { const w = wins.get(id); if (!w) return; w.title = title; w.titleEl.textContent = title; w.el.setAttribute('aria-label', title); bus.emit('wm:state', null); },

  /* ホームへ（全部しまう） */
  home() {
    if (ovOn) wm.overview(false);
    let any = false;
    for (const w of wins.values()) if (w.space === space && !w.min) { w.min = true; any = true; }
    activeId = null; refresh(); bus.emit('wm:focus', null);
    return any;
  },

  overview(on) {
    const want = on === undefined ? !ovOn : !!on;
    if (want && ![...wins.values()].some(w => w.space === space)) return false;
    if (want === ovOn) return ovOn;
    ovOn = want;
    stage.classList.add('ov-anim');
    if (ovOn) layoutOverview();
    stage.classList.toggle('ov', ovOn); document.body.dataset.ov = ovOn ? '1' : '0';
    setTimeout(() => stage.classList.remove('ov-anim'), 340);
    bus.emit('wm:overview', ovOn);
    return ovOn;
  },

  cycle(dir = 1) {
    const list = [...wins.values()].filter(w => w.space === space).sort((a, b) => b.z - a.z);
    if (list.length < 2) { if (list.length === 1) wm.focus(list[0].id); return; }
    const t = dir > 0 ? list[1] : list[list.length - 1];
    if (dir > 0) { const a = list[0]; a.z = Math.min(...list.map(w => w.z)) - 1; a.el.style.zIndex = a.z; }
    wm.focus(t.id);
  },

  setSpace(id) {
    if (space === id) return;
    space = id; activeId = null;
    if (ovOn) wm.overview(false);
    const t = topWindow(null);
    if (t && free()) wm.focus(t.id); else { refresh(); bus.emit('wm:focus', null); }
    bus.emit('wm:space', id);
  },
  moveToSpace(id, sp) { const w = wins.get(id); if (!w) return; w.space = sp; if (activeId === id && sp !== space) activeId = null; refresh(); },

  setLocked(v) { locked = !!v; refresh(); },

  layout() {
    const m = computeMode(), changed = m !== mode, wasFree = document.body.dataset.wins === '1';
    if (changed) { mode = m; document.body.dataset.mode = m; }
    const nowFree = free();
    document.body.dataset.wins = nowFree ? '1' : '0';
    if (changed || wasFree !== nowFree) { if (ovOn) wm.overview(false); bus.emit('wm:mode', m); }
    const { W } = stageSize(); const H = availH();
    for (const w of wins.values()) {
      if (free() && w.state === 'normal') {
        w.x = clamp(w.x, 90 - w.w, Math.max(0, W - 90)); w.y = clamp(w.y, 0, Math.max(0, H - BAR_H)); }
      paint(w);
    }
    if (ovOn) layoutOverview();
    refresh();
  },
};

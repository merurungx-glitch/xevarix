/* XEVARIX — ステータスバー・ドック・ホーム・ランチャー */

import { bus } from '../core.js';
import { h, fill, fmtClock, weekday, normJa } from '../util.js';
import { icon, appTile, batteryIcon } from '../icons.js';
import { makeOrb, setOrb } from './orb.js';
import { openLayer, closeLayer, layerOpen, menu, toast, haptic, confirmBox } from './ui.js';
import { initHome } from './home.js';

let X = null;
const el = {};
const orbs = new Set();
let clockT = 0, dockRaf = 0, aiBusy = false, aiListen = false, home = null;

/* ── コア（XEVARIX のロゴ）の見た目を、いまの状態に合わせる ── */
export function registerOrb(o) { orbs.add(o); paintOrbs(); return o; }
function paintOrbs() {
  const b = X.power.battery;
  for (const o of orbs) setOrb(o, { mode: X.power.mode, level: b ? b.level : null, charging: b && b.charging, busy: aiBusy, listen: aiListen });
}
export function setOrbBusy(busy, listen) { aiBusy = !!busy; aiListen = !!listen; paintOrbs(); }

/* ── ステータスバー ── */
function buildStatus() {
  const bar = document.getElementById('xvx-status');
  el.brand = h('button', { class: 'xsb-btn xsb-brand', type: 'button', 'aria-label': 'システムメニュー', onclick: e => systemMenu(e.currentTarget) }, registerOrb(makeOrb()), h('span', null, 'XEVARIX'), h('em', { class: 'xsb-beta', title: 'β版（試験公開中）' }, 'β'));   /* ★★ 2026-11-17 β版の印 */
  el.app = h('span', { class: 'xsb-app' });
  el.appx = h('button', { class: 'xsb-btn xsb-appx', type: 'button', 'aria-label': 'この窓の操作', onclick: e => windowMenu(e.currentTarget) }, icon('more'));
  el.ind = h('span', { class: 'xsb-ind' });
  el.search = h('button', { class: 'xsb-btn', type: 'button', title: '検索（Ctrl+K）', 'aria-label': '検索', onclick: () => X.act.search() }, icon('search'));
  el.batt = h('button', { class: 'xsb-btn xsb-batt', type: 'button', 'aria-label': '電力とコントロールセンター', onclick: () => X.act.control() });
  el.bell = h('button', { class: 'xsb-btn', type: 'button', 'aria-label': '通知', onclick: () => X.act.notifications() });
  el.clock = h('button', { class: 'xsb-btn xsb-clock', type: 'button', 'aria-label': 'コントロールセンター', onclick: () => X.act.control() });
  fill(bar, h('div', { class: 'xsb-l' }, el.brand, el.app, el.appx), h('div', { class: 'xsb-r' }, el.ind, el.search, el.bell, el.batt, el.clock));
  paintStatus(); tickClock();
}
function tickClock() {
  clearTimeout(clockT);
  const d = new Date(); const sec = X.reg.get('ui.seconds');
  fill(el.clock, h('span', { class: 'xsb-date' }, (d.getMonth() + 1) + '/' + d.getDate() + '（' + weekday(d) + '）'), h('span', null, fmtClock(d, X.reg.get('ui.clock24'), sec)));
  clockT = setTimeout(tickClock, sec ? 1000 - d.getMilliseconds() : (60 - d.getSeconds()) * 1000 - d.getMilliseconds() + 30);
  bus.emit('clock:tick', d);
}
function paintStatus() {
  const w = X.wm.active();
  el.app.textContent = w ? w.title : '';
  const p = X.power, b = p.battery, m = p.info();
  fill(el.batt, p.mode !== 'balanced' ? icon(m.icon) : null, batteryIcon(b ? b.level : null, b && b.charging), b ? h('b', null, Math.round(b.level * 100) + '%') : null);
  el.batt.title = m.name + (p.reason ? '（' + p.reason + '）' : '') + (b ? ' ・ 電池 ' + Math.round(b.level * 100) + '%' + (b.charging ? '（充電中）' : '') : '');
  const n = X.notify.unread;
  fill(el.bell, icon(X.notify.dnd ? 'bellOff' : 'bell'), n ? h('span', { class: 'xsb-badge' }, n > 99 ? '99+' : n) : null);
  const ind = [];
  if (X.power.game) ind.push(['gamepad', 'ゲームモード']);
  if (X.power.wake) ind.push(['eye', '画面を消さない']);
  if (X.services && X.services.focusOn()) ind.push(['target', '集中モード']);
  if (!navigator.onLine) ind.push(['wifiOff', 'オフライン']);
  fill(el.ind, ind.map(([ic, label]) => h('span', { title: label, style: 'display:inline-flex;padding:0 3px' }, icon(ic))));
  paintOrbs();
}

function systemMenu(at) {
  const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
  menu([
    { label: 'この XEVARIX について', icon: 'info', fn: () => X.proc.spawn('settings', { page: 'about' }) },
    { label: '設定', icon: 'settings', fn: () => X.proc.spawn('settings') },
    { label: 'システムモニター', icon: 'activity', fn: () => X.proc.spawn('monitor') },
    { label: 'ヘルプ', icon: 'book', fn: () => X.proc.spawn('help') },
    '-',
    X.wm.mode === 'desktop' && { label: X.reg.get('ui.widgets') ? 'ホームの列をかくす' : 'ホームの列を出す', icon: 'sidebar', fn: () => X.reg.set('ui.widgets', !X.reg.get('ui.widgets')) },
    home && { label: 'ホームを編集', icon: 'edit', fn: () => editHome() },
    { label: fs ? '全画面をやめる' : '全画面にする', icon: fs ? 'shrink' : 'expand', fn: () => X.sys.tryCall('sys.fullscreen', { on: !fs }) },
    '-',
    { label: 'ロック', icon: 'lock', fn: () => X.act.lock() },
    { label: 'ユーザーを切りかえる', icon: 'users', fn: () => X.act.switchUser() },
    { label: '再起動', icon: 'refresh', fn: () => X.act.restart() },
  ], at);
}
function windowMenu(at) {
  const w = X.wm.active(); if (!w) return;
  menu([
    { label: 'ホームへ', icon: 'home', fn: () => X.wm.home() },
    X.wm.mode !== 'phone' && { label: '左に並べる', icon: 'sidebar', fn: () => X.wm.snap(w.id, 'left') },
    X.wm.mode !== 'phone' && { label: '右に並べる', icon: 'columns', fn: () => X.wm.snap(w.id, 'right') },
    X.wm.free && w.state !== 'normal' && { label: '窓にもどす', icon: 'restore', fn: () => X.wm.snap(w.id, 'normal') },
    X.wm.mode !== 'phone' && (w.state !== 'max' || !X.wm.free) && { label: X.wm.free ? '画面いっぱいにする' : '全画面にもどす', icon: 'max', fn: () => X.wm.snap(w.id, 'max') },
    /* タブレットは、動かせる窓と全画面＋2分割を、ここからも切りかえられる（設定の「タブレットの窓」と同じ） */
    X.wm.mode === 'tablet' && { label: X.wm.free ? '全画面＋2分割で使う' : '動かせる窓で使う', icon: X.wm.free ? 'expand' : 'cards', fn: () => X.reg.set('wm.tablet', X.wm.free ? 'full' : 'window') },
    '-',
    { label: w.title + ' を閉じる', icon: 'close', danger: true, fn: () => X.wm.requestClose(w.id) },
  ], at);
}

/* ── ドック ── */
function dockItem(app, p) {
  const fg = p && X.wm.activeId === p.win;
  const b = h('button', { class: 'xd-item', type: 'button', title: app.name, 'aria-label': app.name, data: { app: app.id, run: p ? '1' : '0', fg: fg ? '1' : '0', st: p ? p.state : '' },
    onclick: () => {
      haptic();
      if (!p) return X.proc.spawn(app.id);
      if (fg && X.wm.free) X.wm.minimize(p.win); else X.wm.focus(p.win);
    },
    oncontextmenu: e => { e.preventDefault(); appMenu(app, { x: e.clientX, y: e.clientY }); } }, appTile(app));
  longPress(b, () => appMenu(app, b));
  return b;
}
export function appMenu(app, at) {
  const p = X.proc.byApp(app.id); const pins = X.reg.get('dock.pins') || []; const pinned = pins.includes(app.id);
  const key = 'a:' + app.id, onHome = !!(home && home.inHome(key));
  return menu([
    { label: p ? '手前に出す' : '開く', icon: 'external', fn: () => X.proc.spawn(app.id) },
    app.kind !== 'action' && { label: pinned ? 'ドックから外す' : 'ドックに置く', icon: 'pin', fn: () => X.reg.update('dock.pins', l => (pinned ? l.filter(x => x !== app.id) : [...l, app.id])) },
    home && { label: onHome ? 'ホームから外す' : 'ホームに置く', icon: onHome ? 'minus' : 'plus', fn: () => (onHome ? home.removeFromHome(key) : home.addToHome(key)) },
    home && { label: 'ホームを編集', icon: 'edit', fn: () => editHome() },
    p && p.state === 'running' && { label: '休止する', icon: 'pause', fn: () => { X.wm.minimize(p.win); X.proc.suspend(p.pid); } },
    /* ふつうに閉じる（保存していない変更があれば、アプリが確認を出す）。確認なしの強制終了は、システムモニターから */
    p && { label: '終了する', icon: 'close', danger: true, fn: () => { if (!X.proc.kill(p.pid)) X.wm.focus(p.win); } },
    app.kind === 'web' && '-',
    app.kind === 'web' && { label: 'ストアで見る', icon: 'store', fn: () => X.proc.spawn('store', { app: app.id }) },
    app.kind === 'web' && { label: '削除する', icon: 'trash', danger: true, fn: async () => {
      if (await confirmBox('「' + app.name + '」を削除しますか？', 'ホームとドックから消えます。ストアから、いつでもまた入れられます。', { ok: '削除する', danger: true })) X.apps.uninstall(app.id);
    } },
  ], at);
}
/* ホームの編集に入る（PC は右の列を出す・タブレットとスマホは窓をしまってホームへ） */
export function editHome() {
  if (!home) return;
  closeLayer('launcher');
  if (X.wm.mode === 'desktop') { if (!X.reg.get('ui.widgets')) X.reg.set('ui.widgets', true); }
  else X.wm.home();
  home.setEdit(true);
}
function longPress(node, fn, ms = 480) {
  let t = 0, sx = 0, sy = 0;
  node.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; sx = e.clientX; sy = e.clientY; t = setTimeout(() => { t = 0; haptic(14); node.dataset.lp = '1'; fn(e); }, ms); });
  const cancel = () => { clearTimeout(t); t = 0; };
  node.addEventListener('pointermove', e => { if (t && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) > 10) cancel(); });
  node.addEventListener('pointerup', cancel); node.addEventListener('pointercancel', cancel); node.addEventListener('pointerleave', cancel);
  node.addEventListener('click', e => { if (node.dataset.lp) { delete node.dataset.lp; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
}
function paintDock() {
  dockRaf = 0;
  const pins = (X.reg.get('dock.pins') || []).map(id => X.apps.get(id)).filter(a => a && X.apps.isInstalled(a.id));
  const procs = X.proc.list(); const firstByApp = new Map();
  for (const p of procs) if (!firstByApp.has(p.appId)) firstByApp.set(p.appId, p);
  const pinIds = new Set(pins.map(a => a.id));
  const others = [...firstByApp.values()].filter(p => !pinIds.has(p.appId));
  fill(el.dockL,
    h('button', { class: 'xd-item', type: 'button', title: 'すべてのアプリ', 'aria-label': 'すべてのアプリ', onclick: () => { haptic(); X.wm.mode === 'desktop' ? toggleLauncher() : (X.wm.home(), closeLayer('launcher')); } }, icon(X.wm.mode === 'desktop' ? 'grid' : 'home')),
    pins.map(a => dockItem(a, firstByApp.get(a.id) || null)));
  fill(el.dockR,
    others.map(p => dockItem(p.app, p)),
    X.wm.mode === 'tablet' && h('button', { class: 'xd-item', type: 'button', title: 'すべてのアプリ', 'aria-label': 'すべてのアプリ', onclick: () => toggleLauncher() }, icon('grid')),
    h('button', { class: 'xd-item', type: 'button', title: '開いている窓の一覧', 'aria-label': '開いている窓の一覧', onclick: () => overview() }, icon('cards')));
}
function requestDock() { if (!dockRaf) dockRaf = requestAnimationFrame(paintDock); }
function overview() { haptic(); if (X.wm.overview() === false) toast('開いているアプリはありません'); }
function buildDock() {
  const dock = document.getElementById('xvx-dock');
  el.dockL = h('div', { class: 'xd-group' }); el.dockR = h('div', { class: 'xd-group' });
  el.orbBtn = h('button', { class: 'xd-orb', type: 'button', title: 'AI（Ctrl+Alt+A）', 'aria-label': 'AI を開く', onclick: () => { haptic(10); X.act.ai(); } }, registerOrb(makeOrb()));
  fill(dock,
    h('button', { class: 'xd-item xd-phone', type: 'button', 'aria-label': 'ホーム', onclick: () => { haptic(); closeLayer('ai'); X.wm.home(); document.getElementById('xvx-desk').scrollTo({ top: 0, behavior: 'smooth' }); } }, icon('home')),
    el.dockL, el.orbBtn, el.dockR,
    h('button', { class: 'xd-item xd-phone', type: 'button', 'aria-label': '開いている窓の一覧', onclick: () => overview() }, icon('cards')));
  paintDock();
}

/* ── ホーム（アプリとウィジェットを1つの並びに。PC は右の列）── 並べかえ・編集は home.js */
function appButton(a, onOpen) {
  const b = h('button', { class: 'xh-app', type: 'button', onclick: () => { haptic(); onOpen && onOpen(); X.proc.spawn(a.id); },
    oncontextmenu: e => { e.preventDefault(); appMenu(a, { x: e.clientX, y: e.clientY }); } }, appTile(a), h('span', null, a.short || a.name));
  longPress(b, () => appMenu(a, b));
  return b;
}
function buildHome() {
  const desk = document.getElementById('xvx-desk');
  el.grid = h('div', { class: 'xh-grid' });
  el.home = h('div', { class: 'xh-wrap' },
    h('button', { class: 'xh-search glass', type: 'button', onclick: () => X.act.search() }, icon('search'), 'アプリ・ファイル・設定をさがす'),
    h('div', { class: 'xh-tools glass', role: 'toolbar', 'aria-label': 'ホームの編集' },
      h('button', { class: 'chip', type: 'button', onclick: () => home.gallery() }, icon('plus'), 'ウィジェット'),
      h('span', { class: 'xh-tools-t' }, '持って動かす・－で外す'),
      h('button', { class: 'chip on', type: 'button', onclick: () => home.setEdit(false) }, icon('check'), '完了')),
    el.grid,
    h('button', { class: 'chip xh-editbtn', type: 'button', onclick: () => editHome() }, icon('edit'), 'ホームを編集'));
  fill(desk, el.home);
  home = initHome(X, { host: el.home, grid: el.grid, scroller: desk, appTile, appMenu });
}

/* ── ランチャー（すべてのアプリ）── */
export function toggleLauncher() {
  if (closeLayer('launcher')) return;
  const input = h('input', { class: 'field', type: 'search', placeholder: 'アプリをさがす', 'aria-label': 'アプリをさがす', autocomplete: 'off', spellcheck: 'false' });
  const body = h('div', { class: 'xl-body' });
  const card = h('div', { class: 'xl-card glass pop', role: 'dialog', 'aria-label': 'すべてのアプリ' }, h('div', { class: 'xl-top' }, h('span', { class: 'xl-si' }, icon('search')), input), body);
  const wrap = h('div', { class: 'xl' }, card);
  const hd = openLayer(wrap, { key: 'launcher' });
  wrap.addEventListener('pointerdown', e => { if (e.target === wrap) hd.close(); });
  const draw = () => {
    const q = normJa(input.value).replace(/\s+/g, '');
    const all = X.apps.installed().filter(a => !q || [a.name, a.full, a.short, a.sub, ...(a.keys || [])].filter(Boolean).some(s => normJa(s).replace(/\s+/g, '').includes(q)));
    if (!all.length) return fill(body, h('div', { class: 'xl-empty' }, '見つかりません。ストアで新しいアプリを探せます。'));
    const groups = new Map();
    for (const a of all) { const c = a.cat || 'other'; if (!groups.has(c)) groups.set(c, []); groups.get(c).push(a); }
    const order = ['system', 'learn', 'game', 'social', 'info', 'shop', 'other'];
    fill(body, order.filter(c => groups.has(c)).map(c => [h('div', { class: 'xl-cat' }, X.apps.CATS[c] || c), h('div', { class: 'xl-grid' }, groups.get(c).map(a => appButton(a, () => hd.close())))]));
  };
  input.addEventListener('input', draw);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = body.querySelector('.xh-app'); if (b) b.click(); } });
  draw(); setTimeout(() => input.focus(), 60);
}

/* ── 画面の端（iPhone のアプリ表示で、表示領域が画面より短いときの下の余白を実測で直す）── */
function fitSafeArea() {
  const probe = h('div', { style: 'position:fixed;left:0;bottom:0;width:1px;height:0;padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none' });
  document.body.append(probe);
  const envB = probe.offsetHeight, boxBottom = probe.getBoundingClientRect().bottom; probe.remove();
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const short = standalone ? Math.max(screen.width, screen.height) - boxBottom : 0;
  const landscape = innerWidth > innerHeight;
  if (!landscape && short > 0 && short < 200) document.documentElement.style.setProperty('--sab', Math.max(0, envB - short) + 'px');
  else document.documentElement.style.removeProperty('--sab');
}

export function initDesktop(ctx) {
  X = ctx;
  buildStatus(); buildDock(); buildHome(); fitSafeArea();
  const repaint = () => { paintStatus(); requestDock(); };
  for (const ev of ['wm:focus', 'wm:state', 'wm:mode', 'proc:spawn', 'proc:exit', 'proc:state', 'proc:ready']) bus.on(ev, repaint);
  for (const ev of ['power:state', 'power:mode', 'notify:new', 'notify:change', 'power:game', 'focus:change']) bus.on(ev, paintStatus);
  bus.on('apps:change', () => requestDock());
  X.reg.watch('dock.pins', requestDock);
  X.reg.watch('ui.seconds', tickClock); X.reg.watch('ui.clock24', tickClock);
  addEventListener('online', paintStatus); addEventListener('offline', paintStatus);
  addEventListener('resize', fitSafeArea); addEventListener('orientationchange', () => setTimeout(fitSafeArea, 300));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tickClock(); fitSafeArea(); } });
  return { home, paintStatus };
}

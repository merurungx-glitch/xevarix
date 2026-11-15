/* XEVARIX — 本体の画面の共通部品：かぶさる面・確認の窓・メニュー・お知らせの札・効果音 */

import { bus, log } from '../core.js';
import { h, clamp } from '../util.js';
import { icon, appTile } from '../icons.js';

let reg = null, appsApi = null, sysApi = null;
export function initUI(o) { reg = o.reg; appsApi = o.apps; sysApi = o.sys; wireToasts(); wireKeys(); }

/* ── かぶさる面（ランチャー・パネル・検索など）── */
const stack = [];
const DUR = () => (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur')) || 0);
export function openLayer(el, { scrim = 'dark', onClose, key } = {}) {
  if (key) { const ex = stack.find(s => s.key === key); if (ex) { ex.close(); return null; } }
  const root = document.getElementById('xvx-layer');
  let closed = false;
  const handle = { key, el, close() {
    if (closed) return; closed = true;
    const i = stack.indexOf(handle); if (i >= 0) stack.splice(i, 1);
    wrap.classList.remove('show'); el.classList.remove('show');
    setTimeout(() => wrap.remove(), DUR() + 30);
    try { onClose && onClose(); } catch (e) { log.warn('ui', e.message); }
    bus.emit('ui:layer', { key, open: false });
  } };
  const wrap = h('div', { class: 'xlw' + (scrim === 'none' ? ' pass' : '') },
    scrim !== 'none' && h('div', { class: 'scrim' + (scrim === 'clear' ? ' clear' : ''), onpointerdown: e => { e.preventDefault(); handle.close(); } }), el);
  root.append(wrap);
  requestAnimationFrame(() => requestAnimationFrame(() => { wrap.classList.add('show'); el.classList.add('show'); }));
  stack.push(handle);
  bus.emit('ui:layer', { key, open: true });
  return handle;
}
export const layerOpen = key => stack.some(s => s.key === key);
export function closeLayer(key) { const s = stack.find(x => x.key === key); if (s) s.close(); return !!s; }
export function closeAllLayers() { for (const s of [...stack]) s.close(); }
function wireKeys() {
  addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length && !document.querySelector('.xm')) { e.preventDefault(); stack[stack.length - 1].close(); } });
}

/* ── 確認の窓 ── */
export function modal({ title, text, body, buttons, input, wide }) {
  return new Promise(res => {
    let field = null;
    const done = v => { el.remove(); removeEventListener('keydown', onKey, true); res(v); };
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(input ? null : (buttons.find(b => b.cancel) || {}).value ?? null); }
      else if (e.key === 'Enter' && (!e.target || e.target.tagName !== 'TEXTAREA')) { const p = buttons.find(b => b.kind === 'pri' || b.kind === 'danger'); if (p) { e.preventDefault(); e.stopPropagation(); done(input ? field.value : p.value); } }
    };
    if (input) field = h(input.multiline ? 'textarea' : 'input', { class: 'field', type: input.type || 'text', value: input.value || '', placeholder: input.placeholder || '', maxlength: input.max || 200, inputmode: input.mode || null, autocomplete: 'off', style: input.multiline ? 'height:110px;padding:10px 12px;resize:vertical' : null });
    const el = h('div', { class: 'xm' },
      h('div', { class: 'scrim show', onpointerdown: () => done(input ? null : (buttons.find(b => b.cancel) || {}).value ?? null) }),
      h('div', { class: 'xm-card glass', role: 'alertdialog', 'aria-modal': 'true', style: wide ? 'width:min(560px,100%)' : null },
        title && h('h3', null, title), text && h('p', null, text), body || null, field,
        h('div', { class: 'xm-btns' }, buttons.map(b => h('button', { class: 'btn ' + (b.kind || ''), type: 'button', onclick: () => done(input && !b.cancel ? field.value : b.value) }, b.label)))));
    document.body.append(el);
    addEventListener('keydown', onKey, true);
    setTimeout(() => { (field || el.querySelector('.btn.pri') || el.querySelector('.btn')).focus(); field && field.select && field.select(); }, 30);
  });
}
export const alertBox = (title, text) => modal({ title, text, buttons: [{ label: 'OK', kind: 'pri', value: true }] });
export const confirmBox = (title, text, { ok = 'OK', cancel = 'やめる', danger = false } = {}) =>
  modal({ title, text, buttons: [{ label: cancel, value: false, cancel: true }, { label: ok, kind: danger ? 'danger' : 'pri', value: true }] });
export const promptBox = (title, text, opt = {}) =>
  modal({ title, text, input: opt, buttons: [{ label: 'やめる', value: null, cancel: true }, { label: opt.ok || 'OK', kind: 'pri', value: true }] });

/* ── メニュー ── items: [{label, icon, fn, danger} | '-'] */
export function menu(items, at) {
  document.querySelectorAll('.xc').forEach(n => n.remove());
  const el = h('div', { class: 'xc glass', role: 'menu' }, items.filter(Boolean).map(it => it === '-' ? h('hr') :
    h('button', { type: 'button', role: 'menuitem', class: it.danger ? 'danger' : '', onclick: () => { close(); it.fn && it.fn(); } }, it.icon && icon(it.icon), it.label)));
  document.body.append(el);
  let x = at.x, y = at.y;
  if (at.getBoundingClientRect) { const r = at.getBoundingClientRect(); x = r.left; y = r.bottom + 6; if (y + el.offsetHeight > innerHeight - 8) y = r.top - el.offsetHeight - 6; }
  el.style.left = clamp(x, 8, innerWidth - el.offsetWidth - 8) + 'px';
  el.style.top = clamp(y, 8, innerHeight - el.offsetHeight - 8) + 'px';
  const out = e => { if (!el.contains(e.target)) close(); };
  const esc = e => { if (e.key === 'Escape') close(); };
  function close() { el.remove(); removeEventListener('pointerdown', out, true); removeEventListener('keydown', esc, true); removeEventListener('blur', close); }
  setTimeout(() => { addEventListener('pointerdown', out, true); addEventListener('keydown', esc, true); addEventListener('blur', close); }, 0);
  return close;
}

/* ── お知らせの札 ── */
function showToast({ title, text, kind = 'info', ic, app, actions, timeout = 4200 }) {
  const box = document.getElementById('xvx-toasts'); if (!box) return;
  const a = app && appsApi ? appsApi.get(app) : null;
  const el = h('div', { class: 'xt glass ' + kind, role: 'status' },
    a ? appTile(a) : h('span', { class: 'xt-ic' }, icon(ic || (kind === 'warn' ? 'warn' : kind === 'ok' ? 'check' : 'info'))),
    h('div', null, title && h('b', null, title), text && h('p', null, text),
      actions && actions.length ? h('div', { class: 'xn-acts' }, actions.map(ac => h('button', { class: 'btn sm', type: 'button', onclick: () => { runAction(ac); kill(); } }, ac.label))) : null),
    h('button', { class: 'ibtn', type: 'button', 'aria-label': '閉じる', style: 'width:26px;height:26px', onclick: () => kill() }, icon('close')));
  let t = setTimeout(kill, timeout);
  el.addEventListener('pointerenter', () => clearTimeout(t));
  el.addEventListener('pointerleave', () => { t = setTimeout(kill, 1800); });
  function kill() { clearTimeout(t); el.classList.add('out'); setTimeout(() => el.remove(), 260); }
  box.append(el);
  while (box.children.length > 4) box.firstChild.remove();
}
export function runAction(ac) {
  if (ac.fn) return ac.fn();
  if (ac.call && sysApi) return sysApi.tryCall(ac.call.name, ac.call.args, { by: 'user' }).then(r => { if (r && r.error) toast(r.text, 'warn'); return r; });
}
export function toast(text, kind = 'info', title) { showToast({ title, text, kind }); }
function wireToasts() {
  bus.on('shell:toast', e => showToast(e));
  bus.on('notify:new', e => {
    if (e.show) showToast({ title: e.item.title, text: e.item.body, kind: e.item.kind, app: e.item.app !== 'system' && e.item.app !== 'ai' ? e.item.app : null, ic: e.item.icon || (e.item.app === 'ai' ? 'sparkle' : null), actions: e.item.actions, timeout: e.item.actions && e.item.actions.length ? 9000 : 5200 });
    if (e.sound) sound.play(e.item.kind === 'warn' ? 'warn' : 'notify');
  });
}

/* ── 効果音（その場で合成する。音のファイルは持たない）── */
let ac = null, gesture = false;
addEventListener('pointerdown', () => { gesture = true; }, { capture: true, once: true });
addEventListener('keydown', () => { gesture = true; }, { capture: true, once: true });
function audio() {
  if (!gesture) return null;
  if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; try { ac = new C(); } catch { return null; } }
  if (ac.state === 'suspended') ac.resume().catch(() => {});
  return ac;
}
function tone(a, freq, at, dur, vol, type) {
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + at;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(.0002, vol), t + .012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .03);
}
const TUNES = {
  boot: [[523.25, 0, .5], [659.25, .11, .5], [783.99, .22, .5], [1046.5, .34, .8]],
  notify: [[880, 0, .22], [1174.7, .1, .36]],
  ok: [[659.25, 0, .16], [987.77, .09, .3]],
  warn: [[392, 0, .2], [311.1, .13, .34]],
  error: [[220, 0, .18], [196, .12, .3]],
  lock: [[660, 0, .12], [440, .08, .22]],
  unlock: [[440, 0, .12], [660, .08, .26]],
  tap: [[1200, 0, .035]],
  alarm: [[880, 0, .16], [1108.7, .2, .16], [880, .4, .16], [1108.7, .6, .16]],
  timer: [[1046.5, 0, .14], [1046.5, .2, .14], [1318.5, .4, .3]],
};
export const sound = {
  play(name, force) {
    try {
      if (!force && reg && !reg.get('sound.on')) return;
      const a = audio(); const tune = TUNES[name]; if (!a || !tune) return;
      const v = (reg ? reg.get('sound.volume') : .5) * (name === 'tap' ? .12 : .22);
      const type = reg && reg.get('sound.pack') === 'digital' ? 'triangle' : 'sine';
      for (const [f, at, d] of tune) tone(a, f, at, d, v, type);
    } catch { /* 音が出せなくても続ける */ }
  },
  /* くり返し鳴らす（アラーム）。戻り値を呼ぶと止まる */
  loop(name, every = 1100, max = 60) {
    let n = 0; sound.play(name, true);
    const t = setInterval(() => { if (++n >= max) clearInterval(t); else sound.play(name, true); }, every);
    return () => clearInterval(t);
  },
};
export function haptic(ms = 8) {
  try { if (reg && reg.get('ui.haptics') && navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch { /* 振動しない端末 */ }
}

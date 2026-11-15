/* XEVARIX — コントロールセンターと通知センター（ステータスバーの右から開く） */

import { bus } from '../core.js';
import { h, fill, fmtDur, fmtRel } from '../util.js';
import { icon, appTile } from '../icons.js';
import { openLayer, closeLayer, runAction, toast } from './ui.js';
import { avatar } from './lock.js';

let X = null;

function tile(ic, label, on, fn) {
  return h('button', { class: 'xp-tile' + (on ? ' on' : ''), type: 'button', 'aria-pressed': on ? 'true' : 'false', onclick: fn }, icon(ic), h('span', null, label));
}

function control() {
  if (closeLayer('control')) return;
  closeLayer('notifications');
  const body = h('div', { class: 'xp-body' });
  const panel = h('div', { class: 'xp glass pop', role: 'dialog', 'aria-label': 'コントロールセンター' }, body);
  const call = (name, args) => X.sys.tryCall(name, args, { by: 'user' }).then(r => { if (r && r.error) toast(r.text, 'warn'); draw(); });
  function draw() {
    const p = X.power, b = p.battery, reg = X.reg, m = p.info(), rem = p.remainingMin();
    const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const focus = X.services && X.services.focusOn();
    const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': '電力モード' }, p.MODE_ORDER.map(id => h('button', { type: 'button', role: 'radio', 'aria-checked': p.base === id ? 'true' : 'false', class: p.base === id ? 'on' : '', title: p.MODES[id].desc, onclick: () => call('power.mode', { mode: id }) }, icon(p.MODES[id].icon), p.MODES[id].short)));
    const status = (b ? '電池 ' + Math.round(b.level * 100) + '%' + (b.charging ? '・充電中' : rem ? '・あと約' + fmtDur(rem * 60000, true) : '') : '電池残量は読めない端末です') + (p.mode !== p.base ? ' ／ いまは「' + m.name + '」（' + p.reason + '）' : '');
    fill(body,
      h('div', { class: 'xp-h' },
        h('span', { style: 'display:flex;align-items:center;gap:8px;color:var(--text)' }, avatar(X.session.user, 'sm'), h('span', { style: 'font-size:.9rem' }, X.session.user.name)),
        h('span', { style: 'display:flex;gap:2px' },
          h('button', { class: 'ibtn', type: 'button', title: 'ロック', 'aria-label': 'ロック', onclick: () => { hd.close(); X.act.lock(); } }, icon('lock')),
          h('button', { class: 'ibtn', type: 'button', title: '設定', 'aria-label': '設定', onclick: () => { hd.close(); X.proc.spawn('settings'); } }, icon('settings')))),
      h('div', { class: 'xp-card' },
        h('div', { class: 'xp-h' }, h('span', null, '電力モード'), h('button', { class: 'chip' + (reg.get('power.auto') ? ' on' : ''), type: 'button', style: 'height:24px;font-size:.7rem', title: '電池残量や時間帯で、節約する方向へ自動で切りかえます', onclick: () => call('power.auto', { on: !reg.get('power.auto') }) }, '自動')),
        seg, h('div', { class: 'tiny muted' }, status), h('div', { class: 'tiny muted' }, p.MODES[p.base].desc)),
      h('div', { class: 'xp-tiles' },
        tile(X.theme.isDark() ? 'moon' : 'sun', X.theme.isDark() ? 'ダーク' : 'ライト', X.theme.isDark(), () => call('ui.theme', { theme: X.theme.isDark() ? 'light' : 'dark' })),
        tile(X.notify.dnd ? 'bellOff' : 'bell', 'おやすみ', X.notify.dnd, () => call('notify.dnd', { on: !X.notify.dnd })),
        tile('target', focus ? '集中中' : '集中 25分', focus, () => call(focus ? 'focus.stop' : 'focus.start', { minutes: 25 })),
        tile('gamepad', 'ゲーム', p.game, () => call('sys.game', { on: !p.game })),
        tile('eye', '消さない', p.wake, () => call('sys.wake', { on: !p.wake })),
        tile('wand', '動き', reg.get('ui.motion'), () => call('ui.motion', { on: !reg.get('ui.motion') })),
        tile(reg.get('sound.on') ? 'volume' : 'mute', '効果音', reg.get('sound.on'), () => call('sound.set', { on: !reg.get('sound.on') })),
        tile(fs ? 'shrink' : 'expand', '全画面', fs, () => call('sys.fullscreen', { on: !fs }))),
      h('div', { class: 'xp-card' },
        h('label', { class: 'xp-slider' }, icon('brightness'), h('input', { type: 'range', min: 30, max: 100, step: 1, value: Math.round((1 - (reg.get('ui.dim') || 0)) * 100), 'aria-label': '画面の明るさ', oninput: e => reg.set('ui.dim', Math.round((1 - e.target.value / 100) * 100) / 100) })),
        h('label', { class: 'xp-slider' }, icon('volume'), h('input', { type: 'range', min: 0, max: 100, step: 1, value: Math.round(reg.get('sound.volume') * 100), 'aria-label': '効果音の大きさ', oninput: e => reg.set('sound.volume', e.target.value / 100), onchange: () => X.sound.play('notify') }))),
      X.services ? h('div', { class: 'xp-card' }, h('div', { class: 'xp-h' }, 'スペース'),
        h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, X.services.spaces().map(s => h('button', { class: 'chip' + (X.wm.space === s.id ? ' on' : ''), type: 'button', onclick: () => call('space.switch', { space: s.id }) }, icon(s.icon || 'layers'), s.name)))) : null,
      h('div', { style: 'display:flex;gap:8px' },
        h('button', { class: 'btn sm', type: 'button', style: 'flex:1', onclick: async () => { const r = await X.sys.tryCall('sys.boost', {}); toast(r.text, r.error ? 'warn' : 'ok', 'ブースト'); draw(); } }, icon('bolt'), 'ブースト'),
        h('button', { class: 'btn sm', type: 'button', style: 'flex:1', onclick: () => { hd.close(); X.proc.spawn('monitor'); } }, icon('activity'), 'モニター')));
  }
  const offs = ['power:state', 'power:mode', 'notify:change', 'focus:change', 'space:change', 'theme:change', 'power:game'].map(ev => bus.on(ev, () => { if (!panel.contains(document.activeElement) || document.activeElement.type !== 'range') draw(); }));
  const hd = openLayer(panel, { key: 'control', scrim: 'clear', onClose: () => offs.forEach(f => f()) });
  draw();
}

function notifications() {
  if (closeLayer('notifications')) return;
  closeLayer('control');
  const body = h('div', { class: 'xp-body' });
  const panel = h('div', { class: 'xp glass pop', role: 'dialog', 'aria-label': '通知' }, body);
  function draw() {
    const list = X.notify.list();
    fill(body,
      h('div', { class: 'xp-h' }, h('span', null, '通知' + (X.notify.dnd ? '（おやすみモード中）' : '')),
        list.length ? h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { X.notify.clear(); draw(); } }, 'すべて消す') : null),
      list.length ? list.slice(0, 60).map(n => {
        const a = n.app && !['system', 'ai', 'clock'].includes(n.app) ? X.apps.get(n.app) : null;
        return h('div', { class: 'xn-item' },
          a ? appTile(a) : h('span', { class: 'xt-ic', style: 'width:30px;height:30px;border-radius:9px;background:var(--acc-soft);color:var(--acc-text);display:grid;place-items:center' }, icon(n.icon || (n.app === 'ai' ? 'sparkle' : n.app === 'clock' ? 'clock' : n.kind === 'warn' ? 'warn' : 'info'))),
          h('div', null, h('b', null, n.title), n.body ? h('p', null, n.body) : null,
            n.actions && n.actions.length ? h('div', { class: 'xn-acts' }, n.actions.filter(ac => ac.call || ac.fn).map(ac => h('button', { class: 'btn sm', type: 'button', onclick: () => { runAction(ac); X.notify.remove(n.id); if (ac.call && ac.call.name === 'app.open') closeLayer('notifications'); else draw(); } }, ac.label))) : null),
          h('span', { style: 'display:grid;justify-items:end;gap:4px' }, h('time', null, fmtRel(n.t)), h('button', { class: 'ibtn', type: 'button', 'aria-label': 'この通知を消す', style: 'width:24px;height:24px', onclick: () => { X.notify.remove(n.id); draw(); } }, icon('close'))));
      }) : h('div', { class: 'xn-empty' }, '新しい通知はありません'));
  }
  const off = bus.on('notify:new', draw);
  openLayer(panel, { key: 'notifications', scrim: 'clear', onClose: () => { off(); X.services && X.services.ringStop(); } });
  draw(); X.notify.markRead(); X.services && X.services.ringStop();
}

/* 性能の表示（左上に重ねる）。出しているあいだだけ、本体の fps を連続で測る */
let hudEl = null, hudOffs = [];
function hud() {
  const on = !!X.reg.get('perf.hud');
  if (on && !hudEl) {
    hudEl = h('div', { id: 'xvx-hud', 'aria-hidden': 'true' }); document.body.append(hudEl);
    const paint = () => { const fg = X.proc.fg(); hudEl.textContent = '本体 ' + X.perf.fps + ' fps（遅いとき ' + Math.round(X.perf.p95) + ' ms）\n' + (fg ? fg.app.name + ' ' + fg.stats.fps + ' fps・負荷 ' + Math.round(fg.stats.load * 100) + '%' : '手前のアプリなし') + '\n' + X.power.info().short + '・動作中 ' + X.proc.list().filter(p => p.state === 'running').length + ' 本'; };
    hudOffs = [X.perf.watch(), bus.on('perf:fps', paint), bus.on('proc:tick', paint)]; paint();
  } else if (!on && hudEl) { hudEl.remove(); hudEl = null; hudOffs.forEach(f => f()); hudOffs = []; }
}

export function init(ctx) { X = ctx; X.panels = { control, notifications }; X.reg.watch('perf.hud', hud); hud(); }

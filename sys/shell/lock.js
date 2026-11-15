/* XEVARIX — ロック画面（起動時のログインと、使用中のロックの両方）
   表紙（時計）→ 押す → 本人確認（パスコード・生体認証）。パスコードが無ければ押すだけで開く。 */

import { h, fill, fmtClock, fmtDate } from '../util.js';
import { icon } from '../icons.js';
import { security } from '../security.js';
import { USER_COLORS } from '../session.js';

let clockT = 0, fails = 0, lockUntil = 0;

export function avatar(user, cls = '') {
  const c = USER_COLORS[(user && user.color) || 0] || USER_COLORS[0];
  return h('span', { class: 'xu-av ' + cls, style: { '--u1': c[0], '--u2': c[1] } }, user && user.guest ? icon('user') : ((user && user.name) || '?').slice(0, 1).toUpperCase());
}

/* opts: { users, current, info():[[icon,text]], allowGuest, onSwitch, h24 }  →  { user } を返す */
export function showLock(opts) {
  return new Promise(resolve => {
    const root = document.getElementById('xvx-lock');
    const users = opts.users && opts.users.length ? opts.users : [opts.current];
    let sel = opts.current || users[0], stage = 'cover', pin = '';
    const time = h('div', { class: 'xlk-time' }), date = h('div', { class: 'xlk-date' }), info = h('div', { class: 'xlk-info' });
    const mid = h('div', { class: 'xlk-mid' }), foot = h('div', { class: 'xlk-foot' });
    const tick = () => {
      const d = new Date(); time.textContent = fmtClock(d, opts.h24 !== false); date.textContent = fmtDate(d);
      fill(info, (opts.info ? opts.info() : []).map(([ic, t]) => h('span', { class: 'xlk-pill' }, icon(ic), t)));
      clearTimeout(clockT); clockT = setTimeout(tick, (60 - d.getSeconds()) * 1000 + 50);
    };
    const finish = user => {
      clearTimeout(clockT); removeEventListener('keydown', onKey, true);
      root.classList.add('leave');
      setTimeout(() => { root.classList.remove('on', 'leave'); fill(root); resolve({ user }); }, 240);
    };
    const msg = h('div', { class: 'xlk-msg', role: 'status' });
    const dots = h('div', { class: 'xlk-dots' });
    const paintDots = () => fill(dots, Array.from({ length: (sel.pass && sel.pass.len) || 4 }, (_, i) => h('i', { class: i < pin.length ? 'f' : '' })));

    async function tryPass(value) {
      if (Date.now() < lockUntil) { msg.textContent = 'しばらく待ってからもう一度（' + Math.ceil((lockUntil - Date.now()) / 1000) + '秒）'; pin = ''; paintDots(); return; }
      msg.textContent = '確認しています…';
      if (await security.checkPass(sel.pass, value)) { fails = 0; return finish(sel); }
      fails++; pin = ''; paintDots();
      dots.classList.remove('bad'); void dots.offsetWidth; dots.classList.add('bad');
      if (fails >= 5) { lockUntil = Date.now() + 30000; msg.textContent = '5回まちがえました。30秒待ってください。'; }
      else msg.textContent = 'パスコードがちがいます';
    }
    function press(k) {
      if (stage !== 'auth' || !sel.pass || sel.pass.kind !== 'pin') return;
      if (k === 'del') pin = pin.slice(0, -1);
      else if (pin.length < sel.pass.len) pin += k;
      msg.textContent = ''; paintDots();
      if (pin.length === sel.pass.len) tryPass(pin);
    }
    async function useBio() {
      msg.textContent = '端末の本人確認を待っています…';
      if (await security.bioVerify(sel.bio)) finish(sel); else msg.textContent = '確認できませんでした。パスコードを入れてください。';
    }

    function auth() {
      stage = 'auth'; pin = ''; msg.textContent = '';
      const chooser = users.length > 1 ? h('div', { class: 'xlk-users' }, users.map(u => h('button', { class: 'xlk-user' + (u.id === sel.id ? ' on' : ''), type: 'button', onclick: () => { sel = u; auth(); } }, avatar(u), h('span', null, u.name)))) : h('div', { class: 'xlk-users' }, h('div', { class: 'xlk-user on' }, avatar(sel), h('span', null, sel.name)));
      let body;
      if (!sel.pass) body = h('button', { class: 'xlk-btn', type: 'button', onclick: () => finish(sel) }, icon('unlock'), sel.name + ' ではじめる');
      else if (sel.pass.kind === 'pin') {
        paintDots();
        body = [dots, msg, h('div', { class: 'xlk-pad' },
          ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(k => h('button', { class: 'xlk-key', type: 'button', onclick: () => press(k) }, k)),
          sel.bio ? h('button', { class: 'xlk-key t', type: 'button', 'aria-label': '生体認証', onclick: useBio }, icon('fingerprint')) : h('span'),
          h('button', { class: 'xlk-key', type: 'button', onclick: () => press('0') }, '0'),
          h('button', { class: 'xlk-key t', type: 'button', 'aria-label': '1文字消す', onclick: () => press('del') }, '消す'))];
      } else {
        const inp = h('input', { class: 'xlk-pass', type: 'password', placeholder: 'パスコード', autocomplete: 'off', 'aria-label': 'パスコード', onkeydown: e => { if (e.key === 'Enter') { const v = inp.value; inp.value = ''; tryPass(v); } } });
        body = [inp, msg, h('div', { class: 'xlk-foot' }, h('button', { class: 'xlk-btn', type: 'button', onclick: () => { const v = inp.value; inp.value = ''; tryPass(v); } }, icon('unlock'), '開く'),
          sel.bio ? h('button', { class: 'xlk-btn', type: 'button', onclick: useBio }, icon('fingerprint'), '生体認証') : null)];
        setTimeout(() => inp.focus(), 60);
      }
      fill(mid, chooser, body);
      fill(foot,
        opts.allowGuest && h('button', { class: 'xlk-btn', type: 'button', onclick: () => finish({ id: 'guest', guest: true }) }, icon('user'), 'ゲストで使う'),
        /* XEVORA アカウント（表示名＋4桁 PIN）。この端末に無ければユーザーを作り、あれば選ぶ（パスコードはそのユーザーのもの） */
        opts.onAccount && h('button', { class: 'xlk-btn', type: 'button', onclick: async () => {
          const u = await opts.onAccount(); if (!u) return;
          if (!u.pass) return finish(u);
          sel = u; auth();
        } }, icon('cloud'), 'XEVORA でログイン'),
        opts.onSwitch && h('button', { class: 'xlk-btn', type: 'button', onclick: () => opts.onSwitch() }, icon('users'), 'ユーザーを切りかえる'));
      if (sel.pass && sel.bio && opts.autoBio) setTimeout(useBio, 250);
    }
    function cover() {
      stage = 'cover';
      fill(mid, h('div', { class: 'xlk-hint' }, '押して開く'));
      fill(foot);
    }
    const onKey = e => {
      if (stage === 'cover') { if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); auth(); } return; }
      if (e.target && (e.target.tagName === 'INPUT' || (e.target.closest && e.target.closest('.xm')))) return;     // 確認の窓（XEVARION のログインなど）の中のキーは見ない
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); press('del'); }
      else if (e.key === 'Enter' && !sel.pass) { e.preventDefault(); finish(sel); }
      else if (e.key === 'Escape') { e.preventDefault(); cover(); }
      e.stopPropagation();
    };
    fill(root, time, date, info, mid, foot);
    root.onclick = e => { if (stage === 'cover') { e.preventDefault(); auth(); } };
    root.classList.remove('leave'); root.classList.add('on');
    root.tabIndex = -1; try { root.focus({ preventScroll: true }); } catch { /* 古い端末 */ }
    addEventListener('keydown', onKey, true);
    tick();
    if (opts.skipCover) auth(); else cover();
  });
}

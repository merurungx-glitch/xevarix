/* XEVARIX — ウィジェット（ホームに置く小さな札）
   置く場所・順番はホーム（home.js の home.layout＝アプリと同じ並び）が決める。ここは札の中身だけ。
   見えていないときは描き直さない（電気を使わないため）。 */

import { bus } from '../core.js';
import { h, fill, fmtClock, fmtDate, fmtDur, fmtBytes, fmtTimer } from '../util.js';
import { icon, appTile } from '../icons.js';
import { runAction, toast } from './ui.js';

let X = null;
const head = (ic, t) => h('div', { class: 'xwg-h' }, icon(ic), t);

const DEFS = {
  clock: { name: '時計', icon: 'clock', size: 's', events: ['clock:tick'], make() {
    const v = h('div', { class: 'xwg-v' }), s = h('div', { class: 'xwg-s' });
    return { el: h('button', { class: 'xwg glass', type: 'button', onclick: () => X.proc.spawn('clock') }, head('clock', '時計'), v, s),
      update() { const d = new Date(); v.textContent = fmtClock(d, X.reg.get('ui.clock24')); s.textContent = fmtDate(d); } };
  } },
  power: { name: '電力', icon: 'bolt', size: 's', events: ['power:state', 'power:mode'], make() {
    const v = h('div', { class: 'xwg-v' }), s = h('div', { class: 'xwg-s' }), bar = h('i');
    return { el: h('button', { class: 'xwg glass', type: 'button', onclick: () => X.act.control() }, head('bolt', '電力'), v, s, h('div', { class: 'xwg-bar' }, bar)),
      update() {
        const p = X.power, b = p.battery, rem = p.remainingMin();
        v.textContent = b ? Math.round(b.level * 100) + '%' : p.info().short;
        s.textContent = (b ? p.info().name : '電池残量は読めません') + (b && b.charging ? '・充電中' : rem ? '・あと' + fmtDur(rem * 60000, true) : '');
        bar.style.width = (b ? Math.round(b.level * 100) : 100) + '%'; bar.style.background = b && !b.charging && b.level <= .2 ? 'var(--warn)' : 'var(--acc)';
      } };
  } },
  perf: { name: '動作', icon: 'activity', size: 's', events: ['proc:tick', 'proc:spawn', 'proc:exit'], make() {
    const v = h('div', { class: 'xwg-v' }), s = h('div', { class: 'xwg-s' }), bar = h('i');
    return { el: h('button', { class: 'xwg glass', type: 'button', onclick: () => X.proc.spawn('monitor') }, head('activity', '動作'), v, s, h('div', { class: 'xwg-bar' }, bar)),
      update() {
        const l = X.proc.list(), run = l.filter(p => p.state === 'running'), load = Math.min(1, run.reduce((a, p) => a + p.stats.load, 0)), fg = X.proc.fg();
        v.textContent = fg && fg.stats.fps ? fg.stats.fps + ' fps' : l.length + ' 本';
        s.textContent = '実行中 ' + run.length + '・休止 ' + (l.length - run.length) + (X.perf.pressure !== 'nominal' ? '・負荷高め' : '');
        bar.style.width = Math.round(load * 100) + '%'; bar.style.background = load > .8 ? 'var(--warn)' : 'var(--acc)';
      } };
  } },
  suggest: { name: 'AI の提案', icon: 'sparkle', size: 'w', events: ['proc:spawn', 'proc:exit', 'power:mode'], every: 60000, make() {
    const t = h('div', { style: 'font-weight:600;font-size:.9rem' }), s = h('div', { class: 'xwg-s' }), acts = h('div', { class: 'xwg-chips' });
    const el = h('div', { class: 'xwg glass', data: { size: 'w' } }, head('sparkle', 'AI の提案'), t, s, acts);
    return { el, update() {
      const g = X.reg.get('ai.suggest') && X.services ? X.services.suggest() : null;
      if (!g) { t.textContent = 'いまは提案はありません'; s.textContent = '使い方に合わせて、役に立ちそうなことをここに出します。'; fill(acts, h('button', { class: 'chip', type: 'button', onclick: () => X.act.ai() }, icon('sparkle'), 'AI に話しかける')); return; }
      t.textContent = g.title; s.textContent = g.text;
      fill(acts, h('button', { class: 'chip on', type: 'button', onclick: () => { runAction(g.action); setTimeout(() => this.update(), 400); } }, g.action.label),
        g.dismiss ? h('button', { class: 'chip', type: 'button', onclick: () => { X.reg.set(g.dismiss, true); this.update(); } }, 'あとで') : null);
    } };
  } },
  note: { name: 'すぐメモ', icon: 'note', size: 'w', make() {
    const inp = h('input', { class: 'field sm', type: 'text', placeholder: 'ここに書いて Enter でメモ', 'aria-label': 'すぐメモ', maxlength: 200,
      onkeydown: async e => { if (e.key === 'Enter' && !e.isComposing && inp.value.trim()) { const r = await X.sys.tryCall('note.create', { text: inp.value.trim() }); toast(r.text, r.error ? 'warn' : 'ok'); if (!r.error) inp.value = ''; } } });
    return { el: h('div', { class: 'xwg glass', data: { size: 'w' } }, h('div', { class: 'xwg-h' }, icon('note'), 'すぐメモ', h('span', { style: 'flex:1' }), h('button', { class: 'chip', type: 'button', style: 'height:22px;font-size:.68rem', onclick: () => X.proc.spawn('notes') }, 'メモを開く')), inp), update() {} };
  } },
  timer: { name: 'タイマー', icon: 'timer', size: 's', events: ['clock:change'], every: 1000, make() {
    const v = h('div', { class: 'xwg-v' }), s = h('div', { class: 'xwg-chips' });
    const start = sec => X.sys.tryCall('timer.start', { seconds: sec });
    return { el: h('div', { class: 'xwg glass' }, head('timer', 'タイマー'), v, s), update() {
      const l = X.services ? X.services.timers() : [];
      v.textContent = l.length ? fmtTimer(l[0].end - Date.now()) : '—';
      if (s.dataset.n !== String(l.length)) { s.dataset.n = l.length; fill(s, l.length ? h('button', { class: 'chip', type: 'button', onclick: () => X.sys.tryCall('timer.cancel', {}) }, '止める') : [3, 5, 10].map(m => h('button', { class: 'chip', type: 'button', style: 'padding:0 9px', onclick: () => start(m * 60) }, m + '分'))); }
    } };
  } },
  usage: { name: '利用時間', icon: 'hourglass', size: 's', every: 30000, make() {
    const v = h('div', { class: 'xwg-v' }), s = h('div', { class: 'xwg-s' });
    return { el: h('button', { class: 'xwg glass', type: 'button', onclick: () => X.proc.spawn('settings', { page: 'usage' }) }, head('hourglass', '今日の利用'), v, s), update() {
      const u = X.services ? X.services.usageToday() : { total: 0, apps: {} };
      v.textContent = fmtDur(u.total, true); const top = Object.entries(u.apps).sort((a, b) => b[1] - a[1])[0];
      s.textContent = top ? 'いちばん長い: ' + ((X.apps.get(top[0]) || {}).name || top[0]) : 'まだアプリを使っていません';
    } };
  } },
  storage: { name: '保存容量', icon: 'database', size: 's', events: ['fs:change'], every: 120000, make() {
    const v = h('div', { class: 'xwg-v' }), s = h('div', { class: 'xwg-s' }), bar = h('i');
    return { el: h('button', { class: 'xwg glass', type: 'button', onclick: () => X.proc.spawn('settings', { page: 'storage' }) }, head('database', '保存容量'), v, s, h('div', { class: 'xwg-bar' }, bar)), async update() {
      const [st, u] = await Promise.all([X.perf.storage(), X.fs.usage()]);
      v.textContent = fmtBytes(u.bytes); s.textContent = u.files + ' 個のファイル'; bar.style.width = (st.quota ? Math.max(1, Math.round(st.usage / st.quota * 100)) : 0) + '%';
    } };
  } },
  calendar: { name: '今日の予定', icon: 'calendar', size: 'w', events: ['calendar:change'], every: 300000, make() {
    const box = h('div', { class: 'xwg-s' });
    return { el: h('button', { class: 'xwg glass', type: 'button', data: { size: 'w' }, onclick: () => X.proc.spawn('calendar') }, head('calendar', '今日の予定'), box), update() {
      const d = new Date(), key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const ev = (X.services ? X.services.events() : []).filter(e => e.date === key).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      fill(box, ev.length ? ev.slice(0, 3).map(e => h('div', null, (e.time || '終日') + '　' + e.title)) : '今日の予定はありません');
    } };
  } },
  apps: { name: 'よく使うアプリ', icon: 'grid', size: 'w', events: ['apps:change'], every: 300000, make() {
    const box = h('div', { style: 'display:flex;gap:12px;margin-top:4px' });
    return { el: h('div', { class: 'xwg glass', data: { size: 'w' } }, head('grid', 'よく使うアプリ'), box), update() {
      const u = X.services ? X.services.usageToday() : { launch: {} };
      const ids = Object.entries(u.launch).sort((a, b) => b[1] - a[1]).map(x => x[0]).filter(id => X.apps.isInstalled(id));
      for (const a of X.apps.installed()) if (ids.length < 4 && !ids.includes(a.id) && a.kind !== 'action') ids.push(a.id);
      fill(box, ids.slice(0, 5).map(id => { const a = X.apps.get(id); return h('button', { type: 'button', title: a.name, 'aria-label': a.name, style: 'border:0;background:transparent;padding:0', onclick: () => X.proc.spawn(id) }, appTile(a)); }));
    } };
  } },
  mate: { name: 'XEVARION のパートナー', icon: 'heart', size: 'w', every: 600000, desc: 'XEVARION でえらんでいる子とひとこと', make() {
    const pic = h('span', { class: 'xwg-mate-pic' }), nm = h('div', { class: 'xwg-mate-nm' }), say = h('div', { class: 'xwg-mate-say' }), sub = h('div', { class: 'xwg-s' });
    const el = h('button', { class: 'xwg glass xwg-mate', type: 'button', data: { size: 'w' }, 'aria-label': 'XEVARION を開く', onclick: () => openXevarion() },
      pic, h('div', { class: 'xwg-mate-tx' }, head('heart', 'XEVARION のパートナー'), nm, say, sub));
    let shown = '';
    const update = () => {
      const m = mateNow();
      if (m.state !== 'ok') {
        const t = { cross: ['XEVARION と別の場所に置かれています', 'パートナーは読めません。押すと XEVARION を開きます。'],
          login: ['XEVARION にログインしていません', 'ログインすると、えらんだパートナーがここに出ます。押すと XEVARION を開きます。'],
          hide: ['パートナーは「表示しない」になっています', 'XEVARION の設定で、ホームのパートナーを出すと、ここにも出ます。'],
          none: ['XEVARION のパートナー', 'XEVARION の一覧を読みこめていません。押すと XEVARION を開きます。'] }[m.state] || ['', ''];
        if (shown !== m.state) { shown = m.state; fill(pic, h('span', { class: 'xwg-mate-ph' }, icon('heart'))); pic.style.removeProperty('--mc'); }
        nm.textContent = t[0]; say.textContent = ''; say.hidden = true; sub.textContent = t[1]; return;
      }
      const p = m.mate;
      if (shown !== m.id) {
        shown = m.id; pic.style.setProperty('--mc', p.color || '#5a6cc0');
        const im = h('img', { alt: p.name, draggable: false, decoding: 'async', src: m.base + p.dir + m.id + '.webp?v=' + m.ver });
        /* 顔のあたりが枠のまん中より少し上に来るように（枠は CSS で 92×112） */
        const f = p.face; if (f) { const s = 50 / (f.r * 2); Object.assign(im.style, { width: f.w * s + 'px', left: 46 - f.x * s + 'px', top: 44 - f.y * s + 'px' }); }
        im.onerror = () => fill(pic, h('span', { class: 'xwg-mate-ph' }, p.name.slice(0, 1)));
        fill(pic, im);
      }
      fill(nm, p.name, p.ruby ? h('small', null, p.ruby) : null);
      say.hidden = false; say.textContent = m.line || '';
      sub.textContent = m.user ? m.user + ' さんの XEVARION' : 'XEVARION を開く';
    };
    const onStore = e => { if (!e || !e.key || /^xeva_(mate_v1|account_v1)$/.test(e.key)) update(); };
    addEventListener('storage', onStore);
    return { el, update, stop() { removeEventListener('storage', onStore); } };
  } },
};

/* ── XEVARION（同じオリジンなら、XEVARION の保存を読むだけ。書きかえない）── */
const XV_FREE = 'shoko';
function readLS(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }
function mateNow() {
  const cat = X.apps.catalogNow(); const xv = cat && cat.xevarion;
  let same = true;
  try { same = !!cat && new URL(cat.base || './', location.href).origin === location.origin; } catch { same = false; }
  if (cat && !same) return { state: 'cross' };
  if (!xv || !xv.mates) return { state: 'none' };
  const acc = readLS('xeva_account_v1'), st = readLS('xeva_mate_v1') || {};
  if (!acc || !acc.name) return { state: 'login' };
  if (st.hide) return { state: 'hide' };
  /* XEVARION の home-mate.js の current() と同じ決め方：開放ずみ（own）の中のえらんだ子。なければ最初から使える子 */
  const free = xv.free || XV_FREE;
  let own = Array.isArray(st.own) ? st.own.slice() : (xv.mates[st.partner] ? [st.partner] : []);
  if (!own.includes(free)) own.unshift(free);
  const id = own.includes(st.partner) && xv.mates[st.partner] ? st.partner : free;
  const mate = xv.mates[id]; if (!mate) return { state: 'none' };
  /* ひとこと：時間帯のセリフか、ふだんのセリフ。10分ごとに変わる */
  const hr = new Date().getHours();
  const kind = hr >= 5 && hr < 10 ? 'morning' : hr < 17 && hr >= 10 ? 'day' : hr >= 17 && hr < 21 ? 'evening' : 'night';
  const slot = Math.floor(Date.now() / 600000);
  const pool = (slot % 2 ? mate.lines.idle : mate.lines[kind]) || mate.lines[kind] || mate.lines.idle || [];
  return { state: 'ok', id, mate, base: cat.base, ver: xv.ver || 1, user: acc.name, line: pool.length ? pool[slot % pool.length] : mate.intro };
}
async function openXevarion() {
  if (!X.apps.get('xevarion')) { try { await X.apps.loadCatalog(); } catch { /* オフライン */ } }
  if (!X.apps.get('xevarion')) return toast('XEVARION を開けません。ストアの一覧を読みこめていません（オフライン）。', 'warn');
  X.proc.spawn('xevarion');
}

const visible = el => el.isConnected && el.offsetParent !== null && !document.hidden;

/* 札を1枚作る。ホームが置き場所を決めて、片づけるときに stop() を呼ぶ */
function mount(id) {
  const d = DEFS[id]; if (!d) return null;
  let w; try { w = d.make(); } catch { return null; }
  if (d.size === 'w') w.el.dataset.size = 'w';
  const upd = () => { if (visible(w.el)) { try { const r = w.update(); if (r && r.catch) r.catch(() => {}); } catch { /* 札1枚の失敗でホームを止めない */ } } };
  const offs = (d.events || []).map(ev => bus.on(ev, upd));
  const t = d.every ? setInterval(upd, d.every) : 0;
  try { const r = w.update(); if (r && r.catch) r.catch(() => {}); } catch { /* 上と同じ */ }
  return { el: w.el, name: d.name, size: d.size === 'w' ? 'w' : 's', stop() { offs.forEach(f => f()); clearInterval(t); try { w.stop && w.stop(); } catch { /* 片づけの失敗は無視 */ } } };
}

export function init(ctx) {
  X = ctx;
  X.widgets = { DEFS, mount };
  bus.emit('home:widgets', null);
}

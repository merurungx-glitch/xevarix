/* XEVARIX 標準アプリ — 時計（アラーム・タイマー・ストップウォッチ・世界時計）
   鳴らすのは裏のサービス。この窓を閉じても、アラームとタイマーは動きつづける。 */

import { h, fill, tabs, btn, ibtn, sw, row, group, empty, icon, fmtTimer, fmtDur, pad2 } from './kit.js';

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const ZONES = [['Asia/Tokyo', '東京'], ['Asia/Seoul', 'ソウル'], ['Asia/Shanghai', '上海'], ['Asia/Singapore', 'シンガポール'], ['Asia/Kolkata', 'デリー'], ['Asia/Dubai', 'ドバイ'], ['Europe/London', 'ロンドン'], ['Europe/Paris', 'パリ'], ['Europe/Berlin', 'ベルリン'], ['Europe/Moscow', 'モスクワ'], ['America/New_York', 'ニューヨーク'], ['America/Chicago', 'シカゴ'], ['America/Los_Angeles', 'ロサンゼルス'], ['America/Sao_Paulo', 'サンパウロ'], ['Pacific/Honolulu', 'ホノルル'], ['Australia/Sydney', 'シドニー'], ['Pacific/Auckland', 'オークランド']];
const CSS = `.ck-big{font-size:3.4rem;font-weight:300;font-variant-numeric:tabular-nums;letter-spacing:-.02em;text-align:center;line-height:1.1;padding:18px 0 6px}
.ck-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.ck-num{width:74px;text-align:center;font-size:1.3rem;font-variant-numeric:tabular-nums}
.ck-days{display:flex;gap:5px;flex-wrap:wrap}.ck-days .chip{padding:0 9px}`;

export default async function main(os, root) {
  const { services: S, reg } = os;
  document.head.append(h('style', { text: CSS }));
  let tab = (os.args && os.args.tab) || 'alarm', raf = 0, tick = 0;
  const body = h('div', { class: 'k-scroll' });
  fill(root, tabs([['alarm', 'アラーム', 'alarm'], ['timer', 'タイマー', 'timer'], ['sw', 'ストップウォッチ', 'clock'], ['world', '世界時計', 'globe']], tab, v => { tab = v; draw(); }), body);
  if (!S) return fill(body, empty('warn', '時計のしくみを読みこめませんでした'));
  const wrap = (...k) => h('div', { class: 'k-pad k-col k-max' }, k);

  function drawAlarm() {
    const l = S.alarms();
    const time = h('input', { class: 'field', type: 'time', value: '07:00', 'aria-label': '時刻', style: 'width:130px' });
    const label = h('input', { class: 'field', type: 'text', placeholder: '名前（なくてもよい）', maxlength: 30, 'aria-label': '名前' });
    let days = [];
    const dayEl = h('div', { class: 'ck-days' });
    const paintDays = () => fill(dayEl, WD.map((d, i) => h('button', { class: 'chip' + (days.includes(i) ? ' on' : ''), type: 'button', 'aria-pressed': days.includes(i) ? 'true' : 'false', onclick: () => { days = days.includes(i) ? days.filter(x => x !== i) : [...days, i].sort(); paintDays(); } }, d)));
    paintDays();
    fill(body, wrap(
      group('新しいアラーム', h('div', { class: 'k-row col' }, h('div', { style: 'display:flex;gap:8px' }, time, label), h('div', { class: 'tiny muted' }, 'くり返す曜日（えらばなければ1回だけ）'), dayEl,
        btn('アラームをかける', () => { if (!time.value) return; S.alarmAdd({ time: time.value, label: label.value.trim(), days }); draw(); }, { kind: 'pri', ic: 'plus' }))),
      group('アラーム', l.length ? l.map(a => row({ icon: 'alarm', title: a.time + (a.label ? '　' + a.label : ''), desc: a.days ? (a.days.length === 7 ? '毎日' : a.days.map(d => WD[d]).join('・')) : '1回だけ',
        right: [sw(a.on, v => S.alarmUpdate(a.id, { on: v }), a.time + ' のアラーム'), ibtn('trash', '消す', () => { S.alarmRemove(a.id); draw(); })] })) : row({ title: 'アラームはありません', desc: 'AI に「7時に起こして」と言ってもかけられます。' })),
      h('p', { class: 'k-p' }, 'XEVARIX を開いているあいだ鳴ります。画面を見ていないときも知らせたい場合は、設定 → 通知と音 で「端末の通知にも出す」をオンにしてください。')));
  }

  function drawTimer() {
    const hh = h('input', { class: 'field ck-num', type: 'number', min: 0, max: 47, value: 0, 'aria-label': '時間' }), mm = h('input', { class: 'field ck-num', type: 'number', min: 0, max: 59, value: 5, 'aria-label': '分' }), ss = h('input', { class: 'field ck-num', type: 'number', min: 0, max: 59, value: 0, 'aria-label': '秒' });
    const label = h('input', { class: 'field', type: 'text', placeholder: '名前（なくてもよい）', maxlength: 30, 'aria-label': '名前' });
    const start = sec => { if (sec > 0) { S.timerStart(sec, label.value.trim()); draw(); } };
    const live = h('div');
    const paint = () => {
      const l = S.timers();
      fill(live, l.length ? group('動いているタイマー', l.map(t => { const left = t.end - Date.now(); return h('div', { class: 'k-row col' }, h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:10px' }, h('span', null, h('b', { style: 'font-size:1.5rem;font-variant-numeric:tabular-nums' }, fmtTimer(left)), t.label ? h('span', { class: 'muted' }, '　' + t.label) : null), btn('止める', () => { S.timerCancel(t.id); draw(); }, { sm: true })), h('div', { class: 'k-meter' }, h('i', { style: { width: Math.round((1 - left / t.total) * 100) + '%', transition: 'none' } }))); })) : null);
    };
    fill(body, wrap(live,
      group('タイマーをかける', h('div', { class: 'k-row col' },
        h('div', { class: 'ck-row' }, [3, 5, 10, 15, 25, 60].map(m => h('button', { class: 'chip', type: 'button', onclick: () => start(m * 60) }, m < 60 ? m + '分' : '1時間'))),
        h('div', { class: 'ck-row', style: 'align-items:center' }, hh, '時間', mm, '分', ss, '秒'), label,
        btn('スタート', () => start((+hh.value || 0) * 3600 + (+mm.value || 0) * 60 + (+ss.value || 0)), { kind: 'pri', ic: 'play' })))));
    paint(); clearInterval(tick); tick = setInterval(() => { if (tab === 'timer') paint(); }, 500);
  }

  function drawSw() {
    let st = reg.get('clock.sw') || { run: false, start: 0, acc: 0, laps: [] };
    const big = h('div', { class: 'ck-big' }), laps = h('div'), btns = h('div', { class: 'ck-row' });
    const now = () => st.acc + (st.run ? Date.now() - st.start : 0);
    const fmt = ms => { const c = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000) % 60, m = Math.floor(ms / 60000); return (m >= 60 ? Math.floor(m / 60) + ':' + pad2(m % 60) : m) + ':' + pad2(s) + '.' + pad2(c); };
    const put = p => { st = { ...st, ...p }; reg.set('clock.sw', st); paint(); };
    const loop = () => { big.textContent = fmt(now()); if (st.run && tab === 'sw') raf = requestAnimationFrame(loop); };
    const paint = () => {
      fill(btns, st.run ? [btn('ラップ', () => put({ laps: [now(), ...st.laps].slice(0, 99) }), {}), btn('止める', () => put({ run: false, acc: now() }), { kind: 'danger', ic: 'pause' })]
        : [btn('はじめる', () => put({ run: true, start: Date.now() }), { kind: 'pri', ic: 'play' }), st.acc ? btn('0にもどす', () => put({ run: false, acc: 0, laps: [] }), {}) : null]);
      fill(laps, st.laps.length ? group('ラップ', st.laps.map((t, i) => h('div', { class: 'k-kv' }, h('span', null, 'ラップ ' + (st.laps.length - i)), h('span', null, fmt(t - (st.laps[i + 1] || 0)) + '　／　' + fmt(t))))) : null);
      cancelAnimationFrame(raf); loop();
    };
    fill(body, wrap(big, btns, laps)); paint();
  }

  function drawWorld() {
    const cities = reg.get('clock.cities') || [];
    const box = h('div');
    const paint = () => fill(box, group('世界の時刻', cities.map(z => {
      const name = (ZONES.find(x => x[0] === z) || [z, z])[1]; const d = new Date();
      let t = '—', day = '';
      try { t = new Intl.DateTimeFormat('ja-JP', { timeZone: z, hour: 'numeric', minute: '2-digit', hour12: !reg.get('ui.clock24') }).format(d); day = new Intl.DateTimeFormat('ja-JP', { timeZone: z, month: 'numeric', day: 'numeric', weekday: 'short' }).format(d); } catch { /* 知らない地域 */ }
      return row({ icon: 'globe', title: name, desc: day, right: [h('b', { style: 'font-size:1.35rem;color:var(--text);font-variant-numeric:tabular-nums' }, t), ibtn('close', name + ' を外す', () => { reg.set('clock.cities', cities.filter(c => c !== z)); draw(); })] });
    }), !cities.length ? row({ title: '都市がありません' }) : null));
    const rest = ZONES.filter(z => !cities.includes(z[0]));
    fill(body, wrap(box, rest.length ? h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, h('span', { class: 'muted tiny' }, '都市を足す'), rest.map(z => h('button', { class: 'chip', type: 'button', onclick: () => { reg.set('clock.cities', [...cities, z[0]]); draw(); } }, z[1]))) : null));
    paint(); clearInterval(tick); tick = setInterval(() => { if (tab === 'world') paint(); }, 15000);
  }

  function draw() { clearInterval(tick); cancelAnimationFrame(raf); ({ alarm: drawAlarm, timer: drawTimer, sw: drawSw, world: drawWorld })[tab](); }
  os.on('clock:change', () => { if (tab === 'alarm' && !/INPUT/.test((document.activeElement || {}).tagName || '')) draw(); });
  os.onArgs(a => { if (a && a.tab) { tab = a.tab; draw(); } });
  draw();
}

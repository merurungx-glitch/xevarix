/* XEVARIX 標準アプリ — ルーティン（「◯◯したら、◯◯する」の自動化） */

import { h, fill, btn, ibtn, row, group, sw, select, empty, note, badge, icon, fmtStamp, clone } from './kit.js';

const WD = ['日', '月', '火', '水', '木', '金', '土'];

export default async function main(os, root) {
  const S = os.services, { power, apps } = os;
  if (!S) return fill(root, empty('warn', 'ルーティンのしくみを読みこめませんでした'));
  const appOpts = () => apps.installed().filter(a => a.kind !== 'action').map(a => [a.id, a.name]);
  const modeOpts = power.MODE_ORDER.map(id => [id, power.MODES[id].name]);
  /* できること（やさしい名前 → システムコール） */
  const ACTIONS = [
    { id: 'power.mode', label: '電力モードを変える', arg: 'mode', opts: () => modeOpts, def: 'saver' },
    { id: 'app.open', label: 'アプリを開く', arg: 'app', opts: appOpts, def: 'notes' },
    { id: 'app.close', label: 'アプリを閉じる', arg: 'app', opts: appOpts, def: 'notes' },
    { id: 'app.closeAll', label: 'すべてのアプリを閉じる' },
    { id: 'notify.send', label: '通知を出す', arg: 'body', text: '知らせる文' },
    { id: 'notify.dnd', label: 'おやすみモード', arg: 'on', opts: () => [[true, 'オンにする'], [false, 'オフにする']], def: true },
    { id: 'focus.start', label: '集中モードを始める', arg: 'minutes', num: '分', def: 25 },
    { id: 'space.switch', label: 'スペースを切りかえる', arg: 'space', opts: () => S.spaces().map(s => [s.id, s.name]), def: 'main' },
    { id: 'ui.theme', label: '色合いを変える', arg: 'theme', opts: () => [['dark', 'ダーク'], ['light', 'ライト'], ['auto', '自動']], def: 'dark' },
    { id: 'ui.dim', label: '画面の暗さを変える', arg: 'level', opts: () => [[0, '元の明るさ'], [.2, '少し暗く'], [.4, '暗く'], [.6, 'かなり暗く']], def: .2 },
    { id: 'sys.boost', label: 'ブースト（裏のアプリを休止）' },
    { id: 'sys.wake', label: '画面を消さない', arg: 'on', opts: () => [[true, 'オンにする'], [false, 'オフにする']], def: true },
    { id: 'timer.start', label: 'タイマーをかける', arg: 'seconds', num: '秒', def: 300 },
    { id: 'say', label: '読み上げる', arg: 'text', text: '読み上げる文' },
    { id: 'sys.lock', label: 'ロックする' },
  ];
  const TRIG = [['manual', '手で動かす'], ['time', '時刻になったら'], ['battery', '電池残量が変わったら'], ['charging', '充電を始めたら・やめたら'], ['app', 'アプリを開いたら・閉じたら'], ['space', 'スペースを切りかえたら'], ['mode', '電力モードが変わったら'], ['net', '通信が切れたら・戻ったら'], ['unlock', 'ロックを開けたら'], ['boot', 'XEVARIX を起動したら']];
  const TEMPLATES = [
    { name: 'おやすみ前', trigger: { type: 'time', time: '23:00', days: [] }, actions: [{ name: 'power.mode', args: { mode: 'saver' } }, { name: 'notify.dnd', args: { on: true } }, { name: 'ui.dim', args: { level: .4 } }] },
    { name: '朝のしたく', trigger: { type: 'time', time: '07:00', days: [1, 2, 3, 4, 5] }, actions: [{ name: 'power.mode', args: { mode: 'balanced' } }, { name: 'notify.dnd', args: { on: false } }, { name: 'ui.dim', args: { level: 0 } }, { name: 'notify.send', args: { title: 'おはようございます', body: '今日も1日、よい時間を。' } }] },
    { name: '電池が少なくなったら', trigger: { type: 'battery', op: 'below', level: 20 }, actions: [{ name: 'power.mode', args: { mode: 'saver' } }, { name: 'sys.boost', args: {} }] },
    { name: '勉強をはじめる', trigger: { type: 'manual' }, actions: [{ name: 'space.switch', args: { space: 'study' } }, { name: 'focus.start', args: { minutes: 25 } }] },
  ];
  const actText = a => { const d = ACTIONS.find(x => x.id === a.name); if (!d) return a.name; const v = d.arg ? (a.args || {})[d.arg] : undefined; const o = d.opts ? (d.opts().find(x => String(x[0]) === String(v)) || [])[1] : v; return d.label + (v !== undefined ? '：' + (o ?? v) + (d.num || '') : ''); };
  let editing = null, name0 = '';     // name0 = 編集を始めたときの名前

  function list() {
    editing = null; name0 = '';
    const l = S.routines(), log = os.reg.get('routines.log') || [];
    fill(root, h('div', { class: 'k-head' }, h('h1', null, 'ルーティン'), btn('新しく作る', () => { editing = { name: '', on: true, trigger: { type: 'time', time: '08:00', days: [] }, actions: [], notify: true }; edit(); }, { kind: 'pri', sm: true, ic: 'plus' })),
      h('div', { class: 'k-scroll' }, h('div', { class: 'k-pad k-col k-max' },
        os.safe ? note('セーフモードのあいだ、ルーティンは自動では動きません。', 'warn') : null,
        l.length ? group(null, l.map(r => row({ icon: 'repeat', title: r.name, desc: S.triggerText(r.trigger) + ' → ' + r.actions.map(actText).join('、'), onclick: () => { editing = clone(r); edit(); },
          right: [ibtn('play', 'いま動かす', async e => { e.stopPropagation(); const res = await S.routineRun(r.id, { manual: true }); os.ui.toast(res.text || '動かしました', res.ok ? 'ok' : 'warn', r.name); list(); }), h('span', { onclick: e => e.stopPropagation() }, sw(r.on, v => S.routineSave({ ...r, on: v }), r.name + ' を有効にする'))] })))
          : empty('repeat', 'ルーティンはまだありません。\n下の見本から始めるか、AI に「毎朝7時に省電力を切って」のように頼めます。'),
        h('div', { class: 'k-group-t' }, '見本から作る'),
        h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, TEMPLATES.map(t => h('button', { class: 'chip', type: 'button', onclick: () => { editing = clone({ ...t, on: true, notify: true }); edit(); } }, icon('plus'), t.name))),
        log.length ? group('動いた記録', log.slice(0, 12).map(e => h('div', { class: 'k-kv' }, h('span', null, fmtStamp(e.t) + '　' + e.name + (e.manual ? '（手動）' : '')), h('span', null, e.ok ? badge('成功', 'ok') : badge('一部失敗', 'warn'))))) : null)));
  }

  function edit() {
    const r = editing, t = r.trigger; if (!name0) name0 = r.name || '';
    const name = h('input', { class: 'field', value: r.name, placeholder: 'ルーティンの名前', maxlength: 40, 'aria-label': '名前', oninput: () => { r.name = name.value; } });
    const setT = (p, redraw = true) => { r.trigger = { ...r.trigger, ...p }; if (redraw) edit(); };
    const trigParams = () => {
      switch (t.type) {
        case 'time': return [h('input', { class: 'field', type: 'time', value: t.time || '08:00', 'aria-label': '時刻', style: 'width:130px', onchange: e => setT({ time: e.target.value }, false) }),
          h('div', { style: 'display:flex;gap:5px;flex-wrap:wrap' }, WD.map((d, i) => { const on = (t.days || []).includes(i); return h('button', { class: 'chip' + (on ? ' on' : ''), type: 'button', style: 'padding:0 9px', 'aria-pressed': on ? 'true' : 'false', onclick: () => setT({ days: on ? t.days.filter(x => x !== i) : [...(t.days || []), i].sort() }) }, d); })), h('span', { class: 'tiny muted' }, '曜日をえらばなければ毎日')];
        case 'battery': return [select([['below', '以下になったら'], ['above', '以上になったら']], t.op || 'below', v => setT({ op: v }, false)), select([5, 10, 15, 20, 30, 50, 80, 100].map(n => [n, n + '%']), t.level || 20, v => setT({ level: Number(v) }, false)), !power.hasBattery ? h('span', { class: 'tiny', style: 'color:var(--warn)' }, 'この端末は電池残量を読めないため、このきっかけは動きません。') : null];
        case 'charging': return [select([['start', '充電を始めたら'], ['stop', '充電をやめたら']], t.state || 'start', v => setT({ state: v }, false)), !power.hasBattery ? h('span', { class: 'tiny', style: 'color:var(--warn)' }, 'この端末では動きません。') : null];
        case 'app': return [select(appOpts(), t.app || 'notes', v => setT({ app: v }, false)), select([['open', '開いたら'], ['close', '閉じたら']], t.event || 'open', v => setT({ event: v }, false))];
        case 'space': return [select(S.spaces().map(s => [s.id, s.name]), t.space || 'main', v => setT({ space: v }, false))];
        case 'mode': return [select(modeOpts, t.mode || 'saver', v => setT({ mode: v }, false))];
        case 'net': return [select([['offline', 'オフラインになったら'], ['online', 'オンラインに戻ったら']], t.state || 'offline', v => setT({ state: v }, false))];
        default: return [h('span', { class: 'tiny muted' }, t.type === 'manual' ? '一覧の ▶ か、AI・ターミナルから動かします。' : '')];
      }
    };
    const actRow = (a, i) => {
      const d = ACTIONS.find(x => x.id === a.name) || ACTIONS[0];
      /* 通知の題は、保存するときに決める（ここで入れると、あとで名前を変えても古い名前のままになる） */
      const setArg = v => { a.args = d.arg ? { ...(a.name === 'notify.send' && a.args && a.args.title ? { title: a.args.title } : {}), [d.arg]: v } : {}; };
      let ctl = null;
      if (d.opts) { const o = d.opts(); ctl = select(o, (a.args || {})[d.arg] ?? d.def, v => { const hit = o.find(x => String(x[0]) === v); setArg(hit ? hit[0] : v); }); }
      else if (d.num) ctl = h('input', { class: 'field', type: 'number', min: 1, value: (a.args || {})[d.arg] ?? d.def, style: 'width:100px', 'aria-label': d.num, onchange: e => setArg(Number(e.target.value) || d.def) });
      else if (d.text) ctl = h('input', { class: 'field', value: (a.args || {})[d.arg] || '', placeholder: d.text, maxlength: 120, 'aria-label': d.text, oninput: e => setArg(e.target.value) });
      return h('div', { class: 'k-row', style: 'flex-wrap:wrap' }, h('span', { class: 'k-badge mute' }, String(i + 1)),
        select(ACTIONS.map(x => [x.id, x.label]), a.name, v => { const nd = ACTIONS.find(x => x.id === v); a.name = v; a.args = nd.arg && nd.def !== undefined ? { [nd.arg]: nd.def } : {}; edit(); }), ctl,
        h('span', { class: 'k-sp' }), i > 0 ? ibtn('arrowU', '上へ', () => { [r.actions[i - 1], r.actions[i]] = [r.actions[i], r.actions[i - 1]]; edit(); }) : null, ibtn('trash', 'この動作を消す', () => { r.actions.splice(i, 1); edit(); }));
    };
    fill(root, h('div', { class: 'k-head' }, ibtn('chevL', '一覧へ', () => list()), h('h1', null, r.id ? 'ルーティンを直す' : '新しいルーティン'),
      r.id ? btn('消す', async () => { if (await os.ui.confirm('消す', '「' + r.name + '」を消します。', { ok: '消す', danger: true })) { S.routineRemove(r.id); list(); } }, { sm: true, kind: 'ghost' }) : null,
      btn('保存', () => {
        if (!r.name.trim()) { name.focus(); return os.ui.toast('名前を入れてください', 'warn'); } if (!r.actions.length) return os.ui.toast('動作を1つ以上足してください', 'warn');
        const blank = r.actions.find(a => { const d = ACTIONS.find(x => x.id === a.name); return d && d.text && !String((a.args || {})[d.arg] || '').trim(); });
        if (blank) return os.ui.toast('「' + ACTIONS.find(x => x.id === blank.name).label + '」の文を入れてください', 'warn');
        /* 通知の題は、ルーティンの名前に合わせる（見本にあった別の題は、そのまま残す） */
        for (const a of r.actions) if (a.name === 'notify.send') { a.args = a.args || {}; if (!a.args.title || a.args.title === name0) a.args.title = r.name.trim(); }
        S.routineSave(r); os.ui.toast('保存しました', 'ok', r.name); list();
      }, { sm: true, kind: 'pri' })),
      h('div', { class: 'k-scroll' }, h('div', { class: 'k-pad k-col k-max' }, name,
        group('きっかけ', h('div', { class: 'k-row col' }, select(TRIG, t.type, v => { r.trigger = { type: v }; if (v === 'time') r.trigger = { type: v, time: '08:00', days: [] }; if (v === 'battery') r.trigger = { type: v, op: 'below', level: 20 }; if (v === 'charging') r.trigger = { type: v, state: 'start' }; if (v === 'app') r.trigger = { type: v, app: 'notes', event: 'open' }; if (v === 'space') r.trigger = { type: v, space: 'main' }; if (v === 'mode') r.trigger = { type: v, mode: 'saver' }; if (v === 'net') r.trigger = { type: v, state: 'offline' }; edit(); }), h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center' }, trigParams()))),
        group('すること（上から順に）', r.actions.map(actRow), h('div', { class: 'k-row' }, btn('動作を足す', () => { r.actions.push({ name: 'power.mode', args: { mode: 'saver' } }); edit(); }, { sm: true, ic: 'plus' }))),
        group('そのほか', row({ icon: 'bell', title: '動いたら通知する', right: sw(r.notify !== false, v => { r.notify = v; }, '動いたら通知') })),
        h('p', { class: 'k-p' }, 'ルーティンは XEVARIX を開いているあいだ動きます。ルーティンがしたことは、設定 → プライバシー の「操作の記録」に残ります。'))));
  }
  os.on('routines:change', () => { if (!editing) list(); });
  list();
}

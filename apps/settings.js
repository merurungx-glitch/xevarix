/* XEVARIX 標準アプリ — 設定（前半：見た目・電力・パフォーマンス・通知・アプリ・スペース・利用時間） */

import { h, fill, row, group, kv, sw, seg, select, slider, btn, ibtn, page, navLayout, meter, badge, note, card, icon, appTile, barChart, fmtDur, fmtBytes, fmtStamp, pad2 } from './kit.js';
import { SETTINGS_PAGES } from '../sys/pages.js';
import { PAGES2 } from './settings2.js';

const H = (t, p) => [h('h2', { class: 'k-h' }, t), p ? h('p', { class: 'k-p' }, p) : null];
const tog = (os, key, label) => sw(os.reg.get(key), v => os.reg.set(key, v), label);

const PAGES = {
  appearance(os, main, redraw) {
    const { reg, theme } = os;
    const walls = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:10px;padding:12px 14px' },
      theme.WALLS.map(w => h('button', { type: 'button', 'aria-label': w.name, title: w.name, onclick: () => { reg.set('ui.wall', w.id); redraw(); },
        style: 'height:58px;border-radius:12px;border:3px solid ' + (reg.get('ui.wall') === w.id ? 'var(--acc)' : 'transparent') + ';background:' + ({ aurora: 'linear-gradient(135deg,#01084d,#0142c9 60%,#38e6fd)', deep: 'linear-gradient(180deg,#00031c,#011866)', dawn: 'linear-gradient(160deg,#1b1470,#a589fb 60%,#38e6fd)', mint: 'linear-gradient(140deg,#012a4a,#0a8f8a)', sky: 'linear-gradient(150deg,#cfe6ff,#6fb6ff)', mono: 'var(--bg)' }[w.id]) + ';color:' + (w.light ? '#0a1644' : '#fff') + ';font-size:.72rem;font-weight:600;display:grid;place-items:end center;padding:4px;outline:1px solid var(--stroke)' }, w.name)),
      h('button', { type: 'button', style: 'height:58px;border-radius:12px;border:3px solid ' + (reg.get('ui.wall') === 'image' ? 'var(--acc)' : 'transparent') + ';background:var(--surface-3);color:var(--text);font-size:.72rem;font-weight:600;outline:1px solid var(--stroke)',
        onclick: async () => { const n = await os.act.pickFile({ title: '壁紙にする画像をえらぶ', kinds: ['image'] }); if (n) { reg.set('ui.wallImage', n.id); reg.set('ui.wall', 'image'); redraw(); } } }, '画像をえらぶ'));
    fill(main, page(H('見た目', '色合い・壁紙・文字の大きさを決めます。'),
      group('色', row({ icon: 'contrast', title: '色合い', right: seg([['dark', 'ダーク'], ['light', 'ライト'], ['auto', '自動']], reg.get('ui.theme'), v => reg.set('ui.theme', v)) }),
        row({ icon: 'palette', title: '強調の色', right: h('div', { class: 'k-swatches' }, theme.ACCENTS.map(a => h('button', { class: 'k-swatch' + (reg.get('ui.accent') === a.id ? ' on' : ''), type: 'button', title: a.name, 'aria-label': a.name, style: 'background:' + a.color, onclick: () => { reg.set('ui.accent', a.id); redraw(); } }))) })),
      group('壁紙', walls, row({ icon: 'wand', title: '壁紙をゆっくり動かす', desc: '効果が「すべて」で、電力モードがバランス以上のときだけ動きます。', right: tog(os, 'ui.wallLive', '壁紙を動かす') })),
      group('文字と形',
        row({ icon: 'text', title: '文字の大きさ', desc: Math.round(reg.get('ui.textScale') * 100) + '%', right: slider({ min: .85, max: 1.3, step: .05, value: reg.get('ui.textScale'), label: '文字の大きさ', onchange: v => { reg.set('ui.textScale', v); redraw(); } }) }),
        row({ icon: 'grid', title: 'アイコンの形', right: seg([['squircle', '角丸'], ['circle', '丸'], ['square', '四角']], reg.get('ui.icon'), v => reg.set('ui.icon', v)) }),
        row({ icon: 'clock', title: '24時間で表示', right: tog(os, 'ui.clock24', '24時間で表示') }),
        row({ icon: 'clock', title: '秒まで表示', desc: '1秒ごとに描き直すので、わずかに電気を使います。', right: tog(os, 'ui.seconds', '秒まで表示') })),
      group('画面',
        row({ icon: 'columns', title: '画面の形', desc: 'ふつうは「自動」。端末の大きさと、指で使うかマウスで使うかで決まります。', right: select([['auto', '自動'], ['desktop', 'PC（重なる窓）'], ['tablet', 'タブレット'], ['phone', 'スマホ（1枚ずつ）']], reg.get('wm.mode'), v => reg.set('wm.mode', v)) }),
        row({ icon: 'cards', title: 'タブレットの窓', desc: '画面の形がタブレットのとき。「窓」は上のバーで動かし、右下のかどで大きさを変えられます（iPadOS 26 のウインドウと同じ）。「全画面」は全画面と左右の2分割。', right: seg([['window', '窓'], ['full', '全画面']], reg.get('wm.tablet'), v => reg.set('wm.tablet', v)) }),
        row({ icon: 'sidebar', title: 'PC の右にホームの列を出す', desc: 'ホームのアプリとウィジェット（並びはスマホ・タブレットと同じ）。', right: tog(os, 'ui.widgets', 'ホームの列を出す') }),
        row({ icon: 'edit', title: 'ホームの並びを変える', desc: 'ホームのアイコンかウィジェットを長押しするか、「ホームを編集」から。持って動かす・－で外す・＋でウィジェットを足す。', onclick: () => os.act.editHome && os.act.editHome() }))));
  },

  power(os, main, redraw) {
    const { reg, power } = os; const b = power.battery, rem = power.remainingMin(), dr = power.drainRate();
    const sc = reg.get('power.schedule'); const setSc = p => { reg.set('power.schedule', { ...reg.get('power.schedule'), ...p }); };
    const shares = power.shares(id => (os.apps.get(id) || {}).name || id);
    const pct = [5, 8, 10, 15, 20, 25, 30, 40].map(n => [n, n + '%']);
    fill(main, page(H('電力', '電力モードは「手前のアプリ・見えている窓・裏のアプリ」をどこまで動かすかの方針です。'),
      h('div', { class: 'k-grid' },
        card('いまのモード', power.info().icon, h('div', { class: 'k-big' }, power.info().name), h('div', { class: 'tiny muted' }, power.reason || 'えらんだモードで動いています')),
        card('電池', 'battery', h('div', { class: 'k-big' }, b ? Math.round(b.level * 100) + '%' : '—', b && b.charging ? h('small', null, '充電中') : null), b ? meter(b.level, !b.charging && b.level <= .2 ? 'warn' : '') : null,
          h('div', { class: 'tiny muted' }, b ? (rem ? 'あと約 ' + fmtDur(rem * 60000, true) : '') + (dr ? '（1時間に ' + dr.toFixed(1) + '% のペース）' : '') : 'この端末・ブラウザは電池残量を読めません')),
        card('今日の節約', 'leaf', h('div', { class: 'k-big' }, fmtDur(power.today().saved || 0, true)), h('div', { class: 'tiny muted' }, 'フレームの上限で減らせた描画の時間（見積もり）'))),
      !power.hasBattery ? note('iPhone・iPad の Safari などは、仕組み上、電池残量をアプリに教えません。この端末では「手で選ぶ」と「時間帯」で電力モードを切りかえます。') : null,
      group('モード', power.MODE_ORDER.map(id => { const m = power.MODES[id]; return row({ icon: m.icon, title: m.name, desc: m.desc, onclick: () => { power.setMode(id); redraw(); }, right: power.base === id ? badge('選択中') : h('span') }); })),
      group('自動の切りかえ',
        row({ icon: 'wand', title: '自動で節約する', desc: '電池が減ったとき・決めた時間帯に、節約する方向へ切りかえます（手で選んでから30分は上書きしません）。', right: sw(reg.get('power.auto'), v => { power.setAuto(v); redraw(); }, '自動で節約する') }),
        power.hasBattery ? row({ icon: 'leaf', title: '省電力にする残量', right: select(pct, reg.get('power.autoSaverAt'), v => reg.set('power.autoSaverAt', Number(v))) }) : null,
        power.hasBattery ? row({ icon: 'moon', title: '超省電力にする残量', right: select(pct.slice(0, 5), reg.get('power.autoUltraAt'), v => reg.set('power.autoUltraAt', Number(v))) }) : null,
        row({ icon: 'clock', title: '時間帯で切りかえる', desc: sc.on ? sc.from + ' 〜 ' + sc.to + ' は「' + power.MODES[sc.mode].name + '」' : '夜だけ省電力にする、などができます。', right: sw(sc.on, v => { setSc({ on: v }); redraw(); }, '時間帯で切りかえる') }),
        sc.on ? row({ title: '時間とモード', right: [h('input', { class: 'field', type: 'time', value: sc.from, 'aria-label': '始まり', style: 'min-width:0;width:104px', onchange: e => setSc({ from: e.target.value }) }), '〜', h('input', { class: 'field', type: 'time', value: sc.to, 'aria-label': '終わり', style: 'min-width:0;width:104px', onchange: e => setSc({ to: e.target.value }) }),
          select(power.MODE_ORDER.slice(1).map(id => [id, power.MODES[id].short]), sc.mode, v => setSc({ mode: v }))] }) : null,
        row({ icon: 'brightness', title: '操作が無いとき少し暗くする', right: tog(os, 'power.idleDim', '操作が無いとき暗くする') })),
      group('今日の消費（見積もり）', shares.length ? shares.slice(0, 8).map(s => h('div', { class: 'k-row col' }, h('div', { style: 'display:flex;justify-content:space-between;gap:10px' }, h('b', { style: 'font-weight:600' }, s.name), h('span', { class: 'muted tiny' }, Math.round(s.share * 100) + '%' + (s.batt >= .5 ? '・電池 ' + s.batt.toFixed(1) + '%ぶん' : '') + (s.fg ? '・' + fmtDur(s.fg, true) : ''))), meter(s.share))) : row({ title: 'まだ記録がありません', desc: 'アプリを使うと、どれがどのくらい動いたかがここに出ます。' })),
      h('p', { class: 'k-p' }, '消費の割合は、描画にかかった時間・処理の詰まり・画面に出ていた時間からの見積もりです。電池の「%ぶん」は、残量が減ったぶんをその間の動きで按分したものです。')));
  },

  perf(os, main, redraw) {
    const { reg, perf, sysreg, power } = os; const b = sysreg.get('device.bench'), d = perf.device(), pol = power.policy();
    const fxName = { full: 'すべて', reduced: '控えめ', minimal: '最小' };
    fill(main, page(H('パフォーマンス', '端末の力に合わせて、ぼかし・影・動きの量を決めます。'),
      h('div', { class: 'k-grid' },
        card('端末の測定', 'gauge', h('div', { class: 'k-big' }, b ? b.score : '—', h('small', null, b ? perf.tierName(b.tier) : '未測定')), h('div', { class: 'tiny muted' }, b ? '計算 ' + b.cpu + '・組み立て ' + b.dom + '・描画 ' + b.gfx + (b.hz ? '・画面 毎秒' + b.hz + '回' : '') + (b.rough ? '（仮の値。画面が見えているときに測り直します）' : '') : ''),
          btn('測り直す', async e => { const t = e.currentTarget; t.disabled = true; t.textContent = '測っています…'; await os.sys.tryCall('bench.run', {}); redraw(); }, { sm: true, ic: 'refresh' })),
        card('いまの効果の量', 'wand', h('div', { class: 'k-big' }, fxName[pol.fx]), h('div', { class: 'tiny muted' }, '設定・端末の力・電力モード（' + power.info().name + '）から決まっています'))),
      group('効果',
        row({ icon: 'wand', title: '効果の量', desc: '「自動」は測定の結果で決めます。省電力のときは、ここより多くはなりません。', right: select([['auto', '自動'], ['full', 'すべて'], ['reduced', '控えめ'], ['minimal', '最小']], reg.get('ui.fx'), v => { reg.set('ui.fx', v); redraw(); }) }),
        row({ icon: 'activity', title: '動きを減らす', right: sw(!reg.get('ui.motion'), v => reg.set('ui.motion', !v), '動きを減らす') })),
      group('ゲーム',
        row({ icon: 'gamepad', title: 'ゲームを開いたら自動でゲームモード', desc: '高性能に切りかえ、通知を止め、裏のアプリを休止します。', right: tog(os, 'perf.gameAuto', '自動でゲームモード') }),
        row({ icon: 'activity', title: '性能を画面に重ねて表示', desc: '左上に、なめらかさ（fps）と負荷を出します。', right: tog(os, 'perf.hud', '性能を表示') })),
      group('この端末', kv('OS とブラウザ', d.os + '・' + d.browser), kv('コア数', d.cores), kv('メモリ（見当）', d.memGB ? '約 ' + d.memGB + ' GB' : null), kv('GPU', d.gpu), kv('画面', d.screen + '（×' + d.dpr + '）'), kv('開き方', d.standalone ? 'アプリとして（ホーム画面から）' : 'ブラウザのタブ')),
      group('この端末で使える機能', Object.entries(d.features).map(([k, v]) => kv(k, v ? '使えます' : '使えません')))));
  },

  notify(os, main, redraw) {
    const { reg, notify } = os; const muted = new Set(reg.get('notify.mute') || []);
    const sysState = !('Notification' in window) ? '使えない端末です' : Notification.permission === 'granted' ? (reg.get('notify.system') ? 'オン' : 'オフ') : Notification.permission === 'denied' ? 'ブラウザの設定で止められています' : 'オフ';
    fill(main, page(H('通知と音'),
      group('通知',
        row({ icon: 'bellOff', title: 'おやすみモード', desc: '通知の札と音を止めます。通知は一覧に入ります。', right: sw(notify.dnd, v => { notify.setDnd(v); }, 'おやすみモード') }),
        row({ icon: 'bell', title: '通知の音', right: tog(os, 'notify.sound', '通知の音') }),
        row({ icon: 'external', title: '画面を見ていないときは端末の通知にも出す', desc: sysState, right: 'Notification' in window && Notification.permission !== 'denied' ? sw(reg.get('notify.system') && Notification.permission === 'granted', async v => { if (v) await notify.askSystem(); else reg.set('notify.system', false); redraw(); }, '端末の通知') : null })),
      group('音と振動',
        row({ icon: 'volume', title: '効果音', right: tog(os, 'sound.on', '効果音') }),
        row({ icon: 'volume', title: '音の大きさ', right: slider({ min: 0, max: 1, step: .05, value: reg.get('sound.volume'), label: '音の大きさ', onchange: v => { reg.set('sound.volume', v); os.ui.sound.play('notify'); } }) }),
        row({ icon: 'music', title: '音の種類', right: seg([['soft', 'やわらか'], ['digital', 'くっきり']], reg.get('sound.pack'), v => { reg.set('sound.pack', v); os.ui.sound.play('ok'); }) }),
        row({ icon: 'activity', title: '押したときの振動', desc: '対応している端末（Android など）だけ。', right: tog(os, 'ui.haptics', '振動') })),
      group('アプリごと', os.apps.installed().filter(a => a.kind !== 'action').map(a => row({ icon: appTile(a), title: a.name, right: sw(!muted.has(a.id), v => reg.update('notify.mute', l => { l = (l || []).filter(x => x !== a.id); if (!v) l.push(a.id); return l; }), a.name + ' の通知') })))));
  },

  apps(os, main, redraw, arg) {
    const { reg, apps } = os; const hidden = new Set(reg.get('apps.hidden') || []);
    const list = [...apps.system().filter(a => a.kind !== 'action'), ...Object.values(reg.get('apps.web') || {}), ...(reg.get('apps.custom') || [])];
    const openId = arg && arg.app;
    const detail = a => {
      const dev = (reg.get('apps.device') || {})[a.id] || {}, perms = (reg.get('apps.perms') || {})[a.id] || {};
      const setDev = (k, v) => reg.update('apps.device', d => { d = d || {}; d[a.id] = { ...(d[a.id] || {}), [k]: v }; return d; });
      return h('div', { style: 'display:grid;gap:0;width:100%' },
        a.kind === 'web' ? [
          h('div', { class: 'k-kv' }, h('span', null, 'ページ'), h('span', null, a.url)),
          h('div', { class: 'k-kv' }, h('span', null, 'カメラ'), sw(!!dev.camera, v => setDev('camera', v), 'カメラ')),
          h('div', { class: 'k-kv' }, h('span', null, 'マイク'), sw(!!dev.mic, v => setDev('mic', v), 'マイク')),
          h('div', { class: 'k-kv' }, h('span', null, '位置情報'), sw(!!dev.geo, v => setDev('geo', v), '位置情報')),
          Object.keys(perms).length ? h('div', { class: 'k-kv' }, h('span', null, 'XEVARIX の機能'), h('span', null, Object.entries(perms).map(([k, v]) => k + '：' + (v === 'allow' ? '許可' : '拒否')).join('、') + '　', btn('聞き直す', () => { reg.update('apps.perms', p => { delete p[a.id]; return p; }); redraw(); }, { sm: true }))) : null,
          h('div', { class: 'k-kv' }, h('span', null, 'カメラなどの変更は、アプリを開き直すと効きます'), h('span', null, btn('ホームから外す', async () => { if (await os.ui.confirm(a.name + ' を外す', 'ホームとドックから外します。アプリの中の記録は消えません。', { ok: '外す', danger: true })) { apps.uninstall(a.id); redraw(); } }, { sm: true, kind: 'danger' }))),
        ] : h('div', { class: 'k-kv' }, h('span', null, a.desc || ''), a.id !== 'settings' ? h('span', { style: 'display:flex;align-items:center;gap:8px' }, 'ホームに出す', sw(!hidden.has(a.id), v => { apps.setHidden(a.id, !v); }, 'ホームに出す')) : h('span')));
    };
    fill(main, page(H('アプリ', '入っているアプリと、それぞれに許していること。'),
      group(null, list.map(a => { const box = h('div', { hidden: a.id !== openId, style: 'width:100%' }); const r = row({ icon: appTile(a), title: a.name, desc: a.kind === 'system' ? '標準アプリ' : (a.sub || a.url), col: false, onclick: () => { box.hidden = !box.hidden; if (!box.hidden && !box.firstChild) box.append(detail(a)); } }); if (a.id === openId) box.append(detail(a)); return [r, box]; })),
      btn('ストアでアプリをさがす', () => os.open('store'), { ic: 'store' })));
  },

  spaces(os, main, redraw) {
    const { services, power, apps } = os; if (!services) return fill(main, page(H('スペース'), note('このしくみを読みこめませんでした。', 'warn')));
    const pool = apps.installed().filter(a => a.kind !== 'action');
    fill(main, page(H('スペース', '「学ぶ」「あそぶ」のように場面を分けて、開くアプリ・通知・電力モードをまとめて切りかえます。窓はスペースごとに分かれます。'),
      /* 保存するときは、いまの中身（now()）に重ねる。描いたときの s に重ねると、つづけて変えたとき前の変更が消える */
      services.spaces().map(s => { const now = () => services.spaces().find(x => x.id === s.id) || s; return group(s.name + (os.wm.space === s.id ? '（いまここ）' : ''),
        row({ icon: s.icon || 'layers', title: '名前', right: [h('input', { class: 'field', value: s.name, maxlength: 16, 'aria-label': '名前', onchange: e => { services.spaceSave({ ...now(), name: e.target.value.trim() || now().name }); redraw(); } }), os.wm.space !== s.id ? btn('切りかえる', () => { services.spaceSwitch(s.id); redraw(); }, { sm: true }) : null] }),
        row({ icon: 'bolt', title: '電力モード', right: select([['', '変えない'], ...power.MODE_ORDER.map(id => [id, power.MODES[id].name])], s.power || '', v => services.spaceSave({ ...now(), power: v || null })) }),
        row({ icon: 'bellOff', title: 'おやすみモードにする', right: sw(s.dnd, v => services.spaceSave({ ...now(), dnd: v }), 'おやすみモード') }),
        row({ icon: 'grid', title: 'いっしょに開くアプリ', col: true, below: h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px' }, pool.map(a => { const on = (s.apps || []).includes(a.id); return h('button', { class: 'chip' + (on ? ' on' : ''), type: 'button', onclick: () => { const c = now(), l = c.apps || []; services.spaceSave({ ...c, apps: l.includes(a.id) ? l.filter(x => x !== a.id) : [...l, a.id] }); redraw(); } }, a.short || a.name); })) }),
        s.id !== 'main' ? row({ icon: 'trash', title: 'このスペースを消す', danger: true, onclick: async () => { if (await os.ui.confirm('「' + now().name + '」を消す', 'スペースの設定だけを消します。アプリやファイルは消えません。', { ok: '消す', danger: true })) { services.spaceRemove(s.id); redraw(); } } }) : null); }),
      btn('スペースを足す', () => { services.spaceSave({ name: '新しいスペース' }); redraw(); }, { ic: 'plus' })));
  },

  async usage(os, main, redraw) {
    const { services, apps, reg } = os; if (!services) return fill(main, page(H('利用時間と集中'), note('このしくみを読みこめませんでした。', 'warn')));
    const u = services.usageToday(), hist = await services.usageHistory(7), f = services.focusState(), block = new Set(reg.get('focus.block') || []);
    const cv = h('canvas', { class: 'k-chart', style: 'height:130px' });
    const lim = [[0, 'なし'], [15, '15分'], [30, '30分'], [60, '1時間'], [90, '1時間半'], [120, '2時間'], [180, '3時間']];
    const rows = Object.entries(u.apps).sort((a, b) => b[1] - a[1]).map(([id, ms]) => { const a = apps.get(id) || { name: id, id }; return row({ icon: a.icon ? appTile(a) : 'box', title: a.name, desc: fmtDur(ms, true) + '・' + (u.launch[id] || 0) + ' 回', right: select(lim, services.limitOf(id), v => reg.update('limits.apps', l => { l = l || {}; if (Number(v)) l[id] = Number(v); else delete l[id]; return l; })) }); });
    fill(main, page(H('利用時間と集中'),
      h('div', { class: 'k-grid' },
        card('今日', 'hourglass', h('div', { class: 'k-big' }, fmtDur(u.total, true)), h('div', { class: 'tiny muted' }, 'ロックを開けた回数 ' + (u.unlocks || 0) + ' 回・集中 ' + (u.focus || 0) + ' 分')),
        card('集中モード', 'target', h('div', { class: 'k-big' }, f ? 'あと ' + Math.max(1, Math.ceil((f.end - Date.now()) / 60000)) + ' 分' : 'オフ'),
          h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, f ? btn('終える', () => { services.focusStop(); redraw(); }, { sm: true }) : [25, 50, 90].map(m => btn(m + '分', () => { services.focusStart(m); redraw(); }, { sm: true }))))),
      card('この7日間', 'calendar', cv),
      group('今日使ったアプリと、1日の上限', rows.length ? rows : row({ title: 'まだ記録がありません' })),
      group('集中モード中に開けないアプリ', row({ title: 'えらぶ', desc: '集中モードを始めると、えらんだアプリは閉じて、終わるまで開けなくなります。', col: true, below: h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px' }, apps.installed().filter(a => a.kind === 'web').map(a => h('button', { class: 'chip' + (block.has(a.id) ? ' on' : ''), type: 'button', onclick: () => { reg.update('focus.block', l => (block.has(a.id) ? l.filter(x => x !== a.id) : [...(l || []), a.id])); redraw(); } }, a.short || a.name)), !apps.installed().some(a => a.kind === 'web') ? h('span', { class: 'muted tiny' }, 'ストアから入れたアプリがここに並びます') : null) }))));
    requestAnimationFrame(() => barChart(cv, hist.map(d => ({ v: d.total / 3600000, label: d.day.slice(5).replace('-', '/'), dim: d.day !== u.day }))));
  },
};

export default async function main(os, root) {
  const all = { ...PAGES, ...PAGES2 };
  let nav = null;
  /* ページは、開くたびに自分の箱へ描く。描くのに時間がかかるページ（AI・保存容量など）が、
     あとから別のページの上に出てしまわないようにするため（箱が外されていたら、何もしない） */
  const render = (id, mainEl, arg) => {
    const fn = all[id]; if (!fn) return fill(mainEl, page(h('p', { class: 'k-p' }, 'このページはまだありません。')));
    const box = h('div', { class: 'k-main', style: 'flex:1' }); fill(mainEl, box);
    const redraw = () => { if (!box.isConnected) return; const sc = box.querySelector('.k-scroll'); const y = sc ? sc.scrollTop : 0; Promise.resolve(fn(os, box, redraw, arg)).then(() => { const s2 = box.querySelector('.k-scroll'); if (s2) s2.scrollTop = y; }).catch(e => console.error(e)); };
    Promise.resolve(fn(os, box, redraw, arg)).catch(e => { console.error(e); fill(box, page(note('この画面を開けませんでした: ' + e.message, 'warn'))); });
    os.setTitle('設定 — ' + (SETTINGS_PAGES.find(p => p.id === id) || {}).label);
  };
  nav = navLayout(root, SETTINGS_PAGES, render, (os.args && os.args.page) || 'appearance');
  if (os.args && os.args.page) nav.go(os.args.page, os.args);
  os.onArgs(a => { if (a && a.page) nav.go(a.page, a); });
  /* ほかの場所で変わったら、いまのページを描き直す */
  let t = 0; const soft = () => { clearTimeout(t); t = setTimeout(() => { const el = document.activeElement; if (el && /INPUT|SELECT|TEXTAREA/.test(el.tagName)) return; nav.go(nav.current); }, 250); };
  for (const ev of ['power:mode', 'focus:change', 'space:change', 'apps:change', 'ai:llm', 'update:state']) os.on(ev, soft);
}

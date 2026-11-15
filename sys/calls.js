/* XEVARIX — システムコールの中身（OS にできることの登録）
   AI・ターミナル・ルーティン・検索が同じ命令を呼ぶ。結果の text は人が読める1行。 */

import { OS, uptime } from './core.js';
import { fmtDur, fmtBytes, fmtClock, fmtDate, pad2 } from './util.js';
import { evaluate, fmtNum, convert } from './mathx.js';
import { MODES } from './power.js';
import { ACCENTS, WALLS } from './theme.js';

export function registerCalls(X) {
  const { sys, proc, wm, power, perf, notify, apps, reg, fs } = X;
  const def = (name, title, args, run, extra) => sys.def(name, { title, args: args || {}, run, ...extra });
  const findApp = (q, pool) => { if (!q) return null; const a = apps.get(q); if (a) return a; const f = apps.find(q, pool); return f && f.score >= .55 ? f.app : null; };
  const need = (v, msg) => { if (v == null || v === '') throw new Error(msg); return v; };
  const setReg = (key, val, label) => { const old = reg.get(key); reg.set(key, val); return { undo: () => reg.set(key, old), undoLabel: label }; };
  const S = () => { if (!X.services) throw new Error('この機能はまだ準備中です'); return X.services; };

  /* ── アプリ ── */
  def('app.open', 'アプリを開く', { app: { t: 'app', d: 'アプリの名前' } }, async a => {
    const app = findApp(need(a.app, 'どのアプリを開きますか？'));
    if (!app) { const c = apps.catalogNow(); const s = c && apps.find(a.app, c.apps); if (s && s.score >= .55) throw new Error('「' + s.app.name + '」はまだ入っていません。ストアから入れられます。'); throw new Error('「' + a.app + '」というアプリは見つかりません。'); }
    const was = proc.byApp(app.id); const p = proc.spawn(app.id, a.args);
    if (app.kind === 'action') return { text: app.name + ' を開きました。' };
    if (!p) throw new Error(app.name + ' を開けませんでした。');
    return { text: app.name + ' を' + (was ? '手前に出しました。' : '開きました。'), data: { pid: p.pid }, undo: was ? null : () => proc.kill(p.pid, 'undo'), undoLabel: app.name + ' を開く' };
  });
  def('app.close', 'アプリを閉じる', { app: { t: 'app', d: 'アプリの名前（省略すると手前の窓）' } }, async a => {
    let p = null;
    if (a.app) { const app = findApp(a.app); p = app && proc.byApp(app.id); if (!p) throw new Error((app ? app.name : a.app) + ' は開いていません。'); }
    else { p = proc.fg(); if (!p) throw new Error('閉じる窓がありません。'); }
    /* ふつうに閉じる（保存していない変更があるアプリは、自分で「保存しますか？」を出して閉じるのを待つ） */
    const name = p.app.name, id = p.appId;
    if (!proc.kill(p.pid)) { wm.focus(p.win); return { text: name + ' は、閉じる前の保存・確認の途中です。確認が出ていたら、画面で答えてください。' }; }
    return { text: name + ' を閉じました。', undo: () => proc.spawn(id), undoLabel: name + ' を閉じる' };
  });
  def('app.closeAll', 'すべてのアプリを閉じる', {}, async () => {
    const all = proc.list(); if (!all.length) return { text: '開いているアプリはありません。' };
    const wait = []; let n = 0;
    for (const p of all) { if (proc.kill(p.pid)) n++; else wait.push(p); }
    if (wait.length) wm.focus(wait[0].win);
    return { text: (n ? n + ' 本のアプリを閉じました。' : '') + (wait.length ? wait.map(p => p.app.name).join('・') + ' は、閉じる前の保存・確認の途中です。確認が出ていたら、画面で答えてください。' : '') };
  }, { danger: true });
  def('app.suspend', 'アプリを休止する', { app: { t: 'app' } }, async a => {
    const app = findApp(need(a.app, 'どのアプリを休止しますか？')); const p = app && proc.byApp(app.id); if (!p) throw new Error((app ? app.name : a.app) + ' は開いていません。');
    wm.minimize(p.win); proc.suspend(p.pid); return { text: app.name + ' を休止しました。' };
  });
  def('app.list', '動いているアプリの一覧', {}, async () => {
    const l = proc.list(); const st = { starting: '起動中', running: '実行中', suspended: '休止', hibernated: '深い休止' };
    return { text: l.length ? '動いているアプリ: ' + l.map(p => p.app.name + '（' + st[p.state] + '）').join('、') : '動いているアプリはありません。', data: l.map(p => ({ pid: p.pid, app: p.appId, name: p.app.name, state: p.state, fps: p.stats.fps, load: p.stats.load })) };
  });
  def('app.install', 'アプリを入れる', { app: { t: 'string' } }, async a => {
    const c = await apps.loadCatalog(); const f = apps.find(need(a.app, 'どのアプリを入れますか？'), c.apps);
    if (!f || f.score < .55) throw new Error('ストアに「' + a.app + '」は見つかりません。');
    if (apps.isInstalled(f.app.id)) return { text: f.app.name + ' はもう入っています。' };
    apps.install(f.app.id); return { text: f.app.name + ' をホームに入れました。', undo: () => apps.uninstall(f.app.id), undoLabel: f.app.name + ' を入れる' };
  });

  /* ── 電力・性能 ── */
  def('power.mode', '電力モードを変える', { mode: { t: 'enum', e: Object.keys(MODES), d: 'max / balanced / saver / ultra' } }, async (a, c) => {
    if (!MODES[a.mode]) throw new Error('電力モードは 高性能・バランス・省電力・超省電力 から選べます。');
    const old = power.base; power.setMode(a.mode, c.by === 'routine' ? 'auto' : 'user');
    const eff = power.mode;
    return { text: '電力モードを「' + MODES[a.mode].name + '」にしました。' + (eff !== a.mode ? '（いまは' + power.reason + '、「' + MODES[eff].name + '」で動いています）' : ''), undo: () => power.setMode(old), undoLabel: '電力モードの変更' };
  });
  def('power.auto', '電力の自動切りかえ', { on: { t: 'bool' } }, async a => { const old = reg.get('power.auto'); power.setAuto(a.on !== false); return { text: '電力の自動切りかえを' + (a.on !== false ? 'オン' : 'オフ') + 'にしました。', undo: () => power.setAuto(old) }; });
  def('power.status', '電力の状態', {}, async () => {
    const b = power.battery, m = power.info(); const rem = power.remainingMin();
    let t = 'いまは「' + m.name + '」' + (power.reason ? '（' + power.reason + '）' : '') + 'です。';
    if (b) t += '電池は ' + Math.round(b.level * 100) + '%' + (b.charging ? '（充電中）' : rem ? '・あと約' + fmtDur(rem * 60000, true) : '') + '。';
    else t += 'この端末では電池残量を読めません。';
    return { text: t, data: { mode: power.mode, base: power.base, reason: power.reason, level: b ? b.level : null, charging: b ? b.charging : null, remainingMin: rem, drain: power.drainRate() } };
  }, { quiet: true });
  def('sys.boost', 'ブースト（裏のアプリを休止）', {}, async () => {
    const n = proc.suspendBackground();
    return { text: n ? '裏で動いていた ' + n + ' 本のアプリを休止しました。' : '休止できるアプリはありませんでした（裏で動いているものがありません）。', data: { suspended: n } };
  });
  def('sys.game', 'ゲームモード', { on: { t: 'bool' } }, async a => { const on = a.on !== false; power.setGame(on); if (on) proc.suspendBackground(); return { text: 'ゲームモードを' + (on ? 'オンにしました。通知を止め、裏のアプリを休止して、手前のアプリに力を集めます。' : 'オフにしました。'), undo: () => power.setGame(!on), undoLabel: 'ゲームモード' }; });
  def('sys.wake', '画面を消さない', { on: { t: 'bool' } }, async a => { const on = a.on !== false; if (!power.wakeSupported) throw new Error('この端末では「画面を消さない」を使えません。'); await power.setWake(on); return { text: on ? '画面が消えないようにしました。' : '画面の自動消灯を元に戻しました。', undo: () => power.setWake(!on) }; });
  def('perf.report', '動作の重さの報告', {}, async () => {
    const l = proc.list().filter(p => p.state === 'running').sort((a, b) => b.stats.load - a.stats.load); const mem = perf.memory(); const top = l[0];
    let t = '動いているアプリは ' + proc.list().length + ' 本（実行中 ' + l.length + '）。';
    if (top && top.stats.load > .25) t += 'いちばん負荷が高いのは ' + top.app.name + '（描画に ' + Math.round(top.stats.load * 100) + '%）。'; else t += '目立って重いアプリはありません。';
    if (mem) t += 'メモリは ' + fmtBytes(mem.used) + ' を使用中。';
    if (perf.pressure !== 'nominal') t += '端末の負荷は「' + ({ fair: 'やや高い', serious: '高い', critical: 'とても高い' }[perf.pressure] || perf.pressure) + '」。';
    return { text: t, data: { procs: l.map(p => ({ name: p.app.name, load: p.stats.load, fps: p.stats.fps })), mem, pressure: perf.pressure } };
  }, { quiet: true });
  def('storage.report', '保存容量の報告', {}, async () => {
    const [s, u] = await Promise.all([perf.storage(), fs.usage()]);
    return { text: 'XEVARIX のファイルは ' + u.files + ' 個・' + fmtBytes(u.bytes) + '（ごみ箱 ' + fmtBytes(u.trash) + '）。このサイト全体では ' + fmtBytes(s.usage) + ' を使っていて、上限は約 ' + fmtBytes(s.quota) + ' です。', data: { ...s, files: u } };
  }, { quiet: true });
  def('bench.run', '端末の速さを測る', {}, async () => {
    const b = await perf.benchmark(); X.session.sysreg.set('device.bench', b); X.session.sysreg.set('device.tier', b.tier); power.setTier(b.tier); X.theme.apply();
    return { text: 'この端末は ' + b.score + ' 点（' + perf.tierName(b.tier) + '）でした。計算 ' + b.cpu + '・画面の組み立て ' + b.dom + '・描画 ' + b.gfx + '。', data: b };
  });

  /* ── 見た目・音 ── */
  def('ui.theme', '明るさの色合い', { theme: { t: 'enum', e: ['dark', 'light', 'auto'] } }, async a => { if (!['dark', 'light', 'auto'].includes(a.theme)) throw new Error('ダーク・ライト・自動 から選べます。'); return { text: { dark: 'ダーク', light: 'ライト', auto: '自動（端末に合わせる）' }[a.theme] + 'にしました。', ...setReg('ui.theme', a.theme, '色合いの変更') }; });
  def('ui.accent', '強調の色', { accent: { t: 'enum', e: ACCENTS.map(x => x.id) } }, async a => { const c = ACCENTS.find(x => x.id === a.accent || x.name === a.accent); if (!c) throw new Error('色は ' + ACCENTS.map(x => x.name).join('・') + ' から選べます。'); return { text: '強調の色を' + c.name + 'にしました。', ...setReg('ui.accent', c.id, '強調の色') }; });
  def('ui.wall', '壁紙', { wall: { t: 'enum', e: WALLS.map(x => x.id) } }, async a => { const w = WALLS.find(x => x.id === a.wall || x.name === a.wall); if (!w) throw new Error('壁紙は ' + WALLS.map(x => x.name).join('・') + ' から選べます。'); return { text: '壁紙を「' + w.name + '」にしました。', ...setReg('ui.wall', w.id, '壁紙') }; });
  def('ui.textScale', '文字の大きさ', { scale: { t: 'number', d: '0.85〜1.3' } }, async a => { const v = Math.min(1.3, Math.max(.85, Number(a.scale) || 1)); return { text: '文字の大きさを ' + Math.round(v * 100) + '% にしました。', ...setReg('ui.textScale', v, '文字の大きさ') }; });
  def('ui.motion', '動きを減らす', { on: { t: 'bool', d: 'true で動きあり' } }, async a => ({ text: a.on !== false ? '動きをふつうに戻しました。' : '動きを減らしました。', ...setReg('ui.motion', a.on !== false, '動きの設定') }));
  def('ui.dim', '画面を暗くする', { level: { t: 'number', d: '0〜0.7' } }, async a => { const v = Math.min(.7, Math.max(0, Number(a.level) || 0)); return { text: v ? '画面を ' + Math.round(v * 100) + '% 暗くしました。' : '画面の明るさを元に戻しました。', ...setReg('ui.dim', v, '画面の明るさ') }; });
  def('ui.contrast', 'はっきり表示', { on: { t: 'bool' } }, async a => ({ text: 'はっきり表示を' + (a.on !== false ? 'オン' : 'オフ') + 'にしました。', ...setReg('ui.contrast', a.on !== false, 'はっきり表示') }));
  def('sound.set', '効果音', { on: { t: 'bool' }, volume: { t: 'number', d: '0〜1' } }, async a => {
    const o1 = reg.get('sound.on'), o2 = reg.get('sound.volume');
    if (a.on !== undefined) reg.set('sound.on', !!a.on); if (a.volume !== undefined) reg.set('sound.volume', Math.min(1, Math.max(0, Number(a.volume))));
    return { text: '効果音は' + (reg.get('sound.on') ? 'オン（音量 ' + Math.round(reg.get('sound.volume') * 100) + '%）' : 'オフ') + 'です。', undo: () => { reg.set('sound.on', o1); reg.set('sound.volume', o2); }, undoLabel: '効果音の設定' };
  });

  /* ── 通知・窓・システム ── */
  def('notify.send', '通知を出す', { title: { t: 'string' }, body: { t: 'string' } }, async (a, c) => { notify.send({ app: c.by === 'ai' ? 'ai' : 'system', title: a.title || 'お知らせ', body: a.body || '' }); return { text: '通知を出しました。' }; });
  def('notify.dnd', 'おやすみモード', { on: { t: 'bool' }, minutes: { t: 'number' } }, async a => { const on = a.on !== false; const old = notify.dnd; notify.setDnd(on, a.minutes); return { text: on ? 'おやすみモードにしました' + (a.minutes ? '（' + fmtDur(a.minutes * 60000, true) + '）。' : '。通知は一覧にだけ入ります。') : 'おやすみモードを解除しました。', undo: () => notify.setDnd(old), undoLabel: 'おやすみモード' }; });
  def('notify.clear', '通知を消す', {}, async () => { notify.clear(); return { text: '通知をすべて消しました。' }; });
  def('wm.home', 'ホームへ', {}, async () => { wm.home(); return { text: 'ホームに戻りました。' }; });
  def('wm.overview', '窓の一覧', {}, async () => { if (wm.overview(true) === false) throw new Error('開いているアプリはありません。'); return { text: '開いている窓を並べました。' }; });
  def('wm.snap', '窓を寄せる', { side: { t: 'enum', e: ['left', 'right', 'max', 'normal'] } }, async a => { const w = wm.active(); if (!w) throw new Error('動かす窓がありません。'); if (wm.mode === 'phone') throw new Error('この画面の形では窓を並べられません。'); wm.snap(w.id, a.side); return { text: { left: '左半分に寄せました。', right: '右半分に寄せました。', max: '最大化しました。', normal: '元の大きさに戻しました。' }[a.side] || '窓を動かしました。' }; });
  def('home.edit', 'ホームを編集', {}, async () => { if (!X.act.editHome) throw new Error('ホームを読みこめていません。'); X.act.editHome(); return { text: 'ホームの編集を始めました。持って動かす・－で外す・＋でウィジェットを足す。終わったら「完了」を押してください。' }; });
  def('sys.lock', 'ロックする', {}, async () => { setTimeout(() => X.act.lock(), 50); return { text: 'ロックします。' }; });
  def('sys.restart', '再起動', {}, async () => { setTimeout(() => X.act.restart(), 400); return { text: 'XEVARIX を再起動します。' }; }, { danger: true });
  def('sys.fullscreen', '全画面', { on: { t: 'bool' } }, async a => {
    const R = document.documentElement, on = a.on !== false;
    try {
      if (on) { const f = R.requestFullscreen || R.webkitRequestFullscreen; if (!f) throw new Error('x'); await f.call(R); }
      else { const f = document.exitFullscreen || document.webkitExitFullscreen; if (f && (document.fullscreenElement || document.webkitFullscreenElement)) await f.call(document); }
    } catch { throw new Error('この端末・この開き方では全画面にできません（iPhone はホーム画面に追加すると全画面で開きます）。'); }
    return { text: on ? '全画面にしました。' : '全画面をやめました。' };
  });
  def('sys.info', 'この XEVARIX について', {}, async () => {
    const d = perf.device(); const b = X.session.sysreg.get('device.bench');
    return { text: OS.name + ' ' + OS.version + '（' + OS.build + '・' + OS.by + '）。' + d.os + ' の ' + d.browser + ' で動いています。' + (d.cores ? 'コア ' + d.cores + '・' : '') + (d.memGB ? 'メモリ約 ' + d.memGB + 'GB・' : '') + '画面 ' + d.screen + (b ? '・測定 ' + b.score + ' 点' : '') + '。起動してから ' + fmtDur(uptime(), true) + '。', data: { os: OS, device: d, bench: b, uptime: uptime() } };
  }, { quiet: true });

  /* ── 時間・計算 ── */
  def('time.now', 'いまの日時', {}, async () => { const d = new Date(); return { text: fmtDate(d, true) + ' ' + fmtClock(d, reg.get('ui.clock24')) + ' です。', data: { iso: d.toISOString() } }; }, { quiet: true });
  def('calc', '計算する', { expr: { t: 'string' } }, async a => { const v = evaluate(need(a.expr, '式を入れてください。')); return { text: a.expr + ' = ' + fmtNum(v), data: { value: v } }; }, { quiet: true });
  def('convert', '単位を変える', { value: { t: 'number' }, from: { t: 'string' }, to: { t: 'string' } }, async a => { const v = convert(Number(a.value), a.from, a.to); return { text: fmtNum(Number(a.value)) + ' ' + a.from + ' = ' + fmtNum(v, 8) + ' ' + a.to, data: { value: v } }; }, { quiet: true });
  def('timer.start', 'タイマーをかける', { seconds: { t: 'number' }, label: { t: 'string' } }, async a => {
    const s = Number(a.seconds); if (!(s > 0) || s > 86400 * 2) throw new Error('時間は 1秒〜48時間 で指定してください。');
    const t = S().timerStart(s, a.label); return { text: fmtDur(s * 1000) + 'のタイマーをかけました' + (a.label ? '（' + a.label + '）。' : '。'), data: t, undo: () => S().timerCancel(t.id), undoLabel: 'タイマー' };
  });
  def('timer.cancel', 'タイマーを止める', {}, async () => { const n = S().timerCancel('all'); return { text: n ? 'タイマーを ' + n + ' 本止めました。' : '動いているタイマーはありません。' }; });
  def('timer.list', 'タイマーの一覧', {}, async () => { const l = S().timers(); return { text: l.length ? '動いているタイマー: ' + l.map(t => (t.label ? t.label + ' ' : '') + 'あと' + fmtDur(t.end - Date.now())).join('、') : '動いているタイマーはありません。', data: l }; }, { quiet: true });
  def('alarm.set', 'アラームをかける', { time: { t: 'string', d: 'HH:MM' }, label: { t: 'string' }, days: { t: 'array', d: '曜日（0=日）。省略で1回だけ' } }, async a => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(a.time || '')); if (!m || +m[1] > 23 || +m[2] > 59) throw new Error('時刻は 7:30 のように指定してください。');
    const al = S().alarmAdd({ time: pad2(+m[1]) + ':' + m[2], label: a.label || '', days: a.days || null });
    return { text: al.time + ' にアラームをかけました' + (al.days ? '（くり返し）。' : '。'), data: al, undo: () => S().alarmRemove(al.id), undoLabel: 'アラーム' };
  });
  def('alarm.list', 'アラームの一覧', {}, async () => { const l = S().alarms().filter(x => x.on); return { text: l.length ? 'アラーム: ' + l.map(x => x.time + (x.label ? '（' + x.label + '）' : '')).join('、') : 'かかっているアラームはありません。', data: l }; }, { quiet: true });
  def('alarm.clear', 'アラームを消す', {}, async () => { const l = S().alarms(); for (const x of l) S().alarmRemove(x.id); return { text: l.length ? 'アラームを ' + l.length + ' 件消しました。' : 'アラームはありません。' }; });

  /* ── メモ・ファイル ── */
  def('note.create', 'メモを書く', { text: { t: 'string' }, title: { t: 'string' } }, async a => {
    const text = String(need(a.text, '何をメモしますか？')); const d = new Date();
    const title = (a.title || text.split('\n')[0]).replace(/[\\/:*?"<>|]/g, '').slice(0, 30) || 'メモ';
    const n = await fs.write(fs.DIRS.notes, title + '.md', text);
    return { text: '「' + n.name.replace(/\.md$/, '') + '」としてメモしました。', data: { id: n.id }, undo: () => fs.trash(n.id), undoLabel: 'メモを書く' };
  });
  def('file.search', 'ファイルをさがす', { q: { t: 'string' } }, async a => {
    const l = await fs.search(need(a.q, '何をさがしますか？'), 8);
    return { text: l.length ? '「' + a.q + '」で ' + l.length + ' 件見つかりました: ' + l.map(n => n.name).join('、') : '「' + a.q + '」に合うファイルは見つかりませんでした。', data: l.map(n => ({ id: n.id, name: n.name, kind: fs.kindOf(n) })) };
  }, { quiet: true });
  def('file.open', 'ファイルを開く', { id: { t: 'string' }, path: { t: 'string' } }, async a => {
    const n = a.id ? await fs.get(a.id) : await fs.resolve(need(a.path, 'どのファイルを開きますか？')); if (!n) throw new Error('そのファイルは見つかりません。');
    X.act.openFile(n); return { text: '「' + n.name + '」を開きました。' };
  });
  def('file.emptyTrash', 'ごみ箱を空にする', {}, async () => { const l = await fs.listTrash(); await fs.emptyTrash(); return { text: l.length ? 'ごみ箱の ' + l.length + ' 件を完全に消しました。' : 'ごみ箱は空です。' }; }, { danger: true });

  /* ── スペース・ルーティン・集中 ── */
  def('space.switch', 'スペースを切りかえる', { space: { t: 'string' } }, async a => {
    const l = S().spaces(); const q = String(need(a.space, 'どのスペースにしますか？')); const sp = l.find(s => s.id === q || s.name === q) || l.find(s => s.name.includes(q));
    if (!sp) throw new Error('スペースは ' + l.map(s => s.name).join('・') + ' から選べます。');
    const old = wm.space; S().spaceSwitch(sp.id); return { text: 'スペースを「' + sp.name + '」に切りかえました。', undo: () => S().spaceSwitch(old), undoLabel: 'スペースの切りかえ' };
  });
  def('routine.run', 'ルーティンを動かす', { name: { t: 'string' } }, async a => {
    const l = S().routines(); const q = String(need(a.name, 'どのルーティンを動かしますか？')); const r = l.find(x => x.id === q || x.name === q) || l.find(x => x.name.includes(q));
    if (!r) throw new Error(l.length ? 'ルーティンは ' + l.map(x => x.name).join('・') + ' があります。' : 'ルーティンはまだありません。');
    const res = await S().routineRun(r.id, { manual: true }); return { text: '「' + r.name + '」を動かしました。' + (res && res.text ? res.text : '') };
  });
  def('routine.create', 'ルーティンを作る', { routine: { t: 'object' } }, async a => { const r = S().routineSave(need(a.routine, 'ルーティンの内容がありません。')); return { text: 'ルーティン「' + r.name + '」を作りました。', data: r, undo: () => S().routineRemove(r.id), undoLabel: 'ルーティンを作る' }; });
  def('focus.start', '集中モード', { minutes: { t: 'number' } }, async a => { const m = Math.min(600, Math.max(1, Number(a.minutes) || 25)); S().focusStart(m); return { text: m + '分の集中モードを始めました。通知を止めます。', undo: () => S().focusStop(), undoLabel: '集中モード' }; });
  def('focus.stop', '集中モードを終える', {}, async () => { if (!S().focusOn()) return { text: '集中モードは動いていません。' }; S().focusStop(); return { text: '集中モードを終えました。おつかれさまでした。' }; });
  def('usage.today', '今日の利用時間', {}, async () => {
    const u = S().usageToday(); const top = Object.entries(u.apps).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, ms]) => ((apps.get(id) || {}).name || id) + ' ' + fmtDur(ms, true));
    return { text: '今日は合計 ' + fmtDur(u.total, true) + ' 使っています。' + (top.length ? 'よく使ったのは ' + top.join('、') + '。' : ''), data: u };
  }, { quiet: true });

  /* ── 読み上げ・元に戻す ── */
  def('say', '読み上げる', { text: { t: 'string' } }, async a => { if (!X.voice) throw new Error('この端末では読み上げを使えません。'); X.voice.speak(String(a.text || '')); return { text: '読み上げます。' }; }, { quiet: true });
  def('undo', '元に戻す', {}, async (a, c) => sys.undo(c.by === 'ai' ? 'ai' : undefined), { quiet: true });

  /* アプリ（別サイト）からは呼べない。標準アプリ・AI・ターミナル・ルーティンだけ */
  sys.setGuard(async (c, args, ctx) => {
    const by = ctx.by || 'user';
    if (by.startsWith('app:')) { const a = apps.get(by.slice(4)); if (!a || a.kind !== 'system') return 'このアプリからは、その操作はできません。'; }
    return null;
  });
}

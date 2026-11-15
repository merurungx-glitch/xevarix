/* XEVARIX AI — 中核（端末の中だけで動く）
   流れ： 言葉 → 理解（nlu）→ ①操作なら「計画」を立ててシステムコールを呼ぶ
                              ②調べものなら、電力・性能・容量の記録を読んで答える
                              ③使い方なら、知識の台帳（kb）からさがして答える
                              ④どれでもなければ、言語モデル（入っているとき）へ
   した操作は全部システムコール経由なので、記録に残り、「元に戻して」で戻せる。 */

import { bus, log } from '../sys/core.js';
import { normJa, fmtDur, fmtBytes, fmtClock, fmtDate, weekday, uid, debounce, pad2 } from '../sys/util.js';
import * as N from './nlu.js';
import { KB } from './kb.js';
import { evaluate, fmtNum, looksLikeMath, convert, unitNames, unitKind } from '../sys/mathx.js';
import { MODES } from '../sys/power.js';
import { ACCENTS, WALLS } from '../sys/theme.js';

let X, reg, kv, clf = null, hist = [], pending = null, lastTurn = null, kbIdx = null, llm = null, learned = [];
const R = (text, extra = {}) => ({ text, engine: 'core', ...extra });
const act = (label, name, args) => ({ label, call: { name, args: args || {} } });
const say = (label, text) => ({ label, say: text });
const strip = s => String(s || '').replace(/^[\s「『"']+|[\s」』"'。.!！]+$/g, '').replace(/^(えっと|あの|じゃあ|では|それじゃ|ねえ|xevarix|ai)[、,\s]*/i, '').trim();
const cleanName = s => strip(s).replace(/(を|お|は|が|で|の|って|という)$/, '').replace(/^(あぷり|アプリ)の?/, '').trim();

/* ── 分類器の用意（はじめて使うときに学ぶ。学んだ重みは控えておく） ── */
async function ensureClf() {
  if (clf) return clf;
  const c = new N.Classifier(N.LABELS);
  try {
    const saved = await kv.get('ai.model');
    learned = (await kv.get('ai.learned')) || [];
    if (!(saved && saved.tag === N.TRAIN_TAG && c.load(saved))) {
      const t0 = performance.now(); c.train([...N.TRAIN, ...learned.map(l => [l.t, l.id])]);
      kv.put({ ...c.dump(), tag: N.TRAIN_TAG }, 'ai.model').catch(() => {});
      log.info('ai', '言い回しを学びました（' + c.trained + ' 文・' + Math.round(performance.now() - t0) + ' ms）');
    }
  } catch (e) { c.train(N.TRAIN); }
  clf = c; return c;
}
const saveClf = debounce(() => { if (clf) kv.put({ ...clf.dump(), tag: N.TRAIN_TAG }, 'ai.model').catch(() => {}); kv.put(learned.slice(-300), 'ai.learned').catch(() => {}); }, 1500);

/* ── 知識の台帳をさがす（言葉の重なりで点をつける） ── */
function buildKb() {
  const df = new Map(); const docs = KB.map(e => { const tf = new Map(); const add = (t, w) => { for (const k of N.terms(t)) tf.set(k, (tf.get(k) || 0) + w); }; add(e.title, 3); for (const k of e.keys) add(k, 3); add(e.body, 1); for (const k of tf.keys()) df.set(k, (df.get(k) || 0) + 1); let len = 0; for (const v of tf.values()) len += v; return { e, tf, len }; });
  const avg = docs.reduce((a, d) => a + d.len, 0) / docs.length;
  kbIdx = { docs, df, avg, n: docs.length };
}
function searchKb(q, k = 3) {
  if (!kbIdx) buildKb();
  const qt = [...new Set(N.terms(q))]; const flat = normJa(q).replace(/\s+/g, ''); const out = [];
  for (const d of kbIdx.docs) {
    let s = 0;
    for (const t of qt) { const f = d.tf.get(t); if (!f) continue; const idf = Math.log(1 + (kbIdx.n - (kbIdx.df.get(t) || 0) + .5) / ((kbIdx.df.get(t) || 0) + .5)); s += idf * (f * 2.2) / (f + 1.2 * (.25 + .75 * d.len / kbIdx.avg)) * (t.length > 2 ? 1.5 : 1); }
    for (const key of d.e.keys) { const kn = normJa(key).replace(/\s+/g, ''); if (kn.length >= 2 && flat.includes(kn)) s += 3 + kn.length * .6; }
    if (s > 0) out.push({ e: d.e, s });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, k);
}

/* ── システムコールを呼んで、返事にする ── */
async function run(calls, lead) {
  const texts = []; let ok = true, undo = false;
  for (const c of calls) {
    try { const r = await X.sys.call(c.name, c.args || {}, { by: 'ai' }); if (r && r.text) texts.push(r.text); if (r && typeof r.undo === 'function') undo = true; }
    catch (e) { ok = false; texts.push(e.message); }
  }
  return R((lead ? lead + '\n' : '') + texts.join('\n'), { err: !ok, actions: undo && ok ? [act('元に戻す', 'undo')] : [] });
}

/* ── 操作の「計画」… 言葉から {name, args} を作る。足りなければ {need, q}。関係なければ null ── */
const modeOf = s => (/超省電力|うるとら|限界まで/.test(s) ? 'ultra' : /はいぱふぉ|高性能|ぱふぉーまんす|全力|最速|ぬるぬる|さくさく/.test(s) ? 'max' : /ばらんす|ふつう|標準/.test(s) ? 'balanced' : /省電力|節電|えこ|せーばー|長|もた|節約|大事/.test(s) ? 'saver' : null);
const PLAN = {
  'power.set'(c) { let m = modeOf(c.s); if (!m) return { need: 'mode', q: 'どの電力モードにしますか？', chips: ['省電力', 'バランス', 'ハイパフォーマンス', '超省電力'] }; if (N.parseOnOff(c.s) === false && /(切|やめ|解除|おふ|外)/.test(c.s)) m = 'balanced'; return { name: 'power.mode', args: { mode: m } }; },
  'sys.boost': () => ({ name: 'sys.boost', args: {} }),
  'app.open'(c) {
    const raw = cleanName(c.m && c.m[1] ? c.m[1] : c.s.replace(/(を|お)?(開いて|ひらいて|開く|ひらく|開けて|あけて|起動して|起動する|立ち上げて|たちあげて|出して|だして|表示して|見せて|みせて|使いたい|やりたい|したい|始めて|はじめて|起動)$/, ''));
    if (!raw) return { need: 'app', q: 'どのアプリを開きますか？' };
    const f = X.apps.find(raw); if (f && f.score >= .55) return { name: 'app.open', args: { app: f.app.id }, label: f.app.name };
    const cat = X.apps.catalogNow(); const g = cat && X.apps.find(raw, cat.apps);
    if (g && g.score >= .6) return { reply: R('「' + g.app.name + '」はまだ入っていません。ストアから入れますか？', { actions: [act('入れて開く', 'app.install', { app: g.app.id }), act('ストアで見る', 'app.open', { app: 'store', args: { app: g.app.id } })] }) };
    return null;
  },
  'app.close'(c) { if (/(これ|この窓|このあぷり|いまの)/.test(c.s)) return { name: 'app.close', args: {} }; const raw = cleanName(c.m && c.m[1]); const f = raw && X.apps.find(raw); if (f && f.score >= .55) return { name: 'app.close', args: { app: f.app.id } }; return raw ? null : { name: 'app.close', args: {} }; },
  'app.closeAll': () => ({ name: 'app.closeAll', args: {}, confirm: '開いているアプリをすべて閉じます。よろしいですか？' }),
  'app.install'(c) { const raw = cleanName(c.m && c.m[1]); if (!raw) return null; const cat = X.apps.catalogNow(); const g = cat && X.apps.find(raw, cat.apps); return g && g.score >= .55 ? { name: 'app.install', args: { app: g.app.id } } : null; },
  theme: c => ({ name: 'ui.theme', args: { theme: /自動|端末に合わせ/.test(c.s) ? 'auto' : /らいと|明る|白/.test(c.s) ? 'light' : 'dark' } }),
  accent(c) { const map = [['cyan', /しあん|水色/], ['blue', /ぶるー|青/], ['lavender', /らべんだー|紫/], ['mint', /みんと|緑/], ['coral', /こーらる|赤|おれんじ/], ['gold', /ごーるど|金|黄/]]; const h = map.find(x => x[1].test(c.s)); return h ? { name: 'ui.accent', args: { accent: h[0] } } : { need: 'accent', q: 'どの色にしますか？', chips: ACCENTS.map(a => a.name) }; },
  wall(c) { const w = WALLS.find(x => normJa(c.s).includes(normJa(x.name))); return w ? { name: 'ui.wall', args: { wall: w.id } } : { need: 'wall', q: 'どの壁紙にしますか？', chips: WALLS.map(x => x.name) }; },
  'text.size'(c) { const cur = reg.get('ui.textScale'); const up = /大き|おおき|でか|見づら|読みにく/.test(c.s) && !/小さく|ちいさく/.test(c.s); return { name: 'ui.textScale', args: { scale: Math.round((cur + (up ? .1 : -.1)) * 100) / 100 } }; },
  dim(c) { const cur = reg.get('ui.dim') || 0; const darker = /(暗く|くらく|まぶし|眩し|下げ)/.test(c.s) && !/暗すぎ|くらすぎ/.test(c.s); if (/(元|もと|ふつう|戻)/.test(c.s)) return { name: 'ui.dim', args: { level: 0 } }; return { name: 'ui.dim', args: { level: Math.round(Math.min(.7, Math.max(0, cur + (darker ? .2 : -.2))) * 100) / 100 } }; },
  motion: c => ({ name: 'ui.motion', args: { on: /(戻|もど|おん|つけ|増や)/.test(c.s) } }),
  sound(c) { if (/音量|ぼりゅーむ/.test(c.s)) { const p = N.parsePercent(c.s); const cur = reg.get('sound.volume'); return { name: 'sound.set', args: { on: true, volume: p != null ? p / 100 : Math.min(1, Math.max(0, cur + (/(上げ|あげ|大き)/.test(c.s) ? .2 : -.2))) } }; } return { name: 'sound.set', args: { on: !/(消|おふ|切|止め|みゅーと|うるさ)/.test(c.s) } }; },
  dnd(c) { const on = !/(解除|出して|おんにして|戻して|おやすみ(もーど)?を?(やめ|おふ|切))/.test(c.s); const d = N.parseDuration(c.s); return { name: 'notify.dnd', args: { on, minutes: on && d ? Math.round(d / 60) : undefined } }; },
  focus(c) { if (/(やめ|終|解除|おふ|止め)/.test(c.s)) return { name: 'focus.stop', args: {} }; const d = N.parseDuration(c.s); return { name: 'focus.start', args: { minutes: d ? Math.max(1, Math.round(d / 60)) : 25 } }; },
  game: c => ({ name: 'sys.game', args: { on: N.parseOnOff(c.s) !== false } }),
  wake: c => ({ name: 'sys.wake', args: { on: !/(元に|戻|解除|やめ|消えていい)/.test(c.s) } }),
  lock: () => ({ name: 'sys.lock', args: {} }),
  fullscreen: c => ({ name: 'sys.fullscreen', args: { on: !/(やめ|解除|戻|おふ|終)/.test(c.s) } }),
  home: () => ({ name: 'wm.home', args: {} }),
  overview: () => ({ name: 'wm.overview', args: {} }),
  snap: c => ({ name: 'wm.snap', args: { side: /左/.test(c.s) ? 'left' : /右/.test(c.s) ? 'right' : /最大/.test(c.s) ? 'max' : 'normal' } }),
  timer(c) { const d = N.parseDuration(c.s); if (!d) return { need: 'duration', q: '何分はかりますか？', chips: ['3分', '5分', '10分', '30分'] }; const label = strip(c.s.replace(/\d+(?:\.\d+)?\s*(時間|分|秒)(半)?/g, '').replace(/(の|を|で)?(たいまー|はかって|測って|計って|かうんとだうん|かけて|せっと|数えて|後に?|ご|たったら|経ったら|教えて|知らせて|お知らせ|鳴らして|して|に|を|で|の)/g, '')); return { name: 'timer.start', args: { seconds: d, label: label.length > 1 && label.length < 16 ? label : '' } }; },
  'timer.cancel': () => ({ name: 'timer.cancel', args: {} }),
  alarm(c) { const days0 = N.parseDays(c.s); /* くり返しや「起こして」は、朝の時刻として読む */ const t = N.parseClock(c.s, days0 || /起こ|おこ|目覚|めざ|朝|あさ/.test(c.s) ? new Date(2000, 0, 1, 0, 0) : new Date()); if (!t) return { need: 'clock', q: '何時にかけますか？', chips: ['6:30', '7:00', '8:00'] }; return { name: 'alarm.set', args: { time: t.text, days: N.parseDays(c.s) || undefined, label: /起こ|おこ|目覚|めざ/.test(c.s) ? '起きる時間' : '' } }; },
  'alarm.clear': () => ({ name: 'alarm.clear', args: {} }),
  'note.create'(c) { let t = c.m && (c.m[1] || c.m[4] || c.m[5]); if (!t) { const m = /^めも(?:して|しといて)?[:：\s]\s*(.+)$/.exec(c.s); t = m && m[1]; } t = t && recoverCase(c.raw, strip(t)); return t ? { name: 'note.create', args: { text: t } } : { need: 'text', q: '何をメモしますか？' }; },
  space(c) { const l = X.services ? X.services.spaces() : []; const h = l.find(sp => c.s.includes(normJa(sp.name))); return h ? { name: 'space.switch', args: { space: h.id } } : { need: 'space', q: 'どのスペースにしますか？', chips: l.map(sp => sp.name) }; },
  'routine.run'(c) { const l = X.services ? X.services.routines() : []; const h = l.find(r => c.s.includes(normJa(r.name))); return h ? { name: 'routine.run', args: { name: h.id } } : (l.length ? { need: 'routine', q: 'どのルーティンを動かしますか？', chips: l.map(r => r.name) } : { reply: R('ルーティンはまだありません。「毎朝7時に省電力を切って」のように言うと作れます。', { actions: [act('ルーティンを開く', 'app.open', { app: 'routines' })] }) }); },
  bench: () => ({ name: 'bench.run', args: {}, lead: '測っています…' }),
  restart: () => ({ name: 'sys.restart', args: {}, confirm: 'XEVARIX を再起動します。開いているアプリは閉じます。よろしいですか？' }),
  'notify.clear': () => ({ name: 'notify.clear', args: {} }),
};
/* 元の文の大文字・カタカナを、そろえた文の切り出しに合わせて取り戻す */
function recoverCase(raw, part) { const n = normJa(raw); const i = n.indexOf(normJa(part)); if (i < 0) return part; const src = raw.normalize('NFKC'); return src.length === n.length ? src.slice(i, i + part.length) : part; }

/* ── 調べて答えるもの ── */
function adviseBattery() {
  const p = X.power, b = p.battery, rem = p.remainingMin(), dr = p.drainRate(); const lines = [], actions = [];
  const shares = p.shares(id => (X.apps.get(id) || {}).name || id).filter(s => s.id !== '_system');
  const bg = X.proc.list().filter(q => q.state === 'running' && X.wm.visibility(q.win) === 'hidden');
  if (!b) lines.push('この端末・ブラウザは電池残量を読めないので、残量からは判断できません。動きの記録から見ます。');
  else lines.push('電池は ' + Math.round(b.level * 100) + '%' + (b.charging ? '（充電中）' : '') + (dr ? '、1時間に約 ' + dr.toFixed(1) + '% のペースで減っています' : '') + (rem ? '（あと約' + fmtDur(rem * 60000, true) + '）' : '') + '。');
  if (shares.length) lines.push('今日いちばん動いていたのは ' + shares.slice(0, 3).map(s => s.name + '（' + Math.round(s.share * 100) + '%）').join('、') + ' です。');
  if (p.mode === 'max') { lines.push('いまは「ハイパフォーマンス」なので、裏のアプリも止めずに動かしています。'); actions.push(act('バランスにする', 'power.mode', { mode: 'balanced' })); }
  if (p.mode !== 'saver' && p.mode !== 'ultra') actions.push(act('省電力にする', 'power.mode', { mode: 'saver' }));
  if (bg.length) { lines.push('裏で ' + bg.length + ' 本（' + bg.slice(0, 3).map(q => q.app.name).join('、') + '）が動いています。'); actions.push(act('裏を休止する', 'sys.boost')); }
  if (reg.get('ui.seconds')) lines.push('時計の「秒まで表示」は、1秒ごとに描き直すぶん少し使います。');
  if (!reg.get('power.auto')) lines.push('「自動で節約する」がオフです。オンにすると、電池が減ったときに自動で省電力へ切りかえます。');
  if (lines.length <= 1 && !actions.length) lines.push('とくに電池を使っているものは見当たりません。');
  actions.push(act('消費の内わけを見る', 'app.open', { app: 'monitor', args: { tab: 'power' } }));
  return R(lines.join('\n'), { actions, card: b ? { title: '電池', rows: [['残量', Math.round(b.level * 100) + '%'], ['電力モード', p.info().name], ['減るペース', dr ? dr.toFixed(1) + '% / 時' : '—']], meter: b.level } : null });
}
function advisePerf() {
  const l = X.proc.list(), run = l.filter(p => p.state === 'running').sort((a, b) => b.stats.load - a.stats.load), top = run[0], mem = X.perf.memory(), pol = X.power.policy(); const lines = [], actions = [];
  lines.push('動いているアプリは ' + l.length + ' 本（実行中 ' + run.length + '・休止 ' + (l.length - run.length) + '）です。');
  if (top && top.stats.load > .3) { lines.push('いちばん負荷が高いのは「' + top.app.name + '」で、描画に時間の ' + Math.round(top.stats.load * 100) + '% を使っています（毎秒 ' + top.stats.fps + ' 回）。'); if (X.wm.visibility(top.win) !== 'focus') actions.push(act(top.app.name + ' を閉じる', 'app.close', { app: top.appId })); }
  else lines.push('描画で目立って重いアプリはありません。');
  const bg = run.filter(p => X.wm.visibility(p.win) === 'hidden'); if (bg.length) { lines.push('裏で ' + bg.length + ' 本が動いたままです。'); actions.push(act('ブーストする', 'sys.boost')); }
  if (X.perf.pressure === 'serious' || X.perf.pressure === 'critical') lines.push('端末ぜんたいの負荷が高い状態です。XEVARIX の外（ほかのタブやアプリ）が重いのかもしれません。');
  if (mem && mem.used / mem.limit > .7) lines.push('メモリを多く使っています（' + fmtBytes(mem.used) + '）。使っていないアプリを閉じると軽くなります。');
  if (pol.fx === 'full') { lines.push('ぼかしや影は「すべて」使っています。'); actions.push(act('効果を控えめにする', 'app.open', { app: 'settings', args: { page: 'perf' } })); }
  if (pol.fpsCap) lines.push('いまは「' + X.power.info().name + '」なので、描画を毎秒 ' + pol.fpsCap + ' 回までに抑えています。なめらかさを優先するなら「バランス」にしてください。');
  actions.push(act('モニターを開く', 'app.open', { app: 'monitor' }));
  return R(lines.join('\n'), { actions });
}
async function brief(greet) {
  const d = new Date(), hr = d.getHours(), p = X.power, b = p.battery; const lines = [];
  lines.push((greet || (hr < 5 ? 'こんばんは' : hr < 11 ? 'おはようございます' : hr < 18 ? 'こんにちは' : 'こんばんは')) + '、' + X.session.user.name + ' さん。' + fmtDate(d) + ' ' + fmtClock(d, reg.get('ui.clock24')) + ' です。');
  lines.push('電力は「' + p.info().name + '」' + (b ? '、電池は ' + Math.round(b.level * 100) + '%' + (b.charging ? '（充電中）' : '') : '') + '。');
  if (X.services) {
    const key = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    const ev = X.services.events().filter(e => e.date === key).sort((a, c) => (a.time || '').localeCompare(c.time || ''));
    lines.push(ev.length ? '今日の予定: ' + ev.map(e => (e.time ? e.time + ' ' : '') + e.title).join('、') + '。' : '今日の予定は入っていません。');
    const t = X.services.timers(), al = X.services.alarms().filter(a => a.on);
    if (t.length) lines.push('タイマーが ' + t.length + ' 本動いています（次はあと' + fmtDur(t[0].end - Date.now()) + '）。');
    if (al.length) lines.push('アラーム: ' + al.map(a => a.time).join('、') + '。');
    const u = X.services.usageToday(); if (u.total > 60000) lines.push('今日はここまで ' + fmtDur(u.total, true) + ' 使っています。');
  }
  const g = X.services && X.services.suggest();
  return R(lines.join('\n'), { actions: g ? [g.action] : [], followups: ['できることは？', '電池のもちは？'] });
}
const INFO = {
  'power.status': async () => { const r = await X.sys.call('power.status', {}, { by: 'ai' }); const b = X.power.battery; return R(r.text, { card: b ? { title: '電池', rows: [['残量', Math.round(b.level * 100) + '%'], ['電力モード', X.power.info().name]], meter: b.level } : null, actions: [act('省電力にする', 'power.mode', { mode: 'saver' })], followups: ['電池の減りが早い原因は？'] }); },
  'advise.battery': async c => (/(出ない|でない|表示されない|読めない|見えない|iphone|ipad|safari)/.test(c.s) ? null : adviseBattery()),
  'advise.perf': async () => advisePerf(),
  storage: async () => { const r = await X.sys.call('storage.report', {}, { by: 'ai' }); return R(r.text, { card: { title: '保存容量', rows: [['ファイル', fmtBytes(r.data.files.bytes)], ['サイト全体', fmtBytes(r.data.usage)], ['上限', fmtBytes(r.data.quota)]], meter: r.data.quota ? r.data.usage / r.data.quota : 0 }, actions: [act('保存容量を開く', 'app.open', { app: 'settings', args: { page: 'storage' } })] }); },
  usage: async () => { const r = await X.sys.call('usage.today', {}, { by: 'ai' }); return R(r.text, { actions: [act('くわしく見る', 'app.open', { app: 'settings', args: { page: 'usage' } })] }); },
  'app.list': async () => R((await X.sys.call('app.list', {}, { by: 'ai' })).text, { actions: X.proc.list().length ? [act('窓を並べる', 'wm.overview'), act('裏を休止する', 'sys.boost')] : [] }),
  'timer.list': async () => R((await X.sys.call('timer.list', {}, { by: 'ai' })).text),
  'alarm.list': async () => R((await X.sys.call('alarm.list', {}, { by: 'ai' })).text, { actions: [act('時計を開く', 'app.open', { app: 'clock' })] }),
  time: async c => { const d = new Date(); return R(/日|曜|日付/.test(c.s) && !/何時|時間|時刻/.test(c.s) ? '今日は ' + fmtDate(d, true) + ' です。' : 'いまは ' + fmtClock(d, reg.get('ui.clock24')) + ' です（' + fmtDate(d) + '）。'); },
  'date.calc': async c => {
    const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let s = c.s; if (/くりすます/.test(s)) s = s.replace(/くりすます/, '12月25日'); if (/(大晦日|おおみそか)/.test(s)) s = s.replace(/(大晦日|おおみそか)/, '12月31日'); if (/(元日|元旦|お正月|正月)/.test(s)) s = s.replace(/(元日|元旦|お正月|正月)/, '1月1日');
    const d = N.parseDate(s, now); if (!d) return null;
    const diff = Math.round((d - today) / 864e5);
    if (/あと(何|なん)日|まで/.test(s)) return R(fmtDate(d, true) + ' まで、あと ' + diff + ' 日です。');
    return R(fmtDate(d, true) + ' です' + (diff ? '（' + Math.abs(diff) + ' 日' + (diff > 0 ? '後' : '前') + '）。' : '（今日）。'));
  },
  convert: async c => {
    const all = unitNames().map(u => [u, normJa(u)]); const src = c.s.replace(/は|を|って|に(直|なお|換算|変換).*|ですか|\?|何|なん|いくつ|どれくらい|で/g, ' ');
    const m = /(\d+(?:\.\d+)?)\s*(\S+?)\s+(\S+)/.exec(src); if (!m) return null;
    const cands = t => all.filter(([, n]) => n === t || t.startsWith(n)).sort((x, y) => y[1].length - x[1].length).map(x => x[0]);
    const val = parseFloat(m[1]);
    for (const a of cands(m[2].trim())) for (const b of cands(m[3].trim())) { if (a === b) continue; try { return R(fmtNum(val) + ' ' + a + ' は ' + fmtNum(convert(val, a, b), 8) + ' ' + b + ' です。'); } catch { /* 種類がちがう組は飛ばす */ } }
    return null;
  },
  'file.search': async c => {
    const q = cleanName((c.m && c.m[1]) || '').replace(/(の|という)?(ふぁいる|めも|書類|写真|画像|のーと)$/, '').trim(); if (!q) return null;
    const l = await X.fs.search(q, 6); if (!l.length) return R('「' + q + '」に合うファイルやメモは見つかりませんでした。', { actions: [act('ファイルを開く', 'app.open', { app: 'files' })] });
    return R('「' + q + '」で ' + l.length + ' 件見つかりました。', { actions: l.slice(0, 5).map(n => act(n.name, 'file.open', { id: n.id })) });
  },
  remember: async c => { let t = c.m && c.m[1] ? recoverCase(c.raw, strip(c.m[1])) : ''; if (!t || /^(これ|それ|あれ)$/.test(t)) { const prev = [...hist].reverse().find(h => h.role === 'user' && !/覚えて|おぼえて/.test(h.text)); t = prev ? prev.text : ''; } if (!t) return R('何を覚えますか？「好きな色は青と覚えて」のように言ってください。'); reg.update('ai.memory', l => [...(l || []), { id: uid('m'), text: t, t: Date.now() }].slice(-100)); return R('覚えました：「' + t + '」', { actions: [say('やっぱり忘れて', '「' + t + '」を忘れて')] }); },
  recall: async () => { const l = reg.get('ai.memory') || []; return R(l.length ? '覚えていること：\n' + l.map(m => '- ' + m.text).join('\n') : 'まだ何も覚えていません。「◯◯と覚えて」と言うと覚えます。', { actions: [act('設定で見る', 'app.open', { app: 'settings', args: { page: 'ai' } })] }); },
  forget: async c => { const l = reg.get('ai.memory') || []; if (/(全部|ぜんぶ|すべて|記憶を|(覚|おぼ)え(た|てる|ている|てた)(こと|もの|内容))/.test(c.s)) { pending = { kind: 'confirm', run: async () => { reg.set('ai.memory', []); return R('覚えていたことを、すべて忘れました。'); } }; return R('覚えていること ' + l.length + ' 件を、すべて忘れます。よろしいですか？', { actions: [say('はい', 'はい'), say('やめる', 'やめる')] }); } const q = normJa(cleanName((c.m && c.m[1]) || '')).replace(/(のこと|について|の話|のはなし)$/, '').replace(/^(さっきの|あの|その)/, ''); const hit = q && l.filter(m => normJa(m.text).includes(q)); if (!hit || !hit.length) return R('それは覚えていないようです。', { actions: [say('何を覚えてる？', '何を覚えてる？')] }); reg.set('ai.memory', l.filter(m => !hit.includes(m))); return R('忘れました：' + hit.map(m => '「' + m.text + '」').join(''));
  },
  myname: async c => { const n = recoverCase(c.raw, strip((c.m && (c.m[3] || c.m[5])) || '')).replace(/(さん|くん|ちゃん)$/, ''); if (!n || n.length > 24 || X.session.isGuest) return null; X.session.updateUser(X.session.user.id, { name: n }); return R('わかりました。これからは ' + n + ' さんとお呼びします。'); },
  help: async () => R(KB.find(e => e.id === 'ai-what').body, { md: true, followups: ['省電力にして', '3分はかって', '電池のもちは？', '保管庫って何？'], actions: [act('ヘルプを開く', 'app.open', { app: 'help' })] }),
  greet: async c => { if (/ありがと|たすか|助か|さんきゅ|thank/.test(c.s)) return R(['どういたしまして。', 'お役に立ててよかったです。', 'いつでもどうぞ。'][Math.floor(Math.random() * 3)]); if (/おやすみ/.test(c.s)) return R('おやすみなさい。', { actions: [act('おやすみモードにする', 'notify.dnd', { on: true }), act('ロックする', 'sys.lock')] }); if (/おつかれ|お疲れ/.test(c.s)) return R('おつかれさまです。'); return brief(/おはよ/.test(c.s) ? 'おはようございます' : /こんばん/.test(c.s) ? 'こんばんは' : /はじめまして/.test(c.s) ? 'はじめまして' : null); },
  who: async () => R('XEVARIX の AI です。NGX と ISHIDA Production が作った XEVARIX の中にいて、この端末の中だけで動いています。OS の操作・使い方の案内・電池や動作の診断がおもな仕事です。' + (llm && llm.usable() ? '言語モデルも入っているので、自由な質問にも答えます。' : ''), { followups: ['できることは？'] }),
  brief: async () => brief(),
  undo: async () => { const r = await X.sys.undo('ai'); const r2 = r.none ? await X.sys.undo() : r; return R(r2.text); },
  'sys.info': async () => R((await X.sys.call('sys.info', {}, { by: 'ai' })).text, { actions: [act('くわしく見る', 'app.open', { app: 'settings', args: { page: 'about' } })] }),
  'routine.create': async c => makeRoutine(c),
  summarize: async c => textJob(c, 'sum'),
  translate: async c => textJob(c, 'tr'),
};

/* ── 言葉からルーティンを作る ── */
function splitTrigger(s) {
  let m;
  if ((m = /(電池|ばってりー)が\s*(\d+)\s*(?:%|％|ぱーせんと)?\s*(以上|を?超え)/.exec(s))) return { trigger: { type: 'battery', op: 'above', level: +m[2] }, rest: s.slice(m.index + m[0].length) };
  if ((m = /(電池|ばってりー)が\s*(\d+)\s*(?:%|％|ぱーせんと)?/.exec(s))) return { trigger: { type: 'battery', op: 'below', level: +m[2] }, rest: s.slice(m.index + m[0].length) };
  if ((m = /充電(を)?(始め|はじめ|し|つな)(たら|ると|だら)/.exec(s))) return { trigger: { type: 'charging', state: 'start' }, rest: s.slice(m.index + m[0].length) };
  if ((m = /充電(を|が)?(やめ|外し|終わ|切れ|抜)(たら|ると|いたら)/.exec(s))) return { trigger: { type: 'charging', state: 'stop' }, rest: s.slice(m.index + m[0].length) };
  if ((m = /(.+?)を(開いたら|ひらいたら|閉じたら|とじたら|起動したら)/.exec(s))) { const f = X.apps.find(cleanName(m[1])); if (f && f.score >= .55) return { trigger: { type: 'app', app: f.app.id, event: /閉|とじ/.test(m[2]) ? 'close' : 'open' }, rest: s.slice(m.index + m[0].length) }; }
  if (/ろっくを?(開|解除)/.test(s)) { m = /ろっくを?(開けたら|解除したら|あけたら)/.exec(s); if (m) return { trigger: { type: 'unlock' }, rest: s.slice(m.index + m[0].length) }; }
  const t = N.parseClock(s), days = N.parseDays(s);
  if (t) { m = /(午前|午後|朝|夜|夕方|昼|深夜)?\s*の?\s*\d{1,2}\s*(?:時|:|：)\s*(?:\d{1,2}\s*分?|半)?\s*(に(なったら|なると)?|になったら)?/.exec(s); return { trigger: { type: 'time', time: t.text, days: days || [] }, rest: m ? s.slice(m.index + m[0].length) : s }; }
  if (/毎朝/.test(s)) return { trigger: { type: 'time', time: '07:00', days: days || [] }, rest: s.replace(/毎朝(に)?/, ''), guess: '朝7時' };
  if (/毎晩|毎夜/.test(s)) return { trigger: { type: 'time', time: '22:00', days: days || [] }, rest: s.replace(/毎(晩|夜)(に)?/, ''), guess: '夜10時' };
  return null;
}
async function makeRoutine(c) {
  if (!X.services) return R('ルーティンのしくみを読みこめませんでした。');
  const sp = splitTrigger(c.s);
  if (!sp) return R('どんなときに、何をしますか？ たとえば「毎朝7時に省電力を切って」「電池が20%になったら省電力にして」のように言ってください。', { actions: [act('自分で作る', 'app.open', { app: 'routines' })] });
  const rest = strip(sp.rest.replace(/^(に|は|、|,|\s)+/, '')).replace(/(ほしい|おいて|ください|ようにして)$/, '');
  const actions = [];
  for (const part of rest.split(/(?:して(?:から)?、?|そして|あと|、)(?=.{3,})/).map(strip).filter(Boolean)) {
    if (/(通知|知らせ|教えて|お知らせ)/.test(part) && !/通知を?(止め|切|おふ)/.test(part)) { actions.push({ name: 'notify.send', args: { title: 'ルーティン', body: X.services.triggerText(sp.trigger) } }); continue; }
    const u = N.understand(part.endsWith('て') || /(する|にして|して)$/.test(part) ? part : part + 'して', clf);
    for (const cand of u.list.slice(0, 3)) { const pl = PLAN[cand.id] && cand.score > .4 ? PLAN[cand.id]({ s: u.s, raw: part, m: cand.m }) : null; if (pl && pl.name && pl.name !== 'sys.restart') { actions.push({ name: pl.name, args: pl.args }); break; } }
  }
  if (!actions.length) return R('「' + X.services.triggerText(sp.trigger) + '」のときに、何をしますか？', { actions: [act('自分で作る', 'app.open', { app: 'routines' })] });
  const names = { 'power.mode': a => '電力モードを「' + MODES[a.mode].name + '」に', 'notify.dnd': a => 'おやすみモードを' + (a.on ? 'オン' : 'オフ') + 'に', 'app.open': a => '「' + (X.apps.get(a.app) || {}).name + '」を開く', 'app.close': a => '「' + ((X.apps.get(a.app) || {}).name || '手前の窓') + '」を閉じる', 'focus.start': a => a.minutes + '分の集中モード', 'notify.send': () => '通知する', 'sys.boost': () => 'ブースト', 'ui.theme': a => '色合いを' + ({ dark: 'ダーク', light: 'ライト', auto: '自動' })[a.theme] + 'に', 'sys.lock': () => 'ロックする', 'space.switch': a => 'スペースを切りかえる', 'ui.dim': a => '画面の暗さを変える', 'timer.start': a => fmtDur(a.seconds * 1000) + 'のタイマー' };
  const desc = actions.map(a => (names[a.name] ? names[a.name](a.args) : a.name)).join('、');
  const routine = { name: (X.services.triggerText(sp.trigger) + ' ' + desc).slice(0, 38), on: true, trigger: sp.trigger, actions, notify: true };
  pending = { kind: 'confirm', run: async () => { const r = await X.sys.call('routine.create', { routine }, { by: 'ai' }); return R(r.text, { actions: [act('元に戻す', 'undo'), act('ルーティンを開く', 'app.open', { app: 'routines' })] }); } };
  return R('このルーティンを作りますか？' + (sp.guess ? '（時刻は ' + sp.guess + ' にしました。あとで変えられます）' : ''), { card: { title: 'ルーティン', rows: [['きっかけ', X.services.triggerText(sp.trigger)], ['すること', desc]] }, actions: [say('作る', 'はい'), say('やめる', 'やめる')] });
}

/* ── 要約・翻訳（言語モデルが要る） ── */
async function textJob(c, kind) {
  let body = cleanName((c.m && c.m[1]) || ''), src = null;
  if (/(この|さっきの|いまの|最新の)?(めも|ふぁいる|のーと)$/.test(body) || !body) { const l = (await X.fs.ls(X.fs.DIRS.notes)).filter(n => n.kind === 'file').sort((a, b) => b.mtime - a.mtime); src = l[0]; }
  else { const q = body.replace(/(の|という)?(めも|ふぁいる|のーと)$/, ''); const l = await X.fs.search(q, 3); src = l.find(n => X.fs.isText(n)) || null; if (!src && kind === 'tr') src = { inline: recoverCase(c.raw, body) }; }
  if (!src) return R('どの文を' + (kind === 'sum' ? '要約' : '翻訳') + 'しますか？ メモの名前か、文をそのまま言ってください。');
  const text = src.inline || (await X.fs.readText(src.id)).slice(0, 6000);
  if (!llm || !llm.usable()) {
    if (kind === 'sum') { const lines = text.split(/\n+/).map(s => s.trim()).filter(Boolean); return R('言語モデルが入っていないので、はじめの数行だけ抜き出します：\n' + lines.slice(0, 4).map(l => '- ' + l.slice(0, 80)).join('\n'), { actions: [act('言語モデルを入れる', 'app.open', { app: 'settings', args: { page: 'ai' } })] }); }
    return R('翻訳には言語モデルが要ります。設定 → AI から入れられます。', { actions: [act('設定を開く', 'app.open', { app: 'settings', args: { page: 'ai' } })] });
  }
  const toEn = /英語|えいご/.test(c.s);
  const prompt = kind === 'sum' ? '次の文章を、日本語で3〜5行の箇条書きに要約してください。書かれていないことは足さないでください。\n\n' + text : '次の文章を' + (toEn ? '英語' : '日本語') + 'に翻訳してください。訳文だけを出してください。\n\n' + text;
  return { llmPrompt: prompt, lead: src.name ? '「' + src.name + '」を' + (kind === 'sum' ? '要約' : '翻訳') + 'します。' : '' };
}

/* ── 対話の本体 ── */
function casual(t) { return reg.get('ai.tone') !== 'casual' ? t : t.replace(/しました。/g, 'したよ。').replace(/にしました/g, 'にしたよ').replace(/ですか？/g, '？').replace(/しますか？/g, 'する？').replace(/です。/g, 'だよ。').replace(/ください。/g, 'ね。').replace(/ありません。/g, 'ないよ。').replace(/できます。/g, 'できるよ。').replace(/います。/g, 'いるよ。').replace(/ます。/g, 'るよ。'); }
function suggestions() {
  const out = []; const b = X.power.battery;
  if (b && !b.charging && b.level < .3 && X.power.mode !== 'saver' && X.power.mode !== 'ultra') out.push('省電力にして');
  if (X.proc.list().length > 2) out.push('重いアプリは？');
  out.push('できることは？', '3分はかって', '電池のもちは？', X.theme.isDark() ? 'ライトにして' : 'ダークにして', '今日の予定は');
  return [...new Set(out)].slice(0, 5);
}

async function handle(raw, opts) {
  const text = String(raw || '').trim(); if (!text) return brief();
  await ensureClf();
  const s = N.norm(text);
  /* 途中の話（聞き返し・確認）への返事 */
  if (pending) {
    const p = pending;
    if (p.kind === 'confirm') { pending = null; if (N.isYes(s)) return p.run(); if (N.isNo(s) || /やめ|いい(です|や)?$|きゃんせる/.test(s)) return R('やめました。'); }
    else if (p.kind === 'choose') { pending = null; const i = p.options.findIndex(o => normJa(o.label) === normJa(text) || s.includes(normJa(o.label))); if (i >= 0) { clf.learn(p.text, p.options[i].id); learned.push({ t: p.text, id: p.options[i].id }); saveClf(); return dispatch(p.text, N.norm(p.text), [{ id: p.options[i].id, score: 1, m: null }], opts, '覚えました。次からは、その言い方で「' + p.options[i].label + '」をします。'); } }
    else if (p.kind === 'slot') {     // 聞き返しへの短い返事（「5分」「メモ」など）だけ、前の話の続きとして読む
      pending = null; const u0 = N.understand(text, clf);
      const fresh = s.length > 14 || /\?$|教えて|って(何|なに)|しかた|やり方/.test(s) || (u0.list[0] && u0.list[0].rule >= .9 && u0.list[0].id !== p.intent);
      if (N.isNo(s)) return R('やめました。');
      if (!fresh) return dispatch(p.text + ' ' + text, N.norm(p.text + ' ' + text), [{ id: p.intent, score: 1, m: null }], opts);
    }
  }
  /* 直前の返事が的外れだったとき */
  if (/^(ちがう|違う|そうじゃな|ちがいます|それじゃな|まちがい|間違)/.test(s) && lastTurn && lastTurn.alts && lastTurn.alts.length) {
    const options = lastTurn.alts.filter(id => id !== lastTurn.intent).slice(0, 4).map(id => ({ id, label: N.INTENT_NAMES[id] || id }));
    pending = { kind: 'choose', text: lastTurn.text, options };
    return R('失礼しました。「' + lastTurn.text + '」は、どれのことでしたか？', { actions: options.map(o => say(o.label, o.label)).concat([say('どれでもない', 'やめる')]) });
  }
  /* 計算 */
  const mathSrc = N.spokenMath(s);
  if (looksLikeMath(mathSrc)) { try { const v = evaluate(mathSrc); return R(mathSrc.replace(/\*/g, '×').replace(/\//g, '÷') + ' = ' + fmtNum(v), { intent: 'calc' }); } catch { /* 式ではなかった */ } }
  let m;
  if ((m = /(\d+(?:\.\d+)?)\s*の\s*(\d+(?:\.\d+)?)\s*(%|％|ぱーせんと|割)/.exec(s))) { const v = parseFloat(m[1]) * parseFloat(m[2]) / (m[3] === '割' ? 10 : 100); return R(m[1] + ' の ' + m[2] + (m[3] === '割' ? '割' : '%') + ' は ' + fmtNum(v) + ' です。', { intent: 'calc' }); }
  if ((m = /(\d+(?:\.\d+)?)\s*円?の?\s*(税込|消費税)/.exec(s))) { const v = parseFloat(m[1]); return R(fmtNum(v) + ' 円の税込み（10%）は ' + fmtNum(Math.round(v * 1.1)) + ' 円、消費税は ' + fmtNum(Math.round(v * .1)) + ' 円です。', { intent: 'calc' }); }
  const u = N.understand(text, clf);
  return dispatch(text, u.s, u.list, opts, null, u.alts);
}

async function dispatch(text, s, list, opts, lead, alts) {
  const question = /(とは(\?|$|何|なに)|って(何|なに|なん)|(何|なに)ですか|方法|しかた|仕方|やり方|やりかた|どうやって|どうすれば|できますか|できる\?|教えて|おしえて|\?$|ですか$|なぜ|なんで|どうして)/.test(s);
  const top = list[0];
  lastTurn = { text, alts: alts && alts.length ? alts : list.map(x => x.id) };
  const ctxOf = cand => ({ raw: text, s, m: cand.m });
  /* 使い方の質問が先に立つ場合（「保管庫って何？」は、保管庫を開く命令ではない） */
  const kb = searchKb(text, 3);
  if (question && kb[0] && kb[0].e.strong && kb[0].s > 20) return kbReply(kb, text);
  const explain = question && /(とは(\?|$|何|なに)|って(何|なに|なん)|(何|なに)ですか|方法|しかた|仕方|やり方|やりかた|どうやって|どうすれば|なぜ|なんで|どうして|の(使い方|つかいかた))/.test(s);
  /* 知識の台帳の点数：関係のある質問は 16 以上、関係のない質問は 8 以下に分かれる（実測）。その間に線を引く */
  if (explain && kb[0] && kb[0].s > 11 && !(top && top.rule >= .92 && /^(advise|power\.status|help|time|date|who)/.test(top.id))) return kbReply(kb, text);

  for (const cand of list.slice(0, 3)) {
    if (cand.score < .46) break;
    lastTurn.intent = cand.id;
    if (PLAN[cand.id]) {
      const pl = PLAN[cand.id](ctxOf(cand)); if (!pl) continue;
      if (pl.reply) return pl.reply;
      if (pl.need) { pending = { kind: 'slot', intent: cand.id, text }; return R(pl.q, { actions: (pl.chips || []).map(ch => say(ch, ch)) }); }
      if (opts && opts.noActions) return R('アプリからの依頼では、操作はできません。');
      if (pl.confirm) { pending = { kind: 'confirm', run: () => run([pl]) }; return R(pl.confirm, { actions: [say('はい', 'はい'), say('やめる', 'やめる')] }); }
      const r = await run([pl], lead || pl.lead); r.intent = cand.id; return r;
    }
    if (INFO[cand.id]) { const r = await INFO[cand.id](ctxOf(cand)); if (r) { if (r.llmPrompt) return askLLM(r.llmPrompt, text, opts, r.lead, true); r.intent = cand.id; if (lead) r.text = lead + '\n' + r.text; return r; } }
  }
  /* 使い方の質問 */
  if (kb[0] && kb[0].s > (question ? 11 : 14)) return kbReply(kb, text);
  /* 覚えていることから */
  const mem = (reg.get('ai.memory') || []).filter(mm => N.terms(text).filter(t => t.length > 1 && normJa(mm.text).includes(t)).length >= 2);
  if (mem.length && question && !(llm && llm.usable())) return R('覚えていることでは：' + mem.slice(0, 3).map(mm => '「' + mm.text + '」').join(''));
  /* 言語モデル */
  if (llm && llm.usable()) return askLLM(text, text, opts);
  /* わからない */
  const guess = list.filter(x => x.score > .2).slice(0, 3).map(x => ({ id: x.id, label: N.INTENT_NAMES[x.id] || x.id }));
  if (guess.length) { pending = { kind: 'choose', text, options: guess }; return R('すみません、よくわかりませんでした。もしかして、次のどれかですか？', { unknown: true, actions: guess.map(g => say(g.label, g.label)).concat([say('どれでもない', 'やめる')]) }); }
  return R('すみません、その質問にはまだ答えられません。\nOS の操作・使い方・電池や動作の診断・計算・メモ・タイマーはできます。自由な質問には、言語モデルを入れると答えられます。', { unknown: true, followups: ['できることは？'], actions: [act('言語モデルについて', 'app.open', { app: 'settings', args: { page: 'ai' } }), act('ヘルプでさがす', 'app.open', { app: 'help', args: { q: text } })] });
}
function kbReply(kb, text) {
  const e = kb[0].e; const more = kb.slice(1).filter(x => x.s > kb[0].s * .55).map(x => x.e);
  return R('**' + e.title + '**\n\n' + e.body, { md: true, intent: 'kb', kbId: e.id, actions: [...(e.actions || []), act('ヘルプで読む', 'app.open', { app: 'help', args: { id: e.id } })], followups: more.map(x => x.title) });
}
async function askLLM(prompt, userText, opts, lead, raw) {
  const ctx = searchKb(userText, 3).filter(x => x.s > 3).map(x => '【' + x.e.title + '】' + x.e.body.replace(/\*\*/g, '').slice(0, 420));
  const d = new Date(), b = X.power.battery, mem = (reg.get('ai.memory') || []).slice(-8).map(mm => mm.text);
  const system = 'あなたは XEVARIX（NGX と ISHIDA Production が作った、アプリの形をした OS）の中で動く AI アシスタントです。この端末の中だけで動いています。日本語で、短く、ていねいに答えてください。わからないことは、わからないと言ってください。XEVARIX の機能について、下の資料に無いことを作り出さないでください。\n'
    + 'いま: ' + fmtDate(d, true) + ' ' + fmtClock(d) + '。使う人: ' + X.session.user.name + ' さん。電力モード: ' + X.power.info().name + (b ? '・電池 ' + Math.round(b.level * 100) + '%' : '') + '。\n'
    + (mem.length ? '使う人について覚えていること: ' + mem.join(' / ') + '\n' : '') + (ctx.length && !raw ? '資料:\n' + ctx.join('\n') + '\n' : '');
  const turns = raw ? [] : hist.slice(-6).filter(h => h.text && h.text.length < 600).map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text }));
  try {
    const out = await llm.generate({ system, turns, prompt, onToken: opts && opts.onToken });
    return R((lead ? lead + '\n' : '') + (out || '（返事を作れませんでした）'), { engine: 'llm', md: true, intent: 'chat' });
  } catch (e) { log.warn('ai', '言語モデルの失敗: ' + e.message); return R('言語モデルで答えを作れませんでした（' + e.message + '）。中核だけで続けます。', { err: true }); }
}

export async function init(ctx) {
  X = ctx; reg = X.reg; kv = X.session.db.kv;
  try { hist = reg.get('ai.keep') ? ((await kv.get('ai.history')) || []) : []; } catch { hist = []; }
  const saveHist = debounce(() => { if (reg.get('ai.keep')) kv.put(hist.slice(-80), 'ai.history').catch(() => {}); }, 1200);
  X.ai = {
    async ask(text, opts = {}) {
      if (!reg.get('ai.enabled') && !opts.force) return R('AI はオフになっています。設定 → AI でオンにできます。', { actions: [act('設定を開く', 'app.open', { app: 'settings', args: { page: 'ai' } })] });
      const t0 = performance.now(); bus.emit('ai:busy', true);
      let r;
      try { r = await handle(text, opts); } catch (e) { log.error('ai', e.message); r = R('すみません、途中で失敗しました（' + e.message + '）。', { err: true }); }
      finally { bus.emit('ai:busy', false); }
      r.text = casual(r.text); r.ms = Math.round(performance.now() - t0);
      if (!opts.silent) { hist.push({ role: 'user', text: String(text), t: Date.now() }, { role: 'ai', text: r.text, t: Date.now(), engine: r.engine, md: !!r.md }); if (hist.length > 120) hist.splice(0, hist.length - 120); saveHist(); }
      return r;
    },
    history: () => hist,
    async clear() { hist = []; pending = null; lastTurn = null; await kv.del('ai.history').catch(() => {}); bus.emit('ai:clear', null); },
    async resetLearning() { learned = []; clf = null; await kv.del('ai.model').catch(() => {}); await kv.del('ai.learned').catch(() => {}); },
    forget(id) { reg.update('ai.memory', l => (l || []).filter(m => m.id !== id)); },
    suggestions, searchKb, understand: async t => N.understand(t, await ensureClf()),
    llm: { info: () => ({ provider: 'none', model: '', state: 'off', progress: 0 }), providers: async () => [], enable: async () => { throw new Error('言語モデルのしくみを読みこめませんでした'); }, disable() {}, purge: async () => 0 },
  };
  /* 言語モデルと声は、別の部品（読みこめなくても中核は動く） */
  try { const m = await import('./llm.js'); llm = m.makeLLM(X); X.ai.llm = llm; } catch (e) { log.warn('ai', '言語モデルの部品を読みこめません: ' + e.message); }
  try { const m = await import('./voice.js'); X.voice = m.makeVoice(X); X.act.voice = () => X.voice.info(); } catch (e) { log.warn('ai', '声の部品を読みこめません: ' + e.message); }
  /* 手が空いたときに、言い回しの学習をすませておく */
  (window.requestIdleCallback || (f => setTimeout(f, 1500)))(() => ensureClf().catch(() => {}), { timeout: 4000 });
}

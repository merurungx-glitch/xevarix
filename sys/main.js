/* XEVARIX — 起動（ここが入口）
   ① 保存領域 → ② ユーザー（はじめての設定・ログイン）→ ③ 中核（ファイル・アプリ・窓・電力・計測・通知・プロセス）
   → ④ 画面（バー・ドック・ホーム）→ ⑤ 追加のしくみ（AI・サービス・パネルなど）
   ⑤ は1つずつ読みこむ。どれかが読みこめなくても、残りで起動する（動作ログに理由を残す）。 */

import { OS, bus, log, logs, ENV, uptime } from './core.js';
import { boot, persistent } from './db.js';
import { session } from './session.js';
import { fs } from './fs.js';
import { apps } from './apps.js';
import { wm } from './wm.js';
import { proc } from './proc.js';
import { power } from './power.js';
import { perf } from './perf.js';
import { theme } from './theme.js';
import { notify } from './notify.js';
import { sys } from './sysc.js';
import { security } from './security.js';
import { registerCalls } from './calls.js';
import { makeSDK } from './sdk.js';
import { initUI, toast, sound, haptic, closeAllLayers, confirmBox, alertBox } from './shell/ui.js';
import { initDesktop, editHome } from './shell/desktop.js';
import './shell/install.js';     // ホーム画面に追加の案内（#install）。はじめての設定・ロック画面の上にも出す
import { showLock } from './shell/lock.js';
import { runOOBE } from './shell/oobe.js';

const OPTIONAL = [
  ['サービス（時計・利用時間・ルーティン）', './services.js'],
  ['パネル（コントロールセンター・通知）', './shell/panels.js'],
  ['検索', './shell/search.js'],
  ['ファイルえらび', './shell/picker.js'],
  ['AI', '../ai/core.js'],
  ['AI の画面', './shell/aipanel.js'],
  ['ウィジェット', './shell/widgets.js'],
  ['引きつぎ・復元', './backup.js'],
  ['アカウントと同期', './cloud.js'],
  ['更新', './update.js'],
];

const bootEl = document.getElementById('xvx-boot');
function step(p, msg) {
  const bar = document.getElementById('xvx-boot-bar'), m = document.getElementById('xvx-boot-msg');
  if (bar) bar.style.width = Math.round(p * 100) + '%';
  if (m && msg) m.textContent = msg;
}
function hideBoot() { if (bootEl && !bootEl.classList.contains('done')) { bootEl.classList.add('done'); setTimeout(() => bootEl.remove(), 600); } }

let X = null, locking = false;

async function lockNow() {
  if (locking || !X) return;
  locking = true; closeAllLayers(); wm.setLocked(true); sound.play('lock'); bus.emit('lock:on', null);
  /* ロック中は、うしろの画面（窓の中身をふくむ）に、押すことも打つこともできないようにする */
  const behind = ['xvx-stage', 'xvx-desk', 'xvx-dock', 'xvx-status', 'xvx-layer', 'xvx-toasts'].map(id => document.getElementById(id)).filter(Boolean);
  behind.forEach(el => { el.inert = true; });
  try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); window.focus(); } catch { /* 続ける */ }
  const me = session.getUser(session.user.id) || session.user;
  await showLock({
    current: me, h24: X.reg.get('ui.clock24'), autoBio: true,
    info: lockInfo,
    onSwitch: session.users().length > 1 ? () => X.act.switchUser(true) : null,
  });
  behind.forEach(el => { el.inert = false; });
  wm.setLocked(false); locking = false; sound.play('unlock'); bus.emit('lock:off', null);
  X.services && X.services.activity();
}
function lockInfo() {
  const out = []; const b = power.battery;
  if (b) out.push([b.charging ? 'plug' : 'battery', Math.round(b.level * 100) + '%' + (b.charging ? '・充電中' : '')]);
  if (X) { const n = notify.unread; if (n) out.push(['bell', '通知 ' + n + ' 件']); if (power.mode !== 'balanced') out.push([power.info().icon, power.info().name]); }
  return out;
}

/* XEVARIX は XEVORA アカウントでのみ使う。
   ・ロック画面の「XEVORA でログイン」… 表示名＋4桁 PIN を確かめて、そのアカウントのユーザーを選ぶ（この端末に無ければ作る）
   ・つないでいない／ログアウトしたユーザー … loginGate でログインしてから入る（この端末のデータはそのまま） */
const ready = u => !!(u && u.xv && !u.xv.out);
async function accountLogin() {
  const { askLogin } = await import('./cloud.js');
  const r = await askLogin({ text: 'XEVORA アカウントの表示名と4桁の PIN を入れてください。この端末にそのアカウントのユーザーが無ければ作り、配置と設定をクラウドから戻します。' });
  if (!r) return null;
  const have = session.users().find(u => u.xv && u.xv.uid === r.uid);
  if (have) { if (have.xv.out) session.updateUser(have.id, { xv: { ...have.xv, out: undefined, at: Date.now() } }); await session.sysreg.flush(); return session.getUser(have.id); }
  const u = session.createUser({ name: r.name, color: Math.floor(Math.random() * 6) });
  session.updateUser(u.id, { xv: { uid: r.uid, name: r.name, at: Date.now(), fresh: 1 } });
  await session.sysreg.flush();
  return session.getUser(u.id);
}
async function loginGate(u) {
  const { askLogin } = await import('./cloud.js');
  for (;;) {
    const r = await askLogin({
      text: u.xv ? '「' + u.name + '」はログアウトしています。XEVORA アカウント「' + u.xv.name + '」の4桁の PIN を入れてください。'
        : '「' + u.name + '」は、まだ XEVORA アカウントにつながっていません。XEVARIX は XEVORA アカウントで使います。ログインすると、この端末のデータのまま続けられます。',
      onlyUid: u.xv ? u.xv.uid : null, name: u.xv ? u.xv.name : '' });
    if (!r) return false;
    const other = session.users().find(x => x.id !== u.id && x.xv && x.xv.uid === r.uid);
    if (other) { await alertBox('このアカウントは、この端末にあります', 'この端末の「' + other.name + '」が、このアカウントです。ユーザーを切りかえて使ってください。'); return false; }
    session.updateUser(u.id, { xv: u.xv ? { ...u.xv, out: undefined, at: Date.now() } : { uid: r.uid, name: r.name, at: Date.now(), ask: 1 } });
    await session.sysreg.flush();
    return true;
  }
}

function onKey(e) {
  if (locking || !X) return false;
  const k = (e.key || '').toLowerCase(), ca = e.ctrlKey && e.altKey, mod = e.ctrlKey || e.metaKey;
  let hit = true;
  if (mod && !e.altKey && !e.shiftKey && (k === 'k' || e.code === 'Space')) X.act.search();
  else if (e.altKey && !e.ctrlKey && k === '`') wm.cycle(1);
  else if (ca) {
    const w = wm.active();
    if (k === 'a') X.act.ai();
    else if (k === 'l') X.act.lock();
    else if (k === 'd') wm.home();
    else if (k === 'o') wm.overview();
    else if (k === 'tab') wm.cycle(e.shiftKey ? -1 : 1);
    else if (k === 'w') { if (w) wm.requestClose(w.id); }
    else if (k === 'm') proc.spawn('monitor');
    else if (k === 't') proc.spawn('terminal');
    else if (k === 'f') sys.tryCall('sys.fullscreen', { on: !(document.fullscreenElement || document.webkitFullscreenElement) });
    else if (k === 'arrowleft') { if (w) wm.snap(w.id, 'left'); }
    else if (k === 'arrowright') { if (w) wm.snap(w.id, 'right'); }
    else if (k === 'arrowup') { if (w) wm.snap(w.id, 'max'); }
    else if (k === 'arrowdown') { if (w) { if (w.state === 'normal') wm.minimize(w.id); else wm.snap(w.id, 'normal'); } }
    else hit = false;
  } else hit = false;
  if (hit) { e.preventDefault(); e.stopPropagation(); }
  return hit;
}

function openFile(node) {
  const k = fs.kindOf(node);
  if (k === 'dir') return proc.spawn('files', { dir: node.id });
  if (k === 'text') return node.parent === fs.DIRS.notes ? proc.spawn('notes', { id: node.id }) : proc.spawn('editor', { id: node.id });
  return proc.spawn('viewer', { id: node.id });
}

async function main() {
  const t0 = performance.now();
  const fails = boot.get('fails', 0); boot.set('fails', fails + 1);
  const safe = new URLSearchParams(location.search).has('safe') || fails >= 2;
  addEventListener('error', e => log.error('shell', (e && e.message) || 'エラー', e && e.filename ? e.filename + ':' + e.lineno : ''));
  addEventListener('unhandledrejection', e => log.error('shell', '処理の失敗: ' + ((e.reason && e.reason.message) || e.reason || '')));
  log.info('boot', OS.name + ' ' + OS.version + '（' + OS.build + '）を起動' + (safe ? '・セーフモード' : ''));

  step(.12, '保存領域を開いています');
  await session.initSystem();
  const sysreg = session.sysreg;

  /* ── ユーザー ── */
  step(.25, 'ユーザーを確認しています');
  let uidv = null, oobe = null, waited = 0;      // waited = 人の入力を待っていた時間（起動時間に数えない）
  const users = session.users();
  const w0 = performance.now();
  if (!users.length) {
    hideBoot(); boot.set('fails', 0);      // ここまで来れば「起動に失敗」ではない（設定の途中で閉じてもセーフモードにしない）
    oobe = await runOOBE({ first: true });
    const u = session.createUser(oobe);
    if (oobe.xv) session.updateUser(u.id, { xv: oobe.xv });
    if (oobe.pass && security.ok) session.updateUser(u.id, { pass: await security.makePass(oobe.pass) });
    if (oobe.bench) { sysreg.set('device.bench', oobe.bench); sysreg.set('device.tier', oobe.bench.tier); }
    sysreg.set('oobe.done', true); uidv = u.id;
  } else {
    const last = session.getUser(sysreg.get('lastUser')) || users[0];
    const pick = boot.get('pick'); boot.set('pick', null);
    if (users.length === 1 && !last.pass && !pick && ready(last)) uidv = last.id;
    else { hideBoot(); boot.set('fails', 0); const r = await showLock({ users, current: last, allowGuest: false, skipCover: !!pick, autoBio: !pick, info: lockInfo, onAccount: accountLogin }); uidv = r.user.id; boot.set('fails', 1); }
    /* つないでいない・ログアウトしたユーザーは、ここで XEVORA アカウントにログインしてから（やめたらユーザーをえらび直す） */
    if (!ready(session.getUser(uidv))) {
      hideBoot(); boot.set('fails', 0);
      if (!await loginGate(session.getUser(uidv))) { boot.set('pick', true); location.reload(); return; }
      boot.set('fails', 1);
    }
  }
  if (oobe || !bootEl || bootEl.classList.contains('done')) waited = performance.now() - w0;
  step(.4, 'ユーザーの設定を読んでいます');
  await session.start(uidv);
  const reg = session.reg;
  if (oobe) { reg.set('ui.theme', oobe.theme); reg.set('ui.accent', oobe.accent); }

  /* ── 中核 ── */
  step(.5, 'ファイルシステム');
  await fs.init(session.db);
  apps.init(reg);
  X = {
    OS, bus, log, logs, ENV, uptime, safe, persistent, session, reg, sysreg, fs, apps, wm, proc, power, perf, theme, notify, sys, security,
    sound, haptic, act: {}, failed: [],
  };
  window.XVX = X;
  step(.58, '窓と電力の管理');
  wm.init({ stage: document.getElementById('xvx-stage'), reg });
  await power.init({ reg, kv: session.db.kv, tier: sysreg.get('device.tier'), procs: () => proc.list() });
  perf.init({ procs: () => proc.list(), fgPid: () => { const p = proc.fg(); return p ? p.pid : 0; }, onPressure: s => power.setPressure(s) });
  await notify.init({ reg, kv: session.db.kv, quiet: () => power.game || !!(X.services && X.services.focusOn()) });
  proc.init({
    onKey: e => onKey(e),
    onActivity: () => X.services && X.services.activity(),
    onFrame: p => { if (p.app.kind === 'system') { try { theme.applyTo(p.frame.contentDocument); } catch { /* 閉じた窓 */ } } },
    canOpen: app => (X.services ? X.services.canOpen(app) : null),
    ensureLocal: app => apps.ensureLocal(app),
    extraAllow: app => { const d = (reg.get('apps.device') || {})[app.id] || {}; return (d.camera ? '; camera' : '') + (d.mic ? '; microphone' : '') + (d.geo ? '; geolocation' : ''); },
  });
  proc.setPolicy(power.policy());
  bus.on('power:mode', e => {
    proc.setPolicy(power.policy());
    if (!e.silent && e.reason) toast(power.info().desc, 'info', '「' + power.info().name + '」に切りかえました（' + e.reason + '）');
  });
  bus.on('power:state', () => proc.setPolicy(power.policy()));
  theme.init({ reg, power, docs: () => proc.docs(), fs });
  initUI({ reg, apps, sys });
  registerCalls(X);

  /* ── 画面 ── */
  step(.7, '画面を組み立てています');
  X.act = {
    lock: lockNow,
    search: () => (X.search ? X.search.open() : import('./shell/desktop.js').then(m => m.toggleLauncher())),
    control: () => X.panels && X.panels.control(),
    notifications: () => X.panels && X.panels.notifications(),
    ai: (text) => (X.aipanel ? X.aipanel.toggle(text) : toast('AI を読みこめませんでした。動作ログを確認してください。', 'warn')),
    openFile,
    editHome: () => editHome(),
    pickFile: async () => null,
    restart: async () => { try { await power.flush(); await session.end(); } finally { location.reload(); } },
    switchUser: async skipAsk => {
      if (!skipAsk && proc.list().length && !await confirmBox('ユーザーを切りかえる', '開いているアプリはすべて閉じます。よろしいですか？', { ok: '切りかえる' })) return;
      boot.set('pick', true); X.act.restart();
    },
    safeBoot: async () => { try { await session.end(); } finally { location.href = location.pathname + '?safe=1'; } },
    /* もう1人足す＝ほかの XEVORA アカウントでログインする（この端末にユーザーを作る） */
    addUser: async () => {
      const before = new Set(session.users().map(u => u.id));
      const u = await accountLogin(); if (!u) return null;
      await sysreg.flush();
      if (before.has(u.id)) toast('この端末の「' + u.name + '」が、このアカウントです。', 'info');
      else toast('「ユーザーを切りかえる」から入れます。', 'ok', u.name + ' を足しました');
      return u;
    },
    /* XEVARIX のデータだけをすべて消す（同じサイトにある、ほかのアプリのデータには触らない） */
    wipeAll: async () => {
      const ids = ['guest', ...session.users().map(u => u.id)];
      try { for (const p of proc.list()) proc.kill(p.pid, 'force'); } catch { /* 続ける */ }
      const drop = name => new Promise(res => { try { const r = indexedDB.deleteDatabase(name); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch { res(); } });
      try { session.db && session.db._db && session.db._db.close(); session.sys && session.sys._db && session.sys._db.close(); } catch { /* 続ける */ }
      for (const id of ids) await drop('xevarix-u-' + id);
      await drop('xevarix-sys');
      try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('xvx.')) localStorage.removeItem(k); } } catch { /* 続ける */ }
      try { if (window.caches) for (const k of await caches.keys()) if (k.startsWith('xvx-')) await caches.delete(k); } catch { /* 続ける */ }
      location.href = location.pathname;
    },
  };
  X.sdk = makeSDK(X);
  const desk = initDesktop(X);
  X.home = desk.home;
  addEventListener('keydown', onKey, true);
  for (const ev of ['pointerdown', 'keydown', 'wheel']) addEventListener(ev, () => X.services && X.services.activity(), { capture: true, passive: true });

  /* ── 追加のしくみ ── */
  let i = 0;
  for (const [name, path] of OPTIONAL) {
    step(.74 + .22 * (++i / OPTIONAL.length), name);
    try { const m = await import(path); if (m.init) await m.init(X); }
    catch (e) { X.failed.push(name); log.error('boot', name + ' を読みこめません: ' + ((e && e.message) || e)); }
  }

  /* ── 起動完了 ── */
  boot.set('fails', 0);
  const ms = Math.round(performance.now() - t0 - waited);
  sysreg.set('boot.lastMs', ms);
  window.__xvxBooted = true;
  step(1, '完了'); hideBoot();
  log.info('boot', '起動完了（' + ms + ' ms）');
  bus.emit('boot:done', { ms, safe });
  if (!persistent) notify.send({ title: '保存できない状態で動いています', body: 'このブラウザでは保存領域を開けませんでした。閉じると設定とファイルが消えます（プライベート表示では保存できません）。', kind: 'warn', urgent: true });
  if (safe) notify.send({ title: 'セーフモードで起動しました', body: '前の起動が終わらなかったため、自動で動くもの（ルーティンなど）を止めています。設定を確かめて、再起動してください。', kind: 'warn', urgent: true });
  if (X.failed.length) notify.send({ title: '一部のしくみを読みこめませんでした', body: X.failed.join('・') + '\nシステムモニターの「ログ」に理由が出ています。', kind: 'warn', urgent: true });
  if (session.isGuest) toast('ゲストで使っています。終わると、設定とファイルは消えます。', 'info', 'ゲスト');

  /* 端末の測定が「仮」（画面が裏にあるときに測った）なら、見えるようになってから測り直す */
  const b0 = sysreg.get('device.bench');
  if (b0 && b0.rough) {
    const redo = async () => {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', redo);
      await new Promise(r => setTimeout(r, 5000));
      if (document.hidden) { document.addEventListener('visibilitychange', redo); return; }
      const nb = await perf.benchmark();
      if (!nb.rough) { sysreg.set('device.bench', nb); sysreg.set('device.tier', nb.tier); power.setTier(nb.tier); theme.apply(); log.info('perf', '端末の測定をやり直しました（' + nb.score + ' 点）'); }
      else document.addEventListener('visibilitychange', redo);
    };
    document.addEventListener('visibilitychange', redo); redo();
  }

  /* ストアの一覧（通信できるときだけ）。はじめての起動では、おすすめをホームに入れる */
  apps.loadCatalog().then(async c => {
    if (oobe && oobe.preinstall && !oobe.xv && c.featured.length) { for (const id of c.featured) apps.install(id); }
    if (X.cloud) await X.cloud.whenReady();      // アカウントの同期を先に受けとる（ほかの端末で済ませた XEVARION の配置を上書きしない）
    /* 1.1.0：XEVARION の本体とパートナーのウィジェットをホームへ。すでに使っている人にも1回だけ（印は mig.xevarion） */
    if (!reg.get('mig.xevarion') && c.apps.some(a => a.id === 'xevarion')) {
      if (!apps.isInstalled('xevarion')) apps.install('xevarion');
      if (X.home) X.home.placeXevarion();
      reg.set('mig.xevarion', Date.now());
    }
  }).catch(e => log.warn('apps', 'ストアの一覧の後始末: ' + ((e && e.message) || e)));
  if (oobe) setTimeout(() => notify.send({ app: 'ai', title: 'ようこそ、' + session.user.name + ' さん', body: 'まん中の XEVARIX のロゴを押すと、AI に話しかけられます。「できること」と聞いてみてください。', actions: [{ label: 'AI を開く', call: { name: 'app.open', args: { app: 'ai' } } }] }), 1200);
  if (reg.get('session.restore') && !safe) for (const id of (reg.get('session.apps') || []).slice(0, 4)) proc.spawn(id);
  bus.on('proc:spawn', () => reg.set('session.apps', [...new Set(proc.list().map(p => p.appId))]));
  bus.on('proc:exit', () => reg.set('session.apps', [...new Set(proc.list().map(p => p.appId))]));
  addEventListener('pagehide', () => { try { reg.flush(); sysreg.flush(); } catch { /* 閉じる途中 */ } });
}

main().catch(e => {
  console.error(e);
  window.__xvxBootError = (e && (e.stack || e.message)) || String(e);
  const m = document.getElementById('xvx-boot-msg'); if (m) m.textContent = '起動の途中で止まりました';
  document.dispatchEvent(new Event('xvx-boot-failed'));
});

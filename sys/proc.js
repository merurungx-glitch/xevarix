/* XEVARIX — プロセス管理
   アプリ1つ＝プロセス1つ（中身は iframe）。状態は
     starting → running ⇄ suspended（休止）→ hibernated（深い休止＝中身を下ろしてメモリを空ける）
   同じサイトの中身には「計器（probe）」を差しこむ。これで
     ・描画の回数（fps）と、描画にかかった時間を測る
     ・フレーム数に上限をかける（電力モード）
     ・休止のあいだ、描画・タイマー・音を止める
   ができる。アプリ側のファイルは1文字も変えない（動いている窓の中でだけ効く）。 */

import { bus, log } from './core.js';
import { apps } from './apps.js';
import { wm } from './wm.js';

const procs = new Map();
let seq = 100, fgPid = 0, ctx = {}, sampleTimer = 0, lastSample = 0;
let policy = { fpsCap: 0, bgFps: 30, suspendAfter: 300000, maxSuspended: 8, sample: 2000 };
const ALLOW = 'fullscreen; autoplay; clipboard-write; gamepad; screen-wake-lock; accelerometer; gyroscope';

function sameOrigin(frame) { try { return !!(frame.contentWindow && frame.contentWindow.document); } catch { return false; } }

/* ── 計器 ── */
function installProbe(p) {
  const w = p.frame.contentWindow;
  if (!w || p.app.probe === false) return false;
  let doc; try { doc = w.document; } catch { return false; }
  if (w.__xvxProbe) { p.probe = w.__xvxProbe; return true; }
  if (!doc || w.location.href === 'about:blank') return false;
  const st = { cap: 0, frozen: false, q: new Map(), seq: 0, frames: 0, work: 0, last: 0, pending: false, held: new Map(), audio: new Set(), media: new Set(), paused: [], resumed: [], errors: 0 };
  try {
    const raf = w.requestAnimationFrame.bind(w);
    const tick = t => {
      st.pending = false;
      if (st.frozen) return;
      if (st.cap > 0 && t - st.last < 1000 / st.cap - 3) { if (st.q.size) { st.pending = true; raf(tick); } return; }
      st.last = t;
      if (!st.q.size) return;
      const cbs = [...st.q.values()]; st.q.clear();
      const t0 = performance.now();
      for (const cb of cbs) { try { cb(t); } catch (e) { st.errors++; w.setTimeout(() => { throw e; }, 0); } }
      st.work += performance.now() - t0; st.frames++;
    };
    st.kick = () => { if (!st.pending && !st.frozen && st.q.size) { st.pending = true; raf(tick); } };
    w.requestAnimationFrame = cb => { const id = ++st.seq; st.q.set(id, cb); st.kick(); return id; };
    w.cancelAnimationFrame = id => { st.q.delete(id); };

    /* タイマー：休止中に時間が来たものは、再開まで預かる */
    const sT = w.setTimeout.bind(w), cT = w.clearTimeout.bind(w), sI = w.setInterval.bind(w);
    w.setTimeout = function (fn, d, ...a) {
      if (typeof fn !== 'function') return sT(fn, d, ...a);
      const id = sT(function () { if (st.frozen) { st.held.set(id, () => fn.apply(this, a)); return; } fn.apply(this, a); }, d);
      return id;
    };
    w.clearTimeout = id => { st.held.delete(id); cT(id); };
    w.setInterval = function (fn, d, ...a) {
      if (typeof fn !== 'function') return sI(fn, d, ...a);
      return sI(function () { if (!st.frozen) fn.apply(this, a); }, d);
    };

    /* 音：あとで止められるように、作られた AudioContext と Audio を覚えておく */
    for (const K of ['AudioContext', 'webkitAudioContext']) {
      const C = w[K]; if (typeof C !== 'function') continue;
      try { w[K] = class extends C { constructor(...a) { super(...a); st.audio.add(this); } }; } catch { /* 包めない端末はそのまま */ }
    }
    if (typeof w.Audio === 'function') {
      const A = w.Audio;
      const Wrapped = function (src) { const el = src === undefined ? new A() : new A(src); st.media.add(el); return el; };
      Wrapped.prototype = A.prototype; w.Audio = Wrapped;
    }

    st.freeze = () => {
      if (st.frozen) return; st.frozen = true; st.paused = []; st.resumed = [];
      try {
        const els = new Set([...doc.querySelectorAll('audio,video'), ...st.media]);
        for (const m of els) if (!m.paused && !m.ended) { m.pause(); st.paused.push(m); }
        for (const c of st.audio) if (c.state === 'running') { c.suspend().catch(() => {}); st.resumed.push(c); }
      } catch { /* 音の後始末に失敗しても休止は続ける */ }
    };
    st.thaw = () => {
      if (!st.frozen) return; st.frozen = false;
      for (const c of st.resumed) { try { c.resume().catch(() => {}); } catch { /* 閉じられた */ } }
      for (const m of st.paused) { try { m.play().catch(() => {}); } catch { /* 消された */ } }
      st.paused = []; st.resumed = [];
      const held = [...st.held.values()]; st.held.clear();
      for (const f of held) { try { f(); } catch (e) { st.errors++; } }
      st.kick();
    };

    w.addEventListener('pointerdown', () => { const win = wm.byPid(p.pid); if (win && wm.activeId !== win.id) wm.focus(win.id, { keep: true }); ctx.onActivity && ctx.onActivity(); }, true);
    w.addEventListener('keydown', e => { ctx.onActivity && ctx.onActivity(); ctx.onKey && ctx.onKey(e, p); }, true);
    w.addEventListener('error', e => { st.errors++; p.stats.errors++; log.warn('app:' + p.appId, (e && e.message) || 'エラー'); });
    w.addEventListener('unhandledrejection', e => { st.errors++; p.stats.errors++; log.warn('app:' + p.appId, '処理の失敗: ' + ((e.reason && e.reason.message) || e.reason || '')); });
    Object.defineProperty(w, '__xvxProbe', { value: st, configurable: true });
    p.probe = st;
    return true;
  } catch (e) {
    log.warn('proc', p.app.name + ' に計器を付けられません: ' + e.message);
    return false;
  }
}

function visOf(p) { return wm.visibility(p.win); }
function emit(type, p, extra) { bus.emit('proc:' + type, { pid: p.pid, appId: p.appId, state: p.state, ...extra }); }

function applyPolicy() {
  const now = Date.now(); let suspended = [];
  for (const p of procs.values()) {
    const vis = visOf(p);
    if (vis !== 'hidden') {
      p.hiddenAt = 0;
      if (p.state === 'suspended' || p.state === 'hibernated') proc.resume(p.pid);
    } else if (!p.hiddenAt) p.hiddenAt = now;
    if (p.probe) p.probe.cap = vis === 'focus' ? policy.fpsCap : vis === 'visible' ? (policy.bgFps || policy.fpsCap) : 4;
    clearTimeout(p.suspendT); p.suspendT = 0;
    if (vis === 'hidden' && p.state === 'running' && !p.app.bg && !p.keepAlive && isFinite(policy.suspendAfter)) {
      const wait = Math.max(0, p.hiddenAt + policy.suspendAfter - now);
      p.suspendT = setTimeout(() => { p.suspendT = 0; if (visOf(p) === 'hidden' && p.state === 'running') proc.suspend(p.pid); }, wait);
    }
    if (p.state === 'suspended') suspended.push(p);
  }
  /* 休止が多すぎたら、古いものから深い休止へ */
  if (suspended.length > policy.maxSuspended) {
    suspended.sort((a, b) => a.lastActive - b.lastActive);
    for (const p of suspended.slice(0, suspended.length - policy.maxSuspended)) proc.hibernate(p.pid);
  }
}

function sample() {
  const now = performance.now(); const dt = now - lastSample; lastSample = now;
  if (dt <= 0 || dt > 60000) return;
  const fg = procs.get(fgPid);
  for (const p of procs.values()) {
    const st = p.probe, s = p.stats;
    if (st && p.state === 'running') {
      s.fps = Math.round((st.frames - (p._f || 0)) / dt * 1000);
      s.load = Math.min(1, (st.work - (p._w || 0)) / dt);
      p._f = st.frames; p._w = st.work;
    } else { s.fps = 0; s.load = 0; }
    const lt = s.longMs - (p._l || 0); p._l = s.longMs;
    const vis = visOf(p);
    const units = (s.load * dt) + lt + (vis === 'hidden' ? 0 : dt * (vis === 'focus' ? .02 : .008));
    s.energy += units; p._du = units;
    if (p === fg && vis === 'focus') p.fgMs += dt;
  }
  bus.emit('proc:tick', { dt, fg: fg && visOf(fg) === 'focus' ? fg.appId : null });
}
function startSampler() { clearInterval(sampleTimer); lastSample = performance.now(); sampleTimer = setInterval(sample, policy.sample || 2000); }

export const proc = {
  init(c) {
    ctx = c || {};
    bus.on('wm:focus', e => {
      fgPid = e ? e.pid : 0;
      const p = procs.get(fgPid); if (p) p.lastActive = Date.now();
      applyPolicy();
    });
    bus.on('wm:state', () => applyPolicy());
    bus.on('wm:close-request', e => proc.kill(e.pid));
    bus.on('perf:longtask', e => { const p = procs.get(e.pid); if (p) p.stats.longMs += e.dur; });
    startSampler();
    return proc;
  },
  list() { return [...procs.values()]; },
  get(pid) { return procs.get(pid) || null; },
  byApp(appId) { for (const p of procs.values()) if (p.appId === appId) return p; return null; },
  byWindow(w) { for (const p of procs.values()) { try { if (p.frame.contentWindow === w) return p; } catch { /* 別サイト */ } } return null; },
  fg() { return procs.get(fgPid) || null; },
  get policy() { return policy; },

  setPolicy(pol) {
    const old = policy.sample; policy = { ...policy, ...pol };
    if (policy.sample !== old) startSampler();
    applyPolicy();
  },

  spawn(appId, args) {
    const app = apps.get(appId);
    if (!app) { bus.emit('shell:toast', { text: 'アプリが見つかりません', kind: 'warn' }); return null; }
    if (app.kind === 'action') { bus.emit('shell:action', { action: app.action, args }); return null; }
    if (ctx.canOpen) { const why = ctx.canOpen(app); if (why) { bus.emit('shell:toast', { text: why, kind: 'warn' }); return null; } }
    if (!app.multi) {
      const ex = proc.byApp(appId);
      if (ex) { wm.focus(ex.win); if (args && ex.onArgs) { try { ex.onArgs(args); } catch (e) { log.warn('proc', e.message); } } return ex; }
    }
    const pid = ++seq;
    const url = app.kind === 'system' ? 'apps/app.html?id=' + encodeURIComponent(app.id) + '&pid=' + pid : app.url;
    const frame = document.createElement('iframe');
    frame.name = frame.id = 'xvx-p' + pid; frame.title = app.name;
    frame.setAttribute('allow', ALLOW + (ctx.extraAllow ? ctx.extraAllow(app) : ''));
    frame.setAttribute('allowfullscreen', '');
    const p = {
      pid, appId, app, frame, url, args: args || null, state: 'starting', started: Date.now(), lastActive: Date.now(),
      fgMs: 0, hiddenAt: 0, probe: null, sameOrigin: false,
      stats: { fps: 0, load: 0, longMs: 0, energy: 0, errors: 0 },
    };
    procs.set(pid, p);
    frame.addEventListener('load', () => proc._loaded(p));
    p.win = wm.open({ pid, app, title: app.name, frame, multi: app.multi });
    if (app.local && app.local.port && ctx.ensureLocal) {
      /* この PC で動くアプリ：サーバーが動いてから読む（そのあいだは窓の札が見える）。起動できなければ窓を閉じて理由を出す */
      ctx.ensureLocal(app).then(err => { if (!procs.has(pid)) return; if (err) { bus.emit('shell:toast', { text: err, kind: 'warn' }); proc.kill(pid, 'force'); } else frame.src = url; });
    } else frame.src = url;
    /* 中身のスクリプトが走りきる前に計器を付けたいので、読みこみ中から短い間かくで試す */
    let tries = 0;
    p.earlyT = setInterval(() => { if (++tries > 80 || p.probe || !procs.has(pid)) { clearInterval(p.earlyT); return; } if (sameOrigin(frame)) installProbe(p); }, 25);
    emit('spawn', p); log.info('proc', app.name + ' を起動（pid ' + pid + '）');
    applyPolicy();
    return p;
  },

  _loaded(p) {
    if (!procs.has(p.pid) || p.state === 'hibernated') return;
    clearInterval(p.earlyT);
    p.sameOrigin = sameOrigin(p.frame);
    p.probe = null;
    if (p.sameOrigin) { installProbe(p); ctx.onFrame && ctx.onFrame(p); }
    if (p.state === 'starting') { p.state = 'running'; p.readyAt = Date.now(); emit('ready', p, { ms: p.readyAt - p.started }); }
    applyPolicy();
  },

  kill(pid, reason) {
    const p = procs.get(pid); if (!p) return false;
    /* reason が無い＝ふつうに閉じる（アプリは false を返して「保存しますか？」を出せる）。
       reason がある＝強制（force・self・undo）。アプリには理由を渡すので、確認を出さずに片づけだけする */
    if (p.onClose) { try { if (p.onClose(reason || '') === false && !reason) return false; } catch (e) { log.warn('proc', e.message); } }
    clearTimeout(p.suspendT); clearInterval(p.earlyT);
    procs.delete(pid);
    try { p.frame.src = 'about:blank'; } catch { /* すでに無い */ }
    wm.destroy(p.win);
    p.state = 'dead'; emit('exit', p, { reason: reason || 'close', fgMs: p.fgMs });
    log.info('proc', p.app.name + ' を終了（pid ' + pid + '）');
    return true;
  },
  killApp(appId) { let n = 0; for (const p of [...procs.values()]) if (p.appId === appId && proc.kill(p.pid, 'force')) n++; return n; },

  suspend(pid) {
    const p = procs.get(pid); if (!p || p.state !== 'running') return false;
    if (p.probe && p.probe.freeze) p.probe.freeze();
    p.frame.classList.add('frozen');
    p.state = 'suspended'; p.suspendedAt = Date.now(); emit('state', p);
    return true;
  },
  resume(pid) {
    const p = procs.get(pid); if (!p) return false;
    if (p.state === 'hibernated') {
      p.state = 'starting'; p.started = Date.now(); p.frame.classList.remove('frozen', 'gone');
      p.frame.src = p.url; emit('state', p); return true;
    }
    if (p.state !== 'suspended') return false;
    p.frame.classList.remove('frozen');
    if (p.probe && p.probe.thaw) p.probe.thaw();
    p.state = 'running'; emit('state', p);
    return true;
  },
  hibernate(pid) {
    const p = procs.get(pid); if (!p || p.state === 'hibernated' || p.state === 'starting') return false;
    if (visOf(p) !== 'hidden') return false;
    p.state = 'hibernated'; p.probe = null; p.frame.classList.add('gone');
    try { p.frame.src = 'about:blank'; } catch { /* すでに無い */ }
    emit('state', p); log.info('proc', p.app.name + ' を深い休止に');
    return true;
  },
  /* いま裏にあるものを全部休止（ブースト） */
  suspendBackground() {
    let n = 0;
    for (const p of procs.values()) if (p.state === 'running' && visOf(p) === 'hidden' && !p.app.bg && proc.suspend(p.pid)) n++;
    applyPolicy(); return n;
  },
  refresh() { applyPolicy(); },
  /* 同じサイトの中身の document（見た目の切りかえを配るため） */
  docs() { const out = []; for (const p of procs.values()) { if (p.app.kind !== 'system') continue; try { const d = p.frame.contentDocument; if (d) out.push(d); } catch { /* 別サイト */ } } return out; },
};

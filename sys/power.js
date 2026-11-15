/* XEVARIX — 電力の管理
   ・4つの電力モード。モードは「方針（policy）」の束で、プロセス管理と見た目がそれに従う。
   ・自動の切りかえ：電池残量・時間帯・端末の負荷。自動は「節約する方向」にしか動かさない。
   ・電池の記録と、アプリごとの消費の見積もり（どのアプリが動いていたかで按分）。
   ★ iPhone・iPad の Safari は電池残量を読めない（Battery API が無い）。そのときは手動と時間帯で動く。 */

import { bus, log } from './core.js';
import { dateKey, debounce, clamp } from './util.js';

export const MODES = {
  max:      { id: 'max',      name: 'ハイパフォーマンス', short: '高性能', icon: 'gauge', fpsCap: 0,  bgFps: 0,  suspendAfter: Infinity, maxSuspended: 12, fx: 'auto',    live: true,  sample: 1500, dim: 0,   desc: '動きも効果も最大。裏のアプリも止めません。電池は早く減ります。' },
  balanced: { id: 'balanced', name: 'バランス',           short: 'バランス', icon: 'orbit', fpsCap: 0,  bgFps: 30, suspendAfter: 300000,   maxSuspended: 8,  fx: 'auto',    live: true,  sample: 2000, dim: 0,   desc: '手前のアプリは全力、見えているだけの窓は控えめ、裏のアプリは5分で休止。' },
  saver:    { id: 'saver',    name: '省電力',             short: '省電力', icon: 'leaf',  fpsCap: 30, bgFps: 10, suspendAfter: 20000,    maxSuspended: 4,  fx: 'reduced', live: false, sample: 4000, dim: 0,   desc: '描画を毎秒30回までに。ぼかしと動きを減らし、裏のアプリは20秒で休止。' },
  ultra:    { id: 'ultra',    name: '超省電力',           short: '超省電力', icon: 'moon', fpsCap: 20, bgFps: 5,  suspendAfter: 0,        maxSuspended: 2,  fx: 'minimal', live: false, sample: 8000, dim: .22, desc: '描画を毎秒20回までに。効果を切り、画面を少し暗くし、裏のアプリはすぐ休止。' },
};
export const MODE_ORDER = ['max', 'balanced', 'saver', 'ultra'];
const rank = m => MODE_ORDER.indexOf(m);
const FX_ORDER = ['minimal', 'reduced', 'full'];
const lowerFx = (a, b) => FX_ORDER[Math.min(FX_ORDER.indexOf(a), FX_ORDER.indexOf(b))];

let reg = null, kv = null, tier = 'A';
let battery = null, bm = null, eff = 'balanced', reason = '', game = false, pressure = 'nominal', hold = 0, idleDim = 0;
let wake = null, wakeWanted = false;
let today = null, lastLevel = null, sinceLevel = {}, sampleT = 0;
const saveToday = debounce(() => { if (kv && today) kv.put(today, 'pw:' + today.day).catch(() => {}); }, 4000);

function freshDay(day) { return { day, samples: [], apps: {}, modeMs: { max: 0, balanced: 0, saver: 0, ultra: 0 }, saved: 0, lastT: Date.now() }; }
function ensureDay() {
  const day = dateKey();
  if (!today || today.day !== day) { if (today) kv && kv.put(today, 'pw:' + today.day).catch(() => {}); today = freshDay(day); }
  return today;
}
function inWindow(from, to, d = new Date()) {
  const m = d.getHours() * 60 + d.getMinutes(); const p = s => { const [a, b] = String(s).split(':').map(Number); return (a || 0) * 60 + (b || 0); };
  const f = p(from), t = p(to);
  return f <= t ? (m >= f && m < t) : (m >= f || m < t);
}

function evaluate(silent) {
  const base = reg.get('power.mode'); let m = MODES[base] ? base : 'balanced', why = '';
  if (reg.get('power.auto') && Date.now() > hold) {
    if (battery && !battery.charging) {
      const lv = battery.level * 100;
      if (lv <= reg.get('power.autoUltraAt')) { if (rank(m) < rank('ultra')) { m = 'ultra'; why = '電池が ' + Math.round(lv) + '% になったため'; } }
      else if (lv <= reg.get('power.autoSaverAt')) { if (rank(m) < rank('saver')) { m = 'saver'; why = '電池が ' + Math.round(lv) + '% になったため'; } }
    }
    const sc = reg.get('power.schedule');
    if (sc && sc.on && MODES[sc.mode] && inWindow(sc.from, sc.to) && rank(m) < rank(sc.mode)) { m = sc.mode; why = '時間帯の設定（' + sc.from + '〜' + sc.to + '）'; }
    if ((pressure === 'serious' || pressure === 'critical') && m === 'max') { m = 'balanced'; why = '端末の負荷が高いため'; }
  }
  if (game && reg.get('perf.gameAuto') && m !== 'ultra' && m !== 'max') { m = 'max'; why = 'ゲームモード'; }
  const changed = m !== eff; const old = eff;
  eff = m; reason = why;
  if (changed) {
    log.info('power', '電力モード: ' + MODES[old].name + ' → ' + MODES[m].name + (why ? '（' + why + '）' : ''));
    bus.emit('power:mode', { mode: m, old, base, reason: why, silent: !!silent });
    sample(true);
  }
  bus.emit('power:state', null);
  return m;
}

function sample(force) {
  const d = ensureDay(); const now = Date.now();
  const dt = clamp(now - d.lastT, 0, 120000); d.lastT = now;
  d.modeMs[eff] = (d.modeMs[eff] || 0) + dt;
  const lv = battery ? Math.round(battery.level * 100) : null;
  const last = d.samples[d.samples.length - 1];
  if (force || !last || now - last.t >= 55000 || (last.lv !== lv)) {
    d.samples.push({ t: now, lv, ch: battery && battery.charging ? 1 : 0, m: eff });
    if (d.samples.length > 1600) d.samples.splice(0, 200);
  }
  /* 電池が減ったぶんを、その間に動いていたアプリへ按分する */
  if (lv != null) {
    if (lastLevel != null && lv < lastLevel && battery && !battery.charging) {
      const drop = lastLevel - lv; let sum = 0; for (const k in sinceLevel) sum += sinceLevel[k];
      if (sum > 0) for (const k in sinceLevel) { const a = d.apps[k] || (d.apps[k] = { e: 0, fg: 0, b: 0 }); a.b = (a.b || 0) + drop * sinceLevel[k] / sum; }
      sinceLevel = {};
    } else if (lastLevel != null && lv > lastLevel) sinceLevel = {};
    lastLevel = lv;
  }
  saveToday();
}

async function setupBattery() {
  if (!navigator.getBattery) return;
  try {
    bm = await navigator.getBattery();
    const read = () => { battery = { level: bm.level, charging: bm.charging, chargingTime: bm.chargingTime, dischargingTime: bm.dischargingTime }; };
    read(); lastLevel = Math.round(bm.level * 100);
    const on = kind => () => {
      const was = battery && battery.charging; read();
      if (kind === 'ch' && was !== battery.charging) { hold = 0; bus.emit('power:charging', { charging: battery.charging, level: battery.level }); }
      sample(false); evaluate();
    };
    bm.addEventListener('levelchange', on('lv')); bm.addEventListener('chargingchange', on('ch'));
    bm.addEventListener('dischargingtimechange', on('t')); bm.addEventListener('chargingtimechange', on('t'));
  } catch (e) { log.info('power', '電池の状態を読めません: ' + e.message); }
}

async function applyWake() {
  if (!('wakeLock' in navigator)) return;
  try {
    if (wakeWanted && !wake && !document.hidden) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; bus.emit('power:state', null); }); }
    else if (!wakeWanted && wake) { await wake.release(); wake = null; }
  } catch (e) { wake = null; }
  bus.emit('power:state', null);
}

export const power = {
  MODES, MODE_ORDER,
  async init(o) {
    reg = o.reg; kv = o.kv; tier = o.tier || 'A';
    const day = dateKey();
    try { today = (await kv.get('pw:' + day)) || freshDay(day); } catch { today = freshDay(day); }
    today.lastT = Date.now();
    await setupBattery();
    eff = reg.get('power.mode'); if (!MODES[eff]) eff = 'balanced';
    evaluate(true);
    reg.watch('power.', () => evaluate());
    reg.watch('perf.gameAuto', () => evaluate());
    bus.on('proc:tick', e => {
      const d = ensureDay();
      for (const p of o.procs()) {
        const u = p._du || 0; if (!u) continue;
        const a = d.apps[p.appId] || (d.apps[p.appId] = { e: 0, fg: 0, b: 0 });
        a.e += u; sinceLevel[p.appId] = (sinceLevel[p.appId] || 0) + u;
      }
      if (e.fg) { const a = d.apps[e.fg] || (d.apps[e.fg] = { e: 0, fg: 0, b: 0 }); a.fg += e.dt; }
      /* 画面と本体のぶん（何も開いていなくてもかかる） */
      const sys = d.apps._system || (d.apps._system = { e: 0, fg: 0, b: 0 });
      const su = document.hidden ? 0 : e.dt * .012; sys.e += su; sinceLevel._system = (sinceLevel._system || 0) + su;
      /* フレームの上限で減らせた描画の時間の見積もり（表示用） */
      if (MODES[eff].fpsCap && e.fg) d.saved += e.dt * (1 - MODES[eff].fpsCap / 60) * .5;
    });
    clearInterval(sampleT); sampleT = setInterval(() => { sample(false); evaluate(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { applyWake(); evaluate(); } else sample(true); });
    addEventListener('pagehide', () => { if (kv && today) kv.put(today, 'pw:' + today.day).catch(() => {}); });
    /* 古い記録を消す（14日ぶん残す） */
    kv.keys().then(keys => { const lim = dateKey(new Date(Date.now() - 14 * 864e5)); for (const k of keys) if (typeof k === 'string' && k.startsWith('pw:') && k.slice(3) < lim) kv.del(k); }).catch(() => {});
    return power;
  },

  get mode() { return eff; },
  get base() { return reg.get('power.mode'); },
  get reason() { return reason; },
  get battery() { return battery; },
  get hasBattery() { return !!bm; },
  get pressure() { return pressure; },
  get game() { return game; },
  get wake() { return wakeWanted; },
  get wakeSupported() { return 'wakeLock' in navigator; },
  info(m) { return MODES[m || eff]; },

  /* 手で選んだときは、30分は自動で上書きしない */
  setMode(m, by = 'user') {
    if (!MODES[m]) return false;
    if (by !== 'auto') hold = Date.now() + 30 * 60000;
    reg.set('power.mode', m);
    evaluate();
    return true;
  },
  setAuto(on) { reg.set('power.auto', !!on); if (on) hold = 0; evaluate(); },
  setGame(on) { if (game === !!on) return; game = !!on; evaluate(); bus.emit('power:game', game); },
  setPressure(s) { if (pressure === s) return; pressure = s; evaluate(); },
  setIdleDim(v) { if (idleDim === v) return; idleDim = v; bus.emit('power:state', null); },
  async setWake(on) { wakeWanted = !!on; await applyWake(); return !!wake || !wakeWanted; },

  /* いまの方針（プロセス管理・見た目に渡す） */
  policy() {
    const m = MODES[eff];
    const user = reg.get('ui.fx');
    const tierFx = { S: 'full', A: 'full', B: 'reduced', C: 'minimal' }[tier] || 'full';
    const baseFx = user && user !== 'auto' ? user : tierFx;
    const fx = m.fx === 'auto' ? baseFx : lowerFx(baseFx, m.fx);
    return { ...m, fx, live: m.live && fx === 'full' && !!reg.get('ui.wallLive'), dimTotal: clamp((reg.get('ui.dim') || 0) + m.dim + idleDim, 0, .85) };
  },
  setTier(t) { tier = t; bus.emit('power:state', null); },

  /* 1時間あたりの減り（%）。直近 45 分の、充電していない区間から */
  drainRate() {
    if (!today) return null;
    const now = Date.now(); const s = today.samples.filter(x => x.lv != null && now - x.t < 45 * 60000);
    let i = s.length - 1; while (i > 0 && !s[i - 1].ch && s[i - 1].lv >= s[i].lv) i--;
    const seg = s.slice(i); if (seg.length < 2 || seg[seg.length - 1].ch) return null;
    const hours = (seg[seg.length - 1].t - seg[0].t) / 3600000; if (hours < 0.08) return null;
    return Math.max(0, (seg[0].lv - seg[seg.length - 1].lv) / hours);
  },
  remainingMin() {
    if (!battery || battery.charging) return null;
    if (isFinite(battery.dischargingTime) && battery.dischargingTime > 0) return Math.round(battery.dischargingTime / 60);
    const r = power.drainRate(); return r ? Math.round(battery.level * 100 / r * 60) : null;
  },
  today() { return ensureDay(); },
  async history(days = 7) {
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const k = dateKey(new Date(Date.now() - i * 864e5));
      out.push(k === ensureDay().day ? today : ((await kv.get('pw:' + k).catch(() => null)) || freshDay(k)));
    }
    return out;
  },
  /* アプリごとの消費の割合（今日） */
  shares(nameOf) {
    const d = ensureDay(); let sum = 0; for (const k in d.apps) sum += d.apps[k].e;
    return Object.keys(d.apps).map(k => ({ id: k, name: k === '_system' ? '画面と本体' : (nameOf ? nameOf(k) : k), share: sum ? d.apps[k].e / sum : 0, batt: d.apps[k].b || 0, fg: d.apps[k].fg || 0 }))
      .filter(x => x.share > 0.002).sort((a, b) => b.share - a.share);
  },
  flush() { if (kv && today) return kv.put(today, 'pw:' + today.day).catch(() => {}); },
};

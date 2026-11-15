/* XEVARIX — パフォーマンスの計測
   ・端末の情報（コア数・メモリ・GPU・画面）と、使える機能の一覧
   ・なめらかさ（fps）… 見ている人がいるときだけ連続で測る（測ること自体が電気を使うため）
   ・処理の詰まり（50ms 以上つづいた処理）… どの窓で起きたかを仕分ける
   ・端末の負荷（Compute Pressure）・メモリ・保存容量・通信
   ・ベンチマーク … 端末の力を点数にして、効果の段階（full / reduced / minimal）を自動で決める */

import { bus, log, ENV } from './core.js';
import { sleep } from './util.js';
import { persistent } from './db.js';

let dev = null, watchers = 0, rafId = 0, fpsNow = 0, frameMs = 0, lastFrame = 0, acc = [], accT = 0;
let longCount = 0, longMs = 0, shellLongMs = 0, pressure = 'nominal';
const HIST = [], HIST_MAX = 180;
let ctx = {};

function loop(t) {
  rafId = requestAnimationFrame(loop);
  if (lastFrame) acc.push(t - lastFrame);
  lastFrame = t;
  if (t - accT >= 500) {
    if (acc.length) {
      const sum = acc.reduce((a, b) => a + b, 0);
      fpsNow = Math.round(1000 * acc.length / sum);
      const s = [...acc].sort((a, b) => a - b); frameMs = s[Math.min(s.length - 1, Math.floor(s.length * .95))];
    }
    acc = []; accT = t;
    bus.emit('perf:fps', { fps: fpsNow, p95: frameMs });
  }
}

function gpuName() {
  try {
    const c = document.createElement('canvas'); const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const r = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const lose = gl.getExtension('WEBGL_lose_context'); lose && lose.loseContext();
    return String(r || '').replace(/^ANGLE \((.*)\)$/, '$1').replace(/ Direct3D.*$/, '').replace(/, D3D.*$/, '');
  } catch { return ''; }
}
function browserName() {
  const ua = navigator.userAgent;
  const m = /Edg\/(\d+)/.exec(ua) || /OPR\/(\d+)/.exec(ua) || /Chrome\/(\d+)/.exec(ua) || /Firefox\/(\d+)/.exec(ua) || /Version\/(\d+).*Safari/.exec(ua);
  const n = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'ブラウザ';
  return n + (m ? ' ' + m[1] : '');
}
function osName() {
  if (ENV.iOS) return /iPad|Macintosh/.test(navigator.userAgent) ? 'iPadOS' : 'iOS';
  if (ENV.android) return 'Android';
  if (ENV.windows) return 'Windows';
  if (ENV.mac) return 'macOS';
  if (/CrOS/.test(navigator.userAgent)) return 'ChromeOS';
  if (/Linux/.test(navigator.userAgent)) return 'Linux';
  return (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '不明';
}

export const perf = {
  init(c) {
    ctx = c || {};
    /* 処理の詰まり。窓の中で起きたものは、その窓のプロセスへ仕分ける */
    try {
      const obs = new PerformanceObserver(list => {
        for (const e of list.getEntries()) {
          longCount++; longMs += e.duration;
          const a = e.attribution && e.attribution[0];
          const m = a && /^xvx-p(\d+)$/.exec(a.containerId || a.containerName || '');
          if (m) bus.emit('perf:longtask', { pid: Number(m[1]), dur: e.duration });
          else shellLongMs += e.duration;
        }
      });
      obs.observe({ type: 'longtask', buffered: true });
    } catch { /* Safari・Firefox は未対応。測れないだけで動作には関係しない */ }
    /* 端末の負荷（Chrome・Edge） */
    if ('PressureObserver' in window) {
      try {
        const po = new PressureObserver(recs => { const s = recs[recs.length - 1].state; if (s !== pressure) { pressure = s; bus.emit('perf:pressure', s); ctx.onPressure && ctx.onPressure(s); } });
        po.observe('cpu', { sampleInterval: 2000 }).catch(() => {});
      } catch { /* 使えない端末 */ }
    }
    bus.on('proc:tick', () => {
      const procs = ctx.procs ? ctx.procs() : []; let load = 0, fps = 0;
      for (const p of procs) { load += p.stats.load || 0; if (ctx.fgPid && p.pid === ctx.fgPid()) fps = p.stats.fps || 0; }
      const mem = perf.memory();
      HIST.push({ t: Date.now(), fps, load: Math.min(1, load), mem: mem ? mem.used : 0, n: procs.length, run: procs.filter(p => p.state === 'running').length });
      if (HIST.length > HIST_MAX) HIST.splice(0, HIST.length - HIST_MAX);
    });
    return perf;
  },

  device() {
    if (dev) return dev;
    const sr = window.screen || {};
    dev = {
      os: osName(), browser: browserName(), cores: navigator.hardwareConcurrency || null, memGB: navigator.deviceMemory || null,
      gpu: gpuName(), screen: (sr.width || innerWidth) + '×' + (sr.height || innerHeight), dpr: Math.round((devicePixelRatio || 1) * 100) / 100,
      touch: ENV.touch, standalone: ENV.standalone,
      features: {
        '保存（IndexedDB）': persistent,
        '電池残量の取得': !!navigator.getBattery,
        '端末の負荷の取得': 'PressureObserver' in window,
        '処理の詰まりの計測': (() => { try { return PerformanceObserver.supportedEntryTypes.includes('longtask'); } catch { return false; } })(),
        '画面を消さない': 'wakeLock' in navigator,
        '生体認証（WebAuthn）': !!window.PublicKeyCredential,
        'WebGPU（言語モデル用）': 'gpu' in navigator,
        'ブラウザ内蔵の AI': 'LanguageModel' in window,
        '音声の聞き取り': !!(window.SpeechRecognition || window.webkitSpeechRecognition),
        '読み上げ': 'speechSynthesis' in window,
        'オフライン（Service Worker）': 'serviceWorker' in navigator,
        '全画面表示': !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen),
      },
    };
    return dev;
  },

  get fps() { return fpsNow; },
  get p95() { return frameMs; },
  get pressure() { return pressure; },
  long() { return { count: longCount, ms: longMs, shellMs: shellLongMs }; },
  history() { return HIST; },

  /* 連続で測る（見ている人がいるあいだだけ）。戻り値を呼ぶと止まる */
  watch() {
    if (watchers++ === 0) { lastFrame = 0; acc = []; accT = performance.now(); rafId = requestAnimationFrame(loop); }
    let done = false;
    return () => { if (done) return; done = true; if (--watchers <= 0) { watchers = 0; cancelAnimationFrame(rafId); rafId = 0; } };
  },
  /* 短く測る */
  burst(ms = 400) {
    return new Promise(res => {
      const ts = []; let t0 = 0;
      const step = t => { if (!t0) t0 = t; ts.push(t); if (t - t0 < ms) requestAnimationFrame(step); else { const n = ts.length - 1; res(n > 0 ? Math.round(1000 * n / (ts[n] - ts[0])) : 0); } };
      requestAnimationFrame(step);
    });
  },

  memory() {
    const m = performance.memory;
    return m && m.usedJSHeapSize ? { used: m.usedJSHeapSize, total: m.totalJSHeapSize, limit: m.jsHeapSizeLimit } : null;
  },
  async storage() {
    try {
      const e = await navigator.storage.estimate();
      const p = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      return { usage: e.usage || 0, quota: e.quota || 0, persisted: p };
    } catch { return { usage: 0, quota: 0, persisted: false }; }
  },
  async persist() { try { return navigator.storage.persist ? await navigator.storage.persist() : false; } catch { return false; } },
  network() {
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return { online: navigator.onLine, type: c ? (c.effectiveType || c.type || '') : '', downlink: c ? c.downlink : null, rtt: c ? c.rtt : null, saveData: !!(c && c.saveData) };
  },

  /* ベンチマーク（1〜2秒）。基準＝2020年ごろの中位のノート PC がおよそ 1000 点 */
  async benchmark(onProgress) {
    const hiddenAtStart = document.hidden;
    const step = async (n, label) => { onProgress && onProgress(n, label); await sleep(40); };
    await step(.05, '計算の速さ');
    let t0 = performance.now(), x = 0;
    const a = new Float64Array(160000);
    for (let r = 0; r < 5; r++) { for (let i = 0; i < a.length; i++) { a[i] = Math.sin(i * .001 + r) * Math.sqrt(i + 1); x += a[i]; } a.sort(); }
    let s = ''; for (let i = 0; i < 40000; i++) s = (s + i.toString(36)).slice(-64);
    const cpuMs = performance.now() - t0 + (x === s.length ? 0 : 0);

    await step(.4, '画面の組み立て');
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px;contain:layout style;visibility:hidden';
    document.body.append(box);
    t0 = performance.now();
    for (let r = 0; r < 4; r++) {
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 700; i++) { const d = document.createElement('div'); d.style.cssText = 'display:inline-block;padding:3px 7px;margin:2px;border:1px solid #888;border-radius:6px;font-size:' + (11 + (i % 5)) + 'px'; d.textContent = 'XEVARIX ' + i; frag.append(d); }
      box.replaceChildren(frag); void box.offsetHeight;
    }
    const domMs = performance.now() - t0; box.remove();

    await step(.7, '描画の速さ');
    const cv = document.createElement('canvas'); cv.width = 640; cv.height = 400; const g = cv.getContext('2d');
    t0 = performance.now();
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 1800; i++) {
        const cx = (i * 37) % 640, cy = (i * 61) % 400, rad = 6 + (i % 22);
        const gr = g.createRadialGradient(cx, cy, 1, cx, cy, rad); gr.addColorStop(0, 'rgba(56,230,253,.8)'); gr.addColorStop(1, 'rgba(10,60,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rad, 0, 6.283); g.fill();
      }
      g.getImageData(0, 0, 1, 1);
    }
    const gfxMs = performance.now() - t0;

    await step(.9, '画面の速さ');
    /* 画面が裏にあると、ブラウザが描画を毎秒1回ほどに絞る。そのときの値は「仮」として、あとで測り直す */
    const hzRaw = document.hidden ? 0 : await Promise.race([perf.burst(350), sleep(1500).then(() => 0)]);
    const rough = hiddenAtStart || document.hidden || hzRaw < 20;
    const hz = hzRaw >= 20 ? hzRaw : null;
    const sc = (ref, ms) => Math.round(1000 * ref / Math.max(1, ms));
    const cpu = sc(perf.REF.cpu, cpuMs), dom = sc(perf.REF.dom, domMs), gfx = sc(perf.REF.gfx, gfxMs);
    const score = Math.round(Math.cbrt(cpu * dom * gfx));
    const tier = score >= 1500 ? 'S' : score >= 700 ? 'A' : score >= 330 ? 'B' : 'C';
    const out = { cpu, dom, gfx, score, tier, hz, rough, ms: { cpu: Math.round(cpuMs), dom: Math.round(domMs), gfx: Math.round(gfxMs) }, at: Date.now() };
    onProgress && onProgress(1, '完了');
    log.info('perf', 'ベンチマーク ' + score + ' 点（' + tier + '）', out);
    return out;
  },
  /* 基準の時間（ms）。この値のとき 1000 点 */
  REF: { cpu: 150, dom: 60, gfx: 70 },
  tierName(t) { return { S: 'とても速い', A: '速い', B: 'ふつう', C: 'ひかえめ' }[t] || '—'; },
};

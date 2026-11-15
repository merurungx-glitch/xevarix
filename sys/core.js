/* XEVARIX — 中核の共通部品（本体の窓だけが読む）: 版・イベントの連絡網・動作ログ */

export const OS = {
  name: 'XEVARIX',
  version: '1.2.0',
  build: '2026-11-15',
  codename: 'Aurora',
  by: 'NGX × ISHIDA Production',
};

/* ── 連絡網（bus）──  'power:mode' のように「分類:出来事」で流す。'power:*' で分類ごとに聞ける。 */
const listeners = new Map();
export const bus = {
  on(evt, fn) {
    let set = listeners.get(evt);
    if (!set) listeners.set(evt, set = new Set());
    set.add(fn);
    return () => set.delete(fn);
  },
  off(evt, fn) { listeners.get(evt)?.delete(fn); },
  once(evt, fn) { const off = bus.on(evt, (d, e) => { off(); fn(d, e); }); return off; },
  emit(evt, data) {
    const run = set => {
      if (!set || !set.size) return;
      for (const fn of [...set]) { try { fn(data, evt); } catch (e) { console.error('[bus] ' + evt, e); log.error('bus', evt + ': ' + (e && e.message)); } }
    };
    run(listeners.get(evt));
    const i = evt.indexOf(':');
    if (i > 0) run(listeners.get(evt.slice(0, i) + ':*'));
    run(listeners.get('*'));
  },
};

/* ── 動作ログ（メモリに直近 800 件。システムモニターとターミナルの log で見られる）── */
const LOG = [];
export function log(level, src, msg, data) {
  const e = { t: Date.now(), level, src, msg: String(msg), data };
  LOG.push(e);
  if (LOG.length > 800) LOG.splice(0, 200);
  if (level === 'error') console.error('[' + src + ']', msg, data ?? '');
  else if (level === 'warn') console.warn('[' + src + ']', msg, data ?? '');
  try { bus.emit('log', e); } catch { /* 連絡網の中の失敗でログ自体は止めない */ }
  return e;
}
log.info = (s, m, d) => log('info', s, m, d);
log.warn = (s, m, d) => log('warn', s, m, d);
log.error = (s, m, d) => log('error', s, m, d);
export const logs = () => LOG;

/* 起動してからの時間 */
const T0 = performance.now();
export const uptime = () => performance.now() - T0;

/* 端末の種類の見当（画面の形は wm が決める。ここは「何の上で動いているか」だけ） */
export const ENV = (() => {
  const ua = navigator.userAgent || '';
  const iOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  return {
    iOS,
    android: /Android/.test(ua),
    mac: /Macintosh/.test(ua) && !iOS,
    windows: /Windows/.test(ua),
    chromium: !!window.chrome || /Chrom(e|ium)|Edg\//.test(ua),
    safari: /Safari\//.test(ua) && !/Chrom(e|ium)|Edg\//.test(ua),
    firefox: /Firefox\//.test(ua),
    standalone,
    touch: navigator.maxTouchPoints > 0,
    dev: location.hostname === 'localhost' || location.hostname === '127.0.0.1',
  };
})();

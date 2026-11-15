/* XEVARIX — 見た目の切りかえ
   設定の台帳（ui.*）と電力の方針から、<html> の data-* を決めて配る。
   窓の中の標準アプリにも同じものを配る（色そのものは CSS だけが持つ）。 */

import { bus } from './core.js';

let reg = null, power = null, docsFn = null, fsApi = null, wallUrl = null, wallId = null;
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
export const WALLS = [
  { id: 'aurora', name: 'オーロラ', base: '#0142c9', light: false },
  { id: 'deep', name: 'ディープ', base: '#011866', light: false },
  { id: 'dawn', name: 'ドーン', base: '#1a8fe0', light: false },
  { id: 'mint', name: 'ミント', base: '#0a8f8a', light: false },
  { id: 'sky', name: 'スカイ', base: '#6fb6ff', light: true },
  { id: 'mono', name: '単色', base: '', light: false },
];
export const ACCENTS = [
  { id: 'cyan', name: 'シアン', color: '#38e6fd' }, { id: 'blue', name: 'ブルー', color: '#4d9bff' }, { id: 'lavender', name: 'ラベンダー', color: '#b39cff' },
  { id: 'mint', name: 'ミント', color: '#4ff0b8' }, { id: 'coral', name: 'コーラル', color: '#ff8f7a' }, { id: 'gold', name: 'ゴールド', color: '#ffd166' },
];

function attrs() {
  const t = reg.get('ui.theme');
  const pol = power ? power.policy() : { fx: 'full', live: false, dimTotal: 0 };
  return {
    theme: t === 'auto' ? (mq && !mq.matches ? 'light' : 'dark') : t,
    accent: reg.get('ui.accent'), fx: pol.fx, motion: reg.get('ui.motion') ? 'on' : 'off',
    contrast: reg.get('ui.contrast') ? 'high' : 'normal', icon: reg.get('ui.icon'), ts: reg.get('ui.textScale') || 1,
  };
}
function applyTo(doc, a = attrs()) {
  const r = doc.documentElement; if (!r) return;
  r.dataset.theme = a.theme; r.dataset.accent = a.accent; r.dataset.fx = a.fx; r.dataset.motion = a.motion;
  r.dataset.contrast = a.contrast; r.dataset.icon = a.icon; r.style.setProperty('--ts', a.ts);
}

async function applyWall() {
  const el = document.getElementById('xvx-wall'); if (!el) return;
  const id = reg.get('ui.wall'); const img = reg.get('ui.wallImage');
  const layer = el.querySelector('.wl');
  if (id === 'image' && img && fsApi) {
    if (wallId !== img) {
      try { const blob = await fsApi.readBlob(img); if (wallUrl) URL.revokeObjectURL(wallUrl); wallUrl = blob && blob.size ? URL.createObjectURL(blob) : null; wallId = wallUrl ? img : null; } catch { wallUrl = null; wallId = null; }
    }
  }
  if (id === 'image' && img && wallUrl) {
    el.dataset.wall = 'image'; layer.style.backgroundImage = 'url(' + wallUrl + ')';
    document.documentElement.style.setProperty('--wall-base', '#011866');
  } else {
    /* 壁紙にした画像が消されていたら、はじめの壁紙を出す（設定はそのまま。画像を戻せば元どおり） */
    const w = WALLS.find(x => x.id === id) || WALLS[0];
    el.dataset.wall = w.id; layer.style.backgroundImage = '';
    document.documentElement.style.setProperty('--wall-base', w.base || 'var(--bg)');
  }
  const pol = power ? power.policy() : { live: false };
  el.dataset.live = pol.live && id !== 'mono' && id !== 'image' ? '1' : '0';
}

export const theme = {
  WALLS, ACCENTS,
  init(o) {
    reg = o.reg; power = o.power; docsFn = o.docs; fsApi = o.fs;
    reg.watch('ui.', () => theme.apply());
    bus.on('power:mode', () => theme.apply());
    bus.on('power:state', () => theme.applyDim());
    mq && mq.addEventListener && mq.addEventListener('change', () => theme.apply());
    theme.apply();
    return theme;
  },
  attrs,
  applyTo,
  apply() {
    const a = attrs();
    applyTo(document, a);
    document.body.dataset.wgt = reg.get('ui.widgets') ? '1' : '0';
    if (docsFn) for (const d of docsFn()) { try { applyTo(d, a); } catch { /* 閉じた窓 */ } }
    applyWall(); theme.applyDim();
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = a.theme === 'light' ? '#dfe9ff' : '#01084d';
    bus.emit('theme:change', a);
  },
  applyDim() { const pol = power ? power.policy() : { dimTotal: 0 }; document.documentElement.style.setProperty('--dim', String(pol.dimTotal || 0)); },
  isDark() { return attrs().theme === 'dark'; },
};

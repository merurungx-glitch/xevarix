/* XEVARIX — アプリの台帳
   ・標準アプリ（system）… XEVARIX の中に入っている。消せない。
   ・ストアのアプリ（web）… NGX／ISHIDA Production のアプリを、配信中のページのまま窓で開く。
   ・自分で足した Web アプリ（custom）
   入れてあるアプリの名札は設定の台帳に写しを持つ（オフラインでもホームに並べられるように）。 */

import { bus, log } from './core.js';
import { normJa, uid } from './util.js';

let reg = null, catalog = null;

const sysApp = (id, name, glyph, tint, extra = {}) => ({ id, name, kind: 'system', icon: { glyph, tint, ink: extra.ink }, cat: 'system', ...extra });

export const SYSTEM_APPS = [
  sysApp('settings', '設定', 'settings', ['#8797c6', '#3a477c'], { win: { w: 880, h: 620, minW: 340, minH: 420 }, keys: ['せってい', 'settings', '環境設定', 'コントロールパネル'], desc: '見た目・電力・通知・セキュリティ・AI など、XEVARIX のすべての設定。' }),
  sysApp('files', 'ファイル', 'folder', ['#55b4ff', '#0a5cff'], { win: { w: 840, h: 560, minW: 340 }, keys: ['ふぁいる', 'files', 'フォルダ', 'エクスプローラー', 'finder'], desc: 'この端末の中のファイル置き場。フォルダ・ごみ箱・読みこみと書き出し。' }),
  sysApp('notes', 'メモ', 'note', ['#ffdb6e', '#ff9f1a'], { ink: '#3a2500', win: { w: 780, h: 560, minW: 320 }, keys: ['めも', 'notes', 'ノート', 'メモ帳'], desc: 'すぐ書けるメモ。チェックリスト・ピンどめ・検索。' }),
  sysApp('calc', '電卓', 'calc', ['#3ce6ca', '#0a96a4'], { ink: '#00252a', win: { w: 348, h: 540, minW: 300, minH: 440 }, keys: ['でんたく', 'calculator', '計算機'], desc: 'ふつうの計算と関数電卓、単位の変換。' }),
  sysApp('clock', '時計', 'clock', ['#8f91ff', '#4040dc'], { win: { w: 440, h: 580, minW: 320 }, keys: ['とけい', 'clock', 'アラーム', 'タイマー', 'ストップウォッチ'], desc: 'アラーム・タイマー・ストップウォッチ・世界時計。' }),
  sysApp('calendar', 'カレンダー', 'calendar', ['#ff8a8a', '#e0344f'], { win: { w: 780, h: 600, minW: 320 }, keys: ['かれんだー', 'calendar', '予定', 'スケジュール'], desc: '月の予定と祝日。予定の時刻にお知らせ。' }),
  sysApp('monitor', 'システムモニター', 'activity', ['#52e9a1', '#0ea76a'], { short: 'モニター', ink: '#002a17', win: { w: 860, h: 600, minW: 340 }, keys: ['もにたー', 'monitor', 'タスクマネージャー', 'プロセス', '負荷'], desc: '動いているアプリ・なめらかさ・メモリ・電力・保存容量をまとめて見る。' }),
  sysApp('terminal', 'ターミナル', 'terminal', ['#2e3960', '#0a0f2a'], { ink: '#38e6fd', win: { w: 740, h: 470, minW: 320 }, keys: ['たーみなる', 'terminal', 'コマンド', 'シェル', 'console'], desc: 'コマンドで XEVARIX を操作する。' }),
  sysApp('store', 'ストア', 'store', ['#38e6fd', '#0076fd'], { ink: '#001a3a', win: { w: 920, h: 640, minW: 340 }, keys: ['すとあ', 'store', 'アプリを入れる', 'アプリストア'], desc: 'NGX と ISHIDA Production のアプリを入れる・消す。' }),
  sysApp('vault', '保管庫', 'shieldCheck', ['#9db0d6', '#404f7c'], { win: { w: 740, h: 560, minW: 320 }, keys: ['ほかんこ', 'vault', '金庫', '暗号', '秘密'], desc: '暗号化して守るメモとファイル。' }),
  sysApp('routines', 'ルーティン', 'repeat', ['#c98fff', '#6a3de8'], { win: { w: 800, h: 600, minW: 320 }, keys: ['るーてぃん', 'routine', '自動化', 'オートメーション', 'ショートカット'], desc: '「毎朝8時に」「電池が20%になったら」などの自動化。' }),
  sysApp('viewer', 'ビューア', 'image', ['#ff9bcd', '#e0457f'], { multi: true, win: { w: 780, h: 580, minW: 300 }, keys: ['びゅーあ', 'viewer', '画像', '写真', '動画', 'プレーヤー'], desc: '画像・音楽・動画・PDF を開く。' }),
  sysApp('editor', 'エディタ', 'code', ['#7fd9ff', '#2b7fe0'], { ink: '#00203f', multi: true, win: { w: 780, h: 580, minW: 300 }, keys: ['えでぃた', 'editor', 'テキスト', '文字', 'コード'], desc: '文字のファイルを編集する。' }),
  sysApp('help', 'ヘルプ', 'book', ['#66e6d4', '#1d8fb0'], { ink: '#00252a', win: { w: 800, h: 600, minW: 320 }, keys: ['へるぷ', 'help', '使い方', 'ガイド', '説明書'], desc: 'XEVARIX の使い方と、開発者向けの案内。' }),
  { id: 'ai', name: 'AI', kind: 'action', action: 'ai', icon: { glyph: 'sparkle', tint: ['#a589fb', '#38e6fd'] }, cat: 'system', keys: ['えーあい', 'ai', 'アシスタント', '人工知能'], desc: '端末の中だけで動く XEVARIX の AI。' },
];
const SYS = new Map(SYSTEM_APPS.map(a => [a.id, a]));
export const CATS = { system: '標準', learn: '学ぶ', game: 'あそぶ', social: 'つながる', info: '情報・ツール', shop: '店舗・公式', other: 'そのほか' };

/* XEVARION のアプリと絵の場所。
   ・手元の開発（localhost など）… となりの ../xevarion/（tools/serve.py が出す）
   ・公開したあと … XEVARION の公開先（site）のアドレス。
     XEVARIX を XEVARION と同じアカウントに置けば同じオリジンのまま。別のアカウントや別のサービスに置いても、アプリは開けて絵も出る */
const DEV_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$|\.(localhost|test)$/i;
export function catalogBase(raw, loc = location) { return raw && raw.site && !DEV_HOST.test(loc.hostname) ? raw.site : ((raw && raw.base) || ''); }

function resolveWeb(a, base) {
  const own = !!a.own;      // 場所を XEVARIX から数える（ほかのフォルダのアプリ・この PC のアプリ）
  const abs = u => (!u ? u : (/^(https?:)?\/\//.test(u) || u.startsWith('/') || own ? u : base + u));
  return {
    id: a.id, name: a.name, full: a.full || a.name, kind: 'web', cat: a.cat || 'other', sub: a.sub || '', desc: a.desc || '',
    url: abs(a.url), icon: a.img ? { img: abs(a.img) } : { letter: (a.name || '?').slice(0, 1), tint: a.tint || ['#5a6cc0', '#27306a'] },
    game: !!a.game, bg: !!a.bg, beta: !!a.beta, by: a.by || '', keys: a.keys || [], win: a.win || { w: 440, h: 780, minW: 320, minH: 420 },
    probe: a.probe !== false && !(a.local && a.local.port), perms: a.perms || [],
    local: a.local || null, own,
  };
}
/* この PC だけのアプリ（AniReview・PlayCut・CITY-RAIL）は、手元の XEVARIX（tools/serve.py）で開いているときだけ使える */
export const canUse = a => !(a && a.local) || DEV_HOST.test(location.hostname);

export const apps = {
  CATS,
  init(registry) { reg = registry; return apps; },

  get(id) {
    if (SYS.has(id)) return SYS.get(id);
    const web = (reg.get('apps.web') || {})[id]; if (web) return web;
    const cus = (reg.get('apps.custom') || []).find(a => a.id === id); if (cus) return cus;
    if (catalog) { const c = catalog.apps.find(a => a.id === id); if (c) return c; }
    return null;
  },
  system() { return SYSTEM_APPS; },
  /* ホーム・ランチャーに並べるもの（標準＋入れたもの） */
  installed() {
    const hidden = new Set(reg.get('apps.hidden') || []);
    const web = Object.values(reg.get('apps.web') || {});
    const cus = reg.get('apps.custom') || [];
    return [...SYSTEM_APPS, ...web, ...cus].filter(a => !hidden.has(a.id));
  },
  isInstalled(id) { return SYS.has(id) || !!(reg.get('apps.web') || {})[id] || (reg.get('apps.custom') || []).some(a => a.id === id); },

  async loadCatalog(force) {
    if (catalog && !force) return catalog;
    let raw = null;
    try {
      const r = await fetch('store/catalog.json', { cache: 'no-cache' });
      if (r.ok) { raw = await r.json(); reg.set('store.cache', raw); }
    } catch (e) { log.info('apps', 'ストアの一覧を取りにいけません（オフライン）'); }
    if (!raw) raw = reg.get('store.cache') || { base: '', apps: [] };
    const base = catalogBase(raw);
    catalog = { version: raw.version || '', base, site: raw.site || '', featured: raw.featured || [], apps: (raw.apps || []).map(a => resolveWeb(a, base)), xevarion: raw.xevarion || null };
    /* 入れてあるアプリの名札を、新しい一覧の内容で写し直す */
    const web = reg.get('apps.web') || {}; let dirty = false;
    for (const a of catalog.apps) if (web[a.id] && JSON.stringify(web[a.id]) !== JSON.stringify(a)) { web[a.id] = a; dirty = true; }
    if (dirty) { reg.set('apps.web', web); bus.emit('apps:change', null); }
    return catalog;
  },
  catalogNow() { return catalog; },
  canUse,
  /* この PC で動くアプリ（AniReview・PlayCut）：サーバーが止まっていれば、手元のサーバー（tools/serve.py）に起動を頼む。
     開いてよければ null、だめなら理由の文を返す */
  async ensureLocal(app) {
    const port = app && app.local && app.local.port; if (!port) return null;
    /* 手元では、手元のサーバー（tools/serve.py）に聞く（止まっているポートを直接たたくと、コンソールにエラーが出るため）。聞けなければ直接たしかめる */
    const ask = async what => { try { const r = await fetch('/__apps/' + what + '?id=' + encodeURIComponent(app.local.server), { method: what === 'start' ? 'POST' : 'GET', headers: { 'X-XVX': '1' }, cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; } };
    const direct = async () => { try { await fetch('http://localhost:' + port + '/', { mode: 'no-cors', cache: 'no-store' }); return true; } catch { return false; } };
    const dev = DEV_HOST.test(location.hostname);
    const st0 = dev ? await ask('status') : null;
    const up = st0 ? async () => { const s = await ask('status'); return !!(s && s.up); } : direct;
    if (st0 ? st0.up : await up()) return null;
    if (!dev || !st0) return app.name + ' は、この PC の中だけで動くアプリです。その PC で ' + app.full + ' の start.bat を実行してから開いてください。';
    bus.emit('shell:toast', { text: app.full + ' のサーバーを起動しています…', kind: 'info' });
    const r = await ask('start');
    if (!r || !r.ok) return (r && r.error) || app.full + ' のサーバーを起動できませんでした。' + app.full + ' のフォルダの start.bat を実行してください。';
    for (let i = 0; i < 60; i++) { await new Promise(res => setTimeout(res, 500)); if (await up()) return null; }
    return app.full + ' のサーバーが起動しませんでした。start.bat で起動して、エラーが出ていないか確かめてください。';
  },

  install(id) {
    const c = catalog && catalog.apps.find(a => a.id === id); if (!c) return false;
    reg.update('apps.web', w => { w = w || {}; w[id] = c; return w; });
    bus.emit('apps:change', { id, type: 'install' }); log.info('apps', c.name + ' を入れました');
    return true;
  },
  uninstall(id) {
    if (SYS.has(id)) return false;
    reg.update('apps.web', w => { w = w || {}; delete w[id]; return w; });
    reg.update('apps.custom', l => (l || []).filter(a => a.id !== id));
    reg.update('dock.pins', l => (l || []).filter(x => x !== id));
    bus.emit('apps:change', { id, type: 'uninstall' });
    return true;
  },
  addCustom({ name, url, tint }) {
    name = String(name || '').trim().slice(0, 40); url = String(url || '').trim();
    if (!name || !/^https?:\/\//i.test(url)) throw new Error('名前と、http から始まるアドレスを入れてください');
    const a = { id: uid('c'), name, full: name, kind: 'web', custom: true, cat: 'other', url, sub: new URL(url).hostname, desc: '', icon: { letter: name.slice(0, 1), tint: tint || ['#5a6cc0', '#27306a'] }, win: { w: 480, h: 760, minW: 320, minH: 420 }, probe: true, keys: [] };
    reg.update('apps.custom', l => [...(l || []), a]);
    bus.emit('apps:change', { id: a.id, type: 'install' });
    return a;
  },
  setHidden(id, on) { reg.update('apps.hidden', l => { l = (l || []).filter(x => x !== id); if (on) l.push(id); return l; }); bus.emit('apps:change', { id }); },

  /* 言葉からアプリをさがす（AI・検索用）。いちばん近いものと、近さ（0〜1）を返す */
  find(text, pool) {
    const q = normJa(text).replace(/\s+/g, ''); if (!q) return null;
    let best = null, bs = 0;
    for (const a of (pool || apps.installed())) {
      const names = [a.name, a.full, a.short, ...(a.keys || [])].filter(Boolean).map(s => normJa(s).replace(/\s+/g, ''));
      for (const n of names) {
        let s = 0;
        if (n === q) s = 1;
        else if (q.includes(n) && n.length >= 2) s = .9 - Math.max(0, .15 - n.length * .03);
        else if (n.includes(q) && q.length >= 2) s = .6 + .3 * (q.length / n.length);
        if (s > bs) { bs = s; best = a; }
      }
    }
    return best ? { app: best, score: bs } : null;
  },
};

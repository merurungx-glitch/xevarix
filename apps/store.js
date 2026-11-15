/* XEVARIX 標準アプリ — ストア（NGX と ISHIDA Production のアプリを入れる・外す。自分で Web アプリを足す） */

import { h, fill, btn, ibtn, empty, badge, note, icon, appTile, normJa } from './kit.js';

const CSS = `.s-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.s-card{display:grid;grid-template-columns:54px minmax(0,1fr);gap:12px;align-items:center;padding:12px;border-radius:var(--r-m);background:var(--surface-2);border:1px solid var(--stroke);text-align:left;color:var(--text);font:inherit}
.s-card:hover{background:var(--surface-3)} .s-card .xa-tile{width:54px;height:54px}
.s-card b{display:block;font-weight:600;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.s-card small{display:block;color:var(--text-2);font-size:.75rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.s-card .s-act{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;gap:8px}
.s-hero{display:grid;grid-template-columns:96px minmax(0,1fr);gap:16px;align-items:center;padding:18px;border-radius:var(--r-l);background:linear-gradient(135deg,var(--acc-soft),var(--surface-2));border:1px solid var(--stroke)}
.s-hero .xa-tile{width:96px;height:96px} .s-hero h2{margin:0;font-size:1.3rem} .s-hero p{margin:4px 0 10px;color:var(--text-2);font-size:.875rem}
.s-desc{font-size:.9rem;line-height:1.8;color:var(--text);white-space:pre-wrap;user-select:text;-webkit-user-select:text}
.s-chips{display:flex;gap:6px;overflow:auto hidden;scrollbar-width:none;padding-bottom:2px}
@container app (max-width:520px){.s-hero{grid-template-columns:64px minmax(0,1fr)}.s-hero .xa-tile{width:64px;height:64px}}`;

export default async function main(os, root) {
  const { apps } = os;
  document.head.append(h('style', { text: CSS }));
  let cat = null, q = '', filter = 'all', view = null;
  const body = h('div', { class: 'k-scroll' });
  const search = h('input', { class: 'field', type: 'search', placeholder: 'アプリをさがす', 'aria-label': 'アプリをさがす', oninput: () => { q = search.value; view = null; draw(); } });
  fill(root, h('div', { class: 'k-tools' }, search, ibtn('plus', 'Web アプリを足す', () => addCustom()), ibtn('refresh', '一覧を読み直す', () => load(true))), body);

  const install = a => { apps.install(a.id); os.ui.toast('ホームに入れました', 'ok', a.name); draw(); };
  const remove = async a => { if (await os.ui.confirm(a.name + ' を外す', 'ホームとドックから外します。アプリの中の記録は消えません。', { ok: '外す', danger: true })) { os.proc.killApp(a.id); apps.uninstall(a.id); draw(); } };
  const onlyPC = big => { const b = btn('この PC だけ', null, { sm: !big, title: 'このアプリは、アプリのある PC で、手元の XEVARIX（tools/serve.py）から開くと使えます' }); b.disabled = true; return b; };
  const actBtn = (a, big) => !apps.canUse(a) ? onlyPC(big) : apps.isInstalled(a.id) ? btn('開く', e => { e.stopPropagation(); os.open(a.id); }, { sm: !big }) : btn('入れる', e => { e.stopPropagation(); install(a); }, { sm: !big, kind: 'pri', ic: 'download' });

  async function addCustom() {
    const name = await os.ui.prompt('Web アプリを足す', 'ホームに出す名前を入れてください。', { placeholder: '名前', max: 40 }); if (!name) return;
    const url = await os.ui.prompt('アドレス', 'https:// から始まるアドレスを入れてください。窓の中に出せないサイトもあります（そのサイトが許していない場合）。', { placeholder: 'https://', value: 'https://', max: 300 }); if (!url) return;
    try { const a = apps.addCustom({ name, url }); os.ui.toast('ホームに足しました', 'ok', a.name); draw(); } catch (e) { os.ui.alert('足せませんでした', e.message); }
  }
  function detail(a) {
    const inst = apps.isInstalled(a.id), pinned = (os.reg.get('dock.pins') || []).includes(a.id);
    fill(body, h('div', { class: 'k-pad k-col k-max' },
      h('div', null, btn('一覧へもどる', () => { view = null; draw(); }, { sm: true, kind: 'ghost', ic: 'chevL' })),
      h('div', { class: 's-hero' }, appTile(a), h('div', null, h('h2', null, a.full || a.name, a.beta ? h('span', { style: 'margin-left:8px;vertical-align:middle' }, badge('β版', 'warn')) : null), h('p', null, a.sub),
        h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, actBtn(a, true), inst ? btn(pinned ? 'ドックから外す' : 'ドックに置く', () => { os.reg.update('dock.pins', l => (pinned ? l.filter(x => x !== a.id) : [...l, a.id])); detail(a); }, { ic: 'pin' }) : null, inst ? btn('外す', () => remove(a).then(() => { if (!apps.isInstalled(a.id)) detail(a); }), { kind: 'ghost' }) : null))),
      h('div', { class: 's-desc' }, a.desc || '説明はまだありません。'),
      h('div', { class: 'k-group' },
        h('div', { class: 'k-kv' }, h('span', null, '提供'), h('span', null, a.by || '—')),
        h('div', { class: 'k-kv' }, h('span', null, '種類'), h('span', null, apps.CATS[a.cat] || a.cat)),
        h('div', { class: 'k-kv' }, h('span', null, '動かし方'), h('span', null, '配信中のページを、そのまま XEVARIX の窓で開きます')),
        h('div', { class: 'k-kv' }, h('span', null, '電力の管理'), h('span', null, a.bg ? '裏でも止めません（音楽・通知のため）' : '裏に回ると、電力モードに合わせて休止します')),
        a.game ? h('div', { class: 'k-kv' }, h('span', null, 'ゲームモード'), h('span', null, '開くと自動で高性能に切りかえます（設定で変えられます）')) : null)));
    body.scrollTop = 0;
  }
  function draw() {
    if (view) return detail(view);
    if (!cat) return fill(body, empty('store', '一覧を読みこんでいます…'));
    const key = normJa(q).replace(/\s+/g, '');
    const all = cat.apps.filter(a => (filter === 'all' || (filter === 'in' ? apps.isInstalled(a.id) : a.cat === filter)) && (!key || [a.name, a.full, a.sub, a.desc, ...(a.keys || [])].some(s => s && normJa(s).replace(/\s+/g, '').includes(key))));
    const cats = ['all', 'in', ...Object.keys(apps.CATS).filter(c => c !== 'system' && cat.apps.some(a => a.cat === c))];
    const custom = os.reg.get('apps.custom') || [];
    const feat = !key && filter === 'all' ? cat.apps.find(a => cat.featured.includes(a.id) && !apps.isInstalled(a.id)) : null;
    const notIn = cat.featured.filter(id => !apps.isInstalled(id));
    fill(body, h('div', { class: 'k-pad k-col' },
      !cat.apps.length ? note('一覧を取りにいけませんでした。通信できるときに、右上の「読み直す」を押してください。', 'warn') : null,
      feat ? h('div', { class: 's-hero', style: 'cursor:pointer', onclick: () => { view = feat; draw(); } }, appTile(feat), h('div', null, h('div', { class: 'tiny muted', style: 'letter-spacing:.1em;font-weight:700' }, 'おすすめ'), h('h2', null, feat.full || feat.name), h('p', null, feat.sub),
        h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, actBtn(feat, true), notIn.length > 1 ? btn('おすすめ ' + notIn.length + ' 本をまとめて入れる', e => { e.stopPropagation(); for (const id of notIn) apps.install(id); os.ui.toast(notIn.length + ' 本をホームに入れました', 'ok'); draw(); }, {}) : null))) : null,
      h('div', { class: 's-chips' }, cats.map(c => h('button', { class: 'chip' + (filter === c ? ' on' : ''), type: 'button', onclick: () => { filter = c; draw(); } }, c === 'all' ? 'すべて' : c === 'in' ? '入れたもの' : apps.CATS[c]))),
      all.length ? h('div', { class: 's-grid' }, all.map(a => h('button', { class: 's-card', type: 'button', onclick: () => { view = a; draw(); } }, appTile(a), h('div', { style: 'min-width:0' }, h('b', null, a.name), h('small', null, a.sub)),
        h('div', { class: 's-act' }, h('span', { style: 'display:flex;gap:5px' }, badge(apps.CATS[a.cat] || a.cat, 'mute'), a.beta ? badge('β版', 'warn') : null, a.local ? badge('この PC', 'mute') : null, apps.isInstalled(a.id) ? badge('入っています', 'ok') : null), actBtn(a))))) : empty('search', '見つかりませんでした'),
      custom.length && (filter === 'all' || filter === 'in') ? [h('div', { class: 'k-group-t' }, '自分で足した Web アプリ'), h('div', { class: 's-grid' }, custom.map(a => h('div', { class: 's-card' }, appTile(a), h('div', { style: 'min-width:0' }, h('b', null, a.name), h('small', null, a.sub)), h('div', { class: 's-act' }, btn('外す', () => remove(a), { sm: true, kind: 'ghost' }), btn('開く', () => os.open(a.id), { sm: true })))))] : null,
      h('p', { class: 'k-p' }, 'ストアのアプリは、NGX と ISHIDA Production が配信しているページを、そのまま XEVARIX の窓で開きます（一覧 ' + (cat.version || '') + '）。右上の ＋ から、好きな Web アプリを足すこともできます。')));
  }
  async function load(force) {
    cat = await apps.loadCatalog(force);
    if (os.args && os.args.app) { const a = cat.apps.find(x => x.id === os.args.app) || apps.get(os.args.app); if (a && a.kind === 'web') view = a; }
    draw();
  }
  os.onArgs(a => { if (a && a.app && cat) { view = cat.apps.find(x => x.id === a.app) || null; draw(); } });
  os.on('apps:change', () => { if (!view) draw(); });
  draw(); load(false);
}

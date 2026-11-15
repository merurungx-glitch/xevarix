/* XEVARIX 標準アプリ — ファイル（フォルダ・ごみ箱・読みこみと書き出し） */

import { h, fill, btn, ibtn, empty, icon, fmtBytes, fmtStamp, saveBlob, pickFiles, debounce } from './kit.js';

const KI = { dir: 'folder', image: 'image', audio: 'music', video: 'video', text: 'fileText', pdf: 'file', file: 'file' };
const CSS = `
.f-list{display:grid;gap:0}
.f-item{display:grid;grid-template-columns:28px minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:8px 14px;border:0;border-bottom:1px solid var(--stroke);background:transparent;color:var(--text);text-align:left;font:inherit;width:100%}
.f-item:hover{background:var(--hover)} .f-item.sel{background:var(--acc-soft)}
.f-item .xi{width:22px;height:22px;color:var(--acc-text)} .f-item[data-kind="dir"] .xi{color:var(--warn)}
.f-item b{font-weight:500;font-size:.875rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.f-item small{color:var(--text-3);font-size:.72rem;white-space:nowrap}
.f-crumbs{display:flex;align-items:center;gap:2px;flex:1;min-width:0;overflow:auto hidden;scrollbar-width:none;font-size:.8125rem}
.f-crumbs button{border:0;background:transparent;color:var(--text-2);padding:4px 7px;border-radius:7px;white-space:nowrap;font-weight:600}
.f-crumbs button:hover{background:var(--hover);color:var(--text)} .f-crumbs button:last-of-type{color:var(--text)}
.f-drop{outline:2px dashed var(--acc);outline-offset:-6px}
@container app (max-width:520px){.f-item small.f-date{display:none}}
`;

export default async function main(os, root) {
  const { fs } = os;
  document.head.append(h('style', { text: CSS }));
  let cur = (os.args && os.args.dir) || fs.ROOT, sel = null, query = '', trash = false;
  const places = [{ id: fs.ROOT, label: 'すべて', icon: 'database' }, { id: fs.DIRS.docs, label: 'ドキュメント', icon: 'folder' }, { id: fs.DIRS.notes, label: 'メモ', icon: 'note' }, { id: fs.DIRS.pics, label: '画像', icon: 'image' }, { id: fs.DIRS.dl, label: 'ダウンロード', icon: 'download' }];
  const side = h('nav', { class: 'k-side' }), crumbs = h('div', { class: 'f-crumbs' }), tools = h('div', { class: 'k-tools' }), list = h('div', { class: 'k-scroll' }), foot = h('div', { class: 'k-tools', style: 'border-top:1px solid var(--stroke);border-bottom:0;min-height:44px' });
  const search = h('input', { class: 'field', type: 'search', placeholder: 'さがす', 'aria-label': 'ファイルをさがす', style: 'max-width:200px', oninput: debounce(() => { query = search.value.trim(); draw(); }, 150) });
  fill(root, h('div', { class: 'k-split' }, side, h('div', { class: 'k-main' }, tools, list, foot)));

  const go = id => { cur = id; trash = false; sel = null; query = ''; search.value = ''; draw(); };
  const ask = (t, d, v) => os.ui.prompt(t, d, { value: v || '', max: 120 });
  const fail = e => os.ui.toast(e.message, 'warn');

  async function act(kind, n) {
    try {
      if (kind === 'open') { if (n.kind === 'dir') return go(n.id); return os.act.openFile(n); }
      if (kind === 'rename') { const v = await ask('名前を変える', null, n.name); if (v && v !== n.name) await fs.rename(n.id, v); }
      if (kind === 'trash') await fs.trash(n.id);
      if (kind === 'restore') await fs.restore(n.id);
      if (kind === 'purge') { if (await os.ui.confirm('完全に消す', '「' + n.name + '」を完全に消します。元に戻せません。', { ok: '消す', danger: true })) await fs.purge(n.id); }
      if (kind === 'copy') await fs.copy(n.id, n.parent);
      if (kind === 'move') { const d = await os.act.pickFile({ title: '「' + n.name + '」を動かす先', dirs: true }); if (d) await fs.move(n.id, d.id); }
      if (kind === 'export') saveBlob(await fs.readBlob(n.id), n.name);
      if (kind === 'vault') os.open('vault', { add: n.id });
      if (kind === 'wall') { os.reg.set('ui.wallImage', n.id); os.reg.set('ui.wall', 'image'); os.ui.toast('壁紙にしました', 'ok'); }
    } catch (e) { fail(e); }
    sel = null; draw();
  }
  function ctx(n, at) {
    const k = fs.kindOf(n);
    os.ui.menu(trash ? [{ label: '元の場所に戻す', icon: 'undo', fn: () => act('restore', n) }, { label: '完全に消す', icon: 'trash', danger: true, fn: () => act('purge', n) }] : [
      { label: '開く', icon: 'external', fn: () => act('open', n) },
      n.kind === 'file' && k === 'text' && { label: 'エディタで開く', icon: 'code', fn: () => os.open('editor', { id: n.id }) },
      !n.sys && { label: '名前を変える', icon: 'edit', fn: () => act('rename', n) },
      !n.sys && { label: '動かす', icon: 'folder', fn: () => act('move', n) },
      n.kind === 'file' && { label: '写しを作る', icon: 'copy', fn: () => act('copy', n) },
      n.kind === 'file' && { label: '端末に書き出す', icon: 'upload', fn: () => act('export', n) },
      k === 'image' && { label: '壁紙にする', icon: 'image', fn: () => act('wall', n) },
      n.kind === 'file' && { label: '保管庫に入れる', icon: 'shieldCheck', fn: () => act('vault', n) },
      !n.sys && '-', !n.sys && { label: 'ごみ箱へ', icon: 'trash', danger: true, fn: () => act('trash', n) }], at);
  }

  async function draw() {
    fill(side, h('div', { class: 'k-nav-sec' }, '場所'), places.map(p => h('button', { class: 'k-nav' + (!trash && cur === p.id ? ' on' : ''), type: 'button', onclick: () => go(p.id) }, icon(p.icon), p.label)),
      h('div', { class: 'k-nav-sec' }, 'そのほか'), h('button', { class: 'k-nav' + (trash ? ' on' : ''), type: 'button', onclick: () => { trash = true; sel = null; draw(); } }, icon('trash'), 'ごみ箱'));
    const path = trash ? [] : await fs.crumbs(cur);
    const node = trash ? null : await fs.get(cur);
    if (!trash && !node) return go(fs.ROOT);
    fill(crumbs, trash ? h('button', { type: 'button' }, 'ごみ箱') : path.map((n, i) => [i ? h('span', { class: 'muted' }, '›') : null, h('button', { type: 'button', onclick: () => go(n.id) }, n.id === fs.ROOT ? 'ファイル' : n.name)]));
    fill(tools, !trash && node.parent ? ibtn('arrowU', '上のフォルダへ', () => go(node.parent)) : null, crumbs, search,
      trash ? btn('空にする', async () => { if (await os.ui.confirm('ごみ箱を空にする', 'ごみ箱の中身を完全に消します。元に戻せません。', { ok: '空にする', danger: true })) { await fs.emptyTrash(); draw(); } }, { sm: true, kind: 'danger', ic: 'trash' }) : [
        ibtn('plus', '新しいフォルダ', async () => { const v = await ask('新しいフォルダ', null, '新しいフォルダ'); if (v) { await fs.mkdir(cur, v); draw(); } }),
        ibtn('fileText', '新しい文字のファイル', async () => { const v = await ask('新しいファイル', '名前を入れてください。', '新しいファイル.txt'); if (v) { const n = await fs.write(cur, v, ''); os.act.openFile(n); draw(); } }),
        ibtn('download', '端末から読みこむ', async () => { const f = await pickFiles({ multiple: true }); if (f.length) { const made = await fs.importFiles(cur, f); os.ui.toast(made.length + ' 個を読みこみました', 'ok'); draw(); } })]);
    let items = trash ? await fs.listTrash() : query ? (await fs.search(query, 80)) : await fs.ls(cur);
    fill(list, items.length ? h('div', { class: 'f-list', role: 'list' }, items.map(n => {
      const k = fs.kindOf(n);
      const b = h('button', { class: 'f-item' + (sel === n.id ? ' sel' : ''), type: 'button', role: 'listitem', data: { kind: k },
        onclick: () => { if (sel === n.id || matchMedia('(pointer: coarse)').matches) { if (trash) ctx(n, b); else act('open', n); } else { sel = n.id; draw(); } },
        ondblclick: () => { if (!trash) act('open', n); }, oncontextmenu: e => { e.preventDefault(); sel = n.id; ctx(n, { x: e.clientX, y: e.clientY }); } },
        icon(KI[k] || 'file'), h('b', null, n.name), h('small', { class: 'f-date' }, fmtStamp(trash ? (n.tt || n.mtime) : n.mtime)), h('small', null, n.kind === 'dir' ? '' : fmtBytes(n.size)));
      return b;
    })) : empty(trash ? 'trash' : query ? 'search' : 'folder', trash ? 'ごみ箱は空です' : query ? '「' + query + '」に合うものはありません' : 'このフォルダは空です。\n端末のファイルを、ここへドラッグしても入れられます。'));
    const s = sel && items.find(n => n.id === sel);
    const u = await fs.usage();
    fill(foot, s ? [h('span', { class: 'tiny', style: 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, s.name), btn(trash ? '戻す' : '開く', () => act(trash ? 'restore' : 'open', s), { sm: true, kind: 'pri' }), ibtn('more', 'そのほかの操作', e => ctx(s, e.currentTarget))]
      : h('span', { class: 'tiny muted' }, items.length + ' 個・全体で ' + fmtBytes(u.bytes)));
  }

  /* 端末からのドラッグで読みこむ */
  list.addEventListener('dragover', e => { if (trash) return; e.preventDefault(); list.classList.add('f-drop'); });
  list.addEventListener('dragleave', () => list.classList.remove('f-drop'));
  list.addEventListener('drop', async e => { e.preventDefault(); list.classList.remove('f-drop'); if (trash) return; const f = [...(e.dataTransfer.files || [])]; if (f.length) { const made = await fs.importFiles(cur, f); os.ui.toast(made.length + ' 個を読みこみました', 'ok'); draw(); } });
  addEventListener('keydown', async e => {
    if (/INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const items = trash ? await fs.listTrash() : await fs.ls(cur); const s = items.find(n => n.id === sel);
    if (e.key === 'Delete' && s && !s.sys) act(trash ? 'purge' : 'trash', s);
    else if (e.key === 'Enter' && s) act(trash ? 'restore' : 'open', s);
    else if (e.key === 'F2' && s && !trash) act('rename', s);
    else if (e.key === 'Backspace' && !trash) { const n = await fs.get(cur); if (n && n.parent) go(n.parent); }
  });
  os.on('fs:change', debounce(() => draw(), 120));
  os.onArgs(a => { if (a && a.dir) go(a.dir); });
  draw();
}

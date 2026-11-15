/* XEVARIX — 仮想ファイルシステム（ユーザーごとの IndexedDB の中）
   ・フォルダと名前で整理する。中身は blobs（文字列か Blob）、名札は nodes。
   ・消すと「ごみ箱」へ。ごみ箱から戻す・完全に消す。
   ・文字のファイルは先頭を excerpt に控えて、検索と AI がすぐ引けるようにする。 */

import { bus, log } from './core.js';
import { uid, normJa } from './util.js';

let S = null;
export const ROOT = 'root';
export const DIRS = { docs: 'd-docs', notes: 'd-notes', pics: 'd-pics', dl: 'd-dl' };
const SYSTEM_DIRS = [
  { id: DIRS.docs, parent: ROOT, name: 'ドキュメント' },
  { id: DIRS.notes, parent: DIRS.docs, name: 'メモ' },
  { id: DIRS.pics, parent: ROOT, name: '画像' },
  { id: DIRS.dl, parent: ROOT, name: 'ダウンロード' },
];
const rootNode = { id: ROOT, parent: null, name: '', kind: 'dir', sys: 1, ctime: 0, mtime: 0, size: 0, trashed: 0 };

const EXT_MIME = {
  txt: 'text/plain', md: 'text/markdown', json: 'application/json', csv: 'text/csv', xsh: 'text/x-xsh', log: 'text/plain',
  js: 'text/javascript', css: 'text/css', html: 'text/html', xml: 'application/xml', svg: 'image/svg+xml',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  pdf: 'application/pdf', zip: 'application/zip', xvx: 'application/x-xevarix-backup',
};
export const extOf = name => { const m = /\.([a-z0-9]+)$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; };
export const mimeOf = name => EXT_MIME[extOf(name)] || 'application/octet-stream';
export const isText = n => /^(text\/|application\/(json|xml|javascript))/.test(n.mime || '') && n.mime !== 'image/svg+xml' || ['md', 'txt', 'xsh', 'log', 'csv', 'json'].includes(extOf(n.name));
export function kindOf(n) {
  if (n.kind === 'dir') return 'dir';
  const m = n.mime || '';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('audio/')) return 'audio';
  if (m.startsWith('video/')) return 'video';
  if (m === 'application/pdf') return 'pdf';
  if (isText(n)) return 'text';
  return 'file';
}
const cmp = (a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'ja', { numeric: true }) : (a.kind === 'dir' ? -1 : 1));
const sizeOf = d => (typeof d === 'string' ? new Blob([d]).size : (d && d.size) || (d && d.byteLength) || 0);
const cleanName = s => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 120) || '名前なし';
const emit = (type, node, extra) => bus.emit('fs:change', { type, id: node && node.id, parent: node && node.parent, node, ...extra });

/* ごみ箱の中にあるか（自分か、上のフォルダのどれかが、ごみ箱に入っている）。
   フォルダをごみ箱に入れても、中のファイルの印は変えていないので、上へたどって確かめる */
function goneCheck(all) {
  const map = new Map(all.map(n => [n.id, n])), memo = new Map();
  const gone = n => {
    if (!n) return false;
    if (n.trashed) return true;
    if (memo.has(n.id)) return memo.get(n.id);
    memo.set(n.id, false);                       // 輪になっていても止まるように、先に置く
    const v = gone(map.get(n.parent)); memo.set(n.id, v); return v;
  };
  return gone;
}

async function uniqueName(parent, name, exceptId) {
  const sib = (await S.nodes.byIndex('parent', parent)).filter(n => !n.trashed && n.id !== exceptId).map(n => n.name);
  if (!sib.includes(name)) return name;
  const e = /\.[a-z0-9]+$/i.exec(name); const base = e ? name.slice(0, -e[0].length) : name; const ext = e ? e[0] : '';
  for (let i = 2; i < 999; i++) { const c = base + ' (' + i + ')' + ext; if (!sib.includes(c)) return c; }
  return base + ' ' + uid('') + ext;
}

export const fs = {
  ROOT, DIRS, extOf, mimeOf, kindOf, isText,

  async init(db) {
    S = db;
    const now = Date.now(); let fresh = false;
    for (const d of SYSTEM_DIRS) {
      if (!(await S.nodes.get(d.id))) { fresh = true; await S.nodes.put({ ...d, kind: 'dir', sys: 1, ctime: now, mtime: now, size: 0, trashed: 0 }); }
    }
    if (fresh && !(await S.nodes.byIndex('parent', DIRS.docs)).some(n => n.kind === 'file')) {
      await fs.write(DIRS.docs, 'はじめに.md',
        '# XEVARIX へようこそ\n\nここは XEVARIX のファイル置き場です。ファイルはこの端末の中だけに保存されます。\n\n- 画面の下のまん中の XEVARIX のロゴ（コア）を押すと AI に話しかけられます。\n- 「省電力にして」「メモを開いて」「3分はかって」のように言葉で操作できます。\n- 端末の写真や書類は、ファイルの「読みこむ」から入れられます。\n- 消したものは「ごみ箱」に入り、あとから戻せます。\n');
    }
    return fs;
  },

  async get(id) { return id === ROOT ? { ...rootNode } : (await S.nodes.get(id)) || null; },

  async ls(parent = ROOT) {
    return (await S.nodes.byIndex('parent', parent)).filter(n => !n.trashed).sort(cmp);
  },

  async path(id) {
    const parts = []; let n = await fs.get(id); let guard = 0;
    while (n && n.id !== ROOT && guard++ < 64) { parts.unshift(n.name); n = await fs.get(n.parent); }
    return '/' + parts.join('/');
  },
  async crumbs(id) {
    const out = []; let n = await fs.get(id); let guard = 0;
    while (n && guard++ < 64) { out.unshift(n); if (n.id === ROOT) break; n = await fs.get(n.parent); }
    return out;
  },

  /* '/ドキュメント/メモ/a.md'・'../x'・'~' を名札に直す */
  async resolve(path, cwd = ROOT) {
    path = String(path || '').trim();
    let cur = (path.startsWith('/') || path.startsWith('~')) ? ROOT : cwd;
    for (const part of path.replace(/^~/, '').split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') { const n = await fs.get(cur); cur = (n && n.parent) || ROOT; continue; }
      const kids = await fs.ls(cur);
      const hit = kids.find(k => k.name === part) || kids.find(k => normJa(k.name) === normJa(part));
      if (!hit) return null;
      cur = hit.id;
    }
    return fs.get(cur);
  },

  async mkdir(parent, name) {
    const now = Date.now();
    const n = { id: uid('n'), parent, name: await uniqueName(parent, cleanName(name || '新しいフォルダ')), kind: 'dir', ctime: now, mtime: now, size: 0, trashed: 0 };
    await S.nodes.put(n); emit('create', n); return n;
  },

  /* 作る・上書きする。data は文字列か Blob */
  async write(parent, name, data, { mime, overwrite = false } = {}) {
    name = cleanName(name);
    const now = Date.now();
    if (overwrite) {
      const old = (await fs.ls(parent)).find(k => k.kind === 'file' && k.name === name);
      if (old) return fs.update(old.id, data);
    }
    const n = { id: uid('n'), parent, name: await uniqueName(parent, name), kind: 'file', ctime: now, mtime: now, trashed: 0 };
    n.mime = mime || (data && data.type) || mimeOf(n.name);
    n.size = sizeOf(data);
    if (typeof data === 'string') n.excerpt = data.slice(0, 6000);
    await S.blobs.put(data, n.id);
    await S.nodes.put(n);
    emit('create', n); return n;
  },

  async update(id, data) {
    const n = await S.nodes.get(id); if (!n || n.kind !== 'file') throw new Error('ファイルが見つかりません');
    n.mtime = Date.now(); n.size = sizeOf(data);
    if (typeof data === 'string') n.excerpt = data.slice(0, 6000); else delete n.excerpt;
    await S.blobs.put(data, id); await S.nodes.put(n);
    emit('update', n); return n;
  },

  async read(id) { return S.blobs.get(id); },
  async readText(id) {
    const d = await S.blobs.get(id);
    if (d == null) return '';
    return typeof d === 'string' ? d : (d.text ? d.text() : new TextDecoder().decode(d));
  },
  async readBlob(id) {
    const d = await S.blobs.get(id); const n = await S.nodes.get(id);
    if (d == null) return new Blob([]);
    return d instanceof Blob ? d : new Blob([d], { type: (n && n.mime) || 'text/plain' });
  },

  async rename(id, name) {
    const n = await S.nodes.get(id); if (!n) throw new Error('見つかりません');
    if (n.sys) throw new Error('このフォルダの名前は変えられません');
    n.name = await uniqueName(n.parent, cleanName(name), id); n.mtime = Date.now();
    if (n.kind === 'file' && !n.mime) n.mime = mimeOf(n.name);
    await S.nodes.put(n); emit('update', n); return n;
  },

  async isInside(id, maybeAncestor) {
    let n = await fs.get(id); let guard = 0;
    while (n && guard++ < 64) { if (n.id === maybeAncestor) return true; if (!n.parent) break; n = await fs.get(n.parent); }
    return false;
  },

  async move(id, newParent) {
    const n = await S.nodes.get(id); if (!n) throw new Error('見つかりません');
    if (n.sys) throw new Error('このフォルダは動かせません');
    if (n.kind === 'dir' && await fs.isInside(newParent, id)) throw new Error('自分の中には動かせません');
    const from = n.parent; if (from === newParent) return n;
    n.name = await uniqueName(newParent, n.name, id); n.parent = newParent; n.mtime = Date.now();
    await S.nodes.put(n); emit('move', n, { from }); return n;
  },

  async copy(id, newParent) {
    const n = await S.nodes.get(id); if (!n) throw new Error('見つかりません');
    if (n.kind === 'dir') {
      if (await fs.isInside(newParent, id)) throw new Error('自分の中には写せません');
      const d = await fs.mkdir(newParent, n.name);
      for (const k of await fs.ls(id)) await fs.copy(k.id, d.id);
      return d;
    }
    return fs.write(newParent, n.name, await S.blobs.get(id), { mime: n.mime });
  },

  async trash(id) {
    const n = await S.nodes.get(id); if (!n) return;
    if (n.sys) throw new Error('このフォルダは消せません');
    n.trashed = 1; n.from = n.parent; n.parent = 'trash'; n.tt = Date.now();
    await S.nodes.put(n); emit('trash', n, { from: n.from });
  },
  async listTrash() { return (await S.nodes.byIndex('parent', 'trash')).sort((a, b) => (b.tt || 0) - (a.tt || 0)); },
  async restore(id) {
    const n = await S.nodes.get(id); if (!n || !n.trashed) return null;
    /* 元のフォルダが無い・ごみ箱の中（上のフォルダごと捨てた場合もふくむ）なら、いちばん上に戻す */
    const from = await fs.get(n.from);
    const home = from && !goneCheck(await S.nodes.all())(from) ? n.from : ROOT;
    n.trashed = 0; n.parent = home; delete n.from; delete n.tt;
    n.name = await uniqueName(home, n.name, id);
    await S.nodes.put(n); emit('restore', n); return n;
  },
  async purge(id) {
    const n = await S.nodes.get(id); if (!n) return;
    if (n.kind === 'dir') for (const k of await S.nodes.byIndex('parent', id)) await fs.purge(k.id);
    else await S.blobs.del(id);
    await S.nodes.del(id); emit('purge', n);
  },
  async emptyTrash() { for (const n of await fs.listTrash()) await fs.purge(n.id); },

  /* 名前と、文字ファイルの先頭をさがす */
  async search(q, limit = 40) {
    const key = normJa(q); if (!key) return [];
    const words = key.split(' ').filter(Boolean);
    const out = [];
    const all = await S.nodes.all(), gone = goneCheck(all);
    for (const n of all) {
      if (gone(n)) continue;
      const hay = normJa(n.name) + '\n' + (n.excerpt ? normJa(n.excerpt) : '');
      if (!words.every(w => hay.includes(w))) continue;
      const inName = words.every(w => normJa(n.name).includes(w));
      out.push({ node: n, score: (inName ? 2 : 1) + (n.mtime || 0) / 1e14 });
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit).map(x => x.node);
  },

  async all() { return S.nodes.all(); },
  async usage() {
    const by = { text: 0, image: 0, audio: 0, video: 0, pdf: 0, file: 0 }; let files = 0, bytes = 0, trash = 0;
    const all = await S.nodes.all(), gone = goneCheck(all);
    for (const n of all) {
      if (n.kind !== 'file') continue;
      files++; bytes += n.size || 0; by[kindOf(n)] += n.size || 0;
      if (gone(n)) trash += n.size || 0;
    }
    return { files, bytes, by, trash };
  },

  async importFiles(parent, files) {
    const made = [];
    for (const f of files) {
      try {
        const textual = /^text\//.test(f.type) || ['md', 'txt', 'json', 'csv', 'xsh', 'log'].includes(extOf(f.name));
        made.push(await fs.write(parent, f.name, textual && f.size < 2e6 ? await f.text() : f, { mime: f.type || mimeOf(f.name) }));
      } catch (e) { log.warn('fs', f.name + ' を読みこめません: ' + e.message); }
    }
    return made;
  },

  /* 引きつぎ・復元用 */
  async dump(withBlobs = true) {
    const nodes = await S.nodes.all(); const blobs = {};
    if (withBlobs) for (const n of nodes) if (n.kind === 'file') blobs[n.id] = await S.blobs.get(n.id);
    return { nodes, blobs };
  },
  async load({ nodes, blobs }, { replace = false } = {}) {
    if (replace) { await S.nodes.clear(); await S.blobs.clear(); }
    for (const n of nodes || []) await S.nodes.put(n);
    for (const id in (blobs || {})) await S.blobs.put(blobs[id], id);
    for (const d of SYSTEM_DIRS) if (!(await S.nodes.get(d.id))) await S.nodes.put({ ...d, kind: 'dir', sys: 1, ctime: Date.now(), mtime: Date.now(), size: 0, trashed: 0 });
    emit('reload', null);
  },
};

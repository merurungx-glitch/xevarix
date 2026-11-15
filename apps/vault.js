/* XEVARIX 標準アプリ — 保管庫（暗号化して守るメモとファイル）
   中身も名前も AES-GCM で暗号化して置く。鍵はパスコードから作るので、パスコードが無いと読めない。
   窓を閉じる・XEVARIX をロックする・3分さわらない と、自動で鍵をかける。 */

import { h, fill, btn, ibtn, empty, note, row, group, icon, fmtBytes, fmtStamp, saveBlob, pickFiles, uid, utf8, unutf8 } from './kit.js';

const CSS = `.vt-ed{flex:1;min-height:0;display:flex;flex-direction:column}
.vt-ed textarea{flex:1;min-height:0;border:0;outline:0;resize:none;background:transparent;color:var(--text);padding:8px 18px 18px;line-height:1.8;font-size:.95rem}
.vt-ed input{border:0;outline:0;background:transparent;font-size:1.2rem;font-weight:700;padding:14px 18px 4px;color:var(--text)}
.vt-img{max-width:100%;max-height:100%;object-fit:contain}`;

export default async function main(os, root) {
  const { security, session, reg, fs, db } = os;
  document.head.append(h('style', { text: CSS }));
  let key = null, idleT = 0, url = null, flush = null;      // flush = 書きかけのメモを保存する（メモを開いているあいだだけ入る）
  const touch = () => { clearTimeout(idleT); if (key) idleT = setTimeout(lock, 180000); };
  addEventListener('pointerdown', touch, true); addEventListener('keydown', touch, true);
  const me = () => session.getUser(session.user.id) || session.user;
  const freeUrl = () => { if (url) { URL.revokeObjectURL(url); url = null; } };
  /* 鍵をかける。書きかけのメモは、鍵があるうちに保存しておく */
  async function lock() { const f = flush; flush = null; if (f && key) { try { await f(true); } catch { /* 保存できなくても鍵はかける */ } } key = null; freeUrl(); clearTimeout(idleT); draw(); }
  os.on('lock:on', lock);
  os.onClose(reason => {
    /* 書きかけがあれば、保存してから閉じる（強制終了のときは待てないので、そのまま閉じる） */
    if (flush && key && !reason) { const f = flush; flush = null; f(true).catch(() => {}).then(() => os.close()); return false; }
    key = null; freeUrl();
  });
  /* パスコードを決めた・変えたら、鍵のかかった画面を描き直す */
  os.on('session:user', () => { if (!me().pass) { flush = null; key = null; freeUrl(); clearTimeout(idleT); draw(); } else if (!key) draw(); });

  const head = async rec => JSON.parse(await security.decryptText(key, rec.head));
  async function put(name, kind, mime, bytes, id) {
    const rec = { id: id || uid('v'), mtime: Date.now(), size: bytes.length, head: await security.encryptText(key, JSON.stringify({ name, kind, mime })), body: await security.encrypt(key, bytes) };
    await db.vault.put(rec); return rec;
  }
  async function addFile(node) {
    const blob = await fs.readBlob(node.id); await put(node.name, 'file', node.mime || blob.type, new Uint8Array(await blob.arrayBuffer()));
    if (await os.ui.confirm('元のファイルを消しますか', '「' + node.name + '」を保管庫に入れました。暗号化されていない元のファイルを、完全に消しますか？', { ok: '元を消す', cancel: '残す', danger: true })) await fs.purge(node.id);
  }

  async function unlock() {
    const m = me(), meta = reg.get('vault.meta');
    const p = await os.ui.prompt(meta ? '保管庫を開く' : '保管庫を作る', (meta ? '' : 'はじめに、保管庫の鍵を作ります。\n') + 'XEVARIX のパスコードを入れてください。', { type: 'password', mode: m.pass && m.pass.kind === 'pin' ? 'numeric' : null, max: 12, ok: '開く' });
    if (p == null) return;
    if (!await security.checkPass(m.pass, p)) return os.ui.alert('ちがいます', 'パスコードが合いませんでした。');
    if (!meta) { const v = await security.vaultCreate(p); reg.set('vault.meta', v.meta); key = v.key; }
    else { key = await security.vaultOpen(meta, p); if (!key) return os.ui.alert('開けませんでした', '保管庫の鍵を取り出せませんでした。パスコードを変えたあとに問題が起きた場合は、前のパスコードで試してください。'); }
    touch();
    if (os.args && os.args.add) { const n = await fs.get(os.args.add); os.args.add = null; if (n && n.kind === 'file') await addFile(n); }
    draw();
  }

  async function openItem(rec) {
    const hd = await head(rec); const bytes = await security.decrypt(key, rec.body); freeUrl();
    if (hd.kind === 'note') return editNote(rec, hd, unutf8(bytes));
    const blob = new Blob([bytes], { type: hd.mime || 'application/octet-stream' });
    const isImg = /^image\//.test(hd.mime || '');
    if (isImg) url = URL.createObjectURL(blob);
    fill(root, h('div', { class: 'k-tools' }, ibtn('chevL', '一覧へ', () => { freeUrl(); draw(); }), h('span', { class: 'tiny', style: 'flex:1;font-weight:600' }, hd.name), btn('書き出す', async () => { if (await os.ui.confirm('書き出す', '暗号を解いた状態で、端末に保存します。', { ok: '書き出す' })) saveBlob(blob, hd.name); }, { sm: true, ic: 'upload' })),
      h('div', { style: 'flex:1;min-height:0;display:grid;place-items:center;overflow:auto;background:var(--surface-0)' }, isImg ? h('img', { class: 'vt-img', src: url, alt: hd.name }) : empty('file', hd.name + '\n' + fmtBytes(rec.size) + '\n\nこの種類は、ここでは中を見られません。「書き出す」で取り出せます。')));
  }
  function editNote(rec, hd, text) {
    const title = h('input', { value: hd ? hd.name : '', placeholder: '題', maxlength: 60, 'aria-label': '題' }), ta = h('textarea', { placeholder: 'ここに書いたものは、暗号化して保存されます。', 'aria-label': '本文', spellcheck: 'false' });
    ta.value = text || '';
    let t0 = title.value, b0 = ta.value;                 // 最後に保存した中身（変わっていなければ保存しない）
    const save = async quiet => { rec = await put(title.value.trim() || 'メモ', 'note', 'text/plain', utf8(ta.value), rec && rec.id); t0 = title.value; b0 = ta.value; if (!quiet) os.ui.toast('暗号化して保存しました', 'ok'); };
    flush = async quiet => { if (title.value !== t0 || ta.value !== b0) await save(quiet); };
    fill(root, h('div', { class: 'k-tools' }, ibtn('chevL', '一覧へ', async () => { if (flush) await flush(false); draw(); }), h('span', { class: 'k-sp' }), btn('保存', () => save(false), { sm: true, kind: 'pri', ic: 'save' })), h('div', { class: 'vt-ed' }, title, ta));
    ta.focus();
  }

  async function draw() {
    flush = null;
    const m = me();
    if (!security.ok) return fill(root, empty('warn', 'この開き方（http）では暗号の機能を使えないため、保管庫は使えません。'));
    if (session.isGuest) return fill(root, empty('shield', 'ゲストは保管庫を使えません。'));
    if (!m.pass) return fill(root, empty('shieldCheck', '保管庫を使うには、先にパスコードを決めてください。\n保管庫の鍵は、パスコードから作ります。', btn('パスコードを決める', () => os.open('settings', { page: 'security' }), { kind: 'pri' })));
    if (!key) return fill(root, empty('lock', reg.get('vault.meta') ? '保管庫には鍵がかかっています' : '暗号化して守るメモとファイルの置き場所です', btn(reg.get('vault.meta') ? '開く' : '保管庫を作る', unlock, { kind: 'pri', ic: 'key' })));
    const recs = (await db.vault.all()).sort((a, b) => b.mtime - a.mtime); const items = [];
    for (const r of recs) { try { items.push([r, await head(r)]); } catch { items.push([r, { name: '（読めません）', kind: 'file' }]); } }
    fill(root, h('div', { class: 'k-tools' },
      btn('新しいメモ', () => editNote(null, null, ''), { sm: true, kind: 'pri', ic: 'plus' }),
      btn('ファイルを入れる', e => os.ui.menu([{ label: 'XEVARIX のファイルから', icon: 'folder', fn: async () => { const n = await os.act.pickFile({ title: '保管庫に入れるファイル' }); if (n) { await addFile(n); draw(); } } }, { label: '端末から', icon: 'download', fn: async () => { for (const f of await pickFiles({ multiple: true })) await put(f.name, 'file', f.type, new Uint8Array(await f.arrayBuffer())); draw(); } }], e.currentTarget), { sm: true, ic: 'download' }),
      h('span', { class: 'k-sp' }), btn('鍵をかける', lock, { sm: true, ic: 'lock' })),
      h('div', { class: 'k-scroll' }, h('div', { class: 'k-pad k-col k-max' },
        items.length ? group(null, items.map(([r, hd]) => row({ icon: hd.kind === 'note' ? 'note' : /^image\//.test(hd.mime || '') ? 'image' : 'file', title: hd.name, desc: fmtStamp(r.mtime) + '・' + fmtBytes(r.size), onclick: () => openItem(r),
          right: ibtn('trash', '消す', async e => { e.stopPropagation(); if (await os.ui.confirm('消す', '「' + hd.name + '」を保管庫から完全に消します。元に戻せません。', { ok: '消す', danger: true })) { await db.vault.del(r.id); draw(); } }) })))
          : empty('shieldCheck', '保管庫は空です'),
        note('ここに入れたものは、名前も中身も暗号化されます。パスコードを忘れると、だれにも（作った私たちにも）開けません。'))));
  }
  draw();
  if (os.args && os.args.add && me().pass && security.ok) unlock();
  os.onArgs(async a => { if (a && a.add) { if (!key) { os.args.add = a.add; return unlock(); } const n = await fs.get(a.add); if (n) { await addFile(n); draw(); } } });
}

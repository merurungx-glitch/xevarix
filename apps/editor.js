/* XEVARIX 標準アプリ — エディタ（文字のファイルを編集する） */

import { h, fill, btn, ibtn, icon, fmtBytes } from './kit.js';

const CSS = `.e-area{flex:1;min-height:0;border:0;outline:0;resize:none;background:var(--surface-0);color:var(--text);padding:14px 16px;font-family:var(--font-mono);font-size:.875rem;line-height:1.7;tab-size:2;width:100%}
.e-area.wrap{white-space:pre-wrap} .e-area:not(.wrap){white-space:pre;overflow:auto}
.e-foot{display:flex;gap:14px;padding:5px 12px;border-top:1px solid var(--stroke);font-size:.72rem;color:var(--text-3);flex:none}`;

export default async function main(os, root) {
  const { fs } = os;
  document.head.append(h('style', { text: CSS }));
  let node = null, saved = '', wrap = true;
  const name = h('span', { class: 'tiny', style: 'flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600' });
  const ta = h('textarea', { class: 'e-area wrap', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', 'aria-label': '本文' });
  const pos = h('span'), size = h('span'), state = h('span');
  const dirty = () => ta.value !== saved;
  const paint = () => {
    name.textContent = (node ? node.name : '名前のないファイル') + (dirty() ? ' ●' : '');
    os.setTitle((node ? node.name : 'エディタ') + (dirty() ? ' ●' : ''));
    const upTo = ta.value.slice(0, ta.selectionStart); const ln = upTo.split('\n');
    pos.textContent = ln.length + ' 行・' + (ln[ln.length - 1].length + 1) + ' 文字目';
    size.textContent = ta.value.length + ' 文字・' + ta.value.split('\n').length + ' 行';
    state.textContent = dirty() ? '保存していません' : (node ? '保存ずみ' : '');
  };
  async function save(as) {
    try {
      if (!node || as) {
        let v = await os.ui.prompt('名前をつけて保存', '「ドキュメント」に保存します。', { value: node ? node.name : '新しいファイル.txt', max: 100 }); if (!v || !v.trim()) return false;
        v = v.trim(); if (!fs.extOf(v)) v += '.txt';            // 種類の印が無いと、あとで文字のファイルとして開けなくなる
        node = await fs.write(fs.DIRS.docs, v, ta.value, { mime: fs.isText({ name: v, mime: fs.mimeOf(v) }) ? null : 'text/plain' });
      } else node = await fs.update(node.id, ta.value);
      saved = ta.value; paint(); os.ui.toast('保存しました', 'ok'); return true;
    } catch (e) { os.ui.toast(e.message, 'warn'); return false; }
  }
  async function load(id) {
    if (dirty() && !await os.ui.confirm('保存していません', 'いまの変更を捨てて、別のファイルを開きますか？', { ok: '開く' })) return;
    const n = id ? await fs.get(id) : null;
    if (n && n.size > 2e6) { os.ui.toast('大きすぎて開けません（2MB まで）', 'warn'); return; }
    node = n; saved = n ? await fs.readText(n.id) : ''; ta.value = saved; ta.scrollTop = 0; paint();
  }
  fill(root, h('div', { class: 'k-tools' },
    ibtn('folder', '開く', async () => { const n = await os.act.pickFile({ title: '開くファイルをえらぶ', kinds: ['text'] }); if (n) load(n.id); }),
    ibtn('plus', '新しいファイル', () => load(null)),
    ibtn('save', '保存（Ctrl+S）', () => save(false)), name,
    ibtn('columns', '折り返す・折り返さない', e => { wrap = !wrap; ta.classList.toggle('wrap', wrap); e.currentTarget.classList.toggle('on', wrap); }, 'on'),
    ibtn('more', 'そのほか', e => os.ui.menu([
      { label: '名前をつけて保存', icon: 'save', fn: () => save(true) },
      node && /\.xsh$/i.test(node.name) && { label: 'ターミナルで動かす', icon: 'terminal', fn: async () => { if (dirty()) await save(false); os.open('terminal', { run: 'run ' + await fs.path(node.id) }); } },
      { label: 'すべて写す', icon: 'copy', fn: () => navigator.clipboard && navigator.clipboard.writeText(ta.value).then(() => os.ui.toast('コピーしました', 'ok')).catch(() => {}) },
      node && { label: 'フォルダを開く', icon: 'folder', fn: () => os.open('files', { dir: node.parent }) }], e.currentTarget))),
    ta, h('div', { class: 'e-foot' }, pos, size, h('span', { style: 'flex:1' }), state));
  ta.addEventListener('input', paint); ta.addEventListener('keyup', paint); ta.addEventListener('click', paint);
  /* 保存の近道は、窓のどこにいても効くようにする（道具の列を押したあとでも、ブラウザの「ページを保存」が出ない） */
  addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key || '').toLowerCase() === 's') { e.preventDefault(); save(e.shiftKey); }
  });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); const a = ta.selectionStart, b = ta.selectionEnd; ta.value = ta.value.slice(0, a) + '  ' + ta.value.slice(b); ta.selectionStart = ta.selectionEnd = a + 2; paint(); }
  });
  /* ふつうに閉じるときだけ確認する。強制終了（reason あり）のときは窓がもう無く、確認を出しても保存できないので出さない */
  /* Esc や外側を押したときは「やめる」（閉じない）。前は「捨てる」あつかいで、変更が消えていた */
  os.onClose(reason => {
    if (!dirty() || reason) return;
    os.ui.modal({ title: '保存していません', text: '「' + (node ? node.name : '名前のないファイル') + '」の変更を保存しますか？',
      buttons: [{ label: 'やめる', value: null, cancel: true }, { label: '捨てる', value: 'no' }, { label: '保存する', kind: 'pri', value: 'yes' }] })
      .then(async r => { if (!r) return; if (r === 'yes' && !await save(false)) return; saved = ta.value; os.close(); });
    return false;
  });
  os.onArgs(a => { if (a && a.id) load(a.id); });
  await load(os.args && os.args.id); ta.focus();
}

/* XEVARIX 標準アプリ — メモ（中身は ファイル › ドキュメント › メモ の .md ファイル。AI と検索からも引ける） */

import { h, fill, btn, ibtn, empty, icon, md, fmtRel, debounce, normJa } from './kit.js';

const CSS = `
.n-wrap{flex:1;min-height:0;display:grid;grid-template-columns:250px minmax(0,1fr)}
.n-side{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--stroke);background:var(--surface-0)}
.n-item{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--stroke);background:transparent;color:var(--text);padding:10px 14px;font:inherit}
.n-item:hover{background:var(--hover)} .n-item.on{background:var(--acc-soft)}
.n-item b{display:flex;align-items:center;gap:5px;font-weight:600;font-size:.875rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.n-item b .xi{width:13px;height:13px;color:var(--acc-text);flex:none}
.n-item small{display:block;color:var(--text-3);font-size:.74rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
.n-main{display:flex;flex-direction:column;min-width:0;min-height:0}
.n-title{border:0;outline:0;background:transparent;font-size:1.25rem;font-weight:700;padding:14px 18px 6px;color:var(--text);width:100%}
.n-body{flex:1;min-height:0;border:0;outline:0;resize:none;background:transparent;color:var(--text);padding:6px 18px 18px;line-height:1.8;font-size:.95rem;width:100%}
.n-prev{flex:1;min-height:0;overflow:auto;padding:6px 18px 18px}
.n-back{display:none}
@container app (max-width:620px){.n-wrap{grid-template-columns:minmax(0,1fr)}.n-wrap[data-view="edit"] .n-side{display:none}.n-wrap[data-view="list"] .n-main{display:none}.n-back{display:inline-grid}}
`;

export default async function main(os, root) {
  const { fs, reg } = os; const DIR = fs.DIRS.notes;
  document.head.append(h('style', { text: CSS }));
  let notes = [], cur = null, text = '', preview = false, q = '', dirty = false;
  const listEl = h('div', { class: 'k-scroll' }), main = h('div', { class: 'n-main' });
  const search = h('input', { class: 'field sm', type: 'search', placeholder: 'メモをさがす', 'aria-label': 'メモをさがす', oninput: () => { q = search.value; drawList(); } });
  const wrap = h('div', { class: 'n-wrap', data: { view: 'list' } }, h('div', { class: 'n-side' }, h('div', { class: 'k-tools' }, search, ibtn('plus', '新しいメモ', () => create())), listEl), main);
  fill(root, wrap);
  const pins = () => new Set(reg.get('notes.pins') || []);
  const titleOf = n => n.name.replace(/\.(md|txt)$/i, '');

  const save = debounce(async () => { if (!cur || !dirty) return; dirty = false; try { await fs.update(cur.id, text); } catch (e) { os.ui.toast(e.message, 'warn'); } }, 500);
  async function load() {
    const p = pins();
    notes = (await fs.ls(DIR)).filter(n => n.kind === 'file').sort((a, b) => (p.has(b.id) - p.has(a.id)) || (b.mtime - a.mtime));
  }
  function drawList() {
    const key = normJa(q), p = pins();
    const l = notes.filter(n => !key || normJa(n.name + ' ' + (n.excerpt || '')).includes(key));
    fill(listEl, l.length ? l.map(n => h('button', { class: 'n-item' + (cur && cur.id === n.id ? ' on' : ''), type: 'button', onclick: () => open(n.id) },
      h('b', null, p.has(n.id) ? icon('pin') : null, titleOf(n)), h('small', null, fmtRel(n.mtime) + '　' + (n.excerpt || '').replace(/\s+/g, ' ').slice(0, 40))))
      : empty('note', q ? '見つかりません' : 'メモはまだありません', q ? null : btn('メモを書く', () => create(), { kind: 'pri', sm: true })));
  }
  async function open(id) {
    save.flush();
    cur = notes.find(n => n.id === id) || await fs.get(id); if (!cur) return drawMain();
    text = await fs.readText(cur.id); dirty = false; wrap.dataset.view = 'edit';
    drawList(); drawMain();
  }
  async function create(body = '') {
    const d = new Date(); const n = await fs.write(DIR, (d.getMonth() + 1) + '月' + d.getDate() + '日のメモ.md', body);
    await load(); await open(n.id);
    const t = main.querySelector('.n-body'); t && t.focus();
  }
  function drawMain() {
    if (!cur) return fill(main, empty('note', '左の一覧からメモをえらぶか、新しく書きます', btn('新しいメモ', () => create(), { kind: 'pri' })));
    const p = pins().has(cur.id);
    const title = h('input', { class: 'n-title', value: titleOf(cur), maxlength: 60, 'aria-label': '題', onchange: async () => { const v = title.value.trim(); if (!v || v === titleOf(cur)) return; try { cur = await fs.rename(cur.id, v + '.md'); await load(); drawList(); } catch (e) { os.ui.toast(e.message, 'warn'); } } });
    const ta = h('textarea', { class: 'n-body', placeholder: 'ここに書きます。「- [ ] 」ではじめるとチェックリストになります。', 'aria-label': '本文', spellcheck: 'false', oninput: () => { text = ta.value; dirty = true; save(); count.textContent = text.length + ' 文字'; } });
    ta.value = text;
    const count = h('span', { class: 'tiny muted' }, text.length + ' 文字');
    const insert = s => { const a = ta.selectionStart, ls = text.lastIndexOf('\n', a - 1) + 1; text = text.slice(0, ls) + s + text.slice(ls); ta.value = text; ta.selectionStart = ta.selectionEnd = a + s.length; dirty = true; save(); ta.focus(); };
    fill(main, h('div', { class: 'k-tools' },
      ibtn('chevL', '一覧へ', () => { save.flush(); wrap.dataset.view = 'list'; }, 'n-back'),
      ibtn('pin', p ? 'ピンを外す' : 'いちばん上にとめる', () => { reg.update('notes.pins', l => (p ? l.filter(x => x !== cur.id) : [...(l || []), cur.id])); load().then(() => { drawList(); drawMain(); }); }, p ? 'on' : ''),
      ibtn('check', 'チェックリストの行を足す', () => insert('- [ ] ')),
      ibtn('list', '箇条書きの行を足す', () => insert('- ')),
      ibtn(preview ? 'edit' : 'eye', preview ? '書く' : '整えて見る', () => { preview = !preview; drawMain(); }, preview ? 'on' : ''),
      h('span', { class: 'k-sp' }), count,
      ibtn('more', 'そのほか', e => os.ui.menu([
        { label: '写す', icon: 'copy', fn: () => navigator.clipboard && navigator.clipboard.writeText(text).then(() => os.ui.toast('コピーしました', 'ok')).catch(() => {}) },
        { label: 'エディタで開く', icon: 'code', fn: () => os.open('editor', { id: cur.id }) },
        { label: '保管庫に入れる', icon: 'shieldCheck', fn: () => os.open('vault', { add: cur.id }) },
        '-', { label: 'ごみ箱へ', icon: 'trash', danger: true, fn: async () => { const id = cur.id; cur = null; await fs.trash(id); await load(); wrap.dataset.view = 'list'; drawList(); drawMain(); } }], e.currentTarget))),
      title, preview ? h('div', { class: 'n-prev' }, md(text)) : ta);
  }

  await load();
  const first = (os.args && os.args.id) || null;
  if (first) await open(first); else if (os.args && os.args.text) await create(os.args.text); else { drawList(); drawMain(); }
  os.onArgs(async a => { if (a && a.id) { await load(); open(a.id); } else if (a && a.text) create(a.text); });
  os.onClose(() => { save.flush(); });
  os.on('fs:change', debounce(async e => {
    await load(); drawList();
    if (cur && !notes.some(n => n.id === cur.id)) { cur = null; drawMain(); }
    else if (cur && e && e.id === cur.id && e.type === 'update' && !dirty && document.activeElement !== main.querySelector('.n-body')) { text = await fs.readText(cur.id); drawMain(); }
  }, 200));
}

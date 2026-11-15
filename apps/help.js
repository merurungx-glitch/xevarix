/* XEVARIX 標準アプリ — ヘルプ（本文は ai/kb.js。AI が答えるときの元と同じもの） */

import { h, fill, md, btn, page, navLayout, icon, normJa, empty } from './kit.js';
import { KB, KB_SECTIONS, SDK_DOC } from '../ai/kb.js';

export default async function main(os, root) {
  const run = a => os.sys.tryCall(a.call.name, a.call.args).then(r => { if (r && r.error) os.ui.toast(r.text, 'warn'); });
  const entry = e => h('section', { id: 'kb-' + e.id, style: 'padding:6px 0 14px;border-bottom:1px solid var(--stroke)' }, h('h3', { style: 'margin:10px 0 8px;font-size:1.02rem' }, e.title), md(e.body),
    e.actions && e.actions.length ? h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px' }, e.actions.map(a => btn(a.label, () => run(a), { sm: true }))) : null);
  const items = [{ sec: '使い方' }, { id: 'find', label: 'さがす', icon: 'search' }, ...KB_SECTIONS.map(([id, label, ic]) => ({ id, label, icon: ic })), { sec: '開発' }, { id: 'sdk', label: 'アプリを作る人へ', icon: 'code' }];
  const nav = navLayout(root, items, (id, main, arg) => {
    if (id === 'sdk') return fill(main, page(md(SDK_DOC)));
    if (id === 'find') {
      const out = h('div');
      const inp = h('input', { class: 'field', type: 'search', placeholder: '知りたいことを入れてください（例：電池、引きつぎ、保管庫）', 'aria-label': 'ヘルプをさがす', value: (arg && arg.q) || '', oninput: () => draw() });
      const draw = () => { const q = normJa(inp.value).replace(/\s+/g, ''); const l = q ? KB.filter(e => [e.title, e.body, ...e.keys].some(s => normJa(s).replace(/\s+/g, '').includes(q))) : []; fill(out, q ? (l.length ? l.map(entry) : empty('search', '見つかりませんでした。AI に聞いてみてください。', btn('AI に聞く', () => os.act.ai(inp.value), { kind: 'pri', sm: true }))) : h('p', { class: 'k-p' }, 'わからないことは、まん中の球（AI）に聞くのがいちばん早いです。「◯◯って何？」「◯◯のしかたは？」と聞いてください。')); };
      fill(main, page(h('h2', { class: 'k-h' }, 'ヘルプ'), inp, out)); draw(); setTimeout(() => inp.focus(), 60); return;
    }
    const sec = KB_SECTIONS.find(s => s[0] === id);
    fill(main, page(h('h2', { class: 'k-h' }, sec[1]), KB.filter(e => e.sec === id).map(entry)));
    if (arg && arg.id) { const t = main.querySelector('#kb-' + arg.id); t && t.scrollIntoView({ block: 'start' }); }
  }, 'start');
  const go = a => { if (!a) return; if (a.page === 'sdk') nav.go('sdk'); else if (a.id) { const e = KB.find(x => x.id === a.id); if (e) nav.go(e.sec, { id: e.id }); } else if (a.q) nav.go('find', a); };
  go(os.args); os.onArgs(go);
}

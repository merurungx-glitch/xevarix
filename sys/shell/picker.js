/* XEVARIX — ファイルえらび（アプリから「ファイルを1つえらんでもらう」ときの共通の窓） */

import { h, fill, fmtBytes } from '../util.js';
import { icon } from '../icons.js';

let X = null;
const KIND_ICON = { dir: 'folder', image: 'image', audio: 'music', video: 'video', text: 'fileText', pdf: 'file', file: 'file' };

/* opts: { title, kinds:['image','text',…], dirs:true でフォルダをえらぶ }  →  名札 か null */
function pickFile(opts = {}) {
  return new Promise(res => {
    let cur = X.fs.ROOT;
    const list = h('div', { style: 'max-height:46vh;overflow:auto;border:1px solid var(--stroke);border-radius:12px' });
    const crumbs = h('div', { style: 'display:flex;gap:4px;flex-wrap:wrap;align-items:center;font-size:.8125rem' });
    const done = v => { el.remove(); removeEventListener('keydown', onKey, true); res(v); };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } };
    const pickBtn = h('button', { class: 'btn pri', type: 'button', onclick: async () => done(await X.fs.get(cur)) }, 'このフォルダにする');
    const el = h('div', { class: 'xm' }, h('div', { class: 'scrim show', onpointerdown: () => done(null) }),
      h('div', { class: 'xm-card glass', role: 'dialog', 'aria-modal': 'true', style: 'width:min(520px,100%)' },
        h('h3', null, opts.title || 'ファイルをえらぶ'), crumbs, list,
        h('div', { class: 'xm-btns' }, h('button', { class: 'btn', type: 'button', onclick: () => done(null) }, 'やめる'), opts.dirs ? pickBtn : null)));
    async function draw() {
      const path = await X.fs.crumbs(cur);
      fill(crumbs, path.map((n, i) => [i ? h('span', { class: 'muted' }, '›') : null, h('button', { class: 'chip', type: 'button', style: 'height:26px', onclick: () => { cur = n.id; draw(); } }, n.id === X.fs.ROOT ? 'ファイル' : n.name)]));
      const kids = (await X.fs.ls(cur)).filter(n => n.kind === 'dir' || (!opts.dirs && (!opts.kinds || opts.kinds.includes(X.fs.kindOf(n)))));
      fill(list, kids.length ? kids.map(n => h('button', { class: 'k-row', type: 'button', onclick: () => { if (n.kind === 'dir') { cur = n.id; draw(); } else done(n); } },
        icon(KIND_ICON[X.fs.kindOf(n)] || 'file'), h('span', { class: 'k-rt' }, h('b', null, n.name)), h('span', { class: 'k-rr' }, n.kind === 'dir' ? icon('chevR') : fmtBytes(n.size))))
        : h('div', { class: 'xn-empty' }, 'ここには、えらべるものがありません'));
    }
    document.body.append(el); addEventListener('keydown', onKey, true); draw();
  });
}

export function init(ctx) { X = ctx; X.act.pickFile = pickFile; }

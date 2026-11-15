/* XEVARIX 標準アプリ — ビューア（画像・音・動画・PDF を開く） */

import { h, fill, btn, ibtn, empty, icon, fmtBytes, fmtStamp, saveBlob } from './kit.js';

const CSS = `.v-stage{flex:1;min-height:0;display:grid;place-items:center;overflow:auto;background:var(--surface-0);position:relative}
.v-stage img{max-width:100%;max-height:100%;object-fit:contain;display:block;transition:scale .15s}
.v-stage img.zoom{max-width:none;max-height:none;cursor:zoom-out} .v-stage img:not(.zoom){cursor:zoom-in}
.v-stage video{max-width:100%;max-height:100%;background:#000} .v-stage iframe{width:100%;height:100%;border:0;background:#fff}
.v-audio{display:grid;justify-items:center;gap:16px;padding:30px} .v-audio .xi{width:72px;height:72px;color:var(--acc-text)} .v-audio audio{width:min(420px,84vw)}
.v-text{align-self:stretch;justify-self:stretch;margin:0;padding:16px;white-space:pre-wrap;overflow-wrap:anywhere;font-family:var(--font-mono);font-size:.8125rem;line-height:1.7;user-select:text;-webkit-user-select:text}`;

export default async function main(os, root) {
  const { fs } = os;
  document.head.append(h('style', { text: CSS }));
  let url = null, node = null;
  const head = h('div', { class: 'k-tools' }), stage = h('div', { class: 'v-stage' });
  fill(root, head, stage);
  const free = () => { if (url) { URL.revokeObjectURL(url); url = null; } };

  async function show(id) {
    free();
    node = id ? await fs.get(id) : null;
    if (!node || node.kind !== 'file') {
      os.setTitle('ビューア');
      fill(head, h('span', { class: 'k-sp' }));
      return fill(stage, empty('image', '画像・音・動画・PDF を開けます', btn('ファイルをえらぶ', async () => { const n = await os.act.pickFile({ title: '開くファイルをえらぶ', kinds: ['image', 'audio', 'video', 'pdf'] }); if (n) show(n.id); }, { kind: 'pri' })));
    }
    os.setTitle(node.name);
    const k = fs.kindOf(node); const blob = await fs.readBlob(node.id);
    const sibs = (await fs.ls(node.parent)).filter(n => fs.kindOf(n) === k); const i = sibs.findIndex(n => n.id === node.id);
    fill(head,
      sibs.length > 1 ? [ibtn('chevL', '前へ', () => show(sibs[(i - 1 + sibs.length) % sibs.length].id)), ibtn('chevR', '次へ', () => show(sibs[(i + 1) % sibs.length].id))] : null,
      h('span', { class: 'tiny', style: 'flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, node.name, h('span', { class: 'muted' }, '　' + fmtBytes(node.size) + '・' + fmtStamp(node.mtime))),
      k === 'image' ? btn('壁紙にする', () => { os.reg.set('ui.wallImage', node.id); os.reg.set('ui.wall', 'image'); os.ui.toast('壁紙にしました', 'ok'); }, { sm: true, ic: 'image' }) : null,
      btn('書き出す', () => saveBlob(blob, node.name), { sm: true, ic: 'upload' }),
      ibtn('folder', '入っているフォルダを開く', () => os.open('files', { dir: node.parent })));
    if (k === 'image') { url = URL.createObjectURL(blob); const im = h('img', { src: url, alt: node.name, draggable: false, onclick: () => im.classList.toggle('zoom') }); fill(stage, im); }
    else if (k === 'audio') { url = URL.createObjectURL(blob); fill(stage, h('div', { class: 'v-audio' }, icon('music'), h('b', null, node.name), h('audio', { src: url, controls: true, autoplay: true }))); os.keepAlive(true); }
    else if (k === 'video') { url = URL.createObjectURL(blob); fill(stage, h('video', { src: url, controls: true, playsinline: true })); }
    else if (k === 'pdf') { url = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' })); fill(stage, h('iframe', { src: url, title: node.name })); }
    else if (k === 'text') fill(stage, h('pre', { class: 'v-text' }, (await fs.readText(node.id)).slice(0, 400000)));
    else fill(stage, empty('file', 'この種類のファイルは、XEVARIX の中では開けません。\n「書き出す」で端末に保存すると、ほかのアプリで開けます。'));
    if (k !== 'audio') os.keepAlive(false);
  }
  /* ← → は「前へ・次へ」があるときだけ（1つしか無いフォルダでは、別のボタンを押してしまっていた） */
  addEventListener('keydown', e => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; if (/INPUT|TEXTAREA|SELECT|AUDIO|VIDEO/.test(e.target.tagName || '')) return; const b = head.querySelector(e.key === 'ArrowLeft' ? '[aria-label="前へ"]' : '[aria-label="次へ"]'); if (b) b.click(); });
  os.onArgs(a => { if (a && a.id) show(a.id); });
  os.onClose(free);
  show(os.args && os.args.id);
}

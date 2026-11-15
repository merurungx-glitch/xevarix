/* XEVARIX — ホーム画面に追加（アプリとして入れる）の案内
   XEVORA（ランチャー）の「ホーム画面に追加」は、このページを #install で開く。
   ブラウザの決まりで、アプリとしての追加は そのアプリのページからしかできないため。
   はじめての設定・ロック画面の上にも出せるよう、main.js がいちばん先に読む（ほかの部品に頼らない）。 */

let ev = null, box = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); ev = e; paint(); });
addEventListener('appinstalled', () => { ev = null; paint(); });
const standalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch { return false; } };
const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function el(tag, css, text) { const n = document.createElement(tag); if (css) n.style.cssText = css; if (text != null) n.textContent = text; return n; }
function close() {
  if (box) { box.remove(); box = null; }
  if (location.hash === '#install') history.replaceState(null, '', location.pathname + location.search);
}
function paint() {
  if (!box) return;
  const body = box.querySelector('[data-b]'); body.replaceChildren();
  const step = (n, t) => { const r = el('div', 'display:flex;gap:10px;align-items:flex-start;text-align:left;font-size:.9rem;line-height:1.55'); r.append(el('b', 'flex:none;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(110deg,#2fe6ff,#2f6bff,#b45cff);color:#fff;font-size:.8rem', String(n)), el('span', null, t)); return r; };
  if (standalone()) body.append(el('p', 'margin:0', 'もうアプリとして開いています。ホーム画面の XEVARIX から開けます。'));
  else if (ev) {
    const b = el('button', 'border:0;border-radius:12px;padding:12px 18px;font:inherit;font-weight:700;color:#fff;background:linear-gradient(110deg,#2fe6ff,#2f6bff 52%,#b45cff);cursor:pointer', 'インストールする');
    b.onclick = async () => { try { ev.prompt(); await ev.userChoice; } catch { /* やめた */ } ev = null; paint(); };
    body.append(el('p', 'margin:0', '下のボタンで、XEVARIX をアプリとして入れます（ホーム画面・アプリの一覧に出ます）。'), b);
  } else if (ios()) {
    body.append(step(1, 'Safari の画面の下（iPad は上）にある共有ボタン（□に↑）を押す'), step(2, 'メニューから「ホーム画面に追加」を選ぶ'), step(3, '右上の「追加」を押して完了'));
  } else {
    body.append(step(1, 'アドレスバーの右にあるインストールのしるし（⊕ や 🖥）を押す'), step(2, '「インストール」を選ぶ'),
      el('p', 'margin:0;font-size:.8rem;opacity:.75', '見当たらないときは、ブラウザのメニューの「アプリをインストール」「ホーム画面に追加」から。'));
  }
}
export function showInstall() {
  if (!box) {
    box = el('div', 'position:fixed;inset:0;z-index:180;display:grid;place-items:center;padding:16px;background:rgba(2,4,20,.7);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)');
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'XEVARIX をホーム画面に追加');
    const card = el('div', 'width:min(420px,100%);display:grid;gap:12px;justify-items:center;text-align:center;padding:22px 20px;border-radius:22px;background:#0b1240;color:#eef2ff;box-shadow:0 20px 60px rgba(0,0,0,.5);font-family:inherit');
    const img = el('img', 'width:84px;height:84px;border-radius:22px'); img.src = 'assets/brand/icon-192.png'; img.alt = '';
    const x = el('button', 'border:1px solid rgba(160,190,255,.3);background:transparent;color:inherit;border-radius:12px;padding:9px 16px;font:inherit;cursor:pointer', '閉じる'); x.onclick = close;
    const b = el('div', 'display:grid;gap:10px;justify-items:center;width:100%'); b.dataset.b = '1';
    card.append(img, el('h2', 'margin:0;font-size:1.15rem', 'XEVARIX をホーム画面に追加'), b,
      el('p', 'margin:0;font-size:.78rem;opacity:.7', 'アプリのファイルは、ひらいたとき（または XEVORA の「インストール」）に入ります。'), x);
    box.append(card);
    box.addEventListener('pointerdown', e => { if (e.target === box) close(); });
    document.body.append(box);
  }
  paint();
}
if (location.hash === '#install') setTimeout(showInstall, 250);
addEventListener('hashchange', () => { if (location.hash === '#install') showInstall(); });

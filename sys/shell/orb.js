/* XEVARIX — コア（AI のロゴ）
   画面にいつもいる OS の「顔」。絵は assets/brand/xevarix-ai.webp（X のマーク・背景は透明）。
   外の輪で電池残量・輪の色で電力モード、ロゴのまわりの光で AI の考え中・聞き取り中がわかる。押すと AI が開く。
   （呼び方は前のまま makeOrb / setOrb。土星のような絵の球は 1.1.0 でやめた） */

export function makeOrb(cls = '') {
  const el = document.createElement('span');
  el.className = 'orb ' + cls;
  el.dataset.mode = 'balanced';
  el.innerHTML =
    '<i class="o-logo" aria-hidden="true"></i>' +
    '<svg viewBox="0 0 64 64" aria-hidden="true">' +
    '<circle class="o-track" cx="32" cy="32" r="30.5"/>' +
    '<circle class="o-batt" cx="32" cy="32" r="30.5" pathLength="100" stroke-dasharray="100 100"/>' +
    '</svg>';
  return el;
}

/* level: 0〜1 か null（読めない端末） */
export function setOrb(el, { mode, level, charging, busy, listen } = {}) {
  if (!el) return;
  if (mode) el.dataset.mode = mode;
  if (busy !== undefined) el.dataset.busy = busy ? '1' : '0';
  if (listen !== undefined) el.dataset.listen = listen ? '1' : '0';
  if (level !== undefined) {
    const arc = el.querySelector('.o-batt'), track = el.querySelector('.o-track');
    if (level == null) { arc.style.display = 'none'; track.style.display = 'none'; el.dataset.alert = ''; }
    else {
      arc.style.display = ''; track.style.display = '';
      arc.setAttribute('stroke-dasharray', Math.max(1, Math.round(level * 100)) + ' 100');
      el.dataset.alert = charging ? '' : level <= .08 ? 'crit' : level <= .2 ? 'low' : '';
    }
  }
}

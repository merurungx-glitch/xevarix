/* XEVARIX — QR コードを作る（バイトモード・誤り訂正 M・型番 1〜10）
   引きつぎの入口（アドレス＋コード、80文字ほど）を出すためのもの。213 バイトまで。
   仕様どおりに自前で組む：データ → リード・ソロモン符号 → 配置 → マスク8種から減点の少ないものを選ぶ。 */

/* 型番ごとの表（誤り訂正 M）: [ブロックあたりの訂正語数, [ブロック数, データ語数]…] */
const EC_M = [null, [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]], [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

/* GF(256) */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsGen(n) { let g = [1]; for (let i = 0; i < n; i++) { const next = new Array(g.length + 1).fill(0); for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); } g = next; } return g; }
function rsEncode(data, n) { const g = rsGen(n), rem = new Array(n).fill(0); for (const d of data) { const f = d ^ rem[0]; rem.shift(); rem.push(0); for (let i = 0; i < n; i++) rem[i] ^= mul(g[i + 1], f); } return rem; }
function bch(value, poly, bits) { let v = value << bits; const top = 31 - Math.clz32(poly); for (let i = 31 - Math.clz32(v); i >= top; i = 31 - Math.clz32(v)) { v ^= poly << (i - top); if (!v) break; } return (value << bits) | v; }

export function qrMatrix(text, debug) {
  const bytes = new TextEncoder().encode(String(text));
  let ver = 0;
  for (let v = 1; v <= 10; v++) { const cap = EC_M[v].slice(1).reduce((a, [n, d]) => a + n * d, 0); if (bytes.length + (v >= 10 ? 3 : 2) <= cap) { ver = v; break; } }
  if (!ver) throw new Error('QR に入れるには長すぎます');
  const spec = EC_M[ver], ecLen = spec[0], blocks = spec.slice(1);
  const dataLen = blocks.reduce((a, [n, d]) => a + n * d, 0);
  /* データの語を作る */
  const bits = []; const push = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1); };
  push(4, 4); push(bytes.length, ver >= 10 ? 16 : 8); for (const b of bytes) push(b, 8);
  push(0, Math.min(4, dataLen * 8 - bits.length)); while (bits.length % 8) bits.push(0);
  const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  for (let pad = 0xec; data.length < dataLen; pad ^= 0xec ^ 0x11) data.push(pad);
  /* ブロックに分けて訂正語を付け、順番にまぜる */
  const dBlocks = [], eBlocks = []; let p = 0;
  for (const [n, d] of blocks) for (let i = 0; i < n; i++) { const blk = data.slice(p, p + d); p += d; dBlocks.push(blk); eBlocks.push(rsEncode(blk, ecLen)); }
  const out = []; const maxD = Math.max(...dBlocks.map(b => b.length));
  for (let i = 0; i < maxD; i++) for (const b of dBlocks) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < ecLen; i++) for (const b of eBlocks) out.push(b[i]);
  /* 盤面 */
  const N = ver * 4 + 17; const M = Array.from({ length: N }, () => new Int8Array(N).fill(-1)); const F = Array.from({ length: N }, () => new Uint8Array(N));
  const set = (r, c, v) => { if (r >= 0 && r < N && c >= 0 && c < N) { M[r][c] = v ? 1 : 0; F[r][c] = 1; } };
  const finder = (r, c) => { for (let dr = -1; dr <= 7; dr++) for (let dc = -1; dc <= 7; dc++) { const inside = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6; set(r + dr, c + dc, inside && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4))); } };
  finder(0, 0); finder(0, N - 7); finder(N - 7, 0);
  for (let i = 8; i < N - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const al = ALIGN[ver];
  for (const r of al) for (const c of al) { if ((r === 6 && c === 6) || (r === 6 && c === al[al.length - 1]) || (r === al[al.length - 1] && c === 6)) continue; for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1); }
  set(N - 8, 8, 1);
  /* 形式の情報の場所を予約しておく */
  for (let i = 0; i < 9; i++) { if (!F[8][i]) set(8, i, 0); if (!F[i][8]) set(i, 8, 0); }
  for (let i = 0; i < 8; i++) { set(8, N - 1 - i, 0); set(N - 1 - i, 8, M[N - 1 - i][8] === 1); }
  if (ver >= 7) { const vi = bch(ver, 0x1f25, 12); for (let i = 0; i < 18; i++) { const b = (vi >> i) & 1; set(Math.floor(i / 3), N - 11 + (i % 3), b); set(N - 11 + (i % 3), Math.floor(i / 3), b); } }
  /* データをジグザグに置く */
  const stream = []; for (const cw of out) for (let i = 7; i >= 0; i--) stream.push((cw >> i) & 1);
  let k = 0, up = true;
  for (let c = N - 1; c > 0; c -= 2) { if (c === 6) c--; for (let i = 0; i < N; i++) { const r = up ? N - 1 - i : i; for (const cc of [c, c - 1]) if (!F[r][cc]) { M[r][cc] = k < stream.length ? stream[k] : 0; k++; } } up = !up; }
  /* マスクを8種ためして、減点の少ないものにする */
  const MASK = [(r, c) => (r + c) % 2 === 0, r => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0, (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0, (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0];
  const build = m => {
    const G = M.map(row => Int8Array.from(row));
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!F[r][c] && MASK[m](r, c)) G[r][c] ^= 1;
    const fi = bch((0 << 3) | m, 0x537, 10) ^ 0x5412;      // 誤り訂正 M は 00
    const bit = i => (fi >> i) & 1;
    for (let i = 0; i <= 5; i++) G[8][i] = bit(14 - i); G[8][7] = bit(8); G[8][8] = bit(7); G[7][8] = bit(6);
    for (let i = 0; i <= 5; i++) G[5 - i][8] = bit(5 - i);
    for (let i = 0; i <= 7; i++) G[8][N - 8 + i] = bit(7 - i);
    for (let i = 0; i <= 6; i++) G[N - 1 - i][8] = bit(14 - i);
    G[N - 8][8] = 1;
    return G;
  };
  const penalty = G => {
    let s = 0;
    for (let a = 0; a < 2; a++) for (let i = 0; i < N; i++) { let run = 1; for (let j = 1; j < N; j++) { const cur = a ? G[j][i] : G[i][j], prev = a ? G[j - 1][i] : G[i][j - 1]; if (cur === prev) { run++; if (j === N - 1 && run >= 5) s += run - 2; } else { if (run >= 5) s += run - 2; run = 1; } } }
    for (let r = 0; r < N - 1; r++) for (let c = 0; c < N - 1; c++) if (G[r][c] === G[r][c + 1] && G[r][c] === G[r + 1][c] && G[r][c] === G[r + 1][c + 1]) s += 3;
    const pat = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], rev = [...pat].reverse();
    for (let a = 0; a < 2; a++) for (let i = 0; i < N; i++) for (let j = 0; j <= N - 11; j++) { let m1 = true, m2 = true; for (let t = 0; t < 11; t++) { const v = a ? G[j + t][i] : G[i][j + t]; if (v !== pat[t]) m1 = false; if (v !== rev[t]) m2 = false; } if (m1) s += 40; if (m2) s += 40; }
    let dark = 0; for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) dark += G[r][c];
    s += Math.floor(Math.abs(dark * 100 / (N * N) - 50) / 5) * 10;
    return s;
  };
  let best = null, bestS = Infinity, bestM = 0;
  for (let m = 0; m < 8; m++) { const G = build(m), s = penalty(G); if (s < bestS) { bestS = s; best = G; bestM = m; } }
  if (debug) return { G: best, F, ver, mask: bestM, codewords: out, ecLen, blocks };
  return best;
}
/* 検算用（中の値をそのまま返す） */
export const qrDebug = text => qrMatrix(text, true);
export const _bch = bch;

/* SVG の要素にする（白地に黒。まわりに4マスの余白） */
export function qrSvg(text) {
  let G; try { G = qrMatrix(text); } catch { return null; }
  const N = G.length, Q = 4, S = N + Q * 2; let d = '';
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (G[r][c]) d += 'M' + (c + Q) + ' ' + (r + Q) + 'h1v1h-1z';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 ' + S + ' ' + S); svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'QR コード');
  svg.style.cssText = 'width:100%;height:100%;display:block;background:#fff';
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); p.setAttribute('fill', '#000'); svg.append(p);
  return svg;
}

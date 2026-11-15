/* XEVARIX — 計算と単位の変換（電卓・AI・ターミナル・検索が共通で使う）
   式は自前で読む（eval は使わない）。 */

const FUNCS = {
  sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1, sqrt: 1, cbrt: 1, ln: 1, log: 1, log2: 1, abs: 1, round: 1, floor: 1, ceil: 1, exp: 1,
  min: -1, max: -1, pow: 2, mod: 2,
};
const CONSTS = { pi: Math.PI, 'π': Math.PI, e: Math.E, tau: Math.PI * 2 };

function tokenize(src) {
  let s = String(src).normalize('NFKC').toLowerCase()
    .replace(/[×✕✖・]/g, '*').replace(/[÷]/g, '/').replace(/[−–—ー]/g, '-').replace(/[＾]/g, '^')
    .replace(/(\d),(?=\d{3}(\D|$))/g, '$1').replace(/\s+/g, '');
  const out = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i)); if (!m) throw new Error('数の書き方が正しくありません');
      out.push({ t: 'n', v: parseFloat(m[0]) }); i += m[0].length;
    } else if (/[a-zπ]/.test(c)) {
      const m = /^[a-zπ][a-z0-9]*/.exec(s.slice(i)); out.push({ t: 'id', v: m[0] }); i += m[0].length;
    } else if (c === '√') { out.push({ t: 'id', v: 'sqrt' }); i++; }
    else if ('+-*/^()!%,'.includes(c)) { out.push({ t: c }); i++; }
    else throw new Error('読めない文字があります: ' + c);
  }
  return out;
}

export function evaluate(src, { deg = true } = {}) {
  const tk = tokenize(src); let p = 0;
  if (!tk.length) throw new Error('式がありません');
  const peek = () => tk[p], eat = t => (tk[p] && tk[p].t === t ? tk[p++] : null);
  const toRad = x => (deg ? x * Math.PI / 180 : x), fromRad = x => (deg ? x * 180 / Math.PI : x);
  const fact = n => { if (n < 0 || n > 170 || Math.floor(n) !== n) throw new Error('階乗は 0〜170 の整数だけです'); let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
  function call(name, a) {
    switch (name) {
      case 'sin': return Math.sin(toRad(a[0])); case 'cos': return Math.cos(toRad(a[0])); case 'tan': return Math.tan(toRad(a[0]));
      case 'asin': return fromRad(Math.asin(a[0])); case 'acos': return fromRad(Math.acos(a[0])); case 'atan': return fromRad(Math.atan(a[0]));
      case 'sqrt': return Math.sqrt(a[0]); case 'cbrt': return Math.cbrt(a[0]); case 'ln': return Math.log(a[0]); case 'log': return Math.log10(a[0]); case 'log2': return Math.log2(a[0]);
      case 'abs': return Math.abs(a[0]); case 'round': return Math.round(a[0]); case 'floor': return Math.floor(a[0]); case 'ceil': return Math.ceil(a[0]); case 'exp': return Math.exp(a[0]);
      case 'min': return Math.min(...a); case 'max': return Math.max(...a); case 'pow': return Math.pow(a[0], a[1]); case 'mod': return a[0] % a[1];
    }
    throw new Error('その関数はありません: ' + name);
  }
  function primary() {
    const t = peek(); if (!t) throw new Error('式が途中で終わっています');
    if (t.t === 'n') { p++; return t.v; }
    if (t.t === '(') { p++; const v = expr(); if (!eat(')')) throw new Error('かっこが閉じていません'); return v; }
    if (t.t === 'id') {
      p++;
      if (t.v in FUNCS) {
        if (eat('(')) { const args = [expr()]; while (eat(',')) args.push(expr()); if (!eat(')')) throw new Error('かっこが閉じていません'); if (FUNCS[t.v] > 0 && args.length !== FUNCS[t.v]) throw new Error(t.v + ' に渡す数の個数がちがいます'); return call(t.v, args); }
        return call(t.v, [unary()]);
      }
      if (t.v in CONSTS) return CONSTS[t.v];
      throw new Error('読めない言葉があります: ' + t.v);
    }
    throw new Error('式の書き方が正しくありません');
  }
  function postfix() {
    let v = primary();
    for (;;) { if (eat('!')) v = fact(v); else if (eat('%')) v = v / 100; else break; }
    return v;
  }
  function power() { const b = postfix(); if (eat('^')) return Math.pow(b, unary()); return b; }
  function unary() { if (eat('-')) return -unary(); if (eat('+')) return unary(); return power(); }
  function term() {
    let v = unary();
    for (;;) {
      if (eat('*')) v *= unary();
      else if (eat('/')) { const d = unary(); if (d === 0) throw new Error('0 では割れません'); v /= d; }
      else { const t = peek(); if (t && (t.t === '(' || t.t === 'id' || t.t === 'n')) v *= unary(); else break; }   // 2π・3(4+5) のような省略したかけ算
    }
    return v;
  }
  function expr() { let v = term(); for (;;) { if (eat('+')) v += term(); else if (eat('-')) v -= term(); else break; } return v; }
  const v = expr();
  if (p < tk.length) throw new Error('式の書き方が正しくありません');
  if (!isFinite(v)) throw new Error('答えが大きすぎるか、計算できません');
  return v;
}

export function fmtNum(x, digits = 12) {
  if (!isFinite(x)) return String(x);
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e15 || a < 1e-9) return x.toExponential(Math.min(8, digits - 1)).replace(/\.?0+e/, 'e').replace('e+', 'e');
  let s = Number(x.toPrecision(digits)).toString();
  if (s.includes('e')) s = Number(x.toPrecision(digits)).toFixed(10).replace(/\.?0+$/, '');
  const [i, f] = s.split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : '');
}
/* 式らしいかどうか（検索や AI が「計算だ」と気づくため） */
export function looksLikeMath(s) {
  s = String(s || '').normalize('NFKC').trim();
  return s.length > 0 && /\d/.test(s) && /^[\d\s.,+\-*/^()!%×÷√πa-z]+$/i.test(s) && /[+\-*/^!%×÷√(]|sqrt|sin|cos|tan|log|ln/i.test(s);
}

/* ── 単位の変換 ── 基準の単位への倍率。温度だけ式がちがう */
const U = {
  length: { base: 'm', u: { mm: .001, cm: .01, m: 1, km: 1000, inch: .0254, ft: .3048, yd: .9144, mile: 1609.344, 'ミリ': .001, 'センチ': .01, 'メートル': 1, 'キロメートル': 1000, 'キロ': 1000, 'インチ': .0254, 'フィート': .3048, 'ヤード': .9144, 'マイル': 1609.344, '尺': .30303, '寸': .030303, '里': 3927.27 } },
  weight: { base: 'g', u: { mg: .001, g: 1, kg: 1000, t: 1e6, oz: 28.349523, lb: 453.59237, 'ミリグラム': .001, 'グラム': 1, 'キログラム': 1000, 'キロ': 1000, 'トン': 1e6, 'オンス': 28.349523, 'ポンド': 453.59237, '貫': 3750, '匁': 3.75 } },
  area: { base: 'm2', u: { m2: 1, km2: 1e6, cm2: 1e-4, ha: 1e4, a: 100, '平方メートル': 1, '平米': 1, '平方キロメートル': 1e6, 'ヘクタール': 1e4, 'アール': 100, '坪': 3.305785, '畳': 1.62, 'エーカー': 4046.8564, acre: 4046.8564 } },
  volume: { base: 'l', u: { ml: .001, l: 1, cc: .001, m3: 1000, 'ミリリットル': .001, 'リットル': 1, '立方メートル': 1000, 'ガロン': 3.785412, gal: 3.785412, 'カップ': .2, '合': .18039, '升': 1.8039, '大さじ': .015, '小さじ': .005 } },
  speed: { base: 'm/s', u: { 'm/s': 1, 'km/h': 1 / 3.6, mph: .44704, kn: .514444, '秒速': 1, '時速': 1 / 3.6, 'ノット': .514444, 'マッハ': 340.29 } },
  time: { base: 's', u: { ms: .001, s: 1, min: 60, h: 3600, d: 86400, 'ミリ秒': .001, '秒': 1, '分': 60, '時間': 3600, '日': 86400, '週間': 604800, '週': 604800, '年': 31557600 } },
  data: { base: 'b', u: { b: 1, kb: 1024, mb: 1048576, gb: 1073741824, tb: 1099511627776, 'バイト': 1, 'キロバイト': 1024, 'メガバイト': 1048576, 'メガ': 1048576, 'ギガバイト': 1073741824, 'ギガ': 1073741824, 'テラバイト': 1099511627776, 'テラ': 1099511627776 } },
  temp: { base: 'c', u: { c: 1, f: 1, k: 1, '℃': 1, '°c': 1, '℉': 1, '°f': 1, '度': 1, '摂氏': 1, '華氏': 1, 'ケルビン': 1 } },
};
const TEMP = { c: 'c', '℃': 'c', '°c': 'c', '度': 'c', '摂氏': 'c', f: 'f', '℉': 'f', '°f': 'f', '華氏': 'f', k: 'k', 'ケルビン': 'k' };
const norm = u => String(u || '').normalize('NFKC').trim().toLowerCase().replace(/²/g, '2').replace(/³/g, '3');
export function unitKind(u) { u = norm(u); for (const k in U) if (u in U[k].u) return k; return null; }
export function unitNames() { const out = []; for (const k in U) out.push(...Object.keys(U[k].u)); return out.sort((a, b) => b.length - a.length); }
export function convert(value, from, to) {
  from = norm(from); to = norm(to);
  const k = Object.keys(U).find(x => from in U[x].u && to in U[x].u); if (!k) throw new Error('その単位どうしは変換できません');
  if (k === 'temp') {
    const a = TEMP[from], b = TEMP[to]; const c = a === 'c' ? value : a === 'f' ? (value - 32) * 5 / 9 : value - 273.15;
    return b === 'c' ? c : b === 'f' ? c * 9 / 5 + 32 : c + 273.15;
  }
  return value * U[k].u[from] / U[k].u[to];
}
export const UNIT_GROUPS = {
  length: ['長さ', ['mm', 'cm', 'm', 'km', 'inch', 'ft', 'mile']], weight: ['重さ', ['mg', 'g', 'kg', 't', 'oz', 'lb']], temp: ['温度', ['℃', '℉', 'k']],
  area: ['広さ', ['m2', 'km2', 'ha', '坪', '畳', 'acre']], volume: ['かさ', ['ml', 'l', 'm3', 'gal', 'カップ', '合']], speed: ['速さ', ['m/s', 'km/h', 'mph', 'kn']],
  time: ['時間', ['秒', '分', '時間', '日', '週']], data: ['データ', ['b', 'kb', 'mb', 'gb', 'tb']],
};

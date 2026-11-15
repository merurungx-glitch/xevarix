/* XEVARIX 標準アプリ — 電卓（ふつうの計算・関数・単位の変換） */

import { h, fill, tabs, select, ibtn, icon } from './kit.js';
import { evaluate, fmtNum, convert, UNIT_GROUPS } from '../sys/mathx.js';

const CSS = `
.c-wrap{flex:1;min-height:0;display:flex;flex-direction:column;width:100%;max-width:520px;margin:0 auto}
.c-disp{padding:14px 16px 8px;display:grid;gap:2px;min-height:96px;align-content:end;border-bottom:1px solid var(--stroke);background:var(--surface-0)}
.c-expr{font-size:1.02rem;color:var(--text-2);min-height:1.5em;overflow-wrap:anywhere;text-align:right;font-variant-numeric:tabular-nums;user-select:text;-webkit-user-select:text}
.c-res{font-size:2.1rem;font-weight:600;line-height:1.15;text-align:right;overflow-wrap:anywhere;font-variant-numeric:tabular-nums;letter-spacing:-.01em;user-select:text;-webkit-user-select:text}
.c-res.err{font-size:.95rem;font-weight:500;color:var(--danger)}
.c-res.pre{color:var(--text-3)}
.c-keys{flex:1;min-height:0;display:grid;grid-template-columns:repeat(4,1fr);gap:7px;padding:10px}
.c-fn{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;padding:8px 10px 0}
.c-fn .c-k{min-height:34px}
.c-k{border:0;border-radius:13px;background:var(--surface-2);color:var(--text);font-size:1.15rem;font-weight:500;min-height:42px;display:grid;place-items:center;padding:0}
.c-k:hover{background:var(--surface-3)} .c-k:active{scale:.95}
.c-k.op{background:var(--acc-soft);color:var(--acc-text);font-size:1.3rem}
.c-k.fn{background:var(--surface-0);color:var(--text-2);font-size:.85rem;font-weight:600}
.c-k.eq{background:var(--acc);color:var(--acc-ink);font-size:1.4rem;font-weight:700}
.c-k.cl{color:var(--danger)}
.c-bar{display:flex;align-items:center;gap:6px;padding:6px 10px 0}
.c-hist{position:absolute;inset:0;background:var(--surface-1);display:flex;flex-direction:column;z-index:3}
.c-hrow{display:block;width:100%;text-align:right;border:0;border-bottom:1px solid var(--stroke);background:transparent;color:var(--text);padding:10px 16px;font:inherit}
.c-hrow small{display:block;color:var(--text-3);font-size:.78rem} .c-hrow b{font-size:1.1rem;font-weight:600}
.c-hrow:hover{background:var(--hover)}
.u-form{display:grid;gap:12px;padding:16px}
.u-pair{display:grid;grid-template-columns:minmax(0,1fr) 110px;gap:8px}
.u-out{font-size:1.9rem;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere;user-select:text;-webkit-user-select:text}
`;

export default async function main(os, root) {
  document.head.append(h('style', { text: CSS }));
  let expr = '', deg = true, sci = false, justEq = false, tab = 'calc';
  let hist = os.reg.get('calc.history') || [];
  const body = h('div', { class: 'c-wrap', style: 'position:relative' });
  const tb = tabs([['calc', '電卓', 'calc'], ['unit', '単位の変換', 'repeat']], tab, v => { tab = v; draw(); });
  fill(root, tb, body);

  const exprEl = h('div', { class: 'c-expr' }), resEl = h('div', { class: 'c-res' }, '0');
  const pretty = s => s.replace(/\*/g, '×').replace(/\//g, '÷').replace(/-/g, '−');
  function show() {
    exprEl.textContent = pretty(expr);
    if (!expr) { resEl.className = 'c-res'; resEl.textContent = '0'; return; }
    try { resEl.className = 'c-res pre'; resEl.textContent = fmtNum(evaluate(expr, { deg })); }
    catch { resEl.className = 'c-res pre'; resEl.textContent = ''; }
  }
  function equals() {
    if (!expr) return;
    try {
      const v = evaluate(expr, { deg }); const out = fmtNum(v);
      hist.unshift({ e: pretty(expr), r: out }); hist = hist.slice(0, 40); os.reg.set('calc.history', hist);
      exprEl.textContent = pretty(expr) + ' ='; resEl.className = 'c-res'; resEl.textContent = out;
      expr = String(Number(v.toPrecision(12))); justEq = true;
    } catch (e) { resEl.className = 'c-res err'; resEl.textContent = e.message; }
  }
  function press(k) {
    if (k === '=') return equals();
    if (k === 'C') { expr = ''; justEq = false; return show(); }
    if (k === 'del') { expr = justEq ? '' : expr.slice(0, -1); justEq = false; return show(); }
    if (k === 'neg') { expr = expr ? (/^-\(.*\)$/.test(expr) ? expr.slice(2, -1) : '-(' + expr + ')') : '-'; justEq = false; return show(); }
    if (justEq && /^[0-9.(πe]|^(sin|cos|tan|ln|log|sqrt)/.test(k)) expr = '';
    justEq = false; expr += k; show();
  }
  const key = (label, k, cls = '') => h('button', { class: 'c-k ' + cls, type: 'button', 'aria-label': label, onclick: () => { os.ui.haptic(); press(k); } }, label);

  function drawCalc() {
    const std = [
      key('C', 'C', 'fn cl'), key('(', '(', 'fn'), key(')', ')', 'fn'), key('÷', '/', 'op'),
      key('7', '7'), key('8', '8'), key('9', '9'), key('×', '*', 'op'),
      key('4', '4'), key('5', '5'), key('6', '6'), key('−', '-', 'op'),
      key('1', '1'), key('2', '2'), key('3', '3'), key('+', '+', 'op'),
      key('±', 'neg', 'fn'), key('0', '0'), key('.', '.'), key('=', '=', 'eq'),
    ];
    const extra = [key('sin', 'sin(', 'fn'), key('cos', 'cos(', 'fn'), key('tan', 'tan(', 'fn'), key('√', 'sqrt(', 'fn'), key('xʸ', '^', 'fn'),
      key('ln', 'ln(', 'fn'), key('log', 'log(', 'fn'), key('π', 'π', 'fn'), key('e', 'e', 'fn'), key('n!', '!', 'fn'), key('%', '%', 'fn')];
    extra.push(key('x²', '^2', 'fn'));
    const keys = h('div', { class: 'c-keys' }, std);
    const fnKeys = sci ? h('div', { class: 'c-fn' }, extra) : null;
    const bar = h('div', { class: 'c-bar' },
      h('button', { class: 'chip' + (sci ? ' on' : ''), type: 'button', onclick: () => { sci = !sci; drawCalc(); } }, '関数'),
      sci ? h('button', { class: 'chip', type: 'button', title: '角度の単位', onclick: () => { deg = !deg; drawCalc(); show(); } }, deg ? '度（DEG）' : 'ラジアン（RAD）') : null,
      h('span', { class: 'k-sp' }),
      ibtn('history', '計算の記録', () => drawHist()),
      ibtn('arrowL', '1文字消す', () => press('del')));
    fill(body, h('div', { class: 'c-disp' }, exprEl, resEl), bar, fnKeys, keys);
    show();
  }
  function drawHist() {
    const box = h('div', { class: 'c-hist' },
      h('div', { class: 'k-head' }, ibtn('chevL', 'もどる', () => box.remove()), h('h1', null, '計算の記録'),
        hist.length ? h('button', { class: 'btn sm', type: 'button', onclick: () => { hist = []; os.reg.set('calc.history', []); box.remove(); } }, '消す') : null),
      h('div', { class: 'k-scroll' }, hist.length ? hist.map(x => h('button', { class: 'c-hrow', type: 'button', onclick: () => { expr = x.r.replace(/,/g, ''); justEq = true; box.remove(); show(); } }, h('small', null, x.e), h('b', null, x.r)))
        : h('div', { class: 'k-empty' }, icon('history'), 'まだ記録はありません')));
    body.append(box);
  }

  function drawUnit() {
    let kind = os.reg.get('calc.unitKind') || 'length'; let val = '1';
    const out = h('div', { class: 'u-out' }), form = h('div', { class: 'u-form' });
    const build = () => {
      const [, units] = UNIT_GROUPS[kind]; let from = units[0], to = units[1] || units[0];
      const calc = () => { const v = parseFloat(String(val).replace(/,/g, '')); if (!isFinite(v)) { out.textContent = '—'; return; } try { out.textContent = fmtNum(convert(v, from, to), 8) + ' ' + to; } catch (e) { out.textContent = e.message; } };
      const inp = h('input', { class: 'field', type: 'text', inputmode: 'decimal', value: val, 'aria-label': '変える数', oninput: () => { val = inp.value; calc(); } });
      const sf = select(units.map(u => [u, u]), from, v => { from = v; calc(); }), st = select(units.map(u => [u, u]), to, v => { to = v; calc(); });
      fill(form,
        select(Object.entries(UNIT_GROUPS).map(([k, [name]]) => [k, name]), kind, v => { kind = v; os.reg.set('calc.unitKind', v); build(); }),
        h('div', { class: 'u-pair' }, inp, sf),
        h('div', { style: 'display:flex;align-items:center;gap:8px;color:var(--text-3)' }, icon('arrowD'), h('button', { class: 'btn sm', type: 'button', onclick: () => { const a = sf.value; sf.value = st.value; st.value = a; from = sf.value; to = st.value; calc(); } }, icon('repeat'), '入れかえる')),
        h('div', { class: 'u-pair' }, out, st));
      calc();
    };
    build();
    fill(body, h('div', { class: 'k-scroll' }, form));
  }
  function draw() { tab === 'calc' ? drawCalc() : drawUnit(); }

  addEventListener('keydown', e => {
    if (tab !== 'calc' || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (/^[0-9.+\-*/()^%!]$/.test(k)) { e.preventDefault(); press(k); }
    else if (k === 'Enter' || k === '=') { e.preventDefault(); equals(); }
    else if (k === 'Backspace') { e.preventDefault(); press('del'); }
    else if (k === 'Escape' || k === 'Delete') { e.preventDefault(); press('C'); }
  });
  draw();
}

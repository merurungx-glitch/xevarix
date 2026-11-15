/* XEVARIX 標準アプリ — カレンダー（月の予定・祝日・時刻のお知らせ） */

import { h, fill, btn, ibtn, row, group, select, icon, pad2 } from './kit.js';

const WD = ['日', '月', '火', '水', '木', '金', '土'];
const CSS = `.cal{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 300px}
.cal-m{display:flex;flex-direction:column;min-height:0;min-width:0}
.cal-g{flex:1;min-height:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));grid-auto-rows:minmax(54px,1fr);border-top:1px solid var(--stroke)}
.cal-w{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));font-size:.72rem;font-weight:700;color:var(--text-3);text-align:center;padding:6px 0}
.cal-w span:first-child,.cal-d.sun .n,.cal-d.hol .n{color:var(--danger)} .cal-w span:last-child,.cal-d.sat .n{color:var(--acc-text)}
.cal-d{border:0;border-right:1px solid var(--stroke);border-bottom:1px solid var(--stroke);background:transparent;color:var(--text);padding:4px 5px;text-align:left;font:inherit;display:flex;flex-direction:column;gap:2px;min-width:0;overflow:hidden}
.cal-d:hover{background:var(--hover)} .cal-d.out{opacity:.38} .cal-d.sel{background:var(--acc-soft)}
.cal-d .n{font-size:.8rem;font-weight:600;width:22px;height:22px;display:grid;place-items:center;border-radius:50%}
.cal-d.today .n{background:var(--acc);color:var(--acc-ink)!important}
.cal-d i{font-style:normal;font-size:.64rem;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-radius:4px;padding:0 4px;background:var(--acc-soft);color:var(--text)}
.cal-d i.h{background:transparent;color:var(--danger);padding:0}
.cal-s{border-left:1px solid var(--stroke);background:var(--surface-0);display:flex;flex-direction:column;min-height:0}
@container app (max-width:700px){.cal{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1.2fr) minmax(0,1fr)}.cal-s{border-left:0;border-top:1px solid var(--stroke)}.cal-d i:not(.h){font-size:0;height:5px;width:5px;padding:0;border-radius:50%;background:var(--acc)}.cal-g{grid-auto-rows:minmax(40px,1fr)}}`;

/* 分 → 「10分」「1時間」「1日」 */
const span = m => (m >= 1440 && m % 1440 === 0 ? (m / 1440) + '日' : m >= 60 && m % 60 === 0 ? (m / 60) + '時間' : m + '分');

/* 日本の祝日（2020年代〜）。振替休日と、祝日にはさまれた平日（国民の休日）も入れる */
function holidays(y) {
  const m = new Map(); const key = (mo, d) => y + '-' + pad2(mo) + '-' + pad2(d);
  const nthMon = (mo, n) => { const first = new Date(y, mo - 1, 1).getDay(); return 1 + ((8 - first) % 7) + (n - 1) * 7; };
  const eq = b => Math.floor(b + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
  const base = [[1, 1, '元日'], [1, nthMon(1, 2), '成人の日'], [2, 11, '建国記念の日'], [2, 23, '天皇誕生日'], [3, eq(20.8431), '春分の日'], [4, 29, '昭和の日'], [5, 3, '憲法記念日'], [5, 4, 'みどりの日'], [5, 5, 'こどもの日'],
    [7, nthMon(7, 3), '海の日'], [8, 11, '山の日'], [9, nthMon(9, 3), '敬老の日'], [9, eq(23.2488), '秋分の日'], [10, nthMon(10, 2), 'スポーツの日'], [11, 3, '文化の日'], [11, 23, '勤労感謝の日']];
  for (const [mo, d, n] of base) m.set(key(mo, d), n);
  for (const [mo, d] of base) { const dt = new Date(y, mo - 1, d); if (dt.getDay() !== 0) continue; do dt.setDate(dt.getDate() + 1); while (m.has(key(dt.getMonth() + 1, dt.getDate()))); m.set(key(dt.getMonth() + 1, dt.getDate()), '振替休日'); }
  for (const [mo, d] of base) { const a = new Date(y, mo - 1, d + 1), b = new Date(y, mo - 1, d + 2); const ka = key(a.getMonth() + 1, a.getDate()); if (!m.has(ka) && m.has(key(b.getMonth() + 1, b.getDate())) && a.getDay() !== 0) m.set(ka, '国民の休日'); }
  return m;
}

export default async function main(os, root) {
  const S = os.services;
  document.head.append(h('style', { text: CSS }));
  const now = new Date(); const dk = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  let y = now.getFullYear(), mo = now.getMonth(), sel = dk(now);
  const title = h('h1'), grid = h('div', { class: 'cal-g' }), side = h('div', { class: 'cal-s' });
  fill(root, h('div', { class: 'cal' },
    h('div', { class: 'cal-m' },
      h('div', { class: 'k-head' }, title, ibtn('chevL', '前の月', () => move(-1)), btn('今日', () => { y = now.getFullYear(); mo = now.getMonth(); sel = dk(new Date()); draw(); }, { sm: true }), ibtn('chevR', '次の月', () => move(1))),
      h('div', { class: 'cal-w' }, WD.map(d => h('span', null, d))), grid), side));
  const move = n => { mo += n; if (mo < 0) { mo = 11; y--; } else if (mo > 11) { mo = 0; y++; } draw(); };
  const events = () => (S ? S.events() : []);

  async function edit(ev) {
    const isNew = !ev; ev = ev || { date: sel, time: '', remind: 10, title: '', note: '' };
    const t = h('input', { class: 'field', value: ev.title, placeholder: '予定の名前', maxlength: 80, 'aria-label': '予定の名前' });
    const d = h('input', { class: 'field', type: 'date', value: ev.date, 'aria-label': '日付' }), tm = h('input', { class: 'field', type: 'time', value: ev.time || '', 'aria-label': '時刻' });
    const rm = select([['', 'お知らせしない'], [0, 'その時刻に'], [5, '5分前'], [10, '10分前'], [30, '30分前'], [60, '1時間前'], [1440, '1日前']], ev.remind == null ? '' : ev.remind, () => {});
    const nt = h('textarea', { class: 'field', rows: 3, placeholder: 'メモ（なくてもよい）', 'aria-label': 'メモ' }); nt.value = ev.note || '';
    const r = await os.ui.modal({ title: isNew ? '予定を足す' : '予定を直す', body: h('div', { style: 'display:grid;gap:8px' }, t, h('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:8px' }, d, tm), rm, nt),
      buttons: [!isNew && { label: '消す', kind: 'danger', value: 'del' }, { label: 'やめる', value: null, cancel: true }, { label: '保存', kind: 'pri', value: 'ok' }].filter(Boolean) });
    if (r === 'del') S.eventRemove(ev.id);
    else if (r === 'ok') { if (!t.value.trim() || !d.value) return os.ui.toast('名前と日付を入れてください', 'warn'); S.eventSave({ id: ev.id, title: t.value.trim(), date: d.value, time: tm.value || null, remind: rm.value === '' || !tm.value ? null : Number(rm.value), note: nt.value }); sel = d.value; }
    draw();
  }

  function draw() {
    title.textContent = y + '年 ' + (mo + 1) + '月';
    const hol = new Map([...holidays(y - 1), ...holidays(y), ...holidays(y + 1)]);
    const evs = events(), byDay = new Map(); for (const e of evs) { if (!byDay.has(e.date)) byDay.set(e.date, []); byDay.get(e.date).push(e); }
    const first = new Date(y, mo, 1), start = new Date(y, mo, 1 - first.getDay()), todayK = dk(new Date());
    const weeks = Math.ceil((first.getDay() + new Date(y, mo + 1, 0).getDate()) / 7);
    const cells = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), k = dk(d), hn = hol.get(k), list = (byDay.get(k) || []).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      cells.push(h('button', { class: 'cal-d' + (d.getMonth() !== mo ? ' out' : '') + (k === todayK ? ' today' : '') + (k === sel ? ' sel' : '') + (d.getDay() === 0 ? ' sun' : d.getDay() === 6 ? ' sat' : '') + (hn ? ' hol' : ''), type: 'button', 'aria-label': (d.getMonth() + 1) + '月' + d.getDate() + '日' + (hn ? ' ' + hn : '') + (list.length ? ' 予定' + list.length + '件' : ''),
        onclick: () => { sel = k; if (d.getMonth() !== mo) { y = d.getFullYear(); mo = d.getMonth(); } draw(); }, ondblclick: () => edit(null) },
        h('span', { class: 'n' }, d.getDate()), hn ? h('i', { class: 'h' }, hn) : null, list.slice(0, 2).map(e => h('i', null, (e.time ? e.time + ' ' : '') + e.title)), list.length > 2 ? h('i', null, '＋' + (list.length - 2)) : null));
    }
    fill(grid, cells);
    const sd = new Date(sel + 'T00:00:00'), dayEv = (byDay.get(sel) || []).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const soon = evs.filter(e => e.date > sel).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).slice(0, 5);
    fill(side, h('div', { class: 'k-head' }, h('h1', null, (sd.getMonth() + 1) + '月' + sd.getDate() + '日（' + WD[sd.getDay()] + '）' + (hol.get(sel) ? '　' + hol.get(sel) : '')), S ? ibtn('plus', '予定を足す', () => edit(null)) : null),
      h('div', { class: 'k-scroll' }, h('div', { class: 'k-pad k-col', style: 'padding:12px' },
        !S ? h('p', { class: 'k-p' }, '予定のしくみを読みこめませんでした。') : null,
        group(null, dayEv.length ? dayEv.map(e => row({ icon: 'clock', title: e.title, desc: (e.time || '終日') + (e.remind != null && e.time ? '・お知らせ ' + (e.remind ? span(e.remind) + '前' : 'あり') : '') + (e.note ? '\n' + e.note : ''), onclick: () => edit(e) })) : row({ title: '予定はありません', desc: '＋ か、日付の2度押しで足せます。' })),
        soon.length ? group('このあとの予定', soon.map(e => row({ icon: 'calendar', title: e.title, desc: e.date.slice(5).replace('-', '/') + (e.time ? ' ' + e.time : ''), onclick: () => { sel = e.date; const d = new Date(e.date + 'T00:00:00'); y = d.getFullYear(); mo = d.getMonth(); draw(); } }))) : null)));
  }
  os.on('calendar:change', draw);
  addEventListener('keydown', e => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') { const d = new Date(sel + 'T00:00:00'); d.setDate(d.getDate() + ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 })[e.key]); sel = dk(d); y = d.getFullYear(); mo = d.getMonth(); draw(); } else if (e.key === 'Enter') edit(null); });
  draw();
}

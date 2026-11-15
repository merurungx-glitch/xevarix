/* XEVARIX 標準アプリ — システムモニター（概要・プロセス・電力・性能・ログ） */

import { h, fill, tabs, btn, ibtn, card, meter, badge, kv, group, row, note, icon, appTile, lineChart, barChart, fmtBytes, fmtDur, fmtStamp, fmtClock } from './kit.js';

const ST = { starting: ['起動中', 'mute'], running: ['実行中', 'ok'], suspended: ['休止', 'warn'], hibernated: ['深い休止', 'mute'] };
const PR = { nominal: 'ふつう', fair: 'やや高い', serious: '高い', critical: 'とても高い' };

export default async function main(os, root) {
  const { proc, perf, power, wm } = os;
  let tab = (os.args && os.args.tab) || 'over', stopFps = null, logFilter = 'all';
  const body = h('div', { class: 'k-scroll' });
  const tb = tabs([['over', '概要', 'activity'], ['proc', 'プロセス', 'cpu'], ['power', '電力', 'bolt'], ['perf', '性能', 'gauge'], ['log', 'ログ', 'list']], tab, v => { tab = v; draw(); });
  fill(root, tb, body);
  os.onArgs(a => { if (a && a.tab) { tab = a.tab; tb.set(tab); draw(); } });
  const chart = (hgt = 110) => h('canvas', { class: 'k-chart', style: 'height:' + hgt + 'px' });
  const wrap = (...k) => h('div', { class: 'k-pad k-col' }, k);

  /* ── 概要 ── */
  const over = {};
  async function drawOver() {
    over.fps = h('div', { class: 'k-big' }); over.load = h('div', { class: 'k-big' }); over.mem = h('div', { class: 'k-big' }); over.batt = h('div', { class: 'k-big' });
    over.c1 = chart(); over.c2 = chart(); over.c3 = chart(); over.sub = {};
    for (const k of ['fps', 'load', 'mem', 'batt', 'net', 'sto']) over.sub[k] = h('div', { class: 'tiny muted' });
    over.stoBig = h('div', { class: 'k-big' }); over.stoM = h('div'); over.netBig = h('div', { class: 'k-big', style: 'font-size:1.2rem' });
    fill(body, wrap(h('div', { class: 'k-grid' },
      card('なめらかさ（手前のアプリ）', 'activity', over.fps, over.sub.fps, over.c1),
      card('描画の負荷（全アプリ）', 'cpu', over.load, over.sub.load, over.c2),
      card('メモリ（このページ全体）', 'chip', over.mem, over.sub.mem, over.c3),
      card('電池', 'battery', over.batt, over.sub.batt),
      card('保存容量', 'database', over.stoBig, over.stoM, over.sub.sto),
      card('通信', 'wifi', over.netBig, over.sub.net))));
    const st = await perf.storage();
    over.stoBig.textContent = fmtBytes(st.usage); fill(over.stoM, meter(st.quota ? st.usage / st.quota : 0)); over.sub.sto.textContent = '上限 約 ' + fmtBytes(st.quota) + (st.persisted ? '・守られています' : '');
    tickOver();
  }
  function tickOver() {
    if (!over.fps || !over.fps.isConnected) return;
    const H = perf.history(), fg = proc.fg(), l = proc.list(), mem = perf.memory(), b = power.battery, n = perf.network();
    const load = Math.min(1, l.reduce((a, p) => a + (p.stats.load || 0), 0));
    fill(over.fps, fg ? String(fg.stats.fps) : '—', h('small', null, fg ? 'fps・' + fg.app.name : '手前のアプリなし'));
    over.sub.fps.textContent = '上限 ' + (proc.policy.fpsCap || 'なし') + (proc.policy.fpsCap ? ' fps' : '') + '（' + power.info().name + '）';
    fill(over.load, Math.round(load * 100) + '', h('small', null, '%')); over.sub.load.textContent = '実行中 ' + l.filter(p => p.state === 'running').length + '・休止 ' + l.filter(p => p.state !== 'running').length + '・端末の負荷 ' + (PR[perf.pressure] || '—');
    fill(over.mem, mem ? fmtBytes(mem.used) : '—'); over.sub.mem.textContent = mem ? '上限 ' + fmtBytes(mem.limit) : 'このブラウザでは測れません';
    fill(over.batt, b ? Math.round(b.level * 100) + '' : '—', b ? h('small', null, '%' + (b.charging ? '・充電中' : '')) : null);
    const rem = power.remainingMin(), dr = power.drainRate(); over.sub.batt.textContent = b ? (rem ? 'あと約 ' + fmtDur(rem * 60000, true) : '') + (dr ? '・1時間に ' + dr.toFixed(1) + '%' : '') : 'この端末では読めません';
    over.netBig.textContent = n.online ? 'オンライン' : 'オフライン'; over.sub.net.textContent = n.online ? [n.type && n.type.toUpperCase(), n.downlink ? '約 ' + n.downlink + ' Mbps' : '', n.rtt ? '遅れ ' + n.rtt + ' ms' : '', n.saveData ? '通信の節約オン' : ''].filter(Boolean).join('・') || '速さは、このブラウザでは測れません' : '通信なしでも XEVARIX は使えます';
    lineChart(over.c1, H.map(x => x.fps), { min: 0, max: 65 });
    lineChart(over.c2, H.map(x => x.load * 100), { min: 0, max: 100 });
    if (mem) lineChart(over.c3, H.map(x => x.mem / 1048576), { min: 0 });
  }

  /* ── プロセス ── */
  let procBox = null;
  function drawProc() {
    procBox = h('div');
    fill(body, wrap(
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center' },
        btn('ブースト（裏を休止）', async () => { const r = await os.sys.tryCall('sys.boost', {}); os.ui.toast(r.text, r.error ? 'warn' : 'ok'); tickProc(); }, { sm: true, ic: 'bolt' }),
        btn('すべて終了', async () => { if (await os.ui.confirm('すべて終了', 'このモニター以外のアプリをすべて閉じます。', { ok: '終了する', danger: true })) { for (const p of proc.list()) if (p.pid !== os.pid) proc.kill(p.pid, 'force'); tickProc(); } }, { sm: true }),
        h('span', { class: 'tiny muted' }, '「休止」は描画・タイマー・音を止めます。「深い休止」は中身を下ろしてメモリを空け、開くと読みこみ直します。')),
      procBox));
    tickProc();
  }
  function tickProc() {
    if (!procBox || !procBox.isConnected) return;
    const l = proc.list(); const esum = l.reduce((a, p) => a + p.stats.energy, 0) || 1;
    fill(procBox, h('table', { class: 'k-table' },
      h('thead', null, h('tr', null, ['アプリ', '状態', 'fps', '負荷', '消費', '手前の時間', '詰まり', ''].map(t => h('th', null, t)))),
      h('tbody', null, l.map(p => {
        const vis = wm.visibility(p.win);
        return h('tr', null,
          h('td', null, h('span', { style: 'display:flex;align-items:center;gap:8px;white-space:nowrap' }, appTile(p.app), h('span', null, p.app.name, h('span', { class: 'tiny muted' }, '　pid ' + p.pid)))),
          h('td', null, badge(ST[p.state][0], ST[p.state][1]), h('span', { class: 'tiny muted' }, vis === 'focus' ? '　手前' : vis === 'visible' ? '　表示中' : '　裏')),
          h('td', { class: 'num' }, p.probe ? p.stats.fps : '—'), h('td', { class: 'num' }, p.probe ? Math.round(p.stats.load * 100) + '%' : '—'),
          h('td', { class: 'num' }, Math.round(p.stats.energy / esum * 100) + '%'), h('td', { class: 'num' }, fmtDur(p.fgMs, true)), h('td', { class: 'num' }, Math.round(p.stats.longMs) + ' ms'),
          h('td', null, h('span', { style: 'display:flex;gap:4px;justify-content:flex-end' },
            p.state === 'running' && p.pid !== os.pid ? btn('休止', () => { wm.minimize(p.win); proc.suspend(p.pid); tickProc(); }, { sm: true }) : p.state !== 'running' && p.state !== 'starting' ? btn('再開', () => { wm.focus(p.win); tickProc(); }, { sm: true }) : null,
            p.pid !== os.pid ? btn('終了', () => { proc.kill(p.pid, 'force'); tickProc(); }, { sm: true, kind: 'danger' }) : null)));
      }))),
      l.some(p => !p.probe && p.state === 'running') ? h('p', { class: 'k-p', style: 'margin-top:10px' }, 'fps と負荷が「—」のアプリは、別のサイトのページなので中を測れません（休止は「見えなくして止める」だけになります）。') : null);
  }

  /* ── 電力 ── */
  async function drawPower() {
    const d = power.today(), hist = await power.history(7), shares = power.shares(id => (os.apps.get(id) || {}).name || id);
    const c1 = chart(130), c2 = chart(120); const tot = Object.values(d.modeMs).reduce((a, b) => a + b, 0) || 1;
    fill(body, wrap(
      h('div', { class: 'k-grid' },
        card('いまのモード', power.info().icon, h('div', { class: 'k-big' }, power.info().name), h('div', { class: 'tiny muted' }, power.reason || power.info().desc)),
        card('今日のモードの内わけ', 'clock', power.MODE_ORDER.map(id => h('div', { style: 'display:grid;grid-template-columns:76px 1fr 44px;gap:8px;align-items:center;font-size:.75rem' }, h('span', null, power.MODES[id].short), meter(d.modeMs[id] / tot), h('span', { class: 'muted', style: 'text-align:right' }, fmtDur(d.modeMs[id] || 0, true)))))),
      card('今日の電池残量', 'battery', power.hasBattery ? c1 : h('div', { class: 'tiny muted' }, 'この端末・ブラウザは電池残量を読めないため、グラフは出せません。')),
      card('この7日間の、省電力で動いた割合', 'leaf', c2),
      group('アプリごとの消費（今日・見積もり）', shares.length ? shares.slice(0, 10).map(s => h('div', { class: 'k-row col' }, h('div', { style: 'display:flex;justify-content:space-between;gap:10px' }, h('b', { style: 'font-weight:600' }, s.name), h('span', { class: 'muted tiny' }, Math.round(s.share * 100) + '%' + (s.batt >= .5 ? '・電池 ' + s.batt.toFixed(1) + '%ぶん' : ''))), meter(s.share))) : row({ title: 'まだ記録がありません' })),
      btn('電力の設定を開く', () => os.open('settings', { page: 'power' }), { ic: 'settings' })));
    requestAnimationFrame(() => {
      const s = d.samples.filter(x => x.lv != null);
      if (power.hasBattery && s.length > 1) lineChart(c1, s.map(x => x.lv), { min: 0, max: 100, labels: [fmtClock(new Date(s[0].t)), fmtClock(new Date(s[s.length - 1].t))] });
      barChart(c2, hist.map(x => { const t = Object.values(x.modeMs || {}).reduce((a, b) => a + b, 0); return { v: t ? ((x.modeMs.saver || 0) + (x.modeMs.ultra || 0)) / t * 100 : 0, label: x.day.slice(5).replace('-', '/'), dim: x.day !== d.day }; }), { max: 100 });
    });
  }

  /* ── 性能 ── */
  const pf = {};
  function drawPerf() {
    const b = os.sysreg.get('device.bench'), d = perf.device(), lt = perf.long();
    pf.fps = h('div', { class: 'k-big' }); pf.sub = h('div', { class: 'tiny muted' });
    fill(body, wrap(
      h('div', { class: 'k-grid' },
        card('XEVARIX 本体のなめらかさ', 'activity', pf.fps, pf.sub),
        card('端末の測定', 'gauge', h('div', { class: 'k-big' }, b ? b.score : '—', h('small', null, b ? perf.tierName(b.tier) : '未測定')), h('div', { class: 'tiny muted' }, b ? '計算 ' + b.cpu + '・組み立て ' + b.dom + '・描画 ' + b.gfx : ''),
          btn('測り直す', async e => { e.currentTarget.disabled = true; await os.sys.tryCall('bench.run', {}); drawPerf(); }, { sm: true, ic: 'refresh' })),
        card('起動', 'bolt', h('div', { class: 'k-big' }, (os.sysreg.get('boot.lastMs') || 0) + '', h('small', null, 'ミリ秒')), h('div', { class: 'tiny muted' }, '起動してから ' + fmtDur(os.uptime(), true)))),
      group('処理の詰まり（50ミリ秒以上つづいた処理）', kv('回数', lt.count + ' 回'), kv('合計', Math.round(lt.ms) + ' ミリ秒'), kv('うち XEVARIX 本体', Math.round(lt.shellMs) + ' ミリ秒'), kv('端末の負荷', PR[perf.pressure] || '—')),
      group('この端末', kv('OS とブラウザ', d.os + '・' + d.browser), kv('コア数', d.cores), kv('メモリ（見当）', d.memGB ? '約 ' + d.memGB + ' GB' : null), kv('GPU', d.gpu), kv('画面', d.screen + '（×' + d.dpr + '）')),
      note('ここを開いているあいだだけ、本体のなめらかさを連続で測っています（測ること自体が少し電気を使うため、ふだんは測りません）。')));
    if (!stopFps) stopFps = perf.watch();
    tickPerf();
  }
  function tickPerf() { if (pf.fps && pf.fps.isConnected) { fill(pf.fps, perf.fps + '', h('small', null, 'fps')); pf.sub.textContent = '遅いときの1こま ' + Math.round(perf.p95) + ' ミリ秒'; } }

  /* ── ログ ── */
  let logBox = null;
  function drawLog() {
    logBox = h('div', { class: 'mono k-sel', style: 'font-size:.75rem;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere' });
    fill(body, wrap(h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;align-items:center' },
      ['all', 'warn', 'error'].map(f => h('button', { class: 'chip' + (logFilter === f ? ' on' : ''), type: 'button', onclick: () => { logFilter = f; drawLog(); } }, { all: 'すべて', warn: '注意と失敗', error: '失敗だけ' }[f])),
      h('span', { class: 'k-sp' }), btn('写す', () => { navigator.clipboard && navigator.clipboard.writeText(logBox.textContent).then(() => os.ui.toast('ログをコピーしました', 'ok')).catch(() => {}); }, { sm: true, ic: 'copy' })), logBox));
    tickLog();
  }
  function tickLog() {
    if (!logBox || !logBox.isConnected) return;
    const l = os.logs().filter(e => logFilter === 'all' || (logFilter === 'warn' ? e.level !== 'info' : e.level === 'error')).slice(-300);
    fill(logBox, l.length ? l.map(e => h('div', { style: e.level === 'error' ? 'color:var(--danger)' : e.level === 'warn' ? 'color:var(--warn)' : '' }, fmtStamp(e.t) + ':' + String(new Date(e.t).getSeconds()).padStart(2, '0') + '  [' + e.src + '] ' + e.msg)) : '記録はありません');
    body.scrollTop = body.scrollHeight;
  }

  function draw() {
    if (tab !== 'perf' && stopFps) { stopFps(); stopFps = null; }
    ({ over: drawOver, proc: drawProc, power: drawPower, perf: drawPerf, log: drawLog })[tab]();
  }
  os.on('proc:tick', () => { if (tab === 'over') tickOver(); else if (tab === 'proc') tickProc(); });
  os.on('perf:fps', () => { if (tab === 'perf') tickPerf(); });
  os.on('log', () => { if (tab === 'log') tickLog(); });
  for (const ev of ['proc:spawn', 'proc:exit', 'proc:state']) os.on(ev, () => { if (tab === 'proc') tickProc(); });
  os.onClose(() => { if (stopFps) stopFps(); });
  draw();
}

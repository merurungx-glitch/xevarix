/* XEVARIX 標準アプリ — ターミナル（コマンドで XEVARIX を操作する xsh） */

import { h, fmtBytes, fmtDur, fmtStamp, sleep } from './kit.js';

const CSS = `.t-wrap{flex:1;min-height:0;display:flex;flex-direction:column;background:#020617;color:#d7e3ff;font-family:var(--font-mono);font-size:.8125rem;line-height:1.65}
:root[data-theme="light"] .t-wrap{background:#0a1030}
.t-out{flex:1;min-height:0;overflow:auto;padding:10px 12px 4px;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;-webkit-user-select:text}
.t-out .c{color:#63ebff} .t-out .e{color:#ff8a9a} .t-out .o{color:#74f5c9} .t-out .m{color:#7688bd} .t-out .l{color:#b39cff}
.t-in{display:flex;gap:8px;align-items:center;padding:6px 12px 10px;flex:none}
.t-in span{color:#63ebff;white-space:nowrap} .t-in input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:#fff;font:inherit;caret-color:#63ebff}`;

const LOGO = ['        ▄▄▄▄▄▄        ', '     ▄██▀▀▀▀▀▀██▄   ▄ ', '    ██▀   ▄▄▄▄▄██████▀', '   ▄████████▀▀▀▀  ██  ', ' ▄██▀▀██▄       ▄██   ', ' ▀▀    ▀██▄▄▄▄██▀     ', '         ▀▀▀▀▀▀       '];

export default async function main(os, root) {
  const { fs, proc, power, perf, reg, apps } = os;
  document.head.append(h('style', { text: CSS }));
  const out = h('div', { class: 't-out', role: 'log', 'aria-live': 'polite' }), input = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'コマンド' }), prompt = h('span');
  root.append(h('div', { class: 't-wrap', onclick: () => { if (!String(getSelection())) input.focus(); } }, out, h('div', { class: 't-in' }, prompt, input)));
  let cwd = fs.ROOT, hist = reg.get('terminal.history') || [], hi = hist.length, busy = false;
  const print = (text, cls = '') => { out.append(h('div', { class: cls }, text === '' ? ' ' : String(text))); if (out.children.length > 600) out.firstChild.remove(); out.scrollTop = out.scrollHeight; };
  const setPrompt = async () => { prompt.textContent = os.user().name + ':' + ((await fs.path(cwd)) || '/') + ' ›'; };
  const call = async (name, args) => { const r = await os.sys.call(name, args); print(r.text || 'OK', 'o'); return r; };
  const node = async p => { const n = await fs.resolve(p, cwd); if (!n) throw new Error('見つかりません: ' + p); return n; };
  const dur = s => { let t = 0; const m = String(s).match(/(\d+(?:\.\d+)?)(h|m|s)?/g); if (!m) return NaN; for (const x of m) { const [, n, u] = /([\d.]+)(h|m|s)?/.exec(x); t += parseFloat(n) * (u === 'h' ? 3600 : u === 'm' ? 60 : 1); } return t; };
  const st = { starting: '起動中', running: '実行中', suspended: '休止', hibernated: '深い休止' };

  const HELP = [
    ['help [コマンド]', '使い方'], ['ls [場所]  cd <場所>  pwd', 'フォルダを見る・移る'], ['cat <ファイル>  write <ファイル> <文>', '読む・書く'], ['mkdir <名前>  touch <名前>  rm <名前>  mv <名前> <フォルダ>  cp <名前> <フォルダ>', 'ファイルの操作'],
    ['open <アプリ|ファイル>', '開く'], ['ps  kill <pid|アプリ>  suspend <アプリ>  apps', 'プロセス'], ['power [max|balanced|saver|ultra]  battery  boost', '電力'], ['perf  bench  storage  sys', '状態'],
    ['theme <dark|light|auto>  accent <色>  wall <壁紙>', '見た目'], ['timer <3m|90s|1h30m> [名前]  alarm <7:30> [名前]  timers', '時計'], ['notify <文>  dnd <on|off>  focus <分|off>', '通知・集中'],
    ['space <名前>  routine <名前>  routines', 'スペース・ルーティン'], ['calc <式>  convert <数> <単位> <単位>', '計算'], ['ai <文>', 'AI に聞く'], ['calls  call <命令> [JSON]', 'システムコールを直接呼ぶ'],
    ['run <ファイル.xsh>  sleep <秒>  echo <文>', 'スクリプト'], ['log [件数]  audit [件数]  history  clear', '記録'], ['lock  reboot  fullscreen  exit', 'システム'],
  ];

  const CMD = {
    async help(a) { if (a[0]) { const r = HELP.filter(x => x[0].split(/\s+/).some(w => w === a[0])); return r.length ? r.forEach(x => print(x[0] + '\n    ' + x[1])) : print('そのコマンドはありません', 'e'); } print('XEVARIX のコマンド（xsh）', 'c'); for (const [c, d] of HELP) print('  ' + c + '\n      ' + d, ''); print('Tab で補完、↑↓ で前のコマンド。', 'm'); },
    async pwd() { print((await fs.path(cwd)) || '/'); },
    async ls(a) { const n = a[0] ? await node(a[0]) : await fs.get(cwd); const l = n.kind === 'dir' ? await fs.ls(n.id) : [n]; if (!l.length) return print('（空）', 'm'); for (const x of l) print((x.kind === 'dir' ? 'd ' : '- ') + (x.kind === 'dir' ? '        ' : fmtBytes(x.size).padStart(8)) + '  ' + fmtStamp(x.mtime).padEnd(11) + '  ' + x.name + (x.kind === 'dir' ? '/' : ''), x.kind === 'dir' ? 'c' : ''); },
    async cd(a) { const n = a[0] ? await node(a[0]) : await fs.get(fs.ROOT); if (n.kind !== 'dir') throw new Error('フォルダではありません'); cwd = n.id; },
    async cat(a) { const n = await node(a[0] || ''); if (n.kind !== 'file') throw new Error('ファイルではありません'); if (!fs.isText(n)) throw new Error('文字のファイルではありません（' + fs.kindOf(n) + '）'); print(await fs.readText(n.id)); },
    async mkdir(a) { if (!a[0]) throw new Error('名前を入れてください'); print((await fs.mkdir(cwd, a[0])).name + ' を作りました', 'o'); },
    async touch(a) { if (!a[0]) throw new Error('名前を入れてください'); print((await fs.write(cwd, a[0], '')).name + ' を作りました', 'o'); },
    async write(a) { if (a.length < 2) throw new Error('write <ファイル> <文>'); const n = await fs.write(cwd, a[0], a.slice(1).join(' ') + '\n', { overwrite: true }); print(n.name + ' に書きました（' + fmtBytes(n.size) + '）', 'o'); },
    async rm(a) { const n = await node(a[0] || ''); await fs.trash(n.id); print(n.name + ' をごみ箱へ入れました', 'o'); },
    async mv(a) { const n = await node(a[0] || ''), d = await node(a[1] || ''); if (d.kind !== 'dir') { await fs.rename(n.id, a[1]); return print('名前を変えました', 'o'); } await fs.move(n.id, d.id); print('動かしました', 'o'); },
    async cp(a) { const n = await node(a[0] || ''), d = a[1] ? await node(a[1]) : await fs.get(cwd); await fs.copy(n.id, d.id); print('写しました', 'o'); },
    async open(a) { const q = a.join(' '); const n = q && await fs.resolve(q, cwd); if (n && n.id !== fs.ROOT) { os.act.openFile(n); return print(n.name + ' を開きました', 'o'); } await call('app.open', { app: q }); },
    async ps() { print('  PID  状態        fps  負荷  アプリ', 'm'); for (const p of proc.list()) print(String(p.pid).padStart(5) + '  ' + st[p.state].padEnd(8, '　') + String(p.probe ? p.stats.fps : '-').padStart(5) + String(p.probe ? Math.round(p.stats.load * 100) + '%' : '-').padStart(6) + '  ' + p.app.name); },
    async kill(a) { const p = /^\d+$/.test(a[0] || '') ? proc.get(Number(a[0])) : null; if (p) { proc.kill(p.pid, 'force'); return print(p.app.name + ' を終了しました', 'o'); } await call('app.close', { app: a.join(' ') }); },
    async suspend(a) { await call('app.suspend', { app: a.join(' ') }); },
    async apps() { for (const x of apps.installed()) print((x.kind === 'system' ? '標準  ' : x.kind === 'web' ? 'ストア' : '機能  ') + '  ' + x.id.padEnd(18) + x.name); },
    async power(a) { if (a[0]) await call('power.mode', { mode: a[0] }); else await call('power.status', {}); },
    async battery() { await call('power.status', {}); },
    async boost() { await call('sys.boost', {}); },
    async perf() { await call('perf.report', {}); },
    async bench() { print('測っています…', 'm'); await call('bench.run', {}); },
    async storage() { await call('storage.report', {}); },
    async sys() { const d = perf.device(), b = os.sysreg.get('device.bench'); const info = [os.OS.name + ' ' + os.OS.version + '（' + os.OS.codename + '）', '提供  ' + os.OS.by, '土台  ' + d.os + '・' + d.browser, '装置  ' + (d.cores ? d.cores + ' コア' : '') + (d.memGB ? '・約' + d.memGB + 'GB' : ''), 'GPU   ' + (d.gpu || '—').slice(0, 44), '画面  ' + d.screen + '（×' + d.dpr + '）・' + os.wm.mode, '電力  ' + power.info().name + (power.battery ? '・' + Math.round(power.battery.level * 100) + '%' : ''), '測定  ' + (b ? b.score + ' 点' : '未測定') + '・起動 ' + (os.sysreg.get('boot.lastMs') || 0) + 'ms']; for (let i = 0; i < Math.max(LOGO.length, info.length); i++) out.append(h('div', null, h('span', { class: 'c' }, LOGO[i] || ' '.repeat(22)), '  ' + (info[i] || ''))); out.scrollTop = out.scrollHeight; },
    async version() { print(os.OS.name + ' ' + os.OS.version + '（' + os.OS.build + '）'); },
    async uptime() { print(fmtDur(os.uptime())); },
    async whoami() { const u = os.user(); print(u.name + (u.guest ? '（ゲスト）' : '') + '  id=' + u.id); },
    async date() { await call('time.now', {}); },
    async theme(a) { await call('ui.theme', { theme: a[0] }); }, async accent(a) { await call('ui.accent', { accent: a[0] }); }, async wall(a) { await call('ui.wall', { wall: a[0] }); },
    async timer(a) { const s = dur(a[0]); if (!(s > 0)) throw new Error('timer 3m のように時間を入れてください'); await call('timer.start', { seconds: s, label: a.slice(1).join(' ') }); },
    async timers() { await call('timer.list', {}); },
    async alarm(a) { await call('alarm.set', { time: a[0], label: a.slice(1).join(' ') }); },
    async notify(a) { await call('notify.send', { title: 'ターミナル', body: a.join(' ') }); },
    async dnd(a) { await call('notify.dnd', { on: a[0] !== 'off' }); },
    async focus(a) { if (a[0] === 'off') await call('focus.stop', {}); else await call('focus.start', { minutes: Number(a[0]) || 25 }); },
    async space(a) { await call('space.switch', { space: a.join(' ') }); },
    async routine(a) { await call('routine.run', { name: a.join(' ') }); },
    async routines() { const l = os.services ? os.services.routines() : []; if (!l.length) return print('ルーティンはありません', 'm'); for (const r of l) print((r.on ? '● ' : '○ ') + r.name + '   ' + os.services.triggerText(r.trigger), ''); },
    async calc(a) { await call('calc', { expr: a.join(' ') }); },
    async convert(a) { await call('convert', { value: Number(a[0]), from: a[1], to: a[2] }); },
    async ai(a) { if (!os.ai) throw new Error('AI を読みこめませんでした'); const r = await os.ai.ask(a.join(' '), { by: 'terminal' }); print(r.text, 'l'); },
    async calls() { for (const c of os.sys.list()) print(c.name.padEnd(20) + c.title + (Object.keys(c.args || {}).length ? '   {' + Object.keys(c.args).join(', ') + '}' : ''), ''); },
    async call(a) { if (!a[0]) throw new Error('call <命令> [JSON]'); let args = {}; if (a[1]) { try { args = JSON.parse(a.slice(1).join(' ')); } catch { throw new Error('引数は JSON で書いてください（例: {"mode":"saver"}）'); } } await call(a[0], args); },
    async get(a) { if (!reg.get('dev.mode')) throw new Error('開発者モードで使えます（設定 → 開発者）'); print(JSON.stringify(reg.get(a[0]), null, 1)); },
    async set(a) { if (!reg.get('dev.mode')) throw new Error('開発者モードで使えます（設定 → 開発者）'); reg.set(a[0], JSON.parse(a.slice(1).join(' '))); print('OK', 'o'); },
    async echo(a) { print(a.join(' ')); },
    async sleep(a) { await sleep(Math.min(60, Number(a[0]) || 1) * 1000); },
    async run(a) { const n = await node(a[0] || ''); const src = await fs.readText(n.id); let i = 0; for (const ln of src.split('\n')) { const s = ln.trim(); if (!s || s.startsWith('#')) continue; if (++i > 200) throw new Error('行が多すぎます（200行まで）'); print('› ' + s, 'm'); await exec(s, true); } },
    async log(a) { for (const e of os.logs().slice(-(Number(a[0]) || 20))) print(fmtStamp(e.t) + ' [' + e.src + '] ' + e.msg, e.level === 'error' ? 'e' : e.level === 'warn' ? 'l' : 'm'); },
    async audit(a) { for (const e of os.sys.audit().slice(-(Number(a[0]) || 20))) print(fmtStamp(e.t) + ' ' + e.by.padEnd(10) + e.name + ' ' + e.args + (e.ok ? '' : '  ✕ ' + e.msg), e.ok ? 'm' : 'e'); },
    async history() { hist.forEach((x, i) => print(String(i + 1).padStart(3) + '  ' + x, 'm')); },
    async clear() { out.textContent = ''; },
    async lock() { await call('sys.lock', {}); }, async reboot() { await call('sys.restart', {}); }, async fullscreen() { await call('sys.fullscreen', { on: true }); },
    async exit() { os.close(); },
  };
  const ALIAS = { dir: 'ls', '?': 'help', cls: 'clear', neofetch: 'sysinfo', sysinfo: 'sys', top: 'ps', del: 'rm', type: 'cat', restart: 'reboot', quit: 'exit' };

  function split(line) { const a = []; const re = /"([^"]*)"|'([^']*)'|(\S+)/g; let m; while ((m = re.exec(line))) a.push(m[1] ?? m[2] ?? m[3]); return a; }
  async function exec(line, quiet) {
    const a = split(line); if (!a.length) return;
    let c = a.shift().toLowerCase(); c = ALIAS[c] || c; c = ALIAS[c] || c;
    if (!CMD[c]) { print('「' + c + '」というコマンドはありません。help で一覧を見られます。', 'e'); return; }
    try { await CMD[c](a); } catch (e) { print(e.message || String(e), 'e'); if (quiet) throw e; }
  }
  async function submit() {
    const line = input.value.trim(); input.value = ''; if (busy) return;
    print(prompt.textContent + ' ' + line, 'c');
    if (line) { hist = [...hist.filter(x => x !== line), line].slice(-50); reg.set('terminal.history', hist); }
    hi = hist.length; busy = true;
    try { await exec(line); } catch { /* 表示ずみ */ }
    busy = false; await setPrompt(); input.focus();
  }
  input.addEventListener('keydown', async e => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (hi > 0) input.value = hist[--hi] || ''; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); hi = Math.min(hist.length, hi + 1); input.value = hist[hi] || ''; }
    else if (e.key === 'Tab') {
      e.preventDefault(); const parts = input.value.split(/\s+/); const last = parts[parts.length - 1];
      const pool = parts.length === 1 ? Object.keys(CMD) : [...(await fs.ls(cwd)).map(n => n.name), ...apps.installed().map(x => x.id)];
      const hit = pool.filter(x => x.toLowerCase().startsWith(last.toLowerCase()));
      if (hit.length === 1) { parts[parts.length - 1] = /\s/.test(hit[0]) ? '"' + hit[0] + '"' : hit[0]; input.value = parts.join(' ') + ' '; } else if (hit.length > 1) print(hit.join('   '), 'm');
    } else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); out.textContent = ''; }
  });
  print('XEVARIX ' + os.OS.version + ' — xsh。help で使い方が出ます。', 'c');
  await setPrompt(); input.focus();
  if (os.args && os.args.run) { input.value = os.args.run; submit(); }
  os.onArgs(a => { if (a && a.run) { input.value = a.run; submit(); } });
}

/* XEVARIX — 開発キットの受け口（本体側）
   ① 標準アプリ（同じサイトの中）… connect(window) で、そのアプリ専用の os を渡す。
   ② 外のアプリ（別サイト）…… postMessage でやりとりする（sdk/xevarix-sdk.js が相手）。
      できることは権限つきの少数だけ。はじめて使うときに、使う人へ確認する。 */

import { bus, log, OS } from './core.js';
import { confirmBox, toast, menu, modal, alertBox, promptBox } from './shell/ui.js';

export function makeSDK(X) {
  const cleanups = new Map();          // pid → 片づける関数の束
  bus.on('proc:exit', e => { const c = cleanups.get(e.pid); if (c) { cleanups.delete(e.pid); for (const f of c) { try { f(); } catch { /* 片づけの失敗は無視 */ } } } });
  const track = (pid, off) => { let c = cleanups.get(pid); if (!c) cleanups.set(pid, c = new Set()); c.add(off); return () => { c.delete(off); off(); }; };

  function connect(win) {
    const p = X.proc.byWindow(win);
    if (!p || p.app.kind !== 'system') throw new Error('このアプリは XEVARIX に登録されていません');
    const by = 'app:' + p.appId;
    const frameOffset = at => {
      if (!at) return at;
      const r = p.frame.getBoundingClientRect();
      if (at.getBoundingClientRect) { const b = at.getBoundingClientRect(); return { x: r.left + b.left, y: r.top + b.bottom + 6 }; }
      return { x: r.left + (at.x || 0), y: r.top + (at.y || 0) };
    };
    return {
      OS, pid: p.pid, appId: p.appId, app: p.app, get args() { return p.args; },
      uptime: X.uptime, persistent: X.persistent, safe: X.safe, ENV: X.ENV,
      user: () => ({ ...X.session.user, pass: undefined, hasPass: !!X.session.user.pass }),
      /* 窓 */
      setTitle: t => X.wm.setTitle(p.win, t),
      close: () => X.proc.kill(p.pid, 'self'),
      onArgs: fn => { p.onArgs = fn; },
      onClose: fn => { p.onClose = fn; },
      keepAlive: v => { p.keepAlive = !!v; X.proc.refresh(); },
      /* 連絡網・設定の見張り（窓を閉じたら自動で外れる） */
      on: (evt, fn) => track(p.pid, bus.on(evt, fn)),
      watch: (key, fn) => track(p.pid, X.reg.watch(key, fn)),
      emit: (evt, data) => bus.emit(evt, data),
      /* OS の部品（標準アプリは本体と同じものを使う） */
      reg: X.reg, sysreg: X.session.sysreg, kv: X.session.db.kv, db: X.session.db, session: X.session,
      fs: X.fs, apps: X.apps, proc: X.proc, wm: X.wm, power: X.power, perf: X.perf, notify: X.notify, theme: X.theme,
      security: X.security, services: X.services, ai: X.ai, backup: X.backup, update: X.update, cloud: X.cloud, act: X.act, logs: X.logs,
      sys: { call: (n, a) => X.sys.call(n, a, { by, pid: p.pid }), tryCall: (n, a) => X.sys.tryCall(n, a, { by, pid: p.pid }), list: () => X.sys.list(), audit: () => X.sys.audit(), undo: () => X.sys.undo() },
      open: (appId, args) => X.proc.spawn(appId, args),
      /* 画面の部品（確認の窓などは本体の上に出す） */
      ui: {
        toast, alert: alertBox, confirm: confirmBox, prompt: promptBox, modal,
        menu: (items, at) => menu(items, frameOffset(at)),
        sound: X.sound, haptic: X.haptic,
      },
    };
  }

  /* ── 外のアプリとのやりとり ── */
  const PERMS = { notify: '通知を出す', ai: 'AI に質問する', files: 'ファイルを受け取る・保存する', power: '電力の状態を見る' };
  async function allowed(p, perm) {
    const all = X.reg.get('apps.perms') || {}; const mine = all[p.appId] || {};
    if (mine[perm] === 'allow') return true;
    if (mine[perm] === 'deny') return false;
    const ok = await confirmBox(p.app.name + ' からのお願い', '「' + p.app.name + '」が次のことをしようとしています。\n\n・' + (PERMS[perm] || perm) + '\n\n許可しますか？（あとで 設定 → アプリ から変えられます）', { ok: '許可する', cancel: '許可しない' });
    X.reg.update('apps.perms', a => { a = a || {}; a[p.appId] = { ...(a[p.appId] || {}), [perm]: ok ? 'allow' : 'deny' }; return a; });
    log.info('sdk', p.app.name + ' の権限「' + perm + '」: ' + (ok ? '許可' : '拒否'));
    return ok;
  }
  const API = {
    hello: async p => ({ os: OS.name, version: OS.version, app: p.appId, theme: X.theme.attrs(), user: X.session.user.name, power: X.power.mode }),
    setTitle: async (p, a) => { X.wm.setTitle(p.win, String(a.title || '').slice(0, 60)); return true; },
    toast: async (p, a) => { toast(String(a.text || '').slice(0, 200), 'info', p.app.name); return true; },
    close: async p => { X.proc.kill(p.pid, 'self'); return true; },
    notify: async (p, a) => { if (!await allowed(p, 'notify')) throw new Error('denied'); return X.notify.send({ app: p.appId, title: String(a.title || p.app.name).slice(0, 80), body: String(a.body || '').slice(0, 400) }); },
    'power.status': async p => { if (!await allowed(p, 'power')) throw new Error('denied'); const b = X.power.battery; return { mode: X.power.mode, level: b ? b.level : null, charging: b ? b.charging : null }; },
    'ai.ask': async (p, a) => { if (!await allowed(p, 'ai')) throw new Error('denied'); if (!X.ai) throw new Error('unavailable'); const r = await X.ai.ask(String(a.text || '').slice(0, 2000), { by: 'app:' + p.appId, noActions: true }); return { text: r.text }; },
    'files.save': async (p, a) => {
      if (!await allowed(p, 'files')) throw new Error('denied');
      const n = await X.fs.write(X.fs.DIRS.dl, String(a.name || 'ファイル.txt'), typeof a.data === 'string' ? a.data : new Blob([a.data]), { mime: a.mime });
      toast('「' + n.name + '」をダウンロードに保存しました', 'ok', p.app.name); return { id: n.id, name: n.name };
    },
    'files.pick': async (p, a) => {
      if (!await allowed(p, 'files')) throw new Error('denied');
      const node = await X.act.pickFile({ title: p.app.name + ' に渡すファイルをえらぶ', kinds: a && a.kinds });
      if (!node) return null;
      return { name: node.name, mime: node.mime, size: node.size, data: X.fs.isText(node) ? await X.fs.readText(node.id) : await X.fs.readBlob(node.id) };
    },
  };
  addEventListener('message', async ev => {
    const d = ev.data; if (!d || d.xvx !== 1 || typeof d.method !== 'string') return;
    const p = X.proc.byWindow(ev.source); if (!p) return;
    const reply = (ok, value) => { try { ev.source.postMessage({ xvx: 1, re: d.id, ok, value }, ev.origin === 'null' ? '*' : ev.origin); } catch { /* 閉じた窓 */ } };
    const fn = API[d.method]; if (!fn) return reply(false, 'unknown method');
    try { const v = await fn(p, d.args || {}); X.sys && bus.emit('sys:call', { t: Date.now(), name: 'sdk.' + d.method, args: '', by: 'app:' + p.appId, ok: true, msg: '' }); reply(true, v); }
    catch (e) { reply(false, (e && e.message) || 'error'); }
  });
  /* 見た目が変わったら、外のアプリにも知らせる */
  bus.on('theme:change', a => { for (const p of X.proc.list()) if (p.app.kind === 'web' && !p.sameOrigin) { try { p.frame.contentWindow.postMessage({ xvx: 1, event: 'theme', value: a }, '*'); } catch { /* 閉じた窓 */ } } });

  return { connect, PERMS };
}

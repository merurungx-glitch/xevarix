/* XEVARIX — システムコール（OS にできることの一覧）
   AI・ターミナル・ルーティン・検索・アプリ（開発キット）は、みんなここを通して OS を動かす。
   入口を1つにしておくと、
     ・だれが・いつ・何をしたか を1本の記録に残せる（プライバシーの画面）
     ・「元に戻す」を共通で持てる
     ・アプリごとの権限を1か所で確かめられる
   個々の命令の中身は calls.js が登録する。 */

import { bus, log } from './core.js';

const table = new Map();
const audit = [];
const undoStack = [];
let guard = null, persist = null;

const brief = a => { try { const s = JSON.stringify(a); return s.length > 160 ? s.slice(0, 157) + '…' : s; } catch { return ''; } };

export const sys = {
  /* spec: { title, desc, args:{名前:{t:'string|number|bool|enum', d:'説明', e:[…]}}, perm, danger, run(args, ctx) }
     run は { text, data, undo, undoLabel } を返す（text は人が読める結果の1行） */
  def(name, spec) { table.set(name, { name, ...spec }); },
  has(name) { return table.has(name); },
  get(name) { return table.get(name) || null; },
  list() { return [...table.values()]; },
  setGuard(fn) { guard = fn; },
  setPersist(fn) { persist = fn; },

  /* ctx.by … 'user' | 'ai' | 'terminal' | 'routine' | 'search' | 'app:<id>' */
  async call(name, args = {}, ctx = {}) {
    const c = table.get(name);
    const by = ctx.by || 'user';
    const entry = { t: Date.now(), name, args: brief(args), by, ok: true, msg: '' };
    try {
      if (!c) throw new Error('その命令はありません: ' + name);
      if (guard) { const why = await guard(c, args, ctx); if (why) throw new Error(why); }
      const res = (await c.run(args || {}, { ...ctx, by })) || {};
      entry.msg = res.text || '';
      if (typeof res.undo === 'function') {
        undoStack.push({ t: entry.t, name, by, label: res.undoLabel || c.title || name, undo: res.undo });
        if (undoStack.length > 40) undoStack.shift();
      }
      return res;
    } catch (e) {
      entry.ok = false; entry.msg = (e && e.message) || String(e);
      throw e;
    } finally {
      if (!c || !c.quiet) {
        audit.push(entry); if (audit.length > 500) audit.splice(0, 100);
        bus.emit('sys:call', entry); persist && persist(entry);
      }
    }
  },
  /* 失敗しても投げない版（結果の文だけほしいとき） */
  async tryCall(name, args, ctx) { try { return await sys.call(name, args, ctx); } catch (e) { return { error: true, text: e.message }; } },

  audit() { return audit; },
  loadAudit(list) { if (Array.isArray(list)) audit.unshift(...list.slice(-300)); },
  lastUndo(by) { for (let i = undoStack.length - 1; i >= 0; i--) if (!by || undoStack[i].by === by) return undoStack[i]; return null; },
  async undo(by) {
    for (let i = undoStack.length - 1; i >= 0; i--) {
      if (by && undoStack[i].by !== by) continue;
      const u = undoStack.splice(i, 1)[0];
      await u.undo();
      log.info('sys', '元に戻しました: ' + u.label);
      bus.emit('sys:undo', u);
      return { text: '「' + u.label + '」を元に戻しました。', label: u.label };
    }
    return { text: '元に戻せる操作はありません。', none: true };
  },
};

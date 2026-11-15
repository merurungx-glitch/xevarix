/* XEVARIX — 通知
   アプリ・システム・AI からのお知らせを1か所に集める。
   おやすみモード（DND）・集中モード・ゲームモードのあいだは、札を出さずに一覧へだけ入れる。 */

import { bus, log } from './core.js';
import { uid } from './util.js';

let reg = null, kv = null, list = [], quiet = () => false;
const save = () => { kv && kv.put(list.slice(0, 120).map(n => ({ ...n, actions: (n.actions || []).filter(a => a.call) })), 'notifications').catch(() => {}); };

export const notify = {
  async init(o) {
    reg = o.reg; kv = o.kv; quiet = o.quiet || quiet;
    try { list = (await kv.get('notifications')) || []; } catch { list = []; }
    return notify;
  },
  /* { app, title, body, kind: info|ok|warn, icon, actions:[{label, call:{name,args}}], silent, tag } */
  send(n) {
    const item = { id: uid('nt'), t: Date.now(), app: n.app || 'system', title: String(n.title || ''), body: String(n.body || ''), kind: n.kind || 'info', icon: n.icon || null, actions: n.actions || [], tag: n.tag || null, read: false };
    if ((reg.get('notify.mute') || []).includes(item.app)) return null;
    if (item.tag) list = list.filter(x => x.tag !== item.tag);
    list.unshift(item); if (list.length > 150) list.length = 150;
    save();
    const dnd = notify.dnd || quiet();
    bus.emit('notify:new', { item, show: !dnd || !!n.urgent, sound: !n.silent && (!dnd || !!n.urgent) && reg.get('notify.sound') });
    /* 画面を見ていないときは、OS の通知にも出す（設定で許可したときだけ） */
    try {
      if (reg.get('notify.system') && document.hidden && 'Notification' in window && Notification.permission === 'granted' && (!dnd || n.urgent)) {
        new Notification(item.title || 'XEVARIX', { body: item.body, icon: 'assets/brand/icon-192.png', tag: item.tag || item.id });
      }
    } catch { /* 出せない端末 */ }
    return item.id;
  },
  list() { return list; },
  get unread() { return list.filter(n => !n.read).length; },
  markRead() { let c = false; for (const n of list) if (!n.read) { n.read = true; c = true; } if (c) { save(); bus.emit('notify:change', null); } },
  remove(id) { list = list.filter(n => n.id !== id); save(); bus.emit('notify:change', null); },
  clear() { list = []; save(); bus.emit('notify:change', null); },

  get dnd() {
    if (!reg.get('notify.dnd')) return false;
    const until = reg.get('notify.dndUntil') || 0;
    if (until && Date.now() > until) { reg.set('notify.dnd', false); reg.set('notify.dndUntil', 0); return false; }
    return true;
  },
  setDnd(on, minutes) {
    reg.set('notify.dnd', !!on); reg.set('notify.dndUntil', on && minutes ? Date.now() + minutes * 60000 : 0);
    bus.emit('notify:change', null); log.info('notify', 'おやすみモード: ' + (on ? 'オン' : 'オフ'));
  },
  /* OS の通知の許可（押したときだけ聞く） */
  async askSystem() {
    if (!('Notification' in window)) return 'unsupported';
    try { const r = await Notification.requestPermission(); reg.set('notify.system', r === 'granted'); return r; } catch { return 'denied'; }
  },
};

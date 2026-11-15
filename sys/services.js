/* XEVARIX — 裏で動きつづけるサービス
   タイマー・アラーム・予定のお知らせ／利用時間の記録と上限／集中モード／スペース／ルーティン／
   使い方からの提案／操作が無いときの減光と自動ロック。
   アプリ（時計・カレンダー・ルーティン）は、ここの「画面」にすぎない。窓を閉じても動く。 */

import { bus, log } from './core.js';
import { uid, dateKey, fmtDur, pad2, debounce, clone } from './util.js';

let X, reg, kv;
let usage = null, slots = null, lastAct = Date.now(), preciseT = 0, alarmStop = null;
let spacePrev = null, lastLevel = null, firedEvents = new Set();
const cool = new Map();

const saveUsage = debounce(() => { if (usage) kv.put(usage, 'us:' + usage.day).catch(() => {}); if (slots) kv.put(slots, 'suggest').catch(() => {}); }, 5000);
function today() {
  const day = dateKey();
  if (!usage || usage.day !== day) { if (usage) kv.put(usage, 'us:' + usage.day).catch(() => {}); usage = { day, total: 0, apps: {}, launch: {}, focus: 0, unlocks: 0 }; }
  return usage;
}
const nowHM = (d = new Date()) => pad2(d.getHours()) + ':' + pad2(d.getMinutes());
const slotKey = (d = new Date()) => ((d.getDay() === 0 || d.getDay() === 6) ? 'e' : 'w') + pad2(d.getHours());

/* ── タイマー・アラーム・予定 ── */
function ring(kind, title, body, actions) {
  if (alarmStop) alarmStop();
  alarmStop = X.sound.loop(kind, kind === 'alarm' ? 1100 : 1500, kind === 'alarm' ? 45 : 4);
  X.notify.send({ app: 'clock', title, body, kind: 'ok', urgent: true, silent: true, tag: 'ring', actions: [{ label: '止める', fn: () => svc.ringStop() }, ...(actions || [])] });
  X.haptic(200);
}
function armPrecise() {
  clearTimeout(preciseT);
  const next = (reg.get('timers.list') || []).reduce((m, t) => Math.min(m, t.end), Infinity);
  if (isFinite(next)) preciseT = setTimeout(checkDue, Math.max(50, Math.min(next - Date.now() + 30, 2 ** 30)));
}
function checkDue() {
  const now = Date.now(), d = new Date(), hm = nowHM(d), dk = dateKey(d);
  /* タイマー */
  const timers = reg.get('timers.list') || []; const due = timers.filter(t => t.end <= now);
  if (due.length) {
    reg.set('timers.list', timers.filter(t => t.end > now));
    for (const t of due) ring('timer', 'タイマーが終わりました', (t.label ? t.label + '・' : '') + fmtDur(t.total), [{ label: 'もう一度', call: { name: 'timer.start', args: { seconds: Math.round(t.total / 1000), label: t.label } } }]);
    bus.emit('clock:change', null);
  }
  /* アラーム */
  const alarms = reg.get('alarms.list') || []; let aDirty = false;
  for (const a of alarms) {
    if (!a.on || a.time !== hm || a.last === dk + hm) continue;
    if (a.days && a.days.length && !a.days.includes(d.getDay())) continue;
    a.last = dk + hm; if (!a.days || !a.days.length) a.on = false; aDirty = true;
    ring('alarm', 'アラーム ' + a.time, a.label || '時間になりました', [{ label: '5分後にもう一度', call: { name: 'timer.start', args: { seconds: 300, label: a.label || 'アラーム' } } }]);
  }
  if (aDirty) { reg.set('alarms.list', alarms); bus.emit('clock:change', null); }
  /* 予定のお知らせ */
  for (const ev of reg.get('calendar.events') || []) {
    if (ev.remind == null || !ev.time || firedEvents.has(ev.id)) continue;
    const at = new Date(ev.date + 'T' + ev.time + ':00').getTime() - ev.remind * 60000;
    if (now >= at && now - at < 10 * 60000) { firedEvents.add(ev.id); reg.set('calendar.fired', [...firedEvents].slice(-200)); X.notify.send({ app: 'calendar', title: ev.title, body: (ev.remind ? (ev.remind >= 1440 && ev.remind % 1440 === 0 ? (ev.remind / 1440) + '日' : ev.remind >= 60 && ev.remind % 60 === 0 ? (ev.remind / 60) + '時間' : ev.remind + '分') + '後・' : '') + ev.time + ' から', urgent: true, actions: [{ label: 'カレンダーを開く', call: { name: 'app.open', args: { app: 'calendar' } } }] }); }
  }
  /* 集中モードの終わり */
  const f = reg.get('focus.state');
  if (f && now >= f.end) { reg.set('focus.state', null); today().focus += f.minutes; saveUsage(); bus.emit('focus:change', null); X.notify.send({ title: '集中モードが終わりました', body: f.minutes + '分、おつかれさまでした。', kind: 'ok', urgent: true }); X.notify.setDnd(!!f.prevDnd); }
  /* 時刻で動くルーティン */
  fire('time', { hm, day: d.getDay(), key: dk + hm });
  /* 操作が無いとき：少し暗くする・自動でロックする */
  /* 別サイトのアプリを手前で使っているあいだは、中の操作が見えないので「操作なし」とは数えない */
  const fgp = X.proc.fg(); const crossFg = !!(fgp && !fgp.sameOrigin && document.hasFocus() && X.wm.visibility(fgp.win) === 'focus');
  const idle = now - lastAct; const busy = X.power.game || X.power.wake || document.hidden || crossFg;
  if (reg.get('power.idleDim') && !busy) X.power.setIdleDim(idle > (X.power.mode === 'saver' || X.power.mode === 'ultra' ? 60000 : 150000) ? .38 : 0);
  const me = X.session.getUser(X.session.user.id); const mins = reg.get('lock.auto');
  if (me && me.pass && mins > 0 && idle > mins * 60000 && !busy && !X.wm.locked) X.act.lock();
  armPrecise();
}

/* ── ルーティン ── */
function matches(r, type, p) {
  const t = r.trigger || {}; if (!r.on || t.type !== type) return false;
  switch (type) {
    case 'time': return t.time === p.hm && (!t.days || !t.days.length || t.days.includes(p.day));
    case 'battery': return t.op === p.op && t.level === p.level;
    case 'charging': return t.state === p.state;
    case 'app': return t.app === p.app && t.event === p.event;
    case 'space': return t.space === p.space;
    case 'net': return t.state === p.state;
    case 'mode': return t.mode === p.mode;
    default: return true;      // unlock / boot
  }
}
function fire(type, p) {
  if (X.safe) return;
  for (const r of reg.get('routines.list') || []) {
    if (!matches(r, type, p || {})) continue;
    const stamp = type === 'time' ? p.key : Math.floor(Date.now() / 30000);
    if (cool.get(r.id) === stamp) continue; cool.set(r.id, stamp);
    svc.routineRun(r.id, {}).catch(e => log.warn('routine', e.message));
  }
}

const svc = {
  /* 操作があった */
  activity() { lastAct = Date.now(); X.power.setIdleDim(0); },
  ringStop() { if (alarmStop) { alarmStop(); alarmStop = null; } },

  /* タイマー */
  timers() { return (reg.get('timers.list') || []).filter(t => t.end > Date.now()).sort((a, b) => a.end - b.end); },
  timerStart(seconds, label) {
    const t = { id: uid('t'), end: Date.now() + seconds * 1000, total: seconds * 1000, label: label || '' };
    reg.update('timers.list', l => [...(l || []).filter(x => x.end > Date.now()), t]); armPrecise(); bus.emit('clock:change', null);
    return t;
  },
  timerCancel(id) {
    const l = reg.get('timers.list') || []; const keep = id === 'all' ? [] : l.filter(t => t.id !== id);
    reg.set('timers.list', keep); armPrecise(); bus.emit('clock:change', null);
    return l.length - keep.length;
  },
  /* アラーム */
  alarms() { return (reg.get('alarms.list') || []).slice().sort((a, b) => a.time.localeCompare(b.time)); },
  alarmAdd(a) { const al = { id: uid('a'), time: a.time, label: a.label || '', days: a.days && a.days.length ? a.days : null, on: true, last: '' }; reg.update('alarms.list', l => [...(l || []), al]); bus.emit('clock:change', null); return al; },
  alarmUpdate(id, patch) { reg.update('alarms.list', l => (l || []).map(a => (a.id === id ? { ...a, ...patch, last: '' } : a))); bus.emit('clock:change', null); },
  alarmRemove(id) { reg.update('alarms.list', l => (l || []).filter(a => a.id !== id)); bus.emit('clock:change', null); },

  /* 予定 */
  events() { return reg.get('calendar.events') || []; },
  eventSave(ev) {
    const e = { id: ev.id || uid('e'), title: String(ev.title || '予定').slice(0, 80), date: ev.date, time: ev.time || null, remind: ev.remind == null ? null : Number(ev.remind), note: ev.note || '' };
    reg.update('calendar.events', l => [...(l || []).filter(x => x.id !== e.id), e]); firedEvents.delete(e.id); bus.emit('calendar:change', null);
    return e;
  },
  eventRemove(id) { reg.update('calendar.events', l => (l || []).filter(x => x.id !== id)); bus.emit('calendar:change', null); },

  /* 利用時間 */
  usageToday() { return clone(today()); },
  async usageHistory(days = 7) {
    const out = [];
    for (let i = days - 1; i >= 0; i--) { const k = dateKey(new Date(Date.now() - i * 864e5)); out.push(k === today().day ? clone(usage) : ((await kv.get('us:' + k).catch(() => null)) || { day: k, total: 0, apps: {}, launch: {}, focus: 0 })); }
    return out;
  },
  limitOf(appId) { return (reg.get('limits.apps') || {})[appId] || 0; },
  usedMin(appId) { return Math.floor(((today().apps[appId]) || 0) / 60000); },
  allowedMin(appId) { const ex = reg.get('limits.extra') || {}; return svc.limitOf(appId) + (ex.day === dateKey() ? (ex[appId] || 0) : 0); },
  addExtra(appId, min = 15) { reg.update('limits.extra', e => { e = e && e.day === dateKey() ? e : { day: dateKey() }; e[appId] = (e[appId] || 0) + min; return e; }); },
  /* 開いてよいか。だめなら理由の文を返す */
  canOpen(app) {
    const f = reg.get('focus.state');
    if (f && (reg.get('focus.block') || []).includes(app.id)) return '集中モード中は「' + app.name + '」を開けません（あと ' + Math.max(1, Math.ceil((f.end - Date.now()) / 60000)) + ' 分）。';
    const lim = svc.limitOf(app.id);
    if (lim && svc.usedMin(app.id) >= svc.allowedMin(app.id)) return '今日の「' + app.name + '」の利用時間（' + lim + '分）に達しました。設定 → 利用時間 から変えられます。';
    return null;
  },

  /* 集中モード */
  focusOn() { const f = reg.get('focus.state'); return !!(f && f.end > Date.now()); },
  focusState() { return reg.get('focus.state'); },
  focusStart(minutes) {
    const prevDnd = X.notify.dnd;
    reg.set('focus.state', { end: Date.now() + minutes * 60000, minutes, started: Date.now(), prevDnd });
    X.notify.setDnd(true);
    for (const p of X.proc.list()) if ((reg.get('focus.block') || []).includes(p.appId)) X.proc.kill(p.pid, 'force');
    bus.emit('focus:change', null); log.info('focus', minutes + '分の集中モード');
  },
  focusStop() { const f = reg.get('focus.state'); if (!f) return; today().focus += Math.round((Date.now() - f.started) / 60000); reg.set('focus.state', null); X.notify.setDnd(!!f.prevDnd); saveUsage(); bus.emit('focus:change', null); },

  /* スペース */
  spaces() { return reg.get('spaces.list') || []; },
  space() { return svc.spaces().find(s => s.id === X.wm.space) || svc.spaces()[0]; },
  spaceSwitch(id) {
    const sp = svc.spaces().find(s => s.id === id); if (!sp || X.wm.space === id) return false;
    if (spacePrev) { if (spacePrev.power) X.power.setMode(spacePrev.power, 'auto'); if (spacePrev.dnd !== undefined) X.notify.setDnd(spacePrev.dnd); spacePrev = null; }
    X.wm.setSpace(id); reg.set('spaces.current', id);
    spacePrev = {};
    if (sp.power) { spacePrev.power = X.power.base; X.power.setMode(sp.power, 'auto'); }
    if (sp.dnd) { spacePrev.dnd = X.notify.dnd; X.notify.setDnd(true); }
    for (const a of sp.apps || []) { const p = X.proc.byApp(a); if (!p) X.proc.spawn(a); else X.wm.moveToSpace(p.win, id); }
    bus.emit('space:change', id); fire('space', { space: id });
    return true;
  },
  spaceSave(sp) {
    const s = { id: sp.id || uid('s'), name: String(sp.name || 'スペース').slice(0, 16), icon: sp.icon || 'layers', power: sp.power || null, dnd: !!sp.dnd, apps: sp.apps || [] };
    reg.update('spaces.list', l => { l = l || []; const i = l.findIndex(x => x.id === s.id); if (i >= 0) l[i] = s; else l.push(s); return l; }); bus.emit('space:change', X.wm.space);
    return s;
  },
  spaceRemove(id) { if (id === 'main') return false; if (X.wm.space === id) svc.spaceSwitch('main'); reg.update('spaces.list', l => (l || []).filter(s => s.id !== id)); bus.emit('space:change', X.wm.space); return true; },

  /* ルーティン */
  routines() { return reg.get('routines.list') || []; },
  routineSave(r) {
    const x = { id: r.id || uid('r'), name: String(r.name || 'ルーティン').slice(0, 40), on: r.on !== false, trigger: r.trigger || { type: 'manual' }, actions: (r.actions || []).slice(0, 12), notify: r.notify !== false };
    reg.update('routines.list', l => { l = l || []; const i = l.findIndex(y => y.id === x.id); if (i >= 0) l[i] = x; else l.push(x); return l; }); bus.emit('routines:change', null);
    return x;
  },
  routineRemove(id) { reg.update('routines.list', l => (l || []).filter(r => r.id !== id)); bus.emit('routines:change', null); },
  async routineRun(id, { manual } = {}) {
    const r = svc.routines().find(x => x.id === id); if (!r) throw new Error('ルーティンが見つかりません');
    const out = []; let ok = true;
    for (const a of r.actions) {
      try { const res = await X.sys.call(a.name, a.args || {}, { by: 'routine' }); if (res && res.text) out.push(res.text); }
      catch (e) { ok = false; out.push('失敗: ' + e.message); }
    }
    const text = out.join(' ');
    reg.update('routines.log', l => [{ t: Date.now(), id: r.id, name: r.name, ok, text, manual: !!manual }, ...(l || [])].slice(0, 60));
    if (r.notify && !manual) X.notify.send({ app: 'routines', title: 'ルーティン「' + r.name + '」', body: text || '実行しました', kind: ok ? 'ok' : 'warn' });
    bus.emit('routines:change', null); log.info('routine', r.name + ' を実行' + (ok ? '' : '（一部失敗）'));
    return { ok, text };
  },
  triggerText(t) {
    const WD = ['日', '月', '火', '水', '木', '金', '土']; t = t || {};
    switch (t.type) {
      case 'time': return (t.days && t.days.length ? (t.days.length === 7 ? '毎日' : t.days.length === 5 && !t.days.includes(0) && !t.days.includes(6) ? '平日' : t.days.map(d => WD[d]).join('・')) : '毎日') + ' ' + t.time;
      case 'battery': return '電池が ' + t.level + '% ' + (t.op === 'below' ? '以下になったら' : '以上になったら');
      case 'charging': return t.state === 'start' ? '充電を始めたら' : '充電をやめたら';
      case 'app': return '「' + ((X.apps.get(t.app) || {}).name || t.app) + '」を' + (t.event === 'open' ? '開いたら' : '閉じたら');
      case 'space': return 'スペース「' + ((svc.spaces().find(s => s.id === t.space) || {}).name || t.space) + '」にしたら';
      case 'net': return t.state === 'offline' ? 'オフラインになったら' : 'オンラインに戻ったら';
      case 'mode': return '電力モードが「' + X.power.MODES[t.mode].name + '」になったら';
      case 'unlock': return 'ロックを開けたら';
      case 'boot': return 'XEVARIX を起動したら';
      default: return '手で動かす';
    }
  },

  /* 使い方からの提案（ホームの札と AI が使う）。いちばん役に立ちそうなものを1つ */
  suggest() {
    const b = X.power.battery, out = [];
    if (b && !b.charging && b.level <= .25 && X.power.mode === 'max') out.push({ w: 9, icon: 'leaf', title: '電池が少なくなっています', text: '「省電力」にすると、描画を控えめにして長もちさせます。', action: { label: '省電力にする', call: { name: 'power.mode', args: { mode: 'saver' } } } });
    const susp = X.proc.list().filter(p => p.state === 'running' && X.wm.visibility(p.win) === 'hidden').length;
    if (susp >= 3) out.push({ w: 6, icon: 'bolt', title: '裏で ' + susp + ' 本のアプリが動いています', text: '休止すると、手前のアプリが軽くなります。', action: { label: 'ブースト', call: { name: 'sys.boost', args: {} } } });
    const key = slotKey(), sl = (slots && slots[key]) || {}; let best = null;
    for (const id in sl) if (sl[id] >= 3 && X.apps.isInstalled(id) && !X.proc.byApp(id) && (!best || sl[id] > sl[best])) best = id;
    if (best) { const a = X.apps.get(best); out.push({ w: 5, icon: 'sparkle', app: a, title: 'いつもの時間です', text: 'この時間によく「' + a.name + '」を開いています。', action: { label: a.name + ' を開く', call: { name: 'app.open', args: { app: best } } } }); }
    const me = X.session.getUser(X.session.user.id);
    if (me && !me.pass && X.security.ok && (X.sysreg.get('boot.count') || 0) >= 3 && !reg.get('tips.pass')) out.push({ w: 3, icon: 'lock', title: 'パスコードを決めませんか', text: 'ロック画面と、暗号化して守る「保管庫」が使えるようになります。', action: { label: '設定を開く', call: { name: 'app.open', args: { app: 'settings', args: { page: 'security' } } } }, dismiss: 'tips.pass' });
    if (!out.length) return null;
    return out.sort((a, b) => b.w - a.w)[0];
  },
};

export async function init(ctx) {
  X = ctx; reg = X.reg; kv = X.session.db.kv;
  try { usage = (await kv.get('us:' + dateKey())) || null; slots = (await kv.get('suggest')) || {}; } catch { slots = {}; }
  firedEvents = new Set(reg.get('calendar.fired') || []);
  X.services = svc;
  /* 操作の記録を残す（プライバシーの画面で見られる） */
  try { X.sys.loadAudit((await kv.get('audit')) || []); } catch { /* 無ければ空から */ }
  X.sys.setPersist(debounce(() => kv.put(X.sys.audit().slice(-300), 'audit').catch(() => {}), 3000));

  bus.on('proc:tick', e => {
    if (document.hidden || X.wm.locked) return;
    const u = today(); u.total += e.dt;
    if (e.fg) {
      u.apps[e.fg] = (u.apps[e.fg] || 0) + e.dt;
      const lim = svc.limitOf(e.fg);
      if (lim && svc.usedMin(e.fg) >= svc.allowedMin(e.fg) && cool.get('lim:' + e.fg) !== u.day + svc.allowedMin(e.fg)) {
        cool.set('lim:' + e.fg, u.day + svc.allowedMin(e.fg)); const a = X.apps.get(e.fg) || { name: e.fg };
        X.notify.send({ title: '利用時間のお知らせ', body: '今日の「' + a.name + '」は ' + lim + '分に達しました。', kind: 'warn', urgent: true, actions: [{ label: 'あと15分', fn: () => svc.addExtra(e.fg, 15) }, { label: '閉じる', call: { name: 'app.close', args: { app: e.fg } } }] });
      }
    }
    saveUsage();
  });
  bus.on('proc:spawn', e => {
    const u = today(); u.launch[e.appId] = (u.launch[e.appId] || 0) + 1;
    const k = slotKey(); slots[k] = slots[k] || {}; slots[k][e.appId] = (slots[k][e.appId] || 0) + 1; saveUsage();
    fire('app', { app: e.appId, event: 'open' });
    const a = X.apps.get(e.appId); if (a && a.game) X.power.setGame(true);
  });
  bus.on('proc:exit', e => { fire('app', { app: e.appId, event: 'close' }); if (!X.proc.list().some(p => p.app.game)) X.power.setGame(false); });
  bus.on('wm:focus', e => { const a = e && X.apps.get(e.appId); if (reg.get('perf.gameAuto')) X.power.setGame(!!(a && a.game)); });
  bus.on('power:charging', e => fire('charging', { state: e.charging ? 'start' : 'stop' }));
  bus.on('power:mode', e => fire('mode', { mode: e.mode }));
  bus.on('power:state', () => {
    const b = X.power.battery; if (!b) return; const lv = Math.round(b.level * 100);
    if (lastLevel != null && lv !== lastLevel) {
      for (const r of svc.routines()) { const t = r.trigger || {}; if (t.type !== 'battery') continue; if ((t.op === 'below' && lastLevel > t.level && lv <= t.level) || (t.op === 'above' && lastLevel < t.level && lv >= t.level)) fire('battery', { op: t.op, level: t.level }); }
    }
    lastLevel = lv;
  });
  bus.on('lock:off', () => { today().unlocks++; fire('unlock', {}); });
  addEventListener('online', () => fire('net', { state: 'online' }));
  addEventListener('offline', () => fire('net', { state: 'offline' }));
  bus.on('boot:done', () => setTimeout(() => fire('boot', {}), 800));
  setInterval(checkDue, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastAct = Date.now(); checkDue(); } else saveUsage.flush(); });
  /* 前の回のスペースを引きつぐ（設定の適用はしない。窓の置き場所だけ） */
  const cur = reg.get('spaces.current'); if (cur && cur !== 'main' && svc.spaces().some(s => s.id === cur)) X.wm.setSpace(cur);
  /* 古い利用時間の記録を消す（60日） */
  kv.keys().then(keys => { const lim = dateKey(new Date(Date.now() - 60 * 864e5)); for (const k of keys) if (typeof k === 'string' && k.startsWith('us:') && k.slice(3) < lim) kv.del(k); }).catch(() => {});
  checkDue();
}

/* XEVARIX — ユーザーとセッション
   ・端末ぜんたいの台帳（sysreg）… ユーザーの一覧・端末の測定結果・起動の記録
   ・ユーザーごとの台帳（reg）… 設定のすべて。ユーザーごとに別の保存場所（xevarix-u-<id>）
   ・ゲスト … その回かぎり。終わると保存場所ごと消える */

import { sysDB, userDB, dropUserDB, Registry } from './db.js';
import { bus, log } from './core.js';
import { uid } from './util.js';

export const DEFAULTS = {
  /* 見た目 */
  'ui.theme': 'dark', 'ui.accent': 'cyan', 'ui.wall': 'aurora', 'ui.wallLive': true, 'ui.wallImage': null,
  'ui.textScale': 1, 'ui.fx': 'auto', 'ui.motion': true, 'ui.contrast': false, 'ui.icon': 'squircle',
  'ui.clock24': true, 'ui.seconds': false, 'ui.dim': 0, 'ui.widgets': true, 'ui.haptics': true,
  'sound.on': true, 'sound.volume': 0.5, 'sound.pack': 'soft',
  'wm.mode': 'auto', 'wm.tablet': 'window', 'wm.bounds': {},
  /* 電力・性能 */
  'power.mode': 'balanced', 'power.auto': true, 'power.autoSaverAt': 20, 'power.autoUltraAt': 8,
  'power.schedule': { on: false, from: '23:00', to: '07:00', mode: 'saver' }, 'power.idleDim': true,
  'perf.gameAuto': true, 'perf.hud': false,
  /* ロック・通知 */
  'lock.auto': 5, 'lock.bio': null,
  'notify.dnd': false, 'notify.dndUntil': 0, 'notify.sound': true, 'notify.system': false, 'notify.mute': [],
  /* ホーム・アプリ */
  'dock.pins': ['files', 'notes', 'store', 'terminal', 'settings'],
  'home.widgets': ['clock', 'power', 'suggest', 'perf', 'note'],
  'apps.web': {}, 'apps.custom': [], 'apps.hidden': [], 'apps.perms': {}, 'apps.device': {},
  /* スペース・ルーティン・時計 */
  'spaces.list': [
    { id: 'main', name: 'メイン', icon: 'home', power: null, dnd: false, apps: [] },
    { id: 'study', name: '学ぶ', icon: 'book', power: 'balanced', dnd: true, apps: [] },
    { id: 'play', name: 'あそぶ', icon: 'gamepad', power: 'max', dnd: false, apps: [] },
  ],
  'spaces.current': 'main',
  'routines.list': [], 'routines.log': [], 'alarms.list': [], 'timers.list': [], 'calendar.events': [], 'clock.cities': ['Asia/Tokyo', 'America/New_York', 'Europe/London'],
  'focus.state': null, 'focus.block': [], 'limits.apps': {}, 'limits.extra': {},
  /* AI */
  'ai.enabled': true, 'ai.suggest': true, 'ai.tts': false, 'ai.voice': false, 'ai.keep': true,
  'ai.llm': { provider: 'none', model: '' }, 'ai.memory': [], 'ai.tone': 'polite',
  /* そのほか */
  'session.restore': false, 'session.apps': [], 'update.auto': true, 'dev.mode': false, 'notes.pins': [],
};

const SYS_DEFAULTS = { users: [], lastUser: null, 'device.bench': null, 'device.tier': 'A', 'oobe.done': false, 'boot.count': 0, 'update.state': null };
export const USER_COLORS = [['#38e6fd', '#0a5cff'], ['#a589fb', '#5a3fd0'], ['#4ff0b8', '#0fa97e'], ['#ffb86b', '#f0553d'], ['#ff8fc7', '#c93f8f'], ['#ffd166', '#f0a51e']];

export const session = {
  sys: null, sysreg: null, db: null, reg: null, user: null,

  async initSystem() {
    session.sys = await sysDB();
    session.sysreg = await new Registry(session.sys.kv, 'reg', SYS_DEFAULTS).load();
    session.sysreg.set('boot.count', (session.sysreg.get('boot.count') || 0) + 1);
    return session;
  },
  users() { return session.sysreg.get('users') || []; },
  getUser(id) { return session.users().find(u => u.id === id) || null; },

  createUser({ name, color = 0 }) {
    const u = { id: uid('u').slice(0, 14), name: String(name || 'ユーザー').trim().slice(0, 24) || 'ユーザー', color, created: Date.now(), pass: null };
    session.sysreg.update('users', l => [...(l || []), u]);
    log.info('session', 'ユーザー「' + u.name + '」を作成');
    return u;
  },
  updateUser(id, patch) {
    session.sysreg.update('users', l => (l || []).map(u => (u.id === id ? { ...u, ...patch } : u)));
    if (session.user && session.user.id === id) session.user = { ...session.user, ...patch };
    bus.emit('session:user', session.user);
  },
  async removeUser(id) {
    session.sysreg.update('users', l => (l || []).filter(u => u.id !== id));
    if (session.sysreg.get('lastUser') === id) session.sysreg.set('lastUser', null);
    await session.sysreg.flush(); await dropUserDB(id);
  },

  async start(id) {
    const u = id === 'guest' ? { id: 'guest', name: 'ゲスト', color: 2, guest: true, pass: null } : session.getUser(id);
    if (!u) throw new Error('ユーザーが見つかりません');
    if (u.guest) await dropUserDB('guest');
    session.user = u;
    session.db = await userDB(u.id);
    session.reg = await new Registry(session.db.kv, 'reg', DEFAULTS).load();
    if (!u.guest) session.sysreg.set('lastUser', u.id);
    return session;
  },
  /* いったん全部しまって最初から（ユーザーの切りかえ・再起動） */
  async end() {
    try { session.reg && await session.reg.flush(); await session.sysreg.flush(); } catch (e) { log.warn('session', e.message); }
    if (session.user && session.user.guest) await dropUserDB('guest');
  },
  get isGuest() { return !!(session.user && session.user.guest); },
};

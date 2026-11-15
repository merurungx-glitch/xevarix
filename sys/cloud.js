/* XEVARIX — XEVORA アカウントと同期
   ・XEVARIX は XEVORA アカウント（XEVARION と同じアカウント）でのみ使う。ログインは「表示名（ID）＋4桁の PIN」。
     アカウントを作るのは XEVORA（ランチャー）だけ。アカウントのデータベースは XEVARION の Firebase（xevarion-account）で、ここは読むだけ（REST）。
     PIN の確かめ方は XEVARION と同じ：SHA-256("xevarion-pin:"+PIN) を accounts/<uid>/gamePwHash とくらべる。
   ・ログインした目印 xevora_login_v1（{ uid, name, h, at }）を、同じオリジンの XEVORA・XEVARION と分けあう（「〇〇でつづける」に使う）。
   ・ユーザーの「配置と設定」と「メモ・予定・ルーティン」を、XEVARIX の Firebase（xevarix-244dd）の
     users/<アカウントの uid> に置く（REST）。ルールは firebase-rules.json の users。
       配置と設定 … そのまま置く（見られても困らないものだけ。PLAIN）
       メモ・予定・ルーティン … 「同期の合言葉」から作った鍵で暗号化して置く（AES-GCM。SEC とメモ）。合言葉はクラウドに送らない。
         ※ 4桁の PIN から鍵は作らない（PIN の確認用の値はアカウントのクラウドから読めるので、守りにならない）
   ・同じものを2つの端末で変えたら、あとから変えたほうが勝つ（キーごと・メモ1枚ごと）。
   ・端末のパスコード・生体認証・保管庫は、端末のロックとして今までどおり（同期しない）。ゲストは無い。 */

import { bus, log } from './core.js';
import { h, debounce, bufToB64, b64ToBuf, utf8, unutf8 } from './util.js';
import { DIRS } from './fs.js';
import { modal, toast, alertBox, confirmBox } from './shell/ui.js';

const XV_DB = 'https://xevarion-account-default-rtdb.asia-southeast1.firebasedatabase.app';
const FB = 'https://xevarix-244dd-default-rtdb.asia-southeast1.firebasedatabase.app';

/* 同期するもの（設定の台帳のキー）。apps.ids は「入れてあるストアのアプリの id の一覧」（apps.web から作る仮のキー） */
export const PLAIN = ['home.layout', 'dock.pins', 'apps.ids', 'apps.custom', 'apps.hidden', 'apps.perms',
  'ui.theme', 'ui.accent', 'ui.wall', 'ui.wallLive', 'ui.textScale', 'ui.fx', 'ui.motion', 'ui.contrast', 'ui.icon', 'ui.clock24', 'ui.seconds', 'ui.widgets', 'ui.haptics',
  'sound.on', 'sound.volume', 'sound.pack', 'wm.tablet', 'notify.sound', 'notify.mute', 'spaces.list', 'clock.cities',
  'ai.enabled', 'ai.suggest', 'ai.tone', 'ai.keep', 'notes.pins', 'mig.xevarion'];
export const SEC = ['calendar.events', 'routines.list'];
const ALL = [...PLAIN, ...SEC];
const ORDER = k => (k === 'apps.ids' ? 0 : k === 'apps.custom' ? 1 : k === 'home.layout' ? 3 : 2);   // アプリを入れてから並びを決める
const CHK = 'xevarix-sync-ok';
const ITER = 150000;
const NOTE_MAX = 400000;      // メモ1枚の上限（文字）
const ek = k => k.replace(/\./g, ',');       // Firebase のキーに「.」は使えない
const dk = k => k.replace(/,/g, '.');
const regKey = k => (k === 'apps.ids' ? 'apps.web' : k);
const syncKey = rk => (rk === 'apps.web' ? 'apps.ids' : rk);
const rand = n => crypto.getRandomValues(new Uint8Array(n));

/* ══ XEVORA アカウント（アカウントのデータベースは読むだけ）══ */
async function sha256hex(s) { const d = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(s))); return [...d].map(x => x.toString(16).padStart(2, '0')).join(''); }
export const pinHash = pin => sha256hex('xevarion-pin:' + pin);
const MARK = 'xevora_login_v1';
const XEVORA_SITE = 'https://merurungx-glitch.github.io/xevora/';
const DEV_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$|\.(localhost|test)$/i;
/* XEVORA（アカウントを作る・インストールのランチャー）の場所。手元は となりの ../xevora/、公開後は XEVORA の公開先 */
export function xevoraURL(hash = '') { return (DEV_HOST.test(location.hostname) ? new URL('../xevora/', location.href).href : XEVORA_SITE) + hash; }
/* この端末で最後に XEVORA アカウントにログインした目印（XEVORA・XEVARION と分けあう）。無ければ XEVARION のログインを見る */
export function localXv() {
  try { const m = JSON.parse(localStorage.getItem(MARK) || 'null'); if (m && m.uid && m.name) return { uid: m.uid, name: String(m.name), hash: m.h || '', mark: true }; } catch { /* 読めなければ次へ */ }
  try { const a = JSON.parse(localStorage.getItem('xeva_account_v1') || 'null'); return a && a.name ? { uid: a.xvUid || null, name: String(a.name), hash: a.gamePwHash || '' } : null; } catch { return null; }
}
export function setMark(uid, name, h) { try { localStorage.setItem(MARK, JSON.stringify({ uid, name, h: h || '', at: Date.now(), by: 'xevarix' })); } catch { /* 保存できなくても動く */ } }
export function clearMark(uid) { try { const m = JSON.parse(localStorage.getItem(MARK) || 'null'); if (m && (!uid || m.uid === uid)) localStorage.removeItem(MARK); } catch { /* 無くてもよい */ } }
/* 目印の PIN の確認用の値が、いまのアカウントと同じか（PIN を変えていたら、もう一度 PIN を入れてもらう） */
async function markOk(m) {
  if (!m || !m.uid || !m.hash) return false;
  try { const h = await getJSON(XV_DB + '/accounts/' + encodeURIComponent(m.uid) + '/gamePwHash.json'); return !!h && h === m.hash; } catch { return false; }
}
async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error('通信に失敗しました（' + r.status + '）');
  return r.json();
}
export async function xvVerify(name, pin) {
  name = String(name || '').trim(); pin = String(pin || '').trim();
  if (!name) return { error: '表示名を入れてください。' };
  if (!/^\d{4}$/.test(pin)) return { error: 'PIN は4桁の数字です。' };
  const hash = await pinHash(pin), lower = name.toLowerCase();
  let acc = null;
  try {
    const j = await getJSON(XV_DB + '/accounts.json?orderBy=' + encodeURIComponent('"nameLower"') + '&equalTo=' + encodeURIComponent(JSON.stringify(lower)));
    const uid = Object.keys(j || {})[0];
    if (uid) acc = { uid, name: j[uid].name || name, hash: j[uid].gamePwHash || '' };
  } catch (e) {
    /* つながらないときは、この端末の XEVARION にログインしている人と同じなら、その控えでくらべる */
    const l = localXv();
    if (l && l.uid && l.name.toLowerCase() === lower) acc = { uid: l.uid, name: l.name, hash: l.hash };
    else return { error: 'XEVARION につながりません。通信を確かめてください。' };
  }
  if (!acc) return { error: 'その表示名の XEVORA アカウントは見つかりません。アカウントは XEVORA で作れます。' };
  if (!acc.hash || acc.hash !== hash) return { error: 'PIN がちがいます。' };
  return { uid: acc.uid, name: acc.name, hash };
}
/* XEVORA アカウントの表示名と PIN をたずねて確かめる。成功なら { uid, name }、やめたら null。
   onlyUid … そのアカウントだけ（ログアウトしたユーザーの入り直し）。name … はじめに入れておく表示名。
   この端末で XEVORA にログインした目印があれば「〇〇 でつづける」（PIN の確認用の値がいまと同じときだけ通す） */
export async function askLogin({ title = 'XEVORA アカウントでログイン', text = '', onlyUid = null, name = '' } = {}) {
  let l = localXv(); if (l && onlyUid && l.uid !== onlyUid) l = null;
  const nm = h('input', { class: 'field', type: 'text', maxlength: 20, value: name || (l ? l.name : ''), placeholder: '表示名（XEVORA アカウントの ID）', autocomplete: 'username', spellcheck: 'false', 'aria-label': '表示名' });
  const pin = h('input', { class: 'field', type: 'password', maxlength: 4, inputmode: 'numeric', pattern: '[0-9]*', placeholder: '4桁の PIN', autocomplete: 'current-password', 'aria-label': 'PIN' });
  const msg = h('p', { class: 'tiny', role: 'status', style: 'color:var(--danger);min-height:1.2em;margin:0' });
  let quick = null;
  const quickBtn = l && l.uid && l.hash ? h('button', { class: 'btn pri', type: 'button', style: 'justify-self:stretch', onclick: () => { quick = l; const b = document.querySelector('.xm .xm-btns .btn.pri'); if (b) b.click(); } }, '「' + l.name + '」でつづける') : null;
  const body = h('div', { style: 'display:grid;gap:8px' }, quickBtn, quickBtn ? h('p', { class: 'tiny', style: 'margin:0;color:var(--text-3);text-align:center' }, 'または、表示名と PIN で') : null, nm, pin, msg,
    h('p', { class: 'tiny', style: 'margin:0;color:var(--text-3)' }, 'XEVORA アカウントは XEVARION と同じアカウントです。まだ無ければ ',
      h('a', { href: xevoraURL('#signup'), target: '_blank', rel: 'noopener', style: 'color:var(--acc)' }, 'XEVORA で作れます'), '。PIN を忘れたときは XEVARION の設定で変えられます。'));
  for (;;) {
    setTimeout(() => { (quickBtn || (nm.value ? pin : nm)).focus(); }, 60);
    quick = null;
    const ok = await modal({ title, text: text || 'XEVORA アカウントの表示名と4桁の PIN を入れてください。', body,
      buttons: [{ label: 'やめる', value: false, cancel: true }, { label: 'ログイン', kind: 'pri', value: true }] });
    if (!ok) return null;
    msg.textContent = '確かめています…';
    if (quick) {
      if (await markOk(quick)) { setMark(quick.uid, quick.name, quick.hash); return { uid: quick.uid, name: quick.name }; }
      msg.textContent = 'この端末の記録が古くなっています（PIN を変えたなど）。表示名と PIN を入れてください。'; continue;
    }
    const r = await xvVerify(nm.value, pin.value);
    if (!r.error) {
      if (onlyUid && r.uid !== onlyUid) { msg.textContent = 'このユーザーとはちがうアカウントです。'; pin.value = ''; continue; }
      setMark(r.uid, r.name, r.hash);
      return { uid: r.uid, name: r.name };
    }
    msg.textContent = r.error; pin.value = '';
  }
}
export const askXvLogin = askLogin;

/* ══ 鍵（同期の合言葉から作る）══ */
async function deriveKey(pass, salt) {
  const k = await crypto.subtle.importKey('raw', utf8(String(pass)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, k, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
const exportKey = async k => bufToB64(new Uint8Array(await crypto.subtle.exportKey('raw', k)));
const importKey = b64 => crypto.subtle.importKey('raw', b64ToBuf(b64), 'AES-GCM', true, ['encrypt', 'decrypt']);
async function seal(text) { const iv = rand(12); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, utf8(text))); return { iv: bufToB64(iv), ct: bufToB64(ct) }; }
async function unseal(rec, k = key) { return unutf8(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(rec.iv) }, k, b64ToBuf(rec.ct)))); }

/* ══ 同期 ══ */
let X = null, me = null, meta = null, key = null, pushT = 0, pollT = 0, applying = 0, busy = false, readyRes = null;
let dirty = new Set(), dirtyNotes = new Set();
let state = { state: 'off', at: 0, text: '' };
let readyP = Promise.resolve();
const META = 'cloud.meta';     // この端末・このユーザーだけの控え（キーごとの書いた時刻・最後に見たクラウドの時刻・鍵）
const userURL = (p = '') => FB + '/users/' + me.xv.uid + p + '.json';
const saveMeta = debounce(() => { if (meta && X) X.session.db.kv.put(meta, META).catch(() => {}); }, 400);
function setState(s, text = '') { state = { state: s, at: s === 'ok' ? Date.now() : state.at, text }; bus.emit('cloud:status', state); }
function schedule(ms = 1500) { clearTimeout(pushT); pushT = setTimeout(() => push(), ms); }

function getVal(k) { if (k === 'apps.ids') return Object.keys(X.reg.get('apps.web') || {}); const v = X.reg.get(k); return v === undefined ? null : v; }
async function setVal(k, v) {
  if (k === 'apps.ids') {
    const want = new Set(Array.isArray(v) ? v : []), have = Object.keys(X.reg.get('apps.web') || {});
    if ([...want].some(id => !have.includes(id))) { try { await X.apps.loadCatalog(); } catch { /* オフライン：入れられる分だけ */ } }
    for (const id of want) if (!have.includes(id)) X.apps.install(id);
    for (const id of have) if (!want.has(id)) X.apps.uninstall(id);
    return;
  }
  X.reg.set(k, v == null ? undefined : v);
}
const isNote = n => n && n.kind === 'file' && !n.trashed && n.parent === DIRS.notes;
async function notesNow() { return (await X.fs.ls(DIRS.notes)).filter(isNote); }

function onReg(v, rk) {
  if (applying || !me) return;
  const k = syncKey(rk); if (!ALL.includes(k)) return;
  meta.t[k] = Date.now(); dirty.add(k); saveMeta(); schedule();
}
function onFs(e) {
  if (applying || !me || !e || !e.node) return;
  const n = e.node;
  if (n.kind !== 'file' || !(n.parent === DIRS.notes || e.from === DIRS.notes || meta.nt[n.id] !== undefined)) return;
  meta.nt[n.id] = Date.now(); dirtyNotes.add(n.id); saveMeta(); schedule();
}

async function push() {
  if (!me || !meta) return;
  if (busy) return schedule(1200);
  if (!dirty.size && !dirtyNotes.size) return;
  if (!navigator.onLine) { setState('offline', 'オフラインです。つながったら送ります。'); return; }
  const keys = [...dirty], notes = key ? [...dirtyNotes] : [];
  const body = {}, now = Date.now(); let n = 0;
  for (const k of keys) {
    const t = meta.t[k] || now;
    if (SEC.includes(k)) { if (!key) continue; body['sec/' + ek(k)] = { ...(await seal(JSON.stringify(getVal(k)))), t }; }
    else body['reg/' + ek(k)] = { v: JSON.stringify(getVal(k)), t };
    n++;
  }
  for (const id of notes) {
    const nd = await X.fs.get(id), t = meta.nt[id] || now;
    if (!isNote(nd)) { body['notes/' + id] = { del: 1, t }; n++; continue; }
    const text = await X.fs.readText(id);
    if (text.length > NOTE_MAX) { log.warn('cloud', 'メモ「' + nd.name + '」は大きいので同期しません'); continue; }
    body['notes/' + id] = { ...(await seal(JSON.stringify({ n: nd.name, x: text, c: nd.ctime, m: nd.mtime }))), t }; n++;
  }
  if (!n) return;
  body.t = now; body.name = me.xv.name;
  busy = true; setState('syncing', '送っています…');
  for (const k of keys) if (body['reg/' + ek(k)] || body['sec/' + ek(k)]) dirty.delete(k);
  for (const id of notes) if (body['notes/' + id]) dirtyNotes.delete(id);
  try {
    const r = await fetch(userURL(), { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
    if (!r.ok) throw new Error('クラウドに書けません（' + r.status + '）');
    meta.seen = Math.max(meta.seen || 0, now); saveMeta();
    setState('ok', n + ' 件を送りました');
  } catch (e) {
    for (const k of keys) if (body['reg/' + ek(k)] || body['sec/' + ek(k)]) dirty.add(k);
    for (const id of notes) if (body['notes/' + id]) dirtyNotes.add(id);
    setState('error', (e && e.message) || '送れませんでした'); schedule(30000);
  } finally { busy = false; }
}

async function applyNote(id, rec) {
  const local = await X.fs.get(id);
  if (rec.del) { if (isNote(local)) await X.fs.trash(id); meta.nt[id] = rec.t; return; }
  const d = JSON.parse(await unseal(rec));
  const x = String(d.x || ''), name = String(d.n || 'メモ.md');
  if (local && local.kind === 'file') {
    if (local.trashed) await X.fs.restore(id);
    const cur = await X.fs.get(id);
    if (cur.parent !== DIRS.notes) await X.fs.move(id, DIRS.notes);
    if (cur.name !== name) await X.fs.rename(id, name);
    if ((await X.fs.readText(id)) !== x) await X.fs.update(id, x);
  } else {
    await X.fs.load({ nodes: [{ id, parent: DIRS.notes, name, kind: 'file', ctime: d.c || rec.t, mtime: d.m || rec.t, trashed: 0, mime: X.fs.mimeOf(name), size: utf8(x).length, excerpt: x.slice(0, 6000) }], blobs: { [id]: x } });
  }
  meta.nt[id] = rec.t;
}

/* クラウドの中身を取りこむ。first=true は「つないだ直後」 */
async function pull() {
  if (!me) return;
  if (busy) { await new Promise(r => setTimeout(r, 800)); if (busy) return; }
  busy = true; setState('syncing', '受けとっています…');
  let j = null;
  try { j = await getJSON(userURL()); }
  catch (e) { busy = false; setState(navigator.onLine ? 'error' : 'offline', (e && e.message) || '受けとれませんでした'); return false; }
  let badKey = false, got = 0;
  applying++;
  try {
    const R = (j && j.reg) || {}, S = (j && j.sec) || {}, N = (j && j.notes) || {};
    const ks = [...new Set([...Object.keys(R).map(dk), ...Object.keys(S).map(dk)])].filter(k => ALL.includes(k)).sort((a, b) => ORDER(a) - ORDER(b));
    for (const k of ks) {
      const rec = SEC.includes(k) ? S[ek(k)] : R[ek(k)]; if (!rec) continue;
      const lt = meta.t[k] || 0;
      if (rec.t > lt) {
        if (SEC.includes(k) && !key) continue;
        let v;
        try { v = JSON.parse(SEC.includes(k) ? await unseal(rec) : rec.v); } catch { if (SEC.includes(k)) badKey = true; continue; }
        await setVal(k, v); meta.t[k] = rec.t; dirty.delete(k); got++;
      } else if (lt > rec.t) dirty.add(k);
    }
    /* こちらで変えたのに、クラウドにまだ無いもの */
    for (const k of Object.keys(meta.t)) if (ALL.includes(k) && !(SEC.includes(k) ? S : R)[ek(k)]) dirty.add(k);
    if (key) {
      for (const id of Object.keys(N)) {
        const rec = N[id], lt = meta.nt[id] || 0;
        if (rec.t > lt) { try { await applyNote(id, rec); got++; } catch { badKey = true; } }
        else if (lt > rec.t) dirtyNotes.add(id);
      }
      for (const nd of await notesNow()) if (!N[nd.id]) { if (meta.nt[nd.id] === undefined) meta.nt[nd.id] = nd.mtime || Date.now(); dirtyNotes.add(nd.id); }
    }
  } finally { applying--; busy = false; }
  meta.seen = Math.max(meta.seen || 0, (j && j.t) || 0); saveMeta();
  if (badKey) setState('badkey', '同期の合言葉が、ほかの端末とちがうようです。設定の「アカウントと同期」で入れ直してください。');
  else setState('ok', got ? got + ' 件を受けとりました' : '最新です');
  if (got) log.info('cloud', 'クラウドから ' + got + ' 件を受けとりました');
  if (dirty.size || dirtyNotes.size) schedule(400);
  bus.emit('cloud:pulled', { got });
  return true;
}

async function check() {
  if (!me || document.hidden || !navigator.onLine || busy) return;
  try {
    const t = await getJSON(userURL('/t'));
    if (t && t > (meta.seen || 0)) await pull();
    else if (dirty.size || dirtyNotes.size) push();
  } catch (e) { setState('error', (e && e.message) || '確かめられませんでした'); }
}
const onVis = () => { if (!document.hidden) check(); };

/* いまの端末の値を全部「新しい」として送る（クラウドが空のとき・この端末を残すとき） */
async function markAllLocal() {
  const now = Date.now();
  for (const k of ALL) {
    if (SEC.includes(k) && !key) { const v = getVal(k); if (Array.isArray(v) && !v.length) continue; }
    meta.t[k] = now; dirty.add(k);
  }
  if (key) for (const nd of await notesNow()) { meta.nt[nd.id] = now; dirtyNotes.add(nd.id); }
  saveMeta();
}

/* 同期を始める。how：'auto'（ふつうの起動）／'cloud'（クラウドの内容を使う）／'local'（この端末の内容を送る） */
async function begin(how = 'auto') {
  me = X.session.user;
  if (!me || !me.xv || me.xv.out || X.session.isGuest) { me = null; setState('off'); return; }
  /* この端末にあったユーザーを、はじめてアカウントにつないだとき：クラウドに配置があれば、どちらを使うか聞く */
  if (how === 'auto' && me.xv.ask) {
    let remote = null; try { remote = await getJSON(FB + '/users/' + me.xv.uid + '/t.json'); } catch { /* 通信できなければ、あとで */ }
    if (remote) {
      how = await modal({ title: 'どちらの配置を使いますか？', text: 'この XEVORA アカウントには、ほかの端末で使った XEVARIX の配置と設定があります。',
        buttons: [{ label: 'この端末の配置を送る', value: 'local', cancel: true }, { label: 'クラウドの配置を使う', kind: 'pri', value: 'cloud' }] }) || 'local';
    } else how = 'local';
    X.session.updateUser(me.id, { xv: { ...me.xv, ask: undefined } }); me = X.session.user;
  }
  meta = (await X.session.db.kv.get(META)) || null;
  if (!meta || meta.uid !== me.xv.uid) meta = { uid: me.xv.uid, t: {}, nt: {}, seen: 0 };
  key = null;
  if (meta.key) { try { key = await importKey(meta.key); } catch { delete meta.key; } }
  if (how === 'local') { await markAllLocal(); await push(); }
  else if (how === 'cloud') { meta.t = {}; meta.nt = {}; await pull(); }
  else await pull();
  if (me.xv.fresh) X.session.updateUser(me.id, { xv: { ...me.xv, fresh: undefined } });
  clearInterval(pollT); pollT = setInterval(check, 45000);
  document.removeEventListener('visibilitychange', onVis); document.addEventListener('visibilitychange', onVis);
  if (!key) setState(state.state === 'ok' ? 'nokey' : state.state, state.text);
}
function stop() { clearInterval(pollT); clearTimeout(pushT); document.removeEventListener('visibilitychange', onVis); me = null; meta = null; key = null; dirty = new Set(); dirtyNotes = new Set(); setState('off'); }

/* ══ 画面から使う操作 ══ */
async function link() {
  const u = X.session.user;
  if (!u || X.session.isGuest) { await alertBox('ゲストではつなげません', 'ゲストのデータは終わると消えるため、アカウントにはつなげません。'); return false; }
  const r = await askLogin({ title: 'XEVORA アカウントでログイン' });
  if (!r) return false;
  const other = X.session.users().find(x => x.xv && x.xv.uid === r.uid && x.id !== u.id);
  if (other) { await alertBox('すでにつながっています', 'この端末の「' + other.name + '」が、このアカウントとつながっています。1つのアカウントには、この端末のユーザー1人だけをつなげます。'); return false; }
  let remote = null;
  try { remote = await getJSON(FB + '/users/' + r.uid + '/t.json'); } catch (e) { await alertBox('クラウドにつながりません', (e && e.message) || '通信を確かめてください。'); return false; }
  let how = 'local';
  if (remote) {
    const v = await modal({ title: 'どちらの配置を使いますか？', text: 'このアカウントには、ほかの端末で使った XEVARIX の配置と設定があります。',
      buttons: [{ label: 'やめる', value: null, cancel: true }, { label: 'この端末の配置を送る', value: 'local' }, { label: 'クラウドの配置を使う', kind: 'pri', value: 'cloud' }] });
    if (!v) return false;
    how = v;
  }
  X.session.updateUser(u.id, { xv: { uid: r.uid, name: r.name, at: Date.now() } });
  await X.session.sysreg.flush();
  await begin(how);
  toast('ほかの端末でも、同じ表示名と PIN でログインすると、配置と設定がそろいます。', 'ok', 'XEVORA アカウント「' + r.name + '」でログインしました');
  return true;
}
/* ログアウト：この端末のデータは残したまま、次に使うときにもう一度ログインしてもらう（ユーザーを切りかえる画面へ） */
async function logout({ ask = true } = {}) {
  const u = X.session.user; if (!u || !u.xv) return false;
  if (ask && !await confirmBox('ログアウト', 'この端末の XEVARIX は、配置・設定・メモ・ファイルのまま残ります。次に使うときは、もう一度 XEVORA アカウントでログインします。', { ok: 'ログアウト', cancel: 'もどる' })) return false;
  await push().catch(() => {});
  const uid = u.xv.uid; stop();
  X.session.updateUser(u.id, { xv: { ...u.xv, out: 1 } });
  await X.session.sysreg.flush();
  clearMark(uid);
  setTimeout(() => X.act.switchUser(true), 300);
  return true;
}
async function deleteCloud() {
  const u = X.session.user; if (!u || !u.xv) return false;
  if (!await confirmBox('クラウドの XEVARIX のデータを消す', 'XEVARIX の Firebase にある、このアカウントの配置・設定・暗号化したメモ・予定・ルーティンを消して、ログアウトします。この端末のデータと、XEVORA アカウントそのものは消えません。元に戻せません。', { ok: '消す', danger: true })) return false;
  const r = await fetch(FB + '/users/' + u.xv.uid + '.json', { method: 'DELETE' });
  if (!r.ok) { await alertBox('消せませんでした', '通信を確かめてください（' + r.status + '）。'); return false; }
  stop();
  try { await X.session.db.kv.del(META); } catch { /* 無くてもよい */ }
  X.session.updateUser(u.id, { xv: { ...u.xv, ask: 1 } });
  toast('クラウドのデータを消しました。ログアウトします。', 'ok');
  return logout({ ask: false });
}
/* 同期の合言葉：クラウドに合言葉の確認用（chk）があれば「入れる」、無ければ「決める」 */
async function setPass() {
  if (!me) return false;
  let chk = null;
  try { chk = await getJSON(userURL('/chk')); } catch (e) { await alertBox('クラウドにつながりません', (e && e.message) || ''); return false; }
  const p1 = h('input', { class: 'field', type: 'password', maxlength: 64, autocomplete: 'new-password', placeholder: '合言葉（8文字以上）', 'aria-label': '合言葉' });
  const p2 = h('input', { class: 'field', type: 'password', maxlength: 64, autocomplete: 'new-password', placeholder: 'もう一度', 'aria-label': '合言葉をもう一度' });
  const msg = h('p', { class: 'tiny', role: 'status', style: 'color:var(--danger);min-height:1.2em;margin:0' });
  const body = h('div', { style: 'display:grid;gap:8px' }, p1, chk ? null : p2, msg);
  for (;;) {
    setTimeout(() => p1.focus(), 60);
    const ok = await modal({ title: chk ? '同期の合言葉を入れる' : '同期の合言葉を決める',
      text: chk ? 'ほかの端末で決めた合言葉を入れてください。メモ・予定・ルーティンを読めるようになります。'
        : 'メモ・予定・ルーティンは、この合言葉で暗号化してから送ります。合言葉は送りません。忘れると、ほかの端末では読めなくなります。ほかの端末でも同じ合言葉を入れてください。',
      body, buttons: [{ label: 'やめる', value: false, cancel: true }, { label: chk ? '入れる' : '決める', kind: 'pri', value: true }] });
    if (!ok) return false;
    if (p1.value.length < 8) { msg.textContent = '8文字以上にしてください。'; continue; }
    if (!chk && p1.value !== p2.value) { msg.textContent = '2回の入力がちがいます。'; p2.value = ''; continue; }
    msg.textContent = '鍵を作っています…';
    try {
      if (chk) {
        const k = await deriveKey(p1.value, b64ToBuf(chk.s));
        if (await unseal(chk, k).catch(() => '') !== CHK) { msg.textContent = '合言葉がちがいます。'; p1.value = ''; continue; }
        key = k;
      } else {
        const salt = rand(16), k = await deriveKey(p1.value, salt);
        key = k;
        const c = await seal(CHK);
        const r = await fetch(userURL('/chk'), { method: 'PUT', body: JSON.stringify({ s: bufToB64(salt), ...c }), headers: { 'Content-Type': 'application/json' } });
        if (!r.ok) { key = null; msg.textContent = 'クラウドに書けません（' + r.status + '）。'; continue; }
      }
    } catch (e) { msg.textContent = (e && e.message) || '鍵を作れませんでした。'; continue; }
    meta.key = await exportKey(key); saveMeta();
    /* この端末の予定・ルーティン・メモも、まだ送っていなければ送る */
    for (const k of SEC) { const v = getVal(k); if (meta.t[k] === undefined && Array.isArray(v) && v.length) { meta.t[k] = Date.now(); dirty.add(k); } }
    await pull();
    toast('メモ・予定・ルーティンも同期します。', 'ok', '同期の合言葉を' + (chk ? '入れました' : '決めました'));
    return true;
  }
}
async function forgetPass() {
  if (!me || !meta) return false;
  if (!await confirmBox('この端末から合言葉を消す', 'この端末では、メモ・予定・ルーティンの同期を止めます（この端末とクラウドのデータは消えません）。', { ok: '消す' })) return false;
  key = null; delete meta.key; saveMeta(); setState('nokey', '');
  return true;
}

export async function init(ctx) {
  X = ctx;
  let ready = false;
  readyP = new Promise(r => { readyRes = r; });
  X.cloud = {
    PLAIN, SEC,
    status: () => ({ ...state, linked: !!me, user: me && me.xv ? { uid: me.xv.uid, name: me.xv.name } : null, key: !!key, pending: dirty.size + dirtyNotes.size }),
    linked: () => !!me,
    whenReady: () => (ready ? Promise.resolve() : Promise.race([readyP, new Promise(r => setTimeout(r, 8000))])),
    link: async () => { const ok = await link(); bus.emit('cloud:status', state); return ok; },
    logout, unlink: logout, deleteCloud, setPass, forgetPass,
    syncNow: async () => { if (!me) return false; await push(); return pull(); },
    localXv, askLogin, askXvLogin: askLogin, xevoraURL,
  };
  X.reg.watch('*', onReg);
  bus.on('fs:change', onFs);
  addEventListener('online', () => check());
  addEventListener('pagehide', () => { if (me && (dirty.size || dirtyNotes.size)) push(); });
  const done = () => { ready = true; readyRes && readyRes(); };
  if (X.session.user && X.session.user.xv && !X.session.isGuest) begin('auto').catch(e => log.warn('cloud', '同期を始められません: ' + ((e && e.message) || e))).finally(done);
  else done();
}

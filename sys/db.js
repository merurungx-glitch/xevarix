/* XEVARIX — 保存の土台（IndexedDB）と設定の台帳（Registry）
   ★ 大事なデータは localStorage に置かない。配信先が XEVARION と同じサイトになる前提で、
     あちらのアカウント削除は「許可リストに無い localStorage のキーを全部消す」作りだから。
     localStorage に置くのは、消えても困らない起動用の控え（xvx. で始まるキー）だけ。 */

import { log } from './core.js';
import { clone, debounce } from './util.js';

const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

function openDB(name, version, upgrade) {
  return new Promise((res, rej) => {
    let r;
    try { r = indexedDB.open(name, version); } catch (e) { rej(e); return; }
    r.onupgradeneeded = e => upgrade(r.result, e.oldVersion, r.transaction);
    r.onsuccess = () => { const db = r.result; db.onversionchange = () => db.close(); res(db); };
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('blocked'));
  });
}

/* 1つの置き場（object store）への読み書き */
class Store {
  constructor(db, name) { this.db = db; this.name = name; }
  os(mode = 'readonly') { return this.db.transaction(this.name, mode).objectStore(this.name); }
  get(k) { return reqP(this.os().get(k)); }
  put(v, k) { return reqP(this.os('readwrite').put(v, k)); }
  del(k) { return reqP(this.os('readwrite').delete(k)); }
  clear() { return reqP(this.os('readwrite').clear()); }
  keys() { return reqP(this.os().getAllKeys()); }
  all() { return reqP(this.os().getAll()); }
  count() { return reqP(this.os().count()); }
  byIndex(idx, key) { return reqP(this.os().index(idx).getAll(key)); }
  async entries() { const [k, v] = await Promise.all([this.keys(), this.all()]); return k.map((key, i) => [key, v[i]]); }
}

/* IndexedDB が使えない端末用（その回かぎり・メモリだけ） */
class MemStore {
  constructor(keyPath, indexes) { this.m = new Map(); this.keyPath = keyPath; this.indexes = indexes || {}; }
  async get(k) { return clone(this.m.get(k)); }
  async put(v, k) { const key = this.keyPath ? v[this.keyPath] : k; this.m.set(key, clone(v)); return key; }
  async del(k) { this.m.delete(k); }
  async clear() { this.m.clear(); }
  async keys() { return [...this.m.keys()]; }
  async all() { return [...this.m.values()].map(clone); }
  async count() { return this.m.size; }
  async byIndex(idx, key) { const f = this.indexes[idx]; return [...this.m.values()].filter(v => v[f] === key).map(clone); }
  async entries() { return [...this.m.entries()].map(([k, v]) => [k, clone(v)]); }
}

export const SCHEMA = {
  sys: { kv: {}, log: { autoIncrement: true } },
  user: {
    kv: {},
    nodes: { keyPath: 'id', indexes: { parent: 'parent' } },
    blobs: {},
    vault: { keyPath: 'id' },
    snaps: { keyPath: 'id' },
  },
};

export let persistent = true;   // false ならメモリだけ（保存できない端末）

async function openSet(name, schema) {
  const out = {};
  try {
    const db = await openDB(name, 1, d => {
      for (const s in schema) {
        if (d.objectStoreNames.contains(s)) continue;
        const def = schema[s];
        const os = d.createObjectStore(s, def.keyPath ? { keyPath: def.keyPath } : (def.autoIncrement ? { autoIncrement: true } : undefined));
        for (const ix in (def.indexes || {})) os.createIndex(ix, def.indexes[ix]);
      }
    });
    for (const s in schema) out[s] = new Store(db, s);
    out._db = db;
  } catch (e) {
    persistent = false;
    log.warn('db', 'IndexedDB を開けません。この回はメモリだけで動きます: ' + (e && e.message));
    for (const s in schema) out[s] = new MemStore(schema[s].keyPath, schema[s].indexes);
  }
  return out;
}

export const sysDB = () => openSet('xevarix-sys', SCHEMA.sys);
export const userDB = uid => openSet('xevarix-u-' + uid, SCHEMA.user);
export function dropUserDB(uid) {
  return new Promise(res => {
    try { const r = indexedDB.deleteDatabase('xevarix-u-' + uid); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch { res(); }
  });
}

/* ── 設定の台帳 ──
   キーは 'ui.theme' のような平らな名前。値は丸ごと1つの JSON として kv に置く（小さいので）。
   読むのは同期（メモリ）・書くのは少し待ってまとめて保存。 */
export class Registry {
  constructor(store, key, defaults) {
    this.store = store; this.key = key; this.defaults = defaults || {};
    this.data = {}; this.watchers = new Set();
    this._save = debounce(() => this.flush(), 250);
  }
  async load() {
    try { this.data = (await this.store.get(this.key)) || {}; } catch (e) { this.data = {}; log.warn('reg', '読みこみに失敗: ' + e.message); }
    return this;
  }
  has(k) { return Object.prototype.hasOwnProperty.call(this.data, k); }
  get(k, d) {
    if (this.has(k)) return this.data[k];
    if (k in this.defaults) return clone(this.defaults[k]);
    return d;
  }
  set(k, v) {
    const old = this.get(k);
    if (v === undefined) delete this.data[k]; else this.data[k] = v;
    this._save();
    this.notify(k, this.get(k), old);
    return v;
  }
  /* 配列・オブジェクトの値を書きかえる: reg.update('dock.pins', a => { a.push('x'); }) */
  update(k, fn) { const v = clone(this.get(k)); const r = fn(v); return this.set(k, r === undefined ? v : r); }
  reset(k) { return this.set(k, undefined); }
  notify(k, v, old) { for (const w of [...this.watchers]) { if (k === w.k || w.k === '*' || (w.prefix && k.startsWith(w.k))) { try { w.fn(v, k, old); } catch (e) { log.error('reg', 'watch ' + k + ': ' + e.message); } } } }
  /* k が '.' で終わるときは、その頭ではじまるキー全部。'*' はすべてのキー（同期が使う） */
  watch(k, fn) { const w = { k, fn, prefix: k.endsWith('.') }; this.watchers.add(w); return () => this.watchers.delete(w); }
  all() { return { ...clone(this.defaults), ...clone(this.data) }; }
  raw() { return clone(this.data); }
  replace(obj) { const old = this.data; this.data = clone(obj) || {}; this._save(); for (const k of new Set([...Object.keys(old), ...Object.keys(this.data)])) this.notify(k, this.get(k), old[k]); }
  flush() { this._save.cancel(); return this.store.put(clone(this.data), this.key).catch(e => log.error('reg', '保存に失敗: ' + e.message)); }
}

/* ── 小さな控え（localStorage・消えても困らないものだけ）── */
export const boot = {
  get(k, d = null) { try { const v = localStorage.getItem('xvx.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { if (v == null) localStorage.removeItem('xvx.' + k); else localStorage.setItem('xvx.' + k, JSON.stringify(v)); } catch { /* 保存できなくても動く */ } },
};

/* XEVARIX — 引きつぎ・書き出し・復元ポイント
   ・書き出し／読みこみ … 設定・ファイル・保管庫・記録を1つの .xvx ファイルに（合言葉を決めると暗号化）
   ・引きつぎコード … 同じ中身を、コードを合言葉にして暗号化し、15分だけ預ける（Firebase）。
                       預け先に見えるのは暗号文だけ。場所の名前も、コードから作った値なので当てられない。
   ・復元ポイント … 設定などの「状態」だけの控え（ファイルの中身は入らない）。7つまで。
   ★ 通信するのは「引きつぎコード」を使ったときだけ。 */

import { bus, log, OS } from './core.js';
import { bufToB64, b64ToBuf, gzip, gunzip, utf8, unutf8, saveBlob, fmtBytes, dateKey, uid } from './util.js';
import { qrSvg } from './qr.js';
import { confirmBox, alertBox, toast } from './shell/ui.js';

const FB = 'https://xevarix-244dd-default-rtdb.asia-southeast1.firebasedatabase.app';
const PART = 9000000, MAX_CLOUD = 40 * 1024 * 1024, TTL = 15 * 60000;
const DEVICE_KEYS = ['lock.bio', 'ai.llm', 'wm.bounds', 'store.cache', 'session.apps'];      // 端末ごとのもの（移さない）
const KV_KEYS = ['suggest', 'ai.learned', 'ai.history'];
let X, reg, db, cloud = null;

const blobToRec = async d => (typeof d === 'string' ? { t: 's', d } : d == null ? { t: 's', d: '' } : { t: 'b', m: d.type || '', d: bufToB64(new Uint8Array(await (d instanceof Blob ? d : new Blob([d])).arrayBuffer())) });
const recToBlob = r => (r.t === 's' ? r.d : new Blob([b64ToBuf(r.d)], { type: r.m || 'application/octet-stream' }));
const packBytes = v => (v && v.byteLength !== undefined ? { $b: bufToB64(new Uint8Array(v.buffer || v)) } : v);
const unpackBytes = v => (v && v.$b ? b64ToBuf(v.$b) : v);

async function state() {
  const r = reg.raw(); for (const k of DEVICE_KEYS) delete r[k];
  const kv = {}; for (const k of KV_KEYS) { const v = await db.kv.get(k).catch(() => null); if (v != null) kv[k] = v; }
  return { reg: r, kv };
}
async function collect({ files = true } = {}) {
  const me = X.session.getUser(X.session.user.id) || X.session.user;
  const out = { fmt: 'xevarix-backup', v: 1, at: Date.now(), os: OS.version, user: { name: me.name, color: me.color, pass: me.pass || null }, ...(await state()), fs: null, vault: [] };
  if (files) {
    const dump = await X.fs.dump(true); const blobs = {};
    for (const id in dump.blobs) blobs[id] = await blobToRec(dump.blobs[id]);
    out.fs = { nodes: dump.nodes, blobs };
    for (const v of await db.vault.all()) out.vault.push({ id: v.id, mtime: v.mtime, size: v.size, head: { iv: packBytes(v.head.iv), ct: packBytes(v.head.ct) }, body: { iv: packBytes(v.body.iv), ct: packBytes(v.body.ct) } });
  } else delete out.reg['vault.meta'];
  return out;
}
async function apply(data) {
  if (!data || data.fmt !== 'xevarix-backup') throw new Error('XEVARIX の控えではありません');
  await snapshot('読みこむ前の状態');
  const keep = {}; for (const k of DEVICE_KEYS) if (reg.has(k)) keep[k] = reg.get(k);
  if (!data.fs && reg.has('vault.meta')) keep['vault.meta'] = reg.get('vault.meta');
  reg.replace({ ...(data.reg || {}), ...keep }); await reg.flush();
  for (const k in (data.kv || {})) await db.kv.put(data.kv[k], k).catch(() => {});
  await db.kv.del('ai.model').catch(() => {});
  let files = 0;
  if (data.fs) {
    const blobs = {}; for (const id in data.fs.blobs) blobs[id] = recToBlob(data.fs.blobs[id]);
    await X.fs.load({ nodes: data.fs.nodes, blobs }, { replace: true }); files = data.fs.nodes.filter(n => n.kind === 'file').length;
    await db.vault.clear();
    for (const v of data.vault || []) await db.vault.put({ id: v.id, mtime: v.mtime, size: v.size, head: { iv: unpackBytes(v.head.iv), ct: unpackBytes(v.head.ct) }, body: { iv: unpackBytes(v.body.iv), ct: unpackBytes(v.body.ct) } });
  }
  if (data.user && !X.session.isGuest) X.session.updateUser(X.session.user.id, { name: data.user.name, color: data.user.color, ...(data.user.pass ? { pass: data.user.pass, bio: null } : {}) });
  await X.sysreg.flush();
  log.info('backup', '控えを読みこみました（' + files + ' 個のファイル）');
  return { text: '設定' + (data.fs ? 'と ' + files + ' 個のファイル' : '') + 'を読みこみました。' + (data.user && data.user.pass ? 'パスコードは、元の端末と同じものになります。' : '') };
}
async function pack(data) { const raw = utf8(JSON.stringify(data)); return (await gzip(raw)) || raw; }
async function unpack(bytes) { const b = bytes[0] === 0x1f && bytes[1] === 0x8b ? await gunzip(bytes) : bytes; return JSON.parse(unutf8(b)); }

/* ── 復元ポイント ── */
async function snapshot(label) {
  const data = await state(); const size = JSON.stringify(data).length;
  const s = { id: uid('sn'), t: Date.now(), label: label || '控え', size, data };
  await db.snaps.put(s);
  const all = (await db.snaps.all()).sort((a, b) => b.t - a.t);
  for (const old of all.slice(7)) await db.snaps.del(old.id);
  return s;
}

/* ── 預け先（Firebase）とのやりとり ── */
const normCode = c => { const s = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return s.length === 16 ? s.match(/.{4}/g).join('-') : null; };
const idOf = code => X.security.sha256hex('xvx-transfer:' + code).then(h => h.slice(0, 40));
async function checkCloud() {
  if (cloud !== null) return cloud;
  try { const r = await fetch(FB + '/meta/ok.json', { cache: 'no-store' }); cloud = r.ok; } catch { cloud = false; }
  return cloud;
}

export async function init(ctx) {
  X = ctx; reg = X.reg; db = X.session.db;
  X.backup = {
    /* 控えのファイルを作る（保存はしない） */
    async makeFile({ files = true, password = '' } = {}) {
      const bytes = await pack(await collect({ files }));
      const env = password ? { xvx: 1, enc: true, ...(await X.security.sealWith(password, bytes, 'xvx-file')) } : { xvx: 1, enc: false, data: bufToB64(bytes) };
      const name = 'XEVARIX-' + X.session.user.name.replace(/[\\/:*?"<>|\s]/g, '') + '-' + dateKey() + '.xvx';
      return { name, blob: new Blob([JSON.stringify(env)], { type: 'application/x-xevarix-backup' }) };
    },
    async exportFile(opts) { const f = await X.backup.makeFile(opts); saveBlob(f.blob, f.name); return { name: f.name, size: f.blob.size }; },
    async importFile(file, { password = '' } = {}) {
      let env; try { env = JSON.parse(await file.text()); } catch { throw new Error('ファイルを読めませんでした（XEVARIX の .xvx ファイルではないようです）'); }
      if (!env || env.xvx !== 1) throw new Error('XEVARIX の控えではありません');
      let bytes;
      if (env.enc) {
        if (!password) { const e = new Error('合言葉が要ります'); e.code = 'PASSWORD'; throw e; }
        try { bytes = await X.security.openWith(password, env, 'xvx-file'); } catch { const e = new Error('合言葉がちがいます'); e.code = 'PASSWORD'; throw e; }
      } else bytes = b64ToBuf(env.data);
      return apply(await unpack(bytes));
    },
    snapshots: async () => (await db.snaps.all()).sort((a, b) => b.t - a.t).map(s => ({ id: s.id, t: s.t, label: s.label, size: s.size })),
    snapshot,
    async restore(id) {
      const s = await db.snaps.get(id); if (!s) throw new Error('復元ポイントが見つかりません');
      await snapshot('戻す前の状態');
      const keep = {}; for (const k of [...DEVICE_KEYS, 'vault.meta']) if (reg.has(k)) keep[k] = reg.get(k);
      reg.replace({ ...s.data.reg, ...keep }); await reg.flush();
      for (const k in (s.data.kv || {})) await db.kv.put(s.data.kv[k], k).catch(() => {});
    },
    remove: id => db.snaps.del(id),
    checkCloud,
    get cloudOk() { return cloud; },
    /* コードを作って預ける */
    async send({ files = true } = {}) {
      if (!X.security.ok) throw new Error('この開き方（http）では暗号の機能を使えないため、引きつぎコードは作れません。ファイルでの書き出しを使ってください。');
      if (!navigator.onLine) throw new Error('オフラインです。通信できるときに、もう一度ためしてください。');
      const bytes = await pack(await collect({ files }));
      if (bytes.length > MAX_CLOUD) throw new Error('大きすぎます（' + fmtBytes(bytes.length) + '）。コードで送れるのは ' + fmtBytes(MAX_CLOUD) + ' までです。「設定だけ」にするか、ファイルに書き出してください。');
      const code = X.security.randomCode(4, 4), id = await idOf(code);
      const sealed = await X.security.sealWith(code, bytes, 'xvx-transfer');
      const parts = {}; for (let i = 0, n = 0; i < sealed.ct.length; i += PART, n++) parts[n] = sealed.ct.slice(i, i + PART);
      const exp = Date.now() + TTL;
      let r; try { r = await fetch(FB + '/transfer/' + id + '.json', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ v: 1, exp, iv: sealed.iv, size: bytes.length, parts }) }); } catch { throw new Error('預け先につながりませんでした。通信を確かめてください。'); }
      if (r.status === 401 || r.status === 403) { cloud = false; throw new Error('預け先の準備がまだ済んでいません（Firebase のルールが貼られていません）。それまでは、ファイルでの書き出しを使ってください。'); }
      if (!r.ok) throw new Error('預けられませんでした（' + r.status + '）');
      cloud = true; log.info('backup', '引きつぎコードを作りました（' + fmtBytes(bytes.length) + '）');
      return { code, exp, expires: exp, size: bytes.length, link: location.origin + location.pathname + '#t=' + code };
    },
    /* コードで受け取る */
    async receive(input) {
      const code = normCode(input); if (!code) throw new Error('コードは、英数字16文字です（例：ABCD-EFGH-JKLM-NPQR）。');
      if (!X.security.ok) throw new Error('この開き方（http）では暗号の機能を使えません。');
      const id = await idOf(code); let r;
      try { r = await fetch(FB + '/transfer/' + id + '.json', { cache: 'no-store' }); } catch { throw new Error('預け先につながりませんでした。通信を確かめてください。'); }
      const rec = r.ok ? await r.json() : null;
      if (!rec || !rec.parts) throw new Error('コードがちがうか、期限（15分）が切れています。もう一度、元の端末でコードを作ってください。');
      const ct = Object.keys(rec.parts).sort((a, b) => a - b).map(k => rec.parts[k]).join('');
      let bytes; try { bytes = await X.security.openWith(code, { iv: rec.iv, ct }, 'xvx-transfer'); } catch { throw new Error('暗号を解けませんでした。コードを確かめてください。'); }
      const out = await apply(await unpack(bytes));
      fetch(FB + '/transfer/' + id + '.json', { method: 'DELETE' }).catch(() => {});      // 受け取ったら、預けたものは消す
      return out;
    },
    qrSvg,
  };
  /* 1日1回、自動で控える */
  try { const all = await X.backup.snapshots(); if (!all.some(s => dateKey(new Date(s.t)) === dateKey()) && !X.session.isGuest) snapshot('自動（1日1回）').catch(() => {}); } catch { /* 控えられなくても続ける */ }
  /* QR から開かれたとき（アドレスの最後に #t=コード） */
  const m = /[#&]t=([A-Za-z0-9-]{16,24})/.exec(location.hash || '');
  if (m) {
    history.replaceState(null, '', location.pathname + location.search);
    bus.once('boot:done', async () => {
      const code = normCode(m[1]); if (!code) return;
      if (!await confirmBox('引きつぎデータを受け取りますか', 'コード ' + code + ' のデータを受け取って、このユーザー（' + X.session.user.name + '）の設定とファイルを入れかえます。いまの状態は、復元ポイントに控えます。', { ok: '受け取る' })) return;
      try { toast('受け取っています…', 'info', '引きつぎ'); const s = await X.backup.receive(code); await alertBox('受け取りました', s.text + '\n再起動して反映します。'); X.act.restart(); }
      catch (e) { alertBox('受け取れませんでした', e.message); }
    });
  }
}

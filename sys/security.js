/* XEVARIX — セキュリティ
   ・パスコード … そのものは保存しない。塩を足して何度もかき混ぜた値（PBKDF2）だけを持つ。
   ・生体認証 … 端末の Face ID・指紋・Windows Hello（WebAuthn）。画面のロック解除に使う。
   ・保管庫 … 中身は AES-GCM で暗号化。鍵はパスコードから作るので、パスコードを知らないと読めない。
   ★ 画面のロックは「のぞき見を防ぐもの」。本当に守りたいものは保管庫へ（こちらは暗号化される）。 */

import { bufToB64, b64ToBuf, b64url, unb64url, utf8, unutf8 } from './util.js';

const ITER = 150000;
const subtle = (typeof crypto !== 'undefined' && crypto.subtle) || null;
const rand = n => crypto.getRandomValues(new Uint8Array(n));

async function derive(pass, salt, iters = ITER) {
  const k = await subtle.importKey('raw', utf8(String(pass)), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iters }, k, 256));
}
function same(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; }
const aesKey = (raw, usages) => subtle.importKey('raw', raw, 'AES-GCM', false, usages);

export const security = {
  get ok() { return !!subtle; },

  /* ── パスコード ── */
  async makePass(pass) {
    const salt = rand(16); const hash = await derive(pass, salt);
    return { v: 1, salt: bufToB64(salt), hash: bufToB64(hash), iters: ITER, kind: /^\d+$/.test(pass) ? 'pin' : 'text', len: String(pass).length };
  },
  async checkPass(rec, pass) {
    if (!rec || !subtle) return false;
    try { return same(await derive(pass, b64ToBuf(rec.salt), rec.iters || ITER), b64ToBuf(rec.hash)); } catch { return false; }
  },

  /* ── 生体認証 ── */
  async bioAvailable() {
    try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch { return false; }
  },
  async bioRegister(user) {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: rand(32), rp: { name: 'XEVARIX' },
      user: { id: utf8('xvx:' + user.id), name: user.name, displayName: user.name },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60000, attestation: 'none',
    } });
    if (!cred) throw new Error('登録できませんでした');
    return { id: b64url(bufToB64(new Uint8Array(cred.rawId))), at: Date.now() };
  },
  async bioVerify(rec) {
    if (!rec || !rec.id) return false;
    try {
      const a = await navigator.credentials.get({ publicKey: {
        challenge: rand(32), allowCredentials: [{ type: 'public-key', id: b64ToBuf(unb64url(rec.id)), transports: ['internal'] }],
        userVerification: 'required', timeout: 60000,
      } });
      if (!a) return false;
      const flags = new Uint8Array(a.response.authenticatorData)[32];
      return (flags & 0x04) === 0x04;      // 本人確認（UV）が済んでいること
    } catch { return false; }
  },

  /* ── 保管庫 ── 親鍵（MK）を、パスコードから作った鍵で包んで持つ。パスコードを変えても包み直すだけ */
  async vaultCreate(pass) {
    const salt = rand(16), mk = rand(32), iv = rand(12);
    const kek = await aesKey(await derive(pass, salt), ['encrypt']);
    const wrapped = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, kek, mk));
    return { meta: { v: 1, salt: bufToB64(salt), iv: bufToB64(iv), wrapped: bufToB64(wrapped), iters: ITER }, key: await aesKey(mk, ['encrypt', 'decrypt']) };
  },
  async vaultOpen(meta, pass) {
    try {
      const kek = await aesKey(await derive(pass, b64ToBuf(meta.salt), meta.iters || ITER), ['decrypt']);
      const mk = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(meta.iv) }, kek, b64ToBuf(meta.wrapped)));
      return await aesKey(mk, ['encrypt', 'decrypt']);
    } catch { return null; }
  },
  async vaultRewrap(meta, oldPass, newPass) {
    const kek = await aesKey(await derive(oldPass, b64ToBuf(meta.salt), meta.iters || ITER), ['decrypt']);
    const mk = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(meta.iv) }, kek, b64ToBuf(meta.wrapped)));
    const salt = rand(16), iv = rand(12);
    const kek2 = await aesKey(await derive(newPass, salt), ['encrypt']);
    return { v: 1, salt: bufToB64(salt), iv: bufToB64(iv), wrapped: bufToB64(new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, kek2, mk))), iters: ITER };
  },
  async encrypt(key, bytes) {
    const iv = rand(12);
    return { iv, ct: new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)) };
  },
  async decrypt(key, { iv, ct }) { return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct)); },
  encryptText(key, s) { return security.encrypt(key, utf8(s)); },
  async decryptText(key, rec) { return unutf8(await security.decrypt(key, rec)); },

  /* ── 合言葉で暗号化（引きつぎ用）── */
  async sealWith(secret, bytes, salt = 'xvx-transfer') {
    const key = await aesKey(await derive(secret, utf8(salt), 60000), ['encrypt']);
    const iv = rand(12);
    return { iv: bufToB64(iv), ct: bufToB64(new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes))) };
  },
  async openWith(secret, rec, salt = 'xvx-transfer') {
    const key = await aesKey(await derive(secret, utf8(salt), 60000), ['decrypt']);
    return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(rec.iv) }, key, b64ToBuf(rec.ct)));
  },
  async sha256hex(s) { const d = new Uint8Array(await subtle.digest('SHA-256', utf8(s))); return [...d].map(x => x.toString(16).padStart(2, '0')).join(''); },
  randomCode(groups = 4, len = 4) {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const out = [];
    for (let g = 0; g < groups; g++) { let s = ''; for (const b of rand(len)) s += A[b % A.length]; out.push(s); }
    return out.join('-');
  },
};

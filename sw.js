/* XEVARIX — Service Worker（オフラインと、版の切りかえ）
   ・release.json に書いてあるファイル一式を、版ごとの入れもの（xvx-os-<版>）に控える。
   ・ページへは、いま「使う版（active）」の入れものから渡す。無いものだけ通信する。
   ・新しい版は「用意（staged）」として別の入れものにそろえてから、ページの合図で切りかえる。
   ・切りかえる前の版（previous）は残す。合図で戻せる。
   ★ この範囲（XEVARIX のフォルダ）だけを受けもつ。となりの xevarion のアプリには触らない。 */

const META = 'xvx-meta', KEY = '/__xvx/state', PREFIX = 'xvx-os-';
const NET_FIRST = [/release\.json$/, /store\/catalog\.json$/];

async function getState() { try { const c = await caches.open(META); const r = await c.match(KEY); return r ? await r.json() : {}; } catch { return {}; } }
async function setState(s) { const c = await caches.open(META); await c.put(KEY, new Response(JSON.stringify(s), { headers: { 'Content-Type': 'application/json' } })); return s; }
async function fetchRelease() { const r = await fetch('release.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('release ' + r.status); return r.json(); }

/* その版のファイルを全部そろえる。1つでも取れなければ、その入れものは使わない */
async function download(rel) {
  const name = PREFIX + rel.version; const c = await caches.open(name);
  const files = ['./', ...rel.files]; let done = 0;
  for (let i = 0; i < files.length; i += 8) {
    await Promise.all(files.slice(i, i + 8).map(async f => {
      const req = new Request(f, { cache: 'no-store' }); const res = await fetch(req);
      if (!res.ok) throw new Error(f + ' ' + res.status);
      await c.put(f === './' ? './' : f, res); done++;
    }));
  }
  await c.put('/__xvx/complete', new Response(String(done)));
  return name;
}
async function complete(version) { if (!version) return false; try { const c = await caches.open(PREFIX + version); return !!(await c.match('/__xvx/complete')); } catch { return false; } }
async function cleanup() {
  const s = await getState(); const keep = new Set([META, ...[s.active, s.previous, s.staged].filter(Boolean).map(v => PREFIX + v)]);
  for (const k of await caches.keys()) if (k.startsWith('xvx-') && !keep.has(k)) await caches.delete(k);
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    try {
      const s = await getState();
      if (!s.active || !(await complete(s.active))) { const rel = await fetchRelease(); await download(rel); await setState({ ...s, active: rel.version }); }
    } catch (err) { /* 通信できないときは、次の機会に */ }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    await cleanup(); await self.clients.claim();
    for (const cl of await self.clients.matchAll()) cl.postMessage({ xvx: 'ready' });
  })());
});

self.addEventListener('message', e => {
  const d = e.data || {}; const port = e.ports && e.ports[0]; const reply = v => port && port.postMessage(v);
  e.waitUntil((async () => {
    try {
      const s = await getState();
      if (d.xvx === 'state') reply({ ...s, ready: await complete(s.active) });
      else if (d.xvx === 'stage') {
        const rel = await fetchRelease();
        if (rel.version !== s.active) { await download(rel); await setState({ ...s, staged: rel.version }); }
        reply({ ok: true, version: rel.version });
      } else if (d.xvx === 'activate') {
        if (s.staged && await complete(s.staged)) { await setState({ active: s.staged, previous: s.active || null, staged: null }); await cleanup(); reply({ ok: true }); } else reply({ ok: false });
      } else if (d.xvx === 'rollback') {
        if (s.previous && await complete(s.previous)) { await setState({ active: s.previous, previous: s.active, staged: null }); reply({ ok: true }); } else reply({ ok: false });
      } else reply(null);
    } catch (err) { reply({ ok: false, error: String(err && err.message || err) }); }
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope).pathname; if (!url.pathname.startsWith(scope)) return;
  if (/\/sw\.js$/.test(url.pathname)) return;
  e.respondWith((async () => {
    const s = await getState(); const cache = s.active ? await caches.open(PREFIX + s.active) : null;
    const rel = url.pathname.slice(scope.length) || './';
    if (NET_FIRST.some(re => re.test(url.pathname))) {
      try { return await fetch(req, { cache: 'no-store' }); } catch (err) { const hit = cache && await cache.match(rel, { ignoreSearch: true }); if (hit) return hit; throw err; }
    }
    if (cache) {
      const hit = await cache.match(rel === 'index.html' ? './' : rel, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('./') : null);
      if (hit) return hit;
    }
    try { return await fetch(req); }
    catch (err) { if (req.mode === 'navigate' && cache) { const home = await cache.match('./'); if (home) return home; } throw err; }
  })());
});

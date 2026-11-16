/* XEVARIX — 更新とオフライン
   ・Service Worker（sw.js）が、版ごとにファイル一式を控える（xvx-os-<版>）。
   ・新しい版は、裏で丸ごと用意してから切りかえる（途中の中途半端な状態を見せない）。
   ・切りかえる前の版は残しておくので、「前の版に戻す」ができる。
   ・手元の開発（localhost）では、古い控えで混乱しないように止めてある（?sw=1 を付けると動く）。 */

import { bus, log, OS } from './core.js';

export const NOTES = [
  { version: '1.2.1', date: '2026-11-17', items: [
    'XEVARIX に「β版」の印を付けました（起動画面・ステータスバー・設定の「この XEVARIX について」と「更新」）。',
    'XEVORA は、XEVORA アカウントの作成・管理と、アプリを開くランチャーだけになりました。XEVARIX のダウンロード・更新・オフライン対応は、これまでどおり XEVARIX の中（設定 → 更新）で行います（前に XEVORA で入れたものは、そのまま使えます）。',
    'XEVARION のアプリの一覧と設定から、XEVARIX・XEVORA を開けるようになりました。',
    'ストアに、XEVARION の新作 MagiGura Plate（1台を囲むバランス皿ゲーム）を足しました。',
  ] },
  { version: '1.2.0', date: '2026-11-15', items: [
    'XEVORA アカウント：これまでの XEVARION のアカウントの名前が「XEVORA アカウント」になりました。XEVARIX と XEVARION は、XEVORA アカウントでのみ使います（ゲストは無くしました）。',
    'アカウントを作るのは XEVORA（新しいランチャー）だけになりました。',
    'XEVORA アカウントにつないでいない端末のユーザーは、次に開いたときにログインしてから使います（この端末のデータはそのまま）。設定から「ログアウト」もできます。',
    'ストアに、この PC で動く AniReview Studio・PlayCut Studio・CITY RAIL を足しました（別のフォルダのまま開きます。AniReview・PlayCut は、止まっていればサーバーを起動します）。',
    'XEVARIX のロゴとアイコンを新しくし、ドックのまん中の AI のマークを X のマークにしました。',
  ] },
  { version: '1.1.0', date: '2026-11-15', items: [
    'XEVARION をホームに入れました（アプリの先頭）。すでに使っている人のホームにも、1回だけ自動で入ります。',
    'ウィジェット「XEVARION のパートナー」：XEVARION でえらんでいる子とひとことが出て、押すと XEVARION が開きます。',
    'XEVORA アカウント（登録した表示名＋4桁の PIN）でつなげるようになりました。ほかの端末でも同じ配置・設定で使えます。メモ・予定・ルーティンは「同期の合言葉」で暗号化して同期します（設定 → アカウントと同期）。',
    'ホームを iPad のように自由に並べかえられるようになりました。アプリとウィジェットを同じ並びに置き、長押しで持って動かす・－で外す・＋でウィジェットを足す。',
    'タブレットでも、動かせて大きさを変えられる窓で開けるようになりました（iPadOS 26 のウインドウのように）。設定の「タブレットの窓」で、全画面＋2分割にも切りかえられます。',
    'ドックのまん中の AI のマークを、XEVARIX のロゴにしました。',
  ] },
  { version: '1.0.1', date: '2026-11-15', items: [
    '標準アプリを1本ずつ通しで使って見つけた不具合を直しました。',
    'ストア：アプリの絵が出ず、箱の記号になっていたのを直しました。',
    'ファイル：フォルダごとごみ箱に入れたとき、中のファイルが検索に出ていたのを直しました。',
    'エディタ：閉じるときの確認で Esc を押すと変更が消えていたのを直しました（Esc は「やめる」）。道具の列にいても Ctrl+S で保存できます。種類の印（.txt など）が無い名前で保存しても、あとで開けます。',
    'AI やドックの「終了する」でアプリを閉じたとき、保存の確認が出ても保存されなかったのを直しました（保存の確認に答えてから閉じます）。',
    '保管庫：書きかけのメモが、鍵をかけたとき・窓を閉じたときに消えていたのを直しました。何も書かないメモは増えません。保管庫を空にすれば、パスコードをやめられます。',
    'ビューア：画像が1枚だけのフォルダで ← → を押すと、フォルダが開いていたのを直しました。',
    '設定：ページを続けて切りかえると別のページの中身が出ることがあったのと、スペースの設定を続けて変えると前の変更が消えていたのを直しました。',
    'ルーティン：通知の題が、名前を変えても古いままだったのを直しました。',
    '通知センター：通知のボタンでアプリを開くと、通知センターを閉じます。カレンダー：お知らせを「1日前」「1時間前」と書きます。',
    'AI：聞き取れる言い回しを広げました（「ホーム画面を出して」「タイマーを取り消して」「覚えたことを見せて」「来月の1日は何曜日」など）。「全部消して」だけでは、アプリを閉じません。',
    'XEVARIX を XEVARION と別の場所（別のアカウントや別のサービス）に置いても、ストアのアプリが開けて、絵も出るようにしました（XEVARION の公開先から開きます）。',
  ] },
  { version: '1.0.0', date: '2026-11-14', items: [
    'XEVARIX のはじめての版です。',
    'OS の土台：起動・ロック・ホーム・窓（PC は重なる窓、タブレットは2分割、スマホは1枚ずつ）・検索・通知・コントロールセンター',
    '電力とパフォーマンス：4つの電力モード・自動の切りかえ・裏のアプリの休止・フレーム数の上限・端末の測定・システムモニター',
    'AI：端末の中だけで動く中核（操作・診断・案内・計算・ルーティン作成）と、追加の言語モデル・声',
    '標準アプリ：設定・ファイル・メモ・電卓・時計・カレンダー・システムモニター・ターミナル・ストア・保管庫・ルーティン・ビューア・エディタ・ヘルプ',
    '安全：パスコード・生体認証・暗号化した保管庫・操作の記録・複数ユーザーとゲスト',
    '引きつぎコード（QR）・書き出しと読みこみ・復元ポイント・更新と前の版への巻き戻し',
  ] },
];

let X, st = { state: 'idle', latest: null, sw: 'none', offline: false, previous: null }, reg = null;
const set = p => { st = { ...st, ...p }; bus.emit('update:state', st); };

function ask(type, data) {
  return new Promise(res => {
    const sw = navigator.serviceWorker && navigator.serviceWorker.controller; if (!sw) return res(null);
    const ch = new MessageChannel(); const t = setTimeout(() => res(null), type === 'stage' ? 180000 : 8000);
    ch.port1.onmessage = e => { clearTimeout(t); res(e.data); };
    sw.postMessage({ xvx: type, ...data }, [ch.port2]);
  });
}
const newer = (a, b) => { const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); } return false; };

async function refresh() {
  const s = await ask('state'); if (!s) return;
  set({ offline: !!s.ready, previous: s.previous && s.previous !== OS.version ? s.previous : null, state: s.staged && newer(s.staged, OS.version) ? 'ready' : st.state });
}
async function check(silent) {
  if (!navigator.onLine) { set({ state: 'offline' }); return st; }
  set({ state: 'checking' });
  try {
    const r = await fetch('release.json?t=' + Date.now(), { cache: 'no-store' }); if (!r.ok) throw new Error('release.json ' + r.status);
    const rel = await r.json(); set({ latest: { version: rel.version, date: rel.date, notes: rel.notes || [] } });
    if (!newer(rel.version, OS.version)) { set({ state: 'idle' }); return st; }
    if (st.sw !== 'active') { set({ state: 'available' }); return st; }
    set({ state: 'downloading' });
    const res = await ask('stage', { version: rel.version });
    if (res && res.ok) { set({ state: 'ready' }); if (!silent) X.notify.send({ title: '新しい版の用意ができました（' + rel.version + '）', body: '再起動すると更新されます。', actions: [{ label: '再起動して更新', fn: () => X.update.apply() }, { label: '変更点を見る', call: { name: 'app.open', args: { app: 'settings', args: { page: 'update' } } } }] }); }
    else set({ state: 'error' });
  } catch (e) { log.info('update', '更新を確かめられませんでした: ' + e.message); set({ state: 'error' }); }
  return st;
}

export async function init(ctx) {
  X = ctx;
  X.update = {
    info: () => ({ version: OS.version, build: OS.build, notes: NOTES, ...st }),
    check: () => check(false),
    async apply() { if (X.backup) await X.backup.snapshot('更新の前（' + OS.version + '）').catch(() => {}); await ask('activate'); X.act.restart(); },
    async rollback() { const r = await ask('rollback'); if (r && r.ok) X.act.restart(); else X.notify.send({ title: '前の版に戻せませんでした', body: '前の版の控えが見つかりません。', kind: 'warn' }); },
  };
  if (!('serviceWorker' in navigator)) { st.sw = 'unsupported'; return; }
  if (X.ENV.dev && !/[?&]sw=1/.test(location.search)) { st.sw = 'dev'; return; }
  try {
    reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
    st.sw = 'active';
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.xvx === 'ready') refresh(); });
    if (navigator.serviceWorker.controller) await refresh(); else navigator.serviceWorker.addEventListener('controllerchange', () => refresh(), { once: true });
    if (X.reg.get('update.auto') && !X.safe) setTimeout(() => check(true).then(s => { if (s.state === 'ready') X.notify.send({ title: '新しい版の用意ができました（' + s.latest.version + '）', body: '再起動すると更新されます。', actions: [{ label: '再起動して更新', fn: () => X.update.apply() }] }); }), 6000);
  } catch (e) { st.sw = 'none'; log.warn('update', 'オフラインの準備ができません: ' + e.message); }
}

/* XEVARIX 標準アプリ — 設定（後半：ロック・プライバシー・ユーザー・AI・保存容量・引きつぎ・更新・見やすさ・開発者・情報） */

import { h, fill, row, group, kv, sw, seg, select, slider, btn, page, meter, badge, note, card, icon, fmtDur, fmtBytes, fmtStamp, fmtRel, saveBlob, pickFiles } from './kit.js';

const H = (t, p) => [h('h2', { class: 'k-h' }, t), p ? h('p', { class: 'k-p' }, p) : null];
const tog = (os, key, label) => sw(os.reg.get(key), v => os.reg.set(key, v), label);
const missing = (main, title) => fill(main, page(H(title), note('このしくみを読みこめませんでした。システムモニターの「ログ」に理由が出ています。', 'warn')));
let acctOff = null;     // アカウントのページの「状態が変わったら描き直す」
const BY = { user: 'あなた', ai: 'AI', routine: 'ルーティン', terminal: 'ターミナル', search: '検索' };
const who = (os, by) => BY[by] || (by && by.startsWith('app:') ? ((os.apps.get(by.slice(4)) || {}).name || by.slice(4)) : by);
const AVATAR = [['#38e6fd', '#0a5cff'], ['#a589fb', '#5a3fd0'], ['#4ff0b8', '#0fa97e'], ['#ffb86b', '#f0553d'], ['#ff8fc7', '#c93f8f'], ['#ffd166', '#f0a51e']];

async function askNewPass(os) {
  const a = await os.ui.prompt('新しいパスコード', '4文字以上。数字だけにすると、ロック画面が数字の盤になります。', { type: 'password', mode: 'numeric', max: 12, ok: 'つぎへ' });
  if (a == null) return null;
  if (a.length < 4) { await os.ui.alert('短すぎます', '4文字以上にしてください。'); return null; }
  const b = await os.ui.prompt('もう一度', '同じパスコードを入れてください。', { type: 'password', mode: 'numeric', max: 12, ok: '決定' });
  if (b == null) return null;
  if (a !== b) { await os.ui.alert('同じではありません', '2回の入力がちがいました。もう一度やり直してください。'); return null; }
  return a;
}

export const PAGES2 = {
  async security(os, main, redraw) {
    const { security, session, reg } = os; const me = session.getUser(session.user.id) || session.user; const guest = session.isGuest;
    const bioOk = await security.bioAvailable();
    const hasVault = !!reg.get('vault.meta'); let vaultItems = 0;
    if (hasVault) { try { vaultItems = (await os.db.vault.keys()).length; } catch { vaultItems = 1; /* 数えられないときは、中身があるものとして守る */ } }
    const checkOld = async () => { if (!me.pass) return ''; const p = await os.ui.prompt('いまのパスコード', '変える前に、いまのパスコードを入れてください。', { type: 'password', mode: 'numeric', max: 12 }); if (p == null) return null; if (!await security.checkPass(me.pass, p)) { await os.ui.alert('ちがいます', 'パスコードが合いませんでした。'); return null; } return p; };
    fill(main, page(H('ロックと生体認証', '画面のロックは、のぞき見を防ぐためのものです。本当に守りたいものは「保管庫」へ入れてください（中身が暗号化されます）。'),
      !security.ok ? note('この開き方（http）では暗号の機能を使えないため、パスコードと保管庫は使えません。https で開くと使えます。', 'warn') : null,
      guest ? note('ゲストはパスコードを決められません。') : null,
      group('パスコード',
        row({ icon: 'key', title: me.pass ? 'パスコードを変える' : 'パスコードを決める', desc: me.pass ? '決めてあります（' + (me.pass.kind === 'pin' ? '数字 ' + me.pass.len + ' けた' : '文字') + '）' : 'まだ決めていません', onclick: !security.ok || guest ? null : async () => {
          const old = await checkOld(); if (old == null) return; const np = await askNewPass(os); if (!np) return;
          session.updateUser(me.id, { pass: await security.makePass(np) });
          const meta = reg.get('vault.meta'); if (meta && old) { try { reg.set('vault.meta', await security.vaultRewrap(meta, old, np)); } catch { await os.ui.alert('保管庫の鍵を作り直せませんでした', '保管庫は前のパスコードのままです。'); } }
          os.ui.toast('パスコードを決めました', 'ok'); redraw();
        } }),
        /* 保管庫の鍵はパスコードから作るので、中身があるあいだはやめられない。空なら、保管庫の印もいっしょに片づける */
        me.pass ? row({ icon: 'trash', title: 'パスコードをやめる', danger: true, desc: vaultItems ? '保管庫に中身があるあいだは、やめられません（先に、保管庫の中身をすべて消してください）。' : hasVault ? '空の保管庫も、いっしょに片づけます。' : null, onclick: vaultItems ? null : async () => { const old = await checkOld(); if (old == null) return; if (hasVault) reg.reset('vault.meta'); session.updateUser(me.id, { pass: null, bio: null }); redraw(); } }) : null,
        row({ icon: 'clock', title: '自動でロックするまで', desc: me.pass ? '操作が無い時間がつづいたらロックします。' : 'パスコードを決めると使えます。', right: select([[0, 'しない'], [1, '1分'], [3, '3分'], [5, '5分'], [10, '10分'], [30, '30分']], reg.get('lock.auto'), v => reg.set('lock.auto', Number(v))) }),
        row({ icon: 'lock', title: 'いますぐロック', onclick: () => os.act.lock() })),
      group('生体認証',
        row({ icon: 'fingerprint', title: me.bio ? '生体認証を外す' : '生体認証でロックを開ける', desc: !bioOk ? 'この端末・ブラウザでは使えません。' : !me.pass ? '先にパスコードを決めてください。' : me.bio ? '登録してあります（' + fmtStamp(me.bio.at) + '）' : 'Face ID・指紋・Windows Hello など、端末の本人確認を使います。',
          onclick: !bioOk || !me.pass ? null : async () => {
            if (me.bio) { session.updateUser(me.id, { bio: null }); return redraw(); }
            try { const rec = await security.bioRegister(me); session.updateUser(me.id, { bio: rec }); os.ui.toast('生体認証を登録しました', 'ok'); } catch (e) { await os.ui.alert('登録できませんでした', '端末の本人確認が取り消されたか、この開き方では使えません。'); }
            redraw();
          } })),
      group('保管庫', row({ icon: 'shieldCheck', title: '保管庫を開く', desc: '暗号化して守るメモとファイル。', onclick: () => os.open('vault') }))));
  },

  /* XEVORA アカウントと同期（sys/cloud.js） */
  account(os, main, redraw) {
    const { cloud, session } = os; if (!cloud) return missing(main, 'アカウントと同期');
    const me = session.user, st = cloud.status(), xvLocal = cloud.localXv();
    if (acctOff) acctOff();
    acctOff = os.on('cloud:status', () => { if (main.isConnected) redraw(); else if (acctOff) { acctOff(); acctOff = null; } });
    const STATE = { off: 'ログインしていません', ok: '同期しています', syncing: '同期しています…', error: 'うまく同期できません', offline: 'オフライン', badkey: '合言葉がちがいます', nokey: '同期しています' };
    if (session.isGuest) return fill(main, page(H('アカウントと同期'), note('ゲストでは、XEVORA アカウントにログインできません。')));
    fill(main, page(H('アカウントと同期', 'XEVARIX は XEVORA アカウント（XEVARION と同じアカウント・表示名＋4桁の PIN）で使います。ほかの端末でも同じ表示名と PIN でログインすると、同じ配置・設定で使えます。'),
      !me.xv ? group('XEVORA アカウント',
        row({ icon: 'cloud', title: 'ログインしていません', desc: xvLocal ? 'この端末では「' + xvLocal.name + '」が XEVORA アカウントにログインしています。' : 'アカウントをまだ持っていなければ、XEVORA で作れます。',
          right: btn('ログイン', async () => { await cloud.link(); redraw(); }, { ic: 'link', kind: 'pri' }) }),
        row({ icon: 'external', title: 'XEVORA を開く', desc: 'アカウントを作るときは XEVORA で。', onclick: () => window.open(cloud.xevoraURL('#signup'), '_blank', 'noopener') })) : [
        group('XEVORA アカウント',
          row({ icon: 'user', title: me.xv.name, desc: 'この端末の「' + me.name + '」は、この XEVORA アカウントでログインしています。', right: badge(STATE[st.state] || st.state, st.state === 'ok' || st.state === 'nokey' ? 'ok' : st.state === 'error' || st.state === 'badkey' ? 'warn' : '') }),
          row({ icon: 'refresh', title: 'いま同期する', desc: [st.at ? '最後に同期：' + fmtRel(st.at) : '', st.text].filter(Boolean).join('・') || 'ふだんは自動（変えたらすぐ送り、45秒ごとにほかの端末の変更を見る）。',
            onclick: async () => { await cloud.syncNow(); redraw(); } })),
        group('同期するもの',
          row({ icon: 'grid', title: '配置と設定', desc: 'ホームの並び・ドック・入れたアプリ・見た目・音・AI の設定など。そのままクラウドに置きます。', right: badge('同期する', 'ok') }),
          row({ icon: 'key', title: 'メモ・予定・ルーティン', desc: st.key ? '同期の合言葉で暗号化して同期しています。' : '「同期の合言葉」を決める（ほかの端末で決めていれば、それを入れる）と、暗号化して同期します。',
            right: st.key ? btn('この端末から合言葉を消す', async () => { await cloud.forgetPass(); redraw(); }, { sm: true }) : btn('合言葉を決める・入れる', async () => { await cloud.setPass(); redraw(); }, { ic: 'key' }) }),
          row({ icon: 'lock', title: '同期しないもの', desc: 'パスコード・生体認証・保管庫・メモ以外のファイル・電力・画面の形・窓の位置など、この端末だけのもの。' })),
        group('アカウント',
          row({ icon: 'external', title: 'XEVORA を開く', desc: 'アカウントの確認・XEVARIX と XEVARION のインストール。PIN を変えるときは XEVARION の設定で。', onclick: () => window.open(cloud.xevoraURL(), '_blank', 'noopener') }),
          row({ icon: 'unlock', title: 'ログアウト', desc: 'この端末のデータはそのまま。次に使うときは、もう一度 XEVORA アカウントでログインします。', onclick: async () => { await cloud.logout(); } }),
          row({ icon: 'trash', title: 'クラウドの XEVARIX のデータを消す', desc: '消したあとはログアウトします。XEVORA アカウントそのものは消えません。', onclick: async () => { await cloud.deleteCloud(); } }))],
      note('配置と設定は、XEVARION と同じく、アカウントがわかれば読める場所に置かれます。見られて困るものは、合言葉で暗号化されるメモ・予定・ルーティンか、保管庫に入れてください。')));
  },

  privacy(os, main, redraw) {
    const audit = os.sys.audit().slice(-120).reverse();
    fill(main, page(H('プライバシー', 'XEVARIX は「端末の中で完結」が基本です。'),
      group('外とやりとりするのは、次のときだけ',
        row({ icon: 'store', title: 'ストアの一覧を取りにいくとき', desc: 'アプリの名前と説明を読むだけ。あなたの情報は送りません。' }),
        row({ icon: 'refresh', title: '更新を確かめるとき', desc: '新しい版の番号と変更点を読むだけです。' }),
        row({ icon: 'qr', title: '引きつぎコードを使ったとき', desc: '設定とファイルを、合言葉で暗号化してから一時的に預けます。合言葉を知らない人には読めません。使うまで何も送りません。' }),
        row({ icon: 'download', title: '言語モデルを入れるとき', desc: 'モデルのファイルをダウンロードします。そのあとの会話は端末の中だけです。' }),
        row({ icon: 'grid', title: 'ストアのアプリ', desc: 'それぞれのアプリは、自分の通信をします（XEVARIX の AI や設定は渡しません）。' })),
      group('操作の記録（だれが・いつ・何を）', audit.length ? audit.map(a => h('div', { class: 'k-kv' }, h('span', null, fmtStamp(a.t) + '　' + who(os, a.by)), h('span', null, ((os.sys.list().find(c => c.name === a.name) || {}).title || a.name) + (a.ok ? '' : '（失敗）')))) : row({ title: 'まだ記録がありません', desc: 'AI・ルーティン・ターミナル・あなた が OS を操作すると、ここに残ります。' })),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, btn('記録を消す', async () => { os.sys.audit().length = 0; await os.kv.del('audit'); redraw(); }, { sm: true }), btn('AI が覚えていることを見る', () => os.open('settings', { page: 'ai' }), { sm: true }))));
  },

  users(os, main, redraw) {
    const { session } = os; const me = session.user; const list = session.users();
    fill(main, page(H('ユーザー', '設定・ファイル・AI の記憶は、ユーザーごとに分かれます。'),
      group('あなた',
        row({ icon: 'user', title: '名前', right: h('input', { class: 'field', value: me.name, maxlength: 24, 'aria-label': '名前', onchange: e => { const v = e.target.value.trim(); if (v) session.updateUser(me.id, { name: v }); } }) }),
        row({ icon: 'palette', title: 'アイコンの色', right: h('div', { class: 'k-swatches' }, AVATAR.map((c, i) => h('button', { class: 'k-swatch' + (me.color === i ? ' on' : ''), type: 'button', 'aria-label': '色 ' + (i + 1), style: 'background:linear-gradient(145deg,' + c[0] + ',' + c[1] + ')', onclick: () => { session.updateUser(me.id, { color: i }); redraw(); } }))) })),
      group('この端末のユーザー', list.map(u => row({ icon: 'user', title: u.name + (u.id === me.id ? '（あなた）' : ''), desc: (u.pass ? 'パスコードあり' : 'パスコードなし') + '・' + fmtStamp(u.created) + ' に作成',
        right: u.id !== me.id ? btn('消す', async () => { if (await os.ui.confirm(u.name + ' を消す', 'このユーザーの設定・ファイル・記録をすべて消します。元に戻せません。', { ok: '消す', danger: true })) { await session.removeUser(u.id); redraw(); } }, { sm: true, kind: 'danger' }) : h('span') }))),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
        btn('ほかの XEVORA アカウントを足す', () => os.act.addUser && os.act.addUser().then(redraw), { ic: 'plus' }),
        btn('ユーザーを切りかえる', () => os.act.switchUser(), { ic: 'users' })),
      h('p', { class: 'k-p' }, 'この端末のユーザーは、1人ずつ XEVORA アカウントでログインして使います（ゲストはありません）。ストアのアプリ（MagiLex など）の中の記録は、アプリ側が持つため、ユーザーごとには分かれません。')));
  },

  async ai(os, main, redraw) {
    const { reg, ai } = os; if (!ai) return missing(main, 'AI');
    const info = ai.llm.info(); const provs = await ai.llm.providers(); const v = os.act.voice ? os.act.voice() : null; const mem = reg.get('ai.memory') || [];
    const stateText = { off: '入っていません', loading: '読みこみ中…', ready: '使えます', sleep: '入っています', error: 'エラー' }[info.state] || '';
    fill(main, page(H('AI', 'XEVARIX の AI は2段構えです。①中核（すぐ返事・OS の操作と案内）は、いつでも端末の中で動きます。②言語モデル（自由な質問・要約）は、入れたときだけ使われます。'),
      group('中核',
        row({ icon: 'sparkle', title: 'AI を使う', right: tog(os, 'ai.enabled', 'AI を使う') }),
        row({ icon: 'wand', title: '使い方からの提案', desc: 'よく開く時間帯のアプリや、電池・重さの対策をホームに出します。', right: tog(os, 'ai.suggest', '提案') }),
        row({ icon: 'message', title: '言葉づかい', right: seg([['polite', 'ていねい'], ['casual', 'くだけた']], reg.get('ai.tone'), val => reg.set('ai.tone', val)) }),
        row({ icon: 'history', title: '会話を残す', desc: 'オフにすると、AI の画面を閉じたときに会話を消します。', right: tog(os, 'ai.keep', '会話を残す') })),
      group('言語モデル（追加）',
        row({ icon: 'cpu', title: 'いまの状態', desc: info.provider === 'none' ? '中核だけで動いています。' : (provs.find(p => p.id === info.provider) || {}).name + (info.model ? '・' + info.model : '') + (info.text ? '・' + info.text : ''), right: badge(stateText, info.state === 'ready' || info.state === 'sleep' ? 'ok' : info.state === 'error' ? 'danger' : 'mute') }),
        info.state === 'loading' ? h('div', { class: 'k-row col' }, meter(info.progress || 0), h('span', { class: 'tiny muted' }, info.text || '')) : null,
        info.error ? h('div', { class: 'k-row' }, h('span', { class: 'tiny', style: 'color:var(--danger)' }, info.error)) : null,
        provs.map(p => h('div', { class: 'k-row col' },
          h('div', { style: 'display:flex;justify-content:space-between;gap:10px;align-items:center' }, h('span', { class: 'k-rt' }, h('b', null, p.name), h('small', null, p.desc)), badge(p.ok ? 'この端末で使えます' : '使えません', p.ok ? 'ok' : 'mute')),
          !p.ok ? h('span', { class: 'tiny muted' }, p.why) : h('div', { style: 'display:grid;gap:6px' }, p.models.map(m => h('div', { style: 'display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap' },
            h('span', { class: 'tiny' }, m.name + '（' + m.size + '）' + (m.note ? '・' + m.note : '')),
            info.provider === p.id && info.model === m.id && info.state !== 'off' ? btn('使うのをやめる', () => { ai.llm.disable(); redraw(); }, { sm: true })
              : btn(p.id === 'chrome' ? '使う' : 'ダウンロードして使う', async () => { if (p.id !== 'chrome' && !await os.ui.confirm(m.name + ' を入れる', '約 ' + m.size + ' をダウンロードします。Wi-Fi での利用をおすすめします。入れたあとは通信なしで動きます。\n\nライセンス: ' + (m.license || '各モデルの利用条件にしたがいます'), { ok: 'ダウンロードする' })) return; ai.llm.enable(p.id, m.id).catch(() => {}); setTimeout(redraw, 200); }, { sm: true, kind: 'pri' })))))),
        row({ icon: 'trash', title: 'ダウンロードしたモデルを消す', desc: '端末の空きを戻します。', onclick: async () => { if (await os.ui.confirm('モデルを消す', 'ダウンロードした言語モデルのファイルを消します。', { ok: '消す', danger: true })) { const n = await ai.llm.purge(); os.ui.toast(n ? '消しました' : '消すものはありませんでした', 'ok'); redraw(); } } })),
      note('言語モデルは、公開されている学習済みモデルを端末の中で動かします。小さなモデルなので、まちがえることがあります。OS の操作は、まちがいの少ない中核が受けもちます。'),
      group('声',
        row({ icon: 'mic', title: '声で話しかける', desc: !v || !v.stt ? 'この端末・ブラウザでは使えません。' : v.onDevice ? '端末の中で聞き取ります。' : 'ブラウザの聞き取りを使います。端末によっては、声がブラウザの提供元へ送られます。', right: v && v.stt ? tog(os, 'ai.voice', '声で話しかける') : null }),
        row({ icon: 'volume', title: '返事を読み上げる', desc: !v || !v.tts ? 'この端末では使えません。' : '端末に入っている声で読み上げます。', right: v && v.tts ? tog(os, 'ai.tts', '読み上げ') : null })),
      group('AI が覚えていること', mem.length ? mem.map(m => row({ icon: 'tag', title: m.text, desc: fmtRel(m.t), right: btn('忘れる', () => { ai.forget(m.id); redraw(); }, { sm: true }) })) : row({ title: 'まだ何も覚えていません', desc: '「私の好きな色は青と覚えて」のように言うと、ここに入ります。' })),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, btn('会話の記録を消す', async () => { await ai.clear(); os.ui.toast('会話の記録を消しました', 'ok'); }, { sm: true }), btn('学んだ言い回しを消す', async () => { await ai.resetLearning(); os.ui.toast('はじめの状態に戻しました', 'ok'); }, { sm: true }))));
  },

  async storage(os, main, redraw) {
    const [st, u, trash] = await Promise.all([os.perf.storage(), os.fs.usage(), os.fs.listTrash()]);
    const K = { text: '文字', image: '画像', audio: '音', video: '動画', pdf: 'PDF', file: 'そのほか' };
    fill(main, page(H('保存容量', 'XEVARIX のデータは、この端末のこのブラウザの中に保存されます。'),
      h('div', { class: 'k-grid' },
        card('このサイトの合計', 'database', h('div', { class: 'k-big' }, fmtBytes(st.usage), h('small', null, '／ ' + fmtBytes(st.quota))), meter(st.quota ? st.usage / st.quota : 0, st.quota && st.usage / st.quota > .8 ? 'warn' : '')),
        card('あなたのファイル', 'folder', h('div', { class: 'k-big' }, fmtBytes(u.bytes), h('small', null, u.files + ' 個')), h('div', { class: 'tiny muted' }, 'ごみ箱 ' + fmtBytes(u.trash) + '（' + trash.length + ' 件）'))),
      !os.persistent ? note('このブラウザでは保存領域を開けませんでした（プライベート表示など）。閉じると消えます。', 'warn') : null,
      group('守る',
        row({ icon: 'shieldCheck', title: '勝手に消されないようにする', desc: st.persisted ? 'ブラウザが、空きが足りなくなっても勝手に消さない設定になっています。' : '空きが足りなくなると、ブラウザがこのサイトのデータを消すことがあります。許可をもらうと防げます。', right: st.persisted ? badge('オン', 'ok') : btn('お願いする', async () => { const ok = await os.perf.persist(); os.ui.toast(ok ? '守られるようになりました' : 'このブラウザでは許可されませんでした（ホーム画面に追加すると守られます）', ok ? 'ok' : 'warn'); redraw(); }, { sm: true }) })),
      group('種類ごと', Object.entries(u.by).filter(([, b]) => b > 0).map(([k, b]) => h('div', { class: 'k-row col' }, h('div', { style: 'display:flex;justify-content:space-between' }, h('b', { style: 'font-weight:600' }, K[k]), h('span', { class: 'muted tiny' }, fmtBytes(b))), meter(u.bytes ? b / u.bytes : 0))), !u.bytes ? row({ title: 'ファイルはまだありません' }) : null),
      group('片づけ',
        row({ icon: 'trash', title: 'ごみ箱を空にする', desc: trash.length + ' 件・' + fmtBytes(u.trash), onclick: trash.length ? async () => { if (await os.ui.confirm('ごみ箱を空にする', trash.length + ' 件を完全に消します。元に戻せません。', { ok: '空にする', danger: true })) { await os.fs.emptyTrash(); redraw(); } } : null }),
        row({ icon: 'folder', title: 'ファイルを開く', onclick: () => os.open('files') }))));
  },

  async backup(os, main, redraw) {
    const { backup } = os; if (!backup) return missing(main, '引きつぎと復元');
    const snaps = await backup.snapshots();
    if (backup.cloudOk === null && navigator.onLine) backup.checkCloud().then(() => { if (main.isConnected) redraw(); });
    const sendUI = async () => {
      const files = await os.ui.confirm('引きつぎコードを作る', '設定とファイルを、合言葉（コード）で暗号化して15分だけ預けます。もう一方の端末でコードを入れると受け取れます。\n\nファイルも送りますか？（大きいと時間がかかります）', { ok: 'ファイルも送る', cancel: '設定だけ' });
      const box = h('div', { style: 'display:grid;gap:10px;justify-items:center' }, h('p', null, '準備しています…'));
      const done = os.ui.modal({ title: '引きつぎコード', body: box, buttons: [{ label: '閉じる', kind: 'pri', value: true }] });
      try {
        const r = await backup.send({ files });
        const qr = backup.qrSvg(r.link);
        fill(box, qr ? h('div', { style: 'background:#fff;padding:10px;border-radius:12px;width:200px;height:200px' }, qr) : null,
          h('div', { class: 'mono', style: 'font-size:1.25rem;font-weight:700;letter-spacing:.08em;user-select:text;-webkit-user-select:text' }, r.code),
          h('p', { style: 'text-align:center' }, 'もう一方の端末で、カメラでこの QR を読むか、XEVARIX の 設定 → 引きつぎと復元 →「コードで受け取る」にこのコードを入れてください。\n' + fmtDur(r.expires - Date.now(), true) + ' のあいだ有効です（' + fmtBytes(r.size) + '）。'));
      } catch (e) { fill(box, note(e.message, 'warn')); }
      await done;
    };
    fill(main, page(H('引きつぎと復元'),
      group('別の端末へ移す',
        row({ icon: 'qr', title: '引きつぎコードを作る', desc: backup.cloudOk === false ? '預け先の準備がまだか、通信できません（Firebase のルールを貼ると使えます）。ファイルでの引きつぎは使えます。' : '暗号化して15分だけ預けます。QR とコードが出ます。', onclick: sendUI }),
        row({ icon: 'download', title: 'コードで受け取る', onclick: async () => { const c = await os.ui.prompt('引きつぎコード', 'もう一方の端末に出ているコードを入れてください。', { placeholder: 'XXXX-XXXX-XXXX-XXXX', max: 40 }); if (!c) return; try { const s = await backup.receive(c); await os.ui.alert('受け取りました', s.text + '\n再起動して反映します。'); os.act.restart(); } catch (e) { await os.ui.alert('受け取れませんでした', e.message); } } })),
      group('ファイルで移す・控える',
        row({ icon: 'upload', title: '1つのファイルに書き出す', desc: '設定・メモ・ファイル・記録をまとめた .xvx ファイルを保存します。', onclick: async () => {
          const pw = await os.ui.prompt('書き出す', '合言葉を決めると、ファイルを暗号化します（空のままなら暗号化しません）。', { type: 'password', placeholder: '合言葉（なくてもよい）', ok: '書き出す' }); if (pw == null) return;
          try { const r = await backup.exportFile({ files: true, password: pw }); os.ui.toast(r.name + '（' + fmtBytes(r.size) + '）', 'ok', '書き出しました'); } catch (e) { await os.ui.alert('書き出せませんでした', e.message); } } }),
        row({ icon: 'download', title: 'ファイルから読みこむ', desc: '書き出した .xvx ファイルの内容に、いまのユーザーを入れかえます。', onclick: async () => {
          const [f] = await pickFiles({ accept: '.xvx,application/json' }); if (!f) return;
          if (!await os.ui.confirm('読みこむ', 'いまの設定とファイルを、「' + f.name + '」の内容に入れかえます。いまの状態は、先に復元ポイントとして控えます。', { ok: '読みこむ' })) return;
          let pw = '';
          for (;;) { try { const s = await backup.importFile(f, { password: pw }); await os.ui.alert('読みこみました', s.text + '\n再起動して反映します。'); return os.act.restart(); } catch (e) { if (e.code === 'PASSWORD') { pw = await os.ui.prompt('合言葉', 'このファイルは暗号化されています。' + (pw ? '合言葉がちがいます。' : ''), { type: 'password' }); if (pw == null) return; } else { await os.ui.alert('読みこめませんでした', e.message); return; } } } } })),
      group('復元ポイント（前の状態に戻す）',
        snaps.length ? snaps.map(s => row({ icon: 'history', title: s.label, desc: fmtStamp(s.t) + '・' + fmtBytes(s.size), right: [btn('戻す', async () => { if (await os.ui.confirm('この時点に戻す', fmtStamp(s.t) + ' の設定・予定・ルーティンなどに戻します（ファイルの中身は変えません）。いまの状態も復元ポイントとして控えます。', { ok: '戻す' })) { await backup.restore(s.id); os.act.restart(); } }, { sm: true }), btn('消す', async () => { await backup.remove(s.id); redraw(); }, { sm: true })] }))
          : row({ title: 'まだありません', desc: '1日1回と、更新・読みこみ・初期化の前に、自動で作られます（7つまで）。' }),
        row({ icon: 'plus', title: 'いまの状態を控える', onclick: async () => { await backup.snapshot('手動で控えた状態'); redraw(); } })),
      h('p', { class: 'k-p' }, '復元ポイントは、設定・予定・アラーム・ルーティン・スペースなどの「状態」を控えます。ファイルの中身は入りません（ファイルは「書き出す」で控えてください）。')));
  },

  async update(os, main, redraw) {
    const { update } = os; if (!update) return missing(main, '更新');
    const i = update.info();
    const ST = { idle: '最新です', checking: '確かめています…', available: '新しい版があります', downloading: 'ダウンロード中…', ready: '再起動で更新できます', error: '確かめられませんでした', offline: 'オフラインです' };
    fill(main, page(H('更新'),
      h('div', { class: 'k-grid' },
        card('いまの版', 'info', h('div', { class: 'k-big' }, i.version), h('div', { class: 'tiny muted' }, i.build + '・' + os.OS.codename)),
        card('状態', 'refresh', h('div', { class: 'k-big', style: 'font-size:1.15rem' }, ST[i.state] || i.state), i.latest && i.latest.version !== i.version ? h('div', { class: 'tiny muted' }, '新しい版: ' + i.latest.version) : null,
          h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, btn('確かめる', async e => { e.currentTarget.disabled = true; await update.check(); redraw(); }, { sm: true, ic: 'refresh' }), i.state === 'ready' ? btn('再起動して更新', () => update.apply(), { sm: true, kind: 'pri' }) : null))),
      group('しくみ',
        row({ icon: 'cloudOff', title: 'オフラインで使う準備', desc: { active: i.offline ? '準備できています。通信が無くても起動できます。' : '準備中です…', dev: '開発用の開き方（localhost）では止めてあります。', unsupported: 'このブラウザでは使えません。', none: 'まだ準備できていません。' }[i.sw], right: badge(i.sw === 'active' && i.offline ? 'できています' : '—', i.sw === 'active' && i.offline ? 'ok' : 'mute') }),
        row({ icon: 'refresh', title: '自動で確かめる', desc: '起動したときに、新しい版がないか確かめます。', right: tog(os, 'update.auto', '自動で確かめる') }),
        i.previous ? row({ icon: 'history', title: '前の版（' + i.previous + '）に戻す', desc: '更新のあとで調子が悪いときに。', onclick: async () => { if (await os.ui.confirm('前の版に戻す', i.previous + ' に戻して再起動します。', { ok: '戻す' })) update.rollback(); } }) : null),
      group('変更点', i.notes.map(n => h('div', { class: 'k-row col' }, h('div', { style: 'display:flex;justify-content:space-between' }, h('b', null, n.version), h('span', { class: 'muted tiny' }, n.date)), h('ul', { style: 'margin:0;padding-left:1.2em;font-size:.8125rem;line-height:1.7;color:var(--text-2)' }, n.items.map(x => h('li', null, x))))))));
  },

  access(os, main, redraw) {
    const { reg } = os;
    const keys = [['Ctrl + K', '検索'], ['Ctrl + Alt + A', 'AI を開く'], ['Ctrl + Alt + L', 'ロック'], ['Ctrl + Alt + D', 'ホームへ'], ['Ctrl + Alt + O', '開いている窓の一覧'], ['Ctrl + Alt + Tab ／ Alt + `', '窓を切りかえる'], ['Ctrl + Alt + ← →', '窓を左・右半分に'], ['Ctrl + Alt + ↑ ↓', '最大化・元の大きさ／しまう'], ['Ctrl + Alt + W', '窓を閉じる'], ['Ctrl + Alt + M', 'システムモニター'], ['Ctrl + Alt + T', 'ターミナル'], ['Ctrl + Alt + F', '全画面']];
    fill(main, page(H('見やすさ・操作'),
      group('見やすさ',
        row({ icon: 'text', title: '文字の大きさ', desc: Math.round(reg.get('ui.textScale') * 100) + '%', right: slider({ min: .85, max: 1.3, step: .05, value: reg.get('ui.textScale'), label: '文字の大きさ', onchange: v => { reg.set('ui.textScale', v); redraw(); } }) }),
        row({ icon: 'contrast', title: 'はっきり表示', desc: '線と文字を濃くし、すける面を減らします。', right: tog(os, 'ui.contrast', 'はっきり表示') }),
        row({ icon: 'activity', title: '動きを減らす', right: sw(!reg.get('ui.motion'), v => reg.set('ui.motion', !v), '動きを減らす') }),
        row({ icon: 'wand', title: '効果を最小にする', desc: 'ぼかしと影を切ります。', right: sw(reg.get('ui.fx') === 'minimal', v => reg.set('ui.fx', v ? 'minimal' : 'auto'), '効果を最小に') }),
        row({ icon: 'brightness', title: '画面を暗めにする', right: slider({ min: 0, max: .7, step: .05, value: reg.get('ui.dim'), label: '暗さ', onchange: v => reg.set('ui.dim', v) }) })),
      group('キーボードの近道', keys.map(([k, v]) => kv(v, k)))));
  },

  dev(os, main, redraw) {
    const { reg } = os;
    fill(main, page(H('開発者'),
      group('道具',
        row({ icon: 'code', title: '開発者モード', desc: 'ターミナルで、内部の値を見るコマンドが使えるようになります。', right: tog(os, 'dev.mode', '開発者モード') }),
        row({ icon: 'list', title: '動作ログを見る', onclick: () => os.open('monitor', { tab: 'log' }) }),
        row({ icon: 'book', title: 'アプリを作る人へ（開発キット）', onclick: () => os.open('help', { page: 'sdk' }) }),
        row({ icon: 'refresh', title: '前に開いていたアプリを、起動のとき開き直す', right: tog(os, 'session.restore', '開き直す') })),
      group('困ったとき',
        row({ icon: 'shield', title: 'セーフモードで再起動', desc: 'ルーティンなど、自動で動くものを止めて起動します。', onclick: () => os.act.safeBoot() }),
        row({ icon: 'undo', title: '設定をはじめの状態に戻す', desc: '見た目・電力などの設定だけを戻します。ファイルは消えません。', danger: true, onclick: async () => { if (!await os.ui.confirm('設定を戻す', 'このユーザーの設定を、はじめの状態に戻します。先に復元ポイントを作ります。', { ok: '戻す', danger: true })) return; if (os.backup) await os.backup.snapshot('設定を戻す前'); const keep = ['apps.web', 'apps.custom']; const raw = reg.raw(); const next = {}; for (const k of keep) if (k in raw) next[k] = raw[k]; reg.replace(next); await reg.flush(); os.act.restart(); } }),
        row({ icon: 'trash', title: 'この端末の XEVARIX のデータをすべて消す', desc: 'すべてのユーザーの設定・ファイル・記録を消して、はじめての状態に戻します。ストアのアプリの中の記録は消えません。', danger: true, onclick: async () => {
          if (!await os.ui.confirm('すべて消す', 'XEVARIX のデータをすべて消します。元に戻せません。', { ok: 'つぎへ', danger: true })) return;
          const t = await os.ui.prompt('最後の確認', '消すには「消す」と入れてください。', { placeholder: '消す' }); if (t !== '消す') return;
          await os.act.wipeAll();
        } }))));
  },

  about(os, main) {
    const d = os.perf.device(), b = os.sysreg.get('device.bench');
    fill(main, page(
      h('div', { style: 'display:grid;justify-items:center;gap:8px;padding:10px 0 4px;text-align:center' },
        h('img', { src: '../assets/brand/icon-192.png', alt: '', style: 'width:92px;height:92px;border-radius:24px;box-shadow:var(--shadow-2)' }),
        h('div', { style: 'font-size:1.5rem;font-weight:700;letter-spacing:.2em' }, 'XEVARIX'),
        h('div', { class: 'muted' }, 'バージョン ' + os.OS.version + '（' + os.OS.build + '・' + os.OS.codename + '）'),
        h('div', { class: 'tiny muted', style: 'letter-spacing:.12em' }, os.OS.by)),
      group('この端末', kv('OS とブラウザ', d.os + '・' + d.browser), kv('コア数', d.cores), kv('メモリ（見当）', d.memGB ? '約 ' + d.memGB + ' GB' : null), kv('GPU', d.gpu), kv('測定', b ? b.score + ' 点（' + os.perf.tierName(b.tier) + '）' : '未測定'),
        kv('前回の起動', (os.sysreg.get('boot.lastMs') || 0) + ' ミリ秒'), kv('起動してから', fmtDur(os.uptime(), true)), kv('起動した回数', os.sysreg.get('boot.count') + ' 回')),
      group('XEVARIX とは',
        row({ icon: 'orbit', title: 'アプリの形をした OS', desc: 'NGX と ISHIDA Production が共同で開発・運営しています。起動・ロック・窓・ファイル・電力とパフォーマンスの管理・端末の中で動く AI を、1から作っています。' }),
        row({ icon: 'book', title: '使い方を見る', onclick: () => os.open('help') })),
      h('p', { class: 'k-p', style: 'text-align:center' }, '© 2026 NGX × ISHIDA Production')));
  },
};

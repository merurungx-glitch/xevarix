/* XEVARIX — はじめての設定
   名前 → 見た目 → 端末の測定 → ロック → AI とアプリ の順に、6枚で終わる。あとから全部「設定」で変えられる。 */

import { h, fill } from '../util.js';
import { icon } from '../icons.js';
import { USER_COLORS } from '../session.js';
import { ACCENTS } from '../theme.js';
import { perf } from '../perf.js';
import { security } from '../security.js';

export function runOOBE({ first = true } = {}) {
  return new Promise(resolve => {
    const st = { name: '', color: 0, theme: 'dark', accent: 'cyan', pass: '', bench: null, preinstall: true };
    let step = 0;
    const root = h('div', { class: 'xo' }); document.body.append(root);
    const R = document.documentElement;
    const preview = () => { R.dataset.theme = st.theme === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : st.theme; R.dataset.accent = st.accent; };
    const steps = () => h('div', { class: 'xo-steps' }, Array.from({ length: 6 }, (_, i) => h('i', { class: i <= step ? 'on' : '' })));
    const foot = (next, label = 'つぎへ', back = true) => h('div', { class: 'xo-foot' },
      back && step > 0 ? h('button', { class: 'btn ghost', type: 'button', onclick: () => go(st.xv && step === 3 ? 0 : step - 1) }, 'もどる') : h('span'),
      h('button', { class: 'btn pri', type: 'button', onclick: next }, label));
    const card = (...kids) => fill(root, h('div', { class: 'xo-card glass' }, steps(), ...kids));

    const pages = [
      () => card(
        h('img', { class: 'xo-logo', src: 'assets/brand/icon-192.png', alt: '' }),
        h('h2', { style: 'text-align:center' }, 'XEVARIX へようこそ'),
        /* ★★ 2026-11-17 ご指定「XEVARIX にβ版のマークを」 */
        h('div', { style: 'justify-self:center;align-self:center;margin:-4px auto 2px;padding:3px 12px;border-radius:999px;font-size:.75rem;font-weight:700;letter-spacing:.12em;color:#fff;background:linear-gradient(110deg,#0a84ff,#8a5cff 60%,#ff6ab0);width:max-content' }, 'β版（試験公開中）'),
        h('p', { style: 'text-align:center' }, first ? 'NGX と ISHIDA Production がつくる、アプリの形をした OS です。\nはじめに、いくつかだけ決めましょう。1分ほどで終わります。' : 'この端末をいっしょに使う人を足します。設定やファイルは人ごとに分かれます。'),
        /* XEVARIX は XEVORA アカウントでのみ使う。ログインすると、名前と見た目はクラウドから戻るので、端末の測定へ進む */
        h('p', { style: 'text-align:center' }, 'XEVARIX は XEVORA アカウント（XEVARION と同じアカウント）で使います。'),
        foot(async () => {
          const { askLogin } = await import('../cloud.js');
          const r = await askLogin({ text: 'XEVORA アカウントの表示名と4桁の PIN を入れてください。XEVARIX の配置と設定は、そのアカウントのクラウドから戻ります。' });
          if (!r) return;
          st.name = r.name; st.xv = { uid: r.uid, name: r.name, at: Date.now(), fresh: 1 }; st.preinstall = false;
          go(3);
        }, 'XEVORA アカウントでログイン', false),
        h('button', { class: 'btn ghost', type: 'button', style: 'justify-self:center;margin-top:-4px', onclick: async () => {
          const { xevoraURL } = await import('../cloud.js');
          window.open(xevoraURL('#signup'), '_blank', 'noopener');
        } }, icon('external'), 'アカウントを作る（XEVORA）')),

      () => {
        const inp = h('input', { class: 'field', type: 'text', maxlength: 24, placeholder: '例：そら', value: st.name, autocomplete: 'off', 'aria-label': '名前', oninput: () => { st.name = inp.value; }, onkeydown: e => { if (e.key === 'Enter') next(); } });
        const sw = h('div', { class: 'xo-sw' });
        const paint = () => fill(sw, USER_COLORS.map((c, i) => h('button', { type: 'button', class: i === st.color ? 'on' : '', 'aria-label': '色 ' + (i + 1), style: 'background:linear-gradient(145deg,' + c[0] + ',' + c[1] + ')', onclick: () => { st.color = i; paint(); } })));
        const next = () => { st.name = inp.value.trim(); if (!st.name) { inp.focus(); inp.placeholder = '名前を入れてください'; return; } go(2); };
        paint();
        card(h('h2', null, 'あなたの呼び名'), h('p', null, 'XEVARIX と AI があなたを呼ぶ名前です。本名でなくてかまいません。'), inp, h('p', { class: 'tiny' }, 'アイコンの色'), sw, foot(next));
        setTimeout(() => inp.focus(), 80);
      },

      () => {
        const row = h('div', { class: 'xo-row' }), sw = h('div', { class: 'xo-sw' });
        const paint = () => {
          fill(row, [['dark', 'moon', 'ダーク', 'ロゴと同じ深い青'], ['light', 'sun', 'ライト', '明るく読みやすい'], ['auto', 'contrast', '自動', '端末の設定に合わせる']].map(([id, ic, name, sub]) =>
            h('button', { class: 'xo-opt' + (st.theme === id ? ' on' : ''), type: 'button', onclick: () => { st.theme = id; preview(); paint(); } }, icon(ic), name, h('small', null, sub))));
          fill(sw, ACCENTS.map(a => h('button', { type: 'button', class: a.id === st.accent ? 'on' : '', 'aria-label': a.name, title: a.name, style: 'background:' + a.color, onclick: () => { st.accent = a.id; preview(); paint(); } })));
        };
        paint();
        card(h('h2', null, '見た目'), h('p', null, '色合いと、強調に使う色をえらびます。'), row, h('p', { class: 'tiny' }, '強調の色'), sw, foot(() => go(3)));
      },

      () => {
        const bar = h('i'), label = h('p', { class: 'tiny' }, '測っています…'), out = h('div', { class: 'xo-list' });
        const next = h('button', { class: 'btn pri', type: 'button', disabled: !st.bench, onclick: () => go(4) }, 'つぎへ');
        const show = b => {
          bar.style.width = '100%';
          label.textContent = 'この端末は「' + perf.tierName(b.tier) + '」（' + b.score + ' 点' + (b.hz ? '・画面は毎秒 ' + b.hz + ' 回' : '') + '）' + (b.rough ? '　※画面が裏にあったため仮の値です。あとで自動で測り直します。' : '');
          fill(out,
            h('div', { class: 'xo-li' }, icon('wand'), b.tier === 'C' ? '動きとぼかしを控えめにして、軽く動くようにします。' : b.tier === 'B' ? 'ぼかしを少し控えめにして、なめらかさを優先します。' : 'ぼかしや動きをすべて使います。'),
            h('div', { class: 'xo-li' }, icon('bolt'), navigator.getBattery ? '電池残量に合わせて、電力モードを自動で切りかえます。' : 'この端末は電池残量を読めないため、電力モードは手動と時間帯で切りかえます。'));
          next.disabled = false;
        };
        card(h('h2', null, '端末に合わせる'), h('p', null, 'この端末の速さを測って、効果の量を自動で決めます。'), h('div', { class: 'xo-bench' }, bar), label, out,
          h('div', { class: 'xo-foot' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => go(2) }, 'もどる'), next));
        if (st.bench) show(st.bench);
        else perf.benchmark((p, l) => { bar.style.width = Math.round(p * 100) + '%'; label.textContent = l + ' を測っています…'; }).then(b => { st.bench = b; if (step === 3) show(b); }).catch(() => { st.bench = { score: 800, tier: 'A', hz: 60, cpu: 800, dom: 800, gfx: 800, at: Date.now() }; if (step === 3) show(st.bench); });
      },

      () => {
        const a = h('input', { class: 'field', type: 'password', inputmode: 'numeric', maxlength: 12, placeholder: '4けた以上（数字がおすすめ）', autocomplete: 'new-password', 'aria-label': 'パスコード', value: st.pass });
        const b = h('input', { class: 'field', type: 'password', inputmode: 'numeric', maxlength: 12, placeholder: 'もう一度', autocomplete: 'new-password', 'aria-label': 'パスコード（確認）', value: st.pass });
        const msg = h('p', { class: 'tiny', style: 'color:var(--danger);min-height:1.2em' });
        const next = () => {
          if (!a.value && !b.value) { st.pass = ''; return go(5); }
          if (a.value.length < 4) { msg.textContent = '4文字以上にしてください。'; return; }
          if (a.value !== b.value) { msg.textContent = '2つが同じではありません。'; return; }
          st.pass = a.value; go(5);
        };
        card(h('h2', null, 'ロック'), h('p', null, security.ok ? 'パスコードを決めると、ロック画面と「保管庫」（暗号化して守る場所）が使えます。あとで決めてもかまいません。' : 'この開き方（http）ではパスコードを使えません。https で開くと使えます。'),
          security.ok ? [a, b, msg] : null,
          h('div', { class: 'xo-foot' }, h('button', { class: 'btn ghost', type: 'button', onclick: () => go(3) }, 'もどる'),
            h('div', { style: 'display:flex;gap:8px' }, security.ok && h('button', { class: 'btn', type: 'button', onclick: () => { st.pass = ''; go(5); } }, 'あとで'), h('button', { class: 'btn pri', type: 'button', onclick: next }, 'つぎへ'))));
      },

      () => {
        const chk = h('input', { type: 'checkbox', checked: st.preinstall, onchange: () => { st.preinstall = chk.checked; } });
        card(h('h2', null, 'AI とアプリ'),
          h('div', { class: 'xo-list' },
            h('div', { class: 'xo-li' }, icon('sparkle'), '下のまん中の XEVARIX のロゴが AI です。「省電力にして」「メモを開いて」のように言葉で操作できます。'),
            h('div', { class: 'xo-li' }, icon('shieldCheck'), 'AI はこの端末の中だけで動きます。話した内容や使い方が外へ送られることはありません。'),
            h('div', { class: 'xo-li' }, icon('download'), '自由な質問や要約に答える言語モデルは、あとで「設定 → AI」から足せます（大きなダウンロードが必要です）。')),
          st.xv ? h('div', { class: 'xo-li' }, icon('cloud'), 'XEVORA アカウント「' + st.xv.name + '」でログインしました。ホームの配置と設定は、クラウドから戻ります。') :
          h('label', { style: 'display:flex;gap:10px;align-items:flex-start;font-size:.875rem;line-height:1.55' }, chk, h('span', null, 'NGX と ISHIDA Production のおすすめアプリをホームに入れる（あとでストアから足したり外したりできます）')),
          foot(() => { root.classList.add('leave'); root.remove(); resolve(st); }, first ? 'XEVARIX をはじめる' : 'このユーザーを作る'));
      },
    ];
    function go(i) { step = i; pages[i](); }
    preview(); go(0);
  });
}

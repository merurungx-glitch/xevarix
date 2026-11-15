/* XEVARIX — 全体検索（Ctrl+K）
   アプリ・計算・すぐ使える操作・設定のページ・ファイル・ストア をまとめてさがす。見つからなければ AI へ。 */

import { h, fill, normJa, debounce } from '../util.js';
import { icon, appTile } from '../icons.js';
import { openLayer, closeLayer, toast } from './ui.js';
import { evaluate, fmtNum, looksLikeMath } from '../mathx.js';
import { SETTINGS_PAGES, QUICK } from '../pages.js';

let X = null;
const nz = s => normJa(s).replace(/\s+/g, '');
const hit = (q, ...fields) => fields.some(f => f && nz(f).includes(q));

function open(preset) {
  if (closeLayer('search')) return;
  const input = h('input', { type: 'search', placeholder: 'アプリ・ファイル・設定・計算…', 'aria-label': '検索', autocomplete: 'off', spellcheck: 'false', value: preset || '' });
  const list = h('div', { class: 'xs-list', role: 'listbox' });
  const card = h('div', { class: 'xs-card glass pop', role: 'dialog', 'aria-label': '検索' }, h('div', { class: 'xs-in' }, icon('search'), input, h('kbd', { class: 'tiny muted' }, 'Esc')), list);
  const wrap = h('div', { class: 'xs' }, card);
  const hd = openLayer(wrap, { key: 'search' });
  wrap.addEventListener('pointerdown', e => { if (e.target === wrap) hd.close(); });
  let rows = [], sel = 0, token = 0;
  const run = r => { hd.close(); try { r.run(); } catch (e) { toast(e.message, 'warn'); } };
  const call = c => X.sys.tryCall(c.name, c.args, { by: 'search' }).then(r => r && r.text && toast(r.text, r.error ? 'warn' : 'ok'));

  function paint(sections) {
    rows = []; const out = [];
    for (const [title, items] of sections) {
      if (!items.length) continue;
      out.push(h('div', { class: 'xs-sec' }, title));
      for (const it of items) {
        const i = rows.length; rows.push(it);
        out.push(h('button', { class: 'xs-row' + (i === sel ? ' sel' : ''), type: 'button', role: 'option', 'aria-selected': i === sel ? 'true' : 'false', onclick: () => run(it), onpointermove: () => { if (sel !== i) { sel = i; mark(); } } },
          it.app ? appTile(it.app) : h('span', { class: 'xs-ic' }, icon(it.icon || 'search')), h('span', null, h('b', null, it.title), it.sub ? h('small', null, it.sub) : null), it.hint ? h('kbd', null, it.hint) : null));
      }
    }
    fill(list, out.length ? out : h('div', { class: 'xs-hint' }, 'アプリの名前、「省電力」「ロック」などの操作、設定の言葉、ファイルの名前、計算の式を入れてください。'));
    if (sel >= rows.length) sel = Math.max(0, rows.length - 1);
    mark();
  }
  function mark() { [...list.querySelectorAll('.xs-row')].forEach((el, i) => { el.classList.toggle('sel', i === sel); el.setAttribute('aria-selected', i === sel ? 'true' : 'false'); if (i === sel) el.scrollIntoView({ block: 'nearest' }); }); }

  async function search() {
    const raw = input.value.trim(), q = nz(raw), my = ++token; sel = 0;
    if (!q) {
      const recent = X.proc.list().slice(-4).map(p => ({ app: p.app, title: p.app.name, sub: '開いています', run: () => X.wm.focus(p.win) }));
      return paint([['開いているアプリ', recent], ['よく使う操作', QUICK.slice(0, 5).map(c => ({ icon: c.icon, title: c.label, run: () => call(c.call) }))]]);
    }
    const appsHit = X.apps.installed().filter(a => hit(q, a.name, a.full, a.short, a.sub, ...(a.keys || []))).slice(0, 6).map(a => ({ app: a, title: a.name, sub: a.sub || a.desc || '', run: () => X.proc.spawn(a.id) }));
    const math = [];
    if (looksLikeMath(raw)) { try { const v = fmtNum(evaluate(raw)); math.push({ icon: 'calc', title: raw + ' = ' + v, sub: 'Enter で答えをコピー', run: () => { navigator.clipboard && navigator.clipboard.writeText(v.replace(/,/g, '')).catch(() => {}); toast(v, 'ok', 'コピーしました'); } }); } catch { /* 式ではなかった */ } }
    const quick = QUICK.filter(c => hit(q, c.label, ...c.keys)).slice(0, 4).map(c => ({ icon: c.icon, title: c.label, sub: '操作', run: () => call(c.call) }));
    const pages = SETTINGS_PAGES.filter(p => p.id && hit(q, p.label, ...p.keys)).slice(0, 4).map(p => ({ icon: p.icon, title: '設定 › ' + p.label, sub: p.keys.filter(k => nz(k).includes(q)).join('・'), run: () => X.proc.spawn('settings', { page: p.id }) }));
    const cat = X.apps.catalogNow();
    const store = cat ? cat.apps.filter(a => !X.apps.isInstalled(a.id) && hit(q, a.name, a.full, a.sub)).slice(0, 3).map(a => ({ app: a, title: a.name, sub: 'ストア・' + (a.sub || ''), run: () => X.proc.spawn('store', { app: a.id }) })) : [];
    const ai = [{ icon: 'sparkle', title: '「' + raw + '」を AI に聞く', sub: '端末の中で答えます', run: () => X.act.ai(raw) }];
    paint([['アプリ', appsHit], ['計算', math], ['操作', quick], ['設定', pages], ['ストア', store], ['AI', ai]]);
    const files = (await X.fs.search(raw, 6)).map(n => ({ icon: X.fs.kindOf(n) === 'dir' ? 'folder' : X.fs.kindOf(n) === 'image' ? 'image' : 'fileText', title: n.name, sub: 'ファイル', run: () => X.act.openFile(n) }));
    if (my !== token || !files.length) return;
    paint([['アプリ', appsHit], ['計算', math], ['操作', quick], ['設定', pages], ['ファイル', files], ['ストア', store], ['AI', ai]]);
  }
  const lazy = debounce(search, 70);
  input.addEventListener('input', lazy);
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(rows.length - 1, sel + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); mark(); }
    else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); if (rows[sel]) run(rows[sel]); }
  });
  search(); setTimeout(() => { input.focus(); input.select(); }, 60);
}

export function init(ctx) { X = ctx; X.search = { open }; }

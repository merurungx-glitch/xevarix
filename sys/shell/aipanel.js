/* XEVARIX — AI の画面（コアの球を押すと開く会話のパネル） */

import { bus } from '../core.js';
import { h, fill } from '../util.js';
import { icon } from '../icons.js';
import { makeOrb } from './orb.js';
import { registerOrb, setOrbBusy } from './desktop.js';
import { openLayer, closeLayer, layerOpen, toast } from './ui.js';

let X = null, handle = null, logEl = null, input = null, sugEl = null, sub = null, micBtn = null, stopListen = null, sending = false;

/* かんたんな書式（**強調**・`コード`・箇条書き）。HTML はそのまま入れない */
function rich(el, text) {
  const inline = (node, s) => { const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g; let last = 0, m; while ((m = re.exec(s))) { if (m.index > last) node.append(s.slice(last, m.index)); node.append(m[2] ? h('b', null, m[2]) : h('code', null, m[3])); last = re.lastIndex; } if (last < s.length) node.append(s.slice(last)); return node; };
  let ul = null;
  for (const ln of String(text).split('\n')) {
    const m = /^\s*(?:[-・*]|\d+[.)])\s+(.*)$/.exec(ln);
    if (m) { if (!ul) { ul = h('ul'); el.append(ul); } ul.append(inline(h('li'), m[1])); }
    else { ul = null; if (ln.trim() === '') { if (el.lastChild && el.lastChild.nodeName !== 'BR') el.append(h('br')); } else { if (el.childNodes.length && el.lastChild.nodeName !== 'UL' && el.lastChild.nodeName !== 'BR') el.append(h('br')); inline(el, ln); } }
  }
  return el;
}
function scroll() { if (logEl) logEl.scrollTop = logEl.scrollHeight; }
function addUser(text) { logEl.append(h('div', { class: 'xai-m u' }, text)); scroll(); }
function runAct(a) {
  if (a.say) return send(a.say);
  if (a.call) return X.sys.tryCall(a.call.name, a.call.args, { by: 'ai' }).then(r => { if (r && r.text) addAI({ text: r.text, err: !!r.error, engine: 'core' }); paintSub(); });
}
function addAI(r) {
  const el = h('div', { class: 'xai-m a' + (r.err ? ' err' : '') });
  rich(el, r.text || '');
  if (r.card) el.append(h('div', { class: 'xai-card' }, r.card.title ? h('b', null, r.card.title) : null, r.card.rows.map(([k, v]) => h('div', { class: 'xai-kv' }, h('span', null, k), h('span', null, v))), r.card.meter != null ? h('div', { class: 'xai-meter' }, h('i', { style: { width: Math.round(Math.max(0, Math.min(1, r.card.meter)) * 100) + '%' } })) : null));
  const acts = (r.actions || []).filter(Boolean);
  if (acts.length) el.append(h('div', { class: 'xai-acts' }, acts.map(a => h('button', { class: 'btn sm', type: 'button', onclick: e => { e.currentTarget.parentElement.querySelectorAll('button').forEach(b => { b.disabled = true; }); runAct(a); } }, a.label))));
  if (r.engine === 'llm') el.append(h('span', { class: 'eng' }, '言語モデルが作った文です。まちがえることがあります。'));
  logEl.append(el);
  if (r.followups && r.followups.length) logEl.append(h('div', { class: 'xai-acts', style: 'align-self:flex-start;margin-top:-4px' }, r.followups.slice(0, 4).map(f => h('button', { class: 'chip', type: 'button', onclick: () => send(f.replace(/[？?]$/, '') + (/[？?]$/.test(f) ? '？' : '')) }, f))));
  scroll(); return el;
}
function paintSug() { if (sugEl) fill(sugEl, X.ai.suggestions().map(s => h('button', { class: 'chip', type: 'button', onclick: () => send(s) }, s))); }
function paintSub() {
  if (!sub) return; const i = X.ai.llm.info();
  sub.textContent = 'この端末の中だけで動いています・' + (i.state === 'ready' ? '中核＋言語モデル' : i.state === 'sleep' ? '中核（言語モデルは使うときに読みこみ）' : i.state === 'loading' ? '言語モデルを読みこみ中 ' + Math.round((i.progress || 0) * 100) + '%' : '中核');
}

async function send(text) {
  text = String(text || '').trim(); if (!text || sending) return;
  sending = true; input.value = ''; input.style.height = '';
  addUser(text);
  const wait = h('div', { class: 'xai-m a' }, h('span', { class: 'xai-dots' }, h('i'), h('i'), h('i'))); logEl.append(wait); scroll();
  let streamed = false;
  const r = await X.ai.ask(text, { onToken: t => { streamed = true; wait.textContent = t; scroll(); } });
  wait.remove(); addAI(r); paintSug(); paintSub(); sending = false;
  if (X.reg.get('ai.tts') && X.voice && r.text) X.voice.speak(r.text);
  void streamed;
}

function mic() {
  if (!X.voice) return;
  if (stopListen) { stopListen(); return; }
  if (!X.reg.get('ai.voice')) { toast('設定 → AI で「声で話しかける」をオンにすると使えます。', 'info', '声'); return; }
  X.voice.stop();
  micBtn.classList.add('on'); setOrbBusy(false, true);
  const end = () => { stopListen = null; micBtn.classList.remove('on'); setOrbBusy(false, false); };
  stopListen = X.voice.listen({
    onText: (t, fin) => { input.value = t; if (fin) { end(); send(t); } },
    onEnd: end,
    onError: e => { end(); if (e !== 'no-speech' && e !== 'aborted') toast(e === 'not-allowed' ? 'マイクが許可されていません。ブラウザの設定を確かめてください。' : '聞き取れませんでした。', 'warn', '声'); },
  });
  if (!stopListen) end();
}

function open(text) {
  if (layerOpen('ai')) { if (text) send(text); else closeLayer('ai'); return; }
  logEl = h('div', { class: 'xai-log', role: 'log', 'aria-live': 'polite' });
  sugEl = h('div', { class: 'xai-sug' });
  sub = h('small');
  input = h('textarea', { rows: 1, placeholder: '話しかける（例：省電力にして）', 'aria-label': 'AI に話しかける', enterkeyhint: 'send',
    oninput: () => { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; },
    onkeydown: e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } } });
  const v = X.voice ? X.voice.info() : { stt: false };
  micBtn = v.stt ? h('button', { class: 'xai-mic', type: 'button', 'aria-label': '声で話す', onclick: mic }, icon('mic')) : null;
  const panel = h('div', { class: 'xai glass', role: 'dialog', 'aria-label': 'XEVARIX の AI' },
    h('div', { class: 'xai-h' }, registerOrb(makeOrb()), h('div', null, h('b', null, 'XEVARIX AI'), sub),
      h('button', { class: 'ibtn', type: 'button', title: '新しい会話', 'aria-label': '新しい会話', onclick: async () => { await X.ai.clear(); fill(logEl); greet(); } }, icon('plus')),
      h('button', { class: 'ibtn', type: 'button', title: 'AI の設定', 'aria-label': 'AI の設定', onclick: () => { closeLayer('ai'); X.proc.spawn('settings', { page: 'ai' }); } }, icon('settings')),
      h('button', { class: 'ibtn', type: 'button', title: '閉じる', 'aria-label': '閉じる', onclick: () => closeLayer('ai') }, icon('close'))),
    logEl, sugEl,
    h('div', { class: 'xai-in' }, micBtn, input, h('button', { class: 'xai-send', type: 'button', 'aria-label': '送る', onclick: () => send(input.value) }, icon('send'))));
  handle = openLayer(panel, { key: 'ai', scrim: 'clear', onClose: () => { if (stopListen) stopListen(); X.voice && X.voice.stop(); if (!X.reg.get('ai.keep')) X.ai.clear(); logEl = input = sugEl = sub = null; } });
  const old = X.ai.history().slice(-24);
  if (old.length) for (const m of old) { if (m.role === 'user') addUser(m.text); else addAI({ text: m.text, engine: m.engine === 'llm' ? 'llm' : 'core' }); }
  else greet();
  paintSug(); paintSub();
  setTimeout(() => { if (input && !matchMedia('(pointer: coarse)').matches) input.focus(); if (text) send(text); }, 80);
}
function greet() {
  const hr = new Date().getHours();
  addAI({ text: (hr < 5 ? 'こんばんは' : hr < 11 ? 'おはようございます' : hr < 18 ? 'こんにちは' : 'こんばんは') + '、' + X.session.user.name + ' さん。XEVARIX の AI です。\n言葉で操作したり、使い方や電池・動作のことを聞いたりできます。', followups: ['できることは？', '電池のもちは？', '3分はかって'] });
}

export function init(ctx) {
  X = ctx; if (!X.ai) throw new Error('AI の中核がありません');
  X.aipanel = { toggle: open, open };
  bus.on('ai:busy', b => setOrbBusy(b, false));
  bus.on('ai:llm', paintSub);
  bus.on('shell:action', e => { if (e.action === 'ai') open(e.args && e.args.text); });
}

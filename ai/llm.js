/* XEVARIX AI — 言語モデル（追加の頭脳）
   2通りの動かし方を持つ。どちらも「端末の中で」文章を作る。
     chrome … ブラウザ内蔵の AI（Chrome の Prompt API・Gemini Nano）。モデルは Chrome が管理する。
     webllm … 公開されている小さな言語モデルを WebGPU で動かす（WebLLM）。モデルは、はじめにダウンロードする。
   ふだんは下ろしておき（sleep）、必要になったときに読みこむ。5分使わなければ、また下ろしてメモリを空ける。
   ★ 外から読むのは、WebLLM の本体（esm.run）とモデルのファイル（Hugging Face）だけ。会話は送らない。 */

import { bus, log } from '../sys/core.js';

const WEBLLM_URL = 'https://esm.run/@mlc-ai/web-llm';
const LANG = { expectedInputs: [{ type: 'text', languages: ['ja'] }], expectedOutputs: [{ type: 'text', languages: ['ja'] }] };
const MODELS = [
  { id: 'gemma3-1b-it-q4f16_1-MLC', name: 'Gemma 3 1B', size: '約0.7GB', note: 'いちばん軽い', license: 'Gemma の利用規約' },
  { id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC', alt: 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC', name: 'Qwen2.5 1.5B', size: '約1.0GB', note: 'ふつうの質問向け', license: 'Apache-2.0' },
  { id: 'gemma-2-2b-jpn-it-q4f16_1-MLC', alt: 'gemma-2-2b-jpn-it-q4f32_1-MLC', name: 'Gemma 2 2B 日本語版', size: '約1.6GB', note: '日本語に合わせたモデル', license: 'Gemma の利用規約' },
];

export function makeLLM(X) {
  const reg = X.reg;
  let st = { provider: 'none', model: '', state: 'off', progress: 0, text: '', error: '' };
  let lib = null, engine = null, loading = null, idleT = 0, busy = false;
  const set = p => { st = { ...st, ...p }; bus.emit('ai:llm', st); };
  const cfg = reg.get('ai.llm') || { provider: 'none', model: '' };
  if (cfg.provider && cfg.provider !== 'none') st = { ...st, provider: cfg.provider, model: cfg.model, state: 'sleep', text: '使うときに読みこみます' };

  async function gpu() { if (!('gpu' in navigator)) return null; try { const a = await navigator.gpu.requestAdapter(); return a ? { f16: a.features.has('shader-f16') } : null; } catch { return null; } }

  async function providers() {
    const c = { id: 'chrome', name: 'ブラウザ内蔵の AI', desc: 'PC の Chrome に入っている言語モデル（Gemini Nano）を使います。モデルは Chrome がダウンロードして管理します。', ok: false, why: '', models: [] };
    if ('LanguageModel' in self) {
      try {
        const a = await self.LanguageModel.availability(LANG);
        if (a === 'unavailable') c.why = 'この端末では使えません。目安は、メモリ16GB以上・4コア以上（または GPU のメモリ 4GB 超）と、空き容量 22GB 以上です。';
        else { c.ok = true; c.models = [{ id: 'gemini-nano', name: 'Gemini Nano', size: a === 'available' ? 'ダウンロードずみ' : 'Chrome がダウンロードします', note: '日本語対応', license: 'Chrome の利用条件' }]; }
      } catch (e) { c.why = '確かめられませんでした（' + e.message + '）'; }
    } else c.why = 'このブラウザには入っていません（PC の Chrome 148 以降で使えます）。';
    const g = await gpu();
    const w = { id: 'webllm', name: 'ダウンロードする言語モデル', desc: '公開されている小さな言語モデルを、この端末の GPU（WebGPU）で動かします。', ok: !!g, why: g ? '' : 'このブラウザ・端末は WebGPU を使えません。', models: g ? MODELS.map(m => ({ ...m, id: g.f16 || !m.alt ? m.id : m.alt })) : [] };
    return [c, w];
  }

  async function load() {
    if (st.state === 'ready') return;
    if (loading) return loading;
    loading = (async () => {
      set({ state: 'loading', progress: 0, text: '準備しています…', error: '' });
      try {
        if (st.provider === 'chrome') {
          if (!('LanguageModel' in self)) throw new Error('このブラウザには内蔵の AI がありません');
          const s = await self.LanguageModel.create({ ...LANG, monitor(m) { m.addEventListener('downloadprogress', e => set({ progress: e.loaded, text: 'Chrome がダウンロード中 ' + Math.round(e.loaded * 100) + '%' })); } });
          s.destroy();
        } else if (st.provider === 'webllm') {
          if (!lib) { set({ text: '動かす部品を読みこんでいます…' }); lib = await import(/* @vite-ignore */ WEBLLM_URL); }
          engine = await lib.CreateMLCEngine(st.model, { initProgressCallback: r => set({ progress: (r && r.progress) || 0, text: (r && r.text ? String(r.text).slice(0, 90) : '読みこみ中') }) });
        } else throw new Error('言語モデルがえらばれていません');
        set({ state: 'ready', progress: 1, text: '' }); log.info('ai', '言語モデルを読みこみました（' + st.provider + '・' + st.model + '）');
      } catch (e) {
        engine = null; set({ state: 'error', error: explain(e), text: '' }); log.warn('ai', '言語モデルを読みこめません: ' + e.message); throw e;
      } finally { loading = null; }
    })();
    return loading;
  }
  function explain(e) {
    const m = String((e && e.message) || e);
    if (/Failed to fetch|NetworkError|import/i.test(m)) return 'ダウンロードできませんでした。通信を確かめてください。';
    if (/memory|OOM|allocation|device lost/i.test(m)) return 'メモリが足りませんでした。もっと軽いモデルをえらぶか、ほかのアプリを閉じてください。';
    if (/user activation|gesture/i.test(m)) return 'ボタンを押して始めてください（自動では始められません）。';
    return m.slice(0, 160);
  }
  async function unload(toSleep) {
    clearTimeout(idleT);
    try { if (engine && engine.unload) await engine.unload(); } catch { /* すでに無い */ }
    engine = null;
    if (toSleep && st.provider !== 'none') set({ state: 'sleep', text: '使うときに読みこみます', progress: 0 });
  }
  const touch = () => { clearTimeout(idleT); idleT = setTimeout(() => { if (!busy) { unload(true); log.info('ai', '言語モデルを下ろしました（5分使わなかったため）'); } }, 5 * 60000); };

  const api = {
    info: () => st,
    usable: () => st.state === 'ready' || st.state === 'sleep',
    providers,
    async enable(provider, model) {
      await unload(false);
      st = { provider, model, state: 'off', progress: 0, text: '', error: '' };
      reg.set('ai.llm', { provider, model });
      await load(); touch();
    },
    disable() { unload(false); reg.set('ai.llm', { provider: 'none', model: '' }); set({ provider: 'none', model: '', state: 'off', progress: 0, text: '', error: '' }); },
    /* ダウンロードしたモデルのファイルを消す */
    async purge() {
      await unload(true); let n = 0;
      try { if (lib && lib.deleteModelAllInfoInCache) for (const m of MODELS) for (const id of [m.id, m.alt].filter(Boolean)) { try { if (!lib.hasModelInCache || await lib.hasModelInCache(id)) { await lib.deleteModelAllInfoInCache(id); n++; } } catch { /* 無いものは飛ばす */ } } } catch { /* 下の方法で消す */ }
      try { if (self.caches) for (const k of await caches.keys()) if (/^webllm/i.test(k)) { await caches.delete(k); n++; } } catch { /* 消せない端末 */ }
      return n;
    },
    /* 文章を作る。onToken に、できたところまでの文を渡す */
    async generate({ system, turns = [], prompt, onToken, maxTokens = 512 }) {
      await load(); busy = true; clearTimeout(idleT);
      let out = '';
      const emit = () => { const clean = out.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trimStart(); onToken && onToken(clean); return clean; };
      try {
        if (st.provider === 'chrome') {
          const s = await self.LanguageModel.create({ ...LANG, initialPrompts: [{ role: 'system', content: system }, ...turns] });
          try { for await (const chunk of s.promptStreaming(prompt)) { out = chunk.startsWith(out) && out ? chunk : out + chunk; emit(); } } finally { s.destroy(); }
        } else {
          const stream = await engine.chat.completions.create({ messages: [{ role: 'system', content: system }, ...turns, { role: 'user', content: prompt }], stream: true, temperature: .6, max_tokens: maxTokens });
          for await (const chunk of stream) { out += (chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) || ''; emit(); }
        }
        return emit().trim();
      } finally { busy = false; touch(); }
    },
    stop() { try { engine && engine.interruptGenerate && engine.interruptGenerate(); } catch { /* 何もしていない */ } },
  };
  /* 省電力のあいだは、読みこんだままにしない */
  bus.on('power:mode', e => { if ((e.mode === 'saver' || e.mode === 'ultra') && st.state === 'ready' && !busy) unload(true); });
  return api;
}

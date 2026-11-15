/* XEVARIX AI — 声（聞き取りと読み上げ）
   ブラウザの機能を使う。聞き取りは、端末の中で処理できる端末ではそうする。
   そうでない端末では、声がブラウザの提供元へ送られる（設定にその注意を出す）。既定はオフ。 */

export function makeVoice(X) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const synth = window.speechSynthesis || null;
  let onDevice = null, rec = null;
  if (SR && typeof SR.available === 'function') {
    try { SR.available({ langs: ['ja-JP'], processLocally: true }).then(r => { onDevice = r === 'available'; }).catch(() => { onDevice = false; }); } catch { onDevice = false; }
  }
  const jaVoices = () => (synth ? synth.getVoices().filter(v => /^ja/i.test(v.lang)) : []);
  const pick = () => { const l = jaVoices(); return l.find(v => v.localService) || l[0] || null; };
  if (synth && synth.addEventListener) synth.addEventListener('voiceschanged', () => {});
  const clean = t => String(t || '').replace(/\*\*|`|^#+\s*|^-\s*/gm, '').replace(/https?:\/\/\S+/g, '').replace(/\n+/g, '。');

  return {
    info: () => ({ stt: !!SR, tts: !!synth && true, onDevice, voices: jaVoices().length }),
    speak(text) {
      if (!synth) return false;
      try { synth.cancel(); const u = new SpeechSynthesisUtterance(clean(text).slice(0, 380)); u.lang = 'ja-JP'; const v = pick(); if (v) u.voice = v; u.rate = 1.05; synth.speak(u); return true; } catch { return false; }
    },
    stop() { try { synth && synth.cancel(); } catch { /* 話していない */ } },
    /* 聞き取りを始める。戻り値を呼ぶと止まる */
    listen({ onText, onEnd, onError }) {
      if (!SR) { onError && onError('unsupported'); return null; }
      try {
        rec = new SR(); rec.lang = 'ja-JP'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
        if (onDevice) { try { rec.processLocally = true; } catch { /* 古い版 */ } }
        rec.onresult = e => { let t = '', fin = false; for (let i = 0; i < e.results.length; i++) { t += e.results[i][0].transcript; if (e.results[i].isFinal) fin = true; } onText && onText(t, fin); };
        rec.onerror = e => { onError && onError(e.error || 'error'); };
        rec.onend = () => { rec = null; onEnd && onEnd(); };
        rec.start();
        return () => { try { rec && rec.stop(); } catch { /* 止まっている */ } };
      } catch (e) { onError && onError(e.message); return null; }
    },
  };
}

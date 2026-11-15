/* XEVARIX 開発キット（アプリ側で読みこむ）
   XEVARIX の窓の中で動いているときだけ、XEVARIX の機能を使える。外で開いたときは connect() が null を返す。

     <script src=".../xevarix/sdk/xevarix-sdk.js"></script>
     const os = await XEVARIX.connect();
     if (os) os.setTitle('対戦中');
*/
(function () {
  'use strict';
  var inFrame = false; try { inFrame = !!window.parent && window.parent !== window; } catch (e) { inFrame = false; }
  var seq = 0, wait = {}, themeFns = [];
  function call(method, args, ms) {
    return new Promise(function (res, rej) {
      var id = ++seq; wait[id] = { res: res, rej: rej };
      try { window.parent.postMessage({ xvx: 1, id: id, method: method, args: args || {} }, '*'); } catch (e) { delete wait[id]; rej(e); return; }
      setTimeout(function () { if (wait[id]) { delete wait[id]; rej(new Error('timeout')); } }, ms || 120000);
    });
  }
  window.addEventListener('message', function (e) {
    var d = e.data; if (!d || d.xvx !== 1 || e.source !== window.parent) return;
    if (d.re && wait[d.re]) { var w = wait[d.re]; delete wait[d.re]; if (d.ok) w.res(d.value); else w.rej(new Error(d.value || 'error')); }
    else if (d.event === 'theme') themeFns.forEach(function (f) { try { f(d.value); } catch (err) { /* アプリ側の失敗 */ } });
  });
  window.XEVARIX = {
    inside: inFrame,
    /* XEVARIX の中なら、できることの束を返す。外なら null */
    connect: function () {
      if (!inFrame) return Promise.resolve(null);
      return call('hello', {}, 1500).then(function (info) {
        return {
          info: info,
          setTitle: function (title) { return call('setTitle', { title: title }); },
          toast: function (text) { return call('toast', { text: text }); },
          notify: function (title, body) { return call('notify', { title: title, body: body }); },
          close: function () { return call('close'); },
          ai: { ask: function (text) { return call('ai.ask', { text: text }); } },
          files: {
            save: function (name, data, mime) { return call('files.save', { name: name, data: data, mime: mime }); },
            pick: function (kinds) { return call('files.pick', { kinds: kinds }); }
          },
          power: { status: function () { return call('power.status'); } },
          onTheme: function (fn) { themeFns.push(fn); }
        };
      }).catch(function () { return null; });
    }
  };
})();

# XEVARIX 開発用サーバー
#   Documents/Claude を根にして、/xevarix/・/xevarion/・/xevora/・/city-rail/ だけを出す。
#   配信先（GitHub Pages）と同じ「となり同士」の並びを手元で再現するためのもの。
#   ★ この PC で動くアプリ（AniReview Studio・PlayCut Studio）は、XEVARIX が開くときに
#     POST /__apps/start?id=… で、そのアプリ自身のサーバーを起動する（決まった2つだけ・この PC からだけ）。
#   使い方:  python XEVARIX/tools/serve.py 8780
import http.server, sys, os, urllib.parse, socket, subprocess, json

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ALLOW = ("xevarix", "xevarion", "xevora", "city-rail")
# 起動してよいサーバー（id → フォルダ・スクリプト・ポート）。start.bat と同じ起こし方
SERVERS = {
    "anireview": ("AniReview-Studio", "server/server.py", 8790),
    "playcut": ("PlayCut-Studio", "server/server.py", 8791),
}


def port_open(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.4):
            return True
    except OSError:
        return False


def start_server(sid):
    if sid not in SERVERS:
        return {"ok": False, "error": "そのアプリは起動できません。"}
    folder, script, port = SERVERS[sid]
    if port_open(port):
        return {"ok": True, "started": False}
    cwd = os.path.join(ROOT, folder)
    if not os.path.exists(os.path.join(cwd, script)):
        return {"ok": False, "error": folder + " のフォルダが見つかりません。"}
    flags = 0
    if os.name == "nt":
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) | getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    subprocess.Popen([sys.executable, "-X", "utf8", script, str(port)], cwd=cwd, stdin=subprocess.DEVNULL,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags, close_fds=True)
    return {"ok": True, "started": True}


class H(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    extensions_map = dict(http.server.SimpleHTTPRequestHandler.extensions_map)
    extensions_map.update({
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".webmanifest": "application/manifest+json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".wasm": "application/wasm",
        ".webp": "image/webp",
    })

    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def log_message(self, *a):
        pass

    def _allowed(self):
        p = urllib.parse.unquote(self.path.split("?", 1)[0].split("#", 1)[0]).lstrip("/")
        return p.split("/", 1)[0].lower() in ALLOW

    def _gate(self):
        if self.path.split("?", 1)[0] in ("/", ""):
            self.send_response(302)
            self.send_header("Location", "/xevarix/")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return False
        if not self._allowed():
            self.send_error(404)
            return False
        return True

    def do_GET(self):
        u = urllib.parse.urlsplit(self.path)
        if u.path == "/__apps/status" and self.headers.get("X-XVX") == "1":
            # この PC のアプリのサーバーが動いているか（ページからポートを直接たたくと、止まっているときにコンソールへエラーが出るため）
            sid = urllib.parse.parse_qs(u.query).get("id", [""])[0]
            res = {"ok": sid in SERVERS, "up": bool(sid in SERVERS and port_open(SERVERS[sid][2]))}
            body = json.dumps(res).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self._gate():
            super().do_GET()

    def do_POST(self):
        u = urllib.parse.urlsplit(self.path)
        # ほかのサイトから押させない：XEVARIX が付ける見出し（X-XVX）が無いものは断る（別のサイトからは付けられない）
        if u.path != "/__apps/start" or self.headers.get("X-XVX") != "1":
            self.send_error(404)
            return
        sid = urllib.parse.parse_qs(u.query).get("id", [""])[0]
        try:
            res = start_server(sid)
        except Exception as e:  # 起動できなかった理由を返す
            res = {"ok": False, "error": "起動できませんでした（%s）" % e}
        body = json.dumps(res, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_HEAD(self):
        if self._gate():
            super().do_HEAD()

    def end_headers(self):
        # 開発用: ブラウザにキャッシュさせない（直したものが必ず出る）
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    # ポートは 環境変数 PORT（プレビューが空きポートを割り当てたとき）→ 引数 → 8780 の順
    env_port = os.environ.get("PORT", "").strip()
    port = int(env_port) if env_port.isdigit() else (int(sys.argv[1]) if len(sys.argv) > 1 else 8780)
    # Windows の SO_REUSEADDR は「使用中のポートにもう1つ待ち受けを重ねる」動きになる。
    # 2つのセッションが同じポートを取り合うと気づけないので、Windows では使わない。
    http.server.ThreadingHTTPServer.allow_reuse_address = (os.name != "nt")
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), H)
    srv.daemon_threads = True
    print("XEVARIX dev server: http://localhost:%d/xevarix/" % port, flush=True)
    srv.serve_forever()

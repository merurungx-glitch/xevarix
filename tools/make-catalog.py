# XEVARIX のストアの一覧（store/catalog.json）を作る。
#   XEVARION の xevarion-home.js の XH_APPS を読んで、名前・説明・アイコン・開くページを写す（読むだけ）。
#   XEVARION 側にアプリを足したら、もう一度これを走らせる:
#       python XEVARIX/tools/make-catalog.py
import re, json, os, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(ROOT, "XEVARION", "xevarion-home.js")
OUT = os.path.join(os.path.dirname(HERE), "store", "catalog.json")
BASE = "../xevarion/"          # 手元（localhost）用：tools/serve.py が XEVARIX のとなりに xevarion を出す
SITE = "https://merurungx-glitch.github.io/xevarion/"   # XEVARION の公開先。公開した XEVARIX は、どこに置いてもここから開く

FEATURED = ["xevarion", "magilex", "magiburst", "magiquiz", "magichainparty", "magishift", "magiabyss", "magiderby", "magiscope"]
# XEVARION のポータル本体（キャラのいるホーム＝index.html）。XH_APPS とは別の1本として、いちばん前に置く
PORTAL = {"id": "xevarion", "name": "XEVARION", "full": "XEVARION", "sub": "キャラと遊びのポータル", "cat": "game", "url": "index.html",
          "img": "icons/xev-192.png", "by": "NGX", "portal": True,
          "desc": "NGX のポータル本体。パートナーのいるホーム、ガチャ、イベント、XEVA、すべてのアプリの入口。",
          "keys": ["ぜばりおん", "ポータル", "ホーム", "パートナー", "ガチャ", "XEVA"],
          "win": {"w": 1000, "h": 720, "minW": 320, "minH": 480}}
# この PC で動かすアプリ（別のフォルダのまま・XEVARIX から開く）。own＝場所を XEVARIX から数える。local＝この PC だけ
#   ・CITY-RAIL … 手元のサーバー（tools/serve.py）が /city-rail/ として出す
#   ・AniReview・PlayCut … そのアプリ自身の Python のサーバー（開くときに止まっていれば手元のサーバーが起動する）
#   絵は make-catalog がアプリのフォルダから写して store/img/<id>.webp にする（CITY-RAIL の絵はご指定の画像＝CITY-RAIL/icon-192.png）
LOCAL_APPS = [
    {"id": "cityrail", "name": "CITY RAIL", "full": "CITY RAIL — 路線網シミュレーター", "sub": "路線網シミュレーター", "cat": "game",
     "url": "../city-rail/index.html", "src": "CITY-RAIL/icon-192.png", "keys": ["鉄道", "電車", "路線", "シティレール", "city rail"],
     "desc": "42路線・371駅の路線網を走らせる総合鉄道アプリ。運行・時刻表・車内と駅の放送（VOICEVOX）。この PC で動きます。",
     "win": {"w": 1100, "h": 720, "minW": 360, "minH": 480}, "local": {"folder": "CITY-RAIL"}},
    {"id": "anireview", "name": "AniReview", "full": "AniReview Studio", "sub": "アニメ紹介動画の自動編集", "cat": "info",
     "url": "http://localhost:8790/", "src": "AniReview-Studio/app/img/icon-192.png", "keys": ["アニメ", "動画", "編集", "レビュー", "anireview"],
     "desc": "アニメのレビューから台本を作り、ナレーション（VOICEVOX）つきの紹介動画を自動で編集します。この PC の Python のサーバーで動きます。",
     "win": {"w": 1280, "h": 800, "minW": 720, "minH": 520}, "local": {"port": 8790, "server": "anireview"}},
    {"id": "playcut", "name": "PlayCut", "full": "PlayCut Studio", "sub": "プレイ録画を YouTube 動画に", "cat": "info",
     "url": "http://localhost:8791/", "src": "PlayCut-Studio/app/img/icon-192.png", "keys": ["動画", "編集", "録画", "モンスト", "youtube", "playcut"],
     "desc": "ゲームのプレイ録画から、YouTube 用の動画を自動で編集します。この PC の Python のサーバーで動きます。",
     "win": {"w": 1280, "h": 800, "minW": 720, "minH": 520}, "local": {"port": 8791, "server": "playcut"}},
]
IMG_DIR = os.path.join(os.path.dirname(HERE), "store", "img")


def local_apps():
    out = []
    os.makedirs(IMG_DIR, exist_ok=True)
    for a in LOCAL_APPS:
        src = os.path.join(ROOT, a["src"])
        e = {k: v for k, v in a.items() if k != "src"}
        e["own"] = True
        e["by"] = "NGX"
        if os.path.exists(src):
            try:
                from PIL import Image
                Image.open(src).convert("RGBA").resize((192, 192), Image.LANCZOS).save(os.path.join(IMG_DIR, a["id"] + ".webp"), "WEBP", quality=88)
                e["img"] = "store/img/" + a["id"] + ".webp"
            except Exception as err:
                print("  絵を写せません:", a["id"], err)
        out.append(e)
    return out
MATE_SRC = os.path.join(ROOT, "XEVARION", "home-mate.js")
MATE_KINDS = ["morning", "day", "evening", "night", "idle"]   # ウィジェットの「ひとこと」に使うセリフ（時間帯＋ふだん）
ACTION_GAMES = {"magibattle", "magiburst", "magiabyss", "magicraft", "magibocciarush", "magimanor", "magiempire", "magiguraplate"}
KEEP_BG = {"magimusic", "magilink"}          # 裏でも止めないもの（音楽・チャット）
WIDE = {"magibattle", "magidominiongrid", "magishift", "magichainparty", "magirail", "magiscope", "magicraft", "magitier", "magiportfolio",
        "magicounter", "ngx", "ishida", "magicalfuture", "magimarket", "magiderby", "magiabyss", "magimanor", "magiempire", "magiarena", "magiguraplate"}
BY = {"ishida": "ISHIDA Production", "magicalfuture": "Magical Future"}
KEYS = {"magilex": ["勉強", "英単語", "化学", "古文", "学習"], "magichemlex": ["化学", "勉強", "問題集"], "magiburst": ["ゲーム", "引っぱり"], "magiquiz": ["クイズ"],
        "magilink": ["チャット", "メッセージ"], "magimusic": ["音楽", "ミュージック"], "magiderby": ["競馬"], "magiscope": ["ランキング", "アニメ"],
        "magiportfolio": ["株", "持ち株"], "magiguraplate": ["バランス", "皿", "パーティー", "ぐらぷれーと"], "magimarket": ["株", "運用"], "magitier": ["ティア", "ランキング表"], "xevynar": ["学習"], "magifocus": ["勉強", "集中"]}


def strip_comments(s):
    out = []; i = 0; n = len(s); q = None
    while i < n:
        c = s[i]
        if q:
            out.append(c)
            if c == "\\" and i + 1 < n: out.append(s[i + 1]); i += 2; continue
            if c == q: q = None
            i += 1; continue
        if c in "\"'`": q = c; out.append(c); i += 1; continue
        if s.startswith("/*", i): j = s.find("*/", i + 2); i = n if j < 0 else j + 2; continue
        if s.startswith("//", i): j = s.find("\n", i); i = n if j < 0 else j; continue
        out.append(c); i += 1
    return "".join(out)


def close_of(s, i):
    """s[i] の開きかっこ（{ か [）に対応する閉じかっこの位置。文字列の中は数えない"""
    pair = {"{": "}", "[": "]"}; stack = []; q = None; j = i
    while j < len(s):
        c = s[j]
        if q:
            if c == "\\": j += 2; continue
            if c == q: q = None
        elif c in "\"'`": q = c
        elif c in pair: stack.append(pair[c])
        elif stack and c == stack[-1]:
            stack.pop()
            if not stack: return j
        j += 1
    return -1


def read_mates():
    """XEVARION の home-mate.js の HM_MATES から、パートナーの名前・色・絵の場所・ひとことを写す（読むだけ）"""
    if not os.path.exists(MATE_SRC): return None
    src = open(MATE_SRC, encoding="utf-8").read()
    a = src.index("const HM_MATES = {") + len("const HM_MATES = ")
    body = strip_comments(src[a:close_of(src, a) + 1])
    m = re.search(r"const HM_VER\s*=\s*(\d+)", src)
    free = re.search(r"const HM_FREE\s*=\s*\"(\w+)\"", src)
    out = {}
    i = 1
    while True:
        m2 = re.compile(r"(\w+)\s*:\s*\{").search(body, i)
        if not m2: break
        s = m2.end() - 1; e = close_of(body, s)
        blk = body[s:e + 1]; i = e + 1
        def f(key):
            x = re.search(r"(?<![A-Za-z])" + key + r"\s*:\s*\"((?:[^\"\\]|\\.)*)\"", blk)
            return x.group(1) if x else ""
        mid = m2.group(1)
        lines = {}
        for k in MATE_KINDS:
            x = re.search(r"(?<![A-Za-z])" + k + r"\s*:\s*\[", blk)
            if not x: continue
            arr = blk[x.end() - 1:close_of(blk, x.end() - 1) + 1]
            ls = []
            for t in re.findall(r"\"((?:[^\"\\]|\\.)*)\"", arr):
                if "{n}" in t or "{@" in t: continue
                t = re.sub(r"\{[^}]*\}", "", t).replace("|", " ").strip()
                if t: ls.append(t)
            if ls: lines[k] = ls
        rig = os.path.join(ROOT, "XEVARION", f("dir"), mid + ".json")
        face = None
        if os.path.exists(rig):
            r = json.load(open(rig, encoding="utf-8"))
            if r.get("face") and r.get("size"): face = {"x": r["face"][0], "y": r["face"][1], "r": r.get("faceRadius") or 60, "w": r["size"][0], "h": r["size"][1]}
        out[mid] = {"name": f("name"), "ruby": f("ruby"), "color": f("color"), "intro": f("intro"), "dir": f("dir"), "face": face, "lines": lines}
    return {"ver": int(m.group(1)) if m else 1, "free": free.group(1) if free else "", "mates": out}


def main():
    src = open(SRC, encoding="utf-8").read()
    a = src.index("const XH_APPS = ["); b = src.index("\n];", a)
    body = strip_comments(src[a + len("const XH_APPS = ["):b])
    blocks = []; depth = 0; q = None; start = None; i = 0
    while i < len(body):
        c = body[i]
        if q:
            if c == "\\": i += 2; continue
            if c == q: q = None
        elif c in "\"'`": q = c
        elif c == "{":
            if depth == 0: start = i
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0: blocks.append(body[start:i + 1])
        i += 1
    apps = []
    for blk in blocks:
        def f(key):
            m = re.search(r"(?<![A-Za-z])" + key + r"\s*:\s*\"((?:[^\"\\]|\\.)*)\"", blk)
            return m.group(1).replace('\\"', '"') if m else None
        aid, href, img = f("id"), f("href"), f("img")
        if not aid or not href: continue
        if not os.path.exists(os.path.join(ROOT, "XEVARION", href.split("?")[0].split("#")[0])): continue
        desc = re.sub(r"<[^>]+>", "", f("desc") or "")
        e = {"id": aid, "name": f("name") or aid, "full": f("full") or f("name") or aid, "sub": f("sub") or "", "cat": f("cat") or "other",
             "url": href, "img": img or "", "desc": desc, "by": BY.get(aid, "NGX")}
        if re.search(r"(?<![A-Za-z])beta\s*:\s*true", blk): e["beta"] = True
        if aid in ACTION_GAMES: e["game"] = True
        if aid in KEEP_BG: e["bg"] = True
        if aid in KEYS: e["keys"] = KEYS[aid]
        e["win"] = {"w": 1000, "h": 700, "minW": 320, "minH": 420} if aid in WIDE else {"w": 460, "h": 800, "minW": 320, "minH": 420}
        apps.append(e)
    if os.path.exists(os.path.join(ROOT, "XEVARION", PORTAL["url"])) and not any(a["id"] == PORTAL["id"] for a in apps):
        apps.insert(0, dict(PORTAL))
    apps += local_apps()
    data = {"version": datetime.date.today().isoformat(), "base": BASE, "site": SITE, "featured": [x for x in FEATURED if any(a["id"] == x for a in apps)], "apps": apps}
    mates = read_mates()
    if mates: data["xevarion"] = mates
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("catalog.json: %d apps, featured %d, partners %d" % (len(apps), len(data["featured"]), len((mates or {}).get("mates", {}))))


if __name__ == "__main__":
    main()

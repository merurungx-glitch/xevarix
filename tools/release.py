# XEVARIX の配信の準備：release.json（版・変更点・配るファイルの一覧）を作る。
#   版の番号は sys/core.js の OS.version が元（1か所だけ直せばよい）。
#   使い方:  python XEVARIX/tools/release.py
#   このあと、XEVARIX フォルダの中身（tools は不要）を配信先へ上げる。
import os, re, json, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {"tools", ".git", "__pycache__"}
SKIP_FILES = {"release.json", "firebase-rules.json", "sw.js"}
KEEP_EXT = {".html", ".js", ".css", ".json", ".webmanifest", ".png", ".webp", ".svg", ".jpg"}


def main():
    core = open(os.path.join(ROOT, "sys", "core.js"), encoding="utf-8").read()
    version = re.search(r"version:\s*'([^']+)'", core).group(1)
    build = re.search(r"build:\s*'([^']+)'", core).group(1)
    upd = open(os.path.join(ROOT, "sys", "update.js"), encoding="utf-8").read()
    m = re.search(r"\{ version: '" + re.escape(version) + r"', date: '([^']+)', items: \[(.*?)\] \}", upd, flags=re.S)
    notes = re.findall(r"'((?:[^'\\]|\\.)*)'", m.group(2)) if m else []
    files, total = [], 0
    for d, dirs, names in os.walk(ROOT):
        dirs[:] = sorted(x for x in dirs if x not in SKIP_DIRS)
        for n in sorted(names):
            rel = os.path.relpath(os.path.join(d, n), ROOT).replace("\\", "/")
            if n in SKIP_FILES and "/" not in rel: continue
            if os.path.splitext(n)[1].lower() not in KEEP_EXT: continue
            if rel == "assets/brand/xevarix-logo.webp": continue      # 元の大きい絵は配らない（640 の版を使う）
            files.append(rel); total += os.path.getsize(os.path.join(d, n))
    data = {"version": version, "build": build, "date": (m.group(1) if m else datetime.date.today().isoformat()), "notes": notes, "bytes": total, "files": files}
    json.dump(data, open(os.path.join(ROOT, "release.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("release.json: version %s / %d files / %.1f KB" % (version, len(files), total / 1024))
    if not m: print("  ※ sys/update.js の NOTES に、この版の変更点がありません")


if __name__ == "__main__":
    main()

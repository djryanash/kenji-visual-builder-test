#!/usr/bin/env bash
# Kenji Editor — installer (manual testing, no npm needed).
#
# Two ways to run:
#   1. Drag the editor/ folder into a project root, then:  ./editor/install.sh
#      (no arguments = in-place: detects the project, writes editor/editor.config.json)
#   2. From anywhere:  ./editor/install.sh <path-to-site>
#      (copies the editor into <site>/kenji-editor/ and writes its config)
#
# The config file is editor.config.json (namespaced) and is always MERGED:
# existing keys you added are preserved. A foreign config.json is never touched.
set -euo pipefail

src="$(cd "$(dirname "$0")" && pwd)"

if [ $# -eq 0 ]; then
  mode=inplace
  project="$(dirname "$src")"
else
  mode=copy
  [ -d "$1" ] || { echo "usage: install.sh <path-to-site>  (or run with no arguments inside the dragged-in editor folder)"; exit 1; }
  project="$(cd "$1" && pwd)"
fi

if [ "$mode" = copy ]; then
  ed="$project/kenji-editor"
  mkdir -p "$ed"
  cp "$src/editor.js" "$src/server.js" "$ed/"
else
  [ -f "$src/server.js" ] || { echo "no server.js beside install.sh — run this inside the editor folder"; exit 1; }
  ed="$src"
fi
cfg="$ed/editor.config.json"

echo "== Kenji Editor: $project ($mode mode) =="

# ---------- 1. what is this site built on? ----------
kind="vanilla/static"
if [ -d wp-content ] || [ -f wp-load.php ]; then
  kind="WordPress (server-rendered)"
elif [ -f package.json ]; then
  grep -q '"next"' package.json 2>/dev/null && kind="Next.js"
  grep -q '"vite"' package.json 2>/dev/null && kind="Vite"
  grep -q '"@angular/core"' package.json 2>/dev/null && kind="Angular"
  grep -q '"vue"' package.json 2>/dev/null && kind="Vue/Nuxt"
  grep -q '"react"' package.json 2>/dev/null && [ "$kind" = "vanilla/static" ] && kind="React (bundler)"
fi
echo "detected: $kind"

case "$kind" in
  WordPress*)
    echo "STOP: server-rendered PHP needs the override-stylesheet mode (tier two), which this script does not install yet."
    exit 1 ;;
  Next.js|Vite|Angular|Vue/Nuxt|React*)
    echo "STOP: bundled dev-server framework. The editor UI works, but writes need the override-stylesheet mode (tier two), not installed here yet."
    exit 1 ;;
esac

# ---------- 2. locate the main stylesheet ----------
css=""
for candidate in css/style.css style.css css/main.css assets/style.css style/main.css style.css; do
  [ -f "$project/$candidate" ] && css="$candidate" && break
done
if [ -z "$css" ]; then
  found="$(find "$project" -maxdepth 3 -name '*.css' -not -path '*/node_modules/*' -not -path '*/kenji-editor/*' | head -1 || true)"
  [ -n "$found" ] && css="${found#$project/}" && echo "guessed stylesheet by search: $css"
fi
[ -n "$css" ] || { echo "STOP: no stylesheet found. Write $cfg manually, e.g. { \"cssFile\": \"css/site.css\" }"; exit 1; }
echo "stylesheet: $css"

# ---------- 3. write config: merge, never overwrite ----------
python3 - "$cfg" "$css" <<'PY'
import json, sys
path, css = sys.argv[1], sys.argv[2]
try:
    with open(path) as f:
        cfg = json.load(f)
    merged = True
except Exception:
    cfg, merged = {}, False
cfg["cssFile"] = css
cfg.setdefault("port", 5177)
with open(path, "w") as f:
    json.dump(cfg, f, indent=2)
print(("merged into existing " if merged else "created ") + path)
PY

echo
echo "installed. next steps:"
echo "  node $ed/server.js"
echo "  open http://localhost:5177  (editor lives only on this local server;"
echo "  nothing is added to what you deploy. K pill / Cmd+Shift+E hides it.)"
echo "  your own keys in editor.config.json are preserved on re-runs; a foreign"
echo "  config.json is never read for settings or overwritten."

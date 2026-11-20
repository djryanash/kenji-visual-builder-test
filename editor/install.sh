#!/usr/bin/env bash
# Kenji Editor — copy-into-project installer (manual testing, no npm needed).
# Usage:  ./editor/install.sh <path-to-site>
# Copies the editor into <site>/kenji-editor/, detects what the site is built on,
# and writes a config pointing at its main stylesheet.
set -euo pipefail

src="$(cd "$(dirname "$0")" && pwd)"
target="${1:-}"
if [ -z "$target" ]; then
  echo "usage: install.sh <path-to-site>"; exit 1
fi
target="$(cd "$target" && pwd)"
cd "$target"

echo "== Kenji Editor: $target =="

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
css="css/style.css"
for candidate in css/style.css style.css css/main.css assets/style.css; do
  [ -f "$candidate" ] && css="$candidate" && break
done
[ -f "$css" ] || { echo "STOP: no main stylesheet found (looked for css/style.css, style.css, css/main.css, assets/style.css). Write kenji-editor/config.json manually."; exit 1; }
echo "stylesheet: $css"

# ---------- 3. copy files and write config ----------
mkdir -p kenji-editor
cp "$src/editor.js" "$src/server.js" kenji-editor/
cat > kenji-editor/config.json <<EOF
{ "cssFile": "$css", "port": 5177 }
EOF

echo
echo "installed. next steps:"
echo "  node kenji-editor/server.js"
echo "  open http://localhost:5177  (editor lives only on this local server;"
echo "  nothing is added to what you deploy. K pill / Cmd+Shift+E hides it.)"

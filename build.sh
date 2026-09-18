#!/bin/sh
# Package the extension as an installable .xpi — a plain zip with manifest.json
# at its root. Needs a shell and either zip or python3; nothing else.
#
#   ./build.sh          the full add-on, Zen spaces included
#   ./build.sh --lite   without the Experiment API, for builds that refuse it
set -eu
cd "$(dirname "$0")"

lite=""
[ "${1:-}" = "--lite" ] && lite=1

version=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json | head -1)
[ -n "$version" ] || { echo "Could not read the version out of manifest.json." >&2; exit 1; }

shared="background.js overlay.js panel.html panel.css panel.js search.js icon.svg"
files="manifest.json $shared experiments/api.js experiments/schema.json"
out="zen-glass-$version.xpi"
root="."

# --lite strips experiment_apis, leaving an ordinary extension that any build
# loads. It costs the Zen spaces and the real favicons; the rest is unchanged.
# It carries its own add-on id, so both can sit in the browser at once.
if [ -n "$lite" ]; then
  command -v python3 >/dev/null 2>&1 || { echo "--lite needs python3 to rewrite the manifest." >&2; exit 1; }
  out="zen-glass-$version-lite.xpi"
  root="build/lite"
  files="manifest.json $shared"
  rm -rf "$root"
  mkdir -p "$root"
  for f in $shared; do cp "$f" "$root/$f"; done
  python3 tools/lite-manifest.py "$root/manifest.json"
fi

missing=""
for f in $files; do [ -f "$root/$f" ] || missing="$missing $f"; done
[ -z "$missing" ] || { echo "Missing:$missing" >&2; exit 1; }

rm -f "$out"
target=$(pwd)/$out
if command -v zip >/dev/null 2>&1; then
  # -X drops platform extras so the same tree always zips to the same bytes.
  (cd "$root" && zip -q -X "$target" $files)
else
  (cd "$root" && python3 -c 'import sys,zipfile
out,names=sys.argv[1],sys.argv[2:]
with zipfile.ZipFile(out,"w",zipfile.ZIP_DEFLATED) as archive:
    for name in names: archive.write(name)' "$target" $files)
fi

echo "$out  ($(wc -c < "$out" | tr -d ' ') bytes)"
if [ -n "$lite" ]; then
  echo "No Experiment API: no Zen spaces and no favicons, but any build will load it."
  echo "Temporary load: about:debugging#/runtime/this-firefox → Load Temporary Add-on → $root/manifest.json"
else
  echo "Needs extensions.experiments.enabled=true for the spaces. ./build.sh --lite builds without them."
fi
echo "Install: about:addons → gear menu → Install Add-on From File → $out"

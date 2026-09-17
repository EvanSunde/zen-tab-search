#!/bin/sh
# Package the extension as an installable .xpi — a plain zip with manifest.json
# at its root. Needs a shell and either zip or python3; nothing else.
set -eu
cd "$(dirname "$0")"

version=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json | head -1)
[ -n "$version" ] || { echo "Could not read the version out of manifest.json." >&2; exit 1; }
out="zen-glass-$version.xpi"

files="manifest.json background.js overlay.js panel.html panel.css panel.js search.js icon.svg experiments/api.js experiments/schema.json"
missing=""
for f in $files; do [ -f "$f" ] || missing="$missing $f"; done
[ -z "$missing" ] || { echo "Missing:$missing" >&2; exit 1; }

rm -f "$out"
if command -v zip >/dev/null 2>&1; then
  # -X drops platform extras so the same tree always zips to the same bytes.
  zip -q -X "$out" $files
else
  python3 - "$out" $files <<'PY'
import sys, zipfile
out, files = sys.argv[1], sys.argv[2:]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(name)
PY
fi

echo "$out  ($(wc -c < "$out" | tr -d ' ') bytes)"
echo "Install: about:addons → gear menu → Install Add-on From File → $out"

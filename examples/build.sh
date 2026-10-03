#!/usr/bin/env sh
# Build the LiveDeck example site.
# Copies the library (livedeck.js / livedeck.css / livedeck-live.js) and the
# example pages (examples/site) into one directory that can be served as-is.
#
# Usage: sh examples/build.sh [outdir]     (default: _site)
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
out=${1:-_site}

# Resolve a relative outdir against the repo root.
case "$out" in
  /*) ;;
  *) out="$root/$out" ;;
esac

rm -rf "$out"
mkdir -p "$out"

cp "$root/livedeck.js" "$root/livedeck.css" "$root/livedeck-live.js" "$out"/
cp -R "$root/examples/site/." "$out"/

echo "Built example site into $out"

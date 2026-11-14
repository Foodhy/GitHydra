#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -n "${CARGO_TARGET_DIR:-}" ]]; then
  app="$CARGO_TARGET_DIR/release/bundle/macos/GitHydra.app"
else
  app="$root/apps/desktop/src-tauri/target/release/bundle/macos/GitHydra.app"
fi
dest="/Applications/GitHydra.app"

if [[ ! -d "$app" ]]; then
  echo "No está el bundle en $app" >&2
  exit 1
fi

osascript -e 'quit app "GitHydra"' >/dev/null 2>&1 || true
rm -rf "$dest"
ditto "$app" "$dest"
open "$dest"
echo "Instalada y abierta: $dest"

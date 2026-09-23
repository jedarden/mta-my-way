#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$script_dir/.." && pwd)
cd "$repo_root"

case "${1:-}" in
  ""|--fast) ;;
  *)
    printf '%s\n' "definition-of-done: expected no argument or --fast" >&2
    exit 2
    ;;
esac

if [ ! -x node_modules/.bin/tsc ] || [ ! -x node_modules/.bin/biome ] || [ ! -x node_modules/.bin/eslint ]; then
  npm ci --prefer-offline --no-audit --no-fund
fi

npm run typecheck
npm run lint

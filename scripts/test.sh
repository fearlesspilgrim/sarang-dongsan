#!/bin/zsh
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

if command -v npm >/dev/null 2>&1; then
  npm test
elif [[ -x "$root/.tools/node/bin/npm" ]]; then
  PATH="$root/.tools/node/bin:$PATH" npm test
else
  echo "npm이 없습니다. Node.js를 설치한 뒤 npm test 를 실행해 주세요." >&2
  exit 1
fi

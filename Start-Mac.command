#!/bin/bash
set -u
PAVILION_ROOT="$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)" || exit 1
cd "$PAVILION_ROOT" || exit 1
. "$PAVILION_ROOT/scripts/mac/node.sh"
printf '\n长衣亭 · Mac 快捷启动\n\n'
if ! pavilion_find_node; then
  printf '请先安装 Node.js LTS（推荐 24），完成后重新双击本文件。\nhttps://nodejs.org/en/download\n'
  if [ "$(uname -s)" = Darwin ]; then /usr/bin/open 'https://nodejs.org/en/download' || true; fi
  pavilion_pause
  exit 1
fi
"$PAVILION_NODE" "$PAVILION_ROOT/scripts/launch.mjs" "$@"
pavilion_code=$?
if [ "$pavilion_code" -ne 0 ]; then pavilion_pause; fi
exit "$pavilion_code"

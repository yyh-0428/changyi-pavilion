#!/bin/bash
set -u
PAVILION_ROOT="$(CDPATH= cd -- "$(dirname "$0")" && pwd -P)" || exit 1
cd "$PAVILION_ROOT" || exit 1
. "$PAVILION_ROOT/scripts/mac/node.sh"
if ! pavilion_find_node; then
  printf '未找到可用的 Node.js。请回到启动窗口，按 Control+C 停止长衣亭。\n'
  pavilion_pause
  exit 1
fi
"$PAVILION_NODE" "$PAVILION_ROOT/scripts/launch.mjs" --stop
pavilion_code=$?
if [ "$pavilion_code" -ne 0 ]; then pavilion_pause; fi
exit "$pavilion_code"

#!/bin/bash
# Compatible with the Bash 3.2 shipped with macOS. Do not load interactive shell profiles.
pavilion_find_node() {
  local candidate
  local candidates=()
  candidate="$(command -v node 2>/dev/null || true)"
  [ -n "$candidate" ] && candidates+=("$candidate")
  candidates+=(/opt/homebrew/bin/node /usr/local/bin/node /opt/local/bin/node)
  candidates+=("${VOLTA_HOME:-$HOME/.volta}/bin/node" "${ASDF_DATA_DIR:-$HOME/.asdf}/shims/node")
  candidates+=("${NVM_DIR:-$HOME/.nvm}"/versions/node/*/bin/node)
  candidates+=("$HOME"/.local/share/fnm/node-versions/*/installation/bin/node)
  candidates+=("$HOME"/Library/Application\ Support/fnm/node-versions/*/installation/bin/node)
  for candidate in "${candidates[@]}"; do
    [ -x "$candidate" ] || continue
    if "$candidate" -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit((a===20&&b>=19)||(a===22&&b>=12)||a>22?0:1)' >/dev/null 2>&1; then
      PAVILION_NODE="$candidate"
      export PATH="$(dirname "$candidate"):$PATH"
      return 0
    fi
  done
  return 1
}

pavilion_pause() {
  if [ -t 0 ] && [ "${PAVILION_NO_PAUSE:-0}" != 1 ]; then
    printf '\n按回车关闭此窗口…'
    read -r pavilion_reply
  fi
}

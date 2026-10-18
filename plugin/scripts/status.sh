#!/bin/sh
f="${RELAY_HOOK_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/relay/hook-url}"
url=$(head -n 1 "$f" 2>/dev/null)
if [ -z "$url" ]; then
  echo "status: not-connected"
else
  echo "status: connected"
  echo "cafe: $(printf '%s' "$url" | sed -E 's#/api/claude-hook.*##')"
  echo "key: $(printf '%s' "$url" | sed -nE 's#.*[?&]k=([A-Za-z0-9_-]{4}).*#\1…#p')"
  echo "name: $(printf '%s' "$url" | sed -nE 's#.*[?&]m=([^&]*).*#\1#p')"
  echo "file: $f"
fi
if grep -qs '/api/claude-hook' "$HOME/.claude/settings.json"; then echo "old-hooks: $HOME/.claude/settings.json"; else echo "old-hooks: none"; fi
[ -n "$url" ] && sh "$(dirname "$0")/relay.sh" away status
log="${RELAY_STATE:-${XDG_STATE_HOME:-$HOME/.local/state}/relay}/answers.log"
if [ -s "$log" ]; then
  echo "answers:"
  tail -n 10 "$log" | sed 's/^/  /'
else
  echo "answers: none"
fi

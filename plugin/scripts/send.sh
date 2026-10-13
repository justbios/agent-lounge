#!/bin/sh
# Async Claude Code hook: forwards the hook JSON to the café saved by /relay:connect, and never fails.
f="${RELAY_HOOK_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/relay/hook-url}"
url=$(head -n 1 "$f" 2>/dev/null)
case "$url" in
  https://*/api/claude-hook* | http://127.0.0.1:*/api/claude-hook*) ;;
  *) cat >/dev/null; exit 0 ;;
esac
if [ "$1" = roster ]; then
  { cat; printf '\n#relay-agents\n'; ls "$CLAUDE_PROJECT_DIR/.claude/agents" 2>/dev/null; } |
    curl -s -m 3 -o /dev/null -H 'content-type: text/plain' --data-binary @- "$url"
else
  curl -s -m 3 -o /dev/null -H 'content-type: application/json' --data-binary @- "$url"
fi
exit 0

#!/bin/sh
# Async Claude Code hook: forwards the hook JSON to the café saved by /relay:connect, and never fails.
# Flags: roster = add the names in .claude/agents, title = add the chat's name from the transcript.
f="${RELAY_HOOK_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/relay/hook-url}"
url=$(head -n 1 "$f" 2>/dev/null)
case "$url" in
  https://*/api/claude-hook* | http://127.0.0.1:*/api/claude-hook*) ;;
  *) cat >/dev/null; exit 0 ;;
esac
if [ $# -eq 0 ]; then
  curl -s -m 3 -o /dev/null -H 'content-type: application/json' --data-binary @- "$url"
  exit 0
fi
j=$(cat)
{
  printf '%s' "$j"
  for flag in "$@"; do
    case "$flag" in
      roster)
        printf '\n#relay-agents\n'
        ls "$CLAUDE_PROJECT_DIR/.claude/agents" 2>/dev/null
        ;;
      title)
        printf '\n#relay-title\n'
        t=$(printf '%s' "$j" | grep -oE '"transcript_path":"[^"]*"' | head -n 1 | cut -d'"' -f4)
        [ -f "$t" ] && tail -c 1048576 "$t" | grep -oE '"customTitle":"([^"\\]|\\.)*"' | tail -n 1
        ;;
    esac
  done
} | curl -s -m 3 -o /dev/null -H 'content-type: text/plain' --data-binary @- "$url"
exit 0

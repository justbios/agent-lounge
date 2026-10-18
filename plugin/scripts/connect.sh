#!/bin/sh
# Saves the café link the hooks post to, keeps a copy of the hook script for the status line, sends one check event.
dir="${XDG_CONFIG_HOME:-$HOME/.config}/relay"
f="${RELAY_HOOK_FILE:-$dir/hook-url}"
url="$1"
[ "$url" = local ] && url="http://127.0.0.1:3737/api/claude-hook"
if ! printf '%s' "$url" | grep -Eq '^(https://[A-Za-z0-9.-]+(:[0-9]+)?|http://127\.0\.0\.1:[0-9]{2,5})/api/claude-hook(\?k=[A-Za-z0-9_-]{20,128}(&m=[A-Za-z0-9%._~-]{1,200})?)?$'; then
  echo "status: bad-link"
  exit 1
fi
mkdir -p "$(dirname "$f")" || exit 1
umask 077
printf '%s\n' "$url" > "$f" || exit 1
chmod 600 "$f"
echo "status: saved"
echo "file: $f"
sh_dir="$HOME/.config/relay"
mkdir -p "$sh_dir" && cp "$(dirname "$0")/relay.sh" "$sh_dir/relay.sh" && echo "script: $sh_dir/relay.sh"
# the key goes in a header, as relay.sh sends it, not in the address that servers log
key=$(printf '%s' "$url" | sed -nE 's#.*[?&]k=([A-Za-z0-9_-]+).*#\1#p')
plain=$(printf '%s' "$url" | sed -E 's#([?&])k=[A-Za-z0-9_-]+&?#\1#; s#[?&]$##')
set -- -s -m 8 -o /dev/null -w '%{http_code}' -H 'content-type: application/json' --data-binary @-
[ -n "$key" ] && set -- "$@" -H "x-relay-key: $key"
code=$(printf '%s' '{"session_id":"relay-check","cwd":"/relay","hook_event_name":"UserPromptSubmit","prompt":"перевірка Agent Lounge"}' |
  curl "$@" "$plain")
echo "check: ${code:-000}"
s="$HOME/.claude/settings.json"
if grep -qs '/api/claude-hook' "$s"; then echo "old-hooks: $s"; else echo "old-hooks: none"; fi
if grep -qsE 'relay\.sh\\?" (statusline|limits)' "$s"; then
  echo "statusline: relay"
elif grep -qs '"statusLine"' "$s"; then
  echo "statusline: other"
else
  echo "statusline: none"
fi

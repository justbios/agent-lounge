#!/bin/sh
# Relay for Claude Code: forwards a hook's JSON to a Relay café, with extras after marker lines. Async, silent, exits 0.
#   relay.sh [--url URL] [roster] [title] [usage] [limits]   hook, JSON on stdin
#   relay.sh [--url URL] ask                                  PermissionRequest, and PreToolUse of a question or a plan:
#                                                             the only hooks Claude waits for
#   relay.sh statusline                                       statusLine command: keeps limits and context, prints a line
#   relay.sh limits                                           the same, silent, for chaining after another statusLine
# Without --url the café link comes from ~/.config/relay/hook-url (written by /relay:connect).
# Token counts and the last limits are kept in ~/.local/state/relay; nothing leaves this machine but the café's own events.
state="${RELAY_STATE:-${XDG_STATE_HOME:-$HOME/.local/state}/relay}"
version=5

field() {
  printf '%s' "$1" | grep -oE "\"$2\":\"[^\"]*\"" | head -n 1 | cut -d'"' -f4
}

number() {
  printf '%s' "$1" | grep -oE "\"$2\":[0-9.]+" | head -n 1 | cut -d: -f2
}

# Sums the usage of every assistant message once (a message is written as one line per content block), skipping
# the message id given as $1, and stops at a half-written last line.
# Prints: in cache_write cache_read out bytes last_id context, where context is the last message's whole input
sum_usage() {
  LC_ALL=C awk -v skip="$1" '
    function n(s, k) { return match(s, "\"" k "\":[0-9]+") ? substr(s, RSTART + length(k) + 3, RLENGTH - length(k) - 3) + 0 : 0 }
    BEGIN { ok = 1 }
    !ok { next }
    substr($0, length($0)) != "}" { ok = 0; next }
    { bytes += length($0) + 1 }
    index($0, "\"role\":\"assistant\"") == 0 { next }
    !match($0, /"id":"msg_[A-Za-z0-9_-]+"/) { next }
    {
      id = substr($0, RSTART + 6, RLENGTH - 7)
      u = index($0, "\"usage\":{")
      if (id == skip || !u) next
      s = substr($0, u)
      I[id] = n(s, "input_tokens"); W[id] = n(s, "cache_creation_input_tokens"); R[id] = n(s, "cache_read_input_tokens")
      o = n(s, "output_tokens"); if (o > O[id]) O[id] = o
      last = id
    }
    END {
      for (k in I) { i += I[k]; w += W[k]; r += R[k]; t += O[k] }
      c = last == "" ? 0 : I[last] + W[last] + R[last]
      printf "%d %d %d %d %d %s %d\n", i, w, r, t, bytes, (last == "" ? (skip == "" ? "-" : skip) : last), c
    }'
}

# $5 is how full the context is after the last answer and $6 how big it is, 0 when unknown.
usage_json() {
  [ "$(($1 + $2 + $3 + $4))" -gt 0 ] || return 0
  printf '\n#relay-usage\n{"in":%d,"cw":%d,"cr":%d,"out":%d,"ctx":%d,"win":%d}\n' \
    "$1" "$2" "$3" "$4" "${5:-0}" "${6:-0}"
}

safe() {
  printf '%s' "$1" | tr -cd 'A-Za-z0-9_-'
}

# A subagent's whole transcript once it stops; for the main chat, only what was added since the last report.
usage() {
  sleep 1
  sub=$(field "$1" agent_transcript_path)
  if [ -n "$sub" ]; then
    [ -f "$sub" ] || return 0
    set -- $(sum_usage "" < "$sub")
    usage_json "$1" "$2" "$3" "$4" "$7"
    return 0
  fi
  t=$(field "$1" transcript_path)
  sid=$(field "$1" session_id)
  [ -f "$t" ] && [ -n "$sid" ] || return 0
  mkdir -p "$state/usage" 2>/dev/null || return 0
  f="$state/usage/$(safe "$sid")"
  off=0
  skip=""
  [ -f "$f" ] && read -r off skip < "$f"
  size=$(wc -c < "$t" | tr -d ' ')
  case "$off" in '' | *[!0-9]*) off=0 ;; esac
  [ "$size" -lt "$off" ] && off=0 && skip=""
  [ "$skip" = "-" ] && skip=""
  [ "$size" -gt "$off" ] || return 0
  set -- $(tail -c +"$((off + 1))" "$t" | head -c "$((size - off))" | sum_usage "$skip")
  printf '%s %s\n' "$((off + $5))" "$6" > "$f"
  used=$7
  seen=0
  win=0
  [ -f "$state/ctx/$(safe "$sid")" ] && read -r seen win < "$state/ctx/$(safe "$sid")"
  case "$seen" in '' | *[!0-9]*) seen=0 ;; esac
  case "$win" in '' | *[!0-9]*) win=0 ;; esac
  [ "$used" -gt 0 ] || used=$seen
  usage_json "$1" "$2" "$3" "$4" "$used" "$win"
}

save_limits() {
  five=$(printf '%s' "$1" | grep -oE '"five_hour":\{[^}]*\}' | head -n 1)
  week=$(printf '%s' "$1" | grep -oE '"seven_day":\{[^}]*\}' | head -n 1)
  p5=$(number "$five" used_percentage)
  r5=$(number "$five" resets_at)
  p7=$(number "$week" used_percentage)
  r7=$(number "$week" resets_at)
  [ -n "$p5$p7" ] || return 0
  mkdir -p "$state" 2>/dev/null || return 0
  {
    printf '{"at":%s' "$(date +%s)"
    [ -n "$p5" ] && printf ',"five":{"pct":%s,"reset":%s}' "$p5" "${r5:-0}"
    [ -n "$p7" ] && printf ',"week":{"pct":%s,"reset":%s}' "$p7" "${r7:-0}"
    printf '}\n'
  } > "$state/limits.tmp" && mv -f "$state/limits.tmp" "$state/limits"
}

# The status line knows the context window of each chat: 200k, or 1M for models with the long one.
save_ctx() {
  sid=$(field "$1" session_id)
  cw=$(printf '%s' "$1" | grep -oE '"context_window":\{[^}]*' | head -n 1)
  size=$(number "$cw" context_window_size)
  used=$(number "$cw" total_input_tokens)
  [ -n "$sid" ] && [ -n "$size" ] || return 0
  mkdir -p "$state/ctx" 2>/dev/null || return 0
  used=${used%.*}
  printf '%s %s\n' "${used:-0}" "${size%.*}" > "$state/ctx/$(safe "$sid")"
}

# The chat's name, which Claude Code writes into the transcript as it changes.
title_of() {
  t=$(field "$1" transcript_path)
  [ -f "$t" ] && tail -c 1048576 "$t" | grep -oE '"customTitle":"([^"\\]|\\.)*"' | tail -n 1
}

# A permission prompt gets PermissionRequest's answer; a question or a plan gets PreToolUse's, which the café's
# reply fills in: the question's own options or the plan as Claude wrote it, nothing else.
reply() {
  if [ "$1" = PermissionRequest ]; then
    m=""
    [ "$2" = deny ] && m=',"message":"The user denied this from the Relay café."'
    printf '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"%s"%s}}}' "$2" "$m"
    exit 0
  fi
  if [ "$2" = deny ]; then
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",%s}}' \
      '"permissionDecisionReason":"The user rejected this plan from the Relay café. Stay in plan mode and revise it."'
    exit 0
  fi
  u=$(printf '%s' "$3" | sed -n 's/^{"a":"allow","u":\(.*\)}$/\1/p')
  [ -n "$u" ] &&
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","updatedInput":%s}}' "$u"
  exit 0
}

# Only while you have turned on «я не за комп'ютером» in the café does it answer: the café shows the request, the
# question or the plan, waits up to 10 minutes for your answer there, and gives Claude that. Otherwise, after those
# 10 minutes, or on any failure it prints nothing, and the terminal asks as usual. Never «always allow», never a
# changed command. When the café says you are at the computer, the next minute's prompts don't ask it again.
ask() {
  j=$(cat)
  ev=$(field "$j" hook_event_name)
  case "$ev:$(field "$j" tool_name)" in
    PreToolUse:AskUserQuestion | PreToolUse:ExitPlanMode) ;;
    PermissionRequest: | PermissionRequest:AskUserQuestion | PermissionRequest:ExitPlanMode) exit 0 ;;
    PermissionRequest:*) ;;
    *) exit 0 ;;
  esac
  case "$url" in https://*/api/claude-hook\?*) ;; *) exit 0 ;; esac
  base="${url%%/api/claude-hook*}/api/claude-ask?${url#*\?}"
  here="$state/here-$(printf '%s' "$url" | cksum | cut -d' ' -f1)"
  seen=0
  [ -f "$here" ] && read -r seen < "$here"
  case "$seen" in '' | *[!0-9]*) seen=0 ;; esac
  [ "$(($(date +%s) - seen))" -lt 60 ] && exit 0
  r=$({
    printf '%s' "$j"
    printf '\n#relay-title\n'
    title_of "$j"
    printf '\n#relay-v\n%s\n' "$version"
  } | curl -s -m 4 -w '\n%{http_code}' -H 'content-type: text/plain' --data-binary @- "$base")
  case "$r" in *204) mkdir -p "$state" 2>/dev/null && date +%s > "$here" ;; esac
  id=$(printf '%s' "$r" | grep -oE '"id":"[0-9a-f-]{36}"' | cut -d'"' -f4)
  [ -n "$id" ] || exit 0
  end=$(($(date +%s) + 600))
  fails=0
  while [ "$(date +%s)" -lt "$end" ]; do
    r=$(curl -s -m 30 "$base&id=$id")
    a=$(printf '%s' "$r" | grep -oE '"a":"[a-z]+"' | head -n 1 | cut -d'"' -f4)
    case "$a" in
      allow | deny) reply "$ev" "$a" "$r" ;;
      gone) exit 0 ;;
      open) fails=0 ;;
      *)
        fails=$((fails + 1))
        [ "$fails" -ge 3 ] && exit 0
        sleep 3
        ;;
    esac
  done
  exit 0
}

clock() {
  date -r "$1" +%H:%M 2>/dev/null || date -d "@$1" +%H:%M 2>/dev/null
}

if [ "$1" = "statusline" ] || [ "$1" = "limits" ]; then
  j=$(cat)
  save_limits "$j"
  save_ctx "$j"
  [ "$1" = "limits" ] && exit 0
  line=$(field "$j" display_name)
  ctx=$(printf '%s' "$j" | grep -oE '"context_window":\{[^}]*' | grep -oE '"used_percentage":[0-9.]+' | head -n 1 | cut -d: -f2)
  [ -n "$ctx" ] && line="${line:+$line · }контекст ${ctx%.*}%"
  if [ -n "$p5" ]; then
    at=$(clock "$r5")
    line="${line:+$line · }5 год ${p5%.*}%${at:+ до $at}"
  fi
  [ -n "$p7" ] && line="${line:+$line · }тиждень ${p7%.*}%"
  printf '%s\n' "${line:-Relay}"
  exit 0
fi

url=""
if [ "$1" = "--url" ]; then
  url=$2
  shift 2
fi
if [ -z "$url" ]; then
  f="${RELAY_HOOK_FILE:-${XDG_CONFIG_HOME:-$HOME/.config}/relay/hook-url}"
  url=$(head -n 1 "$f" 2>/dev/null)
fi
case "$url" in
  https://*/api/claude-hook* | http://127.0.0.1:*/api/claude-hook*) ;;
  *) cat >/dev/null; exit 0 ;;
esac
[ "$1" = "ask" ] && ask
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
        title_of "$j"
        ;;
      usage)
        usage "$j"
        ;;
      limits)
        [ -f "$state/limits" ] && printf '\n#relay-limits\n' && head -c 400 "$state/limits"
        ;;
    esac
  done
  printf '\n#relay-v\n%s\n' "$version"
} | curl -s -m 5 -o /dev/null -H 'content-type: text/plain' --data-binary @- "$url"
exit 0

#!/bin/sh
# Agent Lounge for Claude Code: forwards a hook's JSON to an Agent Lounge café, with extras after marker lines.
# Async, silent, exits 0.
#   relay.sh [--url URL] [roster] [title] [usage] [limits]   hook, JSON on stdin
#   relay.sh [--url URL] ask                                  PermissionRequest, and PreToolUse of a question or a plan:
#                                                             the only hooks Claude waits for
#   relay.sh [--url URL] away on|off|status                   «я не за комп'ютером», switched on only from here
#   relay.sh [--url URL] pair [new]                           a link that lets a phone answer for this computer
#   relay.sh statusline                                       statusLine command: keeps limits and context, prints a line
#   relay.sh limits                                           the same, silent, for chaining after another statusLine
# Without --url the café link comes from ~/.config/relay/hook-url (written by /agent-lounge:connect).
# Token counts and the last limits are kept in ~/.local/state/relay; nothing leaves this machine but the café's own events.
# The room key goes in a header, not in the address, which servers keep in their logs.
state="${RELAY_STATE:-${XDG_STATE_HOME:-$HOME/.local/state}/relay}"
conf="${XDG_CONFIG_HOME:-$HOME/.config}/relay"
keyfile="${RELAY_ANSWER_KEY:-$conf/answer-key}"
version=6

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

# A permission prompt gets PermissionRequest's answer; a question or a plan gets PreToolUse's, with $3: Claude's own
# input as the paired phone passed it back, the question's answers added or the plan as Claude wrote it.
reply() {
  if [ "$1" = PermissionRequest ]; then
    m=""
    [ "$2" = deny ] && m=',"message":"The user denied this from the Agent Lounge café."'
    printf '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"%s"%s}}}' "$2" "$m"
    exit 0
  fi
  if [ "$2" = deny ]; then
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",%s}}' \
      '"permissionDecisionReason":"The user rejected this plan in Agent Lounge. Stay in plan mode and revise it."'
    exit 0
  fi
  [ -n "$3" ] &&
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","updatedInput":%s}}' "$3"
  exit 0
}

# Splits the room key off the café link: it goes in a header, so the address that servers log never holds it.
split_key() {
  key=""
  case "$url" in *\?*) ;; *) return 0 ;; esac
  q="${url#*\?}"
  key=$(printf '%s' "$q" | tr '&' '\n' | sed -n 's/^k=//p' | head -n 1)
  rest=$(printf '%s' "$q" | tr '&' '\n' | grep -v '^k=' | paste -sd '&' -)
  url="${url%%\?*}${rest:+?$rest}"
}

# post URL [curl options…]: curl with the room key's header when there is one
post() {
  u=$1
  shift
  if [ -n "$key" ]; then curl -H "x-relay-key: $key" "$@" "$u"; else curl "$@" "$u"; fi
}

# openssl 3 prints «SHA2-256(stdin)= …», LibreSSL just the hex; Windows' openssl.exe (Git Bash) ends lines with \r
hex256() {
  openssl dgst -sha256 "$@" | awk '{ sub(/\r$/, ""); print $NF }'
}

# The secret this computer shares only with the phones it was paired with (relay.sh pair). It never leaves the
# machine except in the pairing link; the café keeps only signatures made with it.
answer_key() {
  k=$(head -n 1 "$keyfile" 2>/dev/null)
  case "$k" in '' | *[!0-9a-f]*) return 1 ;; esac
  [ "${#k}" -eq 64 ] || return 1
  printf '%s' "$k"
}

new_answer_key() {
  command -v openssl >/dev/null 2>&1 || return 1
  mkdir -p "$(dirname "$keyfile")" || return 1
  k=$(openssl rand -hex 32 | tr -d '\r')
  [ "${#k}" -eq 64 ] || return 1
  (umask 077 && printf '%s\n' "$k" > "$keyfile.tmp") && mv -f "$keyfile.tmp" "$keyfile"
}

kid_of() {
  printf '%s' "$1" | hex256 | cut -c1-16
}

# «Я не за комп'ютером» lives here, on this machine: the café can switch it off, never on.
away_on() {
  [ -f "$state/away-until" ] || return 1
  read -r t < "$state/away-until"
  case "$t" in '' | *[!0-9]*) return 1 ;; esac
  [ "$(date +%s)" -lt "$t" ]
}

# Every answer that came from the café, kept on this machine; /agent-lounge:status shows the last ones.
note() {
  mkdir -p "$state" 2>/dev/null || return 0
  printf '%s %s %s %s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" "$2" "$3" "$4" >> "$state/answers.log"
  n=$(wc -l < "$state/answers.log" | tr -d ' ')
  [ "$n" -gt 500 ] && tail -n 200 "$state/answers.log" > "$state/answers.tmp" &&
    mv -f "$state/answers.tmp" "$state/answers.log"
  return 0
}

# Only while you have turned on «я не за комп'ютером» on this computer (relay.sh away on) does it answer: the café
# shows the request, the question or the plan, waits up to 10 minutes for your answer there, and gives Claude that,
# if a phone paired with this computer signed it over exactly what this script sent. Otherwise, after those 10
# minutes, or on any failure it prints nothing, and the terminal asks as usual. Never «always allow», never a
# changed command. When the café says you are back, the switch here goes off too.
ask() {
  j=$(cat)
  ev=$(field "$j" hook_event_name)
  tool=$(field "$j" tool_name)
  case "$ev:$tool" in
    PreToolUse:AskUserQuestion | PreToolUse:ExitPlanMode) ;;
    PermissionRequest: | PermissionRequest:AskUserQuestion | PermissionRequest:ExitPlanMode) exit 0 ;;
    PermissionRequest:*) ;;
    *) exit 0 ;;
  esac
  case "$url" in https://*/api/claude-hook*) ;; *) exit 0 ;; esac
  [ -n "$key" ] && away_on || exit 0
  command -v openssl >/dev/null 2>&1 || exit 0
  ak=$(answer_key) || exit 0
  base="${url%%/api/claude-hook*}/api/claude-ask${url#*/api/claude-hook}"
  case "$base" in *\?*) sep='&' ;; *) sep='?' ;; esac
  r=$({
    printf '%s' "$j"
    printf '\n#relay-title\n'
    title_of "$j"
    printf '\n#relay-v\n%s\n' "$version"
    printf '\n#relay-kid\n%s\n' "$(kid_of "$ak")"
  } | post "$base" -s -m 4 -w '\n%{http_code}' -H 'content-type: text/plain' --data-binary @-)
  case "$r" in *204) rm -f "$state/away-until" && exit 0 ;; esac
  id=$(printf '%s' "$r" | grep -oE '"id":"[0-9a-f-]{36}"' | cut -d'"' -f4)
  [ -n "$id" ] || exit 0
  sum=$(printf '%s' "$j" | hex256)
  end=$(($(date +%s) + 600))
  fails=0
  while [ "$(date +%s)" -lt "$end" ]; do
    r=$(post "$base${sep}id=$id" -s -m 30)
    a=$(printf '%s' "$r" | grep -oE '^\{"a":"[a-z]+"' | cut -d'"' -f4)
    case "$a" in
      allow | deny)
        s=$(printf '%s' "$r" | sed -n 's/^{"a":"[a-z]*","s":"\([0-9a-f]\{64\}\)".*/\1/p')
        u=$(printf '%s' "$r" | sed -n 's/^{"a":"[a-z]*","s":"[0-9a-f]*","u":\(.*\)}$/\1/p')
        if [ -z "$s" ] || [ "$s" != "$(printf '%s:%s:%s:%s' "$id" "$a" "$sum" "$u" | hex256 -hmac "$ak")" ]; then
          note "$ev" "$tool" "$a" "unsigned:$id"
          exit 0
        fi
        note "$ev" "$tool" "$a" "$id"
        reply "$ev" "$a" "$u"
        ;;
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

clip_copy() {
  if command -v pbcopy >/dev/null 2>&1; then pbcopy
  elif [ -n "$WAYLAND_DISPLAY" ] && command -v wl-copy >/dev/null 2>&1; then wl-copy
  elif command -v xclip >/dev/null 2>&1; then xclip -selection clipboard
  elif command -v xsel >/dev/null 2>&1; then xsel -b
  elif command -v clip.exe >/dev/null 2>&1; then clip.exe
  else return 1
  fi
}

# relay.sh pair: a link to open on the phone you will answer from; it carries this computer's answer key in the
# part after #, which the browser keeps to itself. The link goes to the clipboard; it is printed (with a QR code
# when qrencode is installed) only to a terminal, never into a log or Claude's context. `pair new` makes a fresh
# key, which unpairs every phone.
pair() {
  case "$url" in https://*/api/claude-hook*) ;; *) echo "pair: not-connected"; exit 1 ;; esac
  command -v openssl >/dev/null 2>&1 || { echo "pair: no-openssl"; exit 1; }
  if [ "$1" = new ] || ! answer_key >/dev/null; then
    new_answer_key || { echo "pair: failed"; exit 1; }
    echo "key: new"
  fi
  ak=$(answer_key)
  link="${url%%/api/claude-hook*}/#pair=$ak"
  echo "kid: $(kid_of "$ak")"
  if printf '%s' "$link" | clip_copy 2>/dev/null; then echo "link: copied"; else echo "link: no-clipboard"; fi
  if [ -t 1 ]; then
    echo "$link"
    command -v qrencode >/dev/null 2>&1 && qrencode -t ansiutf8 "$link"
  fi
  exit 0
}

away() {
  case "$url" in https://*/api/claude-hook*) ;; *) echo "away: not-connected"; exit 1 ;; esac
  base="${url%%/api/claude-hook*}/api/claude-away${url#*/api/claude-hook}"
  case "$1" in
    on)
      answer_key >/dev/null || { new_answer_key && echo "key: new"; } || { echo "away: no-openssl"; exit 1; }
      code=$(printf 'on' | post "$base" -s -m 8 -o /dev/null -w '%{http_code}' --data-binary @-)
      if [ "$code" != 200 ]; then
        echo "away: off"
        echo "cafe: ${code:-000}"
        exit 1
      fi
      mkdir -p "$state" && printf '%s\n' "$(($(date +%s) + 43200))" > "$state/away-until"
      echo "away: on"
      echo "until: $(clock "$(($(date +%s) + 43200))")"
      echo "kid: $(kid_of "$(answer_key)")"
      ;;
    off)
      rm -f "$state/away-until"
      code=$(printf 'off' | post "$base" -s -m 8 -o /dev/null -w '%{http_code}' --data-binary @-)
      echo "away: off"
      echo "cafe: ${code:-000}"
      ;;
    *)
      if away_on; then
        read -r t < "$state/away-until"
        echo "away: on"
        echo "until: $(clock "$t")"
      else
        echo "away: off"
      fi
      if answer_key >/dev/null; then echo "kid: $(kid_of "$(answer_key)")"; else echo "kid: none"; fi
      ;;
  esac
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
  # the terminal's own language: Ukrainian or Russian locales read Ukrainian, any other English
  case "${LC_ALL:-${LC_MESSAGES:-${LANG:-}}}" in
    uk* | ru*) w_ctx="контекст" w_5h="5 год" w_till="до" w_week="тиждень" ;;
    *) w_ctx="context" w_5h="5h" w_till="till" w_week="week" ;;
  esac
  line=$(field "$j" display_name)
  ctx=$(printf '%s' "$j" | grep -oE '"context_window":\{[^}]*' | grep -oE '"used_percentage":[0-9.]+' | head -n 1 | cut -d: -f2)
  [ -n "$ctx" ] && line="${line:+$line · }$w_ctx ${ctx%.*}%"
  if [ -n "$p5" ]; then
    at=$(clock "$r5")
    line="${line:+$line · }$w_5h ${p5%.*}%${at:+ $w_till $at}"
  fi
  [ -n "$p7" ] && line="${line:+$line · }$w_week ${p7%.*}%"
  printf '%s\n' "${line:-Agent Lounge}"
  exit 0
fi

url=""
if [ "$1" = "--url" ]; then
  url=$2
  shift 2
fi
if [ -z "$url" ]; then
  f="${RELAY_HOOK_FILE:-$conf/hook-url}"
  url=$(head -n 1 "$f" 2>/dev/null)
fi
# away and pair also find a café the hooks in settings.json post to (the connect page's install)
if [ -z "$url" ] && { [ "$1" = away ] || [ "$1" = pair ]; }; then
  settings="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/settings.json"
  url=$(grep -oE -e "--url '[^']+/api/claude-hook[^']*'" "$settings" 2>/dev/null | head -n 1 | cut -d"'" -f2)
fi
case "$url" in
  https://*/api/claude-hook* | http://127.0.0.1:*/api/claude-hook*) ;;
  *)
    [ "$1" = away ] || [ "$1" = pair ] && { echo "$1: not-connected"; exit 1; }
    cat >/dev/null
    exit 0
    ;;
esac
split_key
[ "$1" = "ask" ] && ask
[ "$1" = "pair" ] && pair "$2"
[ "$1" = "away" ] && away "$2"
if [ $# -eq 0 ]; then
  post "$url" -s -m 3 -o /dev/null -H 'content-type: application/json' --data-binary @-
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
} | post "$url" -s -m 5 -o /dev/null -H 'content-type: text/plain' --data-binary @-
exit 0

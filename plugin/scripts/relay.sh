#!/bin/sh
# Agent Lounge for Claude Code: forwards a hook's JSON to an Agent Lounge café, with extras after marker lines.
# Async, silent, exits 0.
#   relay.sh [--url URL] [roster] [title] [usage] [limits] [eta]   hook, JSON on stdin
#   relay.sh [--url URL] checkin                              UserPromptSubmit, and PostToolUse of a subagent: now and
#                                                             then asks Claude how long its whole job still takes, and
#                                                             while you are away, to ask you in options
#   relay.sh [--url URL] ask                                  PermissionRequest, and PreToolUse of a question or a plan:
#                                                             the only hooks Claude waits for
#   relay.sh [--url URL] answered                             PostToolUse: after a prompt you answered, says so
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
version=8

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
# input as the paired phone passed it back, the question's answers added or the plan as Claude wrote it. A denial's
# $3 is what the user wrote with it, a JSON string as the phone signed it, or nothing.
reply() {
  said=""
  case "$2:$3" in deny:\"*\") said=${3#\"} && said=${said%\"} ;; esac
  if [ "$1" = PermissionRequest ]; then
    m=""
    [ "$2" = deny ] && m=',"message":"The user denied this from the Agent Lounge café.'"${said:+ They wrote: $said}"'"'
    printf '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"%s"%s}}}' "$2" "$m"
    exit 0
  fi
  if [ "$2" = deny ]; then
    printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",%s%s"}}' \
      '"permissionDecisionReason":"The user rejected this plan in Agent Lounge. Stay in plan mode and revise it.' \
      "${said:+ They wrote: $said}"
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

# «Я не за комп'ютером» lives here, on this machine: the café can switch it off, never on. `away always` keeps it
# on for good: then «я повернувся» in the café only sends the question waiting now to the terminal.
always_on() {
  [ -f "$conf/away-always" ]
}

away_on() {
  always_on && return 0
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

# Only while you have turned on «я не за комп'ютером» on this computer (relay.sh away on, or away always) does it
# answer: the café shows the request, the question or the plan, waits up to 10 minutes for your answer there, and
# gives Claude that, if a phone paired with this computer signed it over exactly what this script sent. Otherwise,
# after those 10 minutes, or on any failure it prints nothing, and the terminal asks as usual. Never «always allow»,
# never a changed command. When the café says you are back, the switch here goes off too, unless it is on always.
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
  open_ask() {
    {
      printf '%s' "$j"
      printf '\n#relay-title\n'
      title_of "$j"
      printf '\n#relay-v\n%s\n' "$version"
      printf '\n#relay-kid\n%s\n' "$(kid_of "$ak")"
    } | post "$base" -s -m 4 -w '\n%{http_code}' -H 'content-type: text/plain' --data-binary @-
  }
  r=$(open_ask)
  # the café has its owner back: switch off here too, unless away is on for good, which turns the café's side on again
  case "$r" in
    *204)
      always_on || { rm -f "$state/away-until" && exit 0; }
      away_base="${url%%/api/claude-hook*}/api/claude-away${url#*/api/claude-hook}"
      [ "$(printf 'on' | post "$away_base" -s -m 4 -o /dev/null -w '%{http_code}' --data-binary @-)" = 200 ] || exit 0
      r=$(open_ask)
      ;;
  esac
  id=$(printf '%s' "$r" | grep -oE '"id":"[0-9a-f-]{36}"' | cut -d'"' -f4)
  [ -n "$id" ] || exit 0
  # the café shows it as waiting on you now, and Claude Code sends no Notification for a prompt this hook answers
  mark_wait "$j"
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

# How often a chat running subagents is asked how long its whole job still takes, in minutes; 0 switches it off.
every="${RELAY_CHECKIN:-20}"
case "$every" in '' | *[!0-9]*) every=20 ;; esac
# A chat that sent out no subagent for this long is no pipeline any more, and isn't asked.
quiet_s=10800

# relay.sh checkin: the café can only see the agents that run now, never the rounds Claude hasn't started yet, so
# while a chat runs subagents it asks Claude itself, at most every $every minutes and only at a turn it takes anyway
# (a prompt, a subagent's result), to end its reply with a line like «⏱ 95m · 6/10 · QA on iOS». The request is
# context only Claude sees; the line is in its reply, and checkin_line sends it to the café. This is the one hook
# Claude waits for on every pipeline, so it stays on this machine and posts nothing. Its state: the last subagent,
# the last request, when a line last went to the café, that line's time, and 1 when it said the job was done: then
# Claude isn't asked again until it sends out another subagent.
checkin() {
  j=$(cat)
  ev=$(field "$j" hook_event_name)
  ctx=$(away_hint "$j")
  ask=$(checkin_ask "$j")
  ctx="$ctx${ctx:+${ask:+ }}$ask"
  [ -n "$ctx" ] && printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' "$ev" "$ctx"
  exit 0
}

# While you are away (relay.sh away on or always), a prompt also tells Claude that you answer from a phone, where only
# a question asked with its question tool reaches you, as options to tap; a question written into a reply would wait
# for you at the computer. A fixed sentence of this script, nothing from the café.
away_hint() {
  [ "$(field "$1" hook_event_name)" = UserPromptSubmit ] && [ -z "$(field "$1" agent_id)" ] && away_on || return 0
  h="Agent Lounge: the user is away from the computer and answers from a phone, where only questions asked with the"
  h="$h AskUserQuestion tool reach them, as options to tap. Whenever you need their decision or input, ask with"
  h="$h AskUserQuestion (2-4 options; the one you recommend first, its label ending in (Recommended)) instead of"
  h="$h ending your turn with a question in text."
  printf '%s' "$h"
}

# The check-in request when one is due, as text, or nothing; keeps its state in $state/checkin.
checkin_ask() {
  j=$1
  [ "$every" -gt 0 ] || return 0
  sid=$(safe "$(field "$j" session_id)")
  [ -n "$sid" ] && [ -z "$(field "$j" agent_id)" ] || return 0
  ev=$(field "$j" hook_event_name)
  mkdir -p "$state/checkin" 2>/dev/null || return 0
  f="$state/checkin/$sid"
  sub=0 asked=0 sent=0 said=- end=0
  [ -f "$f" ] && read -r sub asked sent said end < "$f"
  case "$sub:$asked:$sent" in *[!0-9:]* | :* | *::* | *:) sub=0 asked=0 sent=0 said=- ;; esac
  [ "$end" = 1 ] || end=0
  now=$(date +%s)
  [ "$ev" = PostToolUse ] && sub=$now
  [ "$end" = 1 ] && [ "$sub" -gt "$sent" ] && end=0
  if [ "$end" = 0 ] && [ $((now - sub)) -le "$quiet_s" ] && [ $((now - asked)) -ge $((every * 60)) ]; then
    asked=$now
    ask="Agent Lounge check-in (the user follows this pipeline in a café that shows when it will be done):"
    ask="$ask end your reply to this turn with one line in exactly this form:"
    ask="$ask ⏱ <minutes>m · <done>/<total> · <what runs now, a few words>."
    ask="$ask The minutes are your honest estimate until the WHOLE job is finished, counting every round still ahead"
    ask="$ask (fixes, reviews, QA, re-runs), not only the agents running now; done/total in whatever units fit"
    ask="$ask (bugs, screens, stages), or leave that part out. Write ⏱ 0m once everything is done."
    ask="$ask Nothing else about your work changes."
    printf '%s' "$ask"
  fi
  [ -f "$f" ] || find "$state/checkin" -type f -mtime +2 -delete 2>/dev/null
  printf '%s %s %s %s %s\n' "$sub" "$asked" "$sent" "${said:--}" "$end" > "$f"
}

# Claude asked for permission or asked a question in this chat: the agent that asked, kept until its tool goes through.
mark_wait() {
  sid=$(safe "$(field "$1" session_id)")
  [ -n "$sid" ] && mkdir -p "$state/waits" 2>/dev/null || return 0
  [ -f "$state/waits/$sid" ] || find "$state/waits" -type f -mtime +2 -delete 2>/dev/null
  printf '%s\n' "$(safe "$(field "$1" agent_id)")" > "$state/waits/$sid"
}

# relay.sh answered: a tool went through after Claude asked about it, so you answered, in the terminal or in the café.
# Only then does this post anything, and only the names, never the tool's output: the café's «чекає на тебе» goes
# away as you answer, not at Claude's next step.
answered() {
  j=$(cat)
  sid=$(safe "$(field "$j" session_id)")
  f="$state/waits/$sid"
  [ -n "$sid" ] && [ -f "$f" ] || exit 0
  read -r who < "$f"
  aid=$(safe "$(field "$j" agent_id)")
  [ "$who" = "$aid" ] || exit 0
  rm -f "$f"
  printf '{"hook_event_name":"PostToolUse","session_id":"%s","agent_id":"%s","agent_type":"%s","tool_name":"%s"}\n#relay-v\n%s\n' \
    "$sid" "$aid" "$(safe "$(field "$j" agent_type)")" "$(safe "$(field "$j" tool_name)")" "$version" |
    post "$url" -s -m 5 -o /dev/null -H 'content-type: text/plain' --data-binary @-
  exit 0
}

iso() {
  date -u -r "$1" +%Y-%m-%dT%H:%M:%S 2>/dev/null || date -u -d "@$1" +%Y-%m-%dT%H:%M:%S 2>/dev/null
}

# The newest «⏱ …» line in Claude's own replies in this chat that the café hasn't had yet, with the time Claude wrote
# it; a line from more than an hour before the last request belongs to some earlier job. Only for a chat that runs
# subagents; a tool call looks only while a check-in is still unanswered, an answer always. Prints the section, or
# nothing.
checkin_line() {
  [ -z "$(field "$1" agent_id)" ] || return 0
  sid=$(safe "$(field "$1" session_id)")
  t=$(field "$1" transcript_path)
  f="$state/checkin/$sid"
  [ -n "$sid" ] && [ -f "$f" ] && [ -f "$t" ] || return 0
  read -r sub asked sent said end < "$f"
  case "$sub:$asked:$sent" in *[!0-9:]* | :* | *::* | *:) return 0 ;; esac
  [ "$(field "$1" hook_event_name)" = Stop ] || [ "$asked" -gt "$sent" ] || return 0
  line=$(tail -c 524288 "$t" | LC_ALL=C awk -v after="$said" -v since="$(iso $((asked - 3600)))" '
    !index($0, "\"role\":\"assistant\"") || !index($0, "{\"type\":\"text\",\"text\":\"") || !index($0, "⏱") { next }
    !match($0, /"timestamp":"[0-9T:.Z-]+"/) { next }
    {
      ts = substr($0, RSTART + 13, RLENGTH - 14)
      if ((after != "-" && ts <= after) || ts < since) next
      at = 0
      while ((i = index(substr($0, at + 1), "⏱")) > 0) at += i
      s = substr($0, at, 300)
      if ((k = index(s, "\\n")) > 0) s = substr(s, 1, k - 1)
      for (q = 1; q <= length(s); q++) {
        c = substr(s, q, 1)
        if (c == "\\") q++
        else if (c == "\"") { s = substr(s, 1, q - 1); break }
      }
      best = ts "\t" s
    }
    END { if (best != "") print best }')
  [ -n "$line" ] || return 0
  printf '\n#relay-eta\n%s\n' "$line"
  rest=$(printf '%s' "${line##*⏱}" | sed 's/^[^0-9]*//')
  case "$rest" in 0 | 0[!0-9.,]*) end=1 ;; *) end=0 ;; esac
  printf '%s %s %s %s %s\n' "$sub" "$asked" "$(date +%s)" "${line%%	*}" "$end" > "$f"
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
    on | always)
      answer_key >/dev/null || { new_answer_key && echo "key: new"; } || { echo "away: no-openssl"; exit 1; }
      code=$(printf 'on' | post "$base" -s -m 8 -o /dev/null -w '%{http_code}' --data-binary @-)
      if [ "$code" != 200 ]; then
        echo "away: off"
        echo "cafe: ${code:-000}"
        exit 1
      fi
      if [ "$1" = always ]; then
        mkdir -p "$conf" && : > "$conf/away-always"
        echo "away: always"
      else
        mkdir -p "$state" && printf '%s\n' "$(($(date +%s) + 43200))" > "$state/away-until"
        echo "away: on"
        echo "until: $(clock "$(($(date +%s) + 43200))")"
      fi
      echo "kid: $(kid_of "$(answer_key)")"
      ;;
    off)
      rm -f "$state/away-until" "$conf/away-always"
      code=$(printf 'off' | post "$base" -s -m 8 -o /dev/null -w '%{http_code}' --data-binary @-)
      echo "away: off"
      echo "cafe: ${code:-000}"
      ;;
    *)
      if always_on; then
        echo "away: always"
      elif away_on; then
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
[ "$1" = "checkin" ] && checkin
[ "$1" = "ask" ] && ask
[ "$1" = "answered" ] && answered
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
      eta)
        checkin_line "$j"
        ;;
      waits)
        case "$(field "$j" notification_type):$(field "$j" message)" in
          auth_success:*) ;;
          permission_prompt:* | *[Pp]ermission*) mark_wait "$j" ;;
        esac
        ;;
    esac
  done
  printf '\n#relay-v\n%s\n' "$version"
} | post "$url" -s -m 5 -o /dev/null -H 'content-type: text/plain' --data-binary @-
exit 0

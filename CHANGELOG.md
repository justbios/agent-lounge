# Changelog

The plugin's `version` in `plugin/.claude-plugin/plugin.json` is what Claude Code compares when it looks for an update:
bump it, together with `package.json`, in every release that changes `plugin/`, then run `npm run plugin:pack` and tag
the commit `vX.Y.Z`.

## 0.13.0 — not released yet

Ship the code together with `supabase/migrations/0023_ask_words.sql`; reconnect to get `relay.sh` 8 and its hooks.

- Answer Claude from the café in your own words. Each question has a «свій варіант» field: in a single-choice
  question it takes the option's place, in a multiple-choice one it comes after the options, and Claude gets
  «option, option, your text». A «no» to a permission or a plan can say why or what to change, and Claude reads it
  after the fixed denial sentence. Both are signed like every answer, at most 1000 characters, and only `relay.sh` 8
  passes a note on; the new `relay_ask_answer` and `relay_ask_reply` check their shape.
- `/agent-lounge:away always` keeps «я не за комп'ютером» on until `away off`, so every question goes to the café
  first. «Я повернувся» then sends only the question waiting at that moment back to the terminal.
- The answer card is simpler and wears the café's pixel look: one question at a time (the one waiting longest, with
  how many more are behind it), big option buttons, the option Claude recommends marked «★ радить Claude» instead of
  its «(Recommended)», and your own answer or a note behind a small ✎ link until you want it.
- While you are away, each prompt you send also tells Claude that you answer from a phone, so it asks with its
  question tool, options and its pick first, instead of ending its turn with a question in text that the café can't
  answer. It is a fixed sentence of `relay.sh`, added by the local check-in hook.
- One board of all chats above the café: the ones that wait on you on top, then a turn that broke off, your turn,
  busy, and the rest, each with what it did last; a click opens the chat. While Claude waits on you anywhere, the
  board's first line turns into a yellow «Claude чекає на тебе» plate that stays until you answer.
- «Чекає на тебе» goes away the moment you answer, in the terminal too, not at Claude's next step: a `Notification`
  about a permission or a question leaves a mark on the computer, and a new async `PostToolUse` hook
  (`relay.sh answered`) posts the chat's, agent's and tool's names once that agent's tool goes through. Nothing else
  of the tool leaves the computer.
- Its own sound: a three-note doorbell when Claude waits on you, rung twice more after 3 and 6 minutes if nobody
  answered; two notes up for an answer, two down for a turn that broke off.
- Fixed: the English café showed what Claude waits on in Ukrainian, and a turn that broke off on the limit or an error
  was flagged as a green «your turn»; it is red now.
- When your limits run out: each gauge carries a faint stretch up to where the window stands at its reset at this pace,
  red when it runs out first, and the day recap says it in words («у темпі останньої години закінчиться о 16:40, за
  1 год до скидання» or «вистачить до скидання, буде близько 64%»). The 5-hour window goes by the last hour of
  snapshots and says nothing while Claude rests; the week goes by its average since it began. Everything comes from
  the snapshots the status line already sends; `SubagentStop` now sends them too, so a long pipeline stays fresh.
- A ping when a limit window starts over, if it was at least 70% full or Claude had run into it: a green toast in the
  café, a four-note chime with the sound on, and a notification with desktop notifications or push on. It comes only
  while a café tab is open, which shows the notification itself: nothing reaches the server at that moment, so a push
  to a closed phone would need a scheduled job.
- Who started whom: an agent's card names the agent that started it («↑ запустив bug-fixer», a click opens that card)
  and shows, nested, every subagent it started in the last 3 hours with what each does now, up to 8 rows.
- «!» when an agent goes in circles or runs late. In circles: the same step failed three times among its last ten
  actions, or the same command, search or page came back five times, the last of them in the past 15 minutes. Late:
  the job runs past Claude's own `⏱` estimate by 15 minutes or half of it, whichever is more, while the chat isn't
  silent. The warning shows on the agent's name plate or bubble, on the board of chats and in the list of agents,
  and the card says what repeats. A new one rings two uneasy notes twice and sends a notification with desktop
  notifications or push on. The café works it out in the browser every 15 seconds, so no push reaches a closed
  phone.
- Cost and context in each agent's card: what its tokens would cost at API prices («≈ $1.44 · Opus 5.5 · 99% витрат
  чату», «≥» when some of them came without a model), how much context it has used and has left, and the tokens split
  into input, cache write, cache read and output. On Pro or Max this is no bill but a share of the limit. `relay.sh`
  now adds the model's id (`claude-…`) to its token counts; nothing else of the transcript leaves the computer.

## 0.12.0 — not released yet

- The pipeline's time comes from Claude itself. `relay.sh` 7 adds a check-in: while a chat runs subagents, a local,
  synchronous hook on `UserPromptSubmit` and on the Agent tool's `PostToolUse` asks Claude at most every 20 minutes
  (`RELAY_CHECKIN`, 0 turns it off) to end its reply with `⏱ <minutes>m · <done>/<total> · <what now>`, its estimate of
  the whole job. `PreToolUse` and `Stop` send the newest such line, and only it, to the café, which counts down from
  it. Before, the time saw only the agents working at that moment, so a pipeline of rounds looked minutes from done
  for hours. Reconnect to get the new hooks.
- Games for two look and sound better: pieces slide into place, captures burst in sparks, a king in check glows red,
  a win or lose finale, a proper air-hockey table, an arcade Pong, chiptune sounds made with Web Audio, and a sound
  switch next to full screen. Chess and draughts keep the plain pixel pieces and flat board they came with, now in a
  frame that has the files and ranks round it and turns gold on your move.
- Play again: when a game ends, «ще раз» asks the same opponent for another round of it without going back to the
  list. They answer on the board, or in the invite if they closed it; if both press it at once, they land in the same
  game. The invite carries an `again` field that older cafés ignore.
- Chess and draughts on a clock, as in blitz: pick 1, 2, 3, 5 or 10 minutes a side above the invite buttons. A clock
  runs only on its side's move, from White's first move on, and whoever runs out first loses. Each screen times its
  own player and sends each move's cost with the move, so the delay on the way is never charged; a side that has gone
  quiet is called out 3 seconds past zero by the other screen. The invite and its accept carry `clock`, and a café
  without clocks leaves it out of its accept, so neither side times that game. A rematch keeps the clock.
- Fixed: over a finished game whose board was still open, a new invite (not a rematch) never showed.

## 0.10.0 — not released yet

Security release; ship the code together with `supabase/migrations/0021_security.sql`.

- Answers from the café are signed. `relay.sh` 6 keeps an answer key on the computer; `/agent-lounge:away pair`
  hands it to a phone through a `#pair=` link. The phone signs each answer over the exact request the computer sent,
  and the computer checks it, so neither the server nor anyone with the café key can answer Claude for you or change
  the command or plan you see. Scripts older than 6 no longer get answers from the café: reconnect.
- «Я не за комп'ютером» is switched on only on the computer (`/agent-lounge:away on`); the café can only switch it
  off. New skill `/agent-lounge:away`; `/agent-lounge:status` shows the switch and the last answers.
- Permission prompts show the whole command, and a write's or an edit's content, instead of a shortened line; a
  request longer than 4000 characters is asked in the terminal.
- The room key travels in an `x-relay-key` header instead of the URL (HTTP hooks too). `?k=` still works.
- Room feeds are private Realtime channels that browsers can only listen to: nobody can inject events into a café.
- The old pipeline tables from 0001/0002 are closed to the public key (their ingest tokens were readable), and the
  unused code for them (`/api/ingest`, `/api/projects`, `orchestrator/`, `scripts/relay-hook.mjs`) is removed.
- Caps: 600 events per room per minute, 200 new rooms per hour. Asks lose their text after a day and go after 30 days.
- The local café answers only requests addressed to 127.0.0.1/localhost without a foreign Origin, and only when
  started by `npm run live`, `npm run up` or a dev server.
- Content-Security-Policy and other security headers on every page. See `SECURITY.md`.

## 0.9.0 — not released yet

- Renamed from Relay to Agent Lounge. The plugin is now `agent-lounge@agent-lounge` and its commands are
  `/agent-lounge:connect` and `/agent-lounge:status`. If you installed `relay@relay`, uninstall it and install the new
  one. Database objects (`relay_*`), browser storage keys (`relay.*`), `~/.config/relay` and `relay.sh` keep their old
  names, so existing cafés and hooks keep working.
- Licensed under Apache-2.0. Third-party games keep their own licences; see `THIRD_PARTY_NOTICES.md`.
- Removed Nova the Squirrel from the console: its graphics and levels are licensed for non-commercial use only.
- The plugin now has a version, so `/plugin marketplace update` delivers new releases.

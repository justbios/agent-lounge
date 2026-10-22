# Changelog

The plugin's `version` in `plugin/.claude-plugin/plugin.json` is what Claude Code compares when it looks for an update:
bump it, together with `package.json`, in every release that changes `plugin/`, then run `npm run plugin:pack` and tag
the commit `vX.Y.Z`.

## 0.15.0 — not released yet

No database change: the costumes are kept in the lobby's own room settings.

- Halloween week, 22 October to 1 November (`lib/live/season.ts`): an orange moon, bats and a hill of gravestones and
  pumpkins outside every window, whatever the café's theme; a black cat with glowing eyes instead of the ginger one;
  guests at the bar and the courier in costumes; and «Танець скелетів» on the jukebox, with the wind behind it. Each
  viewer can switch it off in the café's settings or with a click on the window, and turn it back on the same way.
- The shop sells Halloween pieces until 1 November, and what was bought stays: a jack-o'-lantern for the windowsill,
  a cobweb with a spider and a garland of bats for the ceiling, a bubbling cauldron for the floor.
- Costumes: a witch's hat, a pumpkin head, a ghost's sheet, a vampire's cape and devil's horns with a tail. Each is one
  per room; once bought, anyone with a key can put it on any agent from its card, in the lobby, in their own room or
  in a teammate's, and everyone sees it, the agent's owner too. They are kept in the lobby under the teammate and the
  agent (`dressKey` in `lib/live/interior.ts`), so a costume follows the agent into every room and onto the house's
  floors.
- The disco ball hangs from the ceiling now, anywhere up high and in front of the windows and the sign. It used to
  go on the wall between the fixtures, where a small café has room for it in one narrow slot under a sconce, and
  the bar said to click on the floor. Wall pieces now say to click on the wall, and a piece on a windowsill or in
  front of a window opens its own menu on a click instead of changing the view outside.
- Games for two and three are picked as tiles now: each game with its sign, a few words on how it is won and how many
  can play. Pick a game, then one person, or two for cables and sumo, and send the invite; chess and checkers ask for
  the clock right there. The long «Як грати» at the bottom of the games is gone; the Dendy's keys are one line under
  its screen, and who made its games folds away under it.
- «Лови чашки» is gone from the games: the games for two and three take the whole width. Its old scores stay in the
  database and are no longer shown.
- The top bar shows the pixel cup of the app's icon instead of a radio, and a green, lit «підключено» once Claude
  reports to the café, where there was a bare plug.

## 0.14.0 — not released yet

No database change. Everyone in a café should reload it: an open tab from before can't play air hockey, ping-pong or
cables with a new one.

- Real-time games without the lag. Air hockey, ping-pong and cables play as rollback, the way fighting games are played
  online: your own mallet, paddle or turn shows at once, and the others' moves are guessed from their last one until
  they arrive, then quietly put right. Before, every turn in cables waited 300 ms and the puck was handed from screen to
  screen, so hits landed late. Every screen plays the same game from the same inputs (`lib/live/rollback.ts`,
  `lib/live/netplay.ts`), compares a checksum with the others every second and takes over the first player's game if
  it ever drifts.
- The players' browsers link up directly over WebRTC when the network lets them (`lib/live/gameLink.ts`): a few ms on
  one network instead of 50–250 ms through the server. Otherwise the moves go through the server as before. The corner
  of the field says which, and how many ms away the others are.
- Games for three: «удвох / утрьох» in the lobby, tick two guests and pick cables or sumo; the game starts once both
  said yes, and whoever invited asks for another round. Cables for three come out of three walls.
- New: sumo for two or three on an ice floe that melts as the round goes on. Steer with the mouse, a finger or the
  keys, dash with a click, a tap or space, and push the others into the sea; the last one on the floe takes the round.
- New: four in a row for two, turn by turn like tic-tac-toe, each disc falling down its column.
- A dev build takes `?lag=ms,jitter,loss` on the address to play the games over a made-up bad line.
- A home-screen app on iPhone can be paired too: it opens no links and keeps its own storage, so the pairing link
  from `relay.sh pair` can now be pasted in «сповіщення» under «Я не за комп'ютером», or right on a request this
  browser can't answer yet. The connect page's phone step says how to pair.

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
- Names and looks follow the agent, not the desk: they are kept under the agent's type, so a bug-fixer looks the same
  at any desk and in every chat, and a second one at work wears the same with a «2» after its name. A look kept by
  desk number before stays until that agent is first dressed again, then moves to it.
- An agent can be a robot, a cat or an alien besides a person, each with its own shades of metal, fur or hide; robots'
  eyes and antennas take the agent's colour. The café's «кав'ярня» window has an «Агенти» section to name and dress
  every agent of the chat at once, with each one drawn beside it. The name shows over the desk, in bubbles, the card,
  the agent list and the time panel; character packs change only clothes, keeping kind, skin and name.
- Not only Claude: Codex, Copilot CLI, Gemini CLI and OpenCode sit at the tables too, and Cursor's chats come along
  when it runs Claude Code's hooks, which it does by default. The connect page has an «Інші агенти» step with a phrase
  for each, which that agent carries out itself: `relay.sh` hooks in `~/.codex/hooks.json`,
  `~/.copilot/hooks/agent-lounge.json` or `~/.gemini/settings.json`, and a plugin file for OpenCode. `relay.sh` names
  the agent after a `#relay-agent` line, posts in the background for Copilot and Gemini, which wait on every hook, and
  prints `{}` for Gemini; the café puts their hooks, tools and inputs into Claude Code's words
  (`lib/live/normalize.ts`) and knows Cursor by its `cursor_version`. Their main agent goes by its own name and look,
  the board of chats marks the chat, and pings say «Codex чекає на тебе». Codex's permission requests can be approved
  from a phone like Claude's. Copilot and Gemini only show that they wait: Copilot's permission hook runs on every
  check, and Gemini's hooks can deny a tool but not allow one. OpenCode can't be answered from the café yet, and none
  of them sends tokens or limits.

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

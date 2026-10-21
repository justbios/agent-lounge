# Changelog

The plugin's `version` in `plugin/.claude-plugin/plugin.json` is what Claude Code compares when it looks for an update:
bump it, together with `package.json`, in every release that changes `plugin/`, then run `npm run plugin:pack` and tag
the commit `vX.Y.Z`.

## 0.12.0 — not released yet

- The pipeline's time comes from Claude itself. `relay.sh` 7 adds a check-in: while a chat runs subagents, a local,
  synchronous hook on `UserPromptSubmit` and on the Agent tool's `PostToolUse` asks Claude at most every 20 minutes
  (`RELAY_CHECKIN`, 0 turns it off) to end its reply with `⏱ <minutes>m · <done>/<total> · <what now>`, its estimate of
  the whole job. `PreToolUse` and `Stop` send the newest such line, and only it, to the café, which counts down from
  it. Before, the time saw only the agents working at that moment, so a pipeline of rounds looked minutes from done
  for hours. Reconnect to get the new hooks.
- Games for two look and sound better: framed pixel boards, pieces with shading that slide into place, sparks on
  captures and check, a win or lose finale, a proper air-hockey table, an arcade Pong, chiptune sounds made with Web
  Audio, and a sound switch next to full screen.
- Play again: when a game ends, «ще раз» asks the same opponent for another round of it without going back to the
  list. They answer on the board, or in the invite if they closed it; if both press it at once, they land in the same
  game. The invite carries an `again` field that older cafés ignore.

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

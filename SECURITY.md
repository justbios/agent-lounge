# Security

## Reporting a vulnerability

Please report security issues privately, through **Security → Report a vulnerability** on the GitHub repository
(private vulnerability reporting), not in a public issue. Say what an attacker can do and how to reproduce it. You can
expect a first answer within a week. Fixes go out in the newest release only; older releases are not patched.

## What Agent Lounge protects

Agent Lounge shows Claude Code activity in a web café, and while you are away it can pass Claude your answers to its
permission prompts, questions and plans. The parts and their trust:

| Who | Can | Cannot |
|---|---|---|
| Anyone on the internet | load the site, call the public RPCs with the public Supabase key | read or write any room without its key; read the old pipeline tables (closed in `0021_security.sql`); send on a room's Realtime channel |
| Anyone with a **view link** (`/#v=…`) | watch that café live | write to it, send events into it, answer Claude |
| Anyone with the **room key** (the hook link, `/#k=…`) | read the café, post events and chat into it, switch «я не за комп'ютером» **off** | switch it on, answer Claude for you, change what you are asked |
| The **server** (Vercel, Supabase, whoever runs the deploy) | see everything sent to it, including whole permission requests while you are away | make or alter an answer your computer will accept |
| A browser **paired** with your computer (`relay.sh pair`) **and** holding your personal room key | answer Claude's permission prompts, questions and plans from that computer, with words of its own in an answer or in a «no» | answer «always allow», change a command, a plan or an answer option |

### Answers to Claude

- «Я не за комп'ютером» is switched on only on the computer (`relay.sh away on`, `/agent-lounge:away on`). Without it
  the hook script never waits on the network. `relay.sh away always` (version 8) keeps it on until `away off`: every
  prompt then waits up to 10 minutes on the café first, and the café's «я повернувся» sends only the prompt waiting at
  that moment back to the terminal.
- The computer keeps a 256-bit answer key in `~/.config/relay/answer-key` (mode 600). It reaches a phone only through
  the pairing link `<site>/#pair=<key>`, whose fragment browsers never send to a server. `relay.sh pair new` replaces
  the key and unpairs every phone.
- Each answer is `HMAC-SHA256(key, "<ask id>:<allow|deny>:<sha256 of the hook JSON>:<input passed back>")`. The phone
  shows the request read from that same hook JSON, and `relay.sh` recomputes the HMAC from what it sent itself. An
  answer that does not match is ignored and the terminal asks as usual. Every answer, accepted or refused, is logged
  in `~/.local/state/relay/answers.log`.
- An answer may carry words of the user's own: one per question, after the options picked, or a note with a «no» to a
  permission or a plan, each at most 1000 characters (`supabase/migrations/0023_ask_words.sql`). They are part of the
  signed input, so only a paired phone can write them, and Claude reads them as the user's own words, the way it would
  read them typed in the terminal. A note never turns a «no» into a «yes»: `relay.sh` 8 adds it after its fixed
  denial sentence, and an older script leaves it out.
- Hook scripts older than version 6 cannot check signatures and are never handed an answer.

### Data

- Room keys are never stored by the server, only `sha256(key)`. The hook script sends the key in the `x-relay-key`
  header, not in the URL.
- Café events carry short descriptions only (`lib/live/normalize.ts`) and live for 24 hours, at most 12000 per room.
  An agent's task list arrives as two counts, steps done and steps in all, never the steps' words.
- The pipeline check-in (`relay.sh checkin`, version 7) is a hook Claude waits for, but it only reads and writes a
  small state file in `~/.local/state/relay/checkin` and never touches the network. What it adds to Claude's context
  is a fixed sentence in the script, asking for a `⏱` line; it carries nothing from the café. The café keeps only the
  numbers of that line and up to 48 characters of what runs now.
- After a prompt you answered, `relay.sh answered` (`PostToolUse`, version 8) posts the chat's, the agent's and the
  tool's names, never the tool's input or output, so the café's «чекає на тебе» goes away. It posts only when a
  permission prompt or question marked that chat as waiting on this computer (`~/.local/state/relay/waits`), and only
  once.
- While «я не за комп'ютером» is on, a permission request, question or plan is stored whole in `relay_asks`
  (the command, a written file's content, the plan): the text is erased after 24 hours, the row after 30 days.
- Writes are capped at 600 events per room per minute and 200 new rooms per hour site-wide.

## Running your own deploy

- Apply every migration in `supabase/migrations/` in order. The app needs only the public (publishable) key; no
  service-role key is used anywhere.
- Keep Realtime's public channels allowed: the café chat and the games use them. Room feeds are private channels
  whose RLS policy (`relay rooms: listen` on `realtime.messages`) lets browsers listen and nobody but the database send.
- The local café (`npm run live`, `npm run up`) binds to 127.0.0.1 and answers only requests addressed to
  `127.0.0.1`/`localhost` with no foreign `Origin`. Do not expose `npm run dev` or `npm run live` to a network: the
  local feed shows everything your Claude does.
- A site meant for yourself can close to cafés it has never seen: apply `0022_private_cafe.sql`, run
  `select public.relay_private(true);` in the SQL editor, and set `NEXT_PUBLIC_RELAY_PRIVATE=1` so visitors get a
  pointer to the project instead of a key. Rooms the site already knows, their keys and team invites keep working.
- The site sends a Content-Security-Policy (`next.config.ts`) that allows only the Supabase project and the jukebox's
  YouTube and Spotify players besides itself.

## Known limits

- Whoever has your room key sees your café and can post fake events into it; keep the key to yourself and rotate it
  (personal keys can be revoked by the café owner).
- On a shared computer, another local user may see the answer key in the process list for the moment `openssl`
  checks a signature.
- The server can withhold or delay an answer (then the terminal asks after 10 minutes); it cannot forge one.

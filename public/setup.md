# Agent Lounge — setup instructions for Claude Code

You are Claude Code, and the user asked you to connect Agent Lounge to their Claude Code.

Agent Lounge is a pixel internet café that shows the user's own Claude Code agents live:
- who is working;
- what each one is doing right now;
- which subagent the main Claude is handing a task to.

It runs **only on this machine**. Claude Code hooks post small events to `http://127.0.0.1:3737`, and nothing is sent anywhere else. The hooks are async and silent, so they cost no tokens and never slow Claude down. If Agent Lounge is not running, they quietly do nothing.

Do the steps below yourself, then tell the user the result in their language. It takes about two minutes, mostly `npm install` and the first build.

## 0. Check the requirements

```bash
node --version   # needs v20.9 or newer
git --version
curl --version
```

If Node is missing or older than 20.9, stop. Tell the user to install Node 20 or newer (https://nodejs.org, or `nvm install 20`) and to ask you again.

## 1. Get Agent Lounge

Use `~/agent-lounge` unless the user named another folder. If an older copy already lives in `~/relay` (the project's former name), use that folder instead in every step below.

```bash
if [ -d ~/agent-lounge/.git ]; then git -C ~/agent-lounge pull --ff-only; else git clone https://github.com/justbios/agent-lounge.git ~/agent-lounge; fi
cd ~/agent-lounge
npm install
```

## 2. Add the hooks and start Agent Lounge

```bash
cd ~/agent-lounge
npm run setup
```

`npm run setup` does two things:

- **`npm run hooks`** copies the hook script to `~/.config/relay/relay.sh` and merges eight hook entries that run it into `~/.claude/settings.json`, or into `$CLAUDE_CONFIG_DIR/settings.json` when that is set. Every other setting and hook stays untouched, and the previous file is saved as `settings.json.bak-relay`. Running it again is safe. The script forwards each event and, from the chat's transcript, only the chat's name and token counts.
- **`npm run up`** builds Agent Lounge and starts it in the background on `http://127.0.0.1:3737`, detached from your shell. It survives the end of this session. Its log is `~/agent-lounge/data/server.log`.

If port 3737 is busy with something that is not Agent Lounge, tell the user and stop. Do not kill a process you did not start.

## 3. Offer the status line

Agent Lounge shows how much of the 5-hour and weekly subscription limits is used and when each resets. Claude Code hands those numbers only to a status line, which runs in terminal Claude Code (the desktop app does not run one). Ask the user whether to add it. Only on a yes:

```bash
cd ~/agent-lounge
node scripts/install-hooks.mjs --statusline
```

With no status line yet, it adds Agent Lounge's, which prints the model, the context and both limits. An existing status line keeps its output; the limits are saved on the side. `npm run unhook` puts it back as it was.

## 4. Check it

```bash
echo '{"session_id":"relay-setup-check","cwd":"'"$HOME"'/agent-lounge","hook_event_name":"UserPromptSubmit","prompt":"hello, Agent Lounge"}' \
  | curl -s -o /dev/null -w '%{http_code}\n' -H 'content-type: application/json' --data-binary @- http://127.0.0.1:3737/api/claude-hook
```

`204` means it works. Then tell the user:

- Open **http://127.0.0.1:3737** and pick **live** (**наживо** in Ukrainian). Each Claude Code chat gets its own tab. Every agent from the project's `.claude/agents/` sits at a desk, even when idle.
- New Claude Code sessions report straight away. The desktop app also picks the hooks up in chats that are already open. A terminal `claude` session needs a restart.
- After a reboot, start Agent Lounge again with `cd ~/agent-lounge && npm run up`.
- To update: `cd ~/agent-lounge && git pull && npm install && npm run up -- --restart`.
- To stop: `npm run down`. To remove the hooks: `npm run unhook`.

Report what you did in a few lines: the folder, that the hooks were added (and where the backup is), and the URL. Do not paste the settings file.

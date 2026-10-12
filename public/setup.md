# Relay — setup instructions for Claude Code

You are Claude Code, and the user asked you to connect Relay to their Claude Code.

Relay is a pixel internet café that shows the user's own Claude Code agents live:
- who is working;
- what each one is doing right now;
- which subagent the main Claude is handing a task to.

It runs **only on this machine**. Claude Code hooks post small events to `http://127.0.0.1:3737`, and nothing is sent anywhere else. The hooks are async and silent, so they cost no tokens and never slow Claude down. If Relay is not running, they quietly do nothing.

Do the steps below yourself, then tell the user the result in their language. It takes about two minutes, mostly `npm install` and the first build.

## 0. Check the requirements

```bash
node --version   # needs v20.9 or newer
git --version
curl --version
```

If Node is missing or older than 20.9, stop. Tell the user to install Node 20 or newer (https://nodejs.org, or `nvm install 20`) and to ask you again.

## 1. Get Relay

Use `~/relay` unless the user named another folder.

```bash
if [ -d ~/relay/.git ]; then git -C ~/relay pull --ff-only; else git clone https://github.com/justbios/agent-pipeline-viz.git ~/relay; fi
cd ~/relay
npm install
```

## 2. Add the hooks and start Relay

```bash
cd ~/relay
npm run setup
```

`npm run setup` does two things:

- **`npm run hooks`** merges eight hook entries into `~/.claude/settings.json`, or into `$CLAUDE_CONFIG_DIR/settings.json` when that is set. Every other setting and hook stays untouched, and the previous file is saved as `settings.json.bak-relay`. Running it again is safe.
- **`npm run up`** builds Relay and starts it in the background on `http://127.0.0.1:3737`, detached from your shell. It survives the end of this session. Its log is `~/relay/data/server.log`.

If port 3737 is busy with something that is not Relay, tell the user and stop. Do not kill a process you did not start.

## 3. Check it

```bash
echo '{"session_id":"relay-setup-check","cwd":"'"$HOME"'/relay","hook_event_name":"UserPromptSubmit","prompt":"hello, Relay"}' \
  | curl -s -o /dev/null -w '%{http_code}\n' -H 'content-type: application/json' --data-binary @- http://127.0.0.1:3737/api/claude-hook
```

`204` means it works. Then tell the user:

- Open **http://127.0.0.1:3737** and pick **наживо** (live). Each Claude Code chat gets its own tab. Every agent from the project's `.claude/agents/` sits at a desk, even when idle.
- New Claude Code sessions report straight away. The desktop app also picks the hooks up in chats that are already open. A terminal `claude` session needs a restart.
- After a reboot, start Relay again with `cd ~/relay && npm run up`.
- To update: `cd ~/relay && git pull && npm install && npm run up -- --restart`.
- To stop: `npm run down`. To remove the hooks: `npm run unhook`.

Report what you did in a few lines: the folder, that the hooks were added (and where the backup is), and the URL. Do not paste the settings file.

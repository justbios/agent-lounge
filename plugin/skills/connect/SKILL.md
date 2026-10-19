---
description: Connect this Claude Code to an Agent Lounge café so its chats and agents show up live. Takes the link from the Agent Lounge connect page, or "local".
argument-hint: "<link from the Agent Lounge connect page | local>"
disable-model-invocation: true
allowed-tools: Bash(sh "${CLAUDE_PLUGIN_ROOT}/scripts/connect.sh" *)
---

Connect this computer's Claude Code to Agent Lounge.

1. Run exactly this, with the argument in double quotes:

   sh "${CLAUDE_PLUGIN_ROOT}/scripts/connect.sh" "$ARGUMENTS"

2. Read the output:
   - `status: bad-link`: the argument is not an Agent Lounge link. Tell the user to copy the whole `/agent-lounge:connect …` line from the "connect Claude" page («підключити Claude») of their Agent Lounge site, or to use `/agent-lounge:connect local` for an Agent Lounge running on this computer. Stop here.
   - `check: 204`: connected.
   - `check: 410`: the key in this link no longer works: the café moved to personal keys, or its owner removed this key. Tell the user to ask the café owner for a personal invite, open it and run the new `/agent-lounge:connect` line from it.
   - Any other code: the link is saved but the café did not answer; give the code.
   - `old-hooks: <file>`: that settings file still has older Agent Lounge hooks (commands containing `/api/claude-hook`), so every event would reach the café twice. Offer to remove only those hook entries, after saving a copy of the file as `settings.json.bak-relay`. Change nothing until the user agrees.
   - `statusline: none`: the café shows how much of the 5-hour and weekly subscription limits is used and when they reset, but Claude Code hands those numbers only to a status line. Offer to add this to `~/.claude/settings.json`, after saving a copy as `settings.json.bak-relay`:
     `"statusLine": {"type": "command", "command": "sh \"$HOME/.config/relay/relay.sh\" statusline"}`
     It prints the model, context and both limits. Change nothing until the user agrees.
   - `statusline: other`: the user has their own status line. Offer to keep it and save the limits on the side by replacing its command with
     `j=$(cat); printf '%s' "$j" | sh "$HOME/.config/relay/relay.sh" limits; printf '%s' "$j" | ( <their command> )`
     Same backup, same consent.
   - `statusline: relay`: nothing to do.
3. Tell the user to open their café and switch to "live" («наживо»): chats show up there from the next prompt, with the tokens each agent and chat spent. The hooks are async and cost no tokens. The status line runs only in terminal Claude Code, so the limits come from terminal sessions; the desktop app does not run it.

Answer in the user's language. Never repeat the full link: it holds their private key.

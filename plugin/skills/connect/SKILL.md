---
description: Connect this Claude Code to a Relay café so its chats and agents show up live. Takes the link from the Relay connect page, or "local".
argument-hint: "<link from the Relay connect page | local>"
disable-model-invocation: true
allowed-tools: Bash(sh "${CLAUDE_PLUGIN_ROOT}/scripts/connect.sh" *)
---

Connect this computer's Claude Code to Relay.

1. Run exactly this, with the argument in double quotes:

   sh "${CLAUDE_PLUGIN_ROOT}/scripts/connect.sh" "$ARGUMENTS"

2. Read the output:
   - `status: bad-link`: the argument is not a Relay link. Tell the user to copy the whole `/relay:connect …` line from the «підключити Claude» page of their Relay site, or to use `/relay:connect local` for a Relay running on this computer. Stop here.
   - `check: 204`: connected. Any other code: the link is saved but the café did not answer; give the code.
   - `old-hooks: <file>`: that settings file still has older Relay hooks (commands containing `/api/claude-hook`), so every event would reach the café twice. Offer to remove only those hook entries, after saving a copy of the file as `settings.json.bak-relay`. Change nothing until the user agrees.
3. Tell the user to open their café and switch to «наживо»: chats show up there from the next prompt. The hooks are async and cost no tokens.

Answer in the user's language. Never repeat the full link: it holds their private key.

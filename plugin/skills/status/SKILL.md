---
description: Show whether this Claude Code is connected to a Relay café, and to which one.
disable-model-invocation: true
allowed-tools: Bash(sh "${CLAUDE_PLUGIN_ROOT}/scripts/status.sh")
---

Run exactly:

sh "${CLAUDE_PLUGIN_ROOT}/scripts/status.sh"

Report in the user's language: connected or not, the café address, the first characters of the key, and the name (URL-decode it). If `old-hooks:` names a file, say that events may reach the café twice and that `/relay:connect` can clean that up. Never print the full key.

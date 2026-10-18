---
description: Show whether this Claude Code is connected to an Agent Lounge café, and to which one.
disable-model-invocation: true
allowed-tools: Bash(sh "${CLAUDE_PLUGIN_ROOT}/scripts/status.sh")
---

Run exactly:

sh "${CLAUDE_PLUGIN_ROOT}/scripts/status.sh"

Report in the user's language: connected or not, the café address, the first characters of the key, and the name (URL-decode it). If `old-hooks:` names a file, say that events may reach the café twice and that `/agent-lounge:connect` can clean that up. Then «я не за комп'ютером» (`away:`, until when) and whether this computer has an answer key (`kid:`; `none` means no phone can answer for it, `/agent-lounge:away pair` fixes that). Under `answers:` are the last answers that came from the café, newest last: time, hook, tool, allow or deny, and the ask id; one marked `unsigned:` was refused because its signature did not check out, so the terminal asked instead. Point those out. Never print the full key.

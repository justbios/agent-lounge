---
description: Turn away mode («я не за комп'ютером», "I'm away") on, on for good, or off for this computer, or pair a phone that may answer Claude from the Agent Lounge café. Takes on, always, off, pair, pair new or nothing for the current state.
argument-hint: "on | always | off | pair | pair new"
disable-model-invocation: true
allowed-tools: Bash(sh "${CLAUDE_PLUGIN_ROOT}/scripts/relay.sh" away *), Bash(sh "${CLAUDE_PLUGIN_ROOT}/scripts/relay.sh" pair*)
---

While away mode is on, Claude's permission prompts, questions and plans from this computer wait up to 10
minutes in the café, where a phone paired with this computer can answer them. It is switched on only here, on the
computer; the café can only switch it off ("I'm back", «я повернувся»). With `always` it stays on until `off`: then
"I'm back" only sends the question waiting at that moment to the terminal, and the next one waits in the café again.
While it is on, each prompt also tells Claude to ask with its question tool, in options, since only those reach the
phone.

1. Run exactly one of these, by the argument:
   - `on`: `sh "${CLAUDE_PLUGIN_ROOT}/scripts/relay.sh" away on`
   - `always`: `sh "${CLAUDE_PLUGIN_ROOT}/scripts/relay.sh" away always`
   - `off`: `sh "${CLAUDE_PLUGIN_ROOT}/scripts/relay.sh" away off`
   - `pair`: `sh "${CLAUDE_PLUGIN_ROOT}/scripts/relay.sh" pair`
   - `pair new`: `sh "${CLAUDE_PLUGIN_ROOT}/scripts/relay.sh" pair new`
   - nothing: `sh "${CLAUDE_PLUGIN_ROOT}/scripts/relay.sh" away status`

2. Read the output:
   - `away: on` with `until: HH:MM`: on until then (12 hours). `away: always`: on until `/agent-lounge:away off`.
     If `key: new` is there too, no phone can answer yet: tell the user to run `/agent-lounge:away pair` and open the
     link on the phone they will answer from.
   - `away: off` with `cafe: 403`: the café needs a personal key for this; the owner turns personal keys on at the
     "connect Claude" page («підключити Claude»). Any other `cafe:` code with `away: off`: the café did not answer, nothing changed.
   - `link: copied`: the pairing link is in the clipboard. Tell the user to send it to their phone (AirDrop, a note to
     themselves) and open it there in the browser they use for the café; that browser then can answer for this
     computer. The link is a secret: anyone who opens it and also has the café key can answer for this computer.
     `pair new` makes a new one and unpairs every phone that had the old one.
   - `link: no-clipboard`: tell the user to run `sh ~/.config/relay/relay.sh pair` in their own terminal, which prints
     the link (and a QR code when `qrencode` is installed).
   - `kid:` is the id of this computer's answer key, safe to show; `kid: none` means it was never paired.
   - `not-connected`: run `/agent-lounge:connect` first.

Answer in the user's language. Never print, repeat or read back the pairing link or the contents of
`~/.config/relay/answer-key`: they are the secret that lets a phone answer for this computer.

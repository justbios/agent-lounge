# Agent Lounge

**Watch your Claude Code agents work in a pixel café.**

<p align="center">
  <img src="docs/demo.gif" width="770" alt="Claude hands tasks to its subagents in a pixel café: they walk over, work at their desks and bring the results back">
</p>

Every Claude Code chat becomes a room in the café. Claude sits at its desk. When it starts a subagent, it walks over
and hands it the task; the subagent works with a bubble saying what it's doing, then carries the result back. Your
whole team from `.claude/agents` has a desk, even before it's called.

- **Live:** who is busy and what they're doing right now, in plain words.
- **Pings:** a sound and a phone push when Claude asks for permission or finishes its answer.
- **Tokens and limits:** tokens per agent and chat, and your 5-hour and weekly subscription limits.
- **Teams:** several people connect their Claude to one café, each on their own floor.
- **For the waiting:** a daily recap, achievements, furniture you earn with work, and mini-games with whoever is watching.

The hooks are async and silent: they never slow Claude down and cost no tokens. Only short descriptions of what each
agent does leave your machine, not file contents (unless you turn on away mode to approve Claude's requests from your
phone), and nothing at all when you run the café locally.

## Get started

**Hosted café (about a minute).** Open [the connect page](https://agent-pipeline-viz-one.vercel.app/connect), copy
the phrase and paste it into Claude Code. Claude installs the hooks; your agents show up in the café from your next
prompt. Works on macOS, Linux and Windows.

**As a Claude Code plugin.** Same café, installed through the plugin:

```
/plugin marketplace add justbios/agent-lounge
/plugin install agent-lounge@agent-lounge
/agent-lounge:connect <the link from the connect page>
```

**Fully local.** Nothing leaves your computer. Needs Node 18+:

```bash
git clone https://github.com/justbios/agent-lounge.git ~/agent-lounge
cd ~/agent-lounge && npm install
npm run setup   # hooks + the café at http://127.0.0.1:3737
```

`npm run unhook` removes the hooks.

The café's buttons and menus are in Ukrainian for now. What the agents do can be shown in English: pick
**eng** in the language menu at the top.

## More

- [Detailed guide](docs/guide-uk.md) (in Ukrainian): self-hosting on Vercel + Supabase, how it works, every feature.
- [SECURITY.md](SECURITY.md): what is sent where, and how to report a vulnerability.

## License

[Apache-2.0](LICENSE). The bundled NES homebrew games keep their own licences ([THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)).

Agent Lounge is an independent project, not affiliated with Anthropic. "Claude" and "Claude Code" are trademarks of
Anthropic.

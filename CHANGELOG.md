# Changelog

The plugin's `version` in `plugin/.claude-plugin/plugin.json` is what Claude Code compares when it looks for an update:
bump it, together with `package.json`, in every release that changes `plugin/`, then run `npm run plugin:pack` and tag
the commit `vX.Y.Z`.

## 0.9.0 — not released yet

- Renamed from Relay to Agent Lounge. The plugin is now `agent-lounge@agent-lounge` and its commands are
  `/agent-lounge:connect` and `/agent-lounge:status`. If you installed `relay@relay`, uninstall it and install the new
  one. Database objects (`relay_*`), browser storage keys (`relay.*`), `~/.config/relay` and `relay.sh` keep their old
  names, so existing cafés and hooks keep working.
- Licensed under Apache-2.0. Third-party games keep their own licences; see `THIRD_PARTY_NOTICES.md`.
- Removed Nova the Squirrel from the console: its graphics and levels are licensed for non-commercial use only.
- The plugin now has a version, so `/plugin marketplace update` delivers new releases.

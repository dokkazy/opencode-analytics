# opencode-analytics

Local analytics for OpenCode skill usage.

This workspace contains a publishable OpenCode plugin package that records `skill` and `skill_use` runs in a local SQLite database and exposes five read commands for inspecting the data.

## What is in this repo?

- `packages/opencode-analytics/` — the npm package
- `examples/basic-setup/` — a minimal `opencode.json` example
- `docs/install.md` — install flows for users and contributors
- `docs/configuration.md` — config keys, env overrides, and precedence
- `docs/commands.md` — command behavior, including empty and degraded states
- `docs/migration-from-local-plugin.md` — migration from `./plugins/skill-analytics.js`
- `docs/release.md` — release and publish checklist

## Quick start

1. Install the package in your OpenCode project:

```bash
npm install opencode-analytics@<version>
```

Replace `<version>` with the package version you want to install.

2. Add the plugin to `opencode.json`:

```json
{
  "plugin": ["opencode-analytics"]
}
```

3. Restart OpenCode and use the analytics commands:

- `/skill-analytics-overview`
- `/skill-analytics-detail brainstorming`
- `/skill-analytics-health`
- `/skill-analytics-recent`
- `/skill-analytics-export`

## Behavior summary

- Default storage path: `~/.opencode-analytics/data/analytics.sqlite`
- Config precedence: environment variables → OpenCode project config → defaults
- Empty databases return friendly empty-state messages instead of errors
- Startup failures disable analytics reads with an unavailable message
- Runtime write failures switch analytics into a degraded read-only state that returns the last persisted data with a warning

## Docs

- [Install](docs/install.md)
- [Configuration](docs/configuration.md)
- [Commands](docs/commands.md)
- [Migration from local plugin](docs/migration-from-local-plugin.md)
- [Release](docs/release.md)
- [Basic example](examples/basic-setup/README.md)

## Contributors

From the workspace root:

```bash
bun install
bun run check
```

For release verification, also run:

```bash
npm pack --dry-run --workspace opencode-analytics
```

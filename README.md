# opencode-analytics

Local skill analytics for OpenCode.

`opencode-analytics` is a publishable OpenCode plugin that tracks `skill` and `skill_use` activity, stores runs in a local SQLite database, and adds built-in slash commands for exploring the data from the terminal.

## Features

- zero-config default setup
- local SQLite storage under your home directory
- tracking for `skill` and `skill_use`
- built-in read commands for overview, detail, health, recent runs, and export
- degraded runtime behavior that preserves reads after write failures
- npm install flow plus local contributor workflow

## Quick start

1. Install the package in the OpenCode project where you want analytics:

```bash
npm install opencode-analytics@<version>
```

2. Add the plugin to `opencode.json`:

```json
{
  "plugin": ["opencode-analytics"]
}
```

3. Restart OpenCode.

4. Use the built-in commands:

- `/skill-analytics-overview`
- `/skill-analytics-detail brainstorming`
- `/skill-analytics-health`
- `/skill-analytics-recent`
- `/skill-analytics-export`

## What it tracks

Phase 1 focuses on skill analytics only.

Each persisted run includes:

- skill name
- trigger type: `skill` or `skill_use`
- start/end timestamps and duration
- agent and model metadata when available
- token counts when available
- tool-call counts
- final status: `completed` or `error`

## Runtime behavior

- Default storage path: `~/.opencode-analytics/data/analytics.sqlite`
- Config precedence: environment variables -> `opencode.json` -> defaults
- Empty databases return friendly empty states
- Startup failures move analytics into `disabled-at-startup`
- Runtime write failures move analytics into `disabled-after-runtime-error`
- In `disabled-after-runtime-error`, reads still work and commands show warning metadata or warning text

## Repo layout

- `packages/opencode-analytics/` - publishable npm package
- `examples/basic-setup/` - minimal example config and usage notes
- `docs/install.md` - install flows for users and contributors
- `docs/configuration.md` - config keys, env overrides, and precedence
- `docs/commands.md` - slash command behavior and degraded states
- `docs/migration-from-local-plugin.md` - migration from `./plugins/skill-analytics.js`
- `docs/release.md` - release and publish checklist
- `docs/release-notes-v0.1.0.md` - draft first-release notes

## Release readiness

From the workspace root:

```bash
bun install
bun run release:check
```

That verifies:

- test suite
- TypeScript check
- npm package contents via `npm pack --dry-run --workspace opencode-analytics`

## Docs

- [Install](docs/install.md)
- [Configuration](docs/configuration.md)
- [Commands](docs/commands.md)
- [Migration from local plugin](docs/migration-from-local-plugin.md)
- [Release](docs/release.md)
- [Basic example](examples/basic-setup/README.md)

# opencode-analytics v0.1.0

First public release of `opencode-analytics`.

## Highlights

- local SQLite-backed analytics for OpenCode skill usage
- tracking for `skill` and `skill_use`
- built-in slash commands for overview, detail, health, recent runs, and export
- zero-config default setup with optional `opencodeAnalytics` overrides
- degraded runtime handling that preserves reads after write failures

## Included in v0.1.0

- publishable npm package: `opencode-analytics`
- default local storage under `~/.opencode-analytics/data/analytics.sqlite`
- environment variable overrides for analytics config
- migration guide from `./plugins/skill-analytics.js`
- example `opencode.json` setup
- release checklist and tarball smoke-test flow

## Install

```bash
npm install opencode-analytics@0.1.0
```

Then add:

```json
{
  "plugin": ["opencode-analytics"]
}
```

## Built-in commands

- `/skill-analytics-overview`
- `/skill-analytics-detail <name>`
- `/skill-analytics-health [name]`
- `/skill-analytics-recent [limit]`
- `/skill-analytics-export [limit]`

## Notes

- Phase 1 ships skill analytics only
- data stays local to the machine
- no hosted dashboard or remote telemetry is included in this release

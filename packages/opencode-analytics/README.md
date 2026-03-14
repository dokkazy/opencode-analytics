# opencode-analytics

`opencode-analytics` is an OpenCode plugin that records local skill analytics in SQLite and exposes built-in slash commands for inspecting the data.

## Features

- tracks `skill` and `skill_use`
- stores analytics locally in SQLite
- works with zero required configuration
- ships built-in slash commands
- keeps reads available after runtime write failures

## Install

```bash
npm install opencode-analytics@<version>
```

Then add the plugin to `opencode.json`:

```json
{
  "plugin": ["opencode-analytics"]
}
```

Restart OpenCode after updating the plugin list.

## Built-in commands

- `/skill-analytics-overview [limit]`
- `/skill-analytics-detail <name>`
- `/skill-analytics-health [name]`
- `/skill-analytics-recent [limit]`
- `/skill-analytics-export [limit]`

## Default behavior

Without any extra config, the plugin:

- enables analytics
- enables commands
- enables skill tracking
- stores data at `~/.opencode-analytics/data/analytics.sqlite`

## Optional configuration

```json
{
  "plugin": ["opencode-analytics"],
  "opencodeAnalytics": {
    "storagePath": "/absolute/path/to/analytics.sqlite",
    "commands": {
      "enabled": true
    },
    "trackers": {
      "skill": {
        "enabled": true
      }
    }
  }
}
```

Supported config keys:

| Key | Type | Default | Notes |
| --- | --- | --- | --- |
| `opencodeAnalytics.enabled` | `boolean` | `true` | Disables analytics startup entirely when `false` |
| `opencodeAnalytics.debug` | `boolean` | `false` | Resolved by config; currently not used elsewhere |
| `opencodeAnalytics.storagePath` | `string` | `~/.opencode-analytics/data/analytics.sqlite` | Overrides the SQLite file location |
| `opencodeAnalytics.commands.enabled` | `boolean` | `true` | Controls slash-command registration |
| `opencodeAnalytics.trackers.skill.enabled` | `boolean` | `true` | Stops new skill writes when `false` |

Environment variables override config values:

- `OPENCODE_ANALYTICS_ENABLED`
- `OPENCODE_ANALYTICS_DEBUG`
- `OPENCODE_ANALYTICS_STORAGE_PATH`
- `OPENCODE_ANALYTICS_COMMANDS_ENABLED`
- `OPENCODE_ANALYTICS_TRACKERS_SKILL_ENABLED`

Boolean env parsing is strict:

- `true` -> enabled
- `false` -> disabled
- any other value -> ignored

## Command behavior

### Empty state

When no matching rows exist yet:

- `/skill-analytics-overview` -> `Skill overview\nNo skill runs recorded.`
- `/skill-analytics-health` -> `Skill health\nNo health rows available.`
- `/skill-analytics-recent` -> `Recent skill runs\nNo recent skill runs recorded.`
- `/skill-analytics-export` -> JSON with empty `overview` and `recent` arrays
- `/skill-analytics-detail <name>` -> `Skill detail\nNo skill run found for "<name>".`

### Startup-disabled state

If startup initialization fails, read commands stay callable but return unavailable output instead of data.

### Degraded runtime state

If a write fails after startup, analytics switches to `disabled-after-runtime-error`.

In that state:

- reads still succeed
- data comes from the last persisted snapshot
- terminal commands append a warning block
- export returns both `warning` and `data`

## Validation rules

- `limit` must be an integer from `1` to `50`
- `/skill-analytics-detail` requires a non-empty name
- `/skill-analytics-health` accepts an optional name, including spaced names such as `brainstorming advanced`
- for `detail` and `health`, remaining tokens are treated as part of the skill name
- extra positional args are rejected for numeric commands with a user-friendly validation error

## Package contents

The published package currently includes:

- `src/`
- `README.md`

That matches the package `files` allowlist used for publishing.

## More docs

- root repo: `README.md`
- install: `docs/install.md`
- config: `docs/configuration.md`
- commands: `docs/commands.md`
- migration: `docs/migration-from-local-plugin.md`
- release: `docs/release.md`

# opencode-analytics

`opencode-analytics` is an OpenCode plugin package that records local skill analytics in SQLite and exposes bundled read commands.

It currently tracks `skill` and `skill_use` tool activity, stores runs in a local SQLite database, and provides five analytics commands:

- `/skill-analytics-overview`
- `/skill-analytics-detail <name>`
- `/skill-analytics-health [name]`
- `/skill-analytics-recent [limit]`
- `/skill-analytics-export [limit]`

## Install

```bash
npm install opencode-analytics@<version>
```

Replace `<version>` with the published package version you want to install.

Then add the package to your OpenCode config:

```json
{
  "plugin": ["opencode-analytics"]
}
```

Restart OpenCode after changing the plugin list.

## Minimal configuration

The package works with defaults by using the same minimal plugin entry shown above.

Default behavior:

- analytics enabled
- commands enabled
- skill tracking enabled
- storage path at `~/.opencode-analytics/data/analytics.sqlite`

## Optional overrides

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
| `opencodeAnalytics.debug` | `boolean` | `false` | Reserved debug flag; currently resolved but not otherwise used by the package |
| `opencodeAnalytics.storagePath` | `string` | `~/.opencode-analytics/data/analytics.sqlite` | Overrides the SQLite file location |
| `opencodeAnalytics.commands.enabled` | `boolean` | `true` | Controls slash-command registration |
| `opencodeAnalytics.trackers.skill.enabled` | `boolean` | `true` | Stops new skill writes when `false` |

Environment variables override config values:

- `OPENCODE_ANALYTICS_ENABLED`
- `OPENCODE_ANALYTICS_DEBUG`
- `OPENCODE_ANALYTICS_STORAGE_PATH`
- `OPENCODE_ANALYTICS_COMMANDS_ENABLED`
- `OPENCODE_ANALYTICS_TRACKERS_SKILL_ENABLED`

Boolean env values only recognize the literal strings `true` and `false`. Any other value is ignored and falls back to config/defaults.

## Command behavior

### Empty state

When no runs have been recorded yet:

- `/skill-analytics-overview` → `Skill overview\nNo skill runs recorded.`
- `/skill-analytics-health` → `Skill health\nNo health rows available.`
- `/skill-analytics-recent` → `Recent skill runs\nNo recent skill runs recorded.`
- `/skill-analytics-export` → JSON with empty `overview` and `recent` arrays
- `/skill-analytics-detail <name>` → `Skill detail\nNo skill run found for "<name>".`

### Startup-disabled state

If startup initialization fails, read commands stay registered but return an unavailable payload/message instead of data.

Terminal output uses this shape:

```text
Analytics unavailable
state: disabled-at-startup
Analytics commands are unavailable because startup initialization failed.
reason: <reason>
```

### Degraded runtime state

If a runtime write fails after startup, analytics switches to `disabled-after-runtime-error`.

In that state:

- reads still succeed
- returned data is the last persisted data
- terminal commands append a warning block
- `/skill-analytics-export` returns JSON with both `warning` and `data`

Warning block:

```text
Warning: Analytics collection disabled
Analytics collection stopped after a runtime error. Showing the last persisted data.
reason: <reason>
```

## Validation rules

- `limit` must be an integer from `1` to `50`
- `/skill-analytics-detail` requires a non-empty name
- `/skill-analytics-health` accepts an optional name, including spaced names such as `brainstorming advanced`
- for `/skill-analytics-detail` and `/skill-analytics-health`, remaining tokens are treated as part of the skill name rather than rejected as extra positional args
- extra positional args are rejected for the numeric commands with a user-friendly validation error

## Storage details

The package creates parent directories automatically and stores analytics in SQLite.

- default relative path: `.opencode-analytics/data/analytics.sqlite`
- current schema migration: `001_initial_skill_runs`
- tracked run status values: `completed` and `error`

## Package contents

The published package currently includes:

- `src/`
- `README.md`

That matches the package `files` allowlist used for publishing.

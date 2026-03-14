# Configuration

`opencode-analytics` reads configuration from the OpenCode project config and from environment variables.

## Precedence

Resolved config precedence is:

1. environment variables
2. OpenCode config (`opencodeAnalytics`)
3. package defaults

If both file config and project-provided config exist, nested values are merged and project config wins over file config for overlapping keys.

## OpenCode config

Add an `opencodeAnalytics` block to `opencode.json` when you need overrides:

```json
{
  "plugin": ["opencode-analytics"],
  "opencodeAnalytics": {
    "enabled": true,
    "debug": false,
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

## Supported keys

| Key | Type | Default | Behavior |
| --- | --- | --- | --- |
| `opencodeAnalytics.enabled` | `boolean` | `true` | Disables analytics startup when `false` |
| `opencodeAnalytics.debug` | `boolean` | `false` | Resolved by config; currently not used elsewhere in the package |
| `opencodeAnalytics.storagePath` | `string` | `~/.opencode-analytics/data/analytics.sqlite` | Sets the SQLite file path |
| `opencodeAnalytics.commands.enabled` | `boolean` | `true` | Registers slash commands only when `true` |
| `opencodeAnalytics.trackers.skill.enabled` | `boolean` | `true` | Stops new skill writes when `false` |

## Environment variables

These variables override file config:

| Variable | Maps to |
| --- | --- |
| `OPENCODE_ANALYTICS_ENABLED` | `opencodeAnalytics.enabled` |
| `OPENCODE_ANALYTICS_DEBUG` | `opencodeAnalytics.debug` |
| `OPENCODE_ANALYTICS_STORAGE_PATH` | `opencodeAnalytics.storagePath` |
| `OPENCODE_ANALYTICS_COMMANDS_ENABLED` | `opencodeAnalytics.commands.enabled` |
| `OPENCODE_ANALYTICS_TRACKERS_SKILL_ENABLED` | `opencodeAnalytics.trackers.skill.enabled` |

Boolean env parsing is strict:

- `true` → enabled
- `false` → disabled
- any other value → ignored

## Defaults

Default resolved values:

```json
{
  "enabled": true,
  "debug": false,
  "storagePath": "~/.opencode-analytics/data/analytics.sqlite",
  "commands": {
    "enabled": true
  },
  "trackers": {
    "skill": {
      "enabled": true
    }
  }
}
```

## Notes

- when `commands.enabled` is `false`, slash commands are not registered
- when `trackers.skill.enabled` is `false`, existing data can still be read, but no new skill runs are recorded
- if startup initialization fails, analytics enters `disabled-at-startup`
- if a later write fails, analytics enters `disabled-after-runtime-error` and serves the last persisted data with warnings

# Basic setup example

This example shows the smallest working `opencode.json` for `opencode-analytics`.

## Default setup

Use [`opencode.json`](./opencode.json) as-is after installing the package:

```bash
npm install opencode-analytics@<version>
```

Replace `<version>` with the package version you want to install.

```json
{
  "plugin": ["opencode-analytics"]
}
```

That uses the package defaults:

- analytics enabled
- commands enabled
- skill tracking enabled
- SQLite storage at `~/.opencode-analytics/data/analytics.sqlite`

## Override setup

Add an `opencodeAnalytics` block when you need custom behavior:

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

Common overrides:

- move the database with `storagePath`
- disable slash-command registration with `commands.enabled: false`
- stop recording new skill runs with `trackers.skill.enabled: false`

Environment variables still win over file config.

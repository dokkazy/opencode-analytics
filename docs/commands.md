# Commands

The package registers five slash commands when `opencodeAnalytics.commands.enabled` resolves to `true`.

## Command list

| Command | Args | Notes |
| --- | --- | --- |
| `/skill-analytics-overview` | `[limit]` | Summary rows grouped by skill |
| `/skill-analytics-detail` | `<name>` | Detail for one skill name |
| `/skill-analytics-health` | `[name]` | Health rows for all skills or one named skill |
| `/skill-analytics-recent` | `[limit]` | Most recent runs |
| `/skill-analytics-export` | `[limit]` | Raw JSON export |

## Argument rules

- `limit` must be an integer between `1` and `50`
- `/skill-analytics-detail` requires a non-empty skill name
- `/skill-analytics-health` accepts an optional skill name
- spaced names are supported, for example `brainstorming advanced`
- extra positional arguments are rejected for the numeric commands (`overview`, `recent`, `export`)
- for `detail` and `health`, remaining tokens are joined and treated as part of the skill name

## Empty-state behavior

When the database has no matching rows, the commands return friendly empty-state results.

### `/skill-analytics-overview`

```text
Skill overview
No skill runs recorded.
```

### `/skill-analytics-detail missing-skill`

```text
Skill detail
No skill run found for "missing-skill".
```

### `/skill-analytics-health`

```text
Skill health
No health rows available.
```

### `/skill-analytics-recent`

```text
Recent skill runs
No recent skill runs recorded.
```

### `/skill-analytics-export`

```json
{
  "data": {
    "generatedAt": "2026-03-14T00:00:00.000Z",
    "overview": [],
    "recent": []
  }
}
```

## Unavailable startup state

If startup initialization fails, reads stay callable but return an unavailable message/payload.

Terminal commands render:

```text
Analytics unavailable
state: disabled-at-startup
Analytics commands are unavailable because startup initialization failed.
reason: <reason>
```

`/skill-analytics-export` returns JSON instead:

```json
{
  "unavailable": {
    "code": "analytics-unavailable",
    "state": "disabled-at-startup",
    "title": "Analytics unavailable",
    "detail": "Analytics commands are unavailable because startup initialization failed.",
    "reason": "<reason>"
  }
}
```

## Degraded runtime state

If analytics starts successfully but a later write fails, the runtime switches to `disabled-after-runtime-error`.

In that state:

- reads still work
- data comes from the last persisted snapshot
- terminal commands append a warning block
- export returns both `warning` and `data`

Warning block:

```text
Warning: Analytics collection disabled
Analytics collection stopped after a runtime error. Showing the last persisted data.
reason: <reason>
```

Example export shape:

```json
{
  "warning": {
    "code": "analytics-runtime-warning",
    "state": "disabled-after-runtime-error",
    "title": "Analytics collection disabled",
    "detail": "Analytics collection stopped after a runtime error. Showing the last persisted data.",
    "reason": "<reason>"
  },
  "data": {
    "generatedAt": "2026-03-14T00:00:00.000Z",
    "overview": [],
    "recent": []
  }
}
```

## Validation examples

Invalid numeric arguments return a controlled error:

```text
Invalid arguments for /skill-analytics-overview
- limit must be an integer between 1 and 50.
```

Unexpected extra args are rejected:

```text
Invalid arguments for /skill-analytics-export
- unexpected extra arguments: extra.
```

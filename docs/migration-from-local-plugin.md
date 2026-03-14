# Migration from local plugin

This guide replaces a checked-in local plugin such as `./plugins/skill-analytics.js` with the published package `opencode-analytics@<version>`.

## Before

```json
{
  "plugin": ["./plugins/skill-analytics.js"],
  "opencodeAnalytics": {
    "storagePath": "/absolute/path/to/analytics.sqlite"
  }
}
```

## After

Install the package:

```bash
npm install opencode-analytics@<version>
```

Then update `opencode.json`:

```json
{
  "plugin": ["opencode-analytics"],
  "opencodeAnalytics": {
    "storagePath": "/absolute/path/to/analytics.sqlite"
  }
}
```

## Migration steps

1. install `opencode-analytics@<version>`
2. replace `"./plugins/skill-analytics.js"` with `"opencode-analytics"`
3. keep your existing `opencodeAnalytics` config block if you already use overrides
4. restart OpenCode
5. verify the plugin entry and run `/skill-analytics-overview`

## What you can remove

After the package-based setup works, you can delete the local plugin file from your repo:

- `./plugins/skill-analytics.js`

If the old local plugin wrote to the same SQLite path, the package can keep reading that database as long as the schema and path still match your config.

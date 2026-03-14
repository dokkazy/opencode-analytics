# Install

This package is meant to run as an OpenCode plugin and uses Bun's SQLite runtime.

## npm install flow

In the OpenCode project where you want analytics:

```bash
npm install opencode-analytics@<version>
```

Replace `<version>` with the package version you want to install.

Create or update `opencode.json`:

```json
{
  "plugin": ["opencode-analytics"]
}
```

Restart OpenCode after changing the plugin list.

### Verify the config entry

```bash
bun -e "console.log(JSON.parse(require('node:fs').readFileSync('opencode.json', 'utf8')).plugin[0])"
```

Expected output:

```text
opencode-analytics
```

## Contributor local-dev flow

From this workspace root:

```bash
bun install
bun run check
```

To test the local package in a separate OpenCode project, install from the package folder instead of npm:

```bash
npm install /absolute/path/to/opencode-analytics/packages/opencode-analytics
```

Then add the same plugin entry:

```json
{
  "plugin": ["opencode-analytics"]
}
```

This local-path flow is useful when iterating on README, docs, or package behavior before publishing.

## What gets installed

The publish allowlist currently includes:

- `src/`
- `README.md`

Use `npm pack --dry-run --workspace opencode-analytics` from the workspace root to verify the final npm package contents before publishing.

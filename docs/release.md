# Release

This package is released from the workspace root.

## Pre-release checks

1. confirm package version in `packages/opencode-analytics/package.json`
2. confirm `packages/opencode-analytics/README.md` matches current behavior
3. confirm repo docs and `examples/basic-setup/` still match the code
4. run workspace verification

```bash
bun run check
```

## Verify package contents

The package allowlist currently publishes:

- `src/`
- `README.md`

Dry-run the npm package from the workspace root:

```bash
npm pack --dry-run --workspace opencode-analytics
```

Check that the dry run only includes the expected package files and metadata.

## Tarball smoke test

Use this scratch path for a local install test:

```text
.tmp/release-smoke/opencode-analytics
```

Use the tarball produced by `npm pack`. In the examples below, replace `<package-tarball>` with the emitted filename, typically `opencode-analytics-<version>.tgz`.

### POSIX shell example

```bash
npm pack --workspace opencode-analytics
mkdir -p .tmp/release-smoke/opencode-analytics
cd .tmp/release-smoke/opencode-analytics
npm init -y
npm install ../../../<package-tarball>
```

### PowerShell example

```powershell
npm pack --workspace opencode-analytics
New-Item -ItemType Directory -Force -Path .tmp/release-smoke/opencode-analytics | Out-Null
Set-Location .tmp/release-smoke/opencode-analytics
npm init -y
npm install ..\..\..\<package-tarball>
```

Create a minimal `opencode.json` in the smoke-test folder:

```json
{
  "plugin": ["opencode-analytics"]
}
```

Then verify the plugin entry:

```bash
bun -e "console.log(JSON.parse(require('node:fs').readFileSync('opencode.json', 'utf8')).plugin[0])"
```

Expected output:

```text
opencode-analytics
```

## npm publish

From the workspace root:

```bash
npm publish --workspace opencode-analytics
```

Recommended order:

1. `bun run check`
2. `npm pack --dry-run --workspace opencode-analytics`
3. tarball smoke test
4. `npm publish --workspace opencode-analytics`

## GitHub release steps

After the npm publish succeeds:

1. push the release commit/tag you want to ship
2. create a GitHub release for that version tag
3. summarize user-facing changes
4. include the npm package version and install command: `npm install opencode-analytics@<version>`
5. link to the migration guide if this release replaces local plugin usage

## First release notes

Use `docs/release-notes-v0.1.0.md` as the starting point for the first public GitHub release.

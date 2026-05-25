## Configuration, Build, and Release

[English](./config-build-release.md) | [简体中文](./config-build-release.zh-CN.md)

This document describes the currently supported configuration, local build, and release flow for OpenClaw Desktop. After the project is open-sourced, the main repository remains the single release source.

---

### 1. App Configuration

- Override default parameters with `.env` or `.env.local` in the project root:

```env
OPENCLAW_PORT=18789
OPENCLAW_NODE_PATH=/path/to/node
```

- OpenClaw Desktop depends on the OpenClaw config file at `~/.openclaw/openclaw.json`.

---

### 2. Local Build

- Development:

```bash
npm install
npm run bundle:node
npm run dev
```

- Production build:

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

- Build outputs are generated under `release/` by default.

---

### 3. GitHub Actions Workflows

The repository uses two workflows:

- `build.yml` for build validation
  - Triggers on `main` commits, pull requests, and manual runs
  - Builds the app and uploads GitHub Actions artifacts
  - Does not publish a GitHub Release (`--publish never`)

- `release.yml` for formal releases
  - Triggers on `v*` tags and manual runs
  - Builds the app and publishes assets to the main repository Releases

Manual build validation:

1. Open GitHub Actions.
2. Select `Build`.
3. Click `Run workflow`.
4. Download the `macos-x64-release`, `macos-arm64-release`, and `windows-release` artifacts from the finished run.

Formal release:

```bash
git tag v0.4.0
git push origin v0.4.0
```

---

### 4. macOS Signing and Notarization

CI requires these secrets:

- `MAC_CERTS`
- `MAC_CERTS_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

The release workflow completes signing and notarization in the macOS job.

---

### 5. Auto Update and Release Repository

Auto update and publishing currently point to the main repository `wzdavid/openclaw-desktop`:

| Component | Current Value |
|---|---|
| `package.json` `build.publish.repo` | `openclaw-desktop` |
| `electron/updater.ts` `GITHUB_REPO` | `openclaw-desktop` |
| CI publish credential | `GITHUB_TOKEN` with `contents: write` permission |

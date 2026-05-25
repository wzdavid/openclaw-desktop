## FAQ and Troubleshooting

[English](./faq-and-troubleshooting.md) | [简体中文](./faq-and-troubleshooting.zh-CN.md)

This document collects common questions and troubleshooting steps so users can solve typical issues on their own.

---

### 1. FAQ

#### Q1: Why does `openclaw` return `command not found` in the built-in terminal?

- Desktop automatically adds the bundled OpenClaw CLI to `PATH` inside the built-in terminal, so new terminals should normally run commands such as:
  - `openclaw gateway status`
  - `openclaw pairing approve`
- If it still fails, check:
  1. whether `npm run bundle:node` was executed during development, or whether you are using an official bundled build
  2. whether `resources/node/` contains the Node.js runtime and OpenClaw files

#### Q2: Where is OpenClaw installed, and how do I use it from a system terminal?

- **Inside the app terminal**
  - OpenClaw is bundled with the app under `node/node_modules/openclaw/`
  - in development this is usually similar to `./resources/node/node_modules/openclaw/`
- **From a system terminal**
  - the bundled CLI is not automatically added to the system `PATH`
  - you can either:
    1. install globally with `npm install -g openclaw`
    2. call the bundled Node.js and CLI directly, for example:
       `./resources/node/bin/node ./resources/node/node_modules/openclaw/openclaw.mjs gateway status`

#### Q3: What should I do if startup says `openclaw.mjs not found`?

- This usually means the bundled Node.js + OpenClaw setup step was not completed.
- Fix:
  - in development, run `npm run bundle:node` or `npm run bundle:node:win`
  - in production, prefer the official packaged installer instead of running the source tree directly

#### Q4: What if port `18789` is already in use?

- The default Gateway port is `18789`. If it is occupied:
  - set another port in `.env`, for example:

```env
OPENCLAW_PORT=18800
```

  - or find and stop the process using the port, for example on macOS:

```bash
lsof -i :18789
```

- Product recommendation:
  - Desktop should provide a clear error message and next-step guidance instead of failing silently or exiting abruptly.

#### Q5: How should first-time users configure OpenClaw?

- The recommended path is through the Desktop Control UI or config pages:
  - follow the UI to configure API keys, default models, and related settings
  - the resulting config is written to `~/.openclaw/openclaw.json`

#### Q6: Can I rename the `Main Agent`?

- Yes. You can either:
  1. use the Desktop app:
     - open **Settings -> Agents**
     - find the main agent with `id = main`
     - edit its display name
  2. edit the OpenClaw config directly:
     - open `~/.openclaw/openclaw.json`
     - find the `agents.list` entry whose `id` is `main`
     - change its `name`
- After saving, the assistant name should update in the chat UI as well.

#### Q7: What does `skipped macOS application code signing` mean during a build?

- It means the current build was not fully code-signed.
- The artifact can still work locally.
- For broad external distribution, full signing and notarization are recommended to reduce security prompts and installation failures.

#### Q8: What if GitHub is slow or update checks fail in mainland China?

- **Reason**: the app checks GitHub Releases by default, which can be unstable or slow from mainland China.
- **Suggestions**:
  1. **Manual update**: open **Settings** or **About**, click **Check for Updates**, and if GitHub cannot be reached, use the download page or manual-download entry to fetch a package from project-provided domestic links such as mirrors or CDN storage.
  2. **Use a proxy**: if your system or network already uses a proxy, retry the update check or let automatic update download in the background.
  3. **Disable startup update checks**: if you do not need updates immediately, turn off startup checks and update manually later.
- See [Update and Version Management Design](../architecture/update-design.md#4-multi-source-update-strategy-for-china) for the longer design discussion.

---

### 2. Troubleshooting Guide

#### 2.1 The app cannot connect to Gateway

1. Confirm that Gateway is running:
   - check the in-app console page
   - or run `openclaw gateway status`
2. Check the port configuration:
   - did `.env` override `OPENCLAW_PORT`
   - is another process already using that port
3. Check logs:
   - inspect recent output in the Desktop console page
   - if needed, start Gateway manually from a system terminal for more verbose logs

#### 2.2 The Desktop app shows a blank screen or the frontend fails to load

1. Confirm that the frontend build succeeds in development:
   - does `npm run dev` report errors
   - is the Vite dev server actually running
2. Check Electron packaging or build logs for missing files, bad paths, or permission issues.
3. Clean and rebuild:
   - remove temporary output folders such as `dist/`, `dist-electron/`, and `release/`
   - rerun `npm install`, `npm run bundle:node`, `npm run dev`, or the matching build command

#### 2.3 Auto update fails or behaves unexpectedly

1. Check network access:
   - can the machine reach GitHub Releases
   - is a proxy or enterprise firewall interfering
2. Check repository config:
   - do `electron/updater.ts` and `package.json` both point `GITHUB_REPO` or `build.publish.repo` to `openclaw-desktop`
   - is the main repository release page reachable
3. Check logs:
   - look for `electron-updater` messages in app logs and identify the exact error code

#### 2.4 Signing or notarization errors

1. For local builds:
   - verify that `.env.apple` exists and is correct
   - confirm that the certificate is installed in Keychain and that `TEAM_ID` and related values are correct
2. For CI builds:
   - verify the GitHub Actions secrets
   - inspect workflow logs for certificate import or Apple authentication failures

---

### 3. Suggested Product Improvements

Future improvements could include:

- a dedicated **Help and Support** page in Desktop
  - present key FAQ entries as cards
  - offer a **Copy diagnostics** action for bug reports
  - link to online documentation or GitHub Issues
- error messages that link directly to matching FAQ entries
  - for example, port conflicts or missing `openclaw.mjs`

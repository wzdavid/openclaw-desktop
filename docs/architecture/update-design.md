## Update and Version Management Design (Desktop + bundled OpenClaw)

[English](./update-design.md) | [简体中文](./update-design.zh-CN.md)

This design note focuses on two questions after a user installs OpenClaw Desktop:

- how to update the Desktop app itself, manually or automatically
- how to update the bundled OpenClaw runtime that ships with the app

---

### 1. Goals and Principles

- **Unified experience**: in most cases, users only need to update Desktop to receive newer OpenClaw capabilities.
- **Controlled risk**: OpenClaw upgrades may introduce incompatibilities, so versioning, rollback, and compatibility rules must be explicit.
- **Clear ownership boundaries**:
  - Desktop is responsible for packaging, distribution, update checks, and update triggers.
  - The OpenClaw core project is responsible for semantic versioning and compatibility guarantees.

---

### 2. Mainland China Network Constraints

If GitHub Releases is the only update source, mainland China users commonly hit two issues:

| Issue | Symptoms | Impact |
|------|------|------|
| Unstable access | `api.github.com` timeouts or intermittent failures | Update checks fail, or users believe there is no update |
| Slow downloads | GitHub asset servers are overseas | Update packages download very slowly or fail midway |

Because of this, the update design should explicitly support alternative release mirrors and a manual path that does not depend on GitHub being reachable.

---

### 3. Desktop Update Design

#### 3.1 Automatic Updates

- **Base approach**
  - Use `electron-updater` with GitHub Releases.
  - On startup, Desktop checks the current version against the latest available version.
  - When an update exists, Desktop can either:
    - show a prompt with the version and short changelog
    - download silently and apply on the next restart

- **Release information**
  - GitHub Releases use the `vX.Y.Z` naming pattern.
  - Each release contains:
    - platform-specific installers and updater metadata
    - release notes that summarize changes and list the bundled OpenClaw version

- **UI presentation**
  - Desktop should display an "update available" status in the UI.
  - The details dialog should show:
    - the new version
    - the main changes
    - the embedded OpenClaw version or compatibility range

#### 3.2 Manual Updates

- **Manual download from GitHub Releases**
  - Users open the GitHub Releases page.
  - They download the installer for their platform and replace the existing app as usual.

- **Built-in "Check for Updates" entry**
  - Add a button in `Settings` or `About`.
  - Trigger an update check on demand.
  - Show the current version, latest version, and release notes.
  - Provide a "Go to download page" option when direct auto update is not practical.

---

### 4. Multi-Source Update Strategy for China

Keep GitHub Releases as the default, but improve availability with configurable update sources, fallback logic, and manual download links.

#### 4.1 Options Overview

| Option | Description | Best For | Complexity |
|------|------|------|------|
| **A. Configurable update source** | Use a custom server through electron-updater's generic provider | self-hosted mirror, enterprise network | Medium |
| **B. Multi-source fallback** | Try a domestic mirror first, then fall back to GitHub | domestic-first user base with auto update expectations | Medium to high |
| **C. Multiple manual download links** | Keep auto update unchanged and expose more download links in UI/docs | quickest path with minimal implementation changes | Low |

Recommendation:

1. short term: ship option C with clear docs
2. medium term: add option A or B if a stable mirror is available

#### 4.2 Option A: Configurable Generic Provider

- Add a Desktop setting or environment variable for the update base URL.
- Example:
  - default: GitHub
  - custom: `https://releases.example.com/openclaw-desktop/`
- The mirror must expose updater metadata such as `latest.yml` and the platform installers produced by electron-builder.
- Suitable backends include object storage plus CDN, internal artifact hosting, or a mirrored release service.

Example design values:

- environment variable: `OPENCLAW_UPDATE_BASE_URL=https://releases.example.com/openclaw-desktop/`
- persisted app setting: `settings.update.baseUrl`

#### 4.3 Option B: Multi-Source Fallback

- Check sources in order, such as domestic mirror first and GitHub second.
- If any source reports a newer version, Desktop surfaces the update.
- Use the selected source for package download as well, so users do not fall back to slow GitHub downloads after a successful mirror check.
- The UI should show which source is being used when fallback occurs.

#### 4.4 Option C: Multiple Manual Download Links

- Keep the current automatic updater behavior unchanged.
- Improve the manual path:
  - when an update is detected, offer a **Manual Download** button
  - when GitHub cannot be reached, tell users that update checking failed and provide download links anyway
- The help page can list:
  - GitHub Releases for global users
  - domestic mirrors such as Gitee, object-storage CDN, or maintained cloud-drive links

The FAQ should also explain that GitHub may be slow or unreachable and provide the manual update path.

#### 4.5 Recommended Rollout Order

1. **Near term**: implement option C with better UI copy and documentation.
2. **Mid term**: add option A if a stable mirror exists.
3. **Optional later step**: add option B when multi-source version reconciliation is worth the extra complexity.

---

### 5. Strategy for the Bundled OpenClaw Runtime

#### 5.1 Bundling Model

Desktop uses scripts such as `bundle:node` to package:

- the Node.js runtime
- the `openclaw` npm package
- its dependencies

These artifacts are stored under `resources/node/` during development and then moved into the packaged app resources. The built-in terminal and the background Gateway process run against this bundled environment.

#### 5.2 Version Binding Options

Two layers need explicit policy:

1. **Desktop ↔ OpenClaw binding**
   - **Option A: strong binding** for the early stage
     - every Desktop version ships with a tested OpenClaw version
     - Desktop minor releases should not silently downgrade OpenClaw
     - release notes should explicitly list the embedded OpenClaw version, such as `Embedded OpenClaw: 0.9.3`
   - **Option B: weak binding plus independent updates**
     - Desktop checks whether OpenClaw itself can be upgraded independently
     - this requires compatibility matrices and rollback logic, so it is not recommended at the start

2. **OpenClaw package updates**
   - Recommended initial rule:
     - update bundled OpenClaw only through a full Desktop upgrade
     - avoid uncontrolled behavior such as silent `npm install openclaw@latest` on user machines
     - reduce hidden mismatches between Desktop and OpenClaw

#### 5.3 Version Information in the UI

Show this in `Config` or `About`:

- `OpenClaw Desktop vX.Y.Z`
- `OpenClaw Core vA.B.C`
- optionally `Node vN.M.P`

The update dialog should also mention whether the release contains an OpenClaw upgrade and whether any config compatibility notes apply.

---

### 6. Typical User Flows

#### 6.1 Automatic Update Flow

1. User launches Desktop.
2. Desktop checks for updates using the configured source.
3. If a new version exists:
   - UI shows `New version available vX.Y.Z (includes OpenClaw vA.B.C)`.
   - User chooses to update.
4. Desktop downloads the delta or full package.
5. Desktop asks the user to restart.
6. After restart, both Desktop and bundled OpenClaw are upgraded.

#### 6.2 Manual Update Flow

1. User clicks `Check for Updates`.
2. Desktop reports that a newer version exists.
3. User opens the download page.
4. User downloads and installs the new package.
5. Desktop and the bundled OpenClaw move to the new version together.

---

### 7. Rollback and Compatibility

#### 7.1 Rollback

- Keep several stable releases available for manual download.
- Document how users can manually install an older release if a severe regression happens.
- A local one-click rollback feature could be added later, but it significantly raises implementation and testing cost.

#### 7.2 Config Compatibility

The OpenClaw config at `~/.openclaw/openclaw.json` may evolve over time.

- Desktop upgrades should account for config migration and compatibility prompts.
- If a mismatch is detected, Desktop may:
  - tell the user to back up and migrate the config
  - invoke a minimal migration helper if one exists in OpenClaw core

---

### 8. Suggested Implementation Milestones

- **Short term (`v0.2.x`)**
  - adopt strong Desktop ↔ OpenClaw version binding
  - improve update prompts and release-note version disclosures
  - display the Desktop version and bundled OpenClaw version in the UI
  - implement the option C manual-update path for mainland China users

- **Mid term (`v0.3.x+`)**
  - add configurable update sources or multi-source fallback if a mirror becomes available
  - evaluate whether OpenClaw should ever be updated independently of Desktop
  - if independent updates are introduced, define:
    - a compatibility matrix
    - a secure online update mechanism
    - rollback behavior

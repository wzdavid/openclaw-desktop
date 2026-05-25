# Open-Source Readiness Checklist

[English](./open-source-checklist.md) | [简体中文](./open-source-checklist.zh-CN.md)

Use this checklist for the final review before OpenClaw Desktop is made public. Tick each item before opening the repository.

## 1. Code and Security

- [ ] No plaintext secrets, certificates, tokens, usernames, or passwords remain in the repository.
- [ ] `.env*`, certificate files, and temporary debug files are ignored by `.gitignore` and were not committed.
- [ ] No internal-only URLs, hostnames, paths, or contact details are exposed.
- [ ] The security disclosure path is available and consistent with `SECURITY.md` and GitHub Security settings.

## 2. Documentation Consistency

- [x] Navigation links in `README.md` and `docs/README.md` all work.
- [x] Documents describe only the currently supported workflows and exclude retired processes.
- [x] Build, release, and update flows are described consistently across documents.
- [x] Contributor-facing docs are complete: `CONTRIBUTING.md`, `SECURITY.md`, issue/PR templates, and `CODEOWNERS`.

## 3. Workflows and Release

- [ ] The `Build` workflow succeeds on `main` and pull requests.
- [ ] `Build` workflow artifacts can be downloaded and match the documented names.
- [ ] The `Release` workflow is triggered successfully by a `v*` tag.
- [ ] macOS signing and notarization complete reliably.
- [ ] GitHub Release assets are complete, including installers, update metadata, and blockmaps.

## 4. Update and Install Validation

- [x] The in-app update source matches the release source in the main repository Releases.
- [ ] Fresh installs work on macOS and Windows at least once each.
- [ ] Upgrade paths from an older version to the current version work at least once.
- [x] FAQ entries cover common installation and update issues.

## 5. Repository Launch Preparation

- [ ] Repository description, topics, license, and homepage URL are complete.
- [ ] Default branch protection rules are configured if required.
- [ ] Release notes for the first public version are ready.
- [ ] External announcement copy is ready.

## 6. First 24 Hours After Opening

- [ ] GitHub Actions run steadily without frequent failures.
- [ ] Issue templates work and the feedback entry points are clear.
- [ ] No blocking problems are reported for downloads or installation.
- [ ] Update checks and downloads do not show obvious failures.

---

## Execution Notes (2026-05-02)

Completed local automated checks:

- Documentation link check: all relative links under `docs/` passed, and two broken links in `providers-configuration.md` were fixed.
- Documentation entry check: relative links in `README.md` and `docs/README.md` passed.
- Configuration consistency check: the release target in `package.json` and the update source in `electron/updater.ts` both point to the main repository.
- Workflow structure check: `build.yml` handles build validation and artifacts, while `release.yml` handles tag-based publishing.
- Minimal build check: `npm run generate:provider-catalog` completed successfully.

Manual GitHub-side follow-up:

- Validate actual `Build` and `Release` workflow runs and asset completeness.
- Confirm macOS signing and notarization stability.
- Perform fresh install and upgrade tests on real machines.
- Confirm public repository settings, branch protection, release notes, and announcement material.

---

## Next Manual Steps

Follow this order to decide whether the project is ready for a public launch.

### 1) Run the Build Workflow

1. Open the repository `Actions` page on GitHub.
2. Select the `Build` workflow and click `Run workflow`.
3. Run it against the `main` branch.
4. Wait until `build-mac-x64`, `build-mac-arm64`, and `build-win` all succeed.
5. Download the artifacts from the run page and confirm that these names exist:
   - `macos-x64-release`
   - `macos-arm64-release`
   - `windows-release`

### 2) Run the Release Workflow

1. Create a test tag locally, for example:
   ```bash
   git tag v0.4.0-rc.1
   git push origin v0.4.0-rc.1
   ```
2. Open GitHub `Actions` and confirm that the `Release` workflow starts automatically and completes successfully.
3. Open repository `Releases` and confirm that the release contains all expected assets:
   - macOS: `.dmg`, `-mac.zip`, `latest-mac.yml`, and matching `.blockmap`
   - Windows: `.exe`, `latest.yml`, and matching `.blockmap`

### 3) Validate Install and Upgrade

1. Perform a clean install on both macOS and Windows using the release assets.
2. Upgrade from an older version to the current test version and confirm that the app starts successfully after the upgrade.
3. Run "Check for Updates" inside the app and confirm that it resolves to the main repository release.

### 4) Roll Back a Failed Test Tag

If the test release fails, delete the test tag and test release, then fix the issue and rerun:

```bash
# Delete the remote tag
git push origin :refs/tags/v0.4.0-rc.1

# Delete the local tag
git tag -d v0.4.0-rc.1
```

Delete the matching test Release manually from GitHub if needed.

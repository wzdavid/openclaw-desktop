# 🦞 OpenClaw Desktop

[English](./README.md) | [简体中文](./README.zh-CN.md)

OpenClaw Desktop is the cross-platform desktop client for OpenClaw, providing an out-of-the-box local app experience.

## Key Features

- One-click startup without requiring a manual Node.js installation
- Desktop chat and console interface connected to OpenClaw Gateway
- Automatic updates distributed from the main repository Releases
- Support for macOS / Windows / Linux

## Quick Start

### Development

```bash
npm install
npm run bundle:node        # macOS / Linux
npm run bundle:node:win    # Windows
npm run dev
```

### Build

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

Build artifacts are generated in the `release/` directory by default.

## CI/CD

- `Build` workflow: build validation and artifact upload without publishing
- `Release` workflow: publish to GitHub Releases when a `v*` tag is pushed

Release example:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Documentation

- English docs: `docs/README.md`
- Chinese docs: `docs/README.zh-CN.md`
- Build and release configuration: `docs/build-release/config-build-release.md`
- Open-source readiness checklist: `docs/open-source-checklist.md`
- FAQ and troubleshooting: `docs/support/faq-and-troubleshooting.md`
- Contributing guide: `CONTRIBUTING.md` | Chinese: `CONTRIBUTING.zh-CN.md`
- Security policy: `SECURITY.md` | Chinese: `SECURITY.zh-CN.md`

## Acknowledgements

OpenClaw Desktop is inspired by and builds on the work of:

1. OpenClaw: https://github.com/openclaw/openclaw
2. AEGIS Desktop: https://github.com/rshodoskar-star/openclaw-desktop

## License

This project is licensed under the MIT License. See `LICENSE` for details.

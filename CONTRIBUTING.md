# Contributing to OpenClaw Desktop

[English](./CONTRIBUTING.md) | [简体中文](./CONTRIBUTING.zh-CN.md)

Thank you for contributing to OpenClaw Desktop.

## Before You Start

- Read `README.md` and the relevant documents under `docs/`.
- Search existing issues before opening a new one.
- For larger changes, open an issue first to discuss the approach before sending a PR.

## Local Development

```bash
npm install
npm run bundle:node
npm run dev
```

Common build commands:

- `npm run build:mac`
- `npm run build:win`
- `npm run build:linux`

## Contribution Guidelines

- Keep each change focused on a single purpose instead of mixing unrelated work in one PR.
- Update code and documentation together whenever both are affected.
- Do not commit sensitive information such as keys, certificates, personal tokens, or internal-only endpoints.

Suggested commit prefixes, not required:

- `feat: ...`
- `fix: ...`
- `docs: ...`
- `chore: ...`

## Pull Request Flow

1. Fork the repository and create a branch such as `feat/...` or `fix/...`.
2. Complete the change and run self-checks.
3. Update related documentation and screenshots if the UI changed.
4. Open a PR and clearly describe:
   - the background of the change
   - the main modifications
   - how you validated it
   - rollback notes or risk notes when relevant

## Code of Conduct

- Communicate respectfully and constructively.
- Keep discussion focused on facts and practical improvements.

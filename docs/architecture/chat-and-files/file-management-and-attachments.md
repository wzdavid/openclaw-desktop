# File Management and Attachments (Desktop)

This note documents the current file-management, attachments, and voice-storage behavior in OpenClaw Desktop.

## Scope

- Conversation attachments staged before send (`attachments:stage`).
- Shared-folder cleanup (`attachments:cleanup`, `attachments:cleanupSession`).
- Upload storage operations (`uploads:*` IPC).
- Voice storage by session (`voice:save`, `voice:read`, `voice:cleanupSession`, `voice:cleanupExpired`).

## Storage Layout

Root is the configured `sharedFolder` (default: `~/.openclaw/shared`):

- `voice/<agentId>/<sessionKey>/<yyyyMMdd>/...`
- `.openclaw-desktop/uploads/<agentId>/<sessionKey>/<yyyyMMdd>/...`

Upload metadata sidecar:

- `<file>.openclaw-desktop-upload.json`

## IPC Contracts

### Attachments

- `attachments:stage`
  - Input: `sessionKey`, optional `agentId`, `files[]` (base64 or source path).
  - Output: staged rows with marker strings:
    - `[media attached: /abs/path]`
    - `[file attached: /abs/path]`
- `attachments:cleanup`
  - TTL + global size-budget cleanup for both voice and staged uploads.
- `attachments:cleanupSession`
  - Removes session-scoped upload and voice trees.

### Uploads

- `uploads:list`
- `uploads:open`
- `uploads:reveal`
- `uploads:exists`
- `uploads:read`
- `uploads:delete`
- `uploads:saveAs`
- `uploads:cleanup`
- `uploads:cleanupSession`

### Voice

- `voice:save(filename, base64, sessionKey?, agentId?)`
- `voice:read(filePath)` (confined under `sharedFolder/voice`)
- `voice:cleanupSession`
- `voice:cleanupExpired`

## UI Integration Status

- `MessageInput` uses `attachments:stage` first, then falls back to legacy inline/base64 behavior if staging fails.
- Settings page exposes attachment/voice temp cleanup metrics and actions.
- `FileManager` is wired to `managedFiles:*` (plus `uploads:*` where still needed), including preview/open/reveal/save/delete flows.
- Session lifecycle (`gateway.deleteSession` / `gateway.resetSession`) now runs best-effort managed cleanup:
  - `uploads.cleanupSession`
  - `managedFiles.cleanupSessionRefs({ kind: 'outputs' })`
  - `voice.cleanupSession`

## Safety Rules

- Path traversal is blocked by resolving and validating paths under allowed roots.
- Absolute reads are only allowed when still inside the managed root.
- Deletion APIs only operate on files under managed directories.

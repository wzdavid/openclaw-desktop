# OpenClaw Desktop Session File Management Plan

[English](./session-file-management-plan.md) | [简体中文](./session-file-management-plan.zh-CN.md)

## 1. Goals and Scope

This document defines the session-file management plan on the Desktop side based on the current `openclaw-desktop` implementation:

- Convert output file paths mentioned in a session into interactive file cards.
- Provide a unified management entry for user uploads, generated output files, and voice files.
- Route file operations through Electron main-process IPC (`open`, `reveal`, `read`, `saveAs`, `delete`).
- Perform best-effort session cleanup when a session is deleted or reset.

This document focuses on the relationship between sessions and files. Branding and packaging strategy are out of scope.

## 2. Current Baseline

### 2.1 IPC and Storage Capabilities

- Preload bridge:
  - `electron/preload.ts`
  - exposes `uploads.*`, `managedFiles.*`, `attachments.*`, and `voice.*`
- Main-process handlers:
  - `electron/main.ts`
  - `managedFiles:list/open/reveal/exists/read/delete/removeRef/saveAs/captureOutputs/cleanupSessionRefs`
  - `uploads:list/open/reveal/exists/read/delete/saveAs/cleanup/cleanupSession`
  - `voice:save/read/cleanupSession/cleanupExpired`
- Output indexing utility:
  - `electron/output-files-index.ts`
  - reads and writes output refs, extracts candidate paths, and supports paged queries

### 2.2 File Card Flow in the Session UI

- Entry point:
  - `ChatHandler.finalizeAssistantResponse -> captureManagedOutputRefs`
- Structured rendering:
  - `fileRefs` are injected into `chatStore.finalizeStreamingMessage`
  - `buildSemanticBlocks` creates `file-output` blocks
  - `ChatView` renders `FileResultCard`
- Card actions:
  - `Open`, `Reveal`, and `Path`
  - path resolution and IPC calls live in `src/components/Chat/ResultCards.tsx`

### 2.3 Recent Alignment Fixes

- Fixed early return in `captureManagedOutputRefs` so fallback logic works.
- Filled history mapping fields so `fileRefs` are not lost on history load.
- Expanded text and main-process path extraction to support:
  - `📎 file: ...`
  - `文件位置: ...`
  - `已保存到 <relative-file.ext>` / `saved to ...`
- Output action path resolution now supports relative paths, absolute paths, and `~/...`.
- The `Path` button now provides visible feedback through button state and toast.

## 3. Current Assessment

### 3.1 What Is Already Consistent

- Session messages can turn file paths into structured file cards.
- File cards support open, reveal, and copy-path actions.
- Output references are indexed instead of being shown only as text.
- Session lifecycle hooks include cleanup entries for uploads, output refs, and voice files.

### 3.2 Remaining Gaps

- Output path governance still relies mostly on "detect then register" and does not yet form a full guidance-plus-enforcement loop.
- Multi-agent workspace allowlist and registry capabilities are not yet surfaced systematically.
- Output-ref metadata can still be improved, especially for canonical and orphaned lifecycle handling.
- User-facing error messages for failed file-card actions still need to be more consistent.

## 4. Recommended Follow-Up Plan

### Task F1: Unify Output Path Guidance

- Align the Desktop-injected context in `ChatHandler` (`FILE OUTPUT RULES`) with explicit `outputs/` guidance.
- Standardize the model-facing default output behavior without breaking Desktop compatibility.

Acceptance:

- First-turn context in a new conversation clearly defines output directory rules.
- Generated file responses reliably match the file-card detection rules.

### Task F2: Freeze the Candidate Path Rule Table

- Turn supported path patterns into a document and test matrix:
  - absolute paths
  - relative paths
  - Chinese phrasing
  - English phrasing
  - quote and punctuation boundaries
- Continue expanding `electron/output-files-index.test.ts` and related frontend semantic tests.

Acceptance:

- New examples can be added as tests first to guard against regressions.

### Task F3: Unify File Action Feedback

- Standardize success and failure toasts for `Open`, `Reveal`, and `Path`.
- Provide user-friendly error text for unreachable paths such as `not_found` and `not_managed_ref`.

Acceptance:

- All three actions provide visible feedback instead of silent failure.

### Task F4: Align FileManager and Session Cards

- Ensure `FileManager` and session cards use the same path parsing and presentation rules.
- Keep the semantics between output refs and uploads clear: deleting a ref is not always the same as deleting a file.

Acceptance:

- The same file looks and behaves consistently in both the session UI and `FileManager`.

## 5. Data and Safety Boundaries

- All local file operations must go through main-process IPC. The renderer must not open local paths directly.
- Normalize paths and enforce root constraints to block path traversal.
- Apply existence and type checks for `read`, `delete`, `saveAs`, and similar operations.

## 6. Acceptance Checklist

- Output file paths in assistant messages reliably become file cards.
- `Open`, `Reveal`, and `Path` all provide visible feedback and diagnosable failures.
- File cards can be restored after history replay, not just during live streaming.
- `FileManager` can display session-related output and uploads and operate on them.
- Managed file cleanup runs as expected after session reset or delete.

## 7. Related Documents

- `docs/architecture/chat-and-files/file-management-and-attachments.md`

## 8. Preferred Path Simplification Strategy

To reduce the current complexity of a shared root plus scattered workspaces, use this unified approach:

- Keep storage close to the workspace: uploads and voice files are stored in the active agent workspace.
- Keep presentation unified: `FileManager` reads from an index instead of scanning directories.
- Keep outputs in place: generated output files stay at their original path and are tracked through refs rather than being moved.

### 8.1 Target Directory Layout

For each agent workspace, including the default workspace and independent workspaces:

- `<agentWorkspace>/uploads/<sessionKey>/<yyyyMMdd>/...`
- `<agentWorkspace>/voice/<sessionKey>/<yyyyMMdd>/...`

Generated output files:

- stay at the original path, typically inside the workspace, and are tracked via indexed refs

### 8.2 Target Index Format

Use a unified managed index, ideally a single file:

- `~/.openclaw/index/managed-files.jsonl`

The index should record `output`, `upload`, and `voice` entries with at least these fields:

- `id`
- `kind` (`output` / `upload` / `voice`)
- `path`
- `agentId`
- `sessionKey`
- `workspaceRoot`
- `relativePath` (optional)
- `mimeType`
- `size`
- `createdAt`
- `exists`
- `isCanonicalOutput` (optional for output entries)

### 8.3 Target FileManager Behavior

- List source: index-driven, not fixed-directory-driven
- Preview reading: use main-process IPC based on `path`
- Filters: `kind`, `agent`, `session`, `date`, `exists`
- Delete semantics:
  - output: delete the ref by default, optionally delete the file itself
  - upload and voice: delete the file and remove the index record

## 9. Executable Migration Plan

### Phase A: Low Risk, Land First

1. Upload path migration
   - file: `electron/conversation-files-cleanup.ts`
   - move uploads from `shared/.openclaw-desktop/uploads/...` to `agentWorkspace/uploads/...`

2. Voice path migration
   - file: `electron/main.ts` in `voice:save`
   - move voice storage from `shared/voice/...` to `agentWorkspace/voice/...`

3. Keep output-path detection available while simplifying the backend
   - files: `electron/main.ts`, `electron/output-files-index.ts`
   - write output refs into the unified `managed-files` index instead of maintaining a dedicated output index

Acceptance:

- New upload and voice files are stored under each agent workspace.
- Existing send, preview, and delete flows continue to work.

### Phase B: Unified Index

1. Add a unified index module
   - suggested file: `electron/managed-files-index.ts`
   - supports append, query, delete, and `updateExists`

2. Write index entries after upload and voice persistence
   - files: `electron/conversation-files-cleanup.ts`, `electron/main.ts`

3. Move output refs fully onto the unified model
   - keep only path extraction utilities
   - retire `outputFiles.*` APIs in favor of `managedFiles.*`

Acceptance:

- `output`, `upload`, and `voice` can all be queried through one unified index.
- `FileManager` can present them consistently by kind.

### Phase C: Full FileManager Switch

1. Make `FileManager` read from `managedFiles:list(kind=...)` or a unified list.
2. Route preview, open, reveal, saveAs, and delete through the unified ref model.
3. Optionally add a "repair index" action that rescans missing paths and marks them.

Acceptance:

- Files across different agent workspaces are manageable from one UI.
- The app no longer depends on a fixed shared root to operate correctly.

## 10. Risks and Mitigations

- Risk: an independent workspace is not writable
  - Mitigation: validate with `fs.access` before writing; if it fails, fall back to the main workspace and warn the user

- Risk: the index and filesystem drift out of sync
  - Mitigation: check `exists` during `FileManager` listing and mark missing entries instead of crashing

- Risk: delete semantics become confusing
  - Mitigation: make the UI explicitly distinguish "delete ref" from "delete file"

# OpenClaw Desktop Session Message Management Plan

[English](./session-message-management-plan.md) | [简体中文](./session-message-management-plan.zh-CN.md)

## 1. Goals and Scope

Based on the current `openclaw-desktop` implementation, this document defines the stable message-management plan on the Desktop side. The goals are:

- session isolation so that messages, streaming state, thinking streams, and quick replies never leak across sessions
- streaming responsiveness so assistant text, thinking output, and tool calls remain visible in real time within a session
- structured rendering through the unified `normalize -> semantic blocks -> response groups -> render blocks` pipeline
- history consistency so `chat.history` replay and live streaming render with the same semantics

This document covers session message management only. File indexing and file-manager governance are documented separately.

## 2. Current Baseline

### 2.1 Core Message Pipeline

- Gateway event handling: `src/services/gateway/Connection.ts` and `src/services/gateway/ChatHandler.ts`
- Normalization: `src/processing/normalizeGatewayMessage.ts`
- Semantic blocking: `src/processing/buildSemanticBlocks.ts`
- Grouping: `src/processing/buildResponseGroups.ts`
- Render projection: `src/processing/projectResponseGroup.ts`
- State container: `src/stores/chatStore.ts`
- Presentation layer: `src/components/Chat/ChatView.tsx` and `src/components/Chat/*`

### 2.2 Implemented Capabilities

- Session-scoped caches:
  - `messagesPerSession`, `_blocksCache`, `_groupsCache`
  - derived data is restored by `sessionKey` when switching sessions
- Session-scoped realtime state:
  - `typingBySession`
  - `thinkingBySession`
  - `quickRepliesBySession`
- Streaming message convergence:
  - `updateStreamingMessage` and `finalizeStreamingMessage` persist by exact `sessionKey`
  - lifecycle fallback finalization covers cases where `chat.final` is missing
- Tool and thinking visualization:
  - tool streams such as `agent.tool`, `agent.item kind=tool`, and `chat stream=tool` update cards in real time
  - thinking streams, including content-block extraction, render in real time and merge on finalize
- History replay consistency:
  - `chat.history` is mapped back into `ChatMessage` first and then re-enters the same derived pipeline
  - this cooperates with dedupe, timeout retry, background refresh, and session switching
- Response-group rendering:
  - the UI renders primarily from `responseGroups`
  - `Virtuoso` virtualizes by group to reduce streaming jitter

### 2.3 Recent Alignment Fixes

- `ChatHandler.captureManagedOutputRefs` no longer returns too early and now supports the fallback branch.
- `ChatView` history mapping now preserves `fileRefs`, `decisionOptions`, `workshopEvents`, and `sessionEvents`.
- File path extraction can now enter the `file-output` semantic block path and render file cards inside the session flow.

## 3. Current Gap Assessment

### 3.1 Core Pipeline Gaps

- The main path is usable, but observability is still weak:
  - there is no unified message-pipeline debug switch
  - complex flows such as tool interruption, abort, and history refresh are expensive to debug

### 3.2 Interaction Consistency Gaps

- Some actions still have weak feedback; copy-path has been improved, but other actions can still fail too quietly.
- Search and grouping behavior are implemented, but the regression matrix is not documented clearly enough.

### 3.3 Test Coverage Gaps

- Existing tests already cover key finalize behavior and file-path semantic extraction.
- Missing automation still includes:
  - cross-session interference for concurrent tool and thinking streams
  - grouping stability when `chat.history` and live streaming interleave
  - cleanup consistency for thinking and tool state in aborted or errored runs

## 4. Recommended Follow-Up Tasks

### Task M1: Improve Pipeline Observability

- Add a configurable debug switch to `ChatHandler`, driven by config or environment.
- Emit structured log fields for `delta`, `final`, `tool`, `thinking`, and `history`, including:
  - `sessionKey`
  - `runId`
  - `messageId`
  - `state`
  - `source`

Acceptance:

- With debug enabled, a full session lifecycle can be traced end to end.
- With debug disabled, regular logs stay clean.

### Task M2: Add Session-Isolation Regression Tests

- Add combined tests around `chatStore` and `ChatHandler`:
  - concurrent `delta`, `final`, `tool`, and `thinking` streams for two sessions
  - assertions that `messages`, `responseGroups`, `thinking`, and `quickReplies` do not leak into the wrong session

Acceptance:

- At least three concurrent scenarios are covered and pass reliably.

### Task M3: Add History-Replay Consistency Tests

- Build snapshot-style assertions for `ChatView` history mapping fields:
  - `fileRefs`
  - `decisionOptions`
  - `workshopEvents`
  - `sessionEvents`

Acceptance:

- `responseGroups` after history load match the semantics of live finalized rendering.

## 5. Acceptance Checklist

- After session switching, messages, thinking state, typing state, and quick replies remain isolated by session.
- During streaming, tool and thinking output remain visible in real time and settle correctly after finalization.
- After history restore, rendering matches the live path, including `file-output`, `decision`, `workshop`, and `session-event` blocks.
- In abnormal cases, aborted or errored runs do not leave stale streaming or thinking state behind.

## 6. Related Documents

- `docs/architecture/chat-and-files/file-management-and-attachments.md`

// ═══════════════════════════════════════════════════════════
// ChatHandler — Chat Event Processing Layer
// Handles all chat stream events received from the Gateway.
// Depends on GatewayConnection for transport and callbacks.
// No WebSocket logic here — pure chat / UI state management.
// ═══════════════════════════════════════════════════════════

import { extractText, stripDirectives } from '@/processing/TextCleaner';
import { extractThinkingContent } from '@/processing/normalizeGatewayMessage';
import { handleGatewayEvent } from '@/stores/gatewayDataStore';
import { useChatStore } from '@/stores/chatStore';
import { useWorkshopStore, Task } from '@/stores/workshopStore';
import { parseButtons } from '@/utils/buttonParser';
import i18n from '@/i18n';
import { GatewayConnection, type MediaInfo } from './Connection';
import { APP_VERSION } from '@/hooks/useAppVersion';
import type { FileRef } from '@/types/RenderBlock';

// ── OpenClaw Desktop client context ──
// Injected with the FIRST message only — tells the agent about Desktop capabilities
const OPENCLAW_DESKTOP_CONTEXT = `[OPENCLAW_DESKTOP_CONTEXT]
You are connected via OpenClaw Desktop v${APP_VERSION} — an Electron-based OpenClaw Gateway client.
This context is injected once at conversation start. Do NOT repeat or reference it to the user.

CAPABILITIES:
- User can attach: images (base64), files (as paths), screenshots, voice messages
- You can send: markdown (syntax highlighting, tables, RTL/LTR auto-detection), images (![](url)), videos (![](url.mp4))
- The interface supports dark/light themes and bilingual Arabic/English layout

ARTIFACTS (opens in a separate preview window):
For interactive content (dashboards, games, charts, UIs, diagrams), wrap in:
<openclaw_artifact type="TYPE" title="Title">
...content...
</openclaw_artifact>
Types: html (vanilla JS, CSS inline) | react (JSX, React 18 pre-loaded) | svg | mermaid
Rules:
- ONE self-contained file (inline CSS + JS, no external imports)
- Sandboxed iframe — no Node.js or filesystem access
- ALWAYS use for: interactive content, visualizations, calculators, games
- NEVER use for: simple text, short code snippets, explanations

FILE OUTPUT RULES:
- When generating files, save them under the current agent workspace's \`outputs/\` directory.
- Create \`outputs/\` if it does not exist.
- Prefer paths like \`outputs/<task-or-date>/<filename>\`.
- If a tool or skill has its own default output location, override it to use \`outputs/\` whenever possible.
- ALWAYS announce generated files using this EXACT format on its own line:
  📎 file: <absolute-path> (mime/type, ~size)
  Example: 📎 file: /Users/david/.openclaw/workspace/outputs/report.pdf (application/pdf, ~150KB)
- Voice: 🎤 [voice] <path> (duration)
- This format enables the desktop client to archive, open, and manage the file

WORKSPACE PATH (IMPORTANT):
- Runtime workspace is usually ~/.openclaw/workspace (or an agent-specific workspace)
- MEMORY files are in the runtime workspace (MEMORY.md, memory/)
- Always use the current runtime workspace for file operations

WORKSHOP (Kanban task management):
- [[workshop:add title="Task" priority="high|medium|low" description="Desc" agent="Name"]]
- [[workshop:move id="ID" status="queue|inProgress|done"]]
- [[workshop:delete id="ID"]]
- [[workshop:progress id="ID" value="0-100"]]
Commands execute automatically and are replaced with confirmations.

QUICK REPLIES (clickable buttons):
Add [[button:Label]] at the END of your message when you need a decision to proceed.
- Renders as clickable chips — click sends the text as a user message.
- Max 2-5 buttons. ONLY for decisions that block your next step.
- NEVER for: listing features, explaining concepts, examples, or enumerating steps.
[/OPENCLAW_DESKTOP_CONTEXT]`;

// ── Workshop Command Parser ──
// Parses [[workshop:action ...]] commands from agent messages
interface WorkshopCommandResult {
  cleanContent: string;
  executed: string[];
}

function parseAndExecuteWorkshopCommands(content: string): WorkshopCommandResult {
  const executed: string[] = [];
  const store = useWorkshopStore.getState();

  // Pattern: [[workshop:action param1="value1" param2="value2"]]
  const commandRegex = /\[\[workshop:(\w+)((?:\s+\w+="[^"]*")*)\]\]/g;

  const cleanContent = content.replace(commandRegex, (_match, action, paramsStr) => {
    try {
      // Parse params
      const params: Record<string, string> = {};
      const paramRegex = /(\w+)="([^"]*)"/g;
      let paramMatch;
      while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
        params[paramMatch[1]] = paramMatch[2];
      }

      switch (action) {
        case 'add': {
          const title = params.title || 'Untitled Task';
          const priority = (params.priority as Task['priority']) || 'medium';
          const description = params.description || '';
          const assignedAgent = params.agent || undefined;

          store.addTask({ title, priority, description, assignedAgent });
          executed.push(`✅ Added task: "${title}"`);
          break;
        }

        case 'move': {
          const id = params.id;
          const status = params.status as Task['status'];
          if (id && status && ['queue', 'inProgress', 'done'].includes(status)) {
            store.moveTask(id, status);
            executed.push(`✅ Moved task to ${status}`);
          } else {
            executed.push(`⚠️ Invalid move command`);
          }
          break;
        }

        case 'delete': {
          const id = params.id;
          if (id) {
            store.deleteTask(id);
            executed.push(`✅ Deleted task`);
          } else {
            executed.push(`⚠️ Invalid delete command`);
          }
          break;
        }

        case 'progress': {
          const id = params.id;
          const progress = parseInt(params.value || '0', 10);
          if (id && !isNaN(progress)) {
            store.setProgress(id, Math.min(100, Math.max(0, progress)));
            executed.push(`✅ Updated progress to ${progress}%`);
          }
          break;
        }

        case 'list': {
          const tasks = store.tasks;
          const summary = tasks.map(t => `- [${t.status}] ${t.title}`).join('\n');
          executed.push(`📋 Tasks:\n${summary}`);
          break;
        }

        default:
          executed.push(`⚠️ Unknown workshop command: ${action}`);
      }
    } catch (err) {
      executed.push(`❌ Error executing command: ${err}`);
    }

    return ''; // Remove the command from displayed content
  });

  return { cleanContent: cleanContent.trim(), executed };
}

// ═══════════════════════════════════════════════════════════
// ChatHandler Class
// ═══════════════════════════════════════════════════════════

export class ChatHandler {
  // ── Streaming state ──
  private currentRunIdBySession = new Map<string, string>();
  private currentStreamContentBySession = new Map<string, string>();
  private currentMessageIdBySession = new Map<string, string>();
  private syntheticMessageCounterBySession = new Map<string, number>();
  private streamConsumedBySession = new Map<string, number>();
  private textStreamSourceBySession = new Map<string, 'chat' | 'agent'>();
  private lastCompactionTs: number = 0;

  // ── Stream micro-batching ──
  // Buffer WebSocket chunks and flush to React every STREAM_FLUSH_MS
  // to reduce re-renders from every event to ~20 FPS max
  private static readonly STREAM_FLUSH_MS = 50;
  private streamFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingStreams = new Map<string, { id: string; content: string; media?: MediaInfo; runId?: string | null }>();
  private sessionKeyByRunId = new Map<string, string>();
  private finalizeFallbackTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(private conn: GatewayConnection) {}

  private bindRunToSession(sessionKey: string, runId?: unknown) {
    if (typeof runId === 'string' && runId.trim()) {
      this.sessionKeyByRunId.set(runId, sessionKey);
    }
  }

  private resolveSessionKey(sessionKey?: unknown, runId?: unknown): string | null {
    if (typeof sessionKey === 'string' && sessionKey.trim()) {
      this.bindRunToSession(sessionKey, runId);
      return sessionKey;
    }
    if (typeof runId === 'string' && runId.trim()) {
      return this.sessionKeyByRunId.get(runId) || null;
    }
    return null;
  }

  private static parseAgentIdFromSessionKey(sessionKey: string): string {
    const match = sessionKey.match(/^agent:([^:]+):/);
    return match?.[1] || 'main';
  }

  private formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  private async captureManagedOutputRefs(sessionKey: string, runId: string | null, text: string): Promise<FileRef[]> {
    const candidate = String(text || '').trim();
    if (!candidate) return [];
    try {
      const agentId = ChatHandler.parseAgentIdFromSessionKey(sessionKey);
      const captureFromText = window.aegis?.managedFiles?.captureOutputs;
      if (typeof captureFromText !== 'function') return [];

      const result = await captureFromText({
        sessionKey,
        agentId,
        runId,
        text: candidate,
      });
      if (!result?.success || !Array.isArray(result.refs)) return [];
      const refs = (result.refs as unknown[])
        .map((rawRef): FileRef | null => {
          const ref = rawRef as Record<string, unknown> | null | undefined;
          const filePath = String(ref?.path || ref?.managedPath || ref?.originalPath || '').trim();
          if (!filePath) return null;
          const mimeType = String(ref?.mimeType || 'application/octet-stream');
          const size = Number(ref?.size || 0);
          return {
            path: filePath,
            meta: `${mimeType}, ${this.formatFileSize(size)}`,
            kind: ref?.kind === 'voice' ? 'voice' : 'file',
            isCanonicalOutput: typeof ref?.isCanonicalOutput === 'boolean' ? ref.isCanonicalOutput : undefined,
            workspaceRoot: typeof ref?.workspaceRoot === 'string' ? ref.workspaceRoot : undefined,
            relativePath: typeof ref?.relativePath === 'string' ? ref.relativePath : undefined,
          } satisfies FileRef;
        })
        .filter((ref): ref is FileRef => ref !== null);
      return refs;
    } catch (err) {
      console.warn('[GW] capture output refs failed:', err);
      return [];
    }
  }

  /** Flush buffered stream content to the UI */
  private flushStream(sessionKey?: string) {
    const entries = sessionKey
      ? (this.pendingStreams.has(sessionKey) ? [[sessionKey, this.pendingStreams.get(sessionKey)!] as const] : [])
      : Array.from(this.pendingStreams.entries());

    for (const [key, pending] of entries) {
      if (!pending.content) continue;
      this.conn.callbacks?.onStreamChunk(
        key,
        pending.id,
        pending.content,
        pending.media,
        pending.runId,
      );
      this.pendingStreams.delete(key);
    }
    if (!sessionKey || this.pendingStreams.size === 0) {
      this.streamFlushTimer = null;
    }
  }

  /** Buffer a stream chunk — actual UI update happens at most every STREAM_FLUSH_MS */
  private bufferStreamChunk(sessionKey: string, id: string, content: string, media?: MediaInfo, runId?: string | null) {
    this.pendingStreams.set(sessionKey, { id, content, media, runId });

    if (!this.streamFlushTimer) {
      this.streamFlushTimer = setTimeout(() => this.flushStream(), ChatHandler.STREAM_FLUSH_MS);
    }
  }

  /** Force-flush any pending stream content (called before final/error/abort) */
  private forceFlushStream(sessionKey?: string) {
    if (this.streamFlushTimer) {
      clearTimeout(this.streamFlushTimer);
      this.streamFlushTimer = null;
    }
    this.flushStream(sessionKey);
  }

  private clearFinalizeFallback(sessionKey: string) {
    const timer = this.finalizeFallbackTimers.get(sessionKey);
    if (timer) {
      clearTimeout(timer);
      this.finalizeFallbackTimers.delete(sessionKey);
    }
  }

  private getDisplayStreamText(text: string): string {
    let cleaned = stripDirectives(text);
    cleaned = cleaned.replace(/\[\[workshop:\w+(?:\s+\w+="[^"]*")*\]\]/g, '');
    cleaned = cleaned.replace(/\[\[button:[^\]]+\]\]/g, '');
    return cleaned;
  }

  private getPayloadMessageId(payload: any): string {
    const candidateIds = [
      payload?.messageId,
      payload?.message?.id,
      payload?.message?.messageId,
      payload?.data?.messageId,
    ];
    return candidateIds.find((value): value is string => typeof value === 'string' && value.trim().length > 0) || '';
  }

  private createSyntheticMessageId(sessionKey: string, runId: string): string {
    const nextSeq = (this.syntheticMessageCounterBySession.get(sessionKey) || 0) + 1;
    this.syntheticMessageCounterBySession.set(sessionKey, nextSeq);
    return `live:${sessionKey}:${runId || 'runless'}:${nextSeq}`;
  }

  private ensureActiveMessageId(sessionKey: string, runId: string, payload?: any): string {
    const activeRunId = this.currentRunIdBySession.get(sessionKey);
    const activeMessageId = this.currentMessageIdBySession.get(sessionKey);
    const payloadMessageId = this.getPayloadMessageId(payload);

    if (activeRunId === runId && activeMessageId) {
      return activeMessageId;
    }

    const messageId = payloadMessageId || this.createSyntheticMessageId(sessionKey, runId);
    this.currentMessageIdBySession.set(sessionKey, messageId);
    return messageId;
  }

  private getSegmentText(sessionKey: string, rawContent: string): string {
    const consumed = this.streamConsumedBySession.get(sessionKey) || 0;
    return consumed > 0 && rawContent.length > consumed
      ? rawContent.slice(consumed)
      : rawContent;
  }

  private clearActiveResponse(sessionKey: string) {
    const runId = this.currentRunIdBySession.get(sessionKey);
    if (runId) this.sessionKeyByRunId.delete(runId);
    this.currentStreamContentBySession.delete(sessionKey);
    this.currentRunIdBySession.delete(sessionKey);
    this.currentMessageIdBySession.delete(sessionKey);
    this.streamConsumedBySession.delete(sessionKey);
    this.textStreamSourceBySession.delete(sessionKey);
  }

  private closeCurrentStreamSegment(sessionKey: string, media?: MediaInfo) {
    this.clearFinalizeFallback(sessionKey);
    this.forceFlushStream(sessionKey);
    const messageId = this.currentMessageIdBySession.get(sessionKey);
    const content = this.currentStreamContentBySession.get(sessionKey) || '';
    const segmentText = this.getSegmentText(sessionKey, content);
    if (messageId && segmentText.trim()) {
      const runId = this.currentRunIdBySession.get(sessionKey) || null;
      useChatStore.getState().finalizeStreamingMessage(
        messageId,
        this.getDisplayStreamText(segmentText),
        {
          ...(media ? { mediaUrl: media.mediaUrl, mediaType: media.mediaType } : {}),
          ...(runId ? { runId } : {}),
          responseState: 'final',
        },
        sessionKey,
      );
    }
    this.currentStreamContentBySession.delete(sessionKey);
    this.currentMessageIdBySession.delete(sessionKey);
  }

  private async finalizeAssistantResponse(sessionKey: string, messageId: string, messageText: string, media?: MediaInfo) {
    this.clearFinalizeFallback(sessionKey);
    this.forceFlushStream(sessionKey);

    const currentStreamContent = this.currentStreamContentBySession.get(sessionKey) || '';
    const segmentContent = this.getSegmentText(sessionKey, currentStreamContent);
    let finalText = messageText
      ? this.getSegmentText(sessionKey, messageText)
      : segmentContent;
    const runId = this.currentRunIdBySession.get(sessionKey) || null;
    this.bindRunToSession(sessionKey, runId);
    this.clearActiveResponse(sessionKey);

    finalText = stripDirectives(finalText || '');

    const { cleanContent, executed } = parseAndExecuteWorkshopCommands(finalText);
    const workshopEvents =
      executed.length > 0
        ? executed.map((text) => ({
          kind: text.startsWith('⚠️') ? 'warning' : 'info',
          text,
        }))
        : [];
    if (executed.length > 0) {
      finalText = cleanContent + (cleanContent ? '\n\n' : '') + executed.join('\n');
    } else {
      finalText = cleanContent || finalText;
    }

    const btnResult = parseButtons(finalText);
    if (btnResult.buttons.length > 0) {
      finalText = btnResult.cleanContent;
      useChatStore.getState().setQuickReplies(btnResult.buttons, sessionKey);
    } else {
      useChatStore.getState().setQuickReplies([], sessionKey);
    }

    const fileRefs = await this.captureManagedOutputRefs(sessionKey, runId, finalText);
    this.conn.callbacks?.onStreamEnd(
      sessionKey,
      messageId,
      finalText,
      media,
      {
        state: 'final',
        refreshHistory: true,
        runId,
        ...(fileRefs.length > 0 ? { fileRefs } : {}),
        ...(btnResult.buttons.length > 0 ? { decisionOptions: btnResult.buttons } : {}),
        ...(workshopEvents.length > 0 ? { workshopEvents } : {}),
      },
    );
  }

  private handleAssistantStream(payload: any) {
    const sessionKey = this.resolveSessionKey(payload.sessionKey, payload.runId);
    if (!sessionKey) return;

    const explicitRunId = typeof payload.runId === 'string' && payload.runId ? payload.runId : '';
    const activeRunId = this.currentRunIdBySession.get(sessionKey) || '';
    const runId = explicitRunId || activeRunId;
    if (!runId) return;
    this.bindRunToSession(sessionKey, runId);

    const data = payload.data ?? {};
    const fullText = typeof data.text === 'string' ? data.text : '';
    const delta = typeof data.delta === 'string' ? data.delta : '';
    const nextText = fullText || ((this.currentStreamContentBySession.get(sessionKey) || '') + delta);
    if (!nextText) return;

    const source = this.textStreamSourceBySession.get(sessionKey);
    if (source === 'chat' && activeRunId === runId) return;
    if (!source || activeRunId !== runId) {
      this.textStreamSourceBySession.set(sessionKey, 'agent');
    }

    this.clearFinalizeFallback(sessionKey);
    const currentStreamContent = this.currentStreamContentBySession.get(sessionKey) || '';
    const shouldSplit =
      Boolean(fullText)
      && Boolean(currentStreamContent)
      && fullText !== currentStreamContent
      && !fullText.startsWith(currentStreamContent);
    if (shouldSplit) {
      this.closeCurrentStreamSegment(sessionKey);
      this.streamConsumedBySession.delete(sessionKey);
    }
    const messageId = this.ensureActiveMessageId(sessionKey, runId, payload);
    const comparisonBaseLength = shouldSplit ? 0 : currentStreamContent.length;
    if (nextText.length >= comparisonBaseLength) {
      this.currentStreamContentBySession.set(sessionKey, nextText);
      this.currentRunIdBySession.set(sessionKey, runId);
      this.bindRunToSession(sessionKey, runId);
      const segmentText = this.getSegmentText(sessionKey, nextText);
      this.bufferStreamChunk(sessionKey, messageId, this.getDisplayStreamText(segmentText), undefined, runId);

      const liveThinking = extractThinkingContent(data.content ?? data.message?.content);
      if (liveThinking) {
        useChatStore.getState().setThinkingStream(runId, liveThinking, sessionKey);
      }
    }
  }

  private handleLifecycleStream(payload: any) {
    const sessionKey = this.resolveSessionKey(payload.sessionKey, payload.runId);
    if (!sessionKey) return;
    const runId = typeof payload.runId === 'string' && payload.runId
      ? payload.runId
      : this.currentRunIdBySession.get(sessionKey) || '';
    if (!runId) return;
    this.bindRunToSession(sessionKey, runId);

    const phase = typeof payload.data?.phase === 'string' ? payload.data.phase : '';
    if (phase === 'start') {
      const active = this.currentRunIdBySession.get(sessionKey) || '';
      const currentText = this.currentStreamContentBySession.get(sessionKey) || '';
      if (active === runId && currentText.trim()) {
        const consumed = currentText.length;
        this.closeCurrentStreamSegment(sessionKey);
        this.streamConsumedBySession.set(sessionKey, consumed);
      }
      return;
    }

    if (phase !== 'end') return;

    this.forceFlushStream(sessionKey);
    this.clearFinalizeFallback(sessionKey);
    const timer = setTimeout(() => {
      const activeRunId = this.currentRunIdBySession.get(sessionKey);
      if (!activeRunId || activeRunId !== runId) return;
      const currentText = this.currentStreamContentBySession.get(sessionKey) || '';
      if (!currentText) return;
      const segmentText = this.getSegmentText(sessionKey, currentText);
      if (!segmentText.trim()) return;
      const messageId = this.currentMessageIdBySession.get(sessionKey) || this.ensureActiveMessageId(sessionKey, runId);
      void this.finalizeAssistantResponse(sessionKey, messageId, segmentText);
    }, 180);
    this.finalizeFallbackTimers.set(sessionKey, timer);
  }

  // ── Desktop context injection ──
  injectDesktopContext(message: string): string {
    if (!this.conn.contextSent && message.trim()) {
      this.conn.contextSent = true;
      console.log('[GW] 📋 Desktop context injected with first message');
      return `${OPENCLAW_DESKTOP_CONTEXT}\n\n${message}`;
    }
    return message;
  }

  // ═══════════════════════════════════════════════════════════
  // Tool Stream Handler — real-time tool execution display
  //
  // `event:"chat"` or `event:"agent"` with `stream:"tool"` / `stream:"item"` (kind tool).
  // Always updates the session tool row — independent of Settings "tool intent" UI toggle.
  // ═══════════════════════════════════════════════════════════
  handleToolStream(payload: any) {
    const data = payload.data ?? {};
    const toolCallId = typeof data.toolCallId === 'string' ? data.toolCallId : '';
    const toolName = typeof data.name === 'string' ? data.name : 'tool';
    const phase    = typeof data.phase === 'string' ? data.phase : '';

    if (!toolCallId) return;
    const msgId    = `tool-live-${toolCallId}`;

    const sessionKey = this.resolveSessionKey(payload.sessionKey, payload.runId) || 'agent:main:main';
    const runId =
      typeof payload.runId === 'string' && payload.runId.trim() ? payload.runId : null;
    this.bindRunToSession(sessionKey, runId);

    const store = useChatStore.getState();
    const listFor = () => store.getCachedMessages(sessionKey) || [];

    if (phase === 'start') {
      const currentContent = this.currentStreamContentBySession.get(sessionKey) || '';
      if (currentContent.trim()) {
        const newConsumed = currentContent.length;
        this.closeCurrentStreamSegment(sessionKey);
        this.streamConsumedBySession.set(sessionKey, newConsumed);
      }
      // Tool is starting — add a 'running' card (idempotent)
      const msgs = listFor();
      if (!msgs.some((m) => m.id === msgId)) {
        const toolInput = data.args && typeof data.args === 'object' ? data.args : {};
        store.addMessage(
          {
            id: msgId,
            role: 'tool',
            content: '',
            runId,
            toolName,
            toolInput,
            toolStatus: 'running',
            responseState: 'streaming',
            timestamp: new Date().toISOString(),
          },
          sessionKey,
        );
      }
      return;
    }

    if (phase === 'update') {
      // Partial result streaming — update existing card
      const partial = data.partialResult != null
        ? (typeof data.partialResult === 'string' ? data.partialResult : JSON.stringify(data.partialResult))
        : '';
      const msgs = listFor();
      const idx  = msgs.findIndex((m) => m.id === msgId);
      if (idx >= 0) {
        const updated = [...msgs];
        updated[idx] = { ...updated[idx], toolOutput: partial.slice(0, 2000) };
        store.setMessages(updated, sessionKey);
      }
      return;
    }

    if (phase === 'result') {
      // Tool complete — finalize with output + duration
      const output = data.result != null
        ? (typeof data.result === 'string' ? data.result : JSON.stringify(data.result))
        : '';
      const msgs = listFor();
      const idx  = msgs.findIndex((m) => m.id === msgId);
      if (idx >= 0) {
        const updated = [...msgs];
        const startTs = typeof payload.ts === 'number' ? payload.ts : 0;
        const durationMs = startTs > 0 ? Date.now() - startTs : undefined;
        updated[idx] = {
          ...updated[idx],
          runId: runId ?? updated[idx].runId ?? null,
          toolOutput: output.slice(0, 2000),
          toolStatus: 'done',
          responseState: 'final',
          ...(durationMs !== undefined ? { toolDurationMs: durationMs } : {}),
        };
        store.setMessages(updated, sessionKey);
      } else {
        // No 'start' event received — add result card directly
        store.addMessage(
          {
            id: msgId,
            role: 'tool',
            content: '',
            runId,
            toolName,
            toolOutput: output.slice(0, 2000),
            toolStatus: 'done',
            responseState: 'final',
            timestamp: new Date().toISOString(),
          },
          sessionKey,
        );
      }
      return;
    }

    console.log('[GW] Tool stream — unknown phase:', phase, toolCallId);
  }

  // ═══════════════════════════════════════════════════════════
  // Thinking Stream Handler — real-time reasoning display
  //
  // Gateway sends: { type:"event", event:"chat", payload: {
  //   stream: "thinking",
  //   runId, sessionKey?,
  //   data: {
  //     text: string,   // full accumulated thinking text
  //     delta: string,  // new portion only
  //   }
  // }}
  // ═══════════════════════════════════════════════════════════
  handleThinkingStream(payload: any) {
    const data = payload.data ?? {};
    const sessionKey = this.resolveSessionKey(payload.sessionKey, payload.runId) || 'agent:main:main';
    const runId = payload.runId || this.currentRunIdBySession.get(sessionKey) || `thinking:${sessionKey}`;
    this.bindRunToSession(sessionKey, runId);

    if (!runId) return;

    const store = useChatStore.getState();
    const previousThinking = store.thinkingBySession[sessionKey]?.text || '';
    const text = typeof data.text === 'string'
      ? data.text
      : typeof data.delta === 'string' && data.delta
        ? `${previousThinking}${data.delta}`
        : '';
    if (!text) return;

    store.setThinkingStream(runId, text, sessionKey);
  }

  // ═══════════════════════════════════════════════════════════
  // Event Handler — OpenClaw Protocol
  //
  // Gateway sends: { type:"event", event:"chat", payload: {
  //   state: "delta" | "final" | "error" | "aborted",
  //   message: { role, content },  // content: string | [{type:"text",text:"..."}]
  //   sessionKey, runId
  // }}
  //
  // "delta" = streaming update (accumulated content, NOT a chunk)
  // "final" = complete, fetch full history
  // ═══════════════════════════════════════════════════════════
  handleEvent(msg: any) {
    const event = msg.event || '';
    const p = msg.payload || {};
    const sessionKey = this.resolveSessionKey(p.sessionKey, p.runId) || p.sessionKey || '';

    // ── Direct compaction detection from agent events ──
    // Instead of relying on polling tokenUsage.compactions (unreliable timing),
    // intercept the agent compaction event and inject CompactDivider immediately.
    if (event === 'agent' && p.stream === 'compaction' && p.data?.phase === 'end' && !p.data?.willRetry) {
      const sk = p.sessionKey || '';
      if (sk === 'agent:main:main' || !sk) {
        const now = Date.now();
        if (now - this.lastCompactionTs > 10_000) { // Dedup: max 1 per 10s
          this.lastCompactionTs = now;
          useChatStore.getState().addMessage({
            id: `compaction-live-${now}`,
            role: 'compaction',
            content: '',
            timestamp: new Date().toISOString(),
          });
          console.log('[GW] 📦 Compaction detected — divider injected');
        }
      }
    }

    if (event === 'agent' && p.stream === 'assistant') {
      if (sessionKey && (sessionKey.includes(':subagent:') || sessionKey.includes(':cron:'))) return;
      this.handleAssistantStream(p);
      return;
    }

    if (event === 'agent' && p.stream === 'lifecycle') {
      if (sessionKey && (sessionKey.includes(':subagent:') || sessionKey.includes(':cron:'))) return;
      this.handleLifecycleStream(p);
      return;
    }

    if (event === 'agent' && p.stream === 'tool') {
      if (sessionKey && (sessionKey.includes(':subagent:') || sessionKey.includes(':cron:'))) return;
      this.handleToolStream(p);
      return;
    }

    if (event === 'agent' && p.stream === 'thinking') {
      if (sessionKey && (sessionKey.includes(':subagent:') || sessionKey.includes(':cron:'))) return;
      this.handleThinkingStream(p);
      return;
    }

    // Agent "item" stream — newer event format for tool lifecycle.
    if (event === 'agent' && p.stream === 'item' && p.data?.kind === 'tool') {
      if (sessionKey && (sessionKey.includes(':subagent:') || sessionKey.includes(':cron:'))) return;
      const data = p.data;
      const itemId = typeof data.itemId === 'string' ? data.itemId : '';
      const toolCallId = itemId.replace(/^tool:/, '');
      if (toolCallId) {
        const title = typeof data.title === 'string' ? data.title : '';
        this.handleToolStream({
          sessionKey: p.sessionKey,
          runId: p.runId,
          ts: p.ts || data.startedAt,
          data: {
            toolCallId,
            name: data.name || title.split(/\s/)[0] || 'tool',
            phase: data.phase === 'end' ? 'result' : (data.phase || 'start'),
            args: data.toolArgs || data.args || (title ? { task: title } : {}),
            result: data.output || data.result || '',
          },
        });
      }
      return;
    }

    // Non-chat events → forward to central data store
    if (event !== 'chat') {
      handleGatewayEvent(event, p);
      return;
    }

    // Filter out events from isolated cron/sub-agent sessions
    // Only show messages from main session or sessions the user explicitly opened
    // Block only truly isolated sessions (cron jobs and sub-agent runs).
    // Main sessions may use any suffix: agent:main:main, agent:main:webchat, etc.
    if (sessionKey && (sessionKey.includes(':subagent:') || sessionKey.includes(':cron:'))) {
      console.log('[GW] Ignoring event from isolated session:', sessionKey);
      return;
    }

    // ── Tool stream events (real-time tool execution) ──
    // payload.stream === "tool" → tool call lifecycle events (start/update/result)
    if (p.stream === 'tool') {
      this.handleToolStream(p);
      return;
    }

    // ── Thinking stream events (real-time reasoning display) ──
    // payload.stream === "thinking" → accumulated reasoning text
    if (p.stream === 'thinking') {
      this.handleThinkingStream(p);
      return;
    }

    // Compaction stream from chat events — already handled above via agent events
    if (p.stream === 'compaction') return;

    const state = p.state || '';
    const runId = p.runId || '';
    let messageText = extractText(p.message?.content);

    // Extract mediaUrl from payload fields
    let mediaUrl = p.mediaUrl || p.message?.mediaUrl || (p.mediaUrls?.length ? p.mediaUrls[0] : undefined);
    let mediaType = p.mediaType || p.message?.mediaType || undefined;

    // Also extract MEDIA: paths/URLs from message content (OpenClaw TTS format)
    // Formats:
    //   MEDIA:http://localhost:5050/audio/xxx.mp3   (HTTP URL — preferred)
    //   MEDIA:/host-d/clawdbot-shared/voice/xxx.mp3 (shared folder path)
    //   MEDIA:/tmp/tts-xxx/voice-123.mp3            (sandbox path — needs conversion)
    const mediaMatch = messageText.match(/MEDIA:(https?:\/\/[^\s]+|\/[^\s]+|[A-Z]:\\[^\s]+)/);
    if (mediaMatch) {
      let mediaPath = mediaMatch[1];
      mediaType = mediaType || 'audio';
      // Remove the MEDIA: line from displayed text
      messageText = messageText.replace(/\n?MEDIA:[^\s]+\n?/g, '').trim();

      if (!mediaUrl) {
        if (/^https?:\/\//.test(mediaPath)) {
          // HTTP URL — use directly (Edge TTS server or any HTTP source)
          mediaUrl = mediaPath;
          console.log('[GW] 🔊 Media URL (HTTP):', mediaUrl);
        } else {
          // File path — resolve via Electron IPC
          mediaUrl = `aegis-media:${mediaPath}`;
          console.log('[GW] 🔊 Media path:', mediaPath);
        }
      }
    }

    const media: MediaInfo | undefined = mediaUrl ? { mediaUrl, mediaType } : undefined;

    console.log('[GW] Chat event — state:', state, 'runId:', runId?.substring(0, 12), 'text length:', messageText.length, 'text preview:', messageText.substring(0, 80));

    const stableRunKey = runId || this.currentRunIdBySession.get(sessionKey) || `runless:${sessionKey}`;
    const mId = this.ensureActiveMessageId(sessionKey, stableRunKey, p);
    const effectiveRunId = runId || mId;
    if (sessionKey) this.bindRunToSession(sessionKey, effectiveRunId);

    // ── Reasoning message detection ──
    // When reasoningLevel='on', Gateway sends reasoning as a separate 'final'
    // message prefixed with "Reasoning:" BEFORE the actual response.
    // We intercept it and store as thinking content for the next message.
    const reasoningPrefix = /^Reasoning:\s*/i;
    if (state === 'final' && messageText && reasoningPrefix.test(messageText)) {
      const reasoningText = messageText.replace(reasoningPrefix, '').trim();
      if (reasoningText) {
        console.log('[GW] 🧠 Reasoning message captured:', reasoningText.length, 'chars');
        // Store as live thinking, then it will be finalized onto the next assistant message
        useChatStore.getState().setThinkingStream(runId || mId, reasoningText, sessionKey || 'agent:main:main');
      }
      this.clearFinalizeFallback(sessionKey);
      this.clearActiveResponse(sessionKey);
      return; // Don't show as a regular message
    }

    switch (state) {
      case 'delta': {
        const source = this.textStreamSourceBySession.get(sessionKey);
        const activeRunId = this.currentRunIdBySession.get(sessionKey) || '';
        if (source === 'agent' && activeRunId === effectiveRunId) {
          break;
        }
        this.textStreamSourceBySession.set(sessionKey, 'chat');
        if (activeRunId && activeRunId !== effectiveRunId) {
          // New run started before previous stream fully settled; avoid cross-run bleed.
          this.currentStreamContentBySession.delete(sessionKey);
        }
        // Clean content for display (don't execute workshop commands during streaming)
        let cleaned = messageText;
        cleaned = stripDirectives(cleaned);
        // Strip workshop commands visually (don't execute — that happens on final)
        cleaned = cleaned.replace(/\[\[workshop:\w+(?:\s+\w+="[^"]*")*\]\]/g, '');
        // Strip button markers visually
        cleaned = cleaned.replace(/\[\[button:[^\]]+\]\]/g, '');

        const currentStreamContent = this.currentStreamContentBySession.get(sessionKey) || '';
        if (cleaned.length >= currentStreamContent.length || messageText.length >= currentStreamContent.length) {
          this.currentStreamContentBySession.set(sessionKey, messageText); // Keep RAW for final processing
          this.currentRunIdBySession.set(sessionKey, effectiveRunId);
          // Micro-batch: buffer chunk, flush to React at most every 50ms
          const segmentText = this.getSegmentText(sessionKey, messageText);
          this.bufferStreamChunk(sessionKey, mId, this.getDisplayStreamText(segmentText), media, runId || null);

          const sk = sessionKey || 'agent:main:main';
          const liveThinkingFromBlocks = extractThinkingContent(p.message?.content);
          if (liveThinkingFromBlocks) {
            useChatStore.getState().setThinkingStream(effectiveRunId || mId, liveThinkingFromBlocks, sk);
          }
        }
        break;
      }

      case 'final': {
        // Message complete — use the most complete version available.
        // When tools are called mid-response, the final event may only contain
        // post-tool text. In that case, keep the accumulated streaming content.
        const activeRunId = this.currentRunIdBySession.get(sessionKey) || '';
        const streamContent = !activeRunId || activeRunId === effectiveRunId
          ? (this.currentStreamContentBySession.get(sessionKey) || '')
          : '';
        let finalText = messageText || streamContent;
        if (streamContent && streamContent.length > (messageText?.length || 0)) {
          finalText = streamContent;
        }
        void this.finalizeAssistantResponse(sessionKey, mId, finalText, media);
        break;
      }

      case 'error': {
        this.forceFlushStream(sessionKey);
        this.clearFinalizeFallback(sessionKey);
        const errorText = p.errorMessage || i18n.t('errors.occurred');
        this.clearActiveResponse(sessionKey);
        useChatStore.getState().clearThinking(sessionKey || 'agent:main:main');
        this.conn.callbacks?.onStreamEnd(
          sessionKey || 'agent:main:main',
          mId,
          `⚠️ ${errorText}`,
          undefined,
          { state: 'error', runId: runId || null },
        );
        break;
      }

      case 'aborted': {
        this.forceFlushStream(sessionKey);
        this.clearFinalizeFallback(sessionKey);
        // Use messageText from abort event, fall back to accumulated stream content
        const activeRunId = this.currentRunIdBySession.get(sessionKey) || '';
        const currentText = this.currentStreamContentBySession.get(sessionKey) || '';
        const sameRun = !activeRunId || activeRunId === effectiveRunId;
        const finalContent = messageText || (sameRun ? currentText : '');
        this.clearActiveResponse(sessionKey);
        useChatStore.getState().clearThinking(sessionKey || 'agent:main:main');

        // Strip directive tags (same as final case)
        const cleaned = finalContent ? stripDirectives(finalContent) : '';

        this.conn.callbacks?.onStreamEnd(
          sessionKey || 'agent:main:main',
          mId,
          cleaned || `⏹️ ${i18n.t('chat.stopped', 'Stopped')}`,
          undefined,
          { state: 'aborted', runId: runId || null },
        );
        break;
      }

      default:
        console.log('[GW] Unknown chat state:', state);
    }
  }
}

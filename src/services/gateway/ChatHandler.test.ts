import assert from 'node:assert/strict';
import test from 'node:test';

type StreamEndCall = {
  sessionKey: string;
  messageId: string;
  content: string;
  meta?: any;
};

function resetChatStore() {
  const { useChatStore } = (globalThis as any).__chatDeps as { useChatStore: any };
  useChatStore.setState({
    messages: [],
    renderBlocks: [],
    responseGroups: [],
    messagesPerSession: {},
    _blocksCache: {},
    _groupsCache: {},
    quickReplies: [],
    quickRepliesBySession: {},
    thinkingText: '',
    thinkingRunId: null,
    thinkingBySession: {},
    isTyping: false,
    typingBySession: {},
  });
}

function installWindowMock(captureOutputsImpl?: () => Promise<any>) {
  (globalThis as any).__APP_VERSION__ = 'test';
  (globalThis as any).window = {
    aegis: {
      managedFiles: {
        captureOutputs: captureOutputsImpl || (async () => ({ success: true, refs: [] })),
      },
    },
    __APP_VERSION__: 'test',
  };
}

function installDomMock() {
  Object.defineProperty(globalThis, 'document', {
    value: {
      documentElement: {
        dir: 'ltr',
        lang: 'en',
      },
    },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      language: 'en-US',
      languages: ['en-US'],
    },
    configurable: true,
  });
}

function installStorageMock() {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

async function loadDeps() {
  installStorageMock();
  installDomMock();
  const [{ ChatHandler }, { useChatStore }] = await Promise.all([
    import('@/services/gateway/ChatHandler'),
    import('@/stores/chatStore'),
  ]);
  (globalThis as any).__chatDeps = { useChatStore };
  return { ChatHandler };
}

test('chat.final falls back to longer streamed content', async () => {
  installWindowMock();
  const { ChatHandler } = await loadDeps();
  resetChatStore();

  const streamEnds: StreamEndCall[] = [];
  const conn = {
    contextSent: false,
    callbacks: {
      onStreamChunk: () => {},
      onStreamEnd: (sessionKey: string, messageId: string, content: string, _media?: any, meta?: any) => {
        streamEnds.push({ sessionKey, messageId, content, meta });
      },
    },
  } as any;

  const handler = new ChatHandler(conn);
  const sessionKey = 'agent:main:session-a';
  const runId = 'run-chat-final';

  handler.handleEvent({
    event: 'chat',
    payload: {
      sessionKey,
      runId,
      state: 'delta',
      message: { content: 'This is the full streamed response before tools.' },
    },
  });

  handler.handleEvent({
    event: 'chat',
    payload: {
      sessionKey,
      runId,
      state: 'final',
      // Simulate the post-tool-only final snapshot
      message: { content: 'post-tool tail' },
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(streamEnds.length, 1);
  assert.equal(streamEnds[0].sessionKey, sessionKey);
  assert.ok(streamEnds[0].messageId.length > 0);
  assert.equal(streamEnds[0].content, 'This is the full streamed response before tools.');
  assert.equal(streamEnds[0].meta?.runId, runId);
});

test('agent lifecycle end finalizes assistant stream when chat.final is missing', async () => {
  installWindowMock();
  const { ChatHandler } = await loadDeps();
  resetChatStore();

  const streamEnds: StreamEndCall[] = [];
  const conn = {
    contextSent: false,
    callbacks: {
      onStreamChunk: () => {},
      onStreamEnd: (sessionKey: string, messageId: string, content: string, _media?: any, meta?: any) => {
        streamEnds.push({ sessionKey, messageId, content, meta });
      },
    },
  } as any;

  const handler = new ChatHandler(conn);
  const sessionKey = 'agent:main:session-b';
  const runId = 'run-agent-lifecycle';

  handler.handleEvent({
    event: 'agent',
    payload: {
      sessionKey,
      runId,
      stream: 'assistant',
      data: { text: 'Lifecycle fallback response body.' },
    },
  });

  handler.handleEvent({
    event: 'agent',
    payload: {
      sessionKey,
      runId,
      stream: 'lifecycle',
      data: { phase: 'end' },
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 260));

  assert.equal(streamEnds.length, 1);
  assert.equal(streamEnds[0].sessionKey, sessionKey);
  assert.ok(streamEnds[0].messageId.length > 0);
  assert.equal(streamEnds[0].content, 'Lifecycle fallback response body.');
  assert.equal(streamEnds[0].meta?.runId, runId);
});

test('chat.final maps managedFiles capture refs using path field', async () => {
  installWindowMock(async () => ({
    success: true,
    refs: [
      {
        path: '/Users/david/.openclaw/workspace/outputs/demo.md',
        mimeType: 'text/markdown',
        size: 1024,
      },
    ],
  }));
  const { ChatHandler } = await loadDeps();
  resetChatStore();

  const streamEnds: StreamEndCall[] = [];
  const conn = {
    contextSent: false,
    callbacks: {
      onStreamChunk: () => {},
      onStreamEnd: (sessionKey: string, messageId: string, content: string, _media?: any, meta?: any) => {
        streamEnds.push({ sessionKey, messageId, content, meta });
      },
    },
  } as any;

  const handler = new ChatHandler(conn);
  const sessionKey = 'agent:main:session-c';
  const runId = 'run-managed-files-path';

  handler.handleEvent({
    event: 'chat',
    payload: {
      sessionKey,
      runId,
      state: 'final',
      message: { content: '📎 file: /Users/david/.openclaw/workspace/outputs/demo.md (text/markdown, ~1KB)' },
    },
  });

  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(streamEnds.length, 1);
  const refs = streamEnds[0].meta?.fileRefs;
  assert.ok(Array.isArray(refs));
  assert.equal(refs.length, 1);
  assert.equal(refs[0].path, '/Users/david/.openclaw/workspace/outputs/demo.md');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSemanticBlocks } from './buildSemanticBlocks';
import type { NormalizedMessage } from '@/types/NormalizedMessage';

function createAssistantMessage(text: string): NormalizedMessage {
  return {
    id: 'msg-1',
    sessionKey: 'agent:main:main',
    runId: 'run-1',
    role: 'assistant',
    timestamp: new Date().toISOString(),
    model: 'openai/gpt-5',
    isStreaming: false,
    responseState: 'final',
    text,
    textParts: [text],
    toolCalls: [],
    toolResults: [],
    hasOnlyToolCallContent: false,
    hasOnlyToolContent: false,
    rawContent: text,
  };
}

function createUserMessage(text: string): NormalizedMessage {
  return {
    id: 'user-1',
    sessionKey: 'agent:main:main',
    runId: 'run-1',
    role: 'user',
    timestamp: new Date().toISOString(),
    model: null,
    isStreaming: false,
    responseState: 'final',
    text,
    textParts: [text],
    toolCalls: [],
    toolResults: [],
    hasOnlyToolCallContent: false,
    hasOnlyToolContent: false,
    rawContent: text,
  };
}

test('extracts output file lines into file-output semantic block', () => {
  const normalized = createAssistantMessage([
    '已经生成报告。',
    '📎 file: /tmp/demo-report.md (18 KB)',
    '你可以继续让我生成下一份。',
  ].join('\n'));

  const blocks = buildSemanticBlocks(normalized, { toolIntentEnabled: true });
  const messageBlock = blocks.find((block) => block.type === 'message-content');
  const fileBlock = blocks.find((block) => block.type === 'file-output');

  assert.ok(messageBlock && messageBlock.type === 'message-content');
  assert.ok(fileBlock && fileBlock.type === 'file-output');
  assert.equal(fileBlock.files.length, 1);
  assert.equal(fileBlock.files[0].path, '/tmp/demo-report.md');
  assert.match(messageBlock.markdown, /已经生成报告/);
  assert.match(messageBlock.markdown, /继续让我生成下一份/);
  assert.doesNotMatch(messageBlock.markdown, /📎\s*file:/);
});

test('extracts labeled path lines into file-output semantic block', () => {
  const normalized = createAssistantMessage([
    '报告已完成。',
    '文件位置: /Users/david/.openclaw/workspace/report.html',
  ].join('\n'));

  const blocks = buildSemanticBlocks(normalized, { toolIntentEnabled: true });
  const fileBlock = blocks.find((block) => block.type === 'file-output');

  assert.ok(fileBlock && fileBlock.type === 'file-output');
  assert.equal(fileBlock.files.length, 1);
  assert.equal(fileBlock.files[0].path, '/Users/david/.openclaw/workspace/report.html');
  assert.equal(fileBlock.files[0].meta, 'output');
});

test('extracts relative file path from saved-to sentence into file-output block', () => {
  const normalized = createAssistantMessage([
    '搞定。纯文本版本已保存到 agent-skills-intro.txt，去掉了所有 Markdown 标记。',
    '原来的 md 版 agent-skills-intro.md 也还在。',
  ].join('\n'));

  const blocks = buildSemanticBlocks(normalized, { toolIntentEnabled: true });
  const fileBlock = blocks.find((block) => block.type === 'file-output');
  const messageBlock = blocks.find((block) => block.type === 'message-content');

  assert.ok(fileBlock && fileBlock.type === 'file-output');
  assert.equal(fileBlock.files.length, 1);
  assert.equal(fileBlock.files[0].path, 'agent-skills-intro.txt');
  assert.equal(fileBlock.files[0].meta, 'output');
  assert.ok(messageBlock && messageBlock.type === 'message-content');
  assert.match(messageBlock.markdown, /agent-skills-intro\.md/);
});

test('extracts saved-to file path with emoji and backticks', () => {
  const normalized = createAssistantMessage(
    '已保存到 📄 `weather-beijing-2026-04-26.txt`已保存 📄 `weather-beijing-2026-04-26.txt`',
  );

  const blocks = buildSemanticBlocks(normalized, { toolIntentEnabled: true });
  const fileBlock = blocks.find((block) => block.type === 'file-output');

  assert.ok(fileBlock && fileBlock.type === 'file-output');
  assert.equal(fileBlock.files.length, 1);
  assert.equal(fileBlock.files[0].path, 'weather-beijing-2026-04-26.txt');
});

test('extracts saved file path without 到 keyword', () => {
  const normalized = createAssistantMessage(
    '已保存 📄 `weather-beijing-2026-04-26.md`\n\n这次是带表格的 Markdown 格式。',
  );

  const blocks = buildSemanticBlocks(normalized, { toolIntentEnabled: true });
  const fileBlock = blocks.find((block) => block.type === 'file-output');

  assert.ok(fileBlock && fileBlock.type === 'file-output');
  assert.equal(fileBlock.files.length, 1);
  assert.equal(fileBlock.files[0].path, 'weather-beijing-2026-04-26.md');
});

test('strips bootstrap preamble from persisted first user message', () => {
  const normalized = createUserMessage([
    '[Bootstrap pending] Please read BOOTSTRAP.md from the workspace and follow it before replying normally.',
    'If this run can complete the BOOTSTRAP.md workflow, do so.',
    'If it cannot, explain the blocker briefly, continue with any bootstrap steps that are still possible here, and offer the simplest next step.',
    'Do not pretend bootstrap is complete when it is not.',
    'Do not use a generic first greeting or reply normally until after you have handled BOOTSTRAP.md.',
    'Your first user-visible reply for a bootstrap-pending workspace must follow BOOTSTRAP.md, not a generic greeting.',
    '[Wed 2026-04-29 11:45 GMT+8] 你能做什么？',
  ].join(' '));

  const blocks = buildSemanticBlocks(normalized, { toolIntentEnabled: true });
  const messageBlock = blocks.find((block) => block.type === 'message-content');

  assert.ok(messageBlock && messageBlock.type === 'message-content');
  assert.equal(messageBlock.markdown, '你能做什么？');
});

test('strips standalone timestamp prefix from persisted user message', () => {
  const normalized = createUserMessage('[Wed 2026-04-29 11:45 GMT+8] 你能做什么？');

  const blocks = buildSemanticBlocks(normalized, { toolIntentEnabled: true });
  const messageBlock = blocks.find((block) => block.type === 'message-content');

  assert.ok(messageBlock && messageBlock.type === 'message-content');
  assert.equal(messageBlock.markdown, '你能做什么？');
});

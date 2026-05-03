import test from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'os';
import * as path from 'path';
import {
  extractOutputPathCandidates,
  normalizeCandidatePath,
} from './output-files-index';

test('output files index: extracts unix/windows candidates and deduplicates', () => {
  const text = [
    'See output at /tmp/report.md and again /tmp/report.md',
    'Windows path C:\\work\\results\\plot.png should be captured too.',
  ].join('\n');
  const candidates = extractOutputPathCandidates(text);
  assert.equal(candidates.includes('/tmp/report.md'), true);
  assert.equal(candidates.includes('C:\\work\\results\\plot.png'), true);
  assert.equal(candidates.length, 2);
});

test('output files index: normalizes ~ path', () => {
  const normalized = normalizeCandidatePath('~/reports/summary.txt');
  assert.equal(normalized.startsWith(os.homedir()), true);
  assert.equal(normalized.endsWith(path.join('reports', 'summary.txt')), true);
});

test('output files index: extracts path followed by punctuation', () => {
  const text = 'Generated file: /tmp/reports/final.pdf, please review.';
  const candidates = extractOutputPathCandidates(text);
  assert.equal(candidates.includes('/tmp/reports/final.pdf'), true);
});

test('output files index: extracts relative filename from saved-to sentence', () => {
  const text = '搞定。纯文本版本已保存到 agent-skills-intro.txt，去掉了所有 Markdown 标记。';
  const candidates = extractOutputPathCandidates(text);
  assert.equal(candidates.includes('agent-skills-intro.txt'), true);
});

test('output files index: extracts saved-to filename wrapped with emoji and backticks', () => {
  const text = '已保存到 📄 `weather-beijing-2026-04-26.txt`已保存 📄 `weather-beijing-2026-04-26.txt`';
  const candidates = extractOutputPathCandidates(text);
  assert.equal(candidates.includes('weather-beijing-2026-04-26.txt'), true);
});

test('output files index: extracts saved filename without 到 keyword', () => {
  const text = '已保存 📄 `weather-beijing-2026-04-26.md`\n\n这次是带表格的 Markdown 格式。';
  const candidates = extractOutputPathCandidates(text);
  assert.equal(candidates.includes('weather-beijing-2026-04-26.md'), true);
});

test('output files index: does not extract inside markdown link syntax', () => {
  const text = 'Download [report](/tmp/reports/final.pdf) from here.';
  const candidates = extractOutputPathCandidates(text);
  assert.equal(candidates.includes('/tmp/reports/final.pdf'), false);
});

test('output files index: extracts quoted unix path', () => {
  const text = 'Path is "/tmp/reports/final.md" and should be captured.';
  const candidates = extractOutputPathCandidates(text);
  assert.equal(candidates.includes('/tmp/reports/final.md'), true);
});

test('output files index: extracts quoted windows path', () => {
  const text = 'Path is "C:\\work\\exports\\plot.svg" for this run.';
  const candidates = extractOutputPathCandidates(text);
  assert.equal(candidates.includes('C:\\work\\exports\\plot.svg'), true);
});

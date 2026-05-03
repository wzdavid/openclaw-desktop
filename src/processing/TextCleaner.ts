// ═══════════════════════════════════════════════════════════
// TextCleaner — Single source of truth for text processing
// Consolidates extractText, stripDirectives, isNoise, stripUserMeta
// that were duplicated across gateway.ts, ChatView.tsx, MessageBubble.tsx
// ═══════════════════════════════════════════════════════════

/**
 * Extract plain text from any content format the Gateway sends.
 * Handles: string, content blocks array [{type:'text',text:'...'}], nested objects.
 */
export function extractText(val: unknown): string {
  if (typeof val === 'string') return val;
  if (val == null) return '';
  if (Array.isArray(val)) {
    return val.map((block: any) => {
      if (typeof block === 'string') return block;
      if (block?.type === 'text' && typeof block.text === 'string') return block.text;
      if (typeof block?.text === 'string') return block.text;
      return '';
    }).join('');
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.content === 'string') return obj.content;
    if (Array.isArray(obj.content)) return extractText(obj.content);
    return JSON.stringify(val);
  }
  return String(val);
}

/**
 * Strip server directive tags that should never render in the UI.
 * [[reply_to:...]], [[audio_as_voice]], untrusted content wrappers, etc.
 */
export function stripDirectives(text: string): string {
  let clean = text;
  clean = clean.replace(/\[\[reply_to_current\]\]/gi, '');
  clean = clean.replace(/\[\[reply_to:[^\]]*\]\]/gi, '');
  clean = clean.replace(/\[\[audio_as_voice\]\]/gi, '');
  // Untrusted content wrappers
  clean = clean.replace(/<<<EXTERNAL_UNTRUSTED_CONTENT[\s\S]*?<<<END_EXTERNAL_UNTRUSTED_CONTENT>>>/g, '');
  clean = clean.replace(/<<<EXTERNAL_UNTRUSTED_CONTENT[^>]*>>>/g, '');
  clean = clean.replace(/<<<END_EXTERNAL_UNTRUSTED_CONTENT>>>/g, '');
  return clean.trim();
}

const DAY_PREFIX = '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)';
const TIMESTAMP_ZONE = '(?:UTC|GMT[+-]\\d{1,2}(?::\\d{2})?)';
const USER_TIMESTAMP_PREFIX = `\\[${DAY_PREFIX}\\s+\\d{4}-\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}\\s+${TIMESTAMP_ZONE}\\]`;
const USER_META_PREFIX_PATTERNS: RegExp[] = [
  new RegExp(`^\\s*\\[Bootstrap pending\\][\\s\\S]*?(?=(?:\\s*${USER_TIMESTAMP_PREFIX})|\\s*$)`, 'i'),
  new RegExp(`^\\s*${USER_TIMESTAMP_PREFIX}\\s*`, 'i'),
];
const USER_META_BLOCK_PATTERNS: RegExp[] = [
  /\[OPENCLAW_DESKTOP_CONTEXT\][\s\S]*?\[\/OPENCLAW_DESKTOP_CONTEXT\]\s*/i,
  /Conversation info \(untrusted metadata\):\s*```json\s*\{[\s\S]*?\}\s*```\s*/i,
  /System:\s*\[(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+\d{4}-[\s\S]*?\](?:\s*(?=\n\n)|\s*$)/g,
  /(?:^|\n|\s---\s)System\s*\(untrusted\):[\s\S]*?(?=(?:\s---\sSystem\s*\(untrusted\):)|(?:\n\s*An async command you ran earlier has completed\.)|$)/gi,
  /An async command you ran earlier has completed\.[\s\S]*?(?:Current time:[^\n]*|$)/gi,
];

/** Patterns that indicate noise messages (hidden from chat) */
const NOISE_PATTERNS: RegExp[] = [
  /^Read HEARTBEAT\.md/i,
  /^HEARTBEAT_OK$/,
  /^NO_REPLY$/,
  /^احفظ جميع المعلومات المهمة/,
  /^⚠️ Session nearing compaction/,
  /^\[System\]\s*\[?\d{4}/i,  // Only match [System] followed by timestamp, not arbitrary content
  /^System:\s*\[/,
  /^PS [A-Z]:\\.*>/,
  /^node scripts\/build/,
  /^npx electron/,
  /^Ctrl\+[A-Z]/,
  /^Conversation info \(untrusted metadata\)/i,
  /^System\s*\(untrusted\):/i,
  /^An async command you ran earlier has completed\./i,
  /^\[OPENCLAW_DESKTOP_CONTEXT\]/i,
  /^\[AEGIS:RASHID\]/i,
];

/**
 * Check if a message is "noise" that should be hidden from chat.
 * Heartbeats, system messages, build output, desktop context injection, etc.
 */
export function isNoise(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return NOISE_PATTERNS.some(p => p.test(trimmed));
}

/**
 * Strip injected metadata from user messages for clean display.
 * Removes: OPENCLAW_DESKTOP_CONTEXT blocks, Conversation info JSON,
 * System notification blocks, inline UTC timestamps.
 */
export function stripUserMeta(text: string): string {
  let clean = text;
  for (const pattern of USER_META_BLOCK_PATTERNS) {
    clean = clean.replace(pattern, '');
  }
  // Internal prefixes can chain: bootstrap preamble -> timestamp -> actual user text.
  let previous = '';
  while (clean !== previous) {
    previous = clean;
    for (const pattern of USER_META_PREFIX_PATTERNS) {
      clean = clean.replace(pattern, '');
    }
  }
  return clean.trim();
}

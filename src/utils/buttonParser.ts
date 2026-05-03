// ═══════════════════════════════════════════════════════════
// Button Parser — Extract [[button:text]] markers from AI responses
//
// The AI includes [[button:Label]] markers when presenting choices.
// This parser extracts them, returns the clean text + button list.
//
// Syntax:
//   [[button:Option A]]
//   [[button:Option B]]
//   [[button:Option C]]
//
// Buttons are stripped from displayed content and rendered
// separately as clickable QuickReplyBar.
// ═══════════════════════════════════════════════════════════

export interface ParsedButton {
  text: string;   // Display label
  value: string;  // What gets sent (same as text)
}

export interface ButtonParseResult {
  cleanContent: string;      // Content with buttons stripped
  buttons: ParsedButton[];   // Extracted buttons (in order)
}

// Match [[button:...]] — supports Arabic, English, emoji, punctuation
const BUTTON_REGEX = /\[\[button:([^\]]+)\]\]/g;

/**
 * Parse [[button:text]] markers from AI response text.
 * Returns clean content (markers removed) + extracted buttons.
 * Returns empty buttons array if none found.
 */
export function parseButtons(content: string): ButtonParseResult {
  const buttons: ParsedButton[] = [];

  // Extract all buttons
  let match: RegExpExecArray | null;
  const regex = new RegExp(BUTTON_REGEX.source, 'g');
  while ((match = regex.exec(content)) !== null) {
    const text = match[1].trim();
    if (text) {
      buttons.push({ text, value: text });
    }
  }

  if (buttons.length === 0) {
    return { cleanContent: content, buttons: [] };
  }

  // Remove button markers from content
  let cleanContent = content.replace(BUTTON_REGEX, '');

  // Clean up leftover whitespace (empty lines where buttons were)
  cleanContent = cleanContent
    .replace(/\n{3,}/g, '\n\n')   // Collapse 3+ newlines → 2
    .trim();

  return { cleanContent, buttons };
}

/**
 * Quick check — does content contain any [[button:...]] markers?
 * Cheaper than full parse for pre-filtering.
 */
export function hasButtons(content: string): boolean {
  return /\[\[button:[^\]]+\]\]/.test(content);
}

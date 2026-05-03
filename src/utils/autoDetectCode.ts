// ═══════════════════════════════════════════════════════════
// autoDetectCode — Detects unformatted code in plain text
// and wraps it in markdown ``` fences for rendering in CodeBlock.
//
// Strategy:
//   1. If text already has ``` fences → skip (no double processing)
//   2. Score each line as "code" or "text" using heuristics
//   3. Collect consecutive high-score lines → wrap in ``` lang
//   4. Auto-detect the language (TypeScript/Python/SQL/etc.)
// ═══════════════════════════════════════════════════════════

// ── Language Detection ────────────────────────────────────
function detectLanguage(code: string): string {
  // TypeScript — type annotations, interfaces, generics
  if (
    /:\s*(string|number|boolean|void|any|never|unknown)\b/.test(code) ||
    /\binterface\s+\w+/.test(code) ||
    /\btype\s+\w+\s*=/.test(code) ||
    /<\w+>/.test(code)
  ) return 'typescript';

  // JavaScript — const/let/var, arrow functions, require
  if (
    /\b(const|let|var)\s+\w+\s*=/.test(code) ||
    /=>\s*[{(]/.test(code) ||
    /require\(|module\.exports/.test(code) ||
    /console\.(log|error|warn)/.test(code)
  ) return 'javascript';

  // Python — def, print(), elif, class with no braces
  if (
    /^\s*def\s+\w+\s*\(/m.test(code) ||
    /\bprint\s*\(/.test(code) ||
    /\belif\s+/.test(code) ||
    /\bimport\s+\w+(\s*,\s*\w+)*\s*$/.test(code) ||
    /:\s*$/.test(code.split('\n')[0] || '')
  ) return 'python';

  // Bash/Shell — $VAR, shebang, common commands
  if (
    /^#!/.test(code) ||
    /\$\{?\w+\}?/.test(code) ||
    /\b(echo|grep|sed|awk|chmod|curl|wget|npm|pip|apt|brew)\s/.test(code) ||
    /&&\s*\\\s*$/.test(code)
  ) return 'bash';

  // SQL — SELECT, FROM, WHERE (case-insensitive)
  if (
    /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i.test(code) &&
    /\b(FROM|INTO|TABLE|WHERE|VALUES)\b/i.test(code)
  ) return 'sql';

  // C / C++ — #include, std::, ->
  if (
    /#include\s*[<"]/.test(code) ||
    /\bstd::/.test(code) ||
    /\b(int|void|char|float|double)\s+\w+\s*\(/.test(code)
  ) return 'cpp';

  // Java — public class, System.out, @Override
  if (
    /\bpublic\s+(class|static|void)\b/.test(code) ||
    /System\.out\.(print|println)/.test(code) ||
    /@Override/.test(code)
  ) return 'java';

  // Go — func, :=, package, fmt.
  if (
    /\bfunc\s+\w+\s*\(/.test(code) ||
    /\w+\s*:=\s*/.test(code) ||
    /\bpackage\s+\w+/.test(code) ||
    /\bfmt\.\w+\(/.test(code)
  ) return 'go';

  // Rust — fn, let mut, impl, println!
  if (
    /\bfn\s+\w+\s*\(/.test(code) ||
    /\blet\s+mut\s+\w+/.test(code) ||
    /\bimpl\s+\w+/.test(code) ||
    /println!\(/.test(code)
  ) return 'rust';

  // PHP
  if (/<\?php/.test(code) || /\$\w+\s*=/.test(code)) return 'php';

  // JSON — object/array with quoted keys
  if (
    /^\s*[\[{]/.test(code.trim()) &&
    /"\w+":\s*.+/.test(code)
  ) return 'json';

  // HTML/XML
  if (/<[a-zA-Z][a-zA-Z0-9]*[\s/>]/.test(code)) return 'html';

  // CSS
  if (
    /\w[\w-]+\s*:\s*[\w#"'(].+;/.test(code) &&
    /[{}]/.test(code)
  ) return 'css';

  return '';
}

// ── Line Scoring ──────────────────────────────────────────
const CODE_KEYWORDS = [
  'const ', 'let ', 'var ', 'function ', 'return ', 'import ', 'export ',
  'class ', 'interface ', 'type ', 'async ', 'await ', 'yield ',
  'def ', 'elif ', 'lambda ', 'pass ', 'raise ',
  'public ', 'private ', 'protected ', 'static ', 'void ', 'override ',
  'func ', 'package ', 'struct ',
  'fn ', 'let mut ', 'impl ', 'use ',
  '#include', 'SELECT ', 'FROM ', 'WHERE ', 'INSERT ', 'UPDATE ',
  'console.', 'require(', 'module.',
];

const ARABIC = /[\u0600-\u06FF]/;

function scoreLine(line: string): number {
  const trimmed = line.trim();
  if (!trimmed) return 0;

  // Definite non-code: Arabic-heavy text
  const arabicChars = (trimmed.match(/[\u0600-\u06FF]/g) || []).length;
  if (arabicChars > trimmed.length * 0.25) return -2;

  // Definite non-code: markdown structural elements
  if (/^#{1,6}\s/.test(trimmed)) return -2;          // Headers
  if (/^[-*+]\s/.test(trimmed)) return -2;            // Bullet lists
  if (/^\d+\.\s/.test(trimmed)) return -2;            // Numbered lists
  if (/^>\s/.test(trimmed)) return -2;                // Blockquotes
  if (/^https?:\/\//.test(trimmed)) return -2;        // URLs
  if (/^!\[/.test(trimmed)) return -2;                // Images

  // Long natural-language sentences (no symbols) → not code
  const words = trimmed.split(/\s+/);
  const hasSymbols = /[{};()[\]=<>|\\^@#$%&*]/.test(trimmed);
  if (words.length > 12 && !hasSymbols) return -1;

  let score = 0;

  // Code keywords
  for (const kw of CODE_KEYWORDS) {
    if (trimmed.includes(kw)) { score += 3; break; }
  }

  // Structural symbols
  if (/[{}]/.test(trimmed)) score += 2;
  if (trimmed.endsWith(';')) score += 2;
  if (trimmed.includes('=>')) score += 2;
  if (trimmed.includes('->')) score += 1;
  if (trimmed.includes('::')) score += 1;

  // Method/property access
  if (/\w+\.\w+\(/.test(trimmed)) score += 2;

  // Assignment patterns
  if (/\w+\s*[+\-*/%]?=\s*\w+/.test(trimmed) && !trimmed.includes('==')) score += 1;

  // Indentation (suggests code block)
  if (/^\s{2,}/.test(line)) score += 1;

  // Comments
  if (trimmed.startsWith('//') || trimmed.startsWith('--') || trimmed.startsWith('#!')) score += 2;
  if (trimmed.startsWith('/*') || trimmed.startsWith('*')) score += 1;

  // Function call pattern
  if (/\w+\s*\([^)]*\)\s*[{;]?$/.test(trimmed)) score += 1;

  // Shebang
  if (trimmed.startsWith('#!/')) score += 3;

  return score;
}

// ── Main Export ───────────────────────────────────────────

/**
 * Analyzes plain text and wraps unformatted code blocks
 * in ``` fences so ReactMarkdown renders them as CodeBlock.
 *
 * Does NOT modify text that already contains ``` fences.
 */
export function autoDetectCode(text: string): string {
  // If already has code fences → return as-is
  if (text.includes('```') || text.includes('~~~')) return text;

  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const score = scoreLine(line);

    if (score >= 3) {
      // Potential code start — collect consecutive code lines
      const codeLines: string[] = [line];
      let j = i + 1;

      while (j < lines.length) {
        const next = lines[j];
        const nextScore = scoreLine(next);

        if (!next.trim()) {
          // Empty line — include only if next non-empty is also code
          const lookahead = lines.slice(j + 1).find((l) => l.trim());
          if (lookahead && scoreLine(lookahead) >= 2) {
            codeLines.push(next);
            j++;
          } else {
            break;
          }
        } else if (nextScore >= 2) {
          codeLines.push(next);
          j++;
        } else if (nextScore >= 0 && codeLines.length >= 2) {
          // Borderline line — allow if block already established
          codeLines.push(next);
          j++;
        } else {
          break;
        }
      }

      // Remove trailing empty lines
      while (codeLines.length && !codeLines[codeLines.length - 1].trim()) {
        codeLines.pop();
      }

      // Wrap if: 2+ lines, OR single line with very high score (>=5)
      const codeStr = codeLines.join('\n');
      const totalScore = codeLines.reduce((s, l) => s + Math.max(0, scoreLine(l)), 0);

      if (codeLines.length >= 2 || totalScore >= 5) {
        const lang = detectLanguage(codeStr);
        result.push('```' + lang);
        result.push(codeStr);
        result.push('```');
        i = j;
        continue;
      }
    }

    result.push(line);
    i++;
  }

  return result.join('\n');
}

import type { RenderBlock } from '@/types/RenderBlock';

/**
 * Export RenderBlocks as a clean Markdown document.
 * Only exports message and tool blocks — skips compaction, inline-buttons, thinking.
 */
export function exportAsMarkdown(blocks: RenderBlock[], sessionKey?: string): string {
  const lines: string[] = [];
  
  // Header
  lines.push('# Chat Export');
  if (sessionKey) lines.push(`> Session: \`${sessionKey}\``);
  lines.push(`> Exported: ${new Date().toLocaleString()}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const block of blocks) {
    switch (block.type) {
      case 'message': {
        const prefix = block.role === 'user' ? '**🧑 User**' : '**🤖 Assistant**';
        const time = block.timestamp
          ? new Date(block.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '';
        lines.push(`### ${prefix}${time ? ` — ${time}` : ''}`);
        lines.push('');
        lines.push(block.markdown);
        lines.push('');
        
        // Include artifacts as code blocks
        for (const art of block.artifacts) {
          lines.push(`<details><summary>📦 Artifact: ${art.title} (${art.type})</summary>`);
          lines.push('');
          lines.push('```' + (art.type === 'html' ? 'html' : art.type === 'react' ? 'jsx' : art.type));
          lines.push(art.content);
          lines.push('```');
          lines.push('</details>');
          lines.push('');
        }
        break;
      }
      case 'tool': {
        lines.push(`> 🔧 **Tool:** \`${block.toolName}\`${block.status === 'error' ? ' ❌' : ' ✅'}${block.durationMs ? ` (${(block.durationMs / 1000).toFixed(1)}s)` : ''}`);
        if (block.output) {
          lines.push('>');
          // Truncate long outputs
          const output = block.output.length > 500 ? block.output.slice(0, 500) + '\n...(truncated)' : block.output;
          output.split('\n').forEach(line => lines.push(`> ${line}`));
        }
        lines.push('');
        break;
      }
      case 'compaction':
        lines.push('---');
        lines.push('*Context was compacted*');
        lines.push('---');
        lines.push('');
        break;
    }
  }

  return lines.join('\n');
}

/**
 * Download text as a file in the browser.
 */
export function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export and download chat as Markdown.
 */
export function exportChatMarkdown(blocks: RenderBlock[], sessionKey?: string) {
  const md = exportAsMarkdown(blocks, sessionKey);
  const date = new Date().toISOString().slice(0, 10);
  const name = sessionKey ? sessionKey.replace(/[^a-zA-Z0-9-]/g, '_') : 'chat';
  downloadText(md, `${name}_${date}.md`);
}

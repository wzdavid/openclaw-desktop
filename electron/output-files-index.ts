import * as os from 'os';
import * as path from 'path';

// Legacy helper module retained only for extracting/normalizing output paths from model text.
// Persistent indexing has been fully migrated to managed-files-index.

export function extractOutputPathCandidates(text: string): string[] {
  const pathMatches = new Set<string>();
  const unixPathRegex = /(?:^|\s)["'`]?((?:\/|~\/)[^\s"'`]+\.[A-Za-z0-9]{1,12})(?=$|\s|["'`),.;:!?])/g;
  const winPathRegex = /(?:^|\s)["'`]?([A-Za-z]:[\\/][^\s"'`]+\.[A-Za-z0-9]{1,12})(?=$|\s|["'`),.;:!?])/g;
  const savedToRegex = /(?:已保存到|已保存|保存到|写入到|输出到|saved to|saved|written to|stored at|output to)\s*/gi;
  const savedCandidateRegex = /`([^`]+?\.[A-Za-z0-9]{1,12})`|["']([^"']+?\.[A-Za-z0-9]{1,12})["']|((?:~\/|\/|[A-Za-z]:[\\/])?[A-Za-z0-9][^\s"'`，。；;:：!?(){}[\]]*?\.[A-Za-z0-9]{1,12})/gi;
  for (const match of text.matchAll(unixPathRegex)) pathMatches.add(String(match[1] || '').trim());
  for (const match of text.matchAll(winPathRegex)) pathMatches.add(String(match[1] || '').trim());
  for (const match of text.matchAll(savedToRegex)) {
    const start = (match.index || 0) + String(match[0] || '').length;
    const tail = text.slice(start, start + 180);
    const candidate = savedCandidateRegex.exec(tail);
    savedCandidateRegex.lastIndex = 0;
    const raw = String(candidate?.[1] || candidate?.[2] || candidate?.[3] || '').trim();
    if (!raw) continue;
    pathMatches.add(raw.replace(/^[^A-Za-z0-9~/.]+/, '').trim());
  }
  return Array.from(pathMatches);
}

export function normalizeCandidatePath(candidate: string): string {
  return path.resolve(String(candidate || '').replace(/^~(?=\/|\\)/, os.homedir()));
}

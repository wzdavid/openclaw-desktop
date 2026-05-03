import * as fs from 'fs';
import * as path from 'path';

export type ManagedFileKind = 'output' | 'upload' | 'voice';

export type ManagedFileRef = {
  id: string;
  kind: ManagedFileKind;
  path: string;
  agentId: string;
  sessionKey: string;
  workspaceRoot: string;
  relativePath?: string;
  mimeType?: string;
  size?: number;
  createdAt: string;
  exists?: boolean;
  isCanonicalOutput?: boolean;
};

export type ManagedFilesQuery = {
  kind?: ManagedFileKind | 'outputs' | 'uploads' | 'voice';
  sessionKey?: string;
  agentId?: string;
  query?: string;
  limit?: number;
  offset?: number;
};

export function getManagedFilesIndexPath(): string {
  return path.join(path.join(process.env.HOME || '', '.openclaw'), 'index', 'managed-files.jsonl');
}

function normalizeKind(kind?: string): ManagedFileKind | '' {
  if (kind === 'output' || kind === 'outputs') return 'output';
  if (kind === 'upload' || kind === 'uploads') return 'upload';
  if (kind === 'voice') return 'voice';
  return '';
}

function makeId(ref: Omit<ManagedFileRef, 'id'>): string {
  return `${ref.kind}:${ref.agentId}:${ref.sessionKey}:${path.resolve(ref.path)}`;
}

export function readManagedFilesIndex(): ManagedFileRef[] {
  const indexPath = getManagedFilesIndexPath();
  if (!fs.existsSync(indexPath)) return [];
  try {
    const raw = fs.readFileSync(indexPath, 'utf8');
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          const parsed = JSON.parse(line) as Partial<ManagedFileRef>;
          if (!parsed || typeof parsed !== 'object') return null;
          const kind = normalizeKind(parsed.kind);
          const filePath = String(parsed.path || '').trim();
          if (!kind || !filePath) return null;
          const base: Omit<ManagedFileRef, 'id'> = {
            kind,
            path: filePath,
            agentId: String(parsed.agentId || 'main'),
            sessionKey: String(parsed.sessionKey || 'default'),
            workspaceRoot: String(parsed.workspaceRoot || ''),
            relativePath: typeof parsed.relativePath === 'string' ? parsed.relativePath : undefined,
            mimeType: typeof parsed.mimeType === 'string' ? parsed.mimeType : undefined,
            size: typeof parsed.size === 'number' ? parsed.size : undefined,
            createdAt: String(parsed.createdAt || new Date().toISOString()),
            exists: typeof parsed.exists === 'boolean' ? parsed.exists : undefined,
            isCanonicalOutput: typeof parsed.isCanonicalOutput === 'boolean' ? parsed.isCanonicalOutput : undefined,
          };
          return { ...base, id: String(parsed.id || makeId(base)) };
        } catch {
          return null;
        }
      })
      .filter((row): row is ManagedFileRef => Boolean(row));
  } catch {
    return [];
  }
}

export function writeManagedFilesIndex(rows: ManagedFileRef[]): void {
  const indexPath = getManagedFilesIndexPath();
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  if (rows.length === 0) {
    fs.writeFileSync(indexPath, '', 'utf8');
    return;
  }
  fs.writeFileSync(indexPath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
}

export function upsertManagedFileRefs(refs: Array<Omit<ManagedFileRef, 'id'>>): ManagedFileRef[] {
  if (refs.length === 0) return [];
  const existing = readManagedFilesIndex();
  const byId = new Map(existing.map((row) => [row.id, row]));
  const added: ManagedFileRef[] = [];
  for (const ref of refs) {
    const normalized: Omit<ManagedFileRef, 'id'> = {
      ...ref,
      kind: normalizeKind(ref.kind) as ManagedFileKind,
      path: path.resolve(ref.path),
      agentId: String(ref.agentId || 'main'),
      sessionKey: String(ref.sessionKey || 'default'),
      workspaceRoot: String(ref.workspaceRoot || ''),
      createdAt: String(ref.createdAt || new Date().toISOString()),
    };
    const id = makeId(normalized);
    if (byId.has(id)) continue;
    const row: ManagedFileRef = { ...normalized, id };
    byId.set(id, row);
    added.push(row);
  }
  writeManagedFilesIndex(Array.from(byId.values()));
  return added;
}

export function listManagedFileRefs(query?: ManagedFilesQuery): { rows: ManagedFileRef[]; total: number } {
  const safeKind = normalizeKind(query?.kind);
  const safeSessionKey = String(query?.sessionKey || '').trim();
  const safeAgentId = String(query?.agentId || '').trim();
  const safeQuery = String(query?.query || '').trim().toLowerCase();
  const limit = typeof query?.limit === 'number' && query.limit > 0 ? query.limit : 200;
  const offset = typeof query?.offset === 'number' && query.offset >= 0 ? query.offset : 0;
  const rows = readManagedFilesIndex()
    .filter((row) => (!safeKind || row.kind === safeKind))
    .filter((row) => (!safeSessionKey || row.sessionKey === safeSessionKey))
    .filter((row) => (!safeAgentId || row.agentId === safeAgentId))
    .filter((row) => {
      if (!safeQuery) return true;
      const p = row.path.toLowerCase();
      const name = path.basename(row.path).toLowerCase();
      return p.includes(safeQuery) || name.includes(safeQuery);
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { rows: rows.slice(offset, offset + limit), total: rows.length };
}

export function removeManagedFileRefByPath(filePath: string, kind?: ManagedFileKind | 'outputs' | 'uploads' | 'voice'): boolean {
  const target = path.resolve(String(filePath || ''));
  const safeKind = normalizeKind(kind);
  const rows = readManagedFilesIndex();
  const next = rows.filter((row) => {
    if (path.resolve(row.path) !== target) return true;
    if (!safeKind) return false;
    return row.kind !== safeKind;
  });
  if (next.length === rows.length) return false;
  writeManagedFilesIndex(next);
  return true;
}

export function pruneMissingManagedFileRefs(kind?: ManagedFileKind | 'outputs' | 'uploads' | 'voice'): number {
  const safeKind = normalizeKind(kind);
  const rows = readManagedFilesIndex();
  const next = rows.filter((row) => {
    if (safeKind && row.kind !== safeKind) return true;
    return fs.existsSync(path.resolve(row.path));
  });
  const removedCount = rows.length - next.length;
  if (removedCount > 0) {
    writeManagedFilesIndex(next);
  }
  return removedCount;
}

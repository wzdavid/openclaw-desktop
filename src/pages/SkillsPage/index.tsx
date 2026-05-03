// ═══════════════════════════════════════════════════════════
// Skills Page — My Skills + ClawHub + SkillsHub (CN mirror)
// Design: spacious (max-w 900px), clean list, pill categories
// Data: Gateway skills.status + ClawHub API + SkillsHub API
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Loader2, RefreshCw, Package, Globe, FolderOpen, FileArchive, Upload, CheckCircle2, AlertCircle, Zap, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { gateway } from '@/services/gateway';
import { useChatStore } from '@/stores/chatStore';
import clsx from 'clsx';
import {
  MySkillRow,
  HubSkillRow,
  SkillDetailPanel,
  CategoryChips,
  getSkillGroup,
  isSkillDeletable,
  type InstallState,
  type MySkill,
  type HubSkill,
  type SkillDetail,
} from './components';

// ═══════════════════════════════════════════════════════════
// ClawHub API
// ═══════════════════════════════════════════════════════════

const CLAWHUB_API = 'https://clawhub.ai/api/v1';

// The /api/v1/skills list endpoint always returns [] — use search instead.
// Seed queries by "mode" to give diverse, popular results.
const BROWSE_SEEDS: Record<string, string[]> = {
  // Each mode uses different seed terms so the result set feels distinct
  downloads: ['weather', 'github', 'search', 'browser', 'image', 'calendar', 'notion', 'file', 'email', 'code'],
  stars:     ['agent', 'memory', 'security', 'automation', 'data', 'workflow', 'chinese', 'cn', 'ai', 'web'],
  trending:  ['mcp', 'claude', 'cursor', 'openai', 'llm', 'api', 'slack', 'discord', 'git', 'terminal'],
};

class ClawHubRateLimitError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super('ClawHub rate limited');
    this.name = 'ClawHubRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

type ClawHubAuthStatus = {
  available: boolean;
  loggedIn: boolean;
  source: 'clawhub' | 'npx' | null;
  displayName: string | null;
  error: string | null;
};

type ClawHubErrorKind = 'rate_limit' | 'network' | null;

const CLAWHUB_CACHE_PREFIX = 'aegis_clawhub_cache_v1:';
let clawHubRateLimitUntil = 0;
const clawHubInFlight = new Map<string, Promise<any>>();

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

function getClawHubCache(url: string): any | null {
  try {
    const raw = localStorage.getItem(CLAWHUB_CACHE_PREFIX + url);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { expiresAt?: number; data?: any } | null;
    if (!parsed || typeof parsed.expiresAt !== 'number') return null;
    if (Date.now() > parsed.expiresAt) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function setClawHubCache(url: string, data: any, ttlMs: number) {
  try {
    localStorage.setItem(
      CLAWHUB_CACHE_PREFIX + url,
      JSON.stringify({ expiresAt: Date.now() + ttlMs, data }),
    );
  } catch {}
}

async function clawHubFetchJson(url: string, ttlMs = 2 * 60 * 1000): Promise<any> {
  const cached = getClawHubCache(url);
  if (cached) return cached;

  const now = Date.now();
  if (now < clawHubRateLimitUntil) throw new ClawHubRateLimitError(clawHubRateLimitUntil - now);

  const existing = clawHubInFlight.get(url);
  if (existing) return existing;

  const p = (async () => {
    const ipcFetch = window.aegis?.clawhub?.fetchJson;
    if (ipcFetch) {
      const r = await ipcFetch(url);
      if (r.status === 429) {
        const retryAfterMs = parseRetryAfterMs(r.retryAfter) ?? 60_000;
        clawHubRateLimitUntil = Date.now() + retryAfterMs;
        throw new ClawHubRateLimitError(retryAfterMs);
      }
      if (!r.ok) throw new Error(`ClawHub: ${r.status}`);
      const data = r.data;
      setClawHubCache(url, data, ttlMs);
      return data;
    }

    const res = await fetch(url);
    if (res.status === 429) {
      const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after')) ?? 60_000;
      clawHubRateLimitUntil = Date.now() + retryAfterMs;
      throw new ClawHubRateLimitError(retryAfterMs);
    }
    if (!res.ok) throw new Error(`ClawHub: ${res.status}`);
    const data = await res.json();
    setClawHubCache(url, data, ttlMs);
    return data;
  })();

  clawHubInFlight.set(url, p);
  try {
    return await p;
  } finally {
    clawHubInFlight.delete(url);
  }
}

/** ClawHub search returns minimal results (no stats/version). Enrich in-place from SkillsHub API. */
async function enrichWithSkillsHubStats(skills: HubSkill[]): Promise<void> {
  if (skills.length === 0) return;
  try {
    // Batch: search for slugs via SkillsHub (same catalog, richer data)
    const { skills: shResults } = await fetchSkillsHubList({ keyword: skills[0].slug, pageSize: 50 });
    const shMap = new Map(shResults.map(s => [s.slug, s]));
    for (const skill of skills) {
      const sh = shMap.get(skill.slug);
      if (sh) {
        skill.downloads = sh.downloads;
        skill.stars = sh.stars;
        skill.installs = sh.installs;
        skill.version = sh.version;
        if (sh.summary && (!skill.summary || skill.summary.length < sh.summary.length)) {
          skill.summary = sh.summary;
        }
      }
    }
    // For slugs not found in first batch, try individual lookups
    const missing = skills.filter(s => !shMap.has(s.slug));
    if (missing.length > 0 && missing.length <= 5) {
      const extra = await Promise.all(
        missing.map(s => fetchSkillsHubList({ keyword: s.slug, pageSize: 3 }).then(r => r.skills).catch(() => [] as HubSkill[]))
      );
      for (let i = 0; i < missing.length; i++) {
        const hit = extra[i].find(r => r.slug === missing[i].slug);
        if (hit) {
          missing[i].downloads = hit.downloads;
          missing[i].stars = hit.stars;
          missing[i].installs = hit.installs;
          missing[i].version = hit.version;
        }
      }
    }
  } catch { /* best-effort enrichment */ }
}

async function searchOne(query: string, limit: number): Promise<HubSkill[]> {
  try {
    const url = `${CLAWHUB_API}/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    const data = await clawHubFetchJson(url);
    const skills = (data.results || []).map(mapHubSkill);
    await enrichWithSkillsHubStats(skills);
    return skills;
  } catch (err) {
    if (err instanceof ClawHubRateLimitError) throw err;
    return [];
  }
}

async function fetchHubSkills(sort = 'downloads', total = 30): Promise<HubSkill[]> {
  const seeds = BROWSE_SEEDS[sort] ?? BROWSE_SEEDS.downloads;
  const seen = new Set<string>();
  const merged: HubSkill[] = [];

  let requests = 0;
  for (const q of seeds) {
    if (merged.length >= total) break;
    if (requests >= 3) break;
    const remaining = total - merged.length;
    const batch = await searchOne(q, Math.min(30, remaining));
    requests++;
    for (const skill of batch) {
      if (!skill.slug) continue;
      if (!seen.has(skill.slug)) {
        seen.add(skill.slug);
        merged.push(skill);
      }
      if (merged.length >= total) break;
    }
    if (batch.length > 0 && merged.length >= Math.min(total, 25)) break;
  }

  return merged.slice(0, total);
}

async function searchHubSkills(query: string): Promise<HubSkill[]> {
  return searchOne(query, 30);
}

async function searchHubSkillsViaCli(query: string): Promise<HubSkill[]> {
  const searchCli = window.aegis?.clawhub?.searchCli;
  if (!searchCli) return [];
  const res = await searchCli(query, 30);
  if (!res.success) {
    throw new Error(res.error ?? 'ClawHub CLI search failed');
  }
  const skills = res.items.map(item => ({
    slug: item.slug,
    name: item.name || item.slug,
    emoji: guessEmoji(item.slug),
    summary: '',
    owner: '',
    ownerAvatar: '',
    category: 'other',
    downloads: 0,
    installs: 0,
    stars: 0,
    badge: undefined,
    version: '0.0.0',
    homepage: '',
  }));
  await enrichWithSkillsHubStats(skills);
  return skills;
}

async function fetchHubSkillsViaCli(sort = 'downloads', total = 30): Promise<HubSkill[]> {
  const seeds = BROWSE_SEEDS[sort] ?? BROWSE_SEEDS.downloads;
  const seen = new Set<string>();
  const merged: HubSkill[] = [];

  let requests = 0;
  for (const q of seeds) {
    if (merged.length >= total) break;
    if (requests >= 3) break;
    const remaining = total - merged.length;
    const batch = await searchHubSkillsViaCli(q);
    requests++;
    for (const skill of batch.slice(0, Math.min(30, remaining))) {
      if (!skill.slug) continue;
      if (!seen.has(skill.slug)) {
        seen.add(skill.slug);
        merged.push(skill);
      }
      if (merged.length >= total) break;
    }
    if (batch.length > 0 && merged.length >= Math.min(total, 25)) break;
  }

  return merged.slice(0, total);
}

async function fetchSkillDetail(slug: string): Promise<SkillDetail | null> {
  try {
    const [data, versions] = await Promise.all([
      clawHubFetchJson(`${CLAWHUB_API}/skills/${slug}`),
      clawHubFetchJson(`${CLAWHUB_API}/skills/${slug}/versions`).catch(() => null),
    ]);
    const skill = data.skill || data;
    const owner = data.owner || {};
    return {
      ...mapHubSkill(skill),
      owner: owner.displayName || owner.handle || skill.owner?.handle || '',
      ownerAvatar: owner.image || skill.owner?.image || '',
      version: data.latestVersion?.version || skill.latestVersion?.version || skill.tags?.latest || '0.0.0',
      readme: skill.readme || skill.description || skill.summary || '',
      requirements: {
        env: skill.requirements?.env || skill.envKeys || [],
        bin: skill.requirements?.bin || skill.binaries || [],
      },
      versions: ((versions as any)?.versions || (versions as any)?.items || []).map((v: any) => ({
        version: v.version || v.tag,
        date: v.publishedAt || v.createdAt || v.date || '',
        changelog: v.changelog || v.summary || '',
        latest: v.latest || false,
      })),
    };
  } catch {
    return null;
  }
}

function mapHubSkill(raw: any): HubSkill {
  // API nests stats: { stats: { downloads, stars, installsAllTime, ... } }
  const stats = raw.stats || {};
  return {
    slug: raw.slug || raw.name || raw.id || '',
    name: raw.displayName || raw.name || raw.slug || '',
    emoji: raw.emoji || guessEmoji(raw.slug || ''),
    summary: raw.summary || raw.description || '',
    owner: raw.owner?.displayName || raw.owner?.handle || raw.owner?.username || raw.author || '',
    ownerAvatar: raw.owner?.image || raw.owner?.avatarUrl || '',
    stars: stats.stars ?? raw.stars ?? 0,
    downloads: stats.downloads ?? raw.downloads ?? 0,
    installs: stats.installsAllTime ?? stats.installsCurrent ?? raw.installs ?? 0,
    version: raw.latestVersion?.version || raw.version || raw.tags?.latest || '0.0.0',
    badge: raw.official ? 'official' : raw.featured ? 'featured' : undefined,
    category: raw.category || guessCategory(raw.slug || '', raw.summary || ''),
  };
}

function guessEmoji(slug: string): string {
  const s = slug.toLowerCase();
  if (s.includes('weather')) return '🌤️';
  if (s.includes('image') || s.includes('banana')) return '🎨';
  if (s.includes('whisper') || s.includes('audio')) return '🎙️';
  if (s.includes('github') || s.includes('git')) return '🐙';
  if (s.includes('search') || s.includes('tavily')) return '🔎';
  if (s.includes('browser')) return '🌐';
  if (s.includes('gog') || s.includes('gmail') || s.includes('google')) return '📧';
  if (s.includes('notion')) return '📓';
  if (s.includes('calendar')) return '📅';
  if (s.includes('skill') || s.includes('creator')) return '🛠️';
  if (s.includes('health')) return '🏥';
  if (s.includes('agent') || s.includes('improving')) return '🧠';
  if (s.includes('summar')) return '📝';
  if (s.includes('sonos') || s.includes('audio')) return '🔊';
  if (s.includes('obsidian')) return '💎';
  if (s.includes('human') || s.includes('write')) return '✍️';
  if (s.includes('update')) return '🔄';
  return '🧩';
}

// Fallback for ClawHub skills that have no category field.
// Uses the same IDs as SkillsHub so client-side filtering is consistent.
function guessCategory(slug: string, summary: string): string {
  const s = (slug + ' ' + summary).toLowerCase();
  if (s.includes('github') || s.includes('browser') || s.includes('code') || s.includes('devops') || s.includes('terminal') || s.includes('git ') || s.includes('docker')) return 'developer-tools';
  if (s.includes('google') || s.includes('notion') || s.includes('calendar') || s.includes('obsidian') || s.includes('weather') || s.includes('summar') || s.includes('task')) return 'productivity';
  if (s.includes('agent') || s.includes('memory') || s.includes('llm') || s.includes('openai') || s.includes('claude') || s.includes('image') || s.includes('whisper')) return 'ai-intelligence';
  if (s.includes('write') || s.includes('blog') || s.includes('human') || s.includes('content') || s.includes('draft')) return 'content-creation';
  if (s.includes('data') || s.includes('sql') || s.includes('analytics') || s.includes('chart') || s.includes('csv')) return 'data-analysis';
  if (s.includes('slack') || s.includes('discord') || s.includes('email') || s.includes('gmail') || s.includes('telegram') || s.includes('meet')) return 'communication-collaboration';
  if (s.includes('security') || s.includes('auth') || s.includes('encrypt') || s.includes('compliance') || s.includes('vuln')) return 'security-compliance';
  return 'developer-tools';
}

// ═══════════════════════════════════════════════════════════
// SkillsHub (Tencent CN mirror) — lightmake.site backend
//
// Real backend: https://lightmake.site (globally accessible)
//   GET /api/skills/top           → { code:0, data: { skills: [...] } }
//   GET /api/skills?keyword=&pageSize=&sortBy=&order=&category=
//       → { code:0, data: { skills: [...], total: N } }
// ═══════════════════════════════════════════════════════════

const SKILLSHUB_API = 'https://lightmake.site';
/** Public SkillHub website (skill detail pages: /skills/{slug}) */
const SKILLSHUB_PUBLIC_ORIGIN = 'https://www.skillhub.cn';

function resolveSkillHubPublicSkillPageUrl(slug: string, homepage?: string | null): string {
  const key = typeof slug === 'string' ? slug.trim() : '';
  if (!key) return SKILLSHUB_PUBLIC_ORIGIN;
  const canonical = `${SKILLSHUB_PUBLIC_ORIGIN}/skills/${encodeURIComponent(key)}`;
  const raw = typeof homepage === 'string' ? homepage.trim() : '';
  if (!raw) return canonical;
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'skillhub.cn' && u.pathname.includes('/skills/')) {
      return raw;
    }
  } catch {
    /* use canonical */
  }
  return canonical;
}

interface ShRawSkill {
  slug: string;
  name: string;
  description: string;
  description_zh?: string;
  category?: string;
  version: string;
  homepage?: string;
  tags?: string[] | null;
  downloads: number;
  stars: number;
  installs: number;
  updated_at?: number;
  score?: number;
  ownerName?: string;
}

function mapShSkill(raw: ShRawSkill, featured = false): HubSkill {
  const desc = raw.description_zh || raw.description || '';
  return {
    slug: raw.slug,
    name: raw.name,
    emoji: guessEmoji(raw.slug),
    summary: desc,
    owner: raw.ownerName || '',
    ownerAvatar: '',
    stars: raw.stars || 0,
    downloads: raw.downloads || 0,
    installs: raw.installs || 0,
    version: raw.version || '0.0.0',
    badge: featured ? 'featured' : undefined,
    // Use the real category from SkillsHub; fall back to heuristic only when absent
    category: raw.category || guessCategory(raw.slug, desc),
    homepage: raw.homepage,
  };
}

async function fetchSkillsHubTop(): Promise<HubSkill[]> {
  const res = await fetch(`${SKILLSHUB_API}/api/skills/top`);
  if (!res.ok) throw new Error(`SkillsHub /api/skills/top: ${res.status}`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message || 'SkillsHub error');
  return ((json.data?.skills || []) as ShRawSkill[]).map(s => mapShSkill(s, true));
}

async function fetchSkillsHubList(opts: {
  keyword?: string;
  sortBy?: string;
  order?: string;
  pageSize?: number;
  page?: number;
}): Promise<{ skills: HubSkill[]; total: number }> {
  const params = new URLSearchParams();
  params.set('pageSize', String(opts.pageSize ?? 50));
  if (opts.page && opts.page > 1) params.set('page', String(opts.page));
  if (opts.keyword?.trim()) params.set('keyword', opts.keyword.trim());
  if (opts.sortBy) params.set('sortBy', opts.sortBy);
  if (opts.order) params.set('order', opts.order);
  const res = await fetch(`${SKILLSHUB_API}/api/skills?${params}`);
  if (!res.ok) throw new Error(`SkillsHub /api/skills: ${res.status}`);
  const json = await res.json();
  if (json.code !== 0) throw new Error(json.message || 'SkillsHub error');
  return {
    skills: ((json.data?.skills || []) as ShRawSkill[]).map(s => mapShSkill(s)),
    total: json.data?.total ?? 0,
  };
}

async function searchSkillsHub(query: string): Promise<{ skills: HubSkill[]; total: number }> {
  return fetchSkillsHubList({ keyword: query, pageSize: 100 });
}

async function fetchSkillsHubDetail(slug: string): Promise<SkillDetail | null> {
  // Use the list API with exact slug match — no dedicated detail endpoint
  try {
    const { skills: results } = await fetchSkillsHubList({ keyword: slug, pageSize: 5 });
    const hit = results.find(s => s.slug === slug) || results[0];
    if (hit) {
      return {
        ...hit,
        readme: hit.summary,
        requirements: { env: [], bin: [] },
        versions: [],
      };
    }
  } catch { /* fall through */ }
  return null;
}

// ═══════════════════════════════════════════════════════════
// Gateway — Installed Skills
// ═══════════════════════════════════════════════════════════

async function fetchManagedInstalledSkills(): Promise<{ skills: MySkill[]; available: boolean }> {
  try {
    const result = await window.aegis.skills?.listManaged();
    if (!result?.success) {
      return { skills: [], available: false };
    }
    return {
      available: true,
      skills: result.skills.map(skill => ({
        slug: skill.slug || skill.dirName,
        name: skill.name || skill.slug || skill.dirName,
        emoji: guessEmoji(skill.slug || skill.dirName),
        description: skill.description || '',
        version: skill.version || '',
        enabled: true,
        source: 'openclaw-managed',
        dirName: skill.dirName,
      })),
    };
  } catch (err) {
    console.warn('[Skills] Managed directory scan failed:', err);
    return { skills: [], available: false };
  }
}

async function isSkillInstalledInManagedDir(slug: string): Promise<boolean> {
  const { skills, available } = await fetchManagedInstalledSkills();
  if (!available) return false;
  return skills.some(skill => skill.slug === slug || skill.dirName === slug || skill.name === slug);
}

async function isManagedSkillPresent(matchers: Array<string | undefined>): Promise<boolean> {
  const values = new Set(matchers.filter((value): value is string => Boolean(value)));
  if (values.size === 0) return false;
  const { skills, available } = await fetchManagedInstalledSkills();
  if (!available) return true;
  return skills.some(skill =>
    values.has(skill.slug)
    || (Boolean(skill.dirName) && values.has(skill.dirName as string))
    || values.has(skill.name)
  );
}

function mergeInstalledSkills(scannedSkills: MySkill[], gatewaySkills: MySkill[], managedScanAvailable: boolean): MySkill[] {
  const merged: MySkill[] = [...scannedSkills];
  const keyToIndex = new Map<string, number>();

  const register = (skill: MySkill, index: number) => {
    if (skill.dirName) keyToIndex.set(`dir:${skill.dirName}`, index);
    if (skill.slug) keyToIndex.set(`slug:${skill.slug}`, index);
  };

  merged.forEach(register);

  for (const skill of gatewaySkills) {
    const existingIndex = skill.dirName
      ? keyToIndex.get(`dir:${skill.dirName}`)
      : keyToIndex.get(`slug:${skill.slug}`);
    if (existingIndex !== undefined) {
      const existing = merged[existingIndex];
      merged[existingIndex] = {
        ...existing,
        ...skill,
        name: skill.name || existing.name,
        emoji: skill.emoji || existing.emoji,
        description: skill.description || existing.description,
        version: skill.version || existing.version,
        source: skill.source || existing.source,
        dirName: skill.dirName || existing.dirName,
      };
      register(merged[existingIndex], existingIndex);
      continue;
    }
    if (managedScanAvailable && skill.source === 'openclaw-managed') {
      continue;
    }
    const nextIndex = merged.push(skill) - 1;
    register(skill, nextIndex);
  }

  return merged;
}

function resolveInstalledSkillVersion(raw: any): string {
  const candidates = [
    raw?.version,
    raw?.installedVersion,
    raw?.currentVersion,
    raw?.meta?.version,
    raw?.latestVersion?.version,
    raw?.latestVersion?.tag,
    raw?.tags?.latest,
  ];
  const hit = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
  return typeof hit === 'string' ? hit.trim() : '';
}

async function fetchInstalledSkills(): Promise<MySkill[]> {
  const { skills: scannedSkills, available: managedScanAvailable } = await fetchManagedInstalledSkills();
  try {
    const result = await gateway.call('skills.status', {});
    const skills = result?.skills || result?.entries || [];
    const gatewaySkills = skills.map((s: any) => {
      const skillKey = s.skillKey || s.slug || s.name || '';
      const dirName: string | undefined = s.baseDir
        ? s.baseDir.split('/').pop() || s.baseDir.split('\\').pop() || undefined
        : undefined;
      return {
        slug: skillKey,
        name: s.displayName || s.name || s.slug || '',
        emoji: s.emoji || guessEmoji(skillKey),
        description: s.description || s.summary || '',
        version: resolveInstalledSkillVersion(s),
        enabled: s.disabled !== true && s.enabled !== false,
        source: s.source || 'openclaw-managed',
        dirName,
      };
    });
    return mergeInstalledSkills(scannedSkills, gatewaySkills, managedScanAvailable);
  } catch (err) {
    console.warn('[Skills] Gateway skills.status failed:', err);
    return scannedSkills;
  }
}

// ═══════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════

type HubView = 'featured' | 'browse';
type TabId = 'my' | 'skillhub' | 'clawhub';
/** Source that owns the currently-open detail panel. */
type DetailSource = 'skillshub' | 'clawhub';

const SKILLSHUB_FALLBACK_TOTAL = 35_000;
const CLAWHUB_FALLBACK_TOTAL = 35_000;
const SHOW_CLAWHUB_TAB = false;
const SKILLSHUB_TOTAL_CACHE_KEY = 'aegis:skillshub-total';

function loadCachedSkillsHubTotal(): number {
  try {
    const raw = localStorage.getItem(SKILLSHUB_TOTAL_CACHE_KEY);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  } catch {}
  return SKILLSHUB_FALLBACK_TOTAL;
}

export function SkillsPage() {
  const { t } = useTranslation();
  const { connected } = useChatStore();

  // ── State ──
  const [activeTab, setActiveTab] = useState<TabId>('my');
  const [mySkills, setMySkills] = useState<MySkill[]>([]);
  const [loadingMy, setLoadingMy] = useState(false);

  // SkillHub tab state
  const [shSkills, setShSkills] = useState<HubSkill[]>([]);
  const [shApiOk, setShApiOk] = useState<boolean | null>(null);
  const [loadingSh, setLoadingSh] = useState(false);
  const [shTotal, setShTotal] = useState(loadCachedSkillsHubTotal);
  const shTotalResolvedRef = useRef(false);
  const [shPage, setShPage] = useState(1);
  const [loadingShMore, setLoadingShMore] = useState(false);
  const [shView, setShView] = useState<HubView>('browse');
  const [shSearch, setShSearch] = useState('');
  const [shCat, setShCat] = useState('all');
  const [shCliInstalled, setShCliInstalled] = useState<boolean | null>(null);

  // ClawHub tab state
  const [chSkills, setChSkills] = useState<HubSkill[]>([]);
  const [chApiOk, setChApiOk] = useState<boolean | null>(null);
  const [loadingCh, setLoadingCh] = useState(false);
  const [chSearch, setChSearch] = useState('');
  const [chCooldownUntil, setChCooldownUntil] = useState(0);
  const [chAuth, setChAuth] = useState<ClawHubAuthStatus | null>(null);
  const [checkingChAuth, setCheckingChAuth] = useState(false);
  const [chErrorKind, setChErrorKind] = useState<ClawHubErrorKind>(null);
  const [clawHubNow, setClawHubNow] = useState(() => Date.now());

  // Detail panel state (shared between both hub tabs)
  const [detailSkill, setDetailSkill] = useState<SkillDetail | null>(null);
  const [detailSource, setDetailSource] = useState<DetailSource>('skillshub');
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [installState, setInstallState] = useState<InstallState>('idle');
  const [installErrorText, setInstallErrorText] = useState('');
  const [installNeedsLogin, setInstallNeedsLogin] = useState(false);

  // Import local skill state
  type ImportStatus = { kind: 'idle' } | { kind: 'importing' } | { kind: 'success'; name: string } | { kind: 'error'; msg: string };
  const [importStatus, setImportStatus] = useState<ImportStatus>({ kind: 'idle' });
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const importMenuRef = useRef<HTMLDivElement>(null);

  // Close import menu on outside click
  useEffect(() => {
    if (!importMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
        setImportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [importMenuOpen]);

  // ── Load data ──
  const loadMySkills = useCallback(async () => {
    if (!connected) return;
    setLoadingMy(true);
    try {
      const skills = await fetchInstalledSkills();
      setMySkills(skills);
    } finally {
      setLoadingMy(false);
    }
  }, [connected]);

  // ── SkillHub tab: load list ──
  const loadSkillHub = useCallback(async (view = shView) => {
    setLoadingSh(true);
    setShPage(1);
    try {
      if (view === 'featured') {
        const skills = await fetchSkillsHubTop();
        if (skills.length === 0) throw new Error('SkillHub returned empty list');
        setShSkills(skills);
        if (!shTotalResolvedRef.current) {
          const { total } = await fetchSkillsHubList({ pageSize: 1 });
          if (total > 0) setShTotal(total);
          shTotalResolvedRef.current = true;
        }
      } else {
        const r = await fetchSkillsHubList({ sortBy: 'downloads', order: 'desc', pageSize: 100 });
        if (r.skills.length === 0) throw new Error('SkillHub returned empty list');
        setShSkills(r.skills);
        if (r.total > 0) {
          setShTotal(r.total);
          shTotalResolvedRef.current = true;
        }
      }
      setShApiOk(true);
    } catch (err) {
      console.error('[SkillHub] load failed:', err);
      setShApiOk(false);
    } finally {
      setLoadingSh(false);
    }
  }, [shView]);

  // ── SkillHub: switch featured / browse sub-views ──
  const switchShView = useCallback((view: HubView) => {
    setShView(view);
    setShSearch('');
    setShCat('all');
    loadSkillHub(view);
  }, [loadSkillHub]);

  // ── SkillHub: load more pages ──
  const loadMoreSh = useCallback(async () => {
    if (loadingShMore || shView !== 'browse') return;
    setLoadingShMore(true);
    const nextPage = shPage + 1;
    try {
      const isSearch = shSearch.trim().length > 0;
      const { skills } = await fetchSkillsHubList({
        ...(isSearch ? { keyword: shSearch.trim() } : { sortBy: 'downloads', order: 'desc' }),
        pageSize: 100,
        page: nextPage,
      });
      if (skills.length > 0) {
        setShSkills(prev => {
          const seen = new Set(prev.map(s => s.slug));
          return [...prev, ...skills.filter(s => !seen.has(s.slug))];
        });
        setShPage(nextPage);
      }
    } finally {
      setLoadingShMore(false);
    }
  }, [shView, shPage, loadingShMore, shSearch]);

  // ── ClawHub tab: load list ──
  const loadClawHub = useCallback(async () => {
    setLoadingCh(true);
    try {
      let authStatus = chAuth;
      if (!authStatus && window.aegis?.clawhub?.authStatus) {
        authStatus = await window.aegis.clawhub.authStatus().catch(() => null);
        if (authStatus) setChAuth(authStatus);
      }

      let skills: HubSkill[] = [];
      if (authStatus?.loggedIn && window.aegis?.clawhub?.searchCli) {
        try {
          skills = await fetchHubSkillsViaCli('downloads', 30);
        } catch {
          skills = await fetchHubSkills('downloads', 30);
        }
      } else {
        skills = await fetchHubSkills('downloads', 30);
      }
      if (skills.length === 0) throw new Error('ClawHub returned empty list');
      setChSkills(skills);
      setChApiOk(true);
      setChErrorKind(null);
      setChCooldownUntil(0);
    } catch (err) {
      console.error('[ClawHub] load failed:', err);
      if (err instanceof ClawHubRateLimitError) {
        setChErrorKind('rate_limit');
        setChCooldownUntil(Date.now() + err.retryAfterMs);
        setChApiOk(chSkills.length > 0);
      } else {
        setChErrorKind('network');
        setChApiOk(chSkills.length > 0);
      }
    } finally {
      setLoadingCh(false);
    }
  }, [chSkills.length, chAuth]);

  const refreshClawHubAuth = useCallback(async () => {
    if (!window.aegis?.clawhub?.authStatus) return;
    setCheckingChAuth(true);
    try {
      const status = await window.aegis.clawhub.authStatus();
      setChAuth(status);
    } catch (err) {
      setChAuth({
        available: false,
        loggedIn: false,
        source: null,
        displayName: null,
        error: String(err),
      });
    } finally {
      setCheckingChAuth(false);
    }
  }, []);

  const handleClawHubLogin = useCallback(async () => {
    if (window.aegis?.clawhub?.loginCli) {
      const res = await window.aegis.clawhub.loginCli();
      if (res?.success) {
        setTimeout(() => { void refreshClawHubAuth(); }, 1200);
        return;
      }
      if (window.aegis?.clawhub?.openLogin) {
        await window.aegis.clawhub.openLogin();
        return;
      }
      setInstallErrorText(res?.error ?? t('skills.clawhubLoginUnavailable'));
      return;
    }
    if (window.aegis?.clawhub?.openLogin) {
      await window.aegis.clawhub.openLogin();
      return;
    }
    window.open('https://clawhub.ai', '_blank');
  }, [refreshClawHubAuth, t]);

  // Initial load
  useEffect(() => { loadMySkills(); }, [loadMySkills]);

  // Resolve SkillHub total count proactively (without waiting for tab switch),
  // so the tab badge shows an accurate number from startup.
  useEffect(() => {
    if (shTotalResolvedRef.current) return;
    let cancelled = false;
    void (async () => {
      try {
        const { total } = await fetchSkillsHubList({ pageSize: 1 });
        if (cancelled) return;
        if (total > 0) {
          setShTotal(total);
          shTotalResolvedRef.current = true;
        }
      } catch {
        // Keep cached/fallback value; we'll retry when user opens SkillHub tab.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist latest known total so next launch can show accurate count immediately.
  useEffect(() => {
    if (!Number.isFinite(shTotal) || shTotal <= 0) return;
    try {
      localStorage.setItem(SKILLSHUB_TOTAL_CACHE_KEY, String(Math.round(shTotal)));
    } catch {}
  }, [shTotal]);

  // Keep stable refs to avoid stale closures in the activeTab effect
  const loadSkillHubRef = useRef(loadSkillHub);
  const loadClawHubRef = useRef(loadClawHub);
  const chCooldownUntilRef = useRef(chCooldownUntil);
  useEffect(() => { loadSkillHubRef.current = loadSkillHub; }, [loadSkillHub]);
  useEffect(() => { loadClawHubRef.current = loadClawHub; }, [loadClawHub]);
  useEffect(() => { chCooldownUntilRef.current = chCooldownUntil; }, [chCooldownUntil]);

  useEffect(() => {
    if (activeTab === 'skillhub') {
      // Load when: never loaded (null) OR previous attempt failed (false) — i.e. not yet succeeded.
      // Adding !loadingSh prevents a duplicate in-flight request.
      if (!loadingSh && shSkills.length === 0 && shApiOk !== true) loadSkillHubRef.current();
      if (shCliInstalled === null) {
        window.aegis.skillshub?.check().then(r => setShCliInstalled(r.installed));
      }
    }
    if (activeTab === 'clawhub') {
      if (Date.now() < chCooldownUntilRef.current) return;
      if (!loadingCh && chSkills.length === 0 && chApiOk !== true) loadClawHubRef.current();
      if (!chAuth && !checkingChAuth) void refreshClawHubAuth();
    }
  }, [activeTab, chAuth, checkingChAuth, refreshClawHubAuth]); // eslint-disable-line

  useEffect(() => {
    if (activeTab !== 'clawhub') return;
    setClawHubNow(Date.now());
    if (chCooldownUntil <= Date.now()) return;
    const timer = window.setInterval(() => setClawHubNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeTab, chCooldownUntil]);

  // SkillHub: search with debounce (browse view only)
  useEffect(() => {
    if (!shSearch.trim() || activeTab !== 'skillhub' || shView !== 'browse') return;
    const timer = setTimeout(async () => {
      setLoadingSh(true);
      setShPage(1);
      try {
        const r = await searchSkillsHub(shSearch);
        if (r.skills.length > 0) {
          setShSkills(r.skills);
          setShTotal(r.total);
        }
      } finally {
        setLoadingSh(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [shSearch, activeTab, shView]);

  // SkillHub: clear search → reload browse list
  useEffect(() => {
    if (!shSearch.trim() && activeTab === 'skillhub' && shView === 'browse') loadSkillHub('browse');
  }, [shSearch]); // eslint-disable-line

  // ClawHub: search with debounce
  useEffect(() => {
    const query = chSearch.trim();
    if (!query || activeTab !== 'clawhub') return;
    if (query.length < 2) return;
    const timer = setTimeout(async () => {
      if (Date.now() < chCooldownUntil) return;
      setLoadingCh(true);
      try {
        let skills: HubSkill[] = [];
        if (chAuth?.loggedIn) {
          skills = await searchHubSkillsViaCli(query);
        } else {
          skills = await searchHubSkills(query);
          if (skills.length === 0 && window.aegis?.clawhub?.searchCli) {
            skills = await searchHubSkillsViaCli(query);
          }
        }
        setChSkills(skills);
        setChApiOk(true);
        setChErrorKind(null);
        setChCooldownUntil(0);
      } catch (err) {
        console.error('[ClawHub] search failed:', err);
        if (err instanceof ClawHubRateLimitError && chAuth?.loggedIn) {
          try {
            const skills = await searchHubSkillsViaCli(query);
            setChSkills(skills);
            setChApiOk(true);
            setChErrorKind(null);
            setChCooldownUntil(0);
            return;
          } catch (fallbackErr) {
            console.error('[ClawHub] CLI search fallback failed:', fallbackErr);
          }
        }
        if (err instanceof ClawHubRateLimitError) {
          setChErrorKind('rate_limit');
          setChCooldownUntil(Date.now() + err.retryAfterMs);
          setChApiOk(chSkills.length > 0);
        } else {
          setChErrorKind('network');
          setChApiOk(chSkills.length > 0);
        }
      } finally {
        setLoadingCh(false);
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [chSearch, activeTab, chCooldownUntil, chSkills.length, chAuth?.loggedIn]);

  // ClawHub: clear search → reload
  useEffect(() => {
    if (!chSearch.trim() && activeTab === 'clawhub' && Date.now() >= chCooldownUntil) loadClawHub();
  }, [chSearch, activeTab, chCooldownUntil, loadClawHub]);

  // ── Filtered skill lists ──
  const filteredSh = useMemo(() => {
    if (shCat === 'all') return shSkills;
    return shSkills.filter(s => s.category === shCat);
  }, [shSkills, shCat]);

  // ── Open detail ──
  const openDetail = useCallback(async (slug: string, source: DetailSource) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailSkill(null);
    setDetailSource(source);
    setInstallState('idle');
    setInstallErrorText('');
    setInstallNeedsLogin(false);
    const skillsList = source === 'skillshub' ? shSkills : chSkills;
    try {
      let detail: SkillDetail | null = null;
      if (source === 'skillshub') {
        detail = await fetchSkillsHubDetail(slug);
      } else {
        detail = await fetchSkillDetail(slug);
      }
      if (detail) {
        setDetailSkill(detail);
      } else {
        const hub = skillsList.find(s => s.slug === slug);
        if (hub) setDetailSkill({ ...hub, readme: '', requirements: { env: [], bin: [] }, versions: [] });
      }
    } finally {
      setDetailLoading(false);
    }
  }, [shSkills, chSkills]);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setTimeout(() => {
      setDetailSkill(null);
      setInstallState('idle');
      setInstallErrorText('');
      setInstallNeedsLogin(false);
    }, 300);
  }, []);

  // ── Toggle skill (enable/disable via gateway) ──
  const toggleSkill = useCallback(async (slug: string) => {
    const skill = mySkills.find(s => s.slug === slug);
    if (!skill) return;
    const nextEnabled = !skill.enabled;
    setMySkills(prev => prev.map(s => s.slug === slug ? { ...s, enabled: nextEnabled } : s));
    try {
      await gateway.call('skills.update', { skillKey: slug, enabled: nextEnabled });
    } catch (err) {
      console.warn('[Skills] toggle failed, reverting:', err);
      setMySkills(prev => prev.map(s => s.slug === slug ? { ...s, enabled: !nextEnabled } : s));
    }
  }, [mySkills]);

  // ── Delete skill ──
  const [deleteConfirm, setDeleteConfirm] = useState<{ slug: string; dirName?: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const requestDelete = useCallback((slug: string) => {
    const skill = mySkills.find(s => s.slug === slug);
    if (!skill || !isSkillDeletable(skill.source)) return;
    setDeleteConfirm({ slug, dirName: skill.dirName, name: skill.name });
  }, [mySkills]);

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      // Prefer the actual directory name (dirName) over skillKey (slug) for deletion,
      // since the skill's SKILL.md declared key may differ from the installed directory name.
      const deleteKey = deleteConfirm.dirName || deleteConfirm.slug;
      const res = await window.aegis.skills?.delete(deleteKey);
      if (res?.success) {
        const managedScan = await fetchManagedInstalledSkills();
        if (!managedScan.available) {
          setMySkills(prev => prev.filter(s => s.slug !== deleteConfirm.slug));
          setDeleteConfirm(null);
          return;
        }
        const deletedSkillMatchers = [deleteConfirm.dirName, deleteConfirm.slug, deleteConfirm.name];
        for (let i = 0; i < 6; i++) {
          const stillExists = await isManagedSkillPresent(deletedSkillMatchers);
          const skills = await fetchInstalledSkills();
          setMySkills(skills);
          if (!stillExists) break;
          if (i < 5) {
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        }
        setDeleteConfirm(null);
      } else {
        alert(t('skills.deleteError', { error: res?.error ?? 'unknown' }));
      }
    } catch (err: any) {
      alert(t('skills.deleteError', { error: String(err?.message ?? err) }));
    } finally {
      setDeleting(false);
    }
  }, [deleteConfirm, t]);

  // ── Import local skill ──
  const runImport = useCallback(async (method: 'folder' | 'zip') => {
    setImportMenuOpen(false);
    setImportStatus({ kind: 'importing' });
    try {
      const api = window.aegis.skills;
      if (!api) {
        setImportStatus({ kind: 'error', msg: 'Import not available' });
        return;
      }
      const res = method === 'folder' ? await api.importFolder() : await api.importZip();
      if (!res.success) {
        if (res.error === 'canceled') {
          setImportStatus({ kind: 'idle' });
          return;
        }
        setImportStatus({ kind: 'error', msg: res.error ?? 'Import failed' });
        return;
      }
      setImportStatus({ kind: 'success', name: res.skillName ?? 'Skill' });
      // Auto-dismiss success toast after 4 s
      setTimeout(() => setImportStatus({ kind: 'idle' }), 4000);
      // Refresh skills list
      await loadMySkills();
    } catch (err: any) {
      setImportStatus({ kind: 'error', msg: String(err?.message ?? err) });
    }
  }, [loadMySkills]);

  // ── Install skill ──
  // SkillHub: uses the skillhub CLI (auto-installs if missing).
  // ClawHub: uses native `openclaw skills install` in the main process.
  const handleInstall = useCallback(async (slug: string) => {
    setInstallState('installing');
    setInstallErrorText('');
    setInstallNeedsLogin(false);
    try {
      if (detailSource === 'skillshub') {
        let cliReady = shCliInstalled;
        if (!cliReady) {
          const cliRes = await window.aegis.skillshub?.installCli();
          if (cliRes?.success) {
            setShCliInstalled(true);
            cliReady = true;
          } else {
            console.error('[SkillHub] CLI auto-install failed:', cliRes?.error);
            setInstallState('error');
            return;
          }
        }
        const res = await window.aegis.skillshub?.install(slug);
        if (!res?.success) {
          console.error('[SkillHub] install failed:', res?.error);
          setInstallState('error');
          setInstallErrorText(res?.error ?? t('skills.skillshubInstallError'));
          return;
        }
      } else {
        const res = await window.aegis.clawhub?.install(slug);
        if (!res?.success) {
          console.error('[ClawHub] install failed:', res?.error);
          setInstallState('error');
          setInstallErrorText(res?.error ?? t('skills.clawhubInstallFailed'));
          setInstallNeedsLogin(Boolean(res?.needsLogin));
          if (res?.authStatus) {
            setChAuth(res.authStatus);
          } else {
            void refreshClawHubAuth();
          }
          return;
        }
      }

      setInstallState('done');
      setInstallErrorText('');
      setInstallNeedsLogin(false);
      if (detailSource === 'clawhub') void refreshClawHubAuth();
      for (let i = 0; i < 6; i++) {
        const installedInManagedDir = await isSkillInstalledInManagedDir(slug);
        const skills = await fetchInstalledSkills();
        setMySkills(skills);
        if (installedInManagedDir || skills.some(s => s.slug === slug || s.dirName === slug || s.name === slug)) break;
        if (i < 5) {
          await new Promise(resolve => setTimeout(resolve, 600));
        }
      }
    } catch (err) {
      console.error('[Hub] install failed:', err);
      setInstallState('error');
      setInstallErrorText(String(err));
    }
  }, [detailSource, refreshClawHubAuth, shCliInstalled, t]);

  // ═══ RENDER ═══
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="max-w-[900px] mx-auto px-9 py-8 pb-16">

        {/* ═══ Header ═══ */}
        <div className="flex items-center gap-3 mb-6">
          <span className="text-[22px]">🧩</span>
          <h1 className="text-[21px] font-bold tracking-tight">{t('skills.title')}</h1>
        </div>

        {/* ═══ Tabs ═══ */}
        <div className="inline-flex gap-0.5 p-[3px] rounded-xl glass border border-[rgb(var(--aegis-overlay)/0.05)] mb-7">
          {([
            { id: 'my' as TabId, icon: Package, label: t('skills.mySkills'), count: mySkills.length },
            { id: 'skillhub' as TabId, icon: Globe, label: t('skills.hubTab'), count: shTotal },
            { id: 'clawhub' as TabId, icon: Globe, label: t('skills.clawHubTab'), count: CLAWHUB_FALLBACK_TOTAL },
          ].filter(tab => SHOW_CLAWHUB_TAB || tab.id !== 'clawhub')).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 px-5 py-2.5 rounded-[9px] text-[13px] font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-aegis-primary/[0.08] text-aegis-primary font-semibold'
                  : 'text-aegis-text-muted hover:text-aegis-text-secondary',
              )}
            >
              <tab.icon size={14} />
              {tab.label}
              {tab.count > 0 && (
                <span className={clsx(
                  'text-[10px] px-1.5 py-0.5 rounded-md font-semibold',
                  activeTab === tab.id
                    ? 'bg-aegis-primary/10 text-aegis-primary'
                    : 'bg-[rgb(var(--aegis-overlay)/0.04)] text-aegis-text-dim',
                )}>
                  {tab.count >= 1000 ? `${(tab.count / 1000).toFixed(0)}k+` : tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ═══ My Skills Tab ═══ */}
        <>
          {activeTab === 'my' && (
            <div>
              {/* ── Import toolbar ── */}
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px] text-aegis-text-dim">
                  {mySkills.length > 0
                    ? t('skills.installedCount', { count: mySkills.length })
                    : null}
                </p>

                {/* Import button + dropdown */}
                <div className="relative" ref={importMenuRef}>
                  <button
                    onClick={() => setImportMenuOpen(v => !v)}
                    disabled={importStatus.kind === 'importing'}
                    className={clsx(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-medium border transition-all',
                      importStatus.kind === 'importing'
                        ? 'opacity-50 cursor-wait border-aegis-primary/20 text-aegis-primary'
                        : 'border-aegis-primary/20 text-aegis-primary hover:bg-aegis-primary/[0.06] hover:border-aegis-primary/30',
                    )}
                  >
                    {importStatus.kind === 'importing'
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Upload size={12} />}
                    {t('skills.importLocal')}
                  </button>

                  {/* Dropdown menu */}
                  <AnimatePresence>
                    {importMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ duration: 0.1 }}
                        className="absolute end-0 top-full mt-1.5 z-50 w-52
                          bg-aegis-menu-bg border border-aegis-menu-border rounded-xl
                          shadow-[0_8px_32px_rgba(0,0,0,0.2)] overflow-hidden"
                      >
                        <button
                          onClick={() => runImport('folder')}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12.5px]
                            text-aegis-text hover:bg-[rgb(var(--aegis-overlay)/0.04)] transition-colors"
                        >
                          <FolderOpen size={13} className="text-aegis-primary shrink-0" />
                          <div className="text-start">
                            <div className="font-medium">{t('skills.importFromFolder')}</div>
                            <div className="text-[10px] text-aegis-text-dim">{t('skills.importFromFolderHint')}</div>
                          </div>
                        </button>
                        <div className="h-px mx-3 bg-aegis-menu-border" />
                        <button
                          onClick={() => runImport('zip')}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12.5px]
                            text-aegis-text hover:bg-[rgb(var(--aegis-overlay)/0.04)] transition-colors"
                        >
                          <FileArchive size={13} className="text-aegis-primary shrink-0" />
                          <div className="text-start">
                            <div className="font-medium">{t('skills.importFromZip')}</div>
                            <div className="text-[10px] text-aegis-text-dim">{t('skills.importFromZipHint')}</div>
                          </div>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* ── Import status banner ── */}
              <AnimatePresence>
                {(importStatus.kind === 'success' || importStatus.kind === 'error') && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-4 overflow-hidden"
                  >
                    <div className={clsx(
                      'flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[12px] border',
                      importStatus.kind === 'success'
                        ? 'bg-aegis-success/[0.06] border-aegis-success/20 text-aegis-success'
                        : 'bg-aegis-danger/[0.06] border-aegis-danger/20 text-aegis-danger',
                    )}>
                      {importStatus.kind === 'success'
                        ? <CheckCircle2 size={14} className="shrink-0" />
                        : <AlertCircle size={14} className="shrink-0" />}
                      <span className="flex-1">
                        {importStatus.kind === 'success'
                          ? t('skills.importSuccess', { name: importStatus.name })
                          : importStatus.msg}
                      </span>
                      <button
                        onClick={() => setImportStatus({ kind: 'idle' })}
                        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity text-[11px]"
                      >✕</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {loadingMy ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 size={22} className="animate-spin text-aegis-text-dim" />
                </div>
              ) : mySkills.length === 0 ? (
                <div className="text-center py-20">
                  <div className="text-[32px] mb-3">📦</div>
                  <p className="text-[13px] text-aegis-text-dim font-medium">{t('skills.noSkills')}</p>
                  <p className="text-[11px] text-aegis-text-dim/60 mt-1">{t('skills.noSkillsHint')}</p>
                </div>
              ) : (
                <SkillGroups
                  skills={mySkills}
                  onToggle={toggleSkill}
                  onDelete={requestDelete}
                />
              )}
            </div>
          )}

          {/* ═══ SkillHub Tab ═══ */}
          {activeTab === 'skillhub' && (
            <div>
              <SkillsHubCliBanner
                installed={shCliInstalled}
                onCheckDone={setShCliInstalled}
              />

              {/* Sub-tabs: Featured / Browse */}
              <div className="flex gap-1 mb-5 p-1 rounded-xl
                bg-[rgb(var(--aegis-overlay)/0.03)] border border-[rgb(var(--aegis-overlay)/0.06)]">
                <button
                  onClick={() => switchShView('browse')}
                  className={clsx(
                    'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[12px] font-medium transition-all',
                    shView === 'browse'
                      ? 'bg-aegis-bg shadow-sm text-aegis-text border border-[rgb(var(--aegis-overlay)/0.08)]'
                      : 'text-aegis-text-dim hover:text-aegis-text-secondary'
                  )}
                >
                  <Search size={12} /> {t('skills.viewBrowse')}
                </button>
                <button
                  onClick={() => switchShView('featured')}
                  className={clsx(
                    'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[12px] font-medium transition-all',
                    shView === 'featured'
                      ? 'bg-aegis-bg shadow-sm text-aegis-text border border-[rgb(var(--aegis-overlay)/0.08)]'
                      : 'text-aegis-text-dim hover:text-aegis-text-secondary'
                  )}
                >
                  ⭐ {t('skills.viewFeatured')}
                </button>
              </div>

              {/* Browse-only controls */}
              {shView === 'browse' && (
                <>
                  <div className="max-w-[480px] mx-auto mb-4 relative">
                    <Search size={14} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-aegis-text-dim pointer-events-none" />
                    <input
                      value={shSearch}
                      onChange={e => setShSearch(e.target.value)}
                      placeholder={t('skills.searchPlaceholder')}
                      className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-[rgb(var(--aegis-overlay)/0.06)]
                        bg-[rgb(var(--aegis-overlay)/0.02)] backdrop-blur-sm text-aegis-text text-[13.5px]
                        placeholder:text-aegis-text-dim outline-none
                        focus:border-aegis-primary/30 focus:shadow-[0_0_0_3px_rgb(var(--aegis-primary)/0.08)] transition-all"
                    />
                  </div>
                  <div className="flex items-center gap-2 mb-5 flex-wrap">
                    <CategoryChips active={shCat} onSelect={setShCat} />
                  </div>
                </>
              )}

              {/* Featured header */}
              {shView === 'featured' && !loadingSh && shApiOk !== false && shSkills.length > 0 && (
                <div className="mb-4 text-[11px] text-aegis-text-dim">
                  {t('skills.skillshubTop50Hint')}
                </div>
              )}

              {/* Results */}
              {loadingSh || (shApiOk === null && shSkills.length === 0) ? (
                // Show spinner while loading OR while in initial "not yet loaded" state
                // (before the tab-switch effect fires). Avoids a flash of "no results".
                <div className="flex items-center justify-center py-20">
                  <Loader2 size={22} className="animate-spin text-aegis-text-dim" />
                </div>
              ) : shApiOk === false ? (
                <SkillsHubOffline onRetry={() => loadSkillHub()} />
              ) : filteredSh.length === 0 ? (
                <div className="text-center py-16 text-aegis-text-dim text-[13px]">
                  {t('skills.noResults')}
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-px">
                    {filteredSh.map(skill => (
                      <HubSkillRow
                        key={skill.slug}
                        skill={skill}
                        onClick={() => openDetail(skill.slug, 'skillshub')}
                      />
                    ))}
                  </div>

                  {shView === 'browse' && shSkills.length < shTotal && (
                    <div className="flex flex-col items-center gap-2 pt-5 pb-2">
                      <div className="text-[11px] text-aegis-text-dim">
                        {t('skills.showingOf', { shown: shSkills.length, total: shTotal.toLocaleString() })}
                      </div>
                      <button
                        onClick={loadMoreSh}
                        disabled={loadingShMore}
                        className="flex items-center gap-2 px-5 py-2 rounded-lg text-[12.5px] font-medium
                          border border-[rgb(var(--aegis-overlay)/0.08)]
                          bg-[rgb(var(--aegis-overlay)/0.025)] hover:bg-[rgb(var(--aegis-overlay)/0.05)]
                          text-aegis-text-secondary hover:text-aegis-text
                          transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {loadingShMore ? (
                          <><Loader2 size={13} className="animate-spin" />{t('skills.loadingMore')}</>
                        ) : (
                          t('skills.loadMore', { count: Math.min(100, shTotal - shSkills.length) })
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ═══ ClawHub Tab ═══ */}
          {activeTab === 'clawhub' && (
            <div>
              {/* Search */}
              <ClawHubAuthBanner
                authStatus={chAuth}
                checking={checkingChAuth}
                onLogin={handleClawHubLogin}
                onRefresh={refreshClawHubAuth}
              />
              <div className="max-w-[480px] mx-auto mb-4 relative">
                <Search size={14} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-aegis-text-dim pointer-events-none" />
                <input
                  value={chSearch}
                  onChange={e => setChSearch(e.target.value)}
                  placeholder={t('skills.searchPlaceholder')}
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-[rgb(var(--aegis-overlay)/0.06)]
                    bg-[rgb(var(--aegis-overlay)/0.02)] backdrop-blur-sm text-aegis-text text-[13.5px]
                    placeholder:text-aegis-text-dim outline-none
                    focus:border-aegis-primary/30 focus:shadow-[0_0_0_3px_rgb(var(--aegis-primary)/0.08)] transition-all"
                />
              </div>

              {chErrorKind === 'rate_limit' && chCooldownUntil > clawHubNow && (
                <ClawHubRateLimitNotice
                  retryAfterMs={Math.max(0, chCooldownUntil - clawHubNow)}
                  authStatus={chAuth}
                />
              )}

              {/* Results */}
              {loadingCh || (chApiOk === null && chSkills.length === 0) ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 size={22} className="animate-spin text-aegis-text-dim" />
                </div>
              ) : chApiOk === false && chSkills.length === 0 ? (
                <ClawHubOffline
                  onRetry={loadClawHub}
                  retryAfterMs={Math.max(0, chCooldownUntil - clawHubNow)}
                  onLogin={handleClawHubLogin}
                  onRefreshAuth={refreshClawHubAuth}
                  authStatus={chAuth}
                />
              ) : chSkills.length === 0 ? (
                <div className="text-center py-16 text-aegis-text-dim text-[13px]">
                  {t('skills.noResults')}
                </div>
              ) : (
                <div className="flex flex-col gap-px">
                  {chSkills.map(skill => (
                    <HubSkillRow
                      key={skill.slug}
                      skill={skill}
                      onClick={() => openDetail(skill.slug, 'clawhub')}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      </div>

      {/* ═══ Hub Detail Panel (shared) ═══ */}
      <SkillDetailPanel
        open={detailOpen}
        skill={detailSkill}
        loading={detailLoading}
        onClose={closeDetail}
        onInstall={handleInstall}
        installState={installState}
        installLabel={t('skills.hubInstall')}
        installingLabel={t('skills.hubInstalling')}
        doneLabel={t('skills.hubInstallDone')}
        doneHint={t('skills.hubInstallDoneHint')}
        errorLabel={t('skills.hubInstallError')}
        errorText={installErrorText}
        secondaryActionLabel={detailSource === 'clawhub' && installNeedsLogin ? t('skills.clawhubLogin') : undefined}
        onSecondaryAction={detailSource === 'clawhub' && installNeedsLogin ? handleClawHubLogin : undefined}
        installCmd={detailSource === 'skillshub' ? `skillhub install ${detailSkill?.slug ?? ''}` : `openclaw skills install ${detailSkill?.slug ?? ''}`}
        externalUrl={
          detailSource === 'skillshub'
            ? resolveSkillHubPublicSkillPageUrl(detailSkill?.slug ?? '', detailSkill?.homepage)
            : `https://clawhub.ai/skills/${detailSkill?.slug ?? ''}`
        }
        externalLabel={detailSource === 'skillshub' ? t('skills.skillshubOpenSite') : t('skillsExtra.viewOnClawHub')}
      />

      {/* ═══ Delete Confirm Modal ═══ */}
      {/*
        Wrapper loses pointer-events immediately when deleteConfirm is cleared (on delete success
        or cancel). This prevents the still-animating backdrop from intercepting tab button clicks
        during the ~0.3s exit animation, which was causing hub tabs to appear blank.
      */}
      <div style={{ pointerEvents: deleteConfirm ? undefined : 'none' }}>
        <AnimatePresence>
          {deleteConfirm && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-[600] bg-black/50 backdrop-blur-sm"
                onClick={() => !deleting && setDeleteConfirm(null)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 8 }}
                transition={{ duration: 0.15 }}
                className="fixed z-[601] top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2
                  w-[360px] max-w-[calc(100vw-32px)]
                  bg-aegis-bg border border-[rgb(var(--aegis-overlay)/0.08)]
                  rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.4)] p-6"
              >
              <div className="text-[15px] font-bold mb-2">
                {t('skills.deleteConfirmTitle', { name: deleteConfirm.name })}
              </div>
              <p className="text-[12.5px] text-aegis-text-secondary leading-relaxed mb-5">
                {t('skills.deleteConfirmBody')}
              </p>
              <div className="flex gap-2.5 justify-end">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg text-[12.5px] font-medium border
                    border-[rgb(var(--aegis-overlay)/0.08)] text-aegis-text-secondary
                    hover:border-[rgb(var(--aegis-overlay)/0.15)] transition-colors disabled:opacity-40"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="px-4 py-2 rounded-lg text-[12.5px] font-semibold
                    bg-aegis-danger/[0.08] border border-aegis-danger/25 text-aegis-danger
                    hover:bg-aegis-danger/[0.14] transition-colors disabled:opacity-40
                    flex items-center gap-1.5"
                >
                  {deleting && <Loader2 size={12} className="animate-spin" />}
                  {t('skills.deleteConfirmOk')}
                </button>
              </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SkillsHub helpers
// ═══════════════════════════════════════════════════════════

const SKILLSHUB_INSTALL_BASE_URL = 'https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/install';
const SKILLSHUB_INSTALL_SH_URL = `${SKILLSHUB_INSTALL_BASE_URL}/install.sh`;
const SKILLSHUB_INSTALL_LATEST_TAR_URL = `${SKILLSHUB_INSTALL_BASE_URL}/latest.tar.gz`;
const SKILLSHUB_CLI_INSTALL_CMD_UNIX = `curl -fsSL ${SKILLSHUB_INSTALL_SH_URL} | bash -s -- --cli-only`;
const SKILLSHUB_CLI_INSTALL_CMD_WIN =
  `$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';` +
  `if(-not (Get-Command py -ErrorAction SilentlyContinue) -and -not (Get-Command python -ErrorAction SilentlyContinue)){throw 'Python not found. Please install Python 3 first.'};` +
  `$u='${SKILLSHUB_INSTALL_LATEST_TAR_URL}';$base=Join-Path $env:USERPROFILE '.skillhub';$bin=Join-Path $env:APPDATA 'npm';$tmp=Join-Path $env:TEMP ('skillhub-'+[guid]::NewGuid().ToString('N'));` +
  `New-Item -ItemType Directory -Force -Path $tmp|Out-Null;Invoke-WebRequest -Uri $u -OutFile (Join-Path $tmp 'latest.tar.gz');` +
  `if(-not (Get-Command tar -ErrorAction SilentlyContinue)){throw 'tar command not found.'};tar -xzf (Join-Path $tmp 'latest.tar.gz') -C $tmp;` +
  `$cliDir=if(Test-Path (Join-Path $tmp 'cli/skills_store_cli.py')){Join-Path $tmp 'cli'}else{$tmp};New-Item -ItemType Directory -Force -Path $base,$bin|Out-Null;` +
  `Copy-Item (Join-Path $cliDir 'skills_store_cli.py') (Join-Path $base 'skills_store_cli.py') -Force;Copy-Item (Join-Path $cliDir 'skills_upgrade.py') (Join-Path $base 'skills_upgrade.py') -Force;` +
  `Copy-Item (Join-Path $cliDir 'version.json') (Join-Path $base 'version.json') -Force;Copy-Item (Join-Path $cliDir 'metadata.json') (Join-Path $base 'metadata.json') -Force;` +
  `if(Test-Path (Join-Path $cliDir 'skills_index.local.json')){Copy-Item (Join-Path $cliDir 'skills_index.local.json') (Join-Path $base 'skills_index.local.json') -Force;};` +
  `$cfg=Join-Path $base 'config.json';if(-not (Test-Path $cfg)){'{\"self_update_url\":\"https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/version.json\"}'|Set-Content -Encoding UTF8 -Path $cfg;};` +
  `$wrapper='@echo off\`r\`nsetlocal\`r\`nif exist "%SystemRoot%\\py.exe" (\`r\`n  py -3 "%USERPROFILE%\\.skillhub\\skills_store_cli.py" %*\`r\`n) else (\`r\`n  python "%USERPROFILE%\\.skillhub\\skills_store_cli.py" %*\`r\`n)\`r\`n';` +
  `Set-Content -Encoding ASCII -Path (Join-Path $bin 'skillhub.cmd') -Value $wrapper;`;
const SKILLSHUB_CLI_INSTALL_CMD = window.aegis?.platform === 'win32'
  ? SKILLSHUB_CLI_INSTALL_CMD_WIN
  : SKILLSHUB_CLI_INSTALL_CMD_UNIX;

/**
 * Lightweight inline strip below the search bar.
 * - null  → still checking (invisible)
 * - true  → green "CLI ready" chip (can dismiss)
 * - false → amber "enable acceleration" bar with one-click auto-install
 */
function SkillsHubCliBanner({ installed, onCheckDone }: {
  installed: boolean | null;
  onCheckDone: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<'idle' | 'installing' | 'ok' | 'err'>('idle');
  const [showManual, setShowManual] = useState(false);
  const [copied, setCopied] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const handleAutoInstall = async () => {
    setPhase('installing');
    setShowManual(false);
    try {
      const res = await window.aegis.skillshub?.installCli();
      if (res?.success) {
        setPhase('ok');
        onCheckDone(true);
        // Auto-hide success chip after 5 s
        setTimeout(() => setDismissed(true), 5000);
      } else {
        setPhase('err');
        setShowManual(true);
      }
    } catch (e: any) {
      setPhase('err');
      setShowManual(true);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(SKILLSHUB_CLI_INSTALL_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Nothing to show while checking or after user dismissed
  if (installed === null || dismissed) return null;

  // Already installed — tiny green chip, auto-dismissed after a bit
  if (installed === true || phase === 'ok') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="overflow-hidden mb-4"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg
            bg-aegis-success/[0.06] border border-aegis-success/15 text-aegis-success text-[11.5px]">
            <CheckCircle2 size={12} className="shrink-0" />
            <span className="flex-1">{t('skills.skillshubCliInstalled')}</span>
            <button onClick={() => setDismissed(true)} className="opacity-50 hover:opacity-100 text-[10px]">✕</button>
          </div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // Not installed — compact bar with one-click install
  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className={clsx(
        'flex items-center gap-3 px-3 py-2 rounded-xl border text-[12px] transition-colors',
        phase === 'err'
          ? 'bg-aegis-danger/[0.05] border-aegis-danger/20'
          : 'bg-[rgb(var(--aegis-overlay)/0.025)] border-[rgb(var(--aegis-overlay)/0.07)]',
      )}>
        <Zap size={13} className={clsx('shrink-0', phase === 'err' ? 'text-aegis-danger' : 'text-red-400')} />

        <div className="flex-1 min-w-0">
          <span className="font-medium">{t('skills.skillshubCliNeeded')}</span>
          {' '}
          <span className="text-aegis-text-dim text-[11px]">{t('skills.skillshubCliRequired')}</span>
        </div>

        {phase === 'installing' ? (
          <span className="flex items-center gap-1.5 text-aegis-text-dim text-[11px] shrink-0">
            <Loader2 size={11} className="animate-spin" />
            {t('skills.skillshubCliInstalling')}
          </span>
        ) : (
          <button
            onClick={handleAutoInstall}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-semibold
              bg-red-500/[0.08] border border-red-500/20 text-red-400
              hover:bg-red-500/[0.14] transition-colors whitespace-nowrap"
          >
            <Zap size={11} /> {t('skills.skillshubCliInstall')}
          </button>
        )}
      </div>

      {/* Error + manual fallback */}
      {phase === 'err' && showManual && (
        <div className="px-3 py-2 rounded-lg border border-aegis-danger/15 bg-aegis-danger/[0.04]
          text-[11px] text-aegis-text-secondary">
          <div className="mb-1.5 text-aegis-danger font-medium">
            {t(window.aegis?.platform === 'win32' ? 'skills.skillshubCliInstallFailWin' : 'skills.skillshubCliInstallFail')}
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] bg-[rgb(var(--aegis-overlay)/0.04)]
            px-2 py-1.5 rounded border border-[rgb(var(--aegis-overlay)/0.06)]">
            <code className="flex-1 truncate">{SKILLSHUB_CLI_INSTALL_CMD}</code>
            <button onClick={handleCopy} className="shrink-0 text-aegis-text-dim hover:text-aegis-primary transition-colors">
              {copied ? <CheckCircle2 size={11} /> : <span>Copy</span>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SkillsHubOffline({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="text-center py-16 px-8 max-w-[480px] mx-auto">
      <div className="text-[32px] mb-3">🌐</div>
      <p className="text-[13px] text-aegis-text-dim mb-5 leading-relaxed">
        {t('skills.skillshubApiError')}
      </p>
      <div className="flex gap-3 justify-center flex-wrap">
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-medium border
            border-[rgb(var(--aegis-overlay)/0.08)] text-aegis-text-secondary
            hover:border-[rgb(var(--aegis-overlay)/0.15)] transition-colors"
        >
          <RefreshCw size={12} /> {t('skills.skillshubRetry')}
        </button>
        <button
          onClick={() => window.open(SKILLSHUB_PUBLIC_ORIGIN, '_blank')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold border
            border-red-500/20 text-red-400 hover:bg-red-500/[0.06] transition-colors"
        >
          <ExternalLink size={12} /> {t('skills.skillshubOpenSite')}
        </button>
      </div>
    </div>
  );
}

function ClawHubAuthBanner({
  authStatus,
  checking,
  onLogin,
  onRefresh,
}: {
  authStatus: ClawHubAuthStatus | null;
  checking: boolean;
  onLogin: () => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const tone = checking
    ? 'border-[rgb(var(--aegis-overlay)/0.08)] bg-[rgb(var(--aegis-overlay)/0.02)]'
    : authStatus?.loggedIn
      ? 'border-aegis-success/20 bg-aegis-success/[0.05]'
      : 'border-amber-500/20 bg-amber-500/[0.06]';
  const text = checking
    ? t('skills.clawhubAuthChecking')
    : !authStatus?.available
      ? t('skills.clawhubAuthUnavailable')
      : authStatus.loggedIn
        ? t('skills.clawhubAuthLoggedIn', { identity: authStatus.displayName ?? 'ClawHub' })
        : t('skills.clawhubAuthLoggedOut');

  return (
    <div className={clsx('max-w-[480px] mx-auto mb-4 rounded-xl border px-4 py-3', tone)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {checking ? (
            <Loader2 size={15} className="mt-0.5 animate-spin text-aegis-text-dim shrink-0" />
          ) : authStatus?.loggedIn ? (
            <CheckCircle2 size={15} className="mt-0.5 text-aegis-success shrink-0" />
          ) : (
            <AlertCircle size={15} className="mt-0.5 text-amber-400 shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-[12.5px] font-medium text-aegis-text">{text}</div>
            {!checking && authStatus?.error && (
              <div className="mt-1 text-[11px] leading-relaxed text-aegis-text-dim">{authStatus.error}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onRefresh}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border
              border-[rgb(var(--aegis-overlay)/0.08)] text-aegis-text-secondary
              hover:border-[rgb(var(--aegis-overlay)/0.15)] transition-colors"
          >
            <RefreshCw size={11} /> {t('skills.clawhubRefreshStatus')}
          </button>
          {!authStatus?.loggedIn && (
            <button
              onClick={onLogin}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border
                border-aegis-primary/20 text-aegis-primary hover:bg-aegis-primary/[0.06] transition-colors"
            >
              <ExternalLink size={11} /> {t('skills.clawhubLogin')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ClawHubRateLimitNotice({
  retryAfterMs,
  authStatus,
}: {
  retryAfterMs: number;
  authStatus: ClawHubAuthStatus | null;
}) {
  const { t } = useTranslation();
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return (
    <div className="max-w-[480px] mx-auto mb-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
      <div className="flex items-start gap-2.5">
        <AlertCircle size={15} className="mt-0.5 text-amber-400 shrink-0" />
        <div className="min-w-0">
          <div className="text-[12.5px] font-medium text-aegis-text">
            {t('skills.clawhubRateLimited', { seconds })}
          </div>
          {authStatus && !authStatus.loggedIn && (
            <div className="mt-1 text-[11px] leading-relaxed text-aegis-text-secondary">
              {authStatus.available ? t('skills.clawhubNeedLoginFirst') : t('skills.clawhubAuthUnavailable')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ClawHubOffline({
  onRetry,
  retryAfterMs,
  onLogin,
  onRefreshAuth,
  authStatus,
}: {
  onRetry: () => void;
  retryAfterMs?: number;
  onLogin: () => void;
  onRefreshAuth: () => void;
  authStatus: ClawHubAuthStatus | null;
}) {
  const { t } = useTranslation();
  const seconds = retryAfterMs ? Math.ceil(retryAfterMs / 1000) : 0;
  const disabled = seconds > 0;
  return (
    <div className="text-center py-16 px-8 max-w-[480px] mx-auto">
      <div className="text-[32px] mb-3">🦞</div>
      <p className="text-[13px] text-aegis-text-dim mb-5 leading-relaxed">
        {disabled ? t('skills.clawhubRateLimited', { seconds }) : t('skills.clawhubApiError')}
      </p>
      {authStatus && !authStatus.loggedIn && (
        <p className="text-[12px] text-aegis-text-secondary mb-5 leading-relaxed">
          {authStatus.available ? t('skills.clawhubNeedLoginFirst') : t('skills.clawhubAuthUnavailable')}
        </p>
      )}
      <div className="flex gap-3 justify-center flex-wrap">
        <button
          onClick={onRetry}
          disabled={disabled}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-medium border
            border-[rgb(var(--aegis-overlay)/0.08)] text-aegis-text-secondary
            hover:border-[rgb(var(--aegis-overlay)/0.15)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={12} /> {disabled ? t('skills.clawhubRetryIn', { seconds }) : t('skills.skillshubRetry')}
        </button>
        <button
          onClick={onLogin}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-semibold border
            border-aegis-primary/20 text-aegis-primary hover:bg-aegis-primary/[0.06] transition-colors"
        >
          <ExternalLink size={12} /> {t('skills.clawhubLogin')}
        </button>
        <button
          onClick={onRefreshAuth}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[12px] font-medium border
            border-[rgb(var(--aegis-overlay)/0.08)] text-aegis-text-secondary
            hover:border-[rgb(var(--aegis-overlay)/0.15)] transition-colors"
        >
          <RefreshCw size={12} /> {t('skills.clawhubRefreshStatus')}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// SkillGroups — grouped list (Built-In / Installed / Extra)
// ═══════════════════════════════════════════════════════════

function SkillGroups({ skills, onToggle, onDelete }: {
  skills: MySkill[];
  onToggle: (slug: string) => void;
  onDelete: (slug: string) => void;
}) {
  const { t } = useTranslation();

  const groups: Array<{ id: string; label: string; emoji: string; skills: MySkill[] }> = [
    {
      id: 'installed',
      label: t('skills.groupInstalled'),
      emoji: '📦',
      skills: skills.filter(s => getSkillGroup(s.source) === 'installed'),
    },
    {
      id: 'extra',
      label: t('skills.groupExtra'),
      emoji: '🔌',
      skills: skills.filter(s => getSkillGroup(s.source) === 'extra'),
    },
    {
      id: 'builtin',
      label: t('skills.groupBuiltin'),
      emoji: '⚙️',
      skills: skills.filter(s => getSkillGroup(s.source) === 'builtin'),
    },
  ].filter(g => g.skills.length > 0);

  // Assign global color index so color bars stay consistent across groups
  let colorIdx = 0;

  return (
    <div className="flex flex-col gap-6">
      {groups.map(group => (
        <div key={group.id}>
          {/* Group header */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[13px]">{group.emoji}</span>
            <span className="text-[11px] font-semibold text-aegis-text-muted uppercase tracking-wider">
              {group.label}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold
              bg-[rgb(var(--aegis-overlay)/0.04)] text-aegis-text-dim">
              {group.skills.length}
            </span>
          </div>

          {/* Rows */}
          <div className="flex flex-col gap-0">
            {group.skills.map(skill => {
              const idx = colorIdx++;
              return (
                <MySkillRow
                  key={skill.slug}
                  skill={skill}
                  index={idx}
                  onToggle={() => onToggle(skill.slug)}
                  onDelete={() => onDelete(skill.slug)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

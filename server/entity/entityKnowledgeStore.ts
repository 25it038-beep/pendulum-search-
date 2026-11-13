import fs from 'node:fs';
import path from 'node:path';
import { EntityType } from '../types';

export interface PersistedInternalPage {
  url: string;
  canonicalUrl: string;
  title: string;
  snippet: string;
  subpageType: string;
  crawledAt: string;
}

export interface PersistedEntityRecord {
  entityKey: string;
  name: string;
  entityType: EntityType;
  aliases: string[];
  country?: string;
  region?: string;
  location?: string;
  officialUrl: string;
  officialDomain: string;
  confidence: number;
  verifiedBy: string[];
  signals: string[];
  internalPages: PersistedInternalPage[];
  discoveredAt: string;
  lastVerifiedAt: string;
  isValid: boolean;
}

const DATA_FILE = path.resolve(process.cwd(), 'server', 'data', 'discovered_entities.json');
const REVERIFY_TTL_MS = 24 * 60 * 60 * 1000;

const entityStore = new Map<string, PersistedEntityRecord>();
let loadedFromDisk = false;

export function normalizeEntityKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadStoreOnce() {
  if (loadedFromDisk) return;
  loadedFromDisk = true;
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const rec of parsed) {
          if (rec?.entityKey && rec?.officialDomain) {
            entityStore.set(rec.entityKey, rec);
          }
        }
      }
    }
  } catch {}
}

function flushStoreToDisk() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const items = Array.from(entityStore.values());
    fs.writeFileSync(DATA_FILE, JSON.stringify(items, null, 2), 'utf8');
  } catch {}
}

export function isEntityRecordStale(rec: PersistedEntityRecord, ttlMs = REVERIFY_TTL_MS): boolean {
  const ts = Date.parse(rec.lastVerifiedAt || '');
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts > ttlMs;
}

export function lookupPersistedEntities(queryName: string): {
  exact: PersistedEntityRecord | null;
  candidates: PersistedEntityRecord[];
} {
  loadStoreOnce();
  const key = normalizeEntityKey(queryName);
  if (!key) return { exact: null, candidates: [] };

  const exact = entityStore.get(key) || null;
  const queryTokens = key.split(' ').filter((t) => t.length >= 2);
  const candidates: PersistedEntityRecord[] = [];

  for (const rec of entityStore.values()) {
    if (!rec.isValid) continue;
    const recNames = [rec.entityKey, ...rec.aliases.map(normalizeEntityKey)];
    if (recNames.includes(key)) {
      if (!candidates.some((c) => c.entityKey === rec.entityKey)) {
        candidates.unshift(rec);
      }
      continue;
    }

    if (queryTokens.length >= 1) {
      const targetWords = new Set(rec.entityKey.split(' '));
      const allMatched = queryTokens.every((t) => targetWords.has(t));
      if (allMatched && !candidates.some((c) => c.entityKey === rec.entityKey)) {
        candidates.push(rec);
      }
    }
  }

  return { exact: exact?.isValid ? exact : null, candidates };
}

export function upsertDiscoveredEntity(record: PersistedEntityRecord): void {
  loadStoreOnce();
  const normalizedKey = normalizeEntityKey(record.entityKey || record.name);
  if (!normalizedKey || !record.officialDomain) return;

  const existing = entityStore.get(normalizedKey);
  const mergedAliases = Array.from(
    new Set([...(existing?.aliases || []), ...(record.aliases || []), record.name])
  );
  const mergedPagesMap = new Map<string, PersistedInternalPage>();
  for (const p of existing?.internalPages || []) mergedPagesMap.set(p.canonicalUrl || p.url, p);
  for (const p of record.internalPages || []) mergedPagesMap.set(p.canonicalUrl || p.url, p);

  entityStore.set(normalizedKey, {
    ...record,
    entityKey: normalizedKey,
    aliases: mergedAliases,
    internalPages: Array.from(mergedPagesMap.values()).slice(0, 12)
  });

  flushStoreToDisk();
}

export function markEntityVerificationStatus(entityKey: string, isValid: boolean): void {
  loadStoreOnce();
  const normalizedKey = normalizeEntityKey(entityKey);
  const rec = entityStore.get(normalizedKey);
  if (!rec) return;
  rec.isValid = isValid;
  rec.lastVerifiedAt = new Date().toISOString();
  flushStoreToDisk();
}

export function getEntityKnowledgeSnapshot(): {
  count: number;
  entities: Array<Pick<PersistedEntityRecord, 'entityKey' | 'name' | 'entityType' | 'officialDomain' | 'officialUrl' | 'confidence' | 'lastVerifiedAt' | 'isValid'>>;
} {
  loadStoreOnce();
  return {
    count: entityStore.size,
    entities: Array.from(entityStore.values()).map((r) => ({
      entityKey: r.entityKey,
      name: r.name,
      entityType: r.entityType,
      officialDomain: r.officialDomain,
      officialUrl: r.officialUrl,
      confidence: r.confidence,
      lastVerifiedAt: r.lastVerifiedAt,
      isValid: r.isValid
    }))
  };
}

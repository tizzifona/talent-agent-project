import { Lifecycle } from '$static/lib/ts/Lifecycle.ts';
import { Token } from '$static/lib/js/Token.js';

export const COLLECTIONS = {
  persons: 'bh-talent-persons',
  internal: 'bh-talent-internal',
  runs: 'bh-talent-runs',
  reviewActions: 'bh-talent-review-actions',
  tables: 'bh-talent-tables',
  consents: 'bh-talent-consents',
} as const;

export const TYPES = {
  person: 'person',
  internal: 'internal',
  run: 'run',
  reviewAction: 'review-action',
  table: 'table',
  consent: 'consent',
} as const;

export const LATEST_RUN_ID = 'latest';

const WRITE_CHUNK = 80;

type JsonMap = Record<string, unknown>;

async function daemonPost(path: string, body: JsonMap, capability: string): Promise<unknown> {
  const {
    system: { protocol, party, source },
  } = Lifecycle.getConfig();
  const token = await Lifecycle.getTokenFor({ [source]: capability }, party);
  const res = await fetch(`${protocol}//${party}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Tabserver-Token': token.asSignedBase64(),
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json && typeof json === 'object' && 'error' in json) {
    const err = (json as { error: unknown }).error;
    throw new Error(typeof err === 'string' ? err : JSON.stringify(err));
  }
  return (json as { ok?: unknown }).ok;
}

export async function structuredWrite(
  collection: string,
  type: string,
  records: Array<{ id?: string; object: JsonMap; metadata?: JsonMap }>,
): Promise<{ ids: string[] }> {
  if (records.length === 0) return { ids: [] };
  const ids: string[] = [];
  for (let i = 0; i < records.length; i += WRITE_CHUNK) {
    const chunk = records.slice(i, i + WRITE_CHUNK);
    const ok = await daemonPost(
      '/ai/structured/write',
      { collection, type, records: chunk },
      Token.Capability.WRITE_MEMORY,
    ) as { records?: Array<{ id: string }> };
    for (const rec of ok?.records || []) ids.push(rec.id);
  }
  return { ids };
}

export async function structuredGet(
  collection: string,
  id: string,
): Promise<JsonMap | null> {
  const ok = await daemonPost(
    '/ai/structured/get',
    { collection, id },
    Token.Capability.READ_MEMORY,
  ) as { record?: JsonMap | null };
  return ok?.record ?? null;
}

export async function structuredQuery(
  collection: string,
  query: JsonMap,
): Promise<{ count: number; records: JsonMap[] }> {
  const ok = await daemonPost(
    '/ai/structured/query',
    { collection, query },
    Token.Capability.READ_MEMORY,
  ) as { count?: number; records?: JsonMap[] };
  return {
    count: ok?.count ?? 0,
    records: ok?.records ?? [],
  };
}

export function memoryAvailable(): boolean {
  try {
    Lifecycle.getConfig();
    return true;
  } catch {
    return false;
  }
}

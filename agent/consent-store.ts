import { COLLECTIONS, TYPES, structuredQuery, structuredWrite } from './memory.ts';
import { CONSENT_FIELD_NAMES } from './field-map.ts';

type JsonMap = Record<string, unknown>;

/**
 * Section G of the consolidation spec: consents live in their own collection, keyed by
 * consent_id and related to the person through candidate_id. Each authorisation stays a
 * separate field, because they do not have the same scope.
 */
export interface ConsentInput {
  candidateId: string;
  personId: string;
  runId: string;
  values: Record<string, string>;
}

function unwrapObject(record: JsonMap): JsonMap {
  const object = (record.object && typeof record.object === 'object')
    ? record.object as JsonMap
    : record;
  return { id: record.id, ...object };
}

export function hasAnyConsent(values: Record<string, string> = {}): boolean {
  return CONSENT_FIELD_NAMES.some((name) => !!values[name]);
}

export async function saveConsents(inputs: ConsentInput[]): Promise<number> {
  const records = inputs
    .filter((input) => hasAnyConsent(input.values))
    .map((input) => {
      const object: JsonMap = {
        candidate_id: input.candidateId,
        person_id: input.personId,
        run_id: input.runId,
        recorded_at: new Date().toISOString(),
      };
      for (const name of CONSENT_FIELD_NAMES) {
        object[name] = input.values[name] || 'unknown';
      }
      return { id: `cns-${input.candidateId}`, object };
    });

  if (records.length === 0) return 0;
  await structuredWrite(COLLECTIONS.consents, TYPES.consent, records);
  return records.length;
}

export async function listConsents(runId?: string): Promise<JsonMap[]> {
  try {
    const result = await structuredQuery(COLLECTIONS.consents, {
      type: TYPES.consent,
      filter: runId ? { run_id: runId } : {},
      select: ['*'],
      order: 'created-desc',
    });
    return result.records.map(unwrapObject);
  } catch {
    return [];
  }
}

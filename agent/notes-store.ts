import { COLLECTIONS, TYPES, structuredQuery, structuredWrite } from './memory.ts';
import type { JsonMap } from './person-store.ts';

function unwrap(record: JsonMap): JsonMap {
  const object = (record.object && typeof record.object === 'object')
    ? record.object as JsonMap
    : record;
  return { id: record.id, ...object };
}

export async function listPersonComments(personId: string): Promise<JsonMap[]> {
  const id = String(personId || '');
  if (!id) return [];
  try {
    const result = await structuredQuery(COLLECTIONS.personComments, {
      type: TYPES.personComment,
      filter: { person_id: id },
      select: ['*'],
      order: 'created-desc',
      limit: 100,
    });
    return result.records.map(unwrap).filter((row) => String(row.person_id || '') === id);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found/i.test(message)) return [];
    try {
      const result = await structuredQuery(COLLECTIONS.personComments, {
        type: TYPES.personComment,
        select: ['*'],
        order: 'created-desc',
        limit: 200,
      });
      return result.records.map(unwrap).filter((row) => String(row.person_id || '') === id);
    } catch (again) {
      const text = again instanceof Error ? again.message : String(again);
      if (/not found/i.test(text)) return [];
      throw again;
    }
  }
}

export async function addPersonComment(input: {
  personId: string;
  text: string;
  author?: string;
}): Promise<JsonMap> {
  const personId = String(input.personId || '');
  const text = String(input.text || '').trim();
  if (!personId) throw new Error('Person id required');
  if (!text) throw new Error('Comment text required');
  const now = new Date().toISOString();
  const id = `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const object = {
    person_id: personId,
    text,
    author: String(input.author || 'team'),
    created_at: now,
  };
  await structuredWrite(COLLECTIONS.personComments, TYPES.personComment, [{ id, object }]);
  return { id, ...object };
}

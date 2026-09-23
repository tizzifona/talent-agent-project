import { COLLECTIONS, TYPES, structuredGet, structuredQuery, structuredWrite } from './memory.ts';
import { queryPersons, type JsonMap } from './person-store.ts';

function unwrap(record: JsonMap): JsonMap {
  const object = (record.object && typeof record.object === 'object')
    ? record.object as JsonMap
    : record;
  return { id: record.id, ...object };
}

async function queryLists(): Promise<JsonMap[]> {
  try {
    const result = await structuredQuery(COLLECTIONS.peopleLists, {
      type: TYPES.peopleList,
      filter: {},
      select: ['*'],
      order: 'created-desc',
      limit: 100,
    });
    return result.records.map(unwrap);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found/i.test(message)) return [];
    throw error;
  }
}

export async function savePeopleList(input: {
  name: string;
  runId: string;
  tableId?: string;
  search?: string;
  country?: string;
  skills?: string;
  ids?: string[];
}): Promise<JsonMap> {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('List name is required');
  if (!input.runId) throw new Error('Open a table first');

  const found = await queryPersons({
    runId: input.runId,
    search: input.search || '',
    country: input.country || '',
    skills: input.skills || '',
    ids: input.ids,
    heldOut: false,
    needsReview: false,
    limit: 5000,
    offset: 0,
  });

  const id = `list-${Date.now()}`;
  const object = {
    name,
    run_id: input.runId,
    table_id: input.tableId || '',
    search: input.search || '',
    country: input.country || '',
    skills: input.skills || '',
    person_ids: found.records.map((person) => String(person.id)),
    count: found.records.length,
    preview: found.records.slice(0, 12).map((person) => (
      String(person.full_name || person.primary_email || person.id || '')
    )),
    created_at: new Date().toISOString(),
  };
  await structuredWrite(COLLECTIONS.peopleLists, TYPES.peopleList, [{ id, object }]);
  return { id, ...object };
}

export async function listPeopleLists(tableId?: string): Promise<JsonMap[]> {
  const rows = await queryLists();
  return rows
    .filter((row) => !tableId || String(row.table_id || '') === tableId)
    .map((row) => ({
      id: row.id,
      name: row.name,
      count: row.count || 0,
      table_id: row.table_id || '',
      run_id: row.run_id || '',
      search: row.search || '',
      country: row.country || '',
      skills: row.skills || '',
      preview: row.preview || [],
      created_at: row.created_at || '',
    }));
}

export async function getPeopleList(id: string): Promise<JsonMap | null> {
  try {
    const record = await structuredGet(COLLECTIONS.peopleLists, id);
    if (!record) return null;
    return unwrap(record);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/not found/i.test(message)) return null;
    throw error;
  }
}

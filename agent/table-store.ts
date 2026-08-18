import { COLLECTIONS, TYPES, structuredGet, structuredQuery, structuredWrite } from './memory.ts';

type JsonMap = Record<string, unknown>;

function unwrapObject(record: JsonMap): JsonMap {
  const object = (record.object && typeof record.object === 'object')
    ? record.object as JsonMap
    : record;
  return { id: record.id, ...object };
}

export interface TableRecord {
  id: string;
  name: string;
  run_id: string;
  created_at: string;
  person_count: number;
  needs_review_count: number;
  source_files: string[];
  deleted?: boolean;
}

export async function saveNamedTable(input: {
  name: string;
  runId: string;
  personCount: number;
  needsReviewCount: number;
  sourceFiles: string[];
  tableId?: string;
}): Promise<TableRecord> {
  const id = input.tableId || `tbl-${Date.now()}`;
  const createdAt = new Date().toISOString();
  const object = {
    name: input.name.trim() || `Talent table ${createdAt.slice(0, 10)}`,
    run_id: input.runId,
    created_at: createdAt,
    person_count: input.personCount,
    needs_review_count: input.needsReviewCount,
    source_files: input.sourceFiles,
    deleted: false,
  };
  await structuredWrite(COLLECTIONS.tables, TYPES.table, [{ id, object }]);
  return { id, ...object };
}

export async function listTables(): Promise<JsonMap[]> {
  try {
    const result = await structuredQuery(COLLECTIONS.tables, {
      type: TYPES.table,
      select: ['*'],
      order: 'created-desc',
    });
    return result.records
      .map(unwrapObject)
      .filter((row) => row.deleted !== true);
  } catch {
    return [];
  }
}

export async function getTable(id: string): Promise<JsonMap | null> {
  const record = await structuredGet(COLLECTIONS.tables, id);
  if (!record) return null;
  const row = unwrapObject(record);
  if (row.deleted === true) return null;
  return row;
}

export async function renameTable(id: string, name: string): Promise<JsonMap> {
  const existing = await getTable(id);
  if (!existing) throw new Error('Table not found');
  const nextName = name.trim();
  if (!nextName) throw new Error('Table name is required');
  const { id: _id, ...object } = existing;
  object.name = nextName;
  await structuredWrite(COLLECTIONS.tables, TYPES.table, [{ id, object }]);
  return { id, ...object };
}

export async function deleteTable(id: string): Promise<void> {
  const existing = await getTable(id);
  if (!existing) throw new Error('Table not found');
  const { id: _id, ...object } = existing;
  object.deleted = true;
  await structuredWrite(COLLECTIONS.tables, TYPES.table, [{ id, object }]);
}

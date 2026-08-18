import { COLLECTIONS, TYPES, structuredQuery, structuredWrite } from './memory.ts';
import { getPerson, queryPersons, type JsonMap } from './person-store.ts';

export type ReviewAction = 'confirm' | 'reject' | 'merge';

function splitTags(value: unknown): string[] {
  if (!value) return [];
  return String(value).split('|').map((part) => part.trim()).filter(Boolean);
}

function joinTags(values: string[]): string {
  return [...new Set(values.filter(Boolean))].join(' | ');
}

function asObject(person: JsonMap): JsonMap {
  const { id: _id, ...object } = person;
  return object;
}

async function savePerson(id: string, object: JsonMap): Promise<void> {
  await structuredWrite(COLLECTIONS.persons, TYPES.person, [{ id, object }]);
}

function rebuildSearchText(person: JsonMap): string {
  return [
    person.full_name,
    person.first_name,
    person.last_name,
    person.email,
    person.phone,
    person.country,
    person.skill_tags,
    person.person_id,
    person.id,
  ].filter(Boolean).join(' ').toLowerCase();
}

async function logAction(entry: {
  personId: string;
  action: ReviewAction;
  actor: string;
  targetId?: string;
  note?: string;
  runId?: string;
}): Promise<void> {
  const at = new Date().toISOString();
  await structuredWrite(COLLECTIONS.reviewActions, TYPES.reviewAction, [{
    id: `rev-${Date.now()}-${entry.personId}`.slice(0, 180),
    object: {
      person_id: entry.personId,
      action: entry.action,
      actor: entry.actor,
      target_id: entry.targetId || '',
      note: entry.note || '',
      run_id: entry.runId || '',
      decided_at: at,
    },
  }]);
}

function applyDecision(
  person: JsonMap,
  status: 'confirmed' | 'rejected' | 'merged',
  actor: string,
  extra: JsonMap = {},
): JsonMap {
  const next = {
    ...asObject(person),
    ...extra,
    needs_review: false,
    held_out: status !== 'confirmed',
    review_status: status,
    review_decided_by: actor,
    review_decided_at: new Date().toISOString(),
  };
  next.search_text = rebuildSearchText(next);
  return next;
}

function mergeFieldProvenance(target: JsonMap, incoming: JsonMap): JsonMap {
  const left = (target.field_provenance && typeof target.field_provenance === 'object')
    ? target.field_provenance as JsonMap
    : {};
  const right = (incoming.field_provenance && typeof incoming.field_provenance === 'object')
    ? incoming.field_provenance as JsonMap
    : {};
  const out: JsonMap = { ...left };
  for (const [field, raw] of Object.entries(right)) {
    const incomingMeta = raw && typeof raw === 'object' ? raw as JsonMap : { value: raw };
    const existing = out[field] && typeof out[field] === 'object' ? out[field] as JsonMap : null;
    if (!existing || !existing.value) {
      out[field] = incomingMeta;
      continue;
    }
    if (incomingMeta.value && incomingMeta.value !== existing.value) {
      const overwritten = Array.isArray(existing.overwritten_values)
        ? [...existing.overwritten_values as JsonMap[]]
        : [];
      overwritten.push({
        value: incomingMeta.value,
        source_file: incomingMeta.source_file || 'review-merge',
        timestamp: new Date().toISOString(),
      });
      out[field] = { ...existing, overwritten_values: overwritten };
    }
  }
  return out;
}

function mergePersonObjects(target: JsonMap, incoming: JsonMap): JsonMap {
  const pick = (key: string): string => {
    const current = String(target[key] || '');
    const next = String(incoming[key] || '');
    return current || next;
  };

  const targetSources = Array.isArray(target.sources) ? target.sources as JsonMap[] : [];
  const incomingSources = Array.isArray(incoming.sources) ? incoming.sources as JsonMap[] : [];
  const sourceKeys = new Set(targetSources.map((row) => `${row.source_file}:${row.source_row_id}`));
  const sources = [...targetSources];
  for (const row of incomingSources) {
    const key = `${row.source_file}:${row.source_row_id}`;
    if (!sourceKeys.has(key)) {
      sourceKeys.add(key);
      sources.push(row);
    }
  }

  const merged: JsonMap = {
    ...asObject(target),
    first_name: pick('first_name'),
    last_name: pick('last_name'),
    full_name: pick('full_name'),
    email: pick('email'),
    phone: pick('phone'),
    country: pick('country'),
    employment_status: pick('employment_status'),
    seniority: pick('seniority'),
    readiness_score: pick('readiness_score'),
    skill_tags: joinTags([...splitTags(target.skill_tags), ...splitTags(incoming.skill_tags)]),
    all_emails: joinTags([...splitTags(target.all_emails), ...splitTags(incoming.all_emails), String(incoming.email || '')]),
    all_phones: joinTags([...splitTags(target.all_phones), ...splitTags(incoming.all_phones), String(incoming.phone || '')]),
    provenance_text: joinTags([
      ...splitTags(target.provenance_text),
      ...splitTags(incoming.provenance_text),
    ]),
    field_provenance: mergeFieldProvenance(target, incoming),
    sources,
    record_count: sources.length,
    match_type: target.match_type || incoming.match_type || 'manual-merge',
    match_confidence: target.match_confidence === 'high' || incoming.match_confidence === 'high'
      ? 'high'
      : (target.match_confidence || incoming.match_confidence || 'medium'),
  };
  merged.search_text = rebuildSearchText(merged);
  return merged;
}

export async function confirmPerson(id: string, actor: string, note = ''): Promise<JsonMap> {
  const person = await getPerson(id);
  if (!person) throw new Error('Person not found');
  const object = applyDecision(person, 'confirmed', actor, {
    held_out: false,
    review_note: note,
    review_reason: person.review_reason || '',
  });
  await savePerson(id, object);
  await logAction({
    personId: id,
    action: 'confirm',
    actor,
    note,
    runId: String(person.run_id || ''),
  });
  return { id, ...object };
}

export async function rejectPerson(id: string, actor: string, note = ''): Promise<JsonMap> {
  const person = await getPerson(id);
  if (!person) throw new Error('Person not found');
  const object = applyDecision(person, 'rejected', actor, {
    review_note: note,
    review_reason: person.review_reason || '',
  });
  await savePerson(id, object);
  await logAction({
    personId: id,
    action: 'reject',
    actor,
    note,
    runId: String(person.run_id || ''),
  });
  return { id, ...object };
}

export async function mergePersons(
  sourceId: string,
  targetId: string,
  actor: string,
  note = '',
): Promise<{ source: JsonMap; target: JsonMap }> {
  if (!targetId) throw new Error('Merge target is required');
  if (sourceId === targetId) throw new Error('Cannot merge a person into themselves');

  const source = await getPerson(sourceId);
  const target = await getPerson(targetId);
  if (!source) throw new Error('Person not found');
  if (!target) throw new Error('Merge target not found');
  if (target.held_out) throw new Error('Cannot merge into a held-out person');

  const mergedTarget = applyDecision(target, 'confirmed', actor, {
    ...mergePersonObjects(target, source),
    held_out: false,
    review_note: note,
    merged_from: joinTags([
      ...splitTags(target.merged_from),
      sourceId,
    ]),
  });
  const mergedSource = applyDecision(source, 'merged', actor, {
    merged_into: targetId,
    review_note: note,
    review_reason: source.review_reason || '',
  });

  await savePerson(targetId, mergedTarget);
  await savePerson(sourceId, mergedSource);
  await logAction({
    personId: sourceId,
    action: 'merge',
    actor,
    targetId,
    note,
    runId: String(source.run_id || ''),
  });

  return {
    source: { id: sourceId, ...mergedSource },
    target: { id: targetId, ...mergedTarget },
  };
}

export async function searchMergeTargets(personId: string, search: string): Promise<JsonMap[]> {
  const result = await queryPersons({
    search: search.trim(),
    heldOut: false,
    limit: 8,
    offset: 0,
  });
  return result.records.filter((row) => row.id !== personId);
}

import {
  COLLECTIONS,
  LATEST_RUN_ID,
  TYPES,
  structuredGet,
  structuredQuery,
  structuredWrite,
} from './memory.ts';
import { saveNamedTable } from './table-store.ts';
import { saveConsents } from './consent-store.ts';
import {
  candidateIdFrom,
  CONSENT_FIELD_NAMES,
  UNIFIED_FIELD_NAMES,
} from './field-map.ts';

export type JsonMap = Record<string, unknown>;

interface SourceRecord {
  sourceDb?: string;
  sourceDatabase?: string;
  rowIndex?: number;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  talentId?: string;
  profileId?: string;
  countryOfOrigin?: string;
  countryOfResidence?: string;
  readinessScore?: string;
}

interface MatchedPerson {
  id: string;
  records?: SourceRecord[];
  primaryEmail?: string;
  primaryPhone?: string;
  primaryName?: string;
  primaryFirstName?: string;
  primaryLastName?: string;
  country?: string;
  skills?: string[];
  unified?: Record<string, string>;
  sourceDatabases?: string[];
  matchType?: string;
  matchConfidence?: string;
  confidence?: number;
  provenance?: string[];
  fieldProvenance?: JsonMap;
  needsReview?: boolean;
  reviewReason?: string;
  heldOut?: boolean;
  skillTags?: string;
  seniority?: string;
  enrichment?: Record<string, {
    source?: string;
    confidence_tier?: string;
    inference_basis?: string;
  }>;
}

interface InternalAccount {
  sourceDb?: string;
  rowIndex?: number;
  name?: string;
  email?: string;
  phone?: string;
  internalDomain?: string;
}

export interface MatchingResults {
  totalRecords: number;
  uniquePersons: number;
  emailMatches: number;
  phoneMatches: number;
  sourceIdMatches?: number;
  fuzzyMatches?: number;
  fuzzyAutoMatches?: number;
  manualReview?: number;
  needsReviewCount?: number;
  heldOut: number;
  internalCount?: number;
  persons?: MatchedPerson[];
  heldOutPersons?: MatchedPerson[];
  internalAccounts?: InternalAccount[];
  settings?: JsonMap;
  processedAt?: string;
}

export interface PersonQuery {
  runId?: string;
  search?: string;
  country?: string;
  matchConfidence?: string;
  needsReview?: boolean;
  heldOut?: boolean;
  limit?: number;
  offset?: number;
}

const LIST_SELECT = [
  'id',
  'candidate_id',
  'source_database',
  'full_name',
  'first_name',
  'last_names',
  'primary_email',
  'phone_number',
  'country',
  'country_of_residence',
  'city_of_residence',
  'languages',
  'english_level',
  'technical_skills',
  'key_skills',
  'years_of_experience',
  'years_of_tech_experience',
  'job_title',
  'skill_tags',
  'skill_tags_confidence',
  'match_type',
  'match_confidence',
  'confidence_pct',
  'needs_review',
  'review_reason',
  'held_out',
  'record_count',
  'employment_status',
  'seniority',
  'seniority_confidence',
  'review_status',
  'suggested_merge_id',
  'merged_into',
];

function joinTags(values: string[]): string {
  return values.filter(Boolean).join(' | ');
}

function recordName(record: SourceRecord): string {
  if (record.fullName) return record.fullName;
  return [record.firstName, record.lastName].filter(Boolean).join(' ');
}

function slugId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/@/g, '_at_')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

export function stablePersonId(person: MatchedPerson): string {
  const email = (person.primaryEmail || '').trim().toLowerCase();
  if (email) return `p-em-${slugId(email)}`;
  const phone = (person.primaryPhone || '').replace(/\D/g, '');
  if (phone) return `p-ph-${phone}`;
  const first = person.records?.[0];
  if (first?.talentId) return `p-tal-${slugId(first.talentId)}`;
  if (first?.profileId) {
    return `p-pf-${slugId(`${first.sourceDb || 'src'}-${first.profileId}`)}`;
  }
  return `p-nm-${slugId(`${person.primaryName || 'unknown'}-${first?.sourceDb || 'x'}-${first?.rowIndex ?? 0}`)}`;
}

function searchText(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function personObject(person: MatchedPerson, runId: string, stableId: string): JsonMap {
  const records = person.records || [];
  const emails = new Set<string>();
  const phones = new Set<string>();
  let readiness = '';
  for (const record of records) {
    if (record.email) emails.add(record.email);
    if (record.phone) phones.add(record.phone);
    if (!readiness && record.readinessScore) readiness = record.readinessScore;
  }

  // Sections B-F of the consolidation spec. Consents are excluded on purpose —
  // they live in their own collection (section G).
  const unified = person.unified || {};
  const descriptive: JsonMap = {};
  for (const name of UNIFIED_FIELD_NAMES) {
    if (CONSENT_FIELD_NAMES.includes(name)) continue;
    descriptive[name] = unified[name] || '';
  }

  return {
    candidate_id: candidateIdFrom(stableId),
    source_database: joinTags(person.sourceDatabases || []),
    person_id: person.id,
    first_name: person.primaryFirstName || '',
    last_names: person.primaryLastName || '',
    full_name: person.primaryName || '',
    primary_email: person.primaryEmail || '',
    phone_number: person.primaryPhone || '',
    // Derived, used by the country filter so a person is findable by either
    // residence or origin.
    country: person.country || '',
    ...descriptive,
    skill_tags: person.skillTags || '',
    skill_tags_source: person.enrichment?.skill_tags?.source || '',
    skill_tags_confidence: person.enrichment?.skill_tags?.confidence_tier || '',
    skill_tags_basis: person.enrichment?.skill_tags?.inference_basis || '',
    match_type: person.matchType || '',
    match_confidence: person.matchConfidence || '',
    confidence_pct: person.confidence || 0,
    needs_review: !!person.needsReview,
    review_reason: person.reviewReason || '',
    held_out: !!person.heldOut,
    record_count: records.length,
    readiness_score: readiness,
    employment_status: '',
    seniority: person.seniority || '',
    seniority_source: person.enrichment?.seniority?.source || '',
    seniority_confidence: person.enrichment?.seniority?.confidence_tier || '',
    seniority_basis: person.enrichment?.seniority?.inference_basis || '',
    all_emails: joinTags(Array.from(emails)),
    all_phones: joinTags(Array.from(phones)),
    provenance_text: (person.provenance || []).join(' | '),
    field_provenance: person.fieldProvenance || {},
    sources: records.map((record) => ({
      source_file: record.sourceDb || '',
      source_database: record.sourceDatabase || '',
      source_row_id: String(record.rowIndex ?? ''),
      email: record.email || '',
      phone: record.phone || '',
      name: recordName(record),
      talent_id: record.talentId || '',
      profile_id: record.profileId || '',
      country: record.countryOfResidence || record.countryOfOrigin || '',
    })),
    search_text: searchText([
      person.primaryName,
      person.primaryFirstName,
      person.primaryLastName,
      person.primaryEmail,
      person.primaryPhone,
      person.country,
      unified.city_of_residence,
      unified.languages,
      unified.technical_skills,
      unified.key_skills,
      unified.job_title,
      unified.field_of_study,
      person.skillTags,
      person.seniority,
      joinTags(person.skills || []),
      candidateIdFrom(stableId),
      person.id,
    ]),
    run_id: runId,
    review_status: 'pending',
    suggested_merge_id: '',
    merged_into: '',
    merged_from: '',
  };
}

function buildFilter(query: PersonQuery): JsonMap {
  const filter: JsonMap = {};
  if (query.runId) filter.run_id = query.runId;
  if (query.search) filter.search_text = { contains: query.search };
  if (query.country) filter.country = { contains: query.country };
  if (query.matchConfidence) filter.match_confidence = query.matchConfidence;
  if (typeof query.needsReview === 'boolean') filter.needs_review = query.needsReview;
  if (typeof query.heldOut === 'boolean') filter.held_out = query.heldOut;
  return filter;
}

function unwrapObject(record: JsonMap): JsonMap {
  const object = (record.object && typeof record.object === 'object')
    ? record.object as JsonMap
    : record;
  return { id: record.id, ...object };
}

function suggestedMergeMatcherId(reason?: string): string {
  if (!reason) return '';
  const match = reason.match(/match to ([^\s(]+)/i);
  return match?.[1] || '';
}

async function loadExistingDecisions(): Promise<Map<string, JsonMap>> {
  const decisions = new Map<string, JsonMap>();
  try {
    const result = await structuredQuery(COLLECTIONS.persons, {
      type: TYPES.person,
      select: [
        'id',
        'review_status',
        'review_decided_by',
        'review_decided_at',
        'review_note',
        'merged_into',
        'merged_from',
      ],
    });
    for (const record of result.records) {
      const row = unwrapObject(record);
      const status = String(row.review_status || '');
      if (status && status !== 'pending' && row.id) {
        decisions.set(String(row.id), row);
      }
    }
  } catch {
    // Collection may not exist yet on the first run.
  }
  return decisions;
}

function applyPreservedDecision(object: JsonMap, existing: JsonMap | undefined): JsonMap {
  if (!existing) return object;
  const status = String(existing.review_status || '');
  if (status === 'confirmed') {
    return {
      ...object,
      needs_review: false,
      held_out: false,
      review_status: 'confirmed',
      review_decided_by: existing.review_decided_by || '',
      review_decided_at: existing.review_decided_at || '',
      review_note: existing.review_note || '',
      merged_from: existing.merged_from || '',
    };
  }
  if (status === 'rejected' || status === 'merged') {
    return {
      ...object,
      needs_review: false,
      held_out: true,
      review_status: status,
      review_decided_by: existing.review_decided_by || '',
      review_decided_at: existing.review_decided_at || '',
      review_note: existing.review_note || '',
      merged_into: existing.merged_into || '',
    };
  }
  return object;
}

export async function persistMatchingResults(
  results: MatchingResults,
  sourceFiles: string[] = [],
  tableName = '',
): Promise<{
  runId: string;
  tableId: string;
  tableName: string;
  personsWritten: number;
  internalWritten: number;
  consentsWritten: number;
}> {
  const runId = `run-${Date.now()}`;
  const processedAt = results.processedAt || new Date().toISOString();

  const people = [
    ...(results.persons || []),
    ...(results.heldOutPersons || []),
  ];
  const matcherToStable = new Map<string, string>();
  for (const person of people) {
    matcherToStable.set(person.id, stablePersonId(person));
  }
  const preserved = await loadExistingDecisions();

  const personRecords = people.map((person) => {
    const id = stablePersonId(person);
    const object = personObject(person, runId, id);
    const matcherTarget = suggestedMergeMatcherId(person.reviewReason);
    object.suggested_merge_id = matcherTarget ? (matcherToStable.get(matcherTarget) || '') : '';
    return {
      id,
      object: applyPreservedDecision(object, preserved.get(id)),
      metadata: { match_type: person.matchType || '', run_id: runId },
    };
  });

  const internalRecords = (results.internalAccounts || []).map((account, index) => {
    const email = (account.email || '').trim().toLowerCase();
    const id = email
      ? `i-em-${slugId(email)}`
      : `i-row-${slugId(`${account.sourceDb || 'src'}-${account.rowIndex ?? index}`)}`;
    return {
      id,
      object: {
        name: account.name || '',
        email: account.email || '',
        phone: account.phone || '',
        internal_domain: account.internalDomain || '',
        source_file: account.sourceDb || '',
        source_row_id: String(account.rowIndex ?? ''),
        run_id: runId,
      },
    };
  });

  const runObject = {
    run_id: runId,
    processed_at: processedAt,
    total_records: results.totalRecords,
    unique_persons: results.uniquePersons,
    email_matches: results.emailMatches,
    phone_matches: results.phoneMatches,
    source_id_matches: results.sourceIdMatches || 0,
    fuzzy_matches: results.fuzzyAutoMatches || results.fuzzyMatches || 0,
    needs_review_count: results.needsReviewCount || 0,
    held_out: results.heldOut,
    internal_count: results.internalCount || internalRecords.length,
    source_files: sourceFiles,
    settings: results.settings || {},
  };

  await structuredWrite(COLLECTIONS.persons, TYPES.person, personRecords);
  await structuredWrite(COLLECTIONS.internal, TYPES.internal, internalRecords);
  const consentsWritten = await saveConsents(people.map((person) => {
    const personId = stablePersonId(person);
    return {
      candidateId: candidateIdFrom(personId),
      personId,
      runId,
      values: person.unified || {},
    };
  }));
  await structuredWrite(COLLECTIONS.runs, TYPES.run, [
    { id: runId, object: runObject },
    { id: LATEST_RUN_ID, object: runObject },
  ]);

  const table = await saveNamedTable({
    name: tableName || `Talent table ${processedAt.slice(0, 10)}`,
    runId,
    personCount: results.uniquePersons,
    needsReviewCount: results.needsReviewCount || 0,
    sourceFiles,
  });

  return {
    runId,
    tableId: table.id,
    tableName: table.name,
    personsWritten: personRecords.length,
    internalWritten: internalRecords.length,
    consentsWritten,
  };
}

export async function loadLatestRun(): Promise<JsonMap | null> {
  const record = await structuredGet(COLLECTIONS.runs, LATEST_RUN_ID);
  if (!record) return null;
  return unwrapObject(record);
}

export async function queryPersons(query: PersonQuery): Promise<{ count: number; records: JsonMap[] }> {
  const run = query.runId ? { run_id: query.runId } : await loadLatestRun();
  const runId = query.runId || (run && typeof run.run_id === 'string' ? run.run_id : '');
  if (!runId) return { count: 0, records: [] };

  const result = await structuredQuery(COLLECTIONS.persons, {
    type: TYPES.person,
    filter: buildFilter({ ...query, runId }),
    select: LIST_SELECT,
    limit: query.limit ?? 25,
    offset: query.offset ?? 0,
    order: 'created-desc',
  });

  return {
    count: result.count,
    records: result.records.map(unwrapObject),
  };
}

export async function getPerson(id: string): Promise<JsonMap | null> {
  const record = await structuredGet(COLLECTIONS.persons, id);
  if (!record) return null;
  return unwrapObject(record);
}

export async function countPersons(filter: JsonMap): Promise<number> {
  const run = await loadLatestRun();
  const runId = run && typeof run.run_id === 'string' ? run.run_id : '';
  if (!runId) return 0;
  const result = await structuredQuery(COLLECTIONS.persons, {
    type: TYPES.person,
    filter: { run_id: runId, ...filter },
    select: [],
  });
  return result.count;
}

export async function loadDashboardState(runId?: string): Promise<JsonMap> {
  const run = runId
    ? unwrapObject(await structuredGet(COLLECTIONS.runs, runId) || {})
    : await loadLatestRun();
  if (!run || !run.run_id) {
    return { hasData: false, run: null, stats: null };
  }
  const activeRunId = String(run.run_id || runId || '');
  const [people, review, heldOut, internal] = await Promise.all([
    structuredQuery(COLLECTIONS.persons, {
      type: TYPES.person,
      filter: { run_id: activeRunId, held_out: false },
      select: [],
    }),
    structuredQuery(COLLECTIONS.persons, {
      type: TYPES.person,
      filter: { run_id: activeRunId, needs_review: true },
      select: [],
    }),
    structuredQuery(COLLECTIONS.persons, {
      type: TYPES.person,
      filter: { run_id: activeRunId, held_out: true },
      select: [],
    }),
    structuredQuery(COLLECTIONS.internal, {
      type: TYPES.internal,
      filter: { run_id: activeRunId },
      select: [],
    }),
  ]);

  return {
    hasData: true,
    run,
    stats: {
      total_records: run.total_records || 0,
      unique_persons: people.count,
      email_matches: run.email_matches || 0,
      phone_matches: run.phone_matches || 0,
      fuzzy_matches: run.fuzzy_matches || 0,
      needs_review: review.count,
      held_out: heldOut.count,
      internal: internal.count,
      processed_at: run.processed_at || '',
      source_files: run.source_files || [],
    },
  };
}

export async function exportPersonRows(runId?: string): Promise<JsonMap[]> {
  const run = runId ? { run_id: runId } : await loadLatestRun();
  const id = runId || (run && typeof run.run_id === 'string' ? run.run_id : '');
  if (!id) return [];
  const result = await structuredQuery(COLLECTIONS.persons, {
    type: TYPES.person,
    filter: { run_id: id, held_out: false },
    select: ['*'],
    order: 'created-desc',
  });
  return result.records.map(unwrapObject);
}

export async function queryInternal(runId?: string): Promise<JsonMap[]> {
  const run = runId ? { run_id: runId } : await loadLatestRun();
  const id = runId || (run && typeof run.run_id === 'string' ? run.run_id : '');
  if (!id) return [];
  const result = await structuredQuery(COLLECTIONS.internal, {
    type: TYPES.internal,
    filter: { run_id: id },
    select: ['*'],
    order: 'created-desc',
  });
  return result.records.map(unwrapObject);
}

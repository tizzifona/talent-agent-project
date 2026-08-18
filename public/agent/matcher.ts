import { UNIFIED_FIELD_NAMES } from './field-map.ts';

interface DatabaseRecord {
  sourceDb: string;
  rowIndex: number;
  sourceType?: number;
  sourceFile?: string;
  sourceDatabase?: string;
  unified?: Record<string, string>;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  fullNameOriginal?: string;
  nameForMatch?: string;
  email?: string;
  phone?: string;
  phoneOriginal?: string;
  phoneUnnormalized?: boolean;
  multiEmail?: boolean;
  talentId?: string;
  profileId?: string;
  countryOfOrigin?: string;
  countryOfResidence?: string;
  applicationDate?: string;
  lastModified?: string;
  eventDate?: string;
  skills?: string[];
  readinessScore?: string;
  isInternal?: boolean;
  internalDomain?: string;
  isTestRow?: boolean;
  testReason?: string;
  isEnrichmentOnly?: boolean;
  needsManualFlag?: boolean;
  manualFlagReason?: string;
  ingestedAt?: string;
  original?: Record<string, string>;
}

type MatchConfidence = 'high' | 'medium' | 'medium-auto' | 'low' | 'none';

interface FieldProvenance {
  value: string;
  source_file: string;
  source_row_id: string;
  ingested_at: string;
  match_confidence: MatchConfidence;
  overwritten_values: Array<{ value: string; source_file: string; timestamp: string }>;
}

interface MatchedPerson {
  id: string;
  records: DatabaseRecord[];
  primaryEmail?: string;
  primaryPhone?: string;
  primaryName?: string;
  primaryFirstName?: string;
  primaryLastName?: string;
  country?: string;
  skills?: string[];
  unified?: Record<string, string>;
  sourceDatabases?: string[];
  matchType: 'email' | 'phone' | 'source-id' | 'fuzzy-auto' | 'manual-review' | 'held-out' | 'no-match';
  matchConfidence: MatchConfidence;
  confidence: number;
  provenance: string[];
  fieldProvenance: Record<string, FieldProvenance>;
  needsReview: boolean;
  reviewReason?: string;
  heldOut: boolean;
}

interface MatchingSettings {
  emailPriority?: number;
  phonePriority?: number;
  fuzzyThreshold: number;
  autoMerge?: string;
  dateWindowDays?: number;
}

function recordKey(r: DatabaseRecord): string {
  return `${r.sourceDb}:${r.rowIndex}`;
}

function getFullName(record: DatabaseRecord): string {
  if (record.fullName) return record.fullName;
  return [record.firstName, record.lastName].filter(Boolean).join(' ');
}

function getMatchName(record: DatabaseRecord): string {
  return record.nameForMatch || getFullName(record);
}

function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) matrix[i] = [i];
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[len1][len2];
}

function calculateNameSimilarity(name1: string, name2: string): number {
  if (!name1 || !name2) return 0;
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();
  if (n1 === n2) return 100;
  const maxLen = Math.max(n1.length, n2.length);
  if (maxLen === 0) return 0;
  return Math.round(((maxLen - levenshteinDistance(n1, n2)) / maxLen) * 100);
}

function normalizeCountry(c?: string): string {
  return (c || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function countriesMatch(a: DatabaseRecord, b: DatabaseRecord): boolean {
  const aVals = [normalizeCountry(a.countryOfResidence), normalizeCountry(a.countryOfOrigin)].filter(Boolean);
  const bVals = [normalizeCountry(b.countryOfResidence), normalizeCountry(b.countryOfOrigin)].filter(Boolean);
  if (aVals.length === 0 || bVals.length === 0) return false;
  return aVals.some((x) => bVals.includes(x));
}

function parseDateMs(iso?: string): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function datesProximate(a: DatabaseRecord, b: DatabaseRecord, windowDays: number): boolean {
  const aMs = parseDateMs(a.eventDate) ?? parseDateMs(a.applicationDate) ?? parseDateMs(a.lastModified);
  const bMs = parseDateMs(b.eventDate) ?? parseDateMs(b.applicationDate) ?? parseDateMs(b.lastModified);
  if (aMs === null || bMs === null) return false;
  const diffDays = Math.abs(aMs - bMs) / (86400 * 1000);
  return diffDays <= windowDays;
}

function collectSkills(records: DatabaseRecord[]): string[] {
  const skills = new Set<string>();
  for (const record of records) {
    (record.skills || []).forEach((s) => { if (s) skills.add(s); });
  }
  return Array.from(skills);
}

// Spec Sec. 2 — a merged person keeps every source database it came from.
function collectSourceDatabases(records: DatabaseRecord[]): string[] {
  const tags = new Set<string>();
  for (const record of records) {
    if (record.sourceDatabase) tags.add(record.sourceDatabase);
  }
  return Array.from(tags).sort();
}

function mostRecentRecord(records: DatabaseRecord[]): DatabaseRecord {
  return [...records].sort((a, b) => {
    const aMs = parseDateMs(a.lastModified) ?? parseDateMs(a.applicationDate) ?? 0;
    const bMs = parseDateMs(b.lastModified) ?? parseDateMs(b.applicationDate) ?? 0;
    return bMs - aMs;
  })[0];
}

// Spec Sec. 6 + 8 — field-level conflict resolution with provenance.
function resolveField(
  records: DatabaseRecord[],
  pick: (r: DatabaseRecord) => string,
  matchConfidence: MatchConfidence,
): FieldProvenance {
  const nonEmpty = records
    .map((r) => ({
      record: r,
      value: pick(r) || '',
    }))
    .filter((x) => x.value);

  if (nonEmpty.length === 0) {
    const any = records[0];
    return {
      value: '',
      source_file: any?.sourceDb || '',
      source_row_id: String(any?.rowIndex ?? ''),
      ingested_at: any?.ingestedAt || new Date().toISOString(),
      match_confidence: matchConfidence,
      overwritten_values: [],
    };
  }

  // Most recent by Application Date / Last Modified wins,
  // but never overwrite a populated value with a blank (already filtered).
  const ranked = [...nonEmpty].sort((a, b) => {
    const aMs = parseDateMs(a.record.lastModified) ?? parseDateMs(a.record.applicationDate) ?? 0;
    const bMs = parseDateMs(b.record.lastModified) ?? parseDateMs(b.record.applicationDate) ?? 0;
    return bMs - aMs;
  });

  const winner = ranked[0];
  const overwritten = ranked.slice(1)
    .filter((x) => x.value !== winner.value)
    .map((x) => ({
      value: x.value,
      source_file: x.record.sourceDb,
      timestamp: x.record.ingestedAt || x.record.lastModified || x.record.applicationDate || '',
    }));

  return {
    value: winner.value,
    source_file: winner.record.sourceDb,
    source_row_id: String(winner.record.rowIndex),
    ingested_at: winner.record.ingestedAt || new Date().toISOString(),
    match_confidence: matchConfidence,
    overwritten_values: overwritten,
  };
}

function buildPerson(
  id: string,
  records: DatabaseRecord[],
  matchType: MatchedPerson['matchType'],
  matchConfidence: MatchConfidence,
  confidence: number,
  extra?: { needsReview?: boolean; reviewReason?: string; heldOut?: boolean },
): MatchedPerson {
  const fields: Record<string, FieldProvenance> = {
    firstName: resolveField(records, (r) => r.firstName || '', matchConfidence),
    lastName: resolveField(records, (r) => r.lastName || '', matchConfidence),
    fullName: resolveField(records, (r) => getFullName(r), matchConfidence),
    email: resolveField(records, (r) => r.email || '', matchConfidence),
    phone: resolveField(records, (r) => r.phone || '', matchConfidence),
    country: resolveField(
      records,
      (r) => r.countryOfResidence || r.countryOfOrigin || '',
      matchConfidence,
    ),
  };

  // Sections B-G resolve through the same Sec. 6 rule: most recent wins, a populated
  // value is never replaced by a blank, and every discarded value stays in provenance.
  const unified: Record<string, string> = {};
  for (const name of UNIFIED_FIELD_NAMES) {
    const resolved = resolveField(records, (r) => r.unified?.[name] || '', matchConfidence);
    if (resolved.value) {
      unified[name] = resolved.value;
      fields[name] = resolved;
    }
  }

  const testRow = records.find((r) => r.isTestRow);
  const manualFlag = records.find((r) => r.needsManualFlag);
  // Only identity-bearing conflicts escalate. Conflicts on descriptive fields are
  // logged in provenance without pushing every merged person into the review queue.
  const hasUnresolvedConflict = ['firstName', 'lastName', 'fullName', 'email', 'phone']
    .some((name) => (fields[name]?.overwritten_values.length || 0) > 0);

  let needsReview = !!extra?.needsReview || !!testRow || !!manualFlag;
  let reviewReason = extra?.reviewReason ||
    testRow?.testReason ||
    manualFlag?.manualFlagReason ||
    undefined;

  // Spec: escalate when merging into a node that already has unresolved conflict
  // is handled at merge time; here we surface conflicts for audit.
  if (!needsReview && hasUnresolvedConflict && matchConfidence !== 'high') {
    needsReview = true;
    reviewReason = 'Field-level conflicts logged in provenance — confirm preferred values';
  }

  return {
    id,
    records,
    primaryFirstName: fields.firstName.value,
    primaryLastName: fields.lastName.value,
    primaryName: fields.fullName.value ||
      [fields.firstName.value, fields.lastName.value].filter(Boolean).join(' '),
    primaryEmail: fields.email.value,
    primaryPhone: fields.phone.value,
    country: fields.country.value,
    skills: collectSkills(records),
    unified,
    sourceDatabases: collectSourceDatabases(records),
    matchType,
    matchConfidence,
    confidence,
    provenance: records.map((r) => `${r.sourceDb}:${r.rowIndex}`),
    fieldProvenance: fields,
    needsReview,
    reviewReason,
    heldOut: !!extra?.heldOut,
  };
}

function emailsConflict(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() !== b.toLowerCase();
}

interface LoadedData {
  databases: Array<{ records: DatabaseRecord[] }>;
}

export function runMatching(loadedData: LoadedData, settings: MatchingSettings) {
  console.log('Starting Identity Resolution matching with settings:', settings);

  const fuzzyThreshold = settings.fuzzyThreshold ?? 85;
  const dateWindowDays = settings.dateWindowDays ?? 120;

  const allLoaded = loadedData.databases.flatMap((db) => db.records);

  // --- Spec Sec. 5: Exclusion before matching ---
  const internalRecords = allLoaded.filter((r) => r.isInternal);
  const candidates = allLoaded.filter((r) => !r.isInternal);

  const internalAccounts = internalRecords.map((r) => ({
    sourceDb: r.sourceDb,
    rowIndex: r.rowIndex,
    name: getFullName(r),
    email: r.email || '',
    phone: r.phone || '',
    internalDomain: r.internalDomain || '',
  }));

  // Enrichment-only (source 2) rows cannot seed a new person node.
  const seedable = candidates.filter((r) => !r.isEnrichmentOnly);
  const enrichmentOnly = candidates.filter((r) => r.isEnrichmentOnly);

  const persons: MatchedPerson[] = [];
  const processed = new Set<string>();
  let emailMatches = 0;
  let phoneMatches = 0;
  let sourceIdMatches = 0;
  let fuzzyAutoMatches = 0;
  let manualReview = 0;
  let heldOut = 0;

  const personByRecord = new Map<string, MatchedPerson>();

  // --- Step 1: Exact email match → High ---
  console.log('Phase 1: Exact email matching...');
  const emailGroups = new Map<string, DatabaseRecord[]>();
  for (const record of seedable) {
    if (!record.email) continue;
    if (!emailGroups.has(record.email)) emailGroups.set(record.email, []);
    emailGroups.get(record.email)!.push(record);
  }
  for (const [email, group] of emailGroups) {
    if (group.length < 2) continue;
    const person = buildPerson(
      `email-${persons.length + 1}`,
      group,
      'email',
      'high',
      100,
    );
    persons.push(person);
    for (const r of group) {
      processed.add(recordKey(r));
      personByRecord.set(recordKey(r), person);
    }
    emailMatches += group.length - 1;
  }

  // --- Step 2: Exact phone match, no conflicting email → Medium ---
  console.log('Phase 2: Exact phone matching...');
  const phoneGroups = new Map<string, DatabaseRecord[]>();
  for (const record of seedable) {
    if (processed.has(recordKey(record))) continue;
    if (!record.phone || record.phone.length < 8) continue;
    if (record.phoneUnnormalized && record.phone.length < 10) continue;
    if (!phoneGroups.has(record.phone)) phoneGroups.set(record.phone, []);
    phoneGroups.get(record.phone)!.push(record);
  }
  for (const [, group] of phoneGroups) {
    if (group.length < 2) continue;
    // Reject group if any pair has conflicting emails.
    let conflict = false;
    for (let i = 0; i < group.length && !conflict; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (emailsConflict(group[i].email, group[j].email)) {
          conflict = true;
          break;
        }
      }
    }
    if (conflict) {
      // Escalate whole phone group to manual review instead of auto-merge.
      const person = buildPerson(
        `phone-review-${persons.length + 1}`,
        group,
        'manual-review',
        'low',
        50,
        {
          needsReview: true,
          reviewReason: 'Same phone but conflicting emails — manual review required',
        },
      );
      persons.push(person);
      for (const r of group) {
        processed.add(recordKey(r));
        personByRecord.set(recordKey(r), person);
      }
      manualReview += group.length - 1;
      continue;
    }

    const person = buildPerson(
      `phone-${persons.length + 1}`,
      group,
      'phone',
      'medium',
      85,
    );
    persons.push(person);
    for (const r of group) {
      processed.add(recordKey(r));
      personByRecord.set(recordKey(r), person);
    }
    phoneMatches += group.length - 1;
  }

  // --- Step 3: Talent ID / profile_id within originating source only ---
  console.log('Phase 3: Source-scoped ID matching...');
  const bySource = new Map<string, DatabaseRecord[]>();
  for (const record of seedable) {
    if (processed.has(recordKey(record))) continue;
    if (!bySource.has(record.sourceDb)) bySource.set(record.sourceDb, []);
    bySource.get(record.sourceDb)!.push(record);
  }
  for (const [, sourceRecords] of bySource) {
    const idGroups = new Map<string, DatabaseRecord[]>();
    for (const record of sourceRecords) {
      const id = record.talentId || record.profileId;
      if (!id) continue;
      const key = `${record.talentId ? 'talent' : 'profile'}:${id}`;
      if (!idGroups.has(key)) idGroups.set(key, []);
      idGroups.get(key)!.push(record);
    }
    for (const [, group] of idGroups) {
      if (group.length < 2) continue;
      const person = buildPerson(
        `sourceid-${persons.length + 1}`,
        group,
        'source-id',
        'high',
        95,
      );
      persons.push(person);
      for (const r of group) {
        processed.add(recordKey(r));
        personByRecord.set(recordKey(r), person);
      }
      sourceIdMatches += group.length - 1;
    }
  }

  // Anchored persons = high/medium confidence nodes that fuzzy can merge into.
  function isAnchored(p: MatchedPerson): boolean {
    return p.matchConfidence === 'high' || p.matchConfidence === 'medium' ||
      p.matchConfidence === 'medium-auto';
  }

  // --- Step 4: Hybrid fuzzy name match (Spec Sec. 3.1) ---
  console.log('Phase 4: Hybrid fuzzy name matching...');
  const remaining = seedable.filter((r) => !processed.has(recordKey(r)));

  // Also process enrichment-only rows here — they may only attach to existing nodes.
  const fuzzyQueue = [...remaining, ...enrichmentOnly];

  for (const incoming of fuzzyQueue) {
    if (processed.has(recordKey(incoming))) continue;
    const name = getMatchName(incoming);
    if (!name) {
      if (incoming.isEnrichmentOnly) {
        // Hold out enrichment row with no name.
        heldOut++;
        processed.add(recordKey(incoming));
      }
      continue;
    }

    // Score against every anchored person node.
    type CandidateHit = { person: MatchedPerson; score: number; signals: number; nameOk: boolean };
    const hits: CandidateHit[] = [];

    for (const person of persons) {
      if (!isAnchored(person)) continue;
      // Spec: don't compound uncertainty into a flagged node.
      if (person.needsReview) continue;

      const anchor = mostRecentRecord(person.records);
      const nameSim = calculateNameSimilarity(name, getMatchName(anchor));
      const nameOk = nameSim >= fuzzyThreshold;
      const countryOk = countriesMatch(incoming, anchor);
      const dateOk = datesProximate(incoming, anchor, dateWindowDays);

      const signals = (nameOk ? 1 : 0) + (countryOk ? 1 : 0) + (dateOk ? 1 : 0);
      if (signals === 0) continue;
      // Name alone never auto-merges, but name is required as one of the signals
      // for a meaningful fuzzy candidate (otherwise country+date alone is too weak).
      if (!nameOk && signals < 2) continue;
      if (!nameOk) continue; // Spec: fuzzy is name-based; country/date are corroboration.

      hits.push({ person, score: nameSim, signals, nameOk });
    }

    // Multiple plausible nodes → manual review (can't disambiguate).
    const plausible = hits.filter((h) => h.signals >= 1 && h.nameOk);
    const autoHits = hits.filter((h) => h.signals >= 2 && h.nameOk);

    if (autoHits.length === 1) {
      const hit = autoHits[0];
      // Merge into existing node; upgrade provenance confidence to medium-auto if was lower path.
      hit.person.records.push(incoming);
      hit.person.provenance.push(recordKey(incoming));
      hit.person.skills = collectSkills(hit.person.records);
      // Rebuild primary fields with conflict resolution.
      const rebuilt = buildPerson(
        hit.person.id,
        hit.person.records,
        'fuzzy-auto',
        'medium-auto',
        Math.min(hit.person.confidence, Math.round(hit.score * 0.9)),
      );
      Object.assign(hit.person, rebuilt, {
        id: hit.person.id,
        matchType: hit.person.matchType === 'email' || hit.person.matchType === 'phone'
          ? hit.person.matchType
          : 'fuzzy-auto',
        matchConfidence: hit.person.matchConfidence === 'high' || hit.person.matchConfidence === 'medium'
          ? hit.person.matchConfidence
          : 'medium-auto',
      });
      processed.add(recordKey(incoming));
      personByRecord.set(recordKey(incoming), hit.person);
      fuzzyAutoMatches++;
      continue;
    }

    if (autoHits.length > 1 || (plausible.length > 1 && autoHits.length === 0)) {
      const person = buildPerson(
        `fuzzy-review-${persons.length + 1}`,
        [incoming],
        'manual-review',
        'low',
        40,
        {
          needsReview: true,
          reviewReason: `Multiple plausible person nodes for "${getFullName(incoming)}" — cannot auto-disambiguate`,
        },
      );
      persons.push(person);
      processed.add(recordKey(incoming));
      personByRecord.set(recordKey(incoming), person);
      manualReview++;
      continue;
    }

    if (plausible.length === 1 && plausible[0].signals === 1) {
      // Exactly 1 of 3 agree → escalate to manual review with suggested target.
      const hit = plausible[0];
      const person = buildPerson(
        `fuzzy-review-${persons.length + 1}`,
        [incoming, ...hit.person.records.slice(0, 1)],
        'manual-review',
        'low',
        Math.round(hit.score * 0.6),
        {
          needsReview: true,
          reviewReason:
            `Ambiguous fuzzy match to ${hit.person.id} (only name agrees; country/date do not) — confirm or reject`,
        },
      );
      persons.push(person);
      processed.add(recordKey(incoming));
      personByRecord.set(recordKey(incoming), person);
      manualReview++;
      continue;
    }

    // No fuzzy match.
    if (incoming.isEnrichmentOnly) {
      // Spec: source 2 never seeds a new node — hold out.
      const person = buildPerson(
        `heldout-${persons.length + 1}`,
        [incoming],
        'held-out',
        'none',
        0,
        {
          heldOut: true,
          needsReview: true,
          reviewReason: 'Enrichment-only row (source 2) with no fuzzy match to an anchored person — held out',
        },
      );
      persons.push(person);
      processed.add(recordKey(incoming));
      heldOut++;
      continue;
    }

    // Remaining seedable unmatched rows become single-record persons (no-match / held out singles).
  }

  // --- Phase 5: Remaining seedable records → single person nodes ---
  console.log('Phase 5: Single-record persons...');
  for (const record of seedable) {
    if (processed.has(recordKey(record))) continue;
    const review = record.isTestRow || record.needsManualFlag || record.phoneUnnormalized;
    const person = buildPerson(
      `single-${persons.length + 1}`,
      [record],
      review ? 'manual-review' : 'no-match',
      review ? 'low' : 'high',
      review ? 60 : 100,
      review
        ? {
          needsReview: true,
          reviewReason: record.testReason || record.manualFlagReason ||
            (record.phoneUnnormalized ? 'Phone could not be fully normalized (no country code / residence)' : undefined),
        }
        : undefined,
    );
    persons.push(person);
    processed.add(recordKey(record));
    if (review) manualReview++;
  }

  // Any leftover enrichment rows not processed.
  for (const record of enrichmentOnly) {
    if (processed.has(recordKey(record))) continue;
    const person = buildPerson(
      `heldout-${persons.length + 1}`,
      [record],
      'held-out',
      'none',
      0,
      {
        heldOut: true,
        needsReview: true,
        reviewReason: 'Enrichment-only row held out (no match to anchored person)',
      },
    );
    persons.push(person);
    heldOut++;
  }

  const needsReviewCount = persons.filter((p) => p.needsReview).length;
  const uniquePersons = persons.filter((p) => !p.heldOut).length;

  const results = {
    totalRecords: allLoaded.length,
    uniquePersons,
    emailMatches,
    phoneMatches,
    sourceIdMatches,
    fuzzyMatches: fuzzyAutoMatches,
    fuzzyAutoMatches,
    manualReview,
    needsReviewCount,
    heldOut,
    persons: persons.filter((p) => !p.heldOut),
    heldOutPersons: persons.filter((p) => p.heldOut),
    allPersons: persons,
    internalAccounts,
    internalCount: internalAccounts.length,
    settings,
    processedAt: new Date().toISOString(),
  };

  console.log('Identity Resolution complete:', {
    totalRecords: results.totalRecords,
    uniquePersons: results.uniquePersons,
    emailMatches,
    phoneMatches,
    sourceIdMatches,
    fuzzyAutoMatches,
    manualReview,
    needsReviewCount,
    heldOut,
    internalCount: results.internalCount,
  });

  return results;
}

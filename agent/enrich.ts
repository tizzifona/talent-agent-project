/**
 * Step 3 high-tier enrichment — deterministic mapping only.
 * Medium/low AI inference is out of scope. employment_status is never inferred.
 */

export type EnrichmentSource = 'original_data' | 'ai_inferred';
export type EnrichmentTier = 'high' | 'medium' | 'low';

export interface EnrichmentMeta {
  source: EnrichmentSource;
  confidence_tier: EnrichmentTier;
  inference_basis: string;
}

export interface EnrichablePerson {
  unified?: Record<string, string>;
  skillTags?: string;
  seniority?: string;
  enrichment?: Record<string, EnrichmentMeta>;
  fieldProvenance?: Record<string, {
    value: string;
    source_file: string;
    source_row_id: string;
    ingested_at: string;
    match_confidence: string;
    overwritten_values: unknown[];
    source?: EnrichmentSource;
    confidence_tier?: EnrichmentTier;
    inference_basis?: string;
  }>;
}

const TITLE_LEVELS: Array<{ match: RegExp; level: string }> = [
  { match: /\b(cto|ceo|coo|cfo|vp|vice[\s-]?president|chief)\b/i, level: 'Executive' },
  { match: /\bdirector\b/i, level: 'Director' },
  { match: /\b(manager|head of)\b/i, level: 'Manager' },
  { match: /\b(principal|staff)\b/i, level: 'Staff' },
  { match: /\blead\b/i, level: 'Lead' },
  { match: /\b(senior|sr\.?)\b/i, level: 'Senior' },
  { match: /\b(mid[\s-]?level|intermediate)\b/i, level: 'Mid-level' },
  { match: /\b(junior|jr\.?|entry[\s-]?level|intern|trainee)\b/i, level: 'Junior' },
];

function splitTags(raw: string): string[] {
  return raw.split('|').map((part) => part.trim()).filter(Boolean);
}

function joinTags(values: string[]): string {
  return [...new Set(values)].join(' | ');
}

/** Parse a years-of-experience cell into a number, or null if it is not explicit. */
export function parseYears(raw?: string): number | null {
  if (!raw) return null;
  const text = String(raw).trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const plus = text.match(/(\d+(?:\.\d+)?)\s*\+/);
  if (plus) return Number(plus[1]);
  const range = text.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (range) return (Number(range[1]) + Number(range[2])) / 2;
  const years = text.match(/(\d+(?:\.\d+)?)\s*(years?|yrs?)\b/i);
  if (years) return Number(years[1]);
  return null;
}

export function seniorityFromYears(years: number): string {
  if (years < 2) return 'Junior';
  if (years < 5) return 'Mid-level';
  if (years < 9) return 'Senior';
  return 'Lead';
}

export function seniorityFromTitle(title?: string): string | null {
  if (!title) return null;
  for (const entry of TITLE_LEVELS) {
    if (entry.match.test(title)) return entry.level;
  }
  return null;
}

function stamp(
  person: EnrichablePerson,
  field: string,
  value: string,
  basis: string,
): void {
  person.enrichment = {
    ...(person.enrichment || {}),
    [field]: {
      source: 'original_data',
      confidence_tier: 'high',
      inference_basis: basis,
    },
  };
  const provenance = person.fieldProvenance || {};
  provenance[field] = {
    value,
    source_file: 'original_data',
    source_row_id: basis,
    ingested_at: new Date().toISOString(),
    match_confidence: 'high',
    overwritten_values: [],
    source: 'original_data',
    confidence_tier: 'high',
    inference_basis: basis,
  };
  person.fieldProvenance = provenance;
}

/**
 * Copy structured skill columns onto skill_tags (high). Do not infer from prose.
 * Do not overwrite an existing skill_tags value.
 */
export function applySkillTagsHigh(person: EnrichablePerson): void {
  if (person.skillTags) return;
  const unified = person.unified || {};
  const fromTech = splitTags(unified.technical_skills || '');
  const fromKey = splitTags(unified.key_skills || '');
  const tags = joinTags([...fromTech, ...fromKey]);
  if (!tags) return;
  const basis = [
    fromTech.length ? 'technical_skills' : '',
    fromKey.length ? 'key_skills' : '',
  ].filter(Boolean).join(', ');
  person.skillTags = tags;
  stamp(person, 'skill_tags', tags, basis);
}

/**
 * Map stated title or explicit years onto seniority (high). Skip if neither is clear.
 * Do not overwrite an existing seniority value. Never sets employment_status.
 */
export function applySeniorityHigh(person: EnrichablePerson): void {
  if (person.seniority) return;
  const unified = person.unified || {};
  const fromTitle = seniorityFromTitle(unified.job_title);
  if (fromTitle) {
    person.seniority = fromTitle;
    stamp(person, 'seniority', fromTitle, 'job_title');
    return;
  }
  const techYears = parseYears(unified.years_of_tech_experience);
  if (techYears !== null) {
    const level = seniorityFromYears(techYears);
    person.seniority = level;
    stamp(person, 'seniority', level, 'years_of_tech_experience');
    return;
  }
  const years = parseYears(unified.years_of_experience);
  if (years !== null) {
    const level = seniorityFromYears(years);
    person.seniority = level;
    stamp(person, 'seniority', level, 'years_of_experience');
  }
}

export function applyHighTierEnrichment(person: EnrichablePerson): void {
  applySkillTagsHigh(person);
  applySeniorityHigh(person);
}

export function enrichMatchingResults<T extends EnrichablePerson>(results: {
  persons?: T[];
  heldOutPersons?: T[];
  allPersons?: T[];
}): typeof results {
  const people = results.allPersons || [
    ...(results.persons || []),
    ...(results.heldOutPersons || []),
  ];
  for (const person of people) applyHighTierEnrichment(person);
  return results;
}

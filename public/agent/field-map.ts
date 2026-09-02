/**
 * Unified field schema for the consolidated table ("Consolidando BBDD Blue Hope", A-G).
 * Each field lists the source headers it accepts. Values are copied, never inferred —
 * inference of skill tags and seniority belongs to the Step 3 enrichment layer.
 */

export const cleanKey = (key: string): string =>
  key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

export interface UnifiedFieldDef {
  name: string;
  aliases?: string[];
  contains?: string[];
  multi?: boolean;
  normalize?: (raw: string) => string;
  rawAs?: string;
  sensitive?: boolean;
}

const LEVEL_SCALE: Array<{ match: RegExp; level: string }> = [
  { match: /^(c2|proficiency|proficient|nearnative|bilingual)$/, level: 'C2' },
  { match: /^(c1|advanced|fluent|fluently)$/, level: 'C1' },
  { match: /^(b2|upperintermediate|uppintermediate|good|conversational)$/, level: 'B2' },
  { match: /^(b1|intermediate|medium)$/, level: 'B1' },
  { match: /^(a2|elementary|preintermediate)$/, level: 'A2' },
  { match: /^(a1|beginner|basic|starter)$/, level: 'A1' },
  { match: /^(native|nativespeaker|mothertongue|motherlanguage)$/, level: 'Native' },
];

/** Map free-text language ability onto the common A1-C2 / Native / Unknown scale. */
export function normalizeLanguageLevel(raw: string): string {
  const key = cleanKey(raw);
  if (!key) return '';
  for (const entry of LEVEL_SCALE) {
    if (entry.match.test(key)) return entry.level;
  }
  // Values such as "B2 - upper intermediate" or "English C1".
  const embedded = key.match(/(a1|a2|b1|b2|c1|c2)/);
  if (embedded) return embedded[1].toUpperCase();
  if (key.includes('native')) return 'Native';
  if (key.includes('fluent')) return 'C1';
  if (key.includes('advanced')) return 'C1';
  if (key.includes('intermediate')) return key.includes('upper') ? 'B2' : 'B1';
  if (key.includes('beginner') || key.includes('basic')) return 'A1';
  return 'Unknown';
}

/** Consent and yes/no answers. Anything unrecognised stays "unknown" rather than "no". */
export function normalizeYesNo(raw: string): string {
  const key = cleanKey(raw);
  if (!key) return '';
  if (/^(yes|y|true|1|si|sim|accept|accepted|agree|agreed|iagree|checked|x|ok|granted)/.test(key)) {
    return 'yes';
  }
  if (/^(no|n|false|0|declined|decline|refused|reject|rejected|notagree|unchecked)/.test(key)) {
    return 'no';
  }
  return 'unknown';
}

/** BD1-BD7 tag for one of the seven inventory sources (Spec Sec. 2). */
export function sourceDatabaseTag(sourceType?: number): string {
  return sourceType && sourceType >= 1 && sourceType <= 7 ? `BD${sourceType}` : '';
}

/**
 * Deterministic Blue Hope identifier. Derived from the person's stable id, so the
 * same person keeps the same candidate_id across re-imports.
 */
export function candidateIdFrom(stableId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < stableId.length; i++) {
    hash ^= stableId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `BH-${hash.toString(36).toUpperCase().padStart(6, '0').slice(-6)}`;
}

// Section B - demographics and location.
const DEMOGRAPHIC_FIELDS: UnifiedFieldDef[] = [
  { name: 'gender', aliases: ['gender', 'sex', 'genero'] },
  { name: 'age', aliases: ['age', 'edad'] },
  { name: 'country_of_origin', aliases: ['countryoforigin', 'paisdeorigen'] },
  { name: 'country_of_residence', aliases: ['countryofresidence', 'paisderesidencia', 'country'] },
  {
    name: 'city_of_residence',
    aliases: ['cityofresidence', 'residenceaddresscity', 'city', 'ciudad', 'town'],
  },
];

// Section C - contact information.
const CONTACT_FIELDS: UnifiedFieldDef[] = [
  {
    name: 'preferred_contact_method',
    aliases: ['waytobecontacted', 'preferredmethodofcontact', 'preferredcontactmethod'],
  },
  { name: 'linkedin_url', aliases: ['linkedin', 'linkedinprofile', 'linkedinurl'] },
];

// Section D - legal and social situation.
const LEGAL_FIELDS: UnifiedFieldDef[] = [
  { name: 'legal_status', aliases: ['legalstatus', 'currentsituation'] },
  { name: 'refugee_status', aliases: ['refugeestatus'], sensitive: true },
  { name: 'work_permission', aliases: ['workpermit', 'workpermission'] },
];

// Section E - languages and education.
const EDUCATION_FIELDS: UnifiedFieldDef[] = [
  {
    name: 'languages',
    aliases: ['languages', 'whatlanguagesdoyoufluentlyspeak', 'language', 'idiomas'],
    contains: ['languagesspoken', 'languagesyouspeak'],
    multi: true,
  },
  {
    name: 'english_level',
    aliases: ['englishlevel', 'levelofenglish', 'niveldeingles'],
    normalize: normalizeLanguageLevel,
    rawAs: 'english_level_raw',
  },
  {
    name: 'highest_education_level',
    aliases: [
      'highestlevelofeducation',
      'highestlevelofeducationcompleted',
      'highesteducationlevel',
      'highesteducation',
      'educationlevel',
      'education',
    ],
  },
  {
    name: 'field_of_study',
    aliases: [
      'whatisyourdisciplinefieldofstudies',
      'whatisyourdisciplineorfieldofstudy',
      'discipline',
      'fieldofstudy',
      'fieldofstudies',
    ],
  },
  {
    name: 'courses_and_certifications',
    aliases: ['courses', 'coursescompleted', 'certifications', 'certificates', 'training'],
    contains: ['certificat', 'coursestaken', 'workwellcourse'],
    multi: true,
  },
];

// Section F - professional experience and competencies.
const EXPERIENCE_FIELDS: UnifiedFieldDef[] = [
  {
    name: 'work_experience_summary',
    aliases: [
      'whatwasyourprofessionbackinyourcountry',
      'professionalbackground',
      'professionalexperience',
      'workexperience',
      'profession',
      'currentoccupation',
    ],
    multi: true,
  },
  {
    name: 'years_of_experience',
    aliases: ['yearsofexperience', 'yearsexperience', 'experienceyears', 'years'],
  },
  {
    name: 'years_of_tech_experience',
    aliases: [
      'yearsoftechexperience',
      'yearsoftechnicalexperience',
      'yearstech',
      'yearsoftech',
    ],
    contains: ['yearsoftech'],
  },
  {
    // Exact aliases only — never match "title" by substring (Deal - Title is junk).
    name: 'job_title',
    aliases: [
      'jobtitle',
      'currentrole',
      'currentposition',
      'position',
      'jobfunction',
      'professionaltitle',
      'statedtitle',
    ],
  },
  {
    name: 'has_tech_experience',
    aliases: ['techexperience', 'hastechexperience'],
    contains: ['priorexperienceinthetechindustry', 'experienceinthetechindustry'],
    normalize: normalizeYesNo,
    rawAs: 'has_tech_experience_raw',
  },
  { name: 'github_url', aliases: ['githubportfolio', 'github', 'githuburl'] },
  {
    name: 'technical_skills',
    aliases: ['technicalskills', 'technicalskills2', 'toptechnicalskills', 'techskills'],
    contains: ['technicalskill', 'areasoftechnology', 'techstack'],
    multi: true,
  },
  {
    name: 'key_skills',
    aliases: ['keyskill', 'keyskills', 'softskills', 'competencies', 'competences'],
    multi: true,
  },
];

// Section G - consents and privacy. Each authorisation stays its own field.
const CONSENT_FIELDS: UnifiedFieldDef[] = [
  {
    name: 'privacy_policy_accepted',
    aliases: ['privacypolicy', 'dataprivacystatement', 'privacystatement'],
    normalize: normalizeYesNo,
  },
  {
    name: 'data_processing_consent',
    aliases: ['dataprocessingconsent', 'autorizacionparaeltratamientodedatos'],
    contains: ['tratamientodedatos', 'dataprocessing'],
    normalize: normalizeYesNo,
  },
  {
    name: 'future_contact_consent',
    aliases: ['permission', 'futurecontactconsent'],
    contains: ['futureopportunities', 'futureevents'],
    normalize: normalizeYesNo,
  },
];

export const CONSENT_FIELD_NAMES = CONSENT_FIELDS.map((field) => field.name);

export const UNIFIED_FIELDS: UnifiedFieldDef[] = [
  ...DEMOGRAPHIC_FIELDS,
  ...CONTACT_FIELDS,
  ...LEGAL_FIELDS,
  ...EDUCATION_FIELDS,
  ...EXPERIENCE_FIELDS,
  ...CONSENT_FIELDS,
];

/** Every stored column name, including the raw companions of normalized fields. */
export const UNIFIED_FIELD_NAMES: string[] = UNIFIED_FIELDS.flatMap((field) =>
  field.rawAs ? [field.name, field.rawAs] : [field.name]
);

export const SENSITIVE_FIELD_NAMES: string[] = UNIFIED_FIELDS
  .filter((field) => field.sensitive)
  .map((field) => field.name);

function matchesField(cleaned: string, field: UnifiedFieldDef): boolean {
  if (field.aliases?.includes(cleaned)) return true;
  return !!field.contains?.some((part) => cleaned.includes(part));
}

/**
 * Read one raw source row into the unified fields. Multi-value fields are joined
 * with " | " after the caller has split malformed array exports (Spec Sec. 9).
 */
export function mapUnifiedFields(
  record: Record<string, unknown>,
  splitList: (raw: string) => string[],
): Record<string, string> {
  const collected = new Map<string, string[]>();

  for (const key of Object.keys(record)) {
    if (key === '_rowIndex' || key === 'original') continue;
    const cleaned = cleanKey(key);
    if (!cleaned) continue;
    const value = record[key] === null || record[key] === undefined ? '' : String(record[key]).trim();
    if (!value) continue;

    for (const field of UNIFIED_FIELDS) {
      if (!matchesField(cleaned, field)) continue;
      const bucket = collected.get(field.name) || [];
      for (const part of field.multi ? splitList(value) : [value]) {
        if (part && !bucket.includes(part)) bucket.push(part);
      }
      collected.set(field.name, bucket);
    }
  }

  const out: Record<string, string> = {};
  for (const field of UNIFIED_FIELDS) {
    const values = collected.get(field.name) || [];
    if (values.length === 0) continue;
    const raw = field.multi ? values.join(' | ') : values[0];
    out[field.name] = field.normalize ? field.normalize(raw) : raw;
    if (field.rawAs && raw !== out[field.name]) out[field.rawAs] = raw;
  }
  return out;
}

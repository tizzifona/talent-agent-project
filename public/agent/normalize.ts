import { applyFilters } from './filters.ts';
import { cleanKey, mapUnifiedFields, sourceDatabaseTag } from './field-map.ts';

const toString = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  return String(val);
};

// Spec Sec. 2 — detect which of the 7 inventory sources a file belongs to.
export function detectSourceType(fileName: string): number {
  const n = (fileName || '').toLowerCase();
  const leading = n.match(/^(\d+)\s*\)/);
  if (leading) {
    const num = parseInt(leading[1], 10);
    if (num >= 1 && num <= 7) return num;
  }
  if (n.includes('workwell') || n.includes('work-well')) return 7;
  if (n.includes('blue hope contacts') || n.includes("na'amal") || n.includes('naamal')) return 6;
  if (n.includes('talent-talent') || n.includes('talent main') || n.includes('talent id')) {
    return n.includes('og') || n.includes('early') ? 1 : 5;
  }
  if (n.includes('pipedrive') || n.includes('deal')) return 3;
  if (n.includes('looking for work') || n.includes('crm contact')) return 4;
  if (n.includes('re_coded') || n.includes('recoded') || n.includes('enrichment') || n.includes('student information')) {
    return 2;
  }
  if (n.includes('og -') || n.includes('og-')) return 1;
  return 0; // unknown — treat as generic with email/phone/name matching only
}

function findValue(record: Record<string, unknown>, predicates: ((cleaned: string) => boolean)[]): string {
  for (const key of Object.keys(record)) {
    if (key === '_rowIndex' || key === 'original') continue;
    const cleaned = cleanKey(key);
    if (predicates.some((p) => p(cleaned))) {
      const value = toString(record[key]).trim();
      if (value) return value;
    }
  }
  return '';
}

function findAllValues(record: Record<string, unknown>, predicates: ((cleaned: string) => boolean)[]): string[] {
  const out: string[] = [];
  for (const key of Object.keys(record)) {
    if (key === '_rowIndex' || key === 'original') continue;
    const cleaned = cleanKey(key);
    if (predicates.some((p) => p(cleaned))) {
      const value = toString(record[key]).trim();
      if (value) out.push(value);
    }
  }
  return out;
}

// Spec Sec. 9 — cleanup malformed Postgres/JSON array exports like
// {English,Portuguese} or {"{Arabic","English}"}.
export function parseBrokenArrayField(raw: string): string[] {
  if (!raw) return [];
  let text = raw.trim();
  if (!text) return [];

  // Already a clean CSV list without braces.
  if (!text.includes('{') && !text.includes('"') && !text.includes('\n')) {
    return text.split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
  }

  text = text
    .replace(/^\{\{+/, '{')
    .replace(/\}\}+$/, '}')
    .replace(/^\{/, '')
    .replace(/\}$/, '');

  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if ((ch === ',' || ch === ';' || ch === '|') && !inQuotes) {
      const cleaned = current.trim().replace(/^[{"]+|["}]+$/g, '').trim();
      if (cleaned) parts.push(cleaned);
      current = '';
      continue;
    }
    current += ch;
  }
  const last = current.trim().replace(/^[{"]+|["}]+$/g, '').trim();
  if (last) parts.push(last);
  return parts;
}

// Spec Sec. 4 — email normalization.
export function normalizeEmailValue(raw?: string): {
  email: string;
  multiEmail: boolean;
  rejected: boolean;
} {
  if (!raw) return { email: '', multiEmail: false, rejected: false };
  let value = String(raw).trim().toLowerCase();
  value = value.replace(/[.,;:]+$/g, '');

  // Multiple comma/semicolon-separated emails — flag, do not silently pick one.
  if (/[,;]/.test(value) && value.includes('@')) {
    const parts = value.split(/[,;]/).map((p) => p.trim()).filter((p) => p.includes('@'));
    if (parts.length > 1) {
      return { email: '', multiEmail: true, rejected: true };
    }
  }

  if (!value.includes('@')) return { email: '', multiEmail: false, rejected: false };
  return { email: value, multiEmail: false, rejected: false };
}

const COUNTRY_DIAL: Record<string, string> = {
  ukraine: '380',
  spain: '34',
  'united kingdom': '44',
  uk: '44',
  germany: '49',
  france: '33',
  italy: '39',
  poland: '48',
  portugal: '351',
  netherlands: '31',
  belgium: '32',
  turkey: '90',
  iraq: '964',
  jordan: '962',
  lebanon: '961',
  syria: '963',
  egypt: '20',
  nigeria: '234',
  kenya: '254',
  usa: '1',
  'united states': '1',
  canada: '1',
  mexico: '52',
  colombia: '57',
  argentina: '54',
  brazil: '55',
};

// Spec Sec. 4 — phone normalization.
export function normalizePhoneValue(
  raw?: string,
  countryOfResidence?: string,
): { phone: string; phoneUnnormalized: boolean; original: string } {
  if (!raw) return { phone: '', phoneUnnormalized: false, original: '' };
  const original = String(raw).trim();
  if (!original) return { phone: '', phoneUnnormalized: false, original: '' };

  let digits = original.replace(/[^\d+]/g, '');
  const hasPlus = digits.startsWith('+');
  digits = digits.replace(/\D/g, '');

  if (!digits) return { phone: '', phoneUnnormalized: true, original };

  // Already has country code (leading + or long enough international form).
  if (hasPlus && digits.length >= 10) {
    return { phone: digits, phoneUnnormalized: false, original };
  }

  // Infer country code from Country of Residence when missing.
  if (!hasPlus) {
    const country = (countryOfResidence || '').toLowerCase().trim();
    const dial = COUNTRY_DIAL[country];
    if (dial) {
      // Avoid double-prefixing if the number already starts with the dial code.
      if (digits.startsWith(dial)) {
        return { phone: digits, phoneUnnormalized: false, original };
      }
      return { phone: dial + digits, phoneUnnormalized: false, original };
    }
    // No country to infer from — flag rather than guess.
    return { phone: digits, phoneUnnormalized: true, original };
  }

  return { phone: digits, phoneUnnormalized: digits.length < 10, original };
}

function excelSerialToIso(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && value > 20000 && value < 100000) {
    // Excel serial date (days since 1899-12-30).
    const ms = Math.round((value - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const str = toString(value).trim();
  if (!str) return '';
  const parsed = Date.parse(str);
  if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
  return str;
}

function titleCaseForMatch(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase()
    .replace(/(^|[\s\-'])\S/g, (m) => m.toLocaleUpperCase());
}

/**
 * Spec Sec. 4/5/9 — normalize one raw row into a DatabaseRecord-shaped object.
 * Pass sourceFileName so source-type rules (Sec. 2/3) can apply.
 */
// deno-lint-ignore no-explicit-any
export function normalizeRecord(record: Record<string, any>, sourceFileName = ''): any {
  // deno-lint-ignore no-explicit-any
  const normalized: any = {
    original: record,
    sourceType: detectSourceType(sourceFileName),
    sourceFile: sourceFileName,
    ingestedAt: new Date().toISOString(),
  };

  // --- Email ---
  const rawEmail = findValue(record, [
    (c) => c === 'email' || c === 'emailaddress' || c === 'personemail' || c === 'contactemail',
    (c) => c.includes('email') && !c.includes('ngo') && !c.includes('worker'),
  ]);
  const emailResult = normalizeEmailValue(rawEmail);
  normalized.email = emailResult.email;
  normalized.multiEmail = emailResult.multiEmail;
  if (emailResult.multiEmail) {
    normalized.rawMultiEmail = rawEmail;
  }

  // --- Country (needed before phone inference) ---
  normalized.countryOfOrigin = findValue(record, [
    (c) => c === 'countryoforigin' || c.includes('countryoforigin'),
  ]);
  normalized.countryOfResidence = findValue(record, [
    (c) => c === 'countryofresidence' || c.includes('countryofresidence'),
  ]);

  // --- Phone ---
  const rawPhone = findValue(record, [
    (c) =>
      c === 'phone' ||
      c === 'phonenumber' ||
      c === 'contactphonenumber' ||
      c === 'mobile' ||
      c === 'telephone' ||
      (c.includes('phone') && !c.includes('preference')),
  ]);
  const phoneResult = normalizePhoneValue(rawPhone, normalized.countryOfResidence);
  normalized.phone = phoneResult.phone;
  normalized.phoneOriginal = phoneResult.original;
  normalized.phoneUnnormalized = phoneResult.phoneUnnormalized;

  // --- Name (preserve original casing/diacritics in stored fields) ---
  normalized.firstName = findValue(record, [
    (c) => c === 'firstname' || c === 'first' || c === 'givenname' || c === 'name',
  ]);
  // Prefer Surname / Last Name over generic "name" for last.
  normalized.lastName = findValue(record, [
    (c) => c === 'lastname' || c === 'surname' || c === 'last' || c === 'familyname',
  ]);

  // Source 4 uses Name + Surname; Source 2 uses Student Name; Source 3 uses Deal - Contact person.
  if (!normalized.firstName && !normalized.lastName) {
    const fullCandidates = findValue(record, [
      (c) =>
        c === 'displayname' ||
        c === 'studentname' ||
        c === 'fullname' ||
        c === 'fullnameenglish' ||
        c === 'dealcontactperson' ||
        c === 'contactperson' ||
        c === 'attendeename' ||
        c === 'participantname' ||
        c === 'nameenglish',
    ]);
    if (fullCandidates) {
      // "Last, First" format
      if (fullCandidates.includes(',')) {
        const [last, first] = fullCandidates.split(',').map((p) => p.trim());
        normalized.lastName = last;
        normalized.firstName = first;
        normalized.fullName = `${first} ${last}`.trim();
        normalized.fullNameOriginal = fullCandidates;
      } else {
        const parts = fullCandidates.trim().split(/\s+/);
        // Strip TAL###- prefix from Display Name like TAL77-ANDRII
        if (/^tal\d+/i.test(parts[0]) && parts.length === 1 && parts[0].includes('-')) {
          const after = parts[0].split('-').slice(1).join('-');
          normalized.firstName = after;
          normalized.fullName = after;
          normalized.fullNameOriginal = fullCandidates;
        } else {
          normalized.firstName = parts[0] || '';
          normalized.lastName = parts.slice(1).join(' ');
          normalized.fullName = fullCandidates;
          normalized.fullNameOriginal = fullCandidates;
        }
      }
    }
  }

  if (!normalized.fullName && (normalized.firstName || normalized.lastName)) {
    normalized.fullName = [normalized.firstName, normalized.lastName].filter(Boolean).join(' ');
  }
  // Matching uses title-case form; stored record keeps original diacritics/casing.
  normalized.nameForMatch = titleCaseForMatch(normalized.fullName || '');

  // --- Source-scoped IDs (Spec Sec. 3 step 3) ---
  normalized.talentId = findValue(record, [(c) => c === 'talentid' || c === 'autonumber']);
  // Display Name like TAL217-Name also encodes talent id.
  if (!normalized.talentId) {
    const display = findValue(record, [(c) => c === 'displayname']);
    const m = display.match(/^(TAL\d+)/i);
    if (m) normalized.talentId = m[1].toUpperCase();
  }
  normalized.profileId = findValue(record, [(c) => c === 'profileid']);

  // --- Dates for hybrid heuristic ---
  const appDateRaw = record['Application Date'] ?? record['application_date'] ??
    findValue(record, [(c) => c === 'applicationdate' || c === 'dealdealcreated' || c === 'created']);
  const modDateRaw = record['Last Modified'] ??
    findValue(record, [(c) => c === 'lastmodified' || c === 'deallastemailreceived']);
  normalized.applicationDate = excelSerialToIso(appDateRaw || record['Application Date']);
  normalized.lastModified = excelSerialToIso(modDateRaw || record['Last Modified']);
  normalized.eventDate = normalized.applicationDate || normalized.lastModified || '';

  // --- Skills (with broken-array cleanup). Languages are a separate unified field
  // (Spec table E) and must not be mixed into the skill list. ---
  const skillPreds = [
    (c: string) => c.includes('skill'),
    (c: string) =>
      ['competencies', 'competences', 'expertise', 'techstack', 'technologies',
        'specialization', 'specialisation', 'keyskills', 'softskills', 'observedstrengths']
        .includes(c),
  ];

  const skills: string[] = [];
  for (const raw of findAllValues(record, skillPreds)) {
    for (const part of parseBrokenArrayField(raw)) {
      if (!skills.includes(part)) skills.push(part);
    }
  }
  normalized.skills = skills;

  // --- Unified table fields (sections B-G of the consolidation spec) ---
  normalized.unified = mapUnifiedFields(record, parseBrokenArrayField);
  normalized.sourceDatabase = sourceDatabaseTag(normalized.sourceType);
  if (!normalized.unified.country_of_origin && normalized.countryOfOrigin) {
    normalized.unified.country_of_origin = normalized.countryOfOrigin;
  }
  if (!normalized.unified.country_of_residence && normalized.countryOfResidence) {
    normalized.unified.country_of_residence = normalized.countryOfResidence;
  }

  // Second distinct email on the same row becomes secondary_email (Spec table C).
  const allEmails: string[] = [];
  for (const raw of findAllValues(record, [(c) => c.includes('email') && !c.includes('ngo') && !c.includes('worker')])) {
    const parsed = normalizeEmailValue(raw);
    if (parsed.email && !allEmails.includes(parsed.email)) allEmails.push(parsed.email);
  }
  const secondary = allEmails.find((mail) => mail !== normalized.email);
  if (secondary) normalized.unified.secondary_email = secondary;

  // Source 2 readiness score precedent (Sec. 7) — carry forward, do not use for matching.
  const readiness = findValue(record, [
    (c) => c.includes('readiness') || c.includes('overalljob'),
  ]);
  if (readiness) normalized.readinessScore = readiness;

  // Spec Sec. 5 — junk field Deal - Title is never ingested as a signal.
  // (We simply never read it.)

  // Spec Sec. 5 — internal / test flags.
  const filterResult = applyFilters(normalized.fullName, normalized.email);
  normalized.isInternal = filterResult.isInternal;
  normalized.internalDomain = filterResult.internalDomain;
  normalized.isTestRow = filterResult.isTestRow;
  normalized.testReason = filterResult.testReason;

  // Source 2 is name-only enrichment — never seeds a new person node.
  normalized.isEnrichmentOnly = normalized.sourceType === 2 ||
    (!normalized.email && !normalized.phone && !normalized.talentId && !normalized.profileId &&
      !!normalized.fullName);

  // Multi-email rows escalate to manual review rather than silent pick.
  if (normalized.multiEmail) {
    normalized.isTestRow = false;
    normalized.needsManualFlag = true;
    normalized.manualFlagReason = `Multiple emails in one cell ("${normalized.rawMultiEmail}") — flagged per Spec Sec. 4`;
  }

  return normalized;
}

import { applyFilters } from './filters.ts';

// Strip spaces/underscores/dashes so "First Name", "first_name", "FirstName"
// all compare equal.
const cleanKey = (key: string): string => key.toLowerCase().replace(/[\s_-]/g, '');

const toString = (val: unknown): string => {
  if (val === null || val === undefined) return '';
  return String(val);
};

// deno-lint-ignore no-explicit-any
export function normalizeRecord(record: Record<string, any>): any {
  // deno-lint-ignore no-explicit-any
  const normalized: any = { original: record };

  // Find email field
  const emailFields = ['email', 'emailaddress', 'contactemail', 'workemail', 'primaryemail', 'e-mail'];
  for (const key of Object.keys(record)) {
    const cleaned = cleanKey(key);
    if (emailFields.some((ef) => cleaned.includes(cleanKey(ef)))) {
      normalized.email = toString(record[key]);
      break;
    }
  }

  // Find phone field
  const phoneFields = ['phone', 'mobile', 'telephone', 'phonenumber', 'phonemobile', 'contactphone'];
  for (const key of Object.keys(record)) {
    const cleaned = cleanKey(key);
    if (phoneFields.some((pf) => cleaned.includes(cleanKey(pf)))) {
      normalized.phone = toString(record[key]);
      break;
    }
  }

  // Find name fields
  const firstNameFields = ['firstname', 'first', 'givenname'];
  const lastNameFields = ['lastname', 'last', 'surname', 'familyname'];
  const fullNameFields = ['fullname', 'name', 'attendeename', 'participantname'];

  for (const key of Object.keys(record)) {
    const cleaned = cleanKey(key);
    if (firstNameFields.includes(cleaned)) {
      normalized.firstName = toString(record[key]);
    }
    if (lastNameFields.includes(cleaned)) {
      normalized.lastName = toString(record[key]);
    }
    if (fullNameFields.includes(cleaned)) {
      normalized.fullName = toString(record[key]);
    }
  }

  // Some sources store the full name as "Last, First". Detect that and
  // split it so first/last name columns come out right in the final table.
  if (normalized.fullName && normalized.fullName.includes(',') && !normalized.firstName && !normalized.lastName) {
    const [last, first] = normalized.fullName.split(',').map((part: string) => part.trim());
    if (last && first) {
      normalized.lastName = last;
      normalized.firstName = first;
      normalized.fullName = `${first} ${last}`;
    }
  }

  // Fill in whichever of firstName/lastName/fullName is missing from the others.
  if (!normalized.fullName && (normalized.firstName || normalized.lastName)) {
    normalized.fullName = [normalized.firstName, normalized.lastName].filter(Boolean).join(' ');
  }
  if (normalized.fullName && !normalized.firstName && !normalized.lastName) {
    const parts = normalized.fullName.trim().split(/\s+/);
    normalized.firstName = parts[0] || '';
    normalized.lastName = parts.slice(1).join(' ');
  }

  // Find skills fields. Any header containing "skill" counts, plus a list of
  // common synonyms, and every match is merged so sources that split skills
  // across several columns still come through.
  const skillsSynonyms = [
    'competencies',
    'competences',
    'expertise',
    'techstack',
    'technologies',
    'specialization',
    'specialisation',
    'навыки',
    'скиллы',
  ];
  const skills: string[] = [];
  for (const key of Object.keys(record)) {
    const cleaned = cleanKey(key);
    const isSkillsColumn = cleaned.includes('skill') || skillsSynonyms.includes(cleaned);
    if (!isSkillsColumn) continue;

    toString(record[key])
      .split(/[,;|\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((skill) => {
        if (!skills.includes(skill)) skills.push(skill);
      });
  }
  normalized.skills = skills;

  // Flag internal/staff accounts and obvious test/placeholder rows.
  // Internal accounts are routed to a separate bucket (not discarded).
  // Test rows are flagged for manual confirmation, not auto-excluded.
  const filterResult = applyFilters(normalized.fullName, normalized.email);
  normalized.isInternal = filterResult.isInternal;
  normalized.internalDomain = filterResult.internalDomain;
  normalized.isTestRow = filterResult.isTestRow;
  normalized.testReason = filterResult.testReason;

  return normalized;
}

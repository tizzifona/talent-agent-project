// Domains considered "internal" (staff/company accounts).
// Add more domains here as they're found during review.
export const INTERNAL_EMAIL_DOMAINS = [
  'bluehope.ai',
  'work-well.org',
  'campground.fyi',
];

export interface FilterResult {
  isInternal: boolean;
  internalDomain?: string;
  isTestRow: boolean;
  testReason?: string;
}

function getEmailDomain(email?: string): string {
  if (!email) return '';
  const parts = email.toLowerCase().trim().split('@');
  return parts.length === 2 ? parts[1] : '';
}

export function isInternalEmail(email?: string): { isInternal: boolean; domain?: string } {
  const domain = getEmailDomain(email);
  if (!domain) return { isInternal: false };

  const match = INTERNAL_EMAIL_DOMAINS.find((blocked) => domain === blocked.toLowerCase());
  return match ? { isInternal: true, domain: match } : { isInternal: false };
}

// Conservative test/placeholder detection: only flags very obvious cases
// to avoid false positives on real records. Meant for manual confirmation,
// not automatic exclusion.
export function checkTestPatterns(name?: string, email?: string): { isTestRow: boolean; reason?: string } {
  const trimmedName = (name || '').trim();
  const trimmedEmail = (email || '').trim().toLowerCase();
  const emailLocalPart = trimmedEmail.split('@')[0] || '';

  if (trimmedName && /^test\d*$/i.test(trimmedName)) {
    return { isTestRow: true, reason: `Name looks like a test placeholder ("${trimmedName}")` };
  }

  if (trimmedName.replace(/\s/g, '').length === 1) {
    return { isTestRow: true, reason: `Name is a single character ("${trimmedName}")` };
  }

  if (/^test\d*@test(ing)?\.(com|org|net)$/i.test(trimmedEmail)) {
    return { isTestRow: true, reason: `Email looks like a test placeholder ("${trimmedEmail}")` };
  }

  if (/^test\d*$/i.test(emailLocalPart)) {
    return { isTestRow: true, reason: `Email local part looks like a test placeholder ("${trimmedEmail}")` };
  }

  return { isTestRow: false };
}

export function applyFilters(name?: string, email?: string): FilterResult {
  const internal = isInternalEmail(email);
  const test = checkTestPatterns(name, email);

  return {
    isInternal: internal.isInternal,
    internalDomain: internal.domain,
    isTestRow: test.isTestRow,
    testReason: test.reason,
  };
}

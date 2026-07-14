interface DatabaseRecord {
  email?: string;
  phone?: string;
  [key: string]: unknown;
}

interface MatchedPerson {
  id: string;
  records: DatabaseRecord[];
  primaryEmail?: string;
  primaryPhone?: string;
  primaryName?: string;
  matchType: string;
  confidence: number;
  provenance: string[];
}

interface MatchingResults {
  persons: MatchedPerson[];
  [key: string]: unknown;
}

export function exportResults(matchingResults: MatchingResults): string {
  const headers = [
    'Person ID',
    'Primary Name',
    'Primary Email',
    'Primary Phone',
    'Match Type',
    'Confidence',
    'Record Count',
    'Provenance (Sources)',
    'All Emails',
    'All Phones'
  ];

  const rows: string[] = [headers.join(',')];

  for (const person of matchingResults.persons) {
    const allEmails = new Set<string>();
    const allPhones = new Set<string>();

    person.records.forEach((record: DatabaseRecord) => {
      if (record.email) allEmails.add(record.email);
      if (record.phone) allPhones.add(record.phone);
    });

    const row = [
      person.id,
      `"${person.primaryName || ''}"`,
      person.primaryEmail || '',
      person.primaryPhone || '',
      person.matchType,
      person.confidence.toString(),
      person.records.length.toString(),
      `"${person.provenance.join('; ')}"`,
      `"${Array.from(allEmails).join('; ')}"`,
      `"${Array.from(allPhones).join('; ')}"`,
    ];

    rows.push(row.join(','));
  }

  return rows.join('\n');
}

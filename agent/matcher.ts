interface DatabaseRecord {
  sourceDb: string;
  rowIndex: number;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  skills?: string[];
  isInternal?: boolean;
  internalDomain?: string;
  isTestRow?: boolean;
  testReason?: string;
  original?: Record<string, string>;
}

interface MatchedPerson {
  id: string;
  records: DatabaseRecord[];
  primaryEmail?: string;
  primaryPhone?: string;
  primaryName?: string;
  primaryFirstName?: string;
  primaryLastName?: string;
  skills?: string[];
  matchType: 'email' | 'phone' | 'fuzzy-name' | 'manual-review' | 'no-match';
  confidence: number;
  provenance: string[];
  needsReview: boolean;
  reviewReason?: string;
}

interface MatchingSettings {
  emailPriority: number;
  phonePriority: number;
  fuzzyThreshold: number;
  autoMerge: string;
}

function normalizeEmail(email?: string | number): string {
  if (!email) return '';
  // Convert to string first (just in case)
  return String(email).toLowerCase().trim();
}

function normalizePhone(phone?: string | number): string {
  if (!phone) return '';
  // Convert to string first (Excel may return numbers)
  const phoneStr = String(phone);
  // Remove all non-digit characters
  return phoneStr.replace(/\D/g, '');
}

function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
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
  const distance = levenshteinDistance(n1, n2);
  const similarity = ((maxLen - distance) / maxLen) * 100;
  
  return Math.round(similarity);
}

function getFullName(record: DatabaseRecord): string {
  if (record.fullName) return record.fullName;
  const parts = [record.firstName, record.lastName].filter(Boolean);
  return parts.join(' ');
}

function collectSkills(records: DatabaseRecord[]): string[] {
  const skills = new Set<string>();
  for (const record of records) {
    (record.skills || []).forEach((skill) => {
      if (skill) skills.add(skill);
    });
  }
  return Array.from(skills);
}

// A test-suspect row is never auto-excluded; it just needs a human to confirm
// before permanent exclusion. This checks a whole matched group of records.
function getTestRowReview(records: DatabaseRecord[]): { needsReview: boolean; reviewReason?: string } {
  const testRecord = records.find((r) => r.isTestRow);
  if (!testRecord) return { needsReview: false };
  return {
    needsReview: true,
    reviewReason: testRecord.testReason || 'Possible test/placeholder row',
  };
}

// The first record of a group may be missing fields the others have, so each
// primary value falls back to the first record that actually has one.
function firstNonEmpty(records: DatabaseRecord[], pick: (r: DatabaseRecord) => string): string {
  for (const record of records) {
    const value = pick(record);
    if (value) return value;
  }
  return '';
}

function buildPersonBase(records: DatabaseRecord[]) {
  const testReview = getTestRowReview(records);
  return {
    primaryName: firstNonEmpty(records, (r) => getFullName(r)),
    primaryFirstName: firstNonEmpty(records, (r) => r.firstName || ''),
    primaryLastName: firstNonEmpty(records, (r) => r.lastName || ''),
    primaryEmail: firstNonEmpty(records, (r) => normalizeEmail(r.email)),
    primaryPhone: firstNonEmpty(records, (r) => normalizePhone(r.phone)),
    skills: collectSkills(records),
    needsReview: testReview.needsReview,
    reviewReason: testReview.reviewReason,
  };
}

interface LoadedDatabase {
  records: DatabaseRecord[];
}

interface LoadedData {
  databases: LoadedDatabase[];
}

export function runMatching(loadedData: LoadedData, settings: MatchingSettings) {
  console.log('Starting matching with settings:', settings);

  const allLoadedRecords: DatabaseRecord[] = loadedData.databases.flatMap((db) => db.records);

  // Staff/internal accounts are pulled out before matching and routed to a
  // separate audit bucket instead of being discarded or merged in.
  const internalRecords = allLoadedRecords.filter((r) => r.isInternal);
  const allRecords = allLoadedRecords.filter((r) => !r.isInternal);

  const internalAccounts = internalRecords.map((r) => ({
    sourceDb: r.sourceDb,
    rowIndex: r.rowIndex,
    name: getFullName(r),
    email: r.email || '',
    phone: r.phone || '',
    internalDomain: r.internalDomain || '',
  }));

  const matchedPersons: MatchedPerson[] = [];
  const processedRecords = new Set<string>();
  
  let emailMatches = 0;
  let phoneMatches = 0;
  let fuzzyMatches = 0;
  let manualReview = 0;
  let heldOut = 0;

  // Phase 1: Exact Email Matching (Priority 1)
  console.log('Phase 1: Email matching...');
  const emailGroups = new Map<string, DatabaseRecord[]>();
  
  for (const record of allRecords) {
    const email = normalizeEmail(record.email);
    if (!email) continue;
    
    if (!emailGroups.has(email)) {
      emailGroups.set(email, []);
    }
    emailGroups.get(email)!.push(record);
  }

  for (const [email, records] of emailGroups) {
    if (records.length > 1) {
      const person: MatchedPerson = {
        id: `email-${matchedPersons.length + 1}`,
        records,
        ...buildPersonBase(records),
        primaryEmail: email,
        matchType: 'email',
        confidence: 100,
        provenance: records.map(r => `${r.sourceDb}:${r.rowIndex}`),
      };
      
      matchedPersons.push(person);
      records.forEach(r => processedRecords.add(`${r.sourceDb}:${r.rowIndex}`));
      emailMatches += records.length - 1;
    }
  }

  // Phase 2: Exact Phone Matching (Priority 2)
  console.log('Phase 2: Phone matching...');
  const phoneGroups = new Map<string, DatabaseRecord[]>();
  
  for (const record of allRecords) {
    const recordKey = `${record.sourceDb}:${record.rowIndex}`;
    if (processedRecords.has(recordKey)) continue;
    
    const phone = normalizePhone(record.phone);
    if (!phone || phone.length < 10) continue;
    
    if (!phoneGroups.has(phone)) {
      phoneGroups.set(phone, []);
    }
    phoneGroups.get(phone)!.push(record);
  }

  for (const [phone, records] of phoneGroups) {
    if (records.length > 1) {
      const person: MatchedPerson = {
        id: `phone-${matchedPersons.length + 1}`,
        records,
        ...buildPersonBase(records),
        primaryPhone: phone,
        matchType: 'phone',
        confidence: 95,
        provenance: records.map(r => `${r.sourceDb}:${r.rowIndex}`),
      };
      
      matchedPersons.push(person);
      records.forEach(r => processedRecords.add(`${r.sourceDb}:${r.rowIndex}`));
      phoneMatches += records.length - 1;
    }
  }

  // Phase 3: Fuzzy Name Matching
  console.log('Phase 3: Fuzzy name matching...');
  const remainingRecords = allRecords.filter(r => 
    !processedRecords.has(`${r.sourceDb}:${r.rowIndex}`)
  );

  for (let i = 0; i < remainingRecords.length; i++) {
    const record1 = remainingRecords[i];
    const recordKey1 = `${record1.sourceDb}:${record1.rowIndex}`;
    
    if (processedRecords.has(recordKey1)) continue;
    
    const name1 = getFullName(record1);
    if (!name1) continue;
    
    const matchGroup: DatabaseRecord[] = [record1];
    
    for (let j = i + 1; j < remainingRecords.length; j++) {
      const record2 = remainingRecords[j];
      const recordKey2 = `${record2.sourceDb}:${record2.rowIndex}`;
      
      if (processedRecords.has(recordKey2)) continue;
      
      const name2 = getFullName(record2);
      if (!name2) continue;
      
      const similarity = calculateNameSimilarity(name1, name2);
      
      if (similarity >= settings.fuzzyThreshold) {
        matchGroup.push(record2);
        processedRecords.add(recordKey2);
      }
    }
    
    if (matchGroup.length > 1) {
      const confidence = Math.round((settings.fuzzyThreshold / 100) * 90);
      const matchType = confidence >= 80 ? 'fuzzy-name' : 'manual-review';
      
      const personBase = buildPersonBase(matchGroup);
      const person: MatchedPerson = {
        id: `fuzzy-${matchedPersons.length + 1}`,
        records: matchGroup,
        ...personBase,
        matchType,
        confidence,
        provenance: matchGroup.map(r => `${r.sourceDb}:${r.rowIndex}`),
        needsReview: personBase.needsReview || matchType === 'manual-review',
        reviewReason: personBase.reviewReason ||
          (matchType === 'manual-review' ? 'Fuzzy name match below auto-merge confidence' : undefined),
      };
      
      matchedPersons.push(person);
      processedRecords.add(recordKey1);
      
      if (matchType === 'fuzzy-name') {
        fuzzyMatches += matchGroup.length - 1;
      } else {
        manualReview += matchGroup.length - 1;
      }
    }
  }

  // Phase 4: Held Out (No Match)
  console.log('Phase 4: Processing held out records...');
  for (const record of allRecords) {
    const recordKey = `${record.sourceDb}:${record.rowIndex}`;
    if (!processedRecords.has(recordKey)) {
      const person: MatchedPerson = {
        id: `single-${matchedPersons.length + 1}`,
        records: [record],
        ...buildPersonBase([record]),
        matchType: 'no-match',
        confidence: 100,
        provenance: [`${record.sourceDb}:${record.rowIndex}`],
      };
      
      matchedPersons.push(person);
      heldOut++;
    }
  }

  const needsReviewCount = matchedPersons.filter((p) => p.needsReview).length;

  const results = {
    totalRecords: allLoadedRecords.length,
    uniquePersons: matchedPersons.length,
    emailMatches,
    phoneMatches,
    fuzzyMatches,
    manualReview,
    needsReviewCount,
    heldOut,
    persons: matchedPersons,
    internalAccounts,
    internalCount: internalAccounts.length,
    settings,
    processedAt: new Date().toISOString()
  };

  console.log('Matching complete:', {
    totalRecords: results.totalRecords,
    uniquePersons: results.uniquePersons,
    emailMatches,
    phoneMatches,
    fuzzyMatches,
    manualReview,
    needsReviewCount,
    heldOut,
    internalCount: results.internalCount
  });

  return results;
}
